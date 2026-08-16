// Feature module: teachtext-accessories.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function setTeachTextStatus(key) {
  teachTextStatusEl.dataset.statusKey = key;
  // Saving is the moment the writer commits work, so it is where the status
  // line can afford to say what the work amounts to. It reports one stored
  // fact — how many drafts this document has behind it — and never an opinion
  // of it. With no count in hand it says nothing extra rather than guess.
  const drafts = key === "saved" && typeof cachedRevisions === "function"
    ? cachedRevisions(activeProjectId, activeTextFileId).length
    : 0;
  teachTextStatusEl.textContent = drafts > 1 ? t("saved_drafts", drafts) : t(key);
  syncTeachTextLabelControl();
  syncTeachTextPreview();
  updateMenuState();
}

function syncTeachTextWindowTitle() {
  if (!teachTextTitleEl) return;
  const appTitle = t("teachtext");
  const documentTitle = typeof getTeachTextDocumentName === "function"
    ? getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || "" })
    : teachTextNameInput?.value?.trim() || "";
  teachTextTitleEl.dataset.i18n = "teachtext";
  teachTextTitleEl.textContent = appTitle;
  teachTextTitleEl.title = documentTitle && documentTitle !== appTitle
    ? `${appTitle} — ${documentTitle}`
    : appTitle;
}

function teachTextRoleLabel(role = teachTextDocumentRole) {
  return t(role === "manuscript" ? "document_role_manuscript" : "document_role_scratch_file");
}

function getActiveTeachTextDocumentTab() {
  return typeof getActiveDocumentTab === "function" ? getActiveDocumentTab("teachText") : null;
}

function isTeachTextManuscriptRole(role = teachTextDocumentRole) {
  return typeof documentRoleAllows === "function"
    ? documentRoleAllows("teachText", role, "writingFlow")
    : role === "manuscript";
}

function captureActiveTeachTextTabState() {
  const tab = getActiveTeachTextDocumentTab();
  if (!tab || !teachTextBodyInput) return;
  tab.title = getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || tab.title || t("untitled") });
  tab.role = teachTextDocumentRole || tab.role;
  tab.backing = tab.role === "manuscript"
    ? { type: "manuscript" }
    : { ...(tab.backing || {}), id: activeTextFileId || tab.backing?.id || "" };
  tab.state = {
    ...(tab.state || {}),
    activeTextFileId,
    documentRole: teachTextDocumentRole || "scratch_file",
    name: teachTextNameInput?.value?.trim() || tab.title,
    folder: teachTextFolderInput?.value?.trim() || preferredFolderName(),
    body: teachTextBodyInput.value || "",
    label: normalizeFileLabel(teachTextFileLabel),
    workflowState: normalizeTeachTextWorkflowState(teachTextWorkflowState),
    statusKey: teachTextStatusEl?.dataset.statusKey || "unsaved",
    selectionStart: teachTextBodyInput.selectionStart ?? 0,
    selectionEnd: teachTextBodyInput.selectionEnd ?? 0,
    scrollTop: teachTextBodyInput.scrollTop || 0,
  };
  tab.updatedAt = new Date().toISOString();
}

function renderTeachTextTabs() {
  if (!teachTextTabsEl || typeof getDocumentTabs !== "function") return;
  syncTeachTextWindowTitle();
  const tabs = getDocumentTabs("teachText")
    .filter((tab) => workspaceProfile !== workspaceProfileDesktop || tab.role === "scratch_file");
  const activeId = getActiveTeachTextDocumentTab()?.id;
  renderTdiTabStrip(teachTextTabsEl, tabs, {
    activeId,
    labelFor: (tab) => tab.title || teachTextRoleLabel(tab.role),
    compactLabelFor: (tab) => tab.title || teachTextRoleLabel(tab.role),
    sublabelFor: (tab) => teachTextRoleLabel(tab.role),
    dirtyFor: (tab) => ["modified", "unsaved"].includes(tab.state?.statusKey || ""),
    closableFor: () => tabs.length > 1,
    onOpen: (tab) => openTeachTextDocumentTab(tab.id, { ensureWindow: false }),
    onClose: (tab) => closeTeachTextDocumentTab(tab.id),
    onMove: (tabId, targetTabId) => {
      captureActiveTeachTextTabState();
      if (!moveDocumentTab("teachText", tabId, targetTabId)) return;
      renderTeachTextTabs();
      saveDeskState();
    },
  });
  setupTdiRailResize(teachTextTabsEl.closest(".tdi-shell"), { storageKey: "aiSystem6.tdiRail.teachText" });
}

function openDesktopTeachTextWindow() {
  if (!isTeachTextManuscriptRole()) {
    openWindow("teachText");
    teachTextBodyInput.focus();
    return getActiveTeachTextDocumentTab();
  }
  const scratchTab = typeof getDocumentTabs === "function"
    ? getDocumentTabs("teachText").find((tab) => tab.role === "scratch_file")
    : null;
  if (scratchTab) return openTeachTextDocumentTab(scratchTab.id);
  return newTextDocument();
}

function openTeachTextForWorkspace() {
  if (workspaceProfile === workspaceProfileDesktop) return openDesktopTeachTextWindow();
  openWindow("teachText");
  teachTextBodyInput.focus();
  return getActiveTeachTextDocumentTab();
}

function applyTeachTextRoleUi() {
  const teachTextWindow = getWindow("teachText");
  if (teachTextWindow) teachTextWindow.dataset.documentRole = teachTextDocumentRole;
  renderTeachTextTabs();
}

function ensureTeachTextManuscriptTab(project = getActiveProject()) {
  if (!project || typeof getDocumentTabs !== "function") return null;
  // getDocumentTabs() normalizes the project and creates its required
  // manuscript tab without changing the active tab. Calling upsert here used
  // to activate the manuscript before openTeachTextDocumentTab() captured the
  // currently displayed Source Notes state, corrupting the manuscript tab
  // into a second scratch-file tab on the mobile writing route.
  const existing = getDocumentTabs("teachText", project)
    .find((tab) => tab.role === "manuscript");
  if (existing || typeof upsertDocumentTab !== "function") return existing || null;
  return upsertDocumentTab("teachText", "manuscript", {
    title: t("document_role_manuscript"),
    backing: { type: "manuscript" },
  }, project);
}

