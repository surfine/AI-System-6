// Feature module: 钟点稿 / Quick Draft — coordinator.
//
// This file owns only the lifecycle: workspace loading and schema
// normalization, save-state semantics, paper/view switching, module
// coordination, window open/close/restore, and the public API surface. The
// feature logic is split across sibling modules (loaded in the same lazy
// chain, sharing this bundle's top-level scope):
//
//   quick-draft-intake.js       materials, vent, chat import, source map
//   quick-draft-editor.js       editor chrome, preview modes, versions
//   quick-draft-composition.js  adjustment layers, protect, grain, develop
//   quick-draft-canvas.js       the single-object canvas
//   quick-draft-ai.js           model requests and command dispatch
//   quick-draft-handoff.js      delivery actions
//
// Durable data lives on getActiveProject().quickDraft.workspace with a single
// canonical schema (schemaVersion 3); the main writing route is only touched
// by explicit handoff actions.

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

const refs = {};
let bound = false;
let saveTimer = null;
let pendingQuickDraftCommit = null;
let requestController = null;

// One window, three regions: the material shelf, the paper, the inspector.
// The paper never leaves the screen, so there is no phase to switch — only
// which surface the paper carries. With no draft it carries the intake well;
// once a draft exists it carries the body. That is an empty state, and a
// manual choice is never yanked back.
let quickDraftPaperSurface = "intake";
let quickDraftPaperManual = false;
let quickDraftSurfaceMode = "linear";
let quickDraftSurfaceManual = false;
let quickDraftEditingCanvasObject = false;
let quickDraftPreviewMode = "render";

function $(id) {
  return document.getElementById(id);
}

function collectRefs() {
  refs.form = $("quick-draft-form");
  refs.status = $("quick-draft-status");
  refs.windowTitle = $("quick-draft-title");
  refs.titleInput = $("quick-draft-title-input");
  refs.titleDisplay = $("quick-draft-title-display");
  refs.settingsSummary = $("quick-draft-settings-summary");
  refs.stats = $("quick-draft-stats");
  refs.saveState = $("quick-draft-save-state");
  refs.sourceCount = $("quick-draft-source-count");
  refs.sourceSummary = $("quick-draft-source-summary");
  refs.tools = $("quick-draft-tools");
  refs.deliverMenu = $("quick-draft-deliver");
  refs.aiCards = $("quick-draft-ai-cards");
  refs.lengthLabel = $("quick-draft-length-label");
  refs.ventLog = $("quick-draft-vent-log");
  refs.chatMaterials = $("quick-draft-chat-materials");
  refs.stanceCandidates = $("quick-draft-stance-candidates");
  refs.outlineSeed = $("quick-draft-outline-seed");
  refs.dump = $("quick-draft-dump");
  refs.restoreDumpButton = $("quick-draft-restore-dump");
  refs.editorialStrategy = $("quick-draft-editorial-strategy");
  refs.materialLedger = $("quick-draft-material-ledger");
  refs.adoptionTable = $("quick-draft-adoption-table");
  refs.collectVentButton = $("quick-draft-collect-vent");
  refs.importChatButton = $("quick-draft-import-chat");
  refs.adoptImpressionButton = $("quick-draft-adopt-impression");
  refs.confirmHandsOnButton = $("quick-draft-confirm-hands-on");
  refs.startWritingButton = $("quick-draft-start-writing");
  refs.startState = $("quick-draft-start-state");
  refs.thesis = $("quick-draft-thesis");
  refs.sources = $("quick-draft-sources");
  refs.say = $("quick-draft-say");
  refs.format = $("quick-draft-format");
  refs.duration = $("quick-draft-duration");
  refs.firstDaySubject = $("quick-draft-first-day-subject");
  refs.handsOn = $("quick-draft-hands-on");
  refs.officialMaterials = $("quick-draft-official-materials");
  refs.unavailable = $("quick-draft-unavailable");
  refs.audienceConcerns = $("quick-draft-audience-concerns");
  refs.officialSummary = $("quick-draft-official-summary");
  refs.unavailableSummary = $("quick-draft-unavailable-summary");
  refs.audienceSummary = $("quick-draft-audience-summary");
  refs.firstImpression = $("quick-draft-first-impression");
  refs.firstImpressionStatus = $("quick-draft-first-impression-status");
  refs.tone = $("quick-draft-tone");
  refs.mustInclude = $("quick-draft-must-include");
  refs.mustAvoid = $("quick-draft-must-avoid");
  refs.draft = $("quick-draft-draft");
  refs.preview = $("quick-draft-preview");
  refs.toggleGrainButton = $("quick-draft-toggle-grain");
  refs.toggleCompositeButton = $("quick-draft-toggle-composite");
  refs.canvas = document.querySelector("[data-quick-draft-canvas]");
  refs.canvasStage = document.querySelector("[data-quick-draft-canvas-stage]");
  refs.canvasObject = document.querySelector("[data-quick-draft-canvas-object]");
  refs.canvasAngle = document.querySelector("[data-quick-draft-canvas-angle]");
  refs.articleViewButton = document.querySelector("[data-quick-draft-view='article']");
  refs.canvasViewButton = document.querySelector("[data-quick-draft-view='canvas']");
  refs.saveButton = $("quick-draft-save");
  refs.saveProjectDocButton = $("quick-draft-save-project-doc");
  refs.sendTeachTextButton = $("quick-draft-send-teachtext");
  refs.sendReviewButton = $("quick-draft-send-review");
  refs.switchMultiFinderButton = $("quick-draft-switch-multifinder");
  refs.useMountedButton = $("quick-draft-use-mounted");
  refs.support = $("quick-draft-support");
  refs.handsOnStatus = $("quick-draft-hands-on-status");
  refs.counter = $("quick-draft-counter");
  refs.uncertainty = $("quick-draft-uncertainty");
  refs.risks = $("quick-draft-risks");
  refs.sourceMap = $("quick-draft-source-map");
  refs.shelfTitle = $("quick-draft-shelf-title");
  refs.versionsList = $("quick-draft-versions-list");
  refs.protectState = $("quick-draft-protect-state");
  refs.stackState = $("quick-draft-stack-state");
  refs.intakeWell = document.querySelector("[data-quick-draft-intake-well]");
  refs.bodySurface = document.querySelector("[data-quick-draft-body-surface]");
  refs.displayButtons = document.querySelectorAll("[data-quick-draft-display]");
}

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
  return String(heading || fallback || t("quick_draft_title"))
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

