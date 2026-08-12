// Feature module: findpath.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.


function getSearchProviderLabel() {
  const selected = searchProviderInput?.selectedOptions?.[0];
  return selected?.textContent?.trim() || t("search_auto");
}

function searchProviderLabel(provider) {
  if (provider === "bing") return t("search_bing");
  if (provider === "duckduckgo") return t("search_duckduckgo");
  if (provider === "deepseek") return t("search_deepseek");
  return t("search_auto");
}

function getActiveSearchProviderLabel() {
  const provider = searchProviderInput?.value || "auto";
  if (provider === "auto") return getSearchProviderLabel();
  return searchProviderLabel(provider);
}

function updateSearchProviderLabels() {
  const provider = getSearchProviderLabel();
  document.querySelectorAll('[data-action="selection-find-sources"]').forEach((button) => {
    button.textContent = t("find_sources", provider);
  });
}


async function fetchMoreResults() {
  const query = findPathQueryInput.value.trim();
  if (!query) return;
  if (searchProviderInput?.value === "deepseek") return;

  const currentCount = findPathResults.length;
  const targetCount = getFindPathResultLimit();
  const existingUrls = new Set(findPathResults.map(r => r.url));
  const uniqueResults = [];
  let nextStart = currentCount;
  const moreButton = findPathResultsEl.querySelector(".find-path-more-btn");
  const originalLabel = moreButton?.textContent || "";

  try {
    if (moreButton) {
      moreButton.disabled = true;
      moreButton.textContent = "...";
    }

    for (let attempt = 0; attempt < 4 && uniqueResults.length < targetCount; attempt += 1) {
      const results = await searchFindPath(query, nextStart);
      if (!results.length) break;

      for (const result of results) {
        if (!result.url || existingUrls.has(result.url)) continue;
        existingUrls.add(result.url);
        uniqueResults.push(result);
        if (uniqueResults.length >= targetCount) break;
      }

      nextStart += getFindPathResultLimit();
    }

    if (uniqueResults.length > 0) {
      findPathResults.push(...uniqueResults);
      renderFindPathResults();
      const newItems = findPathResultsEl.querySelectorAll(".find-path-result");
      newItems[currentCount]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (moreButton) {
      moreButton.disabled = false;
      moreButton.textContent = originalLabel;
    }
  } catch (error) {
    if (moreButton) {
      moreButton.disabled = false;
      moreButton.textContent = originalLabel;
    }
    setStatus(t("find_path_error", error.message));
  }
}

function renderFindPathResults() {
  updateFindPathStatusBar();
  findPathResultsEl?.classList.remove("is-hidden");
  const scrollPos = findPathResultsEl.scrollTop;
  findPathResultsEl.replaceChildren();
  const deepSeekProvider = searchProviderInput?.value === "deepseek";

  renderWebAnswerSummary(deepSeekProvider);

  if (!findPathResults.length) {
    if (deepSeekProvider && findPathWebAnswer?.answer) {
      renderFindPathNotice(t("search_answer_no_sources"));
    } else {
      renderFindPathNotice(t("no_find_path_results"));
    }
    synthesizeFindPathButton.hidden = true;
    return;
  }

  synthesizeFindPathButton.hidden = deepSeekProvider;

  // Era result-table header (Sherlock idiom). The header is always in the
  // DOM; only the Platinum / Aqua / Snow Leopard appearance CSS shows it.
  // Rows carry all the same text, so screen readers can skip the header.
  const resultsHeader = document.createElement("div");
  resultsHeader.className = "find-path-results-header";
  resultsHeader.setAttribute("aria-hidden", "true");
  resultsHeader.innerHTML = `
    <span>${escapeHtml(t("searcher_column_name"))}</span>
    <span class="find-path-header-relevance">${escapeHtml(t("searcher_column_relevance"))}</span>
    <span>${escapeHtml(t("searcher_column_site"))}</span>
  `;
  findPathResultsEl.append(resultsHeader);

  findPathResults.forEach((result, index) => {
    const resultText = `${result.title || ""}\n${result.snippet || ""}`.trim();
    const targetLanguage = getTranslationTargetForUi(resultText);
    const hasTranslation = !!result.translation?.trim();
    const item = document.createElement("div");
    item.className = `find-path-result${index === selectedFindPathIndex ? " is-selected" : ""}`;
    item.tabIndex = 0;
    item.role = "button";
    item.title = t("searcher_open_link_hint");
    // Rank-mapped relevance bar (Sherlock idiom): the value is the result's
    // rank order, not a score. Only Platinum / Aqua appearance CSS draws it.
    item.style.setProperty("--find-path-relevance", `${Math.max(12, 96 - index * 7)}%`);
    item.innerHTML = `
      <strong>${escapeHtml(result.title)}</strong>
      <span class="find-path-result-relevance" aria-hidden="true"></span>
      <span>${escapeHtml(result.site || result.url)}</span>
      <p>${escapeHtml(result.snippet || "")}</p>
      ${targetLanguage || hasTranslation ? `
        <div class="find-path-result-actions">
          ${targetLanguage && !hasTranslation ? `<button class="btn mini-btn" type="button" data-find-path-translate="${index}">${escapeHtml(t("translate_result"))}</button>` : ""}
        </div>
      ` : ""}
      ${hasTranslation ? `<div class="find-path-translation"><b>${escapeHtml(formatTranslationMeta(result.translationLanguage, result.translationCreatedAt, "Searcher", result.translationModel))}</b><p>${escapeHtml(result.translation)}</p></div>` : ""}
    `;
    item.addEventListener("click", (event) => {
      if (event.target.closest("[data-find-path-translate]")) return;
      selectedFindPathIndex = index;
      renderFindPathResults();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectedFindPathIndex = index;
        renderFindPathResults();
      }
    });
    item.addEventListener("dblclick", () => {
      if (result.url) window.open(result.url, "_blank");
    });
    findPathResultsEl.append(item);
  });

  if (!deepSeekProvider) {
    // Add the localized pagination button at the end of the list.
    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "find-path-more-btn";
    moreButton.textContent = t("searcher_more_results");
    moreButton.addEventListener("click", fetchMoreResults);
    findPathResultsEl.append(moreButton);
  }

  findPathResultsEl.scrollTop = scrollPos;
}

