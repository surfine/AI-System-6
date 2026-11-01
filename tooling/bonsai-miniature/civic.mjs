// Bonsai City civic models, keyed by the atlas frame id they draw. Each entry:
// "frame.id": { size, label: "English / 中文", make(variant) } — size is the
// footprint edge in tiles, and make() returns a Model of size*16 × size*16
// with the lot surface at z = 0 and the street front facing +y.

import { Model, TILE_VOXELS as T, STOREY as S, mulberry32 } from "./voxel.mjs";
import { addTree, addCar, addLamp } from "./buildings.mjs";

const pick = (list, variant) => list[((variant % list.length) + list.length) % list.length];

// ---------------------------------------------------------------- props

function addAc(m, x, y, z) {
  m.box(x, y, z, x + 2, y + 2, z + 2, "steel");
  m.set(x, y, z + 1, "darksteel");
}

// A lorry: white box body with a coloured cab at the far end.
function addTruck(m, x, y, z, axis, color = "orange") {
  if (axis === "x") {
    m.box(x, y, z, x + 9, y + 4, z + 1, "tyre");
    m.box(x, y, z + 1, x + 6, y + 4, z + 6, "white");
    m.box(x + 6, y, z + 1, x + 9, y + 4, z + 4, color);
    m.box(x + 7, y, z + 3, x + 9, y + 4, z + 4, "glassdark");
  } else {
    m.box(x, y, z, x + 4, y + 9, z + 1, "tyre");
    m.box(x, y, z + 1, x + 4, y + 6, z + 6, "white");
    m.box(x, y + 6, z + 1, x + 4, y + 9, z + 4, color);
    m.box(x, y + 7, z + 3, x + 4, y + 9, z + 4, "glassdark");
  }
}

// A long bus: a coloured box with a dark window band and a light roof band.
function addBus(m, x, y, z, axis, color = "orange") {
  if (axis === "x") {
    m.box(x, y, z, x + 16, y + 4, z + 1, "tyre");
    m.box(x, y, z + 1, x + 16, y + 4, z + 6, color);
    m.box(x, y + 3, z + 3, x + 16, y + 4, z + 5, "glassdark");
    m.box(x + 1, y + 3, z + 3, x + 15, y + 4, z + 5, color);
    m.box(x, y, z + 6, x + 16, y + 4, z + 7, "white");
  } else {
    m.box(x, y, z, x + 4, y + 16, z + 1, "tyre");
    m.box(x, y, z + 1, x + 4, y + 16, z + 6, color);
    m.box(x + 3, y, z + 3, x + 4, y + 16, z + 5, "glassdark");
    m.box(x + 3, y + 1, z + 3, x + 4, y + 15, z + 5, color);
    m.box(x, y, z + 6, x + 4, y + 16, z + 7, "white");
  }
}

// An ambulance: white box body with a red stripe and a lit beacon.
function addAmbulance(m, x, y, z) {
  m.box(x, y, z, x + 3, y + 8, z + 1, "tyre");
  m.box(x, y, z + 1, x + 3, y + 8, z + 5, "white");
  m.box(x, y + 5, z + 5, x + 3, y + 8, z + 6, "white");
  m.box(x, y + 6, z + 2, x + 3, y + 8, z + 5, "glassdark");
  m.box(x, y + 1, z + 3, x + 3, y + 5, z + 4, "red");
  m.set(x + 1, y + 4, z + 6, "red");
}

// A stack of pipes lying along x: tubes of `colorMat` with darksteel collars.
function addPipeStack(m, x0, x1, y, z, count, diameter = 2, colorMat = "steel") {
  for (let k = 0; k < count; k += 1) {
    const cy = y + k * (diameter + 1);
    m.box(x0, cy, z + 1, x1, cy + diameter, z + 1 + diameter, colorMat);
    for (let x = x0 + 2; x < x1; x += 6) m.box(x, cy, z + 1, x + 1, cy + diameter, z + 1 + diameter, "darksteel");
  }
  m.box(x0, y - 2, z, x1, y + count * (diameter + 1), z + 1, "darksteel");
}

// An ambulance: white box body with a red stripe and a lit beacon.

// A transformer: a steel frame with two darksteel cans and a busbar top.
function addTransformer(m, x, y, z) {
  m.box(x, y, z, x + 6, y + 5, z + 1, "darkconcrete");
  for (const [dx, dy] of [[0, 0], [5, 0], [0, 4], [5, 4]]) m.box(x + dx, y + dy, z + 1, x + dx + 1, y + dy + 1, z + 7, "steel");
  m.box(x, y, z + 7, x + 6, y + 5, z + 8, "steel");
  m.box(x + 1, y + 1, z + 2, x + 3, y + 3, z + 5, "darksteel");
  m.box(x + 3, y + 2, z + 2, x + 5, y + 4, z + 5, "darksteel");
  m.box(x + 1, y + 1, z + 8, x + 2, y + 2, z + 10, "steel");
  m.box(x + 4, y + 3, z + 8, x + 5, y + 4, z + 10, "steel");
  m.box(x, y + 1, z + 10, x + 6, y + 4, z + 11, "darksteel");
}

// A steel lattice mast: four legs with rungs, topped by a small platform.
function addAntennaMast(m, cx, cy, z, top, r = 2) {
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) m.box(cx + dx, cy + dy, z, cx + dx + 1, cy + dy + 1, top, "steel");
  for (let zz = z + 2; zz < top - 1; zz += 3) {
    m.box(cx - r, cy - r, zz, cx + r + 1, cy - r + 1, zz + 1, "darksteel");
    m.box(cx - r, cy + r, zz, cx + r + 1, cy + r + 1, zz + 1, "darksteel");
    m.box(cx - r, cy - r, zz, cx - r + 1, cy + r + 1, zz + 1, "darksteel");
    m.box(cx + r, cy - r, zz, cx + r + 1, cy + r + 1, zz + 1, "darksteel");
  }
  m.box(cx - r, cy - r, top, cx + r + 1, cy + r + 1, top + 1, "darksteel");
  m.box(cx, cy, top + 1, cx + 1, cy + 1, top + 3, "steel");
  m.set(cx, cy, top + 3, "red");
}

function addBench(m, x, y, z, axis = "x") {
  const [w, d] = axis === "x" ? [4, 1] : [1, 4];
  m.box(x, y, z, x + w, y + d, z + 1, "wood");
  if (axis === "x") {
    m.box(x, y - 1, z + 1, x + w, y, z + 2, "wood");
    m.set(x, y, z, "trim");
    m.set(x + w - 1, y, z, "trim");
  } else {
    m.box(x - 1, y, z + 1, x, y + d, z + 2, "wood");
    m.set(x, y, z, "trim");
    m.set(x, y + d - 1, z, "trim");
  }
}

// A row of darksteel rails on wood sleepers, running along x at `y`.
function addTrack(m, x0, x1, y, z) {
  for (let x = x0; x < x1; x += 3) m.box(x, y, z, x + 2, y + 4, z + 1, "trunk");
  m.box(x0, y, z + 1, x1, y + 1, z + 2, "darksteel");
  m.box(x0, y + 3, z + 1, x1, y + 4, z + 2, "darksteel");
}

// A chimney: darkbrick or firebrick shaft with light bands up top, trim cap.
function addChimney(m, cx, cy, z, top, r, wall, band = "white", bandFrom = null) {
  const from = bandFrom == null ? Math.floor(top * 0.72) : bandFrom;
  for (let zz = z; zz < top; zz += 1) {
    const c = zz >= from && Math.floor(zz / 5) % 2 ? band : wall;
    m.cylinder(cx, cy, zz < top - 6 ? r : r - 0.4, zz, zz + 1, c);
  }
  m.cylinder(cx, cy, r - 0.4, top, top + 2, "trim");
}

// ---------------------------------------------------------------- 1x1 civic

// 1×1 · a compact two-storey police station in navy and white: a blue lamp over
// the glazed door, a flagpole on the forecourt and a white cruiser with a blue
// beacon parked at the kerb.
export function police(variant = 0) {
  const m = new Model(T, T, 28, "police-station");
  const trim = pick(["white", "plaster", "limestone"], variant);
  m.box(0, 0, 0, T, T, 1, "sidewalk");
  m.box(0, 0, 0, T, 12, 1, "lawn");
  m.box(1, 1, 1, 15, 12, 10, "blue");
  m.box(1, 1, 1, 15, 12, 2, "darkconcrete");
  m.box(1, 1, 9, 15, 12, 10, trim);
  m.windows(1, 1, 15, 12, 2, 10, { floor: 4, offset: 0, height: 2, period: 4, width: 2, margin: 2 });
  m.box(1, 11, 3, 15, 12, 6, "glass");
  m.box(1, 11, 3, 15, 12, 4, trim);
  m.box(4, 11, 3, 6, 12, 6, trim);
  m.box(11, 11, 3, 13, 12, 6, trim);
  m.box(7, 10, 1, 9, 11, 5, "glassdark");
  m.box(6, 11, 1, 10, 15, 3, "concrete");
  m.box(6, 12, 3, 7, 15, 5, "trim");
  m.box(9, 12, 3, 10, 15, 5, "trim");
  m.box(6, 13, 5, 10, 15, 6, "blue");
  m.box(7, 13, 6, 9, 15, 8, "white");
  m.box(7, 14, 8, 9, 15, 9, "blue");
  m.box(5, 12, 5, 7, 14, 6, "lamppole");
  m.box(5, 12, 3, 7, 14, 5, "blue");
  m.flatRoof(1, 1, 15, 12, 10, "blue", "gravel");
  addAc(m, 3, 3, 11);
  addAc(m, 11, 3, 11);
  m.box(3, 12, 1, 4, 13, 22, "steel");
  m.box(4, 12, 18, 8, 13, 21, "blue");
  m.box(4, 12, 19, 8, 13, 20, "white");
  m.box(0, 14, 0, T, 16, 1, "parking");
  for (let x = 1; x < T; x += 4) m.box(x, 14, 0, x + 1, 16, 1, "linewhite");
  m.box(6, 12, 0, 12, 16, 1, "paving");
  addCar(m, 1, 14, 1, "x", "carwhite");
  m.set(3, 15, 5, "blue");
  m.set(3, 15, 6, "blue");
  m.box(11, 15, 1, 12, 16, 5, "lamppole");
  m.set(11, 15, 5, "lamp");
  addTree(m, 13.5, 1.5, 1, "round", 5100 + variant, 0.7);
  return m;
}

