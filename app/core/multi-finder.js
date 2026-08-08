// MultiFinder app state and menu.
//
// Loaded before window-manager.js; functions are called after all
// classic-script modules and app.js have initialized.

var activeAppId = "finder";
var menuOwnerAppId = "finder";
const runningApps = new Map();
const hiddenAppIds = new Set();
const nonQuittableAppIds = new Set(["finder", "system"]);
const finderModeForegroundAppIds = new Set(["finder", "system", "accessories"]);

const multiFinderAppLabels = {
  finder: "Finder",
  writingStudio: "Writing Studio",
  teachText: "TeachText",
  clioTalk: "ClioTalk",
  searcher: "Searcher",
  reader: "Reader",
  timeMachine: "Time Machine",
  endfield: "Endfield Terminal",
  docMap: "DocMap",
  clioStage: "ClioStage",
  clioChart: "ClioChart",
  liquidCover: "Cover Glass",
  cmfStudio: "CMF Studio",
  soundscape: "Soundscape",
  scrapbook: "Scrapbook",
  bureaucracyMeme: "Bureaucracy Meme",
  accessories: "Accessories",
  system: "System",
};

const windowAppMap = {
  assistant: "clioTalk",
  quickDraft: "writingStudio",
  bureaucracyMeme: "bureaucracyMeme",
  chooser: "accessories",
  control: "accessories",
  rag: "finder",
  textDisk: "finder",
  finder: "finder",
  helpFolder: "finder",
  applications: "finder",
  disk: "finder",
  projectCd: "finder",
  pageSetup: "finder",
  importUtility: "finder",
  projects: "finder",
  documents: "finder",
  chatFile: "teachText",
  teachText: "teachText",
  styleSheet: "teachText",
  reviewDesk: "teachText",
  saveChat: "clioTalk",
  scrapbook: "scrapbook",
  trash: "finder",
  printDirectory: "finder",
  reader: "reader",
  timeMachine: "timeMachine",
  endfieldTerminal: "endfield",
  questionSheet: "teachText",
  outline: "teachText",
  sectionDrafts: "teachText",
  claimCheck: "teachText",
  findPath: "searcher",
  findFile: "accessories",
  contextPanel: "clioTalk",
  guide: "system",
  rebuildFlow: "teachText",
  docMap: "docMap",
  clioStage: "clioStage",
  clioChart: "clioChart",
  liquidCover: "liquidCover",
  cmfStudio: "cmfStudio",
  soundscape: "soundscape",
  dictionary: "accessories",
  imageManager: "teachText",
  systemHelp: "system",
  dictation: "accessories",
  translationPad: "accessories",
  writingBell: "accessories",
  notePad: "accessories",
  clipboard: "accessories",
  alarmClock: "accessories",
  calculator: "accessories",
  puzzle: "accessories",
  memoryCards: "accessories",
  modelMeter: "accessories",
  keyCaps: "accessories",
  systemStatus: "accessories",
  notificationCenter: "accessories",
  fileInfo: "finder",
  projectInfo: "finder",
  about: "system",
};

function resolvedWindowAppId(name) {
  if (
    workspaceProfile === workspaceProfileWriting
    && (
      writingStudioOwnedWindowNames.has(name)
      || (
        name === "teachText"
        && typeof isTeachTextManuscriptRole === "function"
        && isTeachTextManuscriptRole()
      )
    )
  ) {
    return "writingStudio";
  }
  return windowAppMap[name] || "finder";
}

function getWindowAppId(winOrName) {
  const win = typeof winOrName === "string" ? getWindow(winOrName) : winOrName;
  const name = typeof winOrName === "string" ? winOrName : win?.dataset.window;
  const resolved = resolvedWindowAppId(name);
  if (resolved === "writingStudio" || win?.dataset.app === "writingStudio") return resolved;
  return win?.dataset.app || resolved;
}

function syncWorkspaceAppOwnership() {
  document.querySelectorAll(".window").forEach((win) => {
    const name = win.dataset.window || "";
    const nextAppId = resolvedWindowAppId(name);
    if (win.dataset.app === nextAppId) return;
    forgetWindowFromRunningApps(name);
    win.dataset.app = nextAppId;
    if (!win.classList.contains("is-hidden")) ensureRunningApp(nextAppId, name);
  });
}

