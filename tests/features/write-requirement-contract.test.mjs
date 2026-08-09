// Three-layer write contract: declarative DOM markers, action-router
// requiresWrite, and the storage fence. Mutating commands are rejected before
// their handlers run when the window cannot write; reading, copying, sharing,
// downloading, and opening stay available.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("write-requirement-contract");
const actions = read("app/core/actions.js");
const writeLease = read("app/core/write-lease.js");
const storageTransactions = read("app/core/storage-transactions.js");
const recoveryStorage = read("app/core/recovery-storage.js");

const mutatingActions = [
  "save-current",
  "save-copy",
  "save-chat",
  "save-conversation",
  "rename-active-chat",
  "new-document",
  "new-folder",
  "new-project-disk",
  "rename-project-disk",
  "rename-file",
  "duplicate-selection",
  "move-file-trash",
  "empty-trash",
  "put-away",
  "erase-disk",
  "quick-draft-save-project",
  "quick-draft-send-teachtext",
  "quick-draft-send-review",
  "insert-text-disk",
  "eject-text-disk",
  "add-text-disk-project",
];

for (const action of mutatingActions) {
  test.assertIncludes(actions, `"${action}"`, `the write contract marks ${action}`);
}
for (const action of ["copy", "share", "download", "open", "read", "search"]) {
  test.assertNotMatches(actions, new RegExp(`^[\\s\\S]*writeRequiredActions = new Set\\(\\[[^\\]]*"${action}"[^\\]]*\\]`, "m"), `${action} is not marked as requiring write`);
}
test.assertIncludes(actions, "AISystem6WriteLease?.canMutate?.() !== true", "the action router rejects writes before handlers run");
test.assertIncludes(actions, 'setStatus(t("write_required_status"))', "a rejected write explains itself in user copy");

test.assertIncludes(writeLease, "function canMutate()", "the lease exposes a mutation gate");
test.assertIncludes(writeLease, 'document.querySelectorAll("[data-requires-write]")', "the UI layer is declarative");
test.assertIncludes(storageTransactions, "assertCanWrite", "the storage fence remains the final boundary");

// Recovery is a read-only escape hatch: it never opens a readwrite transaction.
test.assertNotIncludes(recoveryStorage, '"readwrite"', "Recovery export never requests write access");
test.assertIncludes(recoveryStorage, '"readonly"', "Recovery export reads through read-only transactions");

test.finish();
