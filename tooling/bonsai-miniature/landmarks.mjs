// The three 4×4 landmarks, hand-authored. The arcology is the game's
// "city within a city": a stepped megastructure whose every terrace is a
// garden, crowned — this is Bonsai City — by one old tree. The dome is a
// city under glass, a lattice shell you can see the streets through.

import { Model, TILE_VOXELS as T, mulberry32 } from "./voxel.mjs";
import { addTree } from "./buildings.mjs";
import { FACILITIES } from "./civic.mjs";

// 4×4 · a stepped arcology: glazed podium, five setback tiers of banded
// glass and white slab edges, a planted terrace on every setback, and a
// bonsai crown — a gnarled tree on a stone dais — with a mast beside it.
export function arcology(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 146, "arcology");
  const accent = ["sky", "mint", "salmon", "butter"][variant % 4];
  m.box(0, 0, 0, W, W, 1, "paving");
  // a ring road and lawn at the foot
  m.box(2, 2, 0, W - 2, W - 2, 1, "lawn");
  m.box(4, 4, 0, W - 4, W - 4, 1, "paving");
  const tiers = [
    { inset: 5, top: 18 },
    { inset: 10, top: 42 },
    { inset: 15, top: 66 },
    { inset: 20, top: 88 },
    { inset: 25, top: 106 },
  ];
  let base = 1;
  tiers.forEach(({ inset, top }, i) => {
    const x0 = inset, x1 = W - inset;
    // core volume
    m.box(x0, x0, base, x1, x1, top, "plaster");
    // floor bands: glass two of every three voxels, white slab edge the third
    for (let z = base; z < top; z += 1) {
      if ((z - base) % 3 === 2) continue;
      m.paint(x0, x0, z, x1, x1, z + 1, i % 2 ? "glass" : "glassdark", "plaster");
    }
    // accent fins on the corners and the middle of each face
    for (const [fx, fy] of [[x0, x0], [x1 - 1, x0], [x0, x1 - 1], [x1 - 1, x1 - 1]]) m.box(fx, fy, base, fx + 1, fy + 1, top, accent);
    const mid = Math.floor(W / 2);
    for (const [fx, fy] of [[mid, x0], [mid, x1 - 1], [x0, mid], [x1 - 1, mid]]) m.box(fx - 1, fy, base, fx + 1, fy + 1, top, "white");
    if (i === 0) {
      // glazed entrances on the street front
      m.box(mid - 5, x1 - 1, 1, mid + 5, x1, 7, "glassdark");
      m.box(mid - 6, x1, 7, mid + 6, x1 + 2, 8, "white");
    }
    // terrace garden on the roof of this tier, around the next tier's foot
    const next = tiers[i + 1];
    m.box(x0, x0, top, x1, x1, top + 1, "white");
    if (next) {
      m.box(x0 + 1, x0 + 1, top, x1 - 1, x1 - 1, top + 1, "lawn");
      m.box(x0, x0, top + 1, x1, x0 + 1, top + 2, "hedge");
      m.box(x0, x1 - 1, top + 1, x1, x1, top + 2, "hedge");
      m.box(x0, x0, top + 1, x0 + 1, x1, top + 2, "hedge");
      m.box(x1 - 1, x0, top + 1, x1, x1, top + 2, "hedge");
      const rng = mulberry32(4000 + i * 17 + variant);
      const ring = next.inset - inset;
      for (let k = 0; k < 10; k += 1) {
        const side = k % 4;
        const along = x0 + 2 + Math.floor(rng() * (x1 - x0 - 4));
        const off = x0 + 1 + Math.floor(rng() * Math.max(1, ring - 2));
        const [tx, ty] = side === 0 ? [along, off] : side === 1 ? [along, W - 1 - off] : side === 2 ? [off, along] : [W - 1 - off, along];
        addTree(m, tx, ty, top + 1, rng() < 0.25 ? "cherry" : "round", 4100 + i * 31 + k, 0.55 + rng() * 0.2);
      }
    }
    base = top + 1;
  });
  // the crown: a stone dais and one bonsai tree with a windswept canopy
  const topZ = tiers[tiers.length - 1].top + 1;
  const c = W / 2;
  m.cylinder(c, c, 6.5, topZ, topZ + 2, "limestone");
  m.cylinder(c, c, 5.5, topZ + 2, topZ + 3, "moss");
  const rng = mulberry32(4500 + variant);
  // gnarled trunk leaning, then a flat layered canopy
  const trunk = [[0, 0], [0, 0], [1, 0], [1, 1], [2, 1], [2, 1], [3, 2], [3, 2]];
  trunk.forEach(([dx, dy], k) => m.box(c + dx - 1, c + dy - 1, topZ + 3 + k, c + dx + 1, c + dy + 1, topZ + 4 + k, "trunk"));
  m.blob(c + 4, c + 3, topZ + 13, 7, 5, 2.4, "leafdark", rng, 0.3, "leaf");
  m.blob(c - 2, c - 1, topZ + 10, 5, 4, 2, "leafdark", rng, 0.3, "leaf");
  m.box(c + 8, c - 6, topZ + 3, c + 9, c - 5, 145, "steel");
  m.set(c + 8, c - 6, 145, "red");
  return m;
}

