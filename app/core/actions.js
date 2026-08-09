// Core runtime module: actions.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

let reviewDeskMode = "style";

const keyboardShortcutRegistry = [
  { id: "new-document", key: "n", action: "new-document", display: "⌘N", labelKey: "new_document", keyCaps: true, scope: ["teachText", "quickDraft"] },
  { id: "new-folder", key: "n", shift: true, action: "new-folder", display: "⇧⌘N", labelKey: "new_folder", keyCaps: true, suppressInEditable: true, scope: ["finder"] },
  { id: "open", key: "o", action: "open-menu-selection", display: "⌘O", labelKey: "open", keyCaps: true, suppressInEditable: true, scope: ["finder", "teachText"] },
  { id: "save", key: "s", action: "save-current", display: "⌘S", labelKey: "save_current", keyCaps: true, scope: ["teachText", "clioTalk"] },
  { id: "save-copy", key: "s", shift: true, action: "save-copy", display: "⇧⌘S", labelKey: "save_copy", keyCaps: true, scope: ["teachText"] },
  { id: "close-window", key: "w", action: "close-active-window", display: "⌘W", labelKey: "close_window", keyCaps: true, scope: "global" },
  { id: "undo", key: "z", action: "undo", display: "⌘Z / ⇧⌘Z", menuDisplay: "⌘Z", labelKey: "undo_redo", keyCaps: true, scope: "application" },
  { id: "redo", key: "z", shift: true, action: "redo", display: "⇧⌘Z", labelKey: "redo", scope: "application" },
  // display is the Key Caps summary for the whole cut/copy/paste/select-all
  // family; menuDisplay is what the Edit menu's own Cut item shows.
  { id: "cut", key: "x", action: "cut", display: "⌘X/C/V/A", menuDisplay: "⌘X", labelKey: "edit_basics", keyCaps: true, scope: "application" },
  { id: "copy", key: "c", action: "copy", display: "⌘C", labelKey: "copy", scope: "application" },
  { id: "paste", key: "v", action: "paste", display: "⌘V", labelKey: "paste", scope: "application" },
  { id: "select-all", key: "a", action: "select-all", display: "⌘A", labelKey: "select_all", scope: "application" },
  { id: "format-writing", key: "b", display: "⌘B/I/K", labelKey: "format_basics", keyCaps: true, dispatch: false },
  { id: "get-info", key: "i", action: "open-file-info", display: "⌘I", labelKey: "get_info", keyCaps: true, suppressInEditable: true, scope: ["finder"] },
  { id: "duplicate", key: "d", action: "duplicate-selection", display: "⌘D", labelKey: "duplicate", suppressInEditable: true, scope: ["finder"] },
  { id: "move-to-trash", key: "backspace", action: "move-file-trash", display: "⌘⌫", labelKey: "move_to_trash", suppressInEditable: true, scope: ["finder"] },
  { id: "move-to-trash-delete", key: "delete", action: "move-file-trash", display: "⌘⌫", labelKey: "move_to_trash", suppressInEditable: true, scope: ["finder"] },
  { id: "eject", key: "e", action: "eject-menu-selection", display: "⌘E", labelKey: "eject", suppressInEditable: true, scope: ["finder"] },
  { id: "system-help", key: "?", shift: true, action: "open-system-help", display: "⌘?", labelKey: "system_help", keyCaps: true, scope: "global" },
  { id: "control-panel", key: ",", action: "open-control", display: "⌘,", labelKey: "control_panel", keyCaps: true, scope: "global" },
  { id: "clio-chart-view-1", key: "1", action: "clio-chart-bars", display: "⌘1", labelKey: "clio_chart_bars", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-2", key: "2", action: "clio-chart-matrix", display: "⌘2", labelKey: "clio_chart_matrix", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-3", key: "3", action: "clio-chart-trace", display: "⌘3", labelKey: "clio_chart_trace", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-4", key: "4", action: "clio-chart-grid", display: "⌘4", labelKey: "clio_chart_grid", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-5", key: "5", action: "clio-chart-score", display: "⌘5", labelKey: "clio_chart_score", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-reverse", key: "r", action: "clio-chart-reverse-sort", display: "⌘R", labelKey: "clio_chart_reverse_sort", suppressInEditable: true, scope: ["clioChart"] },
];

function keyboardShortcutById(id) {
  return keyboardShortcutRegistry.find((shortcut) => shortcut.id === id) || null;
}

function shortcutUsesCommandKey() {
  const platform = String(
    (typeof navigator !== "undefined"
      && (navigator.userAgentData?.platform || navigator.platform || ""))
    || ""
  ).toLowerCase();
  return platform.includes("mac")
    || platform.includes("iphone")
    || platform.includes("ipad")
    || platform.includes("ipod");
}

function shortcutModifierPressed(event) {
  if (shortcutUsesCommandKey()) {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
}

function shortcutDisplayLabel(shortcut) {
  const label = shortcut.menuDisplay || shortcut.display || "";
  return shortcutUsesCommandKey() ? label : label.replace(/⌘/g, "Ctrl");
}

function syncKeyboardShortcutLabels() {
  document.querySelectorAll("[data-shortcut-id]").forEach((element) => {
    const shortcut = keyboardShortcutById(element.dataset.shortcutId);
    if (shortcut) element.dataset.shortcut = shortcutDisplayLabel(shortcut);
  });
}

function renderKeyCapsShortcuts() {
  const grid = document.querySelector("#shortcut-grid");
  if (!grid) return;
  const fragment = document.createDocumentFragment();
  keyboardShortcutRegistry.filter((shortcut) => shortcut.keyCaps).forEach((shortcut) => {
    const key = document.createElement("span");
    const label = document.createElement("b");
    key.textContent = shortcutDisplayLabel(shortcut);
    label.textContent = t(shortcut.labelKey);
    fragment.append(key, label);
  });
  grid.replaceChildren(fragment);
}


function createFolderFromMenu() {
  if (!isProjectMounted) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return;
  }

  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = active?.dataset.window;
  const canCreateHere = activeName === "documents"
    || getFinderVolumeCapabilities(activeName)?.canCreateFolder;
  if (!canCreateHere) {
    setStatus(t("new_folder_project_disk_only"));
    return;
  }
  const parentId = (activeName === "projects" || activeName === "documents")
    ? (selectedFolderId === "all" ? null : selectedFolderId)
    : null;
  const folder = createFinderFolder(t("new_folder"), parentId);
  selectedChatFileId = null;
  selectedDocumentFolderId = folder.id;
  selectedProjectRootItemId = null;
  saveDeskState();
  if (activeName === "documents") {
    renderDocuments();
  } else {
    openWindow("projects");
    renderProjectDisks();
  }
  setStatus(t("folder_created", displayFolderName(folder.name)));
}

function openFinderMenuSelection() {
  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = active?.dataset.window;
  const volume = typeof getFinderVolumeDefinition === "function"
    ? getFinderVolumeDefinition(activeName)
    : null;

  if (volume) {
    const item = getFinderVolumeSelectedItem(activeName);
    if (typeof item?.open === "function") {
      item.open();
      return;
    }
    if (item?.action) {
      handleAction(item.action);
      return;
    }
  } else if (finderContainerWindowNames.includes(activeName)) {
    const item = getSelectedStaticFinderItem(activeName);
    if (item) {
      handleAction(item.action);
      return;
    }
  }

  if (activeName === "projects") {
    openProjectRootItem();
    return;
  }

  if (activeName === "documents") {
    openSelectedDocumentItem();
    return;
  }

  if (isProjectMounted) {
    openWindow("projects");
    return;
  }

  openWindow("projects");
  setStatus(t("no_project_mounted"));
}

function duplicateFinderMenuSelection() {
  duplicateActiveFile();
}

function getFinderSelectedTeachTextFile() {
  const item = getCurrentFinderSelection();
  if (!item || item.type !== "text") return null;
  return chatFiles.find((file) => file.id === item.id && file.type === "text" && isInActiveProject(file)) || null;
}

function openFinderSelectedTeachTextFile() {
  const file = getFinderSelectedTeachTextFile();
  if (!file) return false;
  selectedChatFileId = file.id;
  openTextFile(file.id);
  return true;
}

function makeDocMapFromFinderOrCurrent() {
  const file = getFinderSelectedTeachTextFile();
  if (file?.body?.trim()) {
    return withDocMap(() => makeDocMapFromCurrentSource({
      text: file.body.trim(),
      label: file.name,
      scope: "documents",
      meta: { fileId: file.id, fileType: file.type },
      threshold: docMapMinDocumentChars,
    }));
  }
  return withDocMap(() => makeDocMapFromCurrentSource());
}

function makeDocMapForRange(rangeMode = "auto", preferredContext = null) {
  const context = preferredContext
    || (rangeMode === "selection"
      ? (getSelectionServiceContext() || lastSelectionServiceContext)
      : null);
  return withDocMap(() => makeDocMapFromCurrentSource(context, { rangeMode }));
}

function runStyleCheckFromMenu() {
  openFinderSelectedTeachTextFile();
  openWindow("teachText");
  runTeachTextStyleCheck();
}

function runClaimCheckFromMenu() {
  openFinderSelectedTeachTextFile();
  runClaimCheck();
}

function setReviewDeskMode(mode = "style") {
  const normalizedMode = mode === "facts" || mode === "hkrr" ? mode : "style";
  reviewDeskMode = normalizedMode;
  const resultMode = normalizedMode === "style" ? "style" : "facts";
  document.querySelectorAll("[data-review-result]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.reviewResult !== resultMode);
  });
}

function clearReviewFeedbackSlot(mode = getReviewDeskMode(), message = "") {
  const resultMode = mode === "style" ? "style" : "facts";
  setReviewDeskMode(mode);
  if (styleSheetResultsEl) {
    styleSheetResultsEl.innerHTML = resultMode === "style"
      ? `<p class="empty-folder-note">${escapeHtml(message || t("style_sheet_empty"))}</p>`
      : "";
  }
  if (claimResultsEl) {
    claimResultsEl.innerHTML = resultMode === "facts"
      ? `<p class="empty-folder-note">${escapeHtml(message || t("claim_check_empty"))}</p>`
      : "";
  }
}

