// DocMap entry layer.
//
// DocMap itself (markmap render, tabs, print, model calls) is a lazy module:
// it is a summoned tool, and 121 KB of it should not be parsed at every boot.
// But a handful of things must stay eager, because they run *before* anyone
// asks for DocMap and would otherwise pull the tool in for nothing:
//
//   - updateDocMapEntryButtons() decides whether the DocMap buttons in Reader,
//     TeachText, Scrapbook, Documents and the clipboard are enabled. Six
//     modules call it on every render. If it were lazy the buttons could never
//     light up without first loading the very module they exist to summon.
//   - the docMapSourceFrom*() resolvers answer "is there enough text here?"
//     for those buttons, and app.js uses two of them to build source lists.
//   - isExportedDocMapMarkdown() is a synchronous branch in Reader's import
//     path; it has to answer before the tool exists.
//
// Everything here is cheap and depends only on already-eager state. Do not
// move rendering, markmap, print, or model code into this file — that is what
// the lazy module is for.

function joinDocMapSourceBlocks(blocks, maxChars = 24000) {
  const parts = [];
  let total = 0;
  blocks.forEach(({ title, text }) => {
    const body = String(text || "").trim();
    if (!body) return;
    const block = [`## ${title || t("untitled")}`, body].join("\n\n");
    if (parts.length && total + block.length > maxChars) return;
    parts.push(block);
    total += block.length;
  });
  return parts.join("\n\n---\n\n").trim();
}

function docMapSourceFromScrapbook() {
  const selected = getSelectedScraps();
  if (!selected.length) return null;
  return {
    text: joinDocMapSourceBlocks(selected.map((scrap, index) => ({
      title: `${index + 1}. ${scrap.title || t("scrapbook")}`,
      text: scrap.body || scrap.selectedText || "",
    }))),
    label: `${t("scrapbook")} · ${t("scraps_count", selected.length)}`,
    scope: "scrapbook",
    threshold: docMapMinSelectionChars,
    meta: { scrapIds: selected.map((scrap) => scrap.id) },
  };
}

function docMapSourceFromSelectedDocument() {
  const file = chatFiles.find((item) => item.id === selectedChatFileId && isInActiveProject(item));
  if (!file?.body?.trim()) return null;
  return {
    text: file.body.trim(),
    label: file.name || t("documents"),
    scope: "documents",
    threshold: docMapMinDocumentChars,
    meta: { fileId: file.id, fileType: file.type || "" },
  };
}

function docMapSourceFromFileFloppy() {
  if (!isProjectMounted || mountedTextDisk.projectId !== activeProjectId) return null;
  const selectedNames = Array.from(selectedMountedFileNames || [])
    .filter((name) => mountedTextDisk.files.includes(name));
  const fileNames = selectedNames.length
    ? selectedNames
    : selectedMountedFile && mountedTextDisk.files.includes(selectedMountedFile)
      ? [selectedMountedFile]
      : mountedTextDisk.files;
  if (fileNames.length === 1) {
    const videoSource = docMapSourceFromVideoTranscript(fileNames[0]);
    if (videoSource) return videoSource;
  }
  const text = joinDocMapSourceBlocks(fileNames.map((name) => ({
    title: name,
    text: mountedTextDisk.fileBodies[name] || getMountedTextDiskChunks().filter((chunk) => chunk.source === name).map((chunk) => chunk.content).join("\n\n"),
  })));
  if (!text) return null;
  return {
    text,
    label: fileNames.length === 1 ? fileNames[0] : t("mounted_text_disk"),
    scope: "fileDisk",
    threshold: docMapMinDocumentChars,
    meta: { fileName: fileNames.length === 1 ? fileNames[0] : "", fileNames },
  };
}

function docMapSourceFromProjectCd() {
  if (typeof getSelectedProjectCdItem !== "function") return null;
  const item = getSelectedProjectCdItem();
  const text = String(item?.body || "").trim();
  if (!text) return null;
  return {
    text,
    label: `Project CD: ${item.title || t("project_cd")}`,
    scope: "projectCd",
    threshold: docMapMinDocumentChars,
    meta: { projectCdItemId: item.id || "", title: item.title || "" },
  };
}

function normalizeDocMapVideoSource(raw, fileName = "") {
  const normalizer = window.AISystem6VideoTranscript?.normalizeVideoTranscriptSource;
  return typeof normalizer === "function" ? normalizer(raw, fileName) : raw;
}

