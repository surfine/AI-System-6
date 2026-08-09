import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { read } from "../helpers/feature-test-harness.mjs";
import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";

const test = createFeatureTest("draft-desk-persistence");
const actions = read("app/core/actions.js");
const saveCurrent = read("app/features/documents-chat.js");
const windowManager = read("app/core/window-manager.js");

// Case 1 — standard Save command: flush textarea, one durable commit, Saved
// receipt, and no second write.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-a", "原正文");
  runtime.controls.get("quick-draft-draft").value = "已修改正文";
  const facade = runtime.context.window.AISystem6QuickDraft;
  test.assert(typeof facade.save === "function", "Draft Desk exposes a public Save API");
  test.assert(typeof facade.newDocument === "function", "Draft Desk exposes a public New API");
  test.assert(typeof facade.close === "function", "Draft Desk exposes a public Close API");
  test.assert(typeof facade.share === "function", "Draft Desk exposes a public Share API");
  const saved = await facade.save();
  test.assert(saved === true, "the Save command resolves true on success");
  test.assert(runtime.context.persistedStatuses.length === 1, "the Save command persists exactly once");
  test.assert(runtime.context.persistedStatuses.at(-1)?.[0] === "saved", "saveDeskState observes Saved, not Modified");
  test.assert(project.quickDraft.workspace.body === "已修改正文", "the Save command flushes the textarea body");
  test.assert(project.quickDraft.workspace.savedStatus === "saved", "the durable workspace receipt is Saved");
  test.assert(
    runtime.controls.get("quick-draft-save-state").textContent === "quick_draft_saved_state",
    "the visible save receipt is Saved"
  );
}

// Case 2 — persistence failure: Save returns false, body stays, receipt stays
// Modified, and Saved is never displayed.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-fail", "原正文");
  const draft = runtime.controls.get("quick-draft-draft");
  draft.value = "不能落盘的正文";
  runtime.context.persistSucceeds = false;
  const saved = await runtime.context.window.AISystem6QuickDraft.save();
  test.assert(saved === false, "the Save command returns false when persistence fails");
  test.assert(draft.value === "不能落盘的正文", "a failed Save keeps the typed body in the editor");
  test.assert(project.quickDraft.workspace.body === "原正文", "a failed Save rolls the durable record back to the last good body");
  test.assert(project.quickDraft.workspace.savedStatus === "modified", "a failed Save leaves the durable receipt Modified");
  test.assert(
    runtime.controls.get("quick-draft-save-state").textContent === "quick_draft_modified_state",
    "a failed Save never displays Saved"
  );
}

// Case 3 — two rapid Save commands: no duplicate Versions, no duplicate
// Project Document, and the latest body wins.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-rapid", "第一版", {
    versions: [{ id: "v1", body: "更早的稿", reason: "before" }],
    projectDocId: "document-1",
  });
  const draft = runtime.controls.get("quick-draft-draft");
  draft.value = "第二版";
  const gate = runtime.deferred();
  runtime.context.persistDeferred = gate;
  const first = runtime.context.window.AISystem6QuickDraft.save();
  draft.value = "第三版";
  const second = runtime.context.window.AISystem6QuickDraft.save();
  gate.resolve(true);
  const results = await Promise.all([first, second]);
  test.assert(results.every((result) => result === true), "both rapid Save commands resolve successfully");
  test.assert(project.quickDraft.workspace.body === "第三版", "the later Save wins; no stale body overwrite");
  test.assert(project.quickDraft.workspace.versions.length === 1, "rapid Saves never duplicate Versions");
  test.assert(project.quickDraft.workspace.projectDocId === "document-1", "rapid Saves never duplicate the Project Document");
  test.assert(project.quickDraft.workspace.savedStatus === "saved", "rapid Saves settle on Saved");
}

