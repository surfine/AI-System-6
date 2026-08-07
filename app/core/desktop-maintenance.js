// Invisible background maintenance: "Rebuild Desktop" and "Project Disk First
// Aid" as internal hygiene instead of user tools. It runs on boot idle, on
// project mount/switch, and after backup imports. Document bodies and other
// user-authored content are never rewritten. Derived indexes can be rebuilt.
//
// Repairs follow a two-phase pipeline:
//   1. planDesktopMaintenance() detects issues without mutating anything and
//      returns a repair plan (dry run).
//   2. applyMaintenancePlan() executes the plan, keeps an old-id -> new-id
//      mapping and rewrites every relation that referenced the old ids, and
//      records a bounded Repair Record with a pre-repair snapshot id.
//
// Derived-index rebuilds are silent. Repairs that touch persistent project
// data take a snapshot first, apply inside one storage transaction, and leave
// a Notification Center message so the user can review the report or restore
// the snapshot. A failure never leaves a partial write: the in-memory apply
// is rolled back before anything is saved.

window.AISystem6DesktopMaintenanceLoaded = true;

let maintenanceTimer = null;
let maintenanceRunning = false;

function scheduleDesktopMaintenanceRun(reason = "event") {
  clearTimeout(maintenanceTimer);
  maintenanceTimer = setTimeout(() => {
    runDesktopMaintenance(reason);
  }, 400);
}

const maxRepairReceipts = 16;
const maxRepairRecords = 24;
const maxMaintenanceSnapshots = 8;
const maintenanceSnapshotKey = "desktopMaintenanceSnapshots:v1";
const maintenanceRepairKey = "desktopMaintenanceRepairs:v1";

const relationFieldsByKind = {
  aliasTarget: "aliasTarget",
  folderId: "folderId",
  parentId: "parentId",
  sourceDocumentId: "sourceDocumentId",
  sourceFileId: "sourceFileId",
  sourceReferenceId: "sourceReferenceId",
  referenceId: "referenceId",
  sourceChatId: "sourceChatId",
  parentChatId: "parentChatId",
  claimCheckId: "claimCheckId",
  sourceId: "sourceId",
};

function maintenanceCollectionEntries() {
  return [
    { name: "projects", records: projects },
    { name: "chatFiles", records: chatFiles },
    { name: "chatFolders", records: chatFolders },
    { name: "scraps", records: scraps },
    { name: "projectReferences", records: projectReferences },
    { name: "projectCdItems", records: projectCdItems },
    { name: "trashItems", records: trashItems },
  ];
}

function collectionForName(name) {
  return maintenanceCollectionEntries().find((entry) => entry.name === name)?.records || null;
}

// Every relation field that can point at a record id. Both directions are
// covered: the id's own record and any record whose field references it.
const relationFieldNames = [
  "folderId",
  "parentId",
  "sourceDocumentId",
  "sourceFileId",
  "sourceReferenceId",
  "referenceId",
  "sourceChatId",
  "parentChatId",
  "claimCheckId",
  "sourceId",
];

// A repair receipt records one bounded repair on the record it happened to.
// previousValue uses a deliberately neutral field name: backup remapping
// (project-disk-backup.js remapRelations) maps known relation fields by name,
// so storing a stale id under "previousValue" keeps it out of the remap path
// and preserves the historical value verbatim. Receipts are deduplicated on
// kind + field + previousValue + action and capped at the most recent 16.
function appendRepairReceipt(record, receipt) {
  if (!record || typeof record !== "object" || !receipt || typeof receipt !== "object") return false;
  const normalized = {
    kind: String(receipt.kind || ""),
    field: String(receipt.field || ""),
    previousValue: String(receipt.previousValue ?? ""),
    action: String(receipt.action || ""),
    detectedAt: String(receipt.detectedAt || new Date().toISOString()),
  };
  if (!normalized.kind || !normalized.field || !normalized.action) return false;
  const existing = Array.isArray(record.repairReceipts) ? record.repairReceipts : [];
  const duplicate = existing.some((entry) =>
    entry
      && entry.kind === normalized.kind
      && entry.field === normalized.field
      && entry.previousValue === normalized.previousValue
      && entry.action === normalized.action
  );
  if (duplicate) return false;
  record.repairReceipts = existing.concat(normalized).slice(-maxRepairReceipts);
  return true;
}

