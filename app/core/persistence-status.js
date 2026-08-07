// Core runtime module: persistence-status.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


const scheduledRenderTasks = new Set();
let scheduledRenderFrame = 0;
const renderSignatureCache = new Map();
const storageSnapshotCache = new Map();
const localApiTokenSessionKey = "ai-system6-local-api-token";
let deskPersistenceWritable = true;
let controlStripCollapsed = false;

function getControlStripCollapsed() {
  return controlStripCollapsed;
}

function setControlStripCollapsed(value) {
  controlStripCollapsed = value === true;
  saveDeskState();
}

const renderTasks = [
  ["projectLabels", "updateProjectLabels"],
  ["projectDisks", "renderProjectDisks"],
  ["documents", "renderDocuments"],
  ["scraps", "renderScraps"],
  ["trash", "renderTrash"],
  ["projectCd", "renderProjectCd"],
  ["projectReferences", "renderProjectReferences"],
  ["mountedTextDisk", "renderMountedTextDisk"],
  ["contextPanel", "renderContextPanel"],
  ["pipeline", "renderPipeline"],
  ["readerTabs", "renderReaderTabs"],
  ["localModelState", "renderLocalModelState"],
  ["menuStatus", "updateMenuStatus"],
  ["aboutMacintosh", "renderAboutMacintosh"],
  ["menuState", "updateMenuState"],
];

function flushScheduledRenderTasks() {
  scheduledRenderFrame = 0;
  const tasks = new Set(scheduledRenderTasks);
  scheduledRenderTasks.clear();
  if ([...tasks].some((task) => !["menuState", "menuStatus", "aboutMacintosh", "localModelState"].includes(task))
    && typeof invalidateMenuActionCache === "function") {
    invalidateMenuActionCache();
  }
  renderTasks.forEach(([task, handler]) => {
    if (!tasks.has(task)) return;
    const endPerf = window.AISystem6Perf?.start("render_task", { task });
    try {
      window[handler]?.();
    } catch (error) {
      console.error(`Failed to render scheduled task: ${task}`, error);
    } finally {
      endPerf?.();
    }
  });
}

function scheduleRenderTasks(...tasks) {
  tasks.flat().filter(Boolean).forEach((task) => scheduledRenderTasks.add(task));
  if (scheduledRenderFrame) return;
  const scheduleFrame = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);
  scheduledRenderFrame = scheduleFrame(flushScheduledRenderTasks);
}

function scheduleWorkspaceRender(options = {}) {
  scheduleRenderTasks(
    options.projectLabels ? "projectLabels" : null,
    "projectDisks",
    "documents",
    "scraps",
    "trash",
    "projectCd",
    options.projectReferences ? "projectReferences" : null,
    options.mountedTextDisk ? "mountedTextDisk" : null,
    "contextPanel",
    "pipeline",
    options.readerTabs ? "readerTabs" : null,
    options.menuState ? "menuState" : null
  );
}

function scheduleStatusRender() {
  scheduleRenderTasks("menuStatus", "aboutMacintosh");
}

function markDeskDirty(kind = "settings") {
  storageSnapshotCache.delete(kind);
}

function settingsSnapshotPayload() {
  return {
    endpoint: endpointInput.value,
    localProvider: document.getElementById("local-provider")?.value || "lm-studio",
    localLmStudioConnectionEnabled,
    model: modelInput.value === "ai-system-main" ? "" : modelInput.value,
    modelFieldInputMode: document.getElementById("manual-model-fields")?.checked ? "manual" : "select",
    chatModel: activeChatModelIdentifier,
    localModelReady: localModelState.ready,
    searchProvider: searchProviderInput?.value || "auto",
    timeMachineProvider: typeof timeMachineProviderInput !== "undefined"
      ? timeMachineProviderInput?.value || "auto"
      : "auto",
    importerMode: importerModeInput?.value || "auto",
    ocrEngine: ocrEngineInput?.value || "auto",
    contextLength: contextLengthInput.value,
    contextLengthByModel,
    contextLengthUserOverrides,
    contextMaxByModel,
    compressedConversationMemory,
    embeddingModel: embeddingModelInput.value,
    remember: rememberInput.checked,
    modernFonts: modernFontsInput.checked,
    liquidGlass: !!liquidGlassInput?.checked,
    soundEffects: soundEffectsInput.checked,
    menuClock: menuClockInput.checked,
    controlStrip: controlStripInput.checked,
    controlStripCollapsed,
    performanceMeter: performanceMeterInput.checked,
    imageGen: document.getElementById("enable-image-gen")?.checked || false,
    clioWebSearch: document.getElementById("clio-web-search")?.checked || false,
    showResetSystemMenu: showResetSystemMenuInput ? showResetSystemMenuInput.checked : true,
    language: currentLanguage,
    writerMode: false,
    projectMounted: isProjectMounted,
    guideSeen,
    multiFinderSwitcherHintSeen,
    writingBell: getWritingBellState(),
    alarmClock: typeof getAlarmClockState === "function" ? getAlarmClockState() : null,
    puzzle: getPuzzleState(),
    pageSetup: { ...pageSetupSettings },
    notePadText: notePadTextInput.value,
    notePadPages,
    notePadPageIndex,
    projectCdItems,
    clipboardText,
    clipboardSource,
    clipboardUpdatedAt,
    clipboardTranslationText,
    clipboardTranslationSourceText,
    clipboardTranslationLanguage,
    clipboardTranslationCreatedAt,
    clipboardTranslationModel,
    activeProjectId,
    startupProjectId,
    workspaceProfile,
    startupEnvironment,
    startupOpenMode,
    startupSelectedApplicationAction,
    startupSelectedApplicationName,
    startupOpenedWindowNames: captureStartupOpenedWindowNames(),
    windowViewModes: { ...windowViewModes },
    excludedContextKeys: [...excludedContextKeys],
  };
}

function storageSnapshotChanged(key, payload) {
  const snapshot = JSON.stringify(payload);
  return storageSnapshotCache.get(key) !== snapshot;
}

function saveLocalApiTokenForSession() {
  if (typeof localApiTokenInput === "undefined" || !localApiTokenInput) return;
  const token = localApiTokenInput.value.trim();
  try {
    if (token) sessionStorage.setItem(localApiTokenSessionKey, token);
    else sessionStorage.removeItem(localApiTokenSessionKey);
  } catch {}
}

function collectionVersion(items = []) {
  return `${items.length};${items.map((item) => `${item.id || item.title || item.name || ""}:${item.updatedAt || item.createdAt || ""}`).join("|")}`;
}

function shouldSkipRender(name, signature) {
  const value = String(signature || "");
  if (!value) return false;
  if (renderSignatureCache.get(name) === value) {
    window.AISystem6Perf?.record("render_task", 0, { task: name, skipped: true });
    return true;
  }
  renderSignatureCache.set(name, value);
  return false;
}

async function switchLanguage() {
  const next = currentLanguage === "en" ? "zh" : "en";
  // A failed table fetch still switches the language; missing strings fall
  // back to keys instead of leaving the button dead.
  await ensureLanguageFor(next).catch(() => {});
  currentLanguage = next;
  applyLanguage();
  scheduleWorkspaceRender({
    readerTabs: true,
    projectReferences: true,
    mountedTextDisk: true,
    menuState: true,
  });
  scheduleStatusRender();
  renderClioTalkRunAssembly();
  saveDeskState();
}

function saveDeskState() {
  if (!deskPersistenceWritable) return Promise.resolve(false);
  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  saveDeskStatePromise = saveDeskStatePromise
    .catch(() => {})
    .then(() => persistDeskState())
    .then((saved) => {
      if (saved) window.AISystem6DerivedIndexQueue?.afterProjectCommit();
      return saved;
    });
  return saveDeskStatePromise;
}

function scheduleSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    scheduleStatusRender();
    saveDeskState();
  }, 750);
}

function modelStateCurrentStep() {
  if (localModelState.running) return t("model_step_running");
  if (localModelState.ready) return t("model_step_ready");
  if (localModelState.loaded) return t("model_step_loaded");
  if (localModelState.selected) return t("model_step_selected");
  if (localModelState.models) return t("model_step_models");
  if (localModelState.server) return t("model_step_server");
  return t("model_step_waiting");
}

function modelStateNextKey(state = localModelState) {
  if (state.running) return "model_next_running";
  if (!state.server) return "model_next_start_lm";
  if (!state.models) return "model_next_find_models";
  if (!state.selected) return "model_next_select_model";
  if (!state.loaded) return "model_next_load_model";
  return "model_next_ready";
}

function updateLocalModelState(patch = {}) {
  localModelState = {
    ...localModelState,
    selected: !!modelInput.value.trim(),
    ...patch,
  };
  localModelState.next = modelStateNextKey(localModelState);
  // The menu-bar model indicator is the global status surface for both cloud
  // and local routes. Keep it in the same state transition as Control Panel so
  // a successful load (or disconnect) cannot leave the two surfaces disagreeing
  // until a later render frame or monitor poll.
  if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
  scheduleRenderTasks("localModelState");
}

const contextMinLength = 4096;
const contextDefaultLength = 8192;

function parsePositiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function modelContextKey(value = modelInput?.value) {
  return String(value || "").trim().toLowerCase();
}

function contextMaxRecordForModel(value = modelInput?.value) {
  const key = modelContextKey(value);
  if (!key) return null;
  const stored = contextMaxByModel[key];
  if (stored?.max) return stored;

  const catalogMatch = findMatchingModel(modelCatalog, value);
  if (catalogMatch?.max_context_length) {
    return {
      max: catalogMatch.max_context_length,
      source: catalogMatch.max_context_source || "detected",
    };
  }

  return null;
}

function describeContextMaxSource(source) {
  if (source === "known") return t("context_ram_source_known");
  return t("context_ram_source_detected");
}

function setContextMaxStatus(record) {
  if (!contextRamStatusEl) return;
  if (!record?.max) {
    contextRamStatusEl.textContent = t("context_ram_unknown");
    contextRamStatusEl.dataset.state = "unavailable";
    return;
  }
  const base = t("context_ram_status", record.max, describeContextMaxSource(record.source));
  contextRamStatusEl.textContent = record.max < 131072
    ? `${base} ${t("context_ram_below_ideal")}`
    : base;
  contextRamStatusEl.dataset.state = "ready";
}

function updateContextMaxForCurrentModel() {
  const cloudActive = (typeof cloudConfig !== "undefined") && cloudConfig?.active;
  const cloudCtx = cloudActive && typeof knownCloudContextWindow === "function"
    ? knownCloudContextWindow(cloudConfig)
    : 0;
  const record = cloudActive
    ? (cloudCtx ? { max: cloudCtx, source: "known" } : null)
    : contextMaxRecordForModel();
  setContextMaxStatus(record);
  if (cloudCtx) setContextLengthOptions(record);
  else if (!cloudActive) normalizeContextLengthInput({ silent: true });
  return record;
}

