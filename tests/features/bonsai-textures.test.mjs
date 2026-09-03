// Bonsai City micro-voxel texture atlas contract: one deterministic,
// power-of-two, MIT-clean 512x512 PNG of 64px Minecraft-style tiles, a JSON
// manifest mapping block materials to per-face tile rects, and a generated
// runtime manifest the voxel renderer reads.
//
// Wall tiles are tint-neutral with a glass mask in alpha: the renderer
// multiplies a per-building instance colour into the wall and lights the
// alpha-0 glass cells with a shader uniform, so a wall tile may carry pattern
// and shading but no hue, and `.night` walls equal their `.day` twins.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import vm from "node:vm";
import { createCanvas, loadImage } from "canvas";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-textures");
const trackedArtifacts = [
  resolveProjectPath("assets/bonsai/textures.png"),
  resolveProjectPath("assets/bonsai/textures.json"),
  resolveProjectPath("app/generated/bonsai-textures.js"),
];

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = new Map(trackedArtifacts.map((file) => [file, digest(readFileSync(file))]));
execFileSync(process.execPath, [resolveProjectPath("tooling/build-bonsai-texture-atlas.mjs")], {
  cwd: resolveProjectPath("."),
  stdio: "pipe",
});
const after = new Map(trackedArtifacts.map((file) => [file, digest(readFileSync(file))]));
test.assert([...before].every(([file, hash]) => after.get(file) === hash), "a rebuild is byte-for-byte deterministic across PNG, manifest, and runtime JS");

const context = vm.createContext({ window: {} });
vm.runInContext(read("app/generated/bonsai-textures.js"), context);
const manifest = context.window.AISystem6BonsaiTextures;
const json = JSON.parse(read("assets/bonsai/textures.json"));
const source = JSON.parse(read("assets/bonsai/atlas-source.json"));

test.assert(manifest.schema === "ai-system-6-bonsai-textures-v1" && manifest.version === 1, "runtime manifest uses the textures v1 schema");
test.assert(JSON.stringify(manifest) === JSON.stringify(json), "generated runtime manifest exactly matches the reviewable JSON");
test.assert(manifest.tileSize === 64, "texture tiles are 64px so details survive Retina close-ups");
test.assert(manifest.atlas.width === manifest.atlas.height && manifest.atlas.width >= 256 && (manifest.atlas.width & (manifest.atlas.width - 1)) === 0, "the atlas is a power-of-two square for mipmapped mobile GPUs");
test.assert(Object.keys(manifest.tiles).length >= 30 && Object.keys(manifest.tiles).length <= manifest.atlas.columns * manifest.atlas.rows, "the tile family is a full batch within the atlas grid");
test.assert(manifest.license === "MIT" && manifest.source === "original", "the texture family carries the MIT original-art boundary");
test.assert(Array.isArray(source.textures) && Array.isArray(source.textureMaterials) === false, "texture recipes live in the checked-in atlas source");

// Every material must resolve: each face name points at a tile that exists
// and lies fully inside the atlas.
const materialFailures = [];
for (const [materialId, faces] of Object.entries(manifest.materials)) {
  for (const face of [faces.top, faces.side]) {
    const rect = manifest.tiles[face];
    if (!rect) {
      materialFailures.push(`${materialId}:${face}`);
      continue;
    }
    const valid = Number.isInteger(rect.x) && Number.isInteger(rect.y)
      && Number.isInteger(rect.w) && Number.isInteger(rect.h)
      && rect.x >= 0 && rect.y >= 0
      && rect.x + rect.w <= manifest.atlas.width
      && rect.y + rect.h <= manifest.atlas.height;
    if (!valid) materialFailures.push(`${materialId}:${face}:bounds`);
  }
}
test.assert(materialFailures.length === 0, "every material face resolves to an in-bounds tile rect");

// The wall tiles are the recipes that use the wall painter. The set is pinned
// so a renamed or dropped night twin fails here, not in the renderer.
const TILE = manifest.tileSize;
const wallIds = source.textures.filter((recipe) => recipe.pattern === "wall").map((recipe) => recipe.id);
const expectedWallIds = ["wall.r.day", "wall.r.night", "wall.c.day", "wall.c.night", "wall.i.day", "wall.i.night", "facility.school"];
test.assert(expectedWallIds.every((id) => wallIds.includes(id)) && wallIds.length === expectedWallIds.length, "the seven wall tiles (three zones x day/night, plus the school) use the wall painter");

