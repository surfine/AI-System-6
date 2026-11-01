// Desk commit consistency: one queue, per-record rollback, explicit write
// snapshots, and the two cross-window signals (a record feed and a mirror
// hint) that may not overwrite work the writer has not saved.
//
// These run the real eager module set in a VM (the same bundle index.html
// loads) and stub only the parts that need a browser: IndexedDB itself is
// stubbed here and exercised for real in tests/e2e/durability-browser.spec.mjs
// and the cross-window spec, where two same-origin pages share one database.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("desk-commit-consistency");

// One desk, mounted, with the write lease held and the two DOM-heavy
// follow-ups neutralised (they run after the commit, and the state-store test
// already covers their own contracts).
const seedDesk = `
  projects.length = 0;
  projects.push({ id: "p1", name: "P1", title: "before", questionSheet: "before", outline: "", drafts: [] });
  chatFiles.length = 0;
  chatFolders.length = 0;
  scraps.length = 0;
  trashItems.length = 0;
  activeProjectId = "p1";
  selectedProjectId = "p1";
  startupProjectId = "p1";
  isProjectMounted = true;
  deskPersistenceWritable = true;
  renderPipeline = function noopRenderPipeline() {};
  renderDocuments = function noopRenderDocuments() {};
  renderProjectDisks = function noopRenderProjectDisks() {};
  window.AISystem6WriteLease = Object.assign({}, window.AISystem6WriteLease, {
    isReadOnly: () => false,
    canMutate: () => true,
    reconcile: async () => null,
    assertCanWrite: () => ({ ownerId: "fixture", epoch: 1 }),
  });
`;

function bootDesk() {
  const vmw = createAppBootVm();
  vmw.run(seedDesk);
  return vmw;
}

// A deferred the VM can await, so a test never depends on a sleep to reach the
// moment a write is open.
function deferredSource(name) {
  return `
    const ${name} = (() => {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      return { promise, resolve };
    })();
  `;
}

// --- Commit order and rollback ----------------------------------------------

// An earlier failed commit never erases a later commit that succeeds.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      ${deferredSource("firstGate")}
      ${deferredSource("secondGate")}
      let call = 0;
      let diskTitle = "";
      persistDeskState = async () => {
        const n = ++call;
        await (n === 1 ? firstGate.promise : secondGate.promise);
        if (n === 1) return false;
        diskTitle = projects[0].title;
        return true;
      };
      const stores = window.AISystem6StateStores;
      const a = stores.projects.commit((draft) => { draft.projects[0].title = "A"; })
        .then(() => ({ ok: true }), (error) => ({ code: error.code }));
      const b = stores.projects.commit((draft) => { draft.projects[0].title = "B"; })
        .then(() => ({ ok: true }), (error) => ({ code: error.code }));
      firstGate.resolve();
      const resultA = await a;
      secondGate.resolve();
      const resultB = await b;
      return { resultA, resultB, memory: projects[0].title, disk: diskTitle };
    })()
  `);
  test.assert(
    outcome.resultA?.code === "STORE_PERSIST_FAILED",
    "the refused commit reports its own failure to its own caller"
  );
  test.assert(outcome.resultB?.ok === true, "the queued commit behind it still succeeds");
  test.assert(
    outcome.memory === "B" && outcome.disk === "B",
    "the failure does not put back a snapshot that predates the later commit"
  );
}

// A failed commit puts back only its own records.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      ${deferredSource("writeOpened")}
      ${deferredSource("release")}
      persistDeskState = async () => { writeOpened.resolve(); await release.promise; return false; };
      const commit = window.AISystem6StateStores.projects.commit((draft) => {
        draft.chatFiles.unshift({ id: "failed-file", projectId: "p1", type: "text", body: "must not survive" });
      }).then(() => ({ ok: true }), (error) => ({ code: error.code }));
      await writeOpened.promise;
      // Another operation lands while this write is open. It is not part of
      // the refused commit, so no rollback of that commit may touch it.
      chatFiles.push({ id: "other-file", projectId: "p1", type: "text", body: "another operation" });
      release.resolve();
      const result = await commit;
      return { result, ids: chatFiles.map((file) => file.id) };
    })()
  `);
  test.assert(outcome.result?.code === "STORE_PERSIST_FAILED", "the commit is refused");
  test.assert(
    !outcome.ids.includes("failed-file"),
    "the record the refused commit created is withdrawn"
  );
  test.assert(
    outcome.ids.includes("other-file"),
    "a record another operation added during the write is left alone"
  );
}

