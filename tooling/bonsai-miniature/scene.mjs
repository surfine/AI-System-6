// The sample district: 14 × 10 tiles with a wooded hill, a river bank, a
// downtown block, housing, an industrial block and a fire station. It lays the
// twelve buildings out the way the game would (every lot fronts a street) and
// returns one voxel world plus the terrain the two tiers draw differently.

import { Model, TILE_VOXELS as T, mulberry32 } from "./voxel.mjs";
import * as B from "./buildings.mjs";

export const TILES_X = 14;
export const TILES_Y = 10;
export const ALT_VOX = 6;
export const BASE_Z = 12;
export const WATER_LEVEL = -0.35;

export function cornerAlt(cx, cy) {
  if (cy >= 9) return -1;
  if (cx <= 3 && cy <= 2) return cx <= 1 && cy <= 1 ? 2 : 1;
  return 0;
}

export function surfaceZ(alt) {
  return BASE_Z + alt * ALT_VOX;
}

// Bilinear ground height (in voxels) at a voxel column, for trees on slopes.
export function groundZAt(vx, vy) {
  const tx = Math.min(TILES_X - 1, Math.floor(vx / T));
  const ty = Math.min(TILES_Y - 1, Math.floor(vy / T));
  const fx = (vx + 0.5) / T - tx;
  const fy = (vy + 0.5) / T - ty;
  const a = cornerAlt(tx, ty);
  const b = cornerAlt(tx + 1, ty);
  const c = cornerAlt(tx, ty + 1);
  const d = cornerAlt(tx + 1, ty + 1);
  const alt = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  return surfaceZ(alt);
}

const ROADS = new Set();
const addRoad = (x, y) => ROADS.add(`${x},${y}`);
for (let y = 0; y <= 7; y += 1) { addRoad(4, y); addRoad(9, y); }
for (let x = 0; x < TILES_X; x += 1) addRoad(x, 3);
for (let x = 4; x < TILES_X; x += 1) addRoad(x, 7);
export const isRoad = (x, y) => ROADS.has(`${x},${y}`);
export const isWater = (x, y) => y >= 8;

// [tileX, tileY, building id, quarter turns (0 faces +y), variant]
export const PLACEMENTS = [
  [5, 1, "office", 0, 0],
  [7, 1, "walkup", 0, 0],
  [5, 0, "corner-shop", 3, 0],
  [8, 0, "cafe", 1, 0],
  [10, 0, "skyscraper", 0, 0],
  [13, 2, "corner-shop", 0, 1],
  [5, 4, "residential-tower", 0, 0],
  [8, 4, "duplex", 1, 0],
  [8, 5, "duplex", 1, 1],
  [8, 6, "cottage", 0, 2],
  [10, 4, "factory", 2, 0],
  [12, 5, "warehouse", 0, 0],
  [12, 4, "workshop", 2, 0],
  [13, 4, "workshop", 2, 1],
  [10, 6, "workshop", 0, 2],
  [11, 6, "cafe", 0, 1],
  [0, 4, "cottage", 2, 0],
  [1, 4, "cottage", 2, 1],
  [2, 4, "fire-station", 2, 0],
  [3, 6, "duplex", 1, 2],
];

// Tiles that are parks / plazas / forest rather than lots or streets.
export function tileKind(x, y) {
  if (isWater(x, y)) return "water";
  if (isRoad(x, y)) return "road";
  if (x <= 3 && y <= 2) return "forest";
  if ((x === 6 || x === 7) && y === 0) return "plaza";
  if (x === 13 && y <= 1) return "plaza";
  if (y === 7 || (x <= 2 && y >= 5)) return "park";
  return "lot";
}

