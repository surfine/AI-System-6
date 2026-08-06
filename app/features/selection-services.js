// Feature module: selection-services.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


var lastSelectionServiceContext = null;


function getReaderSelection() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    return { selection: null, text: "" };
  }

  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE
    ? selection.focusNode
    : selection.focusNode?.parentElement;

  if (!anchor || !focus || !readerContentEl.contains(anchor) || !readerContentEl.contains(focus)) {
    return { selection: null, text: "" };
  }

  return { selection, text: selection.toString().trim() };
}

function countSelectionWords(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const cjk = value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
  const latin = value.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ").match(/[\p{L}\p{N}]+/gu)?.length || 0;
  return cjk + latin;
}

function selectionLabelForContext(context) {
  if (!context) return "";
  if (context.surface === "reader") return currentReaderPage?.title || t("reader");
  if (context.surface === "teachtext") return getTeachTextDocumentName({ fallback: "TeachText" });
  if (context.surface === "fileDisk") return teachTextTitleEl.textContent.trim() || t("mounted_text_disk");
  if (context.surface === "scrapbook") return scrapTitleDisplay?.textContent?.trim() || t("scrapbook");
  if (context.surface === "questionSheet") return t("question_sheet");
  if (context.surface === "outline") return t("outline");
  if (context.surface === "sectionDrafts") return t("section_drafts");
  if (context.surface === "assistant") return t("assistant");
  if (context.surface === "documents") return chatFileTitleEl?.textContent?.trim() || t("documents");
  if (context.surface === "clipboard") return clipboardSource || t("clipboard");
  if (context.surface === "styleSheet") return t("style_sheet");
  if (context.surface === "claimCheck") return t("claim_check");
  if (context.surface === "docMap") return t("docmap");
  if (context.surface === "systemHelp") return t("system_help");
  if (context.surface === "notePad") return t("note_pad");
  return context.label || "";
}

function selectionSourceAroundText(fullText, start, end, radius = 180) {
  return {
    before: String(fullText || "").slice(Math.max(0, start - radius), start).replace(/\s+/g, " ").trim(),
    after: String(fullText || "").slice(end, end + radius).replace(/\s+/g, " ").trim(),
  };
}

function selectionMetaFromElement(element) {
  const win = element?.closest?.(".window:not(.is-hidden)");
  const surface = win?.dataset.window || "selection";
  const title = win?.querySelector(".title-bar h1, .title-bar h2")?.textContent?.trim();
  return {
    root: win || document.body,
    surface,
    label: title || selectionLabelForContext({ surface }) || t("selection_services"),
  };
}

function textControlSelectionContext(control, surface, label, extras = {}) {
  if (!control || control.closest?.(".is-hidden")) return null;
  if (typeof control.selectionStart !== "number" || typeof control.selectionEnd !== "number") return null;
  const rawStart = control.selectionStart;
  const rawEnd = control.selectionEnd;
  if (rawEnd <= rawStart) return null;
  const fullText = String(control.value || "");
  const rawText = fullText.slice(rawStart, rawEnd);
  const leading = rawText.match(/^\s*/)?.[0]?.length || 0;
  const trailing = rawText.match(/\s*$/)?.[0]?.length || 0;
  const start = rawStart + leading;
  const end = Math.max(start, rawEnd - trailing);
  const text = fullText.slice(start, end).trim();
  if (!text) return null;
  const around = selectionSourceAroundText(fullText, start, end);
  return {
    surface,
    text,
    start,
    end,
    label: typeof label === "function" ? label() : label,
    inputTarget: control,
    fullText,
    before: around.before,
    after: around.after,
    source: extras.source || null,
    docMapEligible: extras.docMapEligible,
  };
}

function genericTextControlSelectionContext(element) {
  if (!element || !["INPUT", "TEXTAREA"].includes(element.tagName)) return null;
  const inputType = String(element.type || "text").toLowerCase();
  if (/^(button|checkbox|file|hidden|image|password|radio|range|reset|submit)$/.test(inputType)) return null;
  const meta = selectionMetaFromElement(element);
  return textControlSelectionContext(element, meta.surface, meta.label, {
    docMapEligible: false,
  });
}

function teachTextSelectionSurface() {
  const statusKey = teachTextStatusEl?.dataset.statusKey || "";
  if (statusKey === "viewing_mounted_file") return "fileDisk";
  if (statusKey === "viewing_reference") return "teachtext";
  return "teachtext";
}

