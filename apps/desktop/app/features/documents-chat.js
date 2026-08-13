// Feature module: documents-chat.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

let clioTalkAttachmentPickerActive = false;

function isClioTalkAttachableProjectFile(file) {
  if (!file || !isInActiveProject(file)) return false;
  if (file.type === "chat") return true;
  return file.type === "text" && (!String(file.artifactKind || "").trim() || file.artifactKind === "clipping");
}

// The write half of a ClioTalk attachment: records the resolved document in
// nextTaskInputFileIds, refreshes the run assembly, opens the assistant, and
// reports the attachment. Callers pass the final target — for an Alias that
// is the original document, so nextTaskInputFileIds never stores an Alias id.
function attachResolvedProjectFileToNextClioTalkRun(file) {
  if (!isClioTalkAttachableProjectFile(file)) {
    setStatus(t("clio_attachment_not_supported"));
    return false;
  }
  if (!(window.nextTaskInputFileIds instanceof Set)) window.nextTaskInputFileIds = new Set();
  if (!window.nextTaskInputFileIds.has(file.id) && window.nextTaskInputFileIds.size >= 6) {
    setStatus(t("clio_attachment_limit"));
    return false;
  }
  window.nextTaskInputFileIds.add(file.id);
  clioTalkAttachmentPickerActive = false;
  renderAttachedClips();
  renderClioTalkRunAssembly();
  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  openWindow("assistant");
  promptInput?.focus();
  setStatus(t("clio_attachment_added", file.name));
  return true;
}

// Attach a selected Finder object. Ordinary documents go straight through;
// Aliases resolve to their original via the lazy finder-objects module, with
// the existing broken-alias and unsupported-object status messages.
function attachProjectFileToNextClioTalkRun(fileId = selectedChatFileId) {
  const file = getProjectFiles().find((item) => item.id === fileId);
  if (!file) {
    setStatus(t("clio_attachment_not_supported"));
    return false;
  }
  if (file.type !== "alias") {
    return attachResolvedProjectFileToNextClioTalkRun(file);
  }
  const pending = withFinderObjects(() => {
    const resolution = window.AISystem6FinderObjects?.resolveProjectFileForUse?.(file);
    if (!resolution || resolution.reason === "broken-alias") {
      setStatus(t("alias_broken", file.name));
      return false;
    }
    if (!resolution.target) {
      setStatus(t("clio_attachment_not_supported"));
      return false;
    }
    return attachResolvedProjectFileToNextClioTalkRun(resolution.target);
  });
  return pending === null ? true : pending;
}

function beginClioTalkAttachmentPicker() {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return false;
  }
  clioTalkAttachmentPickerActive = true;
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  clearDocumentSelection();
  renderDocuments();
  openWindow("documents");
  setStatus(t("clio_choose_attachment"));
  return true;
}

function openDocumentFileOrAttachToClioTalk(file) {
  if (clioTalkAttachmentPickerActive) {
    attachProjectFileToNextClioTalkRun(file?.id || "");
    return;
  }
  if (!file) return;
  withFinderObjects(() => {
    if (file.type === "alias") return openAliasFile(file);
    if (openProjectFileWithStationery(file)) return;
    if (file.type === "text" || file.type === "chat") {
      // The system decides object routing: open intents resolve through the
      // Application Registry (teachText / docMap / clioTalk), never through
      // a second per-surface copy of "which app handles this object".
      window.AISystem6ApplicationRegistry?.dispatchApplicationIntent?.("", {
        intent: "open",
        items: [file],
        sourceAppId: "finder",
      });
      return;
    }
    if (file.type === "text") openTextFile(file.id);
    else openChatFileWindow(file.id);
  });
}

function renderFolderSuggestions() {
  folderSuggestionsEl.replaceChildren();
  getProjectFolders().forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.name;
    folderSuggestionsEl.append(option);
  });
}

function getSelectedDocumentFolder() {
  return selectedDocumentFolderId
    ? getProjectFolders().find((folder) => folder.id === selectedDocumentFolderId) || null
    : null;
}

function documentSelectionKey(type, id) {
  return `${type}:${id}`;
}

function documentSelectionParts(key) {
  const [type, ...idParts] = String(key || "").split(":");
  return { type, id: idParts.join(":") };
}

function clearDocumentSelection() {
  selectedDocumentItemKeys.clear();
  selectedDocumentAnchorKey = "";
}

function getDocumentFolderItem(folder) {
  if (!folder) return null;
  const childFiles = getProjectFiles().filter((file) => file.folderId === folder.id).length;
  const childFolders = getProjectFolders().filter((item) => item.parentId === folder.id).length;
  return {
    ...folder,
    type: "folder",
    kindLabel: t("folder_kind"),
    iconClass: "folder-icon",
    iconId: "folder",
    itemCount: childFiles + childFolders,
    canDuplicate: true,
    canRename: true,
    canTrash: true,
    name: displayFolderName(folder.name),
  };
}

function getSelectedDocumentItem() {
  const selectedFile = selectedChatFileId
    ? chatFiles.find((file) => file.id === selectedChatFileId && isInActiveProject(file)) || null
    : null;
  if (selectedFile) return selectedFile;
  return getDocumentFolderItem(getSelectedDocumentFolder());
}

function getVisibleDocumentSelectionItems() {
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = activeWin?.dataset.window || "";
  if (activeName === "projects" && typeof getProjectRootFinderItems === "function") {
    return getProjectRootFinderItems().filter((item) => item.type === "folder" || item.type === "text" || item.type === "chat");
  }

  const parentId = selectedFolderId === "all" ? null : selectedFolderId;
  const folders = getProjectFolders()
    .filter((folder) => (folder.parentId || null) === parentId)
    .map(getDocumentFolderItem);
  const files = getProjectFiles().filter((file) => (file.folderId || null) === parentId);
  return [...folders, ...files].filter(Boolean);
}

function getSelectedDocumentItems() {
  if (!selectedDocumentItemKeys.size) {
    if (selectedDocumentFolderId) selectedDocumentItemKeys.add(documentSelectionKey("folder", selectedDocumentFolderId));
    if (selectedChatFileId) selectedDocumentItemKeys.add(documentSelectionKey("file", selectedChatFileId));
  }

  const selected = [];
  selectedDocumentItemKeys.forEach((key) => {
    const { type, id } = documentSelectionParts(key);
    if (type === "folder") {
      const folder = getProjectFolders().find((item) => item.id === id);
      if (folder) selected.push({ type: "folder", id, item: getDocumentFolderItem(folder) });
    } else if (type === "file") {
      const file = getProjectFiles().find((item) => item.id === id);
      if (file) selected.push({ type: "file", id, item: file });
    }
  });
  return selected;
}

function selectDocumentItemFromEvent(type, id, event = {}, orderedItems = getVisibleDocumentSelectionItems()) {
  const key = documentSelectionKey(type, id);
  selectedProjectRootItemId = null;
  if (event.shiftKey && selectedDocumentAnchorKey) {
    const keys = orderedItems
      .filter((item) => item.type === "folder" || item.type === "text" || item.type === "chat")
      .map((item) => documentSelectionKey(item.type === "folder" ? "folder" : "file", item.id));
    const anchorIndex = keys.indexOf(selectedDocumentAnchorKey);
    const currentIndex = keys.indexOf(key);
    selectedDocumentItemKeys.clear();
    if (anchorIndex >= 0 && currentIndex >= 0) {
      const start = Math.min(anchorIndex, currentIndex);
      const end = Math.max(anchorIndex, currentIndex);
      keys.slice(start, end + 1).forEach((entry) => selectedDocumentItemKeys.add(entry));
    } else {
      selectedDocumentItemKeys.add(key);
    }
  } else if (event.metaKey || event.ctrlKey) {
    if (selectedDocumentItemKeys.has(key) && selectedDocumentItemKeys.size > 1) {
      selectedDocumentItemKeys.delete(key);
    } else {
      selectedDocumentItemKeys.add(key);
    }
    selectedDocumentAnchorKey = key;
  } else {
    selectedDocumentItemKeys.clear();
    selectedDocumentItemKeys.add(key);
    selectedDocumentAnchorKey = key;
  }

  const primary = selectedDocumentItemKeys.has(key)
    ? { type, id }
    : documentSelectionParts(selectedDocumentItemKeys.values().next().value || "");
  if (primary.type === "folder") {
    selectedDocumentFolderId = primary.id;
    selectedChatFileId = null;
  } else {
    selectedChatFileId = primary.id || null;
    selectedDocumentFolderId = null;
  }
  updateDocumentSelectionView();
  updateMenuState();
}

function updateDocumentSelectionView() {
  documentIconGridEl?.querySelectorAll("[data-document-item-id]").forEach((el) => {
    const key = documentSelectionKey(el.dataset.documentItemType, el.dataset.documentItemId);
    const isSelectedFile = el.dataset.documentItemType === "file" && el.dataset.documentItemId === selectedChatFileId;
    const isSelectedFolder = el.dataset.documentItemType === "folder" && el.dataset.documentItemId === selectedDocumentFolderId;
    el.classList.toggle("is-selected", selectedDocumentItemKeys.has(key) || isSelectedFile || isSelectedFolder);
  });
}

function selectDocumentItem(type, id) {
  clearDocumentSelection();
  selectedDocumentItemKeys.add(documentSelectionKey(type, id));
  selectedDocumentAnchorKey = documentSelectionKey(type, id);
  if (type === "folder") {
    selectedDocumentFolderId = id;
    selectedChatFileId = null;
  } else {
    selectedChatFileId = id;
    selectedDocumentFolderId = null;
  }
  updateDocumentSelectionView();
  updateMenuState();
}

function openDocumentFolder(folderId) {
  if (!getProjectFolders().some((folder) => folder.id === folderId)) return;
  selectedFolderId = folderId;
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  clearDocumentSelection();
  renderDocuments();
}

function openSelectedDocumentItem() {
  const folder = getSelectedDocumentFolder();
  if (folder) {
    openDocumentFolder(folder.id);
    return;
  }

  const file = chatFiles.find((item) => item.id === selectedChatFileId && isInActiveProject(item));
  if (file) {
    openDocumentFileOrAttachToClioTalk(file);
  } else {
    setStatus(t("select_finder_item_first"));
  }
}

function duplicateSelectedDocumentFile() {
  const file = chatFiles.find((item) => item.id === selectedChatFileId && isInActiveProject(item));
  if (!file) {
    setStatus(t("select_finder_item_first"));
    return;
  }

  const copy = {
    ...structuredClone(file),
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    name: `${file.name} copy`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  chatFiles.unshift(copy);
  selectedChatFileId = copy.id;
  selectedDocumentFolderId = null;
  saveDeskState();
  renderDocuments();
  setStatus(t("file_duplicated", copy.name));
}

// Clipping Files, Alias, and Stationery logic lives in the lazy finder-objects
// module to stay inside the floppy budget.
function withFinderObjects(callback) {
  if (window.AISystem6FinderObjectsLoaded) return callback();
  return ensureLazyModuleForUserAction(t("finder_objects"), ensureFinderObjectsModule).then(callback);
}

async function renameSelectedDocumentItem() {
  const folder = getSelectedDocumentFolder();
  if (folder) {
    const name = await showInputDialog({
      message: t("rename_folder_prompt"),
      defaultValue: displayFolderName(folder.name),
    });
    if (!name?.trim()) return;
    const normalized = name.trim();
    const siblingExists = getProjectFolders().some((item) => {
      if (item.id === folder.id) return false;
      if ((item.parentId || null) !== (folder.parentId || null)) return false;
      return displayFolderName(item.name).toLowerCase() === normalized.toLowerCase();
    });
    if (siblingExists) {
      setStatus(t("folder_name_taken", normalized));
      return;
    }
    folder.name = isDefaultFolderName(normalized) ? "General" : normalized;
    folder.updatedAt = new Date().toISOString();
    saveDeskState();
    renderDocuments();
    setStatus(t("folder_renamed", displayFolderName(folder.name)));
    return;
  }

  const file = chatFiles.find((item) => item.id === selectedChatFileId && isInActiveProject(item));
  if (!file) {
    setStatus(t("select_finder_item_first"));
    return;
  }
  const name = await showInputDialog({
    message: t("rename_file_prompt"),
    defaultValue: file.name,
  });
  if (!name?.trim()) return;
  file.name = name.trim();
  if (file.type === "chat") file.titleMode = "manual";
  file.updatedAt = new Date().toISOString();
  if (file.id === activeTextFileId) {
    teachTextNameInput.value = file.name;
    syncTeachTextNameDisplay();
  }
  saveDeskState();
  renderDocuments();
  setStatus(t("file_renamed", file.name));
}

function moveSelectedDocumentFileToTrash() {
  if (!selectedChatFileId) {
    setStatus(t("select_finder_item_first"));
    return;
  }
  const file = chatFiles.find((item) => item.id === selectedChatFileId && isInActiveProject(item));
  if (!file) {
    setStatus(t("select_finder_item_first"));
    return;
  }
  const name = file.name;
  moveChatFileToTrash();
  setStatus(t("file_moved_trash", name));
}

function getDocumentFolderTree(folderId) {
  const folderIds = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    getProjectFolders().forEach((folder) => {
      if (folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) {
        folderIds.add(folder.id);
        changed = true;
      }
    });
  }

  return {
    folders: getProjectFolders().filter((folder) => folderIds.has(folder.id)),
    files: getProjectFiles().filter((file) => file.folderId && folderIds.has(file.folderId)),
  };
}

function moveDocumentFolderToTrashById(folderId) {
  const folder = getProjectFolders().find((item) => item.id === folderId);
  if (!folder) {
    setStatus(t("select_finder_item_first"));
    return false;
  }

  const tree = getDocumentFolderTree(folder.id);
  const folderIds = new Set(tree.folders.map((item) => item.id));
  const fileIds = new Set(tree.files.map((item) => item.id));
  trashItems.unshift({
    projectId: activeProjectId,
    title: `${displayFolderName(folder.name)}.folder`,
    body: `Folder: ${getFolderPath(folder.id).join(" / ")}`,
    originalPath: getProjectFolderPathLabel(folder.parentId || null),
    originalType: "folder",
    originalData: {
      folder: structuredClone(folder),
      folders: tree.folders.filter((item) => item.id !== folder.id).map((item) => structuredClone(item)),
      files: tree.files.map((item) => structuredClone(item)),
    },
  });

  for (let index = chatFiles.length - 1; index >= 0; index -= 1) {
    if (fileIds.has(chatFiles[index].id)) chatFiles.splice(index, 1);
  }
  removeMountedFilesByName(tree.files.map((item) => item.name), folder.projectId);
  purgeContextForTrashedItems([{ type: "folder", id: folder.id, item: { ...folder, files: tree.files } }]);
  for (let index = chatFolders.length - 1; index >= 0; index -= 1) {
    if (folderIds.has(chatFolders[index].id)) chatFolders.splice(index, 1);
  }

  if (fileIds.has(activeTextFileId)) {
    activeTextFileId = null;
    closeWindow("teachText");
  }
  selectedDocumentFolderId = null;
  selectedChatFileId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  renderTrash();
  playSystemSound("trash");
  setStatus(t("folder_moved_trash", displayFolderName(folder.name)));
  return true;
}

