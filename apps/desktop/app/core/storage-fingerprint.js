// Storage identity for the Mac updater. Dependency-free on purpose: the
// private server inlines this file into /api/shell/bootstrap.js, which runs on
// the desk origin BEFORE any desk code can write, and the desk loads the same
// file lazily with the native shell adapter.
//
// Two measurements, two jobs:
// - fingerprint: SHA-256 over every store except the writer fence, the save
//   epoch and the window session. Byte-for-byte the algorithm every shipped
//   build has used, because the previous app's updater compares it exactly.
//   Taken at arrival it proves the swap handed over storage unchanged.
// - manifest: the keys of every durable record. A new build may rewrite
//   records on its first boot (normalisation, a derived index), so after boot
//   the proof is "no record the writer had is gone", not byte identity.
window.AISystem6StorageFingerprint = (() => {
  "use strict";
  const databaseName = "ai-system-6-db";
  const arrivalKey = "ai-system6-storage-arrival";
  const preferencesKey = "ai-system6-native-preferences";
  const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const transient = (store, key) => store === "keyval" && (key === "__ai_system6_write_fence__"
    || key === "storageVersion" || String(key).startsWith("workingSession:"));
  // Derived records are rebuilt from the durable ones; losing one is not a
  // writer's loss, and a new build may rename its index.
  const derived = (store, key) => store === "keyval" && String(key).startsWith("derived-");

  async function canonical(value) {
    if (value instanceof Blob) {
      const hash = await crypto.subtle.digest("SHA-256", await value.arrayBuffer());
      return { blob: hex(hash), size: value.size, type: value.type };
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { binary: hex(await crypto.subtle.digest("SHA-256", bytes)), size: bytes.byteLength };
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return Promise.all(value.map(canonical));
    if (value && typeof value === "object") {
      const result = {};
      for (const key of Object.keys(value).sort()) result[key] = await canonical(value[key]);
      return result;
    }
    return value;
  }
  const request = (req) => new Promise((resolve, reject) => {
    req.addEventListener("success", () => resolve(req.result), { once: true });
    req.addEventListener("error", () => reject(req.error), { once: true });
  });
  const done = (tx) => new Promise((resolve, reject) => {
    tx.addEventListener("complete", () => resolve(), { once: true });
    tx.addEventListener("abort", () => reject(tx.error || new DOMException("IndexedDB transaction aborted.", "AbortError")), { once: true });
    tx.addEventListener("error", () => reject(tx.error || new DOMException("IndexedDB transaction failed.", "AbortError")), { once: true });
  });
  const keyName = (key) => JSON.stringify(key instanceof Date ? key.toISOString() : key);

  // One readonly transaction yields both measurements, so they describe the
  // same instant.
  async function read(db) {
    const names = [...db.objectStoreNames].sort();
    if (!names.length) throw new Error("Storage has no object stores");
    const tx = db.transaction(names, "readonly");
    const completion = done(tx);
    const reads = names.map((name) => {
      const store = tx.objectStore(name);
      return Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    });
    const records = await Promise.all([...reads, completion]);
    records.pop();
    const manifest = {};
    const stores = names.map((name, index) => {
      const [keys, values] = records[index];
      manifest[name] = keys.filter((key) => !transient(name, key) && !derived(name, key)).map(keyName).sort();
      return [name, keys.flatMap((key, i) => {
        if (transient(name, key)) return [];
        let value = values[i];
        if (name === "keyval" && key === "settings" && value && typeof value === "object") {
          value = { ...value };
          delete value.localModelReady;
          delete value.startupOpenedWindowNames;
        }
        return [[key, value]];
      })];
    });
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(preferencesKey) || "{}") || {}; } catch {}
    const content = await canonical({ stores, native: { clipboard: prefs.clipboard === true, hotkey: prefs.hotkey || "" } });
    const fingerprint = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(content))));
    return { fingerprint, manifest };
  }

  // Opens the database only if it already exists: a fresh profile must not get
  // an empty version-1 database before the desk creates its schema.
  async function openExisting() {
    if (typeof indexedDB.databases === "function") {
      const list = await indexedDB.databases();
      if (!list.some((entry) => entry.name === databaseName)) return null;
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(databaseName);
      let created = false;
      req.onupgradeneeded = () => { created = true; req.transaction.abort(); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = (event) => { if (created) { event.preventDefault(); resolve(null); } else reject(req.error); };
      req.onblocked = () => reject(new Error("Storage is held by another window"));
    });
  }

  // Runs in the bootstrap page before the desk exists.
  async function recordArrival() {
    let arrival;
    try {
      const db = await openExisting();
      if (!db) arrival = { empty: true };
      else {
        try { arrival = { ...(await read(db)), time: Date.now() }; } finally { db.close(); }
      }
    } catch (error) { arrival = { error: String(error?.message || error).slice(0, 200) }; }
    sessionStorage.setItem(arrivalKey, JSON.stringify(arrival));
    return arrival;
  }

  // The desk reads the arrival once per launch; a later reload of the desk is
  // not a launch and measures the current storage instead.
  function takeArrival() {
    try {
      const value = JSON.parse(sessionStorage.getItem(arrivalKey) || "null");
      sessionStorage.removeItem(arrivalKey);
      return value && /^[a-f0-9]{64}$/.test(value.fingerprint || "") && value.manifest ? value : null;
    } catch { return null; }
  }

  function lostRecords(before, after) {
    const lost = [];
    for (const [store, keys] of Object.entries(before || {})) {
      const present = new Set(after?.[store] || []);
      for (const key of keys) if (!present.has(key)) lost.push(store + ":" + key);
    }
    return lost;
  }

  function counts(manifest) {
    return Object.fromEntries(Object.entries(manifest || {}).map(([store, keys]) => [store, keys.length]));
  }

  return { canonical, read, openExisting, recordArrival, takeArrival, lostRecords, counts, arrivalKey };
})();
