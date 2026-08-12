// Shared Quick Draft workspace contract.
//
// The Draft Desk UI and any future migration surface read and write the same
// project.quickDraft record. Keep schema migration and normalization here so
// a new shell can never fork the durable data shape from the old projects it
// must open.

const FIRST_DAY_FORMAT = "first-day-hands-on";
const HANDS_ON_REVIEW_FORMAT = "hands-on-review";
const BILI_DYNAMIC_FORMAT = "bili-dynamic";
const targetFormats = new Set([FIRST_DAY_FORMAT, HANDS_ON_REVIEW_FORMAT, BILI_DYNAMIC_FORMAT]);
const targetDurations = new Set(["7m", "12m", "140w", "280w", "500w"]);
const durationByFormat = {
  [FIRST_DAY_FORMAT]: "7m",
  [HANDS_ON_REVIEW_FORMAT]: "12m",
  [BILI_DYNAMIC_FORMAT]: "280w",
};

const emptyBrief = Object.freeze({
  support: "",
  counter: "",
  uncertainty: "",
  outline: "",
});

const emptyAnnotations = Object.freeze({
  firsthand: "",
  official: "",
  uncertainty: "",
  followup: "",
});

const emptyIntake = Object.freeze({
  ventMode: false,
  ventLog: [],
  chatMaterials: [],
  stanceCandidates: [],
  outlineSeed: "",
});

const emptyStrategy = Object.freeze({
  editorial: "",
  materialLedger: "",
  adoptionTable: "",
});

function hasOwnString(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key) && typeof object[key] === "string";
}

function normalizeScenario(value, fallback = FIRST_DAY_FORMAT) {
  if (value === "bili-video" || value === "spoken-outline") return FIRST_DAY_FORMAT;
  return targetFormats.has(value) ? value : (targetFormats.has(fallback) ? fallback : FIRST_DAY_FORMAT);
}

function normalizeDuration(value, format = FIRST_DAY_FORMAT) {
  const dynamic = normalizeScenario(format) === BILI_DYNAMIC_FORMAT;
  const allowed = dynamic ? ["140w", "280w", "500w"] : ["7m", "12m"];
  if (value === "8m") return "7m";
  if (value === "10m") return "12m";
  if (["30s", "1m", "3m", "5m"].includes(value)) return durationByFormat[format] || (dynamic ? "280w" : "7m");
  return allowed.includes(value) ? value : (durationByFormat[format] || (dynamic ? "280w" : "7m"));
}