function contextLengthOptionsForMax(max) {
  const limit = parsePositiveInteger(max);
  if (limit < contextMinLength) return [];
  const values = [];
  for (let value = contextMinLength; value <= limit; value *= 2) {
    values.push(value);
  }
  if (!values.includes(limit)) values.push(limit);
  return values;
}

function rememberContextLengthForCurrentModel(userOverride = false) {
  const key = modelContextKey();
  const value = parsePositiveInteger(contextLengthInput?.value);
  if (key && value) contextLengthByModel[key] = value;
  if (key && userOverride) contextLengthUserOverrides[key] = true;
  return value;
}

function setContextLengthOptions(record) {
  if (!contextLengthInput) return 0;
  const previous = parsePositiveInteger(contextLengthInput.value);
  contextLengthInput.disabled = false;
  if (!record?.max) {
    renderContextLengthPresets();
    return previous || 0;
  }

  const options = contextLengthOptionsForMax(record.max);
  const key = modelContextKey();
  const hasUserOverride = !!contextLengthUserOverrides[key];
  const remembered = hasUserOverride ? contextLengthByModel[key] : 0;
  const preferred = [remembered, hasUserOverride && previous && previous <= record.max ? previous : 0, record.max]
    .map(parsePositiveInteger)
    .find((value) => value && value <= record.max);
  contextLengthInput.value = String(preferred || options[options.length - 1] || "");
  rememberContextLengthForCurrentModel();
  renderContextLengthPresets();
  return parsePositiveInteger(contextLengthInput.value);
}

function normalizeContextLengthInput(options = {}) {
  if (!contextLengthInput) return contextDefaultLength;
  const record = contextMaxRecordForModel();
  let value = parsePositiveInteger(contextLengthInput.value);
  if (!record?.max) {
    setContextLengthOptions(record);
    setContextMaxStatus(record);
    if (value) rememberContextLengthForCurrentModel();
    return value || 0;
  }
  setContextLengthOptions(record);
  value = parsePositiveInteger(contextLengthInput.value) || setContextLengthOptions(record);
  if (value > record.max) {
    value = record.max;
    contextLengthInput.value = String(value);
    if (!options.silent && loadModelStatusEl) {
      loadModelStatusEl.textContent = t("context_length_clamped", record.max);
    }
  }
  contextLengthInput.value = String(value);
  rememberContextLengthForCurrentModel();
  setContextMaxStatus(record);
  return value;
}

function getContextLoadConfig() {
  const model = modelInput.value.trim();
  const record = contextMaxRecordForModel(model);
  const userContextLength = parsePositiveInteger(contextLengthInput?.value);
  if (!record?.max) {
    if (!userContextLength) {
      loadModelStatusEl.textContent = t("context_ram_required");
      return null;
    }
    rememberContextLengthForCurrentModel(true);
    return {
      contextLength: userContextLength,
      maxContextLength: userContextLength,
      maxContextSource: "user",
    };
  }

  const contextLength = normalizeContextLengthInput();
  if (!contextLength) {
    loadModelStatusEl.textContent = t("context_ram_required");
    return null;
  }
  return {
    contextLength,
    maxContextLength: record.max,
    maxContextSource: record.source,
  };
}

function currentContextRouteConfig() {
  const model = modelInput?.value?.trim() || "";
  const record = contextMaxRecordForModel(model);
  const contextLength = parsePositiveInteger(contextLengthInput?.value);
  if (!contextLength && !record?.max) return {};
  return {
    ...(contextLength ? { context_length: contextLength } : {}),
    ...(record?.max ? {
      max_context_length: record.max,
      max_context_source: record.source,
    } : contextLength ? {
      max_context_length: contextLength,
      max_context_source: "user",
    } : {}),
  };
}

function renderLocalModelState() {
  const steps = ["server", "models", "selected", "loaded", "ready"];
  if (modelStatePanelEl) {
    steps.forEach((step) => {
      const row = modelStatePanelEl.querySelector(`[data-model-step="${step}"]`);
      if (!row) return;
      const isDone = !!localModelState[step];
      row.classList.toggle("is-done", isDone);
      row.classList.toggle("is-current", !isDone && step === steps.find((candidate) => !localModelState[candidate]));
      const status = row.querySelector("small");
      if (status) status.textContent = isDone ? t("model_step_done") : t("model_step_waiting");
    });
    modelStatePanelEl.classList.toggle("is-running", localModelState.running);
  }
  if (modelStateNextEl) {
    modelStateNextEl.textContent = localModelState.next === "model_next_running"
      ? t("model_next_running", localModelState.task || t("working_locally"))
      : t(localModelState.next);
  }
  if (localModelState.ready && !localModelState.running) {
    const displayModel = getLocalModelDisplayName();
    if (loadModelButton) {
      loadModelButton.hidden = true;
      loadModelButton.disabled = false;
      loadModelButton.textContent = t("load_model");
    }
    if (modelPickerStatusEl) {
      modelPickerStatusEl.hidden = true;
      modelPickerStatusEl.textContent = "";
    }
    if (loadModelStatusEl) loadModelStatusEl.textContent = t("load_model_done", displayModel, contextLengthInput.value || 8192);
  } else {
    if (modelPickerStatusEl) modelPickerStatusEl.hidden = false;
    if (loadModelButton) {
      loadModelButton.hidden = false;
      loadModelButton.textContent = t("load_model");
    }
  }
  if (statusModelStateEl) statusModelStateEl.textContent = modelStateCurrentStep();
  if (statusCurrentTaskEl) statusCurrentTaskEl.textContent = localModelState.running
    ? (localModelState.task || t("working_locally"))
    : t("no_current_task");
  if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
}

const contextLengthPresetValues = [8192, 32768, 65536, 131072, 262144];

function localModelSelectEl() {
  return document.getElementById("model-select");
}

function localEmbeddingModelSelectEl() {
  return document.getElementById("embedding-model-select");
}

function localManualModelInputEl() {
  return document.getElementById("manual-model-fields");
}

function contextLengthPresetEl() {
  return document.getElementById("context-length-preset");
}

function localConnectionErrorKey(error) {
  const message = String(error?.message || error || "");
  if (/ollama_api_incompatible/.test(message)) return "local_connection_ollama_incompatible";
  if (/ollama_cors_or_offline|ollama_bad_response/.test(message)) return "local_connection_ollama_unavailable";
  if (/ollama_model_missing/.test(message)) return "local_connection_ollama_no_models";
  if (/lmstudio_auth_failed/.test(message)) return "local_connection_auth_failed";
  if (/lmstudio_safari_http_unavailable/.test(message)) return "local_connection_safari_http_unavailable";
  if (/lmstudio_safari_unsupported/.test(message)) return "local_connection_safari_unsupported";
  if (/lmstudio_browser_permission_denied/.test(message)) return "local_connection_browser_permission_denied";
  if (/lmstudio_v1_required/.test(message)) return "local_connection_v1_required";
  if (/lmstudio_loopback_required|lmstudio_endpoint_invalid/.test(message)) return "local_connection_loopback_required";
  return "local_connection_cors_failed";
}

function setLocalConnectionDetailStatus(element, key) {
  if (!element || !key) return;
  element.textContent = t(key);
  element.dataset.state = /failed|denied/.test(key) ? "unavailable" : /verified|granted/.test(key) ? "ready" : "";
  // These diagnostics sit inside a collapsed disclosure so a healthy connection
  // reads as one line. A real failure has to stay visible, though, so anything
  // that went wrong opens it — including the token field, which is what an auth
  // failure needs the user to fill in.
  const details = element.closest("details");
  if (details && element.dataset.state === "unavailable") details.open = true;
}

function configurePublicLmStudioControls() {
  if (!window.AISystem6LocalLMStudio?.isPublicWebMode?.()) return;
  if (localProviderEl) {
    [...localProviderEl.options].forEach((option) => {
      const unavailable = option.value === "custom";
      option.hidden = unavailable;
      option.disabled = unavailable;
    });
    localProviderEl.disabled = false;
  }
  endpointInput.value = window.AISystem6LocalLMStudio.normalizeBaseUrl(endpointInput.value);
}

function isOllamaLocalProvider() {
  return window.AISystem6LocalLMStudio?.currentProvider?.() === "ollama";
}

function syncLocalProviderUi() {
  const ollama = isOllamaLocalProvider();
  const tokenField = document.getElementById("local-api-token")?.closest(".control-field");
  if (tokenField) tokenField.hidden = ollama;
  if (localAuthStatusEl) localAuthStatusEl.textContent = t(ollama ? "local_auth_status_ollama" : "local_auth_status_optional");
}