function moveItemsToTrash(items = []) {
  const normalized = Array.from(items || [])
    .map((entry) => typeof entry === "string" ? documentSelectionParts(entry) : entry)
    .filter((entry) => entry?.type && entry?.id);
  if (!normalized.length) return;

  const folderIds = new Set(normalized.filter((entry) => entry.type === "folder").map((entry) => entry.id));
  const moved = [];

  normalized.forEach((entry) => {
    if (entry.type === "folder") {
      if (moveDocumentFolderToTrashById(entry.id)) moved.push(entry);
      return;
    }
    if (entry.type === "file") {
      const file = getProjectFiles().find((item) => item.id === entry.id);
      if (!file) return;
      if (file.folderId && folderIds.has(file.folderId)) return;
      selectedChatFileId = entry.id;
      moveFileToTrashById(entry.id);
      moved.push(entry);
      return;
    }
    if (entry.type === "scrap") {
      if (scraps.some((scrap) => scrap.id === entry.id && isInActiveProject(scrap))) {
        moveScrapToTrash(entry.id);
        moved.push(entry);
      }
      return;
    }
    if (entry.type === "projectCd") {
      moved.push(entry);
      return;
    }
    if (entry.type === "projectReference") {
      moved.push(entry);
    }
  });

  const projectCdIds = normalized.filter((entry) => entry.type === "projectCd").map((entry) => entry.id);
  if (projectCdIds.length) moveProjectCdItemsToTrash(projectCdIds);

  const referenceIds = normalized.filter((entry) => entry.type === "projectReference").map((entry) => entry.id);
  if (referenceIds.length && typeof moveProjectReferencesToTrash === "function") {
    moveProjectReferencesToTrash(referenceIds);
  }

  clearDocumentSelection();
  updateMenuState();
  if (moved.length > 1) setStatus(t("items_moved_trash", moved.length));
}

function moveSelectedDocumentFolderToTrash() {
  const folder = getSelectedDocumentFolder();
  return moveDocumentFolderToTrashById(folder?.id);
}

function getDocumentDropFolderName(folderId) {
  if (!folderId) return t("documents");
  const folder = getProjectFolders().find((item) => item.id === folderId);
  return folder ? displayFolderName(folder.name) : t("documents");
}

function isDocumentFolderDescendant(folderId, possibleAncestorId) {
  const folders = new Map(getProjectFolders().map((folder) => [folder.id, folder]));
  let current = folders.get(folderId);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    if (current.id === possibleAncestorId) return true;
    seen.add(current.id);
    current = current.parentId ? folders.get(current.parentId) : null;
  }
  return false;
}

function moveDocumentFileToFolder(fileId, targetFolderId = null) {
  const file = chatFiles.find((item) => item.id === fileId && isInActiveProject(item));
  if (!file) return false;
  const normalizedTargetId = targetFolderId && getProjectFolders().some((folder) => folder.id === targetFolderId)
    ? targetFolderId
    : null;
  if ((file.folderId || null) === normalizedTargetId) return false;

  const currentViewFolderId = selectedFolderId === "all" ? null : selectedFolderId;
  const targetVisibleInCurrentView = normalizedTargetId && getProjectFolders().some((folder) =>
    folder.id === normalizedTargetId && (folder.parentId || null) === currentViewFolderId
  );
  file.folderId = normalizedTargetId;
  file.updatedAt = new Date().toISOString();
  selectedChatFileId = normalizedTargetId === currentViewFolderId ? file.id : null;
  selectedDocumentFolderId = targetVisibleInCurrentView ? normalizedTargetId : null;
  if (file.id === activeTextFileId) {
    teachTextFolderInput.value = getDocumentDropFolderName(normalizedTargetId);
  }
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  setStatus(t("file_moved_folder", file.name, getDocumentDropFolderName(normalizedTargetId)));
  return true;
}

function moveDocumentFolderToFolder(folderId, targetFolderId = null) {
  const folder = getProjectFolders().find((item) => item.id === folderId);
  if (!folder) return false;
  const normalizedTargetId = targetFolderId && getProjectFolders().some((item) => item.id === targetFolderId)
    ? targetFolderId
    : null;

  if (folder.id === normalizedTargetId || (normalizedTargetId && isDocumentFolderDescendant(normalizedTargetId, folder.id))) {
    setStatus(t("cannot_move_folder_into_itself"));
    return false;
  }

  if ((folder.parentId || null) === normalizedTargetId) return false;

  const currentViewFolderId = selectedFolderId === "all" ? null : selectedFolderId;
  const targetVisibleInCurrentView = normalizedTargetId && getProjectFolders().some((item) =>
    item.id === normalizedTargetId && (item.parentId || null) === currentViewFolderId
  );
  folder.parentId = normalizedTargetId;
  folder.updatedAt = new Date().toISOString();
  selectedDocumentFolderId = normalizedTargetId === currentViewFolderId ? folder.id : targetVisibleInCurrentView ? normalizedTargetId : null;
  selectedChatFileId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  setStatus(t("folder_moved_folder", displayFolderName(folder.name), getDocumentDropFolderName(normalizedTargetId)));
  return true;
}

function handleDropToDocumentFolder(data, targetFolderId = null) {
  if (!data || data.projectId !== activeProjectId) {
    setStatus(t("no_project_drop_target"));
    return;
  }

  const normalizedTargetId = targetFolderId && getProjectFolders().some((folder) => folder.id === targetFolderId)
    ? targetFolderId
    : null;

  if (data.type === "file") {
    moveDocumentFileToFolder(data.id, normalizedTargetId);
  } else if (data.type === "document-folder") {
    moveDocumentFolderToFolder(data.id, normalizedTargetId);
  } else if (data.type === "clipping-selection") {
    withFinderObjects(() => createClippingFile({ ...data, folderId: normalizedTargetId }));
  } else {
    setStatus(t("document_drop_unsupported"));
  }
}

function renderDocuments() {
  if (selectedFolderId !== "all" && !getProjectFolders().some((folder) => folder.id === selectedFolderId)) {
    selectedFolderId = "all";
  }

  const selectedFolder = getSelectedFolder();
  const currentParentId = selectedFolder?.id || null;
  const visibleFiles = selectedFolderId === "all"
    ? getProjectFiles().filter((file) => {
        const folder = file.folderId ? getProjectFolders().find((item) => item.id === file.folderId) : null;
        return !folder;
      })
    : getProjectFiles().filter((file) => file.folderId === selectedFolderId);
  const visibleFolders = getProjectFolders().filter((folder) => (folder.parentId || null) === currentParentId);
  if (!visibleFiles.some((file) => file.id === selectedChatFileId)) selectedChatFileId = null;
  if (!visibleFolders.some((folder) => folder.id === selectedDocumentFolderId)) selectedDocumentFolderId = null;

  const mode = normalizeFinderViewMode(windowViewModes.documents);
  windowViewModes.documents = mode;
  const grid = documentIconGridEl;
  const signature = [
    activeProjectId,
    selectedFolderId,
    selectedChatFileId,
    selectedDocumentFolderId,
    mode,
    currentLanguage,
    collectionVersion(visibleFiles),
    collectionVersion(visibleFolders),
  ].join("::");
  if (shouldSkipRender("documents", signature)) return;
  const fragment = document.createDocumentFragment();

  documentsCountEl.textContent = t("items_count", visibleFiles.length + visibleFolders.length);
  documentsFolderLabelEl.textContent = selectedFolder ? getFolderPath(selectedFolder.id).join(" / ") : t("all_folders");
  documentsUpButton.hidden = true;
  renderFinderNavigationBar(getWindow("documents"));
  grid.dataset.dropTarget = "document-current-folder";
  grid.dataset.folderId = selectedFolder?.id || "";
  grid.replaceChildren();

  updateFinderViewButtons(getWindow("documents"), mode);
  setFinderViewClasses(grid, mode);

  const folderItems = visibleFolders.map(getDocumentFolderItem);
  const fileItems = visibleFiles.map(getProjectFileFinderItem);
  const sortedItems = sortFinderItemsForView([...folderItems, ...fileItems], mode);

  if (isFinderListMode(mode)) {

    const header = document.createElement("div");
    header.className = "finder-list-header";
    header.innerHTML = `
      <span>${t("file_name")}</span>
      <span>${t("kind")}</span>
      <span>${t("size")}</span>
      <span>${t("modified")}</span>
    `;
    fragment.append(header);

    let previousKind = "";
    sortedItems.forEach(item => {
      const kind = getFinderItemKindLabel(item);
      if (mode === "kind" && kind !== previousKind) {
        const group = document.createElement("div");
        group.className = "finder-list-group";
        group.textContent = kind;
        fragment.append(group);
        previousKind = kind;
      }

      const row = document.createElement("div");
      row.draggable = true;
      if (item.type === "folder") {
        const folder = item;
        const selected = selectedDocumentItemKeys.has(documentSelectionKey("folder", folder.id)) || folder.id === selectedDocumentFolderId;
        row.className = `finder-list-row finder-label-${folder.finderLabel || "none"}${selected ? " is-selected" : ""}`;
        row.dataset.dragType = "document-folder";
        row.dataset.id = folder.id;
        row.dataset.projectId = folder.projectId;
        row.dataset.dropTarget = "document-folder";
        row.dataset.folderId = folder.id;
        row.dataset.documentItemType = "folder";
        row.dataset.documentItemId = folder.id;
        row.innerHTML = `
          <span>${renderSystemIcon("folder", { size: "list"})}${escapeHtml(displayFolderName(folder.name))}</span>
          <span>${t("folder_kind")}</span>
          <span>${t("items_count", getProjectFolderDeepItemCount(folder.id))}</span>
          <span>${new Date(folder.updatedAt || folder.createdAt).toLocaleDateString()}</span>
        `;
        row.onclick = (event) => {
          selectDocumentItemFromEvent("folder", folder.id, event, sortedItems);
        };
        row.ondblclick = () => {
          openDocumentFolder(folder.id);
        };
      } else {
        const file = item;
        const selected = selectedDocumentItemKeys.has(documentSelectionKey("file", file.id)) || file.id === selectedChatFileId;
        row.className = `finder-list-row label-${file.label || "none"} finder-label-${file.finderLabel || "none"}${selected ? " is-selected" : ""}`;
        row.dataset.dragType = "file";
        row.dataset.id = file.id;
        row.dataset.projectId = file.projectId;
        row.dataset.documentItemType = "file";
        row.dataset.documentItemId = file.id;
        const fileKind = file.kindLabel || (file.type === "text" ? t("kind_teachtext") : t("kind_chat"));
        const icon = file.iconId || (file.type === "text" ? "teachText" : "chatFile");
        row.innerHTML = `
          <span>${renderSystemIcon(icon, { size: "list"})}${escapeHtml(file.name)}</span>
          <span>${fileKind}${file.label ? ` · ${escapeHtml(labelName(file.label))}` : ""}</span>
          <span>${getFinderItemSizeLabel(file)}</span>
          <span>${new Date(file.updatedAt || file.createdAt).toLocaleDateString()}</span>
        `;
        row.onclick = (event) => {
          selectDocumentItemFromEvent("file", file.id, event, sortedItems);
        };
        row.ondblclick = () => {
          openDocumentFileOrAttachToClioTalk(file);
        };
      }
      fragment.append(row);
    });

  } else {
    if (!visibleFolders.length && !visibleFiles.length) {
      const empty = document.createElement("div");
      empty.className = "empty-folder-note";
      empty.textContent = selectedFolder ? t("folder_empty") : t("save_chat_empty");
      fragment.append(empty);
    }

    sortedItems.forEach((item) => {
      if (item.type !== "folder") return;
      const folder = item;
      const button = document.createElement("button");
      button.type = "button";
      button.draggable = true;
      const selected = selectedDocumentItemKeys.has(documentSelectionKey("folder", folder.id)) || folder.id === selectedDocumentFolderId;
      button.className = `finder-item finder-label-${folder.finderLabel || "none"}${selected ? " is-selected" : ""}`;
      button.dataset.dragType = "document-folder";
      button.dataset.id = folder.id;
      button.dataset.projectId = folder.projectId;
      button.dataset.dropTarget = "document-folder";
      button.dataset.folderId = folder.id;
      button.dataset.documentItemType = "folder";
      button.dataset.documentItemId = folder.id;
      button.innerHTML = `${renderSystemIcon("folder", { size: "finder"})}<span>${escapeHtml(displayFolderName(folder.name))}</span>`;
      button.addEventListener("click", (event) => {
        selectDocumentItemFromEvent("folder", folder.id, event, sortedItems);
      });
      button.addEventListener("dblclick", () => {
        openDocumentFolder(folder.id);
      });
      fragment.append(button);
    });

    sortedItems.forEach((item) => {
      if (item.type === "folder") return;
      const file = item;
      const button = document.createElement("button");
      button.type = "button";
      button.draggable = true;
      button.dataset.dragType = "file";
      button.dataset.id = file.id;
      button.dataset.projectId = file.projectId;
      button.dataset.documentItemType = "file";
      button.dataset.documentItemId = file.id;
      const selected = selectedDocumentItemKeys.has(documentSelectionKey("file", file.id)) || file.id === selectedChatFileId;
      button.className = `finder-item label-${file.label || "none"} finder-label-${file.finderLabel || "none"}${selected ? " is-selected" : ""}`;
      const iconId = file.iconId || (file.type === "text" ? "teachText" : "chatFile");
      button.innerHTML = `${renderSystemIcon(iconId, { size: "finder"})}<span>${escapeHtml(file.name)}</span>${file.label ? `<small>${escapeHtml(labelName(file.label))}</small>` : ""}`;
      button.addEventListener("click", (event) => {
        selectDocumentItemFromEvent("file", file.id, event, sortedItems);
      });
      button.addEventListener("dblclick", () => {
        openDocumentFileOrAttachToClioTalk(file);
      });
      fragment.append(button);
    });
  }
  grid.append(fragment);

  renderFolderSuggestions();
  updateDocMapEntryButtons();
}

function renderChatTranscript(messages) {
  return `<div class="chat-transcript">${messages
    .map((item) => {
      const states = [];
      if (item.role === "assistant" && (item.stopped || item.incomplete)) {
        const stateKey = item.finishReason === "length"
          ? "clio_reply_output_limit"
          : ["content_filter", "insufficient_system_resource"].includes(item.finishReason)
            ? "clio_reply_provider_stopped"
            : item.finishReason === "interrupted"
              ? "clio_reply_interrupted"
              : "clio_reply_stopped";
        states.push(t(stateKey));
      }
      if (item.role === "user" && item.deliveryState === "failed") states.push(t("clio_message_not_sent"));
      const receiptState = clioTalkReplyReceiptState(item);
      if (item.role === "assistant" && receiptState !== "temporary") {
        states.push(t(clioTalkReplyReceiptKey(receiptState)));
      }
      const stateLine = states.length
        ? `<small>${states.map((state) => escapeHtml(state)).join(" · ")}</small>`
        : "";
      return `<article><b>${item.role === "user" ? t("you") : t("assistant")}</b><div>${markdownToSystemHtml(item.displayContent || item.content)}${stateLine}</div></article>`;
    })
    .join("")}</div>`;
}

function normalizeChatMessageRecords(messages = []) {
  return messages.map((item) => ({
    ...item,
    id: String(item.id || crypto.randomUUID()),
    role: item.role === "assistant" ? "assistant" : "user",
    content: String(item.content || ""),
    deliveryState: item.deliveryState === "sending" ? "failed" : String(item.deliveryState || ""),
    createdAt: String(item.createdAt || new Date().toISOString()),
  }));
}

