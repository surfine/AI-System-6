// Bonsai City specials models, keyed by the atlas frame id they draw. Each entry:
// "frame.id": { size, label: "English / 中文", make(variant) } — size is the
// footprint edge in tiles, and make() returns a Model of size*16 × size*16
// with the lot surface at z = 0 and the street front facing +y.

import { Model, TILE_VOXELS as T, STOREY as S, mulberry32 } from "./voxel.mjs";
import { addTree, addCar, addLamp } from "./buildings.mjs";
import { LANDMARKS } from "./landmarks.mjs";

const pick = (list, variant) => list[((variant % list.length) + list.length) % list.length];

// Local props copied from civic.mjs (they are not exported there). ___________

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

// A chimney: a darkbrick shaft with light bands up top and a trim cap.
function addChimney(m, cx, cy, z, top, r, wall, band = "white", bandFrom = null) {
  const from = bandFrom == null ? Math.floor(top * 0.72) : bandFrom;
  for (let zz = z; zz < top; zz += 1) {
    const c = zz >= from && Math.floor(zz / 5) % 2 ? band : wall;
    m.cylinder(cx, cy, zz < top - 6 ? r : r - 0.4, zz, zz + 1, c);
  }
  m.cylinder(cx, cy, r - 0.4, top, top + 2, "trim");
}

// Pipes lying along x: tubes with darksteel collars on a low rack.
function addPipeStack(m, x0, x1, y, z, count, diameter = 2, colorMat = "steel") {
  for (let k = 0; k < count; k += 1) {
    const cy = y + k * (diameter + 1);
    m.box(x0, cy, z + 1, x1, cy + diameter, z + 1 + diameter, colorMat);
    for (let x = x0 + 2; x < x1; x += 6) m.box(x, cy, z + 1, x + 1, cy + diameter, z + 1 + diameter, "darksteel");
  }
  m.box(x0, y - 2, z, x1, y + count * (diameter + 1), z + 1, "darksteel");
}

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

// A board fence along x: posts every three voxels with two rails between.
function addFence(m, x0, x1, y, z, h = 5, colorMat = "wood") {
  for (let x = x0; x < x1; x += 3) m.box(x, y, z, x + 1, y + 1, z + h, colorMat);
  m.box(x0, y, z + h - 3, x1, y + 1, z + h - 2, colorMat);
  m.box(x0, y, z + 1, x1, y + 1, z + 2, colorMat);
}

// A wire fence along x: slim steel posts with a dark top rail.
function addChainFence(m, x0, x1, y, z, h = 6) {
  for (let x = x0; x < x1; x += 2) m.box(x, y, z, x + 1, y + 1, z + h, "steel");
  m.box(x0, y, z + h - 1, x1, y + 1, z + h, "darksteel");
  m.box(x0, y, z + 2, x1, y + 1, z + 3, "steel");
}

// A flagpole with a coloured pennant on a small plinth.
function addFlag(m, x, y, z, top, colorMat = "blue") {
  m.box(x, y, z, x + 1, y + 1, z + 1, "concrete");
  m.box(x, y, z + 1, x + 1, y + 1, top, "white");
  m.box(x + 1, y, top - 4, x + 6, y + 1, top - 1, colorMat);
  m.box(x + 1, y, top - 3, x + 5, y + 1, top - 2, "white");
  m.set(x, y, top, "steel");
}

// A fountain: a limestone basin with a round of water and a white jet.
function addFountain(m, cx, cy, z, r) {
  m.cylinder(cx, cy, r, z, z + 1, "limestone");
  m.cylinder(cx, cy, r - 0.8, z, z + 2, "poolwater");
  m.cylinder(cx, cy, r, z + 1, z + 2, "limestone");
  m.cylinder(cx, cy, r - 1.6, z + 2, z + 3, "water");
  m.box(Math.floor(cx), Math.floor(cy), z + 2, Math.floor(cx) + 1, Math.floor(cy) + 1, z + 6, "white");
  m.cylinder(cx, cy, 1.6, z + 6, z + 7, "white");
}

// Hedges round a rectangle, with an optional gap in the +y side.
function addHedgeRing(m, x0, y0, x1, y1, z, gapFrom = -1, gapTo = -1) {
  for (let x = x0; x < x1; x += 1) {
    m.box(x, y0, z, x + 1, y0 + 1, z + 2, "hedge");
    if (x < gapFrom || x >= gapTo) m.box(x, y1 - 1, z, x + 1, y1, z + 2, "hedge");
  }
  m.box(x0, y0, z, x0 + 1, y1, z + 2, "hedge");
  m.box(x1 - 1, y0, z, x1, y1, z + 2, "hedge");
}

// A paved path: a flat rectangle of pavers laid on the lot surface.
function addPath(m, x0, y0, x1, y1, kind = "paving") {
  m.box(x0, y0, 0, x1, y1, 1, kind);
}

// Wide stone steps rising away from the street, centred on cx.
function addSteps(m, cx, width, y0, count, z, kind = "limestone") {
  for (let k = 0; k < count; k += 1) m.box(cx - width, y0 + k, z, cx + width, y0 + k + 1, z + 1 + k, kind);
}

// A classical column: plinth, round shaft, square capital.
function addColumn(m, cx, cy, z, top, r = 1.2, kind = "white") {
  m.box(cx - 1, cy - 1, z, cx + 1, cy + 1, z + 1, kind);
  m.cylinder(cx, cy, r, z + 1, top - 1, kind);
  m.box(cx - 1, cy - 1, top - 1, cx + 1, cy + 1, top, kind);
}

function addCross(m, cx, cy, z, h = 7) {
  m.box(cx, cy, z, cx + 1, cy + 1, z + h, "white");
  m.box(cx - 2, cy, z + h - 4, cx + 3, cy + 1, z + h - 3, "white");
}

// A small sailing boat: white hull with a coloured stripe, mast and sail.
function addBoat(m, x, y, z, len, colorMat = "blue", axis = "y") {
  const [w, d] = axis === "y" ? [5, len] : [len, 5];
  m.box(x, y, z, x + w, y + d, z + 2, "white");
  m.box(x + 1, y + 1, z + 3, x + w - 1, y + d - 1, z + 4, colorMat);
  m.box(x, y, z + 2, x + w, y + d, z + 3, "white");
  if (axis === "y") {
    m.box(x + 2, y + 2, z + 4, x + 3, y + d - 2, z + 13, "white");
    m.box(x + 4, y + 4, z + 6, x + 4, y + d - 4, z + 12, "glass");
  } else {
    m.box(x + 2, y + 2, z + 4, x + len - 2, y + 3, z + 13, "white");
    m.box(x + 4, y + 4, z + 6, x + len - 4, y + 4, z + 12, "glass");
  }
}

// A gravestone: a small upright slab on a dark foot.
function addGrave(m, x, y, z, kind = "limestone") {
  m.box(x, y, z, x + 2, y + 1, z + 3, kind);
  m.box(x, y, z + 3, x + 2, y + 1, z + 4, "darkconcrete");
  m.set(x, y + 1, z + 2, "trim");
}

// A floodlight mast: a steel column with a bank of lamp heads at the top.
function addFloodlight(m, cx, cy, z, top, heads = 3) {
  m.box(cx, cy, z, cx + 1, cy + 1, z + 1, "darkconcrete");
  m.box(cx, cy, z + 1, cx + 1, cy + 1, top, "steel");
  for (let k = 0; k < heads; k += 1) {
    m.box(cx - 2, cy - 1 + k * 2, top, cx + 3, cy + k * 2 + 1, top + 2, "darksteel");
    m.box(cx - 2, cy - 1 + k * 2, top + 2, cx + 3, cy + k * 2 + 1, top + 3, "lamp");
  }
}

// ---------------------------------------------------------------- 3x3 civic

// 3×3 · a city hall: a stone block behind a six-column portico with a pediment,
// a clock tower capped by a green copper dome, wide steps, a flag and a formal
// lawn crossed by paths.
export function cityHall(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 66, "city-hall");
  const wall = pick(["limestone", "cream", "plaster"], variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  addPath(m, 4, 0, 12, W, "paving");
  addPath(m, 36, 0, 44, W, "paving");
  addPath(m, 0, 44, W, 48, "paving");
  m.box(0, 46, 0, W, W, 1, "sidewalk");
  // main block with stone bands and a cornice
  m.box(6, 6, 1, 42, 38, 22, wall);
  m.box(6, 6, 1, 42, 38, 3, "white");
  m.box(6, 6, 21, 42, 38, 22, "white");
  m.windows(6, 6, 42, 38, 4, 20, { floor: 5, offset: 1, height: 3, period: 5, width: 2, faces: ["w", "e", "n"] });
  m.box(5, 5, 22, 43, 39, 23, "white");
  m.flatRoof(6, 6, 42, 38, 23, "white", "gravel");
  // side wings stepping forward toward the street
  m.box(3, 22, 1, 12, 40, 16, wall);
  m.box(36, 22, 1, 45, 40, 16, wall);
  m.box(3, 22, 1, 12, 40, 2, "white");
  m.box(36, 22, 1, 45, 40, 2, "white");
  m.box(2, 21, 16, 13, 41, 17, "white");
  m.box(35, 21, 16, 46, 41, 17, "white");
  // portico: six white columns under an entablature and a pediment
  m.box(14, 38, 1, 22, 41, 18, wall);
  m.box(26, 38, 1, 34, 41, 18, wall);
  for (const x of [15, 20, 25, 31, 36, 39]) addColumn(m, x, 40, 2, 18, 1.3, "white");
  m.box(12, 38, 18, 42, 42, 20, "white");
  m.box(11, 37, 20, 43, 43, 21, "white");
  m.box(13, 38, 21, 41, 42, 22, "white");
  m.box(15, 39, 22, 39, 41, 23, "white");
  // doorway wall behind the columns
  for (const x of [14, 34, 10, 38]) m.box(x, 36, 3, x + 3, 38, 11, "window");
  m.clear(23, 35, 1, 29, 38, 12);
  m.box(23, 34, 1, 29, 36, 12, "door");
  m.box(23, 34, 12, 29, 36, 13, "white");
  // wide steps and a podium down to the street front
  addSteps(m, 26, 12, 42, 5, 1, "limestone");
  m.box(13, 46, 0, 39, 48, 1, "limestone");
  // clock tower with a copper dome, standing through the middle of the block
  m.box(22, 16, 23, 30, 26, 48, wall);
  m.box(21, 15, 48, 31, 27, 49, "white");
  m.box(23, 17, 26, 29, 25, 28, "white");
  m.box(21, 22, 22, 23, 26, 26, "window");
  m.box(29, 22, 22, 31, 26, 26, "window");
  m.box(24, 15, 34, 26, 17, 42, "white");
  m.cylinder(26, 22, 2.0, 38, 40, "windowlit");
  m.box(25, 30, 40, 27, 31, 44, "white");
  m.box(24, 28, 45, 28, 30, 46, "darksteel");
  m.box(24, 28, 46, 25, 30, 47, "darksteel");
  m.box(27, 28, 46, 28, 30, 47, "darksteel");
  m.cylinder(26, 21, 1.0, 48, 50, "steel");
  m.cylinder(26, 21, 4.6, 49, 50, "white");
  m.cylinder(26, 21, 4.4, 50, 52, "roofgreen");
  m.cylinder(26, 21, 3.4, 52, 54, "roofgreen");
  m.cylinder(26, 21, 2.2, 54, 56, "roofgreen");
  m.cylinder(26, 21, 1.0, 56, 58, "roofgreen");
  m.box(25, 20, 58, 27, 22, 61, "white");
  m.set(26, 21, 61, "yellow");
  // formal lawn, hedges, flag, benches and a pair of cars at the kerb
  addFlag(m, 5, 42, 1, 30, pick(["blue", "red"], variant));
  addHedgeRing(m, 2, 6, 13, 20, 1);
  addHedgeRing(m, 35, 6, 46, 20, 1);
  for (const [x, y, k] of [[6, 42, "round"], [13, 44, "round"], [39, 43, "conifer"], [32, 44, "round"], [3, 12, "conifer"], [44, 12, "round"], [3, 30, "cherry"], [44, 30, "round"]]) {
    addTree(m, x, y, 1, k, 7000 + x * 3 + y + variant, 0.85);
  }
  addBench(m, 16, 45, 1, "x");
  addBench(m, 32, 45, 1, "x");
  addLamp(m, 2, 46, 1, "e");
  addLamp(m, 45, 46, 1, "w");
  addCar(m, 4, 1, 1, "x", pick(["carwhite", "carblue"], variant));
  addCar(m, 38, 1, 1, "x", pick(["carred", "carwhite"], variant + 1));
  return m;
}

// 3×3 · a general hospital: two white wings joined by a glazed spine, a red cross
// standing on the roof, a helipad painted on the west roof, an ambulance bay
// under a canopy and a lined car park along the street.
export function hospital(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 62, "hospital");
  const wall = pick(["white", "plaster", "cream"], variant);
  const accent = pick(["sky", "mint", "blue"], variant);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 12, 1, "lawn");
  m.box(0, 48, 0, W, W, 1, "parking");
  for (let x = 3; x < W; x += 7) m.box(x, 52, 0, x + 1, W, 1, "linewhite");
  // two six-storey wings
  for (const x0 of [3, 33]) {
    m.box(x0, 12, 1, x0 + 12, 42, 40, wall);
    m.box(x0, 12, 1, x0 + 12, 42, 3, accent);
    m.windows(x0, 12, x0 + 12, 42, 3, 40, { floor: 5, offset: 0, height: 2, period: 4, width: 3, faces: ["w", "e", "n", "s"], margin: 2 });
    m.box(x0 - 1, 11, 40, x0 + 13, 43, 41, "white");
    m.flatRoof(x0, 12, x0 + 12, 42, 41, "white", "gravel");
    addAc(m, x0 + 2, 14, 42);
    addAc(m, x0 + 9, 38, 42);
  }
  // glazed spine between the wings
  m.box(15, 16, 1, 33, 38, 30, "white");
  m.box(15, 16, 1, 33, 38, 3, accent);
  for (let z = 5; z < 30; z += 5) m.box(15, 16, z, 33, 38, z + 3, "glass");
  for (let x = 16; x < 32; x += 3) m.box(x, 37, 5, x + 1, 38, 30, "mullion");
  m.box(14, 15, 30, 34, 39, 31, "white");
  m.flatRoof(15, 16, 33, 38, 31, "white", "gravel");
  // helipad: concentric painted rings and an H on the west wing roof
  m.cylinder(9, 30, 5.4, 41, 42, "darkconcrete");
  m.cylinder(9, 30, 4.6, 41, 42, "white");
  m.cylinder(9, 30, 3.6, 41, 42, "darkconcrete");
  m.cylinder(9, 30, 2.6, 41, 42, "white");
  m.box(8, 26, 41, 9, 34, 42, "trim");
  m.box(11, 26, 41, 12, 34, 42, "trim");
  m.box(9, 30, 41, 11, 31, 42, "trim");
  for (const [x, y] of [[5, 22], [12, 22], [5, 38], [12, 38]]) {
    m.box(x, y, 41, x + 1, y + 1, 43, "steel");
    m.set(x, y, 43, "red");
  }
  // a red cross standing on the spine roof
  m.box(19, 24, 32, 28, 26, 34, "red");
  m.box(23, 20, 32, 25, 30, 34, "red");
  m.box(19, 24, 34, 28, 26, 35, "red");
  m.box(23, 20, 34, 25, 30, 35, "red");
  // entrance canopy and the ambulance bay on the +y front
  m.box(20, 37, 1, 28, 38, 8, "glassdark");
  m.box(19, 39, 8, 29, 44, 9, "white");
  m.box(20, 39, 1, 21, 44, 8, "white");
  m.box(27, 39, 1, 28, 44, 8, "white");
  m.box(20, 42, 3, 28, 44, 4, "red");
  m.box(17, 39, 0, 31, 45, 1, "darkconcrete");
  m.box(21, 45, 0, 27, 48, 1, "lineyellow");
  // outpatient annex at the front-west corner
  m.box(1, 44, 1, 15, 56, 6, wall);
  m.box(1, 44, 1, 15, 56, 2, accent);
  m.windows(1, 44, 15, 56, 3, 6, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["e", "n"] });
  m.box(0, 43, 6, 16, 57, 7, "white");
  m.flatRoof(1, 44, 15, 56, 7, "white", "gravel");
  // car park and planting
  addCar(m, 3, 51, 1, "y", pick(["carwhite", "carblue"], variant + 1));
  addCar(m, 11, 51, 1, "y", pick(["carred", "carwhite"], variant + 2));
  addCar(m, 34, 51, 1, "y", pick(["cargreen", "carwhite"], variant + 3));
  addCar(m, 42, 51, 1, "y", "carblue");
  addLamp(m, 1, 48, 1, "e");
  addLamp(m, 46, 48, 1, "w");
  addTree(m, 20, 8, 1, "round", 7100 + variant, 0.8);
  addTree(m, 44, 8, 1, "conifer", 7110 + variant, 0.8);
  addTree(m, 2, 2, 1, "round", 7120 + variant, 0.7);
  addTree(m, 44, 46, 1, "round", 7130 + variant, 0.7);
  return m;
}

