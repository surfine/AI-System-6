import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const finder = readFileSync(new URL("../../apps/desktop/app/core/multi-finder.js", import.meta.url), "utf8");
const browse = readFileSync(new URL("../../apps/desktop/app/features/window-browse.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../../apps/desktop/app/core/windowshade-entry.js", import.meta.url), "utf8");
const menus = readFileSync(new URL("../../apps/desktop/app/data/menus.js", import.meta.url), "utf8");
const en = readFileSync(new URL("../../apps/desktop/app/data/translations-en.js", import.meta.url), "utf8");
const zh = readFileSync(new URL("../../apps/desktop/app/data/translations-zh.js", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../../tooling/runtime-manifest.mjs", import.meta.url), "utf8");

test("the browse projection is one cross-application read of the real windows", () => {
  assert.match(finder, /function windowBrowseEntries\(/);
  assert.match(finder, /\.window\[data-window\]/);
  assert.match(finder, /applicationWindowPresentation\(win\)/);
  assert.match(finder, /windowFocusRank\(win\)/);
  assert.match(finder, /appLabel:/);
  assert.match(finder, /focusRank:/);
  // Front-most first, and a pin raising a window must not reorder the list the
  // writer is reading.
  assert.match(finder, /b\.focusRank - a\.focusRank/);
});

test("recovery maps each real state to its existing entry, never a re-summon", () => {
  const body = finder.slice(finder.indexOf("function restoreWindowBrowseEntry("));
  assert.match(body, /restoreApplicationWindow\(win\)/);
  // No unconditional openWindow: an already-open window is brought back, not
  // summoned, so the writing route's summon / restore exclusivity holds.
  assert.doesNotMatch(body, /openWindow\s*\(/);
  assert.match(finder, /state === "app-hidden".*unhideApp|unhideApp\(getWindowAppId\(win\)\)/);
  assert.match(finder, /restoreMinimizedWindow\(win\)/);
});

test("titles stay plain text and the list never builds markup", () => {
  const projection = finder.slice(finder.indexOf("function windowBrowseEntries("), finder.indexOf("function restoreWindowBrowseEntry("));
  assert.doesNotMatch(projection, /innerHTML/);
  assert.match(browse, /row\.textContent =/);
  assert.doesNotMatch(browse, /innerHTML/);
});

test("the browse surface is keyboard- and IME-honest", () => {
  // An IME composing a search term owns Enter and the arrows.
  assert.match(browse, /event\.isComposing/);
  assert.match(browse, /keyCode === 229/);
  // Escape closes and returns to the focus the caller had.
  assert.match(browse, /event\.key === "Escape"/);
  assert.match(browse, /previousFocus\?\.isConnected/);
  // Arrows move the list cursor only; Enter is the single commit.
  assert.match(browse, /function moveCursor\(/);
  assert.match(browse, /event\.key === "Enter"/);
  assert.match(browse, /restoreWindowBrowseEntry\(name\)/);
  assert.match(browse, /setAttribute\("role", "menuitem"\)/);
});

test("the surface is a lazy module and idle costs nothing", () => {
  assert.match(manifest, /"app\/features\/window-browse\.js"/);
  assert.match(browse, /window\.AISystem6WindowBrowseLoaded/);
  assert.doesNotMatch(browse, /setInterval/);
  assert.doesNotMatch(browse, /setTimeout/);
});

test("the Window menu exposes the discoverable row and the command loads on demand", () => {
  assert.match(menus, /menuItem\("window-browse", "window_browse"\)/);
  assert.match(entry, /registerCommand\?\.\("window-browse"/);
  assert.match(entry, /app\/features\/window-browse\.js/);
  for (const locale of [en, zh]) {
    assert.match(locale, /window_browse:/);
    assert.match(locale, /window_browse_search:/);
    assert.match(locale, /window_browse_none:/);
  }
});

test("the surface module installs its API without touching the desk at load", () => {
  const scope = { window: {}, document: {}, performance: { now: () => 0 } };
  runInNewContext(browse, scope);
  const api = scope.AISystem6WindowBrowse;
  assert.ok(api && typeof api.open === "function");
  assert.equal(typeof api.close, "function");
  assert.equal(typeof api.refresh, "function");
  assert.equal(api.entries().length, 0);
});
