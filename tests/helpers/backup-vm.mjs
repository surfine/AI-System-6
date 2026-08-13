// VM builder for real Project Backup / Recovery integrity tests: loads the
// real project-disk-backup, project-backup-assembler and recovery-storage
// modules over one in-memory IndexedDB-shaped store map.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { read } from "./feature-test-harness.mjs";

const backupSource = read("app/core/project-disk-backup.js");
const assemblerSource = read("app/core/project-backup-assembler.js");
const recoverySource = read("app/core/recovery-storage.js");

export function createBackupVm(seed = {}) {
  const keyval = { ...(seed.keyval || {}) };
  const stores = {
    projects: seed.projects || [],
    scraps: seed.scraps || [],
    trashItems: seed.trash || [],
    chatFolders: seed.folders || [],
    chatFiles: seed.files || [],
    projectReferences: seed.references || [],
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
    crypto: webcrypto,
    TextEncoder,
    openAppDb: async () => dbStub,
    idbRequest: (request) => Promise.resolve(request),
    keyvalStoreName: "keyval",
    projectsStoreName: "projects",
    scrapsStoreName: "scraps",
    trashStoreName: "trashItems",
    chatFoldersStoreName: "chatFolders",
    chatFilesStoreName: "chatFiles",
    referenceStoreName: "projectReferences",
    indexedDbVersion: 3,
    storageVersion: 2,
    window: {
      AISystem6StorageTransactions: {
        runTransaction: async (db, storeNames, mode, operation) => operation({
          objectStore: (name) => ({
            getAll: () => Promise.resolve(stores[name] || []),
            get: (key) => Promise.resolve(keyval[key]),
          }),
        }),
      },
      AISystem6BuildInfo: { version: "1.0.36", build: "20260809.10" },
    },
  });
  vm.runInContext(backupSource, context);
  vm.runInContext(assemblerSource, context);
  vm.runInContext(recoverySource, context);
  return {
    context,
    keyval,
    stores,
    backup: context.window.AISystem6ProjectDiskBackup,
    assembler: context.window.AISystem6ProjectBackupAssembler,
    recovery: context.window.AISystem6RecoveryStorage,
  };
}

export function seedComplexProject() {
  const now = "2026-08-09T12:00:00.000Z";
  const project = {
    id: "p1",
    name: "Integrity Article",
    updatedAt: now,
    createdAt: now,
    quickDraft: {
      stage: "draft",
      workspace: {
        body: "工作稿正文",
        title: "Integrity Article",
        projectDocId: "file-1",
        versions: [],
        protectedRanges: [],
        composition: {},
        adjustmentLayers: [],
        materials: [],
        intake: { setup: { scenario: "bili-dynamic", targetDuration: "280w" } },
      },
    },
  };
  const folders = [
    { id: "folder-1", projectId: "p1", name: "Documents", parentId: "" },
    { id: "folder-2", projectId: "p1", name: "Drafts", parentId: "folder-1" },
  ];
  const files = [
    { id: "file-1", projectId: "p1", type: "text", name: "manuscript.md", body: "正文", folderId: "folder-1", durable: true, updatedAt: now },
    { id: "file-2", projectId: "p1", type: "text", name: "notes.md", body: "笔记", folderId: "folder-2", durable: true, updatedAt: now },
    {
      id: "file-3",
      projectId: "p1",
      type: "alias",
      name: "alias-to-manuscript",
      folderId: "folder-1",
      aliasTarget: { kind: "file", id: "file-1" },
      updatedAt: now,
    },
  ];
  const reference = {
    id: "ref-1",
    projectId: "p1",
    name: "Primary Source",
    enabled: true,
    updatedAt: now,
    chunks: [{ id: "chunk-1", text: "来源片段" }],
  };
  const scraps = [
    { id: "scrap-1", projectId: "p1", text: "引用一段", sourceFileId: "file-1", updatedAt: now },
    { id: "scrap-2", projectId: "p1", text: "参考来源片段", sourceReferenceId: "ref-1", updatedAt: now },
  ];
  const trash = [{ id: "trash-1", projectId: "p1", name: "deleted.md", body: "删除的内容", updatedAt: now }];
  const projectCdItems = [{ id: "cd-1", projectId: "p1", title: "Export Deck", sourceFileId: "file-1", sourceKind: "markdown", updatedAt: now }];
  const revisions = [
    { id: "rev-1", projectId: "p1", documentId: "file-1", parentRevisionId: "", body: "第一版", createdAt: now, contentHash: "seed-hash-1", operation: "create", origin: "test" },
    { id: "rev-2", projectId: "p1", documentId: "file-1", parentRevisionId: "rev-1", body: "第二版", createdAt: now, contentHash: "seed-hash-2", operation: "update", origin: "test" },
  ];
  return {
    keyval: {
      settings: { projectCdItems },
      "documentRevisions:p1:file-1": revisions,
    },
    projects: [project],
    folders,
    files,
    scraps,
    trash,
    references: [reference],
  };
}