function isMultiFinderMode() {
  return runtimeEnvironment !== "finder";
}

async function setFinderEnvironment(mode, { persistStartup = true, announce = true } = {}) {
  const nextEnvironment = mode === "multifinder" ? "multifinder" : "finder";
  if (runtimeEnvironment === nextEnvironment && (!persistStartup || startupEnvironment === nextEnvironment)) return true;
  const previous = { runtimeEnvironment, startupEnvironment, startupOpenMode };
  runtimeEnvironment = nextEnvironment;
  if (persistStartup) {
    startupEnvironment = nextEnvironment;
    startupOpenMode = normalizeStartupOpenMode(startupOpenMode, startupEnvironment);
    syncStartupOpenOptions(startupEnvironment);
  }
  if (nextEnvironment === "multifinder" && previous.runtimeEnvironment !== nextEnvironment) {
    multiFinderSwitcherHintSeen = false;
  }
  renderMultiFinderMenu();
  if (typeof updateQuickDraftFocusChrome === "function") updateQuickDraftFocusChrome();
  if (typeof updateMenuState === "function") updateMenuState();
  if (typeof renderProjectSwitcher === "function") renderProjectSwitcher();
  const saved = await saveDeskState();
  if (!saved) {
    runtimeEnvironment = previous.runtimeEnvironment;
    startupEnvironment = previous.startupEnvironment;
    startupOpenMode = previous.startupOpenMode;
    renderMultiFinderMenu();
    if (typeof updateQuickDraftFocusChrome === "function") updateQuickDraftFocusChrome();
    if (typeof updateMenuState === "function") updateMenuState();
    return false;
  }
  if (announce && typeof setStatus === "function") {
    setStatus(t(nextEnvironment === "multifinder" ? "finder_environment_multifinder_set" : "finder_environment_finder_set"));
  }
  return true;
}

function isFinderModeSingleTaskApp(appId) {
  return !!appId && !finderModeForegroundAppIds.has(appId);
}

function isSideAskPairApp(appId) {
  return appId === "clioTalk" || appId === sideAskAnchorOwnerAppId;
}

function canUseSideAsk() {
  return !isMultiFinderMode();
}

function ensureRunningApp(appId, windowName = "") {
  if (!appId) return null;
  const existing = runningApps.get(appId) || {
    id: appId,
    label: multiFinderAppLabels[appId] || appId,
    windows: new Set(),
    lastWindowName: "",
  };
  if (windowName) {
    existing.windows.add(windowName);
    existing.lastWindowName = windowName;
  }
  runningApps.set(appId, existing);
  return existing;
}

function forgetWindowFromRunningApps(windowName) {
  runningApps.forEach((app) => {
    app.windows.delete(windowName);
  });
}

function visibleWindowsForApp(appId) {
  return Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
    .filter((win) => getWindowAppId(win) === appId);
}

function foregroundVisibleWindows() {
  return Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
    .filter((win) => !hiddenAppIds.has(getWindowAppId(win)));
}

function windowsForApp(appId) {
  return Array.from(document.querySelectorAll(".window"))
    .filter((win) => getWindowAppId(win) === appId);
}

