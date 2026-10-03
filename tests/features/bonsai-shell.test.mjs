// Bonsai City product shell contracts: the lazy System 6 window is wired
// through every integration point and the shell keeps the core headless,
// pauses when hidden, and persists through the shared write-fence helper.

import vm from "node:vm";
import { admissionRows, admittedApplicationGroup, createFeatureTest, read, windowApp } from "../helpers/feature-test-harness.mjs";

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
// The minimap is a control, not a picture: it draws the tile bounds the camera
// is looking at and a click (or an arrow key) moves the view there.
test.assertIncludes(shellSource, "function miniMapViewportBounds()", "the shell reads the camera's tile bounds through the shared math");
test.assertIncludes(shellSource, "viewport: miniMapViewportBounds()", "the minimap draws that rectangle");
test.assertIncludes(shellSource, "function miniMapTileAt(event)", "a pointer on the minimap resolves to a tile");
test.assertIncludes(shellSource, "function centerViewOnTile(tile)", "the view can be centred on a tile, keeping zoom, rotation and the data view");
test.assertIncludes(shellSource, "onMiniMapPointer", "a press on the minimap navigates");
test.assertIncludes(shellSource, 'data-bonsai-minimap width="1" height="1" tabindex="0"', "the minimap is reachable from the keyboard");
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
test.assertIncludes(shellSource, "const recordId = `example-${exampleId}`", "an example city's save id is derived from its example id, not a fresh random one");
test.assertIncludes(shellSource, "record.id === recordId", "reopening an example opens the record already saved for it instead of replaying and writing a second");
test.assertIncludes(shellSource, '{ id: "hezhou-1952", label: "hezhou", note: true }', "the city browser lists Hezhou, 1952 as a third example button");
test.assertIncludes(shellSource, "state.speed = 1", "a newly opened example runs at normal speed instead of pausing");

// --- the Basin: the one world Bonsai City, Rootline and Joyride share -------

// 1. Drive Its Streets hands the street the v2 payload the shared core built,
// with the display choices stamped, after stopping the clock; a page without
// the core keeps the older one-shot hand-over.
test.assertIncludes(shellSource, "state.speedBeforeStreets = state.speed", "going down to the street remembers the clock speed");
test.assertIncludes(shellSource, "core.handoff.fromCity(sim(), state.current", "the street receives the shared hand-over, not a bare snapshot");
test.assertIncludes(shellSource, "AISystem6Joyride?.queueCity?.(payload)", "the v2 payload is what Joyride is handed");
test.assertIncludes(shellSource, "keep the older one-shot hand-over", "a page without the world core keeps the old hand-over");
test.assertIncludes(shellSource, "function stampHandoffDisplay(payload, display)", "the shell stamps light and season if the core did not");
test.assertIncludes(shellSource, "BONSAI_SEASON_OF_MONTH", "the season table is shared with the render snapshot");

// 2. The way back restores the clock once, recentres on the stopping tile and
// says where the mayor has returned; the resume hook shares that one restore.
test.assertIncludes(shellSource, "function returnFromStreets({ cityId, tile } = {})", "returnFromStreets is the way back up");
test.assertIncludes(shellSource, "function resumeFromStreetsSpeed()", "the command and the resume hook share one restore path");
test.assertIncludes(shellSource, "state.speedBeforeStreets = null", "the remembered speed is cleared, so it restores once");
test.assertIncludes(shellSource, 'setMessage("bonsai_status_back_from_streets", districtNameAt(tile), potDateText(state.current))', "the way back names the district and the pot date");
test.assertIncludes(shellSource, "onResume: async () => {\n        // Give the street-goer their clock back, once", "the lifecycle resume hook restores the street speed");
test.assertIncludes(shellSource, "returnFromStreets,", "returnFromStreets is on the public window API");

// 3. The open action also accepts the saved record id Rootline sends.
test.assertIncludes(shellSource, "payload?.bonsaiRecordId", "open-bonsai-city accepts the save Rootline names");
test.assertIncludes(shellSource, "record.id === payload.bonsaiRecordId", "the id is looked up the way the city browser lists saves");
test.assertIncludes(shellSource, "if (target) return openSavedRecord(target)", "a known id opens through the browser's own path");

