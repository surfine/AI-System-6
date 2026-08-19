// Core runtime module: actions.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

let reviewDeskMode = "style";

const keyboardShortcutRegistry = [
  { id: "new-document", key: "n", action: "new-document", display: "⌘N", labelKey: "new_document", keyCaps: true, scope: ["teachText", "quickDraft"] },
  { id: "new-folder", key: "n", shift: true, action: "new-folder", display: "⇧⌘N", labelKey: "new_folder", keyCaps: true, suppressInEditable: true, scope: ["finder"] },
  // ⌘O means "open what this application opens", so each application claims
  // the key for its own Open command. One shared entry used to cover Finder and
  // TeachText, which meant TeachText's "Open… ⌘O" row printed a key that
  // dispatched Finder's open-menu-selection. Scopes stay disjoint: two entries
  // may share a combination only when no application can reach both.
  // Only Finder suppresses ⌘O while a field is editable: its rows compete with
  // an inline rename box. TeachText and Reader must answer the key with the
  // caret in the document, the way ⌘S already does — getActiveEditableElement()
  // reports TeachText's body whenever that window is in front, so a suppressed
  // ⌘O there would never fire at all.
  { id: "open", key: "o", action: "open-menu-selection", display: "⌘O", labelKey: "open", keyCaps: true, suppressInEditable: true, scope: ["finder"] },
  { id: "open-text-document", key: "o", action: "open-text-document", display: "⌘O", labelKey: "open", scope: ["teachText"] },
  { id: "reader-open-source", key: "o", action: "reader-open-source", display: "⌘O", labelKey: "open_source", scope: ["reader"] },
  { id: "start-new-clio-chat", key: "n", action: "start-new-clio-chat", display: "⌘N", labelKey: "new_conversation", scope: ["clioTalk"] },
  { id: "save", key: "s", action: "save-current", display: "⌘S", labelKey: "save_current", keyCaps: true, scope: ["teachText", "clioTalk", "quickDraft"] },
  { id: "save-copy", key: "s", shift: true, action: "save-copy", display: "⇧⌘S", labelKey: "save_copy", keyCaps: true, scope: ["teachText"] },
  { id: "close-window", key: "w", action: "close-active-window", display: "⌘W", labelKey: "close_window", keyCaps: true, scope: "global" },
  // Holding a thought has to work while the writer is typing, so it claims
  // nothing a text field already uses, and it matches on `code`: with Option
  // held, `key` is whatever the layout composes, which is not "n" everywhere.
  { id: "hold-that-thought", key: "n", code: "KeyN", option: true, action: "hold-that-thought", display: "⌥⌘N", labelKey: "hold_that_thought", keyCaps: true, scope: "global" },
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
  // Deliberately not suppressed in an editable: mid-sentence is exactly when
  // the door goes. Only the holding has a key — coming back is never urgent,
  // and one key equivalent is one chance to collide with the browser's.
  { id: "hold-my-place", key: "p", option: true, action: "hold-my-place", display: "⌥⌘P", labelKey: "held_place_hold", keyCaps: true, scope: "global" },
  { id: "clio-chart-view-1", key: "1", action: "clio-chart-bars", display: "⌘1", labelKey: "clio_chart_bars", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-2", key: "2", action: "clio-chart-matrix", display: "⌘2", labelKey: "clio_chart_matrix", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-3", key: "3", action: "clio-chart-trace", display: "⌘3", labelKey: "clio_chart_trace", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-4", key: "4", action: "clio-chart-grid", display: "⌘4", labelKey: "clio_chart_grid", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-view-5", key: "5", action: "clio-chart-score", display: "⌘5", labelKey: "clio_chart_score", suppressInEditable: true, scope: ["clioChart"] },
  { id: "clio-chart-reverse", key: "r", action: "clio-chart-reverse-sort", display: "⌘R", labelKey: "clio_chart_reverse_sort", suppressInEditable: true, scope: ["clioChart"] },
];

// Action-level write contract: these commands mutate durable / project state
// and are rejected by the router before their handler runs when this window
// cannot write (read-only or mid-handoff). The UI layer uses
// `data-requires-write` and the storage fence uses assertCanWrite — three
// layers, same boundary.
const writeRequiredActions = new Set([
  "save-current",
  "save-copy",
  "save-chat",
  "save-conversation",
  "rename-active-chat",
  "new-document",
  "new-folder",
  "new-project-disk",
  "rename-project-disk",
  "rename-file",
  "duplicate-selection",
  "move-file-trash",
  "empty-trash",
  "put-away",
  "erase-disk",
  "quick-draft-save-project",
  "quick-draft-send-teachtext",
  "quick-draft-send-review",
  "insert-text-disk",
  "eject-text-disk",
  "add-text-disk-project",
  "dictionary-keep-word",
  "dictionary-delete-word",
]);

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

