// The rest of the network family for the SC2K tier: highway decks, onramps,
// the three bridge decks, and the two underground networks (water pipes and
// subway). Same port bits and arm construction as networks.mjs. Decks are
// built at ground level — the renderer lifts highways onto their piers and
// sets bridge decks at bank height, drawing the piers itself — so every
// piece meets its neighbour at the shared edge midpoint on the ground plane.

import { Model, TILE_VOXELS as T } from "./voxel.mjs";

const PORTS = [
  { bit: 1, dx: 0, dy: -1, name: "n" },
  { bit: 2, dx: 1, dy: 0, name: "e" },
  { bit: 4, dx: 0, dy: 1, name: "s" },
  { bit: 8, dx: -1, dy: 0, name: "w" },
];
const BY_NAME = Object.fromEntries(PORTS.map((p) => [p.name, p]));
const C = T / 2;

function arm(m, port, half, z0, z1, material, from = 0) {
  if (!port) { m.box(C - half, C - half, z0, C + half, C + half, z1, material); return; }
  if (port.dx === 0) {
    const y0 = port.dy < 0 ? 0 : C + from, y1 = port.dy < 0 ? C - from : T;
    m.box(C - half, y0, z0, C + half, y1, z1, material);
  } else {
    const x0 = port.dx < 0 ? 0 : C + from, x1 = port.dx < 0 ? C - from : T;
    m.box(x0, C - half, z0, x1, C + half, z1, material);
  }
}

// A rail along one side of an arm: the band at distance `offset` from the
// centreline, `side` −1 or +1.
function sideRail(m, port, offset, side, z0, z1, material, from = 0) {
  if (port.dx === 0) {
    const x = C + side * offset - (side < 0 ? 1 : 0);
    const y0 = port.dy < 0 ? 0 : C + from, y1 = port.dy < 0 ? C - from : T;
    m.box(x, y0, z0, x + 1, y1, z1, material);
  } else {
    const y = C + side * offset - (side < 0 ? 1 : 0);
    const x0 = port.dx < 0 ? 0 : C + from, x1 = port.dx < 0 ? C - from : T;
    m.box(x0, y, z0, x1, y + 1, z1, material);
  }
}

// ---------------------------------------------------------------- highway

// One carriageway tile of a two-wide highway: a pale concrete deck over the
// whole tile, lane dashes along the run, a parapet on every edge that does
// not continue, and a darker deck edge (the slab's thickness).
export function highwayPiece(mask) {
  const m = new Model(T, T, 8, `highway-${mask}`);
  const has = (bit) => (mask & bit) !== 0;
  m.box(0, 0, 0, T, T, 1, "darkconcrete");
  m.box(0, 0, 1, T, T, 2, "asphaltpatch");
  const fullNS = has(1) && has(4);
  const fullEW = has(2) && has(8);
  const interchange = fullNS && fullEW;
  if (!interchange) {
    const alongY = fullNS || (!fullEW && (has(1) || has(4)));
    for (let k = 1; k < T; k += 4) {
      for (const lane of [5, 10]) {
        if (alongY) m.box(lane, k, 1, lane + 1, k + 2, 2, "linewhite");
        else m.box(k, lane, 1, k + 2, lane + 1, 2, "linewhite");
      }
    }
  }
  // parapets on the closed edges
  if (!has(1)) m.box(0, 0, 2, T, 1, 4, "concrete");
  if (!has(4)) m.box(0, T - 1, 2, T, T, 4, "concrete");
  if (!has(8)) m.box(0, 0, 2, 1, T, 4, "concrete");
  if (!has(2)) m.box(T - 1, 0, 2, T, T, 4, "concrete");
  return m;
}

// ---------------------------------------------------------------- onramp

