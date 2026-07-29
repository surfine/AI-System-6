// Core runtime module: window-manager.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


function shouldPromptForTeachTextFileSave() {
  if (teachTextStatusEl?.dataset.statusKey !== "modified") return false;
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const isLinkedManuscript = project?.manuscriptLinkedToOutline
    && typeof teachTextPipelineLabel === "function"
    && teachTextPipelineLabel();
  if (isLinkedManuscript) {
    setTeachTextStatus("saved");
    return false;
  }
  return true;
}

function teachTextUnsavedChangesMessage() {
  const name = typeof getTeachTextDocumentName === "function"
    ? getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || t("untitled") })
    : t("untitled");
  return t("unsaved_changes", name);
}

function getWindow(name) {
  return document.querySelector(`[data-window="${name}"]`);
}

const centeredSystemWindowNames = new Set(["about"]);
const deskAccessoryDefaultWidths = new Map([
  ["findFile", 520],
  ["dictionary", 390],
  ["notePad", 320],
  ["clipboard", 340],
  ["calculator", 208],
  ["puzzle", 188],
  ["writingBell", 300],
  ["memoryCards", 520],
  ["cmfStudio", 1080],
  ["modelMeter", 230],
  ["keyCaps", 380],
  ["systemStatus", 430],
  ["notificationCenter", 360],
  ["guide", 430],
]);
function readZLayerToken(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const windowLayerBaseZ = readZLayerToken("--z-window-layer-base", 10);
const windowLayerCompactBaseZ = readZLayerToken("--z-window-layer-compact-base", 100);
const windowLayerCompactThresholdZ = readZLayerToken("--z-window-layer-compact-threshold", 8800);
const windowLayerMaxZ = readZLayerToken("--z-window-layer-max", 8990);
const windowPinnedZ = readZLayerToken("--z-window-pinned", 9000);
// About is the one window that dims the desk behind it, so it has to sit above
// its own scrim; the pinned-window layer is below it.
const systemModalZ = readZLayerToken("--z-system-modal", 9510);
const windowSaveZ = readZLayerToken("--z-window-save", 8500);
const writingLayoutWindowNames = new Set(["questionSheet", "outline", "sectionDrafts", "teachText", "reviewDesk"]);
const finderCascadeWindowNames = new Set([
  "disk",
  "helpFolder",
  "applications",
  "projects",
  "documents",
  "projectCd",
  "trash",
  "textDisk",
]);
let quickDraftAssistantHome = null;
let closingQuickDraftAssistantPair = false;

function visibleLayeredWindows() {
  return Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"));
}

function compactWindowLayerStack() {
  visibleLayeredWindows()
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .forEach((win, index) => {
      win.style.zIndex = windowLayerCompactBaseZ + index;
    });
  topZ = windowLayerCompactBaseZ + visibleLayeredWindows().length;
}

function nextWindowLayerZ(minimum = windowLayerBaseZ) {
  if (topZ >= windowLayerCompactThresholdZ) compactWindowLayerStack();
  topZ = Math.min(windowLayerMaxZ, Math.max(minimum, Number(topZ || 0) + 1));
  return topZ;
}

function setWindowLayerZ(win, value) {
  if (!win) return windowLayerBaseZ;
  const numeric = Number(value);
  const z = Number.isFinite(numeric)
    ? Math.min(windowLayerMaxZ, Math.max(windowLayerBaseZ, numeric))
    : nextWindowLayerZ();
  win.style.zIndex = z;
  topZ = Math.min(windowLayerMaxZ, Math.max(Number(topZ || windowLayerBaseZ), z));
  return z;
}

function windowLayoutGroup(nameOrWin) {
  const name = typeof nameOrWin === "string" ? nameOrWin : nameOrWin?.dataset.window || "";
  if (writingLayoutWindowNames.has(name)) return "writing-flow";
  return getWindowAppId(nameOrWin);
}

function setWindowLayoutMetadata(win) {
  if (!win) return;
  win.dataset.layoutGroup = windowLayoutGroup(win);
}

function markWindowUserPositioned(win) {
  if (!win) return;
  win.dataset.userPositioned = "true";
  win.dataset.systemPositioned = "false";
}

function markWindowSystemPositioned(win) {
  if (!win) return;
  if (win.dataset.userPositioned !== "true") {
    win.dataset.systemPositioned = "true";
  }
  setWindowLayoutMetadata(win);
}

function windowFrame(win) {
  if (!win) return null;
  const rect = win.getBoundingClientRect();
  return {
    left: inlineStyleValue(win, "left") || `${Math.round(rect.left)}px`,
    top: inlineStyleValue(win, "top") || `${Math.round(rect.top)}px`,
    right: inlineStyleValue(win, "right") || "auto",
    width: inlineStyleValue(win, "width") || `${Math.round(rect.width)}px`,
    height: inlineStyleValue(win, "height") || `${Math.round(rect.height)}px`,
    maxHeight: inlineStyleValue(win, "max-height") || "",
    transform: inlineStyleValue(win, "transform") || "none",
  };
}

function applyWindowFrame(win, frame = {}) {
  if (!win || !frame) return;
  setInlineStyleValue(win, "left", frame.left || "");
  setInlineStyleValue(win, "top", frame.top || "");
  setInlineStyleValue(win, "right", frame.right || "auto");
  setInlineStyleValue(win, "width", frame.width || "");
  setInlineStyleValue(win, "height", frame.height || "");
  setInlineStyleValue(win, "max-height", frame.maxHeight || "");
  setInlineStyleValue(win, "transform", frame.transform || "none");
}

function windowFrameValue(value, fallback = "") {
  if (typeof value === "number" && Number.isFinite(value)) return `${Math.round(value)}px`;
  if (typeof value === "string") return value;
  return fallback;
}

function placeWindowForExplicitLayout(win, frame = {}, options = {}) {
  if (!win) return;
  const height = windowFrameValue(frame.height);
  win.classList.remove("is-collapsed", "is-desklet");
  applyWindowFrame(win, {
    left: windowFrameValue(frame.left),
    top: windowFrameValue(frame.top),
    right: windowFrameValue(frame.right, "auto"),
    width: windowFrameValue(frame.width),
    height,
    maxHeight: windowFrameValue(frame.maxHeight, height),
    transform: windowFrameValue(frame.transform, "none"),
  });
  win.dataset.zoomed = "false";
  if (options.userPositioned) markWindowUserPositioned(win);
  else markWindowSystemPositioned(win);
}

function saveSideAskRestoreFrame(win) {
  if (!win || win.dataset.sideaskRestoreActive === "true") return;
  const frame = windowFrame(win);
  win.dataset.sideaskRestoreActive = "true";
  win.dataset.sideaskRestoreLeft = frame.left;
  win.dataset.sideaskRestoreTop = frame.top;
  win.dataset.sideaskRestoreRight = frame.right;
  win.dataset.sideaskRestoreWidth = frame.width;
  win.dataset.sideaskRestoreHeight = frame.height;
  win.dataset.sideaskRestoreMaxHeight = frame.maxHeight;
  win.dataset.sideaskRestoreTransform = frame.transform;
  win.dataset.sideaskRestoreZoomed = win.dataset.zoomed || "false";
}

function restoreSideAskFrame(win) {
  if (!win || win.dataset.sideaskRestoreActive !== "true") return;
  applyWindowFrame(win, {
    left: win.dataset.sideaskRestoreLeft || "",
    top: win.dataset.sideaskRestoreTop || "",
    right: win.dataset.sideaskRestoreRight || "auto",
    width: win.dataset.sideaskRestoreWidth || "",
    height: win.dataset.sideaskRestoreHeight || "",
    maxHeight: win.dataset.sideaskRestoreMaxHeight || "",
    transform: win.dataset.sideaskRestoreTransform || "none",
  });
  win.dataset.zoomed = win.dataset.sideaskRestoreZoomed || "false";
  delete win.dataset.sideaskRestoreActive;
  delete win.dataset.sideaskRestoreLeft;
  delete win.dataset.sideaskRestoreTop;
  delete win.dataset.sideaskRestoreRight;
  delete win.dataset.sideaskRestoreWidth;
  delete win.dataset.sideaskRestoreHeight;
  delete win.dataset.sideaskRestoreMaxHeight;
  delete win.dataset.sideaskRestoreTransform;
  delete win.dataset.sideaskRestoreZoomed;
}

function restoreSideAskFrames() {
  document.querySelectorAll(".window[data-sideask-restore-active='true']").forEach(restoreSideAskFrame);
}

function rectsOverlap(a, b, gap = 10) {
  if (!a || !b) return false;
  return !(
    a.right + gap <= b.left
    || a.left >= b.right + gap
    || a.bottom + gap <= b.top
    || a.top >= b.bottom + gap
  );
}

function nudgeNewWindowAwayFromSameApp(win) {
  if (!win || win.dataset.userPositioned === "true" || writerMode || isPortraitDocumentFlow()) return;
  const group = windowLayoutGroup(win);
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  if (!desktopRect) return;
  const peers = Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)"))
    .filter((peer) => peer !== win && windowLayoutGroup(peer) === group);
  if (!peers.length) return;

  const margin = 18;
  const step = 28;
  const rect = win.getBoundingClientRect();
  const width = rect.width || 360;
  const height = rect.height || 280;
  const left0 = rect.left - desktopRect.left;
  const top0 = rect.top - desktopRect.top;
  const maxLeft = Math.max(margin, desktopRect.width - width - margin);
  const maxTop = Math.max(margin, desktopRect.height - height - margin);
  const peerRects = peers.map((peer) => peer.getBoundingClientRect());

  for (let ring = 0; ring < 12; ring += 1) {
    const candidates = [
      { left: left0 + step * ring, top: top0 + step * ring },
      { left: left0 + step * ring, top: top0 },
      { left: left0, top: top0 + step * ring },
      { left: left0 - step * ring, top: top0 + step * ring },
    ];
    const found = candidates
      .map((candidate) => ({
        left: Math.round(clampNumber(candidate.left, margin, maxLeft)),
        top: Math.round(clampNumber(candidate.top, margin, maxTop)),
      }))
      .find((candidate) => {
        const candidateRect = {
          left: desktopRect.left + candidate.left,
          top: desktopRect.top + candidate.top,
          right: desktopRect.left + candidate.left + width,
          bottom: desktopRect.top + candidate.top + height,
        };
        return !peerRects.some((peerRect) => rectsOverlap(candidateRect, peerRect));
      });
    if (found) {
      setInlineStyleValue(win, "left", `${found.left}px`);
      setInlineStyleValue(win, "top", `${found.top}px`);
      setInlineStyleValue(win, "right", "auto");
      setInlineStyleValue(win, "transform", "none");
      return;
    }
  }
}

async function prepareFinderModeForApp(appId) {
  if (isMultiFinderMode()) return true;
  if (writerMode && sideAskEnabled && !isSideAskPairApp(appId)) {
    leaveWriterMode();
  } else if (writerMode) {
    return true;
  }
  if(appId==="accessories")return true;
  const allowSideAskPair = sideAskEnabled && isSideAskPairApp(appId);
  if (sideAskEnabled && !isSideAskPairApp(appId)) clearSideAskMode();
  const windowsToHide = Array.from(document.querySelectorAll(".window:not(.is-hidden)"))
    .filter((win) => {
      // On a phone the foregrounded app is the full-screen backdrop, so a modal,
      // system window, or desk accessory floats over it instead of replacing it.
      // Only those may skip single-tasking: another real app must still quit the
      // running one, or Finder mode would silently become MultiFinder on a phone.
      if (
        isPortraitDocumentFlow()
        && win.classList.contains("is-mobile-fullscreen")
        && !isFinderModeSingleTaskApp(appId)
      ) return false;
      const currentAppId = getWindowAppId(win);
      if (finderModeForegroundAppIds.has(currentAppId)) {
        return isFinderModeSingleTaskApp(appId) || allowSideAskPair;
      }
      if (allowSideAskPair && isSideAskPairApp(currentAppId)) return false;
      if (!isFinderModeSingleTaskApp(appId)) return isFinderModeSingleTaskApp(currentAppId);
      return currentAppId !== appId && isFinderModeSingleTaskApp(currentAppId);
    });

  for (const win of windowsToHide) {
    if (win.dataset.window === "teachText" && shouldPromptForTeachTextFileSave()) {
      const result = await showSystemModal(teachTextUnsavedChangesMessage(), "save");
      if (result === "cancel") return false;
      if (result === "yes") {
        const saved = await saveTextDocument();
        if (!saved) return false;
      } else {
        setTeachTextStatus("saved");
      }
    }
  }

  windowsToHide.forEach((win) => {
    win.classList.add("is-hidden");
    win.classList.remove("is-app-hidden", "is-active");
    delete win.dataset.appHiddenCollapsed;
    forgetWindowFromRunningApps(win.dataset.window);
  });
  hiddenAppIds.clear();
  updateQuickDraftFocusChrome();
  return true;
}

function updateQuickDraftFocusChrome() {
  const quickDraft = getWindow("quickDraft");
  const visible = !isMultiFinderMode()
    && quickDraft
    && !quickDraft.classList.contains("is-hidden")
    && !quickDraft.classList.contains("is-app-hidden");
  document.body.classList.toggle("quick-draft-focus", !!visible);
}

function setSideAskAnchorApp(appId = "teachText", ownerAppId = appId) {
  sideAskAnchorAppId = appId || "teachText";
  sideAskAnchorOwnerAppId = ownerAppId || sideAskAnchorAppId;
  sideAskEnabled = true;
  updateSideAskSourceChrome();
}

function clearSideAskMode() {
  restoreQuickDraftIntegratedAssistant();
  restoreSideAskFrames();
  const wasQuickDraftSideAsk = sideAskAnchorAppId === "quickDraft";
  sideAskEnabled = false;
  sideAskAnchorAppId = "teachText";
  sideAskAnchorOwnerAppId = "teachText";
  if (wasQuickDraftSideAsk && typeof exitQuickDraftClioTalkSession === "function") {
    exitQuickDraftClioTalkSession({ restore: true });
  } else if (typeof exitSideAskClioTalkSession === "function") {
    exitSideAskClioTalkSession({ restore: true });
  }
  updateSideAskSourceChrome();
}

function sideAskSourceDisplayLabel(appId = sideAskAnchorAppId) {
  if (appId === "teachText") {
    const title = typeof getTeachTextDocumentName === "function"
      ? getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || t("teachtext_label") })
      : t("teachtext_label");
    return `${t("teachtext_label")} / ${title}`;
  }
  if (appId === "quickDraft") return t("quick_draft_label");
  if (appId === "reader") return currentReaderPage?.title
    ? `${t("reader")} / ${currentReaderPage.title}`
    : t("reader");
  if (appId === "scrapbook") return t("scrapbook");
  if (appId === "docMap") return currentDocMap?.sourceLabel
    ? `${t("docmap")} / ${currentDocMap.sourceLabel}`
    : t("docmap");
  if (appId === "clioStage") return typeof clioStageState !== "undefined" && clioStageState?.source?.title
    ? `${t("clio_stage_label")} / ${clioStageState.source.title}`
    : t("clio_stage_label");
  return t("sideask");
}

function focusSideAskSource() {
  if (!sideAskEnabled || isMultiFinderMode()) return;
  const windowName = {
    quickDraft: "quickDraft",
    teachText: "teachText",
    reader: "reader",
    scrapbook: "scrapbook",
    docMap: "docMap",
    clioStage: "clioStage",
  }[sideAskAnchorAppId];
  const sourceWindow = windowName ? getWindow(windowName) : null;
  if (sourceWindow) focusWindow(sourceWindow);
}

