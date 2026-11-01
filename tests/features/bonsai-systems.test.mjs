// Bonsai City v2 systems: construction blockers/recovery, density, services,
// finance/history/loans, risks, problem guidance, and deterministic agents.
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-systems");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
const sim = context.window.AISystem6BonsaiSim;

function command(state, type, payload) {
  return sim.submitCommand(state, { schemaVersion: 2, type, payload, targetTick: state.tick, clientCommandId: `${type}-${state.nextCommandSequence}` });
}

function findLandRect(state, width, height, extra = null) {
  for (let y = 1; y <= state.size - height - 1; y += 1) for (let x = 1; x <= state.size - width - 1; x += 1) {
    let clear = true;
    for (let dy = 0; dy < height && clear; dy += 1) for (let dx = 0; dx < width; dx += 1) {
      if (state.water[(y + dy) * state.size + x + dx]) { clear = false; break; }
    }
    if (clear && (!extra || extra(x, y))) return { x, y };
  }
  throw new Error("no land rectangle");
}

// A 2x2 facility needs a level pad at the rect's anchor.
function flatPadAt(state, side) {
  return (x, y) => {
    const base = state.alt[y * state.size + x];
    for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
      if (state.alt[(y + dy) * state.size + x + dx] !== base) return false;
    }
    return true;
  };
}

function wireBasicDistrict(state, density = "high") {
  const base = findLandRect(state, 12, 8, flatPadAt(state, 4));
  // SC2K-faithful outputs (M3a) make a lone wind turbine what it is in the
  // original: a trickle. The starter district runs on coal, like a real
  // SC2K opening.
  // The plant is SC2K's 4x4 pad; the tower, road, and zone sit east of it.
  const plant = { x: base.x, y: base.y };
  const tower = { x: base.x + 5, y: base.y };
  // Every building stands on a street (ROAD_REACH 1): the block has streets
  // on its north, east and south sides.
  const zone = { x: base.x + 5, y: base.y + 2, width: 4, height: 3 };
  test.assert(command(state, "place-facility", { kind: "coal", ...plant }).accepted, "district builds a coal plant");
  test.assert(command(state, "build-path", { network: "road", points: [{ x: zone.x, y: base.y + 1 }, { x: zone.x + zone.width, y: base.y + 1 },
    { x: zone.x + zone.width, y: zone.y + zone.height }, { x: zone.x, y: zone.y + zone.height }] }).accepted, "district builds road access");
  test.assert(command(state, "build-path", { network: "wire", start: { x: base.x + 4, y: base.y }, end: { x: zone.x, y: zone.y } }).accepted, "district connects power");
  test.assert(command(state, "zone-area", { zone: "residential", density, ...zone }).accepted, "district zones a residential area");
  // Ruleset 5: without police, crime drives homes out; the district has one.
  test.assert(command(state, "place-facility", { kind: "police", x: zone.x + zone.width + 1, y: zone.y }).accepted, "district builds a police station");
  return { base, wind: plant, plant, tower, zone };
}

// Water caps a dense block at one-tile buildings (ruleset 5): without it the
// block still grows, but only small houses, and it says why it stays small.
// Restoring water lets the block rebuild as larger lots.
{
  const state = sim.createCity({ seed: 101, size: 64, terrainPreset: "balanced" });
  const district = wireBasicDistrict(state);
  const { width, height } = district.zone;
  const zoneCells = Array.from({ length: width * height }, (_, k) => ({ x: district.zone.x + (k % width), y: district.zone.y + Math.floor(k / width) }));
  let events = [];
  for (let day = 0; day < 300; day += 1) { state.demand = { ...state.demand, r: 60 }; sim.advanceTicks(state, sim.TICKS_PER_DAY); events.push(...sim.drainEvents(state)); }
  const homes = () => state.buildings.filter((building) => building.zone === sim.ZONE.R);
  test.assert(homes().length > 0 && homes().every((building) => building.w === 1), "without water a dense block raises only one-tile buildings");
  test.assert(zoneCells.some(({ x, y }) => { const info = sim.tileInfo(state, x, y); return info.problem?.code === "no-water" && info.problem.action === "connect-water"; }),
    "missing water is reported with positioned guidance");
  test.assert(events.some((event) => event.type === "problem-changed" && Number.isInteger(event.payload.x)), "problem changes carry positions");
  test.assert(events.some((event) => event.type === "construction-started") && events.some((event) => event.type === "building-completed"), "construction emits start and completion facts");
  test.assert(homes().some((building) => building.state === sim.BUILDING_STATE.ACTIVE), "serviced lots complete explicit foundation and construction states");
  test.assert(state.population >= 100, "a serviced starter district exceeds 100 residents in the first year");
  {
    const agentsA = sim.derivedAgentFacts(state);
    const agentsB = sim.derivedAgentFacts(state);
    test.assert(agentsA.vehicles.length > 0 && agentsA.pedestrians.length > 0, "population and roads derive visible agents");
    test.assert(sim.canonicalStringify(agentsA) === sim.canonicalStringify(agentsB), "derived agents are stable facts of seed, tick, and entities");
  }
  test.assert(command(state, "place-facility", { kind: "water-tower", ...district.tower }).accepted, "district builds a water tower");
  test.assert(command(state, "build-path", { network: "pipe", start: district.tower, end: { x: district.zone.x, y: district.zone.y } }).accepted, "district connects its water network");
  test.assert(zoneCells.every(({ x, y }) => sim.tileInfo(state, x, y).watered), "the whole block is watered");
  // Demand is a monthly figure; hold it where a growing town would have it
  // so the block has a reason to build up.
  for (let day = 0; day < 400 && !homes().some((building) => building.w > 1); day += 1) {
    state.demand = { ...state.demand, r: 60 };
    sim.advanceTicks(state, sim.TICKS_PER_DAY);
  }
  test.assert(homes().some((building) => building.w > 1), "with water, dense homes rebuild as larger lots");
}

// Low density stops at level one under the same service conditions.
{
  const state = sim.createCity({ seed: 102, size: 64 });
  const district = wireBasicDistrict(state, "low");
  command(state, "place-facility", { kind: "water-tower", ...district.tower });
  command(state, "build-path", { network: "pipe", start: district.tower, end: { x: district.zone.x, y: district.zone.y } });
  for (let day = 0; day < 200; day += 1) { state.demand = { ...state.demand, r: 90 }; sim.advanceTicks(state, sim.TICKS_PER_DAY); }
  test.assert(state.buildings.length > 0 && state.buildings.every((building) => building.w === 1 && building.stage === 1), "low-density development is capped at one-tile buildings");
}

// All four services have funding-scaled coverage and enter budget categories.
{
  const state = sim.createCity({ seed: 103, size: 64 });
  const base = findLandRect(state, 12, 4);
  for (const [offset, kind] of ["police", "fire", "school", "clinic"].entries()) {
    test.assert(command(state, "place-facility", { kind, x: base.x + offset * 2, y: base.y }).accepted, `${kind} facility is placeable`);
  }
  const police = { x: base.x, y: base.y };
  const fullStrength = sim.tileInfo(state, police.x + 5, police.y).policeStrength;
  test.assert(sim.tileInfo(state, police.x + 5, police.y).policeCovered && fullStrength > 0, "full police funding covers distance five");
  test.assert(sim.tileInfo(state, police.x + 1, police.y).policeStrength > fullStrength, "police strength fades with distance");
  command(state, "set-policy", { policy: "funding", service: "police", level: 50 });
  test.assert(sim.tileInfo(state, police.x + 5, police.y).policeStrength < fullStrength, "half police funding weakens coverage");
  sim.advanceTicks(state, sim.TICKS_PER_DAY * 30);
  const report = sim.cityReport(state);
  test.assert(report.budget.police > 0 && report.budget.fire > 0 && report.budget.schools > 0 && report.budget.health > 0, "budget separates the service categories");
}

// SC2K bonds: $10,000 each, deterministic rate, monthly interest, individual
// repayment; the R/C/I tax split feeds the income lines; ordinances carry
// their own income and cost; history keeps 120 months.
{
  const state = sim.createCity({ seed: 104, size: 64 });
  const funds = state.funds;
  const issue = command(state, "set-policy", { policy: "bond", action: "issue" });
  test.assert(issue.accepted && state.funds === funds + sim.BOND_PRINCIPAL && state.bonds.length === 1, "issuing a bond adds its principal");
  test.assert(command(state, "set-policy", { policy: "bond", action: "issue" }).accepted && state.bonds.length === 2, "several bonds can float at once");
  const legacy = command(state, "set-policy", { policy: "loan", amount: 5000 });
  test.assert(legacy.accepted && state.bonds.length === 3, "the legacy loan policy issues a bond");
  sim.advanceTicks(state, sim.TICKS_PER_DAY * 25);
  test.assert(state.budget.bondInterest > 0 && state.history.length === 1, "monthly settlement charges bond interest and records history");
  const before = state.funds;
  const repay = command(state, "set-policy", { policy: "bond", action: "repay", index: 2 });
  test.assert(repay.accepted && state.bonds.length === 2 && state.funds === before - 5000, "a bond repays its own principal");
  command(state, "set-policy", { policy: "tax-rates", r: 4, c: 12, i: 20 });
  test.assert(state.taxRates.r === 4 && state.taxRates.c === 12 && state.taxRates.i === 20 && state.taxRate === 12, "the three property tax rates split and keep a mean");
  const enact = command(state, "set-policy", { policy: "ordinance", id: "salesTax", enacted: true });
  test.assert(enact.accepted && state.ordinances.salesTax === true, "an ordinance enacts by id");
  test.assert(command(state, "set-policy", { policy: "ordinance", id: "notAThing", enacted: true }).code === "ordinance", "an unknown ordinance is refused");
  command(state, "set-policy", { policy: "ordinance", id: "nuclearFreeZone", enacted: true });
  const blocked = command(state, "place-facility", { kind: "nuclear", x: 10, y: 10 });
  test.assert(!blocked.accepted && (blocked.code === "nuclear-free-zone" || blocked.code === "tech-year"), "the nuclear-free zone blocks nuclear plants");
  state.history = Array.from({ length: 119 }, (_, tick) => ({ tick, demand: { r: 0, c: 0, i: 0 } }));
  sim.advanceTicks(state, sim.TICKS_PER_DAY * 50);
  test.assert(state.history.length === 120 && state.history[0].tick === 1, "history retains only the most recent 120 months");
}

