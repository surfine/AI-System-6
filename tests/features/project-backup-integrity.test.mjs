import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("project-backup-integrity");
const backupSource = read("app/core/project-disk-backup.js");
const exportImportSource = read("app/features/export-import.js");
const manifest = read("tooling/runtime-manifest.mjs");

const context = vm.createContext({
  atob,
  crypto: webcrypto,
  TextEncoder,
  Uint8Array,
  structuredClone,
  window: {},
});
vm.runInContext(backupSource, context);
const backup = context.window.AISystem6ProjectDiskBackup;

const v2Fixture = JSON.parse(
  readFileSync(new URL("../fixtures/project-disk-backup-v2.json", import.meta.url), "utf8")
);

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

const v3Bundle = await backup.attachIntegrity(legacyBundle);
test.assert(v3Bundle.formatVersion === 7, "new exports use the current format v7");
test.assert(
  /^[a-f0-9]{64}$/.test(v3Bundle.integrity.contentHash),
  "new exports carry a SHA-256 content hash"
);
test.assert(
  Array.isArray(v3Bundle.documentRevisions) && v3Bundle.documentRevisions.length === 0,
  "v3 exports always carry the documentRevisions array (empty for legacy sources)"
);
const v3Validation = backup.validateBackup(v3Bundle);
if (!v3Validation.valid) console.error(v3Validation.errors.join("\n"));
test.assert(v3Validation.valid, "the generated v3 bundle satisfies its schema");
const v3Integrity = await backup.verifyIntegrity(v3Bundle);
if (!v3Integrity.valid) console.error(v3Integrity.errors.join("\n"));
test.assert(v3Integrity.valid, "an unchanged v3 backup passes integrity verification");
test.assert(
  v3Bundle.files.some((file) =>
    Array.isArray(file.repairReceipts)
    && file.repairReceipts[0]?.previousValue === "file-gone"
    && file.repairReceipts[0]?.field === "sourceDocumentId"
  ),
  "attachIntegrity keeps repair receipts on the records"
);

// v7: ClioTalk may carry a bounded inline fallback, but never a provider
// handle or live browser object. The backup owns that distinction so an
// imported Chat cannot smuggle a credential-scoped file token back to a new
// machine.
const inlineImageBundle = structuredClone(v3Bundle);
inlineImageBundle.files.push({
  id: "chat-with-image",
  projectId: "project-old",
  type: "chat",
  name: "Image Chat",
  folderId: "folder-root",
  messages: [{
    id: "message-with-image",
    role: "user",
    content: "What is in this image?",
    imageInputIds: ["clio-image-old"],
    imageInputs: [{
      clientId: "clio-image-old",
      kind: "image",
      name: "sample.jpg",
      type: "image/jpeg",
      size: 4,
      width: 1,
      height: 1,
      inlineDataUrl: "data:image/jpeg;base64,/9j/2Q==",
      transport: "inline",
      attachedAt: "2026-08-27T00:00:00.000Z",
    }],
  }],
});
const inlineImageExport = await backup.attachIntegrity(inlineImageBundle);
const inlineImageValidation = backup.validateBackup(inlineImageExport);
if (!inlineImageValidation.valid) console.error(inlineImageValidation.errors.join("\n"));
test.assert(inlineImageValidation.valid, "v7 accepts a bounded inline ClioTalk image fallback");
const remappedInline = backup.remapBackup(inlineImageExport);
const remappedMessage = remappedInline.files.find((file) => file.name === "Image Chat")?.messages?.[0];
test.assert(
  remappedMessage?.imageInputs?.[0]?.clientId
    && remappedMessage.imageInputs[0].clientId !== "clio-image-old"
    && remappedMessage.imageInputIds[0] === remappedMessage.imageInputs[0].clientId,
  "import remaps ClioTalk image identity and every message reference together"
);
test.assert(
  remappedMessage?.imageInputs?.[0]?.inlineDataUrl === "data:image/jpeg;base64,/9j/2Q==",
  "import preserves the bounded inline fallback bytes"
);
const unsafeInlineImage = structuredClone(inlineImageExport);
unsafeInlineImage.files.find((file) => file.id === "chat-with-image").messages[0].imageInputs[0].fileToken = "signed-provider-handle";
test.assert(!backup.validateBackup(unsafeInlineImage).valid, "v7 rejects transient provider handles inside imageInputs");
const oversizedInlineImage = structuredClone(inlineImageExport);
oversizedInlineImage.files.find((file) => file.id === "chat-with-image").messages[0].imageInputs[0].inlineDataUrl =
  `data:image/jpeg;base64,${"A".repeat(Math.ceil((512 * 1024 * 4) / 3) + 16)}`;