// DeepSeek provider state: one server-side Responses API call returns the
// cited answer plus the raw search results; both stay temporary until the
// user opens a source in Reader.
let findPathWebAnswer = null;

/**
 * Show the synthesized online answer above the results list. Keeps the
 * existing .find-path-summary surface so no new styling is needed; the
 * disclaimer makes it explicit that the answer is model output, not evidence.
 *
 * @param {boolean} deepSeekProvider
 */
function renderWebAnswerSummary(deepSeekProvider) {
  const answer = deepSeekProvider ? findPathWebAnswer?.answer : "";
  if (!answer) {
    findPathSummaryEl.classList.add("is-hidden");
    findPathSummaryEl.replaceChildren();
    return;
  }
  findPathSummaryEl.classList.remove("is-hidden");
  findPathSummaryEl.replaceChildren();
  const label = document.createElement("div");
  label.className = "hint";
  label.textContent = t("search_answer_label");
  const body = document.createElement("div");
  body.textContent = answer;
  const note = document.createElement("div");
  note.className = "hint";
  note.textContent = t("search_answer_note");
  findPathSummaryEl.append(label, body, note);
  findPathSummaryEl.scrollTop = 0;
}

/**
 * Live preview while the web-search answer streams: label plus accumulated
 * text, replaced by the final summary (with citations) when the stream ends.
 *
 * @param {string} text
 */
function renderWebSearchStreamingText(text) {
  findPathSummaryEl.classList.remove("is-hidden");
  findPathSummaryEl.replaceChildren();
  const label = document.createElement("div");
  label.className = "hint";
  label.textContent = t("search_answer_label");
  const body = document.createElement("div");
  body.textContent = text;
  findPathSummaryEl.append(label, body);
  findPathSummaryEl.scrollTop = 0;
}

/**
 * Run Searcher's DeepSeek online-answer provider. The server calls the
 * Responses API web_search tool once and returns the cited answer plus the
 * search results; this function keeps the answer in module state and returns
 * the results so the ordinary result-list rendering can continue to own them.
 *
 * @param {string} query
 * @returns {Promise<Array<{ title: string, url: string, snippet: string, site: string }>>}
 */