// A road-connected station activates its rail graph, jobs, land value, and report.
{
  function railScenario() {
    const state = sim.createCity({ seed: 6202, size: 64, terrainPreset: "balanced" });
    test.assert(command(state, "build-path", { network: "road", start: { x: 14, y: 2 }, end: { x: 20, y: 2 } }).accepted, "rail scenario builds station road access");
    test.assert(command(state, "build-path", { network: "rail", start: { x: 14, y: 5 }, end: { x: 20, y: 5 } }).accepted, "rail scenario builds a connected rail line");
    const before = sim.tileInfo(state, 16, 3).landValue;
    test.assert(command(state, "place-facility", { kind: "station", x: 14, y: 3 }).accepted, "a station requires and accepts adjacent road and rail");
    return { state, before };
  }
  const first = railScenario();
  const second = railScenario();
  const report = sim.cityReport(first.state);
  test.assert(report.railService.connectedStations === 1 && report.railService.connectedRailTiles === 7
    && report.railService.jobs === 20 && first.state.jobs === 20, "connected rail adds deterministic station jobs and capacity");
  test.assert(sim.derivedAgentFacts(first.state).trains.length === 2, "connected stations derive trains without a second simulation source");
  test.assert(sim.tileInfo(first.state, 16, 3).railOk && !sim.tileInfo(first.state, 40, 40).railOk, "a connected station marks its rail service reach");
  test.assert(await sim.checkpoint(first.state) === await sim.checkpoint(second.state), "rail and station commands replay deterministically");
  const loaded = sim.deserialize(sim.serialize(first.state));
  test.assert(sim.cityReport(loaded).railService.connectedStations === 1
    && await sim.checkpoint(loaded) === await sim.checkpoint(first.state), "rail service survives save reconstruction");
  command(first.state, "demolish-area", { x: 14, y: 2, width: 7, height: 1 });
  test.assert(sim.cityReport(first.state).railService.connectedStations === 0
    && sim.derivedAgentFacts(first.state).trains.length === 0, "removing station road access deactivates rail service and derived trains");
}

// Pollution, crime, fire risk, happiness, and reports are deterministic.
{
  const first = sim.createCity({ seed: 105, size: 64 });
  const second = sim.createCity({ seed: 105, size: 64 });
  for (const state of [first, second]) {
    const base = findLandRect(state, 8, 5);
    // Coal needs level ground; use a one-tile wind plant if this terrain does not offer it.
    const power = command(state, "place-facility", { kind: "coal", x: base.x, y: base.y });
    if (!power.accepted) command(state, "place-facility", { kind: "wind", x: base.x, y: base.y });
    command(state, "zone-area", { zone: "industrial", density: "high", x: base.x + 3, y: base.y, width: 2, height: 2 });
    // A standing one-tile factory, written straight into the lot layers.
    const anchor = base.y * state.size + base.x + 3;
    state.lot[anchor] = anchor + 1; state.stage[anchor] = 1; state.variant[anchor] = 9;
    state.buildingState[anchor] = sim.BUILDING_STATE.ACTIVE;
    sim.invalidateDerived(state);
    sim.ensureDerived(state);
  }
  const report = sim.cityReport(first);
  test.assert(typeof report.pollution === "number" && typeof report.crime === "number" && typeof report.fireRisk === "number" && typeof report.happiness === "number", "city report includes all risk and wellbeing metrics");
  test.assert(sim.canonicalStringify(report) === sim.canonicalStringify(sim.cityReport(second)), "systems report is deterministic across identical scenarios");
  const loaded = sim.deserialize(sim.serialize(first));
  test.assert(await sim.checkpoint(loaded) === await sim.checkpoint(first), "systems and finance round-trip to the same checkpoint");
}

// Render snapshots expose the actual derived overlay layers without durable mutation.
{
  const state = sim.createCity({ seed: 106, size: 64 });
  const base = findLandRect(state, 8, 3);
  command(state, "place-facility", { kind: "police", x: base.x, y: base.y });
  command(state, "place-facility", { kind: "fire", x: base.x + 2, y: base.y });
  command(state, "place-facility", { kind: "school", x: base.x + 4, y: base.y });
  command(state, "place-facility", { kind: "clinic", x: base.x + 6, y: base.y });
  const before = sim.canonicalStringify(sim.serialize(state));
  const snapshot = sim.buildRenderSnapshot(state);
  test.assert(snapshot.landValue === state.landValue && snapshot.policeCovered === state.policeCovered
    && snapshot.fireCovered === state.fireCovered && snapshot.educationCovered === state.educationCovered
    && snapshot.healthCovered === state.healthCovered, "render snapshot exposes the live derived land and service layers");
  test.assert(snapshot.policeCovered.some(Boolean) && snapshot.fireCovered.some(Boolean)
    && snapshot.educationCovered.some(Boolean) && snapshot.healthCovered.some(Boolean), "snapshot service overlays contain real computed coverage");
  test.assert(sim.canonicalStringify(sim.serialize(state)) === before, "building a render snapshot does not mutate durable state");
}

// Zoned land has to be level, so these two contracts build on a bench of one
// altitude rather than whatever dry ground comes first.
function findFlatRect(state, width, height) {
  for (let y = 1; y <= state.size - height - 1; y += 1) for (let x = 1; x <= state.size - width - 1; x += 1) {
    let clear = true;
    const alt = state.alt[y * state.size + x];
    for (let dy = 0; dy < height && clear; dy += 1) for (let dx = 0; dx < width; dx += 1) {
      const i = (y + dy) * state.size + x + dx;
      if (state.water[i] || state.alt[i] !== alt) { clear = false; break; }
    }
    if (clear) return { x, y };
  }
  throw new Error("no flat land rectangle");
}

// Zoning is the gesture a player spends the whole game on, so a drag has to
// lay down the land it legally can and step over the rest. Rejecting the whole
// rectangle made zoning impossible the moment a road ran through it.
{
  const state = sim.createCity({ seed: 404, size: 64 });
  const base = findFlatRect(state, 8, 3);
  const row = base.y + 1;
  command(state, "build-path", { network: "road", points: [{ x: base.x + 3, y: row }] });

  const across = sim.previewCommand(state, {
    schemaVersion: 2, type: "zone-area", targetTick: state.tick, clientCommandId: "zone-across",
    payload: { zone: "residential", density: "low", x: base.x, y: row, width: 8, height: 1 },
  });
  test.assert(across.accepted, "a zone drag that crosses a road still zones the free land");
  test.assert(across.footprint.tiles.length === 7
    && !across.footprint.tiles.some((tile) => tile.x === base.x + 3 && tile.y === row),
    "the drag skips the road tile instead of failing, and is billed for seven tiles");
  test.assert(across.cost === 7 * sim.unitCost({ type: "zone-area", payload: { density: "low" } }),
    "a partially applied drag charges only for the tiles it zones");

  const onlyRoad = sim.previewCommand(state, {
    schemaVersion: 2, type: "zone-area", targetTick: state.tick, clientCommandId: "zone-road",
    payload: { zone: "residential", density: "low", x: base.x + 3, y: row, width: 1, height: 1 },
  });
  test.assert(!onlyRoad.accepted && onlyRoad.code === "occupied" && onlyRoad.cost === 0,
    "a drag with nothing left to zone still reports why, and charges nothing");

  const offMap = sim.previewCommand(state, {
    schemaVersion: 2, type: "zone-area", targetTick: state.tick, clientCommandId: "zone-off",
    payload: { zone: "residential", density: "low", x: state.size - 2, y: row, width: 8, height: 1 },
  });
  test.assert(!offMap.accepted && offMap.code === "bounds", "an area running off the map is still refused whole");
}