function updateReviewDeskStatusTitle() {
  if (!reviewStatusTitleEl) return;
  reviewStatusTitleEl.textContent = getTeachTextDocumentName({
    fallback: teachTextNameInput?.value?.trim() || t("untitled"),
  });
}

function formatReviewVoiceStats(text = "") {
  const body = String(text || "").trim();
  const words = countTextWords(body);
  const seconds = typeof estimateVoiceoverSeconds === "function" ? estimateVoiceoverSeconds(body) : estimateBilibiliVoiceoverSeconds(body);
  if (!words) return t("draft_voice_stats_empty");
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return t("draft_voice_stats_seconds", words, seconds);
  if (remainingSeconds === 0) return t("draft_voice_stats_minutes", words, minutes);
  return t("draft_voice_stats_minutes_seconds", words, minutes, remainingSeconds);
}

function estimateBilibiliVoiceoverSeconds(text) {
  const body = String(text || "");
  const cjkCharsPerMinute = 240;
  const latinWordsPerMinute = 150;
  const cjk = body.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
  const latin = body
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ")
    .match(/[\p{L}\p{N}]+/gu)?.length || 0;
  return Math.ceil((cjk / cjkCharsPerMinute + latin / latinWordsPerMinute) * 60);
}

function updateReviewDeskStats() {
  if (!styleSheetCountEl) return;
  const source = reviewDeskBodyInput?.value || "";
  styleSheetCountEl.textContent = formatReviewVoiceStats(source);
}

function setReviewDeskSourceRatio(ratio = 0.5) {
  const container = reviewDeskSplitterEl?.closest(".review-desk-results");
  if (!container) return;
  const next = Math.max(0.25, Math.min(0.75, Number(ratio) || 0.5));
  container.style.setProperty("--review-source-ratio", String(next));
}

function startReviewDeskSplitterDrag(event) {
  const container = reviewDeskSplitterEl?.closest(".review-desk-results");
  if (!container || event.button > 0) return;
  event.preventDefault();
  event.stopPropagation();
  container.classList.add("is-resizing");
  reviewDeskSplitterEl.setPointerCapture?.(event.pointerId);

  const update = (clientY) => {
    const rect = container.getBoundingClientRect();
    const splitter = reviewDeskSplitterEl?.getBoundingClientRect().height || 10;
    const usableHeight = Math.max(1, rect.height - splitter);
    setReviewDeskSourceRatio((clientY - rect.top - splitter / 2) / usableHeight);
  };
  const move = (moveEvent) => update(moveEvent.clientY);
  const stop = () => {
    container.classList.remove("is-resizing");
    reviewDeskSplitterEl.releasePointerCapture?.(event.pointerId);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };

  update(event.clientY);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function isReviewDeskLinkedToFinal() {
  return !!teachTextReviewLabel();
}

function syncReviewDeskAvailability() {
  const ready = isReviewDeskLinkedToFinal();
  getWindow("reviewDesk")?.classList.toggle("is-review-locked", !ready);
  if (reviewDeskBodyInput) {
    reviewDeskBodyInput.readOnly = !ready;
    reviewDeskBodyInput.classList.toggle("is-hidden", !ready);
    if (!ready) {
      reviewDeskBodyInput.value = "";
      reviewDeskDirty = false;
    }
  }
  reviewDeskPreviewEl?.classList.add("is-hidden");
  reviewDeskEmptyNoteEl?.classList.toggle("is-hidden", ready);
  updateReviewDeskStatusTitle();
  updateReviewDeskStats();
  updateMenuState();
}

function syncReviewDeskFromTeachText({ force = false } = {}) {
  if (!teachTextReviewLabel()) return;
  if (!reviewDeskBodyInput || (!force && reviewDeskDirty)) return;
  const section = currentReviewDeskSectionBlock();
  const sectionText = section?.text || teachTextBodyInput.value || "";
  if (reviewDeskBodyInput.value !== sectionText) {
    reviewDeskBodyInput.value = sectionText;
  }
  reviewDeskDirty = false;
  reviewDeskBodyInput.scrollTop = 0;
  updateReviewDeskStats();
  syncReviewDeskPreview({ force: true });
}

function appendReviewFeedbackToBody(markdown) {
  const clean = stripRebuildMarkdownFence(String(markdown || "")).trim();
  if (!clean) return;
  setReviewDeskMode(getReviewDeskMode());
  const target = getReviewDeskMode() === "style" ? styleSheetResultsEl : claimResultsEl;
  if (target) target.innerHTML = markdownToSystemHtml(clean);
  updateMenuState();
}

function syncReviewDeskToTeachText() {
  if (!teachTextReviewLabel()) {
    setStatus(t("teachtext_review_requires_final"));
    return false;
  }
  if (!reviewDeskBodyInput) return;
  const fullText = teachTextBodyInput.value || "";
  const section = currentReviewDeskSectionBlock(fullText);
  const sectionText = reviewDeskBodyInput.value || "";
  const start = Math.max(0, section?.offset || 0);
  const end = section ? Math.min(fullText.length, start + section.text.length) : fullText.length;
  const nextText = section
    ? `${fullText.slice(0, start)}${sectionText}${fullText.slice(end)}`
    : sectionText;
  if (teachTextBodyInput.value !== nextText) {
    teachTextBodyInput.value = nextText;
  }
  reviewDeskDirty = false;
  markTeachTextModified();
  if (typeof syncTeachTextToLinkedProjectMarkdown === "function") {
    syncTeachTextToLinkedProjectMarkdown();
  }
  renderClaimCheckSections();
  renderStyleCheckSections();
  updateReviewDeskStatusTitle();
  updateReviewDeskStats();
  updateTeachTextBoundaries();
  updateTeachTextTranslateButton();
  updateTeachTextBilingualExportButton();
  updateTeachTextDeskState();
  scheduleTeachTextTabSave();
  updateMenuState();
  return true;
}

function currentReviewDeskSectionIndex(sections = getTeachTextSectionBlocks()) {
  const activeIndex = Number.isFinite(selectedStyleSectionIndex) ? selectedStyleSectionIndex : selectedClaimSectionIndex;
  return Math.max(0, Math.min(Math.max(0, sections.length - 1), Number(activeIndex) || 0));
}

function currentReviewDeskSectionBlock(body = teachTextBodyInput?.value || "") {
  const sections = getTeachTextSectionBlocks(body);
  if (!sections.length) return null;
  return sections[currentReviewDeskSectionIndex(sections)] || sections[0];
}

function textareaLineHeight(element) {
  if (!element) return 20;
  const styles = window.getComputedStyle(element);
  const parsedLineHeight = Number.parseFloat(styles.lineHeight);
  const fontSize = Number.parseFloat(styles.fontSize) || 16;
  return Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.4;
}

function textareaOffsetForScroll(element) {
  if (!element) return 0;
  const lineIndex = Math.max(0, Math.floor(element.scrollTop / textareaLineHeight(element)));
  const lines = String(element.value || "").split("\n");
  let offset = 0;
  for (let index = 0; index < Math.min(lineIndex, lines.length); index += 1) {
    offset += lines[index].length + 1;
  }
  return Math.max(0, Math.min(String(element.value || "").length, offset));
}

function scrollTextareaToOffset(element, offset = 0) {
  if (!element) return;
  const source = String(element.value || "");
  const target = Math.max(0, Math.min(source.length, Number(offset) || 0));
  const lineIndex = source.slice(0, target).split("\n").length - 1;
  element.scrollTop = Math.max(0, lineIndex * textareaLineHeight(element) - element.clientHeight * 0.18);
}

function sectionIndexForOffset(sections, offset = 0) {
  if (!sections.length) return 0;
  const target = Math.max(0, Number(offset) || 0);
  let selected = 0;
  sections.forEach((section, index) => {
    if ((section.offset || 0) <= target) selected = index;
  });
  return selected;
}

function syncReviewDeskScrollFrom(element) {
  if (reviewDeskScrollSyncing || !teachTextReviewLabel()) return;
  if (!teachTextBodyInput || !reviewDeskBodyInput) return;
  const sections = getTeachTextSectionBlocks(teachTextBodyInput.value || "");
  if (!sections.length) return;

  reviewDeskScrollSyncing = true;
  if (element === teachTextBodyInput) {
    const fullOffset = textareaOffsetForScroll(teachTextBodyInput);
    const index = sectionIndexForOffset(sections, fullOffset);
    const section = sections[index];
    selectedStyleSectionIndex = index;
    selectedClaimSectionIndex = index;
    renderStyleCheckSections();
    renderClaimCheckSections();
    syncReviewDeskFromTeachText({ force: true });
    scrollTextareaToOffset(reviewDeskBodyInput, Math.max(0, fullOffset - (section?.offset || 0)));
  } else {
    const section = currentReviewDeskSectionBlock(teachTextBodyInput.value || "");
    const sectionOffset = (section?.offset || 0) + textareaOffsetForScroll(reviewDeskBodyInput);
    scrollTextareaToOffset(teachTextBodyInput, sectionOffset);
  }
  requestAnimationFrame(() => {
    reviewDeskScrollSyncing = false;
  });
}

function syncReviewDeskPreview({ force = false } = {}) {
  if (!reviewDeskPreviewEl || !reviewDeskBodyInput) return;
  if (!force && reviewDeskPreviewEl.classList.contains("is-hidden")) return;
  const value = reviewDeskBodyInput.value.trim();
  reviewDeskPreviewEl.innerHTML = value
    ? markdownToSystemHtml(resolveTeachTextImageMarkdown(reviewDeskBodyInput.value, { preview: true }))
    : `<p class="empty-folder-note">${escapeHtml(t("teachtext_preview_empty"))}</p>`;
}

function toggleReviewDeskPreview() {
  if (!reviewDeskBodyInput || !reviewDeskPreviewEl) return;
  const showPreview = reviewDeskPreviewEl.classList.contains("is-hidden");
  if (showPreview) {
    syncReviewDeskPreview({ force: true });
    reviewDeskPreviewEl.classList.remove("is-hidden");
    reviewDeskBodyInput.classList.add("is-hidden");
    setStatus(t("previewing_markdown"));
  } else {
    reviewDeskPreviewEl.classList.add("is-hidden");
    reviewDeskBodyInput.classList.remove("is-hidden");
    reviewDeskBodyInput.focus();
  }
}

function openReviewDesk(mode = "style") {
  openWindow("reviewDesk");
  if (ensureTeachTextReviewState({ promoteSavedFinal: true, openTeachText: false })) {
    syncReviewDeskFromTeachText({ force: true });
  } else {
    setStatus(t("teachtext_review_requires_final"));
  }
  renderStyleCheckSections();
  renderClaimCheckSections();
  setReviewDeskMode(mode);
  syncReviewDeskAvailability();
}

function getReviewDeskMode() {
  return ["facts", "hkrr"].includes(reviewDeskMode) ? reviewDeskMode : "style";
}

function runReviewDeskStyleSectionCheck() {
  if (!isReviewDeskLinkedToFinal()) return syncReviewDeskAvailability();
  if (!syncReviewDeskToTeachText()) return;
  setReviewDeskMode("style");
  clearReviewFeedbackSlot("style", t("checking_style"));
  runTeachTextStyleCheck({ sectionOnly: true });
}

function runReviewDeskFactSectionCheck() {
  if (!isReviewDeskLinkedToFinal()) return syncReviewDeskAvailability();
  if (!syncReviewDeskToTeachText()) return;
  setReviewDeskMode("facts");
  clearReviewFeedbackSlot("facts", t("running_check"));
  runClaimCheck({ sectionOnly: true });
}

function runReviewDeskHkrrSectionCheck() {
  if (!isReviewDeskLinkedToFinal()) return syncReviewDeskAvailability();
  if (!syncReviewDeskToTeachText()) return;
  setReviewDeskMode("hkrr");
  clearReviewFeedbackSlot("hkrr", currentLanguage === "zh" ? "正在用 HKRR 审视..." : "Reviewing with HKRR...");
  ensureHkrrReviewModule().then(() => runHkrrReview({ sectionOnly: true }));
}

function runReviewDeskMingmingHandoffReview() {
  if (!isReviewDeskLinkedToFinal()) return syncReviewDeskAvailability();
  if (!syncReviewDeskToTeachText()) return;
  setReviewDeskMode("facts");
  clearReviewFeedbackSlot("facts", currentLanguage === "zh" ? "正在生成若是落落会怎么接..." : "Generating How Luoluo Would Receive It...");
  ensureMingmingHandoffReviewModule().then(() => runMingmingHandoffReview({ mode: "card", sectionOnly: true }));
}

function runReviewDeskMingmingHandoffBackstageReview() {
  if (!isReviewDeskLinkedToFinal()) return syncReviewDeskAvailability();
  if (!syncReviewDeskToTeachText()) return;
  setReviewDeskMode("facts");
  clearReviewFeedbackSlot("facts", currentLanguage === "zh" ? "正在生成交付后台审校..." : "Generating backstage handoff review...");
  ensureMingmingHandoffReviewModule().then(() => runMingmingHandoffReview({ mode: "backstage", sectionOnly: true }));
}

async function viewReviewDeskManuscript() {
  if (!ensureTeachTextReviewState({ promoteSavedFinal: true, openTeachText: false })) {
    await openWindow("teachText");
    setStatus(t("teachtext_review_requires_final"));
    return;
  }
  syncReviewDeskToTeachText();
  await openWindow("teachText");
  await openWindow("reviewDesk");
  syncReviewDeskFromTeachText({ force: true });
  const section = currentReviewDeskSectionBlock(teachTextBodyInput.value || "");
  if (section) {
    scrollTextareaToOffset(teachTextBodyInput, section.offset || 0);
  }
  showTeachTextPreview({ announce: false, focus: false, preserveScroll: false });
  if (section && teachTextPreviewEl && typeof scrollRatioForElement === "function" && typeof setElementScrollRatio === "function") {
    setElementScrollRatio(teachTextPreviewEl, scrollRatioForElement(teachTextBodyInput));
  }
  layoutReviewDeskWithManuscript();
  requestAnimationFrame(layoutReviewDeskWithManuscript);
  setStatus(t("ready"));
}

function layoutReviewDeskWithManuscript() {
  const teachWin = getWindow("teachText");
  const reviewWin = getWindow("reviewDesk");
  const desktop = document.querySelector(".desktop");
  if (!teachWin || !reviewWin || !desktop) return;

  const padding = 18;
  const gap = 12;
  const top = 28;
  const bottom = 18;
  const avoidance = typeof getDesktopAvoidanceInsets === "function"
    ? getDesktopAvoidanceInsets({ margin: padding, iconGap: 48 })
    : { left: padding, right: padding };
  const iconColumn = document.querySelector(".icon-column");
  const iconRect = iconColumn?.getBoundingClientRect();
  const iconGutter = iconRect && iconRect.width > 0 ? iconRect.width + 48 : 0;
  const availableWidth = Math.max(320, desktop.clientWidth - avoidance.left - avoidance.right - iconGutter - padding);
  const availableHeight = Math.max(360, desktop.clientHeight - top - bottom);
  const left = avoidance.left;
  const sideBySide = availableWidth >= 980;

  [teachWin, reviewWin].forEach((win) => {
    win.classList.remove("is-collapsed");
    win.style.right = "auto";
    win.style.maxWidth = "";
    win.style.maxHeight = "";
    win.style.transform = "none";
    win.dataset.zoomed = "false";
  });

  if (sideBySide) {
    const width = Math.floor((availableWidth - gap) / 2);
    Object.assign(teachWin.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${availableHeight}px`,
    });
    Object.assign(reviewWin.style, {
      left: `${left + width + gap}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${availableHeight}px`,
    });
  } else {
    const height = Math.floor((availableHeight - gap) / 2);
    Object.assign(teachWin.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${availableWidth}px`,
      height: `${height}px`,
    });
    Object.assign(reviewWin.style, {
      left: `${left}px`,
      top: `${top + height + gap}px`,
      width: `${availableWidth}px`,
      height: `${height}px`,
    });
  }
}

