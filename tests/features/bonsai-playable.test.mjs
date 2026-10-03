// Bonsai City ruleset 5 — the rules that make it play like SC2K
// (internal/plans/BONSAI-PLAYABLE-SPEC.zh-CN.md, acceptance 1). Every block
// below plays the headless core the way a player does and asserts what the
// player would see: whole buildings on lots, commutes that have to arrive,
// services with consequences, demand that answers jobs, traffic that follows
// the route, and a save format that migrates and round-trips.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read, root as repoRoot } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-playable");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
const sim = context.window.AISystem6BonsaiSim;
const { ZONE, BUILDING_STATE: BS } = sim;

// A blank, level 64-square map: every rule below is about the city, not the
// terrain generator, so the test lays its own ground.
function flatCity(seed = 1, options = {}) {
  const state = sim.createCity({ seed, size: 64, terrainPreset: "balanced", ...options });
  for (let i = 0; i < 64 * 64; i += 1) {
    state.alt[i] = 2; state.water[i] = 0; state.waterKind[i] = 0; state.salt[i] = 0; state.tree[i] = 0;
    state.shore[i] = 0; state.slope[i] = 0; state.terrain[i] = 1;
  }
  sim.invalidateDerived(state); sim.ensureDerived(state);
  return state;
}
function command(state, type, payload) {
  return sim.submitCommand(state, { schemaVersion: 2, type, payload, targetTick: state.tick, clientCommandId: `${type}-${state.nextCommandSequence}` });
}
function must(state, type, payload, label) {
  const receipt = command(state, type, payload);
  if (!receipt.accepted) throw new Error(`${label}: ${receipt.code}`);
  return receipt;
}
const days = (state, n, each = null) => { for (let d = 0; d < n; d += 1) { if (each) each(); sim.advanceTicks(state, sim.TICKS_PER_DAY); } };
const lotsOf = (state, zone) => state.buildings.filter((building) => building.zone === zone);
const working = (state, zone) => lotsOf(state, zone).filter((building) => building.state === BS.ACTIVE);

// A powered, watered starter: a coal plant (2..5, 10..13), a water tower
// at (6,10), a road along row 12, and a light residential block (8..13) and
// a light industrial block (14..17) side by side on rows 13-14, so power
// and water carry from one to the other through the zoned land.
function starter(state, { water = true } = {}) {
  must(state, "place-facility", { kind: "coal", x: 2, y: 10 }, "coal");
  if (water) must(state, "place-facility", { kind: "water-tower", x: 6, y: 10 }, "tower");
  must(state, "build-path", { network: "road", points: [{ x: 6, y: 12 }, { x: 30, y: 12 }] }, "road");
  must(state, "build-path", { network: "wire", points: [{ x: 6, y: 11 }, { x: 7, y: 11 }, { x: 7, y: 13 }] }, "wire");
  if (water) must(state, "build-path", { network: "pipe", points: [{ x: 6, y: 11 }, { x: 6, y: 13 }, { x: 7, y: 13 }] }, "pipe");
  // Every building stands on a street: the strip has the main road on its
  // north side and a street on its south side, joined east of the factories.
  must(state, "build-path", { network: "road", points: [{ x: 18, y: 12 }, { x: 18, y: 15 }, { x: 8, y: 15 }] }, "south street");
  must(state, "zone-area", { zone: "residential", density: "low", x: 8, y: 13, width: 6, height: 2 }, "R");
  must(state, "zone-area", { zone: "industrial", density: "low", x: 14, y: 13, width: 4, height: 2 }, "I");
  // A police and a fire station: without police, crime drives homes out
  // (ruleset 5), and the two lift land value over the 2x2 threshold.
  must(state, "place-facility", { kind: "police", x: 6, y: 14 }, "police");
  must(state, "place-facility", { kind: "fire", x: 6, y: 15 }, "fire");
}
// Demand is a monthly figure; growth phases hold it where a town with room
// to grow would have it.
const eager = (state) => () => { state.demand = { r: 60, c: 60, i: 60 }; };

// --- a commute that cannot arrive does not grow --------------------------------
{
  const state = flatCity(11);
  starter(state);
  days(state, 90, eager(state));
  test.assert(working(state, ZONE.R).length > 0 && working(state, ZONE.I).length > 0, "a connected starter grows homes and factories");
  // A second neighbourhood on its own road: powered, but no road reaches a job.
  must(state, "build-path", { network: "road", points: [{ x: 34, y: 20 }, { x: 42, y: 20 }] }, "isolated road");
  must(state, "build-path", { network: "wire", points: [{ x: 3, y: 14 }, { x: 3, y: 21 }, { x: 34, y: 21 }] }, "wire to the island");
  must(state, "zone-area", { zone: "residential", density: "low", x: 35, y: 21, width: 6, height: 2 }, "island R");
  const island = (s) => s.buildings.filter((building) => building.zone === ZONE.R && building.x >= 35);
  days(state, 60, () => { state.demand = { ...state.demand, r: 80 }; });
  const info = sim.tileInfo(state, 36, 21);
  test.assert(island(state).length === 0, "homes whose road reaches no job never start");
  test.assert(info.powered && info.roadOk && info.problem?.code === "no-commute" && info.lot.commute === false,
    "the zone says why: it has road and power, but no commute");
  must(state, "build-path", { network: "road", points: [{ x: 30, y: 12 }, { x: 30, y: 20 }, { x: 34, y: 20 }] }, "link road");
  days(state, 120, () => { state.demand = { ...state.demand, r: 80 }; });
  test.assert(island(state).length > 0, "joining the island's road to the town lets its homes grow");
}