function updateSideAskSourceChrome() {
  const askForms = {
    reader: readerAskForm,
    scrapbook: scrapbookAskForm,
    docMap: docMapAskForm,
    clioStage: clioStageAskForm,
  };
  Object.entries(askForms).forEach(([appId, form]) => {
    if (!form) return;
    form.hidden = !isMultiFinderMode() && sideAskEnabled && sideAskAnchorAppId === appId;
  });
  const quickDraftSideAsk = !isMultiFinderMode() && sideAskEnabled && sideAskAnchorAppId === "quickDraft";
  const sideAskActive = !isMultiFinderMode() && sideAskEnabled;
  if (!quickDraftSideAsk) restoreQuickDraftIntegratedAssistant();
  const assistant = getWindow("assistant");
  assistant?.classList.remove("is-quick-draft-sideask");
  assistant?.classList.toggle("is-sideask", sideAskActive);
  if (assistant) assistant.dataset.sideaskAnchor = sideAskActive ? sideAskAnchorAppId : "";
  const modeStrip = document.getElementById("sideask-mode-strip");
  if (modeStrip) modeStrip.hidden = !sideAskActive;
  const sourceName = document.getElementById("sideask-source-name");
  if (sourceName && sideAskActive) {
    sourceName.textContent = t("sideask_paired_with", sideAskSourceDisplayLabel());
  }
  document.getElementById("compose-tools-quick-draft")?.classList.add("is-hidden");
  document.querySelectorAll(".compose-tools-quick-draft-import").forEach((item) => {
    item.classList.add("is-hidden");
  });
  const quickDraftHint = document.getElementById("quick-draft-cliotalk-hint");
  if (quickDraftHint) {
    quickDraftHint.classList.add("is-hidden");
  }
  const composeToolsToggle = document.getElementById("compose-tools-toggle");
  if (composeToolsToggle && typeof t === "function") {
    composeToolsToggle.setAttribute("aria-label", t("compose_tools"));
    composeToolsToggle.title = t("compose_tools");
  }
  if (typeof syncPromptPlaceholder === "function") syncPromptPlaceholder();
  const assistantTitle = document.getElementById("assistant-title");
  if (assistantTitle && typeof t === "function") {
    assistantTitle.textContent = sideAskActive ? t("sideask_title") : t("assistant_title");
  }
}

function quickDraftClioTalkSlot() {
  return document.getElementById("quick-draft-cliotalk-slot");
}

function dockAssistantInQuickDraft() {
  return false;
}

function restoreQuickDraftIntegratedAssistant() {
  const assistant = getWindow("assistant");
  const slot = quickDraftClioTalkSlot();
  const pane = getWindow("quickDraft")?.querySelector(".quick-draft-pane");
  pane?.classList.remove("has-integrated-cliotalk");
  assistant?.classList.remove("is-quick-draft-integrated");
  if (!assistant || assistant.parentElement !== slot) return;
  const home = quickDraftAssistantHome;
  quickDraftAssistantHome = null;
  if (home?.parent?.isConnected) home.parent.insertBefore(assistant, home.nextSibling?.isConnected ? home.nextSibling : null);
  else document.querySelector(".desktop")?.prepend(assistant);
}

function resetAssistantForStandalonePlacement(win = getWindow("assistant")) {
  if (!win) return;
  win.dataset.userPositioned = "false";
  markWindowSystemPositioned(win);
  win.style.left = "";
  win.style.top = "";
  win.style.right = "auto";
  win.style.width = "";
  win.style.height = "";
  win.style.maxHeight = "";
  win.style.transform = "none";
}

async function toggleSideAsk() {
  if (!canUseSideAsk()) {
    setStatus(t("sideask_unavailable"));
    return;
  }

  if (!sideAskEnabled) {
    const canOpen = await arrangeWindowAssistantSplit("teachText");
    if (!canOpen) return;
    setStatus(t("sideask_on"));
  } else {
    const sourceWindowName = sideAskAnchorAppId;
    clearSideAskMode();
    const sourceWindow = getWindow(sourceWindowName);
    if (sourceWindow) focusWindow(sourceWindow);
    setStatus(t("sideask_off"));
  }
  updateMenuState();
}

async function quitApp(appId = activeAppId) {
  if (nonQuittableAppIds.has(appId)) return;
  if (appId === "writingStudio") {
    await exitWritingStudio();
    return;
  }

  if (appId === "teachText" && shouldPromptForTeachTextFileSave()) {
    const result = await showSystemModal(teachTextUnsavedChangesMessage(), "save");
    if (result === "cancel") return;
    if (result === "yes") {
      const saved = await saveTextDocument();
      if (!saved) return;
    } else {
      setTeachTextStatus("saved");
    }
  }

  windowsForApp(appId).forEach((win) => {
    win.classList.add("is-hidden");
    win.classList.remove("is-app-hidden", "is-active");
    delete win.dataset.appHiddenCollapsed;
    forgetWindowFromRunningApps(win.dataset.window);
  });
  runningApps.delete(appId);
  hiddenAppIds.delete(appId);
  activeAppId = "finder";
  updateQuickDraftFocusChrome();
  switchToApp("finder");
  setStatus(t("app_quit", multiFinderAppLabels[appId] || appId));
  scheduleWorkingSessionSave?.();
}

function resetDesktopScrollOffset() {
  if (isPortraitDocumentFlow()) return;
  const desktop = document.querySelector(".desktop");
  if (!desktop) return;
  const reset = () => {
    desktop.scrollLeft = 0;
    desktop.scrollTop = 0;
  };
  reset();
  requestAnimationFrame(reset);
}

function installDesktopScrollLock() {
  const desktop = document.querySelector(".desktop");
  if (!desktop || desktop.dataset.scrollLockInstalled === "true") return;
  desktop.dataset.scrollLockInstalled = "true";
  desktop.addEventListener("scroll", resetDesktopScrollOffset, { passive: true });
  resetDesktopScrollOffset();
}

function focusWindow(win, reveal=false) {
  if (!win) return;
  if (reveal && isPortraitDocumentFlow()) {
    revealWindowTitleInPortraitFlow(win);
  } else {
    resetDesktopScrollOffset();
  }

  document.querySelectorAll(".window").forEach((item) => {
    item.classList.remove("is-active");
  });
  win.classList.add("is-active");
  const focusedAppId = getWindowAppId(win);
  if (focusedAppId !== "accessories" && focusedAppId !== "system") {
    activeAppId = focusedAppId;
    menuOwnerAppId = focusedAppId;
  }
  if (hiddenAppIds.has(activeAppId)) {
    hiddenAppIds.delete(activeAppId);
    windowsForApp(activeAppId).forEach((appWin) => {
      appWin.classList.remove("is-app-hidden");
      delete appWin.dataset.appHiddenCollapsed;
    });
  }

  if (win.dataset.window === "about") {
    win.style.zIndex = systemModalZ;
    updateMenuState();
    renderMultiFinderMenu();
    scheduleWorkingSessionSave?.();
    return;
  }

  if (win.dataset.window === "saveChat") {
    win.style.zIndex = windowSaveZ;
    updateMenuState();
    renderMultiFinderMenu();
    scheduleWorkingSessionSave?.();
    return;
  }

  setWindowLayerZ(win, nextWindowLayerZ());
  if (isDeskAccessorySidecar(win)) {
    raiseVisibleDeskAccessorySidecars(win);
  } else if (getWindowAppId(win) === "accessories") {
    raiseVisibleDeskAccessorySidecars();
  } else {
    raiseVisibleDeskAccessorySidecars();
  }
  updateMenuState();
  renderMultiFinderMenu();
  scheduleWorkingSessionSave?.();
}

function isPortraitDocumentFlow() {
  return window.matchMedia("(max-width:860px) and (orientation:portrait)").matches;
}

// Mobile full-screen app shell (pilot: ClioTalk). On a phone a foregrounded
// "real" app fills the screen below the menu bar and the desktop icon column
// becomes the launcher. The CSS figure keys off .window.is-mobile-fullscreen +
// body.mobile-app-foreground; here we only toggle those classes — no inline
// layout styles. App-agnostic by design: roll the pattern out to another app by
// adding its id to mobileFullScreenAppIds.
// Deliberately excludes "accessories" (desk accessories float over the app, as
// on AD98), "system" (About / Guide / System Help are overlays), and "finder"
// (the desktop itself is the launcher you return to).
const mobileFullScreenAppIds = new Set([
  "clioTalk",
  "teachText",
  "quickDraft",
  "searcher",
  "reader",
  "endfield",
  "docMap",
  "clioStage",
  "clioChart",
  "liquidCover",
  "cmfStudio",
  "soundscape",
  "scrapbook",
]);

function mobileFullScreenTarget() {
  if (!isPortraitDocumentFlow()) return null;
  const wins = Array.from(
    document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)")
  ).filter((win) => (
    mobileFullScreenAppIds.has(getWindowAppId(win))
    // Zooming or dragging the grow box restores a window down; it then stays a
    // normal floating window (so several can share the screen) until the zoom
    // box maximizes it again.
    && win.dataset.mobileRestored !== "true"
  ));
  if (!wins.length) return null;
  return wins.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
}

function syncMobileAppForeground() {
  const target = mobileFullScreenTarget();
  document.querySelectorAll(".window.is-mobile-fullscreen").forEach((win) => {
    if (win !== target) win.classList.remove("is-mobile-fullscreen");
  });
  if (target) {
    target.classList.add("is-mobile-fullscreen");
    // Desktop placement code leaves inline left/top/width/height on some
    // windows, and inline styles outrank the shell's rules. Drop that geometry
    // so the maximized frame is the CSS shell's, not a stale desktop frame.
    ["left", "top", "right", "bottom", "width", "height", "maxHeight", "transform", "order"]
      .forEach((prop) => { target.style[prop] = ""; });
  }
  document.body.classList.toggle("mobile-app-foreground", !!target);
}

// The Finder entry in the switcher, so this is a MultiFinder-only path: bring
// the Finder forward. Every running app is backgrounded with MultiFinder's own
// hide vocabulary — they stay in the running-apps list and resume from the
// switcher. Backgrounding only the frontmost one would just promote the next
// running app to full-screen instead of revealing the desktop.
function mobileHomeToDesktop() {
  const appIds = new Set();
  document.querySelectorAll(".window:not(.is-hidden)").forEach((win) => {
    const appId = getWindowAppId(win);
    if (mobileFullScreenAppIds.has(appId)) appIds.add(appId);
  });
  if (!appIds.size) return;
  appIds.forEach((appId) => hideApp(appId, { preserveActive: true }));
  activeAppId = "finder";
  syncMobileAppForeground();
  renderMultiFinderMenu();
  playSystemSound?.("close");
}

// Re-foreground a running app full-screen from the mobile switcher.
function foregroundMobileApp(appId) {
  if (appId === "finder") {
    mobileHomeToDesktop();
    return;
  }
  const name = runningApps.get(appId)?.lastWindowName;
  if (name) openWindow(name);
  else syncMobileAppForeground();
}

function writingSpineAlignedTop(fallback = 18) {
  const desktop = document.querySelector(".desktop");
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const titleBar = spine?.querySelector?.(".spine-title-row, .title-bar");
  const desktopRect = desktop?.getBoundingClientRect();
  const spineRect = titleBar?.getBoundingClientRect?.() || spine?.getBoundingClientRect();
  if (
    desktopRect
    && spine
    && spineRect
    && spineRect.height > 0
    && getComputedStyle(spine).position !== "static"
  ) {
    return Math.max(18, Math.round(spineRect.top - desktopRect.top));
  }
  return fallback;
}

function writingSpineAlignedTopForWindow(win, fallback = 18) {
  const desktop = document.querySelector(".desktop");
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const spineTitle = spine?.querySelector?.(".spine-title-row, .title-bar");
  const spineDivider = spine?.querySelector?.(".spine-shade-body");
  const winTitle = win?.querySelector?.(":scope > .title-bar");
  const desktopRect = desktop?.getBoundingClientRect();
  const spineDividerRect = spineDivider?.getBoundingClientRect?.();
  const spineRect = (
    spineDividerRect
    && spineDividerRect.height > 0
    && getComputedStyle(spineDivider).display !== "none"
  )
    ? spineDividerRect
    : spineTitle?.getBoundingClientRect?.();
  const winRect = win?.getBoundingClientRect?.();
  const winTitleRect = winTitle?.getBoundingClientRect?.();
  const targetDivider = Array.from(win?.children || []).find((child) => {
    if (child === winTitle) return false;
    const style = getComputedStyle(child);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = child.getBoundingClientRect();
    return rect.height > 0;
  });
  const targetDividerRect = targetDivider?.getBoundingClientRect?.();
  if (
    desktopRect
    && spine
    && spineRect
    && winRect
    && winTitleRect
    && targetDividerRect
    && spineRect.height >= 0
    && winTitleRect.height > 0
    && getComputedStyle(spine).position !== "static"
  ) {
    const spineLine = spineDividerRect && spineDividerRect.height > 0 ? spineDividerRect.top : spineRect.bottom;
    const targetLineOffset = targetDividerRect.top - winRect.top;
    return Math.max(18, Math.round(spineLine - desktopRect.top - targetLineOffset));
  }
  return writingSpineAlignedTop(fallback);
}

function alignWindowTitleBottomToWritingSpine(win) {
  if (!win || writerMode || isPortraitDocumentFlow()) return;
  if (["about", "guide", "saveChat"].includes(win.dataset.window)) return;
  if (win.classList.contains("is-hidden") || win.classList.contains("is-collapsed")) return;
  win.style.top = `${writingSpineAlignedTopForWindow(win, parsePositiveInteger(win.style.top) || 18)}px`;
}

function scheduleWritingSpineTitleAlignment(win) {
  if (!win || writerMode || isPortraitDocumentFlow()) return;
  const align = () => alignWindowTitleBottomToWritingSpine(win);
  requestAnimationFrame(() => {
    align();
    requestAnimationFrame(align);
  });
  window.setTimeout(align, 80);
  window.setTimeout(align, 220);
}

function usePortraitWindowFlow(win) {
  if (!win || !isPortraitDocumentFlow() || writerMode) return false;
  if (getWindowAppId(win) === "accessories") return false;
  win.style.left = "";
  win.style.top = "";
  win.style.right = "";
  win.style.width = "";
  win.style.height = "";
  win.style.maxHeight = "";
  win.style.transform = "";
  if ((win.dataset.window === "endfieldTerminal" || win.dataset.window === "liquidCover") && !win.style.getPropertyValue("--portrait-window-height")) {
    win.style.setProperty("--portrait-window-height", "calc(100vh - var(--system-menu-height, 26px) - 72px)");
  }
  revealWindowTitleInPortraitFlow(win);
  return true;
}

function clearPortraitWindowSize(win) {
  win?.style.removeProperty("--portrait-window-width");
  win?.style.removeProperty("--portrait-window-height");
}

function revealWindowTitleInPortraitFlow(win) {
  if (!win || !isPortraitDocumentFlow()) return;
  const reveal = () => {
    const rect = win.getBoundingClientRect();
    const menuHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--system-menu-height")) || 24;
    const targetTop = window.scrollY + rect.top - menuHeight - 10;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
  };
  requestAnimationFrame(() => {
    reveal();
    requestAnimationFrame(reveal);
  });
  window.setTimeout(reveal, 120);
}

function placeCenteredSystemWindow(win) {
  if (!win) return;
  win.classList.remove("is-collapsed", "is-desklet");
  win.style.right = "auto";
  win.style.height = "";

  if (win.dataset.window === "about") {
    win.style.left = "50%";
    win.style.top = "calc(var(--system-menu-height, 25px) + (100vh - var(--system-menu-height, 25px)) / 2)";
    win.style.width = "";
    win.style.transform = "translate(-50%, -50%)";
    return;
  }

  if (isPortraitDocumentFlow()) {
    win.style.left = "";
    win.style.top = "";
    win.style.width = "";
    win.style.transform = "";
    revealWindowTitleInPortraitFlow(win);
    return;
  }

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const avoidance = getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 48 });
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const workLeft = (desktopRect?.left || 0) + avoidance.left;
  const workRight = (desktopRect?.right || viewportWidth) - avoidance.right;
  const workTop = desktopRect?.top || 25;
  const workBottom = desktopRect?.bottom || viewportHeight;
  const rect = win.getBoundingClientRect();
  const halfWidth = Math.min(rect.width || 360, Math.max(240, workRight - workLeft)) / 2;

  const halfHeight = Math.min(rect.height || 280, Math.max(180, workBottom - workTop)) / 2;
  const centerX = Math.min(Math.max(workLeft + (workRight - workLeft) / 2, workLeft + halfWidth), workRight - halfWidth);
  const centerY = Math.min(Math.max(workTop + (workBottom - workTop) / 2, workTop + halfHeight), workBottom - halfHeight);

  win.style.left = `${Math.round(centerX)}px`;
  win.style.top = `${Math.round(centerY)}px`;
  win.style.width = "";
  win.style.transform = "translate(-50%, -50%)";
}

function placeSaveChatWindow() {
  const win = getWindow("saveChat");
  if (!win) return;
  win.style.left = "50%";
  win.style.top = "calc(25px + (100vh - 25px) / 2)";
  win.style.right = "auto";
  win.style.width = "";
  win.style.height = "";
  win.style.transform = "translate(-50%, -50%)";
  win.scrollTop = 0;
  win.querySelector(".save-chat-pane")?.scrollTo?.({ top: 0 });
}

