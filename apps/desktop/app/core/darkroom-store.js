// @ts-check
// 文字亮室 — where a document's darkroom record is kept.
//
// The shape and the migration are pure and live in app/core/darkroom-record.js;
// this is the durable half. It follows document-revisions.js exactly: one
// keyval entry per document, a synchronous in-memory cache, and asynchronous
// reads and writes around it.
//
// The cache is what makes the move possible without rewriting the darkroom.
// Every reader in Quick Draft asks for the negative, the layers, the locks and
// the chain synchronously, dozens of times per render. Making the store async
// would turn a move of the durable boundary into a rewrite of the surface, so
// the record is loaded once when a draft is opened and answered from memory
// afterwards, the way revisions already are.

const darkroomCache = new Map();
const darkroomLoaded = new Set();

function darkroomKey(projectId, documentId) {
  return window.AISystem6DarkroomRecord.darkroomStorageKey(projectId, documentId);
}

/** Synchronous. A document with no record answers with a blank one, never null,
 * so a caller never has to ask whether a draft has been developed before. */
function darkroomRecord(projectId, documentId) {
  if (!documentId) return window.AISystem6DarkroomRecord.blankDarkroomRecord();
  const key = darkroomKey(projectId, documentId);
  if (!darkroomCache.has(key)) darkroomCache.set(key, window.AISystem6DarkroomRecord.blankDarkroomRecord());
  return darkroomCache.get(key);
}

function darkroomIsLoaded(projectId, documentId) {
  return !documentId || darkroomLoaded.has(darkroomKey(projectId, documentId));
}

async function loadDarkroomRecord(projectId, documentId) {
  if (!documentId) return window.AISystem6DarkroomRecord.blankDarkroomRecord();
  if (!darkroomStorageAvailable()) return darkroomRecord(projectId, documentId);
  const key = darkroomKey(projectId, documentId);
  if (darkroomLoaded.has(key)) return darkroomCache.get(key);
  let db;
  try {
    db = await openAppDb();
    const stored = await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      "readonly",
      (tx) => idbRequest(tx.objectStore(keyvalStoreName).get(key))
    );
    if (stored && typeof stored === "object") {
      darkroomCache.set(key, { ...window.AISystem6DarkroomRecord.blankDarkroomRecord(), ...stored });
    }
    darkroomLoaded.add(key);
  } catch (error) {
    // A record that could not be read must not be answered with a blank one
    // that then overwrites it: leave it unloaded so the next attempt tries
    // again, and let the caller decide whether to proceed.
    console.warn("Could not read the darkroom record.", error);
    throw error;
  } finally {
    db?.close();
  }
  return darkroomCache.get(key) || window.AISystem6DarkroomRecord.blankDarkroomRecord();
}

/** Synchronous cache update; the durable write is awaited by the caller. */
function setDarkroomRecord(projectId, documentId, record) {
  if (!documentId) return null;
  const key = darkroomKey(projectId, documentId);
  const next = { ...window.AISystem6DarkroomRecord.blankDarkroomRecord(), ...record, updatedAt: new Date().toISOString() };
  darkroomCache.set(key, next);
  darkroomLoaded.add(key);
  return next;
}

// A missing storage runtime is not a failed write. Executable contracts run
// this module in a bare context with no IndexedDB, and a draft there has
// nothing durable to lose; a real browser always has both, so a throw from
// here is a genuine write failure and must reach the caller.
function darkroomStorageAvailable() {
  return typeof openAppDb === "function" && Boolean(window.AISystem6StorageTransactions);
}

async function persistDarkroomRecord(projectId, documentId) {
  if (!documentId || !darkroomStorageAvailable()) return false;
  const key = darkroomKey(projectId, documentId);
  let db;
  try {
    db = await openAppDb();
    await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      "readwrite",
      (tx) => idbRequest(tx.objectStore(keyvalStoreName).put(darkroomCache.get(key), key))
    );
    return true;
  } catch (error) {
    // The negative, the locks and the chain are the writer's own words. A
    // failed write reaches the caller so it can refuse to claim the develop
    // landed.
    console.warn("Could not persist the darkroom record.", error);
    throw error;
  } finally {
    db?.close();
  }
}

async function deleteDarkroomRecord(projectId, documentId) {
  if (!documentId || !darkroomStorageAvailable()) return false;
  const key = darkroomKey(projectId, documentId);
  darkroomCache.delete(key);
  darkroomLoaded.delete(key);
  let db;
  try {
    db = await openAppDb();
    await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      "readwrite",
      (tx) => idbRequest(tx.objectStore(keyvalStoreName).delete(key))
    );
    return true;
  } catch (error) {
    console.warn("Could not delete the darkroom record.", error);
    return false;
  } finally {
    db?.close();
  }
}

window.AISystem6DarkroomStore = Object.freeze({
  darkroomIsLoaded,
  darkroomStorageAvailable,
  darkroomRecord,
  deleteDarkroomRecord,
  loadDarkroomRecord,
  persistDarkroomRecord,
  setDarkroomRecord,
});