// A power shortage must be resolved by the player, not by the city eating
// itself: an abandoned block keeps its place in the queue, so the shortage
// that emptied it survives and the neighbourhood stops cycling.
{
  // A bench this large is not on every map, so walk seeds until one has it.
  let state = null;
  let base = null;
  for (let seed = 405; seed < 445 && !base; seed += 1) {
    const candidate = sim.createCity({ seed, size: 64 });
    try { base = findFlatRect(candidate, 12, 10); state = candidate; } catch { base = null; }
  }
  if (!base) throw new Error("no map in the search range offers a 12x10 bench");
  // One turbine, then far more zoned land than it can ever carry: 60
  // high-density plots draw 120 against a capacity of roughly 80.
  // Neither utility travels down a road, so both run along the top and then
  // turn down the free column beside the plots.
  const spine = base.x + 10;
  command(state, "place-facility", { kind: "wind", x: base.x, y: base.y });
  for (let k = 1; k <= 10; k += 1) command(state, "build-path", { network: "wire", points: [{ x: base.x + k, y: base.y } ] });
  command(state, "build-path", { network: "wire", points: [{ x: spine, y: base.y }, { x: spine, y: base.y + 9 }] });
  command(state, "place-facility", { kind: "water-tower", x: base.x, y: base.y + 1 });
  for (let k = 1; k <= 10; k += 1) command(state, "build-path", { network: "pipe", points: [{ x: base.x + k, y: base.y + 1 }] });
  command(state, "build-path", { network: "pipe", points: [{ x: spine, y: base.y + 1 }, { x: spine, y: base.y + 9 }] });
  command(state, "build-path", { network: "road", points: [{ x: base.x, y: base.y + 2 }, { x: base.x + 11, y: base.y + 2 }] });
  command(state, "build-path", { network: "road", points: [{ x: base.x, y: base.y + 6 }, { x: base.x + 11, y: base.y + 6 }] });
  command(state, "zone-area", { zone: "residential", density: "high", x: base.x, y: base.y + 3, width: 10, height: 3 });
  command(state, "zone-area", { zone: "residential", density: "high", x: base.x, y: base.y + 7, width: 10, height: 3 });
  command(state, "place-facility", { kind: "police", x: base.x + 11, y: base.y + 4 });
  sim.advanceTicks(state, 400);

  const shortage = sim.cityReport(state);
  const abandoned = [];
  for (let i = 0; i < state.size * state.size; i += 1) {
    if (state.zone[i] && state.buildingState[i] === sim.BUILDING_STATE.ABANDONED) abandoned.push(i);
  }
  // What an under-powered district actually does is fail to build, not decay.
  // This used to assert abandonment, and it passed -- but not because of the
  // power shortage. Congestion was in neither `serviced` nor `supplied`, so a
  // congested tile took the decline branch and eventually abandoned; measured
  // in this very scenario, 34 tiles are congested against 15 short of power,
  // and every one of the 15 is still EMPTY because a plot with no power never
  // leaves BUILDING_EMPTY. The assertion was reading the congestion freeze.
  // Congestion now slows growth instead of demolishing it, so the honest
  // consequence of a shortage is the one the grid actually imposes: those
  // plots never develop.
  const starvedPlots = [];
  for (let i = 0; i < state.size * state.size; i += 1) {
    if (state.zone[i] && state.problemCode[i] === 2 && !state.stage[i]) starvedPlots.push(i);
  }
  test.assert(starvedPlots.length > 0, "an under-powered district cannot raise the blocks it zoned");
  test.assert(abandoned.length === 0, "and it does not demolish the blocks it did raise, which congestion used to do");
  test.assert(shortage.powerDemand > shortage.powerCapacity,
    "the shortage is still on the books after the blocks go dark, so the player is told to build capacity");

  // The grid is a ceiling, not a suggestion. Empty plots used to read as
  // connected because they drew nothing, so every plot opened and then died
  // of the shortage together. No sample may exceed what the supply carries.
  const built = () => {
    let count = 0;
    for (let i = 0; i < state.size * state.size; i += 1) if (state.zone[i] && state.stage[i]) count += 1;
    return count;
  };
  const ceiling = shortage.powerCapacity; // every zoned tile draws one unit (ruleset 5)
  const samples = [];
  for (let k = 0; k < 8; k += 1) { sim.advanceTicks(state, 200); samples.push(built()); }
  test.assert(samples.every((count) => count <= ceiling),
    "no more plots stand than the grid can carry, so the district cannot outrun its own supply");
  test.assert(samples.some((count) => count > 0), "the plots the grid can carry do get built");
}

// SC2K plant roster (M3a): tech-year gating, hydro on waterfalls, salt-water
// pumping behind desalination, and the 50-year plant service life.
{
  const early = sim.createCity({ seed: 501, size: 64 });
  const spot = findLandRect(early, 4, 4);
  test.assert(command(early, "place-facility", { kind: "gas", ...spot }).code === "tech-year", "a 1900 city cannot build a gas plant yet");
  const later = sim.createCity({ seed: 501, size: 64, yearFounded: 1950 });
  const laterSpot = findLandRect(later, 4, 4);
  test.assert(command(later, "place-facility", { kind: "gas", ...laterSpot }).accepted, "a 1950 city builds the gas plant");
  test.assert(later.facilities.some((item) => item.kind === "gas" && Number.isInteger(item.builtTick)), "a placed plant records its construction tick");
}
{
  const state = sim.createCity({ seed: 502, size: 64 });
  const land = findLandRect(state, 3, 3);
  test.assert(command(state, "place-facility", { kind: "hydro", ...land }).code === "needs-waterfall", "hydro refuses plain land");
  const i = land.y * state.size + land.x;
  state.water[i] = 1; state.waterKind[i] = 2;
  test.assert(command(state, "place-facility", { kind: "hydro", ...land }).accepted, "hydro stands on the waterfall itself");
}
{
  const state = sim.createCity({ seed: 503, size: 64, yearFounded: 2000 });
  const base = findLandRect(state, 6, 3);
  const salty = { x: base.x, y: base.y };
  state.water[salty.y * state.size + salty.x] = 1; state.salt[salty.y * state.size + salty.x] = 1; state.waterKind[salty.y * state.size + salty.x] = 1;
  const pump = { x: salty.x + 1, y: salty.y };
  test.assert(command(state, "place-facility", { kind: "pump", ...pump }).code === "needs-water", "salt water alone does not feed a pump");
  test.assert(command(state, "place-facility", { kind: "desal", x: base.x + 3, y: base.y + 1 }).accepted, "the city builds a desalination plant");
  test.assert(command(state, "place-facility", { kind: "pump", ...pump }).accepted, "desalination makes the salt shore pumpable");
}
{
  const state = sim.createCity({ seed: 504, size: 64 });
  const spot = findLandRect(state, 2, 2);
  test.assert(command(state, "place-facility", { kind: "wind", ...spot }).accepted, "the expiry city builds a wind turbine");
  const plant = state.facilities.find((item) => item.kind === "wind");
  plant.builtTick = -(50 * 12 * 125);
  sim.advanceTicks(state, 125);
  const events = sim.drainEvents(state);
  test.assert(!state.facilities.some((item) => item.kind === "wind"), "a plant leaves the grid after its 50-year service life");
  test.assert(events.some((event) => event.type === "plant-expired" && event.payload.kind === "wind"), "expiry publishes a plant-expired event");
}

// M3b-1: subways, subway stations, bus depots, and port zones.
{
  const state = sim.createCity({ seed: 505, size: 64, yearFounded: 1950 });
  const base = findLandRect(state, 12, 8);
  test.assert(command(state, "build-path", { network: "road", start: { x: base.x, y: base.y + 2 }, end: { x: base.x + 9, y: base.y + 2 } }).accepted, "transit city builds a road spine");
  test.assert(command(state, "build-path", { network: "subway", points: [{ x: base.x, y: base.y + 3 }, { x: base.x + 6, y: base.y + 3 }] }).accepted, "an underground subway line is buildable regardless of surface slopes");
  test.assert(command(state, "place-facility", { kind: "subway-station", x: base.x + 1, y: base.y + 3 }).code !== "tech-year", "subways are available by 1950");
  const stationResult = command(state, "place-facility", { kind: "subway-station", x: base.x + 2, y: base.y + 3 });
  test.assert(stationResult.accepted || state.facilities.some((item) => item.kind === "subway-station"), "a subway station stands where road and subway meet");
  sim.ensureDerived(state);
  test.assert(state.subwayService.connectedStations >= 1 && state.subwayService.connectedSubwayTiles >= 5,
    "a road-served station connects the whole subway line");
  test.assert(state.subwayService.passengerCapacity > 0, "a connected subway offers passenger capacity to the commute");
  test.assert(command(state, "place-facility", { kind: "bus", x: base.x + 4, y: base.y + 1 }).accepted, "a bus depot stands beside the road");
  sim.ensureDerived(state);
  test.assert(state.busService.depots === 1 && state.busService.roadTrafficRelief > 0, "a road-served bus depot relieves traffic");
  const isolated = command(state, "place-facility", { kind: "subway-station", x: base.x + 8, y: base.y + 6 });
  test.assert(!isolated.accepted && isolated.code === "needs-transport", "a station without road and subway is refused");
}

// M3b-2b: highways are two tiles wide and carry traffic only through onramps.
{
  const state = sim.createCity({ seed: 508, size: 64 });
  const base = findLandRect(state, 14, 8, flatPadAt(state, 4));
  test.assert(command(state, "terraform-area", { mode: "level", x: base.x, y: base.y + 2, width: 13, height: 3 }).accepted, "the highway corridor levels first");
  test.assert(command(state, "build-path", { network: "road", start: { x: base.x, y: base.y + 2 }, end: { x: base.x + 11, y: base.y + 2 } }).accepted, "a road spine runs beside the corridor");
  const ribbon = command(state, "build-path", { network: "highway", points: [{ x: base.x + 1, y: base.y + 3 }, { x: base.x + 9, y: base.y + 3 }] });
  test.assert(ribbon.accepted, "a highway ribbon is buildable");
  test.assert(
    state.highway[(base.y + 3) * state.size + base.x + 4] === 1 && state.highway[(base.y + 4) * state.size + base.x + 4] === 1,
    "every dragged point stamps a 2x2 pad, so the ribbon is two tiles wide"
  );
  const lonely = command(state, "build-path", { network: "onramp", points: [{ x: base.x + 5, y: base.y + 7 }] });
  test.assert(!lonely.accepted && lonely.code === "onramp-connection", "an onramp away from road and highway is refused");
  sim.ensureDerived(state);
  test.assert(!state.highwayService.inService, "a highway without onramps carries nothing");
  test.assert(command(state, "build-path", { network: "onramp", points: [{ x: base.x + 1, y: base.y + 2 }] }).accepted, "the west onramp joins road and highway");
  sim.ensureDerived(state);
  test.assert(state.highwayService.onramps === 1 && !state.highwayService.inService, "one onramp is an entrance without an exit — still no relief");
  test.assert(command(state, "build-path", { network: "onramp", points: [{ x: base.x + 9, y: base.y + 2 }] }).accepted, "the east onramp joins road and highway");
  sim.ensureDerived(state);
  test.assert(state.highwayService.onramps === 2 && state.highwayService.inService, "an entrance and an exit put the highway in service");
  test.assert(state.highwayService.connectedHighwayTiles >= 16, "the whole ribbon connects through its onramps");
  sim.advanceTicks(state, 125);
  test.assert(state.budget.highways > 0, "highway mileage accrues on its own funding line");
  const undoTarget = state.highway.reduce((sum, value) => sum + value, 0);
  test.assert(undoTarget >= 18, "the ribbon holds its stamped tiles after a month");
}