function reviewDeskReportMarkdown() {
  const markdown = (teachTextBodyInput.value || reviewDeskBodyInput?.value || "").trim();
  if (!markdown) return null;
  const baseName = teachTextNameInput.value || markdownDocumentTitle(markdown) || t("review_desk");
  return { markdown, name: `${baseName} Reviewed` };
}

async function exportReviewDeskReport() {
  if (!ensureTeachTextReviewState({ promoteSavedFinal: true, openTeachText: false })) {
    if ((reviewDeskBodyInput?.value || teachTextBodyInput?.value || "").trim()) {
      setTeachTextWorkflowState("final");
      syncTeachTextLabelControl();
    } else {
      setStatus(t("review_export_empty"));
      return;
    }
  }
  if (!syncReviewDeskToTeachText()) return;
  const report = reviewDeskReportMarkdown();
  if (!report) {
    setStatus(t("review_export_empty"));
    return;
  }

  const item = await addProjectCdItem(report.markdown, report.name, {
    sourceDocumentId: activeTextFileId || "",
    sourceKind: "markdown",
  });
  if (!item) return;
  markTeachTextExported("markdown");
  openWindow("projectCd");
  setStatus(t("export_saved", item.title));
}

async function exportTeachTextToProjectCd() {
  const isSlidesMarkdown = typeof readerHasMarpFrontmatter === "function" && readerHasMarpFrontmatter(teachTextBodyInput?.value || "");
  const finalManuscript = typeof teachTextWorkflowState !== "undefined"
    && teachTextWorkflowState === "final"
    && String(teachTextBodyInput?.value || "").trim().length > 0;
  if (
    !isSlidesMarkdown
    && typeof isTeachTextManuscriptRole === "function"
    && !isTeachTextManuscriptRole()
    && !finalManuscript
  ) {
    setStatus(t("teachtext_manuscript_required"));
    return;
  }
  const { markdown, name } = getTeachTextMarkdown({ originalImages: true });
  if (!markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return;
  }
  const item = await addProjectCdItem(markdown, name, {
    sourceDocumentId: activeTextFileId || "",
    sourceKind: "markdown",
  });
  if (!item) return;
  markTeachTextExported("markdown");
  openWindow("projectCd");
  setStatus(t("export_saved", item.title));
}

async function printMarkdownToSlidesFromMenu() {
  await ensureSlidesExportModule();
  printActiveMarkdownToSlides();
}

async function printMarkdownToSlidesAiFromMenu() {
  await ensureSlidesExportModule();
  printActiveMarkdownToSlidesAi();
}

async function generateMarpAndOpenClioStageFromMenu() {
  await ensureSlidesExportModule();
  generateMarpMarkdownAndOpenClioStage();
}

async function openClioStageApp(source = null) {
  await ensureClioStageModule();
  let clioSource = source;
  if (!clioSource) {
    const activeName = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "";
    if (activeName === "teachText" && readerHasMarpFrontmatter(teachTextBodyInput?.value || "")) {
      clioSource = {
        title: getTeachTextDocumentName({ fallback: t("clio_stage_label") }),
        markdown: teachTextBodyInput.value,
        sourceKind: "teachText",
        sourceItemId: activeTextFileId || "",
      };
    } else if (activeName === "reader" && currentReaderPage?.text && readerHasMarpFrontmatter(currentReaderPage.text)) {
      clioSource = {
        title: currentReaderPage.fileName || currentReaderPage.title || t("clio_stage_label"),
        markdown: currentReaderPage.text,
        sourceKind: "reader",
        sourceItemId: currentReaderPage.fileName || currentReaderPage.url || "",
      };
    } else if (activeName === "projectCd" && typeof getSelectedProjectCdItem === "function") {
      const item = getSelectedProjectCdItem();
      if (item?.body && readerHasMarpFrontmatter(item.body)) {
        clioSource = {
          title: item.title || "slides.md",
          markdown: item.body,
          sourceKind: "projectCd",
          sourceItemId: item.id,
        };
      }
    }
  }
  window.AISystem6ClioStage?.open(clioSource || null);
}

