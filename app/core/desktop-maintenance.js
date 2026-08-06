// Invisible background maintenance: "Rebuild Desktop" and "Project Disk First
// Aid" as internal hygiene instead of user tools. It runs on boot idle, on
// project mount/switch, and after backup imports. Repairs only derived state
// and clearly broken pointers (folder cycles, dangling relations, duplicate
// ids, orphaned export/trash records, stale indexes); user content is never
// touched, no UI is added, no status text is shown — the console is the only
// witness. Loaded on demand through ensureDesktopMaintenanceModule().

window.AISystem6DesktopMaintenanceLoaded = true;

let maintenanceTimer = null;
let maintenanceRunning = false;

function scheduleDesktopMaintenanceRun(reason = "event") {
  clearTimeout(maintenanceTimer);
  maintenanceTimer = setTimeout(() => {
    runDesktopMaintenance(reason);
  }, 400);
}

function repairRecordIds(collection, projectId, label) {
  const fixed = [];
  const seen = new Set();
  collection.forEach((item) => {
    if (item?.projectId !== projectId) return;
    const id = String(item.id || "");
    if (!id || seen.has(id)) {
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
      folder.parentId = null;
      fixed.push("folder:orphan-parent");
      return;
    }
    const seen = new Set();
    let cursor = parentFolder;
    while (cursor && !seen.has(cursor.id)) {
      if (cursor.id === folder.id) {
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
      if (file[field] && !fileIds.has(file[field])) {
        delete file[field];
        fixed.push(`file:${field}`);
      }
    });
    if (file.referenceId && !referenceIds.has(file.referenceId)) {
      delete file.referenceId;
      fixed.push("file:referenceId");
    }
  });
  scraps.forEach((scrap) => {
    if (scrap?.projectId !== projectId) return;
    ["sourceFileId", "sourceDocumentId"].forEach((field) => {
      if (scrap[field] && !fileIds.has(scrap[field])) {
        delete scrap[field];
        fixed.push(`scrap:${field}`);
      }
    });
    ["sourceReferenceId", "referenceId"].forEach((field) => {
      if (scrap[field] && !referenceIds.has(scrap[field])) {
        delete scrap[field];
        fixed.push(`scrap:${field}`);
      }
    });
  });
  projectCdItems.forEach((item) => {
    if (item?.projectId !== projectId) return;
    ["sourceDocumentId", "claimCheckId"].forEach((field) => {
      if (item[field] && !fileIds.has(item[field])) {
        delete item[field];
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
  for (let index = projectCdItems.length - 1; index >= 0; index -= 1) {
    if (!projectIds.has(projectCdItems[index]?.projectId)) {
      projectCdItems.splice(index, 1);
      fixed.push("projectCd:orphan");
    }
  }
  for (let index = trashItems.length - 1; index >= 0; index -= 1) {
    if (!projectIds.has(trashItems[index]?.projectId)) {
      trashItems.splice(index, 1);
      fixed.push("trash:orphan");
    }
  }
  return fixed;
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
});