// 4. The gauge speaks the pot calendar in words, with the ISO stamp as the
// fallback, and the weekday names live in the tables.
test.assertIncludes(shellSource, "date: potDateText(state.current) ||", "the gauge date is the pot calendar's, with an ISO fallback");
test.assertIncludes(shellSource, "bonsai_weekday_${date.weekday}", "the weekday comes from the weekday-name keys");
const transContext = vm.createContext({ window: {} });
vm.runInContext(read("app/features/bonsai-translations.js"), transContext);
const bonsaiEn = transContext.window.AISystem6BonsaiTranslations.en;
const bonsaiZh = transContext.window.AISystem6BonsaiTranslations.zh;
test.assert(bonsaiEn.bonsai_pot_date(1952, 7, 1, "Monday", "Minor Heat") === "1 July 1952, Monday \u00b7 Minor Heat", "an English pot date reads 1 July 1952, Monday \u00b7 Minor Heat");
test.assert(bonsaiZh.bonsai_pot_date(1952, 7, 1, "\u5468\u4e00", "\u5c0f\u6691") === "1952\u5e747\u67081\u65e5 \u5468\u4e00 \u00b7 \u5c0f\u6691", "a Chinese pot date reads 1952\u5e747\u67081\u65e5 \u5468\u4e00 \u00b7 \u5c0f\u6691");
test.assert(bonsaiEn.bonsai_weekday_0 === "Monday" && bonsaiZh.bonsai_weekday_0 === "\u5468\u4e00", "weekday keys start at Monday");

// 5. The weather tooltip is translated and metric.
test.assertIncludes(shellSource, 't("bonsai_weather_detail", weather.temperature, Math.round(weather.wind * 1.609), weather.humidity)', "the weather tooltip converts mph to km/h and translates");
test.assert(bonsaiEn.bonsai_weather_detail(28, 18, 60).includes("\u00b0C") && bonsaiEn.bonsai_weather_detail(28, 18, 60).includes("km/h"), "the English tooltip is Celsius and km/h");
test.assert(bonsaiZh.bonsai_weather_detail(28, 18, 60).includes("\u516c\u91cc/\u5c0f\u65f6"), "the Chinese tooltip is km/h");

// 6. ClioTalk holds the clock while it reads, works or waits, and gives the
// speed back unless the player chose another meanwhile.
test.assertIncludes(shellSource, "BONSAI_ASSISTANT_BUSY", "the assistant's busy states are named as Rootline names them");
test.assertIncludes(shellSource, "window.AISystem6AssistantActivity?.subscribe?.(", "the shell pauses with ClioTalk like Rootline");
test.assertIncludes(shellSource, "state.speedBeforeAssistant = state.speed", "the assistant pause remembers the speed");
test.assertIncludes(shellSource, "assistantSpeedUserChanged", "a speed the player picks while paused is not overwritten");

// 7. The language switch repaints the shell through its admission row.
test.assertIncludes(shellSource, "window.renderBonsaiCityLanguage = () => refreshLanguage();", "the shell installs the repaint hook its admission row names");
test.assertIncludes(read("app/core/app-admissions.js"), 'repaint: "renderBonsaiCityLanguage"', "the Bonsai admission row declares the repaint");

// 8. Chinese File menu copy: the scenario item and the full-width ellipses.
const transSource = read("app/features/bonsai-translations.js");
test.assertIncludes(transSource, 'bonsai_open_scenario: "\u6253\u5f00\u5267\u672c\u2026\u2026"', "the Chinese scenario item reads \u6253\u5f00\u5267\u672c\u2026\u2026");
test.assertNotIncludes(transSource, "\u6253\u5f00 scenario", "no Chinese menu item still leaves scenario in English");
test.assertIncludes(transSource, 'bonsai_open_cities: "\u6253\u5f00\u57ce\u5e02\u2026\u2026"', "Chinese File menu ellipses stay full-width");

// 9. Plan Transit in Rootline takes the same v2 payload, without the pause.
test.assertIncludes(shellSource, 'item("plan-transit", "bonsai_plan_transit_rootline")', "the File menu offers Plan Transit after Drive Its Streets");
test.assertIncludes(shellSource, '"plan-transit": () => planTransitInRootline(),', "the menu command queues the plan");
test.assertIncludes(shellSource, "window.AISystem6Rootline?.queuePot", "the plan is queued on Rootline's window global");
test.assertIncludes(shellSource, 'typeof ensureRootlineModule === "function"', "the lazy Rootline module is loaded before it is used");
test.assertIncludes(shellSource, '"send-micropolis", "drive-streets", "plan-transit"', "the plan needs a city, so it is disabled without one");
test.assert(bonsaiEn.bonsai_plan_transit_rootline === "Plan Transit in Rootline\u2026" && bonsaiZh.bonsai_plan_transit_rootline === "\u5728\u6839\u7ebf\u91cc\u89c4\u5212\u7ebf\u7f51\u2026\u2026", "the File menu item is bilingual");

