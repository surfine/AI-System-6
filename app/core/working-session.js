// Core runtime module: working-session.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


const workingSessionStorageKey = "workingSession:v1";
const workingSessionVersion = 1;
const workingSessionAdapters = new Map();
let workingSessionSaveTimer = null;
let workingSessionSavePromise = Promise.resolve();
let workingSessionRestoreInProgress = false;
let workingSessionAutosaveInstalled = false;

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

function inlineStyleValue(el, property) {
  return el?.style?.getPropertyValue(property) || "";
}

function setInlineStyleValue(el, property, value) {
  if (!el?.style) return;
  const normalized = String(value || "");
  if (normalized) el.style.setProperty(property, normalized);
  else el.style.removeProperty(property);
}

async function readWorkingSessionSnapshot() {
  let db;
  try {
    db = await openAppDb();
    const tx = db.transaction(keyvalStoreName, "readonly");
    return await idbRequest(tx.objectStore(keyvalStoreName).get(workingSessionStorageKey));
  } catch (error) {
    console.warn("Failed to read Working Session.", error);
    return null;
  } finally {
    db?.close();
  }
}

async function writeWorkingSessionSnapshot(snapshot) {
  let db;
  try {
    db = await openAppDb();
    const tx = db.transaction(keyvalStoreName, "readwrite");
    await idbRequest(tx.objectStore(keyvalStoreName).put(snapshot, workingSessionStorageKey));
    return true;
  } catch (error) {
    console.warn("Failed to save Working Session.", error);
    return false;
  } finally {
    db?.close();
  }
}

async function deleteWorkingSessionSnapshot() {
  let db;
  try {
    db = await openAppDb();
    const tx = db.transaction(keyvalStoreName, "readwrite");
    await idbRequest(tx.objectStore(keyvalStoreName).delete(workingSessionStorageKey));
    return true;
  } catch (error) {
    console.warn("Failed to clear Working Session.", error);
    return false;
  } finally {
    db?.close();
  }
}

function captureWorkingSessionSnapshot() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
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
  return {
    version: workingSessionVersion,
    savedAt: new Date().toISOString(),
    projectId: activeProjectId || project?.id || null,
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
  workingSessionSavePromise = workingSessionSavePromise
    .catch(() => {})
    .then(() => writeWorkingSessionSnapshot(snapshot));
  return workingSessionSavePromise;
}

async function clearWorkingSession(options = {}) {
  clearTimeout(workingSessionSaveTimer);
  workingSessionSaveTimer = null;
  const projectId = options.projectId || null;
  if (!projectId) return deleteWorkingSessionSnapshot();

  const snapshot = await readWorkingSessionSnapshot();
  if (!snapshot || snapshot.projectId === projectId) return deleteWorkingSessionSnapshot();

  let changed = false;
  const adapters = { ...(snapshot.adapters || {}) };
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
  return writeWorkingSessionSnapshot({
    ...snapshot,
    savedAt: new Date().toISOString(),
    adapters,
  });
}

function isValidWorkingSessionSnapshot(snapshot) {
  return snapshot
    && snapshot.version === workingSessionVersion
    && snapshot.adapters
    && typeof snapshot.adapters === "object";
}

async function restoreWorkingSession() {
  const snapshot = await readWorkingSessionSnapshot();
  if (!isValidWorkingSessionSnapshot(snapshot)) return false;
  if (snapshot.projectId && !projects.some((project) => project.id === snapshot.projectId && !project.archived)) {
    await clearWorkingSession();
    return false;
  }

  workingSessionRestoreInProgress = true;
  let restored = false;
  try {
    if (snapshot.projectId) {
      activeProjectId = snapshot.projectId;
      selectedProjectId = snapshot.projectId;
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

  document.addEventListener("input", (event) => {
    if (event.target?.closest?.("input, textarea, select, [contenteditable='true']")) {
      scheduleWorkingSessionSave();
    }
  }, true);
  document.addEventListener("change", () => scheduleWorkingSessionSave(), true);
  document.addEventListener("selectionchange", () => scheduleWorkingSessionSave(900));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWorkingSessionSave();
  });
  window.addEventListener("pagehide", () => {
    flushWorkingSessionSave();
  });
  window.addEventListener("beforeunload", () => {
    flushWorkingSessionSave();
  });
}