function normalizeChatFileMetadata(file) {
  if (!file || file.type !== "chat") return file;
  const fallbackTime = String(file.createdAt || new Date().toISOString());
  file.messages = normalizeChatMessageRecords(file.messages || []);
  file.generation = Number.isFinite(Number(file.generation)) ? Number(file.generation) : 0;
  file.createdAt = fallbackTime;
  file.updatedAt = String(file.updatedAt || fallbackTime);
  file.titleMode = ["manual", "auto", "auto-summary"].includes(file.titleMode)
    ? file.titleMode
    : "auto";
  file.name = String(file.name || "Untitled Chat").trim() || "Untitled Chat";
  return file;
}

function getActiveConversationFile() {
  return activeChatFileId
    ? chatFiles.find((file) => file.id === activeChatFileId && file.type === "chat" && isInActiveProject(file)) || null
    : null;
}

function getRecentChatFiles(limit = 6) {
  return chatFiles
    .filter((file) => file.type === "chat" && isInActiveProject(file))
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0))
    .slice(0, Math.max(0, Number(limit) || 0));
}

function ensureProjectMemoryFolder() {
  const clioTalk = ensureFolder("ClioTalk", null);
  return ensureFolder("项目记忆", clioTalk.id);
}

function getProjectMemoryFiles({ activeOnly = false } = {}) {
  return getProjectFiles().filter((file) => (
    file.type === "text"
    && file.artifactKind === "project-memory"
    && (!activeOnly || file.memoryStatus !== "disabled")
  ));
}

async function createProjectMemoryDraft() {
  const chat = getActiveConversationFile();
  if (!chat || !getActiveProject()) return null;
  const lastUser = [...chat.messages].reverse().find((message) => message.role === "user");
  const lastAssistant = [...chat.messages].reverse().find((message) => message.role === "assistant");
  const title = await showInputDialog({
    title: currentLanguage === "zh" ? "项目记忆标题" : "Project memory title",
    defaultValue: chat.name,
  });
  if (!title?.trim()) return null;
  const body = await showInputDialog({
    title: currentLanguage === "zh" ? "项目记忆内容" : "Project memory content",
    message: currentLanguage === "zh" ? "确认要保存的项目记忆内容（可稍后在项目硬盘中编辑）：" : "Confirm the project memory to save (you can edit it later on the Project Hard Disk):",
    defaultValue: [lastUser?.content, lastAssistant?.content].filter(Boolean).join("\n\n").slice(0, 4000),
    multiline: true,
  });
  if (!body?.trim()) return null;
  const confirmed = await showSystemModal(
    currentLanguage === "zh"
      ? "确认将这份草稿保存为项目长期记忆？"
      : "Save this draft as durable Project Memory?",
    "confirm"
  ) === "yes";
  if (!confirmed) return null;
  const folder = ensureProjectMemoryFolder();
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(), projectId: activeProjectId, type: "text", artifactKind: "project-memory",
    name: nextAvailableFileName(title.trim()), folderId: folder.id, body: body.trim(),
    memoryStatus: "active", sourceChatId: chat.id,
    sourceMessageIds: [lastUser?.id, lastAssistant?.id].filter(Boolean),
    createdAt: now, updatedAt: now,
  };
  chatFiles.unshift(file);
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  return file;
}

function toggleSelectedProjectMemory() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "project-memory");
  if (!file) return false;
  file.memoryStatus = file.memoryStatus === "disabled" ? "active" : "disabled";
  file.updatedAt = new Date().toISOString();
  saveDeskState();
  renderDocuments();
  return true;
}

async function summarizeChatTitle(file, { force = false } = {}) {
  if (!file || file.type !== "chat" || file.titleMode === "manual") return false;
  if (!force && (file.titleSummaryAt || file.titleSummaryAttemptedAt || file.titleSummaryPending || (file.messages || []).length < 4)) return false;
  const excerpt = (file.messages || []).slice(0, 6)
    .map((message) => `${message.role}: ${String(message.content || "").replace(/\s+/g, " ").slice(0, 360)}`)
    .join("\n")
    .slice(0, 1800);
  if (!excerpt || typeof fetchModelPayload !== "function") return false;
  file.titleSummaryAttemptedAt = new Date().toISOString();
  file.titleSummaryPending = true;
  try {
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: [
        { role: "system", content: "Write one concise 3-8 word chat title. Preserve the user's language. Return only the title; no punctuation decoration." },
        { role: "user", content: excerpt },
      ],
      temperature: 0.2,
      max_tokens: 24,
      ai_system6_task_kind: "chat-title",
    });
    const data = await readChatJson(response);
    const title = String(data?.choices?.[0]?.message?.content || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!title || file.titleMode === "manual") return false;
    file.name = title;
    file.titleMode = "auto-summary";
    file.titleSummaryAt = new Date().toISOString();
    file.updatedAt = file.titleSummaryAt;
    saveDeskState();
    renderDocuments();
    return true;
  } catch {
    return false;
  } finally {
    delete file.titleSummaryPending;
  }
}

function persistActiveChatFile() {
  const file = getActiveConversationFile();
  if (!file) {
    if (typeof renderClioTalkFileBar === "function") renderClioTalkFileBar();
    return null;
  }
  normalizeChatFileMetadata(file);
  file.messages = normalizeChatMessageRecords(conversation);
  file.compressedMemory = { ...compressedConversationMemory };
  file.updatedAt = new Date().toISOString();
  saveDeskState();
  renderDocuments();
  if (typeof renderClioTalkFileBar === "function") renderClioTalkFileBar();
  void summarizeChatTitle(file);
  return file;
}

function ensureCurrentConversationFile() {
  const existing = persistActiveChatFile();
  if (existing) return existing;
  if (!conversation.length || !getActiveProject()) return null;

  const folder = (typeof getPendingClioTalkFolder === "function" ? getPendingClioTalkFolder() : null)
    || ensureFolder(preferredFolderName());
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "chat",
    name: typeof getPendingClioTalkFileName === "function" ? getPendingClioTalkFileName() : getChatFileTitle(),
    folderId: folder.id,
    messages: normalizeChatMessageRecords(conversation),
    compressedMemory: { ...compressedConversationMemory },
    generation: 0,
    titleMode: "auto",
    titleAutoGeneratedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  activeChatFileId = file.id;
  if (typeof pendingClioTalkFileName !== "undefined") pendingClioTalkFileName = "";
  selectedChatFileId = file.id;
  saveDeskState();
  renderDocuments();
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
  return file;
}

async function confirmDiscardTemporaryClioTalkConversation() {
  if (!clioTalkTemporaryMode || !conversation.length) return true;
  const result = await showSystemModal(t("clio_temporary_chat_discard_confirm"), "confirm", {
    confirmKey: "clio_discard_conversation",
    defaultAction: "cancel",
    danger: true,
  });
  return result === "yes";
}

function resetNextClioTalkRunSelection() {
  window.nextTaskSkillIds = new Set();
  window.nextTaskRetrospectiveIds = new Set();
  window.nextTaskHarnessFileId = "";
  window.nextTaskInputFileIds = new Set();
}

async function startNewClioTalkConversation() {
  if (activeAbortController) {
    setStatus(t("task_already_running", localModelState.task || t("working_locally")));
    return false;
  }
  if (!await confirmDiscardTemporaryClioTalkConversation()) return false;
  if (typeof isQuickDraftClioTalkActive === "function" && isQuickDraftClioTalkActive()) {
    window.AISystem6QuickDraft?.clearVentLog?.({ silent: true });
  } else if (!clioTalkTemporaryMode) {
    persistActiveChatFile();
  }
  clioTalkTemporaryMode = false;
  resetClioTalkRuntimeState({ clearPrompt: true });
  resetNextClioTalkRunSelection();
  setStatus(t("clio_new_chat_ready"));
  saveDeskState();
  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  return true;
}

async function startTemporaryClioTalkConversation() {
  if (activeAbortController) {
    setStatus(t("task_already_running", localModelState.task || t("working_locally")));
    return false;
  }
  if (!await confirmDiscardTemporaryClioTalkConversation()) return false;
  if (sideAskEnabled && typeof clearSideAskMode === "function") {
    clearSideAskMode();
    if (typeof resetAssistantForStandalonePlacement === "function") {
      resetAssistantForStandalonePlacement(getWindow("assistant"));
    }
  }
  if (!clioTalkTemporaryMode) persistActiveChatFile();
  clioTalkTemporaryMode = true;
  resetClioTalkRuntimeState({ clearPrompt: true });
  resetNextClioTalkRunSelection();
  setStatus(t("clio_temporary_chat_ready"));
  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  return true;
}

function discardTemporaryClioTalkConversation() {
  if (!clioTalkTemporaryMode) return false;
  clioTalkTemporaryMode = false;
  resetClioTalkRuntimeState({ clearPrompt: true });
  resetNextClioTalkRunSelection();
  setStatus(t("ready"));
  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  return true;
}

function ensureClioTalkRunRecordsFolder() {
  const clioTalk = ensureFolder("ClioTalk", null);
  return ensureFolder("Run Records", clioTalk.id);
}

function cloneClioRunManifest(manifest) {
  try {
    return JSON.parse(JSON.stringify(manifest || {}));
  } catch {
    return {};
  }
}

function formatClioTalkRunRecordBody(record) {
  const manifest = record.manifest || {};
  const lines = [
    `# ${record.name}`,
    "",
    `- Status: ${record.status}`,
    `- Time: ${record.createdAt}`,
    `- Chat: ${record.chatName || "—"} [${record.sourceChatId || "—"}]`,
    `- Message: ${record.sourceMessageId || "—"}`,
    `- Scope: ${manifest.scope || "application-supplied"}`,
    `- Model: ${manifest.model || "—"}`,
    `- Task: ${manifest.taskKind || "chat"}`,
    `- Temperature: ${Number.isFinite(manifest.parameters?.temperature) ? manifest.parameters.temperature : "—"}`,
    `- Max tokens: ${manifest.parameters?.maxTokens || "—"}`,
    `- Stream: ${manifest.parameters?.stream ? "yes" : "no"}`,
    record.error ? `- Error: ${record.error}` : "",
    "",
    "## Prompt files",
    "",
    ...(manifest.promptFiles || []).flatMap((file, index) => [
      `### P${index + 1} · ${file.name}`,
      `- ID: ${file.id || "—"}`,
      `- Path: ${file.path || "—"}`,
      `- Source: ${file.source || "—"}`,
      `- Hash: ${file.hash || "—"}`,
      "",
      file.body || "",
      "",
    ]),
    "## Exact application message stack",
    "",
    ...(manifest.messageStack || []).flatMap((message) => [
      `### ${Number(message.index) + 1} · ${message.role} · ${message.label}`,
      `- Hash: ${message.hash}`,
      "",
      message.body || "",
      "",
    ]),
    "## Skills",
    "",
    ...((manifest.skillFiles || []).length ? manifest.skillFiles : [{ name: "None" }]).flatMap((file, index) => [
      `### S${index + 1} · ${file.name}`,
      file.id ? `- ID: ${file.id}` : "",
      file.version ? `- Version: ${file.version}` : "",
      file.reason ? `- Reason: ${file.reason}` : "",
      file.hash ? `- Hash: ${file.hash}` : "",
      file.body ? `\n${file.body}\n` : "",
    ]),
    "## Harness",
    "",
    manifest.harnessFile
      ? [
          `- Name: ${manifest.harnessFile.name}`,
          `- ID: ${manifest.harnessFile.id}`,
          `- Path: ${manifest.harnessFile.path || "—"}`,
          `- Hash: ${manifest.harnessFile.hash}`,
          "",
          manifest.harnessFile.body || "",
        ].join("\n")
      : "Direct chat · no Harness file",
    "",
    "## Inputs",
    "",
    ...((manifest.inputFiles || []).length ? manifest.inputFiles : [{ name: "None" }]).flatMap((file, index) => [
      `### I${index + 1} · ${file.name}`,
      file.id ? `- ID: ${file.id}` : "",
      file.kind ? `- Kind: ${file.kind}` : "",
      file.path ? `- Path: ${file.path}` : "",
      file.hash ? `- Hash: ${file.hash}` : "",
      "",
    ]),
    "## Result use",
    "",
    record.resultUse
      ? [
          `- Status: ${record.resultUse.status || "applied"}`,
          `- Destination: ${record.resultUse.targetName || record.resultUse.targetType || "—"} [${record.resultUse.targetId || "—"}]`,
          `- Operation: ${record.resultUse.operation || "—"}`,
          `- Applied: ${record.resultUse.appliedAt || "—"}`,
          record.resultUse.undoneAt ? `- Undone: ${record.resultUse.undoneAt}` : "",
          `- Before hash: ${record.resultUse.beforeHash || "—"}`,
          `- After hash: ${record.resultUse.afterHash || "—"}`,
        ].filter(Boolean).join("\n")
      : "Reply remains temporary writing material.",
    "",
    "## Visibility boundary",
    "",
    manifest.scopeNote || "This record contains the exact application-supplied stack. Provider-side rules, if any, are outside the app.",
  ];
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n").trim();
}

function saveClioTalkRunRecord({ chatFile, messageRecord, manifest, status = "completed", error = "" } = {}) {
  const project = getActiveProject();
  const chat = chatFile || getActiveConversationFile();
  if (!project || !chat || !messageRecord) return null;
  const folder = ensureClioTalkRunRecordsFolder();
  const now = new Date().toISOString();
  const shortTime = now.replace("T", " ").replace(/\.\d{3}Z$/, "");
  const recordData = {
    schemaVersion: 1,
    name: `Run ${shortTime}`,
    status,
    createdAt: now,
    sourceChatId: chat.id,
    sourceMessageId: messageRecord.id,
    chatName: chat.name,
    error: String(error || ""),
    manifest: cloneClioRunManifest(manifest),
    resultUse: messageRecord.replyReceipt?.delivery
      ? cloneClioRunManifest(messageRecord.replyReceipt.delivery)
      : null,
  };
  const body = formatClioTalkRunRecordBody(recordData);
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    folderId: folder.id,
    type: "text",
    artifactKind: "clio-run-record",
    name: nextAvailableFileName(recordData.name, folder.id),
    body,
    hash: contentHash(body),
    runRecord: recordData,
    sourceChatId: chat.id,
    sourceMessageId: messageRecord.id,
    createdAt: now,
    updatedAt: now,
  };
  // One shared Run Receipt writer: the adapter keeps the ClioTalk-specific
  // record shape, while persistence, refresh, and listeners live in the
  // run-receipts module (single system, no second parallel store).
  const persisted = window.AISystem6RunReceipts?.persistReceiptFileSync?.(file);
  return persisted?.ok ? file : null;
}

function conversationLineage(file) {
  if (!file) return { parent: null, children: [] };
  return {
    parent: file.parentChatId
      ? chatFiles.find((item) => item.id === file.parentChatId && item.type === "chat" && isInActiveProject(item)) || null
      : null,
    children: chatFiles.filter((item) => item.type === "chat" && item.parentChatId === file.id && isInActiveProject(item)),
    missingParentId: file.parentChatId && !chatFiles.some((item) => item.id === file.parentChatId && item.type === "chat" && isInActiveProject(item))
      ? file.parentChatId
      : "",
  };
}