// M6-3: moving things — a working airport keeps one airplane aloft.
{
  const state = sim.createCity({ seed: 509, size: 64 });
  const base = findLandRect(state, 14, 10, flatPadAt(state, 4));
  test.assert(command(state, "place-facility", { kind: "coal", x: base.x, y: base.y }).accepted, "the airfield city builds a plant");
  test.assert(command(state, "build-path", { network: "road", start: { x: base.x + 5, y: base.y + 1 }, end: { x: base.x + 10, y: base.y + 1 } }).accepted, "the airfield city builds a road");
  test.assert(command(state, "build-path", { network: "wire", start: { x: base.x + 4, y: base.y + 2 }, end: { x: base.x + 5, y: base.y + 2 } }).accepted, "the airfield city connects power");
  test.assert(command(state, "zone-area", { zone: "airport", x: base.x + 5, y: base.y + 2, width: 4, height: 3 }).accepted, "the airfield city zones an airport");
  test.assert(state.things.length === 0, "no thing exists before the port works");
  sim.advanceTicks(state, 125);
  const plane = state.things.find((thing) => thing.kind === "airplane");
  test.assert(!!plane && plane.z > 0, "a powered, road-served airport puts one airplane aloft");
  test.assert(sim.drainEvents(state).some((event) => event.type === "thing-appeared" && event.payload.kind === "airplane"),
    "the arrival publishes a thing-appeared event");
  const seen = new Set();
  for (let sample = 0; sample < 10; sample += 1) {
    sim.advanceTicks(state, 10);
    const current = state.things.find((thing) => thing.kind === "airplane");
    test.assert(!!current && current.x >= 0 && current.x < 64 && current.y >= 0 && current.y < 64, "the airplane stays inside the map");
    seen.add(`${current.x}:${current.y}`);
  }
  test.assert(seen.size >= 2, "the airplane actually flies");
  const twin = sim.createCity({ seed: 509, size: 64 });
  const replay = (target) => {
    command(target, "place-facility", { kind: "coal", x: base.x, y: base.y });
    command(target, "build-path", { network: "road", start: { x: base.x + 5, y: base.y + 1 }, end: { x: base.x + 10, y: base.y + 1 } });
    command(target, "build-path", { network: "wire", start: { x: base.x + 4, y: base.y + 2 }, end: { x: base.x + 5, y: base.y + 2 } });
    command(target, "zone-area", { zone: "airport", x: base.x + 5, y: base.y + 2, width: 4, height: 3 });
    sim.advanceTicks(target, 225);
  };
  replay(twin);
  const twinPlane = twin.things.find((thing) => thing.kind === "airplane");
  const originalAt = state.things.find((thing) => thing.kind === "airplane");
  test.assert(!!twinPlane && twinPlane.x === originalAt.x && twinPlane.y === originalAt.y && twinPlane.dir === originalAt.dir,
    "twin cities fly their airplanes along the same deterministic path");
  test.assert(command(state, "demolish-area", { x: base.x + 3, y: base.y + 2, width: 4, height: 3 }).accepted, "the airport is bulldozed");
  sim.advanceTicks(state, 125);
  test.assert(!state.things.some((thing) => thing.kind === "airplane"), "the airplane departs when the airport is gone");
}

// M8-2: the terrain editor — a timeless, free place before the city exists.
{
  const editor = sim.createCity({ seed: 510, size: 64, terrainPreset: "mountain", founded: false });
  test.assert(editor.founded === false, "a city can start unfounded");
  let waterTiles = 0; let peak = 0;
  for (let i = 0; i < 64 * 64; i += 1) { if (editor.water[i]) waterTiles += 1; peak = Math.max(peak, editor.alt[i]); }
  test.assert(waterTiles < 64 * 64 * 0.1, "the mountain preset keeps only the deepest valleys wet");
  test.assert(peak >= 12, "the mountain preset raises a real ridge");
  const base = findLandRect(editor, 6, 6);
  const fundsBefore = editor.funds;
  test.assert(command(editor, "terraform-area", { mode: "raise", x: base.x, y: base.y, width: 2, height: 2 }).accepted, "sculpting works before founding");
  test.assert(editor.funds === fundsBefore, "sculpting is free before founding");
  const blocked = command(editor, "zone-area", { zone: "residential", x: base.x, y: base.y + 3, width: 2, height: 2 });
  test.assert(!blocked.accepted && blocked.code === "not-founded", "zoning waits for the founding");
  sim.advanceTicks(editor, 50);
  test.assert(editor.tick === 0, "time stands still in the editor");
  const restored = sim.deserialize(sim.serialize(editor));
  test.assert(restored.founded === false, "the unfounded state survives the save round-trip");
  test.assert(command(editor, "set-policy", { policy: "found-city" }).accepted, "founding is a command");
  test.assert(editor.founded === true, "the city is founded");
  const again = command(editor, "set-policy", { policy: "found-city" });
  test.assert(!again.accepted && again.code === "already-founded", "a city founds only once");
  sim.advanceTicks(editor, 5);
  test.assert(editor.tick === 5, "the clock runs after founding");
  test.assert(command(editor, "zone-area", { zone: "residential", x: base.x, y: base.y + 3, width: 2, height: 2 }).accepted, "zoning works after founding");
  const paid = editor.funds;
  test.assert(command(editor, "terraform-area", { mode: "raise", x: base.x + 4, y: base.y + 4, width: 1, height: 1 }).accepted && editor.funds < paid,
    "sculpting costs money once the city exists");
}
{
  const port = sim.createCity({ seed: 506, size: 64 });
  const plain = sim.createCity({ seed: 506, size: 64 });
  const base = findLandRect(port, 12, 10, flatPadAt(port, 4));
  for (const state of [port, plain]) {
    test.assert(command(state, "place-facility", { kind: "coal", x: base.x, y: base.y }).accepted, "port comparison city builds a coal plant");
    test.assert(command(state, "build-path", { network: "road", start: { x: base.x, y: base.y + 8 }, end: { x: base.x + 9, y: base.y + 8 } }).accepted, "port comparison city builds a road");
    test.assert(command(state, "build-path", { network: "wire", start: { x: base.x, y: base.y }, end: { x: base.x, y: base.y + 8 } }).accepted, "port comparison city wires the shore");
  }
  test.assert(command(port, "zone-area", { zone: "seaport", x: base.x + 2, y: base.y + 7, width: 2, height: 2 }).code === "port-too-small", "an undersized seaport is refused");
  test.assert(command(port, "zone-area", { zone: "seaport", x: base.x + 1, y: base.y + 6, width: 4, height: 2 }).accepted, "a full-size seaport zone is accepted");
  test.assert(port.zone[(base.y + 6) * port.size + base.x + 1] === sim.ZONE.SEAPORT, "seaport tiles carry the SC2K zone value");
  sim.advanceTicks(port, 125); sim.advanceTicks(plain, 125);
  test.assert(sim.demandReport(port).market > sim.demandReport(plain).market, "a powered, road-served seaport lifts industrial demand");
}

