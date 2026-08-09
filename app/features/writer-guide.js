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
  const defaultButton = guide.querySelector("[data-action='guide-start-quick-draft']");
  const continueButton = guide.querySelector("[data-action='guide-continue-last']");

  if (body) {
    body.dataset.i18n = connected ? "guide_welcome_body_connected" : "guide_welcome_body";
    body.textContent = t(body.dataset.i18n);
  }
  if (aiButton) {
    aiButton.dataset.i18n = connected ? "guide_ai_settings" : "guide_connect_ai";
    aiButton.textContent = t(aiButton.dataset.i18n);
  }
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (continueButton) {
    continueButton.hidden = !project;
    continueButton.textContent = project ? t("guide_continue_project", project.name) : t("guide_continue_last");
  }
  window.AISystem6WebPlatform?.syncWebInstallUi?.();

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
      startGuidedQuickDraft();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      dismissGuide();
      return;
    }

    if (event.key !== "Tab") return;
    const actions = [
      guide.querySelector("[data-action='guide-start-quick-draft']"),
      guide.querySelector("[data-action='guide-start-route']"),
      guide.querySelector("[data-action='guide-continue-last']"),
      guide.querySelector("[data-action='guide-open-model-settings']"),
      guide.querySelector("[data-action='install-web-app']"),
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

async function startGuidedQuickDraft() {
  guideSeen = true;
  await closeWindow("guide");
  if (typeof openQuickDraft === "function") await openQuickDraft();
  else {
    await ensureQuickDraftModule?.();
    await window.AISystem6QuickDraft?.open?.();
  }
  saveDeskState();
}

function recentProjectDocument() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) return null;
  const candidates = [...(Array.isArray(chatFiles) ? chatFiles : [])]
    .filter((file) => typeof isInActiveProject === "function" && isInActiveProject(file));
  return candidates.sort(
    (left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0)
  )[0] || null;
}

async function continueLastProject() {
  guideSeen = true;
  await closeWindow("guide");
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) {
    await openWindow("projects");
    return false;
  }

  // Resume the real working scene first: project, application, document,
  // window, selection and scroll all live in the Working Session snapshot.
  // Only when that snapshot is missing or points at a deleted object do we
  // fall back to a simpler destination.
  if (typeof restoreWorkingSession === "function") {
    const resumed = await restoreWorkingSession();
    if (resumed) {
      saveDeskState();
      return true;
    }
  }

  // Fallback: Draft Desk body → most recent project document → Project Hard
  // Disk. No recovery wizard, no new dashboard.
  const hasDraft = Boolean(String(project.quickDraft?.workspace?.body || "").trim());
  if (hasDraft) {
    await ensureQuickDraftModule?.();
    await window.AISystem6QuickDraft?.open?.();
  } else {
    const recent = recentProjectDocument();
    if (recent) {
      await openWindow("documents");
      if (typeof openDocumentFileOrAttachToClioTalk === "function") {
        openDocumentFileOrAttachToClioTalk(recent);
      }
    } else {
      await openWindow("projects");
    }
  }
  saveDeskState();
  return true;
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
