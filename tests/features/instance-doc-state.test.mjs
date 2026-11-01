// Per-instance document state (P2, §2.7): the document-state singletons in
// app.js become the KEY WINDOW's alias, and each window keeps its own bucket.
//
// The static half pins the mechanism to its owners: every slot name this
// module buckets must still be a top-level `let` in app.js (a rename silently
// detaches a slot otherwise), and the module must touch no storage or lease
// API — buckets are memory, and §3.6 keeps the main instance the only writer.
//
// The executing half (app-boot-vm) proves the alias really follows focus:
// with two Reader instances open, each keeps the document it was showing, and
// the globals read whichever window is key.

import assert from "node:assert/strict";
import nodeTest from "node:test";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("instance-doc-state");
// The buckets live inside the lazy identity layer (per-instance state, one
// module); the contract reads that source.
const moduleSource = read("app/core/window-instances.js");
const appSource = read("app.js");
const windowManager = read("app/core/window-manager.js");
const manifest = read("tooling/runtime-manifest.mjs");

// --- (a) every slot is still a real binding, and the module stays clean ------
nodeTest("every bucketed slot is a top-level binding in app.js", () => {
  const table = moduleSource.match(/const ACCESS = \{([\s\S]*?)\n\};/);
  test.assert(table, "the slot accessor table exists");
  const names = [...table[1].matchAll(/^\s+([A-Za-z_$][\w$]*): \[/gm)].map((m) => m[1]);
  assert.equal(names.length >= 6, true, `the table declares its slots (got ${names.join(", ")})`);
  for (const name of names) {
    // `let name = …` at column 0 is how the desk declares document state; a
    // slot that moved into a scope this module cannot reach would be dead.
    assert.match(
      appSource,
      new RegExp(`^let ${name}\\b`, "m"),
      `${name} is still a top-level let binding in app.js`,
    );
  }
  // And the module exposes exactly the mechanism, nothing else.
  test.assertMatches(moduleSource, /window\.AISystem6InstanceDocState = Object\.freeze\(\{/);
});

nodeTest("the bucket code touches no storage and no write lease", () => {
  // Only the bucket section is checked — the identity layer's other half has
  // its own contract — by reading from the section marker to the module's end.
  const section = moduleSource.slice(moduleSource.indexOf("---- Document state buckets"));
  for (const forbidden of ["indexedDB", "localStorage", "sessionStorage", "assertCanWrite", "AISystem6StorageTransactions", "saveDeskState", "put("]) {
    test.assertNotIncludes(section, forbidden, `the bucket section does not reach ${forbidden}`);
  }
  // It ships inside the lazy identity layer, whose path the boot bundle names
  // (actions.js registers open-window-instance with it) — a desk that never
  // grows a second window never loads any of it.
  test.assertMatches(manifest, /"app\/core\/window-instances\.js"/, "the module is in the lazy runtime paths");
  test.assertMatches(manifest, /export const lazyRuntimePaths/, "and in the lazy section");
  assert.match(read("app/core/actions.js"), /"app\/core\/window-instances\.js",\s*"AISystem6WinInst"/, "the boot bundle names it, so it is reachable");
});

nodeTest("focusWindow hands the focus to the bucket mechanism", () => {
  test.assertMatches(
    windowManager,
    /window\.AISystem6InstanceDocState\?\.focus\(win\)/,
    "focusWindow switches the alias (the one eager line this phase spends)",
  );
});

// --- (b) executing: the alias follows focus, buckets keep the documents ------
nodeTest("two Reader instances keep their own document and the alias follows focus", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  const api = h.context.window.AISystem6WindowInstances;

  // The main Reader, with document A open.
  await h.run(`openWindow("reader")`);
  h.run(`currentReaderPage = ${JSON.stringify({ kind: "web", title: "A", text: "Source A body" })}`);
  assert.equal(h.run("currentReaderPage.title"), "A", "the main instance holds A");

  // The second instance opens — and inherits A, because that is what the
  // writer is reading (P1's read-only view of the same document).
  const view = await api.open("reader");
  test.assert(view, "the second window opened");
  assert.equal(h.run("currentReaderPage.title"), "A", "the new instance inherits the live document");
  assert.ok(h.run("!!window.AISystem6InstanceDocState"), "the bucket surface is there once a second instance has opened");
  const state = h.context.window.AISystem6InstanceDocState;
  assert.equal(state.keyWindow(), view, "the arriving instance is the key window");
  assert.equal(state.bucketOf(view)?.currentReaderPage?.title, "A", "its bucket was seeded from the live state");

  // Back to the main instance: its document is still A, and B is opened there.
  h.run(`focusWindow(getWindow("reader"))`);
  assert.equal(h.run("currentReaderPage.title"), "A", "the main instance's state comes back with focus");
  h.run(`currentReaderPage = ${JSON.stringify({ kind: "web", title: "B", text: "Source B body" })}`);
  assert.equal(h.run("currentReaderPage.title"), "B", "the main instance now holds B");

  // Focus the view again: the alias follows, and the view still shows A —
  // this is the bucket, not a copy of the global.
  h.run(`focusWindow(document.querySelector('.window[data-window="reader"][data-window-instance]'))`);
  assert.equal(h.run("currentReaderPage.title"), "A", "the view's own document returns with focus");

  // And back: the main instance's B is intact, not the view's A.
  h.run(`focusWindow(getWindow("reader"))`);
  assert.equal(h.run("currentReaderPage.title"), "B", "the main instance's document is its own, not the view's");

  // TeachText's slots ride the same mechanism, and a window that never held
  // state cannot blank them: switch to the view and the TeachText slots keep
  // the value they had, because the view's bucket inherited them.
  h.run(`activeTextFileId = "file-1"`);
  h.run(`focusWindow(document.querySelector('.window[data-window="reader"][data-window-instance]'))`);
  assert.equal(h.run("activeTextFileId"), "file-1", "a slot another kind owns survives the switch");
});

nodeTest("a closed key window hands its state back", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  await h.run(`openWindow("reader")`);
  const view = await h.context.window.AISystem6WindowInstances.open("reader");
  const state = h.context.window.AISystem6InstanceDocState;
  assert.equal(state.keyWindow(), view, "the view is key");
  state.forget(view);
  assert.equal(state.keyWindow(), null, "a forgotten key window leaves no alias behind");
  assert.equal(state.bucketOf(view), null, "and its bucket is dropped");
});

// --- (c) executing: the main instance stays the only writer (§3.6) -----------
nodeTest("the second instance holds no write surface and takes no pen", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  await h.run(`openWindow("reader")`);
  const view = await h.context.window.AISystem6WindowInstances.open("reader");
  test.assert(view, "the second window exists");
  // The write lease freezes by declarative marker; a view carrying none can
  // never be frozen INTO a writer, and the storage fence keeps its own owner.
  assert.equal(view.querySelectorAll("[data-requires-write]").length, 0, "no write-required surface on the second instance");
  // Nothing write-required is reachable through the view's serialised HTML
  // either: the action delegate is document-wide, so an action string inside
  // the view would run against the key window's state.
  const writeRequired = h.run(`(function () {
    const actions = ${JSON.stringify(readWriteRequiredActionNames())};
    const markup = document.querySelector('.window[data-window="reader"][data-window-instance]')?.outerHTML || "";
    return actions.filter((action) => markup.indexOf(action) !== -1);
  })()`);
  assert.equal(writeRequired.length, 0, `the view exposes no write-required action (got ${writeRequired.join(", ")})`);
});