// ---- Workspace schema (schemaVersion 3) --------------------------------
// All Quick Draft persistence lives in one canonical shape:
//
//   { schemaVersion, title, body, intake: {}, materials: [], strategy: {},
//     adjustmentLayers: [], protectedRanges: [], composition: {}, canvas: {},
//     projectDocId, savedStatus, updatedAt }
//
// Legacy records (pre-schemaVersion workspace, flat aliases, toolInputs /
// strategyReport / sourceMap / humanAnchor fields) migrate in
// normalizeQuickDraftWorkspace below; every old project keeps opening.

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
        scenario: FIRST_DAY_FORMAT,
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
    canvas: blankQuickDraftCanvas(),
    projectDocId: "",
    savedStatus: "saved",
    updatedAt: "",
  };
}

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

// Legacy field names (toolInputs / annotations / strategyReport / sourceMap /
// humanAnchor / humanAnchorUpdatedAt / scenario / protectedRanges) are read
// for migration and never written into the canonical schema again.
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
    negative: String(
      compositionSource.negative
      ?? source.humanAnchor
      ?? legacy.humanAnchor
      ?? ""
    ),
    negativeUpdatedAt: String(
      compositionSource.negativeUpdatedAt
      ?? source.humanAnchorUpdatedAt
      ?? legacy.humanAnchorUpdatedAt
      ?? ""
    ),
  };
  const title = String(
    source.title
    || legacy.title
    || toolInputs.firstDaySubject
    || titleFromBody(body)
    || t("quick_draft_title")
  );
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
    canvas: normalizeQuickDraftCanvas(source.canvas || legacy.canvas),
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
    targetFormat: setup.scenario || workspace.scenario || FIRST_DAY_FORMAT,
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

function normalizeQuickDraftRecord(value) {
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

function activeProjectQuickDraft({ create = true } = {}) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) return null;
  const normalized = normalizeQuickDraftRecord(project.quickDraft);
  if (create || project.quickDraft) project.quickDraft = normalized;
  return { project, record: normalized };
}

function currentAnnotations() {
  return activeProjectQuickDraft({ create: false })?.record.workspace.intake.annotations || { ...emptyAnnotations };
}

function workspaceSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  const previous = normalizeQuickDraftRecord(record);
  const body = refs.draft?.value || "";
  const manualTitle = String(refs.titleInput?.value || "").trim();
  const titleMode = previous.workspace.titleMode === "manual" && manualTitle ? "manual" : "auto";
  const bodyTitle = titleFromBody(body);
  const titleValue = titleMode === "manual" ? manualTitle : (bodyTitle || previous.workspace.title);
  const subjectValue = titleValue && titleValue !== t("quick_draft_title")
    ? titleValue
    : (refs.firstDaySubject?.value || previous.workspace.intake.setup.firstDaySubject || "");
  const scenario = normalizeScenario(refs.format?.value || previous.workspace.intake.setup.scenario);
  const setup = {
    ...previous.workspace.intake.setup,
    thesis: refs.thesis?.value || refs.say?.value || "",
    pastedSources: refs.sources?.value || "",
    targetDuration: normalizeDuration(refs.duration?.value || previous.workspace.intake.setup.targetDuration, scenario),
    scenario,
    firstDaySubject: subjectValue,
    handsOnNotes: refs.handsOn?.value || "",
    officialMaterials: refs.officialMaterials?.value || "",
    unavailableNotes: refs.unavailable?.value || "",
    audienceConcerns: refs.audienceConcerns?.value || "",
    firstImpression: refs.firstImpression?.value || "",
    tone: refs.tone?.value || "",
    mustInclude: refs.mustInclude?.value || "",
    mustAvoid: refs.mustAvoid?.value || "",
  };
  return {
    title: titleValue,
    titleMode,
    body,
    intake: {
      ...previous.workspace.intake,
      setup,
      annotations: previous.workspace.intake.annotations,
    },
    materials: previous.workspace.materials,
    strategy: previous.workspace.strategy,
    composition: previous.workspace.composition,
    versions: previous.workspace.versions,
    protectedRanges: previous.workspace.protectedRanges,
    canvas: previous.workspace.canvas,
    projectDocId: previous.workspace.projectDocId,
  };
}

