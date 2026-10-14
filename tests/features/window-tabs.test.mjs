// Window tabs (P3, WINDOW-TABS-SPEC P0): Sierra's window-tab verbs.
//
// The static half pins the era axis (§2.1) and the menu shape (§5, §9.2): the
// capability lives on exactly big-sur and liquid-glass, the five rows sit
// between Enter Full Screen and Pinned, and each row resolves to a callable
// command. The executing half (app-boot-vm) runs the behaviours that can be
// wrong without a pixel to show for it — wrapping around a two-tab strip, the
// show/hide marker, and (since the tab store grew a window dimension) the two
// verbs that needed a second window to exist: moving a tab out into one, and
// merging a second window's tabs back before it closes.
//
// The refusal rule (§4.7) is asserted too: an empty strip, or a kind that may
// not open a second window, greys its rows WITH a reason.

import assert from "node:assert/strict";
import nodeTest from "node:test";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { codeOnly, createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-tabs");
const themeRegistry = read("app/core/theme-registry.js");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
const shadeEntry = read("app/core/windowshade-entry.js");
const windowTabs = read("app/features/window-tabs.js");
const manifest = read("tooling/runtime-manifest.mjs");

// --- (a) the era axis (§2.1) -------------------------------------------------
nodeTest("the window-tabs capability is on exactly the two post-Sierra eras", () => {
  // Read the capability lists straight out of the registry: exactly two
  // appearances carry it, and they are the ones released after 10.12.
  // Split the registry into per-entry chunks (id → its capabilities), so an
  // earlier entry's list can never be mistaken for a later one's.
  const chunks = themeRegistry.split(/id: "/).slice(1);
  const declared = chunks.map((chunk) => {
    const id = chunk.slice(0, chunk.indexOf('"'));
    const caps = chunk.match(/capabilities: Object\.freeze\(\[([^\]]*)\]\)/);
    return [id, !!caps && caps[1].includes('"window-tabs"')];
  }).filter(([, has]) => has).map(([id]) => id);
  assert.deepEqual(declared.sort(), ["big-sur", "liquid-glass"], `window-tabs is declared by ${declared.join(", ")}`);
  // Yosemite (10.10, 2014) predates Sierra and must never gain it silently.
  const yosemite = themeRegistry.slice(themeRegistry.indexOf('id: "yosemite"'));
  assert.equal(
    yosemite.slice(0, yosemite.indexOf("capabilities:")).includes("window-tabs"),
    false,
    "Yosemite (2014) does not declare window-tabs",
  );
  // The rows are gated by the capability, not by an era id written into the menu.
  test.assertMatches(windowManager, /"window-tabs": window\.AISystem6Theme\?\.hasCapability\?\.\("window-tabs"\) === true,/);
  for (const row of ["show-previous-tab", "show-next-tab", "toggle-tab-bar"]) {
    test.assertIncludes(menus, `menuItem("${row}", `, `${row} has a Window-menu row`);
  }
  // The gate is one shared constant referenced by all three rows — not an era
  // id typed three times — so the capability axis has a single home to change.
  test.assertMatches(
    menus,
    /const TABS_GATE = \{ menuCondition: "window-tabs" \};/,
    "the era gate is declared once",
  );
  for (const row of ["show-previous-tab", "show-next-tab", "toggle-tab-bar", "merge-all-windows", "move-tab-to-new-window"]) {
    test.assertMatches(
      menus,
      new RegExp(`menuItem\\("${row}", "[a-z_]+", "", TABS_GATE\\)`),
      `${row} carries the era gate`,
    );
  }
  assert.equal(
    (menus.match(/menuItem\([^\n]*TABS_GATE\)/g) || []).length,
    5,
    "and nothing beyond the five rows uses it",
  );
});

nodeTest("the five rows sit between Enter Full Screen and Pinned", () => {
  const full = menus.indexOf('menuItem("toggle-full-screen-window"');
  const prev = menus.indexOf('menuItem("show-previous-tab"');
  const next = menus.indexOf('menuItem("show-next-tab"');
  const toggle = menus.indexOf('menuItem("toggle-tab-bar"');
  const merge = menus.indexOf('menuItem("merge-all-windows"');
  const move = menus.indexOf('menuItem("move-tab-to-new-window"');
  const pinned = menus.indexOf('submenu("pinned"');
  assert.equal(
    full !== -1 && prev > full && next > prev && toggle > next && merge > toggle && move > merge && pinned > move,
    true,
    "the tab verbs are ordered Full Screen → Previous → Next → Show/Hide → Merge → Move → Pinned",
  );
});

nodeTest("every row resolves to a callable command, registered before any load", () => {
  for (const row of ["show-previous-tab", "show-next-tab", "toggle-tab-bar", "merge-all-windows", "move-tab-to-new-window"]) {
    test.assertIncludes(shadeEntry, `"${row}"`, `${row} is registered with the desk's window verbs`);
  }
  // Registered eagerly so the row resolves in the one runtime registry — the
  // desk's rule for every menu row (menu-bar's own contract enforces it) — with
  // the behaviour itself in the lazy module.
  test.assertMatches(shadeEntry, /registerCommand\?\.\("show-next-tab", windowTabsCommand\("stepNext"\)\)/, "the row's command is registered eagerly");
  test.assertIncludes(shadeEntry, 'await windowTabs();', "and its handler loads the lazy module on use");
  test.assertMatches(windowTabs, /stepPrevious: \(\) => step\(-1\)/, "the module owns the walking");
  // The implementation is lazy; the boot bundle only names the path.
  test.assertMatches(manifest, /"app\/features\/window-tabs\.js"/, "window-tabs.js is a lazy runtime path");
  // §4.2: the two verbs land where §3 said they would — in the lazy module, over
  // the tab store's window dimension, with their availability decided eagerly
  // (cheap DOM plus the registry's own whitelist declaration, so a row can grey
  // with a reason and a kind that may not open a second window is refused
  // before the command is ever offered).
  test.assertMatches(windowTabs, /moveTabToNewWindow,/, "the module exports Move Tab to New Window");
  test.assertMatches(windowTabs, /mergeAllWindows,/, "and Merge All Windows");
  test.assertMatches(shadeEntry, /registerCommand\?\.\("merge-all-windows"/, "Merge All Windows registers eagerly");
  test.assertMatches(shadeEntry, /registerCommand\?\.\("move-tab-to-new-window"/, "so does Move Tab to New Window");
  assert.equal(
    codeOnly(shadeEntry).includes('getWindowRecord(kind)?.instances'),
    true,
    "Move Tab to New Window asks the registry who may open a second window",
  );
  // Both verbs are made of the storage layer's own writes, never a private one.
  test.assertMatches(windowTabs, /assignDocumentTabWindow\(/, "the verbs hand tabs over through the store's API");
});

// --- (b) executing: walking the strip, and the show/hide marker --------------
// A strip the desk really draws is exercised for real: a window with a TDI
// strip and two tab buttons, each recording its own activation.
async function tabHarness() {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  const win = h.document.createElement("section");
  win.className = "window is-active";
  win.dataset.window = "tabsFixtureKind";
  const strip = h.document.createElement("div");
  strip.className = "tdi-tabs";
  win.append(strip);
  h.document.querySelector(".desktop").append(win);
  const opened = [];
  const addTab = (id) => {
    const button = h.document.createElement("button");
    button.className = "tdi-tab" + (id === "a" ? " is-active" : "");
    button.dataset.documentTabId = id;
    // The harness's click() is inert; a real element dispatches, so the tab's
    // own listener (registered below) is what runs — the same path a click takes.
    button.click = () => button.dispatchEvent({ type: "click", target: button });
    button.addEventListener("click", () => {
      opened.push(id);
      h.run(`[...document.querySelectorAll(".window.is-active .tdi-tab")].forEach((b) => b.classList.toggle("is-active", b.dataset.documentTabId === ${JSON.stringify(id)}))`);
    });
    strip.append(button);
    // renderTdiTabStrip writes the count on every render, and the availability
    // question reads it: the fixture carries what the desk really writes.
    strip.dataset.tabCount = String(strip.children.length);
    return button;
  };
  return { h, win, strip, opened, addTab };
}

nodeTest("next and previous wrap around a two-tab strip", async () => {
  const { h, opened, addTab } = await tabHarness();
  addTab("a");
  addTab("b");
  const api = h.context.window.AISystem6WindowTabs;

  assert.equal(api.step(1), true, "Show Next Tab moves");
  assert.deepEqual(opened, ["b"], "the next tab opened");
  assert.equal(api.step(1), true, "Show Next Tab wraps at the end");
  assert.deepEqual(opened, ["b", "a"], "and lands back on the first tab");
  assert.equal(api.step(-1), true, "Show Previous Tab walks back");
  assert.deepEqual(opened, ["b", "a", "b"], "wrapping left from the first tab lands on the last");
});

nodeTest("one tab (or none) refuses, and says why", async () => {
  const { h, opened, addTab } = await tabHarness();
  const api = h.context.window.AISystem6WindowTabs;
  assert.equal(api.step(1), false, "an empty strip refuses");
  addTab("a");
  assert.equal(api.step(1), false, "a single tab refuses — there is nowhere to go");
  assert.deepEqual(opened, [], "and nothing was opened");
  // The refusal carries the reason the row greys with (§4.7). The availability
  // question is answered without loading the module.
  const command = h.context.window.AISystem6Runtime.getCommand("show-next-tab");
  test.assert(command, "show-next-tab is a registered command before its module loads");
  assert.equal(command.isAvailable(), false, "with one tab the row is unavailable");
  test.assertIncludes(
    read("app/core/windowshade-entry.js"),
    'unavailableReason: () => "balloon_disabled_tabs_empty"',
    "and the refusal names a reason key the translations own",
  );
  for (const locale of [read("app/data/translations-en.js"), read("app/data/translations-zh.js")]) {
    test.assertIncludes(locale, "balloon_disabled_tabs_empty:", "both languages carry the reason");
  }
  // Hiding, by contrast, is available with one tab: the bar exists to be shown.
  const hide = h.context.window.AISystem6Runtime.getCommand("toggle-tab-bar");
  assert.equal(hide.isAvailable(), true, "Show/Hide Tab Bar stays available with a single tab");
});

nodeTest("toggle-tab-bar flips the strip's visibility marker", async () => {
  const { h, strip, addTab } = await tabHarness();
  addTab("a");
  addTab("b");
  const api = h.context.window.AISystem6WindowTabs;
  assert.equal(strip.hasAttribute("hidden"), false, "the bar starts shown");
  assert.equal(api.toggleTabBar(), false, "first toggle hides it");
  assert.equal(strip.hasAttribute("hidden"), true, "the strip is marked hidden");
  assert.equal(api.toggleTabBar(), true, "second toggle shows it again");
  assert.equal(strip.hasAttribute("hidden"), false, "the marker is gone");
});

// --- (c) ⌘W closes the current tab when the bar is shown (§7B) --------------
nodeTest("⌘W with a shown tab bar closes the current tab, never the window", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  const win = h.document.createElement("section");
  win.className = "window is-active";
  win.dataset.window = "tabsFixtureKind";
  const strip = h.document.createElement("div");
  strip.className = "tdi-tabs";
  win.append(strip);
  h.document.querySelector(".desktop").append(win);
  const closed = [];
  const addTab = (id) => {
    const button = h.document.createElement("button");
    button.className = "tdi-tab" + (id === "a" ? " is-active" : "");
    button.dataset.documentTabId = id;
    const close = h.document.createElement("button");
    close.className = "tdi-tab-close";
    close.addEventListener("click", () => { closed.push(id); button.remove(); close.remove(); });
    button.append(close);
    strip.append(button);
    strip.dataset.tabCount = String(strip.children.length);
  };
  addTab("a");
  addTab("b");
  h.run(`focusWindow(document.querySelector('.window[data-window="tabsFixtureKind"]'))`);
  // The real closeWindow would run its full save/discard flow for this fake
  // window; the test stubs it. The tab branch under test returns BEFORE
  // closeWindow, so the stub proves the branch taken.
  const closeCalls = [];
  h.context.closeWindow = async (name, force, instance) => { closeCalls.push([name, force, instance]); return true; };
  // The era carries the capability and the bar is shown: ⌘W must reach the
  // ACTIVE tab's own close button (the one path that knows the save rules).
  // The desk boots classic, so the test switches to a post-Sierra era the way
  // the Apple menu does.
  await h.run(`AISystem6Theme.applyTheme("big-sur")`);
  await h.waitFor(() => h.run(`AISystem6Theme.hasCapability("window-tabs")`));
  assert.equal(h.run(`AISystem6Theme.hasCapability("window-tabs")`), true, "the era carries the capability");
  // The shim's click() is inert, so the branch is proven by stubbing the
  // element's own dispatch — the handler calls .click(), the tab's listener is
  // what runs in a real browser.
  h.run(`(function () {
    const close = document.querySelector(".window.is-active[data-window] .tdi-tab.is-active .tdi-tab-close");
    close.click = () => close.dispatchEvent({ type: "click", target: close });
  })()`);
  await h.run(`handleAction("close-active-window")`);
  assert.equal(win.classList.contains("is-hidden"), false, "the window itself stays open");
  assert.deepEqual([...closed], ["a"], "the ACTIVE tab's close path ran (a is the active tab)");
  // Last tab closed: the strip has no tab left, so the tab-bar branch does not
  // fire and ⌘W returns to closing the window — the stub recorded it.
  await h.run(`handleAction("close-active-window")`);
  assert.deepEqual([...closeCalls], [["tabsFixtureKind", false, undefined]], "with no tab left, ⌘W closes the window as it always did");
});

nodeTest("a disabled tab close button leaves ⌘W meaning close-window", async () => {
  // The active tab's close button is the one path that knows the save rules —
  // but it can be DISABLED (a document that may not be closed). Clicking a dead
  // key would do nothing at all and leave ⌘W inert for that window; the desk's
  // own close, with its save prompt, is the honest route.
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  const win = h.document.createElement("section");
  win.className = "window is-active";
  win.dataset.window = "tabsFixtureKind";
  const strip = h.document.createElement("div");
  strip.className = "tdi-tabs";
  win.append(strip);
  h.document.querySelector(".desktop").append(win);
  const closed = [];
  const addTab = (id, disabled) => {
    const button = h.document.createElement("button");
    button.className = "tdi-tab" + (id === "a" ? " is-active" : "");
    button.dataset.documentTabId = id;
    const close = h.document.createElement("button");
    close.className = "tdi-tab-close";
    close.disabled = disabled;
    close.addEventListener("click", () => { closed.push(id); });
    button.append(close);
    strip.append(button);
    strip.dataset.tabCount = String(strip.children.length);
  };
  addTab("a", true);
  addTab("b", false);
  const closeCalls = [];
  h.context.closeWindow = async (name, force, instance) => { closeCalls.push([name, force, instance]); return true; };
  await h.run(`focusWindow(document.querySelector('.window[data-window="tabsFixtureKind"]'))`);
  await h.run(`AISystem6Theme.applyTheme("big-sur")`);
  await h.waitFor(() => h.run(`AISystem6Theme.hasCapability("window-tabs")`));
  await h.run(`handleAction("close-active-window")`);
  assert.deepEqual([...closed], [], "the disabled button was not clicked");
  assert.deepEqual([...closeCalls], [["tabsFixtureKind", false, undefined]],
    "⌘W falls through to the desk's own close, which owns the save prompt");
});

nodeTest("⌘W closes the window when the bar is hidden or the capability absent", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  const win = h.document.createElement("section");
  win.className = "window is-active";
  win.dataset.window = "tabsFixtureKind";
  const strip = h.document.createElement("div");
  strip.className = "tdi-tabs";
  strip.setAttribute("hidden", "");
  win.append(strip);
  h.document.querySelector(".desktop").append(win);
  const closeCalls = [];
  h.context.closeWindow = async (name, force, instance) => { closeCalls.push([name, force, instance]); return true; };
  h.run(`focusWindow(document.querySelector('.window[data-window="tabsFixtureKind"]'))`);
  h.run(`(function () {
    const button = document.createElement("button");
    button.className = "tdi-tab is-active";
    document.querySelector(".tdi-tabs").append(button);
  })()`);
  // Bar hidden: the tab path must not fire; the window close runs instead.
  // (The capability is checked first, and classic — this VM's era — fails it
  // too, so both guards route to the same close.)
  await h.run(`handleAction("close-active-window")`);
  assert.deepEqual([...closeCalls], [["tabsFixtureKind", false, undefined]], "a hidden bar leaves ⌘W meaning close-window");
});

nodeTest("⌃⇥ and ⌃⇧⇥ walk the strip through the same commands", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  const { strip, opened, addTab } = await (async () => {
    const win = h.document.createElement("section");
    win.className = "window is-active";
    win.dataset.window = "tabsFixtureKind";
    const strip = h.document.createElement("div");
    strip.className = "tdi-tabs";
    win.append(strip);
    h.document.querySelector(".desktop").append(strip.parentElement);
    const opened = [];
    const addTab = (id) => {
      const button = h.document.createElement("button");
      button.className = "tdi-tab" + (id === "a" ? " is-active" : "");
      button.dataset.documentTabId = id;
      button.click = () => button.dispatchEvent({ type: "click", target: button });
      button.addEventListener("click", () => {
        opened.push(id);
        h.run(`[...document.querySelectorAll(".window.is-active .tdi-tab")].forEach((b) => b.classList.toggle("is-active", b.dataset.documentTabId === ${JSON.stringify(id)}))`);
      });
      strip.append(button);
      strip.dataset.tabCount = String(strip.children.length);
    };
    return { strip, opened, addTab };
  })();
  addTab("a");
  addTab("b");
  // The shortcuts are registered entries with the global scope; the capability
  // gate lives in the commands' own availability, so Key Caps greys by one table.
  const next = h.context.window.AISystem6Runtime.getCommand("show-next-tab");
  const prev = h.context.window.AISystem6Runtime.getCommand("show-previous-tab");
  test.assert(next && prev, "both walking commands are registered");
  assert.equal(next.isAvailable(), true, "with two tabs and the capability, the row is available");
  // The registry entries exist and name these actions (static half below).
  test.assertIncludes(read("app/core/actions.js"), 'action: "show-next-tab", display: "⌃⇥"', "⌃⇥ is bound to show-next-tab");
  test.assertIncludes(read("app/core/actions.js"), 'action: "show-previous-tab", display: "⌃⇧⇥"', "⌃⇧⇥ is bound to show-previous-tab");
  // And the walking itself wraps (already proven above; the keys reach it).
  assert.equal(h.context.window.AISystem6WindowTabs.stepNext(), true, "next moves");
  assert.deepEqual([...opened], ["b"]);
  // The direct call above left b active, so the key walks from there: next
  // wraps to a, and previous wraps back to b. This is the half the static
  // assertions above cannot see — whether the KEY reaches the command at all
  // depends on the modifier pre-gate (shortcutModifierPressed), a runtime fact.
  // This VM reports a Mac platform, where ⌃⇥ must dispatch; a gate written for
  // ⌘-only would pass every check above and leave both rows dead on a Mac.
  opened.length = 0;
  h.run(`focusWindow(document.querySelector('.window[data-window="tabsFixtureKind"]'))`);
  const nextKey = h.fireKeydown(h.document.body, { key: "tab", ctrlKey: true });
  await h.waitFor(() => opened.length > 0);
  assert.equal(nextKey.defaultPrevented, true, "⌃⇥ is claimed by the desk, not left to the browser");
  assert.deepEqual([...opened], ["a"], "⌃⇥ reaches show-next-tab and walks forward (wrapping off b)");
  h.fireKeydown(h.document.body, { key: "tab", ctrlKey: true, shiftKey: true });
  await h.waitFor(() => opened.length > 1);
  assert.deepEqual([...opened], ["a", "b"], "⌃⇧⇥ reaches show-previous-tab and walks back, wrapping");
  // The other side of the same gate: on a Mac the ⌃-family now passes the
  // modifier pre-gate, so an entry with a bare key would answer to ⌘-combos it
  // was never bound to — ⌘⇧⇥ walking the strip is a combination macOS gives to
  // nothing. `ctrl: true` on the two rows is what keeps the binding exact.
  h.fireKeydown(h.document.body, { key: "tab", metaKey: true, shiftKey: true });
  h.fireKeydown(h.document.body, { key: "tab", metaKey: true });
  await h.settleBoot();
  assert.deepEqual([...opened], ["a", "b"], "⌘⇧⇥ and ⌘⇥ leave the strip alone");
  // And the ⌃ admission is the ⌃⇥ family only. A blanket "⌃ also counts as the
  // command modifier" would hand every existing row a ⌃ twin — ⌃S saving,
  // ⌃W closing the window — so the desk must leave ⌃S to the browser.
  const ctrlS = h.fireKeydown(h.document.body, { key: "s", ctrlKey: true });
  await h.settleBoot();
  assert.equal(ctrlS.defaultPrevented, false, "⌃S is not claimed: only the ⌃⇥ rows declare ctrl");
});

// --- (c) executing: the two verbs a second window makes expressible ----------
// §4.2's pair, over the real tab store rather than a fixture: a DocMap window
// holding two tabs, the real identity layer opening the second window, and the
// real rails redrawing. What these cases are for is the thing a source contract
// cannot see — that the tab is in exactly ONE window at any moment.
function docMapDesk() {
  const h = createAppBootVm();
  h.run(`
    projects.length = 0;
    projects.push({
      id: "p1", name: "Project Hard Disk", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      questionSheet: "", outline: "", drafts: [], scraps: [],
      documentTabs: [
        { id: "map-a", app: "docMap", role: "docmap", title: "Map A", backing: { type: "docmap", id: "d1" }, state: {}, order: 0 },
        { id: "map-b", app: "docMap", role: "docmap", title: "Map B", backing: { type: "docmap", id: "d2" }, state: {}, order: 1 },
      ],
      activeDocumentTabIds: { reader: null, teachText: null, docMap: "map-a", timeMachine: null },
    });
    activeProjectId = "p1"; selectedProjectId = "p1"; startupProjectId = "p1"; isProjectMounted = true;
    deskPersistenceWritable = true;
    window.__deskSaves = 0;
    saveDeskState = async () => { window.__deskSaves += 1; return true; };
    renderProjectDisks = function noopProjectDisks() {};
  `);
  return h;
}

const railTabTitles = (h) => JSON.parse(h.run(`JSON.stringify([...document.querySelectorAll("#docmap-tabs .tdi-tab")].map((b) => b.textContent))`));
const ownerSets = (h) => JSON.parse(h.run(`JSON.stringify({
  main: getWindowDocumentTabs("docMap", getActiveProject(), "main").map((tab) => tab.id),
  views: [...document.querySelectorAll('.window[data-window="docMap"][data-window-instance]')]
    .map((win) => getWindowDocumentTabs("docMap", getActiveProject(), win.dataset.windowInstance).map((tab) => tab.id)),
})`));

nodeTest("Move Tab to New Window hands the key window's tab to a window of its own", async () => {
  const h = docMapDesk();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  await h.run(`openWindow("docMap")`);
  await h.run(`focusWindow(getWindow("docMap"))`);
  // The rail is a view of the store; the desk draws it whenever the kind's tabs
  // change (and on restore), so the case draws it once before the verb runs.
  await h.run(`renderDocMapTabs()`);
  assert.equal(railTabTitles(h).length, 2, "the main window's rail shows both maps");

  const outcome = await h.run(`dispatchCommand("move-tab-to-new-window")`);
  assert.equal(outcome.status, "success", "the row was available and its command ran");
  assert.equal(h.run(`document.querySelectorAll('.window[data-window="docMap"][data-window-instance]').length`), 1, "a second window of the kind opened");

  const sets = ownerSets(h);
  assert.deepEqual(sets.main, ["map-b"], "the moved tab left the main instance's set");
  assert.deepEqual(sets.views, [["map-a"]], "and belongs to the window that opened for it");
  assert.deepEqual(railTabTitles(h).length, 1, "the main window's rail redrew without it");
  assert.equal(h.run(`getActiveDocumentTab("docMap", getActiveProject(), "main")?.id`), "map-b", "the main instance kept an active tab");
  assert.ok(h.run("window.__deskSaves") > 0, "the move asks the desk to save: it is a project write like any other");
});

nodeTest("Merge All Windows brings a second window's tabs back and closes it", async () => {
  const h = docMapDesk();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  await h.run(`openWindow("docMap")`);
  await h.run(`focusWindow(getWindow("docMap"))`);
  await h.run(`dispatchCommand("move-tab-to-new-window")`);
  assert.equal(ownerSets(h).main.length, 1, "one tab was moved out first");

  const outcome = await h.run(`dispatchCommand("merge-all-windows")`);
  assert.equal(outcome.status, "success", "the row was available and its command ran");
  const sets = ownerSets(h);
  assert.deepEqual(sets.views.filter((held) => held.length > 0), [], "no second window of the kind holds a tab any more");
  assert.equal(h.run(`document.querySelectorAll('.window[data-window="docMap"][data-window-instance]:not(.is-hidden)').length`), 0, "the window it held is closed");
  assert.deepEqual(sets.main.sort(), ["map-a", "map-b"], "both tabs are the main instance's again");
  assert.equal(railTabTitles(h).length, 2, "and the rail draws them both");
});

nodeTest("closing a second window drops the tabs it held — Merge is the way back", async () => {
  const h = docMapDesk();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  await h.run(`ensureLazySystemModule("app/features/window-tabs.js", "AISystem6WinTabs")`);
  await h.run(`openWindow("docMap")`);
  await h.run(`focusWindow(getWindow("docMap"))`);
  await h.run(`dispatchCommand("move-tab-to-new-window")`);
  const held = ownerSets(h).views[0][0];
  assert.equal(held, "map-a", "the second window holds the moved tab");

  // §4.2's ruling: the set goes with the window. The tab is only "where this
  // document is open", so the record goes and the document stays in the project.
  await h.run(`closeWindow("docMap", false, document.querySelector('.window[data-window="docMap"][data-window-instance]').dataset.windowInstance)`);
  const after = JSON.parse(h.run(`JSON.stringify({
    tabs: getDocumentTabs("docMap", getActiveProject()).map((tab) => tab.id),
    main: getWindowDocumentTabs("docMap", getActiveProject(), "main").map((tab) => tab.id),
  })`));
  assert.equal(after.tabs.includes(held), false, "the tab record went with the window");
  assert.deepEqual(after.main, ["map-b"], "and main did not quietly collect it — Merge All Windows is the way back");
});

// --- (d) executing: dragging a tab OUT of the rail --------------------------
// §4.2's gesture, preview half. The rail's two landings mean different things —
// a sibling tab reorders, anywhere outside the rail opens a window — so the
// preview has to tell them apart, and it has to do it without touching anything.
// The VM's dispatchEvent does not bubble, so the drag is driven the way the
// document-level listeners see it: on the element for the rail's own handler,
// on the document for the preview's.
nodeTest("dragging a tab out of the rail previews a window and writes nothing", async () => {
  const h = docMapDesk();
  await h.settleBoot();
  await h.run(`openWindow("docMap")`);
  await h.run(`focusWindow(getWindow("docMap"))`);
  await h.run(`renderDocMapTabs()`);
  // The desk saves on its own for plenty of reasons (opening a window among
  // them), so the counter the preview is judged by starts here, not at boot.
  await h.run(`window.__deskSaves = 0`);

  const preview = JSON.parse(h.run(`(function () {
    const strip = document.querySelector("#docmap-tabs");
    const wrap = strip.querySelector(".tdi-tab-wrap");
    const tab = strip.querySelector(".tdi-tab");
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData() {}, getData() { return "map-a"; } };
    const dragEvent = (type, target) => ({
      type, dataTransfer, target, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    });
    const desktop = document.querySelector(".desktop");
    const state = () => ({
      armed: desktop.classList.contains("drop-target"),
      highlighted: desktop.classList.contains("is-dragging"),
      label: desktop.dataset.dropLabel || "",
    });
    wrap.dispatchEvent(dragEvent("dragstart", wrap));
    const afterStart = state();
    // Over the rail: the landing is the sibling reorder, so no overlay and the
    // desk does not claim the drop.
    const overRailEvent = dragEvent("dragover", tab);
    document.dispatchEvent(overRailEvent);
    const overRail = state();
    // Outside the rail: this is the window landing, and it says so.
    const outsideEvent = dragEvent("dragover", document.body);
    document.dispatchEvent(outsideEvent);
    const outside = state();
    // A drop that ends the drag, with nothing written on the way.
    document.dispatchEvent(dragEvent("drop", document.body));
    document.dispatchEvent(dragEvent("dragend", wrap));
    return JSON.stringify({
      afterStart, overRail, outside, afterEnd: state(),
      overRailClaimed: overRailEvent.defaultPrevented,
      outsideClaimed: outsideEvent.defaultPrevented,
      saves: window.__deskSaves,
      instances: document.querySelectorAll('.window[data-window="docMap"][data-window-instance]').length,
      main: getWindowDocumentTabs("docMap", getActiveProject(), "main").map((tab) => tab.id),
    });
  })()`));

  assert.equal(preview.afterStart.armed, true, "the desk is armed as a drop target while a tab is in flight");
  assert.equal(preview.afterStart.highlighted, false, "but not highlighted over the rail");
  assert.equal(preview.overRailClaimed, false, "a sibling landing keeps the drop — the rail's own reorder answers it");
  assert.equal(preview.overRail.highlighted, false, "and does not light the desk up");
  assert.equal(preview.outsideClaimed, true, "outside the rail the desk claims the drop");
  assert.equal(preview.outside.highlighted, true, "and lights up");
  assert.equal(preview.outside.label.length > 0, true, "with the overlay naming what letting go here does");
  assert.equal(preview.afterEnd.armed, false, "the drag ending clears the overlay");
  assert.equal(preview.afterEnd.highlighted, false, "all of it");
  assert.equal(preview.saves, 0, "the preview wrote nothing to the desk");
  assert.equal(preview.instances, 0, "and opened no window");
  assert.deepEqual(preview.main, ["map-a", "map-b"], "the tabs are where they were");
});

// --- (e) executing: the action behind the preview ----------------------------
// The same drag, carried through: letting go outside the rail moves the tab it
// was carrying into a window of its own — and letting go ON the rail still
// reorders, which is the landing the preview refused to take.
nodeTest("letting go outside the rail moves the dragged tab into a window of its own", async () => {
  const h = docMapDesk();
  await h.settleBoot();
  await h.run(`openWindow("docMap")`);
  await h.run(`focusWindow(getWindow("docMap"))`);
  await h.run(`renderDocMapTabs()`);
  await h.run(`window.__deskSaves = 0`);

  h.run(`(function () {
    const wrap = [...document.querySelectorAll("#docmap-tabs .tdi-tab-wrap")][1];
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData() {}, getData() { return "map-b"; } };
    const dragEvent = (type, target) => ({
      type, dataTransfer, target, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    });
    wrap.dispatchEvent(dragEvent("dragstart", wrap));
    document.dispatchEvent(dragEvent("dragover", document.body));
    document.dispatchEvent(dragEvent("drop", document.body));
  })()`);

  // The window opens during the verb's own work; the tab changes hands right
  // after it, so the wait is for the hand-over rather than for the window.
  await h.waitFor(() => h.run(`getWindowDocumentTabs("docMap", getActiveProject(), "main").length`) === 1);
  const sets = ownerSets(h);
  assert.deepEqual(sets.main, ["map-a"], "the dragged tab left the main instance's set");
  assert.deepEqual(sets.views, [["map-b"]], "and belongs to the window that opened for it — the one that was dragged, not the active one");
  assert.equal(h.run(`getActiveDocumentTab("docMap", getActiveProject(), "main")?.id`), "map-a", "the main instance kept its active tab");
  await h.waitFor(() => railTabTitles(h).length === 1);
  assert.deepEqual(railTabTitles(h).length, 1, "and its rail redrew without the tab that left");
  assert.ok(h.run("window.__deskSaves") > 0, "the drop is a project write like the command's own move");
});

nodeTest("letting go on the rail still reorders, and opens nothing", async () => {
  const h = docMapDesk();
  await h.settleBoot();
  await h.run(`openWindow("docMap")`);
  await h.run(`focusWindow(getWindow("docMap"))`);
  await h.run(`renderDocMapTabs()`);

  h.run(`(function () {
    const wraps = [...document.querySelectorAll("#docmap-tabs .tdi-tab-wrap")];
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData() {}, getData() { return "map-a"; } };
    const dragEvent = (type, target) => ({
      type, dataTransfer, target, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    });
    wraps[0].dispatchEvent(dragEvent("dragstart", wraps[0]));
    document.dispatchEvent(dragEvent("dragover", document.body));
    // Let go on the sibling instead: the rail's own drop handler owns this one.
    wraps[1].dispatchEvent(dragEvent("drop", wraps[1]));
    document.dispatchEvent(dragEvent("dragend", wraps[0]));
  })()`);
  await h.settleBoot();

  assert.equal(h.run(`document.querySelectorAll('.window[data-window="docMap"][data-window-instance]').length`), 0, "no window was opened");
  const sets = ownerSets(h);
  assert.deepEqual(sets.main.sort(), ["map-a", "map-b"], "both tabs are still the main instance's");
  // The sibling landing is the reorder the rail always had: the dragged tab
  // takes the target's place, so the other one comes first.
  assert.deepEqual(railTabTitles(h).map((title) => title.includes("Map A")), [false, true], "and the drop on the sibling reordered them");
});

test.finish();