// 3×3 · a classical museum: limestone halls round a glazed centre court under a
// glass dome, a colonnade and a stepped triangular pediment on the +y front, and
// sculpture standing on the lawn between the paths.
export function museum(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 54, "museum");
  const wall = pick(["limestone", "cream", "plaster"], variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  addPath(m, 14, 0, 34, W, "paving");
  addPath(m, 0, 44, W, 48, "paving");
  m.box(0, 46, 0, W, W, 1, "sidewalk");
  // three connected halls round a hollow centre court
  m.box(6, 8, 1, 42, 22, 22, wall);
  m.box(6, 34, 1, 42, 48, 22, wall);
  m.box(6, 22, 1, 16, 34, 22, wall);
  m.box(32, 22, 1, 42, 34, 22, wall);
  for (const [x0, y0, x1, y1] of [[6, 8, 42, 22], [6, 34, 42, 48], [6, 22, 16, 34], [32, 22, 42, 34]]) {
    m.box(x0, y0, 1, x1, y1, 3, "white");
    m.box(x0, y0, 21, x1, y1, 22, "white");
    m.windows(x0, y0, x1, y1, 4, 20, { floor: 5, offset: 1, height: 4, period: 5, width: 2 });
    m.box(x0 - 1, y0 - 1, 22, x1 + 1, y1 + 1, 23, "white");
    m.flatRoof(x0, y0, x1, y1, 23, "white", "gravel");
  }
  // centre court: a round drum under a glass dome
  m.cylinder(24, 30, 8.4, 1, 2, "white");
  m.cylinder(24, 30, 7.6, 2, 22, "limestone");
  m.cylinder(24, 30, 7.6, 1, 3, "white");
  m.cylinder(24, 30, 7.6, 22, 24, "white");
  m.cylinder(24, 30, 7.0, 24, 26, "roofglass");
  m.cylinder(24, 30, 6.2, 26, 28, "roofglass");
  m.cylinder(24, 30, 5.2, 28, 30, "roofglass");
  m.cylinder(24, 30, 4.0, 30, 32, "roofglass");
  m.cylinder(24, 30, 2.6, 32, 34, "roofglass");
  m.cylinder(24, 30, 1.4, 34, 36, "roofglass");
  m.box(23, 29, 36, 25, 31, 38, "white");
  m.set(24, 30, 38, "yellow");
  for (let a = 0; a < 16; a += 1) {
    const px = Math.floor(24 + Math.cos((a * Math.PI) / 8) * 7.6);
    const py = Math.floor(30 + Math.sin((a * Math.PI) / 8) * 7.6);
    m.box(Math.min(px, 24), Math.min(py, 30), 22, Math.max(px, 24) + 1, Math.max(py, 30) + 1, 23, "white");
  }
  // colonnade and pediment on the +y hall
  for (const x of [10, 15, 20, 29, 34, 39]) addColumn(m, x, 44, 2, 18, 1.3, "white");
  m.box(8, 42, 18, 41, 48, 20, "white");
  m.box(7, 41, 20, 42, 49, 21, "white");
  m.box(11, 43, 21, 38, 47, 22, "white");
  m.box(15, 44, 22, 34, 46, 23, "white");
  m.box(19, 45, 23, 30, 46, 24, "white");
  m.box(23, 45, 24, 26, 46, 25, "white");
  m.box(13, 48, 12, 38, 49, 13, "white");
  m.clear(22, 47, 1, 28, 48, 12);
  m.box(22, 46, 1, 28, 48, 12, "door");
  addSteps(m, 25, 13, 48, 3, 1, "limestone");
  m.box(12, 51, 0, 38, 53, 1, "limestone");
  // sculpture on the lawn either side of the path, and plinths of flowerbeds
  m.box(3, 40, 1, 9, 46, 2, "limestone");
  addFountain(m, 6, 43, 2, 2.6);
  m.box(41, 40, 1, 45, 44, 3, "rock");
  m.box(40, 40, 1, 46, 46, 3, "limestone");
  m.box(42, 42, 3, 44, 44, 12, "roofgreen");
  m.box(41, 41, 3, 45, 45, 4, "roofgreen");
  m.box(42, 42, 12, 44, 44, 15, "roofgreen");
  m.box(41, 42, 6, 45, 44, 10, "roofgreen");
  m.box(2, 4, 0, 12, 12, 1, "floweryellow");
  m.box(3, 5, 1, 11, 11, 2, "flowerred");
  addTree(m, 44, 8, 1, "conifer", 7200 + variant, 0.85);
  addTree(m, 2, 14, 1, "round", 7210 + variant, 0.8);
  addTree(m, 44, 18, 1, "cherry", 7220 + variant, 0.8);
  addBench(m, 14, 51, 1, "x");
  addBench(m, 33, 51, 1, "x");
  addLamp(m, 1, 47, 1, "e");
  addLamp(m, 46, 47, 1, "w");
  addCar(m, 2, 1, 1, "x", pick(["carwhite", "carblue"], variant));
  addCar(m, 42, 1, 1, "x", pick(["carred", "caryellow"], variant + 1));
  return m;
}

// 3×3 · an oval stadium: stepped concrete rings banded with coloured seats, a
// green pitch with white markings in the middle, floodlight masts at four
// corners and a gate concourse on the street front.
export function stadium(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 60, "stadium");
  const seat = pick(["carblue", "carred"], variant);
  const seat2 = pick(["white", "caryellow"], variant);
  const rng = mulberry32(7300 + variant);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.cylinder(24, 24, 22.5, 1, 2, "darkconcrete");
  // pitch: the ellipse of grass, its touchlines and a halfway line
  m.cylinder(24, 24, 16.0, 1, 2, "lawn");
  m.cylinder(24, 24, 15.4, 2, 3, "lawn");
  m.cylinder(24, 24, 15.4, 1, 2, "lawn");
  for (let a = 0; a < 72; a += 1) {
    const px = Math.floor(24 + Math.cos((a * Math.PI) / 36) * 15.4);
    const py = Math.floor(24 + Math.sin((a * Math.PI) / 36) * 15.4);
    m.set(px, py, 2, "linewhite");
  }
  m.box(24, 9, 2, 25, 39, 3, "linewhite");
  m.box(24, 23, 2, 25, 25, 3, "linewhite");
  m.cylinder(24, 24, 3.4, 2, 3, "linewhite");
  m.cylinder(24, 24, 3.0, 2, 3, "lawn");
  for (const y of [12, 37]) m.box(19, y, 2, 30, y + 1, 3, "linewhite");
  for (const x of [19, 30]) m.box(x, 12, 2, x + 1, 37, 3, "linewhite");
  m.box(20, 12, 2, 29, 13, 3, "linewhite");
  m.box(20, 36, 2, 29, 37, 3, "linewhite");
  // tiered stands: rings of concrete, seat bands on the upper steps
  const rings = [[20.6, 6, 1], [18.6, 9, 2], [16.6, 12, 3], [14.6, 15, 4], [12.6, 18, 5], [10.6, 21, 6], [8.6, 24, 7]];
  for (const [r, h, step] of rings) {
    m.cylinder(24, 24, r, 1, h, "darkconcrete");
    m.cylinder(24, 24, r, h - 1, h, step % 3 === 0 ? seat2 : seat);
    m.cylinder(24, 24, r - 0.6, 1, h, "concrete");
    m.cylinder(24, 24, r - 0.6, 1, 3, "concrete");
    if (r < 16) m.cylinder(24, 24, r - 1.2, 3, h, 0);
  }
  m.cylinder(24, 24, 8.0, 1, 24, "darkconcrete");
  m.cylinder(24, 24, 6.6, 1, 24, "concrete");
  m.cylinder(24, 24, 6.2, 24, 25, 0);
  m.box(22, 22, 1, 26, 26, 26, "darkconcrete");
  m.cylinder(24, 24, 5.0, 26, 27, "steel");
  m.box(21, 21, 27, 27, 27, 28, "white");
  m.box(21, 21, 27, 21, 28, 28, "white");
  // floodlights on four corner masts
  for (const [x, y] of [[3, 3], [43, 3], [3, 43], [43, 43]]) addFloodlight(m, x, y, 1, 44, 3);
  // gate concourse and turnstiles on the +y front
  m.box(14, 44, 0, 34, W, 1, "paving");
  for (let x = 15; x < 34; x += 1) if ((x + 1) % 4 !== 0) m.box(x, 3, 8, x + 1, 4, 14, "steel");
  for (const x of [16, 23, 30]) {
    m.box(x, 2, 1, x + 2, 4, 3, "steel");
    m.set(x + 1, 3, 4, "lamp");
  }
  m.box(20, 1, 1, 28, 3, 2, "concrete");
  m.box(21, 1, 2, 27, 3, 5, "white");
  m.box(22, 1, 5, 26, 3, 6, "lineyellow");
  // queued fans, lamps and a pair of cars
  addCar(m, 4, 46, 1, "x", pick(["carwhite", "carblue", "carred"], variant));
  addCar(m, 38, 46, 1, "x", pick(["caryellow", "carwhite"], variant + 1));
  addLamp(m, 2, 46, 1, "e");
  addLamp(m, 45, 46, 1, "w");
  addTree(m, 3, 46, 1, "round", 7400 + variant, 0.7);
  addTree(m, 44, 46, 1, "conifer", 7410 + variant, 0.7);
  return m;
}

// 3×3 · a prison compound: a high grey perimeter wall with a walkway, watch
// towers at the corners, four cell blocks pierced by small barred windows and a
// walled exercise yard with a weight shelter.
export function prison(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 48, "prison");
  const wall = pick(["concrete", "darkconcrete"], variant);
  m.box(0, 0, 0, W, W, 1, "gravel");
  m.box(0, 46, 0, W, W, 1, "asphalt");
  // perimeter wall with a patrol walkway and razor trim
  for (const [w, x, y] of [[16, 0, 1], [16, 0, 46]]) m.box(x, y, 1, W, y + 1, 16, wall);
  for (const [x] of [[1], [46]]) m.box(x, 1, 1, x + 1, 47, 16, wall);
  m.box(0, 0, 1, W, 1, 16, wall);
  m.box(0, 0, 15, W, 1, 17, "darkconcrete");
  m.box(0, 46, 15, W, 47, 17, "darkconcrete");
  m.box(0, 0, 15, 1, 47, 17, "darkconcrete");
  m.box(46, 0, 15, 47, 47, 17, "darkconcrete");
  for (let x = 1; x < W - 1; x += 2) {
    m.set(x, 1, 17, "steel");
    m.set(x, 46, 17, "steel");
  }
  for (let y = 1; y < W - 1; y += 2) {
    m.set(1, y, 17, "steel");
    m.set(46, y, 17, "steel");
  }
  // gate on the +y front with a portcullis and a gatehouse
  m.box(19, 45, 1, 29, 48, 20, wall);
  m.box(20, 45, 1, 28, 47, 13, "trim");
  m.box(20, 46, 13, 28, 47, 14, "darksteel");
  for (let x = 20; x < 28; x += 2) m.box(x, 45, 1, x + 1, 47, 13, "darksteel");
  m.box(18, 44, 0, 30, W, 1, "concrete");
  // corner watch towers
  for (const [x, y] of [[2, 2], [41, 2], [2, 41], [41, 41]]) {
    m.box(x, y, 1, x + 4, y + 4, 26, wall);
    m.box(x + 1, y + 1, 26, x + 5, y + 5, 28, "darkconcrete");
    m.box(x, y, 28, x + 6, y + 6, 29, "roofdark");
    m.box(x, y, 29, x + 6, y + 6, 30, "trim");
    m.box(x + 1, y + 1, 26, x + 5, y + 5, 27, "window");
    m.set(x + 2, y + 2, 27, "windowlit");
    m.box(x + 2, y + 2, 30, x + 3, y + 3, 32, "steel");
    m.set(x + 2, y + 2, 32, "lamp");
  }
  // four cell blocks: long slabs of small barred windows in two rows
  for (let k = 0; k < 2; k += 1) {
    const y0 = 8 + k * 18;
    m.box(7, y0, 1, 39, y0 + 9, 22, wall);
    m.box(7, y0, 1, 39, y0 + 9, 3, "darkconcrete");
    m.box(7, y0, 21, 39, y0 + 9, 22, "trim");
    m.flatRoof(7, y0, 39, y0 + 9, 23, "trim", "gravel");
    for (let z = 5; z < 20; z += 6) {
      for (let x = 9; x < 38; x += 3) {
        m.box(x, y0, z, x + 1, y0 + 1, z + 3, "trim");
        m.box(x, y0 + 1, z + 1, x + 1, y0 + 2, z + 2, "window");
        m.box(x, y0 + 8, z, x + 1, y0 + 9, z + 3, "trim");
        m.box(x, y0 + 8, z + 1, x + 1, y0 + 8, z + 2, "window");
      }
    }
    for (const x of [12, 33]) {
      m.clear(x, y0 + 8, 1, x + 2, y0 + 9, 8);
      m.box(x, y0 + 7, 1, x + 2, y0 + 9, 8, "darksteel");
    }
    addPipeStack(m, 41, 45, y0 + 1, 1, 2, 2, "steel");
  }
  // exercise yard with a weight shelter, benches and a hoop
  m.box(4, 40, 0, 42, 44, 1, "darkconcrete");
  m.box(5, 41, 0, 14, 44, 1, "sand");
  m.box(6, 41, 1, 13, 44, 2, "sand");
  m.box(30, 40, 1, 41, 44, 2, "darkconcrete");
  m.box(31, 41, 2, 40, 44, 8, "corrugated");
  m.box(30, 40, 8, 42, 45, 9, "roofdark");
  for (const x of [32, 38]) m.box(x, 41, 1, x + 1, 42, 8, "steel");
  m.box(17, 42, 1, 21, 43, 2, "wood");
  m.box(17, 44, 1, 21, 45, 2, "wood");
  m.box(15, 41, 4, 16, 42, 5, "steel");
  m.box(15, 41, 3, 16, 42, 4, "white");
  // service yard on the west with the laundry, kitchen and a truck
  m.box(3, 38, 1, 15, 45, 5, pick(["plaster", "concrete"], variant + 1));
  m.box(3, 38, 1, 15, 45, 2, "darkconcrete");
  m.box(4, 44, 3, 15, 45, 4, "glassdark");
  m.box(2, 37, 5, 16, 46, 6, "trim");
  m.windows(3, 38, 15, 45, 3, 5, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["e", "n"] });
  addTruck(m, 20, 40, 1, "x", "white");
  addLamp(m, 6, 46, 1, "e");
  addLamp(m, 40, 46, 1, "w");
  return m;
}

// 3×3 · a college campus: a brick main hall with a bell tower, two smaller
// teaching wings, and a quad of lawn with crossing paths, flower beds and trees.
export function college(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 58, "college");
  const wall = pick(["brick", "darkbrick"], variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  addPath(m, 4, 0, 12, W, "paving");
  addPath(m, 36, 0, 44, W, "paving");
  addPath(m, 0, 20, W, 24, "paving");
  addPath(m, 46, 0, W, W, "sidewalk");
  // main hall with a pitched roof, across the back of the quad
  m.box(12, 30, 1, 36, 46, 20, wall);
  m.box(12, 30, 1, 36, 46, 2, "limestone");
  m.windows(12, 30, 36, 46, 4, 18, { floor: 5, offset: 1, height: 4, period: 5, width: 2, faces: ["w", "e"] });
  m.gable(12, 30, 36, 46, 20, "x", "roofslate", wall, 1);
  for (const x of [16, 24, 31]) {
    m.clear(x, 45, 3, x + 4, 46, 14);
    m.box(x, 44, 2, x + 4, 46, 14, "window");
    m.box(x, 44, 14, x + 4, 46, 15, "window");
    m.box(x, 44, 2, x + 4, 46, 3, "limestone");
    m.box(x + 1, 44, 15, x + 3, 46, 16, "limestone");
  }
  m.clear(22, 44, 1, 26, 46, 10);
  m.box(22, 43, 1, 26, 45, 10, "doorgreen");
  m.box(21, 43, 10, 27, 47, 11, "limestone");
  // bell tower on the east end of the hall
  m.box(37, 34, 1, 45, 42, 34, wall);
  m.box(37, 34, 1, 45, 42, 3, "limestone");
  m.box(39, 41, 22, 42, 42, 27, "window");
  m.box(38, 35, 27, 40, 37, 29, "window");
  m.box(37, 34, 33, 45, 42, 34, "limestone");
  m.flatRoof(37, 34, 45, 42, 34, "limestone", "gravel");
  for (const [x, y] of [[38, 35], [43, 35], [38, 40], [43, 40]]) m.box(x, y, 35, x + 1, y + 1, 36, "limestone");
  m.box(36, 33, 36, 46, 43, 37, "roofslate");
  m.box(37, 34, 37, 45, 42, 46, "brick");
  m.box(37, 34, 37, 45, 42, 39, "limestone");
  m.box(38, 35, 40, 41, 38, 44, "window");
  m.box(38, 35, 42, 44, 41, 43, "limestone");
  m.box(36, 33, 46, 46, 43, 48, "roofslate");
  m.hip(37, 34, 45, 42, 48, "roofslate", 1);
  m.box(39, 36, 51, 43, 40, 52, "limestone");
  m.box(40, 37, 52, 42, 39, 53, "limestone");
  m.box(41, 37, 53, 42, 39, 54, "trim");
  // two teaching wings flanking the quad
  for (const x0 of [2, 34]) {
    m.box(x0, 6, 1, x0 + 10, 26, 16, wall);
    m.box(x0, 6, 1, x0 + 10, 26, 2, "limestone");
    m.box(x0, 6, 15, x0 + 10, 26, 16, "limestone");
    m.windows(x0, 6, x0 + 10, 26, 4, 14, { floor: 5, offset: 1, height: 3, period: 4, width: 2, faces: ["e", "w"] });
    m.gable(x0, 6, x0 + 10, 26, 16, "y", "roofred", wall, 1);
    m.clear(x0 + 4, 25, 1, x0 + 7, 26, 8);
    m.box(x0 + 4, 24, 1, x0 + 7, 26, 8, "door");
    m.box(x0 + 3, 24, 8, x0 + 8, 27, 9, "limestone");
  }
  // the quad: lawn, flower beds and a walk of trees
  m.box(14, 6, 0, 32, 30, 1, "lawn");
  m.box(16, 8, 0, 30, 11, 1, "floweryellow");
  m.box(18, 9, 1, 28, 10, 2, "flowerred");
  m.box(16, 25, 0, 30, 28, 1, "floweryellow");
  m.box(18, 26, 1, 28, 27, 2, "flowerred");
  m.cylinder(23, 18, 3.6, 0, 1, "paving");
  m.cylinder(23, 18, 2.4, 1, 2, "grass");
  addTree(m, 23, 18, 2, "round", 7500 + variant, 0.7);
  for (const [x, y, k] of [[15, 8, "round"], [31, 8, "cherry"], [15, 28, "conifer"], [31, 28, "round"], [6, 30, "round"], [40, 30, "round"]]) {
    addTree(m, x, y, 1, k, 7510 + x * 3 + y + variant, 0.85);
  }
  addBench(m, 16, 19, 1, "x");
  addBench(m, 28, 22, 1, "x");
  addFlag(m, 24, 27, 1, 26, pick(["blue", "red"], variant));
  m.box(0, 0, 0, 4, 4, 1, "parking");
  addCar(m, 1, 1, 1, "y", pick(["carblue", "carwhite"], variant));
  addCar(m, 44, 1, 1, "y", pick(["carred", "cargreen"], variant + 1));
  addLamp(m, 2, 46, 1, "e");
  addLamp(m, 45, 46, 1, "w");
  return m;
}