function teachTextSelectionContext() {
  return textControlSelectionContext(
    teachTextBodyInput,
    teachTextSelectionSurface(),
    () => selectionLabelForContext({ surface: teachTextSelectionSurface() }),
    {
      source: {
        title: teachTextTitleEl?.textContent?.trim() || teachTextNameInput.value.trim() || "TeachText",
        fileId: activeTextFileId || "",
      },
    }
  );
}

function textControlContextFromElement(element) {
  if (!element) return null;
  if (element === teachTextBodyInput) return teachTextSelectionContext();
  if (element === scrapBodyInput) return textControlSelectionContext(element, "scrapbook", () => selectionLabelForContext({ surface: "scrapbook" }));
  if (element === questionSheetBodyInput) return textControlSelectionContext(element, "questionSheet", () => t("question_sheet"));
  if (element === draftBodyInput) return textControlSelectionContext(element, "sectionDrafts", () => t("section_drafts"));
  if (element === promptInput) return textControlSelectionContext(element, "assistant", () => t("assistant"));
  if (element === clipboardTextInput || element === clipboardTranslationTextInput) return textControlSelectionContext(element, "clipboard", () => clipboardSource || t("clipboard"));
  if (element === notePadTextInput) return textControlSelectionContext(element, "notePad", () => t("note_pad"));
  if (element === rebuildFlowSourceInput) return textControlSelectionContext(element, "documents", () => t("rebuild_writing_flow"));
  if (element === dictationRawInput || element === dictationCleanedInput) return textControlSelectionContext(element, "notePad", () => t("dictation_pad"));
  return genericTextControlSelectionContext(element);
}

function activeWindowTextControlContext(activeName) {
  const controlsByWindow = {
    teachText: [teachTextBodyInput],
    scrapbook: [scrapBodyInput],
    questionSheet: [questionSheetBodyInput],
    sectionDrafts: [draftBodyInput],
    assistant: [promptInput],
    clipboard: [clipboardTextInput, clipboardTranslationTextInput],
    notePad: [notePadTextInput],
    rebuildFlow: [rebuildFlowSourceInput],
    dictation: [dictationRawInput, dictationCleanedInput],
  };
  for (const control of controlsByWindow[activeName] || []) {
    const context = textControlContextFromElement(control);
    if (context) return context;
  }
  return null;
}

function elementSelectionContext(root, surface, label, extras = {}) {
  if (!root || root.closest?.(".is-hidden")) return null;
  const selection = window.getSelection();
  const text = selection?.toString().trim() || "";
  if (!selection || !text || !selection.rangeCount) return null;

  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE
    ? selection.focusNode
    : selection.focusNode?.parentElement;
  if (!anchor || !focus || !root.contains(anchor) || !root.contains(focus)) return null;

  const sourceText = root.textContent.replace(/\s+/g, " ").trim();
  const normalizedSelection = text.replace(/\s+/g, " ").trim();
  const selectedIndex = sourceText.indexOf(normalizedSelection);
  const before = selectedIndex >= 0 ? sourceText.slice(Math.max(0, selectedIndex - 180), selectedIndex).trim() : "";
  const after = selectedIndex >= 0 ? sourceText.slice(selectedIndex + normalizedSelection.length, selectedIndex + normalizedSelection.length + 180).trim() : "";
  return {
    surface,
    text,
    selection,
    label: typeof label === "function" ? label() : label,
    before,
    after,
    source: extras.source || null,
    docMapEligible: extras.docMapEligible,
  };
}

function genericElementSelectionContext() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || "";
  if (!selection || !text || !selection.rangeCount) return null;

  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE
    ? selection.focusNode
    : selection.focusNode?.parentElement;
  if (!anchor || !focus) return null;
  if (anchor.closest?.(".menu-popover") || focus.closest?.(".menu-popover")) return null;

  const meta = selectionMetaFromElement(anchor);
  if (!meta.root.contains(focus)) return null;
  return elementSelectionContext(meta.root, meta.surface, meta.label, {
    docMapEligible: false,
  });
}

function readerSelectionContext() {
  const readerSelection = getReaderSelection();
  if (!readerSelection.text) return null;
  return {
    surface: "reader",
    text: readerSelection.text,
    selection: readerSelection.selection,
    label: selectionLabelForContext({ surface: "reader" }),
    source: {
      title: currentReaderPage?.title || t("reader"),
      url: currentReaderPage?.url || readerUrlDisplayEl.textContent || "",
      site: currentReaderPage?.site || "",
    },
  };
}

function assistantSelectionContext() {
  const selection = getAssistantSelection();
  if (!selection) return null;
  return {
    surface: "assistant",
    text: selection.text,
    label: t("assistant"),
    before: selection.before,
    after: selection.after,
    source: { title: t("assistant"), capturedAt: selection.time },
  };
}

