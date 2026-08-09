import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("draft-desk-boundaries");
const ai = read("app/features/quick-draft-ai.js");
const intake = read("app/features/quick-draft-intake.js");
const coordinator = read("app/features/draft-desk.js");
const chatMessages = read("app/core/chat-messages.js");
const presets = read("app/data/draft-desk-presets.js");
const draftDeskFeatures = [
  coordinator,
  intake,
  ai,
  read("app/features/quick-draft-editor.js"),
  read("app/features/quick-draft-composition.js"),
  read("app/features/quick-draft-handoff.js"),
].join("\n");
const { addProject, context, controls } = createDraftDeskVm();
const api = context.window.__draftDeskTest;
const project = addProject("project-a", "# Durable title\n\nDurable body", {
  materials: [{ id: "source-1", label: "Source" }],
  protectedRanges: [{ id: "protect-1", start: 1, end: 1 }],
  versions: [{ id: "version-1", body: "Old body" }],
  projectDocId: "document-1",
});

const snapshot = api.quickDraftContextSnapshot(project.quickDraft);
test.assert(snapshot.body.includes("Durable body"), "context snapshot reads the durable body");
test.assert(snapshot.materials.length === 1 && snapshot.versionCount === 1, "context snapshot exposes canonical material and version metadata");
test.assert(snapshot.projectDocId === "document-1", "context snapshot exposes the public document boundary");
snapshot.materials[0].label = "mutated";
test.assert(project.quickDraft.workspace.materials[0].label === "Source", "context snapshot is detached from Project Hard Disk state");

test.assert(context.window.AISystem6DraftDeskPresets.scenarioMap["first-day-hands-on"] === "launch-day-tech", "first-day hands-on selects the launch-day tech preset");
test.assert(context.window.AISystem6DraftDeskPresets.scenarioMap["hands-on-review"] === "launch-day-tech-review", "hands-on review selects the review preset");
test.assert(context.window.AISystem6DraftDeskPresets.scenarioMap["bili-dynamic"] === "generic-bili", "Bilibili dynamic selects the generic preset");
controls.get("quick-draft-format").value = "first-day-hands-on";
const signals = api.inferStrategySignals("Liquid Glass 和 Apple Pay 都还要再录");
test.assert(signals.materialLedger.some((line) => line.includes("Liquid Glass")), "launch-day preset contributes its product detector");
controls.get("quick-draft-format").value = "bili-dynamic";
const genericSignals = api.inferStrategySignals("Liquid Glass 和 Apple Pay 都还要再录");
test.assert(!genericSignals.materialLedger.some((line) => line.includes("Liquid Glass")), "generic preset does not inherit private launch-day detectors");

for (const source of [ai, intake, coordinator]) {
  test.assert(!/(Aaron|落落|Luoluo|Apple Pay|Apple Music|iPhone Mirroring|Liquid Glass)/.test(source), "Draft Desk core has no private author or product rules");
}
test.assertIncludes(presets, '"launch-day-tech"', "private launch-day knowledge lives in preset data");
test.assertIncludes(chatMessages, "window.AISystem6QuickDraft?.getContextSnapshot?.()", "ClioTalk uses the Draft Desk public context API when loaded");
test.assertIncludes(chatMessages, "quickDraftContextSnapshot(project?.quickDraft", "ClioTalk uses the pure workspace fallback while Draft Desk is lazy");
const contextFunction = chatMessages.slice(
  chatMessages.indexOf("function currentQuickDraftForClioTalk"),
  chatMessages.indexOf("function formatQuickDraftForClioTalk")
);
test.assertNotIncludes(contextFunction, "document.", "ClioTalk no longer reads Draft Desk DOM");
for (const forbidden of ["setProjectOutlineMarkdown", "syncDraftsFromProjectOutline"]) {
  test.assertNotIncludes(draftDeskFeatures, forbidden, `Draft Desk does not mutate Writing Studio through ${forbidden}`);
}
test.assert(!/(?:slot|project)\.project\.(?:flowState|questionSheet)\s*=/.test(draftDeskFeatures), "Draft Desk does not assign Writing Studio route state");
const saveQuickDraftCalls = [...draftDeskFeatures.matchAll(/saveQuickDraft\(/g)];
test.assert(saveQuickDraftCalls.length === 3, "only the save helper and two input-like paths use the debounced save API");
test.assertNotIncludes(coordinator, "void persistQuickDraftWorkspace", "Draft Desk contains no fire-and-forget durable save path");
test.assertIncludes(coordinator, 'addEventListener("click", async () => { await saveQuickDraftAsProjectDocument(); })', "Project Save handler awaits its transaction");
test.assertIncludes(coordinator, 'addEventListener("click", async () => { await sendQuickDraftToReviewDesk(); })', "Review handoff handler awaits its public API");

test.finish();