function renderChatLineage(file) {
  const { parent, children, missingParentId } = conversationLineage(file);
  if (!parent && !children.length && !missingParentId) return null;

  const lineage = document.createElement("div");
  lineage.className = "button-row chat-lineage";
  const label = document.createElement("strong");
  label.textContent = t("clio_genealogy");
  lineage.append(label);

  if (parent) {
    const parentButton = document.createElement("button");
    parentButton.type = "button";
    parentButton.className = "btn mini-btn";
    parentButton.textContent = t("clio_open_parent", parent.name);
    parentButton.onclick = () => openChatFileWindow(parent.id);
    lineage.append(parentButton);
  } else if (missingParentId) {
    const missing = document.createElement("span");
    missing.textContent = currentLanguage === "zh" ? "父对话文件不可用" : "Parent chat file unavailable";
    lineage.append(missing);
  }
  children.forEach((child) => {
    const childButton = document.createElement("button");
    childButton.type = "button";
    childButton.className = "btn mini-btn";
    childButton.textContent = t("clio_open_branch", child.name);
    childButton.onclick = () => openChatFileWindow(child.id);
    lineage.append(childButton);
  });
  return lineage;
}

async function editAndResendConversationMessage({ messageId = "", messageIndex = -1, content = "" } = {}) {
  if (activeAbortController) {
    setStatus(t("task_already_running", localModelState.task || t("working_locally")));
    return null;
  }
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }

  const index = conversation.findIndex((item, candidateIndex) => (
    (messageId && item.id === messageId)
    || (!messageId && candidateIndex === messageIndex)
  ));
  const fallbackIndex = index >= 0
    ? index
    : conversation.findIndex((item) => item.role === "user" && item.content === content);
  if (fallbackIndex < 0) return null;

  const edited = await showInputDialog({
    message: t("clio_edit_and_resend_prompt"),
    defaultValue: content,
    multiline: true,
  });
  if (!edited?.trim() || edited.trim() === content.trim()) return null;

  const parent = ensureCurrentConversationFile();
  if (!parent) return null;
  const now = new Date().toISOString();
  const siblingNumber = conversationLineage(parent).children.length + 1;
  const branch = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "chat",
    name: `${parent.name} — ${t("clio_branch_name", siblingNumber)}`,
    folderId: parent.folderId || null,
    messages: normalizeChatMessageRecords(conversation.slice(0, fallbackIndex)),
    compressedMemory: { text: "", sourceMessages: 0, updatedAt: "" },
    parentChatId: parent.id,
    forkMessageId: conversation[fallbackIndex]?.id || "",
    forkMessageIndex: fallbackIndex,
    generation: Number(parent.generation || 0) + 1,
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(branch);
  activeChatFileId = branch.id;
  selectedChatFileId = branch.id;
  conversation.length = 0;
  conversation.push(...branch.messages.map((item) => ({ ...item })));
  compressedConversationMemory = { ...branch.compressedMemory };
  messagesEl.replaceChildren();
  conversation.forEach((item, candidateIndex) => addMessage(item.role, item.content, {
    messageRecord: item,
    messageIndex: candidateIndex,
    grounding: item.grounding || null,
  }));
  renderClioTalkWelcome();
  saveDeskState();
  renderDocuments();
  setStatus(t("clio_branch_created", branch.name));
  await submitUserText(edited.trim(), { taskKind: "chat", branchChatId: branch.id });
  return branch;
}

function activeChatArtifactContext() {
  const file = ensureCurrentConversationFile();
  if (!file) {
    setStatus(t("no_chat_to_save"));
    return null;
  }
  const lineage = conversationLineage(file);
  return { file, lineage };
}

function saveClioTalkArtifact(kind, name, body) {
  if (!getActiveProject()) return null;
  const folder = ensureFolder(t("clio_records_folder"));
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    artifactKind: kind,
    name: nextAvailableFileName(name, folder.id),
    folderId: folder.id,
    body,
    label: "",
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  selectedChatFileId = file.id;
  saveDeskState();
  renderDocuments();
  openTextFile(file.id);
  setStatus(t("clio_artifact_saved", file.name));
  return file;
}

function saveClioTalkHarness() {
  const context = activeChatArtifactContext();
  if (!context) return null;
  const { file } = context;
  const assistantRuns = file.messages.filter((item) => item.role === "assistant");
  const sourceNames = [...new Set(assistantRuns.flatMap((item) => item.harness?.contextSources || []).map((source) => source.label).filter(Boolean))];
  const models = [...new Set(assistantRuns.map((item) => item.harness?.model).filter(Boolean))];
  const body = [
    `# ${file.name} — Harness`,
    "",
    `- Chat ID: ${file.id}`,
    `- Parent Chat ID: ${file.parentChatId || "root"}`,
    `- Generation: ${Number(file.generation || 0)}`,
    `- Model: ${models.join(", ") || t("clio_not_recorded")}`,
    `- Sources: ${sourceNames.join(", ") || t("clio_no_sources_recorded")}`,
    `- Compressed memory messages: ${Number(file.compressedMemory?.sourceMessages || 0)}`,
    "",
    "## Run records",
    "",
    ...assistantRuns.flatMap((item, index) => [
      `### Run ${index + 1}`,
      `- Task: ${item.harness?.taskKind || "chat"}`,
      `- Model: ${item.harness?.model || t("clio_not_recorded")}`,
      `- Sources: ${(item.harness?.contextSources || []).map((source) => source.label).filter(Boolean).join(", ") || t("clio_no_sources_recorded")}`,
      "",
    ]),
  ].join("\n").trim();
  const draft = saveClioTalkArtifact("task-config-draft", `${file.name} Task Config Draft`, body);
  if (draft) draft.taskConfigStatus = "draft";
  return draft;
}

function parseTaskConfig(file) {
  if (!file || file.artifactKind !== "task-config") return { valid: false, reason: "not a task config" };
  let config = file.taskConfig || {};
  try { config = JSON.parse(String(file.body || "{}")); } catch { return { valid: false, reason: "invalid task config JSON" }; }
  file.taskConfig = config;
  const required = ["id", "title", "goal", "inputFileIds", "skillIds", "outputTarget", "outputFormat", "acceptance", "onFailure"];
  const missing = required.filter((key) => config[key] === undefined || config[key] === "");
  if (missing.length) return { valid: false, reason: `missing ${missing.join(", ")}` };
  if (!Array.isArray(config.inputFileIds) || !Array.isArray(config.skillIds)) return { valid: false, reason: "inputs and skills must be arrays" };
  if (!["chat", "teachtext"].includes(config.outputTarget)) return { valid: false, reason: "invalid output target" };
  return { valid: true, config };
}

async function runSelectedTaskConfig() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "task-config");
  const parsed = parseTaskConfig(file);
  if (!parsed.valid) return null;
  const { config } = parsed;
  const taskFolder = ensureTaskFolderForConfig(file, config);
  const inputs = config.inputFileIds.map((id) => getProjectFiles().find((item) => item.id === id)).filter(Boolean);
  if (inputs.length !== config.inputFileIds.length) return null;
  const skills = config.skillIds.map((id) => getProjectFiles().find((item) => item.id === id && item.skillStatus === "enabled")).filter(Boolean);
  if (skills.length !== config.skillIds.length) return null;
  window.nextTaskSkillIds = new Set(skills.map((skill) => skill.id));
  window.nextTaskHarnessFileId = file.id;
  window.nextTaskInputFileIds = new Set(inputs.map((input) => input.id));
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
  const inputText = inputs.map((input) => `# ${input.name}\n\n${input.body || formatChatFile(input)}`).join("\n\n");
  const request = `${config.goal}\n\n${inputText}\n\nAcceptance: ${config.acceptance}\nOn failure: ${config.onFailure}`;
  const teachTextTarget = config.outputTarget === "teachtext" ? getTeachTextFile() : null;
  if (config.outputTarget === "teachtext" && !teachTextTarget) return null;
  if (config.outputTarget === "teachtext") openWindow("teachText"); else openWindow("assistant");
  await submitUserText(request, { taskKind: "task-config", maxTokens: 4096 });
  const lastRunMessage = [...conversation].reverse().find((message) => message.runRecordId);
  const receipt = lastRunMessage?.runRecordId
    ? getProjectFiles().find((item) => item.id === lastRunMessage.runRecordId && item.artifactKind === "clio-run-record")
    : null;
  if (receipt) {
    receipt.taskFolderId = taskFolder.id;
    receipt.taskConfigId = config.id;
  }
  if (teachTextTarget && lastAssistantText) {
    await createTeachTextModificationSuggestion(teachTextTarget, lastAssistantText, { taskConfigId: config.id, runRecordId: receipt?.id || "" });
  }
  saveDeskState();
  return file;
}

function contentHash(body = "") {
  return window.AISystem6PromptFilesRuntime?.hashPromptBody(String(body || "")) || String(body || "").length.toString(16);
}

async function createTeachTextModificationSuggestion(target, suggestedText, { taskConfigId = "", runRecordId = "" } = {}) {
  if (!target || !String(suggestedText || "").trim()) return null;
  if (typeof createDocumentRevision === "function") {
    try {
      await createDocumentRevision({
        documentId: target.id,
        body: target.body,
        origin: "model",
        operation: "proposal-before",
        runRecordId,
      });
    } catch (error) {
      // The pre-proposal revision is the recovery point for an AI overwrite;
      // without it the suggestion must not proceed.
      setStatus(currentLanguage === "zh"
        ? "无法保存建议前的版本历史，AI 建议未生成。"
        : "Could not save the pre-proposal version history; the suggestion was not created.");
      return null;
    }
  }
  const folder = ensureFolder("Modification Suggestions", null);
  const now = new Date().toISOString();
  const originalHash = contentHash(target.body);
  const file = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "teachtext-modification-suggestion", name: `${target.name} ${currentLanguage === "zh" ? "修改建议" : "Modification Suggestion"}`, body: String(suggestedText).trim(), suggestion: { targetFileId: target.id, originalHash, targetRange: { start: 0, end: String(target.body || "").length }, suggestedText: String(suggestedText).trim(), reason: currentLanguage === "zh" ? "任务配置的 TeachText 输出先保存为待确认修改建议。" : "Task Config TeachText output is saved as a pending modification suggestion.", taskConfigId, runRecordId, status: "pending" }, createdAt: now, updatedAt: now };
  chatFiles.unshift(file); saveDeskState(); renderDocuments(); renderProjectDisks(); return file;
}

function selectedTeachTextModificationSuggestion() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "teachtext-modification-suggestion");
  return file?.suggestion?.status === "pending" ? file : null;
}

async function viewSelectedTeachTextModificationSuggestionDiff() {
  const suggestionFile = selectedTeachTextModificationSuggestion();
  if (!suggestionFile) return false;
  const suggestion = suggestionFile.suggestion;
  const target = getProjectFiles().find((item) => item.id === suggestion.targetFileId && item.type === "text");
  await showSystemModal([currentLanguage === "zh" ? "修改建议差异" : "Modification suggestion diff", `Target: ${target?.name || suggestion.targetFileId}`, `Original hash: ${suggestion.originalHash}`, "", "--- Original ---", target?.body || "(missing)", "", "--- Suggested ---", suggestion.suggestedText, "", suggestion.reason].join("\n"));
  return true;
}

function rejectSelectedTeachTextModificationSuggestion() {
  const file = selectedTeachTextModificationSuggestion();
  if (!file) return false;
  file.suggestion.status = "rejected"; file.suggestion.rejectedAt = new Date().toISOString(); file.updatedAt = file.suggestion.rejectedAt;
  if (file.suggestion.runRecordId) {
    window.AISystem6RunReceipts?.recordUserAction?.(file.suggestion.runRecordId, { action: "reject" });
  }
  saveDeskState(); renderDocuments(); renderProjectDisks(); return true;
}

async function acceptSelectedTeachTextModificationSuggestion() {
  const file = selectedTeachTextModificationSuggestion();
  if (!file) return false;
  const suggestion = file.suggestion;
  const target = getProjectFiles().find((item) => item.id === suggestion.targetFileId && item.type === "text");
  if (!target || contentHash(target.body) !== suggestion.originalHash) {
    setStatus(currentLanguage === "zh" ? "正文已变化，不能盲目套用建议；请重新生成或人工处理。" : "The manuscript changed; do not apply this suggestion blindly. Regenerate it or handle it manually.");
    return false;
  }
  const oldHash = contentHash(target.body);
  if (typeof createDocumentRevision === "function") {
    try {
      await createDocumentRevision({
        documentId: target.id,
        body: target.body,
        origin: "model",
        operation: "accept-proposal",
        runRecordId: suggestion.runRecordId || "",
      });
    } catch (error) {
      setStatus(currentLanguage === "zh"
        ? "无法保存接受建议前的版本历史，正文未被覆盖。"
        : "Could not save the pre-accept version history; the manuscript was not overwritten.");
      return false;
    }
  }
  target.body = suggestion.suggestedText; target.updatedAt = new Date().toISOString();
  const newHash = contentHash(target.body);
  suggestion.status = "accepted"; suggestion.acceptedAt = target.updatedAt; suggestion.oldHash = oldHash; suggestion.newHash = newHash;
  if (target.id === activeTextFileId) { teachTextBodyInput.value = target.body; markTeachTextModified(); refreshTeachTextDocumentState(); }
  if (suggestion.runRecordId) {
    window.AISystem6RunReceipts?.recordUserAction?.(suggestion.runRecordId, { action: "accept", finalBodyHash: newHash });
  }
  const receipt = saveClioTalkArtifact("teachtext-modification-acceptance-receipt", `${target.name} ${currentLanguage === "zh" ? "修改接受记录" : "Modification Acceptance Receipt"}`, `Target file ID: ${target.id}\nOld hash: ${oldHash}\nNew hash: ${newHash}\nSuggestion ID: ${file.id}\nRun record ID: ${suggestion.runRecordId || ""}`);
  if (receipt) suggestion.acceptanceRunRecordId = receipt.id;
  saveDeskState(); renderDocuments(); renderProjectDisks(); return true;
}

function ensureTaskFolderForConfig(file, config) {
  const root = ensureFolder(config.title || file.name, null);
  ["Conversation", "Task Config", "Context", "Artifacts", "Run Records", "Retrospective", "Checkpoints"].forEach((name) => ensureFolder(name, root.id));
  file.taskFolderId = root.id;
  return root;
}

function taskConfigForCheckpoint() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "task-config");
  const parsed = parseTaskConfig(file);
  return parsed.valid ? { file, config: parsed.config } : null;
}

function taskCheckpointContextSources(chat) {
  const assistant = [...(chat?.messages || [])].reverse().find((message) => message.role === "assistant");
  return (assistant?.grounding?.sources || []).map((source) => ({ key: source.key || "", label: source.label || "", kind: source.kind || "" }));
}

function createTaskCheckpoint() {
  const task = taskConfigForCheckpoint();
  if (!task) return null;
  const root = ensureTaskFolderForConfig(task.file, task.config);
  const folder = ensureFolder("Checkpoints", root.id);
  const chatId = task.file.taskLifecycle?.chatId || activeChatFileId || "";
  const chat = getProjectFiles().find((item) => item.id === chatId && item.type === "chat");
  const taskConfigHash = contentHash(JSON.stringify(task.config));
  const artifacts = getProjectFiles().filter((item) => item.sourceChatId === chatId || item.taskConfigId === task.config.id).map((item) => ({ id: item.id, name: item.name, version: contentHash(item.body), artifactKind: item.artifactKind || item.type }));
  const pendingSuggestions = getProjectFiles().filter((item) => item.artifactKind === "teachtext-modification-suggestion" && item.suggestion?.status === "pending").map((item) => item.id);
  const now = new Date().toISOString();
  const checkpoint = { schemaVersion: 1, taskConfigFileId: task.file.id, taskConfigId: task.config.id, taskConfigHash, chatId, contextSources: taskCheckpointContextSources(chat), artifacts, pendingSuggestionIds: pendingSuggestions, createdAt: now };
  const file = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "task-checkpoint", name: `${task.config.title || task.file.name} ${currentLanguage === "zh" ? "检查点" : "Checkpoint"} ${now}`, body: JSON.stringify(checkpoint, null, 2), checkpoint, createdAt: now, updatedAt: now };
  chatFiles.unshift(file); saveDeskState(); renderDocuments(); renderProjectDisks(); return file;
}

