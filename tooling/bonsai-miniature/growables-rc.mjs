// Growable designs — see buildings-growables.mjs for the family and variant
// conventions. Each entry: { id, zone, size, tier, label: "English / 中文", make(variant, rank) }.
// Contains the residential (r) and commercial (c) families: lot surface at z = 0,
// street front on +y, `variant` swaps colourways and furniture, `rank` raises the
// high-tier towers (boutiqueTower, officeTower) a floor band at a time.

import { Model, TILE_VOXELS as T, STOREY as S, mulberry32 } from "./voxel.mjs";
import { addTree, addCar } from "./buildings.mjs";

const pick = (list, variant) => list[((variant % list.length) + list.length) % list.length];

// ---------------------------------------------------------------- props

function addAc(m, x, y, z) {
  m.box(x, y, z, x + 2, y + 2, z + 2, "steel");
  m.set(x, y, z + 1, "darksteel");
}

function addUmbrella(m, x, y, z, color) {
  m.set(x, y, z, "white");
  m.box(x, y, z + 1, x + 1, y + 1, z + 4, "white");
  m.box(x - 1, y - 1, z + 4, x + 2, y + 2, z + 5, color);
  m.set(x, y, z + 5, color);
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

// A sloped striped canvas awning over a shopfront on a +y face.
function stripedAwning(m, x0, x1, y, z, a, b = "white") {
  for (let x = x0; x < x1; x += 1) {
    const c = (x - x0) % 2 === 0 ? a : b;
    m.set(x, y, z + 1, c);
    m.set(x, y + 1, z, c);
    m.set(x, y + 2, z - 1, c);
  }
}

function addBins(m, x, y, z) {
  m.box(x, y, z, x + 2, y + 2, z + 3, "steel");
  m.box(x, y, z + 3, x + 2, y + 2, z + 4, "darksteel");
}

function addCorral(m, x, y, z) {
  for (const [dx, dy] of [[0, 0], [4, 0], [0, 2], [4, 2]]) m.box(x + dx, y + dy, z, x + dx + 1, y + dy + 1, z + 3, "steel");
  m.box(x, y, z + 2, x + 5, y + 1, z + 3, "steel");
  m.box(x, y + 2, z + 2, x + 5, y + 3, z + 3, "steel");
}

// Punch a repeating band of glass into an existing vertical wall row. Used for
// courtyard facades and shop bands where windows() cannot reach.
function glazedBand(m, axis, fixed, from, to, z0, z1, glass = "window", opts = {}) {
  const { period = 3, width = 2, floor = S, offset = 1 } = opts;
  for (let z = z0; z < z1; z += 1) {
    const k = (z - z0) % floor;
    if (k < offset || k >= offset + 2) continue;
    for (let p = from; p < to; p += 1) {
      if ((p - from) % period >= width) continue;
      const x = axis === "y" ? fixed : p;
      const y = axis === "y" ? p : fixed;
      if (m.get(x, y, z)) m.set(x, y, z, glass);
    }
  }
  return m;
}

// ---------------------------------------------------------------- residential

// 1×1 · low tier · a single-storey wooden bungalow. A plank box under a shallow
// gable, a covered porch on the +y front, a fenced vegetable patch in soil rows,
// a laundry line strung between two poles and one tired old car in the drive.
export function bungalow(variant = 0) {
  const m = new Model(T, T, 24, "bungalow");
  const wall = pick(["wood", "butter", "sky"], variant);
  const roof = pick(["corrugated", "roofbrown", "roofgreen", "corrugated"], variant + 1);
  const oldCar = pick(["cargreen", "carred", "carwhite", "carblue"], variant + 3);
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(10, 11, 0, T, T, 1, "gravel");
  m.box(6, 14, 0, 9, T, 1, "paving");
  // vegetable patch: soil beds with a leaf row running between them
  m.box(1, 1, 0, 8, 9, 1, "soil");
  for (const y of [2, 4, 6, 8]) m.box(1, y, 0, 8, y + 1, 1, "leaflight");
  // laundry line between two poles along the west side of the house
  m.box(1, 9, 1, 2, 10, 8, "lamppole");
  m.box(1, 12, 1, 2, 13, 8, "lamppole");
  for (let y = 10; y < 12; y += 1) m.set(1, y, 7, pick(["white", "red", "blue"], variant + y));
  // house
  m.box(2, 2, 1, 14, 11, 7, wall);
  m.box(2, 2, 1, 14, 11, 2, "white");
  m.windows(2, 2, 14, 11, 2, 7, { floor: 6, offset: 1, height: 2, period: 5, width: 2 });
  m.clear(5, 10, 2, 7, 11, 6);
  m.box(5, 9, 2, 7, 10, 6, "door");
  m.box(9, 9, 2, 12, 10, 6, "glassdark");
  // porch on the +y front
  m.box(4, 11, 1, 12, 14, 2, "wood");
  m.box(4, 13, 2, 5, 14, 6, "wood");
  m.box(11, 13, 2, 12, 14, 6, "wood");
  m.set(5, 12, 6, "lamp");
  // shallow corrugated gable
  m.gable(1, 1, 15, 12, 7, "x", roof, wall, 1);
  m.box(10, 4, 7, 12, 6, 14, "brick");
  m.box(10, 4, 14, 12, 6, 15, "trim");
  // hedges, flowers and the drive
  m.box(9, 15, 1, T, T, 3, "hedge");
  m.box(2, 13, 1, 5, 14, 2, variant % 2 ? "flowerred" : "floweryellow");
  addCar(m, 11, 12, 1, "x", oldCar);
  addTree(m, 13.5, 2.5, 1, variant % 3 === 1 ? "cherry" : "round", 300 + variant, 0.75);
  return m;
}

// 1×1 · mid tier · a pair of narrow three-storey brick terraces sharing a party
// wall: split colours, protruding glass bay windows, stoops with steps, a deep
// white cornice, chimney pots and short front railings along the pavement.
export function townhouse(variant = 0) {
  const m = new Model(T, T, 26, "townhouse");
  const left = pick(["brick", "salmon", "butter", "mint"], variant);
  const right = pick(["sky", "cream", "darkbrick", "salmon"], variant + 2);
  const zTop = 1 + 3 * S;
  m.box(0, 0, 0, T, T, 1, "sidewalk");
  m.box(0, 0, 0, T, 4, 1, "lawn");
  m.box(1, 4, 1, 8, 12, zTop, left);
  m.box(8, 4, 1, 15, 12, zTop, right);
  m.box(1, 4, 1, 15, 12, 2, "limestone");
  m.windows(1, 4, 8, 12, 2, zTop, { floor: S, offset: 1, height: 2, period: 3, width: 1, margin: 1, faces: ["s", "n", "w"] });
  m.windows(8, 4, 15, 12, 2, zTop, { floor: S, offset: 1, height: 2, period: 3, width: 1, margin: 1, faces: ["s", "n", "e"] });
  // protruding bay windows on the +y front
  m.box(3, 12, 3, 6, 14, 9, left);
  m.box(3, 13, 4, 6, 14, 8, "glass");
  m.box(3, 12, 9, 6, 14, 10, "white");
  m.box(10, 12, 3, 13, 14, 9, right);
  m.box(10, 13, 4, 13, 14, 8, "glass");
  m.box(10, 12, 9, 13, 14, 10, "white");
  // doors and stoops
  m.box(3, 11, 1, 5, 12, 5, "doorgreen");
  m.box(10, 11, 1, 12, 12, 5, "doorred");
  for (const dx of [3, 10]) {
    m.box(dx, 12, 1, dx + 2, 14, 2, "limestone");
    m.box(dx, 14, 1, dx + 2, 15, 1, "limestone");
  }
  m.box(12, 12, 3, 14, 13, 4, variant % 2 ? "floweryellow" : "flowerred");
  // cornice, flat roof, chimneys
  m.box(0, 3, zTop, T, 13, zTop + 1, "white");
  m.flatRoof(1, 4, 15, 12, zTop + 1, "white", "roofslate");
  m.box(7, 6, zTop + 3, 9, 8, zTop + 6, "brick");
  m.box(7, 6, zTop + 6, 8, 7, zTop + 8, "roofred");
  m.box(8, 7, zTop + 6, 9, 8, zTop + 8, "roofred");
  // front railings with walkway gaps
  for (const x of [1, 3, 5, 7, 13]) {
    if (x >= 3 && x < 5) continue;
    m.box(x, 15, 1, x + 1, 16, 3, "trim");
  }
  for (let x = 1; x < 15; x += 1) if (x < 3 || x > 5) m.box(x, 15, 3, x + 1, 16, 4, "trim");
  return m;
}

// 1×1 · high tier · a modern two-storey flat-roof villa: white plaster volumes
// slid off each other, full-height glass on the garden faces, a roof terrace
// ringed with hedge planters, a small tiled pool and a mature garden.
export function villa(variant = 0) {
  const m = new Model(T, T, 28, "villa");
  const glass = pick(["glass", "glassdark"], variant);
  m.box(0, 0, 0, T, T, 1, "lawn");
  m.box(2, 10, 0, T, T, 1, "paving");
  m.box(6, 8, 0, 9, T, 1, "paving");
  m.box(9, 1, 0, T, 6, 1, "paving");
  m.box(10, 2, 0, 15, 5, 1, "poolwater");
  m.box(9, 1, 0, 10, 6, 1, "white");
  m.box(9, 5, 0, T, 6, 1, "white");
  // main volume: two storeys, glazed on the garden side
  m.box(1, 3, 1, 9, 12, 7, "plaster");
  m.paint(2, 11, 2, 9, 12, 6, glass);
  m.paint(8, 3, 2, 9, 12, 6, glass);
  m.box(1, 3, 7, 9, 12, 8, "white");
  m.box(1, 3, 8, 2, 12, 10, "hedge");
  m.box(8, 3, 8, 9, 12, 10, "hedge");
  m.box(3, 4, 8, 6, 7, 10, "hedge");
  // offset single-storey wing with its own roof terrace
  m.box(8, 6, 1, 14, 14, 4, "plaster");
  m.paint(8, 13, 2, 14, 14, 4, glass);
  m.box(8, 5, 4, 15, 15, 5, "white");
  m.box(8, 7, 5, 14, 13, 6, "paving");
  m.box(7, 6, 5, 8, 14, 7, "hedge");
  // entrance
  m.box(4, 11, 1, 7, 12, 4, "glassdark");
  m.box(3, 12, 5, 8, 14, 6, "white");
  m.box(3, 13, 1, 4, 14, 5, "white");
  m.box(7, 13, 1, 8, 14, 5, "white");
  // garden
  addTree(m, 12.5, 13.5, 1, variant % 2 ? "cherry" : "round", 400 + variant, 0.9);
  addTree(m, 2.5, 14, 1, "conifer", 410 + variant, 0.8);
  m.box(0, 12, 1, 2, 16, 2, "water");
  addCar(m, 9, 14, 1, "x", pick(["carwhite", "caryellow", "carblue"], variant + 1));
  return m;
}

// 2×2 · low tier · a plain three-storey tenement in dark brick, weathered with
// random stained panels, laundry strung across the front, a rubbish courtyard
// with steel bins behind, one scrubby tree and a broken back fence.
export function tenement(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 30, "tenement");
  const wall = pick(["darkbrick", "concrete", "brick", "darkconcrete"], variant);
  const rng = mulberry32(500 + variant);
  m.box(0, 0, 0, W, W, 1, "sidewalk");
  m.box(0, 0, 0, W, 12, 1, "concrete");
  m.box(6, 0, 0, 12, 12, 1, "gravel");
  // block
  m.box(3, 12, 1, 29, 30, 1 + 3 * S, wall);
  m.box(3, 12, 1, 29, 30, 2, "darkconcrete");
  m.windows(3, 12, 29, 30, 2, 1 + 3 * S, { floor: S, offset: 1, height: 2, period: 3, width: 2 });
  for (let i = 0; i < 34; i += 1) {
    const sx = 3 + Math.floor(rng() * 26);
    const sz = 2 + Math.floor(rng() * 8);
    m.set(sx, 29, sz, "darkconcrete");
    m.set(3, 12 + Math.floor(rng() * 16), sz, "darkconcrete");
  }
  // entry and front laundry lines
  m.clear(14, 29, 1, 18, 30, 6);
  m.box(14, 28, 1, 18, 29, 6, "doorgreen");
  m.box(2, 30, 1, 3, 31, 8, "lamppole");
  m.box(28, 30, 1, 29, 31, 8, "lamppole");
  for (let x = 3; x < 29; x += 1) m.set(x, 30, 7, pick(["white", "red", "blue", "white"], variant + x));
  for (let x = 5; x < 27; x += 1) m.set(x, 31, 5, pick(["white", "blue", "red"], variant + x + 1));
  // roof clutter
  m.flatRoof(3, 12, 29, 30, 1 + 3 * S, "darkconcrete", "gravel");
  m.box(6, 15, 11, 11, 20, 15, "darkbrick");
  m.box(5, 14, 15, 12, 21, 16, "darkconcrete");
  addAc(m, 20, 16, 11);
  addAc(m, 24, 22, 11);
  // courtyard: bins, scrubby tree, broken fence
  addBins(m, 2, 3, 1);
  addBins(m, 27, 3, 1);
  addBins(m, 2, 8, 1);
  addBins(m, 26, 8, 1);
  addTree(m, 20, 5, 1, "round", 520 + variant, 0.55);
  for (let x = 1; x < 30; x += 1) {
    if (rng() < 0.22) continue;
    m.box(x, 1, 1, x + 1, 2, 3, "wood");
    if (x % 4 === 0) m.box(x, 1, 3, x + 1, 2, 4, "wood");
  }
  for (let y = 2; y < 11; y += 1) if (rng() > 0.35) m.box(1, y, 1, 2, y + 1, 3, "wood");
  return m;
}

