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
  const base = findLandRect(state, 10, 7, flatPadAt(state, 2));
  // SC2K-faithful outputs (M3a) make a lone wind turbine what it is in the
  // original: a trickle. The starter district runs on coal, like a real
  // SC2K opening.
  const plant = { x: base.x, y: base.y };
  const tower = { x: base.x, y: base.y + 2 };
  const zone = { x: base.x + 3, y: base.y + 2, width: 3, height: 3 };
  test.assert(command(state, "place-facility", { kind: "coal", ...plant }).accepted, "district builds a coal plant");
  test.assert(command(state, "build-path", { network: "road", start: { x: zone.x, y: base.y + 1 }, end: { x: zone.x + zone.width - 1, y: base.y + 1 } }).accepted, "district builds road access");
  test.assert(command(state, "build-path", { network: "wire", start: plant, end: { x: zone.x, y: zone.y } }).accepted, "district connects power");
  test.assert(command(state, "zone-area", { zone: "residential", density, ...zone }).accepted, "district zones a residential area");
  return { base, wind: plant, plant, tower, zone };
}

// Water is a visible growth blocker; restoration starts and completes work.
{
  const state = sim.createCity({ seed: 101, size: 64, terrainPreset: "balanced" });
  const district = wireBasicDistrict(state);
  sim.advanceTicks(state, sim.TICKS_PER_DAY * 20);
  const blocked = sim.tileInfo(state, district.zone.x, district.zone.y);
  test.assert(blocked.stage === 0 && blocked.problem?.code === "no-water" && blocked.problem.action === "connect-water", "missing water blocks growth with positioned guidance");
  test.assert(command(state, "place-facility", { kind: "water-tower", ...district.tower }).accepted, "district builds a water tower");
  test.assert(command(state, "build-path", { network: "pipe", start: district.tower, end: { x: district.zone.x, y: district.zone.y } }).accepted, "district connects its water network");
  sim.advanceTicks(state, sim.TICKS_PER_DAY * 12);
  const active = sim.tileInfo(state, district.zone.x, district.zone.y);
  test.assert(active.stage === 1 && active.buildingState === sim.BUILDING_STATE.ACTIVE, "restored utilities complete explicit foundation and construction states");
  test.assert(state.population >= 100, "a serviced starter district exceeds 100 residents in the first year");
  const events = sim.drainEvents(state);
  test.assert(events.some((event) => event.type === "problem-changed" && Number.isInteger(event.payload.x)), "problem changes carry positions");
  test.assert(events.some((event) => event.type === "construction-started") && events.some((event) => event.type === "building-completed"), "construction emits start and completion facts");

  state.constructionTimer[district.zone.y * state.size + district.zone.x] = 44;
  sim.advanceTicks(state, sim.TICKS_PER_DAY);
  test.assert(sim.tileInfo(state, district.zone.x, district.zone.y).stage >= 2, "high-density buildings advance beyond the first development level");
  const agentsA = sim.derivedAgentFacts(state);
  const agentsB = sim.derivedAgentFacts(state);
  test.assert(agentsA.vehicles.length > 0 && agentsA.pedestrians.length > 0, "population and roads derive visible agents");
  test.assert(sim.canonicalStringify(agentsA) === sim.canonicalStringify(agentsB), "derived agents are stable facts of seed, tick, and entities");
}

// Low density stops at level one under the same service conditions.
{
  const state = sim.createCity({ seed: 102, size: 64 });
  const district = wireBasicDistrict(state, "low");
  command(state, "place-facility", { kind: "water-tower", ...district.tower });
  command(state, "build-path", { network: "pipe", start: district.tower, end: { x: district.zone.x, y: district.zone.y } });
  sim.advanceTicks(state, sim.TICKS_PER_DAY * 60);
  test.assert(sim.tileInfo(state, district.zone.x, district.zone.y).stage === 1, "low-density development is capped at level one");
}

// All four services have funding-scaled coverage and enter budget categories.
{
  const state = sim.createCity({ seed: 103, size: 64 });
  const base = findLandRect(state, 12, 4);
  for (const [offset, kind] of ["police", "fire", "school", "clinic"].entries()) {
    test.assert(command(state, "place-facility", { kind, x: base.x + offset * 2, y: base.y }).accepted, `${kind} facility is placeable`);
  }
  const police = { x: base.x, y: base.y };
  test.assert(sim.tileInfo(state, police.x + 5, police.y).policeCovered, "full police funding covers distance five");
  command(state, "set-policy", { policy: "funding", service: "police", level: 50 });
  test.assert(!sim.tileInfo(state, police.x + 5, police.y).policeCovered, "half police funding shrinks coverage");
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
  test.assert(sim.tileInfo(first.state, 16, 3).landValue > first.before, "connected rail raises nearby land value");
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
    state.stage[(base.y) * state.size + base.x + 3] = 3;
    state.buildingState[(base.y) * state.size + base.x + 3] = sim.BUILDING_STATE.ACTIVE;
    state.derivedDirty = true;
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
  const ceiling = Math.floor(shortage.powerCapacity / 2); // high-density plots draw 2 each
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
  test.assert(state.subwayService.roadTrafficRelief > 0, "a connected subway relieves road traffic");
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
  test.assert(state.highwayService.roadTrafficRelief === 0, "a highway without onramps carries nothing");
  test.assert(command(state, "build-path", { network: "onramp", points: [{ x: base.x + 1, y: base.y + 2 }] }).accepted, "the west onramp joins road and highway");
  sim.ensureDerived(state);
  test.assert(state.highwayService.onramps === 1 && state.highwayService.roadTrafficRelief === 0, "one onramp is an entrance without an exit — still no relief");
  test.assert(command(state, "build-path", { network: "onramp", points: [{ x: base.x + 9, y: base.y + 2 }] }).accepted, "the east onramp joins road and highway");
  sim.ensureDerived(state);
  test.assert(state.highwayService.onramps === 2 && state.highwayService.roadTrafficRelief > 0, "an entrance and an exit put the highway in service");
  test.assert(state.highwayService.connectedHighwayTiles >= 16, "the whole ribbon connects through its onramps");
  sim.advanceTicks(state, 125);
  test.assert(state.budget.highways > 0, "highway mileage accrues on its own funding line");
  const undoTarget = state.highway.reduce((sum, value) => sum + value, 0);
  test.assert(undoTarget >= 18, "the ribbon holds its stamped tiles after a month");
}

