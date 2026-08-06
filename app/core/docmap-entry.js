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

// Time Machine ships as a lazy module, so its loaded page is reached through
// the window's own accessor rather than a shared variable.
function docMapSourceFromTimeMachine() {
  const source = window.AISystem6TimeMachine?.docMapSource?.();
  return source?.text?.trim() ? source : null;
}

function docMapSourceFromPreferredContext(preferredContext) {
  if (!preferredContext?.text) return null;
  const text = String(preferredContext.text || "").trim();
  if (!text) return null;

  if (docMapCanUseSelectionContext(preferredContext)) {
    return {
      text,
      label: selectionLabelForContext(preferredContext) || t("selection_services"),
      scope: preferredContext.surface,
      context: preferredContext,
      isSelection: true,
      threshold: docMapMinSelectionChars,
    };
  }

  if (!preferredContext.scope && !preferredContext.kind && !preferredContext.meta && !preferredContext.threshold) {
    return null;
  }

  return {
    text,
    label: preferredContext.label || t("docmap"),
    scope: preferredContext.scope || preferredContext.surface || "selection",
    threshold: preferredContext.threshold || docMapMinDocumentChars,
    kind: preferredContext.kind || "",
    meta: preferredContext.meta || null,
    context: preferredContext,
    isSelection: false,
  };
}

