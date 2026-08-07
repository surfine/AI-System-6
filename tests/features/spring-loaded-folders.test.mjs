// Spring-loaded Folders: hovering a Finder folder for ~650ms while dragging a
// project file, folder, or Reader selection temporarily opens that folder so
// the drag can continue into the next level. The navigation is in-memory only
// (no saveDeskState, no Working Session, no storage), only activates on
// precise pointers, and snaps the Finder back to the origin on drop or cancel.

import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("spring-loaded-folders");
const dragDrop = read("app/core/drag-drop.js");
const reader = read("app/features/reader.js");
const manifest = read("scripts/runtime-manifest.mjs");

// ---- Structure contract ----------------------------------------------------
test.assertIncludes(dragDrop, "springFolderDelayMs = 650", "the spring delay is a named 650ms constant");
test.assertIncludes(dragDrop, "activeInternalDragData", "the active drag payload lives only in memory");
test.assertIncludes(dragDrop, "springFolderTimer", "the spring timer is module state");
test.assertIncludes(dragDrop, "springFolderSession", "the spring session is module state");
test.assertIncludes(dragDrop, "originFolderId", "the session remembers the starting Finder path");
test.assertIncludes(dragDrop, "currentTargetId", "the session tracks the hovered folder");
test.assertIncludes(dragDrop, "opened", "the session tracks whether a folder opened");
test.assertIncludes(dragDrop, 'matchMedia("(hover: hover) and (pointer: fine)")', "spring folders require a precise pointer");
test.assertIncludes(dragDrop, '"document-folder"', "only Finder folder targets spring open");
test.assertIncludes(dragDrop, 'dropTarget.dataset.dropTarget === "document-folder"', "spring only arms on Finder folder targets");
test.assertIncludes(dragDrop, 'addEventListener("dragenter"', "the spring timer also arms on dragenter so a stationary hover opens");
test.assertIncludes(dragDrop, '"clipping-selection"', "Reader clipping drags can spring folders too");
test.assertIncludes(dragDrop, "isDocumentFolderDescendant", "spring validation reuses the existing tree check");
test.assertIncludes(dragDrop, "openDocumentFolder", "spring navigation reuses the documents Finder opener");
test.assertIncludes(dragDrop, "openProjectFinderFolder", "spring navigation reuses the Project Disk opener");
test.assertIncludes(dragDrop, "handleDropToDocumentFolder(dragData, springTargetFolderId)", "the drop reuses the existing folder-drop handler");
test.assertIncludes(dragDrop, "endSpringFolderSession()", "dragend always finishes a spring session");
test.assertIncludes(dragDrop, "window.AISystem6DragDrop", "the drag layer exposes the spring hooks");
test.assertIncludes(reader, "beginSpringFolderSession", "Reader registers its clipping payload with the spring layer");
test.assertIncludes(reader, "sourceTitle", "Reader clipping payload keeps its source title");
test.assertIncludes(reader, "sourceUrl", "Reader clipping payload keeps its source URL");
test.assertIncludes(reader, "before:", "Reader clipping payload keeps its before context");
test.assertIncludes(reader, "after:", "Reader clipping payload keeps its after context");
test.assertIncludes(manifest, '"app/core/drag-drop.js"', "the drag layer stays in the startup bundle");
test.assertNotIncludes(
  manifest.slice(manifest.indexOf("lazyRuntimePaths = [")),
  '"app/core/drag-drop.js"',
  "the drag layer is not lazy"
);

const springNavigateBlock = dragDrop.slice(
  dragDrop.indexOf("function springNavigateToFolder"),
  dragDrop.indexOf("function springRestoreOrigin")
);
test.assertNotIncludes(springNavigateBlock, "setStatus(", "spring navigation never writes status text");
test.assertNotIncludes(springNavigateBlock, "saveDeskState(", "spring navigation never saves desk state");

// ---- Runtime behavior ------------------------------------------------------
// Runs the real drag-drop module in a vm with a fake document, then drives the
// registered dragstart/dragover/dragleave/drop/dragend handlers and observes
// actual state changes (opened folders, restored paths, saved-state count).