function placeClioStageDefaultWindow(win) {
  if (!win || writerMode || isPortraitDocumentFlow()) return false;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  if (!desktopRect) return false;

  const margin = 18;
  const avoidance = getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 132 });
  const workLeft = Math.max(margin, avoidance.left || margin);
  const workTop = Math.max(margin, writingSpineAlignedTopForWindow(win, margin));
  const workRight = Math.max(workLeft + 560, desktopRect.width - Math.max(132, avoidance.right || 132));
  const workBottom = Math.max(workTop + 360, desktopRect.height - margin);
  const availableWidth = Math.max(560, workRight - workLeft);
  const availableHeight = Math.max(360, workBottom - workTop);
  const width = Math.min(1024, availableWidth);
  const height = Math.min(640, availableHeight);
  const left = workLeft + Math.max(0, (availableWidth - width) / 2);

  placeWindowForExplicitLayout(win, {
    left,
    top: workTop,
    width,
    height,
    transform: "none",
  });
  return true;
}

function isFinderCascadeWindow(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return finderCascadeWindowNames.has(name);
}

function placeFinderCascadeWindow(win, options = {}) {
  if (!win) return false;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  if (!desktopRect) return false;

  const avoidance = options.avoidance || getDesktopAvoidanceInsets({ margin: 24, spineGap: 18, iconGap: 48 });
  const rect = win.getBoundingClientRect();
  const width = rect.width || 520;
  const height = rect.height || 360;
  const margin = 24;
  const baseLeft = Math.max(avoidance.left, margin);
  const baseTop = options.baseTop || writingSpineAlignedTopForWindow(win, 18);
  const workRight = Math.max(baseLeft + width, desktopRect.width - avoidance.right - margin);
  const workBottom = Math.max(baseTop + height, desktopRect.height - margin);
  const maxLeft = Math.max(baseLeft, workRight - width);
  const maxTop = Math.max(baseTop, workBottom - height);
  const horizontalStep = Math.min(190, Math.max(96, Math.round(width * 0.34)));
  const verticalStep = 26;
  const rowStep = 92;
  const columns = Math.max(1, Math.floor((maxLeft - baseLeft) / horizontalStep) + 1);
  const openFinderWindows = Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
    .filter((item) => item !== win && isFinderCascadeWindow(item));
  const index = openFinderWindows.length;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const left = Math.min(maxLeft, baseLeft + column * horizontalStep);
  const top = Math.min(maxTop, baseTop + row * rowStep + column * verticalStep);

  win.style.left = `${Math.round(left)}px`;
  win.style.top = `${Math.round(top)}px`;
  win.style.right = "auto";
  win.style.transform = "none";
  return true;
}

function getActionAvailability() {
  const activeWin = document.querySelector(".window.is-active");
  const focusedAppId = activeWin ? getWindowAppId(activeWin) : "finder";
  const menuContextWin = ["accessories", "system"].includes(focusedAppId)
    ? visibleWindowsForApp(menuOwnerAppId || activeAppId)
      .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0] || activeWin
    : activeWin;
  const showResetSystemMenu = showResetSystemMenuInput ? showResetSystemMenuInput.checked : true;
  const winName = menuContextWin?.dataset.window;
  const teachTextWin = getWindow("teachText");
  const teachTextVisible = teachTextWin && !teachTextWin.classList.contains("is-hidden");
  const hasTeachTextBody = teachTextVisible && !!teachTextBodyInput.value.trim();
  const hasOutlineBody = winName === "outline" && !!outlineContentEl?.value?.trim();
  const hasConversation = conversation.length > 0;
  const isAssistant = winName === "assistant";
  const isTeachText = winName === "teachText" && teachTextVisible;
  const isChatFile = winName === "chatFile" && !menuContextWin.classList.contains("is-hidden");
  const hasDocumentFileSelection = winName === "documents" && !!selectedChatFileId;
  const hasDocumentFolderSelection = winName === "documents" && !!selectedDocumentFolderId;
  const projectFinderItem = winName === "projects" ? getSelectedProjectFinderItem() : null;
  const currentFinderSelection = getCurrentFinderSelection();
  const isFinderWindow = ["projects", "documents"].includes(winName);
  const hasFinderTextFileSelection = isFinderWindow && currentFinderSelection?.type === "text" && !!(currentFinderSelection.body || "").trim();
  const hasProjectFinderRename = !!projectFinderItem && projectFinderItem.canRename !== false && projectFinderItem.virtual !== true;
  const hasProjectFinderTrash = !!projectFinderItem && projectFinderItem.canTrash !== false && projectFinderItem.virtual !== true;
  const selectedTrashItem = winName === "trash" ? getSelectedTrashItem() : null;
  const canPrintDirectory = printableDirectoryWindowNames.has(winName);
  const canUsePageSetup = winName === "projectCd" || winName === "pageSetup" || isTeachText;
  const teachTextSelection = isTeachText ? getTeachTextSelectionInfo() : { text: "" };
  const hasTeachTextSelection = !!teachTextSelection.text;
  const teachTextIsManuscript = typeof activeTeachTextAllows === "function"
    ? activeTeachTextAllows("writingFlow")
    : (typeof isTeachTextManuscriptRole !== "function" || isTeachTextManuscriptRole());
  const teachTextCanExport = typeof activeTeachTextAllows === "function"
    ? activeTeachTextAllows("projectCdExport")
    : teachTextIsManuscript;
  const teachTextCanReview = typeof activeTeachTextAllows === "function"
    ? activeTeachTextAllows("review")
    : teachTextIsManuscript;
  const teachTextIsSlides = hasTeachTextBody && typeof readerHasMarpFrontmatter === "function" && readerHasMarpFrontmatter(teachTextBodyInput.value || "");
  let selectionContext = null;
  try {
    selectionContext = getSelectionServiceContext() || lastSelectionServiceContext;
  } catch {
    selectionContext = null;
  }
  const hasSelectionServiceText = !!selectionContext?.text;
  const selectedTextLength = selectionContext?.text?.length || 0;
  const docMapSource = resolveDocMapSource(selectionContext);
  const canMakeDocMap = isFinderWindow && currentFinderSelection
    ? !!currentFinderSelection.canMakeDocMap
    : !!docMapSource?.text && docMapSource.text.length >= docMapSource.threshold;
  const activeEditable = getActiveEditableElement();
  const hasEditableText = !!String(activeEditable?.value || activeEditable?.textContent || "").trim();
  const canUseWritingTools = hasEditableText || (hasTeachTextBody && teachTextIsManuscript) || hasSelectionServiceText;
  const writingToolPromptReady = (mode) => window.AISystem6PromptFilesRuntime
    ?.resolvePromptFile(`writing-tools.${({ describeChange: "describe-change", keyPoints: "key-points" })[mode] || mode}`, activeProjectId, currentLanguage)?.status === "ready";
  const hasTeachTextTranslation = hasTeachTextBody && !!(
    (teachTextSelection.text && getTeachTextTranslationTarget(teachTextSelection.text))
      || getTeachTextTranslationTarget(teachTextBodyInput.value)
  );
  const hasOpenFile = (isTeachText && activeTextFileId) || (isChatFile && selectedChatFileId) || hasDocumentFileSelection;
  const hasProjectCdSelection = winName === "projectCd" && !!getSelectedProjectCdItems().length;
  const hasMountedFileSelection = winName === "textDisk" && (!!selectedMountedFile || selectedMountedFileNames.size > 0);
  const hasEditableFocus = !!activeEditable;
  const selectedProject = getSelectedProject();
  const activeItem = getActiveItem();
  const canDuplicateFinderSelection = hasOpenFile || (!!activeItem && activeItem.canDuplicate !== false && activeItem.virtual !== true);
  const hasClaimSections = !!teachTextBodyInput.value.trim() && getClaimCheckSectionBlocks().length > 0;
  const hasStyleSections = !!teachTextBodyInput.value.trim() && getTeachTextSectionBlocks().length > 0;
  const hasReviewDeskBody = !!reviewDeskBodyInput?.value?.trim();
  const reviewDeskReady = !!teachTextReviewLabel();
  const activeControlEnabled = (selector) => {
    const control = document.querySelector(selector);
    return !!control && !control.disabled && !control.classList.contains("is-disabled") && !control.hidden;
  };

  const availability = {
    "new-document": true,
    "open-text-document": true,
    "new-folder": isProjectMounted,
    "open-menu-selection": true,
    "duplicate-selection": canDuplicateFinderSelection,
    "new-project-disk": true,
    "open-project-disks": true,
    "open-project-disk": !!selectedProject,
    "rename-project-disk": !!selectedProject,
    "duplicate-project-disk": !!selectedProject,
    "archive-project-disk": !!selectedProject,
    "eject-project": isProjectMounted,
    "eject-menu-selection": isProjectMounted || getMountedTextDiskChunks().length > 0 || winName === "projectCd",
    "set-startup-project": true,
    "open-project-info": isProjectMounted,
    "open-file-info": !!activeItem || isProjectMounted,
    "new-text-document": isProjectMounted,
    "save-current": isTeachText || teachTextVisible || (isAssistant && hasConversation),
    "save-chat": isAssistant && hasConversation,
    "save-conversation": isAssistant && hasConversation && isProjectMounted,
    "rename-active-chat": isAssistant && !clioTalkTemporaryMode && !!activeChatFileId,
    "copy-current-chat-markdown": isAssistant && hasConversation,
    "download-current-chat-markdown": isAssistant && hasConversation,
    "find-in-cliotalk": isAssistant && hasConversation,
    "find-next-in-cliotalk": isAssistant && hasConversation && !!clioTalkFindQuery,
    "open-clio-attachment-picker": isAssistant && isProjectMounted,
    "attach-selected-to-cliotalk": winName === "documents" && isClioTalkAttachableProjectFile(getSelectedDocumentItem()),
    "open-clio-genealogy": isAssistant && hasConversation && isProjectMounted,
    "save-clio-harness": isAssistant && hasConversation && isProjectMounted,
    "save-clio-skill": isAssistant && hasConversation && isProjectMounted,
    "save-clio-retrospective": isAssistant && hasConversation && isProjectMounted,
    "save-copy": isTeachText,
    "copy-active-markdown": isTeachText || isChatFile,
    "download-active-markdown": isTeachText || isChatFile,
    "download-active-bilingual-markdown": hasTeachTextTranslation,
    "export-teachtext-project-cd": hasTeachTextBody && (teachTextCanExport || teachTextIsSlides),
    "print-to-slides": (hasTeachTextBody && teachTextCanExport) || hasOutlineBody,
    "ai-print-to-slides": (hasTeachTextBody && teachTextCanExport) || hasOutlineBody,
    "generate-marp-open-clio-stage": hasTeachTextBody && teachTextCanExport,
    "toggle-teachtext-preview": teachTextVisible,
    "toggle-writing-preview": ["quickDraft", "questionSheet", "outline", "sectionDrafts", "reviewDesk", "teachText"].includes(winName),
    "quick-draft-import-chat": winName === "quickDraft",
    "quick-draft-vent-on": winName === "quickDraft",
    "quick-draft-vent-off": winName === "quickDraft",
    "quick-draft-vent-summary": winName === "quickDraft",
    "quick-draft-compose": winName === "quickDraft",
    "quick-draft-talk-points": winName === "quickDraft",
    "quick-draft-mingming": winName === "quickDraft",
    "quick-draft-luoluo": winName === "quickDraft",
    "quick-draft-hkrr": winName === "quickDraft",
    "quick-draft-praise": winName === "quickDraft",
    "quick-draft-save-project": winName === "quickDraft",
    "quick-draft-copy-markdown": winName === "quickDraft",
    "quick-draft-send-teachtext": winName === "quickDraft",
    "quick-draft-send-review": winName === "quickDraft",
    "insert-question-template": winName === "questionSheet",
    "organize-question-sheet": winName === "questionSheet",
    "generate-outline": winName === "questionSheet",
    "advance-question-to-outline": winName === "questionSheet",
    "add-outline-section": winName === "outline",
    "mingming-outline": winName === "outline",
    "structure-outline": winName === "outline",
    "expand-outline": winName === "outline",
    "advance-outline-to-drafts": winName === "outline",
    "previous-section-draft": winName === "sectionDrafts",
    "next-section-draft": winName === "sectionDrafts",
    "draft-current-section": winName === "sectionDrafts",
    "polish-draft": winName === "sectionDrafts",
    "suggest-draft": winName === "sectionDrafts",
    "advance-drafts-to-review": winName === "sectionDrafts",
    "translate-teachtext": hasTeachTextTranslation,
    "style-check-teachtext": hasTeachTextBody || hasFinderTextFileSelection,
    "clip-teachtext-selection": hasTeachTextSelection,
    "ai-critique": canUseWritingTools && writingToolPromptReady("critique"),
    "ai-praise": (canUseWritingTools && writingToolPromptReady("praise")) || (winName === "reviewDesk" && reviewDeskReady && hasReviewDeskBody && writingToolPromptReady("reviewPraise")),
    "ai-digest": canUseWritingTools && writingToolPromptReady("digest"),
    "ai-continue": canUseWritingTools && writingToolPromptReady("continue"),
    "ai-transform": canUseWritingTools,
    "ai-describe-change": canUseWritingTools && writingToolPromptReady("describeChange"),
    "ai-proofread": canUseWritingTools && writingToolPromptReady("proofread"),
    "ai-rewrite": canUseWritingTools && writingToolPromptReady("rewrite"),
    "ai-friendly": canUseWritingTools && writingToolPromptReady("friendly"),
    "ai-professional": canUseWritingTools && writingToolPromptReady("professional"),
    "ai-concise": canUseWritingTools && writingToolPromptReady("concise"),
    "ai-summary": canUseWritingTools && writingToolPromptReady("summary"),
    "ai-key-points": canUseWritingTools && writingToolPromptReady("keyPoints"),
    "ai-list": canUseWritingTools && writingToolPromptReady("list"),
    "ai-table": canUseWritingTools && writingToolPromptReady("table"),
    "print-to-ai": canUseWritingTools,
    "duplicate-file": hasOpenFile,
    "rename-file": hasOpenFile || hasDocumentFolderSelection || hasProjectFinderRename,
    "move-file-trash": hasOpenFile || hasDocumentFolderSelection || hasProjectFinderTrash || hasProjectCdSelection || hasMountedFileSelection,
    "put-away": !!selectedTrashItem,
    "page-setup": canUsePageSetup,
    "print-current": isTeachText && hasTeachTextBody,
    "print-directory": canPrintDirectory,
    "close-active-window": !!activeWin && !activeWin.classList.contains("is-hidden"),
    "undo": hasEditableFocus || isTeachText || isAssistant,
    "cut": hasEditableFocus || isTeachText || isAssistant,
    "copy": !!window.getSelection().toString() || hasEditableFocus || isTeachText || isAssistant,
    "paste": hasEditableFocus || isTeachText || isAssistant,
    "clear-edit": hasEditableFocus || isTeachText || isAssistant,
    "select-all": hasEditableFocus || isTeachText || isAssistant,
    "selection-look-up": hasSelectionServiceText && selectedTextLength <= dictionaryMaxSelectionChars,
    "selection-find-sources": hasSelectionServiceText && selectedTextLength <= 420,
    "selection-copy": hasSelectionServiceText,
    "selection-clip": hasSelectionServiceText,
    "selection-translate": hasSelectionServiceText,
    "selection-new-note": hasSelectionServiceText,
    "selection-ask-assistant": hasSelectionServiceText,
    "make-docmap": canMakeDocMap,
    "insert-last-reply": !!lastAssistantText,
    "clip-last-reply": !!lastAssistantText,
    "clear-chat": isAssistant && hasConversation,
    "start-new-clio-chat": isAssistant,
    "start-temporary-clio-chat": isAssistant && !clioTalkTemporaryMode,
    "reveal-active-chat-file": isAssistant && !clioTalkTemporaryMode && !!activeChatFileId,
    "remember-chat-as-project-memory": isAssistant && !clioTalkTemporaryMode && !!activeChatFileId,
    "clip-assistant-selection": isAssistant && !!window.getSelection().toString().trim(),
    "retry-last-message": isAssistant && !!lastUserText && !activeAbortController,
    "stop-generation": isAssistant && !!activeAbortController,
    "empty-trash": getProjectTrashItems().length > 0,
    "erase-disk": !!selectedProject,
    "reset-system": showResetSystemMenu,
    "open-system-help": true,
    "open-help-folder": true,
    "open-system-concepts-docmap": true,
    "open-system-concepts-clio-stage": true,
    "open-about-multifinder": isMultiFinderMode(),
    "open-applications": true,
    "open-dictionary": true,
    "open-docmap": true,
    "open-claim-check": true,
    "open-review-desk": true,
    "toggle-review-preview": reviewDeskReady,
    "review-view-manuscript": true,
    "review-style-section": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-facts-section": reviewDeskReady && teachTextCanReview && hasClaimSections,
    "review-hkrr-section": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-mingming-section": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-mingming-handoff": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-mingming-handoff-backstage": reviewDeskReady && teachTextCanReview && hasStyleSections,
    "review-export": reviewDeskReady && teachTextCanReview && !!(reviewDeskBodyInput?.value || teachTextBodyInput.value || "").trim(),
    "open-style-sheet": true,
    "style-check-manuscript": teachTextCanReview && !!teachTextBodyInput.value.trim(),
    "style-check-section": teachTextCanReview && hasStyleSections,
    "previous-style-section": hasStyleSections,
    "next-style-section": hasStyleSections,
    "run-claim-check": (teachTextCanReview && !!teachTextBodyInput.value.trim()) || hasFinderTextFileSelection,
    "run-claim-check-section": teachTextCanReview && hasClaimSections,
    "previous-claim-section": hasClaimSections,
    "next-claim-section": hasClaimSections,
    "open-find-path": true,
    "focus-search-query": winName === "findPath",
    "synthesize-search-results": winName === "findPath" && findPathResults.length > 0,
    "copy-search-result-markdown": winName === "findPath" && selectedFindPathIndex !== null,
    "insert-search-result": winName === "findPath" && selectedFindPathIndex !== null,
    "reader-open-source": winName === "reader",
    "reader-clip": winName === "reader" && activeControlEnabled("#reader-clip-button"),
    "reader-clip-translate": winName === "reader" && activeControlEnabled("#reader-clip-translate-button"),
    "reader-send-manuscript": winName === "reader" && activeControlEnabled("#reader-send-manuscript"),
    "reader-make-docmap": winName === "reader" && activeControlEnabled("#reader-docmap-button"),
    "reader-open-clio-stage": winName === "reader" && activeControlEnabled("#reader-open-clio-stage"),
    "focus-reader-question": winName === "reader" && !!currentReaderPage?.text,
    "docmap-save": winName === "docMap" && !!currentDocMap,
    "docmap-print-pdf": winName === "docMap" && !!currentDocMap,
    "docmap-send-question": winName === "docMap" && activeControlEnabled("#docmap-send-question"),
    "docmap-insert-outline": winName === "docMap" && activeControlEnabled("#docmap-insert-outline"),
    "docmap-hkrr": winName === "docMap" && !!currentDocMap,
    "focus-docmap-question": winName === "docMap" && !!currentDocMap,
    "docmap-layout-tree": winName === "docMap" && !!currentDocMap,
    "docmap-layout-radial": winName === "docMap" && !!currentDocMap,
    "docmap-layout-fishbone": winName === "docMap" && !!currentDocMap,
    "docmap-fit-view": winName === "docMap" && !!currentDocMap,
    "docmap-zoom-out": winName === "docMap" && !!currentDocMap,
    "docmap-zoom-in": winName === "docMap" && !!currentDocMap,
    "scrapbook-open-source": winName === "scrapbook" && activeControlEnabled("#open-scrap-source"),
    "scrapbook-toggle-translation": winName === "scrapbook" && activeControlEnabled("#toggle-scrap-translation"),
    "scrapbook-insert": winName === "scrapbook" && activeControlEnabled("#insert-scrap"),
    "scrapbook-attach": winName === "scrapbook" && activeControlEnabled("#attach-scrap-to-assistant"),
    "scrapbook-send-question": winName === "scrapbook" && activeControlEnabled("#send-scraps-to-question"),
    "scrapbook-outline": winName === "scrapbook" && activeControlEnabled("#outline-scraps"),
    "scrapbook-export-bilingual": winName === "scrapbook" && activeControlEnabled("#download-scraps-bilingual"),
    "scrapbook-delete": winName === "scrapbook" && activeControlEnabled("#delete-scrap"),
    "focus-scrapbook-question": winName === "scrapbook" && getSelectedScraps().length > 0,
    "clio-chart-import": winName === "clioChart",
    "clio-chart-new-cpu-gpu": winName === "clioChart",
    "clio-chart-new-gaming": winName === "clioChart",
    "clio-chart-new-battery-power": winName === "clioChart",
    "clio-chart-new-noise-heat": winName === "clioChart",
    "clio-chart-new-display": winName === "clioChart",
    "clio-chart-new-rating": winName === "clioChart",
    "clio-chart-new-blank": winName === "clioChart",
    "clio-chart-save-template": winName === "clioChart",
    "clio-chart-hand-back": winName === "clioChart" && !!window.AISystem6ClioChart?.hasOwnedBlock?.(),
    "clio-chart-bars": winName === "clioChart",
    "clio-chart-matrix": winName === "clioChart",
    "clio-chart-trace": winName === "clioChart",
    "clio-chart-grid": winName === "clioChart",
    "clio-chart-score": winName === "clioChart",
    "clio-chart-source": winName === "clioChart",
    "clio-chart-presentation": winName === "clioChart",
    "clio-chart-send-stage": winName === "clioChart" && !!window.AISystem6ClioChart?.canSendToStage?.(),
    "clio-chart-reverse-sort": winName === "clioChart",
    "clio-chart-lower-better": winName === "clioChart",
    "clio-chart-read": winName === "clioChart",
    "clio-chart-outliers": winName === "clioChart",
    "clio-chart-gaps": winName === "clioChart",
    "clio-chart-write-up": winName === "clioChart",
    "see-as-chart": winName === "teachText" && /\n[ \t]*\|?[-: |]*-{3,}[-: |]*\|?[ \t]*\n/.test(teachTextBodyInput?.value || ""),
    "clio-stage-import": winName === "clioStage",
    "clio-stage-previous": winName === "clioStage" && activeControlEnabled("#clio-stage-prev"),
    "clio-stage-next": winName === "clioStage" && activeControlEnabled("#clio-stage-next"),
    "clio-stage-source": winName === "clioStage" && activeControlEnabled("#clio-stage-source-view"),
    "clio-stage-document": winName === "clioStage" && activeControlEnabled("#clio-stage-document-view"),
    "clio-stage-slide": winName === "clioStage" && activeControlEnabled("#clio-stage-slide-view"),
    "clio-stage-cue": winName === "clioStage" && activeControlEnabled("#clio-stage-cue-view"),
    "focus-clio-stage-question": winName === "clioStage" && activeControlEnabled("#clio-stage-question"),
    "cover-choose-background": winName === "liquidCover",
    "cover-choose-video": winName === "liquidCover",
    "cover-choose-subject": winName === "liquidCover",
    "cover-export-png": winName === "liquidCover",
    "cover-export-video": winName === "liquidCover" && activeControlEnabled("#lc-motion-export"),
    "cover-add-layer": winName === "liquidCover",
    "cover-delete-layer": winName === "liquidCover" && activeControlEnabled("#lc-del-layer"),
    "cover-shape-circle": winName === "liquidCover",
    "cover-shape-squircle": winName === "liquidCover",
    "cover-shape-capsule": winName === "liquidCover",
    "cover-toggle-focus": winName === "liquidCover",
    "cover-preview-motion": winName === "liquidCover" && activeControlEnabled("#lc-motion-preview"),
    "cover-ai-compose": winName === "liquidCover",
    "cmf-save-recipe": winName === "cmfStudio",
    "cmf-export-usdz": winName === "cmfStudio",
    "cmf-shuffle": winName === "cmfStudio",
    "cmf-reset": winName === "cmfStudio",
    "cmf-render": winName === "cmfStudio",
    "cmf-view-front": winName === "cmfStudio" && !!document.querySelector('[data-cmf-view="01-front"]'),
    "cmf-view-back": winName === "cmfStudio" && !!document.querySelector('[data-cmf-view="02-back"]'),
    "cmf-view-side": winName === "cmfStudio" && !!document.querySelector('[data-cmf-view="05-buttons-side"]'),
    "soundscape-choose-local": winName === "soundscape",
    "soundscape-save-moment": winName === "soundscape" && !!window.AISystem6Soundscape?.canSaveMoment?.(),
    "soundscape-toggle-play": winName === "soundscape" && !!window.AISystem6Soundscape?.hasQueue?.(),
    "soundscape-previous": winName === "soundscape" && !!window.AISystem6Soundscape?.hasQueue?.(),
    "soundscape-next": winName === "soundscape" && !!window.AISystem6Soundscape?.hasQueue?.(),
    "soundscape-shuffle": winName === "soundscape" && !!window.AISystem6Soundscape?.hasQueue?.(),
    "soundscape-repeat": winName === "soundscape" && !!window.AISystem6Soundscape?.hasQueue?.(),
    "soundscape-reset-style": winName === "soundscape",
    "soundscape-link-project": winName === "soundscape" && !!window.AISystem6Soundscape?.canLinkProject?.(),
    "endfield-new-session": winName === "endfieldTerminal",
    "endfield-run-query": winName === "endfieldTerminal" && !!document.querySelector("#endfield-query")?.value.trim(),
    "meme-upload": winName === "bureaucracyMeme",
    "meme-download": winName === "bureaucracyMeme" && document.querySelector("#bureaucracy-download-link")?.getAttribute("aria-disabled") !== "true",
    "meme-focus-topic": winName === "bureaucracyMeme",
    "meme-generate": winName === "bureaucracyMeme" && !!document.querySelector("#bureaucracy-topic-input")?.value.trim(),
    "open-find-file": true,
    "open-selected-find-file": selectedFindFileIndex !== null,
    "reveal-selected-find-file": selectedFindFileIndex !== null,
    "open-rebuild-flow": true,
    "rebuild-use-reader": true,
    "rebuild-use-teachtext": true,
    "rebuild-use-clipboard": true,
    "rebuild-use-sample": true,
    "run-rebuild-flow": true,
    "close-rebuild-flow": true,
    "open-context-panel": true,
    "focus-sideask-source": sideAskEnabled && !isMultiFinderMode(),
    "open-model-meter": performanceMeterInput.checked && !!lastModelMetrics,
    "intent-key": true,
    "open-rag": true,
    "open-text-disk": getMountedTextDiskChunks().length > 0,
    "insert-text-disk": isProjectMounted,
    "eject-text-disk": getMountedTextDiskChunks().length > 0,
    "add-text-disk-project": getMountedTextDiskChunks().length > 0,
    "tile-windows": canTileWindows(),
    "toggle-sideask": canUseSideAsk(),
    "restart-system": true,
    "shut-down-system": true,
    "hide-active-app": !nonQuittableAppIds.has(activeAppId) && !hiddenAppIds.has(activeAppId),
    "hide-other-apps": getRunningApps().some((app) => app.id !== activeAppId && !nonQuittableAppIds.has(app.id) && !app.hidden),
    "show-all-apps": hiddenAppIds.size > 0,
    "bring-app-front": true,
    "quit-active-app": !nonQuittableAppIds.has(activeAppId),
    "view-small-icons": true,
    "view-icons": true,
    "view-by-name": true,
    "view-by-date": true,
    "view-by-size": true,
    "view-by-kind": true,
    "view-list": true,
    "hide-sidebars": true,
    "switch-language": true,
    "toggle-writer-mode": false
  };
  Object.keys(availability).forEach((action) => {
    if (!isWorkspaceActionAllowed(action)) availability[action] = false;
  });
  return availability;
}

