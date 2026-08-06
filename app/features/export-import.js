// Feature module: export-import.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

function apiUrl(pathname) {
  const configuredBase = window.AISystem6Config?.apiBaseUrl || "";
  if (configuredBase) return new URL(pathname, configuredBase).toString();
  if (window.location.protocol === "file:") return `http://localhost:4173${pathname}`;
  return pathname;
}

function compactStatusDetail(detail) {
  return String(detail || "").replace(/\s+/g, " ").trim().slice(0, 160);
}


function getChatFileTitle() {
  const firstUserMessage = conversation.find((item) => item.role === "user")?.content;
  if (!firstUserMessage) {
    // "Chat" is the object name and stays untranslated, as it does in "Chat
    // file" everywhere else; the clock is not, and an empty locale list gave the
    // Chinese desktop a browser-supplied "04:12 AM".
    const clock = new Date().toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Chat ${clock}`;
  }

  return firstUserMessage.replace(/\s+/g, " ").slice(0, 42);
}

function formatChatFile(file) {
  return file.messages.map((item) => `${item.role}: ${item.content}`).join("\n\n");
}

function formatChatFileMarkdown(file) {
  return [
    `# ${file.name}`,
    "",
    `- Chat ID: ${file.id}`,
    `- Parent Chat ID: ${file.parentChatId || "root"}`,
    `- Fork Message ID: ${file.forkMessageId || "none"}`,
    `- Generation: ${Number(file.generation || 0)}`,
    "",
    ...file.messages.flatMap((item) => [
      `## ${item.role === "user" ? t("you") : t("assistant")}`,
      "",
      item.content,
      "",
    ]),
  ].join("\n").trim();
}

function sanitizeFilename(name) {
  const cleaned = (name || "Untitled").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled";
}

