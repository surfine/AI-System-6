// Feature module: writer-guide.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

// One light pointer to the 30-second teaser, at most once per session. The
// OOBE file deliberately introduces no new persistence boundary, so this is
// intentionally runtime-only.
let teaserHintShown = false;



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

// Start Here is a three-page setup assistant: what this machine is, how to
// give it a model, then the desktop back. The page number is runtime state on
// purpose — the OOBE still introduces no new persistence boundary.
const guideStepIds = ["guide-welcome-step", "guide-ai-step", "guide-ready-step"];
let guideStepIndex = 0;
let guideAiStatusKey = "";

function applyGuideStepVisibility(guide) {
  guideStepIds.forEach((id, position) => {
    const step = document.getElementById(id);
    if (step) step.hidden = position !== guideStepIndex;
  });

  const counter = document.getElementById("guide-step-counter");
  if (counter) counter.textContent = t("guide_step_counter", guideStepIndex + 1, guideStepIds.length);

  const backButton = guide.querySelector("[data-action='guide-back']");
  if (backButton) backButton.hidden = guideStepIndex === 0;

  const continueButton = guide.querySelector("[data-action='guide-continue']");
  if (continueButton) {
    const key = guideStepIndex === guideStepIds.length - 1 ? "guide_start_using" : "guide_continue";
    continueButton.dataset.i18n = key;
    continueButton.textContent = t(key);
  }
}

// On the public site the shared allowance is already connected when this page
// appears, so the page reports a state instead of asking for a decision. The
// manual connect button is the recovery path, and it holds the default outline
// only while it is the thing left to do.
function syncGuideAiStep(guide) {
  const websiteButton = guide.querySelector("[data-action='guide-connect-website-ai']");
  const continueButton = guide.querySelector("[data-action='guide-continue']");
  const heading = document.getElementById("guide-ai-heading");
  const body = document.getElementById("guide-ai-body");
  const status = document.getElementById("guide-ai-status");
  const websiteAvailable = window.AISystem6CloudModel?.websiteAiAvailable?.() === true;
  const connected = guideHasReadyModel();
  const sharedActive = connected
    && typeof cloudCredentialMode === "function"
    && cloudCredentialMode() === "shared";

  if (websiteButton) websiteButton.hidden = connected || !websiteAvailable;

  const websiteIsDefault = guideStepIndex === 1 && websiteAvailable && !connected
    && guideAiStatusKey !== "guide_ai_connecting";
  websiteButton?.classList.toggle("default", websiteIsDefault);
  continueButton?.classList.toggle("default", !websiteIsDefault);

  if (heading) {
    heading.dataset.i18n = connected ? "guide_ai_ready_heading" : "guide_ai_heading";
    heading.textContent = t(heading.dataset.i18n);
  }
  if (body) {
    body.dataset.i18n = connected
      ? "guide_ai_ready_body"
      : websiteAvailable ? "guide_ai_body" : "guide_ai_body_local";
    body.textContent = t(body.dataset.i18n);
  }
  if (status) {
    // With no website AI to explain, the paragraph above has already said
    // everything; a second line would only repeat it.
    const key = guideAiStatusKey
      || (sharedActive
        ? "cloud_shared_active_hint"
        : connected
          ? "guide_ai_connected"
          : websiteAvailable ? "cloud_shared_hint" : "");
    status.hidden = !key;
    if (key) {
      status.dataset.i18n = key;
      status.textContent = t(key);
    } else {
      delete status.dataset.i18n;
      status.textContent = "";
    }
  }
}

function syncGuideReadyStep(guide) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const continueLast = guide.querySelector("[data-action='guide-continue-last']");
  if (continueLast) {
    continueLast.hidden = !project;
    continueLast.textContent = project ? t("guide_continue_project", project.name) : t("guide_continue_last");
  }
  window.AISystem6WebPlatform?.syncWebInstallUi?.();
}

