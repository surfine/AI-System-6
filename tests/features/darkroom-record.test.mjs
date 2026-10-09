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
test.assert(plan.record.settings.protected.length === 1 && plan.record.settings.protected[0].start === 3, "the writer's locks move unchanged, into the settings");
test.assert(plan.record.settings.layers[0].scope[0].end === 3, "a layer keeps its mask, now called its scope, through the move");
test.assert(plan.record.schemaVersion === D.DARKROOM_SCHEMA_VERSION && D.DARKROOM_SCHEMA_VERSION === 2, "a moved record is written in the current schema");
test.assert(!("adjustmentLayers" in plan.record) && !("protectedRanges" in plan.record), "the schema-1 fields do not outlive the move as a second truth");
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

// ---- Schema 2: settings ---------------------------------------------------------
// A schema-1 record, as it sits in IndexedDB today.
const v1 = {
  schemaVersion: 1,
  negative: "原稿。",
  negativeUpdatedAt: "T1",
  modelDelivered: "",
  modelDeliveredAt: "",
  composite: "",
  currentKey: "",
  generatedAt: "",
  adjustmentLayers: [
    { kind: "mingming", enabled: true, strength: 75, mask: [{ start: 2, end: 4 }], note: "per-layer field this module has never heard of" },
    { kind: "luoluo", enabled: false, strength: 25, mask: [] },
    { kind: "hkrr", strength: 50 },
    { kind: "density", enabled: true, strength: 33 },
  ],
  protectedRanges: [{ start: 5, end: 6 }],
  versions: [{ id: "v1", body: "旧。", reason: "before-develop" }],
  traffic: { body: "内容栏的结果", sourceKey: "9:1" },
  futureField: { nested: [1, 2, 3] },
  updatedAt: "T2",
};
const frozen = JSON.stringify(v1);
const v2 = D.migrateDarkroomRecord(v1);
test.assert(JSON.stringify(v1) === frozen, "migrating a record never mutates the one it was given");
test.assert(v2.schemaVersion === 2, "the migrated record announces schema 2");
test.assert(v2.settings.layers.length === 4, "every stored layer becomes a settings layer, none dropped");
const [reader, listener, lift, density] = v2.settings.layers;
test.assert(reader.kind === "mingming" && reader.on === true && reader.step === 3, "the switch becomes `on`, a 75% strength becomes step 3");
test.assert(reader.scope.length === 1 && reader.scope[0].start === 2 && reader.scope[0].end === 4, "a layer's mask moves verbatim into its scope");
test.assert(listener.on === false && listener.step === 1, "an off layer stays off and 25% is step 1");
test.assert(lift.on === true, "a stored layer with no switch keeps the old implicit-on meaning");
test.assert(density.step === 2, "a strength that is not one of the three stops reads as the standard stop, as the desk's normalizer always did");
test.assert(reader.note === "per-layer field this module has never heard of", "a field on a layer this module does not know survives the migration");
test.assert(v2.settings.protected.length === 1 && v2.settings.protected[0].end === 6, "the locks move into settings.protected");
test.assert(v2.settings.disabled === false, "the new bypass switch starts off");
test.assert(Array.isArray(v2.layerCache) && v2.layerCache.length === 0, "the new layer cache starts empty");
test.assert(v2.traffic?.body === "内容栏的结果" && v2.futureField?.nested?.[2] === 3, "fields the record layer does not know survive: the content track's result and a future field");
test.assert(v2.negative === "原稿。" && v2.versions[0].id === "v1" && v2.updatedAt === "T2", "the negative, the chain and the stamps are untouched");
test.assert(!("adjustmentLayers" in v2) && !("protectedRanges" in v2), "the two old fields are gone after the move");
test.assert(JSON.stringify(D.migrateDarkroomRecord(v2)) === JSON.stringify(v2), "migrating a migrated record changes nothing");
test.assert(D.migrateDarkroomRecord(null).schemaVersion === 2 && D.migrateDarkroomRecord(undefined).settings.layers.length === 0, "nothing in, a blank current record out");
const roundTrip = D.darkroomSettingsFromLayers(D.darkroomLayersFromSettings(v2.settings), v2.settings);
test.assert(JSON.stringify(roundTrip) === JSON.stringify(v2.settings), "settings -> working layers -> settings loses nothing, including the layer field it does not know");
test.assert(D.darkroomStepFromStrength(25) === 1 && D.darkroomStepFromStrength(75) === 3 && D.darkroomStrengthFromStep(1) === 25 && D.darkroomStrengthFromStep(3) === 75, "step and strength convert exactly");
// A workspace with the pending bucket written in either shape.
const pendingOld = D.darkroomRecordFromWorkspace({ adjustmentLayers: [{ kind: "hkrr", enabled: true, strength: 25 }], composition: { negative: "n" } });
test.assert(pendingOld.settings.layers[0].step === 1 && pendingOld.negative === "n", "a pre-schema-4 pending bucket comes out in the current shape");
const pendingNew = D.darkroomRecordFromWorkspace({ settings: { layers: [{ kind: "hkrr", on: true, step: 3, scope: [] }], protected: [], disabled: true }, adjustmentLayers: [{ kind: "clean", enabled: true }] });
test.assert(pendingNew.settings.layers.length === 1 && pendingNew.settings.disabled === true, "a bucket that already carries settings is read as settings, and the stale legacy field beside it is ignored");
test.assert(D.workspaceHasDarkroomState({ adjustmentLayers: [{ kind: "mingming", enabled: true, strength: 50 }] }) === true, "a touched stack counts as darkroom state");
test.assert(D.workspaceHasDarkroomState({ adjustmentLayers: [{ kind: "mingming", enabled: false, strength: 50, mask: [] }] }) === false, "an untouched stack does not");

