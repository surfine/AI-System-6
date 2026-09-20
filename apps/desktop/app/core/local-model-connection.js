// Local model connection and selection.
//
// Owns: which local provider endpoint the desk is pointed at, whether it can be
// reached, which chat/embedding models it offers, which one is selected and
// loaded, the context-length options that follow from those models, and the
// Control Panel surfaces that report all of it.
//
// Depends on: the local model client (window.AISystem6LocalLMStudio), the desk's
// model state in app.js (localModelState, localLmStudioConnectionEnabled, the
// context-length maps), the Control Panel handles, and saveDeskState() when a
// choice is persisted. It does not own saving, the write lease, cross-window
// protocol, or the readiness poll - those live in persistence-status.js and
// local-model-monitor.js respectively. It was split out of persistence-status.js
// so a change to how the desk talks to a local server cannot reach into the
// save path.
//
// Entry points: connectLocalLmStudio(), detectLocalModelConnection(),
// resetAiConnection(), updateLocalModelState(), renderLocalModelState(),
// findLmStudioModels(), setupLocalLmStudioModel(), loadSelectedLmStudioModel().
// Behaviour is covered by the boot, Control Panel and model-state contracts.

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
  // [lane-honesty] Clipboard writes can be denied by the browser; the modal
  // must not claim "copied" unless the write actually landed.
  let clipboardCopied = true;
  try {
    await copyTextToClipboard(url);
  } catch {
    clipboardCopied = false;
  }
  const copyStatusKey = clipboardCopied ? "safari_http_local_copied" : "safari_http_local_not_copied";
  // The address and the paste hint are instructions to keep on screen while the
  // other tab is used, which is exactly what a dialog stops.
  pushSystemNotification(`${t(copyStatusKey, url)}\n\n${t("safari_http_local_paste_hint")}`);
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
    let selectedModel = loadedModel
      || findMatchingModel(chatModels, activeChatModelIdentifier)
      || findMatchingModel(chatModels, modelInput.value.trim());
    if (selectedModel && loadedModel) {
      modelInput.value = selectedModel.id;
      if (localModelSelectEl()) localModelSelectEl().value = selectedModel.id;
      updateContextMaxForCurrentModel();
    }
    // A previous endpoint can leave its model id in the shared input. Normal
    // picker mode must select from the new endpoint's actual inventory or the
    // connection looks successful while every composer remains disabled.
    // Manual mode intentionally keeps the operator's explicit model id.
    if (!selectedModel && chatModels.length && !isManualLocalModelMode()) {
      selectedModel = chatModels[0];
      modelInput.value = selectedModel.id;
      if (localModelSelectEl()) localModelSelectEl().value = selectedModel.id;
      updateContextMaxForCurrentModel();
    }
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
  window.AISystem6ModelRoles?.syncSelects?.(modelCatalog);
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
  // The commonest local failure by far, and the one that reached a reader raw:
  // the server is up and answering, but the model this desk has selected is not
  // among the ones downloaded into it. The name is the useful part, so it is
  // kept; the upstream code is not a sentence and was never meant to be read.
  const missingModel = text.match(/(?:Failed to load LLM|not found in downloaded models)[^'"“]*['"“]([^'"”]+)['"”]/i)
    || text.match(/model_not_found[^'"“]*['"“]([^'"”]+)['"”]/i);
  if (missingModel) return t("local_model_not_downloaded", missingModel[1]);
  if (/model_not_found|not found in downloaded models|Failed to load LLM/i.test(text)) {
    return t("local_model_not_downloaded", "");
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

async function detectLocalModelConnection() {
  const provider = document.getElementById("local-provider");
  const status = document.getElementById("local-detection-status");
  const button = document.getElementById("detect-local-models");
  if (!provider) return false;
  setControlLoading(button, true, t("local_detection_checking"));
  for (const candidate of ["lm-studio", "ollama"]) {
    provider.value = candidate;
    provider.dispatchEvent(new Event("change", { bubbles: true }));
    const data = await connectLocalLmStudio({ toggle: false, silent: true });
    if (data) {
      if (status) status.textContent = t(candidate === "ollama" ? "local_detection_found_ollama" : "local_detection_found_lm_studio");
      setControlLoading(button, false);
      return true;
    }
  }
  if (status) status.textContent = t("local_detection_none");
  setControlLoading(button, false);
  return false;
}

async function resetAiConnection() {
  window.AISystem6ClioImages?.invalidateCredentials?.("clio_image_connection_reset");
  window.AISystem6ClioProvider?.setPreference?.("auto", { persist: false });
  localLmStudioConnectionEnabled = false;
  const provider = document.getElementById("local-provider");
  if (provider) provider.value = "lm-studio";
  endpointInput.value = window.AISystem6LocalLMStudio.defaultBaseUrl("lm-studio");
  modelInput.value = "";
  if (typeof embeddingModelInput !== "undefined" && embeddingModelInput) embeddingModelInput.value = "";
  setModelPickerOptions([], []);
  updateLocalModelState({ server: false, models: false, selected: false, loaded: false, ready: false, running: false, task: "" });
  renderLocalConnectionStatus("local_connection_waiting");
  if (typeof cloudConfig !== "undefined") cloudConfig = null;
  if (typeof saveCloudConfig === "function") saveCloudConfig();
  if (typeof setCloudRuntimeApiKey === "function") setCloudRuntimeApiKey("");
  const cloudProvider = document.getElementById("cloud-provider");
  const cloudKey = document.getElementById("cloud-api-key");
  const cloudModel = document.getElementById("cloud-model");
  if (cloudProvider) cloudProvider.value = "";
  if (cloudKey) cloudKey.value = "";
  if (cloudModel) cloudModel.value = "";
  document.getElementById("cloud-model-select")?.replaceChildren();
  await saveDeskState();
  setStatus(t("reset_ai_connection_done"), { notify: false });
  setControlTab("cloud");
  return true;
}

// Control Panel used to be one long scroll; a phone user could not always
// reach the close box below it. It is now three tabs (Local Model / Cloud
// Model / General), each short enough to fit one screen, following the same
// static tab-switch pattern as the Liquid Cover inspector.