// M3b-2a: bridges — roads, rails, and power lines cross water at bridge
// prices; pipes stop at the shore. Founded in 1950 so subway stations
// (1910) exist for the ruleset 6 checks below.
{
  const state = sim.createCity({ seed: 507, size: 64, terrainPreset: "river", yearFounded: 1950 });
  let crossing = null;
  for (let y = 4; y < state.size - 4 && !crossing; y += 1) {
    for (let x = 2; x < state.size - 12; x += 1) {
      const i = y * state.size + x;
      if (state.water[i] || !(() => { for (let n = 1; n <= 10; n += 1) if (state.water[i + n]) return true; return false; })()) continue;
      let end = x + 1;
      while (end < state.size - 1 && state.water[y * state.size + end]) end += 1;
      if (end > x + 1 && end < state.size - 1 && !state.water[y * state.size + end]
        && state.water[y * state.size + x + 1]) { crossing = { y, from: x, to: end }; break; }
    }
  }
  test.assert(!!crossing, "the river preset offers a crossing to test");
  const span = crossing.to - crossing.from + 1;
  const bridge = command(state, "build-path", { network: "road", start: { x: crossing.from, y: crossing.y }, end: { x: crossing.to, y: crossing.y } });
  test.assert(bridge.accepted, "a road bridges the river");
  test.assert(bridge.cost > span * 10, "the water tiles are charged at bridge prices");
  test.assert(command(state, "build-path", { network: "wire", start: { x: crossing.from, y: crossing.y }, end: { x: crossing.to, y: crossing.y } }).accepted, "power lines cross the river on pylons");
  const pipe = command(state, "build-path", { network: "pipe", start: { x: crossing.from, y: crossing.y }, end: { x: crossing.to, y: crossing.y } });
  test.assert(!pipe.accepted && pipe.code === "water", "pipes stop at the shore");

  // Ruleset 6 (owner decision 2026-10-02): a subway tunnels under the river
  // at 300 a water tile, four rail bridge tiles; its stations stay ashore.
  let wet = 0;
  for (let x = crossing.from; x <= crossing.to; x += 1) if (state.water[crossing.y * state.size + x]) wet += 1;
  const line = { network: "subway", start: { x: crossing.from, y: crossing.y }, end: { x: crossing.to, y: crossing.y } };
  const expected = wet * 300 + (span - wet) * 100;
  const preview = sim.previewCommand(state, { schemaVersion: 2, type: "build-path", payload: line, targetTick: state.tick });
  const fundsBefore = state.funds;
  const subway = command(state, "build-path", line);
  test.assert(sim.COSTS.crossing.subway === 300 && sim.COSTS.crossing.subway === 4 * sim.COSTS.crossing.rail, "an underwater subway tile is priced at four rail bridge tiles");
  test.assert(wet > 0 && subway.accepted && subway.cost === expected && subway.tunnelCost === wet * 300 && fundsBefore - state.funds === expected,
    `a subway crosses the river and is billed 300 a water tile (${wet} wet, ${span - wet} dry: $${subway.cost}, expected $${expected})`);
  test.assert(preview.accepted && preview.cost === subway.cost && preview.tunnelCost === subway.tunnelCost, "the drag preview shows the price the commit bills");
  const wetTile = (() => { for (let x = crossing.from; x <= crossing.to; x += 1) if (state.water[crossing.y * state.size + x]) return x; return -1; })();
  test.assert(state.subway[crossing.y * state.size + wetTile] === 1, "the tunnel tile is a subway tile on the water tile");
  const station = command(state, "place-facility", { kind: "subway-station", x: wetTile, y: crossing.y });
  test.assert(!station.accepted && station.code === "water", "a subway station stays on land");
  test.assert(bridge.tunnelCost === 0, "a road bridge reports no tunnel share; only a subway drag does");
  sim.undo(state);
  test.assert(state.funds === fundsBefore && state.subway[crossing.y * state.size + wetTile] === 0, "undo takes the tunnel back with its full price");
  // Same seed and commands, same city: the tunnel is part of the deterministic replay.
  async function replay() {
    const city = sim.createCity({ seed: 507, size: 64, terrainPreset: "river", yearFounded: 1950 });
    command(city, "build-path", { network: "road", start: { x: crossing.from, y: crossing.y }, end: { x: crossing.to, y: crossing.y } });
    command(city, "build-path", line);
    sim.advanceTicks(city, 250);
    return sim.checkpoint(city);
  }
  test.assert(await replay() === await replay(), "an underwater subway replays to the same checkpoint");
}

// M4b-1 demographics and tiered graphs: EQ follows school coverage, LE
// follows health coverage, the workforce follows EQ, and the sixteen graph
// series sample monthly with half-year and five-year tiers.
{
  const covered = sim.createCity({ seed: 508, size: 64 });
  const bare = sim.createCity({ seed: 508, size: 64 });
  const { zone } = wireBasicDistrict(covered);
  wireBasicDistrict(bare);
  test.assert(command(covered, "place-facility", { kind: "school", x: zone.x + 1, y: zone.y + zone.height + 1 }).accepted, "demographics city builds a school");
  test.assert(command(covered, "place-facility", { kind: "clinic", x: zone.x + 2, y: zone.y + zone.height + 1 }).accepted, "demographics city builds a clinic");
  sim.advanceTicks(covered, 125 * 14); sim.advanceTicks(bare, 125 * 14);
  test.assert(covered.eq > bare.eq, "school coverage raises EQ over the uncovered twin");
  test.assert(covered.le > bare.le, "health coverage raises LE over the uncovered twin");
  test.assert(covered.workforcePercent >= bare.workforcePercent, "the workforce share follows EQ");
  test.assert(covered.graphs.monthly.residents.length === 12, "the monthly graph tier holds twelve samples");
  test.assert(covered.graphs.halfYearly.residents.length >= 2 && covered.graphs.halfYearly.residents.length <= 20, "the half-year tier accumulates on its own cadence");
  test.assert(sim.GRAPH_SERIES.every((series) => Array.isArray(covered.graphs.monthly[series])), "all sixteen series are tracked");
  const saved = sim.deserialize(sim.serialize(covered));
  test.assert(JSON.stringify(saved.graphs) === JSON.stringify(covered.graphs) && saved.eq === covered.eq && saved.le === covered.le,
    "demographics and graphs survive the save round-trip");
}

// M5-3: the reward ladder offers, gates, and repeats; microsims keep a
// headline figure per tracked facility and prune with demolition.
{
  const state = sim.createCity({ seed: 509, size: 64, yearFounded: 2000 });
  const pad = findLandRect(state, 8, 8, flatPadAt(state, 8));
  test.assert(command(state, "place-facility", { kind: "mayors-house", x: pad.x, y: pad.y }).code === "reward-locked", "rewards stay locked before the ladder offers them");
  test.assert(command(state, "zone-area", { zone: "military", x: pad.x, y: pad.y, width: 2, height: 2 }).code === "reward-locked", "the military zone waits for its reward");
  sim.ensureDerived(state);
  state.population = 2500;
  sim.advanceTicks(state, 5);
  test.assert(state.rewardTier === 1 && state.rewardsOffered.includes("mayors-house"), "crossing 2,000 offers the mayor's house");
  test.assert(command(state, "place-facility", { kind: "mayors-house", x: pad.x, y: pad.y }).accepted, "an offered reward places for free");
  test.assert(command(state, "place-facility", { kind: "mayors-house", x: pad.x + 3, y: pad.y }).code === "reward-placed", "one-shot rewards refuse a second copy");
  sim.ensureDerived(state);
  state.population = 130000;
  sim.advanceTicks(state, 5);
  test.assert(state.rewardTier === 6 && state.rewardsOffered.includes("arco") && state.rewardsOffered.includes("military-base"), "the full ladder unlocks by 120,000");
  test.assert(command(state, "zone-area", { zone: "military", x: pad.x + 4, y: pad.y + 4, width: 2, height: 2 }).accepted, "the offered military base zones for free");
  const arcoA = command(state, "place-facility", { kind: "arco", x: pad.x, y: pad.y + 3 });
  const arcoB = command(state, "place-facility", { kind: "arco", x: pad.x + 4, y: pad.y });
  test.assert(arcoA.accepted && arcoB.accepted, "arcologies repeat once unlocked");
  sim.ensureDerived(state);
  test.assert(state.arcoPopulation === 60000 && sim.cityReport(state).totalPopulation === state.population + 60000,
    "arcologies house their own population and the report totals it");
}
{
  const state = sim.createCity({ seed: 510, size: 64 });
  const pad = findLandRect(state, 4, 4);
  test.assert(command(state, "build-path", { network: "road", start: { x: pad.x, y: pad.y + 1 }, end: { x: pad.x + 3, y: pad.y + 1 } }).accepted, "microsim city builds a road");
  test.assert(command(state, "place-facility", { kind: "police", x: pad.x, y: pad.y }).accepted, "microsim city builds a police station");
  sim.advanceTicks(state, 125);
  const record = state.microsims.find((item) => item.kind === "police");
  test.assert(!!record && record.stat === "arrests" && record.value >= 0, "a tracked facility gains its monthly headline figure");
  test.assert(sim.tileInfo(state, pad.x, pad.y).microsim?.stat === "arrests", "the query dialog reads the facility ledger");
  test.assert(command(state, "demolish-area", { x: pad.x, y: pad.y, width: 1, height: 1 }).accepted, "the station demolishes");
  sim.advanceTicks(state, 125);
  test.assert(!state.microsims.some((item) => item.kind === "police"), "a demolished facility's ledger entry prunes");
}

// M6-1 disasters: deterministic fire spread and burnout to rubble, undo
// stays clean, saves round-trip mid-disaster, and the off switch governs
// only emergent starts.
{
  function treeTile(state) {
    for (let i = 0; i < state.size * state.size; i += 1) if (state.tree[i]) return { x: i % state.size, y: Math.floor(i / state.size) };
    throw new Error("no tree tile");
  }
  const first = sim.createCity({ seed: 511, size: 64 });
  const twin = sim.createCity({ seed: 511, size: 64 });
  const spot = treeTile(first);
  for (const state of [first, twin]) {
    const result = command(state, "trigger-disaster", { kind: "fire", ...spot });
    test.assert(result.accepted, "the disaster menu starts a fire");
    test.assert(state.disaster?.kind === "fire" && state.undoStack.length === 0, "a disaster is active and never enters undo history");
  }
  test.assert(command(first, "trigger-disaster", { kind: "flood", ...spot }).code === "disaster-active", "one disaster at a time");
  sim.advanceTicks(first, 10); sim.advanceTicks(twin, 10);
  const middle = sim.deserialize(sim.serialize(first));
  test.assert(middle.disaster?.kind === "fire" && JSON.stringify(Array.from(middle.blaze)) === JSON.stringify(Array.from(first.blaze)),
    "a mid-disaster save keeps the fire and the burn map");
  sim.advanceTicks(first, 300); sim.advanceTicks(twin, 300);
  test.assert(first.disaster === null, "the fire burns out");
  let rubble = 0;
  for (let i = 0; i < first.size * first.size; i += 1) if (first.catalogId[i] >= 1 && first.catalogId[i] <= 4) rubble += 1;
  test.assert(rubble > 0, "burnt tiles fall to rubble");
  const [hashA, hashB] = await Promise.all([sim.checkpoint(first), sim.checkpoint(twin)]);
  test.assert(hashA === hashB, "the same fire on twin cities is byte-identical");
}
{
  const state = sim.createCity({ seed: 512, size: 64 });
  test.assert(command(state, "set-policy", { policy: "disasters", enabled: false }).accepted && state.disastersOff === true,
    "the disaster switch turns random disasters off");
  const forced = command(state, "trigger-disaster", { kind: "earthquake", x: 20, y: 20 });
  test.assert(forced.accepted, "the menu still works with random disasters off");
  let rubble = 0;
  for (let i = 0; i < state.size * state.size; i += 1) if (state.catalogId[i] >= 1 && state.catalogId[i] <= 4) rubble += 1;
  test.assert(rubble > 0, "an earthquake leaves immediate damage");
}

