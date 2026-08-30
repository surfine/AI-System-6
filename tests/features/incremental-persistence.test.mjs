import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("incremental-persistence");
const persistence = read("app/core/persistence-status.js");
const importExport = read("app/features/export-import.js");

// The write itself lives in runDeskCommit, which the lease holder runs for its
// own window and for any window that hands it a write. persistDeskState is the
// planner above it, so the save path is both.
const saveStart = persistence.indexOf("async function runDeskCommit(");
const loadStart = persistence.indexOf("async function loadDeskState()", saveStart);
const saveSource = persistence.slice(saveStart, loadStart);

test.assertNotIncludes(saveSource, ".clear()", "ordinary desk saves never clear an object store");
test.assertIncludes(saveSource, "plan.puts", "desk saves put only fingerprint-changed records");
test.assertIncludes(saveSource, "plan.deletes", "desk saves delete only removed record ids");
test.assertIncludes(persistence, "function deleteDeskRecordAtBase(", "record removal checks the base before deleting");
test.assertIncludes(persistence, "store.delete(id)", "record removal uses IndexedDB delete");
test.assertIncludes(saveSource, "plan.deletes.forEach(({ id, base })", "record removal carries the fingerprint it last saw");
test.assertIncludes(saveSource, "storesTouched", "persistence reports touched stores without document content");
test.assertIncludes(saveSource, "settingsWritten", "persistence reports settings-only writes");
test.assertIncludes(persistence, "function markDeskDirty(kind", "the explicit record dirty API is available");
test.assertIncludes(persistence, "function markDeskDeleted(kind", "the explicit record deletion API is available");
test.assertIncludes(persistence, "getAllKeys()", "legacy out-of-line trash keys are retained for incremental deletes");
test.assertIncludes(importExport, "trashStore.put(item, item._storageId)", "backup imports preserve stable trash record identities");
test.assertNotIncludes(saveSource, "storageSnapshotCache.clear()", "write failure does not pretend an empty cache was committed");

