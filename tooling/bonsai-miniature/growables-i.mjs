// Growable designs — industrial (i) families. See buildings-growables.mjs for the
// family and variant conventions. Each entry: { id, zone, size, tier, label, make }.
// Lot surface at z = 0, street front on +y, `variant` swaps colourways and small
// furniture, `rank` raises the high-tier designs (techLab is a fixed one-storey
// band; cleanPlant and assemblyPlant grow visibly with rank).

import { Model, TILE_VOXELS as T, STOREY as S, mulberry32 } from "./voxel.mjs";
import { addTree, addCar, addLamp } from "./buildings.mjs";

const pick = (list, variant) => list[((variant % list.length) + list.length) % list.length];

// ---------------------------------------------------------------- props

function addAc(m, x, y, z) {
  m.box(x, y, z, x + 2, y + 2, z + 2, "steel");
  m.set(x, y, z + 1, "darksteel");
}

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

// A tyre: a black box with a lighter hub, laid flat.
function addTyre(m, x, y, z) {
  m.box(x, y, z, x + 3, y + 3, z + 2, "tyre");
  m.box(x + 1, y + 1, z + 2, x + 2, y + 2, z + 3, "tyre");
}

// A stepped scrap heap: concentric rings of decreasing height with a jagged top.
function addScrapHeap(m, cx, cy, r, top, mats, rng) {
  for (let k = top; k > 0; k -= 1) {
    const rr = r * (0.35 + 0.65 * (k / top));
    const mat = mats[(k + Math.floor(rng() * mats.length)) % mats.length];
    m.cylinder(cx, cy, rr, k - 1, k, mat);
  }
  let lx = Math.floor(cx);
  let ly = Math.floor(cy);
  for (let k = top; k < top + 3; k += 1) {
    lx += rng() < 0.5 ? (rng() < 0.5 ? -1 : 1) : 0;
    ly += rng() < 0.5 ? (rng() < 0.5 ? -1 : 1) : 0;
    m.set(lx, ly, k, mats[Math.floor(rng() * mats.length)]);
  }
}

// A stack of planks: alternating darker and lighter courses.
function addPlankStack(m, x0, y0, x1, y1, z0, layers) {
  for (let k = 0; k < layers; k += 1) {
    m.box(x0, y0, z0 + k, x1, y1, z0 + k + 1, "wood");
    m.box(x0, y0, z0 + k, x1, y0 + 1, z0 + k + 1, "trunk");
  }
  m.box(x0, y0, z0 + layers, x1, y1, z0 + layers + 1, "trunk");
}

// A log: a trunk-coloured box lying along x with a lighter sawn end.
function addLog(m, x, y, z, len, r) {
  m.box(x, y, z, x + len, y + 2 * r, z + 2 * r, "trunk");
  m.box(x, y + 1, z + 1, x + 2, y + 2 * r - 1, z + 2 * r - 1, "wood");
}

// A small forklift: yellow body, mast at the +x end and a dark seat.
function addForklift(m, x, y, z, facing = "x") {
  if (facing === "x") {
    m.box(x, y, z, x + 5, y + 4, z + 1, "tyre");
    m.box(x, y, z + 1, x + 5, y + 4, z + 4, "yellow");
    m.box(x + 1, y + 1, z + 4, x + 3, y + 2, z + 6, "darksteel");
    m.box(x + 5, y + 1, z + 1, x + 6, y + 3, z + 8, "darksteel");
    m.box(x + 4, y + 1, z + 1, x + 7, y + 3, z + 2, "steel");
  } else {
    m.box(x, y, z, x + 4, y + 5, z + 1, "tyre");
    m.box(x, y, z + 1, x + 4, y + 5, z + 4, "yellow");
    m.box(x + 1, y + 1, z + 4, x + 2, y + 3, z + 6, "darksteel");
    m.box(x + 1, y + 5, z + 1, x + 3, y + 6, z + 8, "darksteel");
    m.box(x + 1, y + 4, z + 1, x + 3, y + 7, z + 2, "steel");
  }
}

// ---------------------------------------------------------------- size 1