let cachedMenuActionElements = null;
let cachedSubmenuActionElements = null;

function menuActionElements() {
  cachedMenuActionElements ||= [...document.querySelectorAll("[data-action]")];
  return cachedMenuActionElements;
}

function submenuActionElements() {
  cachedSubmenuActionElements ||= [...document.querySelectorAll("[data-submenu-action]")];
  return cachedSubmenuActionElements;
}

function invalidateMenuActionCache() {
  cachedMenuActionElements = null;
  cachedSubmenuActionElements = null;
}

function updateMenuState() {
  if (typeof renderAppMenuBar === "function") renderAppMenuBar(menuOwnerAppId || activeAppId);
  const state = getActionAvailability();
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeViewWindow = viewWindowNames.includes(activeWin?.dataset.window) ? activeWin.dataset.window : null;
  const viewTargetIsWritingTools = !activeViewWindow && writingToolsAreViewTarget();
  const activeViewMode = viewTargetIsWritingTools
    ? normalizeFinderViewMode(writingToolsViewMode)
    : normalizeFinderViewMode(windowViewModes[activeViewWindow || "projects"]);
  document.querySelectorAll(".apple-multifinder-about-item, .apple-multifinder-about-separator")
    .forEach((item) => item.classList.toggle("is-hidden", !isMultiFinderMode()));

  menuActionElements().forEach(btn => {
    const action = btn.dataset.action;
    if (state[action] !== undefined) {
      btn.classList.toggle("is-disabled", !state[action]);
    }
    if (action === "toggle-sideask") {
      btn.classList.toggle("is-hidden", isMultiFinderMode());
      btn.classList.toggle("is-checked", sideAskEnabled);
      btn.classList.toggle("is-active", sideAskEnabled && btn.id === "teachtext-sideask");
      if (btn.hasAttribute("aria-pressed")) btn.setAttribute("aria-pressed", String(sideAskEnabled));
    }
    if (action === "tile-windows") {
      btn.classList.toggle("is-hidden", matchMedia("(max-width:860px) and (orientation:portrait)").matches);
    }
    if (action === "toggle-liquid-glass") {
      const useLiquidGlass = !!liquidGlassInput?.checked;
      btn.textContent = t(useLiquidGlass ? "retro_interface" : "liquid_glass");
      btn.classList.remove("is-checked");
    }
    if (action === "reset-system") {
      btn.classList.toggle("is-hidden", !state[action]);
    }
    if (viewTargetIsWritingTools && ["view-by-name", "view-by-date", "view-by-size", "view-by-kind", "view-list"].includes(action)) {
      btn.classList.add("is-disabled");
    }
    if (btn.dataset.viewMode) {
      btn.classList.toggle("is-checked", normalizeFinderViewMode(btn.dataset.viewMode) === activeViewMode);
    }
  });
  document.querySelectorAll(".menu-submenu").forEach((sub) => {
    const children = [...sub.querySelectorAll(".menu-submenu-popover [data-action]")];
    const enabled = children.some((button) => !button.classList.contains("is-disabled"));
    sub.classList.toggle("is-disabled", !enabled);
    sub.querySelector(":scope > .menu-submenu-trigger")?.classList.toggle("is-disabled", !enabled);
  });
  submenuActionElements().forEach((btn) => {
    const action = btn.dataset.submenuAction;
    if (action === "ask-cliotalk") {
      const disabled = !state["print-to-ai"];
      btn.classList.toggle("is-disabled", disabled);
      btn.closest(".menu-submenu")?.classList.toggle("is-disabled", disabled);
    }
  });
  renderMultiFinderMenu();
}

// Windows whose behaviour lives in a lazily loaded module.
//
// The load MUST happen here rather than in whichever action handler opens the
// window, because openWindow() is the one path every opener shares — including
// session restore, which reopens last session's windows directly. A window
// wired only through its action comes back from restore visible but inert: the
// frame is there and nothing responds. `attach` re-renders the restored window
// so it is usable before the user touches it.
//
// liquidCover and quickDraft are absent on purpose: they load their module in
// the entrypoint block above and return early through the module's own open().
//
// Contract: tests/features/lazy-window-restore.test.mjs
const lazyWindowModules = {
  questionSheet: { ensure: () => ensureWritingFlowModule() },
  outline: { ensure: () => ensureWritingFlowModule() },
  sectionDrafts: { ensure: () => ensureWritingFlowModule() },
  rebuildFlow: { ensure: () => ensureWritingFlowModule() },
  dictionary: {
    ensure: async () => {
      await ensureSystemDictionaryData();
      await ensureDictionaryHelpModule();
    },
  },
  systemHelp: {
    ensure: async () => {
      await ensureSystemDictionaryData();
      await ensureDictionaryHelpModule();
    },
  },
  memoryCards: { ensure: () => ensureMemoryCardsModule() },
  alarmClock: { ensure: () => ensureAlarmClockModule() },
  translationPad: { ensure: () => ensureTranslationPadModule() },
  bureaucracyMeme: { ensure: () => ensureBureaucracyMemeModule() },
  endfieldTerminal: {
    ensure: () => ensureEndfieldTerminalModule(),
    attach: () => window.AISystem6EndfieldTerminal?.attach?.(),
  },
  timeMachine: {
    ensure: () => ensureTimeMachineModule(),
    attach: () => window.AISystem6TimeMachine?.attach?.(),
  },
  cmfStudio: { ensure: () => ensureCmfStudioModule() },
  soundscape: {
    ensure: () => ensureSoundscapeModule(),
    attach: () => window.AISystem6Soundscape?.attach?.(),
  },
  clioStage: {
    ensure: () => ensureClioStageModule(),
    attach: () => window.AISystem6ClioStage?.attach?.(),
  },
  clioChart: {
    ensure: () => ensureClioChartModule(),
    attach: () => window.AISystem6ClioChart?.attach?.(),
  },
};