// 3×3 · a zoo: lawns and winding paths, a pink-island pond, fenced enclosures
// with a grey elephant and a spotted giraffe built from voxels, and a gated
// entrance on the street front.
export function zoo(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 40, "zoo");
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(18, 46, 0, 30, W, 1, "paving");
  addPath(m, 4, 4, 10, 40, "paving");
  addPath(m, 4, 4, 40, 10, "paving");
  addPath(m, 34, 10, 40, 46, "paving");
  addPath(m, 10, 38, 34, 44, "paving");
  addPath(m, 10, 20, 34, 26, "paving");
  // entrance gate: twin brick piers, a timber arch and a ticket hut
  for (const x of [19, 28]) {
    m.box(x, 44, 1, x + 2, 48, 14, pick(["brick", "darkbrick"], variant));
    m.box(x, 44, 14, x + 2, 48, 16, "limestone");
    m.box(x - 1, 43, 16, x + 3, 48, 17, "limestone");
    m.set(x + 1, 44, 17, "roofgreen");
  }
  m.box(20, 46, 17, 30, 48, 19, "roofgreen");
  m.box(21, 45, 19, 29, 48, 20, "roofgreen");
  m.box(21, 47, 12, 29, 48, 15, "wood");
  m.box(13, 44, 1, 18, 48, 8, "limestone");
  m.box(13, 44, 1, 18, 48, 2, "roofred");
  m.windows(13, 44, 18, 48, 3, 7, { floor: 4, offset: 1, height: 2, period: 3, width: 2, faces: ["w", "n"] });
  m.hip(13, 44, 18, 48, 8, "roofred", 1);
  m.box(31, 44, 1, 36, 48, 6, "wood");
  m.gable(31, 44, 36, 48, 6, "x", "roofbrown", "wood", 1);
  m.box(24, 49, 1, 25, 50, 20, "steel");
  m.box(22, 49, 16, 31, 50, 18, "signgreen");
  m.box(23, 49, 17, 30, 50, 18, "white");
  // pond with a pink island and reeds on the west
  m.box(2, 26, 0, 18, 40, 1, "water");
  m.box(3, 27, 0, 17, 39, 1, "water");
  m.cylinder(10, 33, 3.4, 0, 1, "pink");
  m.cylinder(10, 33, 2.6, 1, 2, "pink");
  addTree(m, 10, 33, 2, "cherry", 7600 + variant, 0.55);
  for (const [x, y] of [[4, 27], [16, 28], [5, 39], [15, 39]]) m.box(x, y, 1, x + 1, y + 1, 4, "conifer");
  for (const [x, y] of [[3, 27], [17, 38], [11, 26]]) m.box(x, y, 1, x + 1, y + 1, 2, "hedge");
  m.box(2, 25, 0, 18, 26, 1, "sand");
  m.box(2, 40, 0, 18, 41, 1, "sand");
  // elephant paddock: sand and grass behind a fence
  addChainFence(m, 20, 42, 32, 0, 6);
  addChainFence(m, 20, 42, 43, 0, 6);
  m.box(22, 33, 0, 40, 42, 1, "sand");
  m.box(30, 34, 0, 40, 42, 1, "lawn");
  m.box(23, 34, 0, 29, 42, 1, "lawn");
  m.box(25, 34, 1, 32, 36, 4, "poolwater");
  m.box(24, 33, 0, 33, 35, 1, "darkconcrete");
  // the elephant: a blocky grey steel body with a trunk arching down
  m.box(31, 36, 3, 41, 44, 14, "steel");
  m.box(31, 36, 12, 41, 44, 14, "darksteel");
  m.box(40, 37, 6, 44, 43, 18, "steel");
  m.box(40, 38, 16, 44, 42, 19, "darksteel");
  m.box(42, 38, 18, 45, 42, 20, "steel");
  m.box(43, 39, 4, 46, 41, 19, "steel");
  m.box(43, 39, 8, 46, 41, 12, "darksteel");
  m.box(32, 35, 1, 34, 37, 3, "steel");
  m.box(38, 35, 1, 40, 37, 3, "steel");
  m.box(32, 43, 1, 34, 45, 3, "steel");
  m.box(38, 43, 1, 40, 45, 3, "steel");
  for (const [x, y, k] of [[22, 40, "conifer"], [36, 32, "round"]]) addTree(m, x, y, 1, k, 7700 + x + variant, 0.7);
  // giraffe paddock: taller stakes and a yellow, trunk-brown-spotted animal
  for (let x = 20; x < 42; x += 3) m.box(x, 12, 1, x + 1, 13, 12, "wood");
  m.box(20, 12, 9, 42, 13, 11, "wood");
  m.box(20, 12, 3, 42, 13, 4, "wood");
  m.box(20, 12, 1, 21, 42, 12, "wood");
  m.box(41, 12, 1, 42, 42, 12, "wood");
  m.box(22, 14, 0, 40, 30, 1, "lawn");
  m.box(22, 14, 0, 40, 20, 1, "sand");
  m.box(28, 16, 4, 34, 20, 20, "yellow");
  for (const [x, y, z] of [[29, 17, 8], [31, 18, 12], [33, 19, 6], [28, 19, 16], [33, 17, 16], [30, 16, 5]]) m.box(x, y, z, x + 2, y + 2, z + 3, "trunk");
  m.box(34, 17, 16, 40, 20, 20, "yellow");
  for (const [x, y, z] of [[36, 18, 17], [38, 19, 18], [39, 17, 17]]) m.box(x, y, z, x + 2, y + 2, z + 2, "trunk");
  m.box(38, 18, 20, 42, 20, 24, "yellow");
  m.box(39, 18, 24, 40, 19, 25, "trunk");
  m.box(41, 18, 22, 42, 20, 24, "trunk");
  m.box(28, 16, 1, 30, 18, 5, "yellow");
  m.box(31, 16, 1, 33, 18, 5, "yellow");
  m.box(28, 19, 1, 30, 21, 5, "yellow");
  m.box(31, 19, 1, 33, 21, 5, "yellow");
  // aviary and a keeper's hut
  m.box(2, 12, 1, 14, 22, 12, "steel");
  m.box(3, 13, 4, 13, 21, 11, "glass");
  m.box(2, 12, 12, 15, 23, 13, "darksteel");
  m.box(2, 12, 1, 15, 13, 3, "darkconcrete");
  addTree(m, 8, 17, 1, "conifer", 7800 + variant, 0.6);
  m.box(2, 2, 1, 10, 8, 6, "limestone");
  m.box(2, 2, 1, 10, 8, 2, "roofdark");
  m.hip(2, 2, 10, 8, 6, "roofred", 1);
  addBench(m, 20, 45, 1, "x");
  addBench(m, 32, 45, 1, "x");
  addLamp(m, 2, 45, 1, "e");
  addLamp(m, 44, 45, 1, "w");
  return m;
}

// ---------------------------------------------------------------- landmarks

// 1×1 · a hero statue: a limestone plinth under a bronze-green figure with a
// raised arm, low hedges round the apron, flower beds and two benches.
export function statue(variant = 0) {
  const m = new Model(T, T, 34, "statue");
  const pose = pick(["wave", "salute", "sword"], variant);
  m.box(0, 0, 0, T, T, 1, "paving");
  m.box(3, 3, 0, 13, 13, 1, "paving");
  m.box(1, 1, 0, 15, 15, 1, "sand");
  m.box(4, 4, 1, 12, 12, 3, "limestone");
  m.box(5, 5, 3, 11, 11, 5, "white");
  m.box(6, 6, 5, 10, 10, 7, "limestone");
  m.box(5, 5, 5, 6, 6, 8, "darkconcrete");
  m.box(9, 9, 5, 10, 10, 8, "darkconcrete");
  // the figure: legs, torso, head and an arm according to the variant
  m.box(7, 7, 7, 9, 8, 13, "roofgreen");
  m.box(6, 7, 13, 10, 9, 19, "roofgreen");
  m.box(5, 7, 16, 6, 9, 19, "roofgreen");
  m.box(10, 7, 16, 11, 9, 19, "roofgreen");
  m.box(7, 7, 19, 9, 9, 22, "roofgreen");
  m.box(6, 6, 19, 6, 6, 22, "roofgreen");
  m.box(10, 6, 19, 10, 6, 22, "roofgreen");
  if (pose === "wave") {
    m.box(5, 7, 20, 6, 9, 24, "roofgreen");
    m.box(10, 7, 22, 12, 9, 26, "roofgreen");
    m.box(12, 7, 26, 14, 9, 28, "roofgreen");
  } else if (pose === "salute") {
    m.box(5, 7, 20, 6, 9, 22, "roofgreen");
    m.box(9, 7, 22, 10, 9, 25, "roofgreen");
    m.box(8, 7, 24, 10, 9, 26, "roofgreen");
  } else {
    m.box(5, 7, 20, 6, 9, 25, "roofgreen");
    m.box(10, 7, 20, 11, 9, 25, "roofgreen");
    m.box(5, 5, 25, 11, 6, 27, "steel");
    m.box(7, 5, 27, 8, 6, 29, "steel");
  }
  m.box(7, 7, 22, 9, 9, 25, "roofgreen");
  m.box(6, 6, 25, 10, 10, 28, "roofgreen");
  m.box(7, 7, 28, 9, 9, 30, "roofgreen");
  // planting, beds and benches round the plinth
  addHedgeRing(m, 1, 1, 15, 15, 1, 5, 11);
  m.box(0, 0, 0, 4, 4, 1, "flowerred");
  m.box(0, 12, 0, 4, T, 1, "floweryellow");
  m.box(12, 0, 0, T, 4, 1, "floweryellow");
  m.box(12, 12, 0, T, T, 1, "flowerred");
  addBench(m, 12, 7, 1, "y");
  addBench(m, 1, 7, 1, "y");
  addTree(m, 1.5, 1.5, 1, "conifer", 7900 + variant, 0.6);
  addTree(m, 13.5, 13.5, 1, "round", 7910 + variant, 0.6);
  addLamp(m, 14, 6, 1, "w");
  addLamp(m, 1, 9, 1, "e");
  return m;
}

// 3×3 · a big city park: winding paved paths, a lake with a plank bridge, a
// bandstand gazebo, many mixed trees, flower beds and benches along the walks.
export function parkBig(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 38, "park-big");
  const rng = mulberry32(8000 + variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(0, 46, 0, W, W, 1, "sidewalk");
  // winding walks: a diagonal spine and two sweeping branches
  for (let k = 0; k < 34; k += 1) {
    const y = 2 + k * 1.6;
    const x = Math.round(22 + Math.sin(k / 5) * 7);
    m.box(x - 2, Math.floor(y), 0, x + 2, Math.floor(y) + 2, 1, "paving");
  }
  for (let k = 0; k < 20; k += 1) {
    const x = 2 + k * 1.6;
    const y = Math.round(30 + Math.cos(k / 4) * 6);
    m.box(Math.floor(x), y - 1, 0, Math.floor(x) + 2, y + 1, 1, "paving");
  }
  for (let k = 0; k < 20; k += 1) {
    const x = 24 + k * 1.6;
    const y = Math.round(38 - Math.cos(k / 4) * 5);
    m.box(Math.floor(x), y - 1, 0, Math.floor(x) + 2, y + 1, 1, "paving");
  }
  m.box(20, 46, 0, 26, W, 1, "paving");
  // lake with an island, reeds, ducks and a timber bridge
  m.box(24, 6, 0, 44, 22, 1, "water");
  m.cylinder(30, 12, 4.4, 0, 1, "water");
  m.cylinder(30, 12, 3.0, 0, 1, "sand");
  m.cylinder(30, 12, 2.6, 1, 3, "sand");
  addTree(m, 30, 12, 3, "round", 8010 + variant, 0.55);
  for (const [x, y] of [[25, 7], [43, 8], [26, 21], [41, 21], [34, 6], [34, 21]]) m.box(x, y, 1, x + 1, y + 1, 3, "hedge");
  m.box(26, 14, 0, 27, 16, 1, "sand");
  m.box(41, 12, 0, 42, 14, 1, "sand");
  m.box(20, 14, 1, 46, 16, 3, "wood");
  m.box(19, 13, 1, 22, 17, 5, "wood");
  m.box(44, 13, 1, 47, 17, 5, "wood");
  m.box(20, 14, 0, 46, 16, 1, "darksteel");
  // bandstand gazebo: an octagonal deck under a steep roof
  m.cylinder(10, 38, 6.0, 0, 2, "darkconcrete");
  m.cylinder(10, 38, 5.4, 1, 3, "wood");
  for (let a = 0; a < 8; a += 1) {
    const px = Math.floor(10 + Math.cos((a * Math.PI) / 4) * 5);
    const py = Math.floor(38 + Math.sin((a * Math.PI) / 4) * 5);
    m.box(px, py, 3, px + 1, py + 1, 13, "white");
  }
  m.cylinder(10, 38, 5.6, 12, 13, "white");
  m.cylinder(10, 38, 5.6, 13, 14, "roofgreen");
  m.cylinder(10, 38, 4.6, 14, 15, "roofgreen");
  m.cylinder(10, 38, 3.6, 15, 16, "roofgreen");
  m.cylinder(10, 38, 2.4, 16, 17, "roofgreen");
  m.cylinder(10, 38, 1.2, 17, 18, "roofgreen");
  m.set(10, 38, 18, "yellow");
  m.box(6, 34, 1, 14, 35, 2, "wood");
  // flower beds and a bowling-green lawn
  m.box(2, 2, 0, 18, 10, 1, "floweryellow");
  m.box(4, 4, 1, 16, 8, 2, "flowerred");
  m.box(14, 24, 0, 24, 30, 1, "floweryellow");
  m.box(16, 25, 1, 22, 29, 2, "flowerred");
  m.box(2, 42, 0, 12, 45, 1, "hedge");
  m.box(28, 42, 0, 44, 45, 1, "hedge");
  m.box(30, 24, 0, 44, 40, 1, "grass");
  // the grove: many trees of mixed kinds, denser round the lake and the edge
  const spots = [
    [3, 12, "round", 0.9], [2, 20, "conifer", 0.85], [8, 16, "round", 0.8], [14, 14, "cherry", 0.8],
    [3, 30, "round", 0.85], [16, 34, "round", 0.9], [6, 44, "conifer", 0.7], [20, 44, "round", 0.75],
    [26, 30, "round", 0.9], [36, 30, "cherry", 0.8], [44, 26, "round", 0.9], [46, 38, "conifer", 0.8],
    [34, 44, "round", 0.85], [44, 44, "round", 0.7], [20, 2, "round", 0.9], [12, 24, "conifer", 0.8],
    [46, 8, "round", 0.8], [24, 20, "cherry", 0.75], [40, 4, "round", 0.7], [18, 40, "conifer", 0.75],
  ];
  for (const [x, y, k, sc] of spots) addTree(m, x + (rng() < 0.5 ? 0.5 : 0), y + (rng() < 0.5 ? 0.5 : 0), 1, k, 8100 + x * 7 + y + variant, sc);
  addBench(m, 20, 34, 1, "x");
  addBench(m, 24, 22, 1, "x");
  addBench(m, 4, 26, 1, "y");
  addBench(m, 40, 42, 1, "x");
  addLamp(m, 2, 47, 1, "e");
  addLamp(m, 45, 47, 1, "w");
  addLamp(m, 22, 44, 1, "n");
  addCar(m, 2, 47, 1, "x", pick(["carwhite", "carblue"], variant));
  addCar(m, 40, 47, 1, "x", pick(["carred", "cargreen"], variant + 1));
  return m;
}

