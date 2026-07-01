// Feature module: scrapbook.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function compressConversation() {
  const firstUser = conversation.find((item) => item.role === "user")?.content || "";
  const lastAssistant = [...conversation].reverse().find((item) => item.role === "assistant")?.content || "";
  const messages = conversation.length;

  return [
    "Compressed session digest",
    "",
    `Messages: ${messages}`,
    compressedConversationMemory?.text ? `Rolling memory:\n${compressedConversationMemory.text}` : "",
    firstUser ? `First user note: ${firstUser.slice(0, 220)}` : "First user note: [none]",
    lastAssistant ? `Last ClioTalk note: ${lastAssistant.slice(0, 220)}` : "Last ClioTalk note: [none]",
    "",
    "Full raw chat was not retained. Save Chat before clearing when the full transcript matters.",
  ].filter(Boolean).join("\n");
}

function getScrapTimestamp(scrap) {
  const createdAt = scrap?.createdAt ? new Date(scrap.createdAt) : new Date();
  return Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
}

function getScrapTitleSeed(body) {
  const usefulLine = body
    .split("\n")
    .map((line) => line.replace(/^>\s*/, "").trim())
    .find((line) => line && !/^(Context|Before|After|Source|Saved):/i.test(line));

  return usefulLine || "";
}

function autoGenerateScrapTitle(body, createdAt = new Date()) {
  const seed = getScrapTitleSeed(body);
  let title = seed.slice(0, 30).trim();
  if (seed.length > 30) title += "...";
  if (!title) title = "Untitled Scrap";

  const timeStr = getScrapTimestamp({ createdAt }).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${title} (${timeStr})`;
}

function extractScrapTags(body) {
  const commonWords = new Set(["the", "and", "that", "this", "with", "from", "what", "when", "where", "about", "there", "their", "would", "could", "should", "write", "thing", "people", "context", "before", "after", "source", "saved"]);
  const commonChinese = new Set(["这个", "那个", "就是", "因为", "所以", "如果", "但是", "以及", "可以", "需要", "没有", "不是", "一个", "一些", "这些", "那些", "用户", "内容", "文本", "上下文", "助手"]);
  const counts = new Map();
  const add = (tag) => {
    const normalized = tag.replace(/^#/, "").trim().toLowerCase();
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  };

  body.match(/#[\p{Letter}\p{Number}_-]+/gu)?.forEach(add);
  body.match(/\b[a-z][a-z0-9-]{3,}\b/gi)?.forEach((word) => {
    if (!commonWords.has(word.toLowerCase())) add(word);
  });
  body.match(/[\p{Script=Han}]{2,8}/gu)?.forEach((phrase) => {
    if (!commonChinese.has(phrase)) add(phrase);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);
}

function refreshScrapMetadata(scrap, { updateTitle = true } = {}) {
  if (!scrap) return;

  if (updateTitle) {
    scrap.title = autoGenerateScrapTitle(scrap.body, scrap.createdAt);
  }
  const existingTags = Array.isArray(scrap.tags) ? scrap.tags : [];
  const generatedTags = extractScrapTags(scrap.body);
  const sourceTags = scrap.source?.type ? [scrap.source.type] : [];
  scrap.tags = [...new Set([...sourceTags, ...existingTags.filter((tag) => tag === "reader-clip" || tag === "reader-note" || tag === "document-clip" || tag === "search-result" || tag === "web" || tag === "translation" || tag === "video-transcript"), ...generatedTags])].slice(0, 8);
}

function getScrapStack(scrap) {
  const body = scrap?.body || "";
  const tags = scrap?.tags || [];
  if (scrap?.source?.type === "reader-clip" || tags.includes("reader-clip") || tags.includes("search-result") || /\b(URL|Source|Site):/i.test(body)) {
    return "sources";
  }
  if (/Source:\s*(Assistant|ClioTalk)/i.test(body) || body.startsWith("> ")) {
    return "assistant";
  }
  return "ideas";
}

function scrapStackLabel(stack) {
  const labels = {
    sources: t("stack_sources"),
    assistant: t("stack_assistant"),
    ideas: t("stack_ideas"),
  };
  return labels[stack] || t("stack_all");
}

function createScrap(title, body, options = {}) {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }

  const finalBody = body || "";
  const createdAt = new Date().toISOString();
  const scrap = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    title: title || autoGenerateScrapTitle(finalBody, createdAt),
    body: finalBody,
    tags: extractScrapTags(finalBody),
    source: options.source || null,
    selectedText: options.selectedText || "",
    sourceId: options.sourceId || options.source?.sourceId || "",
    sourceTitle: options.sourceTitle || options.source?.sourceTitle || options.source?.title || "",
    sourceKind: options.sourceKind || options.source?.sourceKind || "",
    timeStart: options.timeStart || options.source?.timeStart || "",
    timeEnd: options.timeEnd || options.source?.timeEnd || "",
    originalBlockIds: Array.isArray(options.originalBlockIds)
      ? options.originalBlockIds
      : Array.isArray(options.source?.originalBlockIds)
      ? options.source.originalBlockIds
      : [],
    nearbyContext: options.nearbyContext || options.source?.nearbyContext || null,
    capturedAt: options.capturedAt || options.source?.capturedAt || createdAt,
    translatedText: options.translatedText || "",
    translationLanguage: options.translationLanguage || "",
    translationCreatedAt: options.translationCreatedAt || "",
    translationSource: options.translationSource || "",
    translationModel: options.translationModel || "",
    context: options.context || null,
    createdAt,
  };
  refreshScrapMetadata(scrap, { updateTitle: !title });

  scraps.unshift(scrap);
  selectedScrapId = scrap.id;
  lastClipScrapId = scrap.id;
  renderScraps();
  saveDeskState();
  if (options.reveal !== false) openWindow("scrapbook");
  return scrap;
}

function getAssistantSelection() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || "";

  if (!selection || !text || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentElement
    : range.commonAncestorContainer;
  const message = container?.closest?.(".message.assistant");

  if (!message || !messagesEl.contains(message)) {
    return null;
  }

  const sourceText = message.textContent.replace(/\s+/g, " ").trim();
  const normalizedSelection = text.replace(/\s+/g, " ").trim();
  const selectedIndex = sourceText.indexOf(normalizedSelection);
  const contextRadius = 140;
  const before = selectedIndex >= 0
    ? sourceText.slice(Math.max(0, selectedIndex - contextRadius), selectedIndex).trim()
    : "";
  const after = selectedIndex >= 0
    ? sourceText.slice(selectedIndex + normalizedSelection.length, selectedIndex + normalizedSelection.length + contextRadius).trim()
    : "";

  return {
    text,
    before,
    after,
    time: new Date().toLocaleString(),
  };
}

function formatClip(selection) {
  return [
    `> ${selection.text}`,
    "",
    "Context:",
    selection.before ? `Before: ${selection.before}` : "Before: [start of message]",
    selection.after ? `After: ${selection.after}` : "After: [end of message]",
    "",
    `Source: ClioTalk`,
    `Saved: ${selection.time}`,
  ].join("\n");
}

function clipAssistantSelection() {
  const selection = getAssistantSelection();
  if (!selection) {
    setStatus(t("select_text_first"));
    return;
  }

  const targetId = selectedScrapId || lastClipScrapId;
  const scrap = scraps.find((item) => item.id === targetId && isInActiveProject(item));

  if (!scrap) {
    createScrap(null, formatClip(selection));
    return;
  }

  scrap.body = `${scrap.body.trim()}\n\n---\n\n${formatClip(selection)}`;
  refreshScrapMetadata(scrap);
  selectedScrapId = scrap.id;
  lastClipScrapId = scrap.id;
  renderScraps();
  saveDeskState();
  openWindow("scrapbook");
}

function clipTeachTextSelectionToScrapbook() {
  const start = teachTextBodyInput.selectionStart;
  const end = teachTextBodyInput.selectionEnd;
  const selectedText = teachTextBodyInput.value.slice(start, end).trim();
  if (!selectedText) {
    setStatus(t("select_text_first"));
    return;
  }

  const file = getActiveFile();
  const fileName = file?.name || teachTextNameInput.value.trim() || t("documents");
  const source = file?.source || "TeachText";
  const capturedAt = new Date().toISOString();
  const fullText = teachTextBodyInput.value;
  const contextBefore = fullText.slice(Math.max(0, start - 260), start).replace(/\s+/g, " ").trim();
  const contextAfter = fullText.slice(end, Math.min(fullText.length, end + 260)).replace(/\s+/g, " ").trim();
  const body = [
    "Selected passage:",
    selectedText,
    "",
    "---",
    `Source: ${fileName}`,
    source ? `Origin: ${source}` : "",
    `Time: ${new Date(capturedAt).toLocaleString()}`,
    "",
    "Context before:",
    contextBefore || "[start of document]",
    "",
    "Context after:",
    contextAfter || "[end of document]",
  ].filter(Boolean).join("\n");

  const scrap = createScrap(`Clip: ${selectedText.slice(0, 30)}...`, body, {
    source: {
      type: "document-clip",
      title: fileName,
      fileId: file?.id || "",
      origin: source,
      capturedAt,
    },
    selectedText,
    context: {
      before: contextBefore,
      after: contextAfter,
    },
  });
  if (scrap) {
    scrap.tags = [...new Set(["document-clip", ...(scrap.tags || [])])];
    renderScraps();
    saveDeskState();
    setStatus(t("document_selection_clipped"));
  }
}

function renderAttachedClips() {
  attachedClipsShelfEl.replaceChildren();
  if (attachedClipIds.size === 0) {
    attachedClipsShelfEl.classList.add("is-hidden");
    attachedClipsToolbarEl?.classList.add("is-hidden");
    return;
  }

  attachedClipsShelfEl.classList.remove("is-hidden");
  attachedClipsToolbarEl?.classList.remove("is-hidden");
  const label = document.createElement("b");
  label.textContent = t("attached_context");
  attachedClipsShelfEl.append(label);

  attachedClipIds.forEach(id => {
    const scrap = scraps.find(s => s.id === id);
    if (!scrap) return;

    const btn = document.createElement("button");
    btn.className = "btn mini-btn";
    btn.innerHTML = `<span class="mini-icon text-file-icon"></span><span>${escapeHtml(scrap.title)}</span> <small>×</small>`;
    btn.addEventListener("click", () => {
      attachedClipIds.delete(id);
      renderAttachedClips();
    });
    attachedClipsShelfEl.append(btn);
  });
}

function toggleClipAttachment() {
  const selectedScraps = getSelectedScraps();
  if (!selectedScraps.length) return;

  const allAttached = selectedScraps.every((scrap) => attachedClipIds.has(scrap.id));
  selectedScraps.forEach((scrap) => {
    if (allAttached) attachedClipIds.delete(scrap.id);
    else attachedClipIds.add(scrap.id);
  });
  if (allAttached) {
    setStatus(t("detach"));
  } else {
    setStatus(t("attach_to_assistant"));
    openWindow("assistant");
  }
  renderAttachedClips();
}

function syncScrapSelection(visibleScraps) {
  if (!visibleScraps.length) {
    selectedScrapId = null;
    selectedScrapIds.clear();
    return;
  }
  const visibleIds = new Set(visibleScraps.map((scrap) => scrap.id));
  Array.from(selectedScrapIds).forEach((id) => {
    if (!visibleIds.has(id)) selectedScrapIds.delete(id);
  });
  if (selectedScrapId && visibleIds.has(selectedScrapId) && !selectedScrapIds.size) {
    selectedScrapIds.add(selectedScrapId);
  }
  if ((!selectedScrapId || !visibleIds.has(selectedScrapId)) && visibleScraps[0]) {
    selectedScrapId = visibleScraps[0].id;
    selectedScrapIds.add(selectedScrapId);
  }
}

function getSelectedScraps() {
  const ids = selectedScrapIds.size ? Array.from(selectedScrapIds) : [selectedScrapId];
  return ids
    .map((id) => scraps.find((scrap) => scrap.id === id && isInActiveProject(scrap)))
    .filter(Boolean);
}

function formatScrapForQuestionSheet(scrap, index) {
  const sourceLines = scrap.source?.url
    ? [
        `Source: ${scrap.source.title || scrap.title}`,
        scrap.source.site ? `Site: ${scrap.source.site}` : "",
        `URL: ${scrap.source.url}`,
      ].filter(Boolean)
    : [];
  const selected = scrap.selectedText || scrap.body;
  const contextLines = scrap.context?.before || scrap.context?.after
    ? [
        "",
        "Nearby context:",
        scrap.context.before ? `Before: ${scrap.context.before}` : "",
        scrap.context.after ? `After: ${scrap.context.after}` : "",
      ].filter(Boolean)
    : [];
  return [
    `## Q${index + 1}. ${scrap.title}`,
    ...sourceLines,
    "",
    scrap.source?.type === "reader-clip" ? "Question / note from source:" : "Scrapbook note:",
    selected,
    ...contextLines,
  ].join("\n").trim();
}

