// Core runtime module: actions.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.

let reviewDeskMode = "style";


function createFolderFromMenu() {
  if (!isProjectMounted) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return;
  }

  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = active?.dataset.window;
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

  if (finderContainerWindowNames.includes(activeName)) {
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
    return makeDocMapFromCurrentSource({
      text: file.body.trim(),
      label: file.name,
      scope: "documents",
      meta: { fileId: file.id, fileType: file.type },
      threshold: docMapMinDocumentChars,
    });
  }
  return makeDocMapFromCurrentSource();
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
    fallback: teachTextNameInput?.value?.trim() || teachTextTitleEl?.textContent?.trim() || t("untitled"),
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
  clearReviewFeedbackSlot("facts", currentLanguage === "zh" ? "正在生成若是接收者会怎么接..." : "Generating How Recipient Would Receive It...");
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

function exportReviewDeskReport() {
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

  const item = addProjectCdItem(report.markdown, report.name);
  if (!item) return;
  markTeachTextExported("markdown");
  openWindow("projectCd");
  setStatus(t("export_saved", item.title));
}

function exportTeachTextToProjectCd() {
  const isSlidesMarkdown = typeof readerHasMarpFrontmatter === "function" && readerHasMarpFrontmatter(teachTextBodyInput?.value || "");
  if (!isSlidesMarkdown && typeof isTeachTextManuscriptRole === "function" && !isTeachTextManuscriptRole()) {
    setStatus(t("teachtext_manuscript_required"));
    return;
  }
  const { markdown, name } = getTeachTextMarkdown({ originalImages: true });
  if (!markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return;
  }
  const item = addProjectCdItem(markdown, name);
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

async function importQuickDraftChatRecords() {
  if (typeof ensureQuickDraftModule === "function") {
    await ensureQuickDraftModule();
  }
  await window.AISystem6QuickDraft?.importChatScreenshots?.();
}

async function openSystemConceptDocMap() {
  try {
    setStatus(currentLanguage === "zh" ? "正在用 AI 生成 AI System 6 基本概念 DocMap..." : "Generating AI System 6 Concepts DocMap with AI...");
    const concepts = await ensureSystemConceptsData();
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
  await ensureWritingDemoModule();
  await window.AISystem6WritingDemo?.play?.();
}

function handleAction(action) {
  const availability = getActionAvailability();
  if (availability[action] === false) {
    updateMenuState();
    return;
  }

  const actions = {
    "open-about": () => openWindow("about"),
    "open-about-multifinder": showAboutMultiFinder,
    "close-about": () => closeWindow("about"),
    "close-print-directory": () => closeWindow("printDirectory", true),
    "close-page-setup": () => closeWindow("pageSetup", true),
    "page-setup": openPageSetup,
    "open-guide": () => openWindow("guide"),
    "open-system-help": () => openSystemHelpEntry(selectedSystemHelpEntryId || "system-help"),
    "open-project-disks": () => {
      openWindow("projects");
      if (!isProjectMounted) setStatus(t("no_project_mounted"));
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
    "move-project-trash": moveSelectedProjectToTrash,
    "rename-project-disk": renameSelectedProject,
    "dismiss-guide": dismissGuide,
    "guide-start-route": startGuidedWritingRoute,
    "play-writing-demo": playWritingDemoFromGuide,
    "guide-use-finder": () => setStartupEnvironmentPreference("finder"),
    "guide-use-multifinder": () => setStartupEnvironmentPreference("multifinder"),
    "guide-open-control": () => {
      dismissGuide();
      openApiSetup();
    },
    "guide-learn-flow": openWritingFlowHelp,
    "open-read-me": () => openSystemFolderDocument("readMe"),
    "open-flow-readme": () => openSystemFolderDocument("flow"),
    "open-memory-readme": () => openSystemFolderDocument("memory"),
    "open-system-concepts-docmap": openSystemConceptDocMap,
    "open-system-concepts-clio-stage": openSystemConceptClioStage,
    "copy-native-brief": copyNativeBrief,
    "export-native-handoff": exportNativeHandoff,
    "new-folder": createFolderFromMenu,
    "open-menu-selection": openFinderMenuSelection,
    "duplicate-selection": duplicateFinderMenuSelection,
    "open-assistant": () => openWindow("assistant"),
    "open-quick-draft": openQuickDraft,
    "quick-draft-import-chat": importQuickDraftChatRecords,
    "open-writing-bell": () => openWindow("writingBell"),
    "open-note-pad": () => openWindow("notePad"),
    "open-clipboard": () => {
      renderClipboard();
      openWindow("clipboard");
    },
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
    "toggle-tool-dock": toggleWritingToolsShade,
    "toggle-compose-tools": toggleComposeToolsMenu,
    "open-question-sheet": openQuestionSheetSurface,
    "open-teachtext-manuscript": openTeachTextManuscriptWindow,
    "open-outline": openOutlineSurface,
    "open-section-drafts": openSectionDrafts,
    "open-claim-check": () => openReviewDesk("facts"),
    "open-review-desk": () => openReviewDesk("style"),
    "open-docmap": () => {
      if (typeof openDocMapWindowWithTabs === "function") {
        openDocMapWindowWithTabs();
        return;
      }
      openWindow("docMap");
    },
    "open-clio-stage": openClioStageApp,
    "open-liquid-cover": openLiquidCover,
    "open-cmf-studio": () => openWindow("cmfStudio"),
    "open-dictionary": () => openWindow("dictionary"),
    "open-style-sheet": () => openReviewDesk("style"),
    "generate-outline": generateOutline,
    "organize-question-sheet": organizeQuestionSheet,
    "open-writing-flow-windows": openWritingFlowWindows,
    "toggle-question-preview": () => toggleTeachTextSurfacePreview("questionSheet"),
    "insert-question-template": insertQuestionTemplate,
    "clear-question-sheet": clearQuestionSheet,
    "advance-question-to-outline": advanceQuestionSheetToOutline,
    "save-questions": () => {
      savePipelineData();
      setStatus(t("saved"));
    },
    "restore-questions-to-outline": restoreQuestionsToOutline,
    "add-outline-section": addOutlineSection,
    "insert-outline-hkrr-intent": insertOutlineHkrrIntent,
    "clear-outline": clearOutlineWithConfirmation,
    "critique-outline": () => runOutlineOperation("critique"),
    "expand-outline": expandOutline,
    "mingming-outline": () => runOutlineOperation("mingming"),
    "reduce-outline": () => runOutlineOperation("reduce"),
    "structure-outline": () => runOutlineOperation("structure"),
    "advance-outline-to-drafts": advanceOutlineToSectionDrafts,
    "save-outline": saveOutline,
    "toggle-outline-preview": () => toggleTeachTextSurfacePreview("outline"),
    "draft-selected-section": draftSelectedOutlineSection,
    "draft-current-section": draftSelectedOutlineSection,
    "toggle-draft-preview": () => toggleTeachTextSurfacePreview("sectionDrafts"),
    "previous-section-draft": () => showAdjacentSectionDraft(-1),
    "next-section-draft": () => showAdjacentSectionDraft(1),
    "save-section-draft": () => {
      savePipelineData();
      setStatus(t("saved"));
    },
    "revise-draft": polishDraft,
    "polish-draft": polishDraft,
    "suggest-draft": suggestDraft,
    "insert-to-teachtext": insertDraftToTeachText,
    "advance-drafts-to-review": advanceDraftsToReview,
    "run-claim-check": runClaimCheckFromMenu,
    "run-claim-check-section": () => runClaimCheck({ sectionOnly: true }),
    "review-style-section": runReviewDeskStyleSectionCheck,
    "review-facts-section": runReviewDeskFactSectionCheck,
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
    "open-teachtext": () => {
      openWindow("teachText");
      teachTextBodyInput.focus();
    },
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
    "selection-translate": () => runSelectionServiceCommand("translate"),
    "selection-new-note": () => runSelectionServiceCommand("note"),
    "selection-ask-assistant": () => runSelectionServiceCommand("ask"),
    "make-docmap": makeDocMapFromFinderOrCurrent,
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
    "open-disk": () => openWindow("disk"),
    "open-help-folder": () => openWindow("helpFolder"),
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
    "open-finder": () => openWindow("finder"),
    "open-documents": () => {
      renderDocuments();
      openWindow("documents");
    },
    "open-scrapbook": () => openWindow("scrapbook"),
    "open-trash": () => openWindow("trash"),
    "open-context-panel": () => openWindow("contextPanel"),
    "save-current": saveCurrentWork,
    "save-chat": openSaveChatDialog,
    "new-note": () => createScrap(null, ""),
    "save-last": saveLastReply,
    "clip-last-reply": clipLastReplyToScrapbook,
    "insert-last-reply": insertLastReplyIntoTeachText,
    "clear-chat": clearChatToTrash,
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
    "save-copy": () => {
      if (!getWindow("teachText").classList.contains("is-hidden")) {
        saveTextDocument({ asCopy: true });
      } else {
        saveLastReply();
      }
    },
    "undo": () => runEditCommand("undo"),
    "cut": () => runEditCommand("cut"),
    "copy": () => runEditCommand("copy"),
    "paste": () => runEditCommand("paste"),
    "clear-edit": () => runEditCommand("delete"),
    "select-all": () => runEditCommand("select-all"),
    "insert-text-disk": insertFileFloppyFromWindow,
    "eject-text-disk": ejectSelectedMountedFile,
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
    "toggle-liquid-glass": toggleLiquidGlassAppearance,
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

  actions[action]?.();
  updateMenuState();
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
  if (!event.metaKey || event.ctrlKey || event.altKey) return;

  const key = event.key.toLowerCase();

  // Handle Shift + Command shortcuts
  if (event.shiftKey) {
    const shiftShortcuts = {
      c: "copy-active-markdown",
      d: "download-active-markdown",
      i: "insert-last-reply",
      s: "save-copy",
    };
    const action = shiftShortcuts[key];
    if (action) {
      event.preventDefault();
      closeMenus();
      handleAction(action);
    }
    return;
  }

  const shortcuts = {
    enter: "intent-key",
    n: "new-folder",
    s: "save-current",
    d: "duplicate-selection",
    r: "rename-file",
    backspace: "move-file-trash",
    delete: "move-file-trash",
    w: "close-active-window",
    z: "undo",
    x: "cut",
    c: "copy",
    v: "paste",
    a: "select-all",
    i: "open-file-info",
    l: "clip-last-reply",
    k: "clear-chat",
    g: "open-text-disk",
    y: "open-reader",
    m: "open-context-panel",
    t: "tile-windows",
    h: "open-assistant",
    o: "open-menu-selection",
    f: "open-documents",
    j: "open-scrapbook",
    b: "open-trash",
    ".": "toggle-sideask",
    "/": "open-find-path", // ⌘/ for ?
    "?": "open-find-path",
    u: "open-rag",
    ",": "open-control",
    e: "eject-menu-selection",
  };
  const action = shortcuts[key];

  if (!action) return;

  event.preventDefault();
  closeMenus();
  handleAction(action);
}
