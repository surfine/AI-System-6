// @ts-check
// 文字亮室 — the darkroom record, keyed by document rather than by application.
//
// The negative, the adjustment stack, the protected ranges and the version
// chain used to live inside the Quick Draft workspace, which made them Quick
// Draft's private property. They are properties of a document: the same
// manuscript can be developed whether it came from Quick Draft, from Writing
// Studio, or off the Project Hard Disk. So they move to their own record,
// keyed the way document revisions already are.
//
// This module is pure data — no DOM, no storage, no translations — so the
// migration can be executed in a test and dry-run against real records before
// anything is written. The storage layer lives beside it; the rule that a
// document has exactly one editable owner at a time is unchanged, and stays
// with the write lease.
//
// This does not take over the "Versions…" File-menu history
// (app/core/document-revisions.js). That store holds explicit snapshots; this
// chain holds what each model pass replaced. Two different questions, two
// different stores, and the darkroom only reads the other one.

const DARKROOM_SCHEMA_VERSION = 1;

function darkroomStorageKey(projectId, documentId) {
  return `darkroom:${String(projectId || "")}:${String(documentId || "")}`;
}

function blankDarkroomRecord() {
  return {
    schemaVersion: DARKROOM_SCHEMA_VERSION,
    negative: "",
    negativeUpdatedAt: "",
    modelDelivered: "",
    modelDeliveredAt: "",
    composite: "",
    currentKey: "",
    generatedAt: "",
    adjustmentLayers: [],
    protectedRanges: [],
    versions: [],
    updatedAt: "",
  };
}

function darkroomText(value) {
  return typeof value === "string" ? value : "";
}

function darkroomList(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

/**
 * The fields a Quick Draft workspace used to carry, read out of it verbatim.
 * Nothing is interpreted here: normalizing the layers and ranges stays with the
 * modules that own those shapes, so a migration can never quietly change what a
 * layer or a lock meant.
 * @param {Record<string, any>} workspace
 */
function darkroomRecordFromWorkspace(workspace = {}) {
  const source = workspace && typeof workspace === "object" ? workspace : {};
  const composition = source.composition && typeof source.composition === "object" ? source.composition : {};
  return {
    ...blankDarkroomRecord(),
    negative: darkroomText(composition.negative),
    negativeUpdatedAt: darkroomText(composition.negativeUpdatedAt),
    modelDelivered: darkroomText(composition.modelDelivered),
    modelDeliveredAt: darkroomText(composition.modelDeliveredAt),
    composite: darkroomText(composition.composite),
    currentKey: darkroomText(composition.currentKey),
    generatedAt: darkroomText(composition.generatedAt),
    adjustmentLayers: darkroomList(source.adjustmentLayers),
    protectedRanges: darkroomList(source.protectedRanges),
    versions: darkroomList(source.versions),
    updatedAt: darkroomText(source.updatedAt),
  };
}

// Whether a workspace still carries anything the darkroom owns. A workspace
// that never met a model has nothing to move, and moving nothing must not
// create a record: an empty darkroom record and no record at all have to keep
// meaning the same thing.
function workspaceHasDarkroomState(workspace = {}) {
  const record = darkroomRecordFromWorkspace(workspace);
  return Boolean(
    record.negative
    || record.negativeUpdatedAt
    || record.modelDelivered
    || record.composite
    || record.currentKey
    // A stack of default layers is not state; only one that was actually
    // touched is. The record layer cannot call the normalizer, so it asks
    // whether any layer differs from off-at-standard.
    || record.adjustmentLayers.some((layer) => layer?.enabled || (layer?.mask || []).length || (layer?.strength && layer.strength !== 50))
    || record.protectedRanges.length
    || record.versions.length
  );
}

const DARKROOM_WORKSPACE_FIELDS = Object.freeze(["composition", "adjustmentLayers", "protectedRanges", "versions"]);

/**
 * The workspace with the darkroom's fields removed, and with the retired canvas
 * bucket dropped rather than carried forward again. Nothing has read that
 * bucket since the canvas was consolidated away in 1.0.29; it has been copied
 * into every saved record since, and a migration is the one cheap moment to
 * stop copying it.
 * @param {Record<string, any>} workspace
 */
function workspaceWithoutDarkroom(workspace = {}) {
  const next = { ...(workspace && typeof workspace === "object" ? workspace : {}) };
  for (const field of DARKROOM_WORKSPACE_FIELDS) delete next[field];
  delete next.legacy;
  delete next.canvas;
  next.schemaVersion = 4;
  return next;
}

/**
 * One project record in, the whole migration out — as data, so a caller can
 * show it before writing any of it. `writes` is what would go to the darkroom
 * store; `workspace` is what would replace the Quick Draft record.
 * @param {{ projectId?: string, workspace?: Record<string, any> }} input
 */
function planDarkroomMigration({ projectId = "", workspace = {} } = {}) {
  const documentId = darkroomText(workspace?.projectDocId);
  const carries = workspaceHasDarkroomState(workspace);
  const record = carries ? darkroomRecordFromWorkspace(workspace) : null;
  return {
    projectId: String(projectId || ""),
    documentId,
    // Darkroom state with no document to hang it on cannot be moved. The
    // caller has to give the draft a document first; reporting it rather than
    // inventing a key is what keeps a migration from orphaning a negative.
    blocked: Boolean(carries && !documentId),
    key: carries && documentId ? darkroomStorageKey(projectId, documentId) : "",
    record,
    workspace: workspaceWithoutDarkroom(workspace),
    droppedLegacyCanvas: Boolean(workspace?.legacy?.canvas || workspace?.canvas),
  };
}

window.AISystem6DarkroomRecord = Object.freeze({
  DARKROOM_SCHEMA_VERSION,
  DARKROOM_WORKSPACE_FIELDS,
  blankDarkroomRecord,
  darkroomRecordFromWorkspace,
  darkroomStorageKey,
  planDarkroomMigration,
  workspaceHasDarkroomState,
  workspaceWithoutDarkroom,
});