// Remove a dangling relation id from the active field and keep the old value
// in a receipt. Bodies, titles, and user notes are never touched.
function quarantineRelation(record, field, kind) {
  if (!record || typeof record !== "object") return false;
  const previousValue = record[field];
  if (previousValue === undefined || previousValue === null || previousValue === "") return false;
  appendRepairReceipt(record, {
    kind,
    field,
    previousValue: String(previousValue),
    action: "quarantined",
  });
  delete record[field];
  return true;
}

function repairRecordIds(collection, projectId, label) {
  const fixed = [];
  const seen = new Set();
  collection.forEach((item) => {
    if (item?.projectId !== projectId) return;
    const id = String(item.id || "");
    if (!id || seen.has(id)) {
      appendRepairReceipt(item, {
        kind: id ? "duplicate-id" : "missing-id",
        field: "id",
        previousValue: id,
        action: "reassigned-id",
      });
      item.id = crypto.randomUUID();
      fixed.push(`${label}:re-id`);
    } else {
      seen.add(id);
    }
  });
  return fixed;
}

function repairFolderParents(projectId) {
  const fixed = [];
  const folders = chatFolders.filter((folder) => folder.projectId === projectId);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  folders.forEach((folder) => {
    const parent = folder.parentId;
    if (!parent) return;
    const parentFolder = byId.get(parent);
    if (!parentFolder || parentFolder.projectId !== projectId) {
      appendRepairReceipt(folder, {
        kind: "orphan-parent",
        field: "parentId",
        previousValue: String(parent),
        action: "moved-to-root",
      });
      folder.parentId = null;
      fixed.push("folder:orphan-parent");
      return;
    }
    const seen = new Set();
    let cursor = parentFolder;
    while (cursor && !seen.has(cursor.id)) {
      if (cursor.id === folder.id) {
        appendRepairReceipt(folder, {
          kind: "folder-cycle",
          field: "parentId",
          previousValue: String(parent),
          action: "moved-to-root",
        });
        folder.parentId = null;
        fixed.push("folder:cycle");
        return;
      }
      seen.add(cursor.id);
      cursor = byId.get(cursor.parentId) || null;
    }
  });
  return fixed;
}

function repairFolderReferences(projectId) {
  const fixed = [];
  const folderIds = new Set(chatFolders.filter((folder) => folder.projectId === projectId).map((folder) => folder.id));
  [chatFiles, scraps, projectCdItems].forEach((collection) => {
    collection.forEach((item) => {
      if (item?.projectId !== projectId || !item.folderId) return;
      if (!folderIds.has(item.folderId)) {
        appendRepairReceipt(item, {
          kind: "orphan-folder",
          field: "folderId",
          previousValue: String(item.folderId),
          action: "moved-to-root",
        });
        item.folderId = null;
        fixed.push("record:orphan-folder");
      }
    });
  });
  return fixed;
}

