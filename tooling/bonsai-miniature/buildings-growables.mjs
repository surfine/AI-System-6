// Growable Bonsai City buildings, one design per entry. The game picks a
// lot's look from a variant 1..24: 1-8 low tier (older, cheaper), 9-16 middle,
// 17-24 high tier (for 2x2 and 3x3, towers ordered by land value: rank 0 is
// the shortest, rank 7 the tallest). Each design here serves one
// zone × size × tier family; `make(variant, rank)` gets variant 0..7 (a
// colourway / furniture choice) and rank 0..7 (height order, used by high
// tier designs). Conventions are those of buildings.mjs: lot of size × 16
// voxels, z = 0 is the fully covered lot surface, the street front faces +y.

import { Model, TILE_VOXELS as T, STOREY as S, mulberry32 } from "./voxel.mjs";
import { addTree, addCar } from "./buildings.mjs";
import { DESIGNS as RC } from "./growables-rc.mjs";
import { DESIGNS as IND } from "./growables-i.mjs";

const pick = (list, variant) => list[((variant % list.length) + list.length) % list.length];

// 2×2 · high tier · a slender condominium tower: a two-storey glazed lobby,
// a shaft of 8 + rank×2 floors with wraparound balconies on alternate floors,
// a setback penthouse and a rooftop garden.
export function condoTower(variant = 0, rank = 0) {
  const W = 2 * T;
  const floors = 8 + rank * 2;
  const top = 1 + 2 * S + floors * S;
  const m = new Model(W, W, top + 14, "condo-tower");
  const wall = pick(["plaster", "cream", "limestone", "sky"], variant);
  const accent = pick(["salmon", "mint", "butter", "sky"], variant + 1);
  m.box(0, 0, 0, W, W, 1, "paving");
  m.box(0, 0, 0, 7, W, 1, "lawn");
  addTree(m, 3, 4, 1, "round", 900 + variant, 0.8);
  addTree(m, 3, 24, 1, variant % 2 ? "cherry" : "round", 910 + variant, 0.8);
  const x0 = 9, y0 = 6, x1 = 27, y1 = 26;
  m.box(x0, y0, 1, x1, y1, 1 + 2 * S, "glassdark");
  m.box(x0 - 1, y0 - 1, 1 + 2 * S, x1 + 1, y1 + 1, 2 + 2 * S, "white");
  m.box(x0, y0, 2 + 2 * S, x1, y1, top, wall);
  m.windows(x0, y0, x1, y1, 2 + 2 * S, top, { floor: S, offset: 0, height: 2, period: 3, width: 2 });
  for (let z = 2 + 2 * S; z < top; z += 2 * S) {
    m.box(x0 - 1, y0 - 1, z, x1 + 1, y1 + 1, z + 1, "white");
    m.box(x0 - 1, y1, z + 1, x1 + 1, y1 + 1, z + 2, accent);
    m.box(x1, y0 - 1, z + 1, x1 + 1, y1 + 1, z + 2, accent);
  }
  m.box(x0 + 3, y0 + 3, top, x1 - 3, y1 - 3, top + 2 * S, "glass");
  m.flatRoof(x0 + 3, y0 + 3, x1 - 3, y1 - 3, top + 2 * S, "white", "gravel");
  m.box(x0, y0, top, x0 + 3, y1, top + 1, "hedge");
  m.box(x1 - 3, y0, top, x1, y1, top + 1, "hedge");
  addCar(m, 20, 28, 1, "x", pick(["carwhite", "carred", "carblue"], variant));
  return m;
}

export const GROWABLES = [
  { id: "condo-tower", zone: "r", size: 2, tier: "high", label: "Condo tower / 公寓塔楼", make: condoTower },
  ...RC,
  ...IND,
];
