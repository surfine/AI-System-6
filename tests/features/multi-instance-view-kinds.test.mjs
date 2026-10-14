// Multi-instance view kinds (§3.1, shape (V) — the second batch, 2026-10-14).
//
// Reader's contract (tests/features/multi-instance-windows.test.mjs) proves the
// MECHANISM; this file proves each kind that joined the whitelist afterwards.
// The two layers must name the kind, the kind's builder module must install the
// names the identity layer derives from the kind, and the second window must be
// a real element with no write surface at all — the same acceptance Reader got,
// asked of the new kind rather than assumed from Reader's.
//
// The shared half of that acceptance is written once and run per kind (the view
// kinds table below): stamping, structural read-only, the session round-trip,
// the ⌘` walk and put-away are mechanism facts, and they must hold for every
// kind rather than for the one that was written first. What each kind SHOWS is
// its own test.
//
// §9G rules the acceptance strength: the static assertions are NOT enough by
// themselves. The executing cases below run in app-boot-vm — a real desk, real
// modules — because "two windows of one kind stay two windows" is exactly the
// class of claim that a source-text contract cannot settle.
//
// Two shape rules hold this file above the hole it would otherwise fall into:
// the static checks are TOP-LEVEL (so test.finish() reads their failures), and
// the executing checks assert with the throwing node:assert (so a failure
// reaches the runner's exit code). test.assert* only prints; a contract whose
// failures are only printed passes the gate while proving nothing.

