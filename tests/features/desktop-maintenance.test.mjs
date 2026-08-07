// Desktop maintenance: "Rebuild Desktop" and Project Disk First Aid as
// invisible background hygiene. It repairs derived indexes and clearly broken
// internal pointers on boot idle, project switches, and backup imports.
// Broken relations are quarantined into repairReceipts, and orphaned Project
// CD / Trash records are retained, never silently deleted. It must not add
// UI, show status text, or touch user-authored content.

import vm from "node:vm";
import { webcrypto } from "node:crypto";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("desktop-maintenance");
const manifest = read("scripts/runtime-manifest.mjs");
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
test.assertIncludes(maintenance, "function quarantineRelation", "dangling relation ids are quarantined, not silently dropped");
test.assertIncludes(maintenance, "maxRepairReceipts", "receipt lists are capped");
test.assertIncludes(maintenance, "previousValue", "receipts keep the previous value under a neutral field name");
test.assertIncludes(maintenance, '"quarantined"', "quarantined relations are marked");
test.assertIncludes(maintenance, '"moved-to-root"', "folder repairs are marked moved-to-root");
test.assertIncludes(maintenance, '"reassigned-id"', "id reassignments are marked");
test.assertIncludes(maintenance, '"retained"', "orphaned deliverables are marked retained");
test.assertIncludes(maintenance, '"orphan-project"', "orphaned records are categorized as orphan-project");
test.assertIncludes(maintenance, "function repairRecordIds", "duplicate or missing record ids are repaired");
test.assertIncludes(maintenance, "function planDesktopMaintenance", "a dry-run planner produces a repair plan without mutating");
test.assertIncludes(maintenance, "touchesProjectData", "the plan distinguishes project-data changes from derived rebuilds");
test.assertIncludes(maintenance, "function planDerivedIndexRepairs", "derived index repairs are planned separately");
test.assertIncludes(maintenance, "function applyMaintenancePlan", "the plan executor rewrites relations from the old-id map");
test.assertIncludes(maintenance, "aliasTarget", "alias targets participate in relation remapping");
test.assertIncludes(maintenance, "function maintenanceSnapshotForPlan", "project-data repairs snapshot the affected collections");
test.assertIncludes(maintenance, "maintenanceSnapshotKey", "snapshots persist in the keyval store");
test.assertIncludes(maintenance, "maintenanceRepairKey", "repair records persist in the keyval store");
test.assertIncludes(maintenance, "function buildRepairRecord", "each repair run builds a Repair Record");
test.assertIncludes(maintenance, "oldNewIds", "the Repair Record carries the old/new id map");
test.assertIncludes(maintenance, "removedDanglingRelations", "the Repair Record lists quarantined dangling relations");
test.assertIncludes(maintenance, "function restoreMaintenanceSnapshot", "a pre-repair snapshot can be restored");
test.assertIncludes(maintenance, "pushSystemNotification", "project-data repairs notify through the Notification Center");
test.assertIncludes(maintenance, "saveDeskState()", "the applied repair persists through one desk-state transaction");
test.assertIncludes(maintenance, "folder:cycle", "folder cycles are broken safely");
test.assertIncludes(maintenance, "folder:orphan-parent", "dangling folder parents are reparented to root");
test.assertIncludes(maintenance, "record:orphan-folder", "records with missing folders are returned to the root");
test.assertIncludes(maintenance, "function repairDanglingLinks", "dangling reference links are quarantined");
test.assertIncludes(maintenance, "projectCd:orphan", "orphaned Project CD items are reported");
test.assertIncludes(maintenance, "trash:orphan", "orphaned trash records are reported");
test.assertIncludes(maintenance, "rebuild-index", "stale or missing derived indexes are rebuilt internally");
test.assertIncludes(maintenance, "resync-index", "stale derived products are re-synchronized");
test.assertIncludes(maintenance, "renderDocuments?.()", "repairs refresh the Finder surfaces quietly");
test.assertIncludes(maintenance, "console.info", "the engine reports only to the console");
test.assertIncludes(
  maintenance,
  "user-authored content are never rewritten",
  "the module comment states exactly what is and is not touched"
);
test.assertNotIncludes(maintenance, "user content is never touched", "the old over-broad 'never touched' claim is gone");