function formatScrapsForTransfer(selectedScraps) {
  return selectedScraps
    .map((scrap, index) => `## S${index + 1}. ${scrap.title}\n${scrap.body}`)
    .join("\n\n");
}

function formatScrapsForQuestionSheet(selectedScraps) {
  return selectedScraps.map(formatScrapForQuestionSheet).join("\n\n");
}

function bilingualMarkdownSection({ title, original, translation, language, createdAt, source, model, depth = 1 }) {
  const heading = "#".repeat(Math.max(1, depth));
  const childHeading = "#".repeat(Math.max(2, depth + 1));
  return [
    `${heading} ${title || t("untitled")}`,
    "",
    `${childHeading} ${t("original_text")}`,
    "",
    original || "",
    "",
    `${childHeading} ${t("translation_label")}`,
    "",
    `_${formatTranslationMeta(language, createdAt, source, model)}_`,
    "",
    translation || "",
  ].join("\n").trim();
}

function formatScrapBilingualMarkdown(scrap, depth = 2) {
  if (!scrap) return "";
  return bilingualMarkdownSection({
    title: scrap.title,
    original: scrap.body,
    translation: scrap.translatedText,
    language: scrap.translationLanguage,
    createdAt: scrap.translationCreatedAt,
    source: scrap.translationSource,
    model: scrap.translationModel,
    depth,
  });
}