// 2×2 · a limestone library: a domed reading room with tall arched windows, a
// portico on the +y front and two sand-coloured lion statues on the steps.
export function library(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 52, "library");
  const wall = pick(["limestone", "cream", "plaster"], variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  addPath(m, 10, 0, 22, W, "paving");
  addPath(m, 0, 28, W, 32, "paving");
  m.box(0, 22, 0, W, W, 1, "sidewalk");
  // the hall: a tall block with arched windows all round
  m.box(6, 6, 1, 26, 24, 26, wall);
  m.box(6, 6, 1, 26, 24, 3, "white");
  m.box(6, 6, 25, 26, 24, 26, "white");
  m.flatRoof(6, 6, 26, 24, 27, "white", "gravel");
  for (const [x, y, axis] of [[9, 6, "x"], [15, 6, "x"], [21, 6, "x"], [9, 23, "x"], [15, 23, "x"], [21, 23, "x"]]) {
    m.clear(x, y, 4, x + 3, y + 1, 20);
    m.box(x, y === 6 ? 6 : 22, 3, x + 3, y === 6 ? 7 : 23, 21, "window");
    m.box(x + 1, y === 6 ? 6 : 22, 21, x + 2, y === 6 ? 7 : 23, 22, "window");
    m.box(x - 1, y === 6 ? 6 : 22, 3, x, y === 6 ? 7 : 23, 22, "white");
    m.box(x + 3, y === 6 ? 6 : 22, 3, x + 4, y === 6 ? 7 : 23, 22, "white");
  }
  for (const [y] of [[9], [15], [21]]) {
    m.box(6, y, 3, 7, y + 3, 21, "window");
    m.box(25, y, 3, 26, y + 3, 21, "window");
  }
  m.windows(6, 6, 26, 24, 3, 26, { floor: 8, offset: 6, height: 3, period: 6, width: 2, faces: ["w", "e", "n", "s"], margin: 3 });
  // the dome: a round drum with a ribbed copper cap and a lantern
  m.cylinder(16, 15, 7.0, 28, 30, "white");
  m.cylinder(16, 15, 6.4, 30, 36, wall);
  for (let a = 0; a < 12; a += 1) {
    const px = Math.floor(16 + Math.cos((a * Math.PI) / 6) * 6.4);
    const py = Math.floor(15 + Math.sin((a * Math.PI) / 6) * 6.4);
    m.box(px, py, 31, px + 1, py + 1, 35, "white");
  }
  m.cylinder(16, 15, 7.2, 36, 37, "white");
  m.cylinder(16, 15, 6.6, 37, 39, "roofslate");
  m.cylinder(16, 15, 5.8, 39, 41, "roofslate");
  m.cylinder(16, 15, 4.6, 41, 43, "roofslate");
  m.cylinder(16, 15, 3.2, 43, 45, "roofslate");
  m.cylinder(16, 15, 1.8, 45, 47, "roofslate");
  m.cylinder(16, 15, 1.0, 47, 49, "white");
  m.set(16, 15, 49, "yellow");
  // portico, steps and the two lions
  m.box(12, 24, 1, 20, 26, 14, wall);
  for (const [x] of [[13], [19]]) addColumn(m, x, 25, 2, 14, 1.2, "white");
  m.box(11, 24, 14, 21, 27, 16, "white");
  m.box(12, 25, 16, 20, 27, 17, "white");
  m.clear(15, 23, 1, 18, 25, 11);
  m.box(15, 22, 1, 18, 24, 11, "door");
  m.box(10, 26, 0, 22, 29, 1, "limestone");
  m.box(11, 27, 0, 21, 29, 2, "limestone");
  for (const x of [8, 23]) {
    m.box(x, 26, 1, x + 2, 29, 4, "sand");
    m.box(x, 27, 4, x + 2, 29, 6, "sand");
    m.box(x + 1, 29, 6, x + 2, 30, 8, "sand");
    m.set(x + 1, 29, 8, "trim");
    m.box(x, 26, 1, x + 2, 27, 2, "darkconcrete");
  }
  // lawn, beds and the forecourt
  m.box(1, 1, 0, 10, 9, 1, "floweryellow");
  m.box(22, 1, 0, 31, 9, 1, "flowerred");
  addHedgeRing(m, 1, 10, 10, 21, 1);
  addHedgeRing(m, 22, 10, 31, 21, 1);
  addTree(m, 2, 2, 1, "conifer", 8200 + variant, 0.8);
  addTree(m, 29, 2, 1, "round", 8210 + variant, 0.85);
  addTree(m, 2, 20, 1, "cherry", 8220 + variant, 0.75);
  addLamp(m, 1, 30, 1, "e");
  addLamp(m, 30, 30, 1, "w");
  addBench(m, 6, 30, 1, "x");
  addBench(m, 24, 30, 1, "x");
  addCar(m, 2, 21, 1, "x", pick(["carwhite", "carblue"], variant));
  addCar(m, 24, 21, 1, "x", pick(["carred", "cargreen"], variant + 1));
  return m;
}

// 1×1 · a village church: a gabled nave with a pointed spire and a cross over
// the porch, stained glass in red, blue and yellow, and a few gravestones.
export function church(variant = 0) {
  const m = new Model(T, T, 46, "church");
  const wall = pick(["limestone", "cream", "rock"], variant);
  const glass = pick([["red", "blue", "yellow"], ["blue", "yellow", "red"], ["yellow", "red", "blue"]], variant);
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(0, 11, 0, T, T, 1, "gravel");
  m.box(4, 12, 0, 12, T, 1, "lawn");
  m.box(2, 1, 1, 14, 12, 16, wall);
  m.box(2, 1, 1, 14, 12, 2, "darkconcrete");
  m.gable(2, 1, 14, 12, 16, "x", "roofred", wall, 1);
  // nave windows, alternating stained glass colours
  for (const [x, c] of [[3, glass[0]], [6, glass[1]], [9, glass[2]], [12, glass[0]]]) {
    m.clear(x, 11, 4, x + 2, 12, 13);
    m.box(x, 10, 3, x + 2, 11, 14, c);
    m.box(x, 10, 14, x + 2, 11, 15, c);
    m.box(x - 1, 10, 3, x, 11, 15, "white");
    m.box(x + 2, 10, 3, x + 3, 11, 15, "white");
  }
  for (const x of [4, 9]) {
    m.clear(x, 1, 4, x + 2, 2, 13);
    m.box(x, 1, 3, x + 2, 2, 14, glass[1]);
  }
  // porch, door and a rose window over it
  m.box(6, 11, 1, 10, 14, 10, wall);
  m.box(6, 11, 1, 10, 14, 2, "darkconcrete");
  m.gable(6, 11, 10, 14, 10, "y", "roofred", wall, 1);
  m.box(7, 13, 1, 9, 14, 7, "door");
  m.set(7, 13, 7, "yellow");
  m.box(6, 13, 10, 10, 14, 11, "roofred");
  m.cylinder(8, 11.5, 1.6, 12, 13, glass[0]);
  m.cylinder(8, 11.5, 1.0, 13, 14, glass[1]);
  // steeple: a square tower with an open belfry and a tall pointed spire
  m.box(3, 2, 16, 9, 8, 32, wall);
  m.box(3, 2, 16, 9, 8, 17, "white");
  for (const y of [2, 7]) {
    m.clear(5, y, 22, 7, y + 1, 28);
    m.box(5, y, 22, 7, y + 1, 28, "trim");
    m.box(5, y, 23, 7, y + 1, 27, "windowlit");
  }
  m.box(2, 1, 32, 10, 9, 34, "white");
  m.box(4, 3, 34, 8, 7, 35, "white");
  m.box(4, 3, 35, 8, 7, 37, "conifer");
  m.box(5, 4, 37, 7, 6, 38, "conifer");
  m.box(5, 4, 38, 7, 6, 40, "conifer");
  m.box(6, 4, 40, 7, 6, 42, "conifer");
  m.box(6, 4, 42, 7, 6, 43, "conifer");
  addCross(m, 6, 4, 43, 4);
  // churchyard: gravestones, a yew and a path of stepping stones
  for (const [x, y] of [[2, 13], [5, 14], [8, 13], [12, 14], [3, 15], [10, 15]]) addGrave(m, x, y, 1, pick(["limestone", "concrete", "rock"], variant + x));
  addTree(m, 13.5, 14, 1, "conifer", 8300 + variant, 0.65);
  addTree(m, 1.5, 13.5, 1, "round", 8310 + variant, 0.55);
  m.box(6, 15, 0, 9, T, 1, "paving");
  addLamp(m, 1, 15, 1, "e");
  return m;
}

// 2×2 · a marina: open water across most of the lot with timber jetties on
// posts, a row of small boats with coloured stripes and a clubhouse on the
// +y edge where the land is.
export function marina(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 42, "marina");
  m.box(0, 0, 0, W, W, 1, "water");
  m.box(0, 26, 0, W, W, 1, "sand");
  m.box(0, 28, 0, W, W, 1, "concrete");
  m.box(0, 30, 0, W, W, 1, "paving");
  // sea wall and the two main jetties on posts
  m.box(0, 26, 1, W, 28, 2, "concrete");
  for (let x = 1; x < W; x += 5) m.box(x, 27, 1, x + 1, 28, 3, "darkconcrete");
  for (const y of [6, 17]) {
    for (let x = 2; x < W - 2; x += 6) for (const yy of [y - 1, y + 1]) m.box(x, yy, 1, x + 1, yy + 1, 2, "wood");
    m.box(1, y - 1, 2, W - 1, y + 2, 3, "wood");
    m.box(1, y - 2, 2, W - 1, y - 1, 3, "darksteel");
    m.box(1, y + 2, 2, W - 1, y + 3, 3, "darksteel");
  }
  for (let y = 3; y < 26; y += 6) m.box(0, y, 2, 1, y + 1, 3, "darksteel");
  // a cross jetty reaching the shore with lamps and bollards
  m.box(14, 2, 2, 18, 28, 3, "wood");
  m.box(14, 2, 1, 15, 28, 2, "wood");
  m.box(17, 2, 1, 18, 28, 2, "wood");
  for (let y = 4; y < 26; y += 7) {
    m.box(15, y, 3, 16, y + 1, 8, "darksteel");
    m.set(15, y, 8, "lamp");
  }
  for (let x = 3; x < W - 3; x += 7) {
    m.box(x, 27, 3, x + 1, 28, 5, "darksteel");
    m.set(x, 27, 5, "white");
  }
  // moored boats along both jetties
  addBoat(m, 3, 8, 1, 12, pick(["blue", "red", "caryellow"], variant), "y");
  addBoat(m, 11, 9, 1, 11, pick(["carred", "white"], variant + 1), "y");
  addBoat(m, 24, 8, 1, 13, pick(["signgreen", "blue"], variant + 2), "y");
  addBoat(m, 4, 19, 1, 10, pick(["white", "orange"], variant + 3), "y");
  addBoat(m, 20, 20, 1, 12, pick(["caryellow", "carblue"], variant + 4), "y");
  m.box(28, 10, 3, 30, 13, 4, "tyre");
  m.box(28, 10, 1, 30, 13, 3, "white");
  // clubhouse on the +y land edge, with a verandah and a flag
  m.box(2, 31, 1, 14, 40, 9, pick(["cream", "plaster", "sky"], variant));
  m.box(2, 31, 1, 14, 40, 2, "darkconcrete");
  m.box(4, 39, 3, 14, 40, 7, "glass");
  for (let x = 5; x < 14; x += 3) m.box(x, 39, 3, x + 1, 40, 7, "mullion");
  m.windows(2, 31, 14, 40, 3, 9, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "w"] });
  m.box(1, 30, 9, 15, 41, 10, "white");
  m.box(1, 30, 10, 11, 31, 13, "blue");
  m.hip(2, 31, 14, 40, 10, "roofred", 1);
  m.box(2, 40, 1, 14, 42, 3, "wood");
  for (const x of [2, 13]) for (const y of [40, 41]) m.box(x, y, 1, x + 1, y + 1, 3, "white");
  addFlag(m, 15, 38, 1, 22, "blue");
  // dinghies stacked on the hard standing and a service car
  m.box(18, 32, 1, 24, 36, 4, "white");
  m.box(19, 33, 4, 23, 35, 5, "blue");
  m.box(18, 36, 1, 24, 40, 4, "carred");
  m.box(19, 37, 4, 23, 39, 5, "white");
  addCar(m, 26, 32, 1, "x", pick(["carwhite", "carblue"], variant));
  addTree(m, 29, 31, 1, "round", 8400 + variant, 0.65);
  addLamp(m, 1, 29, 1, "e");
  addLamp(m, 30, 29, 1, "w");
  return m;
}

// 2×2 · a mayor's mansion: two cream storeys under a hipped slate roof, a porch
// on four white columns, and a circular gravel drive round a fountain with
// clipped hedges and kitchen gardens.
export function mayorsHouse(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 50, "mayors-house");
  const wall = pick(["cream", "plaster", "butter"], variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  // circular drive round the fountain
  m.cylinder(16, 40, 12.4, 0, 1, "gravel");
  m.cylinder(16, 40, 10.6, 0, 1, "lawn");
  m.box(14, 26, 0, 18, 30, 1, "gravel");
  m.box(14, 46, 0, 18, W, 1, "gravel");
  addFountain(m, 16, 40, 1, 3.6);
  // two-storey house on the back half
  m.box(4, 4, 1, 28, 24, 19, wall);
  m.box(4, 4, 1, 28, 24, 2, "white");
  m.box(4, 4, 17, 28, 24, 19, wall);
  m.windows(4, 4, 28, 24, 4, 18, { floor: 6, offset: 1, height: 3, period: 5, width: 2 });
  m.hip(4, 4, 28, 24, 20, pick(["roofslate", "roofbrown"], variant), 1);
  for (const x of [8, 22]) {
    m.box(x, 14, 20, x + 2, 16, 27, "brick");
    m.box(x - 1, 13, 27, x + 3, 17, 28, "darkconcrete");
  }
  // porch with four white columns, a stoop and a fanlight door
  m.box(10, 24, 1, 22, 27, 12, wall);
  for (const x of [11, 15, 18, 21]) addColumn(m, x, 26, 2, 12, 1.1, "white");
  m.box(9, 24, 12, 23, 28, 14, "white");
  m.box(10, 25, 14, 22, 27, 15, "white");
  m.box(14, 22, 1, 18, 24, 9, "door");
  m.box(15, 22, 9, 17, 24, 10, "white");
  m.box(12, 27, 0, 20, 29, 1, "limestone");
  m.box(13, 28, 0, 19, 29, 2, "limestone");
  m.box(9, 27, 12, 10, 28, 14, "white");
  m.box(22, 27, 12, 23, 28, 14, "white");
  // conservatory wing and the garden furniture
  m.box(28, 12, 1, 31, 22, 12, "glass");
  m.box(28, 12, 1, 31, 22, 3, "white");
  for (let y = 13; y < 22; y += 3) m.box(28, y, 3, 31, y + 1, 12, "mullion");
  m.gable(28, 12, 31, 22, 12, "y", "glass", "white", 0);
  addHedgeRing(m, 1, 4, 32, 26, 1, 12, 20);
  addHedgeRing(m, 0, 30, 8, 42, 1);
  addHedgeRing(m, 24, 30, 32, 42, 1);
  m.box(1, 28, 0, 6, 33, 1, "floweryellow");
  m.box(26, 28, 0, 31, 33, 1, "flowerred");
  m.box(1, 43, 0, 10, 47, 1, "hedge");
  m.box(22, 43, 0, 31, 47, 1, "hedge");
  addBench(m, 20, 44, 1, "x");
  addTree(m, 2, 2, 1, "round", 8500 + variant, 0.9);
  addTree(m, 30, 2, 1, "conifer", 8510 + variant, 0.9);
  addTree(m, 2, 45, 1, "cherry", 8520 + variant, 0.8);
  addTree(m, 29, 45, 1, "round", 8530 + variant, 0.8);
  addLamp(m, 1, 26, 1, "e");
  addLamp(m, 31, 26, 1, "w");
  addCar(m, 26, 47, 1, "x", pick(["carwhite", "caryellow"], variant));
  return m;
}

// 1×1 · a water works: two circular settling basins ringed with concrete walls,
// rotating scraper arms, a blue-and-white pump house and a short pipe run.
export function waterTreatment(variant = 0) {
  const m = new Model(T, T, 24, "water-works");
  void variant;
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 4, 1, "gravel");
  m.box(0, 13, 0, T, T, 1, "asphaltpatch");
  for (let x = 2; x < T; x += 5) m.box(x, 14, 0, x + 1, T, 1, "lineyellow");
  // two settling basins: concrete ring walls holding a disc of water
  for (const [cx, cy] of [[5.5, 8.5], [11.5, 8.5]]) {
    m.cylinder(cx, cy, 4.6, 1, 4, "darkconcrete");
    m.cylinder(cx, cy, 3.8, 1, 4, "water");
    m.cylinder(cx, cy, 4.6, 3, 4, "concrete");
    m.cylinder(cx, cy, 4.6, 1, 2, "concrete");
    m.cylinder(cx, cy, 3.8, 1, 3, "water");
    m.box(Math.floor(cx), Math.floor(cy), 1, Math.floor(cx) + 1, Math.floor(cy) + 1, 6, "steel");
    m.box(Math.floor(cx) - 3, Math.floor(cy), 5, Math.floor(cx) + 4, Math.floor(cy) + 1, 6, "steel");
    m.box(Math.floor(cx), Math.floor(cy) - 3, 5, Math.floor(cx) + 1, Math.floor(cy) + 4, 6, "steel");
    m.box(Math.floor(cx), Math.floor(cy), 6, Math.floor(cx) + 1, Math.floor(cy) + 1, 7, "darksteel");
  }
  // weir channel and valve chamber between the basins
  m.box(9, 7, 1, 10, 10, 4, "steel");
  m.box(5, 5, 3, 10, 6, 4, "darksteel");
  m.box(5, 11, 3, 10, 12, 4, "darksteel");
  m.box(0, 6, 1, 1, 11, 4, "darksteel");
  m.box(0, 6, 4, 4, 11, 5, "steel");
  // blue-and-white pump house at the street front
  m.box(2, 13, 1, 10, T, 9, "white");
  m.box(2, 13, 1, 10, T, 2, "blue");
  m.box(2, 13, 8, 10, T, 9, "blue");
  m.box(5, T - 1, 3, 9, T, 7, "glass");
  m.windows(2, 13, 10, T, 3, 8, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["w", "e"] });
  m.box(1, 12, 9, 11, T, 10, "white");
  m.flatRoof(2, 13, 10, T, 10, "blue", "gravel");
  addAc(m, 3, 14, 11);
  m.cylinder(12, 13, 1.8, 1, 6, "blue");
  m.cylinder(12, 13, 1.4, 6, 7, "steel");
  m.cylinder(14, 12, 1.4, 1, 4, "rust");
  m.box(11, 15, 1, 15, T, 2, "sand");
  m.box(12, 16, 2, 14, T - 1, 3, "rock");
  addLamp(m, 1, 14, 1, "e");
  return m;
}

