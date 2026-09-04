#!/usr/bin/env node
// Bonsai City two-hour scripted playthrough / 盆景城市两小时脚本试玩.
//
// A deterministic scripted mayor plays the headless simulation core the way a
// player does through the shell: it founds a city, lays a road lattice, zones,
// powers, waters, adds services and transit, takes bonds, passes ordinances,
// starts one disaster per decade, places every reward the city earns, and
// keeps going for the ticks two real hours at normal speed give (20 ticks a
// second, one tick a frame). It then asserts the owner's acceptance for
// 「两小时试玩不卡壳」: the population target is reached, funds never stay
// negative for more than twelve months, every reward tier the population
// unlocks is placed, the newspaper story keys fire, and nothing throws.
//
// A shortfall is a finding, not a number to adjust: the report names the
// year the growth stalled and what the core reported as the blocker.
//
// Usage: node tooling/play-bonsai-two-hours.mjs [--seed N] [--size 64|96|128]
//        [--minutes 120] [--target 50000] [--json <path>] [--quiet]
// Exit 0 when every assertion holds, 1 otherwise. No browser, no DOM.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadSim() {
  const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
  vm.runInContext(fs.readFileSync(path.join(root, "apps/desktop/app/features/bonsai-city-sim.js"), "utf8"), context);
  return context.window.AISystem6BonsaiSim;
}

const BLOCK = 4; // one 3x3 zone cell plus its shared road line
const ZONE_SHARE = Object.freeze({ residential: 0.58, commercial: 0.20, industrial: 0.22 });
const DISASTER_CYCLE = Object.freeze(["fire", "tornado", "flood", "earthquake", "monster"]);
const ORDINANCE_ORDER = Object.freeze([
  "salesTax", "incomeTax", "parkingFines", "neighborhoodWatch", "antiDrug", "proReading",
  "cprTraining", "pollutionControls", "energyConservation", "waterConservation", "juniorSports", "annualCarnival",
]);