function captureWindowWorkingSession() {
  const windows = Array.from(document.querySelectorAll(".window"))
    .filter((win) => {
      const name = win.dataset.window || "";
      return name && !["about", "saveChat"].includes(name);
    })
    .map((win) => ({
      name: win.dataset.window,
      appId: getWindowAppId(win),
      visible: !win.classList.contains("is-hidden"),
      appHidden: win.classList.contains("is-app-hidden"),
      active: win.classList.contains("is-active"),
      collapsed: win.classList.contains("is-collapsed"),
      desklet: win.classList.contains("is-desklet"),
      zoomed: win.dataset.zoomed === "true",
      userPositioned: win.dataset.userPositioned === "true",
      layoutGroup: win.dataset.layoutGroup || "",
      zIndex: workingSessionNumber(win.style.zIndex, 0),
      frame: {
        left: inlineStyleValue(win, "left"),
        top: inlineStyleValue(win, "top"),
        right: inlineStyleValue(win, "right"),
        width: inlineStyleValue(win, "width"),
        height: inlineStyleValue(win, "height"),
        maxHeight: inlineStyleValue(win, "max-height"),
        transform: inlineStyleValue(win, "transform"),
      },
      restoreFrame: {
        left: win.dataset.restoreLeft || "",
        top: win.dataset.restoreTop || "",
        width: win.dataset.restoreWidth || "",
        height: win.dataset.restoreHeight || "",
      },
    }));
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

function applyWindowSessionFrame(win, frame = {}) {
  if (!win || (typeof isPortraitDocumentFlow === "function" && isPortraitDocumentFlow())) return;
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

  setInlineStyleValue(win, "width", width !== null ? `${clampWorkingSessionNumber(width, 180, maxWidth, 360)}px` : frame.width || "");
  setInlineStyleValue(win, "height", height !== null ? `${clampWorkingSessionNumber(height, 120, maxHeight, 320)}px` : frame.height || "");
  setInlineStyleValue(win, "left", left !== null ? `${clampWorkingSessionNumber(left, 0, Math.max(0, maxWidth - 80), 18)}px` : frame.left || "");
  setInlineStyleValue(win, "top", top !== null ? `${clampWorkingSessionNumber(top, 0, Math.max(0, maxHeight - 40), 18)}px` : frame.top || "");
  setInlineStyleValue(win, "right", frame.right || "auto");
  setInlineStyleValue(win, "max-height", frame.maxHeight || "");
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
    .filter((entry) => entry?.visible && getWindow(entry.name))
    .sort((a, b) => workingSessionNumber(a.zIndex, 0) - workingSessionNumber(b.zIndex, 0));

  for (const entry of visibleWindows) {
    await openWindow(entry.name, { skipFinderMode: true, skipPlacement: true, skipFocus: true });
    const win = getWindow(entry.name);
    if (!win) continue;
    win.dataset.app = entry.appId || getWindowAppId(win);
    ensureRunningApp(win.dataset.app, entry.name);
    win.classList.toggle("is-app-hidden", !!entry.appHidden);
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
    const quickDraftWidth = Number(String(entry.frame?.width || "").match(/^(-?\d+(?:\.\d+)?)px$/)?.[1] || 0);
    if (entry.name === "quickDraft" && (!entry.frame?.width || quickDraftWidth < 360)) {
      requestAnimationFrame(() => maximizeWindow(win));
    }
    if (entry.zIndex) setWindowLayerZ(win, entry.zIndex);
  }

  const hiddenEntries = windows.filter((entry) => entry?.visible && entry.appHidden);
  hiddenEntries.forEach((entry) => {
    if (entry.appId) hiddenAppIds.add(entry.appId);
  });

  const activeName = state.activeWindowName || visibleWindows.find((entry) => entry.active)?.name || visibleWindows.at(-1)?.name;
  const activeWin = activeName ? getWindow(activeName) : null;
  if (activeWin && !activeWin.classList.contains("is-hidden")) {
    focusWindow(activeWin);
  } else if (visibleWindows.length) {
    focusWindow(getWindow(visibleWindows.at(-1).name));
  } else {
    activeAppId = "finder";
  }
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
  const suspendedState = (typeof isSideAskClioTalkActive === "function" && isSideAskClioTalkActive() && sideAskClioTalkSession)
    ? sideAskClioTalkSession
    : null;
  return {
    projectId: activeProjectId,
    prompt: suspendedState ? String(suspendedState.prompt || "") : promptInput?.value || "",
    conversation: suspendedState
      ? (Array.isArray(suspendedState.conversation) ? suspendedState.conversation : []).map((item) => ({ ...item }))
      : conversation.map((item) => ({ ...item })),
    compressedConversationMemory: suspendedState
      ? { ...suspendedState.compressedConversationMemory }
      : { ...compressedConversationMemory },
    lastAssistantText: suspendedState ? String(suspendedState.lastAssistantText || "") : lastAssistantText,
    lastUserText: suspendedState ? String(suspendedState.lastUserText || "") : lastUserText,
    messagesScrollTop: suspendedState ? Number(suspendedState.scrollTop) || 0 : messagesEl?.scrollTop || 0,
  };
}

function restoreAssistantWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  promptInput.value = String(state.prompt || "");
  conversation.length = 0;
  if (Array.isArray(state.conversation)) {
    conversation.push(...state.conversation.map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || ""),
    })));
  }
  compressedConversationMemory = {
    text: String(state.compressedConversationMemory?.text || ""),
    sourceMessages: Number(state.compressedConversationMemory?.sourceMessages || 0),
    updatedAt: String(state.compressedConversationMemory?.updatedAt || ""),
  };
  lastAssistantText = String(state.lastAssistantText || "");
  lastUserText = String(state.lastUserText || "");
  messagesEl.replaceChildren();
  conversation.forEach((item) => addMessage(item.role, item.content));
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
    selectionStart: teachTextBodyInput?.selectionStart ?? 0,
    selectionEnd: teachTextBodyInput?.selectionEnd ?? 0,
    scrollTop: teachTextBodyInput?.scrollTop || 0,
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
    const start = Math.min(Number(state.selectionStart) || 0, teachTextBodyInput.value.length);
    const end = Math.min(Number(state.selectionEnd) || start, teachTextBodyInput.value.length);
    teachTextBodyInput.setSelectionRange(start, end);
    teachTextBodyInput.scrollTop = Number(state.scrollTop) || 0;
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