// 2×2 · low tier · four narrow two-storey terraces in a row along the +y front,
// each in its own wall and roof colour, with individual gables, front steps and
// gardens behind holding battered little sheds.
export function rowHouses(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 30, "row-houses");
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(0, 25, 0, W, W, 1, "sidewalk");
  for (let i = 0; i < 4; i += 1) {
    const x0 = i * 8;
    const x1 = x0 + 8;
    const wall = pick(["brick", "butter", "sky", "salmon"], variant + i);
    const roof = pick(["roofred", "roofslate", "roofbrown", "roofgreen"], variant + i + 1);
    const door = pick(["door", "doorgreen", "doorred", "door"], variant + i + 2);
    m.box(x0, 14, 1, x1, 26, 7, wall);
    m.box(x0, 14, 1, x1, 26, 2, "white");
    m.windows(x0, 14, x1, 26, 1, 7, { floor: S, offset: 1, height: 2, period: 3, width: 1, margin: 1 });
    m.box(x0 + 3, 25, 1, x0 + 5, 26, 5, door);
    m.box(x0 + 3, 26, 1, x0 + 5, 28, 2, "limestone");
    m.box(x0 + 3, 28, 1, x0 + 5, 29, 1, "limestone");
    m.box(x0 + 3, 26, 0, x0 + 5, W, 1, "paving");
    m.gable(x0, 14, x1, 26, 7, "x", roof, wall, 1);
    m.box(x0 + 2, 19, 13, x0 + 4, 21, 16, "brick");
    m.box(x0 + 2, 19, 16, x0 + 3, 20, 17, "roofred");
    m.box(x0 + 3, 20, 16, x0 + 4, 21, 17, "roofred");
    // back garden with a shed
    const sw = 3 + (i % 2) * 2;
    const sy = 2 + (i % 3);
    m.box(x0 + 2, sy, 1, x0 + 2 + sw, sy + 4, 4, "wood");
    m.box(x0 + 1, sy - 1, 4, x0 + 3 + sw, sy + 5, 5, "corrugated");
    if (i % 2 === 0) addTree(m, x0 + 6, 11, 1, "round", 700 + i + variant, 0.55);
    m.box(x0 + 1, 8, 1, x0 + 4, 11, 2, i % 2 ? "leaflight" : "floweryellow");
  }
  for (const fx of [8, 16, 24]) m.box(fx, 0, 1, fx + 1, 14, 3, "trim");
  return m;
}