import assert from "node:assert/strict";
import nodeTest from "node:test";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { codeOnly, createFeatureTest, exists, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("multi-instance-view-kinds");
const windowInstances = read("app/core/window-instances.js");
const windowRegistry = read("app/core/window-registry.js");
const manifest = read("tooling/runtime-manifest.mjs");
const dock = read("app/core/desk-dock.js");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

// The whitelist, and where each kind's own module lives. The file names are not
// a mechanical transform of the kind (docmap.js, not docMap.js), so the table is
// explicit and both halves of this contract read it — a kind whose module moved
// fails here rather than in whichever assertion happened to read the old name.
const KIND_MODULES = Object.freeze({
  docMap: "app/features/docmap.js",
  reader: "app/features/reader.js",
  timeMachine: "app/features/time-machine.js",
});
const WHITELIST = Object.keys(KIND_MODULES).sort();

// The second batch (§3.1, ruling of 2026-10-14). Each view keeps the kind's own
// module as the single birthplace of what it draws.
const VIEW_KINDS = [
  {
    kind: "docMap",
    capability: "DocMap",
    module: "app/features/docmap-instances.js",
    titleKey: "docmap_read_only_view",
  },
  {
    kind: "timeMachine",
    capability: "TimeMachine",
    module: "app/features/time-machine-instances.js",
    titleKey: "time_machine_read_only_view",
  },
];

// --- every view kind, the same declarations asked of each -------------------

for (const view of VIEW_KINDS) {
  const builder = read(view.module);
  const code = codeOnly(builder);

  test.assert(
    windowRegistryRecords()[view.kind]?.instances === "multi",
    `the registry declares ${view.kind} as instances:"multi"`,
  );
  test.assert(
    windowRegistryRecords()[view.kind]?.instanceModule === view.module,
    `and names the module that builds its second window`,
  );
  test.assert(windowInstances.includes(`"${view.kind}",`), `the concentrated table names ${view.kind}`);
  // The builder's global and its load flag are DERIVED from the kind, so the
  // identity layer must not name a module of its own by hand any more (§3.2:
  // the registry's two fields are the whole declaration of a second window).
  test.assert(
    windowInstances.includes("instanceBuilderCapability(kind)"),
    "the loader derives the builder's names from the kind",
  );
  test.assertNotIncludes(windowInstances, '"AISystem6ReaderInstancesLoaded"', "no kind's load flag is hardcoded");
  test.assertNotIncludes(windowInstances, "window.AISystem6ReaderInstances?.build", "no kind's global is hardcoded");
  // The derived names are the ones the module really installs — the pair that
  // has to agree, and the pair a rename breaks.
  const global = `AISystem6${view.capability}Instances`;
  test.assertIncludes(builder, `window.${global}Loaded = true`, `${view.kind}'s builder installs the derived load flag`);
  test.assertIncludes(builder, `window.${global} = Object.freeze({ build })`, `${view.kind}'s builder installs the derived global`);
  // Reachable: a lazy module no loader names can never load.
  test.assertIncludes(manifest, `"${view.module}"`, `${view.kind}'s builder sits in the lazy runtime paths`);
  test.assertIncludes(dock, `"${view.kind}"`, `the Dock's second-window row knows ${view.kind}`);
  // The builder is a pure view: no action surface, no write surface, no
  // listener, no command, and no second birthplace for what the kind draws. It
  // renders through the kind's own view entry and opens nothing itself — the
  // identity layer owns the open.
  for (const [needle, message] of [
    ["data-action", `${view.kind}'s builder registers no action`],
    ["data-requires-write", `${view.kind}'s builder asks for no write`],
    ["addEventListener", `${view.kind}'s builder wires no listener`],
    ["registerApplication", `${view.kind}'s builder registers no application`],
    ["registerCommand", `${view.kind}'s builder registers no command`],
    ["openWindow(", `${view.kind}'s builder opens no window of its own`],
  ]) {
    test.assert(!code.includes(needle), message);
  }
  // The kind's own view entry is a window surface, and it is what the builder
  // calls: the transform, the reading text and the labels stay the kind's.
  test.assertIncludes(
    read(KIND_MODULES[view.kind]),
    `window.AISystem6${view.capability}View = Object.freeze({ render:`,
    `${KIND_MODULES[view.kind]} exports its read-only view`,
  );
  test.assertIncludes(builder, `AISystem6${view.capability}View`, `and ${view.kind}'s builder renders through it`);
  // The second window says what it is: the title bar is what tells the two
  // windows of one kind apart on the desk.
  test.assertIncludes(translationsEn, `${view.titleKey}:`, `${view.kind}'s view title has English copy`);
  test.assertIncludes(translationsZh, `${view.titleKey}:`, `${view.kind}'s view title has Chinese copy`);
}

// --- N1's close (§3.2 item 4; the companion to the ruling in §5) ------------
//
// openWindow's no-instance calls match an in-flight open BY KIND. That fallback
// is what keeps a `mount: open` module from deadlocking against its own mount
// (Cover Glass, Quick Draft), and the ruling keeps it — at a price it accepts:
// a second instance's open can read the main instance's in-flight mark as
// nesting. The condition the price rests on is that no WHITELISTED kind
// self-mounts, because those are the kinds whose second window would pay it. So
// the whitelist is enumerated here and every kind is asked directly, instead of
// leaving the answer to whoever remembers the ruling.
const whitelistNow = Object.entries(windowRegistryRecords())
  .filter(([, record]) => record?.instances === "multi")
  .map(([kind]) => kind)
  .sort();
assert.deepEqual(whitelistNow, [...WHITELIST].sort(), "the population this assertion was written for");

// The detector itself, against a module that really does mount its own open:
// liquid-cover.js declares `mount: open` and open() calls openWindow. A check
// that cannot fail proves nothing, so this one is proven to fire first.
test.assert(
  opensItsOwnWindow(read("app/features/liquid-cover.js")),
  "the self-mount detector fires on the module that really self-mounts",
);

for (const kind of WHITELIST) {
  const record = windowRegistryRecords()[kind];
  test.assert(exists(KIND_MODULES[kind]), `${kind}'s module is where this contract looks for it`);
  // 1. No hook of the kind opens a window: an open would arrive back inside the
  //    open path that called the hook.
  for (const [field, value] of Object.entries(record)) {
    if (typeof value !== "string") continue;
    test.assert(!value.includes("openWindow("), `${kind}'s registry ${field} opens no window`);
  }
  // 2. The kind's own module mounts something, and that something does not open
  //    the kind's window (docMap declares no mount at all; reader's and Time
  //    Machine's mounts wire their own elements).
  test.assert(!opensItsOwnWindow(read(KIND_MODULES[kind])), `${kind} does not self-mount`);
}

// --- what each kind's view shows -------------------------------------------

test.assertMatches(
  windowRegistry,
  /onOpen: \(\{ win \} = \{\}\) => \{\s*if \(win\?\.dataset\?\.windowInstance\) return;/,
  "the docMap hook returns early for an instance",
);
test.assertIncludes(
  read("app/features/docmap.js"),
  "window.AISystem6DocMapView = Object.freeze({ render: renderDocMapReadOnly })",
  "docmap.js exports its read-only view under its own name",
);
test.assertIncludes(translationsEn, "time_machine_history:", "the visit trail has English copy");
test.assertIncludes(translationsZh, "time_machine_history:", "the visit trail has Chinese copy");

nodeTest("the second DocMap window is a read-only view of the same map", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  // The desk's DocMap has a map; the view must show that map. currentDocMap is a
  // top-level `let` in app.js — a lexical binding, not a window property — so it
  // is set from inside the VM, the way the app sets it.
  h.run(`currentDocMap = ${JSON.stringify({
    id: "map-1", kind: "docMap", title: "A Map", layout: "right",
    central: { title: "A Map", summary: "the center" },
    nodes: [{ id: "n1", title: "A Branch", summary: "one branch" }],
    edges: [{ from: "central", to: "n1" }],
  })}`);
  const { win } = await openSecondWindow("docMap", h);
  assert.ok(win, "the view opened");
  // Read-only, structurally; and stronger than the duplicate-id check Reader's
  // view gets: this view carries no id at all, so getElementById can only ever
  // answer the main window.
  assertStructuralReadOnly(win);
  assert.equal(win.querySelectorAll("[id]").length, 0, "the view carries no element id");
  // It shows the map: the module's own canvas anatomy, class-for-class. The
  // drawing itself is markmap's, and arrives lazily.
  const svg = win.querySelector(".docmap-markmap-svg");
  assert.ok(svg, "the view carries the map's canvas");
  assert.equal(svg.getAttribute("aria-label"), "A Map", "named for the map it shows");
  assert.equal(svg.style.pointerEvents, "none", "the pointer never reaches the drawing: no fold, no pick, no zoom");
  assert.ok(win.querySelector(".docmap-markmap-frame"), "and the frame it draws in");
  assert.notEqual(
    h.run(`getWindow("docMap").querySelector("h2").textContent`),
    win.querySelector("h2").textContent,
    "the view's title differs from the main instance's",
  );
  await closeViewAndKeepMain(h, "docMap", win);
});

nodeTest("a DocMap view with no map on the desk offers no way to make one", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  h.run(`currentDocMap = null`);
  const { win } = await openSecondWindow("docMap", h);
  assert.ok(win, "a view opens with nothing to show");
  const note = win.querySelector(".docmap-empty-note");
  assert.ok(note, "the idle note stands in for the map");
  // The main window's idle note carries a Reader button; the view must not copy
  // it. A view that opens Reader is an action surface (§3.4).
  assert.equal(note.querySelectorAll("button, .btn").length, 0, "the view's idle note offers no action");
  assert.equal(win.querySelectorAll("[data-action]").length, 0, "and no action surface anywhere in it");
});