function parseTaskCheckpoint(file) {
  if (!file || file.artifactKind !== "task-checkpoint") return null;
  try {
    const checkpoint = JSON.parse(String(file.body || "{}"));
    return checkpoint.schemaVersion === 1 && checkpoint.taskConfigFileId ? checkpoint : null;
  } catch { return null; }
}

function saveTaskCheckpointRestoreReceipt(checkpoint, taskFile) {
  const folder = ensureFolder(t("clio_records_folder"));
  const now = new Date().toISOString();
  const file = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "task-checkpoint-restore-receipt", name: `${currentLanguage === "zh" ? "检查点恢复运行记录" : "Checkpoint Restore Run Receipt"} ${now}`, body: `Checkpoint task config ID: ${checkpoint.taskConfigId}\nTask config hash: ${checkpoint.taskConfigHash}\nChat ID: ${checkpoint.chatId}\nPending suggestion IDs: ${checkpoint.pendingSuggestionIds.join(", ") || "—"}\nRestored task config file: ${taskFile.id}\nNo later files were removed.`, createdAt: now, updatedAt: now };
  chatFiles.unshift(file); saveDeskState(); renderDocuments(); renderProjectDisks(); return file;
}

async function restoreSelectedTaskCheckpoint() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "task-checkpoint");
  const checkpoint = parseTaskCheckpoint(file);
  const taskFile = checkpoint && getProjectFiles().find((item) => item.id === checkpoint.taskConfigFileId && item.artifactKind === "task-config");
  if (!checkpoint || !taskFile) return false;
  const currentChatId = taskFile.taskLifecycle?.chatId || "";
  await showSystemModal([currentLanguage === "zh" ? "恢复检查点将切换以下任务引用：" : "Restoring this checkpoint will switch these task references:", `Chat: ${currentChatId || "—"} → ${checkpoint.chatId || "—"}`, `Task Config hash: ${contentHash(JSON.stringify(parseTaskConfig(taskFile).config || {}))} → ${checkpoint.taskConfigHash}`, `${currentLanguage === "zh" ? "待处理修改建议" : "Pending modification suggestions"}: ${checkpoint.pendingSuggestionIds.join(", ") || "—"}`, currentLanguage === "zh" ? "不会删除检查点之后创建的文件。" : "No files created after the checkpoint will be removed."].join("\n"));
  if ((await showSystemModal(
    currentLanguage === "zh" ? "确认恢复这些任务引用？" : "Restore these task references?",
    "confirm"
  )) !== "yes") return false;
  taskFile.taskLifecycle = { ...(taskFile.taskLifecycle || {}), state: "running", chatId: checkpoint.chatId, taskFolderId: taskFile.taskFolderId || "", restoredCheckpointId: file.id, updatedAt: new Date().toISOString() };
  selectedChatFileId = taskFile.id;
  if (checkpoint.chatId) openChatFileWindow(checkpoint.chatId);
  saveTaskCheckpointRestoreReceipt(checkpoint, taskFile);
  return true;
}

function setTaskConfigLifecycle(state) {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "task-config");
  const parsed = parseTaskConfig(file);
  if (!parsed.valid) return false;
  file.taskLifecycle = { ...(file.taskLifecycle || {}), state, chatId: activeChatFileId || "", taskFolderId: file.taskFolderId || "", updatedAt: new Date().toISOString() };
  saveDeskState();
  return true;
}

function resumeSelectedTaskConfig() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "task-config");
  const chatId = file?.taskLifecycle?.chatId;
  if (!file || !chatId) return false;
  openChatFileWindow(chatId);
  setTaskConfigLifecycle("running");
  return true;
}

function createTaskConfigFromSelectedDraft() {
  const draft = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "task-config-draft");
  if (!draft) return null;
  const now = new Date().toISOString();
  const folder = ensureFolder("Task Configs", null);
  const config = { id: crypto.randomUUID(), title: draft.name.replace(/ Task Config Draft$/, ""), goal: "", inputFileIds: [], skillIds: [], outputTarget: "chat", outputFormat: "markdown", acceptance: "", onFailure: "report failure" };
  const file = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "task-config", name: `${config.title} Task Config`, body: JSON.stringify(config, null, 2), taskConfig: config, sourceDraftId: draft.id, createdAt: now, updatedAt: now };
  chatFiles.unshift(file); saveDeskState(); renderDocuments(); renderProjectDisks(); return file;
}

function saveClioTalkSkillDraft() {
  const context = activeChatArtifactContext();
  if (!context) return null;
  const { file } = context;
  const userRequests = file.messages.filter((item) => item.role === "user").map((item) => `- ${item.content}`);
  const body = [
    `# ${file.name} Skill`,
    "",
    "## Purpose",
    "",
    userRequests[0] || `- ${file.name}`,
    "",
    "## When to use",
    "",
    "- Reuse this workflow when a new task has the same goal, inputs, and acceptance boundary.",
    "",
    "## Workflow",
    "",
    ...userRequests,
    "",
    "## Harness requirements",
    "",
    "- Record model, attached sources, constraints, outputs, and verification evidence.",
    "- Keep project facts in project files; keep transient reasoning out of durable memory.",
    "",
    "## Review checklist",
    "",
    "- [ ] Outcome matches the original request",
    "- [ ] Sources and assumptions are traceable",
    "- [ ] Help and product behavior still agree",
  ].join("\n").trim();
  return saveClioTalkArtifact("skill-draft", `${file.name} SKILL`, body);
}

function parseProjectSkillFile(file) {
  if (!file || file.artifactKind !== "ai-skill") return { valid: false, reason: "not a skill file" };
  const manifest = file.skillManifest || {};
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  if (!manifest.id || !manifest.name || !manifest.version) return { valid: false, reason: "missing id, name, or version" };
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(manifest.id) || /\.\.|[\\/]/.test(manifest.id)) return { valid: false, reason: "invalid skill id path" };
  if (capabilities.some((capability) => !["prompt", "references"].includes(capability))) return { valid: false, reason: "unknown capability" };
  if (/\b(script|scripts|write|filesystem|shell)\b/i.test(JSON.stringify(manifest))) return { valid: false, reason: "scripts or write scope are not allowed" };
  if (!String(file.body || "").trim()) return { valid: false, reason: "missing SKILL.md prompt" };
  return { valid: true, manifest, references: Array.isArray(file.skillReferences) ? file.skillReferences : [] };
}

function getEnabledProjectSkills() {
  return getProjectFiles()
    .filter((file) => file.artifactKind === "ai-skill" && file.skillStatus === "enabled")
    .map((file) => ({ file, parsed: parseProjectSkillFile(file) }))
    .filter((entry) => entry.parsed.valid);
}

function getSkillAutoCallSettingsFile({ create = false } = {}) {
  let file = getProjectFiles().find((item) => item.artifactKind === "skill-auto-call-settings");
  if (file || !create || !activeProjectId) return file || null;
  const folder = ensureFolder("Project Settings", null);
  const now = new Date().toISOString();
  file = {
    id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "skill-auto-call-settings",
    name: currentLanguage === "zh" ? "技能自动调用状态.json" : "Skill Auto Call Status.json",
    body: JSON.stringify({ enabled: false, allowedSkillIds: [], readScopes: ["project"] }, null, 2),
    skillAutoCall: { enabled: false, allowedSkillIds: [], readScopes: ["project"] }, createdAt: now, updatedAt: now,
  };
  chatFiles.unshift(file); saveDeskState(); renderDocuments(); renderProjectDisks();
  return file;
}

function readSkillAutoCallSettings() {
  const file = getSkillAutoCallSettingsFile();
  if (!file) return { enabled: false, allowedSkillIds: [], readScopes: ["project"] };
  try {
    const parsed = JSON.parse(String(file.body || "{}"));
    return {
      enabled: parsed.enabled === true,
      allowedSkillIds: Array.isArray(parsed.allowedSkillIds) ? parsed.allowedSkillIds : [],
      readScopes: Array.isArray(parsed.readScopes) ? parsed.readScopes : ["project"],
    };
  } catch {
    return { enabled: false, allowedSkillIds: [], readScopes: ["project"] };
  }
}

function getAutoCallableProjectSkills(userText = "") {
  const settings = readSkillAutoCallSettings();
  if (!settings.enabled) return [];
  const allowed = new Set(settings.allowedSkillIds);
  return suggestProjectSkillsForTask(userText).filter(({ file, parsed }) => (
    allowed.has(file.id)
    && parsed.manifest.capabilities.every((capability) => ["prompt", "references"].includes(capability))
    && Array.isArray(parsed.manifest.readScopes)
    && parsed.manifest.readScopes.length > 0
    && parsed.manifest.readScopes.every((scope) => scope === "project")
  ));
}

async function configureSkillAutoCall() {
  const file = getSkillAutoCallSettingsFile({ create: true });
  if (!file) return false;
  const eligible = getEnabledProjectSkills().filter(({ parsed }) => (
    parsed.manifest.capabilities.every((capability) => ["prompt", "references"].includes(capability))
    && Array.isArray(parsed.manifest.readScopes)
    && parsed.manifest.readScopes.length > 0
    && parsed.manifest.readScopes.every((scope) => scope === "project")
  ));
  const current = readSkillAutoCallSettings();
  const enabled = await showSystemModal(
    currentLanguage === "zh" ? "开启项目的只读技能自动调用？仅已列入状态文件、且仅有 prompt/references 与 project 读取范围的技能可自动调用。" : "Enable project read-only Skill auto calls? Only Skills listed in this status file with prompt/references and project-only read scope can run automatically.",
    "confirm"
  ) === "yes";
  let allowedSkillIds = [];
  if (enabled && eligible.length) {
    const choice = await showInputDialog({
      message: [
        currentLanguage === "zh" ? "输入可自动调用的技能编号（例如 1,2）：" : "Enter Skill numbers allowed to auto-call (for example 1,2):",
        eligible.map((entry, index) => `${index + 1}. ${entry.parsed.manifest.name} v${entry.parsed.manifest.version}`).join("\n"),
      ].join("\n\n"),
      placeholder: currentLanguage === "zh" ? "例如 1,2" : "e.g. 1,2",
    });
    allowedSkillIds = String(choice || "").split(",").map((value) => eligible[Number(value.trim()) - 1]?.file.id).filter(Boolean);
  }
  const settings = { enabled: enabled && allowedSkillIds.length > 0, allowedSkillIds, readScopes: ["project"] };
  file.body = JSON.stringify(settings, null, 2); file.skillAutoCall = settings; file.updatedAt = new Date().toISOString();
  saveDeskState(); renderDocuments(); renderProjectDisks(); openTextFile(file.id);
  return true;
}

function saveSkillAutoCallReceipt(skills) {
  if (!skills?.length || !getActiveProject()) return null;
  const folder = ensureFolder(t("clio_records_folder"));
  const now = new Date().toISOString();
  const file = { id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "skill-auto-call-receipt", name: `${currentLanguage === "zh" ? "技能自动调用运行记录" : "Skill Auto Call Run Receipt"} ${now}`, autoSkillIds: skills.map((entry) => entry.file.id), body: ["# Skill Auto Call Run Receipt", "", `- Time: ${now}`, `- Skills: ${skills.map((entry) => `${entry.parsed.manifest.name} v${entry.parsed.manifest.version} [${entry.file.id}]`).join(", ")}`, "- Permission: read-only prompt/references; project read scope only"].join("\n"), createdAt: now, updatedAt: now };
  chatFiles.unshift(file); saveDeskState(); renderDocuments(); renderProjectDisks(); return file;
}

async function disableAutoCalledSkillFromSelectedReceipt() {
  const receipt = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "skill-auto-call-receipt");
  if (!receipt?.autoSkillIds?.length) return false;
  const settingsFile = getSkillAutoCallSettingsFile({ create: true });
  const settings = readSkillAutoCallSettings();
  const skills = receipt.autoSkillIds.map((id) => getProjectFiles().find((file) => file.id === id)).filter(Boolean);
  const choice = await showInputDialog({
    message: [
      currentLanguage === "zh" ? "输入要停用自动调用的技能编号：" : "Enter the auto-called Skill number to disable:",
      skills.map((skill, index) => `${index + 1}. ${skill.skillManifest?.name || skill.name}`).join("\n"),
    ].join("\n\n"),
    placeholder: currentLanguage === "zh" ? "例如 1" : "e.g. 1",
  });
  const skill = skills[Number(choice) - 1];
  if (!skill) return false;
  const next = { ...settings, allowedSkillIds: settings.allowedSkillIds.filter((id) => id !== skill.id) };
  if (!next.allowedSkillIds.length) next.enabled = false;
  settingsFile.body = JSON.stringify(next, null, 2); settingsFile.skillAutoCall = next; settingsFile.updatedAt = new Date().toISOString();
  saveDeskState(); renderDocuments(); renderProjectDisks(); return true;
}

async function selectProjectSkillForNextTask() {
  const skills = getEnabledProjectSkills();
  if (!skills.length) return false;
  const choice = await showInputDialog({
    message: [
      currentLanguage === "zh" ? "按顺序输入本次使用的技能编号（例如 1,2）：" : "Enter skill numbers in order for this task (for example 1,2):",
      skills.map((entry, index) => `${index + 1}. ${entry.parsed.manifest.name} v${entry.parsed.manifest.version}`).join("\n"),
    ].join("\n\n"),
    placeholder: currentLanguage === "zh" ? "例如 1,2" : "e.g. 1,2",
  });
  const selected = String(choice || "").split(",").map((value) => skills[Number(value.trim()) - 1]).filter(Boolean);
  if (!selected.length) return false;
  window.nextTaskSkillIds = new Set(selected.map((entry) => entry.file.id));
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
  return true;
}

function suggestProjectSkillsForTask(text = "") {
  const query = String(text || "").toLowerCase();
  return getEnabledProjectSkills().filter(({ parsed }) => {
    const haystack = `${parsed.manifest.name} ${parsed.manifest.description} ${(parsed.manifest.capabilities || []).join(" ")}`.toLowerCase();
    return !query || query.split(/\s+/).some((word) => word.length > 2 && haystack.includes(word));
  });
}

async function confirmSuggestedProjectSkill(text = "") {
  const candidates = suggestProjectSkillsForTask(text);
  if (!candidates.length) return false;
  const first = candidates[0];
  const accepted = await showSystemModal(
    currentLanguage === "zh" ? `建议使用：${first.parsed.manifest.name}。是否用于本次任务？` : `Suggested: ${first.parsed.manifest.name}. Use it for this task?`,
    "confirm"
  ) === "yes";
  window.lastSkillSuggestion = { candidates: candidates.map((entry) => entry.file.id), selected: accepted ? first.file.id : "", reason: "manifest description and capabilities" };
  if (accepted) window.nextTaskSkillIds = new Set([first.file.id]);
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
  return accepted;
}