async function loadLazyWindowModule(name) {
  const entry = lazyWindowModules[name];
  if (!entry || typeof entry.ensure !== "function") return;
  await entry.ensure();
  entry.attach?.();
}

async function openWindow(name, options = {}) {
  if (!isWorkspaceWindowAllowed(name)) {
    updateMenuState();
    return;
  }
  const {
    skipFinderMode = false,
    skipPlacement = false,
    skipFocus = false,
    skipLiquidCoverEntrypoint = false,
    skipQuickDraftEntrypoint = false,
  } = options;

  if (name === "styleSheet" || name === "claimCheck") {
    openReviewDesk(name === "claimCheck" ? "facts" : "style");
    return;
  }
  if (name === "liquidCover" && !skipLiquidCoverEntrypoint && typeof ensureLiquidCoverModule === "function") {
    await ensureLiquidCoverModule();
    if (typeof window.AISystem6LiquidCover?.open === "function") {
      await window.AISystem6LiquidCover.open({ skipFinderMode, skipPlacement, skipFocus });
      return;
    }
  }
  if (name === "quickDraft" && !skipQuickDraftEntrypoint && typeof ensureQuickDraftModule === "function") {
    await ensureQuickDraftModule();
    if (typeof window.AISystem6QuickDraft?.open === "function") {
      await window.AISystem6QuickDraft.open({ skipFinderMode, skipPlacement, skipFocus });
      return;
    }
  }
  const win = getWindow(name);
  if (!win) return;
  const wasAlreadyOpen = !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden");
  const sourceWindowForSingleTask = !isMultiFinderMode() && !skipFinderMode
    ? document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)")
    : null;
  const targetAppId = getWindowAppId(name);
  const canOpen = skipFinderMode ? true : await prepareFinderModeForApp(targetAppId);
  if (!canOpen) return;
  if (sourceWindowForSingleTask && sourceWindowForSingleTask !== win) {
    win.dataset.returnWindowName = sourceWindowForSingleTask.dataset.window || "";
  } else {
    delete win.dataset.returnWindowName;
  }
  win.dataset.app = targetAppId;
  setWindowLayoutMetadata(win);
  ensureRunningApp(win.dataset.app, name);
  hiddenAppIds.delete(win.dataset.app);
  windowsForApp(win.dataset.app).forEach((item) => item.classList.remove("is-app-hidden"));

  await loadLazyWindowModule(name);

  if (name === "projects") {
    renderProjectDisks();
  }
  if (name === "finder") {
    renderFinder();
  }
  if (["helpFolder", "applications", "disk"].includes(name)) {
    renderStaticFinderWindow(name);
  }
  if (name === "projectCd") {
    renderProjectCd();
  }
  if (name === "importUtility") {
    renderImportPreview();
  }
  if (["questionSheet", "outline", "sectionDrafts", "claimCheck", "reviewDesk"].includes(name)) {
    renderPipeline();
  }
  if (name === "styleSheet" || name === "reviewDesk") {
    renderStyleCheckSections();
    renderClaimCheckSections();
  }
  if (name === "notePad") {
    renderNotePadPage();
  }
  if (name === "writingBell") {
    renderWritingBell();
  }
  if (name === "memoryCards") {
    if (!memoryCardsHasGame()) newMemoryCardsGame();
    renderMemoryCards();
  }
  if (name === "cmfStudio" && typeof renderCmfStudio === "function") {
    renderCmfStudio();
  }
  if (name === "bureaucracyMeme" && typeof renderBureaucracyMemeGenerator === "function") {
    renderBureaucracyMemeGenerator();
  }
  if (name === "puzzle") {
    newPuzzleGame({ announce: false });
  }
  if (name === "imageManager") {
    renderTeachTextImageAttachments();
  }
  if (name === "teachText") {
    updateTeachTextBoundaries();
    updateTeachTextTranslateButton();
    updateTeachTextBilingualExportButton();
  }
  if (name === "about") {
    renderAboutMacintosh();
  }
  if (name === "guide" && typeof renderGuideStep === "function") {
    renderGuideStep();
  }
  if (name === "systemStatus") {
    renderSystemStatus();
  }
  if (name === "control") {
    refreshControlPanelModels();
    if (!wasAlreadyOpen && typeof setControlTab === "function") setControlTab();
  }
  if (name === "notificationCenter") {
    renderNotificationCenter();
  }
  if (name === "rebuildFlow") {
    renderRebuildFlow();
  }
  if (name === "docMap") {
    renderDocMap();
  }
  if (name === "dictionary") {
    renderDictionaryResult();
  }
  if (name === "systemHelp") {
    renderSystemHelp();
  }
  if (name === "endfieldTerminal") {
    window.AISystem6EndfieldTerminal?.attach?.();
  }

  win.classList.remove("is-hidden", "is-collapsed");
  if (centeredSystemWindowNames.has(name)) {
    placeCenteredSystemWindow(win);
  }
  if (name === "saveChat") {
    placeSaveChatWindow();
  }
  if (name === "findPath") {
    document.body.classList.add("has-find-path-open");
  }
  if (name === "findFile") {
    renderFindFileResults();
  }
  if (name === "contextPanel") {
    document.body.classList.add("has-context-panel-open");
  }
  updateQuickDraftFocusChrome();

  const shouldPlaceWindow = !skipPlacement && !wasAlreadyOpen && win.dataset.userPositioned !== "true";

  if (shouldPlaceWindow && !centeredSystemWindowNames.has(name) && !["about", "saveChat"].includes(name)) {
    if (!usePortraitWindowFlow(win)) {
      const desktop = document.querySelector(".desktop");
      const desktopRect = desktop?.getBoundingClientRect();
      const avoidance = getDesktopAvoidanceInsets({ margin: 24, spineGap: 18, iconGap: 48 });
      const baseLeft = writerMode ? 24 : avoidance.left;
      const baseTop = writerMode ? 34 : writingSpineAlignedTopForWindow(win, 18);
      const step = 24;
      const maxOffset = 200;

      if (name === "clioStage" && !writerMode && placeClioStageDefaultWindow(win)) {
        // ClioStage uses the full work area between the writing spine and Dock.
      } else if (name === "assistant" && !writerMode) {
        const availableWidth = desktopRect
          ? Math.max(340, desktopRect.width - avoidance.left - avoidance.right - 24)
          : 720;
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.width = `${Math.min(720, availableWidth)}px`;
        win.style.height = "min(540px, calc(100vh - 108px))";
        win.style.maxHeight = "";
        win.style.transform = "none";
      } else if (name === "rebuildFlow" && !writerMode) {
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.transform = "none";
      } else if (["reader", "scrapbook", "endfieldTerminal", "liquidCover", "quickDraft"].includes(name) && !writerMode) {
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.transform = "none";
        maximizeWindow(win, { top: baseTop });
      } else if (name === "docMap" && !writerMode) {
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.transform = "none";
        maximizeWindow(win, { top: baseTop });
        requestAnimationFrame(() => {
          renderDocMap();
          requestAnimationFrame(restoreDocMapCanvasView);
        });
      } else if (name === "systemHelp" && !writerMode) {
        win.style.left = `${avoidance.left}px`;
        win.style.top = `${baseTop}px`;
        win.style.right = "auto";
        win.style.transform = "none";
      } else if (["findPath", "contextPanel"].includes(name) && !writerMode) {
        placeUtilityWindow(name, win);
      } else if (assistantSidecarWindowNames.has(name) && !writerMode) {
        placeAssistantSidecarWindow(name, win);
      } else if (isDeskAccessoryPlacementWindow(name) && !writerMode) {
        placeDA(win);
      } else if (isFinderCascadeWindow(name) && !writerMode) {
        placeFinderCascadeWindow(win, { avoidance, baseTop });
      } else {
        win.style.left = `${baseLeft + cascadeOffset}px`;
        win.style.top = `${baseTop + cascadeOffset}px`;
        win.style.right = "auto";
        cascadeOffset += step;
      }

      if (cascadeOffset > maxOffset) cascadeOffset = 0;
      nudgeNewWindowAwayFromSameApp(win);
      markWindowSystemPositioned(win);
      scheduleWritingSpineTitleAlignment(win);
    }
  }

  if (shouldPlaceWindow && ["outline", "sectionDrafts", "reviewDesk", "teachText"].includes(name)) {
    arrangeActiveWritingWorkspace();
  }

  if (!skipFocus) {
    focusWindow(win);
    if (!["assistant", "about"].includes(name)) playSystemSound("open");
  }

  if (name === "about") {
    modalScrim.classList.remove("is-hidden");
  }
  syncMobileAppForeground();
  updateMenuState();
  scheduleWorkingSessionSave?.();
}

function arrangeOutlineTeachTextSplit() {
  const outline = getWindow("outline");
  const teachText = getWindow("teachText");
  if (!outline || !teachText) return;
  if (outline.classList.contains("is-hidden") || teachText.classList.contains("is-hidden")) return;
  if (writerMode) return;
  if (outline.dataset.userPositioned === "true" || teachText.dataset.userPositioned === "true") return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect?.();
  const avoidance = getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 132 });
  const gap = 16;
  const left = Math.max(18, avoidance.left || 18);
  const top = Math.max(18, writingSpineAlignedTop?.(18) || 18);
  const right = Math.max(132, avoidance.right || 132);
  const totalWidth = Math.max(620, (desktopRect?.width || window.innerWidth) - left - right - gap);
  const totalHeight = Math.max(420, (desktopRect?.height || window.innerHeight) - top - 36);
  const stacked = window.matchMedia("(orientation: portrait), (max-width: 980px)").matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const applyFrame = (win, frame) => {
    placeWindowForExplicitLayout(win, {
      left: frame.left,
      top: frame.top,
      width: frame.width,
      height: frame.height,
      maxHeight: frame.height,
    });
  };

  if (stacked) {
    const halfHeight = Math.max(220, Math.floor((totalHeight - gap) / 2));
    applyFrame(outline, { left, top, width: totalWidth, height: halfHeight });
    applyFrame(teachText, { left, top: top + halfHeight + gap, width: totalWidth, height: totalHeight - halfHeight - gap });
    return;
  }

  const outlineWidth = clamp(Math.round(totalWidth * 0.42), 360, Math.max(360, totalWidth - 420));
  const teachTextWidth = totalWidth - outlineWidth - gap;
  applyFrame(outline, { left, top, width: outlineWidth, height: totalHeight });
  applyFrame(teachText, { left: left + outlineWidth + gap, top, width: teachTextWidth, height: totalHeight });
}

// Co-locate two writing windows as one phase workspace (Section Drafts ‖ draft
// manuscript; Review Desk ‖ finalized manuscript). Writing windows are pinned to a
// paper-driven minimum width and cannot shrink below it without breaking the editor
// measure, so the pairing is responsive: side-by-side only when two paper widths
// fit, otherwise stacked vertically (still one workspace). Invoked by an explicit
// "advance" action, so it re-arranges even a previously user-positioned pair.
function arrangeWritingPairSplit(leftName, rightName) {
  const leftWin = getWindow(leftName);
  const rightWin = getWindow(rightName);
  if (!leftWin || !rightWin) return;
  if (leftWin.classList.contains("is-hidden") || rightWin.classList.contains("is-hidden")) return;
  if (writerMode) return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect?.();
  const avoidance = getDesktopAvoidanceInsets({ margin: 18, spineGap: 18, iconGap: 132 });
  const gap = 16;
  const left = Math.max(18, avoidance.left || 18);
  const top = Math.max(18, writingSpineAlignedTop?.(18) || 18);
  const right = Math.max(132, avoidance.right || 132);
  const available = Math.max(560, (desktopRect?.width || window.innerWidth) - left - right);
  const totalHeight = Math.max(420, (desktopRect?.height || window.innerHeight) - top - 36);

  // Paper-driven minimum width is load-bearing; never set a width below it.
  const minW = Math.max(
    parseFloat(getComputedStyle(rightWin).minWidth) || 0,
    parseFloat(getComputedStyle(leftWin).minWidth) || 0,
    540
  );
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const canSideBySide = !portrait && available >= (minW * 2 + gap);
  const applyFrame = (win, frame) => placeWindowForExplicitLayout(win, {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    maxHeight: frame.height,
  });

  if (canSideBySide) {
    const pairWidth = minW * 2 + gap;
    const startLeft = left + Math.max(0, Math.floor((available - pairWidth) / 2));
    applyFrame(leftWin, { left: startLeft, top, width: minW, height: totalHeight });
    applyFrame(rightWin, { left: startLeft + minW + gap, top, width: minW, height: totalHeight });
    return;
  }

  const halfHeight = Math.max(220, Math.floor((totalHeight - gap) / 2));
  applyFrame(leftWin, { left, top, width: minW, height: halfHeight });
  applyFrame(rightWin, { left, top: top + halfHeight + gap, width: minW, height: totalHeight - halfHeight - gap });
}

// 起草台: Section Drafts (editable owner) beside the read-only draft manuscript.
function arrangeDraftingWorkspaceSplit() {
  arrangeWritingPairSplit("sectionDrafts", "teachText", 0.42);
}

// 审校台: Review Desk beside the finalized manuscript (editable owner under review).
function arrangeReviewWorkspaceSplit() {
  arrangeWritingPairSplit("reviewDesk", "teachText");
}

// Arrange whichever phase workspace is currently open as a manuscript pair. Called
// from openWindow's placement tail (so it runs after default cascade placement and
// sticks). Priority follows the route: review > drafting > legacy outline split.
function arrangeActiveWritingWorkspace() {
  // On a phone each writing phase is one full-screen app, so pairing two paper
  // widths side by side is meaningless — and these splits write inline frames
  // that would override the full-screen shell.
  if (isPortraitDocumentFlow() && mobileFullScreenAppIds.has("teachText")) return;
  const isOpen = (name) => {
    const win = getWindow(name);
    return win && !win.classList.contains("is-hidden");
  };
  if (!isOpen("teachText")) return;
  const reviewPhase = typeof teachTextReviewLabel === "function" && teachTextReviewLabel();
  if (reviewPhase && isOpen("reviewDesk")) {
    arrangeReviewWorkspaceSplit();
  } else if (isOpen("sectionDrafts")) {
    arrangeDraftingWorkspaceSplit();
  } else if (isOpen("outline")) {
    arrangeOutlineTeachTextSplit();
  }
}

function placeUtilityWindow(name, win) {
  const margin = 16;
  const menuHeight = 25;
  const iconGutter = 112;
  const assistant = getWindow("assistant");
  const pairName = name === "findPath" ? "contextPanel" : "findPath";
  const pair = getWindow(pairName);
  const width = win.offsetWidth || (name === "findPath" ? 420 : 380);
  const height = win.offsetHeight || (name === "findPath" ? 620 : 520);
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const rightColumnLeft = Math.max(margin, window.innerWidth - width - iconGutter);
  let left = rightColumnLeft;
  let top = writingSpineAlignedTopForWindow(win, 18);

  if (assistant && !assistant.classList.contains("is-hidden")) {
    const rect = assistant.getBoundingClientRect();
    const candidateLeft = rect.right + 12;

    if (candidateLeft + width <= window.innerWidth - margin) {
      left = candidateLeft;
      top = Math.max(menuHeight + 8, rect.top);
    }
  }

  left = Math.min(Math.max(margin, left), maxLeft);

  if (name === "contextPanel" && pair && !pair.classList.contains("is-hidden")) {
    const pairRect = pair.getBoundingClientRect();
    const stackedTop = pairRect.bottom + 12;
    const bottomLimit = window.innerHeight - margin;
    top = stackedTop + height <= bottomLimit
      ? stackedTop
      : Math.max(writingSpineAlignedTopForWindow(win, 18), bottomLimit - height);
    left = Math.min(Math.max(margin, pairRect.left), maxLeft);
  }

  if (name === "findPath" && pair && !pair.classList.contains("is-hidden")) {
    const pairRect = pair.getBoundingClientRect();
    const pairTop = Math.min(window.innerHeight - pairRect.height - margin, top + height + 12);
    pair.style.left = `${left}px`;
    pair.style.top = `${Math.max(menuHeight + margin, pairTop)}px`;
    pair.style.right = "auto";
    pair.style.transform = "none";
  }

  win.style.left = `${left}px`;
  win.style.top = `${Math.min(top, window.innerHeight - height - margin)}px`;
  win.style.right = "auto";
  win.style.transform = "none";
}

function visibleDeskAccessories() {
  return Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
    .filter(isDeskAccessoryPlacementWindow);
}

