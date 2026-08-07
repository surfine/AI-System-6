// Desktop/document drag and drop.
//
// Loaded before app.js as a classic script; handlers run after app.js
// initializes the shared desktop state.

function initDragAndDrop() {
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

    if ((target.dataset.dragType === "file" || target.dataset.dragType === "document-folder") && target.dataset.id) {
      const itemType = target.dataset.dragType === "document-folder" ? "folder" : "file";
      const key = documentSelectionKey(itemType, target.dataset.id);
      if (!selectedDocumentItemKeys.has(key)) {
        selectDocumentItem(itemType, target.dataset.id);
      }
      dragData.items = getSelectedDocumentItems().map((entry) => ({ type: entry.type, id: entry.id }));
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

    if (target.dataset.dragType === "mounted-file" && target.dataset.id) {
      if (!selectedMountedFileNames.has(target.dataset.id)) {
        selectedMountedFileNames.clear();
        selectedMountedFileNames.add(target.dataset.id);
        selectedMountedFile = target.dataset.id;
        renderMountedTextDisk();
      }
      dragData.ids = [...selectedMountedFileNames];
    }

    if (target.dataset.documentItemType && target.dataset.documentItemId) {
      selectDocumentItem(target.dataset.documentItemType, target.dataset.documentItemId);
    }

    if (dragData.type === "control-strip-module") {
      const payload = JSON.stringify(dragData);
      event.dataTransfer.setData("application/json", payload);
      event.dataTransfer.setData("text/plain", payload);
      event.dataTransfer.effectAllowed = "copy";
      setTimeout(() => target.classList.add("is-dragging"), 0);
      return;
    }

    beginSpringFolderSession(dragData);

    const dragPayload = JSON.stringify(dragData);
    event.dataTransfer.setData("application/json", dragPayload);
    event.dataTransfer.setData("text/plain", dragPayload);
    event.dataTransfer.effectAllowed = dragData.type === "file" ? "copyMove" : "move";
    setTimeout(() => target.classList.add("is-dragging"), 0);
  });

  document.addEventListener("dragend", (event) => {
    const target = event.target.closest("[data-drag-type]");
    if (target) target.classList.remove("is-dragging");
    document.querySelectorAll(".is-drag-over").forEach(el => el.classList.remove("is-drag-over"));
    endSpringFolderSession();
  });

  // dragenter is the reliable "the pointer reached this folder" signal: some
  // browsers only repeat dragover while the pointer keeps moving, so arming
  // the spring timer here (and again on dragover) makes a stationary hover
  // open the folder after the delay.
  document.addEventListener("dragenter", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget && dropTarget.dataset.dropTarget === "document-folder") {
      maybeSpringFolder(dropTarget);
    }
  });

  document.addEventListener("dragover", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      // A drop inside a window belongs to that window, not the desktop behind it.
      if (dropTarget.dataset.dropTarget === "desktop" && event.target.closest(".window")) return;
      event.preventDefault();
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
        maybeSpringFolder(dropTarget);
      }
      event.dataTransfer.dropEffect = ["clio-attachment", "droplet", "control-strip"].includes(dropTarget.dataset.dropTarget) ? "copy" : "move";
      dropTarget.classList.add("is-drag-over");
    }
  });

  document.addEventListener("dragleave", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      const rect = dropTarget.getBoundingClientRect();
      if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) {
        dropTarget.classList.remove("is-drag-over");
        window.AISystem6FinderObjects?.clearEditorInsertCaret?.(dropTarget);
        if (dropTarget.dataset.dropTarget === "document-folder" && dropTarget.dataset.folderId === springTimerFolderId) {
          cancelSpringFolderTimer();
        }
      }
    }
  });

  document.addEventListener("drop", async (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      if (dropTarget.dataset.dropTarget === "desktop" && event.target.closest(".window")) return;
      event.preventDefault();
      dropTarget.classList.remove("is-drag-over");

      try {
        const rawData = event.dataTransfer.getData("application/json");
        if (!rawData) return;
        const dragData = JSON.parse(rawData);
        const dropTargetType = dropTarget.dataset.dropTarget;
        const springTargetFolderId = (dropTargetType === "document-folder" || dropTargetType === "document-current-folder")
          ? dropTarget.dataset.folderId || null
          : null;
        endSpringFolderSession();

        if (dropTargetType === "trash") {
          handleDropToTrash(dragData);
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
        } else if (dropTargetType === "project") {
          const targetId = dropTarget.id === "active-project-drop-target"
            ? activeProjectId
            : dropTarget.dataset.projectId;
          handleDropToProject(dragData, targetId);
        } else if (dropTargetType === "clio-attachment") {
          if (dragData.type === "clipping-selection") withFinderObjects(() => { const clipping = createClippingFile({ ...dragData, folderId: null }); if (clipping) attachProjectFileToNextClioTalkRun(clipping.id); });
          else {
            const fileIds = Array.isArray(dragData.items) ? dragData.items.filter((item) => item.type === "file").map((item) => item.id) : (dragData.type === "file" && dragData.id ? [dragData.id] : []);
            fileIds.slice(0, 6).forEach((fileId) => attachProjectFileToNextClioTalkRun(fileId));
          }
        }
      } catch (e) {
        console.error("Drop failed", e);
      }
    }
  });
}

