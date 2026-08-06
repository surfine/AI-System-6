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
  });

  document.addEventListener("dragover", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      // A drop inside a window belongs to that window, not the desktop behind it.
      if (dropTarget.dataset.dropTarget === "desktop" && event.target.closest(".window")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = ["clio-attachment", "droplet"].includes(dropTarget.dataset.dropTarget) ? "copy" : "move";
      dropTarget.classList.add("is-drag-over");
    }
  });

  document.addEventListener("dragleave", (event) => {
    const dropTarget = event.target.closest("[data-drop-target]");
    if (dropTarget) {
      const rect = dropTarget.getBoundingClientRect();
      if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) {
        dropTarget.classList.remove("is-drag-over");
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

        if (dropTargetType === "trash") {
          handleDropToTrash(dragData);
        } else if (dropTargetType === "droplet") {
          withScripting(() => runDropletDrop(dropTarget.dataset.dropletAction || "", dragData));
        } else if (dropTargetType === "desktop") {
          withFinderObjects(() => createClippingFile({ ...dragData, folderId: null }));
        } else if (dropTargetType === "document-folder" || dropTargetType === "document-current-folder") {
          handleDropToDocumentFolder(dragData, dropTarget.dataset.folderId || null);
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