function loadTeachTextTabState(tab) {
  if (!tab) return;
  const role = tab.role === "manuscript" ? "manuscript" : "scratch_file";
  const file = role === "scratch_file" && tab.backing?.id
    ? chatFiles.find((item) => item.id === tab.backing.id && item.type === "text" && isInActiveProject(item))
    : null;
  const state = tab.state || {};
  teachTextDocumentRole = role;
  activeTextFileId = file?.id || (role === "scratch_file" ? state.activeTextFileId || null : null);
  teachTextFileLabel = role === "manuscript"
    ? normalizeTeachTextWorkflowState(file?.label || state.label || teachTextFileLabel)
    : normalizeFileLabel(file?.label || state.label || "");
  setTeachTextWorkflowState(role === "manuscript" ? state.workflowState || teachTextWorkflowState || "draft" : state.workflowState || "");
  teachTextNameInput.value = String(file?.name || state.name || tab.title || t("untitled"));
  teachTextFolderInput.value = String(state.folder || preferredFolderName());
  teachTextBodyInput.value = typeof state.body === "string" ? state.body : (file?.body || "");
  syncTeachTextWindowTitle();
  resetTeachTextExportState();
  setTeachTextStatus(state.statusKey || (file ? "saved" : role === "manuscript" ? "modified" : "unsaved"));
  refreshTeachTextDocumentState();
  requestAnimationFrame(() => {
    const start = Math.min(Number(state.selectionStart) || 0, teachTextBodyInput.value.length);
    const end = Math.min(Number(state.selectionEnd) || start, teachTextBodyInput.value.length);
    teachTextBodyInput.setSelectionRange(start, end);
    teachTextBodyInput.scrollTop = Number(state.scrollTop) || 0;
  });
}

function openTeachTextStateInTab({
  title = t("untitled"),
  role = "scratch_file",
  backing = { type: "scratch" },
  state = {},
  forceNew = false,
  helpDocument = false,
  preview = false,
  focus = true,
} = {}) {
  if (typeof captureActiveTeachTextTabState === "function") captureActiveTeachTextTabState();
  const tab = typeof upsertDocumentTab === "function"
    ? upsertDocumentTab("teachText", role === "manuscript" ? "manuscript" : "scratch_file", {
      title,
      backing,
      state: {
        name: title,
        folder: preferredFolderName(),
        body: "",
        statusKey: "unsaved",
        ...state,
      },
      forceNew,
    })
    : null;
  const win = getWindow("teachText");
  win?.classList.toggle("is-help-document", !!helpDocument);
  if (tab) loadTeachTextTabState(tab);
  else {
    teachTextDocumentRole = role === "manuscript" ? "manuscript" : "scratch_file";
    activeTextFileId = state.activeTextFileId || null;
    teachTextFileLabel = normalizeFileLabel(state.label || "");
    setTeachTextWorkflowState(state.workflowState || "");
    syncTeachTextWindowTitle();
    teachTextNameInput.value = state.name || title;
    teachTextFolderInput.value = state.folder || preferredFolderName();
    teachTextBodyInput.value = state.body || "";
    setTeachTextStatus(state.statusKey || "unsaved");
    refreshTeachTextDocumentState();
  }
  resetTeachTextExportState();
  renderFolderSuggestions();
  openWindow("teachText");
  scheduleTeachTextTabSave();
  if (typeof renderTeachTextTabs === "function") renderTeachTextTabs();
  if (preview && typeof showTeachTextPreview === "function") {
    showTeachTextPreview({ announce: false, focus, preserveScroll: false });
  } else if (focus) {
    teachTextBodyInput.focus();
  }
  return tab;
}

function openTeachTextDocumentTab(tabId, { focus = true, ensureWindow = true } = {}) {
  if (typeof setActiveDocumentTab !== "function") return false;
  captureActiveTeachTextTabState();
  const tab = setActiveDocumentTab("teachText", tabId);
  if (!tab) return false;
  loadTeachTextTabState(tab);
  saveDeskState();
  const win = getWindow("teachText");
  if (ensureWindow || win?.classList.contains("is-hidden")) openWindow("teachText");
  if (focus) teachTextBodyInput.focus();
  return true;
}

async function closeTeachTextDocumentTab(tabId) {
  const project = getActiveProject();
  if (!project) return false;
  captureActiveTeachTextTabState();
  const tabs = getDocumentTabs("teachText", project);
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab || tabs.length <= 1) return false;
  if (tab.state?.statusKey === "modified") {
    const result = await showSystemModal(t("unsaved_changes", tab.title || t("untitled")), "save");
    if (result === "cancel") return false;
    if (result === "yes") {
      openTeachTextDocumentTab(tab.id, { focus: false });
      const saved = await saveTextDocument({ promptForFolder: !tab.backing?.id });
      if (!saved) return false;
    }
  }
  const result = removeDocumentTab("teachText", tabId, project);
  if (result?.wasActive) {
    const manuscript = getDocumentTabs("teachText", project).find((item) => item.role === "manuscript");
    if (manuscript) openTeachTextDocumentTab(manuscript.id, { focus: false });
  }
  saveDeskState();
  renderTeachTextTabs();
  return true;
}

function activateTeachTextManuscriptTab(options = {}) {
  const tab = ensureTeachTextManuscriptTab();
  return tab ? openTeachTextDocumentTab(tab.id, options) : false;
}