function handleDropToTrash(data) {
  if (data.type === "file") {
    if (Array.isArray(data.items) && data.items.length) {
      moveItemsToTrash(data.items);
      return;
    }
    selectedChatFileId = data.id;
    selectedDocumentFolderId = null;
    moveFileToTrashById(data.id);
  } else if (data.type === "scrap") {
    moveItemsToTrash((Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]).map((id) => ({ type: "scrap", id })));
  } else if (data.type === "document-folder") {
    if (Array.isArray(data.items) && data.items.length) {
      moveItemsToTrash(data.items);
      return;
    }
    moveDocumentFolderToTrashById(data.id);
  } else if (data.type === "project") {
    if (data.id === activeProjectId) {
      setStatus(t("cannot_trash_active_project"));
    } else {
      selectedProjectId = data.id;
      moveSelectedProjectToTrash();
    }
  } else if (data.type === "project-cd-item") {
    moveItemsToTrash((Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]).map((id) => ({ type: "projectCd", id })));
  } else if (data.type === "projectReference") {
    moveItemsToTrash((Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]).map((id) => ({ type: "projectReference", id })));
  } else if (data.type === "mounted-file") {
    removeMountedFilesToTrash(Array.isArray(data.ids) && data.ids.length ? data.ids : [data.id]);
  } else if (data.type === "mounted-disk") {
    ejectTextDisk();
  }
}

function handleDropToProject(data, targetProjectId) {
  if (!targetProjectId) {
    openWindow("projects");
    setStatus(t("no_project_drop_target"));
    return;
  }

  if (data.projectId === targetProjectId) return;

  if (data.type === "file") {
    const file = chatFiles.find(f => f.id === data.id);
    if (file) {
      file.projectId = targetProjectId;
      saveDeskState();
      renderDocuments();
    }
  } else if (data.type === "scrap") {
    const scrap = scraps.find(s => s.id === data.id);
    if (scrap) {
      scrap.projectId = targetProjectId;
      saveDeskState();
      renderScraps();
    }
  }
}

// ---- Spring-loaded Folders ------------------------------------------------
//
// Hovering a Finder folder for ~650ms while dragging a project file, folder,
// or Reader selection temporarily opens that folder so the drag can continue
// into the next level. This is an in-memory navigation aid: it never calls
// saveDeskState(), never touches Working Session or storage, and the Finder
// path snaps back to the origin when the drop or drag ends. It only activates
// on precise pointers; touch keeps the existing behavior (no long-press, no
// folder opening on tap-and-hold).

const springFolderDelayMs = 650;
let activeInternalDragData = null;
let springFolderTimer = null;
let springTimerFolderId = null;
let springFolderSession = null;

function isPrecisePointerAvailable() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches === true;
}

function isSpringAllowedDrag(dragData) {
  return !!dragData
    && (dragData.type === "file"
      || dragData.type === "document-folder"
      || dragData.type === "clipping-selection");
}

