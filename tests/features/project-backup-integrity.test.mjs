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

// Repair receipts are ordinary extra JSON fields on a record. The remap layer
// must carry them verbatim: previousValue is not a current relation, so it is
// never re-mapped, while real relation fields keep their original mapping.
legacyBundle.files.find((file) => file.id === "file-child").repairReceipts = [
  {
    kind: "dangling-link",
    field: "sourceDocumentId",
    previousValue: "file-gone",
    action: "quarantined",
    detectedAt: "2026-07-30T00:30:00.000Z",
  },
];

const legacyValidation = backup.validateBackup(legacyBundle);
test.assert(legacyValidation.valid, "valid v1 backups remain importable");
test.assert(
  legacyValidation.warnings.some((warning) => warning.includes("no cryptographic integrity")),
  "legacy backups are explicitly marked as lacking integrity"
);

const v2Bundle = await backup.attachIntegrity(legacyBundle);
test.assert(v2Bundle.formatVersion === 3, "new exports use format v3");
test.assert(
  /^[a-f0-9]{64}$/.test(v2Bundle.integrity.contentHash),
  "new exports carry a SHA-256 content hash"
);
test.assert(
  Array.isArray(v2Bundle.documentRevisions) && v2Bundle.documentRevisions.length === 0,
  "v3 exports always carry the documentRevisions array (empty for legacy sources)"
);
const v2Validation = backup.validateBackup(v2Bundle);
if (!v2Validation.valid) console.error(v2Validation.errors.join("\n"));
test.assert(v2Validation.valid, "the generated v2 bundle satisfies its schema");
const v2Integrity = await backup.verifyIntegrity(v2Bundle);
if (!v2Integrity.valid) console.error(v2Integrity.errors.join("\n"));
test.assert(v2Integrity.valid, "an unchanged v2 backup passes integrity verification");
test.assert(
  v2Bundle.files.some((file) =>
    Array.isArray(file.repairReceipts)
    && file.repairReceipts[0]?.previousValue === "file-gone"
    && file.repairReceipts[0]?.field === "sourceDocumentId"
  ),
  "attachIntegrity keeps repair receipts on the records"
);

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

// ---- v3 document revisions -----------------------------------------------

const v3WithRevisions = structuredClone(v2Bundle);
v3WithRevisions.documentRevisions = [
  {
    id: "rev-1",
    projectId: legacyBundle.project.id,
    documentId: "file-child",
    parentRevisionId: "",
    body: "First version",
    contentHash: "aaa",
    phase: "draft",
    origin: "user",
    operation: "save",
    createdAt: "2026-07-30T00:10:00.000Z",
  },
  {
    id: "rev-2",
    projectId: legacyBundle.project.id,
    documentId: "file-child",
    parentRevisionId: "rev-1",
    body: "Second version",
    contentHash: "bbb",
    phase: "final",
    origin: "user",
    operation: "save",
    createdAt: "2026-07-30T00:20:00.000Z",
  },
];
const revisionsAttached = await backup.attachIntegrity(v3WithRevisions);
const v3Validation = backup.validateBackup(revisionsAttached);
if (!v3Validation.valid) console.error(v3Validation.errors.join("\n"));
test.assert(v3Validation.valid, "a v3 backup with document revisions satisfies its schema");
test.assert((await backup.verifyIntegrity(revisionsAttached)).valid, "v3 integrity covers document revisions");

const badRevisionDocument = structuredClone(revisionsAttached);
badRevisionDocument.documentRevisions[0].documentId = "missing-file";
test.assert(
  !backup.validateBackup(badRevisionDocument).valid,
  "a revision pointing at a missing file is rejected"
);

const badRevisionParent = structuredClone(revisionsAttached);
badRevisionParent.documentRevisions[1].parentRevisionId = "rev-other-doc";
test.assert(
  !backup.validateBackup(badRevisionParent).valid,
  "a revision whose parent is not in the same document tree is rejected"
);

let revisionUuidCounter = 0;
const importedWithRevisions = backup.remapBackup(revisionsAttached, {
  now: "2026-07-30T02:00:00.000Z",
  uuid: () => `rev-new-${++revisionUuidCounter}`,
  projectName: (name) => `${name} Restored`,
});
const importedChildFile = importedWithRevisions.files.find((file) => file.name === "Child Chat");
const importedRevisions = importedWithRevisions.documentRevisions;
test.assert(
  importedRevisions.length === 2
    && importedRevisions.every((revision) => revision.projectId === importedWithRevisions.project.id),
  "imported revisions join the restored project"
);
test.assert(
  importedRevisions.every((revision) => revision.documentId === importedChildFile.id),
  "imported revision documentIds follow the remapped file ids"
);
const importedRev1 = importedRevisions.find((revision) => revision.body === "First version");
const importedRev2 = importedRevisions.find((revision) => revision.body === "Second version");
test.assert(
  importedRev1?.id !== "rev-1" && importedRev2?.id !== "rev-2"
    && importedRev2?.parentRevisionId === importedRev1?.id,
  "imported revision ids are re-keyed and the parent chain is preserved"
);
test.assert(
  childFile.sourceKey === `reference:${reference.id}`,
  "stable source keys are remapped with their referenced objects"
);
const importedReceiptFile = imported.files.find((file) =>
  Array.isArray(file.repairReceipts) && file.repairReceipts.some((receipt) => receipt.field === "sourceDocumentId")
);
test.assert(
  importedReceiptFile?.repairReceipts?.[0]?.previousValue === "file-gone",
  "remapBackup keeps repair receipts and never remaps previousValue"
);
test.assert(
  importedReceiptFile?.repairReceipts?.[0]?.field === "sourceDocumentId"
    && importedReceiptFile?.repairReceipts?.[0]?.action === "quarantined",
  "remapBackup keeps the receipt kind, field, and action intact"
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