function activeWindowElementSelectionContext(activeName) {
  const rootsByWindow = {
    reader: [[readerContentEl, "reader", () => selectionLabelForContext({ surface: "reader" })]],
    assistant: [[messagesEl, "assistant", () => t("assistant")]],
    chatFile: [[chatFileBodyEl, "documents", () => chatFileTitleEl?.textContent?.trim() || t("documents")]],
    outline: [[outlineContentEl, "outline", () => t("outline")]],
    styleSheet: [[styleSheetResultsEl, "styleSheet", () => t("style_sheet")]],
    claimCheck: [[claimResultsEl, "claimCheck", () => t("claim_check")]],
    docMap: [[docMapTreeEl, "docMap", () => t("docmap")]],
  };
  for (const [root, surface, label] of rootsByWindow[activeName] || []) {
    if (surface === "reader") {
      const context = readerSelectionContext();
      if (context) return context;
      continue;
    }
    const context = elementSelectionContext(root, surface, label);
    if (context) return context;
  }
  return null;
}

function getSelectionServiceContext() {
  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)");
  const activeName = activeWin?.dataset.window || "";
  const focusedTextContext = textControlContextFromElement(document.activeElement);
  if (focusedTextContext) return focusedTextContext;

  const activeTextContext = activeWindowTextControlContext(activeName);
  if (activeTextContext) return activeTextContext;

  if (activeName === "reader") {
    const context = readerSelectionContext();
    if (context) return context;
  }

  if (activeName === "assistant") {
    const context = assistantSelectionContext();
    if (context) return context;
  }

  const activeElementContext = activeWindowElementSelectionContext(activeName);
  if (activeElementContext) return activeElementContext;

  return genericElementSelectionContext()
    || teachTextSelectionContext()
    || readerSelectionContext()
    || assistantSelectionContext()
    || elementSelectionContext(chatFileBodyEl, "documents", () => chatFileTitleEl?.textContent?.trim() || t("documents"))
    || elementSelectionContext(outlineContentEl, "outline", () => t("outline"));
}

function rememberSelectionServiceContext(context = getSelectionServiceContext(), { clearMissing = false } = {}) {
  if (context?.text) {
    lastSelectionServiceContext = context;
  } else if (clearMissing) {
    lastSelectionServiceContext = null;
  }
  return lastSelectionServiceContext;
}

function sourceContextText(context) {
  if (!context) return "";
  if (context.surface === "reader") {
    const readerContext = getReaderSelectionContext(context.selection, context.text, 180);
    return [
      context.source?.title || t("reader"),
      context.source?.url || "",
      context.text ? `Selected: ${context.text}` : "",
      readerContext.before ? `Before: ${readerContext.before}` : "",
      readerContext.after ? `After: ${readerContext.after}` : "",
    ].filter(Boolean).join("\n");
  }
  const full = context.fullText || (context.surface === "teachtext" || context.surface === "fileDisk" ? teachTextBodyInput.value : "");
  const before = context.before || (full && Number.isFinite(context.start) ? full.slice(Math.max(0, context.start - 180), context.start).trim() : "");
  const after = context.after || (full && Number.isFinite(context.end) ? full.slice(context.end, context.end + 180).trim() : "");
  return [
    selectionLabelForContext(context),
    context.source?.url || "",
    context.text ? `Selected: ${context.text}` : "",
    before ? `Before: ${before}` : "",
    after ? `After: ${after}` : "",
  ].filter(Boolean).join("\n");
}