// 1×1 · low tier · a scrapyard: a soil-and-concrete lot with three stepped heaps
// of rust, darksteel and steel scrap, a leaning stack of tyres, a corrugated
// shed with a rolldoor and a yellow-boomed crane on a darksteel mast.
export function scrapyard(variant = 0, rank = 0) {
  const m = new Model(T, T, 34, "scrapyard");
  const mats = [
    pick(["rust", "darksteel", "steel"], variant),
    pick(["steel", "rust", "darksteel"], variant + 1),
    pick(["darksteel", "steel", "rust"], variant + 2),
  ];
  const boom = pick(["yellow", "orange"], variant + 1);
  const rng = mulberry32(4001 + variant);
  void rank;
  m.box(0, 0, 0, T, T, 1, "soil");
  m.box(0, 0, 0, T, 5, 1, "concrete");
  m.box(0, 12, 0, T, T, 1, "asphaltpatch");
  // three scrap heaps of different size and colour
  addScrapHeap(m, 4, 8, 3.2, 5, mats, rng);
  addScrapHeap(m, 9, 10, 2.4, 3, [mats[2], mats[0], "steel"], rng);
  addScrapHeap(m, 5, 4, 2.0, 2, [mats[1], "rust", mats[0]], rng);
  // leaning tyre stack
  for (let k = 0; k < 4; k += 1) addTyre(m, 11 + (k % 2), 4 + Math.floor(k / 2), 1 + k);
  addTyre(m, 13, 8, 1);
  addTyre(m, 2, 12, 1);
  // shed on the back-left, corrugated with a rolldoor facing +y
  m.box(1, 0, 1, 8, 4, 6, pick(["corrugated", "corrugatedblue", "darkconcrete"], variant + 2));
  m.box(1, 0, 1, 8, 4, 2, "darkconcrete");
  m.box(1, 3, 6, 8, 4, 7, "roofdark");
  m.box(3, 3, 1, 6, 4, 5, "rolldoor");
  m.box(2, 3, 5, 7, 4, 6, "steel");
  // crane: darksteel mast, yellow boom over the heaps
  m.box(13, 13, 1, 15, 15, 26, "darksteel");
  m.box(13, 13, 26, 15, 15, 27, "steel");
  m.box(13, 13, 27, 15, 15, 28, "trim");
  m.box(3, 13, 27, 14, 15, 29, boom);
  m.box(2, 13, 28, 3, 15, 30, "darksteel");
  m.box(12, 14, 24, 13, 14, 27, "darksteel");
  m.box(3, 13, 29, 5, 15, 30, "darksteel");
  // steel fence along the street +y edge with a gate gap
  for (let x = 0; x < T; x += 1) if (x < 6 || x > 8) m.box(x, 15, 1, x + 1, 16, 4, "steel");
  m.box(0, 15, 3, T, 16, 4, "steel");
  m.box(0, 15, 1, 6, 16, 3, "darksteel");
  m.box(9, 15, 1, T, 16, 3, "darksteel");
  m.box(6, 14, 1, 9, 16, 1, "concrete");
  // signboard on the fence
  m.box(10, 15, 4, 14, 16, 7, pick(["rust", "orange", "red"], variant + 3));
  m.box(11, 15, 4, 13, 16, 6, "white");
  return m;
}

// 1×1 · mid tier · a bottling plant: a small plaster hall with a sawtooth roof,
// three silver tanks on darksteel legs joined by a pipe run, a rolldoor on the
// +y front and crates of glass bottles stacked in the yard.
export function bottlingPlant(variant = 0, rank = 0) {
  const m = new Model(T, T, 26, "bottling-plant");
  const wall = pick(["plaster", "cream", "limestone"], variant);
  const roof = pick(["roofdark", "roofslate", "trim"], variant + 1);
  const label = pick(["red", "blue", "signgreen", "orange"], variant + 2);
  void rank;
  m.box(0, 0, 0, T, T, 1, "concrete");
  m.box(0, 13, 0, T, T, 1, "parking");
  // bottling hall on the back half
  m.box(1, 2, 1, 15, 12, 8, wall);
  m.box(1, 2, 1, 15, 12, 2, "darkconcrete");
  m.windows(1, 2, 15, 12, 3, 8, { floor: 3, offset: 1, height: 2, period: 4, width: 2, faces: ["w", "e"] });
  // sawtooth roof: three teeth glazed on the -y riser
  for (let k = 0; k < 3; k += 1) {
    const x0 = 1 + k * 5;
    for (let s = 0; s < 4; s += 1) m.box(x0 + s, 2, 8 + s, x0 + s + 1, 12, 9 + s, roof);
    m.box(x0 + 4, 2, 8, x0 + 5, 12, 12, "roofglass");
  }
  // rolldoor and sign on the +y face
  m.box(10, 11, 1, 14, 12, 6, "rolldoor");
  m.box(9, 11, 6, 15, 12, 7, "steel");
  m.box(1, 11, 6, 8, 12, 8, label);
  m.box(2, 11, 6, 7, 12, 7, "white");
  m.clear(3, 11, 1, 4, 12, 4);
  m.box(2, 11, 1, 4, 12, 3, "door");
  // three silver tanks on legs along the west side
  for (let i = 0; i < 3; i += 1) {
    const cy = 4 + i * 4;
    for (const [dx, dy] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) {
      m.box(2 + dx, cy + dy, 1, 3 + dx, cy + dy + 1, 4, "darksteel");
    }
    m.cylinder(3.5, cy + 0.5, 2.2, 4, 12, "tank");
    m.cylinder(3.5, cy + 0.5, 1.8, 12, 13, "steel");
    m.set(3, cy, 13, "darksteel");
  }
  // pipe run from the tanks into the hall
  m.box(5, 3, 9, 7, 16, 10, "darksteel");
  m.box(5, 3, 9, 8, 5, 10, "darksteel");
  m.box(5, 14, 9, 8, 16, 10, "darksteel");
  m.box(7, 2, 8, 8, 10, 9, "steel");
  // crates of bottles in the yard
  for (let i = 0; i < 3; i += 1) {
    const x = 8 + i * 2;
    m.box(x, 13, 1, x + 1, 15, 2, "wood");
    m.box(x, 13, 2, x + 1, 15, 3, "trunk");
  }
  for (let i = 0; i < 4; i += 1) {
    m.box(11 + i, 4, 1, 12 + i, 5, 2, "wood");
    m.box(11 + i, 4, 2, 12 + i, 5, 4, "glass");
    m.set(11 + i, 4, 4, pick(["glass", "glassdark", "signgreen"], variant + i));
  }
  m.box(2, 14, 1, 5, 15, 4, "wood");
  for (let i = 0; i < 3; i += 1) m.box(2 + i, 14, 4, 3 + i, 15, 6, "glass");
  addTruck(m, 1, 1, 1, "y", pick(["white", "blue", "orange"], variant + 3));
  return m;
}

