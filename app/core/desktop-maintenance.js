// Invisible background maintenance: "Rebuild Desktop" and "Project Disk First
// Aid" as internal hygiene instead of user tools. It runs on boot idle, on
// project mount/switch, and after backup imports. Document bodies and other
// user-authored content are never rewritten. Derived indexes can be rebuilt.
//
// Repairs follow a two-phase pipeline:
//   1. planDesktopMaintenance() detects issues without mutating anything and
//      returns a repair plan (dry run).
//   2. applyMaintenancePlan() executes the plan and records a bounded Repair
//      Record with a pre-repair snapshot id.
//
// Every relation field is typed (folderId -> folder, parentChatId -> file,
// referenceId -> reference, aliasTarget.kind -> its own kind). A duplicated
// record id never triggers a guess-based remap: the first legal record keeps
// the id, later duplicates are renumbered with a Repair Receipt, and relations
// that only know the old id keep pointing at the first record. Only a
// dangling relation (no object of the typed kind has that id) is repaired.
//
// Derived-index rebuilds are silent. Repairs that touch persistent project
// data persist the snapshot FIRST, then apply, then persist the desk state,
// then record the repair — a failure never leaves a modified project without
// a persisted recovery point.

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

// Typed relation schema: every relation field names the kind of record it may
// point at. A relation id is only ever compared against objects of its own
// kind — string equality across kinds is meaningless and is never remapped.
const relationTargetKinds = Object.freeze({
  folderId: "folder",
  parentId: "folder",
  parentChatId: "file",
  sourceChatId: "file",
  sourceFileId: "file",
  sourceDocumentId: "file",
  claimCheckId: "file",
  referenceId: "reference",
  sourceReferenceId: "reference",
});

// aliasTarget carries its own kind on the record ("file" | "scrap" |
// "reference"); the target kind is read from the record, never guessed.
const aliasTargetKinds = Object.freeze(["file", "scrap", "reference"]);

function aliasTargetKind(record) {
  const kind = String(record?.aliasTarget?.kind || "");
  return aliasTargetKinds.includes(kind) ? kind : "";
}

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

