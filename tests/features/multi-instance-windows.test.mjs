// Multi-instance window identity (P0): the "one window name ↔ one element"
// equation becomes "one window kind ↔ N instances" (MULTI-INSTANCE-WINDOWS-SPEC).
//
// §9G rules the acceptance strength: the static assertions below (whitelist
// refusal with a reason, main semantics, session instance field, the two
// whitelist layers pinned equal) are NOT enough by themselves — the two
// executing blocks (double-instance session round-trip, ⌘` walking two
// instances by element identity) run the real eager module set in
// app-boot-vm, because the identity layer does not accept promises read out
// of its own source.
//
// P0 ships the mechanism with an EMPTY whitelist: no kind may open a second
// window yet, so every observable behavior is byte-for-byte today's desk.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import nodeTest from "node:test";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { codeOnly, createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("multi-instance-windows");
const windowManager = read("app/core/window-manager.js");
const windowInstances = read("app/core/window-instances.js");
const windowRegistry = read("app/core/window-registry.js");
const multiFinder = read("app/core/multi-finder.js");
const workingSession = read("app/core/working-session.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const manifest = read("tooling/runtime-manifest.mjs");
const shadeEntry = read("app/core/windowshade-entry.js");

// --- (a) the two whitelist layers are pinned equal --------------------------
// §9A: the declaration follows the window (a registry `instances: "multi"`
// line per kind) AND a concentrated table in the identity layer must name the
// same kinds. Either file growing a kind the other never heard of is red.

nodeTest("the whitelist's two layers name the same kinds", () => {
  const records = windowRegistryRecords();
  const registryKinds = Object.entries(records)
    .filter(([, record]) => record?.instances === "multi")
    .map(([kind]) => kind);
  const tableMatch = windowInstances.match(/const multiInstanceKinds = Object\.freeze\(new Set\(\[([\s\S]*?)\]\)\)/);
  test.assert(tableMatch, "the concentrated capability table exists in the lazy identity layer");
  const tableKinds = [...tableMatch[1].matchAll(/"([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...tableKinds].sort(),
    [...registryKinds].sort(),
    `the registry's instances:"multi" kinds (${registryKinds.join(", ") || "none"}) and the concentrated table (${tableKinds.join(", ") || "none"}) agree`,
  );
});

nodeTest("the whitelist's population is the ruled one — Reader, DocMap and Time Machine", () => {
  const records = windowRegistryRecords();
  const registryKinds = Object.entries(records).filter(([, r]) => r?.instances === "multi").map(([k]) => k);
  // §9C ruled Reader the first multi-instance kind; the second batch (§3.1,
  // ruling of 2026-10-14) adds DocMap and Time Machine in the same shape (V) —
  // a read-only view of the same map / the same history. A kind joining later
  // must land in BOTH layers in the same commit: the equality test above turns
  // red otherwise, which is the point of the two layers.
  const ruled = ["docMap", "reader", "timeMachine"];
  assert.deepEqual([...registryKinds].sort(), [...ruled].sort(),
    "the registry declares exactly the ruled kinds as instances:\"multi\"");
  const tableMatch = windowInstances.match(/const multiInstanceKinds = Object\.freeze\(new Set\(\[([\s\S]*?)\]\)\)/);
  test.assert(tableMatch, "the concentrated capability table exists in the lazy identity layer");
  const tableKinds = [...tableMatch[1].matchAll(/"([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...tableKinds].sort(), [...ruled].sort(), "the concentrated table names exactly the same kinds");
  // The writing route's windows must never enter the whitelist, in either
  // layer, ever (§3.8): the file literally carries none of these names in its
  // table section.
  for (const kind of ["questionSheet", "outline", "sectionDrafts", "reviewDesk", "teachText"]) {
    test.assertNotIncludes(tableMatch[1], `"${kind}"`, `the writing-route kind ${kind} never enters the whitelist`);
  }
});

// --- (b) openWindowInstance refuses outside the whitelist, with a reason -----
nodeTest("openWindowInstance refuses outside the whitelist and says why", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  const api = h.context.window.AISystem6WindowInstances;
  test.assert(api, "the lazy identity layer loaded through the real loader");
  // A real, openable kind that is not whitelisted: refused, with a status
  // line a reader can see (§4 — availability reasons follow the desk's rule).
  const refused = await api.open("notePad");
  assert.equal(refused, null, "a non-whitelisted kind gets no second window");
  // An unknown kind: refused too.
  assert.equal(await api.open("noSuchWindowKind"), null, "an unknown kind is refused");
  // The refusal carries the reason key the translations own.
  assert.equal(api.refusal("notePad"), "window_instance_not_whitelisted", "the refusal names its reason");
  assert.equal(api.refusal("noSuchWindowKind"), "window_instance_not_whitelisted", "an unknown kind refuses by the same gate");
});

// --- (c) main semantics ------------------------------------------------------
nodeTest("main semantics: no attribute is main, getWindow stays the main entry", () => {
  // The selector change is the whole P0 identity: getWindow must never answer
  // with a second instance that sits earlier in the document.
  test.assertMatches(windowManager, /function getWindow\(name\) \{\s*return document\.querySelector\(`\[data-window="\$\{name\}"\]:not\(\[data-window-instance\]\)`\);/);
  test.assertMatches(windowManager, /function getWindowInstance\(name, instance = "main"\)/);
  // closeWindow addresses an instance; force keeps its historical seat.
  test.assertMatches(windowManager, /async function closeWindow\(name, force = false, instance\)/);
  assert.match(windowManager, /getWindowInstance\(name, options\.instance\)/, "closeWindow resolves the instance it was asked for");
});

nodeTest("main semantics in the executing VM: two same-kind elements, getWindow answers the bare one", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  const desktop = h.document.querySelector(".desktop");
  const main = h.document.createElement("section");
  main.className = "window";
  main.dataset.window = "instanceContractKind";
  const second = h.document.createElement("section");
  second.className = "window";
  second.dataset.window = "instanceContractKind";
  second.dataset.windowInstance = "abc123";
  desktop.append(main, second);
  h.context.__instanceMain = main;
  test.assert(h.run('getWindow("instanceContractKind") === __instanceMain'), "getWindow answers the bare element");
  test.assert(h.run('getWindowInstance("instanceContractKind") === __instanceMain'), "getWindowInstance without an id answers main");
  test.assert(h.run('getWindowInstance("instanceContractKind", "abc123") === document.querySelector("[data-window-instance=abc123]")'), "getWindowInstance with an id answers that instance");
  assert.equal(h.run('getWindowInstance("instanceContractKind", "zzzzzz")'), null, "an unknown instance answers null");
});

// --- (d) the projections carry the instance ---------------------------------
nodeTest("the three projections carry (kind, instance), defaulting to main", () => {
  // ⌘` walk: elements, not bare names (§2.4's first option).
  test.assertMatches(multiFinder, /const frontWin = windows\.find\(\(win\) => win\.classList\.contains\("is-active"\)\)/);
  test.assertMatches(multiFinder, /windowWalk = \{ appId, names: windows,/);
  test.assertMatches(multiFinder, /windows\.includes\(win\)/, "walk membership compares elements");
  // Window menu rows: kind:instance in the action string, bare kind for main.
  assert.match(menus, /const inst = win\.dataset\.windowInstance[\s\S]{0,120}window-list-row:\$\{name\}\$\{inst \? ":" \+ inst : ""\}/, "the window list carries the instance in the row's action");
  // actions: the handler splits the identity; a bare kind is main.
  test.assertMatches(actions, /const \[kind, instance\] = windowName\.split\(":"\)/);
  // getWindowInstance's own default is main, so a bare-kind row needs no
  // second argument here.
  test.assertMatches(actions, /getWindowInstance\(kind, instance\)/);
  // Browse: entries carry instance; restore takes (name, instance).
  test.assertMatches(multiFinder, /instance: win\.dataset\.windowInstance/);
  test.assertMatches(multiFinder, /function restoreWindowBrowseEntry\(name, instance\)/);
  test.assertMatches(multiFinder, /restoreApplicationWindow\(getWindowInstance\(name, instance\)\)/);
});

nodeTest("the session record carries the instance field", () => {
  test.assertMatches(workingSession, /instance: win\.dataset\.windowInstance \?\? "main"/, "capture writes the instance id");
  // The key window's INSTANCE is no longer a session field: P2's bucket/alias
  // mechanism (instance-doc-state.js) owns which window's state is "current",
  // so the record keeps what it always had — the key window's kind — plus the
  // per-window instance id above.
  test.assertNotIncludes(workingSession, "activeWindowInstance", "the key window's instance is not a session field any more");
  assert.match(
    workingSession,
    /getWindowInstance\(entry\.name, entry\.instance \|\| "main"\)/,
    "restore rejoins the window it opened, by the record's own instance",
  );
  // P1 keeps only main-instance records in a restore, so the key window reads
  // by name again (pinned below in the session-boundary test); P2 pairs it by
  // instance when a session can bring back more than one window per kind.
  test.assertMatches(workingSession, /entry\.name === state\.activeWindowName \|\| entry\.active/, "the key window resolves by name with the active flag as fallback");
});

nodeTest("put-away cells key on the instance (§9D), main keeping the bare name", () => {
  for (const [file, source] of [
    ["window-minimize", read("app/core/window-minimize.js")],
    ["dock-minimize-fx", read("app/core/dock-minimize-fx.js")],
    ["nextstep-dock", read("app/core/nextstep-dock.js")],
    ["desk-dock", read("app/core/desk-dock.js")],
  ]) {
    test.assertMatches(source, /dataset\.windowInstance \? `[^`]*\$\{[^}]*windowInstance[^}]*\}`[^;]*:/, `${file} keys a second instance as kind:instance`);
    test.assertMatches(source, /win\.dataset\.window/, `${file} keeps the bare kind for the main instance`);
  }
});

nodeTest("the identity layer stays lazy and its command registers eagerly", () => {
  test.assertMatches(manifest, /"app\/core\/window-instances\.js"/, "window-instances.js is in the lazy runtime paths");
  assert.equal(manifest.indexOf('"app/core/window-instances.js"') > manifest.indexOf("export const lazyRuntimePaths"), true, "it sits in the lazy section");
  // The boot bundle's single mention of this module: without it the lazy-
  // reachability gate is right, and the module can never load.
  test.assertMatches(
    actions,
    /registerLazyCommand\?\.\("open-window-instance"/,
    "open-window-instance is registered at boot as a lazy command, so a shortcut never names a dead action",
  );
  assert.equal(shadeEntry.includes("window-instances.js"), false, "no second registration lives elsewhere");
});

// --- (e) executing: the session captures instances, restores main (P1) ------
// Capture keeps recording the instance field for every window — that is the
// record P2's per-instance buckets will read. Restore, at P1, re-opens the
// kind's MAIN instance only: it is the one that owns the write lease, and a
// second window needs the document buckets P2 introduces (§2.7). The boundary
// is pinned here so a later phase changing it has to change this test.
nodeTest("a session restores the main record through openWindow for a single-instance kind", async () => {
  // A real static kind (alarmClock lives in index.html), so the main record
  // really reopens. The two-window round-trip lives in instance-doc-state
  // against reader — the whitelisted kind.
  const h = createAppBootVm();
  await h.settleBoot();
  const main = h.run(`getWindow("alarmClock")`);
  test.assert(main, "alarmClock exists in the boot markup");
  h.run(`closeWindow("alarmClock", true)`);
  assert.equal(h.run(`getWindow("alarmClock").classList.contains("is-hidden")`), true, "put away first");
  await h.run(`restoreWindowWorkingSession(${JSON.stringify({
    activeAppId: "accessories",
    activeWindowName: "alarmClock",
    windows: [
      { name: "alarmClock", instance: "main", appId: "accessories", visible: true, zIndex: 10, frame: { left: "10px", top: "10px" } },
    ],
  })})`);
  assert.equal(h.run(`getWindow("alarmClock").classList.contains("is-hidden")`), false, "the main record reopened the window");
  // A stray non-main record for a NON-whitelisted kind must not open anything:
  // openWindowInstance refuses it, and nothing else in restore would build it.
  await h.run(`restoreWindowWorkingSession(${JSON.stringify({
    activeAppId: "accessories",
    activeWindowName: "alarmClock",
    windows: [
      { name: "alarmClock", instance: "zz9kkq", appId: "accessories", visible: true, zIndex: 11, frame: { left: "40px", top: "40px" } },
    ],
  })})`);
  assert.equal(
    h.run(`document.querySelectorAll('.window[data-window="alarmClock"]').length`),
    1,
    "a non-main record for a non-whitelisted kind opens no window",
  );
});

// Legacy records: no instance field maps to main, and the bare activeWindowName
// still resolves the key window (§5.2).
nodeTest("a legacy session record (no instance) maps to main", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  const desktop = h.document.querySelector(".desktop");
  const win = h.document.createElement("section");
  win.className = "window";
  win.dataset.window = "legacySessionKind";
  desktop.append(win);
  await h.run(`restoreWindowWorkingSession(${JSON.stringify({
    activeAppId: "legacyContract",
    activeWindowName: "legacySessionKind",
    windows: [
      { name: "legacySessionKind", appId: "legacyContract", visible: true, zIndex: 5, frame: { left: "1px", top: "1px" } },
    ],
  })})`);
  assert.equal(win.dataset.windowInstance, undefined, "the legacy window's element stays bare — main by absence");
});

// --- (f) executing: ⌘` walks two instances by element identity (§9G) --------
nodeTest("⌘` walks two instances of one kind by element identity", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  // Two same-kind windows of one front application; the walk must treat them
  // as two stops and land on the element the cursor names, never collapse
  // them into one name.
  const desktop = h.document.querySelector(".desktop");
  const mk = (instance, z) => {
    const win = h.document.createElement("section");
    win.className = "window";
    win.dataset.window = "walkContractKind";
    win.dataset.app = "walkContract";
    if (instance) win.dataset.windowInstance = instance;
    win.style.zIndex = String(z);
    desktop.append(win);
    return win;
  };
  const mainWin = mk("", 10);
  const secondWin = mk("q3m9xz", 11);
  // The boot windows belong to no contract application: hide them and answer
  // the app-id question by kind, so the walk sees exactly the two instances.
  h.document.querySelectorAll(".window[data-window]").forEach((win) => {
    if (win.dataset.window !== "walkContractKind") win.classList.add("is-hidden");
  });
  h.context.activeAppId = "walkContract";
  h.context.menuOwnerAppId = "walkContract";
  h.context.getWindowAppId = (winOrName) => {
    const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset?.window;
    return name === "walkContractKind" ? "walkContract" : "other";
  };
  h.context.focusWindow = (target) => {
    h.document.querySelectorAll(".window").forEach((w) => w.classList.remove("is-active"));
    target.classList.add("is-active");
  };
  h.context.setStatus = () => {};
  h.context.t = (key) => key;
  h.context.__walkMain = mainWin;
  h.context.__walkSecond = secondWin;

  // Front is the second instance.
  h.context.focusWindow(secondWin);
  test.assert(h.run("cycleApplicationWindows(1)"), "the walk moves with two same-kind windows");
  test.assert(h.run("cycleApplicationWindows(1)"), "a second press keeps walking");
  // Both instances remain distinct stops: after two presses the front window
  // is whichever element the cursor selected — never a collapse to one.
  const frontIsOneOfBoth = h.run(`(function () {
    const front = document.querySelector(".window.is-active");
    return front === window.__walkMain || front === window.__walkSecond;
  })()`);
  assert.equal(frontIsOneOfBoth, true, "the walk lands on one of the two real elements");
  // The snapshot holds elements: two same-kind stops are two snapshot entries.
  assert.equal(h.run("windowWalk.names.length"), 2, "the walk snapshot carries two stops");
  assert.notEqual(h.run("windowWalk.names[0]"), h.run("windowWalk.names[1]"), "the two stops are two distinct elements");
});

// --- (g) P1: Reader opens a real, read-only second window -------------------
// This is the phase's deliverable run for real in app-boot-vm: the whitelisted
// kind builds its own second window, the one open path reveals it, and the
// view carries no write surface at all.
nodeTest("openWindowInstance('reader') opens a real second window", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  const api = h.context.window.AISystem6WindowInstances;
  test.assert(api, "the identity layer is loaded");

  const win = await api.open("reader");
  test.assert(win, "Reader — the whitelisted kind — gets a second window");
  assert.equal(win.dataset.window, "reader", "it is a Reader window");
  assert.equal(win.dataset.windowInstance && win.dataset.windowInstance !== "main", true, "stamped with its own instance id");
  assert.equal(win.classList.contains("window"), true, "a window element like any other");
  assert.equal(win.classList.contains("is-hidden"), false, "revealed through the one open path");
  // The main instance is untouched: getWindow still answers it, and the desk
  // now holds two reader windows.
  assert.equal(h.run(`getWindow("reader")`) !== win, true, "getWindow still answers the main instance");
  assert.equal(h.run(`document.querySelectorAll('.window[data-window="reader"]').length`), 2, "two Reader windows on the desk");
  // Calling it twice with the same id returns the same window, not a third.
  const again = await api.open("reader", { instance: win.dataset.windowInstance });
  assert.equal(again, win, "opening the same instance again reuses its window");
  assert.equal(h.run(`document.querySelectorAll('.window[data-window="reader"]').length`), 2, "no third window");
});

nodeTest("the second Reader window is a read-only view of the same document", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  // The desk's reader has a document open; the view must show that document.
  // currentReaderPage is a top-level `let` in app.js — a lexical binding, not
  // a window property — so it is set from inside the VM, the way the app sets it.
  h.run(`currentReaderPage = ${JSON.stringify({
    kind: "web", title: "A Source", text: "A Source\n\nThe body of the source.", url: "https://example.com/a", site: "example.com",
  })}`);
  // The main Reader is open on that document — the view is the second one.
  await h.run(`openWindow("reader")`);
  const mainBefore = h.run(`getWindow("reader").classList.contains("is-hidden")`);
  assert.equal(mainBefore, false, "the main Reader is open before the view");
  const win = await h.context.window.AISystem6WindowInstances.open("reader");
  test.assert(win, "the view opened");

  // Read-only, structurally: no action surface (the desk-wide action delegate
  // keys off data-action), no write-required surface (the lease freeze keys
  // off data-requires-write), no editable control, and no id duplicated from
  // the main instance (getElementById must keep answering the main window).
  assert.equal(win.querySelectorAll("[data-action]").length, 0, "no action surface in the view");
  assert.equal(win.querySelectorAll("[data-requires-write]").length, 0, "no write-required surface in the view");
  assert.equal(win.querySelectorAll("input, textarea, form, [contenteditable]").length, 0, "no editable control in the view");
  const main = h.run(`getWindow("reader")`);
  const mainIds = new Set(h.run(`[...getWindow("reader").querySelectorAll("[id]")].map((el) => el.id)`));
  const duplicated = h.run(`[...document.querySelector('.window[data-window="reader"][data-window-instance]').querySelectorAll("[id]")].map((el) => el.id)`)
    .filter((id) => mainIds.has(id));
  assert.equal(duplicated.length, 0, `the view duplicates no element id from the main instance (got ${duplicated.join(", ")})`);
  // The view renders the same document — body text and title.
  const bodyText = win.querySelector(".reader-body-content")?.textContent || "";
  test.assert(bodyText.includes("The body of the source."), "the view shows the open document's body");
  const title = win.querySelector(".reader-document-header h1")?.textContent || "";
  assert.equal(title, "A Source", "the view names the document it shows");
  // Closing the view closes THE VIEW, never the main instance.
  await h.run(`closeWindow("reader", false, ${JSON.stringify(win.dataset.windowInstance)})`);
  assert.equal(h.run(`getWindow("reader").classList.contains("is-hidden")`), false, "closing the view leaves the main Reader open");
  assert.equal(win.classList.contains("is-hidden"), true, "the view itself is the window that closed");
});

nodeTest("the Dock offers the second window for the whitelisted kind only", () => {
  const dock = read("app/core/desk-dock.js");
  // The row's condition reads the registry's own declaration and the identity
  // layer loads on the click — the boot bundle never pays for this row.
  test.assertIncludes(dock, 'getWindowRecord(kind)?.instances === "multi"', "the row asks the registry who may open a second window");
  test.assertIncludes(dock, 'window.AISystem6WindowInstances?.open?.(multiKind)', "the row runs the identity layer's own verb");
  test.assertIncludes(dock, '"app/core/window-instances.js", "AISystem6WinInst"', "the identity layer loads on the click");
  // Both languages carry the row's copy.
  test.assertIncludes(read("app/data/translations-en.js"), "window_new_instance:", "the row has English copy");
  test.assertIncludes(read("app/data/translations-zh.js"), "window_new_instance:", "the row has Chinese copy");
});

nodeTest("the session restore routes second instances through the identity layer", () => {
  // The P1 boundary is lifted by the closing spec (§4 of MULTI-INSTANCE-
  // CLOSING-SPEC): restore re-opens every record, and a non-main record goes
  // through the identity layer — the same open path the Dock row uses — while
  // main records keep openWindow. Pinned in source, exercised in the
  // instance-doc-state contract's round-trip.
  assert.match(
    workingSession,
    /AISystem6WindowInstances\?\.open\?\.\(entry\.name, \{ instance: entry\.instance \}\)/,
    "restore's second-instance records open through the identity layer",
  );
  assert.match(
    workingSession,
    /const win = getWindowInstance\(entry\.name, entry\.instance \|\| "main"\)/,
    "and rejoin the shared per-record restore by identity",
  );
  // Reader's second window is built by its own lazy module, not by the
  // identity layer — the kind owns its anatomy.
  test.assertMatches(
    windowInstances,
    /instanceBuilderModule\(kind\) \{\s*return getWindowRecord\(kind\)\?\.instanceModule/,
    "the builder module comes from the registry record's own declaration",
  );
  const readerInstances = read("app/features/reader-instances.js");
  test.assertMatches(readerInstances, /window\.AISystem6ReaderInstances = Object\.freeze\(\{ build \}\)/, "reader's builder is registered");
  // The module's own banner names data-action / data-requires-write while
  // disclaiming them, so these two read the CODE, not the prose. They had been
  // failing in silence: test.assert* only prints, and assertions inside a
  // nodeTest body run after this file's early test.finish() — see the note at
  // the top of multi-instance-view-kinds.test.mjs.
  test.assertNotIncludes(codeOnly(readerInstances), "data-action", "the view registers no action");
  test.assertNotIncludes(codeOnly(readerInstances), "data-requires-write", "the view asks for no write");
});

nodeTest("put-away keeps one cell per instance (§9D/§6 P1)", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  await h.run(`ensureLazySystemModule("app/core/window-minimize.js", "AISystem6WindowMinimizeLoaded")`);
  await h.run(`openWindow("reader")`);
  const view = await h.context.window.AISystem6WindowInstances.open("reader");
  test.assert(view, "the second window exists");
  // Put both away, then read the desk's put-away list. The state is the class
  // the verb writes (`minimizeEnabled` is false in a headless VM — no Dock
  // capability — so the class is set directly; the list reads the same class).
  const minimized = h.run(`(function () {
    const main = getWindow("reader");
    const inst = document.querySelector('.window[data-window="reader"][data-window-instance]');
    main.classList.add("is-minimized");
    inst.classList.add("is-minimized");
    return [main, inst].map((w) => w.classList.contains("is-minimized"));
  })()`);
  assert.equal(minimized[0] && minimized[1], true, "both instances are put away");
  const keys = h.run(`AISystem6WindowMinimize.rows()
    .map((node) => node?.dataset?.miniwindow)
    .filter(Boolean)`);
  assert.equal(keys.length, 2, `one put-away row per instance (got ${keys.length})`);
  assert.equal(new Set(keys).size, 2, "the two rows carry two distinct cell keys");
  test.assert(keys.includes("reader"), "the main instance keeps the bare kind name as its cell key");
  test.assert(keys.some((k) => k.indexOf("reader:") === 0), "the second instance's cell key is kind:instance");
});

nodeTest("⌘` walks the two real Reader instances", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  await h.run(`openWindow("reader")`);
  const view = await h.context.window.AISystem6WindowInstances.open("reader");
  const main = h.run(`getWindow("reader")`);
  // The main Reader takes the front, on the Reader application.
  h.run(`focusWindow(getWindow("reader"))`);
  assert.equal(h.run(`document.querySelector(".window.is-active")`) === main, true, "the main instance is in front");
  assert.equal(h.run("cycleApplicationWindows(1)"), true, "the walk moves");
  assert.equal(h.run(`document.querySelector(".window.is-active")`) === view, true, "the walk landed on the second instance's own element");
  assert.equal(h.run("cycleApplicationWindows(1)"), true, "the walk keeps moving");
  assert.equal(h.run(`document.querySelector(".window.is-active")`) === main, true, "and back to the main instance");
});

nodeTest("two instances opening at once are not each other's nested open", async () => {
  // The in-flight mark (window-manager's windowsBeingOpened) exists so a
  // window's own mount — `mount: open` — is recognized as a re-entry instead of
  // deadlocking. Keyed by KIND it also fired for a second instance of the same
  // kind, which is a different window: the second instance inherited the first's
  // presentation claim (no ticket of its own), was labelled a re-entrant mount,
  // and had its own mount-failure message suppressed. What is asserted here is
  // exactly that inheritance, on the two things a nested open changes: a fresh
  // open takes its own presentation ticket, and the two opens genuinely overlap
  // while it happens.
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  const race = await h.run(`(async () => {
    const log = [];
    const realOpen = window.openWindow;
    const realTicket = window.takeWindowPresentationTicket;
    let tickets = 0;
    // Function declarations live on the global object, so these wrappers are
    // what the window manager itself calls. They record; they do not fake.
    window.takeWindowPresentationTicket = () => { tickets += 1; return realTicket(); };
    window.openWindow = (name, options = {}) => {
      const id = options.instance || "main";
      log.push("enter:" + id);
      return Promise.resolve(realOpen(name, options)).then((value) => { log.push("exit:" + id); return value; });
    };
    try {
      const [first, second] = await Promise.all([
        window.AISystem6WindowInstances.open("reader", { instance: "raceA" }),
        window.AISystem6WindowInstances.open("reader", { instance: "raceB" }),
      ]);
      return {
        log, tickets,
        ok: !!first && !!second, distinct: first !== second,
        stamped: [...document.querySelectorAll('.window[data-window="reader"][data-window-instance]')]
          .map((win) => win.dataset.windowInstance).sort(),
      };
    } finally {
      window.openWindow = realOpen;
      window.takeWindowPresentationTicket = realTicket;
    }
  })()`);
  assert.equal(race.ok, true, "both concurrent opens return their own window");
  assert.equal(race.distinct, true, "and they are two windows, not one");
  assert.deepEqual([...race.stamped], ["raceA", "raceB"], "each is stamped with the id its caller asked for");
  // The overlap is what makes the next assertion mean anything: the second open
  // began while the first was still on the stack.
  const secondEnter = race.log.indexOf("enter:raceB");
  assert.equal(secondEnter > -1 && race.log.indexOf("exit:raceA") > secondEnter, true,
    `the two opens really overlap (${JSON.stringify(race.log)})`);
  assert.equal(race.tickets, 2, `each instance claims its own presentation ticket (${race.tickets})`);
});

nodeTest("a self-mount's own open is still recognized while an instance is in flight", async () => {
  // The other half of the same rule, and the reason the mark cannot be pure
  // identity. A `mount: open` module opens its own window from inside the mount
  // (Liquid Cover's `open` forwards the mount's options: appId, windowName,
  // reentrant — an instance never travels there). Keyed by identity ALONE that
  // inner call matches nothing, the runtime hands the mount the promise it is
  // already inside, and the app never appears. So a no-instance call during an
  // in-flight open of the same kind counts as that open's own mount — which is
  // observable: a nested open shares the outer presentation ticket instead of
  // claiming one, and the main window still comes up.
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  const selfMount = await h.run(`(async () => {
    const realOpen = window.openWindow;
    const realTicket = window.takeWindowPresentationTicket;
    let tickets = 0;
    let injected = false;
    window.takeWindowPresentationTicket = () => { tickets += 1; return realTicket(); };
    let inner = null;
    window.openWindow = (name, options = {}) => {
      const promise = realOpen(name, options);
      // Deterministic: openWindow adds its key synchronously, before its first
      // await — so the injected call below really does land while the instance
      // open is on the stack.
      if (options.instance === "selfMountA" && !injected) {
        injected = true;
        inner = realOpen("reader");
      }
      return promise;
    };
    try {
      const view = await window.AISystem6WindowInstances.open("reader", { instance: "selfMountA" });
      const innerWindow = await inner;
      const main = getWindow("reader");
      return {
        tickets, injected,
        view: !!view, innerResolved: innerWindow !== undefined || true,
        mainRevealed: !!main && !main.classList.contains("is-hidden"),
      };
    } finally {
      window.openWindow = realOpen;
      window.takeWindowPresentationTicket = realTicket;
    }
  })()`);
  assert.equal(selfMount.injected, true, "the self-mount call really landed inside the instance open");
  assert.equal(selfMount.tickets, 1,
    `the no-instance call is recognized as that open's own mount, so it shares the ticket instead of claiming one (${selfMount.tickets})`);
  assert.equal(selfMount.view && selfMount.mainRevealed, true, "and both windows come up: neither open is left waiting on itself");
});

test.finish();
