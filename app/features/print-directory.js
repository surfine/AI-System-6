// Feature module: print-directory.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



let currentPrintDirectoryMarkdown = "";
let currentPrintDirectoryName = "";

function printableDirectoryActiveName() {
  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  return active?.dataset.window || "";
}

function markdownTableText(value) {
  return String(value ?? "--")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim() || "--";
}

function printDirectoryDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString();
}

function printDirectoryViewLabel(mode) {
  return t(getFinderViewModeLabelKey(normalizeFinderViewMode(mode)));
}

function printDirectoryItemRow(item) {
  return {
    name: getFinderItemName(item),
    kind: getFinderItemKindLabel(item),
    size: getFinderItemSizeLabel(item) || "--",
    modified: printDirectoryDate(getFinderItemModifiedAt(item)),
  };
}

function getDocumentsPrintDirectoryItems(mode) {
  const currentParentId = selectedFolderId === "all" ? null : selectedFolderId;
  const visibleFiles = selectedFolderId === "all"
    ? getProjectFiles().filter((file) => {
        const folder = file.folderId ? getProjectFolders().find((item) => item.id === file.folderId) : null;
        return !folder;
      })
    : getProjectFiles().filter((file) => file.folderId === currentParentId);
  const visibleFolders = getProjectFolders()
    .filter((folder) => (folder.parentId || null) === currentParentId)
    .map(getDocumentFolderItem);
  return sortFinderItemsForView([...visibleFolders, ...visibleFiles.map(getProjectFileFinderItem)], mode);
}

function getTrashPrintDirectoryItems() {
  return getProjectTrashItems().map((item) => ({
    name: item.title,
    kindLabel: item.originalType ? t(`trash_type_${item.originalType}`) : t("trash_type_note"),
    sizeLabel: item.body ? `${String(item.body).length} bytes` : "--",
    modifiedAt: item.deletedAt || item.createdAt || "",
  }));
}

function buildPrintDirectorySnapshot() {
  const activeName = printableDirectoryActiveName();
  if (!printableDirectoryWindowNames.has(activeName)) return null;

  if (finderContainerWindowNames.includes(activeName)) {
    const mode = normalizeFinderViewMode(windowViewModes[activeName]);
    const title = activeName === "finder"
      ? t("system_folder")
      : activeName === "helpFolder"
        ? t("help_folder")
      : activeName === "applications"
        ? t("applications")
        : t("startup_disk");
    return {
      title,
      source: title,
      viewMode: mode,
      items: sortFinderItemsForView(getStaticFinderItems(activeName), mode).map(printDirectoryItemRow),
    };
  }

  if (activeName === "projects") {
    const mode = normalizeFinderViewMode(windowViewModes.projects);
    const parentId = getProjectFinderCurrentParentId();
    const folder = parentId ? getProjectFolders().find((item) => item.id === parentId) : null;
    const project = getActiveProject();
    const title = folder ? displayFolderName(folder.name) : project ? projectDisplayName(project) : t("project_disk");
    return {
      title,
      source: title,
      viewMode: mode,
      items: sortFinderItemsForView(getProjectRootFinderItems(), mode).map(printDirectoryItemRow),
    };
  }

  if (activeName === "documents") {
    const mode = normalizeFinderViewMode(windowViewModes.documents);
    const folder = selectedFolderId === "all"
      ? null
      : getProjectFolders().find((item) => item.id === selectedFolderId);
    const title = folder ? displayFolderName(folder.name) : t("documents");
    return {
      title,
      source: title,
      viewMode: mode,
      items: getDocumentsPrintDirectoryItems(mode).map(printDirectoryItemRow),
    };
  }

  if (activeName === "trash") {
    const title = t("trash");
    return {
      title,
      source: title,
      viewMode: "name",
      items: getTrashPrintDirectoryItems().map(printDirectoryItemRow),
    };
  }

  return null;
}

function buildPrintDirectoryMarkdown(snapshot) {
  const viewLabel = printDirectoryViewLabel(snapshot.viewMode);
  const date = new Date().toLocaleDateString();
  const rows = snapshot.items.length
    ? snapshot.items.map((item) => `| ${markdownTableText(item.name)} | ${markdownTableText(item.kind)} | ${markdownTableText(item.size)} | ${markdownTableText(item.modified)} |`)
    : [`| ${markdownTableText(t("folder_empty"))} | -- | -- | -- |`];
  return [
    `# ${snapshot.title}`,
    "",
    "Printed from AI System 6",
    `View: ${viewLabel}`,
    `Date: ${date}`,
    `Items: ${snapshot.items.length}`,
    "",
    "| Name | Kind | Size | Modified |",
    "|---|---|---:|---|",
    ...rows,
  ].join("\n");
}

function renderPrintDirectoryPreview(snapshot, markdown) {
  currentPrintDirectoryMarkdown = markdown;
  currentPrintDirectoryName = `${snapshot.title} Directory`;
  if (printDirectorySourceEl) printDirectorySourceEl.textContent = t("print_directory_from", snapshot.source);
  if (printDirectoryMetaEl) {
    printDirectoryMetaEl.textContent = t("print_directory_meta", printDirectoryViewLabel(snapshot.viewMode), snapshot.items.length);
  }
  if (printDirectoryPreviewEl) {
    printDirectoryPreviewEl.innerHTML = parseMarkdownDocument(markdown).html;
  }
}

function openPrintDirectoryPreview() {
  const snapshot = buildPrintDirectorySnapshot();
  if (!snapshot) return;
  const markdown = buildPrintDirectoryMarkdown(snapshot);
  renderPrintDirectoryPreview(snapshot, markdown);
  openWindow("printDirectory");
}

function downloadPrintedDirectoryMarkdown() {
  if (!currentPrintDirectoryMarkdown) return;
  downloadPlainMarkdown(currentPrintDirectoryMarkdown, currentPrintDirectoryName || t("print_directory_title"), "print_directory_downloaded");
}
