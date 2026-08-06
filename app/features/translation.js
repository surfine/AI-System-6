// Feature module: translation.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


let selectedStyleSectionIndex = 0;


function detectTextLanguage(text) {
  const value = String(text || "").trim();
  if (value.length < 12 || looksTranslationHostile(value)) return "unknown";

  const sample = value.slice(0, 12000);
  const chinese = (sample.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  const letters = chinese + latin;
  if (letters < 8) return "unknown";

  if (chinese >= 4 && chinese >= latin * 0.12) return "zh";
  if (latin >= 24 && latin > chinese * 2) return "en";
  if (chinese >= 20 && chinese >= latin * 0.18) return "zh";
  if (latin >= 48 && latin > chinese * 2) return "en";
  return "unknown";
}

function looksTranslationHostile(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sample = text.slice(0, 2000);
  const urlOrPathMatches = sample.match(/(https?:\/\/|\/[\w.-]+\/|[A-Za-z]:\\|\.\/|\.\.\/|[\w.-]+\.(js|ts|tsx|jsx|json|md|css|html|py|rb|go|rs|sh|zsh)\b)/g) || [];
  const codeMarks = sample.match(/(```|=>|::|{|}|\bconst\b|\blet\b|\bfunction\b|\bclass\b|\bimport\b|\bexport\b|npm\s+|git\s+|curl\s+)/g) || [];
  const symbolCount = (sample.match(/[{}[\]<>:=|\\/_$#@]/g) || []).length;
  const letterCount = (sample.match(/[\u3400-\u9fffA-Za-z]/g) || []).length || 1;
  const mostlyCommands = lines.length > 0 && lines.length <= 4 && lines.every((line) => /^(npm|pnpm|yarn|git|curl|node|python|python3|cd|mkdir|rm|cp|mv|ls|cat|rg)\b/.test(line));

  return mostlyCommands
    || urlOrPathMatches.length >= 2
    || codeMarks.length >= 3
    || symbolCount / letterCount > 0.65;
}

function languageDisplayName(language) {
  if (language === "zh") return currentLanguage === "zh" ? "中文" : "Chinese";
  if (language === "en") return currentLanguage === "zh" ? "英文" : "English";
  return language || "";
}

function currentTranslationModel() {
  return getLocalModelDisplayName();
}

function formatTranslationMeta(targetLanguage, createdAt = new Date().toISOString(), source = "", model = "") {
  const timestamp = createdAt ? new Date(createdAt).toLocaleString() : new Date().toLocaleString();
  return [t("translation_label"), languageDisplayName(targetLanguage), timestamp, source, model || currentTranslationModel()].filter(Boolean).join(" · ");
}

function getTeachTextTranslationTarget(text) {
  return getTranslationTargetForUi(text);
}

function getTranslationTargetForUi(text) {
  const sourceLanguage = detectTextLanguage(text);
  if (sourceLanguage === "unknown" || sourceLanguage === currentLanguage) return null;
  return currentLanguage;
}

function getTeachTextSelectionInfo() {
  const start = teachTextBodyInput.selectionStart ?? 0;
  const end = teachTextBodyInput.selectionEnd ?? 0;
  const text = end > start ? teachTextBodyInput.value.slice(start, end).trim() : "";
  return { start, end, text };
}

function updateReaderTranslationClipButton() {
  if (!readerClipTranslateButton) return;

  const { text } = getReaderSelection();
  const hasReaderSelection = !!currentReaderPage && !!text;
  const targetLanguage = currentReaderPage && text ? getTranslationTargetForUi(text) : null;

  if (readerClipButton) {
    readerClipButton.hidden = !hasReaderSelection;
    readerClipButton.disabled = !hasReaderSelection;
  }

  if (!targetLanguage) {
    readerClipTranslateButton.hidden = true;
    readerClipTranslateButton.disabled = true;
    readerClipTranslateButton.textContent = t("clip_translate");
    updateDocMapEntryButtons();
    return;
  }

  readerClipTranslateButton.hidden = false;
  readerClipTranslateButton.disabled = false;
  readerClipTranslateButton.textContent = targetLanguage === "zh"
    ? t("clip_translate_to_chinese")
    : t("clip_translate_to_english");
  updateDocMapEntryButtons();
}

function updateTeachTextTranslateButton() {
  if (!teachTextTranslateButton) return;
  const selection = getTeachTextSelectionInfo();
  const selectionTargetLanguage = selection.text ? getTranslationTargetForUi(selection.text) : null;
  if (selection.text) {
    if (!selectionTargetLanguage) {
      teachTextTranslateButton.textContent = t("translate");
      teachTextTranslateButton.hidden = true;
      return;
    }

    teachTextTranslateButton.hidden = false;
    teachTextTranslateButton.textContent = selectionTargetLanguage === "zh"
      ? t("translate_selection_to_chinese")
      : t("translate_selection_to_english");
    return;
  }

  const body = teachTextBodyInput.value.trim();
  const targetLanguage = body ? getTeachTextTranslationTarget(body) : null;

  if (!targetLanguage) {
    teachTextTranslateButton.textContent = t("translate");
    teachTextTranslateButton.hidden = true;
    return;
  }

  teachTextTranslateButton.hidden = false;
  teachTextTranslateButton.textContent = targetLanguage === "zh"
    ? t("translate_to_chinese")
    : t("translate_to_english");
}

function translatedDocumentName(name, targetLanguage) {
  const baseName = (name || t("untitled")).trim() || t("untitled");
  const suffix = targetLanguage === "zh" ? "中文译本" : "English Translation";
  return `${baseName} ${suffix}`;
}

function splitTranslationChunks(text, maxLength = TRANSLATION_CHUNK_MAX_LENGTH) {
  const source = String(text || "");
  if (source.length <= maxLength) return [source];

  const blocks = source.split(/(\n{2,})/);
  const chunks = [];
  let current = "";

  blocks.forEach((block) => {
    if (!block) return;
    if ((current + block).length <= maxLength) {
      current += block;
      return;
    }

    if (current.trim()) {
      chunks.push(current.trimEnd());
      current = "";
    }

    if (block.length <= maxLength) {
      current = block.trimStart();
      return;
    }

    for (let index = 0; index < block.length; index += maxLength) {
      chunks.push(block.slice(index, index + maxLength).trim());
    }
  });

  if (current.trim()) chunks.push(current.trimEnd());
  return chunks.filter(Boolean);
}

async function translateTextChunkWithRetry(text, targetLanguage, options, chunkIndex, totalChunks) {
  const attempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    setStatus(attempt === 1
      ? t("translating_chunk", chunkIndex + 1, totalChunks)
      : t("translation_chunk_retry", chunkIndex + 1, totalChunks));
    try {
      return await translateTextDirectWithLocalModel(text, targetLanguage, {
        ...options,
        title: totalChunks > 1 ? `${options.title || t("untitled")} (${chunkIndex + 1}/${totalChunks})` : options.title,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
    }
  }

  throw new Error(t("translation_chunk_failed", chunkIndex + 1, totalChunks, lastError?.message || "Unknown error"));
}

async function translateTextWithLocalModel(text, targetLanguage, { preserveMarkdown = true, title = "", chunk = true, onProgress = null } = {}) {
  const cacheKey = JSON.stringify({
    text,
    targetLanguage,
    preserveMarkdown,
    model: getLocalModelRequestName(),
    chunk,
  });
  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);
    onProgress?.(cached);
    return cached;
  }

  const shouldChunk = chunk && String(text || "").length > TRANSLATION_CHUNK_THRESHOLD;
  const chunks = shouldChunk ? splitTranslationChunks(text) : [text];
  let translated = "";
  if (chunks.length > 1) {
    const translatedChunks = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const translatedChunk = await translateTextChunkWithRetry(chunks[index], targetLanguage, {
        preserveMarkdown,
        title,
        onProgress: (partial) => {
          onProgress?.([...translatedChunks, partial].filter(Boolean).join("\n\n"));
        },
      }, index, chunks.length);
      translatedChunks.push(translatedChunk);
      onProgress?.(translatedChunks.join("\n\n"));
    }
    translated = translatedChunks.join("\n\n");
  } else {
    translated = await translateTextDirectWithLocalModel(text, targetLanguage, { preserveMarkdown, title, onProgress });
  }

  if (translationCache.size > 80) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(cacheKey, translated);
  return translated;
}

async function translateTextDirectWithLocalModel(text, targetLanguage, { preserveMarkdown = true, title = "", onProgress = null } = {}) {
  const cacheKey = JSON.stringify({
    text,
    targetLanguage,
    preserveMarkdown,
    model: getLocalModelRequestName(),
    chunk: false,
  });
  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);
    onProgress?.(cached);
    return cached;
  }

  const targetName = targetLanguage === "zh" ? "Simplified Chinese" : "English";
  const formatInstruction = preserveMarkdown
    ? "Preserve Markdown structure, headings, lists, citations, code blocks, and filenames."
    : "Preserve paragraph breaks and meaning.";
  const prompt = `Translate this content into ${targetName}.

${formatInstruction}
Do not summarize. Do not add commentary. Return only the translated content.
${title ? `\nTitle: ${title}\n` : ""}
Content:
${text}`;

  const response = await fetchModelPayload({
    model: getLocalModelRequestName(),
    messages: withMarkdownModelMessages([
      { role: "system", content: resolveWritingRoutePrompt("other-apps.translation", "en") },
      { role: "user", content: prompt },
    ]),
    temperature: 0.2,
    ai_system6_task_kind: "translation",
    stream: true,
  }, getLongTaskSignal());

  const translated = (await readModelTextStream(response, {
    signal: getLongTaskSignal(),
    throttleMs: 120,
    onSnapshot: onProgress,
  })).trim();
  if (!translated) throw new Error("lmstudio_bad_response: Empty translation.");
  if (translationCache.size > 80) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(cacheKey, translated);
  return translated;
}

async function translateTeachTextDocument() {
  const selection = getTeachTextSelectionInfo();
  const selectionTargetLanguage = selection.text ? getTranslationTargetForUi(selection.text) : null;
  if (selection.text && selectionTargetLanguage) {
    await translateTeachTextSelection(selection, selectionTargetLanguage);
    return;
  }

  const body = teachTextBodyInput.value.trim();
  if (!body) {
    setStatus(t("teachtext_empty"));
    openWindow("teachText");
    return;
  }
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  if (teachTextStatusEl.dataset.statusKey === "modified" || teachTextStatusEl.dataset.statusKey === "unsaved") {
    const saved = await saveTextDocument();
    if (!saved) return;
  }

  const targetLanguage = getTeachTextTranslationTarget(body);
  if (!targetLanguage) {
    updateTeachTextTranslateButton();
    updateTeachTextBilingualExportButton();
    return;
  }
  const title = getTeachTextDocumentName();

  if (!beginLongTask("translate-document", t("translating_document"))) return;

  try {
    await prepareStreamingMarkdownPreview();
    const translated = await translateTextWithLocalModel(body, targetLanguage, {
      preserveMarkdown: true,
      title,
      onProgress: (partial) => showStreamingTeachTextPreview(partial),
    });
    showStreamingTeachTextPreview(translated, { final: true });

    const folder = ensureFolder(teachTextFolderInput.value);
    const now = new Date().toISOString();
    const name = nextAvailableProjectFileName(translatedDocumentName(title, targetLanguage), activeProjectId);
    const file = {
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      type: "text",
      name,
      folderId: folder.id,
      body: translated,
      source: "Translation",
      durable: true,
      label: "ai",
      createdAt: now,
      updatedAt: now,
    };

    chatFiles.unshift(file);
    selectedChatFileId = file.id;
    teachTextPreviewEl.classList.add("is-hidden");
    teachTextBodyInput.classList.remove("is-hidden");
    teachTextTogglePreviewButton.textContent = t("preview");
    renderDocuments();
    saveDeskState();
    openTextFile(file.id);
    setStatus(t("translated_document_saved", name));
  } catch (error) {
    if (!isAbortError(error)) setStatus(t("translation_failed", error.message));
  } finally {
    endLongTask("translate-document");
    updateTeachTextTranslateButton();
  }
}

async function translateTeachTextSelection(selection, targetLanguage) {
  const title = getTeachTextDocumentName();

  if (!beginLongTask("translate-selection", t("translating_selection"))) return;

  try {
    const translationCreatedAt = new Date().toISOString();
    const translationModel = currentTranslationModel();
    const translated = await translateTextWithLocalModel(selection.text, targetLanguage, {
      preserveMarkdown: true,
      title,
    });
    const insertion = `\n\n[${formatTranslationMeta(targetLanguage, translationCreatedAt, "TeachText selection", translationModel)}]\n${translated.trim()}`;
    const fullText = teachTextBodyInput.value;
    const before = fullText.slice(0, selection.end);
    const after = fullText.slice(selection.end);
    const nextValue = `${before}${insertion}${after}`;

    teachTextBodyInput.value = nextValue;
    const cursor = before.length + insertion.length;
    teachTextBodyInput.selectionStart = cursor;
    teachTextBodyInput.selectionEnd = cursor;
    markTeachTextModified();
    updateTeachTextBoundaries();
    updateTeachTextTranslateButton();
    updateTeachTextBilingualExportButton();
    saveDeskState();
    openWindow("teachText");
    teachTextBodyInput.focus();
    setStatus(t("ready"));
  } catch (error) {
    if (!isAbortError(error)) setStatus(t("translation_failed", error.message));
  } finally {
    endLongTask("translate-selection");
    updateTeachTextTranslateButton();
  }
}

function selectedStyleCheckSection() {
  const sections = getTeachTextSectionBlocks();
  if (!sections.length) return null;
  selectedStyleSectionIndex = Math.max(0, Math.min(sections.length - 1, selectedStyleSectionIndex));
  return sections[selectedStyleSectionIndex];
}

function renderStyleCheckSections() {
  if (!styleSectionSelectEl) return;
  const sections = getTeachTextSectionBlocks();
  const previous = selectedStyleSectionIndex;
  styleSectionSelectEl.replaceChildren();

  if (!sections.length) {
    selectedStyleSectionIndex = 0;
    styleSectionSelectEl.disabled = true;
    [styleSectionPreviousButton, styleSectionNextButton].forEach((button) => {
      if (button) button.disabled = true;
    });
    if (styleSectionMetaEl) styleSectionMetaEl.textContent = t("style_section_empty");
    updateReviewDeskStatusTitle?.();
    return;
  }

  selectedStyleSectionIndex = Math.max(0, Math.min(sections.length - 1, previous));
  sections.forEach((section, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${section.title}`;
    styleSectionSelectEl.append(option);
  });
  styleSectionSelectEl.disabled = false;
  styleSectionSelectEl.value = String(selectedStyleSectionIndex);
  [styleSectionPreviousButton, styleSectionNextButton].forEach((button) => {
    if (button) button.disabled = sections.length < 2;
  });

  const active = sections[selectedStyleSectionIndex];
  if (styleSectionMetaEl) {
    styleSectionMetaEl.textContent = t("style_section_meta", selectedStyleSectionIndex + 1, sections.length, active.title);
  }
  updateReviewDeskStatusTitle?.();
}

function selectStyleCheckSection(index) {
  const sections = getTeachTextSectionBlocks();
  if (!sections.length) {
    renderStyleCheckSections();
    return;
  }
  selectedStyleSectionIndex = Math.max(0, Math.min(sections.length - 1, Number.isFinite(index) ? index : 0));
  selectedClaimSectionIndex = selectedStyleSectionIndex;
  renderStyleCheckSections();
  renderClaimCheckSections();
  revealReviewDeskSection(selectedStyleSectionIndex);
}

function showAdjacentStyleCheckSection(direction) {
  const sections = getTeachTextSectionBlocks();
  if (!sections.length) {
    renderStyleCheckSections();
    return;
  }
  const next = selectedStyleSectionIndex + direction;
  selectStyleCheckSection((next + sections.length) % sections.length);
}

async function runTeachTextStyleCheck(options = {}) {
  if (!ensureTeachTextReviewState({ promoteSavedFinal: true })) return;
  const fullText = teachTextBodyInput.value;
  const selectionStart = teachTextBodyInput.selectionStart || 0;
  const selectionEnd = teachTextBodyInput.selectionEnd || 0;
  const sectionOnly = options.sectionOnly === true;
  const forceFull = options.fullDocument === true;
  const section = sectionOnly ? selectedStyleCheckSection() : null;
  const hasSelection = !sectionOnly && !forceFull && selectionEnd > selectionStart;
  if (sectionOnly && !section?.text) {
    setStatus(t("style_section_empty"));
    renderStyleCheckSections();
    return;
  }
  const body = (sectionOnly ? section.text : hasSelection ? fullText.slice(selectionStart, selectionEnd) : fullText).trim();
  if (!body) {
    setStatus(t("teachtext_empty"));
    return;
  }

  const taskKey = sectionOnly ? "style-check-section" : "style-check";
  const checkingMessage = sectionOnly ? t("checking_style_section", section.title) : t("checking_style");
  if (!beginLongTask(taskKey, checkingMessage)) return;
  openReviewDesk("style");
  renderStyleSheet([], checkingMessage);
  try {
    const outputLanguage = currentLanguage === "zh" ? "Chinese" : "English";
    const scope = sectionOnly ? `selected TeachText section "${section.title}"` : "text";
    const prompt = `${resolveWritingRoutePrompt("other-apps.style-proofread", "en")
      .replace("{{scope}}", scope)
      .replace("{{language}}", outputLanguage)}

TEXT:
${body}`;

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.3,
      max_tokens: 1600,
      stream: false,
    }, getLongTaskSignal());

    const data = await readChatJson(response);
    const content = data?.choices?.[0]?.message?.content;
    if (content) {
      const findings = parseStyleFindings(content);
      styleSheetSourceOffset = sectionOnly ? section.offset : hasSelection ? selectionStart : 0;
      renderStyleSheet(findings);
      setStatus(findings.length ? t("ready") : t("no_style_results"));
    }
  } catch (error) {
    if (!isAbortError(error)) {
      console.error("Style check failed", error);
      renderStyleSheet([], t("style_check_failed"));
      setStatus(t("style_check_failed"));
    }
  } finally {
    endLongTask(taskKey);
  }
}