nodeTest("the second Time Machine window is a read-only view of the same history", async () => {
  const h = await seedTimeMachineDesk();
  const win = await openInstanceOn(h, "timeMachine");
  assert.ok(win, "the view opened");
  assertStructuralReadOnly(win);
  assert.equal(win.querySelectorAll("[id]").length, 0, "the view carries no element id");
  // It shows the page the tab was on, in the Reading View's own vocabulary.
  const heading = win.querySelector(".time-machine-reader h1");
  assert.equal(heading?.textContent, "An Archived Page", "the view names the page it shows");
  const meta = win.querySelector(".time-machine-reader-meta")?.textContent || "";
  assert.ok(meta.includes("example.com/a"), "and carries its address");
  assert.ok(meta.includes("2005-03-01"), "and the date it was read at");
  const body = win.querySelector(".reader-body-content")?.textContent || "";
  assert.ok(body.includes("The archived body."), "and the page's own text");
  // The trail is what makes this a view of the HISTORY rather than a copy of one
  // page: both stops are listed, and the one on screen is marked.
  const stops = win.querySelectorAll(".time-machine-reader ol > li");
  assert.equal(stops.length, 2, "the tab's visit trail is listed");
  assert.ok(stops[0].textContent.includes("example.com/old"), "in order");
  assert.equal(stops[1].getAttribute("aria-current"), "true", "with the page above marked as the current stop");
  assert.notEqual(
    h.run(`getWindow("timeMachine").querySelector("h2").textContent`),
    win.querySelector("h2").textContent,
    "the view's title differs from the main instance's",
  );
  await closeViewAndKeepMain(h, "timeMachine", win);
});

// --- the mechanism, asked of every view kind --------------------------------