// M6-2 newspaper: monthly editions from story keys, disaster extras, the
// subscription switch, and full bilingual coverage of every story key.
{
  const state = sim.createCity({ seed: 513, size: 64 });
  sim.advanceTicks(state, 125);
  test.assert(state.newspaper.edition >= 1 && state.newspaper.stories.length >= 1, "a month prints an edition with at least one story");
  test.assert(state.newspaper.stories.every((story) => sim.NEWS_STORY_KEYS.includes(story.key)), "every story uses a registered key");
  const before = state.newspaper.edition;
  command(state, "trigger-disaster", { kind: "earthquake", x: 30, y: 30 });
  test.assert(state.newspaper.edition === before + 1 && state.newspaper.extra === true
    && state.newspaper.stories[0].key === "disaster_earthquake", "a disaster rushes an extra edition");
  const saved = sim.deserialize(sim.serialize(state));
  test.assert(JSON.stringify(saved.newspaper) === JSON.stringify(state.newspaper), "the newspaper survives the save round-trip");
  test.assert(command(state, "set-policy", { policy: "newspaper", enabled: false }).accepted && state.paperDelivery === false,
    "the subscription switch stops delivery notices");
}
{
  const translationSource = read("app/features/bonsai-translations.js");
  for (const key of sim.NEWS_STORY_KEYS) {
    const occurrences = translationSource.split(`bonsai_news_${key}:`).length - 1;
    test.assert(occurrences >= 2, `story key ${key} has copy in both language tables`);
  }
}

// M8-1 scenarios: the runner counts months, fires the scripted disaster,
// wins on met goals, loses at the deadline, and survives the round trip.
{
  const fire = sim.createScenarioCity("after-the-fire");
  test.assert(fire.scenario?.status === "active" && fire.scenario.months === 60, "the fire scenario opens active with its deadline");
  sim.advanceTicks(fire, 125);
  test.assert(fire.scenario.elapsedMonths === 1, "a month of play advances the scenario clock");
  test.assert(fire.scenario.disaster?.fired === true, "the scripted fire arrives on schedule");
  const saved = sim.deserialize(sim.serialize(fire));
  test.assert(JSON.stringify(saved.scenario) === JSON.stringify(fire.scenario), "the scenario record survives the save round-trip");
}
{
  const win = sim.createScenarioCity("deep-in-debt");
  for (const index of [2, 1, 0]) {
    test.assert(command(win, "set-policy", { policy: "bond", action: "repay", index }).accepted, "the debt scenario repays a bond");
  }
  sim.advanceTicks(win, 125);
  test.assert(win.scenario.status === "won", "meeting the goal wins before the deadline");
}
{
  const debt = sim.createScenarioCity("deep-in-debt");
  test.assert(debt.bonds.length === 3 && debt.funds > 30000, "the debt scenario opens owing three bonds");
  const monthsLeft = debt.scenario.months;
  sim.advanceTicks(debt, 125 * (monthsLeft + 1));
  test.assert(debt.scenario.status === "lost", "an unmet deadline loses the scenario");
}

// Save rule 3.1: a coal plant records its 4x4 pad; a record without a
// footprint is an older 2x2 plant and keeps that size, on the map and in the
// query panel.
{
  const state = sim.createCity({ seed: 610, size: 64, terrainPreset: "balanced" });
  const base = findLandRect(state, 12, 6, flatPadAt(state, 4));
  test.assert(command(state, "place-facility", { kind: "coal", x: base.x, y: base.y }).accepted, "a new coal plant takes the SC2K 4x4 pad");
  test.assert(state.facilities[0].w === 4 && state.facilities[0].h === 4, "the record carries its footprint");
  test.assert(state.facilityAt[(base.y + 3) * state.size + base.x + 3] === 0, "the fourth row and column belong to the plant");
  const saved = sim.serialize(state);
  saved.facilities.push({ kind: "coal", x: base.x + 6, y: base.y, builtTick: 0 });
  const loaded = sim.deserialize(saved);
  test.assert(sim.footprintOf(loaded.facilities[1]).w === 2 && loaded.facilityAt[(base.y + 1) * 64 + base.x + 7] === 1 && loaded.facilityAt[(base.y + 2) * 64 + base.x + 8] === -1,
    "an older record without a footprint stays a 2x2 plant");
  test.assert(sim.tileInfo(loaded, base.x + 6, base.y).facilityFootprint.legacy === true && sim.tileInfo(loaded, base.x, base.y).facilityFootprint.legacy === false,
    "the query panel can say which plant is the older size");
  test.assert(sim.serialize(loaded).facilities[1].w === undefined, "a round-trip never invents a footprint for an older record");
  test.assert(command(loaded, "demolish-area", { x: base.x + 7, y: base.y + 1, width: 1, height: 1 }).footprint.tiles.length === 4, "demolishing the older plant clears its own four tiles");
}

// SC2K-resolution derived grids are a pure read of the current state.
{
  const state = sim.createCity({ seed: 611, size: 96, terrainPreset: "balanced" });
  const grids = sim.sc2DerivedGrids(state);
  test.assert(grids.traffic.length === 64 * 64 && ["pollution", "landValue", "crime", "police", "fire"].every((key) => grids[key].length === 32 * 32), "traffic is 64x64, the five others 32x32");
  const spot = findLandRect(state, 3, 3);
  test.assert(command(state, "place-facility", { kind: "police", x: spot.x, y: spot.y }).accepted, "a police station stands");
  const after = sim.sc2DerivedGrids(state);
  const cell = Math.floor(spot.y * 32 / 96) * 32 + Math.floor(spot.x * 32 / 96);
  test.assert(after.police[cell] > 0 && grids.police[cell] === 0, "police strength appears in the cell that covers the station");
  test.assert(sim.canonicalStringify(Array.from(after.police)) === sim.canonicalStringify(Array.from(sim.sc2DerivedGrids(state).police)), "two reads agree");
  const before = sim.canonicalStringify(sim.serialize(state));
  sim.sc2DerivedGrids(state);
  test.assert(sim.canonicalStringify(sim.serialize(state)) === before, "the read never mutates the save");
}