// 1×1 · high tier · a tech lab: a crisp two-storey white plaster and glass box
// on a landscaped lawn, its roof a grid of tilted solar panels (stepped glassdark
// slabs), with a steel sculpture, a bike rack and a forecourt walk.
export function techLab(variant = 0, rank = 0) {
  const m = new Model(T, T, 26, "tech-lab");
  const glass = pick(["glassdark", "glass"], variant);
  void rank;
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(2, 8, 0, 12, T, 1, "paving");
  m.box(0, 12, 0, T, T, 1, "sidewalk");
  // main volume: two storeys, glazed ground floor and a plaster upper band
  m.box(3, 3, 1, 13, 12, 1 + 4 * S, "plaster");
  m.box(3, 3, 1, 13, 12, 2, "darkconcrete");
  m.box(4, 3, 2, 13, 12, 5, glass);
  for (let z = 2; z < 5; z += 1) for (let y = 4; y < 12; y += 3) m.box(13, y, z, 14, y + 1, z + 1, "mullion");
  m.windows(3, 3, 13, 12, 5, 1 + 4 * S, { floor: S, offset: 0, height: 2, period: 3, width: 2, faces: ["s", "n", "e", "w"] });
  m.box(2, 2, 1 + 4 * S, 14, 13, 2 + 4 * S, "white");
  m.flatRoof(3, 3, 13, 12, 2 + 4 * S, "white", "gravel");
  // tilted solar array: stepped slab modules of glassdark on steel legs
  for (let ry = 4; ry < 12; ry += 3) {
    for (let rx = 4; rx < 13; rx += 4) {
      m.box(rx, ry, 2 + 4 * S + 1, rx + 3, ry + 2, 2 + 4 * S + 2, "darksteel");
      for (let s = 0; s < 3; s += 1) {
        m.box(rx, ry + s, 2 + 4 * S + 2 + s, rx + 3, ry + s + 1, 2 + 4 * S + 3 + s, "glassdark");
      }
      m.box(rx, ry, 2 + 4 * S + 3, rx + 3, ry + 1, 2 + 4 * S + 4, "steel");
    }
  }
  // entrance: a white canopy, steps and glazing on the +y front
  m.box(5, 12, 5, 11, 15, 6, "white");
  m.box(5, 14, 1, 6, 15, 5, "white");
  m.box(10, 14, 1, 11, 15, 5, "white");
  m.clear(7, 11, 1, 10, 12, 5);
  m.box(7, 10, 1, 10, 11, 5, glass);
  m.box(6, 13, 1, 11, 14, 2, "paving");
  m.box(6, 14, 1, 11, 15, 2, "concrete");
  m.box(7, 11, 5, 10, 12, 6, pick(["blue", "signgreen", "red"], variant + 1));
  // lawn furniture: sculpture, bike rack, trees, bench
  m.box(5, 1, 1, 6, 2, 8, "steel");
  m.box(4, 1, 8, 7, 2, 9, "blue");
  m.box(5, 1, 9, 6, 2, 11, "steel");
  m.box(2, 4, 1, 3, 5, 3, "steel");
  m.box(3, 4, 2, 9, 5, 3, "steel");
  for (let x = 3; x < 9; x += 2) m.box(x, 4, 1, x + 1, 5, 2, "darksteel");
  m.box(1, 9, 1, 2, 11, 2, "steel");
  addTree(m, 12, 1.5, 1, variant % 2 ? "cherry" : "round", 4200 + variant, 0.75);
  addTree(m, 1.5, 13.5, 1, "conifer", 4210 + variant, 0.7);
  addTree(m, 14, 13.5, 1, "round", 4220 + variant, 0.7);
  addLamp(m, 1, 15, 1, "e");
  addCar(m, 3, 12, 1, "x", pick(["carblue", "carwhite", "cargreen"], variant + 2));
  return m;
}

// ---------------------------------------------------------------- size 2

// 2×2 · low tier · a lumber yard: a wood-walled sawmill shed with a roofbrown
// roof, neat stacks of planks and log rows lying along x, a small yellow forklift,
// a fence of steel posts and a soil lot scuffed with gravel and sawdust.
export function lumberYard(variant = 0, rank = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 26, "lumber-yard");
  const wall = pick(["wood", "trunk", "limestone"], variant);
  const rng = mulberry32(4300 + variant);
  void rank;
  m.box(0, 0, 0, W, W, 1, "soil");
  m.box(0, 0, 0, W, 14, 1, "gravel");
  m.box(4, 16, 0, 24, 30, 1, "paving");
  // sawmill shed on the back, wide gable over the working face
  m.box(3, 2, 1, 20, 12, 8, wall);
  m.box(3, 2, 1, 20, 12, 2, "darkconcrete");
  m.windows(3, 2, 20, 12, 3, 8, { floor: 3, offset: 1, height: 2, period: 4, width: 2, faces: ["n", "w"] });
  m.box(4, 11, 1, 16, 12, 7, "rolldoor");
  m.box(3, 11, 7, 17, 12, 8, "steel");
  m.gable(2, 1, 21, 13, 8, "x", "roofbrown", wall, 1);
  m.box(17, 3, 9, 19, 5, 18, "brick");
  m.box(17, 3, 18, 19, 5, 19, "trim");
  // stacks of planks along the east side
  addPlankStack(m, 22, 2, 26, 9, 1, 4);
  addPlankStack(m, 22, 11, 26, 17, 1, 3);
  addPlankStack(m, 22, 19, 26, 25, 1, 2);
  addPlankStack(m, 20, 20, 22, 24, 1, 2);
  // log rows lying along x across the yard
  for (let i = 0; i < 3; i += 1) addLog(m, 15, 16 + i * 3, 1, 12, 1);
  addLog(m, 16, 25, 1, 10, 1);
  addLog(m, 17, 16, 3, 11, 1);
  addLog(m, 16, 19, 3, 13, 1);
  m.box(1, 14, 1, 6, 18, 3, "wood");
  m.box(1, 18, 1, 5, 21, 2, "wood");
  // forklift and a sawdust heap
  addForklift(m, 8, 20, 1, variant % 2 ? "x" : "y");
  m.box(2, 26, 1, 5, 29, 2, "sand");
  m.box(3, 27, 2, 4, 28, 3, "sand");
  // fence: steel posts and rails along the +y street edge with a gate
  for (let x = 0; x < W; x += 2) if (x < 12 || x > 15) m.box(x, 30, 1, x + 1, 31, 5, "steel");
  m.box(0, 30, 4, W, 31, 5, "steel");
  m.box(0, 30, 2, W, 31, 3, "darksteel");
  m.box(12, 29, 1, 16, 31, 1, "gravel");
  // signboard and a light
  m.box(3, 30, 5, 9, 31, 9, pick(["orange", "red", "signgreen"], variant + 1));
  m.box(4, 30, 5, 8, 31, 8, "white");
  addLamp(m, 27, 29, 1, "w");
  // scattered bark
  for (let i = 0; i < 12; i += 1) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * 14);
    m.set(x, y, 1, "wood");
  }
  addCar(m, 4, 33, 1, "x", pick(["caryellow", "carwhite", "carred"], variant + 2));
  return m;
}

