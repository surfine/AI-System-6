// Micropolis is a lazy desk toy with a GPL engine behind a hard license
// boundary: the vendored bundle must stay out of the boot bundle, and every
// user-facing string must be original AI System 6 copy from the translation
// tables, never upstream text.

import vm from "node:vm";
import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("micropolis");

const engineSource = read("app/vendor/micropolis/micropolis-engine.js");
const shellSource = read("app/features/micropolis.js");
const config = read("app/core/config.js");
const manifest = read("tooling/runtime-manifest.mjs");
const styleManifest = read("tooling/style-manifest.mjs");
const packageJson = read("package.json");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const css = read("styles/92-micropolis.css");

// --- the engine bundle runs headless -----------------------------------------

const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(`${engineSource}\nwindow.MicropolisEngine = MicropolisEngine;`, context);
const engine = context.window.MicropolisEngine;
test.assert(!!engine, "the vendor bundle installs MicropolisEngine");

const map = engine.MapGenerator(120, 100);
test.assert(map.width === 120 && map.height === 100, "MapGenerator yields the requested map size");

const sim = new engine.Simulation(map, engine.Simulation.LEVEL_EASY, engine.Simulation.SPEED_FAST);
test.assert(sim.budget.totalFunds === 20000, "a new city starts with the classic treasury");

const tools = engine.createTools(map);
test.assert(!("query" in tools), "the jQuery-bound query tool stays out of the engine tools");
// The map is random: find bare dirt so the road result is deterministic.
let dirt = null;
for (let y = 2; y < map.height - 2 && !dirt; y += 1) {
  for (let x = 2; x < map.width - 2 && !dirt; x += 1) {
    if (map.getTileValue(x, y) === engine.TileValues.DIRT) dirt = { x, y };
  }
}
test.assert(!!dirt, "a generated map contains bare dirt");
tools.road.doTool(dirt.x, dirt.y, sim.blockMaps);
tools.road.modifyIfEnoughFunding(sim.budget);
test.assert(tools.road.result === tools.road.TOOLRESULT_OK, "laying a road succeeds on bare dirt");
test.assert(sim.budget.totalFunds < 20000, "building a road charges the treasury");

for (let i = 0; i < 5; i += 1) sim.simTick();
const saveData = {};
sim.save(saveData);
test.assert(Array.isArray(saveData.map) && typeof saveData.totalFunds === "number",
  "Simulation.save emits plain JSON-ready city data");

// Save round-trip through the compact record format: a rebuilt Simulation must
// carry the same tiles, funds, and city time.
const compactMap = saveData.map.map((tile) => tile.value);
const restoredData = { ...saveData, map: compactMap.map((value) => ({ value })) };
const restoredMap = new engine.GameMap(saveData.width, saveData.height);
const restoredSim = new engine.Simulation(restoredMap, saveData._gameLevel, engine.Simulation.SPEED_PAUSED, restoredData);
test.assert(restoredSim.budget.totalFunds === sim.budget.totalFunds, "restored funds match the saved funds");
test.assert(restoredSim._cityTime === sim._cityTime, "restored city time matches the saved city time");
const roundTrip = {};
restoredSim.save(roundTrip);
test.assert(
  JSON.stringify(roundTrip.map.map((tile) => tile.value)) === JSON.stringify(compactMap),
  "map tiles survive the save round-trip byte for byte",
);

// --- the shell module has no top-level DOM dependency ------------------------

const shellContext = { window: context.window, console };
vm.createContext(shellContext);
vm.runInContext(shellSource, shellContext);
const game = shellContext.window.AISystem6Micropolis;
test.assert(!!game, "the shell installs window.AISystem6Micropolis without touching the DOM at load");
for (const member of ["open", "attach", "render", "runMenuCommand", "hasCity", "isPaused", "isDirty"]) {
  test.assert(typeof game[member] === "function", `the public API exposes ${member}`);
}
test.assert(game.hasCity() === false, "a freshly loaded module has no city yet");

// --- license boundary ---------------------------------------------------------