async function runWebAnswerSearch(query) {
  findPathWebAnswer = null;
  const response = await fetch("/api/search/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      mode: "answer",
      stream: true,
      ...cloudCredentialTransportFields(),
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const result = await readWebSearchStream(response, {
    onDelta: (text) => renderWebSearchStreamingText(text),
  });
  findPathWebAnswer = {
    answer: String(result.answer || ""),
    citations: Array.isArray(result.citations) ? result.citations : [],
    results: webSearchCitationsToResults(result.citations),
  };
  renderWebAnswerSummary(true);
  return findPathWebAnswer.results;
}

/**
 * Derive a bare site label from a citation URL for the results list.
 *
 * @param {string} url
 * @returns {string}
 */
function webSearchSiteFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Turn web-search citations into ordinary Searcher result items, so the
 * existing selection / Open in Reader / Clip / Copy / Insert actions keep
 * working in DeepSeek mode (the Responses API returns no raw result list).
 *
 * @param {Array<{ url?: string, title?: string }>} [citations]
 * @returns {Array<{ title: string, url: string, snippet: string, site: string }>}
 */
function webSearchCitationsToResults(citations) {
  return (Array.isArray(citations) ? citations : [])
    .filter((citation) => citation && citation.url)
    .map((citation) => ({
      title: String(citation.title || citation.url),
      url: String(citation.url),
      snippet: "",
      site: webSearchSiteFromUrl(citation.url),
    }));
}

function renderFindPathNotice(message, tone = "") {
  const note = document.createElement("div");
  note.className = `empty-folder-note find-path-notice${tone ? ` is-${tone}` : ""}`;
  note.textContent = message;
  findPathResultsEl.append(note);
}

function normalizeFindPathErrorMessage(error) {
  const raw = String(error?.message || error || "").trim();
  const provider = getActiveSearchProviderLabel();
  if (!raw) return t("searcher_connection_failed", provider);
  try {
    const payload = JSON.parse(raw);
    return normalizeFindPathErrorMessage(payload.detail || payload.error);
  } catch {
    if (/fetch failed|cannot reach|cannot resolve|network|dns|firewall|tls/i.test(raw)) {
      return t("searcher_connection_failed", provider);
    }
    return raw;
  }
}

async function translateFindPathResult(index) {
  const result = findPathResults[index];
  if (!result) return;

  const content = [
    result.title,
    result.site ? `Source: ${result.site}` : "",
    result.snippet || "",
  ].filter(Boolean).join("\n");
  const targetLanguage = getTranslationTargetForUi(content);
  if (!targetLanguage) return;

  const translateButton = findPathResultsEl.querySelector(`[data-find-path-translate="${index}"]`);
  const originalLabel = translateButton?.textContent || "";
  if (translateButton) {
    translateButton.disabled = true;
    translateButton.textContent = t("translating_selection");
  }
  setStatus(t("translating_selection"));

  try {
    result.translation = await translateTextWithLocalModel(content, targetLanguage, {
      preserveMarkdown: false,
      title: result.title,
    });
    result.translationLanguage = targetLanguage;
    result.translationCreatedAt = new Date().toISOString();
    result.translationSource = "Searcher";
    result.translationModel = currentTranslationModel();
    renderFindPathResults();
    setStatus(t("result_translated"));
  } catch (error) {
    setStatus(t("translation_failed", error.message));
  } finally {
    if (translateButton) {
      translateButton.disabled = false;
      translateButton.textContent = originalLabel;
    }
  }
}

async function synthesizeFindPath() {
  if (findPathResults.length === 0) return;

  const originalLabel = synthesizeFindPathButton.textContent;
  synthesizeFindPathButton.textContent = "...";
  synthesizeFindPathButton.disabled = true;

  try {
    const context = findPathResults.map((r, i) => `[${i+1}] ${r.title}: ${r.snippet}`).join("\n\n");
    const query = findPathQueryInput.value.trim();

    const prompt = `请根据下面关于“${query}”的搜索结果，生成一段简洁、可靠的研究摘要（3-4 句）。聚焦核心含义和事实，不要编造搜索结果中没有的信息。使用与搜索结果一致的语言；如果主要是中文，使用自然简体中文。

Search Results:
${context}`;

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.7,
      max_tokens: 500,
    }, getLongTaskSignal());

    if (!response.ok) throw new Error("AI Synthesis failed");
    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();

    if (summary) {
      findPathSummaryEl.textContent = summary;
      findPathSummaryEl.classList.remove("is-hidden");
      findPathSummaryEl.scrollTop = 0;
    }
  } catch (error) {
    console.error(error);
    setStatus(t("find_path_error", error.message));
  } finally {
    synthesizeFindPathButton.textContent = originalLabel;
    synthesizeFindPathButton.disabled = false;
  }
}

function getSelectedFindPath() {
  if (selectedFindPathIndex === null) return null;
  return findPathResults[selectedFindPathIndex] || null;
}

function formatFindPathMarkdown(result) {
  return [
    `### ${result.title}`,
    "",
    result.site ? `Source: ${result.site}` : "",
    result.snippet || "",
    result.translation ? `\n${t("translation_label")}:\n${result.translation}` : "",
    result.url || "",
  ].filter(Boolean).join("\n");
}