function repairDanglingLinks(projectId) {
  const fixed = [];
  const fileIds = new Set(chatFiles.filter((file) => file.projectId === projectId).map((file) => file.id));
  const referenceIds = new Set(projectReferences.filter((ref) => ref.projectId === projectId).map((ref) => ref.id));
  chatFiles.forEach((file) => {
    if (file?.projectId !== projectId) return;
    ["parentChatId", "sourceChatId", "sourceDocumentId"].forEach((field) => {
      if (file[field] && !fileIds.has(file[field]) && quarantineRelation(file, field, "dangling-link")) {
        fixed.push(`file:${field}`);
      }
    });
    if (file.referenceId && !referenceIds.has(file.referenceId) && quarantineRelation(file, "referenceId", "dangling-link")) {
      fixed.push("file:referenceId");
    }
  });
  scraps.forEach((scrap) => {
    if (scrap?.projectId !== projectId) return;
    ["sourceFileId", "sourceDocumentId"].forEach((field) => {
      if (scrap[field] && !fileIds.has(scrap[field]) && quarantineRelation(scrap, field, "dangling-link")) {
        fixed.push(`scrap:${field}`);
      }
    });
    ["sourceReferenceId", "referenceId"].forEach((field) => {
      if (scrap[field] && !referenceIds.has(scrap[field]) && quarantineRelation(scrap, field, "dangling-link")) {
        fixed.push(`scrap:${field}`);
      }
    });
  });
  projectCdItems.forEach((item) => {
    if (item?.projectId !== projectId) return;
    ["sourceDocumentId", "claimCheckId"].forEach((field) => {
      if (item[field] && !fileIds.has(item[field]) && quarantineRelation(item, field, "dangling-link")) {
        fixed.push(`projectCd:${field}`);
      }
    });
  });
  return fixed;
}

function repairLiveState() {
  const fixed = [];
  const projectIds = new Set(projects.map((project) => project.id));
  projectIds.forEach((projectId) => {
    fixed.push(
      ...repairRecordIds(chatFolders, projectId, "folder"),
      ...repairRecordIds(chatFiles, projectId, "file"),
      ...repairRecordIds(scraps, projectId, "scrap"),
      ...repairRecordIds(projectReferences, projectId, "reference"),
      ...repairRecordIds(projectCdItems, projectId, "projectCd"),
      ...repairFolderParents(projectId),
      ...repairFolderReferences(projectId),
      ...repairDanglingLinks(projectId)
    );
  });
  // Project CD records are user deliverables and Trash records are recoverable
  // data. Orphans (records whose project no longer exists) are never deleted:
  // they are retained with a receipt so the missing ownership stays visible
  // without guessing which project they belonged to.
  projectCdItems.forEach((item) => {
    if (!item || projectIds.has(item.projectId)) return;
    if (appendRepairReceipt(item, {
      kind: "orphan-project",
      field: "projectId",
      previousValue: String(item.projectId ?? ""),
      action: "retained",
    })) {
      fixed.push("projectCd:orphan");
    }
  });
  trashItems.forEach((item) => {
    if (!item || projectIds.has(item.projectId)) return;
    if (appendRepairReceipt(item, {
      kind: "orphan-project",
      field: "projectId",
      previousValue: String(item.projectId ?? ""),
      action: "retained",
    })) {
      fixed.push("trash:orphan");
    }
  });
  return fixed;
}

// ---- Dry-run planning ------------------------------------------------------

function planRecordIdRepairs(collectionName, records, projectId) {
  const plan = [];
  const seen = new Set();
  records.forEach((item) => {
    if (item?.projectId !== projectId) return;
    const id = String(item.id || "");
    if (!id || seen.has(id)) {
      plan.push({
        kind: id ? "duplicate-id" : "missing-id",
        collection: collectionName,
        record: item,
        field: "id",
        previousValue: id,
        nextValue: crypto.randomUUID(),
        reason: id ? "duplicate record id" : "record without id",
      });
    } else {
      seen.add(id);
    }
  });
  return plan;
}

function planFolderParentRepairs(projectId) {
  const plan = [];
  const folders = chatFolders.filter((folder) => folder.projectId === projectId);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  folders.forEach((folder) => {
    const parent = folder.parentId;
    if (!parent) return;
    const parentFolder = byId.get(parent);
    if (!parentFolder || parentFolder.projectId !== projectId) {
      plan.push({
        kind: "orphan-parent",
        collection: "chatFolders",
        record: folder,
        field: "parentId",
        previousValue: String(parent),
        nextValue: null,
        reason: "folder parent is missing or belongs to another project",
      });
      return;
    }
    const seen = new Set();
    let cursor = parentFolder;
    while (cursor && !seen.has(cursor.id)) {
      if (cursor.id === folder.id) {
        plan.push({
          kind: "folder-cycle",
          collection: "chatFolders",
          record: folder,
          field: "parentId",
          previousValue: String(parent),
          nextValue: null,
          reason: "folder parent cycle",
        });
        return;
      }
      seen.add(cursor.id);
      cursor = byId.get(cursor.parentId) || null;
    }
  });
  return plan;
}