// 1×1 · a red-brick firehouse: one tall door facing the street, white stone trim,
// a short hose tower on the corner and the engine nose poking onto the apron.
export function fire(variant = 0) {
  const m = new Model(T, T, 30, "firehouse");
  const wall = pick(["firebrick", "darkbrick", "brick"], variant);
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 10, 1, "lawn");
  m.box(1, 1, 1, 15, 11, 11, wall);
  m.box(1, 1, 1, 15, 11, 2, "limestone");
  m.box(1, 1, 10, 15, 11, 11, "white");
  m.windows(1, 1, 15, 11, 5, 10, { floor: 5, offset: 0, height: 2, period: 5, width: 1, margin: 2 });
  // the engine door: a big red opening framed in white stone
  m.clear(5, 10, 2, 11, 12, 9);
  m.box(5, 9, 1, 11, 10, 9, "doorred");
  for (let z = 3; z < 9; z += 3) m.box(5, 9, z, 11, 10, z + 1, "white");
  m.box(4, 9, 9, 12, 10, 10, "white");
  m.box(4, 9, 10, 12, 12, 11, "white");
  m.box(12, 10, 1, 14, 11, 5, "door");
  m.box(3, 11, 11, 14, 12, 12, pick(["white", "red"], variant));
  // hose tower: a short brick shaft with a hipped cap
  m.box(1, 1, 11, 5, 6, 22, wall);
  m.windows(1, 1, 5, 6, 13, 22, { floor: 5, offset: 1, height: 2, period: 5, width: 1, margin: 1 });
  m.box(0, 0, 22, 6, 7, 23, "white");
  m.hip(1, 1, 5, 6, 23, "roofslate", 1);
  // apron and the engine nose sticking out of the door
  m.box(0, 12, 0, T, T, 1, "asphaltpatch");
  for (let x = 2; x < T; x += 5) m.box(x, 12, 0, x + 1, T, 1, "lineyellow");
  m.box(5, 12, 1, 11, 15, 2, "tyre");
  m.box(5, 12, 2, 11, 13, 5, "red");
  m.box(6, 12, 3, 10, 13, 4, "glassdark");
  m.box(5, 12, 5, 11, 14, 6, "red");
  m.box(6, 12, 6, 10, 14, 7, "steel");
  m.set(7, 13, 7, "yellow");
  m.set(9, 13, 7, "yellow");
  m.box(13, 13, 1, 14, 14, 16, "steel");
  m.box(12, 13, 13, 15, 15, 14, "yellow");
  m.box(12, 13, 14, 15, 15, 15, "red");
  addTree(m, 2.5, 14.5, 1, "round", 5200 + variant, 0.7);
  return m;
}

// 1×1 · a low butter-cream school: a pitched roof with a clock turret, a painted
// sports court on the lot and a tiny playground of yellow and red bars.
export function school(variant = 0) {
  const m = new Model(T, T, 30, "school");
  const wall = pick(["butter", "cream", "plaster"], variant);
  const roof = pick(["roofred", "roofslate", "roofgreen"], variant);
  const court = pick(["signgreen", "blue"], variant);
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(0, 0, 0, 7, 12, 1, "paving");
  m.box(1, 1, 1, 15, 11, 13, wall);
  m.box(1, 1, 1, 15, 11, 2, "limestone");
  m.windows(1, 1, 15, 11, 4, 12, { floor: 4, offset: 0, height: 2, period: 3, width: 2, margin: 1 });
  m.clear(4, 10, 3, 7, 11, 7);
  m.box(4, 9, 1, 7, 10, 7, "doorgreen");
  m.box(3, 9, 7, 8, 10, 8, "white");
  m.box(3, 10, 8, 8, 12, 9, pick(["blue", "white"], variant + 1));
  m.gable(1, 1, 15, 11, 13, "y", roof, wall, 1);
  // clock turret over the entrance
  m.box(3, 2, 17, 8, 8, 21, wall);
  m.box(3, 7, 18, 8, 8, 21, "white");
  m.box(2, 1, 21, 9, 9, 22, "white");
  m.hip(3, 2, 8, 8, 22, "roofslate", 1);
  m.box(0, 12, 0, 7, T, 1, "paving");
  // sports court painted on the front-east lot
  m.box(7, 12, 0, T, T, 1, "paving");
  m.box(7, 12, 0, T, T, 1, court);
  m.box(8, 12, 0, T, 13, 1, "paving");
  m.box(8, T - 1, 0, T, T, 1, "paving");
  m.box(8, 13, 0, 9, T - 1, 1, "paving");
  m.box(8, 12, 0, 12, 14, 1, "linewhite");
  m.box(8, 12, 0, 15, 13, 1, "linewhite");
  for (let y = 13; y < T; y += 5) m.box(15, y, 0, T, y + 1, 1, "linewhite");
  // playground: yellow and red bars on the lawn behind
  m.box(0, 13, 0, 6, T, 1, "sand");
  m.box(1, 14, 1, 5, 15, 7, "yellow");
  m.box(4, 14, 2, 5, 15, 6, "red");
  m.box(2, 14, 1, 4, 15, 2, "steel");
  m.box(1, 14, 7, 3, 15, 8, "red");
  m.box(2, 14, 1, 3, 15, 3, "yellow");
  m.box(4, 14, 1, 5, 15, 4, "blue");
  return m;
}

// 1×1 · a white clinic: a red cross standing on the flat roof and another on the
// front parapet, a glazed entrance roundel and an ambulance at the kerb.
export function clinic(variant = 0) {
  const m = new Model(T, T, 26, "clinic");
  const wall = pick(["plaster", "white", "cream"], variant);
  m.box(0, 0, 0, T, T, 1, "paving");
  m.box(1, 1, 1, 13, 12, 13, wall);
  m.box(1, 1, 1, 13, 12, 2, "darkconcrete");
  m.windows(1, 1, 13, 12, 3, 13, { floor: 4, offset: 1, height: 2, period: 4, width: 3, margin: 1 });
  m.box(1, 11, 3, 13, 12, 7, "glass");
  for (let x = 2; x < 13; x += 3) m.box(x, 11, 3, x + 1, 12, 7, "mullion");
  m.box(3, 11, 2, 11, 12, 3, "white");
  m.clear(5, 10, 2, 9, 11, 7);
  m.box(5, 9, 1, 9, 11, 7, "glassdark");
  m.box(4, 10, 7, 10, 11, 8, "white");
  m.box(4, 11, 8, 10, 13, 9, "red");
  m.box(6, 11, 8, 8, 13, 9, "white");
  m.flatRoof(1, 1, 13, 12, 13, "white", "gravel");
  // red cross standing on the roof
  for (const dir of ["x", "y"]) {
    if (dir === "x") m.box(4, 4, 15, 10, 7, 16, "red");
    else m.box(6, 2, 15, 9, 9, 16, "red");
  }
  m.box(4, 4, 16, 11, 8, 17, "red");
  m.box(6, 5, 16, 9, 7, 17, "white");
  addAc(m, 10, 2, 14);
  addAmbulance(m, 1, 13, 1);
  m.box(11, 13, 0, 16, T, 1, "parking");
  m.box(12, 13, 0, 13, T, 1, "linewhite");
  addCar(m, 12, 13, 1, "y", pick(["carblue", "carwhite", "cargreen"], variant + 1));
  addTree(m, 2.5, 2.5, 1, "round", 5300 + variant, 0.7);
  return m;
}

// 1×1 · a pump house: a small brick hut with a roll-up door, blue pipes marching
// into the ground and a round water tank sitting low on the paving.
export function pump(variant = 0) {
  const m = new Model(T, T, 22, "pump-house");
  const wall = pick(["brick", "darkbrick", "limestone"], variant);
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 6, 1, "gravel");
  m.box(1, 1, 1, 9, 10, 7, wall);
  m.box(1, 1, 1, 9, 10, 2, "darkconcrete");
  m.windows(1, 1, 9, 10, 3, 7, { floor: 4, offset: 1, height: 2, period: 3, width: 1, margin: 1 });
  m.box(8, 9, 1, 10, 10, 6, "rolldoor");
  m.box(7, 9, 6, 11, 11, 7, "steel");
  m.box(0, 0, 7, 10, 11, 8, "roofdark");
  m.box(1, 11, 2, 2, 12, 11, "blue");
  m.box(1, 12, 1, 3, 13, 11, "darksteel");
  m.box(2, 12, 10, 8, 13, 11, "darksteel");
  m.box(7, 12, 6, 8, 13, 11, "blue");
  m.box(7, 12, 6, 8, 15, 7, "blue");
  m.box(7, 15, 2, 8, 16, 7, "blue");
  m.box(7, 15, 1, 9, 16, 2, "darksteel");
  // round water tank: darksteel base, wood staves, dark cap, on the west side
  m.cylinder(11.5, 12.5, 4.4, 1, 2, "darkconcrete");
  m.cylinder(11.5, 12.5, 4.0, 1, 12, "wood");
  for (let z = 3; z < 12; z += 3) m.cylinder(11.5, 12.5, 4.2, z, z + 1, "darksteel");
  m.cylinder(11.5, 12.5, 3.6, 12, 13, "roofdark");
  m.cylinder(11.5, 12.5, 2.0, 13, 14, "darksteel");
  m.box(5, 4, 8, 7, 9, 9, "darksteel");
  m.box(7, 9, 1, 8, 12, 9, "blue");
  m.box(1, 11, 1, 3, 13, 3, "sand");
  m.cylinder(3, 12, 1.2, 1, 3, "rust");
  m.cylinder(5, 14, 1.2, 1, 3, pick(["orange", "yellow"], variant));
  addTree(m, 13.5, 1.5, 1, "conifer", 5400 + variant, 0.6);
  return m;
}

// 1×1 · a water tower: four darksteel columns braced with cross bars carrying a
// big round tank, its conical top capped by a vent pipe.
export function tower(variant = 0) {
  const m = new Model(T, T, 42, "water-tower");
  const skin = pick(["sky", "white", "tank"], variant);
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(3, 3, 0, 13, 13, 1, "concrete");
  for (const [dx, dy] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) {
    m.box(8 + dx, 8 + dy, 1, 9 + dx, 9 + dy, 24, "darksteel");
    m.box(8 + dx, 8 + dy, 1, 9 + dx, 9 + dy, 2, "steel");
  }
  for (let z = 4; z < 24; z += 5) {
    m.box(5, 5, z, 12, 6, z + 1, "steel");
    m.box(5, 11, z, 12, 12, z + 1, "steel");
    m.box(5, 5, z, 6, 12, z + 1, "steel");
    m.box(11, 5, z, 12, 12, z + 1, "steel");
  }
  m.box(5, 5, 14, 12, 6, 15, "steel");
  m.box(5, 11, 14, 12, 12, 15, "steel");
  m.box(5, 5, 20, 12, 6, 21, "steel");
  m.box(5, 11, 20, 12, 12, 21, "steel");
  m.box(4, 4, 24, 13, 13, 25, "darksteel");
  m.cylinder(8.5, 8.5, 5.4, 25, 34, skin);
  for (let z = 26; z < 34; z += 4) m.cylinder(8.5, 8.5, 5.6, z, z + 1, "steel");
  for (let k = 0; k < 4; k += 1) m.cylinder(8.5, 8.5, 5.4 - k, 34 + k, 35 + k, "white");
  m.cylinder(8.5, 8.5, 0.9, 34, 37, "steel");
  m.cylinder(8.5, 8.5, 1.6, 37, 38, "darksteel");
  m.box(7, 8, 34, 9, 10, 40, "steel");
  m.set(7, 8, 40, "red");
  // street edge: a kerb, a lamp and a bench under the tank
  m.box(0, 14, 0, T, T, 1, "sidewalk");
  m.box(6, 13, 0, 11, 15, 1, "paving");
  addLamp(m, 13, 14, 1, "w");
  addTree(m, 2, 14.5, 1, "round", 5500 + variant, 0.7);
  return m;
}

