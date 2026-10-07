import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

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

test("the surface is a lazy module and idle costs nothing", () => {
  assert.match(manifest, /"app\/features\/window-browse\.js"/);
  assert.match(browse, /window\.AISystem6WindowBrowseLoaded/);
  assert.doesNotMatch(browse, /setInterval/);
  // Hover closing uses an event-triggered timeout; no timer starts at load.
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

// Execute the actual surface against the shared DOM harness. Its button click
// is intentionally inert at boot, so supply the browser's click dispatch here.
test("browse keeps the search caret, links real options, respects IME and commits only Enter", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  const create = h.document.createElement;
  h.document.createElement = (tag) => {
    const el = create(tag);
    el.click = () => el.dispatchEvent({ type: "click", target: el });
    return el;
  };
  const observations = [];
  h.context.MutationObserver = class {
    constructor(callback) { this.callback = callback; observations.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  h.document.querySelectorAll(".window[data-window]").forEach((win) => win.classList.add("is-hidden"));
  const desktop = h.document.querySelector(".desktop");
  const names = ["browse-contract-one", "browse-contract-two"];
  const wins = names.map((name) => {
    const win = create("section");
    win.className = "window";
    win.dataset.window = name;
    win.dataset.app = "browseContract";
    desktop.append(win);
    return win;
  });
  const raised = [];
  h.context.focusWindow = (win) => raised.push(win.dataset.window);
  h.context.getWindow = (name) => wins.find((win) => win.dataset.window === name) || null;
  const caller = create("input");
  h.document.body.append(caller);
  caller.focus();
  h.run(browse);
  const api = h.context.AISystem6WindowBrowse;
  api.open();
  const search = h.document.querySelector(".window-browse-search");
  const panel = h.document.querySelector(".window-browse-popover");
  const key = (key, extras = {}) => {
    const event = { type: "keydown", key, target: search, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...extras };
    panel.dispatchEvent(event);
    return event;
  };
  const selected = () => h.document.getElementById(search.getAttribute("aria-activedescendant"));
  assert.equal(search.getAttribute("role"), "combobox");
  assert.equal(h.document.getElementById(search.getAttribute("aria-controls")).getAttribute("role"), "listbox");
  assert.equal(selected().getAttribute("role"), "option");
  assert.equal(selected().dataset.windowBrowseName, names[0]);
  assert.equal(key("ArrowDown").propagationStopped, true);
  assert.equal(h.document.activeElement, search);
  assert.equal(selected().dataset.windowBrowseName, names[1]);
  assert.equal(selected().getAttribute("aria-selected"), "true");
  assert.deepEqual(raised, []);
  for (const extras of [{ isComposing: true }, { keyCode: 229 }]) {
    for (const name of ["ArrowUp", "Enter", "Escape"]) assert.ok(!key(name, extras).defaultPrevented);
    assert.equal(selected().dataset.windowBrowseName, names[1]);
    assert.deepEqual(raised, []);
  }
  search.value = "one";
  search.dispatchEvent({ type: "input" });
  assert.equal(selected().dataset.windowBrowseName, names[0]);
  assert.equal(h.document.activeElement, search);
  key("Enter");
  assert.deepEqual(raised, [names[0]]);
  assert.equal(h.document.querySelector(".window-browse-menu"), null);
  assert.ok(observations.at(-1).disconnected);

  caller.focus();
  api.open();
  const nextPanel = h.document.querySelector(".window-browse-popover");
  nextPanel.dispatchEvent({ type: "keydown", key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(h.document.activeElement, caller);
  assert.equal(h.document.querySelector(".window-browse-menu"), null);

  api.open();
  // A close between rendering and activation must never re-summon the window.
  wins[0].classList.add("is-hidden");
  h.document.querySelector('[data-window-browse-name="browse-contract-one"]').click();
  assert.deepEqual(raised, [names[0]]);
  assert.equal(h.document.activeElement, caller);
  api.open();
  wins[1].classList.add("is-minimized");
  observations.at(-1).callback([]);
  assert.equal(api.entries()[0].state, "minimized");
  wins[1].classList.add("is-hidden");
  observations.at(-1).callback([]);
  assert.equal(h.document.querySelectorAll('[role="option"]').length, 0);
  assert.equal(h.document.querySelector(".window-browse-search").getAttribute("aria-activedescendant"), null);
  api.close();
});


test("hover projection leaves focus alone, space only enlarges a focused row, picker does not restore", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  const caller = h.document.createElement("input");
  h.document.body.append(caller);
  caller.focus();
  const selected = [];
  let hiddenHints = 0;
  h.context.hideBalloonHelp = () => { hiddenHints++; };
  const entries = [
    { name: "one", appId: "a", appLabel: "A", title: "One", state: "open" },
    { name: "two", appId: "b", appLabel: "B", title: "Two", state: "open" },
    { name: "three", appId: "a", appLabel: "A", title: "Three", state: "minimized" },
  ];
  h.context.windowBrowseEntries = () => entries;
  h.context.restoreWindowBrowseEntry = () => { throw Error("picker must not restore"); };
  h.context.AISystem6WindowPreview = { get: async () => ({ url: null, unavailable: true }) };
  h.run(browse);
  const api = h.context.AISystem6WindowBrowse;
  api.open({ appId: "a", hover: true, returnFocus: false, filterEntries: (entry) => entry.state === "open", onSelect: (name) => selected.push(name) });
  assert.equal(h.document.activeElement, caller);
  assert.equal(hiddenHints, 1, "hover removes the old name balloon before showing the picture");
  assert.deepEqual(Array.from(api.entries(), (entry) => entry.name), ["one"]);
  const panel = h.document.querySelector(".window-browse-popover");
  const search = h.document.querySelector(".window-browse-search");
  const row = h.document.querySelector('[role="option"]');
  const space = (target) => { const e = { type: "keydown", key: " ", target, preventDefault() { this.prevented = true; } }; panel.dispatchEvent(e); return e; };
  assert.ok(!space(search).prevented);
  assert.ok(!panel.classList.contains("is-preview-expanded"));
  assert.ok(space(row).prevented);
  assert.ok(panel.classList.contains("is-preview-expanded"));
  row.dispatchEvent({ type: "click", target: row });
  assert.deepEqual(selected, ["one"]);
  assert.equal(h.document.querySelector(".window-browse-menu"), null);
  api.open({ hover: true, returnFocus: false });
  api.closeHover();
  assert.equal(h.document.querySelector(".window-browse-menu"), null);
  assert.equal(h.document.activeElement, caller);
  const previousHints = hiddenHints;
  api.open();
  assert.equal(hiddenHints, previousHints, "explicit All Windows does not dismiss unrelated balloon help");
  api.close();
});
test("Dock hover includes a collapsed side slot and restores that same registered window", async () => {
  const h = createAppBootVm(); await h.settleBoot();
  h.document.querySelectorAll('.window[data-window]').forEach(win => win.classList.add('is-hidden'));
  const win = h.document.createElement('section');
  win.className = 'window is-slide-hidden'; win.dataset.window = 'hover-side-contract'; win.dataset.app = 'quickDraft';
  h.document.querySelector('.desktop').append(win);
  const anchor = h.document.createElement('button'); h.document.body.append(anchor); anchor.focus();
  const restored = [];
  // Exercise projection and recovery routing against the real registry; the
  // arrangement engine's sideVisibility geometry has its own executable test.
  h.context.AISystem6WindowShade = { slideVisibility: (target, hidden) => {
    restored.push([target, hidden]); target.classList.remove('is-slide-hidden'); return { ok: true };
  } };
  h.context.getWindow = name => name === win.dataset.window ? win : null;
  h.run(browse);
  const api = h.context.AISystem6WindowBrowse;
  assert.equal(api.open({ appId: 'quickDraft', hover: true, anchor, returnFocus: false }), true);
  assert.equal(api.entries().length, 1);
  assert.equal(api.entries()[0].state, 'slide-hidden');
  assert.equal(h.document.activeElement, anchor);
  assert.equal(restored.length, 0, 'hover never wakes the side slot');
  const row = h.document.querySelector('[role="option"]');
  row.dispatchEvent({ type: 'click', target: row });
  assert.equal(restored.length, 1);
  assert.equal(restored[0][0], win);
  assert.equal(restored[0][1], false);
});

test("Dock hover bounds use panel geometry after async image load and preserve the 160ms transfer grace", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  h.context.innerWidth = 1024;
  h.context.innerHeight = 768;
  let tick = 0;
  let serial = 0;
  const timers = new Map();
  h.context.setTimeout = (fn, delay) => { timers.set(++serial, { fn, at: tick + delay }); return serial; };
  h.context.clearTimeout = (id) => timers.delete(id);
  const advance = (ms) => { tick += ms; for (const [id, timer] of [...timers]) if (timer.at <= tick) { timers.delete(id); timer.fn(); } };
  const anchor = h.document.createElement("button");
  h.document.body.append(anchor);
  anchor.getBoundingClientRect = () => ({ left: 990, top: 730, width: 30, height: 30 });
  let deliver;
  h.context.windowBrowseEntries = () => [{ name: "hover", appId: "app", appLabel: "App", title: "Window", state: "open" }];
  h.context.AISystem6WindowPreview = { get: () => new Promise((resolve) => { deliver = resolve; }) };
  const create = h.document.createElement;
  let panelHeight = 120;
  h.document.createElement = (tag) => {
    const node = create(tag);
    node.getBoundingClientRect = () => {
      const host = h.document.querySelector(".window-browse-menu");
      const left = parseFloat(host?.style.left) || 12;
      const top = parseFloat(host?.style.top) || 30;
      return node.classList.contains("window-browse-popover")
        ? { left: left + 4, top: top + 2, width: 300, height: panelHeight }
        : { left, top, width: 1000, height: panelHeight };
    };
    return node;
  };
  h.run(browse);
  const api = h.context.AISystem6WindowBrowse;
  api.open({ appId: "app", hover: true, anchor, returnFocus: false });
  const host = h.document.querySelector(".window-browse-menu");
  const panel = h.document.querySelector(".window-browse-popover");
  assert.equal(host.style.right, "auto");
  assert.equal(panel.getBoundingClientRect().left, 716);
  assert.equal(panel.getBoundingClientRect().top, 602);
  deliver({ url: "data:image/png;base64,photo", stale: false });
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  const img = h.document.querySelector(".window-browse-preview img");
  assert.ok(img);
  panelHeight = 320;
  img.dispatchEvent({ type: "load" });
  assert.equal(panel.getBoundingClientRect().left, 716);
  assert.equal(panel.getBoundingClientRect().top, 402);
  anchor.getBoundingClientRect = () => ({ left: 4, top: 20, width: 30, height: 30 });
  img.dispatchEvent({ type: "load" });
  assert.equal(panel.getBoundingClientRect().left, 8);
  assert.equal(panel.getBoundingClientRect().top, 8);
  api.hoverLeave(anchor);
  advance(159);
  assert.ok(h.document.querySelector(".window-browse-menu"));
  panel.dispatchEvent({ type: "pointerenter" });
  advance(10);
  assert.ok(h.document.querySelector(".window-browse-menu"));
  panel.dispatchEvent({ type: "pointerleave" });
  advance(159);
  assert.ok(h.document.querySelector(".window-browse-menu"));
  advance(1);
  assert.equal(h.document.querySelector(".window-browse-menu"), null);
  img.dispatchEvent({ type: "load" });
  assert.equal(h.document.querySelector(".window-browse-menu"), null);
});