test.assert(!backup.validateBackup(oversizedInlineImage).valid, "v7 rejects an inline fallback above 512 KiB decoded");
const mismatchedInlineImage = structuredClone(inlineImageExport);
mismatchedInlineImage.files.find((file) => file.id === "chat-with-image").messages[0].imageInputs[0].inlineDataUrl =
  "data:image/png;base64,/9j/2Q==";
test.assert(!backup.validateBackup(mismatchedInlineImage).valid, "v7 validates persisted image magic bytes");
const danglingInlineImage = structuredClone(inlineImageExport);
danglingInlineImage.files.find((file) => file.id === "chat-with-image").messages[0].imageInputIds = ["missing-image"];
test.assert(!backup.validateBackup(danglingInlineImage).valid, "v7 refuses a turn whose image origin is missing from its Chat");
const legacyInlineImage = structuredClone(inlineImageExport);
legacyInlineImage.formatVersion = 6;
const remappedLegacyInline = backup.remapBackup(legacyInlineImage);
const legacyMessage = remappedLegacyInline.files.find((file) => file.name === "Image Chat")?.messages?.[0];
test.assert(
  legacyMessage && !("imageInputs" in legacyMessage) && !("imageInputIds" in legacyMessage),
  "v1-v6 import explicitly migrates to no inline Chat images"
);

const sceneInlineBundle = structuredClone(inlineImageExport);
sceneInlineBundle.workingSession = {
  version: 3,
  projectId: "project-old",
  adapters: {
    assistant: {
      conversation: structuredClone(sceneInlineBundle.files.find((file) => file.id === "chat-with-image").messages),
    },
  },
};
const sceneInlineExport = await backup.attachIntegrity(sceneInlineBundle);
const remappedSceneInline = backup.remapBackup(sceneInlineExport);
const sceneImageMessage = remappedSceneInline.workingSession?.adapters?.assistant?.conversation?.[0];
test.assert(
  sceneImageMessage?.imageInputs?.[0]?.clientId
    && sceneImageMessage.imageInputIds[0] === sceneImageMessage.imageInputs[0].clientId
    && sceneImageMessage.imageInputIds[0] !== "clio-image-old",
  "Working Session v3 remaps persisted image identity with its turn"
);

const tampered = structuredClone(v3Bundle);
tampered.files[0].body = "tampered";
test.assert(!(await backup.verifyIntegrity(tampered)).valid, "tampering is detected before import");

// ---- Real historical v2 fixture -----------------------------------------
// v2 is a genuinely supported format: SHA-256 integrity + counts, but no
// documentRevisions. The fixture is a hand-written legacy export, not a
// current-format export relabeled by attachIntegrity().
test.assert(v2Fixture.formatVersion === 2, "the fixture is a v2 backup");
test.assert(
  !("documentRevisions" in v2Fixture),
  "a real v2 backup has no documentRevisions field"
);
test.assert(
  v2Fixture.integrity?.algorithm === "SHA-256"
    && /^[a-f0-9]{64}$/i.test(v2Fixture.integrity.contentHash || ""),
  "the v2 fixture carries a SHA-256 integrity record"
);
const v2Validation = backup.validateBackup(v2Fixture);
if (!v2Validation.valid) console.error(v2Validation.errors.join("\n"));
test.assert(v2Validation.valid, "the hand-written v2 backup validates");
test.assert(
  v2Validation.warnings.some((warning) => warning.includes("no document revision history")),
  "v2 validation warns that revision history is absent and will import empty"
);
const v2Integrity = await backup.verifyIntegrity(v2Fixture);
if (!v2Integrity.valid) console.error(v2Integrity.errors.join("\n"));
test.assert(v2Integrity.valid, "the hand-written v2 backup verifies its integrity");