// Ruleset 6: the Basin's avenue, Yichang- and Guangzhou-style, with its BRT
// in the middle of the road. One drag lays a straight run two tiles wide:
// 25 a new tile on land, 15 to widen a street tile, 60 a new deck over
// water; the halves always come and go as a pair.
{
  const flatDry = (state, x0, y0, w, h) => {
    const base = state.alt[y0 * state.size + x0];
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) {
      const i = y * state.size + x; if (state.water[i] || state.alt[i] !== base) return false;
    }
    return true;
  };
  const back = { 1: 4, 2: 8, 4: 1, 8: 2 };
  const left = { 1: [-1, 0], 2: [0, -1], 4: [1, 0], 8: [0, 1] };
  // Every avenue half is on the road and answered by the tile on its left.
  const paired = (state) => {
    for (let i = 0; i < state.size * state.size; i += 1) {
      const dir = state.avenue[i]; if (!dir) continue;
      const x = (i % state.size) + left[dir][0]; const y = Math.floor(i / state.size) + left[dir][1];
      const j = y * state.size + x;
      if (!state.road[i] || !state.road[j] || state.avenue[j] !== back[dir]) return false;
    }
    return true;
  };
  const state = sim.createCity({ seed: 610, size: 64, yearFounded: 1920 });
  let spot = null;
  for (let y = 2; y < state.size - 10 && !spot; y += 1) for (let x = 2; x < state.size - 22 && !spot; x += 1) if (flatDry(state, x, y, 20, 8)) spot = { x, y };
  test.assert(!!spot, "the avenue test city has a flat block to build on");
  const { x: X, y: Y } = spot;
  // The avenue opens with the BRT, in 1920: a city founded in 1910 waits.
  const early = sim.createCity({ seed: 610, size: 64, yearFounded: 1910 });
  test.assert(command(early, "build-path", { network: "avenue", points: [{ x: X, y: Y + 3 }, { x: X + 9, y: Y + 3 }] }).code === "tech-year" && early.avenue.every((value) => value === 0),
    "a 1910 city cannot lay an avenue yet");
  const at = (x, y) => y * state.size + x;
  test.assert(command(state, "build-path", { network: "road", start: { x: X + 2, y: Y + 3 }, end: { x: X + 5, y: Y + 3 } }).accepted, "the avenue test city lays a street to widen");
  const run = { network: "avenue", points: [{ x: X, y: Y + 3 }, { x: X + 9, y: Y + 3 }] };
  const preview = sim.previewCommand(state, { schemaVersion: 2, type: "build-path", payload: run, targetTick: state.tick });
  const fundsBefore = state.funds;
  const laid = command(state, "build-path", run);
  test.assert(laid.accepted && laid.cost === 4 * 15 + 16 * 25 && fundsBefore - state.funds === laid.cost,
    `ten pairs over a four-tile street bill 4 x 15 + 16 x 25 (billed $${laid.cost})`);
  test.assert(preview.accepted && preview.cost === laid.cost && preview.footprint.tiles.length === 20, "the drag preview shows the price the commit bills, tile for tile");
  test.assert(sim.unitCost({ type: "build-path", payload: { network: "avenue" } }) === 25 && sim.AVENUE.costs.upgrade === 15 && sim.COSTS.crossing.avenue === 60,
    "the listed prices are 25 a new tile, 15 a widened one, 60 a new deck");
  let eastWest = true;
  for (let x = X; x <= X + 9; x += 1) eastWest &&= state.avenue[at(x, Y + 3)] === 8 && state.avenue[at(x, Y + 4)] === 2 && state.road[at(x, Y + 3)] === 1 && state.road[at(x, Y + 4)] === 1;
  test.assert(eastWest && state.avenue[at(X + 10, Y + 3)] === 0, "an east-west avenue's north half runs west (8), its south half east (2), and both are road");
  test.assert(paired(state), "every half has its partner on the driver's left");
  const partner = sim.AVENUE.partner(state, X + 4, Y + 3);
  test.assert(partner && partner.x === X + 4 && partner.y === Y + 4, "the core names a half's partner");
  test.assert(command(state, "build-path", run).code === "empty", "laying the same avenue again changes nothing and is refused as empty");
  const longer = command(state, "build-path", { network: "avenue", points: [{ x: X + 5, y: Y + 3 }, { x: X + 14, y: Y + 3 }] });
  test.assert(longer.accepted && longer.cost === 10 * 25, `extending the run bills only the five new pairs (billed $${longer.cost})`);
  // A north-south avenue across it: the west half runs south (4), the east
  // half north (1); where the two cross, the junction keeps the halves that
  // were there.
  const across = command(state, "build-path", { network: "avenue", points: [{ x: X + 12, y: Y }, { x: X + 12, y: Y + 7 }] });
  let northSouth = true;
  for (let y = Y; y <= Y + 7; y += 1) if (y !== Y + 3 && y !== Y + 4) northSouth &&= state.avenue[at(X + 12, y)] === 4 && state.avenue[at(X + 13, y)] === 1;
  test.assert(across.accepted && across.cost === 12 * 25 && northSouth, `a north-south avenue's west half runs south (4) and its east half north (1) (billed $${across.cost})`);
  test.assert(state.avenue[at(X + 12, Y + 3)] === 8 && state.avenue[at(X + 13, Y + 4)] === 2 && paired(state), "the junction keeps the crossing avenue's halves and every half stays paired");
  test.assert(command(state, "build-path", { network: "avenue", points: [{ x: X, y: Y + 4 }, { x: X + 3, y: Y + 4 }] }).code === "occupied",
    "a run that would take one half of an avenue is refused");
  test.assert(command(state, "zone-area", { zone: "residential", density: "low", x: X + 16, y: Y + 1, width: 2, height: 1 }).accepted, "the avenue test city zones a plot");
  test.assert(command(state, "build-path", { network: "avenue", points: [{ x: X + 16, y: Y }, { x: X + 18, y: Y }] }).code === "occupied", "an avenue stops at zoned land, as a street does");
  // Bulldozing one half brings the pair down; undo puts both back.
  const beforeDemolish = state.funds;
  const razed = command(state, "demolish-area", { x: X + 1, y: Y + 3, width: 1, height: 1 });
  const razedTiles = razed.footprint.tiles.map((tile) => `${tile.x},${tile.y}`).sort().join(" ");
  test.assert(razed.accepted && razedTiles === [`${X + 1},${Y + 3}`, `${X + 1},${Y + 4}`].sort().join(" ") && razed.cost === 2 * sim.COSTS.demolish,
    "bulldozing one half takes its partner too, and bills both");
  test.assert(!state.road[at(X + 1, Y + 3)] && !state.road[at(X + 1, Y + 4)] && !state.avenue[at(X + 1, Y + 3)] && !state.avenue[at(X + 1, Y + 4)] && paired(state),
    "neither half survives the bulldozer");
  sim.undo(state);
  test.assert(state.funds === beforeDemolish && state.avenue[at(X + 1, Y + 3)] === 8 && state.avenue[at(X + 1, Y + 4)] === 2 && state.road[at(X + 1, Y + 4)] === 1,
    "undo puts both halves back with the funds");
  sim.undo(state); sim.undo(state); sim.undo(state); sim.undo(state);
  test.assert(state.funds === fundsBefore + 0 && state.avenue.every((value) => value === 0) && state.road[at(X + 2, Y + 3)] === 1 && state.road[at(X + 1, Y + 3)] === 0,
    "undoing the avenues returns every coin and leaves the street that was there");
  // Same seed and commands, same city.
  async function replay() {
    const city = sim.createCity({ seed: 610, size: 64, yearFounded: 1920 });
    command(city, "build-path", { network: "road", start: { x: X + 2, y: Y + 3 }, end: { x: X + 5, y: Y + 3 } });
    command(city, "build-path", run);
    command(city, "build-path", { network: "avenue", points: [{ x: X + 12, y: Y }, { x: X + 12, y: Y + 7 }] });
    sim.advanceTicks(city, 125);
    return sim.checkpoint(city);
  }
  test.assert(await replay() === await replay(), "an avenue replays to the same checkpoint");
}

// The avenue over water: a new deck is 60 a tile, and a road bridge already
// there is widened at 15 like any street tile.
{
  const state = sim.createCity({ seed: 507, size: 64, terrainPreset: "river", yearFounded: 1950 });
  let found = null;
  for (let y = 4; y < state.size - 5 && !found; y += 1) {
    for (let x = 2; x < state.size - 14 && !found; x += 1) {
      const row = (yy) => {
        if (state.water[yy * state.size + x]) return -1;
        let end = x + 1; while (end < state.size - 1 && state.water[yy * state.size + end]) end += 1;
        return end > x + 1 && !state.water[yy * state.size + end] ? end : -1;
      };
      const to = Math.max(row(y), row(y + 1));
      if (row(y) < 0 || row(y + 1) < 0) continue;
      const payload = { network: "avenue", points: [{ x, y }, { x: to, y }] };
      const bridge = sim.previewCommand(state, { schemaVersion: 2, type: "build-path", payload: { network: "road", start: { x, y }, end: { x: to, y } }, targetTick: state.tick });
      if (bridge.accepted && sim.previewCommand(state, { schemaVersion: 2, type: "build-path", payload, targetTick: state.tick }).accepted) found = { x, y, to, payload };
    }
  }
  test.assert(!!found, "the river preset offers a crossing for an avenue");
  test.assert(command(state, "build-path", { network: "road", start: { x: found.x, y: found.y }, end: { x: found.to, y: found.y } }).accepted, "a road bridge crosses first");
  let expected = 0; let decks = 0; let widened = 0;
  for (let x = found.x; x <= found.to; x += 1) for (const y of [found.y, found.y + 1]) {
    const i = y * state.size + x;
    if (state.road[i]) { expected += 15; if (state.water[i]) widened += 1; } else if (state.water[i]) { expected += 60; decks += 1; } else expected += 25;
  }
  const fundsBefore = state.funds;
  const avenue = command(state, "build-path", found.payload);
  test.assert(decks > 0 && widened > 0 && avenue.accepted && avenue.cost === expected && fundsBefore - state.funds === expected,
    `the avenue bills ${decks} new deck tiles at 60 and widens ${widened} bridge tiles at 15 (billed $${avenue.cost}, expected $${expected})`);
  sim.undo(state);
  test.assert(state.funds === fundsBefore, "undo returns the avenue's price");
}