// Reads the write-required action names out of actions.js so this test fails
// when the set grows past what the view is checked against.
function readWriteRequiredActionNames() {
  const source = read("app/core/actions.js");
  const table = source.match(/const writeRequiredActions = new Set\(\[([\s\S]*?)\]\)/);
  return table ? [...table[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

// --- (d) the full round-trip: a session restores both reader windows --------
nodeTest("a session restores both reader instances, each rebuilt and stamped", async () => {
  const h = createAppBootVm();
  await h.settleBoot();
  await h.run(`ensureLazySystemModule("app/core/window-instances.js", "AISystem6WinInst")`);
  const api = h.context.window.AISystem6WindowInstances;

  // Open Reader (main) and a second instance, capture the desk, then take
  // both windows off it — the restore path is the only way back.
  await h.run(`openWindow("reader")`);
  const view = await api.open("reader");
  test.assert(view, "the second instance exists before the capture");
  h.run(`focusWindow(document.querySelector('.window[data-window="reader"][data-window-instance]'))`);
  h.context.scheduleWorkingSessionSave = () => {};
  h.context.isWindowPinned = () => false;
  const captured = h.run("captureWindowWorkingSession()");
  const records = captured.windows.filter((entry) => entry.name === "reader");
  assert.equal(records.length, 2, "capture holds both reader records");
  assert.deepEqual(
    [...records.map((r) => r.instance || "main")].sort(),
    ["main", view.dataset.windowInstance].sort(),
    "the records carry main and the second instance's id",
  );

  // The desk's real refresh: closeWindow hides (elements stay), and restore
  // re-reveals through the same paths. Both are hidden when the capture's
  // scene comes back.
  h.run(`closeWindow("reader", true)`);
  h.run(`closeWindow("reader", true, ${JSON.stringify(view.dataset.windowInstance)})`);
  assert.equal(h.run(`getWindow("reader").classList.contains("is-hidden")`), true, "the main instance is hidden");
  assert.equal(view.classList.contains("is-hidden"), true, "the second instance is hidden");

  await h.run(`restoreWindowWorkingSession(${JSON.stringify({
    activeAppId: "reader",
    activeWindowName: "reader",
    windows: records,
  })})`);

  // Two reader windows are back: the main one bare, the second one stamped
  // with its own id and revealed through the one open path.
  const restoredCount = h.run(`document.querySelectorAll('.window[data-window="reader"]').length`);
  assert.equal(restoredCount, 2, `both reader windows returned (got ${restoredCount})`);
  assert.equal(h.run(`getWindow("reader")`) !== null, true, "the main instance is back, bare");
  const secondBack = h.run(`document.querySelector('.window[data-window="reader"][data-window-instance]')`);
  test.assert(secondBack, "the second instance returned with its own element");
  assert.equal(secondBack.dataset.windowInstance, view.dataset.windowInstance, "stamped with the saved id");
  assert.equal(secondBack.classList.contains("is-hidden"), false, "and is on the desk, not hidden");
  // The read-only guarantee survives the restore: the rebuilt view carries no
  // action surface and no write-required surface.
  assert.equal(secondBack.querySelectorAll("[data-action]").length, 0, "the rebuilt view has no action surface");
  assert.equal(secondBack.querySelectorAll("[data-requires-write]").length, 0, "the rebuilt view has no write-required surface");
});

test.finish();
