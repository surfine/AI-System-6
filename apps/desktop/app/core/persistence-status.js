// Core runtime module: persistence-status.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


const renderSignatureCache = new Map();
const storageSnapshotCache = new Map();
const storageRecordFingerprintCache = new Map();
const dirtyDeskRecords = new Map();
const deletedDeskRecords = new Map();
// Records whose deletion the disk has already confirmed. The fingerprint cache
// keeps their tombstone - that entry is what tells a late announcement apart
// from a brand new record, and dropping it made a remote delete come back - but
// the plan must not offer the same delete again on every following save. It
// costs a transaction with nothing in it, and it reports a store the desk never
// wrote.
const confirmedDeletes = new Set();
const dirtyDeskCollections = new Set();
// Conflicts are tracked per collection and id, not as one flag for the desk.
// A single boolean meant a receipt that landed cleanly could clear a
// manuscript's standing conflict, and the status bar would then claim a file
// was saved while its own write was still refused.
const deskRecordConflicts = new Map();
let lastDeskPersistenceStats = {
  storesTouched: [],
  puts: 0,
  deletes: 0,
  settingsWritten: false,
  durationMs: 0,
};
const localApiTokenSessionKey = "ai-system6-local-api-token";
let deskPersistenceWritable = true;
let controlStripCollapsed = false;

// Control Strip preferences live in one record inside the desk settings, so
// they save and restore through the existing saveDeskState() path instead of
// a second localStorage system. `enabled` mirrors settings.controlStrip (the
// master switch in Control Panel); the rest of the record owns geometry,
// order, and appearance. Legacy users only ever wrote controlStrip /
// controlStripCollapsed; restoreControlStripState() below migrates them.
const CONTROL_STRIP_STATE_VERSION = 1;

function defaultControlStripState() {
  return {
    version: CONTROL_STRIP_STATE_VERSION,
    enabled: false,
    visible: true,
    collapsed: false,
    edge: "left",
    offsetRatio: 0.9,
    expandedLength: 0,
    moduleOrder: [],
    disabledModules: [],
    scrollOffset: 0,
    hotkey: "",
  };
}

function clampControlStripNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

// Structural normalization only: id-level cleaning (unknown ids, duplicates,
// default insertion) needs the registry, so control-strip.js does that when
// it loads. This keeps malformed persisted data from ever reaching the shell.
function normalizeControlStripState(raw) {
  const fallback = defaultControlStripState();
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    version: CONTROL_STRIP_STATE_VERSION,
    enabled: source.enabled !== undefined ? source.enabled === true : fallback.enabled,
    visible: source.visible !== undefined ? source.visible !== false : fallback.visible,
    collapsed: source.collapsed === true,
    edge: source.edge === "right" ? "right" : "left",
    offsetRatio: clampControlStripNumber(source.offsetRatio, 0, 1, fallback.offsetRatio),
    expandedLength: Math.max(0, Math.round(clampControlStripNumber(source.expandedLength, 0, Number.MAX_SAFE_INTEGER, fallback.expandedLength))),
    moduleOrder: Array.isArray(source.moduleOrder)
      ? source.moduleOrder.filter((id) => typeof id === "string" && id)
      : [],
    disabledModules: Array.isArray(source.disabledModules)
      ? source.disabledModules.filter((id) => typeof id === "string" && id)
      : [],
    scrollOffset: Math.max(0, Math.round(clampControlStripNumber(source.scrollOffset, 0, Number.MAX_SAFE_INTEGER, fallback.scrollOffset))),
    hotkey: typeof source.hotkey === "string" ? source.hotkey : "",
  };
}

let controlStripState = defaultControlStripState();

function getControlStripState() {
  return controlStripState;
}

function setControlStripState(patch = {}) {
  controlStripState = normalizeControlStripState({ ...controlStripState, ...patch });
  controlStripCollapsed = controlStripState.collapsed;
  if (typeof controlStripShowInput !== "undefined" && controlStripShowInput) {
    controlStripShowInput.checked = controlStripState.enabled;
  }
  saveDeskState();
  return controlStripState;
}

function restoreControlStripState(settings) {
  const legacyEnabled = typeof settings.controlStrip === "boolean" ? settings.controlStrip : null;
  if (settings.controlStripState && typeof settings.controlStripState === "object") {
    controlStripState = normalizeControlStripState({
      ...settings.controlStripState,
      // A newer record can still arrive from a build that only wrote the
      // legacy boolean; the master switch always wins when it is present.
      ...(legacyEnabled !== null ? { enabled: legacyEnabled } : {}),
    });
  } else {
    controlStripState = {
      ...defaultControlStripState(),
      enabled: legacyEnabled === true,
      collapsed: settings.controlStripCollapsed === true,
    };
  }
  controlStripCollapsed = controlStripState.collapsed;
  if (typeof controlStripShowInput !== "undefined" && controlStripShowInput) {
    controlStripShowInput.checked = controlStripState.enabled;
  }
  return controlStripState;
}

function scheduleRenderTasks(...tasks) {
  const list=tasks.flat().filter(Boolean);
  // A task whose window is hidden or collapsed is parked instead of painted:
  // the records already moved, and the repaint is due the moment the window is
  // shown again (window-manager releases it on reveal). The runtime answers
  // which window owns a task, without reading any DOM itself.
  const runtime = window.AISystem6Runtime;
  const paintable = list.filter((task) => {
    const owner = runtime?.renderTaskOwner?.(task) || "";
    if (!owner) return true;
    const win = document.querySelector(`[data-window="${owner}"]`);
    if (!win) return true;
    if (!win.classList.contains("is-hidden") && !win.classList.contains("is-collapsed")) return true;
    runtime?.deferRenderTask?.(task);
    return false;
  });
  if(list.some(task=>!["menuState","menuStatus","aboutMacintosh","localModelState"].includes(task))&&typeof invalidateMenuActionCache=="function")invalidateMenuActionCache();
  paintable.forEach(task=>runtime?.scheduleRenderTask(task));
}

function scheduleWorkspaceRender(options = {}) {
  scheduleRenderTasks(
    options.projectLabels ? "projectLabels" : null,
    "projectDisks",
    "documents",
    "scraps",
    "trash",
    "projectCd",
    options.projectReferences ? "projectReferences" : null,
    options.mountedTextDisk ? "mountedTextDisk" : null,
    "contextPanel",
    "pipeline",
    options.readerTabs ? "readerTabs" : null,
    options.menuState ? "menuState" : null
  );
}

function scheduleStatusRender() {
  scheduleRenderTasks("menuStatus", "aboutMacintosh");
}

// Which views a record change actually touches.
//
// A committed write says which collections and ids moved (the record feed and
// the commit result both carry them), so the windows that need repainting can
// be derived instead of guessed: a receipt landing in chatFiles must not
// repaint the Trash, and a Trash change must not repaint the writing route's
// pipeline. Anything not listed here still gets picked up by the window that
// owns it when that window renders for its own reasons - this map is about not
// waking the whole desk for one record.
const deskCollectionRenderTasks = new Map([
  ["projects", ["projectLabels", "projectDisks", "documents", "projectCd", "pipeline"]],
  ["chatFiles", ["documents", "projectCd"]],
  ["chatFolders", ["documents"]],
  ["scraps", ["scraps"]],
  ["trash", ["trash"]],
  ["imageAttachments", ["documents", "pipeline"]],
]);

/**
 * Schedule only the views the touched collections own. `menuState` is always
 * included: it is the cheapest task and it is what keeps commands enabled or
 * disabled matching what is actually on the desk.
 *
 * @param {Iterable<string>} keys collection keys that changed
 * @param {{ extra?: string[], references?: boolean }} [options]
 */
function scheduleDeskCollectionRender(keys, options = {}) {
  const tasks = new Set(["menuState"]);
  for (const key of keys || []) {
    (deskCollectionRenderTasks.get(String(key)) || []).forEach((task) => tasks.add(task));
  }
  (options.extra || []).forEach((task) => tasks.add(task));
  if (options.references) tasks.add("projectReferences");
  scheduleRenderTasks([...tasks]);
}

function markDeskDirty(kind = "settings", recordId = "") {
  if (kind === "settings") {
    storageSnapshotCache.delete("settings");
    return;
  }
  if (!recordId) {
    dirtyDeskCollections.add(kind);
    return;
  }
  if (!dirtyDeskRecords.has(kind)) dirtyDeskRecords.set(kind, new Set());
  dirtyDeskRecords.get(kind).add(String(recordId));
  deletedDeskRecords.get(kind)?.delete(String(recordId));
}

function markDeskDeleted(kind, recordId) {
  if (!kind || recordId === undefined || recordId === null || recordId === "") return;
  if (!deletedDeskRecords.has(kind)) deletedDeskRecords.set(kind, new Set());
  deletedDeskRecords.get(kind).add(String(recordId));
  dirtyDeskRecords.get(kind)?.delete(String(recordId));
}

// Typing marks its own record, at the keystroke. Waiting for the autosave
// timer to notice is how a mirror window ends up judging a record by a
// fingerprint the writer had already moved past - and the guard that decides
// whether a remote version may replace it has to be true for the whole
// window in which the writer's text is newer than the disk.
function markActiveProjectDirty() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (project?.id) markDeskDirty("projects", project.id);
}

/** @param {string} key @param {string} id */
function noteDeskRecordConflict(key, id) {
  const cacheKey = String(id);
  if (!deskRecordConflicts.has(key)) deskRecordConflicts.set(key, new Set());
  const entries = deskRecordConflicts.get(key);
  if (entries.has(cacheKey)) return false;
  entries.add(cacheKey);
  refreshDeskRecordConflictStanding();
  return true;
}

/**
 * Clear only the conflicts this commit actually resolved. A conflict for a
 * record nobody wrote is not a conflict this save answered.
 * @param {{ key: string, id: any }[]} resolved
 */
function clearDeskRecordConflicts(resolved) {
  let changed = false;
  resolved.forEach(({ key, id }) => {
    const entries = deskRecordConflicts.get(key);
    if (entries?.delete(String(id))) changed = true;
  });
  if (changed) refreshDeskRecordConflictStanding();
}

function deskRecordConflictCount() {
  let count = 0;
  deskRecordConflicts.forEach((entries) => { count += entries.size; });
  return count;
}

/**
 * A commit that could not put its own change back is not a lost edit: the
 * text is on screen and the disk does not have it. Keep it visible and keep
 * it refused rather than reporting a save that did not happen.
 * @param {{ target: any[], id: string, kind: string }[]} kept
 */
function noteUnwithdrawnDeskChanges(kept) {
  const keys = new Map([
    [projects, "projects"],
    [chatFiles, "chatFiles"],
    [chatFolders, "chatFolders"],
    [scraps, "scraps"],
    [imageAttachments, "imageAttachments"],
    [projectCdItems, "projects"],
    [trashItems, "trash"],
    [projectReferences, "projects"],
  ]);
  let noted = false;
  kept.forEach((change) => {
    const key = keys.get(change.target);
    if (!key) return;
    noteDeskRecordConflict(key, change.id);
    noted = true;
  });
  if (noted && typeof setStatus === "function") setStatus(t("desk_record_conflict_status"));
}

window.AISystem6DeskPersistence = Object.freeze({
  markDirty: markDeskDirty,
  markDeleted: markDeskDeleted,
  noteRecordConflict: noteDeskRecordConflict,
  conflictCount: deskRecordConflictCount,
  /**
   * Development aid: switch on the shadow comparison between the full save
   * plan and a report-only plan, and read what the latter would have missed.
   * Off by default; reads only.
   */
  getLastStats: () => ({ ...lastDeskPersistenceStats, storesTouched: [...lastDeskPersistenceStats.storesTouched] }),
});

function settingsSnapshotPayload() {
  return {
    endpoint: endpointInput.value,
    localProvider: document.getElementById("local-provider")?.value || "lm-studio",
    localLmStudioConnectionEnabled,
    model: modelInput.value === "ai-system-main" ? "" : modelInput.value,
    modelFieldInputMode: document.getElementById("manual-model-fields")?.checked ? "manual" : "select",
    chatModel: activeChatModelIdentifier,
    localModelReady: localModelState.ready,
    searchProvider: searchProviderInput?.value || "auto",
    timeMachineProvider: typeof timeMachineProviderInput !== "undefined"
      ? timeMachineProviderInput?.value || "auto"
      : "auto",
    importerMode: importerModeInput?.value || "auto",
    ocrEngine: ocrEngineInput?.value || "auto",
    guestAgents: window.AISystem6GuestExecutor?.getApprovals?.() || {},
    mcpServers: window.AISystem6GuestExecutor?.getServers?.() || {},
    mcpDeskId: window.AISystem6GuestExecutor?.getDeskId?.() || "",
    contextLength: contextLengthInput.value,
    contextLengthByModel,
    contextLengthUserOverrides,
    contextMaxByModel,
    compressedConversationMemory,
    embeddingModel: embeddingModelInput.value,
    remember: rememberInput.checked,
    modernFonts: modernFontsInput.checked,
    classicLineIcons: classicLineIconsInput.checked,
    theme: getCurrentTheme(),
    liquidTintLevel: liquidTintLevelInput ? Number(liquidTintLevelInput.value) : 0.5,
    soundEffects: soundEffectsInput.checked,
    menuClock: menuClockInput.checked,
    // The Finder's own default: unmounted disks stay off the desk until asked
    // for, and the menu-bar switcher is how they come back.
    showUnmountedDisks: showUnmountedDisksInput?.checked === true,
    keepScreenAwake: document.getElementById("keep-screen-awake")?.checked || false,
    pauseAudioInBackground: document.getElementById("pause-audio-in-background")?.checked || false,
    controlStrip: controlStripState.enabled,
    controlStripState,
    controlStripCollapsed,
    performanceMeter: performanceMeterInput.checked,
    clioWebSearch: document.getElementById("clio-web-search")?.checked || false,
    showResetSystemMenu: showResetSystemMenuInput ? showResetSystemMenuInput.checked : true,
    language: currentLanguage,
    writerMode: false,
    projectMounted: isProjectMounted,
    clioOnboardingCompleted,
    clioProviderPreference,
    multiFinderSwitcherHintSeen,
    writingBell: getWritingBellState(),
    alarmClock: typeof getAlarmClockState === "function" ? getAlarmClockState() : null,
    puzzle: getPuzzleState(),
    pageSetup: { ...pageSetupSettings },
    notePadText: notePadTextInput.value,
    notePadPages,
    notePadPageIndex,
    notePadDestination,
    todoDaItems,
    systemNotifications: serializeSystemNotifications(),
    projectCdItems,
    clipboardText,
    clipboardSource,
    clipboardUpdatedAt,
    clipboardTranslationText,
    clipboardTranslationSourceText,
    clipboardTranslationLanguage,
    clipboardTranslationCreatedAt,
    clipboardTranslationModel,
    activeProjectId,
    startupProjectId,
    startupProjectPinned,
    workspaceProfile,
    startupEnvironment,
    startupOpenMode,
    startupSelectedApplicationAction,
    startupSelectedApplicationName,
    startupOpenedWindowNames: captureStartupOpenedWindowNames(),
    windowViewModes: { ...windowViewModes },
    excludedContextKeys: [...excludedContextKeys],
  };
}

function storageSnapshotChanged(key, payload) {
  const snapshot = JSON.stringify(payload);
  return storageSnapshotCache.get(key) !== snapshot;
}

function saveLocalApiTokenForSession() {
  if (typeof localApiTokenInput === "undefined" || !localApiTokenInput) return;
  const token = localApiTokenInput.value.trim();
  try {
    if (token) sessionStorage.setItem(localApiTokenSessionKey, token);
    else sessionStorage.removeItem(localApiTokenSessionKey);
  } catch {}
}

function collectionVersion(items = []) {
  return `${items.length};${items.map((item) => `${item.id || item.title || item.name || ""}:${item.updatedAt || item.createdAt || ""}`).join("|")}`;
}

function shouldSkipRender(name, signature) {
  const value = String(signature || "");
  if (!value) return false;
  if (renderSignatureCache.get(name) === value) {
    window.AISystem6Perf?.record("render_task", 0, { task: name, skipped: true });
    return true;
  }
  renderSignatureCache.set(name, value);
  return false;
}

async function switchLanguage() {
  const next = currentLanguage === "en" ? "zh" : "en";
  // A failed table fetch still switches the language; missing strings fall
  // back to keys instead of leaving the button dead.
  await ensureLanguageFor(next).catch(() => {});
  currentLanguage = next;
  applyLanguage();
  // applyLanguage() only reaches [data-i18n]. The accessory draws its captured
  // context from the record, so its labels are generated and have to be drawn
  // again. `typeof`, because the module is lazy.
  if (typeof renderHoldThought === "function") renderHoldThought();
  scheduleWorkspaceRender({
    readerTabs: true,
    projectReferences: true,
    mountedTextDisk: true,
    menuState: true,
  });
  scheduleStatusRender();
  renderClioTalkRunAssembly();
  window.AISystem6ControlStrip?.refreshLanguage?.();
  saveDeskState();
}