// Concurrency lives at the record, not at the window.
//
// Every window keeps its own copy of the desk AND its own fingerprint of the
// version that copy descends from. A window may overwrite a stored record only
// while the stored copy still matches that base; if another window wrote it
// first, the save is refused rather than laid over the top, the user's copy is
// kept, and the status line says which way it went. That is the guarantee the
// single-writer lease used to provide by excluding a whole window.
test.assertIncludes(persistence, "function putDeskRecordAtBase(", "a record write is checked against the base the window last saw");
test.assertIncludes(persistence, "conflicts.push({ key: plan.key, id: String(id) })", "a moved record is reported, not overwritten");
test.assertIncludes(saveSource, "if (conflicts.length) throw deskRecordConflictError(conflicts)", "one refused record refuses the whole save");
test.assertIncludes(persistence, 'error.code = "DESK_RECORD_CONFLICT"', "a refusal is distinguishable from a broken write");
test.assertIncludes(saveSource, 'setStatus(t("desk_record_conflict_status"))', "the refusal reaches the writer in words");
test.assertMatches(
  persistence,
  /putDeskRecordAtBase[\s\S]*?store\.get\(id\)[\s\S]*?addEventListener\("success"/,
  "the read and the write stay inside IndexedDB event handlers, with no await to close the transaction",
);
test.assertIncludes(persistence, "puts.push({ id, item, base: previous.get(cacheKey)?.fingerprint })", "the plan carries the base each write must still match");
test.assertIncludes(persistence, "deletes.push({ id: cached.id, base: cached.fingerprint })", "a delete carries the base each window last saw");
test.assertMatches(
  persistence,
  /function deleteDeskRecordAtBase[\s\S]*?store\.get\(id\)[\s\S]*?deskRecordFingerprint\(stored\) !== base[\s\S]*?store\.delete\(id\)/,
  "a stale delete is refused instead of erasing a newer record",
);

// Settings are a full durable snapshot in the same key-value database. They
// need a base fence too, otherwise two windows can still silently replace one
// another even though collection records are protected.
test.assertIncludes(persistence, "function putSettingsAtBase(", "settings writes are checked against the last snapshot this window saw");
test.assertIncludes(persistence, 'conflicts.push({ key: "settings", id: "settings" })', "a stale settings snapshot is reported, not overwritten");
test.assertMatches(
  persistence,
  /function putSettingsAtBase[\s\S]*?store\.get\("settings"\)[\s\S]*?deskRecordFingerprint\(stored\) === base[\s\S]*?store\.put\(payload, "settings"\)/,
  "settings read and write stay behind the same IndexedDB base fence",
);
test.assertIncludes(persistence, "const settingsBase = storageSnapshotCache.get(\"settings\")", "a save captures the settings version before it commits");
test.assertIncludes(persistence, "settingsChanged = false", "the change feed can carry a settings-only commit");
test.assertIncludes(persistence, 'storageSnapshotCache.set("settings", JSON.stringify(incomingSettings));', "a window advances its settings base after a remote commit");

// The change feed. A window that cannot see another window's records would
// show a stale desk, and its own delete pass reasons from a fingerprint map
// that never learned they exist.
test.assertIncludes(persistence, "function broadcastDeskRecordChanges(", "a committed write announces which records moved");
test.assertIncludes(persistence, "function applyDeskRecordChanges(", "a window merges the records another window announced");
test.assertIncludes(persistence, "broadcastDeskRecordChanges(changedPlans, shouldWriteSettings)", "the announcement happens only after the transaction commits");
test.assertIncludes(persistence, 'type: "desk-records"', "the feed shares the live-progress channel rather than opening a second one");
test.assertMatches(
  persistence,
  /if \(believed !== undefined && deskRecordFingerprint\(local\) !== believed\) return;/,
  "a record this window is still editing is never overwritten by the feed",
);
test.assertIncludes(persistence, "function deskCollectionDefinitions()", "save, restore and the feed walk one list of durable collections");

// The write proxy. The lease holds the DATABASE CONNECTION, not the user's
// permission to type: a window without it plans its write exactly as before
// and hands it to the window that has it, which applies it at the fence.
test.assertIncludes(persistence, "function requestProxiedDeskCommit(", "a window without the connection hands its write to the one that has it");
test.assertIncludes(persistence, "function handleProxiedDeskWriteRequest(", "the connection holder writes for the others");
test.assertIncludes(persistence, "async function runDeskCommit(", "one commit body serves a local write and a proxied one, so both get the same base check");
test.assertMatches(
  persistence,
  /async function handleProxiedDeskWriteRequest\(message\) \{[\s\S]{0,400}?canMutate\?\.\(\) !== true\) return;/,
  "only the holder answers a write request, so exactly one reply comes back",
);
test.assertMatches(
  persistence,
  /handleProxiedDeskWriteRequest[\s\S]*?await applyDeskRecordChanges\(\{ changes, deletes \}\);/,
  "the holder learns the records it wrote for another window, or its own next save reasons from a stale copy",
);
// A window that merely lost the lease - the only one open, a heartbeat that
// lapsed while it was backgrounded - has nobody to proxy to, and must not sit
// waiting for an answer from an empty room.
test.assertMatches(
  persistence,
  /async function commitDeskPlansWhereverTheConnectionIs\(payload\) \{[\s\S]{0,300}?reconcile[\s\S]{0,200}?await runDeskCommit\(payload\);/,
  "a window takes the connection before handing the write away",
);
test.assertMatches(
  persistence,
  /if \(error\?\.code === "DESK_RECORD_CONFLICT"\) throw error;\s*\n\s*const takeover = await window\.AISystem6WriteLease\?\.requestTakeover/,
  "a refusal stands, but silence from the holder escalates to the safe handshake instead of losing the work",
);
test.assertIncludes(persistence, "const deskProxyTimeoutMs", "a proxied write cannot wait forever");

test.finish();
