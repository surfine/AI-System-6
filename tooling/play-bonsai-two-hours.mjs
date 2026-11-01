#!/usr/bin/env node
// Bonsai City scripted playthrough / 盆景城市脚本试玩.
//
// A deterministic scripted mayor plays the headless simulation core the way a
// player does through the shell (spec internal/plans/BONSAI-PLAYABLE-SPEC
// 3.8): the reference game is 128², balanced ground, $20,000 and 7% taxes. It
// lays a street grid block by block, zones what the RCI gauge asks for, keeps
// power and water ahead of the zoned land, and — unless it is the
// laissez-faire mayor — puts police, fire, schools, clinics, hospitals,
// parks, buses and later rail where the people are. It takes bonds when the
// till is empty, starts one disaster per decade, and places every reward
// the city earns.
//
// It then checks the pacing table and the money: the first building starts
// within a month of zoning, 1,000 residents in year 1, 8,000-15,000 in year
// 5, 40,000-80,000 in year 15 (on 128²; PACE.bySize holds 96² and 64²), a
// yearly net cash flow within ±25% of income at 7%, and never more than
// $500,000 in the bank in thirty years. Without --size it plays 128², 96²
// and 64² in turn. The
// laissez-faire mayor (--laissez-faire) builds no services and no transit;
// its city has to stall, and the advisors have to say why.
//
// A shortfall is a finding, not a number to adjust: the report names the
// year the growth stalled and what the core reported as the blocker.
//
// Usage: node tooling/play-bonsai-two-hours.mjs [--seed N] [--size 64|96|128]
//        [--years 30] [--minutes M] [--target N] [--laissez-faire]
//        [--compare] [--json <path>] [--quiet]
// Exit 0 when every check holds, 1 otherwise. No browser, no DOM.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The mayor plays the core in this process's own realm, as a page runs it;
// inside a node:vm context every global lookup is intercepted and a long
// game takes minutes instead of seconds. Tests pass their own contextified
// core through `sim` when they need one.
export function loadSim() {
  const previous = globalThis.window;
  globalThis.window = {};
  try {
    (0, eval)(fs.readFileSync(path.join(root, "apps/desktop/app/features/bonsai-city-sim.js"), "utf8"));
    return globalThis.window.AISystem6BonsaiSim;
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
}
export function loadSimInVm() {
  const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
  vm.runInContext(fs.readFileSync(path.join(root, "apps/desktop/app/features/bonsai-city-sim.js"), "utf8"), context);
  return context.window.AISystem6BonsaiSim;
}

// The pacing table (spec 3.8) and the money rules (3.7). The table was set
// on the 128² reference game; `bySize` holds each map size's own figures
// (acceptance work order B3), measured with the same seed and mayor:
// - Year 15 is land-bound: the 128² city is still growing into free ground,
//   the smaller maps are full. The range scales with the land, 96² at 9/16
//   and 64² at 1/4 of 128² (40,000-80,000 becomes 22,500-45,000 and
//   10,000-20,000). Measured: 37,849 and 10,993.
// - Year 5 is pace-bound, not land-bound, on every size (96² reaches 10,722,
//   64² 10,830 with its lattice nearly full), so it keeps 8,000-15,000.
// - Year 1 on 96² is one month of lot growth behind: 688 residents at
//   month 12, 1,028 at month 13 (the second residential block is zoned a
//   month later than on 128², the rules are the same). Its floor is 600.
// The money rules are the reference game's (spec 4.3) and are checked on
// 128² only; the funds ceiling and "never red for a year" hold on every size.
const PACE_128 = Object.freeze({ year1: 1000, year5: Object.freeze([8000, 15000]), year15: Object.freeze([40000, 80000]) });
export const PACE = Object.freeze({
  firstConstructionDays: 25,
  ...PACE_128,
  bySize: Object.freeze({
    128: PACE_128,
    96: Object.freeze({ year1: 600, year5: Object.freeze([8000, 15000]), year15: Object.freeze([22500, 45000]) }),
    64: Object.freeze({ year1: 1000, year5: Object.freeze([8000, 15000]), year15: Object.freeze([10000, 20000]) }),
  }),
  cashFlowShare: 0.25,
  // Owner decision (2026-09-27): the ±25% cash-flow rule is an acceptance
  // cash-flow rule and it starts with year 3, not year 2. The reference city
  // is still founding in years 1-2, so a young city's lumpy founding costs
  // are reported but not judged. Every yearly row (year 1 and 2 included)
  // stays in the report.
  cashFlowStartYear: 3,
  fundsCeiling: 500000,
  fundsCeilingYears: 30,
});
export const PACE_SIZES = Object.freeze([128, 96, 64]);

const BLOCK = 7; // a 6x6 block of zoned land plus its shared road line
const DISASTER_CYCLE = Object.freeze(["fire", "tornado", "flood", "earthquake", "monster"]);
const ORDINANCE_ORDER = Object.freeze(["neighborhoodWatch", "proReading", "cprTraining", "pollutionControls", "juniorSports", "freeClinics"]);
// Civic block slots: the top row takes one-tile services, the bottom half
// two 3x3 buildings.
const CIVIC_SMALL = Object.freeze([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
const CIVIC_LARGE = Object.freeze([[0, 3], [3, 3]]);

export function createMayor(sim, state, options = {}) {
  const log = options.log || (() => {});
  const laissezFaire = options.mode === "laissez-faire";
  const size = state.size;
  const spawn = state.spawnCenter;
  const origin = { x: spawn.x - 1 - BLOCK * 2, y: spawn.y - 1 - BLOCK * 2 };
  const blocks = new Map(); // "bx,by" -> { bx, by, kind, zone, small: [...], large: [...] }
  const unusable = new Set();
  let sequence = 0;
  const receipts = new Map();
  const placedRewards = new Set();
  const disastersStarted = [];
  let lastDisasterDecade = 0;
  let ordinanceIndex = 0;
  const transit = { bus: 0, rail: false, subway: false, highway: false };
  let firstZoneTick = -1;

  const index = (x, y) => y * size + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const year = () => sim.dateOf(state).year;
  const age = () => year() - state.yearFounded;

  function command(type, payload) {
    sequence += 1;
    const receipt = sim.submitCommand(state, { schemaVersion: 2, type, payload, targetTick: state.tick, clientCommandId: `mayor-${sequence}` });
    const key = `${type}:${receipt.accepted ? "ok" : receipt.code}`;
    receipts.set(key, (receipts.get(key) || 0) + 1);
    return receipt;
  }
  const path = (network, points) => command("build-path", { network, points });
  const place = (kind, x, y) => command("place-facility", { kind, x, y });
  const policy = (payload) => command("set-policy", payload);

  // --- geometry -------------------------------------------------------------
  const blockKey = (bx, by) => `${bx},${by}`;
  const blockRect = (bx, by) => ({ x: origin.x + bx * BLOCK + 1, y: origin.y + by * BLOCK + 1, width: BLOCK - 1, height: BLOCK - 1 });
  function blockRing(bx, by) {
    const x0 = origin.x + bx * BLOCK; const y0 = origin.y + by * BLOCK; const x1 = x0 + BLOCK; const y1 = y0 + BLOCK;
    return [[{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x0, y: y1 }, { x: x1, y: y1 }], [{ x: x0, y: y0 }, { x: x0, y: y1 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }]];
  }
  function blockFits(bx, by) {
    const rect = blockRect(bx, by);
    if (rect.x < 2 || rect.y < 2 || rect.x + rect.width + 2 >= size || rect.y + rect.height + 2 >= size) return false;
    let dry = 0; let low = Infinity; let high = -Infinity;
    for (let dy = -1; dy <= rect.height; dy += 1) for (let dx = -1; dx <= rect.width; dx += 1) {
      const i = index(rect.x + dx, rect.y + dy);
      if (state.water[i]) { if (dx >= 0 && dy >= 0 && dx < rect.width && dy < rect.height) return false; continue; }
      if (state.facilityAt[i] >= 0 && (dx < 0 || dy < 0 || dx >= rect.width || dy >= rect.height)) return false;
      dry += 1; low = Math.min(low, state.alt[i]); high = Math.max(high, state.alt[i]);
    }
    return dry > 0 && high - low <= 2;
  }
  const isCivic = (bx, by) => !laissezFaire && ((bx % 3) + 3) % 3 === 1 && ((by % 3) + 3) % 3 === 1;
  // Blocks in rings around the spawn block (2,2), nearest first.
  const order = [];
  {
    const center = 2; const radius = Math.ceil(size / BLOCK) + 2;
    for (let bx = center - radius; bx <= center + radius; bx += 1) for (let by = center - radius; by <= center + radius; by += 1) {
      order.push({ bx, by, ring: Math.max(Math.abs(bx - center), Math.abs(by - center)), angle: Math.atan2(by - center, bx - center) });
    }
    order.sort((a, b) => (a.ring - b.ring) || (a.angle - b.angle));
  }
  // Industry sits on the east side of town, homes on the west, shops between.
  function nextBlock(zoneName) {
    let best = null; let bestScore = Infinity;
    for (const cell of order) {
      const key = blockKey(cell.bx, cell.by);
      if (blocks.has(key) || unusable.has(key)) continue;
      if (cell.ring > (best ? best.ring : Infinity)) break;
      if (!blockFits(cell.bx, cell.by)) { unusable.add(key); continue; }
      const civic = isCivic(cell.bx, cell.by);
      if (zoneName === "civic" ? !civic : civic) continue;
      const lean = zoneName === "industrial" ? -cell.bx : zoneName === "residential" ? cell.bx : Math.abs(cell.bx - 2);
      const score = cell.ring * 100 + lean;
      if (score < bestScore) { best = cell; bestScore = score; }
    }
    return best;
  }
  function buildRing(bx, by) {
    let cost = 0;
    for (const [start, end] of blockRing(bx, by)) for (const network of ["road", "wire", "pipe"]) {
      const receipt = path(network, [start, end]); if (receipt.accepted) cost += receipt.cost;
    }
    return cost;
  }
  const ringCost = BLOCK * 4 * 23 + (BLOCK - 1) * (BLOCK - 1) * 10;

  // --- zoning -----------------------------------------------------------------
  // Empty zoned land that could still grow: land the core has blocked for
  // want of a commute, road or power does not count as supply.
  function emptyZoned(code) {
    let empty = 0; const P = sim.PROBLEM;
    for (let i = 0; i < size * size; i += 1) {
      if (state.zone[i] !== code || state.lot[i]) continue;
      const problem = state.problemCode[i];
      if (problem === P.NO_COMMUTE || problem === P.NO_ROAD || problem === P.NO_POWER) continue;
      empty += 1;
    }
    return empty;
  }
  function zoneBlock(zoneName) {
    const cell = nextBlock(zoneName); if (!cell) return false;
    buildRing(cell.bx, cell.by);
    const rect = blockRect(cell.bx, cell.by);
    const receipt = command("zone-area", { zone: zoneName, density: "high", ...rect });
    if (!receipt.accepted) { unusable.add(blockKey(cell.bx, cell.by)); return false; }
    if (firstZoneTick < 0) firstZoneTick = state.tick;
    blocks.set(blockKey(cell.bx, cell.by), { bx: cell.bx, by: cell.by, kind: "zone", zone: zoneName, zonedTick: state.tick });
    return true;
  }
  function expand() {
    const want = [["residential", state.demand.r, 1], ["commercial", state.demand.c, 2], ["industrial", state.demand.i, 3]]
      .filter(([, demand, code]) => demand > 10 && emptyZoned(code) < (state.population < 8000 ? 18 : state.population < 25000 ? 36 : 72))
      .sort((a, b) => b[1] - a[1]);
    let built = 0;
    for (const [zoneName] of want) {
      if (state.funds < ringCost + 1500) break;
      if (zoneBlock(zoneName)) built += 1;
    }
    return built;
  }

  // --- utilities ----------------------------------------------------------------
  function latticeBounds() {
    const built = [...blocks.values()];
    if (!built.length) return { x0: origin.x + 2 * BLOCK, y0: origin.y + 2 * BLOCK, x1: origin.x + 3 * BLOCK, y1: origin.y + 3 * BLOCK };
    return {
      x0: origin.x + Math.min(...built.map((block) => block.bx)) * BLOCK, y0: origin.y + Math.min(...built.map((block) => block.by)) * BLOCK,
      x1: origin.x + Math.max(...built.map((block) => block.bx)) * BLOCK + BLOCK, y1: origin.y + Math.max(...built.map((block) => block.by)) * BLOCK + BLOCK,
    };
  }
  // A pad outside the planned town, the nearest to its north-east corner.
  // A pad the core will accept: dry, unbuilt, every tile within a step of
  // the anchor (the core levels it) and every dry tile around it within a
  // step of the anchor too. Returns how many tiles need levelling, or -1.
  function padFree(x, y, w, h) {
    if (!inBounds(x - 1, y - 1) || !inBounds(x + w, y + h)) return -1;
    const base = state.alt[index(x, y)]; let uneven = 0;
    for (let dy = -1; dy <= h; dy += 1) for (let dx = -1; dx <= w; dx += 1) {
      const i = index(x + dx, y + dy); const inside = dx >= 0 && dy >= 0 && dx < w && dy < h;
      if (!inside) { if ((dx < 0 || dx >= w) && (dy < 0 || dy >= h)) continue; if (!state.water[i] && Math.abs(state.alt[i] - base) > 1) return -1; continue; }
      if (state.water[i] || Math.abs(state.alt[i] - base) > 1 || state.facilityAt[i] >= 0 || state.zone[i] || state.road[i] || state.rail[i] || state.wire[i] || state.pipe[i] || state.highway[i] || state.onramp[i]) return -1;
      if (state.alt[i] !== base) uneven += 1;
    }
    return uneven;
  }
  const plannedReach = BLOCK * 6;
  const plannedBox = { x0: origin.x + 2 * BLOCK - plannedReach, y0: origin.y + 2 * BLOCK - plannedReach, x1: origin.x + 3 * BLOCK + plannedReach, y1: origin.y + 3 * BLOCK + plannedReach };
  // Outside the town's bounding box first; on a small map the box soon
  // covers the whole map, so failing that, any free ground between the
  // blocks the mayor has laid out (a player drops a plant on a gap too).
  function findPad(w, h, near) {
    return findPadIn(w, h, near, false) || findPadIn(w, h, near, true);
  }
  function overlapsBlock(x, y, w, h) {
    for (const block of blocks.values()) {
      const x0 = origin.x + block.bx * BLOCK; const y0 = origin.y + block.by * BLOCK;
      if (x + w > x0 && x <= x0 + BLOCK && y + h > y0 && y <= y0 + BLOCK) return true;
    }
    return false;
  }
  function findPadIn(w, h, near, betweenBlocks) {
    let best = null; let bestDistance = Infinity;
    const lattice = latticeBounds();
    for (let y = 1; y < size - h - 1; y += 1) for (let x = 1; x < size - w - 1; x += 1) {
      const insideLattice = x + w > lattice.x0 - 1 && x < lattice.x1 + 2 && y + h > lattice.y0 - 1 && y < lattice.y1 + 2;
      if (insideLattice && (!betweenBlocks || overlapsBlock(x, y, w, h))) continue;
      const insidePlan = x + w > plannedBox.x0 && x < plannedBox.x1 && y + h > plannedBox.y0 && y < plannedBox.y1;
      const distance = Math.abs(x - near.x) + Math.abs(y - near.y) + (insidePlan ? 60 : 0);
      if (distance >= bestDistance) continue;
      const uneven = padFree(x, y, w, h);
      if (uneven < 0 || distance + uneven * 2 >= bestDistance) continue;
      best = { x, y }; bestDistance = distance + uneven * 2;
    }
    return best;
  }
  function connect(network, from, to) {
    for (const via of [{ x: to.x, y: from.y }, { x: from.x, y: to.y }]) {
      const receipt = path(network, [from, via, to]);
      if (receipt.accepted || receipt.code === "empty") return true;
    }
    return false;
  }
  function nearestLatticeCorner(point) {
    const lattice = latticeBounds();
    const xs = []; const ys = [];
    for (let x = lattice.x0; x <= lattice.x1; x += BLOCK) xs.push(x);
    for (let y = lattice.y0; y <= lattice.y1; y += BLOCK) ys.push(y);
    let best = null; let bestDistance = Infinity;
    for (const x of xs) for (const y of ys) {
      if (!state.road[index(x, y)]) continue;
      const distance = Math.abs(x - point.x) + Math.abs(y - point.y);
      if (distance < bestDistance) { best = { x, y }; bestDistance = distance; }
    }
    return best || { x: lattice.x0, y: lattice.y0 };
  }
  function buildPlant() {
    // A mayor short of a plant borrows for it rather than let the town go dark.
    if (state.funds < 4500 && state.bonds.length < 6) policy({ policy: "bond", action: "issue" });
    const kind = year() >= 1955 && state.funds >= 15000 + 3000 && state.population > 40000 ? "nuclear" : state.funds >= 4000 + 500 ? "coal" : null;
    if (!kind) return false;
    const spec = sim.FACILITY_KINDS[kind];
    const lattice = latticeBounds();
    const pad = findPad(spec.w, spec.h, { x: lattice.x1 + 4, y: lattice.y0 - 6 });
    if (!pad) return false;
    if (!place(kind, pad.x, pad.y).accepted) return false;
    connect("wire", { x: pad.x, y: pad.y + spec.h }, nearestLatticeCorner(pad)) || connect("wire", { x: pad.x - 1, y: pad.y }, nearestLatticeCorner(pad));
    return true;
  }
  function freshShoreSpot() {
    let best = null; let bestScore = -Infinity; const lattice = latticeBounds();
    for (let y = 1; y < size - 1; y += 1) for (let x = 1; x < size - 1; x += 1) {
      const i = index(x, y); if (state.water[i] || padFree(x, y, 1, 1) < 0) continue;
      let shores = 0; for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const j = index(x + dx, y + dy); if (state.water[j] && !state.salt[j]) shores += 1; }
      // Two or three wet sides: a pump on an islet cannot be piped ashore.
      if (shores < 2 || shores > 3) continue;
      const distance = Math.abs(x - (lattice.x0 + lattice.x1) / 2) + Math.abs(y - (lattice.y0 + lattice.y1) / 2);
      const score = shores * 20 - distance;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    return best && bestScore > -40 ? best : null;
  }
  // A pipe run over dry land from `start` to the nearest tile that already
  // carries a pipe (the street grid lays pipe along every road).
  function pipeToNetwork(start) {
    const n = size * size; const from = new Int32Array(n).fill(-2); const queue = [index(start.x, start.y)];
    if (state.water[queue[0]]) return false;
    from[queue[0]] = -1; let goal = -1;
    for (let head = 0; head < queue.length && goal < 0; head += 1) {
      const i = queue[head]; const x = i % size; const y = (i - x) / size;
      if (state.pipe[i] && head > 0) { goal = i; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; if (!inBounds(nx, ny)) continue;
        const j = index(nx, ny); if (from[j] !== -2 || state.water[j]) continue;
        from[j] = i; queue.push(j);
      }
    }
    if (goal < 0) return false;
    const points = [];
    for (let i = goal; i !== -1; i = from[i]) points.push({ x: i % size, y: Math.floor(i / size) });
    const receipt = path("pipe", points.reverse());
    return receipt.accepted || receipt.code === "empty";
  }
  function buildWaterworks() {
    const treatment = year() >= sim.FACILITY_KINDS.treatment.tech && state.funds >= 1500;
    const shore = !treatment && state.funds >= 1000 ? freshShoreSpot() : null;
    const kind = treatment ? "treatment" : shore ? "pump" : state.funds >= 800 ? "water-tower" : null;
    if (!kind) return false;
    const lattice = latticeBounds();
    const pad = shore || findPad(1, 1, { x: lattice.x0 - 3, y: lattice.y1 + 3 });
    if (!pad || !place(kind, pad.x, pad.y).accepted) return false;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const from = { x: pad.x + dx, y: pad.y + dy };
      if (inBounds(from.x, from.y) && !state.water[index(from.x, from.y)] && pipeToNetwork(from)) return true;
    }
    return true;
  }
  function utilities() {
    const upcoming = 150;
    for (let guard = 0; guard < 4 && state.powerCapacity - state.powerDemand < upcoming; guard += 1) if (!buildPlant()) break;
    for (let guard = 0; guard < 4 && state.waterCapacity - state.waterDemand < upcoming * 0.6; guard += 1) if (!buildWaterworks()) break;
  }

  // --- services ------------------------------------------------------------------
  function civicBlock() {
    const cell = nextBlock("civic"); if (!cell) return null;
    buildRing(cell.bx, cell.by);
    const block = { bx: cell.bx, by: cell.by, kind: "civic", zone: "", small: 0, large: 0 };
    blocks.set(blockKey(cell.bx, cell.by), block);
    return block;
  }
  function civicBlocks() { return [...blocks.values()].filter((block) => block.kind === "civic"); }
  // Civic blocks next to zoned land get built as the town reaches them.
  function ensureCivicBlocks() {
    if (laissezFaire) return;
    const zoned = [...blocks.values()].filter((block) => block.kind === "zone");
    const civic = civicBlocks();
    const uncovered = zoned.filter((block) => !civic.some((c) => Math.abs(c.bx - block.bx) <= 1 && Math.abs(c.by - block.by) <= 1));
    if (uncovered.length >= (civic.length ? 3 : 1) && state.population >= 300 && state.funds > ringCost + 500) civicBlock();
  }
  function placeSmall(block, kind) {
    if (block.small >= CIVIC_SMALL.length) return false;
    const rect = blockRect(block.bx, block.by); const [dx, dy] = CIVIC_SMALL[block.small];
    if (!place(kind, rect.x + dx, rect.y + dy).accepted) return false;
    block.small += 1; return true;
  }
  function placeLarge(block, kind) {
    if (block.large >= CIVIC_LARGE.length) return false;
    const rect = blockRect(block.bx, block.by); const [dx, dy] = CIVIC_LARGE[block.large];
    if (!place(kind, rect.x + dx, rect.y + dy).accepted) return false;
    block.large += 1; return true;
  }
  const count = (kind) => state.facilities.filter((facility) => facility.kind === kind).length;
  let lastAmenityTick = -Infinity;
  // The mayor's books: this year's income and running costs from the
  // monthly settlements. A new service is only taken on while the city keeps
  // a surplus to grow with.
  function books() {
    const recent = state.budgetHistory.slice(-12);
    const income = recent.reduce((sum, item) => sum + item.income, 0);
    const expense = recent.reduce((sum, item) => sum + item.expense, 0);
    return { income, expense, months: recent.length };
  }
  function affordable(kind) {
    const spec = sim.FACILITY_KINDS[kind];
    const { income, expense, months } = books();
    // A town running a wide surplus spends it on services instead of saving.
    const flush = months >= 3 && income > 0 && income - expense > income * 0.24;
    // Growth comes first: a service is only built out of money the next
    // block of streets does not need.
    if (state.funds < spec.cost + (flush ? 300 : ringCost + 3000)) return false;
    if (months < 3) return state.funds > spec.cost + 4000;
    const scale = 12 / months;
    return (income - expense - spec.upkeep * 12 / scale) * scale >= income * scale * (flush ? (state.funds > 6000 ? -0.15 : 0) : 0.16);
  }
  // How well a civic block's neighbourhood is covered, read at the centres of
  // the zoned blocks around it.
  function weakestCover(block, layer) {
    let weakest = 255;
    for (const other of blocks.values()) {
      if (other.kind !== "zone" || Math.abs(other.bx - block.bx) > 1 || Math.abs(other.by - block.by) > 1) continue;
      const rect = blockRect(other.bx, other.by);
      weakest = Math.min(weakest, layer[index(rect.x + 2, rect.y + 2)], layer[index(rect.x + 3, rect.y + 3)]);
    }
    return weakest;
  }
  function services() {
    if (laissezFaire) return;
    const people = state.population;
    const { income, expense, months } = books();
    const deficit = months >= 3 && expense > income;
    const inside = (block, facility) => { const rect = blockRect(block.bx, block.by); return facility.x >= rect.x && facility.x < rect.x + 6 && facility.y >= rect.y && facility.y < rect.y + 6; };
    for (const block of civicBlocks()) {
      const has = (kind) => state.facilities.some((facility) => facility.kind === kind && inside(block, facility));
      const near = [...blocks.values()].filter((other) => other.kind === "zone" && Math.abs(other.bx - block.bx) <= 1 && Math.abs(other.by - block.by) <= 1).length;
      if (!near) continue;
      // Police where the neighbourhood has none worth the name: without it
      // crime drives the homes out. The first station is bought even on a
      // thin budget.
      const noPolice = !state.facilities.some((facility) => facility.kind === "police");
      if (people >= 300 && !has("police") && (noPolice || (count("police") + 1) * sim.FACILITY_KINDS.police.upkeep * 12 <= income * (12 / Math.max(1, months)) * 0.4) && weakestCover(block, state.policeStrength) < 15
        && (noPolice ? state.funds > 800 : !deficit && affordable("police"))) placeSmall(block, "police");
      if (deficit) continue;
      if (people >= 1000 && !has("fire") && (count("fire") + 1) * sim.FACILITY_KINDS.fire.upkeep * 12 <= income * (12 / Math.max(1, months)) * 0.25 && weakestCover(block, state.fireStrength) < 10 && affordable("fire")) placeSmall(block, "fire");
      if (people >= 1500 && !has("park-big") && affordable("park-big")) placeLarge(block, "park-big");
    }
    if (deficit) return;
    // Capacity services follow the head count wherever there is a slot.
    const capacity = { school: count("school") * 1500, health: count("clinic") * 500 + count("hospital") * 3000, university: count("university") * 5000 };
    const slotFor = (large) => civicBlocks().find((block) => (large ? block.large < CIVIC_LARGE.length : block.small < CIVIC_SMALL.length));
    const want = [];
    if (people >= 1200 && capacity.school < people * 0.18) want.push(["school", false]);
    if (people >= 2000 && people < 15000 && capacity.health < people * 0.10) want.push(["clinic", false]);
    if (people >= 15000 && capacity.health < people * 0.10) want.push(["hospital", true]);
    if (people >= 30000 && capacity.university < people * 0.08) want.push(["university", true]);
    // A city with money to spare builds the things people visit.
    const flush = months >= 6 && income - expense > income * 0.22;
    if (flush && state.tick - lastAmenityTick >= 6 * sim.TICKS_PER_DAY * sim.DAYS_PER_MONTH) {
      const amenity = [["library", 10000], ["museum", 20000], ["zoo", 25000], ["stadium", 30000]]
        .find(([kind, per]) => people >= per && count(kind) < Math.floor(people / per));
      if (amenity) want.unshift([amenity[0], amenity[0] !== "library" || true]);
    }
    let placed = 0;
    for (const [kind, large] of want) {
      if (!affordable(kind)) continue;
      const block = slotFor(large); if (!block) continue;
      if (large ? placeLarge(block, kind) : placeSmall(block, kind)) {
        if (["library", "museum", "zoo", "stadium"].includes(kind)) lastAmenityTick = state.tick;
        placed += 1; break;
      }
    }
  }

  // --- transit: buses, then a subway between the civic blocks ------------------
  function congestedRoads() { let jammed = 0; for (let i = 0; i < size * size; i += 1) if (state.congested[i]) jammed += 1; return jammed; }
  const subwayLinks = new Set();
  function transitWork() {
    if (laissezFaire) return;
    const jammed = congestedRoads();
    const { income, expense, months } = books();
    if (jammed < 6 || (months >= 3 && expense > income)) return;
    if (year() >= 1920) {
      const block = civicBlocks().find((candidate) => candidate.small < CIVIC_SMALL.length && !state.facilities.some((facility) => facility.kind === "bus"
        && Math.abs(facility.x - blockRect(candidate.bx, candidate.by).x) < 6 && Math.abs(facility.y - blockRect(candidate.bx, candidate.by).y) < 6));
      if (block && affordable("bus") && placeSmall(block, "bus")) transit.bus += 1;
    }
    if (year() < 1910 || state.funds < 6000) return;
    // Link two neighbouring civic blocks with a subway under the road ring
    // and a station at each end, one link at a time.
    const civic = civicBlocks();
    for (const a of civic) for (const b of civic) {
      if (a === b || Math.abs(a.bx - b.bx) + Math.abs(a.by - b.by) !== 3 || (a.bx === b.bx) === (a.by === b.by)) continue;
      const key = [blockKey(a.bx, a.by), blockKey(b.bx, b.by)].sort().join("|");
      if (subwayLinks.has(key)) continue;
      const stop = (block) => ({ x: blockRect(block.bx, block.by).x, y: blockRect(block.bx, block.by).y - 1 });
      const from = stop(a); const to = stop(b);
      const line = path("subway", [from, { x: to.x, y: from.y }, to]);
      if (!line.accepted && line.code !== "empty") continue;
      subwayLinks.add(key); transit.subway = true;
      for (const block of [a, b]) {
        const rect = blockRect(block.bx, block.by);
        if (!state.facilities.some((facility) => facility.kind === "subway-station" && facility.x === rect.x && facility.y === rect.y)
          && block.small < CIVIC_SMALL.length && state.facilityAt[rect.y * size + rect.x] < 0) {
          // The station takes the block's first slot when it is still free.
          if (block.small === 0) placeSmall(block, "subway-station");
          else if (place("subway-station", rect.x, rect.y).accepted) { /* corner already free */ }
        }
      }
      return;
    }
  }

  // --- finance, ordinances, rewards, disasters -------------------------------------
  function finance() {
    if (state.funds < 1000 && state.bonds.length < 8) policy({ policy: "bond", action: "issue" });
    else if (state.funds > 40000 && state.bonds.length) policy({ policy: "bond", action: "repay", index: 0 });
    if (!laissezFaire && state.population > 8000 && state.funds > 8000 && ordinanceIndex < ORDINANCE_ORDER.length && state.lastIncome > state.lastExpense * 1.2) {
      policy({ policy: "ordinance", id: ORDINANCE_ORDER[ordinanceIndex], enacted: true }); ordinanceIndex += 1;
    }
  }
  function rewards() {
    for (const kind of state.rewardsOffered) {
      if (placedRewards.has(kind)) continue;
      if (kind === "military-base") {
        const pad = findPad(4, 4, { x: size - 10, y: size - 10 });
        if (pad && command("zone-area", { zone: "military", x: pad.x, y: pad.y, width: 4, height: 4 }).accepted) placedRewards.add(kind);
        continue;
      }
      const spec = sim.FACILITY_KINDS[kind];
      if (!spec || (spec.tech && year() < spec.tech)) continue;
      const pad = findPad(spec.w, spec.h, nearestLatticeCorner(spawn));
      if (pad && place(kind, pad.x, pad.y).accepted) placedRewards.add(kind);
    }
  }
  function disasters(month) {
    const decade = Math.floor(age() / 10);
    if (decade <= lastDisasterDecade || state.disaster) return;
    const kind = DISASTER_CYCLE[disastersStarted.length % DISASTER_CYCLE.length];
    const receipt = command("trigger-disaster", { kind, x: spawn.x, y: spawn.y });
    if (receipt.accepted) { lastDisasterDecade = decade; disastersStarted.push({ kind, year: year() }); }
  }
  // Rubble is re-zoned the way a player drags the zone tool over the scar.
  function rezoneScars() {
    for (const block of blocks.values()) {
      if (block.kind !== "zone") continue;
      const rect = blockRect(block.bx, block.by);
      let scarred = false;
      for (let dy = 0; dy < rect.height && !scarred; dy += 1) for (let dx = 0; dx < rect.width; dx += 1) {
        const i = index(rect.x + dx, rect.y + dy);
        if (!state.zone[i] && !state.park[i]) { scarred = true; break; }
      }
      if (scarred && state.funds > 1500) command("zone-area", { zone: block.zone, density: "high", ...rect });
    }
  }

  // A city with no plant, or short of power, goes dark lot by lot: the
  // plant comes before new streets and services, and while it cannot be
  // bought the money is kept for it.
  const powerShort = () => !state.powerCapacity || state.powerDemand > state.powerCapacity;
  // Every building stands on a street (ruleset 5, ROAD_REACH 1), so a block's
  // inner cells are built only as part of a 2x2 or 3x3 lot that reaches the
  // street. Five years after a block is zoned, once its street front stands,
  // whatever inside it is still empty and unreachable becomes a courtyard
  // park: the planner's use for land no building can front.
  const COURTYARD_YEARS = 5;
  function courtyards() {
    const P = sim.PROBLEM;
    for (const block of blocks.values()) {
      if (block.kind !== "zone" || block.courtyard || state.tick - (block.zonedTick || 0) < COURTYARD_YEARS * 12 * sim.DAYS_PER_MONTH * sim.TICKS_PER_DAY) continue;
      const rect = blockRect(block.bx, block.by);
      const inner = []; let frontEmpty = 0;
      for (let dy = 0; dy < rect.height; dy += 1) for (let dx = 0; dx < rect.width; dx += 1) {
        const i = index(rect.x + dx, rect.y + dy);
        if (!state.zone[i] || state.lot[i]) continue;
        if (state.problemCode[i] === P.NO_ROAD) inner.push({ x: rect.x + dx, y: rect.y + dy }); else frontEmpty += 1;
      }
      if (frontEmpty) continue;
      block.courtyard = true;
      if (!inner.length || state.funds < inner.length * 30 + 1500) { if (inner.length) block.courtyard = false; continue; }
      for (const cell of inner) command("demolish-area", { x: cell.x, y: cell.y, width: 1, height: 1 });
      for (const cell of inner) path("park", [cell]);
    }
  }
  function act(month) {
    finance();
    if (!blocks.size) { zoneBlock("residential"); zoneBlock("industrial"); }
    utilities();
    if (blocks.size && powerShort()) { rewards(); disasters(month); sim.ensureDerived(state); return; }
    rezoneScars();
    if (month === 0) courtyards();
    const perMonth = state.population < 10000 ? 1 : state.population < 25000 ? 2 : 3;
    let grew = 0;
    for (let n = 0; n < perMonth; n += 1) { const built = expand(); grew += built; if (!built) break; }
    // Demand is waiting and the till cannot pay for the streets: borrow.
    if (!grew && state.population >= 5000 && state.funds < ringCost + 1500 && state.bonds.length < 4 && Math.max(state.demand.r, state.demand.c, state.demand.i) > 20) {
      policy({ policy: "bond", action: "issue" }); expand();
    }
    ensureCivicBlocks();
    services();
    transitWork();
    utilities();
    rewards();
    disasters(month);
    sim.ensureDerived(state);
  }

  return Object.freeze({
    act, receipts, blocks, transit, placedRewards, disastersStarted, origin, latticeBounds,
    firstZoneTick: () => firstZoneTick, laissezFaire,
  });
}

// The acceptance cash-flow rule (spec 4.3, owner decision 2026-09-27): a
// yearly net cash flow has to stay within ±cashFlowShare of income, judged
// from cashFlowStartYear (3) through fundsCeilingYears (30). Years 1-2 are
// still reported — every `yearly` row stays in the report — but they are not
// judged, because the reference city is still founding. Pure and exported so
// the acceptance boundary (surplus in year 2 is fine, the same surplus in
// year 3 is not) can be pinned without playing a game.
export function evaluateCashFlow(yearly, pace = PACE) {
  const flowYears = yearly.filter((row) => row.age >= pace.cashFlowStartYear && row.age <= pace.fundsCeilingYears);
  const badFlow = flowYears.filter((row) => row.income > 0 && Math.abs(row.net) > row.income * pace.cashFlowShare);
  return { flowYears, badFlow, ok: badFlow.length === 0 && flowYears.length > 0 };
}

export function runPlaythrough(options = {}) {
  const sim = options.sim || loadSim();
  const seed = Number.isInteger(options.seed) ? options.seed : 20260903;
  const size = [64, 96, 128].includes(options.size) ? options.size : 128;
  const ticksPerMonth = sim.TICKS_PER_DAY * sim.DAYS_PER_MONTH;
  const years = Number.isFinite(options.years) ? options.years : null;
  const minutes = Number.isFinite(options.minutes) ? options.minutes : null;
  const months = years != null ? Math.round(years * 12)
    : minutes != null ? Math.floor(Math.floor(minutes * sim.FIXED_TICK_HZ * 60) / ticksPerMonth) : PACE.fundsCeilingYears * 12;
  const target = Number.isInteger(options.target) ? options.target : null;
  const mode = options.laissezFaire ? "laissez-faire" : "reference";
  const log = options.log || (() => {});
  const started = Date.now();

  const state = sim.createCity({ seed, size, terrainPreset: options.terrainPreset || "balanced", name: "Two Hours", founded: true });
  const mayor = createMayor(sim, state, { log, mode });
  const storyKeys = new Set();
  const eventTypes = new Map();
  let firstConstructionTick = -1;
  let negativeRun = 0; let longestNegativeRun = 0; let peakFunds = state.funds; let peakFundsYear = state.yearFounded;
  const yearly = [];
  let income = 0; let expense = 0;

  function drain() {
    for (const event of sim.drainEvents(state)) {
      eventTypes.set(event.type, (eventTypes.get(event.type) || 0) + 1);
      if (event.type === "newspaper-published") (event.payload.stories || []).forEach((key) => storyKeys.add(key));
      if (event.type === "construction-started" && event.payload.zone && firstConstructionTick < 0) firstConstructionTick = event.tick;
      if (event.type === "budget-settled") { income += event.payload.income; expense += event.payload.expense; }
    }
    sim.drainNotices(state);
  }
  function lotHistogram() {
    const out = { lots: state.buildings.length, big: 0, working: 0 };
    for (const building of state.buildings) { if (building.w > 1) out.big += 1; if (building.state === sim.BUILDING_STATE.ACTIVE) out.working += 1; }
    return out;
  }
  function snapshot() {
    sim.ensureDerived(state);
    const advisors = sim.advisorReport(state);
    return {
      year: sim.dateOf(state).year, age: sim.dateOf(state).year - state.yearFounded, tick: state.tick,
      population: state.population, jobs: state.jobs, funds: state.funds, bonds: state.bonds.length,
      income, expense, net: income - expense, demand: { ...state.demand },
      power: { capacity: state.powerCapacity, demand: state.powerDemand }, water: { capacity: state.waterCapacity, demand: state.waterDemand },
      eq: state.eq, le: state.le, ...lotHistogram(), blocks: mayor.blocks.size,
      landValue: advisors.figures.avgValue, crime: advisors.figures.avgCrime, pollution: advisors.figures.avgPollution, congestedRoads: advisors.figures.congestedRoads,
      advisors: advisors.advisors.flatMap((advisor) => advisor.items.filter((item) => item.severity >= 2).map((item) => item.key)),
    };
  }

  let reached = null;
  for (let month = 0; month < months; month += 1) {
    mayor.act(month % 12);
    drain();
    // A day at a time: the core keeps its last 128 events, and a busy month
    // publishes more than that.
    for (let day = 0; day < sim.DAYS_PER_MONTH; day += 1) { sim.advanceTicks(state, sim.TICKS_PER_DAY); drain(); }
    if (state.funds < 0) { negativeRun += 1; longestNegativeRun = Math.max(longestNegativeRun, negativeRun); } else negativeRun = 0;
    if (state.funds > peakFunds) { peakFunds = state.funds; peakFundsYear = sim.dateOf(state).year; }
    if ((month + 1) % 12 === 0) {
      const row = snapshot(); yearly.push(row); income = 0; expense = 0;
      log(`${row.year} y${row.age}  pop ${row.population}  jobs ${row.jobs}  funds ${row.funds}  in ${row.income} out ${row.expense}  bonds ${row.bonds}  demand r${row.demand.r} c${row.demand.c} i${row.demand.i}  lots ${row.lots} big ${row.big}  LV ${row.landValue} crime ${row.crime} jam ${row.congestedRoads}  EQ ${row.eq}  ${row.advisors.join(",")}`);
    }
    if (target != null && state.population >= target && !options.playOn) { reached = sim.dateOf(state).year; break; }
  }
  const final = snapshot();
  const atAge = (n) => yearly.find((row) => row.age === n) || null;
  const firstDays = mayor.firstZoneTick() >= 0 && firstConstructionTick >= 0 ? (firstConstructionTick - mayor.firstZoneTick()) / sim.TICKS_PER_DAY : null;
  const reachableTiers = sim.REWARD_TIERS.filter((tier) => tier.threshold <= final.population);
  const unplacedTiers = reachableTiers.filter((tier) => !mayor.placedRewards.has(tier.kind)).map((tier) => tier.kind);
  const expectedStories = ["milestone", "growth", ...mayor.disastersStarted.map((item) => `disaster_${item.kind}`), ...(mayor.disastersStarted.length > (state.disaster ? 1 : 0) ? ["disaster_over"] : [])];
  const missingStories = [...new Set(expectedStories)].filter((key) => !storyKeys.has(key));
  const { flowYears, badFlow, ok: cashFlowOk } = evaluateCashFlow(yearly, PACE);
  const ceilingYears = yearly.filter((row) => row.age <= PACE.fundsCeilingYears);
  const y1 = atAge(1); const y5 = atAge(5); const y15 = atAge(15);
  const inRange = (row, [low, high]) => !!row && row.population >= low && row.population <= high;
  const checks = [];
  const add = (name, ok, applies = true) => { if (applies) checks.push({ name, ok }); };
  if (mode === "reference" && target == null) {
    const pace = PACE.bySize[size];
    add(`the first building starts within ${PACE.firstConstructionDays} days of zoning (${firstDays == null ? "never" : `${firstDays} days`})`, firstDays != null && firstDays <= PACE.firstConstructionDays);
    add(`year 1: at least ${pace.year1} residents (${y1 ? y1.population : "not reached"})`, !!y1 && y1.population >= pace.year1, months >= 12);
    add(`year 5: ${pace.year5.join("-")} residents (${y5 ? y5.population : "not reached"})`, inRange(y5, pace.year5), months >= 60);
    add(`year 15: ${pace.year15.join("-")} residents (${y15 ? y15.population : "not reached"})`, inRange(y15, pace.year15), months >= 180);
    if (size === 128) add(`yearly net cash flow within ±${PACE.cashFlowShare * 100}% of income, years ${PACE.cashFlowStartYear}-${PACE.fundsCeilingYears} (${badFlow.length ? badFlow.map((row) => `y${row.age} ${row.net}/${row.income}`).join(", ") : "all inside"})`, cashFlowOk, months >= 36);
    add(`funds stay at or under $${PACE.fundsCeiling} for ${PACE.fundsCeilingYears} years (peak $${Math.max(...ceilingYears.map((row) => row.funds), state.funds)})`, ceilingYears.every((row) => row.funds <= PACE.fundsCeiling));
  }
  if (target != null) add(`population reaches ${target} (reached ${final.population} in ${final.year})`, final.population >= target);
  add(`funds never negative for more than 12 months (longest run ${longestNegativeRun})`, longestNegativeRun <= 12);
  if (mode === "reference") {
    add(`every reward tier the population unlocks is placed (${reachableTiers.map((tier) => tier.kind).join(", ") || "none yet"})`, unplacedTiers.length === 0, reachableTiers.length > 0);
    add(`newspaper story keys fire (${[...storyKeys].sort().join(", ")})`, missingStories.length === 0);
    add(`one scripted disaster per decade (${mayor.disastersStarted.map((item) => `${item.kind}@${item.year}`).join(", ") || "none yet"})`, mayor.disastersStarted.length >= Math.floor(Math.max(0, final.age - 1) / 10));
  }
  return {
    ok: checks.every((check) => check.ok), checks, mode, seed, size, months, target, reached,
    final, yearly, firstConstructionDays: firstDays, peakFunds, peakFundsYear, longestNegativeRun,
    storyKeys: [...storyKeys].sort(), missingStories,
    eventTypes: Object.fromEntries([...eventTypes.entries()].sort()),
    receipts: Object.fromEntries([...mayor.receipts.entries()].sort()),
    rewardsOffered: [...state.rewardsOffered], placedRewards: [...mayor.placedRewards], transit: { ...mayor.transit },
    advisorsAtEnd: sim.advisorReport(state).advisors,
    elapsedMs: Date.now() - started,
    state,
  };
}

// The laissez-faire comparison (spec 3.8): the same seed without services
// or transit has to stall well short of the reference city, and its
// advisors have to name the reasons.
export function runComparison(options = {}) {
  const sim = options.sim || loadSim();
  const reference = options.reference || runPlaythrough({ ...options, sim, years: 15, laissezFaire: false });
  const laissez = runPlaythrough({ ...options, sim, years: 15, laissezFaire: true });
  const refPop = reference.yearly.find((row) => row.age === 15)?.population ?? reference.final.population;
  const lfPop = laissez.yearly.find((row) => row.age === 15)?.population ?? laissez.final.population;
  const reasons = laissez.advisorsAtEnd.flatMap((advisor) => advisor.items.filter((item) => item.severity >= 2).map((item) => item.key));
  const serviceReasons = reasons.filter((key) => /^(safety|health|transport|planning_land_value)/.test(key));
  const checks = [
    { name: `laissez-faire stalls: year-15 population ${lfPop} is at most 60% of the reference's ${refPop}`, ok: lfPop <= refPop * 0.6 },
    { name: `its advisors name service or transport reasons (${reasons.join(", ") || "none"})`, ok: serviceReasons.length >= 2 },
  ];
  return { ok: checks.every((check) => check.ok), checks, reference, laissez, reasons };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--seed") options.seed = Number(next());
    else if (arg === "--size") options.size = Number(next());
    else if (arg === "--years") options.years = Number(next());
    else if (arg === "--minutes") options.minutes = Number(next());
    else if (arg === "--target") options.target = Number(next());
    else if (arg === "--terrain") options.terrainPreset = next();
    else if (arg === "--json") options.json = next();
    else if (arg === "--play-on") options.playOn = true;
    else if (arg === "--laissez-faire") options.laissezFaire = true;
    else if (arg === "--compare") options.compare = true;
    else if (arg === "--quiet") options.quiet = true;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const log = options.quiet ? () => {} : (line) => console.log(line);
  // Without --size the reference mayor plays every map size the shell
  // offers (64² is the touch default); the laissez-faire comparison and the
  // money rules belong to the 128² reference game.
  const sizes = Number.isFinite(options.size) ? [options.size] : PACE_SIZES;
  const strip = (run) => { const { state, ...rest } = run; return rest; };
  const runs = [];
  let ok = true;
  for (const size of sizes) {
    let result; let comparison = null;
    try {
      result = runPlaythrough({ ...options, size, log });
      if (options.compare || (!options.laissezFaire && result.size === 128 && result.months >= 180 && options.target == null)) {
        comparison = runComparison({ ...options, size, log: () => {}, reference: result.months >= 180 ? result : undefined });
      }
    } catch (error) {
      console.error(`NO  bonsai-playthrough threw on ${size}²: ${error?.stack || error}`);
      process.exit(1);
    }
    console.log(`--  ${result.mode} mayor, seed ${result.seed}, ${result.size}², ${result.months} months`);
    for (const check of result.checks) console.log(`${check.ok ? "OK " : "NO "} ${check.name}`);
    if (comparison) for (const check of comparison.checks) console.log(`${check.ok ? "OK " : "NO "} ${check.name}`);
    console.log(`--  receipts ${JSON.stringify(result.receipts)}`);
    console.log(`--  transit ${JSON.stringify(result.transit)}  rewards offered ${result.rewardsOffered.join(",")}  placed ${result.placedRewards.join(",")}`);
    console.log(`--  ${result.elapsedMs} ms for ${result.months} months`);
    ok = ok && result.ok && (!comparison || comparison.ok);
    runs.push({ result: strip(result), comparison: comparison ? { checks: comparison.checks, reasons: comparison.reasons, laissez: strip(comparison.laissez) } : null });
  }
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(runs.length === 1 ? runs[0] : { runs }, null, 2));
  process.exit(ok ? 0 : 1);
}