async function openClioChartApp(source = null) {
  if (typeof ensureClioChartModule === "function") {
    await ensureClioChartModule();
  }
  await window.AISystem6ClioChart?.open?.(source || null);
}

async function runClioChartMenuCommand(command) {
  if (typeof ensureClioChartModule === "function") {
    await ensureClioChartModule();
  }
  const chart = window.AISystem6ClioChart;
  if (!chart?.open) return;
  if (command === "import") {
    openTransientFilePicker({
      accept: ".csv,.tsv,.md,.markdown,.txt,text/csv,text/markdown,text/plain",
      multiple: false,
      onSelect: (files) => chart.importFiles?.(files),
    });
    return;
  }
  if (command === "hand-back") return chart.handBack?.();
  if (command.startsWith("new:")) return chart.newFromTemplate?.(command.slice(4));
  if (command === "save-template") return chart.saveTemplate?.();
  if (command === "presentation") return chart.togglePresentation?.();
  if (command === "send-stage") return chart.sendToStage?.();
  if (command === "reverse-sort") return chart.reverseSort?.();
  if (command === "lower-better") return chart.toggleColumnLower?.();
  if (["bars", "matrix", "trace", "grid", "score", "source"].includes(command)) return chart.setProjection?.(command);
  return chart.ask?.(command);
}

// TeachText hands one table block over to ClioChart; the block goes read-only
// in the draft until it is handed back, so only one surface can edit it.
async function seeSelectedTableAsChart() {
  if (typeof ensureClioChartModule === "function") {
    await ensureClioChartModule();
  }
  await window.AISystem6ClioChart?.openFromTeachText?.();
}

async function openLiquidCover() {
  if (typeof ensureLiquidCoverModule === "function") {
    await ensureLiquidCoverModule();
  }
  await window.AISystem6LiquidCover?.open();
}

async function openQuickDraft() {
  if (typeof ensureQuickDraftModule === "function") {
    await ensureQuickDraftModule();
  }
  await window.AISystem6QuickDraft?.open();
}

async function enterWritingStudioFromQuickDraft() {
  if (typeof ensureQuickDraftModule === "function") {
    await ensureQuickDraftModule();
  }
  const saved = await window.AISystem6QuickDraftRuntime?.flushPendingQuickDraftCommit?.();
  if (saved === false) {
    window.AISystem6QuickDraftRuntime?.setQuickDraftStatus?.(t("quick_draft_save_failed"));
    return false;
  }
  await openWritingStudio();
  return true;
}

async function importQuickDraftChatRecords() {
  if (typeof ensureQuickDraftModule === "function") {
    await ensureQuickDraftModule();
  }
  await window.AISystem6QuickDraft?.importChatScreenshots?.();
}

async function runQuickDraftMenuCommand(command) {
  await ensureQuickDraftModule?.();
  const quickDraft = window.AISystem6QuickDraft;
  if (!quickDraft) return;
  if (command === "vent-on") return quickDraft.setVentMode?.(true);
  if (command === "vent-off") return quickDraft.setVentMode?.(false);
  if (command === "vent-summary") return quickDraft.collectVentOutline?.();
  if (command === "compose") return quickDraft.startWritingNow?.();
  if (command === "apply") return quickDraft.applyAdjustments?.();
  if (command === "develop") return quickDraft.develop?.();
  if (command === "view-body") return quickDraft.setDisplayMode?.("body");
  if (command === "view-grain") return quickDraft.setDisplayMode?.("grain");
  if (command === "view-read") return quickDraft.setDisplayMode?.("read");
  if (command === "toggle-materials") return quickDraft.togglePanel?.("shelf");
  if (command === "toggle-adjustments") return quickDraft.togglePanel?.("inspector");
  if (command === "save-project") return quickDraft.saveQuickDraftAsProjectDocument?.();
  if (command === "copy-markdown") return quickDraft.copyMarkdown?.();
  if (command === "send-teachtext") return quickDraft.transferQuickDraftToTeachText?.();
  if (command === "send-review") return quickDraft.sendQuickDraftToReviewDesk?.();
  return quickDraft.runClioTalkAction?.(command);
}

async function runClioStageMenuCommand(command) {
  await ensureClioStageModule?.();
  const stage = window.AISystem6ClioStage;
  if (!stage) return;
  if (command === "import") {
    openTransientFilePicker({
      accept: ".md,.markdown,.txt,text/markdown,text/plain",
      multiple: true,
      onSelect: (files) => importClioStageDroppedFiles(files),
    });
    return;
  }
  if (command === "previous") return stage.previous?.();
  if (command === "next") return stage.next?.();
  if (["source", "document", "slide", "cue"].includes(command)) return stage.setMode?.(command);
}

async function runLiquidCoverMenuCommand(command) {
  await ensureLiquidCoverModule?.();
  return window.AISystem6LiquidCover?.runMenuCommand?.(command);
}

async function runCmfMenuCommand(command) {
  await ensureCmfStudioModule?.();
  return window.AISystem6CMFStudio?.runMenuCommand?.(command);
}

async function runSoundscapeMenuCommand(command) {
  await ensureSoundscapeModule?.();
  return window.AISystem6Soundscape?.runMenuCommand?.(command);
}

async function dispatchEndfieldMenuCommand(command) {
  await ensureEndfieldTerminalModule?.();
  return window.AISystem6EndfieldTerminal?.runMenuCommand?.(command);
}

async function dispatchTimeMachineMenuCommand(command) {
  await ensureTimeMachineModule?.();
  return window.AISystem6TimeMachine?.runMenuCommand?.(command);
}

async function openTextDocumentFromDisk() {
  if (typeof openTransientFilePicker !== "function" || typeof extractFileText !== "function") return;
  openTransientFilePicker({
    accept: ".txt,.text,.md,.markdown,.mdown,.mkd,text/plain,text/markdown",
    onSelect: async (files) => {
      const file = files[0];
      if (!file) return;
      const extracted = await extractFileText(file);
      await newTextDocument();
      teachTextNameInput.value = file.name.replace(/\.(?:txt|text|md|markdown|mdown|mkd)$/i, "") || t("untitled");
      teachTextBodyInput.value = String(extracted?.text || extracted || "");
      refreshTeachTextDocumentState();
      setTeachTextStatus("modified");
      teachTextBodyInput.focus();
    },
  });
}

function toggleWritingPreviewForActiveWindow() {
  const name = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window;
  if (name === "quickDraft") return window.AISystem6QuickDraft?.togglePreview?.();
  if (name === "questionSheet") return toggleTeachTextSurfacePreview("questionSheet");
  if (name === "outline") return toggleTeachTextSurfacePreview("outline");
  if (name === "sectionDrafts") return toggleTeachTextSurfacePreview("sectionDrafts");
  if (name === "reviewDesk") return toggleReviewDeskPreview();
  if (name === "teachText") return toggleTeachTextPreview();
}

async function openSystemConceptDocMap() {
  try {
    setStatus(currentLanguage === "zh" ? "正在用 AI 生成 AI System 6 基本概念 DocMap..." : "Generating AI System 6 Concepts DocMap with AI...");
    const concepts = await ensureSystemConceptsData();
    await ensureDocMapModule();
    await ensureDocMapMarkmap();
    if (typeof concepts.buildDocMap !== "function") throw new Error("concept_docmap_generator_missing");
    const map = await concepts.buildDocMap(currentLanguage);
    showDocMap(map, {
      focus: true,
      statusMessage: currentLanguage === "zh" ? "AI 已生成 AI System 6 基本概念 DocMap。" : "AI System 6 Concepts DocMap generated.",
    });
  } catch (error) {
    console.warn("AI System 6 concept DocMap generation failed", error);
    setStatus(currentLanguage === "zh"
      ? "无法生成 Concepts DocMap：请先设置 API 或启动 LM Studio 模型。"
      : "Could not generate Concepts DocMap: set up API or start an LM Studio model first.");
  }
}

async function openSystemConceptClioStage() {
  try {
    setStatus(currentLanguage === "zh" ? "正在用 AI 生成 AI System 6 基本概念幻灯片..." : "Generating AI System 6 Concepts Slides with AI...");
    const concepts = await ensureSystemConceptsData();
    if (typeof concepts.buildSlides !== "function") throw new Error("concept_slides_generator_missing");
    const slides = await concepts.buildSlides(currentLanguage);
    await openClioStageApp(slides);
  } catch (error) {
    console.warn("AI System 6 concept slides generation failed", error);
    setStatus(currentLanguage === "zh"
      ? "无法生成 Concepts Slides：请先设置 API 或启动 LM Studio 模型。"
      : "Could not generate Concepts Slides: set up API or start an LM Studio model first.");
  }
}

async function playWritingDemoFromGuide() {
  // The demo is offered by system OOBE, then runs inside Writing Studio.
  if (typeof activateWorkspaceProfile === "function") {
    await activateWorkspaceProfile(workspaceProfileWriting, { openDefault: false, persist: false });
  }
  await ensureWritingDemoModule();
  await window.AISystem6WritingDemo?.play?.();
}

let applicationActionHandlersCache = null;
let applicationCommandRegistryCache = null;

