// Twelve individually designed Bonsai City buildings plus the trees and street
// furniture the sample district needs. Each building is authored facing +y
// (its street front) on a lot of size tiles × TILE_VOXELS; z = 0 is the lot
// surface (lawn, paving, parking) and the building rises from z = 1.
// `variant` only swaps colours and small furniture — never the design.

import { Model, TILE_VOXELS as T, STOREY as S, mulberry32 } from "./voxel.mjs";

const pick = (list, variant) => list[((variant % list.length) + list.length) % list.length];

// ---------------------------------------------------------------- props

export function addTree(m, cx, cy, z, kind, seed, scale = 1) {
  const rng = mulberry32(seed);
  if (kind === "conifer") {
    const h = Math.round((11 + rng() * 5) * scale);
    m.box(Math.floor(cx), Math.floor(cy), z, Math.floor(cx) + 1, Math.floor(cy) + 1, z + 3, "trunk");
    for (let k = 0; k < h; k += 1) {
      const r = (1 - k / h) * 3.6 * scale + 0.6;
      if (k % 3 === 2) continue;
      m.cylinder(cx + 0.5, cy + 0.5, r, z + 2 + k, z + 3 + k, "conifer");
    }
    m.set(Math.floor(cx), Math.floor(cy), z + 2 + h, "conifer");
    return;
  }
  const trunkH = Math.round((4 + rng() * 2) * scale);
  m.box(Math.floor(cx), Math.floor(cy), z, Math.floor(cx) + 1, Math.floor(cy) + 1, z + trunkH, "trunk");
  const r = (3.2 + rng() * 1.3) * scale;
  const canopy = kind === "cherry" ? "cherry" : (rng() < 0.5 ? "leaf" : "leafdark");
  const accent = kind === "cherry" ? "cherrydeep" : "leaflight";
  m.blob(cx + 0.5, cy + 0.5, z + trunkH + r * 0.7, r, r, r * 0.85, canopy, rng, 0.25, accent);
}

export function addLamp(m, x, y, z, facing = "s") {
  m.box(x, y, z, x + 1, y + 1, z + 8, "lamppole");
  const dx = facing === "e" ? 1 : facing === "w" ? -1 : 0;
  const dy = facing === "s" ? 1 : facing === "n" ? -1 : 0;
  m.set(x + dx, y + dy, z + 7, "lamppole");
  m.set(x + 2 * dx, y + 2 * dy, z + 7, "lamppole");
  m.set(x + 2 * dx, y + 2 * dy, z + 6, "lamp");
}

