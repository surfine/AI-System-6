// Core runtime module: working-session.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


// Every Project Hard Disk owns its own desktop scene, stored under one scope
// key: the desktop (no disk mounted) or one project. The single
// "workingSession:v1" record is migrated into its v2 scope at boot.
const workingSessionLegacyStorageKey = "workingSession:v1";
const workingSessionKeyPrefix = "workingSession:v2:";
const workingSessionDesktopKey = "workingSession:v2:desktop";
const workingSessionProjectKeyPrefix = "workingSession:v2:project:";
const workingSessionVersion = 2;
// Above this many project scenes, the least recently saved one is dropped.
const workingSessionScopeLimit = 24;
const workingSessionAdapters = new Map();
let workingSessionSaveTimer = null;
let workingSessionSavePromise = Promise.resolve();
let workingSessionRestoreInProgress = false;
let workingSessionAutosaveInstalled = false;
let workingSessionMigrationPromise = null;
const workingSessionExcludedWindowNames = new Set(["about", "saveChat"]);

function registerWorkingSessionAdapter(adapter) {
  if (!adapter || typeof adapter.id !== "string" || !adapter.id.trim()) return false;
  workingSessionAdapters.set(adapter.id, adapter);
  return true;
}

function cloneWorkingSessionValue(value, fallback) {
  if (value === undefined) return fallback;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function workingSessionNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampWorkingSessionNumber(value, min, max, fallback = min) {
  const number = workingSessionNumber(value, fallback);
  return Math.max(min, Math.min(max, number));
}

function captureTextControlWorkingSession(control) {
  return {
    selectionStart: control?.selectionStart ?? 0,
    selectionEnd: control?.selectionEnd ?? control?.selectionStart ?? 0,
    selectionDirection: control?.selectionDirection || "none",
    scrollTop: control?.scrollTop || 0,
    focused: document.activeElement === control,
  };
}

function restoreTextControlWorkingSession(control, state = {}, options = {}) {
  if (!control) return;
  const start = Math.min(Math.max(0, Number(state.selectionStart) || 0), control.value.length);
  const end = Math.min(Math.max(start, Number(state.selectionEnd) || start), control.value.length);
  control.setSelectionRange(start, end, ["forward", "backward"].includes(state.selectionDirection) ? state.selectionDirection : "none");
  control.scrollTop = Math.max(0, Number(state.scrollTop) || 0);
  if (state.focused && options.windowName) {
    const win = getWindow(options.windowName);
    if (win && !win.classList.contains("is-hidden") && !control.classList.contains("is-hidden")) {
      control.focus({ preventScroll: true });
    }
  }
}

function inlineStyleValue(el, property) {
  return el?.style?.getPropertyValue(property) || "";
}

function setInlineStyleValue(el, property, value) {
  if (!el?.style) return;
  const normalized = String(value || "");
  if (normalized) el.style.setProperty(property, normalized);
  else el.style.removeProperty(property);
}

// Which disk owns the scene right now. With nothing mounted the desktop owns
// it, so an ejected disk's later scene never lands under a project key.
function currentWorkingSessionProjectId() {
  if (typeof isProjectMounted !== "undefined" && !isProjectMounted) return "";
  return String(typeof activeProjectId === "undefined" ? "" : activeProjectId || "");
}

function workingSessionScopeKey(projectId) {
  const id = String(projectId || "").trim();
  return id ? `${workingSessionProjectKeyPrefix}${id}` : workingSessionDesktopKey;
}

function currentWorkingSessionKey() {
  return workingSessionScopeKey(currentWorkingSessionProjectId());
}

async function workingSessionStoreTask(mode, run) {
  let db;
  try {
    db = await openAppDb();
    const value = await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      mode,
      (tx) => run(tx.objectStore(keyvalStoreName))
    );
    return { ok: true, value };
  } catch (error) {
    console.warn("Working Session storage failed.", error);
    return { ok: false, value: null };
  } finally {
    db?.close();
  }
}

async function readWorkingSessionSnapshot(key = currentWorkingSessionKey()) {
  return (await workingSessionStoreTask("readonly", (store) => idbRequest(store.get(key)))).value || null;
}

async function writeWorkingSessionSnapshot(snapshot, key = currentWorkingSessionKey()) {
  return (await workingSessionStoreTask("readwrite", (store) => idbRequest(store.put(snapshot, key)))).ok;
}

async function deleteWorkingSessionSnapshot(key = currentWorkingSessionKey()) {
  return (await workingSessionStoreTask("readwrite", (store) => idbRequest(store.delete(key)))).ok;
}

async function listWorkingSessionScopeKeys() {
  const keys = (await workingSessionStoreTask("readonly", (store) => idbRequest(store.getAllKeys()))).value;
  return (Array.isArray(keys) ? keys : [])
    .filter((key) => typeof key === "string" && key.startsWith(workingSessionKeyPrefix));
}


function captureWorkingSessionSnapshot() {
  const adapters = {};
  workingSessionAdapters.forEach((adapter, id) => {
    if (typeof adapter.capture !== "function") return;
    try {
      const value = adapter.capture();
      if (value !== undefined) adapters[id] = value;
    } catch (error) {
      console.warn(`Failed to capture Working Session adapter "${id}".`, error);
    }
  });
  const ownerId = currentWorkingSessionProjectId();
  return {
    version: workingSessionVersion,
    savedAt: new Date().toISOString(),
    projectId: ownerId || null,
    viewport: {
      width: window.innerWidth || 0,
      height: window.innerHeight || 0,
    },
    adapters,
  };
}

