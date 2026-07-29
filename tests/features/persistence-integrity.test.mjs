import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("persistence-integrity");
const storageSource = read("app/core/storage-transactions.js");
const persistenceSource = read("app/core/persistence-status.js");
const bootSource = read("app/core/boot.js");
const workingSessionSource = read("app/core/working-session.js");
const projectDiskSource = read("app/features/project-disk.js");
const manifest = read("scripts/runtime-manifest.mjs");

const context = vm.createContext({
  DOMException,
  Event,
  Promise,
  window: {},
});
vm.runInContext(storageSource, context);
const transactions = context.window.AISystem6StorageTransactions;

class MockTransaction extends EventTarget {
  constructor() {
    super();
    this.error = null;
    this.aborted = false;
  }

  abort() {
    if (this.aborted) return;
    this.aborted = true;
    this.error = new DOMException("forced abort", "AbortError");
    this.dispatchEvent(new Event("abort"));
  }
}

const completed = new MockTransaction();
const completedPromise = transactions.transactionDone(completed);
completed.dispatchEvent(new Event("complete"));
await completedPromise;
test.ok("transactionDone resolves only from the complete event");

const abortedAfterRequestSuccess = new MockTransaction();
const abortedPromise = transactions.transactionDone(abortedAfterRequestSuccess);
abortedAfterRequestSuccess.abort();
let abortedRejected = false;
try {
  await abortedPromise;
} catch (error) {
  abortedRejected = error?.name === "AbortError";
}
test.assert(
  abortedRejected,
  "a transaction abort after request success is still reported as a failed save"
);

const runTransactionAbort = new MockTransaction();
const fakeDb = {
  transaction() {
    return runTransactionAbort;
  },
};
let runRejected = false;
try {
  const running = transactions.runTransaction(
    fakeDb,
    "settings",
    "readonly",
    async () => {
      queueMicrotask(() => runTransactionAbort.abort());
      return "request-success";
    }
  );
  await running;
} catch {
  runRejected = true;
}
test.assert(runRejected, "runTransaction does not confuse request success with transaction commit");

const storageModuleIndex = manifest.indexOf('"app/core/storage-transactions.js"');
const projectDiskIndex = manifest.indexOf('"app/features/project-disk.js"');
test.assert(
  storageModuleIndex >= 0 && storageModuleIndex < projectDiskIndex,
  "transaction helpers load before IndexedDB repositories"
);

const persistStart = persistenceSource.indexOf("async function persistDeskState()");
const persistEnd = persistenceSource.indexOf("async function loadDeskState()", persistStart);
const persistBlock = persistenceSource.slice(persistStart, persistEnd);
test.assert(
  persistBlock.indexOf("await transactionCompletion") < persistBlock.indexOf("storageSnapshotCache.set"),
  "snapshot cache advances only after transaction completion"
);
test.assertIncludes(
  persistBlock,
  "storageSnapshotCache.clear()",
  "a failed persistence attempt invalidates optimistic snapshots"
);

const loadStart = persistenceSource.indexOf("async function loadDeskState()");
const loadEnd = persistenceSource.indexOf("function applySettings", loadStart);
const loadBlock = persistenceSource.slice(loadStart, loadEnd);
test.assert(
  !/catch[\s\S]*projects\.length\s*=\s*0/.test(loadBlock),
  "load failures never clear the live project arrays"
);
test.assertIncludes(loadBlock, "deskPersistenceWritable = false", "load failure blocks later automatic writes");
test.assertIncludes(loadBlock, "throw error", "load failure remains fatal instead of becoming an empty workspace");
test.assert(
  loadBlock.indexOf("await transactionCompletion") < loadBlock.indexOf("projects.splice"),
  "loaded records reach global state only after the readonly transaction completes"
);

test.assertIncludes(bootSource, "await loadDeskState();", "boot waits for the workspace load without a late timeout race");
test.assertNotIncludes(
  bootSource,
  'startupTaskWithTimeout(loadDeskState(), "loadDeskState"',
  "a timed-out load cannot mutate the workspace after boot continues"
);
test.assertIncludes(
  workingSessionSource,
  "AISystem6StorageTransactions.runTransaction",
  "Working Session saves also wait for transaction completion"
);
test.assertIncludes(
  projectDiskSource,
  "AISystem6StorageTransactions.runTransaction",
  "reference writes also wait for transaction completion"
);

test.finish();