// 1×1 · water treatment: two round clarifier basins of water inside concrete
// rings with rotating scraper arms, a control shed and a pipe run between them.
export function treatment(variant = 0) {
  const m = new Model(T, T, 16, "water-treatment");
  void variant;
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 3, 1, "gravel");
  m.box(0, 13, 0, T, T, 1, "asphaltpatch");
  // two clarifiers: concrete ring walls around a disc of water
  for (const [cx, cy] of [[5.5, 7.5], [11.5, 7.5]]) {
    m.cylinder(cx, cy, 5.0, 1, 4, "darkconcrete");
    m.cylinder(cx, cy, 4.3, 1, 4, "water");
    m.cylinder(cx, cy, 4.9, 3, 4, "concrete");
    m.cylinder(cx, cy, 4.9, 1, 2, "concrete");
    m.cylinder(cx, cy, 4.3, 1, 3, "water");
    for (let a = 0; a < 8; a += 1) {
      const px = cx + Math.cos((a * Math.PI) / 4) * 4.9;
      const py = cy + Math.sin((a * Math.PI) / 4) * 4.9;
      m.set(Math.floor(px), Math.floor(py), 4, "concrete");
    }
    m.box(Math.floor(cx), Math.floor(cy), 1, Math.floor(cx) + 1, Math.floor(cy) + 1, 6, "steel");
    m.box(Math.floor(cx) - 4, Math.floor(cy), 5, Math.floor(cx) + 5, Math.floor(cy) + 1, 6, "steel");
    m.box(Math.floor(cx), Math.floor(cy) - 4, 5, Math.floor(cx) + 1, Math.floor(cy) + 5, 6, "steel");
    m.box(Math.floor(cx), Math.floor(cy), 6, Math.floor(cx) + 1, Math.floor(cy) + 1, 7, "darksteel");
  }
  m.box(10, 7, 1, 11, 9, 4, "steel");
  m.box(6, 5, 3, 11, 6, 4, "darksteel");
  m.box(6, 10, 3, 11, 11, 4, "darksteel");
  m.box(0, 5, 1, 1, 11, 4, "darksteel");
  m.box(4, 5, 2, 7, 6, 3, "steel");
  // control shed at the street front
  m.box(0, 9, 1, 6, 15, 7, pick(["plaster", "cream", "limestone"], variant + 1));
  m.box(0, 9, 1, 6, 15, 2, "darkconcrete");
  m.box(1, 14, 3, 6, 15, 6, "glass");
  m.windows(0, 9, 6, 15, 3, 7, { floor: 4, offset: 1, height: 2, period: 3, width: 2, faces: ["e", "n"] });
  m.box(0, 8, 7, 7, 16, 8, "white");
  m.clear(2, 14, 1, 4, 15, 4);
  m.box(2, 13, 1, 4, 14, 4, "doorgreen");
  m.paint(0, 0, 1, 0, T, 8, "moss");
  m.box(11, 12, 1, 15, 15, 2, "sand");
  m.box(12, 13, 2, 14, 14, 3, "rock");
  m.cylinder(14, 10, 1.3, 1, 4, pick(["blue", "rust"], variant));
  addLamp(m, 8, 14, 1, "n");
  return m;
}

// 1×1 · a subway entrance: a green-and-white kiosk with a sign pole, a dark
// stairwell opening descending between white railings and a pair of benches.
export function subwayStation(variant = 0) {
  const m = new Model(T, T, 20, "subway-station");
  void variant;
  m.box(0, 0, 0, T, T, 1, "sidewalk");
  m.box(0, 0, 0, T, 5, 1, "paving");
  m.box(1, 1, 1, 8, 6, 9, "signgreen");
  m.box(1, 1, 1, 8, 6, 2, "darkconcrete");
  m.box(1, 1, 8, 8, 6, 9, "white");
  m.box(2, 5, 3, 7, 6, 6, "glass");
  m.box(2, 5, 3, 7, 6, 4, "white");
  m.box(3, 5, 2, 5, 6, 5, "doorgreen");
  m.windows(1, 1, 8, 6, 3, 8, { floor: 6, offset: 2, height: 3, period: 3, width: 2, faces: ["n", "w"] });
  m.box(0, 0, 9, 9, 7, 10, "white");
  m.flatRoof(1, 1, 8, 6, 10, "white", "gravel");
  // stairwell: an opening in the paving with dark walls and lit treads going down
  m.clear(10, 2, 1, 16, 11, 1);
  m.box(10, 1, 0, 16, 2, 1, "trim");
  m.box(10, 11, 0, 16, 12, 1, "concrete");
  m.box(10, 1, 1, 12, 11, 4, "concrete");
  m.box(14, 1, 1, 16, 11, 4, "concrete");
  m.box(10, 1, 1, 16, 2, 4, "concrete");
  m.box(12, 2, 0, 14, 10, 4, "trim");
  for (let k = 0; k < 6; k += 1) {
    for (let i = 0; i < 4; i += 1) m.set(12 + i, 9 - k, 1 + k, k % 2 ? "darkconcrete" : "concrete");
  }
  m.box(12, 9, 4, 14, 10, 5, "windowlit");
  m.box(12, 2, 1, 13, 9, 3, "lineyellow");
  m.box(10, 1, 4, 11, 12, 7, "steel");
  m.box(15, 1, 4, 16, 12, 7, "steel");
  for (let z = 4; z < 7; z += 2) {
    m.box(10, 1, z, 16, 2, z + 1, "steel");
    m.box(10, 11, z, 16, 12, z + 1, "steel");
  }
  // sign pole with a round sign, benches and a vending box
  m.box(11, 13, 1, 12, 14, 17, "steel");
  m.box(8, 13, 13, 14, 14, 16, "signgreen");
  m.box(9, 13, 14, 13, 14, 15, "white");
  m.set(8, 13, 13, "trim");
  m.set(13, 13, 16, "trim");
  addBench(m, 3, 12, 1, "x");
  addBench(m, 3, 14, 1, "x");
  m.box(13, 13, 1, 15, 15, 5, "doorgreen");
  m.box(13, 13, 5, 15, 15, 6, "white");
  addLamp(m, 8, 14, 1, "w");
  return m;
}

// 1×1 · a bus depot: an open-sided shed roofed on steel posts over a lined apron,
// with two long buses parked nose-in and a ticket hut by the street.
export function bus(variant = 0) {
  const m = new Model(T, T, 20, "bus-depot");
  const livery = pick(["orange", "blue", "signgreen"], variant);
  m.box(0, 0, 0, T, T, 1, "parking");
  m.box(0, 12, 0, T, T, 1, "asphalt");
  for (let x = 2; x < T; x += 5) m.box(x, 12, 0, x + 1, T, 1, "lineyellow");
  // shed: roof slab on six posts over the back half of the lot
  for (const x of [1, 7, 14]) for (const y of [2, 10]) m.box(x, y, 1, x + 1, y + 1, 10, "steel");
  m.box(0, 1, 10, T, 12, 11, "roofdark");
  m.box(0, 1, 11, T, 12, 12, "corrugated");
  m.box(0, 1, 12, T, 2, 13, "steel");
  m.box(0, 10, 12, T, 12, 13, "steel");
  m.box(0, 11, 10, T, 12, 11, "corrugated");
  for (let x = 2; x < T; x += 4) m.box(x, 11, 9, x + 2, 12, 10, "windowlit");
  m.gable(0, 1, T, 12, 12, "x", "roofdark", "roofdark", 0);
  // two buses parked nose-out
  addBus(m, 1, 2, 1, "y", livery);
  addBus(m, 10, 2, 1, "y", pick(["blue", "orange"], variant + 1));
  // ticket hut and a service van
  m.box(0, 13, 1, 5, T, 7, pick(["plaster", "cream"], variant + 2));
  m.box(0, 13, 1, 5, T, 2, "darkconcrete");
  m.box(1, T - 1, 3, 5, T, 6, "glass");
  m.windows(0, 13, 5, T, 3, 7, { floor: 4, offset: 1, height: 2, period: 3, width: 2, faces: ["w", "n"] });
  m.box(0, 12, 7, 6, T, 8, "white");
  m.clear(2, T - 1, 1, 4, T, 4);
  m.box(2, T - 2, 1, 4, T - 1, 4, "glassdark");
  addTruck(m, 8, 12, 1, "y", pick(["white", "yellow"], variant + 3));
  addLamp(m, 13, 12, 1, "w");
  return m;
}

// 1×1 · a small hydro unit: a concrete dam wall across the lot holding water on
// the upstream (-y) half, a stepped spillway, and a turbine house at the front.
export function hydro(variant = 0) {
  const m = new Model(T, T, 22, "hydro-unit");
  void variant;
  m.box(0, 0, 0, T, T, 1, "darkconcrete");
  // reservoir on the back half, held by the dam
  m.box(0, 0, 0, T, 9, 1, "water");
  m.box(0, 0, 1, T, 9, 12, "water");
  m.box(0, 9, 1, T, 10, 12, "concrete");
  m.box(0, 9, 0, T, 10, 1, "concrete");
  m.box(0, 0, 12, T, 10, 13, "concrete");
  m.box(0, 0, 10, T, 1, 12, "concrete");
  m.box(0, 0, 2, T, 2, 10, "water");
  // spillway: a stepped notch in the middle of the wall, water falling
  m.box(6, 9, 1, 10, 10, 11, "darkconcrete");
  for (let k = 0; k < 5; k += 1) m.box(6 + k, 9, 10 - k * 2, 10 - k, 10, 11 - k * 2, "water");
  m.box(6, 10, 1, 10, 12, 2, "water");
  m.box(5, 9, 1, 6, 10, 12, "darkconcrete");
  m.box(10, 9, 1, 11, 10, 12, "darkconcrete");
  m.box(5, 9, 12, 11, 10, 13, "darkconcrete");
  // turbine house downstream, with penstocks through the wall
  m.box(2, 12, 1, 13, 16, 9, pick(["concrete", "plaster"], (variant + 1) % 2));
  m.box(2, 12, 1, 13, 16, 2, "darkconcrete");
  m.windows(2, 12, 13, 16, 4, 9, { floor: 4, offset: 0, height: 2, period: 5, width: 3, faces: ["n"] });
  m.box(2, 15, 3, 13, 16, 6, "glass");
  m.box(1, 11, 9, 14, 17, 10, "steel");
  m.box(1, 1, 12, 14, 11, 13, "steel");
  m.box(6, 10, 3, 10, 13, 4, "steel");
  m.box(7, 10, 4, 9, 12, 5, "darksteel");
  m.box(6, 9, 5, 10, 10, 6, "darksteel");
  m.box(4, 13, 1, 8, 17, 3, "concrete");
  m.box(5, 13, 3, 7, 16, 6, "steel");
  m.box(4, 12, 1, 5, 17, 2, "steel");
  m.box(5, 16, 1, 8, 17, 5, "darksteel");
  m.box(0, 12, 13, T, T, 1, "gravel");
  m.box(3, 15, 1, 12, 16, 2, "lineyellow");
  addLamp(m, 14, 15, 1, "w");
  return m;
}

