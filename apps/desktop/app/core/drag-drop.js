// Desktop/document drag and drop.
//
// Loaded before app.js as a classic script; handlers run after app.js
// initializes the shared desktop state.

const finderDragSources = ".desktop-icon,.finder-item,.finder-list-row,.desktop-object";

function initDragAndDrop() {
  document.addEventListener("pointerdown", (event) => {
    const target = event.button ? null : event.target.closest?.(finderDragSources);
    if (!target || event.target.closest("input,textarea,select,[contenteditable],.title-bar,.resize-handle,.grow-box")) return;
    const pending = window.AISystem6FinderDragPending = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: Date.now(), target,
      pointerType: event.pointerType, altKey: event.altKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey,
    };
    const release = () => {
      pending.up = true;
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
    };
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    ensureFinderDragModule().then(() => window.AISystem6FinderDrag.adopt(pending)).catch(() => {});
  }, true);
  const prefetchFinderDrag = (event) => {
    if (!event.target.closest?.(finderDragSources)) return;
    document.removeEventListener("pointerover", prefetchFinderDrag);
    ensureFinderDragModule().catch(() => {});
  };
  document.addEventListener("pointerover", prefetchFinderDrag);

  document.addEventListener("dragstart", (event) => {
    const target = event.target.closest("[data-drag-type]");
    if (!target) return;

    const dragData = {
      type: target.dataset.dragType,
      id: target.dataset.id,
      projectId: target.dataset.projectId
    };

    if (target.dataset.dragType === "control-strip-module" && target.dataset.moduleId) {
      dragData.moduleId = target.dataset.moduleId;
    }

    if (target.dataset.dragType === "project-cd-item" && target.dataset.id) {
      if (!selectedProjectCdItemIds.has(target.dataset.id)) {
        selectedProjectCdItemId = target.dataset.id;
        selectedProjectCdItemIds.clear();
        selectedProjectCdItemIds.add(target.dataset.id);
        renderProjectCd();
      }
      dragData.ids = getSelectedProjectCdItems().map((item) => item.id);
    }

    if (target.dataset.dragType === "scrap" && target.dataset.id) {
      if (!selectedScrapIds.has(target.dataset.id)) {
        selectedScrapIds.clear();
        selectedScrapIds.add(target.dataset.id);
        selectedScrapId = target.dataset.id;
        renderScraps();
      }
      dragData.ids = getSelectedScraps().map((scrap) => scrap.id);
    }
    window.AISystem6FinderDrag?.prepareHtml5Drag?.(target, dragData);

    if (dragData.type === "control-strip-module") {
      const payload = JSON.stringify(dragData);
      event.dataTransfer.setData("application/json", payload);
      event.dataTransfer.setData("text/plain", payload);
      event.dataTransfer.effectAllowed = "copy";
      setTimeout(() => target.classList.add("is-dragging"), 0);
      return;
    }

    const dragPayload = JSON.stringify(dragData);
    event.dataTransfer.setData("application/json", dragPayload);
    event.dataTransfer.setData("text/plain", dragPayload);
    event.dataTransfer.effectAllowed = "move";
    setTimeout(() => target.classList.add("is-dragging"), 0);
  });

  document.addEventListener("dragend", (event) => {
    const target = event.target.closest("[data-drag-type]");
    if (target) target.classList.remove("is-dragging");
    clearAllDropHitFeedback();
    window.AISystem6FinderDrag?.endSpringFolderSession();
  });

  // dragenter is the reliable "the pointer reached this folder" signal: some
  // browsers only repeat dragover while the pointer keeps moving, so arming
  // the spring timer here (and again on dragover) makes a stationary hover
  // open the folder after the delay.
  document.addEventListener("dragenter", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget && dropTarget.dataset.dropTarget === "document-folder") {
      window.AISystem6FinderDrag?.springHover(dropTarget);
    }
  });

  document.addEventListener("dragover", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      // A drop inside a window belongs to that window, not the desktop behind it.
      if (dropTarget.dataset.dropTarget === "desktop" && event.target.closest(".window")) return;
      event.preventDefault();
      // Outside material: copy only on surfaces that will file it. Reject hits
      // show dropEffect "none" plus is-drop-reject so trash/folder/etc. never
      // look like a File Floppy import (ADHD/HIG: accept and refuse are visible).
      if (isExternalDrop(event)) {
        const kind = externalDropHitKind(dropTarget.dataset.dropTarget, event);
        if (kind === "accept") {
          event.dataTransfer.dropEffect = "copy";
          markDropHitAccept(dropTarget);
        } else {
          event.dataTransfer.dropEffect = "none";
          markDropHitReject(dropTarget);
        }
        return;
      }
      if (dropTarget.dataset.dropTarget === "editor-insert") {
        // Editable surfaces show a blinking insertion caret, not the dashed
        // whole-object frame. Validation and caret positioning live in the lazy
        // finder-objects module so the main bundle stays thin.
        ensureFinderObjectsModule()
          .then(() => {
            window.AISystem6FinderObjects?.handleEditorInsertDragOver?.(dropTarget, event);
          })
          .catch((error) => console.warn("Finder Objects failed to load.", error));
        return;
      }
      if (dropTarget.dataset.dropTarget === "document-folder") {
        window.AISystem6FinderDrag?.springHover(dropTarget);
      }
      // Scrap and File Floppy are outside-material surfaces; an internal Finder
      // object over them is a refuse hit, not a silent invert. An ejected disk
      // is read-only, so it refuses too.
      if (dropTarget.dataset.dropTarget === "scrap" || dropTarget.dataset.dropTarget === "file-floppy" || dropTarget.dataset.ejected) {
        event.dataTransfer.dropEffect = "none";
        markDropHitReject(dropTarget);
        return;
      }
      event.dataTransfer.dropEffect = ["clio-attachment", "droplet", "control-strip"].includes(dropTarget.dataset.dropTarget) ? "copy" : "move";
      markDropHitAccept(dropTarget);
    }
  });

  document.addEventListener("dragleave", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      const rect = dropTarget.getBoundingClientRect();
      if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) {
        clearDropHitFeedback(dropTarget);
        window.AISystem6FinderObjects?.clearEditorInsertCaret?.(dropTarget);
        window.AISystem6FinderDrag?.springLeave(dropTarget);
      }
    }
  });

  document.addEventListener("drop", async (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      if (dropTarget.dataset.dropTarget === "desktop" && event.target.closest(".window")) return;

      // Outside material takes the external route before the Finder payload is
      // read, because it never carries one.
      if (isExternalDrop(event)) {
        clearDropHitFeedback(dropTarget);
        await handleExternalDropOnTarget(event, dropTarget.dataset.dropTarget);
        return;
      }

      event.preventDefault();
      clearDropHitFeedback(dropTarget);

      try {
        const rawData = event.dataTransfer.getData("application/json");
        if (!rawData) return;
        dispatchInternalDrop(dropTarget, JSON.parse(rawData), event);
      } catch (e) {
        // lane-errors: a failed drop used to log to the console only, so the
        // dragged item visually snapped back with no explanation - the drop
        // target just did nothing. friendlyErrorDetail keeps this honest
        // instead of showing whatever internal message the handler threw.
        console.error("Drop failed", e);
        setStatus(t("drop_failed", friendlyErrorDetail(e)));
      }
    }
  });

  initExternalDropSafetyNet();
}