function guideDefaultActionButton(guide) {
  return guide.querySelector(".guide-step:not([hidden]) .btn.default")
    || guide.querySelector("[data-action='guide-continue']");
}

function syncGuideWelcomeState({ focusDefault = false } = {}) {
  const guide = getWindow("guide");
  if (!guide) return;

  // A fresh open of Start Here begins at the first page; a model connecting
  // while the assistant is open must not move the page under the reader.
  if (focusDefault) {
    guideStepIndex = 0;
    guideAiStatusKey = "";
  }

  applyGuideStepVisibility(guide);
  syncGuideAiStep(guide);
  syncGuideReadyStep(guide);

  if (focusDefault && !guide.classList.contains("is-hidden")) {
    const target = guideDefaultActionButton(guide);
    if (target) window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }
}

function setGuideStep(index) {
  const guide = getWindow("guide");
  if (!guide) return;
  guideStepIndex = Math.min(Math.max(index, 0), guideStepIds.length - 1);
  syncGuideWelcomeState();
  guideDefaultActionButton(guide)?.focus({ preventScroll: true });
}

function guideStepBack() {
  setGuideStep(guideStepIndex - 1);
}

async function guideStepContinue() {
  if (guideStepIndex < guideStepIds.length - 1) {
    setGuideStep(guideStepIndex + 1);
    return;
  }
  await dismissGuide();
}

// One click, no key: the shared allowance the public deployment already
// carries. The result is read from the connection itself, never from a timer.
async function connectGuideWebsiteAi() {
  const guide = getWindow("guide");
  if (!guide) return false;
  const connect = window.AISystem6CloudModel?.connectWebsiteAi;
  if (typeof connect !== "function") {
    guideAiStatusKey = "guide_ai_failed";
    syncGuideAiStep(guide);
    return false;
  }

  guideAiStatusKey = "guide_ai_connecting";
  syncGuideAiStep(guide);
  let connected = false;
  try {
    connected = await connect();
  } catch (error) {
    console.warn("Start Here could not connect the website AI", error);
  }
  guideAiStatusKey = connected ? "" : "guide_ai_failed";
  syncGuideWelcomeState();
  if (connected) guideDefaultActionButton(guide)?.focus({ preventScroll: true });
  return connected;
}

function initializeGuideOobe() {
  const guide = getWindow("guide");
  if (!guide || guide.dataset.oobeKeyboardReady === "true") return;
  guide.dataset.oobeKeyboardReady = "true";

  guide.addEventListener("keydown", (event) => {
    if (event.isComposing || guide.classList.contains("is-hidden")) return;

    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey && !eventIsTextComposition(event)) {
      event.preventDefault();
      guideDefaultActionButton(guide)?.click();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      dismissGuide();
      return;
    }

    if (event.key !== "Tab") return;
    const actions = [
      ...guide.querySelectorAll(".guide-step:not([hidden]) .btn"),
      guide.querySelector("[data-action='guide-back']"),
      guide.querySelector("[data-action='guide-continue']"),
      ...guide.querySelectorAll(".guide-links .btn"),
    ].filter((button) => button && !button.disabled && !button.hidden);
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
  if (!teaserHintShown && typeof pushSystemNotification === "function") {
    teaserHintShown = true;
    pushSystemNotification(t("teaser_hint"), {
      actionId: "play-teaser-demo",
      actionLabel: t("guide_play_teaser_demo"),
    });
  }
}

async function openModelSettings() {
  await openWindow("control");
  if (typeof setControlTab === "function") setControlTab();
}

async function openGuideModelSettings() {
  guideSeen = true;
  await closeWindow("guide");
  await openModelSettings();
  window.AISystem6CloudModel?.revealOwnKeyFields?.();
  saveDeskState();
}

async function openGuideLocalAi() {
  guideSeen = true;
  await closeWindow("guide");
  await openWindow("control");
  if (typeof setControlTab === "function") setControlTab("local");
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
    if (typeof flushWorkingSessionCommit === "function") {
      await flushWorkingSessionCommit();
    }
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