// 2×2 · a desalination plant: long white membrane halls with blue pipe runs, an
// intake pool on the water side, membrane racks and three storage tanks.
export function desalination(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 36, "desalination");
  const pipe = pick(["blue", "corrugatedblue"], variant);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 4, 1, "water");
  m.box(0, 4, 0, W, 6, 1, "concrete");
  m.box(0, 26, 0, W, W, 1, "asphalt");
  m.box(0, 30, 0, W, W, 1, "paving");
  for (let x = 4; x < W; x += 6) m.box(x, 26, 0, x + 1, 30, 1, "linewhite");
  // intake pool at the water edge with a screen wall
  m.box(1, 1, 0, 14, 5, 1, "darkconcrete");
  m.box(2, 2, 0, 13, 5, 1, "poolwater");
  m.box(1, 1, 1, 2, 5, 5, "concrete");
  m.box(13, 1, 1, 14, 5, 5, "concrete");
  m.box(1, 4, 1, 14, 6, 2, "concrete");
  m.cylinder(16, 3, 3.0, 1, 4, pipe);
  m.box(15, 2, 2, 20, 4, 3, pipe);
  m.box(15, 2, 1, 17, 4, 2, "darksteel");
  addPipeStack(m, 1, 12, 8, 1, 3, 2, pipe);
  // four long membrane halls along x, white with blue pipe runs between
  for (let k = 0; k < 3; k += 1) {
    const y0 = 12 + k * 4;
    m.box(6, y0, 1, 30, y0 + 3, 10, "plaster");
    m.box(6, y0, 1, 30, y0 + 3, 2, "darkconcrete");
    m.box(6, y0 + 3, 3, 30, y0 + 4, 8, "glass");
    for (let x = 8; x < 30; x += 3) m.box(x, y0 + 3, 3, x + 1, y0 + 4, 8, "mullion");
    m.box(5, y0, 10, 31, y0 + 4, 11, "white");
    for (let x = 6; x < 30; x += 5) m.box(x, y0, 11, x + 2, y0 + 4, 12, "steel");
    m.box(28, y0 + 1, 12, 30, y0 + 2, 13, "darksteel");
  }
  for (const y of [11, 24]) {
    for (let x = 6; x < 32; x += 8) m.box(x, y, 1, x + 1, y + 1, 12, "steel");
    m.box(6, y, 12, 32, y + 1, 13, pipe);
    m.box(6, y, 13, 32, y + 1, 14, "steel");
  }
  // product tanks on the street side
  m.cylinder(38, 40, 3.6, 1, 12, "tank");
  m.cylinder(38, 40, 3.2, 12, 13, "steel");
  m.box(32, 36, 1, 46, 46, 1, "darkconcrete");
  m.box(33, 37, 1, 45, 45, 2, "concrete");
  // control building and the service lane
  m.box(2, 30, 1, 16, 44, 8, pick(["plaster", "cream", "limestone"], variant + 1));
  m.box(2, 30, 1, 16, 44, 2, "darkconcrete");
  m.box(3, 43, 3, 16, 44, 6, "glassdark");
  for (let x = 4; x < 16; x += 3) m.box(x, 43, 3, x + 1, 44, 6, "mullion");
  m.windows(2, 30, 16, 44, 3, 8, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "e"] });
  m.box(1, 29, 8, 17, 45, 9, "white");
  m.flatRoof(2, 30, 16, 44, 9, "white", "gravel");
  addAc(m, 13, 32, 10);
  addCar(m, 22, 27, 1, "x", pick(["carwhite", "carblue"], variant + 2));
  addCar(m, 26, 30, 1, "x", pick(["cargreen", "carwhite"], variant + 3));
  addTruck(m, 20, 43, 1, "x", "blue");
  addLamp(m, 1, 27, 1, "e");
  addLamp(m, 30, 27, 1, "w");
  addTree(m, 44, 27, 1, "round", 8600 + variant, 0.6);
  return m;
}

// ---------------------------------------------------------------- 1x1 industrial

// 1×1 · a missile silo: a fenced concrete pad with a round darksteel hatch set in
// the ground, hazard stripes and barriers around it and a small guard hut.
export function missileSilo(variant = 0) {
  const m = new Model(T, T, 26, "missile-silo");
  void variant;
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 3, 1, "gravel");
  m.box(0, 12, 0, T, T, 1, "paving");
  m.box(0, 14, 0, T, T, 1, "asphaltpatch");
  // hazard stripes and a warning kerb around the silo pad
  for (let x = 3; x < 14; x += 2) {
    m.box(x, 4, 0, x + 1, 5, 1, "yellow");
    m.box(x, 12, 0, x + 1, 13, 1, "yellow");
  }
  for (let y = 4; y < 13; y += 2) {
    m.box(3, y, 0, 4, y + 1, 1, "yellow");
    m.box(13, y, 0, 14, y + 1, 1, "yellow");
  }
  m.box(3, 4, 1, 14, 5, 2, "trim");
  m.box(3, 12, 1, 14, 13, 2, "trim");
  m.box(3, 4, 1, 4, 13, 2, "trim");
  m.box(13, 4, 1, 14, 13, 2, "trim");
  // the silo itself: a concrete collar and a round steel hatch
  m.cylinder(8.5, 8.5, 4.6, 2, 3, "darkconcrete");
  m.cylinder(8.5, 8.5, 4.0, 2, 4, "darksteel");
  m.cylinder(8.5, 8.5, 3.4, 4, 5, "steel");
  m.cylinder(8.5, 8.5, 3.0, 5, 6, "darksteel");
  m.box(7, 8, 6, 10, 9, 7, "steel");
  m.box(7, 8, 7, 8, 9, 8, "trim");
  m.box(9, 8, 7, 10, 9, 8, "trim");
  m.cylinder(8.5, 8.5, 1.2, 6, 9, "darksteel");
  m.set(8, 8, 9, "red");
  // hydraulics, vents and a cable drum beside the hatch
  for (const [x, y] of [[4, 6], [4, 11], [12, 6], [12, 11]]) {
    m.box(x, y, 2, x + 1, y + 1, 5, "darksteel");
    m.set(x, y, 5, "steel");
  }
  m.box(10, 5, 2, 13, 6, 3, "steel");
  m.box(5, 11, 2, 8, 12, 4, "darksteel");
  m.cylinder(11, 12, 1.4, 2, 4, "rust");
  // guard hut, barrier, fence and a jeep on the apron
  m.box(1, 10, 1, 5, 14, 8, pick(["plaster", "cream", "concrete"], variant));
  m.box(1, 10, 1, 5, 14, 2, "darkconcrete");
  m.box(2, 13, 3, 5, 14, 6, "glass");
  m.windows(1, 10, 5, 14, 3, 8, { floor: 4, offset: 1, height: 2, period: 3, width: 2, faces: ["n", "e"] });
  m.box(0, 9, 8, 6, 15, 9, "roofdark");
  m.box(6, 8, 1, 7, 9, 9, "yellow");
  m.box(5, 4, 1, 6, 5, 9, "yellow");
  m.box(5, 3, 4, 6, 4, 9, "lamp");
  for (let x = 0; x < T; x += 3) m.box(x, 14, 0, x + 1, 15, 5, "steel");
  m.box(0, 14, 4, T, 15, 5, "steel");
  m.box(0, 14, 1, T, 15, 2, "darksteel");
  addCar(m, 9, 14, 1, "x", "cargreen");
  addLamp(m, 14, 14, 1, "w");
  addTree(m, 15, 1, 1, "conifer", 8700, 0.6);
  return m;
}

// 1×1 · a runway tile: asphalt over the whole lot with a dashed white centre
// line along x, solid edge lines and lamp voxels at the thresholds.
export function runway(variant = 0) {
  const m = new Model(T, T, 12, "runway");
  void variant;
  m.box(0, 0, 0, T, T, 1, "asphalt");
  // shoulder lines and a dashed centre line along x
  m.box(0, 1, 0, T, 2, 1, "linewhite");
  m.box(0, 14, 0, T, 15, 1, "linewhite");
  for (let x = 1; x < T; x += 4) m.box(x, 7, 0, x + 2, 9, 1, "linewhite");
  // apron strips and threshold bars
  m.box(0, 2, 0, T, 5, 1, "asphaltpatch");
  m.box(0, 11, 0, T, 14, 1, "asphaltpatch");
  m.box(0, 3, 0, 1, 5, 1, "lineyellow");
  m.box(0, 11, 0, 1, 13, 1, "lineyellow");
  // runway edge lights standing one voxel proud of the asphalt
  for (let x = 0; x < T; x += 3) {
    m.set(x, 0, 1, "lamp");
    m.set(x, 15, 1, "lamp");
    m.set(x + 1, 0, 1, "lamp");
    m.set(x + 1, 15, 1, "lamp");
    m.set(x + 2, 0, 1, "lamp");
    m.set(x + 2, 15, 1, "lamp");
  }
  // threshold lights across both ends of the tile
  for (let y = 0; y < T; y += 2) {
    m.set(0, y, 1, "lamp");
    m.set(15, y, 1, "lamp");
  }
  // the lamp bases and kerbs are the only things above the asphalt
  m.box(0, 0, 0, T, 1, 2, "darksteel");
  m.box(0, 15, 0, T, 16, 2, "darksteel");
  return m;
}

// 1×1 · an apron tile: concrete with yellow taxi lines and one small plane
// parked nose along x, its wings across y and the tail fin raised.
export function tarmac(variant = 0) {
  const m = new Model(T, T, 22, "tarmac");
  const livery = pick(["blue", "red", "signgreen"], variant);
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 3, 1, "paving");
  m.box(0, T - 3, 0, T, T, 1, "paving");
  // yellow taxi lines curving round the stand
  for (let y = 4; y < T - 3; y += 2) m.box(1, y, 0, 2, y + 1, 1, "lineyellow");
  m.box(2, 6, 0, 14, 7, 1, "lineyellow");
  m.box(2, 12, 0, 14, 13, 1, "lineyellow");
  for (let y = 6; y < 13; y += 2) m.box(13, y, 0, 14, y + 1, 1, "lineyellow");
  m.box(4, 9, 0, 13, 10, 1, "lineyellow");
  // the plane: fuselage along x, wings across y, tail fin at the -x end
  m.box(4, 7, 2, 14, 9, 4, "tyre");
  m.box(4, 7, 3, 15, 9, 7, "white");
  m.box(15, 7, 3, 16, 9, 6, "white");
  m.box(5, 7, 6, 13, 9, 8, livery);
  m.box(5, 6, 5, 8, 7, 8, "glassdark");
  m.box(4, 3, 4, 9, 7, 6, "white");
  m.box(4, 9, 4, 9, 13, 6, "white");
  m.box(5, 3, 5, 8, 7, 6, livery);
  m.box(5, 9, 5, 8, 13, 6, livery);
  m.box(4, 4, 6, 7, 5, 7, "steel");
  m.box(4, 11, 6, 7, 12, 7, "steel");
  m.box(2, 7, 5, 4, 9, 15, "white");
  m.box(2, 7, 15, 3, 9, 17, livery);
  m.box(3, 7, 8, 4, 9, 12, livery);
  m.box(6, 7, 7, 7, 9, 8, "white");
  m.set(16, 8, 4, "trim");
  // stand markings, a baggage cart and a cone row
  m.box(0, 4, 0, 1, 12, 1, "lineyellow");
  m.box(2, 13, 1, 4, 15, 3, "steel");
  m.box(2, 13, 3, 4, 15, 4, "caryellow");
  m.box(5, 13, 1, 7, 15, 3, "steel");
  for (let x = 10; x < 14; x += 2) m.set(x, 14, 1, "orange");
  m.set(15, 4, 1, "lamp");
  return m;
}

// 1×1 · a pier: water across the lot with one timber deck on dark posts running
// along y, bollards, crates, a lamp and a moored dinghy.
export function pier(variant = 0) {
  const m = new Model(T, T, 24, "pier");
  void variant;
  m.box(0, 0, 0, T, T, 1, "water");
  m.box(4, 0, 0, 12, 3, 1, "sand");
  m.box(5, 0, 0, 11, 2, 1, "concrete");
  // deck on posts running the length of the tile
  for (let y = 2; y < T; y += 4) {
    m.box(5, y, 1, 6, y + 1, 3, "darksteel");
    m.box(10, y, 1, 11, y + 1, 3, "darksteel");
  }
  m.box(4, 2, 3, 12, T, 4, "wood");
  m.box(4, 1, 3, 12, 2, 5, "wood");
  m.box(4, 2, 4, 5, T, 5, "darksteel");
  m.box(11, 2, 4, 12, T, 5, "darksteel");
  m.box(4, 2, 2, 5, T, 3, "darksteel");
  m.box(11, 2, 2, 12, T, 3, "darksteel");
  m.box(4, T - 1, 3, 12, T, 5, "wood");
  m.box(4, 15, 5, 12, T, 6, "darksteel");
  // bollards, crates and a capstan
  for (const y of [4, 8, 12]) {
    m.box(4, y, 5, 5, y + 1, 7, "darksteel");
    m.box(11, y, 5, 12, y + 1, 7, "darksteel");
    m.set(4, y, 7, "white");
    m.set(11, y, 7, "white");
  }
  m.box(6, 6, 5, 9, 8, 7, "wood");
  m.box(6, 6, 7, 9, 8, 8, "darkbrick");
  m.box(7, 10, 5, 9, 12, 6, "wood");
  m.cylinder(9.5, 5, 1.2, 5, 8, "rust");
  m.box(7, 1, 5, 8, 2, 9, "lamppole");
  m.set(7, 1, 9, "lamp");
  // a dinghy moored alongside and two mooring lines
  m.box(0, 6, 1, 4, 12, 3, "white");
  m.box(0, 7, 3, 3, 11, 4, "blue");
  m.box(0, 8, 1, 4, 10, 2, "tyre");
  m.box(1, 13, 1, 5, 15, 3, "caryellow");
  m.box(1, 13, 3, 4, 15, 4, "white");
  m.set(3, 4, 5, "steel");
  m.set(3, 12, 5, "steel");
  return m;
}

// 1×1 · a harbour crane: a tall orange gantry straddling the quay rails with a
// long boom reaching out over the +y water and a hoist hook.
export function crane(variant = 0) {
  const m = new Model(T, T, 60, "harbour-crane");
  const paint = pick(["orange", "yellow"], variant);
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 9, 1, "gravel");
  m.box(0, 10, 0, T, T, 1, "asphaltpatch");
  m.box(0, 12, 0, T, 14, 1, "lineyellow");
  // gantry rails and the portal legs
  m.box(1, 3, 1, 15, 4, 2, "darksteel");
  m.box(1, 13, 1, 15, 14, 2, "darksteel");
  for (const [x, y] of [[1, 3], [1, 13], [12, 3], [12, 13]]) {
    m.box(x, y, 1, x + 2, y + 2, 40, paint);
    m.box(x, y, 1, x + 2, y + 2, 3, "darksteel");
    m.box(x, y, 40, x + 3, y + 3, 42, "darksteel");
  }
  for (const y of [3, 12]) for (let z = 6; z < 40; z += 6) m.box(1, y, z, 14, y + 2, z + 1, paint);
  m.box(3, 4, 6, 4, 13, 7, "steel");
  m.box(11, 4, 6, 12, 13, 7, "steel");
  for (let z = 8; z < 40; z += 8) m.box(1, 4, z, 3, 13, z + 1, "steel");
  // machine house and the cab
  m.box(2, 1, 40, 13, 13, 50, paint);
  m.box(2, 1, 40, 13, 13, 42, "darksteel");
  m.windows(2, 1, 13, 13, 43, 49, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["e", "w"] });
  m.box(1, 0, 50, 14, 14, 51, "darksteel");
  m.box(2, 12, 44, 13, 14, 49, "glass");
  m.box(2, 12, 49, 13, 15, 50, paint);
  // jib reaching over the +y water, with a counterweight behind
  m.box(6, 12, 46, 9, 30, 48, paint);
  m.box(6, 28, 47, 9, 31, 48, "darksteel");
  m.box(6, 12, 44, 9, 14, 46, paint);
  m.box(7, 26, 40, 8, 31, 46, "steel");
  m.box(6, 12, 40, 9, 15, 41, "trim");
  for (let k = 0; k < 5; k += 1) m.box(7, 14 + k * 4, 48 - k, 8, 16 + k * 4, 49 - k, "steel");
  m.box(2, 10, 51, 6, 14, 53, "trim");
  m.box(6, 12, 51, 9, 15, 53, "darksteel");
  m.box(6, 13, 48, 9, 14, 51, "steel");
  // the hook and its cable, hanging over the quay edge
  m.box(7, 29, 48, 8, 30, 54, "darksteel");
  m.box(6, 28, 36, 9, 30, 38, "steel");
  m.set(7, 29, 35, "steel");
  // quay furniture: bollards, a crate, lamps and a lorry
  for (const x of [2, 13]) {
    m.box(x, 15, 1, x + 1, 16, 4, "darksteel");
    m.set(x, 15, 4, "white");
  }
  m.box(3, 15, 1, 6, 16, 3, "wood");
  m.box(11, 15, 1, 15, 16, 3, "darkbrick");
  addTruck(m, 2, 10, 1, "x", paint);
  addLamp(m, 14, 10, 1, "w");
  return m;
}

