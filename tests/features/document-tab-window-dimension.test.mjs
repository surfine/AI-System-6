// The document-tab store's window dimension (§4.1/§4.2).
//
// Until now `project.documentTabs` and `activeDocumentTabIds[app]` were keyed by
// project x KIND, with nothing anywhere recording which WINDOW holds which tab.
// Merge All Windows and Move Tab to New Window are not a UI gap but this one:
// there was no place to put "this tab is in that window".
//
// The dimension is one field on each tab record plus a window-scoped active
// slot. An absent field IS the main instance — the rule the session's window
// records already follow (§9B) — so a project written before this field maps
// onto the desk's first window with no migration, and every existing reader of
// `activeDocumentTabIds[app]` keeps reading exactly what it read before.
//
// The rails are the user-visible half: each one renders the window it sits in,
// so a tab that moved to another window stops rendering in the main one.
//
// The static half of the executing tests below (the four rails) is top-level so
// test.finish() reads its failures; the executing half asserts with the
// throwing node:assert. test.assert* only prints, and a contract whose failures
// are only printed passes the gate while proving nothing.

import assert from "node:assert/strict";
import nodeTest from "node:test";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { codeOnly, createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("document-tab-window-dimension");
const saved = "2026-01-01T00:00:00.000Z";

// Every rail renders a window's set rather than the whole kind, and asks which
// window it is in rather than assuming main (§4.2). This is what will make a
// moved tab leave the main window's rail; without it the tab would render in
// both windows at once.
for (const [path, kind] of [
  ["app/features/reader.js", "reader"],
  ["app/features/teachtext-accessories.js", "teachText"],
  ["app/features/docmap.js", "docMap"],
  ["app/features/time-machine.js", "timeMachine"],
]) {
  const code = codeOnly(read(path));
  test.assertIncludes(code, `getWindowDocumentTabs("${kind}"`, `${path}'s rail renders one window's set`);
  test.assertIncludes(code, "documentTabInstanceOfRail(", `${path}'s rail asks which window it sits in`);
}

// Values crossing out of the boot VM are that realm's arrays and objects, so
// they are read back as JSON: a deep comparison across two realms fails on the
// prototypes even when the contents agree.
function readBack(h, expression) {
  return JSON.parse(h.run(`JSON.stringify(${expression})`));
}

// A desk with one project whose tabs are whatever the case needs.
function seedDeskTabs(tabs, active) {
  const h = createAppBootVm();
  h.run(`
    projects.length = 0;
    projects.push({
      id: "p1", name: "Project Hard Disk", createdAt: "${saved}", updatedAt: "${saved}",
      questionSheet: "", outline: "", drafts: [], scraps: [],
      documentTabs: ${JSON.stringify(tabs)},
      activeDocumentTabIds: ${JSON.stringify(active)},
    });
    activeProjectId = "p1"; selectedProjectId = "p1"; startupProjectId = "p1"; isProjectMounted = true;
    deskPersistenceWritable = true;
    saveDeskState = async () => true;
    renderProjectDisks = function noopProjectDisks() {};
  `);
  return h;
}

const readerTab = (id, url, order) => ({
  id, app: "reader", role: "source_view", title: url, order,
  backing: { type: "web", url }, state: {}, createdAt: saved, updatedAt: saved,
});

nodeTest("a project written before the field maps every tab to the main instance", () => {
  const h = seedDeskTabs(
    [readerTab("r1", "https://a.example", 0), readerTab("r2", "https://b.example", 1)],
    { reader: "r2", teachText: null, docMap: null, timeMachine: null },
  );
  // The projection carries the field, defaulted — this is the legacy archive
  // case, and it is the same shape the session's records take (§9B).
  assert.deepEqual(
    readBack(h, 'getDocumentTabs("reader", getActiveProject()).map((tab) => [tab.id, tab.instance])'),
    [["r1", "main"], ["r2", "main"]],
    "every legacy tab reads as the main instance's",
  );
  // Main holds both; a window that never existed holds none — and answers no
  // active tab either, rather than borrowing main's.
  assert.deepEqual(
    readBack(h, 'getWindowDocumentTabs("reader", getActiveProject(), "main").map((tab) => tab.id)'),
    ["r1", "r2"],
    "the main instance holds the whole kind",
  );
  assert.deepEqual(readBack(h, 'getWindowDocumentTabs("reader", getActiveProject(), "view-1")'), [], "and a second window holds none of it");
  assert.equal(h.run('getActiveDocumentTab("reader", getActiveProject(), "main")?.id'), "r2", "main keeps its active tab");
  assert.equal(h.run('getActiveDocumentTab("reader", getActiveProject(), "view-1")'), null, "the empty window has no active tab");
});

nodeTest("a tab opened in a second window belongs to it, and the two sets stay apart", () => {
  const h = seedDeskTabs([readerTab("r1", "https://a.example", 0)], { reader: "r1", teachText: null, docMap: null, timeMachine: null });
  // What Move Tab to New Window will do in the next step: open the tab in a
  // window that is not main.
  h.run(`upsertDocumentTab("reader", "source_view", {
    backing: { type: "web", url: "https://moved.example" }, title: "Moved", instance: "view-1",
  }, getActiveProject())`);
  const state = readBack(h, `(function () {
    const project = getActiveProject();
    const moved = project.documentTabs.find((tab) => tab.title === "Moved");
    return {
      storedInstance: moved?.instance,
      main: getWindowDocumentTabs("reader", project, "main").map((tab) => tab.id),
      view: getWindowDocumentTabs("reader", project, "view-1").map((tab) => tab.id),
      activeMain: project.activeDocumentTabIds.reader,
      activeView: project.activeDocumentTabIds["reader:view-1"],
      kindCount: getDocumentTabs("reader", project).length,
    };
  })()`);
  assert.equal(state.storedInstance, "view-1", "the record keeps the window that holds it");
  assert.deepEqual(state.main, ["r1"], "main keeps its own tab and not the moved one");
  assert.deepEqual(state.view, [state.activeView], "the second window holds exactly the tab opened in it");  assert.equal(state.activeMain, "r1", "main's active tab is untouched by the other window's open");
  assert.equal(state.kindCount, 2, "the kind still holds both tabs — the dimension splits them, it does not hide them");
});

nodeTest("removing a second window's tab leaves the main window exactly as it was", () => {
  const h = seedDeskTabs([readerTab("r1", "https://a.example", 0)], { reader: "r1", teachText: null, docMap: null, timeMachine: null });
  h.run(`upsertDocumentTab("reader", "source_view", {
    backing: { type: "web", url: "https://moved.example" }, title: "Moved", instance: "view-1",
  }, getActiveProject())`);
  const after = readBack(h, `(function () {
    const project = getActiveProject();
    const moved = project.documentTabs.find((tab) => tab.title === "Moved");
    const result = removeDocumentTab("reader", moved.id, project);
    return {
      removed: result?.removed?.id === moved.id,
      wasActive: result?.wasActive,
      activeView: project.activeDocumentTabIds["reader:view-1"],
      activeMain: project.activeDocumentTabIds.reader,
      main: getWindowDocumentTabs("reader", project, "main").map((tab) => tab.id),
      view: getWindowDocumentTabs("reader", project, "view-1").length,
    };
  })()`);
  assert.ok(after.removed, "the tab was removed");
  assert.equal(after.wasActive, true, "the removal knew which window's slot to fix");
  assert.equal(after.activeView, null, "that window's active slot is cleared, not left pointing at a gone tab");
  assert.equal(after.activeMain, "r1", "and main's active tab is not the slot that was fixed");
  assert.deepEqual(after.main, ["r1"], "main's set is what it was");
  assert.equal(after.view, 0, "the second window's set is empty");
});

nodeTest("a main window's rail stops rendering a tab another window holds", () => {
  const h = seedDeskTabs([readerTab("r1", "https://a.example", 0)], { reader: "r1", teachText: null, docMap: null, timeMachine: null });
  h.run(`renderReaderTabs(getActiveProject())`);
  assert.equal(h.run(`document.querySelectorAll("#reader-tabs .tdi-tab").length`), 1, "the rail renders the main window's tab");
  // The second window's tab exists on the desk; it is simply not this rail's.
  h.run(`upsertDocumentTab("reader", "source_view", {
    backing: { type: "web", url: "https://moved.example" }, title: "Moved", instance: "view-1",
  }, getActiveProject()); renderReaderTabs(getActiveProject())`);
  assert.equal(h.run(`document.querySelectorAll("#reader-tabs .tdi-tab").length`), 1, "and still one after the other window's tab opened");
  assert.equal(
    h.run(`document.querySelector("#reader-tabs .tdi-tab").textContent.includes("Moved")`),
    false,
    "the rail does not render the tab the other window holds",
  );
  // The window's own set is what it renders, so its own tab is still there.
  assert.equal(h.run(`document.querySelector("#reader-tabs .tdi-tab").textContent.includes("https://a.example")`), true, "and still renders its own");
});

test.finish();
