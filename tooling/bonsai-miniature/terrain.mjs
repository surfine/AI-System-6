// Terrain tiles for the SC2K tier, drawn as smooth triangles rather than
// voxels so a slope reads as a slope, not a staircase. A tile is 16 × 16
// cells, two triangles per cell, each cell with its own small colour jitter
// (the tile's texture). Corner heights follow the renderer: a slope frame
// lifts the edges whose neighbour stands higher — bit 1 the y−1 edge, 2 the
// x+1 edge, 4 the y+1 edge, 8 the x−1 edge — by one altitude step, which is
// four voxels (10 px). Every tile carries one step of soil skirt below its
// surface on all four sides, as the old frames did, so cliffs and the map
// edge show layered ground.

import { hash3, TILE_VOXELS as T } from "./voxel.mjs";
import { surfaceShade } from "./raster.mjs";

const STEP = 4;
const GROUND = {
  grass: { base: [132, 180, 84], alt: [150, 190, 92], speck: [[112, 164, 72], [168, 198, 104]], flower: 0.012 },
  lot: { base: [146, 184, 90], alt: [154, 188, 96], speck: [[132, 170, 82], [170, 196, 110]], flower: 0 },
  soil: { base: [138, 172, 82], alt: [148, 178, 88], speck: [[150, 124, 84], [128, 160, 76]], flower: 0, patch: [[156, 126, 86], 0.075] },
  rock: { base: [136, 170, 86], alt: [144, 176, 92], speck: [[150, 148, 140], [124, 156, 80]], flower: 0, patch: [[168, 164, 156], 0.055] },
  snow: { base: [236, 242, 246], alt: [226, 234, 242], speck: [[210, 222, 234], [248, 250, 252]], flower: 0 },
  coast: { base: [226, 206, 150], alt: [216, 196, 142], speck: [[204, 184, 132], [238, 222, 172]], flower: 0 },
  water: { base: [66, 150, 192], alt: [72, 158, 198], speck: [[58, 138, 180], [150, 206, 228]], flower: 0 },
};
const SKIRT = [[152, 110, 76], [128, 92, 64], [104, 78, 58]];

function smooth(cx, cy, salt) {
  // clumpy noise: average of the cell and its neighbours
  let sum = 0;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) sum += hash3(cx + dx, cy + dy, 401 + salt);
  return sum / 9 - 0.3;
}

function cellColour(kind, cx, cy, salt) {
  const g = GROUND[kind];
  const h = hash3(cx * 3 + salt, cy * 5 + 7, 11 + salt);
  let c = ((cx >> 2) + (cy >> 2)) % 2 ? g.alt : g.base;
  if (h < 0.1) c = g.speck[0];
  else if (h > 0.92) c = g.speck[1];
  if (kind === "water") {
    // short light ripple strokes along x
    const r = hash3(Math.floor(cx / 3), cy, 91 + salt);
    if (r > 0.86 && cy % 3 === 0) c = g.speck[1];
  }
  // soil and rock show through the grass in small clumps
  if (g.patch && smooth(cx, cy, salt) < g.patch[1]) c = g.patch[0];
  if (g.flower && hash3(cx, cy, 313 + salt) < g.flower) c = hash3(cx, cy, 17) < 0.5 ? [246, 232, 110] : [248, 248, 244];
  const j = 1 + (hash3(cx, cy, 5 + salt) - 0.5) * 0.06;
  return [c[0] * j, c[1] * j, c[2] * j];
}

/** Corner heights (voxels) for a world-space lift mask: [c00, c10, c11, c01]. */
export function liftedCorners(mask) {
  const up = (bits) => (mask & bits ? STEP : 0);
  return [up(1 | 8), up(1 | 2), up(2 | 4), up(4 | 8)];
}

function rotatePoint([X, Y, Z], q) {
  if (q === 1) return [Y, T - X, Z];
  if (q === 2) return [T - X, T - Y, Z];
  if (q === 3) return [T - Y, X, Z];
  return [X, Y, Z];
}

function rotateVec([vx, vy], q) {
  if (q === 1) return [vy, -vx];
  if (q === 2) return [-vx, -vy];
  if (q === 3) return [-vy, vx];
  return [vx, vy];
}

function normalOf(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const k = n[2] < 0 ? -1 : 1;
  return [k * n[0] / len, k * n[1] / len, k * n[2] / len];
}