const tamperedV2 = structuredClone(v2Fixture);
tamperedV2.files[0].body = "tampered v2";
test.assert(!(await backup.verifyIntegrity(tamperedV2)).valid, "v2 tampering is detected before import");

// v2 → validate → verify integrity → remap → import → export v3. The remap is
// the import step; exporting re-attaches integrity at the current version, and
// the migrated backup must carry an explicit empty revision set, not an error.
let v2UuidCounter = 0;
const importedV2 = backup.remapBackup(v2Fixture, {
  now: "2026-08-01T00:00:00.000Z",
  uuid: () => `v2-new-${++v2UuidCounter}`,
  projectName: (name) => `${name} Restored`,
});
const importedV2RootFolder = importedV2.folders.find((folder) => folder.name === "Drafts");
const importedV2SubFolder = importedV2.folders.find((folder) => folder.name === "Archive");
const importedV2RootFile = importedV2.files.find((file) => file.name === "Root Chat.md");
const importedV2ChildFile = importedV2.files.find((file) => file.name === "Child Manuscript.md");
const importedV2Alias = importedV2.files.find((file) => file.name === "Alias to Clip");
const importedV2Reference = importedV2.references.find((reference) => reference.name === "Source Article");
test.assert(
  Array.isArray(importedV2.documentRevisions) && importedV2.documentRevisions.length === 0,
  "v2 import migrates to an explicit empty documentRevisions array instead of erroring"
);
test.assert(
  importedV2SubFolder.parentId === importedV2RootFolder.id,
  "v2 folder hierarchy is preserved through remap"
);
test.assert(
  importedV2ChildFile.folderId === importedV2SubFolder.id
    && importedV2ChildFile.parentChatId === importedV2RootFile.id
    && importedV2ChildFile.sourceDocumentId === importedV2RootFile.id,
  "v2 file/folder and document lineage are preserved through remap"
);
test.assert(
  importedV2Alias.type === "alias"
    && importedV2Alias.aliasTarget.kind === "scrap"
    && importedV2Alias.aliasTarget.id === importedV2.scraps[0].id,
  "v2 alias targets are remapped to the imported Scrapbook record"
);
test.assert(
  importedV2.scraps[0].sourceFileId === importedV2RootFile.id
    && importedV2.scraps[0].sourceReferenceId === importedV2Reference.id,
  "v2 Scrapbook source relationships are preserved through remap"
);
test.assert(
  importedV2.projectCdItems[0].sourceDocumentId === importedV2ChildFile.id
    && importedV2.projectCdItems[0].claimCheckId === importedV2RootFile.id,
  "v2 Project CD relationships are preserved through remap"
);
test.assert(
  importedV2Reference.chunks[0].referenceId === importedV2Reference.id
    && importedV2Reference.chunks[0].projectId === importedV2.project.id,
  "v2 reference chunks point at the imported reference and project"
);
const exportedV2 = await backup.attachIntegrity(importedV2);
test.assert(exportedV2.formatVersion === 7, "imported v2 re-exports as the current v7 format");
test.assert(
  Array.isArray(exportedV2.documentRevisions) && exportedV2.documentRevisions.length === 0,
  "the v3 export of an imported v2 backup carries an empty documentRevisions array"
);
const exportedV2Validation = backup.validateBackup(exportedV2);
if (!exportedV2Validation.valid) console.error(exportedV2Validation.errors.join("\n"));
test.assert(exportedV2Validation.valid, "the migrated v3 export satisfies the current schema");
test.assert(
  (await backup.verifyIntegrity(exportedV2)).valid,
  "the migrated v3 export verifies its integrity"
);

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

const v3WithRevisions = structuredClone(v3Bundle);
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
const revisionsValidation = backup.validateBackup(revisionsAttached);
if (!revisionsValidation.valid) console.error(revisionsValidation.errors.join("\n"));
test.assert(revisionsValidation.valid, "a v3 backup with document revisions satisfies its schema");
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