export function createMayor(sim, state, options = {}) {
  const log = options.log || (() => {});
  const size = state.size;
  const spawn = state.spawnCenter;
  // The lattice origin sits on a road line so block (0,0) holds the spawn.
  const origin = { x: Math.max(1, spawn.x - 1 - BLOCK * 3), y: Math.max(1, spawn.y - 1 - BLOCK * 3) };
  const blocks = new Map(); // "bx,by" -> { bx, by, kind, zone }
  const unusable = new Set();
  let sequence = 0;
  const receipts = new Map();
  const transit = { subway: false, rail: false, highway: false };
  const placedRewards = new Set();
  let rewardBlocks = 0;
  let disasterIndex = 0;
  const disastersStarted = [];
  let lastDisasterDecade = -1;
  let ordinanceIndex = 0;

  const index = (x, y) => y * size + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const land = (x, y) => inBounds(x, y) && !state.water[index(x, y)];

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
  const blockRect = (bx, by) => ({ x: origin.x + bx * BLOCK + 1, y: origin.y + by * BLOCK + 1, width: 3, height: 3 });
  const blockKey = (bx, by) => `${bx},${by}`;
  function blockRing(bx, by) {
    const x0 = origin.x + bx * BLOCK; const y0 = origin.y + by * BLOCK;
    return [
      [{ x: x0, y: y0 }, { x: x0 + BLOCK, y: y0 }],
      [{ x: x0, y: y0 + BLOCK }, { x: x0 + BLOCK, y: y0 + BLOCK }],
      [{ x: x0, y: y0 }, { x: x0, y: y0 + BLOCK }],
      [{ x: x0 + BLOCK, y: y0 }, { x: x0 + BLOCK, y: y0 + BLOCK }],
    ];
  }
  function blockFits(bx, by) {
    const rect = blockRect(bx, by);
    if (rect.x < 1 || rect.y < 1 || rect.x + rect.width + 1 >= size || rect.y + rect.height + 1 >= size) return false;
    let alts = [];
    for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) {
      if (!land(rect.x + dx, rect.y + dy)) return false;
      alts.push(state.alt[index(rect.x + dx, rect.y + dy)]);
    }
    return Math.max(...alts) - Math.min(...alts) <= 1;
  }
  // Spiral order around block (3,3), the block that holds the spawn point.
  const spiral = [];
  {
    const center = 3; const radius = Math.ceil(size / BLOCK);
    for (let bx = center - radius; bx <= center + radius; bx += 1) for (let by = center - radius; by <= center + radius; by += 1) {
      spiral.push({ bx, by, ring: Math.max(Math.abs(bx - center), Math.abs(by - center)), angle: Math.atan2(by - center, bx - center) });
    }
    spiral.sort((a, b) => (a.ring - b.ring) || (a.angle - b.angle));
  }
  function nextFreeBlock() {
    for (const cell of spiral) {
      const key = blockKey(cell.bx, cell.by);
      if (blocks.has(key) || unusable.has(key)) continue;
      if (!blockFits(cell.bx, cell.by)) { unusable.add(key); continue; }
      return cell;
    }
    return null;
  }
  function buildRing(bx, by) {
    let cost = 0;
    for (const [start, end] of blockRing(bx, by)) {
      for (const network of ["road", "wire", "pipe"]) {
        const receipt = path(network, [start, end]);
        if (receipt.accepted) cost += receipt.cost;
      }
    }
    return cost;
  }
  const isCivic = (bx, by) => ((bx % 3) + 3) % 3 === 1 && ((by % 3) + 3) % 3 === 1;
  const civicKind = (bx, by) => (((Math.floor(bx / 3) + Math.floor(by / 3)) % 2) === 0 ? "services" : "transit");

  // --- zoning ---------------------------------------------------------------
  function zoneCounts() {
    const counts = { residential: 0, commercial: 0, industrial: 0 };
    for (const block of blocks.values()) if (block.zone) counts[block.zone] += 1;
    return counts;
  }
  function emptyLots(zoneName) {
    const code = { residential: 1, commercial: 2, industrial: 3 }[zoneName];
    let empty = 0;
    for (let i = 0; i < size * size; i += 1) if (state.zone[i] === code && !state.stage[i]) empty += 1;
    return empty;
  }
  function chooseZone() {
    const counts = zoneCounts();
    const total = counts.residential + counts.commercial + counts.industrial;
    const demand = { residential: state.demand.r, commercial: state.demand.c, industrial: state.demand.i };
    let best = null; let bestGap = -Infinity;
    for (const zoneName of Object.keys(ZONE_SHARE)) {
      if (demand[zoneName] <= 10 || emptyLots(zoneName) > 54) continue;
      const gap = ZONE_SHARE[zoneName] - (total ? counts[zoneName] / total : 0);
      if (gap > bestGap) { bestGap = gap; best = zoneName; }
    }
    return best;
  }
  function expandOnce() {
    const cell = nextFreeBlock();
    if (!cell) return false;
    const key = blockKey(cell.bx, cell.by);
    if (isCivic(cell.bx, cell.by)) {
      buildRing(cell.bx, cell.by);
      blocks.set(key, { bx: cell.bx, by: cell.by, kind: civicKind(cell.bx, cell.by), zone: "" });
      furnishCivic(blocks.get(key));
      return true;
    }
    const zoneName = chooseZone();
    if (!zoneName) return false;
    const rect = blockRect(cell.bx, cell.by);
    if (state.funds < 900 + 16 * 23 + 1000) return false;
    buildRing(cell.bx, cell.by);
    const receipt = command("zone-area", { zone: zoneName, density: "high", ...rect });
    if (!receipt.accepted) { unusable.add(key); return true; }
    blocks.set(key, { bx: cell.bx, by: cell.by, kind: "zone", zone: zoneName });
    return true;
  }
  // Rubble from a disaster is re-zoned the way a player drags the zone tool
  // over the scar; the core skips what still stands.
  function rezoneScars() {
    for (const block of blocks.values()) {
      if (!block.zone) continue;
      const rect = blockRect(block.bx, block.by);
      let scarred = false;
      for (let dy = 0; dy < 3 && !scarred; dy += 1) for (let dx = 0; dx < 3; dx += 1) if (!state.zone[index(rect.x + dx, rect.y + dy)]) { scarred = true; break; }
      if (scarred && state.funds > 1500) command("zone-area", { zone: block.zone, density: "high", ...rect });
    }
  }

  // --- civic blocks: services and transit -------------------------------------
  const year = () => sim.dateOf(state).year;
  function furnishCivic(block) {
    const rect = blockRect(block.bx, block.by);
    const at = (dx, dy) => ({ x: rect.x + dx, y: rect.y + dy });
    const want = block.kind === "services"
      ? [["police", 0, 0], ["fire", 2, 0], ["school", 0, 2], ["clinic", 2, 2], ["bus", 1, 0]]
      : [["bus", 1, 0], ["subway-station", 0, 1], ["station", 1, 1], ["police", 0, 0], ["fire", 0, 2]];
    for (const [kind, dx, dy] of want) {
      const spec = sim.FACILITY_KINDS[kind];
      const spot = at(dx, dy);
      if (state.facilityAt[index(spot.x, spot.y)] >= 0) continue;
      if (spec.tech && year() < spec.tech) continue;
      if (kind === "station" && !transit.rail) continue;
      if (kind === "subway-station" && !transit.subway) continue;
      if (state.funds < spec.cost + 1000) continue;
      place(kind, spot.x, spot.y);
    }
  }
  function transitBlocks() { return [...blocks.values()].filter((block) => block.kind === "transit"); }
  function buildSubway() {
    const stops = transitBlocks().slice(0, 2);
    if (stops.length < 2 || year() < sim.FACILITY_KINDS["subway-station"].tech || state.funds < 6000) return;
    const points = stops.map((block) => { const rect = blockRect(block.bx, block.by); return { x: rect.x - 1, y: rect.y + 1 }; });
    const receipt = path("subway", [points[0], { x: points[1].x, y: points[0].y }, points[1]]);
    if (receipt.accepted || receipt.code === "empty") { transit.subway = true; stops.forEach(furnishCivic); }
  }
  function buildRail() {
    const stops = transitBlocks().slice(0, 2);
    if (stops.length < 2 || state.funds < 4000) return;
    const points = stops.map((block) => { const rect = blockRect(block.bx, block.by); return { x: rect.x + 3, y: rect.y + 3 }; });
    const receipt = path("rail", [points[0], { x: points[1].x, y: points[0].y }, points[1]]);
    if (receipt.accepted || receipt.code === "empty") { transit.rail = true; stops.forEach(furnishCivic); }
  }
  function buildHighway() {
    if (state.funds < 8000) return;
    const built = [...blocks.values()];
    const minBx = Math.min(...built.map((block) => block.bx)); const maxBx = Math.max(...built.map((block) => block.bx));
    const minBy = Math.min(...built.map((block) => block.by));
    const y = origin.y + minBy * BLOCK - 6;
    if (y < 1) return;
    const x0 = origin.x + minBx * BLOCK; const x1 = origin.x + maxBx * BLOCK + BLOCK;
    const receipt = path("highway", [{ x: x0, y }, { x: x1, y }]);
    if (!receipt.accepted && receipt.code !== "empty") return;
    let onramps = 0;
    for (const bx of [minBx, maxBx]) {
      const x = origin.x + bx * BLOCK;
      path("road", [{ x, y: y + 3 }, { x, y: origin.y + minBy * BLOCK }]);
      if (path("onramp", [{ x, y: y + 2 }]).accepted) onramps += 1;
    }
    transit.highway = onramps >= 2 || state.highwayService?.onramps >= 2;
  }

  // --- utilities: plants on pads outside the lattice, wired to its corner ----
  function latticeBounds() {
    const built = [...blocks.values()];
    if (!built.length) return { x0: origin.x, y0: origin.y, x1: origin.x + BLOCK, y1: origin.y + BLOCK };
    return {
      x0: origin.x + Math.min(...built.map((block) => block.bx)) * BLOCK,
      y0: origin.y + Math.min(...built.map((block) => block.by)) * BLOCK,
      x1: origin.x + Math.max(...built.map((block) => block.bx)) * BLOCK + BLOCK,
      y1: origin.y + Math.max(...built.map((block) => block.by)) * BLOCK + BLOCK,
    };
  }
  function padFree(x, y, w, h) {
    if (!inBounds(x, y) || !inBounds(x + w - 1, y + h - 1)) return false;
    const base = state.alt[index(x, y)];
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) {
      const i = index(x + dx, y + dy);
      if (state.water[i] || state.alt[i] !== base || state.facilityAt[i] >= 0 || state.zone[i] || state.road[i] || state.rail[i] || state.wire[i] || state.pipe[i] || state.highway[i] || state.onramp[i]) return false;
    }
    return true;
  }
  // The nearest free pad at least `buffer` tiles outside the lattice; the
  // buffer keeps plant pollution off residential land.
  function findPad(w, h, buffer) {
    const bounds = latticeBounds();
    const anchor = { x: bounds.x0, y: bounds.y0 };
    let best = null; let bestDistance = Infinity;
    for (let y = 1; y < size - h; y += 1) for (let x = 1; x < size - w; x += 1) {
      const outside = x + w + buffer <= bounds.x0 || x >= bounds.x1 + buffer || y + h + buffer <= bounds.y0 || y >= bounds.y1 + buffer;
      if (!outside) continue;
      const distance = Math.abs(x - anchor.x) + Math.abs(y - anchor.y);
      if (distance >= bestDistance) continue;
      if (!padFree(x, y, w, h)) continue;
      best = { x, y }; bestDistance = distance;
    }
    return best;
  }
  function connect(network, from, to) {
    const viaX = path(network, [from, { x: to.x, y: from.y }, to]);
    if (viaX.accepted || viaX.code === "empty") return true;
    const viaY = path(network, [from, { x: from.x, y: to.y }, to]);
    return viaY.accepted || viaY.code === "empty";
  }
  function buildPlant() {
    const reserve = 1500;
    const candidates = year() >= 1955 && state.funds >= 15000 + reserve ? ["nuclear"]
      : state.funds >= 4000 + reserve ? ["coal"] : state.funds >= 100 + reserve ? ["wind"] : [];
    for (const kind of candidates) {
      const spec = sim.FACILITY_KINDS[kind];
      const pad = findPad(spec.w, spec.h, kind === "wind" ? 1 : 7);
      if (!pad) return false;
      const receipt = place(kind, pad.x, pad.y);
      if (!receipt.accepted) continue;
      const bounds = latticeBounds();
      connect("wire", { x: pad.x, y: pad.y + spec.h }, { x: bounds.x0, y: bounds.y0 }) || connect("wire", { x: pad.x + spec.w, y: pad.y }, { x: bounds.x0, y: bounds.y0 });
      return true;
    }
    return false;
  }
  function buildWaterworks() {
    const kind = year() >= sim.FACILITY_KINDS.treatment.tech ? "treatment" : "water-tower";
    const spec = sim.FACILITY_KINDS[kind];
    if (state.funds < spec.cost + 1000) return false;
    const pad = findPad(1, 1, 2);
    if (!pad) return false;
    if (!place(kind, pad.x, pad.y).accepted) return false;
    const bounds = latticeBounds();
    connect("pipe", { x: pad.x, y: pad.y + 1 }, { x: bounds.x0, y: bounds.y0 }) || connect("pipe", { x: pad.x + 1, y: pad.y }, { x: bounds.x0, y: bounds.y0 });
    return true;
  }

  // --- finance, ordinances, rewards, disasters --------------------------------
  function finance() {
    if (state.funds < 2500 && state.bonds.length < 12) policy({ policy: "bond", action: "issue" });
    else if (state.funds > 60000 && state.bonds.length) policy({ policy: "bond", action: "repay", index: 0 });
    if (state.population > 2500 && state.funds > 8000 && ordinanceIndex < ORDINANCE_ORDER.length) {
      const id = ORDINANCE_ORDER[ordinanceIndex];
      ordinanceIndex += 1;
      policy({ policy: "ordinance", id, enacted: true });
    }
  }
  function rewards() {
    for (const kind of state.rewardsOffered) {
      if (placedRewards.has(kind)) continue;
      if (kind === "military-base") {
        const pad = findPad(4, 4, 3);
        if (pad && command("zone-area", { zone: "military", x: pad.x, y: pad.y, width: 4, height: 4 }).accepted) placedRewards.add(kind);
        continue;
      }
      const spec = sim.FACILITY_KINDS[kind];
      if (!spec || (spec.tech && year() < spec.tech)) continue;
      const cell = nextFreeBlock();
      if (!cell) continue;
      buildRing(cell.bx, cell.by);
      const rect = blockRect(cell.bx, cell.by);
      const receipt = place(kind, rect.x, rect.y);
      if (receipt.accepted) {
        blocks.set(blockKey(cell.bx, cell.by), { bx: cell.bx, by: cell.by, kind: "reward", zone: "" });
        placedRewards.add(kind); rewardBlocks += 1;
      } else unusable.add(blockKey(cell.bx, cell.by));
    }
  }
  function disasters(month) {
    const decade = Math.floor((year() - state.yearFounded) / 10);
    if (month !== 6 || decade === lastDisasterDecade || state.disaster) return;
    const kind = DISASTER_CYCLE[disasterIndex % DISASTER_CYCLE.length];
    const receipt = command("trigger-disaster", { kind, x: spawn.x, y: spawn.y });
    if (receipt.accepted) { disasterIndex += 1; lastDisasterDecade = decade; disastersStarted.push({ kind, year: year() }); }
  }

  // --- the monthly plan --------------------------------------------------------
  function act(month) {
    finance();
    // Power and water first: a dark or dry block never grows.
    for (let guard = 0; guard < 4 && state.powerCapacity - state.powerDemand < 120; guard += 1) if (!buildPlant()) break;
    for (let guard = 0; guard < 4 && state.waterCapacity - state.waterDemand < 60; guard += 1) if (!buildWaterworks()) break;
    rezoneScars();
    rewards();
    const perMonth = Math.min(8, 2 + Math.floor(state.population / 4000));
    for (let n = 0; n < perMonth; n += 1) if (!expandOnce()) break;
    for (const block of blocks.values()) if (block.kind !== "zone" && block.kind !== "reward") furnishCivic(block);
    if (state.population > 1500) {
      if (!transit.subway) buildSubway();
      if (!transit.rail) buildRail();
      if (!transit.highway && state.population > 4000) buildHighway();
    }
    disasters(month);
    sim.ensureDerived(state);
  }

  return Object.freeze({
    act,
    receipts,
    blocks,
    transit,
    placedRewards,
    disastersStarted,
    origin,
    latticeBounds,
  });
}