function titleFromBody(body = "") {
  const text = String(body || "");
  const heading = text.split(/\r?\n/).find((line) => /^#{1,6}\s+\S/.test(line.trim()));
  const fallback = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || "";
  const defaultTitle = typeof t === "function" ? t("quick_draft_title") : "Quick Draft";
  return String(heading || fallback || defaultTitle)
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

function blankLegacyQuickDraftCanvas() {
  return {
    objects: [{
      id: "obj-1",
      x: 120,
      y: 72,
      width: 560,
      height: 0,
      angle: 0,
    }],
    path: ["obj-1"],
  };
}

/** @param {Record<string, any>} value */
function normalizeLegacyQuickDraftCanvas(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const defaults = blankLegacyQuickDraftCanvas();
  let objectIndex = 0;
  const objects = (Array.isArray(source.objects) ? source.objects : [])
    .map((item) => {
      const object = item && typeof item === "object" ? item : {};
      objectIndex += 1;
      return {
        id: String(object.id || `obj-${objectIndex}`),
        x: Number.isFinite(Number(object.x)) ? Math.round(Number(object.x)) : defaults.objects[0].x,
        y: Number.isFinite(Number(object.y)) ? Math.round(Number(object.y)) : defaults.objects[0].y,
        width: Number.isFinite(Number(object.width)) ? Math.max(160, Math.round(Number(object.width))) : defaults.objects[0].width,
        height: Number.isFinite(Number(object.height)) ? Math.max(0, Math.round(Number(object.height))) : 0,
        angle: Number.isFinite(Number(object.angle)) ? Math.round(Number(object.angle)) : 0,
      };
    })
    .filter((object) => object.id);
  if (!objects.length) return defaults;
  const ids = new Set(objects.map((object) => object.id));
  const path = (Array.isArray(source.path) ? source.path : defaults.path)
    .map((id) => String(id || ""))
    .filter((id) => ids.has(id));
  if (!path.length) path.push(objects[0].id);
  return { objects, path };
}

function blankToolInputs() {
  return {
    thesis: "",
    pastedSources: "",
    targetDuration: "7m",
    firstDaySubject: "",
    handsOnNotes: "",
    officialMaterials: "",
    unavailableNotes: "",
    audienceConcerns: "",
    firstImpression: "",
    tone: "",
    mustInclude: "",
    mustAvoid: "",
  };
}

function blankQuickDraftWorkspace() {
  return {
    schemaVersion: 3,
    title: "",
    titleMode: "auto",
    body: "",
    intake: {
      ...emptyIntake,
      setup: {
        ...blankToolInputs(),
        scenario: BILI_DYNAMIC_FORMAT,
      },
      annotations: { ...emptyAnnotations },
    },
    materials: [],
    strategy: { ...emptyStrategy },
    adjustmentLayers: [],
    protectedRanges: [],
    composition: {
      currentKey: "",
      composite: "",
      generatedAt: "",
      negative: "",
      negativeUpdatedAt: "",
    },
    versions: [],
    projectDocId: "",
    savedStatus: "saved",
    updatedAt: "",
  };
}

/** @param {Record<string, any>} value @param {Record<string, any>} legacy */
function normalizeToolInputs(value = {}, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...blankToolInputs(),
    thesis: String(source.thesis ?? legacy.thesis ?? ""),
    pastedSources: String(source.pastedSources ?? legacy.pastedSources ?? legacy.sourcesText ?? ""),
    targetDuration: normalizeDuration(source.targetDuration || legacy.targetDuration),
    firstDaySubject: String(source.firstDaySubject ?? legacy.firstDaySubject ?? legacy.subject ?? ""),
    handsOnNotes: String(source.handsOnNotes ?? legacy.handsOnNotes ?? legacy.handsOn ?? ""),
    officialMaterials: String(source.officialMaterials ?? legacy.officialMaterials ?? ""),
    unavailableNotes: String(source.unavailableNotes ?? legacy.unavailableNotes ?? legacy.unavailable ?? ""),
    audienceConcerns: String(source.audienceConcerns ?? legacy.audienceConcerns ?? ""),
    firstImpression: String(source.firstImpression ?? legacy.firstImpression ?? ""),
    tone: String(source.tone ?? legacy.tone ?? ""),
    mustInclude: String(source.mustInclude ?? legacy.mustInclude ?? ""),
    mustAvoid: String(source.mustAvoid ?? legacy.mustAvoid ?? ""),
  };
}

/** @param {Record<string, any>} value @param {Record<string, any>} legacy */
function normalizeAnnotations(value = {}, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  const brief = legacy.brief && typeof legacy.brief === "object" ? legacy.brief : {};
  return {
    firsthand: String(source.firsthand ?? brief.support ?? ""),
    official: String(source.official ?? brief.counter ?? ""),
    uncertainty: String(source.uncertainty ?? brief.uncertainty ?? ""),
    followup: String(source.followup ?? legacy.risks ?? ""),
  };
}

function normalizeVentEntry(entry, index = 0) {
  if (typeof entry === "string") {
    return {
      id: `vent-${index + 1}`,
      text: entry,
      createdAt: "",
      sourceKind: "clioTalk-vent",
    };
  }
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(source.id || `vent-${index + 1}`),
    text: String(source.text || ""),
    createdAt: String(source.createdAt || ""),
    sourceKind: String(source.sourceKind || "clioTalk-vent"),
  };
}

function normalizeQuickDraftVersion(entry, index = 0) {
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(source.id || `version-${index + 1}`),
    body: String(source.body ?? source.text ?? ""),
    title: String(source.title || ""),
    createdAt: String(source.createdAt || source.timestamp || ""),
    reason: String(source.reason || "before-ai"),
    source: String(source.source || source.sourceKind || "quick-draft"),
  };
}

function normalizeChatMaterial(entry, index = 0) {
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(source.id || `chat-${index + 1}`),
    name: String(source.name || source.title || `Chat ${index + 1}`),
    text: String(source.text || ""),
    platform: String(source.platform || "generic-chat"),
    sourceKind: String(source.sourceKind || "chat-screenshot"),
    createdAt: String(source.createdAt || ""),
  };
}