async function createProjectSkillFromSelectedDraft() {
  const draft = getProjectFiles().find((file) => file.id === selectedChatFileId && file.artifactKind === "skill-draft");
  if (!draft) return null;
  const name = await showInputDialog({
    title: currentLanguage === "zh" ? "技能名称" : "Skill name",
    defaultValue: draft.name.replace(/\s+SKILL$/i, ""),
  });
  if (!name?.trim()) return null;
  const id = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) return null;
  const folder = ensureFolder("Skills", null);
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "ai-skill",
    name: `${name.trim()} SKILL.md`, body: String(draft.body || "").trim(), skillStatus: "enabled",
    skillManifest: { id, name: name.trim(), version: "0.1.0", description: "Project Skill draft", status: "enabled", source: { draftId: draft.id }, capabilities: ["prompt", "references"], readScopes: ["project"] },
    skillReferences: [], sourceDraftId: draft.id, createdAt: now, updatedAt: now,
  };
  const parsed = parseProjectSkillFile(file);
  if (!parsed.valid) return null;
  chatFiles.unshift(file);
  saveDeskState(); renderDocuments(); renderProjectDisks();
  return file;
}

function parseMountedSkillPackage(name = selectedMountedFile) {
  const text = String(mountedTextDisk.fileBodies[name] || "").trim();
  if (!/\.skill\.json$/i.test(name || "")) return { valid: false, reason: "not a .skill.json package" };
  try {
    const pkg = JSON.parse(text);
    const candidate = { artifactKind: "ai-skill", skillManifest: pkg.manifest, body: pkg.skill || "", skillReferences: pkg.references || [] };
    const parsed = parseProjectSkillFile(candidate);
    return parsed.valid ? { ...parsed, package: pkg, name } : parsed;
  } catch {
    return { valid: false, reason: "invalid skill package JSON" };
  }
}

async function installMountedSkillPackage() {
  const parsed = parseMountedSkillPackage();
  if (!parsed.valid || !activeProjectId) return null;
  const existing = getProjectFiles().filter((file) => file.artifactKind === "ai-skill" && file.skillManifest?.id === parsed.manifest.id);
  let mode = "install";
  if (existing.length) {
    mode = await showInputDialog({
      message: currentLanguage === "zh" ? "发现相同技能 ID：输入 replace 替换、keep 保留两者，或 cancel 取消。" : "Duplicate Skill ID: enter replace, keep, or cancel.",
      defaultValue: "cancel",
    }) || "cancel";
    if (!/^(replace|keep)$/i.test(mode)) return null;
    if (/^replace$/i.test(mode)) existing.forEach((file) => chatFiles.splice(chatFiles.indexOf(file), 1));
  }
  const folder = ensureFolder("Disabled Skills", null);
  const now = new Date().toISOString();
  const suffix = /^keep$/i.test(mode) ? `-${crypto.randomUUID().slice(0, 6)}` : "";
  const file = {
    id: crypto.randomUUID(), projectId: activeProjectId, folderId: folder.id, type: "text", artifactKind: "ai-skill",
    name: `${parsed.manifest.name} SKILL.md`, body: parsed.package.skill, skillManifest: { ...parsed.manifest, id: `${parsed.manifest.id}${suffix}`, status: "disabled", source: { mountedFile: parsed.name, trusted: false } },
    skillReferences: parsed.package.references || [], skillStatus: "disabled", createdAt: now, updatedAt: now,
  };
  chatFiles.unshift(file); saveDeskState(); renderDocuments(); renderProjectDisks(); return file;
}

async function previewMountedSkillPackage() {
  const parsed = parseMountedSkillPackage();
  if (!parsed.valid) return false;
  await showSystemModal([
    `${parsed.manifest.name} v${parsed.manifest.version}`,
    parsed.manifest.description || "",
    `Capabilities: ${(parsed.manifest.capabilities || []).join(", ")}`,
    `Source: ${parsed.name}`,
  ].filter(Boolean).join("\n"), "alert");
  return true;
}

function toggleSelectedProjectSkill() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "ai-skill");
  if (!file) return false;
  const enabled = file.skillStatus !== "enabled";
  file.skillStatus = enabled ? "enabled" : "disabled";
  file.skillManifest = { ...(file.skillManifest || {}), status: file.skillStatus };
  const folder = ensureFolder(enabled ? "Skills" : "Disabled Skills", null);
  file.folderId = folder.id; file.updatedAt = new Date().toISOString();
  saveDeskState(); renderDocuments(); renderProjectDisks(); return true;
}

function saveClioTalkRetrospective() {
  const context = activeChatArtifactContext();
  if (!context) return null;
  const { file, lineage } = context;
  const userMessages = file.messages.filter((item) => item.role === "user");
  const assistantMessages = file.messages.filter((item) => item.role === "assistant");
  const body = [
    `# ${file.name} — ${t("clio_retrospective")}`,
    "",
    "## Outcome",
    "",
    assistantMessages.at(-1)?.content || t("clio_not_recorded"),
    "",
    "## Intent trail",
    "",
    ...userMessages.map((item) => `- ${item.content}`),
    "",
    "## Genealogy",
    "",
    `- Parent: ${lineage.parent?.name || "root"}`,
    `- Children: ${lineage.children.map((item) => item.name).join(", ") || "none"}`,
    `- Generation: ${Number(file.generation || 0)}`,
    "",
    "## Review",
    "",
    "- What worked:",
    "- What failed or drifted:",
    "- What should become a reusable Skill:",
    "- Next action:",
  ].join("\n").trim();
  const retrospective = saveClioTalkArtifact("retrospective", `${file.name} ${t("clio_retrospective")}`, body);
  if (retrospective) {
    retrospective.sourceChatId = file.id;
    retrospective.sourceMessageIds = file.messages.map((item) => item.id).filter(Boolean);
    retrospective.artifactIds = chatFiles.filter((item) => item.sourceChatId === file.id).map((item) => item.id);
    saveDeskState();
  }
  return retrospective;
}

function attachSelectedRetrospectiveToNextTask() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "retrospective");
  if (!file) return false;
  window.nextTaskRetrospectiveIds = new Set([file.id]);
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
  return true;
}

async function createSkillDraftFromSelectedRetrospective() {
  const file = getProjectFiles().find((item) => item.id === selectedChatFileId && item.artifactKind === "retrospective");
  if (!file) return null;
  const confirmed = await showSystemModal(currentLanguage === "zh"
    ? `根据“${file.name}”制作 Skill 草稿？不会自动安装或启用。`
    : `Create a Skill draft from “${file.name}”? It will not be installed or enabled automatically.`, "confirm");
  if (confirmed !== "yes") return null;
  const draft = saveClioTalkArtifact("skill-draft", `${file.name} Skill Draft`, [
    `# ${file.name} Skill Draft`, "", "## Source retrospective", `- ${file.id}`, "", "## Reusable workflow", file.body || "",
  ].join("\n"));
  if (draft) {
    draft.sourceRetrospectiveId = file.id;
    draft.sourceChatId = file.sourceChatId || "";
    saveDeskState();
  }
  return draft;
}

function configureSaveDialog(mode) {
  saveDialogMode = mode;
  const isTeachText = mode === "teachtext";
  const isTemporaryChat = mode === "temporary-chat";
  const saveWindow = getWindow("saveChat");
  if (saveWindow) saveWindow.dataset.app = isTeachText ? "teachText" : "clioTalk";
  if (saveChatTitleEl) {
    saveChatTitleEl.textContent = t(
      isTeachText ? "save_text_title"
        : isTemporaryChat ? "clio_temporary_save_title"
          : "save_chat_title"
    );
  }
  if (saveChatHintEl) {
    const runCount = conversation.filter((message) => message?.runManifest).length;
    saveChatHintEl.textContent = isTeachText
      ? t("saved_text_hint")
      : isTemporaryChat
        ? t("clio_temporary_save_preview", conversation.length, runCount)
        : t("saved_chats_hint");
  }
  if (chatFileNameInput) {
    chatFileNameInput.readOnly = isTeachText;
    chatFileNameInput.classList.toggle("is-derived-name", isTeachText);
  }
}

function openSaveChatDialog() {
  if (!conversation.length) {
    setStatus(t("no_chat_to_save"));
    return;
  }
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const activeFile = getActiveConversationFile();
  configureSaveDialog(clioTalkTemporaryMode ? "temporary-chat" : "chat");
  chatFileNameInput.value = activeFile?.name || getChatFileTitle();
  const activeFolder = activeFile?.folderId
    ? getProjectFolders().find((folder) => folder.id === activeFile.folderId)
    : null;
  chatFolderNameInput.value = activeFolder?.name || preferredFolderName();
  renderFolderSuggestions();
  openWindow("saveChat");
}

function openSaveTextDialog(options = {}) {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  pendingTeachTextSaveOptions = options;
  configureSaveDialog("teachtext");
  chatFileNameInput.value = getTeachTextDocumentName();
  chatFolderNameInput.value = teachTextFolderInput.value.trim() || preferredFolderName();
  renderFolderSuggestions();
  openWindow("saveChat");
  chatFolderNameInput.focus({ preventScroll: true });
}

function closeSaveChatDialog() {
  const returnToTeachText = saveDialogMode === "teachtext";
  pendingTeachTextSaveOptions = null;
  closeWindow("saveChat");
  saveDialogMode = "chat";
  const saveWindow = getWindow("saveChat");
  if (saveWindow) saveWindow.dataset.app = "clioTalk";
  if (returnToTeachText) openWindow("teachText");
}

function clioTalkRunStatusForMessage(message) {
  if (message?.deliveryState === "failed") return "failed";
  if (message?.stopped) return "stopped";
  if (message?.incomplete) return "incomplete";
  return "completed";
}

function renderCurrentClioTalkConversation() {
  messagesEl.replaceChildren();
  conversation.forEach((item, index) => addMessage(item.role, item.content, {
    messageRecord: item,
    messageIndex: index,
    grounding: item.grounding || null,
  }));
  renderClioTalkWelcome();
  renderClioTalkFileBar();
  renderClioTalkRunAssembly();
  scrollMessagesToLatest({ force: true });
}

function saveCurrentChatAsFile(name, folderName) {
  if (!conversation.length) return null;
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }

  const folder = ensureFolder(folderName);
  const convertingTemporaryChat = clioTalkTemporaryMode;
  const existing = convertingTemporaryChat ? null : getActiveConversationFile();
  const now = new Date().toISOString();
  const file = existing || {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "chat",
    messages: [],
    compressedMemory: { text: "", sourceMessages: 0, updatedAt: "" },
    generation: 0,
    titleMode: "manual",
    createdAt: now,
    updatedAt: now,
  };
  file.name = (name || "Untitled Chat").trim() || "Untitled Chat";
  file.folderId = folder.id;
  file.titleMode = "manual";
  file.messages = normalizeChatMessageRecords(conversation);
  file.compressedMemory = { ...compressedConversationMemory };
  file.updatedAt = now;
  if (!existing) chatFiles.unshift(file);
  activeChatFileId = file.id;
  selectedFolderId = folder.id;
  selectedChatFileId = file.id;

  if (convertingTemporaryChat) {
    clioTalkTemporaryMode = false;
    conversation.forEach((message) => {
      message.temporaryChat = false;
      if (message.requestOptions) delete message.requestOptions.temporaryChat;
      if (!message.runManifest || message.runRecordId) return;
      const runRecord = saveClioTalkRunRecord({
        chatFile: file,
        messageRecord: message,
        manifest: message.runManifest,
        status: clioTalkRunStatusForMessage(message),
      });
      message.runRecordId = runRecord?.id || "";
    });
    file.messages = normalizeChatMessageRecords(conversation);
  }

  saveDeskState();
  renderDocuments();
  closeWindow("saveChat");
  renderCurrentClioTalkConversation();
  openWindow("assistant");
  setStatus(t(convertingTemporaryChat ? "clio_temporary_saved" : "clio_conversation_saved", file.name));
  if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  return file;
}

async function renameActiveClioTalkConversation() {
  const file = getActiveConversationFile();
  if (!file || clioTalkTemporaryMode) return false;
  const name = String(await showInputDialog({
    message: t("rename_file_prompt"),
    defaultValue: file.name,
  }) || "").trim();
  if (!name || name === file.name) return false;
  file.name = name;
  file.titleMode = "manual";
  file.updatedAt = new Date().toISOString();
  saveDeskState();
  renderDocuments();
  renderClioTalkFileBar();
  setStatus(t("clio_conversation_renamed", file.name));
  return true;
}

function currentClioTalkMarkdownFile() {
  const active = getActiveConversationFile();
  return {
    id: active?.id || "temporary",
    name: active?.name || t("clio_temporary_chat"),
    parentChatId: active?.parentChatId || "",
    forkMessageId: active?.forkMessageId || "",
    generation: Number(active?.generation || 0),
    messages: normalizeChatMessageRecords(conversation),
  };
}

function copyCurrentClioTalkMarkdown() {
  if (!conversation.length) return setStatus(t("no_chat_to_save"));
  return copyMarkdown(formatChatFileMarkdown(currentClioTalkMarkdownFile()));
}

async function downloadCurrentClioTalkMarkdown() {
  if (!conversation.length) return setStatus(t("no_chat_to_save"));
  const file = currentClioTalkMarkdownFile();
  const markdown = formatChatFileMarkdown(file);
  // Saved chats historically burned to the Project CD on download; keep that
  // combined meaning, but burn FIRST and only claim success when both land.
  if (!clioTalkTemporaryMode) {
    return downloadMarkdownAndBurnToProjectCd(markdown, file.name, {
      sourceDocumentId: file.id,
      sourceKind: "markdown",
    });
  }
  return downloadMarkdown(markdown, file.name);
}

async function openChatFile() {
  const file = chatFiles.find((item) => item.id === selectedChatFileId && item.type !== "text" && isInActiveProject(item));
  if (!file) return;
  if (!await confirmDiscardTemporaryClioTalkConversation()) return;
  if (activeChatFileId && activeChatFileId !== file.id) persistActiveChatFile();
  clioTalkTemporaryMode = false;
  if (typeof pendingClioTalkFileName !== "undefined") pendingClioTalkFileName = "";
  normalizeChatFileMetadata(file);

  conversation.length = 0;
  attachedClipIds.clear();
  window.nextTaskInputFileIds = new Set();
  clioTalkFindQuery = "";
  clioTalkFindMatchIndex = -1;
  compressedConversationMemory = {
    text: String(file.compressedMemory?.text || ""),
    sourceMessages: Number(file.compressedMemory?.sourceMessages || 0),
    updatedAt: String(file.compressedMemory?.updatedAt || ""),
  };
  file.messages = normalizeChatMessageRecords(file.messages);
  conversation.push(...file.messages.map((item) => ({ ...item })));
  activeChatFileId = file.id;
  messagesEl.replaceChildren();
  file.messages.forEach((item, index) => addMessage(item.role, item.content, {
    messageRecord: item,
    messageIndex: index,
    grounding: item.grounding || null,
  }));
  renderClioTalkWelcome();
  renderAttachedClips();
  renderClioTalkFileBar();
  if (typeof renderClioTalkRunAssembly === "function") renderClioTalkRunAssembly();
  openWindow("assistant");
}

function openChatFileWindow(fileId) {
  const file = chatFiles.find((item) => item.id === fileId && item.type !== "text" && isInActiveProject(item));
  if (!file) return;
  if (activeChatFileId && activeChatFileId !== file.id) persistActiveChatFile();
  normalizeChatFileMetadata(file);

  selectedChatFileId = file.id;
  chatFileTitleEl.textContent = file.name;
  const lastActivity = new Date(file.updatedAt || file.createdAt || Date.now()).toLocaleString();
  chatFileMetaEl.textContent = `${t("messages_count", file.messages.length)} · ${t("clio_generation", Number(file.generation || 0))} · ${lastActivity}`;
  chatFileBodyEl.replaceChildren();
  const lineage = renderChatLineage(file);
  if (lineage) chatFileBodyEl.append(lineage);
  const transcript = document.createElement("div");
  transcript.innerHTML = renderChatTranscript(file.messages);
  chatFileBodyEl.append(...transcript.childNodes);
  openWindow("chatFile");
}