function getApplicationActionHandlers() {
  return applicationActionHandlersCache ||= {
    "open-about": () => openWindow("about"),
    "open-about-multifinder": showAboutMultiFinder,
    "close-about": () => closeWindow("about"),
    "open-github-repo": () => window.open("https://github.com/surfine/AI-System-6", "_blank", "noopener"),
    "close-print-directory": () => closeWindow("printDirectory", true),
    "close-page-setup": () => closeWindow("pageSetup", true),
    "page-setup": openPageSetup,
    "print-current": printCurrentTeachTextDocument,
    "open-guide": () => openWindow("guide"),
    "open-guide-promo": () => window.open("https://www.bilibili.com/video/BV1ht3m6UEDb/", "_blank", "noopener"),
    "open-system-file-system": () => showSystemModal(t("system_file_not_openable"), "alert"),
    "open-system-file-finder": () => showSystemModal(t("system_file_not_openable"), "alert"),
    "open-system-file-multifinder": () => showSystemModal(t("system_file_not_openable"), "alert"),
    "open-system-file-da-handler": () => showSystemModal(t("system_file_not_openable"), "alert"),
    "open-system-folder-path": ({ systemFolderPath = "" } = {}) => navigateSystemFolderPath(systemFolderPath),
    "open-applications-folder-path": ({ applicationsFolderPath = "" } = {}) => navigateApplicationsFolderPath(applicationsFolderPath),
    "open-system-prompt-file": ({ promptId = "writing-tools.proofread" } = {}) => {
      if (!activeProjectId) {
        setStatus(t("no_project_mounted"));
        openWindow("projects");
        return;
      }
      const file = window.AISystem6PromptFilesRuntime?.ensureProjectPromptOverrideForEditing(activeProjectId, promptId);
      if (!file) {
        setStatus(currentLanguage === "zh" ? "该系统提示词只读，或提示词文件缺失。" : "This system prompt is read-only or missing.");
        return;
      }
      selectedChatFileId = file.id;
      activeTextFileId = file.id;
      openTextFile(file.id);
      saveDeskState?.();
    },
    "open-system-help": async () => {
      await ensureSystemDictionaryData();
      await ensureDictionaryHelpModule();
      openSystemHelpEntry(selectedSystemHelpEntryId || "system-help");
    },
    "reveal-active-chat-file": () => {
      const fileId = activeChatFileId || selectedChatFileId;
      if (!fileId || !revealChatFileInFinder(fileId)) setStatus(t("no_project_mounted"));
    },
    "start-new-clio-chat": startNewClioTalkConversation,
    "start-temporary-clio-chat": startTemporaryClioTalkConversation,
    "open-chat-file": ({ fileId = "" } = {}) => openChatFileWindow(fileId),
    "remember-chat-as-project-memory": async () => {
      const file = await createProjectMemoryDraft();
      if (file) setStatus(currentLanguage === "zh" ? "项目记忆已确认并保存。" : "Project memory confirmed and saved.");
    },
    "toggle-project-memory": () => {
      if (!toggleSelectedProjectMemory()) setStatus(t("select_finder_item_first"));
    },
    "attach-retrospective-next-task": () => {
      if (!attachSelectedRetrospectiveToNextTask()) return setStatus(t("select_finder_item_first"));
      setStatus(currentLanguage === "zh" ? "复盘已附加到下一次任务。" : "Retrospective attached to the next task.");
    },
    "create-skill-draft-from-retrospective": async () => {
      if (!selectedChatFileId) return setStatus(t("select_finder_item_first"));
      await createSkillDraftFromSelectedRetrospective();
    },
    "create-project-skill-from-draft": async () => {
      if (!await createProjectSkillFromSelectedDraft()) setStatus(t("select_finder_item_first"));
    },
    "toggle-project-skill": () => {
      if (!toggleSelectedProjectSkill()) setStatus(t("select_finder_item_first"));
    },
    "configure-skill-auto-call": async () => {
      if (!await configureSkillAutoCall()) setStatus(t("no_project_mounted"));
    },
    "disable-auto-called-skill": async () => {
      if (!await disableAutoCalledSkillFromSelectedReceipt()) setStatus(t("select_finder_item_first"));
    },
    "view-modification-suggestion-diff": async () => {
      if (!await viewSelectedTeachTextModificationSuggestionDiff()) setStatus(t("select_finder_item_first"));
    },
    "accept-modification-suggestion": async () => {
      if (!await acceptSelectedTeachTextModificationSuggestion()) setStatus(t("select_finder_item_first"));
    },
    "reject-modification-suggestion": () => {
      if (!rejectSelectedTeachTextModificationSuggestion()) setStatus(t("select_finder_item_first"));
    },
    "create-task-config-from-draft": () => {
      if (!createTaskConfigFromSelectedDraft()) setStatus(t("select_finder_item_first"));
    },
    "run-task-config": async () => {
      if (!await runSelectedTaskConfig()) setStatus(currentLanguage === "zh" ? "任务配置无效、缺少文件或技能不可用。" : "Task Config is invalid, missing files, or has unavailable Skills.");
    },
    "pause-task-config": () => { if (!setTaskConfigLifecycle("paused")) setStatus(t("select_finder_item_first")); },
    "complete-task-config": () => {
      if (!setTaskConfigLifecycle("completed")) return setStatus(t("select_finder_item_first"));
      saveClioTalkRetrospective();
    },
    "resume-task-config": () => { if (!resumeSelectedTaskConfig()) setStatus(t("select_finder_item_first")); },
    "cancel-task-config": () => { if (!setTaskConfigLifecycle("cancelled")) setStatus(t("select_finder_item_first")); },
    "create-task-checkpoint": () => { if (!createTaskCheckpoint()) setStatus(t("select_finder_item_first")); },
    "restore-task-checkpoint": async () => { if (!await restoreSelectedTaskCheckpoint()) setStatus(t("select_finder_item_first")); },
    "install-mounted-skill": async () => {
      if (!await installMountedSkillPackage()) setStatus(currentLanguage === "zh" ? "技能包无效或未选择。" : "Skill package is invalid or not selected.");
    },
    "preview-mounted-skill": async () => {
      if (!await previewMountedSkillPackage()) setStatus(currentLanguage === "zh" ? "技能包无效或未选择。" : "Skill package is invalid or not selected.");
    },
    "open-project-disks": () => {
      openWindow("projects");
      if (!isProjectMounted) setStatus(t("no_project_mounted"));
    },
    "open-droplet": ({ dropletId = "" } = {}) => {
      const command = typeof getScriptableCommand === "function" ? getScriptableCommand(dropletId) : null;
      const name = command && typeof dropletName === "function"
        ? dropletName(command)
        : t("droplet");
      showSystemModal(t("droplet_open_explainer", name), "alert");
    },
    "open-project-info": openProjectInfo,
    "open-file-info": openFileInfo,
    "eject-project": ejectActiveProject,
    "eject-menu-selection": ejectMenuSelection,
    "set-startup-project": setStartupProjectFromSelection,
    "new-project-disk": prepareNewProjectDisk,
    "open-project-disk": openSelectedProject,
    "duplicate-project-disk": duplicateSelectedProjectDisk,
    "archive-project-disk": archiveSelectedProjectDisk,
    "rename-project-disk": renameSelectedProject,
    "dismiss-guide": dismissGuide,
    "guide-open-model-settings": openGuideModelSettings,
    "open-clio-model-settings": openModelSettings,
    "guide-start-route": startGuidedWritingRoute,
    "play-writing-demo": playWritingDemoFromGuide,
    "open-read-me": () => openSystemFolderDocument("readMe"),
    "open-flow-readme": () => openSystemFolderDocument("flow"),
    "open-memory-readme": () => openSystemFolderDocument("memory"),
    "open-system-concepts-docmap": openSystemConceptDocMap,
    "open-system-concepts-clio-stage": openSystemConceptClioStage,
    "new-document": newTextDocument,
    "open-text-document": openTextDocumentFromDisk,
    "new-folder": createFolderFromMenu,
    "open-menu-selection": openFinderMenuSelection,
    "duplicate-selection": duplicateFinderMenuSelection,
    "open-assistant": () => openWindow("assistant"),
    "open-writing-studio": openWritingStudio,
    "exit-writing-studio": exitWritingStudio,
    "open-quick-draft": openQuickDraft,
    "quick-draft-open-writing-studio": enterWritingStudioFromQuickDraft,
    "quick-draft-import-chat": importQuickDraftChatRecords,
    "quick-draft-vent-on": () => runQuickDraftMenuCommand("vent-on"),
    "quick-draft-vent-off": () => runQuickDraftMenuCommand("vent-off"),
    "quick-draft-vent-summary": () => runQuickDraftMenuCommand("vent-summary"),
    "quick-draft-compose": () => runQuickDraftMenuCommand("compose"),
    "quick-draft-apply": () => runQuickDraftMenuCommand("apply"),
    "quick-draft-develop": () => runQuickDraftMenuCommand("develop"),
    "quick-draft-view-body": () => runQuickDraftMenuCommand("view-body"),
    "quick-draft-view-grain": () => runQuickDraftMenuCommand("view-grain"),
    "quick-draft-view-read": () => runQuickDraftMenuCommand("view-read"),
    "quick-draft-toggle-materials": () => runQuickDraftMenuCommand("toggle-materials"),
    "quick-draft-toggle-adjustments": () => runQuickDraftMenuCommand("toggle-adjustments"),
    "quick-draft-toggle-sideask": toggleQuickDraftSideAsk,
    "quick-draft-talk-points": () => runQuickDraftMenuCommand("organize"),
    "quick-draft-mingming": () => runQuickDraftMenuCommand("mingming"),
    "quick-draft-luoluo": () => runQuickDraftMenuCommand("luoluo"),
    "quick-draft-hkrr": () => runQuickDraftMenuCommand("hkrr"),
    "quick-draft-praise": () => runQuickDraftMenuCommand("praise"),
    "quick-draft-save-project": () => runQuickDraftMenuCommand("save-project"),
    "quick-draft-copy-markdown": () => runQuickDraftMenuCommand("copy-markdown"),
    "quick-draft-send-teachtext": () => runQuickDraftMenuCommand("send-teachtext"),
    "quick-draft-send-review": () => runQuickDraftMenuCommand("send-review"),
    "open-writing-bell": () => openWindow("writingBell"),
    "open-note-pad": () => openWindow("notePad"),
    "open-clipboard": () => {
      renderClipboard();
      openWindow("clipboard");
    },
    "open-alarm-clock": () => openWindow("alarmClock"),
    "open-calculator": () => openWindow("calculator"),
    "open-bureaucracy-meme": () => openWindow("bureaucracyMeme"),
    "open-endfield-terminal": () => openWindow("endfieldTerminal"),
    "open-image-manager": () => openWindow("imageManager"),
    "open-puzzle": () => openWindow("puzzle"),
    "open-memory-cards": () => openWindow("memoryCards"),
    "open-key-caps": () => openWindow("keyCaps"),
    "open-model-meter": () => openWindow("modelMeter"),
    "open-system-status": () => openWindow("systemStatus"),
    "open-notification-center": () => openWindow("notificationCenter"),
    "clear-notifications": clearSystemNotifications,
    "open-dictation": invokeIntentKey,
    "open-translation-pad": () => openTranslationPad(),
    "intent-key": invokeIntentKey,
    "open-rebuild-flow": openRebuildFlow,
    "rebuild-use-reader": useReaderForRebuildFlow,
    "rebuild-use-teachtext": useTeachTextForRebuildFlow,
    "rebuild-use-clipboard": useClipboardForRebuildFlow,
    "rebuild-use-sample": useSampleArticleForRebuildFlow,
    "run-rebuild-flow": runRebuildFlow,
    "close-rebuild-flow": () => closeWindow("rebuildFlow", true),
    "toggle-compose-tools": toggleComposeToolsMenu,
    "open-question-sheet": openQuestionSheetSurface,
    "open-teachtext-manuscript": openTeachTextManuscriptWindow,
    "open-document-versions": () => openDocumentVersions(),
    "versions-compare": () => compareSelectedDocumentVersions(),
    "versions-restore": () => restoreSelectedDocumentVersion(),
    "open-outline": openOutlineSurface,
    "open-section-drafts": openSectionDrafts,
    "open-claim-check": () => openReviewDesk("facts"),
    "open-review-desk": () => openReviewDesk("style"),
    "open-docmap": async () => {
      // The tabbed open path lives in the lazy DocMap module. Awaiting the
      // load before choosing the path means the icon always opens the real
      // tabbed surface instead of an empty window whose toolbar commands are
      // all disabled (the pre-split fallback raced the lazy load and won).
      await ensureDocMapModule();
      if (typeof openDocMapWindowWithTabs === "function") {
        openDocMapWindowWithTabs();
        return;
      }
      openWindow("docMap");
    },
    "open-clio-stage": openClioStageApp,
    "open-clio-chart": openClioChartApp,
    "see-as-chart": seeSelectedTableAsChart,
    "open-liquid-cover": openLiquidCover,
    "open-cmf-studio": () => openWindow("cmfStudio"),
    "open-soundscape": () => openWindow("soundscape"),
    "open-dictionary": () => openWindow("dictionary"),
    "open-style-sheet": () => openReviewDesk("style"),
    "generate-outline": generateOutline,
    "organize-question-sheet": organizeQuestionSheet,
    "open-writing-flow-windows": openWritingFlowWindows,
    "toggle-question-preview": () => toggleTeachTextSurfacePreview("questionSheet"),
    "toggle-writing-preview": toggleWritingPreviewForActiveWindow,
    "insert-question-template": insertQuestionTemplate,
    "advance-question-to-outline": advanceQuestionSheetToOutline,
    "add-outline-section": addOutlineSection,
    "critique-outline": () => runOutlineOperation("critique"),
    "expand-outline": expandOutline,
    "mingming-outline": () => runOutlineOperation("mingming"),
    "reduce-outline": () => runOutlineOperation("reduce"),
    "structure-outline": () => runOutlineOperation("structure"),
    "advance-outline-to-drafts": advanceOutlineToSectionDrafts,
    "toggle-outline-preview": () => toggleTeachTextSurfacePreview("outline"),
    "draft-selected-section": draftSelectedOutlineSection,
    "draft-current-section": draftSelectedOutlineSection,
    "toggle-draft-preview": () => toggleTeachTextSurfacePreview("sectionDrafts"),
    "previous-section-draft": () => showAdjacentSectionDraft(-1),
    "next-section-draft": () => showAdjacentSectionDraft(1),
    "revise-draft": polishDraft,
    "polish-draft": polishDraft,
    "suggest-draft": suggestDraft,
    "advance-drafts-to-review": advanceDraftsToReview,
    "run-claim-check": runClaimCheckFromMenu,
    "run-claim-check-section": () => runClaimCheck({ sectionOnly: true }),
    "review-style-section": runReviewDeskStyleSectionCheck,
    "review-facts-section": runReviewDeskFactSectionCheck,
    "review-facts-section-online": () => runClaimCheck({ sectionOnly: true, online: true }),
    "review-facts-online": () => runClaimCheck({ online: true }),
    "review-hkrr-section": runReviewDeskHkrrSectionCheck,
    "review-mingming-section": reviewSectionAsMingming,
    "review-mingming-handoff": runReviewDeskMingmingHandoffReview,
    "review-mingming-handoff-backstage": runReviewDeskMingmingHandoffBackstageReview,
    "review-view-manuscript": viewReviewDeskManuscript,
    "review-export": exportReviewDeskReport,
    "previous-claim-section": () => showAdjacentClaimCheckSection(-1),
    "next-claim-section": () => showAdjacentClaimCheckSection(1),
    "ai-critique": () => printTeachTextToAi("critique"),
    "ai-praise": () => getWindow("reviewDesk")?.classList.contains("is-active") ? praiseReviewDeskText() : printTeachTextToAi("praise"),
    "ai-digest": () => printTeachTextToAi("digest"),
    "ai-continue": () => printTeachTextToAi("continue"),
    "ai-transform": () => printTeachTextToAi("describeChange"),
    "ai-describe-change": () => printTeachTextToAi("describeChange"),
    "ai-proofread": () => printTeachTextToAi("proofread"),
    "ai-rewrite": () => printTeachTextToAi("rewrite"),
    "ai-friendly": () => printTeachTextToAi("friendly"),
    "ai-professional": () => printTeachTextToAi("professional"),
    "ai-concise": () => printTeachTextToAi("concise"),
    "ai-summary": () => printTeachTextToAi("summary"),
    "ai-key-points": () => printTeachTextToAi("keyPoints"),
    "ai-list": () => printTeachTextToAi("list"),
    "ai-table": () => printTeachTextToAi("table"),
    "print-to-ai": () => printTeachTextToAi("proofread"),
    "open-teachtext": openTeachTextForWorkspace,
    "new-text-document": createTeachTextFileFromFinder,
    "duplicate-file": duplicateActiveFile,
    "rename-file": renameActiveFile,
    "move-file-trash": moveActiveFileToTrash,
    "copy-active-markdown": copyActiveMarkdown,
    "download-active-markdown": downloadActiveMarkdown,
    "download-active-bilingual-markdown": downloadActiveBilingualMarkdown,
    "print-to-slides": printMarkdownToSlidesFromMenu,
    "ai-print-to-slides": printMarkdownToSlidesAiFromMenu,
    "generate-marp-open-clio-stage": generateMarpAndOpenClioStageFromMenu,
    "toggle-teachtext-preview": () => {
      openWindow("teachText");
      toggleTeachTextPreview();
    },
    "export-teachtext-project-cd": exportTeachTextToProjectCd,
    "toggle-review-preview": toggleReviewDeskPreview,
    "translate-teachtext": () => {
      openWindow("teachText");
      translateTeachTextDocument();
    },
    "selection-look-up": () => runSelectionServiceCommand("lookup"),
    "selection-find-sources": () => runSelectionServiceCommand("find"),
    "selection-copy": () => runSelectionServiceCommand("copy"),
    "selection-clip": () => runSelectionServiceCommand("clip"),
    "selection-clip-file": () => runSelectionServiceCommand("clip-file"),
    "selection-translate": () => runSelectionServiceCommand("translate"),
    "selection-new-note": () => runSelectionServiceCommand("note"),
    "selection-ask-assistant": () => runSelectionServiceCommand("ask"),
    "make-alias": () => withFinderObjects(() => makeAliasForFinderSelection()),
    "make-docmap": makeDocMapFromFinderOrCurrent,
    "make-docmap-selection": () => makeDocMapForRange("selection"),
    "make-docmap-source": () => makeDocMapForRange("source"),
    "style-check-teachtext": runStyleCheckFromMenu,
    "style-check-section": () => runTeachTextStyleCheck({ sectionOnly: true }),
    "style-check-manuscript": () => runTeachTextStyleCheck({ fullDocument: true }),
    "previous-style-section": () => showAdjacentStyleCheckSection(-1),
    "next-style-section": () => showAdjacentStyleCheckSection(1),
    "clip-teachtext-selection": () => {
      openWindow("teachText");
      clipTeachTextSelectionToScrapbook();
    },
    "open-applications": () => openWindow("applications"),
    "open-help-folder": () => openWindow("helpFolder"),
    "open-control-strip-modules": () => openWindow("controlStripModules"),
    "open-control-strip-module": ({ controlStripModuleId }) => {
      ensureControlStripModulesFolderModule()
        .then(() => window.AISystem6ControlStripModulesFolder?.openModule?.(controlStripModuleId))
        .catch((error) => console.warn("Control Strip Modules folder unavailable.", error));
    },
    "open-project-cd": () => openWindow("projectCd"),
    "open-import-utility": () => openWindow("importUtility"),
    "open-project-backup": openProjectBackupPanel,
    "open-chooser": () => openWindow("chooser"),
    "open-control": () => openWindow("control"),
    "open-rag": () => openWindow("rag"),
    "open-find-path": () => {
      const selection = teachTextBodyInput.value.slice(teachTextBodyInput.selectionStart || 0, teachTextBodyInput.selectionEnd || 0).trim();
      if (selection && !findPathQueryInput.value.trim()) {
        findPathQueryInput.value = selection;
      }
      renderFindPathResults();
      openWindow("findPath");
      findPathQueryInput.focus();
    },
    "open-find-file": () => {
      renderFindFileResults();
      openWindow("findFile");
      findFileQueryInput?.focus();
    },
    "open-selected-find-file": openSelectedFindFileResult,
    "reveal-selected-find-file": revealSelectedFindFileResult,
    "open-reader": () => {
      if (typeof openReaderWindowWithTabs === "function") {
        openReaderWindowWithTabs();
        return;
      }
      openWindow("reader");
      readerUrlInput.focus();
    },
    "reader-open-source": handleReaderOpenButton,
    "reader-clip": clipReaderSelection,
    "reader-clip-translate": clipReaderSelectionWithTranslation,
    "reader-send-manuscript": sendReaderCopyToManuscript,
    "reader-make-docmap": () => makeDocMapForRange("auto"),
    "reader-docmap-selection": () => {
      const context = readerSelectionContext();
      if (!context) return setStatus(t("select_text_first"));
      return makeDocMapForRange("selection", context);
    },
    "reader-docmap-source": () => makeDocMapForRange("source"),
    "reader-find-sources": runReaderFindSources,
    "reader-open-clio-stage": openCurrentReaderInClioStage,
    "clio-stage-docmap": async () => {
      await ensureClioStageModule();
      if (typeof makeClioStageDocMap === "function") makeClioStageDocMap();
    },
    "focus-reader-question": () => readerQuestionInput?.focus(),
    "open-time-machine": () => dispatchTimeMachineMenuCommand("open"),
    "time-machine-new-tab": () => dispatchTimeMachineMenuCommand("new-tab"),
    "time-machine-close-tab": () => dispatchTimeMachineMenuCommand("close-tab"),
    "time-machine-back": () => dispatchTimeMachineMenuCommand("back"),
    "time-machine-forward": () => dispatchTimeMachineMenuCommand("forward"),
    "time-machine-stop": () => dispatchTimeMachineMenuCommand("stop"),
    "time-machine-refresh": () => dispatchTimeMachineMenuCommand("refresh"),
    "time-machine-switch-source": () => dispatchTimeMachineMenuCommand("switch-source"),
    "time-machine-toggle": () => dispatchTimeMachineMenuCommand("toggle"),
    "time-machine-web-view": () => dispatchTimeMachineMenuCommand("web-view"),
    "time-machine-reader-view": () => dispatchTimeMachineMenuCommand("reader-view"),
    "time-machine-preserve-wayback": () => dispatchTimeMachineMenuCommand("preserve-wayback"),
    "time-machine-preserve-archive-is": () => dispatchTimeMachineMenuCommand("preserve-archive-is"),
    "time-machine-clip": () => dispatchTimeMachineMenuCommand("clip"),
    "time-machine-clip-translate": () => dispatchTimeMachineMenuCommand("clip-translate"),
    "time-machine-docmap": () => dispatchTimeMachineMenuCommand("docmap"),
    "time-machine-docmap-selection": () => dispatchTimeMachineMenuCommand("docmap-selection"),
    "time-machine-docmap-source": () => dispatchTimeMachineMenuCommand("docmap-source"),
    "time-machine-ask": () => dispatchTimeMachineMenuCommand("ask"),
    "time-machine-send-manuscript": () => dispatchTimeMachineMenuCommand("send-manuscript"),
    "clip-selected-find-path": clipSelectedFindPath,
    "open-selected-in-reader": () => {
      if (selectedFindPathIndex === null) {
        setStatus(t("select_find_path_first"));
        return;
      }
      const result = findPathResults[selectedFindPathIndex];
      if (!result?.url) return;
      readerUrlInput.value = result.url;
      openWindow("reader");
      fetchReaderPage();
    },
    "open-text-disk": () => {
      renderMountedTextDisk();
      openWindow("textDisk");
    },
    "open-finder": () => {
      openWindow("finder");
      navigateSystemFolderPath("");
    },
    "open-documents": () => {
      renderDocuments();
      openWindow("documents");
    },
    "open-scrapbook": () => openWindow("scrapbook"),
    "scrapbook-open-source": openSelectedScrapSourceInReader,
    "scrapbook-toggle-translation": toggleScrapTranslationView,
    "scrapbook-insert": insertScrapIntoPrompt,
    "scrapbook-attach": toggleClipAttachment,
    "scrapbook-send-question": sendSelectedScrapsToQuestionSheet,
    "scrapbook-outline": outlineSelectedScraps,
    "scrapbook-export-bilingual": downloadSelectedScrapsBilingualMarkdown,
    "scrapbook-delete": deleteSelectedScrap,
    "focus-scrapbook-question": () => scrapbookQuestionInput?.focus(),
    "focus-search-query": () => findPathQueryInput?.focus(),
    "synthesize-search-results": synthesizeFindPath,
    "copy-search-result-markdown": copySelectedFindPath,
    "insert-search-result": insertFindPathIntoTeachText,
    "clio-chart-import": () => runClioChartMenuCommand("import"),
    "clio-chart-hand-back": () => runClioChartMenuCommand("hand-back"),
    "clio-chart-new-cpu-gpu": () => runClioChartMenuCommand("new:cpu-gpu"),
    "clio-chart-new-gaming": () => runClioChartMenuCommand("new:gaming"),
    "clio-chart-new-battery-power": () => runClioChartMenuCommand("new:battery-power"),
    "clio-chart-new-noise-heat": () => runClioChartMenuCommand("new:noise-heat"),
    "clio-chart-new-display": () => runClioChartMenuCommand("new:display"),
    "clio-chart-new-rating": () => runClioChartMenuCommand("new:rating"),
    "clio-chart-new-blank": () => runClioChartMenuCommand("new:blank"),
    "clio-chart-save-template": () => runClioChartMenuCommand("save-template"),
    "clio-chart-bars": () => runClioChartMenuCommand("bars"),
    "clio-chart-matrix": () => runClioChartMenuCommand("matrix"),
    "clio-chart-trace": () => runClioChartMenuCommand("trace"),
    "clio-chart-grid": () => runClioChartMenuCommand("grid"),
    "clio-chart-score": () => runClioChartMenuCommand("score"),
    "clio-chart-source": () => runClioChartMenuCommand("source"),
    "clio-chart-presentation": () => runClioChartMenuCommand("presentation"),
    "clio-chart-send-stage": () => runClioChartMenuCommand("send-stage"),
    "clio-chart-reverse-sort": () => runClioChartMenuCommand("reverse-sort"),
    "clio-chart-lower-better": () => runClioChartMenuCommand("lower-better"),
    "clio-chart-read": () => runClioChartMenuCommand("read"),
    "clio-chart-outliers": () => runClioChartMenuCommand("outliers"),
    "clio-chart-gaps": () => runClioChartMenuCommand("gaps"),
    "clio-chart-write-up": () => runClioChartMenuCommand("write-up"),
    "clio-stage-import": () => runClioStageMenuCommand("import"),
    "clio-stage-previous": () => runClioStageMenuCommand("previous"),
    "clio-stage-next": () => runClioStageMenuCommand("next"),
    "clio-stage-source": () => runClioStageMenuCommand("source"),
    "clio-stage-document": () => runClioStageMenuCommand("document"),
    "clio-stage-slide": () => runClioStageMenuCommand("slide"),
    "clio-stage-cue": () => runClioStageMenuCommand("cue"),
    "focus-clio-stage-question": () => document.querySelector("#clio-stage-question")?.focus(),
    "cover-choose-background": () => runLiquidCoverMenuCommand("choose-background"),
    "cover-choose-video": () => runLiquidCoverMenuCommand("choose-video"),
    "cover-choose-subject": () => runLiquidCoverMenuCommand("choose-subject"),
    "cover-export-png": () => runLiquidCoverMenuCommand("export-png"),
    "cover-export-video": () => runLiquidCoverMenuCommand("export-video"),
    "cover-add-layer": () => runLiquidCoverMenuCommand("add-layer"),
    "cover-delete-layer": () => runLiquidCoverMenuCommand("delete-layer"),
    "cover-shape-circle": () => runLiquidCoverMenuCommand("shape-circle"),
    "cover-shape-squircle": () => runLiquidCoverMenuCommand("shape-squircle"),
    "cover-shape-capsule": () => runLiquidCoverMenuCommand("shape-capsule"),
    "cover-toggle-focus": () => runLiquidCoverMenuCommand("toggle-focus"),
    "cover-preview-motion": () => runLiquidCoverMenuCommand("preview-motion"),
    "cover-ai-compose": () => runLiquidCoverMenuCommand("ai-compose"),
    "cmf-save-recipe": () => runCmfMenuCommand("save"),
    "cmf-export-usdz": () => runCmfMenuCommand("export"),
    "cmf-shuffle": () => runCmfMenuCommand("shuffle"),
    "cmf-reset": () => runCmfMenuCommand("reset"),
    "cmf-reset-view": () => runCmfMenuCommand("reset-view"),
    "cmf-view-front": () => runCmfMenuCommand("view-front"),
    "cmf-view-back": () => runCmfMenuCommand("view-back"),
    "cmf-view-side": () => runCmfMenuCommand("view-side"),
    "soundscape-choose-local": () => runSoundscapeMenuCommand("choose-local"),
    "soundscape-gamdl-download": () => runSoundscapeMenuCommand("gamdl-download"),
    "soundscape-save-moment": () => runSoundscapeMenuCommand("save-moment"),
    "soundscape-toggle-play": () => runSoundscapeMenuCommand("toggle-play"),
    "soundscape-previous": () => runSoundscapeMenuCommand("previous"),
    "soundscape-next": () => runSoundscapeMenuCommand("next"),
    "soundscape-shuffle": () => runSoundscapeMenuCommand("shuffle"),
    "soundscape-repeat": () => runSoundscapeMenuCommand("repeat"),
    "soundscape-shuffle-on": () => runSoundscapeMenuCommand("shuffle-on"),
    "soundscape-shuffle-off": () => runSoundscapeMenuCommand("shuffle-off"),
    "soundscape-shuffle-songs": () => runSoundscapeMenuCommand("shuffle-songs"),
    "soundscape-shuffle-albums": () => runSoundscapeMenuCommand("shuffle-albums"),
    "soundscape-shuffle-groupings": () => runSoundscapeMenuCommand("shuffle-groupings"),
    "soundscape-repeat-off": () => runSoundscapeMenuCommand("repeat-off"),
    "soundscape-repeat-all": () => runSoundscapeMenuCommand("repeat-all"),
    "soundscape-repeat-one": () => runSoundscapeMenuCommand("repeat-one"),
    "soundscape-reset-style": () => runSoundscapeMenuCommand("reset-style"),
    "soundscape-link-project": () => runSoundscapeMenuCommand("link-project"),
    "endfield-new-session": () => dispatchEndfieldMenuCommand("new-session"),
    "endfield-run-query": () => dispatchEndfieldMenuCommand("run-query"),
    "meme-upload": () => window.AISystem6BureaucracyMeme?.runMenuCommand?.("upload"),
    "meme-download": () => window.AISystem6BureaucracyMeme?.runMenuCommand?.("download"),
    "meme-focus-topic": () => window.AISystem6BureaucracyMeme?.runMenuCommand?.("focus-topic"),
    "meme-generate": () => window.AISystem6BureaucracyMeme?.runMenuCommand?.("generate"),
    "open-trash": () => openWindow("trash"),
    "open-context-panel": () => openWindow("contextPanel"),
    "focus-sideask-source": focusSideAskSource,
    "save-current": saveCurrentWork,
    "save-chat": openSaveChatDialog,
    "save-conversation": openSaveChatDialog,
    "rename-active-chat": renameActiveClioTalkConversation,
    "copy-current-chat-markdown": copyCurrentClioTalkMarkdown,
    "download-current-chat-markdown": downloadCurrentClioTalkMarkdown,
    "find-in-cliotalk": () => findInClioTalkConversation(),
    "find-next-in-cliotalk": findNextInClioTalkConversation,
    "open-clio-attachment-picker": beginClioTalkAttachmentPicker,
    "paste-clio-interview": () => {
      promptInput?.focus();
      return runEditCommand("paste");
    },
    "attach-selected-to-cliotalk": () => attachProjectFileToNextClioTalkRun(),
    "save-clio-harness": saveClioTalkHarness,
    "save-clio-skill": saveClioTalkSkillDraft,
    "use-project-skill-next-task": async () => {
      if (!await selectProjectSkillForNextTask()) setStatus(currentLanguage === "zh" ? "没有可用的已启用技能。" : "No enabled project Skill is available.");
    },
    "suggest-project-skill": async () => {
      await confirmSuggestedProjectSkill(promptInput?.value || lastUserText || "");
    },
    "save-clio-retrospective": saveClioTalkRetrospective,
    "new-note": () => createScrap(null, ""),
    "clip-last-reply": clipLastReplyToScrapbook,
    "insert-last-reply": insertLastReplyIntoTeachText,
    "clear-chat": startNewClioTalkConversation,
    "clip-assistant-selection": clipAssistantSelection,
    "retry-last-message": () => {
      if (lastUserText) submitUserText(lastUserText);
    },
    "stop-generation": stopGeneration,
    // DocMap is lazy, so these stay arrows: the registry is built once on the
    // first action dispatch, and a bare reference would resolve the name before
    // the module exists.
    "docmap-save": () => withDocMap(() => saveCurrentDocMap()),
    "docmap-print-pdf": () => withDocMap(() => printCurrentDocMapPdf()),
    "docmap-send-question": () => withDocMap(() => sendDocMapNodeToQuestionSheet()),
    "docmap-insert-outline": () => withDocMap(() => insertDocMapNodeAsOutline()),
    "docmap-hkrr": () => withDocMap(() => askDocMapHkrrTheoryReview()),
    "focus-docmap-question": () => docMapQuestionInput?.focus(),
    "docmap-layout-tree": () => withDocMap(() => setCurrentDocMapLayout("tree")),
    "docmap-layout-radial": () => withDocMap(() => setCurrentDocMapLayout("radial")),
    "docmap-layout-fishbone": () => withDocMap(() => setCurrentDocMapLayout("fishbone")),
    "docmap-fit-view": () => {
      const docMapWindow = getWindow("docMap");
      // In a SideAsk split the DocMap window already owns its pane; maximizing
      // it would cover the paired assistant. Fit the canvas to the pane.
      if (docMapWindow?.dataset.sideaskRestoreActive !== "true") {
        maximizeWindow(docMapWindow);
      }
      requestAnimationFrame(() => withDocMap(() => fitDocMapCanvasToView()));
    },
    "docmap-zoom-out": () => withDocMap(() => zoomDocMapOut()),
    "docmap-zoom-in": () => withDocMap(() => zoomDocMapIn()),
    "docmap-retry-pending": () => withDocMap(() => retryPendingDocMap()),
    "clear-attached-clips": () => {
      attachedClipIds.clear();
      renderAttachedClips();
      setStatus(t("context_cleared"));
    },
    "empty-trash": emptyActiveProjectTrash,
    "put-away": putAwaySelectedTrashItem,
    "print-directory": openPrintDirectoryPreview,
    "erase-disk": eraseSelectedProjectDisk,
    "reset-system": resetSystemStorage,
    "close-active-window": async () => {
      const active = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden)");
      if (active) {
        await closeWindow(active.dataset.window);
        const next = Array.from(document.querySelectorAll(".window:not(.is-hidden):not(.is-app-hidden)"))
          .sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
        if (next) focusWindow(next);
      }
    },
    "save-copy": () => saveTextDocument({ asCopy: true }),
    "undo": () => runEditCommand("undo"),
    "redo": () => runEditCommand("redo"),
    "cut": () => runEditCommand("cut"),
    "copy": () => runEditCommand("copy"),
    "paste": () => runEditCommand("paste"),
    "clear-edit": () => runEditCommand("delete"),
    "select-all": () => runEditCommand("select-all"),
    "insert-text-disk": insertFileFloppyFromWindow,
    "eject-text-disk": ejectTextDisk,
    "add-text-disk-project": addMountedTextDiskToProject,
    "switch-language": switchLanguage,
    "view-small-icons": () => setActiveViewMode("small-icon"),
    "view-icons": () => setActiveViewMode("icon"),
    "view-by-name": () => setActiveViewMode("name"),
    "view-by-date": () => setActiveViewMode("date"),
    "view-by-size": () => setActiveViewMode("size"),
    "view-by-kind": () => setActiveViewMode("kind"),
    "view-list": () => setActiveViewMode("name"),
    "tile-windows": tileWindows,
    "hide-sidebars": hideSidebars,
    "focus-sideask-source": focusSideAskSource,
    "toggle-sideask": toggleSideAsk,
    "set-theme-classic": () => applyTheme("classic"),
    "set-theme-platinum": () => applyTheme("platinum"),
    "set-theme-liquid-glass": () => applyTheme("liquid-glass"),
    "open-theme-lab": () => openWindow("themeLab"),
    "toggle-balloon-help": toggleBalloonHelp,
    "toggle-writer-mode": toggleWriterMode,
    "restart-system": restartSystem,
    "shut-down-system": shutDownSystem,
    "hide-active-app": () => hideApp(activeAppId),
    "hide-other-apps": hideOtherApps,
    "show-all-apps": showAllApps,
    "bring-app-front": () => bringAppToFront(activeAppId),
    "quit-active-app": () => quitApp(activeAppId),
    "close-save-chat": closeSaveChatDialog,
  };

}

