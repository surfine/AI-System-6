// A save plan is a promise about the bytes it froze, and the reports it
// answers are the reports it saw.
//
// The trusted fast path carries a record forward without re-reading it when no
// writer named it. That is only safe while "no writer named it" means "nothing
// moved": clearing a record's dirty mark after a commit that froze an older
// version made the next plan trust a version the disk never received, and the
// newer text was lost while both saves reported success. The same plan is the
// only thing allowed to answer a whole-collection mark.
//
// These run the real eager module set in a VM (the same bundle index.html
// loads) and replace only the transaction, which is what has to be held open
// to reach the moment a plan is frozen and its write is still in flight. The
// real IndexedDB path is covered in tests/e2e/incremental-persistence.spec.mjs.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("desk-dirty-versions");

// The collections whose writers are trusted, and where each one keeps its
// records. Every collection is keyed by the record's own id except the Trash,
// which is stored under `_storageId` and whose writers report the business id.
const trustedCollections = [
  { key: "scraps", array: "scraps", record: { id: "s1", projectId: "p1", title: "S", body: "v0", tags: [] } },
  { key: "chatFiles", array: "chatFiles", record: { id: "f1", projectId: "p1", type: "text", name: "F", body: "v0" } },
  { key: "chatFolders", array: "chatFolders", record: { id: "d1", projectId: "p1", name: "D", body: "v0" } },
  { key: "trash", array: "trashItems", record: { id: "t1", projectId: "p1", title: "T", body: "v0", _storageId: "storage-t1" } },
  { key: "imageAttachments", array: "imageAttachments", record: { id: "i1", projectId: "p1", name: "I", body: "v0" } },
];

const seedDesk = (records) => `
  projects.length = 0;
  projects.push({ id: "p1", name: "P1", title: "P1", questionSheet: "", outline: "", drafts: [] });
  chatFiles.length = 0;
  chatFolders.length = 0;
  scraps.length = 0;
  trashItems.length = 0;
  imageAttachments.length = 0;
  ${records}
  activeProjectId = "p1";
  selectedProjectId = "p1";
  startupProjectId = "p1";
  isProjectMounted = true;
  deskPersistenceWritable = true;
  renderPipeline = function noopRenderPipeline() {};
  renderDocuments = function noopRenderDocuments() {};
  renderProjectDisks = function noopRenderProjectDisks() {};
  // The comparison instrument scans every record, which is the other plan.
  // This contract is about the plan the app ships, so it is off.
  window.AISystem6ScanShadow = { isEnabled: () => false, enable: () => () => {}, report: () => ({ enabled: false }) };
  window.AISystem6DerivedIndexQueue = { afterProjectCommit: () => {} };
  window.AISystem6Perf = { start: () => () => {} };
`;

// The stand-in for the readwrite transaction: it stores exactly what the plan
// froze - never a re-read of the live object - and can hold the commit open
// until the test says the save may finish.
const fakeCommit = `
  const gate = (() => {
    let resolveOpen;
    let resolveRelease;
    return {
      opened: new Promise((resolve) => { resolveOpen = resolve; }),
      released: new Promise((resolve) => { resolveRelease = resolve; }),
      open: () => resolveOpen(),
      release: () => resolveRelease(),
      holding: false,
    };
  })();
  const disk = new Map();
  const writes = [];
  const diskKey = (key, id) => key + ":" + String(id);
  // Wait for the save to actually be standing inside the transaction. Pure
  // microtasks only: the stand-in commit never needs a timer, and a bounded
  // spin reports "the save never got there" instead of hanging the run.
  const waitForGate = async () => {
    for (let spin = 0; spin < 500 && !gate.holding; spin += 1) await Promise.resolve();
    return gate.holding;
  };
  let failNext = false;
  let holdNext = false;
  commitDeskPlansWhereverTheConnectionIs = async ({ changedPlans }) => {
    if (failNext) {
      failNext = false;
      throw new Error("the stand-in transaction failed");
    }
    const written = [];
    changedPlans.forEach((plan) => plan.puts.forEach(({ id, item }) => {
      disk.set(diskKey(plan.key, id), structuredClone(item));
      writes.push(diskKey(plan.key, id));
      written.push({ key: plan.key, cacheKey: String(id), id, fingerprint: deskRecordFingerprint(item) });
    }));
    changedPlans.forEach((plan) => plan.deletes.forEach(({ id }) => {
      disk.delete(diskKey(plan.key, id));
      writes.push("delete " + diskKey(plan.key, id));
    }));
    if (holdNext) {
      holdNext = false;
      gate.holding = true;
      gate.open();
      await gate.released;
      gate.holding = false;
    }
    return written;
  };
`;