// Finder dragstart and Reader clipping dragstart both route through here. The
// session only remembers the origin path; every navigation is transient.
function beginSpringFolderSession(dragData) {
  if (!isPrecisePointerAvailable()) return false;
  if (!isSpringAllowedDrag(dragData)) return false;
  if (!dragData.projectId || dragData.projectId !== activeProjectId) return false;
  cancelSpringFolderTimer();
  springFolderSession = {
    originFolderId: selectedFolderId || "all",
    currentTargetId: null,
    opened: false,
  };
  activeInternalDragData = dragData;
  return true;
}

function cancelSpringFolderTimer() {
  if (springFolderTimer !== null) {
    clearTimeout(springFolderTimer);
    springFolderTimer = null;
  }
  springTimerFolderId = null;
}

function armSpringFolderTimer(folderId) {
  if (springTimerFolderId === folderId && springFolderTimer !== null) return;
  cancelSpringFolderTimer();
  springTimerFolderId = folderId;
  springFolderTimer = setTimeout(() => {
    springFolderTimer = null;
    springTimerFolderId = null;
    if (!springFolderSession) return;
    springFolderSession.opened = true;
    springFolderSession.currentTargetId = folderId;
    springNavigateToFolder(folderId);
  }, springFolderDelayMs);
}

function springFolderTargetValid(folderId) {
  if (!springFolderSession || !activeInternalDragData) return false;
  const dragData = activeInternalDragData;
  if (dragData.projectId !== activeProjectId) return false;
  if (!folderId || !getProjectFolders().some((folder) => folder.id === folderId)) return false;
  if (dragData.type === "document-folder") {
    if (dragData.id === folderId) return false;
    if (typeof isDocumentFolderDescendant === "function" && isDocumentFolderDescendant(folderId, dragData.id)) return false;
  }
  return true;
}

function maybeSpringFolder(dropTarget) {
  if (!springFolderSession) return;
  if (!isPrecisePointerAvailable()) return;
  const folderId = dropTarget.dataset.folderId || "";
  if (!springFolderTargetValid(folderId)) return;
  if (springFolderSession.opened && springFolderSession.currentTargetId === folderId) return;
  springFolderSession.currentTargetId = folderId;
  armSpringFolderTimer(folderId);
}

// Temporary navigation: both Finder surfaces follow the same path. The shared
// helpers clear stale selections and render, and they never save desk state,
// show status text, or play sounds.
function springNavigateToFolder(folderId) {
  if (typeof openDocumentFolder === "function") openDocumentFolder(folderId);
  else {
    selectedFolderId = folderId;
    if (typeof renderDocuments === "function") renderDocuments();
  }
  if (typeof openProjectFinderFolder === "function") openProjectFinderFolder(folderId);
  else {
    selectedProjectRootItemId = null;
    if (typeof renderProjectDisks === "function") renderProjectDisks();
  }
}

function springRestoreOrigin() {
  const origin = springFolderSession ? springFolderSession.originFolderId : selectedFolderId || "all";
  if (origin === "all" || !origin) {
    selectedFolderId = "all";
    selectedChatFileId = null;
    selectedDocumentFolderId = null;
    selectedProjectRootItemId = null;
    if (typeof clearDocumentSelection === "function") clearDocumentSelection();
    if (typeof renderDocuments === "function") renderDocuments();
    if (typeof renderProjectDisks === "function") renderProjectDisks();
    return;
  }
  springNavigateToFolder(origin);
}

// Idempotent: drop and dragend both call this; only the first call restores
// the origin path, so the two events can never double-navigate.
function endSpringFolderSession() {
  cancelSpringFolderTimer();
  if (!springFolderSession) return false;
  springRestoreOrigin();
  springFolderSession = null;
  activeInternalDragData = null;
  return true;
}

function getSpringFolderState() {
  return springFolderSession
    ? {
        originFolderId: springFolderSession.originFolderId,
        currentTargetId: springFolderSession.currentTargetId,
        opened: springFolderSession.opened,
      }
    : null;
}

window.AISystem6DragDrop = {
  beginSpringFolderSession,
  endSpringFolderSession,
  getSpringFolderState,
};