function docMapVideoTranscriptText(transcript) {
  return (transcript?.paragraphs || [])
    .map((paragraph) => [
      `[${paragraph.timeStart || paragraph.start} --> ${paragraph.timeEnd || paragraph.end}]`,
      paragraph.text,
      `Blocks: ${(paragraph.blockIds || []).join(", ")}`,
    ].join("\n"))
    .join("\n\n")
    .trim();
}

function docMapSourceFromVideoTranscript(fileName) {
  const raw = mountedTextDisk.fileSources?.[fileName];
  if (!raw || raw.type !== "video_transcript") return null;
  const transcript = normalizeDocMapVideoSource(raw, fileName);
  const text = docMapVideoTranscriptText(transcript);
  if (!text) return null;
  return {
    text,
    label: fileName,
    scope: "videoTranscript",
    threshold: Math.min(docMapMinDocumentChars, 240),
    kind: "videoTranscript",
    meta: {
      fileName,
      sourceId: transcript.id || "",
      blocks: transcript.blocks || [],
      paragraphs: transcript.paragraphs || [],
    },
  };
}

function docMapCanUseSelectionContext(context) {
  if (!context?.text || context.docMapEligible === false) return false;
  return [
    "reader",
    "teachtext",
    "fileDisk",
    "scrapbook",
    "documents",
    "questionSheet",
    "outline",
    "sectionDrafts",
    "clipboard",
    "notePad",
  ].includes(context.surface);
}

function docMapSourceWithRange(source, rangeMode = "source", extraMeta = {}) {
  if (!source?.text) return null;
  const text = String(source.text || "").trim();
  if (!text) return null;
  const normalizedRange = ["selection", "selected-items"].includes(rangeMode) ? rangeMode : "source";
  return {
    ...source,
    text,
    rangeMode: normalizedRange,
    isSelection: normalizedRange === "selection",
    meta: {
      ...(source.meta || {}),
      ...extraMeta,
      rangeMode: normalizedRange,
      selectedChars: normalizedRange === "selection" ? text.length : 0,
      sourceChars: Number(extraMeta.sourceChars) || Number(source.meta?.sourceChars) || text.length,
    },
  };
}

function docMapSelectionSourceFromContext(context) {
  if (!docMapCanUseSelectionContext(context)) return null;
  const text = String(context.text || "").trim();
  if (!text) return null;
  return docMapSourceWithRange({
    text,
    label: selectionLabelForContext(context) || t("selection_services"),
    scope: context.surface,
    context,
    threshold: docMapMinSelectionChars,
    meta: {
      ...(context.source || {}),
      selectionStart: Number.isFinite(context.start) ? context.start : null,
      selectionEnd: Number.isFinite(context.end) ? context.end : null,
      before: context.before || "",
      after: context.after || "",
    },
  }, "selection", {
    sourceChars: String(context.fullText || "").trim().length || text.length,
  });
}

function docMapSourceFromReaderPage() {
  const text = String(currentReaderPage?.text || "").trim();
  if (!text) return null;
  if (currentReaderPage.videoTranscript?.type === "video_transcript") {
    return docMapSourceWithRange({
      text: docMapVideoTranscriptText(currentReaderPage.videoTranscript),
      label: currentReaderPage.title || currentReaderPage.fileName || t("reader"),
      scope: "videoTranscript",
      threshold: Math.min(docMapMinDocumentChars, 240),
      kind: "videoTranscript",
      meta: {
        fileName: currentReaderPage.fileName || "",
        sourceId: currentReaderPage.videoTranscript.id || "",
        url: currentReaderPage.url || "",
        blocks: currentReaderPage.videoTranscript.blocks || [],
        paragraphs: currentReaderPage.videoTranscript.paragraphs || [],
      },
    });
  }
  return docMapSourceWithRange({
    text,
    label: currentReaderPage.title || t("reader"),
    scope: "reader",
    threshold: docMapMinDocumentChars,
    meta: { url: currentReaderPage.url || "" },
  });
}