// A keystroke during the write stays on the desk instead of being rolled back.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      ${deferredSource("writeOpened")}
      ${deferredSource("release")}
      persistDeskState = async () => { writeOpened.resolve(); await release.promise; return true; };
      const commit = window.AISystem6StateStores.writing.commit((draft) => {
        draft.projects[0].questionSheet = "COMMITTED";
      });
      await writeOpened.promise;
      projects[0].questionSheet = "TYPED DURING SAVE";
      release.resolve();
      const result = await commit;
      let nextWrite = null;
      persistDeskState = async () => { nextWrite = projects[0].questionSheet; return true; };
      await saveDeskState();
      return { ok: result.ok, onScreen: projects[0].questionSheet, nextWrite };
    })()
  `);
  test.assert(outcome.ok === true, "the commit still reports the write it confirmed");
  test.assert(
    outcome.onScreen === "TYPED DURING SAVE",
    "the newer keystroke survives the commit that was already in flight"
  );
  test.assert(
    outcome.nextWrite === "TYPED DURING SAVE",
    "the text the disk does not have is what the next save writes"
  );
}

// A render failure after a committed save never rolls the record back.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      let disk = null;
      persistDeskState = async () => { disk = projects[0].title; return true; };
      renderPipeline = () => { throw new Error("injected render failure"); };
      const result = await window.AISystem6StateStores.writing.commit((draft) => {
        draft.projects[0].title = "saved";
      }).then(() => ({ ok: true }), (error) => ({ code: error.code, message: String(error.message) }));
      return { result, memory: projects[0].title, disk };
    })()
  `);
  test.assert(outcome.disk === "saved", "the write really landed in this scenario");
  test.assert(
    outcome.memory === "saved",
    "an interface failure after the transaction does not restore the older record"
  );
  test.assert(
    outcome.result?.ok === true,
    "and it is not reported to the caller as a failed save"
  );
}

// A commit keeps the project object every caller already holds.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      persistDeskState = async () => true;
      const held = getActiveProject();
      await window.AISystem6StateStores.writing.commit((draft) => {
        draft.projects[0].title = "changed";
      });
      held.questionSheet = "LATE AI RESULT";
      const live = getActiveProject();
      return {
        sameObject: live === held,
        stillInArray: projects.includes(held),
        onScreen: live.questionSheet,
      };
    })()
  `);
  test.assert(
    outcome.sameObject && outcome.stillInArray,
    "the handle taken before the commit is still the live record"
  );
  test.assert(
    outcome.onScreen === "LATE AI RESULT",
    "a write through that handle reaches the record the route reads"
  );
}

// --- The record feed and the mirror -----------------------------------------

// The feed reads the store through openAppDb/idbRequest, so the fixture
// replaces exactly those two and the rest of the path stays real.
const stubStoreSource = `
  window.__stored = new Map();
  function fakeRequest(result) {
    return {
      result,
      error: null,
      addEventListener(type, handler) { if (type === "success") Promise.resolve().then(handler); },
    };
  }
  openAppDb = async () => ({
    transaction: () => ({
      objectStore: () => ({ get: (id) => fakeRequest(window.__stored.get(id) ?? null) }),
    }),
    close() {},
  });
  idbRequest = (request) => Promise.resolve(request.result);
  window.AISystem6StorageTransactions = Object.assign({}, window.AISystem6StorageTransactions, {
    transactionDone: async () => {},
  });
