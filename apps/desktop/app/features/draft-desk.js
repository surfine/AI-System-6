// Feature module: 钟点稿 / Draft Desk — clean-shell coordinator.
//
// This file owns only the new shell lifecycle: save-state semantics, paper
// switching, module coordination, window open/close/restore, and the public
// API surface. Workspace schema and migration live in
// app/core/quick-draft-workspace.js so this UI can be replaced without ever
// forking a project's durable record. The feature logic is split across
// sibling modules (loaded in the same lazy chain, sharing this bundle's
// top-level scope):
//   quick-draft-intake.js       materials, vent, chat import, source map
//   quick-draft-editor.js       editor chrome, preview modes, versions
//   quick-draft-composition.js  adjustment layers, protect, grain, develop
//   quick-draft-ai.js           model requests and command dispatch
//   quick-draft-handoff.js      delivery actions
//
// Durable data lives on getActiveProject().quickDraft.workspace with a single
// canonical schema (schemaVersion 3); the main writing route is only touched
// by explicit handoff actions.

/** @type {Record<string, any>} */
const refs = {};
let bound = false;
let saveTimer = null;
let pendingQuickDraftCommit = null;
let requestController = null;
let quickDraftDrawerTrigger = null;

// A cloud request rides only requestController.signal, with no deadline of
// its own (unlike the local path, which carries REQUEST_TIMEOUT_MS /
// INFERENCE_TIMEOUT_MS in local-lmstudio-client.js). Without a watchdog here,
// an unsettled await never reaches the `finally` that calls setBusy(false),
// and every Draft Desk control setBusy disables stays wedged forever. Four
// minutes covers a slow cloud completion; a hang past that is worth
// surfacing, not waiting out.
const QUICK_DRAFT_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

function quickDraftTimeoutError(message) {
  // The VM feature test constructs this file's scope without DOMException on
  // it (only the globals the harness lists survive vm.createContext), so a
  // bare `new DOMException(...)` would throw ReferenceError there.
  if (typeof DOMException === "function") return new DOMException(message, "TimeoutError");
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

// The watchdog timer lives ON the controller it guards, not in one shared
// module variable. A single shared timer id was tried first and had a real
// bug: request A's `finally` clears "the" timer on its way out, but by then
// request B (started while A was still in flight) has already replaced it
// with its own — so A's settle silently defused B's watchdog too, and B hung
// forever the moment its own request stalled.
function beginQuickDraftRequest() {
  if (requestController) {
    requestController.abort();
    settleQuickDraftRequest(requestController);
  }
  // The watchdog lives on its own controller so a stale settle can never
  // defuse a newer request's timer. checkJs needs the widened shape named.
  const controller = /** @type {AbortController & { quickDraftTimer?: ReturnType<typeof setTimeout> | null }} */ (new AbortController());
  requestController = controller;
  controller.quickDraftTimer = setTimeout(() => {
    controller.quickDraftTimer = null;
    if (requestController === controller) {
      controller.abort(quickDraftTimeoutError("Quick Draft model did not respond in time."));
    }
  }, QUICK_DRAFT_REQUEST_TIMEOUT_MS);
  return controller;
}

// Clear this controller's own watchdog and release the shared controller slot
// — but only if it still belongs to this request. A stale settle (e.g. an
// early-return commit failure racing a newer request the user already
// started) must not null out the controller a later call is using, and must
// never touch a later controller's own timer.
function settleQuickDraftRequest(controller) {
  if (controller?.quickDraftTimer) {
    clearTimeout(controller.quickDraftTimer);
    controller.quickDraftTimer = null;
  }
  if (!controller || requestController === controller) {
    requestController = null;
  }
}

// An AbortError's .name survives cross-browser, but the *reason* on the
// signal does not: WebKit reports every aborted fetch as a plain AbortError
// regardless of the reason passed to abort(), so the timeout must be told
// apart by inspecting the controller's signal.reason, not just error.name.
function quickDraftRequestTimedOut(error, controller) {
  if (error?.name === "TimeoutError") return true;
  const reason = controller?.signal?.reason;
  return reason?.name === "TimeoutError";
}

// One window, three regions: the material shelf, the paper, the inspector.
// The paper never leaves the screen, so there is no phase to switch — only
// which surface the paper carries. With no draft it carries the intake well;
// once a draft exists it carries the body. That is an empty state, and a
// manual choice is never yanked back.
let quickDraftDisplayMode = "body";

/** @returns {any} */
function $(id) {
  return document.getElementById(id);
}

function collectRefs() {
  refs.form = $("quick-draft-form");
  refs.noProject = $("quick-draft-no-project");
  refs.workspace = quickDraftQuery(".draft-desk-workspace");
  refs.footer = quickDraftQuery(".draft-desk-actions");
  refs.status = $("quick-draft-status");
  refs.windowTitle = $("quick-draft-title");
  refs.titleInput = $("quick-draft-title-input");
  refs.titleDisplay = $("quick-draft-title-display");
  refs.settingsSummary = $("quick-draft-settings-summary");
  refs.stats = $("quick-draft-stats");
  refs.saveState = $("quick-draft-save-state");
  refs.sourceCount = $("quick-draft-source-count");
  refs.sourceSummary = $("quick-draft-source-summary");
  refs.addMaterialMenu = $("quick-draft-add-material");
  refs.tools = $("quick-draft-tools");
  refs.deliverMenu = $("quick-draft-deliver");
  refs.shareButton = quickDraftQuery('[data-quick-draft-delivery="share-markdown"]');
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
  refs.officialSummary = $("quick-draft-official-summary");
  refs.unavailableSummary = $("quick-draft-unavailable-summary");
  refs.audienceSummary = $("quick-draft-audience-summary");
  refs.firstImpressionStatus = $("quick-draft-first-impression-status");
  refs.draft = $("quick-draft-draft");
  refs.preview = $("quick-draft-preview");
  refs.lightroom = getWindow("lightroom");
  refs.toggleGrainButton = $("quick-draft-toggle-grain");
  refs.toggleCompositeButton = $("quick-draft-toggle-composite");
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
  refs.eli5Bar = quickDraftQuery("[data-quick-draft-eli5-bar]");
  refs.eli5Enabled = quickDraftQuery("[data-quick-draft-eli5-enabled]");
  refs.eli5Baseline = quickDraftQuery("[data-quick-draft-eli5-baseline-select]");
  refs.eli5BaselineWrap = quickDraftQuery("[data-quick-draft-eli5-baseline-wrap]");
  refs.eli5Actions = quickDraftQuery("[data-quick-draft-eli5-actions]");
  refs.eli5Candidate = quickDraftQuery("[data-quick-draft-eli5-candidate]");
  refs.sourceMap = $("quick-draft-source-map");
  refs.shelfTitle = $("quick-draft-shelf-title");
  refs.versionsList = $("quick-draft-versions-list");
  refs.protectState = $("quick-draft-protect-state");
  refs.stackState = $("quick-draft-stack-state");
  refs.intakeWell = document.querySelector("[data-quick-draft-intake-well]");
  refs.bodySurface = document.querySelector("[data-quick-draft-body-surface]");
  refs.displayButtons = document.querySelectorAll("[data-quick-draft-display]");
}

function projectQuickDraft(projectId = activeProjectId, { create = true } = {}) {
  const active = typeof getActiveProject === "function" ? getActiveProject() : null;
  const project = !projectId || active?.id === projectId
    ? active
    : (typeof projects !== "undefined" ? projects.find((item) => item.id === projectId) : null);
  if (!project) return null;
  const normalized = normalizeQuickDraftRecord(project.quickDraft);
  if (create || project.quickDraft) project.quickDraft = normalized;
  return { project, record: normalized };
}

function activeProjectQuickDraft(options = {}) {
  return projectQuickDraft(activeProjectId, options);
}

function activeDraftDeskPreset(scenario = "") {
  const format = scenario || quickDraftSetupSnapshot().scenario;
  return window.AISystem6DraftDeskPresets?.forScenario?.(normalizeScenario(format)) || null;
}

function currentAnnotations() {
  return activeProjectQuickDraft({ create: false })?.record.workspace.intake.annotations || { ...emptyAnnotations };
}

// The new paper exposes only the fields shown in the design: title, format,
// length, the writer's words, and material. Older records can still carry the
// retired setup fields, so keep them in the durable record and model payload
// without recreating hidden compatibility inputs in the UI.
function quickDraftSetupSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  const previous = normalizeQuickDraftRecord(record).workspace.intake.setup;
  const fieldValue = (field, fallback = "") => typeof field?.value === "string" ? field.value : fallback;
  return {
    ...previous,
    thesis: fieldValue(refs.thesis, fieldValue(refs.say, previous.thesis)),
    pastedSources: fieldValue(refs.sources, previous.pastedSources),
    targetDuration: fieldValue(refs.duration, previous.targetDuration),
    scenario: fieldValue(refs.format, previous.scenario),
    firstDaySubject: fieldValue(refs.firstDaySubject, previous.firstDaySubject),
    handsOnNotes: fieldValue(refs.handsOn, previous.handsOnNotes),
    officialMaterials: fieldValue(refs.officialMaterials, previous.officialMaterials),
  };
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
  const previousSetup = quickDraftSetupSnapshot(previous);
  const scenario = normalizeScenario(previousSetup.scenario);
  const setup = {
    ...previousSetup,
    targetDuration: normalizeDuration(previousSetup.targetDuration, scenario),
    scenario,
    firstDaySubject: subjectValue,
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
    projectDocId: previous.workspace.projectDocId,
  };
}

function formSnapshot() {
  return workspaceSnapshot();
}

