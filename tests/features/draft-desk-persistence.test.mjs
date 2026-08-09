import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";

const test = createFeatureTest("draft-desk-persistence");

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