function revealChatFileInFinder(fileId) {
  const file = chatFiles.find((item) => item.id === fileId && isInActiveProject(item));
  if (!file) return false;
  selectedFolderId = file.folderId && getProjectFolders().some((folder) => folder.id === file.folderId)
    ? file.folderId
    : "all";
  selectedChatFileId = file.id;
  selectedDocumentItemKeys.clear();
  selectedDocumentItemKeys.add(documentSelectionKey("file", file.id));
  renderDocuments();
  openWindow("documents");
  return true;
}

function insertChatFileIntoPrompt() {
  const file = chatFiles.find((item) => item.id === selectedChatFileId && item.type !== "text" && isInActiveProject(item));
  if (!file) return;

  const text = `# ${file.name}\n\n${formatChatFile(file)}`;
  promptInput.value = promptInput.value.trim()
    ? `${promptInput.value.trim()}\n\n${text}`
    : text;
  openWindow("assistant");
  promptInput.focus();
}

function moveChatFileToTrash() {
  const index = chatFiles.findIndex((item) => item.id === selectedChatFileId && isInActiveProject(item));
  if (index === -1) return;

  const [file] = chatFiles.splice(index, 1);
  removeMountedFilesByName([file.name], file.projectId);
  purgeContextForTrashedItems([{ type: "file", id: file.id, item: file }]);
  trashItems.unshift({
    projectId: activeProjectId,
    title: `${file.name}.${file.type === "text" ? "text" : "chat"}`,
    body: file.type === "text" ? file.body : formatChatFile(file),
    originalPath: getProjectFolderPathLabel(file.folderId || null),
    originalType: "file",
    originalData: file,
  });
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  renderTrash();
  playSystemSound("trash");
}

function getActiveFile() {
  const teachTextVisible = !getWindow("teachText").classList.contains("is-hidden");
  if (teachTextVisible && activeTextFileId) {
    return chatFiles.find((item) => item.id === activeTextFileId && item.type === "text" && isInActiveProject(item));
  }

  const chatFileVisible = !getWindow("chatFile").classList.contains("is-hidden");
  if (chatFileVisible && selectedChatFileId) {
    return chatFiles.find((item) => item.id === selectedChatFileId && isInActiveProject(item));
  }

  return null;
}

function labelName(label) {
  const labels = {
    draft: t("label_draft"),
    ai: t("label_ai"),
    final: t("label_final"),
  };
  return labels[label] || t("label_none");
}

function normalizeFileLabel(label) {
  return ["", "draft", "ai", "final"].includes(label) ? label : "";
}

function normalizeTeachTextWorkflowState(state) {
  return normalizeFileLabel(state) || "draft";
}

function teachTextPipelineLabel(label = teachTextWorkflowState) {
  if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) return false;
  return ["draft", "ai"].includes(normalizeFileLabel(label));
}

function teachTextReviewLabel(label = teachTextWorkflowState) {
  if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) return false;
  return normalizeFileLabel(label) === "final";
}

function ensureTeachTextReviewState(options = {}) {
  if (teachTextReviewLabel()) return true;
  if (options.promoteSavedFinal && normalizeFileLabel(teachTextFileLabel) === "final" && teachTextBodyInput?.value.trim()) {
    setTeachTextWorkflowState("final");
    syncTeachTextLabelControl();
    return true;
  }
  setStatus(t("teachtext_review_requires_final"));
  syncTeachTextLabelControl();
  if (options.openTeachText !== false) openWindow("teachText");
  return false;
}

function setTeachTextWorkflowState(state) {
  teachTextWorkflowState = normalizeTeachTextWorkflowState(state);
  // Phase drives manuscript editability: drafting = read-only preview, review =
  // editable owner. Recompute whenever the workflow state moves between phases.
  if (typeof applyManuscriptEditability === "function") applyManuscriptEditability();
}

function getTeachTextFile() {
  return activeTextFileId
    ? chatFiles.find((item) => item.id === activeTextFileId && item.type === "text" && isInActiveProject(item))
    : null;
}

function syncTeachTextLabelControl() {
  if (!teachTextLabelSelect) return;

  const statusKey = teachTextStatusEl?.dataset.statusKey || "";
  const canEditLabel = (typeof isTeachTextManuscriptRole !== "function" || isTeachTextManuscriptRole())
    && !["viewing_mounted_file", "viewing_reference", "viewing_help"].includes(statusKey);
  const file = getTeachTextFile();

  if (file) {
    teachTextFileLabel = normalizeFileLabel(file.label || "") || "draft";
  } else if (!canEditLabel) {
    teachTextFileLabel = "";
  } else {
    teachTextFileLabel = normalizeFileLabel(teachTextFileLabel) || "draft";
  }

  teachTextLabelSelect.value = normalizeTeachTextWorkflowState(teachTextWorkflowState);
  teachTextLabelSelect.disabled = !canEditLabel;
  teachTextLabelSelect.hidden = !canEditLabel;
  teachTextLabelSelect.title = canEditLabel ? t("document_status_hint") : t("document_status_readonly");
  syncPipelineLabelControls();
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  if (typeof syncReviewDeskAvailability === "function") syncReviewDeskAvailability();
}

function syncPipelineLabelControls() {
  const pipelineLabel = teachTextWorkflowState === "ai" ? "ai" : "draft";
  [outlinePipelineLabelSelect, draftPipelineLabelSelect].forEach((select) => {
    if (!select) return;
    select.value = pipelineLabel;
  });
  if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
}

function unlinkTeachTextPipeline({ clearUpstream = false } = {}) {
  const project = getActiveProject();
  if (!project) return;

  project.manuscriptLinkedToOutline = false;
  if (clearUpstream) {
    setProjectOutlineMarkdown(project, "");
    project.outlineCritique = "";
    project.drafts = [];
    selectedDraftIndex = -1;
    if (outlineContentEl) outlineContentEl.value = "";
    if (draftBodyInput) draftBodyInput.value = "";
    if (draftTitleInput) draftTitleInput.value = "";
  }
  project.flowState = {
    ...(project.flowState || {}),
    outline: clearUpstream ? false : Boolean(project.outline?.trim()),
    drafting: clearUpstream ? false : (project.drafts || []).some((draft) => (draft.body || draft.title || "").trim()),
  };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  renderPipeline();
}

function linkTeachTextToPipeline({ ai = false } = {}) {
  const project = getActiveProject();
  if (!project || !teachTextBodyInput?.value.trim()) return;

  setTeachTextWorkflowState(ai ? "ai" : "draft");
  teachTextFileLabel = ai ? "ai" : (teachTextFileLabel === "ai" ? "ai" : "draft");
  project.manuscriptLinkedToOutline = true;
  setProjectOutlineMarkdown(project, teachTextBodyInput.value);
  syncDraftsFromProjectOutline(project);
  syncOutlineDomFromProject(project);
  syncDraftDomFromProject(project);
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  renderPipeline();
}

async function setTeachTextFileLabel(label, { announce = false, persist = false } = {}) {
  if (typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) {
    syncTeachTextLabelControl();
    setStatus(t("teachtext_manuscript_required"));
    return;
  }
  const next = normalizeFileLabel(label);
  const previous = normalizeTeachTextWorkflowState(teachTextWorkflowState);
  if (next === "final" && previous !== "final") {
    const result = await showSystemModal(t("final_label_confirm"), "confirm");
    if (result !== "yes") {
      syncTeachTextLabelControl();
      return;
    }
  }

  setTeachTextWorkflowState(next);
  teachTextFileLabel = next;

  if (next==="final"&&!(await saveTextDocument({promptForFolder:false}))) {
    syncTeachTextLabelControl();
    return;
  }

  const file = getTeachTextFile();
  if (file) {
    file.label = next;
    file.updatedAt = new Date().toISOString();
    renderDocuments();
    if (persist) saveDeskState();
  }

  if (next === "draft" || next === "ai") {
    linkTeachTextToPipeline({ ai: next === "ai" });
  } else if (next === "final") {
    // Review phase: the finalized manuscript is the editable owner under review.
    // Keep it open and pair it beside the Review Desk (审校台 + 定稿正文 在一起)
    // instead of closing it.
    unlinkTeachTextPipeline({clearUpstream:true});
    syncReviewDeskFromTeachText({ force: true });
    await openWindow("teachText");
    // openReviewDesk opens the Review Desk; its placement tail pairs it beside the
    // finalized manuscript (审校台 + 定稿正文 在一起).
    openReviewDesk("style");
  } else {
    unlinkTeachTextPipeline();
  }

  syncTeachTextLabelControl();
  if (announce) setStatus(t("file_label_changed", labelName(next)));
}