function scheduleWorkingSessionSave(delay = 350) {
  if (workingSessionRestoreInProgress) return;
  clearTimeout(workingSessionSaveTimer);
  workingSessionSaveTimer = setTimeout(() => {
    flushWorkingSessionSave();
  }, delay);
}

function flushWorkingSessionSave() {
  if (workingSessionRestoreInProgress) return workingSessionSavePromise;
  clearTimeout(workingSessionSaveTimer);
  workingSessionSaveTimer = null;
  const snapshot = captureWorkingSessionSnapshot();
  // Bind the scope key at capture time. The mounted disk can move before the
  // queued write runs, and one disk's scene must never land under another's.
  const key = workingSessionScopeKey(snapshot.projectId);
  workingSessionSavePromise = workingSessionSavePromise
    .catch(() => {})
    .then(() => writeWorkingSessionSnapshot(snapshot, key));
  return workingSessionSavePromise;
}

// Unified session-commit layer. High-frequency changes (movement, selection,
// scroll, focus, drawer/view toggles) call scheduleWorkingSessionCommit and
// are debounced; important boundaries (project switch, closing the active
// writing app, Continue, environment change, pagehide) call
// flushWorkingSessionCommit and wait for the durable write.
function scheduleWorkingSessionCommit(delayMs = 350) {
  return scheduleWorkingSessionSave(delayMs);
}

async function flushWorkingSessionCommit() {
  return flushWorkingSessionSave();
}

// Read-only instances (another window owns the write lease) cancel pending
// autosaves instead of letting them fail into the UI.
function cancelWorkingSessionAutosave() {
  clearTimeout(workingSessionSaveTimer);
  workingSessionSaveTimer = null;
}

// Scrub an erased project out of a scene that is not its own: an ejected disk
// can leave its File Floppy behind in the desktop scene.
async function scrubWorkingSessionScope(key, projectId) {
  const snapshot = await readWorkingSessionSnapshot(key);
  if (!snapshot?.adapters) return true;
  let changed = false;
  const adapters = { ...snapshot.adapters };
  for (const [id, adapter] of workingSessionAdapters.entries()) {
    if (typeof adapter.clear !== "function" || adapters[id] === undefined) continue;
    try {
      const nextValue = adapter.clear(adapters[id], { projectId });
      if (nextValue === undefined) delete adapters[id];
      else adapters[id] = nextValue;
      changed = true;
    } catch (error) {
      console.warn(`Failed to clear Working Session adapter "${id}".`, error);
    }
  }
  if (!changed) return true;
  return writeWorkingSessionSnapshot({ ...snapshot, savedAt: new Date().toISOString(), adapters }, key);
}

// No projectId: put the whole desk away (Restart, Shut Down, safe startup,
// Boot Recovery). With a projectId: that disk was erased, so drop its own
// scene and scrub it out of every other one.
async function clearWorkingSession(options = {}) {
  cancelWorkingSessionAutosave();
  const projectId = String(options.projectId || "").trim();
  const keys = await listWorkingSessionScopeKeys();
  if (!projectId) {
    for (const key of keys) await deleteWorkingSessionSnapshot(key);
    return deleteWorkingSessionSnapshot(workingSessionLegacyStorageKey);
  }
  const ownKey = workingSessionScopeKey(projectId);
  await deleteWorkingSessionSnapshot(ownKey);
  for (const key of keys) {
    if (key !== ownKey) await scrubWorkingSessionScope(key, projectId);
  }
  return true;
}

// Orphan scenes (the disk is gone) go first; then the least recently saved
// scenes above the cap. The desktop scene and the mounted disk always stay.
async function pruneWorkingSessionScopes() {
  const known = new Set((Array.isArray(projects) ? projects : []).map((project) => project?.id).filter(Boolean));
  const activeKey = currentWorkingSessionKey();
  const live = [];
  for (const key of await listWorkingSessionScopeKeys()) {
    if (key === workingSessionDesktopKey || key === activeKey) continue;
    const projectId = key.startsWith(workingSessionProjectKeyPrefix)
      ? key.slice(workingSessionProjectKeyPrefix.length)
      : "";
    if (!projectId || !known.has(projectId)) {
      await deleteWorkingSessionSnapshot(key);
      continue;
    }
    live.push({ key, savedAt: String((await readWorkingSessionSnapshot(key))?.savedAt || "") });
  }
  live.sort((left, right) => (right.savedAt || "").localeCompare(left.savedAt || ""));
  for (const entry of live.slice(Math.max(0, workingSessionScopeLimit - 1))) {
    await deleteWorkingSessionSnapshot(entry.key);
  }
  return true;
}

function migratedWorkingSessionIsReadable(written, legacy) {
  if (!isValidWorkingSessionSnapshot(written)) return false;
  if (String(written.projectId || "") !== String(legacy.projectId || "")) return false;
  try {
    return JSON.stringify(written.adapters) === JSON.stringify(legacy.adapters);
  } catch {
    return false;
  }
}