async function copyMarkdown(markdown) {
  try {
    await navigator.clipboard.writeText(markdown);
    setClipboard(markdown, t("copy_markdown"));
    setStatus(t("copied_markdown"));
  } catch {
    const helper = document.createElement("textarea");
    helper.value = markdown;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.append(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();

    if (!copied) {
      setStatus(t("copy_failed"));
      return;
    }

    setClipboard(markdown, t("copy_markdown"));
    setStatus(t("copied_markdown"));
  }
}

function downloadMarkdown(markdown, name, options = {}) {
  const projectCdItem = options.addToProjectCd === false ? null : addProjectCdItem(markdown, name);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(name)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(projectCdItem ? t("downloaded_markdown_exported", projectCdItem.title) : t("downloaded_markdown_only"));
}

function downloadPlainMarkdown(markdown, name, statusKey = "downloaded_plain_markdown") {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(name)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(t(statusKey));
}

function downloadProjectCdItem(item) {
  if (!item) return;
  const type = item.format || "text/markdown";
  const title = item.title || "Project CD Item.md";
  const blob = new Blob([item.body || ""], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFilename(title).replace(/\.md$/i, type === "text/html" ? ".html" : ".md");
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(type === "text/html" ? "HTML downloaded." : t("downloaded_plain_markdown"));
}

function downloadJsonFile(data, name) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(name)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function countMarkdownWords(text) {
  const source = String(text || "");
  const cjk = source.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
  const latin = source
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ")
    .match(/[\p{L}\p{N}]+/gu)?.length || 0;
  return cjk + latin;
}

async function buildProjectDiskExport(project = getActiveProject()) {
  if (!project) return null;
  const projectId = project.id;
  const bundle = {
    format: "ai-system-6-project-disk",
    formatVersion: window.AISystem6ProjectDiskBackup.currentFormatVersion,
    schemaVersion: indexedDbVersion,
    appVersion: appVersionInfo.version,
    appBuild: appVersionInfo.build,
    storageVersion,
    exportedAt: new Date().toISOString(),
    projectRevision: project.updatedAt || "",
    project,
    folders: chatFolders.filter((folder) => folder.projectId === projectId),
    files: chatFiles.filter((file) => file.projectId === projectId),
    scraps: scraps.filter((scrap) => scrap.projectId === projectId),
    trash: trashItems.filter((item) => item.projectId === projectId),
    projectCdItems: projectCdItems.filter((item) => item.projectId === projectId),
    references: projectReferences.filter((reference) => reference.projectId === projectId),
  };
  return window.AISystem6ProjectDiskBackup.attachIntegrity(bundle);
}

async function exportActiveProjectDisk() {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  const bundle = await buildProjectDiskExport(project);
  const name = `${project.name} Project Hard Disk Backup`;
  downloadJsonFile(bundle, name);
  setStatus(t("project_disk_exported", project.name));
}

function openProjectBackupPanel() {
  openWindow("importUtility");
  const backupSection = document.querySelector(".backup-preview-section");
  if (backupSection) backupSection.open = true;
  projectBackupFileButton?.focus();
}

function projectCdItemReviewRecorded(item) {
  return item?.metadata?.reviewDeskComplete === true || item?.metadata?.workflowState === "final";
}

async function confirmProjectCdExportAfterReview(item) {
  if (!item) return false;
  if (item.sourceKind !== "markdown" || projectCdItemReviewRecorded(item)) return true;
  return showSystemModal(t("project_cd_review_reminder", item.title), "confirm");
}

async function downloadSelectedProjectCdItem() {
  const item = getSelectedProjectCdItem();
  if (!item) {
    setStatus(t("select_find_path_first"));
    return false;
  }
  if (!await confirmProjectCdExportAfterReview(item)) return false;
  downloadProjectCdItem(item);
  return true;
}

async function printSelectedProjectCdItem() {
  const item = getSelectedProjectCdItem();
  if (!item) {
    setStatus(t("select_find_path_first"));
    return false;
  }
  if (!await confirmProjectCdExportAfterReview(item)) return false;
  return printSelectedProjectCdPdf();
}

function addProjectCdItem(markdown, name) {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    return null;
  }

  const title = `${sanitizeFilename(name)}.md`;
  const existingIndex = projectCdItems.findIndex((item) =>
    item.projectId === activeProjectId && item.title === title
  );
  const now = new Date().toISOString();
  const item = {
    id: existingIndex >= 0 ? projectCdItems[existingIndex].id : crypto.randomUUID(),
    projectId: activeProjectId,
    title,
    format: "text/markdown",
    body: markdown,
    sourceDocumentId: activeTextFileId || "",
    sourceKind: "markdown",
    claimCheckId: "",
    burnedAt: existingIndex >= 0 ? projectCdItems[existingIndex].burnedAt : now,
    updatedAt: now,
    languageMode: /Bilingual/i.test(String(name || "")) ? "bilingual" : "original",
    metadata: {
      sourceName: name,
      wordCount: countMarkdownWords(markdown),
      workflowState: typeof teachTextWorkflowState === "string" ? teachTextWorkflowState : "",
      reviewDeskComplete: typeof teachTextWorkflowState === "string" && teachTextWorkflowState === "final",
    },
  };

  if (existingIndex >= 0) {
    projectCdItems.splice(existingIndex, 1);
  }
  projectCdItems.unshift(item);
  selectedProjectCdItemId = item.id;
  selectedProjectCdItemIds.clear();
  selectedProjectCdItemIds.add(item.id);
  renderProjectCd();
  saveDeskState();
  return item;
}

function projectCdBurnIsAvailable() {
  if (!getActiveProject()) return false;
  const body = String(teachTextBodyInput?.value || "").trim();
  if (!body) return false;
  const isSlidesMarkdown = typeof readerHasMarpFrontmatter === "function"
    && readerHasMarpFrontmatter(body);
  const isManuscript = typeof activeTeachTextAllows === "function"
    ? activeTeachTextAllows("projectCdExport")
    : (typeof isTeachTextManuscriptRole !== "function" || isTeachTextManuscriptRole());
  return isManuscript || isSlidesMarkdown;
}

function syncProjectCdBurnActionVisibility(visibleItems = getProjectCdItems()) {
  if (!spineBurnProjectCdButtonEl) return;
  spineBurnProjectCdButtonEl.hidden = visibleItems.length > 0 || !projectCdBurnIsAvailable();
}

function renderProjectCd() {
  if (!projectCdGridEl) return;
  const visibleItems = getProjectCdItems();
  const hasVisibleItems = visibleItems.length > 0;
  if (desktopProjectCdEl) desktopProjectCdEl.hidden = !hasVisibleItems;
  syncProjectCdBurnActionVisibility(visibleItems);
  desktopProjectCdEl?.setAttribute("aria-hidden", String(!hasVisibleItems));
  desktopProjectCdEl?.setAttribute("title", t("project_cd_items_count", visibleItems.length));
  const visibleIds = new Set(visibleItems.map((item) => item.id));
  Array.from(selectedProjectCdItemIds).forEach((id) => {
    if (!visibleIds.has(id)) selectedProjectCdItemIds.delete(id);
  });
  if (!visibleItems.some((item) => item.id === selectedProjectCdItemId)) {
    selectedProjectCdItemId = visibleItems[0]?.id || null;
  }
  if (selectedProjectCdItemId && !selectedProjectCdItemIds.size) selectedProjectCdItemIds.add(selectedProjectCdItemId);
  syncProjectCdSelectionControls(visibleItems);
  projectCdCountEl.textContent = t("project_cd_items_count", visibleItems.length);
  projectCdGridEl.replaceChildren();

  if (!visibleItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note export-empty-note";
    empty.innerHTML = `
      <span class="mini-icon export-empty-icon"></span>
      <b>${escapeHtml(t("export_empty_title"))}</b>
      <span>${escapeHtml(t("export_empty_body"))}</span>
    `;
    projectCdGridEl.append(empty);
    return;
  }

  visibleItems.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.draggable = true;
    button.dataset.dragType = "project-cd-item";
    button.dataset.id = item.id;
    button.dataset.projectId = item.projectId || activeProjectId || "";
    button.dataset.projectCdItemId = item.id;
    button.className = `finder-item export-item${selectedProjectCdItemIds.has(item.id) ? " is-selected" : ""}`;
    const updatedAt = new Date(item.updatedAt || item.burnedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const bytes = new Blob([item.body || ""]).size;
    button.title = t("project_cd_open_hint");
    button.innerHTML = `
      <span class="mini-icon doc-icon"></span>
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(t("export_item_meta", updatedAt, bytes))}</small>
    `;
    button.addEventListener("click", (event) => {
      if (event.shiftKey && selectedProjectCdItemId) {
        const anchorIndex = visibleItems.findIndex((entry) => entry.id === selectedProjectCdItemId);
        const itemIndex = visibleItems.findIndex((entry) => entry.id === item.id);
        selectedProjectCdItemIds.clear();
        if (anchorIndex >= 0 && itemIndex >= 0) {
          const start = Math.min(anchorIndex, itemIndex);
          const end = Math.max(anchorIndex, itemIndex);
          visibleItems.slice(start, end + 1).forEach((entry) => selectedProjectCdItemIds.add(entry.id));
        } else {
          selectedProjectCdItemIds.add(item.id);
        }
      } else if (event.metaKey || event.ctrlKey) {
        if (selectedProjectCdItemIds.has(item.id) && selectedProjectCdItemIds.size > 1) {
          selectedProjectCdItemIds.delete(item.id);
        } else {
          selectedProjectCdItemIds.add(item.id);
        }
      } else {
        selectedProjectCdItemIds.clear();
        selectedProjectCdItemIds.add(item.id);
      }
      selectedProjectCdItemId = selectedProjectCdItemIds.has(item.id) ? item.id : selectedProjectCdItemIds.values().next().value || null;
      syncProjectCdSelectionControls(visibleItems);
    });
    button.addEventListener("dblclick", () => openProjectCdItemInReader(item));
    projectCdGridEl.append(button);
  });
}

function syncProjectCdSelectionControls(visibleItems = getProjectCdItems()) {
  const hasSelectedItem = !!selectedProjectCdItemId;
  [downloadProjectCdButton, printProjectCdPdfButton].forEach((button) => {
    if (!button) return;
    button.disabled = !hasSelectedItem;
    button.classList.toggle("is-disabled", !hasSelectedItem);
  });
  if (clearProjectCdButton) {
    clearProjectCdButton.disabled = visibleItems.length === 0;
    clearProjectCdButton.classList.toggle("is-disabled", visibleItems.length === 0);
  }
  projectCdGridEl?.querySelectorAll("[data-project-cd-item-id]").forEach((button) => {
    button.classList.toggle("is-selected", selectedProjectCdItemIds.has(button.dataset.projectCdItemId));
  });
  syncProjectCdSlidesHtmlButton();
  updateMenuState();
}