/** @param {Record<string, any>} value @param {Record<string, any>} legacy @returns {any} */
function normalizeIntake(value = {}, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  const legacyVentLog = Array.isArray(legacy.ventLog) ? legacy.ventLog : [];
  const legacyChatMaterials = Array.isArray(legacy.chatMaterials) ? legacy.chatMaterials : [];
  const legacyStanceCandidates = Array.isArray(legacy.stanceCandidates) ? legacy.stanceCandidates : [];
  return {
    ...emptyIntake,
    ventMode: source.ventMode === true,
    ventLog: (Array.isArray(source.ventLog) ? source.ventLog : legacyVentLog)
      .map(normalizeVentEntry)
      .filter((entry) => entry.text.trim()),
    chatMaterials: (Array.isArray(source.chatMaterials) ? source.chatMaterials : legacyChatMaterials)
      .map(normalizeChatMaterial)
      .filter((entry) => entry.text.trim()),
    stanceCandidates: (Array.isArray(source.stanceCandidates) ? source.stanceCandidates : legacyStanceCandidates)
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    outlineSeed: String(source.outlineSeed ?? legacy.outlineSeed ?? ""),
  };
}

/** @param {Record<string, any>} value @param {Record<string, any>} legacy */
function normalizeStrategy(value = {}, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  const fallback = legacy.strategyReport && typeof legacy.strategyReport === "object" ? legacy.strategyReport : {};
  return {
    ...emptyStrategy,
    editorial: String(source.editorial ?? fallback.editorial ?? ""),
    materialLedger: String(source.materialLedger ?? fallback.materialLedger ?? ""),
    adoptionTable: String(source.adoptionTable ?? fallback.adoptionTable ?? ""),
  };
}

/** @param {Record<string, any>} value @param {Record<string, any>} legacy @returns {any} */
function normalizeQuickDraftWorkspace(value = {}, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  const legacyToolInputs = legacy.toolInputs && typeof legacy.toolInputs === "object" ? legacy.toolInputs : {};
  const body = hasOwnString(source, "body") ? source.body : String(legacy.draft || "");
  const setupSource = source.intake?.setup && typeof source.intake.setup === "object" ? source.intake.setup : {};
  const annotationsSource = source.intake?.annotations && typeof source.intake.annotations === "object"
    ? source.intake.annotations
    : (source.annotations && typeof source.annotations === "object" ? source.annotations : {});
  const scenario = normalizeScenario(
    setupSource.scenario || source.scenario || legacy.targetFormat,
    FIRST_DAY_FORMAT
  );
  const toolInputs = {
    ...normalizeToolInputs(setupSource, { ...legacy, ...legacyToolInputs }),
    targetDuration: normalizeDuration(
      setupSource.targetDuration || source.toolInputs?.targetDuration || legacy.targetDuration,
      scenario
    ),
    scenario,
  };
  const intake = normalizeIntake(source.intake, legacy);
  const migratedDumps = intake.ventLog
    .filter((entry) => entry.sourceKind === "quick-draft-dump")
    .map((entry, index) => normalizeQuickDraftVersion(entry, index));
  intake.ventLog = intake.ventLog.filter((entry) => entry.sourceKind !== "quick-draft-dump");
  const explicitVersions = (Array.isArray(source.versions) ? source.versions : []).map(normalizeQuickDraftVersion);
  const versionsById = new Map();
  [...explicitVersions, ...migratedDumps].forEach((version) => {
    const identity = version.id || `${version.createdAt}:${version.body}`;
    if (version.body.trim() && !versionsById.has(identity)) versionsById.set(identity, version);
  });
  const compositionSource = source.composition && typeof source.composition === "object" ? source.composition : {};
  const composition = {
    currentKey: String(compositionSource.currentKey || ""),
    composite: String(compositionSource.composite || ""),
    generatedAt: String(compositionSource.generatedAt || ""),
    negative: String(compositionSource.negative ?? source.humanAnchor ?? legacy.humanAnchor ?? ""),
    negativeUpdatedAt: String(compositionSource.negativeUpdatedAt ?? source.humanAnchorUpdatedAt ?? legacy.humanAnchorUpdatedAt ?? ""),
  };
  const defaultTitle = typeof t === "function" ? t("quick_draft_title") : "Quick Draft";
  const title = String(
    source.title
    || legacy.title
    || toolInputs.firstDaySubject
    || titleFromBody(body)
    || defaultTitle
  );
  const legacySource = source.legacy && typeof source.legacy === "object" ? source.legacy : {};
  const legacyCanvas = source.canvas || legacy.canvas || legacySource.canvas;
  return {
    ...blankQuickDraftWorkspace(),
    schemaVersion: 3,
    title,
    titleMode: source.titleMode === "manual" ? "manual" : "auto",
    body: String(body || ""),
    intake: {
      ...intake,
      setup: toolInputs,
      annotations: normalizeAnnotations(annotationsSource, legacy),
    },
    materials: Array.isArray(source.materials)
      ? source.materials
      : (Array.isArray(source.sourceMap)
        ? source.sourceMap
        : (Array.isArray(legacy.sourceMap) ? legacy.sourceMap : [])),
    strategy: normalizeStrategy(source.strategy, source.strategyReport ? { strategyReport: source.strategyReport } : legacy),
    adjustmentLayers: normalizeAdjustmentLayers(source.adjustmentLayers || legacy.adjustmentLayers),
    protectedRanges: normalizeAdjustmentLayerMask(source.protectedRanges || legacy.protectedRanges),
    composition,
    versions: [...versionsById.values()].slice(-100),
    ...(legacyCanvas ? {
      legacy: {
        ...legacySource,
        canvas: normalizeLegacyQuickDraftCanvas(legacyCanvas),
      },
    } : {}),
    projectDocId: String(source.projectDocId || legacy.projectDocId || ""),
    savedStatus: source.savedStatus === "modified" ? "modified" : "saved",
    updatedAt: String(source.updatedAt || legacy.updatedAt || ""),
  };
}