// One-way move of "workingSession:v1" into its v2 scope, in a single
// transaction so the first boot after the upgrade does not spend its restore
// budget on round trips. Idempotent: a second run finds no legacy record and
// does nothing. Rollback-safe: the v1 record is deleted only after the v2
// record reads back with the same adapter payload, and any failure aborts the
// transaction, so the old scene is still there for the next boot.
async function migrateWorkingSessionStorage() {
  if (!workingSessionMigrationPromise) {
    workingSessionMigrationPromise = workingSessionStoreTask("readwrite", async (store) => {
      const legacy = await idbRequest(store.get(workingSessionLegacyStorageKey));
      if (!legacy || typeof legacy !== "object") return { migrated: false, reason: "absent" };
      const key = workingSessionScopeKey(legacy.projectId);
      const existing = await idbRequest(store.get(key));
      // A v2 scene already owning this scope supersedes the legacy record.
      let reason = "already-migrated";
      if (!isValidWorkingSessionSnapshot(existing)) {
        reason = "moved";
        await idbRequest(store.put({ ...legacy, version: workingSessionVersion, migratedFrom: 1 }, key));
        const written = await idbRequest(store.get(key));
        if (!migratedWorkingSessionIsReadable(written, legacy)) {
          return { migrated: false, reason: "unverified", key };
        }
      }
      await idbRequest(store.delete(workingSessionLegacyStorageKey));
      return { migrated: true, key, reason };
    }).then((result) => (result.ok ? result.value : { migrated: false, reason: "write-failed" }));
  }
  return workingSessionMigrationPromise;
}

function isValidWorkingSessionSnapshot(snapshot) {
  return snapshot
    && snapshot.version === workingSessionVersion
    && snapshot.adapters
    && typeof snapshot.adapters === "object";
}

// options.projectId picks the scope (default: whatever is mounted now).
// options.mounted means the caller already mounted it, so ownership stays put.
async function restoreWorkingSession(options = {}) {
  await migrateWorkingSessionStorage();
  const key = options.projectId === undefined
    ? currentWorkingSessionKey()
    : workingSessionScopeKey(options.projectId);
  const snapshot = await readWorkingSessionSnapshot(key);
  if (!isValidWorkingSessionSnapshot(snapshot)) return false;
  const ownerId = String(snapshot.projectId || "");
  if (ownerId) {
    const owner = projects.find((project) => project.id === ownerId);
    // The disk was erased: its scene has nothing left to open.
    if (!owner) {
      await deleteWorkingSessionSnapshot(key);
      return false;
    }
    // An archived disk is put away; it is remounted before its scene returns.
    if (owner.archived && !options.mounted) return false;
  }

  workingSessionRestoreInProgress = true;
  let restored = false;
  try {
    if (ownerId && !options.mounted) {
      activeProjectId = ownerId;
      selectedProjectId = ownerId;
      isProjectMounted = true;
      assignProjectScope(activeProjectId);
    }

    for (const [id, adapter] of workingSessionAdapters.entries()) {
      if (typeof adapter.restore !== "function" || snapshot.adapters[id] === undefined) continue;
      try {
        const result = await adapter.restore(snapshot.adapters[id], snapshot);
        restored = result !== false || restored;
      } catch (error) {
        console.warn(`Failed to restore Working Session adapter "${id}".`, error);
      }
    }
  } finally {
    workingSessionRestoreInProgress = false;
  }

  if (restored) {
    if (typeof scheduleWorkspaceRender === "function") {
      scheduleWorkspaceRender({
        projectLabels: true,
        projectReferences: true,
        mountedTextDisk: true,
        menuState: true,
      });
    }
    if (typeof scheduleStatusRender === "function") scheduleStatusRender();
    if (typeof renderMultiFinderMenu === "function") renderMultiFinderMenu();
    if (typeof updateMenuState === "function") updateMenuState();
  }
  return restored;
}

function installWorkingSessionAutosave() {
  if (workingSessionAutosaveInstalled) return;
  workingSessionAutosaveInstalled = true;
  // Boots that skip restore (Writer Mode, unfinished OOBE) still owe the
  // legacy record its move, and every boot pays the scene-count rent once.
  migrateWorkingSessionStorage()
    .then(() => pruneWorkingSessionScopes())
    .catch(() => {});

  document.addEventListener("input", (event) => {
    if (event.target?.closest?.("input, textarea, select, [contenteditable='true']")) {
      scheduleWorkingSessionCommit();
    }
  }, true);
  document.addEventListener("change", () => scheduleWorkingSessionCommit(), true);
  document.addEventListener("selectionchange", () => scheduleWorkingSessionCommit(900));
  // These unload handlers are best effort only: a browser never guarantees an
  // arbitrary IndexedDB promise completes here. Normal typing is debounced
  // ahead of time and high-value actions flush explicitly; the app never
  // claims "saved" from beforeunload.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWorkingSessionCommit();
  });
  window.addEventListener("pagehide", () => {
    flushWorkingSessionCommit();
  });
  window.addEventListener("beforeunload", () => {
    flushWorkingSessionCommit();
  });
}