// 1×1 · a wind turbine: a slender white tower, a grey nacelle and three thin
// blades in a Y, with a small substation box and a fence at the base.
export function wind(variant = 0) {
  const m = new Model(T, T, 60, "wind-turbine");
  const hubZ = 48;
  m.box(0, 0, 0, T, T, 1, "gravel");
  m.box(0, 0, 0, T, 12, 1, "concrete");
  m.box(0, 12, 0, T, T, 1, "lawn");
  // tower: a tapering white column on a darkconcrete pad
  m.cylinder(8, 8, 3.2, 1, 2, "darkconcrete");
  m.cylinder(7.5, 7.5, 2.0, 2, 14, "white");
  m.cylinder(7.5, 7.5, 1.4, 14, 32, "white");
  m.cylinder(7.5, 7.5, 1.0, 32, hubZ, "white");
  for (let z = 6; z < hubZ; z += 10) m.box(7, 7, z, 9, 9, z + 1, "steel");
  // nacelle and hub
  m.box(5, 6, hubZ - 2, 11, 10, hubZ, "white");
  m.box(4, 7, hubZ - 1, 6, 9, hubZ + 1, "white");
  m.box(4, 7, hubZ - 1, 5, 9, hubZ + 1, "steel");
  m.cylinder(7.5, 8.5, 1.6, hubZ - 1, hubZ + 2, "darksteel");
  // blades in a Y: one straight up, two down and out at 30° below horizontal
  for (let k = 0; k < 8; k += 1) m.box(7, 8, hubZ + 3 + k * 2, 9, 9, hubZ + 5 + k * 2, "white");
  for (let k = 1; k < 8; k += 1) {
    const up = hubZ + 2 - k;
    const down = hubZ + 2 - k - 2;
    m.box(7 - k, 8, up, 7 - k + 1, 9, up + 1, "white");
    m.box(7 - k, 8, down, 7 - k + 1, 9, down + 1, "white");
  }
  for (let k = 1; k < 8; k += 1) {
    const up = hubZ + 2 - k;
    const down = hubZ + 2 - k - 2;
    m.box(9 + k, 8, up, 9 + k + 1, 9, up + 1, "white");
    m.box(9 + k, 8, down, 9 + k + 1, 9, down + 1, "white");
  }
  m.box(3, 8, hubZ - 8, 5, 9, hubZ - 2, "white");
  m.box(12, 8, hubZ - 8, 14, 9, hubZ - 2, "white");
  // substation box and a fenced equipment bay at the base
  m.box(1, 12, 1, 6, 15, 5, "darkconcrete");
  m.box(1, 12, 1, 6, 15, 2, "steel");
  m.box(2, 14, 2, 6, 15, 5, "steel");
  m.box(1, 12, 5, 6, 15, 6, "steel");
  m.box(2, 13, 6, 3, 14, 9, "steel");
  m.box(4, 13, 6, 5, 14, 9, "steel");
  m.box(2, 13, 9, 6, 14, 10, "darksteel");
  for (let x = 0; x < T; x += 2) m.box(x, 12, 1, x + 1, 13, 4, "steel");
  m.box(0, 12, 3, T, 13, 4, "steel");
  m.box(11, 13, 1, 15, 15, 2, "gravel");
  addCar(m, 10, 12, 1, "y", pick(["carwhite", "caryellow", "carblue"], variant));
  return m;
}

// ---------------------------------------------------------------- 2x2 civic

// 2×2 · a rail station: a striped platform canopy running along x, a stone hall
// with arched windows and a clock on the +y front, and a track of darksteel
// rails on wood sleepers crossing the lot behind the platform.
export function station(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 32, "rail-station");
  const wall = pick(["cream", "limestone", "plaster"], variant);
  const canopy = pick(["roofgreen", "awninggreen", "roofslate"], variant + 1);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 8, 1, "sidewalk");
  m.box(0, 8, 0, W, 20, 1, "paving");
  m.box(0, 20, 0, W, 26, 1, "gravel");
  m.box(0, 26, 0, W, W, 1, "asphaltpatch");
  // station hall on the street front
  m.box(3, 3, 1, 29, 14, 13, wall);
  m.box(3, 3, 1, 29, 14, 2, "darkconcrete");
  m.box(2, 2, 13, 30, 15, 14, "white");
  m.flatRoof(3, 3, 29, 14, 14, "roofslate", "gravel");
  // three arched windows facing +y
  for (const x of [6, 13, 20]) {
    m.clear(x, 13, 3, x + 4, 14, 8);
    m.box(x, 12, 2, x + 4, 13, 8, "glass");
    m.box(x + 1, 12, 8, x + 3, 13, 9, "glassdark");
    m.box(x - 1, 12, 2, x, 13, 9, "limestone");
    m.box(x + 4, 12, 2, x + 5, 13, 9, "limestone");
    m.box(x - 1, 12, 8, x + 5, 14, 9, "limestone");
  }
  m.clear(10, 12, 2, 16, 14, 8);
  m.box(10, 11, 1, 16, 13, 8, "glassdark");
  m.box(12, 11, 1, 14, 13, 8, "doorgreen");
  m.box(9, 14, 9, 17, 15, 10, "white");
  m.box(10, 14, 10, 16, 15, 13, "roofslate");
  // clock: a white disc over the entrance
  m.cylinder(13, 14.6, 3.2, 14, 15, "white");
  m.cylinder(13, 14.6, 2.6, 13, 14, "trim");
  m.box(12, 14, 15, 14, 15, 16, "trim");
  m.set(12, 14, 16, "red");
  // platform canopy along x, on slim steel posts
  m.box(0, 19, 0, W, 20, 1, "concrete");
  for (let x = 2; x < W; x += 6) m.box(x, 18, 1, x + 1, 19, 9, "steel");
  m.box(0, 18, 9, W, 21, 10, "white");
  m.box(0, 18, 10, W, 22, 11, canopy);
  m.box(0, 17, 10, W, 18, 11, canopy);
  for (let x = 1; x < W; x += 3) m.box(x, 22, 8, x + 1, 23, 10, "trim");
  // platform furniture and a bench row
  addBench(m, 4, 16, 1, "x");
  addBench(m, 22, 16, 1, "x");
  m.box(14, 16, 1, 20, 17, 1, "concrete");
  m.box(8, 16, 9, 10, 17, 12, "steel");
  m.box(7, 16, 10, 11, 17, 11, "darksteel");
  m.box(17, 16, 9, 19, 17, 12, "steel");
  m.box(16, 16, 10, 20, 17, 11, "darksteel");
  // the track behind the platform: sleepers, rails, ballast and a signal
  m.box(0, 24, 0, W, 30, 1, "gravel");
  addTrack(m, 0, W, 24, 1);
  m.box(30, 21, 1, 31, 28, 16, "steel");
  m.box(26, 23, 13, 31, 24, 16, "signgreen");
  m.box(27, 23, 14, 30, 24, 15, "white");
  m.box(1, 22, 1, 3, 23, 20, "steel");
  m.box(0, 21, 18, 4, 24, 21, "signgreen");
  m.box(1, 21, 19, 3, 24, 20, "white");
  // street front: kerb, lamps, trees and a taxi
  m.box(0, 0, 0, W, 2, 1, "curb");
  addLamp(m, 1, 1, 1, "e");
  addLamp(m, 30, 1, 1, "w");
  addTree(m, 2, 1.5, 1, "round", 5600 + variant, 0.7);
  addTree(m, 29, 1.5, 1, "conifer", 5610 + variant, 0.7);
  addCar(m, 21, 1, 1, "x", "caryellow");
  return m;
}

// 2×2 · a desalination plant: long white membrane halls over steel frames, a
// blue pipe run feeding a briny pool, product tanks and a service lane of cars.
export function desal(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 34, "desalination-plant");
  const pipe = pick(["blue", "corrugatedblue"], variant);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 5, 1, "gravel");
  m.box(0, 30, 0, W, W, 1, "asphalt");
  m.box(0, 34, 0, W, W, 1, "paving");
  for (let x = 4; x < W; x += 6) m.box(x, 30, 0, x + 1, 34, 1, "linewhite");
  // saltwater intake pool on the west, fed by a fat blue pipe
  m.box(1, 6, 0, 12, 16, 1, "darkconcrete");
  m.box(2, 7, 0, 11, 15, 1, "poolwater");
  m.box(1, 6, 1, 2, 16, 5, "concrete");
  m.box(11, 6, 1, 12, 16, 5, "concrete");
  m.box(1, 15, 1, 12, 17, 2, "concrete");
  m.cylinder(13, 11, 3.0, 1, 4, pipe);
  m.box(12, 10, 2, 16, 12, 3, pipe);
  m.box(12, 10, 1, 14, 12, 2, "darksteel");
  // four long membrane halls running along x, white with blue pipe runs
  for (let k = 0; k < 4; k += 1) {
    const y0 = 18 + k * 4;
    m.box(16, y0, 1, 46, y0 + 3, 9, "plaster");
    m.box(16, y0, 1, 46, y0 + 3, 2, "darkconcrete");
    m.box(16, y0 + 3, 3, 46, y0 + 4, 7, "glass");
    for (let x = 18; x < 46; x += 3) m.box(x, y0 + 3, 3, x + 1, y0 + 4, 7, "mullion");
    m.box(15, y0, 9, 47, y0 + 4, 10, "white");
    for (let x = 16; x < 46; x += 5) m.box(x, y0, 10, x + 2, y0 + 4, 11, "steel");
  }
  for (const y of [17, 37]) {
    m.box(6, y, 1, 7, y + 1, 12, "steel");
    m.box(6, y, 11, 48, y + 1, 12, pipe);
    m.box(6, y, 12, 48, y + 1, 13, "steel");
    m.box(20, y, 1, 21, y + 1, 11, "steel");
    m.box(34, y, 1, 35, y + 1, 11, "steel");
  }
  addPipeStack(m, 1, 13, 19, 1, 3, 1.2, pipe);
  // product tanks on the east corner
  m.cylinder(52.5, 6.5, 4.4, 1, 14, "tank");
  m.cylinder(52.5, 6.5, 4.0, 14, 15, "steel");
  m.cylinder(52.5, 6.5, 4.4, 1, 3, "darkconcrete");
  m.cylinder(52.5, 16.5, 3.6, 1, 11, "tank");
  m.cylinder(52.5, 16.5, 3.2, 11, 12, "steel");
  m.box(48, 4, 1, 57, 19, 1, "darkconcrete");
  m.box(46, 6, 1, 47, 8, 8, "steel");
  m.box(46, 15, 1, 47, 17, 8, "steel");
  // control building at the street front
  m.box(2, 36, 1, 16, 46, 7, pick(["plaster", "cream", "limestone"], variant + 1));
  m.box(2, 36, 1, 16, 46, 2, "darkconcrete");
  m.box(3, 45, 3, 16, 46, 6, "glassdark");
  for (let x = 4; x < 16; x += 3) m.box(x, 45, 3, x + 1, 46, 6, "mullion");
  m.windows(2, 36, 16, 46, 3, 7, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "w"] });
  m.box(1, 35, 7, 17, 47, 8, "white");
  m.flatRoof(2, 36, 16, 46, 8, "white", "gravel");
  addAc(m, 4, 38, 9);
  m.box(20, 38, 1, 30, 44, 5, "concrete");
  m.box(22, 39, 5, 28, 43, 8, "steel");
  m.box(15, 36, 1, 16, 46, 1, "concrete");
  for (const x of [20, 32, 44]) addLamp(m, x, 30, 1, "n");
  addCar(m, 20, 34, 1, "x", pick(["carwhite", "carblue"], variant + 2));
  addCar(m, 40, 34, 1, "x", pick(["cargreen", "carwhite"], variant + 3));
  addTree(m, 1, 34, 1, "round", 5700 + variant, 0.6);
  return m;
}

