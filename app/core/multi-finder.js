// MultiFinder app state and menu.
//
// Loaded before window-manager.js; functions are called after all
// classic-script modules and app.js have initialized.

var activeAppId = "finder";
const runningApps = new Map();
const hiddenAppIds = new Set();
const nonQuittableAppIds = new Set(["finder", "system"]);
const finderModeForegroundAppIds = new Set(["finder", "system", "accessories"]);

const multiFinderAppLabels = {
  finder: "Finder",
  teachText: "TeachText",
  clioTalk: "ClioTalk",
  quickDraft: "Quick Draft",
  searcher: "Searcher",
  reader: "Reader",
  endfield: "Endfield Terminal",
  docMap: "DocMap",
  clioStage: "ClioStage",
  liquidCover: "Cover Glass",
  cmfStudio: "CMF Studio",
  scrapbook: "Scrapbook",
  accessories: "Accessories",
  system: "System",
};

const windowAppMap = {
  assistant: "clioTalk",
  quickDraft: "quickDraft",
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
  reader: "reader",
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
  liquidCover: "liquidCover",
  cmfStudio: "cmfStudio",
  dictionary: "accessories",
  imageManager: "teachText",
  systemHelp: "system",
  dictation: "accessories",
  translationPad: "accessories",
  writingBell: "accessories",
  notePad: "accessories",
  clipboard: "accessories",
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

function getWindowAppId(winOrName) {
  const win = typeof winOrName === "string" ? getWindow(winOrName) : winOrName;
  const name = typeof winOrName === "string" ? winOrName : win?.dataset.window;
  return win?.dataset.app || windowAppMap[name] || "finder";
}

function isMultiFinderMode() {
  return runtimeEnvironment !== "finder";
}

function isFinderModeSingleTaskApp(appId) {
  return !!appId && !finderModeForegroundAppIds.has(appId);
}

function isSideAskPairApp(appId) {
  return appId === "clioTalk" || appId === sideAskAnchorAppId;
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
  document.querySelector(".multifinder-menu")?.classList.toggle("is-hidden", !isMultiFinderMode());
  if (!isMultiFinderMode()) return;

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