function openTeachTextManuscriptWindow(options = {}) {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return false;
  }
  if (typeof savePipelineData === "function") savePipelineData();
  if (typeof syncLinkedTeachTextFromProject === "function") {
    syncLinkedTeachTextFromProject(getActiveProject());
  }
  const opened = activateTeachTextManuscriptTab({ focus: options.focus !== false });
  if (!opened) return false;
  openWindow("teachText");
  focusWindow(getWindow("teachText"));
  if (typeof previewLinkedTeachTextManuscript === "function") {
    previewLinkedTeachTextManuscript({ focus: options.focus !== false });
  }
  return true;
}

function updateTeachTextStructureClasses() {
  const body = teachTextBodyInput.value;
  const lines = body.split("\n");
  const hasHeaders = lines.some((line) => line.startsWith("#"));
  const hasLists = lines.some((line) => line.startsWith("- ") || /^\d+\./.test(line));
  const hasQuotes = lines.some((line) => line.startsWith("> "));
  const hasCode = body.includes("```");

  teachTextBodyInput.classList.toggle("has-headers", hasHeaders);
  teachTextBodyInput.classList.toggle("has-lists", hasLists);
  teachTextBodyInput.classList.toggle("has-quotes", hasQuotes);
  teachTextBodyInput.classList.toggle("has-code", hasCode);
}

function cloneTeachTextImageAttachments(attachments = []) {
  return Array.isArray(attachments)
    ? attachments
        .filter((item) => item && item.id)
        .slice(0, teachTextImageAttachmentLimit)
        .map((item) => ({ ...item }))
    : [];
}

function getTeachTextImageAttachments() {
  const project = getActiveProject();
  if (!project) return [];
  project.imageAttachments = cloneTeachTextImageAttachments(project.imageAttachments);
  return project.imageAttachments;
}

function getTeachTextImageAlbumProjectLabel() {
  const project = getActiveProject();
  return project ? projectDisplayName(project) : t("no_project_mounted");
}

