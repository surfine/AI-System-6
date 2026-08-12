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

// One window, three regions: the material shelf, the paper, the inspector.
// The paper never leaves the screen, so there is no phase to switch — only
// which surface the paper carries. With no draft it carries the intake well;
// once a draft exists it carries the body. That is an empty state, and a
// manual choice is never yanked back.
let quickDraftPaperSurface = "intake";
let quickDraftPaperManual = false;
let quickDraftDisplayMode = "body";
let quickDraftAdvancedRevealed = false;

/** @returns {any} */
function $(id) {
  return document.getElementById(id);
}

function collectRefs() {
  refs.form = $("quick-draft-form");
  refs.noProject = $("quick-draft-no-project");
  refs.workspace = refs.form?.querySelector(".draft-desk-workspace");
  refs.footer = refs.form?.querySelector(".draft-desk-actions");
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
  refs.shareButton = refs.form?.querySelector('[data-quick-draft-delivery="share-markdown"]');
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
    composition: previous.workspace.composition,
    versions: previous.workspace.versions,
    protectedRanges: previous.workspace.protectedRanges,
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

function updateQuickDraftForProject(projectId, patch = {}, { announce = false, captureForm = projectId === activeProjectId } = {}) {
  const slot = projectQuickDraft(projectId);
  if (!slot) {
    if (projectId === activeProjectId) setQuickDraftStatus(t("quick_draft_no_project"));
    return null;
  }
  const now = new Date().toISOString();
  const patchWorkspace = patch.workspace && typeof patch.workspace === "object" ? patch.workspace : {};
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
  button.disabled = !enabled;
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
  const actionButton = (action) => refs.form?.querySelector(`[data-quick-draft-chat-action="${action}"]`);
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

function setQuickDraftPaperSurface(surface = "intake", { manual = false } = {}) {
  const next = surface === "editor" ? "editor" : "intake";
  quickDraftPaperSurface = next;
  if (manual) quickDraftPaperManual = true;
  if (next === "editor") promoteWellTextToBody();
  refs.form?.classList.toggle("is-empty-draft", next === "intake");
  getWindow("quickDraft")?.classList.toggle("is-quick-draft-empty", next === "intake");
  if (refs.intakeWell) refs.intakeWell.hidden = next !== "intake";
  if (refs.bodySurface) refs.bodySurface.hidden = next !== "editor";
  if (next === "intake") closeQuickDraftDrawer({ restoreFocus: false });
  const record = activeProjectQuickDraft({ create: false })?.record;
  const hasBody = Boolean(String(refs.draft?.value || record?.workspace?.body || "").trim());
  syncQuickDraftControlAvailability(hasBody);
  syncQuickDraftPrimaryAction(record, hasBody);
  return next;
}

// A draft exists once the model has passed over the body (the negative is
// stamped) or a previous body was kept as a version. Typing in the well is
// not a draft, so the paper does not flip under the writer's hands.
function syncQuickDraftPaperFromState(record = activeProjectQuickDraft({ create: false })?.record) {
  if (quickDraftPaperManual) return;
  const workspace = normalizeQuickDraftRecord(record).workspace;
  const drafted = Boolean(
    String(workspace.body || "").trim()
    ||
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
    .forEach((element) => {
      const button = /** @type {HTMLButtonElement} */ (element);
      button.hidden = !hasBody || !quickDraftAdvancedRevealed;
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
  const displayGroup = refs.form?.querySelector('.draft-desk-display-switch[role="tablist"]');
  if (displayGroup && typeof syncRovingTabStops === "function") syncRovingTabStops(displayGroup);
}

function syncQuickDraftPrimaryAction(record = activeProjectQuickDraft({ create: false })?.record, hasBody = false) {
  if (!refs.saveButton) return "draft";
  const action = hasBody ? "continue" : "draft";
  const key = hasBody ? "quick_draft_continue_writing" : "quick_draft_start_writing";
  refs.saveButton.dataset.quickDraftPrimaryAction = action;
  refs.saveButton.dataset.i18n = key;
  refs.saveButton.textContent = t(key);
  return action;
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
    ...(refs.form?.querySelectorAll([
      "[data-quick-draft-adjustment-apply]",
      "[data-quick-draft-adjustment-develop]",
      "[data-quick-draft-chat-action]",
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
    ? refs.form.querySelector(`[data-quick-draft-drawer="${next}"]`)
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
  const compactOnlyControl = refs.form?.querySelector(".draft-desk-drawer-close");
  return Boolean(compactOnlyControl && getComputedStyle(compactOnlyControl).display !== "none");
}

function quickDraftPanelVisible(panel = "shelf") {
  if (!refs.form || refs.form.classList.contains("is-empty-draft")) return false;
  const target = panel === "inspector" ? "inspector" : "shelf";
  if (quickDraftUsesDrawerLayout()) {
    return refs.form.classList.contains(target === "inspector" ? "is-inspector-open" : "is-shelf-open");
  }
  return !refs.form.classList.contains(target === "inspector" ? "is-inspector-hidden" : "is-shelf-hidden");
}

function toggleQuickDraftPanel(panel = "shelf") {
  if (!refs.form || refs.form.classList.contains("is-empty-draft")) return false;
  const target = panel === "inspector" ? "inspector" : "shelf";
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
  const target = quickDraftPaperSurface === "intake"
    ? refs.say
    : !refs.draft?.classList.contains("is-hidden")
      ? refs.draft
      : refs.form?.querySelector('[data-quick-draft-display][aria-selected="true"]');
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
  syncQuickDraftPaperFromState(source);
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
      setQuickDraftPaperSurface("editor", { manual: true });
      requestAnimationFrame(focusQuickDraftPaper);
      return;
    }
    setQuickDraftPaperSurface("editor", { manual: true });
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
      if (drawer === "inspector") {
        quickDraftAdvancedRevealed = true;
        syncQuickDraftControlAvailability(true);
      }
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
    setQuickDraftPaperSurface("intake", { manual: true });
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
    paperSurface: quickDraftPaperSurface,
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
  if (state.paperSurface === "editor" || state.paperSurface === "intake") {
    setQuickDraftPaperSurface(state.paperSurface, { manual: true });
  }
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

async function open(options = {}) {
  bind();
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
  paperSurface: () => quickDraftPaperSurface,
  quickDraftAliases,
  quickDraftModelAvailable,
  refs,
  saveQuickDraft,
  updateQuickDraft,
  updateQuickDraftForProject,
  setBusy,
  quickDraftPanelVisible,
  setQuickDraftPaperSurface,
  setQuickDraftStatus,
  setSaveState,
  titleFromBody,
  toggleQuickDraftPanel,
  workspaceSnapshot,
});