// 2×2 · mid tier · two three-storey blocks making an L around a shared lawn:
// pitched gable roofs, balconies looking onto the grass, a paved path between,
// a bike shed and enough trees to break the silhouette up.
export function gardenApartments(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 30, "garden-apartments");
  const wallA = pick(["brick", "cream", "salmon", "mint"], variant);
  const wallB = pick(["sky", "butter", "limestone", "plaster"], variant + 1);
  const roof = pick(["roofred", "roofslate", "roofgreen", "roofbrown"], variant + 2);
  const accent = pick(["awningblue", "awninggreen", "awningred", "signgreen"], variant + 3);
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(13, 0, 0, 17, W, 1, "paving");
  m.box(0, 26, 0, W, W, 1, "sidewalk");
  // back bar (runs along x) and west bar (runs along y) forming the L
  m.box(3, 3, 1, 29, 11, 10, wallA);
  m.box(3, 3, 1, 11, 20, 10, wallB);
  m.box(3, 3, 1, 29, 11, 2, "limestone");
  m.windows(3, 3, 29, 11, 2, 10, { floor: S, offset: 1, height: 2, period: 3, width: 2, faces: ["n", "s", "e"] });
  m.windows(3, 3, 11, 20, 2, 10, { floor: S, offset: 1, height: 2, period: 3, width: 2, faces: ["n", "w"] });
  m.gable(3, 3, 29, 11, 10, "x", roof, wallA, 1);
  m.gable(3, 3, 11, 20, 10, "y", roof, wallB, 1);
  // balconies facing the shared lawn
  for (const z of [4, 7]) {
    m.box(12, 10, z, 28, 12, z + 1, "white");
    m.box(12, 11, z + 1, 28, 12, z + 2, accent);
    m.box(12, 12, z, 14, 20, z + 1, "white");
    m.box(12, 12, z + 1, 14, 20, z + 2, accent);
  }
  // entrances
  m.box(15, 10, 1, 19, 11, 5, "glassdark");
  m.box(14, 11, 5, 20, 14, 6, "white");
  m.box(4, 19, 1, 7, 20, 5, "doorgreen");
  m.box(3, 20, 1, 8, 22, 6, "white");
  // bike shed and garden
  m.box(20, 14, 1, 26, 19, 4, "wood");
  m.box(19, 13, 4, 27, 20, 5, "corrugated");
  m.box(21, 15, 1, 25, 18, 1, "gravel");
  for (let x = 21; x < 25; x += 2) m.box(x, 16, 1, x + 1, 18, 2, "trim");
  addTree(m, 15, 22, 1, "round", 800 + variant, 0.8);
  addTree(m, 26, 22, 1, "cherry", 810 + variant, 0.75);
  addTree(m, 24, 12, 1, "round", 820 + variant, 0.7);
  m.box(3, 22, 1, 7, 25, 2, variant % 2 ? "flowerred" : "floweryellow");
  return m;
}