function docMapWholeSourceForSurface(surface = "") {
  if (surface === "reader" || surface === "videoTranscript") return docMapSourceFromReaderPage();
  if (surface === "timeMachine") return docMapSourceFromTimeMachine("source");
  if (surface === "teachtext" || surface === "fileDisk") {
    const text = String(teachTextBodyInput.value || "").trim();
    return text ? docMapSourceWithRange({
      text,
      label: getTeachTextDocumentName({ fallback: surface === "fileDisk" ? t("mounted_text_disk") : "TeachText" }),
      scope: surface,
      threshold: docMapMinDocumentChars,
      meta: { fileId: activeTextFileId || "" },
    }) : null;
  }
  if (surface === "scrapbook") {
    const source = docMapSourceFromScrapbook();
    return source ? docMapSourceWithRange(source, "selected-items") : null;
  }
  if (surface === "documents") return docMapSourceWithRange(docMapSourceFromSelectedDocument());
  if (surface === "questionSheet") {
    const text = String(questionSheetBodyInput.value || "").trim();
    return text ? docMapSourceWithRange({
      text: parseMarkdownDocument(text).source.trim(),
      label: t("question_sheet"),
      scope: "questionSheet",
      threshold: docMapMinDocumentChars,
    }) : null;
  }
  if (surface === "outline") {
    const text = String(outlineContentEl.value || "").trim();
    return text ? docMapSourceWithRange({
      text: parseMarkdownDocument(text).source.trim(),
      label: t("outline"),
      scope: "outline",
      threshold: docMapMinDocumentChars,
    }) : null;
  }
  if (surface === "sectionDrafts") {
    const text = String(draftBodyInput.value || "").trim();
    return text ? docMapSourceWithRange({
      text: parseMarkdownDocument(text).source.trim(),
      label: t("section_drafts"),
      scope: "sectionDrafts",
      threshold: docMapMinDocumentChars,
    }) : null;
  }
  if (surface === "clipboard") {
    const text = String(clipboardText || "").trim();
    return text ? docMapSourceWithRange({
      text,
      label: clipboardSource || t("docmap_source_clipboard"),
      scope: "clipboard",
      threshold: docMapMinDocumentChars,
    }) : null;
  }
  if (surface === "notePad") {
    const text = String(notePadTextInput.value || "").trim();
    return text ? docMapSourceWithRange({
      text,
      label: t("note_pad"),
      scope: "notePad",
      threshold: docMapMinDocumentChars,
    }) : null;
  }
  if (surface === "textDisk") return docMapSourceWithRange(docMapSourceFromFileFloppy());
  if (surface === "projectCd") return docMapSourceWithRange(docMapSourceFromProjectCd());
  return null;
}

function docMapSelectionContextForSurface(surface = "") {
  const current = getSelectionServiceContext();
  if (current?.surface === surface) return current;
  if (surface === "reader") return readerSelectionContext();
  if (surface === "teachtext" || surface === "fileDisk") return teachTextSelectionContext();
  if (surface === "clipboard") {
    return textControlSelectionContext(clipboardTextInput, "clipboard", () => clipboardSource || t("clipboard"))
      || textControlSelectionContext(clipboardTranslationTextInput, "clipboard", () => clipboardSource || t("clipboard"));
  }
  if (surface === "scrapbook") return textControlSelectionContext(scrapBodyInput, "scrapbook", () => selectionLabelForContext({ surface: "scrapbook" }));
  if (surface === "documents") return elementSelectionContext(chatFileBodyEl, "documents", () => chatFileTitleEl?.textContent?.trim() || t("documents"));
  return null;
}

// Time Machine ships as a lazy module, so its loaded page is reached through
// the window's own accessor rather than a shared variable.
function docMapSourceFromTimeMachine(rangeMode = "auto") {
  const source = window.AISystem6TimeMachine?.docMapSource?.(rangeMode);
  return source?.text?.trim() ? source : null;
}

function docMapSourceFromPreferredContext(preferredContext) {
  if (!preferredContext?.text) return null;
  const text = String(preferredContext.text || "").trim();
  if (!text) return null;

  if (docMapCanUseSelectionContext(preferredContext)) return docMapSelectionSourceFromContext(preferredContext);

  if (!preferredContext.scope && !preferredContext.kind && !preferredContext.meta && !preferredContext.threshold) {
    return null;
  }

  return docMapSourceWithRange({
    text,
    label: preferredContext.label || t("docmap"),
    scope: preferredContext.scope || preferredContext.surface || "selection",
    threshold: preferredContext.threshold || docMapMinDocumentChars,
    kind: preferredContext.kind || "",
    meta: preferredContext.meta || null,
    context: preferredContext,
  }, preferredContext.rangeMode || (preferredContext.isSelection ? "selection" : "source"));
}

