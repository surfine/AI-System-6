// Bonsai City product shell contracts: the lazy System 6 window is wired
// through every integration point and the shell keeps the core headless,
// pauses when hidden, and persists through the shared write-fence helper.

import vm from "node:vm";
import { createFeatureTest, read, windowApp } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-shell");

// The shell module must load with no DOM access and install its API.
const context = vm.createContext({ window: {} });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
vm.runInContext(read("app/features/bonsai-repository.js"), context);
vm.runInContext(read("app/features/bonsai-renderer.js"), context);
vm.runInContext(read("app/features/bonsai-city.js"), context);
const shell = context.window.AISystem6BonsaiCity;
test.assert(shell && typeof shell.attach === "function", "the shell installs an idempotent attach");
test.assert(typeof shell.detach === "function", "the shell installs a detach");
test.assert(typeof shell.setSpeed === "function", "the shell installs speed control");
test.assert(typeof shell.refreshLanguage === "function", "the shell installs a language refresh");
test.assert(typeof shell.isRunning === "function", "the shell exposes its loop state");
const saveGuard = context.window.AISystem6BonsaiSaveGuard;
const guardedCity = { seed: 7, size: 64, tick: 10, rev: 2, nextCommandSequence: 3 };
const saveStamp = saveGuard.capture(guardedCity);
await Promise.resolve();
guardedCity.rev += 1;
test.assert(saveGuard.matches(guardedCity, saveStamp) === false, "a mutation during an asynchronous save cannot clear the dirty state");