// 3×3 · low tier · a four-storey brick perimeter block closed around a court
// with trees and a playground, a gated arch onto the street, shops glazed along
// the +y ground floor and laundry lines somewhere in every window.
export function courtyardBlock(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 32, "courtyard-block");
  const wall = pick(["brick", "darkbrick", "salmon", "concrete"], variant);
  const sign = pick(["signgreen", "red", "blue", "awningred"], variant + 1);
  const rng = mulberry32(600 + variant);
  const zTop = 1 + 4 * S;
  m.box(0, 0, 0, W, W, 1, "concrete");
  m.box(13, 13, 0, 35, 35, 1, "lawn");
  m.box(23, 2, 0, 25, 46, 1, "paving");
  // four bars of the ring
  m.box(2, 2, 1, 46, 11, zTop, wall);
  m.box(2, 37, 1, 46, 46, zTop, wall);
  m.box(2, 11, 1, 11, 37, zTop, wall);
  m.box(37, 11, 1, 46, 37, zTop, wall);
  m.box(2, 2, 1, 46, 46, 2, "darkconcrete");
  m.windows(2, 2, 46, 46, 3, zTop, { floor: S, offset: 1, height: 2, period: 3, width: 2 });
  // courtyard facade glazing (inner faces of the ring)
  glazedBand(m, "x", 11, 12, 36, 3, zTop, "window");
  glazedBand(m, "x", 36, 12, 36, 3, zTop, "window");
  glazedBand(m, "y", 11, 12, 36, 3, zTop, "window");
  glazedBand(m, "y", 36, 12, 36, 3, zTop, "window");
  // weathered panels
  for (let i = 0; i < 30; i += 1) m.set(4 + Math.floor(rng() * 40), 45, 3 + Math.floor(rng() * 11), "darkconcrete");
  // shop band along the +y side
  m.box(3, 45, 1, 45, 46, 5, "glass");
  for (let x = 3; x < 45; x += 4) m.box(x, 45, 1, x + 1, 46, 6, "trim");
  m.box(3, 45, 5, 21, 46, 7, sign);
  m.box(27, 45, 5, 45, 46, 7, sign);
  m.box(5, 45, 5, 13, 46, 7, "white");
  m.box(29, 45, 5, 39, 46, 7, "white");
  // gate arch on the +y front
  m.clear(22, 37, 1, 26, 46, 7);
  m.box(21, 36, 1, 22, 46, zTop, wall);
  m.box(26, 36, 1, 27, 46, zTop, wall);
  m.box(21, 37, 7, 27, 46, 9, "white");
  m.box(22, 39, 1, 23, 40, 7, "darksteel");
  m.box(25, 39, 1, 26, 40, 7, "darksteel");
  // courtyard: trees, sandpit, swings
  addTree(m, 16, 16, 1, "round", 900 + variant, 0.8);
  addTree(m, 32, 32, 1, "cherry", 910 + variant, 0.8);
  addTree(m, 31, 17, 1, "round", 920 + variant, 0.7);
  m.box(16, 24, 0, 26, 33, 1, "sand");
  m.box(16, 20, 1, 17, 24, 6, "steel");
  m.box(24, 20, 1, 25, 24, 6, "steel");
  m.box(16, 22, 6, 25, 24, 7, "steel");
  m.box(18, 22, 1, 19, 24, 3, "darksteel");
  // roof decks with plant, tanks and vents
  m.flatRoof(2, 2, 46, 11, zTop, "darkconcrete", "gravel");
  m.flatRoof(2, 37, 46, 46, zTop, "darkconcrete", "gravel");
  m.flatRoof(2, 11, 11, 37, zTop, "darkconcrete", "gravel");
  m.flatRoof(37, 11, 46, 37, zTop, "darkconcrete", "gravel");
  addAc(m, 6, 5, zTop + 2);
  addAc(m, 34, 5, zTop + 2);
  addAc(m, 6, 40, zTop + 2);
  m.box(18, 40, zTop + 2, 22, 43, zTop + 6, "tank");
  m.box(18, 40, zTop + 6, 22, 43, zTop + 7, "darksteel");
  addTree(m, 8, 20, zTop + 2, "round", 930 + variant, 0.5);
  m.box(0, 46 - 2, 1, 2, 46, 3, "hedge");
  return m;
}

// 3×3 · mid tier · three parallel six-storey slabs set in a sea of lawn, paving
// paths and a short parking strip: balcony bands in accent colours, rooftop
// plant boxes and shared greenspace between every block.
export function terraceEstate(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 36, "terrace-estate");
  const walls = [
    pick(["brick", "concrete", "limestone", "salmon"], variant),
    pick(["cream", "darkbrick", "sky", "plaster"], variant + 1),
    pick(["brick", "limestone", "mint", "butter"], variant + 2),
  ];
  const accent = pick(["awningred", "awningblue", "awninggreen", "orange"], variant + 3);
  const floors = 6;
  const top = 1 + floors * S;
  m.box(0, 0, 0, W, W, 1, "lawn");
  m.box(2, 13, 0, 46, 15, 1, "paving");
  m.box(2, 25, 0, 46, 27, 1, "paving");
  m.box(0, 38, 0, W, W, 1, "parking");
  for (let x = 2; x < W; x += 5) m.box(x, 38, 0, x + 1, 48, 1, "linewhite");
  for (const [i, y0] of [[0, 4], [1, 16], [2, 28]]) {
    m.box(3, y0, 1, 45, y0 + 8, top, walls[i]);
    m.box(3, y0, 1, 45, y0 + 8, 2, "darkconcrete");
    m.windows(3, y0, 45, y0 + 8, 2, top, { floor: S, offset: 1, height: 2, period: 3, width: 2 });
    for (let z = 4; z < top; z += S) {
      m.box(5, y0 + 8, z, 43, y0 + 10, z + 1, "white");
      m.box(5, y0 + 9, z + 1, 43, y0 + 10, z + 2, accent);
      m.box(3, y0 - 2, z, 6, y0 - 1, z + 1, "white");
      m.box(42, y0 - 2, z, 45, y0 - 1, z + 1, "white");
    }
    m.box(2, y0 - 1, top, 46, y0 + 9, top + 1, "white");
    m.flatRoof(3, y0, 45, y0 + 8, top + 1, "white", "gravel");
    m.box(6, y0 + 2, top + 2, 14, y0 + 6, top + 3, "hedge");
    m.box(20, y0 + 2, top + 2, 28, y0 + 6, top + 3, "hedge");
    addAc(m, 36, y0 + 3, top + 2);
    m.box(31, y0 + 2, top + 2, 34, y0 + 5, top + 4, "white");
  }
  for (const [x, y, k] of [[4, 14, "round"], [20, 14, "cherry"], [40, 14, "round"], [8, 26, "round"], [30, 26, "round"], [44, 26, "conifer"], [4, 34, "round"], [40, 34, "cherry"]]) {
    addTree(m, x, y, 1, k, 1000 + x + y + variant, 0.7);
  }
  for (const [x, y] of [[3, 40], [13, 40], [23, 40], [33, 40], [43, 40]]) {
    addCar(m, x, y, 1, "y", pick(["carwhite", "carred", "carblue", "cargreen"], variant + x));
  }
  return m;
}