function createProjectCdReaderDocumentTab(item) {
  if (!item) return null;
  return upsertDocumentTab("reader", "export_preview", {
    title: item.title || "Project CD Item.md",
    backing: { type: "projectCd", id: item.id },
    state: {
      kind: "projectCd",
      title: item.title || "Project CD Item.md",
      text: item.body || "",
      source: t("project_cd"),
      fileName: item.title || "",
    },
  });
}

function openProjectCdItemInReader(item) {
  if (!item?.body?.trim()) return;
  const tab = createProjectCdReaderDocumentTab(item);
  if (tab && typeof openReaderDocumentTab === "function") {
    openReaderDocumentTab(tab.id);
  } else {
    openReaderDocument({
      kind: "projectCd",
      title: item.title || "Project CD Item.md",
      text: item.body || "",
      source: t("project_cd"),
      fileName: item.title || "",
    });
  }
  openWindow("reader");
}

function getSelectedProjectCdItems() {
  const visibleItems = getProjectCdItems();
  if (!selectedProjectCdItemIds.size && selectedProjectCdItemId) selectedProjectCdItemIds.add(selectedProjectCdItemId);
  const selected = visibleItems.filter((item) => selectedProjectCdItemIds.has(item.id));
  return selected.length ? selected : visibleItems.filter((item) => item.id === selectedProjectCdItemId);
}

function selectedProjectCdItemIsSlidesMarkdown() {
  const item = getSelectedProjectCdItem();
  return !!item && item.format !== "text/html" && typeof readerHasMarpFrontmatter === "function" && readerHasMarpFrontmatter(item.body || "");
}

function syncProjectCdSlidesHtmlButton() {
  const row = document.querySelector(".project-cd-pane > .button-row");
  if (!row) return;
  let openButton = document.querySelector("#open-project-cd-clio-stage");
  if (!openButton) {
    openButton = document.createElement("button");
    openButton.className = "btn";
    openButton.type = "button";
    openButton.id = "open-project-cd-clio-stage";
    openButton.textContent = t("open_in_clio_stage");
    openButton.addEventListener("click", openSelectedProjectCdInClioStage);
    row.insertBefore(openButton, clearProjectCdButton || null);
  }
  const enabled = selectedProjectCdItemIsSlidesMarkdown();
  openButton.hidden = !enabled;
  openButton.disabled = !enabled;
}

async function openSelectedProjectCdInClioStage() {
  const item = getSelectedProjectCdItem();
  if (!item || !selectedProjectCdItemIsSlidesMarkdown()) return;
  await openClioStageApp({
    title: item.title || "slides.md",
    markdown: item.body || "",
    sourceKind: "projectCd",
    sourceItemId: item.id,
  });
}

function getSelectedProjectCdItem() {
  const visibleItems = getProjectCdItems();
  return visibleItems.find((item) => item.id === selectedProjectCdItemId) || visibleItems[0] || null;
}

function attachSelectedProjectCdToAssistantContext() {
  const item = getSelectedProjectCdItem();
  const body = String(item?.body || "").trim();
  if (!item || !body) {
    setStatus(t("select_find_path_first"));
    return null;
  }

  let scrap = scraps.find((entry) =>
    entry.projectId === activeProjectId
    && entry.source?.type === "project-cd"
    && entry.source?.projectCdItemId === item.id
  );
  if (!scrap) {
    scrap = createScrap(`Project CD Context: ${item.title || t("project_cd")}`, [
      `Project CD item: ${item.title || t("project_cd")}`,
      "",
      body,
      "",
      "---",
      `Source: ${t("project_cd")}`,
      `Project CD item id: ${item.id || ""}`,
      `Time: ${new Date().toLocaleString()}`,
    ].join("\n"), {
      reveal: false,
      source: {
        type: "project-cd",
        title: item.title || t("project_cd"),
        projectCdItemId: item.id || "",
      },
    });
    if (scrap) {
      scrap.tags = [...new Set(["project-cd", "final-manuscript", ...(scrap.tags || [])])];
      renderScraps();
      saveDeskState();
    }
  }
  if (!scrap) return null;

  attachedClipIds.add(scrap.id);
  renderAttachedClips();
  openWindow("assistant");
  setStatus(t("attach_to_assistant"));
  return scrap;
}

function moveProjectCdItemsToTrash(ids = []) {
  const idSet = new Set(ids.filter(Boolean));
  if (!idSet.size && selectedProjectCdItemId) idSet.add(selectedProjectCdItemId);
  const moved = [];
  for (let index = projectCdItems.length - 1; index >= 0; index -= 1) {
    const item = projectCdItems[index];
    if (!isInActiveProject(item) || !idSet.has(item.id)) continue;
    projectCdItems.splice(index, 1);
    moved.unshift(item);
    trashItems.unshift({
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      title: item.title,
      body: item.body || "",
      deletedAt: new Date().toISOString(),
      originalType: "projectCd",
      originalData: structuredClone(item),
      originalPath: [projectDisplayName(getActiveProject()), t("project_cd")].filter(Boolean).join(" / "),
    });
  }
  selectedProjectCdItemIds.clear();
  selectedProjectCdItemId = getProjectCdItems()[0]?.id || null;
  if (selectedProjectCdItemId) selectedProjectCdItemIds.add(selectedProjectCdItemId);
  purgeContextForTrashedItems(moved.map((item) => ({ type: "projectCd", id: item.id, item })));
  renderProjectCd();
  renderTrash();
  saveDeskState();
  if (moved.length) {
    playSystemSound("trash");
    setStatus(t("project_cd_trashed", moved.length));
  }
}

function clearProjectCd() {
  for (let index = projectCdItems.length - 1; index >= 0; index -= 1) {
    if (isInActiveProject(projectCdItems[index])) {
      projectCdItems.splice(index, 1);
    }
  }
  selectedProjectCdItemId = null;
  selectedProjectCdItemIds.clear();
  renderProjectCd();
  setStatus(t("project_cd_cleared"));
  saveDeskState();
}