// Raw RGBA decode of the atlas PNG. A canvas un-premultiplies alpha, so an
// alpha-0 glass pixel reads back as RGB 0 through getImageData; the glass
// luminance pattern is only visible in the PNG bytes themselves. The builder
// writes filter 0 on every row, which keeps this decoder tiny.
function decodeAtlasPng(bytes) {
  test.assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "the atlas file carries the PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      test.assert(data[8] === 8 && data[9] === 6, "the atlas is 8-bit RGBA so the alpha channel can carry the glass mask");
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(width * height * 4);
  let unfiltered = true;
  for (let y = 0; y < height; y += 1) {
    if (raw[y * stride] !== 0) unfiltered = false;
    raw.copy(pixels, y * width * 4, y * stride + 1, (y + 1) * stride);
  }
  test.assert(unfiltered, "every atlas scanline uses PNG filter 0, so the bytes are the pixels");
  return { width, height, pixels };
}

const atlas = decodeAtlasPng(readFileSync(resolveProjectPath(manifest.png.file)));
test.assert(atlas.width === manifest.atlas.width && atlas.height === manifest.atlas.height, "the PNG header matches the manifest atlas size");

function tilePixels(id) {
  const rect = manifest.tiles[id];
  const out = Buffer.alloc(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    const from = ((rect.y + y) * atlas.width + rect.x) * 4;
    atlas.pixels.copy(out, y * rect.w * 4, from, from + rect.w * 4);
  }
  return out;
}

function countAlphaZero(pixels) {
  let count = 0;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] === 0) count += 1;
  return count;
}

// A written PNG is not sufficient: every tile must render measurable
// non-transparent coverage on a magenta backdrop through a real decoder. In a
// wall tile the pixels that show magenta are the intentional glass mask, so
// they count as coverage too; the mask itself is measured below.
{
  const image = await loadImage(readFileSync(resolveProjectPath(manifest.png.file)));
  const canvas = createCanvas(manifest.tileSize, manifest.tileSize);
  const context2d = canvas.getContext("2d");
  context2d.imageSmoothingEnabled = false;
  const emptyTiles = [];
  for (const [id, rect] of Object.entries(manifest.tiles)) {
    context2d.clearRect(0, 0, canvas.width, canvas.height);
    context2d.fillStyle = "#ff00ff";
    context2d.fillRect(0, 0, canvas.width, canvas.height);
    context2d.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const pixels = context2d.getImageData(0, 0, rect.w, rect.h).data;
    let changed = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 255 || pixels[index + 1] !== 0 || pixels[index + 2] !== 255) changed += 1;
    }
    const covered = changed + (wallIds.includes(id) ? countAlphaZero(tilePixels(id)) : 0);
    if (covered < 24) emptyTiles.push(id);
  }
  test.assert(emptyTiles.length === 0, `every texture tile renders measurable coverage${emptyTiles.length ? ` (empty: ${emptyTiles.join(", ")})` : ""}`);
}

// Every non-wall tile is a plain opaque surface: no alpha-0 pixel anywhere,
// or the shader would read it as glass.
{
  const leaking = Object.keys(manifest.tiles).filter((id) => !wallIds.includes(id) && countAlphaZero(tilePixels(id)) > 0);
  test.assert(leaking.length === 0, `no non-wall tile carries an alpha-0 pixel${leaking.length ? ` (found: ${leaking.join(", ")})` : ""}`);
}