function getRunningApps() {
  ensureRunningApp("finder");
  return Array.from(runningApps.values())
    .filter((app) => app.id !== "accessories" && app.id !== "system")
    .map((app) => ({
      ...app,
      windowCount: app.windows.size,
      hidden: hiddenAppIds.has(app.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function activeAppLabel() {
  return multiFinderAppLabels[activeAppId] || activeAppId || "Finder";
}

function renderMultiFinderMenu() {
  if (activeAppId !== "accessories" && activeAppId !== "system") menuOwnerAppId = activeAppId;
  if (typeof renderAppMenuBar === "function") renderAppMenuBar(menuOwnerAppId);
  // MultiFinder-only, on every screen size. A phone presents apps full-screen
  // in both modes — that is a screen-size consequence, not a task model — so it
  // must not conjure a switcher in Finder mode, where one app runs at a time and
  // the close box is the way back to the desktop.
  const showSwitcher = isMultiFinderMode();
  document.querySelector(".multifinder-menu")?.classList.toggle("is-hidden", !showSwitcher);
  syncWorkspaceDesktopIcon();
  if (!showSwitcher) return;

  const labelEl = document.querySelector("#multifinder-label");
  const popover = document.querySelector("#multifinder-popover");
  if (!labelEl || !popover) return;

  labelEl.textContent = activeAppLabel();
  popover.replaceChildren();

  const apps = getRunningApps();
  if (!apps.length) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.disabled = true;
    empty.className = "multifinder-empty";
    empty.textContent = typeof t === "function" ? t("no_running_apps") : "No running applications";
    popover.append(empty);
    return;
  }

  apps.forEach((app) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.switchApp = app.id;
    button.className = `multifinder-app${app.id === activeAppId ? " is-current" : ""}${app.hidden ? " is-app-hidden" : ""}`;
    button.innerHTML = `
      <span class="multifinder-mark">${app.id === activeAppId ? "✓" : ""}</span>
      <span>${escapeHtml(app.label)}</span>
      <small>${app.windowCount}</small>
    `;
    popover.append(button);
  });

  popover.append(document.createElement("hr"));

  [
    ["hide-active-app", t("hide_app", activeAppLabel()), !hiddenAppIds.has(activeAppId) && !nonQuittableAppIds.has(activeAppId)],
    ["hide-other-apps", t("hide_others"), true],
    ["show-all-apps", t("show_all"), hiddenAppIds.size > 0],
    ["bring-app-front", t("bring_all_to_front"), true],
    ["quit-active-app", t("quit_app", activeAppLabel()), !nonQuittableAppIds.has(activeAppId)],
  ].forEach(([action, label, enabled]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.classList.toggle("is-disabled", !enabled);
    popover.append(button);
  });
}

function switchToApp(appId) {
  if (!isMultiFinderMode()) return;
  ensureRunningApp(appId);
  hiddenAppIds.delete(appId);
  const allWindows = windowsForApp(appId);
  allWindows.forEach((win) => {
    win.classList.remove("is-app-hidden");
    delete win.dataset.appHiddenCollapsed;
  });
  const windows = visibleWindowsForApp(appId);

  windows
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .forEach((win) => {
      setWindowLayerZ(win, nextWindowLayerZ());
      win.classList.remove("is-collapsed");
    });

  activeAppId = appId;
  if (windows.length) focusWindow(windows[windows.length - 1], 1);
  renderMultiFinderMenu();
}

function unhideApp(appId, { expand = true } = {}) {
  hiddenAppIds.delete(appId);
  windowsForApp(appId).forEach((win) => {
    win.classList.remove("is-app-hidden");
    if (expand || win.dataset.appHiddenCollapsed === "true") {
      win.classList.remove("is-collapsed");
    }
    delete win.dataset.appHiddenCollapsed;
  });
}

function hideApp(appId = activeAppId, { preserveActive = false } = {}) {
  if (nonQuittableAppIds.has(appId)) return;
  const windows = visibleWindowsForApp(appId);
  if (!windows.length) return;
  hiddenAppIds.add(appId);
  windows.forEach((win) => {
    win.classList.add("is-collapsed");
    win.dataset.appHiddenCollapsed = "true";
    win.classList.remove("is-active");
  });
  if (!preserveActive) {
    const next = foregroundVisibleWindows()
      .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
    activeAppId = next ? getWindowAppId(next) : "finder";
    if (next) focusWindow(next);
  }
  renderMultiFinderMenu();
}

function hideOtherApps() {
  const keepAppId = activeAppId;
  getRunningApps().forEach((app) => {
    if (app.id !== keepAppId && !nonQuittableAppIds.has(app.id)) hideApp(app.id, { preserveActive: true });
  });
  activeAppId = keepAppId;
  renderMultiFinderMenu();
}

function showAllApps() {
  Array.from(hiddenAppIds).forEach((appId) => unhideApp(appId));
  renderMultiFinderMenu();
}

function bringAppToFront(appId = activeAppId) {
  const windows = visibleWindowsForApp(appId);
  windows
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .forEach((win) => {
      setWindowLayerZ(win, nextWindowLayerZ());
    });
  if (windows.length) focusWindow(windows[windows.length - 1], 1);
}