// 2×2 · high tier · a clean plant: a white plaster facility split by a blue glass
// band, two tall white silos and a white stack with a blue crown, tidy lawn with
// trees and a lined parking strip; rank raises the silos and the stack.
export function cleanPlant(variant = 0, rank = 0) {
  const W = 2 * T;
  const add = rank * 3;
  const siloTop = 20 + add;
  const stackTop = 34 + add * 2;
  const m = new Model(W, W, stackTop + 12, "clean-plant");
  const wall = pick(["plaster", "white", "limestone"], variant);
  const band = pick(["blue", "glassdark", "glass"], variant + 1);
  const accent = pick(["blue", "signgreen", "orange"], variant + 2);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 12, 1, "lawn");
  m.box(0, 26, 0, W, W, 1, "parking");
  m.box(0, 30, 0, W, W, 1, "asphalt");
  for (let x = 2; x < W; x += 6) m.box(x, 30, 0, x + 1, W, 1, "linewhite");
  // main hall with the glass band
  m.box(2, 3, 1, 28, 22, 14, wall);
  m.box(2, 3, 1, 28, 22, 2, "darkconcrete");
  m.box(2, 21, 5, 28, 22, 10, band);
  for (let x = 3; x < 28; x += 3) m.box(x, 21, 5, x + 1, 22, 10, "mullion");
  m.windows(2, 3, 28, 22, 10, 14, { floor: 3, offset: 0, height: 2, period: 4, width: 2, faces: ["s", "w", "e"] });
  m.box(1, 2, 14, 29, 23, 15, "white");
  m.flatRoof(2, 3, 28, 22, 15, "white", "gravel");
  addAc(m, 18, 8, 16);
  addAc(m, 22, 16, 16);
  // entrance canopy and door on the +y face
  m.box(12, 22, 6, 20, 26, 7, "white");
  m.box(12, 25, 1, 13, 26, 6, "white");
  m.box(19, 25, 1, 20, 26, 6, "white");
  m.box(14, 21, 1, 18, 22, 6, "glassdark");
  m.box(13, 21, 6, 19, 22, 8, accent);
  // two tall white silos on the west side, blue caps
  for (const [cy, r] of [[5.5, 3.4], [14.5, 3.4]]) {
    const cyi = Math.floor(cy);
    m.cylinder(6, cy, r, 1, siloTop, wall);
    m.cylinder(6, cy, r, 1, 3, "darkconcrete");
    m.paint(2, cyi - 4, siloTop - 5, 10, cyi + 5, siloTop - 3, band);
    m.cylinder(6, cy, r - 0.2, siloTop, siloTop + 1, "steel");
    m.cylinder(6, cy, r * 0.6, siloTop + 1, siloTop + 2, "darksteel");
    m.box(20, cyi, 1, 21, cyi + 1, siloTop - 2, "steel");
    for (let z = 4; z < siloTop - 2; z += 6) m.box(19, cyi, z, 22, cyi + 1, z + 1, "steel");
  }
  m.box(20, 5, 1, 21, 6, 18, "steel");
  m.box(20, 14, 1, 21, 15, 18, "steel");
  // stack: white with a blue crown
  m.cylinder(21, 13, 2.6, 1, stackTop, wall);
  m.cylinder(21, 13, 2.6, 1, 4, "darkconcrete");
  m.cylinder(21, 13, 2.8, stackTop - 4, stackTop, accent);
  m.cylinder(21, 13, 1.8, stackTop, stackTop + 2, "darksteel");
  m.box(18, 11, stackTop - 8, 19, 16, stackTop - 7, "steel");
  m.box(23, 11, stackTop - 8, 24, 16, stackTop - 7, "steel");
  for (let z = 10; z < stackTop - 8; z += 8) m.box(18, 11, z, 19, 16, z + 1, "steel");
  // tidy lawn, trees and lot furniture
  for (const [x, y, k] of [[2, 25, "round"], [7, 25, "conifer"], [12, 25, "round"], [26, 25, "round"]]) {
    addTree(m, x, y, 1, k, 4400 + x + y + variant, 0.7);
  }
  addCar(m, 3, 30, 1, "y", pick(["carwhite", "carblue", "cargreen"], variant + 3));
  addCar(m, 15, 30, 1, "y", pick(["carred", "carwhite"], variant + 4));
  addCar(m, 27, 30, 1, "y", pick(["caryellow", "carwhite"], variant + 5));
  m.box(9, 26, 1, 11, 28, 3, "concrete");
  m.box(10, 27, 3, 11, 28, 5, "steel");
  addLamp(m, 1, 29, 1, "e");
  addLamp(m, 29, 29, 1, "w");
  return m;
}