function planFolderReferenceRepairs(projectId) {
  const plan = [];
  const folderIds = new Set(chatFolders.filter((folder) => folder.projectId === projectId).map((folder) => folder.id));
  [chatFiles, scraps, projectCdItems].forEach((collectionName) => {
    const records = collectionForName(collectionName);
    (records || []).forEach((item) => {
      if (item?.projectId !== projectId || !item.folderId) return;
      if (!folderIds.has(item.folderId)) {
        plan.push({
          kind: "orphan-folder",
          collection: collectionName,
          record: item,
          field: "folderId",
          previousValue: String(item.folderId),
          nextValue: null,
          reason: "record points at a missing folder",
        });
      }
    });
  });
  return plan;
}

function planDanglingLinkRepairs(projectId) {
  const plan = [];
  const fileIds = new Set(chatFiles.filter((file) => file.projectId === projectId).map((file) => file.id));
  const referenceIds = new Set(projectReferences.filter((ref) => ref.projectId === projectId).map((ref) => ref.id));
  const fileLinkFields = ["parentChatId", "sourceChatId", "sourceDocumentId"];
  chatFiles.forEach((file) => {
    if (file?.projectId !== projectId) return;
    fileLinkFields.forEach((field) => {
      if (file[field] && !fileIds.has(file[field])) {
        plan.push({
          kind: "dangling-link",
          collection: "chatFiles",
          record: file,
          field,
          previousValue: String(file[field]),
          nextValue: undefined,
          reason: "file points at a missing project file",
        });
      }
    });
    if (file.referenceId && !referenceIds.has(file.referenceId)) {
      plan.push({
        kind: "dangling-link",
        collection: "chatFiles",
        record: file,
        field: "referenceId",
        previousValue: String(file.referenceId),
        nextValue: undefined,
        reason: "file points at a missing project reference",
      });
    }
  });
  scraps.forEach((scrap) => {
    if (scrap?.projectId !== projectId) return;
    ["sourceFileId", "sourceDocumentId"].forEach((field) => {
      if (scrap[field] && !fileIds.has(scrap[field])) {
        plan.push({
          kind: "dangling-link",
          collection: "scraps",
          record: scrap,
          field,
          previousValue: String(scrap[field]),
          nextValue: undefined,
          reason: "scrap points at a missing project file",
        });
      }
    });
    ["sourceReferenceId", "referenceId"].forEach((field) => {
      if (scrap[field] && !referenceIds.has(scrap[field])) {
        plan.push({
          kind: "dangling-link",
          collection: "scraps",
          record: scrap,
          field,
          previousValue: String(scrap[field]),
          nextValue: undefined,
          reason: "scrap points at a missing project reference",
        });
      }
    });
  });
  projectCdItems.forEach((item) => {
    if (item?.projectId !== projectId) return;
    ["sourceDocumentId", "claimCheckId"].forEach((field) => {
      if (item[field] && !fileIds.has(item[field])) {
        plan.push({
          kind: "dangling-link",
          collection: "projectCdItems",
          record: item,
          field,
          previousValue: String(item[field]),
          nextValue: undefined,
          reason: "Project CD item points at a missing project file",
        });
      }
    });
  });
  return plan;
}