// 2×2 · an old coal plant: a darkbrick boiler house, one tall red-and-white
// banded chimney over a fat base, a conveyor climbing to a trim coal heap and a
// switchyard of steel frames on the front-east corner.
export function coal2x2(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 60, "coal-plant-small");
  const wall = pick(["darkbrick", "brick", "firebrick"], variant);
  m.box(0, 0, 0, W, W, 1, "darkconcrete");
  m.box(0, 0, 0, W, 10, 1, "gravel");
  m.box(0, 34, 0, W, W, 1, "asphaltpatch");
  m.box(0, 40, 0, W, W, 1, "parking");
  // boiler house with tall arched windows
  m.box(2, 4, 1, 24, 30, 16, wall);
  m.box(2, 4, 1, 24, 30, 3, "darkconcrete");
  m.box(1, 3, 16, 25, 31, 17, "roofdark");
  for (const x of [4, 10, 16]) {
    m.box(x, 29, 3, x + 4, 30, 13, "window");
    m.box(x, 29, 13, x + 4, 30, 14, "window");
  }
  m.windows(2, 4, 24, 30, 4, 14, { floor: 4, offset: 1, height: 2, period: 5, width: 2, faces: ["n"] });
  m.box(6, 29, 1, 14, 30, 8, "rolldoor");
  m.box(5, 29, 8, 15, 31, 9, "steel");
  m.box(4, 4, 17, 12, 12, 26, wall);
  m.box(3, 3, 26, 13, 13, 27, "roofdark");
  // chimney: fat darkbrick base, tapering shaft, red/white bands at the top
  m.cylinder(30, 10, 4.4, 1, 8, "darkbrick");
  m.cylinder(30, 10, 3.6, 8, 26, wall);
  m.cylinder(30, 10, 3.0, 26, 54, wall);
  for (let z = 40; z < 54; z += 1) m.cylinder(30, 10, 3.0, z, z + 1, Math.floor(z / 4) % 2 ? "white" : "red");
  m.cylinder(30, 10, 3.0, 54, 55, "white");
  m.cylinder(30, 10, 2.2, 55, 57, "trim");
  m.box(25, 5, 34, 26, 15, 35, "steel");
  m.box(25, 5, 34, 27, 7, 35, "steel");
  // coal heap behind a low wall, fed by a climbing conveyor
  m.box(28, 16, 0, 46, 34, 1, "darkconcrete");
  m.box(28, 16, 1, 46, 34, 2, "trim");
  m.box(30, 18, 2, 44, 32, 4, "roofdark");
  m.box(32, 20, 4, 42, 30, 7, "roofdark");
  m.box(34, 22, 7, 40, 28, 9, "trim");
  for (let k = 0; k < 7; k += 1) m.box(24 - k * 2, 27, 9 + k * 2, 30 - k * 2, 33, 11 + k * 2, "darksteel");
  m.box(16, 26, 9, 24, 29, 11, "steel");
  m.box(10, 27, 10, 16, 29, 12, "steel");
  // switchyard on the front-east corner
  m.box(30, 34, 0, W, W, 1, "gravel");
  addTransformer(m, 32, 36, 1);
  addTransformer(m, 42, 36, 1);
  addTransformer(m, 32, 46, 1);
  addTransformer(m, 42, 46, 1);
  m.box(30, 34, 1, W, 36, 5, "steel");
  m.box(30, 34, 5, W, 35, 6, "darksteel");
  m.box(30, 52, 1, W, 54, 4, "steel");
  // yard props: a truck, a loader and a rail siding
  addTruck(m, 2, 32, 1, "x", pick(["yellow", "orange"], variant + 1));
  for (let x = 0; x < 28; x += 4) m.box(x, 32, 1, x + 3, 34, 2, "trunk");
  m.box(0, 32, 2, 28, 33, 3, "darksteel");
  m.box(0, 33, 2, 28, 34, 3, "darksteel");
  m.box(0, 42, 1, 28, 43, 4, "steel");
  m.box(0, 54, 1, 28, 55, 4, "steel");
  for (let x = 1; x < 28; x += 3) m.box(x, 42, 4, x + 1, 55, 5, "steel");
  return m;
}

// ---------------------------------------------------------------- 4x4 plants

// 4×4 · a big coal power plant: a long boiler hall, two banded chimneys, a
// concrete cooling tower that narrows then flares, a coal yard with piles and a
// climbing conveyor, a transformer yard and a rail spur along the front.
export function coal(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 96, "coal-power-plant");
  const band = pick(["red", "orange", "rust"], variant);
  m.box(0, 0, 0, W, W, 1, "darkconcrete");
  m.box(0, 0, 0, W, 12, 1, "gravel");
  m.box(0, 12, 0, W, 30, 1, "soil");
  m.box(0, 40, 0, W, W, 1, "asphaltpatch");
  m.box(0, 56, 0, W, W, 1, "asphalt");
  // boiler hall: a long corrugated box with sawtooth glazing on the roof
  m.box(2, 14, 1, 50, 40, 20, pick(["corrugated", "darkconcrete"], variant + 1));
  m.box(2, 14, 1, 50, 40, 3, "darkconcrete");
  m.windows(2, 14, 50, 40, 3, 20, { floor: 5, offset: 0, height: 3, period: 7, width: 3, faces: ["n", "w", "e"] });
  for (let k = 0; k < 7; k += 1) {
    const x0 = 2 + k * 7;
    for (let s = 0; s < 6; s += 1) m.box(x0 + s, 14, 20 + s, x0 + s + 1, 40, 21 + s, "roofdark");
    m.box(x0 + 6, 14, 20, x0 + 7, 40, 26, "roofglass");
  }
  m.box(4, 39, 1, 16, 40, 10, "rolldoor");
  m.box(3, 39, 10, 17, 41, 11, "steel");
  m.box(24, 39, 1, 34, 40, 8, "glassdark");
  m.box(23, 39, 8, 35, 41, 9, "steel");
  // two chimneys on banded shafts
  addChimney(m, 22, 8, 1, 84, 4.0, "darkbrick", band, 60);
  addChimney(m, 36, 8, 1, 76, 3.6, "darkbrick", "white", 54);
  m.box(18, 4, 30, 40, 12, 31, "steel");
  m.box(18, 4, 30, 19, 12, 31, "darksteel");
  // cooling tower: stacked cylinders narrowing to a waist, then flaring again
  const cx = 56;
  const cy = 26;
  const shell = "concrete";
  m.cylinder(cx, cy, 12.0, 1, 3, "darkconcrete");
  m.cylinder(cx, cy, 11.2, 3, 10, shell);
  m.cylinder(cx, cy, 9.6, 10, 20, shell);
  m.cylinder(cx, cy, 8.4, 20, 34, shell);
  m.cylinder(cx, cy, 8.0, 34, 44, shell);
  m.cylinder(cx, cy, 8.8, 44, 52, shell);
  m.cylinder(cx, cy, 10.0, 52, 58, shell);
  m.cylinder(cx, cy, 10.6, 58, 60, "darkconcrete");
  for (let z = 6; z < 56; z += 8) m.cylinder(cx, cy, 12.2 - Math.abs(z - 32) / 9, z, z + 1, "white");
  m.cylinder(cx, cy, 4.0, 1, 4, "darksteel");
  for (let a = 0; a < 12; a += 1) {
    const px = Math.floor(cx + Math.cos((a * Math.PI) / 6) * 12.6);
    const py = Math.floor(cy + Math.sin((a * Math.PI) / 6) * 12.6);
    m.box(px, py, 1, px + 1, py + 1, 5, "concrete");
  }
  m.box(44, 24, 1, 45, 28, 26, "steel");
  for (let z = 4; z < 26; z += 6) m.box(43, 24, z, 46, 28, z + 1, "steel");
  // coal yard: piles of roofdark and trim, walls, and a climbing conveyor
  m.box(2, 42, 0, 40, 60, 1, "soil");
  m.box(2, 42, 1, 40, 43, 6, "concrete");
  m.box(2, 59, 1, 40, 60, 6, "concrete");
  m.box(2, 42, 1, 3, 60, 6, "concrete");
  m.box(38, 42, 1, 40, 60, 6, "concrete");
  m.cylinder(10, 50, 7.5, 1, 5, "trim");
  m.cylinder(10, 50, 5.0, 5, 10, "trim");
  m.cylinder(10, 50, 3.0, 10, 13, "roofdark");
  m.cylinder(24, 52, 6.0, 1, 4, "roofdark");
  m.cylinder(24, 52, 4.0, 4, 8, "trim");
  m.cylinder(24, 52, 2.4, 8, 10, "roofdark");
  m.cylinder(33, 47, 4.5, 1, 3, "trim");
  m.cylinder(33, 47, 2.8, 3, 6, "roofdark");
  // conveyor from the yard up to the boiler hall
  for (let k = 0; k < 14; k += 1) m.box(30 - k, 44 - k * 2, 6 + k, 34 - k, 48 - k * 2, 8 + k, "steel");
  for (let k = 0; k < 14; k += 1) m.box(30 - k, 45 - k * 2, 6 + k, 34 - k, 46 - k * 2, 8 + k, "darksteel");
  m.box(14, 14, 18, 20, 22, 19, "rust");
  m.box(14, 14, 19, 20, 22, 20, "darksteel");
  // rail spur across the front with a coal wagon
  addTrack(m, 0, W, 46, 1);
  addTrack(m, 0, W, 52, 1);
  m.box(4, 44, 2, 16, 49, 8, "rust");
  m.box(4, 44, 8, 16, 49, 9, "darksteel");
  m.box(16, 44, 2, 18, 49, 7, "darksteel");
  m.box(4, 44, 1, 6, 49, 2, "tyre");
  m.box(14, 44, 1, 16, 49, 2, "tyre");
  m.box(28, 50, 2, 40, 55, 8, "trim");
  m.box(28, 50, 8, 40, 55, 9, "darksteel");
  // transformer yard on the south-east corner
  m.box(52, 44, 0, W, 62, 1, "gravel");
  for (const [x, y] of [[54, 46], [54, 54], [46, 46]]) addTransformer(m, x, y, 1);
  for (const y of [46, 54]) {
    m.box(44, y - 2, 1, 58, y - 1, 12, "steel");
  }
  m.box(42, 44, 12, W - 1, 46, 13, "steel");
  m.box(42, 52, 12, W - 1, 54, 13, "steel");
  // control block and yard furniture at the street front
  m.box(2, 60, 1, 18, 70, 9, pick(["plaster", "cream", "limestone"], variant + 2));
  m.box(2, 60, 1, 18, 70, 2, "darkconcrete");
  m.box(3, 69, 3, 18, 70, 7, "glassdark");
  for (let x = 4; x < 18; x += 3) m.box(x, 69, 3, x + 1, 70, 7, "mullion");
  m.windows(2, 60, 18, 70, 3, 9, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "w"] });
  m.box(1, 59, 9, 19, 71, 10, "white");
  m.box(1, 59, 10, 12, 60, 13, "blue");
  for (let x = 2; x < W; x += 6) m.box(x, 60, 0, x + 1, 64, 1, "linewhite");
  addTruck(m, 22, 60, 1, "x", pick(["yellow", "orange", "blue"], variant + 3));
  addTruck(m, 40, 60, 1, "x", "signgreen");
  addCar(m, 2, 60, 1, "x", pick(["carwhite", "carblue"], variant + 4));
  addCar(m, 30, 60, 1, "x", pick(["caryellow", "carred"], variant + 5));
  addLamp(m, 1, 45, 1, "e");
  addLamp(m, 62, 45, 1, "w");
  addTree(m, 1, 2, 1, "conifer", 5800 + variant, 0.8);
  return m;
}

