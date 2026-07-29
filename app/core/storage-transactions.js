// IndexedDB transaction completion helpers.

window.AISystem6StorageTransactions = (() => {
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
      transaction.addEventListener(
        "complete",
        () => finish(resolve),
        { once: true }
      );
      transaction.addEventListener(
        "abort",
        () => finish(
          reject,
          transactionError(transaction, "IndexedDB transaction aborted.")
        ),
        { once: true }
      );
      transaction.addEventListener(
        "error",
        () => finish(
          reject,
          transactionError(transaction, "IndexedDB transaction failed.")
        ),
        { once: true }
      );
    });
  }

  function readwriteTransaction(db, storeNames) {
    try {
      return db.transaction(storeNames, "readwrite", { durability: "strict" });
    } catch {
      return db.transaction(storeNames, "readwrite");
    }
  }

  async function runTransaction(db, storeNames, mode, operation) {
    const transaction = mode === "readwrite"
      ? readwriteTransaction(db, storeNames)
      : db.transaction(storeNames, "readonly");
    const done = transactionDone(transaction);
    try {
      const result = await operation(transaction);
      await done;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  return Object.freeze({
    readwriteTransaction,
    runTransaction,
    transactionDone,
  });
})();