function planOrphanRetention() {
  const plan = [];
  const projectIds = new Set(projects.map((project) => project.id));
  projectCdItems.forEach((item) => {
    if (!item || projectIds.has(item.projectId)) return;
    plan.push({
      kind: "orphan-project",
      collection: "projectCdItems",
      record: item,
      field: "projectId",
      previousValue: String(item.projectId ?? ""),
      nextValue: String(item.projectId ?? ""),
      reason: "Project CD item belongs to a missing project; retained",
    });
  });
  trashItems.forEach((item) => {
    if (!item || projectIds.has(item.projectId)) return;
    plan.push({
      kind: "orphan-project",
      collection: "trashItems",
      record: item,
      field: "projectId",
      previousValue: String(item.projectId ?? ""),
      nextValue: String(item.projectId ?? ""),
      reason: "trash item belongs to a missing project; retained",
    });
  });
  return plan;
}

/**
 * Dry run: detect every repair that would touch project data without mutating
 * anything. Returns { items, touchesProjectData, idMapping } where idMapping
 * maps old record ids to the ids that would replace them.
 */
function planDesktopMaintenance(projectId) {
  const items = [
    ...planRecordIdRepairs("chatFolders", chatFolders, projectId),
    ...planRecordIdRepairs("chatFiles", chatFiles, projectId),
    ...planRecordIdRepairs("scraps", scraps, projectId),
    ...planRecordIdRepairs("projectReferences", projectReferences, projectId),
    ...planRecordIdRepairs("projectCdItems", projectCdItems, projectId),
    ...planFolderParentRepairs(projectId),
    ...planFolderReferenceRepairs(projectId),
    ...planDanglingLinkRepairs(projectId),
    ...planOrphanRetention(),
  ];

  // Relation rewrites follow from reassigned ids: every record anywhere that
  // references an old id must be re-pointed to the new id.
  const idMapping = new Map();
  items
    .filter((item) => item.kind === "duplicate-id" || item.kind === "missing-id")
    .forEach((item) => {
      idMapping.set(String(item.previousValue || ""), item.nextValue);
    });

  const relationPlan = [];
  if (idMapping.size) {
    maintenanceCollectionEntries().forEach(({ name, records }) => {
      records.forEach((record) => {
        if (!record || typeof record !== "object") return;
        if (record.aliasTarget && typeof record.aliasTarget === "object" && record.aliasTarget.id && idMapping.has(String(record.aliasTarget.id))) {
          relationPlan.push({
            kind: "relation-remap",
            collection: name,
            record,
            field: "aliasTarget.id",
            previousValue: String(record.aliasTarget.id),
            nextValue: idMapping.get(String(record.aliasTarget.id)),
            reason: "alias target id reassigned",
          });
        }
        relationFieldNames.forEach((field) => {
          const value = record[field];
          if (value === undefined || value === null || value === "") return;
          if (idMapping.has(String(value))) {
            relationPlan.push({
              kind: "relation-remap",
              collection: name,
              record,
              field,
              previousValue: String(value),
              nextValue: idMapping.get(String(value)),
              reason: "relation referenced a reassigned id",
            });
          }
        });
      });
    });
  }

  // Orphan retention is global (not project-scoped) and the planner runs per
  // project, so dedupe only those. Every other planned repair is per-record
  // and must survive intact — including two records that share one id.
  const merged = [];
  const orphanSeen = new Set();
  [...items, ...relationPlan].forEach((item) => {
    if (item.kind === "orphan-project") {
      const orphanKey = `${item.collection}:${item.previousValue}`;
      if (orphanSeen.has(orphanKey)) return;
      orphanSeen.add(orphanKey);
    }
    merged.push(item);
  });
  return {
    items: merged,
    touchesProjectData: merged.length > 0,
    idMapping,
  };
}

function planDerivedIndexRepairs() {
  const queue = window.AISystem6DerivedIndexQueue;
  if (!queue || typeof queue.getState !== "function") return { items: [], reason: "" };
  const state = queue.getState();
  const schemaOk = state.schemaVersion === 1;
  const indexedProjects = new Set(Object.values(state.sources || {}).map((source) => source.projectId));
  const projectsNeedingBuild = projects
    .map((project) => project.id)
    .filter((projectId) => projectHasIndexableContent(projectId) && !indexedProjects.has(projectId));
  const staleSources = Object.values(state.sources || {})
    .filter((source) => Object.values(source.products || {}).some((product) => product.stale));
  if (!schemaOk || projectsNeedingBuild.length) {
    const rebuildIds = !schemaOk ? projects.map((project) => project.id) : projectsNeedingBuild;
    return {
      items: rebuildIds.map((projectId) => ({ kind: "rebuild-index", projectId })),
      reason: !schemaOk ? "derived index schema mismatch" : "projects missing derived indexes",
    };
  }
  if (staleSources.length) {
    return { items: [{ kind: "resync-index" }], reason: "stale derived products" };
  }
  return { items: [], reason: "" };
}

