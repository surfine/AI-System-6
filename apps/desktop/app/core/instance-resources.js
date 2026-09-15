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

window.AISystem6InstanceResources = (() => {
  /**
   * @param {string} [name] the instance's identity, for diagnostics
   */
  function create(name = "") {
    /** @type {Set<() => void>} */
    const disposers = new Set();
    let disposed = false;

    /** Register one cleanup. Returns a function that removes it without running. */
    const add = (dispose, label = "") => {
      if (disposed || typeof dispose !== "function") return () => {};
      const entry = { dispose, label: String(label || "") };
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
        if (!target?.addEventListener) return () => {};
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
          try {
            entry.dispose();
          } catch (error) {
            failures.push({ label: entry.label, error });
          }
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