function scrapHasTranslation(scrap) {
  return !!scrap?.translatedText?.trim();
}

function selectedScrapDisplayBody(scrap) {
  if (!scrapHasTranslation(scrap)) {
    return scrap?.body || "";
  }
  if (scrapTranslationViewMode === "translation") {
    return scrap.translatedText;
  }
  if (scrapTranslationViewMode === "bilingual") {
    return formatScrapBilingualMarkdown(scrap, 1);
  }
  return scrap?.body || "";
}

function scrapListItemHtml(scrap) {
  const stack = getScrapStack(scrap);
  const isClip = stack === "sources";
  const icon = isClip ? '<span class="mini-icon text-file-icon"></span>' : '<span class="mini-icon scrapbook-icon"></span>';
  const contract = sourceContractForScrap(scrap);
  const meta = contract.timeRange
    ? `${contract.title} / ${contract.timeRange}`
    : scrap.source?.site || scrap.source?.title || scrapStackLabel(stack);
  const body = scrap.selectedText || scrap.body || "";
  const date = formatScrapCardDate(scrap.createdAt);
  const preview = body.replace(/\s+/g, " ").trim().slice(0, 72);
  const translationBadge = scrapHasTranslation(scrap)
    ? `<b class="scrap-translation-badge" title="${escapeHtml(t("show_translation"))}">${escapeHtml(t("translation_badge"))}</b>`
    : "";
  const citationCount = typeof getCitingDraftsForSource === "function"
    ? getCitingDraftsForSource(`scrap:${scrap.id}`).length
    : 0;
  const citationBadge = citationCount > 0
    ? `<span class="finder-citation-jump scrap-card-citation-jump" data-citation-jump-key="scrap:${escapeHtml(scrap.id)}" role="button" tabindex="0">${escapeHtml(t("reference_cited_in_n", citationCount))}</span>`
    : "";

  return `
    ${icon}
    <span class="scrap-card-list-title">${escapeHtml(scrap.title)}</span>
    ${translationBadge}
    ${citationBadge}
    <small class="scrap-card-list-meta">${escapeHtml([meta, date].filter(Boolean).join(" - "))}</small>
    <small class="scrap-card-list-stats">${escapeHtml(preview || "--")}</small>
  `;
}

function scrapCardFieldRows(scrap) {
  if (!scrap) return [];
  const source = scrap.source || {};
  const rows = [
    [t("scrap_card_stack"), scrapStackLabel(getScrapStack(scrap))],
    [t("scrap_card_kind"), sourceContractForScrap(scrap).label],
    [t("scrap_card_saved"), formatScrapCardDate(scrap.createdAt)],
  ];
  const contract = sourceContractForScrap(scrap);
  if (source.title || contract.title) rows.push([t("scrap_card_source"), contract.title || source.title]);
  if (contract.sourceKind === "video_transcript") rows.push(["Source kind", "video_transcript"]);
  if (contract.timeRange) rows.push(["SRT time", contract.timeRange]);
  if (contract.originalBlockIds?.length) rows.push(["SRT blocks", contract.originalBlockIds.join(", ")]);
  if (source.site) rows.push([t("scrap_card_site"), source.site]);
  if (source.url) rows.push([t("scrap_card_url"), source.url]);
  if (scrap.translationLanguage) rows.push([t("scrap_card_translation"), scrap.translationLanguage]);
  if (scrap.context?.before || scrap.context?.after) rows.push([t("scrap_card_context"), t("scrap_card_context_saved")]);
  if (scrap.nearbyContext?.before || scrap.nearbyContext?.after) rows.push(["Nearby context", t("scrap_card_context_saved")]);
  return rows.filter(([, value]) => String(value || "").trim());
}

