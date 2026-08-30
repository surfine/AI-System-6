// Application lifecycle: optional suspend / resume / dispose.
//
// The product rule this serves is the phone and tablet orientation contract —
// every supported surface has to stay usable on a device that will kill a page
// which keeps a game loop, a WebGL context, an audio poll and several editors
// running at once. The contract here is that a heavy application stops costing
// anything the moment it leaves the foreground, comes back running rather than
// re-initialized, and that an application which declared no lifecycle behaves
// exactly as it did before.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("application-lifecycle");

const registrySource = read("app/core/application-registry.js");
const multiFinder = read("app/core/multi-finder.js");
const windowManager = read("app/core/window-manager.js");
const boot = read("app/core/boot.js");
const webPlatform = read("app/core/web-platform.js");
const persistence = read("app/core/persistence-status.js");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- the interface lives in the registry, and stays DOM-free -----------------

test.assertIncludes(registrySource, "function registerApplicationLifecycle", "apps register a lifecycle through the registry");
test.assertIncludes(registrySource, "async function suspendApplication", "the registry owns suspend");
test.assertIncludes(registrySource, "async function resumeApplication", "the registry owns resume");
test.assertIncludes(registrySource, "async function disposeApplication", "the registry owns dispose");
test.assertIncludes(registrySource, "async function syncApplicationLifecycle", "one pass reconciles every registered app");
test.assertNotIncludes(registrySource, "querySelector", "the registry never reads the DOM to decide lifecycle state");
test.assertNotIncludes(registrySource, "document.hidden", "the caller supplies page visibility; the registry does not read it");

// --- the state machine ------------------------------------------------------

function createLifecycleContext() {
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    t: (key) => key,
    window: {},
  });
  vm.runInContext(registrySource, context);
  return context.window.AISystem6ApplicationRegistry;
}

const registry = createLifecycleContext();

// Optional: an app that registered nothing is never touched.
test.assert(registry.getApplicationLifecycleState("teachText") === "", "an app with no lifecycle has no lifecycle state");
test.assert((await registry.suspendApplication("teachText")) === false, "suspending an app with no lifecycle is a no-op");
test.assert((await registry.resumeApplication("teachText")) === false, "resuming an app with no lifecycle is a no-op");

const calls = [];
registry.registerApplicationLifecycle("game", {
  onSuspend: ({ reason }) => calls.push(`suspend:${reason}`),
  onResume: ({ reason }) => calls.push(`resume:${reason}`),
  onDispose: ({ reason }) => calls.push(`dispose:${reason}`),
});
test.assert(registry.getApplicationLifecycleState("game") === "active", "a freshly registered app starts active");

await registry.suspendApplication("game", "window-hidden");
test.assert(registry.getApplicationLifecycleState("game") === "suspended", "suspend moves the app to suspended");
await registry.suspendApplication("game", "again");
test.assert(calls.filter((entry) => entry.startsWith("suspend:")).length === 1, "suspending twice never runs onSuspend twice");

await registry.resumeApplication("game", "foreground");
test.assert(registry.getApplicationLifecycleState("game") === "active", "resume brings the app back to active");
test.assert(calls.join(",") === "suspend:window-hidden,resume:foreground", "hooks receive the reason they were called with");

await registry.disposeApplication("game", "quit");
test.assert(registry.getApplicationLifecycleState("game") === "disposed", "dispose is terminal");
await registry.resumeApplication("game", "foreground");
test.assert(registry.getApplicationLifecycleState("game") === "disposed", "nothing resumes a disposed app");
registry.registerApplicationLifecycle("game", {});
test.assert(registry.getApplicationLifecycleState("game") === "active", "registering again is what makes a disposed app live");

// A throwing hook must not wedge the app in a state it can never leave.
registry.registerApplicationLifecycle("brittle", {
  onSuspend: () => { throw new Error("engine refused"); },
  onResume: () => true,
});
test.assert((await registry.suspendApplication("brittle", "hide")) === false, "a throwing hook reports failure");
test.assert(registry.getApplicationLifecycleState("brittle") === "suspended", "a throwing suspend still advances the state");
await registry.resumeApplication("brittle", "show");
test.assert(registry.getApplicationLifecycleState("brittle") === "active", "an app whose suspend failed can still be resumed");