// Wall tiles: glass mask, tint neutrality, band alignment, and luminance-only
// glass. The renderer crops a side face to the top k/rows of the tile, so a
// glass pixel must sit strictly inside its band: never on the band's first
// or last row, and never on a row that straddles a fractional band edge
// (with 3 rows a band is 21.33 px, so rows 21 and 42 belong to no band).
{
  const failures = [];
  for (const id of wallIds) {
    const recipe = source.textures.find((entry) => entry.id === id);
    const rows = Number(recipe.rows) || 3;
    const pixels = tilePixels(id);
    const glass = countAlphaZero(pixels);
    const fraction = glass / (TILE * TILE);
    if (fraction < 0.05 || fraction > 0.45) failures.push(`${id}: glass fraction ${fraction.toFixed(3)} outside 0.05..0.45`);
    let maxSpread = 0;
    let partialAlpha = 0;
    let bandEdgeGlass = 0;
    let tintedGlass = 0;
    let highlightRows = 0;
    let frameInk = 0;
    let sillInk = 0;
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        const offset = (y * TILE + x) * 4;
        const [r, g, b, a] = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
        if (a === 0) {
          const band = Math.floor((y * rows) / TILE);
          const start = Math.ceil((band * TILE) / rows);
          const end = Math.floor(((band + 1) * TILE) / rows);
          if (y < start + 1 || y > end - 2) bandEdgeGlass += 1;
          if (r !== g || g !== b) tintedGlass += 1;
          if (r === 255) highlightRows += 1;
        } else if (a === 255) {
          maxSpread = Math.max(maxSpread, Math.max(r, g, b) - Math.min(r, g, b));
          if (r === 96 && g === 94 && b === 90) frameInk += 1;
          if (r === 232 && g === 230 && b === 226) sillInk += 1;
        } else {
          partialAlpha += 1;
        }
      }
    }
    if (maxSpread > 14) failures.push(`${id}: opaque pixel channel spread ${maxSpread} > 14`);
    if (partialAlpha > 0) failures.push(`${id}: ${partialAlpha} pixels with partial alpha`);
    if (bandEdgeGlass > 0) failures.push(`${id}: ${bandEdgeGlass} glass pixels on or across a band edge`);
    if (tintedGlass > 0) failures.push(`${id}: ${tintedGlass} glass pixels are not luminance-only`);
    if (highlightRows === 0) failures.push(`${id}: no white highlight row in the glass`);
    if (frameInk === 0) failures.push(`${id}: no window-frame ink`);
    if (sillInk === 0) failures.push(`${id}: no sill ink under the panes`);
  }
  test.assert(failures.length === 0, `wall tiles are tint-neutral with a band-aligned glass mask${failures.length ? ` (${failures.join("; ")})` : ""}`);
}

// Night is a shader uniform now, so the atlas has one wall per zone painted
// twice under two ids the renderer still names.
{
  const drifting = ["r", "c", "i"].filter((zone) => !tilePixels(`wall.${zone}.day`).equals(tilePixels(`wall.${zone}.night`)));
  test.assert(drifting.length === 0, `every .night wall tile is pixel-identical to its .day twin${drifting.length ? ` (drift: ${drifting.join(", ")})` : ""}`);
}

// The renderer builds its own deck on top of a wall block, so the wall
// materials' top face is plain concrete and a neutral roof.deck tile exists.
{
  const wallMaterials = ["wall.r.day", "wall.r.night", "wall.c.day", "wall.c.night", "wall.i.day", "wall.i.night"];
  test.assert(wallMaterials.every((id) => manifest.materials[id] && manifest.materials[id].top === "concrete"), "the six wall materials' top face is concrete");
  test.assert(Boolean(manifest.tiles["roof.deck"]), "the roof.deck tile exists in the atlas");
  const deck = manifest.materials["roof.deck"];
  test.assert(Boolean(deck) && deck.top === "roof.deck" && deck.side === "concrete", "the roof.deck material is a deck top on concrete sides");
  const pixels = tilePixels("roof.deck");
  let maxSpread = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const [r, g, b] = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    maxSpread = Math.max(maxSpread, Math.max(r, g, b) - Math.min(r, g, b));
  }
  test.assert(maxSpread <= 14, "the roof.deck tile is a neutral grey the renderer can tint");
}

const notes = JSON.stringify(manifest.notes).toLowerCase();
test.assertIncludes(notes, "no pixels copied", "texture provenance states the no-copy boundary");
test.assertIncludes(notes, "no network path", "texture provenance states the offline generation boundary");
test.assertIncludes(notes, "power of two", "texture provenance records the Retina/mobile sizing decision");
test.assertIncludes(notes, "tint-neutral", "texture provenance records the tint-neutral wall and glass-mask decision");
test.assertIncludes(read("tooling/build-bonsai-texture-atlas.mjs"), "snow(buffer, ox, oy, recipe)", "the texture atlas paints the snow tile");
test.assertIncludes(read("tooling/build-bonsai-texture-atlas.mjs"), "Zen garden corner", "the park tile carries a quiet zen garden detail");
test.assertIncludes(read("tooling/build-bonsai-texture-atlas.mjs"), "deck(buffer, ox, oy)", "the texture atlas paints the roof deck tile");
test.assert(digest(readFileSync(resolveProjectPath(manifest.png.file))) === manifest.png.sha256, "the PNG digest in the manifest matches the shipped file");

test.finish();