// A car 5 long × 3 wide along `axis`, sitting on z.
export function addCar(m, x, y, z, axis, color) {
  const [w, d] = axis === "x" ? [5, 3] : [3, 5];
  m.box(x, y, z, x + w, y + d, z + 1, "tyre");
  m.box(x, y, z + 1, x + w, y + d, z + 2, color);
  if (axis === "x") {
    m.box(x + 1, y, z + 2, x + 4, y + d, z + 3, "glassdark");
    m.box(x + 2, y, z + 2, x + 3, y + d, z + 3, color);
    m.box(x + 1, y, z + 3, x + 4, y + d, z + 4, color);
  } else {
    m.box(x, y + 1, z + 2, x + w, y + 4, z + 3, "glassdark");
    m.box(x, y + 2, z + 2, x + w, y + 3, z + 3, color);
    m.box(x, y + 1, z + 3, x + w, y + 4, z + 4, color);
  }
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

function addAc(m, x, y, z) {
  m.box(x, y, z, x + 2, y + 2, z + 2, "steel");
  m.set(x, y, z + 1, "darksteel");
}

function addWaterTank(m, cx, cy, z) {
  for (const [dx, dy] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) m.box(cx + dx, cy + dy, z, cx + dx + 1, cy + dy + 1, z + 3, "darksteel");
  m.cylinder(cx, cy, 2.8, z + 3, z + 8, "wood");
  m.cylinder(cx, cy, 2.2, z + 8, z + 9, "roofdark");
  m.set(Math.floor(cx), Math.floor(cy), z + 9, "roofdark");
}

function addUmbrella(m, x, y, z, color) {
  m.set(x, y, z, "white");
  m.box(x, y, z + 1, x + 1, y + 1, z + 4, "white");
  m.box(x - 1, y - 1, z + 4, x + 2, y + 2, z + 5, color);
  m.set(x, y, z + 5, color);
}

function hedgeRing(m, x0, y0, x1, y1, z, gapFrom, gapTo) {
  for (let x = x0; x < x1; x += 1) {
    if (x < gapFrom || x >= gapTo) m.box(x, y1 - 1, z, x + 1, y1, z + 2, "hedge");
    m.box(x, y0, z, x + 1, y0 + 1, z + 2, "hedge");
  }
  m.box(x0, y0, z, x0 + 1, y1, z + 2, "hedge");
  m.box(x1 - 1, y0, z, x1, y1, z + 2, "hedge");
}

function stripedAwning(m, x0, x1, y, z, a, b = "white") {
  // A sloped canvas awning over a shopfront on the +y face, stripes along x.
  for (let x = x0; x < x1; x += 1) {
    const c = (x - x0) % 2 === 0 ? a : b;
    m.set(x, y, z + 1, c);
    m.set(x, y + 1, z, c);
    m.set(x, y + 2, z - 1, c);
  }
}

// ---------------------------------------------------------------- residential

// 1×1 · a storey-and-a-half cottage with a porch, picket fence and garden tree.
export function cottage(variant = 0) {
  const m = new Model(T, T, 24, "cottage");
  const wall = pick(["cream", "sky", "butter", "mint"], variant);
  const roof = pick(["roofred", "roofslate", "roofbrown", "roofgreen"], variant);
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(7, 12, 0, 9, T, 1, "paving");
  m.box(3, 4, 1, 13, 11, 7, wall);
  m.box(3, 4, 1, 13, 11, 2, "white");
  m.windows(3, 4, 13, 11, 1, 7, { floor: 6, offset: 2, height: 2, period: 4, width: 2, faces: ["s", "n", "e", "w"] });
  m.box(7, 10, 1, 9, 11, 5, "door");
  m.box(6, 11, 1, 10, 13, 2, "wood");
  m.box(6, 12, 2, 7, 13, 5, "white");
  m.box(9, 12, 2, 10, 13, 5, "white");
  m.box(5, 11, 5, 11, 13, 6, roof);
  m.gable(3, 4, 13, 11, 7, "x", roof, wall, 1);
  m.box(10, 6, 7, 12, 8, 14, "brick");
  m.box(10, 6, 14, 12, 8, 15, "trim");
  for (let x = 0; x < T; x += 2) if (x < 6 || x > 9) m.box(x, 15, 1, x + 1, 16, 3, "white");
  m.box(0, 15, 2, 6, 16, 3, "white");
  m.box(10, 15, 2, T, 16, 3, "white");
  addTree(m, 1.5, 1.5, 1, variant % 3 === 1 ? "cherry" : "round", 11 + variant, 0.8);
  m.box(12, 12, 1, 15, 14, 2, variant % 2 ? "flowerred" : "floweryellow");
  return m;
}

// 1×1 · a two-storey semi-detached pair, two colours, hipped roof, a car.
export function duplex(variant = 0) {
  const m = new Model(T, T, 22, "duplex");
  const [left, right] = pick([["salmon", "mint"], ["butter", "sky"], ["cream", "salmon"]], variant);
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(1, 10, 0, 6, T, 1, "paving");
  m.box(2, 3, 1, 8, 11, 7, left);
  m.box(8, 3, 1, 14, 11, 7, right);
  m.box(2, 3, 4, 14, 11, 5, "white");
  m.windows(2, 3, 14, 11, 1, 7, { floor: 3, offset: 1, height: 2, period: 3, width: 1 });
  m.box(4, 10, 1, 5, 11, 3, "doorgreen");
  m.box(11, 10, 1, 12, 11, 3, "doorred");
  m.box(3, 11, 3, 6, 12, 4, "white");
  m.box(10, 11, 3, 13, 12, 4, "white");
  m.hip(2, 3, 14, 11, 7, pick(["roofslate", "roofred", "roofbrown"], variant), 1);
  m.box(7, 5, 11, 9, 7, 13, "brick");
  addCar(m, 1, 11, 1, "y", pick(["carred", "carblue", "carwhite"], variant));
  m.box(9, 13, 1, 15, 15, 2, "hedge");
  addTree(m, 13.5, 1.5, 1, "round", 23 + variant, 0.7);
  return m;
}

// 2×2 · a five-storey brick walk-up with a cornice, fire escape, stoop and
// a wooden water tank on the roof.
export function walkup(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 34, "walkup");
  const wall = pick(["brick", "darkbrick", "salmon"], variant);
  m.box(0, 0, 0, W, W, 1, "sidewalk");
  m.box(3, 4, 1, 29, 28, 1 + 5 * S + 1, wall);
  m.box(3, 4, 1, 29, 28, 2, "limestone");
  m.windows(3, 4, 29, 28, 2, 1 + 5 * S, { floor: S, offset: 0, height: 2, period: 3, width: 2, margin: 1 });
  const top = 1 + 5 * S + 1;
  m.box(2, 3, top, 30, 29, top + 1, "white");
  m.flatRoof(3, 4, 29, 28, top + 1, "limestone", "gravel");
  // stoop and door
  m.box(13, 28, 1, 19, 30, 2, "limestone");
  m.box(14, 30, 1, 18, 31, 1, "limestone");
  m.clear(14, 27, 2, 18, 28, 6);
  m.box(14, 26, 2, 18, 27, 6, "doorgreen");
  m.box(13, 28, 6, 19, 29, 7, "trim");
  // fire escape on the east face
  for (let z = 4; z < top; z += S) {
    m.box(29, 8, z, 31, 24, z + 1, "trim");
    m.box(30, 8, z + 1, 31, 24, z + 2, "darksteel");
    const k = ((z - 4) / S) % 2;
    m.box(29, k ? 10 : 20, z + 1, 30, k ? 14 : 24, z + 2, "darksteel");
  }
  addWaterTank(m, 9, 11, top + 2);
  m.box(20, 16, top + 2, 25, 21, top + 6, wall);
  m.box(20, 16, top + 6, 25, 21, top + 7, "trim");
  addAc(m, 22, 8, top + 2);
  addAc(m, 14, 20, top + 2);
  for (const x of [2, 26]) addTree(m, x + 1, 30, 1, "round", 31 + x + variant, 0.8);
  return m;
}