const folders = [
  { id: "f-root", projectId: "p-1", name: "Root", parentId: null },
  { id: "f-a", projectId: "p-1", name: "Folder A", parentId: "f-root" },
  { id: "f-b", projectId: "p-1", name: "Folder B", parentId: "f-a" },
];
const parentOf = { "f-root": null, "f-a": "f-root", "f-b": "f-a" };
const isDescendant = (folderId, possibleAncestorId) => {
  let current = parentOf[folderId];
  while (current) {
    if (current === possibleAncestorId) return true;
    current = parentOf[current];
  }
  return false;
};

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) {
    names.forEach((name) => this.values.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }
}

function makeFinderElement(dataset) {
  const element = {
    dataset: { ...dataset },
    classList: new FakeClassList(),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
  };
  element.closest = (selector) => {
    if (selector === "[data-drag-type]" && element.dataset.dragType) return element;
    if (selector === "[data-drop-target]" && element.dataset.dropTarget) return element;
    return null;
  };
  return element;
}

function makeFakeDocument() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(type, callback) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(callback);
    },
    removeEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function buildContext(pointerFine) {
  const fakeDocument = makeFakeDocument();
  const state = {
    opened: [],
    renders: [],
    saves: 0,
    drops: [],
  };
  const context = vm.createContext({
    window: {
      matchMedia: (query) => ({ matches: pointerFine, media: query }),
    },
    document: fakeDocument,
    setTimeout,
    clearTimeout,
    activeProjectId: "p-1",
    selectedFolderId: "all",
    selectedChatFileId: null,
    selectedDocumentFolderId: null,
    selectedProjectRootItemId: null,
    selectedDocumentItemKeys: new Set(),
    selectedProjectCdItemIds: new Set(),
    selectedScrapIds: new Set(),
    selectedMountedFileNames: new Set(),
    documentSelectionKey: (type, id) => `${type}:${id}`,
    selectDocumentItem: () => {},
    getSelectedDocumentItems: () => [{ type: "file", id: "file-1" }],
    getSelectedProjectCdItems: () => [],
    getSelectedScraps: () => [],
    getProjectFolders: () => folders,
    isDocumentFolderDescendant: isDescendant,
    renderDocuments: () => state.renders.push("documents"),
    renderProjectDisks: () => state.renders.push("projectDisks"),
    clearDocumentSelection: () => {},
    saveDeskState: () => { state.saves += 1; },
    handleDropToDocumentFolder: (data, folderId) => state.drops.push({ data, folderId }),
    handleDropToTrash: () => {},
    withScripting: () => {},
    runDropletDrop: () => {},
    withFinderObjects: () => {},
    createClippingFile: () => null,
    insertClippingIntoEditor: () => {},
    handleDropToProject: () => {},
    attachProjectFileToNextClioTalkRun: () => {},
    moveItemsToTrash: () => {},
    moveFileToTrashById: () => {},
    moveDocumentFolderToTrashById: () => {},
    moveSelectedProjectToTrash: () => {},
    removeMountedFilesToTrash: () => {},
    ejectTextDisk: () => {},
    setStatus: () => {},
    t: (key) => key,
    renderProjectCd: () => {},
    renderScraps: () => {},
    renderMountedTextDisk: () => {},
  });
  context.openDocumentFolder = (folderId) => {
    state.opened.push(["doc", folderId]);
    context.selectedFolderId = folderId;
    state.selectedFolderId = folderId;
  };
  context.openProjectFinderFolder = (folderId) => {
    state.opened.push(["disk", folderId]);
    context.selectedFolderId = folderId;
    state.selectedFolderId = folderId;
  };
  return { context, fakeDocument, state };
}

function makeDataTransfer(payload) {
  return {
    types: ["application/json"],
    dropEffect: "",
    effectAllowed: "",
    setData: () => {},
    getData: (type) => (type === "application/json" ? payload : ""),
  };
}