// 2×2 · an airport control tower: a slender concrete shaft with a flared glazed
// cab and a radar dish, beside a two-storey terminal block on the apron.
export function controlTower(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 74, "control-tower");
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 6, 1, "paving");
  m.box(0, 34, 0, W, W, 1, "asphalt");
  m.box(0, 40, 0, W, W, 1, "paving");
  m.box(0, 44, 0, W, W, 1, "parking");
  for (let x = 4; x < W; x += 7) m.box(x, 46, 0, x + 1, W, 1, "linewhite");
  m.box(0, 38, 0, W, 40, 1, "lineyellow");
  // the shaft: a tapering octagon of concrete with a dark plinth
  m.cylinder(11, 11, 4.4, 1, 3, "darkconcrete");
  m.cylinder(11, 11, 3.6, 3, 44, "concrete");
  m.cylinder(11, 11, 3.2, 44, 52, "concrete");
  m.cylinder(11, 11, 2.8, 52, 56, "concrete");
  for (let z = 6; z < 52; z += 6) m.cylinder(11, 11, 3.9, z, z + 1, "white");
  m.box(10, 10, 1, 12, 12, 3, "trim");
  m.box(10, 10, 56, 12, 12, 58, "steel");
  // the cab: a flared drum of glassdark in a white frame
  m.cylinder(11, 11, 6.2, 56, 57, "white");
  m.cylinder(11, 11, 5.6, 57, 58, "white");
  m.cylinder(11, 11, 5.6, 58, 64, "glassdark");
  for (let a = 0; a < 12; a += 1) {
    const px = Math.floor(11 + Math.cos((a * Math.PI) / 6) * 5.6);
    const py = Math.floor(11 + Math.sin((a * Math.PI) / 6) * 5.6);
    m.box(px, py, 58, px + 1, py + 1, 64, "white");
  }
  m.cylinder(11, 11, 5.8, 64, 65, "white");
  m.cylinder(11, 11, 5.0, 65, 66, "roofdark");
  m.cylinder(11, 11, 3.2, 66, 67, "white");
  m.box(10, 10, 67, 12, 12, 70, "steel");
  m.set(11, 11, 70, "red");
  // a radar dish on the cab roof
  m.box(2, 10, 65, 6, 12, 67, "steel");
  m.box(1, 9, 65, 2, 13, 68, "white");
  m.box(0, 10, 66, 1, 12, 68, "white");
  m.box(2, 10, 67, 3, 12, 68, "steel");
  m.set(1, 11, 68, "red");
  // terminal block along the front of the lot
  m.box(2, 8, 1, 24, 30, 13, pick(["plaster", "white", "limestone"], variant));
  m.box(2, 8, 1, 24, 30, 3, "darkconcrete");
  m.box(2, 8, 12, 24, 30, 13, "white");
  m.windows(2, 8, 24, 30, 4, 12, { floor: 5, offset: 1, height: 3, period: 4, width: 3 });
  m.flatRoof(2, 8, 24, 30, 13, "white", "gravel");
  addAc(m, 4, 10, 14);
  addAc(m, 20, 26, 14);
  m.box(6, 30, 5, 20, 34, 6, "white");
  m.box(9, 30, 1, 10, 34, 5, "steel");
  m.box(17, 30, 1, 18, 34, 5, "steel");
  m.clear(12, 29, 1, 16, 31, 10);
  m.box(12, 28, 1, 16, 31, 10, "glassdark");
  m.box(11, 28, 10, 17, 31, 11, "white");
  // antenna mast, apron lamps and terminal traffic
  m.box(27, 8, 1, 29, 10, 30, "steel");
  m.box(26, 7, 30, 30, 11, 31, "darksteel");
  for (let z = 8; z < 30; z += 5) m.box(27, 8, z, 30, 11, z + 1, "steel");
  m.set(28, 9, 31, "red");
  addLamp(m, 1, 36, 1, "e");
  addLamp(m, 30, 36, 1, "w");
  addLamp(m, 30, 4, 1, "w");
  addCar(m, 4, 44, 1, "y", pick(["carwhite", "carblue"], variant));
  addCar(m, 20, 44, 1, "y", pick(["caryellow", "carwhite"], variant + 1));
  addTree(m, 28, 44, 1, "round", 8800 + variant, 0.6);
  m.box(20, 34, 1, 24, 38, 7, "corrugated");
  m.box(19, 33, 7, 25, 39, 8, "roofdark");
  return m;
}

// 1×1 · a bus depot: an open-sided shed roofed on steel posts over two long
// buses parked nose-out, with a ticket hut and a service van by the street.
export function busDepot(variant = 0) {
  const m = new Model(T, T, 22, "bus-depot");
  const livery = pick(["orange", "blue", "signgreen"], variant);
  m.box(0, 0, 0, T, T, 1, "parking");
  m.box(0, 12, 0, T, T, 1, "asphalt");
  for (let x = 2; x < T; x += 5) m.box(x, 12, 0, x + 1, T, 1, "lineyellow");
  // shed: a roof slab on six steel posts over the back half of the lot
  for (const x of [1, 7, 14]) for (const y of [2, 10]) m.box(x, y, 1, x + 1, y + 1, 10, "steel");
  m.box(0, 1, 10, T, 12, 11, "roofdark");
  m.box(0, 1, 11, T, 12, 12, "corrugated");
  m.box(0, 1, 12, T, 2, 13, "steel");
  m.box(0, 10, 12, T, 12, 13, "steel");
  m.gable(0, 1, T, 12, 12, "x", "roofdark", "roofdark", 0);
  for (let x = 2; x < T; x += 4) m.box(x, 11, 9, x + 2, 12, 10, "windowlit");
  m.box(12, 1, 1, 14, 3, 12, "darkconcrete");
  m.set(13, 2, 12, "red");
  // two long buses parked nose-out
  addBus(m, 1, 2, 1, "y", livery);
  addBus(m, 10, 2, 1, "y", pick(["blue", "orange"], variant + 1));
  // ticket hut and a service van out front
  m.box(0, 13, 1, 5, T, 7, pick(["plaster", "cream"], variant + 2));
  m.box(0, 13, 1, 5, T, 2, "darkconcrete");
  m.box(1, T - 1, 3, 5, T, 6, "glass");
  m.windows(0, 13, 5, T, 3, 7, { floor: 4, offset: 1, height: 2, period: 3, width: 2, faces: ["w", "n"] });
  m.box(0, 12, 7, 6, T, 8, "white");
  m.clear(2, T - 1, 1, 4, T, 4);
  m.box(2, T - 2, 1, 4, T - 1, 4, "glassdark");
  m.box(0, 12, 8, 6, T, 9, "trim");
  addTruck(m, 8, 12, 1, "y", pick(["white", "yellow"], variant + 3));
  addLamp(m, 13, 12, 1, "w");
  return m;
}

// 1×1 · a subway kiosk: a green-and-white booth with a round sign on a pole, a
// dark stairwell descending between white rails, and a pair of benches.
export function subwayStation(variant = 0) {
  const m = new Model(T, T, 20, "subway-station");
  void variant;
  m.box(0, 0, 0, T, T, 1, "sidewalk");
  m.box(0, 0, 0, T, 5, 1, "paving");
  // kiosk on the west edge
  m.box(1, 1, 1, 8, 6, 9, "signgreen");
  m.box(1, 1, 1, 8, 6, 2, "darkconcrete");
  m.box(1, 1, 8, 8, 6, 9, "white");
  m.box(2, 5, 3, 7, 6, 6, "glass");
  m.box(2, 5, 3, 7, 6, 4, "white");
  m.box(3, 5, 2, 5, 6, 5, "doorgreen");
  m.windows(1, 1, 8, 6, 3, 8, { floor: 6, offset: 2, height: 3, period: 3, width: 2, faces: ["n", "w"] });
  m.box(0, 0, 9, 9, 7, 10, "white");
  m.flatRoof(1, 1, 8, 6, 10, "white", "gravel");
  // stairwell: an opening in the paving with dark walls and lit treads descending
  m.clear(10, 2, 1, 16, 11, 1);
  m.box(10, 1, 0, 16, 2, 1, "trim");
  m.box(10, 11, 0, 16, 12, 1, "concrete");
  m.box(10, 1, 1, 12, 11, 4, "concrete");
  m.box(14, 1, 1, 16, 11, 4, "concrete");
  m.box(10, 1, 1, 16, 2, 4, "concrete");
  m.box(12, 2, 0, 14, 10, 4, "trim");
  for (let k = 0; k < 6; k += 1) for (let i = 0; i < 4; i += 1) m.set(12 + i, 9 - k, 1 + k, k % 2 ? "darkconcrete" : "concrete");
  m.box(12, 9, 4, 14, 10, 5, "windowlit");
  m.box(12, 2, 1, 13, 9, 3, "lineyellow");
  m.box(10, 1, 4, 11, 12, 7, "steel");
  m.box(15, 1, 4, 16, 12, 7, "steel");
  for (let z = 4; z < 7; z += 2) {
    m.box(10, 1, z, 16, 2, z + 1, "steel");
    m.box(10, 11, z, 16, 12, z + 1, "steel");
  }
  // round sign on a pole, benches and a vending box
  m.box(11, 13, 1, 12, 14, 17, "steel");
  m.box(8, 13, 13, 14, 14, 16, "signgreen");
  m.box(9, 13, 14, 13, 14, 15, "white");
  m.set(8, 13, 13, "trim");
  m.set(13, 13, 16, "trim");
  m.box(10, 13, 16, 12, 14, 17, "trim");
  addBench(m, 3, 12, 1, "x");
  addBench(m, 3, 14, 1, "x");
  m.box(13, 13, 1, 15, 15, 5, "doorgreen");
  m.box(13, 13, 5, 15, 15, 6, "white");
  addLamp(m, 8, 14, 1, "w");
  return m;
}

// 1×1 · a collapsed block: irregular low heaps of concrete, darkconcrete and
// brick with steel beams sticking out, dusty soil and a few broken pallets.
export function rubble(variant = 0) {
  const m = new Model(T, T, 18, "rubble");
  const rng = mulberry32(8900 + variant);
  m.box(0, 0, 0, T, T, 1, "soil");
  m.box(0, 12, 0, T, T, 1, "asphaltpatch");
  m.box(0, 12, 0, T, 13, 1, "linewhite");
  m.box(0, 0, 0, T, 1, 1, "curb");
  // heaps: a lumpy concrete mass with dark core, brick patches and dust
  m.blob(6.5, 5.5, 2.4, 6.0, 5.0, 3.2, "concrete", rng, 0.34, "darkconcrete");
  m.blob(11.0, 9.0, 1.8, 4.6, 4.4, 2.4, "darkconcrete", rng, 0.34, "concrete");
  m.blob(3.0, 11.0, 1.6, 4.0, 3.6, 2.2, "brick", rng, 0.36, "darkbrick");
  m.box(2, 2, 1, 6, 5, 4, "concrete");
  m.box(7, 1, 1, 11, 4, 3, "darkconcrete");
  m.box(10, 6, 1, 15, 10, 2, "brick");
  m.box(1, 7, 1, 4, 11, 2, "darkconcrete");
  m.box(5, 8, 1, 9, 12, 1, "concrete");
  m.box(12, 3, 1, 15, 6, 1, "soil");
  m.box(0, 5, 1, 2, 9, 2, "soil");
  // steel beams leaning out of the heaps at angles
  for (const [x, y, len, dz] of [[3, 8, 8, 1], [9, 4, 9, 1], [12, 12, 6, 1], [5, 2, 7, 1]]) {
    for (let k = 0; k < len; k += 1) m.box(x + Math.floor(k / 2), y + (k % 2 ? 0 : 1), 3 + k * dz, x + Math.floor(k / 2) + 1, y + (k % 2 ? 1 : 2), 4 + k * dz, "darksteel");
  }
  m.box(6, 12, 3, 7, 16, 10, "darksteel");
  m.box(6, 12, 9, 9, 14, 10, "darksteel");
  m.box(1, 12, 2, 6, 14, 3, "rust");
  m.box(2, 12, 3, 6, 14, 4, "rust");
  // dust piles, a snapped column and broken pallets
  m.blob(13.0, 2.0, 1.4, 3.2, 3.0, 1.8, "sand", rng, 0.4, "rock");
  m.blob(1.5, 3.0, 1.2, 2.6, 2.6, 1.6, "soil", rng, 0.4, "sand");
  m.box(8, 13, 1, 10, 15, 7, "concrete");
  m.box(8, 13, 7, 10, 15, 8, "darkconcrete");
  m.box(11, 14, 1, 14, 16, 2, "wood");
  m.box(11, 14, 2, 12, 16, 3, "wood");
  m.box(14, 12, 1, 15, 15, 2, "wood");
  m.box(4, 14, 1, 6, 16, 3, "gravel");
  m.set(12, 15, 1, "sand");
  return m;
}

// 1×1 · a contaminated site: cracked concrete slabs behind yellow hazard
// barriers, a hazard sign, sickly green puddles and a dead tree.
export function radioactive(variant = 0) {
  const m = new Model(T, T, 24, "radioactive");
  const rng = mulberry32(9000 + variant);
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 0, 0, T, 3, 1, "soil");
  m.box(0, 12, 0, T, T, 1, "asphalt");
  m.box(0, 14, 0, T, T, 1, "darkconcrete");
  // cracked slabs: darkconcrete panels with soil and green seepage in the joints
  for (let x = 1; x < T; x += 5) m.box(x, 1, 0, x + 1, 13, 1, "soil");
  for (let y = 1; y < 13; y += 4) m.box(1, y, 0, T - 1, y + 1, 1, "soil");
  m.box(1, 1, 0, 6, 6, 1, "darkconcrete");
  m.box(7, 1, 0, 11, 6, 1, "concrete");
  m.box(12, 1, 0, 15, 6, 1, "darkconcrete");
  m.box(1, 7, 0, 6, 13, 1, "concrete");
  m.box(7, 8, 0, 15, 12, 1, "darkconcrete");
  m.box(3, 13, 0, 15, T, 1, "darkconcrete");
  // sickly green puddles in the hollows
  m.blob(5.0, 5.0, 0.8, 3.2, 3.0, 1.1, "leaflight", rng, 0.3, "hedge");
  m.blob(11.5, 9.5, 0.8, 3.6, 3.0, 1.1, "hedge", rng, 0.3, "leaflight");
  m.blob(2.5, 11.0, 0.7, 2.4, 2.6, 1.0, "leaflight", rng, 0.3, "hedge");
  m.box(4, 4, 1, 7, 6, 2, "hedge");
  m.box(10, 8, 1, 14, 10, 2, "leaflight");
  // hazard barriers and warning stripes round the pad
  for (let x = 1; x < T; x += 4) {
    m.box(x, 12, 1, x + 3, 13, 3, "yellow");
    m.box(x, 12, 3, x + 3, 13, 4, "trim");
    m.set(x + 1, 12, 2, "trim");
    m.set(x + 3, 12, 2, "trim");
  }
  for (let y = 2; y < 12; y += 4) {
    m.box(0, y, 1, 1, y + 3, 3, "yellow");
    m.box(15, y, 1, 16, y + 3, 3, "yellow");
  }
  // the hazard sign on its post, plus drums of waste
  m.box(7, 5, 1, 8, 6, 8, "steel");
  m.box(5, 4, 8, 10, 7, 14, "yellow");
  m.box(6, 5, 9, 9, 6, 13, "trim");
  m.box(6, 5, 11, 9, 6, 12, "yellow");
  m.cylinder(13, 3, 1.6, 1, 5, "rust");
  m.cylinder(13, 3, 1.3, 5, 6, "steel");
  m.cylinder(10, 3, 1.6, 1, 5, "yellow");
  m.cylinder(10, 3, 1.3, 5, 6, "steel");
  m.box(1, 1, 1, 3, 3, 4, "rust");
  // a dead tree with bare branches
  m.box(5, 9, 1, 6, 10, 12, "trunk");
  m.box(4, 9, 8, 5, 10, 10, "trunk");
  m.box(6, 9, 10, 8, 10, 11, "trunk");
  m.box(2, 9, 11, 5, 10, 12, "trunk");
  m.box(6, 9, 13, 7, 10, 16, "trunk");
  m.box(7, 9, 15, 9, 10, 16, "trunk");
  m.box(4, 9, 13, 5, 10, 14, "trunk");
  return m;
}