// "onramp.<h><r>": the wide end meets the highway on edge h, the narrow end
// the street on edge r. A flat tapering ramp with curbs and a painted arrow;
// the renderer tilts it between street level and deck level.
export function onrampPiece(highwaySide, roadSide) {
  const m = new Model(T, T, 6, `onramp-${highwaySide}${roadSide}`);
  const hp = BY_NAME[highwaySide];
  const rp = BY_NAME[roadSide];
  // centre pad plus the two arms, the highway arm wider
  arm(m, null, 5, 0, 1, "asphalt");
  arm(m, hp, 6, 0, 1, "asphalt");
  arm(m, rp, 4, 0, 1, "asphalt");
  // curbs along both arms
  for (const [p, half] of [[hp, 6], [rp, 4]]) {
    sideRail(m, p, half, -1, 1, 2, "curb");
    sideRail(m, p, half, 1, 1, 2, "curb");
  }
  // arrow on the ramp pointing toward the highway
  const ax = C - 1, ay = C - 1;
  m.box(ax, ay, 0, ax + 2, ay + 2, 1, "linewhite");
  m.box(ax + hp.dx * 2, ay + hp.dy * 2, 0, ax + hp.dx * 2 + 2, ay + hp.dy * 2 + 2, 1, "linewhite");
  m.box(ax + hp.dx * 3 - (hp.dx === 0 ? 1 : 0), ay + hp.dy * 3 - (hp.dy === 0 ? 1 : 0), 0,
    ax + hp.dx * 3 + (hp.dx === 0 ? 3 : 2), ay + hp.dy * 3 + (hp.dy === 0 ? 2 : 3), 1, "linewhite");
  return m;
}

// ---------------------------------------------------------------- bridges

// Bridge decks: the piece the land version draws, on a thicker girder deck
// with a railing along both sides of every arm.
export function bridgePiece(kind, mask) {
  const m = new Model(T, T, 8, `bridge-${kind}-${mask}`);
  const linked = PORTS.filter((p) => mask & p.bit);
  const arms = linked;
  const half = kind === "highway" ? 7 : kind === "rail" ? 4 : 6;
  // girder deck
  const girder = kind === "rail" ? "rust" : "steel";
  arm(m, null, half, 0, 1, girder);
  for (const p of arms) arm(m, p, half, 0, 1, girder);
  const surface = kind === "rail" ? "gravel" : kind === "highway" ? "asphaltpatch" : "asphalt";
  arm(m, null, half - 1, 1, 2, surface);
  for (const p of arms) arm(m, p, half - 1, 1, 2, surface);
  if (kind === "rail") {
    for (const p of arms) {
      for (let k = 1; k < T / 2; k += 2) {
        if (p.dx === 0) { const y = p.dy < 0 ? C - 1 - k : C + k; m.box(C - 3, y, 2, C + 3, y + 1, 3, "wood"); }
        else { const x = p.dx < 0 ? C - 1 - k : C + k; m.box(x, C - 3, 2, x + 1, C + 3, 3, "wood"); }
      }
      sideRail(m, p, 2, -1, 3, 4, "steel");
      sideRail(m, p, 2, 1, 3, 4, "steel");
    }
  } else {
    // centre markings on straight runs
    if (mask === 5 || mask === 10) {
      for (let k = 1; k < T; k += 4) {
        if (mask === 5) m.box(7, k, 1, 9, k + 2, 2, kind === "highway" ? "linewhite" : "lineyellow");
        else m.box(k, 7, 1, k + 2, 9, 2, kind === "highway" ? "linewhite" : "lineyellow");
      }
    }
  }
  // railings: posts every other voxel with a top rail, both sides of each arm
  const railMat = kind === "rail" ? "red" : "white";
  for (const p of arms) {
    for (const side of [-1, 1]) {
      sideRail(m, p, half, side, 3, 4, railMat);
      if (p.dx === 0) {
        const x = C + side * half - (side < 0 ? 1 : 0);
        for (let y = p.dy < 0 ? 0 : C; y < (p.dy < 0 ? C : T); y += 2) m.set(x, y, 2, railMat);
      } else {
        const y = C + side * half - (side < 0 ? 1 : 0);
        for (let x = p.dx < 0 ? 0 : C; x < (p.dx < 0 ? C : T); x += 2) m.set(x, y, 2, railMat);
      }
    }
  }
  // clear the railing where two arms meet so a junction stays open
  if (linked.length >= 2) m.clear(C - half + 1, C - half + 1, 2, C + half - 1, C + half - 1, 4);
  return m;
}

