// Bonsai City atlas contract: four deterministic, original, MIT-clean
// directional PNG atlases generated from checked-in micro-voxel JSON.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createCanvas, loadImage } from "canvas";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-atlas");
const directions = ["north", "east", "south", "west"];
const trackedArtifacts = [
  ...directions.map((direction) => resolveProjectPath(`assets/bonsai/atlas-${direction}.png`)),
  resolveProjectPath("assets/bonsai/atlas.png"),
  resolveProjectPath("assets/bonsai/atlas-metadata.json"),
  resolveProjectPath("assets/bonsai/provenance.json"),
  resolveProjectPath("app/generated/bonsai-atlas.js"),
];

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = new Map(trackedArtifacts.map((file) => [file, digest(readFileSync(file))]));
execFileSync(process.execPath, [resolveProjectPath("tooling/build-bonsai-atlas.mjs")], {
  cwd: resolveProjectPath("."),
  stdio: "pipe",
});
const after = new Map(trackedArtifacts.map((file) => [file, digest(readFileSync(file))]));
test.assert([...before].every(([file, hash]) => after.get(file) === hash), "a rebuild is byte-for-byte deterministic across PNG, metadata, provenance, and runtime JS");

const context = vm.createContext({ window: {} });
vm.runInContext(read("app/generated/bonsai-atlas.js"), context);
const atlas = context.window.AISystem6BonsaiAtlas;
const metadata = JSON.parse(read("assets/bonsai/atlas-metadata.json"));
const provenance = JSON.parse(read("assets/bonsai/provenance.json"));
const source = JSON.parse(read("assets/bonsai/atlas-source.json"));

test.assert(atlas.schema === "ai-system-6-bonsai-atlas-v2" && atlas.version === 2, "runtime metadata uses the Canvas atlas v2 schema");
test.assert(atlas.geometry.tileWidth === 48 && atlas.geometry.tileHeight === 24, "atlas geometry matches the 48x24 renderer contract");
test.assert(atlas.geometry.heightStep === 8, "atlas metadata carries the eight-pixel height step");
test.assert(JSON.stringify(atlas) === JSON.stringify(metadata), "generated runtime metadata exactly matches the reviewable JSON metadata");
test.assert(source.schema === "ai-system-6-bonsai-micro-voxel-source-v2", "art originates in the checked-in micro-voxel JSON schema");
test.assert(source.license === "MIT" && source.source === "original", "the source recipes carry the MIT original-art boundary");

const imageHashes = new Set();
for (const direction of directions) {
  const descriptor = atlas.directions[direction];
  const bytes = readFileSync(resolveProjectPath(descriptor.file));
  test.assert(descriptor.url === `/assets/bonsai/atlas-${direction}.png`, `${direction} atlas uses the stable runtime URL`);
  test.assert(digest(bytes) === descriptor.sha256, `${direction} atlas hash matches metadata`);
  imageHashes.add(descriptor.sha256);
  const image = await loadImage(bytes);
  test.assert(image.width === atlas.atlas.width && image.height === atlas.atlas.height, `${direction} PNG dimensions match metadata`);
}
test.assert(imageHashes.size === 4, "the four direction atlases contain deliberate direction-specific pixels");
test.assert(digest(readFileSync(resolveProjectPath("assets/bonsai/atlas.png"))) === atlas.directions.north.sha256, "the legacy atlas alias is an exact north-atlas compatibility copy");

const frames = Object.entries(atlas.frames);
test.assert(frames.length === atlas.completeness.frameCount && frames.length >= 120, "metadata indexes the complete 120-plus-frame visual set");
const frameMetadataFailures = [];
for (const [name, frame] of frames) {
  const valid = Number.isInteger(frame.x) && Number.isInteger(frame.y)
    && frame.x >= 0 && frame.y >= 0
    && frame.x + frame.w <= atlas.atlas.width
    && frame.y + frame.h <= atlas.atlas.height
    && frame.footprint.w >= 1 && frame.footprint.h >= 1
    && Number.isInteger(frame.anchor.x) && Number.isInteger(frame.anchor.y)
    && Number.isFinite(frame.height) && typeof frame.state === "string"
    && Object.prototype.hasOwnProperty.call(frame, "animation") && Number.isInteger(frame.variant)
    && frame.license === "MIT" && frame.source === "original";
  if (!valid) frameMetadataFailures.push(name);
}
test.assert(frameMetadataFailures.length === 0, "every frame has in-bounds geometry, footprint, anchor, height, state, animation, variant, and provenance metadata");

