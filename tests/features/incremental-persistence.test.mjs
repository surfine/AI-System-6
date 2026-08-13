import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("incremental-persistence");
const persistence = read("app/core/persistence-status.js");
const importExport = read("app/features/export-import.js");

const saveStart = persistence.indexOf("async function persistDeskState()");
const loadStart = persistence.indexOf("async function loadDeskState()", saveStart);
const saveSource = persistence.slice(saveStart, loadStart);

test.assertNotIncludes(saveSource, ".clear()", "ordinary desk saves never clear an object store");
test.assertIncludes(saveSource, "plan.puts", "desk saves put only fingerprint-changed records");
test.assertIncludes(saveSource, "plan.deletes", "desk saves delete only removed record ids");
test.assertIncludes(saveSource, "store.delete(id)", "record removal uses IndexedDB delete");
test.assertIncludes(saveSource, "storesTouched", "persistence reports touched stores without document content");
test.assertIncludes(saveSource, "settingsWritten", "persistence reports settings-only writes");
test.assertIncludes(persistence, "function markDeskDirty(kind", "the explicit record dirty API is available");
test.assertIncludes(persistence, "function markDeskDeleted(kind", "the explicit record deletion API is available");
test.assertIncludes(persistence, "getAllKeys()", "legacy out-of-line trash keys are retained for incremental deletes");
test.assertIncludes(importExport, "trashStore.put(item, item._storageId)", "backup imports preserve stable trash record identities");
test.assertNotIncludes(saveSource, "storageSnapshotCache.clear()", "write failure does not pretend an empty cache was committed");

test.finish();