function quickDraftAliases(workspace) {
  const setup = workspace.intake?.setup || {};
  const annotations = workspace.intake?.annotations || emptyAnnotations;
  return {
    thesis: setup.thesis || "",
    pastedSources: setup.pastedSources || "",
    targetFormat: setup.scenario || workspace.scenario || BILI_DYNAMIC_FORMAT,
    targetDuration: setup.targetDuration || "",
    firstDaySubject: setup.firstDaySubject || "",
    handsOnNotes: setup.handsOnNotes || "",
    officialMaterials: setup.officialMaterials || "",
    unavailableNotes: setup.unavailableNotes || "",
    audienceConcerns: setup.audienceConcerns || "",
    firstImpression: setup.firstImpression || "",
    tone: setup.tone || "",
    mustInclude: setup.mustInclude || "",
    mustAvoid: setup.mustAvoid || "",
    brief: {
      ...emptyBrief,
      support: annotations.firsthand || "",
      counter: annotations.official || "",
      uncertainty: annotations.uncertainty || "",
    },
    draft: workspace.body || "",
    risks: annotations.followup || "",
    humanAnchor: workspace.composition?.negative || "",
    humanAnchorUpdatedAt: workspace.composition?.negativeUpdatedAt || "",
    strategyReport: workspace.strategy || emptyStrategy,
    intake: workspace.intake || emptyIntake,
    sourceMap: workspace.materials || [],
    updatedAt: workspace.updatedAt || "",
  };
}

function blankQuickDraft() {
  const workspace = blankQuickDraftWorkspace();
  return {
    workspace,
    stage: "brief",
    raw: "",
    insertedAt: "",
    ...quickDraftAliases(workspace),
  };
}

/** @param {Record<string, any>} value @returns {any} */
function normalizeQuickDraftRecord(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const workspace = normalizeQuickDraftWorkspace(source.workspace, source);
  return {
    ...blankQuickDraft(),
    ...source,
    workspace,
    stage: source.stage === "draft" ? "draft" : "brief",
    raw: String(source.raw || ""),
    insertedAt: String(source.insertedAt || ""),
    ...quickDraftAliases(workspace),
  };
}

// Public, DOM-free context contract for SideAsk and other app boundaries.
// Consumers receive a detached snapshot so they cannot mutate Project Hard
// Disk state by retaining references into project.quickDraft.
/** @param {Record<string, any>} record */
function quickDraftContextSnapshot(record = {}) {
  const normalized = normalizeQuickDraftRecord(record);
  const workspace = normalized.workspace;
  return {
    title: String(workspace.title || titleFromBody(workspace.body)),
    body: String(workspace.body || ""),
    setup: structuredClone(workspace.intake?.setup || {}),
    intake: structuredClone(workspace.intake || {}),
    annotations: structuredClone(workspace.intake?.annotations || {}),
    materials: structuredClone(workspace.materials || []),
    strategy: structuredClone(workspace.strategy || {}),
    protectedRanges: structuredClone(workspace.protectedRanges || []),
    versionCount: Array.isArray(workspace.versions) ? workspace.versions.length : 0,
    projectDocId: String(workspace.projectDocId || ""),
  };
}
