import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";

const test = createFeatureTest("draft-desk-working-session");
const runtime = createDraftDeskVm();
const project = runtime.addProject("project-a", "最新稿", {
  versions: [{ id: "v1", body: "更早的稿", reason: "before-ai" }],
  materials: [{ id: "m1", text: "durable material" }],
});
const draft = runtime.controls.get("quick-draft-draft");

runtime.testApi.setQuickDraftDisplayMode("read");
const restored = runtime.testApi.restoreWorkingSession({
  projectId: "project-a",
  workspace: {
    body: "昨天的旧稿",
    versions: [],
    materials: [],
    composition: {},
  },
  paperSurface: "editor",
  displayMode: "body",
  drawer: "inspector",
  activeLayerKind: "density",
  expandedLayerKind: "density",
  toolsOpen: true,
  editor: {
    selectionStart: 1,
    selectionEnd: 3,
    selectionDirection: "forward",
    scrollTop: 42,
    focused: true,
  },
});

test.assert(restored === true, "the Draft Desk Working Session restores for its owning project");
test.assert(project.quickDraft.workspace.body === "最新稿" && draft.value === "最新稿", "a stale session workspace cannot overwrite the durable body");
test.assert((project.quickDraft.workspace.pendingDarkroom?.versions || []).length === 1, "a stale session cannot overwrite durable Versions");
test.assert(project.quickDraft.workspace.materials.length === 1, "a stale session cannot overwrite durable Materials");
test.assert(runtime.testApi.currentQuickDraftDisplayMode() === "body", "the display mode still restores");
test.assert(runtime.form.classList.contains("is-inspector-open"), "the drawer state still restores");
test.assert(draft.selectionStart === 1 && draft.selectionEnd === 3 && draft.selectionDirection === "forward", "selection and direction restore");
test.assert(draft.scrollTop === 42 && draft.__focused === true, "scroll and focus restore");

const snapshot = runtime.testApi.captureWorkingSession();
const serialized = JSON.stringify(snapshot);
for (const forbidden of ["workspace", "body", "materials", "versions", "composition", "adjustmentLayers", "protectedRanges", "projectDocId"]) {
  test.assert(!Object.prototype.hasOwnProperty.call(snapshot, forbidden), `Working Session snapshot excludes durable field ${forbidden}`);
}
test.assert(!/durable material|更早的稿|最新稿/.test(serialized), "Working Session stores UI state rather than a second document copy");
test.assert(snapshot.displayMode === "body" && snapshot.drawer === "inspector", "Working Session capture retains view and drawer state");

test.finish();