// 3×3 · a twenty-storey point tower with balconies, set in a garden with a
// pool and a short run of parking.
export function residentialTower(variant = 0, rank = 2) {
  const W = 3 * T;
  const floors = 14 + rank * 3;
  const m = new Model(W, W, 1 + floors * S + 14, "residential-tower");
  const wall = pick(["limestone", "plaster", "cream"], variant);
  const accent = pick(["sky", "salmon", "mint"], variant);
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(20, 36, 0, 28, W, 1, "paving");
  // pool terrace
  m.box(3, 30, 0, 17, 44, 1, "paving");
  m.box(5, 32, 0, 15, 42, 1, "poolwater");
  m.box(3, 30, 1, 17, 31, 2, "white");
  // parking strip
  m.box(33, 30, 0, 46, 46, 1, "parking");
  for (let y = 30; y < 46; y += 4) m.box(33, y, 0, 46, y + 1, 1, "linewhite");
  addCar(m, 35, 31, 1, "x", "carwhite");
  addCar(m, 40, 35, 1, "x", "carred");
  addCar(m, 35, 43, 1, "x", "carblue");
  // tower
  const x0 = 14, y0 = 8, x1 = 34, y1 = 30;
  const top = 1 + floors * S;
  m.box(x0, y0, 1, x1, y1, top, wall);
  m.box(x0, y0, 1, x1, y1, 4, "glassdark");
  m.windows(x0, y0, x1, y1, 4, top, { floor: S, offset: 0, height: 2, period: 3, width: 2 });
  // balconies every floor on the front and back, alternating accent panels
  for (let z = 4; z < top; z += S) {
    const rail = Math.floor(z / S) % 2 ? "white" : accent;
    for (const y of [y1, y0 - 1]) {
      m.box(x0 + 2, y, z, x1 - 2, y + 1, z + 1, "white");
      m.box(x0 + 2, y, z + 1, x1 - 2, y + 1, z + 2, rail);
    }
  }
  // corner accent columns
  for (const x of [x0, x1 - 1]) for (const y of [y0, y1 - 1]) m.box(x, y, 4, x + 1, y + 1, top, accent);
  m.box(x0 - 1, y0 - 1, top, x1 + 1, y1 + 1, top + 1, "white");
  m.flatRoof(x0, y0, x1, y1, top + 1, "white", "gravel");
  m.box(x0 + 6, y0 + 6, top + 2, x0 + 14, y0 + 14, top + 7, wall);
  m.box(x0 + 5, y0 + 5, top + 7, x0 + 15, y0 + 15, top + 8, "trim");
  addAc(m, x0 + 2, y0 + 2, top + 2);
  addAc(m, x1 - 5, y1 - 5, top + 2);
  m.box(x1 - 4, y0 + 3, top + 2, x1 - 3, y0 + 4, top + 12, "darksteel");
  // entrance canopy
  m.box(20, y1, 4, 28, y1 + 4, 5, "white");
  m.box(20, y1 + 3, 1, 21, y1 + 4, 4, "trim");
  m.box(27, y1 + 3, 1, 28, y1 + 4, 4, "trim");
  for (const [x, y, k] of [[3, 4, "round"], [8, 3, "cherry"], [4, 12, "round"], [40, 4, "round"], [42, 12, "conifer"], [4, 22, "round"]]) {
    addTree(m, x, y, 1, k, 41 + x * 3 + y + variant, 0.9);
  }
  return m;
}