// ---------------------------------------------------------------- size 3

// 3×3 · low tier · a steel mill: a huge rust blast furnace with a darksteel cap
// and pipe stubs, a long corrugated shed, two banded darkbrick chimneys, ore
// heaps of rock and soil, and a rail spur of darksteel track with slag wagons.
export function steelMill(variant = 0, rank = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 62, "steel-mill");
  const skin = pick(["corrugated", "corrugatedblue", "darkconcrete"], variant);
  const band = pick(["red", "orange", "rust"], variant + 1);
  const rng = mulberry32(4500 + variant);
  void rank;
  m.box(0, 0, 0, W, W, 1, "darkconcrete");
  m.box(0, 0, 0, W, 12, 1, "soil");
  m.box(0, 34, 0, W, W, 1, "asphaltpatch");
  m.box(0, 22, 0, W, 34, 1, "gravel");
  // blast furnace: fat rust cylinder, darksteel cap, pipe stubs and a charging bridge
  m.cylinder(11, 16, 8, 1, 26, "rust");
  m.cylinder(11, 16, 8, 1, 4, "darksteel");
  m.cylinder(11, 16, 7, 26, 29, "darksteel");
  m.cylinder(11, 16, 5.5, 29, 32, "rust");
  m.cylinder(11, 16, 4.5, 32, 34, "darksteel");
  m.box(4, 13, 34, 7, 15, 35, "darksteel");
  m.box(5, 14, 30, 9, 16, 31, "darksteel");
  m.box(5, 13, 26, 7, 15, 27, "rust");
  m.box(15, 14, 28, 20, 18, 29, "darksteel");
  m.box(19, 14, 28, 20, 18, 44, "darksteel");
  for (let z = 6; z < 24; z += 5) m.cylinder(11, 16, 8.6, z, z + 1, "darksteel");
  // long corrugated shed across the back
  m.box(1, 2, 1, 44, 12, 13, skin);
  m.box(1, 2, 1, 44, 12, 2, "darkconcrete");
  for (let x = 3; x < 44; x += 5) m.box(x, 11, 3, x + 2, 12, 6, "window");
  m.box(1, 2, 13, 44, 12, 14, "roofdark");
  m.box(4, 11, 13, 44, 12, 15, "roofdark");
  for (const x of [6, 20, 34]) {
    m.box(x - 1, 31, 1, x + 7, 34, 5, "darkconcrete");
  }
  for (const x of [6, 20, 34]) {
    m.box(x, 11, 1, x + 6, 12, 8, "rolldoor");
    m.box(x - 1, 11, 8, x + 7, 13, 9, "steel");
  }
  // two chimneys near the mill, red/white bands up top
  for (const [cx, cy] of [[24, 22], [31, 22]]) {
    for (let z = 1; z < 58; z += 1) {
      const c = z > 40 ? (Math.floor(z / 5) % 2 ? band : "white") : "darkbrick";
      m.cylinder(cx, cy, z < 40 ? 3.2 : 2.8, z, z + 1, c);
    }
    m.cylinder(cx, cy, 2.8, 58, 60, "trim");
  }
  m.box(21, 20, 1, 26, 21, 30, "darkbrick");
  m.box(29, 20, 1, 34, 21, 30, "darkbrick");
  // ore heaps
  addScrapHeap(m, 6, 40, 5, 6, ["rock", "soil", "gravel"], rng);
  addScrapHeap(m, 16, 43, 4, 4, ["soil", "rock", "rust"], rng);
  addScrapHeap(m, 30, 42, 3.5, 3, ["gravel", "rock", "soil"], rng);
  addScrapHeap(m, 38, 38, 3, 2, ["rock", "gravel", "rust"], rng);
  // rail spur: darksteel track across the front and heavy wagons
  for (const y of [25, 31]) {
    m.box(0, y, 1, W, y + 1, 2, "darksteel");
  }
  for (let x = 3; x < W; x += 4) m.box(x, 24, 1, x + 2, 33, 2, "trunk");
  for (const x of [2, 22]) {
    m.box(x, 24, 2, x + 10, 28, 6, "rust");
    m.box(x, 24, 6, x + 10, 28, 7, "darksteel");
    m.box(x + 1, 24, 2, x + 9, 25, 3, "darksteel");
    for (const wx of [x + 1, x + 8]) m.box(wx, 24, 1, wx + 2, 28, 2, "tyre");
  }
  m.box(34, 24, 2, 44, 28, 4, "gravel");
  // yard props
  addAc(m, 40, 26, 1);
  m.box(45, 2, 1, 46, 8, 10, "darksteel");
  addTruck(m, 33, 34, 1, "y", pick(["orange", "red", "yellow"], variant + 2));
  return m;
}

