// Desktop maintenance: "Rebuild Desktop" and Project Disk First Aid as
// invisible background hygiene. It repairs derived indexes and clearly broken
// internal pointers on boot idle, project switches, and backup imports.
// Broken relations are quarantined into repairReceipts, and orphaned Project
// CD / Trash records are retained, never silently deleted. It must not add
// UI, show status text, or touch user-authored content.
//
// The only production entry is window.AISystem6DesktopMaintenance.runNow():
// every runtime scenario here drives the real engine through that facade —
// never through an internal helper. Repairs are conservative: duplicated ids
// are renumbered one record at a time, relations are typed, and a relation
// that only knows an old id keeps pointing at the first legal record.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("desktop-maintenance");
const manifest = read("tooling/runtime-manifest.mjs");
const maintenance = read("app/core/desktop-maintenance.js");
const config = read("app/core/config.js");
const boot = read("app/core/boot.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const exportImport = read("app/features/export-import.js");
const queue = read("app/core/derived-index-queue.js");
const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const translations = read("app/data/translations-en.js");

test.assertIncludes(manifest, '"app/core/desktop-maintenance.js"', "the maintenance engine is a lazy module");
test.assertNotIncludes(manifest.split("lazyRuntimePaths = [")[0], "app/core/desktop-maintenance.js", "the maintenance engine is not part of the startup bundle list");

test.assertIncludes(maintenance, "window.AISystem6DesktopMaintenance", "the maintenance engine exposes an internal API");
test.assertIncludes(maintenance, "function appendRepairReceipt", "repairs leave a bounded receipt on the repaired record");
test.assertIncludes(maintenance, "maxRepairReceipts", "receipt lists are capped");
test.assertIncludes(maintenance, "previousValue", "receipts keep the previous value under a neutral field name");
test.assertIncludes(maintenance, '"quarantined"', "quarantined relations are marked");
test.assertIncludes(maintenance, '"moved-to-root"', "folder repairs are marked moved-to-root");
test.assertIncludes(maintenance, '"reassigned-id"', "id reassignments are marked");
test.assertIncludes(maintenance, '"retained"', "orphaned deliverables are marked retained");
test.assertIncludes(maintenance, '"orphan-project"', "orphaned records are categorized as orphan-project");
test.assertIncludes(maintenance, "function planRecordIdRepairs", "duplicate or missing record ids are planned without mutating");
test.assertIncludes(maintenance, "function planDesktopMaintenance", "a dry-run planner produces a repair plan without mutating");
test.assertIncludes(maintenance, "touchesProjectData", "the plan distinguishes project-data changes from derived rebuilds");
test.assertIncludes(maintenance, "function planDerivedIndexRepairs", "derived index repairs are planned separately");
test.assertIncludes(maintenance, "function applyMaintenancePlan", "the plan executor applies the planned repairs");
test.assertIncludes(maintenance, "relationTargetKinds", "relation fields carry explicit target kinds");
test.assertIncludes(maintenance, 'folderId: "folder"', "folderId is typed as a folder relation");
test.assertIncludes(maintenance, 'parentChatId: "file"', "parentChatId is typed as a file relation");
test.assertIncludes(maintenance, 'referenceId: "reference"', "referenceId is typed as a reference relation");
test.assertIncludes(maintenance, "aliasTargetKinds", "alias targets are typed by their own kind");
test.assertIncludes(maintenance, "function maintenanceSnapshotForPlan", "project-data repairs snapshot the affected collections");
test.assertIncludes(maintenance, "maintenanceSnapshotKey", "snapshots persist in the keyval store");
test.assertIncludes(maintenance, "maintenanceRepairKey", "repair records persist in the keyval store");
test.assertIncludes(maintenance, "function buildRepairRecord", "each repair run builds a Repair Record");
test.assertIncludes(maintenance, "oldNewIds", "the Repair Record carries the old/new id map");
test.assertIncludes(maintenance, "removedDanglingRelations", "the Repair Record lists quarantined dangling relations");
test.assertIncludes(maintenance, "function restoreMaintenanceSnapshot", "a pre-repair snapshot can be restored");
test.assertIncludes(maintenance, "pushSystemNotification", "project-data repairs notify through the Notification Center");
test.assertIncludes(maintenance, "saveDeskState()", "the applied repair persists through one desk-state transaction");
test.assertIncludes(maintenance, '"folder-cycle"', "folder cycles are planned safely");
test.assertIncludes(maintenance, '"orphan-parent"', "dangling folder parents are planned as orphan-parent");
test.assertIncludes(maintenance, '"orphan-folder"', "records with missing folders are planned as orphan-folder");
test.assertIncludes(maintenance, "Project CD item belongs to a missing project", "orphaned Project CD items are reported");
test.assertIncludes(maintenance, "trash item belongs to a missing project", "orphaned trash records are reported");
test.assertIncludes(maintenance, "rebuild-index", "stale or missing derived indexes are rebuilt internally");
test.assertIncludes(maintenance, "resync-index", "stale derived products are re-synchronized");
test.assertIncludes(maintenance, "renderDocuments?.()", "repairs refresh the Finder surfaces quietly");
test.assertIncludes(maintenance, "console.info", "the engine reports only to the console");
test.assertIncludes(
  maintenance,
  "user-authored content are never rewritten",
  "the module comment states exactly what is and is not touched"
);

test.assertNotIncludes(maintenance, "setStatus(", "maintenance never shows status text");
test.assertNotIncludes(maintenance, "data-i18n", "maintenance adds no UI labels");
test.assertNotIncludes(maintenance, "openWindow(", "maintenance opens no windows");
test.assertNotIncludes(maintenance, "repairLiveState", "the old bypass path that applied repairs without a plan is gone");
test.assertNotIncludes(maintenance, "repairDerivedIndexes", "the old derived-index helper that skipped the plan is gone");
test.assertNotIncludes(maintenance, "relation-remap", "no guess-based string-equality remapping remains");
test.assertNotIncludes(menus, "desktop-maintenance", "no menu item exposes maintenance");
test.assertNotIncludes(actions, "desktop-maintenance", "no command handler exposes maintenance");
test.assertIncludes(translations, "maintenance_repaired", "the Notification Center message for a repair run");
test.assertIncludes(translations, "maintenance_restored", "the Notification Center message for a snapshot restore");
test.assertIncludes(translations, "maintenance_record_failed", "a lost Repair Record leaves an error notification");
test.assertIncludes(translations, "view_repair_report", "the notification offers a repair report action");

const runDesktopMaintenanceDeclarations = maintenance.match(/^async function runDesktopMaintenance\s*\(/gm) || [];
test.assert(
  runDesktopMaintenanceDeclarations.length === 1,
  "desktop-maintenance.js declares runDesktopMaintenance exactly once (shared top-level scope)"
);

test.assertIncludes(config, "function scheduleDesktopMaintenance", "one invisible scheduler loads the lazy engine");
test.assertIncludes(boot, 'scheduleDesktopMaintenance("boot")', "boot schedules a deferred sweep after the app is ready");
test.assertIncludes(desktopRuntime, 'scheduleDesktopMaintenance("project")', "project switches trigger a quiet sweep");
test.assertIncludes(exportImport, 'scheduleDesktopMaintenance("import")', "backup imports trigger a quiet sweep");
test.assertIncludes(queue, "derivedIndexSilent", "background rebuilds can suppress index notifications");
test.assertIncludes(queue, "options.silent", "the queue accepts silent rebuild requests");

// ---- Runtime harness ------------------------------------------------------
// A minimal IndexedDB keyval stand-in plus a saveDeskState that "persists"
// the desk into a reloadable backing store. Every scenario drives the real
// engine through window.AISystem6DesktopMaintenance.runNow(...).

const projectId = "project-1";
const snapshotKey = "desktopMaintenanceSnapshots:v1";
const repairKey = "desktopMaintenanceRepairs:v1";

function createMaintenanceHarness(state = {}) {
  const keyval = new Map();
  const keyvalWriteOrder = [];
  const failedWriteKeys = new Set();
  const calls = { saves: 0, notifications: [], renders: 0 };
  let saveResult = true;
  let failNextSave = false;
  const persistedDesk = { projects: [], chatFolders: [], chatFiles: [], scraps: [], projectReferences: [], projectCdItems: [], trashItems: [] };
  const collectionNames = Object.keys(persistedDesk);

  const context = vm.createContext({
    crypto: webcrypto,
    structuredClone,
    window: {},
    console: { info: () => {}, warn: () => {}, error: () => {} },
    t: (key, ...args) => `${key}:${args.join(":")}`,
    activeProjectId: projectId,
    keyvalStoreName: "keyval",
    openAppDb: () => Promise.resolve({ close: () => {} }),
    idbRequest: (request) => request,
    saveDeskState: async () => {
      calls.saves += 1;
      if (failNextSave) {
        failNextSave = false;
        return false;
      }
      if (saveResult === false) return false;
      collectionNames.forEach((name) => {
        persistedDesk[name] = (context[name] || []).map((record) => structuredClone(record));
      });
      return true;
    },
    renderDocuments: () => { calls.renders += 1; },
    renderProjectDisks: () => {},
    renderScraps: () => {},
    renderTrash: () => {},
    renderProjectCd: () => {},
    pushSystemNotification: (message, options = {}) => {
      calls.notifications.push({ message, options });
      return "";
    },
  });
  context.window.AISystem6StorageTransactions = {
    runTransaction: async (_db, _stores, _mode, operation) => {
      const tx = {
        objectStore: () => ({
          get: async (key) => keyval.get(key),
          put: async (value, key) => {
            if (failedWriteKeys.has(key)) throw new Error(`keyval write failed: ${key}`);
            keyval.set(key, structuredClone(value));
            keyvalWriteOrder.push(key);
          },
        }),
      };
      return operation(tx);
    },
  };
  collectionNames.forEach((name) => {
    context[name] = (state[name] || []).map((record) => structuredClone(record));
  });
  vm.runInContext(maintenance, context);
  return {
    context,
    keyval,
    keyvalWriteOrder,
    failedWriteKeys,
    calls,
    persistedDesk,
    failNextSave: () => { failNextSave = true; },
    setSaveResult: (value) => { saveResult = value; },
    failWriteKey: (key) => { failedWriteKeys.add(key); },
    runNow: () => context.window.AISystem6DesktopMaintenance.runNow("test"),
    restoreSnapshot: (id) => context.window.AISystem6DesktopMaintenance.restoreSnapshot(id),
    listRepairs: async () => {
      const value = await context.window.AISystem6DesktopMaintenance.listRepairs();
      return value;
    },
  };
}

function reloadFrom(harness) {
  const next = createMaintenanceHarness(harness.persistedDesk);
  for (const [key, value] of harness.keyval) next.keyval.set(key, structuredClone(value));
  return next;
}

function brokenDeskState() {
  return {
    projects: [{ id: projectId, name: "P" }],
    chatFolders: [
      { id: "folder-a", projectId, name: "A", parentId: "folder-b" },
      { id: "folder-b", projectId, name: "B", parentId: "folder-a" },
    ],
    chatFiles: [
      { id: "file-1", projectId, name: "Draft", body: "Body text", sourceDocumentId: "file-gone", sourceChatId: "chat-gone" },
      { id: "file-2", projectId, name: "Loose", body: "x", folderId: "missing-folder" },
    ],
    scraps: [],
    projectReferences: [],
    projectCdItems: [{ id: "cd-orphan", projectId: "ghost-project", title: "CD", body: "Deliverable" }],
    trashItems: [{
      id: "trash-orphan",
      projectId: "ghost-project",
      title: "Deleted",
      originalType: "file",
      originalData: {},
    }],
  };
}

// ---- Runtime: runNow repairs a broken desk through the public facade -------

const brokenHarness = createMaintenanceHarness(brokenDeskState());
const brokenContext = brokenHarness.context;
const brokenCalls = brokenHarness.calls;
await brokenHarness.runNow();

const file = brokenContext.chatFiles.find((entry) => entry.id === "file-1");
const looseFile = brokenContext.chatFiles.find((entry) => entry.id === "file-2");
const folderA = brokenContext.chatFolders.find((entry) => entry.id === "folder-a");
const orphanCd = brokenContext.projectCdItems[0];
const orphanTrash = brokenContext.trashItems[0];

test.assert(
  file.body === "Body text" && file.name === "Draft",
  "repair never touches file body or name"
);
test.assert(
  file.sourceDocumentId === undefined && file.sourceChatId === undefined,
  "dangling source relations leave the active fields"
);
const fileReceipt = (file.repairReceipts || []).find((receipt) => receipt.field === "sourceDocumentId");
test.assert(
  fileReceipt?.previousValue === "file-gone" && fileReceipt?.action === "quarantined",
  "the quarantined source id survives in repairReceipts.previousValue"
);
test.assert(
  folderA.parentId === null,
  "a folder cycle is broken by disconnecting the offending parentId"
);
const cycleReceipt = (folderA.repairReceipts || []).find((receipt) => receipt.field === "parentId");
test.assert(
  cycleReceipt?.previousValue === "folder-b" && cycleReceipt?.action === "moved-to-root",
  "the broken folder parent id is preserved in a moved-to-root receipt"
);
test.assert(
  looseFile.folderId === null,
  "a record with a missing folder returns to the root"
);
const cdReceipt = (orphanCd.repairReceipts || []).find((receipt) => receipt.kind === "orphan-project");
test.assert(
  cdReceipt?.previousValue === "ghost-project" && cdReceipt?.action === "retained",
  "the retained Project CD keeps an orphan-project receipt"
);
const trashReceipt = (orphanTrash.repairReceipts || []).find((receipt) => receipt.kind === "orphan-project");
test.assert(
  trashReceipt?.previousValue === "ghost-project" && trashReceipt?.action === "retained",
  "the retained Trash record keeps an orphan-project receipt"
);
test.assert(
  brokenCalls.saves === 1,
  "a successful repair run persists the desk exactly once"
);
test.assert(
  brokenHarness.keyvalWriteOrder.join(",") === `${snapshotKey},${repairKey}`,
  "the snapshot is persisted BEFORE the repair is applied and the Repair Record after"
);
test.assert(
  brokenHarness.keyval.has(snapshotKey) && brokenHarness.keyval.get(snapshotKey).length === 1,
  "the pre-repair snapshot is stored in the keyval store"
);
test.assert(
  brokenHarness.keyval.has(repairKey) && brokenHarness.keyval.get(repairKey).length === 1,
  "the Repair Record is stored in the keyval store"
);
const storedRepair = brokenHarness.keyval.get(repairKey)[0];
test.assert(
  storedRepair.snapshotId === brokenHarness.keyval.get(snapshotKey)[0].id
    && storedRepair.removedDanglingRelations.length === 2,
  "the Repair Record references the persisted snapshot and lists quarantined links"
);
test.assert(
  brokenCalls.notifications.some((entry) => entry.message.startsWith("maintenance_repaired:")),
  "a successful repair run notifies through the Notification Center"
);

const secondRunHarness = reloadFrom(brokenHarness);
await secondRunHarness.runNow();
test.assert(
  secondRunHarness.calls.saves === 0,
  "after a reload the repaired state is already clean: no second save happens"
);
const reloadedRepairs = await secondRunHarness.listRepairs();
test.assert(
  reloadedRepairs.length === 1 && reloadedRepairs[0].id === storedRepair.id,
  "after a reload the Repair Record is still there (truly persisted)"
);

// ---- Runtime: typed relation semantics -------------------------------------

const typedState = {
  projects: [{ id: projectId, name: "P" }],
  chatFolders: [
    { id: "dup-file", projectId, name: "FolderDup" },
    { id: "dup-folder", projectId, name: "FolderA" },
    { id: "dup-folder", projectId, name: "FolderB" },
  ],
  chatFiles: [
    { id: "dup-file", projectId, name: "A", body: "a" },
    { id: "dup-file", projectId, name: "B", body: "b" },
    { id: "alias-1", projectId, type: "alias", name: "Alias", aliasTarget: { kind: "file", id: "dup-file" } },
    { id: "child-1", projectId, name: "Child", folderId: "dup-file" },
    { id: "dup-ref", projectId, name: "FileSharingRefString" },
    { id: "file-with-ref", projectId, name: "WithRef", referenceId: "dup-ref" },
    { id: "loose-1", projectId, name: "Loose", folderId: "missing-folder" },
  ],
  scraps: [],
  projectReferences: [
    { id: "dup-ref", projectId, title: "RefA" },
    { id: "dup-ref", projectId, title: "RefB" },
  ],
  projectCdItems: [],
  trashItems: [],
};

const typedHarness = createMaintenanceHarness(typedState);
const typedContext = typedHarness.context;
const typedPlan = typedContext.window.AISystem6DesktopMaintenance.plan(projectId);
test.assert(
  !typedPlan.items.some((item) => item.kind === "relation-remap"),
  "the plan never proposes a guess-based relation remap"
);
test.assert(
  typedPlan.relationSchema.folderId === "folder"
    && typedPlan.relationSchema.referenceId === "reference"
    && typedPlan.relationSchema.parentChatId === "file"
    && typedPlan.relationSchema.aliasTarget === "aliasTarget.kind",
  "the plan carries the typed relation schema"
);
test.assert(
  typedContext.chatFiles.every((entry) => entry.id === typedState.chatFiles.find((orig) => orig.name === entry.name)?.id),
  "the dry run never mutates records"
);

await typedHarness.runNow();

const fileA = typedContext.chatFiles.find((entry) => entry.name === "A");
const fileB = typedContext.chatFiles.find((entry) => entry.name === "B");
const alias = typedContext.chatFiles.find((entry) => entry.name === "Alias");
const child = typedContext.chatFiles.find((entry) => entry.name === "Child");
const fileWithRef = typedContext.chatFiles.find((entry) => entry.name === "WithRef");
const loose = typedContext.chatFiles.find((entry) => entry.name === "Loose");
const folderDupA = typedContext.chatFolders.find((entry) => entry.name === "FolderA");
const folderDupB = typedContext.chatFolders.find((entry) => entry.name === "FolderB");
const refA = typedContext.projectReferences.find((entry) => entry.title === "RefA");
const refB = typedContext.projectReferences.find((entry) => entry.title === "RefB");

test.assert(
  fileA.id === "dup-file" && fileB.id !== "dup-file" && /^[a-f0-9-]{36}$/i.test(fileB.id),
  "the first legal record keeps the old id; later duplicates get a fresh id"
);
const reassignReceipt = (fileB.repairReceipts || []).find((receipt) => receipt.kind === "duplicate-id");
test.assert(
  reassignReceipt?.previousValue === "dup-file" && reassignReceipt?.action === "reassigned-id",
  "the renumbered duplicate leaves a Repair Receipt with the old id"
);
test.assert(
  alias.aliasTarget.id === "dup-file" && alias.aliasTarget.kind === "file",
  "an alias that only knew the old id keeps pointing at the first legal file"
);
test.assert(
  child.folderId === "dup-file",
  "a folderId that shares its string with a file id is typed as folder and is never remapped to a file id"
);
test.assert(
  fileWithRef.referenceId === "dup-ref",
  "a referenceId that shares its string with a file id stays a reference and is never remapped"
);
test.assert(
  refA.id === "dup-ref" && refB.id !== "dup-ref",
  "duplicate reference ids keep the first record and renumber later ones"
);
test.assert(
  folderDupA.id === "dup-folder" && folderDupB.id !== "dup-folder",
  "duplicate folder ids keep the first record and renumber later ones"
);
test.assert(
  loose.folderId === null,
  "a truly dangling folderId is quarantined to the root"
);
const danglingReceipt = (loose.repairReceipts || []).find((receipt) => receipt.field === "folderId");
test.assert(
  danglingReceipt?.action === "moved-to-root" && danglingReceipt?.previousValue === "missing-folder",
  "the dangling folderId survives in a receipt"
);

// ---- Runtime: snapshot / persist / record failure semantics ----------------

// (a) Snapshot write failure: nothing may be repaired or saved.
const snapshotFailHarness = createMaintenanceHarness(brokenDeskState());
snapshotFailHarness.failWriteKey(snapshotKey);
await snapshotFailHarness.runNow();
test.assert(
  snapshotFailHarness.calls.saves === 0,
  "when the snapshot cannot be written, the desk is never saved"
);
test.assert(
  snapshotFailHarness.context.chatFiles.find((entry) => entry.id === "file-1").sourceDocumentId === "file-gone",
  "when the snapshot cannot be written, no repair is applied"
);
test.assert(
  snapshotFailHarness.calls.notifications.some((entry) => entry.message.startsWith("maintenance_snapshot_failed:"))
    && !snapshotFailHarness.keyval.has(repairKey)
    && !snapshotFailHarness.calls.notifications.some((entry) => entry.message.startsWith("maintenance_repaired:")),
  "when the snapshot cannot be written, a failure notification appears, no repair record is stored, and no success is claimed"
);

// (b) Desk-state write failure: the in-memory apply must be rolled back.
const saveFailHarness = createMaintenanceHarness(brokenDeskState());
saveFailHarness.failNextSave();
await saveFailHarness.runNow();
const saveFailedFile = saveFailHarness.context.chatFiles.find((entry) => entry.id === "file-1");
const saveFailedFolder = saveFailHarness.context.chatFolders.find((entry) => entry.id === "folder-a");
test.assert(
  saveFailedFile.sourceDocumentId === "file-gone" && saveFailedFile.sourceChatId === "chat-gone",
  "a failed desk save rolls the in-memory repair back"
);
test.assert(
  saveFailedFolder.parentId === "folder-b",
  "a failed desk save rolls folder repairs back too"
);
test.assert(
  !saveFailHarness.keyval.has(repairKey),
  "a failed desk save leaves no Repair Record behind"
);
test.assert(
  saveFailHarness.calls.notifications.some((entry) => entry.message.startsWith("maintenance_save_failed:")),
  "a failed desk save leaves a user-visible failure notification"
);

// (c) Repair Record write failure: the saved project stays, an error
// notification is left, and no fake success is claimed.
const recordFailHarness = createMaintenanceHarness(brokenDeskState());
recordFailHarness.failWriteKey(repairKey);
await recordFailHarness.runNow();
const recordFailedFile = recordFailHarness.context.chatFiles.find((entry) => entry.id === "file-1");
test.assert(
  recordFailedFile.sourceDocumentId === undefined,
  "a lost Repair Record does not undo the already-saved repair"
);
test.assert(
  recordFailHarness.calls.saves === 1 && recordFailHarness.persistedDesk.chatFiles[0].sourceDocumentId === undefined,
  "the repair really persisted before the Repair Record write failed"
);
test.assert(
  recordFailHarness.calls.notifications.some((entry) => entry.message.startsWith("maintenance_record_failed:")),
  "a lost Repair Record leaves an error notification"
);
test.assert(
  !recordFailHarness.keyval.has(repairKey),
  "the failed Repair Record is not stored"
);

// (c2) Pre-repair revision write failure: the repair must abort before any
// repair is applied, and the user sees a failure notification.
const revisionFailHarness = createMaintenanceHarness(brokenDeskState());
revisionFailHarness.context.createDocumentRevision = async () => {
  throw new Error("forced revision write failure");
};
await revisionFailHarness.runNow();
const revisionFailedFile = revisionFailHarness.context.chatFiles.find((entry) => entry.id === "file-1");
test.assert(
  revisionFailedFile.sourceDocumentId === "file-gone" && revisionFailedFile.sourceChatId === "chat-gone",
  "a failed pre-repair revision aborts maintenance before any repair is applied"
);
test.assert(
  revisionFailHarness.calls.notifications.some((entry) => entry.message.startsWith("maintenance_revision_failed:")),
  "a failed pre-repair revision leaves a user-visible failure notification"
);
test.assert(
  !revisionFailHarness.keyval.has(repairKey),
  "a failed pre-repair revision leaves no Repair Record behind"
);

// (d) Restore with a failed save: returns false and never notifies.
const restoreFailHarness = createMaintenanceHarness(brokenDeskState());
await restoreFailHarness.runNow();
const restoredSnapshotId = restoreFailHarness.keyval.get(snapshotKey)[0].id;
restoreFailHarness.failNextSave();
const restoreFailed = await restoreFailHarness.restoreSnapshot(restoredSnapshotId);
test.assert(
  restoreFailed === false,
  "restore returns false when the restore cannot be persisted"
);
test.assert(
  restoreFailHarness.calls.notifications.length === 1,
  "a failed restore never pushes the success notification"
);

// (e) Reload persistence for restore: the restored content survives a reload.
const restoreHarness = createMaintenanceHarness(brokenDeskState());
await restoreHarness.runNow();
const snapshotId = restoreHarness.keyval.get(snapshotKey)[0].id;
const restored = await restoreHarness.restoreSnapshot(snapshotId);
test.assert(restored === true, "a successful restore returns true");
const restoredReload = reloadFrom(restoreHarness);
test.assert(
  restoredReload.context.chatFiles.find((entry) => entry.id === "file-1").sourceDocumentId === "file-gone",
  "after a reload the restored snapshot content is still there"
);

// ---- Receipt cap + dedupe --------------------------------------------------

const capHarness = createMaintenanceHarness();
const capRecord = {};
for (let index = 0; index < 20; index += 1) {
  capHarness.context.appendRepairReceipt(capRecord, {
    kind: "test",
    field: "field",
    previousValue: `value-${index}`,
    action: "retained",
  });
}
test.assert(
  capRecord.repairReceipts.length === 16,
  "repair receipts are capped at the most recent 16"
);
test.assert(
  capHarness.context.appendRepairReceipt(capRecord, {
    kind: "test",
    field: "field",
    previousValue: "value-19",
    action: "retained",
  }) === false,
  "an exact receipt duplicate is refused"
);

test.finish();
