import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("appearance-offline-cache");
const callbacks = new Map();
const requests = [];
const cached = new Map();
const self = { location: new URL("https://example.test/sw.js?v=test-build"), addEventListener: (name, fn) => callbacks.set(name, fn) };
const sandboxContext = { self, URL, Request, Response, console,
  caches: { open: async () => ({ match: async (url) => cached.get(url), put: async (url, response) => cached.set(url, response) }) },
  fetch: async (request) => { requests.push(request.url); return { status: 200, type: "basic" }; },
};
vm.runInNewContext(read("apps/desktop/sw.js"), sandboxContext);
async function message(appearance) {
  let work;
  callbacks.get("message")({ data: { type: "keep-appearance", appearance }, waitUntil: (promise) => { work = promise; } });
  await work;
}
for (const id of ["classic", "constructor", "__proto__", "https://evil.test/style.css", "../secret"]) await message(id);
test.assert(requests.length === 0, "an appearance with no lazy files, and arbitrary inputs, trigger no download");
await message("big-sur");
test.assert(requests[0] === "https://example.test/styles.liquid-glass.css?v=test-build", "selected Big Sur caches the worker-owned URL of its recipe root's sheet for its build first");
for (const sheet of ["styles.liquid-glass.css", "styles.desk-dock.css", "styles.big-sur.css"]) {
  test.assert(requests.includes(`https://example.test/${sheet}?v=test-build`), `Big Sur retains ${sheet} for offline restart`);
}
// Big Sur's Dock and yellow lamp shipped (owner decision B, 2026-09-25): the
// miniaturize state machine and the Dock renderer travel with it offline, or a
// restart without a network would draw a lamp whose window has nowhere to go.
for (const path of ["app/core/window-minimize.js", "app/core/desk-dock.js", "app/core/dock-minimize-fx.js", "app/vendor/dock-minimize-fx.js"]) {
  test.assert(requests.includes(`https://example.test/${path}?v=test-build`), `Big Sur retains ${path} for offline restart`);
}
await message("big-sur");
test.assert(requests.length === 7, "repeated appearance notifications reuse the retained responses");

await message("nextstep");
test.assert(requests[7] === "https://example.test/styles.nextstep.css?v=test-build", "selected NeXTSTEP caches its own versioned material stylesheet");
await message("nextstep");
const beforeYosemite = requests.length;
await message("yosemite");
test.assert(requests.length === beforeYosemite, "Yosemite's sheets -- Liquid Glass's and the Dock's -- are already retained, so it fetches nothing");
// The question is which URLs are kept, not how many round trips it took: a
// path already in the shell cache is never fetched again, and an icon family
// is never part of it.
test.assert(
  new Set(requests).size === requests.length && new Set(requests).size === 12,
  "Big Sur, NeXTSTEP and Yosemite together retain twelve URLs -- four stylesheets, the miniaturize state machine, the Dock renderer, the 3D minimize warp+vendor and four NeXTSTEP shell modules -- fetching none of them twice and downloading no icon family",
);
for (const path of ["app/core/window-minimize.js", "app/core/nextstep-shell.js", "app/core/nextstep-dock.js", "app/core/nextstep-menus.js", "app/features/finder-columns.js"]) {
  test.assert(requests.includes(`https://example.test/${path}?v=test-build`), `NeXTSTEP retains ${path} for offline restart`);
}

// The worker's allowlist is data, not a lookup of the page's, so it is held
// equal to what the registry actually requests for every appearance: an
// appearance that loads a sheet the worker does not keep boots unstyled
// offline (Aqua and Liquid Glass left the boot bundle on 2026-09-26).
const registryHost = {};
vm.runInNewContext(read("apps/desktop/app/core/theme-registry.js"), { window: registryHost });
const workerStyles = vm.runInContext("APPEARANCE_STYLES", sandboxContext);
for (const { id } of registryHost.AISystem6Theme.themes) {
  const requested = registryHost.AISystem6Theme.appearanceStylePaths(id);
  test.assert(
    (workerStyles[id] || []).join() === requested.join(),
    `the worker keeps exactly the sheets ${id} requests: ${requested.join(", ") || "none"}`,
  );
}

