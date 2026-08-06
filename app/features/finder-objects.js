// Lazy feature module: Clipping Files and Finder Alias.
//
// Clipping Files are small movable pieces of material saved as project files.
// They are not Scrapbook entries (curated collections) and not File Floppy
// context (temporary mounts) — they are durable objects on the Project Hard
// Disk that can be dragged back into TeachText, ClioTalk, Question Sheet, or
// ClioStage. Aliases are durable pointers to project files, resolved by id so
// moving or renaming the original inside the Project Hard Disk keeps the alias
// working; a deleted or trashed target makes the alias read as broken.
//
// Loaded on demand through ensureFinderObjectsModule(); the floppy budget only
// counts the startup bundle, so the heavy logic lives here.

window.AISystem6FinderObjectsLoaded = true;

// Stationery Pad: a project file flagged in Get Info opens as a fresh untitled
// copy instead of the original. The copy keeps the template content and folder,
// but gets a new identity, fresh timestamps, an untitled name, and no source
// relationships that would tie it to the template's provenance.
const stationeryResetFields = [
  "parentChatId",
  "sourceChatId",
  "sourceFileId",
  "sourceDocumentId",
  "claimCheckId",
  "referenceIds",
  "scrapIds",
  "sourceScrapId",
  "sourceReferenceId",
  "projectCdItemId",
  "promptId",
  "promptFolderKind",
];

function isStationeryCapableFile(file) {
  return !!file
    && (file.type === "text" || file.type === "chat")
    && !String(file.artifactKind || "").trim()
    && isInActiveProject(file);
}

function createStationeryCopy(file) {
  if (!isStationeryCapableFile(file) || file.stationery !== true) return null;
  const now = new Date().toISOString();
  const copy = structuredClone(file);
  copy.id = crypto.randomUUID();
  copy.name = nextAvailableFileName(t("untitled"), file.folderId);
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.stationery = false;
  stationeryResetFields.forEach((field) => {
    delete copy[field];
  });
  chatFiles.unshift(copy);
  return copy;
}

function openProjectFileWithStationery(file) {
  const copy = createStationeryCopy(file);
  if (!copy) return null;
  selectedChatFileId = copy.id;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  if (copy.type === "text") openTextFile(copy.id);
  else openChatFileWindow(copy.id);
  setStatus(t("stationery_copy_created", copy.name));
  return copy;
}

function clippingContentHash(text = "") {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function createClippingFile(options = {}) {
  if (!getActiveProject()) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return null;
  }
  const text = String(options.text || "").trim();
  if (!text) {
    setStatus(t("select_text_first"));
    return null;
  }
  const now = new Date().toISOString();
  const folderId = options.folderId || null;
  const baseName = String(options.sourceTitle || "").trim() || `${t("untitled")} Clip`;
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    artifactKind: "clipping",
    name: nextAvailableFileName(baseName, folderId),
    folderId,
    body: text,
    label: "",
    clipping: {
      sourceType: String(options.sourceType || "selection").trim(),
      sourceTitle: String(options.sourceTitle || "").trim(),
      sourceUrl: String(options.sourceUrl || "").trim(),
      capturedAt: String(options.capturedAt || now),
      before: String(options.before || "").trim(),
      after: String(options.after || "").trim(),
      contentHash: clippingContentHash(text),
      allowQuote: options.allowQuote !== false,
    },
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  selectedChatFileId = file.id;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  setStatus(t("clipping_created", file.name));
  return file;
}

function createClippingFromSelectionContext(context = {}) {
  if (!context?.text) {
    setStatus(t("select_text_first"));
    return null;
  }
  const folderId = typeof getCurrentFinderParentId === "function" ? getCurrentFinderParentId() : null;
  return createClippingFile({
    text: context.text,
    folderId,
    sourceType: context.surface || "selection",
    sourceTitle: (typeof selectionLabelForContext === "function" ? selectionLabelForContext(context) : "") || context.source?.title || "",
    sourceUrl: context.source?.url || "",
    capturedAt: new Date().toISOString(),
    before: context.before || "",
    after: context.after || "",
  });
}

function createAliasFile(target, folderId = null) {
  const source = chatFiles.find((item) => item.id === target?.id && isInActiveProject(item));
  if (!source || (source.type !== "text" && source.type !== "chat")) return null;
  const now = new Date().toISOString();
  const alias = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "alias",
    name: `${source.name} alias`,
    folderId: folderId !== null ? folderId : source.folderId || null,
    aliasTarget: { kind: "file", id: source.id },
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(alias);
  return alias;
}

