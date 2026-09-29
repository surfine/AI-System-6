#!/usr/bin/env node
// Structural checks for every authored Bonsai City model. This does not judge
// looks (the contact sheets do); it catches the mistakes that break baking:
// wrong lot size, an unfilled lot surface, a model taller than a frame can
// hold, a non-deterministic build, or a variant that throws.

import { BUILDINGS } from "./buildings.mjs";
import { GROWABLES } from "./buildings-growables.mjs";
import { FACILITIES } from "./civic.mjs";
import { SPECIALS } from "./specials.mjs";
import { growableFor } from "./catalog.mjs";
import { TILE_VOXELS as T, MATERIALS } from "./voxel.mjs";

const MAX_HEIGHT = 150;
const failures = [];
const fail = (id, message) => failures.push(`${id}: ${message}`);

function inspect(id, size, model) {
  if (model.w !== size * T || model.d !== size * T) fail(id, `lot is ${model.w}x${model.d}, expected ${size * T}x${size * T}`);
  if (model.h > MAX_HEIGHT) fail(id, `model height ${model.h} exceeds ${MAX_HEIGHT}`);
  let lotHoles = 0;
  for (let y = 0; y < model.d; y += 1) for (let x = 0; x < model.w; x += 1) if (!model.get(x, y, 0)) lotHoles += 1;
  if (lotHoles) fail(id, `${lotHoles} empty cells in the z=0 lot surface`);
  let above = 0;
  let top = 0;
  for (let z = 1; z < model.h; z += 1) for (let y = 0; y < model.d; y += 1) for (let x = 0; x < model.w; x += 1) {
    const m = model.get(x, y, z);
    if (!m) continue;
    if (!MATERIALS[m]) fail(id, `unknown material index ${m}`);
    above += 1;
    top = Math.max(top, z);
  }
  if (above < 40) fail(id, `only ${above} voxels above the lot`);
  return top;
}

function sameModel(a, b) {
  if (a.w !== b.w || a.d !== b.d || a.h !== b.h) return false;
  for (let i = 0; i < a.data.length; i += 1) if (a.data[i] !== b.data[i]) return false;
  return true;
}

const ids = new Set();
for (const def of BUILDINGS) {
  inspect(def.id, def.size, def.make(0));
  ids.add(def.id);
}
const families = new Map();
for (const def of GROWABLES) {
  if (ids.has(def.id)) fail(def.id, "duplicate id");
  ids.add(def.id);
  if (!["r", "c", "i"].includes(def.zone)) fail(def.id, `zone ${def.zone}`);
  if (![1, 2, 3].includes(def.size)) fail(def.id, `size ${def.size}`);
  if (!["low", "mid", "high"].includes(def.tier)) fail(def.id, `tier ${def.tier}`);
  if (typeof def.label !== "string" || !def.label.includes(" / ")) fail(def.id, "label must be 'English / 中文'");
  const key = `${def.zone}.${def.size}.${def.tier}`;
  families.set(key, (families.get(key) || 0) + 1);
  const tops = [];
  for (let variant = 0; variant < 8; variant += 1) {
    let model;
    try { model = def.make(variant, variant); } catch (error) { fail(def.id, `variant ${variant} throws: ${error.message}`); continue; }
    tops.push(inspect(`${def.id}#${variant}`, def.size, model));
    if (!sameModel(model, def.make(variant, variant))) fail(def.id, `variant ${variant} is not deterministic`);
  }
  if (def.tier === "high" && def.size > 1 && tops.length === 8 && !(tops[7] > tops[0])) {
    fail(def.id, `high-tier rank must raise the building (rank 0 top ${tops[0]}, rank 7 top ${tops[7]})`);
  }
}
for (const [group, table] of [["facility", FACILITIES], ["catalog", SPECIALS]]) {
  for (const [id, def] of Object.entries(table)) {
    if (!id.startsWith(`${group}.`)) fail(id, `key must start with ${group}.`);
    if (![1, 2, 3, 4].includes(def.size)) fail(id, `size ${def.size}`);
    if (typeof def.label !== "string" || !def.label.includes(" / ")) fail(id, "label must be 'English / 中文'");
    let model;
    try { model = def.make(0); } catch (error) { fail(id, `throws: ${error.message}`); continue; }
    inspect(id, def.size, model);
    if (!sameModel(model, def.make(0))) fail(id, "not deterministic");
  }
}
// Coverage as the atlas sees it: sample designs count too (catalog.mjs).
for (const zone of ["r", "c", "i"]) for (const size of [1, 2, 3]) for (const [tier, first] of [["low", 1], ["mid", 9], ["high", 17]]) {
  const g = growableFor(zone, size, first);
  if (!g) fail(`${zone}.${size}.${tier}`, "no design at all");
  else if (g.borrowed) console.log(`note: ${zone}.${size}.${tier} borrows ${g.id} from another tier`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`OK ${BUILDINGS.length} sample buildings, ${GROWABLES.length} growable designs, ${families.size} families covered, ${Object.keys(FACILITIES).length} facilities, ${Object.keys(SPECIALS).length} specials`);