function scrapCardLinkCount(scrap) {
  if (!scrap) return 0;
  const source = scrap.source || {};
  return [
    source.url,
    source.fileId,
    scrap.context?.before || scrap.context?.after,
    scrap.translatedText,
  ].filter((value) => String(value || "").trim()).length;
}

function formatScrapCardDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderScrapTags(scrap) {
  scrapTagsEl.replaceChildren();
  const tags = scrap.tags || extractScrapTags(scrap.body);
  const stack = document.createElement("span");
  stack.className = "tag";
  stack.textContent = scrapStackLabel(getScrapStack(scrap));
  scrapTagsEl.append(stack);

  if (scrapHasTranslation(scrap)) {
    const translation = document.createElement("span");
    translation.className = "tag translation-tag";
    translation.textContent = t("translation_badge");
    translation.title = formatTranslationMeta(scrap.translationLanguage, scrap.translationCreatedAt, scrap.translationSource, scrap.translationModel);
    scrapTagsEl.append(translation);
  }

  tags.forEach(tag => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    scrapTagsEl.append(span);
  });

  if (scrap.source?.url) {
    const source = document.createElement("span");
    source.className = "tag source-tag";
    source.textContent = scrap.source.site || scrap.source.title || "reader";
    source.title = scrap.source.url;
    scrapTagsEl.append(source);
  }
  if (scrap.sourceKind === "video_transcript" || scrap.source?.sourceKind === "video_transcript") {
    const source = document.createElement("span");
    source.className = "tag source-tag";
    source.textContent = "video_transcript";
    source.title = sourceContractForScrap(scrap).timeRange || "";
    scrapTagsEl.append(source);
  }
}

function updateScrapTranslationControls(scrap) {
  const hasTranslation = scrapHasTranslation(scrap);

  if (!hasTranslation) {
    showingScrapTranslation = false;
    scrapTranslationViewMode = "original";
  }

  if (toggleScrapTranslationButton) {
    toggleScrapTranslationButton.hidden = !hasTranslation;
    const labels = {
      original: t("show_translation"),
      translation: t("show_bilingual"),
      bilingual: t("show_original"),
    };
    toggleScrapTranslationButton.textContent = labels[scrapTranslationViewMode] || t("show_translation");
  }

  const readOnlyView = hasTranslation && scrapTranslationViewMode !== "original";
  scrapBodyInput.readOnly = readOnlyView;
  scrapBodyInput.classList.toggle("is-translation-view", readOnlyView);
  scrapBodyInput.classList.toggle("is-bilingual-view", hasTranslation && scrapTranslationViewMode === "bilingual");
}

function getReaderSelectionContext(selection, selectedText, radius = 220) {
  if (!selection?.rangeCount || !selectedText) {
    return { before: "", selected: selectedText, after: "", text: selectedText };
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.parentElement?.closest(".reader-body-content")
    || readerContentEl.querySelector(".reader-body-content")
    || range.commonAncestorContainer.parentElement;
  const fullText = (container?.innerText || currentReaderPage?.text || "").replace(/\s+/g, " ").trim();
  const selected = selectedText.replace(/\s+/g, " ").trim();
  const index = fullText.indexOf(selected);

  if (index < 0) {
    return { before: "", selected: selectedText, after: "", text: selectedText };
  }

  const before = fullText.slice(Math.max(0, index - radius), index).trim();
  const after = fullText.slice(index + selected.length, index + selected.length + radius).trim();
  return {
    before,
    selected: selectedText,
    after,
    text: [before, selectedText, after].filter(Boolean).join(" "),
  };
}

function renderScraps() {
  const projectScraps = getProjectScraps();
  const visibleScraps = selectedScrapStack === "all"
    ? projectScraps
    : projectScraps.filter((scrap) => getScrapStack(scrap) === selectedScrapStack);
  syncScrapSelection(visibleScraps);
  scrapCountEl.textContent = t("scraps_count", visibleScraps.length);
  if (scrapSelectionCountEl) {
    const count = getSelectedScraps().length;
    scrapSelectionCountEl.textContent = count ? t("selected_scraps_count", count) : t("no_scraps_selected");
  }
  if (downloadScrapsBilingualButton) {
    const canExportBilingual = getSelectedScraps().some(scrapHasTranslation);
    downloadScrapsBilingualButton.disabled = !canExportBilingual;
    downloadScrapsBilingualButton.classList.toggle("is-disabled", !canExportBilingual);
  }
  if (scrapStackSelect) scrapStackSelect.value = selectedScrapStack;
  const signature = [
    activeProjectId,
    selectedScrapStack,
    selectedScrapId,
    [...selectedScrapIds].sort().join(","),
    scrapTranslationViewMode,
    showingScrapTranslation,
    currentLanguage,
    collectionVersion(visibleScraps),
  ].join("::");
  if (shouldSkipRender("scraps", signature)) return;
  const fragment = document.createDocumentFragment();
  scrapListEl.replaceChildren();

  if (!visibleScraps.length) {
    selectedScrapId = null;
    selectedScrapIds.clear();
    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "scrap-empty-card";
    empty.innerHTML = `<span class="mini-icon scrapbook-desk-icon"></span><b>${escapeHtml(t("scrapbook"))}</b><small>${escapeHtml(t("no_scraps"))}</small>`;
    empty.disabled = true;
    fragment.append(empty);
    scrapListEl.append(fragment);
    scrapTitleDisplay.textContent = "Untitled Scrap";
    scrapTagsEl.replaceChildren();
    showingScrapTranslation = false;
    scrapTranslationViewMode = "original";
    updateScrapTranslationControls(null);
    renderScrapSourceInfo(null);
    if (openScrapSourceButton) openScrapSourceButton.disabled = true;
    scrapBodyInput.value = "";
    updateDocMapEntryButtons();
    return;
  }

  visibleScraps.forEach((scrap) => {
    const button = document.createElement("button");
    button.type = "button";
    button.draggable = true;
    button.dataset.dragType = "scrap";
    button.dataset.id = scrap.id;
    button.dataset.projectId = scrap.projectId;
    button.className = [
      scrap.id === selectedScrapId ? "is-selected" : "",
      selectedScrapIds.has(scrap.id) ? "is-multi-selected" : "",
    ].filter(Boolean).join(" ");

    button.innerHTML = scrapListItemHtml(scrap);
    if (typeof attachCitationJumpHandler === "function") attachCitationJumpHandler(button);
    button.classList.add(`is-source-${getScrapSourceKind(scrap)}`);
    button.addEventListener("click", (event) => {
      const wasSelected = selectedScrapId === scrap.id;
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        if (selectedScrapIds.has(scrap.id) && selectedScrapIds.size > 1) {
          selectedScrapIds.delete(scrap.id);
        } else {
          selectedScrapIds.add(scrap.id);
        }
      } else {
        selectedScrapIds.clear();
        selectedScrapIds.add(scrap.id);
      }
      selectedScrapId = scrap.id;
      if (!wasSelected) {
        showingScrapTranslation = false;
        scrapTranslationViewMode = "original";
      }
      renderScraps();
    });
    fragment.append(button);
  });
  scrapListEl.append(fragment);

  const selected = visibleScraps.find((scrap) => scrap.id === selectedScrapId) || visibleScraps[0];
  if (selected) {
    selectedScrapId = selected.id;
    scrapTitleDisplay.textContent = selected.title;
    updateScrapTranslationControls(selected);
    scrapBodyInput.value = selectedScrapDisplayBody(selected);
    renderScrapTags(selected);
    renderScrapSourceInfo(selected);
    if (openScrapSourceButton) {
      openScrapSourceButton.disabled = !canOpenScrapSource(selected);
    }
  }
  updateDocMapEntryButtons();
}