function getTileCandidateWindows() {
  if (writerMode) return [];
  if (window.matchMedia("(max-width: 860px)").matches) return [];
  return Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
    .filter((win) => {
      if (["about", "saveChat"].includes(win.dataset.window)) return false;
      if (isDeskAccessoryPlacementWindow(win)) return false;
      if (isMultiFinderMode()) return true;
      const appId = getWindowAppId(win);
      if (sideAskEnabled && isSideAskPairApp(appId)) return true;
      return appId === activeAppId;
    });
}

function canTileWindows() {
  return getTileCandidateWindows().some((win) => tileableWindowNames.has(win.dataset.window));
}

function visibleWindowOrNull(candidate) {
  return candidate
    && !candidate.classList.contains("is-hidden")
    && !candidate.classList.contains("is-app-hidden")
    && !candidate.classList.contains("is-collapsed")
    ? candidate
    : null;
}

function isDeskAccessorySidecar(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return name === "dictation" || name === "translationPad";
}

function isFixedDeskAccessoryWindow(winOrName) {
  return getWindowAppId(winOrName) === "accessories" && !isDeskAccessorySidecar(winOrName);
}

function isDeskAccessoryPlacementWindow(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return name === "guide" || isFixedDeskAccessoryWindow(winOrName);
}

function visibleDeskAccessorySidecars() {
  return ["dictation", "translationPad"]
    .map(getWindow)
    .filter(visibleWindowOrNull);
}

function raiseVisibleDeskAccessorySidecars(frontWin = null) {
  const ordered = visibleDeskAccessorySidecars()
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .filter((candidate) => candidate !== frontWin);
  if (isDeskAccessorySidecar(frontWin) && visibleWindowOrNull(frontWin)) ordered.push(frontWin);
  ordered.forEach((candidate) => {
    setWindowLayerZ(candidate, nextWindowLayerZ());
  });
}

function deskAccessorySourceWindow(frontWin) {
  return document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)")
    || visibleWindowOrNull(getWindow("assistant"));
}

function ensureWritingSpineCollapsedForPortraitDA() {
  if (!isPortraitDocumentFlow() || writerMode) return;
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  if (!spine || spine.classList.contains("is-shaded")) return;
  spine.classList.add("is-shaded");
  if (typeof syncWritingToolsShadeToggle === "function") syncWritingToolsShadeToggle();
}

function arrangeDeskAccessories(frontWin = null) {
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const spineRect = spine?.getBoundingClientRect?.();
  const margin = 16;
  const gap = 12;
  const stepX = 36;
  const stepY = 32;
  const avoidance = getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 48 });
  const leftMin = avoidance.left;
  let topMin = frontWin ? writingSpineAlignedTopForWindow(frontWin, margin) : writingSpineAlignedTop(margin);
  if (isPortraitDocumentFlow()) {
    if (desktopRect && spineRect && spineRect.height > 0) {
      topMin = Math.max(topMin, Math.round(spineRect.bottom - desktopRect.top + gap));
    }
  }
  const rightMax = Math.max(leftMin + 220, (desktopRect?.width || innerWidth) - avoidance.right - margin);
  const bottomMax = Math.max(topMin + 220, (desktopRect?.height || innerHeight) - margin);
  const ordered = visibleDeskAccessories()
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .filter((candidate) => candidate !== frontWin && candidate.dataset.userPositioned !== "true");
  if (frontWin && !frontWin.classList.contains("is-hidden") && frontWin.dataset.userPositioned !== "true") ordered.push(frontWin);
  if (!ordered.length) return;

  const sizes = ordered.map((candidate) => {
    clearPortraitWindowSize(candidate);
    candidate.style.height = "";
    candidate.style.maxHeight = "";
    const preferredWidth = deskAccessoryDefaultWidths.get(candidate.dataset.window) || candidate.offsetWidth || 360;
    const width = Math.min(preferredWidth, rightMax - leftMin);
    const height = Math.min(candidate.offsetHeight || 320, bottomMax - topMin);
    return { candidate, width, height };
  });
  const stackWidth = Math.max(...sizes.map((item) => item.width)) + stepX * (sizes.length - 1);
  const stackHeight = Math.max(...sizes.map((item) => item.height)) + stepY * (sizes.length - 1);
  const startMaxX = Math.max(leftMin, rightMax - stackWidth);
  const startMaxY = Math.max(topMin, bottomMax - stackHeight);
  let startX = startMaxX;
  let startY = topMin;

  if (isPortraitDocumentFlow() && desktopRect && spineRect && spineRect.width > 0 && spineRect.height > 0) {
    const primaryWidth = sizes[0]?.width || 360;
    const primaryHeight = sizes[0]?.height || 320;
    const centerX = ((desktopRect.width || innerWidth) - primaryWidth) / 2;
    // Visual center in portrait should sit slightly above geometric center.
    const visualLift = Math.min(120, Math.round((desktopRect.height || innerHeight) * 0.1));
    const centerY = (((desktopRect.height || innerHeight) - primaryHeight) / 2) - visualLift;
    startX = clampNumber(Math.round(centerX), leftMin, startMaxX);
    startY = clampNumber(Math.round(centerY), topMin, startMaxY);
  }

  const source = deskAccessorySourceWindow(frontWin);
  let foundSourceSlot = false;

  if (!isPortraitDocumentFlow() && source && getWindowAppId(source) !== "accessories") {
    const rect = source.getBoundingClientRect();
    const desktopLeft = desktopRect?.left || 0;
    const desktopTop = desktopRect?.top || 0;
    const left = rect.left - desktopLeft;
    const right = rect.right - desktopLeft;
    const top = rect.top - desktopTop;
    const bottom = rect.bottom - desktopTop;
    const slots = [
      [right + gap + stackWidth <= rightMax, right + gap, clampNumber(top, topMin, startMaxY)],
      [left - gap - stackWidth >= leftMin, left - gap - stackWidth, clampNumber(top, topMin, startMaxY)],
      [bottom + gap + stackHeight <= bottomMax, clampNumber(left, leftMin, startMaxX), bottom + gap],
      [top - gap - stackHeight >= topMin, clampNumber(left, leftMin, startMaxX), top - gap - stackHeight],
    ];
    const slot = slots.find((candidate) => candidate[0]);
    if (slot) {
      [, startX, startY] = slot;
      foundSourceSlot = true;
    }
  }

  if (!isPortraitDocumentFlow() && !foundSourceSlot) {
    const anchor = ordered.find((candidate) => candidate !== frontWin);
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const desktopLeft = desktopRect?.left || 0;
      const desktopTop = desktopRect?.top || 0;
      startX = clampNumber(rect.left - desktopLeft, leftMin, startMaxX);
      startY = clampNumber(rect.top - desktopTop, topMin, startMaxY);
    }
  }

  sizes.forEach(({ candidate, width }, index) => {
    // The cascade step assumes desktop slack. In portrait a desk accessory is
    // already sized to the whole working span, so every window after the first
    // would hang off the right edge; clamp each step back inside it.
    const cascadeLeft = clampNumber(
      startX + stepX * index,
      leftMin,
      Math.max(leftMin, rightMax - width)
    );
    candidate.style.left = `${Math.round(cascadeLeft)}px`;
    candidate.style.top = `${Math.round(startY + stepY * index)}px`;
    candidate.style.width = `${Math.round(width)}px`;
    candidate.style.right = "auto";
    candidate.style.transform = "none";
    setWindowLayerZ(candidate, nextWindowLayerZ(8100 + index));
  });
}

function placeDA(win) {
  ensureWritingSpineCollapsedForPortraitDA();
  if (win?.dataset.userPositioned === "true") {
    setWindowLayerZ(win, nextWindowLayerZ());
    return;
  }
  // Control Panel and Chooser have their own centered-dialog rule in the
  // portrait stylesheet (fixed, transform: translateX(-50%)), but inline
  // styles always beat it — the desktop cascade below was landing them at an
  // arbitrary carried-over position instead of that designed spot.
  if (isPortraitDocumentFlow() && (win?.classList.contains("control-panel") || win?.classList.contains("chooser-panel"))) {
    ["left", "top", "right", "width", "transform"].forEach((prop) => { win.style[prop] = ""; });
    setWindowLayerZ(win, nextWindowLayerZ());
    return;
  }
  arrangeDeskAccessories(win);
}

function hasOpenAssistantSidecar() {
  return [...assistantSidecarWindowNames].some((name) => {
    const win = getWindow(name);
    return win && !win.classList.contains("is-hidden");
  });
}

function storeAssistantFrameForSidecar(assistant) {
  if (!assistant || assistant.dataset.sidecarAdjusted === "true") return;
  assistant.dataset.sidecarAdjusted = "true";
  assistant.dataset.sidecarRestoreLeft = assistant.style.left || "";
  assistant.dataset.sidecarRestoreTop = assistant.style.top || "";
  assistant.dataset.sidecarRestoreRight = assistant.style.right || "";
  assistant.dataset.sidecarRestoreWidth = assistant.style.width || "";
  assistant.dataset.sidecarRestoreHeight = assistant.style.height || "";
  assistant.dataset.sidecarRestoreTransform = assistant.style.transform || "";
}

function restoreAssistantAfterSidecar(options = {}) {
  const assistant = getWindow("assistant");
  if (!assistant || assistant.dataset.sidecarAdjusted !== "true") return;
  if (!options.force && hasOpenAssistantSidecar()) return;

  assistant.style.left = assistant.dataset.sidecarRestoreLeft || "";
  assistant.style.top = assistant.dataset.sidecarRestoreTop || "";
  assistant.style.right = assistant.dataset.sidecarRestoreRight || "";
  assistant.style.width = assistant.dataset.sidecarRestoreWidth || "";
  assistant.style.height = assistant.dataset.sidecarRestoreHeight || "";
  assistant.style.transform = assistant.dataset.sidecarRestoreTransform || "";

  delete assistant.dataset.sidecarAdjusted;
  delete assistant.dataset.sidecarRestoreLeft;
  delete assistant.dataset.sidecarRestoreTop;
  delete assistant.dataset.sidecarRestoreRight;
  delete assistant.dataset.sidecarRestoreWidth;
  delete assistant.dataset.sidecarRestoreHeight;
  delete assistant.dataset.sidecarRestoreTransform;
}

function getAssistantSidecarDefaults(name) {
  return {
    dictation: { width: 380, height: 520, minAssistantWidth: 420 },
    translationPad: { width: 380, height: 520, minAssistantWidth: 420 },
    importUtility: { width: 460, height: 520, minAssistantWidth: 420 },
    rag: { width: 500, height: 360, minAssistantWidth: 420 },
  }[name] || { width: 380, height: 480, minAssistantWidth: 420 };
}

function isAssistantSidecarWindow(winOrName) {
  const name = typeof winOrName === "string" ? winOrName : winOrName?.dataset.window;
  return assistantSidecarWindowNames.has(name);
}

function visibleSidecarAnchor(candidate) {
  return candidate
    && !candidate.classList.contains("is-hidden")
    && !candidate.classList.contains("is-app-hidden")
    && !candidate.classList.contains("is-collapsed")
    ? candidate
    : null;
}

function getPreferredAssistantSidecarSource(name) {
  const active = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)");
  if (name === "importUtility" || name === "rag") {
    return visibleSidecarAnchor(getWindow("projects"))
      || visibleSidecarAnchor(getWindow("assistant"))
      || (active && !isAssistantSidecarWindow(active) ? active : null);
  }
  return active && !isAssistantSidecarWindow(active) ? active : null;
}

function placeAssistantSidecarWindow(name, win) {
  const margin = 16;
  const gap = 12;
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const avoidance = getDesktopAvoidanceInsets({ margin, spineGap: 18, iconGap: 48 });
  const desktopWidth = desktopRect?.width || window.innerWidth;
  const desktopHeight = desktopRect?.height || Math.max(260, window.innerHeight - 25);
  const workLeft = mobile ? margin : avoidance.left;
  const workTop = mobile ? margin : writingSpineAlignedTopForWindow(win, 18);
  const workRight = Math.max(workLeft + 220, desktopWidth - (mobile ? margin : avoidance.right + margin));
  const workBottom = Math.max(workTop + 260, desktopHeight - margin);
  const workWidth = Math.max(220, workRight - workLeft);
  const workHeight = Math.max(260, workBottom - workTop);
  const defaults = getAssistantSidecarDefaults(name);
  const minAssistantWidth = defaults.minAssistantWidth;
  const width = Math.min(win.offsetWidth || defaults.width, workWidth);
  const height = Math.min(win.offsetHeight || defaults.height, workHeight);
  const sidecarInputTarget = name === "dictation"
    ? dictationInputTarget
    : name === "translationPad"
      ? translationPadInputTarget
      : null;
  const targetWindow = sidecarInputTarget?.closest?.(".window");
  const sourceWindow = (
    targetWindow && !isAssistantSidecarWindow(targetWindow)
      ? visibleSidecarAnchor(targetWindow)
      : null
  )
    || getPreferredAssistantSidecarSource(name)
    || visibleSidecarAnchor(getWindow("assistant"));

  win.style.width = `${width}px`;
  win.style.maxHeight = `${height}px`;
  win.style.right = "auto";
  win.style.transform = "none";

  if (mobile || !sourceWindow || sourceWindow.classList.contains("is-hidden")) {
    win.style.left = `${workLeft}px`;
    win.style.top = `${workTop}px`;
    return;
  }

  const viewportRect = sourceWindow.getBoundingClientRect();
  const desktopLeft = desktopRect?.left || 0;
  const desktopTop = desktopRect?.top || 0;
  const rect = {
    left: viewportRect.left - desktopLeft,
    right: viewportRect.right - desktopLeft,
    top: viewportRect.top - desktopTop,
    bottom: viewportRect.bottom - desktopTop,
  };
  const topMin = workTop;
  const topMax = Math.max(topMin, workBottom - height);
  const leftMin = workLeft;
  const leftMax = Math.max(leftMin, workRight - width);
  const candidates = [
    {
      fits: rect.right + gap + width <= workRight,
      left: rect.right + gap,
      top: clampNumber(rect.top, topMin, topMax),
    },
    {
      fits: rect.left - gap - width >= workLeft,
      left: rect.left - gap - width,
      top: clampNumber(rect.top, topMin, topMax),
    },
    {
      fits: rect.bottom + gap + height <= workBottom,
      left: clampNumber(rect.left, leftMin, leftMax),
      top: rect.bottom + gap,
    },
    {
      fits: rect.top - gap - height >= topMin,
      left: clampNumber(rect.left, leftMin, leftMax),
      top: rect.top - gap - height,
    },
  ];
  const openSidecarOffset = [...assistantSidecarWindowNames]
    .filter((sidecarName) => sidecarName !== name)
    .map(getWindow)
    .filter(visibleSidecarAnchor)
    .length * 18;
  const candidate = candidates.find((item) => item.fits);

  if (candidate) {
    win.style.left = `${candidate.left}px`;
    win.style.top = `${clampNumber(candidate.top + openSidecarOffset, topMin, topMax)}px`;
    return;
  }

  if (sourceWindow.dataset.window === "assistant") {
    const assistant = sourceWindow;
    const assistantLeft = Math.max(workLeft, rect.left);
    const dictationLeft = leftMax;
    const availableAssistantWidth = dictationLeft - gap - assistantLeft;

    if (availableAssistantWidth >= minAssistantWidth) {
      storeAssistantFrameForSidecar(assistant);
      assistant.style.left = `${assistantLeft}px`;
      assistant.style.right = "auto";
      assistant.style.width = `${availableAssistantWidth}px`;
      assistant.style.transform = "none";

      win.style.left = `${dictationLeft}px`;
      win.style.top = `${clampNumber(rect.top + openSidecarOffset, topMin, topMax)}px`;
      return;
    }
  }

  win.style.left = `${leftMax}px`;
  win.style.top = `${clampNumber(topMin + openSidecarOffset, topMin, topMax)}px`;
}

function sourceWindowForAssistantContext(context) {
  if (!context) return null;
  if (["teachtext", "fileDisk"].includes(context.surface)) return "teachText";
  if (context.surface === "assistant") return null;
  const bySurface = {
    reader: "reader",
    scrapbook: "scrapbook",
    questionSheet: "questionSheet",
    outline: "outline",
    sectionDrafts: "sectionDrafts",
    documents: "chatFile",
    clipboard: "clipboard",
    styleSheet: "reviewDesk",
    claimCheck: "reviewDesk",
    docMap: "docMap",
    systemHelp: "systemHelp",
    notePad: "notePad",
  };
  return bySurface[context.surface] || null;
}