// Congestion counts an avenue half by its two general lanes: the same
// commute on the same two-tile road congests as two streets and flows as an
// avenue. Lots are written straight into the layers so the trip count is
// exact: a 3x3 tower of 770 residents sends 96 trips.
{
  const corridor = (asAvenue) => {
    const state = sim.createCity({ seed: 610, size: 64, yearFounded: 1920 });
    let spot = null;
    for (let y = 2; y < state.size - 8 && !spot; y += 1) for (let x = 2; x < state.size - 22 && !spot; x += 1) {
      const base = state.alt[y * state.size + x]; let flat = true;
      for (let dy = 0; dy < 6 && flat; dy += 1) for (let dx = 0; dx < 20; dx += 1) { const i = (y + dy) * state.size + x + dx; if (state.water[i] || state.alt[i] !== base) { flat = false; break; } }
      if (flat) spot = { x, y };
    }
    const { x: X, y: Y } = spot;
    if (asAvenue) command(state, "build-path", { network: "avenue", points: [{ x: X, y: Y + 3 }, { x: X + 19, y: Y + 3 }] });
    else for (const y of [Y + 3, Y + 4]) command(state, "build-path", { network: "road", start: { x: X, y }, end: { x: X + 19, y } });
    const lot = (ax, ay, zone) => {
      const anchor = ay * state.size + ax;
      for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) {
        const c = anchor + dy * state.size + dx;
        state.zone[c] = zone; state.density[c] = 2; state.stage[c] = 3; state.buildingState[c] = sim.BUILDING_STATE.ACTIVE; state.lot[c] = anchor + 1; state.variant[c] = 0; state.tree[c] = 0;
      }
    };
    lot(X, Y, sim.ZONE.R); lot(X + 17, Y, sim.ZONE.I);
    sim.invalidateDerived(state); sim.ensureDerived(state);
    return { state, X, Y };
  };
  const streets = corridor(false); const avenue = corridor(true);
  const busiest = (city) => { let best = -1; for (let i = 0; i < city.state.size * city.state.size; i += 1) if (city.state.road[i] && (best < 0 || city.state.traffic[i] > city.state.traffic[best])) best = i; return best; };
  const s = busiest(streets); const a = busiest(avenue);
  test.assert(streets.state.traffic[s] === avenue.state.traffic[a] && avenue.state.traffic[a] > sim.CONGESTION_THRESHOLD && avenue.state.traffic[a] <= sim.AVENUE.capacity,
    `both corridors carry the same commute, over a street's capacity and within an avenue's (${avenue.state.traffic[a]} trips)`);
  test.assert(streets.state.congested[s] === 1 && avenue.state.congested[a] === 0 && avenue.state.avenue[a] !== 0, "two streets jam where the avenue flows");
  test.assert(sim.AVENUE.capacity === 2 * sim.CONGESTION_THRESHOLD, "an avenue tile's capacity is twice a street's");
  let consistent = true;
  for (let i = 0; i < avenue.state.size * avenue.state.size; i += 1) {
    if (!avenue.state.road[i]) continue;
    consistent &&= Boolean(avenue.state.congested[i]) === (avenue.state.traffic[i] > (avenue.state.avenue[i] ? sim.AVENUE.capacity : sim.CONGESTION_THRESHOLD));
  }
  test.assert(consistent, "every street tile congests over its own capacity: twice the threshold on an avenue half");
}

// A depot's eight tiles make the avenue halves they cover cheaper to commute
// on, and those halves take a quarter of the car trips without also taking
// the depot's block relief. Halves outside the square stay ordinary roads
// for route cost. Maintenance is unchanged, so hezhou's pinned checkpoint holds.
{
  const corridor = (asAvenue) => {
    const state = sim.createCity({ seed: 610, size: 64, yearFounded: 1920 });
    let spot = null;
    for (let y = 2; y < state.size - 8 && !spot; y += 1) for (let x = 2; x < state.size - 22 && !spot; x += 1) {
      const base = state.alt[y * state.size + x]; let flat = true;
      for (let dy = 0; dy < 6 && flat; dy += 1) for (let dx = 0; dx < 20; dx += 1) { const i = (y + dy) * state.size + x + dx; if (state.water[i] || state.alt[i] !== base) { flat = false; break; } }
      if (flat) spot = { x, y };
    }
    const { x: X, y: Y } = spot;
    if (asAvenue) command(state, "build-path", { network: "avenue", points: [{ x: X, y: Y + 3 }, { x: X + 19, y: Y + 3 }] });
    const lot = (ax, ay, zone) => {
      const anchor = ay * state.size + ax;
      for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) {
        const c = anchor + dy * state.size + dx;
        state.zone[c] = zone; state.density[c] = 2; state.stage[c] = 3; state.buildingState[c] = sim.BUILDING_STATE.ACTIVE; state.lot[c] = anchor + 1; state.variant[c] = 0; state.tree[c] = 0;
      }
    };
    lot(X, Y, sim.ZONE.R); lot(X + 17, Y, sim.ZONE.I);
    sim.invalidateDerived(state); sim.ensureDerived(state);
    return { state, X, Y };
  };
  const servedCity = () => {
    const city = corridor(true);
    const depot = command(city.state, "place-facility", { kind: "bus", x: city.X + 10, y: city.Y + 2 });
    return { ...city, depot };
  };
  const plain = corridor(true);
  const covered = servedCity();
  test.assert(covered.depot.accepted, `a depot stands beside the avenue (${covered.depot.code})`);
  const homeOf = (city) => city.state.buildings.find((building) => building.zone === sim.ZONE.R);
  const plainHome = homeOf(plain);
  const coveredHome = homeOf(covered);
  test.assert(plainHome && coveredHome && covered.state.distJobs[coveredHome.access] < plain.state.distJobs[plainHome.access],
    "commuters prefer the avenue once a depot covers it");
  test.assert(covered.state.busService.busRiders > 0 && covered.state.busService.avenues > 0, "served trips are counted as bus riders");
  test.assert(!Object.prototype.hasOwnProperty.call(plain.state.busService, "busRiders") && !Object.prototype.hasOwnProperty.call(plain.state.busService, "avenues"),
    "a city with no depot writes neither rider count");
  const depotTile = (covered.X + 10) + (covered.Y + 2) * covered.state.size;
  let servedQuiet = true;
  let outsideMatchesRoad = true;
  for (let i = 0; i < covered.state.size * covered.state.size; i += 1) {
    if (!covered.state.avenue[i]) continue;
    const x = i % covered.state.size;
    const y = Math.floor(i / covered.state.size);
    const near = Math.max(Math.abs(x - (covered.X + 10)), Math.abs(y - (covered.Y + 2))) <= 8;
    if (near) servedQuiet &&= covered.state.congested[i] === 0;
    else outsideMatchesRoad &&= covered.state.congested[i] === (covered.state.traffic[i] > sim.AVENUE.capacity ? 1 : 0);
  }
  test.assert(servedQuiet, "a depot-covered avenue half is not marked congested");
  test.assert(outsideMatchesRoad, "an avenue half outside the depot square still uses the avenue's own capacity");
  test.assert(sim.ROUTE_COST.avenue === 3, "a served avenue tile costs 3, between a highway and a street");
  const sample = covered.state.buildings.find((building) => building.zone === sim.ZONE.R);
  const trips = Math.max(1, Math.round(sample.population / 8));
  let weighted = false;
  for (let i = 0; i < covered.state.size * covered.state.size; i += 1) {
    if (!covered.state.avenue[i] || !covered.state.traffic[i]) continue;
    const x = i % covered.state.size;
    const y = Math.floor(i / covered.state.size);
    if (Math.max(Math.abs(x - (covered.X + 10)), Math.abs(y - (covered.Y + 2))) > 8) continue;
    weighted = covered.state.traffic[i] === Math.floor(trips * 0.25);
    break;
  }
  test.assert(weighted, "a served tile keeps a quarter of the trips and does not stack the depot relief");
}

// Hezhou, 1952: Starter Town plus the works of a river town. The bridge is a
// road over water, the railway has exactly two stations and crosses the hill
// road on the level, and the avenue is a paired two-way layer (westbound 8 /
// eastbound 2) from x=15 to x=35. The replay is deterministic and no command
// is refused; one bond funded at tick 0 lifts the treasury for the $5,180 of
// works laid in 1952, after the town's replay, when only $3,264 remains.
{
  const first = sim.replayExampleCity("hezhou-1952");
  const second = sim.replayExampleCity("hezhou-1952");
  const checkpoint = await sim.checkpoint(first);
  test.assert(checkpoint === await sim.checkpoint(second), "hezhou-1952 replays to the same checkpoint twice");
  test.assert(checkpoint.startsWith("947f588aa5c943dc"), `hezhou-1952 pins its deterministic checkpoint prefix (${checkpoint.slice(0, 16)})`);
  const date = sim.dateOf(first);
  test.assert(date.year === 1952 && date.month === 6 && date.day === 1, "hezhou-1952 opens on 1952-07-01");
  test.assert(sim.EXAMPLES["hezhou-1952"].yearFounded === 1950 && sim.EXAMPLES["hezhou-1952"].seed === 6101, "hezhou-1952 founds the city in 1950 on seed 6101");
  test.assert(first.bonds.length === 1 && first.funds > 0, "one bond issued at tick 0 funds the 1952 works and every command is accepted");
  let bridge = 0;
  for (let i = 0; i < first.size * first.size; i += 1) if (first.water[i] && first.road[i]) bridge += 1;
  test.assert(bridge > 0, `hezhou-1952 carries a road bridge standing on water (${bridge} tiles)`);
  const stations = first.facilities.filter((facility) => facility.kind === "station");
  test.assert(stations.length === 2
    && stations.some((station) => station.x === 16 && station.y === 40)
    && stations.some((station) => station.x === 61 && station.y === 38),
    "hezhou-1952 runs one railway with exactly two stations, one at each end");
  let crossings = 0;
  for (let i = 0; i < first.size * first.size; i += 1) if (first.rail[i] && first.road[i]) crossings += 1;
  test.assert(crossings >= 1, `the railway crosses the hill road on the level (${crossings} shared tiles)`);
  const at = (x, y) => y * first.size + x;
  let avenue = true;
  for (let x = 15; x <= 35; x += 1) {
    const north = sim.AVENUE.partner(first, x, 18);
    const south = sim.AVENUE.partner(first, x, 19);
    avenue = avenue && first.avenue[at(x, 18)] === 8 && first.avenue[at(x, 19)] === 2
      && first.road[at(x, 18)] === 1 && first.road[at(x, 19)] === 1
      && north !== null && north.y === 19 && south !== null && south.y === 18;
  }
  test.assert(avenue, "the avenue halves run west (8) and east (2), paired, from x=15 to x=35");
  test.assert(first.avenue[at(15, 18)] === 8 && first.avenue[at(14, 19)] === 0, "the avenue starts east of the water tower");
}

test.finish();
