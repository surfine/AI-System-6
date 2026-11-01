/* ClioWorks v4 (V4-05): the impact plan and cross-file atomic update.
 *
 * Prepare candidates OUTSIDE the queue; re-verify everything INSIDE it. The
 * candidate policies (plan seal, grant vault, read fingerprints) come from the
 * vendored ClioWorksIntegration rules. The COMMIT PORT owns the durable path:
 *
 *   production: window.AISystem6DeskCommits.enqueue(() =>
 *     window.AISystem6StorageTransactions.runTransaction(db, stores,
 *       'readwrite', fence, tx => { re-read records; verify fingerprints;
 *       apply; persist })) — the desk's single commit slot, the IndexedDB
 *   write fence (epoch, stale rejection) and one durable transaction for the
 *   whole batch. Nothing half-applied can become visible: a verification
 *   failure aborts the transaction before any write, and the UI only hears
 *   "done" from the committed result.
 *
 *   tests: an injected port that reproduces the same contract semantics
 *   (serialised slot, re-read inside the slot, abort-on-mismatch) against an
 *   in-memory record store — the port shape is the same, so a port that
 *   skips re-verification fails these contracts, and the production port is
 *   source-bound to the real modules (asserted by name below).
 *
 * Compensation: undo applies ONLY when the targets still sit at the revision
 * this commit produced — a later edit outranks the rollback; the desktop's
 * global history is never rewound (补偿撤销检查后续修改，不倒退全桌面历史).
 *
 * An external message claiming user confirmation authorizes nothing: the
 * grant token is a WeakMap-held object issued by this host after a visible
 * decision (CONSENT_REQUIRED otherwise). */
