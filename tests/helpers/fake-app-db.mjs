// A small event-driven IndexedDB stand-in for the storage fingerprint: stores
// are Maps, requests and transactions fire the same events the real ones do.
// `state` is Map<storeName, Map<key, value>>; `failRead` makes key reads fail.
export function fakeAppDb(state, options = {}) {
  const fire = (target, type, init = {}) => setTimeout(() => {
    const event = { type, target, preventDefault() {}, ...init };
    target[`on${type}`]?.(event);
    for (const listener of target.listeners?.[type] || []) listener(event);
  }, 0);
  const eventTarget = () => ({ listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); } });
  const request = (produce) => {
    const req = eventTarget();
    Promise.resolve().then(produce).then(
      (value) => { req.result = value; fire(req, "success"); },
      (error) => { req.error = error; fire(req, "error"); });
    return req;
  };
  let closed = 0, opened = 0;
  const connection = () => ({
    get objectStoreNames() { return [...state.keys()]; },
    close() { closed += 1; },
    transaction(names) {
      const tx = eventTarget();
      let pending = 0;
      const settle = () => { if (--pending === 0) fire(tx, "complete"); };
      tx.objectStore = (name) => ({
        getAllKeys: () => { pending += 1; const r = request(() => {
          if (options.failRead?.()) throw new Error("read failed");
          return [...state.get(name).keys()];
        }); r.addEventListener("success", settle); return r; },
        getAll: () => { pending += 1; const r = request(() => [...state.get(name).values()]); r.addEventListener("success", settle); return r; },
      });
      return tx;
    },
  });
  const indexedDB = {
    databases: async () => (options.exists?.() ?? true) ? [{ name: "ai-system-6-db", version: 6 }] : [],
    open() {
      opened += 1;
      const req = eventTarget();
      setTimeout(() => { req.result = connection(); req.onsuccess?.({ target: req }); }, 0);
      return req;
    },
  };
  return { indexedDB, connection, counters: () => ({ closed, opened }) };
}

export function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key), values };
}