// ---------------------------------------------------------------- commercial

// 1×1 · a two-storey corner shop: glazed shopfront, striped awning, sign band,
// a flat above.
export function cornerShop(variant = 0) {
  const m = new Model(T, T, 20, "corner-shop");
  const wall = pick(["butter", "salmon", "sky", "plaster"], variant);
  const awning = pick(["awningred", "awninggreen", "awningblue"], variant);
  const sign = pick(["signgreen", "red", "blue"], variant);
  m.box(0, 0, 0, T, T, 1, "sidewalk");
  m.box(1, 2, 1, 15, 12, 8, wall);
  m.box(2, 11, 1, 14, 12, 4, "glass");
  m.box(2, 11, 1, 14, 12, 2, "trim");
  m.box(7, 11, 1, 9, 12, 4, "door");
  m.box(1, 12, 4, 15, 13, 5, sign);
  stripedAwning(m, 1, 15, 12, 5, awning);
  m.windows(1, 2, 15, 12, 5, 8, { floor: 3, offset: 1, height: 2, period: 3, width: 1, faces: ["s", "e", "w"] });
  m.box(0, 1, 8, T, 13, 9, "white");
  m.flatRoof(1, 2, 15, 12, 9, wall, "gravel");
  addAc(m, 3, 4, 10);
  m.box(10, 4, 10, 13, 6, 13, sign);
  // crates of produce out front
  m.box(2, 13, 1, 4, 14, 2, "wood");
  m.box(2, 13, 2, 4, 14, 3, variant % 2 ? "flowerred" : "floweryellow");
  m.box(12, 13, 1, 14, 14, 2, "wood");
  m.box(12, 13, 2, 14, 14, 3, "leaflight");
  return m;
}

// 1×1 · a single-storey diner with big windows, a rooftop sign and tables
// under umbrellas on the pavement.
export function cafe(variant = 0) {
  const m = new Model(T, T, 18, "cafe");
  const wall = pick(["mint", "pink", "butter"], variant);
  m.box(0, 0, 0, T, T, 1, "paving");
  m.box(2, 2, 1, 14, 9, 6, wall);
  m.box(2, 8, 2, 14, 9, 5, "glass");
  for (let x = 3; x < 14; x += 3) m.box(x, 8, 2, x + 1, 9, 5, "white");
  m.box(6, 8, 1, 8, 9, 5, "door");
  m.box(2, 2, 1, 14, 9, 2, "white");
  m.box(1, 1, 6, 15, 10, 7, "white");
  m.box(2, 9, 6, 14, 11, 7, pick(["awningred", "awningblue", "awninggreen"], variant));
  m.box(4, 4, 7, 12, 5, 11, "red");
  m.box(5, 4, 8, 11, 5, 10, "white");
  m.box(4, 4, 11, 12, 5, 12, "yellow");
  addAc(m, 10, 6, 7);
  addUmbrella(m, 4, 13, 1, variant % 2 ? "awningred" : "awninggreen");
  addUmbrella(m, 11, 13, 1, variant % 2 ? "yellow" : "awningblue");
  m.box(3, 12, 1, 6, 15, 2, "white");
  m.box(10, 12, 1, 13, 15, 2, "white");
  addTree(m, 14, 3, 1, "round", 77 + variant, 0.6);
  return m;
}