function dispatchInternalDrop(dropTarget, dragData, event) {
  const dropTargetType = dropTarget.dataset.dropTarget;
  const springTargetFolderId = (dropTargetType === "document-folder" || dropTargetType === "document-current-folder")
    ? dropTarget.dataset.folderId || null
    : null;
  window.AISystem6FinderDrag?.endSpringFolderSession();

  if (dropTargetType === "trash" || dropTargetType === "project") {
    // Trash and disk drops live in finder-drag.js; a pointer drag has it in already.
    const drop = () => dropTargetType === "trash"
      ? handleDropToTrash(dragData)
      : handleDropToProject(dragData, dropTarget.id === "active-project-drop-target" ? activeProjectId : dropTarget.dataset.projectId, dropTarget.dataset.ejected === "true");
    if (window.AISystem6FinderDragLoaded) drop();
    else ensureFinderDragModule().then(drop, (error) => setStatus(t("drop_failed", friendlyErrorDetail(error))));
  } else if (dropTargetType === "scrap") {
    // Scrapbook is for outside pictures; an internal Finder object has its
    // own home and must not vanish into a silent refuse.
    setStatus(t("external_drop_scrap_needs_picture"));
  } else if (dropTargetType === "file-floppy") {
    setStatus(t("external_drop_floppy_needs_file"));
  } else if (dropTargetType === "droplet") {
    withScripting(() => runDropletDrop(dropTarget.dataset.dropletAction || "", dragData));
  } else if (dropTargetType === "desktop") {
    if (dragData.type === "control-strip-module") return;
    withFinderObjects(() => createClippingFile({ ...dragData, folderId: null }));
  } else if (dropTargetType === "control-strip") {
    if (dragData.type === "control-strip-module" && typeof window.AISystem6ControlStrip?.handleModuleDrop === "function") {
      window.AISystem6ControlStrip.handleModuleDrop(dragData, event);
    }
  } else if (dropTargetType === "editor-insert") {
    withFinderObjects(() => insertClippingIntoEditor(dropTarget, dragData, event));
  } else if (dropTargetType === "document-folder" || dropTargetType === "document-current-folder") {
    handleDropToDocumentFolder(dragData, springTargetFolderId);
  } else if (dropTargetType === "clio-attachment") {
    if (dragData.type === "clipping-selection") withFinderObjects(() => { const clipping = createClippingFile({ ...dragData, folderId: null }); if (clipping) attachProjectFileToNextClioTalkRun(clipping.id); });
    else {
      const fileIds = Array.isArray(dragData.items) ? dragData.items.filter((item) => item.type === "file").map((item) => item.id) : (dragData.type === "file" && dragData.id ? [dragData.id] : []);
      fileIds.slice(0, 6).forEach((fileId) => attachProjectFileToNextClioTalkRun(fileId));
    }
  }
}