function bootDesk(records = "") {
  const vmw = createAppBootVm();
  vmw.run(seedDesk(records));
  vmw.run(fakeCommit);
  return vmw;
}

/** The body of one record as the stand-in transaction last stored it. */
const diskBody = (vmw, key, id) => vmw.run(`disk.get(${JSON.stringify(`${key}:${id}`)})?.body ?? null`);

// --- One record per trusted collection: only the frozen version is answered --

for (const { key, array, record } of trustedCollections) {
  const vmw = bootDesk(`${array}.push(${JSON.stringify(record)});`);
  const id = record.id;
  const outcome = await vmw.run(`
    (async () => {
      const baseline = await persistDeskState();
      const baseWrites = writes.length;
      // v1 is reported and starts to save.
      ${array}.find((item) => item.id === ${JSON.stringify(id)}).body = "v1";
      markDeskDirty(${JSON.stringify(key)}, ${JSON.stringify(id)});
      holdNext = true;
      const saving = persistDeskState();
      const inFlight = await waitForGate();
      holdNext = false;
      // The plan is frozen with v1 on the disk path. The writer keeps typing.
      ${array}.find((item) => item.id === ${JSON.stringify(id)}).body = "v2";
      markDeskDirty(${JSON.stringify(key)}, ${JSON.stringify(id)});
      gate.release();
      const first = await saving;
      const afterFirst = writes.length;
      const second = await persistDeskState();
      const afterSecond = writes.length;
      // Nothing moved: a third save may not rewrite the same record again.
      const third = await persistDeskState();
      return {
        baseline, baseWrites, first, second, third, inFlight,
        wroteV1: afterFirst > baseWrites,
        wroteAgain: afterSecond > afterFirst,
        quietSaveWrote: writes.length > afterSecond,
      };
    })()
  `);
  const name = `${key}`;
  test.assert(outcome.baseline === true, `${name}: the first save lands`);
  test.assert(outcome.inFlight === true, `${name}: the edit reaches a transaction that is still open`);
  test.assert(
    outcome.first === true && outcome.second === true,
    `${name}: both saves report success`
  );
  test.assert(
    outcome.wroteV1 === true && outcome.wroteAgain === true,
    `${name}: the edit that arrived while the transaction was open is written by the next save`
  );
  test.assert(
    (await diskBody(vmw, key, "storage-t1")) === "v2" || (await diskBody(vmw, key, id)) === "v2",
    `${name}: the persisted record holds v2, not the frozen v1`
  );
  test.assert(
    outcome.quietSaveWrote === false,
    `${name}: a save with nothing new to say does not rewrite the record`
  );
}

// --- A whole-collection mark may not be skipped, and may not be consumed -----

for (const { key, array, record } of trustedCollections) {
  const vmw = bootDesk(`${array}.push(${JSON.stringify(record)});`);
  const id = record.id;
  const outcome = await vmw.run(`
    (async () => {
      await persistDeskState();
      const storedBodies = () => [...disk.entries()]
        .filter(([entry]) => entry.startsWith(${JSON.stringify(key)} + ":"))
        .map(([, value]) => value.body);
      // A writer that says "something in this collection moved" without
      // naming the record. The known record has to be re-read anyway.
      ${array}.find((item) => item.id === ${JSON.stringify(id)}).body = "collection-v1";
      markDeskDirty(${JSON.stringify(key)});
      const scanned = await persistDeskState();
      const afterScan = storedBodies();
      // The same thing again, this time while the first write is in flight.
      holdNext = true;
      ${array}.find((item) => item.id === ${JSON.stringify(id)}).body = "collection-v2";
      markDeskDirty(${JSON.stringify(key)});
      const saving = persistDeskState();
      const inFlight = await waitForGate();
      holdNext = false;
      ${array}.find((item) => item.id === ${JSON.stringify(id)}).body = "collection-v3";
      markDeskDirty(${JSON.stringify(key)});
      gate.release();
      await saving;
      const following = await persistDeskState();
      return { scanned, afterScan, following, inFlight, stored: storedBodies() };
    })()
  `);
  test.assert(
    outcome.scanned === true && outcome.afterScan.includes("collection-v1"),
    `${key}: a collection mark forces a rescan of a known record`
  );
  test.assert(outcome.following === true, `${key}: the save behind it still lands`);
  test.assert(
    outcome.stored.includes("collection-v3"),
    `${key}: a collection mark that arrived mid-save still forces the newer bytes out`
  );
  test.assert(outcome.inFlight === true, `${key}: the collection mark is carried by a transaction that is still open`);
}