// 2×2 · an eight-storey office slab with ribbon windows, an entrance canopy,
// a planted forecourt and staff parking behind.
export function office(variant = 0) {
  const W = 2 * T;
  const floors = 8;
  const m = new Model(W, W, 1 + floors * S + 10, "office");
  const frame = pick(["concrete", "limestone", "plaster"], variant);
  const glass = pick(["glass", "glassdark"], variant);
  m.box(0, 0, 0, W, W, 1, "paving");
  m.box(0, 0, 0, W, 8, 1, "parking");
  for (let x = 2; x < W; x += 4) m.box(x, 0, 0, x + 1, 6, 1, "linewhite");
  addCar(m, 3, 1, 1, "y", "carblue");
  addCar(m, 11, 1, 1, "y", "carwhite");
  addCar(m, 23, 1, 1, "y", "caryellow");
  const top = 1 + floors * S;
  m.box(4, 9, 1, 28, 24, top, frame);
  for (let z = 2; z < top; z += S) m.paint(4, 9, z, 28, 24, z + 2, glass);
  m.box(5, 10, 2, 27, 23, top, frame);
  m.box(4, 9, 1, 28, 24, 2, frame);
  for (let x = 4; x < 28; x += 4) m.box(x, 23, 2, x + 1, 24, top, frame);
  for (let y = 9; y < 24; y += 4) {
    m.box(4, y, 2, 5, y + 1, top, frame);
    m.box(27, y, 2, 28, y + 1, top, frame);
  }
  m.box(3, 8, top, 29, 25, top + 1, "trim");
  m.flatRoof(4, 9, 28, 24, top + 1, frame, "gravel");
  m.box(8, 12, top + 2, 16, 19, top + 6, "darkconcrete");
  m.box(8, 12, top + 6, 16, 19, top + 7, "steel");
  addAc(m, 20, 12, top + 2);
  addAc(m, 23, 12, top + 2);
  addAc(m, 20, 18, top + 2);
  // canopy and doors
  m.box(12, 24, 4, 20, 28, 5, "white");
  m.box(12, 27, 1, 13, 28, 4, "steel");
  m.box(19, 27, 1, 20, 28, 4, "steel");
  m.box(14, 23, 2, 18, 24, 4, "glassdark");
  // planters
  for (const x of [3, 8, 23, 28]) {
    m.box(x - 1, 27, 1, x + 2, 30, 2, "concrete");
    addTree(m, x, 28, 2, "round", 90 + x + variant, 0.7);
  }
  // company sign on the front parapet
  m.box(18, 25, top - 3, 26, 26, top - 1, pick(["blue", "signgreen", "red"], variant));
  return m;
}

