// The three SC2K-parity city data windows: Population, Industry, Neighbors.
// Their read models are pure derivations of saved state — deterministic,
// exact-sum, save-stable — and the shell draws them in the shared 1-bit
// instrument style of the graphs panel.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-city-windows");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
const sim = context.window.AISystem6BonsaiSim;

function command(state, type, payload) {
  return sim.submitCommand(state, { schemaVersion: 2, type, payload, targetTick: state.tick, clientCommandId: `${type}-${state.nextCommandSequence}` });
}

// --- Population: the pyramid is an exact, deterministic split ----------------
{
  const city = sim.replayExampleCity("starter-town");
  const breakdown = sim.populationBreakdown(city);
  test.assert(breakdown.cohorts.length === 10, "the pyramid holds ten ten-year cohorts");
  test.assert(breakdown.cohorts.every((cohort) => Number.isInteger(cohort.population) && cohort.population >= 0), "every cohort is a non-negative integer");
  test.assert(breakdown.cohorts.reduce((sum, cohort) => sum + cohort.population, 0) === breakdown.total, "the cohorts sum exactly to the total population");
  test.assert(breakdown.total === city.population + city.arcoPopulation, "the total counts city and arcology residents");
  test.assert(breakdown.cohorts[0].population >= breakdown.cohorts[9].population, "a young growing town holds more children than elders");
  test.assert(breakdown.workforce === Math.floor(city.population * city.workforcePercent / 100), "the workforce follows the saved workforce share");
  test.assert(sim.canonicalStringify(breakdown) === sim.canonicalStringify(sim.populationBreakdown(city)), "the breakdown is a pure read: two calls agree");
  const before = sim.canonicalStringify(sim.serialize(city));
  sim.populationBreakdown(city);
  test.assert(sim.canonicalStringify(sim.serialize(city)) === before, "reading the breakdown never mutates the save");
}

// --- Industry: sectors ride the era curve and split iJobs exactly ------------
{
  const city = sim.replayExampleCity("starter-town");
  const industry = sim.industryBreakdown(city);
  test.assert(industry.sectors.length === sim.INDUSTRY_SECTORS.length && industry.sectors.length === 10, "ten original sectors report");
  test.assert(industry.sectors.reduce((sum, sector) => sum + sector.jobs, 0) === city.iJobs, "sector jobs sum exactly to the industrial workforce");
  test.assert(industry.sectors.every((sector) => sector.demand >= -100 && sector.demand <= 100), "sector demand stays on the SC2K -100..100 scale");
  const year1900 = industry.sectors.find((sector) => sector.id === "farming");
  const biotech1900 = industry.sectors.find((sector) => sector.id === "biotech");
  test.assert(year1900.ratio > biotech1900.ratio, "in the founding era, farming outweighs biotech");
  test.assert(sim.canonicalStringify(industry) === sim.canonicalStringify(sim.industryBreakdown(city)), "the industry mix is a pure read: two calls agree");
  test.assert(command(city, "set-policy", { policy: "ordinance", id: "pollutionControls", enacted: true }).accepted, "the pollution-controls ordinance enacts");
  const cleaned = sim.industryBreakdown(city);
  test.assert(cleaned.cleanIndustry === true, "the mix reports the ordinance");
  const dirtyShare = (report) => report.sectors.filter((sector) => sector.pollution >= 6).reduce((sum, sector) => sum + sector.ratio, 0);
  test.assert(dirtyShare(cleaned) < dirtyShare(industry), "pollution controls shift the mix away from dirty sectors");
}