const shellSource = read("app/features/bonsai-city.js");
test.assertIncludes(shellSource, 'WINDOW_NAME = "bonsaiCity"', "the shell targets the registered window name");
test.assertIncludes(shellSource, 'setAttribute("data-window", "bonsaiCity")', "the shell injects the window frame by name");
test.assertIncludes(shellSource, "advanceTicks", "the shell drives the core by integer ticks");
test.assertIncludes(shellSource, "drainEvents", "the shell drains typed events");
test.assertIncludes(shellSource, "submitCommand", "pointer input becomes commands, never direct mutation");
test.assertIncludes(shellSource, "AISystem6BonsaiCanvasRenderer", "the shell keeps the Canvas backend");
test.assertIncludes(shellSource, "AISystem6BonsaiVoxelRenderer", "the shell offers the phase 9 voxel backend");
test.assertIncludes(shellSource, 'rendererBackend: "canvas-2d"', "the Canvas backend stays the default until the flip is validated");
test.assertIncludes(shellSource, "bonsai-voxel-webgl-unavailable", "a WebGL-less mount falls back to Canvas by typed error");
test.assertIncludes(shellSource, 'AISystem6RegisterApplicationMenuSet?.("bonsaiCity"', "the shell registers the Bonsai application menu set");
test.assertIncludes(shellSource, 'labelKey: "menu_file"', "the File menu opens the researched Macintosh split");
test.assertIncludes(shellSource, 'labelKey: "bonsai_menu_speed"', "the Speed menu carries the transport verbs");
test.assertIncludes(shellSource, 'labelKey: "bonsai_menu_options"', "the Options menu carries the renderer and sound controls");
test.assertIncludes(shellSource, 'labelKey: "bonsai_menu_disasters"', "the Disasters menu owns the five disasters");
test.assertIncludes(shellSource, 'labelKey: "bonsai_menu_windows"', "the Windows menu owns the city data windows");
test.assertIncludes(shellSource, 'labelKey: "bonsai_menu_newspaper"', "the Newspaper menu owns the paper");
test.assertIncludes(shellSource, 'item("toggle-renderer", "bonsai_renderer_switch")', "the backend switch moved into the Options menu");
test.assertIncludes(shellSource, "registerCommand", "menu commands register through the runtime like Micropolis");
test.assertIncludes(shellSource, 'active?.dataset.window !== "bonsaiCity"', "menu commands are unavailable outside the active Bonsai window");
test.assertIncludes(shellSource, "commandsNeedingCity", "city-only commands gate on a live city");
test.assertNotIncludes(shellSource, "data-bonsai-renderer-toggle", "the playfield command strip is gone; the toggle lives in a menu");
test.assertNotIncludes(shellSource, ".bonsai-command-strip", "the playfield command strip element is deleted");
test.assertNotIncludes(shellSource, "buildCommandStrip", "the playfield command strip builder is deleted");
test.assertIncludes(shellSource, "AISystem6CityDemandGauge.draw(", "the RCI demand gauge is drawn by the shared core");
test.assertIncludes(shellSource, 'data-bonsai-rci-gauge width="32" height="20"', "the RCI gauge is the core 32x20 gauge-bar tier");
test.assertIncludes(shellSource, "--city-demand-r", "the gauge colours come from the shared colour tokens");
test.assertIncludes(shellSource, 'data-bonsai-rci-panel width="72" height="44"', "the palette footer carries the 72x44 panel gauge");
test.assertIncludes(shellSource, "bonsai-palette-footer", "the palette gains a bottom footer");
test.assertIncludes(shellSource, 'data-bonsai-status role="status" aria-live="polite"', "the status host keeps its element and aria-live");
test.assertIncludes(shellSource, "bonsai-gauge-city", "the gauge bar leads with the city name");
test.assertIncludes(shellSource, "bonsai-gauge-funds", "the gauge bar always keeps funds");
test.assertIncludes(shellSource, "bonsai-gauge-speed", "the gauge bar always keeps speed");
test.assertIncludes(shellSource, "bonsai-gauge-undo-redo", "undo and redo live in the gauge bar");
test.assertNotIncludes(shellSource, "data-bonsai-toolbox", "the flat toolbox element is replaced by the rail and sub-palette");
test.assertNotIncludes(shellSource, "buildToolbox", "the flat toolbox builder is gone");
test.assertIncludes(shellSource, 'data-bonsai-rail', "the rail is the new tool surface");
test.assertIncludes(shellSource, "bonsai-sub-palette", "the sub-palette holds one category at a time");
test.assertIncludes(shellSource, "dataset.bonsaiCategory", "rail cells and tool buttons share the category key the gate opens");
test.assertIncludes(shellSource, 'id: "pan"', "the 手 pan tool is a rail cell like any other");
test.assertIncludes(shellSource, "PAN_TOOL", "pan is a first-class tool");
test.assertIncludes(shellSource, "BONSAI_TOUCH_TOOL_DELAY_MS", "a touch commit holds a grace delay for a second finger");
test.assertIncludes(shellSource, "BONSAI_TOUCH_TOOL_SLOP_PX", "a moving finger passes a slop threshold into a drag-draw");
test.assertIncludes(shellSource, "pendingTouchTool", "the touch grace follows the Micropolis pendingTouchTool shape");
test.assertIncludes(shellSource, "paletteSheetOpen", "the sheet swallows an outside tap to dismiss it");
test.assertNotIncludes(shellSource, "openTileInspector", "the tile query side pane is replaced by the balloon");
test.assertNotIncludes(shellSource, "overlayControlMarkup", "the overlay select leaves the inspector with the minimap and chips");
test.assertIncludes(shellSource, "data-bonsai-tile-balloon", "the tile query is a balloon card on the playfield");
test.assertIncludes(shellSource, "openTileBalloon", "the balloon carries today's tileInfo rows");
test.assertIncludes(shellSource, "tileScreenPoint", "the balloon anchors near the tile through the shared projection math");
test.assertIncludes(shellSource, "tileBalloonOpen", "the balloon dismisses on the next tap");
test.assertIncludes(shellSource, "BONSAI_TOUCH_LONG_PRESS_MS", "holding a finger queries the tile instead of building");
test.assertIncludes(shellSource, "data-bonsai-overlay-chip", "the ten data-view chips live in the minimap card");
test.assertIncludes(shellSource, "data-bonsai-status-overlay", "the gauge names the active overlay");
test.assertIncludes(shellSource, "bonsai_menu_data_views", "the data views mirror under the Options menu for keyboard reach");
test.assertIncludes(shellSource, "openGraphs", "the graphs panel opens from the Windows menu");
test.assertIncludes(shellSource, "openPopulation", "the population panel opens from the Windows menu");
test.assertIncludes(shellSource, "openIndustry", "the industry panel opens from the Windows menu");
test.assertIncludes(shellSource, "openNeighbors", "the neighbors panel opens from the Windows menu");
test.assertIncludes(shellSource, "drawGraphChart", "the graphs panel draws a 1-bit line chart");
test.assertIncludes(shellSource, "data-bonsai-graph-canvas", "the chart canvas lives in the panel host");
test.assertIncludes(shellSource, "graphRangeSpec", "the chart offers 10 / 50 / 100 year ranges");
test.assertIncludes(shellSource, "setDisplay", "the four display toggles switch renderer layers");
test.assertIncludes(shellSource, "bonsaiDisplay", "the display toggles carry their checked hook into the menu");
test.assertIncludes(shellSource, '{ id: "rewards", labelKey: "bonsai_tool_group_rewards" }', "rewards is a rail category, as it is a palette group in the original");
test.assertNotIncludes(shellSource, "bonsai_menu_rewards", "no reward places a building from a menu");
test.assertNotIncludes(shellSource, "data-bonsai-goals", "the opening checklist no longer floats on the city");
test.assertIncludes(shellSource, 'state.inspectorMode === "goals"', "the checklist is panel content opened from the Windows menu");
test.assertIncludes(shellSource, "teachingStory", "the newspaper's first edition carries the teaching");
test.assertIncludes(shellSource, "markOpeningGoalsMet", "a city that arrives already built is never taught again");
test.assertIncludes(shellSource, "bonsai-news-masthead", "the newspaper gains a masthead");
test.assertIncludes(shellSource, "bonsai-budget-section", "the budget controls collapse into sections");
test.assertIncludes(shellSource, "bonsai-setup-advanced", "the seed hides in a collapsed Advanced disclosure");
test.assertIncludes(shellSource, 'data-bonsai-map-seed', "the seed still round-trips through the setup form");
test.assertIncludes(shellSource, "bonsai_start_city", "the primary action reads Start City");
test.assertIncludes(shellSource, "bonsai_new_map", "regenerating reads New Map");
test.assertIncludes(shellSource, "bonsai_preview_summary_short", "the preview note drops the seed from the first screen");
test.assertNotIncludes(shellSource, "bonsai_create_city", "the old Create City label leaves the shell");
test.assertNotIncludes(shellSource, "bonsai_regenerate_preview", "the old Regenerate label leaves the shell");
test.assertIncludes(shellSource, "active.render(", "the shell hands snapshots to the active backend's draw pass");
test.assertIncludes(shellSource, "pickTile", "pointer input maps through the isometric picker");
test.assertIncludes(shellSource, "previewCommand", "drag previews share the core command validator");
test.assertIncludes(shellSource, "zoomAt", "the shell owns camera zoom as view state");
test.assertIncludes(shellSource, "panBy", "the shell owns camera pan as view state");
test.assertIncludes(shellSource, "AISystem6BonsaiSaveWorkerManager", "saves use the bounded worker manager");
test.assertIncludes(shellSource, "saveCodec().encode", "save writes go through the v2 integrity codec");
test.assertIncludes(shellSource, "runTransaction", "writes go through the shared write-fence transaction helper");
test.assertIncludes(shellSource, "visibilityState === \"visible\"", "the loop pauses when the document is hidden");
test.assertIncludes(shellSource, "AUTOSAVE_DELAY_MS = 300", "accepted city mutations schedule a bounded durability write");
test.assertIncludes(shellSource, 'listen(window, "pagehide"', "pagehide requests the same guarded save path");
test.assertIncludes(shellSource, "if (save && (state.dirty || state.saving) && !await flushCurrentCitySave())", "teardown stops when a stable save cannot complete");
test.assertIncludes(shellSource, "setInterval(tick, FRAME_MS)", "the shell paces at the fixed frame interval");
test.assertIncludes(shellSource, "FRAME_MS = 50", "the frame interval matches the 20 Hz logical tick");
test.assertIncludes(shellSource, "registerApplication", "the shell registers its lazy application command so handleAction can open it");
test.assertIncludes(shellSource, "\"open-bonsai-city\"", "the registered command matches the Applications launch action");
test.assertIncludes(shellSource, "builtViewCenter(state.current) || state.current.spawnCenter", "loading a saved city centers the camera on the built-up area before falling back to the spawn point");
test.assertIncludes(shellSource, "builtViewCenter(city) || city.spawnCenter", "opening an example city centers the camera on the built-up area before falling back to the spawn point");