// 3×3 · a glass tower on a stone podium: setbacks, a lit crown and a spire,
// a fountain plaza on the corner.
export function skyscraper(variant = 0, rank = 4) {
  const W = 3 * T;
  const shaftTop = 44 + rank * 8;
  const m = new Model(W, W, shaftTop + 44, "skyscraper");
  const stone = pick(["limestone", "concrete", "cream"], variant);
  const glass = pick(["glass", "glassdark"], variant);
  m.box(0, 0, 0, W, W, 1, "paving");
  // fountain plaza
  m.cylinder(10, 38, 5.5, 1, 2, "limestone");
  m.cylinder(10, 38, 4.5, 1, 2, "poolwater");
  m.box(9, 37, 1, 11, 39, 5, "white");
  for (const [x, y] of [[3, 30], [3, 45], [18, 45]]) addTree(m, x, y, 1, "round", 120 + x + y + variant, 0.8);
  // podium: three storeys of stone with a glazed ground floor
  const px0 = 20, py0 = 4, px1 = 46, py1 = 44;
  m.box(px0, py0, 1, px1, py1, 11, stone);
  m.box(px0, py1 - 1, 1, px1, py1, 4, "glassdark");
  m.box(px0, py0, 1, px0 + 1, py1, 4, "glassdark");
  m.windows(px0, py0, px1, py1, 4, 11, { floor: S, offset: 1, height: 2, period: 3, width: 2 });
  m.box(px0 - 1, py0 - 1, 11, px1 + 1, py1 + 1, 12, "white");
  m.box(px0, py0, 12, px1, py1, 13, "roofglass");
  // tower shaft, curtain wall with fins every third voxel
  const tx0 = 24, ty0 = 10, tx1 = 42, ty1 = 34;
  m.box(tx0, ty0, 12, tx1, ty1, shaftTop, glass);
  for (let x = tx0; x < tx1; x += 3) {
    m.box(x, ty1 - 1, 12, x + 1, ty1, shaftTop, "mullion");
    m.box(x, ty0, 12, x + 1, ty0 + 1, shaftTop, "mullion");
  }
  for (let y = ty0; y < ty1; y += 3) {
    m.box(tx0, y, 12, tx0 + 1, y + 1, shaftTop, "mullion");
    m.box(tx1 - 1, y, 12, tx1, y + 1, shaftTop, "mullion");
  }
  for (let z = 22; z < shaftTop; z += 12) m.paint(tx0, ty0, z, tx1, ty1, z + 1, "mullion");
  // setback and crown
  m.box(tx0 + 3, ty0 + 3, shaftTop, tx1 - 3, ty1 - 3, shaftTop + 16, glass);
  for (let x = tx0 + 3; x < tx1 - 3; x += 3) m.box(x, ty1 - 4, shaftTop, x + 1, ty1 - 3, shaftTop + 16, "mullion");
  for (let y = ty0 + 3; y < ty1 - 3; y += 3) m.box(tx1 - 4, y, shaftTop, tx1 - 3, y + 1, shaftTop + 16, "mullion");
  m.box(tx0 + 2, ty0 + 2, shaftTop, tx1 - 2, ty1 - 2, shaftTop + 1, "white");
  m.box(tx0 + 6, ty0 + 6, shaftTop + 16, tx1 - 6, ty1 - 6, shaftTop + 24, stone);
  m.box(tx0 + 5, ty0 + 5, shaftTop + 24, tx1 - 5, ty1 - 5, shaftTop + 25, "white");
  m.box(tx0 + 7, ty0 + 7, shaftTop + 25, tx1 - 7, ty1 - 7, shaftTop + 27, "windowlit");
  m.box(tx0 + 8, ty0 + 8, shaftTop + 27, tx1 - 8, ty1 - 8, shaftTop + 28, "white");
  m.box(32, 21, shaftTop + 28, 34, 23, shaftTop + 40, "steel");
  m.set(32, 21, shaftTop + 40, "red");
  return m;
}

// ---------------------------------------------------------------- industrial

// 1×1 · a brick workshop with a sawtooth roof, a yellow roll-up door and a
// yard of crates behind a fence.
export function workshop(variant = 0) {
  const m = new Model(T, T, 16, "workshop");
  const wall = pick(["brick", "corrugated", "darkbrick"], variant);
  m.box(0, 0, 0, T, T, 1, "parking");
  m.box(1, 1, 1, 15, 10, 6, wall);
  // sawtooth: three teeth, glazing on the north-facing risers
  for (let k = 0; k < 3; k += 1) {
    const x0 = 1 + k * 5;
    for (let s = 0; s < 4; s += 1) m.box(x0 + s, 1, 6 + s, x0 + s + 1, 10, 7 + s, "roofdark");
    m.box(x0 + 4, 1, 6, x0 + 5, 10, 10, "roofglass");
  }
  m.box(4, 9, 1, 10, 10, 5, "rolldoor");
  m.box(11, 9, 1, 13, 10, 4, "door");
  m.box(1, 9, 5, 15, 10, 6, "trim");
  m.box(12, 3, 6, 14, 5, 13, "darkbrick");
  // yard
  m.box(1, 12, 1, 4, 15, 3, "wood");
  m.box(5, 13, 1, 7, 15, 2, "wood");
  m.cylinder(13, 13, 1.3, 1, 4, "blue");
  m.cylinder(10.5, 14, 1.3, 1, 4, "rust");
  for (let x = 0; x < T; x += 1) if (x % 3 === 0) m.box(x, 15, 1, x + 1, 16, 4, "steel");
  m.box(0, 15, 3, T, 16, 4, "steel");
  return m;
}