// --- every building stands on a street; dear street lots rise to towers --------
{
  const state = flatCity(14);
  starter(state);
  // A powered strip two tiles from any street: a wire along row 16 feeds
  // it, but no fire engine could reach it.
  must(state, "build-path", { network: "wire", points: [{ x: 7, y: 13 }, { x: 7, y: 16 }, { x: 13, y: 16 }] }, "wire to the back land");
  must(state, "zone-area", { zone: "residential", density: "low", x: 8, y: 17, width: 6, height: 1 }, "back land");
  days(state, 150, eager(state));
  const homes = working(state, ZONE.R).map((building) => building.y * 64 + building.x);
  test.assert(homes.length >= 6 && homes.every((anchor) => state.variant[anchor] <= 16),
    `a young town stands below the high tier (${homes.length} homes)`);
  const back = state.buildings.filter((building) => building.y === 17);
  const info = sim.tileInfo(state, 9, 17);
  test.assert(back.length === 0 && info.powered && info.problem?.code === "no-road",
    `zoned land two tiles from a street never builds, and says it needs a road (${back.length} lots, ${info.problem?.code})`);
  const dearest = homes.filter((_, index) => index % 2 === 0);
  const dear = homes.filter((_, index) => index % 2 === 1);
  const hold = () => {
    state.demand = { r: 40, c: 40, i: 40 };
    for (const anchor of dearest) state.landValue[anchor] = 95;
    for (const anchor of dear) state.landValue[anchor] = 70;
  };
  days(state, 500, hold);
  const high = (anchor) => state.variant[anchor] >= 17;
  const risen = homes.filter(high);
  test.assert(risen.length * 2 >= homes.length,
    `homes on dear land along a street are rebuilt at the high tier (${risen.length}/${homes.length})`);
  const rank = (list) => Math.max(...list.filter(high).map((anchor) => state.variant[anchor]));
  test.assert(dearest.some(high) && dear.some(high) && rank(dearest) > rank(dear),
    `dearer land builds taller: the high variant is ranked by land value (${rank(dearest)} over ${rank(dear)})`);
  test.assert(sim.lotCapacity(ZONE.R, 1, 20, BS.ACTIVE) === sim.lotCapacity(ZONE.R, 1, 4, BS.ACTIVE)
    && sim.lotCapacity(ZONE.C, 2, 20, BS.ACTIVE) === sim.lotCapacity(ZONE.C, 2, 12, BS.ACTIVE),
    "the tier is the look land value buys; a lot's capacity does not change with it");
  test.assert(sim.LOT_RULES.tierLow < sim.LOT_RULES.tierHigh && sim.LOT_RULES.tierHigh <= 80,
    "the tier thresholds sit inside the land values the formula makes");
}