export function runPlaythrough(options = {}) {
  const sim = options.sim || loadSim();
  const seed = Number.isInteger(options.seed) ? options.seed : 20260903;
  const size = [64, 96, 128].includes(options.size) ? options.size : 128;
  const minutes = Number.isFinite(options.minutes) ? options.minutes : 120;
  const target = Number.isInteger(options.target) ? options.target : 50000;
  const log = options.log || (() => {});
  const ticksPerMinute = sim.FIXED_TICK_HZ * 60;
  const ticksPerMonth = sim.TICKS_PER_DAY * sim.DAYS_PER_MONTH;
  const totalTicks = Math.floor(minutes * ticksPerMinute);
  const months = Math.floor(totalTicks / ticksPerMonth);
  const started = Date.now();

  const state = sim.createCity({ seed, size, terrainPreset: options.terrainPreset || "balanced", name: "Two Hours", founded: true });
  const mayor = createMayor(sim, state, { log });
  const timeline = [];
  const storyKeys = new Set();
  const eventTypes = new Map();
  let negativeRun = 0; let longestNegativeRun = 0;
  let peakPopulation = 0; let peakYear = state.yearFounded;
  let stall = null;

  function drain() {
    for (const event of sim.drainEvents(state)) {
      eventTypes.set(event.type, (eventTypes.get(event.type) || 0) + 1);
      if (event.type === "newspaper-published") (event.payload.stories || []).forEach((key) => storyKeys.add(key));
    }
    sim.drainNotices(state);
  }
  function problemHistogram() {
    const names = ["none", "no-road", "no-power", "no-water", "congested", "no-demand", "pollution"];
    const counts = {};
    let zoned = 0; let empty = 0;
    for (let i = 0; i < state.size * state.size; i += 1) {
      if (!state.zone[i] || state.zone[i] > 3) continue;
      zoned += 1; if (!state.stage[i]) empty += 1;
      const name = names[state.problemCode[i]] || "none";
      counts[name] = (counts[name] || 0) + 1;
    }
    return { zoned, empty, ...counts };
  }
  function snapshot() {
    sim.ensureDerived(state);
    const date = sim.dateOf(state);
    return {
      year: date.year, tick: state.tick, population: state.population, jobs: state.jobs, funds: state.funds, bonds: state.bonds.length,
      demand: { ...state.demand }, power: { capacity: state.powerCapacity, demand: state.powerDemand }, water: { capacity: state.waterCapacity, demand: state.waterDemand },
      blocks: mayor.blocks.size, rewardTier: state.rewardTier, problems: problemHistogram(),
      // Per-road-tile relief the core grants (rail's field is a city total).
      relief: (state.railService?.connectedStations ? Math.min(32, state.railService.connectedStations * 12 + Math.floor(state.railService.connectedRailTiles / 2)) : 0)
        + (state.subwayService?.roadTrafficRelief || 0) + (state.busService?.roadTrafficRelief || 0) + (state.highwayService?.roadTrafficRelief || 0),
    };
  }

  for (let month = 0; month < months; month += 1) {
    mayor.act(month % 12);
    drain();
    sim.advanceTicks(state, ticksPerMonth);
    drain();
    if (state.funds < 0) { negativeRun += 1; longestNegativeRun = Math.max(longestNegativeRun, negativeRun); } else negativeRun = 0;
    if (state.population > peakPopulation) { peakPopulation = state.population; peakYear = sim.dateOf(state).year; }
    if (month % 60 === 0) {
      const row = snapshot();
      timeline.push(row);
      log(`${row.year}  pop ${row.population}  jobs ${row.jobs}  funds ${row.funds}  bonds ${row.bonds}  demand r${row.demand.r} c${row.demand.c} i${row.demand.i}  power ${row.power.demand}/${row.power.capacity}  water ${row.water.demand}/${row.water.capacity}  blocks ${row.blocks}  relief ${row.relief}  lots ${JSON.stringify(row.problems)}`);
    }
    if (state.population >= target && !options.playOn) break;
  }
  const final = snapshot();
  if (final.population < target) {
    // Name the stall: the last snapshot whose population was the peak, and
    // the blockers the core reported on zoned land at the end.
    stall = { peakPopulation, peakYear, atEnd: final };
  }

  const reachableTiers = sim.REWARD_TIERS.filter((tier) => tier.threshold <= final.population);
  const unplacedTiers = reachableTiers.filter((tier) => !mayor.placedRewards.has(tier.kind)).map((tier) => tier.kind);
  const expectedStories = ["milestone", "growth", "reward", "bond", "ordinance", "disaster_over", ...mayor.disastersStarted.map((item) => `disaster_${item.kind}`)];
  const missingStories = [...new Set(expectedStories)].filter((key) => !storyKeys.has(key));
  const checks = [
    { name: `population reaches ${target} (reached ${final.population} in ${final.year})`, ok: final.population >= target },
    { name: `funds never negative for more than 12 months (longest run ${longestNegativeRun})`, ok: longestNegativeRun <= 12 },
    { name: `every reward tier the population unlocks is placed (${reachableTiers.map((tier) => tier.kind).join(", ") || "none"})`, ok: unplacedTiers.length === 0 && reachableTiers.length > 0 },
    { name: `newspaper story keys fire (${[...storyKeys].sort().join(", ")})`, ok: missingStories.length === 0 },
    { name: `one scripted disaster per decade (${mayor.disastersStarted.map((item) => `${item.kind}@${item.year}`).join(", ")})`, ok: mayor.disastersStarted.length >= Math.floor((final.year - state.yearFounded) / 10) },
  ];
  return {
    ok: checks.every((check) => check.ok),
    checks,
    seed, size, minutes, target,
    final,
    timeline,
    stall,
    storyKeys: [...storyKeys].sort(),
    missingStories,
    eventTypes: Object.fromEntries([...eventTypes.entries()].sort()),
    receipts: Object.fromEntries([...mayor.receipts.entries()].sort()),
    rewardsOffered: [...state.rewardsOffered],
    placedRewards: [...mayor.placedRewards],
    transit: { ...mayor.transit },
    elapsedMs: Date.now() - started,
    state,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--seed") options.seed = Number(next());
    else if (arg === "--size") options.size = Number(next());
    else if (arg === "--minutes") options.minutes = Number(next());
    else if (arg === "--target") options.target = Number(next());
    else if (arg === "--terrain") options.terrainPreset = next();
    else if (arg === "--json") options.json = next();
    else if (arg === "--play-on") options.playOn = true;
    else if (arg === "--quiet") options.quiet = true;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const log = options.quiet ? () => {} : (line) => console.log(line);
  let result;
  try {
    result = runPlaythrough({ ...options, log });
  } catch (error) {
    console.error(`NO  bonsai-playthrough threw: ${error?.stack || error}`);
    process.exit(1);
  }
  for (const check of result.checks) console.log(`${check.ok ? "OK " : "NO "} ${check.name}`);
  if (result.stall) {
    console.log(`--  growth stalled: peak ${result.stall.peakPopulation} in ${result.stall.peakYear}; at the end ${JSON.stringify(result.stall.atEnd)}`);
  }
  console.log(`--  receipts ${JSON.stringify(result.receipts)}`);
  console.log(`--  transit ${JSON.stringify(result.transit)}  rewards offered ${result.rewardsOffered.join(",")}  placed ${result.placedRewards.join(",")}`);
  console.log(`--  ${result.elapsedMs} ms for ${result.minutes} simulated minutes (${result.final.year - result.state.yearFounded} game years)`);
  if (options.json) {
    const { state, ...report } = result;
    fs.writeFileSync(options.json, JSON.stringify(report, null, 2));
  }
  process.exit(result.ok ? 0 : 1);
}
