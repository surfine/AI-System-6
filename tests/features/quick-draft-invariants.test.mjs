// Quick Draft closure invariants. Pure composition behavior runs in a VM;
// coordinator assertions pin the durable ownership boundaries without E2E.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("quick-draft-invariants");
const layers = read("app/core/adjustment-layers.js");
const protectedRanges = read("app/core/protected-ranges.js");
const compose = read("app/core/text-compose.js");
const workspace = read("app/core/quick-draft-workspace.js");
const coordinator = read("app/features/draft-desk.js");
const state = `${workspace}\n${coordinator}`;
const intake = read("app/features/quick-draft-intake.js");
const composition = read("app/features/quick-draft-composition.js");
const handoff = read("app/features/quick-draft-handoff.js");

const context = vm.createContext({ window: {} });
vm.runInContext(layers, context);
vm.runInContext(protectedRanges, context);
vm.runInContext(compose, context);

test.assertIncludes(intake, "const ventEntries = nonDumpVentEntries(intake)", "Versions never enter sourceRecordsFromForm");
test.assertIncludes(composition, "commitQuickDraft({ workspace: { composition:", "Apply durably commits preview metadata");
test.assertIncludes(composition, '"- This layer applies to the whole draft."', "an empty original mask explicitly means whole draft");
test.assertIncludes(composition, "!normalizeAdjustmentLayerMask(layer.mask).length", "an empty mask remains applicable even when Protect exists");
test.assertIncludes(composition, "remapLineRangesAfterSentinels(layer.mask, protectedRanges).length", "a non-empty mask fully consumed by Protect is skipped");
test.assertNotIncludes(composition, "projectDocId || activeTextFileId", "Develop never borrows activeTextFileId");
test.assertIncludes(composition, "if (slot.record.workspace.projectDocId", "Develop creates a document revision only for its own Project document");
test.assertIncludes(state, "schemaVersion: 3", "workspace v3 is canonical");
test.assertIncludes(state, 'entry.sourceKind === "quick-draft-dump"', "v2 dumps are recognized only by migration");
test.assertIncludes(state, "intake.ventLog = intake.ventLog.filter", "migration removes dumps from material intake");
test.assertIncludes(state, "async function commitQuickDraft", "durable writes use an awaited commit API");
test.assertIncludes(state, "scheduleQuickDraftCommit(projectId)", "debounced saves capture their originating project");
test.assertIncludes(handoff, "openTextFile(documentId)", "Send to TeachText opens the durable Project document");
test.assertNotIncludes(handoff, "setProjectOutlineMarkdown", "Send to TeachText does not mutate the writing pipeline");
test.assertIncludes(handoff, "Object.assign(file, previousFile)", "failed Project document updates roll back the target");
test.assertIncludes(state, 'titleMode: source.titleMode === "manual"', "manual title ownership survives normalize and reload");

const calls = [];
await context.composeDocument({
  source: "一\n二\n三",
  layers: ["mingming", "luoluo", "hkrr", "density"].map((kind) => ({ kind, enabled: true, mask: [] })),
  runModel: async ({ layers: stack }) => {
    calls.push(stack.map((layer) => layer.kind));
    return "一\n二\n三";
  },
});
test.assert(calls.length === 1 && calls[0].length === 4, "four enabled layers equal one model call");
test.assert(context.defaultAdjustmentLayers().every((layer) => !layer.enabled), "new drafts start with every layer off");

const duplicate = context.protectTextWithSentinels("重复\n中间\n重复", [{ start: 1, end: 1 }, { start: 3, end: 3 }]);
test.assert(duplicate.sentinels.length === 2 && duplicate.sentinels[0].token !== duplicate.sentinels[1].token, "equal protected regions have unique identities");
test.assert(context.verifyProtectedSentinels(duplicate.protectedText, duplicate.sentinels).valid, "equal protected regions verify independently");

test.finish();