function canOpenScrapSource(scrap) {
  const contract = sourceContractForScrap(scrap);
  return (contract.kind === "readerClip" && !!contract.url)
    || (contract.kind === "readerClip" && contract.readerKind === "fileDisk" && !!contract.fileName)
    || (contract.kind === "documentClip" && !!contract.fileId);
}

function renderScrapSourceInfo(scrap) {
  if (!scrapSourceInfoEl) return;
  if (!scrap) {
    scrapSourceInfoEl.innerHTML = `<span>${escapeHtml(t("source_no_origin"))}</span>`;
    return;
  }

  const contract = sourceContractForScrap(scrap);
  const citation = sourceCitationForContextItem({
    kind: "scrap",
    id: scrap.id,
    projectId: scrap.projectId,
    tags: scrap.tags || [],
    sourceType: scrap.source?.type || "",
  });
  scrapSourceInfoEl.innerHTML = `
    <span>${escapeHtml(contract.origin || contract.target || t("source_saved_in_project"))}${citation ? ` - ${escapeHtml(citation)}` : ""}</span>
  `;
}

function updateSelectedScrapMetadata() {
  const scrap = scraps.find((item) => item.id === selectedScrapId && isInActiveProject(item));
  if (!scrap) return;
  if (scrapTranslationViewMode !== "original" && scrapHasTranslation(scrap)) return;

  scrap.body = scrapBodyInput.value;
  refreshScrapMetadata(scrap);

  scrapTitleDisplay.textContent = scrap.title;
  updateScrapTranslationControls(scrap);
  renderScrapTags(scrap);
  renderScrapSourceInfo(scrap);

  const visibleScraps = selectedScrapStack === "all"
    ? getProjectScraps()
    : getProjectScraps().filter((item) => getScrapStack(item) === selectedScrapStack);
  const buttons = scrapListEl.querySelectorAll("button");
  const index = visibleScraps.indexOf(scrap);
  if (buttons[index]) {
    buttons[index].innerHTML = scrapListItemHtml(scrap);
    if (typeof attachCitationJumpHandler === "function") attachCitationJumpHandler(buttons[index]);
  }

  saveDeskState();
}

function toggleScrapTranslationView() {
  const scrap = scraps.find((item) => item.id === selectedScrapId && isInActiveProject(item));
  if (!scrapHasTranslation(scrap)) return;

  const nextMode = {
    original: "translation",
    translation: "bilingual",
    bilingual: "original",
  };
  scrapTranslationViewMode = nextMode[scrapTranslationViewMode] || "original";
  showingScrapTranslation = scrapTranslationViewMode !== "original";
  updateScrapTranslationControls(scrap);
  scrapBodyInput.value = selectedScrapDisplayBody(scrap);
}

function moveScrapToTrash(scrapId) {
  const index = scraps.findIndex((s) => s.id === scrapId && isInActiveProject(s));
  if (index === -1) return;
  const [scrap] = scraps.splice(index, 1);
  purgeContextForTrashedItems([{ type: "scrap", id: scrap.id, item: scrap }]);
  trashItems.unshift({
    projectId: activeProjectId,
    title: scrap.title,
    body: scrap.body,
    originalPath: [projectDisplayName(getActiveProject()), t("scrapbook_label")].filter(Boolean).join(" / "),
    originalType: 'scrap',
    originalData: scrap
  });
  selectedScrapId = getProjectScraps()[0]?.id || null;
  saveDeskState();
  renderScraps();
  renderTrash();
}

function moveFileToTrashById(fileId) {
  const index = chatFiles.findIndex((f) => f.id === fileId && isInActiveProject(f));
  if (index === -1) return;
  const [file] = chatFiles.splice(index, 1);
  removeMountedFilesByName([file.name], file.projectId);
  purgeContextForTrashedItems([{ type: "file", id: file.id, item: file }]);
  trashItems.unshift({
    projectId: activeProjectId,
    title: `${file.name}.${file.type === "text" ? "text" : "chat"}`,
    body: file.type === "text" ? file.body : formatChatFile(file),
    originalPath: getProjectFolderPathLabel(file.folderId || null),
    originalType: 'file',
    originalData: file
  });
  selectedChatFileId = null;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  renderTrash();
  playSystemSound("trash");
}

