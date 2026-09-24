import vm from "node:vm";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../../apps/desktop/app/core/theme-registry.js", import.meta.url), "utf8");
function fixture() {
  const storage = new Map();
  const links = [];
  const events = [];
  const element = () => ({ dataset: {}, classList: { toggle() {} } });
  const document = {
    body: element(), documentElement: element(),
    head: { appendChild: (link) => links.push(link) },
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, remove() { this.removed = true; } }),
    dispatchEvent: (event) => events.push(event),
  };
  const window = {
    document, setTimeout, clearTimeout,
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  };
  vm.runInNewContext(source, { window, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
  return { api: window.AISystem6Theme, document, links, events, storage };
}
const state = fixture();
const pending = state.api.previewExperimentalTheme("nextstep");
assert.equal(state.document.body.dataset.theme, "classic", "preparation preserves complete previous appearance");
assert.equal(state.storage.get(state.api.STORAGE_KEY), "classic");
state.api.applyTheme("aqua");
state.links[0].onload();
await pending;
assert.equal(state.api.getCurrentTheme(), "aqua", "stale request cannot overwrite newer choice");
assert.equal(state.storage.get(state.api.STORAGE_KEY), "aqua");
await state.api.previewExperimentalTheme("nextstep");
assert.equal(state.api.getCurrentTheme(), "nextstep");
assert.equal(state.storage.get(state.api.STORAGE_KEY), "aqua", "preview never writes preference");
assert.equal(state.api.getCommittedTheme(), "aqua");
state.api.applyTheme("liquid-glass");
assert.equal(state.document.body.dataset.themeFamily, "liquid-glass");

const failed = fixture();
failed.api.applyTheme("platinum");
const failure = failed.api.previewExperimentalTheme("nextstep");
failed.links[0].onerror();
await failure;
assert.equal(failed.api.getCurrentTheme(), "platinum");
assert.equal(failed.storage.get(failed.api.STORAGE_KEY), "platinum");
assert.equal(failed.links[0].removed, true);
assert.equal(failed.events.at(-1).type, "ai-system6-appearanceerror");
const retry = failed.api.previewExperimentalTheme("nextstep");
assert.equal(failed.links.length, 2, "failure permits a fresh resource request");
failed.links[1].onload();
await failed.api.whenReady();
await retry;
assert.equal(failed.api.getCurrentTheme(), "nextstep");
assert.equal(failed.api.getReleaseReadyThemes().some(({ id }) => id === "nextstep"), true, "NeXTSTEP is a release appearance since 2026-09-23");
console.log("PASS appearance transaction: pending, stale response, preview, failure, retry, boot readiness");
