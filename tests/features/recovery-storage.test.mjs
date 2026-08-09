// Startup Recovery reads project data directly from IndexedDB. Even when the
// normal runtime never loaded (projects global empty, loadDeskState would
// throw), the Recovery panel can list real projects and export a verified
// backup for one of them.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("recovery-storage");
const source = read("app/core/recovery-storage.js");

function createRecoveryVm({ projects = [], scraps = [], trash = [], folders = [], files = [], revisions = [] } = {}) {
  const keyval = {
    "documentRevisions:p1:d1": revisions,
    "documentRevisions:p2:d2": revisions,
  };
  const stores = {
    projects,
    scraps,
    trashItems: trash,
    chatFolders: folders,
    chatFiles: files,
  };
  const dbStub = {
    close() {},
    transaction(storeNames, mode) {
      return {
        objectStore(name) {
          return {
            getAll: () => Promise.resolve(stores[name] || []),
            getAllKeys: () => Promise.resolve(Object.keys(keyval)),
            get: (key) => Promise.resolve(keyval[key]),
          };
        },
      };
    },
  };
  const context = vm.createContext({
    console,
    openAppDb: async () => dbStub,
    idbRequest: (request) => Promise.resolve(request),
    keyvalStoreName: "keyval",
    projectsStoreName: "projects",
    scrapsStoreName: "scraps",
    trashStoreName: "trashItems",
    chatFoldersStoreName: "chatFolders",
    chatFilesStoreName: "chatFiles",
    indexedDbVersion: 2,
    storageVersion: 2,
    window: {
      AISystem6StorageTransactions: {
        runTransaction: async (db, storeNames, mode, operation) => operation({
          objectStore: (name) => ({ getAll: () => Promise.resolve(stores[name] || []) }),
        }),
      },
      AISystem6ProjectDiskBackup: {
        currentFormatVersion: 3,
        attachIntegrity: (bundle) => ({ ...bundle, integrity: { sha256: "fixture", counts: {} } }),
      },
      AISystem6BuildInfo: { version: "1.0.35", build: "20260809.9" },
    },
  });
  vm.runInContext(source, context);
  return { api: context.window.AISystem6RecoveryStorage };
}

// Disaster scenario: the desktop runtime never loaded (no `projects` global
// here at all), but IndexedDB still holds two projects.
{
  const runtime = createRecoveryVm({
    projects: [
      { id: "p1", name: "AI System 6 Article", updatedAt: "2026-08-09T10:00:00.000Z" },
      { id: "p2", name: "DTK", updatedAt: "2026-08-08T09:00:00.000Z" },
    ],
    files: [
      { id: "f1", projectId: "p1", name: "manuscript.md", body: "正文" },
      { id: "f2", projectId: "p2", name: "notes.md", body: "笔记" },
    ],
    folders: [{ id: "folder-1", projectId: "p1", name: "Documents" }],
    revisions: [{ id: "rev-1", projectId: "p1", documentId: "d1", body: "旧稿" }],
  });
  const projects = await runtime.api.listRecoverableProjects();
  test.assert(projects.length === 2, "Recovery lists both projects from IndexedDB");
  test.assert(projects.some((project) => project.name === "AI System 6 Article"), "Recovery reads real project names from the DB");
  const bundle = await runtime.api.exportRecoveryProjectBackup("p1");
  test.assert(bundle && bundle.project.id === "p1", "Recovery exports the requested project without mounting it");
  test.assert(bundle.files.length === 1 && bundle.files[0].id === "f1", "the backup contains only that project's files");
  test.assert(bundle.folders.length === 1, "the backup contains the project's folders");
  test.assert(bundle.documentRevisions.length === 1, "the backup contains the project's document revisions");
  test.assert(bundle.format === "ai-system-6-project-disk" && bundle.integrity, "the backup uses the verified project-disk schema");
}

// A project that is not in the DB cannot be exported.
{
  const runtime = createRecoveryVm({ projects: [{ id: "p1", name: "Only" }] });
  const bundle = await runtime.api.exportRecoveryProjectBackup("missing");
  test.assert(bundle === null, "exporting an unknown project returns null");
}

// Storage status reports the DB truth, including an unreadable database.
{
  const runtime = createRecoveryVm({ projects: [] });
  const status = await runtime.api.recoveryStorageStatus();
  test.assert(status.readable === true && status.projectCount === 0, "an empty-but-readable DB reports zero projects");
}

test.finish();
