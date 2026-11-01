import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadOrthographicAtlas } from "../../tooling/lib/bonsai-orthographic-atlas.mjs";
import { desktopRoot } from "../../tooling/lib/paths.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-orthographic");
const source = JSON.parse(await readFile(`${desktopRoot}/assets/bonsai/atlas-source.json`, "utf8"));
const { pure, render } = await loadOrthographicAtlas(desktopRoot, source);
const frame = { id: "building.r.2.3.normal", category: "building", zone: "residential", stage: 2, variant: 3, footprint: [2, 2], state: "normal" };
const night = { ...frame, id: "building.r.2.3.night", state: "night" };
const geometry = (blocks) => JSON.stringify(blocks.map(({ x, y, z, sx, sy, sz, shape }) => ({ x, y, z, sx, sy, sz, shape })), (_, v) => typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v);
assert.equal(geometry(pure.createAssetBlocks(frame, source)), geometry(pure.createAssetBlocks(night, source)), "night keeps the daylight geometry");
assert.equal(pure.assetSeed(frame), pure.assetSeed({ ...frame, x: 14, y: 7, state: "night", rotation: 3 }), "location and view do not replace the building identity");
const recipes = pure.buildRecipes(source);
const snapshot = { size: 16, timeOfDay: 0.5, tick: 500 };
const objects = { buildings: [{ ...frame, x: 4, y: 5, footprint: { w: 2, h: 2 } }], facilities: [], covered: new Set() };
const live = pure.collectChunkBlocks(snapshot, recipes, 0, 0, objects, true).opaque.map((b) => ({ ...b, x: b.x - 5, z: b.z - 6 }));
assert.equal(geometry(live), geometry(pure.createAssetBlocks(frame, source)), "offline and placed runtime buildings use identical geometry");
const alpha = (bytes) => bytes.filter((_, index) => index % 4 === 3);
const hashes = new Set();
for (let direction = 0; direction < 4; direction += 1) {
  const day = render(frame, direction, 213, 171, { x: 118, y: 139 });
  const dark = render(night, direction, 213, 171, { x: 118, y: 139 });
  assert.ok(dark.some((value, index) => index % 4 < 3 && value > day[index] + 20), "night emission brightens actual textured window pixels");
  assert.deepEqual(alpha(day), alpha(dark), `rotation ${direction} day/night has no silhouette pop`);
  assert.deepEqual(day, render(frame, direction, 213, 171, { x: 118, y: 139 }), "repeat rasterization is byte-identical");
  assert.ok(alpha(day).some((value) => value > 0), "real geometry renders nonempty");
  hashes.add(day.toString("base64"));
}
assert.ok(hashes.size > 1, "rotating the same building exposes different faces");
test.assert(true, "runtime/offline geometry identity, location-independent seeds, deterministic rasterization and day/night silhouettes hold across four directions");
test.finish();