for (const prefix of ["r", "c", "i"]) {
  for (let stage = 1; stage <= 3; stage += 1) {
    const variants = frames.filter(([name, frame]) => name.startsWith(`building.${prefix}.${stage}.`) && frame.state === "normal");
    test.assert(variants.length >= 3, `${prefix.toUpperCase()} stage ${stage} has at least three normal building variants`);
  }
}
for (const stateName of ["foundation", "construction", "normal", "declined", "abandoned", "recovering"]) {
  test.assert(atlas.completeness.buildingStates.includes(stateName), `building completeness includes the ${stateName} state`);
}
// Counted, not pinned. The night family grows whenever catalog art does, and a
// magic number turns that growth into a failing test instead of a covered one:
// the count reached 124 while this line still said 88. What matters is that
// every frame with a night variant actually has one.
const nightFrames = frames.filter(([name]) => name.endsWith(".night") || /\.night\./.test(name));
test.assert(
  atlas.completeness.nightFrames === nightFrames.length,
  `the night family count matches the frames that carry it (${nightFrames.length})`,
);
test.assert(atlas.completeness.nightFrames >= 88, "the night family never shrinks below the growable, facility and special set it started from");
test.assert(atlas.completeness.buildingStates.includes("night"), "the night frame state is part of building completeness");
test.assert(Boolean(atlas.frames["terrain.snow"]), "the atlas includes the snow-capped terrain frame");
test.assert(Boolean(atlas.frames["tree.maple"]), "the atlas includes the red maple tree frame");
test.assert(Boolean(atlas.frames["tree.blossom"]), "the atlas includes the sakura blossom tree frame");
test.assert(Boolean(atlas.frames["tree.winter"]), "the atlas includes the winter tree frame");
test.assertIncludes(read("tooling/build-bonsai-atlas.mjs"), "function drawTorii", "the atlas painter draws the water-edge torii");
test.assertIncludes(read("tooling/build-bonsai-atlas.mjs"), "A power pole with a crossarm", "wire frames carry the power pole read");
for (const id of [
  "highway.mask-15", "onramp.ns", "onramp.ne", "onramp.ew", "bridge-road.mask-15",
  "bridge-rail.mask-15", "bridge-highway.mask-15",
]) {
  test.assert(Boolean(atlas.frames[id]), `atlas includes the 2D continuous-path frame ${id}`);
}
test.assertIncludes(read("tooling/build-bonsai-atlas.mjs"), "A real ramp: the wide end meets the highway", "onramp frames draw a wide-to-narrow ramp");
test.assertIncludes(read("tooling/build-bonsai-atlas.mjs"), "drawHighwayDeck", "highway frames draw the elevated deck family");
test.assertIncludes(read("tooling/build-bonsai-atlas.mjs"), "one row per carriageway", "the deck carries divided-carriageway lane markings");
test.assertIncludes(read("tooling/build-bonsai-atlas.mjs"), "Concrete parapet along every edge that does not continue", "unconnected deck edges close with a parapet");
const nightFrameIds = [
  "building.r.1.1.night", "building.c.3.4.night", "building.i.2.2.night",
  "facility.coal.night", "facility.wind.night", "facility.subway-station.night",
  "catalog.city_hall.night", "catalog.power_plant.night", "catalog.missile_silo.night",
];
for (const id of nightFrameIds) {
  test.assert(Boolean(atlas.frames[id]), `atlas includes ${id}`);
}
const nightMetadataFailures = [];
for (const [name, frame] of frames) {
  if (frame.state !== "night") continue;
  if (!Array.isArray(frame.windows) || frame.windows.length === 0) {
    nightMetadataFailures.push(`${name}:no-windows`);
    continue;
  }
  for (const win of frame.windows) {
    const valid = Number.isInteger(win.x) && Number.isInteger(win.y)
      && Number.isInteger(win.w) && Number.isInteger(win.h)
      && win.x >= 0 && win.y >= 0 && win.x + win.w <= atlas.atlas.cellWidth
      && win.y + win.h <= atlas.atlas.cellHeight;
    if (!valid) nightMetadataFailures.push(`${name}:bad-window`);
  }
}
test.assert(nightMetadataFailures.length === 0, "every night frame records in-bounds lit-window rects for the runtime glow pass");
for (const id of [
  "terrain.grass", "terrain.water", "terrain.coast", "terrain.slope",
  "road.mask-15", "rail.mask-15", "wire.mask-15", "utility.pipe",
  "facility.coal", "facility.wind", "facility.pump", "facility.tower",
  "facility.police", "facility.fire", "facility.school", "facility.clinic", "facility.station",
  "agent.car.1", "agent.pedestrian.1", "agent.train.1", "agent.service.fire", "agent.smoke.1",
]) {
  test.assert(Boolean(atlas.frames[id]), `atlas includes ${id}`);
}

