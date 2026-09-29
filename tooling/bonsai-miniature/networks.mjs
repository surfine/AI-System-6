// Network pieces for the SC2K tier: road, rail and power line, one frame per
// connection mask (bit 1 = y−1, 2 = x+1, 4 = y+1, 8 = x−1, world space, the
// same bits the renderer computes). Each piece is built from a centre pad and
// one arm per connected edge, so any two neighbours meet at the shared edge
// midpoint. The pieces are thin slabs laid on the terrain; the renderer bends
// them onto slopes itself. Only voxels inside the tile are drawn — the grass
// between arms is the terrain frame below.

import { Model, TILE_VOXELS as T } from "./voxel.mjs";

const PORTS = [
  { bit: 1, dx: 0, dy: -1 },
  { bit: 2, dx: 1, dy: 0 },
  { bit: 4, dx: 0, dy: 1 },
  { bit: 8, dx: -1, dy: 0 },
];

// Fill a band of a given half-width along an arm from the tile centre to the
// edge (or the whole centre pad when port is null).
function arm(m, port, half, z0, z1, material, from = 0) {
  const c = T / 2;
  if (!port) { m.box(c - half, c - half, z0, c + half, c + half, z1, material); return; }
  if (port.dx === 0) {
    const y0 = port.dy < 0 ? 0 : c + from, y1 = port.dy < 0 ? c - from : T;
    m.box(c - half, y0, z0, c + half, y1, z1, material);
  } else {
    const x0 = port.dx < 0 ? 0 : c + from, x1 = port.dx < 0 ? c - from : T;
    m.box(x0, c - half, z0, x1, c + half, z1, material);
  }
}

export function roadPiece(mask) {
  const m = new Model(T, T, 12, `road-${mask}`);
  const linked = PORTS.filter((p) => mask & p.bit);
  const straight = mask === 5 || mask === 10;
  // 1. the sidewalk band (two voxels tall) along the pad and every arm
  arm(m, null, 7, 0, 2, "sidewalk");
  for (const p of linked) arm(m, p, 7, 0, 2, "sidewalk");
  // 2. the carriageway pressed one voxel below it: asphalt at z = 0 only
  const carriage = (port) => { arm(m, port, 5, 1, 2, 0); arm(m, port, 5, 0, 1, "asphalt"); };
  carriage(null);
  for (const p of linked) carriage(p);
  // markings
  if (straight) {
    if (mask === 5) for (let y = 1; y < T; y += 4) m.box(7, y, 0, 9, y + 2, 1, "lineyellow");
    else for (let x = 1; x < T; x += 4) m.box(x, 7, 0, x + 2, 9, 1, "lineyellow");
  }
  if (linked.length >= 3) {
    for (const p of linked) {
      if (p.dx === 0) for (let x = 4; x < 12; x += 2) m.box(x, p.dy < 0 ? 0 : 14, 0, x + 1, p.dy < 0 ? 2 : 16, 1, "linewhite");
      else for (let y = 4; y < 12; y += 2) m.box(p.dx < 0 ? 0 : 14, y, 0, p.dx < 0 ? 2 : 16, y + 1, 1, "linewhite");
    }
  }
  return m;
}

export function railPiece(mask) {
  const m = new Model(T, T, 6, `rail-${mask}`);
  const linked = PORTS.filter((p) => mask & p.bit);
  arm(m, null, 4, 0, 1, "gravel");
  for (const p of linked) arm(m, p, 4, 0, 1, "gravel");
  // sleepers across each arm, rails along it
  for (const p of linked.length ? linked : [PORTS[0], PORTS[2]]) {
    const c = T / 2;
    for (let k = 1; k < T / 2; k += 2) {
      if (p.dx === 0) { const y = p.dy < 0 ? c - 1 - k : c + k; m.box(c - 3, y, 1, c + 3, y + 1, 2, "wood"); }
      else { const x = p.dx < 0 ? c - 1 - k : c + k; m.box(x, c - 3, 1, x + 1, c + 3, 2, "wood"); }
    }
    for (const off of [-2, 1]) {
      if (p.dx === 0) m.box(c + off, p.dy < 0 ? 0 : c - 2, 2, c + off + 1, p.dy < 0 ? c + 2 : T, 3, "steel");
      else m.box(p.dx < 0 ? 0 : c - 2, c + off, 2, p.dx < 0 ? c + 2 : T, c + off + 1, 3, "steel");
    }
  }
  return m;
}

// Height of the line above the ground, in voxels (the atlas test reads it at
// WIRE_Z × 2.5 px above the shared edge midpoint).
export const WIRE_Z = 14;

export function wirePiece(mask) {
  const m = new Model(T, T, 18, `wire-${mask}`);
  const c = T / 2;
  const linked = PORTS.filter((p) => mask & p.bit);
  // a wooden pole with a crossarm, wires at the crossarm height
  m.box(c, c, 0, c + 1, c + 1, 14, "wood");
  const alongY = linked.some((p) => p.dx === 0) || !linked.length;
  if (alongY) m.box(c - 2, c, 13, c + 3, c + 1, 14, "wood");
  else m.box(c, c - 2, 13, c + 1, c + 3, 14, "wood");
  // one line along the centre at the pole top, so it meets the neighbour's
  // line exactly at the shared edge midpoint
  for (const p of linked) {
    if (p.dx === 0) m.box(c, p.dy < 0 ? 0 : c, WIRE_Z, c + 1, p.dy < 0 ? c + 1 : T, WIRE_Z + 1, "trim");
    else m.box(p.dx < 0 ? 0 : c, c, WIRE_Z, p.dx < 0 ? c + 1 : T, c + 1, WIRE_Z + 1, "trim");
  }
  m.set(c, c, WIRE_Z, "darksteel");
  return m;
}

export function networkFrames() {
  const frames = [];
  for (let mask = 0; mask < 16; mask += 1) {
    frames.push({ id: `road.mask-${mask}`, make: () => roadPiece(mask), outline: false });
    frames.push({ id: `rail.mask-${mask}`, make: () => railPiece(mask), outline: false });
    frames.push({ id: `wire.mask-${mask}`, make: () => wirePiece(mask), outline: true });
  }
  return frames;
}