// Case 4 — ⌘S and Ctrl+S dispatch to the same save-current command.
test.assertIncludes(actions, 'scope: ["teachText", "clioTalk", "quickDraft"]', "⌘S / Ctrl+S applies to Draft Desk");
test.assertIncludes(actions, 'action: "save-current"', "the S shortcut targets the shared save-current command");
test.assertIncludes(actions, "function shortcutModifierPressed", "platform Command/Control resolution is shared");
test.assertIncludes(
  saveCurrent,
  'if (activeWin?.dataset.window === "quickDraft")',
  "save-current routes Draft Desk through its own window"
);
test.assertIncludes(
  saveCurrent,
  "window.AISystem6QuickDraft?.save",
  "save-current calls the Draft Desk public Save API"
);

// Close contract: ⌘W on Draft Desk flushes pending/Modified work before hiding
// and never closes silently over a failed persist.
test.assertIncludes(
  windowManager,
  'name === "quickDraft" && !force',
  "closing Draft Desk goes through the guarded close path"
);
test.assertIncludes(
  windowManager,
  'workspace?.savedStatus === "modified"',
  "closing Draft Desk flushes a Modified workspace"
);
test.assertIncludes(
  windowManager,
  'commitQuickDraft({})',
  "closing Draft Desk performs a durable commit before hiding"
);
test.assertIncludes(
  windowManager,
  'result.ok !== true',
  "a failed close flush keeps the window open"
);

// New contract — Case 1: an unsaved draft is saved as a durable Project
// document before a blank workspace opens.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-new-unsaved", "A 的正文");
  const saved = await runtime.context.window.AISystem6QuickDraft.newDocument();
  test.assert(saved === true, "New resolves true after Save & New");
  const files = runtime.context.chatFiles.filter((file) => file.projectId === "project-new-unsaved");
  test.assert(files.length === 1, "Save & New creates exactly one Project document");
  test.assert(files[0].body.includes("A 的正文") && files[0].durable === true, "the old draft is durable and reopenable from Project Hard Disk");
  test.assert(project.quickDraft.workspace.body === "" && project.quickDraft.workspace.projectDocId === "", "the blank workspace has no stale body or document identity");
  test.assert(project.quickDraft.workspace.versions.length === 0, "the blank workspace carries no Versions");
}

// New contract — Case 2: a failed Project Document save aborts New and leaves
// the old draft fully intact.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-new-fail", "A 的正文");
  runtime.context.persistSucceeds = false;
  const saved = await runtime.context.window.AISystem6QuickDraft.newDocument();
  test.assert(saved === false, "New returns false when the Project Document save fails");
  test.assert(project.quickDraft.workspace.body === "A 的正文", "the old draft survives a failed New");
  test.assert(project.quickDraft.workspace.projectDocId === "", "no document identity is invented on failure");
  test.assert(runtime.context.chatFiles.length === 0, "no empty Project document is created on failure");
  test.assert(
    runtime.controls.get("quick-draft-draft").value === "A 的正文",
    "the shared editor still shows the old draft"
  );
}

// New contract — Case 3: an already-durable draft updates its existing
// Project document, then opens a blank workspace without duplicating it.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-new-durable", "A 的正文", { projectDocId: "document-1" });
  runtime.context.chatFiles.push({
    id: "document-1",
    projectId: "project-new-durable",
    type: "text",
    name: "A",
    body: "旧文档",
    durable: true,
    updatedAt: new Date().toISOString(),
  });
  const saved = await runtime.context.window.AISystem6QuickDraft.newDocument();
  test.assert(saved === true, "New resolves true when the durable document exists");
  const document = runtime.context.chatFiles.find((file) => file.id === "document-1");
  test.assert(document.body.includes("A 的正文"), "the existing Project document is updated to the latest draft");
  test.assert(runtime.context.chatFiles.filter((file) => file.projectId === "project-new-durable").length === 1, "New never duplicates the Project document");
  test.assert(project.quickDraft.workspace.body === "" && project.quickDraft.workspace.projectDocId === "", "the blank workspace starts with fresh identity");
}