async function openAssistantAvoidingWindow(sourceName = "teachText") {
  await openWindow("assistant");
  const assistant = getWindow("assistant");
  const sourceWindow = sourceName ? getWindow(sourceName) : null;
  if (!assistant) return;
  if (writerMode) {
    setAssistantDesklet(true);
    return;
  }
  if (!sourceWindow || sourceWindow.classList.contains("is-hidden")) return;

  const margin = 16;
  const menuHeight = 25;
  const gap = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  const sourceRect = sourceWindow.getBoundingClientRect();
  const topMin = menuHeight + margin;
  const maxHeight = Math.max(240, viewportHeight - topMin - margin);
  const desiredHeight = mobile ? Math.min(760, maxHeight) : Math.min(540, maxHeight);
  const desiredWidth = Math.min(620, Math.max(360, Math.round(viewportWidth * 0.36)));
  const minWidth = Math.min(340, viewportWidth - margin * 2);

  assistant.classList.remove("is-collapsed", "is-desklet");
  assistant.style.right = "auto";
  assistant.style.transform = "none";
  assistant.style.maxHeight = `${desiredHeight}px`;
  assistant.style.height = `${desiredHeight}px`;

  function applyFrame(left, top, width, height = desiredHeight) {
    const clampedWidth = Math.max(minWidth, Math.min(width, viewportWidth - margin * 2));
    const clampedHeight = Math.max(240, Math.min(height, viewportHeight - topMin - margin));
    const leftMax = Math.max(margin, viewportWidth - clampedWidth - margin);
    const topMax = Math.max(topMin, viewportHeight - clampedHeight - margin);
    assistant.style.left = `${clampNumber(left, margin, leftMax)}px`;
    assistant.style.top = `${clampNumber(top, topMin, topMax)}px`;
    assistant.style.width = `${clampedWidth}px`;
    assistant.style.height = `${clampedHeight}px`;
    assistant.style.maxHeight = `${clampedHeight}px`;
  }

  const rightSpace = viewportWidth - sourceRect.right - gap - margin;
  const leftSpace = sourceRect.left - gap - margin;
  const belowSpace = viewportHeight - sourceRect.bottom - gap - margin;
  const aboveSpace = sourceRect.top - gap - topMin;

  if (!mobile && rightSpace >= minWidth) {
    applyFrame(sourceRect.right + gap, sourceRect.top, Math.min(desiredWidth, rightSpace), desiredHeight);
    return;
  }
  if (!mobile && leftSpace >= minWidth) {
    const width = Math.min(desiredWidth, leftSpace);
    applyFrame(sourceRect.left - gap - width, sourceRect.top, width, desiredHeight);
    return;
  }

  const stackedWidth = Math.min(
    Math.max(minWidth, sourceRect.width),
    viewportWidth - margin * 2
  );
  const stackedLeft = Math.min(sourceRect.left, viewportWidth - stackedWidth - margin);
  if (belowSpace >= 220) {
    applyFrame(stackedLeft, sourceRect.bottom + gap, stackedWidth, Math.min(desiredHeight, belowSpace));
    return;
  }
  if (aboveSpace >= 220) {
    const height = Math.min(desiredHeight, aboveSpace);
    applyFrame(stackedLeft, sourceRect.top - gap - height, stackedWidth, height);
    return;
  }

  const fallbackHeight = mobile ? Math.min(620, maxHeight) : Math.min(300, maxHeight);
  applyFrame(margin, viewportHeight - fallbackHeight - margin, viewportWidth - margin * 2, fallbackHeight);
}

async function arrangeDocMapAssistantSplit() {
  return arrangeWindowAssistantSplit("docMap", {
    onSplitApplied() {
      requestAnimationFrame(() => {
        renderDocMap();
        requestAnimationFrame(restoreDocMapCanvasView);
      });
    },
  });
}

async function arrangeClioStageAssistantSplit() {
  return arrangeWindowAssistantSplit("clioStage");
}

async function arrangeWindowAssistantSplit(sourceWindowName, options = {}) {
  const sourceWindow = getWindow(sourceWindowName);
  const assistant = getWindow("assistant");
  if (!sourceWindow || !assistant) return false;

  const sourceAppId = getWindowAppId(sourceWindow);
  const sourceAnchorId = {
    quickDraft: "quickDraft",
    teachText: "teachText",
    reader: "reader",
    scrapbook: "scrapbook",
    docMap: "docMap",
    clioStage: "clioStage",
  }[sourceWindowName] || sourceAppId;
  if (!isMultiFinderMode()) {
    const canOpenPair = await prepareFinderModeForApp(sourceAppId);
    if (!canOpenPair) return false;
    setSideAskAnchorApp(sourceAnchorId, sourceAppId);
  }

  await openWindow("assistant", { skipFinderMode: true, skipPlacement: true, skipFocus: true });
  const refreshedAssistant = getWindow("assistant") || assistant;
  if (!isMultiFinderMode() && typeof enterSideAskClioTalkSession === "function") {
    enterSideAskClioTalkSession(sourceAnchorId);
  } else if (!isMultiFinderMode() && sourceAnchorId === "quickDraft" && typeof enterQuickDraftClioTalkSession === "function") {
    enterQuickDraftClioTalkSession();
  }
  if (writerMode) {
    await openAssistantAvoidingWindow(sourceWindowName);
    return true;
  }

  // On a phone one app fills the screen, so there is no pair to lay out — and
  // the frames below are inline styles that would override the full-screen
  // shell. The ClioTalk session is already wired above; the user reaches it
  // from the switcher.
  if (isPortraitDocumentFlow()) {
    syncMobileAppForeground();
    return true;
  }

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const margin = 18;
  const gap = 14;
  const avoidance = getDesktopAvoidanceInsets({ margin });
  const left = avoidance.left;
  const top = margin;
  const isStacked = window.matchMedia("(orientation: portrait), (max-width: 860px)").matches;
  const totalWidth = Math.max(340, desktopRect.width - avoidance.left - avoidance.right - margin);
  const menuBarBottom = document.querySelector(".menu-bar")?.getBoundingClientRect().bottom || 0;
  const desktopTop = Math.max(desktopRect.top, menuBarBottom);
  const availableDesktopHeight = Math.min(desktopRect.height, Math.max(0, window.innerHeight - desktopTop));
  const height = Math.max(300, availableDesktopHeight - margin * 2);

  rememberWindowFrame(sourceWindow);
  rememberWindowFrame(refreshedAssistant);
  saveSideAskRestoreFrame(sourceWindow);
  saveSideAskRestoreFrame(refreshedAssistant);
  sourceWindow.classList.remove("is-collapsed", "is-desklet", "is-hidden");
  refreshedAssistant.classList.remove("is-collapsed", "is-desklet", "is-hidden");

  const applyFrame = (win, frame) => placeWindowForExplicitLayout(win, {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    maxHeight: frame.height,
  });

  if (isStacked) {
    sourceWindow.style.order = "2";
    refreshedAssistant.style.order = "3";
    const minStackPaneHeight = Math.min(220, Math.max(140, Math.floor((height - gap) / 2)));
    const sourceHeight = clampNumber(
      Math.round((height - gap) * 0.56),
      minStackPaneHeight,
      height - gap - minStackPaneHeight
    );
    const assistantHeight = height - gap - sourceHeight;
    applyFrame(sourceWindow, { left, top, width: totalWidth, height: sourceHeight });
    applyFrame(refreshedAssistant, {
      left,
      top: top + sourceHeight + gap,
      width: totalWidth,
      height: assistantHeight,
    });
  } else {
    sourceWindow.style.order = "";
    refreshedAssistant.style.order = "";
    const sourceWidth = Math.round((totalWidth - gap) * 0.6);
    const assistantWidth = Math.max(340, totalWidth - gap - sourceWidth);
    applyFrame(sourceWindow, { left, top, width: sourceWidth, height });
    applyFrame(refreshedAssistant, {
      left: left + sourceWidth + gap,
      top,
      width: assistantWidth,
      height,
    });
  }

  setWindowLayerZ(sourceWindow, nextWindowLayerZ());
  setWindowLayerZ(refreshedAssistant, nextWindowLayerZ());
  focusWindow(refreshedAssistant);

  if (typeof options.onSplitApplied === "function") {
    options.onSplitApplied(refreshedAssistant, sourceWindow);
  }
  return true;
}

function arrangeReaderAssistantSplit() {
  return arrangeWindowAssistantSplit("reader");
}

function arrangeScrapbookAssistantSplit() {
  return arrangeWindowAssistantSplit("scrapbook");
}
function quietStartup() {
  document.querySelectorAll(".window").forEach((win) => {
    if (win.dataset.window !== "assistant") {
      win.classList.add("is-hidden");
    }
  });
  modalScrim.classList.add("is-hidden");
}

function showAboutMultiFinder() {
  showSystemModal(t("about_multifinder_body"), "alert");
}

async function restartSystem() {
  try {
    await saveDeskState();
    await clearWorkingSession();
  } catch (error) {
    console.warn("Restart save failed", error);
  }
  closeMenus();
  document.body.classList.add("is-shutting-down");
  setStatus(t("restart_starting"));
  playSystemSound("save");
  window.setTimeout(() => window.location.reload(), 220);
}

async function shutDownSystem() {
  try {
    await saveDeskState();
    await clearWorkingSession();
  } catch (error) {
    console.warn("Shutdown save failed", error);
  }
  closeMenus();
  document.body.classList.add("is-shutting-down");
  document.querySelectorAll(".window").forEach((win) => win.classList.add("is-hidden"));
  document.querySelector("#shutdown-screen")?.classList.remove("is-hidden");
  modalScrim.classList.add("is-hidden");
  setStatus(t("shutdown_message"));
  playSystemSound("close");
  renderMultiFinderMenu();
}

function setAssistantDesklet(enabled) {
  const assistant = getWindow("assistant");
  if (!assistant) return;

  assistant.classList.toggle("is-desklet", enabled);
  if (enabled) {
    assistant.dataset.app = "clioTalk";
    ensureRunningApp(assistant.dataset.app, "assistant");
    hiddenAppIds.delete(assistant.dataset.app);
    assistant.classList.remove("is-hidden", "is-app-hidden", "is-collapsed");
    assistant.style.left = "auto";
    assistant.style.right = "0";
    assistant.style.top = "0";
    assistant.style.width = "420px";
    assistant.style.height = "100%";
    assistant.style.maxHeight = "";
    assistant.style.transform = "none";
  } else {
    assistant.classList.remove("is-collapsed");
    assistant.style.right = "auto";
    assistant.style.left = "34px";
    assistant.style.top = "34px";
    assistant.style.transform = "none";
  }
}

async function closeWindow(name, force = false) {
  const win = getWindow(name);
  if (!win) return;

  if (name === "assistant" && clioTalkTemporaryMode) {
    if (activeAbortController && !force) {
      setStatus(t("task_already_running", localModelState.task || t("working_locally")));
      return;
    }
    if (!force && !await confirmDiscardTemporaryClioTalkConversation()) return;
    discardTemporaryClioTalkConversation();
  }

  if (name === "teachText" && !force && shouldPromptForTeachTextFileSave()) {
    const result = await showSystemModal(teachTextUnsavedChangesMessage(), "save");
    if (result === "cancel") return;
    if (result === "yes") {
      const saved = await saveTextDocument();
      if (!saved) return;
    } else {
      setTeachTextStatus("saved"); // clear dirty state after discard
    }
  }

  win.classList.add("is-hidden");
  if (name === "memoryCards") {
    pauseMemoryCardsGame();
  }
  delete win.dataset.appHiddenCollapsed;
  playSystemSound("close");
  if (name === "guide") {
    guideSeen = true;
    saveDeskState();
  }
  if (name === "findPath") {
    document.body.classList.remove("has-find-path-open");
  }
  if (name === "contextPanel") {
    document.body.classList.remove("has-context-panel-open");
  }
  if (name === "documents") {
    clioTalkAttachmentPickerActive = false;
  }
  if (name === "quickDraft" && sideAskEnabled && sideAskAnchorAppId === "quickDraft") {
    const assistantWindow = getWindow("assistant");
    if (!closingQuickDraftAssistantPair && assistantWindow && !assistantWindow.classList.contains("is-hidden") && !assistantWindow.classList.contains("is-app-hidden")) {
      closingQuickDraftAssistantPair = true;
      await closeWindow("assistant", true);
      closingQuickDraftAssistantPair = false;
    }
    clearSideAskMode();
    resetAssistantForStandalonePlacement(assistantWindow);
  }
  if (name !== "assistant" && name !== "quickDraft" && sideAskEnabled && getWindowAppId(win) === sideAskAnchorAppId) {
    clearSideAskMode();
    resetAssistantForStandalonePlacement(getWindow("assistant"));
  }
  updateQuickDraftFocusChrome();
  if (assistantSidecarWindowNames.has(name)) {
    restoreAssistantAfterSidecar();
  }
  if (getWindowAppId(win) === "accessories" && !writerMode) {
    if (!isDeskAccessorySidecar(win)) arrangeDeskAccessories();
    raiseVisibleDeskAccessorySidecars();
  }
  if (name === "assistant") {
    if (!closingQuickDraftAssistantPair && sideAskEnabled && sideAskAnchorAppId === "quickDraft") {
      const quickDraftWindow = getWindow("quickDraft");
      if (quickDraftWindow && !quickDraftWindow.classList.contains("is-hidden") && !quickDraftWindow.classList.contains("is-app-hidden")) {
        closingQuickDraftAssistantPair = true;
        await closeWindow("quickDraft", true);
        closingQuickDraftAssistantPair = false;
      }
    }
    if (writerMode && sideAskEnabled) {
      writerMode = false;
      document.body.classList.remove("is-writer-mode");
      setAssistantDesklet(false);
      applyLanguage();
      saveDeskState();
    }
    clearSideAskMode();
  }
  updateMenuState();

  if (name === "about") {
    modalScrim.classList.add("is-hidden");
  }
  forgetWindowFromRunningApps(name);
  let restoredSource = null;
  const returnWindowName = !isMultiFinderMode() ? (win.dataset.returnWindowName || "") : "";
  if (returnWindowName) {
    const returnWindow = getWindow(returnWindowName);
    if (
      returnWindow
      && returnWindow !== win
      && !returnWindow.classList.contains("is-hidden")
      && !returnWindow.classList.contains("is-app-hidden")
    ) {
      restoredSource = returnWindow;
    } else if (returnWindow && returnWindow !== win) {
      returnWindow.classList.remove("is-hidden", "is-app-hidden");
      delete returnWindow.dataset.appHiddenCollapsed;
      ensureRunningApp(getWindowAppId(returnWindow), returnWindow.dataset.window);
      restoredSource = returnWindow;
    }
  }
  delete win.dataset.returnWindowName;
  if (restoredSource) {
    focusWindow(restoredSource, true);
    activeAppId = getWindowAppId(restoredSource);
  } else {
    const next = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)")
      || Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
        .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
    activeAppId = next ? getWindowAppId(next) : "finder";
  }
  syncMobileAppForeground();
  renderMultiFinderMenu();
  scheduleWorkingSessionSave?.();
}

function toggleCollapsed(win) {
  win.classList.toggle("is-collapsed");
  scheduleWorkingSessionSave?.();
}

function isResizableWindow(win) {
  if (!win || !resizableWindowNames.has(win.dataset.window)) return false;
  const appId = getWindowAppId(win);
  return !(writerMode && sideAskEnabled && isSideAskPairApp(appId));
}

function isAspectLockedWindow(win) {
  return win?.dataset.window === "clioStage";
}

function aspectRatioForWindow(win) {
  if (win?.dataset.window === "clioStage") return 16 / 9;
  return 0;
}

function lockedAspectSize(win, width, height, constraints = {}) {
  const aspect = aspectRatioForWindow(win);
  if (!aspect) {
    return { width, height };
  }
  const minWidth = constraints.minWidth || 300;
  const minHeight = constraints.minHeight || 160;
  const maxWidth = Math.max(minWidth, constraints.maxWidth || width);
  const maxHeight = Math.max(minHeight, constraints.maxHeight || height);
  let nextWidth = Math.min(maxWidth, Math.max(minWidth, width));
  let nextHeight = Math.min(maxHeight, Math.max(minHeight, height));
  if (nextWidth / aspect <= nextHeight) {
    nextHeight = nextWidth / aspect;
  } else {
    nextWidth = nextHeight * aspect;
  }
  if (nextWidth < minWidth) {
    nextWidth = minWidth;
    nextHeight = nextWidth / aspect;
  }
  if (nextHeight < minHeight) {
    nextHeight = minHeight;
    nextWidth = nextHeight * aspect;
  }
  if (nextWidth > maxWidth) {
    nextWidth = maxWidth;
    nextHeight = nextWidth / aspect;
  }
  if (nextHeight > maxHeight) {
    nextHeight = maxHeight;
    nextWidth = nextHeight * aspect;
  }
  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
  };
}

