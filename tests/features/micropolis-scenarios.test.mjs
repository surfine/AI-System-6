// Micropolis scenarios are eight original towns: every map comes from our
// seed through the engine's generator, every starting town from our seeder
// through the engine's public tools, every name from our translation tables.
// No Maxis scenario file, no Maxis city name.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("micropolis-scenarios");

const engineSource = read("app/vendor/micropolis/micropolis-engine.js");
const shellSource = read("app/features/micropolis.js");
const scenariosSource = read("app/features/micropolis-scenarios.js");
const config = read("app/core/config.js");
const manifest = read("tooling/runtime-manifest.mjs");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(`${engineSource}\nwindow.MicropolisEngine = MicropolisEngine;`, context);
const engine = context.window.MicropolisEngine;
const moduleContext = { window: context.window, console };
vm.createContext(moduleContext);
vm.runInContext(scenariosSource, moduleContext);
vm.runInContext(shellSource, moduleContext);
const scenarios = moduleContext.window.AISystem6MicropolisScenarios;
const game = moduleContext.window.AISystem6Micropolis;
test.assert(!!scenarios, "the scenarios module installs window.AISystem6MicropolisScenarios without a DOM");

// --- the eight scenarios boot, deterministically ------------------------------------

test.assert(scenarios.SCENARIOS.length === 8, "eight scenarios");
test.assert(new Set(scenarios.SCENARIOS.map((s) => s.id)).size === 8, "eight distinct ids");
test.assert(game.scenarioIds().join() === scenarios.SCENARIOS.map((s) => s.id).join(), "the shell menu lists the same eight, in order");
const premises = scenarios.SCENARIOS.map((s) => s.year).join();
test.assert(premises === "1900,1906,1944,1965,1957,1972,2010,2047", "the public premises: a dull town, a quake, a firestorm, a traffic jam, a monster, a crime wave, a flood, a pollution crisis");

function boot(scenario) {
  const map = game.generateSeededMap(scenario.seed);
  const sim = new engine.Simulation(map, scenario.level, engine.Simulation.SPEED_PAUSED);
  sim._startingYear = scenario.year;
  const tally = scenarios.seedTown(engine, map, sim, scenario.town);
  sim.budget.setFunds(scenario.funds);
  return { map, sim, tally };
}

for (const scenario of scenarios.SCENARIOS) {
  const preset = scenarios.TOWN_PRESETS[scenario.town];
  const { sim, tally } = boot(scenario);
  test.assert(tally.zones >= Math.floor(preset.cols * preset.rows * 0.6), `${scenario.id}: the starting town has most of its ${preset.cols * preset.rows} zones (${tally.zones})`);
  test.assert(tally.roads >= 20, `${scenario.id}: the starting town has a road grid (${tally.roads} tiles)`);
  test.assert(tally.plant === true, `${scenario.id}: the starting town has a power plant`);
  test.assert(sim.budget.totalFunds === scenario.funds, `${scenario.id}: the seeder leaves the scenario treasury, not its own`);
  test.assert(sim.getDate().year === scenario.year, `${scenario.id}: the city starts in ${scenario.year}`);
  const again = boot(scenario);
  test.assert(
    again.sim._map._data.every((tile, index) => tile.value === sim._map._data[index].value),
    `${scenario.id}: booting twice yields the same map, tile for tile`,
  );
}
test.assert(engine.BaseTool.getAutoBulldoze() === true, "the seeder restores the auto-bulldoze setting it borrowed");

// --- triggers fire on schedule, once ---------------------------------------------------

const faultline = scenarios.scenarioById("faultline");
test.assert(scenarios.dueTriggers(faultline, 3, []).length === 0, "the quake waits for its month");
test.assert(scenarios.dueTriggers(faultline, 4, []).join() === "0", "one month in, the quake is due");
test.assert(scenarios.dueTriggers(faultline, 400, [0]).length === 0, "a fired trigger never fires again");
const ashford = scenarios.scenarioById("ashford");
test.assert(scenarios.dueTriggers(ashford, 12, []).join() === "0,1,2", "the firestorm's fires come month after month");