for (const view of VIEW_KINDS) {
  nodeTest(`openWindowInstance('${view.kind}') opens a real second window`, async () => {
    const h = createAppBootVm();
    await h.settleBoot();
    await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
    const api = h.context.window.AISystem6WindowInstances;
    assert.ok(api, "the identity layer is loaded");
    assert.equal(api.refusal(view.kind), "", "the kind is whitelisted and has a builder");

    const win = await api.open(view.kind);
    assert.ok(win, `${view.kind} gets a second window`);
    assert.equal(win.dataset.window, view.kind, "it is a window of that kind");
    assert.ok(win.dataset.windowInstance && win.dataset.windowInstance !== "main", "stamped with its own instance id");
    assert.ok(win.classList.contains("window"), "a window element like any other");
    assert.ok(!win.classList.contains("is-hidden"), "revealed through the one open path");
    assert.notEqual(h.run(`getWindow(${JSON.stringify(view.kind)})`), win, "getWindow still answers the main instance");
    const count = h.run(`document.querySelectorAll('.window[data-window="${view.kind}"]').length`);
    assert.equal(count, 2, `two ${view.kind} windows on the desk`);
    const again = await api.open(view.kind, { instance: win.dataset.windowInstance });
    assert.equal(again, win, "opening the same instance again reuses its window");
    const after = h.run(`document.querySelectorAll('.window[data-window="${view.kind}"]').length`);
    assert.equal(after, 2, "no third window");
  });

  nodeTest(`a session restores both ${view.kind} windows, each rebuilt and stamped`, async () => {
    const h = createAppBootVm();
    await h.settleBoot();
    await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
    const api = h.context.window.AISystem6WindowInstances;
    await h.run(`openWindow(${JSON.stringify(view.kind)})`);
    const instance = await api.open(view.kind);
    assert.ok(instance, "the second instance exists before the capture");
    h.run(`focusWindow(document.querySelector('.window[data-window="${view.kind}"][data-window-instance]'))`);
    h.context.scheduleWorkingSessionSave = () => {};
    h.context.isWindowPinned = () => false;
    const captured = h.run("captureWindowWorkingSession()");
    const records = captured.windows.filter((entry) => entry.name === view.kind);
    assert.equal(records.length, 2, "capture holds both records");
    assert.deepEqual(
      [...records.map((r) => r.instance || "main")].sort(),
      ["main", instance.dataset.windowInstance].sort(),
      "the records carry main and the second instance's id",
    );

    h.run(`closeWindow(${JSON.stringify(view.kind)}, true)`);
    h.run(`closeWindow(${JSON.stringify(view.kind)}, true, ${JSON.stringify(instance.dataset.windowInstance)})`);
    await h.run(`restoreWindowWorkingSession(${JSON.stringify({
      activeAppId: view.kind,
      activeWindowName: view.kind,
      windows: records,
    })})`);

    const restored = h.run(`document.querySelectorAll('.window[data-window="${view.kind}"]').length`);
    assert.equal(restored, 2, `both ${view.kind} windows returned (got ${restored})`);
    assert.ok(h.run(`getWindow(${JSON.stringify(view.kind)})`) !== null, "the main instance is back, bare");
    const secondBack = h.run(`document.querySelector('.window[data-window="${view.kind}"][data-window-instance]')`);
    assert.ok(secondBack, "the second instance returned with its own element");
    assert.equal(secondBack.dataset.windowInstance, instance.dataset.windowInstance, "stamped with the saved id");
    assert.ok(!secondBack.classList.contains("is-hidden"), "and is on the desk, not hidden");
    assertStructuralReadOnly(secondBack);
  });

  nodeTest(`put-away keeps one cell per ${view.kind} instance, and ⌘\` walks both`, async () => {
    const h = createAppBootVm();
    await h.settleBoot();
    await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
    await h.run(`ensureLazySystemModule("app/core/window-minimize.js", "AISystem6WindowMinimizeLoaded")`);
    await h.run(`openWindow(${JSON.stringify(view.kind)})`);
    const instance = await h.context.window.AISystem6WindowInstances.open(view.kind);
    const main = h.run(`getWindow(${JSON.stringify(view.kind)})`);
    assert.ok(instance, "the second window exists");

    // The walk is element-keyed, so it separates the two windows of one kind.
    h.run(`focusWindow(getWindow(${JSON.stringify(view.kind)}))`);
    assert.equal(h.run(`document.querySelector(".window.is-active")`), main, "the main instance is in front");
    assert.equal(h.run("cycleApplicationWindows(1)"), true, "the walk moves");
    assert.equal(h.run(`document.querySelector(".window.is-active")`), instance, "the walk landed on the view's own element");
    assert.equal(h.run("cycleApplicationWindows(1)"), true, "the walk keeps moving");
    assert.equal(h.run(`document.querySelector(".window.is-active")`), main, "and back to the main instance");

    h.run(`(function () {
      getWindow(${JSON.stringify(view.kind)}).classList.add("is-minimized");
      document.querySelector('.window[data-window="${view.kind}"][data-window-instance]').classList.add("is-minimized");
    })()`);
    const keys = h.run(`AISystem6WindowMinimize.rows()
      .map((node) => node?.dataset?.miniwindow)
      .filter(Boolean)`);
    assert.equal(keys.length, 2, `one put-away row per instance (got ${keys.length})`);
    assert.equal(new Set(keys).size, 2, "the two rows carry two distinct cell keys");
    assert.ok(keys.includes(view.kind), "the main instance keeps the bare kind name as its cell key");
    assert.ok(keys.some((key) => key.indexOf(`${view.kind}:`) === 0), "the second instance's cell key is kind:instance");
  });
}