// 4×4 · an oil-fired plant: a boiler house with two chimneys, a cluster of big
// round storage tanks inside concrete bund walls and pipe racks marching from
// the tank farm to the hall, with a pump house at the street front.
export function oil(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 84, "oil-power-plant");
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 10, 1, "gravel");
  m.box(0, 58, 0, W, W, 1, "asphalt");
  m.box(0, 62, 0, W, W, 1, "parking");
  // boiler hall
  m.box(24, 6, 1, 54, 26, 18, pick(["corrugated", "darkconcrete", "corrugatedblue"], variant));
  m.box(24, 6, 1, 54, 26, 3, "darkconcrete");
  m.windows(24, 6, 54, 26, 3, 18, { floor: 5, offset: 0, height: 3, period: 6, width: 3, faces: ["n", "w", "e"] });
  m.box(23, 5, 18, 55, 27, 19, "roofdark");
  for (let k = 0; k < 5; k += 1) {
    const x0 = 24 + k * 6;
    for (let s = 0; s < 5; s += 1) m.box(x0 + s, 6, 19 + s, x0 + s + 1, 26, 20 + s, "roofdark");
    m.box(x0 + 5, 6, 19, x0 + 6, 26, 24, "roofglass");
  }
  m.box(26, 25, 1, 40, 26, 10, "rolldoor");
  m.box(25, 25, 10, 41, 27, 11, "steel");
  // chimneys, striped
  addChimney(m, 60, 10, 1, 78, 4.2, "darkbrick", "white", 56);
  addChimney(m, 60, 24, 1, 70, 3.8, "darkbrick", "red", 50);
  m.box(56, 6, 30, 64, 14, 31, "steel");
  m.box(56, 20, 30, 64, 28, 31, "steel");
  // tank farm: four large round tanks behind bund walls on the west half
  const tanks = [[12, 12, 8.0, 26], [12, 34, 7.0, 22], [34, 42, 6.2, 18], [12, 52, 5.4, 14]];
  for (const [cx, cy, r, h] of tanks) {
    m.box(cx - 11, cy - 11, 0, cx + 11, cy + 11, 1, "darkconcrete");
    m.box(cx - 11, cy - 11, 1, cx + 11, cy - 10, 5, "concrete");
    m.box(cx - 11, cy + 10, 1, cx + 11, cy + 11, 5, "concrete");
    m.box(cx - 11, cy - 11, 1, cx - 10, cy + 11, 5, "concrete");
    m.box(cx + 10, cy - 11, 1, cx + 11, cy + 11, 5, "concrete");
    m.cylinder(cx, cy, r, 1, h, "tank");
    m.cylinder(cx, cy, r, 1, 4, "steel");
    m.cylinder(cx, cy, r - 0.3, h, h + 1, "steel");
    m.cylinder(cx, cy, r - 1.4, h + 1, h + 2, "darksteel");
    for (let z = 6; z < h; z += 6) m.cylinder(cx, cy, r + 0.6, z, z + 1, "darksteel");
    for (let a = 0; a < 8; a += 2) {
      const px = Math.floor(cx + Math.cos((a * Math.PI) / 4) * (r + 1.2) - 0.5);
      const py = Math.floor(cy + Math.sin((a * Math.PI) / 4) * (r + 1.2) - 0.5);
      m.box(px, py, 1, px + 1, py + 1, h, "steel");
    }
  }
  // pipe racks from the tanks to the hall
  for (const y of [30, 46]) {
    for (let x = 20; x < 56; x += 9) {
      m.box(x, y, 1, x + 1, y + 3, 12, "steel");
      m.box(x - 1, y, 1, x + 2, y + 4, 2, "darkconcrete");
    }
    m.box(20, y, 12, 56, y + 3, 13, "darksteel");
    m.box(20, y + 1, 14, 56, y + 2, 15, "rust");
    m.box(20, y + 2, 13, 56, y + 3, 14, "steel");
  }
  m.box(20, 20, 11, 24, 22, 12, "steel");
  m.box(20, 20, 12, 21, 22, 13, "darksteel");
  // flare stack
  m.box(66, 40, 1, 69, 43, 44, "steel");
  m.box(66, 40, 44, 69, 43, 46, "darksteel");
  m.box(65, 39, 46, 70, 44, 48, "orange");
  m.box(66, 40, 48, 69, 43, 49, "yellow");
  m.box(64, 38, 1, 71, 45, 2, "darkconcrete");
  // pump house and fire water at the street front
  m.box(2, 62, 1, 20, 74, 9, pick(["plaster", "cream", "limestone"], variant + 1));
  m.box(2, 62, 1, 20, 74, 2, "darkconcrete");
  m.box(3, 73, 3, 20, 74, 7, "glassdark");
  for (let x = 4; x < 20; x += 3) m.box(x, 73, 3, x + 1, 74, 7, "mullion");
  m.windows(2, 62, 20, 74, 3, 9, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "w"] });
  m.box(1, 61, 9, 21, 75, 10, "white");
  m.flatRoof(2, 62, 20, 74, 10, "white", "gravel");
  m.box(2, 77, 1, 10, 90, 3, "concrete");
  m.cylinder(26, 80, 4.0, 1, 12, "wood");
  m.cylinder(26, 80, 3.6, 12, 13, "roofdark");
  m.cylinder(38, 84, 3.0, 1, 10, "wood");
  m.cylinder(38, 84, 2.6, 10, 11, "roofdark");
  for (let x = 2; x < W; x += 6) m.box(x, 62, 0, x + 1, 66, 1, "linewhite");
  addTruck(m, 26, 62, 1, "x", "signgreen");
  addCar(m, 46, 63, 1, "x", pick(["carwhite", "carred"], variant + 2));
  addCar(m, 54, 63, 1, "x", "carblue");
  addLamp(m, 1, 60, 1, "e");
  addLamp(m, 62, 60, 1, "w");
  addTree(m, 1, 56, 1, "conifer", 5900 + variant, 0.8);
  return m;
}

// 4×4 · a gas-fired plant: two plaster-and-blue turbine halls with short stacks,
// a big gas holder cylinder behind a fence, a tidy transformer yard, a car park
// and broad lawns down the street front.
export function gas(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 58, "gas-power-plant");
  const trimColor = pick(["blue", "signgreen", "orange"], variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(0, 42, 0, W, W, 1, "concrete");
  m.box(0, 54, 0, W, W, 1, "asphalt");
  m.box(0, 58, 0, W, W, 1, "parking");
  for (let x = 4; x < W; x += 7) m.box(x, 58, 0, x + 1, W, 1, "linewhite");
  m.box(0, 42, 0, W, 44, 1, "paving");
  // two turbine halls: clean boxes split by a coloured band and glazing
  for (let k = 0; k < 2; k += 1) {
    const x0 = 4 + k * 30;
    m.box(x0, 6, 1, x0 + 26, 38, 22, "plaster");
    m.box(x0, 6, 1, x0 + 26, 38, 3, "darkconcrete");
    m.box(x0, 37, 5, x0 + 26, 38, 14, trimColor);
    for (let x = x0 + 2; x < x0 + 26; x += 4) m.box(x, 37, 5, x + 1, 38, 14, "mullion");
    m.windows(x0, 6, x0 + 26, 38, 5, 22, { floor: 4, offset: 1, height: 3, period: 6, width: 4, faces: ["n", "w", "e"] });
    m.box(x0 - 1, 5, 22, x0 + 27, 39, 23, "white");
    m.flatRoof(x0, 6, x0 + 26, 38, 23, "white", "gravel");
    addAc(m, x0 + 3, 10, 24);
    addAc(m, x0 + 20, 30, 24);
    // short stack with a coloured crown
    m.cylinder(x0 + 22, 14, 3.6, 1, 30, "white");
    m.cylinder(x0 + 22, 14, 4.0, 26, 30, trimColor);
    m.cylinder(x0 + 22, 14, 2.6, 30, 32, "darksteel");
    m.box(x0 + 18, 14, 12, x0 + 19, 20, 29, "steel");
    for (let z = 14; z < 29; z += 5) m.box(x0 + 18, 14, z, x0 + 20, 20, z + 1, "steel");
    // entrance porch
    m.box(x0 + 10, 38, 5, x0 + 18, 42, 6, "white");
    m.box(x0 + 10, 41, 1, x0 + 11, 42, 5, "white");
    m.box(x0 + 17, 41, 1, x0 + 18, 42, 5, "white");
    m.clear(x0 + 12, 37, 1, x0 + 16, 38, 5);
    m.box(x0 + 12, 36, 1, x0 + 16, 37, 5, "glassdark");
    m.box(x0 + 11, 36, 5, x0 + 17, 38, 6, trimColor);
  }
  // gas holder: a wide cylinder in a lattice cage behind the halls
  m.cylinder(64, 18, 9.0, 1, 4, "darksteel");
  m.cylinder(64, 18, 8.4, 4, 30, "tank");
  m.cylinder(64, 18, 8.4, 4, 8, "steel");
  m.cylinder(64, 18, 8.4, 20, 22, trimColor);
  m.cylinder(64, 18, 7.6, 30, 31, "steel");
  m.cylinder(64, 18, 3.4, 31, 32, "darksteel");
  for (let a = 0; a < 8; a += 1) {
    const px = Math.floor(64 + Math.cos((a * Math.PI) / 4) * 9.4);
    const py = Math.floor(18 + Math.sin((a * Math.PI) / 4) * 9.4);
    m.box(px, py, 1, px + 1, py + 1, 32, "steel");
    for (let z = 6; z < 32; z += 6) {
      const qx = Math.floor(64 + Math.cos(((a + 1) * Math.PI) / 4) * 9.4);
      const qy = Math.floor(18 + Math.sin(((a + 1) * Math.PI) / 4) * 9.4);
      m.box(Math.min(px, qx), Math.min(py, qy), z, Math.max(px, qx) + 1, Math.max(py, qy) + 1, z + 1, "steel");
    }
  }
  // transformer yard and switchgear on the east edge
  m.box(46, 24, 0, W, 42, 1, "gravel");
  addTransformer(m, 48, 26, 1);
  addTransformer(m, 48, 34, 1);
  addTransformer(m, 40, 30, 1);
  m.box(38, 24, 1, 39, 42, 12, "steel");
  m.box(38, 24, 12, W - 1, 26, 13, "steel");
  m.box(38, 40, 12, W - 1, 42, 13, "steel");
  m.box(38, 24, 1, 39, 42, 2, "darksteel");
  // pipes and yard clutter
  for (let k = 0; k < 3; k += 1) m.box(30, 40 + 0, 4 + k * 3, 48, 41, 5 + k * 3, k % 2 ? "steel" : trimColor);
  m.box(30, 40, 1, 31, 41, 12, "steel");
  m.box(47, 40, 1, 48, 41, 12, "steel");
  m.box(0, 44, 1, 22, 52, 3, "concrete");
  addAc(m, 24, 45, 1);
  // tidy lawn down the street front with trees, benches and cars
  for (const [x, y, k] of [[2, 50, "round"], [9, 50, "conifer"], [16, 50, "round"], [30, 50, "round"], [44, 50, "cherry"], [56, 50, "round"]]) {
    addTree(m, x, y, 1, k, 6000 + x + y + variant, 0.75);
  }
  m.box(24, 46, 0, 28, 48, 1, "paving");
  addCar(m, 4, 58, 1, "y", "carwhite");
  addCar(m, 18, 58, 1, "y", pick(["carblue", "cargreen", "carred"], variant + 1));
  addCar(m, 32, 58, 1, "y", "caryellow");
  addCar(m, 52, 58, 1, "y", pick(["carwhite", "cargreen"], variant + 2));
  addLamp(m, 1, 43, 1, "e");
  addLamp(m, 62, 43, 1, "w");
  return m;
}