function formSnapshot() {
  return workspaceSnapshot();
}

function setSaveState(state = "saved") {
  if (!refs.saveState) return;
  refs.saveState.textContent = t(
    state === "modified" ? "quick_draft_modified_state"
      : state === "saving" ? "quick_draft_saving_state"
        : "quick_draft_saved_state"
  );
}

function draftUnitCount(text = "") {
  const cjk = String(text).match(/[\u3400-\u9fff]/g)?.length || 0;
  const latin = String(text).replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length || 0;
  return cjk + latin;
}

function updateDraftStats() {
  if (!refs.stats) return;
  const body = refs.draft?.value || "";
  if (typeof formatReviewVoiceStats === "function") {
    refs.stats.textContent = formatReviewVoiceStats(body);
    return;
  }
  const units = draftUnitCount(body);
  const seconds = Math.ceil(units / (currentLanguage === "zh" ? 5 : 2.4));
  if (!units) {
    refs.stats.textContent = t("draft_voice_stats_empty");
  } else if (seconds < 60) {
    refs.stats.textContent = t("draft_voice_stats_seconds", units, seconds);
  } else {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    refs.stats.textContent = remainingSeconds
      ? t("draft_voice_stats_minutes_seconds", units, minutes, remainingSeconds)
      : t("draft_voice_stats_minutes", units, minutes);
  }
}

function refreshQuickDraftSelectControls() {
  if (typeof initSystemSelectControls === "function") initSystemSelectControls();
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
}

// Persistence has explicit completion semantics: only after saveDeskState()
// resolves successfully is the state marked Saved. A failed write leaves the
// record Modified and shows an unsaved state; it never claims Saved.
async function persistQuickDraftWorkspace(projectId = activeProjectId) {
  const project = typeof projects !== "undefined"
    ? projects.find((item) => item.id === projectId)
    : activeProjectQuickDraft({ create: false })?.project;
  if (!project?.quickDraft?.workspace) return true;
  const saved = typeof saveDeskState === "function" ? await saveDeskState() : true;
  if (!saved) {
    if (project.quickDraft.workspace) {
      project.quickDraft.workspace.savedStatus = "modified";
      project.quickDraft.savedStatus = "modified";
    }
    setSaveState("modified");
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  if (project.quickDraft.workspace) {
    project.quickDraft.workspace.savedStatus = "saved";
    project.quickDraft.savedStatus = "saved";
  }
  setSaveState("saved");
  return true;
}

function updateQuickDraft(patch = {}, { announce = false } = {}) {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return null;
  }
  const now = new Date().toISOString();
  const patchWorkspace = patch.workspace && typeof patch.workspace === "object" ? patch.workspace : {};
  const workspace = normalizeQuickDraftWorkspace({
    ...slot.record.workspace,
    ...workspaceSnapshot(slot.record),
    ...patchWorkspace,
    updatedAt: now,
    savedStatus: "modified",
  }, slot.record);
  const nextRecord = normalizeQuickDraftRecord({
    ...slot.record,
    ...patch,
    workspace,
    updatedAt: now,
  });
  slot.project.quickDraft = nextRecord;
  slot.project.updatedAt = now;
  updateDraftStats();
  updateSourceCount();
  setSaveState(workspace.savedStatus);
  if (announce) setQuickDraftStatus(t("quick_draft_saving"));
  return nextRecord;
}

async function commitQuickDraft(patch = {}, options = {}) {
  const slot = activeProjectQuickDraft();
  if (!slot) return { ok: false, error: new Error("NO_ACTIVE_PROJECT") };
  const projectId = slot.project.id;
  const previous = slot.project.quickDraft;
  const record = updateQuickDraft(patch, options);
  setSaveState("saving");
  const ok = await persistQuickDraftWorkspace(projectId);
  if (!ok) {
    slot.project.quickDraft = previous;
    setSaveState("modified");
    return { ok: false, error: new Error("QUICK_DRAFT_COMMIT_FAILED") };
  }
  return { ok: true, record: slot.project.quickDraft || record };
}

function scheduleQuickDraftCommit(projectId) {
  clearTimeout(saveTimer);
  pendingQuickDraftCommit = { projectId };
  saveTimer = setTimeout(async () => {
    const pending = pendingQuickDraftCommit;
    pendingQuickDraftCommit = null;
    if (pending) await persistQuickDraftWorkspace(pending.projectId);
  }, 550);
}

async function flushPendingQuickDraftCommit() {
  if (!pendingQuickDraftCommit) return true;
  clearTimeout(saveTimer);
  const pending = pendingQuickDraftCommit;
  pendingQuickDraftCommit = null;
  return persistQuickDraftWorkspace(pending.projectId);
}