// --- wiring through the desktop ----------------------------------------------

const registry = read("tooling/interface-guidelines-contract.mjs");
test.assertIncludes(registry, "bonsaiCity: creativeLab()", "the window registry declares the creative-lab shell");

const runtime = read("tooling/runtime-manifest.mjs");
for (const path of [
  "app/features/bonsai-translations.js",
  "app/features/bonsai-city-sim.js",
  "app/features/bonsai-save-worker-manager.js",
  "app/features/bonsai-repository.js",
  "app/features/bonsai-renderer.js",
  "app/generated/bonsai-atlas.js",
  "app/features/bonsai-renderer-canvas.js",
  "app/features/bonsai-city.js",
]) {
  test.assertIncludes(runtime, `"${path}"`, `${path} is a lazy runtime module`);
}

const styles = read("tooling/style-manifest.mjs");
test.assertIncludes(styles, "id: \"bonsai\"", "the lazy style bundle is declared");
test.assertIncludes(styles, "output: \"styles.bonsai.css\"", "the lazy style bundle output is named");
test.assertIncludes(styles, "styles/94-bonsai.css", "the lazy style bundle owns its scoped sheet");

// A pointer drag over the window chrome must never paint a text selection
// (second sighting of this defect class ships with a gate), and a
// module-built window must wire its own title-bar drag: the boot loop only
// binds the title bars that exist in index.html.
const bonsaiSheet = read("styles/94-bonsai.css");
const windowRootRule = bonsaiSheet.split(".bonsai-window {")[1]?.split("}")[0] || "";
test.assertIncludes(windowRootRule, "user-select: none", "the window root carries the no-select rule");
test.assertIncludes(bonsaiSheet, ".bonsai-window [contenteditable=\"true\"]", "real text-edit surfaces opt back into selection");
// The drag lives in the core so every module-built window moves by one
// contract: wireWindowChrome hands each window's title bar to the shared
// title-bar wiring, and a window that can close can also move.
test.assertIncludes(read("app/core/wireup.js"), "function wireTitleBarChrome(", "one shared title-bar wiring exists");
test.assertIncludes(read("app/core/wireup.js"), 'win.querySelectorAll(".title-bar").forEach((bar) => wireTitleBarChrome(bar))', "wireWindowChrome hands module-built title bars to it");

