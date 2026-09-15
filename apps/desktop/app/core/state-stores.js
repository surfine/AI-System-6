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
 * awaited, persists through the same commit queue every plain save uses, and
 * only emits the success event after the write actually landed. A commit
 * holds the queue from the moment it reads its baseline until it has
 * converged, so a queued operation cannot touch the shared objects the one
 * ahead of it is still working from.
 *
 * If persistence fails, only the records THIS commit changed are put back,
 * and only while they still say what this commit left there. An edit the
 * writer made while the save was in flight outranks the rollback: it stays on
 * screen, unsaved, instead of being overwritten by an older copy. The commit
 * then rejects with { code: "STORE_PERSIST_FAILED" } and listeners receive an
 * error event instead of a success event.
 */

/** @typedef {(change: { store: string; detail?: any }) => void} StoreListener */
/** @typedef {{ target: any[], id: string, kind: "created"|"updated"|"deleted", before?: any, after?: string, index?: number }} RecordChange */

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

// One queue for the whole desk.
//
// Reading a baseline, applying a change and persisting it was three steps any
// two operations could interleave. Only serialising the write stage is not
// enough: the second operation reads the first one's half-applied arrays as
// its "old state", and a failed first operation then restores a snapshot that
// never contained the second one's work at all.
//
// So a commit holds this slot for its WHOLE operation - baseline, change,
// apply, persist, converge - and a plain saveDeskState() call queues on the
// same slot, which is why the public entry point and the in-queue persist step
// have to stay distinguishable. A task that awaits the public entry while
// holding the slot would wait for itself.
const deskCommitQueue = (() => {
  /** @type {Promise<any>} */
  let tail = Promise.resolve();
  return {
    /**
     * Run `task` once every earlier queued task has settled. A refusal is the
     * caller's answer, never the queue's: the tail swallows it so the next
     * operation still runs.
     * @template T
     * @param {() => Promise<T>} task
     * @returns {Promise<T>}
     */
    enqueue(task) {
      const run = tail.then(() => task());
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  };
})();

window.AISystem6DeskCommits = Object.freeze({
  /**
   * Queue work in the desk's single commit slot. persistence-status.js routes
   * every save through here so a store commit and a plain save cannot overlap.
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  enqueue: (task) => deskCommitQueue.enqueue(task),
});

/** The identity a desk record keeps across commits. @param {any} item @param {number} [index] */
function deskStoreRecordIdentity(item, index = -1) {
  const identity = item?.id ?? item?._storageId;
  if (identity === undefined || identity === null || identity === "") return `#${index}`;
  return String(identity);
}

/** One definition of what a record's content is, shared with persistence-status.js. @param {any} item */
function deskStoreRecordFingerprint(item) {
  return JSON.stringify(item);
}

/**
 * Merge `draft` onto the live array in place, preserving every record object,
 * and describe what moved so a refused commit can put back exactly its own
 * change. `changes` is shared across the collections of one commit.
 * @param {any[]} target
 * @param {any[]} draft
 * @param {RecordChange[]} changes
 */
function applyDeskDraft(target, draft, changes) {
  const before = new Map();
  target.forEach((item, index) => {
    before.set(deskStoreRecordIdentity(item, index), { index, clone: structuredClone(item) });
  });
  mergeArrayPreservingIdentity(target, draft);
  const seen = new Set();
  target.forEach((item, index) => {
    const id = deskStoreRecordIdentity(item, index);
    seen.add(id);
    const previous = before.get(id);
    const after = deskStoreRecordFingerprint(item);
    if (!previous) {
      changes.push({ target, id, kind: "created", after });
      return;
    }
    if (deskStoreRecordFingerprint(previous.clone) !== after) {
      changes.push({ target, id, kind: "updated", before: previous.clone, after });
    }
  });
  before.forEach((previous, id) => {
    if (!seen.has(id)) {
      changes.push({ target, id, kind: "deleted", before: previous.clone, index: previous.index });
    }
  });
}

/**
 * Restore one record from its own before-copy without replacing the object a
 * caller elsewhere may still be holding. Recursing into plain objects and
 * id-keyed arrays keeps nested drafts and tabs as live as the record itself.
 * @param {any} record
 * @param {any} snapshot
 */
function restoreDeskRecordInPlace(record, snapshot) {
  Object.keys(record).forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field)) delete record[field];
  });
  Object.keys(snapshot).forEach((field) => {
    const value = snapshot[field];
    const current = record[field];
    if (Array.isArray(current) && Array.isArray(value)) {
      mergeArrayPreservingIdentity(current, value);
      return;
    }
    if (
      current && value
      && typeof current === "object" && typeof value === "object"
      && !Array.isArray(current) && !Array.isArray(value)
    ) {
      restoreDeskRecordInPlace(current, value);
      return;
    }
    record[field] = value;
  });
}