function dragStartEvent(element, payload) {
  return {
    target: element,
    clientX: 30,
    clientY: 30,
    dataTransfer: makeDataTransfer(payload),
    preventDefault: () => {},
  };
}

function dragOverEvent(element, payload) {
  return dragStartEvent(element, payload);
}

function dragLeaveEvent(element, payload) {
  return { ...dragStartEvent(element, payload), clientX: 300, clientY: 300 };
}

function dragEndEvent(element) {
  return { target: element, clientX: 30, clientY: 30, preventDefault: () => {} };
}

function dropEvent(element, payload) {
  return { ...dragStartEvent(element, payload), clientX: 30, clientY: 30 };
}

const filePayload = JSON.stringify({ type: "file", id: "file-1", projectId: "p-1", items: [{ type: "file", id: "file-1" }] });
const folderPayload = JSON.stringify({ type: "document-folder", id: "f-a", projectId: "p-1", items: [{ type: "document-folder", id: "f-a" }] });

const fileEl = makeFinderElement({ dragType: "file", id: "file-1", projectId: "p-1", documentItemType: "file", documentItemId: "file-1" });
const folderAEl = makeFinderElement({ dragType: "document-folder", id: "f-a", projectId: "p-1", dropTarget: "document-folder", folderId: "f-a", documentItemType: "folder", documentItemId: "f-a" });
const folderBEl = makeFinderElement({ dragType: "document-folder", id: "f-b", projectId: "p-1", dropTarget: "document-folder", folderId: "f-b", documentItemType: "folder", documentItemId: "f-b" });
const folderADragEl = makeFinderElement({ dragType: "document-folder", id: "f-a", projectId: "p-1", documentItemType: "folder", documentItemId: "f-a" });
const foreignFileEl = makeFinderElement({ dragType: "file", id: "file-9", projectId: "p-2", documentItemType: "file", documentItemId: "file-9" });

const harness = buildContext(true);
vm.runInContext(dragDrop, harness.context);
harness.context.initDragAndDrop();
const handlers = harness.fakeDocument.handlers;
const state = harness.state;
const context = harness.context;
const dragstart = handlers.get("dragstart")[0];
const dragenter = handlers.get("dragenter")[0];
const dragover = handlers.get("dragover")[0];
const dragleave = handlers.get("dragleave")[0];
const drop = handlers.get("drop")[0];
const dragend = handlers.get("dragend")[0];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Under 650ms the folder must not open.
state.opened.length = 0;
dragstart(dragStartEvent(fileEl, filePayload));
dragover(dragOverEvent(folderAEl, filePayload));
await wait(300);
test.assert(
  state.opened.length === 0,
  "a folder never opens before the 650ms spring delay"
);
dragend(dragEndEvent(fileEl));

// Leaving the folder cancels a timer that has not fired yet.
state.opened.length = 0;
dragstart(dragStartEvent(fileEl, filePayload));
dragover(dragOverEvent(folderAEl, filePayload));
dragleave(dragLeaveEvent(folderAEl, filePayload));
await wait(760);
test.assert(
  state.opened.length === 0,
  "dragleave cancels an unopened spring timer"
);
dragend(dragEndEvent(fileEl));

// After 650ms the target folder opens on both Finder surfaces. A stationary
// pointer only fires dragenter, so that path arms the timer too.
state.opened.length = 0;
dragstart(dragStartEvent(fileEl, filePayload));
dragenter(dragOverEvent(folderAEl, filePayload));
await wait(760);
test.assert(
  state.opened.some(([surface, id]) => surface === "doc" && id === "f-a"),
  "after 650ms the documents Finder opens the target folder"
);
test.assert(
  state.opened.some(([surface, id]) => surface === "disk" && id === "f-a"),
  "the Project Disk Finder follows the same temporary path"
);
test.assert(
  context.getSpringFolderState()?.opened === true,
  "the session records that the folder opened"
);
test.assert(
  state.saves === 0,
  "spring navigation never calls saveDeskState()"
);