function resolveAliasTarget(file, depth = 0) {
  if (!file || file.type !== "alias" || depth > 6) return null;
  const alias = file.aliasTarget;
  if (!alias) return null;
  if (alias.kind === "scrap") {
    // Scrapbook entries are an endpoint: aliases never chain through them.
    return scraps.find((item) => item.id === alias.id && isInActiveProject(item)) || null;
  }
  if (alias.kind === "reference") {
    // Project references are an endpoint too; the backup layer's alias
    // whitelist ("file" | "scrap" | "reference") matches these three kinds.
    return projectReferences.find((item) => item.id === alias.id && item.projectId === activeProjectId) || null;
  }
  if (alias.kind !== "file") return null;
  const target = chatFiles.find((item) => item.id === alias.id && isInActiveProject(item)) || null;
  if (!target) return null;
  return target.type === "alias" ? resolveAliasTarget(target, depth + 1) : target;
}

function openAliasFile(file) {
  const target = resolveAliasTarget(file);
  if (!target) {
    setStatus(t("alias_broken", file.name));
    return;
  }
  const targetKind = file.aliasTarget?.kind || "file";
  if (targetKind === "scrap") {
    selectedScrapId = target.id;
    selectedScrapIds.clear();
    selectedScrapIds.add(target.id);
    renderScraps();
    openWindow("scrapbook");
    return;
  }
  if (targetKind === "reference") {
    selectedProjectReferenceId = target.id;
    if (typeof openProjectReferenceInReader === "function") openProjectReferenceInReader(target);
    return;
  }
  selectedChatFileId = file.id;
  if (typeof openProjectFileWithStationery === "function" && openProjectFileWithStationery(target)) return;
  if (target.type === "text") openTextFile(target.id);
  else openChatFileWindow(target.id);
}

// "Replace Original…" materializes the target into the alias record in place,
// so the alias's own id stays stable for anything pointing at it.
function replaceAliasWithOriginal(file) {
  const target = resolveAliasTarget(file);
  if (!target) {
    setStatus(t("alias_broken", file.name));
    return;
  }
  const index = chatFiles.indexOf(file);
  if (index === -1) return;
  const now = new Date().toISOString();
  const copy = structuredClone(target);
  copy.id = file.id;
  copy.name = file.name;
  copy.folderId = file.folderId || null;
  copy.createdAt = file.createdAt;
  copy.updatedAt = now;
  copy.stationery = false;
  delete copy.aliasTarget;
  chatFiles[index] = copy;
  selectedChatFileId = copy.id;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  setStatus(t("alias_replaced", copy.name));
}

function makeAliasForFinderSelection() {
  const item = (typeof getCurrentFinderSelection === "function" ? getCurrentFinderSelection() : null)
    || (typeof getActiveItem === "function" ? getActiveItem() : null);
  if (!item || (item.type !== "text" && item.type !== "chat")) {
    setStatus(t("make_alias_select_file"));
    return;
  }
  const alias = createAliasFile(item);
  if (!alias) {
    setStatus(t("make_alias_select_file"));
    return;
  }
  selectedChatFileId = alias.id;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  setStatus(t("alias_created", alias.name));
}

function renderClippingFileInfo(item) {
  const isClipping = item?.artifactKind === "clipping";
  infoFinderObjectsBlockEl.hidden = !isClipping;
  if (!isClipping) return;
  const clipMeta = item.clipping || {};
  const sourceLabel = escapeHtml(clipMeta.sourceTitle || "--");
  const sourceUrl = escapeHtml(clipMeta.sourceUrl || "");
  const captured = clipMeta.capturedAt
    ? ` · ${t("clipping_captured_label")} ${new Date(clipMeta.capturedAt).toLocaleString()}`
    : "";
  infoFinderObjectsBlockEl.innerHTML = `
    <p class="hint">${t("clipping_source_label")}: ${sourceLabel}${sourceUrl ? ` (${sourceUrl})` : ""}${captured}</p>
    <label for="info-clipping-allow-quote">
      <input type="checkbox" id="info-clipping-allow-quote" ${clipMeta.allowQuote === false ? "" : "checked"} />
      <span data-i18n="clipping_allow_quote">${t("clipping_allow_quote")}</span>
    </label>
  `;
  infoFinderObjectsBlockEl.querySelector("#info-clipping-allow-quote").addEventListener("change", (event) => {
    if (!fileInfoItem || fileInfoItem.artifactKind !== "clipping") return;
    fileInfoItem.clipping = fileInfoItem.clipping || {};
    fileInfoItem.clipping.allowQuote = event.target.checked;
    fileInfoItem.updatedAt = new Date().toISOString();
    saveDeskState();
  });
}

