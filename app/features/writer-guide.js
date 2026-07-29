// Feature module: writer-guide.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



async function enterWriterMode() {
  writerMode = true;
  document.body.classList.add("is-writer-mode");

  ["control", "rag", "textDisk", "disk", "helpFolder", "projects", "finder", "documents", "chatFile", "trash", "saveChat", "writingBell", "notePad", "clipboard", "alarmClock", "calculator", "puzzle", "memoryCards", "keyCaps", "systemStatus", "modelMeter", "contextPanel", "findPath", "findFile", "printDirectory", "pageSetup", "reader", "guide", "systemHelp", "scrapbook", "sectionDrafts", "reviewDesk"].forEach(closeWindow);
  if (getWindow("teachText").classList.contains("is-hidden")) {
    newTextDocument();
  } else {
    await openWindow("teachText");
  }

  await openWindow("assistant");
  setAssistantDesklet(true);
  focusWindow(getWindow("teachText"));
  applyLanguage();
  saveDeskState();
}

function leaveWriterMode() {
  writerMode = false;
  clearSideAskMode();
  document.body.classList.remove("is-writer-mode");
  setAssistantDesklet(false);
  openWindow("assistant");
  tileWindows();
  applyLanguage();
  saveDeskState();
}

function toggleWriterMode() {
  if (writerMode) {
    leaveWriterMode();
  } else {
    enterWriterMode();
  }
}

function dismissGuide() {
  // "Start Here" strongly recommends a working model, but must not lock the
  // desktop. The existing menu-bar model indicator remains the single visible
  // source of truth when the user continues without AI.
  guideSeen = true;
  closeWindow("guide");
  saveDeskState();
}

// First-run gating. Nothing on the writing route works without a model, so the
// guide shows the one thing that is actually blocking the user: connect a
// model, or — once one is reachable — start the route.
//
// The setup here is a thin remote control over the Control Panel's own
// controls. It writes into those elements and triggers their existing
// handlers, so `cloudConfig`, persistence, validation and status stay in one
// implementation instead of a second copy that can drift.

function guideModelReady() {
  const cloudReady = !!(
    typeof cloudConfig !== "undefined"
    && cloudConfig?.active && cloudConfig?.provider && cloudCredentialReady() && cloudConfig?.model
  );
  const localReady = typeof localModelState !== "undefined"
    && (localModelState?.ready || localModelState?.loaded);
  return cloudReady || localReady;
}

function guideLocalModelsAllowed() {
  // The public web build blocks local-model routes; only the cloud path exists.
  return document.documentElement.dataset.deploymentProfile !== "public";
}

// Resolves true as soon as `condition` holds, false if it never does in time.
async function waitFor(condition, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return condition();
}

function setGuideSetupStatus(key, ...args) {
  const el = document.querySelector("#guide-setup-status");
  if (el) el.textContent = typeof t === "function" ? t(key, ...args) : key;
}

function selectGuideModelSource(source) {
  document.querySelectorAll("[data-guide-source]").forEach((button) => {
    const selected = button.dataset.guideSource === source;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-guide-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.guidePanel !== source;
  });
}

// The second way in: some writers want to talk the piece over before they open
// the route. ClioTalk is where conversation belongs, so the guide hands off
// there instead of turning the first screen into a chat box.
async function startGuidedClioTalk() {
  guideSeen = true;
  closeWindow("guide");
  await openWindow("assistant");
  saveDeskState();
}

function renderGuideStep() {
  const setupStep = document.querySelector("#guide-setup-step");
  const routeStep = document.querySelector("#guide-route-step");
  if (!setupStep || !routeStep) return;

  const ready = guideModelReady();
  setupStep.hidden = ready;
  routeStep.hidden = !ready;
  const dismissButton = document.querySelector('[data-action="dismiss-guide"]');
  if (dismissButton) {
    dismissButton.hidden = false;
    dismissButton.textContent = t(ready ? "guide_later" : "guide_without_model");
  }
  if (ready) return;

  const localAllowed = guideLocalModelsAllowed();
  const localButton = document.querySelector('[data-guide-source="local"]');
  if (localButton) localButton.hidden = !localAllowed;

  // Mirror the Control Panel's provider list rather than hard-coding vendors.
  const guideProvider = document.querySelector("#guide-cloud-provider");
  const panelProvider = document.querySelector("#cloud-provider");
  if (guideProvider && panelProvider && !guideProvider.options.length) {
    guideProvider.replaceChildren(
      ...Array.from(panelProvider.options).map((option) => new Option(option.text, option.value))
    );
  }
  if (guideProvider && panelProvider?.value) guideProvider.value = panelProvider.value;
  const guideCloudKey = document.querySelector("#guide-cloud-key");
  const active = document.querySelector("[data-guide-source].is-active:not([hidden])");
  const preferredSource = cloudCredentialReady()
    ? "cloud"
    : (active?.dataset.guideSource || (localAllowed ? "local" : "cloud"));
  selectGuideModelSource(preferredSource);
}

