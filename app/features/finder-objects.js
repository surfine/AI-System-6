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
  if (!alias || alias.kind !== "file") return null;
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
  const targetKind = target && typeof getProjectFileFinderItem === "function"
    ? getProjectFileFinderItem(target).kindLabel
    : target ? getFinderItemKindLabel(target) : "";
  const targetText = target ? `${escapeHtml(targetKind)} · ${escapeHtml(target.name)}` : "--";
  infoFinderObjectsBlockEl.innerHTML = `
    <p class="hint">${t("alias_target_label")}: ${targetText}</p>
    <p class="hint">${target ? t("alias_status_ok") : t("alias_status_broken")}</p>
    <div class="button-row">
      <button class="btn" type="button" data-finder-alias-action="show" ${target ? "" : "disabled"} data-i18n="alias_show_original">${t("alias_show_original")}</button>
      <button class="btn" type="button" data-finder-alias-action="replace" ${target ? "" : "disabled"} data-i18n="alias_replace_original">${t("alias_replace_original")}</button>
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

function renderFinderLabelInfo(item) {
  const labelable = item && (item.type === "text" || item.type === "chat" || item.type === "alias");
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
    fileInfoItem.finderLabel = event.target.value || "";
    fileInfoItem.updatedAt = new Date().toISOString();
    saveDeskState();
    renderDocuments();
    renderProjectDisks();
  });
}

function renderFinderObjectInfo(item) {
  renderClippingFileInfo(item);
  renderAliasFileInfo(item);
  renderFinderLabelInfo(item);
}