function captureWindowWorkingSession() {
  const windows = Array.from(document.querySelectorAll(".window"))
    .filter((win) => {
      const name = win.dataset.window || "";
      return name && !workingSessionExcludedWindowNames.has(name);
    })
    .map((win) => {
      const sideAskRestore = win.dataset.sideaskRestoreActive === "true";
      const frameValue = (property, restoreKey) => (
        sideAskRestore ? win.dataset[restoreKey] || "" : inlineStyleValue(win, property)
      );
      return {
        name: win.dataset.window,
        appId: getWindowAppId(win),
        visible: !win.classList.contains("is-hidden"),
        appHidden: win.classList.contains("is-app-hidden"),
        active: win.classList.contains("is-active"),
        collapsed: win.classList.contains("is-collapsed"),
        shadeWidth: inlineStyleValue(win, "--window-shade-width"),
        desklet: win.classList.contains("is-desklet"),
        zoomed: sideAskRestore ? win.dataset.sideaskRestoreZoomed === "true" : win.dataset.zoomed === "true",
        userPositioned: win.dataset.userPositioned === "true",
        layoutGroup: win.dataset.layoutGroup || "",
        frameOwner: sideAskRestore ? "sideask-restore" : "window",
        zIndex: workingSessionNumber(win.style.zIndex, 0),
        frame: {
          left: frameValue("left", "sideaskRestoreLeft"),
          top: frameValue("top", "sideaskRestoreTop"),
          right: frameValue("right", "sideaskRestoreRight"),
          width: frameValue("width", "sideaskRestoreWidth"),
          height: frameValue("height", "sideaskRestoreHeight"),
          maxHeight: frameValue("max-height", "sideaskRestoreMaxHeight"),
          transform: frameValue("transform", "sideaskRestoreTransform"),
        },
        restoreFrame: {
          left: win.dataset.restoreLeft || "",
          top: win.dataset.restoreTop || "",
          width: win.dataset.restoreWidth || "",
          height: win.dataset.restoreHeight || "",
        },
      };
    });
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)");
  return {
    activeAppId,
    runtimeEnvironment,
    sideAskEnabled,
    topZ,
    cascadeOffset,
    activeWindowName: activeWin?.dataset.window || "",
    windows,
  };
}

const intrinsicSessionSizeWindowNames = new Set(["alarmClock"]);

function applyWindowSessionFrame(win, frame = {}) {
  if (!win || window.matchMedia("(max-width: 860px)").matches) return;
  if (typeof writerMode !== "undefined" && writerMode && win.dataset.window === "systemHelp") return;
  if (typeof writerMode !== "undefined" && writerMode
      && typeof writerModeCssOwnedWindows !== "undefined"
      && writerModeCssOwnedWindows.has(win.dataset.window)) return;
  const desktop = document.querySelector(".desktop");
  const desktopRect = desktop?.getBoundingClientRect();
  const maxWidth = Math.max(320, (desktopRect?.width || window.innerWidth) - 18);
  const maxHeight = Math.max(220, (desktopRect?.height || window.innerHeight) - 18);
  const parsePx = (value) => {
    const match = String(value || "").match(/^(-?\d+(?:\.\d+)?)px$/);
    return match ? Number(match[1]) : null;
  };
  const width = parsePx(frame.width);
  const height = parsePx(frame.height);
  const left = parsePx(frame.left);
  const top = parsePx(frame.top);
  const restoresIntrinsicSize = intrinsicSessionSizeWindowNames.has(win.dataset.window);

  setInlineStyleValue(
    win,
    "width",
    restoresIntrinsicSize
      ? ""
      : (width !== null ? `${clampWorkingSessionNumber(width, 180, maxWidth, 360)}px` : frame.width || ""),
  );
  setInlineStyleValue(
    win,
    "height",
    restoresIntrinsicSize
      ? ""
      : (height !== null ? `${clampWorkingSessionNumber(height, 120, maxHeight, 320)}px` : frame.height || ""),
  );
  setInlineStyleValue(win, "left", left !== null ? `${clampWorkingSessionNumber(left, 0, Math.max(0, maxWidth - 80), 18)}px` : frame.left || "");
  setInlineStyleValue(win, "top", top !== null ? `${clampWorkingSessionNumber(top, 0, Math.max(0, maxHeight - 40), 18)}px` : frame.top || "");
  setInlineStyleValue(win, "right", frame.right || "auto");
  setInlineStyleValue(win, "max-height", restoresIntrinsicSize ? "" : frame.maxHeight || "");
  setInlineStyleValue(win, "transform", frame.transform || "none");
}