async function writeNativeClipboard(text) {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function runSelectionCopy(context = getSelectionServiceContext()) {
  if (!context?.text) {
    setStatus(t("select_text_first"));
    return;
  }
  setClipboard(context.text, selectionLabelForContext(context) || t("selection_services"));
  writeNativeClipboard(context.text);
  renderClipboard();
  openWindow("clipboard");
  setStatus(t("selection_copied"));
}

function runSelectionClip(context = getSelectionServiceContext()) {
  if (!context?.text) {
    setStatus(t("select_text_first"));
    return;
  }
  if (context.surface === "reader") {
    clipReaderSelection();
    return;
  }
  if (context.surface === "teachtext") {
    openWindow("teachText");
    clipTeachTextSelectionToScrapbook();
    return;
  }
  const label = selectionLabelForContext(context) || t("selection_services");
  const body = [
    "Selected passage:",
    context.text,
    "",
    "---",
    `Source: ${label}`,
    context.source?.url ? `URL: ${context.source.url}` : "",
    `Time: ${new Date().toLocaleString()}`,
    "",
    "Context:",
    sourceContextText(context) || label,
  ].filter(Boolean).join("\n");
  const scrap = createScrap(`Clip: ${context.text.slice(0, 30)}...`, body, {
    source: {
      type: `${context.surface || "selection"}-clip`,
      title: label,
      url: context.source?.url || "",
      capturedAt: new Date().toISOString(),
    },
    selectedText: context.text,
    context: {
      before: context.before || "",
      after: context.after || "",
    },
  });
  if (scrap) {
    scrap.tags = [...new Set([`${context.surface || "selection"}-clip`, ...(scrap.tags || [])])];
    renderScraps();
    saveDeskState();
    setStatus(t("document_selection_clipped"));
  }
}

function runSelectionClipFile(context = getSelectionServiceContext()) {
  if (!context?.text) return setStatus(t("select_text_first"));
  withFinderObjects(() => createClippingFromSelectionContext(context));
}

function runSelectionFindSources(context = getSelectionServiceContext()) {
  if (!context?.text) {
    setStatus(t("select_text_first"));
    return;
  }
  if (context.text.length > 420) {
    setStatus(t("selection_long_find_sources"));
    return;
  }
  findPathQueryInput.value = context.text.replace(/\s+/g, " ").slice(0, 500);
  findPathResults.length = 0;
  selectedFindPathIndex = null;
  findPathSummaryEl.classList.add("is-hidden");
  findPathSummaryEl.textContent = "";
  renderFindPathResults();
  openWindow("findPath");
  findPathQueryInput.focus();
  findPathForm.requestSubmit();
}

/**
 * Build the query for Reader's "Find Related Sources" handoff: prefer the
 * current selection inside the Reader page, otherwise the source title.
 *
 * @returns {string}
 */
function readerFindSourcesQuery() {
  const selection = window.getSelection?.()?.toString().trim();
  if (selection) return selection.replace(/\s+/g, " ").slice(0, 200);
  const title = String(currentReaderPage?.title || "").trim();
  if (title) return title.slice(0, 200);
  return "";
}

/**
 * Reader -> Searcher handoff: fill the Searcher query from the loaded source
 * and submit it, so the search surface (and its DeepSeek online-answer
 * provider) stays the only place that searches.
 */
function runReaderFindSources() {
  const query = readerFindSourcesQuery();
  if (!query) {
    setStatus(t("select_text_first"));
    return;
  }
  findPathQueryInput.value = query;
  findPathResults.length = 0;
  selectedFindPathIndex = null;
  findPathSummaryEl.classList.add("is-hidden");
  findPathSummaryEl.textContent = "";
  renderFindPathResults();
  openWindow("findPath");
  findPathQueryInput.focus();
  findPathForm.requestSubmit();
  setStatus(t("find_related_sources_running"));
}

function runSelectionNewNote(context = getSelectionServiceContext()) {
  if (!context?.text) {
    setStatus(t("select_text_first"));
    return;
  }
  appendToNotePad([
    context.text,
    "",
    "---",
    `Source: ${selectionLabelForContext(context) || t("selection_services")}`,
    `Saved: ${new Date().toLocaleString()}`,
  ].join("\n"));
  setStatus(t("selection_note_created"));
}

function runSelectionAskAssistant(context = getSelectionServiceContext()) {
  if (!context?.text) {
    setStatus(t("select_text_first"));
    return;
  }
  promptInput.value = [
    `${t("selection_services")}: ${selectionLabelForContext(context) || ""}`,
    "",
    "Selected text:",
    context.text,
    "",
    sourceContextText(context),
  ].filter(Boolean).join("\n");
  openAssistantAvoidingWindow(sourceWindowForAssistantContext(context));
  promptInput.focus();
  setStatus(t("selection_sent_assistant"));
}

async function runSelectionServiceCommand(command) {
  const context = getSelectionServiceContext() || lastSelectionServiceContext;
  if (command === "lookup") {
    await ensureDictionaryHelpModule();
    return lookupSelectionTerm(context);
  }
  if (command === "find") return runSelectionFindSources(context);
  if (command === "copy") return runSelectionCopy(context);
  if (command === "clip") return runSelectionClip(context);
  if (command === "clip-file") return runSelectionClipFile(context);
  if (command === "translate") return openTranslationPadFromSelection(context);
  if (command === "note") return runSelectionNewNote(context);
  if (command === "ask") return runSelectionAskAssistant(context);
  if (command === "docmap") return withDocMap(() => makeDocMapFromCurrentSource(context));
}