function renderAliasFileInfo(item) {
  const isAlias = item?.type === "alias";
  infoFinderObjectsBlockEl.hidden = !isAlias;
  if (!isAlias) return;
  const target = resolveAliasTarget(item);
  const targetKind = item.aliasTarget?.kind || "file";
  let targetText = "--";
  if (target) {
    if (targetKind === "scrap") {
      const summary = String(target.body || target.title || "").replace(/\s+/g, " ").trim().slice(0, 24);
      targetText = t("alias_target_scrap", escapeHtml(summary));
    } else if (targetKind === "reference") {
      targetText = t("alias_target_reference", escapeHtml(target.name || ""));
    } else {
      const kind = typeof getProjectFileFinderItem === "function"
        ? getProjectFileFinderItem(target).kindLabel
        : getFinderItemKindLabel(target);
      targetText = `${escapeHtml(kind)} · ${escapeHtml(target.name)}`;
    }
  }
  // Scrap and reference aliases cannot materialize their target into the
  // alias record: that would produce a mis-typed chatFile. Replace Original
  // stays gated — only file aliases can be replaced with the original.
  const replaceGated = !!target && targetKind !== "file";
  infoFinderObjectsBlockEl.innerHTML = `
    <p class="hint">${t("alias_target_label")}: ${targetText}</p>
    <p class="hint">${target ? t("alias_status_ok") : t("alias_status_broken")}</p>
    ${replaceGated ? `<p class="hint">${t("alias_replace_file_only")}</p>` : ""}
    <div class="button-row">
      <button class="btn" type="button" data-finder-alias-action="show" ${target ? "" : "disabled"} data-i18n="alias_show_original">${t("alias_show_original")}</button>
      <button class="btn" type="button" data-finder-alias-action="replace" ${target && !replaceGated ? "" : "disabled"} data-i18n="alias_replace_original">${t("alias_replace_original")}</button>
    </div>
  `;
  infoFinderObjectsBlockEl.querySelectorAll("[data-finder-alias-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!fileInfoItem || fileInfoItem.type !== "alias") return;
      if (button.dataset.finderAliasAction === "show") openAliasFile(fileInfoItem);
      else replaceAliasWithOriginal(fileInfoItem);
    });
  });
}

// Finder Labels: user-set status colors on project files (Cite, To Verify,
// Counter, Judgment, Final, Blocked). They live in their own field so they
// never collide with the writing route's draft/ai/final workflow labels.
// Users set them in Get Info; AI may suggest but never write them silently.
const finderLabelVocabulary = Object.freeze([
  { id: "cite", zh: "引用", en: "Cite" },
  { id: "verify", zh: "待核实", en: "To Verify" },
  { id: "counter", zh: "反方材料", en: "Counter" },
  { id: "judgment", zh: "个人判断", en: "Judgment" },
  { id: "final", zh: "最终稿", en: "Final" },
  { id: "blocked", zh: "禁止使用", en: "Blocked" },
]);

function finderLabelDisplay(labelId) {
  const entry = finderLabelVocabulary.find((item) => item.id === labelId);
  return entry ? (currentLanguage === "zh" ? entry.zh : entry.en) : "";
}

// The one place that writes the user label. The Get Info picker and the
// suggestion accept button both route through here, so an AI suggestion can
// never write finderLabel directly — it lives in its own field and must be
// adopted by the user first.
function applyFinderLabel(item, labelId) {
  const target = resolveLabelableRecord(item) || item;
  const value = labelId || "";
  target.finderLabel = value;
  if (item && item !== target) item.finderLabel = value;
  target.updatedAt = new Date().toISOString();
  if (item && item !== target && "updatedAt" in item) item.updatedAt = target.updatedAt;
  delete target.finderLabelSuggestion;
  if (item && item !== target && item.finderLabelSuggestion) delete item.finderLabelSuggestion;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  renderFinderLabelInfo(item);
}