test.assertMatches(manifest, /lazyRuntimePaths = \[[\s\S]*"app\/vendor\/micropolis\/micropolis-engine\.js"/,
  "the GPL engine ships as a lazy runtime file");
test.assertNotMatches(manifest, /appModulePaths = \[[^\]]*micropolis/,
  "no Micropolis file enters the boot bundle");
test.assertIncludes(engineSource, "GNU GPL v3", "the built engine bundle carries its license banner");
test.assertIncludes(engineSource, "registered trademark of Micropolis",
  "the Micropolis name notice stays intact");
test.assertFile("app/vendor/micropolis/LICENSE", "the vendor directory ships the license text");
test.assertFile("app/vendor/micropolis/COPYING", "the vendor directory ships the GPL text");
test.assertFile("app/vendor/micropolis/NOTICE.md", "the vendor directory ships the provenance notice");
test.assertFile("app/vendor/micropolis/tiles.png", "the tile art ships beside the engine");
test.assertFile("app/vendor/micropolis/sprites.png", "the sprite sheet ships beside the engine");
const nativePackageContract = packageJson.includes('"apps/desktop/app/vendor/micropolis/**/*"');
if (nativePackageContract) {
  test.assertIncludes(packageJson, '"apps/desktop/app/vendor/micropolis/**/*"', "native packaging includes the engine license and art");
  test.assertIncludes(packageJson, '"apps/desktop/styles.micropolis.css"', "native packaging includes the lazy stylesheet");
} else {
  // The public-safe package surface deliberately omits private native
  // packaging metadata. Its independently reproducible build must still emit
  // the lazy stylesheet, while the concrete license/art files above prove the
  // public source carries the distributable engine boundary.
  test.assert(exists("apps/desktop/styles.micropolis.css"), "the public build emits the lazy stylesheet");
}

// --- city saves are durable desk data -----------------------------------------

const projectDisk = read("app/features/project-disk.js");
test.assertIncludes(config, 'citiesStoreName: "cities"', "city saves have a declared object store");
test.assertIncludes(config, "indexedDbVersion: 3", "adding the cities store bumped the database version");
test.assertIncludes(read("app.js"), "citiesStoreName,", "app.js destructures the store name into the shared scope");
test.assertIncludes(projectDisk, "db.createObjectStore(citiesStoreName", "the upgrade path creates the cities store");
test.assertIncludes(shellSource, "AISystem6StorageTransactions.runTransaction", "city writes go through the shared write fence");

// --- wiring -------------------------------------------------------------------

test.assertIncludes(shellSource, "window.AISystem6MicropolisLoaded = true;", "the lazy module installs its loaded flag");
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6MicropolisLoaded"', "config.js owns the lazy loader");
test.assertMatches(config, /ensureMicropolisModule[\s\S]{0,200}styles\.micropolis\.css/,
  "the lazy loader pulls the Micropolis stylesheet with the module");
test.assertMatches(windowManager, /micropolis:\s*\{\s*ensure:\s*\(\)\s*=>\s*ensureMicropolisModule\(\)/,
  "session restore reloads the module through lazyWindowModules");
test.assertMatches(windowManager, /mobileFullScreenAppIds = new Set\(\[[^\]]*"micropolis"/,
  "the phone shell treats Micropolis as a full-screen app");
test.assertIncludes(multiFinder, 'micropolis: "micropolis",', "the window declares its owning app");
test.assertNotIncludes(html, 'data-window="micropolis"', "the window frame stays off the startup disk");
test.assertIncludes(shellSource, 'data-window="micropolis"', "the lazy module installs the real window frame");
test.assertMatches(styleManifest, /id: "micropolis",\s*\n\s*output: "styles\.micropolis\.css"/,
  "the stylesheet is a lazy style bundle");
test.assertIncludes(shellSource, 'AISystem6RegisterApplicationMenuSet?.("micropolis"', "the lazy module owns its application menus");
test.assertIncludes(shellSource, "AISystem6RegisterApplicationCommands", "the lazy module owns its menu command handlers");
test.assertNotIncludes(menus, "const micropolisMenus", "Micropolis menu declarations stay off the startup floppy");
test.assertMatches(shellSource, /id: "city",[\s\S]{0,500}type: "submenu",\s*\n\s*labelKey: "micropolis_menu_disasters"/,
  "disasters live under City so the app keeps at most four top-level menus");

// --- touch behaviour ----------------------------------------------------------

test.assertIncludes(css, "touch-action: none;", "the map viewport owns its own gestures");
test.assertNotIncludes(shellSource, 'addEventListener("touchstart"', "input uses Pointer Events, not touch events");
test.assertIncludes(shellSource, "setPointerCapture", "the map captures its pointers");
test.assertIncludes(shellSource, "cancelAnimationFrame", "the game loop can be torn down");

// --- bilingual copy -----------------------------------------------------------

const messageKeys = Object.values(game.messageKeys);
test.assert(messageKeys.length >= 39, "every engine message subject has a translation key");
const staticKeys = [
  "micropolis_label", "micropolis_menu_speed", "micropolis_menu_city", "micropolis_menu_disasters",
  "micropolis_new_city", "micropolis_new_city_confirm", "micropolis_pause",
  "micropolis_speed_slow", "micropolis_speed_med", "micropolis_speed_fast",
  "micropolis_save_city", "micropolis_open_city", "micropolis_city_name_prompt",
  "micropolis_untitled_city", "micropolis_cities_title", "micropolis_cities_empty",
  "micropolis_budget_title", "micropolis_budget_mandatory", "micropolis_budget_approve",
  "micropolis_evaluation_title", "micropolis_eval_approval",
  "micropolis_status_generating", "micropolis_status_ready", "micropolis_status_paused",
  "micropolis_status_needs_bulldoze", "micropolis_status_no_money", "micropolis_status_assets_failed",
  "micropolis_status_saved", "micropolis_status_loaded", "micropolis_status_save_failed",
  "micropolis_status_load_failed", "micropolis_msg_budget_applied",
  "micropolis_disaster_fire", "micropolis_disaster_flood", "micropolis_disaster_tornado",
  "micropolis_disaster_earthquake", "micropolis_disaster_monster", "micropolis_disaster_crash",
  "micropolis_disaster_meltdown",
  ...Object.values(game.classKeys),
  ...game.problemKeys,
  ...game.toolIds.map((id) => `micropolis_tool_${id}`),
  ...messageKeys,
];
for (const key of staticKeys) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}
test.assertMatches(en, /micropolis_label: "Micropolis"/, "the product name stays Micropolis in English");
test.assertMatches(zh, /micropolis_label: "Micropolis"/, "the product name stays untranslated in Chinese (brand rule)");

test.finish();