// ---- Run Receipt relations survive a real backup -> restore --------------
// Every Project identity relation stored inside a Run Receipt must be
// remapped on import. The pinned contract:
//   runReceipt.projectId
//   runReceipt.inputObjectIds
//   runReceipt.affectedObjectIds
//   runReceipt.outputObjectIds
//   runReceipt.replayContract.inputObjectIds
const receiptBackup = structuredClone(legacyBundle);
receiptBackup.files.push(
  { id: "file-source", projectId: "project-old", name: "Source.md", folderId: "folder-root", body: "Source body" },
  { id: "file-output", projectId: "project-old", name: "Output.md", folderId: "folder-root", body: "Output body" }
);
receiptBackup.files.push({
  id: "receipt-file",
  projectId: "project-old",
  folderId: "folder-root",
  type: "text",
  artifactKind: "clio-run-record",
  name: "Run receipt",
  body: "Run Receipt",
  runReceipt: {
    schemaVersion: 2,
    runId: "run-1",
    projectId: "project-old",
    sourceAppId: "docMap",
    intent: "map",
    status: "completed",
    inputObjectIds: ["file-source"],
    affectedObjectIds: ["file-source"],
    outputObjectIds: ["file-output"],
    replayContract: {
      appId: "docMap",
      intent: "map",
      inputObjectIds: ["file-source"],
    },
  },
});

let receiptUuidCounter = 0;
const importedReceiptBackup = backup.remapBackup(receiptBackup, {
  now: "2026-08-01T03:00:00.000Z",
  uuid: () => `receipt-new-${++receiptUuidCounter}`,
  projectName: (name) => `${name} Restored`,
});
const importedSourceFile = importedReceiptBackup.files.find((file) => file.name === "Source.md");
const importedOutputFile = importedReceiptBackup.files.find((file) => file.name === "Output.md");
const importedReceiptFile2 = importedReceiptBackup.files.find((file) => file.artifactKind === "clio-run-record");
test.assert(
  importedSourceFile && importedOutputFile && importedReceiptFile2,
  "the restored backup carries the source, output, and receipt files"
);
const restoredReceipt = importedReceiptFile2.runReceipt;
test.assert(
  restoredReceipt.projectId === importedReceiptBackup.project.id,
  "runReceipt.projectId is remapped to the restored project"
);
test.assert(
  restoredReceipt.inputObjectIds[0] === importedSourceFile.id,
  "runReceipt.inputObjectIds points at the imported source file"
);
test.assert(
  restoredReceipt.affectedObjectIds[0] === importedSourceFile.id,
  "runReceipt.affectedObjectIds points at the imported source file"
);
test.assert(
  restoredReceipt.outputObjectIds[0] === importedOutputFile.id,
  "runReceipt.outputObjectIds points at the imported output file"
);
test.assert(
  restoredReceipt.replayContract.inputObjectIds[0] === importedSourceFile.id,
  "replayContract.inputObjectIds points at the imported source file"
);

// The restored receipt is actually queryable and replayable: Get Info's
// queryReceiptsByOutput finds it through the imported output id, and
// Repeat This Run resolves the imported input instead of reporting
// inputs-missing.
const receiptsContext = vm.createContext({
  console,
  crypto: webcrypto,
  chatFiles: importedReceiptBackup.files,
  activeProjectId: importedReceiptBackup.project.id,
  window: {},
});
vm.runInContext(read("app/core/run-receipts.js"), receiptsContext);
const receiptsApi = receiptsContext.window.AISystem6RunReceipts;
const repeatPayloads = [];
receiptsContext.window.AISystem6ApplicationRegistry = {
  dispatchApplicationIntent: async (appId, payload) => {
    repeatPayloads.push({ appId, payload });
    return { ok: true };
  },
};
const byOutput = receiptsApi.queryReceiptsByOutput(importedOutputFile.id);
test.assert(
  byOutput.length === 1 && byOutput[0].id === importedReceiptFile2.id,
  "queryReceiptsByOutput finds the receipt through the imported output id"
);
const replayed = await receiptsApi.repeatReceipt(importedReceiptFile2.id);
test.assert(replayed.ok === true, "Repeat This Run works on the restored receipt");
test.assert(
  repeatPayloads.length === 1
    && repeatPayloads[0].payload.items[0]?.id === importedSourceFile.id
    && repeatPayloads[0].payload.projectId === importedReceiptBackup.project.id,
  "Repeat This Run resolves the imported input file in the restored project"
);