// 4×4 · a nuclear plant: a domed containment cylinder, two big concrete cooling
// towers, a long turbine hall, a fenced compound with a gate house and a lined
// staff car park on the street front.
export function nuclear(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 96, "nuclear-plant");
  const rng = mulberry32(6100 + variant);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 8, 1, "gravel");
  m.box(0, 52, 0, W, W, 1, "asphalt");
  m.box(0, 60, 0, W, W, 1, "parking");
  for (let x = 4; x < W; x += 7) m.box(x, 60, 0, x + 1, W, 1, "linewhite");
  m.box(0, 56, 0, W, 58, 1, "lineyellow");
  // containment: a broad white drum with a lumpy dome cap and a ring of buttresses
  m.box(30, 8, 0, 58, 36, 1, "darkconcrete");
  m.cylinder(44, 22, 13.0, 1, 36, "white");
  m.cylinder(44, 22, 13.4, 1, 6, "concrete");
  for (let a = 0; a < 12; a += 1) {
    const px = Math.floor(44 + Math.cos((a * Math.PI) / 6) * 13.2);
    const py = Math.floor(22 + Math.sin((a * Math.PI) / 6) * 13.2);
    m.box(px, py, 1, px + 1, py + 1, 30, "concrete");
  }
  m.cylinder(44, 22, 12.6, 30, 36, "white");
  m.cylinder(44, 22, 13.6, 36, 37, "concrete");
  m.blob(44, 22, 38, 13.4, 13.4, 5.5, "white", rng, 0.06, "concrete");
  m.box(43, 21, 43, 45, 23, 45, "steel");
  m.box(41, 34, 20, 42, 36, 34, "steel");
  for (let z = 12; z < 34; z += 6) m.box(40, 34, z, 43, 36, z + 1, "steel");
  // turbine hall: long box with a glazed clerestory roof and two doors
  m.box(4, 10, 1, 28, 46, 16, pick(["plaster", "corrugated", "limestone"], variant));
  m.box(4, 10, 1, 28, 46, 3, "darkconcrete");
  m.box(4, 9, 16, 28, 47, 17, "roofdark");
  m.box(8, 10, 17, 24, 46, 18, "roofglass");
  m.windows(4, 10, 28, 46, 3, 16, { floor: 5, offset: 0, height: 3, period: 6, width: 3, faces: ["w", "e"] });
  m.box(12, 45, 1, 22, 46, 11, "rolldoor");
  m.box(11, 45, 11, 23, 47, 12, "steel");
  m.box(16, 9, 1, 24, 10, 9, "rolldoor");
  // two cooling towers, stacked cylinders with a waist
  for (const [cx, cy, r] of [[56, 52, 9.0], [56, 30, 7.4]]) {
    m.cylinder(cx, cy, r + 1.2, 1, 3, "darkconcrete");
    m.cylinder(cx, cy, r, 3, 12, "concrete");
    m.cylinder(cx, cy, r - 1.6, 12, 26, "concrete");
    m.cylinder(cx, cy, r - 2.2, 26, 34, "concrete");
    m.cylinder(cx, cy, r - 1.2, 34, 42, "concrete");
    m.cylinder(cx, cy, r + 0.4, 42, 46, "concrete");
    m.cylinder(cx, cy, r + 0.8, 46, 47, "darkconcrete");
    for (let z = 8; z < 44; z += 9) m.cylinder(cx, cy, r + 0.6 - Math.abs(z - 24) / 8, z, z + 1, "white");
    for (let a = 0; a < 8; a += 1) {
      const px = Math.floor(cx + Math.cos((a * Math.PI) / 4) * (r + 0.8));
      const py = Math.floor(cy + Math.sin((a * Math.PI) / 4) * (r + 0.8));
      m.box(px, py, 1, px + 1, py + 1, 4, "concrete");
    }
  }
  // switchyard and pipe bridge between hall and containment
  m.box(4, 48, 0, 40, 58, 1, "gravel");
  for (const [x, y] of [[8, 50], [20, 50], [32, 50], [8, 56], [20, 56]]) addTransformer(m, x, y, 1);
  m.box(4, 48, 1, 5, 56, 12, "steel");
  m.box(28, 44, 11, 34, 46, 12, "steel");
  m.box(28, 44, 12, 30, 46, 13, "darksteel");
  // security fence with a gate on the street front and a gate house
  for (let x = 0; x < W; x += 2) if (x < 26 || x > 30) m.box(x, 58, 1, x + 1, 59, 6, "steel");
  m.box(0, 58, 5, W, 59, 6, "darksteel");
  m.box(0, 58, 3, W, 59, 4, "steel");
  m.box(26, 58, 0, 31, 60, 1, "paving");
  m.box(20, 58, 1, 26, 62, 7, "plaster");
  m.box(20, 58, 1, 26, 62, 2, "darkconcrete");
  m.box(21, 61, 3, 26, 62, 6, "glass");
  m.box(19, 57, 7, 27, 63, 8, "white");
  m.box(33, 58, 1, 36, 59, 14, "steel");
  m.box(32, 57, 11, 38, 60, 13, "signgreen");
  m.box(33, 57, 12, 37, 60, 12, "white");
  // staff car park and lawn
  for (const [x, y] of [[4, 62], [16, 62], [28, 62], [40, 62], [52, 62]]) addCar(m, x, y, 1, "y", pick(["carwhite", "carblue", "cargreen", "caryellow"], variant + x));
  addTree(m, 46, 62, 1, "round", 6200 + variant, 0.7);
  addTree(m, 2, 62, 1, "conifer", 6210 + variant, 0.7);
  addLamp(m, 1, 59, 1, "e");
  addLamp(m, 62, 59, 1, "w");
  return m;
}

// 4×4 · a solar farm: rows of tilted glassdark panels stepping up over grass,
// a service road with parking, two inverter sheds and a steel fence.
export function solar(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 26, "solar-farm");
  const rng = mulberry32(6300 + variant);
  void rng;
  m.box(0, 0, 0, W, W, 1, "grass");
  m.box(0, 48, 0, W, W, 1, "gravel");
  m.box(0, 52, 0, W, W, 1, "asphalt");
  m.box(0, 56, 0, W, W, 1, "parking");
  for (let x = 4; x < W; x += 7) m.box(x, 56, 0, x + 1, W, 1, "linewhite");
  // access road down the middle and a cross lane
  m.box(24, 2, 0, 30, 48, 1, "asphalt");
  m.box(0, 24, 0, W, 28, 1, "asphaltpatch");
  for (let y = 4; y < 46; y += 6) m.box(26, y, 0, 28, y + 3, 1, "lineyellow");
  // panel blocks: 4 bands of tilted rows, each row stepping up north
  for (let band = 0; band < 4; band += 1) {
    const y0 = 3 + band * 11;
    for (const [x0, x1] of [[2, 22], [32, 62]]) {
      for (let row = 0; row < 3; row += 1) {
        const y = y0 + row * 3;
        m.box(x0, y, 1, x1, y + 1, 2, "darksteel");
        m.box(x0, y, 2, x1, y + 1, 3, "glassdark");
        m.box(x0, y + 1, 3, x1, y + 2, 4, "glassdark");
        m.box(x0, y, 4, x1, y + 1, 5, "glass");
        for (let x = x0 + 4; x < x1; x += 6) {
          m.box(x, y, 1, x + 1, y + 2, 5, "steel");
        }
        if (row < 2) m.box(x0, y + 2, 0, x1, y + 3, 1, "grass");
      }
      m.box(x0 - 1, y0 - 1, 0, x1 + 1, y0 + 9, 1, "gravel");
    }
  }
  for (let band = 0; band < 4; band += 1) {
    const y0 = 3 + band * 11;
    m.box(2, y0 - 1, 0, 22, y0 + 9, 1, "gravel");
    m.box(32, y0 - 1, 0, 62, y0 + 9, 1, "gravel");
  }
  // re-paint the grass strips between the panel rows
  for (let band = 0; band < 4; band += 1) {
    for (let row = 0; row < 3; row += 1) {
      const y = 3 + band * 11 + row * 3 + 2;
      m.box(2, y, 0, 22, y + 1, 1, "grass");
      m.box(32, y, 0, 62, y + 1, 1, "grass");
    }
  }
  m.box(2, 12, 0, 22, 24, 1, "grass");
  // inverter sheds at the corner and along the lane
  m.box(2, 44, 1, 14, 52, 6, pick(["plaster", "corrugated", "cream"], variant));
  m.box(2, 44, 1, 14, 52, 2, "darkconcrete");
  m.box(3, 51, 3, 14, 52, 5, "glassdark");
  m.windows(2, 44, 14, 52, 3, 6, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "e"] });
  m.box(1, 43, 6, 15, 53, 7, "steel");
  m.flatRoof(2, 44, 14, 52, 7, "steel", "gravel");
  m.box(44, 44, 1, 58, 52, 6, pick(["corrugated", "plaster"], variant + 1));
  m.box(44, 44, 1, 58, 52, 2, "darkconcrete");
  m.box(45, 51, 3, 58, 52, 5, "glassdark");
  m.box(43, 43, 6, 59, 53, 7, "steel");
  m.box(46, 43, 1, 56, 44, 4, "steel");
  addAc(m, 4, 46, 8);
  addAc(m, 46, 46, 8);
  // fence around the solar field, with a gate at the access road
  for (let x = 0; x < W; x += 2) if (x < 24 || x > 30) m.box(x, 46, 1, x + 1, 47, 5, "steel");
  m.box(0, 46, 4, W, 47, 5, "steel");
  m.box(0, 46, 2, W, 47, 3, "darksteel");
  for (let y = 2; y < 46; y += 6) {
    m.box(0, y, 1, 1, y + 1, 5, "steel");
    m.box(W - 1, y, 1, W, y + 1, 5, "steel");
  }
  // service road, parking and yard props
  addCar(m, 4, 56, 1, "y", pick(["carwhite", "carblue"], variant + 2));
  addCar(m, 20, 56, 1, "y", pick(["cargreen", "caryellow"], variant + 3));
  addTruck(m, 40, 56, 1, "y", pick(["white", "yellow"], variant + 4));
  m.cylinder(62, 50, 1.4, 1, 4, pick(["blue", "rust"], variant + 5));
  m.box(60, 44, 1, 62, 46, 3, "darkconcrete");
  addLamp(m, 45, 53, 1, "n");
  addLamp(m, 15, 53, 1, "n");
  return m;
}

