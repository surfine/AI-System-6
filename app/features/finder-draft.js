// Feature module: 钟点稿 / Quick Draft.
//
// Finder-mode fast drafting workspace. Durable data lives on
// getActiveProject().quickDraft.workspace; the main writing route is only
// touched by explicit handoff actions.

(function () {
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

  const emptyStrategyReport = Object.freeze({
    editorial: "",
    materialLedger: "",
    adoptionTable: "",
  });

  // 文字亮室 canvas (task 8): the article is an ordered path through objects.
  // Phase 1 has exactly one text object holding the draft; the object's visual
  // transform (position, size, angle) is separate from the semantic
  // adjustment stack and never needs a model. The text itself stays in
  // workspace.body — the canvas object is a view of the same Markdown.
  function blankQuickDraftCanvas() {
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

  function normalizeQuickDraftCanvas(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = blankQuickDraftCanvas();
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

  const refs = {};
  let bound = false;
  let saveTimer = null;
  let requestController = null;

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
    refs.aiCards = $("quick-draft-ai-cards");
    refs.lengthLabel = $("quick-draft-length-label");
    refs.intake = document.querySelector(".quick-draft-card-sidebar");
    refs.ventLog = $("quick-draft-vent-log");
    refs.chatMaterials = $("quick-draft-chat-materials");
    refs.stanceCandidates = $("quick-draft-stance-candidates");
    refs.outlineSeed = $("quick-draft-outline-seed");
    refs.dump = $("quick-draft-dump");
    refs.restoreDumpButton = $("quick-draft-restore-dump");
    refs.strategy = document.querySelector(".quick-draft-strategy-card");
    refs.editorialStrategy = $("quick-draft-editorial-strategy");
    refs.materialLedger = $("quick-draft-material-ledger");
    refs.adoptionTable = $("quick-draft-adoption-table");
    refs.collectVentButton = $("quick-draft-collect-vent");
    refs.importChatButton = $("quick-draft-import-chat");
    refs.adoptImpressionButton = $("quick-draft-adopt-impression");
    refs.confirmHandsOnButton = $("quick-draft-confirm-hands-on");
    refs.startWritingButton = $("quick-draft-start-writing");
    refs.handsOnCard = document.querySelector(".quick-draft-hands-on-card");
    refs.startState = $("quick-draft-start-state");
    refs.thesis = $("quick-draft-thesis");
    refs.sources = $("quick-draft-sources");
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
    refs.togglePreviewButton = $("quick-draft-toggle-preview");
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
      title: "",
      body: "",
      scenario: FIRST_DAY_FORMAT,
      toolInputs: blankToolInputs(),
      annotations: { ...emptyAnnotations },
      intake: { ...emptyIntake, ventLog: [], chatMaterials: [], stanceCandidates: [] },
      strategyReport: { ...emptyStrategyReport },
      sourceMap: [],
      humanAnchor: "",
      humanAnchorUpdatedAt: "",
      adjustmentLayers: [],
      protectedRanges: [],
      canvas: blankQuickDraftCanvas(),
      updatedAt: "",
      savedStatus: "saved",
      projectDocId: "",
    };
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

  function normalizeStrategyReport(value = {}, legacy = {}) {
    const source = value && typeof value === "object" ? value : {};
    const fallback = legacy.strategyReport && typeof legacy.strategyReport === "object" ? legacy.strategyReport : {};
    return {
      ...emptyStrategyReport,
      editorial: String(source.editorial ?? fallback.editorial ?? ""),
      materialLedger: String(source.materialLedger ?? fallback.materialLedger ?? ""),
      adoptionTable: String(source.adoptionTable ?? fallback.adoptionTable ?? ""),
    };
  }

  function normalizeQuickDraftWorkspace(value = {}, legacy = {}) {
    const source = value && typeof value === "object" ? value : {};
    const body = hasOwnString(source, "body") ? source.body : String(legacy.draft || "");
    const scenario = normalizeScenario(source.scenario || legacy.targetFormat, FIRST_DAY_FORMAT);
    const toolInputs = {
      ...normalizeToolInputs(source.toolInputs, legacy),
      targetDuration: normalizeDuration(source.toolInputs?.targetDuration || legacy.targetDuration, scenario),
    };
    const title = String(source.title || legacy.title || toolInputs.firstDaySubject || titleFromBody(body) || t("quick_draft_title"));
    return {
      ...blankQuickDraftWorkspace(),
      title,
      body: String(body || ""),
      scenario,
      toolInputs,
      annotations: normalizeAnnotations(source.annotations, legacy),
      intake: normalizeIntake(source.intake, legacy),
      strategyReport: normalizeStrategyReport(source.strategyReport, legacy),
      sourceMap: Array.isArray(source.sourceMap) ? source.sourceMap : (Array.isArray(legacy.sourceMap) ? legacy.sourceMap : []),
      humanAnchor: String(source.humanAnchor || legacy.humanAnchor || ""),
      humanAnchorUpdatedAt: String(source.humanAnchorUpdatedAt || legacy.humanAnchorUpdatedAt || ""),
      adjustmentLayers: normalizeAdjustmentLayers(source.adjustmentLayers || legacy.adjustmentLayers),
      protectedRanges: normalizeAdjustmentLayerMask(source.protectedRanges || legacy.protectedRanges),
      canvas: normalizeQuickDraftCanvas(source.canvas || legacy.canvas),
      updatedAt: String(source.updatedAt || legacy.updatedAt || ""),
      savedStatus: source.savedStatus === "modified" ? "modified" : "saved",
      projectDocId: String(source.projectDocId || legacy.projectDocId || ""),
    };
  }

  function quickDraftAliases(workspace) {
    return {
      thesis: workspace.toolInputs.thesis,
      pastedSources: workspace.toolInputs.pastedSources,
      targetFormat: workspace.scenario,
      targetDuration: workspace.toolInputs.targetDuration,
      firstDaySubject: workspace.toolInputs.firstDaySubject,
      handsOnNotes: workspace.toolInputs.handsOnNotes,
      officialMaterials: workspace.toolInputs.officialMaterials,
      unavailableNotes: workspace.toolInputs.unavailableNotes,
      audienceConcerns: workspace.toolInputs.audienceConcerns,
      firstImpression: workspace.toolInputs.firstImpression,
      tone: workspace.toolInputs.tone,
      mustInclude: workspace.toolInputs.mustInclude,
      mustAvoid: workspace.toolInputs.mustAvoid,
      brief: {
        ...emptyBrief,
        support: workspace.annotations.firsthand,
        counter: workspace.annotations.official,
        uncertainty: workspace.annotations.uncertainty,
      },
      draft: workspace.body,
      risks: workspace.annotations.followup,
      humanAnchor: workspace.humanAnchor,
      humanAnchorUpdatedAt: workspace.humanAnchorUpdatedAt,
      strategyReport: workspace.strategyReport,
      intake: workspace.intake,
      sourceMap: workspace.sourceMap,
      updatedAt: workspace.updatedAt,
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
    return activeProjectQuickDraft({ create: false })?.record.workspace.annotations || { ...emptyAnnotations };
  }

  function workspaceSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
    const previous = normalizeQuickDraftRecord(record);
    const body = refs.draft?.value || "";
    const bodyTitle = titleFromBody(body);
    const titleValue = bodyTitle && bodyTitle !== t("quick_draft_title")
      ? bodyTitle
      : (previous.workspace.title || bodyTitle);
    const subjectValue = titleValue && titleValue !== t("quick_draft_title")
      ? titleValue
      : (refs.firstDaySubject?.value || previous.workspace.toolInputs.firstDaySubject || "");
    const scenario = normalizeScenario(refs.format?.value || previous.workspace.scenario);
    return {
      title: titleValue,
      body,
      scenario,
      toolInputs: {
        thesis: refs.thesis?.value || "",
        pastedSources: refs.sources?.value || "",
        targetDuration: normalizeDuration(refs.duration?.value || previous.workspace.toolInputs.targetDuration, scenario),
        firstDaySubject: subjectValue,
        handsOnNotes: refs.handsOn?.value || "",
        officialMaterials: refs.officialMaterials?.value || "",
        unavailableNotes: refs.unavailable?.value || "",
        audienceConcerns: refs.audienceConcerns?.value || "",
        firstImpression: refs.firstImpression?.value || "",
        tone: refs.tone?.value || "",
        mustInclude: refs.mustInclude?.value || "",
        mustAvoid: refs.mustAvoid?.value || "",
      },
      annotations: previous.workspace.annotations,
      intake: previous.workspace.intake,
      strategyReport: previous.workspace.strategyReport,
      sourceMap: previous.workspace.sourceMap,
      humanAnchor: previous.workspace.humanAnchor,
      humanAnchorUpdatedAt: previous.workspace.humanAnchorUpdatedAt,
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
    refs.saveState.textContent = t(state === "modified" ? "quick_draft_modified_state" : "quick_draft_saved_state");
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

  function saveQuickDraft(patch = {}, { debounce = false, announce = false } = {}) {
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
      savedStatus: debounce ? "modified" : "saved",
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

    clearTimeout(saveTimer);
    const persist = () => {
      const latest = activeProjectQuickDraft({ create: false });
      if (latest?.project.quickDraft?.workspace) {
        latest.project.quickDraft.workspace.savedStatus = "saved";
        latest.project.quickDraft.savedStatus = "saved";
      }
      setSaveState("saved");
      saveDeskState();
      if (announce) setQuickDraftStatus(t("quick_draft_saved"));
    };
    if (debounce) saveTimer = setTimeout(persist, 550);
    else persist();
    return nextRecord;
  }

  function setQuickDraftStatus(message) {
    if (refs.status) refs.status.textContent = message || t("quick_draft_ready");
  }

  function intakeSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
    return normalizeQuickDraftWorkspace(record?.workspace, record).intake;
  }

  function strategySnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
    return normalizeQuickDraftWorkspace(record?.workspace, record).strategyReport;
  }

  function humanAnchorSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    return workspace.humanAnchor || dumpEntries(workspace.intake)[0]?.text || "";
  }

  function adjustmentLayersSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
    return normalizeAdjustmentLayers(normalizeQuickDraftWorkspace(record?.workspace, record).adjustmentLayers);
  }

  function adjustmentLayerState(kind = "", record = activeProjectQuickDraft({ create: false })?.record) {
    return adjustmentLayer(kind, adjustmentLayersSnapshot(record));
  }

  function updateAdjustmentLayer(kind = "", patch = {}) {
    const next = normalizeAdjustmentLayers(adjustmentLayersSnapshot()).map((layer) => (
      layer.kind === kind ? { ...layer, ...patch } : layer
    ));
    saveQuickDraft({ workspace: { adjustmentLayers: next } }, { debounce: false });
    renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
    refreshQuickDraftPreviewIfOpen();
    setQuickDraftStatus(t("quick_draft_adjustment_saved"));
    return next;
  }

  function renderAdjustmentLayers(record = activeProjectQuickDraft({ create: false })?.record) {
    if (!refs.form) return;
    const layers = adjustmentLayersSnapshot(record);
    const section = refs.form.querySelector("[data-quick-draft-adjustment-layer]")?.parentElement;
    if (section) {
      // The visible stack follows the stored order.
      layers.forEach((layer) => {
        const wrapper = section.querySelector(`[data-quick-draft-adjustment-layer="${layer.kind}"]`);
        if (wrapper) section.append(wrapper);
      });
    }
    layers.forEach((layer, index) => {
      const checkbox = refs.form.querySelector(`[data-quick-draft-adjustment-enabled="${layer.kind}"]`);
      const select = refs.form.querySelector(`[data-quick-draft-adjustment-strength="${layer.kind}"]`);
      const maskInput = refs.form.querySelector(`[data-quick-draft-adjustment-mask="${layer.kind}"]`);
      if (checkbox) checkbox.checked = layer.enabled;
      if (select) select.value = String(layer.strength);
      if (maskInput) maskInput.value = adjustmentMaskSummary(layer.mask);
      const wrapper = refs.form.querySelector(`[data-quick-draft-adjustment-layer="${layer.kind}"]`);
      if (wrapper) {
        const up = wrapper.querySelector('[data-quick-draft-adjustment-move][data-direction="-1"]');
        const down = wrapper.querySelector('[data-quick-draft-adjustment-move][data-direction="1"]');
        if (up) up.disabled = index === 0;
        if (down) down.disabled = index === layers.length - 1;
      }
    });
  }

  function moveAdjustmentLayer(kind = "", direction = -1) {
    const layers = adjustmentLayersSnapshot();
    const index = layers.findIndex((layer) => layer.kind === kind);
    const target = index + (Number(direction) || -1);
    if (index < 0 || target < 0 || target >= layers.length) return layers;
    const next = [...layers];
    const [layer] = next.splice(index, 1);
    next.splice(target, 0, layer);
    saveQuickDraft({ workspace: { adjustmentLayers: next } }, { debounce: false });
    renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
    refreshQuickDraftPreviewIfOpen();
    setQuickDraftStatus(t("quick_draft_adjustment_saved"));
    return next;
  }

  function refreshQuickDraftPreviewIfOpen() {
    if (refs.draft?.closest(".teachtext-editor-container")?.classList.contains("is-previewing")) {
      renderQuickDraftPreviewPane();
    }
  }

  function adjustmentLayerLabelKey(kind = "") {
    const labels = {
      mingming: "quick_draft_chip_mingming",
      luoluo: "quick_draft_chip_luoluo",
      hkrr: "quick_draft_chip_hkrr",
      density: "quick_draft_adjustment_density",
    };
    return labels[kind] || "";
  }

  // ---- Protected spans ---------------------------------------------------
  // Protection is a property of the text, not of a layer: a writer protects a
  // quote from everything. It lives beside the negative at the workspace
  // level, in the same line-range shape the mask uses, and every model call
  // subtracts it before sending the body. A textarea cannot paint spans, so
  // the honest representation stays line ranges ("3-5, 8"), readable and
  // correctable as text, and the visual mark lives in the read-only preview.

  function protectedRangesSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
    return normalizeAdjustmentLayerMask(normalizeQuickDraftWorkspace(record?.workspace, record).protectedRanges);
  }

  function renderProtectedRangeControls(record = activeProjectQuickDraft({ create: false })?.record) {
    const input = refs.form?.querySelector("[data-quick-draft-protected-ranges]");
    if (!input) return;
    input.value = adjustmentMaskSummary(protectedRangesSnapshot(record));
  }

  // The textarea selection is converted to 1-based inclusive line ranges; a
  // selection inside one line protects that whole line, because a line-range
  // mask cannot split a line.
  function selectionLineRanges() {
    const el = refs.draft;
    if (!el) return [];
    const value = String(el.value || "");
    if (!value) return [];
    const start = Math.min(Number(el.selectionStart) || 0, value.length);
    const end = Math.max(Number(el.selectionEnd) || start, start);
    const before = value.slice(0, start);
    const selected = value.slice(start, end).replace(/\n$/, "");
    const startLine = before.split(/\n/).length;
    const endLine = startLine + Math.max(0, selected.split(/\n/).length - 1);
    return [{ start: startLine, end: endLine }];
  }

  function protectSelectionFromTextarea() {
    const ranges = selectionLineRanges();
    if (!ranges.length) {
      setQuickDraftStatus(t("quick_draft_protect_no_selection"));
      refs.draft?.focus();
      return false;
    }
    const next = normalizeAdjustmentLayerMask([...protectedRangesSnapshot(), ...ranges]);
    saveQuickDraft({ workspace: { protectedRanges: next } }, { debounce: false });
    renderProtectedRangeControls(activeProjectQuickDraft({ create: false })?.record);
    refreshQuickDraftPreviewIfOpen();
    setQuickDraftStatus(t("quick_draft_protect_saved"));
    return true;
  }

  function scopeSelectionToLayer(kind = "") {
    const ranges = selectionLineRanges();
    if (!ranges.length) {
      setQuickDraftStatus(t("quick_draft_scope_no_selection"));
      refs.draft?.focus();
      return false;
    }
    const layers = adjustmentLayersSnapshot();
    const layer = layers.find((item) => item.kind === kind);
    if (!layer) return false;
    const merged = normalizeAdjustmentLayerMask([...(layer.mask || []), ...ranges]);
    const next = layers.map((item) => (item.kind === kind ? { ...item, mask: merged } : item));
    saveQuickDraft({ workspace: { adjustmentLayers: next } }, { debounce: false });
    renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
    refreshQuickDraftPreviewIfOpen();
    setQuickDraftStatus(t("quick_draft_scope_saved"));
    return true;
  }

  function densityStrengthPromptLine(strength = ADJUSTMENT_DEFAULT_STRENGTH, zh = true) {
    if (strength === 25) {
      return zh
        ? "- 密度调整层：少压。几乎保留全部原句，只压掉最妨碍“当天能录”的啰嗦；顺序、口气和判断不动。"
        : "- Density adjustment: less compression. Keep nearly every original sentence; cut only the redundancy that blocks same-day recording; keep order, voice, and judgment.";
    }
    if (strength === 75) {
      return zh
        ? "- 密度调整层：多压。明显压缩：合并冗余句、删空话、让段落更密；不新增事实、不丢未测边界、不用风格覆盖事实。"
        : "- Density adjustment: more compression. Compress hard: merge redundant sentences, cut filler, make the passage denser; never add facts, drop untested boundaries, or let style override facts.";
    }
    return zh
      ? "- 密度调整层：标准。适度压缩：合并可省的句子、压掉泛泛总结，但保留作者判断、具体细节和已写出的口气。"
      : "- Density adjustment: standard. Compress moderately: merge what can be saved and trim generic summary, but keep the author's judgment, concrete detail, and written voice.";
  }

  // One instruction line per enabled layer, in stored order. The mask is
  // remapped onto the subtracted text so the line numbers the model sees are
  // the ones in the prompt; a fully protected mask means the layer changes
  // nothing.
  function adjustmentLayerCompositionInstruction(layer = {}, sourceText = "", zh = true) {
    const kind = String(layer?.kind || "");
    const strength = Number(layer?.strength) || ADJUSTMENT_DEFAULT_STRENGTH;
    const lensLine = kind === "density"
      ? densityStrengthPromptLine(strength, zh)
      : kind === "mingming"
      ? (zh
        ? "- 铭铭视角调整：朝“能拍、能念、能成立的当天口播”收紧这一遍；保留作者判断、犹豫和已写出的口气。"
        : "- Mingming-perspective adjustment: tighten this pass toward shootable, speakable, defensible same-day spoken copy; keep the author's judgment, hesitation, and written voice.")
      : kind === "luoluo"
      ? (zh
        ? "- 落落接收视角调整：让段落更容易直接开口念、不要求他重新拆资料；保留判断和真实口气，不写私人建议。"
        : "- Luoluo-receiving adjustment: make the passage easier to read aloud without re-triaging sources; keep judgment and real voice; no private advice.")
      : kind === "hkrr"
      ? (zh
        ? "- HKRR 调整：加发现感、信息增量、人的感受和节奏；不编造，不抹平边界。"
        : "- HKRR adjustment: add discovery, information gain, human feeling, and rhythm; never invent, never flatten boundaries.")
      : "";
    const strengthLine = kind === "density" ? "" : adjustmentStrengthPromptLine(strength, zh);
    const maskRanges = remapRangesAfterSubtraction(layer?.mask || [], protectedRangesSnapshot());
    const maskLine = maskRanges.length
      ? (zh
        ? `- 本层只作用于下面正文的第 ${adjustmentMaskSummary(maskRanges)} 行；其余行保持原样，不要给建议。`
        : `- This layer applies only to lines ${adjustmentMaskSummary(maskRanges)} of the text below; leave every other line alone.`)
      : (zh
        ? "- 本层蒙版所在的行全部受保护，这一层不改任何内容。"
        : "- Every line this layer masks is protected; this layer changes nothing.");
    return [lensLine, strengthLine, maskLine].filter(Boolean).join("\n");
  }

  // The protected text is quoted verbatim in the prompt, and the instruction
  // says it must come back unchanged. The restore after the pass is the
  // enforcement; this block is the request.
  function protectedPromptBlock(protectedBlocks = [], zh = true) {
    if (!protectedBlocks.length) return "";
    const quotes = protectedBlocks.map((block) => `「${block.text}」`).join("\n\n");
    return zh
      ? [
          "- 以下是你必须逐字保留、不得改动的受保护文字（连标点和换行都必须一致）：",
          quotes,
          "- 受保护文字必须在输出中逐字原样出现；可以出现在原位置，也可以原样保留在正文中，但不能改动、删减或改写。",
        ].join("\n")
      : [
          "- The protected text below must be reproduced verbatim, punctuation and line breaks included:",
          quotes,
          "- Protected text must appear in the output exactly as stored; keep it at its original position and never reword, trim, or rewrite it.",
        ].join("\n");
  }

  function grainMaskEntries(bodyText = "") {
    const lineCount = String(bodyText || "").split("\n").length;
    return adjustmentLayersSnapshot()
      .filter((layer) => layer.enabled)
      .map((layer) => ({
        kind: layer.kind,
        label: t(adjustmentLayerLabelKey(layer.kind)),
        ranges: adjustmentLayerMaskRanges(layer, lineCount),
      }))
      .filter((entry) => entry.ranges.length);
  }

  function adjustmentStrengthPromptLine(strength = ADJUSTMENT_DEFAULT_STRENGTH, zh = true) {
    if (strength === 25) {
      return zh
        ? "- 调整层强度：轻触。只修最影响“当天能录”的问题；当前正文的原句、顺序和口气尽量保留。"
        : "- Adjustment strength: light touch. Fix only what most blocks same-day recording; keep the current body's sentences, order, and voice.";
    }
    if (strength === 75) {
      return zh
        ? "- 调整层强度：重写。可以合并、换序、换词来达到目标，但不新增事实、不丢未测边界、不用风格覆盖事实。"
        : "- Adjustment strength: heavy. You may merge, reorder, and reword to hit the target; never add facts, drop untested boundaries, or let style override facts.";
    }
    return zh
      ? "- 调整层强度：标准。可以合并或微调，但保留作者判断、犹豫和已写出的口气。"
      : "- Adjustment strength: standard. You may merge or tune, but keep the author's judgment, hesitation, and written voice.";
  }

  function textExcerpt(text = "", limit = 240) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }

  function appendUniqueMarkdownLine(text = "", line = "") {
    const value = String(text || "").trim();
    const next = String(line || "").trim();
    if (!next) return value;
    const lines = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (lines.includes(next)) return value;
    return [...lines, next].join("\n").trim();
  }

  function appendAdoptionRow(table = "", row = []) {
    const cells = row.map((cell) => String(cell || "").replace(/\|/g, "/").trim());
    if (!cells.some(Boolean)) return String(table || "").trim();
    const next = `| ${cells.join(" | ")} |`;
    const value = String(table || "").trim();
    const base = value || "| 策略/素材 | 稿子处理 | 状态 |\n|---|---|---|";
    if (base.split(/\r?\n/).map((line) => line.trim()).includes(next)) return base;
    return `${base}\n${next}`;
  }

  function inferStrategySignals(text = "") {
    const value = String(text || "").trim();
    if (!value) return { editorial: [], materialLedger: [], adoptionRows: [] };
    const excerpt = textExcerpt(value, 180);
    const signals = { editorial: [], materialLedger: [], adoptionRows: [] };
    const addEditorial = (label, detail = excerpt) => signals.editorial.push(`- ${label}：${detail}`);
    const addMaterial = (label, status = "聊天/ClioTalk 捕捉") => signals.materialLedger.push(`- ${label}：[聊天建议] [待确认] ${status}；原话：${excerpt}`);
    const addRow = (item, handling, status = "待检查") => signals.adoptionRows.push([item, handling, status]);

    const deadline = value.match(/(?:deadline|ddl|截稿|截止|交稿|出来|发出|发布)?\s*(\d{1,2})\s*(?:点|:|：)(?:\d{1,2})?/i);
    if (deadline && /(deadline|ddl|截稿|截止|交稿|出来|发出|发布|\d{1,2}\s*(?:点|:|：))/i.test(value)) {
      addEditorial("deadline/时间压力", deadline[0].trim());
    }
    if (/(先别|别|不要|不讲|少讲|降权|一笔带过).*(AI|Siri|人工智能)|(?:AI|Siri|人工智能).*(先别|别|不要|不讲|少讲|降权|一笔带过)/i.test(value)) {
      addEditorial("降权", "AI/Siri 先降权，不作为主线");
      addRow("AI/Siri 降权", "只一笔带过或放入不好展示/待核边界", "待检查");
    }
    if (/(iOS|iPadOS|macOS).*(一起|三件套|一起讲)|三件套/i.test(value)) {
      addEditorial("主线", "iOS / iPadOS / macOS 作为三件套一起讲");
      addRow("三系统一起讲", "用“三件套升级”串联结构", "待检查");
    }
    if (/(设计|视觉|美学).*(不敢|不好乱|别乱|说不准|不下结论)/.test(value)) {
      addEditorial("作者边界", "设计类只说可观察变化，不下大结论");
      addRow("设计类不好乱说", "改成可观察变化和画面描述", "待检查");
    }
    if (/(自己表述|我自己说|自己的语言|别替我|不要替我|Aaron.*语言|落落.*语言)/i.test(value)) {
      addEditorial("作者边界", "最终用 Aaron/落落自己的语言，ClioTalk 只做编辑建议");
      addRow("作者自己的语言", "只建议改法，不默认替换正文", "待检查");
    }
    if (/(官方|发布会|官网|资料)/.test(value)) addMaterial("官方资料", "适合放入快速扫功能段，不能替代亲测");
    if (/(亲测|我试了|我看到了|实测|上手)/.test(value)) addMaterial("亲测体验", "优先进入可拍展示段");
    if (/(能拍|录屏|画面|展示|演示)/.test(value)) addMaterial("可拍画面", "优先映射成口播镜头");
    if (/(没测|未测|不能测|不好展示|不能展示|待核|不确定)/.test(value)) {
      addMaterial("未测/不好展示", "标边界、降权或删除");
      addRow("未测功能", "标边界或删除，不能写成亲测结论", "待处理");
    }
    if (/(Liquid Glass|液态玻璃|玻璃)/i.test(value)) {
      addMaterial("Liquid Glass", "可拍，适合开头或第一段画面");
      addRow("Liquid Glass", "翻成开头可拍画面", "待检查");
    }
    if (/(iPhone Mirroring|镜像)/i.test(value)) {
      addMaterial("iPhone Mirroring", "能演示时适合中段");
      addRow("iPhone Mirroring", "放在中段演示，不能演示则标边界", "待检查");
    }
    if (/(Apple Music|音乐)/i.test(value)) {
      addMaterial("Apple Music", "一句带过，避免展开太多");
      addRow("Apple Music", "一句带过", "待检查");
    }
    if (/(Apple Pay|支付)/i.test(value)) {
      addMaterial("Apple Pay", "能录就放，不能录就删");
      addRow("Apple Pay", "能录才进稿，否则删除或标边界", "待检查");
    }
    return signals;
  }

  function mergeStrategySignals(strategyReport = {}, signals = {}) {
    const next = normalizeStrategyReport(strategyReport);
    (signals.editorial || []).forEach((line) => {
      next.editorial = appendUniqueMarkdownLine(next.editorial, line);
    });
    (signals.materialLedger || []).forEach((line) => {
      next.materialLedger = appendUniqueMarkdownLine(next.materialLedger, line);
    });
    (signals.adoptionRows || []).forEach((row) => {
      next.adoptionTable = appendAdoptionRow(next.adoptionTable, row);
    });
    return next;
  }

  function hasStrategySignals(signals = {}) {
    return Boolean(
      signals.editorial?.length
      || signals.materialLedger?.length
      || signals.adoptionRows?.length
    );
  }

  function listSlot(el, items, emptyText, renderItem) {
    if (!el) return;
    el.replaceChildren();
    if (!items.length) {
      el.textContent = emptyText;
      el.classList.add("is-empty");
      return;
    }
    el.classList.remove("is-empty");
    const list = document.createElement("ul");
    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.textContent = renderItem(item, index);
      list.append(li);
    });
    el.append(list);
  }

  function renderStanceCandidates(items = []) {
    if (!refs.stanceCandidates) return;
    refs.stanceCandidates.replaceChildren();
    if (!items.length) {
      refs.stanceCandidates.textContent = t("quick_draft_stance_empty");
      refs.stanceCandidates.classList.add("is-empty");
      return;
    }
    refs.stanceCandidates.classList.remove("is-empty");
    const label = document.createElement("strong");
    label.className = "quick-draft-result-label";
    label.textContent = t("quick_draft_talk_points");
    const row = document.createElement("div");
    row.className = "quick-draft-chip-row";
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = "btn mini-btn quick-draft-suggestion-chip";
      button.type = "button";
      button.dataset.quickDraftStanceIndex = String(index);
      button.textContent = textExcerpt(item, 42);
      row.append(button);
    });
    refs.stanceCandidates.append(label);
    refs.stanceCandidates.append(row);
  }

  function dumpEntries(intake = intakeSnapshot()) {
    return (intake.ventLog || []).filter((entry) => entry.sourceKind === "quick-draft-dump");
  }

  function nonDumpVentEntries(intake = intakeSnapshot()) {
    return (intake.ventLog || []).filter((entry) => entry.sourceKind !== "quick-draft-dump");
  }

  function renderIntake(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
    const intake = normalizeQuickDraftRecord(record).workspace.intake;
    const dumps = dumpEntries(intake);
    listSlot(
      refs.ventLog,
      nonDumpVentEntries(intake),
      t("quick_draft_vent_empty"),
      (entry) => textExcerpt(entry.text)
    );
    listSlot(
      refs.dump,
      dumps,
      t("quick_draft_dump_empty"),
      (entry) => textExcerpt(entry.text, 320)
    );
    if (refs.restoreDumpButton) refs.restoreDumpButton.disabled = !dumps.length;
    listSlot(
      refs.chatMaterials,
      intake.chatMaterials,
      t("quick_draft_chat_empty"),
      (entry) => `${entry.name} · ${entry.platform}: ${textExcerpt(entry.text)}`
    );
    renderStanceCandidates(intake.stanceCandidates);
    const hasStanceCandidate = intake.stanceCandidates.some((item) => String(item || "").trim());
    if (refs.stanceCandidates) refs.stanceCandidates.hidden = !hasStanceCandidate;
    if (refs.adoptImpressionButton) {
      refs.adoptImpressionButton.hidden = !hasStanceCandidate;
      refs.adoptImpressionButton.disabled = !hasStanceCandidate;
    }
    markdownSlot(refs.outlineSeed, intake.outlineSeed || "");
  }

  function hasStrategyReport(record = normalizeQuickDraftRecord()) {
    const strategyReport = normalizeQuickDraftRecord(record).workspace.strategyReport;
    return hasStrategyReportValue(strategyReport);
  }

  function hasStrategyReportValue(strategyReport = {}) {
    return Boolean(
      String(strategyReport.editorial || "").trim()
      || String(strategyReport.materialLedger || "").trim()
      || String(strategyReport.adoptionTable || "").trim()
    );
  }

  function renderStrategyReport(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
    const strategyReport = normalizeQuickDraftRecord(record).workspace.strategyReport;
    markdownSlot(refs.editorialStrategy, strategyReport.editorial || "");
    markdownSlot(refs.materialLedger, strategyReport.materialLedger || "");
    markdownSlot(refs.adoptionTable, strategyReport.adoptionTable || "");
  }

  function setPostDraftChipsVisible(visible) {
    document.querySelectorAll("[data-quick-draft-after-draft]").forEach((button) => {
      button.hidden = !visible;
    });
  }

  function renderClassifySummaries(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
    const source = normalizeQuickDraftRecord(record).workspace.toolInputs;
    markdownSlot(refs.officialSummary, source.officialMaterials || "");
    markdownSlot(refs.unavailableSummary, source.unavailableNotes || "");
    markdownSlot(refs.audienceSummary, source.audienceConcerns || "");
  }

  function inlineStatusText(text = "", max = 48) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > max ? `${value.slice(0, max - 1)}...` : value;
  }

  function renderDecisionStatuses(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
    const workspace = normalizeQuickDraftRecord(record).workspace;
    const source = workspace.toolInputs;
    const firstImpression = inlineStatusText(source.firstImpression);
    if (refs.firstImpressionStatus) {
      refs.firstImpressionStatus.textContent = firstImpression
        ? t("quick_draft_first_impression_set", firstImpression)
        : t("quick_draft_first_impression_unset");
      refs.firstImpressionStatus.classList.toggle("is-missing", !firstImpression);
    }
    const handsOnNotes = inlineStatusText(source.handsOnNotes);
    if (refs.handsOnStatus) {
      refs.handsOnStatus.textContent = handsOnNotes
        ? t("quick_draft_hands_on_set", handsOnNotes)
        : t("quick_draft_hands_on_unset");
      refs.handsOnStatus.classList.toggle("is-missing", !handsOnNotes);
    }
    const hasHandsOnChoice = Boolean(
      handsOnNotes
      || String(workspace.annotations?.firsthand || "").trim()
      || isHandsOnReviewFormat(source.targetFormat)
    );
    if (refs.handsOnCard) {
      refs.handsOnCard.hidden = false;
      refs.handsOnCard.classList.toggle("has-hands-on-choice", hasHandsOnChoice);
    }
  }

  function quickDraftFailureMessage(error) {
    const message = error?.message || String(error || "");
    if (/not handled by src\/|Use the root server/i.test(message)) {
      return t("quick_draft_server_stale");
    }
    return message;
  }

  function isLaunchDayFormat(format = refs.format?.value) {
    return format === FIRST_DAY_FORMAT || format === HANDS_ON_REVIEW_FORMAT;
  }

  function isHandsOnReviewFormat(format = refs.format?.value) {
    return format === HANDS_ON_REVIEW_FORMAT;
  }

  function effectiveRouteFormat(format = refs.format?.value) {
    return isLaunchDayFormat(format) ? FIRST_DAY_FORMAT : BILI_DYNAMIC_FORMAT;
  }

  function launchDaySubtype(format = refs.format?.value) {
    return isHandsOnReviewFormat(format) ? HANDS_ON_REVIEW_FORMAT : FIRST_DAY_FORMAT;
  }

  function firstDaySnapshot() {
    const visibleSources = String(refs.sources?.value || "").trim();
    const title = String(refs.titleInput?.value || titleFromBody(refs.draft?.value || "") || "").trim();
    const subject = title && title !== t("quick_draft_title")
      ? title
      : String(refs.firstDaySubject?.value || "").trim();
    const officialMaterials = [
      String(refs.officialMaterials?.value || "").trim(),
      visibleSources,
    ].filter(Boolean).join("\n\n");
    return {
      title,
      subject,
      handsOnNotes: String(refs.handsOn?.value || "").trim(),
      officialMaterials,
      unavailableNotes: String(refs.unavailable?.value || "").trim(),
      audienceConcerns: String(refs.audienceConcerns?.value || "").trim(),
      firstImpression: String(refs.firstImpression?.value || "").trim(),
    };
  }

  function meaningfulFirstDayTitle(title = "") {
    const value = String(title || "").trim();
    return value && value !== t("quick_draft_title") ? value : "";
  }

  function firstDaySeedValues(data = firstDaySnapshot()) {
    return [
      meaningfulFirstDayTitle(data.title),
      data.subject,
      data.handsOnNotes,
      data.officialMaterials,
      data.unavailableNotes,
      data.audienceConcerns,
      data.firstImpression,
    ];
  }

  function firstDayThesisText(data = firstDaySnapshot()) {
    return [
      meaningfulFirstDayTitle(data.title) ? `${t("quick_draft_first_day_title")}: ${meaningfulFirstDayTitle(data.title)}` : "",
      data.subject ? `${t("quick_draft_first_day_subject")}: ${data.subject}` : "",
      data.firstImpression ? `${t("quick_draft_first_impression")}: ${data.firstImpression}` : "",
    ].filter(Boolean).join("\n");
  }

  function quickDraftTaskKind(options = {}) {
    return String(options.taskKind || "").trim();
  }

  function isVentOutlineTask(options = {}) {
    return quickDraftTaskKind(options) === "collect-vent-outline";
  }

  function setQuickDraftLabel(el, key) {
    if (el) el.textContent = t(key);
  }

  function durationLabel(value = "", format = refs.format?.value) {
    const normalized = normalizeDuration(value, format);
    if (normalized === "12m") return t("quick_draft_duration_12m");
    if (normalized === "140w") return t("quick_draft_words_140");
    if (normalized === "280w") return t("quick_draft_words_280");
    if (normalized === "500w") return t("quick_draft_words_500");
    return t("quick_draft_duration_7m");
  }

  function formatLabel(value = refs.format?.value) {
    const normalized = normalizeScenario(value);
    if (normalized === HANDS_ON_REVIEW_FORMAT) return t("quick_draft_format_hands_on_review");
    if (normalized === BILI_DYNAMIC_FORMAT) return t("quick_draft_format_bili_dynamic");
    return t("quick_draft_format_first_day");
  }

  function updateQuickDraftChromeSummary() {
    const body = String(refs.draft?.value || "");
    const title = String(titleFromBody(body) || refs.titleInput?.value || "").trim();
    const format = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
    const subject = title && title !== t("quick_draft_title") ? title : "";
    const topline = [formatLabel(format), durationLabel(refs.duration?.value, format), subject]
      .filter(Boolean)
      .join(" · ");
    if (refs.windowTitle) {
      const baseTitle = t("quick_draft_title");
      refs.windowTitle.textContent = subject ? `${baseTitle} · ${subject}` : baseTitle;
    }
    if (refs.titleDisplay) refs.titleDisplay.textContent = subject || t("quick_draft_untitled");
    if (refs.titleInput) refs.titleInput.value = subject || "";
    if (refs.firstDaySubject) refs.firstDaySubject.value = subject || "";
    if (refs.settingsSummary) {
      refs.settingsSummary.textContent = `${t("quick_draft_settings_card")}: ${topline || t("quick_draft_untitled")}`;
    }
  }

  function syncQuickDraftTemplateUi() {
    const format = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
    const launchDay = isLaunchDayFormat(format);
    const dynamic = format === BILI_DYNAMIC_FORMAT;
    const normalizedDuration = normalizeDuration(refs.duration?.value, format);
    refs.form?.classList.toggle("is-format-first-day", format === FIRST_DAY_FORMAT);
    refs.form?.classList.toggle("is-format-hands-on-review", format === HANDS_ON_REVIEW_FORMAT);
    refs.form?.classList.toggle("is-format-bili-dynamic", dynamic);
    setQuickDraftLabel(refs.lengthLabel, dynamic ? "quick_draft_word_count" : "quick_draft_duration");
    if (refs.duration && refs.duration.value !== normalizedDuration) {
      refs.duration.value = normalizedDuration;
    }
    refs.duration?.querySelectorAll("option").forEach((option) => {
      const kind = option.dataset.lengthKind || "duration";
      const visible = dynamic ? kind === "words" : kind === "duration";
      option.hidden = !visible;
      option.disabled = !visible;
    });
    if (refs.duration && refs.duration.value !== normalizedDuration) refs.duration.value = normalizedDuration;
    updateQuickDraftChromeSummary();
    if (refs.startState) {
      const data = firstDaySnapshot();
      const hasBody = Boolean(String(refs.draft?.value || "").trim());
      const hasSetupSeed = firstDaySeedValues(data).some((value) => String(value || "").trim());
      refs.startState.textContent = launchDay
        ? hasBody
          ? t("quick_draft_start_body_ready")
          : hasSetupSeed
          ? t("quick_draft_start_support_ready")
          : t("quick_draft_start_empty")
        : hasBody
        ? t("quick_draft_start_body_ready")
        : t("quick_draft_start_empty");
    }
    refreshQuickDraftSelectControls();
  }

  function setBusy(isBusy) {
    refs.form?.classList.toggle("is-busy", !!isBusy);
    // AI working state: a slow travelling edge light (Liquid) or moving dither
    // (Classic) over the editor — never a spinner on top of the text.
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
      refs.togglePreviewButton,
      refs.saveButton,
    ].forEach((button) => {
      if (button) button.disabled = !!isBusy;
    });
  }

  function markdownSlot(el, text) {
    if (!el) return;
    const value = String(text || "").trim();
    if (!value) {
      el.textContent = t("quick_draft_empty_slot");
      el.classList.add("is-empty");
      return;
    }
    el.classList.remove("is-empty");
    if (typeof markdownToSystemHtml === "function") {
      el.innerHTML = markdownToSystemHtml(value);
    } else {
      el.textContent = value;
    }
  }

  function attachQuickDraftMarkdownEditor() {
    if (typeof attachMarkdownEditor === "function") attachMarkdownEditor(refs.draft);
    if (typeof attachMarkdownHighlight === "function") attachMarkdownHighlight(refs.draft);
  }

  function renderQuickDraftPreview() {
    if (!refs.preview) return;
    const markdown = quickDraftDocumentMarkdown();
    refs.preview.innerHTML = markdown
      ? markdownToSystemHtml(markdown)
      : `<p class="empty-folder-note">${escapeHtml(t("teachtext_preview_empty"))}</p>`;
  }

  // ---- Compression grain -------------------------------------------------
  // A lossy rewrite leaves no visible seam: the model's replacement reads as
  // smoothly as the sentence it replaced. This view puts the seam back by
  // comparing the body against the human anchor (the writer's own text, kept
  // in workspace.humanAnchor before the first model rewrite). It is read-only
  // and lives in the preview pane — a textarea cannot paint one span darker
  // than another, and this must never become an editing surface.
  //
  // The pure text diff (tokenizing, block matching, survivor masks, run
  // collapsing) lives in app/core/grain-diff.js so the rounding rules are
  // executable in a test. This module keeps only the record-aware and
  // rendering layers.

  function quickDraftGrainRuns(anchorText = "", bodyText = "") {
    const body = String(bodyText || "");
    if (!body) return [];
    const model = grainBodyModel(body);
    if (!String(anchorText || "").trim()) {
      return [{ text: body, generation: 0, source: "author" }];
    }
    const mask = grainPresenceMask(anchorText, model);
    return grainRunsFromGenerations(model, mask.map((present) => (present ? 0 : 1)));
  }

  // Was a negative ever recorded? The timestamp answers it and the anchor text
  // does not: an empty anchor is a real negative, recorded when the first model
  // pass ran on a body the writer had not written yet. Testing the text instead
  // lets a later pass overwrite the negative with the model's own output.
  function hasRecordedNegative(record = activeProjectQuickDraft({ create: false })?.record) {
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    return Boolean(workspace.humanAnchorUpdatedAt) || Boolean(humanAnchorSnapshot(record));
  }

  function grainVersionChain(record) {
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    return grainChainFromRecordParts({
      humanAnchor: workspace.humanAnchor,
      humanAnchorUpdatedAt: workspace.humanAnchorUpdatedAt,
      dumps: dumpEntries(intakeSnapshot(record)).map((entry) => entry.text),
    });
  }

  function quickDraftGrainReport(record = activeProjectQuickDraft({ create: false })?.record) {
    const body = String(record ? normalizeQuickDraftWorkspace(record.workspace, record).body : refs.draft?.value || "");
    const chain = grainVersionChain(record);
    const model = grainBodyModel(body);
    const empty = {
      runs: [], body, hasAnchor: chain.passes > 0, authorRatio: 1, modelChars: 0, totalChars: 0, passes: chain.passes, deepest: 0,
    };
    if (!model.tokens.length) return empty;
    if (!chain.versions.length) {
      return { ...empty, runs: [{ text: body, generation: 0, source: "author" }], totalChars: grainVisibleLength(body) };
    }
    const runs = grainRunsFromGenerations(model, grainGenerations(model, chain));
    let author = 0;
    let rewritten = 0;
    let deepest = 0;
    for (const run of runs) {
      const length = grainVisibleLength(run.text);
      if (run.generation) {
        rewritten += length;
        if (length) deepest = Math.max(deepest, run.generation);
      } else {
        author += length;
      }
    }
    const total = author + rewritten;
    return {
      runs,
      body,
      hasAnchor: true,
      authorRatio: total ? author / total : 1,
      modelChars: rewritten,
      totalChars: total,
      passes: chain.passes,
      deepest,
    };
  }

  function renderQuickDraftGrain() {
    if (!refs.preview) return;
    const report = quickDraftGrainReport();
    if (!report.totalChars) {
      refs.preview.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("quick_draft_grain_empty"))}</p>`;
      return;
    }
    // The body is rendered line by line so a masked line can carry the layer's
    // margin marker. The provenance spans stay per token run; only their text
    // is split at newlines, so the rendered characters are unchanged.
    const maskEntries = grainMaskEntries(report.body);
    const maskedLines = new Set();
    maskEntries.forEach((entry) => entry.ranges.forEach((range) => {
      for (let line = range.start; line <= range.end; line += 1) maskedLines.add(line);
    }));
    // Protection is a property of the text: protected lines carry their own
    // margin mark, distinct from the per-layer mask and from provenance colour.
    const protectedLines = new Set();
    protectedRangesSnapshot().forEach((range) => {
      for (let line = range.start; line <= Math.min(range.end, report.body.split(/\n/).length); line += 1) protectedLines.add(line);
    });
    const bodyLines = [[]];
    report.runs.forEach((run) => {
      const className = run.generation ? "quick-draft-grain-model" : "quick-draft-grain-author";
      // The chip is for stacked passes only. Marking every rewritten span ×1
      // would put a badge on half the article and say nothing.
      const chip = run.generation > 1
        ? `<i class="quick-draft-grain-generation">&times;${run.generation}</i>`
        : "";
      const pieces = escapeHtml(run.text).split("\n");
      pieces.forEach((piece, index) => {
        const isLast = index === pieces.length - 1;
        if (piece) {
          bodyLines[bodyLines.length - 1].push(`<span class="${className}">${piece}${isLast ? chip : ""}</span>`);
        } else if (isLast && chip) {
          bodyLines[bodyLines.length - 1].push(chip);
        }
        if (!isLast) bodyLines.push([]);
      });
    });
    const body = bodyLines
      .map((pieces, lineIndex) => (
        `<span class="quick-draft-grain-line${maskedLines.has(lineIndex + 1) ? " is-masked" : ""}${protectedLines.has(lineIndex + 1) ? " is-protected" : ""}">${pieces.join("")}</span>`
      ))
      .join("\n");
    const note = report.hasAnchor ? "" : `<p class="quick-draft-grain-note">${escapeHtml(t("quick_draft_grain_untouched"))}</p>`;
    const maskSummary = maskEntries
      .map((entry) => `${escapeHtml(entry.label)} ${escapeHtml(adjustmentMaskSummary(entry.ranges))}`)
      .join(" · ");
    const protectedSummary = adjustmentMaskSummary(protectedRangesSnapshot());
    const readout = [
      `<span><b>${Math.round(report.authorRatio * 100)}%</b> ${escapeHtml(t("quick_draft_grain_negative"))}</span>`,
      `<span><b>${report.modelChars}</b> ${escapeHtml(t("quick_draft_grain_interpolated"))}</span>`,
      `<span><b>${report.passes}</b> ${escapeHtml(t("quick_draft_grain_passes"))}</span>`,
      report.deepest > 1
        ? `<span><b>&times;${report.deepest}</b> ${escapeHtml(t("quick_draft_grain_deepest"))}</span>`
        : "",
      maskSummary
        ? `<span><b>${escapeHtml(t("quick_draft_grain_mask"))}</b> ${maskSummary}</span>`
        : "",
      protectedSummary
        ? `<span><b>${escapeHtml(t("quick_draft_grain_protected"))}</b> ${protectedSummary}</span>`
        : "",
    ].join("");
    const legend = [
      `<span><i class="quick-draft-grain-swatch is-author"></i>${escapeHtml(t("quick_draft_grain_legend_author"))}</span>`,
      `<span><i class="quick-draft-grain-swatch is-model"></i>${escapeHtml(t("quick_draft_grain_legend_model"))}</span>`,
      report.deepest > 1
        ? `<span><i class="quick-draft-grain-generation">&times;n</i>${escapeHtml(t("quick_draft_grain_legend_generation"))}</span>`
        : "",
      protectedSummary
        ? `<span><i class="quick-draft-grain-swatch is-protected"></i>${escapeHtml(t("quick_draft_grain_legend_protected"))}</span>`
        : "",
    ].join("");
    refs.preview.innerHTML = [
      `<div class="quick-draft-grain-readout">${readout}</div>`,
      note,
      `<pre class="quick-draft-grain-body">${body}</pre>`,
      `<div class="quick-draft-grain-legend">${legend}</div>`,
    ].join("");
  }

  // ---- Non-destructive composition and develop ---------------------------
  // Body = negative + enabled adjustments applied in stored order. Each layer
  // reads the negative, never another layer's output, so every prefix of the
  // stack is its own cache key: computing the full stack caches every shorter
  // prefix, and switching the last layer off is a cache hit with no model
  // call. The pure rule lives in app/core/text-compose.js; this module keeps
  // the in-memory cache, the prompt, and the record writes.

  const quickDraftCompositeCache = new Map();
  let quickDraftLastComposite = "";
  let quickDraftLastCompositeKey = "";

  // The negative is the boundary composition reads from: the writer's own
  // text until the first model pass records an anchor, the stored anchor
  // after that. It is never rewritten.
  function quickDraftCompositeSource(record = activeProjectQuickDraft({ create: false })?.record) {
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    return hasRecordedNegative(record)
      ? workspace.humanAnchor
      : String(refs.draft?.value || workspace.body || "");
  }

  function enabledAdjustmentLayers(record = activeProjectQuickDraft({ create: false })?.record) {
    return adjustmentLayersSnapshot(record).filter((layer) => layer.enabled);
  }

  // The composite the preview should show right now. With no enabled layers
  // the current document body is the composite. With layers, the full-stack
  // composite comes from the cache (or the last Apply); anything else means
  // the stack changed and Apply must rerun — the view never shows a composite
  // that does not match the stack.
  function currentCompositeState(record = activeProjectQuickDraft({ create: false })?.record) {
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    const body = String(refs.draft?.value || workspace.body || "");
    const layers = enabledAdjustmentLayers(record);
    if (!layers.length) return { text: body, ready: true, stale: false };
    const source = quickDraftCompositeSource(record);
    const key = composeCacheKey({ source, layers, protectedRanges: protectedRangesSnapshot(record) });
    if (quickDraftCompositeCache.has(key)) {
      return { text: quickDraftCompositeCache.get(key), ready: true, stale: false };
    }
    if (quickDraftLastCompositeKey === key && quickDraftLastComposite) {
      return { text: quickDraftLastComposite, ready: true, stale: false };
    }
    // Nothing has ever been applied: the body is the honest composite — the
    // stack is declared but no adjustment has warmed up or changed anything.
    if (!quickDraftLastCompositeKey) {
      return { text: body, ready: true, stale: false };
    }
    return { text: quickDraftLastComposite || body, ready: false, stale: true };
  }

  function quickDraftMarkdownHtml(text = "", record = activeProjectQuickDraft({ create: false })?.record) {
    if (!refs.preview) return "";
    const value = String(text || "").trim();
    if (!value) return `<p class="empty-folder-note">${escapeHtml(t("teachtext_preview_empty"))}</p>`;
    const source = normalizeQuickDraftRecord(record);
    let markdown = value;
    if (!/^#\s+/m.test(value)) {
      const title = String(source.workspace.title || titleFromBody(value)).trim().replace(/\s+/g, " ").slice(0, 64) || t("quick_draft_title");
      markdown = [`# ${title}`, "", value].join("\n");
    }
    return markdownToSystemHtml(markdown);
  }

  function quickDraftMarkdownPreview(text = "") {
    if (!refs.preview) return;
    const html = quickDraftMarkdownHtml(text);
    refs.preview.innerHTML = html;
  }

  function renderQuickDraftCompositePreview() {
    const state = currentCompositeState();
    if (!state.ready) {
      refs.preview.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("quick_draft_composite_pending"))}</p>`;
      return;
    }
    quickDraftMarkdownPreview(state.text);
  }

  // 看片 — the reading view. The composite with no controls, no provenance
  // colour, full width; the one place where the writer can stop operating and
  // just read. The window frame switches to full width via .is-reading.
  function renderQuickDraftReadingView() {
    if (!refs.preview) return;
    const state = currentCompositeState();
    if (!state.ready) {
      refs.preview.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("quick_draft_composite_pending"))}</p>`;
      return;
    }
    refs.preview.innerHTML = `<div class="quick-draft-reading">${quickDraftMarkdownHtml(state.text)}</div>`;
  }

  function buildCompositionPrompt({ sourceText = "", protectedBlocks = [], layers = [] }) {
    const zh = currentLanguage === "zh";
    const firstDay = firstDaySnapshot();
    const targetFormat = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
    const targetDuration = normalizeDuration(refs.duration?.value, targetFormat);
    const formatText = formatLabel(targetFormat);
    const lengthText = durationLabel(targetDuration, targetFormat);
    const context = [
      `对象/标题：${meaningfulFirstDayTitle(firstDay.title) || firstDay.subject || titleFromBody(sourceText)}`,
      `稿件类型：${formatText}`,
      `目标长度：${lengthText}`,
    ].filter(Boolean).join("\n");
    const layerInstructions = layers
      .map((layer) => adjustmentLayerCompositionInstruction(layer, sourceText, zh))
      .filter(Boolean)
      .join("\n\n");
    return zh
      ? [
          "钟点稿非破坏调整合成：",
          "这是把下面的原稿按顺序应用已启用的调整层。你的任务是一遍完成全部调整，输出合成后的整篇正文。",
          context,
          "原稿（必须基于它改写，只改应改的部分）：",
          sourceText || "（原稿为空）",
          protectedPromptBlock(protectedBlocks, zh),
          "调整层（按此顺序应用）：",
          layerInstructions,
          "- 事实只来自素材区和原稿；不新增事实、不把没亲测写成体验、不丢地区/Beta/待核边界、不用风格覆盖事实。",
          "- 保留作者判断、具体细节和已写出的口气；不要只沿着上一版 AI 稿自我复制。",
          "- 只输出正文文本本身：不要 Markdown 标题、说明、列表、JSON 或后台标签；不要用“当然”“好的”“以下是”开头。",
          "- 受保护文字必须逐字保留在输出中。",
        ].filter(Boolean).join("\n\n")
      : [
          "Quick Draft non-destructive composition:",
          "Apply the enabled adjustment layers below to the source text, in order, in one pass, and return the full composed body.",
          context,
          "Source (rewrite from this; change only what a layer asks for):",
          sourceText || "(empty source)",
          protectedPromptBlock(protectedBlocks, zh),
          "Adjustment layers (apply in this order):",
          layerInstructions,
          "- Facts come only from the material pane and the source; do not add facts, do not turn untested material into experience, do not drop region/Beta/pending-check boundaries, and do not let style override facts.",
          "- Preserve the author's judgment, concrete detail, and written voice; do not self-replicate from a previous AI draft.",
          "- Output the body text only: no Markdown headings, notes, lists, JSON, or backstage labels; do not begin with 'Sure', 'Of course', or 'Here is'.",
          "- Protected text must appear verbatim in the output.",
        ].filter(Boolean).join("\n\n");
  }

  async function compositionModelCall({ key, source, sourceText, protectedBlocks, layers }) {
    const prompt = buildCompositionPrompt({ sourceText, protectedBlocks, layers });
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.4,
      max_tokens: 5200,
      ai_system6_task_kind: "mingming_rewrite",
      stream: false,
    }, requestController?.signal);
    if (!response.ok) {
      throw new Error(serviceErrorDetail(response.status, await response.text()));
    }
    const result = await response.json().catch(() => ({}));
    const raw = String(result?.choices?.[0]?.message?.content || "").trim();
    return cleanMingmingQuickDraftBody(raw);
  }

  // Apply the enabled stack: compute the composite for every prefix (caching
  // each) and show it. The body textarea is untouched until Develop.
  async function applyAdjustmentLayers() {
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const layers = enabledAdjustmentLayers(slot.record);
    if (!layers.length) {
      setQuickDraftStatus(t("quick_draft_apply_none"));
      return false;
    }
    const source = quickDraftCompositeSource(slot.record);
    if (!String(source || "").trim()) {
      setQuickDraftStatus(t("quick_draft_empty_body"));
      refs.draft?.focus();
      return false;
    }
    if (requestController) requestController.abort();
    requestController = new AbortController();
    setBusy(true);
    setQuickDraftStatus(t("quick_draft_applying"));
    try {
      const composed = await composeDocument({
        source,
        layers,
        protectedRanges: protectedRangesSnapshot(slot.record),
        cache: quickDraftCompositeCache,
        runModel: compositionModelCall,
      });
      quickDraftLastComposite = composed.text;
      quickDraftLastCompositeKey = composeCacheKey({
        source,
        layers,
        protectedRanges: composed.ranges,
      });
      saveQuickDraft({}, { debounce: false });
      renderQuickDraft(activeProjectQuickDraft({ create: false })?.record);
      const restored = composed.prefixes.some((prefix) => prefix.restored.length);
      setQuickDraftStatus(t(restored ? "quick_draft_protect_restored" : "quick_draft_apply_done"));
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") setQuickDraftStatus(t("quick_draft_failed", quickDraftFailureMessage(error)));
      return false;
    } finally {
      requestController = null;
      setBusy(false);
    }
  }

  // Develop is an explicit action, never a side effect of export: the current
  // composite is written into the body, the replaced body is left as a
  // version dump (rollback point), and the stack is cleared. The text stays.
  function developAdjustmentLayers() {
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const state = currentCompositeState(slot.record);
    if (!state.ready || !String(state.text || "").trim()) {
      setQuickDraftStatus(t("quick_draft_develop_none"));
      return false;
    }
    const composite = state.text;
    const previousBody = String(refs.draft?.value || slot.record.workspace.body || "").trim();
    const intake = intakeSnapshot(slot.record);
    const patch = { stage: "draft", workspace: {} };
    if (previousBody) {
      const dumpEntry = normalizeVentEntry({
        id: stableId("dump"),
        text: previousBody,
        createdAt: new Date().toISOString(),
        sourceKind: "quick-draft-dump",
      }, intake.ventLog.length);
      patch.workspace.intake = normalizeIntake({
        ...intake,
        ventLog: [...(intake.ventLog || []), dumpEntry],
      });
    }
    if (!hasRecordedNegative(slot.record)) {
      patch.workspace.humanAnchor = previousBody;
      patch.workspace.humanAnchorUpdatedAt = new Date().toISOString();
    }
    // Clearing the stack keeps the four layer rows but turns every layer off:
    // no enabled adjustment remains.
    patch.workspace.adjustmentLayers = normalizeAdjustmentLayers(
      adjustmentLayersSnapshot(slot.record).map((layer) => ({ ...layer, enabled: false }))
    );
    patch.workspace.body = composite;
    patch.workspace.title = titleFromBody(composite);
    refs.draft.value = composite;
    quickDraftLastComposite = "";
    quickDraftLastCompositeKey = "";
    const saved = saveQuickDraft(patch, { debounce: false });
    renderQuickDraft(saved);
    setQuickDraftStatus(t("quick_draft_develop_done"));
    return true;
  }

  function looksLikePlaceholderDraft(text = "") {
    const value = String(text || "");
    return /(?:请(?:您|你)?提供|此处需要|待填写|需要(?:您|你)?提供|placeholder)/i.test(value);
  }

  function comparableDraftText(text = "") {
    return String(text || "")
      .replace(/[\s　]+/g, "")
      .replace(/[，。！？、；：,.!?;:()[\]（）【】《》"'“”‘’`*_#>-]/g, "")
      .toLowerCase();
  }

  function hasMeaningfulDraftChange(previous = "", next = "") {
    const before = comparableDraftText(previous);
    const after = comparableDraftText(next);
    if (!before) return Boolean(after);
    if (!after || before === after) return false;
    const shorter = Math.min(before.length, after.length);
    const longer = Math.max(before.length, after.length);
    if (!longer) return false;
    const lengthDelta = Math.abs(after.length - before.length) / longer;
    if (lengthDelta >= 0.08) return true;
    let samePrefix = 0;
    while (samePrefix < shorter && before[samePrefix] === after[samePrefix]) samePrefix += 1;
    return samePrefix / shorter < 0.92;
  }

  function stripQuickDraftModelFence(markdown = "") {
    return String(markdown || "")
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }

  function cleanMingmingQuickDraftBody(markdown = "") {
    const source = stripQuickDraftModelFence(markdown);
    const lines = [];
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      const compact = line.trim();
      if (/^#{2,6}\s+/.test(compact)) continue;
      if (/^(?:修改说明|分析|交接清单|大纲表|审校报告|版本\s*\d+)\s*[:：]?$/.test(compact)) continue;
      lines.push(line);
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  let quickDraftPreviewMode = "render";

  function renderQuickDraftPreviewPane() {
    if (quickDraftPreviewMode === "grain") renderQuickDraftGrain();
    else if (quickDraftPreviewMode === "composite") renderQuickDraftReadingView();
    else renderQuickDraftCompositePreview();
  }

  function syncQuickDraftPreviewButtons(active) {
    const previewing = active && quickDraftPreviewMode === "render";
    const graining = active && quickDraftPreviewMode === "grain";
    const reading = active && quickDraftPreviewMode === "composite";
    refs.togglePreviewButton?.classList.toggle("is-active", previewing);
    refs.togglePreviewButton?.setAttribute("aria-pressed", previewing ? "true" : "false");
    refs.toggleGrainButton?.classList.toggle("is-active", graining);
    refs.toggleGrainButton?.setAttribute("aria-pressed", graining ? "true" : "false");
    refs.toggleCompositeButton?.classList.toggle("is-active", reading);
    refs.toggleCompositeButton?.setAttribute("aria-pressed", reading ? "true" : "false");
    getWindow("quickDraft")?.classList.toggle("is-reading", reading);
  }

  function setQuickDraftPreviewMode(mode) {
    const container = refs.draft?.closest(".teachtext-editor-container");
    if (!container || !refs.preview || !refs.draft) return;
    const wasActive = container.classList.contains("is-previewing");
    const active = !(wasActive && quickDraftPreviewMode === mode);
    quickDraftPreviewMode = mode;
    container.classList.toggle("is-previewing", active);
    container.classList.toggle("is-graining", active && mode === "grain");
    refs.preview.classList.toggle("is-hidden", !active);
    refs.preview.classList.toggle("quick-draft-grain-pane", active && mode === "grain");
    refs.draft.classList.toggle("is-hidden", active);
    syncQuickDraftPreviewButtons(active);
    if (active) {
      renderQuickDraftPreviewPane();
    } else {
      quickDraftPreviewMode = "render";
      refs.draft.focus();
    }
  }

  function toggleQuickDraftPreview() {
    setQuickDraftPreviewMode("render");
  }

  function toggleQuickDraftGrain() {
    setQuickDraftPreviewMode("grain");
  }

  function toggleQuickDraftComposite() {
    setQuickDraftPreviewMode("composite");
  }

  // One key out: Escape leaves any preview mode back to the editor. The
  // toggle in setQuickDraftPreviewMode only exits when the pressed mode is
  // the active one; Escape must leave regardless of which mode is showing.
  function leaveQuickDraftPreview() {
    const container = refs.draft?.closest(".teachtext-editor-container");
    if (!container || !refs.preview || !refs.draft) return;
    quickDraftPreviewMode = "render";
    container.classList.remove("is-previewing", "is-graining");
    refs.preview.classList.add("is-hidden");
    refs.preview.classList.remove("quick-draft-grain-pane");
    refs.draft.classList.remove("is-hidden");
    syncQuickDraftPreviewButtons(false);
    if (quickDraftSurfaceMode === "canvas") {
      refs.canvas?.classList.remove("is-hidden");
    } else {
      refs.draft.focus();
    }
  }

  // ---- 拼台 (task 8): the single-object canvas ---------------------------
  // The article is an ordered path through objects; Phase 1 has exactly one
  // text object holding the draft. The object level carries only the visual
  // transform (position, size, angle) — separate from the semantic adjustment
  // stack, with a separate history — and the text stays in workspace.body:
  // the canvas object is a view of the same Markdown.
  //
  // Which view opens follows the state of the work, not a setting: no
  // material and no draft means the intake surface (today's linear two-pane),
  // a draft means the article view, more material than article means the
  // canvas. This is an empty-state rule, never a mode switch, and a manual
  // view choice is never yanked back. No canvas on a phone.

  let quickDraftSurfaceMode = "linear";
  let quickDraftSurfaceManual = false;
  let quickDraftEditingCanvasObject = false;

  function quickDraftMaterialChars(record = activeProjectQuickDraft({ create: false })?.record) {
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    const pieces = [
      workspace.toolInputs.pastedSources,
      (workspace.intake?.ventLog || []).map((entry) => entry.text).join("\n"),
      (workspace.intake?.chatMaterials || []).map((entry) => entry.text).join("\n"),
      workspace.intake?.outlineSeed || "",
      workspace.strategyReport?.editorial || "",
      workspace.strategyReport?.materialLedger || "",
      workspace.strategyReport?.adoptionTable || "",
    ];
    return pieces.join("\n").length;
  }

  function quickDraftCanvasSuggests(record = activeProjectQuickDraft({ create: false })?.record) {
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    const body = String(workspace.body || "").trim();
    if (!body) return false;
    return quickDraftMaterialChars(record) > body.length;
  }

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

  function renderQuickDraftCanvas(record = activeProjectQuickDraft({ create: false })?.record) {
    if (!refs.canvasObject) return;
    const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
    const canvas = normalizeQuickDraftCanvas(workspace.canvas);
    const object = canvas.objects[0];
    if (!object) return;
    refs.canvasObject.dataset.quickDraftCanvasObject = object.id;
    refs.canvasObject.classList.toggle("is-selected", canvas.path[0] === object.id);
    refs.canvasObject.style.setProperty("--canvas-x", `${object.x}px`);
    refs.canvasObject.style.setProperty("--canvas-y", `${object.y}px`);
    refs.canvasObject.style.setProperty("--canvas-w", `${object.width}px`);
    refs.canvasObject.style.setProperty("--canvas-h", `${object.height || 0}px`);
    refs.canvasObject.style.setProperty("--canvas-angle", `${object.angle}deg`);
    const textEl = refs.canvasObject.querySelector("[data-quick-draft-canvas-object-text]");
    if (textEl) {
      const body = String(workspace.body || "").trim();
      textEl.textContent = body || t("quick_draft_canvas_empty");
      textEl.classList.toggle("is-empty", !body);
    }
    if (refs.canvasAngle) refs.canvasAngle.textContent = `${object.angle}°`;
  }

  function bindQuickDraftCanvasInteractions() {
    const objectEl = refs.canvasObject;
    if (!objectEl || objectEl.dataset.canvasBound) return;
    objectEl.dataset.canvasBound = "true";

    const beginDrag = (event, mode, handle = "") => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      const slot = activeProjectQuickDraft();
      if (!slot) return;
      const canvas = normalizeQuickDraftCanvas(slot.record.workspace.canvas);
      const object = canvas.objects[0];
      if (!object) return;
      objectEl.classList.add("is-selected");
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = object.x;
      const startTop = object.y;
      const startWidth = object.width;
      const startHeight = object.height || 0;
      const startAngle = object.angle;
      const rect = objectEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const grabAngle = Math.atan2(startY - centerY, startX - centerX) * 180 / Math.PI + 90;

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (mode === "move") {
          objectEl.style.setProperty("--canvas-x", `${Math.round(startLeft + dx)}px`);
          objectEl.style.setProperty("--canvas-y", `${Math.round(startTop + dy)}px`);
          return;
        }
        if (mode === "rotate") {
          const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI + 90;
          const angle = Math.round((startAngle + currentAngle - grabAngle) * 10) / 10;
          objectEl.style.setProperty("--canvas-angle", `${angle}deg`);
          if (refs.canvasAngle) refs.canvasAngle.textContent = `${angle}°`;
          return;
        }
        const hHandle = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
        const vHandle = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
        if (hHandle !== 0) {
          const width = Math.max(160, Math.round(startWidth + hHandle * dx));
          objectEl.style.setProperty("--canvas-w", `${width}px`);
          if (hHandle < 0) objectEl.style.setProperty("--canvas-x", `${Math.round(startLeft + dx)}px`);
        }
        if (vHandle !== 0) {
          const baseHeight = startHeight || Math.max(96, Math.round(rect.height));
          const height = Math.max(96, Math.round(baseHeight + vHandle * dy));
          objectEl.style.setProperty("--canvas-h", `${height}px`);
        }
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const nextObject = {
          ...object,
          x: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-x")) || object.x),
          y: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-y")) || object.y),
          width: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-w")) || object.width),
          height: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-h")) || object.height || 0),
          angle: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-angle")) || object.angle),
        };
        const next = normalizeQuickDraftCanvas({
          ...normalizeQuickDraftCanvas(slot.record.workspace.canvas),
          objects: [nextObject],
        });
        saveQuickDraft({ workspace: { canvas: next } }, { debounce: false });
        renderQuickDraftCanvas(activeProjectQuickDraft({ create: false })?.record);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };

    objectEl.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-quick-draft-canvas-handle]")) return;
      if (event.target.closest("[data-quick-draft-canvas-rotate]")) return;
      beginDrag(event, "move");
    });
    objectEl.querySelectorAll("[data-quick-draft-canvas-handle]").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        beginDrag(event, "resize", handle.dataset.quickDraftCanvasHandle);
      });
    });
    objectEl.querySelector("[data-quick-draft-canvas-rotate]")?.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      beginDrag(event, "rotate");
    });
    // Two-level editing: double click enters the object, which expands to a
    // comfortable linear measure (the article view) and the writer types
    // normally; Escape returns to object level.
    objectEl.addEventListener("dblclick", () => {
      quickDraftEditingCanvasObject = true;
      setQuickDraftSurface("linear");
      requestAnimationFrame(() => {
        refs.draft?.focus();
        if (refs.draft) refs.draft.scrollTop = 0;
      });
    });
  }

  function mountedSourceRecords() {
    if (!mountedTextDisk || mountedTextDisk.projectId !== activeProjectId) return [];
    return mountedTextDisk.files
      .map((name, index) => {
        const text = String(mountedTextDisk.fileBodies[name] || "").trim();
        if (!text) return null;
        return {
          id: `M${index + 1}`,
          label: name,
          text: text.length > 12000 ? `${text.slice(0, 12000)}\n\n[...]` : text,
        };
      })
      .filter(Boolean);
  }

  function intakeSourceRecords() {
    const intake = intakeSnapshot();
    const records = [];
    if (intake.ventLog.length) {
      records.push({
        id: "V1",
        label: t("quick_draft_vent_source_label"),
        text: intake.ventLog
          .map((entry, index) => `${index + 1}. ${entry.text}`)
          .join("\n")
          .slice(0, 12000),
      });
    }
    intake.chatMaterials.forEach((item, index) => {
      records.push({
        id: `C${index + 1}`,
        label: `${t("quick_draft_chat_source_label")} / ${item.name}`,
        text: String(item.text || "").slice(0, 12000),
        sourceKind: item.sourceKind,
        platform: item.platform,
      });
    });
    if (intake.outlineSeed.trim()) {
      records.push({
        id: "G1",
        label: t("quick_draft_outline_seed"),
        text: intake.outlineSeed.slice(0, 12000),
      });
    }
    return records;
  }

  function sourceRecordsFromForm() {
    const sources = [];
    if (isLaunchDayFormat()) {
      const firstDay = firstDaySnapshot();
      const pasted = String(refs.sources?.value || "").trim();
      if (pasted) {
        sources.push({
          id: "P1",
          label: currentLanguage === "zh" ? "素材" : "Material",
          text: pasted.length > 12000 ? `${pasted.slice(0, 12000)}\n\n[...]` : pasted,
        });
      }
      [
        { id: "H1", label: t("quick_draft_first_day_annotated_hands_on"), text: firstDay.handsOnNotes },
        { id: "A1", label: t("quick_draft_audience_concerns"), text: firstDay.audienceConcerns },
        { id: "O1", label: t("quick_draft_first_day_annotated_official"), text: firstDay.officialMaterials },
        { id: "N1", label: t("quick_draft_first_day_annotated_followup"), text: firstDay.unavailableNotes },
        { id: "I1", label: t("quick_draft_first_impression"), text: firstDay.firstImpression },
      ].forEach((source) => {
        const text = String(source.text || "").trim();
        if (text) sources.push({ ...source, text: text.length > 12000 ? `${text.slice(0, 12000)}\n\n[...]` : text });
      });
      sources.push(...intakeSourceRecords());
      sources.push(...mountedSourceRecords());
      return sources;
    }
    const pasted = String(refs.sources?.value || "").trim();
    if (pasted) {
      sources.push({
        id: "P1",
        label: currentLanguage === "zh" ? "粘贴资料" : "Pasted sources",
        text: pasted.length > 12000 ? `${pasted.slice(0, 12000)}\n\n[...]` : pasted,
      });
    }
    sources.push(...mountedSourceRecords());
    return sources;
  }

  function formatQuickDraftSourcesForMingming(sources = []) {
    return sources
      .map((source, index) => {
        const id = source.id || `S${index + 1}`;
        const label = source.label || id;
        const text = String(source.text || "").trim();
        return text ? `[${id}] ${label}\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function updateSourceCount() {
    const count = sourceRecordsFromForm().length;
    const label = t("quick_draft_source_count", count);
    if (refs.sourceCount) refs.sourceCount.textContent = label;
    if (refs.sourceSummary) refs.sourceSummary.textContent = label;
  }

  function renderSourceMap(record = normalizeQuickDraftRecord(), sources = sourceRecordsFromForm()) {
    if (!refs.sourceMap) return;
    refs.sourceMap.replaceChildren();
    const map = Array.isArray(record.sourceMap) && record.sourceMap.length
      ? record.sourceMap
      : sources.map((source) => ({ id: source.id, label: source.label }));

    if (!map.length) {
      const empty = document.createElement("span");
      empty.className = "quick-draft-source-empty";
      empty.textContent = t("quick_draft_empty_slot");
      refs.sourceMap.append(empty);
      return;
    }

    map.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn mini-btn quick-draft-source-chip";
      button.dataset.sourceLabel = item.label || item.id || "";
      button.textContent = item.label || item.id || "S";
      refs.sourceMap.append(button);
    });

    const preview = document.createElement("pre");
    preview.className = "quick-draft-source-preview";
    preview.textContent = "";
    refs.sourceMap.append(preview);
  }

  function hasEvidence(record) {
    return Boolean(
      String(record.brief?.support || "").trim()
      || String(record.brief?.counter || "").trim()
      || String(record.brief?.uncertainty || "").trim()
      || String(record.risks || "").trim()
      || (Array.isArray(record.sourceMap) && record.sourceMap.length)
    );
  }

  function hasOrganizedCards(record = normalizeQuickDraftRecord()) {
    const source = normalizeQuickDraftRecord(record);
    const tools = source.workspace.toolInputs;
    const intake = source.workspace.intake;
    return Boolean(
      hasEvidence(source)
      || hasStrategyReport(source)
      || String(tools.officialMaterials || "").trim()
      || String(tools.unavailableNotes || "").trim()
      || String(tools.audienceConcerns || "").trim()
      || String(intake.outlineSeed || "").trim()
    );
  }

  function renderQuickDraft(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
    collectRefs();
    if (!refs.form) return;
    const source = normalizeQuickDraftRecord(record);
    refs.titleInput.value = source.workspace.title || titleFromBody(source.workspace.body);
    if (refs.thesis) refs.thesis.value = source.thesis;
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
    renderSourceMap(source);
    if (refs.tools) refs.tools.open = false;
    if (refs.aiCards) {
      refs.aiCards.open = false;
      refs.aiCards.hidden = !hasOrganizedCards(source);
    }
    setPostDraftChipsVisible(source.stage === "draft");
    updateSourceCount();
    updateDraftStats();
    setSaveState(source.workspace.savedStatus);
    setQuickDraftStatus(t(source.workspace.savedStatus === "modified" ? "quick_draft_modified_state" : "quick_draft_saved_state"));
    refreshQuickDraftSelectControls();
    renderAdjustmentLayers(source);
    renderProtectedRangeControls(source);
    if (quickDraftSurfaceMode === "canvas") renderQuickDraftCanvas(source);
    refs.articleViewButton?.classList.toggle("is-active", quickDraftSurfaceMode !== "canvas");
    refs.canvasViewButton?.classList.toggle("is-active", quickDraftSurfaceMode === "canvas");
    // A model pass rewrites the body under an open preview; the grain view is
    // the one that must not go stale, since it reports on that very rewrite.
    if (refs.draft?.closest(".teachtext-editor-container")?.classList.contains("is-previewing")) {
      renderQuickDraftPreviewPane();
    }
  }

  function activeModelPayload() {
    if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady()) {
      return {
        provider: "cloud",
        ...cloudCredentialTransportFields(),
        _cloud_base_url: cloudConfig.baseUrl,
        _cloud_model: cloudConfig.model || "",
      };
    }
    return {
      model: modelInput?.value?.trim() || "",
      _local_provider: document.getElementById("local-provider")?.value || "lm-studio",
      _local_endpoint: endpointInput?.value?.trim() || "",
    };
  }

  function nextActionNote(kind) {
    const zh = currentLanguage === "zh";
    const notes = {
      spoken: zh ? "把当前正文改得更像当天录制的自然口播，减少书面总结感。" : "Make the current body more naturally spoken for same-day recording.",
      shorten: zh ? "在不改事实边界和个人判断的前提下缩短约 30%。" : "Shorten by about 30% without changing fact boundaries or personal judgment.",
      hook: zh ? "补一个现场感开头钩子，但不要制造无来源的事实。" : "Add a stronger opening hook without inventing unsourced facts.",
      closing: zh ? "补一个简短收束结尾，适合视频直接录完。" : "Add a brief closing that can end the recorded video cleanly.",
      boundary: zh ? "给正文补边界标注：哪些是亲测、哪些来自资料、哪些只是推测、哪些要后测。" : "Add boundary notes: first-hand, sourced, inferred, and needs follow-up testing.",
      counter: zh ? "加入一句反方观点或反例，并明确它和用户观点的关系。" : "Add one counterline or counter-example and clarify how it relates to the user's thesis.",
      mingming: zh
        ? "代入铭铭视角做首发快审：检查当前稿是否能拍、能念、能成立。输出到 ClioTalk：前两句重点、视频感、可拍画面、废话密度、AI 嘴替痕迹，以及最轻量的修改建议。不要直接重写正文，务必保留用户原始判断和已写出的口气。"
        : "Run a Mingming-perspective launch-day pass. Output ClioTalk notes: whether it is shootable, speakable, and defensible; first-two-sentence focus, video feel, shootable moments, filler density, AI-mouthpiece residue, and light edits. Do not rewrite the body; preserve the user's judgment and voice.",
      luoluo: zh
        ? "用“若是落落会怎么接”的接收视角做快稿交付检查：输出到 ClioTalk。先给情绪价值，再守事实底线；指出哪里更容易接、哪里有压力、哪里需要更顺口。不要直接重写正文，不要输出私人关系建议或后台审校术语。"
        : "Use a 'how Luoluo would receive it' lens and output ClioTalk notes. Give emotional value first, then protect factual guardrails; note what is easy to receive, what creates pressure, and what should sound smoother. Do not rewrite the body or output private relationship advice.",
      hkrr: zh
        ? "用 HKRR 快速提亮首发稿，输出到 ClioTalk：Happiness=发现感/趣味/反直觉，Knowledge=信息增量/人话解释，Resonance=人的感受，Rhythm=节奏/呼吸/转场。给具体可采用建议，不直接改正文，不做长篇 HKRR 分析。"
        : "Use HKRR to lift this launch draft and output ClioTalk notes: Happiness=discovery/interest/counterintuition, Knowledge=plain information gain, Resonance=human feeling, Rhythm=breathing and transitions. Give concrete adoptable suggestions; do not rewrite the body or write a long HKRR analysis.",
      praise: zh
        ? "夸夸 Aaron，也夸落落，而且要真的让 Aaron 开心：落落是男生，只能用“他/他的”，禁止用“她/她的”。具体看见 Aaron 已经做成的判断、心意、给落落的认真交付，以及稿子里已经成立的地方；也要具体看见落落值得被这样认真对待的表达、审美、频道和观众感。再给 3 个最轻量的下一步。输出到 ClioTalk，不要重写正文，不要泛泛鸡汤，不要说教。"
        : "Encourage Aaron and Luoluo in a way that genuinely lifts Aaron: specifically notice Aaron's judgment, care, serious handoff to Luoluo, and what is already working in the draft; also notice why Luoluo is worth this serious care: expression, taste, channel, and audience sense. Then give 3 light next steps. Output to ClioTalk, do not rewrite the body, do not give generic pep talk, and do not lecture.",
      "strategy-check": zh
        ? "只做内容 diff，不重写正文：检查当前稿是否接住出稿取舍、素材池、可拍画面和未测边界，并更新稿里怎么处理。"
        : "Content diff only; do not rewrite the body. Check whether the draft follows the editorial strategy, material pool, shootable moments, and untested boundaries, then update the strategy adoption table.",
    };
    return notes[kind] || "";
  }

  async function requestQuickDraft(stage = "brief", options = {}) {
    const targetFormat = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
    const launchDayMode = isLaunchDayFormat(targetFormat);
    const ventOutlineTask = isVentOutlineTask(options);
    const firstDay = firstDaySnapshot();
    const thesis = launchDayMode ? firstDayThesisText(firstDay) : String(refs.thesis?.value || "").trim();
    const currentBody = String(refs.draft?.value || "").trim();
    const intake = intakeSnapshot();
    const hasIntakeMaterial = intake.ventLog.length || intake.chatMaterials.length || intake.outlineSeed.trim();
    const hasMaterialPaneInput = Boolean(String(refs.sources?.value || "").trim());
    const taskKind = quickDraftTaskKind(options);
    if (launchDayMode && ventOutlineTask && !hasIntakeMaterial && !hasMaterialPaneInput) {
      setQuickDraftStatus(t("quick_draft_vent_missing"));
      return false;
    }
    const hasFirstDaySeed = currentBody
      || firstDaySeedValues(firstDay).some((value) => String(value || "").trim())
      || hasIntakeMaterial
      || hasMaterialPaneInput;
    if (launchDayMode && !ventOutlineTask && !hasFirstDaySeed) {
      setQuickDraftStatus(t("quick_draft_missing_first_day"));
      refs.draft?.focus();
      return false;
    }
    if (!launchDayMode && !thesis && !currentBody) {
      setQuickDraftStatus(t("quick_draft_missing_thesis"));
      if (refs.tools) refs.tools.open = true;
      refs.thesis?.focus();
      return false;
    }

    if (requestController) requestController.abort();
    requestController = new AbortController();
    saveQuickDraft({}, { debounce: false });
    setBusy(true);
    setQuickDraftStatus(ventOutlineTask
      ? t("quick_draft_collecting_vent")
      : stage === "draft"
      ? t(launchDayMode ? "quick_draft_writing_first_day" : "quick_draft_writing")
      : taskKind === "praise"
      ? t("quick_draft_praising")
      : t("quick_draft_checking"));

    try {
      const sourceRecords = sourceRecordsFromForm();
      const taskPrefix = taskKind ? `[taskKind:${taskKind}] ` : "";
      const routeFormat = effectiveRouteFormat(targetFormat);
      const targetDuration = normalizeDuration(refs.duration?.value, targetFormat);
      const existingHumanAnchor = humanAnchorSnapshot();
      const humanAnchor = existingHumanAnchor || currentBody;
      const protectedRanges = protectedRangesSnapshot();
      const subtracted = subtractProtectedRanges(currentBody, protectedRanges);
      const payload = {
        ...activeModelPayload(),
        stage,
        language: currentLanguage,
        taskKind,
        thesis: launchDayMode ? (currentBody || thesis) : (thesis || currentBody),
        currentBody: subtracted.sourceText,
        authorDraft: subtracted.sourceText,
        humanAnchor,
        protectedRanges,
        protectedBlocks: subtracted.protectedBlocks,
        adjustmentLayers: adjustmentLayersSnapshot(),
        targetFormat: routeFormat,
        displayFormat: targetFormat,
        launchDaySubtype: launchDayMode ? launchDaySubtype(targetFormat) : "",
        targetDuration,
        targetWordCount: targetDuration.endsWith("w") ? Number(targetDuration.replace(/\D/g, "")) || 0 : 0,
        styleLens: launchDayMode ? "luoluo-spoken" : "",
        title: meaningfulFirstDayTitle(firstDay.title),
        subject: firstDay.subject,
        handsOnNotes: firstDay.handsOnNotes,
        officialMaterials: firstDay.officialMaterials,
        unavailableNotes: firstDay.unavailableNotes,
        audienceConcerns: firstDay.audienceConcerns,
        firstImpression: firstDay.firstImpression,
        tone: refs.tone?.value || "",
        mustInclude: refs.mustInclude?.value || "",
        mustAvoid: refs.mustAvoid?.value || "",
        pastedSources: String(refs.sources?.value || "").trim(),
        userNotes: `${taskPrefix}${options.userNotes || ""}`.trim(),
        intake,
        ventLog: intake.ventLog,
        chatMaterials: intake.chatMaterials,
        outlineSeed: intake.outlineSeed,
        strategyReport: strategySnapshot(),
        sources: sourceRecords,
      };

      let data;
      if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady()) {
        const response = await fetch("/api/draft/thesis", {
          method: "POST",
          signal: requestController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
      } else {
        const result = await sendLocalModelTask({
          payload: {
            model: payload.model || getLocalModelRequestName(),
            messages: window.AISystem6ModelTaskRuntime.buildQuickDraftMessages(payload),
            temperature: 0.35,
            max_tokens: 5200,
            stream: false,
            ai_system6_task_kind: taskKind || "quick-draft",
          },
          signal: requestController.signal,
          taskKind: taskKind || "quick-draft",
          streamPreference: "json",
        });
        data = window.AISystem6LocalLMStudio.parseJsonText(result.text);
        if (!data || typeof data !== "object") throw new Error("Quick Draft model returned invalid JSON.");
      }

      const annotations = {
        firsthand: String(data.brief?.support || ""),
        official: String(data.brief?.counter || ""),
        uncertainty: String(data.brief?.uncertainty || ""),
        followup: String(data.risks || ""),
      };
      const responseIntake = data.intake && typeof data.intake === "object" ? data.intake : {};
      const responseStrategyReport = normalizeStrategyReport(data.strategyReport);
      const strategyReport = hasStrategyReportValue(responseStrategyReport)
        ? responseStrategyReport
        : strategySnapshot();
      const nextIntake = ventOutlineTask
        ? normalizeIntake({
          ...intake,
          stanceCandidates: Array.isArray(responseIntake.stanceCandidates)
            ? responseIntake.stanceCandidates
            : intake.stanceCandidates,
          outlineSeed: String(responseIntake.outlineSeed || data.brief?.outline || intake.outlineSeed || ""),
        })
        : intake;
      const patch = {
        stage: data.stage || stage,
        brief: {
          ...emptyBrief,
          ...(data.brief && typeof data.brief === "object" ? data.brief : {}),
        },
        risks: String(data.risks || ""),
        sourceMap: Array.isArray(data.sourceMap) ? data.sourceMap : [],
        raw: String(data.raw || ""),
        workspace: {
          annotations,
          intake: nextIntake,
          strategyReport,
          sourceMap: Array.isArray(data.sourceMap) ? data.sourceMap : [],
        },
      };
      let protectedRestored = false;
      if (stage === "draft" && data.draft) {
        if (looksLikePlaceholderDraft(data.draft)) {
          setQuickDraftStatus(t("quick_draft_placeholder_draft_rejected"));
          patch.workspace.annotations = {
            ...annotations,
            followup: annotations.followup || t("quick_draft_placeholder_draft_rejected"),
          };
          saveQuickDraft(patch, { debounce: false });
          renderQuickDraft(activeProjectQuickDraft({ create: false })?.record);
          return false;
        }
        const previousBody = String(refs.draft?.value || "").trim();
        const nextBody = String(data.draft || "").trim();
        const enforced = restoreProtectedRanges(nextBody, previousBody, protectedRanges);
        const finalBody = enforced.text;
        protectedRestored = enforced.restored.length > 0;
        if (previousBody && !hasMeaningfulDraftChange(previousBody, finalBody)) {
          saveQuickDraft(patch, { debounce: false });
          setQuickDraftStatus(t("quick_draft_no_revision"));
          return false;
        }
        // The dump stays guarded by previousBody — an empty dump entry would
        // carry no version — but the anchor is the boundary the negative is
        // measured from, so it is recorded on the first model pass even when
        // the writer had written nothing yet. An empty anchor with a timestamp
        // still means "one pass wrote all of this".
        if (previousBody) {
          const dumpEntry = normalizeVentEntry({
            id: stableId("dump"),
            text: previousBody,
            createdAt: new Date().toISOString(),
            sourceKind: "quick-draft-dump",
          }, intake.ventLog.length);
          patch.workspace.intake = normalizeIntake({
            ...nextIntake,
            ventLog: [...(nextIntake.ventLog || []), dumpEntry],
          });
        }
        if (!hasRecordedNegative()) {
          patch.workspace.humanAnchor = previousBody;
          patch.workspace.humanAnchorUpdatedAt = new Date().toISOString();
        }
        refs.draft.value = finalBody;
        patch.draft = refs.draft.value;
        patch.workspace.body = refs.draft.value;
        patch.workspace.title = titleFromBody(refs.draft.value);
      }
      if (stage === "draft" && !patch.workspace.body) {
        saveQuickDraft(patch, { debounce: false });
        setQuickDraftStatus(t("quick_draft_parse_failed"));
        return false;
      }
      if (stage !== "draft") {
        const appended = await appendCommandResultToClioTalk(data, taskKind);
        if (!appended) {
          saveQuickDraft(patch, { debounce: false });
          setQuickDraftStatus(t("quick_draft_command_empty"));
          return false;
        }
      }
      const saved = saveQuickDraft(patch, { debounce: false });
      renderQuickDraft(saved);
      setQuickDraftStatus(t(protectedRestored ? "quick_draft_protect_restored" : "quick_draft_done"));
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") {
        setQuickDraftStatus(t("quick_draft_failed", quickDraftFailureMessage(error)));
      }
      return false;
    } finally {
      requestController = null;
      setBusy(false);
    }
  }

  function buildQuickDraftMingmingPrompt({ firstDay, sources, targetFormat, targetDuration, currentBody, humanAnchor, protectedBlocks = [] }) {
    const sourceContext = formatQuickDraftSourcesForMingming(sources);
    const formatText = formatLabel(targetFormat);
    const lengthText = durationLabel(targetDuration, targetFormat);
    const strategy = strategySnapshot();
    const intake = intakeSnapshot();
    const targetConstraint = targetDuration.endsWith("w")
      ? `- 目标是 ${formatText}，约 ${targetDuration.replace(/\D/g, "")} 字；必须像 B 站动态，不要写成视频分镜或长口播。`
      : `- 目标是 ${formatText}，${lengthText}；必须能当天直接录，不要写成文章、报告或发布会流水账。`;
    const questionSheet = [
      `对象/标题：${meaningfulFirstDayTitle(firstDay.title) || firstDay.subject || titleFromBody(currentBody)}`,
      `稿件类型：${formatText}`,
      `目标长度：${lengthText}`,
      firstDay.firstImpression ? `作者第一判断：${firstDay.firstImpression}` : "",
      refs.tone?.value ? `口气要求：${refs.tone.value}` : "",
      refs.mustInclude?.value ? `必须保留：${refs.mustInclude.value}` : "",
      refs.mustAvoid?.value ? `必须避开：${refs.mustAvoid.value}` : "",
    ].filter(Boolean).join("\n");
    const projectContext = [
      targetConstraint,
      "- 这是钟点稿主写作入口：目标是尽快得到一版可发布/可录的正文，不要输出研究流程、建议卡、交接清单或多版本。",
      "- 事实只来自素材区、聊天记录、树洞、当前正文和已挂载材料；不确定的技术机制、地区可用性、Beta 限制必须标成待核或干脆不写。",
      "- 发布会速记要做结构转换：发布会顺序 -> 可展示内容 -> 观众关心点 -> 还没法展示/没亲测的边界 -> 发布会快速过 -> 个人感受 -> 口播稿。",
      "- 落落是男生；涉及落落时只能用“他/他的”，禁止用“她/她的”。",
      "- 钟点稿正文区不分章节：第一行可以用一个 Markdown H1 标题，正文不要输出 ## 二级标题、表格、项目符号或后台标签，只写自然段口播。",
      currentBody ? "- 本次是基于当前正文的迭代打磨：至少改善开头钩子、视频顺序、口播节奏或素材取舍；不能只返回旧正文。" : "",
      humanAnchor ? "- 人的原稿锚点优先：保留用户原始判断、犹豫、吐槽和已经写出的口气；不能只沿着上一版 AI 稿自我复制。" : "",
      (adjustmentLayerState("mingming")?.enabled
        ? adjustmentStrengthPromptLine(adjustmentLayerState("mingming").strength, currentLanguage === "zh")
        : ""),
      strategy.editorial ? `出稿取舍：\n${strategy.editorial}` : "",
      strategy.materialLedger ? `素材处理：\n${strategy.materialLedger}` : "",
      strategy.adoptionTable ? `稿里怎么处理：\n${strategy.adoptionTable}` : "",
      intake.outlineSeed ? `已有可讲点/骨架：\n${intake.outlineSeed}` : "",
    ].filter(Boolean).join("\n\n");
    const outline = [
      currentBody ? `当前正文：\n${currentBody}` : "",
      humanAnchor && humanAnchor !== currentBody ? `人的原稿锚点：\n${humanAnchor}` : "",
      protectedBlocks.length ? protectedPromptBlock(protectedBlocks, currentLanguage === "zh") : "",
      sourceContext ? `素材池：\n${sourceContext}` : "",
    ].filter(Boolean).join("\n\n");
    return `${buildMingmingRewritePrompt({
      questionSheet,
      readerClipContext: sourceContext || "No Quick Draft material pasted yet.",
      projectContext,
      outline: outline || "请根据上面的素材池直接生成一版钟点稿正文。",
    })}

钟点稿追加约束（优先级高于上面的通用大纲输出格式）：
${projectContext}`;
  }

  async function requestMingmingQuickDraft() {
    collectRefs();
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const targetFormat = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
    const launchDayMode = isLaunchDayFormat(targetFormat);
    const firstDay = firstDaySnapshot();
    const currentBody = String(refs.draft?.value || "").trim();
    const intake = intakeSnapshot();
    const hasIntakeMaterial = intake.ventLog.length || intake.chatMaterials.length || intake.outlineSeed.trim();
    const hasMaterialPaneInput = String(refs.sources?.value || "").trim();
    const hasFirstDaySeed = currentBody
      || firstDaySeedValues(firstDay).some((value) => String(value || "").trim())
      || hasIntakeMaterial
      || hasMaterialPaneInput;
    if (!launchDayMode || !hasFirstDaySeed) {
      setQuickDraftStatus(t("quick_draft_missing_first_day"));
      refs.sources?.focus();
      return false;
    }

    if (requestController) requestController.abort();
    requestController = new AbortController();
    saveQuickDraft({}, { debounce: false });
    setBusy(true);
    setQuickDraftStatus(t("quick_draft_writing_first_day"));

    try {
      const sourceRecords = sourceRecordsFromForm();
      const targetDuration = normalizeDuration(refs.duration?.value, targetFormat);
      const previousBody = currentBody;
      const humanAnchor = humanAnchorSnapshot() || previousBody;
      const protectedRanges = protectedRangesSnapshot(slot.record);
      const subtracted = subtractProtectedRanges(previousBody, protectedRanges);
      const prompt = buildQuickDraftMingmingPrompt({
        firstDay,
        sources: sourceRecords,
        targetFormat,
        targetDuration,
        currentBody: subtracted.sourceText,
        humanAnchor,
        protectedBlocks: subtracted.protectedBlocks,
      });
      const response = await fetchModelPayload({
        model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
        messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
        temperature: 0.45,
        max_tokens: 5200,
        ai_system6_task_kind: "mingming_rewrite",
        stream: false,
      }, requestController.signal);
      if (!response.ok) {
        throw new Error(serviceErrorDetail(response.status, await response.text()));
      }
      const result = await response.json().catch(() => ({}));
      const raw = String(result?.choices?.[0]?.message?.content || "").trim();
      const nextBody = cleanMingmingQuickDraftBody(raw);
      const enforced = restoreProtectedRanges(nextBody, previousBody, protectedRanges);
      const finalBody = enforced.text;
      const protectedRestored = enforced.restored.length > 0;
      if (!finalBody) {
        setQuickDraftStatus(t("quick_draft_parse_failed"));
        return false;
      }
      if (looksLikePlaceholderDraft(finalBody)) {
        setQuickDraftStatus(t("quick_draft_placeholder_draft_rejected"));
        return false;
      }
      if (previousBody && !hasMeaningfulDraftChange(previousBody, finalBody)) {
        setQuickDraftStatus(t("quick_draft_no_revision"));
        return false;
      }

      const patch = {
        stage: "draft",
        raw,
        sourceMap: sourceRecords.map((source) => ({ id: source.id, label: source.label })),
        workspace: {
          body: finalBody,
          title: titleFromBody(finalBody),
          sourceMap: sourceRecords.map((source) => ({ id: source.id, label: source.label })),
        },
      };
      // The dump stays guarded by previousBody — an empty dump entry would
      // carry no version — but the anchor is the boundary the negative is
      // measured from, so it is recorded on the first model pass even when
      // the writer had written nothing yet.
      if (previousBody) {
        const dumpEntry = normalizeVentEntry({
          id: stableId("dump"),
          text: previousBody,
          createdAt: new Date().toISOString(),
          sourceKind: "quick-draft-dump",
        }, intake.ventLog.length);
        patch.workspace.intake = normalizeIntake({
          ...intake,
          ventLog: [...(intake.ventLog || []), dumpEntry],
        });
      }
      if (!hasRecordedNegative()) {
        patch.workspace.humanAnchor = previousBody;
        patch.workspace.humanAnchorUpdatedAt = new Date().toISOString();
      }
      refs.draft.value = finalBody;
      const saved = saveQuickDraft(patch, { debounce: false });
      renderQuickDraft(saved);
      setQuickDraftStatus(t(protectedRestored ? "quick_draft_protect_restored" : "quick_draft_done"));
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") setQuickDraftStatus(t("quick_draft_failed", quickDraftFailureMessage(error)));
      return false;
    } finally {
      requestController = null;
      setBusy(false);
    }
  }

  function quickDraftDocumentMarkdown(record = activeProjectQuickDraft({ create: false })?.record) {
    const source = normalizeQuickDraftRecord(record);
    const body = String(refs.draft?.value || source.workspace.body || "").trim();
    if (!body) return "";
    if (/^#\s+/m.test(body)) return body;
    const title = String(refs.titleInput?.value || source.workspace.title || titleFromBody(body)).trim().replace(/\s+/g, " ").slice(0, 64) || t("quick_draft_title");
    return [`# ${title}`, "", body].join("\n");
  }

  function quickDraftQuestionSheetText(record = activeProjectQuickDraft({ create: false })?.record) {
    const source = normalizeQuickDraftRecord(record);
    if (isLaunchDayFormat(source.workspace.scenario)) {
      return firstDayThesisText({
        title: source.workspace.title,
        subject: source.workspace.toolInputs.firstDaySubject,
        firstImpression: source.workspace.toolInputs.firstImpression,
      });
    }
    return source.workspace.toolInputs.thesis;
  }

  async function saveQuickDraftAsProjectDocument() {
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const markdown = quickDraftDocumentMarkdown(slot.record);
    if (!markdown) {
      setQuickDraftStatus(t("quick_draft_empty_body"));
      refs.draft?.focus();
      return false;
    }
    const now = new Date().toISOString();
    const title = String(refs.titleInput?.value || titleFromBody(markdown) || t("quick_draft_title")).trim();
    const folder = typeof ensureFolder === "function" ? ensureFolder(teachTextFolderInput?.value || t("documents")) : null;
    const existingId = slot.record.workspace.projectDocId;
    const existing = existingId ? chatFiles.find((file) => file.id === existingId && file.type === "text" && isInActiveProject(file)) : null;
    const file = existing || {
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      type: "text",
      name: typeof nextAvailableProjectFileName === "function" ? nextAvailableProjectFileName(title, activeProjectId) : title,
      folderId: folder?.id || "",
      source: "Quick Draft",
      durable: true,
      label: "draft",
      createdAt: now,
    };
    file.name = existing ? title : file.name;
    file.body = markdown;
    file.folderId = folder?.id || file.folderId || "";
    file.updatedAt = now;
    if (!existing) chatFiles.unshift(file);
    const saved = saveQuickDraft({ workspace: { projectDocId: file.id } }, { debounce: false });
    if (saved?.workspace) saved.workspace.projectDocId = file.id;
    selectedChatFileId = file.id;
    if (typeof renderDocuments === "function") renderDocuments();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
    saveDeskState();
    setQuickDraftStatus(t("quick_draft_project_doc_saved"));
    return true;
  }

  async function transferQuickDraftToTeachText() {
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    let markdown = quickDraftDocumentMarkdown(slot.record);
    if (!markdown) {
      const made = await requestQuickDraft("draft", { taskKind: "generate-first-body" });
      if (!made) return false;
      markdown = quickDraftDocumentMarkdown(activeProjectQuickDraft()?.record);
    }
    if (!markdown) return false;

    const result = await showSystemModal(t("quick_draft_transfer_confirm"), "confirm");
    if (result !== "yes") {
      setQuickDraftStatus(t("quick_draft_overwrite_cancelled"));
      return false;
    }

    if (typeof ensureWritingFlowModule === "function") await ensureWritingFlowModule();
    if (typeof setProjectOutlineMarkdown === "function") setProjectOutlineMarkdown(slot.project, markdown);
    slot.project.questionSheet = quickDraftQuestionSheetText(slot.record);
    slot.project.manuscriptLinkedToOutline = true;
    slot.project.flowState = {
      ...(slot.project.flowState || {}),
      topic: true,
      outline: true,
      drafting: true,
    };
    slot.project.quickDraft = {
      ...normalizeQuickDraftRecord(slot.project.quickDraft),
      workspace: normalizeQuickDraftWorkspace({
        ...slot.project.quickDraft?.workspace,
        ...workspaceSnapshot(slot.record),
        body: refs.draft?.value || "",
        updatedAt: new Date().toISOString(),
        savedStatus: "saved",
      }, slot.project.quickDraft),
      insertedAt: new Date().toISOString(),
    };
    slot.project.updatedAt = new Date().toISOString();
    if (typeof syncDraftsFromProjectOutline === "function") syncDraftsFromProjectOutline(slot.project);
    if (typeof syncOutlineDomFromProject === "function") syncOutlineDomFromProject(slot.project);
    if (typeof syncProjectOutlineToTeachText === "function") {
      syncProjectOutlineToTeachText(slot.project, { ai: true, open: true, focusPreview: false, markModified: false });
    } else {
      openWindow("teachText");
      if (teachTextBodyInput) teachTextBodyInput.value = markdown;
    }
    saveDeskState();
    setQuickDraftStatus(t("quick_draft_teachtext_done"));
    return true;
  }

  async function sendQuickDraftToReviewDesk() {
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const markdown = quickDraftDocumentMarkdown(slot.record);
    if (!markdown) {
      setQuickDraftStatus(t("quick_draft_empty_body"));
      refs.draft?.focus();
      return false;
    }
    saveQuickDraft({}, { debounce: false });
    await openWindow("reviewDesk");
    getWindow("reviewDesk")?.classList.remove("is-review-locked");
    if (reviewDeskBodyInput) {
      reviewDeskBodyInput.readOnly = false;
      reviewDeskBodyInput.classList.remove("is-hidden");
      reviewDeskBodyInput.value = markdown;
      reviewDeskBodyInput.scrollTop = 0;
      reviewDeskDirty = true;
    }
    reviewDeskPreviewEl?.classList.add("is-hidden");
    reviewDeskEmptyNoteEl?.classList.add("is-hidden");
    if (typeof setReviewDeskMode === "function") setReviewDeskMode("facts");
    if (typeof updateReviewDeskStats === "function") updateReviewDeskStats();
    if (typeof updateReviewDeskStatusTitle === "function") updateReviewDeskStatusTitle();
    if (typeof updateMenuState === "function") updateMenuState();
    setQuickDraftStatus(t("quick_draft_review_done"));
    return true;
  }

  async function copyQuickDraftMarkdown() {
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const markdown = quickDraftDocumentMarkdown(slot.record);
    if (!markdown) {
      setQuickDraftStatus(t("quick_draft_empty_body"));
      refs.draft?.focus();
      return false;
    }
    try {
      await navigator.clipboard?.writeText(markdown);
      setQuickDraftStatus(t("copied_markdown"));
      return true;
    } catch (error) {
      setQuickDraftStatus(t("copy_failed"));
      return false;
    }
  }

  async function switchToMultiFinder() {
    saveQuickDraft({}, { debounce: false });
    runtimeEnvironment = "multifinder";
    startupEnvironment = "multifinder";
    startupOpenMode = normalizeStartupOpenMode(startupOpenMode, startupEnvironment);
    ensureRunningApp("writingStudio", "quickDraft");
    if (typeof updateQuickDraftFocusChrome === "function") updateQuickDraftFocusChrome();
    renderMultiFinderMenu();
    updateMenuState();
    await saveDeskState();
    setQuickDraftStatus(t("quick_draft_multifinder_done"));
  }

  async function askClioTalk() {
    saveQuickDraft({}, { debounce: false });
    if (typeof arrangeWindowAssistantSplit === "function") {
      await arrangeWindowAssistantSplit("quickDraft");
      setQuickDraftStatus(t("quick_draft_sideask_done"));
    } else {
      await openWindow("assistant");
    }
  }

  function previewSource(label) {
    const preview = refs.sourceMap?.querySelector(".quick-draft-source-preview");
    if (!preview) return;
    const source = sourceRecordsFromForm().find((item) => item.label === label || item.id === label);
    preview.textContent = source ? `[${source.label}]\n${source.text.slice(0, 900)}` : "";
  }

  function useMountedSources() {
    const count = mountedSourceRecords().length;
    updateSourceCount();
    setQuickDraftStatus(t("quick_draft_mounted_added", count));
    saveQuickDraft({}, { debounce: false });
  }

  function stableId(prefix = "item") {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function inferChatPlatform(name = "", text = "") {
    const value = `${name}\n${text}`.toLowerCase();
    if (/telegram|tg\b/.test(value)) return "Telegram";
    if (/imessage|messages|facetime/.test(value)) return "iMessage";
    if (/wechat|微信|朋友圈/.test(value)) return "WeChat";
    if (/\bqq\b|腾讯qq|群聊/.test(value)) return "QQ";
    return "generic-chat";
  }

  function cleanChatScreenshotText(text = "") {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        if (/^(发送|send|message|type a message|输入消息)$/i.test(line)) return false;
        if (/^\d{1,2}:\d{2}$/.test(line)) return false;
        return true;
      })
      .join("\n")
      .trim();
  }

  function chatTextFingerprint(text = "") {
    return cleanChatScreenshotText(text)
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function isChatRecordingFile(file) {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    return type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(name);
  }

  function seekVideo(video, time) {
    return new Promise((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("Could not seek this chat recording."));
      };
      const cleanup = () => {
        video.removeEventListener("seeked", done);
        video.removeEventListener("error", fail);
      };
      video.addEventListener("seeked", done, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.currentTime = Math.max(0, time);
    });
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not render a chat recording frame."));
      }, "image/png");
    });
  }

  function frameTimeLabel(seconds = 0) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(value / 60);
    const rest = String(value % 60).padStart(2, "0");
    return `${minutes}m${rest}s`;
  }

  async function extractChatRecordingFrames(file) {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      throw new Error("Chat recording frame extraction needs the browser runtime.");
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;

    try {
      await new Promise((resolve, reject) => {
        video.addEventListener("loadedmetadata", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("Could not read this chat recording.")), { once: true });
      });
      const duration = Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;
      const width = Number(video.videoWidth || 0);
      const height = Number(video.videoHeight || 0);
      if (!duration || !width || !height) {
        throw new Error("This chat recording has no readable video track.");
      }

      const interval = duration > 120 ? 2 : 1.25;
      const maxFrames = 90;
      const times = [];
      for (let time = Math.min(0.4, duration); time < duration; time += interval) {
        times.push(Math.min(time, Math.max(0, duration - 0.1)));
        if (times.length >= maxFrames) break;
      }
      if (!times.length) times.push(0);

      const longEdge = Math.max(width, height);
      const scale = Math.min(1, 1600 / Math.max(longEdge, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Could not prepare a canvas for chat recording frames.");

      const frames = [];
      for (const time of times) {
        await seekVideo(video, time);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await canvasToPngBlob(canvas);
        const safeName = String(file.name || "chat-recording").replace(/\.[^.]+$/, "");
        frames.push(new File([blob], `${safeName}-${frameTimeLabel(time)}.png`, {
          type: "image/png",
          lastModified: file.lastModified || Date.now(),
        }));
      }
      return frames;
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }

  function chatMaterialBlock(item = {}) {
    const name = String(item.name || t("quick_draft_chat_source_label")).trim();
    const text = cleanChatScreenshotText(item.text || "");
    return text ? `【${t("quick_draft_chat_source_label")}：${name}】\n${text}` : "";
  }

  function appendBlocksToSources(blocks = []) {
    if (!refs.sources) return false;
    const existing = String(refs.sources.value || "").trim();
    const seen = new Set(
      existing
        .split(/\n{2,}/)
        .map(chatTextFingerprint)
        .filter(Boolean)
    );
    const nextBlocks = [];
    blocks.forEach((block) => {
      const text = String(block || "").trim();
      const fingerprint = chatTextFingerprint(text);
      if (!text || !fingerprint || seen.has(fingerprint)) return;
      seen.add(fingerprint);
      nextBlocks.push(text);
    });
    if (!nextBlocks.length) return false;
    refs.sources.value = [existing, ...nextBlocks].filter(Boolean).join("\n\n").trim();
    refs.sources.dispatchEvent(new Event("input", { bubbles: true }));
    refs.sources.scrollTop = refs.sources.scrollHeight;
    return true;
  }

  function appendChatMaterialsToSources(items = []) {
    return appendBlocksToSources(items.map(chatMaterialBlock));
  }

  function ventLogMaterialBlock(entries = []) {
    const lines = entries
      .map((entry) => String(entry?.text || "").trim())
      .filter(Boolean)
      .map((text) => `- ${text}`);
    if (!lines.length) return "";
    const stamp = new Date().toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `【${t("quick_draft_vent_material_label")}：${stamp}】\n${lines.join("\n")}`;
  }

  function flushVentLogToSources(intake = intakeSnapshot()) {
    const entries = nonDumpVentEntries(intake);
    return entries.length ? appendBlocksToSources([ventLogMaterialBlock(entries)]) : false;
  }

  function quickDraftCommandLabel(taskKind = "") {
    const zh = currentLanguage === "zh";
    const labels = {
      "collect-vent-outline": zh ? "提炼可讲点" : "Talk Points",
      "vent-on": zh ? "进入树洞" : "Start Vent Mode",
      "vent-off": zh ? "结束树洞" : "End Vent Mode",
      "vent-summary": zh ? "汇总树洞" : "Summarize Vents",
      draft: zh ? "出稿" : "Draft",
      "generate-first-body": zh ? "出稿" : "Draft",
      praise: zh ? "夸夸我" : "Encourage Me",
      mingming: zh ? "铭铭快审" : "Mingming Pass",
      luoluo: zh ? "落落接收" : "Luoluo Receive",
      hkrr: zh ? "HKRR 提亮" : "HKRR Lift",
      boundary: zh ? "补边界" : "Boundary Notes",
      "strategy-check": zh ? "出稿检查" : "Draft Check",
    };
    return labels[taskKind] || (zh ? "命令结果" : "Command Result");
  }

  function commandResultMarkdown(data = {}, taskKind = "") {
    const pieces = [];
    const strategy = normalizeStrategyReport(data.strategyReport);
    const brief = data.brief && typeof data.brief === "object" ? data.brief : {};
    const push = (heading, value) => {
      const text = String(value || "").trim();
      if (!text) return;
      pieces.push(`### ${heading}\n${text}`);
    };
    if (taskKind === "praise") {
      push(currentLanguage === "zh" ? "已经很好的地方" : "What Is Already Working", strategy.editorial || brief.support);
      push(currentLanguage === "zh" ? "轻量下一步" : "Light Next Steps", strategy.adoptionTable || brief.outline || data.risks);
      if (!pieces.length && data.raw) {
        push(currentLanguage === "zh" ? "夸夸" : "Encouragement", data.raw);
      }
      return pieces.join("\n\n").trim();
    }
    push(t("quick_draft_editorial_strategy"), strategy.editorial);
    push(t("quick_draft_material_ledger"), strategy.materialLedger);
    push(t("quick_draft_adoption_table"), strategy.adoptionTable);
    push(t("quick_draft_talk_points"), brief.outline || brief.support);
    push(t("quick_draft_boundary_title"), [brief.counter, brief.uncertainty, data.risks].filter(Boolean).join("\n\n"));
    if (!pieces.length && data.raw) {
      push(currentLanguage === "zh" ? "模型原文" : "Model Output", data.raw);
    }
    return pieces.join("\n\n").trim();
  }

  async function ensureQuickDraftClioTalk() {
    if (typeof arrangeWindowAssistantSplit === "function" && !isMultiFinderMode()) {
      await arrangeWindowAssistantSplit("quickDraft");
      return true;
    }
    if (typeof openWindow === "function") {
      await openWindow("assistant");
      return true;
    }
    return false;
  }

  async function appendCommandResultToClioTalk(data = {}, taskKind = "") {
    const body = commandResultMarkdown(data, taskKind);
    if (!body) return false;
    const stamp = new Date().toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const block = `## ${quickDraftCommandLabel(taskKind)} · ${stamp}\n\n${body}`;
    await ensureQuickDraftClioTalk();
    if (typeof addMessage === "function") {
      addMessage("assistant", block);
      return true;
    }
    return false;
  }

  function captureVentText(text = "", options = {}) {
    collectRefs();
    const value = String(text || "").trim();
    if (!value) return false;
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const intake = intakeSnapshot(slot.record);
    const entry = normalizeVentEntry({
      id: stableId("vent"),
      text: value,
      createdAt: new Date().toISOString(),
      sourceKind: options.sourceKind || "clioTalk-vent",
    }, intake.ventLog.length);
    const nextIntake = normalizeIntake({
      ...intake,
      ventLog: [...intake.ventLog, entry],
    });
    const signals = inferStrategySignals(value);
    const strategyCaptured = hasStrategySignals(signals);
    const workspacePatch = strategyCaptured
      ? { intake: nextIntake, strategyReport: mergeStrategySignals(strategySnapshot(slot.record), signals) }
      : { intake: nextIntake };
    const saved = saveQuickDraft({ workspace: workspacePatch }, { debounce: false });
    renderIntake(saved);
    renderStrategyReport(saved);
    updateSourceCount();
    const count = nonDumpVentEntries(nextIntake).length;
    setQuickDraftStatus(t(strategyCaptured ? "quick_draft_strategy_captured" : "quick_draft_vent_captured", count));
    return { captured: true, strategyCaptured, count };
  }

  function setVentMode(enabled = true, options = {}) {
    collectRefs();
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    if (refs.format && !isLaunchDayFormat(refs.format.value)) refs.format.value = FIRST_DAY_FORMAT;
    syncQuickDraftTemplateUi();
    const intake = intakeSnapshot(slot.record);
    const count = nonDumpVentEntries(intake).length;
    const shouldFlush = enabled !== true && options.flushToSources !== false;
    const transferred = shouldFlush ? flushVentLogToSources(intake) : false;
    const nextIntake = normalizeIntake({
      ...intake,
      ventMode: enabled === true,
      ventLog: enabled === true ? intake.ventLog : dumpEntries(intake),
    });
    const saved = saveQuickDraft({ workspace: { intake: nextIntake } }, { debounce: false });
    renderIntake(saved);
    updateSourceCount();
    setQuickDraftStatus(t(nextIntake.ventMode ? "quick_draft_vent_mode_on" : "quick_draft_vent_mode_off", count));
    return { active: nextIntake.ventMode, count, transferred };
  }

  function clearVentLog(options = {}) {
    collectRefs();
    const slot = activeProjectQuickDraft({ create: false });
    if (!slot?.record?.workspace?.intake) return { cleared: false, count: 0 };
    const intake = intakeSnapshot(slot.record);
    const count = nonDumpVentEntries(intake).length;
    const wasActive = intake.ventMode === true;
    if (!count && !wasActive) return { cleared: false, count: 0 };
    const nextIntake = normalizeIntake({
      ...intake,
      ventMode: false,
      ventLog: dumpEntries(intake),
    });
    const saved = saveQuickDraft({ workspace: { intake: nextIntake } }, { debounce: false });
    renderIntake(saved);
    updateSourceCount();
    if (!options.silent) setQuickDraftStatus(t("quick_draft_vent_cleared", count));
    return { cleared: true, count };
  }

  function ventEntryCount() {
    return nonDumpVentEntries(intakeSnapshot()).length;
  }

  function isVentIntakeActive() {
    const workspace = activeProjectQuickDraft({ create: false })?.record.workspace;
    return isLaunchDayFormat(workspace?.scenario) && workspace?.intake?.ventMode === true;
  }

  async function importChatScreenshots() {
    if (!getActiveProject()) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      openWindow("projects");
      return false;
    }
    if (typeof openTransientFilePicker !== "function" || typeof extractFileText !== "function") {
      setQuickDraftStatus(t("quick_draft_chat_import_unavailable"));
      return false;
    }
    openTransientFilePicker({
      accept: ".bmp,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.m4v,.mov,.webm,image/*,video/mp4,video/*",
      multiple: true,
      async onSelect(files) {
        const selected = Array.from(files || []).filter(Boolean);
        if (!selected.length) return;
        setBusy(true);
        setQuickDraftStatus(t("quick_draft_chat_importing"));
        try {
          const imported = [];
          const slot = activeProjectQuickDraft();
          const intake = intakeSnapshot(slot?.record);
          const seen = new Set(
            intake.chatMaterials
              .map((item) => chatTextFingerprint(item.text))
              .filter(Boolean)
          );
          for (const file of selected) {
            const frameFiles = isChatRecordingFile(file)
              ? await extractChatRecordingFrames(file)
              : [file];
            for (const frame of frameFiles) {
              const extracted = await extractFileText(frame);
              const text = cleanChatScreenshotText(extracted.text || "");
              if (!text) continue;
              const fingerprint = chatTextFingerprint(text);
              if (!fingerprint || seen.has(fingerprint)) continue;
              seen.add(fingerprint);
              imported.push(normalizeChatMaterial({
                id: stableId("chat"),
                name: frame.name || file.name || `chat-${imported.length + 1}`,
                text,
                platform: inferChatPlatform(file.name, text),
                sourceKind: isChatRecordingFile(file) ? "chat-recording-frame" : "chat-screenshot",
                createdAt: new Date().toISOString(),
              }, imported.length));
            }
          }
          if (!imported.length) {
            setQuickDraftStatus(t("quick_draft_chat_import_empty"));
            return;
          }
          const nextIntake = normalizeIntake({
            ...intake,
            chatMaterials: [...intake.chatMaterials, ...imported],
          });
          appendChatMaterialsToSources(imported);
          const saved = saveQuickDraft({ workspace: { intake: nextIntake } }, { debounce: false });
          renderIntake(saved);
          updateSourceCount();
          setQuickDraftStatus(t("quick_draft_chat_imported", imported.length));
        } catch (error) {
          setQuickDraftStatus(t("quick_draft_failed", error?.message || String(error)));
        } finally {
          setBusy(false);
        }
      },
    });
    return true;
  }

  function firstStanceCandidate(index = -1) {
    const intake = intakeSnapshot();
    const candidates = intake.stanceCandidates.filter((item) => String(item || "").trim());
    const candidate = index >= 0 ? candidates[index] : candidates[0];
    return String(candidate || "")
      .replace(/^\s*[-*•\d.、]+\s*/, "")
      .trim();
  }

  function adoptFirstImpression(index = -1) {
    const candidate = firstStanceCandidate(Number(index));
    if (!candidate) {
      setQuickDraftStatus(t("quick_draft_no_stance_candidate"));
      return false;
    }
    refs.firstImpression.value = candidate;
    if (refs.format && !isLaunchDayFormat(refs.format.value)) refs.format.value = FIRST_DAY_FORMAT;
    syncQuickDraftTemplateUi();
    renderDecisionStatuses(saveQuickDraft({}, { debounce: false }));
    setQuickDraftStatus(t("quick_draft_adopted_impression"));
    return true;
  }

  function confirmHandsOnFromAnnotations() {
    const annotations = currentAnnotations();
    const candidate = String(annotations.firsthand || "").trim();
    if (!candidate) {
      setQuickDraftStatus(t("quick_draft_no_hands_on_candidate"));
      return false;
    }
    refs.handsOn.value = refs.handsOn.value
      ? `${refs.handsOn.value.trim()}\n${candidate}`.trim()
      : candidate;
    renderDecisionStatuses(saveQuickDraft({}, { debounce: false }));
    setQuickDraftStatus(t("quick_draft_hands_on_confirmed"));
    return true;
  }

  function restoreDumpToBody() {
    const intake = intakeSnapshot();
    const latest = dumpEntries(intake).at(-1);
    if (!latest?.text) {
      setQuickDraftStatus(t("quick_draft_dump_empty"));
      return false;
    }
    refs.draft.value = latest.text;
    renderQuickDraftPreview();
    saveQuickDraft({}, { debounce: false });
    setQuickDraftStatus(t("quick_draft_dump_restored"));
    refs.draft?.focus();
    return true;
  }

  function collectVentOutline() {
    if (refs.format) refs.format.value = FIRST_DAY_FORMAT;
    syncQuickDraftTemplateUi();
    saveQuickDraft({}, { debounce: false });
    return requestQuickDraft("brief", {
      taskKind: "collect-vent-outline",
      userNotes: currentLanguage === "zh"
        ? "只整理树洞吐槽和聊天截图素材，产出 5 个可讲点和出稿骨架。不要写正文，不要替用户确定最终第一感受。"
        : "Organize only vent notes and chat screenshot material into 5 talk-point candidates and a draft path. Do not draft and do not decide the user's final first impression.",
    });
  }

  function runNextAction(kind) {
    const materialOnlyKinds = new Set(["strategy-check", "mingming", "luoluo", "hkrr", "boundary"]);
    return requestQuickDraft(materialOnlyKinds.has(kind) ? "brief" : "draft", {
      taskKind: kind,
      userNotes: nextActionNote(kind),
    });
  }

  async function runClioTalkAction(kind = "", options = {}) {
    const action = String(kind || "").trim();
    if (options.announceUser) {
      const announce = () => {
        if (typeof addMessage === "function") {
          addMessage("user", `${currentLanguage === "zh" ? "钟点稿命令" : "Quick Draft command"}：${quickDraftCommandLabel(action === "organize" ? "collect-vent-outline" : action)}`);
        }
      };
      if (action === "mingming" || action === "luoluo" || action === "hkrr") {
        // The adjustment command's result lives in the Quick Draft window;
        // the transcript log line must not arrange and focus the assistant.
        announce();
      } else {
        // Advice commands append their card to SideAsk; the pairing is
        // re-ensured before they run, so the log line is never a gate.
        ensureQuickDraftClioTalk().then(announce).catch(() => {});
      }
    }
    if (action === "vent-on" || action === "vent-off") {
      const result = setVentMode(action === "vent-on");
      if (result && typeof addMessage === "function") {
        addMessage("assistant", t(result.active ? "quick_draft_vent_mode_on" : "quick_draft_vent_mode_off", result.count));
      }
      return result;
    }
    if (action === "organize") return collectVentOutline();
    if (action === "vent-summary") return collectVentOutline();
    if (action === "draft") return requestMingmingQuickDraft();
    if (action === "mingming" || action === "luoluo" || action === "hkrr") return runAdjustmentCommand(action);
    if (action === "praise") return requestQuickDraft("brief", {
      taskKind: "praise",
      userNotes: nextActionNote("praise"),
    });
    if (action === "shorten") return runNextAction("shorten");
    if (action === "hook") return runNextAction("hook");
    if (action === "boundary") return runNextAction("boundary");
    return false;
  }

  // Task 5: the named commands create or update their adjustment instead of
  // overwriting the body. A body selection scopes the layer; the layer is
  // enabled; then the stack composes non-destructively (every prefix cached),
  // so the writer sees the composite and can switch the layer off and look
  // again. The fast path's single Draft button and its one model call are
  // untouched.
  async function runAdjustmentCommand(kind = "") {
    const slot = activeProjectQuickDraft();
    if (!slot) {
      setQuickDraftStatus(t("quick_draft_no_project"));
      return false;
    }
    const layers = adjustmentLayersSnapshot(slot.record);
    const layer = layers.find((item) => item.kind === kind);
    if (!layer) return false;
    const selection = selectionLineRanges();
    const nextLayers = layers.map((item) => {
      if (item.kind !== kind) return item;
      const mask = selection.length
        ? normalizeAdjustmentLayerMask([...(item.mask || []), ...selection])
        : item.mask;
      return { ...item, enabled: true, mask };
    });
    saveQuickDraft({ workspace: { adjustmentLayers: nextLayers } }, { debounce: false });
    renderAdjustmentLayers(activeProjectQuickDraft({ create: false })?.record);
    refreshQuickDraftPreviewIfOpen();
    if (String(quickDraftCompositeSource(slot.record) || "").trim()) {
      return applyAdjustmentLayers();
    }
    setQuickDraftStatus(t("quick_draft_adjustment_added"));
    return true;
  }

  function startWritingNow() {
    return requestMingmingQuickDraft();
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
        renderDecisionStatuses(saveQuickDraft({}, { debounce: true }));
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
    refs.togglePreviewButton?.addEventListener("click", toggleQuickDraftPreview);
    refs.toggleGrainButton?.addEventListener("click", toggleQuickDraftGrain);
    refs.toggleCompositeButton?.addEventListener("click", toggleQuickDraftComposite);
    // Object selected: a real selection in the body raises the bounding box +
    // control points state (Classic marching ants), the same box Protect and
    // scope read from.
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
    // Return to an active Quick Draft side-ask conversation from the source
    // page; askClioTalk re-arranges (and focuses) the paired assistant when a
    // session is already running instead of stacking a second one.
    document.getElementById("quick-draft-return-sideask")?.addEventListener("click", askClioTalk);
    refs.saveButton?.addEventListener("click", startWritingNow);
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
        if (refs.tools) refs.tools.open = false;
        importChatScreenshots();
        return;
      }
      const delivery = event.target.closest("[data-quick-draft-delivery]");
      if (delivery) {
        if (refs.tools) refs.tools.open = false;
        const action = delivery.dataset.quickDraftDelivery || "";
        if (action === "teachtext") transferQuickDraftToTeachText();
        if (action === "copy-markdown") copyQuickDraftMarkdown();
        return;
      }
      const move = event.target.closest("[data-quick-draft-adjustment-move]");
      if (move) {
        moveAdjustmentLayer(move.dataset.quickDraftAdjustmentMove, Number(move.dataset.direction) || -1);
        return;
      }
      const protectSelection = event.target.closest("[data-quick-draft-protect-selection]");
      if (protectSelection) {
        if (refs.tools) refs.tools.open = false;
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
        if (refs.tools) refs.tools.open = false;
        applyAdjustmentLayers();
        return;
      }
      const developButton = event.target.closest("[data-quick-draft-adjustment-develop]");
      if (developButton) {
        if (refs.tools) refs.tools.open = false;
        developAdjustmentLayers();
        return;
      }
      const quickDraftAction = event.target.closest("[data-quick-draft-chat-action]");
      if (quickDraftAction) {
        if (refs.tools) refs.tools.open = false;
        runClioTalkAction(quickDraftAction.dataset.quickDraftChatAction || "", { announceUser: true });
      }
    });
    // 看片: one key to enter (v), one key to leave (Escape). The writer can
    // stop being an operator for a minute; typing in the body is never
    // hijacked.
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
    if (!options.skipSideAsk && typeof arrangeWindowAssistantSplit === "function" && !isMultiFinderMode()) {
      await arrangeWindowAssistantSplit("quickDraft");
    }
    const rect = win?.getBoundingClientRect();
    if (win && rect && (rect.width < 360 || rect.height < 260) && typeof maximizeWindow === "function") {
      maximizeWindow(win);
    }
    if (typeof updateQuickDraftFocusChrome === "function") updateQuickDraftFocusChrome();
    refs.draft?.focus({ preventScroll: true });
  }

  bind();
  if (typeof registerWorkingSessionAdapter === "function") {
    registerWorkingSessionAdapter({
      id: "quickDraft",
      capture: captureWorkingSession,
      restore: restoreWorkingSession,
    });
  }

  window.AISystem6QuickDraftLoaded = true;
  window.AISystem6QuickDraft = Object.freeze({
    open,
    render: renderQuickDraft,
    request: requestQuickDraft,
    askClioTalk,
    captureVentText,
    setVentMode,
    clearVentLog,
    ventEntryCount,
    isVentIntakeActive,
    importChatScreenshots,
    togglePreview: toggleQuickDraftPreview,
    toggleComposite: toggleQuickDraftComposite,
    previewMode: () => quickDraftPreviewMode,
    surfaceMode: () => quickDraftSurfaceMode,
    setView: (mode) => setQuickDraftSurface(mode === "canvas" ? "canvas" : "linear", { manual: true }),
    protectSelection: protectSelectionFromTextarea,
    applyAdjustments: applyAdjustmentLayers,
    develop: developAdjustmentLayers,
    copyMarkdown: copyQuickDraftMarkdown,
    collectVentOutline,
    adoptFirstImpression,
    startWritingNow,
    runClioTalkAction,
    sendToTeachText: transferQuickDraftToTeachText,
    transferQuickDraftToTeachText,
    sendQuickDraftToReviewDesk,
    saveQuickDraftAsProjectDocument,
  });
})();