// Which Finder drop targets can file outside material. Trash, project, folder,
// and Control Strip stay internal-object targets: an external drop on them is
// refused in place rather than quietly turned into an import.
const externalDropTargets = new Set(["desktop", "editor-insert", "clio-attachment", "scrap", "file-floppy"]);

function externalDropTargetAccepts(dropTargetType) {
  return externalDropTargets.has(dropTargetType);
}

// Hit feedback for outside material. Desktop always accepts (it routes by type).
// Scrap and File Floppy accept only real files; text/link drags refuse in place
// with a visible reject hit. Editable surfaces accept files; bare text keeps the
// browser caret and is not a dashed accept frame here.
function externalDropHitKind(dropTargetType, event) {
  if (!externalDropTargetAccepts(dropTargetType)) return "reject";
  if (dropTargetType === "desktop") return "accept";
  if (dropTargetType === "scrap" || dropTargetType === "file-floppy") {
    return externalDropHasFiles(event) ? "accept" : "reject";
  }
  if (dropTargetType === "editor-insert" || dropTargetType === "clio-attachment") {
    return externalDropHasFiles(event) ? "accept" : "reject";
  }
  return "reject";
}

function clearDropHitFeedback(el) {
  if (!el?.classList) return;
  el.classList.remove("is-drag-over", "is-drop-reject");
}

function clearAllDropHitFeedback() {
  document.querySelectorAll(".is-drag-over, .is-drop-reject").forEach((el) => {
    el.classList.remove("is-drag-over", "is-drop-reject");
  });
}

function markDropHitAccept(el) {
  if (!el?.classList) return;
  el.classList.remove("is-drop-reject");
  el.classList.add("is-drag-over");
}