// --- a blackout empties a town gradually, and a rebuilt plant saves it --------
{
  const state = flatCity(12);
  starter(state);
  days(state, 150, eager(state));
  const standing = [...working(state, ZONE.R), ...working(state, ZONE.I)].map((building) => building.y * 64 + building.x);
  test.assert(standing.length >= 6, `the starter stands before the blackout (${standing.length} working lots)`);
  must(state, "demolish-area", { x: 6, y: 11, width: 2, height: 1 }, "cut the wire");
  test.assert(!sim.tileInfo(state, 9, 13).powered, "the blackout reaches the homes");
  const stateOf = (anchor) => state.buildingState[anchor];
  const failing = () => standing.filter((anchor) => stateOf(anchor) === BS.DECLINING || stateOf(anchor) === BS.ABANDONED).length;
  days(state, 30);
  test.assert(failing() * 2 < standing.length, `a month in the dark takes some lots, not the town (${failing()}/${standing.length} failing)`);
  days(state, 64);
  test.assert(failing() === standing.length, `ninety dark days bring every lot that stood down (${failing()}/${standing.length})`);
  test.assert(sim.LOT_RULES.powerFuseDays === 90 && sim.LOT_RULES.powerDeclineChance > 0, "the blackout rules are LOT_RULES constants");
  const declined = sim.cityReport(state).population;
  must(state, "build-path", { network: "wire", points: [{ x: 6, y: 11 }, { x: 7, y: 11 }] }, "rewire");
  must(state, "build-path", { network: "pipe", points: [{ x: 6, y: 11 }, { x: 6, y: 12 }] }, "re-pipe");
  days(state, 40, () => { state.demand = { ...state.demand, r: 60, i: 60 }; });
  test.assert(sim.cityReport(state).population > declined, "restoring power brings the town back");
}
{
  // The 64-square acceptance game lost both plants to a monster and emptied
  // in under three months. A plant rebuilt within 60 days keeps most people,
  // and while there is none the advisor asks for a plant, not a power line.
  const state = flatCity(13);
  starter(state);
  days(state, 150, eager(state));
  const before = sim.cityReport(state).population;
  test.assert(before > 0, `the starter has people before the plant goes (${before})`);
  must(state, "demolish-area", { x: 2, y: 10, width: 4, height: 4 }, "the plant is destroyed");
  test.assert(!state.facilities.some((facility) => facility.kind === "coal") && !sim.tileInfo(state, 9, 13).powered, "no plant, no power");
  const utilityAdvice = () => sim.advisorReport(state).advisors.find((advisor) => advisor.id === "utilities").items.map((line) => line.key);
  const advice = utilityAdvice();
  test.assert(advice[0] === "utilities_no_plant" && !advice.includes("utilities_unconnected"),
    `with no plant the utilities advisor asks for a plant (${advice.join(", ")})`);
  days(state, 56);
  const dark = sim.cityReport(state).population;
  must(state, "place-facility", { kind: "coal", x: 2, y: 10 }, "rebuild the plant");
  test.assert(sim.tileInfo(state, 9, 13).powered, "the rebuilt plant lights the town");
  test.assert(!utilityAdvice().includes("utilities_no_plant"), "once a plant stands the advisor stops asking for one");
  days(state, 30, eager(state));
  const after = sim.cityReport(state).population;
  test.assert(dark * 2 > before && after * 10 >= before * 8,
    `a plant rebuilt after 56 dark days keeps most of the town (${before} → ${dark} in the dark → ${after} a month later)`);
}

// --- no water caps a dense lot at one tile --------------------------------------
{
  const state = flatCity(13);
  starter(state, { water: false });
  must(state, "zone-area", { zone: "residential", density: "high", x: 8, y: 16, width: 6, height: 6 }, "dense R");
  must(state, "build-path", { network: "road", points: [{ x: 7, y: 12 }, { x: 7, y: 22 }] }, "side road");
  must(state, "build-path", { network: "wire", points: [{ x: 7, y: 13 }, { x: 7, y: 16 }] }, "wire down");
  days(state, 150, () => { state.demand = { ...state.demand, r: 90 }; });
  const dense = state.buildings.filter((building) => building.zone === ZONE.R && building.y >= 16);
  test.assert(dense.length > 0 && dense.every((building) => building.w === 1), "a dry dense block grows only one-tile buildings");
  test.assert(sim.tileInfo(state, 10, 18).problem?.code === "no-water" || !sim.tileInfo(state, 10, 18).lot.built, "the dry block reports missing water");
  must(state, "place-facility", { kind: "water-tower", x: 6, y: 16 }, "tower");
  must(state, "build-path", { network: "pipe", points: [{ x: 6, y: 17 }, { x: 8, y: 17 }] }, "pipe");
  days(state, 300, () => { state.demand = { ...state.demand, r: 90 }; });
  test.assert(state.buildings.some((building) => building.zone === ZONE.R && building.y >= 16 && building.w > 1), "water lets the dense block build larger");
}

// --- demand answers jobs --------------------------------------------------------
{
  const state = flatCity(14);
  starter(state);
  days(state, 30);
  // Write a town straight into the lot layers, then compare what the
  // residential market says with and without a large employer.
  const put = (x, y, zone, size, variant = 9) => {
    const anchor = y * 64 + x;
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) {
      const i = anchor + dy * 64 + dx;
      state.zone[i] = zone; state.density[i] = 2; state.lot[i] = anchor + 1; state.stage[i] = size; state.buildingState[i] = BS.ACTIVE;
    }
    state.variant[anchor] = variant;
  };
  put(40, 40, ZONE.R, 3); put(44, 40, ZONE.R, 3);
  sim.invalidateDerived(state);
  const without = sim.demandReport(state);
  put(40, 50, ZONE.I, 3); put(44, 50, ZONE.I, 3); put(48, 50, ZONE.I, 3);
  sim.invalidateDerived(state);
  const withJobs = sim.demandReport(state);
  test.assert(withJobs.jobs > without.jobs && withJobs.r > without.r + 200, `new jobs raise residential demand (${Math.round(without.r)} → ${Math.round(withJobs.r)})`);
  test.assert(withJobs.i < without.i, "the new factories satisfy part of the industrial market");
  const empty = sim.demandReport(flatCity(15));
  test.assert(empty.r > 300 && empty.r < 700 && empty.i > 1000 && Math.abs(empty.c) < 100,
    `an empty city opens with R and I demand and none for commerce (R ${Math.round(empty.r)}, C ${Math.round(empty.c)}, I ${Math.round(empty.i)})`);
}