// Live progress: two guarantees that used to be one problem.
//
//   B  the route's working text becomes durable while you type, so losing the
//      write lease (or the tab) costs nothing.
//   C  every other window of the same project shows that text as it lands, so
//      a window without the pen is a second monitor rather than a frozen one.
//
// Deliberate saving is untouched, and the distinction is the point: this
// protects PROGRESS (the project record), while an explicit Save makes a FILE
// (the TeachText document). Nothing here ever reports "Saved" - claiming a
// document was filed because progress was committed would be exactly the kind
// of lie the status line was built to stop telling.
//
// C rides on B rather than mirroring keystrokes: savePipelineData() has already
// normalised every surface into the project record, so one payload after each
// commit is always coherent, and the receiver repaints through the same
// project-to-DOM sync functions the route already uses - which is where the
// "never overwrite the surface being typed in" guards already live.
const liveProgressChannelName = "ai-system6-content";
const liveProgressIdleMs = 900;
const liveProgressMaxMs = 6000;
let liveProgressChannel = null;
let liveProgressTimer = 0;
let liveProgressDeadline = 0;
let applyingMirroredText = false;

function liveProgressInstanceId() {
  return window.AISystem6WriteLease?.instanceId || "";
}

function openLiveProgressChannel() {
  if (liveProgressChannel) return liveProgressChannel;
  try {
    liveProgressChannel = new BroadcastChannel(liveProgressChannelName);
    liveProgressChannel.addEventListener("message", handleLiveProgressMessage);
  } catch {
    liveProgressChannel = null;
  }
  return liveProgressChannel;
}

// The record change feed.
//
// Every window keeps its own copy of the desk AND its own fingerprint of what
// it believes is on disk. It writes the records whose fingerprint moved, and
// deletes the records that are in its fingerprint but no longer in its array.
// That second rule is the dangerous one: a record another window created is in
// neither, so it is safe only for as long as exactly one window may write.
// Take that guarantee away and a window deletes work it never saw.
//
// So a committed write announces which records moved, and every other window
// re-reads exactly those records and merges them into its arrays AND its
// fingerprints together. Announcing ids rather than payloads keeps image
// attachments and long manuscripts off the channel, and keeps the store as the
// single source of what a record now says.
function broadcastDeskRecordChanges(plans, settingsChanged = false) {
  const changes = [];
  const deletes = [];
  plans.forEach((plan) => {
    plan.puts.forEach(({ id }) => changes.push({ key: plan.key, id }));
    plan.deletes.forEach(({ id }) => deletes.push({ key: plan.key, id }));
  });
  if (!changes.length && !deletes.length && !settingsChanged) return;
  try {
    openLiveProgressChannel()?.postMessage({
      type: "desk-records",
      from: liveProgressInstanceId(),
      changes,
      deletes,
      settingsChanged,
    });
  } catch {}
}

async function applyDeskRecordChanges(message) {
  const touched = new Map();
  const claim = (key) => {
    if (!touched.has(key)) touched.set(key, { reads: [], deletes: new Set() });
    return touched.get(key);
  };
  (message.changes || []).forEach(({ key, id }) => claim(key).reads.push(id));
  (message.deletes || []).forEach(({ key, id }) => claim(key).deletes.add(String(id)));
  const definitions = deskCollectionDefinitions().filter((definition) => touched.has(definition.key));
  const settingsChanged = message.settingsChanged === true;
  if (!definitions.length && !settingsChanged) return;

  let db;
  try {
    db = await openAppDb();
    const storeNames = definitions.map((definition) => definition.storeName);
    if (settingsChanged) storeNames.push(keyvalStoreName);
    const transaction = db.transaction(storeNames, "readonly");
    const completion = window.AISystem6StorageTransactions.transactionDone(transaction);
    // Every request this transaction needs is issued in its own event loop,
    // before anything is awaited: an async gap lets WebKit close the
    // transaction underneath the reads.
    const readStoredRecord = (store, id) => {
      if (!store || typeof store.get !== "function") return Promise.resolve({ readable: false, record: null });
      return idbRequest(store.get(id)).then((record) => ({ readable: true, record: record ?? null }));
    };
    // Through the published register rather than the module binding, so the
    // conflict a window records is the same one the save path clears.
    const noteConflict = (key, id) => {
      window.AISystem6DeskPersistence?.noteRecordConflict?.(key, id);
    };
    const reads = [];
    definitions.forEach((definition) => {
      const store = transaction.objectStore(definition.storeName);
      const state = touched.get(definition.key);
      // Announced updates AND announced deletes are re-read. A delete notice
      // is a claim about the stored record, not an order to forget the local
      // one, so the database is what decides what is there now.
      const ids = new Set([...state.reads.map(String), ...state.deletes]);
      ids.forEach((id) => {
        reads.push(readStoredRecord(store, id).then((result) => ({ key: definition.key, id, ...result })));
      });
    });
    const found = await Promise.all(reads);
    const incomingSettings = settingsChanged
      ? await idbRequest(transaction.objectStore(keyvalStoreName).get("settings"))
      : null;
    await completion;

    if (settingsChanged) {
      // A settings replay is not only a theme: applySettings() can switch the
      // active project and rebuild the route's views. Landing one on a window
      // whose settings are still on their way out is how an unsaved editor
      // gets rebound to another project, so a window with settings of its own
      // pending keeps them and records the conflict.
      const localSettingsPending = typeof settingsSnapshotPayload === "function"
        && storageSnapshotCache.get("settings") !== JSON.stringify(settingsSnapshotPayload());
      if (incomingSettings && localSettingsPending) {
        noteConflict("settings", "settings");
      } else if (incomingSettings) {
        applySettings(incomingSettings);
        storageSnapshotCache.set("settings", JSON.stringify(incomingSettings));
      } else {
        storageSnapshotCache.delete("settings");
      }
    }

    // The fingerprint cache is not "what is on disk". It is the version this
    // window's copy DESCENDS FROM - the base its next write will be checked
    // against. Keeping that distinction is the whole reason a stale window
    // cannot overwrite a newer record: a record this window is editing keeps
    // its old base even after the feed reports that disk moved, so the save
    // that follows is refused instead of silently winning.
    const bases = new Map(definitions.map((definition) => [
      definition.key,
      new Map(storageRecordFingerprintCache.get(definition.key) || []),
    ]));

    found.forEach(({ key, id, record, readable }) => {
      const definition = definitions.find((entry) => entry.key === key);
      if (!definition) return;
      const cacheKey = String(id);
      const index = definition.items.findIndex(
        (item, position) => String(deskRecordIdentity(key, item, position)) === String(id)
      );
      const local = index < 0 ? null : definition.items[index];
      // The one question that may decide whether a remote version replaces a
      // local one: does this record hold work the disk does not have? Focus
      // (document.activeElement), permission (canMutate()) and a single
      // global timer each answer a DIFFERENT question, and every one of them
      // has already said "clean" for a record with a keystroke the save had
      // not carried yet.
      const believed = bases.get(key).get(cacheKey)?.fingerprint;
      const pending = !local ? false : (
        believed === undefined
        || deskRecordFingerprint(local) !== believed
        || (typeof dirtyDeskRecords !== "undefined" && dirtyDeskRecords.get(key)?.has(cacheKey) === true)
        || (typeof deskRecordConflicts !== "undefined" && deskRecordConflicts.get(key)?.has(cacheKey) === true)
      );
      const removeLocal = () => {
        if (index >= 0) definition.items.splice(index, 1);
        bases.get(key).delete(cacheKey);
      };

      if (!record) {
        // A store this window cannot read leaves the local copy as the only
        // evidence there is: an announced delete still stands on a clean
        // record - that is what deleting from another window has to do - but
        // an announced update has nothing to say, so it is left alone.
        if (!readable && !touched.get(key).deletes.has(cacheKey)) return;
        if (pending) {
          noteConflict(key, cacheKey);
          return;
        }
        removeLocal();
        return;
      }

      // The record is on disk. A late delete notice for a record that is back
      // is an update, and is merged - or refused - exactly like one.
      if (index < 0) {
        definition.items.push(record);
        bases.get(key).set(cacheKey, { id, fingerprint: deskRecordFingerprint(record) });
        return;
      }
      // An edit this window has not saved yet outranks the feed. Keeping it is
      // what makes the refusal on the next save the user's decision rather
      // than a surprise: their own text is still on screen to compare. The
      // base is deliberately NOT advanced here - that is what turns the next
      // save into a refusal rather than an overwrite.
      if (pending) return;
      // Merge in place. Replacing the array slot would strand every reference
      // held elsewhere - getActiveProject() hands out one of these objects.
      Object.keys(local).forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(record, field)) delete local[field];
      });
      Object.assign(local, record);
      bases.get(key).set(cacheKey, { id, fingerprint: deskRecordFingerprint(record) });
    });

    bases.forEach((map, key) => storageRecordFingerprintCache.set(key, map));
    if (typeof ensureActiveProject === "function") ensureActiveProject();
    // Only the views the announced collections own. The reference list follows
    // the project record (it is read from the mounted project), so it travels
    // with "projects" rather than with every change.
    const touchedKeys = new Set();
    touched.forEach((_state, key) => touchedKeys.add(key));
    if (typeof scheduleDeskCollectionRender === "function") {
      scheduleDeskCollectionRender(touchedKeys, { references: touchedKeys.has("projects") });
    } else {
      // A context that loaded this function without the rest of the module
      // keeps the older, wider repaint rather than skipping the refresh.
      scheduleWorkspaceRender({ projectLabels: true, projectReferences: true, menuState: true });
    }
  } catch (error) {
    console.warn("Could not apply the record changes another window announced.", error);
  } finally {
    db?.close();
  }
}

function broadcastWorkingText(project) {
  if (!project?.id) return;
  try {
    openLiveProgressChannel()?.postMessage({
      type: "working-text",
      from: liveProgressInstanceId(),
      projectId: project.id,
      questionSheet: project.questionSheet || "",
      outline: project.outline || "",
      drafts: (project.drafts || []).map((draft) => ({
        id: draft?.id || "",
        title: draft?.title || "",
        body: draft?.body || "",
      })),
    });
  } catch {}
}

/**
 * The mirror between windows.
 *
 * This message used to be a version: whatever text it carried was assigned
 * onto the local project, whether or not the write behind it ever landed, and
 * a window with its own unsaved edits simply lost them. It is a HINT now.
 * The message says "this project moved"; the window re-reads the stored
 * record through the same entry point every other committed change uses, and
 * that path keeps a record with pending local edits while merging a clean
 * one. A clean window still refreshes at once; a window that has not carried
 * its own keystrokes to the disk keeps them, and the record it did not write
 * never advances the base its next save is measured against.
 *
 * The repaint needs nothing new: the desk render pipeline rebuilds the
 * Question Sheet, Outline, Draft and TeachText surfaces from the record.
 */
function applyMirroredWorkingText(message) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project || project.id !== message.projectId) return;
  if (typeof applyDeskRecordChanges !== "function") return;
  applyDeskRecordChanges({ changes: [{ key: "projects", id: project.id }], deletes: [] })
    .catch((error) => {
      console.warn("Mirrored working text could not be refreshed from the stored record.", error);
    });
}

// A mirrored write goes through the input event so the markdown overlay
// repaints with it; a silent value assignment would leave the painted layer
// showing the previous text under a correct textarea. Nothing in the app calls
// this any more -- the mirror refreshes through applyMirroredWorkingText above
// -- but the review harness in ai-system6-review-tests extracts it by name and
// asserts beside it that a mirrored message never overwrites a pending local
// edit. It stays until that harness asserts the record-feed path instead; see
// the compatibility table in docs/DEVELOPMENT.md.
function setMirroredEditorValue(element, text) {
  if (!element || element.value === text) return;
  const scrollTop = element.scrollTop;
  element.value = text;
  element.scrollTop = scrollTop;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleLiveProgressMessage(event) {
  const message = event?.data;
  if (!message || !message.from || message.from === liveProgressInstanceId()) return;
  if (message.type === "desk-write-request") {
    handleProxiedDeskWriteRequest(message).catch((error) => {
      console.warn("A write from another window could not be completed.", error);
    });
    return;
  }
  if (message.type === "desk-write-reply") {
    handleProxiedDeskWriteReply(message);
    return;
  }
  if (message.type === "desk-records") {
    applyDeskRecordChanges(message).catch((error) => {
      console.warn("Record changes from another window could not be applied.", error);
    });
    return;
  }
  if (message.type !== "working-text") return;
  // The guard stops the repaint's own input events from bouncing straight back
  // out as a new broadcast.
  applyingMirroredText = true;
  try {
    applyMirroredWorkingText(message);
  } catch (error) {
    console.warn("Mirrored working text could not be applied.", error);
  } finally {
    applyingMirroredText = false;
  }
}

function commitWorkingProgress() {
  liveProgressTimer = 0;
  liveProgressDeadline = 0;
  if (typeof savePipelineData !== "function") return;
  // savePipelineData normalises every surface into the project record and
  // queues the save. The "this landed" announcement belongs to that save and
  // rides it (see persistDeskState), never to the keystroke before it: telling
  // the other windows about text the disk does not have is how an uncommitted
  // answer becomes a version.
  savePipelineData();
}

// Commit after a short pause, and never later than liveProgressMaxMs into a
// continuous run - so a writer who does not stop still cannot outrun the disk.
function noteWorkingProgress() {
  if (applyingMirroredText) return;
  const now = Date.now();
  if (!liveProgressDeadline) liveProgressDeadline = now + liveProgressMaxMs;
  clearTimeout(liveProgressTimer);
  liveProgressTimer = setTimeout(commitWorkingProgress, Math.max(0, Math.min(liveProgressIdleMs, liveProgressDeadline - now)));
}

function flushWorkingProgress() {
  if (!liveProgressTimer) return;
  clearTimeout(liveProgressTimer);
  commitWorkingProgress();
}

// Subscribe at load, not on the first send. A window without the pen never
// broadcasts, so a channel opened lazily by broadcastWorkingText() would leave
// exactly the windows that need the mirror as the ones not listening for it.
openLiveProgressChannel();

// Leaving is the one moment a pending commit cannot wait for its timer.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushWorkingProgress();
});
window.addEventListener("pagehide", () => flushWorkingProgress());

// Deduped on the payload: saveDeskState is called from many places and often
// twice for one action, and a mirror that repaints identical text for no
// reason is a scroll position lost for no reason.
let lastAnnouncedWorkingText = "";

function announceWorkingText() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project?.id) return;

  const fingerprint = `${project.id}\u0000${project.questionSheet || ""}\u0000${project.outline || ""}`
    + `\u0000${(project.drafts || []).map((draft) => `${draft?.id || ""}:${draft?.body || ""}`).join("\u0001")}`;
  if (fingerprint === lastAnnouncedWorkingText) return;
  lastAnnouncedWorkingText = fingerprint;
  broadcastWorkingText(project);
}

function saveDeskState() {
  if (!deskPersistenceWritable) return Promise.resolve(false);
  // A window without the lease is no longer a window that cannot save. It
  // hands the write to the window that holds the connection, so the only
  // reason to refuse here is that the desk was never successfully loaded.

  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  // Every save - a store commit, a keystroke, a settings toggle - takes the
  // same desk commit slot. Serialising only the write stage would not be
  // enough: two saves would each read the other's half-applied arrays to
  // decide what had changed. The slot is named rather than reached for
  // directly because a state-store commit already holds it and calls
  // persistDeskState() itself; awaiting this entry from in there would queue
  // behind the very task making the call.
  const queue = typeof window !== "undefined" ? window.AISystem6DeskCommits : null;
  const run = queue?.enqueue
    ? queue.enqueue(() => persistDeskState())
    : (saveDeskStatePromise || Promise.resolve()).catch(() => {}).then(() => persistDeskState());
  saveDeskStatePromise = run;
  return run;
}

// The Appearance selector (and menu / control-strip theme actions) persist
// through theme-registry's localStorage, but the desk-state record also
// carries `theme` and wins on the next boot. Keep the two sources in sync so
// a saved era (e.g. Platinum) survives a restart instead of reverting to
// Classic. restoreDeskState() re-applies with announce:false, so this
// listener never loops.
document.addEventListener("ai-system6-themechange", (event) => {
  // Theme Lab, deep links, and development previews repaint the same semantic
  // desktop but do not become the user's saved Appearance. The registry marks
  // the one transition that committed; only that transition may update the
  // desk record. `saveDesk:false` is used by restore/boot paths that already
  // own persistence ordering.
  if (event.detail?.committed !== true || event.detail?.saveDesk === false) return;
  saveDeskState();
});

function scheduleSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    scheduleStatusRender();
    saveDeskState();
  }, 750);
}

function setControlTab(name) {
  // Cloud is the one-step path (key + Connect); local LM Studio needs a
  // separate app already running, so it's more often the dead end on a first
  // look. Default to cloud, unless local is the one actually in use.
  const localInUse = typeof localModelState !== "undefined"
    && (localModelState?.ready || localModelState?.loaded);
  const target = String(name || (localInUse ? "local" : "cloud"));
  document.querySelectorAll(".control-panel [data-control-tab]").forEach((button) => {
    const active = button.dataset.controlTab === target;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".control-panel [data-control-panel]").forEach((panel) => {
    const active = panel.dataset.controlPanel === target;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();

  // Control Panel has one stable desktop size. Clear any old session height
  // left by the former content-sized behavior while preserving its user-chosen
  // position; the portrait rule can still choose its own automatic height.
  const win = document.querySelector(".control-panel");
  if (win) {
    win.style.height = "";
    win.style.maxHeight = "";
    scheduleWorkingSessionSave?.();
  }
}

function wireControlTabs() {
  document.querySelectorAll(".control-panel [data-control-tab]").forEach((button) => {
    button.addEventListener("click", () => setControlTab(button.dataset.controlTab));
  });
  // Local model readiness is not known yet this early in boot; the markup's
  // own default (Cloud) stands until the window is actually opened, where
  // setControlTab() re-picks with real state.
}

let modelRefreshPromise = null;

async function refreshControlPanelModels() {
  if (modelRefreshPromise || localModelState.running) return modelRefreshPromise;
  modelRefreshPromise = findLmStudioModels({ automatic: true })
    .finally(() => {
      modelRefreshPromise = null;
    });
  return modelRefreshPromise;
}

async function findLmStudioModels(options = {}) {
  setControlLoading(findModelsButton, true, t("models_loading"));
  modelPickerStatusEl.textContent = t("models_loading");
  updateLocalModelState({ server: false, models: false, loaded: false, ready: false, task: t("models_loading") });

  try {
    if (!localLmStudioConnectionEnabled) {
      const connected = await connectLocalLmStudio({ toggle: false, silent: options.automatic === true });
      if (!connected) return;
    }
    const data = await window.AISystem6LocalLMStudio.listModels();

    const chatModels = Array.isArray(data.chatModels) ? data.chatModels : Array.isArray(data.models) ? data.models : [];
    const embeddingModels = Array.isArray(data.embeddingModels) ? data.embeddingModels : [];
    setModelPickerOptions(chatModels, embeddingModels);
    modelPickerStatusEl.textContent = t("models_found_split", chatModels.length, embeddingModels.length);
    const loadedModel = syncLoadedLocalModel(data, chatModels);
    const selectedModel = findMatchingModel(chatModels, modelInput.value.trim());
    const loadedMatchesSelected = !!(loadedModel && selectedModel && (
      loadedModel.id === selectedModel.id || loadedModel.name === selectedModel.name
    ));
    const autoLoadReady = !!(data.autoLoad && selectedModel);
    updateLocalModelState({
      server: true,
      models: chatModels.length > 0,
      selected: !!modelInput.value.trim(),
      loaded: loadedMatchesSelected || autoLoadReady,
      ready: loadedMatchesSelected || autoLoadReady,
      task: "",
    });
    renderLocalConnectionStatus("ready", data);
    if (loadedModel) {
      modelPickerStatusEl.textContent = loadedMatchesSelected
        ? t("models_auto_selected", loadedModel.name || loadedModel.id)
        : `${t("models_found_split", chatModels.length, embeddingModels.length)} · Loaded: ${loadedModel.name || loadedModel.id}`;
    }

    if (!loadedModel && (chatModels.length === 1 || (chatModels.length && !chatModels.some((model) => model.id === modelInput.value.trim())))) {
      const selected = chatModels[0];
      activeChatModelIdentifier = "";
      modelInput.value = selected.id;
      if (localModelSelectEl()) localModelSelectEl().value = selected.id;
      updateContextMaxForCurrentModel();
      modelPickerStatusEl.textContent = t("models_auto_selected", selected.name || selected.id);
      updateLocalModelState({ selected: true });
      scheduleSettingsSave();
    } else if (chatModels.length) {
      updateLocalModelState({ selected: !!modelInput.value.trim() });
    }
  } catch (error) {
    setModelPickerOptions([], []);
    modelPickerStatusEl.textContent = t("models_failed", friendlyLocalModelError(error.message));
    updateLocalModelState({ server: false, models: false, selected: !!modelInput.value.trim(), loaded: false, ready: false, task: "" });
  } finally {
    setControlLoading(findModelsButton, false);
  }
}

async function loadSelectedLmStudioModel() {
  const model = modelInput.value.trim();
  if (!model) {
    loadModelStatusEl.textContent = t("models_failed", t("no_models_found"));
    return;
  }
  const contextConfig = getContextLoadConfig();
  if (!contextConfig) return;

  setControlLoading(loadModelButton, true, t("load_model_loading"));
  loadModelStatusEl.textContent = t("load_model_loading");
  updateLocalModelState({ server: true, selected: true, loaded: false, ready: false, running: true, task: t("load_model_loading") });

  try {
    if (!localLmStudioConnectionEnabled) {
      const connected = await connectLocalLmStudio({ toggle: false });
      if (!connected) throw new Error("lmstudio_server_offline");
    }
    const data = await window.AISystem6LocalLMStudio.loadModel(model, {
      contextLength: contextConfig.contextLength,
    });
    const embeddingModel = embeddingModelInput?.value?.trim() || "";
    let embeddingWarning = "";
    if (embeddingModel) {
      try {
        await window.AISystem6LocalLMStudio.loadModel(embeddingModel);
      } catch (error) {
        embeddingWarning = error?.message || String(error);
      }
    }

    activeChatModelIdentifier = "";
    const loadedModel = data.model || model;
    const loadedContext = data.context_length || contextConfig.contextLength;
    modelInput.value = loadedModel;
    contextLengthInput.value = String(loadedContext);
    if (data.max_context_length) {
      contextMaxByModel[modelContextKey(loadedModel)] = {
        max: data.max_context_length,
        source: data.max_context_source || contextConfig.maxContextSource,
      };
      updateContextMaxForCurrentModel();
    }
    loadModelStatusEl.textContent = embeddingWarning
      ? `${t("load_model_done", loadedModel, loadedContext)} ${t("models_failed", embeddingWarning)}`
      : t("load_model_done", loadedModel, loadedContext);
    updateLocalModelState({ server: true, models: true, selected: true, loaded: true, ready: true, running: false, task: "" });
    scheduleSettingsSave();
  } catch (error) {
    const message = friendlyLocalModelError(error.message);
    loadModelStatusEl.textContent = t("load_model_failed", message);
    updateLocalModelState({ server: message !== t("lm_studio_unavailable_short"), loaded: false, ready: false, running: false, task: "" });
  } finally {
    setControlLoading(loadModelButton, false);
  }
}

async function setupLocalLmStudioModel() {
  if (!setupLocalModelButton) return;
  setControlLoading(setupLocalModelButton, true, t("load_model_loading"));
  setControlLoading(findModelsButton, true, t("models_loading"));
  try {
    const connected = await connectLocalLmStudio({ toggle: false });
    if (connected && modelInput.value.trim()) await loadSelectedLmStudioModel();
  } finally {
    setControlLoading(setupLocalModelButton, false);
    setControlLoading(findModelsButton, false);
  }
}

// One list of the durable collections. Save, restore and the cross-window
// change feed all walk the same set; three copies of it is how one of them
// quietly stops covering a store.
function deskCollectionDefinitions() {
  return [
    { key: "projects", storeName: projectsStoreName, items: projects },
    { key: "scraps", storeName: scrapsStoreName, items: scraps },
    { key: "trash", storeName: trashStoreName, items: trashItems },
    { key: "chatFolders", storeName: chatFoldersStoreName, items: chatFolders },
    { key: "chatFiles", storeName: chatFilesStoreName, items: chatFiles },
    { key: "imageAttachments", storeName: imageAttachmentsStoreName, items: imageAttachments },
  ];
}

function deskRecordIdentity(kind, item, index) {
  if (kind === "trash") {
    if (item._storageId === undefined || item._storageId === null || item._storageId === "") {
      item._storageId = crypto.randomUUID();
    }
    return item._storageId;
  }
  return item.id ?? `${kind}-legacy-${index}`;
}

// One definition of what a record's content IS, so the save path, the change
// feed and the conflict test never disagree about whether two copies match.
function deskRecordFingerprint(item) {
  return JSON.stringify(item);
}

/**
 * A copy of a value that is about to be written, detached from whatever the
 * live object does next.
 * @param {any} value
 */
function freezeDeskWriteValue(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

// Optimistic concurrency, one record at a time.
//
// A window may overwrite a stored record only when the stored copy still
// matches the copy this window believes it is editing - the BASE it last saw
// on disk. If the stored copy has moved, another window wrote that record
// first, and this write is refused rather than laid over the top.
//
// The base is the fingerprint cache the window already keeps, so this needs no
// revision field, no schema change and no migration. That also removes a whole
// failure class rather than patching it: a revision NUMBER has to be carried
// back into memory after every commit, and any path that drops the carry locks
// the window out of its own records forever. Asking what the record SAYS
// cannot fall behind, because the answer is recomputed from the record.
//
// The read and the write are issued from inside IndexedDB event handlers with
// no await between them, because an async gap can let WebKit close the
// transaction underneath us.
function putDeskRecordAtBase(store, plan, id, item, base, conflicts) {
  return new Promise((resolve, reject) => {
    const read = store.get(id);
    read.addEventListener("error", () => reject(read.error), { once: true });
    read.addEventListener("success", () => {
      const stored = read.result;
      // A record that used to be here and is not any more was deleted - by
      // another window, or by this one on another device. An ordinary save
      // may not put it back: carrying a base means this operation descends
      // from a version that has since been removed, and re-creating it under
      // the same id would silently undo that deletion. A record with no base
      // at all is a genuine creation and still follows the creation rule.
      if (!stored && base !== undefined) {
        conflicts.push({ key: plan.key, id: String(id) });
        resolve(null);
        return;
      }
      // A record the store has never seen is nobody's older copy. A record
      // this window has never seen on disk is compared against what it is
      // about to write, so two windows that independently created identical
      // content agree instead of fighting over it.
      const expected = base === undefined ? deskRecordFingerprint(item) : base;
      if (stored && deskRecordFingerprint(stored) !== expected) {
        conflicts.push({ key: plan.key, id: String(id) });
        resolve(null);
        return;
      }
      // Fingerprint the record at the instant it is actually written, not
      // when the plan was built. deskCollectionPlan runs synchronously before
      // this transaction opens (an await away), and this window's own code
      // can advance the same live object in that gap - a receipt write or a
      // second field edit landing before the IDB transaction starts. The put
      // below serializes whatever `item` looks like right now, so the cache
      // entry must be taken from right here too, or the cache remembers a
      // byte pattern that was never the one written and every later save is
      // refused against a base that exists nowhere - not in this window, not
      // on disk. A single-tab session has no other window to broadcast the
      // correction, so a mismatch made here never self-clears without this.
      const fingerprint = deskRecordFingerprint(item);
      let write;
      try {
        write = plan.key === "trash" ? store.put(item, id) : store.put(item);
      } catch (error) {
        // A store that refuses the request throws here, inside a success
        // listener where nothing else can catch it. Rethrowing into the event
        // loop left this promise - and the queue behind it - waiting forever.
        reject(error);
        return;
      }
      write.addEventListener("error", () => reject(write.error), { once: true });
      write.addEventListener(
        "success",
        () => resolve({ key: plan.key, cacheKey: String(id), id, fingerprint }),
        { once: true }
      );
    }, { once: true });
  });
}

// Deletes need the same fence as puts. An unconditional delete would let a
// stale window erase a record another window changed after this window last
// saw it. A record that is already gone is harmless; a record whose content
// moved is a conflict and aborts the whole transaction.
function deleteDeskRecordAtBase(store, plan, id, base, conflicts) {
  return new Promise((resolve, reject) => {
    const read = store.get(id);
    read.addEventListener("error", () => reject(read.error), { once: true });
    read.addEventListener("success", () => {
      const stored = read.result;
      if (!stored) {
        resolve();
        return;
      }
      if (base === undefined || deskRecordFingerprint(stored) !== base) {
        conflicts.push({ key: plan.key, id: String(id) });
        resolve();
        return;
      }
      let remove;
      try {
        remove = store.delete(id);
      } catch (error) {
        reject(error);
        return;
      }
      remove.addEventListener("error", () => reject(remove.error), { once: true });
      remove.addEventListener("success", () => resolve(), { once: true });
    }, { once: true });
  });
}

// Settings are one more durable record, even though they live in the keyval
// store. A full settings snapshot from another window must not silently replace
// a newer snapshot; use the same base fence as collection records.
function putSettingsAtBase(store, payload, base, conflicts) {
  return new Promise((resolve, reject) => {
    const read = store.get("settings");
    read.addEventListener("error", () => reject(read.error), { once: true });
    read.addEventListener("success", () => {
      const stored = read.result;
      // No base means "this window cannot say what version it descends from" -
      // which is what a deliberate invalidation leaves behind, and what a
      // window that has not read the desk yet has too. Requiring the two
      // snapshots to be identical then reads as a fence but behaves as a wall:
      // a settings change made after any invalidation was refused forever, so
      // a toggle the user flipped never reached the disk. The honest base for
      // a snapshot we cannot date is the disk's own copy, read here inside the
      // same transaction the write happens in.
      const matches = base === undefined
        ? true
        : !!stored && deskRecordFingerprint(stored) === base;
      if (!matches) {
        conflicts.push({ key: "settings", id: "settings" });
        resolve();
        return;
      }
      let write;
      try {
        write = store.put(payload, "settings");
      } catch (error) {
        reject(error);
        return;
      }
      write.addEventListener("error", () => reject(write.error), { once: true });
      write.addEventListener("success", () => resolve(), { once: true });
    }, { once: true });
  });
}

function deskRecordConflictError(conflicts) {
  const error = new Error("A record changed in another window; nothing was written.");
  error.code = "DESK_RECORD_CONFLICT";
  error.conflicts = conflicts;
  return error;
}

// The collections whose writers all report their own changes, so a plan may
// trust the reports instead of fingerprinting every record on the desk. Which
// ones qualify is measured, not assumed: the save-plan comparison in
// tests/e2e/scan-shadow.spec.mjs drives the app's own entry points with the
// comparison switched on, and a collection only joins this list once its
// writers have been shown to name every record they move.
//
// `projects` is deliberately absent. Project records are edited in place from
// a dozen features (the outline claim, DocMap, the dictionary, the Finder
// labels, the writing flow), and while the cheap detector below covers the
// active project, the rest of them have not been migrated yet. Trusting them
// would trade a measurable few milliseconds for a silent loss.
// Empty on purpose, and not because the mechanism is unused: this is the
// migration gate, and the first collection joins it when its scan-shadow run
// proves every writer names every record it moves. Until then the plan reads
// the bytes, because the alternative is the failure this desk has already paid
// for once — a save that reports memory as written while the disk never saw it.
//
// The lane that introduced the trust list also wrote the control that rules it
// out for now: tests/features/desk-commit-consistency.test.mjs edits a record
// in place with nothing marking it and requires the next plan to catch it, and
// tests/e2e/scan-shadow.spec.mjs says its instrument is only trustworthy
// because "an edit nobody reported has to be caught, or the run above proves
// nothing". Trusting chatFiles or the rest before their writers report would
// skip exactly that comparison, for a few milliseconds, silently.
const reportedWriterKeys = new Set();

function deskCollectionPlan(definition) {
  const previous = storageRecordFingerprintCache.get(definition.key) || new Map();
  const current = new Map();
  const puts = [];
  // Trust the writers only while nothing is measuring them: with the
  // comparison switched on the plan reads every record, because that scan is
  // the evidence that the writers are still trustworthy.
  const trustReports = reportedWriterKeys.has(definition.key)
    && window.AISystem6ScanShadow?.isEnabled?.() !== true;
  const dirtyHere = dirtyDeskRecords.get(definition.key);
  definition.items.forEach((liveItem, index) => {
    const id = deskRecordIdentity(definition.key, liveItem, index);
    const cacheKey = String(id);
    const known = previous.get(cacheKey);
    if (trustReports && known && !dirtyHere?.has(cacheKey)) {
      // Nothing reported this record and it is already on the desk: carry the
      // base forward without re-reading bytes that are, by the writers' own
      // account, unchanged. This is what makes a save cost what the edit cost.
      current.set(cacheKey, known);
      return;
    }
    // One fingerprint per record is what makes this plan incremental - only a
    // record whose bytes moved is written - and the scan is bounded by the
    // desk, not by the edit: the comparison is the scan.
    const fingerprint = deskRecordFingerprint(liveItem);
    current.set(cacheKey, { id, fingerprint });
    if (known?.fingerprint !== fingerprint || dirtyHere?.has(cacheKey)) {
      // Freeze only what this plan will write. A plan is a promise about the
      // bytes it will store, so the write may not be "whatever the live object
      // says when the transaction finally opens": typing continues while
      // IndexedDB works, and a save that reports the newest memory as written
      // claims bytes the disk never saw. Records that are not written need no
      // copy at all.
      const item = freezeDeskWriteValue(liveItem);
      puts.push({ id, item, base: known?.fingerprint });
    }
  });
  const deletes = [];
  for (const [cacheKey, cached] of previous) {
    if (current.has(cacheKey)) continue;
    if (confirmedDeletes.has(`${definition.key}:${cacheKey}`)) continue;
    deletes.push({ id: cached.id, base: cached.fingerprint });
  }
  for (const cacheKey of deletedDeskRecords.get(definition.key) || []) {
    const cached = previous.get(cacheKey);
    if (cached && !deletes.some((entry) => String(entry.id) === String(cached.id))) {
      deletes.push({ id: cached.id, base: cached.fingerprint });
    }
  }
  return { ...definition, current, puts, deletes };
}

// The window that holds the write lease holds the DATABASE CONNECTION, not the
// user's permission to type. Every other window stays editable and hands its
// finished write to the lease holder, which applies it at the fence and
// announces what moved. Ownership is a property of the plumbing, so no window
// is ever read-only and nobody has to be told to stop.
//
// This is only safe because a write carries the base each record must still
// match: a proxied write is checked exactly like a local one, and a stale one
// is refused rather than laid over the top.
async function runDeskCommit({ changedPlans, settingsPayload, settingsBase, shouldWriteSettings }) {
  const storeNames = changedPlans.map((plan) => plan.storeName);
  if (shouldWriteSettings) storeNames.push(keyvalStoreName);
  if (!storeNames.length) return [];
  const conflicts = [];
  let db;
  try {
    db = await openAppDb();
    // The transaction's own return value carries the fingerprint actually
    // written for each put - see putDeskRecordAtBase's comment on why the
    // caller cannot trust the plan's pre-transaction fingerprint instead.
    return await window.AISystem6StorageTransactions.runTransaction(
      db,
      storeNames,
      "readwrite",
      async (tx) => {
        // Queue every request synchronously before awaiting. This keeps the
        // transaction active in Safari/WebKit and avoids async gaps between
        // object-store operations.
        const writes = [];
        changedPlans.forEach((plan) => {
          const store = tx.objectStore(plan.storeName);
          plan.puts.forEach(({ id, item, base }) => {
            writes.push(putDeskRecordAtBase(store, plan, id, item, base, conflicts));
          });
          plan.deletes.forEach(({ id, base }) => {
            writes.push(deleteDeskRecordAtBase(store, plan, id, base, conflicts));
          });
        });

        if (shouldWriteSettings) {
          const settingsStore = tx.objectStore(keyvalStoreName);
          writes.push(putSettingsAtBase(settingsStore, settingsPayload, settingsBase, conflicts));
          writes.push(idbRequest(settingsStore.put(storageVersion, "storageVersion")));
        }
        const results = await Promise.all(writes);
        // One refused record refuses the whole save. Aborting is the honest
        // outcome: the caller rolls its in-memory state back, so the window
        // never keeps an edit the disk does not have.
        if (conflicts.length) throw deskRecordConflictError(conflicts);
        return results.filter((entry) => entry && entry.key && entry.cacheKey);
      }
    );
  } finally {
    db?.close();
  }
}

const deskProxyTimeoutMs = 5000;
const pendingDeskProxyWrites = new Map();

function deskWriteMustBeProxied() {
  return window.AISystem6WriteLease?.canMutate?.() !== true;
}

// Only the records travel, never the fingerprint maps: the sender keeps its own
// bookkeeping and the holder needs nothing but what to write.
function serialisableDeskPlans(changedPlans) {
  return changedPlans.map((plan) => ({
    key: plan.key,
    storeName: plan.storeName,
    puts: plan.puts.map(({ id, item, base }) => ({ id, item, base })),
    deletes: plan.deletes.map(({ id, base }) => ({ id, base })),
  }));
}

function requestProxiedDeskCommit({ changedPlans, settingsPayload, settingsBase, shouldWriteSettings }) {
  const channel = openLiveProgressChannel();
  if (!channel) {
    // No channel means no holder to ask. Refusing is the honest answer; the
    // caller rolls back rather than believing a write that never happened.
    return Promise.reject(new Error("No window is available to write for this one."));
  }
  const requestId = `${liveProgressInstanceId()}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const settle = (error, written) => {
      const pending = pendingDeskProxyWrites.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      pendingDeskProxyWrites.delete(requestId);
      if (error) reject(error);
      else resolve(written ?? null);
    };
    pendingDeskProxyWrites.set(requestId, {
      settle,
      timeoutId: setTimeout(() => {
        // Silence is not a refusal: the holder may have written the records
        // and lost only the reply. The caller checks the store before deciding
        // whether this work is still unsent.
        const error = new Error("The window that owns writing did not answer.");
        error.code = "DESK_PROXY_TIMEOUT";
        settle(error);
      }, deskProxyTimeoutMs),
    });
    try {
      channel.postMessage({
        type: "desk-write-request",
        from: liveProgressInstanceId(),
        requestId,
        plans: serialisableDeskPlans(changedPlans),
        settingsPayload: shouldWriteSettings ? settingsPayload : null,
        settingsBase: shouldWriteSettings ? settingsBase : undefined,
        shouldWriteSettings,
      });
    } catch (error) {
      settle(error);
    }
  });
}

async function handleProxiedDeskWriteRequest(message) {
  // Only the window that can actually write answers. Every other window
  // ignores the request, so exactly one reply comes back.
  if (window.AISystem6WriteLease?.canMutate?.() !== true) return;
  const changedPlans = (message.plans || []).map((plan) => ({ ...plan }));
  let failure = null;
  let written = null;
  try {
    written = await runDeskCommit({
      changedPlans,
      settingsPayload: message.settingsPayload,
      settingsBase: message.settingsBase,
      shouldWriteSettings: message.shouldWriteSettings === true,
    });
  } catch (error) {
    failure = error?.code === "DESK_RECORD_CONFLICT"
      ? { code: error.code, conflicts: error.conflicts }
      : { code: "WRITE_FAILED", message: String(error?.message || error) };
  }
  try {
    openLiveProgressChannel()?.postMessage({
      type: "desk-write-reply",
      from: liveProgressInstanceId(),
      requestId: message.requestId,
      failure,
      // The fingerprints the transaction actually wrote. The sender advances
      // its base to these and to nothing newer, so a reply that arrives after
      // the sender kept typing does not make the newer text count as saved.
      written,
    });
  } catch {}
  if (failure) return;
  // The holder wrote records it does not have in memory. It has to learn them
  // the same way every other window does, or its own next save reasons from a
  // copy the disk has already moved past.
  const changes = [];
  const deletes = [];
  changedPlans.forEach((plan) => {
    plan.puts.forEach(({ id }) => changes.push({ key: plan.key, id }));
    plan.deletes.forEach(({ id }) => deletes.push({ key: plan.key, id }));
  });
  broadcastDeskRecordChanges(changedPlans, message.shouldWriteSettings === true);
  await applyDeskRecordChanges({ changes, deletes });
}

function handleProxiedDeskWriteReply(message) {
  const pending = pendingDeskProxyWrites.get(message.requestId);
  if (!pending) return;
  if (!message.failure) {
    pending.settle(null, message.written);
    return;
  }
  if (message.failure.code === "DESK_RECORD_CONFLICT") {
    pending.settle(deskRecordConflictError(message.failure.conflicts || []));
    return;
  }
  pending.settle(new Error(message.failure.message || "The write could not be completed."));
}

/**
 * Did the write this plan describes actually land? A proxied write whose
 * reply went missing leaves the result unknown, and the store is the only
 * party that can settle it. Every record the plan would have written must
 * match and every delete must be gone: a partial match is not a success, and
 * running the write again over a committed one is worse than waiting.
 *
 * @param {{ changedPlans: any[], shouldWriteSettings?: boolean, settingsPayload?: any }} payload
 * @returns {Promise<any[] | null>} the fingerprints that are on the disk, or null when they are not
 */
async function deskPlansLandedOnDisk({ changedPlans, shouldWriteSettings, settingsPayload }) {
  const storeNames = changedPlans.map((plan) => plan.storeName);
  if (shouldWriteSettings) storeNames.push(keyvalStoreName);
  if (!storeNames.length) return [];
  let db;
  try {
    db = await openAppDb();
    const transaction = db.transaction(storeNames, "readonly");
    const completion = window.AISystem6StorageTransactions.transactionDone(transaction);
    const checks = [];
    changedPlans.forEach((plan) => {
      const store = transaction.objectStore(plan.storeName);
      plan.puts.forEach(({ id, item }) => {
        const fingerprint = deskRecordFingerprint(item);
        checks.push(idbRequest(store.get(id)).then((stored) => ({
          ok: Boolean(stored) && deskRecordFingerprint(stored) === fingerprint,
          entry: { key: plan.key, cacheKey: String(id), id, fingerprint },
        })));
      });
      plan.deletes.forEach(({ id }) => {
        checks.push(idbRequest(store.get(id)).then((stored) => ({ ok: !stored, entry: null })));
      });
    });
    if (shouldWriteSettings) {
      const expected = JSON.stringify(settingsPayload);
      checks.push(idbRequest(transaction.objectStore(keyvalStoreName).get("settings")).then((stored) => ({
        ok: Boolean(stored) && JSON.stringify(stored) === expected,
        entry: null,
      })));
    }
    const results = await Promise.all(checks);
    await completion;
    if (!results.length || results.some((result) => !result.ok)) return null;
    return results.map((result) => result.entry).filter(Boolean);
  } catch (error) {
    console.warn("A proxied write could not be confirmed against the store.", error);
    return null;
  } finally {
    db?.close();
  }
}

// Proxying is for the case where another LIVE window holds the connection. A
// window that merely lost the lease - the only one open, a heartbeat that
// lapsed while it was backgrounded - must not sit waiting for an answer from
// nobody, so it tries to take the connection first and only hands the write
// away when somebody else really has it.
async function commitDeskPlansWhereverTheConnectionIs(payload) {
  if (deskWriteMustBeProxied()) {
    await window.AISystem6WriteLease?.reconcile?.().catch?.(() => null);
  }
  if (!deskWriteMustBeProxied()) {
    return await runDeskCommit(payload);
  }
  try {
    // A proxied write's cache correction rides the existing multi-window
    // path: the holder writes at the fence, tells this window which
    // fingerprints it stored, and re-syncs its own copy. The reply is the
    // answer to THIS request (same requestId), so the base advances to what
    // this commit wrote and not to whatever a later broadcast happens to
    // carry.
    return await requestProxiedDeskCommit(payload);
  } catch (error) {
    // A timeout is not a "no". The holder may have committed and lost only
    // the reply, and treating that as "nothing happened" is how one committed
    // write gets performed a second time - a delete of a re-created record,
    // an insert of a receipt that already exists. Ask the store itself before
    // deciding this work is still unsent.
    if (error?.code === "DESK_PROXY_TIMEOUT") {
      const landed = await deskPlansLandedOnDisk(payload);
      if (landed) return landed;
    }
    // A refusal is an answer and stands. Silence is not. A holder that does
    // not answer is a holder in name only - it may have closed between the
    // request and the reply, or be wedged - and leaving every other window
    // unable to write because of it is exactly the failure this whole change
    // exists to remove. So ask for the lease through the safe handshake, which
    // makes a live holder flush and release before it lets go, and write here.
    if (error?.code === "DESK_RECORD_CONFLICT") throw error;
    const takeover = await window.AISystem6WriteLease?.requestTakeover?.().catch?.(() => null);
    if (!takeover?.ok || deskWriteMustBeProxied()) throw error;
    return await runDeskCommit(payload);
  }
}

// A refused save has two edges. While it stands, no surface may claim the
// work is saved (the capsule and the desk cells would contradict the status
// bar); when the record's own commit succeeds, every one of those surfaces
// must return to normal. The state is per record and the flag is derived from
// it: one boolean meant any successful save cleared every conflict, so a
// receipt landing cleanly could make the bar claim a manuscript was saved
// while its own write was still refused.
let standingDeskRecordConflict = false;

function isDeskRecordConflictStanding() {
  return standingDeskRecordConflict;
}

function refreshDeskRecordConflictStanding() {
  const value = deskRecordConflictCount() > 0;
  if (standingDeskRecordConflict === value) return;
  standingDeskRecordConflict = value;
  if (typeof refreshTeachTextConflictSurfaces === "function") refreshTeachTextConflictSurfaces();
}

/**
 * `true` is the coarse edge - a refusal this save could not pin to a named
 * record. `false` re-derives the flag from the register instead of lowering
 * it, so clearing one record's conflict cannot clear another's.
 * @param {boolean} next
 */
function setDeskRecordConflictStanding(next) {
  if (next === true) {
    if (standingDeskRecordConflict) return;
    standingDeskRecordConflict = true;
    if (typeof refreshTeachTextConflictSurfaces === "function") refreshTeachTextConflictSurfaces();
    return;
  }
  refreshDeskRecordConflictStanding();
}

async function persistDeskState() {
  const endPerf = window.AISystem6Perf?.start("state_save");
  const startedAt = performance.now();
  try {
    if (!deskPersistenceWritable) {
      endPerf?.({ blocked: true });
      return false;
    }
    ensureActiveProject();
    syncCurrentNotePadPage();
    const plans = deskCollectionDefinitions().map(deskCollectionPlan);
    const changedPlans = plans.filter((plan) => plan.puts.length || plan.deletes.length);
    // Settings travel as one record, and the same rule applies: the snapshot
    // that is written is the one the base will advance to, so it is frozen
    // rather than pointing at the live inputs behind it.
    const settingsPayload = freezeDeskWriteValue(settingsSnapshotPayload());
    const settingsSnapshot = JSON.stringify(settingsPayload);
    const settingsBase = storageSnapshotCache.get("settings");
    const shouldWriteSettings = settingsBase !== settingsSnapshot;
    if (!changedPlans.length && !shouldWriteSettings) {
      lastDeskPersistenceStats = {
        storesTouched: [],
        puts: 0,
        deletes: 0,
        settingsWritten: false,
        durationMs: performance.now() - startedAt,
      };
      endPerf?.({ skipped: true });
      return true;
    }

    const writtenFingerprints = await commitDeskPlansWhereverTheConnectionIs({
      changedPlans,
      settingsPayload,
      settingsBase,
      shouldWriteSettings,
    });
    // From here the transaction HAS committed. Everything below is
    // bookkeeping, broadcast and derived-index work: it may fail, and when it
    // does the only honest report is that the interface could not catch up -
    // never that the save failed, and never a rollback of records the
    // database already holds.
    const reported = {
      storesTouched: changedPlans.map((plan) => plan.key),
      puts: changedPlans.reduce((total, plan) => total + plan.puts.length, 0),
      deletes: changedPlans.reduce((total, plan) => total + plan.deletes.length, 0),
      settingsWritten: shouldWriteSettings,
      durationMs: 0,
    };
    try {
      // plan.current was fingerprinted when the plan was built, before the
      // transaction above ever opened. This window's own code can advance a
      // record in that gap (a run receipt commit landing between two edits is
      // the case that surfaced this), so the disk can end up holding bytes
      // this plan never fingerprinted. writtenFingerprints carries the
      // fingerprint each record actually had at the moment it was written
      // (see putDeskRecordAtBase); prefer that over the plan's guess wherever
      // both exist, or the cache remembers a base that matches neither this
      // window's memory nor disk, and every later save is refused forever
      // with no other window to send the correction.
      if (Array.isArray(writtenFingerprints) && writtenFingerprints.length) {
        const byKey = new Map();
        writtenFingerprints.forEach((entry) => {
          if (!byKey.has(entry.key)) byKey.set(entry.key, new Map());
          byKey.get(entry.key).set(entry.cacheKey, { id: entry.id, fingerprint: entry.fingerprint });
        });
        byKey.forEach((corrections, key) => {
          const plan = plans.find((candidate) => candidate.key === key);
          corrections.forEach((value, cacheKey) => plan?.current.set(cacheKey, value));
        });
      }
      plans.forEach((plan) => {
        // The base advances to what this write confirmed - never past it, and
        // never over the base of a record another window created while this
        // transaction was open and the plan could not see.
        const next = new Map(plan.current);
        // Except the records this write just deleted. Keeping a tombstone's
        // base is what made every following save re-issue the same delete
        // forever, and it is why the shadow comparison kept naming a deletion
        // nobody had stopped reporting: the writer reported it once, the cache
        // remembered it as still present, and each plan deleted it again.
        storageRecordFingerprintCache.get(plan.key)?.forEach((value, cacheKey) => {
          if (!next.has(cacheKey)) next.set(cacheKey, value);
        });
        storageRecordFingerprintCache.set(plan.key, next);
      });
      broadcastDeskRecordChanges(changedPlans, shouldWriteSettings);
      if (shouldWriteSettings) storageSnapshotCache.set("settings", settingsSnapshot);
      // Only what this write confirmed stops being dirty. A keystroke that
      // arrived while the transaction was open belongs to the next save, and
      // only the conflicts this commit answered are cleared: a receipt that
      // landed cleanly says nothing about a manuscript whose write is still
      // refused.
      changedPlans.forEach((plan) => {
        const dirty = dirtyDeskRecords.get(plan.key);
        const deleted = deletedDeskRecords.get(plan.key);
        const resolved = [];
        plan.puts.forEach(({ id }) => {
          const cacheKey = String(id);
          dirty?.delete(cacheKey);
          confirmedDeletes.delete(`${plan.key}:${cacheKey}`);
          resolved.push({ key: plan.key, id: cacheKey });
        });
        plan.deletes.forEach(({ id }) => {
          const cacheKey = String(id);
          dirty?.delete(cacheKey);
          deleted?.delete(cacheKey);
          confirmedDeletes.add(`${plan.key}:${cacheKey}`);
          resolved.push({ key: plan.key, id: cacheKey });
        });
        clearDeskRecordConflicts(resolved);
        if (!dirty?.size && !deleted?.size) dirtyDeskCollections.delete(plan.key);
      });
      setDeskRecordConflictStanding(false);
      window.AISystem6DerivedIndexQueue?.afterProjectCommit();
      // Whatever is persisted is announced. Persistence and the mirror used
      // to be two roads and only one of them told the other windows: the
      // live-progress commit broadcast, saveDeskState did not. So every
      // command that saves without typing -- adding a section, any structural
      // edit of the outline, a toggle -- put the store ahead of every other
      // window's memory of it, and the next window to take the pen wrote its
      // older copy back over the top.
      announceWorkingText();
    } catch (bookkeepingError) {
      console.warn("The desk could not finish its post-commit bookkeeping.", bookkeepingError);
    }
    lastDeskPersistenceStats = { ...reported, durationMs: performance.now() - startedAt };
    endPerf?.({
      stores: lastDeskPersistenceStats.storesTouched.join(","),
      puts: lastDeskPersistenceStats.puts,
      deletes: lastDeskPersistenceStats.deletes,
      settings: shouldWriteSettings,
    });
    return true;
  } catch (error) {
    const conflicted = error?.code === "DESK_RECORD_CONFLICT";
    // A refused write is not a broken one. The disk is intact, the other
    // window's version stands, and this window is about to roll its own edit
    // back - so say which record moved instead of logging a failure.
    if (conflicted) console.warn("Desk save refused: a record changed in another window.", error.conflicts);
    else console.error("Failed to save state to IDB:", error);
    lastDeskPersistenceStats = {
      storesTouched: [],
      puts: 0,
      deletes: 0,
      settingsWritten: false,
      durationMs: performance.now() - startedAt,
      error: true,
      conflicts: conflicted ? error.conflicts : undefined,
    };
    if (conflicted) {
      if (typeof setStatus === "function") setStatus(t("desk_record_conflict_status"));
      setDeskRecordConflictStanding(true);
      // Name the records too: the coarse flag alone cannot tell which of them
      // a later, unrelated commit has answered.
      (Array.isArray(error.conflicts) ? error.conflicts : []).forEach(({ key, id }) => {
        noteDeskRecordConflict(String(key), String(id));
      });
    }
    endPerf?.({ error: true, conflict: conflicted });
    return false;
  }
}

function hasMeaningfulClioOnboardingWork() {
  if (chatFiles.some((file) => Array.isArray(file?.messages) && file.messages.length)) return true;
  if (scraps.length || projectReferences.length) return true;
  return projects.some((project) => (
    String(project?.questionSheet || "").trim()
    || (Array.isArray(project?.drafts) && project.drafts.some((draft) => String(draft?.body || "").trim()))
    || (Array.isArray(project?.documentTabs) && project.documentTabs.some((tab) => (
      String(tab?.state?.body || tab?.state?.markdown || "").trim()
    )))
  ));
}

async function loadDeskState() {
  lastMigrationNote = t("migration_clean");
  let db;
  let tx;
  let transactionCompletion = null;
  let shouldRewriteSanitizedSettings = false;
  try {
    db = await openAppDb();
    tx = db.transaction([
      projectsStoreName, scrapsStoreName, trashStoreName,
      chatFoldersStoreName, chatFilesStoreName, imageAttachmentsStoreName,
      keyvalStoreName
    ], "readonly");
    transactionCompletion = window.AISystem6StorageTransactions.transactionDone(tx);

    const [
      storedProjects,
      storedScraps,
      storedTrashItems,
      storedTrashKeys,
      storedChatFolders,
      storedChatFiles,
      storedImageAttachments,
      settings,
    ] = await Promise.all([
      idbRequest(tx.objectStore(projectsStoreName).getAll()),
      idbRequest(tx.objectStore(scrapsStoreName).getAll()),
      idbRequest(tx.objectStore(trashStoreName).getAll()),
      idbRequest(tx.objectStore(trashStoreName).getAllKeys()),
      idbRequest(tx.objectStore(chatFoldersStoreName).getAll()),
      idbRequest(tx.objectStore(chatFilesStoreName).getAll()),
      idbRequest(tx.objectStore(imageAttachmentsStoreName).getAll()),
      idbRequest(tx.objectStore(keyvalStoreName).get("settings")),
    ]);
    await transactionCompletion;

    applySettings(settings || {});
    shouldRewriteSanitizedSettings = Object.prototype.hasOwnProperty.call(settings || {}, "localApiToken")
      || (
        !Object.prototype.hasOwnProperty.call(settings || {}, "clioOnboardingCompleted")
        && Object.prototype.hasOwnProperty.call(settings || {}, "guideSeen")
      );
    projects.splice(0, projects.length, ...storedProjects);
    scraps.splice(0, scraps.length, ...storedScraps);
    imageAttachments.splice(0, imageAttachments.length, ...(storedImageAttachments || []));
    storedTrashItems.forEach((item, index) => {
      if (item._storageId === undefined || item._storageId === null || item._storageId === "") {
        item._storageId = storedTrashKeys[index] ?? crypto.randomUUID();
      }
    });
    trashItems.splice(0, trashItems.length, ...storedTrashItems);
    chatFolders.splice(0, chatFolders.length, ...storedChatFolders);
    chatFiles.splice(0, chatFiles.length, ...storedChatFiles);
    if (
      !Object.prototype.hasOwnProperty.call(settings || {}, "clioOnboardingCompleted")
      && hasMeaningfulClioOnboardingWork()
    ) {
      clioOnboardingCompleted = true;
      shouldRewriteSanitizedSettings = true;
    }
    deskPersistenceWritable = true;
    storageSnapshotCache.clear();
    storageRecordFingerprintCache.clear();
    deskCollectionDefinitions().forEach((definition) => {
      const plan = deskCollectionPlan(definition);
      storageRecordFingerprintCache.set(definition.key, plan.current);
    });
    dirtyDeskRecords.clear();
    deletedDeskRecords.clear();
    dirtyDeskCollections.clear();
    if (settings !== undefined) {
      storageSnapshotCache.set("settings", JSON.stringify(settings));
    }

  } catch (error) {
    try {
      tx?.abort();
    } catch {}
    await transactionCompletion?.catch(() => {});
    console.error("Failed to load state from IDB:", error);
    deskPersistenceWritable = false;
    throw error;
  } finally {
    db?.close();
  }

  const projectStateChanged = ensureActiveProject();
  if (startupProjectId && projects.some((project) => project.id === startupProjectId && !project.archived)) {
    activeProjectId = startupProjectId;
    isProjectMounted = true;
  }
  assignProjectScope(activeProjectId);
  selectedProjectId = activeProjectId;
  if (projectStateChanged || shouldRewriteSanitizedSettings) {
    if (shouldRewriteSanitizedSettings) markDeskDirty("settings");
    const saved = await saveDeskState();
    if (!saved) throw new Error("The initial Project Hard Disk could not be saved.");
  }
  return {
    status: projects.length ? "ready" : "empty",
    projectId: activeProjectId,
  };
}

function applySettings(settings) {
  const localProviderEl = document.getElementById("local-provider");
  if (localProviderEl && settings.localProvider) localProviderEl.value = settings.localProvider;
  const savedEndpoint = String(settings.endpoint || "").trim();
  endpointInput.value = !savedEndpoint || savedEndpoint.startsWith("/")
    ? window.AISystem6LocalLMStudio.defaultBaseUrl(settings.localProvider)
    : savedEndpoint;
  if (typeof localApiTokenInput !== "undefined" && localApiTokenInput) {
    const legacyToken = String(settings.localApiToken || "").trim();
    let sessionToken = "";
    try {
      sessionToken = String(sessionStorage.getItem(localApiTokenSessionKey) || "").trim();
      if (!sessionToken && legacyToken) {
        sessionToken = legacyToken;
        sessionStorage.setItem(localApiTokenSessionKey, legacyToken);
      }
    } catch {
      sessionToken = legacyToken;
    }
    localApiTokenInput.value = sessionToken;
  }
  localLmStudioConnectionEnabled = settings.localLmStudioConnectionEnabled === true;
  if (settings.model && settings.model !== "ai-system-main") {
    modelInput.value = settings.model;
  }
  const manualModelFieldsInput = document.getElementById("manual-model-fields");
  if (manualModelFieldsInput) {
    manualModelFieldsInput.checked = settings.modelFieldInputMode === "manual"
      || settings.localModelInputMode === "manual";
  }
  activeChatModelIdentifier = settings.chatModel || "";
  // The external MCP servers must be known before the saved search provider
  // is applied: one of them may BE that provider, and its option does not
  // exist until syncMcpSearchProviderOptions has run.
  window.AISystem6GuestExecutor?.setServers?.(settings.mcpServers || {});
  const savedSearchProvider = String(settings.searchProvider || "");
  // A saved server provider must survive this pass even though the module that
  // draws its menu entry is lazy: without a placeholder the value would fall
  // back to Automatic and the next save would write that back, losing the
  // writer's choice to a load order they never see. The lazy module relabels
  // this entry when it arrives, or removes it if the server is gone.
  if (savedSearchProvider.startsWith("mcp:") && searchProviderInput
    && ![...searchProviderInput.options].some((option) => option.value === savedSearchProvider)) {
    const placeholder = document.createElement("option");
    placeholder.value = savedSearchProvider;
    placeholder.textContent = savedSearchProvider.slice(4);
    searchProviderInput.append(placeholder);
  }
  const searchProviderIsKnown = ["auto", "duckduckgo", "bing", "deepseek"].includes(savedSearchProvider)
    || (savedSearchProvider.startsWith("mcp:") && [...(searchProviderInput?.options || [])].some((option) => option.value === savedSearchProvider));
  if (searchProviderInput && searchProviderIsKnown) {
    searchProviderInput.value = savedSearchProvider;
  } else if (searchProviderInput) {
    searchProviderInput.value = "auto";
  }
  if (typeof timeMachineProviderInput !== "undefined" && timeMachineProviderInput) {
    timeMachineProviderInput.value = ["auto", "wayback", "archive-is"].includes(settings.timeMachineProvider)
      ? settings.timeMachineProvider
      : "auto";
  }
  if (importerModeInput && ["auto", "markitdown"].includes(settings.importerMode)) {
    importerModeInput.value = settings.importerMode;
  }
  window.AISystem6GuestExecutor?.setApprovals?.(settings.guestAgents || {});
  window.AISystem6GuestExecutor?.setDeskId?.(settings.mcpDeskId || "");
  if (ocrEngineInput && ["auto", "tesseract", "paddle"].includes(settings.ocrEngine)) {
    ocrEngineInput.value = settings.ocrEngine;
  } else if (ocrEngineInput) {
    ocrEngineInput.value = "auto";
  }
  if (settings.contextLength) contextLengthInput.value = String(settings.contextLength);
  if (settings.contextLengthByModel && typeof settings.contextLengthByModel === "object") {
    contextLengthByModel = Object.fromEntries(
      Object.entries(settings.contextLengthByModel)
        .map(([key, value]) => [String(key).toLowerCase(), parsePositiveInteger(value)])
        .filter(([, value]) => value >= contextMinLength)
    );
  }
  if (settings.contextLengthUserOverrides && typeof settings.contextLengthUserOverrides === "object") {
    contextLengthUserOverrides = Object.fromEntries(
      Object.entries(settings.contextLengthUserOverrides)
        .map(([key, value]) => [String(key).toLowerCase(), !!value])
    );
  }
  if (settings.contextMaxByModel && typeof settings.contextMaxByModel === "object") {
    contextMaxByModel = Object.fromEntries(
      Object.entries(settings.contextMaxByModel)
        .map(([key, value]) => [String(key).toLowerCase(), {
          max: parsePositiveInteger(value?.max || value),
          source: value?.source || "user",
        }])
        .filter(([, value]) => value.max >= contextMinLength)
    );
  }
  updateContextMaxForCurrentModel();
  if (settings.localModelReady || activeChatModelIdentifier || modelInput.value.trim()) {
    updateLocalModelState({
      server: false,
      models: false,
      selected: !!modelInput.value.trim(),
      loaded: false,
      ready: false,
      running: false,
      task: "",
    });
  }
  if (settings.embeddingModel) {
    embeddingModelInput.value = settings.embeddingModel;
  }
  syncLocalModelControls();
  renderContextLengthPresets();
  if (Array.isArray(settings.excludedContextKeys)) {
    excludedContextKeys.clear();
    settings.excludedContextKeys.forEach((key) => excludedContextKeys.add(key));
  }
  if (settings.compressedConversationMemory && typeof settings.compressedConversationMemory === "object") {
    compressedConversationMemory = {
      text: String(settings.compressedConversationMemory.text || ""),
      sourceMessages: Number(settings.compressedConversationMemory.sourceMessages || 0),
      updatedAt: String(settings.compressedConversationMemory.updatedAt || ""),
    };
  }
  if (typeof settings.remember === "boolean") rememberInput.checked = settings.remember;
  if (typeof settings.projectMounted === "boolean") isProjectMounted = settings.projectMounted;
  if (typeof settings.modernFonts === "boolean") {
    modernFontsInput.checked = settings.modernFonts;
    applyModernFonts({ persist: false });
  }
  if (typeof settings.classicLineIcons === "boolean") {
    classicLineIconsInput.checked = settings.classicLineIcons;
    setClassicLineArtEverywhere(settings.classicLineIcons);
  }
  const restoredTheme = typeof settings.theme === "string"
    ? settings.theme
    : typeof settings.liquidGlass === "boolean"
      ? (settings.liquidGlass ? "liquid-glass" : "classic")
      : "";
  if (restoredTheme) {
    applyTheme(restoredTheme, { persist: true, saveDesk: false, announce: false });
  }
  const restoredTint = Number.isFinite(Number(settings.liquidTintLevel))
    ? Math.min(1, Math.max(0, Number(settings.liquidTintLevel)))
    : 0.5;
  if (liquidTintLevelInput) liquidTintLevelInput.value = String(restoredTint);
  if (typeof applyLiquidTintLevel === "function") applyLiquidTintLevel(restoredTint);
  if (typeof settings.soundEffects === "boolean") {
    soundEffectsInput.checked = settings.soundEffects;
  }
  if (typeof settings.menuClock === "boolean") {
    menuClockInput.checked = settings.menuClock;
  } else {
    menuClockInput.checked = false;
  }
  if (showUnmountedDisksInput) {
    showUnmountedDisksInput.checked = settings.showUnmountedDisks === true;
  }
  // Both default off: holding the screen on and silencing a player are things
  // the user asks for, never things a restored desk decides for them.
  const keepScreenAwakeInput = document.getElementById("keep-screen-awake");
  if (keepScreenAwakeInput) keepScreenAwakeInput.checked = settings.keepScreenAwake === true;
  const pauseAudioInput = document.getElementById("pause-audio-in-background");
  if (pauseAudioInput) pauseAudioInput.checked = settings.pauseAudioInBackground === true;
  restoreControlStripState(settings);
  if (typeof settings.performanceMeter === "boolean") {
    performanceMeterInput.checked = settings.performanceMeter;
  }
  const clioWebSearchInput = document.getElementById("clio-web-search");
  if (clioWebSearchInput) {
    clioWebSearchInput.checked = settings.clioWebSearch === true;
  }
  if (typeof refreshClioTalkWebSearchToggle === "function") {
    refreshClioTalkWebSearchToggle();
  }
  if (showResetSystemMenuInput) {
    showResetSystemMenuInput.checked = typeof settings.showResetSystemMenu === "boolean"
      ? settings.showResetSystemMenu
      : true;
  }
  if (settings.language === "zh" || settings.language === "en") currentLanguage = settings.language;
  writerMode = false;
  guideSeen = settings.guideSeen === true;
  clioOnboardingCompleted = typeof settings.clioOnboardingCompleted === "boolean"
    ? settings.clioOnboardingCompleted
    : guideSeen;
  clioProviderPreference = ["auto", "local", "website", "byok"].includes(settings.clioProviderPreference)
    ? settings.clioProviderPreference
    : "auto";
  if (typeof settings.multiFinderSwitcherHintSeen === "boolean") {
    multiFinderSwitcherHintSeen = settings.multiFinderSwitcherHintSeen;
  }
  restoreWritingBellState(settings.writingBell);
  if (typeof restoreAlarmClockState === "function") restoreAlarmClockState(settings.alarmClock);
  restorePuzzleState(settings.puzzle);
  restorePageSetupState(settings.pageSetup);
  if (Array.isArray(settings.notePadPages)) {
    notePadPages = normalizeNotePadPages(settings.notePadPages);
  } else if (typeof settings.notePadText === "string") {
    notePadPages = normalizeNotePadPages([settings.notePadText]);
  }
  // Interruption slips leave; pages you typed stay. Once, on the way in.
  if (typeof carryNotePadSlipsToHeldThoughts === "function") {
    notePadPages = carryNotePadSlipsToHeldThoughts(notePadPages);
  }
  if (Number.isInteger(settings.notePadPageIndex)) notePadPageIndex = settings.notePadPageIndex;
  if (typeof settings.notePadDestination === "string") notePadDestination = settings.notePadDestination;
  // Both halves of the To Do list's trip are eager on purpose: the items come
  // back on every boot whether or not the lazy accessory window ever loads.
  if (Array.isArray(settings.todoDaItems)) todoDaItems = normalizeTodoDaItems(settings.todoDaItems);
  restoreSystemNotifications(settings.systemNotifications);
  renderNotePadPage();
  if (Array.isArray(settings.projectCdItems)) {
    projectCdItems.splice(0, projectCdItems.length, ...settings.projectCdItems);
  }
  renderProjectCd();
  if (typeof settings.clipboardText === "string") clipboardText = settings.clipboardText;
  if (typeof settings.clipboardSource === "string") clipboardSource = settings.clipboardSource;
  if (typeof settings.clipboardUpdatedAt === "string") clipboardUpdatedAt = settings.clipboardUpdatedAt;
  if (typeof settings.clipboardTranslationText === "string") clipboardTranslationText = settings.clipboardTranslationText;
  if (typeof settings.clipboardTranslationSourceText === "string") clipboardTranslationSourceText = settings.clipboardTranslationSourceText;
  if (typeof settings.clipboardTranslationLanguage === "string") clipboardTranslationLanguage = settings.clipboardTranslationLanguage;
  if (typeof settings.clipboardTranslationCreatedAt === "string") clipboardTranslationCreatedAt = settings.clipboardTranslationCreatedAt;
  if (typeof settings.clipboardTranslationModel === "string") clipboardTranslationModel = settings.clipboardTranslationModel;
  renderClipboard();
  if (settings.activeProjectId) activeProjectId = settings.activeProjectId;
  if (settings.startupProjectId) startupProjectId = settings.startupProjectId;
  if (typeof settings.startupProjectPinned === "boolean") startupProjectPinned = settings.startupProjectPinned;
  workspaceProfileWasRestored = Object.prototype.hasOwnProperty.call(settings, "workspaceProfile");
  workspaceProfile = normalizeWorkspaceProfile(settings.workspaceProfile);
  syncWorkspaceProfileDom();
  if (settings.startupEnvironment === "finder" || settings.startupEnvironment === "multifinder") {
    startupEnvironment = settings.startupEnvironment;
  } else if (typeof settings.multiFinderEnabled === "boolean") {
    startupEnvironment = settings.multiFinderEnabled ? "multifinder" : "finder";
  }
  startupOpenMode = normalizeStartupOpenMode(settings.startupOpenMode, startupEnvironment);
  if (typeof settings.startupSelectedApplicationAction === "string") {
    startupSelectedApplicationAction = settings.startupSelectedApplicationAction;
  }
  if (typeof settings.startupSelectedApplicationName === "string") {
    startupSelectedApplicationName = settings.startupSelectedApplicationName;
  }
  if (!getStartupSelectedApplicationItem()) {
    startupSelectedApplicationAction = "open-assistant";
    startupSelectedApplicationName = "";
  }
  startupOpenedWindowNames = normalizeStartupOpenedWindowNames(settings.startupOpenedWindowNames);
  runtimeEnvironment = startupEnvironment;
  if (settings.windowViewModes && typeof settings.windowViewModes === "object") {
    Object.entries(settings.windowViewModes).forEach(([name, mode]) => {
      if (viewWindowNames.includes(name)) windowViewModes[name] = normalizeFinderViewMode(mode);
    });
  }
  if (localProviderEl && settings.localProvider) {
    const btn = typeof loadModelButton !== "undefined" ? loadModelButton : document.getElementById("load-model");
    const status = typeof loadModelStatusEl !== "undefined" ? loadModelStatusEl : document.getElementById("load-model-status");
    if (settings.localProvider === "lm-studio") {
      if (btn) btn.disabled = false;
      if (status) status.textContent = t("load_model_hint");
    } else {
      if (btn) btn.disabled = true;
      if (status) {
        status.textContent = t(settings.localProvider === "ollama" ? "ollama_auto_load_hint" : "custom_auto_load_hint");
      }
    }
  }
}

function updateClock() {
  renderSystemClock();
  notifySystemClockListeners();
}

// One clock, one tick. The menu clock, the status clock and the Control
// Strip's clock tile all show the same minute; a consumer that wants to know
// when it changes subscribes here instead of running a timer of its own (the
// Control Strip used to keep a second hand on a one-second interval, so the
// same minute was refreshed sixty times to keep one tile honest).
const systemClockListeners = new Set();

/** @param {() => void} listener @returns {() => void} */
function subscribeSystemClock(listener) {
  if (typeof listener !== "function") return () => {};
  systemClockListeners.add(listener);
  return () => systemClockListeners.delete(listener);
}

function notifySystemClockListeners() {
  [...systemClockListeners].forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn("A clock subscriber failed.", error);
    }
  });
}

// The desk clock shows hours and minutes, so the next moment it can change is
// the next whole minute. A once-a-second timer repainted the same two digits
// sixty times over: 3,600 DOM writes an hour for a display that moves once a
// minute. The tick is scheduled to land on the boundary, and the return from a
// backgrounded page reads the real time at once instead of waiting for the next
// boundary (a minute can pass while the page is hidden and no frames run).
let systemClockTimer = 0;

/** Milliseconds until the wall clock reaches the next whole minute. */
function millisecondsUntilNextMinute(now = new Date()) {
  const elapsed = now.getSeconds() * 1000 + now.getMilliseconds();
  return Math.max(250, 60000 - elapsed);
}

function scheduleSystemClockTick(now = new Date()) {
  clearTimeout(systemClockTimer);
  systemClockTimer = setTimeout(() => {
    updateClock();
    scheduleSystemClockTick();
  }, millisecondsUntilNextMinute(now));
  return systemClockTimer;
}

/** Start the clock: paint now, then once per displayed minute. */
function startSystemClock() {
  updateClock();
  scheduleSystemClockTick();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") return;
    // Whatever the page missed while it was hidden, the answer is the real
    // time - not the timer that was left behind.
    updateClock();
    scheduleSystemClockTick();
  });
  return systemClockTimer;
}

function formatSystemClockTime(now = new Date()) {
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderSystemClock(now = new Date()) {
  const time = formatSystemClockTime(now);
  if (clockEl) {
    const showMenuClock = !!menuClockInput?.checked;
    clockEl.classList.toggle("is-hidden", !showMenuClock);
    clockEl.setAttribute("aria-hidden", showMenuClock ? "false" : "true");
    clockEl.textContent = showMenuClock ? time : "";
  }
  if (statusClockTimeEl) {
    statusClockTimeEl.textContent = time;
  }
  if (statusClockDateEl) {
    statusClockDateEl.textContent = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
}

function updateMenuStatus() {
  renderProjectSwitcher();
  renderMultiFinderMenu();
}

function formatAppVersion() {
  return t("about_version_value", appVersionInfo.version, appVersionInfo.build);
}

function formatAppVersionCompact() {
  return `Build ${appVersionInfo.build}`;
}

async function loadAppVersion() {
  try {
    const response = await window.AISystem6Capabilities.requestService("system.version", {});
    if (!response.ok) throw new Error(response.statusText);
    const info = await response.json();
    appVersionInfo = {
      version: String(info.version || getAppBuildInfo().version),
      build: String(info.build || getAppBuildInfo().build),
      sourceCommit: String(info.sourceCommit ?? getAppBuildInfo().sourceCommit ?? ""),
      snapshotCommit: String(info.snapshotCommit || ""),
      generatedAt: String(info.generatedAt || getAppBuildInfo().generatedAt || ""),
    };
  } catch (error) {
    console.warn("Could not read app version", error);
    // Keep the generated identity; it was stamped at build time and is the
    // same source /api/version reads from, so no release number is invented.
    appVersionInfo = { ...getAppBuildInfo() };
  } finally {
    renderAboutMacintosh();
  }
}

function renderAboutMacintosh() {
  if (aboutVersionEl) aboutVersionEl.textContent = formatAppVersionCompact();
  const cloudActive = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady();
  const aboutModelLabelEl = document.getElementById("about-model-label");
  if (aboutModelLabelEl) aboutModelLabelEl.textContent = cloudActive ? t("about_cloud_model") : t("about_model");
  if (aboutModelEl) {
    aboutModelEl.textContent = cloudActive
      ? (cloudConfig.model || t("cloud_model"))
      : getLocalModelDisplayName();
  }
  renderSystemStatus();
}

function renderCloudStatePanel() {
  const nameEl = document.getElementById("system-cloud-name");
  const dotEl = document.getElementById("system-cloud-dot");
  const statusEl = document.getElementById("system-cloud-status");
  const contextEl = document.getElementById("system-cloud-context");
  const latestEl = document.getElementById("system-cloud-latest");
  const sessionEl = document.getElementById("system-cloud-session");
  const balanceEl = document.getElementById("system-cloud-balance");
  if (!nameEl) return;

  const cfg = (typeof cloudConfig !== "undefined") ? cloudConfig : null;
  nameEl.textContent = typeof cloudModelRouteLabel === "function"
    ? cloudModelRouteLabel(cfg)
    : (cfg?.model || "-");

  const realDot = document.getElementById("cloud-status-indicator");
  const connected = realDot?.classList.contains("is-connected");
  const errored = realDot?.classList.contains("is-error");
  if (dotEl) {
    dotEl.className = "cloud-status-dot" + (connected ? " is-connected" : errored ? " is-error" : "");
  }
  if (statusEl) {
    statusEl.textContent = connected ? t("cloud_connected") : errored ? t("cloud_error") : t("cloud_active_hint").split(".")[0];
  }

  if (contextEl) {
    contextEl.textContent = typeof currentContextWindowText === "function" ? currentContextWindowText(cfg) : "-";
  }

  if (latestEl) latestEl.textContent = (typeof cloudUsageText === "function" && typeof latestCloudUsage !== "undefined") ? cloudUsageText(latestCloudUsage) : "-";
  if (sessionEl) sessionEl.textContent = (typeof cloudUsageText === "function" && typeof sessionCloudUsage !== "undefined") ? cloudUsageText(sessionCloudUsage) : "-";

  if (balanceEl) {
    if (cfg?.balance) {
      balanceEl.textContent = typeof cloudBalanceText === "function" ? cloudBalanceText(cfg) : `${cfg.balance.currency || "CNY"} ${Number(cfg.balance.total).toFixed(2)}`;
    } else {
      try {
        const local = JSON.parse(localStorage.getItem("ai-system6-cloud-usage"));
        balanceEl.textContent = local?.cost_cny ? `Spent ¥${local.cost_cny.toFixed(4)}` : "-";
      } catch { balanceEl.textContent = "-"; }
    }
  }
}

function renderSystemStatus() {
  const now = new Date();
  const project = getActiveProject();
  const projectFiles = getProjectFiles();
  const projectScraps = getProjectScraps();
  const projectRefs = isProjectMounted
    ? projectReferences.filter((reference) => reference.projectId === activeProjectId)
    : [];
  const mountedChunks = getMountedTextDiskChunks();
  const textDiskMounted = isProjectMounted
    && mountedTextDisk.projectId === activeProjectId
    && mountedChunks.length > 0;

  const isCloud = (typeof cloudConfig !== "undefined") && cloudConfig?.active && cloudCredentialReady();
  const cloudChosen = (typeof cloudConfig !== "undefined") && cloudConfig?.active && cloudConfig?.provider;

  renderSystemClock(now);
  // The Model State panel narrates the local LM Studio pipeline. When a cloud
  // model is active it is not the route in use, and showing "LM Studio
  // server … Waiting" next to a working cloud model reads as a broken status.
  if (modelStatePanelEl) modelStatePanelEl.hidden = cloudChosen;
  if (statusModelEl) statusModelEl.textContent = getLocalModelDisplayName();
  renderLocalModelState();
  renderCloudStatePanel();
  if (statusVersionEl) statusVersionEl.textContent = formatAppVersionCompact();
  if (statusProjectEl) statusProjectEl.textContent = project?.name || t("no_project_mounted");
  if (statusTextDiskEl) {
    statusTextDiskEl.textContent = textDiskMounted
      ? t("about_text_disk_summary", mountedTextDisk.files.length, mountedChunks.length)
      : t("about_text_disk_none");
  }
  if (statusContextEl) {
    statusContextEl.textContent = t("about_context_summary", projectFiles.length, projectScraps.length, projectRefs.length);
  }
  if (statusModelStateEl) {
    statusModelStateEl.textContent = isCloud
      ? t("cloud_model")
      : (cloudChosen ? t("cloud_model_pending") : modelStateCurrentStep());
  }
  if (statusCurrentTaskEl) {
    statusCurrentTaskEl.textContent = localModelState.running
      ? (localModelState.task || t("working_locally"))
      : t("no_current_task");
  }
  if (statusModeEl) {
    const modeLabel = isMultiFinderMode()
      ? `${t("multifinder")} (${t("multifinder_multi_task")})`
      : `${t("finder")} (${t("finder_single_task")})`;
    const workspaceLabel = t(workspaceProfile === workspaceProfileDesktop ? "workspace_desktop" : "workspace_writing");
    statusModeEl.textContent = !isMultiFinderMode() && sideAskEnabled
      ? `${workspaceLabel} · ${modeLabel} · ${t("sideask")}`
      : `${workspaceLabel} · ${modeLabel}`;
  }
  const activity = typeof window.AISystem6AssistantActivity?.getState === "function"
    ? window.AISystem6AssistantActivity.getState()
    : null;
  renderAssistantActivityRow(activity);
  const recentRuns = typeof window.AISystem6RunReceipts?.queryReceipts === "function"
    ? window.AISystem6RunReceipts.queryReceipts({ limit: 5 })
    : [];
  renderSystemRecentRuns(recentRuns);
  window.AISystem6WebPlatform?.renderProjectStorageStatus?.();
}

const runReceiptAppLabelKeys = {
  teachText: "teachtext_label",
  docMap: "docmap",
  reviewDesk: "review_desk",
  clioStage: "clio_stage_label",
  projectCd: "project_cd",
  clioTalk: "assistant_label",
  droplet: "droplet",
  repeat: "run_receipt_repeat",
};

function runReceiptAppLabel(sourceAppId) {
  const id = String(sourceAppId || "");
  // A guest agent signs its receipts guest:<name>; the list shows the name
  // under the desk's own word for it so it never reads as a built-in app.
  if (id.startsWith("guest:")) return t("guest_receipt_label", id.slice("guest:".length));
  const key = runReceiptAppLabelKeys[id];
  return key ? t(key) : (id || "—");
}

function ensureSystemStatusPanelContainer(id) {
  const pane = document.querySelector(".system-status-pane");
  if (!pane) return null;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = "system-status-subpanel";
    pane.append(el);
  }
  return el;
}

function renderAssistantActivityRow(activity) {
  const container = ensureSystemStatusPanelContainer("assistant-activity-panel");
  if (!container) return;
  container.replaceChildren();
  const title = document.createElement("b");
  title.textContent = t("assistant_activity_label");
  title.dataset.i18n = "assistant_activity_label";
  container.append(title);
  const stateName = activity?.state || "idle";
  const labelKey = activity?.labelKey || `activity_${stateName}`;
  const row = document.createElement("div");
  row.className = "assistant-activity-row";
  row.dataset.assistantState = stateName;
  row.dataset.runState = stateName;
  row.dataset.activity = labelKey;
  if (activity?.runId) row.dataset.activityRunId = activity.runId;
  row.setAttribute("aria-label", t(labelKey));
  const label = document.createElement("span");
  label.className = "assistant-activity-label";
  label.textContent = t(labelKey);
  row.append(label);
  if (activity?.cancellable && typeof window.AISystem6AssistantActivity?.cancelActiveRun === "function") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn mini-btn";
    cancel.textContent = t("stop_generation");
    cancel.addEventListener("click", () => window.AISystem6AssistantActivity.cancelActiveRun());
    row.append(cancel);
  }
  if ((activity?.bringToFrontTarget || activity?.ownerAppId) && typeof window.AISystem6AssistantActivity?.bringToFront === "function") {
    const front = document.createElement("button");
    front.type = "button";
    front.className = "btn mini-btn";
    front.textContent = t("run_receipt_bring_to_front");
    front.addEventListener("click", () => window.AISystem6AssistantActivity.bringToFront());
    row.append(front);
  }
  container.append(row);
}

function renderSystemRecentRuns(receipts = []) {
  const container = ensureSystemStatusPanelContainer("system-recent-runs-panel");
  if (!container) return;
  container.replaceChildren();
  const title = document.createElement("b");
  title.textContent = t("recent_runs");
  title.dataset.i18n = "recent_runs";
  container.append(title);
  if (!receipts.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = t("run_receipt_no_runs");
    container.append(empty);
    return;
  }
  const list = document.createElement("ol");
  list.className = "system-recent-runs-list";
  receipts.forEach((receipt) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "system-recent-run";
    button.dataset.receiptId = receipt.id || "";
    const status = String(receipt.runReceipt?.status || "completed");
    const app = runReceiptAppLabel(receipt.runReceipt?.sourceAppId || "");
    const stamp = receipt.createdAt ? new Date(receipt.createdAt).toLocaleString() : "";
    button.textContent = `${t(`run_status_${status}`)} · ${app} · ${stamp}`;
    button.addEventListener("click", () => {
      if (typeof openTextFile === "function") openTextFile(receipt.id);
    });
    item.append(button);
    list.append(item);
  });
  container.append(list);
}

function formatNotificationTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function notificationStateLabel(state) {
  if (state === "running") return t("notification_state_running");
  if (state === "done") return t("notification_state_done");
  if (state === "failed") return t("notification_state_failed");
  if (state === "stopped") return t("notification_state_stopped");
  return "";
}

function updateNotificationIndicator() {
  if (!notificationCenterCountEl || !notificationCenterButton) return;
  const count = unreadSystemNotifications;
  notificationCenterCountEl.textContent = count > 9 ? "9+" : String(count);
  notificationCenterButton.classList.toggle("is-hidden", count <= 0);
  notificationCenterButton.classList.toggle("has-unread", count > 0);
  notificationCenterButton.setAttribute("aria-label", count > 0
    ? t("notification_center_unread", count)
    : t("notification_center"));
}

function renderNotificationCenter() {
  if (!notificationCenterListEl) return;
  unreadSystemNotifications = 0;
  updateNotificationIndicator();

  if (notificationCenterSummaryEl) {
    notificationCenterSummaryEl.textContent = systemNotifications.length
      ? t("notifications_count", systemNotifications.length)
      : t("notifications_empty");
  }

  notificationCenterListEl.replaceChildren();
  if (!systemNotifications.length) {
    const empty = document.createElement("div");
    empty.className = "notification-empty";
    empty.textContent = t("notifications_empty_detail");
    notificationCenterListEl.append(empty);
    return;
  }

  systemNotifications.forEach((item) => {
    const row = document.createElement("div");
    row.className = "notification-item";
    if (item.state) row.dataset.state = item.state;

    const body = document.createElement("div");
    body.className = "notification-item-body";
    const message = document.createElement("b");
    message.textContent = renderSystemNotificationText(item);
    const meta = document.createElement("small");
    const state = notificationStateLabel(item.state);
    meta.textContent = state
      ? `${state} · ${formatNotificationTime(item.createdAt)}`
      : formatNotificationTime(item.createdAt);
    body.append(message, meta);
    row.append(body);

    if (item.windowName || item.actionId) {
      const button = document.createElement("button");
      button.className = "btn mini-btn notification-open-button";
      button.type = "button";
      button.textContent = renderSystemNotificationActionLabel(item);
      button.addEventListener("click", () => openSystemNotification(item.id));
      row.append(button);
    }

    notificationCenterListEl.append(row);
  });
}

// A system message is a live channel, but the interruption it matters most for
// is the one that reloads the desk: the Writing Bell's "you stopped here" used
// to die with the reload, taking its way back with it. So the messages are
// saved, and a message keeps its Open button because windowName and actionId
// travel with it.
//
// Only the last day is restored. A "you stopped here" from Tuesday is not a
// message any more, it is litter.
const systemNotificationRestoreWindowMs = 24 * 60 * 60 * 1000;

function serializeSystemNotifications() {
  return systemNotifications.slice(0, 16).map((item) => ({
    id: item.id,
    message: item.message,
    messageKey: item.messageKey || "",
    messageArgs: item.messageKey ? (item.messageArgs || []) : [],
    createdAt: new Date(item.createdAt).toISOString(),
    state: item.state || "",
    windowName: item.windowName || "",
    actionId: item.actionId || "",
    actionLabel: item.actionLabel || "",
    actionLabelKey: item.actionLabelKey || "",
    actionLabelArgs: item.actionLabelKey ? (item.actionLabelArgs || []) : [],
  }));
}

function restoreSystemNotifications(saved) {
  if (!Array.isArray(saved)) return;
  const now = Date.now();
  const restored = saved
    .map((item) => ({
      id: String(item?.id || crypto.randomUUID()),
      message: String(item?.message || ""),
      // Tolerant of a pre-existing record with no key: it keeps rendering
      // from its stored (rendered-at-push-time) `message` forever, exactly as
      // it did before this field existed — only a newly pushed notification
      // gets the redraws-in-the-current-language behavior.
      messageKey: String(item?.messageKey || ""),
      messageArgs: Array.isArray(item?.messageArgs) ? item.messageArgs : [],
      createdAt: new Date(item?.createdAt || 0),
      state: String(item?.state || ""),
      windowName: String(item?.windowName || ""),
      actionId: String(item?.actionId || ""),
      actionLabel: String(item?.actionLabel || ""),
      // Same tolerance as the message key, for the same reason: a record
      // written before this field existed keeps drawing its stored rendered
      // label, and only a newly pushed notification redraws its button.
      actionLabelKey: String(item?.actionLabelKey || ""),
      actionLabelArgs: Array.isArray(item?.actionLabelArgs) ? item.actionLabelArgs : [],
    }))
    .filter((item) => item.message
      && !Number.isNaN(item.createdAt.getTime())
      && now - item.createdAt.getTime() < systemNotificationRestoreWindowMs)
    .slice(0, 16);
  systemNotifications.splice(0, systemNotifications.length, ...restored);
  // Restored messages are not new: the desk comes back quiet, and the writer
  // finds them when they look.
  unreadSystemNotifications = 0;
  updateNotificationIndicator();
  renderNotificationCenter();
}

// A notification pushed with a `messageKey` (+ optional `messageArgs`) is
// rendered from that key every time it is drawn, in whatever language is
// current at DRAW time — not the language that happened to be active the
// instant the push fired. Without this, a message queued before the writer's
// language preference settles (or read again after a mid-session switch)
// stays frozen in whatever language it was born in: keyed and unkeyed
// notifications can sit side by side, so `message` still carries a rendered
// snapshot for callers with no clean key (a raw task failure string) and for
// tolerantly reading an older persisted record that predates this field.
function renderSystemNotificationText(item) {
  if (item?.messageKey && typeof t === "function") {
    return t(item.messageKey, ...(item.messageArgs || []));
  }
  return item?.message || "";
}

// The button beside the message is a translation as well, and it froze the way
// the message used to: `actionLabel` held whatever t() returned at push time,
// so a notification pushed in English kept an English "Back" button beside a
// Chinese sentence after a language switch. A caller with a clean key passes
// `actionLabelKey` (+ optional `actionLabelArgs`) and the button is drawn from
// it at DRAW time. The stored rendered label stays the fallback -- for a caller
// holding no key, and for an older persisted record that predates this field --
// and the live t("open") stays the last resort for a message naming no label.
function renderSystemNotificationActionLabel(item) {
  if (item?.actionLabelKey && typeof t === "function") {
    return t(item.actionLabelKey, ...(item.actionLabelArgs || []));
  }
  if (item?.actionLabel) return item.actionLabel;
  return typeof t === "function" ? t("open") : "";
}

// A push that names either half of the button label replaces both halves, so a
// stored key can never outlive the label pushed beside it; a push naming
// neither leaves the label the notification already carries alone.
function applySystemNotificationActionLabel(item, options, actionLabelKey, actionLabelArgs) {
  if (options.actionLabel === undefined && options.actionLabelKey === undefined) return;
  item.actionLabel = options.actionLabel || "";
  item.actionLabelKey = actionLabelKey;
  item.actionLabelArgs = actionLabelArgs;
}

function pushSystemNotification(message, options = {}) {
  const text = String(message || "").trim();
  if (!text) return "";
  const messageKey = options.messageKey || "";
  const messageArgs = messageKey ? (options.messageArgs || []) : [];
  const actionLabelKey = options.actionLabelKey || "";
  const actionLabelArgs = actionLabelKey ? (options.actionLabelArgs || []) : [];

  const now = new Date();
  let item = options.replaceId
    ? systemNotifications.find((entry) => entry.id === options.replaceId)
    : null;
  const wasExisting = !!item;
  const previousState = item?.state || "";

  if (item) {
    item.message = text;
    item.messageKey = messageKey;
    item.messageArgs = messageArgs;
    item.createdAt = now;
    item.state = options.state || item.state || "";
    item.windowName = options.windowName ?? item.windowName;
    item.actionId = options.actionId ?? item.actionId;
    applySystemNotificationActionLabel(item, options, actionLabelKey, actionLabelArgs);
  } else {
    item = null;
  }

  const last = systemNotifications[0];
  // A repeat within the window is "the same message again" when it renders
  // the same key+args, or (for an unkeyed push) the same literal text — never
  // a coincidental cross-language match of unrelated rendered strings.
  const sameAsLast = last && (messageKey
    ? last.messageKey === messageKey && JSON.stringify(last.messageArgs || []) === JSON.stringify(messageArgs)
    : !last.messageKey && last.message === text);
  if (!item && sameAsLast && now - last.createdAt < 2000) {
    last.createdAt = now;
    last.state = options.state || last.state || "";
    last.windowName = options.windowName ?? last.windowName;
    last.actionId = options.actionId ?? last.actionId;
    applySystemNotificationActionLabel(last, options, actionLabelKey, actionLabelArgs);
    item = last;
  } else {
    item = item || {
      id: crypto.randomUUID(),
      message: text,
      messageKey,
      messageArgs,
      createdAt: now,
      state: options.state || "",
      windowName: options.windowName || "",
      actionId: options.actionId || "",
      actionLabel: options.actionLabel || "",
      actionLabelKey,
      actionLabelArgs,
    };
    if (!wasExisting) {
      systemNotifications.unshift(item);
      systemNotifications.splice(16);
    }
  }

  // Written through the ordinary desk save, so a message and the way back it
  // carries are still there after a reload. persistDeskState() posts no
  // messages of its own, so this cannot feed itself.
  saveDeskState();

  const center = getWindow("notificationCenter");
  if (center && !center.classList.contains("is-hidden")) {
    renderNotificationCenter();
  } else if (!wasExisting || (item.state && item.state !== "running" && item.state !== previousState)) {
    unreadSystemNotifications += 1;
    updateNotificationIndicator();
  }
  return item.id;
}

function openSystemNotification(id) {
  const item = systemNotifications.find((entry) => entry.id === id);
  if (item?.actionId && typeof handleAction === "function") {
    handleAction(item.actionId);
    return;
  }
  if (!item?.windowName) return;
  openWindow(item.windowName);
  const target = getWindow(item.windowName);
  if (target) focusWindow(target);
}

function clearSystemNotifications() {
  systemNotifications.splice(0);
  unreadSystemNotifications = 0;
  updateNotificationIndicator();
  renderNotificationCenter();
  saveDeskState();
}

function isSystemReceiptStatusMessage(message) {
  const normalized = String(message || "").toLowerCase();
  return /(failed|could not|not responding|connection error|error|stopped|aborted|needs a loaded local model|失败|无法|未能|没有响应|连接失败|没有读懂|没有可用|需要已加载|已停止|已取消)/.test(normalized);
}

function firstActiveLongTaskKey() {
  return activeLongTasks.values().next().value || "";
}

function markActiveLongTaskFailed(message) {
  const key = firstActiveLongTaskKey();
  if (!key) return "";
  const task = activeLongTaskDetails.get(key);
  if (!task) return "";
  task.failed = true;
  task.failureMessage = message;
  if (!task.notificationId) return "";
  return pushSystemNotification(message, {
    replaceId: task.notificationId,
    state: "failed",
    windowName: task.windowName,
    actionLabelKey: "open",
  });
}

// The status line belongs to the window doing the work. There is still exactly
// one #status element - two elements would mean two truths - and it moves into
// the active window's own host. Its home host lives in ClioTalk's info bar,
// which is where it used to be permanently: with ClioTalk closed, which is the
// normal writing layout, every message the product sent was written into an
// element with a zero-sized box. A refused Save then looked like a dead key.
function statusHostForActiveWindow() {
  // The window the writer is working in, which is not always the window in
  // front: the route raises the manuscript beside the surface being edited, so
  // a message about the Question Sheet would otherwise appear in the manuscript.
  const stop = typeof currentWritingRouteStop === "function" ? currentWritingRouteStop() : "";
  const active = (stop && typeof getWindow === "function" ? getWindow(stop) : null)
    || document.querySelector(".window.is-active:not(.is-hidden)");
  const own = active?.querySelector?.("[data-status-host]");
  if (own && !own.closest(".is-hidden")) return own;
  return document.querySelector("[data-status-home]") || null;
}

function syncStatusHost() {
  if (!statusEl) return;
  const host = statusHostForActiveWindow();
  if (!host || statusEl.parentElement === host) return;
  host.append(statusEl);
}

// Clearing the status line is an intention, not a message. It used to be
// spelled `clearStatus()`, and the element decided whether to hide
// itself by comparing its own text against the **translated** word for
// "Ready" — so rewording that one string in either language would have quietly
// stopped every clear in the product from working, with nothing to fail.
function clearStatus() {
  setStatus("");
}

function setStatus(text, options = {}) {
  const message = decorateStatusMessage(text);
  syncStatusHost();
  statusEl.textContent = message;
  statusEl.hidden = !String(message).trim();
  // An always-drawn empty box is dead chrome: it asks a question ("what is
  // this for?") and never answers it. The row keeps its height so a receipt
  // never shoves the layout, but the frame is only drawn when there is
  // something to read.
  document.querySelectorAll(".window-status-strip").forEach((strip) => {
    strip.classList.toggle("has-message", strip.contains(statusEl) && !statusEl.hidden);
  });
  const shouldNotify = options.notify === true || (options.notify !== false && isSystemReceiptStatusMessage(message));
  if (!shouldNotify) return;
  const updatedTaskNotification = isSystemReceiptStatusMessage(message) ? markActiveLongTaskFailed(message) : "";
  if (!updatedTaskNotification) {
    pushSystemNotification(message, {
      state: options.state || "",
      windowName: options.windowName || "",
      actionLabel: options.actionLabel || "",
      actionLabelKey: options.actionLabelKey || (options.actionLabel ? "" : "open"),
    });
  }
}

function formatTeachTextSourceMeta(meta = {}) {
  return [
    meta.source ? `Source: ${meta.source}` : "",
    meta.title ? `Title: ${meta.title}` : "",
    meta.outline ? `Outline: ${meta.outline}` : "",
    Array.isArray(meta.clips) && meta.clips.length ? `Clips: ${meta.clips.join(", ")}` : "",
    meta.url ? `URL: ${meta.url}` : "",
    `Inserted: ${new Date().toLocaleString()}`,
  ].filter(Boolean).join("\n");
}

function teachTextStartsWithTitle(text, title) {
  if (!title) return false;
  const firstLine = String(text || "").trimStart().split("\n")[0]?.trim() || "";
  return firstLine.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === String(title).trim().toLowerCase();
}

function formatTeachTextInsertion(content, meta = {}) {
  const text = String(content || "").trim();
  if (!text) return "";
  const heading = meta.title && !teachTextStartsWithTitle(text, meta.title) ? `### ${meta.title.trim()}` : "";
  if (meta.plain) return [heading, text].filter(Boolean).join("\n\n").trim();
  const source = formatTeachTextSourceMeta(meta);
  return [heading, text, source ? `<!-- AI System 6 insertion\n${source}\n-->` : ""].filter(Boolean).join("\n\n").trim();
}

function insertIntoTeachText(content, meta = {}) {
  const insertBody = formatTeachTextInsertion(content, meta);
  if (!insertBody) return false;
  if (getWindow("teachText").classList.contains("is-hidden")) {
    if (typeof activateTeachTextManuscriptTab === "function") activateTeachTextManuscriptTab({ focus: false });
    else newTextDocument();
  } else if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) {
    activateTeachTextManuscriptTab({ focus: false });
  }

  const start = teachTextBodyInput.selectionStart ?? teachTextBodyInput.value.length;
  const end = teachTextBodyInput.selectionEnd ?? teachTextBodyInput.value.length;
  const before = teachTextBodyInput.value.slice(0, start);
  const after = teachTextBodyInput.value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !insertBody.endsWith("\n") ? "\n\n" : "";
  const insertText = `${prefix}${insertBody}${suffix}`;
  teachTextBodyInput.value = `${before}${insertText}${after}`;
  const cursor = before.length + insertText.length;
  teachTextBodyInput.setSelectionRange(cursor, cursor);
  markTeachTextModified();
  updateTeachTextBoundaries();
  updateTeachTextTranslateButton();
  updateTeachTextBilingualExportButton();
  openWindow("teachText");
  teachTextBodyInput.focus();
  return true;
}

function updateLongTaskControls() {
  const busy = activeLongTasks.size > 0;
  document.body.classList.toggle("is-busy", busy);
  longTaskControlSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((control) => {
      control.disabled = busy;
    });
  });
  document.querySelectorAll("[data-long-task='draft-section']").forEach((control) => {
    control.disabled = busy;
  });
  setComposerSubmitMode(busy || !!activeAbortController || form.classList.contains("is-generating"));
  window.AISystem6ControlStrip?.refreshStrip?.();
}

function longTaskReceiptInfo(key, statusText = "") {
  const fallback = String(statusText || t("working_locally")).replace(/\.\.\.$/, "");
  const info = {
    "generate-outline": { label: t("outline"), windowName: "outline" },
    "organize-question-sheet": { label: t("question_sheet"), windowName: "questionSheet" },
    "expand-outline": { label: t("outline"), windowName: "outline" },
    "outline-mingming": { label: t("outline"), windowName: "outline" },
    "writing-tool": { label: t("writing_tools"), windowName: "" },
    "revise-draft": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "polish-draft": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "suggest-draft": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "eli5-rewrite-section": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "eli5-review-section": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "draft-section": { label: t("section_drafts"), windowName: "sectionDrafts" },
    "claim-check": { label: t("review_desk"), windowName: "reviewDesk" },
    "claim-check-section": { label: t("review_desk"), windowName: "reviewDesk" },
    "style-check": { label: t("review_desk"), windowName: "reviewDesk" },
    "style-check-section": { label: t("review_desk"), windowName: "reviewDesk" },
    "mingming-review-section": { label: t("review_desk"), windowName: "reviewDesk" },
    "mingming-handoff-review": { label: t("review_desk"), windowName: "reviewDesk" },
    "mingming-handoff-backstage-review": { label: t("review_desk"), windowName: "reviewDesk" },
    "marp-slides": { label: "Marp", windowName: "clioStage" },
    "translate-document": { label: t("translate"), windowName: "teachText" },
    "translate-selection": { label: t("translate"), windowName: "teachText" },
    "bilingual-export": { label: t("project_cd"), windowName: "projectCd" },
    "dictionary": { label: t("dictionary"), windowName: "dictionary" },
    "docmap": { label: t("docmap"), windowName: "docMap" },
    "docmap-question-sheet": { label: t("question_sheet"), windowName: "questionSheet" },
    "reader-manuscript-polish": { label: t("reader"), windowName: "reader" },
    "rebuild-flow": { label: t("rebuild_article"), windowName: "rebuildFlow" },
  }[key] || {};
  return {
    label: info.label || fallback,
    windowName: info.windowName || "",
  };
}

function beginLongTask(key, statusText = "") {
  if (activeAbortController || activeLongTasks.size > 0) {
    setStatus(t("task_already_running", localModelState.task || t("working_locally")));
    return false;
  }
  activeAbortController = new AbortController();
  activeLongTasks.add(key);
  const receipt = longTaskReceiptInfo(key, statusText);
  const shouldCreateReceipt = key !== "dictionary";
  const notificationId = shouldCreateReceipt
    ? pushSystemNotification(t("notification_task_started", receipt.label), {
        messageKey: "notification_task_started",
        messageArgs: [receipt.label],
        state: "running",
        windowName: receipt.windowName,
        actionLabelKey: "open",
      })
    : "";
  activeLongTaskDetails.set(key, {
    ...receipt,
    statusText,
    notificationId,
    failed: false,
    failureMessage: "",
  });
  updateLocalModelState({ running: true, task: statusText || t("working_locally") });
  if (statusText) setStatus(statusText, { notify: false });
  updateLongTaskControls();
  return true;
}

function endLongTask(key) {
  const cancelled = activeAbortController?.signal?.aborted === true;
  const task = activeLongTaskDetails.get(key);
  activeLongTasks.delete(key);
  activeLongTaskDetails.delete(key);
  if (!activeLongTasks.size) activeAbortController = null;
  updateLocalModelState({ running: false, task: "" });
  updateLongTaskControls();
  if (cancelled) {
    if (task?.notificationId) {
      pushSystemNotification(t("notification_task_stopped", task.label), {
        messageKey: "notification_task_stopped",
        messageArgs: [task.label],
        replaceId: task.notificationId,
        state: "stopped",
        windowName: task.windowName,
        actionLabelKey: "open",
      });
    }
    setStatus(t("stopped"), { notify: false });
  } else if (task?.failed) {
    if (task.notificationId && task.failureMessage) {
      pushSystemNotification(task.failureMessage, {
        replaceId: task.notificationId,
        state: "failed",
        windowName: task.windowName,
        actionLabelKey: "open",
      });
    }
  } else {
    if (task?.notificationId) {
      pushSystemNotification(t("notification_task_done", task.label), {
        messageKey: "notification_task_done",
        messageArgs: [task.label],
        replaceId: task.notificationId,
        state: "done",
        windowName: task.windowName,
        actionLabelKey: "open",
      });
    }
    playSystemSound("done");
  }
  return cancelled;
}

function getLongTaskSignal() {
  return activeAbortController?.signal;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function decorateStatusMessage(text) {
  const message = String(text || "");
  if (!message || isPlainStatusMessage(message)) return message;
  if (/Searcher|DuckDuckGo|网页搜索|寻源|Bing/i.test(message)) return message;

  const explanation = explainStatusError(message);
  if (!explanation || message.includes(explanation)) return message;
  return `${message} · ${explanation}`;
}

// Messages that are already plain: nothing is appended to them. "Ready" is not
// in the list any more because it is no longer a message — clearStatus() passes
// an empty string, which never reaches here.
function isPlainStatusMessage(message) {
  return [
    t("saved"),
    t("thinking"),
    t("stopped"),
    t("translating_document"),
    t("translating_selection"),
    t("checking_style"),
    t("reader_fetching"),
  ].includes(message);
}

function explainStatusError(message) {
  const normalized = message.toLowerCase();
  const rules = [
    {
      match: /(lmstudio_context_length|context length|tokens to keep|too many tokens|prompt.*too long|input.*too long|shorter input|larger context|上下文|输入.*太长)/,
      zh: "说明：超上下文限制。请缩短输入或调大 context length。",
      en: "Note: Exceeds context. Shorten input or raise context length.",
    },
    {
      match: /(lmstudio_server_offline|failed to fetch|fetch failed|networkerror|econnrefused|connection refused|not responding|无法连接|连接失败|没有响应)/,
      zh: "说明：本地服务无响应。请确认服务已开启。",
      en: "Note: Local server offline. Make sure it is running.",
    },
    {
      match: /(lmstudio_endpoint_missing|404|not found|找不到)/,
      zh: "说明：端点路径错误。请检查服务 API 设置。",
      en: "Note: Wrong endpoint. Check API settings.",
    },
    {
      match: /(lmstudio_model_not_loaded|model .*not found|model_not_found|no models found|model does not exist|model .*not loaded|no model loaded|未找到模型|找不到模型|模型.*未加载)/,
      zh: "说明：模型未加载。请在控制面板选择并加载。",
      en: "Note: Model not loaded. Select and Load in Control Panel.",
    },
    {
      match: /(lmstudio_timeout|timeout|timed out|aborted|超时)/,
      zh: "说明：请求超时。请缩短文本或稍后重试。",
      en: "Note: Request timed out. Shorten text or retry.",
    },
    {
      match: /(empty writing object pack stream|empty translation|lmstudio_bad_response|did not include choices|malformed|unexpected token|invalid json|坏格式|格式异常)/,
      zh: "说明：格式异常。请重试或简化任务。",
      en: "Note: Bad response. Retry or simplify task.",
    },
    {
      match: /(401|403|unauthorized|forbidden|api key|认证|权限)/,
      zh: "说明：认证失败，请检查服务设置。",
      en: "Note: Auth failed. Check service settings.",
    },
    {
      match: /(500|502|503|internal server error|bad gateway|service unavailable|服务器错误)/,
      zh: "说明：本地服务错误，请稍后重试。",
      en: "Note: Local server error. Retry later.",
    },
  ];
  const rule = rules.find((item) => item.match.test(normalized));
  if (!rule) return "";
  return currentLanguage === "zh" ? rule.zh : rule.en;
}

// Failure-path lane: never let the transport's own words become product
// copy. error.message can be a raw error code ("lmstudio_server_offline:
// ..."), an HTTP status line, or a JS runtime message — none of it is
// something a writer can act on, and an English transport string can land
// under a Chinese UI untranslated. classifyLmStudioError first checks for a
// cloud_* code that already has its own direct translation (cloud_invalid_key,
// cloud_insufficient_balance, etc.); a local lmstudio_* shape is replaced by
// the matching localized note (explainStatusError); anything else that still
// looks like a raw diagnostic (a code-style prefix, or plain ASCII text
// surfacing under the zh UI) falls back to the generic connection_error copy
// instead of leaking through untranslated. A message that is neither of
// those is assumed to already be human copy in the current language and
// passes through unchanged.
function friendlyErrorDetail(error) {
  const raw = String(error?.message || error || "").trim();
  if (!raw) return t("connection_error");
  const code = typeof classifyLmStudioError === "function" ? classifyLmStudioError(raw) : "";
  if (code && code.startsWith("cloud_")) return t(code);
  const explanation = explainStatusError(raw);
  if (explanation) return explanation;
  const looksLikeRawDiagnostic = /^[a-z][a-z0-9]*(?:_[a-z0-9]+){1,4}\s*:/i.test(raw)
    || (currentLanguage === "zh" && !/[一-鿿]/.test(raw));
  return looksLikeRawDiagnostic ? t("connection_error") : raw;
}

// Consumer-facing failure copy for a route command that asked a model: what
// happened, then the action that fixes it. Diagnostics stay in the console.
// Lives in this core module (not a lazy feature file) so every lazy route
// surface — Outline, Section Drafts, and any future one — can call it
// without needing another lazy module loaded first.
async function reportWritingRouteModelFailure(error, taskLabel) {
  const detail = friendlyErrorDetail(error);
  const headline = currentLanguage === "zh"
    ? `「${taskLabel}」没有完成。`
    : `${taskLabel} could not finish.`;
  const message = [headline, detail].filter(Boolean).join(" ");
  setStatus(message);
  const offline = typeof modelReadyForRequests === "function" && !modelReadyForRequests();
  try {
    if (offline) {
      const openControl = await showSystemModal(
        currentLanguage === "zh"
          ? `${message}\n\n要现在打开控制面板接一个模型吗？`
          : `${message}\n\nOpen Control Panel to connect a model?`,
        "confirm",
      );
      if (openControl === "yes") handleAction("open-control");
      return;
    }
    await showSystemModal(message, "alert");
  } catch {
    // Keep the status text if the modal cannot open.
  }
}

function classifyLmStudioError(error, response = null) {
  const message = String(error?.message || error || response?.statusText || "");
  const lower = message.toLowerCase();
  const isCloudError = /cloud api|deepseek|cloud proxy|cloud_invalid|cloud_insufficient|cloud_rate|shared_cloud/.test(lower);
  if (/shared_cloud_(?:session_limit|daily_request_limit|daily_token_limit)/.test(lower)) {
    return "cloud_shared_limit";
  }
  if (
    /cloud_invalid_key/.test(lower)
    || (isCloudError && (response?.status === 401 || /authentication.*fail|unauthorized|invalid.*api key|api key.*invalid|missing api key/.test(lower)))
  ) return "cloud_invalid_key";
  if (
    /cloud_insufficient_balance/.test(lower)
    || (isCloudError && (response?.status === 402 || /insufficient.*balance|balance.*insufficient/.test(lower)))
  ) return "cloud_insufficient_balance";
  if (
    /cloud_rate_limit/.test(lower)
    || (isCloudError && (response?.status === 429 || /rate limit|too many requests/.test(lower)))
  ) return "cloud_rate_limit";
  if (
    /cloud_invalid_request/.test(lower)
    || (isCloudError && (
      [400, 422].includes(response?.status)
      || /invalid (?:format|parameter|request)|unprocessable/.test(lower)
    ))
  ) return "cloud_invalid_request";
  if (/shared_cloud_input_too_large/.test(lower)) return "lmstudio_context_length";
  if (
    /cloud_service_unavailable/.test(lower)
    || (isCloudError && (
      [500, 503].includes(response?.status)
      || /server error|service unavailable|overloaded/.test(lower)
    ))
  ) return "cloud_service_unavailable";
  if (/context length|tokens to keep|too many tokens|prompt.*too long|input.*too long|shorter input|larger context/.test(lower)) return "lmstudio_context_length";
  if (/failed to fetch|fetch failed|networkerror|econnrefused|connection refused|not responding/.test(lower)) return "lmstudio_server_offline";
  if (/timeout|timed out|aborted/.test(lower)) return "lmstudio_timeout";
  if (/model .*not found|model_not_found|model does not exist|model .*not loaded|no model loaded/.test(lower)) return "lmstudio_model_not_loaded";
  if (/did not include choices|empty writing object pack stream|empty translation|malformed|unexpected token|invalid json/.test(lower)) return "lmstudio_bad_response";
  if (response?.status === 404) return "lmstudio_endpoint_missing";
  if ([502, 503, 504].includes(response?.status)) return "lmstudio_server_offline";
  return "";
}

async function readChatJson(response) {
  const data = await response.json().catch((error) => {
    throw new Error(`lmstudio_bad_response: ${error.message}`);
  });
  if (!response.ok) {
    const detail = data.detail || data.error || response.statusText || `HTTP ${response.status}`;
    const code = data.code || classifyLmStudioError(detail, response);
    throw new Error([code, detail].filter(Boolean).join(": "));
  }
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error("lmstudio_bad_response: response did not include choices[0].message.content");
  }
  return data;
}