test.assertNotIncludes(maintenance, "setStatus(", "maintenance never shows status text");
test.assertNotIncludes(maintenance, "data-i18n", "maintenance adds no UI labels");
test.assertNotIncludes(maintenance, "openWindow(", "maintenance opens no windows");
test.assertNotIncludes(menus, "desktop-maintenance", "no menu item exposes maintenance");
test.assertNotIncludes(actions, "desktop-maintenance", "no command handler exposes maintenance");
test.assertIncludes(translations, "maintenance_repaired", "the Notification Center message for a repair run");
test.assertIncludes(translations, "maintenance_restored", "the Notification Center message for a snapshot restore");
test.assertIncludes(translations, "view_repair_report", "the notification offers a repair report action");

test.assertIncludes(config, "function scheduleDesktopMaintenance", "one invisible scheduler loads the lazy engine");
test.assertIncludes(boot, 'scheduleDesktopMaintenance("boot")', "boot schedules a deferred sweep after the app is ready");
test.assertIncludes(desktopRuntime, 'scheduleDesktopMaintenance("project")', "project switches trigger a quiet sweep");
test.assertIncludes(exportImport, 'scheduleDesktopMaintenance("import")', "backup imports trigger a quiet sweep");
test.assertIncludes(queue, "derivedIndexSilent", "background rebuilds can suppress index notifications");
test.assertIncludes(queue, "options.silent", "the queue accepts silent rebuild requests");

// ---- Runtime behavior -----------------------------------------------------
// Runs the real maintenance engine in a vm with a broken live state and
// verifies what actually happens to the records: content survives, dangling
// ids move into receipts, cycles break, and orphans are retained.

const projectId = "project-1";
const file = {
  id: "file-1",
  projectId,
  name: "Draft",
  body: "Body text",
  sourceDocumentId: "file-gone",
  sourceChatId: "chat-gone",
};
const folderA = { id: "folder-a", projectId, name: "A", parentId: "folder-b" };
const folderB = { id: "folder-b", projectId, name: "B", parentId: "folder-a" };
const looseFile = { id: "file-2", projectId, name: "Loose", body: "x", folderId: "missing-folder" };
const orphanCd = { id: "cd-orphan", projectId: "ghost-project", title: "CD", body: "Deliverable" };
const orphanTrash = {
  id: "trash-orphan",
  projectId: "ghost-project",
  title: "Deleted",
  originalType: "file",
  originalData: {},
};

const context = vm.createContext({
  crypto: webcrypto,
  window: {},
  projects: [{ id: projectId, name: "P" }],
  chatFolders: [folderA, folderB],
  chatFiles: [file, looseFile],
  scraps: [],
  projectReferences: [],
  projectCdItems: [orphanCd],
  trashItems: [orphanTrash],
  saveDeskState: () => {},
  renderDocuments: () => {},
  renderProjectDisks: () => {},
  renderScraps: () => {},
  renderTrash: () => {},
  renderProjectCd: () => {},
});
vm.runInContext(maintenance, context);

context.repairLiveState();

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
test.assert(
  context.projectCdItems.length === 1 && context.projectCdItems[0] === orphanCd,
  "an orphaned Project CD record is retained, not deleted"
);
const cdReceipt = (orphanCd.repairReceipts || []).find((receipt) => receipt.kind === "orphan-project");
test.assert(
  cdReceipt?.previousValue === "ghost-project" && cdReceipt?.action === "retained",
  "the retained Project CD keeps an orphan-project receipt"
);
test.assert(
  context.trashItems.length === 1 && context.trashItems[0] === orphanTrash,
  "an orphaned Trash record is retained, not deleted"
);
const trashReceipt = (orphanTrash.repairReceipts || []).find((receipt) => receipt.kind === "orphan-project");
test.assert(
  trashReceipt?.previousValue === "ghost-project" && trashReceipt?.action === "retained",
  "the retained Trash record keeps an orphan-project receipt"
);

