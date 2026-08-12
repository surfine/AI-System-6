import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("soundscape");
const source = read("app/features/soundscape.js");
const html = read("index.html");
const css = read("styles/88-soundscape.css");
const foundation = read("styles/00-foundation.css");
const liquid = read("styles/70-liquid-glass.css");
const styleManifest = read("tooling/style-manifest.mjs");
const runtimeManifest = read("tooling/runtime-manifest.mjs");
const config = read("app/core/config.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const multiFinder = read("app/core/multi-finder.js");
const menus = read("app/data/menus.js");
const app = read("app.js");
const icons = read("app/core/system-icons.js");
const router = read("apps/server/server/router.js");
const systemMusicRoute = read("apps/server/server/routes/system-music.js");
const gamdlModule = read("apps/server/server/gamdl.js");
const gamdlRoute = read("apps/server/server/routes/gamdl.js");
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
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6SoundscapeLoaded", ["app/features/soundscape.js"])', "the feature has one guarded lazy loader");
test.assertIncludes(windowManager, "attach: () => window.AISystem6Soundscape?.attach?.()", "session restore reattaches the feature");
test.assertIncludes(icons, "soundscape:", "Soundscape has a system icon in both visual languages");
test.assertIncludes(icons, 'M8 16h3l2-6 3 12 3-10 2 7h3', "the icon uses a sound-wave landscape instead of a decorative disc");
test.assertIncludes(icons, "const transportIconPaths = {", "transport keys share one set of 1-bit paths across both themes");
for (const glyph of ["play", "pause", "previousTrack", "nextTrack", "shuffleTracks", "repeatTracks", "speaker"]) {
  test.assertIncludes(icons, `${glyph}: \``, `${glyph} is drawn art, not a Unicode character`);
}
test.assertNotIncludes(html, 'id="soundscape-play-glyph" aria-hidden="true">\u25b6', "the play key is not a font glyph");

// Playback stays inside the browser engine. Apple Music keeps streaming in the
// signed-in macOS Music app, and local files stay as revocable session URLs.
// The one download path is the host gamdl bridge: the browser only sends a
// link, never a cookie or a token.
test.assertIncludes(source, "const localAudio = new Audio()", "local audio uses the browser playback engine");
test.assertIncludes(source, "URL.createObjectURL(file)", "local files play without being copied");
test.assertIncludes(source, "URL.revokeObjectURL(url)", "temporary local playback URLs are released");
test.assertIncludes(source, "const sessionLocalUrls = new Map()", "local files can be restored during the current session without being persisted");
test.assertIncludes(source, '"http://127.0.0.1:4173/api/music/system"', "the public Web app sends Music commands back to the host Mac");
test.assertIncludes(source, 'options.targetAddressSpace = "loopback"', "Chromium declares the local Music bridge address space");
test.assertIncludes(source, "isSafariPublicWebUnsupported", "Safari reuses the dedicated HTTP local entry");
test.assertIncludes(source, 'error.code = "local_music_bridge_unavailable"', "an unavailable Mac bridge has a specific low-friction explanation");
test.assertIncludes(source, 'requestSystemMusic("state")', "the player reads real Music app state");
test.assertIncludes(source, 'runSystemAction("play-pause")', "the main transport controls the Music app");
test.assertIncludes(source, 'runSystemAction("set-repeat"', "repeat mode is written to the active playback engine");
test.assertIncludes(source, 'runSystemAction("set-shuffle"', "shuffle is written to the active playback engine");
test.assertNotIncludes(source, "mediaUserToken", "Soundscape does not persist Apple Music user tokens");
test.assertNotIncludes(source, "developerToken", "the primary player has no developer-token dependency");
test.assertNotIncludes(source, "cookies.txt", "the browser never names a cookie file");
test.assertIncludes(router, '["GET /api/music/system", handleSystemMusic]', "the read-only Music state route is local");
test.assertIncludes(router, '["POST /api/music/system", handleSystemMusic]', "the allowlisted Music command route is local");
test.assertIncludes(systemMusicRoute, "const ALLOWED_ACTIONS = new Set([", "the system bridge has a closed command vocabulary");
test.assertIncludes(systemMusicRoute, 'process.platform !== "darwin"', "non-Mac hosts fail honestly");
test.assertIncludes(systemMusicRoute, '"/usr/bin/osascript"', "the bridge uses the macOS Music scripting surface");
test.assertIncludes(systemMusicRoute, '"Cache-Control": "no-store"', "Music state is never cached");
test.assertNotIncludes(systemMusicRoute, "APPLE_MUSIC_DEVELOPER_TOKEN", "the bridge needs no Apple developer token");

// Apple Music link downloads run on the host through gamdl. The server starts
// a job, polls it to completion, and streams the finished audio; the queue
// plays those files like local audio but their URLs survive a reload.
test.assertIncludes(html, 'id="soundscape-gamdl-form"', "the queue drawer offers the Apple Music link download form");
test.assertIncludes(html, 'id="soundscape-gamdl-input" type="url"', "the link field is a real URL input");
test.assertIncludes(html, 'id="soundscape-gamdl-submit"', "the download action is a visible button");
test.assertIncludes(menus, 'menuItem("soundscape-gamdl-download", "soundscape_gamdl_download")', "the File menu offers the download command");
test.assertIncludes(source, "function downloadFromAppleMusic(url)", "the download is an explicit user command");
test.assertIncludes(source, 'source: "gamdl"', "downloaded tracks carry their own queue source");
test.assertIncludes(source, "state.source = item.source === \"gamdl\" ? \"gamdl\" : \"local\"", "downloaded tracks play through the local audio engine");
test.assertIncludes(source, "gamdlJobTimer", "the bridge polls one download at a time");
test.assertIncludes(source, "window.AISystem6LocalLMStudio?.isPublicWebMode?.()", "public-web Soundscape does not attempt host-only downloads");
test.assertIncludes(source, "gamdl_cookies_missing", "missing host cookies have a specific low-friction message");
test.assertNotIncludes(source, "cookies.txt", "the browser never holds a cookie file path");
test.assertIncludes(router, '["POST /api/music/gamdl/jobs", handleGamdlJobs]', "the gamdl job route is registered");
test.assertIncludes(router, 'prefix: "/api/music/gamdl/jobs"', "the poll route is registered");
test.assertIncludes(router, 'prefix: "/api/music/gamdl/files"', "the file stream route is registered");
const publicRouteKeys = router.match(/const publicExactRouteKeys = new Set\(\[([\s\S]*?)\]\);/);
test.assert(Boolean(publicRouteKeys), "the public route allowlist is declared");
test.assertNotIncludes(publicRouteKeys?.[1] || "", "gamdl", "gamdl downloads stay host-local, never public");
test.assertIncludes(gamdlModule, "music.apple.com", "the URL allowlist names Apple Music");
test.assertIncludes(gamdlModule, "randomUUID()", "each download job owns a unique id");
test.assertIncludes(gamdlModule, '"--no-config-file"', "gamdl runs with deterministic flags");
test.assertIncludes(gamdlModule, '"--cookies-path"', "the cookies path is passed explicitly");
test.assertIncludes(gamdlModule, "AI_SYSTEM6_GAMDL_COOKIES_PATH", "the host cookie path comes from the server environment");
test.assertIncludes(gamdlModule, "candidate.startsWith(`${base}${path.sep}`)", "downloaded file paths are traversal-guarded");
test.assertIncludes(gamdlRoute, "createReadStream(filePath", "downloaded audio streams from disk");
test.assertIncludes(gamdlRoute, '"Accept-Ranges": "bytes"', "downloaded audio serves byte ranges");
test.assertIncludes(gamdlRoute, "decodeURIComponent(part)", "file paths are decoded one segment at a time");
test.assertNotIncludes(gamdlRoute, "shell: true", "gamdl never runs through a shell");

// A real basic player has explicit playback modes and a local queue that can
// be removed or cleared without pretending to control Music's hidden queue.
test.assertNotIncludes(html, 'id="soundscape-progress" type="range"', "position is not a browser-native slider");
test.assertNotIncludes(html, 'id="soundscape-volume" type="range"', "volume is not a browser-native slider");
test.assertIncludes(html, 'id="soundscape-progress" class="system-track" role="slider"', "position is a System 6 track that still reports a slider role");
test.assertIncludes(html, 'id="soundscape-volume" class="system-segments" role="slider"', "volume uses Sound control panel segment cells");
test.assertIncludes(html, 'id="soundscape-intensity" class="system-segments" role="slider"', "Enter Scene uses the same level control as volume");
test.assertNotIncludes(liquid, "--system-track-fill: linear-gradient", "the position track reports position in both themes, never percent complete");
test.assertIncludes(source, "function bindDragControl(element, handlers)", "the custom controls are pointer operable");
test.assertIncludes(source, 'element.setAttribute("aria-valuenow"', "the custom controls report their value to assistive tech");
test.assertIncludes(source, "const jump = { Home: 0, End: 1 }[event.key];", "the custom controls stay keyboard operable");

for (const id of ["soundscape-shuffle", "soundscape-repeat", "soundscape-mute", "soundscape-clear-queue"]) {
  test.assertIncludes(html, `id="${id}"`, `${id} is a visible player control`);
}
test.assertIncludes(source, 'const REPEAT_MODES = Object.freeze(["off", "all", "one"])', "repeat supports off, all, and one");
// Repeat is a closed set, so the menu names all three modes and marks the
// active one instead of hiding them behind a cycling row.
test.assertIncludes(menus, 'submenu("soundscape_repeat", [', "the menu opens repeat as a named closed set");
for (const mode of ["off", "all", "one"]) {
  test.assertIncludes(menus, `repeatMode: "${mode}"`, `the ${mode} repeat mode is its own menu row`);
  test.assertIncludes(source, `"repeat-${mode}": () => setRepeatMode("${mode}")`, `the ${mode} row sets the mode directly`);
}
test.assertIncludes(windowManager, "btn.dataset.repeatMode", "the active repeat row carries the System 6 check mark");
test.assertIncludes(source, "currentRepeatMode,", "the menu reads the real mode from the loaded feature");

// Shuffle is two closed sets, the way Music itself splits them: the switch and
// the kind. Both are mirrored from the real player, never assumed.
test.assertIncludes(menus, 'submenu("soundscape_shuffle", [', "shuffle is a named closed set too");
for (const kind of ["songs", "albums", "groupings"]) {
  test.assertIncludes(menus, `shuffleKind: "${kind}"`, `shuffle by ${kind} is its own menu row`);
}
test.assertIncludes(systemMusicRoute, '"set-shuffle-mode",', "the shuffle kind is an allowlisted bridge command");
test.assertIncludes(systemMusicRoute, "shuffleMode: cleanText(readValue(() => music.shuffleMode()", "the shuffle kind is read from Music, not assumed");
test.assertNotIncludes(systemMusicRoute, 'music.shuffleMode = "songs";', "turning shuffle on no longer rewrites the user's chosen kind");
test.assertIncludes(source, "state.shuffleKind = normalizeShuffleKind(snapshot.shuffleMode)", "every poll mirrors Music's real shuffle kind");
test.assertIncludes(windowManager, "btn.dataset.shuffleKind", "the active shuffle kind carries the check mark");
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
test.assertIncludes(source, "const legacyStyleAxis", "saved styles migrate when the vertical meaning flips");
test.assertIncludes(source, "invertLegacyY ? 100 - y : y", "legacy calm and tension do not silently reverse");
test.assertNotIncludes(css, "rgba(31, 36, 47, 0.54)", "calm reads as low contrast without being darkened");
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
test.assertNotIncludes(css, ".soundscape-window .title-bar", "the title bar's shared striped background is left alone");
test.assertNotIncludes(css, "var(--system-segment-on-bg))", "no color-mix runs over a Liquid Glass gradient token");

// Bilingual and bootstrap-safe.
test.assertIncludes(app, "var translations = window.AISystem6Data?.translations || {}", "early restored controls can translate without a lexical dead zone");

// GAMDL is an optional local-Mac capability, not a system dependency: missing
// gamdl / cookies must degrade to a friendly message without touching local
// audio or macOS Music control.
test.assertIncludes(source, "gamdl_unavailable", "missing gamdl maps to a friendly error");
test.assertIncludes(source, "gamdl_cookies_missing", "missing cookies map to a friendly error");
test.assert(
  source.includes("No cookies or") && source.includes("tokens ever reach the browser"),
  "browser never handles Apple Music cookies"
);
test.assertIncludes(
  source,
  'if (!("mediaSession" in navigator) || !["local", "gamdl"].includes(state.source)) return;',
  "media session control treats gamdl tracks like local files, not as a dependency"
);

test.finish();