function resolveDocMapReadiness(preferredContext = null, options = {}) {
  const rangeMode = options.rangeMode || "auto";
  const preferredSource = docMapSourceFromPreferredContext(preferredContext);
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = activeWin?.dataset.window || "";
  const activeSurface = activeName === "teachText"
    ? "teachtext"
    : activeName === "chatFile"
      ? "documents"
      : activeName;
  const preferredIsSelection = preferredSource?.rangeMode === "selection";
  const context = preferredIsSelection
    ? preferredContext
    : (docMapCanUseSelectionContext(getSelectionServiceContext()) ? getSelectionServiceContext() : null);
  let selectionSource = preferredIsSelection ? preferredSource : docMapSelectionSourceFromContext(context);
  let wholeSource = preferredSource && !preferredIsSelection ? preferredSource : null;
  const contextSurface = preferredIsSelection ? preferredSource.scope : context?.surface;

  if (!wholeSource && contextSurface) wholeSource = docMapWholeSourceForSurface(contextSurface);
  if (!wholeSource) wholeSource = docMapWholeSourceForSurface(activeSurface);
  if (!wholeSource && activeName === "clioStage") wholeSource = docMapSourceFromPreferredContext(preferredContext);

  if (!wholeSource && !selectionSource) {
    wholeSource = docMapSourceFromReaderPage()
      || docMapSourceFromTimeMachine("source")
      || docMapWholeSourceForSurface("teachtext")
      || docMapWholeSourceForSurface("clipboard")
      || docMapWholeSourceForSurface("documents")
      || docMapWholeSourceForSurface("projectCd")
      || docMapWholeSourceForSurface("scrapbook")
      || docMapWholeSourceForSurface("textDisk");
  }

  if (selectionSource && wholeSource) {
    selectionSource = docMapSourceWithRange(selectionSource, "selection", {
      sourceChars: wholeSource.text.length,
    });
  }
  return chooseDocMapSourceCandidate(selectionSource, wholeSource, rangeMode);
}

function resolveDocMapSource(preferredContext = null, options = {}) {
  return resolveDocMapReadiness(preferredContext, options).source;
}

function docMapReadinessForSurface(surface, rangeMode = "auto") {
  const selectionSource = docMapSelectionSourceFromContext(docMapSelectionContextForSurface(surface));
  const wholeSource = docMapWholeSourceForSurface(surface);
  const enrichedSelection = selectionSource && wholeSource
    ? docMapSourceWithRange(selectionSource, "selection", { sourceChars: wholeSource.text.length })
    : selectionSource;
  return chooseDocMapSourceCandidate(enrichedSelection, wholeSource, rangeMode);
}

function renderVideoDocMapSwitchers() {
  return false;
}

