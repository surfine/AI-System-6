// The Finder row vocabulary lives once in app/shared/finder-rows.js. This
// contract executes the real module against stubbed selection state for the
// grammar invariants the six builders depend on, and pins that the Project
// Hard Disk and Documents windows actually consume it instead of growing a
// seventh copy.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import vm from "node:vm";

const test = createFeatureTest("finder-rows");

const api = vm.runInContext(`
  const selectedProjectRootItemId = "root-1";
  const selectedDocumentFolderId = "folder-1";
  const selectedChatFileId = "file-1";
  const selectedProjectReferenceId = "ref-1";
  const selectedDocumentItemKeys = new Set(["folder:folder-2", "file:file-2", "projectReference:ref-2"]);
  const documentSelectionKey = (type, id) => type + ":" + id;
  // Coarse pointer: the fine-pointer media query reports unmatched.
  const window = { matchMedia: () => ({ matches: false }) };
  const hints = [];
  const revealSelectOpenTapHint = (el, options) => hints.push({ el, options });
  ${read("app/shared/finder-rows.js")}
  ;({ finderItemShape, finderItemSelected, stampFinderItemDataset, finderTapSelect, finderCoarsePointer, finderPrecisePointer, hints })
`, vm.createContext({}));

const { finderItemShape, finderItemSelected, stampFinderItemDataset, finderTapSelect, finderCoarsePointer, finderPrecisePointer, hints } = api;

test.assert(finderCoarsePointer() === true && finderPrecisePointer() === false, "with the fine-pointer query unmatched, the surface is coarse, not precise");

test.assert(finderItemShape({ type: "finder-root" }).isSystem, "finder-root is the system shape");
const folderShape = finderItemShape({ type: "folder" });
test.assert(folderShape.isFolder && folderShape.selectionType === "folder" && folderShape.dragType === "document-folder", "a folder selects and drags as document-folder");
const refShape = finderItemShape({ type: "projectReference" });
test.assert(refShape.isReference && refShape.selectionType === "projectReference" && refShape.isFile === false, "a project reference is its own selection type, not a file");

test.assert(finderItemSelected({ id: "root-1" }, finderItemShape({ type: "finder-root" })), "system selection reads the root slot");
test.assert(finderItemSelected({ id: "folder-1" }, folderShape), "a folder is selected through its primary slot");
test.assert(finderItemSelected({ id: "folder-2" }, folderShape), "and through multi-select membership");
test.assert(!finderItemSelected({ id: "folder-9" }, folderShape), "an unrelated folder is not selected");

const el = { dataset: {} };
stampFinderItemDataset(el, { id: "f1", projectId: "p1" }, folderShape);
test.assert(
  el.dataset.dragType === "document-folder" && el.dataset.dropTarget === "document-folder"
    && el.dataset.documentItemType === "folder" && el.dataset.documentItemId === "f1" && el.dataset.folderId === "f1",
  "a folder row carries the full drag/drop/selection dataset",
);
const fileEl = { dataset: {} };
stampFinderItemDataset(fileEl, { id: "f2", projectId: "p1" }, finderItemShape({ type: "chat" }));
test.assert(fileEl.dataset.dragType === "file" && fileEl.dataset.dropTarget === undefined && !fileEl.dataset.folderId, "a file row drags but is not a drop target");
const sysEl = { dataset: {} };
stampFinderItemDataset(sysEl, { id: "root-1" }, finderItemShape({ type: "finder-root" }));
test.assert(sysEl.dataset.projectRootId === "root-1" && !sysEl.dataset.dragType, "a system root stamps only its root id");

// The tap grammar: coarse pointer + already selected + no modifier opens;
// anything else selects. The stub window is coarse (matchMedia reports the
// fine-pointer media query as unmatched).
const opens = [];
const selects = [];
const row = { dataset: {} };
const plain = { metaKey: false, ctrlKey: false, shiftKey: false, detail: 1 };
finderTapSelect(plain, row, { alreadySelected: true, onOpen: () => opens.push("plain"), onSelect: () => selects.push("plain") });
finderTapSelect({ metaKey: true, ctrlKey: false, shiftKey: false, detail: 1 }, row, { alreadySelected: true, onOpen: () => opens.push("mod"), onSelect: () => selects.push("mod") });
finderTapSelect({ metaKey: false, ctrlKey: false, shiftKey: false, detail: 1 }, row, { alreadySelected: false, onOpen: () => opens.push("fresh"), onSelect: () => selects.push("fresh") });
test.assert(opens.join(",") === "plain", "only a plain tap on the already-selected item opens (touch double-click)");
test.assert(selects.join(",") === "mod,fresh", "everything else routes through the window's selection");
test.assert(hints.length === 1, "only the plain tap that selected gets the select-then-open hint");

// And the vocabulary is really consumed: the manifest ships the module eager,
// and both windows' builders call it instead of re-spelling the grammar.
test.assert(read("tooling/runtime-manifest.mjs").includes('"app/shared/finder-rows.js"'), "the manifest ships finder-rows eager with its consumers");
for (const [file, uses] of [["app/features/documents-chat.js", 4], ["app/features/project-disk.js", 2]]) {
  test.assert(
    (read(file).match(/finderTapSelect\(/g) || []).length >= uses,
    `${file} routes its rows through the shared tap grammar`,
  );
}
// The desk-wide pointer question has one home too: the live Finder-grammar
// consumers route through the helpers instead of spelling matchMedia inline.
for (const file of ["app/core/wireup.js", "app/core/finder-drag.js", "app/features/file-disk.js", "app/features/desk-find.js", "app/features/export-import.js", "app/features/findpath.js"]) {
  test.assert(
    /finder(Coarse|Precise)Pointer\(/.test(read(file)),
    `${file} asks the shared pointer helpers`,
  );
  test.assert(
    !read(file).includes('(hover: hover) and (pointer: fine)'),
    `${file} no longer spells the media query inline`,
  );
}

test.finish();
