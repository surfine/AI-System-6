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
  quickDraft: "Quick Draft",
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
  imagePromptStudio: "Image Prompt Studio",
  soundscape: "Soundscape",
  scrapbook: "Scrapbook",
  themeLab: "Theme Lab",
  bureaucracyMeme: "Bureaucracy Meme",
  micropolis: "Micropolis",
  openttd: "OpenTTD",
  bonsaiCity: "Bonsai City",
  doom: "DOOM",
  accessories: "Accessories",
  system: "System",
};

// Which application owns a window is declared once, in
// core/window-registry.js, along with everything else a window is.

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
  return registeredWindowAppId(name);
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

// Whose menu bar is this. The appearance registry owns the answer; see the
// menuBarModel comment in app/core/theme-registry.js. Classic falls back to the
// System 6 model, which is what the bar is before a theme has been applied.
function menuBarModel() {
  return window.AISystem6Theme?.getMenuBarModel?.() || "application-owned";
}

function usesApplicationOwnedMenuBar() {
  return menuBarModel() === "application-owned";
}

// The list of open applications, with a check mark on the current one. In the
// application-owned eras this belongs at the bottom of the Apple menu, which is
// where System 6 put it; in the Mac OS X eras it is what the right-end control
// is for, standing in for the Dock this desktop does not have.
function runningApplicationRows() {
  const rows = [];
  const apps = getRunningApps();
  if (!apps.length) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.disabled = true;
    empty.className = "multifinder-empty";
    empty.textContent = typeof t === "function" ? t("no_running_apps") : "No running applications";
    return [empty];
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
    rows.push(button);
  });
  rows.push(document.createElement("hr"));
  rows.push(applicationRow("bring-app-front", t("bring_all_to_front")));
  return rows;
}

// The verbs that act on the application as a whole. Mac OS X keeps these in the
// bold application menu (Aqua HIG p.55-56: Hide, Hide Others, Show All, then a
// separator and Quit); the application-owned eras keep them with MultiFinder's
// own rows in the Apple menu, because there the right end is an indicator and
// has no list to hang them from. They are named after activeAppId, which is
// exactly the application each one acts on.
function applicationVerbRows() {
  return [
    applicationRow("hide-active-app", t("hide_app", activeAppLabel())),
    applicationRow("hide-other-apps", t("hide_others")),
    applicationRow("show-all-apps", t("show_all")),
    document.createElement("hr"),
    applicationRow("quit-active-app", t("quit_app", activeAppLabel())),
  ];
}