// syncApplicationLifecycle is the single reconciliation pass.
const synced = [];
registry.registerApplicationLifecycle("front", { onSuspend: () => synced.push("front:suspend"), onResume: () => synced.push("front:resume") });
registry.registerApplicationLifecycle("back", { onSuspend: () => synced.push("back:suspend"), onResume: () => synced.push("back:resume") });
await registry.syncApplicationLifecycle({ foregroundAppIds: new Set(["front"]) });
test.assert(synced.join(",") === "back:suspend", "a background app suspends and a foreground app is left alone");
await registry.syncApplicationLifecycle({ foregroundAppIds: ["front", "back"], documentHidden: true });
test.assert(
  registry.getApplicationLifecycleState("front") === "suspended",
  "a hidden page suspends even the foreground app",
);
await registry.syncApplicationLifecycle({ foregroundAppIds: ["front", "back"], documentHidden: false });
test.assert(
  registry.getApplicationLifecycleState("front") === "active" && registry.getApplicationLifecycleState("back") === "active",
  "coming back to the foreground resumes both",
);

// --- the driver decides foreground from window state, once -------------------

test.assertIncludes(multiFinder, "function foregroundApplicationIds", "one helper answers which apps are on screen");
test.assertIncludes(
  multiFinder,
  '".window[data-window]:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)"',
  "a collapsed, app-hidden or closed window is not foreground",
);
test.assertIncludes(multiFinder, "hiddenAppIds.has(appId)", "a MultiFinder-hidden app is background even with an open window");
test.assertIncludes(multiFinder, "function installApplicationLifecycleWatch", "the driver installs one watch");
test.assertIncludes(multiFinder, '"pagehide"', "pagehide suspends every application");
test.assertIncludes(multiFinder, '"visibilitychange"', "a backgrounded Home Screen App suspends every application");
test.assertIncludes(multiFinder, "requestAnimationFrame", "window class bursts are coalesced into one pass");
test.assertIncludes(boot, "installApplicationLifecycleWatch();", "boot installs the lifecycle watch");
test.assertIncludes(windowManager, 'scheduleApplicationLifecycleRefresh?.("open-window")', "opening a window reconciles the lifecycle");
test.assertIncludes(windowManager, 'disposeApplication?.(appId, "quit")', "quitting an app disposes it");
test.assertIncludes(windowManager, "const lifecycleDisposed = await", "Quit awaits lifecycle disposal before hiding application windows");
test.assertIncludes(windowManager, 'appId === "bonsaiCity" && !lifecycleDisposed', "Bonsai uses its direct detach only as an unregistered-lifecycle fallback");
test.assertIncludes(windowManager, "if (detached === false) return", "Quit keeps Bonsai open when its fallback save cannot complete");

// --- the seven applications --------------------------------------------------

const lifecycleApps = [
  ["doom", "app/features/doom.js"],
  ["openttd", "app/features/openttd.js"],
  ["micropolis", "app/features/micropolis.js"],
  ["cmfStudio", "app/features/cmf-studio.js"],
  ["liquidCover", "app/features/liquid-cover.js"],
  ["clioStage", "app/features/clio-stage.js"],
  ["soundscape", "app/features/soundscape.js"],
];

for (const [appId, path] of lifecycleApps) {
  const source = read(path);
  test.assertIncludes(source, `registerApplicationLifecycle?.("${appId}"`, `${appId} registers a lifecycle`);
  test.assertIncludes(source, "onSuspend", `${appId} declares onSuspend`);
  test.assertIncludes(source, "onResume", `${appId} declares onResume`);
  test.assertIncludes(source, "onDispose", `${appId} declares onDispose`);
}

// Each app stops its own kind of continuing cost, and none of them re-inits.
const doom = read("app/features/doom.js");
test.assertIncludes(doom, 'postToDoom("release-inputs", { reason: "suspend" })', "DOOM releases held SDL input before pausing");
test.assertIncludes(doom, "stopObservingViewport();", "DOOM stops observing the pane so a paused engine gets no viewport traffic");
test.assertIncludes(doom, 'postToDoom("sync")', "DOOM flushes its storage on suspend");

const openttd = read("app/features/openttd.js");
const openttdShell = read("assets/openttd/shell.js");
test.assertIncludes(openttd, 'postToOpenTTD("pause")', "OpenTTD asks its shell to stop the wasm main loop");
test.assertIncludes(openttdShell, "Module.pauseMainLoop", "the OpenTTD shell stops the emscripten main loop, not just the canvas");
test.assertIncludes(openttdShell, "Module.resumeMainLoop", "the OpenTTD shell can restart the main loop");
test.assertIncludes(openttdShell, "function releaseHeldButtons", "a suspended OpenTTD never leaves SDL holding a mouse button");
test.assertIncludes(openttdShell, 'data.command === "pause"', "the shell honours the host pause command");
test.assertIncludes(openttdShell, 'data.command === "resume"', "the shell honours the host resume command");