function renderContextPanel() {
  const listEl = document.querySelector("#context-panel-list");
  const countEl = document.querySelector("#context-panel-count");
  const budgetEl = document.querySelector("#context-panel-budget");
  if (!listEl || !countEl) return;

  const usedContextItems = lastRetrievedContextItems.filter((contextItem) => contextItem.included !== false && !contextItem.excluded);
  const droppedContextItems = lastRetrievedContextItems.length - usedContextItems.length;
  countEl.textContent = t("context_items_count", usedContextItems.length);
  if (budgetEl) {
    const budgetText = lastContextBudget
      ? (lastContextBudget.promptTokens
        ? t("context_budget_token_summary", lastContextBudget.promptTokens, lastContextBudget.contextTokens, lastContextBudget.availableOutputTokens, lastContextBudget.budgetSource, droppedContextItems)
        : t("context_budget_summary", lastContextBudget.usedChars, lastContextBudget.budgetChars, droppedContextItems))
      : t("context_budget_empty");
    const gistText = contextGistBudgetText(lastContextBudget?.gist, lastContextBudget?.gistFallbackReason);
    budgetEl.textContent = gistText ? `${budgetText} · ${gistText}` : budgetText;
  }
  const signature = [
    activeProjectId,
    currentLanguage,
    JSON.stringify(lastContextBudget || {}),
    collectionVersion(lastRetrievedContextItems),
    collectionVersion(projectReferences.filter((reference) => reference.projectId === activeProjectId)),
    collectionVersion(getProjectFiles()),
    collectionVersion(getProjectScraps()),
    [...excludedContextKeys].sort().join(","),
  ].join("::");
  if (shouldSkipRender("contextPanel", signature)) return;
  listEl.replaceChildren();

  if (!lastRetrievedContextItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("no_recent_context");
    listEl.append(empty);
  } else {
    const retrievedTitle = document.createElement("div");
    retrievedTitle.className = "context-section-title";
    retrievedTitle.textContent = t("context_boundary_records");
    listEl.append(retrievedTitle);

    lastRetrievedContextItems.forEach((contextItem) => {
      const item = document.createElement("div");
      item.className = `context-item${contextItem.included === false || contextItem.excluded ? " is-dropped" : ""}`;

      const header = document.createElement("div");
      header.className = "context-header";
      const badge = contextItem.excluded ? t("context_excluded") : contextItem.included === false ? t("context_dropped") : t("context_used");
      const gistRole = contextGistRoleLabel(contextItem.gistRole);
      const badgeText = gistRole && contextItem.included !== false && !contextItem.excluded ? `${badge} · ${gistRole}` : badge;
      const sourceLabel = contextSourceLabel(contextItem);
      header.innerHTML = `<strong title="${escapeHtml(sourceLabel)}">${escapeHtml(sourceLabel)}</strong><span>${escapeHtml(badgeText)}</span>`;

      const body = document.createElement("div");
      body.className = "context-body";
      body.textContent = contextItem.content;

      const footer = document.createElement("div");
      footer.className = "button-row";

      const sourceKey = getContextSourceKey(contextItem);
      if (sourceKey) {
        const openBtn = document.createElement("button");
        openBtn.className = "btn";
        openBtn.textContent = t("open_source");
        openBtn.onclick = () => openCitationContextItem(contextItem);
        footer.append(openBtn);

        const toggleBtn = document.createElement("button");
        toggleBtn.className = "btn";
        toggleBtn.textContent = excludedContextKeys.has(sourceKey) ? t("enable_source") : t("disable_source");
        toggleBtn.onclick = () => {
          if (excludedContextKeys.has(sourceKey)) {
            excludedContextKeys.delete(sourceKey);
          } else {
            excludedContextKeys.add(sourceKey);
          }
          lastRetrievedContextItems = lastRetrievedContextItems.map((item) => ({
            ...item,
            excluded: excludedContextKeys.has(getContextSourceKey(item)),
          }));
          scheduleSettingsSave();
          renderContextPanel();
        };
        footer.append(toggleBtn);
      }

      if (contextItem.kind === 'scrap' || contextItem.kind === 'file') {
        const forgetBtn = document.createElement("button");
        forgetBtn.className = "btn";
        forgetBtn.textContent = t("forget");
        forgetBtn.onclick = async () => {
          const result = await showSystemModal(t("forget_confirm"), "confirm");
          if (result === "yes") {
            if (contextItem.kind === 'scrap') moveScrapToTrash(contextItem.id);
            else moveFileToTrashById(contextItem.id);
            lastRetrievedContextItems = lastRetrievedContextItems.filter((item) => item.id !== contextItem.id);
            renderContextPanel();
          }
        };
        footer.append(forgetBtn);
      }

      item.append(header, body, footer);
      listEl.append(item);
    });
  }

  const sourceRegistry = buildProjectSourceRegistry().filter((source) => sourceTextForRegistryItem(source).trim());
  if (sourceRegistry.length) {
    const sourceTitle = document.createElement("div");
    sourceTitle.className = "context-section-title";
    sourceTitle.textContent = t("source_registry");
    listEl.append(sourceTitle);

    sourceRegistry.forEach((source) => {
      const item = document.createElement("div");
      item.className = `context-item source-registry-item${excludedContextKeys.has(source.key) ? " is-dropped" : ""}`;

      const header = document.createElement("div");
      header.className = "context-header";
      const sourceLabel = sourceLabelFromRegistryItem(source);
      header.innerHTML = `<strong title="${escapeHtml(sourceLabel)}">${escapeHtml(sourceLabel)}</strong><span>${escapeHtml(excludedContextKeys.has(source.key) ? t("context_excluded") : t("context_available"))}</span>`;

      const body = document.createElement("div");
      body.className = "context-body";
      body.textContent = clipContextContent(sourceTextForRegistryItem(source), 360);

      const footer = document.createElement("div");
      footer.className = "button-row";

      const openBtn = document.createElement("button");
      openBtn.className = "btn";
      openBtn.textContent = t("open_source");
      openBtn.onclick = () => openRegistrySource(source);
      footer.append(openBtn);

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "btn";
      toggleBtn.textContent = excludedContextKeys.has(source.key) ? t("enable_source") : t("disable_source");
      toggleBtn.onclick = () => {
        if (excludedContextKeys.has(source.key)) excludedContextKeys.delete(source.key);
        else excludedContextKeys.add(source.key);
        lastRetrievedContextItems = lastRetrievedContextItems.map((contextItem) => ({
          ...contextItem,
          excluded: excludedContextKeys.has(getContextSourceKey(contextItem)),
        }));
        scheduleSettingsSave();
        renderContextPanel();
      };
      footer.append(toggleBtn);

      item.append(header, body, footer);
      listEl.append(item);
    });
  }
}