// --- Neighbors: four cities on the national clock, trade follows edges -------
{
  const city = sim.createCity({ seed: 4242, size: 64, terrainPreset: "balanced" });
  const report = sim.neighborsReport(city);
  test.assert(report.neighbors.length === 4, "four neighbors surround the city");
  test.assert(JSON.stringify(report.neighbors.map((neighbor) => neighbor.direction)) === JSON.stringify(["north", "east", "south", "west"]), "the neighbors sit on the four compass edges");
  test.assert(report.neighbors.every((neighbor) => neighbor.population > 0), "every neighbor holds people from the start");
  test.assert(new Set(report.neighbors.map((neighbor) => neighbor.nameIndex)).size === 4, "no two neighbors share a name");
  test.assert(report.neighbors.every((neighbor) => neighbor.connections === 0 && !neighbor.linked && neighbor.trade === 0), "an unconnected map trades with nobody");
  test.assert(sim.canonicalStringify(report) === sim.canonicalStringify(sim.neighborsReport(city)), "the neighbors report is a pure read: two calls agree");

  // A road built to the north edge links exactly that neighbor.
  let edgeX = -1;
  for (let x = 1; x < city.size - 1 && edgeX < 0; x += 1) {
    let dry = true;
    for (let y = 0; y <= 6; y += 1) if (city.water[y * city.size + x]) { dry = false; break; }
    if (dry) edgeX = x;
  }
  test.assert(edgeX >= 0, "the balanced preset offers a dry column to the north edge");
  test.assert(command(city, "build-path", { network: "road", points: [{ x: edgeX, y: 6 }, { x: edgeX, y: 0 }] }).accepted, "a road reaches the north map edge");
  const linked = sim.neighborsReport(city);
  const north = linked.neighbors.find((neighbor) => neighbor.direction === "north");
  const east = linked.neighbors.find((neighbor) => neighbor.direction === "east");
  test.assert(north.linked && north.connections === 1 && north.trade > 0, "the north neighbor now trades over one connection");
  test.assert(!east.linked && east.trade === 0, "the east neighbor stays unlinked");

  // The national clock lifts every neighbor as months pass.
  const beforePopulations = linked.neighbors.map((neighbor) => neighbor.population);
  sim.advanceTicks(city, 125 * 12);
  const later = sim.neighborsReport(city);
  test.assert(later.neighbors.every((neighbor, index) => neighbor.population > beforePopulations[index]), "a year of the national clock grows all four neighbors");

  // Save round-trip: the report is a stable fact of the save alone.
  const revived = sim.deserialize(JSON.parse(JSON.stringify(sim.serialize(city))));
  test.assert(sim.canonicalStringify(sim.neighborsReport(revived)) === sim.canonicalStringify(sim.neighborsReport(city)), "the report survives a save round-trip byte-for-byte");
  test.assert(sim.canonicalStringify(sim.populationBreakdown(revived)) === sim.canonicalStringify(sim.populationBreakdown(city)), "the population breakdown survives a save round-trip");
  test.assert(sim.canonicalStringify(sim.industryBreakdown(revived)) === sim.canonicalStringify(sim.industryBreakdown(city)), "the industry mix survives a save round-trip");
}

// --- Shell: the three windows draw in the shared 1-bit style -----------------
const shell = read("app/features/bonsai-city.js");
test.assertIncludes(shell, "drawPopulationPyramid", "the population window draws an age pyramid");
test.assertIncludes(shell, "data-bonsai-population-pyramid", "the pyramid canvas lives in the panel host");
test.assertIncludes(shell, "drawDemographicsChart", "the population window draws the health/education/unemployment trend");
test.assertIncludes(shell, "data-bonsai-demographics-canvas", "the trend canvas lives in the panel host");
test.assertIncludes(shell, "data-bonsai-open-demographic-graphs", "the population window hands off to the shared graphs panel");
test.assertIncludes(shell, "drawIndustryChart", "the industry window draws the sector mix");
test.assertIncludes(shell, "data-bonsai-industry-canvas", "the industry canvas lives in the panel host");
test.assertIncludes(shell, "drawNeighborsMap", "the neighbors window draws the compass card");
test.assertIncludes(shell, "data-bonsai-neighbors-canvas", "the neighbors canvas lives in the panel host");
test.assertIncludes(shell, "populationBreakdown", "the shell reads the core's population model, never its own");
test.assertIncludes(shell, "industryBreakdown", "the shell reads the core's industry model, never its own");
test.assertIncludes(shell, "neighborsReport", "the shell reads the core's neighbor model, never its own");

// Every dynamically-built key the three windows use exists in both languages.
const translationContext = vm.createContext({ window: {} });
vm.runInContext(read("app/features/bonsai-translations.js"), translationContext);
const en = translationContext.window.AISystem6TranslationsEn;
const zh = translationContext.window.AISystem6TranslationsZh;
const dynamicKeys = [
  ...sim.INDUSTRY_SECTORS.map((sector) => `bonsai_sector_${sector.id}`),
  ...sim.NEIGHBOR_DIRECTIONS.map((direction) => `bonsai_neighbor_${direction}`),
  ...Array.from({ length: sim.NEIGHBOR_NAME_COUNT }, (_, index) => `bonsai_neighbor_name_${index}`),
];
for (const key of dynamicKeys) {
  test.assert(Object.prototype.hasOwnProperty.call(en, key), `English defines ${key}`);
  test.assert(Object.prototype.hasOwnProperty.call(zh, key), `Chinese defines ${key}`);
}

test.finish();
