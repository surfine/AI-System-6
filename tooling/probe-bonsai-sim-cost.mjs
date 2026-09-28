#!/usr/bin/env node
// Bonsai City simulation cost probe / 盆景城市模拟开销探针.
//
// Builds a mature 128-square city (spec 3.10: at least 30,000 residents and
// 2,000 lots) through the real command path — a road, wire and pipe grid,
// fusion plants and treatment works, services, zoned blocks — writes its
// buildings straight into the lot layers so the probe does not depend on
// the pacing of growth, lets it settle for three months, and then times
// every tick of the next six months of the headless core.
//
// It prints three numbers against the budget: the mean cost of a tick, the
// peak of the month-settlement ticks, and the slowest single tick.
//
// Usage: node tooling/probe-bonsai-sim-cost.mjs [--months 6] [--json <path>]
// Exit 0 when all three are inside the budget, 1 otherwise.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const BUDGET = Object.freeze({ meanTickMs: 0.5, monthPeakMs: 15, maxTickMs: 30 });

// The core is timed in this process's own realm, as a browser page loads it.
// Inside a node:vm context every global (Math, Uint8Array) goes through the
// context's interceptors; a per-tile loop there measured 30-80x slower than
// the same loop in a page, which would be a probe artefact, not the game.
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
// The contextified load the feature tests use, for comparison.
export function loadSimInVm() {
  const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
  vm.runInContext(fs.readFileSync(path.join(root, "apps/desktop/app/features/bonsai-city-sim.js"), "utf8"), context);
  return context.window.AISystem6BonsaiSim;
}

export function buildMatureCity(sim, { seed = 20260926 } = {}) {
  const size = 128;
  const state = sim.createCity({ seed, size, terrainPreset: "balanced", yearFounded: 2050, name: "Probe" });
  // Level, dry ground: the probe measures the city, not the terrain.
  for (let i = 0; i < size * size; i += 1) {
    state.alt[i] = 2; state.water[i] = 0; state.waterKind[i] = 0; state.salt[i] = 0; state.tree[i] = 0; state.shore[i] = 0; state.slope[i] = 0; state.terrain[i] = 1;
  }
  sim.invalidateDerived(state);
  state.funds = 10_000_000;
  let sequence = 0;
  const run = (type, payload) => sim.submitCommand(state, { schemaVersion: 2, type, payload, targetTick: state.tick, clientCommandId: `probe-${sequence += 1}` });
  // A utility strip along the top rows: fusion and water treatment.
  for (let k = 0; k < 10; k += 1) run("place-facility", { kind: "fusion", x: 2 + k * 5, y: 1 });
  for (let k = 0; k < 20; k += 1) run("place-facility", { kind: "treatment", x: 60 + k * 3, y: 2 });
  // A 4-tile street grid below it: roads on every fourth row and column,
  // wire and pipe alongside, 3x3 blocks between.
  const top = 8;
  for (let y = top; y < size; y += 4) { run("build-path", { network: "road", points: [{ x: 0, y }, { x: size - 1, y }] }); }
  for (let x = 0; x < size; x += 4) { run("build-path", { network: "road", points: [{ x, y: top }, { x, y: size - 1 }] }); }
  for (const network of ["wire", "pipe"]) {
    run("build-path", { network, points: [{ x: 1, y: 5 }, { x: size - 2, y: 5 }] });
    for (let x = 1; x < size; x += 4) run("build-path", { network, points: [{ x, y: 5 }, { x, y: size - 1 }] });
  }
  // Blocks: every eighth block is civic, the rest zoned dense R/C/I in a
  // 6:2:2 pattern, alternating one 3x3 building with nine 1x1 buildings.
  const civic = ["police", "fire", "school", "clinic", "bus", "police", "fire", "school"];
  let block = 0; let civicIndex = 0;
  const zones = ["residential", "residential", "commercial", "residential", "industrial", "residential", "residential", "commercial", "residential", "industrial"];
  const writeLot = (x, y, lotSize, zone) => {
    const anchor = y * size + x;
    for (let dy = 0; dy < lotSize; dy += 1) for (let dx = 0; dx < lotSize; dx += 1) {
      const i = anchor + dy * size + dx;
      state.lot[i] = anchor + 1; state.stage[i] = lotSize; state.buildingState[i] = sim.BUILDING_STATE.ACTIVE;
    }
    state.variant[anchor] = 1 + ((x * 7 + y * 13) % 24);
  };
  for (let by = top + 1; by + 3 <= size; by += 4) for (let bx = 2; bx + 3 <= size; bx += 4) {
    block += 1;
    if (block % 8 === 0) {
      const kind = civic[civicIndex++ % civic.length];
      run("place-facility", { kind, x: bx + 1, y: by + 1 });
      if (civicIndex % 12 === 0) run("place-facility", { kind: "hospital", x: bx, y: by });
      continue;
    }
    const zone = zones[block % zones.length];
    if (!run("zone-area", { zone, density: "high", x: bx, y: by, width: 3, height: 3 }).accepted) continue;
    const code = { residential: 1, commercial: 2, industrial: 3 }[zone];
    if (block % 3 === 0) writeLot(bx, by, 3, code);
    else for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) writeLot(bx + dx, by + dy, 1, code);
  }
  sim.invalidateDerived(state);
  sim.ensureDerived(state);
  return state;
}