// ---------------------------------------------------------------- commercial

// 1×1 · high tier · a narrow boutique hotel: two storeys of stone with a canopy
// and a striped doorman awning, an unbroken glass shaft with vertical fins that
// grows (5 + rank) floors, a lit crown band and a flagpole on the roof.
export function boutiqueTower(variant = 0, rank = 0) {
  const m = new Model(T, T, 62, "boutique-tower");
  const floors = 5 + rank;
  const stone = pick(["limestone", "cream", "plaster"], variant);
  const glass = pick(["glass", "glassdark"], variant + 1);
  const shaftTop = 7 + floors * S;
  m.box(0, 0, 0, T, T, 1, "sidewalk");
  m.box(5, 0, 0, 11, T, 1, "paving");
  m.box(0, 4, 1, 2, 12, 3, "hedge");
  m.box(14, 4, 1, T, 12, 3, "hedge");
  // stone base
  m.box(2, 3, 1, 14, 13, 7, stone);
  m.paint(2, 12, 1, 14, 13, 5, glass);
  m.paint(2, 3, 1, 3, 13, 5, glass);
  m.windows(2, 3, 14, 13, 4, 7, { floor: S, offset: 1, height: 2, period: 3, width: 2 });
  m.box(1, 2, 6, 15, 14, 7, "white");
  // entrance canopy and doorman awning
  m.box(2, 13, 5, 14, 16, 6, "trim");
  m.box(3, 15, 1, 4, 16, 5, "trim");
  m.box(12, 15, 1, 13, 16, 5, "trim");
  m.box(6, 13, 7, 10, 15, 8, pick(["awningred", "awningblue", "awninggreen"], variant + 2));
  m.box(6, 12, 1, 10, 13, 5, "glassdark");
  m.set(7, 12, 5, "windowlit");
  m.set(9, 12, 5, "windowlit");
  // glass shaft with vertical fins
  m.box(3, 5, 7, 13, 11, shaftTop, glass);
  for (let x = 3; x < 13; x += 2) {
    m.box(x, 10, 7, x + 1, 11, shaftTop, "mullion");
    m.box(x, 5, 7, x + 1, 6, shaftTop, "mullion");
  }
  for (let y = 5; y < 11; y += 2) {
    m.box(3, y, 7, 4, y + 1, shaftTop, "mullion");
    m.box(12, y, 7, 13, y + 1, shaftTop, "mullion");
  }
  for (let z = 7 + S; z < shaftTop; z += S) m.paint(3, 5, z, 13, 11, z + 1, "mullion");
  // lit crown and flagpole
  m.box(3, 5, shaftTop, 13, 11, shaftTop + 2, "windowlit");
  m.box(2, 4, shaftTop + 2, 14, 12, shaftTop + 3, "mullion");
  m.box(7, 7, shaftTop + 3, 9, 9, shaftTop + 8, "steel");
  m.box(9, 7, shaftTop + 5, 11, 9, shaftTop + 7, pick(["red", "blue", "signgreen"], variant + 3));
  return m;
}

// 2×2 · low tier · a two-storey L-shaped motel around an open walkway with a
// railing and a row of room doors, a small pool deck, a lined parking lot with
// cars and a tall pylon sign planted at the +y roadside edge.
export function motel(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 30, "motel");
  const wall = pick(["cream", "mint", "salmon", "butter"], variant);
  const roof = pick(["roofbrown", "roofred", "roofslate", "roofgreen"], variant + 1);
  const panel = pick(["red", "blue", "orange", "signgreen"], variant + 2);
  m.box(0, 0, 0, W, W, 1, "parking");
  m.box(0, 0, 0, W, 10, 1, "lawn");
  m.box(2, 3, 0, 12, 9, 1, "paving");
  m.box(3, 4, 0, 11, 8, 1, "poolwater");
  m.box(2, 3, 0, 12, 4, 1, "white");
  m.box(2, 8, 0, 12, 9, 1, "white");
  addUmbrella(m, 4, 10, 1, pick(["awningred", "awningblue"], variant));
  addUmbrella(m, 10, 10, 1, pick(["caryellow", "awninggreen"], variant));
  // L: wing A along the back, wing B turning toward the street
  m.box(2, 10, 1, 30, 17, 7, wall);
  m.box(2, 10, 1, 9, 24, 7, wall);
  m.box(2, 10, 1, 30, 17, 2, "white");
  m.windows(2, 10, 30, 17, 4, 7, { floor: S, offset: 1, height: 2, period: 4, width: 2, faces: ["s", "e"] });
  m.windows(2, 10, 9, 24, 4, 7, { floor: S, offset: 1, height: 2, period: 4, width: 2, faces: ["w", "s"] });
  m.paint(10, 16, 1, 30, 17, 5, "glass");
  m.paint(2, 10, 1, 3, 24, 5, "glass");
  // open walkway on the upper floor of the +y front
  m.box(3, 17, 4, 30, 19, 5, "concrete");
  m.box(3, 18, 5, 30, 19, 7, "white");
  for (let x = 3; x < 30; x += 2) m.box(x, 18, 7, x + 1, 19, 8, "white");
  for (const x of [6, 12, 18, 24]) {
    m.clear(x, 16, 5, x + 2, 17, 7);
    m.box(x, 15, 5, x + 2, 16, 7, pick(["door", "doorgreen", "doorred"], variant + x));
    m.clear(x, 16, 1, x + 2, 17, 4);
    m.box(x, 15, 1, x + 2, 16, 3, "glassdark");
  }
  // flat roofs with vents
  m.flatRoof(2, 10, 30, 17, 7, wall, "gravel");
  m.flatRoof(2, 10, 9, 24, 7, wall, "gravel");
  m.box(12, 12, 9, 17, 15, 10, "white");
  addAc(m, 22, 12, 9);
  m.box(4, 11, 9, 7, 14, 14, "brick");
  m.box(4, 11, 14, 7, 14, 15, "trim");
  // room awnings over the ground-floor windows
  for (const x of [6, 12, 18, 24]) m.box(x, 17, 4, x + 2, 18, 5, pick([roof, "roofbrown"], variant + x));
  // parking with lines and cars
  m.box(3, 20, 0, 31, 20, 1, "linewhite");
  for (let x = 4; x < 30; x += 8) m.box(x, 20, 0, x + 1, 32, 1, "linewhite");
  m.box(14, 24, 0, 28, 32, 1, "asphaltpatch");
  for (const [x, y] of [[5, 22], [13, 22], [21, 22]]) {
    addCar(m, x, y, 1, "y", pick(["carred", "carwhite", "carblue", "cargreen"], variant + x));
  }
  // tall roadside pylon sign
  m.box(26, 29, 1, 27, 30, 13, "lamppole");
  m.box(23, 29, 13, 30, 30, 20, panel);
  m.box(24, 29, 14, 29, 30, 19, "yellow");
  m.box(25, 29, 15, 28, 30, 18, "white");
  return m;
}