// Direct helper contract: remapRunReceiptRelations remaps exactly the pinned
// relation fields and leaves external/scope identifiers untouched.
const helperMaps = {
  project: new Map([["p-old", "p-new"]]),
  file: new Map([["f-in", "f-in-new"], ["f-out", "f-out-new"]]),
  folder: new Map(),
  scrap: new Map(),
  trash: new Map(),
  projectCdItem: new Map(),
  reference: new Map(),
  revision: new Map(),
};
const helperReceipt = backup.remapRunReceiptRelations({
  projectId: "p-old",
  inputObjectIds: ["f-in"],
  affectedObjectIds: ["f-in"],
  outputObjectIds: ["f-out"],
  replayContract: { appId: "docMap", intent: "map", inputObjectIds: ["f-in"] },
  sourceScope: { sourceIds: ["external-source-id"], citationIds: ["external-citation"] },
}, helperMaps);
test.assert(
  helperReceipt.projectId === "p-new"
    && helperReceipt.inputObjectIds[0] === "f-in-new"
    && helperReceipt.affectedObjectIds[0] === "f-in-new"
    && helperReceipt.outputObjectIds[0] === "f-out-new"
    && helperReceipt.replayContract.inputObjectIds[0] === "f-in-new",
  "remapRunReceiptRelations remaps every pinned run receipt relation"
);
test.assert(
  helperReceipt.sourceScope.sourceIds[0] === "external-source-id"
    && helperReceipt.sourceScope.citationIds[0] === "external-citation",
  "sourceScope identifiers are retrieval scope, never blind-remapped as file ids"
);

// --- v4: the optional desktop scene ----------------------------------------
//
// A backup may carry the disk's own Working Session so a restored project
// opens on the desk it had. It stays optional, it never carries credentials,
// and every id inside it is remapped into the imported project's id space.

const sceneBundle = structuredClone(legacyBundle);
sceneBundle.workingSession = {
  version: 2,
  savedAt: "2026-08-16T09:00:00.000Z",
  projectId: "project-old",
  adapters: {
    windows: {
      activeAppId: "teachText",
      activeWindowName: "teachText",
      windows: [{ name: "teachText", appId: "teachText", visible: true, zIndex: 12, frame: { left: "40px", top: "60px" } }],
    },
    selection: {
      activeProjectId: "project-old",
      selectedProjectId: "project-old",
      selectedChatFileId: "file-child",
      activeTextFileId: "file-child",
      selectedFolderId: "folder-root",
      selectedScrapIds: ["scrap-old"],
      selectedProjectCdItemId: "cd-old",
      // A disk erased on the exporting machine before the backup was taken.
      selectedProjectReferenceId: "reference-that-is-gone",
    },
    teachText: { projectId: "project-old", activeTextFileId: "file-child", body: "Kept text." },
  },
};
const sceneExport = await backup.attachIntegrity(sceneBundle);
test.assert(sceneExport.formatVersion === 7, "a backup carrying a desktop scene exports at the current version");
const sceneValidation = backup.validateBackup(sceneExport);
if (!sceneValidation.valid) console.error(sceneValidation.errors.join("\n"));
test.assert(sceneValidation.valid, "a bundle with a desktop scene satisfies the schema");
test.assert(
  (await backup.verifyIntegrity(sceneExport)).valid,
  "the desktop scene is covered by the SHA-256 content hash"
);

// The absence of a scene is not an empty scene: exports without one keep the
// exact shape older importers expect.
const sceneless = await backup.attachIntegrity(legacyBundle);
test.assert(
  !("workingSession" in sceneless),
  "a disk with no saved scene exports no workingSession field at all"
);
test.assert(
  backup.validateBackup({ ...v2Fixture }).valid,
  "v2 backups without a desktop scene stay importable"
);

// A scene declared on a pre-v4 bundle is a malformed backup, not a silent pass.
const sceneOnV3 = structuredClone(sceneExport);
sceneOnV3.formatVersion = 3;
test.assert(
  !backup.validateBackup(sceneOnV3).valid,
  "a desktop scene on a pre-v4 bundle is rejected"
);