function openLocalModelApp() {
  const slashes = String.fromCharCode(47, 47);
  if (isOllamaLocalProvider()) {
    window.open(`https:${slashes}ollama.com/download`, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(`lmstudio:${slashes}`);
}

function connectOrLaunchLocalModel() {
  const safariNeedsHttpEntry = window.AISystem6LocalLMStudio?.isSafariPublicWebUnsupported?.();
  if (localLmStudioConnectionEnabled || isOllamaLocalProvider() || safariNeedsHttpEntry) {
    connectLocalLmStudio({ toggle: true });
    return;
  }
  renderLocalConnectionStatus("connecting");
  openLocalModelApp();
  setTimeout(() => connectLocalLmStudio({ toggle: false }), 1200);
}

// Local setup is two sequential steps, and showing both at once was most of
// what made this panel feel long: before a connection exists the model pickers
// are empty and cannot do anything. Once it exists, the address you just
// connected to stops being worth a row of its own.
//
// The connect fields are *moved* between the two places rather than duplicated,
// so ids stay unique and their existing listeners keep working.
function syncLocalModelPhase(connected) {
  const section = document.querySelector('[data-control-panel="local"]');
  if (!section) return;
  const connectFields = section.querySelector(".local-connect-fields");
  const modelFields = section.querySelector(".local-model-fields");
  const advanced = section.querySelector("#local-advanced-details");
  const connectButton = section.querySelector("#connect-local-model");
  if (!connectFields || !modelFields || !advanced || !connectButton) return;

  modelFields.hidden = !connected;
  if (connected) {
    if (!advanced.contains(connectFields)) advanced.prepend(connectFields);
  } else if (advanced.contains(connectFields)) {
    connectButton.before(connectFields);
  }
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
}

function renderLocalConnectionStatus(state, data = null) {
  const status = typeof localConnectionStatusEl !== "undefined"
    ? localConnectionStatusEl
    : document.getElementById("local-connection-status");
  const button = typeof connectLocalModelButton !== "undefined"
    ? connectLocalModelButton
    : document.getElementById("connect-local-model");
  if (!status || !button) return;
  syncLocalProviderUi();
  const ollama = isOllamaLocalProvider();
  if (state === "local_connection_waiting" && ollama) state = "local_connection_ollama_waiting";
  if (state === "local_connection_waiting" && window.AISystem6LocalLMStudio?.isSafariPublicWebUnsupported?.()) {
    state = "local_connection_safari_unsupported";
  } else if (state === "local_connection_waiting" && window.AISystem6LocalLMStudio?.isSafariHttpLocalMode?.()) {
    state = "local_connection_safari_http_ready";
  }
  const safariUnsupported = [
    "local_connection_safari_unsupported",
    "local_connection_safari_http_unavailable",
  ].includes(state);
  const idleState = ["local_connection_waiting", "local_connection_ollama_waiting", "local_connection_safari_http_ready"].includes(state);
  status.dataset.state = state === "ready" ? "ready" : state.startsWith("local_connection_") && !idleState ? "unavailable" : "";
  syncLocalModelPhase(state === "ready");
  const hasToken = !!(typeof localApiTokenInput !== "undefined" && localApiTokenInput?.value?.trim());
  if (state === "connecting") {
    status.textContent = t(ollama ? "local_connection_ollama_connecting" : "local_connection_connecting");
    setLocalConnectionDetailStatus(localAuthStatusEl, ollama ? "local_auth_status_ollama" : hasToken ? "local_auth_status_token" : "local_auth_status_optional");
    setLocalConnectionDetailStatus(localCorsStatusEl, "local_cors_status_waiting");
    setLocalConnectionDetailStatus(localBrowserPermissionStatusEl, "local_browser_permission_waiting");
    button.disabled = true;
    return;
  }
  button.disabled = false;
  if (state === "ready") {
    status.textContent = t(
      ollama ? "local_connection_ollama_ready" : hasToken ? "local_connection_ready" : "local_connection_ready_no_token",
      data?.chatModels?.length || 0,
      data?.embeddingModels?.length || 0
    );
    setLocalConnectionDetailStatus(localAuthStatusEl, ollama ? "local_auth_status_ollama" : hasToken ? "local_auth_status_verified" : "local_auth_status_optional");
    setLocalConnectionDetailStatus(localCorsStatusEl, "local_cors_status_verified");
    const permission = ["granted", "prompt", "denied"].includes(data?.browserPermission)
      ? data.browserPermission
      : "unsupported";
    setLocalConnectionDetailStatus(localBrowserPermissionStatusEl, `local_browser_permission_${permission}`);
    button.textContent = t(ollama ? "disconnect_ollama" : "disconnect_local_model");
    return;
  }
  button.textContent = safariUnsupported
    ? t("open_safari_http_local")
    : t(ollama ? "connect_ollama" : "open_and_connect_lm_studio");
  status.textContent = t(state === "disconnected"
    ? (ollama ? "local_connection_ollama_disconnected" : "local_connection_disconnected")
    : state);
  setLocalConnectionDetailStatus(localAuthStatusEl, state === "local_connection_auth_failed"
    ? "local_auth_status_failed"
    : hasToken ? "local_auth_status_token" : "local_auth_status_optional");
  setLocalConnectionDetailStatus(localCorsStatusEl, ["local_connection_auth_failed", "local_connection_v1_required"].includes(state)
    ? "local_cors_status_verified"
    : state === "disconnected" || idleState || safariUnsupported
      ? "local_cors_status_waiting"
      : "local_cors_status_failed");
  setLocalConnectionDetailStatus(localBrowserPermissionStatusEl, "local_browser_permission_waiting");
  if (state === "local_connection_browser_permission_denied") {
    setLocalConnectionDetailStatus(localBrowserPermissionStatusEl, "local_browser_permission_denied");
  } else if (safariUnsupported) {
    setLocalConnectionDetailStatus(localBrowserPermissionStatusEl, "local_browser_safari_unsupported");
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const copyTarget = document.createElement("textarea");
  copyTarget.className = "visually-hidden";
  copyTarget.value = text;
  document.body.append(copyTarget);
  try {
    copyTarget.select();
    if (!document.execCommand("copy")) throw new Error("copy failed");
  } finally {
    copyTarget.remove();
  }
}

// Safari will not let an HTTPS page navigate straight to the plain-HTTP local
// host (mixed-content navigation), so a `location.assign` to
// local.system6.aaronlau.me silently fails. Hand the user the address on the
// clipboard plus a fresh tab to paste it into instead of a dead redirect.
async function openSafariHttpLocalEntry() {
  // Safari blocks window.open once the click gesture has been broken by an
  // await, so the blank paste tab must open synchronously here. Keep the
  // handle so a missing or invalid local origin can close it again.
  const blankTab = window.open("", "_blank");
  const capabilities = await window.AISystem6PublicAccess?.getCapabilities?.();
  const origin = capabilities?.public_access?.safari_http_local_origin || "";
  let url;
  try {
    url = window.AISystem6LocalLMStudio.httpLocalEntryUrl(origin);
  } catch (error) {
    blankTab?.close();
    throw error;
  }
  try {
    await copyTextToClipboard(url);
  } catch {
    // Clipboard can be denied; the modal still shows the address to copy by hand.
  }
  await showSystemModal(
    `${t("safari_http_local_copied", url)}\n\n${t("safari_http_local_paste_hint")}`,
    "alert",
    { confirmKey: "ok" }
  );
}

async function connectLocalLmStudio(options = {}) {
  if (window.AISystem6LocalLMStudio?.isSafariPublicWebUnsupported?.()) {
    if (options.toggle !== false) {
      try {
        await openSafariHttpLocalEntry();
      } catch (error) {
        renderLocalConnectionStatus(localConnectionErrorKey(error));
        if (!options.silent) setStatus(t(localConnectionErrorKey(error)), { notify: false });
      }
    } else {
      renderLocalConnectionStatus("local_connection_safari_unsupported");
    }
    return null;
  }
  if (localLmStudioConnectionEnabled && options.toggle !== false) {
    localLmStudioConnectionEnabled = false;
    setModelPickerOptions([], []);
    updateLocalModelState({ server: false, models: false, loaded: false, ready: false, running: false, task: "" });
    renderLocalConnectionStatus("disconnected");
    scheduleSettingsSave();
    return null;
  }
  renderLocalConnectionStatus("connecting");
  try {
    endpointInput.value = window.AISystem6LocalLMStudio.normalizeBaseUrl(endpointInput.value);
    const data = await window.AISystem6LocalLMStudio.listModels({ signal: options.signal });
    const chatModels = Array.isArray(data.chatModels) ? data.chatModels : Array.isArray(data.models) ? data.models : [];
    const embeddingModels = Array.isArray(data.embeddingModels) ? data.embeddingModels : [];
    setModelPickerOptions(chatModels, embeddingModels);
    const loadedModel = syncLoadedLocalModel(data, chatModels);
    const selectedModel = findMatchingModel(chatModels, modelInput.value.trim());
    const ready = !!(selectedModel && (data.autoLoad || loadedModel?.id === selectedModel.id));
    if (modelPickerStatusEl) {
      modelPickerStatusEl.textContent = t("models_found_split", chatModels.length, embeddingModels.length);
    }
    updateLocalModelState({
      server: true,
      models: chatModels.length > 0,
      selected: !!selectedModel,
      loaded: ready,
      ready,
      running: false,
      task: "",
    });
    localLmStudioConnectionEnabled = true;
    renderLocalConnectionStatus("ready", data);
    scheduleSettingsSave();
    return data;
  } catch (error) {
    localLmStudioConnectionEnabled = false;
    renderLocalConnectionStatus(localConnectionErrorKey(error));
    updateLocalModelState({ server: false, models: false, loaded: false, ready: false, running: false, task: "" });
    if (!options.silent) setStatus(t(localConnectionErrorKey(error)), { notify: false });
    return null;
  }
}

function isManualLocalModelMode() {
  return !!localManualModelInputEl()?.checked;
}

function optionTextForModel(model) {
  return model?.name && model.name !== model.id ? `${model.name} (${model.id})` : model?.id || "";
}

function setSelectOptions(select, models, value) {
  if (!select) return;
  const currentValue = String(value || "").trim();
  select.replaceChildren();
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = optionTextForModel(model);
    select.append(option);
  });
  if (currentValue && ![...select.options].some((option) => option.value === currentValue)) {
    const option = document.createElement("option");
    option.value = currentValue;
    option.textContent = currentValue;
    select.append(option);
  }
  select.value = currentValue || select.options[0]?.value || "";
  select.disabled = select.options.length === 0;
}

function syncLocalModelControls() {
  const manual = isManualLocalModelMode();
  const modelSelect = localModelSelectEl();
  const embeddingSelect = localEmbeddingModelSelectEl();
  if (modelSelect) {
    modelSelect.hidden = manual;
    modelSelect.disabled = manual || modelSelect.options.length === 0;
  }
  if (embeddingSelect) {
    embeddingSelect.hidden = manual;
    embeddingSelect.disabled = manual || embeddingSelect.options.length === 0;
  }
  if (modelInput) {
    modelInput.hidden = !manual;
    modelInput.disabled = !manual;
  }
  if (embeddingModelInput) {
    embeddingModelInput.hidden = !manual;
    embeddingModelInput.disabled = !manual;
  }
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
}

function renderContextLengthPresets() {
  const select = contextLengthPresetEl();
  if (!select) return;
  const currentValue = String(contextLengthInput?.value || "").trim();
  const max = Number(typeof currentModelMaxContextTokens === "function" ? currentModelMaxContextTokens() : 0);
  const values = contextLengthPresetValues.filter((value) => !max || value <= max);
  if (max && !values.includes(max)) values.push(max);
  if (currentValue && !values.includes(Number(currentValue))) values.push(Number(currentValue));
  values.sort((a, b) => a - b);
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = typeof t === "function" ? t("context_length_preset") : "Preset";
  select.append(placeholder);
  values.filter((value) => Number.isFinite(value) && value > 0).forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    select.append(option);
  });
  select.value = "";
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
}

function setModelPickerOptions(chatModels, embeddingModels = []) {
  const previousChatModel = modelInput?.value || "";
  const previousEmbeddingModel = embeddingModelInput?.value || "";
  const modelSelect = localModelSelectEl();
  const embeddingSelect = localEmbeddingModelSelectEl();
  modelCatalog = Array.isArray(chatModels) ? chatModels : [];
  embeddingModelCatalog = Array.isArray(embeddingModels) ? embeddingModels : [];

  if (modelCatalog.length) {
    const selected = findMatchingModel(modelCatalog, previousChatModel) || (previousChatModel ? null : modelCatalog[0]);
    if (selected) modelInput.value = selected.id;
    if (selected?.max_context_length) {
      contextMaxByModel[modelContextKey(selected.id)] = {
        max: selected.max_context_length,
        source: selected.max_context_source || "detected",
      };
    }
  }
  setSelectOptions(modelSelect, modelCatalog, modelInput?.value || previousChatModel);

  if (embeddingModelCatalog.length) {
    const selectedEmbedding = findMatchingModel(embeddingModelCatalog, previousEmbeddingModel) || (previousEmbeddingModel ? null : embeddingModelCatalog[0]);
    if (selectedEmbedding) embeddingModelInput.value = selectedEmbedding.id;
  }
  setSelectOptions(embeddingSelect, embeddingModelCatalog, embeddingModelInput?.value || previousEmbeddingModel);
  syncLocalModelControls();
  updateContextMaxForCurrentModel();
  renderContextLengthPresets();
}