function imageAttachmentAltText(attachment) {
  return String(attachment?.alt || attachment?.name || t("image_attachment"))
    .replace(/[\[\]\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || t("image_attachment");
}

function imageAttachmentMarkdown(attachment, options = {}) {
  const src = options.original
    ? attachment.originalDataUrl || attachment.previewDataUrl || attachment.dataUrl
    : options.preview
      ? attachment.previewDataUrl || attachment.dataUrl || attachment.originalDataUrl
      : `aisystem6-image:${attachment.id}`;
  return `![${imageAttachmentAltText(attachment)}](${src})`;
}

function insertMarkdownAtTeachTextCursor(markdown) {
  const content = String(markdown || "");
  if (!content) return;

  const start = teachTextBodyInput.selectionStart ?? teachTextBodyInput.value.length;
  const end = teachTextBodyInput.selectionEnd ?? start;
  const before = teachTextBodyInput.value.slice(0, start);
  const after = teachTextBodyInput.value.slice(end);
  const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";

  teachTextBodyInput.focus();
  teachTextBodyInput.setRangeText(`${prefix}${content}${suffix}`, start, end, "end");
  markTeachTextModified();
  syncTeachTextPreview({ force: false });
}

function getTeachTextVisionModelRequestName() {
  if (typeof activeChatModelIdentifier !== "undefined" && activeChatModelIdentifier) {
    return activeChatModelIdentifier;
  }
  if (typeof modelInput !== "undefined" && modelInput?.value?.trim()) {
    return modelInput.value.trim();
  }
  return "";
}

function imageAttachmentVisionDataUrl(attachment) {
  return attachment?.previewDataUrl || attachment?.dataUrl || attachment?.originalDataUrl || "";
}

function imageAttachmentVisionMarkdown(attachment, mode, text) {
  const name = attachment?.name || t("image_attachment");
  const title = mode === "ocr"
    ? t("image_vision_ocr_title", name)
    : t("image_vision_notes_title", name);
  return `### ${title}\n\n${String(text || "").trim()}`;
}

async function analyzeTeachTextImageAttachment(attachment, mode = "writing-context") {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const dataUrl = imageAttachmentVisionDataUrl(attachment);
  const name = attachment?.name || t("image_attachment");
  if (!dataUrl) {
    setStatus(t("image_vision_failed", t("image_vision_no_preview")));
    return;
  }

  setStatus(t(mode === "ocr" ? "image_vision_ocr_reading" : "image_vision_reading", name));
  try {
    const result = await sendLocalModelTask({
      payload: {
        model: getTeachTextVisionModelRequestName(),
        messages: window.AISystem6ModelTaskRuntime.buildVisionMessages({ mode, name, dataUrl }),
        temperature: 0.2,
        max_tokens: mode === "ocr" ? 1400 : 900,
        stream: false,
        ai_system6_task_kind: mode === "ocr" ? "extract-vision-ocr" : "extract-vision-writing-context",
      },
      signal: typeof getLongTaskSignal === "function" ? getLongTaskSignal() : null,
      taskKind: mode === "ocr" ? "extract-vision-ocr" : "extract-vision-writing-context",
      streamPreference: "json",
    });
    const text = String(result.text || "").trim();
    if (!text) throw new Error(t("image_vision_empty"));

    const attachments = getTeachTextImageAttachments();
    const storedAttachment = attachments.find((item) => item.id === attachment.id) || attachment;
    storedAttachment.visionNotes = text;
    storedAttachment.visionMode = mode;
    storedAttachment.visionModel = getTeachTextVisionModelRequestName();
    storedAttachment.visionUpdatedAt = new Date().toISOString();
    project.imageAttachments = attachments;
    project.updatedAt = new Date().toISOString();
    saveDeskState();

    insertMarkdownAtTeachTextCursor(imageAttachmentVisionMarkdown(storedAttachment, mode, text));
    renderTeachTextImageAttachments();
    setStatus(t(mode === "ocr" ? "image_vision_ocr_inserted" : "image_vision_inserted", name));
  } catch (error) {
    if (typeof isAbortError === "function" && isAbortError(error)) return;
    setStatus(t("image_vision_failed", error?.message || t("connection_error")));
  }
}

function renderTeachTextImageAttachments() {
  if (!teachTextAttachmentsListEl || !teachTextAttachmentsCountEl) return;

  const sourceAttachments = getTeachTextImageAttachments();
  const mode = normalizeFinderViewMode(windowViewModes.imageManager || "icon");
  windowViewModes.imageManager = mode;
  const attachments = sortFinderItemsForView(sourceAttachments.map((attachment) => ({
    ...attachment,
    sizeValue: Number(attachment.size || attachment.previewSize || 0),
    modifiedAt: attachment.createdAt || "",
    kind: attachment.type || t("image_attachment"),
  })), mode);
  teachTextAttachmentsCountEl.textContent = `${sourceAttachments.length} / ${teachTextImageAttachmentLimit}`;
  if (teachTextAttachmentDocumentEl) {
    teachTextAttachmentDocumentEl.textContent = getTeachTextImageAlbumProjectLabel();
  }
  updateFinderViewButtons(getWindow("imageManager"), mode);
  teachTextAttachmentsListEl.classList.toggle("is-list-view", isFinderListMode(mode));
  teachTextAttachmentsListEl.classList.toggle("is-grid-view", !isFinderListMode(mode));
  teachTextAttachmentsListEl.classList.toggle("is-small-icons", mode === "small-icon");
  teachTextAttachmentsListEl.replaceChildren();

  if (!sourceAttachments.length) {
    const empty = document.createElement("div");
    empty.className = "teachtext-attachments-empty";
    empty.textContent = t("image_attachments_empty");
    teachTextAttachmentsListEl.append(empty);
    return;
  }

  if (isFinderListMode(mode)) {
    const header = document.createElement("div");
    header.className = "image-manager-list-header";
    header.innerHTML = `
      <span>${escapeHtml(t("file_name"))}</span>
      <span>${escapeHtml(t("kind"))}</span>
      <span>${escapeHtml(t("size"))}</span>
      <span>${escapeHtml(t("modified"))}</span>
    `;
    teachTextAttachmentsListEl.append(header);
  }

  attachments.forEach((attachment) => {
    const item = document.createElement("article");
    item.className = "image-manager-item";

    const image = document.createElement("img");
    image.src = attachment.previewDataUrl || attachment.dataUrl || attachment.originalDataUrl;
    image.alt = imageAttachmentAltText(attachment);
    image.loading = "lazy";
    image.decoding = "async";

    const meta = document.createElement("div");
    meta.className = "image-manager-meta";

    const name = document.createElement("b");
    name.textContent = attachment.name || t("image_attachment");

    const details = document.createElement("small");
    const size = Number(attachment.size || 0);
    const previewSize = Number(attachment.previewSize || 0);
    details.textContent = size || previewSize
      ? t("image_attachment_sizes", Math.ceil(previewSize / 1024), Math.ceil(size / 1024))
      : t("image_attachment");
    const dimensions = attachment.width && attachment.height ? `${attachment.width} x ${attachment.height}` : t("image_attachment");
    const modified = attachment.createdAt ? new Date(attachment.createdAt).toLocaleDateString() : "--";

    const listKind = document.createElement("span");
    listKind.className = "image-manager-list-kind";
    listKind.textContent = attachment.type || t("image_attachment");

    const listSize = document.createElement("span");
    listSize.className = "image-manager-list-size";
    listSize.textContent = size || previewSize
      ? `${Math.ceil((size || previewSize) / 1024)} KB`
      : "--";

    const listModified = document.createElement("span");
    listModified.className = "image-manager-list-modified";
    listModified.textContent = modified;

    const actions = document.createElement("div");
    actions.className = "image-manager-actions";

    const insertButton = document.createElement("button");
    insertButton.className = "btn mini-btn";
    insertButton.type = "button";
    insertButton.textContent = t("insert");
    insertButton.addEventListener("click", () => {
      insertMarkdownAtTeachTextCursor(imageAttachmentMarkdown(attachment));
      setStatus(t("image_inserted", attachment.name || t("image_attachment")));
    });

    const readButton = document.createElement("button");
    readButton.className = "btn mini-btn";
    readButton.type = "button";
    readButton.textContent = t("image_read");
    readButton.addEventListener("click", () => analyzeTeachTextImageAttachment(attachment, "writing-context"));

    const ocrButton = document.createElement("button");
    ocrButton.className = "btn mini-btn";
    ocrButton.type = "button";
    ocrButton.textContent = t("image_ocr");
    ocrButton.addEventListener("click", () => analyzeTeachTextImageAttachment(attachment, "ocr"));

    const removeButton = document.createElement("button");
    removeButton.className = "btn mini-btn danger";
    removeButton.type = "button";
    removeButton.textContent = t("remove");
    removeButton.addEventListener("click", () => removeTeachTextImageAttachment(attachment.id));

    actions.append(insertButton, readButton, ocrButton, removeButton);
    meta.append(name, details, actions);
    item.append(image, meta, listKind, listSize, listModified);
    item.title = dimensions;
    teachTextAttachmentsListEl.append(item);
  });
}

function readImageAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = dataUrl;
  });
}

async function compressImageAttachmentDataUrl(dataUrl, maxEdge = 960) {
  const image = await loadImageFromDataUrl(dataUrl);
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const previewWidth = Math.max(1, Math.round(width * scale));
  const previewHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, previewWidth, previewHeight);
  context.drawImage(image, 0, 0, previewWidth, previewHeight);
  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.72);
  return {
    previewDataUrl,
    width,
    height,
    previewWidth,
    previewHeight,
    previewSize: Math.ceil((previewDataUrl.length * 3) / 4),
  };
}

