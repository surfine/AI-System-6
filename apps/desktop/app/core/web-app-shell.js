// The web app shell: what the device keeps, and the chrome around it.
//
// Not to be confused with app/core/application-shell.js, which builds the
// System window anatomy for lazily arriving applications. This one is about
// the BROWSER: a service worker that keeps the boot set on the device, and the
// theme-color meta the host paints its chrome with.
//
// Loaded after `load`, never at boot. Registering a worker and repainting a
// meta tag can both wait for the desk to be on screen, and the boot bundle is
// measured against a two-floppy budget.
//
// Contract: tests/features/device-matrix.test.mjs

// A service worker pre-caches the boot set (see sw.js) so a cold start does
// not wait on the network and the desk opens with no connection at all. Two
// product rules shape the rest of it:
//
//   - Nothing changes under the writer, and nothing asks them. A new build
//     waits until the page on screen IS that build, then takes over quietly;
//     the running page is never reloaded or swapped out from under them.
//   - Nothing is claimed that did not happen. Registration failure is quiet
//     and non-fatal — the app simply runs from the network, as before.


function uiIsChinese() {
  return String(document.documentElement.lang || "").toLowerCase().startsWith("zh");
}

// ---- Keep the language the writer is actually reading ----------------------
//
// The two translation tables are 275 KB each and only one of them is ever in
// use, so the worker pre-caches neither. This names the live one. It sends a
// language, never a URL: sw.js owns the mapping to a file, so nothing on the
// page can widen what the worker keeps.

function keepActiveLanguageTable() {
  navigator.serviceWorker?.controller?.postMessage({
    type: "keep-language",
    language: uiIsChinese() ? "zh" : "en",
  });
}

function watchLanguageForShell() {
  // applyLanguage() writes documentElement.lang, so the attribute is the one
  // signal that is true for every way the language can change — the Apple menu,
  // a restored setting, or the boot default.
  new MutationObserver(keepActiveLanguageTable)
    .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}

// ---- Parts that are not on this device -------------------------------------
//
// A part the worker has neither kept nor been able to fetch is answered with
// 503 and remembered; this says so. Two rules shape the wording. Nothing is
// claimed to have loaded — only the parts that did not are named. And no cause
// is claimed either: from the page, a dead network and a refusing server look
// the same, so the notice says what is true (not here, could not be fetched)
// rather than guessing why.
//
// The worker keeps the backlog because this module is itself lazy and arrives
// after `load`, by which time a startup miss has already happened.

const partsAnnounced = new Set();
let partsPending = [];
let partsNoticeTimer = null;
let partsNoticeId = "";

function announceMissingParts() {
  partsNoticeTimer = null;
  const fresh = partsPending.filter((path) => !partsAnnounced.has(path));
  partsPending = [];
  if (!fresh.length) return;
  fresh.forEach((path) => partsAnnounced.add(path));
  // The console keeps the file names for whoever is debugging; the desk gets
  // the fact, not a list of paths nobody chose to open.
  console.warn("AI System 6: not on this device, and could not be fetched.", fresh);
  const count = partsAnnounced.size;
  const message = uiIsChinese()
    ? `这台设备上没有 ${count} 个部件，也没有取到。重新联网后才能打开它们，桌面其余部分照常可用。`
    : `${count} part${count === 1 ? "" : "s"} of the system ${count === 1 ? "is" : "are"} not on this `
      + "device and could not be fetched. They can open again once this machine is back online; "
      + "the rest of the desk works as usual.";
  if (typeof pushSystemNotification !== "function") return;
  // One standing message that counts up, not a new one per part: the writer is
  // being told one thing, and a stack of near-identical rows would bury it.
  partsNoticeId = pushSystemNotification(message, {
    state: "failed",
    replaceId: partsNoticeId || undefined,
  }) || partsNoticeId;
}

function noteMissingParts(paths) {
  if (!Array.isArray(paths) || !paths.length) return;
  partsPending = paths.slice();
  if (partsNoticeTimer) return;
  // One notice for the whole burst: a start with no network misses several
  // parts within a second of each other, and that is one fact, not five.
  partsNoticeTimer = window.setTimeout(announceMissingParts, 1200);
}

function canKeepApplicationShell() {
  // Reading the property is enough to throw: a browser with service workers
  // switched off (a private window, an enterprise policy, an automation
  // context) still has the key on navigator and raises SecurityError on
  // access. `in` is not a safe test, so the access itself is guarded.
  try {
    if (!navigator.serviceWorker) return false;
  } catch {
    return false;
  }
  // https, or localhost during development. A file:// checkout has no origin
  // a worker can own, and the packaged shell serves over the loopback origin.
  return window.isSecureContext === true && window.location.protocol !== "file:";
}