async function refreshImporterStatus() {
  if (!importerStatusEl) return;
  importerStatusEl.classList.remove("is-hidden");
  importerStatusEl.textContent = t("importer_status_checking");
  importerStatusEl.dataset.state = "checking";

  try {
    const capabilities = await getDeploymentCapabilities();
    if (capabilities.public_deployment) {
      importerStatusEl.textContent = t("importer_status_browser");
      importerStatusEl.dataset.state = "ready";
      importerStatusEl.title = t("importer_status_browser_detail");
      if (ocrEngineInput) {
        ocrEngineInput.value = "paddle";
        ocrEngineInput.disabled = true;
        refreshSystemSelectControl(ocrEngineInput);
      }
      if (importerModeInput) {
        importerModeInput.value = "builtin";
        importerModeInput.disabled = true;
        refreshSystemSelectControl(importerModeInput);
      }
      return;
    }
    const response = await fetch(apiUrl("/api/importer-status"));
    const status = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(status.detail || response.statusText);

    if (status.markitdown) {
      importerStatusEl.textContent = t("importer_status_ready", status.python || "python3");
      importerStatusEl.dataset.state = "ready";
    } else if (status.enabled === false) {
      importerStatusEl.textContent = t("importer_status_disabled");
      importerStatusEl.dataset.state = "disabled";
    } else {
      const detail = compactStatusDetail(status.detail);
      importerStatusEl.textContent = detail
        ? t("importer_status_unavailable_detail", detail)
        : t("importer_status_unavailable");
      importerStatusEl.dataset.state = "unavailable";
      importerStatusEl.title = [
        status.detail || "",
        status.python ? `Python: ${status.python}` : "",
      ].filter(Boolean).join("\n");
    }
  } catch (error) {
    const detail = compactStatusDetail(error.message || String(error));
    importerStatusEl.textContent = detail
      ? t("importer_status_unavailable_detail", detail)
      : t("importer_status_unavailable");
    importerStatusEl.dataset.state = "unavailable";
    importerStatusEl.title = error.message || String(error);
  }
}

function isSupportedImportFile(file) {
  return /\.(txt|text|srt|rtf|md|mdx|markdown|mdown|mkd|mkdn|csv|tsv|json|js|ts|htm|html|xhtml|webarchive|css|xml|log|pdf|docx|pages|numbers|key|epub|pptx|xlsx|bmp|jpe?g|png|webp|heic|heif)$/i.test(file.name || "")
    || isAudioImportFile(file);
}

function isPlainTextImportFile(file) {
  return /\.(txt|text|srt|md|mdx|markdown|mdown|mkd|mkdn|csv|tsv|json|js|ts|htm|html|xhtml|css|xml|log)$/i.test(file.name || "");
}

function isAudioImportFile(file) {
  return /\.(aac|aif|aiff|amr|caf|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(file.name || "")
    || /^audio\//i.test(file.type || "");
}

function importTranscriptionLanguage() {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

const importPayloadMaxRawBytes = 60 * 1024 * 1024;
const paddleOcrDetModelPath = "/assets/ocr/paddle/det/model.json";
const paddleOcrRecModelPath = "/assets/ocr/paddle/rec/model.json";
const pdfJsBrowserPath = "/app/vendor/pdf.min.js";
const pdfJsWorkerPath = "/app/vendor/pdf.worker.min.js";
let paddleOcrBrowserPromise = null;
let pdfJsBrowserPromise = null;

async function getDeploymentCapabilities() {
  if (window.AISystem6PublicAccess?.getCapabilities) {
    return window.AISystem6PublicAccess.getCapabilities();
  }
  return {
    deployment_profile: "local",
    public_deployment: false,
    features: {},
  };
}

function stripLeadingBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

function decodeUtf16BEBytes(bytes) {
  const chars = [];
  const length = bytes.length - (bytes.length % 2);
  for (let index = 0; index < length; index += 2) {
    chars.push(String.fromCharCode((bytes[index] << 8) | bytes[index + 1]));
  }
  return chars.join("");
}

function decodeBytesWithLabel(bytes, label, options = {}) {
  try {
    return new TextDecoder(label, options).decode(bytes);
  } catch {
    if (label === "utf-16be") return decodeUtf16BEBytes(bytes);
    if (label === "utf-16le") {
      const even = bytes.length - (bytes.length % 2);
      let text = "";
      for (let index = 0; index < even; index += 2) {
        text += String.fromCharCode(bytes[index] | (bytes[index + 1] << 8));
      }
      return text;
    }
    return "";
  }
}

function decodePlainTextArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return stripLeadingBom(decodeBytesWithLabel(bytes.subarray(3), "utf-8"));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return stripLeadingBom(decodeBytesWithLabel(bytes.subarray(2), "utf-16le"));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return stripLeadingBom(decodeBytesWithLabel(bytes.subarray(2), "utf-16be"));
  }

  try {
    return stripLeadingBom(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    const gb18030 = decodeBytesWithLabel(bytes, "gb18030");
    return stripLeadingBom(gb18030 || new TextDecoder("utf-8").decode(bytes));
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const batchSize = 0x8000;
  for (let index = 0; index < bytes.length; index += batchSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + batchSize));
  }
  return btoa(binary);
}

function fileDiskAbortError() {
  const error = new Error("File Floppy insertion was canceled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw fileDiskAbortError();
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function canBrowserNormalizeImageFile(file) {
  return /\.(webp|heic|heif)$/i.test(file.name || "");
}

function isImageImportFile(file) {
  return /\.(bmp|jpe?g|png|webp|heic|heif)$/i.test(file.name || "")
    || /^image\//i.test(file.type || "");
}

function isBrowserPaddleOcrFile(file) {
  return isImageImportFile(file)
    || /\.(pdf|pages|numbers|key)$/i.test(file.name || "")
    || /^(application\/pdf|application\/vnd\.apple\.(numbers|keynote))$/i.test(file.type || "");
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Browser could not decode this image."));
    };
    image.src = url;
  });
}

async function convertImageFileToPngArrayBuffer(file) {
  const image = await loadImageElementFromFile(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height || width * height > 50000000) {
    throw new Error("Image dimensions are too large for browser conversion.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Browser image conversion failed."));
    }, "image/png");
  });
  return blob.arrayBuffer();
}