// The drag can continue into the next layer.
dragover(dragOverEvent(folderBEl, filePayload));
await wait(760);
test.assert(
  state.opened.some(([surface, id]) => surface === "doc" && id === "f-b"),
  "the drag can continue into the second folder level"
);

// Dropping restores the starting Finder path and uses the final target id.
state.drops.length = 0;
drop(dropEvent(folderBEl, filePayload));
test.assert(
  state.drops.length === 1 && state.drops[0].folderId === "f-b",
  "drop hands the final spring target folder id to the existing drop handler"
);
test.assert(
  context.selectedFolderId === "all" && context.getSpringFolderState() === null,
  "drop restores the starting Finder path and ends the session"
);

// Cancelling (dragend) also restores the starting path.
dragstart(dragStartEvent(fileEl, filePayload));
dragover(dragOverEvent(folderAEl, filePayload));
await wait(760);
dragend(dragEndEvent(fileEl));
test.assert(
  context.selectedFolderId === "all" && context.getSpringFolderState() === null,
  "drag cancel restores the starting Finder path and ends the session"
);
test.assert(
  state.saves === 0,
  "restoring the origin path never calls saveDeskState()"
);

// A folder cannot spring into itself.
state.opened.length = 0;
dragstart(dragStartEvent(folderADragEl, folderPayload));
dragover(dragOverEvent(folderAEl, folderPayload));
await wait(760);
test.assert(
  state.opened.length === 0,
  "a folder never springs into itself"
);
dragend(dragEndEvent(folderADragEl));

// A folder cannot spring into its own descendant.
state.opened.length = 0;
dragstart(dragStartEvent(folderADragEl, folderPayload));
dragover(dragOverEvent(folderBEl, folderPayload));
await wait(760);
test.assert(
  state.opened.length === 0,
  "a folder never springs into its own descendant"
);
dragend(dragEndEvent(folderADragEl));

// A drag from a different project never starts a spring session.
state.opened.length = 0;
dragstart(dragStartEvent(foreignFileEl, JSON.stringify({ type: "file", id: "file-9", projectId: "p-2", items: [] })));
dragover(dragOverEvent(folderAEl, filePayload));
await wait(760);
test.assert(
  state.opened.length === 0 && context.getSpringFolderState() === null,
  "a foreign-project drag never starts a spring session"
);
dragend(dragEndEvent(foreignFileEl));

// Reader clipping-selection payloads can start a session.
const clipPayload = {
  type: "clipping-selection",
  text: "selected text",
  projectId: "p-1",
  sourceType: "web",
  sourceTitle: "Source",
  sourceUrl: "https://example.com/",
  before: "before",
  after: "after",
};
test.assert(
  context.beginSpringFolderSession(clipPayload) === true
    && context.getSpringFolderState()?.originFolderId === "all",
  "a Reader clipping-selection payload can start a spring session"
);
let finishError = null;
try {
  context.endSpringFolderSession();
  context.endSpringFolderSession();
} catch (error) {
  finishError = error;
}
test.assert(
  finishError === null && context.getSpringFolderState() === null,
  "finish is idempotent and calling it twice raises no error"
);

// pointer: coarse never enables spring folders.
const coarseHarness = buildContext(false);
vm.runInContext(dragDrop, coarseHarness.context);
coarseHarness.context.initDragAndDrop();
const coarseHandlers = coarseHarness.fakeDocument.handlers;
coarseHandlers.get("dragstart")[0](dragStartEvent(fileEl, filePayload));
coarseHandlers.get("dragenter")[0](dragOverEvent(folderAEl, filePayload));
coarseHandlers.get("dragover")[0](dragOverEvent(folderAEl, filePayload));
await wait(760);
test.assert(
  coarseHarness.context.getSpringFolderState() === null && coarseHarness.state.opened.length === 0,
  "pointer: coarse devices keep the existing behavior with no spring folders"
);
coarseHandlers.get("dragend")[0](dragEndEvent(fileEl));

test.finish();