// --- commuters take the route, not the neighbourhood ----------------------------
{
  const state = flatCity(16);
  must(state, "place-facility", { kind: "coal", x: 2, y: 2 }, "coal");
  must(state, "place-facility", { kind: "water-tower", x: 6, y: 2 }, "tower");
  must(state, "build-path", { network: "wire", points: [{ x: 5, y: 6 }, { x: 5, y: 24 }, { x: 41, y: 24 }, { x: 41, y: 22 }] }, "wire");
  // A straight road from homes (west) to work (east) with a dead-end spur
  // branching north from its middle.
  must(state, "build-path", { network: "road", points: [{ x: 6, y: 21 }, { x: 40, y: 21 }] }, "main road");
  must(state, "build-path", { network: "road", points: [{ x: 23, y: 20 }, { x: 23, y: 12 }] }, "spur");
  must(state, "zone-area", { zone: "residential", density: "low", x: 6, y: 22, width: 5, height: 2 }, "homes");
  must(state, "zone-area", { zone: "industrial", density: "low", x: 36, y: 22, width: 5, height: 2 }, "work");
  must(state, "place-facility", { kind: "police", x: 22, y: 24 }, "police");
  days(state, 150, eager(state));
  sim.ensureDerived(state);
  const at = (x, y) => state.traffic[y * 64 + x];
  test.assert(working(state, ZONE.R).length > 0 && working(state, ZONE.I).length > 0, "both ends of the commute are working");
  test.assert([15, 20, 25, 30].every((x) => at(x, 21) > 0), "the road between home and work carries the commute");
  test.assert([23, 22, 22, 21].length && at(23, 16) === 0 && at(23, 13) === 0, "the dead-end spur carries nobody");
  const lot = working(state, ZONE.R)[0];
  test.assert(sim.tileInfo(state, lot.x, lot.y).lot.commuteDistance > 0, "a home reports how far its commute is");
}

// --- a subway or a highway takes commuters off the downtown road ----------------
{
  // Homes in the west, factories in the east, one road between them: the
  // commute runs down that road. The same town then gets a subway with a
  // station at each end, or a highway with an onramp at each end.
  function commuterTown() {
    const state = flatCity(21, { yearFounded: 1950 });
    must(state, "place-facility", { kind: "coal", x: 20, y: 22 }, "coal");
    must(state, "place-facility", { kind: "water-tower", x: 25, y: 22 }, "tower");
    must(state, "build-path", { network: "road", points: [{ x: 3, y: 30 }, { x: 48, y: 30 }] }, "main road");
    must(state, "build-path", { network: "wire", points: [{ x: 24, y: 24 }, { x: 24, y: 31 }, { x: 4, y: 31 }] }, "wire west");
    must(state, "build-path", { network: "wire", points: [{ x: 24, y: 31 }, { x: 40, y: 31 }] }, "wire east");
    must(state, "build-path", { network: "pipe", points: [{ x: 25, y: 23 }, { x: 25, y: 29 }, { x: 4, y: 29 }] }, "pipe west");
    must(state, "build-path", { network: "pipe", points: [{ x: 25, y: 29 }, { x: 47, y: 29 }] }, "pipe east");
    // Every building stands on a street: each neighbourhood has a back
    // street, a loop off the main road on its own side of town, so it
    // offers no way round downtown.
    must(state, "build-path", { network: "road", points: [{ x: 13, y: 30 }, { x: 13, y: 33 }, { x: 4, y: 33 }] }, "west back street");
    must(state, "build-path", { network: "road", points: [{ x: 38, y: 30 }, { x: 38, y: 33 }, { x: 47, y: 33 }] }, "east back street");
    must(state, "zone-area", { zone: "residential", density: "low", x: 4, y: 31, width: 8, height: 2 }, "homes");
    must(state, "zone-area", { zone: "industrial", density: "low", x: 40, y: 31, width: 8, height: 2 }, "factories");
    must(state, "place-facility", { kind: "police", x: 12, y: 31 }, "police west");
    must(state, "place-facility", { kind: "police", x: 39, y: 31 }, "police east");
    days(state, 200, eager(state));
    return state;
  }
  const downtown = 30 * 64 + 26; // the main road, halfway between
  const occupied = (building) => building.state === BS.ACTIVE || building.state === BS.DECLINING || building.state === BS.RECOVERING;
  const commuteCost = (state) => {
    const homes = state.buildings.filter((building) => building.zone === ZONE.R && occupied(building) && building.access >= 0);
    return homes.reduce((sum, building) => sum + state.distJobs[building.access], 0) / homes.length;
  };
  for (const [label, connect] of [
    ["a subway", (state) => {
      must(state, "build-path", { network: "subway", points: [{ x: 8, y: 29 }, { x: 44, y: 29 }] }, "subway");
      must(state, "place-facility", { kind: "subway-station", x: 8, y: 29 }, "west station");
      must(state, "place-facility", { kind: "subway-station", x: 44, y: 29 }, "east station");
    }],
    ["a highway with two onramps", (state) => {
      must(state, "build-path", { network: "highway", points: [{ x: 8, y: 27 }, { x: 44, y: 27 }] }, "highway");
      must(state, "build-path", { network: "onramp", points: [{ x: 8, y: 29 }] }, "west onramp");
      must(state, "build-path", { network: "onramp", points: [{ x: 44, y: 29 }] }, "east onramp");
    }],
  ]) {
    const state = commuterTown();
    const trafficBefore = state.traffic[downtown]; const costBefore = commuteCost(state);
    test.assert(working(state, ZONE.R).length >= 6 && working(state, ZONE.I).length >= 6 && trafficBefore > 0,
      `the commuter town works and its commute runs down the main road (${trafficBefore} trips downtown, cost ${costBefore.toFixed(1)})`);
    connect(state);
    days(state, 8, eager(state)); // routes are refreshed every four days
    const trafficAfter = state.traffic[downtown]; const costAfter = commuteCost(state);
    test.assert(trafficAfter < trafficBefore && costAfter < costBefore * 0.75,
      `${label} takes the commute off the downtown road (${trafficBefore} → ${trafficAfter} trips) and shortens it (cost ${costBefore.toFixed(1)} → ${costAfter.toFixed(1)})`);
  }
}