// ---- The negative goes stale, and a re-shoot replaces it -------------------------
const base = { negative: "第一版。", negativeUpdatedAt: "T1", modelDelivered: "第二版。", versions: [{ id: "a", body: "更早。" }] };
test.assert(D.darkroomNegativeState({ negative: "", negativeUpdatedAt: "" }, "随便什么").state === "none", "a document the darkroom has not touched has no negative to be stale");
test.assert(D.darkroomNegativeState(base, "第一版。").state === "fresh", "the body that is the negative is fresh");
test.assert(D.darkroomNegativeState(base, "第一版。\n").state === "fresh", "a trailing newline is not a change");
test.assert(D.darkroomNegativeState(base, "第二版。").state === "fresh", "the body the last develop wrote is the darkroom's own, not stale");
test.assert(D.darkroomNegativeState(base, "更早。").state === "fresh", "a body that is a stored version is a known state");
test.assert(D.darkroomNegativeState(base, "").state === "fresh", "an emptied body has nothing to say about a negative");
test.assert(D.darkroomNegativeState(base, "第二版。我又写了一句。").state === "stale", "a body the writer kept writing is stale: the negative has never seen those words");
const shot = D.reshootDarkroomNegative({ ...base, composite: "旧合成", currentKey: "tc-1", generatedAt: "T", layerCache: [{ key: "k", output: "o" }] }, "第二版。我又写了一句。", { now: "T9", id: "v-shot" });
test.assert(shot.record.negative === "第二版。我又写了一句。" && shot.record.negativeUpdatedAt === "T9", "re-shooting takes the current body as the new negative");
test.assert(shot.version.body === "第一版。" && shot.version.reason === "before-reshoot" && shot.record.versions.at(-1).id === "v-shot", "the old negative is saved as a version first");
test.assert(shot.record.composite === "" && shot.record.currentKey === "" && shot.record.modelDelivered === "", "everything computed from the old negative is cleared");
test.assert(shot.record.layerCache.length === 1, "the layer cache survives a re-shoot: its keys name their inputs, so nothing in it can be wrong");
test.assert(D.darkroomNegativeState(shot.record, "第二版。我又写了一句。").state === "fresh", "after the re-shoot the body is no longer stale");
test.assert(base.negative === "第一版。" && base.versions.length === 1, "re-shooting never mutates the record it was given");
test.assert(D.reshootDarkroomNegative(base, "  ", { now: "T9" }).refused === "empty", "an empty body is refused, not set as the negative");
const grainChain = D.darkroomChainVersions(shot.record);
test.assert(grainChain.length === 0, "versions from before a re-shoot, and the negative set aside, are not passes of the new baseline");

