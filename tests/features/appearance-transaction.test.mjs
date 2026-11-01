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
// Aqua loads its own sheet and the Dock's (2026-09-26), so the newer choice is
// itself a request in flight: the stale NeXTSTEP response lands first and must
// not win.
const newer = state.api.applyTheme("aqua");
assert.deepEqual(state.links.slice(1).map((link) => link.href), ["styles.aqua.css", "styles.desk-dock.css"], "Aqua asks for its recipe sheet, then the Dock's");
state.links[0].onload();
await pending;
assert.equal(state.api.getCurrentTheme(), "classic", "a stale response does not commit its appearance");
state.links[1].onload();
assert.equal(state.document.body.dataset.theme, "classic", "half of an appearance's sheets is not the appearance");
state.links[2].onload();
await newer;
assert.equal(state.api.getCurrentTheme(), "aqua", "stale request cannot overwrite newer choice");
assert.equal(state.storage.get(state.api.STORAGE_KEY), "aqua");
await state.api.previewExperimentalTheme("nextstep");
assert.equal(state.api.getCurrentTheme(), "nextstep");
assert.equal(state.storage.get(state.api.STORAGE_KEY), "aqua", "preview never writes preference");
assert.equal(state.api.getCommittedTheme(), "aqua");
const sheetsBefore = state.links.length;
state.api.applyTheme("snow-leopard");
assert.equal(state.document.body.dataset.theme, "snow-leopard", "an appearance whose sheets are all loaded commits at once");
assert.equal(state.links.length, sheetsBefore, "Snow Leopard reuses Aqua's recipe sheet and the Dock sheet");
const glass = state.api.applyTheme("liquid-glass");
assert.deepEqual(state.links.slice(sheetsBefore).map((link) => link.href), ["styles.liquid-glass.css"], "Liquid Glass asks only for its own sheet; the Dock sheet Aqua loaded is not requested again");
assert.equal(state.document.body.dataset.theme, "snow-leopard", "Liquid Glass waits for its sheet");
state.links.at(-1).onload();
await glass;
assert.equal(state.document.body.dataset.themeFamily, "liquid-glass");

// A lineage fails as a whole: Tiger's own sheet 404s after Aqua's and the
// Dock's arrived. Nothing of Tiger is projected, the two good sheets stay, and
// choosing Tiger again asks only for the one that failed.
const partial = fixture();
const tiger = partial.api.applyTheme("tiger");
assert.deepEqual(partial.links.map((link) => link.href), ["styles.aqua.css", "styles.desk-dock.css", "styles.tiger.css"], "Tiger asks for its chain root to leaf");
partial.links[0].onload();
partial.links[1].onload();
partial.links[2].onerror();
await tiger;
assert.equal(partial.api.getCurrentTheme(), "classic");
assert.equal(partial.document.body.dataset.theme, "classic", "a partial lineage writes no appearance attribute");
assert.equal(partial.links[2].removed, true);
assert.equal(partial.links[0].removed, undefined, "the sheets that arrived are kept");
assert.equal(partial.events.at(-1).type, "ai-system6-appearanceerror");
const tigerAgain = partial.api.applyTheme("tiger");
assert.deepEqual(partial.links.slice(3).map((link) => link.href), ["styles.tiger.css"], "a retry asks only for the sheet that failed");
partial.links[3].onload();
await tigerAgain;
assert.equal(partial.api.getCurrentTheme(), "tiger");

// The baseline must be an appearance with no lazy sheet of its own, so the
// only request in flight is the one that fails. Since every Mac OS X era
// gained its Dock sheet (2026-09-25) that is System 6 alone, the boot default.
const failed = fixture();
const failure = failed.api.previewExperimentalTheme("nextstep");
failed.links[0].onerror();
await failure;
assert.equal(failed.api.getCurrentTheme(), "classic");
assert.equal(failed.storage.get(failed.api.STORAGE_KEY), "classic");
assert.equal(failed.links[0].removed, true);
assert.equal(failed.events.at(-1).type, "ai-system6-appearanceerror");
const retry = failed.api.previewExperimentalTheme("nextstep");
assert.equal(failed.links.length, 2, "failure permits a fresh resource request");
failed.links[1].onload();
await failed.api.whenReady();
await retry;
assert.equal(failed.api.getCurrentTheme(), "nextstep");
assert.equal(failed.api.getReleaseReadyThemes().some(({ id }) => id === "nextstep"), true, "NeXTSTEP is a release appearance since 2026-09-23");
console.log("PASS appearance transaction: pending, stale response, preview, sheet lists, partial failure, failure, retry, boot readiness");