const actions = read("app/core/actions.js");
test.assertIncludes(actions, "\"open-bonsai-city\"", "the open action is registered");
test.assertIncludes(actions, "ensureBonsaiCityModule", "the open action routes through the lazy loader");

const finder = read("app.js");
test.assertIncludes(finder, "action: \"open-bonsai-city\"", "Applications lists Bonsai City");
test.assertIncludes(shellSource, "showFirstHint", "a fresh city greets the player with a gentle first-run hint");
test.assertIncludes(shellSource, "dismissFirstHint", "the first-run hint fades after the player's first move");
test.assertIncludes(shellSource, "AISystem6BonsaiTranslations", "the shell falls back to Bonsai's frozen translation snapshot");

const windowManager = read("app/core/window-manager.js");
const windowRegistrySource = read("app/core/window-registry.js");
test.assertIncludes(windowRegistrySource, "bonsaiCity: {", "one registry owns the lazy window entry");
test.assertIncludes(windowManager, "mobileImmersiveAppIds", "the window participates in the immersive mobile shell");
test.assertIncludes(windowManager, "writerMode && !writerModeCompatible", "opening Bonsai leaves the writing-only desktop mode before immersive layout");

const multiFinder = read("app/core/multi-finder.js");
test.assertIncludes(multiFinder, "bonsaiCity: \"Bonsai City\"", "MultiFinder labels the application");
test.assert(windowApp("bonsaiCity") === "bonsaiCity", "the window maps to the application identity");

const projectDisk = read("app/features/project-disk.js");
test.assertIncludes(projectDisk, "bonsaiCitiesStoreName", "the IndexedDB upgrade path creates the Bonsai store");

test.finish();
