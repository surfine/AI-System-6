// AI System 6 service worker: the application shell, kept on the device.
//
// Registered by app/core/web-platform.js as `/sw.js?v=<build>`, so this
// script's own URL carries the build stamp. That does three things at once:
//
//   1. `BUILD` below is the build the page was served with, so the shell URLs
//      cached here are byte-for-byte the URLs index.html asks for (index.html
//      stamps them; see tooling/lib/build-info.mjs stampedIndexAssets).
//   2. A new build changes this script's URL, so the browser installs a new
//      worker instead of comparing unchanged bytes and finding nothing.
//   3. Cache names are keyed on the same stamp, so activating a new build
//      drops every older cache rather than growing without limit.
//
// Nothing here takes over on its own. The new worker waits; the page sends
// "skip-waiting" once the page on screen is this worker's own build, so a
// running page is never served by a worker for a build it is not. A cached answer is never
// reported as a network answer, and `/api/` never enters a cache at all.

"use strict";

const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL_CACHE = `ais6-shell-${BUILD}`;
const RUNTIME_CACHE = `ais6-runtime-${BUILD}`;
const KEEP_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE]);

// What this worker does and does not promise.
//
// It promises delivery: the boot set is on the device, so a repeat visit paints
// without waiting on the network, and `/api/*` is never cached so no model,
// import or search answer is ever stale.
//
// It promises a desk, not the whole system. The boot sequence and the session
// restore both pull lazy modules, and until 2026-09-05 none of them were on the
// device: an offline start lost `restorePageSetupState` with the module that
// defines it and ended on the Sad Mac, reporting a failed startup for a desk
// that had in fact opened four windows. Those modules are pre-cached now (see
// BOOT_LAZY), so an offline cold start reaches a working desk.
//
// It does NOT promise every window. A tool the visitor has never opened was
// never fetched, so it was never cached; asking for it offline still fails, and
// that failure is now REPORTED rather than hidden -- the worker answers 503,
// remembers what it could not serve, and tells the page, which says so once in
// the writer's own language. Keeping the whole lazy set instead would put
// 5,746,854 more bytes on the device (measured 2026-09-05, uncompressed as this
// server sends it -- the 2MB in the earlier note here was an underestimate),
// which is a product decision about storage, not a caching detail.

// The boot set, in the exact form index.html requests it. `./` is the
// navigation itself; the rest carry the build stamp and are therefore
// immutable per URL, which is what makes cache-first safe for them.
const STAMPED_SHELL = [
  "styles.bundle.css",
  "app.bundle.js",
  "app/generated/build-info.js",
  "app/core/theme-registry.js",
  "app/core/theme-body-init.js",
  "app/core/boot-safety-net.js",
  // Loaded right after `load`, so it belongs to the boot set even though it is
  // a lazy module: without it here, an offline start fetches it, fails, and
  // the failure arrives while the desk is still assembling itself.
  "app/core/web-app-shell.js",
  "assets/app-icon/manifest.json",
  "assets/app-icon/app-icon-180.png",
  "assets/app-icon/app-icon-192.png",
];

// Lazy modules the boot sequence and the session restore request on EVERY
// start. This list was read off the running app, not guessed: the app was
// loaded with the service worker active, the server was killed, and the page
// was reloaded; these are the lazy requests startup made before the desk was
// on screen. Each one is here because losing it costs something a person can
// see:
//
//   clio-provider-resolver  which model provider the desk reports it is using
//   alarm-clock             wired by the Clock boot step, then initialised
//   application-shell       the window anatomy every lazily built window uses
//   project-cd-print        defines restorePageSetupState, which loadDeskState
//                           calls by bare name -- its absence ABORTED boot
//   context-gist, docmap-source-policy, user-recovery-messages,
//   document-role-policy    the four policy modules boot preloads together
//   liquid-glass-overlay    the appearance the writer chose, painted at wireup
//   marked.umd.js           restored chat and Markdown panes; without it every
//                           restored message falls back to escaped plain text
//   time-machine (+ CSS)    restoreWorkingSession() loads it unconditionally
//   writing-tools-prompts   109 KB of prompt text that no offline session can
//   + ai-prompt-files       send anywhere -- kept anyway, because they load
//                           early enough to miss the worker's first claim, and
//                           a refused script fires a window `error` that
//                           boot-safety-net reads as "AI System 6 failed to
//                           start". A desk that came up is not allowed to
//                           report that it did not.
//
// Modules that arrive LATER in boot are not listed and do not need to be: by
// then the worker is claiming requests, so the first online visit keeps them on
// its own (embed-in-browser, guest-tools and mcp-servers all end up cached this
// way). Only the ones that run ahead of the claim have to be named here.
const BOOT_LAZY = [
  "app/core/clio-provider-resolver.js",
  "app/features/alarm-clock.js",
  "app/core/application-shell.js",
  "app/features/project-cd-print.js",
  "app/core/context-gist.js",
  "app/core/docmap-source-policy.js",
  "app/core/user-recovery-messages.js",
  "app/core/document-role-policy.js",
  "app/core/liquid-glass-overlay.js",
  "app/vendor/marked.umd.js",
  "app/features/time-machine.js",
  "styles.time-machine.css",
  "app/core/writing-tools-prompts.js",
  "app/generated/ai-prompt-files.js",
];

