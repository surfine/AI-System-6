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
 */

/** @typedef {(change: { store: string; detail?: any }) => void} StoreListener */

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
    commit(updater) {
      updater({ projects });
      saveDeskState();
      projectStoreBus.emit({ projects: projects.length });
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
    commit(updater) {
      const project = typeof getActiveProject === "function" ? getActiveProject() : null;
      updater({ project });
      saveDeskState();
      renderPipeline?.();
      writingStoreBus.emit({ projectId: project?.id || "" });
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
    },
    subscribe: runStoreBus.subscribe,
  },
  /** Desktop environment: runtime mode, workspace profile, window state. */
  desktop: {
    runtimeEnvironment: () => (typeof runtimeEnvironment !== "undefined" ? runtimeEnvironment : "finder"),
    workspaceProfile: () => (typeof workspaceProfile !== "undefined" ? workspaceProfile : "writing"),
    /** @param {(state: { environment: string }) => void} updater */
    commit(updater) {
      updater({ environment: runtimeEnvironment });
      saveDeskState();
      updateMenuState?.();
      desktopStoreBus.emit({ environment: runtimeEnvironment });
    },
    subscribe: desktopStoreBus.subscribe,
  },
});
