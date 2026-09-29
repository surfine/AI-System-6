// Which authored model draws which atlas frame. The game names a growable
// building `building.<zone>.<size>.<variant>.<state>` with variant 1..24:
// 1-8 low tier, 9-16 middle, 17-24 high (for high tier the variant order is
// the tower height order the simulation picks by land value). A family is
// zone × size × tier; its eight slots cycle through the family's designs,
// and every slot gets its own colourway, so no two neighbours repeat.
// A family without a design of its own borrows from the nearest tier of the
// same zone and size; only if the whole zone × size is empty does the frame
// stay on the old atlas.

import { Model, TILE_VOXELS as T, mulberry32, mat } from "./voxel.mjs";
import * as B from "./buildings.mjs";
import { GROWABLES } from "./buildings-growables.mjs";
import { FACILITIES } from "./civic.mjs";
import { SPECIALS } from "./specials.mjs";
import { terrainFrames, terrainTriangles } from "./terrain.mjs";
import { networkFrames } from "./networks.mjs";
import { moreNetworkFrames } from "./networks2.mjs";
import { agentFrames } from "./agents.mjs";

const SAMPLE_FAMILIES = [
  ["cottage", "r", 1, "low"],
  ["duplex", "r", 1, "mid"],
  ["walkup", "r", 2, "mid"],
  ["residential-tower", "r", 3, "high"],
  ["corner-shop", "c", 1, "low"],
  ["cafe", "c", 1, "mid"],
  ["office", "c", 2, "mid"],
  ["skyscraper", "c", 3, "high"],
  ["workshop", "i", 1, "low"],
  ["warehouse", "i", 2, "low"],
  ["factory", "i", 2, "mid"],
];

const TIERS = ["low", "mid", "high"];
const BORROW = { low: ["low", "mid", "high"], mid: ["mid", "low", "high"], high: ["high", "mid", "low"] };

function designTable() {
  const table = new Map();
  const add = (zone, size, tier, entry) => {
    const key = `${zone}.${size}.${tier}`;
    if (!table.has(key)) table.set(key, []);
    table.get(key).push(entry);
  };
  const byId = new Map(B.BUILDINGS.map((b) => [b.id, b]));
  for (const [id, zone, size, tier] of SAMPLE_FAMILIES) add(zone, size, tier, { id, make: byId.get(id).make });
  for (const def of GROWABLES) add(def.zone, def.size, def.tier, { id: def.id, make: def.make });
  return table;
}

const TABLE = designTable();

/** The design and arguments that draw building.<zone>.<size>.<variant>.normal, or null. */
export function growableFor(zone, size, variant) {
  const tier = TIERS[Math.floor((variant - 1) / 8)];
  const slot = (variant - 1) % 8;
  for (const t of BORROW[tier]) {
    const designs = TABLE.get(`${zone}.${size}.${t}`);
    if (!designs || !designs.length) continue;
    const design = designs[slot % designs.length];
    // colourway: step through the design's variants so repeats differ
    const colourway = (slot + Math.floor(slot / designs.length) * 3) % 8;
    const rank = tier === "high" ? slot : Math.min(slot, 3);
    return { id: design.id, borrowed: t !== tier, make: () => design.make(colourway, rank) };
  }
  return null;
}

// ------------------------------------------------------------ build states
// One model per size and state, shared by the three zones (the old atlas also
// had one per size): a staked-out pad, a building going up in scaffolding, a
// tired building, a boarded ruin, and a ruin being put right.

function lot(size, material = "soil") {
  const m = new Model(size * T, size * T, 16 + size * 22, "state");
  m.box(0, 0, 0, size * T, size * T, 1, material);
  return m;
}

function foundation(size) {
  const W = size * T;
  const m = lot(size);
  const inset = 2;
  m.box(inset, inset, 1, W - inset, W - inset, 2, "concrete");
  m.clear(inset + 2, inset + 2, 1, W - inset - 2, W - inset - 2, 2);
  m.box(inset + 2, inset + 2, 0, W - inset - 2, W - inset - 2, 1, "sand");
  for (let x = inset; x < W - inset; x += 4) for (const y of [inset, W - inset - 1]) m.box(x, y, 2, x + 1, y + 1, 5, "darksteel");
  for (let y = inset; y < W - inset; y += 4) for (const x of [inset, W - inset - 1]) m.box(x, y, 2, x + 1, y + 1, 5, "darksteel");
  // a small digger
  m.box(W - 9, 2, 1, W - 3, 5, 3, "yellow");
  m.box(W - 8, 2, 3, W - 5, 5, 5, "yellow");
  m.box(W - 7, 3, 5, W - 6, 4, 6, "glassdark");
  m.box(W - 12, 3, 3, W - 9, 4, 4, "yellow");
  m.set(W - 12, 3, 2, "darksteel");
  return m;
}

