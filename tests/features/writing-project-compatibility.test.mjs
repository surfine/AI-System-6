// Compatibility uses synthetic legacy projects and actual read/write,
// export, remap, import-transaction and citation/record mapping functions.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-project-compatibility");
const modernFields = ["genre", "snapshot", "plan", "editorialTask", "editorialPlan"];
const initialText = "# 旧项目\n\n## 保留节 {#a1b2c3}\n\n旧正文引用 [S2:1]。";

function runtime(seed) {
  const durable = new Map();
  for (const collection of ["projects", "scraps", "trashItems", "chatFolders", "chatFiles", "projectReferences", "imageAttachments", "keyval"]) durable.set(collection, new Map());
  const db = {
    close() {},
    transaction() {
      return { objectStore: (name) => ({
        getAllKeys: () => Promise.resolve([...durable.get(name).keys()]),
        get: (key) => Promise.resolve(durable.get(name).get(key)),
      }) };
    },
  };
  const context = {
    console, crypto: webcrypto, TextEncoder, structuredClone,
    projects: structuredClone(seed.projects), chatFiles: structuredClone(seed.files),
    chatFolders: [], scraps: structuredClone(seed.scraps), projectReferences: [],
    projectCdItems: [], trashItems: [], imageAttachments: [], ragChunks: [], lastRetrievedContextItems: [],
    activeProjectId: seed.projects[0].id, isProjectMounted: true,
    t: (key) => key, saveDeskState: async () => true, markDeskDirty() {},
    renderPipeline() {}, scheduleRenderTasks() {}, updateMenuState() {},
    getActiveProject: () => context.projects.find((project) => project.id === context.activeProjectId),
    currentOutlineMarkdown: (project) => project.outline || "",
    getProjectScraps: () => context.scraps.filter((scrap) => scrap.projectId === context.activeProjectId),
    getProjectFiles: () => context.chatFiles.filter((file) => file.projectId === context.activeProjectId),
    getMountedTextDiskChunks: () => [],
    openAppDb: async () => db, idbRequest: (request) => Promise.resolve(request),
    indexedDbVersion: 3, storageVersion: 2,
    projectsStoreName: "projects", scrapsStoreName: "scraps", trashStoreName: "trashItems",
    chatFoldersStoreName: "chatFolders", chatFilesStoreName: "chatFiles", referenceStoreName: "projectReferences",
    imageAttachmentsStoreName: "imageAttachments", keyvalStoreName: "keyval",
    readWorkingSessionForBackup: async () => null,
    settingsSnapshotPayload: () => ({ startupProjectId: context.activeProjectId }),
    normalizeProjectReferenceForStorage: (reference) => reference,
    uniqueProjectName: (name) => name,
  };
  context.window = context;
  context.AISystem6StorageTransactions = {
    async runTransaction(_db, _names, _mode, operation) {
      const staging = structuredClone(durable);
      await operation({ objectStore: (name) => ({
        put(record, key = record.id) { staging.get(name).set(key, structuredClone(record)); return Promise.resolve(key); },
        get: (key) => Promise.resolve(staging.get(name).get(key)),
      }) });
      for (const [name, records] of staging) durable.set(name, records);
    },
  };
  vm.createContext(context);
  for (const source of ["core/state-stores", "core/run-receipts", "core/markdown", "core/context-retrieval", "core/project-disk-backup", "core/project-backup-assembler", "features/export-import"]) {
    vm.runInContext(read(`app/${source}.js`), context, { filename: `${source}.js` });
  }
  return { context, durable, backup: context.AISystem6ProjectDiskBackup };
}