async function addTeachTextImageAttachments(files) {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const incoming = [...(files || [])].filter((file) => /^image\//i.test(file.type || "") || /\.(bmp|jpe?g|png|webp|heic|heif)$/i.test(file.name || ""));
  if (!incoming.length) return;

  const attachments = getTeachTextImageAttachments();
  const openSlots = Math.max(0, teachTextImageAttachmentLimit - attachments.length);
  if (!openSlots) {
    setStatus(t("image_attachment_limit", teachTextImageAttachmentLimit));
    return;
  }

  const now = new Date().toISOString();
  const selected = incoming.slice(0, openSlots);
  for (const file of selected) {
    const originalDataUrl = await readImageAttachmentFile(file);
    let compressed;
    try {
      compressed = await compressImageAttachmentDataUrl(originalDataUrl);
    } catch {
      compressed = {
        previewDataUrl: originalDataUrl,
        width: 0,
        height: 0,
        previewWidth: 0,
        previewHeight: 0,
        previewSize: Math.ceil((originalDataUrl.length * 3) / 4),
      };
    }
    attachments.unshift({
      id: crypto.randomUUID(),
      name: file.name || t("image_attachment"),
      alt: (file.name || t("image_attachment")).replace(/\.[^.]+$/, ""),
      type: file.type || "image/*",
      size: file.size || 0,
      originalDataUrl,
      previewDataUrl: compressed.previewDataUrl,
      width: compressed.width,
      height: compressed.height,
      previewWidth: compressed.previewWidth,
      previewHeight: compressed.previewHeight,
      previewSize: compressed.previewSize,
      createdAt: now,
    });
  }

  project.imageAttachments = attachments;
  project.updatedAt = new Date().toISOString();
  if (incoming.length > selected.length) setStatus(t("image_attachment_limit", teachTextImageAttachmentLimit));
  else setStatus(t("image_attachments_added", selected.length));
  renderTeachTextImageAttachments();
  renderProjectDisks();
  saveDeskState();
}

function removeTeachTextImageAttachment(id) {
  const project = getActiveProject();
  if (!project) return;

  const attachments = getTeachTextImageAttachments();
  const index = attachments.findIndex((item) => item.id === id);
  if (index < 0) return;
  attachments.splice(index, 1);
  project.imageAttachments = attachments;
  project.updatedAt = new Date().toISOString();
  renderTeachTextImageAttachments();
  syncTeachTextPreview({ force: false });
  renderProjectDisks();
  saveDeskState();
  setStatus(t("image_attachment_removed"));
}

function resolveTeachTextImageMarkdown(markdown, options = {}) {
  const attachments = getTeachTextImageAttachments();
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  return String(markdown || "").replace(/!\[([^\]]*)\]\(aisystem6-image:([^)]+)\)/g, (match, alt, id) => {
    const attachment = byId.get(id);
    if (!attachment) return match;
    const src = options.original
      ? attachment.originalDataUrl || attachment.previewDataUrl || attachment.dataUrl
      : attachment.previewDataUrl || attachment.dataUrl || attachment.originalDataUrl;
    return `![${alt || imageAttachmentAltText(attachment)}](${src})`;
  });
}

function countTeachTextSourceBlocks(body) {
  const text = String(body || "");
  return text.match(/<!--\s*AI System 6 insertion[\s\S]*?-->/g)?.length || 0;
}

function teachTextSourceStateLabel(body) {
  const statusKey = teachTextStatusEl?.dataset.statusKey || "";
  const text = String(body || "").trim();
  const sourceCount = countTeachTextSourceBlocks(body);
  if (statusKey === "viewing_mounted_file") return t("teachtext_source_mounted");
  if (statusKey === "viewing_reference") return t("teachtext_source_reference");
  if (statusKey === "viewing_help") return t("teachtext_source_help");
  if (teachTextPipelineLabel() && getActiveProject()?.manuscriptLinkedToOutline && text) return t("teachtext_source_project_manuscript");
  if (teachTextReviewLabel() && text) return t("label_final");
  if (activeTextFileId) return t("teachtext_source_saved_document");
  if (sourceCount) return t("teachtext_source_blocks", sourceCount);
  return text ? t("teachtext_source_scratch") : t("teachtext_source_empty");
}

function formatTeachTextExportTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function markTeachTextExported(kind) {
  teachTextLastExportKind = kind;
  teachTextLastExportAt = new Date().toISOString();
  teachTextLastExportSnapshot = teachTextBodyInput.value;
  updateTeachTextDeskState();
}

function resetTeachTextExportState() {
  teachTextLastExportKind = "";
  teachTextLastExportAt = "";
  teachTextLastExportSnapshot = "";
  updateTeachTextDeskState();
}

function updateTeachTextDeskState() {
  const body = teachTextBodyInput.value || "";

  if (teachTextModeStateEl) {
    const isPreview = teachTextPreviewEl && !teachTextPreviewEl.classList.contains("is-hidden");
    const readonlyManuscript = teachTextBodyInput.readOnly
      && typeof isTeachTextManuscriptRole === "function" && isTeachTextManuscriptRole();
    teachTextModeStateEl.textContent = readonlyManuscript
      ? t("teachtext_mode_readonly_draft")
      : t(isPreview ? "teachtext_mode_preview" : "teachtext_mode_edit");
  }

  if (teachTextSourceCountEl) {
    teachTextSourceCountEl.textContent = teachTextSourceStateLabel(body);
  }

  if (teachTextSelectionStateEl) {
    const selection = getTeachTextSelectionInfo();
    teachTextSelectionStateEl.textContent = selection?.text ? t("teachtext_selection_count", selection.text.length) : t("teachtext_selection_empty");
  }

  if (teachTextExportStateEl) {
    if (!teachTextLastExportAt) {
      teachTextExportStateEl.textContent = t("teachtext_export_empty");
    } else {
      const kind = t(teachTextLastExportKind === "bilingual" ? "teachtext_export_bilingual" : "teachtext_export_markdown");
      const time = formatTeachTextExportTime(teachTextLastExportAt);
      const isCurrent = teachTextLastExportSnapshot === body;
      teachTextExportStateEl.textContent = isCurrent
        ? t("teachtext_export_current", kind, time)
        : t("teachtext_export_stale", kind, time);
    }
  }
  updateDocMapEntryButtons();
}

