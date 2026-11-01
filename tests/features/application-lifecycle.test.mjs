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
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
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

// The real foreground selector drives the real lifecycle registry; class
// transitions of two windows belonging to one app determine hook calls.
{
  const h = createAppBootVm();
  await h.settleBoot();
  const changes = [];
  h.context.AISystem6ApplicationRegistry.registerApplicationLifecycle("lifecycleContract", {
    onSuspend: () => changes.push("suspend"),
    onResume: () => changes.push("resume"),
  });
  const desktop = h.document.querySelector(".desktop");
  const windows = [1, 2].map((index) => {
    const win = h.document.createElement("section");
    win.className = "window";
    win.dataset.window = `lifecycle-contract-${index}`;
    win.dataset.app = "lifecycleContract";
    desktop.append(win);
    return win;
  });
  await h.context.refreshApplicationLifecycle("initial");
  windows[0].classList.add("is-minimized");
  await h.context.refreshApplicationLifecycle("one-minimized");
  test.assert(changes.length === 0, "another visible window keeps the same app active");
  windows[1].classList.add("is-minimized");
  await h.context.refreshApplicationLifecycle("last-minimized");
  test.assert(changes.join() === "suspend", "minimizing the last visible window suspends its app");
  windows[0].classList.remove("is-minimized");
  await h.context.refreshApplicationLifecycle("restored");
  await h.context.refreshApplicationLifecycle("repeat");
  test.assert(changes.join() === "suspend,resume", "restore resumes once and repeated reconciliation does not resume again");
  for (const state of ["is-collapsed", "is-app-hidden", "is-slide-hidden", "is-hidden"]) {
    windows[0].classList.add(state);
    await h.context.refreshApplicationLifecycle(state);
    test.assert(!h.context.foregroundApplicationIds().has("lifecycleContract"), `${state} is excluded by the real foreground selector`);
    test.assert(changes.at(-1) === "suspend", `${state} suspends the app when its other window is minimized`);
    windows[0].classList.remove(state);
    await h.context.refreshApplicationLifecycle(`${state}-restored`);
    const count = changes.length;
    await h.context.refreshApplicationLifecycle(`${state}-repeat`);
    test.assert(h.context.foregroundApplicationIds().has("lifecycleContract") && changes.at(-1) === "resume" && changes.length === count, `${state} restores once without duplicate lifecycle hooks`);
  }
  windows[0].classList.add("is-slide-hidden");
  windows[1].classList.remove("is-minimized");
  const count = changes.length;
  await h.context.refreshApplicationLifecycle("visible-sibling-of-side-hidden");
  test.assert(h.context.foregroundApplicationIds().has("lifecycleContract") && changes.length === count, "a visible sibling keeps a side-hidden application's foreground lifecycle active");

}

// A real heavyweight client: its actual hooks stop/resume the actual loop
// against a real vendored Simulation. Expose only private state for fixture
// seeding and identity checks; no lifecycle or loop implementation is replaced.
{
  const h = createAppBootVm();
  await h.settleBoot();
  const frames = new Map();
  let frameId = 0;
  h.context.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  h.context.cancelAnimationFrame = (id) => frames.delete(id);
  const win = h.document.createElement("section");
  win.className = "window";
  win.dataset.window = "micropolis";
  win.dataset.app = "micropolis";
  h.document.querySelector(".desktop").append(win);
  h.run(read("app/vendor/micropolis/micropolis-engine.js") + "\nwindow.MicropolisEngine = MicropolisEngine;");
  const shell = read("app/features/micropolis.js");
  const apiMarker = "  window.AISystem6Micropolis = Object.freeze({";
  test.assert(shell.split(apiMarker).length === 2, "Micropolis fixture exposes state at the unique public API boundary");
  h.run(shell.replace(apiMarker, "  window.__micropolisLifecycleState = micropolisState;\n" + apiMarker));
  const engine = h.context.MicropolisEngine;
  const simulation = new engine.Simulation(engine.MapGenerator(120, 100), engine.Simulation.LEVEL_EASY, engine.Simulation.SPEED_FAST);
  for (let step = 0; step < 5; step++) simulation.simTick();
  const cityState = h.context.__micropolisLifecycleState;
  cityState.sim = simulation;
  // An unnamed city stays in memory; suspension must not invent a disk record.
  cityState.cityId = null;
  cityState.dirty = true;
  const savedBefore = {};
  simulation.save(savedBefore);
  const cityBytes = JSON.stringify(savedBefore);
  const pendingLoops = () => [...frames.values()].filter((callback) => callback.name === "micropolisFrame").length;
  h.context.AISystem6Micropolis.attach();
  test.assert(pendingLoops() === 1, "the real Micropolis attachment schedules one simulation loop");
  await h.context.refreshApplicationLifecycle("micropolis-visible");
  win.classList.add("is-minimized");
  await h.context.refreshApplicationLifecycle("micropolis-minimized");
  test.assert(pendingLoops() === 0 && cityState.rafId === 0, "minimizing its last window cancels Micropolis's scheduled animation frame");
  test.assert(cityState.sim === simulation && cityState.dirty && !cityState.cityId, "suspension preserves the exact unsaved simulation without inventing a city record");
  win.classList.remove("is-minimized");
  await h.context.refreshApplicationLifecycle("micropolis-restored");
  await h.context.refreshApplicationLifecycle("micropolis-restored-again");
  test.assert(pendingLoops() === 1 && cityState.sim === simulation, "restoring resumes that simulation once, without duplicate animation loops");
  win.classList.add("is-slide-hidden");
  await h.context.refreshApplicationLifecycle("micropolis-side-hidden");
  await h.context.refreshApplicationLifecycle("micropolis-side-hidden-again");
  test.assert(pendingLoops() === 0 && cityState.rafId === 0, "collapsing the side window pauses Micropolis's real animation loop");
  test.assert(cityState.sim === simulation && cityState.dirty && !cityState.cityId, "side hiding preserves the exact unsaved city and simulation identity");
  win.classList.remove("is-slide-hidden");
  await h.context.refreshApplicationLifecycle("micropolis-side-restored");
  await h.context.refreshApplicationLifecycle("micropolis-side-restored-again");
  test.assert(pendingLoops() === 1 && cityState.sim === simulation, "side restoration restarts exactly one animation frame without recreating the city");

  const savedAfter = {};
  simulation.save(savedAfter);
  test.assert(JSON.stringify(savedAfter) === cityBytes, "tiles, funds, time and simulation save state survive minimize and side-hide restoration unchanged");
}

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
// Read the leave-flush function itself: the guard may be written as an early
// return or as a positive condition, and pinning one sentence in the whole file
// let an equivalent rewrite read as a regression.
const leaveFlush = micropolis.match(/async function flushMicropolisLeaveSave\(\) \{([\s\S]*?)\n {2}\}/)?.[1] || "";
test.assertIncludes(leaveFlush, "!micropolisState.cityId", "Micropolis writes back only a city the player already named");
test.assertIncludes(leaveFlush, "!micropolisState.dirty", "and only when that city has unsaved edits");
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