// Every typed relation field plus the aliasTarget envelope. Both directions
// are covered: the id's own record and any record whose field references it.
const relationFieldNames = Object.keys(relationTargetKinds);

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
  ["chatFiles", "scraps", "projectCdItems"].forEach((collectionName) => {
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
  const scrapIds = new Set(scraps.filter((scrap) => scrap.projectId === projectId).map((scrap) => scrap.id));
  const referenceIds = new Set(projectReferences.filter((ref) => ref.projectId === projectId).map((ref) => ref.id));
  const fileLinkFields = ["parentChatId", "sourceChatId", "sourceDocumentId"];
  const planDangling = (record, collection, field, targetKind, previousValue, reason) => {
    if (!previousValue) return;
    plan.push({
      kind: "dangling-link",
      collection,
      record,
      field,
      targetKind,
      previousValue: String(previousValue),
      nextValue: undefined,
      reason,
    });
  };
  chatFiles.forEach((file) => {
    if (file?.projectId !== projectId) return;
    fileLinkFields.forEach((field) => {
      if (file[field] && !fileIds.has(file[field])) {
        planDangling(file, "chatFiles", field, "file", file[field], "file points at a missing project file");
      }
    });
    if (file.referenceId && !referenceIds.has(file.referenceId)) {
      planDangling(file, "chatFiles", "referenceId", "reference", file.referenceId, "file points at a missing project reference");
    }
    const aliasKind = aliasTargetKind(file);
    const alias = file.aliasTarget;
    if (alias && typeof alias === "object" && aliasKind) {
      const targetIds = aliasKind === "scrap" ? scrapIds : aliasKind === "reference" ? referenceIds : fileIds;
      if (alias.id && !targetIds.has(alias.id)) {
        planDangling(file, "chatFiles", "aliasTarget.id", aliasKind, alias.id, `alias points at a missing ${aliasKind}`);
      }
    }
  });
  scraps.forEach((scrap) => {
    if (scrap?.projectId !== projectId) return;
    ["sourceFileId", "sourceDocumentId"].forEach((field) => {
      if (scrap[field] && !fileIds.has(scrap[field])) {
        planDangling(scrap, "scraps", field, "file", scrap[field], "scrap points at a missing project file");
      }
    });
    ["sourceReferenceId", "referenceId"].forEach((field) => {
      if (scrap[field] && !referenceIds.has(scrap[field])) {
        planDangling(scrap, "scraps", field, "reference", scrap[field], "scrap points at a missing project reference");
      }
    });
  });
  projectCdItems.forEach((item) => {
    if (item?.projectId !== projectId) return;
    ["sourceDocumentId", "claimCheckId"].forEach((field) => {
      if (item[field] && !fileIds.has(item[field])) {
        planDangling(item, "projectCdItems", field, "file", item[field], "Project CD item points at a missing project file");
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
    if (hasRetentionReceipt(item, String(item.projectId ?? ""))) return;
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
    if (hasRetentionReceipt(item, String(item.projectId ?? ""))) return;
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

// An orphan that already carries a retained receipt for this exact project id
// is a known, reported situation — re-planning it on every sweep would make
// maintenance non-idempotent and trigger a pointless save each boot.
function hasRetentionReceipt(record, projectIdValue) {
  return (record.repairReceipts || []).some((receipt) =>
    receipt
      && receipt.kind === "orphan-project"
      && receipt.field === "projectId"
      && String(receipt.previousValue) === String(projectIdValue)
      && receipt.action === "retained"
  );
}

/**
 * Dry run: detect every repair that would touch project data without mutating
 * anything. Returns { items, touchesProjectData, relationSchema }.
 *
 * A duplicated or missing record id only ever renumbers the affected record
 * (the first legal record keeps its id; later duplicates get a fresh id and a
 * Repair Receipt). Relations are never rewritten by string equality: a field
 * that still carries the old id resolves to the first record that kept it,
 * which is exactly the conservative meaning the user asked to preserve. The
 * typed relationSchema is returned so callers and future evidence-based
 * repairs can reason about what each field may point at.
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

  // Orphan retention is global (not project-scoped) and the planner runs per
  // project, so dedupe only those. Every other planned repair is per-record
  // and must survive intact — including two records that share one id.
  const merged = [];
  const orphanSeen = new Set();
  items.forEach((item) => {
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
    relationSchema: {
      ...relationTargetKinds,
      aliasTarget: "aliasTarget.kind",
    },
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
  const saved = await saveDeskState();
  if (!saved) return false;
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
      if (item.field === "aliasTarget.id") {
        record.aliasTarget = null;
      } else {
        delete record[item.field];
      }
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

    // Project data changes follow a strict durability order:
    //   plan -> snapshot -> PERSIST snapshot -> confirm -> apply -> persist
    //   desk state -> save Repair Record -> notify.
    // If the snapshot cannot be persisted, nothing is repaired. If the desk
    // state cannot be persisted, the in-memory apply is rolled back. A Repair
    // Record failure never undoes an already-saved project, but it leaves an
    // error notification.
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
    const snapshotSaved = await appendMaintenanceSnapshot(snapshot);
    if (!snapshotSaved) {
      pushSystemNotification?.(t("maintenance_snapshot_failed"), {
        windowName: "notificationCenter",
        state: "failed",
      });
      throw new Error("Desktop maintenance could not persist its pre-repair snapshot; no repairs were applied.");
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
      pushSystemNotification?.(t("maintenance_save_failed"), {
        windowName: "notificationCenter",
        state: "failed",
      });
      throw new Error("Desktop maintenance could not persist its repair; in-memory changes were rolled back.");
    }
    const record = buildRepairRecord(dataPlan, snapshot.id, applied);
    const recordSaved = await appendMaintenanceRepairRecord(record);
    if (!recordSaved) {
      // The project is already persisted correctly; only the audit record
      // failed. Leave an error notification instead of rolling back.
      renderDocuments?.();
      renderProjectDisks?.();
      renderScraps?.();
      renderTrash?.();
      renderProjectCd?.();
      pushSystemNotification?.(t("maintenance_record_failed"), {
        windowName: "notificationCenter",
        state: "failed",
      });
      console.warn(
        `[AI System 6] Desktop maintenance (${reason}): repairs persisted, but the Repair Record could not be saved.`
      );
      return;
    }
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

window.AISystem6DesktopMaintenance = Object.freeze({
  schedule: scheduleDesktopMaintenanceRun,
  runNow: runDesktopMaintenance,
  plan: planDesktopMaintenance,
  planDerived: planDerivedIndexRepairs,
  apply: applyMaintenancePlan,
  listRepairs: listMaintenanceRepairs,
  restoreSnapshot: restoreMaintenanceSnapshot,
});
