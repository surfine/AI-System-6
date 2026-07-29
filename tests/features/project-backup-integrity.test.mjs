import vm from "node:vm";
import { webcrypto } from "node:crypto";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("project-backup-integrity");
const backupSource = read("app/core/project-disk-backup.js");
const exportImportSource = read("app/features/export-import.js");
const manifest = read("scripts/runtime-manifest.mjs");

const context = vm.createContext({
  crypto: webcrypto,
  TextEncoder,
  Uint8Array,
  structuredClone,
  window: {},
});
vm.runInContext(backupSource, context);
const backup = context.window.AISystem6ProjectDiskBackup;

const legacyBundle = {
  format: "ai-system-6-project-disk",
  formatVersion: 1,
  exportedAt: "2026-07-30T00:00:00.000Z",
  project: {
    id: "project-old",
    name: "Test Project",
    activeTextFileId: "file-child",
  },
  folders: [
    { id: "folder-root", projectId: "project-old", name: "Root", parentId: null },
    { id: "folder-child", projectId: "project-old", name: "Child", parentId: "folder-root" },
  ],
  files: [
    {
      id: "file-root",
      projectId: "project-old",
      name: "Root Chat",
      folderId: "folder-root",
      body: "Root",
    },
    {
      id: "file-child",
      projectId: "project-old",
      name: "Child Chat",
      folderId: "folder-child",
      parentChatId: "file-root",
      body: "Child",
      sourceKey: "reference:reference-old",
    },
  ],
  scraps: [
    {
      id: "scrap-old",
      projectId: "project-old",
      title: "Clip",
      body: "Evidence",
      sourceFileId: "file-root",
      sourceReferenceId: "reference-old",
    },
  ],
  trash: [
    {
      projectId: "project-old",
      title: "Deleted",
      originalType: "file",
      originalData: {
        id: "file-deleted",
        projectId: "project-old",
        name: "Deleted",
        folderId: "folder-root",
        body: "Deleted body",
      },
    },
  ],
  projectCdItems: [
    {
      id: "cd-old",
      projectId: "project-old",
      title: "Final.md",
      body: "Final",
      sourceDocumentId: "file-child",
      claimCheckId: "file-root",
    },
  ],
  references: [
    {
      id: "reference-old",
      projectId: "project-old",
      name: "Source",
      chunks: [
        {
          id: "chunk-old",
          projectId: "project-old",
          referenceId: "reference-old",
          content: "Source text",
        },
      ],
    },
  ],
};

const legacyValidation = backup.validateBackup(legacyBundle);
test.assert(legacyValidation.valid, "valid v1 backups remain importable");
test.assert(
  legacyValidation.warnings.some((warning) => warning.includes("no cryptographic integrity")),
  "legacy backups are explicitly marked as lacking integrity"
);

const v2Bundle = await backup.attachIntegrity(legacyBundle);
test.assert(v2Bundle.formatVersion === 2, "new exports use format v2");
test.assert(
  /^[a-f0-9]{64}$/.test(v2Bundle.integrity.contentHash),
  "new exports carry a SHA-256 content hash"
);
const v2Validation = backup.validateBackup(v2Bundle);
if (!v2Validation.valid) console.error(v2Validation.errors.join("\n"));
test.assert(v2Validation.valid, "the generated v2 bundle satisfies its schema");
const v2Integrity = await backup.verifyIntegrity(v2Bundle);
if (!v2Integrity.valid) console.error(v2Integrity.errors.join("\n"));
test.assert(v2Integrity.valid, "an unchanged v2 backup passes integrity verification");

const tampered = structuredClone(v2Bundle);
tampered.files[0].body = "tampered";
test.assert(!(await backup.verifyIntegrity(tampered)).valid, "tampering is detected before import");

const dangling = structuredClone(legacyBundle);
dangling.files[0].folderId = "missing-folder";
test.assert(!backup.validateBackup(dangling).valid, "dangling foreign keys are rejected");

const unsupported = structuredClone(legacyBundle);
unsupported.formatVersion = 999;
test.assert(!backup.validateBackup(unsupported).valid, "unsupported backup versions are rejected");

let uuidCounter = 0;
const imported = backup.remapBackup(legacyBundle, {
  now: "2026-07-30T01:00:00.000Z",
  uuid: () => `new-${++uuidCounter}`,
  projectName: (name) => `${name} Restored`,
});
const rootFolder = imported.folders.find((folder) => folder.name === "Root");
const childFolder = imported.folders.find((folder) => folder.name === "Child");
const rootFile = imported.files.find((file) => file.name === "Root Chat");
const childFile = imported.files.find((file) => file.name === "Child Chat");
const reference = imported.references[0];
test.assert(imported.project.id !== legacyBundle.project.id, "import creates a new project identity");
test.assert(childFolder.parentId === rootFolder.id, "folder parent relationships are remapped");
test.assert(childFile.folderId === childFolder.id, "file folder relationships are remapped");
test.assert(childFile.parentChatId === rootFile.id, "chat lineage is remapped");
test.assert(
  imported.scraps[0].sourceFileId === rootFile.id
    && imported.scraps[0].sourceReferenceId === reference.id,
  "Scrapbook source relationships are remapped"
);
test.assert(
  imported.projectCdItems[0].sourceDocumentId === childFile.id
    && imported.projectCdItems[0].claimCheckId === rootFile.id,
  "Project CD relationships are remapped"
);
test.assert(
  reference.chunks[0].referenceId === reference.id
    && reference.chunks[0].projectId === imported.project.id,
  "reference chunks point to the imported project and reference"
);
test.assert(
  imported.trash[0].originalData.id !== "file-deleted"
    && imported.trash[0].originalData.folderId === rootFolder.id,
  "recoverable Trash records receive fresh nested identities"
);
test.assert(
  childFile.sourceKey === `reference:${reference.id}`,
  "stable source keys are remapped with their referenced objects"
);

test.assertIncludes(
  manifest,
  '"app/core/project-disk-backup.js"',
  "the backup contract is part of the browser runtime"
);
test.assertIncludes(
  exportImportSource,
  "file.size > window.AISystem6ProjectDiskBackup.maxBackupBytes",
  "backup files are size-checked before file.text()"
);
test.assertIncludes(
  exportImportSource,
  "async function commitImportedProjectAtomically(imported)",
  "backup import has one explicit atomic repository operation"
);
const importStart = exportImportSource.indexOf("async function importProjectBackupAsNewProject()");
const importEnd = exportImportSource.indexOf("async function previewProjectBackupFile()", importStart);
const importBlock = exportImportSource.slice(importStart, importEnd);
test.assert(
  importBlock.indexOf("await commitImportedProjectAtomically(imported)") < importBlock.indexOf("projects.unshift(imported.project)"),
  "UI arrays change only after the import transaction commits"
);
test.assertIncludes(
  exportImportSource,
  "AISystem6StorageTransactions.runTransaction",
  "all imported stores share the transaction completion contract"
);

test.finish();