function friendlyLocalModelError(message = "") {
  const text = String(message || "");
  if (/ollama_cors_or_offline|ollama_bad_response/i.test(text)) return t("local_connection_ollama_unavailable");
  if (/ollama_api_incompatible/i.test(text)) return t("local_connection_ollama_incompatible");
  if (/ollama_model_missing/i.test(text)) return t("local_connection_ollama_no_models");
  if (/ECONNREFUSED|Failed to fetch|fetch failed|NetworkError|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/i.test(text)) {
    return t("lm_studio_unavailable_short");
  }
  return text || t("lm_studio_unavailable_short");
}

function firstErrorText(...values) {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      const nested = firstErrorText(value.message, value.detail, value.error, value.code, value.type);
      if (nested) return nested;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }
  return "";
}

function findMatchingModel(models, value) {
  const modelName = String(value || "").trim();
  if (!modelName) return null;
  return models.find((model) => model.id === modelName || model.name === modelName)
    || models.find((model) => model.id.includes(modelName) || model.name.includes(modelName))
    || null;
}

function loadedChatModelFromResponse(data, chatModels) {
  if (!data?.loaded) return null;
  return findMatchingModel(chatModels, data.loaded_model || data.loadedModel || data.model || "")
    || chatModels.find((model) => model.loaded)
    || null;
}

function syncLoadedLocalModel(data, chatModels) {
  const loadedModel = loadedChatModelFromResponse(data, chatModels);
  if (!loadedModel) return null;
  activeChatModelIdentifier = "";
  if (data.loaded_context_length) contextLengthInput.value = String(data.loaded_context_length);
  if (loadedModel.max_context_length) {
    contextMaxByModel[modelContextKey(loadedModel.id)] = {
      max: loadedModel.max_context_length,
      source: loadedModel.max_context_source || "detected",
    };
  }
  return loadedModel;
}

async function refreshLocalModelReadiness() {
  if (!localLmStudioConnectionEnabled) return;
  if (localModelState.running) return;
  if (!modelInput.value.trim()) return;
  try {
    const data = await window.AISystem6LocalLMStudio.listModels();
    const chatModels = Array.isArray(data.chatModels) ? data.chatModels : Array.isArray(data.models) ? data.models : [];
    const embeddingModels = Array.isArray(data.embeddingModels) ? data.embeddingModels : [];
    setModelPickerOptions(chatModels, embeddingModels);
    const loadedModel = syncLoadedLocalModel(data, chatModels);
    const selectedModel = findMatchingModel(chatModels, modelInput.value.trim());
    const autoLoadReady = !!(data.autoLoad && selectedModel);
    const loadedMatchesSelected = !!(loadedModel && selectedModel && (
      loadedModel.id === selectedModel.id || loadedModel.name === selectedModel.name
    ));
    const matched = selectedModel || loadedModel;
    if (matched) {
      updateContextMaxForCurrentModel();
      updateLocalModelState({ server: true, models: true, selected: true, loaded: loadedMatchesSelected || autoLoadReady, ready: loadedMatchesSelected || autoLoadReady, running: false, task: "" });
    } else if (chatModels.length) {
      updateLocalModelState({ server: true, models: true, selected: true, loaded: false, ready: false, running: false, task: "" });
    }
    renderLocalConnectionStatus("ready", data);
  } catch (error) {
    renderLocalConnectionStatus(localConnectionErrorKey(error));
    // Leave saved settings intact; the next model action will report any connection issue.
  }
}

function shouldMonitorLocalModelState() {
  return !!modelInput.value.trim()
    || !getWindow("control")?.classList.contains("is-hidden")
    || !getWindow("systemStatus")?.classList.contains("is-hidden");
}

function startLocalModelMonitor() {
  refreshLocalModelReadiness();
  return setInterval(() => {
    if (shouldMonitorLocalModelState()) refreshLocalModelReadiness();
  }, 5000);
}