// 4×4 · a domed city: a low concrete ring wall, a lattice of glass ribs
// (meridians and parallels only, so the town shows through), and inside a
// small town of streets, blocks, trees and a pond.
export function dome(variant = 0) {
  const W = 4 * T;
  const m = new Model(W, W, 60, "dome");
  const c = W / 2;
  const R = 30;
  const Hd = 44;
  m.box(0, 0, 0, W, W, 1, "paving");
  m.cylinder(c, c, R + 1, 0, 1, "lawn");
  // inner streets
  m.box(c - 1, 4, 0, c + 1, W - 4, 1, "asphalt");
  m.box(4, c - 1, 0, W - 4, c + 1, 1, "asphalt");
  const rng = mulberry32(5000 + variant);
  const palette = ["cream", "salmon", "sky", "mint", "butter", "plaster"];
  for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let k = 0; k < 4; k += 1) {
      const bx = c + qx * (4 + Math.floor(rng() * 16));
      const by = c + qy * (4 + Math.floor(rng() * 16));
      const w = 3 + Math.floor(rng() * 3), d = 3 + Math.floor(rng() * 3);
      const dist = Math.hypot(bx - c, by - c);
      const h = Math.max(3, Math.round((1 - dist / R) * 22 * (0.6 + rng() * 0.6)));
      const x0 = Math.min(bx, bx + qx * w), y0 = Math.min(by, by + qy * d);
      m.box(x0, y0, 1, x0 + w, y0 + d, 1 + h, palette[Math.floor(rng() * palette.length)]);
      m.paint(x0, y0, 1 + h - 1, x0 + w, y0 + d, 1 + h, "gravel");
    }
  }
  m.cylinder(c + 10, c + 10, 4, 0, 1, "poolwater");
  for (let k = 0; k < 7; k += 1) addTree(m, c - 18 + Math.floor(rng() * 36), c - 18 + Math.floor(rng() * 36), 1, rng() < 0.3 ? "cherry" : "round", 5100 + k, 0.55);
  // ring wall
  for (let y = 0; y < W; y += 1) for (let x = 0; x < W; x += 1) {
    const r = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (r > R - 0.5 && r <= R + 1.5) m.box(x, y, 1, x + 1, y + 1, 3, "concrete");
  }
  // lattice shell: ellipsoid of radius R and height Hd, ribs only
  for (let z = 3; z < 3 + Hd; z += 1) for (let y = 0; y < W; y += 1) for (let x = 0; x < W; x += 1) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = (z - 3 + 0.5) / Hd;
    const r = Math.hypot(dx / R, dy / R, dz);
    if (r < 0.965 || r > 1.0) continue;
    const angle = Math.atan2(dy, dx);
    const meridian = Math.abs(((angle / (Math.PI / 8)) % 1 + 1) % 1 - 0.5) > 0.44;
    const parallel = (z - 3) % 7 === 0;
    if (meridian || parallel) m.set(x, y, z, z > Hd ? "white" : "roofglass");
  }
  m.box(c - 1, c - 1, Hd + 2, c + 1, c + 1, Hd + 6, "steel");
  return m;
}

export const LANDMARKS = {
  "catalog.arcology": { size: 4, label: "Arcology / 巨构城", make: arcology },
  "catalog.dome": { size: 4, label: "Domed city / 穹顶城", make: dome },
  "catalog.power_plant": { size: 4, label: "Power plant / 发电厂", make: (variant = 0) => FACILITIES["facility.coal"].make(variant) },
};
