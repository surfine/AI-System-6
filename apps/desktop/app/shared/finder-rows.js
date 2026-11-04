// Finder row vocabulary, once.
//
// Six builders across the Project Hard Disk and Documents windows used to
// re-implement the same four facts about a Finder item: which kind it is,
// whether it is selected, which dataset keys the drag and drop system reads,
// and the single-tap/double-tap grammar (tap a selected row on touch to open
// it, plain clicks get the select-then-open hint). Each copy drifted in its
// own direction - one forgot a dataset key, another shaped the tap hint
// differently - so the vocabulary lives here and the builders keep only what
// is genuinely theirs: their cells, their class recipe, their open command.
// The pointer checks ride along: the delegated desk clicks (wireup), the
// drag system (finder-drag) and the File Disk, Find File, export and Find
// Path tap grammars all asked the same matchMedia question inline.
//
// The selection bindings this reads (selectedDocumentItemKeys,
// selectedDocumentFolderId, selectedChatFileId, selectedProjectReferenceId,
// selectedProjectRootItemId) are the same classic-script top-level consts the
// feature files read; this module only moves the shared read behind one name.
// The row CLASSES are also read by consumers that never build rows (drag
// sources, sorters, the shared-disks projections, theme-lab's specimens) -
// those stay where they are; only the builder grammar is shared.
// Contract: tests/features/finder-rows.test.mjs

/**
 * The kind facts every Finder item carries through the row builders.
 * @param {{ type: string }} item
 */
function finderItemShape(item) {
  const isSystem = item.type === "finder-root";
  const isFolder = item.type === "folder";
  const isReference = item.type === "projectReference";
  return {
    isSystem,
    isFolder,
    isReference,
    isFile: !isSystem && !isFolder && !isReference,
    selectionType: isFolder ? "folder" : isReference ? "projectReference" : "file",
    dragType: isFolder ? "document-folder" : isReference ? "projectReference" : "file",
  };
}

/** Whether the row paints as selected: membership in the multi-select set, or the type's primary slot. */
function finderItemSelected(item, shape) {
  if (shape.isSystem) return item.id === selectedProjectRootItemId;
  if (shape.isFolder) {
    return selectedDocumentItemKeys.has(documentSelectionKey("folder", item.id)) || item.id === selectedDocumentFolderId;
  }
  if (shape.isReference) {
    return selectedDocumentItemKeys.has(documentSelectionKey("projectReference", item.id)) || item.id === selectedProjectReferenceId;
  }
  return selectedDocumentItemKeys.has(documentSelectionKey("file", item.id)) || item.id === selectedChatFileId;
}

/** The dataset keys the drag system, the drop targets and the delegated clicks all read. */
function stampFinderItemDataset(el, item, shape) {
  if (shape.isSystem) {
    el.dataset.projectRootId = item.id;
    return;
  }
  el.dataset.dragType = shape.dragType;
  el.dataset.id = item.id;
  el.dataset.projectId = item.projectId;
  el.dataset.documentItemType = shape.selectionType;
  el.dataset.documentItemId = item.id;
  if (shape.isFolder) {
    el.dataset.dropTarget = "document-folder";
    el.dataset.folderId = item.id;
  }
}

/** Coarse pointer: the tap-opens condition every Finder surface shares. */
function finderCoarsePointer() {
  return typeof window.matchMedia === "function"
    && !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Precise pointer: the drag system's hover grammar asks the inverse question. */
function finderPrecisePointer() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches === true;
}

/**
 * The click grammar for one Finder row or icon.
 *
 * A tap on the already-selected item with no modifier, on a coarse pointer,
 * opens it (touch has no double click). Anything else selects through the
 * window's own selection call - which receives the event, so shift/cmd/ctrl
 * ranges keep working - and a plain click gets the select-then-open hint.
 * `afterSelect` runs between the two for windows that repaint a second view
 * (the Project Hard Disk's root selection line).
 *
 * @param {MouseEvent} event
 * @param {HTMLElement} el
 * @param {{ alreadySelected: boolean, onOpen: () => void, onSelect: (event: MouseEvent) => void, afterSelect?: () => void }} hooks
 */
function finderTapSelect(event, el, hooks) {
  const plain = !event.metaKey && !event.ctrlKey && !event.shiftKey;
  if (hooks.alreadySelected && plain && finderCoarsePointer()) {
    hooks.onOpen();
    return;
  }
  hooks.onSelect(event);
  hooks.afterSelect?.();
  if (plain) {
    revealSelectOpenTapHint(el, { detail: event.detail });
  }
}