export function probe(options = {}) {
  const sim = options.sim || loadSim();
  const state = buildMatureCity(sim, options);
  const ticksPerMonth = sim.TICKS_PER_DAY * sim.DAYS_PER_MONTH;
  const lotsAtStart = state.buildings.length;
  const residentsAtStart = state.population;
  // Settle: the first routing pass, environment and demand.
  sim.advanceTicks(state, ticksPerMonth * 3);
  sim.drainEvents(state); sim.drainNotices(state);
  const months = Number.isInteger(options.months) ? options.months : 6;
  const times = [];
  const monthTimes = [];
  for (let n = 0; n < months * ticksPerMonth; n += 1) {
    const started = performance.now();
    sim.advanceTicks(state, 1);
    const elapsed = performance.now() - started;
    times.push(elapsed);
    if (state.tick % ticksPerMonth === 0) monthTimes.push(elapsed);
    if (n % 25 === 0) { sim.drainEvents(state); sim.drainNotices(state); }
  }
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  const result = {
    size: state.size,
    residents: state.population, residentsAtStart,
    lots: state.buildings.length, lotsAtStart,
    ticks: times.length,
    meanTickMs: Number(mean.toFixed(4)),
    monthPeakMs: Number(Math.max(...monthTimes).toFixed(3)),
    maxTickMs: Number(Math.max(...times).toFixed(3)),
    dayTickMeanMs: Number((times.filter((_, k) => (k + 1) % sim.TICKS_PER_DAY === 0).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(times.length / sim.TICKS_PER_DAY))).toFixed(3)),
    budget: BUDGET,
  };
  result.mature = residentsAtStart >= 30000 && lotsAtStart >= 2000;
  result.ok = result.mature && result.meanTickMs <= BUDGET.meanTickMs && result.monthPeakMs <= BUDGET.monthPeakMs && result.maxTickMs <= BUDGET.maxTickMs;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--months") options.months = Number(argv[++i]);
    else if (argv[i] === "--json") options.json = argv[++i];
  }
  const result = probe(options);
  const mark = (ok) => (ok ? "OK " : "NO ");
  console.log(`${mark(result.mature)} mature city: ${result.residentsAtStart} residents, ${result.lotsAtStart} lots on ${result.size}² (needs ≥30,000 and ≥2,000)`);
  console.log(`${mark(result.meanTickMs <= BUDGET.meanTickMs)} mean tick ${result.meanTickMs} ms (budget ≤ ${BUDGET.meanTickMs})`);
  console.log(`${mark(result.monthPeakMs <= BUDGET.monthPeakMs)} month-settlement peak ${result.monthPeakMs} ms (budget ≤ ${BUDGET.monthPeakMs})`);
  console.log(`${mark(result.maxTickMs <= BUDGET.maxTickMs)} slowest tick ${result.maxTickMs} ms (budget ≤ ${BUDGET.maxTickMs})`);
  console.log(`--  day-tick mean ${result.dayTickMeanMs} ms over ${result.ticks} ticks; after six months ${result.residents} residents, ${result.lots} lots`);
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