function contextGistRoleLabel(role) {
  if (role === "raw") return t("context_gist_raw");
  if (role === "revealed") return t("context_gist_revealed");
  if (role === "coarse") return t("context_gist_coarse");
  return "";
}

function contextGistBudgetText(gist, fallbackReason = "") {
  if (!gist) return "";
  const summary = t("context_gist_summary", gist.coarseCards || 0, gist.revealedCards || 0, gist.rawExcerpts || 0, gist.compressionRatio || 1);
  if (gist.usedFallback) return `${summary} · ${t("context_gist_fallback", fallbackReason || gist.budgetSource || "")}`;
  return summary;
}

let selectedTrashItem = null;

function getSelectedTrashItem() {
  if (!selectedTrashItem || !trashItems.includes(selectedTrashItem) || !isInActiveProject(selectedTrashItem)) {
    selectedTrashItem = null;
  }
  return selectedTrashItem;
}

function finishTrashPutAway(item, restored) {
  const itemIndex = trashItems.indexOf(item);
  if (itemIndex !== -1) trashItems.splice(itemIndex, 1);
  selectedTrashItem = null;

  renderScraps();
  renderDocuments();
  renderProjectDisks();
  renderProjectCd();
  renderTrash();
  saveDeskState();
  updateMenuState();
  if (restored) setStatus(t("trash_restored", item.title));
}

function putAwayTrashItem(item) {
  if (!item) return false;
  const restored = restoreTrashItem(item);
  if (!restored) {
    messagesEl.replaceChildren();
    addMessage("assistant", item.body);
    openWindow("assistant");
  }
  finishTrashPutAway(item, restored);
  return restored;
}

function putAwaySelectedTrashItem() {
  const item = getSelectedTrashItem();
  if (!item) return;
  putAwayTrashItem(item);
}

function renderTrash() {
  const visibleTrash = getProjectTrashItems();
  if (!visibleTrash.includes(selectedTrashItem)) selectedTrashItem = null;
  trashCountEl.textContent = t("trash_count", visibleTrash.length);
  trashListEl.replaceChildren();

  const isFull = visibleTrash.length > 0;
  document.querySelectorAll("[data-trash-status-icon]").forEach((trashIcon) => {
    trashIcon.classList.toggle("is-full", isFull);
    trashIcon.dataset.systemIcon = isFull ? "trashFull" : "trash";
    trashIcon.innerHTML = systemIconSvg(trashIcon.dataset.systemIcon);
  });

  if (!visibleTrash.length) {
    const empty = document.createElement("div");
    empty.className = "trash-empty-state";
    empty.textContent = t("trash_empty");
    trashListEl.append(empty);
    return;
  }

  visibleTrash.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("is-selected", item === selectedTrashItem);
    const typeLabel = item.originalType ? t(`trash_type_${item.originalType}`) : t("trash_type_note");
    const path = getTrashOriginalPath(item);
    button.innerHTML = `
      <span>${index + 1}.</span>
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(typeLabel)}${path ? ` · ${escapeHtml(path)}` : ""}</small>
    `;
    button.addEventListener("click", async () => {
      selectedTrashItem = item;
      renderTrash();
      updateMenuState();
    });
    button.addEventListener("dblclick", async () => {
      const result = await showSystemModal(`${t("restore")}: ${item.title}?`, "confirm");
      if (result === "yes") putAwayTrashItem(item);
    });
    trashListEl.append(button);
  });
}

function ensureFolder(name, parentId = selectedFolderId === "all" ? null : selectedFolderId) {
  ensureActiveProject();
  const trimmed = (name || t("default_folder")).trim() || t("default_folder");
  const canonicalName = isDefaultFolderName(trimmed) ? "General" : trimmed;
  const selectedFolder = getSelectedFolder();
  if (selectedFolder && displayFolderName(selectedFolder.name).toLowerCase() === trimmed.toLowerCase()) {
    return selectedFolder;
  }
  const normalizedParentId = parentId && getProjectFolders().some((folder) => folder.id === parentId) ? parentId : null;
  let folder = getProjectFolders().find((item) => {
    if (item.parentId !== normalizedParentId) return false;
    if (isDefaultFolderName(canonicalName) && isDefaultFolderName(item.name)) return true;
    return item.parentId === normalizedParentId && item.name.toLowerCase() === canonicalName.toLowerCase();
  });

  if (!folder) {
    folder = {
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      name: canonicalName,
      parentId: normalizedParentId,
      createdAt: new Date().toISOString(),
    };
    chatFolders.push(folder);
  }

  return folder;
}

function getSelectedScrapText() {
  const selected = getSelectedScraps();
  if (selected.length > 1) return formatScrapsForTransfer(selected);
  const existing = selected[0] || scraps.find((scrap) => scrap.id === selectedScrapId && isInActiveProject(scrap));
  const title = existing?.title || scrapTitleDisplay.textContent.trim();
  const body = existing?.body || scrapBodyInput.value;

  if (!body.trim()) return "";

  return title ? `# ${title}\n\n${body}` : body;
}

function insertScrapIntoPrompt() {
  const text = getSelectedScrapText();
  if (!text) return;

  promptInput.value = promptInput.value.trim()
    ? `${promptInput.value.trim()}\n\n${text}`
    : text;
  openWindow("assistant");
  promptInput.focus();
}