// The two language tables are 275 KB each and only one of them is ever the
// writer's. Neither is pre-cached at install; the page names the language it
// is actually running in and the worker keeps that one (see the "keep-language"
// message). The page sends a language, never a URL -- the mapping to a file
// stays here, so a page can never ask this worker to cache something arbitrary.
const LANGUAGE_TABLES = {
  zh: "app/data/translations-zh.js",
  en: "app/data/translations-en.js",
};

// The System 6 typefaces. They carry no build stamp, and they are requested by
// the stylesheet before this worker has claimed the first page, so they were
// never in any cache: an offline start drew the whole desk in a fallback face.
// 17 KB for the three faces the bundle actually names, in their woff2 form --
// the .woff twins are only fetched when woff2 fails, which it now will not.
const UNSTAMPED_SHELL = [
  "system.css-reference/fonts/ChicagoFLF.woff2",
  "system.css-reference/fonts/ChiKareGo2.woff2",
  "system.css-reference/fonts/monaco.woff2",
];

function stampedUrl(path) {
  return new URL(`${path}?v=${encodeURIComponent(BUILD)}`, self.location).href;
}

const SHELL_URLS = [
  new URL("./", self.location).href,
  ...STAMPED_SHELL.map(stampedUrl),
];

const BOOT_LAZY_URLS = BOOT_LAZY.map(stampedUrl);
const UNSTAMPED_URLS = UNSTAMPED_SHELL.map((path) => new URL(path, self.location).href);

// Losing one optional icon must not cost the whole install: cache.addAll()
// rejects as a unit, and a failed install means no offline shell at all.
// The document and the two bundles are the parts worth failing over.
const REQUIRED_SHELL = new Set(SHELL_URLS.slice(0, 3));

function isApiRequest(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

function isCacheableResponse(response) {
  return !!response && response.status === 200 && response.type === "basic";
}

// One copy kept, once. `reload` skips the HTTP cache so the stored copy is the
// build's own bytes, not whatever a proxy happened to be holding. Returns
// whether the copy is now in the cache -- never throws, so one missing file is
// one missing file rather than a failed install.
async function keepOne(cacheName, url, mode = "reload") {
  try {
    const cache = await caches.open(cacheName);
    if (await cache.match(url)) return true;
    const response = await fetch(new Request(url, { cache: mode, credentials: "same-origin" }));
    if (!isCacheableResponse(response)) return false;
    await cache.put(url, response);
    return true;
  } catch {
    return false;
  }
}

async function precacheShell() {
  const results = await Promise.all(SHELL_URLS.map(async (url) => (
    await keepOne(SHELL_CACHE, url) || !REQUIRED_SHELL.has(url)
  )));
  if (results.some((ok) => !ok)) throw new Error("The application shell could not be cached.");
}

// The startup modules and the typefaces. None of them is required: the shell
// above is what an install stands or falls on, and a boot module that could not
// be kept simply behaves as it did before this list existed -- it is fetched at
// boot, and reported if that fetch fails.
// The stamped ones are read through the HTTP cache rather than `reload`: their
// URL names the build, and the page fetched these very URLs a moment ago, so
// the copy the browser is already holding IS this build's bytes -- forcing the
// network here would download the startup set a second time on a first visit.
async function precacheStartupSet() {
  await Promise.all([
    ...BOOT_LAZY_URLS.map((url) => keepOne(SHELL_CACHE, url, "default")),
    ...UNSTAMPED_URLS.map((url) => keepOne(RUNTIME_CACHE, url)),
  ]);
}

self.addEventListener("install", (event) => {
  // No skipWaiting(): a new build waits until a page of the same build adopts it.
  event.waitUntil(precacheShell().then(precacheStartupSet));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (
      name.startsWith("ais6-") && !KEEP_CACHES.has(name) ? caches.delete(name) : null
    )));
    await self.clients.claim();
  })());
});

// What this worker was asked for and could not produce, because it was not on
// the device and the network was gone. Kept for the life of the worker so the
// page can ask for the backlog: the page's own reporting code is itself a lazy
// module, and by the time it is listening the boot misses have already happened.
const missingOffline = new Set();

async function tellClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