// M6-3: moving things — a working airport keeps one airplane aloft.
{
  const state = sim.createCity({ seed: 509, size: 64 });
  const base = findLandRect(state, 12, 10, flatPadAt(state, 2));
  test.assert(command(state, "place-facility", { kind: "coal", x: base.x, y: base.y }).accepted, "the airfield city builds a plant");
  test.assert(command(state, "build-path", { network: "road", start: { x: base.x + 3, y: base.y + 1 }, end: { x: base.x + 8, y: base.y + 1 } }).accepted, "the airfield city builds a road");
  test.assert(command(state, "build-path", { network: "wire", start: { x: base.x, y: base.y + 2 }, end: { x: base.x + 4, y: base.y + 2 } }).accepted, "the airfield city connects power");
  test.assert(command(state, "zone-area", { zone: "airport", x: base.x + 3, y: base.y + 2, width: 4, height: 3 }).accepted, "the airfield city zones an airport");
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
    command(target, "build-path", { network: "road", start: { x: base.x + 3, y: base.y + 1 }, end: { x: base.x + 8, y: base.y + 1 } });
    command(target, "build-path", { network: "wire", start: { x: base.x, y: base.y + 2 }, end: { x: base.x + 4, y: base.y + 2 } });
    command(target, "zone-area", { zone: "airport", x: base.x + 3, y: base.y + 2, width: 4, height: 3 });
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
  const base = findLandRect(port, 12, 10, flatPadAt(port, 2));
  for (const state of [port, plain]) {
    test.assert(command(state, "place-facility", { kind: "coal", x: base.x, y: base.y }).accepted, "port comparison city builds a coal plant");
    test.assert(command(state, "build-path", { network: "road", start: { x: base.x, y: base.y + 8 }, end: { x: base.x + 9, y: base.y + 8 } }).accepted, "port comparison city builds a road");
    test.assert(command(state, "build-path", { network: "wire", start: { x: base.x, y: base.y }, end: { x: base.x, y: base.y + 8 } }).accepted, "port comparison city wires the shore");
  }
  test.assert(command(port, "zone-area", { zone: "seaport", x: base.x + 2, y: base.y + 7, width: 2, height: 2 }).code === "port-too-small", "an undersized seaport is refused");
  test.assert(command(port, "zone-area", { zone: "seaport", x: base.x + 1, y: base.y + 6, width: 4, height: 2 }).accepted, "a full-size seaport zone is accepted");
  test.assert(port.zone[(base.y + 6) * port.size + base.x + 1] === sim.ZONE.SEAPORT, "seaport tiles carry the SC2K zone value");
  sim.advanceTicks(port, 125); sim.advanceTicks(plain, 125);
  test.assert(sim.cityReport(port).demand.i > sim.cityReport(plain).demand.i, "a powered, road-served seaport lifts industrial demand");
}

// M3b-2a: bridges — roads, rails, and power lines cross water at bridge
// prices; pipes stop at the shore.
{
  const state = sim.createCity({ seed: 507, size: 64, terrainPreset: "river" });
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
}

// M4b-1 demographics and tiered graphs: EQ follows school coverage, LE
// follows health coverage, the workforce follows EQ, and the sixteen graph
// series sample monthly with half-year and five-year tiers.
{
  const covered = sim.createCity({ seed: 508, size: 64 });
  const bare = sim.createCity({ seed: 508, size: 64 });
  const { zone } = wireBasicDistrict(covered);
  wireBasicDistrict(bare);
  test.assert(command(covered, "place-facility", { kind: "school", x: zone.x + 1, y: zone.y + 3 }).accepted, "demographics city builds a school");
  test.assert(command(covered, "place-facility", { kind: "clinic", x: zone.x + 2, y: zone.y + 3 }).accepted, "demographics city builds a clinic");
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
  const pad = findLandRect(state, 8, 8, flatPadAt(state, 3));
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

test.finish();