const { sim: tickSim } = boot(faultline);
const state = scenarios.createState(faultline, tickSim._cityTime);
test.assert(scenarios.tick(tickSim, state).disasters.length === 0, "nothing fires at the start");
tickSim._cityTime += 4;
const stepped = scenarios.tick(tickSim, state);
test.assert(stepped.disasters.join() === "earthquake" && state.fired.join() === "0", "the quake fires after one month and is remembered");
test.assert(scenarios.tick(tickSim, state).disasters.length === 0, "the next tick fires nothing new");

// --- goals judge: win, lose, still running ----------------------------------------------

test.assert(scenarios.judge(faultline, 6000, 0) === "won", "a population goal wins the moment it is reached");
test.assert(scenarios.judge(faultline, 100, 0) === "", "before the deadline the scenario runs on");
test.assert(scenarios.judge(faultline, 100, 5 * 48) === "lost", "at the deadline, short of the goal, it is lost");
const gridlock = scenarios.scenarioById("gridlock");
test.assert(scenarios.judge(gridlock, 10, 0) === "", "a keep-it-below goal is not won early");
test.assert(scenarios.judge(gridlock, 10, 10 * 48) === "won" && scenarios.judge(gridlock, 90, 10 * 48) === "lost", "a keep-it-below goal is judged at the deadline");
for (const kind of ["population", "crime", "pollution", "traffic"]) {
  test.assert(typeof scenarios.measure(tickSim, kind) === "number", `${kind} is measured on the live simulation`);
}
const info = scenarios.progress(tickSim, state);
test.assert(info.yearsLeft === 5 && info.target === 6000 && info.kind === "population", "the panel gets target, value and years left");

// --- wiring and copy -------------------------------------------------------------------------

test.assertIncludes(shellSource, "tickMicropolisScenario()", "the frame loop drives the scenario");
test.assertIncludes(shellSource, 'labelKey: "micropolis_menu_scenarios"', "Scenarios is a File submenu");
test.assertIncludes(shellSource, "scenario: micropolisState.scenario ?", "the scenario state is saved with the city");
test.assertIncludes(shellSource, "sim._startingYear = scenario.year", "a loaded scenario keeps its starting year");
test.assertIncludes(manifest, '"app/features/micropolis-scenarios.js"', "the scenarios module is a lazy runtime file");
test.assertMatches(config, /ensureMicropolisModule[\s\S]{0,500}"app\/features\/micropolis-scenarios\.js"/, "the Micropolis loader names the scenarios module");
for (const scenario of scenarios.SCENARIOS) {
  for (const suffix of ["name", "premise"]) {
    test.assertIncludes(en, `micropolis_scenario_${scenario.id}_${suffix}:`, `English ${suffix} for ${scenario.id}`);
    test.assertIncludes(zh, `micropolis_scenario_${scenario.id}_${suffix}:`, `Chinese ${suffix} for ${scenario.id}`);
  }
  test.assertIncludes(en, `micropolis_goal_${scenario.goal.kind}:`, `English goal copy for ${scenario.goal.kind}`);
  for (const trigger of scenario.triggers) {
    test.assertIncludes(en, `micropolis_scenario_event_${trigger.disaster}:`, `English event copy for ${trigger.disaster}`);
    test.assertIncludes(zh, `micropolis_scenario_event_${trigger.disaster}:`, `Chinese event copy for ${trigger.disaster}`);
  }
}
// The Maxis scenario cities are not ours to name.
for (const name of ["Dullsville", "San Francisco", "Hamburg", "Bern", "Tokyo", "Detroit", "Boston", "Rio de Janeiro"]) {
  test.assertNotIncludes(scenariosSource, name, `no Maxis scenario city name in the module (${name})`);
  test.assertNotIncludes(en, `micropolis_scenario_${name}`, `no Maxis scenario city name in the copy (${name})`);
}
test.assertNotMatches(scenariosSource, /\.(scn|cty|sc2)["'`]/, "no scenario file is read; every map is generated");

test.finish();
