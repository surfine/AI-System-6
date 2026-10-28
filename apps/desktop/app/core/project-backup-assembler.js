// Single Project Backup assembler.
//
// Normal Export and Recovery Export must produce byte-identical schema, so
// both go through this one assembler. A `source` adapter supplies the nine
// project-level durable collections; the caller decides whether they come
// from the desktop runtime's memory or straight from IndexedDB.
//
// The assembler attaches integrity AND verifies it before returning, so a
// bundle is never handed to the caller with a hash that its own structure
// contradicts. When a future Project-level durable object is added, it has to
// appear here — which is exactly the point.

window.AISystem6ProjectBackupAssembler = (() => {
  async function readCollection(getter, projectId, fallback = []) {
    const value = await getter(projectId);
    return Array.isArray(value) ? value : fallback;
  }

  /** Every nativeDocumentId the project's files and Trash name (v8). */
  function officeDocumentIds(files, trash) {
    const ids = new Set();
    const visit = (file) => {
      if (file && file.type === "office" && typeof file.nativeDocumentId === "string" && file.nativeDocumentId) ids.add(file.nativeDocumentId);
    };
    files.forEach(visit);
    trash.forEach((item) => {
      const original = item && item.originalData;
      if (!original) return;
      visit(original);
      (Array.isArray(original.files) ? original.files : []).forEach(visit);
    });
    return [...ids];
  }

  function bytesToBase64(bytes) {
    const view = new Uint8Array(bytes);
    let binary = "";
    for (let offset = 0; offset < view.length; offset += 0x8000) {
      binary += String.fromCharCode.apply(null, view.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  /**
   * The Office documents' bytes, read from the nativeDocuments store for both
   * Normal and Recovery Export (the bytes never live in the desk's memory). A
   * row that cannot be read fails the export: a backup that silently lost a
   * document would restore an Office file with nothing in it.
   */
  async function readNativeDocuments(ids, source) {
    if (!ids.length) return [];
    const rows = typeof source.getNativeDocuments === "function"
      ? await source.getNativeDocuments(ids)
      : await (async () => {
        const db = await openAppDb();
        try {
          const tx = db.transaction("nativeDocuments", "readonly");
          const store = tx.objectStore("nativeDocuments");
          return await Promise.all(ids.map((id) => idbRequest(store.get(id))));
        } finally {
          db.close();
        }
      })();
    return ids.map((id, index) => {
      const row = (rows || [])[index];
      if (!row || !row.bytes) throw new Error(`An Office document's bytes are missing (${id}).`);
      return {
        id: row.id,
        projectId: row.projectId || "",
        format: row.format,
        byteLength: row.byteLength,
        sha256: row.sha256 || "",
        updatedAt: row.updatedAt || "",
        base64: bytesToBase64(row.bytes),
      };
    });
  }

  /**
   * @param {{ projectId: string, source: {
   *   getProject: (id: string) => Promise<any>,
   *   getFolders: (id: string) => Promise<any[]>,
   *   getFiles: (id: string) => Promise<any[]>,
   *   getScraps: (id: string) => Promise<any[]>,
   *   getTrash: (id: string) => Promise<any[]>,
   *   getProjectCdItems: (id: string) => Promise<any[]>,
   *   getReferences: (id: string) => Promise<any[]>,
   *   getDocumentRevisions: (id: string) => Promise<any[]>,
   *   getDarkroomRecords: (id: string) => Promise<any[]>,
   *   getWorkingSession?: (id: string) => Promise<any>,
   * } }} options
   */
  async function assembleProjectBackup({ projectId, source }) {
    // The assembler needs the schema's format version, integrity and validator;
    // both are lazy now, and the assembler's own loader brings the schema too.
    if (typeof ensureProjectDiskBackupModule === "function") await ensureProjectDiskBackupModule();
    const project = await source.getProject(projectId);
    if (!project) return null;
    // The desktop scene is optional: a disk with no scene exports as before,
    // and a read failure never fails the backup of the durable data.
    const workingSession = await Promise.resolve()
      .then(() => source.getWorkingSession?.(projectId))
      .catch(() => null);
    const [folders, files, scraps, trash, projectCdItems, references, documentRevisions, darkroomRecords, imageAttachments] = await Promise.all([
      readCollection(source.getFolders, projectId),
      readCollection(source.getFiles, projectId),
      readCollection(source.getScraps, projectId),
      readCollection(source.getTrash, projectId),
      readCollection(source.getProjectCdItems, projectId),
      readCollection(source.getReferences, projectId),
      readCollection(source.getDocumentRevisions, projectId),
      readCollection(source.getDarkroomRecords, projectId),
      readCollection(source.getImageAttachments, projectId),
    ]);
    const nativeDocuments = await readNativeDocuments(officeDocumentIds(files, trash), source);
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
      folders,
      files,
      scraps,
      trash,
      projectCdItems,
      references,
      documentRevisions,
      darkroomRecords,
      imageAttachments,
      nativeDocuments,
    };
    if (workingSession && typeof workingSession === "object") bundle.workingSession = workingSession;
    const attached = await window.AISystem6ProjectDiskBackup.attachIntegrity(bundle);
    const verified = await window.AISystem6ProjectDiskBackup.verifyIntegrity(attached);
    const validation = window.AISystem6ProjectDiskBackup.validateBackup(attached);
    return {
      bundle: attached,
      verified,
      validation,
      ready: verified.valid === true && validation.valid === true,
    };
  }

  return Object.freeze({
    assembleProjectBackup,
  });
})();
