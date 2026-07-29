import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("soundscape");
const source = read("app/features/soundscape.js");
const html = read("index.html");
const css = read("styles/88-soundscape.css");
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
test.assertIncludes(css, "@media (prefers-reduced-motion: reduce)", "motion respects reduced-motion preferences");
test.assertNotIncludes(css, "!important", "the new surface adds no important overrides");
test.assertNotIncludes(css, "body.use-liquid-glass", "Classic and Liquid Glass share one token-driven structure");
test.assertIncludes(styleManifest, '"styles/88-soundscape.css"', "the component stylesheet is in the style manifest");

// Mini Player first: one persistent listening surface and one tabbed drawer at
// every width, including the full-screen mobile app shell.
test.assertIncludes(html, 'class="soundscape-mode-switch" role="tablist"', "queue, style, and saved moments share one drawer");
test.assertIncludes(html, 'data-soundscape-panel="queue"', "the queue is one drawer panel");
test.assertIncludes(html, 'data-soundscape-panel="style" hidden', "the sensory field is hidden until requested");
test.assertIncludes(html, 'data-soundscape-panel="saved" hidden', "saved moments are hidden until requested");
test.assertIncludes(css, "grid-template-rows: 154px minmax(0, 1fr)", "the independent app keeps a compact playback deck above one workspace");
test.assertIncludes(css, "width: 86px", "placeholder artwork stays subordinate to the player controls");
test.assertIncludes(css, "grid-template-rows: 244px minmax(240px, 1fr)", "phone-width Soundscape keeps the deck compact above one workspace");
test.assertIncludes(css, "--portrait-window-height:", "portrait flow receives a bounded window height");
test.assertIncludes(windowManager, '"soundscape",', "Soundscape participates in the mobile full-screen app shell");

// Project Hard Disk linkage only happens after an actual save and a mounted
// project selection.
test.assertIncludes(source, "function linkSelectedToProject()", "a saved moment can be linked deliberately");
test.assertIncludes(source, "state.projectLinks[project.id] = moment.id", "the project link records a real saved object");
test.assertIncludes(source, "typeof getActiveProject ===", "Soundscape resolves the mounted System 6 project");
test.assertIncludes(source, "function restoreProjectSoundscape()", "a project can restore its linked atmosphere");

// Bilingual and bootstrap-safe.
test.assertIncludes(en, 'soundscape_save_moment: "Save This Moment"', "English product copy exists");
test.assertIncludes(zh, 'soundscape_save_moment: "保存此刻"', "Chinese product copy exists");
test.assertIncludes(zh, 'soundscape_style_cold_mist: "冷雾"', "the Chinese sensory palette is explicit");
test.assertIncludes(zh, 'soundscape_repeat_one: "单曲循环"', "single-track repeat is explicit in Chinese");
test.assertIncludes(app, "var translations = window.AISystem6Data?.translations || {}", "early restored controls can translate without a lexical dead zone");

test.finish();
