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

/**
 * Snapshot the backing globals a store commit may touch.
 * @param {string[]} names
 */
function snapshotStoreState(names) {
  /** @type {Record<string, any[]>} */
  const snapshot = {};
  names.forEach((name) => {
    const source = globalThis[name];
    snapshot[name] = Array.isArray(source) ? structuredClone(source) : source;
  });
  return snapshot;
}

/** Restore backing globals from a snapshot taken before the commit. */
function restoreStoreState(snapshot) {
  Object.entries(snapshot).forEach(([name, value]) => {
    const target = globalThis[name];
    if (Array.isArray(value) && Array.isArray(target)) {
      target.splice(0, target.length, ...value);
    } else if (name in globalThis) {
      globalThis[name] = value;
    }
  });
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
    /** @param {(state: { projects: any[] }) => void} updater */
    async commit(updater) {
      const snapshot = snapshotStoreState(["projects", "chatFiles", "chatFolders", "scraps", "projectCdItems", "trashItems", "projectReferences"]);
      try {
        updater({ projects });
        const saved = await saveDeskState();
        if (!saved) throw storePersistError();
        projectStoreBus.emit({ projects: projects.length });
        return { ok: true };
      } catch (error) {
        restoreStoreState(snapshot);
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
    /** @param {(state: { project: any | null }) => void} updater */
    async commit(updater) {
      const snapshot = snapshotStoreState(["projects", "chatFiles", "chatFolders", "scraps", "projectCdItems", "trashItems", "projectReferences"]);
      try {
        const project = typeof getActiveProject === "function" ? getActiveProject() : null;
        updater({ project });
        const saved = await saveDeskState();
        if (!saved) throw storePersistError();
        renderPipeline?.();
        writingStoreBus.emit({ projectId: project?.id || "" });
        return { ok: true };
      } catch (error) {
        restoreStoreState(snapshot);
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
      const snapshot = snapshotStoreState(["projects", "chatFiles", "chatFolders", "scraps", "projectCdItems", "trashItems", "projectReferences"]);
      try {
        updater({ environment: runtimeEnvironment });
        const saved = await saveDeskState();
        if (!saved) throw storePersistError();
        updateMenuState?.();
        desktopStoreBus.emit({ environment: runtimeEnvironment });
        return { ok: true };
      } catch (error) {
        restoreStoreState(snapshot);
        desktopStoreBus.emitError(error);
        throw error;
      }
    },
    subscribe: desktopStoreBus.subscribe,
  },
});