// ---- Snapshot + repair records --------------------------------------------

function maintenanceSnapshotForPlan(plan, reason) {
  const touchedCollections = new Set(plan.items.map((item) => item.collection));
  const collections = {};
  maintenanceCollectionEntries().forEach(({ name, records }) => {
    if (!touchedCollections.has(name)) return;
    collections[name] = records.map((record) => structuredClone(record));
  });
  return {
    id: crypto.randomUUID(),
    takenAt: new Date().toISOString(),
    reason,
    collections,
  };
}

function buildRepairRecord(plan, snapshotId, applied) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reason: plan.reason || "maintenance",
    snapshotId,
    touchesProjectData: true,
    changedRecords: applied.changedRecords,
    oldNewIds: applied.oldNewIds,
    removedDanglingRelations: applied.removedDanglingRelations,
    repairCount: plan.items.length,
  };
}

async function readKeyvalEntry(key, fallback) {
  let db;
  try {
    db = await openAppDb();
    const value = await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      "readonly",
      (tx) => idbRequest(tx.objectStore(keyvalStoreName).get(key))
    );
    return value === undefined ? fallback : value;
  } catch (error) {
    console.warn("Desktop maintenance could not read its records.", error);
    return fallback;
  } finally {
    db?.close();
  }
}

async function writeKeyvalEntry(key, value) {
  let db;
  try {
    db = await openAppDb();
    await window.AISystem6StorageTransactions.runTransaction(
      db,
      keyvalStoreName,
      "readwrite",
      (tx) => idbRequest(tx.objectStore(keyvalStoreName).put(value, key))
    );
    return true;
  } catch (error) {
    console.warn("Desktop maintenance could not save its records.", error);
    return false;
  } finally {
    db?.close();
  }
}

async function appendMaintenanceRepairRecord(record) {
  const existing = await readKeyvalEntry(maintenanceRepairKey, []);
  const next = [record, ...(Array.isArray(existing) ? existing : [])].slice(0, maxRepairRecords);
  return writeKeyvalEntry(maintenanceRepairKey, next);
}

async function appendMaintenanceSnapshot(snapshot) {
  const existing = await readKeyvalEntry(maintenanceSnapshotKey, []);
  const next = [snapshot, ...(Array.isArray(existing) ? existing : [])].slice(0, maxMaintenanceSnapshots);
  return writeKeyvalEntry(maintenanceSnapshotKey, next);
}

async function restoreMaintenanceSnapshot(snapshotId) {
  const snapshots = await readKeyvalEntry(maintenanceSnapshotKey, []);
  const snapshot = (Array.isArray(snapshots) ? snapshots : []).find((entry) => entry?.id === snapshotId);
  if (!snapshot?.collections) return false;
  Object.entries(snapshot.collections).forEach(([collectionName, records]) => {
    const target = collectionForName(collectionName);
    if (!target) return;
    target.splice(0, target.length, ...records.map((record) => structuredClone(record)));
  });
  saveDeskState();
  renderDocuments?.();
  renderProjectDisks?.();
  renderScraps?.();
  renderTrash?.();
  renderProjectCd?.();
  pushSystemNotification?.(t("maintenance_restored", snapshot.reason || "maintenance"), {
    windowName: "notificationCenter",
  });
  return true;
}

async function listMaintenanceRepairs() {
  return readKeyvalEntry(maintenanceRepairKey, []);
}

