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

// Schema 2 (migrateDarkroomRecord below): the layer stack and the protected
// ranges move into one `settings` object, the shape the develop pipeline reads
// and the presets copy -- { layers: [{ kind, on, step, scope }], protected,
// disabled } -- and the record gains `layerCache`, the per-layer outputs that
// make "change layer 3, do not re-run layers 1 and 2" true. A migration is a
// rename, never a reinterpretation: every layer and every range travels
// verbatim, and any field this module does not know survives.
const DARKROOM_SCHEMA_VERSION = 2;

// One layer's output per entry, oldest dropped. Bounded because the record
// lives in one keyval entry and every entry is a whole rewritten text.
const DARKROOM_LAYER_CACHE_LIMIT = 24;
// Leaving a document keeps one automatic version; only this many survive.
// A version the writer named, or kept on purpose, is never auto-pruned.
const DARKROOM_AUTO_VERSION_LIMIT = 20;
const DARKROOM_VERSION_LIMIT = 100;
const DARKROOM_VERSION_NAME_LIMIT = 60;
const DARKROOM_AUTO_REASONS = Object.freeze(["leave"]);
// Versions that are a copy of a state, not the body a model pass replaced.
// The grain view reads the version chain as "the body before pass k", so a
// copy taken on leaving, or the negative a re-shoot sets aside, must not count
// as a pass.
const DARKROOM_NON_CHAIN_REASONS = Object.freeze(["leave", "before-reshoot"]);
const DARKROOM_STEP_STRENGTHS = Object.freeze([25, 50, 75]);

function darkroomStorageKey(projectId, documentId) {
  return `darkroom:${String(projectId || "")}:${String(documentId || "")}`;
}

function blankDarkroomSettings() {
  return { layers: [], protected: [], disabled: false };
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
    settings: blankDarkroomSettings(),
    layerCache: [],
    versions: [],
    // The id of the last version that existed when the negative was re-shot.
    // The grain chain starts after it: passes before a re-shoot belong to a
    // negative that is no longer the writer's baseline.
    chainBase: "",
    updatedAt: "",
  };
}

function darkroomText(value) {
  return typeof value === "string" ? value : "";
}

function darkroomIsObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function darkroomClone(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function darkroomList(value) {
  return Array.isArray(value) ? darkroomClone(value) : [];
}

// ---- Step and strength ------------------------------------------------------
// A layer's stored strength is a percentage (25 / 50 / 75); the settings keep
// the three stops as 1 / 2 / 3, the way the Strength control shows them. The
// two are the same dial and convert exactly in both directions.
function darkroomStepFromStrength(strength) {
  const index = DARKROOM_STEP_STRENGTHS.indexOf(Number(strength));
  return index < 0 ? 2 : index + 1;
}

function darkroomStrengthFromStep(step) {
  const value = Number(step);
  return value === 1 || value === 2 || value === 3 ? DARKROOM_STEP_STRENGTHS[value - 1] : 50;
}

// ---- Migration: schema 1 -> 2 ----------------------------------------------
/**
 * A schema-1 layer as a settings layer. Nothing is interpreted: the kind, the
 * switch, the stop and the mask move under their new names, and any other
 * property the layer carried rides along untouched. A layer with no `enabled`
 * field used the old implicit-on meaning, and keeps it.
 * @param {any} layer
 */
function darkroomSettingsLayerFromLegacy(layer) {
  const source = darkroomIsObject(layer) ? layer : {};
  const { enabled, strength, mask, ...rest } = source;
  return {
    ...darkroomClone(rest),
    kind: String(source.kind || ""),
    on: Object.prototype.hasOwnProperty.call(source, "enabled") ? enabled !== false : true,
    step: darkroomStepFromStrength(strength),
    scope: darkroomClone(mask ?? []),
  };
}

/**
 * Any record in, a schema-2 record out. Pure and idempotent: migrating a
 * migrated record returns an equal record, and a field this module has never
 * heard of (the content track's `traffic`, a future field) comes through
 * untouched, because dropping it would be a data loss that no test of the
 * known fields could see.
 * @param {any} input
 */
function migrateDarkroomRecord(input) {
  const source = darkroomIsObject(input) ? input : {};
  const next = { ...blankDarkroomRecord(), ...darkroomClone(source) };
  const alreadySettings = darkroomIsObject(source.settings)
    && Number(source.schemaVersion) >= 2;
  if (!alreadySettings) {
    next.settings = {
      ...blankDarkroomSettings(),
      ...(darkroomIsObject(source.settings) ? darkroomClone(source.settings) : {}),
      layers: darkroomList(source.adjustmentLayers).map(darkroomSettingsLayerFromLegacy),
      protected: darkroomList(source.protectedRanges),
    };
  }
  delete next.adjustmentLayers;
  delete next.protectedRanges;
  next.settings = {
    ...next.settings,
    layers: Array.isArray(next.settings.layers) ? next.settings.layers : [],
    protected: Array.isArray(next.settings.protected) ? next.settings.protected : [],
    disabled: next.settings.disabled === true,
  };
  next.layerCache = (Array.isArray(next.layerCache) ? next.layerCache : [])
    .filter((entry) => darkroomIsObject(entry) && typeof entry.key === "string" && entry.key)
    .slice(-DARKROOM_LAYER_CACHE_LIMIT);
  next.versions = Array.isArray(next.versions) ? next.versions : [];
  next.chainBase = darkroomText(next.chainBase);
  next.schemaVersion = DARKROOM_SCHEMA_VERSION;
  return next;
}

/**
 * The fields a Quick Draft workspace used to carry, read out of it verbatim.
 * Nothing is interpreted here: normalizing the layers and ranges stays with the
 * modules that own those shapes, so a migration can never quietly change what a
 * layer or a lock meant. The result is a current-schema record.
 * @param {Record<string, any>} workspace
 */
function darkroomRecordFromWorkspace(workspace = {}) {
  const source = workspace && typeof workspace === "object" ? workspace : {};
  const composition = source.composition && typeof source.composition === "object" ? source.composition : {};
  // A pending bucket written after the schema-2 cut already carries settings;
  // one written before it carries the two old fields. Either is read as it is.
  return migrateDarkroomRecord({
    ...darkroomClone(composition),
    schemaVersion: source.settings ? DARKROOM_SCHEMA_VERSION : 1,
    settings: source.settings,
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
  });
}

// Whether a record holds anything of the writer's: a negative, a proof, a
// version, a layer that was touched, a lock. A stack of default layers is not
// state; only one that was actually touched is. The record layer cannot call
// the normalizer, so it asks whether any layer differs from off-at-standard.
/** @param {any} record */
function darkroomRecordHasState(record) {
  const source = darkroomIsObject(record) ? record : {};
  const settings = darkroomIsObject(source.settings) ? source.settings : {};
  return Boolean(
    source.negative
    || source.negativeUpdatedAt
    || source.modelDelivered
    || source.composite
    || source.currentKey
    || (Array.isArray(settings.layers) ? settings.layers : []).some((layer) => layer?.on || (layer?.scope || []).length || (layer?.step && layer.step !== 2))
    || (Array.isArray(settings.protected) ? settings.protected : []).length
    || (Array.isArray(source.versions) ? source.versions : []).length
    || (Array.isArray(source.layerCache) ? source.layerCache : []).length
  );
}

// Whether a workspace still carries anything the darkroom owns. A workspace
// that never met a model has nothing to move, and moving nothing must not
// create a record: an empty darkroom record and no record at all have to keep
// meaning the same thing.
function workspaceHasDarkroomState(workspace = {}) {
  return darkroomRecordHasState(darkroomRecordFromWorkspace(workspace));
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

// ---- Settings <-> layers ----------------------------------------------------
// The desk's layer normalizer works in { kind, enabled, strength, mask }. These
// two convert at the boundary and nowhere else, so the stored shape is the
// settings one and every working copy is a derived view of it.
/** @param {any} settings */
function darkroomLayersFromSettings(settings) {
  const layers = darkroomIsObject(settings) && Array.isArray(settings.layers) ? settings.layers : [];
  return layers.filter(darkroomIsObject).map((layer) => ({
    kind: String(layer.kind || ""),
    enabled: layer.on === true,
    strength: darkroomStrengthFromStep(layer.step),
    mask: darkroomClone(layer.scope ?? []),
  }));
}

/**
 * Working layers back into settings, keeping whatever else each stored layer
 * carried and the settings' other two fields.
 * @param {any[]} layers
 * @param {any} previous
 */
function darkroomSettingsFromLayers(layers, previous) {
  const base = darkroomIsObject(previous) ? previous : blankDarkroomSettings();
  const stored = new Map((Array.isArray(base.layers) ? base.layers : []).map((layer) => [String(layer?.kind || ""), layer]));
  return {
    ...darkroomClone(base),
    layers: (Array.isArray(layers) ? layers : []).filter(darkroomIsObject).map((layer) => ({
      ...darkroomClone(stored.get(String(layer.kind || "")) || {}),
      kind: String(layer.kind || ""),
      on: layer.enabled === true,
      step: darkroomStepFromStrength(layer.strength),
      scope: darkroomClone(layer.mask ?? []),
    })),
  };
}

// ---- Per-layer output cache --------------------------------------------------
/**
 * A Map-shaped cache over the record's `layerCache` entries. Newest last, the
 * oldest dropped past the limit, a hit moved to the end so the entries a writer
 * keeps coming back to are the ones that stay. `onChange` receives the whole
 * entry list after every write, so the owner can store it.
 * @param {any[]} initial
 * @param {{ limit?: number, onChange?: (entries: any[]) => void }} [options]
 */
function createDarkroomLayerCache(initial = [], { limit = DARKROOM_LAYER_CACHE_LIMIT, onChange } = {}) {
  /** @type {Map<string, any>} */
  const entries = new Map();
  (Array.isArray(initial) ? initial : []).forEach((entry) => {
    if (darkroomIsObject(entry) && typeof entry.key === "string" && entry.key) entries.set(entry.key, { ...entry });
  });
  const trim = () => {
    while (entries.size > limit) entries.delete(entries.keys().next().value);
  };
  const emit = () => {
    if (typeof onChange === "function") onChange([...entries.values()]);
  };
  trim();
  return {
    has: (key) => entries.has(key),
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.output;
    },
    /**
     * @param {string} key
     * @param {string} output
     * @param {Record<string, any>} [meta] kind / step / at, kept for the film strip's labels
     */
    set(key, output, meta = {}) {
      entries.delete(key);
      entries.set(key, { ...meta, key, output: String(output ?? "") });
      trim();
      emit();
      return this;
    },
    get size() { return entries.size; },
    entries: () => [...entries.values()].map((entry) => ({ ...entry })),
  };
}

// ---- Versions -----------------------------------------------------------------
/** @param {any} entry */
function darkroomVersionIsAutomatic(entry) {
  return DARKROOM_AUTO_REASONS.includes(String(entry?.reason || "")) && !String(entry?.name || "").trim();
}

/**
 * Prune a version list. Automatic versions (the copy taken on leaving) keep
 * only the newest few; a named version, or one the writer kept on purpose, is
 * never dropped to make room. The overall cap still applies, but it removes the
 * oldest unnamed entries first and leaves a list of nothing but named versions
 * alone rather than deleting the writer's own labels.
 * @param {any[]} versions
 * @param {{ autoLimit?: number, limit?: number }} [options]
 */
function pruneDarkroomVersions(versions, { autoLimit = DARKROOM_AUTO_VERSION_LIMIT, limit = DARKROOM_VERSION_LIMIT } = {}) {
  let list = Array.isArray(versions) ? [...versions] : [];
  const autoIndexes = list.map((entry, index) => (darkroomVersionIsAutomatic(entry) ? index : -1)).filter((index) => index >= 0);
  const dropAuto = new Set(autoIndexes.slice(0, Math.max(0, autoIndexes.length - autoLimit)));
  list = list.filter((_, index) => !dropAuto.has(index));
  let overflow = list.length - limit;
  if (overflow > 0) {
    const droppable = (entry) => !String(entry?.name || "").trim() && String(entry?.reason || "") !== "kept";
    list = list.filter((entry) => {
      if (overflow > 0 && droppable(entry)) {
        overflow -= 1;
        return false;
      }
      return true;
    });
  }
  if (overflow > 0) {
    list = list.filter((entry) => {
      if (overflow > 0 && !String(entry?.name || "").trim()) {
        overflow -= 1;
        return false;
      }
      return true;
    });
  }
  return list;
}

/**
 * Name (or un-name) one version. Returns the record with a new list, or null
 * when the id is not in it. A name is trimmed and cut to a length a film frame
 * can show.
 * @param {any} record
 * @param {string} id
 * @param {string} name
 */
function nameDarkroomVersion(record, id, name) {
  const versions = Array.isArray(record?.versions) ? record.versions : [];
  if (!versions.some((entry) => entry?.id === id)) return null;
  const label = String(name || "").replace(/\s+/g, " ").trim().slice(0, DARKROOM_VERSION_NAME_LIMIT);
  return {
    ...record,
    versions: versions.map((entry) => {
      if (entry?.id !== id) return entry;
      const { name: _previous, ...rest } = entry;
      return label ? { ...rest, name: label } : rest;
    }),
  };
}

const darkroomTrimEnd = (text) => String(text ?? "").replace(/\s+$/g, "");

/**
 * Leaving a document keeps one automatic version of it -- unless there is
 * nothing to keep (an empty body), or the darkroom already holds this exact
 * text as a version or as the negative. Returns { record, added }.
 * @param {any} record
 * @param {string} body
 * @param {{ now?: string, id?: string }} [options]
 */
function leaveDarkroomVersion(record, body, { now = new Date().toISOString(), id = `version-${now}` } = {}) {
  const text = String(body ?? "");
  const versions = Array.isArray(record?.versions) ? record.versions : [];
  const known = darkroomTrimEnd(text) === darkroomTrimEnd(record?.negative)
    || versions.some((entry) => darkroomTrimEnd(entry?.body) === darkroomTrimEnd(text));
  if (!text.trim() || known) return { record, added: false };
  const version = { id, body: text, title: "", createdAt: now, reason: "leave", source: "lightroom" };
  return { record: { ...record, versions: pruneDarkroomVersions([...versions, version]) }, added: true };
}

/**
 * The versions the grain view may read as "the body before pass k": those
 * after the last re-shoot, minus the copies that are not a pass.
 * @param {any} record
 */
function darkroomChainVersions(record) {
  const versions = Array.isArray(record?.versions) ? record.versions : [];
  const base = darkroomText(record?.chainBase);
  const from = base ? versions.findIndex((entry) => entry?.id === base) + 1 : 0;
  return versions.slice(from).filter((entry) => !DARKROOM_NON_CHAIN_REASONS.includes(String(entry?.reason || "")));
}

// ---- The negative ---------------------------------------------------------------
/**
 * Is the negative still the writer's baseline? The negative is the writer's own
 * text as it stood when the darkroom first touched the document, and every
 * preview composes from it. It goes stale when the writer keeps writing: the
 * body then holds words the negative has never seen, and the preview would
 * quietly develop the old text. A body the darkroom itself produced -- the last
 * develop, a stored version, the negative -- is never stale, only a body the
 * writer made.
 * @param {any} record
 * @param {string} body
 * @returns {{ state: "none" | "fresh" | "stale" }}
 */
function darkroomNegativeState(record, body) {
  if (!record?.negativeUpdatedAt) return { state: "none" };
  const text = darkroomTrimEnd(body);
  if (!text.trim()) return { state: "fresh" };
  if (text === darkroomTrimEnd(record.negative)) return { state: "fresh" };
  if (record.modelDelivered && text === darkroomTrimEnd(record.modelDelivered)) return { state: "fresh" };
  if ((Array.isArray(record.versions) ? record.versions : []).some((entry) => darkroomTrimEnd(entry?.body) === text)) {
    return { state: "fresh" };
  }
  return { state: "stale" };
}

/**
 * Re-shoot: the current body becomes the new negative. The old negative is not
 * lost -- it is set aside as a version -- and everything computed from it (the
 * proof, the key, the delivered body) is cleared so no preview can pass off the
 * old negative's work as the new one's. Returns { record, version, refused }.
 * The input record is never mutated.
 * @param {any} record
 * @param {string} body
 * @param {{ now?: string, id?: string }} [options]
 */
function reshootDarkroomNegative(record, body, { now = new Date().toISOString(), id = `version-${now}` } = {}) {
  const text = String(body ?? "");
  if (!text.trim()) return { record, version: null, refused: "empty" };
  const versions = Array.isArray(record?.versions) ? record.versions : [];
  const old = String(record?.negative ?? "");
  const version = old.trim()
    ? { id, body: old, title: "", createdAt: now, reason: "before-reshoot", source: "lightroom" }
    : null;
  const kept = version ? pruneDarkroomVersions([...versions, version]) : versions;
  return {
    refused: "",
    version,
    record: {
      ...record,
      negative: text,
      negativeUpdatedAt: now,
      modelDelivered: "",
      modelDeliveredAt: "",
      composite: "",
      currentKey: "",
      generatedAt: "",
      versions: kept,
      chainBase: kept.length ? String(kept[kept.length - 1]?.id || "") : "",
    },
  };
}

window.AISystem6DarkroomRecord = Object.freeze({
  DARKROOM_AUTO_VERSION_LIMIT,
  DARKROOM_LAYER_CACHE_LIMIT,
  DARKROOM_NON_CHAIN_REASONS,
  DARKROOM_SCHEMA_VERSION,
  DARKROOM_VERSION_LIMIT,
  DARKROOM_WORKSPACE_FIELDS,
  blankDarkroomRecord,
  blankDarkroomSettings,
  createDarkroomLayerCache,
  darkroomChainVersions,
  darkroomLayersFromSettings,
  darkroomNegativeState,
  darkroomRecordFromWorkspace,
  darkroomRecordHasState,
  darkroomSettingsFromLayers,
  darkroomStepFromStrength,
  darkroomStorageKey,
  darkroomStrengthFromStep,
  darkroomVersionIsAutomatic,
  leaveDarkroomVersion,
  migrateDarkroomRecord,
  nameDarkroomVersion,
  planDarkroomMigration,
  pruneDarkroomVersions,
  reshootDarkroomNegative,
  workspaceHasDarkroomState,
  workspaceWithoutDarkroom,
});