// --- ruleset 6: commuters ride a subway under the river ---------------------------
{
  // The commuter town split by a river at x 33..35 (owner decision
  // 2026-10-02): the main road stops at both banks, power crosses on
  // pylons, each bank has its own water tower, and the only way from the
  // homes to the factories is a subway tunnel under the water.
  const RIVER = [33, 34, 35];
  function riverTown(seed, withSubway) {
    const state = flatCity(seed, { yearFounded: 1950 });
    for (let y = 0; y < 64; y += 1) for (const x of RIVER) { state.water[y * 64 + x] = 1; state.waterKind[y * 64 + x] = 1; }
    sim.invalidateDerived(state); sim.ensureDerived(state);
    must(state, "place-facility", { kind: "coal", x: 20, y: 22 }, "coal");
    must(state, "place-facility", { kind: "water-tower", x: 25, y: 22 }, "west tower");
    must(state, "place-facility", { kind: "water-tower", x: 38, y: 22 }, "east tower");
    must(state, "build-path", { network: "road", points: [{ x: 3, y: 30 }, { x: 32, y: 30 }] }, "west road");
    must(state, "build-path", { network: "road", points: [{ x: 36, y: 30 }, { x: 48, y: 30 }] }, "east road");
    must(state, "build-path", { network: "wire", points: [{ x: 24, y: 24 }, { x: 24, y: 31 }, { x: 4, y: 31 }] }, "wire west");
    must(state, "build-path", { network: "wire", points: [{ x: 24, y: 31 }, { x: 40, y: 31 }] }, "wire over the river");
    must(state, "build-path", { network: "pipe", points: [{ x: 25, y: 23 }, { x: 25, y: 29 }, { x: 4, y: 29 }] }, "pipe west");
    must(state, "build-path", { network: "pipe", points: [{ x: 38, y: 23 }, { x: 38, y: 29 }, { x: 47, y: 29 }] }, "pipe east");
    must(state, "build-path", { network: "road", points: [{ x: 13, y: 30 }, { x: 13, y: 33 }, { x: 4, y: 33 }] }, "west back street");
    must(state, "build-path", { network: "road", points: [{ x: 39, y: 30 }, { x: 39, y: 33 }, { x: 47, y: 33 }] }, "east back street");
    must(state, "zone-area", { zone: "residential", density: "low", x: 4, y: 31, width: 8, height: 2 }, "homes");
    must(state, "zone-area", { zone: "industrial", density: "low", x: 41, y: 31, width: 7, height: 2 }, "factories");
    must(state, "place-facility", { kind: "police", x: 12, y: 31 }, "police west");
    must(state, "place-facility", { kind: "police", x: 40, y: 31 }, "police east");
    let line = null;
    if (withSubway) {
      line = must(state, "build-path", { network: "subway", points: [{ x: 8, y: 29 }, { x: 44, y: 29 }] }, "subway under the river");
      must(state, "place-facility", { kind: "subway-station", x: 8, y: 29 }, "west station");
      must(state, "place-facility", { kind: "subway-station", x: 44, y: 29 }, "east station");
    }
    days(state, 200, eager(state));
    return { state, line };
  }
  const { state, line } = riverTown(21, true);
  test.assert(line.cost === 34 * 100 + 3 * 300 && line.tunnelCost === 3 * 300, `the line is billed 100 a dry tile and 300 a water tile ($${line.cost}, tunnel $${line.tunnelCost})`);
  test.assert(RIVER.every((x) => state.subway[29 * 64 + x] && state.water[29 * 64 + x] && state.subwayConnected[29 * 64 + x]),
    "the tunnel tiles are subway on water and belong to the connected line");
  const homes = working(state, ZONE.R); const factories = working(state, ZONE.I);
  test.assert(homes.length > 0 && factories.length > 0 && homes.every((building) => building.access >= 0 && state.distJobs[building.access] <= sim.COMMUTE_LIMIT),
    `homes and factories on opposite banks both work, every home within commuting reach (${homes.length} homes, ${factories.length} factories)`);
  test.assert(state.subwayService.riders > 0, `commuters ride through the underwater segment (${state.subwayService.riders} riders)`);
  const cut = riverTown(21, false).state;
  test.assert(working(cut, ZONE.I).length === 0 && cut.subwayService.riders === 0, "without the tunnel the river cuts the commute and the factories never open");
}