function parseStyleFindings(raw) {
  const text = String(raw || "").trim();
  if (!text || /^(no style issues found|没有明显风格问题)/i.test(text)) return [];
  const cleanCell = (value, limit = 500) => String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim()
    .slice(0, limit);
  const makeStyleFinding = (item = {}) => ({
    location: cleanCell(item.location, 160),
    type: cleanCell(item.type || "style", 40),
    quote: cleanCell(item.quote, 500),
    problem: cleanCell(item.problem, 500),
    impact: cleanCell(item.impact, 500),
    suggestion: cleanCell(item.suggestion, 700),
    priority: cleanCell(item.priority, 40),
  });
  const tableRows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .filter((line) => !/^\|\s*:?-{3,}:?\s*\|/.test(line))
    .filter((line) => !/\|\s*(location|位置)\s*\|\s*(type|类型)\s*\|/i.test(line));
  if (tableRows.length) {
    const cellsForRow = (row) => row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    return tableRows
      .map((row) => {
        const cells = cellsForRow(row);
        const [location, type, quote, problem, impact, suggestion, priority] = cells;
        return makeStyleFinding({ location, type, quote, problem, impact, suggestion, priority });
      })
      .filter((item) => item.quote && (item.problem || item.suggestion || item.impact))
      .slice(0, 8);
  }
  const sections = text
    .split(/\n(?=(?:#{2,3}\s+|(?:[-*]\s*)?(?:Type|类型|问题类型)\s*[:：]))/)
    .map((section) => section.trim())
    .filter(Boolean);
  const labelValue = (section, labels) => {
    const names = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const nextLabels = [
      "Location", "位置", "Type", "类型", "问题类型", "Quote", "原文", "引文",
      "Problem", "问题", "Impact", "影响", "Suggestion", "建议", "Priority", "优先级",
    ].map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const match = section.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:${names})\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*(?:[-*]\\s*)?(?:${nextLabels})\\s*[:：]|\\n#{2,3}\\s+|$)`, "i"));
    if (match?.[1]?.trim()) return match[1].trim();
    const lineMatch = section.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:${names})\\s*$\\n([\\s\\S]*?)(?=\\n\\s*(?:[-*]\\s*)?(?:${nextLabels})\\s*(?::|：)?\\s*$|\\n#{2,3}\\s+|$)`, "im"));
    return lineMatch?.[1]?.trim() || "";
  };
  const fallbackFindings = sections
    .map((section) => {
      const heading = section.match(/^#{2,3}\s+(.+)$/m)?.[1]?.trim()
        || (/原文|Quote|Problem|问题/.test(section) ? section.split(/\r?\n/)[0]?.trim() : "")
        || "";
      return makeStyleFinding({
        location: labelValue(section, ["Location", "位置"]),
        type: labelValue(section, ["Type", "类型", "问题类型"]) || heading || "style",
        quote: labelValue(section, ["Quote", "原文", "引文"]),
        problem: labelValue(section, ["Problem", "问题"]),
        impact: labelValue(section, ["Impact", "影响"]),
        suggestion: labelValue(section, ["Suggestion", "建议"]),
        priority: labelValue(section, ["Priority", "优先级"]),
      });
    })
    .filter((item) => item.quote && (item.problem || item.suggestion || item.impact))
    .slice(0, 8);
  if (fallbackFindings.length) return fallbackFindings;

  return [{
    location: "",
    type: currentLanguage === "zh" ? "未能结构化解析" : "Unstructured response",
    quote: text.slice(0, 500),
    problem: currentLanguage === "zh" ? "模型回复没有完全按表格或标签格式返回。" : "The model response did not follow the requested table or labeled format.",
    impact: "",
    suggestion: currentLanguage === "zh" ? "请参考下方原始回复，或重新运行风格检查。" : "Use the raw response below as guidance, or rerun the style check.",
    priority: currentLanguage === "zh" ? "可参考" : "can keep",
  }];
}

function renderStyleSheet(findings, message = "") {
  styleSheetFindings = findings;
  updateReviewDeskStats?.();
  if (!styleSheetResultsEl) return;

  if (message) {
    styleSheetResultsEl.innerHTML = `<p class="empty-folder-note">${escapeHtml(message)}</p>`;
    return;
  }
  if (!findings.length) {
    styleSheetResultsEl.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("no_style_results"))}</p>`;
    return;
  }

  styleSheetResultsEl.innerHTML = findings.map((finding, index) => `
    <article class="style-note" data-style-index="${index}">
      <div class="style-note-type">${escapeHtml(finding.type)}</div>
      ${finding.location ? `<p><b>${escapeHtml(currentLanguage === "zh" ? "位置" : "Location")}</b><br>${escapeHtml(finding.location)}</p>` : ""}
      <p><b>${escapeHtml(t("style_quote"))}</b><br>${escapeHtml(finding.quote)}</p>
      <p><b>${escapeHtml(t("style_problem"))}</b><br>${escapeHtml(finding.problem)}</p>
      ${finding.impact ? `<p><b>${escapeHtml(currentLanguage === "zh" ? "影响" : "Impact")}</b><br>${escapeHtml(finding.impact)}</p>` : ""}
      <p><b>${escapeHtml(t("style_suggestion"))}</b><br>${escapeHtml(finding.suggestion)}</p>
      ${finding.priority ? `<p><b>${escapeHtml(currentLanguage === "zh" ? "优先级" : "Priority")}</b><br>${escapeHtml(finding.priority)}</p>` : ""}
      <div class="button-row">
        <button class="btn mini-btn" type="button" data-style-jump="${index}">${escapeHtml(t("style_jump"))}</button>
        <button class="btn mini-btn" type="button" data-style-copy="${index}">${escapeHtml(t("style_copy"))}</button>
      </div>
    </article>
  `).join("");
}

function jumpToStyleFinding(index) {
  const finding = styleSheetFindings[index];
  if (!finding?.quote) return;
  const text = teachTextBodyInput.value;
  const startAt = Math.max(0, styleSheetSourceOffset);
  let start = text.indexOf(finding.quote, startAt);
  if (start < 0) start = text.indexOf(finding.quote);
  if (start < 0) {
    setStatus(t("style_jump_missing"));
    return;
  }
  openWindow("teachText");
  teachTextBodyInput.focus();
  teachTextBodyInput.selectionStart = start;
  teachTextBodyInput.selectionEnd = start + finding.quote.length;
  setStatus(t("ready"));
}

function copyStyleFinding(index) {
  const finding = styleSheetFindings[index];
  if (!finding) return;
  const note = [
    finding.location ? `${currentLanguage === "zh" ? "位置" : "Location"}: ${finding.location}` : "",
    `${currentLanguage === "zh" ? "类型" : "Type"}: ${finding.type}`,
    `${t("style_quote")}: ${finding.quote}`,
    `${t("style_problem")}: ${finding.problem}`,
    finding.impact ? `${currentLanguage === "zh" ? "影响" : "Impact"}: ${finding.impact}` : "",
    `${t("style_suggestion")}: ${finding.suggestion}`,
    finding.priority ? `${currentLanguage === "zh" ? "优先级" : "Priority"}: ${finding.priority}` : "",
  ].filter(Boolean).join("\n");
  setClipboard(note, t("style_sheet"));
  navigator.clipboard?.writeText(note).catch(() => {});
  setStatus(t("style_copied"));
}

function clampPrintToAiText(text, limit = 28000) {
  if (text.length <= limit) return text;
  const headLength = Math.floor(limit * 0.65);
  const tailLength = limit - headLength;
  return [
    text.slice(0, headLength),
    "",
    "[Middle of document omitted to fit the local model budget.]",
    "",
    text.slice(-tailLength),
  ].join("\n");
}

function printToAiTargetLimit(mode, hasSelection) {
  if (hasSelection) return 8000;
  if (["summary", "keyPoints", "list", "table"].includes(mode)) return 12000;
  return 8000;
}

function printToAiRequestOptions(mode) {
  const maxTokensByMode = {
    describeChange: 650,
    proofread: 700,
    rewrite: 750,
    friendly: 650,
    professional: 650,
    concise: 450,
    summary: 260,
    keyPoints: 360,
    list: 420,
    table: 520,
  };
  return {
    maxTokens: maxTokensByMode[mode] || 900,
    temperature: mode === "praise" ? 0.75 : (["summary", "keyPoints", "list", "table", "proofread"].includes(mode) ? 0.2 : 0.35),
    skipContext: true,
    taskKind: `writing-tool-${mode}`,
  };
}

function writingToolsPromptRegistry() {
  return window.AISystem6WritingToolsPrompts || null;
}

function writingToolTextServiceContract({ directWrite = false } = {}) {
  const registry = writingToolsPromptRegistry();
  if (registry?.textServiceContract) {
    return registry.textServiceContract({ directWrite, language: currentLanguage });
  }
  return directWrite
    ? "Direct write-back mode: return only text that can be written into the document; do not add explanations."
    : "ClioTalk mode: do not claim the source text has already been edited.";
}

function writingToolChangeRoutingNote(instruction = "") {
  const registry = writingToolsPromptRegistry();
  if (registry?.changeRoutingNote) {
    return registry.changeRoutingNote(instruction, { language: currentLanguage });
  }
  return "";
}

function writingToolPromptId(mode) {
  const ids = { describeChange: "describe-change", keyPoints: "key-points", reviewPraise: "review-praise" };
  return `writing-tools.${ids[mode] || mode}`;
}

function resolveWritingToolPrompt(mode) {
  return window.AISystem6PromptFilesRuntime?.resolvePromptFile(writingToolPromptId(mode), activeProjectId, currentLanguage)
    || { status: "missing", source: null, path: "", body: "", hash: "" };
}

function writingToolTaskBody(mode, instruction = "", resolvedPrompt = null) {
  const prompt = resolvedPrompt || resolveWritingToolPrompt(mode);
  const replacement = instruction || t("describe_change_default");
  return String(prompt.body || "").replace("{{instruction}}", replacement);
}

function writingToolPromptUnavailable(resolvedPrompt) {
  if (resolvedPrompt?.status === "disabled") {
    setStatus(currentLanguage === "zh" ? "此写作工具提示词已停用。" : "This Writing Tools prompt is disabled for this project.");
    return true;
  }
  if (resolvedPrompt?.status === "missing") {
    setStatus(currentLanguage === "zh" ? "找不到此写作工具提示词文件，无法运行。" : "This Writing Tools prompt file is missing, so it cannot run.");
    return true;
  }
  return false;
}

function buildPrintToAiPrompt(mode, instruction = "", resolvedPrompt = null) {
  const title = getTeachTextDocumentName();
  const rawBody = teachTextBodyInput.value.trim();
  const selection = teachTextBodyInput.value
    .slice(teachTextBodyInput.selectionStart || 0, teachTextBodyInput.selectionEnd || 0)
    .trim();
  const hasSelection = !!selection;
  const body = clampPrintToAiText(rawBody, hasSelection ? 2400 : printToAiTargetLimit(mode, false));
  const selectedText = selection ? `\n\nSELECTED PASSAGE:\n${clampPrintToAiText(selection, printToAiTargetLimit(mode, true))}` : "";
  const sourceText = `DOCUMENT TITLE:\n${title}\n\nDOCUMENT:\n${body}${selectedText}`;
  const targetRule = selection
    ? "Use SELECTED PASSAGE as the target text. Use DOCUMENT only for context."
    : "Use DOCUMENT as the target text.";

  const changeRouting = mode === "describeChange" ? writingToolChangeRoutingNote(instruction) : "";

  const systemIntro = mode === "praise"
    ? "你是一个温暖、具体、懂创作者心理的读者。"
    : "你是 AI System 6，通过 Ask ClioTalk 接收 TeachText 文档并给出中文写作帮助。";
  const systemGuard = mode === "praise"
    ? "结果留在 ClioTalk。只给真诚具体的欣赏，不批评，不重写，不泛泛而谈。"
    : "结果留在 ClioTalk。不要声称你已经直接修改了文档。";

  return [
    systemIntro,
    systemGuard,
    currentLanguage === "zh" ? "使用自然简体中文，避免翻译腔。" : "Use English.",
    writingToolTextServiceContract({ directWrite: false }),
    targetRule,
    changeRouting,
    "",
    `TASK:\n${writingToolTaskBody(mode, instruction, resolvedPrompt)}`,
    "",
    sourceText,
  ].join("\n");
}

function writingToolActiveTextControl() {
  const active = getActiveEditableElement?.();
  if (active && (active.tagName?.toLowerCase() === "textarea" || active.tagName?.toLowerCase() === "input")) return active;

  const activeWin = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "";
  const controlsByWindow = {
    teachText: teachTextBodyInput,
    questionSheet: questionSheetBodyInput,
    outline: outlineContentEl,
    sectionDrafts: draftBodyInput,
    assistant: promptInput,
    notePad: notePadTextInput,
    clipboard: clipboardTextInput,
    dictation: dictationCleanedInput || dictationRawInput,
  };
  return controlsByWindow[activeWin] || null;
}

function writingToolTarget(control, mode) {
  const value = String(control?.value || "");
  const start = Number(control?.selectionStart || 0);
  const end = Number(control?.selectionEnd || 0);
  const selection = start !== end ? value.slice(start, end) : "";
  const target = selection || value;
  return {
    append: ["summary", "keyPoints"].includes(mode),
    end,
    selection,
    start,
    target,
    value,
  };
}

function dispatchWritingToolInput(control) {
  control.dispatchEvent(new Event("input", { bubbles: true }));
  if (control === teachTextBodyInput) {
    markTeachTextAiAssisted?.();
  } else if (control === outlineContentEl || control === draftBodyInput) {
    markTeachTextAiAssisted?.();
    savePipelineData?.();
    if (control === draftBodyInput) updateDraftVoiceStats?.();
  } else if (control === questionSheetBodyInput) {
    savePipelineData?.();
    refreshTeachTextSurfacePreview?.("questionSheet");
  }
}

function applyWritingToolResult(control, target, result) {
  const clean = stripRebuildMarkdownFence(String(result || "")).trim();
  if (!clean) return false;

  if (target.append) {
    const insertionPoint = target.selection ? target.end : control.selectionEnd ?? control.value.length;
    const before = target.value.slice(0, insertionPoint).trimEnd();
    const after = target.value.slice(insertionPoint).trimStart();
    const separator = before ? "\n\n---\n\n" : "";
    control.value = `${before}${separator}${clean}${after ? `\n\n${after}` : ""}`;
    const cursor = `${before}${separator}${clean}`.length;
    control.setSelectionRange?.(cursor, cursor);
  } else if (target.selection) {
    control.value = `${target.value.slice(0, target.start)}${clean}${target.value.slice(target.end)}`;
    control.setSelectionRange?.(target.start, target.start + clean.length);
  } else {
    control.value = clean;
    control.setSelectionRange?.(0, clean.length);
  }

  control.focus();
  dispatchWritingToolInput(control);
  return true;
}

function buildDirectWritingToolPrompt(mode, sourceText, instruction = "", resolvedPrompt = null) {
  const changeRouting = mode === "describeChange" ? writingToolChangeRoutingNote(instruction) : "";
  const writeBackRule = ["summary", "keyPoints"].includes(mode)
    ? "只返回要插入的文本，不要解释。"
    : "只返回可替换原文的文本，不要解释。";
  return [
    "你是 AI System 6 的中文写作工具，正在直接处理用户当前输入框里的文本。",
    currentLanguage === "zh" ? "使用自然中文，避免翻译腔；如果源文本明显是其他语言，可沿用源语言。" : "Use English unless the source text clearly uses another language.",
    writingToolTextServiceContract({ directWrite: true }),
    "如果是改写、润色或续写，源文里的 AI 腔套话不要照搬；要换成具体平实的说法，不要编造事实。",
    changeRouting,
    writeBackRule,
    "",
    `TASK:\n${writingToolTaskBody(mode, instruction, resolvedPrompt)}`,
    "",
    `TARGET TEXT:\n${clampPrintToAiText(sourceText, printToAiTargetLimit(mode, false))}`,
  ].join("\n");
}

async function runDirectWritingTool(mode) {
  const control = writingToolActiveTextControl();
  if (!control) {
    setStatus(t("writing_tool_no_input"));
    return;
  }

  const target = writingToolTarget(control, mode);
  if (!target.target.trim()) {
    setStatus(t("writing_tool_no_input"));
    control.focus();
    return;
  }

  const resolvedPrompt = resolveWritingToolPrompt(mode);
  if (writingToolPromptUnavailable(resolvedPrompt)) return;

  let instruction = "";
  if (mode === "describeChange" || mode === "transform") {
    instruction = await showInputDialog({
      message: t("describe_change_prompt"),
      defaultValue: t("describe_change_default"),
    }) || "";
    if (!instruction.trim()) return;
  }

  if (!beginLongTask("writing-tool", t("writing_tool_running"))) return;
  let result = "";
  try {
    const prompt = buildDirectWritingToolPrompt(mode, target.target, instruction.trim(), resolvedPrompt);
    window.AISystem6PromptFilesRuntime?.recordPromptRun(activeProjectId, writingToolPromptId(mode), resolvedPrompt);
    saveDeskState?.();
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: printToAiRequestOptions(mode).temperature,
      max_tokens: printToAiRequestOptions(mode).maxTokens,
      ai_system6_task_kind: printToAiRequestOptions(mode).taskKind,
    }, getLongTaskSignal());
    const data = await readChatJson(response);
    result = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
  } catch (error) {
    if (!isAbortError(error)) console.error("Writing tool failed", error);
  } finally {
    endLongTask("writing-tool");
  }

  if (!result) {
    setStatus(t("ready"));
    return;
  }

  const preview = clipContextContent(result, 1600);
  const confirmKey = target.append ? "writing_tool_insert_confirm" : "writing_tool_replace_confirm";
  const confirm = await showSystemModal(t(confirmKey, preview), "confirm");
  if (confirm !== "yes") {
    setStatus(t("ready"));
    return;
  }

  if (applyWritingToolResult(control, target, result)) {
    setStatus(t("writing_tool_applied"));
  }
}

function buildSelectionToAiPrompt(mode, context, instruction = "", resolvedPrompt = null) {
  const label = selectionLabelForContext(context) || t("selection_services");
  const selectedText = clampPrintToAiText(context.text, printToAiTargetLimit(mode, true));
  const contextText = sourceContextText(context);
  const changeRouting = mode === "describeChange" ? writingToolChangeRoutingNote(instruction) : "";
  return [
    "你是 AI System 6 的 Ask ClioTalk 选区服务。",
    "只在 ClioTalk 中回答，不要声称已经编辑来源文本；修改结果要方便直接粘贴。",
    currentLanguage === "zh" ? "使用自然简体中文。" : "Use English.",
    writingToolTextServiceContract({ directWrite: false }),
    "把 SELECTED PASSAGE 作为目标文本，CONTEXT 只作背景参考。",
    changeRouting,
    "",
    `TASK:\n${writingToolTaskBody(mode, instruction, resolvedPrompt)}`,
    "",
    `SOURCE:\n${label}`,
    "",
    `SELECTED PASSAGE:\n${selectedText}`,
    contextText ? `\nCONTEXT:\n${clampPrintToAiText(contextText, 2200)}` : "",
  ].filter(Boolean).join("\n");
}

async function sendPrintToAiRequest(mode, publicRequest, hiddenPrompt, sourceWindowName, resolvedPrompt = null) {
  if (activeAbortController) return;
  await openAssistantAvoidingWindow(sourceWindowName);
  addMessage("user", publicRequest);
  const pendingMessage = createPendingMessage();
  startWaitCycle(pendingMessage);

  activeAbortController = new AbortController();
  setComposerBusy(true);
  setStatus(t("thinking"));

  try {
    window.AISystem6PromptFilesRuntime?.recordPromptRun(activeProjectId, writingToolPromptId(mode), resolvedPrompt);
    saveDeskState?.();
    updatePendingMessage(pendingMessage, 1, `${t("consulting_model")}.`);
    const assistantText = await sendToLmStudio(hiddenPrompt, activeAbortController.signal, printToAiRequestOptions(mode));
    updatePendingMessage(pendingMessage, 2, `${t("typesetting_reply")}.`);
    conversation.push({ role: "user", content: publicRequest });
    conversation.push({ role: "assistant", content: assistantText });
    resolvePendingMessage(pendingMessage, "assistant", assistantText);
    setStatus(t("ready"));
  } catch (error) {
    if (error.name === "AbortError") {
      resolvePendingStatus(pendingMessage, t("stopped"));
    } else {
      resolvePendingStatus(pendingMessage, `${t("connection_error")} ${error.message}`);
    }
  } finally {
    stopWaitCycle();
    activeAbortController = null;
    setComposerBusy(false);
  }
}

async function printSelectionToAi(mode, context, resolvedPrompt = null) {
  if (!context?.text) return false;
  let instruction = "";
  if (mode === "describeChange" || mode === "transform") {
    instruction = await showInputDialog({
      message: t("describe_change_prompt"),
      defaultValue: t("describe_change_default"),
    }) || "";
    if (!instruction.trim()) return true;
  }

  const taskLabel = t(mode === "keyPoints" ? "key_points" : mode);
  const sourceLabel = selectionLabelForContext(context) || t("selection_services");
  const publicRequest = t("print_selection_to_ai_request", taskLabel, sourceLabel);
  const hiddenPrompt = buildSelectionToAiPrompt(mode, context, instruction.trim(), resolvedPrompt);
  await sendPrintToAiRequest(mode, publicRequest, hiddenPrompt, sourceWindowForAssistantContext(context), resolvedPrompt);
  return true;
}

async function printTeachTextToAi(mode) {
  if (mode !== "praise" && mode !== "critique" && mode !== "digest" && mode !== "continue") {
    await runDirectWritingTool(mode);
    return;
  }

  const resolvedPrompt = resolveWritingToolPrompt(mode);
  if (writingToolPromptUnavailable(resolvedPrompt)) return;

  const selectionContext = getSelectionServiceContext() || lastSelectionServiceContext;
  if (selectionContext?.text && await printSelectionToAi(mode, selectionContext, resolvedPrompt)) return;

  const body = teachTextBodyInput.value.trim();
  if (!body) {
    setStatus(t("print_to_ai_empty"));
    openWindow("teachText");
    return;
  }

  let instruction = "";
  if (mode === "describeChange" || mode === "transform") {
    instruction = await showInputDialog({
      message: t("describe_change_prompt"),
      defaultValue: t("describe_change_default"),
    }) || "";
    if (!instruction.trim()) return;
  }

  const title = getTeachTextDocumentName();
  const taskLabel = t(mode === "keyPoints" ? "key_points" : mode);
  const publicRequest = t("print_to_ai_request", taskLabel, title);
  const hiddenPrompt = buildPrintToAiPrompt(mode, instruction.trim(), resolvedPrompt);
  await sendPrintToAiRequest(mode, publicRequest, hiddenPrompt, "teachText", resolvedPrompt);
}

async function praiseReviewDeskText() {
  const currentSection = currentReviewDeskSectionBlock() || null;
  const sectionText = (currentSection?.text || reviewDeskBodyInput?.value || "").trim();
  const fullContext = (teachTextBodyInput?.value || reviewDeskBodyInput?.value || "").trim();
  if (!sectionText) {
    setStatus(t("print_to_ai_empty"));
    openWindow("reviewDesk");
    return;
  }
  if (activeAbortController) return;
  const resolvedPrompt = resolveWritingToolPrompt("reviewPraise");
  if (writingToolPromptUnavailable(resolvedPrompt)) return;
  setReviewDeskMode("facts");
  clearReviewFeedbackSlot("facts", currentLanguage === "zh" ? "正在写夸夸我..." : "Writing encouragement...");
  activeAbortController = new AbortController();
  setStatus(currentLanguage === "zh" ? "正在给创作者加一点信心..." : "Writing encouragement...");
  try {
    const prompt = [
      writingToolTaskBody("reviewPraise", "", resolvedPrompt),
      "",
      `CURRENT SECTION${currentSection?.title ? `: ${currentSection.title}` : ""}:`,
      clampPrintToAiText(sectionText, 4200),
      "",
      "WHOLE MANUSCRIPT CONTEXT:",
      clampPrintToAiText(fullContext, 9000),
    ].join("\n");
    window.AISystem6PromptFilesRuntime?.recordPromptRun(activeProjectId, writingToolPromptId("reviewPraise"), resolvedPrompt);
    saveDeskState?.();
    const praise = await sendToLmStudio(prompt, activeAbortController.signal, printToAiRequestOptions("praise"));
    appendReviewFeedbackToBody([
      currentLanguage === "zh" ? "## 夸夸我" : "## Encouragement",
      "",
      praise.trim(),
    ].join("\n"));
    setStatus(t("ready"));
  } catch (error) {
    if (error.name !== "AbortError") setStatus(`${t("connection_error")} ${error.message}`);
  } finally {
    activeAbortController = null;
  }
}

async function reviewSectionAsMingming() {
  const currentSection = currentReviewDeskSectionBlock() || null;
  const sectionText = (currentSection?.text || reviewDeskBodyInput?.value || "").trim();
  const fullContext = (teachTextBodyInput?.value || reviewDeskBodyInput?.value || "").trim();
  if (!sectionText) {
    setStatus(t("print_to_ai_empty"));
    openWindow("reviewDesk");
    return;
  }
  const runningLabel = currentLanguage === "zh" ? "正在代入铭铭视角..." : "Reviewing as Mingming...";
  if (!beginLongTask("mingming-review-section", runningLabel)) return;
  setReviewDeskMode("facts");
  clearReviewFeedbackSlot("facts", runningLabel);
  openReviewDesk("facts");
  try {
    const prompt = buildMingmingReviewPrompt({
      language: currentLanguage,
      sectionText: clampPrintToAiText(sectionText, 5200),
      fullContext: clampPrintToAiText(fullContext, 9000),
    });

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.3,
      max_tokens: 2200,
      ai_system6_task_kind: "critique",
      stream: false,
    }, getLongTaskSignal());
    const data = await readChatJson(response);
    const content = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
    appendReviewFeedbackToBody(content || (currentLanguage === "zh" ? "没有明显的铭铭视角问题。" : "No obvious Mingming-perspective issues found."));
    setStatus(t("ready"));
  } catch (error) {
    if (!isAbortError(error)) {
      const message = `${t("connection_error")} ${error.message}`;
      if (claimResultsEl) claimResultsEl.innerHTML = `<div class="empty-folder-note">${escapeHtml(message)}</div>`;
      setStatus(message);
    }
  } finally {
    endLongTask("mingming-review-section");
  }
}

function systemFolderDocumentTitleKey(documentKey) {
  return {
    readMe: "read_me",
    flow: "flow_readme",
    memory: "memory_readme",
  }[documentKey] || "read_me";
}

async function openSystemFolderDocument(documentKey = "readMe") {
  const documents = await ensureWritingFlowHelpData();
  const document = documents[documentKey] || documents.readMe || {};
  const title = t(systemFolderDocumentTitleKey(documentKey));
  const body = typeof documents.render === "function"
    ? documents.render(documentKey, currentLanguage)
    : document[currentLanguage] || document.en || "";
  selectedChatFileId = null;
  openTeachTextStateInTab({
    title,
    backing: { type: "systemHelp", id: documentKey, locale: currentLanguage },
    state: {
      name: title,
      folder: t("system_folder"),
      body,
      statusKey: "viewing_help",
    },
    helpDocument: true,
    preview: true,
  });
}

async function openWritingFlowHelp() {
  return openSystemFolderDocument("flow");
}
