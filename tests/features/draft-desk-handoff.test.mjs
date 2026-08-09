import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("draft-desk-handoff");
const handoffSource = read("app/features/quick-draft-handoff.js");
const { addProject, context, controls } = createDraftDeskVm();
const api = context.window.__draftDeskTest;
const project = addProject("project-a", "# Original\n\nBody");
controls.get("quick-draft-title-input").value = "Original";
controls.get("quick-draft-draft").value = "# Original\n\nBody";

const created = await api.commitQuickDraftProjectDocument({
  projectId: project.id,
  title: "Original",
  body: "# Original\n\nBody",
});
test.assert(created.ok, "Save to Project succeeds");
test.assert(context.chatFiles.length === 1, "Save to Project creates exactly one document");
test.assert(project.quickDraft.workspace.projectDocId === created.documentId, "the durable record owns its Project document id");
test.assert(context.selectedChatFileId === created.documentId, "selection changes only after the durable commit");

const updated = await api.commitQuickDraftProjectDocument({
  projectId: project.id,
  title: "Updated",
  body: "# Updated\n\nNew body",
  existingDocumentId: created.documentId,
});
test.assert(updated.ok && context.chatFiles.length === 1, "updating reuses exactly one Project document");
test.assert(context.chatFiles[0].body.includes("New body"), "the existing Project document receives the new body");

const beforeFailure = structuredClone({
  files: context.chatFiles,
  folders: context.chatFolders,
  projectDocId: project.quickDraft.workspace.projectDocId,
  selectedChatFileId: context.selectedChatFileId,
});
let saveAttempt = 0;
context.saveDeskState = async () => {
  saveAttempt += 1;
  return saveAttempt > 1;
};
const failed = await api.commitQuickDraftProjectDocument({
  projectId: project.id,
  title: "Should roll back",
  body: "broken transaction",
  existingDocumentId: created.documentId,
});
test.assert(!failed.ok, "a failed Project transaction reports failure");
test.assert(JSON.stringify(context.chatFiles) === JSON.stringify(beforeFailure.files), "failure restores the target file");
test.assert(JSON.stringify(context.chatFolders) === JSON.stringify(beforeFailure.folders), "failure restores the folder snapshot");
test.assert(project.quickDraft.workspace.projectDocId === beforeFailure.projectDocId, "failure restores projectDocId");
test.assert(context.selectedChatFileId === beforeFailure.selectedChatFileId, "failure restores selection");

context.saveDeskState = async () => true;
controls.get("quick-draft-draft").value = "# Handoff\n\nBody";
await api.transferQuickDraftToTeachText();
test.assert(context.teachTextDocumentId === project.quickDraft.workspace.projectDocId, "TeachText receives only the durable documentId");
await api.sendQuickDraftToReviewDesk();
test.assert(context.reviewDeskOpenOptions?.documentId === project.quickDraft.workspace.projectDocId, "Review Desk receives the durable documentId");
test.assert(context.reviewDeskOpenOptions?.mode === "facts", "Review Desk owns its requested review mode");

test.assertNotIncludes(handoffSource, "teachTextFolderInput", "Draft Desk does not depend on TeachText folder selection");
test.assertNotIncludes(handoffSource, "reviewDeskBodyInput", "Draft Desk does not reach into Review Desk DOM");
test.assertIncludes(handoffSource, "window.AISystem6TeachText?.openDocument", "TeachText handoff uses its public API");
test.assertIncludes(handoffSource, "window.AISystem6ReviewDesk?.openDocument", "Review Desk handoff uses its public API");

test.finish();