`;

function seedRecord({ body, saved }) {
  return `
    projects.length = 0;
    chatFiles.length = 0;
    chatFiles.push({ id: "f1", projectId: "p1", type: "text", body: ${JSON.stringify(body)} });
    activeProjectId = "p1";
    storageRecordFingerprintCache.set("chatFiles", new Map([["f1", {
      id: "f1",
      fingerprint: JSON.stringify({ id: "f1", projectId: "p1", type: "text", body: ${JSON.stringify(saved)} }),
    }]]));
    ${stubStoreSource}
  `;
}

// An announced delete keeps a record with unsaved edits, and records why.
{
  const vmw = bootDesk();
  vmw.run(seedRecord({ body: "LOCAL UNSAVED", saved: "saved" }));
  const outcome = await vmw.run(`
    (async () => {
      await applyDeskRecordChanges({ changes: [], deletes: [{ key: "chatFiles", id: "f1" }] });
      return {
        kept: chatFiles.map((file) => file.body),
        conflicts: window.AISystem6DeskPersistence.conflictCount(),
      };
    })()
  `);
  test.assert(
    outcome.kept.length === 1 && outcome.kept[0] === "LOCAL UNSAVED",
    "the writer's own text is not deleted by a notice from another window"
  );
  test.assert(outcome.conflicts === 1, "and the deletion is recorded as a conflict, by collection and id");
}

// An announced delete removes a clean record.
{
  const vmw = bootDesk();
  vmw.run(seedRecord({ body: "saved", saved: "saved" }));
  const outcome = await vmw.run(`
    (async () => {
      await applyDeskRecordChanges({ changes: [], deletes: [{ key: "chatFiles", id: "f1" }] });
      return {
        remaining: chatFiles.length,
        base: storageRecordFingerprintCache.get("chatFiles").has("f1"),
        conflicts: window.AISystem6DeskPersistence.conflictCount(),
      };
    })()
  `);
  test.assert(outcome.remaining === 0, "a record with nothing unsaved is deleted");
  test.assert(outcome.base === false, "and its base goes with it, so it is not written back");
  test.assert(outcome.conflicts === 0, "a clean delete is not a conflict");
}

// A late delete for a record that is back on the store is an update.
{
  const vmw = bootDesk();
  vmw.run(seedRecord({ body: "saved", saved: "saved" }));
  const outcome = await vmw.run(`
    (async () => {
      window.__stored.set("f1", { id: "f1", projectId: "p1", type: "text", body: "REMOTE NEW" });
      await applyDeskRecordChanges({ changes: [], deletes: [{ key: "chatFiles", id: "f1" }] });
      return { bodies: chatFiles.map((file) => file.body) };
    })()
  `);
  test.assert(
    outcome.bodies.length === 1 && outcome.bodies[0] === "REMOTE NEW",
    "the store's current content decides, not the notice that arrived late"
  );
}

// A save carrying a base may not re-create a record the store deleted.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      const conflicts = [];
      let puts = 0;
      function fakeRequest(result) {
        return {
          result,
          error: null,
          addEventListener(type, handler) { if (type === "success") Promise.resolve().then(handler); },
        };
      }
      const store = {
        get: () => fakeRequest(null),
        put: () => { puts += 1; return fakeRequest(undefined); },
      };
      await putDeskRecordAtBase(
        store,
        { key: "chatFiles" },
        "f1",
        { id: "f1", projectId: "p1", body: "re-created" },
        "the-fingerprint-this-window-last-saw",
        conflicts
      );
      return { conflicts, puts };
    })()
  `);
  test.assert(
    outcome.conflicts.length === 1 && outcome.conflicts[0].id === "f1",
    "the write is refused as a conflict instead of silently re-creating the record"
  );
  test.assert(outcome.puts === 0, "and nothing is put");
}

