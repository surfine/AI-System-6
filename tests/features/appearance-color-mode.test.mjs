import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("appearance-color-mode");
const source = read("app/core/theme-registry.js");
function boot(entries = [], { dark = false, blocked = false } = {}) {
  const values = new Map(entries);
  const element = () => ({ dataset: {}, classList: { toggle() {} } });
  const document = { documentElement: element(), body: element(), dispatchEvent: (event) => events.push(event) };
  const events = [];
  const listeners = [];
  const query = { matches: dark, addEventListener: (type, listener) => listeners.push(listener) };
  const window = { document, matchMedia: () => query, localStorage: {
    getItem(key) { if (blocked) throw Error("blocked"); return values.get(key); },
    setItem(key, value) { if (blocked) throw Error("blocked"); values.set(key, value); },
    removeItem(key) { values.delete(key); },
  } };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  vm.runInNewContext(source, { window, CustomEvent });
  return { api: window.AISystem6Theme, document, values, events, listeners, query };
}

const desk = boot([["ai-system-6-theme", "big-sur"]], { dark: true });
const api = desk.api;
test.assert(api.getCurrentTheme() === "big-sur", "Big Sur survives boot through the release path");
test.assert(api.getColorMode() === "system" && desk.document.documentElement.dataset.colorMode === "dark", "boot resolves system dark before first paint");
test.assert(desk.listeners.length === 1, "system color changes have one listener");
api.applyColorMode("light");
test.assert(desk.document.body.dataset.colorMode === "light" && desk.values.get(api.COLOR_MODE_STORAGE_KEY) === "light", "explicit light applies and persists");
desk.query.matches = false;
desk.listeners[0]();
test.assert(desk.document.body.dataset.colorMode === "light", "system changes do not override explicit light");
api.applyColorMode("dark", { experimental: true });
test.assert(api.getColorMode() === "dark" && api.getCommittedColorMode() === "light" && desk.values.get(api.COLOR_MODE_STORAGE_KEY) === "light", "preview paints dark without replacing saved light");
api.restoreColorMode();
test.assert(api.getColorMode() === "light" && desk.document.body.dataset.colorMode === "light", "preview restore returns to committed mode");
api.applyColorMode("dark", { persist: false });
api.applyColorMode("dark");
test.assert(api.getCommittedColorMode() === "dark" && desk.events.at(-1).detail.committed === true, "committing the displayed preview is an observable preference change");
api.applyColorMode("system");
desk.query.matches = true;
desk.listeners[0]();
test.assert(desk.document.body.dataset.colorMode === "dark" && desk.values.get(api.COLOR_MODE_STORAGE_KEY) === "system", "OS changes update resolved color without replacing system preference");
for (const theme of api.themes.filter((item) => item.id !== "big-sur")) {
  api.applyTheme(theme.id);
  test.assert(!("colorMode" in desk.document.body.dataset) && !("colorMode" in desk.document.documentElement.dataset), `${theme.id} retains its existing color behavior`);
}
api.previewExperimentalTheme("big-sur");
test.assert(desk.document.body.dataset.colorMode === "dark", "returning to Big Sur restores resolved saved preference");
test.assert(api.getTheme("big-sur").overlay === "none" && api.getTheme("big-sur").fontStrategy === "theme", "Big Sur has theme typography and no glass overlay");
const authoringWindow = {};
vm.runInNewContext(read("app/features/theme-authoring.js"), { window: authoringWindow });
test.assert(authoringWindow.AISystem6ThemeAuthoring.get("big-sur").art.dir === "big-sur", "Big Sur uses its independent icon family");
const invalid = boot([["ai-system-6-color-mode", "invalid"]]);
test.assert(invalid.api.getColorMode() === "system", "invalid saved modes fall back to system");
const blocked = boot([], { blocked: true });
blocked.api.applyTheme("big-sur");
blocked.api.applyColorMode("dark");
test.assert(blocked.document.body.dataset.colorMode === "dark", "storage denial does not break appearance changes");
const restarted = boot([...desk.values]);
test.assert(restarted.api.getColorMode() === "system", "color preference survives restart independently of preview");
test.assertIncludes(read("app/features/theme-lab.js"), "restoreColorMode", "closing Theme Lab restores color previews too");
test.finish();
