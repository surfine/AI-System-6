// ClioWorks v4 (V4-05) contract: impact plan and cross-file atomic update.
// Candidates prepare outside the slot; the commit re-verifies every read
// dependency and target INSIDE the serialised slot and writes the whole batch
// in one step or nothing. Approval is an in-host grant, never a message. The
// production port is source-bound to the desk's real commit queue and the
// IndexedDB write fence.
//
// The integration rules only accept in-realm plain JSON, so every record that
// crosses into the vm is re-created there — foreign prototypes are (correctly)
// rejected as NON_JSON.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-coordinator");

function makeContext() {
  // Only host functions are injected — every constructable intrinsic stays
  // the vm's own, so the integration rules' plain-JSON prototype checks see
  // one realm (an injected Node JSON.parse would hand back foreign objects).
  const context = {
    console, setTimeout, clearTimeout, queueMicrotask,
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("app/vendor/clioworks-v3/creator-integration.js"), context, { filename: "creator-integration.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/update-coordinator.js"), context, { filename: "update-coordinator.js" });
  return context;
}

const run = async () => {
  const context = makeContext();
  const Coordinator = context.AISystem6UpdateCoordinator;
  test.assert(!!Coordinator, "update-coordinator installs beside the vendored integration rules");

  // Everything the policies touch lives in the vm realm.
  const vmJson = (value) => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, context);
  const store = vm.runInContext(`(() => {
    const records = new Map();
    records.set("doc:script", { id: "doc:script", scope: "proj", generation: 1, revision: 3, body: { text: "导出用了 42 秒。" } });
    records.set("doc:data", { id: "doc:data", scope: "proj", generation: 1, revision: 7, body: { cells: { D5: "synthetic-log-01" } } });
    const writes = [];
    let tail = Promise.resolve();
    return {
      records, writes,
      enqueue: (task) => { const run = tail.then(() => task()); tail = run.then(() => undefined, () => undefined); return run; },
      readDocument: async (id) => { const r = records.get(id); return r ? JSON.parse(JSON.stringify(r)) : null; },
      writeDocuments: async (batch) => { writes.push(batch.map((d) => d.id)); for (const r of batch) records.set(r.id, JSON.parse(JSON.stringify(r))); },
    };
  })()`, context);
  const documents = await vm.runInContext("Promise.all([globalThis.__store.readDocument('doc:script'), globalThis.__store.readDocument('doc:data')])", (context.__store = store, context));
  context.__store = store;

  const coordinator = Coordinator.createCoordinator({
    readDocument: store.readDocument,
    writeDocuments: store.writeDocuments,
    enqueue: store.enqueue,
  });

  // 1. Prepare outside the slot, approve, commit: whole batch at once.
  const plan = await coordinator.prepare({
    operationId: "op-1",
    documents,
    replacements: vmJson([{ id: "doc:script", body: { text: "导出耗时 42 秒。" } }]),
    readIds: ["doc:data"],
    label: "更新口播",
  });
  test.assert(plan.schema === 1 && plan.seal && plan.reads.length === 2 && plan.writes.length === 1,
    "the plan carries the full read set (targets AND sources) under a seal");
  const grant = coordinator.approve(plan);
  const receipt = await coordinator.commit(plan, grant);
  const scriptAfter = await vm.runInContext("globalThis.__store.readDocument('doc:script')", context);
  const dataAfter = await vm.runInContext("globalThis.__store.readDocument('doc:data')", context);
  test.assert(receipt.status === "ok" && receipt.committed.length === 1 && receipt.committed[0].revision === 4
    && scriptAfter.body.text === "导出耗时 42 秒。" && scriptAfter.revision === 4,
    "the committed batch lands atomically with a bumped revision");
  test.assert(dataAfter.revision === 7, "an untouched read dependency is not rewritten");

  // 2. No grant, or a forged token, authorizes nothing.
  let consent = "";
  try { await coordinator.commit(plan, {}); } catch (error) { consent = error.code; }
  test.assert(consent === "CONSENT_REQUIRED", "a forged approval object is refused");
  const fresh = await coordinator.prepare({ operationId: "op-2", documents, replacements: vmJson([{ id: "doc:script", body: { text: "x" } }]) });
  let noGrant = "";
  try { await coordinator.commit(fresh, null); } catch (error) { noGrant = error.code; }
  test.assert(noGrant === "CONSENT_REQUIRED", "committing without the host grant is refused");

  // 3. Preview then edit: the target moved on → blocked, nothing written.
  await vm.runInContext(`globalThis.__store.records.set("doc:script", { id: "doc:script", scope: "proj", generation: 1, revision: 11, body: { text: "用户在预览后改写了这句。" } })`, context);
  const staleDocs = await vm.runInContext("Promise.all([globalThis.__store.readDocument('doc:script'), globalThis.__store.readDocument('doc:data')])", context);
  const stalePlan = await coordinator.prepare({
    operationId: "op-3",
    documents: staleDocs,
    replacements: vmJson([{ id: "doc:script", body: { text: "导出耗时 42 秒。" } }]),
    readIds: ["doc:data"],
  });
  const staleGrant = coordinator.approve(stalePlan);
  await vm.runInContext(`globalThis.__store.records.get("doc:script").revision = 12`, context); // moved again after approval
  const writesBefore = store.writes.length;
  const stale = await coordinator.commit(stalePlan, staleGrant);
  const afterStale = await vm.runInContext("globalThis.__store.readDocument('doc:script')", context);
  test.assert(stale.status === "blocked" && String(stale.code || "").startsWith("READ_DEPENDENCY")
    && store.writes.length === writesBefore && afterStale.revision === 12,
    "a preview whose baseline moved on is blocked with no half batch");

  // 4. A read dependency (source) changing also voids the plan.
  const docs4 = await vm.runInContext("Promise.all([globalThis.__store.readDocument('doc:script'), globalThis.__store.readDocument('doc:data')])", context);
  const plan4 = await coordinator.prepare({
    operationId: "op-4",
    documents: docs4,
    replacements: vmJson([{ id: "doc:script", body: { text: "又一次更新。" } }]),
    readIds: ["doc:data"],
  });
  const grant4 = coordinator.approve(plan4);
  await vm.runInContext(`globalThis.__store.records.get("doc:data").revision = 8`, context);
  const sourceMoved = await coordinator.commit(plan4, grant4);
  test.assert(sourceMoved.status === "blocked" && sourceMoved.code === "READ_DEPENDENCY_CHANGED",
    "a source that changed after the preview voids the old approval");

  // 5. Compensating undo: only while the targets still sit at this revision.
  const docs5 = await vm.runInContext("Promise.all([globalThis.__store.readDocument('doc:script'), globalThis.__store.readDocument('doc:data')])", context);
  const beforeBody = await vm.runInContext("JSON.parse(JSON.stringify(globalThis.__store.records.get('doc:script').body))", context);
  const plan5 = await coordinator.prepare({
    operationId: "op-5",
    documents: docs5,
    replacements: vmJson([{ id: "doc:script", body: { text: "待撤销的更新。" } }]),
    readIds: [],
  });
  const grant5 = coordinator.approve(plan5);
  const receipt5 = await coordinator.commit(plan5, grant5);
  test.assert(receipt5.status === "ok", "the undo-able batch commits");
  const compensated = await coordinator.compensate(receipt5, vmJson({ "doc:script": beforeBody }));
  const afterComp = await vm.runInContext("globalThis.__store.readDocument('doc:script')", context);
  test.assert(compensated.status === "ok" && afterComp.body.text !== "待撤销的更新。",
    "compensation reverts exactly this batch");
  const docs6 = await vm.runInContext("Promise.all([globalThis.__store.readDocument('doc:script'), globalThis.__store.readDocument('doc:data')])", context);
  const beforeBody6 = await vm.runInContext("JSON.parse(JSON.stringify(globalThis.__store.records.get('doc:script').body))", context);
  const plan6 = await coordinator.prepare({
    operationId: "op-6",
    documents: docs6,
    replacements: vmJson([{ id: "doc:script", body: { text: "第二次。" } }]),
  });
  const grant6 = coordinator.approve(plan6);
  const receipt6 = await coordinator.commit(plan6, grant6);
  await vm.runInContext(`globalThis.__store.records.get("doc:script").revision = 99`, context); // a later edit
  const superseded = await coordinator.compensate(receipt6, vmJson({ "doc:script": beforeBody6 }));
  const afterSuper = await vm.runInContext("globalThis.__store.readDocument('doc:script')", context);
  test.assert(superseded.status === "blocked" && superseded.code === "COMPENSATION_SUPERSEDED"
    && afterSuper.revision === 99,
    "a later edit outranks the rollback — the desktop history is never rewound");

  // 6. The production port binds the desk's real queue and IndexedDB fence.
  const source = read("app/vendor/clioworks-v3/update-coordinator.js");
  test.assertIncludes(source, "AISystem6DeskCommits", "the desk port routes through the desk's single commit slot");
  test.assertIncludes(source, "AISystem6StorageTransactions", "the desk port runs inside the durable write-fence transaction");
  const bare = Coordinator.createDeskPort({});
  test.assert(bare === null, "without the real modules the desk port refuses instead of degrading");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
