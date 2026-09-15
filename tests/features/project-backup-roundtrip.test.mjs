// Real Project Backup round trip: seed a complex project, export through the
// recovery path, verify integrity, validate structure, remap ids, and confirm
// every relation still points at an existing object after the import.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createBackupVm, seedComplexProject } from "../helpers/backup-vm.mjs";

const test = createFeatureTest("project-backup-roundtrip");

{
  const runtime = createBackupVm(seedComplexProject());
  const bundle = await runtime.recovery.exportRecoveryProjectBackup("p1");
  test.assert(bundle !== null, "the complex project exports");
  test.assert((await runtime.backup.verifyIntegrity(bundle)).valid === true, "integrity verification passes on the exported bundle");
  test.assert(runtime.backup.validateBackup(bundle).valid === true, "structural validation passes on the exported bundle");

  let sequence = 0;
  const remapped = runtime.backup.remapBackup(bundle, {
    uuid: () => `new-${(sequence += 1)}`,
    now: "2026-08-10T00:00:00.000Z",
  });

  const folderIds = new Set(remapped.folders.map((item) => item.id));
  const fileIds = new Set(remapped.files.map((item) => item.id));
  const scrapIds = new Set(remapped.scraps.map((item) => item.id));
  const referenceIds = new Set(remapped.references.map((item) => item.id));
  const revisionIds = new Set((remapped.documentRevisions || []).map((item) => item.id));

  test.assert(remapped.project.id !== "p1", "the project gets a fresh id on import");
  test.assert(remapped.files.every((file) => !file.folderId || folderIds.has(file.folderId)), "every file.folderId points at a remapped folder");
  test.assert(remapped.files.every((file) => !file.aliasTarget?.id || fileIds.has(file.aliasTarget.id)), "alias targets point at remapped files");
  test.assert(remapped.scraps.every((scrap) => !scrap.sourceFileId || fileIds.has(scrap.sourceFileId)), "scrap -> file relations resolve");
  test.assert(remapped.scraps.every((scrap) => !scrap.sourceReferenceId || referenceIds.has(scrap.sourceReferenceId)), "scrap -> reference relations resolve");
  test.assert(remapped.projectCdItems.every((item) => !item.sourceFileId || fileIds.has(item.sourceFileId)), "Project CD -> document relations resolve");
  test.assert(
    (remapped.documentRevisions || []).every((revision) => !revision.parentRevisionId || revisionIds.has(revision.parentRevisionId)),
    "revision parent chains resolve"
  );
  test.assert((remapped.documentRevisions || []).every((revision) => fileIds.has(revision.documentId)), "revisions point at remapped documents");
  test.assert(remapped.project.quickDraft.workspace.projectDocId === remapped.files[0].id || remapped.files.some((file) => file.id === remapped.project.quickDraft.workspace.projectDocId), "Quick Draft workspace points at a remapped document");

  // Document tabs name project records under keys the generic relation table
  // does not know, so they crossed an import untouched and went on pointing at
  // the exporting machine. A tab that opened blank was the visible half; the
  // quiet half was a save that found no such file and minted a second one,
  // splitting the writer's manuscript. Every id a tab carries is now either a
  // record that exists here, or empty.
  const importedFileIds = new Set(remapped.files.map((file) => file.id));
  const tabs = remapped.project.documentTabs;
  test.assert(Array.isArray(tabs) && tabs.length === 4, "document tabs survive the import");
  const resolvable = (id) => id === "" || importedFileIds.has(id);
  const manuscriptTab = tabs.find((tab) => tab.role === "manuscript");
  test.assert(
    resolvable(manuscriptTab.backing.id) && resolvable(manuscriptTab.state.activeTextFileId),
    "the manuscript tab's two file ids are remapped or cleared, never foreign",
  );
  test.assert(
    manuscriptTab.backing.id !== "file-1" && manuscriptTab.state.activeTextFileId !== "file-1",
    "no tab keeps the exporting machine's file id",
  );
  test.assert(manuscriptTab.state.body === "正文", "remapping ids does not disturb the writer's own tab text");
  const scratchTab = tabs.find((tab) => tab.role === "scratch_file");
  test.assert(
    resolvable(scratchTab.backing.id) && resolvable(scratchTab.state.activeTextFileId),
    "a projectText-backed tab is remapped too",
  );
  const docMapTab = tabs.find((tab) => tab.app === "docMap");
  test.assert(
    resolvable(docMapTab.state.origin.documentId) && resolvable(docMapTab.state.map.sourceMeta.fileId),
    "a DocMap tab's nested document ids are remapped",
  );
  const webTab = tabs.find((tab) => tab.role === "web_navigation");
  test.assert(
    webTab.backing.id === "not-a-record-id" && webTab.backing.url === "https://example.invalid/",
    "a backing type with no project-side referent is left alone",
  );

}

// v6: the pictures travel, and the figures stay attached to them.
//
// Before v6 a backup carried no pictures at all. A restored disk lost every
// Question Sheet photo, left each Scrapbook clip pointing at a picture that
// was not there, and turned every manuscript figure back into raw
// `![](aisystem6-image:...)` markdown -- silently, the way the darkroom was
// lost before v5.
{
  const runtime = createBackupVm(seedComplexProject());
  const bundle = await runtime.recovery.exportRecoveryProjectBackup("p1");
  test.assert(
    Array.isArray(bundle.imageAttachments) && bundle.imageAttachments.length === 1,
    "the export carries the project's pictures",
  );
  const exported = bundle.imageAttachments[0];
  test.assert(!!exported.originalDataUrl, "the original travels, not only the preview");
  test.assert(!!exported.previewDataUrl, "and the preview travels with it");

  const remapped = runtime.backup.remapBackup(bundle, { uuid: (() => { let n = 0; return () => `new-${++n}`; })() });
  const picture = (remapped.imageAttachments || [])[0];
  test.assert(!!picture, "a picture survives the identity remap");
  test.assert(picture.id !== "img-1", "and takes a fresh id, so importing one disk twice cannot collide");
  test.assert(picture.projectId === remapped.project.id, "the picture belongs to the imported project");
  test.assert(picture.originalDataUrl === exported.originalDataUrl, "the bytes are untouched by the remap");

  // The pointer no generic remapper can see: a citation inside prose.
  const manuscript = remapped.files.find((file) => file.name === "manuscript.md");
  test.assert(
    manuscript.body.includes(`aisystem6-image:${picture.id}`),
    "a figure cited in the manuscript follows its picture to the new id",
  );
  test.assert(
    !manuscript.body.includes("aisystem6-image:img-1"),
    "and no citation is left pointing at the id the picture had on the other disk",
  );

  const scrap = remapped.scraps.find((item) => Array.isArray(item.images) && item.images.length);
  if (scrap) {
    test.assert(scrap.images.includes(picture.id), "a scrap's picture list follows the remap too");
  }
}

test.finish();
