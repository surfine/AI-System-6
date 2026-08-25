// Project Hard Disk backup must fail closed: version-history reads are user
// data, so an IndexedDB read failure aborts the whole export instead of
// producing a "valid but incomplete" backup with a clean SHA-256.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("backup-fail-closed");
const backupSource = read("app/core/project-disk-backup.js");
const assemblerSource = read("app/core/project-backup-assembler.js");
const exportImportSource = read("app/features/export-import.js");

function makeContext({ readRevisionsFails = false } = {}) {
  const keyval = new Map();
  const state = { opened: 0 };
  const context = vm.createContext({
    crypto: webcrypto,
    structuredClone,
    TextEncoder,
    Uint8Array,
    URL,
    Blob,
    Date,
    window: {
      location: { protocol: "http:", hostname: "x" },
      AISystem6Config: {},
      AISystem6BuildInfo: { version: "1.0.26", build: "20260808.9" },
    },
    projectCdGridEl: null,
    getActiveProject: () => ({ id: "p1", name: "P" }),
    activeProjectId: "p1",
    activeTextFileId: "doc-1",
    teachTextWorkflowState: "final",
    currentLanguage: "en",
    projects: [{ id: "p1", name: "P" }],
    chatFolders: [],
    chatFiles: [{ id: "doc-1", projectId: "p1", type: "text", name: "Draft.md", body: "# Draft", folderId: null }],
    scraps: [],
    imageAttachments: [],
    trashItems: [],
    projectCdItems: [],
    projectReferences: [],
    selectedProjectCdItemId: "",
    selectedProjectCdItemIds: new Set(),
    storageVersion: "3",
    indexedDbVersion: 3,
    appVersionInfo: { version: "1.0.26", build: "20260808.9" },
    keyvalStoreName: "keyval",
    idbRequest: (request) => request,
    openAppDb: async () => {
      state.opened += 1;
      if (readRevisionsFails) throw new Error("forced IndexedDB read failure");
      return {
        close: () => {},
        transaction: () => ({
          objectStore: () => ({
            getAllKeys: async () => [...keyval.keys()],
            get: async (key) => keyval.get(key),
          }),
        }),
      };
    },
    setStatus: (message) => { state.status = message; },
    t: (key, ...args) => `${key}:${args.join(",")}`,
    sanitizeFilename: (name) => name,
    countMarkdownWords: (text) => String(text || "").length,
  });
  vm.runInContext(backupSource, context);
  vm.runInContext(assemblerSource, context);
  vm.runInContext(exportImportSource, context);
  return { context, state, keyval };
}

{
  // Version history read fails -> the whole export fails, no bundle produced.
  const { context, state } = makeContext({ readRevisionsFails: true });
  const result = await context.buildProjectDiskExport(context.getActiveProject()).then(
    (bundle) => ({ ok: true, bundle }),
    (error) => ({ ok: false, code: error?.code, name: error?.name })
  );
  test.assert(result.ok === false, "a revision read failure rejects the export");
  test.assert(
    result.code === "BACKUP_READ_FAILED" && result.name === "ProjectBackupError",
    "the export rejects with ProjectBackupError / BACKUP_READ_FAILED"
  );
  test.assert(
    state.status === undefined,
    "the exporter itself does not swallow the error (caller shows it)"
  );
}

{
  // Healthy reads -> the bundle carries the revisions and passes integrity.
  const { context, keyval } = makeContext();
  keyval.set("documentRevisions:p1:doc-1", [
    { id: "rev-1", projectId: "p1", documentId: "doc-1", body: "v1", contentHash: "a", operation: "save", origin: "user", parentRevisionId: "", phase: "draft", createdAt: "2026-08-08T00:00:00.000Z" },
    { id: "rev-2", projectId: "p1", documentId: "doc-1", body: "v2", contentHash: "b", operation: "save", origin: "user", parentRevisionId: "rev-1", phase: "final", createdAt: "2026-08-08T00:01:00.000Z" },
  ]);
  const bundle = await context.buildProjectDiskExport(context.getActiveProject());
  test.assert(!!bundle && bundle.formatVersion === 6, "a healthy export produces a v6 bundle");
  test.assert(
    Array.isArray(bundle.documentRevisions) && bundle.documentRevisions.length === 2,
    "the bundle carries the stored revisions"
  );
  const verification = await context.window.AISystem6ProjectDiskBackup.verifyIntegrity(bundle);
  test.assert(verification.valid, "the healthy bundle passes integrity verification");
}

{
  // 文字亮室's record is read out of keyval the same way, and this executes the
  // real reader rather than asserting that it exists. The two halves are proven
  // separately on purpose: that a record can be WRITTEN was verified in a
  // browser on a cold desk, because no contract could see a module that never
  // loaded; that a written record REACHES the backup is verified here.
  const { context, keyval } = makeContext();
  keyval.set("darkroom:p1:doc-1", {
    schemaVersion: 1,
    negative: "The sentence as the writer first wrote it.",
    composite: "The sentence after one pass.",
    adjustmentLayers: [{ kind: "mingming", enabled: true }],
    protectedRanges: [{ start: 0, end: 8 }],
    versions: [{ key: "v1", text: "The sentence as the writer first wrote it." }],
    updatedAt: "2026-08-22T00:00:00.000Z",
  });
  // Another project's darkroom must not ride along in this project's backup.
  keyval.set("darkroom:p2:doc-9", { schemaVersion: 1, negative: "Someone else's draft.", adjustmentLayers: [], protectedRanges: [], versions: [] });

  const bundle = await context.buildProjectDiskExport(context.getActiveProject());
  test.assert(
    Array.isArray(bundle.darkroomRecords) && bundle.darkroomRecords.length === 1,
    "the bundle carries this project's darkroom record, and only this project's"
  );
  const carried = bundle.darkroomRecords[0];
  test.assert(carried.documentId === "doc-1", "the document id is recovered from the key, not trusted from inside the value");
  test.assert(
    carried.negative === "The sentence as the writer first wrote it." && carried.versions.length === 1,
    "the negative and the version chain survive the export"
  );
  test.assert(
    (await context.window.AISystem6ProjectDiskBackup.verifyIntegrity(bundle)).valid,
    "and the darkroom record is covered by the integrity hash"
  );
}

test.finish();