// The mirror hint never assigns another window's text onto the record.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      projects[0].questionSheet = "LOCAL UNSAVED";
      ${stubStoreSource}
      window.__stored.set("p1", { id: "p1", name: "P1", title: "before", questionSheet: "REMOTE OLD", outline: "", drafts: [] });
      applyMirroredWorkingText({ projectId: "p1", questionSheet: "REMOTE OLD", outline: "", drafts: [] });
      await Promise.resolve();
      await Promise.resolve();
      return { onRecord: projects[0].questionSheet };
    })()
  `);
  test.assert(
    outcome.onRecord === "LOCAL UNSAVED",
    "a window with unsaved edits keeps them; the message is a hint, not a version"
  );
}

// A receipt is never edited before the commit that persists it is confirmed.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (async () => {
      persistDeskState = async () => true;
      const created = await window.AISystem6RunReceipts.createReceipt({
        projectId: "p1",
        sourceAppId: "reviewDesk",
        intent: "review",
      });
      // The save is refused from here on.
      persistDeskState = async () => false;
      const before = JSON.stringify(window.AISystem6RunReceipts.getReceipt(created.receiptId).runReceipt);
      const finished = await window.AISystem6RunReceipts.finishReceipt(created.receiptId, { status: "completed" });
      const after = JSON.stringify(window.AISystem6RunReceipts.getReceipt(created.receiptId).runReceipt);
      return { ok: finished.ok, reason: finished.reason, unchanged: before === after };
    })()
  `);
  test.assert(outcome.ok === false, "a refused write is reported as a failure");
  test.assert(
    outcome.unchanged === true,
    "the live receipt is untouched, so the refusal withdraws a change that was never made"
  );
}

// Why the save plan still scans every record.
//
// A record edited in place with nothing marking it dirty is a writer that did
// not report, and the plan has to hold both halves of that at once:
//
//   - on a collection whose writers all report (chatFiles is on the trust list
//     today), an unreported in-place edit is NOT written. That is the trade the
//     trust list buys - the save costs what the edit costs - and the evidence
//     that the writers still report is the run in
//     tests/e2e/scan-shadow.spec.mjs, which drives the app's own entry points
//     with the comparison switched on;
//   - on a collection that still has direct writers (projects: the outline
//     claim, DocMap, the dictionary, the Finder labels), the plan keeps the
//     full scan, so an unreported edit there is still caught.
//
// This case used to assert only the second half, on the day nothing was
// trusted; it now pins the boundary between the two.
{
  const vmw = bootDesk();
  const outcome = await vmw.run(`
    (() => {
      chatFiles.push({ id: "unmarked", projectId: "p1", type: "text", name: "Unmarked.md", body: "first", folderId: null });
      const chatDefinition = () => deskCollectionDefinitions().find((entry) => entry.key === "chatFiles");
      const firstPlan = deskCollectionPlan(chatDefinition());
      const wroteAtFirstPlan = firstPlan.puts.some((put) => put.id === "unmarked");
      storageRecordFingerprintCache.set("chatFiles", firstPlan.current);

      // No markDeskDirty, no store commit: exactly the legacy writer shape.
      chatFiles[0].body = "edited in place";
      const trustedPlan = deskCollectionPlan(chatDefinition());
      const trustedCatch = trustedPlan.puts.some((put) => put.id === "unmarked");

      // The same shape on a collection that is still fully scanned.
      projects.push({ id: "scan-me", name: "Scan Me", questionSheet: "", outline: "", drafts: [] });
      const projectDefinition = () => deskCollectionDefinitions().find((entry) => entry.key === "projects");
      const projectFirst = deskCollectionPlan(projectDefinition());
      storageRecordFingerprintCache.set("projects", projectFirst.current);
      projects.find((item) => item.id === "scan-me").questionSheet = "edited in place";
      const projectSecond = deskCollectionPlan(projectDefinition());
      const scannedCatch = projectSecond.puts.some(
        (put) => put.id === "scan-me" && put.item.questionSheet === "edited in place"
      );
      return { wroteAtFirstPlan, trustedCatch, scannedCatch };
    })()
  `);
  test.assert(outcome.wroteAtFirstPlan === true, "a new record is written on the first save");
  test.assert(
    outcome.trustedCatch === false,
    "a trusted collection is not scanned: an unreported in-place edit there is not written"
  );
  test.assert(
    outcome.scannedCatch === true,
    "a collection that still has direct writers keeps the full scan, so its unreported edits are still caught"
  );
}

test.finish();