function getApplicationCommandRegistry() {
  if (applicationCommandRegistryCache) return applicationCommandRegistryCache;
  applicationCommandRegistryCache = new Map(
    Object.entries(getApplicationActionHandlers()).map(([action, handler]) => [action, Object.freeze({
      id: action,
      handler,
      isAvailable: () => isWorkspaceActionAllowed(action) && getActionAvailability()[action] !== false,
      shortcut: () => keyboardShortcutRegistry.find((entry) => entry.action === action) || null,
    })])
  );
  return applicationCommandRegistryCache;
}

function handleAction(action, commandContext = {}) {
  if (String(action).startsWith("open-system-folder-path:")) {
    commandContext = { ...commandContext, systemFolderPath: String(action).slice("open-system-folder-path:".length) };
    action = "open-system-folder-path";
  }
  if (String(action).startsWith("open-applications-folder-path:")) {
    commandContext = { ...commandContext, applicationsFolderPath: String(action).slice("open-applications-folder-path:".length) };
    action = "open-applications-folder-path";
  }
  if (String(action).startsWith("open-system-prompt-file:")) {
    commandContext = { ...commandContext, promptId: String(action).slice("open-system-prompt-file:".length) };
    action = "open-system-prompt-file";
  }
  if (String(action).startsWith("open-chat-file:")) {
    commandContext = { ...commandContext, fileId: String(action).slice("open-chat-file:".length) };
    action = "open-chat-file";
  }
  if (String(action).startsWith("open-droplet:")) {
    commandContext = { ...commandContext, dropletId: String(action).slice("open-droplet:".length) };
    action = "open-droplet";
  }
  if (String(action).startsWith("open-control-strip-module:")) {
    commandContext = { ...commandContext, controlStripModuleId: String(action).slice("open-control-strip-module:".length) };
    action = "open-control-strip-module";
  }
  const command = getApplicationCommandRegistry().get(action);
  if (!command?.isAvailable()) {
    updateMenuState();
    return;
  }
  const result = command.handler(commandContext);
  updateMenuState();
  return result;
}