// ---- Versions: named, automatic, pruned -----------------------------------------------------
const auto = (n, extra = {}) => ({ id: `auto-${n}`, body: `离开时的第 ${n} 版`, reason: "leave", ...extra });
const many = Array.from({ length: 25 }, (_, n) => auto(n));
const pruned = D.pruneDarkroomVersions(many);
test.assert(pruned.length === 20 && pruned[0].id === "auto-5" && pruned.at(-1).id === "auto-24", "only the newest twenty automatic versions are kept");
const withNamed = D.pruneDarkroomVersions([auto(0, { name: "删减之前" }), ...many.slice(1)]);
test.assert(withNamed.some((entry) => entry.id === "auto-0" && entry.name === "删减之前") && withNamed.length === 21, "a named automatic version is never pruned to make room");
const mixed = D.pruneDarkroomVersions([
  { id: "kept", body: "存下的", reason: "kept" },
  { id: "dev", body: "冲洗前", reason: "before-develop" },
  ...many,
]);
test.assert(mixed.some((entry) => entry.id === "kept") && mixed.some((entry) => entry.id === "dev"), "a kept version and a before-develop frame are not automatic and are not pruned by the automatic limit");
const huge = Array.from({ length: 130 }, (_, n) => ({ id: `d${n}`, body: `${n}`, reason: "before-develop", ...(n === 3 ? { name: "留着" } : {}) }));
const capped = D.pruneDarkroomVersions(huge);
test.assert(capped.length === 100 && capped.some((entry) => entry.name === "留着"), "the overall cap drops the oldest unnamed frames and never a named one");
const renamed = D.nameDarkroomVersion({ versions: [{ id: "a", body: "x" }, { id: "b", body: "y" }] }, "b", "  最终   稿  ");
test.assert(renamed.versions[1].name === "最终 稿" && !("name" in renamed.versions[0]), "a name is trimmed, spaced once, and set on the one version");
test.assert(!("name" in D.nameDarkroomVersion(renamed, "b", "").versions[1]), "an empty name removes the name");
test.assert(D.nameDarkroomVersion(renamed, "zzz", "x") === null, "naming a version that is not there changes nothing");
test.assert(D.nameDarkroomVersion({ versions: [{ id: "a", body: "x" }] }, "a", "非".repeat(200)).versions[0].name.length === 60, "a name is cut to what a frame can show");
const left = D.leaveDarkroomVersion({ negative: "旧底片", versions: [] }, "离开时的正文", { now: "T5", id: "leave-1" });
test.assert(left.added && left.record.versions[0].reason === "leave" && left.record.versions[0].body === "离开时的正文", "leaving a document keeps its text as an automatic version");
test.assert(D.leaveDarkroomVersion(left.record, "离开时的正文", { id: "leave-2" }).added === false, "leaving again with the same text keeps nothing more");
test.assert(D.leaveDarkroomVersion({ negative: "旧底片", versions: [] }, "旧底片", { id: "x" }).added === false, "a text that is the negative is already kept");
test.assert(D.leaveDarkroomVersion({ negative: "", versions: [] }, "   ", { id: "x" }).added === false, "an empty body keeps nothing");
const chainRecord = { chainBase: "", versions: [{ id: "p", body: "A", reason: "before-develop" }, { id: "l", body: "B", reason: "leave" }, { id: "k", body: "C", reason: "kept" }] };
test.assert(D.darkroomChainVersions(chainRecord).map((entry) => entry.id).join() === "p,k", "a copy kept on leaving is not a pass in the grain chain");

// ---- The layer cache -----------------------------------------------------------------------
const seen = [];
const layerCache = D.createDarkroomLayerCache([], { limit: 3, onChange: (entries) => seen.push(entries.map((entry) => entry.key).join()) });
["a", "b", "c"].forEach((key) => layerCache.set(key, `out-${key}`, { kind: "clean" }));
test.assert(layerCache.size === 3 && layerCache.has("a"), "the cache holds up to its limit");
layerCache.get("a");
layerCache.set("d", "out-d");
test.assert(!layerCache.has("b") && layerCache.has("a") && layerCache.has("d"), "past the limit the oldest entry goes, and a hit counts as recent use");
test.assert(seen.at(-1) === "c,a,d", "the owner is told the whole entry list after each write");
test.assert(layerCache.entries().find((entry) => entry.key === "d").output === "out-d", "an entry keeps its output");
test.assert(D.DARKROOM_LAYER_CACHE_LIMIT === 24, "the record keeps 24 layer outputs");

test.finish();