function construction(size) {
  const W = size * T;
  const m = lot(size, "concrete");
  const inset = 3;
  const top = 6 + size * 9;
  // concrete core rising, open floors above
  m.box(inset + 2, inset + 2, 1, W - inset - 2, W - inset - 2, Math.round(top * 0.55), "concrete");
  for (let z = Math.round(top * 0.55); z < top; z += 3) {
    m.box(inset + 2, inset + 2, z, W - inset - 2, W - inset - 2, z + 1, "darkconcrete");
    for (const [x, y] of [[inset + 2, inset + 2], [W - inset - 3, inset + 2], [inset + 2, W - inset - 3], [W - inset - 3, W - inset - 3]]) m.box(x, y, z, x + 1, y + 1, z + 3, "concrete");
  }
  // scaffold lattice on the two street-facing sides
  for (let z = 1; z < top; z += 3) {
    m.box(inset, W - inset - 1, z, W - inset, W - inset, z + 1, "yellow");
    m.box(W - inset - 1, inset, z, W - inset, W - inset, z + 1, "yellow");
  }
  for (let x = inset; x < W - inset; x += 4) m.box(x, W - inset - 1, 1, x + 1, W - inset, top, "darksteel");
  for (let y = inset; y < W - inset; y += 4) m.box(W - inset - 1, y, 1, W - inset, y + 1, top, "darksteel");
  // tower crane for the bigger lots
  if (size >= 2) {
    const cx = inset + 1;
    m.box(cx, cx, 1, cx + 2, cx + 2, top + 12, "yellow");
    m.box(cx, cx, top + 12, W - 2, cx + 2, top + 13, "yellow");
    m.box(cx - 5, cx, top + 12, cx, cx + 2, top + 13, "yellow");
    m.box(cx - 5, cx, top + 10, cx - 2, cx + 2, top + 12, "concrete");
    m.box(W - 4, cx + 1, top + 6, W - 3, cx + 2, top + 12, "darksteel");
    m.box(W - 5, cx, top + 5, W - 2, cx + 3, top + 6, "wood");
  }
  m.box(1, 1, 1, 5, 3, 2, "wood");
  m.box(1, 1, 2, 5, 3, 3, "wood");
  return m;
}

// Take a mid-tier design of the zone and age it: soot, missing panes, weeds.
function weather(model, seed, severity) {
  const rng = mulberry32(seed);
  const out = new Model(model.w, model.d, model.h, model.name);
  out.data.set(model.data);
  const board = mat("wood");
  const dark = mat("darkconcrete");
  const weed = mat("hedge");
  const soil = mat("soil");
  const windows = new Set(["window", "glass", "glassdark", "windowlit"].map(mat));
  const lawns = new Set(["lawn", "grass", "paving", "sidewalk", "parking"].map(mat));
  for (let z = 0; z < out.h; z += 1) for (let y = 0; y < out.d; y += 1) for (let x = 0; x < out.w; x += 1) {
    const i = out.index(x, y, z);
    const v = out.data[i];
    if (!v) continue;
    const r = rng();
    if (windows.has(v)) { if (r < severity) out.data[i] = board; continue; }
    if (z === 0 && lawns.has(v)) { if (r < severity * 0.6) out.data[i] = r < severity * 0.3 ? weed : soil; continue; }
    if (z > 0 && r < severity * 0.35) out.data[i] = dark;
  }
  if (severity > 0.5) {
    // a caved-in roof: clear a ragged patch from the top down
    let topZ = 0;
    for (let z = out.h - 1; z > 0 && !topZ; z -= 1) for (let i = 0; i < out.w * out.d; i += 1) if (out.data[i + z * out.w * out.d]) { topZ = z; break; }
    const cx = Math.floor(out.w * 0.45), cy = Math.floor(out.d * 0.4), r = Math.max(2, Math.floor(out.w / 6));
    for (let y = cy - r; y <= cy + r; y += 1) for (let x = cx - r; x <= cx + r; x += 1) {
      const depth = 1 + Math.floor(rng() * 3);
      for (let z = topZ; z > topZ - depth && z > 0; z -= 1) out.set(x, y, z, 0);
    }
  }
  return out;
}

