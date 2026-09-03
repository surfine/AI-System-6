// @ts-check
/**
 * State boundary stores.
 *
 * Five facades encapsulate the existing global state so new code stops
 * reaching into shared mutable globals directly. Each store wraps the current
 * source of truth (no behavior change), routes every write through one commit
 * path, and notifies subscribers. This is encapsulation, not a rewrite: the
 * legacy globals remain the backing state until they are migrated one at a
 * time.
 *
 *   ProjectStore  projects / chatFiles / chatFolders / scraps
 *   WritingStore  Question Sheet, Outline, Drafts, TeachText surfaces
 *   ContextStore  retrieval budget, retrieved items, rag chunks
 *   RunStore      run records and task manifests
 *   DesktopStore  runtime environment, workspace profile, windows
 *
 * Commit contract (Project / Writing / Desktop stores): every commit is
 * awaited, persists through saveDeskState(), and only emits the success
 * event after the write actually landed. If persistence fails, the backing
 * globals are rolled back to their pre-commit snapshot and the commit
 * rejects with { code: "STORE_PERSIST_FAILED" }; listeners receive an error
 * event instead of a success event.
 */

/** @typedef {(change: { store: string; detail?: any }) => void} StoreListener */

// Explicit snapshots of the real lexical bindings. These arrays are
// classic-script top-level consts — NOT window/globalThis properties — so a
// name->globalThis reflection would silently capture undefined and rollback
// would do nothing in the browser. The bindings are resolved INSIDE the
// functions: some of these arrays are declared later in the bundle, so a
// top-level reference would hit the temporal dead zone at load.
function projectStateBindings() {
  return [
    ["projects", projects],
    ["chatFiles", chatFiles],
    ["chatFolders", chatFolders],
    ["scraps", scraps],
    ["imageAttachments", imageAttachments],
    ["projectCdItems", projectCdItems],
    ["trashItems", trashItems],
    ["projectReferences", projectReferences],
  ];
}

function snapshotProjectState() {
  /** @type {Record<string, any[]>} */
  const snapshot = {};
  projectStateBindings().forEach(([name, value]) => {
    snapshot[name] = structuredClone(value);
  });
  return snapshot;
}

// A plain splice-to-clone replaces every element's identity, not just the
// ones the updater actually touched. getActiveProject() hands callers one of
// these objects, and an AI write that spans an await (generate-outline holds
// its own `project` reference across a model call) can still be mid-write on
// the OLD object when an unrelated commit - a run receipt landing in between
// - swaps every project out from under it: the write then lands on an object
// no longer in the live array, and is silently lost. Match by id and merge
// fields onto the existing object in place instead, so a reference taken
// before this commit is still the live one after it - the same reason
// applyDeskRecordChanges (persistence-status.js) merges the records another
// window announces rather than replacing the slot.
function mergeArrayPreservingIdentity(target, source) {
  if (!Array.isArray(target) || !Array.isArray(source)) return;
  const identityOf = (item) => item?.id ?? item?._storageId;
  const targetByIdentity = new Map(target.map((item) => [identityOf(item), item]));
  const merged = source.map((item) => {
    const identity = identityOf(item);
    const existing = identity !== undefined ? targetByIdentity.get(identity) : undefined;
    if (!existing) return item;
    Object.keys(existing).forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(item, field)) delete existing[field];
    });
    Object.assign(existing, item);
    return existing;
  });
  target.splice(0, target.length, ...merged);
}

function restoreProjectState(snapshot) {
  projectStateBindings().forEach(([name, target]) => {
    mergeArrayPreservingIdentity(target, snapshot[name]);
  });
}

// The Writing updater is handed the project record; the smallest honest
// snapshot is the project list it can mutate.
function snapshotWritingState() {
  return { projects: structuredClone(projects) };
}

function restoreWritingState(snapshot) {
  mergeArrayPreservingIdentity(projects, snapshot.projects);
}

// The Desktop updater is handed the runtime environment scalar.
function snapshotDesktopState() {
  return { runtimeEnvironment };
}

function restoreDesktopState(snapshot) {
  if ("runtimeEnvironment" in snapshot) {
    runtimeEnvironment = snapshot.runtimeEnvironment;
  }
}

function storePersistError(message = "State store commit failed to persist.") {
  const error = new Error(message);
  error.code = "STORE_PERSIST_FAILED";
  return error;
}

/**
 * Minimal store factory: one commit path, one subscriber list.
 * @param {string} storeName
 */
function createStateStore(storeName) {
  /** @type {Set<StoreListener>} */
  const listeners = new Set();
  return {
    name: storeName,
    /**
     * Subscribe to store changes. Returns an unsubscribe function.
     * @param {StoreListener} listener
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** @param {any} [detail] */
    emit(detail) {
      const change = { store: storeName, detail };
      listeners.forEach((listener) => {
        try {
          listener(change);
        } catch (error) {
          console.warn(`State store ${storeName} listener failed.`, error);
        }
      });
    },
    /**
     * Emit an error event; listeners that act on success events must not
     * mistake a failed commit for a durable change.
     * @param {Error} error
     */
    emitError(error) {
      const change = { store: storeName, type: "error", error };
      listeners.forEach((listener) => {
        try {
          listener(change);
        } catch (listenerError) {
          console.warn(`State store ${storeName} error listener failed.`, listenerError);
        }
      });
    },
  };
}

