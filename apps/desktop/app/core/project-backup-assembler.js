// Single Project Backup assembler.
//
// Normal Export and Recovery Export must produce byte-identical schema, so
// both go through this one assembler. A `source` adapter supplies the eight
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
   * } }} options
   */
  async function assembleProjectBackup({ projectId, source }) {
    const project = await source.getProject(projectId);
    if (!project) return null;
    const [folders, files, scraps, trash, projectCdItems, references, documentRevisions] = await Promise.all([
      readCollection(source.getFolders, projectId),
      readCollection(source.getFiles, projectId),
      readCollection(source.getScraps, projectId),
      readCollection(source.getTrash, projectId),
      readCollection(source.getProjectCdItems, projectId),
      readCollection(source.getReferences, projectId),
      readCollection(source.getDocumentRevisions, projectId),
    ]);
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
    };
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