function captureWritingFlowWorkingSession() {
  return {
    projectId: activeProjectId,
    selectedDraftIndex,
    questionSheet: questionSheetBodyInput?.value || "",
    outline: outlineContentEl?.value || "",
    draftTitle: draftTitleInput?.value || "",
    draftBody: draftBodyInput?.value || "",
    draftSection: draftSectionSelectEl?.value || "",
    questionScrollTop: questionSheetBodyInput?.scrollTop || 0,
    outlineScrollTop: outlineContentEl?.scrollTop || 0,
    draftScrollTop: draftBodyInput?.scrollTop || 0,
  };
}

function restoreWritingFlowWorkingSession(state = {}) {
  if (state.projectId && state.projectId !== activeProjectId) return false;
  selectedDraftIndex = Number.isInteger(state.selectedDraftIndex) ? state.selectedDraftIndex : selectedDraftIndex;
  if (questionSheetBodyInput) questionSheetBodyInput.value = String(state.questionSheet || questionSheetBodyInput.value || "");
  if (outlineContentEl) outlineContentEl.value = String(state.outline || outlineContentEl.value || "");
  if (draftTitleInput) draftTitleInput.value = String(state.draftTitle || draftTitleInput.value || "");
  if (draftBodyInput) draftBodyInput.value = String(state.draftBody || draftBodyInput.value || "");
  if (draftSectionSelectEl && state.draftSection) draftSectionSelectEl.value = String(state.draftSection);
  if (typeof savePipelineData === "function") savePipelineData();
  if (typeof renderPipeline === "function") renderPipeline();
  requestAnimationFrame(() => {
    questionSheetBodyInput.scrollTop = Number(state.questionScrollTop) || 0;
    outlineContentEl.scrollTop = Number(state.outlineScrollTop) || 0;
    draftBodyInput.scrollTop = Number(state.draftScrollTop) || 0;
  });
  return true;
}

function captureReviewDeskWorkingSession() {
  return {
    projectId: activeProjectId,
    body: reviewDeskBodyInput?.value || "",
    dirty: !!reviewDeskDirty,
    section: reviewSectionSelectEl?.value || "",
    scrollTop: reviewDeskBodyInput?.scrollTop || 0,
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
    if (reviewDeskBodyInput) reviewDeskBodyInput.scrollTop = Number(state.scrollTop) || 0;
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
  registerWorkingSessionAdapter({ id: "writingFlow", capture: captureWritingFlowWorkingSession, restore: restoreWritingFlowWorkingSession });
  registerWorkingSessionAdapter({ id: "reviewDesk", capture: captureReviewDeskWorkingSession, restore: restoreReviewDeskWorkingSession });
}

registerDefaultWorkingSessionAdapters();
