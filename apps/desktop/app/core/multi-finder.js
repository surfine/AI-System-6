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
  lightroom: "Lightroom",
  teachText: "TeachText",
  clioTalk: "ClioTalk",
  searcher: "Searcher",
  reader: "Reader",
  endfield: "Endfield Terminal",
  docMap: "DocMap",
  scrapbook: "Scrapbook",
  accessories: "Accessories",
  system: "System",
  // The admitted applications name themselves once, in app/core/app-admissions.js.
  ...window.AISystem6Admissions?.multiFinderLabels?.(),
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
  // Managed windows only: a `.window` with no data-window was never opened by
  // the manager. Theme Lab shows real windows as specimens so the era paints
  // them, and a sweep that hides or re-frames one empties the board.
  document.querySelectorAll(".window[data-window]").forEach((win) => {
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
  releaseOrphanedMiniwindows();
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
  return Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden):not(.is-minimized)"))
    .filter((win) => getWindowAppId(win) === appId);
}

function foregroundVisibleWindows() {
  return Array.from(document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden):not(.is-minimized)"))
    .filter((win) => !hiddenAppIds.has(getWindowAppId(win)));
}

function windowsForApp(appId) {
  return Array.from(document.querySelectorAll(".window[data-window]"))
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
// is for: the way to switch applications on a keyboard, on a phone, and
// whenever the era's Dock is switched off or has not shipped.
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

// ---- Miniaturized windows --------------------------------------------------
//
// The lists of put-away windows moved into the miniaturize module
// (app/core/window-minimize.js), which owns the state and loads only for an
// appearance that draws the control. Two faces read them there: `rows()` for
// this switcher's miniwindow section, and `renderAppleMenuSection()` for the
// Apple menu's own list. NeXTSTEP's shell still draws its own miniwindows in
// its dock; the rows here are the desk's list, and they read the same state.

// ---- The front application's windows ---------------------------------------
//
// The application list answers "which application". With seventeen windows in
// Finder's registry, twenty-two in the accessories and ten in the writing
// studio, nothing answered "which window". The historical home for that list is
// the Window menu — System 7 put one in every application's bar and Mac OS X
// kept it — and this desk's bar budget currently allows four stable menus
// (tests/features/menu-bar.test.mjs:182), so what ships here is the walk over
// the same set: the application's own windows, which is what the desk already
// means by "this application's windows" (visibleWindowsForApp: Bring All to
// Front, Hide and Quit all read it). Desk accessories are not in it: they do
// not own the menu bar here, exactly as they did not in System 6, and the Apple
// menu's own DA rows are their way back.

function frontApplicationId() {
  return menuOwnerAppId || activeAppId || "finder";
}

// Visibility vocabulary for window browse: never flatten to a boolean.
// closed / app-hidden / minimized / collapsed / open stay distinct so restore
// can call the matching existing entry instead of only clearing display:none.
function applicationWindowPresentation(win) {
  if (!win?.isConnected) return "closed";
  if (win.classList.contains("is-hidden")) return "closed";
  if (win.classList.contains("is-app-hidden") || hiddenAppIds.has(getWindowAppId(win))) return "app-hidden";
  if (win.classList.contains("is-minimized")) return "minimized";
  if (win.classList.contains("is-collapsed")) return "collapsed";
  return "open";
}

function applicationWindowOrder(appId = frontApplicationId()) {
  // A window shaded into its title bar is still open: WindowShade puts a
  // window aside without it leaving the desk (a verb of its own beside
  // minimize, never replaced by it), so a list that dropped those would lose
  // the windows a writer is most likely to be looking for. App-hidden and
  // minimized peers stay listed with their own state. Front-most first, the
  // order the window switcher in 98.js used (z-index as a last-used proxy).
  return windowsForApp(appId)
    .filter((win) => applicationWindowPresentation(win) !== "closed")
    // WM1: last-used order comes from the focus rank a real focus wrote, not
    // from z-index. Raising a pinned window no longer looks like "most recently
    // used", so the walk keeps its true order across a pin.
    .sort((a, b) => windowFocusRank(b) - windowFocusRank(a)
      || Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
}

function applicationWindowTitle(win, { markState = false } = {}) {
  const base = win?.querySelector(".title-bar h1, .title-bar h2")?.textContent?.trim()
    || win?.dataset.window
    || "";
  if (!markState || typeof t !== "function") return base;
  const state = applicationWindowPresentation(win);
  if (state === "open" || state === "closed") return base;
  const mark = t(`window_state_${state.replace(/-/g, "_")}`);
  return mark ? `${base} (${mark})` : base;
}

function restoreApplicationWindow(win) {
  if (!win?.isConnected) return false;
  const state = applicationWindowPresentation(win);
  if (state === "closed") return false;
  if (state === "app-hidden") unhideApp(getWindowAppId(win));
  if (win.classList.contains("is-minimized")) return !!restoreMinimizedWindow(win);
  // Collapsed stays collapsed: bringing the application window forward is not
  // a WindowShade unroll. Focus raises it through the real focus path.
  focusWindow(win, true);
  return true;
}

// WM5: one cross-application projection over the real window IDs. Every field
// a browse row needs (title, application, the distinct collapsed / minimized /
// app-hidden state, pin and focus rank) comes from the live DOM and the
// existing focus-rank owner — never from a second, drifting runningApps copy.
// Closed windows never appear; two windows of one application stay separate.
// Titles are plain text on purpose: a caller sets them with textContent.
function windowBrowseEntries() {
  const entries = [];
  if (typeof document === "undefined") return entries;
  document.querySelectorAll(".window[data-window]").forEach((win) => {
    const state = applicationWindowPresentation(win);
    if (state === "closed") return;
    const appId = getWindowAppId(win);
    entries.push({
      name: win.dataset.window,
      appId,
      appLabel: multiFinderAppLabels[appId] || appId,
      title: applicationWindowTitle(win),
      state,
      pinned: typeof isWindowPinned === "function" ? !!isWindowPinned(win) : false,
      focusRank: typeof windowFocusRank === "function" ? windowFocusRank(win) : 0,
    });
  });
  // Front-most first. Focus rank, not z-index: raising a pinned window must not
  // reshuffle the list the writer is reading.
  return entries.sort((a, b) => b.focusRank - a.focusRank || Number(b.pinned) - Number(a.pinned));
}

// Recovery reads the entry's actual state and calls the matching existing
// entry point. It never calls openWindow: a window that is already open is
// brought back, not summoned again, so the writing route's summon / restore
// exclusivity is preserved. A stale (closed) id returns false and the caller
// drops the row.
function restoreWindowBrowseEntry(name) {
  const win = typeof getWindow === "function" ? getWindow(name) : null;
  if (!win) return false;
  return restoreApplicationWindow(win);
}

/**
 * Walk the application's windows, front-most first, so one key answers "the
 * other window I was just in". ⌘` is Mac OS X's key for exactly this — System 6
 * had no such key (the Apple menu's DA rows were the way back to a desk
 * accessory), and a browser may claim the combination before the page sees it:
 * 98.js hit the same wall with Alt+Tab and had to choose another.
 *
 * The walk keeps its own cursor. It has to: raising a window rewrites the
 * z-order, so a formula read from the list every press would make ⇧⌘` land
 * somewhere other than the window ⌘` just left (measured: forward to the window
 * behind, then back, landed on the least recent one instead of returning).
 * The snapshot is dropped as soon as the front window is not the one the cursor
 * points at — i.e. as soon as the writer has picked a window themselves.
 */
let windowWalk = { appId: "", names: [], index: 0 };

function cycleApplicationWindows(direction = 1) {
  const appId = frontApplicationId();
  const windows = applicationWindowOrder(appId);
  const frontName = windows.find((win) => win.classList.contains("is-active"))?.dataset.window || "";
  // The snapshot follows live membership: a window opened or closed since the
  // last press must join (or leave) the walk, and the cursor must point at the
  // window the writer is actually in, not at a stale name's old slot.
  const currentNames = new Set(windows.map((win) => win.dataset.window));
  const membershipChanged = currentNames.size !== windowWalk.names.length
    || windowWalk.names.some((name) => !currentNames.has(name));
  if (windowWalk.appId !== appId || membershipChanged || windowWalk.names[windowWalk.index] !== frontName) {
    const names = windows.map((win) => win.dataset.window);
    windowWalk = { appId, names, index: Math.max(0, names.indexOf(frontName)) };
  }
  if (windows.length === 1 && (windows[0].classList.contains("is-minimized")
      || windows[0].classList.contains("is-collapsed"))) {
    // One put-away window: the walk's only job is to bring it back, so it goes
    // through the shared application-window restore path (unhide, minimize
    // entry point, real focus) instead of saying "only one window". A shaded
    // window still returns shaded -- bringing it forward is not an unroll.
    const restored = restoreApplicationWindow(windows[0]);
    if (restored) setStatus(t("window_front_now", applicationWindowTitle(windows[0])));
    return restored;
  }
  if (windows.length < 2) {
    // The application is named because a desk accessory in front does not own
    // the bar: without the name, "only one window" could be read as being about
    // the window the writer is looking at.
    const appLabel = multiFinderAppLabels[appId] || appId;
    setStatus(windows.length ? t("window_only_one", appLabel) : t("window_none_open", appLabel));
    return false;
  }
  const step = direction < 0 ? -1 : 1;
  const count = windowWalk.names.length;
  let next = null;
  for (let hop = 0; hop < count && !next; hop += 1) {
    windowWalk.index = ((windowWalk.index + step) % count + count) % count;
    const candidate = getWindow(windowWalk.names[windowWalk.index]);
    // A window can close, or another application's window can reuse the name,
    // while the walk is still open; the snapshot skips stale identities rather
    // than stopping the key dead or landing in the wrong app.
    if (candidate?.isConnected && currentNames.has(candidate.dataset.window)
        && !candidate.classList.contains("is-hidden") && getWindowAppId(candidate) === appId) next = candidate;
  }
  if (!next) {
    windowWalk = { appId, names: [], index: 0 };
    setStatus(t("window_none_open", multiFinderAppLabels[appId] || appId));
    return false;
  }
  const restored = restoreApplicationWindow(next);
  if (!restored) return false;
  setStatus(t("window_front_now", applicationWindowTitle(next)));
  return true;
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
    // Where the era draws the yellow lamp, the application menu also names the
    // verb, with the shortcut the host may or may not let through.
    ...(window.AISystem6WindowMinimize?.lampEnabled?.()
      ? [applicationRow("minimize-window", t("minimize_window_command"))]
      : []),
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

// NeXTSTEP's Dock and desk row hide under the same narrow media query that
// nextstep-shell.css owns (max-width 860px / coarse short screens). Without a
// replacement, App and window switching disappear. On that surface the right-end
// control becomes one merged App／window menu — portrait one list, landscape
// can still split via the Dock when the desk is wide enough again
// (polishTodo narrow-merged-switcher-polish).
const NEXTSTEP_NARROW_MERGED_SWITCHER_QUERY = "(max-width: 860px) and (not ((hover: hover) and (pointer: fine) and (min-width: 640px) and (min-height: 540px))), (hover: none) and (pointer: coarse) and (max-height: 660px)";

function prefersNextstepNarrowMergedSwitcher() {
  try {
    if (window.AISystem6Theme?.getCurrentTheme?.() !== "nextstep") return false;
    return window.matchMedia?.(NEXTSTEP_NARROW_MERGED_SWITCHER_QUERY)?.matches === true;
  } catch (error) {
    return false;
  }
}

let nextstepMergedSwitcherMedia = null;
function watchNextstepNarrowMergedSwitcher() {
  if (typeof window.matchMedia !== "function" || nextstepMergedSwitcherMedia) return;
  try {
    nextstepMergedSwitcherMedia = window.matchMedia(NEXTSTEP_NARROW_MERGED_SWITCHER_QUERY);
    const refresh = () => {
      if (window.AISystem6Theme?.getCurrentTheme?.() === "nextstep") renderMultiFinderMenu();
    };
    if (typeof nextstepMergedSwitcherMedia.addEventListener === "function") {
      nextstepMergedSwitcherMedia.addEventListener("change", refresh);
    } else if (typeof nextstepMergedSwitcherMedia.addListener === "function") {
      nextstepMergedSwitcherMedia.addListener(refresh);
    }
  } catch (error) { /* matchMedia unavailable: stay on the cycle indicator. */ }
}

function renderMultiFinderMenu() {
  window.AISystem6NextstepShell?.syncMain();
  window.AISystem6NextstepDock?.sync();
  window.AISystem6DeskDock?.sync();
  watchNextstepNarrowMergedSwitcher();
  if (activeAppId !== "accessories" && activeAppId !== "system") menuOwnerAppId = activeAppId;
  if (typeof renderAppMenuBar === "function") renderAppMenuBar(menuOwnerAppId);
  // MultiFinder-only, on every screen size. A phone presents apps full-screen
  // in both modes — that is a screen-size consequence, not a task model — so it
  // must not conjure a switcher in Finder mode, where one app runs at a time and
  // the close box is the way back to the desktop.
  const showSwitcher = isMultiFinderMode();
  const applicationOwned = usesApplicationOwnedMenuBar();
  const nextstepMerged = prefersNextstepNarrowMergedSwitcher();
  document.querySelector(".multifinder-menu")?.classList.toggle("is-hidden", !showSwitcher);
  document.body?.classList?.toggle("nextstep-merged-switcher", nextstepMerged);
  syncWorkspaceDesktopIcon();
  renderAppleMultiFinderSection(showSwitcher && applicationOwned);
  // The Apple menu's minimized-windows section is drawn by the miniaturize
  // module, in every menu-bar mode (Finder included, where it is the only
  // list). Rendered through the same optional call the switcher rows use, so a
  // desk with no module simply has no put-away windows to list.
  window.AISystem6WindowMinimize?.renderAppleMenuSection?.();

  const labelEl = document.querySelector("#multifinder-label");
  const button = document.querySelector("#multifinder-button");
  const popover = document.querySelector("#multifinder-popover");
  if (!labelEl || !button || !popover) return;
  labelEl.textContent = activeAppLabel();

  if (applicationOwned && !nextstepMerged) {
    // An indicator, not a menu: it reports the application in front and pages
    // to the next one. Nothing drops down, so nothing is rendered into the
    // popover and the control does not advertise one.
    button.dataset.appSwitchIndicator = "cycle";
    delete button.dataset.appSwitchMerged;
    button.removeAttribute("aria-haspopup");
    button.setAttribute("aria-label", t("multifinder_indicator"));
    button.dataset.balloonHelp = "balloon_multifinder_indicator";
    popover.replaceChildren();
  } else {
    delete button.dataset.appSwitchIndicator;
    if (nextstepMerged) button.dataset.appSwitchMerged = "app-window";
    else delete button.dataset.appSwitchMerged;
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-label", t("multifinder_switcher"));
    button.dataset.balloonHelp = "balloon_multifinder_switcher";
    popover.replaceChildren(...(showSwitcher ? [...runningApplicationRows(), ...(window.AISystem6WindowMinimize?.rows?.() || [])] : []));
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

/**
 * Bring an application forward.
 *
 * `restoreMinimized` is not a detail, it is the era's own rule. In NeXTSTEP
 * 3.3 the application icon stands for the application and a window comes back
 * from its own miniwindow icon; activating the application must therefore
 * leave miniaturized windows exactly where they are. Mac OS X's Dock has no
 * separate window icon for most applications, so there the application icon is
 * the way back to a window that is no longer on screen. The caller that knows
 * which control was pressed asks for the behaviour; `activateApplicationRow`
 * below reads it from the menu-bar model.
 */
function switchToApp(appId, { restoreMinimized = false } = {}) {
  if (!isMultiFinderMode()) return;
  ensureRunningApp(appId);
  unhideApp(appId);
  const windows = visibleWindowsForApp(appId);

  windows
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    .forEach((win) => setWindowLayerZ(win, nextWindowLayerZ()));

  activeAppId = appId;
  if (windows.length) {
    focusWindow(windows[windows.length - 1], 1);
  } else if (restoreMinimized) {
    // An application whose windows are all miniaturized still has to come
    // forward: clicking its icon is the way back a person will actually find,
    // and it is the one every macOS-shaped appearance can offer -- including
    // the ones whose title bars never carried a minimize lamp of their own.
    const miniaturized = windowsForApp(appId)
      .filter((win) => win.classList.contains("is-minimized")
        && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden"))
      .sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
    if (miniaturized.length) restoreMinimizedWindow(miniaturized[0]);
  }
  renderMultiFinderMenu();
}

// The application row in the desk's own list. Which era's rule applies is read
// from the menu-bar model the registry already states: an application-owned bar
// (System 6 through 9, and NeXTSTEP, where the Dock lists applications) keeps
// that era's separation between "the application" and "the window"; a
// system-owned bar (Mac OS X and later) has no window list of its own, so the
// application row is also the way back to a miniaturized window.
function activateApplicationRow(appId) {
  return switchToApp(appId, { restoreMinimized: !usesApplicationOwnedMenuBar() });
}

// Showing an application undoes Hide and nothing else. Hide rolls an
// application's windows up and marks them, so switching to it, Show All and
// the ⌘` walk unroll exactly the marked ones; a window the writer rolled up
// stays rolled up (Mac OS 8 HIG): bringing an application forward is not a
// WindowShade command.
function unhideApp(appId) {
  hiddenAppIds.delete(appId);
  windowsForApp(appId).forEach((win) => {
    win.classList.remove("is-app-hidden");
    if (win.dataset.appHiddenCollapsed === "true") win.classList.remove("is-collapsed");
    delete win.dataset.appHiddenCollapsed;
  });
}

function hideApp(appId = activeAppId, { preserveActive = false } = {}) {
  if (nonQuittableAppIds.has(appId)) return;
  const windows = windowsForApp(appId).filter((win) => !win.classList.contains("is-hidden"));
  if (!windows.length) return;
  hiddenAppIds.add(appId);
  windows.forEach((win) => {
    if (getCurrentTheme() === "nextstep") {
      win.classList.add("is-app-hidden");
      win.classList.remove("is-active");
      return;
    }
    // Only the windows Hide itself rolls up carry its mark: one the writer had
    // already rolled up is theirs, and showing the application leaves it so.
    if (!win.classList.contains("is-collapsed")) {
      win.classList.add("is-collapsed");
      win.dataset.appHiddenCollapsed = "true";
    }
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
  document.querySelectorAll(".window[data-window]:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)").forEach((win) => {
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
  if (!windows.length) {
    // isAvailable should block this; if a race still dispatches, say so.
    if (typeof setStatus === "function") setStatus(t("bring_all_to_front_none"));
    return false;
  }
  const ordered = windows
    .slice()
    .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0));
  // With one window already in front there is nothing to re-stack, so the
  // command did its job and yet the screen did not change — which reads as a
  // dead menu row. Report the fact instead of leaving the writer to wonder,
  // the same correction Select All carries for an empty field.
  const before = ordered.map((win) => win.style.zIndex || "");
  ordered.forEach((win) => {
    setWindowLayerZ(win, nextWindowLayerZ());
  });
  if (ordered.length) focusWindow(ordered[ordered.length - 1], 1);
  const moved = ordered.some((win, index) => (win.style.zIndex || "") !== before[index]);
  if (typeof setStatus === "function") {
    setStatus(moved ? t("bring_all_to_front_done") : t("bring_all_to_front_already"));
  }
  return moved;
}