/**
 * Put back this commit's own change, and only while it is still safe to do so.
 *
 * A change is safe to withdraw when the record still says exactly what this
 * commit left there: no later keystroke, no other operation, no remote merge.
 * Anything else is somebody's newer work, so the record stays as it is and is
 * reported back as still-unsaved rather than reverted. A created record is
 * removed only while it is still this commit's own creation; an undone
 * deletion is restored only when nothing has taken that id since.
 *
 * @param {RecordChange[]} changes
 * @returns {RecordChange[]} the changes that could not be withdrawn
 */
function revertDeskDraftChanges(changes) {
  /** @type {RecordChange[]} */
  const kept = [];
  [...changes].reverse().forEach((change) => {
    const index = change.target.findIndex(
      (item, position) => deskStoreRecordIdentity(item, position) === change.id
    );
    if (change.kind === "deleted") {
      if (index >= 0) {
        kept.push(change);
        return;
      }
      const at = Math.min(Math.max(0, change.index ?? change.target.length), change.target.length);
      change.target.splice(at, 0, change.before);
      return;
    }
    if (index < 0) {
      // The record is gone: this rollback cannot speak for it any more.
      kept.push(change);
      return;
    }
    const live = change.target[index];
    if (deskStoreRecordFingerprint(live) !== change.after) {
      // A later edit, another operation or a remote merge owns the record now.
      kept.push(change);
      return;
    }
    if (change.kind === "created") change.target.splice(index, 1);
    else restoreDeskRecordInPlace(live, change.before);
  });
  return kept;
}

/**
 * Persist once without re-entering the commit queue: the caller already holds
 * the slot. Awaiting the public saveDeskState() here would queue behind the
 * task making the call. persistDeskState() is the in-queue step; a context
 * that loaded the stores without the persistence module still gets a save.
 * @returns {Promise<boolean>}
 */
function persistDeskStateForCommit() {
  if (typeof persistDeskState === "function") return persistDeskState();
  return saveDeskState();
}