async function askScrapbookQuestion(event) {
  event?.preventDefault();
  const question = (scrapbookQuestionInput?.value || "").trim();
  if (!question) return;
  const selected = getSelectedScraps();
  const sourceScraps = selected.length ? selected : scraps.filter((scrap) => isInActiveProject(scrap));
  if (!sourceScraps.length) return;
  const sourceText = formatScrapsForTransfer(sourceScraps);
  const zh = currentLanguage === "zh";
  const prompt = [
    zh ? "你是 AI System 6 的 Scrapbook 摘录问答员。优先根据下面这些摘录回答用户问题。" : "You are the Scrapbook clip question clerk. Use the Scrapbook clips below as primary grounding.",
    typeof sideAskAnswerStyleInstruction === "function" ? sideAskAnswerStyleInstruction() : (zh ? "回答要短、自然，不要写审稿报告。" : "Be brief and natural; do not write a review report."),
    typeof ragGroundingInstruction === "function" ? ragGroundingInstruction(zh ? "Scrapbook 摘录" : "The Scrapbook clips") : (zh ? "摘录是主要依据，不是回答边界；请区分原文、推断和需要核对的部分。" : "The clips are primary grounding, not the answer boundary; distinguish source text, inference, and points to check."),
    zh ? "不要把摘录之间没有明说的关系说成事实。没有选中摘录时，下面是当前项目的全部摘录；有选中摘录时，优先回答选中摘录。使用自然简体中文。" : "Do not turn unstated relationships between clips into facts.",
    "",
    `${zh ? "用户问题" : "Question"}:\n${question}`,
    "",
    `${zh ? (selected.length ? "选中的 Scrapbook 摘录" : "当前项目全部 Scrapbook 摘录") : (selected.length ? "Selected Scrapbook clips" : "All current project Scrapbook clips")}:`,
    clipContextContent(sourceText, selected.length ? 7000 : 12000),
  ].join("\n");

  if (scrapbookQuestionInput) scrapbookQuestionInput.value = "";
  if (typeof arrangeScrapbookAssistantSplit === "function") await arrangeScrapbookAssistantSplit();
  else await openWindow("assistant");
  setStatus(t("scrapbook_question_sent"));
  await submitUserText(prompt, {
    displayText: `${t("scrapbook")}: ${question}`,
    skipContext: true,
    taskKind: "scrapbook",
  });
}

function sendSelectedScrapsToQuestionSheet() {
  const selected = getSelectedScraps();
  if (!selected.length) return;
  const text = formatScrapsForQuestionSheet(selected);
  const existing = questionSheetBodyInput.value.trim();
  questionSheetBodyInput.value = existing ? `${existing}\n\n${text}` : text;
  savePipelineData();
  openWindow("questionSheet");
  questionSheetBodyInput.focus();
  setStatus(t("scraps_sent_to_question", selected.length));
}

function openSelectedScrapSourceInReader() {
  const selected = getSelectedScraps()[0];
  if (!selected) {
    setStatus(t("no_source_to_open"));
    return;
  }
  const contract = sourceContractForScrap(selected);
  if (contract.kind === "readerClip" && contract.url) {
    readerUrlInput.value = contract.url;
    openWindow("reader");
    fetchReaderPage(contract.url);
    return;
  }
  if (contract.kind === "readerClip" && contract.readerKind === "fileDisk" && contract.fileName) {
    if (contract.sourceKind === "video_transcript" && contract.originalBlockIds?.length && typeof revealReaderVideoTranscriptRange === "function") {
      revealReaderVideoTranscriptRange(contract.fileName, contract.originalBlockIds);
      return;
    }
    const tab = createReaderFileDocumentTab(contract.fileName);
    openWindow("reader");
    openReaderDocumentTab(tab.id);
    return;
  }
  if (contract.kind === "documentClip" && contract.fileId) {
    openTextFile(contract.fileId);
    return;
  }
  setStatus(t("no_source_to_open"));
}

async function outlineSelectedScraps() {
  const selected = getSelectedScraps();
  if (!selected.length) return;
  const project = getActiveProject();
  if (!project) return;
  const sourceText = formatScrapsForTransfer(selected);
  setStatus(t("making_outline"));
  try {
    const prompt = `You are an expert editor. Turn these Scrapbook notes into a clear writing outline.

SCRAPBOOK NOTES:
${sourceText}

Return ONLY the Markdown outline. Use ## headings for draftable sections, with bullets beneath them for details.`;
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.45,
    }, getLongTaskSignal());
    const data = await readChatJson(response);
    const content = data?.choices?.[0]?.message?.content;
    if (content) {
      setProjectOutlineMarkdown(project, content.trim());
      project.updatedAt = new Date().toISOString();
      updateFlowGuideChecklist({ render: false });
      renderPipeline();
      saveDeskState();
      openWindow("outline");
    }
    setStatus(t("ready"));
  } catch (error) {
    setStatus(t("project_reference_error", error.message));
  }
}

function deleteSelectedScrap() {
  const selected = getSelectedScraps();
  if (!selected.length) return;
  const trashedScraps = [];

  selected.forEach((selectedScrap) => {
    const index = scraps.findIndex((scrap) => scrap.id === selectedScrap.id && isInActiveProject(scrap));
    if (index === -1) return;
    const [scrap] = scraps.splice(index, 1);
    attachedClipIds.delete(scrap.id);
    trashedScraps.push(scrap);
    trashItems.unshift({
      projectId: activeProjectId,
      title: `${scrap.title}.scrap`,
      body: scrap.body,
      originalPath: [projectDisplayName(getActiveProject()), t("scrapbook_label")].filter(Boolean).join(" / "),
      originalType: "scrap",
      originalData: scrap,
    });
  });
  purgeContextForTrashedItems(trashedScraps.map((scrap) => ({ type: "scrap", id: scrap.id, item: scrap })));
  renderAttachedClips();
  selectedScrapIds.clear();
  selectedScrapId = getProjectScraps()[0]?.id || null;
  renderScraps();
  if (!selectedScrapId) {
    scrapTitleDisplay.textContent = "Untitled Scrap";
    scrapBodyInput.value = "";
  }
  renderTrash();
  saveDeskState();
  if (selected.length) playSystemSound("trash");
}