function stateModel(zone, size, state) {
  if (state === "foundation") return foundation(size);
  if (state === "construction") return construction(size);
  const g = growableFor(zone, size, 9) || growableFor(zone, size, 1);
  if (!g) return null;
  const base = g.make();
  if (state === "declined") return weather(base, 1000 + size, 0.3);
  if (state === "abandoned") return weather(base, 2000 + size, 0.75);
  if (state === "recovering") {
    const m = weather(base, 3000 + size, 0.2);
    // scaffold up the street front
    const W = m.w;
    for (let z = 1; z < Math.min(m.h - 2, 8 + size * 8); z += 3) m.box(1, W - 2, z, W - 1, W - 1, z + 1, "yellow");
    for (let x = 1; x < W - 1; x += 4) m.box(x, W - 2, 1, x + 1, W - 1, Math.min(m.h - 2, 8 + size * 8), "darksteel");
    return m;
  }
  return null;
}

export const STATES = ["foundation", "construction", "declined", "abandoned", "recovering"];

// ------------------------------------------------------------ parks
// A 1×1 park tile: lawn, a gravel path, trees and somewhere to sit (1), or a
// small paved square with a fountain and flower beds (2).
function parkModel(kind) {
  const m = new Model(T, T, 24, `park-${kind}`);
  m.box(0, 0, 0, T, T, 1, "lawn");
  if (kind === 1) {
    m.box(0, 7, 0, T, 9, 1, "sand");
    m.box(7, 0, 0, 9, T, 1, "sand");
    B.addTree(m, 3, 3, 1, "round", 901, 0.75);
    B.addTree(m, 12, 12, 1, "cherry", 902, 0.7);
    B.addTree(m, 12, 3, 1, "conifer", 903, 0.6);
    m.box(2, 10, 1, 6, 11, 2, "wood");
    m.box(2, 11, 1, 3, 12, 3, "wood");
    m.box(5, 11, 1, 6, 12, 3, "wood");
    m.box(3, 13, 1, 5, 15, 2, "flowerred");
  } else {
    m.box(2, 2, 0, 14, 14, 1, "paving");
    m.cylinder(8, 8, 3.6, 1, 2, "limestone");
    m.cylinder(8, 8, 2.8, 1, 2, "poolwater");
    m.box(7, 7, 1, 9, 9, 4, "white");
    m.set(7, 7, 4, "poolwater"); m.set(8, 8, 4, "poolwater");
    for (const [x, y, c] of [[1, 1, "flowerred"], [13, 1, "floweryellow"], [1, 13, "floweryellow"], [13, 13, "flowerred"]]) m.box(x, y, 1, x + 2, y + 2, 2, c);
    B.addTree(m, 1.5, 7.5, 1, "round", 911, 0.55);
    B.addTree(m, 13.5, 7.5, 1, "round", 912, 0.55);
  }
  return m;
}

// ------------------------------------------------------------ trees
// A tree tile is a small grove, not one tree: three or four crowns of
// different sizes so a forest reads as woodland. No lot layer — trees stand
// on whatever terrain the tile has.
const GROVES = {
  broadleaf: [[4, 5, "round", 0.85], [11, 4, "round", 0.75], [8, 11, "round", 0.9], [13, 12, "round", 0.55]],
  conifer: [[4, 4, "conifer", 0.8], [11, 5, "conifer", 0.95], [6, 11, "conifer", 0.7], [12, 12, "conifer", 0.85]],
  young: [[5, 6, "round", 0.5], [11, 10, "round", 0.55], [9, 4, "conifer", 0.45]],
  maple: [[4, 5, "maple", 0.85], [11, 4, "round", 0.7], [8, 11, "maple", 0.9]],
  blossom: [[4, 5, "cherry", 0.8], [11, 5, "round", 0.7], [8, 11, "cherry", 0.9]],
  winter: [[4, 5, "bare", 0.85], [11, 4, "conifer", 0.8], [8, 11, "bare", 0.9]],
};