function loadClassicScriptOnce(src) {
  const existing = document.querySelector(`script[data-ai-system6-src="${CSS.escape(src)}"]`);
  if (existing) {
    return existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Could not load ${src}.`)), { once: true });
      });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.aiSystem6Src = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Could not load ${src}.`)), { once: true });
    document.head.append(script);
  });
}

async function getBrowserPaddleOcr() {
  if (!paddleOcrBrowserPromise) {
    paddleOcrBrowserPromise = loadClassicScriptOnce("/app/vendor/paddle-ocr.js")
      .then(async () => {
        const ocr = window.paddlejs?.ocr;
        if (!ocr || typeof ocr.init !== "function" || typeof ocr.recognize !== "function") {
          throw new Error("PaddleOCR Tiny did not expose its browser OCR API.");
        }
        await ocr.init(paddleOcrDetModelPath, paddleOcrRecModelPath);
        return ocr;
      });
  }
  return paddleOcrBrowserPromise;
}

async function getBrowserPdfJs() {
  if (!pdfJsBrowserPromise) {
    pdfJsBrowserPromise = import(pdfJsBrowserPath)
      .then((pdfjs) => {
        if (!pdfjs || typeof pdfjs.getDocument !== "function") {
          throw new Error("PDF.js did not expose its browser PDF API.");
        }
        pdfjs.GlobalWorkerOptions.workerSrc = pdfJsWorkerPath;
        return pdfjs;
      });
  }
  return pdfJsBrowserPromise;
}

async function extractImageTextWithBrowserPaddle(file, options = {}) {
  throwIfAborted(options.signal);
  const image = await loadImageElementFromFile(file);
  throwIfAborted(options.signal);
  const ocr = await getBrowserPaddleOcr();
  throwIfAborted(options.signal);
  const result = await ocr.recognize(image);
  const lines = Array.isArray(result?.text) ? result.text : [result?.text || ""];
  const text = lines.map((line) => String(line || "").trim()).filter(Boolean).join("\n").trim();
  if (!text) throw new Error("PaddleOCR Tiny did not return readable text.");
  return text;
}

function base64ToBlobUrl(base64, mimeType = "image/png") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

async function loadImageElementFromBlobUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Browser could not decode an OCR page image."));
    image.src = url;
  });
}

async function recognizePaddleImageElement(image, options = {}) {
  throwIfAborted(options.signal);
  const ocr = await getBrowserPaddleOcr();
  throwIfAborted(options.signal);
  const result = await ocr.recognize(image);
  const lines = Array.isArray(result?.text) ? result.text : [result?.text || ""];
  return lines.map((line) => String(line || "").trim()).filter(Boolean).join("\n").trim();
}