// Get Info receives live records for files but shallow copies for folders and
// Project Disk items; resolve the backing record so label writes persist.
function resolveLabelableRecord(item) {
  if (item?.type === "folder") {
    return chatFolders.find((folder) => folder.id === item.id && isInActiveProject(folder)) || null;
  }
  return chatFiles.find((file) => file.id === item.id && isInActiveProject(file)) || null;
}

function renderFinderLabelInfo(item) {
  const labelable = item && (item.type === "text" || item.type === "chat" || item.type === "alias" || item.type === "folder");
  if (!labelable) return;
  infoFinderObjectsBlockEl.querySelector("[data-finder-label-picker]")?.remove();
  infoFinderObjectsBlockEl.hidden = false;
  const noneLabel = currentLanguage === "zh" ? "无标签" : "No Label";
  const options = [""].concat(finderLabelVocabulary.map((entry) => entry.id))
    .map((id) => `<option value="${id}"${item.finderLabel === id ? " selected" : ""}>${id ? finderLabelDisplay(id) : noneLabel}</option>`)
    .join("");
  const picker = document.createElement("div");
  picker.className = "info-comments";
  picker.dataset.finderLabelPicker = "";
  picker.innerHTML = `
    <label for="info-finder-label-select">${currentLanguage === "zh" ? "标签" : "Label"}:</label>
    <div class="select-wrap"><select id="info-finder-label-select">${options}</select></div>
  `;
  infoFinderObjectsBlockEl.append(picker);
  picker.querySelector("#info-finder-label-select").addEventListener("change", (event) => {
    if (!fileInfoItem) return;
    applyFinderLabel(fileInfoItem, event.target.value || "");
  });

  // AI suggestions render in Get Info only — never on file rows, icons, or
  // lists. Adopting one is the same write path as the picker; ignoring it
  // lets the next Claim Check overwrite the suggestion. A folder label does not inherit
  // down to the files inside it, so "why is this blocked" stays traceable to
  // the exact object the user judged.
  const suggestion = item.finderLabelSuggestion;
  if (suggestion?.id) {
    const row = document.createElement("div");
    row.className = "finder-label-suggestion";
    const suggestionLabel = finderLabelDisplay(suggestion.id) || suggestion.id;
    row.innerHTML = `
      <p class="hint">${escapeHtml(t("finder_label_suggestion", suggestionLabel, suggestion.reason || ""))}</p>
      <button class="btn mini-btn" type="button" data-finder-label-accept>${t("finder_label_accept")}</button>
    `;
    picker.after(row);
    row.querySelector("[data-finder-label-accept]").addEventListener("click", () => {
      const pending = fileInfoItem && fileInfoItem.finderLabelSuggestion;
      if (!pending?.id) return;
      applyFinderLabel(fileInfoItem, pending.id);
    });
  }
}

function renderFinderObjectInfo(item) {
  renderClippingFileInfo(item);
  renderAliasFileInfo(item);
  renderFinderLabelInfo(item);
}

// Clipping drag-back: dropping a clipping file onto an editable surface
// inserts its text at the drop point. The insertion target follows the drop
// point, not document.activeElement — during a drag the focus is usually still
// on the source window, and routing by focus would drop the material into the
// previous article. That is the mirror image of the writing-route bug recorded
// in .claude/rules/writing-route-internals.md, so it is written down here.
//
// Three surfaces, three insertion forms: TeachText gets the provenance comment,
// Question Sheet stays plain (a messy input area), ClioStage gets an explicit
// blockquote because external material in a deck must read as a citation.
function insertClippingIntoEditor(dropTarget, dragData, event) {
  if (!getActiveProject()) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return;
  }
  const surface = dropTarget.dataset.editorSurface || dropTarget.id || "";
  const clipping = findDroppedClipping(dragData);
  if (!clipping || !String(clipping.body || "").trim()) {
    setStatus(t("clipping_drop_only_clipping"));
    return;
  }
  if (clipping.clipping?.allowQuote === false) {
    setStatus(t("clipping_drop_no_quote"));
    return;
  }
  const body = String(clipping.body).trim();
  const title = clipping.clipping?.sourceTitle || clipping.name || t("untitled");
  if (surface === "clioStage") return insertClippingIntoClioStage(body, title);
  if (surface === "questionSheet") return insertClippingIntoQuestionSheet(dropTarget, body, title);
  return insertClippingIntoTechText(dropTarget, clipping, body, title);
}