function rememberWindowFrame(win) {
  const rect = win.getBoundingClientRect();
  win.dataset.restoreLeft = win.style.left || `${rect.left}px`;
  win.dataset.restoreTop = win.style.top || `${rect.top}px`;
  win.dataset.restoreWidth = win.style.width || `${rect.width}px`;
  win.dataset.restoreHeight = win.style.height || `${rect.height}px`;
}

function getDesktopAvoidanceInsets({ margin = 18, spineGap = 18, iconGap = 34 } = {}) {
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const spine = document.querySelector(".writing-spine-panel") || document.querySelector(".spine-flow-toolbox");
  const spineRect = spine?.getBoundingClientRect();
  const iconColumn = document.querySelector(".icon-column");
  const iconRect = iconColumn?.getBoundingClientRect();
  const spineVisible = spine
    && !spine.classList.contains("is-hidden")
    && spineRect
    && spineRect.width > 0
    && getComputedStyle(spine).position !== "static";
  const iconsVisible = iconColumn
    && iconRect
    && iconRect.width > 0
    && getComputedStyle(iconColumn).display !== "none"
    && getComputedStyle(iconColumn).position !== "static";

  return {
    left: spineVisible
      ? Math.max(margin, Math.ceil(spineRect.right - (desktopRect?.left || 0) + spineGap))
      : margin,
    right: iconsVisible ? Math.ceil(iconRect.width + iconGap) : 0,
  };
}

function zoomWindow(win) {
  if(matchMedia("(max-width:860px) and (orientation:portrait)").matches){
    win.classList.remove("is-collapsed");
    // For an app that can take the full-screen shell, the zoom box is the
    // maximize/restore control: it toggles between filling the screen and
    // floating alongside the other windows.
    if (mobileFullScreenAppIds.has(getWindowAppId(win))) {
      win.dataset.mobileRestored = win.dataset.mobileRestored === "true" ? "false" : "true";
      syncMobileAppForeground();
      focusWindow(win, 1);
      return;
    }
    win.dataset.zoomed=win.dataset.zoomed!="true";
    focusWindow(win,1);
    if(win.dataset.window==="docMap")requestAnimationFrame(restoreDocMapCanvasView);
    return;
  }
  if (!isResizableWindow(win) || matchMedia("(max-width:860px)").matches) {
    toggleCollapsed(win);
    return;
  }

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const margin = 18;
  const avoidance = getDesktopAvoidanceInsets({ margin });

  if (win.dataset.zoomed === "true") {
    win.style.left = win.dataset.restoreLeft || win.style.left;
    win.style.top = win.dataset.restoreTop || win.style.top;
    win.style.width = win.dataset.restoreWidth || win.style.width;
    win.style.height = win.dataset.restoreHeight || win.style.height;
    if (isAspectLockedWindow(win)) {
      const rect = win.getBoundingClientRect();
      const desktopRect = document.querySelector(".desktop")?.getBoundingClientRect();
      const minWidth = Number.parseInt(getComputedStyle(win).minWidth, 10) || 300;
      const size = lockedAspectSize(win, rect.width, rect.height, {
        minWidth,
        minHeight: 160,
        maxWidth: Math.max(minWidth, (desktopRect?.right || window.innerWidth) - rect.left - 18),
        maxHeight: Math.max(160, (desktopRect?.bottom || window.innerHeight) - rect.top - 18),
      });
      win.style.width = `${size.width}px`;
      win.style.height = `${size.height}px`;
    }
    win.style.right = "auto";
    win.style.transform = "none";
    win.dataset.zoomed = "false";
    if(win.dataset.window==="docMap")requestAnimationFrame(restoreDocMapCanvasView);
    scheduleWorkingSessionSave?.();
    return;
  }

  rememberWindowFrame(win);
  win.classList.remove("is-collapsed", "is-desklet");
  win.style.left = `${avoidance.left}px`;
  win.style.top = `${margin}px`;
  const maxWidth = Math.max(320, desktopRect.width - avoidance.left - avoidance.right - margin);
  const maxHeight = Math.max(260, desktopRect.height - margin * 2);
  const zoomSize = lockedAspectSize(win, maxWidth, maxHeight, {
    minWidth: 320,
    minHeight: 180,
    maxWidth,
    maxHeight,
  });
  win.style.width = `${zoomSize.width}px`;
  win.style.height = `${zoomSize.height}px`;
  win.style.right = "auto";
  win.style.transform = "none";
  win.dataset.zoomed = "true";
  if(win.dataset.window==="docMap")requestAnimationFrame(restoreDocMapCanvasView);
  scheduleWorkingSessionSave?.();
}

function maximizeWindow(win, options = {}) {
  if (!isResizableWindow(win)) return;
  if(matchMedia("(max-width:860px) and (orientation:portrait)").matches){
    win.classList.remove("is-collapsed");
    win.dataset.zoomed="true";
    focusWindow(win,1);
    scheduleWorkingSessionSave?.();
    return;
  }
  if (window.matchMedia("(max-width: 860px)").matches) return;

  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const margin = 18;
  const avoidance = getDesktopAvoidanceInsets({ margin });
  const top = parsePositiveInteger(options.top) || margin;

  if (win.dataset.zoomed !== "true") rememberWindowFrame(win);
  win.classList.remove("is-collapsed", "is-desklet");
  win.style.left = `${avoidance.left}px`;
  win.style.top = `${top}px`;
  const maxWidth = Math.max(320, desktopRect.width - avoidance.left - avoidance.right - margin);
  const maxHeight = Math.max(260, desktopRect.height - top - margin);
  const maxSize = lockedAspectSize(win, maxWidth, maxHeight, {
    minWidth: 320,
    minHeight: 180,
    maxWidth,
    maxHeight,
  });
  win.style.width = `${maxSize.width}px`;
  win.style.height = `${maxSize.height}px`;
  win.style.right = "auto";
  win.style.transform = "none";
  win.dataset.zoomed = "true";
  scheduleWorkingSessionSave?.();
}

function positionWindowOutline(outline, left, top) {
  outline.style.setProperty("--outline-left", `${Math.round(left)}px`);
  outline.style.setProperty("--outline-top", `${Math.round(top)}px`);
}

function sizeWindowOutline(outline, width, height) {
  outline.style.setProperty("--outline-width", `${Math.round(width)}px`);
  outline.style.setProperty("--outline-height", `${Math.round(height)}px`);
}

// `win` turns the ghost into a frame preview: System 6's grow image shows the
// title bar seam and the scroll bar lanes, so the corner cell being dragged is
// part of the ghost. Moving a window shows the plain outline instead.
function createWindowOutline(rect, win = null) {
  const outline = document.createElement("div");
  outline.className = win ? "window-outline is-frame" : "window-outline";
  if (win) {
    const titleBar = win.querySelector(":scope > .title-bar");
    outline.style.setProperty("--outline-titlebar", `${Math.round(titleBar?.offsetHeight || 0)}px`);
    // Only a framed content area has lanes to preview.
    if (!win.querySelector(".window-frame-scroller")) {
      outline.style.setProperty("--outline-lane", "0px");
    }
  }
  positionWindowOutline(outline, rect.left, rect.top);
  sizeWindowOutline(outline, rect.width, rect.height);
  document.body.append(outline);
  return outline;
}

function startWindowResize(event, win) {
  const portraitFlow = isPortraitDocumentFlow() && !writerMode && getWindowAppId(win) !== "accessories";
  if (!isResizableWindow(win) || (!portraitFlow && window.matchMedia("(max-width: 860px)").matches)) return;

  event.preventDefault();
  event.stopPropagation();
  focusWindow(win);
  // The grow box and the zoom box are one control pair: dragging out of the
  // full-screen shell restores the window down first, so the drag sizes a real
  // floating window instead of fighting the maximized frame.
  if (win.classList.contains("is-mobile-fullscreen")) {
    win.dataset.mobileRestored = "true";
    syncMobileAppForeground();
  }
  if (win.classList.contains("is-desklet") && win.dataset.window === "assistant" && !writerMode) {
    const rect = win.getBoundingClientRect();
    win.classList.remove("is-desklet");
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    win.style.right = "auto";
    win.style.width = `${rect.width}px`;
    win.style.height = `${rect.height}px`;
    win.style.transform = "none";
  }
  win.style.maxHeight = "";
  rememberWindowFrame(win);
  win.dataset.zoomed = "false";

  const handle = event.currentTarget;
  const rect = win.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startWidth = rect.width;
  const startHeight = rect.height;
  const minWidth = Number.parseInt(getComputedStyle(win).minWidth, 10) || 300;
  const minHeight = 160;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop.getBoundingClientRect();
  const maxWidth = portraitFlow
    ? Math.max(minWidth, Math.min(desktopRect.width - 36, window.innerWidth - 36))
    : Math.max(minWidth, desktopRect.right - rect.left - 18);
  const maxHeight = portraitFlow
    ? Math.max(minHeight, window.innerHeight - 80)
    : Math.max(minHeight, desktopRect.bottom - rect.top - 18);

  if (event.pointerId != null && handle.setPointerCapture) {
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {}
  }

  // Classic draws the prospective frame as a dotted outline and only reflows the
  // window on release — the same dotted primitive the selection marquee uses.
  // Liquid Glass sizes live, where a wait-for-release frame reads as a stall.
  // Portrait flow sizes a document-flowed window, not a free-floating frame, so
  // an outline anchored to the old top-left would promise the wrong box.
  const outline = portraitFlow || document.body.classList.contains("use-liquid-glass")
    ? null
    : createWindowOutline(rect, win);
  let pendingWidth = startWidth;
  let pendingHeight = startHeight;

  function applyWindowSize(width, height) {
    if (portraitFlow) {
      win.style.setProperty("--portrait-window-width", `${Math.round(width)}px`);
      win.style.setProperty("--portrait-window-height", `${Math.round(height)}px`);
    } else {
      win.style.width = `${width}px`;
      win.style.height = `${height}px`;
    }
  }

  function resizeWindow(moveEvent) {
    let width = Math.min(maxWidth, Math.max(minWidth, startWidth + moveEvent.clientX - startX));
    let height = Math.min(maxHeight, Math.max(minHeight, startHeight + moveEvent.clientY - startY));
    if (isAspectLockedWindow(win)) {
      const size = lockedAspectSize(win, width, height, { minWidth, minHeight, maxWidth, maxHeight });
      width = size.width;
      height = size.height;
    }
    pendingWidth = width;
    pendingHeight = height;
    if (outline) {
      sizeWindowOutline(outline, width, height);
      return;
    }
    applyWindowSize(width, height);
  }

  function stopResize(stopEvent) {
    window.removeEventListener("pointermove", resizeWindow);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", stopResize);
    window.removeEventListener("mousemove", resizeWindow);
    window.removeEventListener("mouseup", stopResize);
    // A drag that emitted no move event still has to land where it was released.
    if ((stopEvent?.type === "pointerup" || stopEvent?.type === "mouseup")
      && typeof stopEvent.clientX === "number") {
      resizeWindow(stopEvent);
    }
    if (outline) {
      outline.remove();
      applyWindowSize(pendingWidth, pendingHeight);
    }
    markWindowUserPositioned(win);
    if(win.dataset.window==="docMap")requestAnimationFrame(restoreDocMapCanvasView);
    scheduleWorkingSessionSave?.();
  }

  window.addEventListener("pointermove", resizeWindow);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
  window.addEventListener("mousemove", resizeWindow);
  window.addEventListener("mouseup", stopResize);
}

function installGrowBoxes() {
  document.querySelectorAll(".window").forEach((win) => {
    if (!isResizableWindow(win) || win.querySelector(".grow-box")) return;

    const growBox = document.createElement("button");
    growBox.className = "grow-box";
    growBox.type = "button";
    growBox.setAttribute("aria-label", "Resize window");
    growBox.addEventListener("pointerdown", (event) => startWindowResize(event, win));
    growBox.addEventListener("mousedown", (event) => startWindowResize(event, win));
    win.append(growBox);
  });
}

function tileWindows(candidateWindows = null) {
  const openWindows = Array.isArray(candidateWindows)
    ? candidateWindows.filter(visibleWindowOrNull)
    : getTileCandidateWindows();

  if (openWindows.length === 0) return;

  const desktop = document.querySelector(".desktop");
  const iconColumn = document.querySelector(".icon-column");
  const padding = 18;
  const topPadding = 28;
  const bottomPadding = 18;
  const iconRect = iconColumn?.getBoundingClientRect();
  const avoidance = getDesktopAvoidanceInsets({ margin: padding, iconGap: 48 });
  const iconGutter = iconRect && iconRect.width > 0 ? iconRect.width + 48 : 0;
  const desktopWidth = desktop.clientWidth - avoidance.left - iconGutter - padding;
  const desktopHeight = desktop.clientHeight;
  const tileableWindows = openWindows.filter((win) => tileableWindowNames.has(win.dataset.window));
  const fixedWindows = openWindows.filter((win) => !tileableWindowNames.has(win.dataset.window));
  const fixedGap = fixedWindows.length ? 20 : 0;
  const minTileAreaWidth = 520;

  const fixedColumnWidth = fixedWindows.reduce((max, win) => {
    win.style.width = "";
    win.style.height = "";
    const rect = win.getBoundingClientRect();
    return Math.max(max, rect.width || 0);
  }, 0);
  const useFixedColumn = fixedWindows.length > 0
    && desktopWidth - fixedColumnWidth - fixedGap - padding >= minTileAreaWidth;

  if (!tileableWindows.length) return;

  const tileAreaWidth = useFixedColumn
    ? desktopWidth - fixedColumnWidth - fixedGap - padding
    : desktopWidth - padding;
  const count = tileableWindows.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const winWidth = Math.floor((tileAreaWidth - (padding * (cols - 1))) / cols);
  const winHeight = Math.floor((desktopHeight - topPadding - bottomPadding - (padding * (rows - 1))) / rows);

  tileableWindows.forEach((win, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    win.style.left = `${avoidance.left + col * (winWidth + padding)}px`;
    win.style.top = `${topPadding + row * (winHeight + padding)}px`;
    win.style.width = `${winWidth}px`;
    win.style.height = `${winHeight}px`;
    win.style.right = "auto";
    win.style.transform = "none";
    win.classList.remove("is-collapsed");
    markWindowUserPositioned(win);

    // Special handling for assistant desklet mode
    if (win.dataset.window === "assistant") {
      win.classList.remove("is-desklet");
    }
  });

  if (useFixedColumn) {
    arrangeFixedWindows(fixedWindows, {
      left: Math.max(avoidance.left, avoidance.left + desktopWidth - fixedColumnWidth),
      top: topPadding,
      bottom: desktopHeight - bottomPadding,
      gap: 24,
    });
  } else {
    arrangeFixedWindows(fixedWindows, {
      left: avoidance.left,
      top: topPadding + rows * (winHeight + padding),
      bottom: Number.POSITIVE_INFINITY,
      gap: 24,
    });
  }
  scheduleWorkingSessionSave?.();
}

function arrangeFixedWindows(windows, bounds) {
  let top = bounds.top;

  windows.forEach((win) => {
    win.classList.remove("is-collapsed");
    win.style.width = "";
    win.style.height = "";
    win.style.right = "auto";
    win.style.transform = "none";

    const rect = win.getBoundingClientRect();
    const height = rect.height || 0;

    if (top + height > bounds.bottom) {
      top = bounds.top;
    }

    win.style.left = `${Math.max(18, bounds.left)}px`;
    win.style.top = `${top}px`;
    markWindowUserPositioned(win);
    top += height + bounds.gap;
  });
}

function hideSidebars() {
  [
    "chooser",
    "control",
    "rag",
    "textDisk",
    "disk",
    "helpFolder",
    "applications",
    "projects",
    "finder",
    "documents",
    "chatFile",
    "scrapbook",
    "trash",
    "writingBell",
    "notePad",
    "clipboard",
    "alarmClock",
    "calculator",
    "puzzle",
    "memoryCards",
    "keyCaps",
    "systemStatus",
    "notificationCenter",
    "modelMeter",
    "contextPanel",
    "findPath",
    "findFile",
    "reader",
    "endfieldTerminal",
    "docMap",
    "cmfStudio",
    "soundscape",
    "dictionary",
    "imageManager",
    "guide",
  ].forEach((name) => closeWindow(name, true));
  openWindow("assistant");
  if (!getWindow("teachText").classList.contains("is-hidden")) {
    focusWindow(getWindow("teachText"));
  }
}