let lastDropRejectStatusKey = "";
let lastDropRejectStatusAt = 0;

function markDropHitReject(el) {
  if (!el?.classList) return;
  el.classList.remove("is-drag-over");
  el.classList.add("is-drop-reject");
  // Goal #2/#4: refuse is visible AND sayable — silhouette alone is easy to
  // miss mid-drag. One status per target kind per short window (no nag).
  const kind = el.dataset?.dropTarget || "";
  const reasonKey = kind === "scrap"
    ? "external_drop_scrap_needs_picture"
    : kind === "file-floppy"
      ? "external_drop_floppy_needs_file"
      : "";
  if (!reasonKey || typeof t !== "function" || typeof setStatus !== "function") return;
  const now = Date.now();
  if (reasonKey === lastDropRejectStatusKey && now - lastDropRejectStatusAt < 1600) return;
  lastDropRejectStatusKey = reasonKey;
  lastDropRejectStatusAt = now;
  setStatus(t(reasonKey));
}

async function handleExternalDropOnTarget(event, dropTargetType) {
  if (dropTargetType === "desktop") {
    event.preventDefault();
    return routeExternalDropToDesktop(event);
  }

  if (dropTargetType === "file-floppy") {
    // The File Floppy window is the named destination for outside files; text
    // and links still belong on the desktop router, not this volume.
    if (!externalDropHasFiles(event)) {
      event.preventDefault();
      setStatus(t("external_drop_floppy_needs_file"));
      return false;
    }
    event.preventDefault();
    return routeExternalDropFilesOnly(event);
  }

  if (dropTargetType === "scrap") {
    // Scrapbook clips pictures; it does not mount File Floppy context or keep
    // bare text. Refuse with a reason instead of a silent snap-back.
    event.preventDefault();
    const pictures = imageFilesFromList(event.dataTransfer?.files);
    if (pictures.length && typeof clipPictureToScrapbook === "function") {
      return clipPictureToScrapbook(pictures);
    }
    setStatus(t("external_drop_scrap_needs_picture"));
    return false;
  }

  if (dropTargetType === "editor-insert" || dropTargetType === "clio-attachment") {
    // Files become File Floppy context, which is what a writing surface and
    // ClioTalk both read from. Text and links keep the browser's own insertion
    // at the drop point, so the target window still owns its own behavior.
    if (!externalDropHasFiles(event)) return false;
    event.preventDefault();
    // A photo dropped on the Question Sheet is that sheet's raw input, not a
    // File Floppy document — a scribbled page belongs to the questions.
    const questionSheetPhotos = event.target?.id === "question-sheet-body"
      ? imageFilesFromList(event.dataTransfer?.files)
      : [];
    if (questionSheetPhotos.length) return addQuestionSheetPhotoFiles(questionSheetPhotos);
    // Same rule one surface over: a picture dropped in the Scrapbook is a clip,
    // exactly what the Clip Picture button makes — and a clip may be a picture
    // with no text at all. Without this the only way in was that one button,
    // while every other surface took a drop.
    const scrapbookPictures = event.target?.closest?.("#scrap-form, #scrap-pictures")
      ? imageFilesFromList(event.dataTransfer?.files)
      : [];
    if (scrapbookPictures.length && typeof clipPictureToScrapbook === "function") {
      return clipPictureToScrapbook(scrapbookPictures);
    }
    return routeExternalDropFilesOnly(event);
  }

  event.preventDefault();
  return declineExternalDrop();
}

// A drag that ended while the engine was loading must not begin its session late.
let springAsk = 0;
window.AISystem6DragDrop = {
  beginSpringFolderSession: (dragData, ask = ++springAsk) => ensureFinderDragModule().then(() => ask === springAsk && window.AISystem6FinderDrag.beginSpringFolderSession(dragData)).catch(() => false),
  endSpringFolderSession: () => ++springAsk && window.AISystem6FinderDrag?.endSpringFolderSession() || false,
  getSpringFolderState: () => window.AISystem6FinderDrag?.getSpringFolderState() || null,
};
