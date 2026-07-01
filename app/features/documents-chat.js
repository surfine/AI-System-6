// Feature module: documents-chat.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



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
  if (file?.type === "text") {
    openTextFile(file.id);
  } else if (file) {
    openChatFileWindow(file.id);
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

function renameSelectedDocumentItem() {
  const folder = getSelectedDocumentFolder();
  if (folder) {
    const name = window.prompt(t("rename_folder_prompt"), displayFolderName(folder.name));
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
  const name = window.prompt(t("rename_file_prompt"), file.name);
  if (!name?.trim()) return;
  file.name = name.trim();
  file.updatedAt = new Date().toISOString();
  if (file.id === activeTextFileId) {
    teachTextNameInput.value = file.name;
    teachTextTitleEl.textContent = file.name;
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
  documentsUpButton.hidden = selectedFolderId === "all";
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
        row.className = `finder-list-row${selected ? " is-selected" : ""}`;
        row.dataset.dragType = "document-folder";
        row.dataset.id = folder.id;
        row.dataset.projectId = folder.projectId;
        row.dataset.dropTarget = "document-folder";
        row.dataset.folderId = folder.id;
        row.dataset.documentItemType = "folder";
        row.dataset.documentItemId = folder.id;
        row.innerHTML = `
          <span>${renderSystemIcon("folder", { size: "mini"})}${escapeHtml(displayFolderName(folder.name))}</span>
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
        row.className = `finder-list-row label-${file.label || "none"}${selected ? " is-selected" : ""}`;
        row.dataset.dragType = "file";
        row.dataset.id = file.id;
        row.dataset.projectId = file.projectId;
        row.dataset.documentItemType = "file";
        row.dataset.documentItemId = file.id;
        const fileKind = file.type === "text" ? t("kind_teachtext") : t("kind_chat");
        const icon = file.type === "text" ? "teachText" : "chatFile";
        const iconClass = file.type === "text" ? "teachtext-icon" : "doc-icon";
        row.innerHTML = `
          <span>${renderSystemIcon(icon, { size: "mini"})}${escapeHtml(file.name)}</span>
          <span>${fileKind}${file.label ? ` · ${escapeHtml(labelName(file.label))}` : ""}</span>
          <span>${getFinderItemSizeLabel(file)}</span>
          <span>${new Date(file.updatedAt || file.createdAt).toLocaleDateString()}</span>
        `;
        row.onclick = (event) => {
          selectDocumentItemFromEvent("file", file.id, event, sortedItems);
        };
        row.ondblclick = () => {
          if (file.type === "text") openTextFile(file.id);
          else openChatFileWindow(file.id);
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
      button.className = `finder-item${selected ? " is-selected" : ""}`;
      button.dataset.dragType = "document-folder";
      button.dataset.id = folder.id;
      button.dataset.projectId = folder.projectId;
      button.dataset.dropTarget = "document-folder";
      button.dataset.folderId = folder.id;
      button.dataset.documentItemType = "folder";
      button.dataset.documentItemId = folder.id;
      button.innerHTML = `${renderSystemIcon("folder", { size: "mini"})}<span>${escapeHtml(displayFolderName(folder.name))}</span>`;
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
      button.className = `finder-item label-${file.label || "none"}${selected ? " is-selected" : ""}`;
      const iconClass = file.type === "text" ? "teachtext-icon" : "doc-icon";
      const iconId = file.type === "text" ? "teachText" : "chatFile";
      button.innerHTML = `${renderSystemIcon(iconId, { size: "mini"})}<span>${escapeHtml(file.name)}</span>${file.label ? `<small>${escapeHtml(labelName(file.label))}</small>` : ""}`;
      button.addEventListener("click", (event) => {
        selectDocumentItemFromEvent("file", file.id, event, sortedItems);
      });
      button.addEventListener("dblclick", () => {
        if (file.type === "text") {
          openTextFile(file.id);
        } else {
          openChatFileWindow(file.id);
        }
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
    .map((item) => `<article><b>${item.role === "user" ? t("you") : t("assistant")}</b><div>${markdownToSystemHtml(item.content)}</div></article>`)
    .join("")}</div>`;
}

function configureSaveDialog(mode) {
  saveDialogMode = mode;
  const isTeachText = mode === "teachtext";
  const saveWindow = getWindow("saveChat");
  if (saveWindow) saveWindow.dataset.app = isTeachText ? "teachText" : "clioTalk";
  if (saveChatTitleEl) saveChatTitleEl.textContent = t(isTeachText ? "save_text_title" : "save_chat_title");
  if (saveChatHintEl) saveChatHintEl.textContent = t(isTeachText ? "saved_text_hint" : "saved_chats_hint");
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

  configureSaveDialog("chat");
  chatFileNameInput.value = getChatFileTitle();
  chatFolderNameInput.value = preferredFolderName();
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

function saveCurrentChatAsFile(name, folderName) {
  if (!conversation.length) return null;
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }

  const folder = ensureFolder(folderName);
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "chat",
    name: (name || "Untitled Chat").trim() || "Untitled Chat",
    folderId: folder.id,
    messages: conversation.map((item) => ({ ...item })),
    compressedMemory: { ...compressedConversationMemory },
    createdAt: new Date().toISOString(),
  };

  chatFiles.unshift(file);
  selectedFolderId = folder.id;
  selectedChatFileId = file.id;
  saveDeskState();
  renderDocuments();
  closeWindow("saveChat");
  openWindow("documents");
  return file;
}

function openChatFile() {
  const file = chatFiles.find((item) => item.id === selectedChatFileId && item.type !== "text" && isInActiveProject(item));
  if (!file) return;

  conversation.length = 0;
  compressedConversationMemory = {
    text: String(file.compressedMemory?.text || ""),
    sourceMessages: Number(file.compressedMemory?.sourceMessages || 0),
    updatedAt: String(file.compressedMemory?.updatedAt || ""),
  };
  conversation.push(...file.messages.map((item) => ({ ...item })));
  messagesEl.replaceChildren();
  file.messages.forEach((item) => addMessage(item.role, item.content));
  openWindow("assistant");
}

function openChatFileWindow(fileId) {
  const file = chatFiles.find((item) => item.id === fileId && item.type !== "text" && isInActiveProject(item));
  if (!file) return;

  selectedChatFileId = file.id;
  chatFileTitleEl.textContent = file.name;
  chatFileMetaEl.textContent = t("messages_count", file.messages.length);
  chatFileBodyEl.innerHTML = renderChatTranscript(file.messages);
  openWindow("chatFile");
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

function renameActiveFile() {
  const activeWin = document.querySelector(".window.is-active");
  if (activeWin?.dataset.window === "projects") {
    const item = getSelectedProjectFinderItem();
    if (!item || item.canRename === false || item.virtual) {
      setStatus(t("select_finder_item_first"));
      return;
    }
    renameSelectedDocumentItem();
    renderProjectDisks();
    return;
  }

  if (activeWin?.dataset.window === "documents" && (selectedChatFileId || selectedDocumentFolderId)) {
    renameSelectedDocumentItem();
    return;
  }

  const file = getActiveFile();
  if (!file) {
    setStatus(t("open_file_first_rename"));
    return;
  }

  const name = window.prompt(t("rename_file_prompt"), file.name);
  if (!name?.trim()) return;

  file.name = name.trim();
  file.updatedAt = new Date().toISOString();
  if (file.type === "text") {
    teachTextNameInput.value = file.name;
    teachTextTitleEl.textContent = file.name;
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

  if (openSavedDocMapFile(file)) {
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
  }

  selectedFolderId = folder.id;
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  teachTextTitleEl.textContent = file.name;
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
