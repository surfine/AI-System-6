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

function guideHasReadyModel() {
  if (typeof clioTalkModelReady !== "function") return false;
  return clioTalkModelReady();
}

function syncGuideWelcomeState({ focusDefault = false } = {}) {
  const guide = getWindow("guide");
  if (!guide) return;

  const connected = guideHasReadyModel();
  const body = guide.querySelector("[data-i18n^='guide_welcome_body']");
  const aiButton = guide.querySelector("[data-action='guide-open-model-settings']");
  const defaultButton = guide.querySelector("[data-action='dismiss-guide']");

  if (body) {
    body.dataset.i18n = connected ? "guide_welcome_body_connected" : "guide_welcome_body";
    body.textContent = t(body.dataset.i18n);
  }
  if (aiButton) {
    aiButton.dataset.i18n = connected ? "guide_ai_settings" : "guide_connect_ai";
    aiButton.textContent = t(aiButton.dataset.i18n);
  }

  if (focusDefault && defaultButton && !guide.classList.contains("is-hidden")) {
    window.requestAnimationFrame(() => defaultButton.focus({ preventScroll: true }));
  }
}

function initializeGuideOobe() {
  const guide = getWindow("guide");
  if (!guide || guide.dataset.oobeKeyboardReady === "true") return;
  guide.dataset.oobeKeyboardReady = "true";

  guide.addEventListener("keydown", (event) => {
    if (event.isComposing || guide.classList.contains("is-hidden")) return;

    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      dismissGuide();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      dismissGuide();
      return;
    }

    if (event.key !== "Tab") return;
    const actions = [
      guide.querySelector("[data-action='guide-open-model-settings']"),
      guide.querySelector("[data-action='dismiss-guide']"),
    ].filter((button) => button && !button.disabled);
    if (!actions.length) return;

    event.preventDefault();
    const currentIndex = actions.indexOf(document.activeElement);
    const nextIndex = currentIndex < 0
      ? (event.shiftKey ? actions.length - 1 : 0)
      : (currentIndex + (event.shiftKey ? -1 : 1) + actions.length) % actions.length;
    actions[nextIndex].focus();
  });
}

async function dismissGuide() {
  // OOBE leaves the user on the desktop. AI remains optional until an action
  // actually needs a model, and the menu-bar indicator preserves that state.
  guideSeen = true;
  await closeWindow("guide");
  saveDeskState();
  window.requestAnimationFrame(() => revealMultiFinderSwitcherHint());
}

async function openModelSettings() {
  await openWindow("control");
  if (typeof setControlTab === "function") setControlTab();
}

async function openGuideModelSettings() {
  guideSeen = true;
  await closeWindow("guide");
  await openModelSettings();
  saveDeskState();
}

async function startGuidedWritingRoute() {
  guideSeen = true;
  closeWindow("guide");

  // Start Here is system OOBE, so it may be running while the Desktop profile
  // is active. The chosen destination owns the transition into Writing Studio;
  // the OOBE itself never becomes one of that application's windows.
  if (typeof activateWorkspaceProfile === "function") {
    await activateWorkspaceProfile(workspaceProfileWriting, { openDefault: false, persist: false });
  }

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
