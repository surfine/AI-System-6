import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("soundscape");
const source = read("app/features/soundscape.js");
const html = read("index.html");
const css = read("styles/88-soundscape.css");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");
const styleManifest = read("scripts/style-manifest.mjs");
const runtimeManifest = read("scripts/runtime-manifest.mjs");
const config = read("app/core/config.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const menus = read("app/data/menus.js");
const app = read("app.js");
const icons = read("app/core/system-icons.js");
const router = read("src/server/router.js");
const systemMusicRoute = read("src/server/routes/system-music.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// Application identity and lazy loading.
test.assertIncludes(html, 'data-window="soundscape"', "Soundscape has a real System 6 window");
test.assertIncludes(html, 'data-action="open-soundscape"', "Applications has a static Soundscape launcher");
test.assertIncludes(app, 'action: "open-soundscape"', "dynamic Applications listings include Soundscape");
test.assertIncludes(multiFinder, 'soundscape: "soundscape"', "the window owns a MultiFinder application");
test.assertIncludes(menus, "soundscape: soundscapeMenus", "Soundscape owns its menu set");
test.assertIncludes(actions, '"open-soundscape": () => openWindow("soundscape")', "the launcher opens the System 6 window");
test.assertIncludes(runtimeManifest, '"app/features/soundscape.js"', "the module is a lazy runtime path");
test.assertNotIncludes(html, 'src="app/features/soundscape.js"', "the lazy feature does not inflate startup");
test.assertIncludes(config, "async function ensureSoundscapeModule()", "the feature has one guarded lazy loader");
test.assertIncludes(windowManager, "attach: () => window.AISystem6Soundscape?.attach?.()", "session restore reattaches the feature");
test.assertIncludes(icons, "soundscape:", "Soundscape has a system icon in both visual languages");
test.assertIncludes(icons, 'M8 16h3l2-6 3 12 3-10 2 7h3', "the icon uses a sound-wave landscape instead of a decorative disc");
test.assertIncludes(icons, "const transportIconPaths = {", "transport keys share one set of 1-bit paths across both themes");
for (const glyph of ["play", "pause", "previousTrack", "nextTrack", "shuffleTracks", "repeatTracks", "speaker"]) {
  test.assertIncludes(icons, `${glyph}: \``, `${glyph} is drawn art, not a Unicode character`);
}
test.assertNotIncludes(html, 'id="soundscape-play-glyph" aria-hidden="true">\u25b6', "the play key is not a font glyph");

// Listen-only playback. Apple Music stays inside the signed-in macOS Music app;
// local files stay as revocable session URLs. There is no token or download
// path.
test.assertIncludes(source, "const localAudio = new Audio()", "local audio uses the browser playback engine");
test.assertIncludes(source, "URL.createObjectURL(file)", "local files play without being copied");
test.assertIncludes(source, "URL.revokeObjectURL(url)", "temporary local playback URLs are released");
test.assertIncludes(source, "const sessionLocalUrls = new Map()", "local files can be restored during the current session without being persisted");
test.assertIncludes(source, 'fetch("/api/music/system"', "Soundscape talks only to the local Music bridge");
test.assertIncludes(source, 'requestSystemMusic("state")', "the player reads real Music app state");
test.assertIncludes(source, 'runSystemAction("play-pause")', "the main transport controls the Music app");
test.assertIncludes(source, 'runSystemAction("set-repeat"', "repeat mode is written to the active playback engine");
test.assertIncludes(source, 'runSystemAction("set-shuffle"', "shuffle is written to the active playback engine");
test.assertNotIncludes(source, ".download", "Soundscape exposes no download control");
test.assertNotIncludes(source, "mediaUserToken", "Soundscape does not persist Apple Music user tokens");
test.assertNotIncludes(source, "developerToken", "the primary player has no developer-token dependency");
test.assertIncludes(router, '["GET /api/music/system", handleSystemMusic]', "the read-only Music state route is local");
test.assertIncludes(router, '["POST /api/music/system", handleSystemMusic]', "the allowlisted Music command route is local");
test.assertIncludes(systemMusicRoute, "const ALLOWED_ACTIONS = new Set([", "the system bridge has a closed command vocabulary");
test.assertIncludes(systemMusicRoute, 'process.platform !== "darwin"', "non-Mac hosts fail honestly");
test.assertIncludes(systemMusicRoute, '"/usr/bin/osascript"', "the bridge uses the macOS Music scripting surface");
test.assertIncludes(systemMusicRoute, '"Cache-Control": "no-store"', "Music state is never cached");
test.assertNotIncludes(systemMusicRoute, "APPLE_MUSIC_DEVELOPER_TOKEN", "the bridge needs no Apple developer token");

// A real basic player has explicit playback modes and a local queue that can
// be removed or cleared without pretending to control Music's hidden queue.
test.assertNotIncludes(html, 'id="soundscape-progress" type="range"', "position is not a browser-native slider");
test.assertNotIncludes(html, 'id="soundscape-volume" type="range"', "volume is not a browser-native slider");
test.assertIncludes(html, 'id="soundscape-progress" class="system-track" role="slider"', "position is a System 6 track that still reports a slider role");
test.assertIncludes(html, 'id="soundscape-volume" class="system-segments" role="slider"', "volume uses Sound control panel segment cells");
test.assertIncludes(html, 'id="soundscape-intensity" class="system-segments" role="slider"', "Enter Scene uses the same level control as volume");
test.assertIncludes(css, "--system-track-bg", "the dithered track is token-driven so both themes share one geometry");
test.assertNotIncludes(liquid, "--system-track-fill: linear-gradient", "the position track reports position in both themes, never percent complete");
test.assertIncludes(css, "--system-segment-on-bg", "segment cells are token-driven so both themes share one cell count");
test.assertIncludes(source, "function bindDragControl(element, handlers)", "the custom controls are pointer operable");
test.assertIncludes(source, 'element.setAttribute("aria-valuenow"', "the custom controls report their value to assistive tech");
test.assertIncludes(source, "const jump = { Home: 0, End: 1 }[event.key];", "the custom controls stay keyboard operable");

for (const id of ["soundscape-shuffle", "soundscape-repeat", "soundscape-mute", "soundscape-clear-queue"]) {
  test.assertIncludes(html, `id="${id}"`, `${id} is a visible player control`);
}
test.assertIncludes(source, 'const REPEAT_MODES = Object.freeze(["off", "all", "one"])', "repeat supports off, all, and one");
test.assertIncludes(source, 'if (state.repeat === "one")', "single-track repeat actually restarts local audio");
test.assertIncludes(source, "function randomQueueIndex()", "local shuffle chooses a real queue item");
test.assertIncludes(source, "function removeQueueIndex(index)", "local queue rows can be removed");
test.assertIncludes(source, "function clearLocalQueue()", "the local queue can be cleared");
test.assertIncludes(source, "soundscape_system_queue_managed", "Music's hidden queue is delegated honestly");

// One-click moments are visible objects, not hidden recommendation state.
test.assertIncludes(html, 'id="soundscape-save-moment"', "Save This Moment is a primary visible action");
test.assertIncludes(source, "function saveMoment()", "saving is an explicit user command");
test.assertIncludes(source, "queue: serializeQueue()", "a moment captures its queue");
test.assertIncludes(source, "position: currentPosition()", "a moment captures playback position");
test.assertIncludes(source, "volume: state.volume", "a moment captures volume");
test.assertIncludes(source, "muted: state.muted", "a moment captures mute");
test.assertIncludes(source, "shuffle: state.shuffle", "a moment captures shuffle");
test.assertIncludes(source, "repeat: state.repeat", "a moment captures repeat");
test.assertIncludes(source, "style: { ...state.style }", "a moment captures the sensory style");
test.assertIncludes(source, "localStorage.setItem(STORAGE_KEY", "moments persist locally");
test.assertNotIncludes(source, "setInterval(saveMoment", "nothing saves itself behind the user's back");

// The Photographic Styles-inspired field is direct, keyboard operable, and
// constrained to six memorable starting points.
for (const preset of ["standard", "coldMist", "warmWood", "nightSail", "sunlight", "pulse"]) {
  test.assertIncludes(source, `${preset}: Object.freeze`, `${preset} is a first-class style preset`);
}
test.assertIncludes(source, "pulse: Object.freeze({ x: 68, y: 14, intensity: 76 })", "Pulse lands in the warm, tense, immersive corner");
test.assertIncludes(html, 'id="soundscape-style-field"', "the 2D sensory field is visible");
test.assertIncludes(html, 'class="soundscape-axis soundscape-axis-top" data-i18n="soundscape_tension"', "tension owns the bright top edge");
test.assertIncludes(html, 'class="soundscape-axis soundscape-axis-bottom" data-i18n="soundscape_calm"', "calm owns the muted bottom edge");
test.assertIncludes(source, "styleFromPointer(event)", "the field follows direct pointer movement");
test.assertIncludes(source, "ArrowLeft: [-step, 0]", "the field is keyboard operable");
test.assertIncludes(source, 'root.style.setProperty("--ss-field-x"', "the field maps state into visual custom properties");
test.assertIncludes(css, "left: var(--ss-field-x)", "the field puck visibly reflects its horizontal value");
test.assertIncludes(css, "top: var(--ss-field-y)", "the field puck visibly reflects its vertical value");
test.assertIncludes(source, "const legacyStyleAxis", "saved styles migrate when the vertical meaning flips");
test.assertIncludes(source, "invertLegacyY ? 100 - y : y", "legacy calm and tension do not silently reverse");
test.assertIncludes(css, "--ss-field-grid", "the sensory field keeps the Endfield Terminal's paper-and-grid surface");
test.assertIncludes(css, "--ss-field-cold", "cold owns the left edge of the field");
test.assertIncludes(css, "--ss-field-warm", "warm owns the right edge of the field");
test.assertIncludes(css, "repeating-linear-gradient(0deg, rgba(16, 17, 20, 0.34) 0 1px, transparent 1px 5px)", "tension reads as dense, sharp contour lines");
test.assertNotIncludes(css, "rgba(31, 36, 47, 0.54)", "calm reads as low contrast without being darkened");
test.assertIncludes(css, "@media (prefers-reduced-motion: reduce)", "motion respects reduced-motion preferences");
test.assertNotIncludes(css, "!important", "the new surface adds no important overrides");
test.assertNotIncludes(css, "body.use-liquid-glass", "Classic and Liquid Glass share one token-driven structure");
test.assertIncludes(styleManifest, '"styles/88-soundscape.css"', "the component stylesheet is in the style manifest");

// Mini Player first: one persistent listening surface and one tabbed drawer at
// every width, including the full-screen mobile app shell.
test.assertIncludes(html, 'class="soundscape-mode-switch" role="tablist"', "queue, style, and saved moments share one drawer");
test.assertIncludes(html, 'data-soundscape-action-for="queue"', "the switch strip carries the queue drawer's own action");
test.assertIncludes(html, 'data-soundscape-action-for="style"', "the switch strip carries the style drawer's own action");
test.assertIncludes(html, 'data-soundscape-action-for="saved"', "the switch strip carries the saved drawer's own action");
test.assertIncludes(source, "[data-soundscape-action-for]", "only the active drawer's action is visible");
test.assertNotIncludes(html, "soundscape-section-index", "the three drawers are peers, not numbered steps");
test.assertNotIncludes(html, "soundscape-eyebrow", "the deck drops the landing-page eyebrow");
test.assertIncludes(html, 'data-soundscape-panel="queue"', "the queue is one drawer panel");
test.assertIncludes(html, 'data-soundscape-panel="style" hidden', "the sensory field is hidden until requested");
test.assertIncludes(html, 'data-soundscape-panel="saved" hidden', "saved moments are hidden until requested");
test.assertIncludes(css, "grid-template-rows: 110px minmax(0, 1fr)", "the independent app keeps a compact playback deck above one workspace");
test.assertIncludes(css, "width: 64px", "placeholder artwork stays subordinate to the player controls");
test.assertIncludes(css, "grid-template-rows: 186px minmax(240px, 1fr)", "phone-width Soundscape keeps the deck compact above one workspace");
test.assertIncludes(css, "--portrait-window-height:", "portrait flow receives a bounded window height");
test.assertIncludes(windowManager, '"soundscape",', "Soundscape participates in the mobile full-screen app shell");

// Project Hard Disk linkage only happens after an actual save and a mounted
// project selection.
test.assertIncludes(source, "function linkSelectedToProject()", "a saved moment can be linked deliberately");
test.assertIncludes(source, "state.projectLinks[project.id] = moment.id", "the project link records a real saved object");
test.assertIncludes(source, "typeof getActiveProject ===", "Soundscape resolves the mounted System 6 project");
test.assertIncludes(source, "function restoreProjectSoundscape()", "a project can restore its linked atmosphere");
test.assertIncludes(html, 'id="soundscape-recover-moment"', "a stale moment offers a way back to its real source");
test.assertIncludes(source, "function momentUnavailable(moment = selectedMoment())", "staleness is detected, not assumed");
test.assertIncludes(source, "function recoverSelectedMoment()", "recovery hands the user back to Music or the file picker");
test.assertIncludes(css, ".soundscape-saved-swatch", "the saved swatch reports hue at a fixed width");
test.assertNotIncludes(source, "--soundscape-swatch-width", "swatch width no longer pretends to encode intensity");

// The palette is a chart of named colours, not three adjectives over a 240px
// field. Every cell has a name, and the six preset buttons are six of them.
const chartRows = source.match(/const CHART_CELLS = Object\.freeze\(\[([\s\S]*?)\]\.map/);
test.assert(Boolean(chartRows), "the colour chart is declared as a table");
const chartKeys = (chartRows?.[1] || "").match(/"[a-z_]+"/g) || [];
test.assert(chartKeys.length === 49, `the chart names all 7 x 7 cells (found ${chartKeys.length})`);
test.assert(new Set(chartKeys).size === 49, "no cell name is used twice");
for (const preset of ["style_standard", "style_cold_mist", "style_warm_wood", "style_night_sail", "style_sunlight", "style_pulse"]) {
  test.assertIncludes(chartRows?.[1] || "", `"${preset}"`, `the ${preset} preset is a landmark on the chart, not a separate word`);
}
test.assertIncludes(source, "function cellName(", "a point on the field resolves to a named colour");
test.assertIncludes(source, "function fieldCrop(", "the swatch is a crop of the field, not a flat colour");
test.assertIncludes(source, "repeating-linear-gradient(0deg", "the crop carries the contour density that encodes the second axis");
test.assertIncludes(source, "function styleDescription(", "the axis words survive as the accessible description");
test.assertIncludes(source, 'setAttribute("aria-valuetext"', "the field announces its cell to a screen reader");
test.assertIncludes(source, "Math.abs(at - edge) < 1.5", "a name does not flicker while the pointer rests on a grid line");

// Enter Scene decides how far the colour reaches, and the ceiling keeps every
// tinted surface paper.
test.assertIncludes(source, "function reachAt(", "Enter Scene resolves to a reach per surface");
test.assertIncludes(css, "--ss-tint-ceiling", "tinted surfaces read a ceiling token");
test.assertIncludes(foundation, "--ss-tint-ceiling: 6%", "Classic keeps the sensory tint inside bitmap paper");
test.assertIncludes(liquid, "--ss-tint-ceiling: 14%", "Liquid Glass overrides the ceiling by token, not by a twin selector");
test.assertIncludes(css, "var(--ss-reach-drawer) * var(--ss-tint-ceiling)", "the drawer paper is tinted through the ceiling");
test.assertIncludes(css, ".soundscape-window .details-bar.soundscape-status-bar", "the last stage reaches the window chrome Soundscape owns");
test.assertNotIncludes(css, ".soundscape-window .title-bar", "the title bar's shared striped background is left alone");
test.assertNotIncludes(css, "var(--system-segment-on-bg))", "no color-mix runs over a Liquid Glass gradient token");

// Bilingual and bootstrap-safe.
test.assertIncludes(en, 'soundscape_save_moment: "Save This Moment"', "English product copy exists");
test.assertIncludes(zh, 'soundscape_save_moment: "保存此刻"', "Chinese product copy exists");
test.assertIncludes(zh, 'soundscape_style_cold_mist: "冷雾"', "the Chinese sensory palette is explicit");
test.assertIncludes(zh, 'soundscape_repeat_one: "单曲循环"', "single-track repeat is explicit in Chinese");
test.assertIncludes(en, "soundscape_level_of:", "segment levels have readable English value text");
test.assertIncludes(zh, "soundscape_level_of:", "segment levels have readable Chinese value text");
test.assertIncludes(en, 'soundscape_find_again_music: "Find It in Music"', "English recovery copy names the real source");
test.assertIncludes(zh, "soundscape_find_again_music:", "Chinese recovery copy names the real source");
test.assertIncludes(app, "var translations = window.AISystem6Data?.translations || {}", "early restored controls can translate without a lexical dead zone");

test.finish();
