// The 2D atlas and the 3D view draw the same authored voxel models
// (tooling/bonsai-miniature). This holds the shared data honest: every model
// the 3D view can load decodes to its declared size, sits on the footprint of
// the atlas frame it stands in for, and every growable building, facility and
// landmark frame the atlas carries has its model — so no lot can show one
// design in 2D and another in 3D.
import { gunzipSync } from "node:zlib";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-miniature");
const index = JSON.parse(read("assets/bonsai/voxel-models.json"));
const atlas = JSON.parse(read("assets/bonsai/atlas-metadata.json"));
const bytes = gunzipSync(Buffer.from(index.blob, "base64"));

test.assert(index.version === 1 && index.tile === 16, "voxel model index declares version 1 and 16 voxels per tile");
test.assert(Array.isArray(index.palette) && index.palette.length > 40, "the palette carries the material colours");

const decodeFailures = [];
index.models.forEach((model, i) => {
  let cells = 0;
  for (let k = model.o; k < model.o + model.l; k += 2) cells += bytes[k + 1];
  if (cells !== model.w * model.d * model.h) decodeFailures.push(`model ${i}: ${cells} cells for ${model.w}x${model.d}x${model.h}`);
  for (let k = model.o; k < model.o + model.l; k += 2) if (bytes[k] > index.palette.length) { decodeFailures.push(`model ${i}: material ${bytes[k]} outside the palette`); break; }
});
test.assert(decodeFailures.length === 0, `every model decodes to its declared size${decodeFailures.length ? ` (${decodeFailures.slice(0, 3).join("; ")})` : ""}`);

const footprintFailures = [];
for (const [id, modelIndex] of Object.entries(index.frames)) {
  const frame = atlas.frames[id];
  const model = index.models[modelIndex];
  if (!frame) { footprintFailures.push(`${id} is not an atlas frame`); continue; }
  if (!model) { footprintFailures.push(`${id} points at missing model ${modelIndex}`); continue; }
  if (model.w !== frame.footprint.w * 16 || model.d !== frame.footprint.h * 16) footprintFailures.push(`${id}: ${model.w}x${model.d} voxels on a ${frame.footprint.w}x${frame.footprint.h} frame`);
}
test.assert(footprintFailures.length === 0, `every model stands on its frame's footprint${footprintFailures.length ? ` (${footprintFailures.slice(0, 3).join("; ")})` : ""}`);

const required = Object.keys(atlas.frames).filter((id) => (
  /^building\.[rci]\.[123]\.\d+\.(normal|foundation|construction|declined|abandoned|recovering)$/.test(id)
  || (/^(facility|catalog)\./.test(id) && !id.endsWith(".night"))
  || /^tree\./.test(id)
  || /^(road|rail|wire)\.mask-\d+$/.test(id)
));
const missing = required.filter((id) => !(id in index.frames));
test.assert(required.length >= 360, `the shared set covers buildings, states, facilities, landmarks, trees and networks (${required.length} frames)`);
test.assert(missing.length === 0, `every such atlas frame has a 3D model${missing.length ? ` (missing: ${missing.slice(0, 5).join(", ")})` : ""}`);

const ground = index.ground || {};
test.assert(["grass", "sand", "water"].every((key) => Array.isArray(ground[key]) && ground[key].length === 3), "the ground colours travel with the models so both views paint the same grass, sand and water");

test.finish();