function findDroppedClipping(dragData) {
  const ids = [];
  if (Array.isArray(dragData?.items)) {
    dragData.items.filter((item) => item.type === "file").forEach((item) => ids.push(item.id));
  }
  if (dragData?.type === "file" && dragData.id) ids.push(dragData.id);
  for (const id of ids) {
    const file = chatFiles.find((item) => item.id === id && isInActiveProject(item));
    if (file?.artifactKind === "clipping") return file;
  }
  return null;
}

function insertClippingIntoTechText(dropTarget, clipping, body, title) {
  if (teachTextBodyInput.readOnly) {
    setStatus(t("clipping_drop_readonly", t("section_drafts")));
    return;
  }
  const offset = readDropCaretOffset(dropTarget, teachTextBodyInput);
  teachTextBodyInput.setSelectionRange(offset, offset);
  insertIntoTeachText(body, {
    title,
    url: clipping.clipping?.sourceUrl || "",
    capturedAt: clipping.clipping?.capturedAt || "",
  });
  setStatus(t("clipping_inserted", title));
}

function insertClippingIntoQuestionSheet(dropTarget, body, title) {
  const offset = readDropCaretOffset(dropTarget, questionSheetBodyInput);
  insertTextAtDropPoint(questionSheetBodyInput, offset, `${body}\n\n${t("clipping_drop_source_line", title)}`);
  savePipelineData();
  openWindow("questionSheet");
  questionSheetBodyInput.focus();
  setStatus(t("clipping_inserted", title));
}

function insertClippingIntoClioStage(body, title) {
  if (typeof clioStageState === "undefined" || !clioStageState?.source?.markdown) {
    setStatus(t("clipping_drop_deck_readonly"));
    return;
  }
  const deckId = clioStageState.source.sourceItemId || "";
  const deckFile = chatFiles.find((file) => file.id === deckId && file.type === "text" && isInActiveProject(file));
  if (!deckFile) {
    setStatus(t("clipping_drop_deck_readonly"));
    return;
  }
  const quote = body.split("\n").map((line) => `> ${line}`).join("\n");
  const insertion = `\n\n---\n\n${quote}\n\n${t("clipping_drop_source_line", title)}`;
  deckFile.body = `${deckFile.body || ""}${insertion}`;
  deckFile.updatedAt = new Date().toISOString();
  clioStageState.source = { ...clioStageState.source, markdown: deckFile.body };
  clioStageState.parsed = parseClioStageMarpDocument(deckFile.body) || clioStageState.parsed;
  window.AISystem6ClioStage?.load?.(clioStageState.source);
  if (deckFile.id === activeTextFileId) {
    teachTextBodyInput.value = deckFile.body;
    markTeachTextModified();
    refreshTeachTextDocumentState();
  }
  saveDeskState();
  renderDocuments();
  setStatus(t("clipping_inserted", title));
}

function insertTextAtDropPoint(textarea, offset, text) {
  const value = textarea.value || "";
  const at = clampOffset(offset, value.length);
  const before = value.slice(0, at);
  const after = value.slice(at);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !text.endsWith("\n") ? "\n\n" : "";
  const inserted = `${prefix}${text}${suffix}`;
  textarea.value = `${before}${inserted}${after}`;
  textarea.setSelectionRange(before.length + inserted.length, before.length + inserted.length);
}

function readDropCaretOffset(dropTarget, textarea) {
  const stored = Number(dropTarget?.dataset?.dropCaretOffset);
  if (Number.isFinite(stored) && stored >= 0) return Math.floor(stored);
  return textarea?.selectionStart ?? 0;
}

