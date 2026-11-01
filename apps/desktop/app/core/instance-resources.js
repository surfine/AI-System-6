// Per-instance resource cleanup.
//
// A window that can be opened again needs to give back exactly what it took:
// listeners, timers, observers, workers, object URLs and subscriptions that
// belong to THAT instance. Nothing here is automatic - the instance registers
// what it created and disposes once, and shared things (a module-level cache, a
// request other windows are waiting on) stay owned by whoever created them.
//
// Why not just AbortController: an abort signal covers listeners and fetches
// that accept one. A timer, an observer, a worker or an object URL does not,
// and a cleanup that throws must not stop the rest of the cleanup. So the
// instance keeps its own list, and the abort path is one convenience on top of
// it rather than the whole mechanism.
//
// Disposal is the end of the instance, not a checkpoint: a listener or a timer
// asked for after it is refused rather than created, and a cleanup registered
// after it runs immediately, so a late async task cannot leave a live resource
// on an instance that has already reported itself released. Remounting is a
// new instance's job.

window.AISystem6InstanceResources = (() => {
  /**
   * @param {string} [name] the instance's identity, for diagnostics
   */
  function create(name = "") {
    /** @type {Set<() => void>} */
    const disposers = new Set();
    let disposed = false;

    /**
     * Run one cleanup, isolated and reported the same way dispose() reports
     * one. @param {{ dispose: () => void, label: string }} entry
     * @returns {{ label: string, error: any } | null}
     */
    const release = (entry) => {
      try {
        entry.dispose();
        return null;
      } catch (error) {
        return { label: entry.label, error };
      }
    };

    /**
     * Register one cleanup. Returns a function that removes it without running.
     *
     * A registration that arrives after disposal is cleaned up at once: the
     * caller may already have created the thing it is handing over - a
     * listener attached a line earlier, an object URL - and dropping the
     * cleanup on the floor is how a "disposed" instance keeps a live resource
     * behind a size of zero. The returned function is a no-op, because the
     * cleanup has already run and running it twice is a second side effect,
     * not a second release.
     */
    const add = (dispose, label = "") => {
      if (typeof dispose !== "function") return () => {};
      const entry = { dispose, label: String(label || "") };
      if (disposed) {
        const failure = release(entry);
        if (failure) {
          console.warn(`Instance "${name || "unnamed"}" could not release a resource registered after it was disposed.`, failure);
        }
        return () => {};
      }
      disposers.add(entry);
      return () => disposers.delete(entry);
    };

    return {
      name: String(name || ""),
      get disposed() {
        return disposed;
      },
      get size() {
        return disposers.size;
      },
      add,
      /**
       * A listener that removes itself. Prefers the signal so the browser can
       * drop it with the rest, and keeps the explicit remove for targets and
       * handlers that do not take one.
       */
      listen(target, type, handler, options = {}) {
        // Nothing is created for a disposed instance: the listener would keep
        // firing with no registry left to remember it.
        if (disposed || !target?.addEventListener) return () => {};
        const controller = typeof AbortController === "function" && options.signal === undefined
          ? new AbortController()
          : null;
        const listenerOptions = controller ? { ...options, signal: controller.signal } : options;
        target.addEventListener(type, handler, listenerOptions);
        return add(() => {
          // Explicit removal as well as the signal: the signal is what the
          // browser uses to drop the listener with the rest, and this call is
          // what actually removes it on a target that does not implement it.
          target.removeEventListener?.(type, handler, options);
          if (controller) controller.abort();
        }, `listen:${type}`);
      },
      /** A timer that is guaranteed to be cleared. */
      timeout(callback, delayMs) {
        // Same rule as a listener: a disposed instance does not start new work
        // it cannot later stop.
        if (disposed) return () => {};
        const handle = setTimeout(() => {
          remove();
          callback();
        }, delayMs);
        const remove = add(() => clearTimeout(handle), "timeout");
        return remove;
      },
      /**
       * Disposes once. Every cleanup runs even when one throws, the list is
       * emptied, and a second call is a no-op that reports nothing ran.
       */
      dispose(reason = "") {
        if (disposed) return { disposed: false, reason: String(reason), failures: [] };
        disposed = true;
        const failures = [];
        [...disposers].reverse().forEach((entry) => {
          const failure = release(entry);
          if (failure) failures.push(failure);
        });
        disposers.clear();
        if (failures.length) {
          console.warn(`Instance "${name || "unnamed"}" could not release ${failures.length} resource(s).`, failures);
        }
        return { disposed: true, reason: String(reason), failures };
      },
    };
  }

  return Object.freeze({ create });
})();
