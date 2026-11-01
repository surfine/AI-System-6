// Loaded only when a user asks to export or share a project backup.
window.AISystem6ProjectBackupExportData = (() => {
async function buildProjectDiskExport(project = getActiveProject()) {
  if (!project) return null;
  const projectId = project.id;
  if (typeof ensureProjectBackupAssembler === "function") await ensureProjectBackupAssembler();
  const result = await window.AISystem6ProjectBackupAssembler.assembleProjectBackup({
    projectId,
    source: {
      getProject: async () => projects.find((entry) => entry.id === projectId) || null,
      getFolders: async () => chatFolders.filter((folder) => folder.projectId === projectId),
      getFiles: async () => chatFiles.filter((file) => file.projectId === projectId),
      getScraps: async () => scraps.filter((scrap) => scrap.projectId === projectId),
      getTrash: async () => trashItems.filter((item) => item.projectId === projectId),
      getProjectCdItems: async () => projectCdItems.filter((item) => item.projectId === projectId),
      getReferences: async () => projectReferences.filter((reference) => reference.projectId === projectId),
      getDocumentRevisions: () => collectProjectDocumentRevisions(projectId),
      getDarkroomRecords: () => collectProjectDarkroomRecords(projectId),
      // An editor's staged working pictures (app/core/edit-assets.js) are not
      // part of the disk until the document they belong to is saved.
      getImageAttachments: async () => imageAttachments.filter((entry) => entry?.projectId === projectId && entry.status !== "staged"),
      getWorkingSession: () => readWorkingSessionForBackup(projectId),
    },
  });
  if (!result) return null;
  return result.ready ? result.bundle : null;
}

/**
 * Read every stored document revision of a project out of the keyval store.
 * Revisions are keyed "documentRevisions:<projectId>:<documentId>". Version
 * history is user data: a read failure must fail the whole export instead of
 * silently producing a "valid but incomplete" backup.
 */
async function collectProjectDocumentRevisions(projectId) {
  const revisions = [];
  let db;
  try {
    db = await openAppDb();
    const store = db.transaction(keyvalStoreName, "readonly").objectStore(keyvalStoreName);
    const keys = await idbRequest(store.getAllKeys());
    const prefix = `documentRevisions:${String(projectId || "")}:`;
    for (const key of keys) {
      if (typeof key !== "string" || !key.startsWith(prefix)) continue;
      const value = await idbRequest(store.get(key));
      if (Array.isArray(value)) revisions.push(...value);
    }
  } catch (error) {
    console.error("Could not read document revisions for the Project Hard Disk backup.", error);
    throw new ProjectBackupError(
      `Could not read document revisions for the Project Hard Disk backup: ${error?.message || error}`
    );
  } finally {
    db?.close();
  }
  return revisions;
}

/**
 * Read every darkroom record of a project out of the keyval store. Records are
 * keyed "darkroom:<projectId>:<documentId>", one per document, so the document
 * id is recovered from the key rather than trusted from inside the value.
 * The negative, the adjustment stack, the writer's locks and the version chain
 * are user work: a read failure fails the whole export, the same way version
 * history does, rather than producing a backup that looks complete.
 */
async function collectProjectDarkroomRecords(projectId) {
  const records = [];
  let db;
  try {
    db = await openAppDb();
    const store = db.transaction(keyvalStoreName, "readonly").objectStore(keyvalStoreName);
    const keys = await idbRequest(store.getAllKeys());
    const prefix = `darkroom:${String(projectId || "")}:`;
    for (const key of keys) {
      if (typeof key !== "string" || !key.startsWith(prefix)) continue;
      const documentId = key.slice(prefix.length);
      if (!documentId) continue;
      const value = await idbRequest(store.get(key));
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      records.push({ ...value, projectId: String(projectId || ""), documentId });
    }
  } catch (error) {
    console.error("Could not read darkroom records for the Project Hard Disk backup.", error);
    throw new ProjectBackupError(
      `Could not read darkroom records for the Project Hard Disk backup: ${error?.message || error}`
    );
  } finally {
    db?.close();
  }
  return records;
}

// Assemble the backup once, and report the real reason when it cannot be
// read. Returns null after it has already told the user what went wrong.
async function readyProjectDiskBackup() {
  const finishNativeActivity = typeof window !== "undefined" ? window.AISystem6TinyShell?.beginFileActivity() : null;
  try {

  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }
  let bundle;
  try {
    bundle = await buildProjectDiskExport(project);
  } catch (error) {
    if (error?.code === "BACKUP_READ_FAILED" || error instanceof ProjectBackupError) {
      setStatus(t("project_disk_backup_read_failed"));
    } else {
      console.error("Project Hard Disk export failed.", error);
      setStatus(t("project_disk_export_failed"));
    }
    return null;
  }
  if (!bundle) {
    setStatus(t("project_disk_export_failed"));
    return null;
  }
  return {
    project,
    text: JSON.stringify(bundle, null, 2),
    fileName: `${sanitizeFilename(`${project.name} Project Hard Disk Backup`)}.json`,
    mimeType: "application/json;charset=utf-8",
  };

  } finally { finishNativeActivity?.(); }
}

async function exportActiveProjectDisk() {
  const backup = await readyProjectDiskBackup();
  if (!backup) return;
  // saveArtifact's own return value is the only signal that the download was
  // actually dispatched - it can refuse (e.g. no File constructor) even
  // though the backup itself built fine.
  const dispatched = window.AISystem6WebPlatform.saveArtifact(backup);
  setStatus(dispatched ? t("project_disk_exported", backup.project.name) : t("project_disk_export_dispatch_failed"));
}

// The same backup, handed to the system share sheet instead of the disk —
// AirDrop to another Mac, a message to yourself, a cloud drive. When the
// platform cannot share files it is saved instead, and the status says which
// of the two actually happened.
async function shareActiveProjectDisk() {
  const finishNativeActivity = typeof window !== "undefined" ? window.AISystem6TinyShell?.beginFileActivity() : null;
  try {

  const backup = await readyProjectDiskBackup();
  if (!backup) return false;
  try {
    const result = await window.AISystem6WebPlatform.shareArtifact({
      title: `${backup.project.name} — ${t("project_backup")}`,
      text: backup.text,
      fileName: backup.fileName,
      mimeType: backup.mimeType,
    });
    if (result.method === "share") setStatus(t("project_disk_shared", backup.project.name), { notify: false });
    else if (result.method === "download") setStatus(t("project_disk_exported", backup.project.name));
    else if (result.method === "cancel") setStatus(t("project_disk_share_canceled"), { notify: false });
    return result.shared;
  } catch (error) {
    console.warn("Project Hard Disk share failed.", error);
    setStatus(t("project_disk_share_failed"));
    return false;
  }

  } finally { finishNativeActivity?.(); }
}


  return { buildProjectDiskExport, collectProjectDocumentRevisions, collectProjectDarkroomRecords, readyProjectDiskBackup, exportActiveProjectDisk, shareActiveProjectDisk };
})();