// Dragover support: decide acceptance, place the blinking insertion caret, and
// set the drop effect. Chrome lets us read the payload here, so non-clipping
// drags show no caret; Firefox hides payload data until the drop, so without
// the payload we optimistically accept and validate precisely at the drop.
function handleEditorInsertDragOver(dropTarget, event) {
  const surface = dropTarget.dataset.editorSurface || dropTarget.id || "";
  const textarea = surface === "teachtext"
    ? teachTextBodyInput
    : surface === "questionSheet"
      ? questionSheetBodyInput
      : null;
  if (!textarea) {
    if (surface === "clioStage" && event.dataTransfer.types.includes("application/json")) {
      event.dataTransfer.dropEffect = "copy";
    }
    return;
  }
  const dragData = readDragData(event);
  const internalDrag = event.dataTransfer.types.includes("application/json");
  if (dragData && !findDroppedClipping(dragData)) {
    event.dataTransfer.dropEffect = "none";
    clearEditorInsertCaret(dropTarget);
    return;
  }
  if (dragData === null && !internalDrag) {
    event.dataTransfer.dropEffect = "none";
    clearEditorInsertCaret(dropTarget);
    return;
  }
  const offset = textareaDropOffset(textarea, event);
  dropTarget.dataset.dropCaretOffset = String(offset);
  positionDropCaret(dropTarget, textarea, offset);
  event.dataTransfer.dropEffect = "copy";
}

function readDragData(event) {
  try {
    const raw = event.dataTransfer.getData("application/json");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearEditorInsertCaret(dropTarget) {
  const container = dropTarget.closest?.(".teachtext-editor-container") || dropTarget.parentElement;
  container?.querySelector?.(".drop-caret")?.remove();
}

function textareaDropOffset(textarea, event) {
  const value = textarea.value || "";
  const position = typeof document.caretPositionFromPoint === "function"
    ? document.caretPositionFromPoint(event.clientX, event.clientY)
    : null;
  const range = !position && typeof document.caretRangeFromPoint === "function"
    ? document.caretRangeFromPoint(event.clientX, event.clientY)
    : null;
  const node = position?.offsetNode || range?.startContainer || null;
  if (node === textarea) {
    return clampOffset(position ? position.offset : range.startOffset, value.length);
  }
  // No caret from the browser (drop over padding or the scrollbar): fall back
  // to the nearest edge of the text so the drop still lands somewhere sane.
  const rect = textarea.getBoundingClientRect();
  if (event.clientY < rect.top) return 0;
  if (event.clientY > rect.bottom) return value.length;
  return clampOffset(textarea.selectionStart ?? 0, value.length);
}

function clampOffset(offset, length) {
  const value = Number(offset);
  if (!Number.isFinite(value)) return length;
  return Math.max(0, Math.min(Math.floor(value), length));
}

const dropCaretMirrors = new WeakMap();
function measureTextareaPoint(textarea, offset) {
  const container = textarea.closest(".teachtext-editor-container") || textarea.parentElement;
  let mirror = dropCaretMirrors.get(textarea);
  if (!mirror) {
    mirror = document.createElement("div");
    mirror.className = "drop-caret-mirror";
    container.append(mirror);
    dropCaretMirrors.set(textarea, mirror);
  }
  const style = window.getComputedStyle(textarea);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const lineHeight = parseFloat(style.lineHeight) || 16;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.wordSpacing = style.wordSpacing;
  mirror.style.wordBreak = style.wordBreak || "break-word";
  mirror.style.setProperty("--drop-mirror-padding", `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`);
  mirror.style.setProperty("--drop-mirror-width", `${Math.max(0, textarea.clientWidth - paddingLeft - paddingRight)}px`);
  const span = document.createElement("span");
  span.textContent = `${(textarea.value || "").slice(0, clampOffset(offset, (textarea.value || "").length))}\u200b`;
  mirror.replaceChildren(span);
  const rect = span.getBoundingClientRect();
  return { x: rect.right, y: rect.bottom - lineHeight, lineHeight };
}

function positionDropCaret(dropTarget, textarea, offset) {
  const container = dropTarget.closest(".teachtext-editor-container") || dropTarget.parentElement;
  if (!container) return;
  let caret = container.querySelector(".drop-caret");
  if (!caret) {
    caret = document.createElement("i");
    caret.className = "drop-caret";
    caret.setAttribute("aria-hidden", "true");
    container.append(caret);
  }
  const point = measureTextareaPoint(textarea, offset);
  const containerRect = container.getBoundingClientRect();
  caret.style.setProperty("--drop-caret-top", `${point.y - containerRect.top}px`);
  caret.style.setProperty("--drop-caret-left", `${point.x - containerRect.left}px`);
  caret.style.setProperty("--drop-caret-height", `${point.lineHeight}px`);
}

window.AISystem6FinderObjects = {
  insertClippingIntoEditor,
  handleEditorInsertDragOver,
  clearEditorInsertCaret,
};