// 1×1 · a building site: a half-built concrete frame in yellow scaffolding, a
// small tower crane, pallets of brick and a site hut behind timber hoarding.
export function construction(variant = 0) {
  const m = new Model(T, T, 44, "construction");
  m.box(0, 0, 0, T, T, 1, "soil");
  m.box(0, 0, 0, T, 12, 1, "darkconcrete");
  m.box(0, 12, 0, T, 14, 1, "gravel");
  m.box(0, 13, 0, T, 14, 1, "lineyellow");
  m.box(0, 14, 0, T, T, 1, "concrete");
  m.box(0, 15, 0, T, T, 1, "asphaltpatch");
  // the frame: a concrete core with floors climbing and open bays above
  m.box(3, 2, 1, 13, 11, 4, "concrete");
  for (let z = 4; z < 26; z += 3) {
    m.box(2, 1, z, 14, 12, z + 1, "darkconcrete");
    for (const [x, y] of [[3, 2], [11, 2], [3, 10], [11, 10], [7, 2], [7, 10]]) m.box(x, y, z + 1, x + 1, y + 1, z + 3, "concrete");
  }
  m.box(3, 2, 26, 13, 11, 27, "darkconcrete");
  m.box(6, 5, 27, 10, 8, 30, "concrete");
  m.box(4, 3, 1, 6, 5, 26, "concrete");
  m.box(10, 8, 1, 12, 10, 26, "concrete");
  // yellow scaffolding lattice on the two street-facing faces
  for (let z = 1; z < 27; z += 3) {
    m.box(1, 1, z, 15, 2, z + 1, "yellow");
    m.box(1, 12, z, 15, 13, z + 1, "yellow");
    m.box(1, 1, z, 2, 13, z + 1, "yellow");
    m.box(14, 1, z, 15, 13, z + 1, "yellow");
  }
  for (let x = 1; x < 15; x += 4) {
    m.box(x, 1, 1, x + 1, 2, 27, "darksteel");
    m.box(x, 12, 1, x + 1, 13, 27, "darksteel");
  }
  m.box(0, 1, 26, 16, 13, 27, "wood");
  m.box(1, 2, 27, 15, 12, 28, "wood");
  m.box(3, 14, 26, 13, 15, 27, "yellow");
  // a small tower crane in the corner
  m.box(1, 14, 1, 3, 16, 34, "yellow");
  m.box(1, 14, 8, 3, 16, 34, "yellow");
  m.box(0, 13, 34, 4, 17, 35, "darksteel");
  for (let x = 4; x < 16; x += 1) m.box(x, 14, 35, x + 1, 15, 36, "yellow");
  m.box(0, 14, 35, 5, 15, 36, "darksteel");
  m.box(13, 12, 20, 14, 17, 34, "darksteel");
  m.box(12, 13, 6, 15, 16, 8, "darksteel");
  m.box(12, 13, 8, 14, 16, 9, "darksteel");
  m.box(13, 13, 9, 14, 14, 20, "steel");
  // pallets, a cement mixer, spoil heaps and the site hut
  m.box(4, 14, 1, 8, 16, 2, "wood");
  m.box(4, 14, 2, 8, 15, 3, "brick");
  m.box(9, 14, 1, 12, 16, 2, "wood");
  m.box(9, 14, 2, 12, 15, 3, "darkbrick");
  m.box(9, 14, 3, 12, 15, 5, "steel");
  m.box(4, 12, 1, 7, 15, 3, "rust");
  m.box(5, 12, 3, 6, 15, 4, "trim");
  m.cylinder(10.5, 11, 1.4, 1, 3, "concrete");
  m.blob(2.5, 8.0, 1.2, 2.6, 2.4, 1.4, "sand", mulberry32(9100 + variant), 0.4, "rock");
  m.box(4, 16, 1, 9, T, 7, pick(["plaster", "corrugated"], variant));
  m.box(4, 16, 1, 9, T, 2, "darkconcrete");
  m.windows(4, 16, 9, T, 3, 7, { floor: 4, offset: 1, height: 2, period: 3, width: 2, faces: ["w", "n"] });
  m.gable(4, 16, 9, T, 7, "x", "roofdark", "corrugated", 1);
  m.clear(6, T - 1, 1, 8, T, 4);
  m.box(6, T - 2, 1, 8, T - 1, 4, "door");
  m.box(0, T - 2, 1, 3, T, 2, "sand");
  m.box(11, 16, 1, 15, T, 1, "gravel");
  m.box(12, 16, 1, 15, T, 2, "sand");
  addCar(m, 1, 13, 1, "x", "caryellow");
  return m;
}

// 1×1 · an abandoned house: a boarded two-storey shell with a sagging roof full
// of holes, an overgrown lot, a broken fence and a collapsed shed.
export function abandoned(variant = 0) {
  const m = new Model(T, T, 30, "abandoned");
  const rng = mulberry32(9200 + variant);
  const wall = pick(["cream", "plaster", "salmon"], variant);
  m.box(0, 0, 0, T, T, 1, "soil");
  m.box(0, 0, 0, T, 4, 1, "lawn");
  m.box(2, 4, 0, 14, T, 1, "hedge");
  m.box(2, 4, 1, 14, T, 1, "soil");
  m.box(0, 4, 0, 2, T, 1, "paving");
  m.box(0, 12, 0, T, T, 1, "asphaltpatch");
  // the shell: two storeys of greying wall with a sagging, holed roof
  m.box(2, 2, 1, 14, 12, 14, wall);
  m.box(2, 2, 1, 14, 12, 2, "darkconcrete");
  m.paint(2, 2, 1, 14, 12, 14, "moss");
  m.paint(2, 2, 1, 14, 12, 3, "moss");
  for (const z of [5, 11]) {
    for (const x of [4, 7, 10]) m.box(x, 11, z, x + 2, 12, z + 3, "wood");
    for (const y of [4, 7]) m.box(1, y, z, 2, y + 2, z + 3, "wood");
  }
  m.clear(6, 11, 1, 9, 12, 5);
  m.box(6, 10, 1, 9, 12, 5, "wood");
  m.box(6, 10, 1, 9, 11, 2, "wood");
  m.box(2, 12, 1, 14, 13, 2, "trim");
  m.box(1, 1, 14, 15, 13, 15, "roofslate");
  m.box(1, 1, 15, 15, 13, 16, "roofslate");
  m.box(1, 1, 16, 15, 13, 17, "roofdark");
  // holes in the roof, with sky showing through
  for (const [hx, hy] of [[4, 5, 4], [9, 8, 3], [6, 10, 4], [11, 3, 3]]) {
    m.clear(hx, hy, 14, hx + 3, hy + 3, 18);
  }
  m.box(2, 2, 14, 5, 5, 15, "roofdark");
  m.box(11, 10, 15, 14, 12, 16, "roofdark");
  m.box(5, 11, 16, 9, 13, 17, "trim");
  m.box(1, 1, 12, 2, 2, 16, "roofslate");
  // leaning chimney and a broken fence along the front
  m.box(12, 2, 14, 14, 4, 22, "brick");
  m.box(12, 2, 22, 14, 4, 23, "darkbrick");
  m.box(12, 3, 20, 13, 4, 22, "trim");
  for (let x = 0; x < T; x += 2) {
    if (x > 5 && x < 10) continue;
    m.box(x, 14, 1, x + 1, 15, 1 + ((x / 2) % 3 === 0 ? 5 : 3), "wood");
  }
  m.box(0, 14, 3, 6, 15, 4, "wood");
  m.box(10, 14, 2, T, 15, 3, "wood");
  // an overgrown back lot with a fallen shed and junk
  m.box(2, 4, 1, 6, 8, 4, "wood");
  m.box(3, 5, 4, 6, 8, 5, "roofdark");
  m.box(4, 5, 2, 6, 7, 3, "trim");
  m.box(8, 6, 1, 12, 10, 3, "hedge");
  m.blob(6.5, 6.5, 2.0, 3.2, 2.6, 1.6, "hedge", rng, 0.4, "leafdark");
  m.blob(11.0, 9.0, 1.8, 2.8, 2.6, 1.6, "leafdark", rng, 0.4, "hedge");
  addTree(m, 13, 6, 1, "round", 9300 + variant, 0.9);
  addTree(m, 2, 10, 1, "conifer", 9310 + variant, 0.7);
  m.box(3, 12, 1, 5, 14, 2, "rust");
  m.box(11, 12, 1, 13, 14, 2, "trim");
  m.box(0, 12, 0, T, 13, 1, "linewhite");
  return m;
}

// 1×1 · a utility tile: a fenced substation with a transformer and switchgear, a
// green transformer box on the pavement and a pole carrying wires.
export function infrastructure(variant = 0) {
  const m = new Model(T, T, 30, "infrastructure");
  void variant;
  m.box(0, 0, 0, T, T, 1, "gravel");
  m.box(0, 12, 0, T, T, 1, "sidewalk");
  m.box(0, 14, 0, T, T, 1, "paving");
  // substation: a wired enclosure with a transformer, a second can and switchgear
  m.box(1, 1, 0, 15, 11, 1, "concrete");
  m.box(2, 2, 0, 14, 10, 1, "gravel");
  addTransformer(m, 3, 3, 1);
  m.box(10, 2, 1, 13, 7, 8, "steel");
  m.box(10, 2, 8, 13, 7, 9, "darksteel");
  m.box(10, 3, 2, 12, 6, 7, "darksteel");
  m.box(10, 2, 1, 13, 3, 2, "concrete");
  m.box(9, 2, 9, 14, 4, 12, "steel");
  m.box(9, 2, 12, 14, 4, 13, "darksteel");
  m.box(10, 3, 10, 11, 4, 13, "steel");
  m.box(12, 3, 10, 13, 4, 13, "steel");
  // the fence round the enclosure, with a gate on the +y side
  for (let x = 0; x < T; x += 2) if (x < 7 || x > 10) m.box(x, 11, 1, x + 1, 12, 7, "steel");
  for (let z = 1; z < 7; z += 3) {
    m.box(0, 11, z, T, 12, z + 1, "steel");
    m.box(0, 1, z, 1, 11, z + 1, "steel");
    m.box(15, 1, z, 16, 11, z + 1, "steel");
  }
  m.box(0, 11, 6, T, 12, 7, "darksteel");
  m.box(0, 1, 6, 1, 12, 7, "darksteel");
  m.box(15, 1, 6, 16, 12, 7, "darksteel");
  for (let y = 2; y < 11; y += 4) {
    m.box(0, y, 1, 1, y + 1, 7, "steel");
    m.box(15, y, 1, 16, y + 1, 7, "steel");
  }
  m.set(7, 11, 6, "yellow");
  m.set(10, 11, 6, "yellow");
  // street pole with wires, a green pad box and a hydrant
  m.box(13, 14, 1, 14, 15, 24, "trunk");
  m.box(11, 14, 23, 14, 15, 24, "trunk");
  m.box(13, 14, 24, 16, 15, 25, "darksteel");
  m.set(15, 14, 25, "trim");
  m.set(14, 14, 19, "lamppole");
  m.set(14, 14, 20, "lamp");
  m.box(2, 14, 1, 5, 16, 5, "signgreen");
  m.box(2, 14, 5, 5, 16, 6, "conifer");
  m.box(2, 15, 3, 5, 16, 4, "yellow");
  m.box(7, 14, 1, 9, 16, 4, "yellow");
  m.box(7, 15, 4, 9, 16, 5, "steel");
  m.set(8, 14, 5, "lamppole");
  m.box(11, 15, 0, 12, 16, 1, "concrete");
  m.box(10, 14, 0, 13, 15, 1, "lineyellow");
  m.box(0, 14, 0, 2, 15, 1, "linewhite");
  return m;
}

// 2×2 · a generic public service building: two storeys of plaster round a
// glazed counter hall, with a flag and a small car park behind the kerb.
export function service(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 34, "service");
  const wall = pick(["plaster", "cream", "limestone"], variant);
  const band = pick(["blue", "signgreen", "sky"], variant);
  m.box(0, 0, 0, W, W, 1, "paving");
  m.box(0, 0, 0, W, 5, 1, "parking");
  m.box(0, 40, 0, W, W, 1, "asphalt");
  m.box(0, 44, 0, W, W, 1, "parking");
  for (let x = 4; x < W; x += 7) m.box(x, 40, 0, x + 1, W, 1, "linewhite");
  m.box(0, 42, 0, W, 44, 1, "paving");
  // the block: two storeys with a banded ground floor and a flat roof
  m.box(4, 10, 1, 28, 34, 16, wall);
  m.box(4, 10, 1, 28, 34, 4, band);
  m.box(4, 10, 15, 28, 34, 16, "white");
  m.windows(4, 10, 28, 34, 7, 14, { floor: 4, offset: 1, height: 2, period: 4, width: 3 });
  m.box(3, 9, 16, 29, 35, 17, "white");
  m.flatRoof(4, 10, 28, 34, 17, "white", "gravel");
  addAc(m, 6, 12, 18);
  addAc(m, 24, 31, 18);
  // glazed hall along the street front with a canopy and doors
  m.box(6, 33, 1, 26, 34, 12, "glass");
  for (let x = 7; x < 26; x += 3) m.box(x, 33, 3, x + 1, 34, 12, "mullion");
  m.box(5, 32, 12, 27, 35, 13, "white");
  m.box(5, 35, 12, 7, 38, 13, "white");
  m.box(25, 35, 12, 27, 38, 13, "white");
  m.box(14, 33, 1, 18, 35, 8, "glassdark");
  m.box(13, 32, 8, 19, 35, 9, "white");
  m.box(11, 34, 1, 21, 36, 2, "limestone");
  m.box(12, 35, 1, 20, 36, 3, "limestone");
  // sign band, flagpole and the service counter sign
  m.box(9, 33, 13, 23, 34, 15, band);
  m.box(10, 33, 14, 22, 34, 15, "white");
  addFlag(m, 1, 36, 1, 26, band);
  m.box(1, 10, 1, 3, 13, 4, "white");
  m.box(1, 10, 4, 3, 13, 5, band);
  // car park, lamps and trees along the front
  addCar(m, 3, 44, 1, "y", pick(["carwhite", "carblue"], variant));
  addCar(m, 11, 44, 1, "y", pick(["carred", "carwhite"], variant + 1));
  addCar(m, 20, 44, 1, "y", pick(["cargreen", "caryellow"], variant + 2));
  addCar(m, 28, 44, 1, "y", "carwhite");
  addLamp(m, 1, 41, 1, "e");
  addLamp(m, 30, 41, 1, "w");
  addTree(m, 1, 1, 1, "round", 9400 + variant, 0.8);
  addTree(m, 30, 1, 1, "conifer", 9410 + variant, 0.8);
  addTree(m, 1, 8, 1, "cherry", 9420 + variant, 0.7);
  return m;
}

// ---------------------------------------------------------------- 4x4 megastructures

// 4×4 · an arcology: a stepped megastructure of diminishing setbacks filling most
// of the lot and climbing to about z=135, glazed bands between the slabs, green
// terraces with trees on every setback and a red-capped antenna on the summit.
export function arcology(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 140, "arcology");
  const rng = mulberry32(9500 + variant);
  const slab = pick(["limestone", "concrete", "cream"], variant);
  const glass = pick(["glass", "glassdark", "roofglass"], variant);
  m.box(0, 0, 0, W, W, 1, "paving");
  m.box(0, 0, 0, W, 6, 1, "lawn");
  m.box(0, 58, 0, W, W, 1, "asphalt");
  for (let x = 4; x < W; x += 7) m.box(x, 58, 0, x + 1, W, 1, "linewhite");
  m.box(0, 62, 0, W, 64, 1, "paving");
  // the plinth: a park terrace with walks, trees and a pool at the front
  m.box(4, 10, 1, 60, 54, 6, slab);
  m.box(4, 10, 1, 60, 54, 2, "darkconcrete");
  m.box(3, 9, 6, 61, 55, 7, "white");
  m.box(6, 46, 0, 34, 52, 1, "poolwater");
  m.box(5, 45, 0, 35, 53, 1, "paving");
  addTree(m, 2, 2, 1, "round", 9510 + variant, 0.9);
  addTree(m, 2, 56, 1, "conifer", 9520 + variant, 0.9);
  addTree(m, 61, 2, 1, "round", 9530 + variant, 0.9);
  addTree(m, 61, 57, 1, "cherry", 9540 + variant, 0.8);
  for (let k = 0; k < 7; k += 1) {
    const inset = 4 + k * 3;
    const z0 = 8 + k * 15;
    const x0 = inset;
    const y0 = inset;
    const x1 = W - inset;
    const y1 = W - inset;
    // the setback slab, with a glazed band at its base and a parapet on top
    m.box(x0, y0, z0, x1, y1, z0 + 8, slab);
    m.box(x0, y0, z0, x1, y1, z0 + 3, glass);
    for (let x = x0 + 2; x < x1; x += 4) m.box(x, y1 - 1, z0, x + 1, y1, z0 + 3, "mullion");
    for (let y = y0 + 2; y < y1; y += 4) m.box(x1 - 1, y, z0, x1, y + 1, z0 + 3, "mullion");
    m.box(x0 - 1, y0 - 1, z0 + 8, x1 + 1, y1 + 1, z0 + 9, "white");
    // green terrace on the setback: lawn strips with trees, and a bench line
    m.box(x0 - 3, y0 - 3, z0 + 9, x1 + 3, y1 + 3, z0 + 10, "lawn");
    m.box(x0 - 3, y0 - 3, z0 + 10, x1 + 3, y0 - 2, z0 + 11, "hedge");
    m.box(x0 - 3, y1 + 2, z0 + 10, x1 + 3, y1 + 3, z0 + 11, "hedge");
    for (const [tx, ty, kind] of [
      [x0 - 2, y0 - 2, "round"], [x1 + 1, y0 - 2, "conifer"], [x0 - 2, y1 + 1, "cherry"], [x1 + 1, y1 + 1, "round"],
      [x0 + 8, y0 - 2, "round"], [x1 - 9, y0 - 2, "round"], [x0 + 8, y1 + 1, "conifer"], [x1 - 9, y1 + 1, "round"],
    ]) addTree(m, tx, ty, z0 + 10, kind, 9600 + k * 31 + tx * 5 + ty + variant, 0.55);
    for (let x = x0 + 2; x < x1; x += 5) m.box(x, y0 + 1, z0 + 4, x + 3, y0 + 2, z0 + 5, "wood");
    // the windowlit strip that makes each terrace read at night
    for (let x = x0 + 1; x < x1 - 1; x += 3) {
      m.set(x, y0, z0 + 1, "windowlit");
      m.set(x, y1 - 1, z0 + 1, "windowlit");
    }
    m.flatRoof(x0, y0, x1, y1, z0 + 9, "white", "gravel");
    void rng;
  }
  // the summit block, mast and a red beacon
  m.box(26, 26, 113, 38, 38, 130, slab);
  m.box(26, 26, 113, 38, 38, 116, glass);
  m.box(25, 25, 130, 39, 39, 131, "white");
  m.box(28, 28, 131, 36, 36, 133, "windowlit");
  m.box(30, 30, 133, 34, 34, 137, "steel");
  m.box(31, 31, 137, 33, 33, 139, "darksteel");
  m.set(31, 31, 139, "red");
  m.box(20, 20, 131, 44, 22, 132, "steel");
  // ground level detail: plaza, transit stop, cars and a formal garden
  m.box(24, 54, 0, 40, 62, 1, "paving");
  m.box(26, 56, 1, 38, 60, 4, "white");
  m.box(28, 58, 1, 36, 60, 3, "glassdark");
  for (const x of [26, 37]) m.box(x, 56, 1, x + 1, 60, 4, "steel");
  addCar(m, 2, 58, 1, "y", pick(["carwhite", "carblue"], variant));
  addCar(m, 14, 58, 1, "y", pick(["caryellow", "carred"], variant + 1));
  addCar(m, 46, 58, 1, "y", pick(["cargreen", "carwhite"], variant + 2));
  addCar(m, 58, 58, 1, "y", "carblue");
  addLamp(m, 1, 57, 1, "e");
  addLamp(m, 62, 57, 1, "w");
  addFountain(m, 10, 20, 1, 4.6);
  m.box(4, 30, 0, 20, 42, 1, "lawn");
  for (const [x, y] of [[8, 34], [14, 38], [18, 32]]) addShrub(m, x, y, 1, 9700 + x + y + variant, 0.6);
  return m;
}