function refreshTeachTextDocumentState() {
  if (typeof applyTeachTextRoleUi === "function") applyTeachTextRoleUi();
  updateTeachTextBoundaries();
  updateTeachTextTranslateButton();
  updateTeachTextBilingualExportButton();
  updateTeachTextStructureClasses();
  renderTeachTextImageAttachments();
  updateTeachTextDeskState();
  syncTeachTextLabelControl();
  syncTeachTextNameDisplay();
}

function extractTeachTextMarkdownTitle(markdown) {
  return markdownDocumentTitle(markdown);
}

function getTeachTextDocumentName({ fallback = "" } = {}) {
  const explicitName = teachTextNameInput?.value?.trim() || "";
  if (/\.slides\.md$/i.test(explicitName)) return explicitName;
  const markdownTitle = extractTeachTextMarkdownTitle(teachTextBodyInput?.value || "");
  if (typeof teachTextPipelineLabel === "function" && teachTextPipelineLabel()) {
    return markdownTitle
      || fallback.trim()
      || explicitName
      || t("untitled");
  }
  return markdownTitle
    || fallback.trim()
    || explicitName
    || t("untitled");
}

function scheduleTeachTextTabSave() {
  if (typeof captureActiveTeachTextTabState === "function") captureActiveTeachTextTabState();
  clearTimeout(teachTextTabSaveTimer);
  teachTextTabSaveTimer = setTimeout(() => {
    saveDeskState();
  }, 250);
}

function syncTeachTextNameDisplay() {
  syncTeachTextWindowTitle();
  if (typeof updateQuestionSheetManuscriptTitle === "function") updateQuestionSheetManuscriptTitle();
  if (typeof updateReviewDeskStatusTitle === "function") updateReviewDeskStatusTitle();
}

function markTeachTextModified() {
  setTeachTextStatus("modified");
  refreshTeachTextDocumentState();
  scheduleTeachTextTabSave();
}

function syncTeachTextPreview({ force = false } = {}) {
  if (!teachTextPreviewEl || (!force && teachTextPreviewEl.classList.contains("is-hidden"))) return;
  const previousScrollTop = teachTextPreviewEl.scrollTop;
  teachTextPreviewEl.innerHTML = markdownToSystemHtml(resolveTeachTextImageMarkdown(teachTextBodyInput.value, { preview: true }));
  teachTextPreviewEl.scrollTop = previousScrollTop;
}

function teachTextParagraphBlocks(body) {
  const normalized = String(body || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const blankSeparated = normalized.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
  if (blankSeparated.length > 1) return blankSeparated;
  return normalized.split("\n").map((part) => part.trim()).filter(Boolean);
}

function countTextWords(text) {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
  const latin = text
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ")
    .match(/[\p{L}\p{N}]+/gu)?.length || 0;
  return cjk + latin;
}

function teachTextHasChartableMarkdownTable(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const isTableRow = (line) => /\|/.test(line || "");
  const isDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line || "");
  return lines.some((line, index) => (
    index > 0
    && index < lines.length - 1
    && isDivider(line)
    && isTableRow(lines[index - 1])
    && isTableRow(lines[index + 1])
  ));
}

function syncTeachTextChartAction() {
  if (!teachTextSeeAsChartButton) return;
  const visible = teachTextHasChartableMarkdownTable(teachTextBodyInput?.value || "");
  teachTextSeeAsChartButton.hidden = !visible;
  teachTextSeeAsChartButton.classList.toggle("is-hidden", !visible);
}

function updateTeachTextBoundaries() {
  syncTeachTextChartAction();
  if (!teachTextBoundaryEl) return;
  const body = teachTextBodyInput.value.trim();
  if (!body) {
    teachTextBoundaryEl.textContent = t("draft_boundary", 0, 0);
    teachTextBoundaryEl.classList.remove("has-warning");
    return;
  }

  const paragraphs = teachTextParagraphBlocks(body);
  const words = countTextWords(body);
  const paragraphCount = paragraphs.length;
  const hasLongParagraph = paragraphs.some((part) => countTextWords(part) > 800);

  teachTextBoundaryEl.textContent = hasLongParagraph
    ? t("draft_boundary_long", words, paragraphCount)
    : t("draft_boundary", words, paragraphCount);
  teachTextBoundaryEl.classList.toggle("has-warning", hasLongParagraph);
}

function dictationDestinationLabel(dest) {
  const labels = {
    teachtext: t("teachtext"),
    assistant: t("assistant"),
    questionSheet: t("question_sheet"),
    scrapbook: t("scrapbook"),
    notepad: t("note_pad"),
  };
  return labels[dest] || t("assistant");
}

// ---- Note Pad slips ---------------------------------------------------------
//
// Being interrupted is normal here, and losing a sentence is the harm this desk
// exists to prevent. So a Note Pad page is a slip: the words, and where the
// writer was when the thought arrived. One key holds a thought from anywhere;
// the slip's own default button puts the writer back on the same sentence.
//
// Older desks saved plain strings, so the shape migrates on the way in. Nothing
// is ever dropped to make room — a page that rolls off is a lost thought.
function normalizeNotePadOrigin(from) {
  if (!from?.window) return null;
  return {
    window: String(from.window),
    title: String(from.title || ""),
    caret: Number.isFinite(from.caret) ? from.caret : null,
    at: String(from.at || ""),
  };
}

function normalizeNotePadPages(pages) {
  const normalized = Array.isArray(pages)
    ? pages.map((page) => (typeof page === "string"
      ? { text: page, from: null }
      : { text: String(page?.text ?? ""), from: normalizeNotePadOrigin(page?.from) }))
    : [];
  return normalized.length ? normalized : [{ text: "", from: null }];
}

function currentNotePadSlip() {
  notePadPages = normalizeNotePadPages(notePadPages);
  notePadPageIndex = Math.min(Math.max(0, notePadPageIndex), notePadPages.length - 1);
  return notePadPages[notePadPageIndex];
}