// 3×3 · mid tier · a chemical plant: a cluster of tank-material vessels of three
// sizes, three thin steel distillation columns looped with white platforms every
// eight voxels, darksteel pipe racks on posts, a flare stack with an orange tip
// and a small control building at the street front.
export function chemicalPlant(variant = 0, rank = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 56, "chemical-plant");
  const plat = pick(["white", "limestone", "concrete"], variant);
  const tint = pick(["blue", "signgreen", "orange", "red"], variant + 1);
  void rank;
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 10, 1, "gravel");
  m.box(0, 34, 0, W, W, 1, "asphalt");
  // control building on the +y front
  m.box(20, 38, 1, 44, 46, 7, pick(["plaster", "cream", "limestone"], variant + 2));
  m.box(20, 38, 1, 44, 46, 2, "darkconcrete");
  m.box(21, 45, 2, 43, 46, 6, "glass");
  for (let x = 22; x < 43; x += 3) m.box(x, 45, 2, x + 1, 46, 6, "mullion");
  m.windows(20, 38, 44, 46, 3, 7, { floor: 3, offset: 1, height: 2, period: 4, width: 2, faces: ["w", "e", "n"] });
  m.box(19, 37, 7, 45, 47, 8, plat);
  m.flatRoof(20, 38, 44, 46, 8, plat, "gravel");
  addAc(m, 24, 40, 9);
  addAc(m, 36, 40, 9);
  m.box(29, 46, 5, 35, 47, 6, "white");
  m.box(30, 46, 5, 34, 47, 6, tint);
  // tank farm: three sizes on plinths, ringed with steel ladders
  const tanks = [[7, 8, 5.4, 20], [18, 7, 4.2, 15], [7, 22, 3.6, 12], [18, 20, 3.0, 10]];
  for (const [cx, cy, r, h] of tanks) {
    m.box(cx - 5, cy - 5, 1, cx + 5, cy + 5, 2, "darkconcrete");
    m.cylinder(cx, cy, r, 2, 2 + h, "tank");
    m.cylinder(cx, cy, r, 2, 5, "steel");
    m.cylinder(cx, cy, r - 0.2, 2 + h, 3 + h, "steel");
    m.set(cx, cy, 3 + h, "darksteel");
    for (let z = 6; z < 2 + h; z += 6) m.cylinder(cx, cy, r + 0.6, z, z + 1, "darksteel");
    for (let a = 0; a < 8; a += 1) {
      const px = Math.floor(cx + Math.cos((a * Math.PI) / 4) * (r + 0.4) - 0.5);
      const py = Math.floor(cy + Math.sin((a * Math.PI) / 4) * (r + 0.4) - 0.5);
      if (a % 2 === 0) m.box(px, py, 2, px + 1, py + 1, 2 + h - 1, "steel");
    }
  }
  // distillation columns: thin steel shafts with white platforms
  for (const [cx, cy, top] of [[30, 8, 44], [36, 8, 40], [30, 18, 36]]) {
    m.cylinder(cx, cy, 2.2, 1, top, "steel");
    m.cylinder(cx, cy, 2.4, 1, 4, "darksteel");
    m.cylinder(cx, cy, 1.4, top, top + 2, "darksteel");
    for (let z = 4; z < top; z += 8) {
      m.box(cx - 3, cy - 3, z, cx + 3, cy + 3, z + 1, plat);
      m.box(cx - 3, cy - 3, z + 1, cx - 2, cy + 3, z + 2, "trim");
      m.box(cx + 2, cy - 3, z + 1, cx + 3, cy + 3, z + 2, "trim");
      if (z + 8 < top) m.box(cx + 3, cy - 1, z + 1, cx + 4, cy + 2, z + 9, "trim");
    }
    m.box(cx - 3, cy - 3, top - 2, cx + 3, cy + 3, top - 1, plat);
  }
  // pipe racks: darksteel beams on posts, marching across the lot
  for (const y of [26, 31]) {
    for (let x = 2; x < W; x += 8) {
      m.box(x, y + 1, 1, x + 1, y + 3, 10, "steel");
      m.box(x, y, 1, x + 1, y + 1, 10, "darksteel");
      m.box(x - 1, y + 1, 1, x + 2, y + 2, 1, "darkconcrete");
    }
    m.box(2, y, 10, W - 2, y + 3, 11, "darksteel");
    m.box(2, y, 12, W - 2, y + 2, 13, "steel");
    m.box(2, y + 2, 11, W - 2, y + 3, 12, "rust");
    for (let x = 6; x < W - 4; x += 12) m.box(x, y - 1, 11, x + 1, y + 3, 13, "darksteel");
  }
  m.box(2, 12, 11, 20, 13, 12, "darksteel");
  m.box(2, 12, 1, 3, 26, 12, "darksteel");
  m.box(2, 24, 1, 24, 25, 12, "darksteel");
  // flare stack with a hot tip
  m.box(38, 26, 1, 40, 28, 44, "steel");
  m.box(38, 26, 44, 40, 28, 46, "darksteel");
  m.box(37, 25, 46, 41, 29, 48, "orange");
  m.box(38, 26, 48, 40, 28, 50, "yellow");
  m.box(38, 26, 50, 40, 28, 52, "orange");
  m.box(37, 25, 1, 41, 29, 2, "darkconcrete");
  m.box(41, 26, 1, 44, 28, 12, "darksteel");
  m.box(36, 20, 1, 37, 40, 44, "steel");
  // small yard props
  addTruck(m, 2, 38, 1, "y", pick(["white", "blue", "orange"], variant + 3));
  addCar(m, 45, 40, 1, "y", pick(["carwhite", "caryellow"], variant + 4));
  addTree(m, 46, 47, 1, "round", 4600 + variant, 0.6);
  return m;
}