// New contract — Case 4: an empty desk simply opens a blank draft and never
// creates a meaningless empty document.
{
  const runtime = createDraftDeskVm();
  runtime.addProject("project-new-empty");
  const saved = await runtime.context.window.AISystem6QuickDraft.newDocument();
  test.assert(saved === true, "New on an empty desk resolves true");
  test.assert(runtime.context.chatFiles.length === 0, "an empty New never creates a Project document");
  test.assert(runtime.controls.get("quick-draft-save-state").textContent !== "quick_draft_save_failed", "an empty New never shows a save failure");
}

// saveDeskState must observe Saved, not persist a stale Modified receipt.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-a", "原正文");
  runtime.controls.get("quick-draft-draft").value = "已修改正文";
  const committed = await runtime.testApi.commitQuickDraft({ workspace: { body: "已修改正文" } });
  test.assert(committed.ok === true, "a successful explicit commit resolves only after persistence");
  test.assert(runtime.context.persistedStatuses.at(-1)?.[0] === "saved", "saveDeskState snapshots savedStatus as Saved");
  test.assert(project.quickDraft.workspace.savedStatus === "saved", "a successful commit remains Saved in working memory");
}

// A failed commit never leaves a Saved receipt in the UI.
{
  const runtime = createDraftDeskVm();
  runtime.addProject("project-fail", "原正文");
  runtime.context.persistSucceeds = false;
  const committed = await runtime.testApi.commitQuickDraft({ workspace: { body: "不能落盘的正文" } });
  test.assert(committed.ok === false, "a failed explicit commit reports failure");
  test.assert(
    runtime.context.activeProject.quickDraft.workspace.savedStatus === "modified",
    "a failed explicit commit leaves the durable record receipt Modified"
  );
  test.assert(
    runtime.controls.get("quick-draft-save-state").textContent === "quick_draft_modified_state",
    "a failed explicit commit leaves the visible save receipt Modified"
  );
}

// Protect and Adjustment success receipts may appear only after their durable
// promise resolves, never while saveDeskState is still pending.
for (const action of ["protect", "adjustment"]) {
  const runtime = createDraftDeskVm();
  runtime.addProject(`project-${action}`, "第一行\n第二行\n第三行");
  const draft = runtime.controls.get("quick-draft-draft");
  draft.selectionStart = 0;
  draft.selectionEnd = 3;
  const gate = runtime.deferred();
  runtime.context.persistDeferred = gate;
  const pending = action === "protect"
    ? runtime.testApi.protectSelectionFromTextarea()
    : runtime.testApi.updateAdjustmentLayer("mingming", { enabled: true });
  await Promise.resolve();
  const statusBefore = runtime.controls.get("quick-draft-status").textContent;
  test.assert(
    statusBefore !== (action === "protect" ? "quick_draft_protect_saved" : "quick_draft_adjustment_saved"),
    `${action} does not announce success before persistence`
  );
  gate.resolve(true);
  const result = await pending;
  test.assert(Boolean(result), `${action} resolves successfully after persistence`);
  test.assert(
    runtime.controls.get("quick-draft-status").textContent === (action === "protect" ? "quick_draft_protect_saved" : "quick_draft_adjustment_saved"),
    `${action} announces success after persistence`
  );
}

// Scope failure restores the previous adjustment mask and reports failure.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-scope", "第一行\n第二行");
  const draft = runtime.controls.get("quick-draft-draft");
  draft.selectionStart = 0;
  draft.selectionEnd = 3;
  runtime.context.persistSucceeds = false;
  const result = await runtime.testApi.scopeSelectionToLayer("mingming");
  const layer = project.quickDraft.workspace.adjustmentLayers.find((entry) => entry.kind === "mingming");
  test.assert(result === false, "a failed Scope commit reports failure");
  test.assert((layer?.mask || []).length === 0, "a failed Scope commit rolls back the adjustment mask");
  test.assert(runtime.controls.get("quick-draft-status").textContent === "quick_draft_save_failed", "a failed Scope commit never announces success");
}

test.finish();