// The Writing updater is handed the project record; the smallest honest
// snapshot is the project list it can mutate.
function snapshotWritingState() {
  return { projects: structuredClone(projects) };
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
 * A change this commit could not withdraw is not lost text: it is text the
 * user can still see and the disk does not have. Say so, so the write is
 * retried rather than reported as saved.
 * @param {RecordChange[]} kept
 */
function reportUnwithdrawnDeskChanges(kept) {
  if (!kept.length) return;
  if (typeof noteUnwithdrawnDeskChanges !== "function") return;
  try {
    noteUnwithdrawnDeskChanges(kept);
  } catch (error) {
    console.warn("Could not mark the unwithdrawn changes as unsaved.", error);
  }
}

/**
 * Tell the persistence layer which records this commit applied.
 *
 * Three bindings share another collection's record: the CD items and the
 * references are fields of the project they belong to, and the Trash is its
 * own store. Saying what moved is what lets the save plan carry those records
 * instead of fingerprinting the whole desk to find them.
 *
 * @param {RecordChange[]} changes
 */
function reportDeskDraftChanges(changes) {
  if (!changes.length) return;
  const byTarget = new Map(projectStateBindings().map(([binding, target]) => [
    target,
    binding === "trashItems" ? "trash"
      : binding === "projectCdItems" || binding === "projectReferences" ? "projects" : binding,
  ]));
  changes.forEach((change) => {
    const collection = byTarget.get(change.target);
    if (!collection) return;
    // Through the public desk API, not a bare name: this module also loads
    // alone in the contract tests, where the persistence functions are absent.
    const desk = window.AISystem6DeskPersistence;
    if (change.kind === "deleted") desk?.markDeleted?.(collection, change.id);
    else desk?.markDirty?.(collection, change.id);
  });
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

/**
 * Watch one slice of a store instead of the whole desk.
 *
 * The subscribe contract is unchanged - the helper only decides WHAT the
 * listener is told and WHEN. The selector runs on each store event and gets
 * the change detail with it (a commit knows which records it touched, so a
 * view can answer "is this mine" without walking the whole collection), the
 * listener is called only when the selected value actually moved, and the
 * value handed over is whatever the selector produced rather than the live
 * record. Error events are not data changes and are not forwarded.
 *
 * @param {{ name?: string, subscribe: (listener: StoreListener) => () => void }} store
 * @param {(change: any) => any} select
 * @param {{ immediate?: boolean, isEqual?: (left: any, right: any) => boolean }} [options]
 * @returns {(listener: (value: any, change: any) => void) => () => void}
 */
function watchStoreSlice(store, select, options = {}) {
  const isEqual = typeof options.isEqual === "function" ? options.isEqual : Object.is;
  return (listener) => {
    let hasValue = false;
    let current;
    const deliver = (change) => {
      if (change?.type === "error") return;
      const next = select(change);
      if (hasValue && isEqual(current, next)) return;
      hasValue = true;
      current = next;
      listener(next, change);
    };
    if (options.immediate !== false) deliver({ store: store?.name || "", detail: null, initial: true });
    return store.subscribe(deliver);
  };
}

const projectStoreBus = createStateStore("projects");
const writingStoreBus = createStateStore("writing");
const contextStoreBus = createStateStore("context");
const runStoreBus = createStateStore("runs");
const desktopStoreBus = createStateStore("desktop");

window.AISystem6StateStores = Object.freeze({
  /**
   * Watch one slice of one store. `watch(stores.projects, (change) => change.detail?.projectId)`
   * calls the listener with the selected value and the change that produced
   * it, and returns the store's own unsubscribe function.
   */
  watch: watchStoreSlice,
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
      return deskCommitQueue.enqueue(async () => {
        const draft = snapshotProjectState();
        /** @type {RecordChange[]} */
        const changes = [];
        try {
          updater(draft);
          projectStateBindings().forEach(([key, target]) => applyDeskDraft(target, draft[key], changes));
          reportDeskDraftChanges(changes);
          const saved = await persistDeskStateForCommit();
          if (!saved) throw storePersistError();
        } catch (error) {
          reportUnwithdrawnDeskChanges(revertDeskDraftChanges(changes));
          projectStoreBus.emitError(error);
          throw error;
        }
        // Past this line the write is on disk. Follow-up below may fail; it
        // may not put the records back, and it may not turn a committed save
        // into a failure.
        try {
          renderPipeline?.();
        } catch (error) {
          console.warn("The workspace could not repaint after a committed project save.", error);
        }
        projectStoreBus.emit({ projects: projects.length });
        return { ok: true };
      });
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
      return deskCommitQueue.enqueue(async () => {
        const draft = snapshotWritingState();
        /** @type {RecordChange[]} */
        const changes = [];
        try {
          updater(draft);
          // Merged by id, never spliced in wholesale: getActiveProject() hands
          // callers one of these objects, and an AI write that spans an await
          // holds that reference. Replacing every element strands it.
          applyDeskDraft(projects, draft.projects, changes);
          reportDeskDraftChanges(changes);
          const saved = await persistDeskStateForCommit();
          if (!saved) throw storePersistError();
        } catch (error) {
          reportUnwithdrawnDeskChanges(revertDeskDraftChanges(changes));
          writingStoreBus.emitError(error);
          throw error;
        }
        // A repaint or a listener that fails after the transaction committed
        // is an interface problem. The writing is saved, so neither may be
        // reported as a failed save, and neither may roll the record back.
        try {
          renderPipeline?.();
        } catch (error) {
          console.warn("The writing route could not repaint after a committed save.", error);
        }
        const project = typeof getActiveProject === "function" ? getActiveProject() : null;
        writingStoreBus.emit({ projectId: project?.id || "" });
        return { ok: true };
      });
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