// ---- Apply ----------------------------------------------------------------

function applyMaintenancePlan(plan) {
  const changedRecords = [];
  const oldNewIds = [];
  const removedDanglingRelations = [];
  const changedByCollection = new Map();

  plan.items.forEach((item) => {
    const record = item.record;
    if (!record) return;
    if (item.kind === "duplicate-id" || item.kind === "missing-id") {
      appendRepairReceipt(record, {
        kind: item.kind,
        field: "id",
        previousValue: item.previousValue,
        action: "reassigned-id",
      });
      record.id = item.nextValue;
      oldNewIds.push({ old: String(item.previousValue || ""), new: item.nextValue });
    } else if (item.kind === "relation-remap") {
      if (item.field === "aliasTarget.id") {
        record.aliasTarget.id = item.nextValue;
      } else {
        record[item.field] = item.nextValue;
      }
      appendRepairReceipt(record, {
        kind: "relation-remap",
        field: item.field,
        previousValue: item.previousValue,
        action: "remapped",
      });
    } else if (item.nextValue === undefined) {
      appendRepairReceipt(record, {
        kind: item.kind,
        field: item.field,
        previousValue: item.previousValue,
        action: item.kind === "dangling-link" ? "quarantined" : "moved-to-root",
      });
      if (item.kind === "dangling-link") {
        removedDanglingRelations.push({
          collection: item.collection,
          recordId: record.id,
          field: item.field,
          previousValue: item.previousValue,
        });
      }
      delete record[item.field];
    } else {
      record[item.field] = item.nextValue;
      appendRepairReceipt(record, {
        kind: item.kind,
        field: item.field,
        previousValue: item.previousValue,
        action: item.kind === "orphan-project" ? "retained" : "moved-to-root",
      });
    }

    const entry = changedByCollection.get(item.collection) || new Map();
    const fields = entry.get(record.id) || [];
    fields.push({ field: item.field, previousValue: item.previousValue, nextValue: item.nextValue });
    entry.set(record.id, fields);
    changedByCollection.set(item.collection, entry);
  });

  changedByCollection.forEach((fieldsByRecord, collection) => {
    fieldsByRecord.forEach((fields, recordId) => {
      changedRecords.push({ collection, recordId, fields });
    });
  });
  return { changedRecords, oldNewIds, removedDanglingRelations };
}

async function runDesktopMaintenance(reason = "event") {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try {
    const indexPlan = planDerivedIndexRepairs();
    const dataPlan = {
      items: [],
      reason,
      touchesProjectData: false,
    };
    const projectIds = new Set(projects.map((project) => project.id));
    projectIds.forEach((projectId) => {
      const plan = planDesktopMaintenance(projectId);
      dataPlan.items.push(...plan.items);
      dataPlan.reason = dataPlan.reason || plan.reason;
    });
    dataPlan.touchesProjectData = dataPlan.items.length > 0;

    if (!dataPlan.touchesProjectData) {
      if (indexPlan.items.length) {
        const queue = window.AISystem6DerivedIndexQueue;
        indexPlan.items.forEach((item) => {
          if (item.kind === "rebuild-index") queue?.rebuildProject(item.projectId, { silent: true });
          else if (item.kind === "resync-index") queue?.afterProjectCommit({ silent: true });
        });
        console.info(`[AI System 6] Desktop maintenance (${reason}): ${indexPlan.items.map((item) => item.kind).join(", ")}`);
      } else {
        console.info(`[AI System 6] Desktop maintenance (${reason}): nothing needed`);
      }
      return;
    }

    // Project data changes: snapshot, apply, persist one transaction, notify.
    const snapshot = maintenanceSnapshotForPlan(dataPlan, reason);
    if (typeof createDocumentRevision === "function") {
      dataPlan.items
        .filter((item) => item.collection === "chatFiles" && item.record?.id && item.record?.body !== undefined)
        .forEach((item) => {
          createDocumentRevision({
            projectId: item.record.projectId || activeProjectId,
            documentId: item.record.id,
            body: item.record.body,
            origin: "system",
            operation: "maintenance-before",
          });
        });
    }
    const applied = applyMaintenancePlan(dataPlan);
    const saved = await saveDeskState();
    if (!saved) {
      // Roll back the in-memory apply so a failed save never leaves a
      // half-repaired desk in front of the user.
      Object.entries(snapshot.collections).forEach(([collectionName, records]) => {
        const target = collectionForName(collectionName);
        if (!target) return;
        target.splice(0, target.length, ...records.map((record) => structuredClone(record)));
      });
      throw new Error("Desktop maintenance could not persist its repair; in-memory changes were rolled back.");
    }
    await appendMaintenanceSnapshot(snapshot);
    const record = buildRepairRecord(dataPlan, snapshot.id, applied);
    await appendMaintenanceRepairRecord(record);
    renderDocuments?.();
    renderProjectDisks?.();
    renderScraps?.();
    renderTrash?.();
    renderProjectCd?.();
    pushSystemNotification?.(t("maintenance_repaired", dataPlan.items.length, reason), {
      windowName: "notificationCenter",
      actionLabel: t("view_repair_report"),
    });
    console.info(
      `[AI System 6] Desktop maintenance (${reason}): ${dataPlan.items.length} repair(s), snapshot ${snapshot.id.slice(0, 8)}, record ${record.id.slice(0, 8)}`
    );
  } catch (error) {
    console.warn("Desktop maintenance failed; user data untouched.", error);
  } finally {
    maintenanceRunning = false;
  }
}