const source = read("app/core/web-app-shell.js");
const start = source.indexOf("function keepActiveAppearanceStyles()");
const end = source.indexOf("function watchLanguageForShell()", start);
const sent = [];
let observe;
let changed;
const document = { documentElement: { dataset: { theme: "classic" } } };
const sandbox = { document, navigator: { serviceWorker: { controller: { postMessage: (message) => sent.push(message) } } },
  MutationObserver: class { constructor(callback) { changed = callback; } observe(element, options) { observe = options; } },
};
vm.runInNewContext(`${source.slice(start, end)}\nwatchAppearanceForShell();keepActiveAppearanceStyles();`, sandbox);
test.assert(observe.attributeFilter.join() === "data-theme", "silent boot and restore projections are observed too");
document.documentElement.dataset.theme = "big-sur";
changed();
test.assert(sent.at(-1).type === "keep-appearance" && sent.at(-1).appearance === "big-sur", "switching appearances sends only the current appearance id");
const controllerChange = source.slice(source.indexOf('addEventListener("controllerchange"'), source.indexOf('  watchLanguageForShell();'));
test.assertIncludes(controllerChange, "keepActiveAppearanceStyles()", "first install and worker updates keep the already loaded appearance after claim");


// ---- A stamped URL revalidates instead of pinning the morning's bytes ------
//
// The build stamp names the build, not the bytes: a dev server serving the
// same stamp after a source edit serves different bytes under it, and plain
// cache-first pinned them for the stamp's whole life. The revalidation costs
// one conditional request per URL while the bytes match (304), and swaps the
// fresh body in the moment they do not.
{
  const revalidateCallbacks = new Map();
  const store = new Map();          // cache key -> { etag, body }
  const netBodies = new Map();      // url -> body the "server" answers with
  let conditional = false;
  const swSelf = { location: new URL("https://example.test/sw.js?v=b"), addEventListener: (name, fn) => revalidateCallbacks.set(name, fn) };
  const ctx = { self: swSelf, URL, Request, Response, console,
    caches: { open: async () => ({
      match: async (url) => { const e = store.get(url); return e ? new Response(e.body, { headers: { etag: e.etag } }) : undefined; },
      put: async (url, response) => { const body = await response.text(); store.set(url, { etag: response.headers.get("etag"), body }); },
    }) },
    fetch: async (request) => {
      const body = netBodies.get(request.url);
      const text = async () => "";
      if (body === undefined) return { status: 404, ok: false, text };
      const etag = `"${body.length}"`;
      if (request.headers && request.headers.get("if-none-match") === etag) { conditional = true; return { status: 304, ok: false, text }; }
      return { status: 200, ok: true, type: "basic", headers: new Headers({ etag }), clone() { return this; }, text: async () => body };
    },
  };
  vm.runInNewContext(read("apps/desktop/sw.js"), ctx);
  const cacheFirst = swSelf.AISystem6TestCacheFirst;
  test.assert(typeof cacheFirst === "function", "the worker exposes its cache-first path for contracts");

  const url = "https://example.test/app/features/x.js?v=b";
  netBodies.set(url, "morning bytes");
  await cacheFirst(new Request(url), undefined, new URL(url));
  test.assert(store.get(url)?.body === "morning bytes", "the first fetch fills the cache as before");

  netBodies.set(url, "afternoon bytes");
  const second = await cacheFirst(new Request(url), undefined, new URL(url));
  test.assert(await second.text() === "afternoon bytes",
    "changed bytes under the same stamp replace the cached body immediately");
  test.assert(conditional === false,
    "the second look was a full answer: the bytes had changed, so no 304 lied");

  conditional = false;
  const third = await cacheFirst(new Request(url), undefined, new URL(url));
  test.assert(await third.text() === "afternoon bytes" && conditional,
    "unchanged bytes answer from the cache after one 304");

  netBodies.delete(url);
  const offline = await cacheFirst(new Request(url), undefined, new URL(url));
  test.assert(await offline.text() === "afternoon bytes",
    "and a dead network still falls back to the cached copy");
}

test.finish();
