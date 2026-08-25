// 文字亮室 P0: the darkroom record moves out of the Quick Draft workspace.
//
// This is the one migration that changes durable data with no visible change on
// screen, so the rule is executed here rather than read: text in, data out, in
// a bare vm. Nothing writes to disk until this passes and a dry-run over the
// writer's real records agrees with it.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("darkroom-record");
const source = read("app/core/darkroom-record.js");

test.assertNotIncludes(source, "document.", "the record layer never touches the DOM");
test.assertNotIncludes(source, "indexedDB", "the record layer never touches storage");
test.assertNotIncludes(source, "t(\"", "the record layer never touches translations");
test.assertNotIncludes(source, "normalizeAdjustmentLayer", "layers are carried verbatim, never reinterpreted by a migration");

const context = vm.createContext({ window: {}, structuredClone });
vm.runInContext(source, context);
const D = context.window.AISystem6DarkroomRecord;

const legacyWorkspace = {
  schemaVersion: 3,
  title: "交接给谁",
  body: "他要的不是流程图。",
  projectDocId: "doc-7",
  materials: [{ id: "S1", label: "微信群" }],
  adjustmentLayers: [{ kind: "mingming", enabled: true, strength: 50, mask: [{ start: 2, end: 3 }] }],
  protectedRanges: [{ start: 3, end: 3 }],
  versions: [{ id: "v1", body: "旧的一版。" }],
  composition: {
    negative: "他要的不是流程图。",
    negativeUpdatedAt: "T1",
    modelDelivered: "他需要的并不是一张流程图。",
    modelDeliveredAt: "T2",
    composite: "合成过的。",
    currentKey: "tc-abc",
    generatedAt: "T3",
  },
  legacy: { canvas: { objects: [{ id: "o1" }] } },
  updatedAt: "T4",
};

const plan = D.planDarkroomMigration({ projectId: "p1", workspace: legacyWorkspace });

test.assert(plan.key === "darkroom:p1:doc-7", "the record is keyed by project and document, the way revisions already are");
test.assert(plan.blocked === false, "a draft that has a document can be moved");
test.assert(plan.record.negative === "他要的不是流程图。" && plan.record.modelDelivered === "他需要的并不是一张流程图。", "the negative and the delivered body move verbatim");
test.assert(plan.record.protectedRanges.length === 1 && plan.record.protectedRanges[0].start === 3, "the writer's locks move unchanged");
test.assert(plan.record.adjustmentLayers[0].mask[0].end === 3, "a layer keeps its mask through the move");
test.assert(plan.record.versions.length === 1, "the version chain moves with the record it belongs to");

// The moved record must not still be reachable through the old shape, or two
// truths exist and the next writer picks the wrong one.
for (const field of D.DARKROOM_WORKSPACE_FIELDS) {
  test.assert(!(field in plan.workspace), `${field} no longer exists on the workspace`);
}
test.assert(plan.workspace.schemaVersion === 4, "the workspace announces the new shape");
test.assert(plan.workspace.body === "他要的不是流程图。" && plan.workspace.title === "交接给谁", "everything that is not the darkroom's stays put");
test.assert(Array.isArray(plan.workspace.materials) && plan.workspace.materials.length === 1, "materials stay with the draft that gathered them");

// The retired canvas bucket is dropped rather than carried forward again.
test.assert(plan.droppedLegacyCanvas === true, "a record still carrying the retired canvas reports that it was dropped");
test.assert(!("legacy" in plan.workspace) && !("canvas" in plan.workspace), "the retired canvas bucket is not copied forward");

// A draft that never met a model has nothing to move, and must not get an
// empty record: "no record" and "an empty record" have to keep meaning the same.
const untouched = D.planDarkroomMigration({ projectId: "p1", workspace: { schemaVersion: 3, body: "只是打了几个字。", projectDocId: "doc-8" } });
test.assert(D.workspaceHasDarkroomState({ body: "x" }) === false, "a workspace with no darkroom state says so");
test.assert(untouched.record === null && untouched.key === "", "nothing to move writes no record");
test.assert(untouched.blocked === false, "having nothing to move is not being blocked");

// Darkroom state with no document to hang it on is reported, never given an
// invented key — that is how a negative gets orphaned.
const orphan = D.planDarkroomMigration({ projectId: "p1", workspace: { ...legacyWorkspace, projectDocId: "" } });
test.assert(orphan.blocked === true && orphan.key === "", "state with no document is reported as blocked, not filed under a guess");
test.assert(orphan.record !== null, "a blocked plan still carries the state, so the caller can move it once a document exists");

// Pure means pure: planning twice returns the same thing and changes nothing.
const before = JSON.stringify(legacyWorkspace);
D.planDarkroomMigration({ projectId: "p1", workspace: legacyWorkspace });
test.assert(JSON.stringify(legacyWorkspace) === before, "planning a migration never mutates the record it was given");

test.finish();