// Every part except the four long-standing handles is found from the window
// itself, so a new control cannot take the boot down by drifting out of one of
// the three places a DOM handle must be declared.
let notePadParts = null;

function notePadFields() {
  if (notePadParts?.origin?.isConnected) return notePadParts;
  const root = document.querySelector('[data-window="notePad"]');
  if (!root) return null;
  notePadParts = {
    origin: root.querySelector("#note-pad-origin"),
    originLabel: root.querySelector("#note-pad-origin-label"),
    originTime: root.querySelector("#note-pad-origin-time"),
    destination: root.querySelector("#note-pad-destination"),
    send: root.querySelector("#note-pad-send"),
    back: root.querySelector("#note-pad-back"),
  };
  return notePadParts.origin ? notePadParts : null;
}

const notePadDestinations = ["teachtext", "scrapbook", "assistant"];

function notePadDestinationLabel(dest = notePadDestination) {
  const labels = {
    teachtext: t("send_to_teachtext"),
    scrapbook: t("send_to_scrapbook"),
    assistant: t("send_to_assistant"),
  };
  return labels[dest] || labels.teachtext;
}

function cycleNotePadDestination() {
  const next = (notePadDestinations.indexOf(notePadDestination) + 1) % notePadDestinations.length;
  notePadDestination = notePadDestinations[next];
  renderNotePadPage();
  saveDeskState();
}

function syncCurrentNotePadPage() {
  currentNotePadSlip().text = notePadTextInput.value;
}