const micropolis = read("app/features/micropolis.js");
test.assertIncludes(micropolis, "stopMicropolisLoop();", "Micropolis stops its animation loop on suspend");
test.assertIncludes(micropolis, "micropolisState.cityId && micropolisState.dirty", "Micropolis writes back only a city the player already named");
test.assertIncludes(micropolis, "if (micropolisState.sim) startMicropolisLoop();", "a resumed city restarts its loop instead of rebuilding");

const cmf = read("app/features/cmf-studio.js");
test.assertIncludes(cmf, "function stopModelAnimationLoop", "CMF Studio takes the render loop off the renderer");
test.assertIncludes(cmf, "setAnimationLoop(null)", "a suspended CMF Studio schedules no frames at all");
test.assertIncludes(cmf, "startModelAnimationLoop();", "resume reinstalls the same loop");

const liquidCover = read("app/features/liquid-cover.js");
test.assertIncludes(liquidCover, "if (motionExporting) return;", "an export in progress is never interrupted by a suspend");
test.assertIncludes(liquidCover, "stopMotionPreview(false)", "Cover Glass stops the motion preview loop");
test.assertIncludes(liquidCover, "WEBGL_lose_context", "disposing Cover Glass gives the GPU context back");

const clioStage = read("app/features/clio-stage.js");
test.assertIncludes(clioStage, "window.clearInterval(clioStageState.timerId)", "ClioStage stops the cue clock on suspend");
test.assertIncludes(clioStage, "clioStageState.timerId = window.setInterval(updateClioStageTimer, 1000)", "the cue clock restarts on resume");

const soundscape = read("app/features/soundscape.js");
test.assertIncludes(soundscape, "function shouldPauseAudioInBackground", "pausing audio is a user preference, not a default");
test.assertIncludes(soundscape, "if (systemPollTimer && !isPlaying())", "the system-music poll survives only while something is playing");

// --- Screen Wake Lock --------------------------------------------------------

test.assertIncludes(webPlatform, "function holdScreenWakeLock", "a surface can hold the screen awake");
test.assertIncludes(webPlatform, "function releaseScreenWakeLock", "a surface can give the screen back");
test.assertIncludes(webPlatform, "function isScreenWakeLockAllowed", "the wake lock is gated on a preference");
test.assertIncludes(webPlatform, 'document.getElementById("keep-screen-awake")', "the preference is the Control Panel checkbox");
test.assertIncludes(webPlatform, "screenWakeLockHolders.size > 0", "the lock is released once the last holder leaves");
test.assertIncludes(html, 'id="keep-screen-awake"', "Control Panel offers the wake-lock preference");
test.assertIncludes(html, 'id="pause-audio-in-background"', "Control Panel offers the background-audio preference");
test.assertIncludes(persistence, "keepScreenAwake:", "the wake-lock preference is saved");
test.assertIncludes(persistence, "pauseAudioInBackground:", "the background-audio preference is saved");
test.assertIncludes(persistence, "settings.keepScreenAwake === true", "both preferences default off on restore");

for (const [appId, path] of [
  ["clioStage", "app/features/clio-stage.js"],
  ["reader", "app/features/reader.js"],
  ["doom", "app/features/doom.js"],
  ["openttd", "app/features/openttd.js"],
  ["micropolis", "app/features/micropolis.js"],
]) {
  const source = read(path);
  test.assertIncludes(source, `holdScreenWakeLock?.("${appId}")`, `${appId} can hold the screen awake`);
  test.assertIncludes(source, `releaseScreenWakeLock?.("${appId}")`, `${appId} releases the screen when it leaves`);
}

for (const [language, table] of [["en", en], ["zh", zh]]) {
  test.assertIncludes(table, "keep_screen_awake:", `${language} names the wake-lock preference`);
  test.assertIncludes(table, "pause_audio_background:", `${language} names the background-audio preference`);
  test.assertIncludes(table, "balloon_keep_screen_awake:", `${language} explains the wake-lock preference`);
  test.assertIncludes(table, "balloon_pause_audio_background:", `${language} explains the background-audio preference`);
  test.assertIncludes(table, "openttd_status_paused:", `${language} has a paused status for OpenTTD`);
}

test.finish();