// 2×2 · low tier · a single-storey strip of four shops along the back, each with
// its own awning and sign band over a mullioned storefront, a gravel roof of AC
// units, and a lined parking apron with cars and a pylon sign on the street.
export function stripMall(variant = 0) {
  const W = 2 * T;
  const m = new Model(W, W, 30, "strip-mall");
  const wall = pick(["concrete", "plaster", "cream", "limestone"], variant);
  const band = pick(["darkconcrete", "rust", "roofdark", "trim"], variant + 1);
  const awnings = ["awningred", "awninggreen", "awningblue", "orange"];
  const signs = ["red", "signgreen", "blue", "yellow"];
  m.box(0, 0, 0, W, W, 1, "parking");
  m.box(0, 22, 0, W, 26, 1, "sidewalk");
  m.box(0, 0, 0, W, 3, 1, "gravel");
  // shop block
  m.box(2, 3, 1, 30, 22, 7, wall);
  m.box(2, 3, 1, 30, 22, 2, band);
  m.box(3, 21, 1, 29, 22, 5, "glass");
  for (let x = 3; x < 30; x += 4) m.box(x, 21, 1, x + 1, 22, 6, "darksteel");
  for (let i = 0; i < 4; i += 1) {
    const x0 = 2 + i * 7;
    const x1 = x0 + 7;
    m.box(x0, 21, 5, x1, 22, 7, pick(signs, variant + i));
    m.box(x0 + 1, 21, 6, x1 - 1, 22, 7, "white");
    m.clear(x0 + 3, 21, 1, x0 + 4, 22, 5);
    m.box(x0 + 3, 20, 1, x0 + 4, 21, 5, i % 2 ? "door" : "glassdark");
    stripedAwning(m, x0 + 1, x1 - 1, 22, 7, pick(awnings, variant + i));
  }
  m.flatRoof(2, 3, 30, 22, 7, band, "gravel");
  addAc(m, 5, 6, 8);
  addAc(m, 13, 6, 8);
  addAc(m, 22, 6, 8);
  m.box(26, 14, 8, 29, 18, 10, "white");
  m.box(26, 14, 10, 29, 18, 11, "darksteel");
  addAc(m, 8, 16, 8);
  // parking apron with car lines, cars and corrals
  for (let x = 3; x < W - 2; x += 6) m.box(x, 26, 0, x + 1, 32, 1, "linewhite");
  m.box(0, 30, 0, W, 32, 1, "lineyellow");
  for (const [x, y] of [[4, 25], [10, 25], [16, 25], [22, 25], [28, 25]]) {
    addCar(m, x, y, 1, "y", pick(["carwhite", "carred", "carblue", "cargreen", "caryellow"], variant + x + 1));
  }
  addCar(m, 26, 1, 1, "x", pick(["carred", "carblue"], variant + 2));
  addCorral(m, 17, 27, 1);
  // pylon sign at the roadside
  m.box(3, 29, 1, 4, 30, 15, "lamppole");
  m.box(0, 29, 15, 7, 30, 21, pick(["blue", "red", "signgreen"], variant + 3));
  m.box(1, 29, 16, 6, 30, 20, "white");
  addTree(m, 1.5, 20.5, 1, "round", 1100 + variant, 0.6);
  addTree(m, 30.5, 20.5, 1, "round", 1110 + variant, 0.6);
  return m;
}