// --- the price on the tool is the price billed ----------------------------------
{
  // The palette read $5 a tile for the military zone, which the nation places
  // for free (acceptance section 3 item 6).
  const state = flatCity(22);
  state.rewardsOffered.push("military-base");
  const payload = { zone: "military", x: 30, y: 30, width: 4, height: 4 };
  const fundsBefore = state.funds;
  const receipt = must(state, "zone-area", payload, "military base");
  test.assert(sim.unitCost({ type: "zone-area", payload }) === 0 && receipt.cost === 0 && state.funds === fundsBefore,
    `the military zone is listed and billed at $0 (listed ${sim.unitCost({ type: "zone-area", payload })}, billed ${receipt.cost})`);
  const homes = must(state, "zone-area", { zone: "residential", density: "low", x: 2, y: 2, width: 2, height: 2 }, "homes");
  test.assert(homes.cost === 4 * sim.unitCost({ type: "zone-area", payload: { zone: "residential", density: "low" } }), "an ordinary zone is still billed at its listed price");
}

// --- the save migrates from v4 and round-trips byte-stable ----------------------
{
  const donor = flatCity(17);
  starter(donor);
  days(donor, 40);
  const payload = sim.serialize(donor);
  // A v4 payload: per-tile growth levels, no lot layer, no saved environment.
  delete payload.lot; delete payload.landValue; delete payload.crime; delete payload.pollution;
  payload.version = 4; payload.rulesetVersion = 4;
  const at = (x, y) => y * 64 + x;
  for (let i = 0; i < 64 * 64; i += 1) if (payload.zone[i] >= 1 && payload.zone[i] <= 3) { payload.stage[i] = 0; payload.buildingState[i] = 0; }
  for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) {
    const i = at(40 + dx, 40 + dy); payload.zone[i] = 1; payload.density[i] = 2; payload.stage[i] = 3; payload.buildingState[i] = BS.ACTIVE;
  }
  const loner = at(50, 40); payload.zone[loner] = 2; payload.density[loner] = 2; payload.stage[loner] = 2; payload.buildingState[loner] = BS.ACTIVE;
  const funds = payload.funds;
  const migrated = sim.deserialize(payload);
  test.assert(migrated.lot[at(42, 42)] === at(40, 40) + 1 && migrated.stage[at(41, 41)] === 3, "v4 → v5 groups a 3x3 of top-stage dense tiles into one 3x3 lot");
  test.assert(migrated.lot[loner] === loner + 1 && migrated.stage[loner] === 1, "an isolated stage-2 tile becomes a 1x1 lot");
  test.assert(migrated.funds === funds && migrated.buildings.length === 2, "the migration keeps funds and finds exactly the two buildings");
  const envelope = await sim.encodeSave(migrated, { cityId: "m", name: "M", createdAt: "T", updatedAt: "T" });
  test.assert(envelope.formatVersion === 5 && sim.validateSaveEnvelope(envelope).valid, "a migrated city saves as v5");
  const back = (await sim.decodeSave(envelope)).state;
  const bytes = (state) => sim.canonicalStringify(sim.serialize(state));
  test.assert(bytes(back) === bytes(migrated), "decode(encode(city)) is byte-identical");
  test.assert(bytes(sim.deserialize(sim.serialize(donor))) === bytes(donor), "a played v5 city round-trips byte-identically, lots and environment included");
  const v4Envelope = { format: "bonsai-city", formatVersion: 4, metadata: {}, engine: { rulesetVersion: 4, fixedTickHz: 20, ticksPerDay: 5, daysPerMonth: 25 },
    simulation: { seed: payload.seed, rng: { algorithm: "mulberry32-v1", state: [payload.rngState] } }, payload };
  const lifted = sim.migrateSave(v4Envelope);
  test.assert(lifted.formatVersion === 5 && lifted.payload.version === 5 && lifted.migratedFromFormatVersion === 4 && Array.isArray(lifted.payload.lot),
    "a v4 envelope migrates to v5 with a lot layer");
}