function roadTile(x, y, rng) {
  const m = new Model(T, T, 12, "road");
  const n = isRoad(x, y - 1), s = isRoad(x, y + 1), e = isRoad(x + 1, y), w = isRoad(x - 1, y);
  const links = [n, s, e, w].filter(Boolean).length;
  m.box(0, 0, 0, T, T, 1, "asphalt");
  const side = (x0, y0, x1, y1) => { m.box(x0, y0, 0, x1, y1, 2, "sidewalk"); };
  if (!n) side(0, 0, T, 3);
  if (!s) side(0, 13, T, T);
  if (!w) side(0, 0, 3, T);
  if (!e) side(13, 0, T, T);
  for (const [cx, cy] of [[0, 0], [13, 0], [0, 13], [13, 13]]) side(cx, cy, cx + 3, cy + 3);
  // curbs: a darker edge on the road side of every sidewalk run
  const straightNS = n && s && !e && !w;
  const straightEW = e && w && !n && !s;
  if (straightNS) for (let yy = 0; yy < T; yy += 4) m.box(7, yy, 0, 9, yy + 2, 1, "lineyellow");
  if (straightEW) for (let xx = 0; xx < T; xx += 4) m.box(xx, 7, 0, xx + 2, 9, 1, "lineyellow");
  if (links >= 3) {
    const zebra = (x0, y0, x1, y1, along) => {
      for (let i = along === "x" ? x0 : y0; i < (along === "x" ? x1 : y1); i += 2) {
        if (along === "x") m.box(i, y0, 0, i + 1, y1, 1, "linewhite");
        else m.box(x0, i, 0, x1, i + 1, 1, "linewhite");
      }
    };
    if (n) zebra(3, 0, 13, 2, "x");
    if (s) zebra(3, 14, 13, 16, "x");
    if (w) zebra(0, 3, 2, 13, "y");
    if (e) zebra(14, 3, 16, 13, "y");
  }
  if ((x + y) % 2 === 0) {
    if (straightNS) B.addLamp(m, 1, 8, 2, "e");
    if (straightEW) B.addLamp(m, 8, 1, 2, "s");
  }
  const colors = ["carred", "carblue", "carwhite", "caryellow", "cargreen"];
  if (straightNS && rng() < 0.55) B.addCar(m, rng() < 0.5 ? 4 : 9, 2 + Math.floor(rng() * 8), 1, "y", colors[Math.floor(rng() * colors.length)]);
  if (straightEW && rng() < 0.55) B.addCar(m, 2 + Math.floor(rng() * 8), rng() < 0.5 ? 4 : 9, 1, "x", colors[Math.floor(rng() * colors.length)]);
  return m;
}

function parkTile(x, y, rng) {
  const m = new Model(T, T, 24, "park");
  m.box(0, 0, 0, T, T, 1, "lawn");
  if (y === 7) {
    // riverside promenade: a paved walk, benches and lamps along the bank
    m.box(0, 9, 0, T, 13, 1, "paving");
    m.box(0, 13, 0, T, 14, 2, "curb");
    m.box(3, 12, 1, 7, 13, 2, "wood");
    m.box(10, 12, 1, 14, 13, 2, "wood");
    if (x % 2 === 0) B.addLamp(m, 8, 12, 1, "n");
    B.addTree(m, 4, 4, 1, x % 3 === 0 ? "cherry" : "round", 300 + x, 0.9);
    if (rng() < 0.6) B.addTree(m, 12, 3, 1, "round", 310 + x, 0.8);
    return m;
  }
  if (x === 0 && y === 5) {
    m.box(3, 3, 0, 13, 12, 1, "sand");
    m.box(4, 4, 0, 12, 11, 1, "poolwater");
    m.box(6, 6, 1, 9, 8, 2, "white");
    B.addTree(m, 1, 13, 1, "cherry", 330, 0.9);
    B.addTree(m, 13, 2, 1, "round", 331, 0.8);
    return m;
  }
  m.box(7, 0, 0, 9, T, 1, "paving");
  m.box(0, 7, 0, T, 9, 1, "paving");
  m.box(2, 2, 1, 5, 5, 2, rng() < 0.5 ? "flowerred" : "floweryellow");
  B.addTree(m, 12, 12, 1, rng() < 0.3 ? "cherry" : "round", 340 + x * 7 + y, 0.9);
  B.addTree(m, 3, 12, 1, "round", 350 + x * 7 + y, 0.8);
  m.box(10, 3, 1, 14, 4, 2, "wood");
  return m;
}

function plazaTile(x, y, rng) {
  const m = new Model(T, T, 24, "plaza");
  m.box(0, 0, 0, T, T, 1, "paving");
  m.box(2, 2, 0, 14, 14, 1, "lawn");
  m.box(6, 2, 0, 10, 14, 1, "paving");
  B.addTree(m, 3, 4, 1, "round", 400 + x * 5 + y, 0.8);
  B.addTree(m, 12, 11, 1, rng() < 0.5 ? "cherry" : "round", 410 + x * 5 + y, 0.8);
  m.box(7, 7, 1, 9, 9, 3, "limestone");
  return m;
}