const projectStoreBus = createStateStore("projects");
const writingStoreBus = createStateStore("writing");
const contextStoreBus = createStateStore("context");
const runStoreBus = createStateStore("runs");
const desktopStoreBus = createStateStore("desktop");

window.AISystem6StateStores = Object.freeze({
  /** Project Hard Disk records and project files. */
  projects: {
    list: () => projects,
    get: (id) => projects.find((project) => project.id === id) || null,
    active: () => (typeof getActiveProject === "function" ? getActiveProject() : null),
    files: () => chatFiles,
    folders: () => chatFolders,
    scraps: () => scraps,
    projectCdItems: () => projectCdItems,
    /**
     * Mutable-draft commit. The updater mutates the passed draft only; the
     * store applies that draft to the live arrays immediately before
     * persistence, then rolls back to the pre-commit snapshot on failure.
     * @param {(draft: Record<string, any[]>)} updater
     */
    async commit(updater) {
      const previous = snapshotProjectState();
      const draft = snapshotProjectState();
      try {
        updater(draft);
        restoreProjectState(draft);
        const saved = await saveDeskState();
        if (!saved) throw storePersistError();
        projectStoreBus.emit({ projects: projects.length });
        return { ok: true };
      } catch (error) {
        restoreProjectState(previous);
        projectStoreBus.emitError(error);
        throw error;
      }
    },
    subscribe: projectStoreBus.subscribe,
  },
  /** Writing route surfaces: Question Sheet, Outline, Drafts, TeachText. */
  writing: {
    project: () => (typeof getActiveProject === "function" ? getActiveProject() : null),
    questionSheet: () => (typeof questionSheetBodyInput !== "undefined" ? questionSheetBodyInput?.value || "" : ""),
    outline: () => (typeof currentOutlineMarkdown === "function" && typeof getActiveProject === "function" ? currentOutlineMarkdown(getActiveProject()) : ""),
    drafts: () => {
      const project = typeof getActiveProject === "function" ? getActiveProject() : null;
      return project?.drafts || [];
    },
    teachTextBody: () => (typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput?.value || "" : ""),
    workflowState: () => (typeof teachTextWorkflowState !== "undefined" ? teachTextWorkflowState : ""),
    /**
     * Mutable-draft commit over the project list. The updater mutates
     * `draft.projects` only; the store applies that list to the live project
     * array before persistence and rolls back on failure.
     * @param {(draft: { projects: any[] }) => void} updater
     */
    async commit(updater) {
      const previous = snapshotWritingState();
      const draft = snapshotWritingState();
      try {
        updater(draft);
        projects.splice(0, projects.length, ...draft.projects);
        const saved = await saveDeskState();
        if (!saved) throw storePersistError();
        const project = typeof getActiveProject === "function" ? getActiveProject() : null;
        renderPipeline?.();
        writingStoreBus.emit({ projectId: project?.id || "" });
        return { ok: true };
      } catch (error) {
        restoreWritingState(previous);
        writingStoreBus.emitError(error);
        throw error;
      }
    },
    subscribe: writingStoreBus.subscribe,
  },
  /** Retrieval budget, retrieved context items, and the rag chunk pool. */
  context: {
    budget: () => (typeof lastContextBudget !== "undefined" ? lastContextBudget : null),
    items: () => (typeof lastRetrievedContextItems !== "undefined" ? lastRetrievedContextItems : []),
    chunks: () => ragChunks,
    /** @param {(state: { items: any[] }) => void} updater */
    commit(updater) {
      updater({ items: lastRetrievedContextItems });
      scheduleRenderTasks?.("contextPanel");
      contextStoreBus.emit({ itemCount: lastRetrievedContextItems.length });
      return { ok: true };
    },
    subscribe: contextStoreBus.subscribe,
  },
  /** Task run records and their manifests. */
  runs: {
    lastManifest: () => (typeof window !== "undefined" ? window.lastTaskRunManifest || null : null),
    lastContextManifest: () => (typeof window !== "undefined" ? window.lastContextManifest || null : null),
    /** @param {(state: { manifest: any | null }) => void} updater */
    commit(updater) {
      updater({ manifest: window.lastTaskRunManifest || null });
      runStoreBus.emit({ capturedAt: window.lastTaskRunManifest?.capturedAt || "" });
      return { ok: true };
    },
    subscribe: runStoreBus.subscribe,
  },
  /** Desktop environment: runtime mode, workspace profile, window state. */
  desktop: {
    runtimeEnvironment: () => (typeof runtimeEnvironment !== "undefined" ? runtimeEnvironment : "finder"),
    workspaceProfile: () => (typeof workspaceProfile !== "undefined" ? workspaceProfile : "writing"),
    /** @param {(state: { environment: string }) => void} updater */
    async commit(updater) {
      const snapshot = snapshotDesktopState();
      try {
        updater({ environment: runtimeEnvironment });
        const saved = await saveDeskState();
        if (!saved) throw storePersistError();
        updateMenuState?.();
        desktopStoreBus.emit({ environment: runtimeEnvironment });
        return { ok: true };
      } catch (error) {
        restoreDesktopState(snapshot);
        desktopStoreBus.emitError(error);
        throw error;
      }
    },
    subscribe: desktopStoreBus.subscribe,
  },
});
