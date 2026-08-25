// Micropolis is a lazy desk toy with a GPL engine behind a hard license
// boundary: the vendored bundle must stay out of the boot bundle, and every
// user-facing string must be original AI System 6 copy from the translation
// tables, never upstream text.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createFeatureTest, exists, read, resolveProjectPath, windowApp, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("micropolis");

const engineSource = read("app/vendor/micropolis/micropolis-engine.js");
const shellSource = read("app/features/micropolis.js");
const config = read("app/core/config.js");
const manifest = read("tooling/runtime-manifest.mjs");
const styleManifest = read("tooling/style-manifest.mjs");
const packageJson = read("package.json");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
const windowRegistry = read("app/core/window-registry.js");
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

// --- HD remaster --------------------------------------------------------------
//
// The @2x atlases derive deterministically from the 1x art
// (npm run build:micropolis-hd); the engine renders them on a scale-sized
// backing store while every caller-facing coordinate stays in CSS pixels and
// the logical tile stays 16px. These checks pin the whole geometry contract.

function pngSize(path) {
  const buffer = readFileSync(resolveProjectPath(path));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const sdTiles = pngSize("app/vendor/micropolis/tiles.png");
test.assert(sdTiles.width === 512 && sdTiles.height === 512, "the classic 1x atlas stays the pipeline's source of truth");
const hdTiles = pngSize("app/vendor/micropolis/tiles@2x.png");
test.assert(hdTiles.width === 1024 && hdTiles.height === 1024, "the HD tile atlas is exactly 2x the 512px base");
const hdSnow = pngSize("app/vendor/micropolis/tilessnow@2x.png");
test.assert(hdSnow.width === hdTiles.width && hdSnow.height === hdTiles.height, "the HD snow atlas matches the HD tile scale");
const hdSprites = pngSize("app/vendor/micropolis/sprites@2x.png");
test.assert(hdSprites.width === 1536 && hdSprites.height === 768, "the HD sprite sheet is exactly 2x the 768x384 base");
test.assertFile("tooling/build-micropolis-hd-assets.mjs", "the HD atlases have a reproducible pipeline");
test.assertIncludes(packageJson, '"build:micropolis-hd"', "the HD pipeline is an npm script");
test.assertIncludes(read("tooling/build-micropolis-vendor.mjs"), "micropolisHdPatchPlugin", "the vendor build applies the HD engine patch");
test.assertIncludes(engineSource, "this._tileSet.scale || 1", "the engine bundle carries the HD scale contract");
test.assertIncludes(engineSource, "take10Census(this.budget)",
  "the phase-9 census ReferenceError (undeclared `budget`) stays fixed");

// Headless geometry: HD backing store, CSS-pixel APIs, logical 16px tiles.
const hdView = {
  _canvas: { parentNode: { clientWidth: 800, clientHeight: 600 }, style: {} },
  _tileSet: { tileWidth: 32, scale: 2 },
  _map: { width: 120, height: 100 },
  _allowScrolling: true,
};
engine.GameCanvas.prototype._calculateDimensions.call(hdView);
test.assert(hdView.canvasWidth === 1600 && hdView.canvasHeight === 1200, "the HD backing store is CSS size times scale");
test.assert(hdView._canvas.width === 1600 && hdView._canvas.style.width === "800px",
  "the canvas pins its CSS size while the backing store scales");
test.assert(hdView._wholeTilesInViewX === 50 && hdView._wholeTilesInViewY === 37,
  "the visible map range still counts 16-CSS-px logical tiles");
hdView.ready = true;
hdView._originX = 10;
hdView._originY = 5;
const hdTile = engine.GameCanvas.prototype.canvasCoordinateToTileCoordinate.call(hdView, 40, 40);
test.assert(hdTile.x === 12 && hdTile.y === 7, "pointer CSS pixels map to the same logical tile as the classic renderer");
const hdCss = engine.GameCanvas.prototype.tileToCanvasCoordinate.call(hdView, 12, 7);
test.assert(hdCss.x === 32 && hdCss.y === 32, "tile positions come back in CSS pixels");

// Sprite frames read from the sheet at 48 x scale and paint at world x scale;
// damage stays in logical 16px tiles.
const spriteCalls = [];
const spriteView = {
  _tileSet: { tileWidth: 32, scale: 2 },
  _spriteSheet: { hd: true },
  _originX: 10,
  _originY: 5,
};
const spriteDamage = engine.GameCanvas.prototype._processSprites.call(
  spriteView,
  { drawImage: (...args) => spriteCalls.push(args) },
  [{ frame: 3, type: 5, width: 48, height: 48, x: 200, y: 100, xOffset: -8, yOffset: -8 }],
);
test.assert(
  spriteCalls.length === 1
  && spriteCalls[0][1] === 192 && spriteCalls[0][2] === 384
  && spriteCalls[0][3] === 96 && spriteCalls[0][4] === 96
  && spriteCalls[0][5] === 64 && spriteCalls[0][6] === 24
  && spriteCalls[0][7] === 96 && spriteCalls[0][8] === 96,
  "sprites read 96px HD frames and paint at scaled world coordinates",
);
test.assert(
  spriteDamage[0].x === 2 && spriteDamage[0].xBound === 5
  && spriteDamage[0].y === 0 && spriteDamage[0].yBound === 4,
  "sprite damage rectangles stay in logical 16px tiles",
);

const legacyView = {
  _canvas: { parentNode: { clientWidth: 800, clientHeight: 600 }, style: {} },
  _tileSet: { tileWidth: 16 },
  _map: { width: 120, height: 100 },
  _allowScrolling: true,
};
engine.GameCanvas.prototype._calculateDimensions.call(legacyView);
test.assert(legacyView.canvasWidth === 800 && legacyView._wholeTilesInViewX === 50,
  "a classic 1x tile set still renders with the original geometry");

test.assertIncludes(shellSource, 'loadMicropolisImage("tiles@2x.png")', "the shell prefers the HD atlas");
test.assertMatches(shellSource, /catch\(\(\) => Promise\.all\(\[\s*loadMicropolisImage\("tiles\.png"\)/,
  "missing HD art falls back to the classic pair as a unit");
test.assertIncludes(shellSource, 'hd ? "tilessnow@2x.png" : "tilessnow.png"', "the snow set follows the active scale");
test.assertIncludes(shellSource, "micropolisCssTileWidth", "pan and wheel deltas use the CSS tile width");

// --- city saves are durable desk data -----------------------------------------

const projectDisk = read("app/features/project-disk.js");
test.assertIncludes(config, 'citiesStoreName: "cities"', "city saves have a declared object store");
test.assertIncludes(config, "indexedDbVersion: 5", "the database version keeps the cities store (v4 added the separate Bonsai store; v5 added image attachments)");
test.assertIncludes(config, "citiesStoreName", "the cities store survives later schema versions");
test.assertIncludes(read("app.js"), "citiesStoreName,", "app.js destructures the store name into the shared scope");
test.assertIncludes(projectDisk, "db.createObjectStore(citiesStoreName", "the upgrade path creates the cities store");
test.assertIncludes(shellSource, "AISystem6StorageTransactions.runTransaction", "city writes go through the shared write fence");

// --- wiring -------------------------------------------------------------------

test.assertIncludes(shellSource, "window.AISystem6MicropolisLoaded = true;", "the lazy module installs its loaded flag");
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6MicropolisLoaded"', "config.js owns the lazy loader");
test.assertMatches(config, /ensureMicropolisModule[\s\S]{0,200}styles\.micropolis\.css/,
  "the lazy loader pulls the Micropolis stylesheet with the module");
test.assert(
  /ensure: \(\) => ensureMicropolisModule\(\)/.test(windowRegistryRecords().micropolis?.lazy || ""),
  "session restore reloads the module through the window registry");
test.assertMatches(windowManager, /mobileFullScreenAppIds = new Set\(\[[^\]]*"micropolis"/,
  "the phone shell treats Micropolis as a full-screen app");
test.assert(windowApp("micropolis") === "micropolis", "the window declares its owning app");
test.assertNotIncludes(html, 'data-window="micropolis"', "the window frame stays off the startup disk");
test.assertIncludes(shellSource, 'data-window="micropolis"', "the lazy module installs the real window frame");
test.assertMatches(styleManifest, /id: "micropolis",\s*\n\s*output: "styles\.micropolis\.css"/,
  "the stylesheet is a lazy style bundle");
test.assertIncludes(shellSource, 'AISystem6RegisterApplicationMenuSet?.("micropolis"', "the lazy module owns its application menus");
test.assertIncludes(shellSource, "AISystem6Runtime?.registerCommand", "the lazy module owns its menu command handlers through the runtime");
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