function bareTree(m, cx, cy, seed, scale) {
  const rng = mulberry32(seed);
  const h = Math.round(9 * scale) + 2;
  m.box(cx, cy, 0, cx + 1, cy + 1, h, "trunk");
  for (let k = 0; k < 5; k += 1) {
    const dx = Math.round((rng() - 0.5) * 6 * scale), dy = Math.round((rng() - 0.5) * 6 * scale);
    const z = h - 1 - Math.floor(rng() * 4);
    m.set(cx + Math.sign(dx), cy + Math.sign(dy), z, "trunk");
    m.set(cx + dx, cy + dy, z + 1, "trunk");
    m.set(cx + dx, cy + dy, z + 2, "snow");
  }
  m.set(cx, cy, h, "snow");
}

function groveModel(kind) {
  const m = new Model(T, T, 24, `tree-${kind}`);
  GROVES[kind].forEach(([x, y, tree, scale], i) => {
    const seed = 700 + i * 13 + kind.length * 101;
    if (tree === "bare") { bareTree(m, x, y, seed, scale); return; }
    if (tree === "maple") {
      const rng = mulberry32(seed);
      const trunkH = Math.round(5 * scale);
      m.box(x, y, 0, x + 1, y + 1, trunkH, "trunk");
      const r = 3.8 * scale;
      m.blob(x + 0.5, y + 0.5, trunkH + r * 0.7, r, r, r * 0.85, "maple", rng, 0.25, "maplelight");
      return;
    }
    B.addTree(m, x, y, 0, tree, seed, scale);
  });
  if (kind === "winter") for (let y = 0; y < T; y += 1) for (let x = 0; x < T; x += 1) if (!m.get(x, y, 0) && (x * 7 + y * 3) % 5 === 0) m.set(x, y, 0, "snow");
  return m;
}

/**
 * Every atlas frame the voxel catalog draws: { id, model(), night, source }.
 * Frames not listed here stay on the old atlas.
 */
export function catalogFrames() {
  const frames = [];
  for (const zone of ["r", "c", "i"]) {
    for (const size of [1, 2, 3]) {
      for (let variant = 1; variant <= 24; variant += 1) {
        const g = growableFor(zone, size, variant);
        if (!g) continue;
        frames.push({ id: `building.${zone}.${size}.${variant}.normal`, make: g.make, night: false, design: g.id, borrowed: g.borrowed });
        frames.push({ id: `building.${zone}.${size}.${variant}.night`, make: g.make, night: true, design: g.id, borrowed: g.borrowed });
      }
      for (const state of STATES) {
        frames.push({ id: `building.${zone}.${size}.1.${state}`, make: () => stateModel(zone, size, state), night: false, design: `state-${state}` });
      }
    }
  }
  // Facilities and landmark specials: one model each, a lit night twin.
  for (const [id, def] of [...Object.entries(FACILITIES), ...Object.entries(SPECIALS)]) {
    const make = () => def.make(0);
    frames.push({ id, make, night: false, design: id });
    frames.push({ id: `${id}.night`, make, night: true, design: id });
  }
  // Ground: smooth triangles, no outline (tiles must meet seamlessly).
  for (const t of terrainFrames()) {
    const surface = { surface: (q) => terrainTriangles(t.kind, t.mask, q), footprint: { w: T, d: T }, outline: false };
    frames.push({ id: t.id, make: () => surface, night: false, design: `terrain-${t.kind}` });
  }
  for (const net of [...networkFrames(), ...moreNetworkFrames()]) frames.push({ ...net, night: false, design: net.id.split(".")[0] });
  for (const agent of agentFrames()) frames.push({ ...agent, night: false, design: agent.id });
  // Small parks: new frames the old atlas never had (the renderer used a young
  // tree). `extra` marks a frame the bake appends rather than replaces.
  frames.push({ id: "park.small.1", make: () => parkModel(1), night: false, design: "park-1", extra: { category: "scenery", variant: 1 } });
  frames.push({ id: "park.small.2", make: () => parkModel(2), night: false, design: "park-2", extra: { category: "scenery", variant: 2 } });
  for (const kind of Object.keys(GROVES)) frames.push({ id: `tree.${kind}`, make: () => groveModel(kind), night: false, design: `grove-${kind}` });
  return frames;
}
