// Startup-recovery storage access. This module reads project data straight
// from IndexedDB so the Recovery panel keeps working even when the normal
// desktop runtime never finished loading. It intentionally depends only on:
//   - IndexedDB config + openAppDb + the shared transaction helper
//   - the project backup schema (AISystem6ProjectDiskBackup)
// It never touches the `projects` global, activeProjectId, the Finder, the
// desktop, or handleAction.

window.AISystem6RecoveryStorage = (() => {
  async function readStoreAll(db, storeName) {
    return window.AISystem6StorageTransactions.runTransaction(
      db,
      [storeName],
      "readonly",
      (tx) => idbRequest(tx.objectStore(storeName).getAll())
    );
  }

  async function readProjectDocumentRevisions(projectId) {
    const revisions = [];
    let db;
    try {
      db = await openAppDb();
      const tx = db.transaction(keyvalStoreName, "readonly");
      const keys = await idbRequest(tx.objectStore(keyvalStoreName).getAllKeys());
      const prefix = `documentRevisions:${String(projectId || "")}:`;
      for (const key of keys) {
        if (typeof key !== "string" || !key.startsWith(prefix)) continue;
        const value = await idbRequest(tx.objectStore(keyvalStoreName).get(key));
        if (Array.isArray(value)) revisions.push(...value);
      }
    } finally {
      db?.close();
    }
    return revisions;
  }

  async function listRecoverableProjects() {
    let db;
    try {
      db = await openAppDb();
      const stored = await readStoreAll(db, projectsStoreName);
      return (Array.isArray(stored) ? stored : [])
        .filter((project) => project && typeof project.id === "string")
        .map((project) => ({
          id: project.id,
          name: String(project.name || "Untitled Project"),
          updatedAt: String(project.updatedAt || project.createdAt || ""),
        }))
        .sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
    } finally {
      db?.close();
    }
  }

  async function exportRecoveryProjectBackup(projectId) {
    let db;
    try {
      db = await openAppDb();
      const [storedProjects, storedScraps, storedTrash, storedFolders, storedFiles, storedReferences, settings] = await Promise.all([
        readStoreAll(db, projectsStoreName),
        readStoreAll(db, scrapsStoreName),
        readStoreAll(db, trashStoreName),
        readStoreAll(db, chatFoldersStoreName),
        readStoreAll(db, chatFilesStoreName),
        readStoreAll(db, referenceStoreName),
        window.AISystem6StorageTransactions.runTransaction(
          db,
          [keyvalStoreName],
          "readonly",
          (tx) => idbRequest(tx.objectStore(keyvalStoreName).get("settings"))
        ),
      ]);
      const result = await window.AISystem6ProjectBackupAssembler.assembleProjectBackup({
        projectId,
        source: {
          getProject: async () => (Array.isArray(storedProjects) ? storedProjects : [])
            .find((entry) => entry && entry.id === projectId) || null,
          getFolders: async () => (Array.isArray(storedFolders) ? storedFolders : []).filter((entry) => entry?.projectId === projectId),
          getFiles: async () => (Array.isArray(storedFiles) ? storedFiles : []).filter((entry) => entry?.projectId === projectId),
          getScraps: async () => (Array.isArray(storedScraps) ? storedScraps : []).filter((entry) => entry?.projectId === projectId),
          getTrash: async () => (Array.isArray(storedTrash) ? storedTrash : []).filter((entry) => entry?.projectId === projectId),
          getProjectCdItems: async () => (Array.isArray(settings?.projectCdItems) ? settings.projectCdItems : [])
            .filter((entry) => entry?.projectId === projectId),
          getReferences: async () => (Array.isArray(storedReferences) ? storedReferences : [])
            .filter((entry) => entry?.projectId === projectId),
          getDocumentRevisions: () => readProjectDocumentRevisions(projectId),
          getWorkingSession: () => readWorkingSessionForBackup(projectId),
        },
      });
      return result && result.ready ? result.bundle : null;
    } finally {
      db?.close();
    }
  }

  async function recoveryStorageStatus() {
    try {
      const projects = await listRecoverableProjects();
      return { readable: true, projectCount: projects.length };
    } catch {
      return { readable: false, projectCount: 0 };
    }
  }

  return Object.freeze({
    listRecoverableProjects,
    exportRecoveryProjectBackup,
    recoveryStorageStatus,
  });
})();