// --- A refused transaction keeps its reports, and a retry still writes them --

{
  const vmw = bootDesk(`scraps.push({ id: "s1", projectId: "p1", title: "S", body: "v0", tags: [] });`);
  const outcome = await vmw.run(`
    (async () => {
      await persistDeskState();
      scraps[0].body = "v1";
      markDeskDirty("scraps", "s1");
      failNext = true;
      const refused = await persistDeskState();
      const afterRefusal = writes.length;
      const retried = await persistDeskState();
      return { refused, afterRefusal, retried, afterRetry: writes.length };
    })()
  `);
  test.assert(outcome.refused === false, "a failed transaction reports failure rather than a save");
  test.assert(
    outcome.retried === true && outcome.afterRetry > outcome.afterRefusal,
    "the retry after a failed transaction still carries the pending record"
  );
  test.assert((await diskBody(vmw, "scraps", "s1")) === "v1", "the retry writes the bytes the failed save could not");
}

// --- A delete racing a newer edit, and a record re-created behind a delete ---

{
  const vmw = bootDesk(`
    scraps.push({ id: "a1", projectId: "p1", title: "A", body: "a-v0", tags: [] });
    scraps.push({ id: "s1", projectId: "p1", title: "S", body: "v0", tags: [] });
  `);
  const outcome = await vmw.run(`
    (async () => {
      await persistDeskState();
      // The scrap is removed from the desk and reported as gone.
      const index = scraps.findIndex((item) => item.id === "a1");
      scraps.splice(index, 1);
      markDeskDeleted("scraps", "a1");
      // The record that stays is edited while that delete is on its way out.
      scraps[0].body = "v1";
      markDeskDirty("scraps", "s1");
      holdNext = true;
      const saving = persistDeskState();
      const inFlight = await waitForGate();
      holdNext = false;
      scraps[0].body = "v2";
      markDeskDirty("scraps", "s1");
      gate.release();
      await saving;
      await persistDeskState();
      return {
        inFlight,
        ids: [...disk.keys()].filter((entry) => entry.startsWith("scraps:")),
        body: disk.get("scraps:s1")?.body,
      };
    })()
  `);
  test.assert(outcome.inFlight === true, "the delete and the edit race a transaction that is still open");
  test.assert(
    outcome.ids.length === 1 && outcome.ids[0] === "scraps:s1",
    `the delete removes the record it named and nothing else (disk: ${JSON.stringify(outcome.ids)})`
  );
  test.assert(outcome.body === "v2", "the record that stayed keeps the edit that raced the delete");
}

{
  const vmw = bootDesk(`scraps.push({ id: "s1", projectId: "p1", title: "S", body: "v0", tags: [] });`);
  const outcome = await vmw.run(`
    (async () => {
      await persistDeskState();
      // Deleted, and put back under the same id while the delete is in flight.
      scraps.splice(0, 1);
      markDeskDeleted("scraps", "s1");
      holdNext = true;
      const saving = persistDeskState();
      const inFlight = await waitForGate();
      holdNext = false;
      scraps.push({ id: "s1", projectId: "p1", title: "S", body: "reborn", tags: [] });
      markDeskDirty("scraps", "s1");
      gate.release();
      await saving;
      const afterDelete = disk.get("scraps:s1")?.body ?? null;
      await persistDeskState();
      return { inFlight, afterDelete, afterRebirth: disk.get("scraps:s1")?.body ?? null };
    })()
  `);
  test.assert(outcome.inFlight === true, "the re-creation races a delete that is still open");
  test.assert(outcome.afterDelete === null, "the confirmed delete is not undone by the newer report");
  test.assert(
    outcome.afterRebirth === "reborn",
    "the re-created record is written by the next save instead of being read as the deleted one"
  );
}

test.finish();
