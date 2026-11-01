// IndexedDB transaction completion helpers and the durable single-writer
// fence. localStorage/BroadcastChannel make the UI responsive, but this
// record is the final authority for every persistent mutation.

window.AISystem6StorageTransactions = (() => {
  const fenceStoreName = "keyval";
  const fenceKey = "__ai_system6_write_fence__";

  function transactionError(transaction, fallbackMessage) {
    return transaction.error
      || new DOMException(fallbackMessage, "AbortError");
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      transaction.addEventListener("complete", () => finish(resolve), { once: true });
      transaction.addEventListener(
        "abort",
        () => finish(reject, transactionError(transaction, "IndexedDB transaction aborted.")),
        { once: true }
      );
      transaction.addEventListener(
        "error",
        () => finish(reject, transactionError(transaction, "IndexedDB transaction failed.")),
        { once: true }
      );
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
  }

  function durableTransaction(db, storeNames) {
    try {
      return db.transaction(storeNames, "readwrite", { durability: "strict" });
    } catch {
      return db.transaction(storeNames, "readwrite");
    }
  }

  function writeFenceError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function normalizedStores(storeNames, includeFence = false) {
    const names = Array.isArray(storeNames) ? [...storeNames] : [storeNames];
    const filtered = names.filter(Boolean);
    if (includeFence && !filtered.includes(fenceStoreName)) filtered.push(fenceStoreName);
    return filtered;
  }

  async function runFenceMutation(db, operation) {
    const transaction = durableTransaction(db, fenceStoreName);
    const done = transactionDone(transaction);
    try {
      const result = await operation(transaction.objectStore(fenceStoreName));
      await done;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  // Fence transitions are intentionally separate from application writes.
  // IndexedDB serializes these transactions, so every successful claim gets
  // an epoch greater than the previously committed epoch.
  function claimWriteFence(db, ownerId) {
    const normalizedOwner = String(ownerId || "");
    if (!normalizedOwner) {
      return Promise.reject(writeFenceError("READ_ONLY_INSTANCE", "A write-fence owner is required."));
    }
    return runFenceMutation(db, async (store) => {
      const current = await requestResult(store.get(fenceKey));
      const fence = {
        ownerId: normalizedOwner,
        epoch: Math.max(0, Math.floor(Number(current?.epoch) || 0)) + 1,
        updatedAt: Date.now(),
      };
      await requestResult(store.put(fence, fenceKey));
      return fence;
    });
  }

  function releaseWriteFence(db, expectedFence) {
    return runFenceMutation(db, async (store) => {
      const current = await requestResult(store.get(fenceKey));
      if (
        !current
        || current.ownerId !== expectedFence?.ownerId
        || Number(current.epoch) !== Number(expectedFence?.epoch)
      ) {
        return false;
      }
      // Keep a tombstone so epochs never reset after a clean release.
      await requestResult(store.put({
        ownerId: "",
        epoch: Number(current.epoch),
        updatedAt: Date.now(),
      }, fenceKey));
      return true;
    });
  }

  async function readWriteFence(db) {
    const transaction = db.transaction(fenceStoreName, "readonly");
    const done = transactionDone(transaction);
    const fence = await requestResult(transaction.objectStore(fenceStoreName).get(fenceKey));
    await done;
    return fence || null;
  }

  async function verifyTransactionFence(transaction, expectedFence) {
    const current = await requestResult(
      transaction.objectStore(fenceStoreName).get(fenceKey)
    );
    if (!current?.ownerId) {
      throw writeFenceError("READ_ONLY_INSTANCE", "No window owns the persistent write fence.");
    }
    if (
      current.ownerId !== expectedFence?.ownerId
      || Number(current.epoch) !== Number(expectedFence?.epoch)
    ) {
      throw writeFenceError("STALE_WRITE_FENCE", "This window's persistent write fence is stale.");
    }
    return current;
  }

  async function runTransactionAtFence(db, storeNames, mode, expectedFence, operation) {
    if (
      mode === "readwrite"
      && (!expectedFence?.ownerId || !Number.isFinite(Number(expectedFence.epoch)))
    ) {
      throw writeFenceError("READ_ONLY_INSTANCE", "This window has no persistent write fence.");
    }
    const transaction = mode === "readwrite"
      ? durableTransaction(db, normalizedStores(storeNames, true))
      : db.transaction(normalizedStores(storeNames), "readonly");
    const done = transactionDone(transaction);
    try {
      if (mode === "readwrite") await verifyTransactionFence(transaction, expectedFence);
      const result = await operation(transaction);
      await done;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  async function runTransaction(db, storeNames, mode, operation) {
    // Capture the in-memory permission immediately before opening the durable
    // transaction. Queued work may explicitly keep this token and call
    // runTransactionAtFence later; a takeover then produces STALE_WRITE_FENCE.
    const expectedFence = mode === "readwrite"
      ? window.AISystem6WriteLease?.assertCanWrite?.()
      : null;
    return runTransactionAtFence(db, storeNames, mode, expectedFence, operation);
  }

  return Object.freeze({
    claimWriteFence,
    fenceKey,
    readWriteFence,
    releaseWriteFence,
    runTransaction,
    runTransactionAtFence,
    transactionDone,
  });
})();