function applicationShellScriptUrl() {
  const build = window.AISystem6BuildInfo?.build || "dev";
  return `/sw.js?v=${encodeURIComponent(build)}`;
}

// The system decides, not the writer. A dialog here once asked "restart to
// use the new version?" -- and most often asked it on a page that already WAS
// the new version: navigation refreshes index.html behind the old worker, so
// the next load runs the new build while the new worker still waits. A restart
// then reloaded the same build, and "Cancel" left nothing to decide either.
//
// So: when the waiting worker's build is the build this page runs, it takes
// over at once, with no reload -- the page and its worker now agree, and the
// old caches go. When the page is older, nothing happens now: its lazy parts
// still come from the old worker's cache, and the next load brings the new
// page, which adopts the new worker then. Either way nothing is lost and
// nobody is asked.
function waitingWorkerBuild(worker) {
  try {
    return new URL(worker.scriptURL).searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function adoptApplicationShellUpdate(registration) {
  const waiting = registration?.waiting;
  if (!waiting) return;
  const pageBuild = window.AISystem6BuildInfo?.build || "";
  if (!pageBuild || waitingWorkerBuild(waiting) !== pageBuild) return;
  waiting.postMessage({ type: "skip-waiting" });
}

function watchApplicationShellUpdate(registration) {
  if (registration.waiting) adoptApplicationShellUpdate(registration);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") adoptApplicationShellUpdate(registration);
    });
  });
}

// Talking to a worker that is ALREADY running does not depend on registering
// one. With no network, register() re-checks sw.js and can reject; the page it
// is running from was served by that same worker regardless, and it is exactly
// then that the page most needs to hear what could not be loaded. So the
// listeners are installed off the controller, before and apart from register().
function watchApplicationShellMessages() {
  if (!canKeepApplicationShell()) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "offline-unavailable") noteMissingParts(event.data.paths);
  });
  // addEventListener alone leaves the client's message queue disabled; without
  // this the worker's answers are held and never delivered.
  navigator.serviceWorker.startMessages?.();
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // A first install, or an update adopted above, claims this page. It is
    // never reloaded for it: this is just the first moment there is a (new)
    // worker to talk to.
    keepActiveLanguageTable();
  });
  watchLanguageForShell();
  keepActiveLanguageTable();
  // The misses that happened before this listener existed.
  navigator.serviceWorker.controller?.postMessage({ type: "offline-report" });
}

async function keepApplicationShell() {
  if (!canKeepApplicationShell()) return null;
  try {
    const registration = await navigator.serviceWorker.register(applicationShellScriptUrl());
    watchApplicationShellUpdate(registration);
    return registration;
  } catch (error) {
    console.warn("The application shell could not be kept on this device.", error);
    return null;
  }
}

// ---- Browser chrome follows the appearance --------------------------------
//
// theme-color paints the chrome around a standalone window, so a fixed value
// was right for exactly one era. Each appearance owns --menu-bar-bg, and some
// of them make it a gradient, so the colour is read off the bar the browser
// actually painted rather than restated as six literals here.

function isOpaqueCssColor(value) {
  const match = /^rgba?\(([^)]+)\)$/i.exec(String(value || "").trim());
  if (!match) return false;
  const parts = match[1].split(/[,\/\s]+/).filter(Boolean);
  return parts.length < 4 || Number.parseFloat(parts[3]) > 0;
}

function menuBarChromeColor() {
  const bar = document.querySelector(".menu-bar");
  if (!bar) return "";
  const style = window.getComputedStyle(bar);
  if (isOpaqueCssColor(style.backgroundColor)) return style.backgroundColor;
  // A gradient leaves background-color transparent; its first stop is the
  // colour the bar reads as at the top edge, where the chrome meets it.
  const stop = String(style.backgroundImage || "").match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i);
  return stop ? stop[0] : "";
}

function syncThemeColorMeta() {
  const meta = document.querySelector("meta[name='theme-color']");
  if (!meta) return "";
  const color = menuBarChromeColor();
  if (color && meta.getAttribute("content") !== color) meta.setAttribute("content", color);
  return color;
}

document.addEventListener("ai-system6-themechange", () => {
  window.requestAnimationFrame(syncThemeColorMeta);
});


// Listening costs nothing and has to happen before the first answer arrives;
// registering fetches a script and can wait for the desk to be on screen.
watchApplicationShellMessages();
if (document.readyState === "complete") keepApplicationShell();
else window.addEventListener("load", () => { keepApplicationShell(); }, { once: true });
syncThemeColorMeta();

window.AISystem6WebAppShell = Object.freeze({ keepApplicationShell, syncThemeColorMeta, watchApplicationShellMessages });
window.AISystem6WebAppShellLoaded = true;