function saveQuickDraft(patch = {}, { debounce = false, announce = false } = {}) {
  const record = updateQuickDraft(patch, { announce });
  if (!record) return null;
  const projectId = activeProjectId;
  if (debounce) scheduleQuickDraftCommit(projectId);
  else void persistQuickDraftWorkspace(projectId);
  return record;
}

function setQuickDraftStatus(message) {
  if (refs.status) refs.status.textContent = message || t("quick_draft_ready");
}

// ---- Model availability --------------------------------------------------
// Without a model the window still works as a writing application: handwrite,
// save, organize material, canvas, versions. AI actions are disabled with a
// clear Connect AI… affordance instead of a dead button.
function quickDraftModelAvailable() {
  const cloudReady = typeof cloudConfig !== "undefined"
    && cloudConfig?.active
    && typeof cloudCredentialReady === "function"
    && cloudCredentialReady();
  const localModel = typeof getLocalModelRequestName === "function"
    ? Boolean(String(getLocalModelRequestName() || "").trim())
    : Boolean(String(modelInput?.value || "").trim());
  return Boolean(cloudReady || localModel);
}

function syncQuickDraftAiAvailability() {
  const available = quickDraftModelAvailable();
  const message = available ? "" : t("quick_draft_connect_ai");
  document.querySelectorAll("[data-quick-draft-ai-action]").forEach((button) => {
    button.disabled = !available;
    button.title = message;
  });
  if (!available && refs.saveButton) refs.saveButton.disabled = true;
  if (refs.status && !String(refs.status.textContent || "").trim()) {
    setQuickDraftStatus(message || t("quick_draft_ready"));
  }
}

// ---- Which surface the paper carries -------------------------------------
// The intake well and the body are two states of one sheet of paper, so the
// well text (`quick-draft-say`) and the body are the same workspace field.
// Leaving the well moves that text into the editor once, in one place.
function promoteWellTextToBody() {
  const body = String(refs.draft?.value || activeProjectQuickDraft({ create: false })?.record.workspace.body || "").trim();
  const say = String(refs.say?.value || "").trim();
  if (body || !say || !refs.draft) return false;
  refs.draft.value = say;
  refs.say.value = "";
  saveQuickDraft({ workspace: { body: say } }, { debounce: false });
  return true;
}

function setQuickDraftPaperSurface(surface = "intake", { manual = false } = {}) {
  const next = surface === "editor" ? "editor" : "intake";
  quickDraftPaperSurface = next;
  if (manual) quickDraftPaperManual = true;
  if (next === "editor") promoteWellTextToBody();
  refs.form?.classList.toggle("is-empty-draft", next === "intake");
  if (refs.intakeWell) refs.intakeWell.hidden = next !== "intake";
  if (refs.bodySurface) refs.bodySurface.hidden = next !== "editor";
  if (next === "intake") {
    refs.canvas?.classList.add("is-hidden");
  } else if (quickDraftSurfaceMode === "canvas") {
    refs.canvas?.classList.remove("is-hidden");
  }
  return next;
}

// A draft exists once the model has passed over the body (the negative is
// stamped) or a previous body was kept as a version. Typing in the well is
// not a draft, so the paper does not flip under the writer's hands.
function syncQuickDraftPaperFromState(record = activeProjectQuickDraft({ create: false })?.record) {
  if (quickDraftPaperManual) return;
  const workspace = normalizeQuickDraftRecord(record).workspace;
  const drafted = Boolean(
    workspace.composition?.negativeUpdatedAt
    || workspace.composition?.composite
    || quickDraftLastComposite
    || workspace.versions.length
  );
  setQuickDraftPaperSurface(drafted ? "editor" : "intake");
}

// Secondary controls are disabled, never removed: the position of a key is
// part of the layout, and a disabled key can say why it is off in Balloon Help.
function syncQuickDraftControlAvailability(hasBody) {
  document.querySelectorAll('[data-quick-draft-display="grain"], [data-quick-draft-display="read"]')
    .forEach((button) => {
      button.disabled = !hasBody;
      if (!button.dataset.balloonHelpDisabled) button.dataset.balloonHelpDisabled = "quick_draft_needs_body";
    });
  document.querySelectorAll('[data-quick-draft-drawer="inspector"]').forEach((button) => {
    button.disabled = !hasBody;
    if (!button.dataset.balloonHelpDisabled) button.dataset.balloonHelpDisabled = "quick_draft_needs_body";
  });
  const deliver = refs.deliverMenu;
  if (deliver) {
    deliver.classList.toggle("is-disabled", !hasBody);
    const summary = deliver.querySelector("summary");
    if (summary) {
      summary.setAttribute("aria-disabled", hasBody ? "false" : "true");
      summary.dataset.balloonHelpDisabled = "quick_draft_needs_body";
    }
    if (!hasBody) deliver.open = false;
  }
}