function insertFindPathIntoTeachText() {
  const result = getSelectedFindPath();
  if (!result) {
    setStatus(t("select_find_path_first"));
    return;
  }

  insertIntoTeachText(formatFindPathMarkdown(result), {
    source: "Searcher",
    title: result.title || t("find_path"),
    url: result.url || "",
  });
}

function copySelectedFindPath() {
  const result = getSelectedFindPath();
  if (!result) {
    setStatus(t("select_find_path_first"));
    return;
  }

  copyMarkdown(formatFindPathMarkdown(result));
}

function clipSelectedFindPath() {
  const result = getSelectedFindPath();
  if (!result) {
    setStatus(t("select_find_path_first"));
    return;
  }

  const body = [
    result.title,
    "",
    result.snippet || "",
    result.translation ? `${t("translation_label")}:\n${result.translation}` : "",
    "",
    "---",
    result.site ? `Source: ${result.site}` : "",
    result.url ? `URL: ${result.url}` : "",
    findPathQueryInput.value.trim() ? `Query: ${findPathQueryInput.value.trim()}` : "",
    `Time: ${new Date().toLocaleString()}`,
  ].filter(Boolean).join("\n");
  const scrap = createScrap(`Search: ${result.title.slice(0, 36)}`, body, {
    translatedText: result.translation || "",
    translationLanguage: result.translationLanguage || "",
    translationCreatedAt: result.translationCreatedAt || "",
    translationSource: result.translationSource || (result.translation ? "Searcher" : ""),
    translationModel: result.translationModel || "",
  });
  if (scrap) {
    scrap.tags = ["search-result", "web"];
    renderScraps();
    saveDeskState();
    setStatus(t("find_path_clipped"));
  }
}