(function (root) {
  'use strict';
  if (root.AISystem6UpdateCoordinator) return;

  function integration() {
    const api = root.ClioWorksIntegration;
    if (!api || typeof api.preparePlan !== 'function' || typeof api.createGrantVault !== 'function' || typeof api.executePlan !== 'function') {
      throw new Error('update-coordinator: vendor/clioworks-v3/creator-integration.js is required');
    }
    return api;
  }

  /**
   * Build a coordinator.
   * @param {object} spec
   * @param {(id:string)=>Promise<any>} spec.readDocument  durable read of one record
   * @param {(records:any[])=>Promise<void>} spec.writeDocuments  durable write of the batch
   * @param {<T>(task:()=>Promise<T>)=>Promise<T>} spec.enqueue  the serialised commit slot
   * @param {(plan:any, options?:object)=>Promise<any>} [spec.customCommit]  full custom port commit
   */
  function createCoordinator({ readDocument, writeDocuments, enqueue, customCommit } = {}) {
    const I = integration();
    const vault = I.createGrantVault();

    async function defaultCommit(plan, { signal } = {}) {
      // Re-verify every read dependency and every target inside the slot,
      // then write the whole batch in one durable step (or nothing).
      const records = new Map();
      for (const read of plan.reads) {
        const current = await readDocument(read.id);
        if (!current) {
          return { status: 'blocked', code: 'READ_DEPENDENCY_MISSING', id: read.id };
        }
        if (current.generation !== read.generation) {
          return { status: 'blocked', code: 'READ_DEPENDENCY_REPLACED', id: read.id };
        }
        // The durable revision is re-read inside the slot: any advance since
        // the preview — body change or not — voids the old approval.
        if (current.revision !== read.revision) {
          return { status: 'blocked', code: 'READ_DEPENDENCY_CHANGED', id: read.id };
        }
        if (I.canonical(current.body) !== read.fingerprint) {
          return { status: 'blocked', code: 'READ_DEPENDENCY_CHANGED', id: read.id };
        }
        records.set(read.id, current);
      }
      if (signal?.aborted) return { status: 'cancelled' };
      const next = [];
      for (const write of plan.writes) {
        const current = records.get(write.id) || await readDocument(write.id);
        if (!current) return { status: 'blocked', code: 'WRITE_TARGET_MISSING', id: write.id };
        if (current.readonly || current.frozen) return { status: 'blocked', code: 'WRITE_TARGET_READ_ONLY', id: write.id };
        next.push({ ...current, body: write.after, revision: current.revision + 1 });
      }
      await writeDocuments(next);
      return {
        status: 'ok',
        operationId: plan.operationId,
        committed: next.map((d) => ({ id: d.id, generation: d.generation, revision: d.revision })),
      };
    }

    const port = {
      // (the custom port is named customCommit: a parameter shadowed by the
      // hoisted commit() below once recursed into itself here.)
      commit: customCommit || ((plan, options) => enqueue(() => defaultCommit(plan, options))),
    };

    async function prepare({ operationId, documents, replacements, readIds, label }) {
      return I.preparePlan({ operationId, documents, replacements, readIds: readIds || [], label });
    }

    /** Issue the in-host approval after a visible decision (never from a message). */
    function approve(plan) {
      return vault.issue(plan);
    }

    async function commit(prepared, grant, { signal } = {}) {
      return I.executePlan(prepared, { grant, vault, port, signal });
    }

    /**
     * Compensating undo: revert the batch only while every target still sits
     * at the revision this commit produced. A later edit outranks the rollback.
     * @param {object} receipt the commit's { committed: [{id, revision}] }
     * @param {object} beforeBodies id -> the body the commit replaced
     */
    async function compensate(receipt, beforeBodies) {
      const revert = [];
      for (const entry of receipt.committed || []) {
        const current = await readDocument(entry.id);
        if (!current || current.revision !== entry.revision) {
          return { status: 'blocked', code: 'COMPENSATION_SUPERSEDED', id: entry.id };
        }
        const before = beforeBodies[entry.id];
        if (before === undefined) return { status: 'blocked', code: 'COMPENSATION_UNKNOWN_BEFORE', id: entry.id };
        revert.push({ ...current, body: before, revision: current.revision + 1 });
      }
      await writeDocuments(revert);
      return { status: 'ok', reverted: revert.map((d) => ({ id: d.id, revision: d.revision })) };
    }

    return Object.freeze({ prepare, approve, commit, compensate });
  }

  /**
   * The production commit port binding. Returns null when the real modules
   * are absent (a caller then refuses the update rather than degrading).
   */
  function createDeskPort({ db, storeName, fence, saveDeskState }) {
    const commits = root.AISystem6DeskCommits;
    const transactions = root.AISystem6StorageTransactions;
    if (!commits || typeof commits.enqueue !== 'function' || !transactions || typeof transactions.runTransaction !== 'function') {
      return null;
    }
    return {
      commit(plan, { signal } = {}) {
        return commits.enqueue(() => transactions.runTransaction(db, storeName, 'readwrite', (tx) => {
          if (signal?.aborted) return { status: 'cancelled' };
          const store = tx.objectStore(storeName);
          const get = (id) => new Promise((resolve, reject) => {
            const request = store.get(id);
            request.addEventListener('success', () => resolve(request.result), { once: true });
            request.addEventListener('error', () => reject(request.error), { once: true });
          });
          const put = (record) => new Promise((resolve, reject) => {
            const request = store.put(record, record.id);
            request.addEventListener('success', () => resolve(record), { once: true });
            request.addEventListener('error', () => reject(request.error), { once: true });
          });
          const I = integration();
          return (async () => {
            for (const read of plan.reads) {
              const current = await get(read.id);
              if (!current) return { status: 'blocked', code: 'READ_DEPENDENCY_MISSING', id: read.id };
              if (current.generation !== read.generation) return { status: 'blocked', code: 'READ_DEPENDENCY_REPLACED', id: read.id };
              if (current.revision !== read.revision || I.canonical(current.body) !== read.fingerprint) return { status: 'blocked', code: 'READ_DEPENDENCY_CHANGED', id: read.id };
            }
            if (signal?.aborted) return { status: 'cancelled' };
            const next = [];
            for (const write of plan.writes) {
              const current = await get(write.id);
              if (!current) return { status: 'blocked', code: 'WRITE_TARGET_MISSING', id: write.id };
              if (current.readonly || current.frozen) return { status: 'blocked', code: 'WRITE_TARGET_READ_ONLY', id: write.id };
              next.push({ ...current, body: write.after, revision: current.revision + 1 });
            }
            for (const record of next) await put(record);
            if (typeof saveDeskState === 'function') await saveDeskState();
            return {
              status: 'ok',
              operationId: plan.operationId,
              committed: next.map((d) => ({ id: d.id, generation: d.generation, revision: d.revision })),
            };
          })();
        }));
      },
    };
  }

  root.AISystem6UpdateCoordinator = Object.freeze({ createCoordinator, createDeskPort });
})(typeof window !== 'undefined' ? window : globalThis);