// The details bar reports and never sets: what is protected, and what the
// adjustment stack still owes the body.
function updateQuickDraftShellState(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftRecord(record).workspace;
  if (refs.protectState) {
    const lines = (workspace.protectedRanges || [])
      .reduce((total, range) => total + Math.max(0, (range.end - range.start) + 1), 0);
    refs.protectState.textContent = lines ? t("quick_draft_protect_state", lines) : "";
  }
  if (refs.stackState) {
    const enabled = (workspace.adjustmentLayers || []).filter((layer) => layer.enabled).length;
    refs.stackState.textContent = enabled ? t("quick_draft_stack_state", enabled) : "";
  }
}

function setBusy(isBusy) {
  refs.form?.classList.toggle("is-busy", !!isBusy);
  refs.draft?.closest(".teachtext-editor-container")?.classList.toggle("is-working", !!isBusy);
  [
    refs.saveProjectDocButton,
    refs.sendTeachTextButton,
    refs.sendReviewButton,
    refs.switchMultiFinderButton,
    refs.useMountedButton,
    refs.collectVentButton,
    refs.importChatButton,
    refs.adoptImpressionButton,
    refs.confirmHandsOnButton,
    refs.startWritingButton,
    refs.restoreDumpButton,
    refs.saveButton,
  ].forEach((button) => {
    if (button) button.disabled = !!isBusy;
  });
}