// Credentials must never ride along inside a scene, whatever wrote it.
const poisoned = structuredClone(sceneExport);
poisoned.workingSession.adapters.selection.apiKey = "sk-live-should-never-travel";
const poisonedValidation = backup.validateBackup(poisoned);
test.assert(!poisonedValidation.valid, "a scene carrying an apiKey fails validation");
test.assert(
  poisonedValidation.errors.some((error) => error.includes("must not carry credentials")),
  "the rejection names the credential rule"
);
const poisonedDeep = structuredClone(sceneExport);
poisonedDeep.workingSession.adapters.windows.windows[0].bearerToken = "abc";
test.assert(
  !backup.validateBackup(poisonedDeep).valid,
  "the credential scan reaches nested scene values"
);
// The same key name is ordinary data anywhere else in the bundle.
const tokenOutsideScene = structuredClone(sceneExport);
tokenOutsideScene.files[0].tokenCount = 42;
test.assert(
  backup.validateBackup(tokenOutsideScene).valid === false
    || !backup.validateBackup(tokenOutsideScene).errors.some((error) => error.includes("credentials")),
  "the credential scan is scoped to the desktop scene"
);

let sceneUuid = 0;
const importedScene = backup.remapBackup(sceneExport, {
  now: "2026-08-16T10:00:00.000Z",
  uuid: () => `scene-${++sceneUuid}`,
});
const importedChild = importedScene.files.find((file) => file.name === "Child Chat");
test.assert(
  importedScene.workingSession.projectId === importedScene.project.id,
  "the imported scene belongs to the imported project, not the exporting machine"
);
test.assert(
  importedScene.workingSession.adapters.selection.activeProjectId === importedScene.project.id
    && importedScene.workingSession.adapters.teachText.projectId === importedScene.project.id,
  "every project id inside the scene is remapped"
);
test.assert(
  importedChild
    && importedScene.workingSession.adapters.selection.activeTextFileId === importedChild.id
    && importedScene.workingSession.adapters.teachText.activeTextFileId === importedChild.id,
  "document ids inside the scene point at the imported documents"
);
const importedScrap = importedScene.scraps[0];
const importedCdItem = importedScene.projectCdItems[0];
test.assert(
  importedScene.workingSession.adapters.selection.selectedProjectCdItemId === importedCdItem.id
    && importedScene.workingSession.adapters.selection.selectedScrapIds[0] === importedScrap.id,
  "scrap and Project CD selections in the scene follow their records"
);
test.assert(
  importedScene.workingSession.adapters.selection.selectedProjectReferenceId === "",
  "an id with no counterpart in the backup is cleared, never left dangling"
);
test.assert(
  importedScene.workingSession.adapters.teachText.body === "Kept text."
    && importedScene.workingSession.adapters.windows.windows[0].frame.left === "40px",
  "scene content that is not an id survives the import unchanged"
);
test.assert(
  backup.remapBackup(sceneless, { now: "2026-08-16T10:00:00.000Z", uuid: () => `x-${++sceneUuid}` }).workingSession === null,
  "importing a backup with no scene yields no scene"
);