// --- helpers ---------------------------------------------------------------

// Does this module's own registration mount something that opens the module's
// window? `mount: open` names a function, whose body is what answers; an inline
// mount answers in its own text. Comments are stripped first, or a banner that
// names openWindow while disclaiming it would answer instead of the code.
function opensItsOwnWindow(source) {
  const code = codeOnly(source);
  const at = code.lastIndexOf("registerApplication(");
  if (at < 0) return false;
  const mount = /mount:\s*([^,\n}]+)/.exec(code.slice(at));
  if (!mount) return false;
  const value = mount[1].trim();
  if (value.includes("openWindow(")) return true;
  const named = /^([A-Za-z_$][\w$]*)$/.exec(value);
  if (!named) return false;
  return functionBody(code, named[1]).includes("openWindow(");
}

// The body of `function <name>(…) { … }`, by brace counting — the module's
// mount may be a one-line minified function or a formatted one, and both have to
// be read the same way. The parameter list is walked first, because a default
// value can carry braces of its own (open(options = {}) would otherwise end the
// body at its own default).
function functionBody(source, name) {
  const head = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (!head) return "";
  const paramsOpen = source.indexOf("(", head.index);
  if (paramsOpen < 0) return "";
  let depth = 0;
  let paramsClose = -1;
  for (let index = paramsOpen; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) { paramsClose = index; break; }
    }
  }
  if (paramsClose < 0) return "";
  const open = source.indexOf("{", paramsClose);
  if (open < 0) return "";
  depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return source.slice(open);
}

// A desk with the second window of a kind opened through the identity layer.
async function openSecondWindow(kind, booted = null) {
  const h = booted || createAppBootVm();
  if (!booted) await h.settleBoot();
  const win = await openInstanceOn(h, kind);
  return { h, win };
}

// The main window and then a second instance of it, the two calls every
// executing case starts with (the identity layer loads on demand).
async function openInstanceOn(h, kind) {
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  await h.run(`openWindow(${JSON.stringify(kind)})`);
  return h.context.window.AISystem6WindowInstances.open(kind);
}

// A desk whose Time Machine tab has been somewhere: two visits, the second one
// on screen, with the page the archive returned. The tab lives in the project
// record, which is where the browser keeps it.
async function seedTimeMachineDesk() {
  const h = createAppBootVm();
  await h.settleBoot();
  h.run(`(function () {
    const project = getActiveProject();
    project.documentTabs = [{
      id: "tm-1", app: "timeMachine", role: "web_navigation", title: "A Visit", backing: {}, order: 0,
      state: {
        address: "example.com/a", targetDate: "2005-03-01", archiveEnabled: true,
        history: [
          { url: "example.com/old", targetDate: "2001-01-01" },
          { url: "example.com/a", targetDate: "2005-03-01" },
        ],
        historyIndex: 1,
        page: {
          title: "An Archived Page", url: "example.com/a", retrievedAt: "2026-10-14",
          reader: { title: "An Archived Page", text: "The archived body.", completeness: "complete" },
          archive: { provider: "wayback", capturedAt: "2005-03-01T00:00:00Z" },
        },
      },
    }];
    project.activeDocumentTabIds = { reader: null, teachText: null, docMap: null, timeMachine: "tm-1" };
  })()`);
  return h;
}

// The same four facts Reader's second window is held to.
function assertStructuralReadOnly(win) {
  assert.equal(win.querySelectorAll("[data-action]").length, 0, "no action surface in the view");
  assert.equal(win.querySelectorAll("[data-requires-write]").length, 0, "no write-required surface in the view");
  assert.equal(win.querySelectorAll("input, textarea, form, [contenteditable]").length, 0, "no editable control in the view");
}

async function closeViewAndKeepMain(h, kind, win) {
  await h.run(`closeWindow(${JSON.stringify(kind)}, false, ${JSON.stringify(win.dataset.windowInstance)})`);
  assert.ok(!h.run(`getWindow(${JSON.stringify(kind)}).classList.contains("is-hidden")`), "closing the view leaves the main instance open");
  assert.ok(win.classList.contains("is-hidden"), "the view itself is the window that closed");
}

test.finish();