// 10. The avenue tool joins the transport palette beside road and highway.
test.assertIncludes(shellSource, '{ id: "avenue", icon: "\u2550", description: "bonsai_tool_avenue_description", gesture: "path", command: "build-path", network: "avenue" }', "the avenue is a two-tile path tool named avenue");
test.assertIncludes(shellSource, "highway's two-rail mark", "the baked road/highway glyph stands in for the avenue");
test.assert(bonsaiEn.bonsai_tool_avenue === "Avenue" && bonsaiZh.bonsai_tool_avenue === "\u4e3b\u5e72\u9053", "the avenue label is bilingual");
test.assert(bonsaiEn.bonsai_tool_avenue_description.includes("two-tile avenue") && bonsaiZh.bonsai_tool_avenue_description.includes("\u4e24\u683c\u5bbd\u7684\u5927\u9053"), "the avenue description is bilingual");

// 11. A neighbour can be planted in Rootline as a nursery.
test.assertIncludes(shellSource, "data-bonsai-rootline-neighbor", "each neighbour row carries a Look in Rootline button");
test.assertIncludes(shellSource, "data-bonsai-neighbor-index", "the button carries the neighbour's name index");
test.assertIncludes(shellSource, 't("bonsai_neighbor_look_rootline")', "the button is translated");
test.assertIncludes(shellSource, "names.neighbor(citySeed, dir, nameIndex)", "the shared namer seeds the nursery");
test.assertIncludes(shellSource, "queueNursery({ seed: neighbor.seed, name: { zh: neighbor.zh, en: neighbor.en } })", "the nursery carries the seed and both names");
test.assert(bonsaiZh.bonsai_neighbor_look_rootline === "\u5728\u6839\u7ebf\u91cc\u770b\u770b" && bonsaiEn.bonsai_neighbor_look_rootline === "Look in Rootline", "the nursery button is bilingual");

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
test.assertIncludes(read("app/core/app-admissions.js"), "\"open-bonsai-city\"", "the open action is registered in the admission table");
test.assertIncludes(read("app/core/app-admissions.js"), "ensureBonsaiCityModule", "the open action routes through the lazy loader the admission table names");

const finder = read("app.js");
test.assert(admittedApplicationGroup("open-bonsai-city") === "games", "Applications lists Bonsai City (from the admission table)");
test.assertIncludes(shellSource, "showFirstHint", "a fresh city greets the player with a gentle first-run hint");
test.assertIncludes(shellSource, "dismissFirstHint", "the first-run hint fades after the player's first move");
test.assertIncludes(shellSource, "AISystem6BonsaiTranslations", "the shell falls back to Bonsai's frozen translation snapshot");

const windowManager = read("app/core/window-manager.js");
const windowRegistrySource = read("app/core/window-registry.js");
test.assert(admissionRows().bonsaiCity?.api === "AISystem6BonsaiCity" && windowRegistrySource.includes("...window.AISystem6Admissions.windowRecords()"), "one declaration owns the lazy window entry: the admission row, merged into the registry");
test.assertIncludes(windowManager, "mobileImmersiveAppIds", "the window participates in the immersive mobile shell");
test.assertIncludes(windowManager, "writerMode && !writerModeCompatible", "opening Bonsai leaves the writing-only desktop mode before immersive layout");

const multiFinder = read("app/core/multi-finder.js");
test.assertIncludes(read("app/core/app-admissions.js"), 'multiFinder: "Bonsai City"', "MultiFinder labels the application from the admission table");
test.assert(windowApp("bonsaiCity") === "bonsaiCity", "the window maps to the application identity");

const projectDisk = read("app/features/project-disk.js");
test.assertIncludes(projectDisk, "bonsaiCitiesStoreName", "the IndexedDB upgrade path creates the Bonsai store");

test.finish();