function stripDocMapMarkdownFence(markdown) {
  return String(markdown || "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function isExportedDocMapMarkdown(markdown) {
  const text = stripDocMapMarkdownFence(markdown);
  return /^#\s+DocMap\s*[:：]/im.test(text) && /^##\s+Relations\s*$/im.test(text);
}

function docMapRangeLabel(rangeMode = "source") {
  if (rangeMode === "selection") return t("docmap_range_selection");
  if (rangeMode === "selected-items") return t("docmap_range_selected_items");
  return t("docmap_range_source");
}

function syncDocMapEntryButton(button, readiness) {
  if (!button) return;
  button.disabled = !readiness?.ready;
  const source = readiness?.source;
  const rangeMode = source?.rangeMode || "";
  button.dataset.docmapRange = rangeMode;

  let helpKey = "balloon_docmap_no_source";
  let ariaKey = "docmap_button_no_source";
  if (readiness?.state === "too-short") {
    helpKey = "balloon_docmap_too_short";
    ariaKey = "docmap_button_too_short";
  } else if (readiness?.ready && rangeMode === "selection") {
    helpKey = "balloon_docmap_selection";
    ariaKey = "docmap_button_selection";
  } else if (readiness?.ready && rangeMode === "selected-items") {
    helpKey = "balloon_docmap_selected_items";
    ariaKey = "docmap_button_selected_items";
  } else if (readiness?.ready) {
    helpKey = "balloon_docmap_source";
    ariaKey = "docmap_button_source";
  }
  button.dataset.balloonHelp = helpKey;
  button.dataset.balloonHelpDisabled = helpKey;
  button.setAttribute("aria-label", t(ariaKey));
}

let readerDocMapSelectionReceipt = "";

function syncReaderDocMapSelectionStatus(readiness) {
  if (!readerStatusEl) return;
  const selection = readiness?.selectionSource;
  const signature = selection?.text || "";
  if (signature === readerDocMapSelectionReceipt) return;
  readerDocMapSelectionReceipt = signature;
  if (!signature) {
    if (readerStatusEl.dataset.docmapReceipt === "selection") {
      readerStatusEl.textContent = currentReaderPage?.videoTranscript
        ? t("reader_video_transcript_view")
        : t("reader_reading_mode");
      delete readerStatusEl.dataset.docmapReceipt;
    }
    return;
  }
  readerStatusEl.dataset.docmapReceipt = "selection";
  readerStatusEl.textContent = readiness.selectionReady
    ? t("docmap_selection_ready", selection.text.length)
    : readiness.wholeReady
      ? t("docmap_selection_short_source_ready", selection.text.length, selection.threshold)
      : t("docmap_selection_too_short", selection.text.length, selection.threshold);
}

function setDocMapSourceStatus(source, message) {
  if (!source || !message) return;
  if (["reader", "videoTranscript"].includes(source.scope) && readerStatusEl) {
    readerStatusEl.textContent = message;
    readerStatusEl.dataset.docmapReceipt = "handoff";
  }
  if (source.scope === "teachtext" && teachTextSelectionStateEl) teachTextSelectionStateEl.textContent = message;
  if (source.scope === "clipboard" && clipboardMetaEl) clipboardMetaEl.textContent = message;
  if (source.scope === "documents" && chatFileMetaEl) chatFileMetaEl.textContent = message;
  if (source.scope === "scrapbook" && scrapSelectionCountEl) scrapSelectionCountEl.textContent = message;
  if (source.scope === "timeMachine") window.AISystem6TimeMachine?.setStatus?.(message);
  if (source.scope === "clioStage") window.AISystem6ClioStage?.setStatus?.(message);
  setStatus(message, { notify: false });
}

function docMapHandoffStatus(readiness) {
  const source = readiness?.source;
  if (!source) return t("docmap_no_text");
  if (readiness.fellBackToSource) {
    return t("docmap_mapping_source_fallback", readiness.selectionSource?.text?.length || 0, readiness.selectionSource?.threshold || docMapMinSelectionChars);
  }
  return source.rangeMode === "selection"
    ? t("docmap_mapping_selection", source.text.length)
    : source.rangeMode === "selected-items"
      ? t("docmap_mapping_selected_items")
      : t("docmap_mapping_source");
}

function updateDocMapEntryButtons() {
  const readerReadiness = docMapReadinessForSurface("reader");
  const readerSelectionReadiness = docMapReadinessForSurface("reader", "selection");
  const readerSourceReadiness = docMapReadinessForSurface("reader", "source");
  const teachTextReadiness = docMapReadinessForSurface("teachtext");
  const clipboardReadiness = docMapReadinessForSurface("clipboard");
  const scrapbookReadiness = docMapReadinessForSurface("scrapbook");
  const documentsReadiness = docMapReadinessForSurface("documents");

  syncDocMapEntryButton(readerDocMapButton, readerReadiness);
  syncDocMapEntryButton(document.querySelector("#reader-docmap-selection-command"), readerSelectionReadiness);
  syncDocMapEntryButton(document.querySelector("#reader-docmap-source-command"), readerSourceReadiness);
  syncDocMapEntryButton(teachTextDocMapButton, teachTextReadiness);
  syncDocMapEntryButton(clipboardDocMapButton, clipboardReadiness);
  syncDocMapEntryButton(scrapbookDocMapButton, scrapbookReadiness);
  syncDocMapEntryButton(chatFileDocMapButton, documentsReadiness);
  syncReaderDocMapSelectionStatus(readerReadiness);

  const timeMachineButton = document.querySelector("#time-machine-docmap");
  const timeMachineReadiness = window.AISystem6TimeMachine?.docMapReadiness?.();
  if (timeMachineButton && timeMachineReadiness) syncDocMapEntryButton(timeMachineButton, timeMachineReadiness);

  return [readerReadiness, teachTextReadiness, clipboardReadiness, scrapbookReadiness, documentsReadiness, timeMachineReadiness]
    .some((readiness) => readiness?.ready);
}