function formatNotePadTime(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

function renderNotePadPage() {
  const slip = currentNotePadSlip();
  notePadTextInput.value = slip.text;
  notePadPageLabelEl.textContent = t("note_pad_slip", notePadPageIndex + 1, notePadPages.length);
  notePadPrevButton.disabled = notePadPageIndex === 0;
  notePadNextButton.disabled = false;

  const parts = notePadFields();
  if (!parts) return;
  parts.destination.textContent = notePadDestinationLabel();
  // The way back is the slip's own verb, and it is the default when it exists.
  // With nowhere to go back to, sending is the only thing this window does.
  const from = slip.from;
  parts.back.hidden = !from;
  parts.back.textContent = from ? t("note_pad_back_to", from.title || from.window) : t("back");
  parts.back.classList.toggle("default", !!from);
  parts.send.classList.toggle("default", !from);
  parts.origin.hidden = !from;
  if (from) {
    parts.originLabel.textContent = t("note_pad_from", from.title || from.window);
    parts.originTime.textContent = formatNotePadTime(from.at);
  }
}

function goToNotePadPage(index) {
  syncCurrentNotePadPage();
  notePadPageIndex = Math.min(Math.max(0, index), notePadPages.length - 1);
  renderNotePadPage();
  saveDeskState();
}

function addNotePadPage(from = null) {
  syncCurrentNotePadPage();
  notePadPages.splice(notePadPageIndex + 1, 0, { text: "", from: normalizeNotePadOrigin(from) });
  notePadPageIndex += 1;
  renderNotePadPage();
  notePadTextInput.focus();
  saveDeskState();
}

function goToNextNotePadPage() {
  syncCurrentNotePadPage();
  if (notePadPageIndex >= notePadPages.length - 1) {
    addNotePadPage();
    return;
  }
  goToNotePadPage(notePadPageIndex + 1);
}

// Where the writer is, as the system sees it: the front window and the caret
// inside it. This is read before anything moves, because once the pad opens the
// active element is the pad's own field.
function currentWritingPosition() {
  const field = document.activeElement;
  const win = field?.closest?.(".window")
    || document.querySelector(".window.is-active:not(.is-hidden):not(.is-collapsed)");
  const name = win?.dataset.window;
  if (!name || name === "notePad") return null;
  const inField = !!field
    && win.contains(field)
    && (field.tagName === "TEXTAREA" || field.tagName === "INPUT" || field.isContentEditable);
  return {
    window: name,
    title: win.querySelector(".title-bar h2")?.textContent?.trim() || name,
    caret: inField && Number.isFinite(field.selectionStart) ? field.selectionStart : null,
    at: new Date().toISOString(),
  };
}

// One key from anywhere. The thought lands on a slip that remembers the window
// and the caret it came from, so the interruption costs the sentence nothing.
async function holdThatThought() {
  const from = currentWritingPosition();
  await openWindow("notePad");
  // Take what the field is holding before deciding whether this slip is spare.
  // Waiting for the input listener would let a keystroke that has not been
  // synced yet decide that a written slip is empty, and overwrite its origin.
  syncCurrentNotePadPage();
  const slip = currentNotePadSlip();
  // An untouched empty slip is reused rather than stacked on, so pressing the
  // key twice does not leave a trail of blank pages.
  if (slip.text.trim()) {
    addNotePadPage(from);
  } else {
    slip.from = normalizeNotePadOrigin(from);
    renderNotePadPage();
    saveDeskState();
  }
  notePadTextInput.focus();
  setStatus(from ? t("note_pad_held_from", from.title) : t("note_pad_held"));
}

// The way back: the window opens and the caret returns to the character the
// writer left. A window that no longer holds that field still opens — being
// back in the right room is most of the point.
async function returnToNotePadOrigin() {
  const from = currentNotePadSlip().from;
  if (!from) return;
  await openWindow(from.window);
  const field = getWindow(from.window)?.querySelector("textarea, [contenteditable='true']");
  if (!field) return;
  field.focus();
  if (Number.isFinite(from.caret) && typeof field.setSelectionRange === "function") {
    const caret = Math.min(from.caret, field.value.length);
    field.setSelectionRange(caret, caret);
  }
}

function appendToNotePad(text, from = null) {
  syncCurrentNotePadPage();
  const slip = currentNotePadSlip();
  slip.text += `${slip.text ? "\n\n" : ""}${text}`;
  if (from && !slip.from) slip.from = normalizeNotePadOrigin(from);
  renderNotePadPage();
  openWindow("notePad");
  saveDeskState();
}

function sendNotePadPage(dest = notePadDestination) {
  syncCurrentNotePadPage();
  const text = notePadTextInput.value.trim();
  if (!text) {
    setStatus(t("note_pad_empty_send"));
    playSystemSound("alert");
    return;
  }

  const labels = {
    teachtext: "TeachText",
    scrapbook: t("scrapbook"),
    assistant: t("assistant"),
  };
  sendTextToDestination(text, dest);
  setStatus(t("note_sent", labels[dest] || dest));
  playSystemSound("save");
}

function renderClipboard() {
  clipboardTextInput.value = clipboardText;
  clipboardMetaEl.textContent = clipboardText
    ? t("clipboard_meta", clipboardText.length, clipboardSource)
    : t("clipboard_empty");
  clipboardInsertButton.disabled = !clipboardText;
  clipboardClearButton.disabled = !clipboardText;
  // Insert used to be the one verb on this desk that never said where it put
  // things. The right status slot answers that before it is pressed.
  const destination = document.querySelector("#clipboard-destination");
  if (destination) destination.textContent = t("insert_into_teachtext");
  renderClipboardTranslation();
  updateDocMapEntryButtons();
}

function renderClipboardTranslation() {
  const targetLanguage = clipboardText ? getTranslationTargetForUi(clipboardText) : null;
  const hasCurrentTranslation = clipboardTranslationText
    && clipboardTranslationSourceText === clipboardText
    && clipboardTranslationLanguage === targetLanguage;
  const shouldShow = !!targetLanguage || !!hasCurrentTranslation;

  if (clipboardTranslationPanel) {
    clipboardTranslationPanel.classList.toggle("is-hidden", !shouldShow);
  }
  if (clipboardTranslateButton) {
    clipboardTranslateButton.hidden = !targetLanguage;
    clipboardTranslateButton.disabled = !targetLanguage;
  }
  if (clipboardTranslationTextInput) {
    clipboardTranslationTextInput.value = hasCurrentTranslation
      ? `${formatTranslationMeta(clipboardTranslationLanguage, clipboardTranslationCreatedAt, t("clipboard"), clipboardTranslationModel)}\n\n${clipboardTranslationText}`
      : "";
  }

  const canSend = !!hasCurrentTranslation;
  [
    clipboardTranslationTeachTextButton,
    clipboardTranslationScrapbookButton,
    clipboardTranslationAssistantButton,
  ].forEach((button) => {
    if (button) button.disabled = !canSend;
  });
}

function setClipboard(text, source = "") {
  const value = String(text || "");
  if (!value) return;
  clipboardText = value;
  clipboardSource = source;
  clipboardUpdatedAt = new Date().toISOString();
  clipboardTranslationText = "";
  clipboardTranslationSourceText = "";
  clipboardTranslationLanguage = "";
  clipboardTranslationCreatedAt = "";
  clipboardTranslationModel = "";
  renderClipboard();
  saveDeskState();
}

function clearClipboardWindow() {
  clipboardText = "";
  clipboardSource = "";
  clipboardUpdatedAt = "";
  clipboardTranslationText = "";
  clipboardTranslationSourceText = "";
  clipboardTranslationLanguage = "";
  clipboardTranslationCreatedAt = "";
  clipboardTranslationModel = "";
  renderClipboard();
  saveDeskState();
  setStatus(t("clipboard_cleared"));
}

async function translateClipboardText() {
  const text = clipboardText.trim();
  const targetLanguage = text ? getTranslationTargetForUi(text) : null;
  if (!targetLanguage) {
    renderClipboardTranslation();
    setStatus(t("translation_already_interface_language"));
    return;
  }
  openTranslationPad({ source: text, sourceLabel: clipboardSource || t("clipboard") });
}

function sendClipboardTranslation(dest) {
  if (!clipboardTranslationText.trim()) return;
  sendTextToDestination(clipboardTranslationText, dest);
}

function sendTextToDestination(text, dest) {
  const content = String(text || "").trim();
  if (!content) return;

  if (dest === "teachtext") {
    if (getWindow("teachText").classList.contains("is-hidden")) newTextDocument();
    const start = teachTextBodyInput.selectionStart ?? teachTextBodyInput.value.length;
    const end = teachTextBodyInput.selectionEnd ?? teachTextBodyInput.value.length;
    teachTextBodyInput.setRangeText(content, start, end, "end");
    markTeachTextModified();
    openWindow("teachText");
    teachTextBodyInput.focus();
  } else if (dest === "assistant") {
    promptInput.value = content;
    openWindow("assistant");
    promptInput.focus();
  } else if (dest === "scrapbook") {
    const scrap = createScrap(null, content);
    if (scrap) {
      selectedScrapId = scrap.id;
      renderScraps();
      openWindow("scrapbook");
    }
  }
}

function selectedEditableText() {
  const target = document.activeElement;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    return start === end ? "" : target.value.slice(start, end);
  }
  return window.getSelection().toString();
}

function captureSelectionClipboard(source = t("copy")) {
  const text = selectedEditableText().trim();
  if (text) setClipboard(text, source);
}

function insertClipboardIntoTeachText() {
  if (!clipboardText) return;
  sendTextToDestination(clipboardText, "teachtext");
}

function getCharacterInsertTarget() {
  if (lastTextTarget && document.contains(lastTextTarget) && !lastTextTarget.disabled && !lastTextTarget.readOnly) {
    return lastTextTarget;
  }

  if (!getWindow("teachText").classList.contains("is-hidden")) return teachTextBodyInput;
  if (!getWindow("assistant").classList.contains("is-hidden")) return promptInput;
  return teachTextBodyInput;
}

function insertCharacter(character) {
  const target = getCharacterInsertTarget();
  if (!target) return;

  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  target.focus();
  target.setRangeText(character, start, end, "end");
  target.dispatchEvent(new Event("input", { bubbles: true }));

  setStatus(t("character_inserted"));
}