function projectHasIndexableContent(projectId) {
  return chatFiles.some((file) => file.projectId === projectId)
    || scraps.some((scrap) => scrap.projectId === projectId)
    || projectReferences.some((reference) => reference.projectId === projectId);
}

async function repairDerivedIndexes() {
  const fixed = [];
  const queue = window.AISystem6DerivedIndexQueue;
  if (!queue || typeof queue.getState !== "function") return fixed;
  const state = queue.getState();
  const schemaOk = state.schemaVersion === 1;
  const indexedProjects = new Set(Object.values(state.sources || {}).map((source) => source.projectId));
  const projectsNeedingBuild = projects
    .map((project) => project.id)
    .filter((projectId) => projectHasIndexableContent(projectId) && !indexedProjects.has(projectId));
  const staleSources = Object.values(state.sources || {})
    .filter((source) => Object.values(source.products || {}).some((product) => product.stale));
  if (!schemaOk || projectsNeedingBuild.length) {
    const rebuildIds = !schemaOk ? projects.map((project) => project.id) : projectsNeedingBuild;
    rebuildIds.forEach((projectId) => {
      queue.rebuildProject(projectId, { silent: true });
      fixed.push("rebuild-index");
    });
  } else if (staleSources.length) {
    queue.afterProjectCommit({ silent: true });
    fixed.push("resync-index");
  }
  return fixed;
}

async function runDesktopMaintenance(reason = "event") {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try {
    const fixed = [
      ...repairLiveState(),
      ...(await repairDerivedIndexes()),
    ];
    if (fixed.length) {
      saveDeskState();
      renderDocuments?.();
      renderProjectDisks?.();
      renderScraps?.();
      renderTrash?.();
      renderProjectCd?.();
    }
    console.info(
      `[AI System 6] Desktop maintenance (${reason}): ${fixed.length ? fixed.join(", ") : "nothing needed"}`
    );
  } catch (error) {
    console.warn("Desktop maintenance failed quietly; user data untouched.", error);
  } finally {
    maintenanceRunning = false;
  }
}

window.AISystem6DesktopMaintenance = Object.freeze({
  schedule: scheduleDesktopMaintenanceRun,
  runNow: runDesktopMaintenance,
  plan: planDesktopMaintenance,
  planDerived: planDerivedIndexRepairs,
  apply: applyMaintenancePlan,
  listRepairs: listMaintenanceRepairs,
  restoreSnapshot: restoreMaintenanceSnapshot,
});