function resolveDocMapSource(preferredContext = null) {
  const preferredSource = docMapSourceFromPreferredContext(preferredContext);
  if (preferredSource) return preferredSource;

  const context = getSelectionServiceContext();
  if (docMapCanUseSelectionContext(context)) {
    return {
      text: context.text,
      label: selectionLabelForContext(context) || t("selection_services"),
      scope: context.surface,
      context,
      isSelection: true,
      threshold: docMapMinSelectionChars,
    };
  }

  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = activeWin?.dataset.window || "";
  if (activeName === "reader" && (currentReaderPage?.text || "").trim()) {
    if (currentReaderPage.videoTranscript?.type === "video_transcript") {
      return {
        text: docMapVideoTranscriptText(currentReaderPage.videoTranscript),
        label: currentReaderPage.title || currentReaderPage.fileName || t("reader"),
        scope: "videoTranscript",
        threshold: Math.min(docMapMinDocumentChars, 240),
        kind: "videoTranscript",
        meta: {
          fileName: currentReaderPage.fileName || "",
          sourceId: currentReaderPage.videoTranscript.id || "",
          blocks: currentReaderPage.videoTranscript.blocks || [],
          paragraphs: currentReaderPage.videoTranscript.paragraphs || [],
        },
      };
    }
    return {
      text: currentReaderPage.text.trim(),
      label: currentReaderPage.title || t("reader"),
      scope: "reader",
      threshold: docMapMinDocumentChars,
    };
  }
  if (activeName === "timeMachine") {
    const source = docMapSourceFromTimeMachine();
    if (source) return source;
  }
  if (activeName === "teachText" && teachTextBodyInput.value.trim()) {
    return {
      text: teachTextBodyInput.value.trim(),
      label: getTeachTextDocumentName({ fallback: "TeachText" }),
      scope: "teachtext",
      threshold: docMapMinDocumentChars,
    };
  }
  if (activeName === "scrapbook") {
    const source = docMapSourceFromScrapbook();
    if (source) return source;
  }
  if (activeName === "textDisk") {
    const source = docMapSourceFromFileFloppy();
    if (source) return source;
  }
  if (activeName === "projectCd") {
    const source = docMapSourceFromProjectCd();
    if (source) return source;
  }
  if (activeName === "documents" || activeName === "chatFile") {
    const source = docMapSourceFromSelectedDocument();
    if (source) return source;
  }
  if (activeName === "questionSheet" && questionSheetBodyInput.value.trim()) {
    return {
      text: parseMarkdownDocument(questionSheetBodyInput.value).source.trim(),
      label: t("question_sheet"),
      scope: "questionSheet",
      threshold: docMapMinDocumentChars,
    };
  }
  if (activeName === "outline" && outlineContentEl.value.trim()) {
    return {
      text: parseMarkdownDocument(outlineContentEl.value).source.trim(),
      label: t("outline"),
      scope: "outline",
      threshold: docMapMinDocumentChars,
    };
  }
  if (activeName === "sectionDrafts" && draftBodyInput.value.trim()) {
    return {
      text: parseMarkdownDocument(draftBodyInput.value).source.trim(),
      label: t("section_drafts"),
      scope: "sectionDrafts",
      threshold: docMapMinDocumentChars,
    };
  }
  if (activeName === "notePad" && notePadTextInput.value.trim()) {
    return {
      text: notePadTextInput.value.trim(),
      label: t("note_pad"),
      scope: "notePad",
      threshold: docMapMinDocumentChars,
    };
  }
  if (clipboardText.trim()) {
    return {
      text: clipboardText.trim(),
      label: clipboardSource || t("docmap_source_clipboard"),
      scope: "clipboard",
      threshold: docMapMinDocumentChars,
    };
  }
  if ((currentReaderPage?.text || "").trim()) {
    if (currentReaderPage.videoTranscript?.type === "video_transcript") {
      return {
        text: docMapVideoTranscriptText(currentReaderPage.videoTranscript),
        label: currentReaderPage.title || currentReaderPage.fileName || t("reader"),
        scope: "videoTranscript",
        threshold: Math.min(docMapMinDocumentChars, 240),
        kind: "videoTranscript",
        meta: {
          fileName: currentReaderPage.fileName || "",
          sourceId: currentReaderPage.videoTranscript.id || "",
          blocks: currentReaderPage.videoTranscript.blocks || [],
          paragraphs: currentReaderPage.videoTranscript.paragraphs || [],
        },
      };
    }
    return {
      text: currentReaderPage.text.trim(),
      label: currentReaderPage.title || t("reader"),
      scope: "reader",
      threshold: docMapMinDocumentChars,
    };
  }
  const timeMachineSource = docMapSourceFromTimeMachine();
  if (timeMachineSource) return timeMachineSource;
  if (teachTextBodyInput.value.trim()) {
    return {
      text: teachTextBodyInput.value.trim(),
      label: getTeachTextDocumentName({ fallback: "TeachText" }),
      scope: "teachtext",
      threshold: docMapMinDocumentChars,
    };
  }
  return docMapSourceFromSelectedDocument()
    || docMapSourceFromProjectCd()
    || docMapSourceFromScrapbook()
    || docMapSourceFromFileFloppy();
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

function updateDocMapEntryButtons() {
  const context = getSelectionServiceContext();
  const readerSelection = getReaderSelection();
  const readerText = readerSelection.text || currentReaderPage?.text || "";
  const teachTextSelection = getTeachTextSelectionInfo();
  const teachTextText = teachTextSelection.text || teachTextBodyInput.value || "";
  const sourceIsLongEnough = (source) => !!source?.text && source.text.length >= source.threshold;
  if (readerDocMapButton) {
    const selectedLong = readerSelection.text.length >= docMapMinSelectionChars;
    const pageLong = !!currentReaderPage?.text && currentReaderPage.text.length >= docMapMinDocumentChars;
    readerDocMapButton.disabled = !(selectedLong || pageLong);
  }
  if (teachTextDocMapButton) {
    const selectedLong = teachTextSelection.text.length >= docMapMinSelectionChars;
    const docLong = teachTextBodyInput.value.trim().length >= docMapMinDocumentChars;
    teachTextDocMapButton.disabled = !(selectedLong || docLong);
  }
  if (clipboardDocMapButton) {
    clipboardDocMapButton.disabled = clipboardText.trim().length < docMapMinDocumentChars;
  }
  if (scrapbookDocMapButton) scrapbookDocMapButton.disabled = !sourceIsLongEnough(docMapSourceFromScrapbook());
  if (chatFileDocMapButton) chatFileDocMapButton.disabled = !sourceIsLongEnough(docMapSourceFromSelectedDocument());

  return !!context
    || readerText.length >= docMapMinDocumentChars
    || teachTextText.length >= docMapMinDocumentChars
    || clipboardText.length >= docMapMinDocumentChars
    || sourceIsLongEnough(docMapSourceFromScrapbook())
    || sourceIsLongEnough(docMapSourceFromProjectCd())
    || sourceIsLongEnough(docMapSourceFromFileFloppy())
    || sourceIsLongEnough(docMapSourceFromSelectedDocument());
}