async function restoreWindowWorkingSession(state = {}) {
  const windows = Array.isArray(state.windows) ? state.windows : [];
  if (!windows.length) return false;

  runtimeEnvironment = state.runtimeEnvironment === "multifinder" ? "multifinder" : startupEnvironment;
  topZ = Math.min(windowLayerMaxZ, Math.max(topZ, workingSessionNumber(state.topZ, topZ)));
  cascadeOffset = workingSessionNumber(state.cascadeOffset, cascadeOffset);
  clearSideAskMode();
  quietStartup();

  const visibleWindows = windows
    .filter((entry) => (
      entry?.visible
      && !workingSessionExcludedWindowNames.has(entry.name)
      && getWindow(entry.name)
      && isWorkspaceWindowAllowed(entry.name)
    ))
    .sort((a, b) => workingSessionNumber(a.zIndex, 0) - workingSessionNumber(b.zIndex, 0));
  const shouldArrangeQuickDraftPair = visibleWindows.some((entry) => (
    entry.name === "quickDraft" && !entry.appHidden
  ));

  for (const entry of visibleWindows) {
    await openWindow(entry.name, {
      skipFinderMode: true,
      skipPlacement: true,
      skipFocus: true,
      skipSideAsk: entry.name === "quickDraft",
    });
    const win = getWindow(entry.name);
    if (!win) continue;
    win.dataset.app = entry.appId || getWindowAppId(win);
    ensureRunningApp(win.dataset.app, entry.name);
    win.classList.toggle("is-app-hidden", !!entry.appHidden);
    const shadeWidth = entry.shadeWidth
      || entry.frame?.width
      || `${Math.round(win.getBoundingClientRect().width)}px`;
    setInlineStyleValue(win, "--window-shade-width", entry.collapsed ? shadeWidth : "");
    win.classList.toggle("is-collapsed", !!entry.collapsed);
    win.classList.toggle("is-desklet", !!entry.desklet);
    win.dataset.zoomed = entry.zoomed ? "true" : "false";
    win.dataset.userPositioned = entry.userPositioned ? "true" : "false";
    win.dataset.layoutGroup = entry.layoutGroup || (typeof windowLayoutGroup === "function" ? windowLayoutGroup(win) : entry.appId || "");
    if (entry.restoreFrame) {
      win.dataset.restoreLeft = entry.restoreFrame.left || "";
      win.dataset.restoreTop = entry.restoreFrame.top || "";
      win.dataset.restoreWidth = entry.restoreFrame.width || "";
      win.dataset.restoreHeight = entry.restoreFrame.height || "";
    }
    applyWindowSessionFrame(win, entry.frame || {});
    if (
      typeof isCenteredSystemWindow === "function"
      && isCenteredSystemWindow(win)
      && typeof placeCenteredSystemWindow === "function"
    ) {
      placeCenteredSystemWindow(win);
    } else if (typeof avoidWritingSpineOverlap === "function") {
      avoidWritingSpineOverlap(win);
    }
    const legacyQuickDraftSplit = entry.name === "quickDraft"
      && state.sideAskEnabled
      && entry.frameOwner !== "sideask-restore";
    if (legacyQuickDraftSplit) maximizeWindow(win);
    const quickDraftWidth = Number(String(entry.frame?.width || "").match(/^(-?\d+(?:\.\d+)?)px$/)?.[1] || 0);
    if (entry.name === "quickDraft" && !shouldArrangeQuickDraftPair && (!entry.frame?.width || quickDraftWidth < 360)) {
      requestAnimationFrame(() => maximizeWindow(win));
    }
    if (entry.zIndex) setWindowLayerZ(win, entry.zIndex);
  }

  const hiddenEntries = windows.filter((entry) => entry?.visible && entry.appHidden);
  hiddenEntries.forEach((entry) => {
    if (entry.appId) hiddenAppIds.add(entry.appId);
  });

  // Quick Draft opens beside the ordinary SideAsk window on desktop. During
  // resume, wait until every saved zoom/frame has been applied before laying
  // out that pair; otherwise the stale maximized frame can cover ClioTalk.
  const portrait = typeof isPortraitDocumentFlow === "function" && isPortraitDocumentFlow();
  if (shouldArrangeQuickDraftPair && !portrait && !isMultiFinderMode()) {
    await arrangeWindowAssistantSplit("quickDraft");
  }

  const activeName = state.activeWindowName || visibleWindows.find((entry) => entry.active)?.name || visibleWindows.at(-1)?.name;
  const activeWin = activeName ? getWindow(activeName) : null;
  if (activeWin && !activeWin.classList.contains("is-hidden")) {
    focusWindow(activeWin);
  } else if (visibleWindows.length) {
    focusWindow(getWindow(visibleWindows.at(-1).name));
  } else {
    activeAppId = "finder";
  }
  // Every restored window was opened without focus, so the portrait shell may
  // still reflect whichever saved frame happened to be visited last. Reconcile
  // it once, after the real foreground application has been restored.
  if (typeof syncMobileAppForeground === "function") syncMobileAppForeground();
  return true;
}

function captureSelectionWorkingSession() {
  return {
    activeProjectId,
    selectedProjectId,
    selectedFolderId,
    selectedChatFileId,
    selectedDocumentFolderId,
    selectedDocumentItemKeys: [...selectedDocumentItemKeys],
    selectedDocumentAnchorKey,
    selectedMountedFile,
    selectedMountedFileNames: [...selectedMountedFileNames],
    selectedScrapId,
    selectedScrapIds: [...selectedScrapIds],
    selectedProjectReferenceId,
    selectedProjectCdItemId,
    selectedProjectCdItemIds: [...selectedProjectCdItemIds],
    selectedDraftIndex,
    activeTextFileId,
  };
}