// --- lot sizes and art footprints agree -----------------------------------------
{
  const atlas = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/desktop/assets/bonsai/atlas-metadata.json"), "utf8")).frames;
  const state = flatCity(18);
  starter(state);
  must(state, "zone-area", { zone: "residential", density: "high", x: 8, y: 16, width: 9, height: 3 }, "dense R");
  must(state, "zone-area", { zone: "commercial", density: "high", x: 8, y: 19, width: 9, height: 3 }, "dense C");
  must(state, "build-path", { network: "road", points: [{ x: 7, y: 12 }, { x: 7, y: 22 }, { x: 28, y: 22 }] }, "ring road");
  must(state, "build-path", { network: "wire", points: [{ x: 7, y: 13 }, { x: 7, y: 16 }] }, "wire down");
  must(state, "build-path", { network: "pipe", points: [{ x: 6, y: 13 }, { x: 6, y: 16 }, { x: 8, y: 16 }] }, "pipe down");
  days(state, 400, () => { state.demand = { r: 90, c: 90, i: 90 }; });
  const sizes = new Set(state.buildings.map((building) => building.w));
  test.assert(sizes.has(1) && (sizes.has(2) || sizes.has(3)), `the grown town has one-tile and larger lots (${[...sizes].sort().join(", ")})`);
  const prefix = ["", "r", "c", "i"];
  const mismatched = state.buildings.filter((building) => {
    const frame = atlas[`building.${prefix[building.zone]}.${building.w}.${1 + ((building.variant - 1) % 24)}.normal`];
    return !frame || frame.footprint.w !== building.w || frame.footprint.h !== building.h || building.w !== building.h || building.stage !== building.w;
  });
  test.assert(mismatched.length === 0, `every lot's building art covers exactly its lot (${mismatched.length} mismatched)`);
  const states = ["foundation", "construction", "declined", "abandoned", "recovering"];
  const sized = [];
  for (const prefix of ["r", "c", "i"]) for (const lotSize of [1, 2, 3]) for (const name of states) {
    const frame = atlas[`building.${prefix}.${lotSize}.1.${name}`];
    if (!frame || frame.footprint.w !== lotSize || frame.footprint.h !== lotSize) sized.push(`${prefix}.${lotSize}.${name}`);
  }
  test.assert(sized.length === 0, `every zone has all five state frames at 1x1, 2x2 and 3x3, each covering its lot (${sized.join(", ") || "none missing"})`);
  const facilityFrames = { hospital: "catalog.hospital", university: "catalog.college", library: "catalog.library", museum: "catalog.museum",
    prison: "catalog.prison", zoo: "catalog.zoo", stadium: "catalog.stadium", marina: "catalog.marina", "park-big": "catalog.park_big" };
  for (const [kind, frame] of Object.entries(facilityFrames)) {
    const spec = sim.FACILITY_KINDS[kind];
    test.assert(spec && atlas[frame] && atlas[frame].footprint.w === spec.w && atlas[frame].footprint.h === spec.h, `${kind} occupies what its art shows (${spec?.w}x${spec?.h})`);
  }
  // The coal plant drew 2x2 art on its 4x4 pad, domes and arcologies 4x4 art
  // on a 3x3 pad (acceptance section 3 item 4). New ones now match; records
  // from older saves and .sc2 imports keep the size they were built with,
  // and a 2x2 coal plant keeps its 2x2 art.
  const rewardArt = { coal: "facility.coal", dome: "catalog.dome", arco: "catalog.arcology", "arco-plymouth": "catalog.arcology",
    "arco-forest": "catalog.arcology", "arco-darco": "catalog.arcology", "arco-launch": "catalog.arcology" };
  for (const [kind, frame] of Object.entries(rewardArt)) {
    const spec = sim.FACILITY_KINDS[kind];
    test.assert(spec.w === 4 && spec.h === 4 && atlas[frame]?.footprint.w === 4 && atlas[frame]?.footprint.h === 4, `${kind} occupies the 4x4 its art shows`);
  }
  test.assert(atlas["facility.coal-2x2"]?.footprint.w === 2 && atlas["facility.coal-2x2"]?.footprint.h === 2, "an older 2x2 coal plant has 2x2 art");
  test.assert(sim.footprintOf({ kind: "coal", x: 0, y: 0 }).w === 2 && sim.footprintOf({ kind: "dome", x: 0, y: 0 }).w === 3 && sim.footprintOf({ kind: "arco", x: 0, y: 0 }).w === 3,
    "a saved plant, dome or arcology without its own size keeps the size it was built with");
  const civic = flatCity(19);
  civic.rewardsOffered.push("dome");
  must(civic, "place-facility", { kind: "dome", x: 30, y: 30 }, "dome");
  const dome = civic.facilities.find((facility) => facility.kind === "dome");
  const covered = [0, 1, 2, 3].every((d) => civic.facilityAt[(30 + d) * 64 + 30 + d] >= 0);
  test.assert(dome.w === 4 && dome.h === 4 && covered, "a new dome records and covers its 4x4 pad");
  const reloaded = sim.deserialize(sim.serialize(civic));
  test.assert(sim.footprintOf(reloaded.facilities.find((facility) => facility.kind === "dome")).w === 4, "the 4x4 dome survives a save round trip");
}