/**
 * Triangles for one terrain tile, already turned for camera quarter-turn q
 * (the same turn buildings get). `kind` picks the ground; `mask` lifts edges.
 */
export function terrainTriangles(kind, mask, q, salt = 0) {
  const [c00, c10, c11, c01] = liftedCorners(mask);
  const height = (x, y) => {
    const s = x / T, t = y / T;
    return c00 * (1 - s) * (1 - t) + c10 * s * (1 - t) + c11 * s * t + c01 * (1 - s) * t;
  };
  const tris = [];
  const push = (p, rgb) => {
    const r = p.map((v) => rotatePoint(v, q));
    const n = normalOf(r[0], r[1], r[2]);
    const k = surfaceShade(n[0], n[1], n[2]);
    tris.push({ p: r, rgb: [rgb[0] * k, rgb[1] * k, rgb[2] * k] });
  };
  // vertical skirt quads: shade by the outward normal after the turn
  const wall = (a, b, c, d, colour, out) => {
    const [nx, ny] = rotateVec(out, q);
    const k = surfaceShade(nx, ny, 0);
    const rgb = [colour[0] * k, colour[1] * k, colour[2] * k];
    const r = [a, b, c, d].map((v) => rotatePoint(v, q));
    tris.push({ p: [r[0], r[1], r[2]], rgb }, { p: [r[0], r[2], r[3]], rgb });
  };
  for (let cy = 0; cy < T; cy += 1) {
    for (let cx = 0; cx < T; cx += 1) {
      const a = [cx, cy, height(cx, cy)];
      const b = [cx + 1, cy, height(cx + 1, cy)];
      const c = [cx + 1, cy + 1, height(cx + 1, cy + 1)];
      const d = [cx, cy + 1, height(cx, cy + 1)];
      const rgb = cellColour(kind, cx, cy, salt);
      push([a, b, c], rgb);
      push([a, c, d], rgb);
    }
  }
  // soil skirt, one step deep, banded
  const edges = [
    [[0, 0], [T, 0]], [[T, 0], [T, T]], [[T, T], [0, T]], [[0, T], [0, 0]],
  ];
  for (const [[x0, y0], [x1, y1]] of edges) {
    for (let i = 0; i < T; i += 2) {
      const ax = x0 + (x1 - x0) * (i / T), ay = y0 + (y1 - y0) * (i / T);
      const bx = x0 + (x1 - x0) * ((i + 2) / T), by = y0 + (y1 - y0) * ((i + 2) / T);
      const topA = height(ax, ay), topB = height(bx, by);
      const out = x0 === x1 ? [x0 === 0 ? -1 : 1, 0] : [0, y0 === 0 ? -1 : 1];
      // Only the two edges facing the camera get a skirt: a back edge would
      // be painted over the neighbour drawn before it. A lifted edge never
      // does — its neighbour stands higher and covers it.
      const [rx, ry] = rotateVec(out, q);
      if (rx <= 0 && ry <= 0) continue;
      if (topA > 0 || topB > 0) continue;
      // Four steps of banded soil: a cliff several levels tall shows ground
      // all the way down instead of the empty map behind it (the lower
      // tiles in front cover whatever of it is not a cliff).
      [[0, -1.5], [-1.5, -3], [-3, -STEP], [-STEP, -STEP * 2], [-STEP * 2, -STEP * 4]].forEach(([top, bottom], k) => {
        const base = kind === "water" && k === 0 ? [52, 120, 160] : SKIRT[Math.min(SKIRT.length - 1, k)];
        const j = 1 - (hash3(i, k, 29) - 0.5) * 0.08;
        wall([ax, ay, top], [bx, by, top], [bx, by, bottom], [ax, ay, bottom], base.map((v) => v * j), out);
      });
    }
  }
  return tris;
}

// Frame ids → (kind, mask).
export function terrainFrames() {
  const frames = [];
  for (const kind of ["grass", "soil", "rock", "water", "coast", "lot", "snow"]) {
    frames.push({ id: `terrain.${kind}`, kind, mask: 0 });
  }
  frames.push({ id: "terrain.slope", kind: "grass", mask: 1 });
  for (let mask = 0; mask < 16; mask += 1) frames.push({ id: `terrain.slope.mask-${mask}`, kind: "grass", mask });
  return frames;
}