// Control Panel used to be one long scroll; a phone user could not always
// reach the close box below it. It is now three tabs (Local Model / Cloud
// Model / General), each short enough to fit one screen, following the same
// static tab-switch pattern as the Liquid Cover inspector.
function setControlTab(name) {
  // Cloud is the one-step path (key + Connect); local LM Studio needs a
  // separate app already running, so it's more often the dead end on a first
  // look. Default to cloud, unless local is the one actually in use.
  const localInUse = typeof localModelState !== "undefined"
    && (localModelState?.ready || localModelState?.loaded);
  const target = String(name || (localInUse ? "local" : "cloud"));
  document.querySelectorAll(".control-panel [data-control-tab]").forEach((button) => {
    const active = button.dataset.controlTab === target;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".control-panel [data-control-panel]").forEach((panel) => {
    const active = panel.dataset.controlPanel === target;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();

  // Control Panel has one stable desktop size. Clear any old session height
  // left by the former content-sized behavior while preserving its user-chosen
  // position; the portrait rule can still choose its own automatic height.
  const win = document.querySelector(".control-panel");
  if (win) {
    win.style.height = "";
    win.style.maxHeight = "";
    scheduleWorkingSessionSave?.();
  }
}

function wireControlTabs() {
  document.querySelectorAll(".control-panel [data-control-tab]").forEach((button) => {
    button.addEventListener("click", () => setControlTab(button.dataset.controlTab));
  });
  // Local model readiness is not known yet this early in boot; the markup's
  // own default (Cloud) stands until the window is actually opened, where
  // setControlTab() re-picks with real state.
}

let modelRefreshPromise = null;

async function refreshControlPanelModels() {
  if (modelRefreshPromise || localModelState.running) return modelRefreshPromise;
  modelRefreshPromise = findLmStudioModels({ automatic: true })
    .finally(() => {
      modelRefreshPromise = null;
    });
  return modelRefreshPromise;
}

async function findLmStudioModels(options = {}) {
  setControlLoading(findModelsButton, true, t("models_loading"));
  modelPickerStatusEl.textContent = t("models_loading");
  updateLocalModelState({ server: false, models: false, loaded: false, ready: false, task: t("models_loading") });

  try {
    if (!localLmStudioConnectionEnabled) {
      const connected = await connectLocalLmStudio({ toggle: false, silent: options.automatic === true });
      if (!connected) return;
    }
    const data = await window.AISystem6LocalLMStudio.listModels();

    const chatModels = Array.isArray(data.chatModels) ? data.chatModels : Array.isArray(data.models) ? data.models : [];
    const embeddingModels = Array.isArray(data.embeddingModels) ? data.embeddingModels : [];
    setModelPickerOptions(chatModels, embeddingModels);
    modelPickerStatusEl.textContent = t("models_found_split", chatModels.length, embeddingModels.length);
    const loadedModel = syncLoadedLocalModel(data, chatModels);
    const selectedModel = findMatchingModel(chatModels, modelInput.value.trim());
    const loadedMatchesSelected = !!(loadedModel && selectedModel && (
      loadedModel.id === selectedModel.id || loadedModel.name === selectedModel.name
    ));
    const autoLoadReady = !!(data.autoLoad && selectedModel);
    updateLocalModelState({
      server: true,
      models: chatModels.length > 0,
      selected: !!modelInput.value.trim(),
      loaded: loadedMatchesSelected || autoLoadReady,
      ready: loadedMatchesSelected || autoLoadReady,
      task: "",
    });
    renderLocalConnectionStatus("ready", data);
    if (loadedModel) {
      modelPickerStatusEl.textContent = loadedMatchesSelected
        ? t("models_auto_selected", loadedModel.name || loadedModel.id)
        : `${t("models_found_split", chatModels.length, embeddingModels.length)} · Loaded: ${loadedModel.name || loadedModel.id}`;
    }

    if (!loadedModel && (chatModels.length === 1 || (chatModels.length && !chatModels.some((model) => model.id === modelInput.value.trim())))) {
      const selected = chatModels[0];
      activeChatModelIdentifier = "";
      modelInput.value = selected.id;
      if (localModelSelectEl()) localModelSelectEl().value = selected.id;
      updateContextMaxForCurrentModel();
      modelPickerStatusEl.textContent = t("models_auto_selected", selected.name || selected.id);
      updateLocalModelState({ selected: true });
      scheduleSettingsSave();
    } else if (chatModels.length) {
      updateLocalModelState({ selected: !!modelInput.value.trim() });
    }
  } catch (error) {
    setModelPickerOptions([], []);
    modelPickerStatusEl.textContent = t("models_failed", friendlyLocalModelError(error.message));
    updateLocalModelState({ server: false, models: false, selected: !!modelInput.value.trim(), loaded: false, ready: false, task: "" });
  } finally {
    setControlLoading(findModelsButton, false);
  }
}

async function loadSelectedLmStudioModel() {
  const model = modelInput.value.trim();
  if (!model) {
    loadModelStatusEl.textContent = t("models_failed", t("no_models_found"));
    return;
  }
  const contextConfig = getContextLoadConfig();
  if (!contextConfig) return;

  setControlLoading(loadModelButton, true, t("load_model_loading"));
  loadModelStatusEl.textContent = t("load_model_loading");
  updateLocalModelState({ server: true, selected: true, loaded: false, ready: false, running: true, task: t("load_model_loading") });

  try {
    if (!localLmStudioConnectionEnabled) {
      const connected = await connectLocalLmStudio({ toggle: false });
      if (!connected) throw new Error("lmstudio_server_offline");
    }
    const data = await window.AISystem6LocalLMStudio.loadModel(model, {
      contextLength: contextConfig.contextLength,
    });
    const embeddingModel = embeddingModelInput?.value?.trim() || "";
    let embeddingWarning = "";
    if (embeddingModel) {
      try {
        await window.AISystem6LocalLMStudio.loadModel(embeddingModel);
      } catch (error) {
        embeddingWarning = error?.message || String(error);
      }
    }

    activeChatModelIdentifier = "";
    const loadedModel = data.model || model;
    const loadedContext = data.context_length || contextConfig.contextLength;
    modelInput.value = loadedModel;
    contextLengthInput.value = String(loadedContext);
    if (data.max_context_length) {
      contextMaxByModel[modelContextKey(loadedModel)] = {
        max: data.max_context_length,
        source: data.max_context_source || contextConfig.maxContextSource,
      };
      updateContextMaxForCurrentModel();
    }
    loadModelStatusEl.textContent = embeddingWarning
      ? `${t("load_model_done", loadedModel, loadedContext)} ${t("models_failed", embeddingWarning)}`
      : t("load_model_done", loadedModel, loadedContext);
    updateLocalModelState({ server: true, models: true, selected: true, loaded: true, ready: true, running: false, task: "" });
    scheduleSettingsSave();
  } catch (error) {
    const message = friendlyLocalModelError(error.message);
    loadModelStatusEl.textContent = t("load_model_failed", message);
    updateLocalModelState({ server: message !== t("lm_studio_unavailable_short"), loaded: false, ready: false, running: false, task: "" });
  } finally {
    setControlLoading(loadModelButton, false);
  }
}

async function setupLocalLmStudioModel() {
  if (!setupLocalModelButton) return;
  setControlLoading(setupLocalModelButton, true, t("load_model_loading"));
  setControlLoading(findModelsButton, true, t("models_loading"));
  try {
    const connected = await connectLocalLmStudio({ toggle: false });
    if (connected && modelInput.value.trim()) await loadSelectedLmStudioModel();
  } finally {
    setControlLoading(setupLocalModelButton, false);
    setControlLoading(findModelsButton, false);
  }
}

async function persistDeskState() {
  const endPerf = window.AISystem6Perf?.start("state_save");
  let db;
  let tx;
  let transactionCompletion = null;
  try {
    if (!deskPersistenceWritable) {
      endPerf?.({ blocked: true });
      return false;
    }
    ensureActiveProject();
    syncCurrentNotePadPage();
    const stores = [
      { key: "projects", storeName: projectsStoreName, items: projects },
      { key: "scraps", storeName: scrapsStoreName, items: scraps },
      { key: "trash", storeName: trashStoreName, items: trashItems },
      { key: "chatFolders", storeName: chatFoldersStoreName, items: chatFolders },
      { key: "chatFiles", storeName: chatFilesStoreName, items: chatFiles },
    ].map((entry) => ({
      ...entry,
      snapshot: JSON.stringify(entry.items),
    })).filter((entry) => storageSnapshotCache.get(entry.key) !== entry.snapshot);
    const settingsPayload = settingsSnapshotPayload();
    const settingsSnapshot = JSON.stringify(settingsPayload);
    const shouldWriteSettings = storageSnapshotCache.get("settings") !== settingsSnapshot;
    if (!stores.length && !shouldWriteSettings) {
      endPerf?.({ skipped: true });
      return true;
    }

    db = await openAppDb();
    tx = window.AISystem6StorageTransactions.readwriteTransaction(
      db,
      [
        projectsStoreName, scrapsStoreName, trashStoreName,
        chatFoldersStoreName, chatFilesStoreName, keyvalStoreName
      ]
    );
    transactionCompletion = window.AISystem6StorageTransactions.transactionDone(tx);

    const clearAndPutAll = async (storeName, snapshot) => {
      const store = tx.objectStore(storeName);
      await idbRequest(store.clear());
      const items = JSON.parse(snapshot);
      for (const item of items) {
        await idbRequest(store.put(item));
      }
    };

    await Promise.all(stores.map((entry) =>
      clearAndPutAll(entry.storeName, entry.snapshot)
    ));

    if (shouldWriteSettings) {
      const settingsStore = tx.objectStore(keyvalStoreName);
      await idbRequest(settingsStore.put(JSON.parse(settingsSnapshot), "settings"));
      await idbRequest(settingsStore.put(storageVersion, "storageVersion"));
    }
    await transactionCompletion;
    stores.forEach((entry) => storageSnapshotCache.set(entry.key, entry.snapshot));
    if (shouldWriteSettings) storageSnapshotCache.set("settings", settingsSnapshot);
    endPerf?.({ stores: stores.map((entry) => entry.key).join(","), settings: shouldWriteSettings });
    return true;
  } catch (error) {
    try {
      tx?.abort();
    } catch {}
    await transactionCompletion?.catch(() => {});
    console.error("Failed to save state to IDB:", error);
    storageSnapshotCache.clear();
    endPerf?.({ error: true });
    return false;
  } finally {
    db?.close();
  }
}

async function loadDeskState() {
  lastMigrationNote = t("migration_clean");
  let db;
  let tx;
  let transactionCompletion = null;
  let shouldRewriteSanitizedSettings = false;
  try {
    db = await openAppDb();
    tx = db.transaction([
      projectsStoreName, scrapsStoreName, trashStoreName,
      chatFoldersStoreName, chatFilesStoreName, keyvalStoreName
    ], "readonly");
    transactionCompletion = window.AISystem6StorageTransactions.transactionDone(tx);

    const [
      storedProjects,
      storedScraps,
      storedTrashItems,
      storedChatFolders,
      storedChatFiles,
      settings,
    ] = await Promise.all([
      idbRequest(tx.objectStore(projectsStoreName).getAll()),
      idbRequest(tx.objectStore(scrapsStoreName).getAll()),
      idbRequest(tx.objectStore(trashStoreName).getAll()),
      idbRequest(tx.objectStore(chatFoldersStoreName).getAll()),
      idbRequest(tx.objectStore(chatFilesStoreName).getAll()),
      idbRequest(tx.objectStore(keyvalStoreName).get("settings")),
    ]);
    await transactionCompletion;

    applySettings(settings || {});
    shouldRewriteSanitizedSettings = Object.prototype.hasOwnProperty.call(
      settings || {},
      "localApiToken"
    );
    projects.splice(0, projects.length, ...storedProjects);
    scraps.splice(0, scraps.length, ...storedScraps);
    trashItems.splice(0, trashItems.length, ...storedTrashItems);
    chatFolders.splice(0, chatFolders.length, ...storedChatFolders);
    chatFiles.splice(0, chatFiles.length, ...storedChatFiles);
    deskPersistenceWritable = true;
    storageSnapshotCache.clear();
    storageSnapshotCache.set("projects", JSON.stringify(projects));
    storageSnapshotCache.set("scraps", JSON.stringify(scraps));
    storageSnapshotCache.set("trash", JSON.stringify(trashItems));
    storageSnapshotCache.set("chatFolders", JSON.stringify(chatFolders));
    storageSnapshotCache.set("chatFiles", JSON.stringify(chatFiles));
    if (!shouldRewriteSanitizedSettings) {
      storageSnapshotCache.set("settings", JSON.stringify(settingsSnapshotPayload()));
    }

  } catch (error) {
    try {
      tx?.abort();
    } catch {}
    await transactionCompletion?.catch(() => {});
    console.error("Failed to load state from IDB:", error);
    deskPersistenceWritable = false;
    throw error;
  } finally {
    db?.close();
  }

  const projectStateChanged = ensureActiveProject();
  if (startupProjectId && projects.some((project) => project.id === startupProjectId && !project.archived)) {
    activeProjectId = startupProjectId;
    isProjectMounted = true;
  }
  assignProjectScope(activeProjectId);
  selectedProjectId = activeProjectId;
  if (projectStateChanged || shouldRewriteSanitizedSettings) {
    if (shouldRewriteSanitizedSettings) markDeskDirty("settings");
    const saved = await saveDeskState();
    if (!saved) throw new Error("The initial Project Hard Disk could not be saved.");
  }
  return {
    status: projects.length ? "ready" : "empty",
    projectId: activeProjectId,
  };
}

function applySettings(settings) {
  const localProviderEl = document.getElementById("local-provider");
  if (localProviderEl && settings.localProvider) localProviderEl.value = settings.localProvider;
  const savedEndpoint = String(settings.endpoint || "").trim();
  endpointInput.value = !savedEndpoint || savedEndpoint.startsWith("/")
    ? window.AISystem6LocalLMStudio.defaultBaseUrl(settings.localProvider)
    : savedEndpoint;
  if (typeof localApiTokenInput !== "undefined" && localApiTokenInput) {
    const legacyToken = String(settings.localApiToken || "").trim();
    let sessionToken = "";
    try {
      sessionToken = String(sessionStorage.getItem(localApiTokenSessionKey) || "").trim();
      if (!sessionToken && legacyToken) {
        sessionToken = legacyToken;
        sessionStorage.setItem(localApiTokenSessionKey, legacyToken);
      }
    } catch {
      sessionToken = legacyToken;
    }
    localApiTokenInput.value = sessionToken;
  }
  localLmStudioConnectionEnabled = settings.localLmStudioConnectionEnabled === true;
  if (settings.model && settings.model !== "ai-system-main") {
    modelInput.value = settings.model;
  }
  const manualModelFieldsInput = document.getElementById("manual-model-fields");
  if (manualModelFieldsInput) {
    manualModelFieldsInput.checked = settings.modelFieldInputMode === "manual"
      || settings.localModelInputMode === "manual";
  }
  activeChatModelIdentifier = settings.chatModel || "";
  if (searchProviderInput && ["auto", "duckduckgo", "bing", "deepseek"].includes(settings.searchProvider)) {
    searchProviderInput.value = settings.searchProvider;
  } else if (searchProviderInput) {
    searchProviderInput.value = "auto";
  }
  if (typeof timeMachineProviderInput !== "undefined" && timeMachineProviderInput) {
    timeMachineProviderInput.value = ["auto", "wayback", "archive-is"].includes(settings.timeMachineProvider)
      ? settings.timeMachineProvider
      : "auto";
  }
  if (importerModeInput && ["auto", "markitdown"].includes(settings.importerMode)) {
    importerModeInput.value = settings.importerMode;
  }
  if (ocrEngineInput && ["auto", "tesseract", "paddle"].includes(settings.ocrEngine)) {
    ocrEngineInput.value = settings.ocrEngine;
  } else if (ocrEngineInput) {
    ocrEngineInput.value = "auto";
  }
  if (settings.contextLength) contextLengthInput.value = String(settings.contextLength);
  if (settings.contextLengthByModel && typeof settings.contextLengthByModel === "object") {
    contextLengthByModel = Object.fromEntries(
      Object.entries(settings.contextLengthByModel)
        .map(([key, value]) => [String(key).toLowerCase(), parsePositiveInteger(value)])
        .filter(([, value]) => value >= contextMinLength)
    );
  }
  if (settings.contextLengthUserOverrides && typeof settings.contextLengthUserOverrides === "object") {
    contextLengthUserOverrides = Object.fromEntries(
      Object.entries(settings.contextLengthUserOverrides)
        .map(([key, value]) => [String(key).toLowerCase(), !!value])
    );
  }
  if (settings.contextMaxByModel && typeof settings.contextMaxByModel === "object") {
    contextMaxByModel = Object.fromEntries(
      Object.entries(settings.contextMaxByModel)
        .map(([key, value]) => [String(key).toLowerCase(), {
          max: parsePositiveInteger(value?.max || value),
          source: value?.source || "user",
        }])
        .filter(([, value]) => value.max >= contextMinLength)
    );
  }
  updateContextMaxForCurrentModel();
  if (settings.localModelReady || activeChatModelIdentifier || modelInput.value.trim()) {
    updateLocalModelState({
      server: false,
      models: false,
      selected: !!modelInput.value.trim(),
      loaded: false,
      ready: false,
      running: false,
      task: "",
    });
  }
  if (settings.embeddingModel) {
    embeddingModelInput.value = settings.embeddingModel;
  }
  syncLocalModelControls();
  renderContextLengthPresets();
  if (Array.isArray(settings.excludedContextKeys)) {
    excludedContextKeys.clear();
    settings.excludedContextKeys.forEach((key) => excludedContextKeys.add(key));
  }
  if (settings.compressedConversationMemory && typeof settings.compressedConversationMemory === "object") {
    compressedConversationMemory = {
      text: String(settings.compressedConversationMemory.text || ""),
      sourceMessages: Number(settings.compressedConversationMemory.sourceMessages || 0),
      updatedAt: String(settings.compressedConversationMemory.updatedAt || ""),
    };
  }
  if (typeof settings.remember === "boolean") rememberInput.checked = settings.remember;
  if (typeof settings.projectMounted === "boolean") isProjectMounted = settings.projectMounted;
  if (typeof settings.modernFonts === "boolean") {
    modernFontsInput.checked = settings.modernFonts;
    applyModernFonts({ persist: false });
  }
  if (typeof settings.liquidGlass === "boolean" && liquidGlassInput) {
    liquidGlassInput.checked = settings.liquidGlass;
    applyLiquidGlass({ persist: false });
    try {
      localStorage.setItem("ai-system-6-liquid-glass", String(settings.liquidGlass));
    } catch (error) {
      console.warn("Could not cache appearance preference.", error);
    }
  }
  if (typeof settings.soundEffects === "boolean") {
    soundEffectsInput.checked = settings.soundEffects;
  }
  if (typeof settings.menuClock === "boolean") {
    menuClockInput.checked = settings.menuClock;
  } else {
    menuClockInput.checked = false;
  }
  if (typeof settings.controlStrip === "boolean") controlStripInput.checked = settings.controlStrip;
  if (typeof settings.controlStripCollapsed === "boolean") controlStripCollapsed = settings.controlStripCollapsed;
  if (typeof settings.performanceMeter === "boolean") {
    performanceMeterInput.checked = settings.performanceMeter;
  }
  const imageGenInput = document.getElementById("enable-image-gen");
  if (imageGenInput) {
    imageGenInput.checked = settings.imageGen === true;
    document.body.classList.toggle("image-gen-enabled", settings.imageGen === true);
  }
  const clioWebSearchInput = document.getElementById("clio-web-search");
  if (clioWebSearchInput) {
    clioWebSearchInput.checked = settings.clioWebSearch === true;
  }
  if (typeof refreshClioTalkWebSearchToggle === "function") {
    refreshClioTalkWebSearchToggle();
  }
  if (showResetSystemMenuInput) {
    showResetSystemMenuInput.checked = typeof settings.showResetSystemMenu === "boolean"
      ? settings.showResetSystemMenu
      : true;
  }
  if (settings.language === "zh" || settings.language === "en") currentLanguage = settings.language;
  writerMode = false;
  if (typeof settings.guideSeen === "boolean") guideSeen = settings.guideSeen;
  if (typeof settings.multiFinderSwitcherHintSeen === "boolean") {
    multiFinderSwitcherHintSeen = settings.multiFinderSwitcherHintSeen;
  }
  restoreWritingBellState(settings.writingBell);
  if (typeof restoreAlarmClockState === "function") restoreAlarmClockState(settings.alarmClock);
  restorePuzzleState(settings.puzzle);
  restorePageSetupState(settings.pageSetup);
  if (Array.isArray(settings.notePadPages)) {
    notePadPages = normalizeNotePadPages(settings.notePadPages);
  } else if (typeof settings.notePadText === "string") {
    notePadPages = [settings.notePadText];
  }
  if (Number.isInteger(settings.notePadPageIndex)) notePadPageIndex = settings.notePadPageIndex;
  renderNotePadPage();
  if (Array.isArray(settings.projectCdItems)) {
    projectCdItems.splice(0, projectCdItems.length, ...settings.projectCdItems);
  }
  renderProjectCd();
  if (typeof settings.clipboardText === "string") clipboardText = settings.clipboardText;
  if (typeof settings.clipboardSource === "string") clipboardSource = settings.clipboardSource;
  if (typeof settings.clipboardUpdatedAt === "string") clipboardUpdatedAt = settings.clipboardUpdatedAt;
  if (typeof settings.clipboardTranslationText === "string") clipboardTranslationText = settings.clipboardTranslationText;
  if (typeof settings.clipboardTranslationSourceText === "string") clipboardTranslationSourceText = settings.clipboardTranslationSourceText;
  if (typeof settings.clipboardTranslationLanguage === "string") clipboardTranslationLanguage = settings.clipboardTranslationLanguage;
  if (typeof settings.clipboardTranslationCreatedAt === "string") clipboardTranslationCreatedAt = settings.clipboardTranslationCreatedAt;
  if (typeof settings.clipboardTranslationModel === "string") clipboardTranslationModel = settings.clipboardTranslationModel;
  renderClipboard();
  if (settings.activeProjectId) activeProjectId = settings.activeProjectId;
  if (settings.startupProjectId) startupProjectId = settings.startupProjectId;
  workspaceProfileWasRestored = Object.prototype.hasOwnProperty.call(settings, "workspaceProfile");
  workspaceProfile = normalizeWorkspaceProfile(settings.workspaceProfile);
  syncWorkspaceProfileDom();
  if (settings.startupEnvironment === "finder" || settings.startupEnvironment === "multifinder") {
    startupEnvironment = settings.startupEnvironment;
  } else if (typeof settings.multiFinderEnabled === "boolean") {
    startupEnvironment = settings.multiFinderEnabled ? "multifinder" : "finder";
  }
  startupOpenMode = normalizeStartupOpenMode(settings.startupOpenMode, startupEnvironment);
  if (typeof settings.startupSelectedApplicationAction === "string") {
    startupSelectedApplicationAction = settings.startupSelectedApplicationAction;
  }
  if (typeof settings.startupSelectedApplicationName === "string") {
    startupSelectedApplicationName = settings.startupSelectedApplicationName;
  }
  if (!getStartupSelectedApplicationItem()) {
    startupSelectedApplicationAction = "open-assistant";
    startupSelectedApplicationName = "";
  }
  startupOpenedWindowNames = normalizeStartupOpenedWindowNames(settings.startupOpenedWindowNames);
  runtimeEnvironment = startupEnvironment;
  if (settings.windowViewModes && typeof settings.windowViewModes === "object") {
    Object.entries(settings.windowViewModes).forEach(([name, mode]) => {
      if (viewWindowNames.includes(name)) windowViewModes[name] = normalizeFinderViewMode(mode);
    });
  }
  if (localProviderEl && settings.localProvider) {
    const btn = typeof loadModelButton !== "undefined" ? loadModelButton : document.getElementById("load-model");
    const status = typeof loadModelStatusEl !== "undefined" ? loadModelStatusEl : document.getElementById("load-model-status");
    if (settings.localProvider === "lm-studio") {
      if (btn) btn.disabled = false;
      if (status) status.textContent = t("load_model_hint");
    } else {
      if (btn) btn.disabled = true;
      if (status) {
        status.textContent = t(settings.localProvider === "ollama" ? "ollama_auto_load_hint" : "custom_auto_load_hint");
      }
    }
  }
}

function updateClock() {
  renderSystemClock();
}

function renderSystemClock(now = new Date()) {
  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (clockEl) {
    const showMenuClock = !!menuClockInput?.checked;
    clockEl.classList.toggle("is-hidden", !showMenuClock);
    clockEl.setAttribute("aria-hidden", showMenuClock ? "false" : "true");
    clockEl.textContent = showMenuClock ? time : "";
  }
  if (statusClockTimeEl) {
    statusClockTimeEl.textContent = time;
  }
  if (statusClockDateEl) {
    statusClockDateEl.textContent = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
}

function updateMenuStatus() {
  renderProjectSwitcher();
  renderMultiFinderMenu();
}

function formatAppVersion() {
  return t("about_version_value", appVersionInfo.version, appVersionInfo.build);
}

function formatAppVersionCompact() {
  return `Build ${appVersionInfo.build}`;
}

async function loadAppVersion() {
  try {
    const response = await fetch("/api/version");
    if (!response.ok) throw new Error(response.statusText);
    const info = await response.json();
    appVersionInfo = {
      version: String(info.version || defaultAppVersionInfo.version),
      build: String(info.build || defaultAppVersionInfo.build),
    };
  } catch (error) {
    console.warn("Could not read app version", error);
    appVersionInfo = { ...defaultAppVersionInfo };
  } finally {
    renderAboutMacintosh();
  }
}

function renderAboutMacintosh() {
  if (aboutVersionEl) aboutVersionEl.textContent = formatAppVersionCompact();
  const cloudActive = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady();
  const aboutModelLabelEl = document.getElementById("about-model-label");
  if (aboutModelLabelEl) aboutModelLabelEl.textContent = cloudActive ? t("about_cloud_model") : t("about_model");
  if (aboutModelEl) {
    aboutModelEl.textContent = cloudActive
      ? (cloudConfig.model || t("cloud_model"))
      : getLocalModelDisplayName();
  }
  renderSystemStatus();
}

function renderCloudStatePanel() {
  const nameEl = document.getElementById("system-cloud-name");
  const dotEl = document.getElementById("system-cloud-dot");
  const statusEl = document.getElementById("system-cloud-status");
  const contextEl = document.getElementById("system-cloud-context");
  const latestEl = document.getElementById("system-cloud-latest");
  const sessionEl = document.getElementById("system-cloud-session");
  const balanceEl = document.getElementById("system-cloud-balance");
  if (!nameEl) return;

  const cfg = (typeof cloudConfig !== "undefined") ? cloudConfig : null;
  nameEl.textContent = typeof cloudModelRouteLabel === "function"
    ? cloudModelRouteLabel(cfg)
    : (cfg?.model || "-");

  const realDot = document.getElementById("cloud-status-indicator");
  const connected = realDot?.classList.contains("is-connected");
  const errored = realDot?.classList.contains("is-error");
  if (dotEl) {
    dotEl.className = "cloud-status-dot" + (connected ? " is-connected" : errored ? " is-error" : "");
  }
  if (statusEl) {
    statusEl.textContent = connected ? t("cloud_connected") : errored ? t("cloud_error") : t("cloud_active_hint").split(".")[0];
  }

  if (contextEl) {
    contextEl.textContent = typeof currentContextWindowText === "function" ? currentContextWindowText(cfg) : "-";
  }

  if (latestEl) latestEl.textContent = (typeof cloudUsageText === "function" && typeof latestCloudUsage !== "undefined") ? cloudUsageText(latestCloudUsage) : "-";
  if (sessionEl) sessionEl.textContent = (typeof cloudUsageText === "function" && typeof sessionCloudUsage !== "undefined") ? cloudUsageText(sessionCloudUsage) : "-";

  if (balanceEl) {
    if (cfg?.balance) {
      balanceEl.textContent = typeof cloudBalanceText === "function" ? cloudBalanceText(cfg) : `${cfg.balance.currency || "CNY"} ${Number(cfg.balance.total).toFixed(2)}`;
    } else {
      try {
        const local = JSON.parse(localStorage.getItem("ai-system6-cloud-usage"));
        balanceEl.textContent = local?.cost_cny ? `Spent ¥${local.cost_cny.toFixed(4)}` : "-";
      } catch { balanceEl.textContent = "-"; }
    }
  }
}

function renderSystemStatus() {
  const now = new Date();
  const project = getActiveProject();
  const projectFiles = getProjectFiles();
  const projectScraps = getProjectScraps();
  const projectRefs = isProjectMounted
    ? projectReferences.filter((reference) => reference.projectId === activeProjectId)
    : [];
  const mountedChunks = getMountedTextDiskChunks();
  const textDiskMounted = isProjectMounted
    && mountedTextDisk.projectId === activeProjectId
    && mountedChunks.length > 0;

  const isCloud = (typeof cloudConfig !== "undefined") && cloudConfig?.active && cloudCredentialReady();

  renderSystemClock(now);
  if (statusModelEl) statusModelEl.textContent = getLocalModelDisplayName();
  renderLocalModelState();
  renderCloudStatePanel();
  if (statusVersionEl) statusVersionEl.textContent = formatAppVersionCompact();
  if (statusProjectEl) statusProjectEl.textContent = project?.name || t("no_project_mounted");
  if (statusTextDiskEl) {
    statusTextDiskEl.textContent = textDiskMounted
      ? t("about_text_disk_summary", mountedTextDisk.files.length, mountedChunks.length)
      : t("about_text_disk_none");
  }
  if (statusContextEl) {
    statusContextEl.textContent = t("about_context_summary", projectFiles.length, projectScraps.length, projectRefs.length);
  }
  if (statusModelStateEl) {
    statusModelStateEl.textContent = isCloud ? t("cloud_model") : modelStateCurrentStep();
  }
  if (statusCurrentTaskEl) {
    statusCurrentTaskEl.textContent = localModelState.running
      ? (localModelState.task || t("working_locally"))
      : t("no_current_task");
  }
  if (statusModeEl) {
    const modeLabel = isMultiFinderMode()
      ? `${t("multifinder")} (${t("multifinder_multi_task")})`
      : `${t("finder")} (${t("finder_single_task")})`;
    const workspaceLabel = t(workspaceProfile === workspaceProfileDesktop ? "workspace_desktop" : "workspace_writing");
    statusModeEl.textContent = !isMultiFinderMode() && sideAskEnabled
      ? `${workspaceLabel} · ${modeLabel} · ${t("sideask")}`
      : `${workspaceLabel} · ${modeLabel}`;
  }
}

function formatNotificationTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function notificationStateLabel(state) {
  if (state === "running") return t("notification_state_running");
  if (state === "done") return t("notification_state_done");
  if (state === "failed") return t("notification_state_failed");
  if (state === "stopped") return t("notification_state_stopped");
  return "";
}

function updateNotificationIndicator() {
  if (!notificationCenterCountEl || !notificationCenterButton) return;
  const count = unreadSystemNotifications;
  notificationCenterCountEl.textContent = count > 9 ? "9+" : String(count);
  notificationCenterButton.classList.toggle("is-hidden", count <= 0);
  notificationCenterButton.classList.toggle("has-unread", count > 0);
  notificationCenterButton.setAttribute("aria-label", count > 0
    ? t("notification_center_unread", count)
    : t("notification_center"));
}

function renderNotificationCenter() {
  if (!notificationCenterListEl) return;
  unreadSystemNotifications = 0;
  updateNotificationIndicator();

  if (notificationCenterSummaryEl) {
    notificationCenterSummaryEl.textContent = systemNotifications.length
      ? t("notifications_count", systemNotifications.length)
      : t("notifications_empty");
  }

  notificationCenterListEl.replaceChildren();
  if (!systemNotifications.length) {
    const empty = document.createElement("div");
    empty.className = "notification-empty";
    empty.textContent = t("notifications_empty_detail");
    notificationCenterListEl.append(empty);
    return;
  }

  systemNotifications.forEach((item) => {
    const row = document.createElement("div");
    row.className = "notification-item";
    if (item.state) row.dataset.state = item.state;

    const body = document.createElement("div");
    body.className = "notification-item-body";
    const message = document.createElement("b");
    message.textContent = item.message;
    const meta = document.createElement("small");
    const state = notificationStateLabel(item.state);
    meta.textContent = state
      ? `${state} · ${formatNotificationTime(item.createdAt)}`
      : formatNotificationTime(item.createdAt);
    body.append(message, meta);
    row.append(body);

    if (item.windowName) {
      const button = document.createElement("button");
      button.className = "btn mini-btn notification-open-button";
      button.type = "button";
      button.textContent = item.actionLabel || t("open");
      button.addEventListener("click", () => openSystemNotification(item.id));
      row.append(button);
    }

    notificationCenterListEl.append(row);
  });
}

function pushSystemNotification(message, options = {}) {
  const text = String(message || "").trim();
  if (!text) return "";

  const now = new Date();
  let item = options.replaceId
    ? systemNotifications.find((entry) => entry.id === options.replaceId)
    : null;
  const wasExisting = !!item;
  const previousState = item?.state || "";

  if (item) {
    item.message = text;
    item.createdAt = now;
    item.state = options.state || item.state || "";
    item.windowName = options.windowName ?? item.windowName;
    item.actionLabel = options.actionLabel ?? item.actionLabel;
  } else {
    item = null;
  }

  const last = systemNotifications[0];
  if (!item && last && last.message === text && now - last.createdAt < 2000) {
    last.createdAt = now;
    last.state = options.state || last.state || "";
    last.windowName = options.windowName ?? last.windowName;
    last.actionLabel = options.actionLabel ?? last.actionLabel;
    item = last;
  } else {
    item = item || {
      id: crypto.randomUUID(),
      message: text,
      createdAt: now,
      state: options.state || "",
      windowName: options.windowName || "",
      actionLabel: options.actionLabel || "",
    };
    if (!wasExisting) {
      systemNotifications.unshift(item);
      systemNotifications.splice(16);
    }
  }

  const center = getWindow("notificationCenter");
  if (center && !center.classList.contains("is-hidden")) {
    renderNotificationCenter();
  } else if (!wasExisting || (item.state && item.state !== "running" && item.state !== previousState)) {
    unreadSystemNotifications += 1;
    updateNotificationIndicator();
  }
  return item.id;
}

function openSystemNotification(id) {
  const item = systemNotifications.find((entry) => entry.id === id);
  if (!item?.windowName) return;
  openWindow(item.windowName);
  const target = getWindow(item.windowName);
  if (target) focusWindow(target);
}

function clearSystemNotifications() {
  systemNotifications.splice(0);
  unreadSystemNotifications = 0;
  updateNotificationIndicator();
  renderNotificationCenter();
}

function isSystemReceiptStatusMessage(message) {
  const normalized = String(message || "").toLowerCase();
  return /(failed|could not|not responding|connection error|error|stopped|aborted|needs a loaded local model|失败|无法|未能|没有响应|连接失败|没有读懂|没有可用|需要已加载|已停止|已取消)/.test(normalized);
}

function firstActiveLongTaskKey() {
  return activeLongTasks.values().next().value || "";
}

function markActiveLongTaskFailed(message) {
  const key = firstActiveLongTaskKey();
  if (!key) return "";
  const task = activeLongTaskDetails.get(key);
  if (!task) return "";
  task.failed = true;
  task.failureMessage = message;
  if (!task.notificationId) return "";
  return pushSystemNotification(message, {
    replaceId: task.notificationId,
    state: "failed",
    windowName: task.windowName,
    actionLabel: t("open"),
  });
}

function setStatus(text, options = {}) {
  const message = decorateStatusMessage(text);
  statusEl.textContent = message;
  statusEl.hidden = String(text || "").trim() === String(t("ready") || "").trim();
  const shouldNotify = options.notify === true || (options.notify !== false && isSystemReceiptStatusMessage(message));
  if (!shouldNotify) return;
  const updatedTaskNotification = isSystemReceiptStatusMessage(message) ? markActiveLongTaskFailed(message) : "";
  if (!updatedTaskNotification) {
    pushSystemNotification(message, {
      state: options.state || "",
      windowName: options.windowName || "",
      actionLabel: options.actionLabel || t("open"),
    });
  }
}

function formatTeachTextSourceMeta(meta = {}) {
  return [
    meta.source ? `Source: ${meta.source}` : "",
    meta.title ? `Title: ${meta.title}` : "",
    meta.outline ? `Outline: ${meta.outline}` : "",
    Array.isArray(meta.clips) && meta.clips.length ? `Clips: ${meta.clips.join(", ")}` : "",
    meta.url ? `URL: ${meta.url}` : "",
    `Inserted: ${new Date().toLocaleString()}`,
  ].filter(Boolean).join("\n");
}

function teachTextStartsWithTitle(text, title) {
  if (!title) return false;
  const firstLine = String(text || "").trimStart().split("\n")[0]?.trim() || "";
  return firstLine.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === String(title).trim().toLowerCase();
}

function formatTeachTextInsertion(content, meta = {}) {
  const text = String(content || "").trim();
  if (!text) return "";
  const heading = meta.title && !teachTextStartsWithTitle(text, meta.title) ? `### ${meta.title.trim()}` : "";
  if (meta.plain) return [heading, text].filter(Boolean).join("\n\n").trim();
  const source = formatTeachTextSourceMeta(meta);
  return [heading, text, source ? `<!-- AI System 6 insertion\n${source}\n-->` : ""].filter(Boolean).join("\n\n").trim();
}

function insertIntoTeachText(content, meta = {}) {
  const insertBody = formatTeachTextInsertion(content, meta);
  if (!insertBody) return false;
  if (getWindow("teachText").classList.contains("is-hidden")) {
    if (typeof activateTeachTextManuscriptTab === "function") activateTeachTextManuscriptTab({ focus: false });
    else newTextDocument();
  } else if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) {
    activateTeachTextManuscriptTab({ focus: false });
  }

  const start = teachTextBodyInput.selectionStart ?? teachTextBodyInput.value.length;
  const end = teachTextBodyInput.selectionEnd ?? teachTextBodyInput.value.length;
  const before = teachTextBodyInput.value.slice(0, start);
  const after = teachTextBodyInput.value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !insertBody.endsWith("\n") ? "\n\n" : "";
  const insertText = `${prefix}${insertBody}${suffix}`;
  teachTextBodyInput.value = `${before}${insertText}${after}`;
  const cursor = before.length + insertText.length;
  teachTextBodyInput.setSelectionRange(cursor, cursor);
  markTeachTextModified();
  updateTeachTextBoundaries();
  updateTeachTextTranslateButton();
  updateTeachTextBilingualExportButton();
  openWindow("teachText");
  teachTextBodyInput.focus();
  return true;
}

function updateLongTaskControls() {
  const busy = activeLongTasks.size > 0;
  document.body.classList.toggle("is-busy", busy);
  longTaskControlSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((control) => {
      control.disabled = busy;
    });
  });
  document.querySelectorAll("[data-long-task='draft-section']").forEach((control) => {
    control.disabled = busy;
  });
  setComposerSubmitMode(busy || !!activeAbortController || form.classList.contains("is-generating"));
  window.AISystem6ControlStrip?.refreshStrip?.();
}

function longTaskReceiptInfo(key, statusText = "") {
  const fallback = String(statusText || t("working_locally")).replace(/\.\.\.$/, "");
  const info = {
    "generate-outline": { label: t("outline"), windowName: "outline" },
    "organize-question-sheet": { label: t("question_sheet"), windowName: "questionSheet" },
    "expand-outline": { label: t("outline"), windowName: "outline" },
    "outline-mingming": { label: t("outline"), windowName: "outline" },
    "writing-tool": { label: t("writing_tools"), windowName: "" },
    "revise-draft": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "polish-draft": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "suggest-draft": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "draft-section": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "claim-check": { label: t("review_desk"), windowName: "reviewDesk" },
    "claim-check-section": { label: t("review_desk"), windowName: "reviewDesk" },
    "style-check": { label: t("review_desk"), windowName: "reviewDesk" },
    "style-check-section": { label: t("review_desk"), windowName: "reviewDesk" },
    "mingming-review-section": { label: t("review_desk"), windowName: "reviewDesk" },
    "mingming-handoff-review": { label: t("review_desk"), windowName: "reviewDesk" },
    "mingming-handoff-backstage-review": { label: t("review_desk"), windowName: "reviewDesk" },
    "marp-slides": { label: "Marp", windowName: "clioStage" },
    "translate-document": { label: t("translate"), windowName: "teachText" },
    "translate-selection": { label: t("translate"), windowName: "teachText" },
    "bilingual-export": { label: t("project_cd"), windowName: "projectCd" },
    "dictionary": { label: t("dictionary"), windowName: "dictionary" },
    "docmap": { label: t("docmap"), windowName: "docMap" },
    "docmap-question-sheet": { label: t("question_sheet"), windowName: "questionSheet" },
    "reader-manuscript-polish": { label: t("reader"), windowName: "reader" },
    "rebuild-flow": { label: t("rebuild_article"), windowName: "rebuildFlow" },
  }[key] || {};
  return {
    label: info.label || fallback,
    windowName: info.windowName || "",
  };
}

function beginLongTask(key, statusText = "") {
  if (activeAbortController || activeLongTasks.size > 0) {
    setStatus(t("task_already_running", localModelState.task || t("working_locally")));
    return false;
  }
  activeAbortController = new AbortController();
  activeLongTasks.add(key);
  const receipt = longTaskReceiptInfo(key, statusText);
  const shouldCreateReceipt = key !== "dictionary";
  const notificationId = shouldCreateReceipt
    ? pushSystemNotification(t("notification_task_started", receipt.label), {
        state: "running",
        windowName: receipt.windowName,
        actionLabel: t("open"),
      })
    : "";
  activeLongTaskDetails.set(key, {
    ...receipt,
    statusText,
    notificationId,
    failed: false,
    failureMessage: "",
  });
  updateLocalModelState({ running: true, task: statusText || t("working_locally") });
  if (statusText) setStatus(statusText, { notify: false });
  updateLongTaskControls();
  return true;
}

function endLongTask(key) {
  const cancelled = activeAbortController?.signal?.aborted === true;
  const task = activeLongTaskDetails.get(key);
  activeLongTasks.delete(key);
  activeLongTaskDetails.delete(key);
  if (!activeLongTasks.size) activeAbortController = null;
  updateLocalModelState({ running: false, task: "" });
  updateLongTaskControls();
  if (cancelled) {
    if (task?.notificationId) {
      pushSystemNotification(t("notification_task_stopped", task.label), {
        replaceId: task.notificationId,
        state: "stopped",
        windowName: task.windowName,
        actionLabel: t("open"),
      });
    }
    setStatus(t("stopped"), { notify: false });
  } else if (task?.failed) {
    if (task.notificationId && task.failureMessage) {
      pushSystemNotification(task.failureMessage, {
        replaceId: task.notificationId,
        state: "failed",
        windowName: task.windowName,
        actionLabel: t("open"),
      });
    }
  } else {
    if (task?.notificationId) {
      pushSystemNotification(t("notification_task_done", task.label), {
        replaceId: task.notificationId,
        state: "done",
        windowName: task.windowName,
        actionLabel: t("open"),
      });
    }
    playSystemSound("done");
  }
  return cancelled;
}

function getLongTaskSignal() {
  return activeAbortController?.signal;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function decorateStatusMessage(text) {
  const message = String(text || "");
  if (!message || isPlainStatusMessage(message)) return message;
  if (/Searcher|DuckDuckGo|网页搜索|寻源|Bing/i.test(message)) return message;

  const explanation = explainStatusError(message);
  if (!explanation || message.includes(explanation)) return message;
  return `${message} · ${explanation}`;
}

function isPlainStatusMessage(message) {
  return [
    t("ready"),
    t("saved"),
    t("thinking"),
    t("stopped"),
    t("translating_document"),
    t("translating_selection"),
    t("checking_style"),
    t("reader_fetching"),
  ].includes(message);
}

function explainStatusError(message) {
  const normalized = message.toLowerCase();
  const rules = [
    {
      match: /(lmstudio_context_length|context length|tokens to keep|too many tokens|prompt.*too long|input.*too long|shorter input|larger context|上下文|输入.*太长)/,
      zh: "说明：超上下文限制。请缩短输入或调大 context length。",
      en: "Note: Exceeds context. Shorten input or raise context length.",
    },
    {
      match: /(lmstudio_server_offline|failed to fetch|fetch failed|networkerror|econnrefused|connection refused|not responding|无法连接|连接失败|没有响应)/,
      zh: "说明：本地服务无响应。请确认服务已开启。",
      en: "Note: Local server offline. Make sure it is running.",
    },
    {
      match: /(lmstudio_endpoint_missing|404|not found|找不到)/,
      zh: "说明：端点路径错误。请检查服务 API 设置。",
      en: "Note: Wrong endpoint. Check API settings.",
    },
    {
      match: /(lmstudio_model_not_loaded|model .*not found|model_not_found|no models found|model does not exist|model .*not loaded|no model loaded|未找到模型|找不到模型|模型.*未加载)/,
      zh: "说明：模型未加载。请在控制面板选择并加载。",
      en: "Note: Model not loaded. Select and Load in Control Panel.",
    },
    {
      match: /(lmstudio_timeout|timeout|timed out|aborted|超时)/,
      zh: "说明：请求超时。请缩短文本或稍后重试。",
      en: "Note: Request timed out. Shorten text or retry.",
    },
    {
      match: /(empty writing object pack stream|empty translation|lmstudio_bad_response|did not include choices|malformed|unexpected token|invalid json|坏格式|格式异常)/,
      zh: "说明：格式异常。请重试或简化任务。",
      en: "Note: Bad response. Retry or simplify task.",
    },
    {
      match: /(401|403|unauthorized|forbidden|api key|认证|权限)/,
      zh: "说明：认证失败，请检查服务设置。",
      en: "Note: Auth failed. Check service settings.",
    },
    {
      match: /(500|502|503|internal server error|bad gateway|service unavailable|服务器错误)/,
      zh: "说明：本地服务错误，请稍后重试。",
      en: "Note: Local server error. Retry later.",
    },
  ];
  const rule = rules.find((item) => item.match.test(normalized));
  if (!rule) return "";
  return currentLanguage === "zh" ? rule.zh : rule.en;
}

function classifyLmStudioError(error, response = null) {
  const message = String(error?.message || error || response?.statusText || "");
  const lower = message.toLowerCase();
  const isCloudError = /cloud api|deepseek|cloud proxy|cloud_invalid|cloud_insufficient|cloud_rate|shared_cloud/.test(lower);
  if (/shared_cloud_(?:session_limit|daily_request_limit|daily_token_limit)/.test(lower)) {
    return "cloud_shared_limit";
  }
  if (
    /cloud_invalid_key/.test(lower)
    || (isCloudError && (response?.status === 401 || /authentication.*fail|unauthorized|invalid.*api key|api key.*invalid|missing api key/.test(lower)))
  ) return "cloud_invalid_key";
  if (
    /cloud_insufficient_balance/.test(lower)
    || (isCloudError && (response?.status === 402 || /insufficient.*balance|balance.*insufficient/.test(lower)))
  ) return "cloud_insufficient_balance";
  if (
    /cloud_rate_limit/.test(lower)
    || (isCloudError && (response?.status === 429 || /rate limit|too many requests/.test(lower)))
  ) return "cloud_rate_limit";
  if (
    /cloud_invalid_request/.test(lower)
    || (isCloudError && (
      [400, 422].includes(response?.status)
      || /invalid (?:format|parameter|request)|unprocessable/.test(lower)
    ))
  ) return "cloud_invalid_request";
  if (/shared_cloud_input_too_large/.test(lower)) return "lmstudio_context_length";
  if (
    /cloud_service_unavailable/.test(lower)
    || (isCloudError && (
      [500, 503].includes(response?.status)
      || /server error|service unavailable|overloaded/.test(lower)
    ))
  ) return "cloud_service_unavailable";
  if (/context length|tokens to keep|too many tokens|prompt.*too long|input.*too long|shorter input|larger context/.test(lower)) return "lmstudio_context_length";
  if (/failed to fetch|fetch failed|networkerror|econnrefused|connection refused|not responding/.test(lower)) return "lmstudio_server_offline";
  if (/timeout|timed out|aborted/.test(lower)) return "lmstudio_timeout";
  if (/model .*not found|model_not_found|model does not exist|model .*not loaded|no model loaded/.test(lower)) return "lmstudio_model_not_loaded";
  if (/did not include choices|empty writing object pack stream|empty translation|malformed|unexpected token|invalid json/.test(lower)) return "lmstudio_bad_response";
  if (response?.status === 404) return "lmstudio_endpoint_missing";
  if ([502, 503, 504].includes(response?.status)) return "lmstudio_server_offline";
  return "";
}

async function readChatJson(response) {
  const data = await response.json().catch((error) => {
    throw new Error(`lmstudio_bad_response: ${error.message}`);
  });
  if (!response.ok) {
    const detail = data.detail || data.error || response.statusText || `HTTP ${response.status}`;
    const code = data.code || classifyLmStudioError(detail, response);
    throw new Error([code, detail].filter(Boolean).join(": "));
  }
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error("lmstudio_bad_response: response did not include choices[0].message.content");
  }
  return data;
}