// Nothing is claimed here that did not happen: this reports only requests the
// worker actually refused, by the path it actually refused.
function reportMissing(url) {
  const path = url.pathname.replace(/^\//, "").replace(/\?.*$/, "");
  if (!path || missingOffline.has(path)) return;
  missingOffline.add(path);
  tellClients({ type: "offline-unavailable", paths: [...missingOffline] });
}

// A part that is neither on the device nor reachable. 503 rather than a thrown
// fetch: a script tag fires `error` on both, so the lazy loader still treats it
// as the failure it is, and the page is not told a load succeeded. The wording
// does not name a cause -- a dead network and a refusing server look identical
// from here, and claiming one would be a guess dressed as a fact.
function unavailableResponse() {
  return new Response("Not on this device, and could not be fetched.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "skip-waiting") { self.skipWaiting(); return; }
  // The page names a language; this worker owns the mapping to a file, so a
  // page can never ask it to keep an arbitrary URL.
  if (data?.type === "keep-language") {
    const path = LANGUAGE_TABLES[String(data.language || "").toLowerCase()];
    if (path) event.waitUntil(keepOne(SHELL_CACHE, stampedUrl(path), "default"));
    return;
  }
  if (data?.type === "offline-report") {
    event.source?.postMessage({ type: "offline-unavailable", paths: [...missingOffline] });
  }
});

// Serve the cached copy, and refresh it in the background for the next load.
// The background half is handed to event.waitUntil, so the worker is not shut
// down between answering the page and writing the fresh copy.
async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (isCacheableResponse(response)) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  if (response) return response;
  reportMissing(new URL(request.url));
  return unavailableResponse();
}

// A lazy load that failed once is retried with an `&r=<n>` nonce on the end
// (see lazyScriptUrlWithRetryNonce in app/core/config.js), which would miss a
// cache entry stored under the plain stamped URL. The nonce exists to defeat
// the HTTP cache, not this one, so it is dropped before matching and storing:
// the build stamp is still what identifies the bytes.
function stampedCacheKey(url) {
  const key = new URL(url.href);
  key.searchParams.delete("r");
  return key.href;
}

async function cacheFirst(request, cacheName, url) {
  const cache = await caches.open(cacheName);
  const key = stampedCacheKey(url);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) await cache.put(key, response.clone());
  return response;
}

// The navigation document carries no build stamp, so it is the one thing that
// must stay able to change. Cache-first on it would pin the old index.html,
// which would keep registering the old `sw.js?v=` forever — the update path
// would be sealed shut by the very cache meant to speed it up. Serving the
// cached copy and refreshing behind it keeps the cold start off the network
// and still lets the next load see a new build.
async function handleNavigation(event, request) {
  const shellUrl = new URL("./", self.location).href;
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(shellUrl);
  const network = fetch(request).then(async (response) => {
    if (isCacheableResponse(response)) await cache.put(shellUrl, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  if (response) return response;
  return new Response("Offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Model calls, imports, search, and every other proxy answer must be live.
  if (isApiRequest(url)) return;
  // A short link is a redirect, not the application shell. /go/<route> answers
  // 302 -> /?launch=<route>, and answering it from the shell cache returns the
  // desk AT THAT ADDRESS instead: the redirect never happens and the launch is
  // dropped in silence. Every shared link opened by a returning visitor -- the
  // people most likely to have this worker installed -- landed on a plain
  // desk. Measured 2026-09-05. Short links go to the network.
  if (url.pathname === "/go" || url.pathname.startsWith("/go/")) return;
  // A partial response cannot be reassembled from a cache entry.
  if (request.headers.has("range")) return;

  // The studio's own model assets — USDZ scenes, the shared EXR environment,
  // and everything the scene's .lsd and .gltf name inside them — are fetched on
  // demand and are far too large to pre-cache (one scene alone is 4.8 MB). They
  // go to the network like an API answer: the worker keeps its hands off, so a
  // slow asset is a slow asset rather than a 503 from a cache that was never
  // going to hold it. Measured 2026-09-14: with the worker active, opening the
  // folding phone on the deployed site failed with "not on this device, and
  // could not be fetched" and the model never appeared; with the worker
  // blocked, the same page loaded the scene and reached its interactive state.
  if (url.pathname.startsWith("/assets/cmf/")) return;

  // A navigation is not only the address bar. An <iframe> load is also
  // `mode: "navigate"`, and answering one with the app shell handed the two
  // wasm games the MAIN page -- its bytes, its Content-Security-Policy and its
  // X-Frame-Options: DENY -- so the browser refused to frame their own shell
  // and neither game would start. `destination` separates them: "document" is
  // the top-level page, "iframe" is a child. Measured 2026-09-05: with the
  // worker blocked both games loaded, with it active neither did.
  if (request.mode === "navigate" && request.destination === "document") {
    event.respondWith(handleNavigation(event, request));
    return;
  }

  if (url.searchParams.has("v")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE, url).catch(() => {
      reportMissing(url);
      return unavailableResponse();
    }));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, request, RUNTIME_CACHE).catch(() => {
    reportMissing(url);
    return unavailableResponse();
  }));
});