// ---------------------------------------------------------------- underground

// Water mains, shown on the underground view: a round blue main along each
// arm with a darker collar at the joints and a valve box at junctions.
export function pipePiece(mask) {
  const m = new Model(T, T, 6, `pipe-${mask}`);
  const linked = PORTS.filter((p) => mask & p.bit);
  for (const p of linked) {
    arm(m, p, 2, 0, 3, "blue");
    arm(m, p, 1, 3, 4, "sky");
    // a collar near the tile edge
    if (p.dx === 0) m.box(C - 3, p.dy < 0 ? 1 : T - 3, 0, C + 3, p.dy < 0 ? 3 : T - 1, 4, "darksteel");
    else m.box(p.dx < 0 ? 1 : T - 3, C - 3, 0, p.dx < 0 ? 3 : T - 1, C + 3, 4, "darksteel");
  }
  arm(m, null, 3, 0, 4, linked.length >= 3 ? "darksteel" : "blue");
  if (linked.length >= 3) m.box(C - 1, C - 1, 4, C + 1, C + 1, 5, "yellow");
  return m;
}

// Subway tunnels on the underground view: a concrete trough with ballast,
// sleepers and rails, and a lit strip along the wall.
export function subwayPiece(mask) {
  const m = new Model(T, T, 6, `subway-${mask}`);
  const linked = PORTS.filter((p) => mask & p.bit);
  const arms = linked;
  arm(m, null, 5, 0, 1, "darkconcrete");
  for (const p of arms) arm(m, p, 5, 0, 1, "darkconcrete");
  arm(m, null, 4, 1, 2, "gravel");
  for (const p of arms) arm(m, p, 4, 1, 2, "gravel");
  for (const p of arms) {
    for (let k = 1; k < T / 2; k += 2) {
      if (p.dx === 0) { const y = p.dy < 0 ? C - 1 - k : C + k; m.box(C - 3, y, 2, C + 3, y + 1, 3, "wood"); }
      else { const x = p.dx < 0 ? C - 1 - k : C + k; m.box(x, C - 3, 2, x + 1, C + 3, 3, "wood"); }
    }
    sideRail(m, p, 2, -1, 3, 4, "steel");
    sideRail(m, p, 2, 1, 3, 4, "steel");
    sideRail(m, p, 5, -1, 1, 3, "concrete");
    sideRail(m, p, 5, 1, 1, 3, "concrete");
    sideRail(m, p, 5, 1, 3, 4, "windowlit");
  }
  if (linked.length >= 2) m.clear(C - 4, C - 4, 1, C + 4, C + 4, 4), arm(m, null, 4, 1, 2, "gravel");
  return m;
}

// A lone buried pipe stub for utility tiles.
export function utilityPipe() {
  const m = new Model(T, T, 6, "utility-pipe");
  m.box(C - 3, C - 3, 0, C + 3, C + 3, 3, "blue");
  m.box(C - 2, C - 2, 3, C + 2, C + 2, 4, "darksteel");
  m.box(C - 1, C - 1, 4, C + 1, C + 1, 5, "yellow");
  return m;
}

export function moreNetworkFrames() {
  const frames = [];
  for (let mask = 0; mask < 16; mask += 1) {
    frames.push({ id: `highway.mask-${mask}`, make: () => highwayPiece(mask), outline: false });
    frames.push({ id: `pipe.mask-${mask}`, make: () => pipePiece(mask), outline: false });
    frames.push({ id: `subway.mask-${mask}`, make: () => subwayPiece(mask), outline: false });
    for (const kind of ["road", "rail", "highway"]) frames.push({ id: `bridge-${kind}.mask-${mask}`, make: () => bridgePiece(kind, mask), outline: false });
  }
  for (const h of ["n", "e", "s", "w"]) for (const r of ["n", "e", "s", "w"]) {
    if (h === r) continue;
    frames.push({ id: `onramp.${h}${r}`, make: () => onrampPiece(h, r), outline: false });
  }
  frames.push({ id: "utility.pipe", make: utilityPipe, outline: false });
  return frames;
}