async function searchFindPath(query, start = 0) {
  const limit = getFindPathResultLimit();
  const provider = searchProviderInput?.value || "auto";
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}&start=${start}&provider=${encodeURIComponent(provider)}`);

  if (!response.ok) {
    throw new Error(serviceErrorDetail(response.status, await response.text()));
  }

  const data = await response.json();
  if (findPathProviderEl && data.actualProvider && data.actualProvider !== provider) {
    findPathProviderEl.textContent = searchProviderLabel(data.actualProvider);
  }
  return data.results || [];
}

function getFindPathResultLimit() {
  return Math.min(Math.max(Number(findPathLimitInput?.value || 5), 3), 8);
}

function updateFindPathStatusBar() {
  if (findPathProviderEl) {
    findPathProviderEl.textContent = getSearchProviderLabel();
  }
  if (findPathCountEl) {
    findPathCountEl.textContent = searchProviderInput?.value === "deepseek"
      ? t("search_source_count", findPathResults.length)
      : t("search_result_count", findPathResults.length);
  }
}

function findFileHaystack(...parts) {
  return parts.filter(Boolean).join("\n").toLowerCase();
}

function findFileMatch(query, ...parts) {
  if (!query) return true;
  return findFileHaystack(...parts).includes(query.toLowerCase());
}

function getFindFileCandidates() {
  const project = getActiveProject();
  if (!project) return [];

  const candidates = [];
  getProjectFolders().forEach((folder) => {
    candidates.push({
      id: folder.id,
      type: "folder",
      name: displayFolderName(folder.name),
      kind: t("folder_kind"),
      path: getProjectFolderPathLabel(folder.parentId || null),
      modifiedAt: folder.updatedAt || folder.createdAt,
      text: getFolderPath(folder.id).join(" / "),
      open: () => openProjectFinderFolder(folder.id),
      reveal: () => revealFindFileFolder(folder),
    });
  });

  getProjectFiles().forEach((file) => {
    const body = file.type === "text" ? (file.body || "") : formatChatFile(file);
    candidates.push({
      id: file.id,
      type: "file",
      name: file.name || t("untitled"),
      kind: file.type === "text" ? t("kind_teachtext") : t("kind_chat"),
      path: getProjectFolderPathLabel(file.folderId || null),
      modifiedAt: file.updatedAt || file.createdAt,
      text: body,
      open: () => {
        selectedChatFileId = file.id;
        if (file.type === "text") openTextFile(file.id);
        else openChatFileWindow(file.id);
      },
      reveal: () => revealFindFileFile(file),
    });
  });

  getProjectScraps().forEach((scrap) => {
    candidates.push({
      id: scrap.id,
      type: "scrap",
      name: scrap.title || t("untitled"),
      kind: t("kind_scrap"),
      path: [projectDisplayName(project), t("scrapbook_label")].join(" / "),
      modifiedAt: scrap.updatedAt || scrap.createdAt,
      text: scrap.body || scrap.selectedText || "",
      open: () => {
        selectedScrapId = scrap.id;
        selectedScrapIds.clear();
        selectedScrapIds.add(scrap.id);
        selectedScrapStack = "all";
        renderScraps();
        openWindow("scrapbook");
      },
      reveal: () => revealFindFileSystemRoot("scrapbook"),
    });
  });

  projectReferences.filter((reference) => reference.projectId === activeProjectId).forEach((reference) => {
    const text = getProjectReferenceText(reference);
    candidates.push({
      id: reference.id,
      type: "source",
      name: reference.name || t("source"),
      kind: t("project_sources"),
      path: [projectDisplayName(project), t("finder_sources")].join(" / "),
      modifiedAt: reference.updatedAt || reference.createdAt,
      text,
      open: () => {
        selectedProjectReferenceId = reference.id;
        openSelectedProjectReference();
      },
      reveal: () => revealFindFileSystemRoot("sources"),
    });
  });

  getProjectCdItems(activeProjectId).forEach((item) => {
    candidates.push({
      id: item.id,
      type: "projectCd",
      name: item.title || t("project_cd"),
      kind: t("project_cd"),
      path: [projectDisplayName(project), t("project_cd")].join(" / "),
      modifiedAt: item.updatedAt || item.burnedAt,
      text: item.body || "",
      open: () => {
        selectedProjectCdItemId = item.id;
        selectedProjectCdItemIds.clear();
        selectedProjectCdItemIds.add(item.id);
        renderProjectCd();
        openWindow("projectCd");
      },
      reveal: () => revealFindFileSystemRoot("project-cd"),
    });
  });

  return candidates;
}

function runFindFileSearch() {
  const query = findFileQueryInput?.value.trim() || "";
  findFileResults.splice(0, findFileResults.length);
  selectedFindFileIndex = null;
  if (query) {
    findFileResults.push(...getFindFileCandidates().filter((item) => findFileMatch(query, item.name, item.kind, item.path, item.text)));
  }
  renderFindFileResults();
}

function renderFindFileResults() {
  if (!findFileResultsEl) return;
  const project = getActiveProject();
  if (findFileScopeEl) findFileScopeEl.textContent = project ? projectDisplayName(project) : t("project_disk");
  if (findFileCountEl) findFileCountEl.textContent = t("items_count", findFileResults.length);
  findFileResultsEl.replaceChildren();

  if (!findFileQueryInput?.value.trim()) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("find_file_empty");
    findFileResultsEl.append(empty);
    return;
  }

  if (!findFileResults.length) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("find_file_no_results");
    findFileResultsEl.append(empty);
    return;
  }

  findFileResults.forEach((result, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `find-file-result${index === selectedFindFileIndex ? " is-selected" : ""}`;
    const modified = result.modifiedAt ? new Date(result.modifiedAt).toLocaleString() : "--";
    button.innerHTML = `
      <strong>${escapeHtml(result.name)}</strong>
      <span>${escapeHtml(result.kind)} · ${escapeHtml(result.path)}</span>
      <small>${escapeHtml(modified)}</small>
    `;
    button.addEventListener("click", () => {
      selectedFindFileIndex = index;
      renderFindFileResults();
      updateMenuState();
    });
    button.addEventListener("dblclick", () => openFindFileResult(result));
    findFileResultsEl.append(button);
  });
}

function getSelectedFindFileResult() {
  return selectedFindFileIndex === null ? null : findFileResults[selectedFindFileIndex] || null;
}

function revealFindFileFile(file) {
  selectedFolderId = file.folderId || "all";
  selectedChatFileId = file.id;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  renderProjectDisks();
  openWindow("projects");
}

function revealFindFileFolder(folder) {
  selectedFolderId = folder.parentId || "all";
  selectedChatFileId = null;
  selectedDocumentFolderId = folder.id;
  selectedProjectRootItemId = null;
  renderProjectDisks();
  openWindow("projects");
}

function revealFindFileSystemRoot(rootId) {
  selectedFolderId = "all";
  selectedChatFileId = null;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = rootId;
  renderProjectDisks();
  openWindow("projects");
}

function openFindFileResult(result) {
  if (!result) {
    setStatus(t("select_find_file_first"));
    return;
  }
  result.open?.();
}

function openSelectedFindFileResult() {
  openFindFileResult(getSelectedFindFileResult());
}

function revealSelectedFindFileResult() {
  const result = getSelectedFindFileResult();
  if (!result) {
    setStatus(t("select_find_file_first"));
    return;
  }
  result.reveal?.();
}