// ---- View switching (article / canvas) -----------------------------------
function quickDraftCanvasAllowed() {
  if (typeof isNarrowViewport === "function" && isNarrowViewport()) return false;
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function setQuickDraftSurface(mode = "linear", { manual = false } = {}) {
  const next = mode === "canvas" && quickDraftCanvasAllowed() ? "canvas" : "linear";
  quickDraftSurfaceMode = next;
  if (manual) {
    quickDraftSurfaceManual = true;
    quickDraftEditingCanvasObject = false;
  }
  if (next === "canvas") {
    leaveQuickDraftPreview();
    refs.canvas?.classList.remove("is-hidden");
    document.querySelector("[data-quick-draft-linear]")?.classList.add("is-hidden");
  } else {
    refs.canvas?.classList.add("is-hidden");
    document.querySelector("[data-quick-draft-linear]")?.classList.remove("is-hidden");
  }
  getWindow("quickDraft")?.classList.toggle("is-canvas", next === "canvas");
  refs.articleViewButton?.classList.toggle("is-active", next === "linear");
  refs.canvasViewButton?.classList.toggle("is-active", next === "canvas");
  if (next === "canvas") renderQuickDraftCanvas();
  return next;
}

function syncQuickDraftSurfaceFromState(record = activeProjectQuickDraft({ create: false })?.record) {
  if (quickDraftSurfaceManual) return;
  setQuickDraftSurface(quickDraftCanvasSuggests(record) ? "canvas" : "linear");
}

// ---- Render orchestration -------------------------------------------------
function renderQuickDraft(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
  collectRefs();
  if (!refs.form) return;
  const source = normalizeQuickDraftRecord(record);
  refs.titleInput.value = source.workspace.title || titleFromBody(source.workspace.body);
  if (refs.thesis) refs.thesis.value = source.thesis;
  if (refs.say) refs.say.value = source.workspace.body || "";
  if (refs.sources) refs.sources.value = source.pastedSources;
  refs.format.value = source.targetFormat;
  refs.duration.value = source.targetDuration;
  if (refs.firstDaySubject) refs.firstDaySubject.value = source.firstDaySubject || source.workspace.title || "";
  if (refs.handsOn) refs.handsOn.value = source.handsOnNotes;
  if (refs.officialMaterials) refs.officialMaterials.value = source.officialMaterials;
  if (refs.unavailable) refs.unavailable.value = source.unavailableNotes;
  if (refs.audienceConcerns) refs.audienceConcerns.value = source.audienceConcerns;
  if (refs.firstImpression) refs.firstImpression.value = source.firstImpression;
  if (refs.tone) refs.tone.value = source.tone;
  if (refs.mustInclude) refs.mustInclude.value = source.mustInclude;
  if (refs.mustAvoid) refs.mustAvoid.value = source.mustAvoid;
  if (refs.draft) refs.draft.value = source.workspace.body;
  syncQuickDraftTemplateUi();
  renderIntake(source);
  renderStrategyReport(source);
  renderClassifySummaries(source);
  renderDecisionStatuses(source);
  markdownSlot(refs.support, source.brief.support);
  if (refs.support) refs.support.hidden = !String(source.brief.support || "").trim();
  markdownSlot(refs.counter, source.brief.counter);
  markdownSlot(refs.uncertainty, source.brief.uncertainty);
  markdownSlot(refs.risks, source.risks);
  renderSourceMap(source, sourceRecordsFromForm());
  closeQuickDraftMenus();
  if (refs.aiCards) {
    refs.aiCards.open = false;
    refs.aiCards.hidden = !hasOrganizedCards(source);
  }
  setPostDraftChipsVisible(source.stage === "draft");
  updateSourceCount();
  updateDraftStats();
  setSaveState(source.workspace.savedStatus);
  // The save state has its own field in the details bar, so the status line
  // reports the last command instead of repeating it.
  setQuickDraftStatus(t("quick_draft_ready"));
  refreshQuickDraftSelectControls();
  renderAdjustmentLayers(source);
  renderProtectedRangeControls(source);
  renderQuickDraftVersions(source);
  syncQuickDraftPaperFromState(source);
  updateQuickDraftShellState(source);
  syncQuickDraftControlAvailability(Boolean(String(refs.draft?.value || source.workspace.body || "").trim()));
  if (quickDraftSurfaceMode === "canvas") renderQuickDraftCanvas(source);
  refs.articleViewButton?.classList.toggle("is-active", quickDraftSurfaceMode !== "canvas");
  refs.canvasViewButton?.classList.toggle("is-active", quickDraftSurfaceMode === "canvas");
  syncQuickDraftAiAvailability();
  // A model pass rewrites the body under an open preview; the grain view is
  // the one that must not go stale, since it reports on that very rewrite.
  if (refs.draft?.closest(".teachtext-editor-container")?.classList.contains("is-previewing")) {
    renderQuickDraftPreviewPane();
  }
}

// A command runs from one of the two popovers; both close once it starts, so
// the writer sees the result and not the menu.
function closeQuickDraftMenus() {
  if (refs.tools) refs.tools.open = false;
  if (refs.deliverMenu) refs.deliverMenu.open = false;
}

function isAdjustmentLayerControl(target) {
  const node = target && typeof target.closest === "function" ? target : null;
  return Boolean(
    node?.closest?.("[data-quick-draft-adjustment-enabled]")
    || node?.closest?.("[data-quick-draft-adjustment-strength]")
    || node?.closest?.("[data-quick-draft-adjustment-mask]")
  );
}

function bind() {
  if (bound) return;
  collectRefs();
  if (!refs.form) return;
  bound = true;
  attachQuickDraftMarkdownEditor();

  ["input", "change"].forEach((eventName) => {
    refs.form.addEventListener(eventName, (event) => {
      if (eventName === "change" && isAdjustmentLayerControl(event.target)) return;
      syncQuickDraftTemplateUi();
      updateDraftStats();
      updateSourceCount();
      const titlePatch = event.target === refs.titleInput
        ? { workspace: { title: String(refs.titleInput.value || "").trim(), titleMode: refs.titleInput.value.trim() ? "manual" : "auto" } }
        : {};
      renderDecisionStatuses(saveQuickDraft(titlePatch, { debounce: true }));
    });
  });
  refs.form.addEventListener("change", (event) => {
    const enabledToggle = event.target?.closest?.("[data-quick-draft-adjustment-enabled]");
    if (enabledToggle) {
      updateAdjustmentLayer(enabledToggle.dataset.quickDraftAdjustmentEnabled, { enabled: enabledToggle.checked });
      return;
    }
    const strengthSelect = event.target?.closest?.("[data-quick-draft-adjustment-strength]");
    if (strengthSelect) {
      updateAdjustmentLayer(strengthSelect.dataset.quickDraftAdjustmentStrength, { strength: Number(strengthSelect.value) || ADJUSTMENT_DEFAULT_STRENGTH });
      return;
    }
    const maskInput = event.target?.closest?.("[data-quick-draft-adjustment-mask]");
    if (maskInput) {
      updateAdjustmentLayer(maskInput.dataset.quickDraftAdjustmentMask, { mask: maskInput.value });
      return;
    }
    const protectedInput = event.target?.closest?.("[data-quick-draft-protected-ranges]");
    if (protectedInput) {
      const next = normalizeAdjustmentLayerMask(protectedInput.value);
      saveQuickDraft({ workspace: { protectedRanges: next } }, { debounce: false });
      renderProtectedRangeControls(activeProjectQuickDraft({ create: false })?.record);
      refreshQuickDraftPreviewIfOpen();
      setQuickDraftStatus(t("quick_draft_protect_saved"));
    }
  });
  refs.format?.addEventListener("change", () => {
    syncQuickDraftTemplateUi();
    refreshQuickDraftSelectControls();
  });
  refs.duration?.closest(".select-wrap")?.addEventListener("pointerdown", () => {
    syncQuickDraftTemplateUi();
    refreshQuickDraftSelectControls();
  }, true);
  const syncQuickDraftSelectionState = () => {
    const el = refs.draft;
    const selected = Boolean(
      el
      && !el.classList.contains("is-hidden")
      && el.selectionStart !== null
      && el.selectionEnd !== null
      && el.selectionStart !== el.selectionEnd
    );
    el?.closest(".teachtext-editor-container")?.classList.toggle("is-selected", selected);
  };
  ["select", "mouseup", "keyup"].forEach((eventName) => {
    refs.draft?.addEventListener(eventName, syncQuickDraftSelectionState);
  });
  refs.draft?.addEventListener("blur", () => {
    refs.draft?.closest(".teachtext-editor-container")?.classList.remove("is-selected");
  });
  document.getElementById("quick-draft-return-sideask")?.addEventListener("click", askClioTalk);
  refs.saveButton?.addEventListener("click", () => {
    setQuickDraftPaperSurface("editor", { manual: true });
    startWritingNow();
  });
  refs.saveProjectDocButton?.addEventListener("click", saveQuickDraftAsProjectDocument);
  refs.sendTeachTextButton?.addEventListener("click", transferQuickDraftToTeachText);
  refs.sendReviewButton?.addEventListener("click", sendQuickDraftToReviewDesk);
  refs.switchMultiFinderButton?.addEventListener("click", switchToMultiFinder);
  refs.useMountedButton?.addEventListener("click", useMountedSources);
  refs.collectVentButton?.addEventListener("click", collectVentOutline);
  refs.importChatButton?.addEventListener("click", importChatScreenshots);
  refs.adoptImpressionButton?.addEventListener("click", adoptFirstImpression);
  refs.confirmHandsOnButton?.addEventListener("click", confirmHandsOnFromAnnotations);
  refs.startWritingButton?.addEventListener("click", startWritingNow);
  refs.restoreDumpButton?.addEventListener("click", restoreDumpToBody);
  // Body / Grain / Read are three exclusive views of one text, so one group
  // owns them and the article view is simply "no preview open".
  refs.displayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.quickDraftDisplay || "body";
      if (mode === "grain") setQuickDraftPreviewMode("grain");
      else if (mode === "read") setQuickDraftPreviewMode("composite");
      else leaveQuickDraftPreview();
    });
  });
  document.querySelectorAll("[data-quick-draft-drawer]").forEach((button) => {
    button.addEventListener("click", () => {
      const drawer = button.dataset.quickDraftDrawer === "inspector" ? "inspector" : "shelf";
      const className = drawer === "inspector" ? "is-inspector-open" : "is-shelf-open";
      const other = drawer === "inspector" ? "is-shelf-open" : "is-inspector-open";
      const open = !refs.form?.classList.contains(className);
      refs.form?.classList.toggle(className, open);
      refs.form?.classList.remove(other);
      syncQuickDraftDrawerButtons();
    });
  });
  document.querySelectorAll("[data-quick-draft-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      refs.form?.classList.remove("is-shelf-open", "is-inspector-open");
      syncQuickDraftDrawerButtons();
    });
  });
  // The strip of paper a drawer never covers is the easiest way back.
  document.querySelector(".quick-draft-paper")?.addEventListener("click", (event) => {
    const open = refs.form?.classList.contains("is-shelf-open") || refs.form?.classList.contains("is-inspector-open");
    if (!open) return;
    event.preventDefault();
    refs.form?.classList.remove("is-shelf-open", "is-inspector-open");
    syncQuickDraftDrawerButtons();
  });
  document.querySelector("[data-quick-draft-open-editor]")?.addEventListener("click", () => {
    setQuickDraftPaperSurface("editor", { manual: true });
    refs.draft?.focus();
  });
  document.querySelector("[data-quick-draft-to-start]")?.addEventListener("click", () => {
    setQuickDraftPaperSurface("intake", { manual: true });
    refs.sources?.focus();
  });
  refs.form.addEventListener("click", (event) => {
    const sourceChip = event.target.closest(".quick-draft-source-chip");
    if (sourceChip) {
      previewSource(sourceChip.dataset.sourceLabel || "");
      return;
    }
    const stanceChip = event.target.closest("[data-quick-draft-stance-index]");
    if (stanceChip) {
      adoptFirstImpression(Number(stanceChip.dataset.quickDraftStanceIndex));
      return;
    }
    const next = event.target.closest("[data-quick-draft-next]");
    if (next) {
      runNextAction(next.dataset.quickDraftNext);
      return;
    }
    const importChat = event.target.closest('[data-action="quick-draft-import-chat"]');
    if (importChat) {
      closeQuickDraftMenus();
      importChatScreenshots();
      return;
    }
    const delivery = event.target.closest("[data-quick-draft-delivery]");
    if (delivery) {
      closeQuickDraftMenus();
      const action = delivery.dataset.quickDraftDelivery || "";
      if (action === "teachtext") transferQuickDraftToTeachText();
      if (action === "copy-markdown") copyQuickDraftMarkdown();
      if (action === "export-markdown") exportQuickDraftMarkdown();
      return;
    }
    const layerToggle = event.target.closest("[data-quick-draft-layer-toggle]");
    if (layerToggle) {
      toggleQuickDraftLayerDetail(layerToggle.dataset.quickDraftLayerToggle || "");
      return;
    }
    const versionButton = event.target.closest("[data-quick-draft-version]");
    if (versionButton) {
      restoreQuickDraftVersion(
        versionButton.dataset.quickDraftVersion || "",
        versionButton.dataset.quickDraftVersionKind || "version"
      );
      return;
    }
    const move = event.target.closest("[data-quick-draft-adjustment-move]");
    if (move) {
      moveAdjustmentLayer(move.dataset.quickDraftAdjustmentMove, Number(move.dataset.direction) || -1);
      return;
    }
    const protectSelection = event.target.closest("[data-quick-draft-protect-selection]");
    if (protectSelection) {
      closeQuickDraftMenus();
      protectSelectionFromTextarea();
      return;
    }
    const scopeButton = event.target.closest("[data-quick-draft-adjustment-scope]");
    if (scopeButton) {
      scopeSelectionToLayer(scopeButton.dataset.quickDraftAdjustmentScope || "");
      return;
    }
    const applyButton = event.target.closest("[data-quick-draft-adjustment-apply]");
    if (applyButton) {
      closeQuickDraftMenus();
      applyAdjustmentLayers();
      return;
    }
    const developButton = event.target.closest("[data-quick-draft-adjustment-develop]");
    if (developButton) {
      closeQuickDraftMenus();
      developAdjustmentLayers();
      return;
    }
    const quickDraftAction = event.target.closest("[data-quick-draft-chat-action]");
    if (quickDraftAction) {
      closeQuickDraftMenus();
      runClioTalkAction(quickDraftAction.dataset.quickDraftChatAction || "", { announceUser: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    const quickDraftActive = !getWindow("quickDraft")?.classList.contains("is-hidden");
    if (!quickDraftActive) return;
    const target = event.target;
    const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
    if (event.key === "Escape" && quickDraftEditingCanvasObject) {
      event.preventDefault();
      quickDraftEditingCanvasObject = false;
      setQuickDraftSurface("canvas");
      return;
    }
    if (event.key === "Escape" && quickDraftPreviewMode !== "render") {
      event.preventDefault();
      leaveQuickDraftPreview();
      return;
    }
    if ((event.key === "v" || event.key === "V") && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      toggleQuickDraftComposite();
    }
  });
  refs.articleViewButton?.addEventListener("click", () => setQuickDraftSurface("linear", { manual: true }));
  refs.canvasViewButton?.addEventListener("click", () => setQuickDraftSurface("canvas", { manual: true }));
  bindQuickDraftCanvasInteractions();
}

function captureWorkingSession() {
  return {
    projectId: activeProjectId,
    workspace: workspaceSnapshot(),
    paperSurface: quickDraftPaperSurface,
    surfaceMode: quickDraftSurfaceMode,
    toolsOpen: !!refs.tools?.open,
    scrollTop: refs.draft?.scrollTop || 0,
    selectionStart: refs.draft?.selectionStart || 0,
    selectionEnd: refs.draft?.selectionEnd || 0,
  };
}

function restoreWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  const slot = activeProjectQuickDraft();
  if (!slot) return false;
  slot.project.quickDraft = normalizeQuickDraftRecord({
    ...slot.record,
    workspace: {
      ...slot.record.workspace,
      ...(state.workspace && typeof state.workspace === "object" ? state.workspace : {}),
    },
  });
  renderQuickDraft(slot.project.quickDraft);
  if (state.paperSurface === "editor" || state.paperSurface === "intake") {
    setQuickDraftPaperSurface(state.paperSurface, { manual: true });
  }
  if (state.surfaceMode === "canvas") {
    quickDraftSurfaceManual = true;
    setQuickDraftSurface("canvas", { manual: true });
  }
  if (refs.tools) refs.tools.open = !!state.toolsOpen;
  requestAnimationFrame(() => {
    if (!refs.draft) return;
    refs.draft.scrollTop = Number(state.scrollTop) || 0;
    const start = Math.min(Number(state.selectionStart) || 0, refs.draft.value.length);
    const end = Math.min(Number(state.selectionEnd) || start, refs.draft.value.length);
    refs.draft.setSelectionRange(start, end);
  });
  return true;
}

async function open(options = {}) {
  bind();
  renderQuickDraft();
  syncQuickDraftSurfaceFromState();
  await openWindow("quickDraft", { ...options, skipQuickDraftEntrypoint: true });
  const win = getWindow("quickDraft");
  // Pairing is desktop grammar: it means two windows side by side, and a phone
  // has no side by side — the paired window would take the screen and Quick
  // Draft would be the one that disappears. SideAsk stays an explicit action.
  const portrait = typeof isPortraitDocumentFlow === "function" && isPortraitDocumentFlow();
  if (!options.skipSideAsk && !portrait && typeof arrangeWindowAssistantSplit === "function" && !isMultiFinderMode()) {
    await arrangeWindowAssistantSplit("quickDraft");
  }
  const rect = win?.getBoundingClientRect();
  if (win && rect && (rect.width < 360 || rect.height < 260) && typeof maximizeWindow === "function") {
    maximizeWindow(win);
  }
  if (typeof updateQuickDraftFocusChrome === "function") updateQuickDraftFocusChrome();
  refs.draft?.focus({ preventScroll: true });
}

window.AISystem6QuickDraftRuntime = Object.freeze({
  activeProjectQuickDraft,
  blankQuickDraft,
  blankQuickDraftWorkspace,
  collectRefs,
  currentAnnotations,
  FIRST_DAY_FORMAT,
  HANDS_ON_REVIEW_FORMAT,
  BILI_DYNAMIC_FORMAT,
  formSnapshot,
  normalizeDuration,
  normalizeQuickDraftRecord,
  normalizeQuickDraftWorkspace,
  normalizeScenario,
  commitQuickDraft,
  flushPendingQuickDraftCommit,
  persistQuickDraftWorkspace,
  paperSurface: () => quickDraftPaperSurface,
  quickDraftAliases,
  quickDraftModelAvailable,
  refs,
  saveQuickDraft,
  updateQuickDraft,
  setBusy,
  setQuickDraftPaperSurface,
  setQuickDraftStatus,
  setSaveState,
  titleFromBody,
  workspaceSnapshot,
});