// --- ground: wide plains, and pads that level themselves ----------------------
{
  for (const terrainPreset of ["balanced", "river", "lake", "coast"]) {
    const state = sim.createCity({ seed: 20260903, size: 128, terrainPreset });
    let land = 0; let flat = 0;
    for (let i = 0; i < 128 * 128; i += 1) {
      if (state.water[i]) continue; land += 1;
      const x = i % 128; const y = (i - x) / 128; let level = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= 128 || ny >= 128) continue;
        const j = ny * 128 + nx; if (!state.water[j] && state.alt[j] !== state.alt[i]) level = false;
      }
      if (level) flat += 1;
    }
    test.assert(flat / land >= 0.75, `${terrainPreset} ground is at least three-quarters level plain (${Math.round(100 * flat / land)}%)`);
  }
  const state = flatCity(19);
  // A one-step bench under half of a 4x4 coal pad.
  for (let y = 20; y < 24; y += 1) for (let x = 22; x < 30; x += 1) state.alt[y * 64 + x] = 3;
  sim.invalidateDerived(state);
  const before = state.funds;
  const placed = command(state, "place-facility", { kind: "coal", x: 20, y: 20 });
  test.assert(placed.accepted && placed.levelCost === 8 * 20 && before - state.funds === 4000 + 160, `a plant on uneven ground levels its pad and bills it (${placed.code}, $${placed.levelCost})`);
  test.assert([20, 21, 22, 23].every((x) => state.alt[20 * 64 + x] === 2 && state.alt[23 * 64 + x] === 2), "the whole pad now sits at the anchor's height");
  for (let y = 40; y < 44; y += 1) for (let x = 44; x < 50; x += 1) state.alt[y * 64 + x] = 4;
  sim.invalidateDerived(state);
  const steep = command(state, "place-facility", { kind: "coal", x: 41, y: 40 });
  test.assert(!steep.accepted && steep.code === "slope", "a pad that would leave a two-step cliff beside it is refused");
  test.assert(sim.undo(state).accepted && state.alt[20 * 64 + 22] === 3, "undoing the plant restores the ground it levelled");
}

// --- disasters need their cause (spec 3.12) ------------------------------------
{
  const state = flatCity(23, { yearFounded: 2050 });
  state.funds = 1_000_000;
  const trigger = (kind, x = 32, y = 32) => { state.disaster = null; return command(state, "trigger-disaster", { kind, x, y }); };
  const needs = { meltdown: "needs-nuclear", "microwave-spill": "needs-microwave", volcano: "needs-high-ground",
    hurricane: "needs-coast", "air-crash": "needs-airport", riot: "needs-crime" };
  for (const [kind, code] of Object.entries(needs)) {
    const receipt = trigger(kind);
    test.assert(!receipt.accepted && receipt.code === code, `${kind} is refused on a plain, empty map (${receipt.code})`);
  }
  must(state, "place-facility", { kind: "nuclear", x: 40, y: 40 }, "nuclear");
  test.assert(trigger("meltdown", 5, 5).accepted && state.disaster.x === 42 && state.disaster.y === 42, "a meltdown starts at the nuclear plant, not where the menu pointed");
  for (let y = 50; y < 53; y += 1) for (let x = 8; x < 11; x += 1) state.alt[y * 64 + x] = 9;
  state.alt[51 * 64 + 9] = 10;
  test.assert(trigger("volcano").accepted && state.disaster.x === 9 && state.disaster.y === 51, "a volcano rises from the highest ground");
  state.water[60 * 64 + 60] = 1; state.salt[60 * 64 + 60] = 1;
  test.assert(trigger("hurricane").accepted && state.disaster.x === 60 && state.disaster.y === 60, "a hurricane comes in off the sea");
  state.zone[5 * 64 + 50] = sim.ZONE.AIRPORT;
  test.assert(trigger("air-crash").accepted && state.disaster.x === 50 && state.disaster.y === 5, "an air crash happens at the airport");
  state.zone[20 * 64 + 20] = sim.ZONE.R; state.crime[20 * 64 + 20] = 90;
  test.assert(trigger("riot").accepted && state.disaster.x === 20 && state.disaster.y === 20, "a riot breaks out in the worst block");

  const woods = flatCity(24);
  for (let i = 0; i < 64 * 64; i += 1) woods.tree[i] = 1;
  sim.invalidateDerived(woods);
  test.assert(command(woods, "trigger-disaster", { kind: "firestorm", x: 32, y: 32 }).accepted, "a firestorm can start anywhere");
  let inside = 0; let outside = 0;
  for (let i = 0; i < 64 * 64; i += 1) {
    if (!woods.blaze[i]) continue;
    const x = i % 64; const y = (i - x) / 64;
    if ((x - 32) ** 2 + (y - 32) ** 2 <= 144) inside += 1; else outside += 1;
  }
  test.assert(inside > 300 && outside === 0, `a firestorm lights its radius, not the map (${inside} inside, ${outside} outside)`);
}

test.finish();