// 4×4 · a domed city: a huge glass dome drawn as a sparse lattice of meridians
// and parallels with sky between them, so the small blocks and trees inside
// still show through.
export function dome(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 62, "domed-city");
  const skin = pick(["glass", "roofglass", "sky"], variant);
  const cx = 32;
  const cy = 32;
  const R = 30;
  m.box(0, 0, 0, W, W, 1, "paving");
  m.box(0, 0, 0, W, cx, 1, "lawn");
  m.box(0, 46, 0, W, W, 1, "sidewalk");
  // the city inside: blocks laid out on a grid with streets between them
  for (let gx = 4; gx < 60; gx += 12) {
    for (let gy = 4; gy < 46; gy += 12) {
      const h = 6 + ((gx * 7 + gy * 3) % 4) * 3;
      m.box(gx, gy, 1, gx + 8, gy + 8, h, pick(["plaster", "cream", "limestone", "salmon"], variant + gx + gy));
      m.box(gx, gy, 1, gx + 8, gy + 8, 2, "darkconcrete");
      m.box(gx - 1, gy - 1, h, gx + 9, gy + 9, h + 1, "white");
      m.windows(gx, gy, gx + 8, gy + 8, 3, h, { floor: 3, offset: 1, height: 2, period: 3, width: 2 });
      m.box(gx + 3, gy + 3, h + 1, gx + 5, gy + 5, h + 4, "gravel");
      if ((gx + gy) % 24 === 0) m.cylinder(gx + 4, gy + 4, 2.4, 1, 26, "white");
    }
  }
  for (let x = 0; x < W; x += 1) {
    if (x % 12 === 0 || x % 12 === 1) m.box(x, 2, 0, x + 1, 46, 1, "asphalt");
  }
  for (let y = 0; y < W; y += 1) if (y % 12 === 0 || y % 12 === 1) m.box(2, y, 0, 60, y + 1, 1, "asphaltpatch");
  for (let x = 0; x < W; x += 4) m.box(x, 2, 0, x + 1, 46, 1, "linewhite");
  for (const [x, y, k] of [[2, 2, "round"], [58, 2, "conifer"], [2, 52, "round"], [58, 52, "round"], [20, 20, "cherry"], [44, 30, "round"], [20, 40, "conifer"], [44, 14, "round"]]) {
    addTree(m, x, y, 1, k, 9800 + x * 3 + y + variant, 0.85);
  }
  m.cylinder(20, 26, 5.2, 0, 1, "poolwater");
  m.cylinder(20, 26, 4.6, 0, 1, "water");
  addCar(m, 14, 50, 1, "x", "carwhite");
  addCar(m, 34, 50, 1, "x", "carblue");
  addCar(m, 48, 34, 1, "x", "carred");
  // the dome: a meridian ring every 16 steps, a parallel ring every 5 voxels up
  m.cylinder(cx, cy, R, 0, 1, "concrete");
  m.cylinder(cx, cy, R - 1, 1, 2, "paving");
  const N = 72;
  for (let ring = 0; ring < 8; ring += 1) {
    const phi = (ring / 8) * (Math.PI / 2);
    const r = Math.cos(phi) * R;
    const z = Math.round(Math.sin(phi) * R) * 1;
    if (r < 1) continue;
    const steps = Math.max(12, Math.round(2 * Math.PI * r * 1.4));
    for (let s = 0; s < steps; s += 1) {
      if (s % 3 !== 0) continue;
      const a = (s / steps) * 2 * Math.PI;
      const px = Math.floor(cx + Math.cos(a) * r);
      const py = Math.floor(cy + Math.sin(a) * r);
      m.set(px, py, 1 + z, skin);
      m.set(px, py, 1 + z + 1, skin);
    }
  }
  for (let s = 0; s < N; s += 1) {
    if (s % 6 !== 0) continue;
    const a = (s / N) * 2 * Math.PI;
    for (let ring = 1; ring < 8; ring += 1) {
      const phi = (ring / 8) * (Math.PI / 2);
      const r = Math.cos(phi) * R;
      const z = 1 + Math.round(Math.sin(phi) * R);
      const px = Math.floor(cx + Math.cos(a) * r);
      const py = Math.floor(cy + Math.sin(a) * r);
      m.set(px, py, z, skin);
      if (ring % 2 === 0) {
        const qx = Math.floor(cx + Math.cos(a) * (r + 1));
        const qy = Math.floor(cy + Math.sin(a) * (r + 1));
        m.set(qx, qy, z - 1, skin);
        m.set(qx, qy, z, skin);
      }
    }
  }
  m.cylinder(cx, cy, 3.2, 30, 33, skin);
  m.cylinder(cx, cy, 2.2, 33, 36, skin);
  m.cylinder(cx, cy, 3.4, 36, 37, "stone" in {} ? "white" : "white");
  m.box(31, 31, 34, 33, 33, 40, "steel");
  m.set(31, 31, 40, "red");
  // a couple of gantry gates on the ring wall
  for (const a of [0.4, 2.6, 4.2]) {
    const px = Math.floor(cx + Math.cos(a) * (R - 4));
    const py = Math.floor(cy + Math.sin(a) * (R - 4));
    m.box(px, py, 1, px + 4, py + 2, 12, "steel");
    m.box(px - 1, py - 1, 12, px + 5, py + 3, 13, "darksteel");
    m.set(px + 2, py, 13, "lamp");
  }
  addLamp(m, 1, 47, 1, "e");
  addLamp(m, 62, 47, 1, "w");
  addFountain(m, 32, 6, 1, 4.0);
  return m;
}

// 4×4 · a power plant: a corrugated boiler hall, two red-and-white banded
// chimneys, a concrete cooling tower with a flared waist, a fenced switchyard of
// transformers and a coal store fed by a climbing conveyor.
export function powerPlant(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 92, "power-plant");
  const band = pick(["red", "orange", "rust"], variant);
  m.box(0, 0, 0, W, W, 1, "darkconcrete");
  m.box(0, 0, 0, W, 8, 1, "gravel");
  m.box(0, 50, 0, W, W, 1, "asphaltpatch");
  m.box(0, 58, 0, W, W, 1, "parking");
  for (let x = 4; x < W; x += 7) m.box(x, 58, 0, x + 1, W, 1, "linewhite");
  // boiler hall with sawtooth glazing and a roll-up door on the street side
  m.box(4, 10, 1, 44, 38, 20, pick(["corrugated", "darkconcrete"], variant + 1));
  m.box(4, 10, 1, 44, 38, 3, "darkconcrete");
  m.windows(4, 10, 44, 38, 3, 20, { floor: 5, offset: 0, height: 3, period: 7, width: 3, faces: ["w", "e", "n"] });
  for (let k = 0; k < 6; k += 1) {
    const x0 = 4 + k * 7;
    for (let s = 0; s < 6; s += 1) m.box(x0 + s, 10, 20 + s, x0 + s + 1, 38, 21 + s, "roofdark");
    m.box(x0 + 6, 10, 20, x0 + 7, 38, 26, "roofglass");
  }
  m.box(8, 37, 1, 20, 38, 10, "rolldoor");
  m.box(7, 37, 10, 21, 39, 11, "steel");
  m.box(30, 37, 1, 40, 38, 8, "glassdark");
  // two chimneys, banded at the top
  addChimney(m, 22, 8, 1, 84, 4.2, "darkbrick", band, 62);
  addChimney(m, 36, 8, 1, 74, 3.6, "darkbrick", "white", 54);
  m.box(16, 4, 30, 42, 12, 31, "steel");
  m.box(16, 4, 28, 17, 12, 31, "darksteel");
  // cooling tower: stacked cylinders narrowing to a waist, then flaring again
  const cx = 54;
  const cy = 30;
  m.cylinder(cx, cy, 12.0, 1, 3, "darkconcrete");
  m.cylinder(cx, cy, 11.2, 3, 10, "concrete");
  m.cylinder(cx, cy, 9.8, 10, 20, "concrete");
  m.cylinder(cx, cy, 8.6, 20, 34, "concrete");
  m.cylinder(cx, cy, 8.2, 34, 44, "concrete");
  m.cylinder(cx, cy, 9.0, 44, 52, "concrete");
  m.cylinder(cx, cy, 10.2, 52, 58, "concrete");
  m.cylinder(cx, cy, 10.8, 58, 60, "darkconcrete");
  for (let z = 6; z < 56; z += 8) m.cylinder(cx, cy, 12.2 - Math.abs(z - 32) / 9, z, z + 1, "white");
  m.cylinder(cx, cy, 4.0, 1, 4, "darksteel");
  for (let a = 0; a < 12; a += 1) {
    const px = Math.floor(cx + Math.cos((a * Math.PI) / 6) * 12.6);
    const py = Math.floor(cy + Math.sin((a * Math.PI) / 6) * 12.6);
    m.box(px, py, 1, px + 1, py + 1, 5, "concrete");
  }
  m.box(42, 28, 1, 43, 32, 26, "steel");
  for (let z = 4; z < 26; z += 6) m.box(41, 28, z, 44, 32, z + 1, "steel");
  // coal store with piles, walls and a climbing conveyor to the hall
  m.box(4, 44, 0, 40, 58, 1, "soil");
  m.box(4, 44, 1, 40, 45, 6, "concrete");
  m.box(4, 57, 1, 40, 58, 6, "concrete");
  m.box(4, 44, 1, 5, 58, 6, "concrete");
  m.box(38, 44, 1, 40, 58, 6, "concrete");
  m.cylinder(12, 50, 7.0, 1, 5, "trim");
  m.cylinder(12, 50, 4.6, 5, 9, "trim");
  m.cylinder(12, 50, 2.6, 9, 12, "roofdark");
  m.cylinder(26, 52, 5.4, 1, 4, "roofdark");
  m.cylinder(26, 52, 3.6, 4, 7, "trim");
  m.cylinder(34, 48, 4.0, 1, 3, "trim");
  m.cylinder(34, 48, 2.4, 3, 5, "roofdark");
  for (let k = 0; k < 12; k += 1) m.box(32 - k, 46 - k * 2, 6 + k, 36 - k, 50 - k * 2, 8 + k, "steel");
  for (let k = 0; k < 12; k += 1) m.box(32 - k, 47 - k * 2, 6 + k, 36 - k, 48 - k * 2, 8 + k, "darksteel");
  m.box(16, 12, 18, 22, 20, 19, "rust");
  // fenced switchyard on the east corner
  m.box(44, 44, 0, W, 62, 1, "gravel");
  addTransformer(m, 46, 46, 1);
  addTransformer(m, 46, 54, 1);
  addTransformer(m, 55, 46, 1);
  addTransformer(m, 55, 54, 1);
  for (let x = 44; x < W; x += 2) {
    m.box(x, 42, 1, x + 1, 43, 7, "steel");
    m.box(x, 62, 1, x + 1, 63, 7, "steel");
  }
  m.box(44, 42, 6, W, 43, 7, "steel");
  m.box(44, 62, 6, W, 63, 7, "steel");
  m.box(44, 42, 1, 45, 63, 7, "steel");
  for (const y of [44, 54]) {
    m.box(42, y - 2, 1, 58, y - 1, 12, "steel");
    m.box(42, y - 2, 12, W - 1, y - 1, 13, "darksteel");
  }
  // control block, yard clutter, cars and lamps at the street front
  m.box(4, 62, 1, 22, 74, 9, pick(["plaster", "cream", "limestone"], variant + 2));
  m.box(4, 62, 1, 22, 74, 2, "darkconcrete");
  m.box(5, 73, 3, 22, 74, 7, "glassdark");
  for (let x = 6; x < 22; x += 3) m.box(x, 73, 3, x + 1, 74, 7, "mullion");
  m.windows(4, 62, 22, 74, 3, 9, { floor: 4, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "e"] });
  m.box(3, 61, 9, 23, 75, 10, "white");
  m.flatRoof(4, 62, 22, 74, 10, "white", "gravel");
  addAc(m, 6, 64, 11);
  addPipeStack(m, 1, 12, 20, 1, 3, 2, "steel");
  m.cylinder(26, 60, 2.6, 1, 10, "wood");
  m.cylinder(26, 60, 2.2, 10, 11, "roofdark");
  m.box(30, 62, 1, 40, 70, 4, "darkconcrete");
  m.box(30, 62, 4, 40, 70, 5, "trim");
  addTruck(m, 24, 58, 1, "x", pick(["yellow", "orange"], variant + 3));
  addCar(m, 4, 58, 1, "y", pick(["carwhite", "carblue"], variant + 4));
  addCar(m, 44, 58, 1, "y", pick(["cargreen", "carwhite"], variant + 5));
  addLamp(m, 1, 57, 1, "e");
  addLamp(m, 62, 57, 1, "w");
  addTree(m, 2, 2, 1, "conifer", 9900 + variant, 0.8);
  return m;
}

export const SPECIALS = {
  "catalog.city_hall": { size: 3, label: "City hall / 市政厅", make: cityHall },
  "catalog.hospital": { size: 3, label: "Hospital / 医院", make: hospital },
  "catalog.museum": { size: 3, label: "Museum / 博物馆", make: museum },
  "catalog.stadium": { size: 3, label: "Stadium / 体育场", make: stadium },
  "catalog.prison": { size: 3, label: "Prison / 监狱", make: prison },
  "catalog.college": { size: 3, label: "College / 学院", make: college },
  "catalog.zoo": { size: 3, label: "Zoo / 动物园", make: zoo },
  "catalog.statue": { size: 1, label: "Hero statue / 英雄雕像", make: statue },
  "catalog.park_big": { size: 3, label: "City park / 城市公园", make: parkBig },
  "catalog.library": { size: 2, label: "Library / 图书馆", make: library },
  "catalog.church": { size: 1, label: "Church / 教堂", make: church },
  "catalog.marina": { size: 2, label: "Marina / 游艇港", make: marina },
  "catalog.mayors_house": { size: 2, label: "Mayor's house / 市长官邸", make: mayorsHouse },
  "catalog.water_treatment": { size: 1, label: "Water works / 自来水厂", make: waterTreatment },
  "catalog.desalination": { size: 2, label: "Desalination / 海水淡化厂", make: desalination },
  "catalog.missile_silo": { size: 1, label: "Missile silo / 导弹发射井", make: missileSilo },
  "catalog.runway": { size: 1, label: "Runway / 跑道", make: runway },
  "catalog.tarmac": { size: 1, label: "Air apron / 停机坪", make: tarmac },
  "catalog.pier": { size: 1, label: "Pier / 栈桥", make: pier },
  "catalog.crane": { size: 1, label: "Harbour crane / 港口起重机", make: crane },
  "catalog.control_tower": { size: 2, label: "Control tower / 塔台", make: controlTower },
  "catalog.bus_depot": { size: 1, label: "Bus depot / 公交场站", make: busDepot },
  "catalog.subway_station": { size: 1, label: "Subway station / 地铁站", make: subwayStation },
  "catalog.rubble": { size: 1, label: "Rubble / 废墟", make: rubble },
  "catalog.radioactive": { size: 1, label: "Contaminated site / 污染区", make: radioactive },
  "catalog.construction": { size: 1, label: "Construction site / 工地", make: construction },
  "catalog.abandoned": { size: 1, label: "Abandoned house / 废弃房屋", make: abandoned },
  "catalog.infrastructure": { size: 1, label: "Utility yard / 变电所", make: infrastructure },
  "catalog.service": { size: 2, label: "Service centre / 公共服务中心", make: service },
  ...LANDMARKS,
};