// A written PNG is not sufficient: draw every frame on a magenta backdrop and
// measure non-background alpha coverage in every direction.
for (const direction of directions) {
  const image = await loadImage(readFileSync(resolveProjectPath(atlas.directions[direction].file)));
  const canvas = createCanvas(atlas.atlas.cellWidth, atlas.atlas.cellHeight);
  const context2d = canvas.getContext("2d");
  context2d.imageSmoothingEnabled = false;
  const emptyFrames = [];
  for (const [name, frame] of frames) {
    context2d.clearRect(0, 0, canvas.width, canvas.height);
    context2d.fillStyle = "#ff00ff";
    context2d.fillRect(0, 0, canvas.width, canvas.height);
    context2d.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    const pixels = context2d.getImageData(0, 0, frame.w, frame.h).data;
    let changed = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 255 || pixels[index + 1] !== 0 || pixels[index + 2] !== 255) changed += 1;
    }
    if (changed < (["agent", "connector"].includes(frame.category) ? 4 : 20)) emptyFrames.push(name);
  }
  test.assert(emptyFrames.length === 0, `${direction} renders every frame with measurable contrast-background coverage${emptyFrames.length ? ` (empty: ${emptyFrames.join(", ")})` : ""}`);
}

test.assert(provenance.license === "MIT" && provenance.source === "original", "atlas family provenance is MIT and original");
test.assert(provenance.sourceFile === "assets/bonsai/atlas-source.json", "provenance identifies the source recipe");
test.assert(provenance.files.length === 4, "provenance enumerates all four directional runtime assets");
for (const entry of provenance.files) {
  test.assert(digest(readFileSync(resolveProjectPath(entry.file))) === entry.sha256, `${entry.file} matches its provenance hash`);
}
const notes = JSON.stringify(provenance.notes).toLowerCase();
test.assertIncludes(notes, "no pixels copied", "provenance states the no-copy boundary");
test.assertIncludes(notes, "no network path", "provenance states the offline generation boundary");

// Connector continuity, checked for every family and every mask rather than
// eyeballed on one tile. In this projection (sx = (x - y) * 24,
// sy = (x + y) * 12) a tile's four edge-adjacent neighbours sit diagonally on
// screen, so an arm has to reach the MIDPOINT of the shared edge — half the
// neighbour offset. Aim it along a screen axis instead and it points at the
// diamond's bare corner, where no neighbour ever is, and the network renders
// as a field of disconnected studs. Pipes had no mask family at all and were
// stamped one sprite per tile, which is the same failure by another route.
{
  const image = await loadImage(readFileSync(resolveProjectPath(atlas.directions.north.file)));
  // bit 0 = y-1, bit 1 = x+1, bit 2 = y+1, bit 3 = x-1 — the renderer's order.
  const edges = [
    { bit: 1, dx: 12, dy: -6, name: "y-1" },
    { bit: 2, dx: 12, dy: 6, name: "x+1" },
    { bit: 4, dx: -12, dy: 6, name: "y+1" },
    { bit: 8, dx: -12, dy: -6, name: "x-1" },
  ];
  const families = ["road", "rail", "wire", "highway", "pipe", "subway", "bridge-road", "bridge-rail", "bridge-highway"];
  for (const family of families) {
    for (let mask = 0; mask < 16; mask += 1) {
      const frame = atlas.frames[`${family}.mask-${mask}`];
      test.assert(Boolean(frame), `${family}.mask-${mask} exists so the renderer never falls back to a procedural stub`);
      if (!frame) continue;
      const canvas = createCanvas(frame.w, frame.h);
      const context2d = canvas.getContext("2d");
      context2d.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      const pixels = context2d.getImageData(0, 0, frame.w, frame.h).data;
      const opaqueNear = (dx, dy, radius = 1) => {
        for (let oy = -radius; oy <= radius; oy += 1) {
          for (let ox = -radius; ox <= radius; ox += 1) {
            const x = frame.anchor.x + dx + ox;
            const y = frame.anchor.y + dy + oy;
            if (x < 0 || y < 0 || x >= frame.w || y >= frame.h) continue;
            if (pixels[(y * frame.w + x) * 4 + 3] > 0) return true;
          }
        }
        return false;
      };
      for (const edge of edges) {
        const connected = (mask & edge.bit) !== 0;
        if (connected) {
          test.assert(opaqueNear(edge.dx, edge.dy),
            `${family}.mask-${mask} reaches the shared edge toward ${edge.name}`);
          test.assert(opaqueNear(Math.round(edge.dx / 2), Math.round(edge.dy / 2)),
            `${family}.mask-${mask} is continuous from the centre out toward ${edge.name}`);
        } else {
          test.assert(!opaqueNear(edge.dx * 1.4, edge.dy * 1.4, 0),
            `${family}.mask-${mask} paints nothing past the tile toward ${edge.name}`);
        }
      }
    }
  }
  const isolated = atlas.frames["road.mask-0"];
  const straight = atlas.frames["road.mask-2"];
  test.assert(isolated.w === straight.w && isolated.h === straight.h,
    "an unconnected road still occupies a full connector cell");
}

const buildSource = read("tooling/build-bonsai-atlas.mjs");
test.assertNotIncludes(buildSource, "fetch(", "atlas build has no network fetch path");
test.assertNotIncludes(buildSource, "http://", "atlas build embeds no HTTP source");
test.assertNotIncludes(buildSource, "https://", "atlas build embeds no HTTPS source");
test.assertIncludes(buildSource, 'readFile(sourcePath, "utf8")', "atlas build reads only the declared project-owned JSON source");

test.finish();