function closeMenus() {
  document.querySelectorAll(".menu.is-open").forEach((menu) => {
    menu.classList.remove("is-open");
  });
  document.querySelectorAll(".menu-item-with-sub.is-open").forEach((item) => {
    item.classList.remove("is-open");
  });
}

function closeTeachTextCommandMenus() {
  document.querySelectorAll(".teachtext-command-menu[open]").forEach((menu) => {
    menu.removeAttribute("open");
  });
}

function runShortcut(event) {
  if (event.defaultPrevented || event.isComposing || !shortcutModifierPressed(event)) return;

  const key = event.key.toLowerCase();
  const shortcutAppId = activeAppId === "writingStudio" ? "teachText" : activeAppId;
  const command = [...getApplicationCommandRegistry().values()].find((record) => {
    const candidate = record.shortcut();
    return candidate
      && candidate.dispatch !== false
      && candidate.key === key
      && !!candidate.shift === !!event.shiftKey
      && !!candidate.option === !!event.altKey
      && (
        candidate.scope === "global"
        || candidate.scope === "application"
        || (Array.isArray(candidate.scope) && candidate.scope.includes(shortcutAppId))
      );
  });
  const shortcut = command?.shortcut();
  if (!command || !shortcut) return;
  if (shortcut.suppressInEditable && getActiveEditableElement()) return;

  event.preventDefault();
  closeMenus();
  handleAction(command.id);
}