// 2×2 · a corrugated warehouse with loading docks, lorries and a painted yard.
export function warehouse(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 22, "warehouse");
  const skin = pick(["corrugated", "corrugatedblue"], variant);
  m.box(0, 0, 0, W, W, 1, "parking");
  m.box(2, 2, 1, 30, 20, 11, skin);
  m.box(2, 2, 1, 30, 20, 2, "darkconcrete");
  // shallow pitched roof
  for (let k = 0; k < 3; k += 1) m.box(1 + k, 1, 11 + k, 31 - k, 21, 12 + k, "roofdark");
  m.box(4, 1, 14, 28, 21, 15, "roofdark");
  // docks on the front
  m.box(2, 20, 1, 30, 23, 3, "darkconcrete");
  for (const x of [5, 13, 21]) {
    m.box(x, 19, 3, x + 6, 20, 9, "rolldoor");
    m.box(x - 1, 20, 9, x + 7, 22, 10, "trim");
  }
  addTruck(m, 5, 23, 1, "y", pick(["orange", "red", "blue"], variant));
  addTruck(m, 21, 24, 1, "y", "signgreen");
  for (let x = 2; x < 30; x += 8) m.box(x, 22, 0, x + 1, W, 1, "lineyellow");
  // sign and office annex
  m.box(10, 20, 11, 22, 21, 13, pick(["orange", "blue", "red"], variant));
  m.box(26, 24, 1, 31, 30, 5, "plaster");
  m.windows(26, 24, 31, 30, 1, 5, { floor: 4, offset: 1, height: 2, period: 3, width: 1 });
  m.flatRoof(26, 24, 31, 30, 5, "trim", "gravel");
  addTree(m, 1, 29, 1, "round", 150 + variant, 0.7);
  return m;
}

// 2×2 · a brick factory hall, a striped chimney, two silver tanks and pipes.
export function factory(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 58, "factory");
  const wall = pick(["brick", "darkbrick"], variant);
  m.box(0, 0, 0, W, W, 1, "parking");
  m.box(2, 8, 1, 22, 28, 9, wall);
  m.windows(2, 8, 22, 28, 2, 8, { floor: 7, offset: 1, height: 4, period: 4, width: 2, glass: "window" });
  for (let k = 0; k < 4; k += 1) {
    const y0 = 8 + k * 5;
    for (let s = 0; s < 4; s += 1) m.box(2, y0 + s, 9 + s, 22, y0 + s + 1, 10 + s, "roofdark");
    m.box(2, y0 + 4, 9, 22, y0 + 5, 13, "roofglass");
  }
  m.box(8, 27, 1, 14, 28, 7, "rolldoor");
  // chimney: red and white bands
  for (let z = 1; z < 56; z += 1) {
    const band = Math.floor(z / 6) % 2 ? "red" : "white";
    m.cylinder(26, 6, z < 40 ? 2.6 : 2.2, z, z + 1, z < 10 ? wall : band);
  }
  m.cylinder(26, 6, 2.6, 56, 57, "trim");
  // tanks and pipes
  m.cylinder(26, 17, 3.6, 1, 11, "tank");
  m.cylinder(26, 17, 3.2, 11, 12, "steel");
  m.cylinder(26, 26, 3.6, 1, 11, "tank");
  m.cylinder(26, 26, 3.2, 11, 12, "steel");
  m.box(22, 16, 8, 23, 27, 9, "darksteel");
  m.box(22, 16, 8, 26, 17, 9, "darksteel");
  m.box(22, 26, 8, 26, 27, 9, "darksteel");
  m.box(4, 2, 1, 16, 6, 2, "wood");
  m.box(5, 3, 2, 9, 5, 4, "rust");
  m.box(11, 3, 2, 15, 5, 4, "blue");
  addTruck(m, 18, 22, 1, "y", "yellow");
  return m;
}