// The visible "⌘S" in a menu row is a child span, not part of the row's own
// text. Two code paths write menu rows — applyLanguage() on a language switch
// and renderAppMenuBar() on every application switch — so the span has to come
// from one shared writer. While only applyLanguage() painted it, the first
// application switch replaced every row with plain text and the menu bar
// stopped teaching its own keys until the next language switch.
function writeShortcutRowLabel(element, text) {
  const shortcut = element.dataset.shortcut;
  if (!shortcut) return false;
  const display = document.createElement("span");
  display.className = "shortcut";
  display.textContent = shortcut;
  element.replaceChildren(document.createTextNode(`${text} `), display);
  return true;
}

function shortcutRowText(element) {
  if (element.dataset.i18n && typeof t === "function") return t(element.dataset.i18n);
  const painted = element.querySelector(".shortcut");
  const own = painted ? element.firstChild?.textContent : element.textContent;
  return String(own || "").trim();
}

function syncKeyboardShortcutLabels() {
  document.querySelectorAll("[data-shortcut-id]").forEach((element) => {
    const shortcut = keyboardShortcutById(element.dataset.shortcutId);
    if (!shortcut) return;
    element.dataset.shortcut = shortcutDisplayLabel(shortcut);
    writeShortcutRowLabel(element, shortcutRowText(element));
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
    const dispatch = window.AISystem6ApplicationRegistry?.dispatchApplicationIntent;
    if (typeof dispatch === "function") {
      return dispatch("docMap", { intent: "map", items: [file], sourceAppId: "finder" });
    }
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
  const file = getFinderSelectedTeachTextFile();
  const dispatch = window.AISystem6ApplicationRegistry?.dispatchApplicationIntent;
  if (file && typeof dispatch === "function") {
    dispatch("reviewDesk", { intent: "review", items: [file], sourceAppId: "finder" });
    return;
  }
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

async function openReviewDeskDocument({ documentId, mode = "facts" } = {}) {
  const file = chatFiles.find((item) => item.id === documentId && item.type === "text" && isInActiveProject(item));
  if (!file) return false;
  window.AISystem6TeachText?.openDocument?.(documentId);
  await openWindow("reviewDesk");
  getWindow("reviewDesk")?.classList.remove("is-review-locked");
  if (reviewDeskBodyInput) {
    reviewDeskBodyInput.readOnly = false;
    reviewDeskBodyInput.classList.remove("is-hidden");
    reviewDeskBodyInput.value = String(file.body || "");
    reviewDeskBodyInput.scrollTop = 0;
    reviewDeskDirty = true;
  }
  reviewDeskPreviewEl?.classList.add("is-hidden");
  reviewDeskEmptyNoteEl?.classList.add("is-hidden");
  setReviewDeskMode(mode);
  updateReviewDeskStats();
  updateReviewDeskStatusTitle();
  renderStyleCheckSections();
  renderClaimCheckSections();
  updateMenuState();
  return true;
}

window.AISystem6ReviewDesk = Object.freeze({
  openDocument: openReviewDeskDocument,
});

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
  await openWindow("projectCd");
  setStatus(t("export_saved", item.title));
  await showFinishingReceiptForBurn(item);
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
  await openWindow("projectCd");
  setStatus(t("export_saved", item.title));
  // The writing route ends at the burn, so this is where the work is
  // receipted. The receipt opens last, on top of the disc it describes, and a
  // receipt that cannot be assembled leaves the finished burn alone.
  await showFinishingReceiptForBurn(item);
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

async function openMicropolisApp() {
  if (typeof ensureMicropolisModule === "function") {
    await ensureMicropolisModule();
  }
  await window.AISystem6Micropolis?.open?.();
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

async function playWelcomeTour() {
  // The Welcome Floppy tour is seeded and deterministic: it needs no model,
  // network, or profile switch, and always restores the user's desk.
  await ensureWritingDemoModule();
  await window.AISystem6WritingDemo?.playTeaser?.();
}

let applicationActionHandlersCache = null;
let applicationCommandRegistryCache = null;

function getApplicationActionHandlers() {
  return applicationActionHandlersCache ||= {
    "close-about": () => closeWindow("about"),
    "close-print-directory": () => closeWindow("printDirectory", true),
    "close-page-setup": () => closeWindow("pageSetup", true),
    "page-setup": openPageSetup,
    "print-current": printCurrentTeachTextDocument,
    "install-web-app": () => window.AISystem6WebPlatform?.installWebApp?.(),
    "welcome-iphone-help": showWelcomeIphoneHelp,
    "export-project-backup": exportActiveProjectDisk,
    "reveal-active-chat-file": () => {
      const fileId = activeChatFileId || selectedChatFileId;
      if (!fileId || !revealChatFileInFinder(fileId)) setStatus(t("no_project_mounted"));
    },
    "start-new-clio-chat": startNewClioTalkConversation,
    "start-temporary-clio-chat": startTemporaryClioTalkConversation,
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
    "eject-project": ejectActiveProject,
    "eject-menu-selection": ejectMenuSelection,
    "set-startup-project": setStartupProjectFromSelection,
    "new-project-disk": prepareNewProjectDisk,
    "duplicate-project-disk": duplicateSelectedProjectDisk,
    "archive-project-disk": archiveSelectedProjectDisk,
    "rename-project-disk": renameSelectedProject,
    "play-writing-demo": playWritingDemoFromGuide,
    "play-teaser-demo": playWelcomeTour,
    "new-document": () => {
      // Draft Desk is a first-class application: its commands enter through
      // its public API, never through another app's internal functions.
      const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
      if (activeWin?.dataset.window === "quickDraft") {
        return window.AISystem6QuickDraft?.newDocument?.() || newTextDocument();
      }
      return newTextDocument();
    },
    "new-folder": createFolderFromMenu,
    "duplicate-selection": duplicateFinderMenuSelection,
    // The Apple menu's "Start Writing Route" carries its own id because
    // balloon help and the workspace-capability gate both address it by name.
    // Without an entry here it dispatched into nothing: the item looked live,
    // took the click, and did nothing at all. Three feature tests pinned the
    // markup and none of them pressed it.
    "guide-start-route": openWritingStudio,
    "exit-writing-studio": exitWritingStudio,
    "hold-my-place": async () => { await ensureHeldPlaceSlipModule(); holdMyPlace(); },
    "resume-my-place": async () => { await ensureHeldPlaceSlipModule(); await resumeMyPlace(); },
    "held-place-to-question-sheet": async () => { await ensureHeldPlaceSlipModule(); promoteHeldPlace("questionSheet"); },
    "held-place-to-outline": async () => { await ensureHeldPlaceSlipModule(); promoteHeldPlace("outline"); },
    "held-place-dismiss": async () => { await ensureHeldPlaceSlipModule(); dismissHeldPlaceSlip(); },
    "clear-notifications": clearSystemNotifications,
    "rebuild-use-reader": useReaderForRebuildFlow,
    "rebuild-use-teachtext": useTeachTextForRebuildFlow,
    "rebuild-use-clipboard": useClipboardForRebuildFlow,
    "rebuild-use-sample": useSampleArticleForRebuildFlow,
    "run-rebuild-flow": runRebuildFlow,
    "close-rebuild-flow": () => closeWindow("rebuildFlow", true),
    "toggle-compose-tools": toggleComposeToolsMenu,
    "versions-compare": () => compareSelectedDocumentVersions(),
    "versions-restore": () => restoreSelectedDocumentVersion(),
    // Wrapped, not bare: the Dictionary module is lazy, so a bare reference
    // resolves at boot into nothing and takes the whole registry down with it.
    "dictionary-keep-word": () => keepDictionaryWord(),
    "dictionary-delete-word": () => deleteDictionaryWord(),
    "hold-that-thought": holdThatThought,
    "generate-outline": generateOutline,
    "organize-question-sheet": organizeQuestionSheet,
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
    "eli5-rewrite-section": () => window.AISystem6QuickDraftAI?.requestEli5Rewrite?.(),
    "eli5-review-section": () => window.AISystem6QuickDraftAI?.requestEli5Review?.(),
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
    "new-text-document": createTeachTextFileFromFinder,
    "duplicate-file": duplicateActiveFile,
    "rename-file": renameActiveFile,
    "move-file-trash": moveActiveFileToTrash,
    "copy-active-markdown": copyActiveMarkdown,
    "download-active-markdown": downloadActiveMarkdown,
    "share-active-markdown": shareActiveMarkdown,
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
    "copy-project-cd-markdown": copySelectedProjectCdMarkdown,
    "share-project-cd-markdown": shareSelectedProjectCdMarkdown,
    // Download and Print to PDF reached their handlers through a bare click
    // listener on a button id, so nothing outside the Project CD window could
    // dispatch them and Get Info could not offer a burned item its own verbs.
    // Both handlers already refuse an empty selection with a status line.
    "download-project-cd-item": () => downloadSelectedProjectCdItem(),
    "print-project-cd-item": () => printSelectedProjectCdItem(),
    // Lazy module: the identifier must be resolved at dispatch time, not at
    // registry-build time, or the whole registry throws before first use.
    "retry-current-ai-action": () => (
      typeof window.AISystem6ModelUserErrors?.runRetryable === "function"
        ? window.AISystem6ModelUserErrors.runRetryable()
        : false
    ),
    // Searcher and Find File live in a lazy module, so every handler below has
    // to be an arrow that loads it first: a bare reference here is resolved
    // when this registry object is built at boot, and one ReferenceError takes
    // the whole registry with it. openWindow does the loading and the paint.
    "reveal-selected-find-file": async () => {
      await ensureFindPathModule();
      revealSelectedFindFileResult();
    },
    "clip-selected-find-path": async () => {
      await ensureFindPathModule();
      clipSelectedFindPath();
    },
    "focus-search-query": () => findPathQueryInput?.focus(),
    "synthesize-search-results": async () => {
      await ensureFindPathModule();
      await synthesizeFindPath();
    },
    "copy-search-result-markdown": async () => {
      await ensureFindPathModule();
      copySelectedFindPath();
    },
    "insert-search-result": async () => {
      await ensureFindPathModule();
      insertFindPathIntoTeachText();
    },
    "save-current": saveCurrentWork,
    "save-chat": openSaveChatDialog,
    "save-conversation": openSaveChatDialog,
    "rename-active-chat": renameActiveClioTalkConversation,
    "copy-current-chat-markdown": copyCurrentClioTalkMarkdown,
    "download-current-chat-markdown": downloadCurrentClioTalkMarkdown,
    "find-in-cliotalk": () => findInClioTalkConversation(),
    "find-next-in-cliotalk": findNextInClioTalkConversation,
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
    "clip-last-reply": () => ensureTeachtextWritingModule().then(() => clipLastReplyToScrapbook()),
    "insert-last-reply": () => ensureTeachtextWritingModule().then(() => insertLastReplyIntoTeachText()),
    "clear-chat": startNewClioTalkConversation,
    "clip-assistant-selection": clipAssistantSelection,
    "retry-last-message": () => {
      if (lastUserText) submitUserText(lastUserText);
    },
    "stop-generation": stopGeneration,
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
        const closed = await closeWindow(active.dataset.window);
        // A blocked close (unsaved save prompt, failed flush) keeps the window
        // foreground; never hand focus to another window over it.
        if (closed === false) return;
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
    "toggle-sideask": toggleSideAsk,
    // Wrapped, not bare: these resolve at boot into the lazy module's stub and
    // a bare reference would throw once the module moved out of the bundle.
    "focus-sideask-source": focusSideAskSource,
    "set-theme-classic": () => applyTheme("classic"),
    "set-theme-platinum": () => applyTheme("platinum"),
    "set-theme-aqua": () => applyTheme("aqua"),
    "set-theme-snow-leopard": () => applyTheme("snow-leopard"),
    "set-theme-yosemite": () => applyTheme("yosemite"),
    "set-theme-liquid-glass": () => applyTheme("liquid-glass"),
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
  window.AISystem6Runtime?.c?.forEach((command, action) => applicationCommandRegistryCache.set(action, Object.freeze({ id: action, handler: (context) => command.handler(context), isAvailable: () => isWorkspaceActionAllowed(action) && command.isAvailable() !== false, shortcut: () => keyboardShortcutRegistry.find((entry) => entry.action === action) || null })));
  return applicationCommandRegistryCache;
};

async function handleAction(action, commandContext = {}) {
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
  let command = getApplicationCommandRegistry().get(action);
  if (!command) {
    const lazy = window.AISystem6Runtime?.lazyCommands?.get?.(action);
    if (lazy) {
      try {
        await lazy.ensure();
        applicationCommandRegistryCache = null;
        command = getApplicationCommandRegistry().get(action);
      } catch (error) {
        console.warn(`Lazy command ${action} failed to load.`, error);
        updateMenuState();
        return;
      }
    }
  }
  if (!command?.isAvailable()) {
    updateMenuState();
    return;
  }
  if (
    (writeRequiredActions.has(action) || command?.writeRequired === true)
    && window.AISystem6WriteLease?.canMutate?.() !== true
  ) {
    if (typeof setStatus === "function") setStatus(t("write_required_status"));
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
  if (event.defaultPrevented || eventIsTextComposition(event) || !shortcutModifierPressed(event)) return;

  const key = event.key.toLowerCase();
  const shortcutAppId = activeAppId === "writingStudio" ? "teachText" : activeAppId;
  const command = [...getApplicationCommandRegistry().values()].find((record) => {
    const candidate = record.shortcut();
    return candidate
      && candidate.dispatch !== false
      // A shortcut may pin the physical key. Option composes a different
      // character on many layouts, so `key` alone would miss ⌥⌘N.
      && (candidate.code ? candidate.code === event.code : candidate.key === key)
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

window.AISystem6Runtime?.registerApplication({id:"keyCaps",windowName:"keyCaps",commands:{"open-key-caps":{handler:()=>openWindow("keyCaps"),isAvailable:()=>!0}}});
window.AISystem6Runtime?.registerLazyCommand?.("open-memory-cards",{ensure:ensureMemoryCardsModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-alarm-clock",{ensure:ensureAlarmClockModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-translation-pad",{ensure:ensureTranslationPadModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-bureaucracy-meme",{ensure:ensureBureaucracyMemeModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-endfield-terminal",{ensure:ensureEndfieldTerminalModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-find-path",{ensure:ensureFindPathModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-find-file",{ensure:ensureFindPathModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-time-machine",{ensure:ensureTimeMachineModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-dictionary",{ensure:ensureDictionaryHelpModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-system-help",{ensure:ensureDictionaryHelpModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-soundscape",{ensure:ensureSoundscapeModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-cmf-studio",{ensure:ensureCmfStudioModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-image-prompt-studio",{ensure:ensureImagePromptStudioModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-openttd",{ensure:ensureOpenTTDModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-doom",{ensure:ensureDoomModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-micropolis",{ensure:ensureMicropolisModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-bonsai-city",{ensure:ensureBonsaiCityModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-clio-stage",{ensure:ensureClioStageModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-liquid-cover",{ensure:ensureLiquidCoverModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-clio-chart",{ensure:ensureClioChartModule});
window.AISystem6Runtime?.registerLazyCommand?.("see-as-chart",{ensure:ensureClioChartModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-theme-lab",{ensure:ensureThemeLabModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-quick-draft",{ensure:ensureQuickDraftModule});
window.AISystem6Runtime?.registerLazyCommand?.("open-docmap",{ensure:ensureDocMapModule});
window.AISystem6Runtime?.registerCommand?.("open-about",{handler:()=>openWindow("about"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-applications",{handler:()=>openWindow("applications"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-help-folder",{handler:()=>openWindow("helpFolder"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-chooser",{handler:()=>openWindow("chooser"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-rag",{handler:()=>openWindow("rag"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-context-panel",{handler:()=>openWindow("contextPanel"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-image-manager",{handler:()=>openWindow("imageManager"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-model-meter",{handler:()=>openWindow("modelMeter"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-status",{handler:()=>openWindow("systemStatus"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-notification-center",{handler:()=>openWindow("notificationCenter"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-project-cd",{handler:()=>openWindow("projectCd"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-import-utility",{handler:()=>openWindow("importUtility"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-trash",{handler:()=>openWindow("trash"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-control",{handler:()=>openWindow("control"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-assistant",{handler:()=>openWindow("assistant"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-project-info",{handler:openProjectInfo,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-file-info",{handler:openFileInfo,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-project-disks",{handler:()=>{openWindow("projects");if(!isProjectMounted)setStatus(t("no_project_mounted"));},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-text-disk",{handler:()=>{renderMountedTextDisk();openWindow("textDisk");},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-finder",{handler:()=>{openWindow("finder");navigateSystemFolderPath("");},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-documents",{handler:()=>{renderDocuments();openWindow("documents");},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-github-repo",{handler:()=>window.open("https://github.com/surfine/AI-System-6","_blank","noopener"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-project-site",{handler:()=>window.open("https://aisystem6.pages.dev/","_blank","noopener"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-guide-promo",{handler:()=>window.open("https://www.bilibili.com/video/BV1ht3m6UEDb/","_blank","noopener"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-about-multifinder",{handler:showAboutMultiFinder,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-welcome-read-me",{handler:openWelcomeReadMe,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-clio-model-settings",{handler:openModelSettings,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-read-me",{handler:()=>openSystemFolderDocument("readMe"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-flow-readme",{handler:()=>openSystemFolderDocument("flow"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-memory-readme",{handler:()=>openSystemFolderDocument("memory"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-concepts-docmap",{handler:openSystemConceptDocMap,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-concepts-clio-stage",{handler:openSystemConceptClioStage,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-text-document",{handler:openTextDocumentFromDisk,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-writing-studio",{handler:openWritingStudio,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-question-sheet",{handler:openQuestionSheetSurface,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-teachtext-manuscript",{handler:openTeachTextManuscriptWindow,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-document-versions",{handler:()=>openDocumentVersions(),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-outline",{handler:openOutlineSurface,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-section-drafts",{handler:openSectionDrafts,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-claim-check",{handler:()=>openReviewDesk("facts"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-style-sheet",{handler:()=>openReviewDesk("style"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-writing-flow-windows",{handler:openWritingFlowWindows,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-teachtext",{handler:openTeachTextForWorkspace,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-finishing-receipt",{handler:()=>openFinishingReceiptForSelection(),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-clio-attachment-picker",{handler:beginClioTalkAttachmentPicker,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-local-ai-settings",{handler:()=>{openWindow("control");if(typeof setControlTab==="function")setControlTab("local");return true;},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-cloud-ai-settings",{handler:()=>{openWindow("control");if(typeof setControlTab==="function")setControlTab("cloud");return true;},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-guide",{handler:openWelcomeFloppy,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-menu-selection",{handler:openFinderMenuSelection,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-project-disk",{handler:openSelectedProject,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-rebuild-flow",{handler:openRebuildFlow,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-review-desk",{handler:()=>openReviewDesk("style"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-project-backup",{handler:openProjectBackupPanel,isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-file-system",{handler:()=>showSystemModal(t("system_file_not_openable"),"alert"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-file-finder",{handler:()=>showSystemModal(t("system_file_not_openable"),"alert"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-file-multifinder",{handler:()=>showSystemModal(t("system_file_not_openable"),"alert"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-file-da-handler",{handler:()=>showSystemModal(t("system_file_not_openable"),"alert"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-folder-path",{handler:({systemFolderPath=""}={})=>navigateSystemFolderPath(systemFolderPath),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-applications-folder-path",{handler:({applicationsFolderPath=""}={})=>navigateApplicationsFolderPath(applicationsFolderPath),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-system-prompt-file",{handler:({promptId="writing-tools.proofread"}={})=>{if(!activeProjectId){setStatus(t("no_project_mounted"));openWindow("projects");return}const file=window.AISystem6PromptFilesRuntime?.ensureProjectPromptOverrideForEditing(activeProjectId,promptId);if(!file){setStatus(currentLanguage==="zh"?"该系统提示词只读，或提示词文件缺失。":"This system prompt is read-only or missing.");return}selectedChatFileId=file.id;activeTextFileId=file.id;openTextFile(file.id);saveDeskState?.();},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-chat-file",{handler:({fileId=""}={})=>openChatFileWindow(fileId),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-droplet",{handler:({dropletId=""}={})=>{const command=typeof getScriptableCommand==="function"?getScriptableCommand(dropletId):null;const name=command&&typeof dropletName==="function"?dropletName(command):t("droplet");showSystemModal(t("droplet_open_explainer",name),"alert");},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-control-strip-modules",{handler:()=>openWindow("controlStripModules"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-control-strip-module",{handler:({controlStripModuleId})=>{ensureControlStripModulesFolderModule().then(()=>window.AISystem6ControlStripModulesFolder?.openModule?.(controlStripModuleId)).catch(error=>console.warn("Control Strip Modules folder unavailable.",error));},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-ai-connection-settings",{handler:()=>handleAction("open-cloud-ai-settings"),isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-selected-find-file",{handler:async()=>{await ensureFindPathModule();openSelectedFindFileResult();},isAvailable:()=>!0});
window.AISystem6Runtime?.registerCommand?.("open-selected-in-reader",{handler:()=>{if(selectedFindPathIndex===null){setStatus(t("select_find_path_first"));return}const result=findPathResults[selectedFindPathIndex];if(!result?.url)return;readerUrlInput.value=result.url;openWindow("reader");fetchReaderPage();},isAvailable:()=>!0});
