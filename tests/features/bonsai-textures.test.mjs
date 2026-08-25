// Bonsai City micro-voxel texture atlas contract: one deterministic,
// power-of-two, MIT-clean 512x512 PNG of 64px Minecraft-style tiles, a JSON
// manifest mapping block materials to per-face tile rects, and a generated
// runtime manifest the voxel renderer reads.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

// A written PNG is not sufficient: every tile must render measurable
// non-transparent coverage on a magenta backdrop.
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
    if (changed < 24) emptyTiles.push(id);
  }
  test.assert(emptyTiles.length === 0, `every texture tile renders measurable coverage${emptyTiles.length ? ` (empty: ${emptyTiles.join(", ")})` : ""}`);
}

const notes = JSON.stringify(manifest.notes).toLowerCase();
test.assertIncludes(notes, "no pixels copied", "texture provenance states the no-copy boundary");
test.assertIncludes(notes, "no network path", "texture provenance states the offline generation boundary");
test.assertIncludes(notes, "power of two", "texture provenance records the Retina/mobile sizing decision");
test.assertIncludes(read("tooling/build-bonsai-texture-atlas.mjs"), "snow(buffer, ox, oy, recipe)", "the texture atlas paints the snow tile");
test.assertIncludes(read("tooling/build-bonsai-texture-atlas.mjs"), "Zen garden corner", "the park tile carries a quiet zen garden detail");
test.assert(digest(readFileSync(resolveProjectPath(manifest.png.file))) === manifest.png.sha256, "the PNG digest in the manifest matches the shipped file");

test.finish();