// 2×2 · high tier · a glass office tower on a three-storey stone base: a shaft of
// (10 + rank×3) floors banded at every mullion line, a two-storey setback with a
// windowlit crown, an antenna and a plaza of concrete planters and trees.
export function officeTower(variant = 0, rank = 0) {
  const W = 2 * T;
  const floors = 10 + rank * 3;
  const stone = pick(["limestone", "concrete", "cream"], variant);
  const glass = pick(["glass", "glassdark"], variant + 1);
  const shaftTop = 10 + floors * S;
  const m = new Model(W, W, 134, "office-tower");
  m.box(0, 0, 0, W, W, 1, "paving");
  m.box(0, 0, 0, 3, W, 1, "lawn");
  m.box(3, 0, 0, 8, 26, 1, "paving");
  // podium: three storeys of stone over glazed ground floor
  m.box(4, 6, 1, 28, 28, 10, stone);
  m.box(4, 6, 1, 28, 28, 2, "darkconcrete");
  m.paint(4, 27, 2, 28, 28, 6, "glass");
  m.paint(4, 6, 2, 5, 28, 6, "glass");
  m.windows(4, 6, 28, 28, 4, 10, { floor: S, offset: 1, height: 2, period: 3, width: 2, faces: ["n", "e", "w"] });
  m.box(3, 5, 10, 29, 29, 11, "white");
  // shaft
  m.box(7, 9, 10, 25, 25, shaftTop, glass);
  for (let z = 10 + S; z < shaftTop; z += S) m.paint(7, 9, z, 25, 25, z + 1, "mullion");
  for (let x = 7; x < 25; x += 3) {
    m.box(x, 24, 10, x + 1, 25, shaftTop, "mullion");
    m.box(x, 9, 10, x + 1, 10, shaftTop, "mullion");
  }
  for (let y = 9; y < 25; y += 3) {
    m.box(7, y, 10, 8, y + 1, shaftTop, "mullion");
    m.box(24, y, 10, 25, y + 1, shaftTop, "mullion");
  }
  // two-storey setback and lit crown
  m.box(9, 11, shaftTop, 23, 23, shaftTop + 6, glass);
  m.box(8, 10, shaftTop, 24, 24, shaftTop + 1, "white");
  for (let z = shaftTop + S; z < shaftTop + 6; z += S) m.paint(9, 11, z, 23, 23, z + 1, "mullion");
  m.box(8, 10, shaftTop + 6, 24, 24, shaftTop + 7, "white");
  m.box(10, 12, shaftTop + 7, 22, 22, shaftTop + 9, "windowlit");
  m.box(9, 11, shaftTop + 9, 23, 23, shaftTop + 10, "darksteel");
  m.box(15, 17, shaftTop + 10, 17, 19, shaftTop + 19, "steel");
  m.set(15, 17, shaftTop + 19, "red");
  // plaza planters, trees and entrance canopy
  for (const [x, y] of [[2, 26], [12, 30], [28, 26], [20, 30]]) {
    m.box(x - 1, y - 1, 1, x + 2, y + 2, 3, "concrete");
    addTree(m, x, y, 3, variant % 2 ? "round" : "cherry", 1200 + x + y + variant, 0.65);
  }
  m.box(8, 28, 5, 24, 31, 6, "white");
  m.box(9, 30, 1, 10, 31, 5, "steel");
  m.box(22, 30, 1, 23, 31, 5, "steel");
  m.box(13, 27, 2, 19, 28, 5, "glassdark");
  m.box(12, 28, 11, 20, 29, 13, pick(["blue", "signgreen", "red"], variant + 2));
  addCar(m, 2, 12, 1, "y", pick(["carwhite", "carblue", "carred"], variant + 1));
  addCar(m, 2, 20, 1, "y", pick(["caryellow", "cargreen", "carwhite"], variant + 2));
  return m;
}

// 3×3 · low tier · a big single-storey supermarket box on the back half of the
// lot: a long sign band and glass entrance on the +y face, a gravel roof of
// units, a lined car park with cart corrals, and a side loading dock with a
// truck backed into it.
export function supermarket(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 30, "supermarket");
  const wall = pick(["concrete", "plaster", "cream", "limestone"], variant);
  const sign = pick(["signgreen", "red", "blue", "orange"], variant + 1);
  const band = pick(["darkconcrete", "trim", "rust", "roofdark"], variant + 2);
  m.box(0, 0, 0, W, W, 1, "parking");
  m.box(4, 22, 0, 40, 26, 1, "sidewalk");
  m.box(0, 0, 0, W, 4, 1, "gravel");
  m.box(40, 4, 0, W, 22, 1, "concrete");
  // the box
  m.box(4, 4, 1, 40, 22, 9, wall);
  m.box(4, 4, 1, 40, 22, 2, band);
  m.box(5, 21, 1, 39, 22, 6, "glass");
  for (let x = 5; x < 40; x += 4) m.box(x, 21, 1, x + 1, 22, 7, "darksteel");
  m.box(5, 21, 6, 39, 22, 9, sign);
  m.box(8, 21, 6, 16, 22, 9, "white");
  m.box(26, 21, 6, 36, 22, 9, "white");
  // glazed entrance and trolley bay
  m.clear(19, 21, 1, 25, 22, 7);
  m.box(19, 20, 1, 25, 21, 7, "glassdark");
  m.box(21, 20, 1, 23, 21, 6, "white");
  m.box(18, 21, 5, 26, 24, 6, "white");
  m.box(7, 23, 1, 13, 25, 2, "steel");
  for (let x = 7; x < 13; x += 3) m.box(x, 23, 2, x + 2, 25, 3, "steel");
  // flat roof plant
  m.flatRoof(4, 4, 40, 22, 9, band, "gravel");
  addAc(m, 8, 8, 10);
  addAc(m, 16, 8, 10);
  addAc(m, 28, 8, 10);
  addAc(m, 34, 16, 10);
  m.box(20, 12, 10, 27, 18, 13, "white");
  m.box(20, 12, 13, 27, 18, 14, "darksteel");
  for (let y = 14; y < 18; y += 2) m.box(30, y, 10, 32, y + 1, 13, "tank");
  // loading dock on the east side
  m.box(40, 6, 1, 44, 20, 4, "darkconcrete");
  m.box(39, 8, 1, 40, 18, 6, "rolldoor");
  m.box(39, 6, 6, 40, 20, 7, "steel");
  addTruck(m, 43, 6, 1, "y", pick(["blue", "orange", "red"], variant + 3));
  // car park: lines, cars, corrals, lamps
  for (let x = 3; x < W - 2; x += 6) m.box(x, 26, 0, x + 1, 44, 1, "linewhite");
  m.box(0, 44, 0, W, 46, 1, "lineyellow");
  const carCols = ["carwhite", "carred", "carblue", "cargreen", "caryellow", "carwhite"];
  for (let i = 0; i < 6; i += 1) addCar(m, 4 + i * 7, 27, 1, "y", pick(carCols, variant + i));
  for (let i = 0; i < 3; i += 1) addCar(m, 6 + i * 12, 37, 1, "y", pick(carCols, variant + i + 3));
  addCorral(m, 20, 33, 1);
  addCorral(m, 33, 33, 1);
  m.box(1, 33, 1, 2, 34, 9, "lamppole");
  m.set(1, 34, 8, "lamp");
  m.box(45, 33, 1, 46, 34, 9, "lamppole");
  m.set(45, 34, 8, "lamp");
  return m;
}