export function buildWorld() {
  const W = TILES_X * T;
  const D = TILES_Y * T;
  const H = BASE_Z + 2 * ALT_VOX + 124;
  const world = new Model(W, D, H, "district");
  const rng = mulberry32(20260928);
  const byId = new Map(B.BUILDINGS.map((b) => [b.id, b]));
  const covered = new Set();
  for (const [tx, ty, id, q, variant] of PLACEMENTS) {
    const def = byId.get(id);
    const model = def.make(variant).rotated(q);
    world.stamp(model, tx * T, ty * T, surfaceZ(0));
    for (let dy = 0; dy < def.size; dy += 1) for (let dx = 0; dx < def.size; dx += 1) covered.add(`${tx + dx},${ty + dy}`);
  }
  for (let ty = 0; ty < TILES_Y; ty += 1) {
    for (let tx = 0; tx < TILES_X; tx += 1) {
      if (covered.has(`${tx},${ty}`)) continue;
      const kind = tileKind(tx, ty);
      const z = surfaceZ(0);
      if (kind === "road") world.stamp(roadTile(tx, ty, rng), tx * T, ty * T, z);
      else if (kind === "park") world.stamp(parkTile(tx, ty, rng), tx * T, ty * T, z);
      else if (kind === "plaza") world.stamp(plazaTile(tx, ty, rng), tx * T, ty * T, z);
      else if (kind === "forest") {
        const count = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i += 1) {
          const vx = tx * T + 2 + Math.floor(rng() * 12);
          const vy = ty * T + 2 + Math.floor(rng() * 12);
          const tree = new Model(12, 12, 24);
          B.addTree(tree, 5, 5, 0, rng() < 0.55 ? "conifer" : "round", 500 + tx * 31 + ty * 7 + i, 0.85 + rng() * 0.3);
          world.stamp(tree, vx - 5, vy - 5, Math.floor(groundZAt(vx, vy)));
        }
      }
    }
  }
  // a small ferry on the river
  const boat = new Model(14, 6, 8);
  boat.box(1, 0, 0, 13, 6, 2, "white");
  boat.box(0, 1, 0, 14, 5, 1, "red");
  boat.box(4, 1, 2, 10, 5, 4, "white");
  boat.box(4, 1, 3, 10, 5, 4, "glassdark");
  boat.box(5, 2, 4, 9, 4, 5, "blue");
  world.stamp(boat, 150, 140, surfaceZ(0) - 1);
  return world;
}

// Terrain handed to the renderers: corner altitudes in voxel heights, plus
// which tiles are water. Lots and streets are voxel slabs sitting on it.
export function terrainSpec() {
  const corners = [];
  for (let cy = 0; cy <= TILES_Y; cy += 1) {
    const row = [];
    for (let cx = 0; cx <= TILES_X; cx += 1) row.push(surfaceZ(cornerAlt(cx, cy)));
    corners.push(row);
  }
  const water = [];
  for (let ty = 0; ty < TILES_Y; ty += 1) {
    const row = [];
    for (let tx = 0; tx < TILES_X; tx += 1) row.push(isWater(tx, ty) ? 1 : 0);
    water.push(row);
  }
  // sc2k draws whole water tiles flat just under the bank, the way the
  // original fills a water tile; the miniature tier lets the smooth bank
  // cross a lower surface so the shoreline is natural.
  return { tilesX: TILES_X, tilesY: TILES_Y, tile: T, corners, water, waterZ: surfaceZ(WATER_LEVEL), waterZFlat: surfaceZ(0) - 0.6 };
}

// The specimen sheet: all twelve buildings in a row on bare lots.
export function buildSpecimens() {
  const gap = 6;
  const widths = B.BUILDINGS.map((b) => b.size * T);
  const W = widths.reduce((a, b) => a + b + gap, gap);
  const D = 3 * T + 2 * gap;
  const world = new Model(W, D, 124, "specimens");
  let x = gap;
  const labels = [];
  for (const def of B.BUILDINGS) {
    const model = def.make(0);
    const y = gap + (3 * T - def.size * T);
    world.stamp(model, x, y, 1);
    labels.push({ id: def.id, label: def.label, x: x + model.w / 2, y: y + model.d });
    x += model.w + gap;
  }
  world.box(0, 0, 0, W, D, 1, "grass");
  return { world, labels };
}