function duplicateActiveFile() {
  const activeWin = document.querySelector(".window.is-active");
  if (activeWin?.dataset.window === "projects") {
    const item = getSelectedProjectFinderItem();
    if (!item || item.canDuplicate === false || item.virtual) {
      setStatus(t("finder_item_cannot_duplicate"));
      return;
    }
    if (item.type === "folder") {
      duplicateDocumentFolderById(item.id);
      return;
    }
    selectedChatFileId = item.id;
    duplicateSelectedDocumentFile();
    renderProjectDisks();
    return;
  }

  if (activeWin?.dataset.window === "documents" && selectedDocumentFolderId) {
    duplicateDocumentFolderById(selectedDocumentFolderId);
    return;
  }

  if (activeWin?.dataset.window === "documents" && selectedChatFileId) {
    duplicateSelectedDocumentFile();
    return;
  }

  const file = getActiveFile();
  if (!file) {
    setStatus(t("open_file_first_duplicate"));
    return;
  }

  const copy = {
    ...structuredClone(file),
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    name: `${file.name} copy`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  chatFiles.unshift(copy);
  if (copy.type === "text") {
    activeTextFileId = copy.id;
    openTextFile(copy.id);
  } else {
    selectedChatFileId = copy.id;
    openChatFileWindow(copy.id);
  }
  selectedFolderId = copy.folderId;
  saveDeskState();
  renderDocuments();
  openWindow("documents");
}

async function renameActiveFile() {
  const activeWin = document.querySelector(".window.is-active");
  if (activeWin?.dataset.window === "projects") {
    const item = getSelectedProjectFinderItem();
    if (!item || item.canRename === false || item.virtual) {
      setStatus(t("select_finder_item_first"));
      return;
    }
    await renameSelectedDocumentItem();
    renderProjectDisks();
    return;
  }

  if (activeWin?.dataset.window === "documents" && (selectedChatFileId || selectedDocumentFolderId)) {
    await renameSelectedDocumentItem();
    return;
  }

  const file = getActiveFile();
  if (!file) {
    setStatus(t("open_file_first_rename"));
    return;
  }

  const name = await showInputDialog({
    message: t("rename_file_prompt"),
    defaultValue: file.name,
  });
  if (!name?.trim()) return;

  file.name = name.trim();
  file.updatedAt = new Date().toISOString();
  if (file.type === "text") {
    teachTextNameInput.value = file.name;
    syncTeachTextNameDisplay();
  } else {
    chatFileTitleEl.textContent = file.name;
  }
  saveDeskState();
  renderDocuments();
}

function moveActiveFileToTrash() {
  const activeWin = document.querySelector(".window.is-active");
  if (activeWin?.dataset.window === "projects") {
    const selectedItems = getSelectedDocumentItems();
    if (selectedItems.length) {
      moveItemsToTrash(selectedItems);
      renderProjectDisks();
      return;
    }
    const item = getSelectedProjectFinderItem();
    if (!item || item.canTrash === false || item.virtual) {
      setStatus(t("select_finder_item_first"));
      return;
    }
    if (item.type === "folder") moveDocumentFolderToTrashById(item.id);
    else {
      selectedChatFileId = item.id;
      moveSelectedDocumentFileToTrash();
    }
    renderProjectDisks();
    return;
  }

  if (activeWin?.dataset.window === "documents" && getSelectedDocumentItems().length) {
    moveItemsToTrash(getSelectedDocumentItems());
    return;
  }
  if (activeWin?.dataset.window === "documents" && selectedDocumentFolderId) {
    moveSelectedDocumentFolderToTrash();
    return;
  }
  if (activeWin?.dataset.window === "documents" && selectedChatFileId) {
    moveSelectedDocumentFileToTrash();
    return;
  }
  if (activeWin?.dataset.window === "projectCd") {
    moveProjectCdItemsToTrash(getSelectedProjectCdItems().map((item) => item.id));
    return;
  }
  if (activeWin?.dataset.window === "textDisk") {
    removeSelectedMountedFile();
    return;
  }

  const file = getActiveFile();
  if (!file) {
    setStatus(t("open_file_first_trash"));
    return;
  }

  selectedChatFileId = file.id;
  moveChatFileToTrash();
  if (file.type === "text") {
    activeTextFileId = null;
    closeWindow("teachText");
  } else {
    closeWindow("chatFile");
  }
}

function duplicateDocumentFolderById(folderId) {
  const source = getProjectFolders().find((folder) => folder.id === folderId);
  if (!source) {
    setStatus(t("select_finder_item_first"));
    return null;
  }

  const now = new Date().toISOString();
  const idMap = new Map();

  function copyFolderTree(folder, targetParentId, isRoot = false) {
    const copy = {
      ...structuredClone(folder),
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      parentId: targetParentId || null,
      name: isRoot ? nextAvailableFolderName(`${displayFolderName(folder.name)} copy`, targetParentId || null) : folder.name,
      createdAt: now,
      updatedAt: now,
    };
    idMap.set(folder.id, copy.id);
    chatFolders.push(copy);

    getProjectFiles()
      .filter((file) => file.folderId === folder.id)
      .forEach((file) => {
        chatFiles.unshift({
          ...structuredClone(file),
          id: crypto.randomUUID(),
          projectId: activeProjectId,
          folderId: copy.id,
          createdAt: now,
          updatedAt: now,
        });
      });

    getProjectFolders()
      .filter((child) => child.parentId === folder.id)
      .forEach((child) => copyFolderTree(child, copy.id));

    return copy;
  }

  const copy = copyFolderTree(source, source.parentId || null, true);
  selectedDocumentFolderId = copy.id;
  selectedChatFileId = null;
  selectedProjectRootItemId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  setStatus(t("folder_duplicated", displayFolderName(copy.name)));
  return copy;
}

function nextAvailableFileName(baseName, folderId = null) {
  const base = (baseName || t("untitled")).trim() || t("untitled");
  const siblings = getProjectFiles()
    .filter((file) => (file.folderId || null) === (folderId || null))
    .map((file) => (file.name || "").trim().toLowerCase());
  if (!siblings.includes(base.toLowerCase())) return base;

  let index = 2;
  while (siblings.includes(`${base} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${base} ${index}`;
}

function createTeachTextFileFromFinder() {
  if (!getActiveProject()) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return;
  }

  const folderId = getCurrentFinderParentId();
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    name: nextAvailableFileName(t("untitled"), folderId),
    folderId,
    body: "",
    label: "",
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  selectedFolderId = folderId || "all";
  selectedChatFileId = file.id;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  activeTextFileId = file.id;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  openTextFile(file.id);
  setStatus(t("teachtext_file_created", file.name));
}

function newTextDocument() {
  openTeachTextStateInTab({
    title: t("untitled"),
    backing: { type: "scratch" },
    state: { name: t("untitled"), folder: preferredFolderName(), body: "", statusKey: "unsaved" },
    forceNew: true,
  });
}

function openTextFile(fileId) {
  const file = chatFiles.find((item) => item.id === fileId && item.type === "text" && isInActiveProject(item));
  if (!file) return;

  // A saved DocMap opens in the tool rather than TeachText, but the tool is
  // lazy: settle that with the eager predicate first, then re-enter once it
  // is loaded so the "not actually a DocMap" fallback still works.
  const openResolution = window.AISystem6ApplicationRegistry?.resolveApplicationForItem?.(file, "open");
  const isDocMapRoute = !!openResolution?.ok && openResolution.appId === "docMap";
  if (isDocMapRoute && !window.AISystem6DocMapLoaded) {
    ensureDocMapModule().then(() => openTextFile(fileId));
    return;
  }
  if (isDocMapRoute && window.AISystem6DocMapLoaded && openSavedDocMapFile(file)) {
    return;
  }

  const folder = getProjectFolders().find((item) => item.id === file.folderId);
  openTeachTextStateInTab({
    title: file.name,
    backing: { type: "projectText", id: file.id },
    state: {
      activeTextFileId: file.id,
      name: file.name,
      folder: folder ? displayFolderName(folder.name) : t("default_folder"),
      body: file.body || "",
      label: normalizeFileLabel(file.label || ""),
      statusKey: "saved",
    },
  });
}

function openTeachTextDocument(documentId) {
  const file = chatFiles.find((item) => item.id === documentId && item.type === "text" && isInActiveProject(item));
  if (!file) return false;
  openTextFile(documentId);
  return true;
}

window.AISystem6TeachText = Object.freeze({
  openDocument: openTeachTextDocument,
});

function openMountedTextFile(name) {
  const body = mountedTextDisk.fileBodies[name];
  if (typeof body !== "string") return;

  if (typeof createReaderFileDocumentTab === "function" && typeof openReaderDocumentTab === "function") {
    const tab = createReaderFileDocumentTab(name);
    openReaderDocumentTab(tab.id);
    openWindow("reader");
    return;
  }

  selectedChatFileId = null;
  openTeachTextStateInTab({
    title: name,
    backing: { type: "mountedText", fileName: name },
    state: {
      name: name.replace(/\.(txt|md|csv|json|js|ts|html|css|xml|log)$/i, ""),
      folder: preferredFolderName(),
      body,
      statusKey: "viewing_mounted_file",
    },
  });
}

function toggleTeachTextPreview() {
  const isPreview = !teachTextPreviewEl.classList.contains("is-hidden");
  if (isPreview) {
    showTeachTextEditor();
  } else {
    showTeachTextPreview();
  }
}

function showTeachTextEditor({ announce = true, focus = true } = {}) {
  teachTextPreviewState.scrollTop = teachTextPreviewEl.scrollTop;
  teachTextPreviewEl.classList.add("is-hidden");
  teachTextPreviewEl.closest(".teachtext-editor-container")?.classList.remove("is-previewing");
  teachTextBodyInput.classList.remove("is-hidden");
  teachTextBodyInput.scrollTop = teachTextPreviewState.editorScrollTop || 0;
  teachTextBodyInput.selectionStart = teachTextPreviewState.selectionStart || 0;
  teachTextBodyInput.selectionEnd = teachTextPreviewState.selectionEnd || teachTextPreviewState.selectionStart || 0;
  teachTextTogglePreviewButton.textContent = t("preview");
  updateTeachTextDeskState();
  if (focus) teachTextBodyInput.focus();
  if (announce) setStatus(t("editing_markdown"));
}

function showTeachTextPreview({ announce = true, focus = false, preserveScroll = true } = {}) {
  const previewScrollTop = preserveScroll ? (teachTextPreviewState.scrollTop || 0) : 0;
  teachTextPreviewState = {
    editorScrollTop: teachTextBodyInput.scrollTop,
    scrollTop: previewScrollTop,
    selectionStart: teachTextBodyInput.selectionStart ?? 0,
    selectionEnd: teachTextBodyInput.selectionEnd ?? 0,
  };
  syncTeachTextPreview({ force: true });
  teachTextPreviewEl.classList.remove("is-hidden");
  teachTextPreviewEl.closest(".teachtext-editor-container")?.classList.add("is-previewing");
  teachTextPreviewEl.scrollTop = previewScrollTop;
  teachTextBodyInput.classList.add("is-hidden");
  teachTextTogglePreviewButton.textContent = t("edit");
  updateTeachTextDeskState();
  if (focus) {
    teachTextPreviewEl.tabIndex = 0;
    teachTextPreviewEl.focus();
  }
  if (announce) setStatus(t("previewing_markdown"));
}

async function saveTextDocument({ asCopy = false, revealInDocuments = false, promptForFolder = true } = {}) {
  if (typeof captureActiveTeachTextTabState === "function") captureActiveTeachTextTabState();
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return false;
  }

  let file = !asCopy && activeTextFileId
    ? chatFiles.find((item) => item.id === activeTextFileId && item.type === "text" && isInActiveProject(item))
    : null;

  if (promptForFolder && (!file || asCopy)) {
    openSaveTextDialog({ asCopy, revealInDocuments });
    return false;
  }

  const folder = ensureFolder(teachTextFolderInput.value || preferredFolderName());
  const name = getTeachTextDocumentName();
  teachTextNameInput.value = name;

  if (!file) {
    file = {
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      type: "text",
      name,
      folderId: folder.id,
      body: teachTextBodyInput.value,
      label: normalizeFileLabel(teachTextFileLabel),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    chatFiles.unshift(file);
    activeTextFileId = file.id;
  } else {
    file.name = name;
    file.folderId = folder.id;
    file.body = teachTextBodyInput.value;
    file.label = normalizeFileLabel(teachTextFileLabel);
    file.updatedAt = new Date().toISOString();
    if (typeof createDocumentRevision === "function") {
      try {
        await createDocumentRevision({
          projectId: file.projectId,
          documentId: file.id,
          body: file.body,
          origin: "user",
          operation: "save",
        });
      } catch (error) {
        // A plain manual save still persists the body; only the version
        // history entry failed, and the user must know.
        console.warn("Document body saved, but the version history entry could not be persisted.", error);
        setStatus(currentLanguage === "zh"
          ? "正文已保存，但版本历史未能写入。"
          : "The document was saved, but the version history could not be written.");
      }
    }
  }

  selectedFolderId = folder.id;
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  const tab = typeof getActiveDocumentTab === "function" ? getActiveDocumentTab("teachText") : null;
  if (tab) {
    tab.role = teachTextDocumentRole === "manuscript" ? "manuscript" : "scratch_file";
    tab.title = file.name;
    tab.backing = tab.role === "manuscript" ? { type: "manuscript", id: file.id } : { type: "projectText", id: file.id };
    tab.state = { ...(tab.state || {}), activeTextFileId: file.id, name: file.name, body: file.body, statusKey: "saved" };
    tab.updatedAt = new Date().toISOString();
  }
  setTeachTextStatus("saved");
  refreshTeachTextDocumentState();
  setStatus(t("saved"));
  playSystemSound("save");
  saveDeskState();
  renderDocuments();
  if (revealInDocuments) openWindow("documents");
  openWindow("teachText");
  return true;
}

function getTeachTextMarkdown(options = {}) {
  const rawMarkdown = teachTextBodyInput.value.trimEnd();
  const baseMarkdown = options.originalImages
    ? resolveTeachTextImageMarkdown(rawMarkdown, { original: true })
    : rawMarkdown;
  const markdown = options.bibliography === false || typeof appendBibliographyToMarkdown !== "function"
    ? baseMarkdown
    : appendBibliographyToMarkdown(baseMarkdown);
  const name = getTeachTextDocumentName();
  return { markdown, rawMarkdown, name };
}

function updateTeachTextBilingualExportButton() {
  if (!teachTextDownloadBilingualButton) return;
  const markdown = teachTextBodyInput.value.trim();
  const targetLanguage = markdown ? getTranslationTargetForUi(markdown) : null;
  teachTextDownloadBilingualButton.hidden = !targetLanguage;
  teachTextDownloadBilingualButton.disabled = !targetLanguage;
}

function copyTeachTextMarkdown() {
  const { markdown } = getTeachTextMarkdown();
  copyMarkdown(markdown);
}

function downloadTeachTextMarkdown() {
  const { markdown, name } = getTeachTextMarkdown({ originalImages: true });
  downloadMarkdown(markdown, name);
  markTeachTextExported("markdown");
}

async function downloadTeachTextBilingualMarkdown() {
  const { markdown, name } = getTeachTextMarkdown();
  const targetLanguage = markdown ? getTranslationTargetForUi(markdown) : null;
  if (!markdown || !targetLanguage) {
    updateTeachTextBilingualExportButton();
    return;
  }

  if (!beginLongTask("bilingual-export", t("translating_document"))) return;

  try {
    const translationCreatedAt = new Date().toISOString();
    const translationModel = currentTranslationModel();
    const translated = await translateTextWithLocalModel(markdown, targetLanguage, {
      preserveMarkdown: true,
      title: name,
    });
    const bilingual = bilingualMarkdownSection({
      title: name,
      original: markdown,
      translation: translated,
      language: targetLanguage,
      createdAt: translationCreatedAt,
      source: "TeachText",
      model: translationModel,
      depth: 1,
    });
    const exportName = `${name} Bilingual`;
    downloadMarkdown(bilingual, exportName);
    markTeachTextExported("bilingual");
    setStatus(t("bilingual_export_saved", `${sanitizeFilename(exportName)}.md`));
  } catch (error) {
    if (!isAbortError(error)) setStatus(t("translation_failed", error.message));
  } finally {
    endLongTask("bilingual-export");
    updateTeachTextBilingualExportButton();
  }
}

function downloadSelectedScrapsBilingualMarkdown() {
  const selected = getSelectedScraps().filter(scrapHasTranslation);
  if (!selected.length) return;

  const markdown = selected.length === 1
    ? formatScrapBilingualMarkdown(selected[0], 1)
    : [
        `# ${t("scrapbook")} ${t("download_bilingual_md")}`,
        "",
        selected.map((scrap) => formatScrapBilingualMarkdown(scrap, 2)).join("\n\n---\n\n"),
      ].join("\n").trim();
  const name = selected.length === 1 ? `${selected[0].title} Bilingual` : `${t("scrapbook")} Bilingual`;
  downloadMarkdown(markdown, name);
  setStatus(t("bilingual_export_saved", `${sanitizeFilename(name)}.md`));
}

function getSelectedChatFile() {
  return chatFiles.find((item) => item.id === selectedChatFileId && item.type !== "text" && isInActiveProject(item));
}

function copyChatFileMarkdown() {
  const file = getSelectedChatFile();
  if (!file) {
    setStatus(t("no_document_export"));
    return;
  }

  copyMarkdown(formatChatFileMarkdown(file));
}

function downloadChatFileMarkdown() {
  const file = getSelectedChatFile();
  if (!file) {
    setStatus(t("no_document_export"));
    return;
  }

  downloadMarkdown(formatChatFileMarkdown(file), file.name);
}

function copyActiveMarkdown() {
  const textVisible = !getWindow("teachText").classList.contains("is-hidden");
  const chatVisible = !getWindow("chatFile").classList.contains("is-hidden");

  if (textVisible) {
    copyTeachTextMarkdown();
    return;
  }

  if (chatVisible) {
    copyChatFileMarkdown();
    return;
  }

  setStatus(t("no_document_export"));
}

function downloadActiveMarkdown() {
  const textVisible = !getWindow("teachText").classList.contains("is-hidden");
  const chatVisible = !getWindow("chatFile").classList.contains("is-hidden");

  if (textVisible) {
    downloadTeachTextMarkdown();
    return;
  }

  if (chatVisible) {
    downloadChatFileMarkdown();
    return;
  }

  setStatus(t("no_document_export"));
}

async function shareActiveMarkdown() {
  const textVisible = !getWindow("teachText").classList.contains("is-hidden");
  const chatVisible = !getWindow("chatFile").classList.contains("is-hidden");
  let markdown = "";
  let name = t("untitled");

  if (textVisible) {
    ({ markdown, name } = getTeachTextMarkdown({ originalImages: true }));
  } else if (chatVisible) {
    const file = getSelectedChatFile();
    if (file) {
      markdown = formatChatFileMarkdown(file);
      name = file.name || name;
    }
  }

  if (!markdown.trim()) {
    setStatus(t("no_document_export"));
    return false;
  }

  try {
    const shared = await window.AISystem6WebPlatform?.shareMarkdown?.({
      title: name,
      markdown,
      fileName: `${sanitizeFilename(name)}.md`,
    });
    if (shared) setStatus(t("share_markdown_done"), { notify: false });
    return !!shared;
  } catch (error) {
    console.warn("Markdown share failed.", error);
    setStatus(t("share_markdown_failed"));
    return false;
  }
}

function downloadActiveBilingualMarkdown() {
  const textVisible = !getWindow("teachText").classList.contains("is-hidden");
  if (textVisible) {
    downloadTeachTextBilingualMarkdown();
    return;
  }

  setStatus(t("teachtext_empty"));
  openWindow("teachText");
}

function getActiveEditableElement() {
  const active = document.activeElement;
  const tag = active?.tagName?.toLowerCase();
  if ((tag === "textarea" || (tag === "input" && !["button", "checkbox", "file", "radio"].includes(active.type))) && !active.disabled) {
    return active;
  }
  if (active?.isContentEditable) return active;

  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  if (activeWin?.dataset.window === "teachText") return teachTextBodyInput;
  if (activeWin?.dataset.window === "assistant") return promptInput;
  return null;
}

function selectEditableText(target) {
  if (!target) return false;
  if (typeof target.select === "function") {
    target.focus();
    target.select();
    return true;
  }
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  target.focus();
  return true;
}

function insertTextAtEditableSelection(target, text) {
  if (!target) return false;
  if (typeof target.setRangeText === "function") {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return document.execCommand("insertText", false, text);
}

async function runEditCommand(command) {
  const target = getActiveEditableElement();
  if (command === "select-all") {
    selectEditableText(target);
    return;
  }
  if (command === "paste") {
    target?.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (text && insertTextAtEditableSelection(target, text)) return;
    } catch {}
    document.execCommand("paste");
    return;
  }
  if (command === "copy") {
    document.execCommand("copy");
    captureSelectionClipboard();
    return;
  }
  target?.focus();
  document.execCommand(command);
}

function saveCurrentWork() {
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  if (activeWin?.dataset.window === "quickDraft") {
    // Draft Desk saves through its public durable API; the fallback flush
    // covers a partially-loaded module so ⌘S never no-ops.
    if (typeof window.AISystem6QuickDraft?.save === "function") {
      window.AISystem6QuickDraft.save();
    } else {
      window.AISystem6QuickDraftRuntime?.flushPendingQuickDraftCommit?.();
    }
    return;
  }
  const teachTextVisible = !getWindow("teachText").classList.contains("is-hidden");
  if (activeWin?.dataset.window === "teachText") {
    saveTextDocument();
    return;
  }

  if (activeWin?.dataset.window === "assistant" && conversation.length) {
    openSaveChatDialog();
    return;
  }

  if (conversation.length) {
    openSaveChatDialog();
    return;
  }

  if (teachTextVisible) {
    saveTextDocument();
    return;
  }

  setStatus(t("teachtext_empty"));
  openWindow("teachText");
}
