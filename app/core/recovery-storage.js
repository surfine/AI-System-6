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
      const [storedProjects, storedScraps, storedTrash, storedFolders, storedFiles] = await Promise.all([
        readStoreAll(db, projectsStoreName),
        readStoreAll(db, scrapsStoreName),
        readStoreAll(db, trashStoreName),
        readStoreAll(db, chatFoldersStoreName),
        readStoreAll(db, chatFilesStoreName),
      ]);
      const project = (Array.isArray(storedProjects) ? storedProjects : [])
        .find((entry) => entry && entry.id === projectId);
      if (!project) return null;
      const bundle = {
        format: "ai-system-6-project-disk",
        formatVersion: window.AISystem6ProjectDiskBackup.currentFormatVersion,
        schemaVersion: indexedDbVersion,
        appVersion: window.AISystem6BuildInfo?.version || "",
        appBuild: window.AISystem6BuildInfo?.build || "",
        storageVersion,
        exportedAt: new Date().toISOString(),
        projectRevision: project.updatedAt || "",
        project,
        folders: (Array.isArray(storedFolders) ? storedFolders : []).filter((entry) => entry?.projectId === projectId),
        files: (Array.isArray(storedFiles) ? storedFiles : []).filter((entry) => entry?.projectId === projectId),
        scraps: (Array.isArray(storedScraps) ? storedScraps : []).filter((entry) => entry?.projectId === projectId),
        trash: (Array.isArray(storedTrash) ? storedTrash : []).filter((entry) => entry?.projectId === projectId),
        projectCdItems: [],
        references: [],
        documentRevisions: await readProjectDocumentRevisions(projectId),
      };
      return window.AISystem6ProjectDiskBackup.attachIntegrity(bundle);
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
