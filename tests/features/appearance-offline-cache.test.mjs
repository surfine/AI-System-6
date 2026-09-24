import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("appearance-offline-cache");
const callbacks = new Map();
const requests = [];
const cached = new Map();
const self = { location: new URL("https://example.test/sw.js?v=test-build"), addEventListener: (name, fn) => callbacks.set(name, fn) };
vm.runInNewContext(read("apps/desktop/sw.js"), { self, URL, Request, Response, console,
  caches: { open: async () => ({ match: async (url) => cached.get(url), put: async (url, response) => cached.set(url, response) }) },
  fetch: async (request) => { requests.push(request.url); return { status: 200, type: "basic" }; },
});
async function message(appearance) {
  let work;
  callbacks.get("message")({ data: { type: "keep-appearance", appearance }, waitUntil: (promise) => { work = promise; } });
  await work;
}
for (const id of ["classic", "yosemite", "liquid-glass", "constructor", "__proto__", "https://evil.test/style.css", "../secret"]) await message(id);
test.assert(requests.length === 0, "other appearances and arbitrary inputs trigger no download");
await message("big-sur");
test.assert(requests[0] === "https://example.test/styles.big-sur.css?v=test-build", "selected Big Sur caches only the worker-owned stylesheet URL for its build");
// Big Sur draws no minimize lamp until its Dock ships (owner decision
// 2026-09-25), so it keeps its stylesheet and nothing else: the miniaturize
// state machine is NeXTSTEP's alone today.
test.assert(
  !requests.includes("https://example.test/app/core/window-minimize.js?v=test-build"),
  "Big Sur retains no miniaturize module, because it draws no yellow lamp",
);
await message("big-sur");
test.assert(requests.length === 1, "repeated appearance notifications reuse the retained response");

await message("nextstep");
test.assert(requests[1] === "https://example.test/styles.nextstep.css?v=test-build", "selected NeXTSTEP caches its own versioned material stylesheet");
await message("nextstep");
// The question is which URLs are kept, not how many round trips it took: a
// path already in the shell cache is never fetched again, and an icon family
// is never part of it.
test.assert(
  new Set(requests).size === requests.length && new Set(requests).size === 7,
  "the two appearances together retain seven URLs -- two stylesheets, four NeXTSTEP shell modules and NeXTSTEP's miniaturize state machine -- fetching none of them twice and downloading no icon family",
);
for (const path of ["app/core/window-minimize.js", "app/core/nextstep-shell.js", "app/core/nextstep-dock.js", "app/core/nextstep-menus.js", "app/features/finder-columns.js"]) {
  test.assert(requests.includes(`https://example.test/${path}?v=test-build`), `NeXTSTEP retains ${path} for offline restart`);
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
test.finish();