test.assertIncludes(
  exportImportSource,
  "workingSessionScopeKey(imported.project.id)",
  "an imported scene lands under the imported project's own scope key"
);
const commitStart = exportImportSource.indexOf("async function commitImportedProjectAtomically(imported)");
const commitBlock = exportImportSource.slice(commitStart, exportImportSource.indexOf("async function importProjectBackupAsNewProject()", commitStart));
test.assertIncludes(
  commitBlock,
  "workingSessionScopeKey",
  "the scene is written inside the same transaction as the project's files"
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

// --- v5: the darkroom travels with the disk --------------------------------
//
// 文字亮室's record — the negative, the adjustment stack, the writer's locks
// and the version chain — lived in keyval, outside the seven array stores a
// backup carried. Export-then-restore therefore lost every one of them and
// said nothing. It is user work, so it belongs in the backup, and this is the
// contract that stops it being dropped again.

const darkroomBundle = structuredClone(legacyBundle);
darkroomBundle.darkroomRecords = [
  {
    schemaVersion: 1,
    projectId: "project-old",
    documentId: "file-child",
    negative: "The sentence as the writer first wrote it.",
    composite: "The sentence after one pass.",
    adjustmentLayers: [{ kind: "mingming", enabled: true }],
    protectedRanges: [{ start: 0, end: 8 }],
    versions: [{ key: "v1", text: "The sentence as the writer first wrote it." }],
    updatedAt: "2026-08-21T00:00:00.000Z",
  },
];
const darkroomExport = await backup.attachIntegrity(darkroomBundle);
test.assert(darkroomExport.formatVersion === 7, "a backup carrying a darkroom exports as v7");
const darkroomValidation = backup.validateBackup(darkroomExport);
if (!darkroomValidation.valid) console.error(darkroomValidation.errors.join("\n"));
test.assert(darkroomValidation.valid, "a v7 bundle with a darkroom record satisfies the schema");
test.assert(
  (await backup.verifyIntegrity(darkroomExport)).valid,
  "the darkroom record is covered by the SHA-256 content hash"
);
test.assert(
  darkroomExport.counts.darkroomRecords === 1,
  "the darkroom records are counted like every other durable collection"
);

// A disk where nothing was ever developed still says so explicitly, so
// "no darkroom" and "the exporter forgot the field" cannot look the same.
test.assert(
  Array.isArray(sceneless.darkroomRecords) && sceneless.darkroomRecords.length === 0,
  "a disk with no darkroom exports an explicit empty set"
);

// A record pointing at a file this backup does not carry would restore a
// darkroom belonging to nothing. That is a broken backup, not a warning.
const darkroomOrphan = structuredClone(darkroomExport);
darkroomOrphan.darkroomRecords[0].documentId = "file-that-is-gone";
test.assert(
  !backup.validateBackup(darkroomOrphan).valid,
  "a darkroom record whose document is missing is rejected"
);

// One record per document is the whole identity model — the document IS the
// key — so two records for one document is a corrupt bundle.
const darkroomDuplicate = structuredClone(darkroomExport);
darkroomDuplicate.darkroomRecords.push(structuredClone(darkroomExport.darkroomRecords[0]));
test.assert(
  !backup.validateBackup(darkroomDuplicate).valid,
  "two darkroom records for one document are rejected"
);

// Older backups predate the field entirely and must stay importable.
test.assert(
  backup.validateBackup({ ...v2Fixture }).valid,
  "v2 backups with no darkroom field stay importable"
);

// On import the record follows its document into the new id space. It has no
// id of its own, so the two pointers are the whole remap.
const importedDarkroom = backup.remapBackup(darkroomExport);
const darkroomChild = importedDarkroom.files.find((file) => file.name === "Child Chat");
test.assert(
  importedDarkroom.darkroomRecords.length === 1
    && importedDarkroom.darkroomRecords[0].documentId === darkroomChild.id,
  "an imported darkroom record points at the remapped document"
);
test.assert(
  importedDarkroom.darkroomRecords[0].projectId === importedDarkroom.project.id,
  "and at the imported project"
);
test.assert(
  importedDarkroom.darkroomRecords[0].negative === "The sentence as the writer first wrote it."
    && importedDarkroom.darkroomRecords[0].versions.length === 1,
  "the negative and the version chain survive the import unchanged"
);

// A record whose document did not come across never reaches the remap: the
// import refuses the whole bundle rather than restoring a darkroom that
// belongs to nothing.
const darkroomStray = structuredClone(darkroomExport);
darkroomStray.darkroomRecords[0].documentId = "file-that-is-gone";
let strayRefused = false;
try {
  backup.remapBackup(darkroomStray);
} catch (error) {
  strayRefused = String(error?.message || "").includes("darkroom record references missing file");
}
test.assert(strayRefused, "importing a darkroom record with no surviving document is refused");

// The assembler is the one place a Project-level durable collection is
// declared, and the writer is the one place it lands. Both must name it.
test.assertIncludes(
  read("app/core/project-backup-assembler.js"),
  "readCollection(source.getDarkroomRecords, projectId)",
  "the single assembler reads the darkroom like every other durable collection"
);
test.assertIncludes(
  exportImportSource,
  "async function collectProjectDarkroomRecords(projectId)",
  "the export reads the darkroom records out of keyval"
);
test.assertIncludes(
  exportImportSource,
  "`darkroom:${String(imported.project.id)}:${String(documentId)}`",
  "the import writes them back under the imported project's own key"
);

test.finish();