function restoreSelectionWorkingSession(state = {}) {
  if (state.activeProjectId && projects.some((project) => project.id === state.activeProjectId && !project.archived)) {
    activeProjectId = state.activeProjectId;
    selectedProjectId = state.selectedProjectId || activeProjectId;
    assignProjectScope(activeProjectId);
  }
  selectedFolderId = state.selectedFolderId || selectedFolderId || "all";
  selectedChatFileId = state.selectedChatFileId || null;
  selectedDocumentFolderId = state.selectedDocumentFolderId || null;
  selectedDocumentItemKeys.clear();
  (Array.isArray(state.selectedDocumentItemKeys) ? state.selectedDocumentItemKeys : []).forEach((key) => selectedDocumentItemKeys.add(key));
  selectedDocumentAnchorKey = state.selectedDocumentAnchorKey || "";
  selectedMountedFile = state.selectedMountedFile || null;
  selectedMountedFileNames.clear();
  (Array.isArray(state.selectedMountedFileNames) ? state.selectedMountedFileNames : []).forEach((name) => selectedMountedFileNames.add(name));
  selectedScrapId = state.selectedScrapId || null;
  selectedScrapIds.clear();
  (Array.isArray(state.selectedScrapIds) ? state.selectedScrapIds : []).forEach((id) => selectedScrapIds.add(id));
  selectedProjectReferenceId = state.selectedProjectReferenceId || null;
  selectedProjectCdItemId = state.selectedProjectCdItemId || null;
  selectedProjectCdItemIds.clear();
  (Array.isArray(state.selectedProjectCdItemIds) ? state.selectedProjectCdItemIds : []).forEach((id) => selectedProjectCdItemIds.add(id));
  selectedDraftIndex = Number.isInteger(state.selectedDraftIndex) ? state.selectedDraftIndex : selectedDraftIndex;
  activeTextFileId = state.activeTextFileId || null;
  if (typeof renderDocuments === "function") renderDocuments();
  if (typeof renderProjectDisks === "function") renderProjectDisks();
  if (typeof renderScraps === "function") renderScraps();
  if (typeof renderProjectCd === "function") renderProjectCd();
  if (typeof renderMountedTextDisk === "function") renderMountedTextDisk();
  if (typeof renderPipeline === "function") renderPipeline();
  return true;
}

function captureAssistantWorkingSession() {
  if (clioTalkTemporaryMode) {
    return {
      projectId: activeProjectId,
      activeChatFileId: null,
      prompt: "",
      conversation: [],
      compressedConversationMemory: { text: "", sourceMessages: 0, updatedAt: "" },
      nextTaskInputFileIds: [],
      lastAssistantText: "",
      lastUserText: "",
      messagesScrollTop: 0,
    };
  }
  const suspendedState = (typeof isSideAskClioTalkActive === "function" && isSideAskClioTalkActive() && sideAskClioTalkSession)
    ? sideAskClioTalkSession
    : null;
  return {
    projectId: activeProjectId,
    activeChatFileId: suspendedState ? String(suspendedState.activeChatFileId || "") : activeChatFileId,
    prompt: suspendedState ? String(suspendedState.prompt || "") : promptInput?.value || "",
    conversation: suspendedState
      ? (Array.isArray(suspendedState.conversation) ? suspendedState.conversation : []).map((item) => ({ ...item }))
      : conversation.map((item) => ({ ...item })),
    compressedConversationMemory: suspendedState
      ? { ...suspendedState.compressedConversationMemory }
      : { ...compressedConversationMemory },
    nextTaskInputFileIds: suspendedState
      ? [...(suspendedState.nextTaskInputFileIds || [])]
      : [...(window.nextTaskInputFileIds || [])],
    lastAssistantText: suspendedState ? String(suspendedState.lastAssistantText || "") : lastAssistantText,
    lastUserText: suspendedState ? String(suspendedState.lastUserText || "") : lastUserText,
    messagesScrollTop: suspendedState ? Number(suspendedState.scrollTop) || 0 : messagesEl?.scrollTop || 0,
  };
}

function restoreAssistantWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  clioTalkTemporaryMode = false;
  promptInput.value = String(state.prompt || "");
  conversation.length = 0;
  activeChatFileId = String(state.activeChatFileId || "") || null;
  if (Array.isArray(state.conversation)) {
    conversation.push(...state.conversation.map((item) => ({
      ...item,
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || ""),
    })));
  }
  compressedConversationMemory = {
    text: String(state.compressedConversationMemory?.text || ""),
    sourceMessages: Number(state.compressedConversationMemory?.sourceMessages || 0),
    updatedAt: String(state.compressedConversationMemory?.updatedAt || ""),
  };
  window.nextTaskInputFileIds = new Set(
    Array.isArray(state.nextTaskInputFileIds) ? state.nextTaskInputFileIds : []
  );
  lastAssistantText = String(state.lastAssistantText || "");
  lastUserText = String(state.lastUserText || "");
  messagesEl.replaceChildren();
  conversation.forEach((item, index) => addMessage(item.role, item.content, {
    messageRecord: item,
    messageIndex: index,
    grounding: item.grounding || null,
  }));
  renderClioTalkWelcome();
  renderAttachedClips();
  renderClioTalkRunAssembly();
  requestAnimationFrame(() => {
    messagesEl.scrollTop = Number(state.messagesScrollTop) || messagesEl.scrollHeight;
  });
  if (typeof updateMenuState === "function") updateMenuState();
  return true;
}

function captureTeachTextWorkingSession() {
  return {
    projectId: activeProjectId,
    activeTextFileId,
    name: teachTextNameInput?.value || "",
    folder: teachTextFolderInput?.value || "",
    body: teachTextBodyInput?.value || "",
    statusKey: teachTextStatusEl?.dataset.statusKey || "",
    fileLabel: teachTextFileLabel,
    workflowState: teachTextWorkflowState,
    documentRole: teachTextDocumentRole,
    editor: captureTextControlWorkingSession(teachTextBodyInput),
  };
}

function restoreTeachTextWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  activeTextFileId = state.activeTextFileId || null;
  teachTextDocumentRole = state.documentRole || teachTextDocumentRole || "manuscript";
  teachTextNameInput.value = String(state.name || "");
  teachTextFolderInput.value = String(state.folder || "");
  teachTextBodyInput.value = String(state.body || "");
  teachTextFileLabel = normalizeFileLabel(state.fileLabel || "");
  setTeachTextWorkflowState(state.workflowState || teachTextFileLabel || "draft");
  setTeachTextStatus(state.statusKey || (teachTextBodyInput.value ? "modified" : "unsaved"));
  if (typeof syncTeachTextLabelControl === "function") syncTeachTextLabelControl();
  if (typeof syncTeachTextPreview === "function") syncTeachTextPreview();
  if (typeof updateTeachTextBoundaries === "function") updateTeachTextBoundaries();
  if (typeof updateTeachTextDeskState === "function") updateTeachTextDeskState();
  requestAnimationFrame(() => {
    restoreTextControlWorkingSession(teachTextBodyInput, state.editor || state, { windowName: "teachText" });
  });
  return true;
}

function captureFileFloppyWorkingSession() {
  return {
    projectId: mountedTextDisk.projectId,
    mountedTextDisk: cloneWorkingSessionValue(mountedTextDisk, {
      files: [],
      fileBodies: {},
      fileDiagnostics: {},
      fileSources: {},
      chunks: 0,
      projectId: null,
    }),
    selectedMountedFile,
    selectedMountedFileNames: [...selectedMountedFileNames],
  };
}

function restoreFileFloppyWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  const disk = state.mountedTextDisk || {};
  mountedTextDisk.files = Array.isArray(disk.files) ? [...disk.files] : [];
  mountedTextDisk.fileBodies = { ...(disk.fileBodies || {}) };
  mountedTextDisk.fileDiagnostics = { ...(disk.fileDiagnostics || {}) };
  mountedTextDisk.fileSources = { ...(disk.fileSources || {}) };
  mountedTextDisk.chunks = Number(disk.chunks || 0);
  mountedTextDisk.projectId = disk.projectId || state.projectId || null;
  selectedMountedFile = state.selectedMountedFile || mountedTextDisk.files[0] || null;
  selectedMountedFileNames.clear();
  (Array.isArray(state.selectedMountedFileNames) ? state.selectedMountedFileNames : [selectedMountedFile])
    .filter(Boolean)
    .forEach((name) => selectedMountedFileNames.add(name));
  if (typeof updateFilePickerLabels === "function") updateFilePickerLabels();
  if (typeof renderMountedTextDisk === "function") renderMountedTextDisk();
  return true;
}

function clearFileFloppyWorkingSession(state = {}, options = {}) {
  if (!options.projectId || state.projectId !== options.projectId) return state;
  return undefined;
}

function captureReaderWorkingSession() {
  if (typeof captureActiveReaderTabState === "function") captureActiveReaderTabState();
  return {
    projectId: activeProjectId,
    currentReaderPage: cloneWorkingSessionValue(currentReaderPage, null),
    currentReaderClipCount,
    readerUrl: readerUrlInput?.value || "",
    scrollTop: readerContentEl?.scrollTop || 0,
  };
}

async function restoreReaderWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  await window.AISystem6Runtime?.restoreApplication?.("reader", state);
  if (typeof renderReaderTabs === "function") renderReaderTabs();
  if (state.currentReaderPage?.text) {
    await openReaderDocument(state.currentReaderPage);
    requestAnimationFrame(() => {
      readerContentEl.scrollTop = Number(state.scrollTop) || 0;
    });
  } else if (
    typeof openReaderDocumentTab === "function"
    && typeof activeReaderTab === "function"
    && activeReaderTab()
  ) {
    openReaderDocumentTab(activeReaderTab().id);
  }
  if (readerUrlInput) readerUrlInput.value = String(state.readerUrl || "");
  currentReaderClipCount = Number(state.currentReaderClipCount || currentReaderClipCount || 0);
  return true;
}

function captureTimeMachineWorkingSession() {
  return window.AISystem6TimeMachine?.captureSession?.() || {
    projectId: activeProjectId,
    activeTabId: "",
  };
}

async function restoreTimeMachineWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  await ensureTimeMachineModule();
  return !!window.AISystem6TimeMachine?.restoreSession?.(state);
}

function captureWritingFlowWorkingSession() {
  return {
    projectId: activeProjectId,
    toolsShaded: writingToolsPanelEl?.classList.contains("is-shaded") || false,
    toolsViewMode: writingToolsViewMode,
    selectedDraftIndex,
    questionSheet: questionSheetBodyInput?.value || "",
    outline: outlineContentEl?.value || "",
    draftTitle: draftTitleInput?.value || "",
    draftBody: draftBodyInput?.value || "",
    draftSection: draftSectionSelectEl?.value || "",
    questionEditor: captureTextControlWorkingSession(questionSheetBodyInput),
    outlineEditor: captureTextControlWorkingSession(outlineContentEl),
    draftEditor: captureTextControlWorkingSession(draftBodyInput),
  };
}

function restoreWritingFlowWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  writingToolsPanelEl?.classList.toggle("is-shaded", !!state.toolsShaded);
  if (["small-icon", "icon"].includes(state.toolsViewMode)) writingToolsViewMode = state.toolsViewMode;
  if (typeof applyWritingToolsViewMode === "function") applyWritingToolsViewMode();
  if (typeof syncWritingToolsShadeToggle === "function") syncWritingToolsShadeToggle();
  selectedDraftIndex = Number.isInteger(state.selectedDraftIndex) ? state.selectedDraftIndex : selectedDraftIndex;
  if (questionSheetBodyInput) questionSheetBodyInput.value = String(state.questionSheet || questionSheetBodyInput.value || "");
  if (outlineContentEl) outlineContentEl.value = String(state.outline || outlineContentEl.value || "");
  if (draftTitleInput) draftTitleInput.value = String(state.draftTitle || draftTitleInput.value || "");
  if (draftBodyInput) draftBodyInput.value = String(state.draftBody || draftBodyInput.value || "");
  if (draftSectionSelectEl && state.draftSection) draftSectionSelectEl.value = String(state.draftSection);
  if (typeof savePipelineData === "function") savePipelineData();
  if (typeof renderPipeline === "function") renderPipeline();
  requestAnimationFrame(() => {
    if (draftSectionSelectEl && state.draftSection) draftSectionSelectEl.value = String(state.draftSection);
    restoreTextControlWorkingSession(questionSheetBodyInput, state.questionEditor || { scrollTop: state.questionScrollTop }, { windowName: "questionSheet" });
    restoreTextControlWorkingSession(outlineContentEl, state.outlineEditor || { scrollTop: state.outlineScrollTop }, { windowName: "outline" });
    restoreTextControlWorkingSession(draftBodyInput, state.draftEditor || { scrollTop: state.draftScrollTop }, { windowName: "sectionDrafts" });
  });
  return true;
}

function captureReviewDeskWorkingSession() {
  return {
    projectId: activeProjectId,
    body: reviewDeskBodyInput?.value || "",
    dirty: !!reviewDeskDirty,
    section: reviewSectionSelectEl?.value || "",
    editor: captureTextControlWorkingSession(reviewDeskBodyInput),
    previewHidden: reviewDeskPreviewEl?.classList.contains("is-hidden") ?? true,
  };
}

function restoreReviewDeskWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  if (reviewDeskBodyInput) reviewDeskBodyInput.value = String(state.body || "");
  reviewDeskDirty = !!state.dirty;
  if (reviewSectionSelectEl && state.section) reviewSectionSelectEl.value = String(state.section);
  if (typeof syncReviewDeskPreview === "function") syncReviewDeskPreview({ force: true });
  reviewDeskPreviewEl?.classList.toggle("is-hidden", state.previewHidden !== false);
  reviewDeskBodyInput?.classList.toggle("is-hidden", state.previewHidden === false);
  if (typeof updateReviewDeskStats === "function") updateReviewDeskStats();
  requestAnimationFrame(() => {
    if (reviewSectionSelectEl && state.section) {
      reviewSectionSelectEl.value = String(state.section);
      const index = Number(reviewSectionSelectEl.value || 0);
      if (typeof selectStyleCheckSection === "function") selectStyleCheckSection(index);
      if (typeof selectClaimCheckSection === "function") selectClaimCheckSection(index);
    }
    restoreTextControlWorkingSession(reviewDeskBodyInput, state.editor || { scrollTop: state.scrollTop }, { windowName: "reviewDesk" });
  });
  return true;
}

function registerDefaultWorkingSessionAdapters() {
  registerWorkingSessionAdapter({ id: "windows", capture: captureWindowWorkingSession, restore: restoreWindowWorkingSession });
  registerWorkingSessionAdapter({ id: "selection", capture: captureSelectionWorkingSession, restore: restoreSelectionWorkingSession });
  registerWorkingSessionAdapter({ id: "assistant", capture: captureAssistantWorkingSession, restore: restoreAssistantWorkingSession });
  registerWorkingSessionAdapter({ id: "teachText", capture: captureTeachTextWorkingSession, restore: restoreTeachTextWorkingSession });
  registerWorkingSessionAdapter({
    id: "fileFloppy",
    capture: captureFileFloppyWorkingSession,
    restore: restoreFileFloppyWorkingSession,
    clear: clearFileFloppyWorkingSession,
  });
  registerWorkingSessionAdapter({ id: "reader", capture: captureReaderWorkingSession, restore: restoreReaderWorkingSession });
  registerWorkingSessionAdapter({ id: "timeMachine", capture: captureTimeMachineWorkingSession, restore: restoreTimeMachineWorkingSession });
  registerWorkingSessionAdapter({ id: "writingFlow", capture: captureWritingFlowWorkingSession, restore: restoreWritingFlowWorkingSession });
  registerWorkingSessionAdapter({ id: "reviewDesk", capture: captureReviewDeskWorkingSession, restore: restoreReviewDeskWorkingSession });
}

registerDefaultWorkingSessionAdapters();

// What a Project Hard Disk backup may carry — an allow-list, so a future
// adapter joins a backup only when someone adds it here. File Floppy stays
// out: it is temporary context, not durable Project Hard Disk state.
// Credentials, model keys, and Control Panel settings never enter a scene at
// all; they live in localStorage and the separate "settings" record.
const workingSessionBackupAdapterIds = Object.freeze([
  "windows",
  "selection",
  "assistant",
  "teachText",
  "reader",
  "timeMachine",
  "writingFlow",
  "reviewDesk",
]);

async function readWorkingSessionForBackup(projectId) {
  const snapshot = await readWorkingSessionSnapshot(workingSessionScopeKey(projectId));
  if (!isValidWorkingSessionSnapshot(snapshot)) return null;
  const adapters = {};
  workingSessionBackupAdapterIds.forEach((id) => {
    if (snapshot.adapters[id] !== undefined) adapters[id] = snapshot.adapters[id];
  });
  return {
    version: workingSessionVersion,
    savedAt: snapshot.savedAt || "",
    projectId: projectId || null,
    adapters,
  };
}