async function extractPdfTextInBrowser(file, options = {}) {
  const signal = options.signal;
  throwIfAborted(signal);
  if ((file.size || 0) > 20 * 1024 * 1024) {
    throw new Error(t("public_import_pdf_too_large"));
  }

  const pdfjs = await getBrowserPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDocument = await loadingTask.promise;
  const pageLimit = Math.min(pdfDocument.numPages, 20);
  const chunks = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await pdfDocument.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        const embeddedText = (textContent.items || [])
          .map((item) => String(item?.str || "").trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        if (embeddedText) {
          chunks.push(`${t("public_import_page", pageNumber)}\n${embeddedText}`);
          continue;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const pixelBudget = 6_000_000;
        const scale = Math.min(
          1.75,
          Math.sqrt(pixelBudget / Math.max(1, baseViewport.width * baseViewport.height))
        );
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        await page.render({
          canvasContext: context,
          viewport,
          background: "rgb(255,255,255)",
        }).promise;
        throwIfAborted(signal);
        const text = await recognizePaddleImageElement(canvas, { signal });
        canvas.width = 1;
        canvas.height = 1;
        if (text) chunks.push(`${t("public_import_page", pageNumber)}\n${text}`);
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdfDocument.destroy();
  }

  if (pdfDocument.numPages > pageLimit) {
    chunks.push(t("public_import_pdf_truncated", pageLimit, pdfDocument.numPages));
  }
  const text = chunks.join("\n\n").trim();
  if (!text) throw new Error(t("public_import_pdf_empty"));
  return text;
}

async function extractRenderedPagesWithBrowserPaddle(file, options = {}) {
  const signal = options.signal;
  throwIfAborted(signal);
  const fileBuffer = await file.arrayBuffer();
  throwIfAborted(signal);
  const response = await fetch(apiUrl("/api/import-ocr-pages"), {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      type: file.type,
      data: arrayBufferToBase64(fileBuffer),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || response.statusText);
  }
  if (data.text && !data.pages?.length) return data.text;

  const chunks = [];
  for (const page of data.pages || []) {
    throwIfAborted(signal);
    const url = base64ToBlobUrl(page.data, page.mimeType || "image/png");
    try {
      const image = await loadImageElementFromBlobUrl(url);
      const text = await recognizePaddleImageElement(image, { signal });
      if (text) chunks.push(`第 ${page.pageNumber || chunks.length + 1} 页\n${text}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (data.truncated) {
    chunks.push("PaddleOCR 已在可渲染页数限制后停止。");
  }
  const text = chunks.join("\n\n").trim();
  if (!text) throw new Error("PaddleOCR Tiny did not return readable text.");
  return text;
}

async function buildImportFilePayload(file, options = {}) {
  const signal = options.signal;
  throwIfAborted(signal);

  if ((file.size || 0) > importPayloadMaxRawBytes) {
    throw new Error("This file is too large for direct import. Split it or import a smaller file.");
  }

  if (canBrowserNormalizeImageFile(file)) {
    try {
      throwIfAborted(signal);
      const pngBuffer = await convertImageFileToPngArrayBuffer(file);
      throwIfAborted(signal);
      return {
        name: file.name,
        type: "image/png",
        model_execution: "client",
        importerMode: importerModeInput?.value || "auto",
        ocrEngine: ocrEngineInput?.value || "auto",
        data: arrayBufferToBase64(pngBuffer),
      };
    } catch {
      // Server-side native conversion or vision OCR can still try the original file.
    }
  }

  throwIfAborted(signal);
  const fileBuffer = await file.arrayBuffer();
  throwIfAborted(signal);
  return {
    name: file.name,
    type: file.type,
    model_execution: "client",
    language: isAudioImportFile(file) ? importTranscriptionLanguage() : undefined,
    importerMode: importerModeInput?.value || "auto",
    ocrEngine: ocrEngineInput?.value || "auto",
    data: arrayBufferToBase64(fileBuffer),
  };
}

async function repairImportedTextWithLocalModel(text, file, signal) {
  if (!localLmStudioConnectionEnabled || !String(text || "").trim()) return text;
  const source = String(text).trim();
  const chunkSize = 12000;
  const repaired = [];
  for (let offset = 0; offset < source.length; offset += chunkSize) {
    const chunk = source.slice(offset, offset + chunkSize);
    const result = await sendLocalModelTask({
      payload: {
        model: getLocalModelRequestName(),
        messages: window.AISystem6ModelTaskRuntime.buildImportRepairMessages(chunk, file?.name),
        temperature: 0.1,
        max_tokens: 2600,
        stream: false,
        ai_system6_task_kind: "import-text-repair",
      },
      signal,
      taskKind: "import-text-repair",
      streamPreference: "json",
    });
    repaired.push(window.AISystem6ModelTaskRuntime.cleanModelOutput(result.text || chunk));
  }
  return repaired.join("\n\n").trim() || source;
}

async function extractFileText(file, options = {}) {
  const signal = options.signal;
  throwIfAborted(signal);
  const capabilities = await getDeploymentCapabilities();

  if ((file.size || 0) > importPayloadMaxRawBytes) {
    throw new Error("This file is too large for direct import. Split it or import a smaller file.");
  }

  if (isPlainTextImportFile(file)) {
    const buffer = await file.arrayBuffer();
    throwIfAborted(signal);
    const text = decodePlainTextArrayBuffer(buffer);
    if (/\.srt$/i.test(file.name || "")) {
      await ensureVideoTranscriptModule();
      throwIfAborted(signal);
      const videoTranscript = window.AISystem6VideoTranscript?.buildVideoTranscriptSource?.(text, file.name) || null;
      return {
        text: videoTranscript?.text || text,
        subtitleTranslations: null,
        videoTranscript,
      };
    }
    return { text, subtitleTranslations: null, videoTranscript: null };
  }

  if (capabilities.public_deployment && /\.pdf$/i.test(file.name || "")) {
    const text = await extractPdfTextInBrowser(file, { signal });
    return { text, subtitleTranslations: null, videoTranscript: null };
  }

  const browserPaddleRequired =
    capabilities.public_deployment || ocrEngineInput?.value === "paddle";
  if (browserPaddleRequired && isBrowserPaddleOcrFile(file)) {
    const text = isImageImportFile(file)
      ? await extractImageTextWithBrowserPaddle(file, { signal })
      : capabilities.public_deployment
        ? (() => { throw new Error(t("public_import_unsupported", file.name)); })()
        : await extractRenderedPagesWithBrowserPaddle(file, { signal });
    return { text, subtitleTranslations: null, videoTranscript: null };
  }

  if (capabilities.public_deployment) {
    throw new Error(t("public_import_unsupported", file.name));
  }

  const payload = await buildImportFilePayload(file, { signal });
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady();
  if (isCloud) {
    payload._cloud_active = true;
    Object.assign(payload, cloudCredentialTransportFields());
    payload._cloud_base_url = cloudConfig.baseUrl;
    payload._cloud_model = cloudConfig.model;
  }
  throwIfAborted(signal);
  const response = await fetch(apiUrl("/api/import-text"), {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || response.statusText);
  }
  let extractedText = data.text || "";
  if (data.modelPostprocessRequired && !isCloud) {
    extractedText = await repairImportedTextWithLocalModel(extractedText, file, signal);
  }
  return {
    text: extractedText,
    subtitleTranslations: data.subtitleTranslations || null,
    videoTranscript: data.videoTranscript || null,
  };
}

async function previewImportFiles() {
  const files = Array.from(selectedImportFiles || []);
  importCandidates.splice(0, importCandidates.length);
  importPreviewEl.replaceChildren();

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("import_empty");
    importPreviewEl.append(empty);
    importStatusEl.textContent = t("import_ready");
    return;
  }

  let ready = 0;
  let skipped = 0;
  for (const file of files) {
    const supported = isSupportedImportFile(file);
    const record = {
      id: crypto.randomUUID(),
      name: file.name,
      supported,
      size: file.size || 0,
      body: "",
      subtitleTranslations: null,
      videoTranscript: null,
    };

    if (supported) {
      try {
        const extracted = await extractFileText(file);
        record.body = extracted.text || "";
        record.subtitleTranslations = extracted.subtitleTranslations || null;
        record.videoTranscript = extracted.videoTranscript || null;
        record.supported = !!record.body.trim();
        if (record.supported) {
          ready += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        record.supported = false;
        record.body = error.message;
        skipped += 1;
      }
    } else {
      skipped += 1;
    }
    importCandidates.push(record);
  }

  importStatusEl.textContent = t("import_preview_status", ready, skipped);
  renderImportPreview();
}

function renderImportPreview() {
  importPreviewEl.replaceChildren();
  if (!importCandidates.length) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("import_empty");
    importPreviewEl.append(empty);
    return;
  }

  importCandidates.forEach((item) => {
    const row = document.createElement("div");
    row.className = `import-row${item.supported ? "" : " is-unsupported"}`;
    row.innerHTML = `
      <span class="mini-icon ${item.supported ? "doc-icon" : "trash-icon"}"></span>
      <span>${escapeHtml(item.name)}</span>
      <small>${item.supported ? escapeHtml(t("import_supported")) : escapeHtml(t("import_unsupported"))} · ${item.size} bytes</small>
    `;
    importPreviewEl.append(row);
  });
}

function backupArrayCount(bundle, key) {
  return Array.isArray(bundle?.[key]) ? bundle[key].length : 0;
}

function renderBackupPreview(bundle, fileName = "", validation = null) {
  if (!projectBackupPreviewEl) return;
  projectBackupPreviewEl.replaceChildren();
  previewedProjectBackup = null;
  if (importProjectBackupButton) importProjectBackupButton.disabled = true;

  if (
    !bundle
    || bundle.format !== "ai-system-6-project-disk"
    || validation?.valid === false
  ) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = bundle ? t("backup_preview_invalid") : t("backup_preview_empty");
    projectBackupPreviewEl.append(empty);
    return;
  }

  const rows = [
    [t("backup_project_name"), bundle.project?.name || fileName || t("untitled_project")],
    [t("backup_format"), `${bundle.format} v${bundle.formatVersion || 1}`],
    [t("backup_exported_at"), bundle.exportedAt ? new Date(bundle.exportedAt).toLocaleString() : "--"],
    [t("storage_version"), String(bundle.storageVersion || "--")],
    [t("backup_counts"), [
      `${t("documents")}: ${backupArrayCount(bundle, "files")}`,
      `${t("scrapbook")}: ${backupArrayCount(bundle, "scraps")}`,
      `${t("trash")}: ${backupArrayCount(bundle, "trash")}`,
      `${t("project_cd")}: ${backupArrayCount(bundle, "projectCdItems")}`,
      `${t("references")}: ${backupArrayCount(bundle, "references")}`,
    ].join(" · ")],
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "import-row backup-preview-row";
    row.innerHTML = `
      <span class="mini-icon project-disk-icon"></span>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(value)}</small>
    `;
    projectBackupPreviewEl.append(row);
  });

  previewedProjectBackup = bundle;
  if (importProjectBackupButton) importProjectBackupButton.disabled = false;
}

function remapProjectDiskBackup(bundle) {
  return window.AISystem6ProjectDiskBackup.remapBackup(bundle, {
    projectName(name) {
      return uniqueProjectName(`${name || t("untitled_project")} Restored`);
    },
  });
}

async function commitImportedProjectAtomically(imported) {
  const db = await openAppDb();
  try {
    const importedProjectCdItems = [
      ...imported.projectCdItems,
      ...projectCdItems,
    ];
    const importedSettings = {
      ...settingsSnapshotPayload(),
      activeProjectId: imported.project.id,
      projectMounted: true,
      projectCdItems: importedProjectCdItems,
    };
    const storeNames = [
      projectsStoreName,
      scrapsStoreName,
      trashStoreName,
      chatFoldersStoreName,
      chatFilesStoreName,
      referenceStoreName,
      keyvalStoreName,
    ];
    await window.AISystem6StorageTransactions.runTransaction(
      db,
      storeNames,
      "readwrite",
      async (tx) => {
        const writes = [];
        const putAll = (storeName, items, normalize = (item) => item) => {
          const store = tx.objectStore(storeName);
          items.forEach((item) => writes.push(idbRequest(store.put(normalize(item)))));
        };
        putAll(projectsStoreName, [imported.project]);
        putAll(scrapsStoreName, imported.scraps);
        putAll(trashStoreName, imported.trash);
        putAll(chatFoldersStoreName, imported.folders);
        putAll(chatFilesStoreName, imported.files);
        putAll(referenceStoreName, imported.references, normalizeProjectReferenceForStorage);
        const settingsStore = tx.objectStore(keyvalStoreName);
        writes.push(idbRequest(settingsStore.put(importedSettings, "settings")));
        writes.push(idbRequest(settingsStore.put(storageVersion, "storageVersion")));
        await Promise.all(writes);
      }
    );
  } finally {
    db.close();
  }
}

async function importProjectBackupAsNewProject() {
  const backupTools = window.AISystem6ProjectDiskBackup;
  const validation = backupTools.validateBackup(previewedProjectBackup);
  const integrity = validation.valid
    ? await backupTools.verifyIntegrity(previewedProjectBackup)
    : { valid: false };
  if (!previewedProjectBackup || !validation.valid || !integrity.valid) {
    setStatus(t("backup_import_invalid"));
    return;
  }

  setControlLoading(importProjectBackupButton, true, t("backup_importing"));
  try {
    const imported = remapProjectDiskBackup(previewedProjectBackup);
    await commitImportedProjectAtomically(imported);

    projects.unshift(imported.project);
    chatFolders.unshift(...imported.folders);
    chatFiles.unshift(...imported.files);
    scraps.unshift(...imported.scraps);
    trashItems.unshift(...imported.trash);
    projectCdItems.unshift(...imported.projectCdItems);

    isProjectMounted = true;
    activeProjectId = imported.project.id;
    selectedProjectId = imported.project.id;
    selectedFolderId = "all";
    clearProjectTransientState();
    closeProjectScopedWindows();
    scheduleWorkspaceRender({ projectReferences: true, mountedTextDisk: true, menuState: true });
    openWindow("projects");
    resetAssistantForProject(imported.project.name);
    await loadActiveProjectReferences();
    storageSnapshotCache.clear();
    const saved = await saveDeskState();
    if (!saved) throw new Error("Imported project committed, but the active workspace state could not be saved.");
    scheduleDesktopMaintenance("import");
    setStatus(t("backup_imported_project", imported.project.name));
  } catch (error) {
    console.error("Project Hard Disk import failed:", error);
    setStatus(t("backup_import_invalid"));
  } finally {
    setControlLoading(importProjectBackupButton, false);
  }
}

async function previewProjectBackupFile() {
  const file = selectedProjectBackupFile;
  if (!file) {
    renderBackupPreview(null);
    return;
  }

  try {
    if (file.size > window.AISystem6ProjectDiskBackup.maxBackupBytes) {
      renderBackupPreview({});
      importStatusEl.textContent = t("backup_preview_too_large");
      return;
    }
    const bundle = JSON.parse(await file.text());
    const validation = window.AISystem6ProjectDiskBackup.validateBackup(bundle);
    const integrity = validation.valid
      ? await window.AISystem6ProjectDiskBackup.verifyIntegrity(bundle)
      : { valid: false, errors: [] };
    const accepted = validation.valid && integrity.valid;
    renderBackupPreview(bundle, file.name, { valid: accepted });
    importStatusEl.textContent = accepted
      ? t("backup_preview_status", bundle.project?.name || file.name)
      : t("backup_preview_invalid");
  } catch (error) {
    renderBackupPreview({});
    importStatusEl.textContent = t("backup_preview_invalid");
  }
}

function importReadyFilesToDocuments() {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const ready = importCandidates.filter((item) => item.supported);
  if (!ready.length) {
    setStatus(t("import_nothing_ready"));
    return;
  }

  const folder = ensureFolder(t("default_folder"));
  const now = new Date().toISOString();
  let subtitleOutputs = 0;
  const sourceExtPattern = /\.(txt|text|srt|rtf|md|mdx|markdown|mdown|mkd|mkdn|csv|tsv|json|js|ts|htm|html|xhtml|webarchive|css|xml|log|pdf|docx|pages|numbers|key|epub|pptx|xlsx|bmp|jpe?g|png|webp|heic|heif|aac|aif|aiff|amr|caf|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i;
  ready.forEach((item) => {
    const name = item.name.replace(sourceExtPattern, "");
    const docMap = typeof restoreDocMapFromMarkdown === "function"
      ? restoreDocMapFromMarkdown(item.body, {
        label: name,
        scope: "documents",
        meta: { importedFileName: item.name },
        allowGeneric: /^DocMap\b/i.test(name) || /^DocMap\b/i.test(item.name),
      })
      : null;
    chatFiles.unshift({
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      type: "text",
      name,
      body: item.body,
      docMap,
      folderId: folder.id,
      createdAt: now,
      updatedAt: now,
      source: t("import_utility"),
      durable: true,
    });

    const subtitleTranslations = item.subtitleTranslations;
    if (subtitleTranslations?.enSrt && subtitleTranslations?.twSrt) {
      const sourceBaseName = sanitizeFilename(item.name.replace(/\.srt$/i, "") || name || "subtitle");
      addProjectCdTextItem(subtitleTranslations.enSrt, `${sourceBaseName}.en.srt`, {
        sourceKind: "subtitle-translation-en",
        metadata: {
          sourceName: item.name,
          subtitleLanguage: "en",
          blockCount: Number(subtitleTranslations.blockCount) || 0,
        },
      });
      addProjectCdTextItem(subtitleTranslations.twSrt, `${sourceBaseName}.tw.srt`, {
        sourceKind: "subtitle-translation-tw",
        metadata: {
          sourceName: item.name,
          subtitleLanguage: "zh-TW",
          blockCount: Number(subtitleTranslations.blockCount) || 0,
        },
      });
      subtitleOutputs += 2;
    }
  });

  importCandidates.splice(0, importCandidates.length);
  selectedImportFiles = [];
  updateFilePickerLabels();
  importStatusEl.textContent = t("imported_documents", ready.length);
  if (subtitleOutputs) {
    setStatus(`Imported ${ready.length} document(s). Subtitle Translator generated ${subtitleOutputs} Project CD item(s).`);
  }
  renderImportPreview();
  renderDocuments();
  saveDeskState();
  openWindow("documents");
}

function addProjectCdTextItem(text, title, options = {}) {
  if (!getActiveProject()) return null;
  const safeTitle = sanitizeFilename(String(title || "Untitled"));
  const existingIndex = projectCdItems.findIndex((item) => item.projectId === activeProjectId && item.title === safeTitle);
  const now = new Date().toISOString();
  const item = {
    id: existingIndex >= 0 ? projectCdItems[existingIndex].id : crypto.randomUUID(),
    projectId: activeProjectId,
    title: safeTitle,
    format: options.format || "text/plain",
    body: String(text || ""),
    sourceDocumentId: activeTextFileId || "",
    sourceKind: options.sourceKind || "subtitle-translation",
    claimCheckId: "",
    burnedAt: existingIndex >= 0 ? projectCdItems[existingIndex].burnedAt : now,
    updatedAt: now,
    languageMode: options.languageMode || "translation",
    metadata: {
      ...(options.metadata || {}),
      wordCount: countMarkdownWords(String(text || "")),
    },
  };
  if (existingIndex >= 0) projectCdItems.splice(existingIndex, 1);
  projectCdItems.unshift(item);
  selectedProjectCdItemId = item.id;
  selectedProjectCdItemIds.clear();
  selectedProjectCdItemIds.add(item.id);
  return item;
}

function formatProjectBackupMarkdown(project) {
  const projectFiles = chatFiles.filter((file) => file.projectId === project.id);
  const projectScraps = scraps.filter((scrap) => scrap.projectId === project.id);
  const projectRefs = projectReferences.filter((reference) => reference.projectId === project.id);
  const lines = [
    `# ${project.name}`,
    "",
    `Created: ${new Date(project.createdAt).toLocaleString()}`,
    `Modified: ${new Date(project.updatedAt).toLocaleString()}`,
    "",
    "## Summary",
    "",
    `- ${t("documents")}: ${projectFiles.length}`,
    `- ${t("scrapbook")}: ${projectScraps.length}`,
    `- ${t("references")}: ${projectRefs.length}`,
    "",
  ];

  lines.push("## Documents", "");
  if (projectFiles.length) {
    projectFiles.forEach((file) => {
      lines.push(`### ${file.name}`, "");
      if (file.type === "chat") {
        lines.push(formatChatFileMarkdown(file), "");
      } else {
        lines.push(file.body || "", "");
      }
    });
  } else {
    lines.push("_No documents._", "");
  }

  lines.push("## Scrapbook", "");
  if (projectScraps.length) {
    projectScraps.forEach((scrap) => {
      lines.push(`### ${scrap.title}`, "");
      if (scrap.tags?.length) lines.push(`Tags: ${scrap.tags.join(", ")}`, "");
      lines.push(scrap.body || "", "");
    });
  } else {
    lines.push("_No scraps._", "");
  }

  lines.push("## Saved References", "");
  if (projectRefs.length) {
    projectRefs.forEach((reference) => {
      lines.push(`### ${reference.name}`, "");
      lines.push(reference.body || (reference.chunks || []).map((chunk) => chunk.content).join("\n\n---\n\n") || "_Indexed reference only._", "");
    });
  } else {
    lines.push("_No project references._", "");
  }

  return lines.join("\n").trim();
}

function formatInfoItemMarkdown(item) {
  if (!item) return "";
  if (item.type === "chat") return formatChatFileMarkdown(item);
  if (item.type === "text") return [`# ${item.name}`, "", item.body || ""].join("\n");
  if (projects.includes(item)) {
    return formatProjectBackupMarkdown(item);
  }
  return [`# ${item.title || t("scrapbook")}`, "", item.body || ""].join("\n");
}