function setSaveState(state = "saved") {
  if (!refs.saveState) return;
  refs.saveState.textContent = t(
    state === "new" ? "quick_draft_new_state"
      : state === "modified" ? "quick_draft_modified_state"
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
  if (!String(body).trim()) {
    refs.stats.textContent = t("quick_draft_stats_empty");
    return;
  }
  if (typeof formatReviewVoiceStats === "function") {
    refs.stats.textContent = formatReviewVoiceStats(body);
    return;
  }
  const units = draftUnitCount(body);
  const seconds = Math.ceil(units / (currentLanguage === "zh" ? 5 : 2.4));
  if (!units) {
    refs.stats.textContent = t("quick_draft_stats_empty");
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

// Persistence has explicit completion semantics. The record is prepared as
// Saved before saveDeskState snapshots it; a failed write rolls the in-memory
// receipt back to Modified and never claims that the write landed.
async function persistQuickDraftWorkspace(projectId = activeProjectId) {
  const project = projectQuickDraft(projectId, { create: false })?.project;
  if (!project?.quickDraft?.workspace) return true;
  project.quickDraft.workspace.savedStatus = "saved";
  project.quickDraft.savedStatus = "saved";
  let saved = true;
  try {
    saved = typeof saveDeskState === "function" ? await saveDeskState() : true;
  } catch {
    saved = false;
  }
  if (!saved) {
    if (project.quickDraft.workspace) {
      project.quickDraft.workspace.savedStatus = "modified";
      project.quickDraft.savedStatus = "modified";
    }
    if (project.id === activeProjectId) {
      setSaveState("modified");
      setQuickDraftStatus(t("quick_draft_save_failed"));
    }
    return false;
  }
  if (project.id === activeProjectId) setSaveState("saved");
  return true;
}

// ---- 文字亮室 ----------------------------------------------------------
// The negative, the adjustment stack, the locks and the version chain belong to
// the document, not to Quick Draft, so they live in the darkroom record keyed
// by (project, document). These accessors are the only way in from here.
//
// Reads are synchronous because every render asks several times; the record is
// loaded into the store's cache when the draft is opened. A draft with no
// document yet answers with a blank record rather than null, so no caller has
// to ask whether this draft has ever been developed.

const DARKROOM_FIELDS = Object.freeze(["composition", "adjustmentLayers", "protectedRanges", "versions"]);

function darkroomDocumentId(record) {
  return String(normalizeQuickDraftRecord(record).workspace.projectDocId || "");
}

// Which document the darkroom's reads and writes belong to. Usually the draft
// the desk is writing — but while 文字亮室 holds another application's
// document, every darkroom read and write is that document's, not the
// draft's. Without this split a developed subject showed the draft's stack
// and chain, and 试看 filed its composite under the draft's record: the
// instruments read one text and reported on another. A cross-project commit
// keeps the plain answer — a subject belongs to the active project only.
function darkroomTargetDocumentId(record, projectId = activeProjectId) {
  if (projectId === activeProjectId && lightroomSubject) return lightroomSubject.documentId;
  return darkroomDocumentId(record);
}

function darkroomOf(record = activeProjectQuickDraft({ create: false })?.record, projectId = activeProjectId) {
  const blank = window.AISystem6DarkroomRecord?.blankDarkroomRecord?.()
    || { negative: "", negativeUpdatedAt: "", modelDelivered: "", modelDeliveredAt: "", composite: "", currentKey: "", generatedAt: "", adjustmentLayers: [], protectedRanges: [], versions: [] };
  const documentId = darkroomTargetDocumentId(record, projectId);
  if (documentId) return window.AISystem6DarkroomStore?.darkroomRecord?.(projectId, documentId) || blank;
  // No document yet, so the state is waiting in the pending bucket. Reading it
  // here is not a convenience: without it a draft that has never been saved as
  // a project document would report no layers, no locks and no negative — and
  // that is the state every draft is in before it is first handed on.
  const pending = normalizeQuickDraftRecord(record).workspace.pendingDarkroom;
  return pending
    ? (window.AISystem6DarkroomRecord?.darkroomRecordFromWorkspace?.(pending) || blank)
    : blank;
}

// A patch aimed at the darkroom is split out of the workspace patch here, so a
// write can never land on the workspace and become a second truth. It returns
// the fields that are still the workspace's.
/**
 * @param {string} projectId
 * @param {any} record
 * @param {Record<string, any>} patchWorkspace
 */
function splitDarkroomPatch(projectId, record, patchWorkspace = {}) {
  /** @type {Record<string, any>} */
  const workspacePatch = { ...patchWorkspace };
  const darkroomPatch = {};
  let touched = false;
  for (const field of DARKROOM_FIELDS) {
    if (!(field in workspacePatch)) continue;
    touched = true;
    if (field === "composition") Object.assign(darkroomPatch, workspacePatch.composition || {});
    else darkroomPatch[field] = workspacePatch[field];
    delete workspacePatch[field];
  }
  if (touched) {
    const documentId = darkroomTargetDocumentId(record, projectId);
    if (documentId) {
      window.AISystem6DarkroomStore?.setDarkroomRecord?.(projectId, documentId, {
        ...darkroomOf(record, projectId),
        ...darkroomPatch,
      });
    } else {
      // No document to file it under yet. Dropping it here is how a negative or
      // a version disappears without a trace, so it waits in the same bucket a
      // pre-schema-4 record uses and is drained by ensureDarkroomReady once the
      // draft has a document.
      /** @type {Record<string, any>} */
      const pending = record?.workspace?.pendingDarkroom || {};
      workspacePatch.pendingDarkroom = {
        ...pending,
        ...darkroomPatch,
        composition: { ...(pending.composition || {}), ...darkroomPatch },
      };
    }
  }
  return { workspacePatch, touchedDarkroom: touched };
}

function updateQuickDraftForProject(projectId, patch = {}, { announce = false, captureForm = projectId === activeProjectId } = {}) {
  const slot = projectQuickDraft(projectId);
  if (!slot) {
    if (projectId === activeProjectId) setQuickDraftStatus(t("quick_draft_no_project"));
    return null;
  }
  const now = new Date().toISOString();
  const incoming = patch.workspace && typeof patch.workspace === "object" ? patch.workspace : {};
  const { workspacePatch: patchWorkspace } = splitDarkroomPatch(projectId, slot.record, incoming);
  const workspace = normalizeQuickDraftWorkspace({
    ...slot.record.workspace,
    ...(captureForm ? workspaceSnapshot(slot.record) : {}),
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
  if (slot.project.id === activeProjectId) {
    updateDraftStats();
    updateSourceCount();
    setSaveState(workspace.savedStatus);
    if (announce) setQuickDraftStatus(t("quick_draft_saving"));
  }
  return nextRecord;
}

function updateQuickDraft(patch = {}, options = {}) {
  return updateQuickDraftForProject(activeProjectId, patch, options);
}

async function commitQuickDraftForProject(projectId, patch = {}, options = {}) {
  const slot = projectQuickDraft(projectId);
  if (!slot) return { ok: false, error: new Error("NO_ACTIVE_PROJECT") };
  const previous = slot.project.quickDraft;
  const record = updateQuickDraftForProject(projectId, patch, options);
  if (slot.project.id === activeProjectId) setSaveState("saving");
  const documentId = darkroomTargetDocumentId(slot.project.quickDraft, projectId);
  if (documentId && window.AISystem6DarkroomStore) {
    try {
      await window.AISystem6DarkroomStore.persistDarkroomRecord(projectId, documentId);
    } catch {
      // The darkroom holds the writer's own words. A failed write must not be
      // followed by a Saved receipt for the draft.
      slot.project.quickDraft = previous;
      if (slot.project.id === activeProjectId) setSaveState("modified");
      return { ok: false, error: new Error("DARKROOM_COMMIT_FAILED") };
    }
  }
  const ok = await persistQuickDraftWorkspace(projectId);
  if (!ok) {
    slot.project.quickDraft = previous;
    slot.project.quickDraft.workspace.savedStatus = "modified";
    slot.project.quickDraft.savedStatus = "modified";
    if (slot.project.id === activeProjectId) setSaveState("modified");
    return { ok: false, error: new Error("QUICK_DRAFT_COMMIT_FAILED") };
  }
  return { ok: true, record: slot.project.quickDraft || record };
}

async function commitQuickDraft(patch = {}, options = {}) {
  return commitQuickDraftForProject(activeProjectId, patch, options);
}

// Every async Quick Draft task (AI rewrite, Mingming, adjustment compose)
// captures its owning project up front and commits back to that project only.
// The shared textarea may move to another project while the model runs; a
// response is discarded once the active project changes.
function createQuickDraftAsyncTask({ create = true } = {}) {
  const slot = activeProjectQuickDraft({ create });
  if (!slot) return null;
  const projectId = slot.project.id;
  return {
    projectId,
    record: normalizeQuickDraftRecord(slot.record),
    stillOwnsActiveProject() {
      return activeProjectId === projectId;
    },
    currentRecord() {
      return projectQuickDraft(projectId, { create: false })?.record || null;
    },
    async commit(patch, options = {}) {
      return commitQuickDraftForProject(projectId, patch, options);
    },
  };
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

// Input-like edits are the only callers of this lightweight API. Explicit
// commands use commitQuickDraft() so no durable operation is fire-and-forget.
function saveQuickDraft(patch = {}, { announce = false } = {}) {
  const projectId = activeProjectId;
  const record = updateQuickDraft(patch, { announce });
  if (!record) return null;
  scheduleQuickDraftCommit(projectId);
  return record;
}

function setQuickDraftStatus(message, { live = true } = {}) {
  if (refs.status) refs.status.textContent = message || t("quick_draft_ready");
  getWindow("quickDraft")?.classList.toggle("has-live-quick-draft-status", !!live);
}

// ---- Model availability --------------------------------------------------
// Without a model the window still works as a writing application: handwrite,
// save, organize material, and restore versions. AI actions are disabled with a
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

function quickDraftConnectedModelName() {
  if (typeof cloudConfig !== "undefined"
    && cloudConfig?.active
    && typeof cloudCredentialReady === "function"
    && cloudCredentialReady()) {
    return String(cloudConfig.model || cloudConfig.provider || "").trim();
  }
  // A configured name is not a connection. The cloud branch above already
  // asks whether the credential is ready; the local branch returned whatever
  // was typed into Control Panel, so Quick Draft announced "Model: local-model"
  // while the menu bar said "Model not connected" — the desk contradicting
  // itself, with the false half in the writing window.
  if (typeof isLocalModelIndicatorReady === "function" && !isLocalModelIndicatorReady()) return "";
  return typeof getLocalModelRequestName === "function"
    ? String(getLocalModelRequestName() || "").trim()
    : String(modelInput?.value || "").trim();
}

// One readiness snapshot feeds both the in-window controls and the menu bar.
// Commands are unavailable before their real inputs exist, matching DocMap's
// empty-state contract instead of allowing a click only to reject it later.
function quickDraftInteractionState(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftRecord(record).workspace;
  const intake = workspace.intake || {};
  const setup = intake.setup || {};
  const body = String(refs.draft?.value || workspace.body || "").trim();
  const say = String(refs.say?.value || setup.thesis || "").trim();
  const sources = String(refs.sources?.value || setup.pastedSources || "").trim();
  const capturedMaterial = Boolean(
    (Array.isArray(intake.ventLog) && intake.ventLog.length)
    || (Array.isArray(intake.chatMaterials) && intake.chatMaterials.length)
    || String(intake.outlineSeed || "").trim()
  );
  return {
    hasBody: Boolean(body),
    hasInput: Boolean(body || say || sources || capturedMaterial),
    hasOrganizableMaterial: Boolean(sources || capturedMaterial),
    ventActive: typeof isVentIntakeActive === "function" && isVentIntakeActive(),
    ventCount: typeof ventEntryCount === "function" ? ventEntryCount() : 0,
  };
}

function setQuickDraftCommandAvailability(button, enabled, reasonKey = "") {
  if (!button) return;
  // A busy control stays disabled; the availability parks in wasDisabled so
  // setControlLoading() restores the right state when the run ends.
  if (typeof setControlIdleDisabled === "function") setControlIdleDisabled(button, !enabled);
  else button.disabled = !enabled;
  if (!enabled && reasonKey) {
    button.dataset.quickDraftDisabledReason = reasonKey;
    button.dataset.balloonHelpDisabled = reasonKey;
    button.title = t(reasonKey);
    return;
  }
  if (!button.dataset.quickDraftDisabledReason) return;
  delete button.dataset.quickDraftDisabledReason;
  delete button.dataset.balloonHelpDisabled;
  button.removeAttribute("title");
}

function syncQuickDraftAiAvailability() {
  const modelAvailable = quickDraftModelAvailable();
  const state = quickDraftInteractionState();
  const message = modelAvailable ? "" : t("quick_draft_connect_ai");
  document.querySelectorAll("[data-quick-draft-ai-action]").forEach((button) => {
    setQuickDraftCommandAvailability(button, modelAvailable, "quick_draft_connect_ai");
  });
  const actionButton = (action) => quickDraftQuery(`[data-quick-draft-chat-action="${action}"]`);
  setQuickDraftCommandAvailability(actionButton("vent-on"), !state.ventActive, "quick_draft_vent_mode_on");
  setQuickDraftCommandAvailability(actionButton("vent-off"), state.ventActive, "quick_draft_vent_mode_off");
  ["vent-summary", "organize"].forEach((action) => {
    const reason = !modelAvailable ? "quick_draft_connect_ai" : "quick_draft_vent_missing";
    setQuickDraftCommandAvailability(actionButton(action), modelAvailable && state.hasOrganizableMaterial, reason);
  });
  setQuickDraftCommandAvailability(
    actionButton("draft"),
    modelAvailable && state.hasInput,
    modelAvailable ? "quick_draft_missing_first_day" : "quick_draft_connect_ai"
  );
  ["mingming", "luoluo", "hkrr", "praise"].forEach((action) => {
    const reason = !modelAvailable ? "quick_draft_connect_ai" : "quick_draft_needs_body";
    setQuickDraftCommandAvailability(actionButton(action), modelAvailable && state.hasBody, reason);
  });
  if (refs.saveButton) {
    const action = refs.saveButton.dataset.quickDraftPrimaryAction || "draft";
    const enabled = action === "deliver" || action === "continue"
      ? state.hasBody
      : modelAvailable && (action === "draft" ? state.hasInput : state.hasBody);
    const reason = !modelAvailable && action !== "deliver" && action !== "continue"
      ? "quick_draft_connect_ai"
      : action === "draft"
        ? "quick_draft_missing_first_day"
        : "quick_draft_needs_body";
    setQuickDraftCommandAvailability(refs.saveButton, enabled, reason);
  }
  if (refs.status && !String(refs.status.textContent || "").trim()) {
    setQuickDraftStatus(message || t("quick_draft_ready"), { live: false });
  }
  if (typeof syncQuickDraftMobileAdjustmentActions === "function") {
    syncQuickDraftMobileAdjustmentActions(activeProjectQuickDraft({ create: false })?.record);
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
  saveQuickDraft({ workspace: { body: say } });
  return true;
}

// Which paper is on screen is derived from the work, never stored. Quick Draft
// used to keep the surface in a variable with a manual override beside it, and
// the two drifted apart: a draft whose body was already written could still be
// showing the intake well, asking the writer what they wanted to say. The
// writing route settled this years ago — its phase is computed live from the
// persisted truth "so the two can never drift apart" — and this follows it.
//
// There is nothing to switch, so there is no switch. Continue Writing promotes
// what is in the well into the body; the paper follows because a body now
// exists.
// Controls used to live in one form, so everything found them with
// refs.form.querySelector. The darkroom's controls move to their own window in
// 文字亮室, and a lookup that only knows the form would stop finding them the
// moment they moved. One scoped query answers for both, so where a control
// lives becomes a layout decision rather than a rename of forty call sites.
// ---- 文字亮室 subject ---------------------------------------------------
// The darkroom develops a document. Usually that document is the draft Quick
// Draft is writing, but it does not have to be: a manuscript from Writing
// Studio or an older draft off the Project Hard Disk has a negative and a
// chain of its own, and the same instruments read them.
//
// A subject other than the writer's own draft is read-only here, and says so.
// The views can be computed from any text, but writing back into a document
// another application owns needs that application to hand over the pen, and
// claiming an edit landed when it did not is the one thing this surface must
// never do.
let lightroomSubject = null;

function lightroomSubjectDocumentId() {
  if (lightroomSubject) return lightroomSubject.documentId;
  return darkroomDocumentId(activeProjectQuickDraft({ create: false })?.record);
}

function lightroomSubjectFile() {
  const id = lightroomSubject?.documentId;
  if (!id || typeof chatFiles === "undefined") return null;
  return chatFiles.find((file) => file.id === id && file.type === "text") || null;
}

function lightroomBodyText() {
  if (!lightroomSubject) return String(refs.draft?.value || "");
  return String(lightroomSubjectFile()?.body || "");
}

function lightroomIsReadOnly() {
  return Boolean(lightroomSubject);
}

// The read-only subject greys the window's own write controls through the one
// owner of that property (write-lease's [data-requires-write] sweep), so the
// menu rows and the buttons they shortcut can never give two answers again.
// 试看 deliberately carries no data-requires-write: it writes only the
// darkroom record, which is this application's own state.
window.AISystem6WriteLease?.registerReadOnlyRule?.((element) => (
  lightroomIsReadOnly() && Boolean(element?.closest?.('[data-window="lightroom"]'))
));

// Open the darkroom on a document that Quick Draft is not writing.
async function developDocument(documentId = "") {
  const id = String(documentId || "");
  if (!id || typeof chatFiles === "undefined") return false;
  const file = chatFiles.find((item) => item.id === id && item.type === "text");
  if (!file) return false;
  lightroomSubject = { documentId: id, name: String(file.name || "") };
  const store = window.AISystem6DarkroomStore;
  if (store) {
    try {
      await store.loadDarkroomRecord(activeProjectId, id);
    } catch {
      lightroomSubject = null;
      return false;
    }
  }
  await openWindow("lightroom", { skipQuickDraftEntrypoint: true });
  renderLightroomSubject({ force: true });
  const status = document.getElementById("lightroom-status");
  if (status) status.textContent = t("lightroom_read_only");
  window.AISystem6WriteLease?.syncReadOnlySurface?.();
  setQuickDraftDisplayMode("grain");
  if (typeof updateMenuState === "function") updateMenuState();
  return true;
}

// ---- 文字亮室 menu state -------------------------------------------------
// A menu bar is the complete list of what this application can do, so the rows
// that name an object -- a document, a version, a voice -- are filled from the
// state that owns those objects, and the checkmarks are painted here rather
// than in window-manager.js, which has no business knowing what a layer is.

function hasQuickDraftSelection() {
  const el = refs.draft;
  return Boolean(
    el
    && el.selectionStart !== null
    && el.selectionEnd !== null
    && el.selectionStart !== el.selectionEnd
  );
}

function lightroomVersionRows() {
  const record = activeProjectQuickDraft({ create: false })?.record;
  const darkroom = darkroomOf(record);
  const stampOf = (value) => (value
    ? new Date(value).toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })
    : "");
  const rows = [...(darkroom.versions || [])].reverse().slice(0, 12).map((entry) => ({
    label: [stampOf(entry.createdAt), textExcerpt(entry.body, 18) || t("quick_draft_versions")].filter(Boolean).join(" · "),
    action: `lightroom-restore-version:version:${entry.id}`,
  }));
  if (darkroom.negativeUpdatedAt) {
    rows.push({
      label: [stampOf(darkroom.negativeUpdatedAt), t("quick_draft_negative")].filter(Boolean).join(" · "),
      action: "lightroom-restore-version:negative:negative",
    });
  }
  return rows;
}

function lightroomDocumentRows() {
  if (typeof getProjectFiles !== "function") return [];
  const current = lightroomSubjectDocumentId();
  return getProjectFiles()
    .filter((file) => file.type === "text" && String(file.body || "").trim())
    .slice(0, 20)
    .map((file) => ({
      label: String(file.name || t("quick_draft_versions")),
      action: `lightroom-develop-document:${file.id}`,
      checked: file.id === current,
    }));
}

function lightroomMenuRows(kind = "") {
  if (kind === "versions") return lightroomVersionRows();
  if (kind === "documents") return lightroomDocumentRows();
  if (kind === "voices") return window.AISystem6QuickDraftListen?.voiceRows?.() || [];
  return [];
}

/**
 * @param {HTMLElement} button
 * @param {{ checked?: boolean, disabled?: boolean }} [state]
 */
function paintLightroomMenuRow(button, { checked = false, disabled = false } = {}) {
  button.classList.toggle("is-checked", checked === true);
  button.classList.toggle("is-disabled", disabled === true);
  // Only a real button carries `disabled`, and only a row inside a popover is
  // a menu row: the same painter is safe to point at anything the bar holds.
  if (button instanceof HTMLButtonElement && button.closest(".menu-popover, .menu-submenu-popover, .menu-sub-popover")) {
    button.disabled = disabled === true;
  }
}

function syncLightroomMenuState() {
  const bar = document.querySelector(".menu-bar");
  if (!bar || !bar.querySelector('[data-menu-id="adjust"], [data-menu-id="listen"], [data-lightroom-rows]')) return;
  const record = activeProjectQuickDraft({ create: false })?.record;
  const readOnly = lightroomIsReadOnly();
  const zoom = typeof currentQuickDraftGrainZoom === "function" ? currentQuickDraftGrainZoom() : "grain";
  const lens = (typeof getActiveProject === "function" && getActiveProject()?.explanationLens) || {};
  const inspectorOpen = quickDraftPanelVisible("inspector");

  /** @type {NodeListOf<HTMLElement>} */ (bar.querySelectorAll("[data-lightroom-zoom]")).forEach((button) => {
    button.classList.toggle("is-checked", button.dataset.lightroomZoom === zoom);
  });
  const inspectorRow = /** @type {HTMLElement | null} */ (bar.querySelector('[data-action="lightroom-toggle-inspector"]'));
  if (inspectorRow) {
    const labelKey = inspectorOpen ? "quick_draft_hide_adjustments" : "quick_draft_show_adjustments";
    inspectorRow.dataset.i18n = labelKey;
    inspectorRow.textContent = t(labelKey);
    inspectorRow.classList.toggle("is-checked", inspectorOpen);
  }
  /** @type {NodeListOf<HTMLElement>} */ (bar.querySelectorAll("[data-lightroom-layer]")).forEach((button) => {
    const layer = adjustmentLayerState(button.dataset.lightroomLayer || "", record);
    const enabled = layer?.enabled === true;
    if (button.dataset.lightroomLayerStrength) {
      paintLightroomMenuRow(button, {
        checked: Number(button.dataset.lightroomLayerStrength) === Number(layer?.strength ?? ADJUSTMENT_DEFAULT_STRENGTH),
        disabled: readOnly || !enabled,
      });
      return;
    }
    if (button.dataset.lightroomLayerRow === "enabled") {
      paintLightroomMenuRow(button, { checked: enabled, disabled: readOnly });
      return;
    }
    if (button.dataset.lightroomLayerRow === "scope-selection") {
      paintLightroomMenuRow(button, { disabled: readOnly || !hasQuickDraftSelection() });
      return;
    }
    if (button.dataset.lightroomLayerRow === "scope-all") {
      paintLightroomMenuRow(button, {
        checked: !String(layer?.mask || "").trim(),
        disabled: readOnly || !String(layer?.mask || "").trim(),
      });
      return;
    }
    paintLightroomMenuRow(button, { disabled: readOnly });
  });
  const eli5Row = /** @type {HTMLElement | null} */ (bar.querySelector('[data-lightroom-eli5="enabled"]'));
  if (eli5Row) paintLightroomMenuRow(eli5Row, { checked: lens.enabled === true, disabled: readOnly });
  /** @type {NodeListOf<HTMLElement>} */ (bar.querySelectorAll("[data-lightroom-eli5-baseline]")).forEach((button) => {
    paintLightroomMenuRow(button, {
      checked: (lens.baselineKnowledge || "secondary-school") === button.dataset.lightroomEli5Baseline,
      disabled: readOnly || lens.enabled !== true,
    });
  });
  const listen = window.AISystem6QuickDraftListen;
  const playRow = /** @type {HTMLElement | null} */ (bar.querySelector('[data-action="lightroom-listen-toggle"]'));
  if (playRow) {
    const labelKey = listen?.isPlaying?.() ? "quick_draft_listen_pause" : "quick_draft_listen_play";
    playRow.dataset.i18n = labelKey;
    playRow.textContent = t(labelKey);
  }
  const rehearseRow = /** @type {HTMLElement | null} */ (bar.querySelector('[data-action="lightroom-listen-rehearse"]'));
  if (rehearseRow) {
    const labelKey = listen?.isRehearsing?.() ? "quick_draft_listen_rehearse_stop" : "quick_draft_listen_rehearse";
    rehearseRow.dataset.i18n = labelKey;
    rehearseRow.textContent = t(labelKey);
  }
  const partnerRow = /** @type {HTMLElement | null} */ (bar.querySelector('[data-action="lightroom-listen-partner"]'));
  if (partnerRow) {
    const labelKey = listen?.isPartnerListening?.() ? "quick_draft_listen_partner_stop" : "quick_draft_listen_partner";
    partnerRow.dataset.i18n = labelKey;
    partnerRow.textContent = t(labelKey);
  }
  // Rows that name an object are rebuilt, not restyled: the version chain, the
  // project's documents and this browser's voices all change while the window
  // is open, and a menu drawn once at boot would name yesterday's list.
  /** @type {NodeListOf<HTMLElement>} */ (bar.querySelectorAll("[data-lightroom-rows]")).forEach((wrapper) => {
    const popover = /** @type {HTMLElement | null} */ (wrapper.querySelector(".menu-submenu-popover"));
    if (!popover) return;
    const rows = lightroomMenuRows(wrapper.dataset.lightroomRows || "");
    const signature = rows.map((row) => `${row.action}|${row.label}|${row.checked ? 1 : 0}`).join("\n");
    if (popover.dataset.lightroomRowsSignature === signature) return;
    popover.dataset.lightroomRowsSignature = signature;
    popover.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "menu-section-label";
      empty.textContent = t("lightroom_rows_empty");
      popover.append(empty);
      return;
    }
    rows.forEach((row) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = row.action;
      button.textContent = row.label;
      button.classList.toggle("is-checked", row.checked === true);
      popover.append(button);
    });
    if (typeof invalidateMenuActionCache === "function") invalidateMenuActionCache();
  });
}

// Closing the darkroom hands the desk back to the writer's own draft. The
// subject, its read-only badge and its receipt all expire together — leaving
// any of them standing would describe a state the screen no longer shows.
function clearLightroomSubject() {
  if (!lightroomSubject) return;
  lightroomSubject = null;
  const status = document.getElementById("lightroom-status");
  if (status) status.textContent = "";
  renderLightroomSubject({ force: true });
  window.AISystem6WriteLease?.syncReadOnlySurface?.();
  if (typeof updateMenuState === "function") updateMenuState();
}

// The status line's right half is a receipt: it names only an operation that
// actually completed, with the clock time and, when a model was involved, its
// name — a checkable fact, never a promise. (不写没有发生的事。)
function noteLightroomReceipt(labelKey, { model = "" } = {}) {
  const status = document.getElementById("lightroom-status");
  if (!status) return;
  const stamp = new Date().toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  status.textContent = [t(labelKey), stamp, String(model || "").trim()].filter(Boolean).join(" · ");
}

// 文字亮室 opens beside the draft it develops, never instead of it, and it opens
// only once the darkroom record for that document is in hand — a window that
// showed an empty stack while its record was still loading would be lying.
// The lightroom's markup travels with the module that renders it. It was in
// index.html, so every boot paid 13,677 bytes for a window most sessions never
// open -- and openWindow already loads this module before it looks the window
// up, so nothing had to change on the entry path.
function installLightroomWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector?.('[data-window="lightroom"]')) return;
  // The loader puts the shell ahead of this file, so a browser always has it.
  // Contract tests execute this module against a stubbed document with no shell
  // and no desktop to build into; there is no window to install there, and a
  // throw at module scope would take the whole contract down with it.
  const shell = window.AISystem6ApplicationShell;
  if (!shell) return;
  shell.createWindow({
    windowName: "lightroom",
    windowClass: "lightroom-window",
    labelledBy: "lightroom-title",
    titleKey: "lightroom_title",
    title: "文字亮室",
    statusClass: "compact-status-bar lightroom-details",
    statusHtml: `          <span id="lightroom-subject" class="status-bar-leading"></span>
          <span id="lightroom-status" role="status" aria-live="polite" aria-atomic="true"></span>`,
    paneClass: "lightroom-pane",
    paneHtml: `
          <div class="lightroom-layout">
                  <div class="draft-desk-eli5-bar" data-quick-draft-eli5-bar hidden>
                    <label class="draft-desk-eli5-toggle">
                      <input type="checkbox" data-quick-draft-eli5-enabled />
                      <span data-i18n="quick_draft_eli5_enabled">Explain like a five-year-old</span>
                    </label>
                    <span class="select-wrap draft-desk-eli5-select" data-quick-draft-eli5-baseline-wrap hidden>
                      <select data-quick-draft-eli5-baseline-select data-i18n-aria-label="quick_draft_eli5_baseline">
                        <option value="secondary-school" data-i18n="quick_draft_eli5_baseline_general">General public</option>
                        <option value="some-familiarity" data-i18n="quick_draft_eli5_baseline_some">Knows a little</option>
                        <option value="familiar" data-i18n="quick_draft_eli5_baseline_familiar">Familiar with the topic</option>
                      </select>
                    </span>
                    <span class="draft-desk-eli5-actions" data-quick-draft-eli5-actions hidden>
                      <button class="btn mini-btn" type="button" data-quick-draft-eli5-review data-i18n="quick_draft_eli5_review">Find where it gets lost</button>
                      <button class="btn mini-btn" type="button" data-quick-draft-eli5-rewrite data-i18n="quick_draft_eli5_rewrite">Make it listenable</button>
                    </span>
                    <span class="draft-desk-eli5-candidate" data-quick-draft-eli5-candidate hidden>
                      <button class="btn mini-btn default" type="button" data-quick-draft-eli5-apply data-i18n="quick_draft_eli5_apply">Apply</button>
                      <button class="btn mini-btn" type="button" data-quick-draft-eli5-cancel data-i18n="quick_draft_eli5_cancel">Cancel</button>
                    </span>
                  </div>
            <div class="lightroom-view" id="lightroom-paper-view" role="tabpanel">
                    <div id="quick-draft-preview" class="teachtext-preview is-hidden"></div>
            </div>
              <aside id="quick-draft-adjustments-drawer" class="draft-desk-inspector" aria-labelledby="quick-draft-adjustments-title">
                <section class="draft-desk-inspector-section">
                  <div class="draft-desk-region-head">
                    <b id="quick-draft-adjustments-title" data-i18n="quick_draft_command_adjustment">Adjustment Layers</b>
                    <button class="btn mini-btn draft-desk-drawer-close" type="button" data-quick-draft-drawer-close="inspector" data-i18n="quick_draft_drawer_close" data-i18n-aria-label="quick_draft_close_adjustments">Close</button>
                  </div>
                  <span id="quick-draft-adjustment-strength-label" class="visually-hidden" data-i18n="quick_draft_adjustment_strength">Adjustment layer strength</span>
                  <div class="draft-desk-layer-stack">
                    <div class="draft-desk-layer" data-quick-draft-adjustment-layer="mingming" data-balloon-help="quick_draft_layer_mingming_desc">
                      <label class="draft-desk-layer-row">
                        <input type="checkbox" data-requires-write data-quick-draft-adjustment-enabled="mingming" checked />
                        <i data-quick-draft-layer-order="mingming" aria-hidden="true"></i>
                        <span id="quick-draft-layer-mingming-label" data-i18n="quick_draft_chip_mingming">Mingming's Eye</span>
                      </label>
                      <span class="select-wrap-inline"><select data-requires-write data-quick-draft-adjustment-strength="mingming" aria-labelledby="quick-draft-layer-mingming-label quick-draft-adjustment-strength-label"><option value="25" data-i18n="quick_draft_adjustment_light">Light</option><option value="50" selected data-i18n="quick_draft_adjustment_standard">Normal</option><option value="75" data-i18n="quick_draft_adjustment_heavy">Strong</option></select></span>
                      <button class="btn mini-btn draft-desk-layer-disclosure" type="button" data-quick-draft-layer-disclosure="mingming" aria-expanded="false" aria-controls="quick-draft-layer-detail" data-i18n-aria-label="quick_draft_scope_edit">▶</button>
                    </div>
                    <div class="draft-desk-layer" data-quick-draft-adjustment-layer="luoluo" data-balloon-help="quick_draft_layer_luoluo_desc">
                      <label class="draft-desk-layer-row"><input type="checkbox" data-requires-write data-quick-draft-adjustment-enabled="luoluo" checked /><i data-quick-draft-layer-order="luoluo" aria-hidden="true"></i><span id="quick-draft-layer-luoluo-label" data-i18n="quick_draft_chip_luoluo">Luoluo Receive</span></label>
                      <span class="select-wrap-inline"><select data-requires-write data-quick-draft-adjustment-strength="luoluo" aria-labelledby="quick-draft-layer-luoluo-label quick-draft-adjustment-strength-label"><option value="25" data-i18n="quick_draft_adjustment_light">Light</option><option value="50" selected data-i18n="quick_draft_adjustment_standard">Normal</option><option value="75" data-i18n="quick_draft_adjustment_heavy">Strong</option></select></span>
                      <button class="btn mini-btn draft-desk-layer-disclosure" type="button" data-quick-draft-layer-disclosure="luoluo" aria-expanded="false" aria-controls="quick-draft-layer-detail" data-i18n-aria-label="quick_draft_scope_edit">▶</button>
                    </div>
                    <div class="draft-desk-layer" data-quick-draft-adjustment-layer="hkrr" data-balloon-help="quick_draft_layer_hkrr_desc">
                      <label class="draft-desk-layer-row"><input type="checkbox" data-requires-write data-quick-draft-adjustment-enabled="hkrr" checked /><i data-quick-draft-layer-order="hkrr" aria-hidden="true"></i><span id="quick-draft-layer-hkrr-label" data-i18n="quick_draft_chip_hkrr">HKRR Lift</span></label>
                      <span class="select-wrap-inline"><select data-requires-write data-quick-draft-adjustment-strength="hkrr" aria-labelledby="quick-draft-layer-hkrr-label quick-draft-adjustment-strength-label"><option value="25" data-i18n="quick_draft_adjustment_light">Light</option><option value="50" selected data-i18n="quick_draft_adjustment_standard">Normal</option><option value="75" data-i18n="quick_draft_adjustment_heavy">Strong</option></select></span>
                      <button class="btn mini-btn draft-desk-layer-disclosure" type="button" data-quick-draft-layer-disclosure="hkrr" aria-expanded="false" aria-controls="quick-draft-layer-detail" data-i18n-aria-label="quick_draft_scope_edit">▶</button>
                    </div>
                    <div class="draft-desk-layer" data-quick-draft-adjustment-layer="density" data-balloon-help="quick_draft_layer_density_desc">
                      <label class="draft-desk-layer-row"><input type="checkbox" data-requires-write data-quick-draft-adjustment-enabled="density" checked /><i data-quick-draft-layer-order="density" aria-hidden="true"></i><span id="quick-draft-layer-density-label" data-i18n="quick_draft_adjustment_density">Density</span></label>
                      <span class="select-wrap-inline"><select data-requires-write data-quick-draft-adjustment-strength="density" aria-labelledby="quick-draft-layer-density-label quick-draft-adjustment-strength-label"><option value="25" data-i18n="quick_draft_adjustment_density_light">Less</option><option value="50" selected data-i18n="quick_draft_adjustment_density_standard">Normal</option><option value="75" data-i18n="quick_draft_adjustment_density_heavy">More</option></select></span>
                      <button class="btn mini-btn draft-desk-layer-disclosure" type="button" data-quick-draft-layer-disclosure="density" aria-expanded="false" aria-controls="quick-draft-layer-detail" data-i18n-aria-label="quick_draft_scope_edit">▶</button>
                    </div>
                  </div>
                  <div class="draft-desk-layer-scope-row">
                    <span data-quick-draft-active-layer-scope></span>
                    <button class="btn mini-btn" type="button" data-quick-draft-layer-toggle aria-expanded="false" aria-controls="quick-draft-layer-detail" data-i18n="quick_draft_scope_edit">Edit…</button>
                  </div>
                  <div class="draft-desk-layer-detail" id="quick-draft-layer-detail" hidden>
                    <p data-quick-draft-active-layer-description></p>
                    <div class="draft-desk-layer-edit-controls">
                      <input type="text" inputmode="text" data-quick-draft-active-layer-mask data-i18n-placeholder="quick_draft_adjustment_mask_placeholder" data-i18n-aria-label="quick_draft_adjustment_mask_aria" />
                      <button type="button" class="btn mini-btn" data-quick-draft-active-layer-scope-selection data-i18n="quick_draft_scope_selection">Sel</button>
                      <button type="button" class="btn mini-btn" data-quick-draft-active-layer-move data-direction="-1" data-i18n-aria-label="quick_draft_adjustment_move_up">▲</button>
                      <button type="button" class="btn mini-btn" data-quick-draft-active-layer-move data-direction="1" data-i18n-aria-label="quick_draft_adjustment_move_down">▼</button>
                    </div>
                  </div>
                  <div class="draft-desk-protect">
                    <b data-i18n="quick_draft_protected_label">Protection</b>
                    <div class="draft-desk-protect-summary">
                      <span data-quick-draft-protected-summary></span>
                      <button type="button" class="btn mini-btn" data-quick-draft-protect-toggle aria-expanded="false" aria-controls="quick-draft-protect-detail" data-i18n="quick_draft_protect_view">View</button>
                    </div>
                    <div class="draft-desk-protect-detail" id="quick-draft-protect-detail" hidden>
                      <input type="text" inputmode="text" data-quick-draft-protected-ranges data-i18n-placeholder="quick_draft_protected_placeholder" data-i18n-aria-label="quick_draft_protected_aria" />
                    </div>
                    <button type="button" class="btn mini-btn" data-requires-write data-quick-draft-protect-selection data-i18n="quick_draft_protect_selection" data-balloon-help="balloon_qd_protect">Protect Selection</button>
                  </div>
                  <div class="draft-desk-mobile-inspector-actions">
                    <button type="button" class="btn mini-btn" data-quick-draft-adjustment-apply data-i18n="quick_draft_preview_adjustments">Preview</button>
                    <button type="button" class="btn mini-btn default" data-requires-write data-quick-draft-adjustment-develop data-i18n="quick_draft_develop" data-balloon-help="balloon_qd_develop">Develop</button>
                  </div>
                </section>
                <section class="draft-desk-inspector-section draft-desk-versions-section" data-balloon-help="balloon_qd_versions">
                  <div class="draft-desk-region-head"><b data-i18n="quick_draft_versions">Versions</b></div>
                  <div id="quick-draft-versions-list" class="draft-desk-versions-list"></div>
                </section>
              </aside>
          </div>
          <footer class="lightroom-actions">
              <!-- Real segmented control (.view-switch / .view-switch-option --
                   the same part ClioStage's and Time Machine's view rows use),
                   here in its tab-strip ARIA pattern: three real panels, one
                   selected. The row used to be three loose .btn.mini-btn. -->
              <span class="view-switch draft-desk-display-switch" role="tablist" data-i18n-aria-label="quick_draft_view_label">
                <button class="view-switch-option" type="button" role="tab" id="quick-draft-toggle-grain" data-quick-draft-display="grain" aria-controls="lightroom-paper-view" aria-selected="false" data-i18n="quick_draft_grain" data-balloon-help="quick_draft_grain_balloon">Grain</button>
                <button class="view-switch-option is-active" type="button" role="tab" id="quick-draft-toggle-composite" data-quick-draft-display="read" aria-controls="lightroom-paper-view" aria-selected="true" data-i18n="quick_draft_composite" data-balloon-help="quick_draft_composite_balloon">Read</button>
                <button class="view-switch-option" type="button" role="tab" id="quick-draft-toggle-listen" data-quick-draft-display="listen" aria-controls="lightroom-paper-view" aria-selected="false" data-i18n="quick_draft_listen" data-balloon-help="quick_draft_listen_balloon">Listen</button>
              </span>
              <span class="draft-desk-action-gap"></span>
              <button class="btn default" id="quick-draft-display-body" type="button" data-quick-draft-display="body" data-i18n="lightroom_back_to_draft" data-balloon-help="balloon_lightroom_back">Back to the Draft</button>
          </footer>`,
  });
}

installLightroomWindow();

async function openLightroomWindow() {
  await ensureDarkroomReady();
  refs.lightroom = getWindow("lightroom") || refs.lightroom;
  await openWindow("lightroom", { skipQuickDraftEntrypoint: true });
  renderLightroomSubject({ force: true });
  renderQuickDraft(activeProjectQuickDraft({ create: false })?.record);
}

/**
 * Is this title one the product wrote, rather than one the writer chose?
 *
 * "An empty stored title means it was derived" was the obvious test and it is
 * WRONG: the derived default is persisted, so a fresh draft stores the literal
 * string "Quick Draft" and reads back looking exactly like a writer's choice.
 * Measured in a browser — the guard built on that assumption never fired once.
 *
 * So compare against the default in every language that is loaded. When no
 * table can answer, the answer is "not default", which is the safe direction:
 * a title we cannot prove we wrote is never overwritten.
 */
function isDerivedQuickDraftTitle(title) {
  const value = String(title || "").trim();
  if (!value) return true;
  const tables = (typeof translations !== "undefined" && translations)
    || window.AISystem6Data?.translations
    || {};
  return Object.keys(tables).some((language) => {
    const entry = tables[language]?.quick_draft_title;
    const resolved = typeof entry === "function" ? entry() : entry;
    return String(resolved || "").trim() === value;
  });
}

// Re-render hook for applyLanguage. The subject is painted from a record rather
// than from data-i18n, so nothing in applyLanguage reached it and switching
// language with the window open left the previous language's word on screen
// until it was closed and reopened.
//
// Opening the window writes the label whatever it says; a language switch only
// redraws one the product itself wrote.
function renderLightroomSubject({ force = false } = {}) {
  const subject = document.getElementById("lightroom-subject");
  if (!subject) return;
  // A developed subject names itself, with the read-only badge beside the
  // name. The draft's title must never overwrite it — that is how the status
  // bar came to claim one document while the views showed another.
  if (lightroomSubject) {
    subject.textContent = [String(lightroomSubject.name || ""), t("lightroom_read_only_badge")]
      .filter(Boolean).join(" · ");
    return;
  }
  const record = activeProjectQuickDraft({ create: false })?.record;
  const workspace = normalizeQuickDraftRecord(record).workspace;
  // A derived title is RECOMPUTED, never re-read. The stored copy is the
  // default frozen in whatever language it was first written in, and
  // normalizeQuickDraftRecord hands that frozen string straight back — so
  // re-rendering from it repaints the old language, which is the bug wearing a
  // different hat. Measured: the guard alone was not enough.
  if (isDerivedQuickDraftTitle(record?.workspace?.title)) {
    subject.textContent = typeof titleFromBody === "function"
      ? String(titleFromBody(workspace.body) || "")
      : String(workspace.title || "");
    return;
  }
  // The writer's own title. Written when the window opens, never overwritten
  // by a language switch.
  if (force) subject.textContent = String(workspace.title || "");
}

function closeLightroomWindow() {
  if (typeof closeWindow === "function") closeWindow("lightroom");
  else getWindow("lightroom")?.classList.add("is-hidden");
}

function quickDraftScope() {
  return [refs.form, refs.lightroom].filter(Boolean);
}

function quickDraftQuery(selector = "") {
  for (const root of quickDraftScope()) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}

function quickDraftQueryAll(selector = "") {
  const out = [];
  for (const root of quickDraftScope()) out.push(...root.querySelectorAll(selector));
  return out;
}

function quickDraftPhase(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftRecord(record).workspace;
  const darkroom = darkroomOf(record);
  const drafted = Boolean(
    String(refs.draft?.value || workspace.body || "").trim()
    || darkroom.negativeUpdatedAt
    || darkroom.composite
    || quickDraftLastComposite
    || darkroom.versions.length
  );
  return drafted ? "editor" : "intake";
}

function applyQuickDraftPaperSurface() {
  const next = quickDraftPhase();
  refs.form?.classList.toggle("is-empty-draft", next === "intake");
  getWindow("quickDraft")?.classList.toggle("is-quick-draft-empty", next === "intake");
  if (refs.intakeWell) refs.intakeWell.hidden = next !== "intake";
  if (refs.bodySurface) refs.bodySurface.hidden = next !== "editor";
  // The darkroom is worth nothing until a draft exists, so it must not stand
  // between the writer and the first one. Before there is a body it is not
  // dimmed or disabled — it is not there, and a new writer's first screen is
  // the material and one action rather than four adjustment layers they cannot
  // use yet.
  const inspector = document.getElementById("quick-draft-adjustments-drawer");
  if (inspector) inspector.hidden = next !== "editor";
  const drawerSwitch = quickDraftQuery(".draft-desk-drawer-switch");
  if (drawerSwitch) drawerSwitch.hidden = next !== "editor";
  if (next === "intake") closeQuickDraftDrawer({ restoreFocus: false });
  const record = activeProjectQuickDraft({ create: false })?.record;
  const hasBody = Boolean(String(refs.draft?.value || record?.workspace?.body || "").trim());
  syncQuickDraftControlAvailability(hasBody);
  syncQuickDraftPrimaryAction(record, hasBody);
  return next;
}

function syncQuickDraftPaperFromState() {
  applyQuickDraftPaperSurface();
}

// Secondary controls are disabled, never removed: the position of a key is
// part of the layout, and a disabled key can say why it is off in Balloon Help.
function syncQuickDraftControlAvailability(hasBody) {
  // 文字亮室 reads an existing draft, so the route into it is off until there
  // is one — disabled, never removed, so its place in the row stays put.
  document.querySelectorAll('.draft-desk-actions [data-action="open-lightroom"]').forEach((element) => {
    const button = /** @type {HTMLButtonElement} */ (element);
    button.disabled = !hasBody;
    if (!button.dataset.balloonHelpDisabled) button.dataset.balloonHelpDisabled = "quick_draft_needs_body";
  });
  // All three views are first-class in 文字亮室, never an advanced reveal:
  // always on the tab strip, disabled until there is a body to read.
  document.querySelectorAll('[data-quick-draft-display="grain"], [data-quick-draft-display="read"], [data-quick-draft-display="listen"]').forEach((element) => {
    const button = /** @type {HTMLButtonElement} */ (element);
    button.disabled = !hasBody;
    if (!button.dataset.balloonHelpDisabled) button.dataset.balloonHelpDisabled = "quick_draft_needs_body";
  });
  document.querySelectorAll('[data-quick-draft-drawer="inspector"]').forEach((element) => {
    const button = /** @type {HTMLButtonElement} */ (element);
    button.hidden = !hasBody;
    button.disabled = !hasBody;
    if (!button.dataset.balloonHelpDisabled) button.dataset.balloonHelpDisabled = "quick_draft_needs_body";
  });
  if (refs.tools) {
    refs.tools.classList.remove("is-disabled");
    refs.tools.querySelector("summary")?.setAttribute("aria-disabled", "false");
  }
  [refs.deliverMenu].forEach((menu) => {
    if (!menu) return;
    menu.classList.toggle("is-disabled", !hasBody);
    const summary = menu.querySelector("summary");
    if (summary) {
      summary.setAttribute("aria-disabled", hasBody ? "false" : "true");
      summary.dataset.balloonHelpDisabled = "quick_draft_needs_body";
    }
    if (!hasBody) menu.open = false;
  });
  if (!hasBody && refs.form?.classList.contains("is-inspector-open")) {
    closeQuickDraftDrawer({ restoreFocus: false });
  }
  const displayGroup = quickDraftQuery('.draft-desk-display-switch[role="tablist"]');
  if (displayGroup && typeof syncRovingTabStops === "function") syncRovingTabStops(displayGroup);
}

function syncQuickDraftPrimaryAction(record = activeProjectQuickDraft({ create: false })?.record, hasBody = false) {
  if (!refs.saveButton) return "draft";
  const action = hasBody ? "continue" : "draft";
  const key = hasBody ? "quick_draft_continue_writing" : "quick_draft_start_writing";
  refs.saveButton.dataset.quickDraftPrimaryAction = action;
  refs.saveButton.dataset.i18n = key;
  // Through the idle-label helper: a render can land while the button is
  // busy, and a bare textContent write prints under the busy overlay.
  if (typeof setControlIdleLabel === "function") setControlIdleLabel(refs.saveButton, t(key));
  else refs.saveButton.textContent = t(key);
  return action;
}

// The details bar reports and never sets: what is protected, and what the
// adjustment stack still owes the body.
function updateQuickDraftShellState(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftRecord(record).workspace;
  if (refs.protectState) {
    const lines = (darkroomOf(record).protectedRanges || [])
      .reduce((total, range) => total + Math.max(0, (range.end - range.start) + 1), 0);
    refs.protectState.textContent = lines ? t("quick_draft_protect_state", lines) : "";
  }
  if (refs.stackState) {
    const enabled = (darkroomOf(record).adjustmentLayers || []).filter((layer) => layer.enabled).length;
    refs.stackState.textContent = enabled ? t("quick_draft_stack_state", enabled) : "";
  }
}

function syncQuickDraftEli5Ui(source = null) {
  const record = source || normalizeQuickDraftRecord(activeProjectQuickDraft({ create: false })?.record);
  const hasBody = Boolean(String(record.workspace?.body || "").trim());
  const lens = window.AISystem6ExplanationLens?.normalizeExplanationLens?.(
    record.workspace?.intake?.setup?.explanationLens
  ) || window.AISystem6ExplanationLens?.blankExplanationLens?.() || {
    enabled: false,
    baselineKnowledge: "secondary-school",
  };
  if (refs.eli5Bar) refs.eli5Bar.hidden = !hasBody;
  if (refs.eli5Enabled) refs.eli5Enabled.checked = lens.enabled === true;
  if (refs.eli5Baseline) refs.eli5Baseline.value = lens.baselineKnowledge || "secondary-school";
  if (refs.eli5BaselineWrap) refs.eli5BaselineWrap.hidden = lens.enabled !== true;
  if (refs.eli5Actions) refs.eli5Actions.hidden = lens.enabled !== true;
  if (refs.eli5Candidate) refs.eli5Candidate.hidden = true;
}

async function updateQuickDraftEli5Lens(nextLens = {}) {
  const slot = activeProjectQuickDraft({ create: false });
  if (!slot) return false;
  const previous = normalizeQuickDraftRecord(slot.record);
  const current = previous.workspace.intake.setup.explanationLens || {};
  const lens = window.AISystem6ExplanationLens?.normalizeExplanationLens?.({
    ...current,
    ...nextLens,
  }) || { ...current, ...nextLens };
  const committed = await commitQuickDraft({
    workspace: { intake: { setup: { explanationLens: lens } } },
  }, { captureForm: false });
  if (!committed.ok) {
    renderQuickDraft(previous);
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  syncQuickDraftEli5Ui(committed.record);
  return true;
}

function setBusy(isBusy) {
  refs.form?.classList.toggle("is-busy", !!isBusy);
  refs.form?.setAttribute("aria-busy", String(!!isBusy));
  refs.intakeWell?.classList.toggle("is-working", !!isBusy);
  refs.bodySurface?.classList.toggle("is-working", !!isBusy);
  const controls = new Set([
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
    ...(quickDraftQueryAll([
      "[data-quick-draft-adjustment-apply]",
      "[data-quick-draft-adjustment-develop]",
      "[data-quick-draft-chat-action]",
      "[data-quick-draft-eli5-rewrite]",
      "[data-quick-draft-eli5-review]",
      "[data-quick-draft-eli5-apply]",
      "[data-quick-draft-eli5-cancel]",
      // The listen transport is deliberately absent: pausing the audio must
      // stay available while a model call runs.
      "[data-quick-draft-finding-jump]",
      "[data-quick-draft-finding-fix]",
      "[data-quick-draft-finding-keep]",
      "[data-quick-draft-finding-praise]",
      "[data-quick-draft-spoken-adopt]",
      "[data-quick-draft-fix-adopt]",
      "[data-quick-draft-fix-edit]",
      "[data-quick-draft-fix-keep]",
      '[data-action="quick-draft-import-chat"]',
      "[data-quick-draft-delivery]",
    ].join(", ")) || []),
  ]);
  controls.forEach((button) => {
    if (!button) return;
    if (typeof setControlLoading === "function") {
      setControlLoading(button, !!isBusy, t("quick_draft_working"));
      return;
    }
    if (isBusy) {
      button.dataset.quickDraftWasDisabled = String(button.disabled);
      button.disabled = true;
    } else {
      button.disabled = button.dataset.quickDraftWasDisabled === "true";
      delete button.dataset.quickDraftWasDisabled;
    }
  });
  if (!isBusy) {
    const bodyReady = Boolean(String(refs.draft?.value || "").trim());
    syncQuickDraftControlAvailability(bodyReady);
    syncQuickDraftAiAvailability();
  }
}

function setQuickDraftDrawer(drawer = "", { restoreFocus = false } = {}) {
  if (!refs.form) return "";
  const next = drawer === "inspector" || drawer === "shelf" ? drawer : "";
  const trigger = next
    ? quickDraftQuery(`[data-quick-draft-drawer="${next}"]`)
    : quickDraftDrawerTrigger;
  if (next) quickDraftDrawerTrigger = trigger || document.activeElement;
  refs.form.classList.toggle("is-shelf-open", next === "shelf");
  refs.form.classList.toggle("is-inspector-open", next === "inspector");
  syncQuickDraftDrawerButtons();
  syncQuickDraftLayerDetailPlacement();
  if (next) {
    const panel = document.getElementById(
      next === "shelf" ? "quick-draft-materials-drawer" : "quick-draft-adjustments-drawer"
    );
    const closeButton = /** @type {HTMLElement | null} */ (panel?.querySelector("[data-quick-draft-drawer-close]") || null);
    if (closeButton?.offsetParent) {
      requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
    }
  }
  if (!next) {
    quickDraftDrawerTrigger = null;
    if (restoreFocus && trigger?.isConnected && !trigger.disabled) {
      requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
  }
  return next;
}

function closeQuickDraftDrawer(options = {}) {
  return setQuickDraftDrawer("", options);
}

function quickDraftUsesDrawerLayout() {
  const compactOnlyControl = quickDraftQuery(".draft-desk-drawer-close");
  return Boolean(compactOnlyControl && getComputedStyle(compactOnlyControl).display !== "none");
}

// Whether "panel" has anything to show. The materials shelf answers about
// the live draft alone — there is nothing to shelve before a draft exists.
// The inspector also answers for a document 文字亮室 is developing that is
// not the live draft: that subject's own text decides, not the live paper's
// empty state (is-empty-draft tracks the live form only, and never learns
// about a subject). lightroomCommandAvailable's isAvailable check and the
// toggle below both read this SAME function, so "Show Adjustments" cannot
// light up on one condition and refuse on another again.
function quickDraftPanelActionable(panel = "shelf") {
  if (!refs.form) return false;
  if (panel === "inspector" && lightroomSubject) {
    return Boolean(String(lightroomBodyText() || "").trim());
  }
  return !refs.form.classList.contains("is-empty-draft");
}

function quickDraftPanelVisible(panel = "shelf") {
  const target = panel === "inspector" ? "inspector" : "shelf";
  if (!quickDraftPanelActionable(target)) return false;
  if (quickDraftUsesDrawerLayout()) {
    return refs.form.classList.contains(target === "inspector" ? "is-inspector-open" : "is-shelf-open");
  }
  return !refs.form.classList.contains(target === "inspector" ? "is-inspector-hidden" : "is-shelf-hidden");
}

function toggleQuickDraftPanel(panel = "shelf") {
  const target = panel === "inspector" ? "inspector" : "shelf";
  if (!quickDraftPanelActionable(target)) return false;
  const hiddenClass = target === "inspector" ? "is-inspector-hidden" : "is-shelf-hidden";
  if (quickDraftUsesDrawerLayout()) {
    refs.form.classList.remove(hiddenClass);
    const open = quickDraftPanelVisible(target);
    setQuickDraftDrawer(open ? "" : target, { restoreFocus: open });
  } else {
    closeQuickDraftDrawer({ restoreFocus: false });
    refs.form.classList.toggle(hiddenClass);
  }
  if (typeof updateMenuState === "function") updateMenuState();
  return quickDraftPanelVisible(target);
}

function focusQuickDraftPaper() {
  const target = quickDraftPhase() === "intake"
    ? refs.say
    : !refs.draft?.classList.contains("is-hidden")
      ? refs.draft
      : quickDraftQuery('[data-quick-draft-display][aria-selected="true"]');
  target?.focus({ preventScroll: true });
}

// ---- Render orchestration -------------------------------------------------
function renderQuickDraft(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
  collectRefs();
  if (!refs.form) return;
  const hasProject = Boolean(activeProjectQuickDraft({ create: false }));
  if (refs.noProject) refs.noProject.hidden = hasProject;
  if (refs.workspace) refs.workspace.hidden = !hasProject;
  if (refs.footer) refs.footer.hidden = !hasProject;
  if (!hasProject) {
    setSaveState("new");
    setQuickDraftStatus(t("quick_draft_project_required"), { live: false });
    return;
  }
  const source = normalizeQuickDraftRecord(record);
  if (refs.shareButton) refs.shareButton.hidden = typeof navigator.share !== "function";
  refs.titleInput.value = source.workspace.title || titleFromBody(source.workspace.body);
  if (refs.thesis) refs.thesis.value = source.thesis;
  if (refs.say) refs.say.value = source.workspace.body || "";
  if (refs.sources) refs.sources.value = source.pastedSources;
  refs.format.value = String(source.workspace.body || "").trim()
    ? source.targetFormat
    : BILI_DYNAMIC_FORMAT;
  refs.duration.value = source.targetDuration;
  if (refs.firstDaySubject) refs.firstDaySubject.value = source.firstDaySubject || source.workspace.title || "";
  if (refs.handsOn) refs.handsOn.value = source.handsOnNotes;
  if (refs.officialMaterials) refs.officialMaterials.value = source.officialMaterials;
  if (refs.draft) refs.draft.value = source.workspace.body;
  syncQuickDraftTemplateUi();
  syncQuickDraftEli5Ui(source);
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
  const hasBody = Boolean(String(refs.draft?.value || source.workspace.body || "").trim());
  setSaveState(hasBody ? source.workspace.savedStatus : "new");
  // The save state has its own field in the details bar, so the status line
  // reports the last command instead of repeating it.
  const modelName = quickDraftConnectedModelName();
  setQuickDraftStatus(!hasBody && modelName
    ? t("quick_draft_model_status", modelName)
    : t("quick_draft_ready"), { live: false });
  refreshQuickDraftSelectControls();
  renderAdjustmentLayers(source);
  renderProtectedRangeControls(source);
  renderQuickDraftVersions(source);
  syncQuickDraftPaperFromState();
  updateQuickDraftShellState(source);
  syncQuickDraftControlAvailability(hasBody);
  syncQuickDraftPrimaryAction(source, hasBody);
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
  if (refs.addMaterialMenu) refs.addMaterialMenu.open = false;
  if (refs.tools) refs.tools.open = false;
  if (refs.deliverMenu) refs.deliverMenu.open = false;
}

function isAdjustmentLayerControl(target) {
  const node = target && typeof target.closest === "function" ? target : null;
  return Boolean(
    node?.closest?.("[data-quick-draft-adjustment-enabled]")
    || node?.closest?.("[data-quick-draft-adjustment-strength]")
    || node?.closest?.("[data-quick-draft-active-layer-mask]")
    || node?.closest?.("[data-quick-draft-protected-ranges]")
  );
}

function bind() {
  if (bound) return;
  collectRefs();
  if (!refs.form) return;
  bound = true;
  attachQuickDraftMarkdownEditor();
  observeQuickDraftLayerLayout();

  ["input", "change"].forEach((eventName) => {
    refs.form.addEventListener(eventName, (event) => {
      if (eventName === "change" && isAdjustmentLayerControl(event.target)) return;
      syncQuickDraftTemplateUi();
      updateDraftStats();
      updateSourceCount();
      const titlePatch = event.target === refs.titleInput
        ? { workspace: { title: String(refs.titleInput.value || "").trim(), titleMode: refs.titleInput.value.trim() ? "manual" : "auto" } }
        : {};
      const record = saveQuickDraft(titlePatch);
      renderDecisionStatuses(record);
      if (event.target === refs.sources) renderSourceMap(record, sourceRecordsFromForm());
      const bodyReady = Boolean(String(refs.draft?.value || "").trim());
      syncQuickDraftPrimaryAction(record, bodyReady);
      syncQuickDraftAiAvailability();
      if (typeof updateMenuState === "function") updateMenuState();
    });
  });
  refs.form.addEventListener("change", async (event) => {
    const enabledToggle = event.target?.closest?.("[data-quick-draft-adjustment-enabled]");
    if (enabledToggle) {
      const kind = enabledToggle.dataset.quickDraftAdjustmentEnabled;
      const enabled = enabledToggle.checked;
      quickDraftActiveLayerKind = kind;
      await updateAdjustmentLayer(kind, { enabled });
      const bodyReady = Boolean(String(refs.draft?.value || "").trim());
      syncQuickDraftPrimaryAction(activeProjectQuickDraft({ create: false })?.record, bodyReady);
      return;
    }
    const strengthSelect = event.target?.closest?.("[data-quick-draft-adjustment-strength]");
    if (strengthSelect) {
      const kind = strengthSelect.dataset.quickDraftAdjustmentStrength;
      const strength = Number(strengthSelect.value) || ADJUSTMENT_DEFAULT_STRENGTH;
      quickDraftActiveLayerKind = kind;
      await updateAdjustmentLayer(kind, { strength });
      return;
    }
    const maskInput = event.target?.closest?.("[data-quick-draft-active-layer-mask]");
    if (maskInput) {
      await updateAdjustmentLayer(quickDraftActiveLayerKind, { mask: maskInput.value });
      return;
    }
    const protectedInput = event.target?.closest?.("[data-quick-draft-protected-ranges]");
    if (protectedInput) {
      const next = normalizeAdjustmentLayerMask(protectedInput.value);
      const previousRecord = activeProjectQuickDraft({ create: false })?.record;
      const committed = await commitQuickDraft({ workspace: { protectedRanges: next } });
      if (!committed.ok) {
        renderQuickDraft(previousRecord);
        setQuickDraftStatus(t("quick_draft_save_failed"));
        return;
      }
      const record = committed.record;
      renderProtectedRangeControls(record);
      updateQuickDraftShellState(record);
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
  refs.eli5Enabled?.addEventListener("change", () => {
    void updateQuickDraftEli5Lens({ enabled: refs.eli5Enabled.checked === true });
  });
  refs.eli5Baseline?.addEventListener("change", () => {
    void updateQuickDraftEli5Lens({ baselineKnowledge: refs.eli5Baseline.value });
  });
  quickDraftQuery("[data-quick-draft-eli5-rewrite]")?.addEventListener("click", async () => {
    closeQuickDraftMenus();
    await window.AISystem6QuickDraftAI.requestEli5Rewrite();
  });
  quickDraftQuery("[data-quick-draft-eli5-review]")?.addEventListener("click", async () => {
    closeQuickDraftMenus();
    await window.AISystem6QuickDraftAI.requestEli5Review();
  });
  quickDraftQuery("[data-quick-draft-eli5-apply]")?.addEventListener("click", async () => {
    await window.AISystem6QuickDraftAI.applyQuickDraftEli5Rewrite();
  });
  quickDraftQuery("[data-quick-draft-eli5-cancel]")?.addEventListener("click", async () => {
    await window.AISystem6QuickDraftAI.cancelQuickDraftEli5Rewrite();
  });
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
  document.querySelector("[data-quick-draft-create-project]")?.addEventListener("click", async () => {
    await createDefaultProjectForDraftDesk();
    renderQuickDraft();
    requestAnimationFrame(focusQuickDraftPaper);
  });
  document.querySelector("[data-quick-draft-open-projects]")?.addEventListener("click", async () => {
    await openWindow("projects");
  });
  refs.saveButton?.addEventListener("click", () => {
    const action = refs.saveButton.dataset.quickDraftPrimaryAction || "draft";
    if (action === "develop") {
      const ready = currentCompositeState(activeProjectQuickDraft({ create: false })?.record).ready;
      if (ready) developAdjustmentLayers();
      else void applyAdjustmentLayers().then((applied) => applied && developAdjustmentLayers());
      return;
    }
    if (action === "deliver") {
      if (refs.deliverMenu) refs.deliverMenu.open = true;
      refs.deliverMenu?.querySelector("summary")?.focus();
      return;
    }
    if (action === "continue") {
      promoteWellTextToBody();
      applyQuickDraftPaperSurface();
      requestAnimationFrame(focusQuickDraftPaper);
      return;
    }
    promoteWellTextToBody();
    applyQuickDraftPaperSurface();
    startWritingNow();
  });
  refs.saveProjectDocButton?.addEventListener("click", async () => { await saveQuickDraftAsProjectDocument(); });
  refs.sendTeachTextButton?.addEventListener("click", async () => { await transferQuickDraftToTeachText(); });
  refs.sendReviewButton?.addEventListener("click", async () => { await sendQuickDraftToReviewDesk(); });
  refs.switchMultiFinderButton?.addEventListener("click", async () => { await switchToMultiFinder(); });
  refs.useMountedButton?.addEventListener("click", async () => {
    closeQuickDraftMenus();
    await useMountedSources();
  });
  refs.collectVentButton?.addEventListener("click", async () => { await collectVentOutline(); });
  refs.importChatButton?.addEventListener("click", async () => { await importChatScreenshots(); });
  refs.adoptImpressionButton?.addEventListener("click", async () => { await adoptFirstImpression(); });
  refs.confirmHandsOnButton?.addEventListener("click", async () => { await confirmHandsOnFromAnnotations(); });
  refs.startWritingButton?.addEventListener("click", async () => { await startWritingNow(); });
  refs.restoreDumpButton?.addEventListener("click", restoreDumpToBody);
  // Body / Grain / Read are three exclusive tabs over one paper region, and
  // the article view is simply "no preview open".
  refs.displayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.quickDraftDisplay || "body";
      setQuickDraftDisplayMode(mode);
    });
  });
  document.querySelectorAll("[data-quick-draft-drawer]").forEach((element) => {
    const button = /** @type {HTMLElement} */ (element);
    button.addEventListener("click", () => {
      const drawer = button.dataset.quickDraftDrawer === "inspector" ? "inspector" : "shelf";
      const className = drawer === "inspector" ? "is-inspector-open" : "is-shelf-open";
      const open = !refs.form?.classList.contains(className);
      setQuickDraftDrawer(open ? drawer : "", { restoreFocus: !open });
    });
  });
  document.querySelectorAll("[data-quick-draft-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeQuickDraftDrawer({ restoreFocus: true });
    });
  });
  // The strip of paper a drawer never covers is the easiest way back.
  document.querySelector(".draft-desk-paper")?.addEventListener("click", (event) => {
    const open = refs.form?.classList.contains("is-shelf-open") || refs.form?.classList.contains("is-inspector-open");
    if (!open) return;
    event.preventDefault();
    closeQuickDraftDrawer({ restoreFocus: false });
    requestAnimationFrame(focusQuickDraftPaper);
  });
  document.querySelector("[data-quick-draft-paste]")?.addEventListener("click", async () => {
    closeQuickDraftMenus();
    refs.sources?.focus();
    if (typeof runEditCommand === "function") await runEditCommand("paste");
  });
  document.querySelector("[data-quick-draft-to-start]")?.addEventListener("click", () => {
    closeQuickDraftDrawer({ restoreFocus: false });
    // No forcing the paper back: which paper is on screen follows the work now,
    // and a draft with a body is past the intake well. This takes the writer to
    // the material, which is where they were going.
    requestAnimationFrame(() => refs.sources?.focus({ preventScroll: true }));
  });
  const commandMenus = [refs.addMaterialMenu, refs.tools, refs.deliverMenu].filter(Boolean);
  commandMenus.forEach((menu) => {
    const summary = menu?.querySelector("summary");
    if (!menu || !summary) return;
    menu.querySelectorAll(".draft-desk-command-popover button").forEach((button) => {
      button.setAttribute("role", "menuitem");
    });
    const blockDisabledMenu = (event) => {
      if (summary.getAttribute("aria-disabled") !== "true") return;
      event.preventDefault();
      menu.open = false;
      setQuickDraftStatus(t("quick_draft_needs_body"));
    };
    summary.addEventListener("click", blockDisabledMenu);
    summary.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") blockDisabledMenu(event);
    });
    menu.addEventListener("toggle", () => {
      if (summary.getAttribute("aria-disabled") === "true") {
        menu.open = false;
      } else if (menu.open) {
        commandMenus.forEach((other) => {
          if (other !== menu) other.open = false;
        });
        const popover = menu.querySelector(".draft-desk-command-popover");
        if (popover) popover.scrollTop = 0;
      }
      summary.setAttribute("aria-expanded", String(menu.open));
    });
  });
  document.addEventListener("pointerdown", (event) => {
    const target = /** @type {Element | null} */ (event.target);
    if (!target?.closest(".draft-desk-command-menu")) closeQuickDraftMenus();
  });
  refs.form.addEventListener("click", async (event) => {
    const layerDisclosure = event.target.closest("[data-quick-draft-layer-disclosure]");
    if (layerDisclosure) {
      toggleQuickDraftLayerDisclosure(layerDisclosure.dataset.quickDraftLayerDisclosure || "");
      return;
    }
    const materialRow = event.target.closest("[data-quick-draft-source-id]");
    if (materialRow) {
      selectQuickDraftMaterial(materialRow.dataset.quickDraftSourceId || "");
      return;
    }
    const layerRow = event.target.closest("[data-quick-draft-adjustment-layer]");
    if (layerRow && !event.target.closest("input, select, button")) {
      selectQuickDraftAdjustmentLayer(layerRow.dataset.quickDraftAdjustmentLayer || "");
      return;
    }
    const stanceChip = event.target.closest("[data-quick-draft-stance-index]");
    if (stanceChip) {
      await adoptFirstImpression(Number(stanceChip.dataset.quickDraftStanceIndex));
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
      if (action === "teachtext") await transferQuickDraftToTeachText();
      if (action === "copy-markdown") await copyQuickDraftMarkdown();
      if (action === "export-markdown") await exportQuickDraftMarkdown();
      if (action === "share-markdown") await shareQuickDraftMarkdown();
      if (action === "export-srt") await window.AISystem6QuickDraftListen?.exportSrt?.();
      if (action === "export-shot-list") await window.AISystem6QuickDraftListen?.exportShotList?.();
      return;
    }
    const grainZoom = event.target.closest("[data-quick-draft-grain-zoom]");
    if (grainZoom) {
      setQuickDraftGrainZoom(grainZoom.dataset.quickDraftGrainZoom || "grain");
      return;
    }
    const layerToggle = event.target.closest("[data-quick-draft-layer-toggle]");
    if (layerToggle) {
      toggleQuickDraftLayerDetail();
      return;
    }
    const protectToggle = event.target.closest("[data-quick-draft-protect-toggle]");
    if (protectToggle) {
      const detail = document.getElementById("quick-draft-protect-detail");
      if (detail) {
        const open = detail.hidden;
        detail.hidden = !open;
        protectToggle.setAttribute("aria-expanded", open ? "true" : "false");
      }
      return;
    }
    const versionButton = event.target.closest("[data-quick-draft-version]");
    if (versionButton) {
      await restoreQuickDraftVersion(
        versionButton.dataset.quickDraftVersion || "",
        versionButton.dataset.quickDraftVersionKind || "version"
      );
      return;
    }
    const move = event.target.closest("[data-quick-draft-active-layer-move]");
    if (move) {
      await moveAdjustmentLayer(quickDraftActiveLayerKind, Number(move.dataset.direction) || -1);
      return;
    }
    const protectSelection = event.target.closest("[data-quick-draft-protect-selection]");
    if (protectSelection) {
      closeQuickDraftMenus();
      await protectSelectionFromTextarea();
      return;
    }
    const scopeButton = event.target.closest("[data-quick-draft-active-layer-scope-selection]");
    if (scopeButton) {
      await scopeSelectionToLayer(quickDraftActiveLayerKind);
      return;
    }
    const applyButton = event.target.closest("[data-quick-draft-adjustment-apply]");
    if (applyButton) {
      closeQuickDraftMenus();
      await applyAdjustmentLayers();
      return;
    }
    const developButton = event.target.closest("[data-quick-draft-adjustment-develop]");
    if (developButton) {
      closeQuickDraftMenus();
      await developAdjustmentLayers();
      return;
    }
    const quickDraftAction = event.target.closest("[data-quick-draft-chat-action]");
    if (quickDraftAction) {
      closeQuickDraftMenus();
      await runClioTalkAction(quickDraftAction.dataset.quickDraftChatAction || "", { announceUser: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    const quickDraftWindow = getWindow("quickDraft");
    const quickDraftActive = Boolean(
      quickDraftWindow
      && quickDraftWindow.classList.contains("is-active")
      && !quickDraftWindow.classList.contains("is-hidden")
      && !quickDraftWindow.classList.contains("is-app-hidden")
    );
    if (!quickDraftActive) return;
    const target = /** @type {HTMLElement | null} */ (event.target);
    const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
    const drawerOpen = refs.form?.classList.contains("is-shelf-open") || refs.form?.classList.contains("is-inspector-open");
    if (event.key === "Escape" && drawerOpen) {
      event.preventDefault();
      closeQuickDraftDrawer({ restoreFocus: true });
      return;
    }
    if (event.key === "Escape" && quickDraftDisplayMode !== "body") {
      event.preventDefault();
      leaveQuickDraftPreview();
      return;
    }
    if ((event.key === "v" || event.key === "V") && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      toggleQuickDraftComposite();
    }
  });
}

function captureWorkingSession() {
  const drawer = refs.form?.classList.contains("is-shelf-open")
    ? "shelf"
    : refs.form?.classList.contains("is-inspector-open") ? "inspector" : "";
  return {
    projectId: activeProjectId,
    paperSurface: quickDraftPhase(),
    displayMode: typeof currentQuickDraftDisplayMode === "function" ? currentQuickDraftDisplayMode() : "body",
    toolsOpen: !!refs.tools?.open,
    drawer,
    activeLayerKind: quickDraftActiveLayerKind,
    expandedLayerKind: quickDraftExpandedLayerKind,
    editor: typeof captureTextControlWorkingSession === "function"
      ? captureTextControlWorkingSession(refs.draft)
      : {
        selectionStart: refs.draft?.selectionStart || 0,
        selectionEnd: refs.draft?.selectionEnd || 0,
        selectionDirection: refs.draft?.selectionDirection || "none",
        scrollTop: refs.draft?.scrollTop || 0,
        focused: document.activeElement === refs.draft,
      },
  };
}

function restoreWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  const slot = activeProjectQuickDraft();
  if (!slot) return false;
  // Legacy state.workspace is deliberately ignored: Project Hard Disk owns
  // the latest durable draft, while Working Session restores only its view.
  renderQuickDraft(slot.record);
  // state.paperSurface is deliberately ignored: the paper is derived from the
  // work, and restoring a remembered one is exactly how the two used to drift.
  if (["body", "grain", "read"].includes(state.displayMode) && typeof setQuickDraftDisplayMode === "function") {
    setQuickDraftDisplayMode(state.displayMode);
  }
  if (refs.tools) refs.tools.open = !!state.toolsOpen;
  quickDraftActiveLayerKind = String(state.activeLayerKind || quickDraftActiveLayerKind);
  quickDraftExpandedLayerKind = String(state.expandedLayerKind || "");
  renderAdjustmentLayers(slot.record);
  closeQuickDraftDrawer({ restoreFocus: false });
  if (state.drawer === "shelf" || state.drawer === "inspector") {
    setQuickDraftDrawer(state.drawer, { restoreFocus: false });
  }
  requestAnimationFrame(() => {
    if (!refs.draft) return;
    const editor = state.editor && typeof state.editor === "object"
      ? state.editor
      : {
        scrollTop: state.scrollTop,
        selectionStart: state.selectionStart,
        selectionEnd: state.selectionEnd,
      };
    if (typeof restoreTextControlWorkingSession === "function") {
      restoreTextControlWorkingSession(refs.draft, editor, { windowName: "quickDraft" });
      return;
    }
    refs.draft.scrollTop = Number(editor.scrollTop) || 0;
    const start = Math.min(Number(editor.selectionStart) || 0, refs.draft.value.length);
    const end = Math.min(Number(editor.selectionEnd) || start, refs.draft.value.length);
    refs.draft.setSelectionRange(start, end, editor.selectionDirection || "none");
    if (editor.focused) refs.draft.focus({ preventScroll: true });
  });
  return true;
}

// Load the document's darkroom record, and drain anything a pre-schema-4 record
// is still carrying. The normalizer hands the old fields forward in
// `pendingDarkroom` rather than dropping them, because it runs on every load
// and long before this can; this is the only place that empties that bucket.
//
// State with no document to hang it on gets one. A draft that was never saved
// as a project document still has a negative, a stack and a chain, and they
// have to live somewhere addressable — so the migration creates the document
// it should have had, and the document appears in the project like any other.
async function ensureDarkroomReady(projectId = activeProjectId) {
  // Load the durable half before reading for it. Without this the two handles
  // are simply absent, the guard below returns false in silence, and the
  // darkroom answers every read from a blank in-memory record that is never
  // written anywhere — which is what shipped in 1.0.50 before this line.
  if (typeof ensureDarkroomModule === "function") await ensureDarkroomModule();
  const store = window.AISystem6DarkroomStore;
  const plan = window.AISystem6DarkroomRecord;
  if (!store || !plan) return false;
  let slot = projectQuickDraft(projectId, { create: false });
  if (!slot) return false;
  const pending = slot.record.workspace.pendingDarkroom;
  if (pending) {
    let documentId = String(slot.record.workspace.projectDocId || "");
    if (!documentId && typeof saveQuickDraftAsProjectDocumentFor === "function") {
      await saveQuickDraftAsProjectDocumentFor(projectId);
      slot = projectQuickDraft(projectId, { create: false }) || slot;
      documentId = String(slot.record.workspace.projectDocId || "");
    }
    if (!documentId) {
      // Nowhere to put it and no document could be made: leave the bucket
      // exactly where it is rather than dropping it on the floor.
      console.warn("Darkroom state could not be migrated: the draft has no document.");
      return false;
    }
    await store.loadDarkroomRecord(projectId, documentId);
    store.setDarkroomRecord(projectId, documentId, plan.darkroomRecordFromWorkspace(pending));
    await store.persistDarkroomRecord(projectId, documentId);
    const next = { ...slot.record.workspace };
    delete next.pendingDarkroom;
    slot.project.quickDraft = { ...slot.record, workspace: next };
    await persistQuickDraftWorkspace(projectId);
    return true;
  }
  const documentId = String(slot.record.workspace.projectDocId || "");
  if (documentId && !store.darkroomIsLoaded(projectId, documentId)) {
    await store.loadDarkroomRecord(projectId, documentId);
  }
  return true;
}

async function open(options = {}) {
  bind();
  await ensureDarkroomReady();
  renderQuickDraft();
  await openWindow("quickDraft", { ...options, skipQuickDraftEntrypoint: true });
  const win = getWindow("quickDraft");
  const rect = win?.getBoundingClientRect();
  if (win && rect && (rect.width < 360 || rect.height < 260) && typeof maximizeWindow === "function") {
    maximizeWindow(win);
  }
  if (typeof updateQuickDraftFocusChrome === "function") updateQuickDraftFocusChrome();
  focusQuickDraftPaper();
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
  commitQuickDraftForProject,
  createQuickDraftAsyncTask,
  flushPendingQuickDraftCommit,
  persistQuickDraftWorkspace,
  paperSurface: () => quickDraftPhase(),
  quickDraftAliases,
  quickDraftModelAvailable,
  refs,
  saveQuickDraft,
  updateQuickDraft,
  updateQuickDraftForProject,
  setBusy,
  quickDraftPanelVisible,
  applyQuickDraftPaperSurface,
  developDocument,
  lightroomBodyText,
  lightroomIsReadOnly,
  quickDraftPhase,
  setQuickDraftStatus,
  setSaveState,
  titleFromBody,
  toggleQuickDraftPanel,
  workspaceSnapshot,
});