const receiptCounts = [file, folderA, looseFile, orphanCd, orphanTrash]
  .map((record) => (record.repairReceipts || []).length);
const secondRun = context.repairLiveState();
const secondRunCounts = [file, folderA, looseFile, orphanCd, orphanTrash]
  .map((record) => (record.repairReceipts || []).length);
test.assert(
  secondRunCounts.every((count, index) => count === receiptCounts[index]),
  "a second repair pass never duplicates receipts"
);
test.assert(
  secondRun.length === 0,
  "a second repair pass finds nothing new to report"
);

// ---- Dry-run planning and old-id remapping --------------------------------

const duplicateFileA = { id: "dup-file", projectId, name: "A", body: "a" };
const duplicateFileB = { id: "dup-file", projectId, name: "B", body: "b" };
const aliasToDuplicate = {
  id: "alias-1",
  projectId,
  type: "alias",
  name: "Alias",
  aliasTarget: { kind: "file", id: "dup-file" },
};
const childOfDuplicate = { id: "child-1", projectId, name: "Child", folderId: "dup-file" };
const planContext = vm.createContext({
  crypto: webcrypto,
  window: {},
  projects: [{ id: projectId, name: "P" }],
  chatFolders: [],
  chatFiles: [duplicateFileA, duplicateFileB, aliasToDuplicate, childOfDuplicate],
  scraps: [],
  projectReferences: [],
  projectCdItems: [],
  trashItems: [],
  saveDeskState: () => {},
});
vm.runInContext(maintenance, planContext);

const beforeIds = [duplicateFileA.id, duplicateFileB.id, aliasToDuplicate.aliasTarget.id, childOfDuplicate.folderId];
const dryRun = planContext.planDesktopMaintenance(projectId);
test.assert(
  beforeIds.every((id, index) => id === [duplicateFileA.id, duplicateFileB.id, aliasToDuplicate.aliasTarget.id, childOfDuplicate.folderId][index]),
  "the dry run never mutates records or relations"
);
test.assert(
  dryRun.touchesProjectData === true,
  "duplicate ids mark the plan as touching project data"
);
test.assert(
  dryRun.idMapping.size >= 1,
  "the plan builds an old-id -> new-id mapping"
);
test.assert(
  dryRun.items.some((item) => item.kind === "relation-remap" && item.field === "aliasTarget.id"),
  "the plan remaps alias targets that referenced a reassigned id"
);
test.assert(
  dryRun.items.some((item) => item.kind === "relation-remap" && item.field === "folderId"),
  "the plan remaps folderId references to the reassigned id"
);

planContext.applyMaintenancePlan(dryRun);
const newFileIds = new Set([duplicateFileA.id, duplicateFileB.id]);
test.assert(
  newFileIds.size === 2
    && [duplicateFileA.id, duplicateFileB.id].some((id) => id !== "dup-file" && /^[a-f0-9-]{36}$/i.test(id)),
  "apply reassigns the duplicated ids (first survivor keeps the id, later copies get fresh ids)"
);
test.assert(
  newFileIds.has(aliasToDuplicate.aliasTarget.id) && aliasToDuplicate.aliasTarget.id !== "dup-file",
  "the alias target follows the reassigned id"
);
test.assert(
  newFileIds.has(childOfDuplicate.folderId) && childOfDuplicate.folderId !== "dup-file",
  "the child folderId follows the reassigned id"
);

const capRecord = {};
for (let index = 0; index < 20; index += 1) {
  context.appendRepairReceipt(capRecord, {
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
  context.appendRepairReceipt(capRecord, {
    kind: "test",
    field: "field",
    previousValue: "value-19",
    action: "retained",
  }) === false,
  "an exact receipt duplicate is refused"
);

test.finish();
