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
    explanationLens: window.AISystem6ExplanationLens?.blankExplanationLens?.() || {
      id: "eli5",
      enabled: false,
      audience: "general-public",
      baselineKnowledge: "secondary-school",
      medium: "spoken-video",
      question: "",
      stuckPointHint: "",
      mustKeepTerms: [],
    },
  };
}

function blankQuickDraftWorkspace() {
  return {
    schemaVersion: 4,
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
    // The negative, the adjustment stack, the locks and the version chain are
    // properties of the document, not of Quick Draft, so they live in the
    // darkroom record (app/core/darkroom-record.js) keyed by document. They are
    // deliberately absent here: a field that still existed would become a
    // second truth the moment anything wrote to it.
    projectDocId: "",
    savedStatus: "saved",
    updatedAt: "",
  };
}

/** @param {Record<string, any>} value @param {Record<string, any>} legacy */
function normalizeToolInputs(value = {}, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  const normalizeLens = window.AISystem6ExplanationLens?.normalizeExplanationLens;
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
    explanationLens: normalizeLens
      ? normalizeLens(source.explanationLens ?? legacy.explanationLens)
      : window.AISystem6ExplanationLens?.blankExplanationLens?.() || blankToolInputs().explanationLens,
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
    // A handle into the shared imageAttachments store, so the picture survives
    // the import without this record carrying its bytes. Before any picture was
    // kept at all, only the OCR text survived and a product photo with no text
    // in it was dropped on the floor.
    imageAttachmentId: String(source.imageAttachmentId || ""),
    // Materials imported before the store was used carry the picture inline.
    // Still read, never written now: an older draft keeps its photograph.
    previewDataUrl: String(source.previewDataUrl || ""),
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
    // The body as the model last handed it back. The version chain records what
    // each pass replaced, so it cannot tell text the writer typed after the last
    // pass from text that pass produced. This is the missing reference; a record
    // written before this field existed simply has none, and the grain reads as
    // it did before.
    modelDelivered: String(compositionSource.modelDelivered || ""),
    modelDeliveredAt: String(compositionSource.modelDeliveredAt || ""),
  };
  const defaultTitle = typeof t === "function" ? t("quick_draft_title") : "Quick Draft";
  const title = String(
    source.title
    || legacy.title
    || toolInputs.firstDaySubject
    || titleFromBody(body)
    || defaultTitle
  );
  const carried = {
    adjustmentLayers: normalizeAdjustmentLayers(source.adjustmentLayers || legacy.adjustmentLayers),
    protectedRanges: normalizeAdjustmentLayerMask(source.protectedRanges || legacy.protectedRanges),
    composition,
    versions: [...versionsById.values()].slice(-100),
  };
  // Whether anything is being carried is decided here, not by the darkroom
  // module: this normalizer is eager and that module is lazy, so at boot it does
  // not exist yet. Asking it would answer "nothing to carry" for every record
  // loaded before Quick Draft opens, and the negative, the stack, the locks and
  // the chain would be dropped on the floor at start-up.
  const carriesDarkroom = Boolean(
    carried.composition.negative
    || carried.composition.negativeUpdatedAt
    || carried.composition.modelDelivered
    || carried.composition.composite
    || carried.composition.currentKey
    // A default stack is not content. normalizeAdjustmentLayers always returns
    // the four layers, so counting them would make every record on earth look
    // like it carries darkroom state and hand a bucket to blank drafts.
    || JSON.stringify(carried.adjustmentLayers) !== JSON.stringify(defaultAdjustmentLayers())
    || carried.protectedRanges.length
    || carried.versions.length
  );
  const pendingDarkroom = source.pendingDarkroom && typeof source.pendingDarkroom === "object"
    ? source.pendingDarkroom
    : (carriesDarkroom ? carried : null);
  return {
    ...blankQuickDraftWorkspace(),
    schemaVersion: 4,
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
    // A record written before the darkroom moved out still carries its state
    // here. Dropping it now would lose it, because the normalizer runs on every
    // load and long before the migration can, so it is handed forward in one
    // explicit bucket and the migration drains it. Nothing reads this bucket to
    // do work — it exists to be moved and then to disappear.
    ...(pendingDarkroom ? { pendingDarkroom } : {}),
    projectDocId: String(source.projectDocId || legacy.projectDocId || ""),
    savedStatus: source.savedStatus === "modified" ? "modified" : "saved",
    updatedAt: String(source.updatedAt || legacy.updatedAt || ""),
  };
}

// This module is eager and the darkroom chain is lazy, so these read through a
// guard. When the chain is not loaded there is no record to speak for, and the
// answer is empty rather than a guess — the aliases are a compatibility shim
// for the active draft's context, not a source of truth.
function darkroomForWorkspace(workspace = {}) {
  const documentId = String(workspace?.projectDocId || "");
  const projectId = typeof activeProjectId === "string" ? activeProjectId : "";
  const blank = window.AISystem6DarkroomRecord?.blankDarkroomRecord?.()
    || { negative: "", negativeUpdatedAt: "", protectedRanges: [], versions: [] };
  if (documentId) return window.AISystem6DarkroomStore?.darkroomRecord?.(projectId, documentId) || blank;
  const pending = workspace?.pendingDarkroom;
  return pending
    ? (window.AISystem6DarkroomRecord?.darkroomRecordFromWorkspace?.(pending) || blank)
    : blank;
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
    humanAnchor: darkroomForWorkspace(workspace).negative || "",
    humanAnchorUpdatedAt: darkroomForWorkspace(workspace).negativeUpdatedAt || "",
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
//
// The locks and the version count are gone from here on purpose. They belong to
// the document now, and this snapshot is taken wherever a Quick Draft context
// is handed out — including places the darkroom chain has not loaded. Reporting
// "no locks, no versions" from a module that cannot know would be a claim, and
// nothing consumed either field.
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
    projectDocId: String(workspace.projectDocId || ""),
  };
}