// 4×4 · a microwave power receiver: a huge white dish (a lumpy blob) tipped
// toward the sky on a lattice tower, hand-railed walkways, control buildings and
// two antenna masts, on a concrete apron ringed by lawn.
export function microwave(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 90, "microwave-receiver");
  const rng = mulberry32(6400 + variant);
  const tint = pick(["sky", "steel", "glass"], variant + 1);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 8, 1, "lawn");
  m.box(0, 50, 0, W, W, 1, "lawn");
  m.box(8, 10, 0, 56, 48, 1, "darkconcrete");
  m.box(0, 48, 0, W, W, 1, "paving");
  // lattice tower: four raked legs, ringed platforms every 12 voxels
  for (const [dx, dy] of [[-9, -9], [8, -9], [-9, 8], [8, 8]]) m.box(32 + dx, 29 + dy, 1, 33 + dx, 30 + dy, 46, "steel");
  for (let z = 2; z < 46; z += 3) {
    const r = Math.max(2, 10 - Math.floor(z / 6));
    m.box(32 - r, 29 - r, z, 32 + r + 1, 29 - r + 1, z + 1, "darksteel");
    m.box(32 - r, 29 + r, z, 32 + r + 1, 29 + r + 1, z + 1, "darksteel");
    m.box(32 - r, 29 - r, z, 32 - r + 1, 29 + r + 1, z + 1, "darksteel");
    m.box(32 + r, 29 - r, z, 32 + r + 1, 29 + r + 1, z + 1, "darksteel");
  }
  for (const z of [14, 26, 38]) {
    m.box(23, 20, z, 42, 39, z + 1, "steel");
    m.box(23, 20, z + 1, 24, 39, z + 2, "trim");
    m.box(41, 20, z + 1, 42, 39, z + 2, "trim");
    m.box(23, 20, z + 1, 42, 21, z + 2, "trim");
    m.box(23, 38, z + 1, 42, 39, z + 2, "trim");
  }
  m.box(22, 19, 38, 43, 40, 39, "darksteel");
  m.box(30, 27, 1, 36, 33, 4, "darkconcrete");
  m.cylinder(32.5, 29.5, 2.6, 1, 4, "darkconcrete");
  // the dish: a big lumpy white bowl on a tilted truss
  m.box(31, 28, 46, 34, 31, 52, "darksteel");
  m.box(28, 25, 50, 37, 34, 52, "steel");
  m.blob(32.5, 29.5, 62, 17, 17, 11, "white", rng, 0.08, tint);
  m.cylinder(32.5, 29.5, 9.0, 71, 74, "white");
  m.cylinder(32.5, 29.5, 6.0, 70, 71, "glassdark");
  m.box(31, 28, 62, 34, 31, 66, "steel");
  m.box(32, 29, 74, 33, 30, 78, "steel");
  m.set(32, 29, 78, "red");
  for (let a = 0; a < 6; a += 1) {
    const px = Math.floor(32.5 + Math.cos((a * Math.PI) / 3) * 15);
    const py = Math.floor(29.5 + Math.sin((a * Math.PI) / 3) * 15);
    m.box(px, py, 54, px + 1, py + 1, 56, "steel");
    m.box(px, py, 56, px + 1, py + 1, 57, "darksteel");
  }
  // control buildings at the street front
  m.box(4, 54, 1, 22, 66, 9, pick(["plaster", "white", "limestone"], variant + 2));
  m.box(4, 54, 1, 22, 66, 2, "darkconcrete");
  m.box(5, 65, 3, 22, 66, 7, "glassdark");
  for (let x = 6; x < 22; x += 3) m.box(x, 65, 3, x + 1, 66, 7, "mullion");
  m.windows(4, 54, 22, 66, 3, 9, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "w"] });
  m.box(3, 53, 9, 23, 67, 10, "white");
  m.flatRoof(4, 54, 22, 66, 10, "white", "gravel");
  addAc(m, 6, 56, 11);
  m.box(10, 53, 1, 16, 54, 5, pick(["blue", "signgreen"], variant + 3));
  m.box(11, 53, 2, 15, 54, 4, "white");
  m.box(30, 56, 1, 46, 68, 6, "steel");
  m.box(30, 56, 1, 46, 68, 2, "darkconcrete");
  m.box(31, 67, 3, 46, 68, 5, "glassdark");
  m.box(29, 55, 6, 47, 69, 7, "steel");
  // antenna masts and dishes on the apron
  addAntennaMast(m, 56, 20, 1, 46, 2);
  addAntennaMast(m, 12, 26, 1, 38, 2);
  m.box(10, 24, 1, 14, 28, 5, "concrete");
  m.box(52, 40, 1, 60, 46, 4, "darkconcrete");
  // fenced apron with a gate and a car
  for (let x = 0; x < W; x += 2) if (x < 30 || x > 34) m.box(x, 50, 1, x + 1, 51, 5, "steel");
  m.box(0, 50, 4, W, 51, 5, "steel");
  m.box(0, 50, 2, W, 51, 3, "steel");
  addCar(m, 48, 52, 1, "y", pick(["carwhite", "carblue"], variant + 4));
  addCar(m, 54, 52, 1, "y", "caryellow");
  addLamp(m, 1, 49, 1, "e");
  addLamp(m, 62, 49, 1, "w");
  addTree(m, 2, 2, 1, "conifer", 6500 + variant, 0.8);
  addTree(m, 61, 2, 1, "round", 6510 + variant, 0.8);
  return m;
}

// 4×4 · a fusion plant: a huge white torus ring building with a glowing windowlit
// band, cooling blocks and pipe runs, on a clean campus of lawn, walks and trees.
export function fusion(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 66, "fusion-plant");
  const accent = pick(["glass", "sky", "mint"], variant);
  void accent;
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(18, 6, 0, 46, 58, 1, "paving");
  m.box(0, 56, 0, W, W, 1, "paving");
  m.box(0, 62, 0, W, W, 1, "parking");
  for (let x = 4; x < W; x += 7) m.box(x, 62, 0, x + 1, W, 1, "linewhite");
  // the torus: outer cylinder, inner cylinder hollowed out
  const cx = 32;
  const cy = 30;
  m.cylinder(cx, cy, 18.0, 1, 3, "darkconcrete");
  m.cylinder(cx, cy, 17.4, 3, 30, "white");
  m.cylinder(cx, cy, 17.4, 3, 5, "concrete");
  // glowing band around the outer wall
  m.cylinder(cx, cy, 17.6, 14, 19, "windowlit");
  for (let a = 0; a < 16; a += 1) {
    const px = Math.floor(cx + Math.cos((a * Math.PI) / 8) * 17.6);
    const py = Math.floor(cy + Math.sin((a * Math.PI) / 8) * 17.6);
    m.box(px, py, 13, px + 1, py + 1, 14, "mullion");
    m.box(px, py, 19, px + 1, py + 1, 20, "mullion");
  }
  // hollow the courtyard and pave it, with the inner wall ring
  m.cylinder(cx, cy, 12.0, 3, 30, "white");
  m.cylinder(cx, cy, 11.0, 3, 30, 0);
  m.cylinder(cx, cy, 11.4, 3, 4, "concrete");
  m.cylinder(cx, cy, 11.0, 1, 3, "paving");
  m.cylinder(cx, cy, 17.4, 30, 31, "white");
  m.cylinder(cx, cy, 12.0, 30, 31, "white");
  // four radial connector halls at the diagonals
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ax = cx + dx * 15;
    const ay = cy + dy * 15;
    m.box(Math.min(ax, cx) + (dx > 0 ? 0 : -4), Math.min(ay, cy) + (dy > 0 ? 0 : -4), 3, Math.max(ax, cx) + (dx > 0 ? 4 : 0), Math.max(ay, cy) + (dy > 0 ? 4 : 0), 30, "white");
  }
  m.box(30, 28, 30, 34, 32, 42, "darksteel");
  m.box(28, 26, 42, 36, 34, 43, "steel");
  m.cylinder(32, 30, 2.4, 43, 48, "white");
  m.cylinder(32, 30, 3.0, 46, 48, "windowlit");
  // cooling blocks and pipe runs on the west and east pads
  m.box(2, 10, 1, 16, 26, 10, "steel");
  m.box(2, 10, 10, 16, 26, 11, "white");
  m.box(3, 11, 11, 15, 25, 15, "white");
  m.box(3, 11, 15, 15, 25, 16, "steel");
  m.box(2, 30, 1, 16, 46, 10, "steel");
  m.box(2, 30, 10, 16, 46, 11, "white");
  m.box(46, 10, 1, 60, 26, 12, "white");
  m.box(46, 10, 1, 60, 26, 2, "darkconcrete");
  m.box(46, 10, 12, 60, 26, 13, "steel");
  m.box(47, 25, 3, 60, 26, 10, "glassdark");
  m.box(46, 30, 1, 60, 46, 8, "plaster");
  m.box(46, 30, 1, 60, 46, 2, "darkconcrete");
  m.box(46, 45, 3, 60, 46, 6, "glassdark");
  m.box(45, 9, 13, 61, 27, 14, "white");
  m.flatRoof(46, 10, 60, 26, 14, "white", "gravel");
  for (const [x, y] of [[18, 12], [18, 46], [46, 12], [46, 46]]) {
    m.cylinder(x, y, 2.6, 1, 14, "tank");
    m.cylinder(x, y, 2.2, 14, 15, "steel");
  }
  for (const y of [12, 48]) {
    m.box(18, y, 12, 46, y + 1, 13, "steel");
    m.box(18, y, 13, 46, y + 1, 14, "darksteel");
  }
  m.box(18, 12, 1, 19, 48, 12, "steel");
  m.box(45, 12, 1, 46, 48, 12, "steel");
  // clean campus: lawn strips, benches and trees along the street front
  m.box(0, 56, 0, W, W, 1, "paving");
  m.box(28, 58, 0, 36, 62, 1, "paving");
  m.box(28, 60, 1, 36, 62, 4, "white");
  m.box(29, 61, 1, 30, 62, 4, "white");
  m.box(34, 61, 1, 35, 62, 4, "white");
  m.box(30, 61, 4, 34, 62, 5, "white");
  m.box(30, 60, 5, 34, 62, 6, "signgreen");
  for (const [x, y] of [[4, 58], [12, 58], [20, 58], [44, 58], [52, 58], [60, 58]]) {
    addTree(m, x, y, 1, variant % 2 ? "round" : "cherry", 6600 + x + variant, 0.85);
  }
  for (const [x, y] of [[4, 64], [20, 64], [44, 64], [60, 64]]) addCar(m, x, y, 1, "y", pick(["carwhite", "carblue", "cargreen", "caryellow"], variant + x));
  addLamp(m, 1, 57, 1, "e");
  addLamp(m, 62, 57, 1, "w");
  return m;
}

export const FACILITIES = {
  "facility.police": { size: 1, label: "Police station / 警察局", make: police },
  "facility.fire": { size: 1, label: "Firehouse / 消防站", make: fire },
  "facility.school": { size: 1, label: "School / 学校", make: school },
  "facility.clinic": { size: 1, label: "Clinic / 诊所", make: clinic },
  "facility.pump": { size: 1, label: "Pump house / 泵房", make: pump },
  "facility.tower": { size: 1, label: "Water tower / 水塔", make: tower },
  "facility.treatment": { size: 1, label: "Water treatment / 污水处理厂", make: treatment },
  "facility.subway-station": { size: 1, label: "Subway station / 地铁站", make: subwayStation },
  "facility.bus": { size: 1, label: "Bus depot / 公交停车场", make: bus },
  "facility.hydro": { size: 1, label: "Hydro unit / 小型水电站", make: hydro },
  "facility.wind": { size: 1, label: "Wind turbine / 风力发电机", make: wind },
  "facility.station": { size: 2, label: "Rail station / 火车站", make: station },
  "facility.desal": { size: 2, label: "Desalination plant / 海水淡化厂", make: desal },
  "facility.coal-2x2": { size: 2, label: "Small coal plant / 小型燃煤电厂", make: coal2x2 },
  "facility.coal": { size: 4, label: "Coal power plant / 燃煤电厂", make: coal },
  "facility.oil": { size: 4, label: "Oil power plant / 燃油电厂", make: oil },
  "facility.gas": { size: 4, label: "Gas power plant / 燃气电厂", make: gas },
  "facility.nuclear": { size: 4, label: "Nuclear plant / 核电站", make: nuclear },
  "facility.solar": { size: 4, label: "Solar farm / 太阳能电厂", make: solar },
  "facility.microwave": { size: 4, label: "Microwave receiver / 微波受电站", make: microwave },
  "facility.fusion": { size: 4, label: "Fusion plant / 聚变电站", make: fusion },
};