const legacy = {
  projects: [{ id: "legacy-project", name: "旧项目", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z", questionSheet: "旧问题", outline: initialText, drafts: [{ recordId: "a1b2c3", sectionTitle: "保留节", body: "段落依据 [S2:1]。" }] }],
  files: [{ id: "manuscript-old", projectId: "legacy-project", type: "text", name: "旧项目", label: "final", body: initialText }],
  scraps: [
    { id: "source-one", projectId: "legacy-project", title: "01 第一源", body: "第一来源内容", source: { url: "https://example.invalid/one" } },
    { id: "source-two", projectId: "legacy-project", title: "02 第二源", body: "第二来源内容", source: { url: "https://example.invalid/two" } },
  ],
};
const originalFixture = JSON.stringify(legacy);
const r = runtime(legacy);
const c = r.context;
const project = c.getActiveProject();
for (const field of modernFields) assert.ok(!Object.hasOwn(project, field));
assert.equal(c.AISystem6StateStores.writing.outline(), initialText);
assert.equal(c.markdownDocumentSectionBlocks(initialText)[0].id, "a1b2c3");
const edited = c.replaceMarkdownDocumentSectionBody(initialText, 2, 0, "作者继续编辑，仍依据 [S2:1]。");
await c.AISystem6StateStores.writing.commit((draft) => { draft.projects[0].outline = edited; });
await c.AISystem6StateStores.projects.commit((draft) => { draft.chatFiles.find((file) => file.id === "manuscript-old").body = edited; });
assert.equal(c.AISystem6StateStores.writing.outline(), edited);
test.assert(true, "a project without genre/snapshot/plan reads and edits through real stores and Markdown record functions");

const allocated = c.buildProjectSourceRegistry();
assert.equal(allocated.find((source) => source.key === "scrap:source-one").sourceId, "S1");
assert.equal(allocated.find((source) => source.key === "scrap:source-two").sourceId, "S2");
await c.AISystem6StateStores.projects.commit((draft) => {
  const deleted = draft.scraps.find((scrap) => scrap.id === "source-one");
  draft.scraps = draft.scraps.filter((scrap) => scrap.id !== deleted.id);
  draft.trashItems.push({ id: "deleted-source", projectId: project.id, originalType: "scrap", originalData: deleted });
});
const afterDelete = c.buildProjectSourceRegistry();
assert.equal(afterDelete.find((source) => source.key === "scrap:source-two").sourceId, "S2");
assert.ok(!afterDelete.some((source) => source.sourceId === "S1"));
const bibliography = c.buildSourceBibliography("旧引用 [S1]，有效引用 [S2:1]");
assert.equal(bibliography.find((entry) => entry.sourceId === "S1").missing, true);
assert.equal(bibliography.find((entry) => entry.sourceId === "S2").title, "02 第二源");
assert.equal(c.getSourceRegistryItemForContextItem({ kind: "scrap", id: "source-two" }).item.id, "source-two");
assert.ok(c.getCitingDraftsForSource("scrap:source-two").some((hit) => hit.surface === "draft" && hit.index === 0 && hit.sourceId === "S2"));
test.assert(true, "deleting S1 keeps S2 bound to its original source and reports S1 as missing");

const created = await c.AISystem6RunReceipts.createReceipt({ projectId: project.id, sourceAppId: "writer", intent: "section-draft", inputObjectIds: ["manuscript-old"], extraFields: { sectionRecordId: "a1b2c3" } });
assert.equal(created.ok, true);
await c.AISystem6RunReceipts.finishReceipt(created.receiptId, { status: "completed", outputObjectIds: ["manuscript-old"], destination: "projectDisk" });
const exported = await c.buildProjectDiskExport(project);
assert.ok(exported, "real normal Project Disk export returns a ready bundle");
const serialized = JSON.stringify(exported);
const parsed = JSON.parse(serialized);
assert.equal((await r.backup.verifyIntegrity(parsed)).valid, true);
assert.equal(r.backup.validateBackup(parsed).valid, true);
for (const field of modernFields) assert.ok(!Object.hasOwn(parsed.project, field));
test.assert(true, "normal export serializes the legacy project, receipt and source registry with verified integrity");

// Exercise legacy v1 acceptance as well as today's JSON export/import. Both
// use actual remap and atomic import functions, never a test-written remapper.
const v1 = structuredClone(parsed); v1.formatVersion = 1;
for (const field of ["integrity", "counts", "documentRevisions", "darkroomRecords", "imageAttachments"]) delete v1[field];
assert.equal(r.backup.validateBackup(v1).valid, true);
const importedV1 = await c.remapProjectDiskBackup(v1);
assert.equal(importedV1.documentRevisions.length, 0);
for (const field of modernFields) assert.ok(!Object.hasOwn(importedV1.project, field));
test.assert(true, "legacy v1 Project Disks without new writing metadata remain importable");

const imported = await c.remapProjectDiskBackup(parsed);
const settings = await c.commitImportedProjectAtomically(imported);
assert.equal(settings.activeProjectId, imported.project.id);
assert.equal(settings.startupProjectId, imported.project.id);
assert.equal(r.durable.get("projects").get(imported.project.id).outline, edited);
const importedManuscript = imported.files.find((file) => file.name === "旧项目");
const importedReceipt = imported.files.find((file) => file.artifactKind === "clio-run-record");
assert.ok(importedManuscript.id !== "manuscript-old");
assert.equal(importedReceipt.runReceipt.inputObjectIds[0], importedManuscript.id);
assert.equal(importedReceipt.runReceipt.outputObjectIds[0], importedManuscript.id);
assert.equal(importedReceipt.sectionRecordId, "a1b2c3");
assert.equal(c.markdownDocumentSectionBlocks(importedManuscript.body)[0].id, "a1b2c3");
assert.equal(imported.project.drafts[0].recordId, "a1b2c3");
test.assert(true, "atomic import lands the legacy content and remaps receipt file pointers while keeping Markdown section records");

c.projects = [imported.project]; c.chatFiles = imported.files; c.scraps = imported.scraps;
c.trashItems = imported.trash; c.projectReferences = imported.references; c.activeProjectId = imported.project.id;
const second = imported.scraps.find((scrap) => scrap.title === "02 第二源");
const importedSources = c.buildProjectSourceRegistry();
assert.equal(importedSources.find((source) => source.key === `scrap:${second.id}`).sourceId, "S2", "S2 survives record ID remapping; the old key cannot allocate a new citation number");
const importedBibliography = c.buildSourceBibliography(importedManuscript.body + "\n旧引用 [S1]");
assert.equal(importedBibliography.find((entry) => entry.sourceId === "S2").missing, false);
assert.equal(importedBibliography.find((entry) => entry.sourceId === "S2").url, "https://example.invalid/two");
assert.equal(importedBibliography.find((entry) => entry.sourceId === "S1").missing, true);
assert.equal(c.sourceCitationForContextItem({ kind: "scrap", id: second.id }, 0), "[S2:1]");
assert.ok(c.getCitingDraftsForSource(`scrap:${second.id}`).some((hit) => hit.surface === "draft" && hit.index === 0 && hit.sourceId === "S2"));
await c.AISystem6StateStores.projects.commit((draft) => { draft.scraps.push({ id: "brand-new-source", projectId: imported.project.id, title: "00 新源", body: "新来源" }); });
const newSource = c.buildProjectSourceRegistry().find((source) => source.key === "scrap:brand-new-source");
assert.ok(!["S1", "S2"].includes(newSource.sourceId), "a deleted citation allocation remains reserved after import");
assert.equal(c.AISystem6StateStores.writing.outline(), edited);
assert.equal(JSON.stringify(legacy), originalFixture, "the original fixture and real projects remain untouched");
test.assert(true, "after import S2 still resolves to the same source and section record; deleted S1 is never reused");

// Recovery of the deleted source uses its imported Trash identity, so the
// old S1 slot must point at that remapped identity rather than a foreign id.
const trashSource = imported.trash.find((item) => item.originalType === "scrap");
await c.AISystem6StateStores.projects.commit((draft) => {
  draft.scraps.push(trashSource.originalData);
  draft.trashItems = draft.trashItems.filter((item) => item.id !== trashSource.id);
});
const restoredSources = c.buildProjectSourceRegistry();
assert.equal(restoredSources.find((source) => source.key === `scrap:${trashSource.originalData.id}`).sourceId, "S1");
assert.equal(restoredSources.find((source) => source.key === `scrap:${second.id}`).sourceId, "S2");
test.assert(true, "restoring a deleted source from imported Trash restores S1 without moving S2");

{
  const slim = runtime({ projects: [{ id: "simple", name: "两条源", outline: "正文 [S2]", drafts: [] }], files: [], scraps: [
    { id: "first", projectId: "simple", title: "01", body: "甲" },
    { id: "second", projectId: "simple", title: "02", body: "乙" },
  ] });
  const sc = slim.context;
  sc.buildProjectSourceRegistry();
  await sc.AISystem6StateStores.projects.commit((draft) => { draft.scraps = draft.scraps.filter((scrap) => scrap.id !== "first"); });
  const disk = await sc.buildProjectDiskExport(sc.getActiveProject());
  const importedSimple = await sc.remapProjectDiskBackup(JSON.parse(JSON.stringify(disk)));
  sc.projects = [importedSimple.project]; sc.scraps = importedSimple.scraps; sc.activeProjectId = importedSimple.project.id;
  assert.equal(sc.buildProjectSourceRegistry()[0].sourceId, "S2");
  await sc.AISystem6StateStores.projects.commit((draft) => { draft.scraps.push({ id: "third", projectId: importedSimple.project.id, title: "00", body: "丙" }); });
  assert.equal(sc.buildProjectSourceRegistry().find((source) => source.key === "scrap:third").sourceId, "S3");
  assert.equal(sc.buildSourceBibliography("[S1]")[0].missing, true);
  test.assert(true, "an unbound missing S1 remains a tombstone after import; a new source gets S3");
}

{
  const sharedId = "identity:with:colons";
  const typed = {
    format: "ai-system-6-project-disk", formatVersion: 1,
    project: { id: "typed", name: "分类型映射", sourceRegistry: { allocations: {
      [`file:${sharedId}`]: "S1", [`scrap:${sharedId}`]: "S2", [`reference:${sharedId}`]: "S3",
      "textdisk:book:one.md": "S4", "scrap:missing:unchanged": "S5",
    }, nextN: 6 } },
    folders: [], files: [{ id: sharedId, projectId: "typed", type: "text", name: "文件", body: "原文 [S2]" }],
    scraps: [{ id: sharedId, projectId: "typed", title: "摘录", body: "摘录 [S3]" }],
    references: [{ id: sharedId, projectId: "typed", name: "参考", body: "参考 [S1]", chunks: [] }],
    trash: [], projectCdItems: [],
  };
  let sequence = 0;
  const remapped = r.backup.remapBackup(typed, { uuid: () => `mapped-${++sequence}` });
  const allocations = remapped.project.sourceRegistry.allocations;
  assert.equal(allocations[`file:${remapped.files[0].id}`], "S1");
  assert.equal(allocations[`scrap:${remapped.scraps[0].id}`], "S2");
  assert.equal(allocations[`reference:${remapped.references[0].id}`], "S3");
  assert.equal(new Set([remapped.files[0].id, remapped.scraps[0].id, remapped.references[0].id]).size, 3);
  assert.equal(allocations["textdisk:book:one.md"], "S4");
  assert.equal(allocations["scrap:missing:unchanged"], "S5");
  assert.equal(remapped.project.sourceRegistry.nextN, 6);
  assert.equal(remapped.files[0].body, "原文 [S2]");
  assert.equal(remapped.scraps[0].body, "摘录 [S3]");
  assert.equal(remapped.references[0].body, "参考 [S1]");
  assert.ok(!Object.hasOwn(allocations, `file:${sharedId}`));
  test.assert(true, "typed mappings handle colons and cross-collection ID collisions while retaining missing/textdisk keys and citation prose");
}

test.finish();