async function guideConnectLocal() {
  const endpointValue = document.querySelector("#guide-local-endpoint")?.value.trim();
  const panelEndpoint = document.querySelector("#endpoint");
  const connectButton = document.querySelector("#connect-local-model");
  const guideButton = document.querySelector('[data-action="guide-connect-local"]');
  if (!panelEndpoint || !connectButton) return;

  if (endpointValue) {
    panelEndpoint.value = endpointValue;
    panelEndpoint.dispatchEvent(new Event("input", { bubbles: true }));
    panelEndpoint.dispatchEvent(new Event("change", { bubbles: true }));
  }
  setGuideSetupStatus("guide_setup_connecting");
  setControlLoading(guideButton, true, t("guide_setup_connecting"));
  // Await the Control Panel's own connect instead of clicking and guessing when
  // it finished; it owns the request, the retries and the saved state.
  try {
    await connectLocalLmStudio({ toggle: false });
  } catch {
    setGuideSetupStatus("guide_setup_failed");
    return;
  } finally {
    setControlLoading(guideButton, false);
  }
  if (guideModelReady()) {
    setGuideSetupStatus("guide_setup_ready");
    renderGuideStep();
    return;
  }
  // Connecting is not enough: LM Studio still needs a loaded model, and that
  // picker legitimately lives in the Control Panel.
  setGuideSetupStatus("guide_setup_needs_model");
}

async function guideConnectCloud() {
  const key = document.querySelector("#guide-cloud-key")?.value.trim();
  const provider = document.querySelector("#guide-cloud-provider")?.value;
  const panelKey = document.querySelector("#cloud-api-key");
  const panelProvider = document.querySelector("#cloud-provider");
  const checkButton = document.querySelector("#cloud-check-status");
  const guideButton = document.querySelector('[data-action="guide-connect-cloud"]');
  if (!panelKey || !panelProvider || !checkButton) return;

  if (!key) {
    setGuideSetupStatus("guide_setup_needs_key");
    return;
  }
  if (provider && panelProvider.value !== provider) {
    panelProvider.value = provider;
    panelProvider.dispatchEvent(new Event("change", { bubbles: true }));
  }
  panelKey.value = key;
  panelKey.dispatchEvent(new Event("input", { bubbles: true }));
  const guideCloudKey = document.querySelector("#guide-cloud-key");
  if (guideCloudKey) guideCloudKey.value = "";

  setGuideSetupStatus("guide_setup_connecting");
  setControlLoading(guideButton, true, t("guide_setup_connecting"));
  try {
    checkButton.click();

    // The Control Panel disables its button for the duration of the request and
    // re-enables it in a finally, so that edge is the authoritative "the check
    // finished" signal. Polling a derived flag instead used to leave the guide
    // showing the Control Panel's transient "Checking..." forever.
    const finished = await waitFor(() => checkButton.disabled === false, 30000);
    if (!finished) {
      setGuideSetupStatus("guide_setup_still_checking");
      return;
    }

    const connected = document
      .querySelector("#cloud-status-indicator")
      ?.classList.contains("is-connected");
    if (!connected) {
      // Report the Control Panel's own settled message rather than inventing one.
      const panelMessage = document.querySelector("#cloud-status-text")?.textContent?.trim();
      const el = document.querySelector("#guide-setup-status");
      if (el && panelMessage) el.textContent = panelMessage;
      else setGuideSetupStatus("guide_setup_failed");
      return;
    }

    // Connected, but the provider's model list may still be arriving; the key is
    // only usable once a model is actually selected.
    await waitFor(guideModelReady, 5000);
    if (guideModelReady()) {
      setGuideSetupStatus("guide_setup_ready");
      renderGuideStep();
      return;
    }
    setGuideSetupStatus("guide_setup_needs_cloud_model");
  } finally {
    setControlLoading(guideButton, false);
  }
}

function openApiSetup() {
  openWindow("control");
  endpointInput.focus();
  endpointInput.select();
}

async function startGuidedWritingRoute() {
  guideSeen = true;
  closeWindow("guide");

  if (!getActiveProject()) {
    await openWindow("projects");
    setStatus(t("guide_route_needs_project"));
    saveDeskState();
    return;
  }

  if (typeof openWritingFlowWindows === "function") {
    await openWritingFlowWindows();
  } else {
    await openWindow("questionSheet");
  }
  setStatus(t("guide_route_started"));
  saveDeskState();
}