// 3×3 · mid tier · a fourteen-storey slab hotel standing on a two-storey glazed
// podium: a pool deck with umbrellas on the podium roof, a porte-cochère canopy
// over the entrance with two yellow taxis beneath it and a sign on the slab top.
export function hotel(variant = 0) {
  const W = 3 * T;
  const m = new Model(W, W, 70, "hotel");
  const wall = pick(["limestone", "cream", "plaster", "concrete"], variant);
  const glass = pick(["glass", "glassdark"], variant + 1);
  const sign = pick(["red", "blue", "signgreen", "orange"], variant + 2);
  const floors = 14;
  const shaftTop = 7 + floors * S;
  m.box(0, 0, 0, W, W, 1, "paving");
  m.box(0, 0, 0, W, 6, 1, "lawn");
  m.box(36, 32, 0, W, W, 1, "sidewalk");
  m.box(4, 30, 0, 44, W, 1, "asphaltpatch");
  // glazed podium, two storeys
  m.box(4, 6, 1, 44, 32, 7, glass);
  for (let x = 4; x < 44; x += 4) m.box(x, 31, 1, x + 1, 32, 7, "mullion");
  for (let y = 6; y < 32; y += 4) {
    m.box(4, y, 1, 5, y + 1, 7, "mullion");
    m.box(43, y, 1, 44, y + 1, 7, "mullion");
  }
  m.paint(4, 6, 4, 44, 32, 5, "mullion");
  m.box(3, 5, 6, 45, 33, 7, "white");
  // podium roof pool deck
  m.box(4, 6, 7, 44, 32, 8, "paving");
  m.box(9, 24, 8, 39, 32, 9, "white");
  m.box(10, 25, 8, 38, 31, 9, "poolwater");
  addUmbrella(m, 7, 27, 8, pick(["awningred", "awningblue"], variant));
  addUmbrella(m, 42, 27, 8, pick(["orange", "awninggreen"], variant));
  for (const x of [6, 12, 36, 42]) m.box(x, 23, 8, x + 3, 24, 9, "white");
  m.box(4, 6, 8, 5, 32, 11, "hedge");
  m.box(43, 6, 8, 44, 32, 11, "hedge");
  // the slab
  m.box(12, 8, 7, 36, 26, shaftTop, wall);
  m.windows(12, 8, 36, 26, 8, shaftTop, { floor: S, offset: 1, height: 2, period: 3, width: 2 });
  for (let z = 7; z < shaftTop; z += S) m.box(11, 7, z, 37, 27, z + 1, "white");
  m.box(11, 7, shaftTop, 37, 27, shaftTop + 1, "white");
  m.box(14, 10, 7, 34, 24, shaftTop + 1, wall);
  m.flatRoof(12, 8, 36, 26, shaftTop + 1, "white", "gravel");
  addAc(m, 15, 11, shaftTop + 2);
  addAc(m, 30, 20, shaftTop + 2);
  // rooftop sign on the slab
  m.box(16, 9, shaftTop + 2, 32, 11, shaftTop + 3, "darksteel");
  m.box(16, 9, shaftTop + 3, 32, 11, shaftTop + 9, sign);
  m.box(18, 9, shaftTop + 4, 30, 11, shaftTop + 8, "white");
  for (let x = 16; x < 32; x += 4) m.box(x, 9, shaftTop + 9, x + 1, 11, shaftTop + 10, "darksteel");
  // porte-cochère and doors on the +y face
  m.box(15, 32, 5, 33, 40, 6, "white");
  m.box(15, 39, 1, 16, 40, 5, "white");
  m.box(32, 39, 1, 33, 40, 5, "white");
  m.box(16, 32, 5, 32, 39, 5, "trim");
  m.set(18, 36, 4, "lamp");
  m.set(30, 36, 4, "lamp");
  m.clear(22, 31, 1, 27, 32, 6);
  m.box(22, 30, 1, 27, 31, 6, "glassdark");
  m.box(23, 30, 1, 24, 31, 6, "white");
  m.box(25, 30, 1, 26, 31, 6, "white");
  // two yellow taxis waiting under the canopy
  addCar(m, 18, 33, 1, "y", "caryellow");
  addCar(m, 28, 33, 1, "y", "caryellow");
  addCar(m, 10, 34, 1, "y", pick(["carwhite", "carred"], variant + 3));
  // forecourt planters
  for (const x of [5, 43]) {
    m.box(x - 1, 36, 1, x + 1, 40, 3, "concrete");
    addTree(m, x, 38, 3, "round", 1300 + x + variant, 0.6);
  }
  return m;
}

export const DESIGNS = [
  { id: "bungalow", zone: "r", size: 1, tier: "low", label: "Bungalow / 平房", make: bungalow },
  { id: "townhouse", zone: "r", size: 1, tier: "mid", label: "Townhouse pair / 联排住宅", make: townhouse },
  { id: "villa", zone: "r", size: 1, tier: "high", label: "Modern villa / 现代别墅", make: villa },
  { id: "tenement", zone: "r", size: 2, tier: "low", label: "Tenement block / 旧式公寓", make: tenement },
  { id: "rowHouses", zone: "r", size: 2, tier: "low", label: "Row houses / 排屋", make: rowHouses },
  { id: "gardenApartments", zone: "r", size: 2, tier: "mid", label: "Garden apartments / 花园公寓", make: gardenApartments },
  { id: "courtyardBlock", zone: "r", size: 3, tier: "low", label: "Courtyard block / 围合街区", make: courtyardBlock },
  { id: "terraceEstate", zone: "r", size: 3, tier: "mid", label: "Terrace estate / 板楼住宅区", make: terraceEstate },
  { id: "boutiqueTower", zone: "c", size: 1, tier: "high", label: "Boutique hotel tower / 精品酒店", make: boutiqueTower },
  { id: "motel", zone: "c", size: 2, tier: "low", label: "Motel / 汽车旅馆", make: motel },
  { id: "stripMall", zone: "c", size: 2, tier: "low", label: "Strip mall / 商业街", make: stripMall },
  { id: "officeTower", zone: "c", size: 2, tier: "high", label: "Office tower / 办公塔楼", make: officeTower },
  { id: "supermarket", zone: "c", size: 3, tier: "low", label: "Supermarket / 超市", make: supermarket },
  { id: "hotel", zone: "c", size: 3, tier: "mid", label: "Hotel slab / 酒店", make: hotel },
];