// 3×3 · high tier · an assembly plant: a huge sawtooth hall over most of the lot,
// a glazed office wing on the +y front, rooftop solar and a truck yard of white
// trailers; rank adds floors to that office wing (and so to the silhouette).
export function assemblyPlant(variant = 0, rank = 0) {
  const W = 3 * T;
  const floors = 2 + rank;
  const wingTop = 1 + floors * S;
  const m = new Model(W, W, wingTop + 22, "assembly-plant");
  const skin = pick(["corrugated", "corrugatedblue", "darkconcrete"], variant);
  const wall = pick(["plaster", "concrete", "cream"], variant + 1);
  const glass = pick(["glassdark", "glass"], variant + 2);
  const sign = pick(["blue", "signgreen", "red", "orange"], variant + 3);
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 14, 1, "asphalt");
  m.box(0, 34, 0, W, W, 1, "parking");
  m.box(0, 42, 0, W, W, 1, "asphalt");
  for (let x = 2; x < W; x += 6) m.box(x, 42, 0, x + 1, W, 1, "linewhite");
  // the hall shell
  m.box(2, 14, 1, 44, 34, 15, skin);
  m.box(2, 14, 1, 44, 34, 3, "darkconcrete");
  m.windows(2, 14, 44, 34, 3, 15, { floor: 4, offset: 0, height: 3, period: 6, width: 3, faces: ["w", "e"] });
  // sawtooth: six teeth running along x, glazed risers on the -y side
  for (let k = 0; k < 6; k += 1) {
    const x0 = 2 + k * 7;
    for (let s = 0; s < 6; s += 1) m.box(x0 + s, 14, 15 + s, x0 + s + 1, 34, 16 + s, "roofdark");
    m.box(x0 + 6, 14, 15, x0 + 7, 34, 21, "roofglass");
    m.box(x0, 14, 21, x0 + 7, 34, 22, "roofdark");
  }
  // rooftop solar flanking the sawtooth ridge
  for (let y = 16; y < 34; y += 6) {
    for (let x = 4; x < 44; x += 6) {
      m.box(x, y, 17, x + 4, y + 3, 18, "darksteel");
      m.box(x, y, 18, x + 4, y + 4, 19, "glassdark");
      m.box(x, y, 19, x + 4, y + 2, 20, "steel");
    }
  }
  // loading docks on the +y face of the hall
  for (const x of [6, 18, 30]) {
    m.box(x - 1, 33, 1, x + 7, 36, 4, "darkconcrete");
    m.box(x, 32, 4, x + 6, 34, 10, "rolldoor");
    m.box(x - 1, 32, 10, x + 7, 36, 11, "steel");
  }
  // office wing: glazed floors on the +y front, sign band on top
  m.box(2, 36, 1, 18, 50, wingTop, wall);
  m.box(2, 36, 1, 18, 50, 2, "darkconcrete");
  m.box(3, 49, 2, 18, 50, wingTop - 1, glass);
  for (let z = 3; z < wingTop - 1; z += S) m.box(3, 49, z, 18, 50, z + 1, "mullion");
  for (let x = 4; x < 18; x += 3) m.box(x, 49, 2, x + 1, 50, wingTop - 1, "mullion");
  m.windows(2, 36, 18, 50, 2, wingTop - 1, { floor: S, offset: 1, height: 2, period: 3, width: 2, faces: ["w", "e", "n"] });
  m.box(1, 35, wingTop, 19, 51, wingTop + 1, "white");
  m.flatRoof(2, 36, 18, 50, wingTop + 1, "white", "gravel");
  addAc(m, 4, 40, wingTop + 2);
  addAc(m, 14, 46, wingTop + 2);
  m.box(4, 36, wingTop + 2, 13, 38, wingTop + 6, sign);
  m.box(5, 36, wingTop + 3, 12, 38, wingTop + 5, "white");
  // entrance: canopy and glazing at the middle of the wing
  m.box(6, 50, 5, 15, 54, 6, "white");
  m.box(6, 53, 1, 7, 54, 5, "white");
  m.box(14, 53, 1, 15, 54, 5, "white");
  m.clear(8, 49, 1, 13, 50, 5);
  m.box(8, 48, 1, 13, 49, 5, glass);
  m.box(9, 48, 5, 12, 49, 6, sign);
  // truck yard: white trailers and a tractor unit
  for (let i = 0; i < 3; i += 1) {
    m.box(20 + i * 2, 36, 1, 22 + i * 2, 50, 7, "white");
    m.box(20 + i * 2, 36, 7, 22 + i * 2, 50, 8, "steel");
    m.box(20 + i * 2, 35, 1, 22 + i * 2, 36, 5, "darksteel");
    for (const wy of [38, 46]) m.box(20 + i * 2, wy, 1, 22 + i * 2, wy + 2, 2, "tyre");
  }
  addTruck(m, 4, 36, 1, "y", "white");
  addTruck(m, 30, 40, 1, "y", pick(["orange", "red", "blue"], variant + 4));
  // cars in the lined park and a few trees by the office
  for (const [x, y] of [[3, 43], [15, 43], [27, 43], [39, 43]]) {
    addCar(m, x, y, 1, "y", pick(["carwhite", "carblue", "carred", "cargreen"], variant + x));
  }
  for (let x = 2; x < W; x += 6) m.box(x, 41, 0, x + 1, 42, 1, "lineyellow");
  addTree(m, 22, 52, 1, "round", 4700 + variant, 0.7);
  addTree(m, 40, 52, 1, "conifer", 4710 + variant, 0.7);
  addLamp(m, 1, 41, 1, "e");
  addLamp(m, 46, 41, 1, "w");
  return m;
}