function applicationRow(action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

// Availability is not decided here; it is read from the one map that answers
// for every menu row. It has to be applied at build time as well, because most
// callers render these rows *after* updateMenuState() has already made its
// pass (window-manager calls the pair in that order), and a row that cannot
// act must never spend even one frame looking as if it can.
function applyApplicationRowAvailability(container) {
  if (!container || typeof getActionAvailability !== "function") return;
  const state = getActionAvailability();
  container.querySelectorAll("button[data-action]").forEach((button) => {
    const available = state[button.dataset.action];
    if (available === undefined) return;
    button.classList.toggle("is-disabled", !available);
    button.disabled = !available;
  });
}

// Apple's 1988 System Software 6.0 guide, p.229-230: "Clicking the small icon
// in the menu bar brings forward each open application in succession. In effect
// you are paging through all the open applications." No menu drops down.
function cycleToNextApp() {
  if (!isMultiFinderMode()) return;
  const apps = getRunningApps();
  if (!apps.length) return;
  const current = apps.findIndex((app) => app.id === activeAppId);
  const next = apps[(current + 1) % apps.length];
  if (next) switchToApp(next.id);
}

function renderMultiFinderMenu() {
  if (activeAppId !== "accessories" && activeAppId !== "system") menuOwnerAppId = activeAppId;
  if (typeof renderAppMenuBar === "function") renderAppMenuBar(menuOwnerAppId);
  // MultiFinder-only, on every screen size. A phone presents apps full-screen
  // in both modes — that is a screen-size consequence, not a task model — so it
  // must not conjure a switcher in Finder mode, where one app runs at a time and
  // the close box is the way back to the desktop.
  const showSwitcher = isMultiFinderMode();
  const applicationOwned = usesApplicationOwnedMenuBar();
  document.querySelector(".multifinder-menu")?.classList.toggle("is-hidden", !showSwitcher);
  syncWorkspaceDesktopIcon();
  renderAppleMultiFinderSection(showSwitcher && applicationOwned);

  const labelEl = document.querySelector("#multifinder-label");
  const button = document.querySelector("#multifinder-button");
  const popover = document.querySelector("#multifinder-popover");
  if (!labelEl || !button || !popover) return;
  labelEl.textContent = activeAppLabel();

  if (applicationOwned) {
    // An indicator, not a menu: it reports the application in front and pages
    // to the next one. Nothing drops down, so nothing is rendered into the
    // popover and the control does not advertise one.
    button.dataset.appSwitchIndicator = "cycle";
    button.removeAttribute("aria-haspopup");
    button.setAttribute("aria-label", t("multifinder_indicator"));
    button.dataset.balloonHelp = "balloon_multifinder_indicator";
    popover.replaceChildren();
  } else {
    delete button.dataset.appSwitchIndicator;
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-label", t("multifinder_switcher"));
    button.dataset.balloonHelp = "balloon_multifinder_switcher";
    popover.replaceChildren(...(showSwitcher ? runningApplicationRows() : []));
  }
  // These rows are rebuilt from scratch, so the element cache updateMenuState()
  // greys from is now stale. Without this the new rows would never be asked
  // whether they can act.
  if (typeof invalidateMenuActionCache === "function") invalidateMenuActionCache();
  applyApplicationRowAvailability(popover);
}

function renderAppleMultiFinderSection(visible) {
  const section = document.querySelector("#apple-multifinder-apps");
  if (!section) return;
  section.classList.toggle("is-hidden", !visible);
  // A leading rule separates MultiFinder's contribution from the desk
  // accessories above it, the way the gray line separated the sections of the
  // System 6 Apple menu.
  section.replaceChildren(...(visible
    ? [
      document.createElement("hr"),
      ...runningApplicationRows(),
      document.createElement("hr"),
      ...applicationVerbRows(),
    ]
    : []));
  applyApplicationRowAvailability(section);
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

// ---- Application lifecycle driver -----------------------------------------
// One place answers "is this application actually on screen right now": it owns
// at least one window that is open, not app-hidden, not collapsed, and whose
// app MultiFinder has not hidden. Everything else is background, and a
// background app is asked to stop costing anything — never to forget its work.

function foregroundApplicationIds() {
  const ids = new Set();
  document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)").forEach((win) => {
    const appId = getWindowAppId(win);
    if (appId && !hiddenAppIds.has(appId)) ids.add(appId);
  });
  return ids;
}

let applicationLifecycleFrame = 0;

function refreshApplicationLifecycle(reason = "") {
  if (applicationLifecycleFrame) {
    cancelAnimationFrame(applicationLifecycleFrame);
    applicationLifecycleFrame = 0;
  }
  return window.AISystem6ApplicationRegistry?.syncApplicationLifecycle?.({
    foregroundAppIds: foregroundApplicationIds(),
    documentHidden: document.visibilityState === "hidden",
    reason,
  });
}

// Window class flips arrive in bursts (focus, Hide Others, session restore), so
// coalesce them into one pass and never suspend an app mid-transition.
function scheduleApplicationLifecycleRefresh(reason = "") {
  if (applicationLifecycleFrame) return;
  applicationLifecycleFrame = requestAnimationFrame(() => {
    applicationLifecycleFrame = 0;
    refreshApplicationLifecycle(reason);
  });
}

function installApplicationLifecycleWatch() {
  const desktop = document.querySelector(".desktop");
  if (desktop && typeof MutationObserver === "function") {
    new MutationObserver((records) => {
      // Window chrome is the only class flip that changes foreground state;
      // ignore the ordinary interior repaints so a phone does not schedule a
      // frame for every button that toggles a class.
      if (!records.some((record) => record.target?.classList?.contains("window"))) return;
      scheduleApplicationLifecycleRefresh("window");
    }).observe(desktop, { attributes: true, attributeFilter: ["class"], subtree: true });
  }
  // A backgrounded Home Screen App gets no frames at all, so this pass runs
  // now rather than through the scheduler.
  document.addEventListener("visibilitychange", () => {
    refreshApplicationLifecycle(document.visibilityState === "hidden" ? "document-hidden" : "document-visible");
  });
  window.addEventListener("pagehide", () => {
    window.AISystem6ApplicationRegistry?.syncApplicationLifecycle?.({
      foregroundAppIds: [],
      documentHidden: true,
      reason: "pagehide",
    });
  });
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