// ---------------------------------------------------------------- civic

// 2×2 · a fire station: three red engine doors, a hose-drying tower, a flag
// and an engine out on the apron.
export function fireStation(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 42, "fire-station");
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(0, 0, 0, W, 6, 1, "lawn");
  m.box(3, 6, 1, 26, 22, 8, "firebrick");
  m.box(3, 6, 1, 26, 22, 2, "limestone");
  for (const x of [5, 12, 19]) {
    m.clear(x, 21, 2, x + 5, 22, 7);
    m.box(x, 20, 2, x + 5, 21, 7, "doorred");
    for (let z = 3; z < 7; z += 2) m.box(x, 20, z, x + 5, 21, z + 1, "glassdark");
  }
  m.box(3, 21, 7, 26, 22, 8, "limestone");
  m.windows(3, 6, 26, 22, 8, 12, { floor: 4, offset: 1, height: 2, period: 3, width: 2, faces: ["s", "w", "n"] });
  m.box(3, 6, 8, 26, 22, 12, "firebrick");
  m.windows(3, 6, 26, 22, 8, 12, { floor: 4, offset: 1, height: 2, period: 3, width: 2 });
  m.box(2, 5, 12, 27, 23, 13, "white");
  m.flatRoof(3, 6, 26, 22, 13, "firebrick", "gravel");
  // hose tower
  m.box(26, 8, 1, 31, 13, 30, "firebrick");
  m.windows(26, 8, 31, 13, 4, 30, { floor: 5, offset: 1, height: 3, period: 5, width: 1, margin: 2 });
  m.hip(26, 8, 31, 13, 30, "roofslate", 1);
  // name band and flag
  m.box(8, 22, 9, 22, 23, 11, "white");
  m.box(9, 22, 9, 21, 23, 10, "red");
  m.box(1, 2, 1, 2, 3, 20, "steel");
  m.box(2, 2, 17, 6, 3, 20, "red");
  m.box(2, 2, 18, 6, 3, 19, "white");
  // engine on the apron
  m.box(12, 24, 1, 17, 32, 2, "tyre");
  m.box(12, 24, 2, 17, 32, 5, "red");
  m.box(12, 30, 5, 17, 32, 6, "red");
  m.box(12, 30, 3, 17, 32, 5, "glassdark");
  m.box(13, 24, 5, 16, 29, 6, "steel");
  m.set(14, 31, 6, "yellow");
  addTree(m, 29, 2, 1, "round", 170 + variant, 0.8);
  return m;
}

export const BUILDINGS = [
  { id: "cottage", zone: "R", size: 1, make: cottage, label: "Cottage / 小屋" },
  { id: "duplex", zone: "R", size: 1, make: duplex, label: "Duplex / 双拼住宅" },
  { id: "walkup", zone: "R", size: 2, make: walkup, label: "Walk-up / 砖砌公寓" },
  { id: "residential-tower", zone: "R", size: 3, make: residentialTower, label: "Tower / 住宅塔楼" },
  { id: "corner-shop", zone: "C", size: 1, make: cornerShop, label: "Corner shop / 街角店" },
  { id: "cafe", zone: "C", size: 1, make: cafe, label: "Diner / 小餐馆" },
  { id: "office", zone: "C", size: 2, make: office, label: "Office / 写字楼" },
  { id: "skyscraper", zone: "C", size: 3, make: skyscraper, label: "Skyscraper / 玻璃塔楼" },
  { id: "workshop", zone: "I", size: 1, make: workshop, label: "Workshop / 锯齿厂房" },
  { id: "warehouse", zone: "I", size: 2, make: warehouse, label: "Warehouse / 仓库" },
  { id: "factory", zone: "I", size: 2, make: factory, label: "Factory / 工厂" },
  { id: "fire-station", zone: "S", size: 2, make: fireStation, label: "Fire station / 消防站" },
];