// 3×3 · low tier · a container depot: neat stacks of corrugated shipping
// containers in six colours up to four high, a yellow gantry crane straddling a
// row, a lined asphalt lot and trucks shuttling at the street front.
export function containerDepot(variant = 0, rank = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 40, "container-depot");
  const palette = pick(
    [
      ["red", "blue", "orange", "signgreen", "yellow", "rust"],
      ["blue", "signgreen", "red", "yellow", "orange", "corrugated"],
      ["orange", "red", "corrugatedblue", "signgreen", "yellow", "rust"],
    ],
    variant,
  );
  const rng = mulberry32(4800 + variant);
  void rank;
  m.box(0, 0, 0, W, W, 1, "asphalt");
  m.box(0, 0, 0, W, 8, 1, "darkconcrete");
  m.box(0, 40, 0, W, W, 1, "parking");
  for (let y = 10; y < 40; y += 10) m.box(0, y, 0, W, y + 1, 1, "lineyellow");
  for (let x = 6; x < W; x += 10) m.box(x, 40, 0, x + 1, W, 1, "linewhite");
  // container stacks: 8 x 4 footprint, up to 4 courses, colour per course
  const stacks = [
    [2, 10, 4], [12, 10, 3], [22, 10, 4], [32, 10, 2], [38, 10, 3],
    [2, 18, 3], [12, 18, 2], [22, 18, 4], [32, 18, 3], [40, 18, 2],
    [2, 26, 2], [12, 26, 3], [22, 26, 2], [32, 26, 4], [40, 26, 3],
    [2, 34, 3], [12, 34, 2], [22, 34, 3], [32, 34, 2], [40, 34, 3],
  ];
  for (const [x, y, hi] of stacks) {
    for (let k = 0; k < hi; k += 1) {
      const c = palette[Math.floor(rng() * palette.length)];
      const rib = rng() < 0.5 ? "corrugated" : c;
      m.box(x, y, 1 + k * 2, x + 8, y + 4, 2 + k * 2, c);
      m.box(x, y, 2 + k * 2, x + 8, y + 4, 3 + k * 2, rib);
      m.box(x, y, 1 + k * 2, x + 1, y + 4, 2 + k * 2, "darksteel");
      m.box(x + 4, y, 1 + k * 2, x + 5, y + 4, 2 + k * 2, c);
      m.box(x, y, 3 + k * 2, x + 8, y + 4, 4 + k * 2, "darksteel");
      m.box(x, y, 2 + k * 2, x + 1, y + 1, 3 + k * 2, "steel");
      m.box(x + 7, y + 3, 2 + k * 2, x + 8, y + 4, 3 + k * 2, "steel");
    }
  }
  // gantry crane: two yellow legs straddling the central row, beam and trolley
  for (const x of [7, 35]) {
    m.box(x, 15, 1, x + 2, 18, 20, "yellow");
    m.box(x, 15, 20, x + 2, 18, 21, "darksteel");
    m.box(x - 3, 12, 1, x + 5, 15, 2, "steel");
    m.box(x - 3, 18, 1, x + 5, 21, 2, "steel");
    for (let z = 4; z < 20; z += 3) m.box(x, 15, z, x + 2, 18, z + 1, "darksteel");
  }
  m.box(4, 15, 20, 38, 18, 22, "yellow");
  m.box(4, 15, 22, 38, 18, 23, "darksteel");
  m.box(19, 15, 23, 23, 18, 25, "orange");
  m.box(20, 15, 25, 22, 18, 29, "darksteel");
  m.box(19, 14, 28, 23, 19, 30, "steel");
  // office hut and a workshop container on the back edge
  m.box(20, 1, 1, 30, 7, 6, "corrugatedblue");
  m.box(20, 6, 2, 30, 7, 5, "window");
  m.box(19, 0, 6, 31, 8, 7, "darksteel");
  m.box(20, 6, 1, 22, 7, 4, "door");
  m.box(32, 1, 1, 44, 7, 5, "corrugated");
  m.box(32, 6, 2, 44, 7, 4, "window");
  m.box(31, 0, 5, 45, 8, 6, "roofdark");
  // trucks in the yard and on the street edge
  addTruck(m, 2, 30, 1, "y", pick(["orange", "red", "blue"], variant + 1));
  addTruck(m, 20, 40, 1, "y", pick(["white", "yellow"], variant + 2));
  addTruck(m, 34, 40, 1, "y", "signgreen");
  addCar(m, 8, 42, 1, "y", pick(["carwhite", "carred", "caryellow"], variant + 3));
  addCar(m, 28, 42, 1, "y", pick(["carblue", "carwhite"], variant + 4));
  // lot furniture: lamps, barrels and a barrier
  addLamp(m, 1, 39, 1, "e");
  addLamp(m, 45, 39, 1, "w");
  m.cylinder(45, 30, 1.4, 1, 4, pick(["rust", "blue", "orange"], variant + 5));
  m.cylinder(45, 34, 1.4, 1, 4, pick(["rust", "signgreen"], variant + 6));
  m.box(4, 42, 1, 12, 43, 3, "steel");
  m.box(4, 42, 3, 12, 43, 4, "darksteel");
  return m;
}

export const DESIGNS = [
  { id: "scrapyard", zone: "i", size: 1, tier: "low", label: "Scrapyard / 废料场", make: scrapyard },
  { id: "bottlingPlant", zone: "i", size: 1, tier: "mid", label: "Bottling plant / 灌装厂", make: bottlingPlant },
  { id: "techLab", zone: "i", size: 1, tier: "high", label: "Tech lab / 科技实验室", make: techLab },
  { id: "lumberYard", zone: "i", size: 2, tier: "low", label: "Lumber yard / 木材堆场", make: lumberYard },
  { id: "cleanPlant", zone: "i", size: 2, tier: "high", label: "Clean plant / 洁净工厂", make: cleanPlant },
  { id: "steelMill", zone: "i", size: 3, tier: "low", label: "Steel mill / 钢铁厂", make: steelMill },
  { id: "chemicalPlant", zone: "i", size: 3, tier: "mid", label: "Chemical plant / 化工厂", make: chemicalPlant },
  { id: "assemblyPlant", zone: "i", size: 3, tier: "high", label: "Assembly plant / 总装厂", make: assemblyPlant },
  { id: "containerDepot", zone: "i", size: 3, tier: "low", label: "Container depot / 集装箱货场", make: containerDepot },
];
