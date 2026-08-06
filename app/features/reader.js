// Feature module: reader.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



const readerSplitStorageKey = "aiSystem6.readerSplitSizes";

function readerHasMarpFrontmatter(markdown) {
  const text = normalizeMarkdownText(markdown);
  if (!text.startsWith("---\n")) return false;
  const end = text.indexOf("\n---", 4);
  return end > 0 && /^marp\s*:\s*true\s*$/im.test(text.slice(4, end));
}

// The ask bar sends the current selection when there is one and the whole
// source otherwise (see askReaderQuestion) — the scope row says which.
function describeReaderAskScope() {
  if (!currentReaderPage) return { ready: false };
  const selection = (window.getSelection()?.toString() || "").trim();
  return {
    ready: true,
    object: currentReaderPage.title || t("reader"),
    range: selection ? t("ask_scope_selection") : t("ask_scope_whole_source"),
  };
}

function updateReaderClioStageButton() {
  if (!readerOpenClioStageButton) return;
  const enabled = !!currentReaderPage?.text && readerHasMarpFrontmatter(currentReaderPage.text);
  readerOpenClioStageButton.hidden = !enabled;
  readerOpenClioStageButton.disabled = !enabled;
}

async function openCurrentReaderInClioStage() {
  if (!currentReaderPage?.text || !readerHasMarpFrontmatter(currentReaderPage.text)) return;
  await openClioStageApp({
    title: currentReaderPage.fileName || currentReaderPage.title || t("clio_stage_label"),
    markdown: currentReaderPage.text,
    sourceKind: "reader",
    sourceItemId: currentReaderPage.fileName || currentReaderPage.url || "",
  });
}

function readerVideoTranscriptSource(fileName = "") {
  const raw = mountedTextDisk.fileSources?.[fileName];
  if (!raw) return null;
  const normalizer = window.AISystem6VideoTranscript?.normalizeVideoTranscriptSource;
  return typeof normalizer === "function" ? normalizer(raw, fileName) : raw;
}

function readerVideoTranscriptSelectionContract(selection) {
  const source = currentReaderPage?.videoTranscript;
  if (!source || source.type !== "video_transcript") return null;
  const resolver = window.AISystem6VideoTranscript?.getParagraphForSelection;
  if (typeof resolver !== "function") return null;
  return resolver(selection, readerContentEl);
}

function renderReaderVideoTranscriptView(readerPage) {
  const transcript = readerPage?.videoTranscript;
  if (!transcript || transcript.type !== "video_transcript") return false;

  const paragraphs = Array.isArray(transcript.paragraphs) ? transcript.paragraphs : [];
  const blocks = Array.isArray(transcript.blocks) ? transcript.blocks : [];
  const compactTime = window.AISystem6VideoTranscript?.compactSrtTime || ((value) => String(value || ""));
  if (!paragraphs.length || !blocks.length) return false;

  const wrap = document.createElement("div");
  wrap.className = "reader-transcript-view";

  const heading = document.createElement("div");
  heading.className = "reader-transcript-heading";
  heading.textContent = t("reader_video_transcript_view");
  wrap.append(heading);

  const paragraphList = document.createElement("div");
  paragraphList.className = "reader-transcript-paragraphs";
  paragraphs.forEach((paragraph, index) => {
    const item = document.createElement("article");
    item.className = "reader-transcript-paragraph";
    item.dataset.transcriptParagraphId = paragraph.id || `para-${index + 1}`;
    const timeStart = paragraph.timeStart || paragraph.start || "";
    const timeEnd = paragraph.timeEnd || paragraph.end || "";
    item.dataset.transcriptStart = timeStart;
    item.dataset.transcriptEnd = timeEnd;
    item.dataset.transcriptBlockIds = (paragraph.blockIds || []).join(",");
    const range = `${compactTime(timeStart)}-${compactTime(timeEnd)}`;
    item.innerHTML = `
      <header><small>${escapeHtml(range)}</small><button type="button" data-jump-blocks="${escapeHtml((paragraph.blockIds || []).join(","))}">${escapeHtml(t("reader_show_source_blocks"))}</button></header>
      <p>${escapeHtml(paragraph.text || "")}</p>
    `;
    paragraphList.append(item);
  });
  wrap.append(paragraphList);

  const blockList = document.createElement("details");
  blockList.className = "reader-transcript-blocks";
  const blocksTitle = document.createElement("summary");
  blocksTitle.textContent = t("reader_original_srt_blocks");
  blockList.append(blocksTitle);
  blocks.forEach((block) => {
    const row = document.createElement("article");
    row.className = "reader-transcript-block";
    row.id = `reader-srt-block-${block.index}`;
    row.dataset.transcriptBlockId = String(block.index);
    row.innerHTML = `
      <header>#${escapeHtml(String(block.index))} · <small>${escapeHtml(compactTime(block.start))}-${escapeHtml(compactTime(block.end))}</small></header>
      <p>${escapeHtml(String(block.text || ""))}</p>
    `;
    blockList.append(row);
  });
  wrap.append(blockList);

  const jumpToBlocks = (ids) => {
    if (!ids.length) return;
    blockList.open = true;
    const target = wrap.querySelector(`#reader-srt-block-${CSS.escape(ids[0])}`);
    if (!target) return;
    target.classList.add("is-focus");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => target.classList.remove("is-focus"), 900);
  };

  wrap.addEventListener("click", (event) => {
    const button = event.target.closest("[data-jump-blocks]");
    if (button) {
      const ids = String(button.dataset.jumpBlocks || "").split(",").map((id) => id.trim()).filter(Boolean);
      jumpToBlocks(ids);
      return;
    }
    const paragraph = event.target.closest("[data-transcript-paragraph-id]");
    if (!paragraph || event.target.closest("button, a, details, summary")) return;
    const ids = String(paragraph.dataset.transcriptBlockIds || "").split(",").map((id) => id.trim()).filter(Boolean);
    jumpToBlocks(ids);
  });

  readerContentEl.append(wrap);
  return true;
}

function readerDocumentTitle(readerDoc) {
  return readerDoc?.title || readerDoc?.fileName || readerDoc?.url || t("reader");
}

function readerDocumentSource(readerDoc) {
  if (!readerDoc) return "";
  if (readerDoc.kind === "fileDisk") return `File Floppy: ${readerDoc.fileName || readerDoc.source || readerDocumentTitle(readerDoc)}`;
  return readerDoc.url || readerDoc.source || "";
}

function readerDocumentDisplaySource(readerDoc) {
  if (!readerDoc) return "";
  if (readerDoc.kind === "fileDisk") return readerDoc.fileName || t("mounted_text_disk");
  return getReaderSiteLabel(readerDoc);
}

function resetReaderDocumentState() {
  currentReaderPage = null;
  currentReaderClipCount = 0;
  updateReaderClioStageButton();
  setReaderWindowTitle();
  readerUrlDisplayEl.textContent = "";
  readerStatusEl.textContent = t("reader_empty_hint");
  readerContentEl.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-folder-note";
  empty.textContent = t("reader_empty_hint");
  readerContentEl.append(empty);
  if (readerClipButton) {
    readerClipButton.disabled = true;
    readerClipButton.hidden = true;
  }
  if (readerClipTranslateButton) {
    readerClipTranslateButton.disabled = true;
    readerClipTranslateButton.hidden = true;
  }
  if (readerDocMapButton) readerDocMapButton.disabled = true;
  updateReaderClioStageButton();
  if (readerSendManuscriptButton) readerSendManuscriptButton.disabled = true;
  if (readerFindSourcesButton) readerFindSourcesButton.disabled = true;
  updateMenuState();
  if (typeof renderVideoDocMapSwitchers === "function") renderVideoDocMapSwitchers();
}

function activeReaderTab() {
  return typeof getActiveDocumentTab === "function" ? getActiveDocumentTab("reader") : null;
}

function getReaderTabs(project = getActiveProject()) {
  return typeof getDocumentTabs === "function" ? getDocumentTabs("reader", project) : [];
}

function formatReaderTabSubtitle(tab) {
  if (tab?.backing?.type === "fileDisk") {
    return [t("mounted_text_disk"), tab.backing.fileName].filter(Boolean).join(" ");
  }
  if (tab?.backing?.type === "projectCd") {
    return [t("project_cd"), t("read_only")].filter(Boolean).join(" ");
  }
  try {
    const parsed = new URL(tab.backing?.url || tab.url);
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return [tab.site || parsed.hostname.replace(/^www\./, ""), path].filter(Boolean).join(" ");
  } catch {
    return tab.state?.site || tab.backing?.url || tab.url || tab.role || "";
  }
}

function renderReaderTabs(project = getActiveProject()) {
  if (!readerTabsEl) return;
  const tabs = getReaderTabs(project);
  renderTdiTabStrip(readerTabsEl, tabs, {
    activeId: project?.activeDocumentTabIds?.reader,
    labelFor: (tab, index) => `${index + 1}. ${tab.title || tab.url}`,
    sublabelFor: (tab) => formatReaderTabSubtitle(tab),
    closableFor: () => tabs.length > 1,
    onOpen: (tab) => openReaderDocumentTab(tab.id),
    onClose: (tab) => removeReaderTab(tab.id),
    onMove: (tabId, targetTabId) => {
      if (!moveDocumentTab("reader", tabId, targetTabId, project)) return;
      renderReaderTabs(project);
      saveDeskState();
    },
  });
}

function removeReaderTab(tabId) {
  const project = getActiveProject();
  const result = removeDocumentTab("reader", tabId, project);
  if (!result) return;
  renderReaderTabs(project);
  saveDeskState();
  if (!result.wasActive) return;

  if (result.next) {
    openReaderDocumentTab(result.next.id);
    return;
  }

  resetReaderDocumentState();
}

function captureActiveReaderTabState() {
  const tab = activeReaderTab();
  if (!tab || !currentReaderPage) return;
  tab.title = currentReaderPage.title || currentReaderPage.fileName || tab.title || t("reader");
  tab.backing = {
    ...(tab.backing || {}),
    type: currentReaderPage.kind === "fileDisk" ? "fileDisk" : tab.backing?.type || "web",
    fileName: currentReaderPage.fileName || tab.backing?.fileName || "",
    url: currentReaderPage.url || tab.backing?.url || "",
  };
  tab.state = {
    ...(tab.state || {}),
    ...currentReaderPage,
    scrollTop: readerContentEl?.scrollTop || 0,
  };
  tab.updatedAt = new Date().toISOString();
}

function renderReaderUnavailableTab(tab) {
  currentReaderPage = null;
  currentReaderClipCount = 0;
  updateReaderClioStageButton();
  setReaderWindowTitle({ title: tab?.title || t("reader") });
  readerUrlDisplayEl.textContent = tab?.backing?.fileName || "";
  readerStatusEl.textContent = t("reader_file_unavailable");
  readerContentEl.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-folder-note";
  empty.textContent = t("reader_file_unavailable");
  readerContentEl.append(empty);
  if (readerClipButton) {
    readerClipButton.disabled = true;
    readerClipButton.hidden = true;
  }
  if (readerClipTranslateButton) {
    readerClipTranslateButton.disabled = true;
    readerClipTranslateButton.hidden = true;
  }
  if (readerDocMapButton) readerDocMapButton.disabled = true;
  updateReaderClioStageButton();
  if (readerSendManuscriptButton) readerSendManuscriptButton.disabled = true;
  if (readerFindSourcesButton) readerFindSourcesButton.disabled = true;
  updateMenuState();
  if (typeof renderVideoDocMapSwitchers === "function") renderVideoDocMapSwitchers();
}

function setReaderLoadingState(message) {
  document.body.classList.add("is-busy");
  currentReaderPage = null;
  currentReaderClipCount = 0;
  updateReaderClioStageButton();
  setReaderWindowTitle();
  readerFetchButton.disabled = true;
  readerClipButton.disabled = true;
  readerClipButton.hidden = true;
  if (readerDocMapButton) readerDocMapButton.disabled = true;
  updateReaderClioStageButton();
  if (readerSendManuscriptButton) readerSendManuscriptButton.disabled = true;
  if (readerFindSourcesButton) readerFindSourcesButton.disabled = true;
  if (readerClipTranslateButton) {
    readerClipTranslateButton.disabled = true;
    readerClipTranslateButton.hidden = true;
  }
  readerStatusEl.textContent = message;
  readerUrlDisplayEl.textContent = "";
  readerContentEl.replaceChildren();

  const waiting = document.createElement("div");
  waiting.className = "empty-folder-note";
  waiting.textContent = message;
  readerContentEl.append(waiting);
}

async function openReaderDocument(readerDoc, options = {}) {
  if (!readerDoc?.text?.trim()) {
    setStatus(t("reader_no_page"));
    return;
  }

  const isDocMap = (readerDoc.fileName && /^DocMap\b/i.test(readerDoc.fileName)) ||
                   (typeof isExportedDocMapMarkdown === "function" && isExportedDocMapMarkdown(readerDoc.text));

  // DocMap files open in the tool, which is lazy. Load it up front so the map
  // branch below actually runs; a load failure keeps the plain-text fallback.
  if (isDocMap) {
    try {
      await ensureDocMapModule();
    } catch {
      // The text fallback below is the recovery path.
    }
  }

  if (isDocMap && typeof restoreDocMapFromMarkdown === "function" && typeof showDocMap === "function") {
    const restoredMap = restoreDocMapFromMarkdown(readerDoc.text, {
      label: readerDoc.fileName || readerDoc.title || t("docmap"),
      scope: readerDoc.kind === "fileDisk" ? "fileDisk" : "web",
      allowGeneric: true,
    });
    if (restoredMap) {
      showDocMap(restoredMap, {
        focus: true,
        statusMessage: t("docmap_reopened", readerDoc.fileName || readerDoc.title || t("docmap")),
      });
      if (readerDoc.fileName) {
        setTimeout(() => {
          closeReaderFileDocumentTabs([readerDoc.fileName]);
        }, 0);
      }
      return;
    }
  }


  currentReaderPage = {
    kind: readerDoc.kind || "web",
    title: readerDocumentTitle(readerDoc),
    text: readerDoc.text,
    source: readerDoc.source || readerDoc.url || readerDoc.fileName || "",
    url: readerDoc.url || "",
    site: readerDoc.site || "",
    author: readerDoc.author || "",
    date: readerDoc.date || "",
    fileName: readerDoc.fileName || "",
    videoTranscript: readerDoc.videoTranscript || null,
  };
  currentReaderClipCount = 0;
  setReaderWindowTitle(currentReaderPage);

  let renderedVideoTranscript = false;
  if (currentReaderPage.videoTranscript) {
    try {
      await ensureVideoTranscriptModule();
      currentReaderPage.videoTranscript = readerVideoTranscriptSource(currentReaderPage.fileName) || currentReaderPage.videoTranscript;
      renderedVideoTranscript = !!currentReaderPage.videoTranscript;
    } catch {
      renderedVideoTranscript = false;
    }
  }
  renderReaderDocumentView({ renderedVideoTranscript });

  readerStatusEl.textContent = options.status || (renderedVideoTranscript ? t("reader_video_transcript_view") : t("reader_reading_mode"));
  readerUrlDisplayEl.textContent = readerDocumentDisplaySource(currentReaderPage);
  if (readerDocMapButton) readerDocMapButton.disabled = false;
  if (readerSendManuscriptButton) readerSendManuscriptButton.disabled = false;
  if (readerFindSourcesButton) readerFindSourcesButton.disabled = false;
  updateReaderClioStageButton();
  updateReaderTranslationClipButton();
  updateMenuState();
  if (typeof renderVideoDocMapSwitchers === "function") renderVideoDocMapSwitchers();
}

function appendReaderDocumentHeader() {
  if (currentReaderPage?.videoTranscript?.type === "video_transcript") return;
  const title = document.createElement("h1");
  title.textContent = currentReaderPage.title;
  readerContentEl.append(title);

  const metaItems = currentReaderPage.kind === "fileDisk"
    ? [t("mounted_text_disk"), currentReaderPage.fileName].filter(Boolean)
    : currentReaderPage.kind === "projectCd"
      ? [t("project_cd"), t("read_only")].filter(Boolean)
      : [
        currentReaderPage.author ? `By ${currentReaderPage.author}` : "",
        currentReaderPage.date || "",
      ].filter(Boolean);
  if (metaItems.length) {
    const meta = document.createElement("div");
    meta.className = "reader-meta";
    meta.textContent = metaItems.join(" · ");
    readerContentEl.append(meta);
  }
}

function renderReaderDocumentView({ renderedVideoTranscript = false } = {}) {
  readerContentEl.replaceChildren();
  appendReaderDocumentHeader();
  if (renderedVideoTranscript) {
    renderReaderVideoTranscriptView(currentReaderPage);
  } else {
    const body = document.createElement("div");
    body.className = "reader-body-content";
    body.innerHTML = markdownToSystemHtml(currentReaderPage.text);
    readerContentEl.append(body);
  }
  readerStatusEl.textContent = t("reader_reading_mode");
  updateReaderClioStageButton();
}

async function fetchReaderPage(urlArg = null) {
  let url = typeof urlArg === "string" ? urlArg : null;
  const inputValue = readerUrlInput.value.trim();

  if (!url && !inputValue) return;

  if (!url) {
    const urls = extractReaderUrls(inputValue);
    if (urls.length !== 1 || urls[0] !== inputValue) {
      setStatus(urls.length > 1 ? t("reader_one_url_only") : t("reader_invalid_url"));
      return;
    }

    url = urls[0];
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setStatus(t("reader_invalid_url"));
      return;
    }
  } catch {
    setStatus(t("reader_invalid_url"));
    return;
  }

  setReaderLoadingState(t("reader_fetching"));
  try {
    const response = await fetch(`/api/reader?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      throw new Error(serviceErrorDetail(response.status, await response.text()));
    }

    const data = await response.json();
    const readerDoc = { ...data, kind: "web", source: data.url };
    createReaderWebDocumentTab(readerDoc, { forceNew: true });
    openReaderDocument(readerDoc);
  } catch (error) {
    currentReaderPage = null;
    setReaderWindowTitle();
    updateReaderTranslationClipButton();
    readerContentEl.replaceChildren();
    const err = document.createElement("div");
    err.className = "empty-folder-note";
    err.textContent = t("reader_error", error.message);
    readerContentEl.append(err);
    readerStatusEl.textContent = t("ready");
  } finally {
    document.body.classList.remove("is-busy");
    readerFetchButton.disabled = false;
    updateMenuState();
  }
}

// The Reader "Open" button fetches the URL when one is typed; with an empty
// field it doubles as an open-file action (mount into File Floppy and open),
// the same path as dragging a file into Reader.
function handleReaderOpenButton() {
  if (readerUrlInput?.value.trim()) {
    fetchReaderPage();
    return;
  }
  promptReaderFileImport();
}

function promptReaderFileImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.addEventListener("change", () => {
    if (input.files?.length) importFilesIntoReader(input.files);
  }, { once: true });
  input.click();
}

function createReaderFileDocumentTab(fileName) {
  const project = getActiveProject();
  const previousActiveId = project?.activeDocumentTabIds?.reader || null;
  const tab = upsertDocumentTab("reader", "source_view", {
    title: fileName,
    backing: { type: "fileDisk", fileName },
    state: { kind: "fileDisk", fileName, source: `File Floppy: ${fileName}` },
  }, project);
  if (previousActiveId && previousActiveId !== tab?.id) {
    setActiveDocumentTab("reader", previousActiveId, project);
  }
  return tab;
}

function createReaderWebDocumentTab(page, { forceNew = true } = {}) {
  const project = getActiveProject();
  if (!project || !page?.url) return null;
  if (typeof captureActiveReaderTabState === "function") captureActiveReaderTabState();
  const tab = upsertDocumentTab("reader", page.role || "source_view", {
    title: page.title || page.url,
    backing: { type: "web", url: page.url },
    state: {
      kind: page.kind || "web",
      title: page.title || page.url,
      text: page.text || "",
      source: page.source || page.url,
      url: page.url,
      site: page.site || getReaderTabSite(page.url),
      author: page.author || "",
      date: page.date || "",
      fileName: page.fileName || "",
      videoTranscript: page.videoTranscript || null,
    },
    forceNew,
  }, project);
  renderReaderTabs(project);
  saveDeskState();
  return tab;
}

function readerFileTabDocument(tab) {
  const fileName = tab?.backing?.fileName || tab?.fileName || "";
  if (!fileName || mountedTextDisk.projectId !== activeProjectId || !mountedTextDisk.files.includes(fileName)) {
    return null;
  }
  const text = mountedTextDisk.fileBodies[fileName] || "";
  if (!text.trim()) return null;
  return {
    kind: "fileDisk",
    title: tab.title || fileName,
    text,
    source: `File Floppy: ${fileName}`,
    fileName,
    videoTranscript: readerVideoTranscriptSource(fileName),
  };
}

async function openReaderFileDocumentTab(tabId) {
  const tab = getReaderTabs().find((item) => item.id === tabId);
  if (activeReaderTab()?.id !== tabId) captureActiveReaderTabState();
  const readerDoc = readerFileTabDocument(tab);
  if (!readerDoc) {
    setStatus(t("reader_file_unavailable"));
    setActiveDocumentTab("reader", tabId);
    renderReaderUnavailableTab(tab);
    renderReaderTabs();
    return;
  }
  setActiveDocumentTab("reader", tab.id);
  renderReaderTabs();
  await openReaderDocument(readerDoc);
  requestAnimationFrame(() => {
    readerContentEl.scrollTop = Number(tab.state?.scrollTop) || 0;
  });
}

function openReaderDocumentTab(tabId) {
  const project = getActiveProject();
  const tab = getReaderTabs(project).find((item) => item.id === tabId);
  if (!tab) return false;
  if (typeof captureActiveReaderTabState === "function") captureActiveReaderTabState();
  setActiveDocumentTab("reader", tab.id, project);
  if (tab.backing?.type === "fileDisk") {
    openReaderFileDocumentTab(tab.id);
    return true;
  }
  renderReaderTabs(project);
  saveDeskState();
  if (tab.backing?.type === "exportPreview") {
    openReaderDocument({
      kind: "exportPreview",
      title: tab.title || t("reader"),
      text: tab.state?.markdown || tab.state?.text || "",
      source: tab.state?.source || t("reader"),
    });
  } else if ((tab.state?.text || "").trim()) {
    openReaderDocument({
      kind: tab.state.kind || "web",
      title: tab.state.title || tab.title || t("reader"),
      text: tab.state.text,
      source: tab.state.source || tab.backing?.url || tab.state.url || "",
      url: tab.state.url || tab.backing?.url || "",
      site: tab.state.site || getReaderTabSite(tab.state.url || tab.backing?.url || ""),
      author: tab.state.author || "",
      date: tab.state.date || "",
      fileName: tab.state.fileName || "",
      videoTranscript: tab.state.videoTranscript || null,
    }).then(() => {
      requestAnimationFrame(() => {
        readerContentEl.scrollTop = Number(tab.state?.scrollTop) || 0;
      });
    });
  } else {
    fetchReaderPage(tab.backing?.url || tab.state?.url || tab.url);
  }
  return true;
}

function openReaderWindowWithTabs() {
  const project = getActiveProject();
  renderReaderTabs(project);
  const active = activeReaderTab();
  openWindow("reader");
  if (!currentReaderPage && active) openReaderDocumentTab(active.id);
  readerUrlInput?.focus();
}

async function revealReaderVideoTranscriptRange(fileName, blockIds = []) {
  if (!fileName || mountedTextDisk.projectId !== activeProjectId || !mountedTextDisk.files.includes(fileName)) {
    setStatus(t("reader_file_unavailable"));
    return false;
  }
  const tab = createReaderFileDocumentTab(fileName);
  await openReaderFileDocumentTab(tab.id);
  openWindow("reader");
  const ids = Array.from(blockIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  const targetId = ids[0];
  if (!targetId) return true;
  requestAnimationFrame(() => {
    const target = readerContentEl.querySelector(`#reader-srt-block-${CSS.escape(targetId)}`);
    if (!target) return;
    target.classList.add("is-focus");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => target.classList.remove("is-focus"), 1200);
  });
  return true;
}

function closeReaderFileDocumentTabs(fileNames = null) {
  const project = getActiveProject();
  if (!project) return;
  const names = fileNames ? new Set(Array.from(fileNames || []).map((name) => String(name || ""))) : null;
  const tabs = getReaderTabs(project).filter((tab) =>
    tab.backing?.type === "fileDisk" && (!names || names.has(tab.backing.fileName))
  );
  tabs.forEach((tab) => removeDocumentTab("reader", tab.id, project));
  if (currentReaderPage?.kind === "fileDisk" && (!fileNames || fileNames.includes(currentReaderPage.fileName))) {
    resetReaderDocumentState();
  }
  renderReaderTabs();
}

async function importFilesIntoReader(files) {
  const droppedFiles = Array.from(files || []).filter(Boolean);
  if (!droppedFiles.length) return;

  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  const controller = new AbortController();
  readerWorkspaceEl?.classList.add("is-importing");
  setReaderLoadingState(t("reader_drop_importing"));
  try {
    const result = await importFilesToMountedTextDisk(droppedFiles, {
      controller,
      statusEl: readerStatusEl,
      source: "readerDrop",
    });
    const { mountedFileNames, embeddedChunks, failures, embeddingFailed } = result;
    if (!mountedFileNames.length) {
      setStatus(readerStatusEl.textContent || t("file_disk_mount_failed_all", failures.length || droppedFiles.length));
      resetReaderDocumentState();
      return;
    }

    const baseStatus = embeddingFailed
      ? t("keyword_indexed_chunks", embeddedChunks.length, mountedFileNames.length)
      : t("reader_drop_inserted_floppy", mountedFileNames.length, embeddedChunks.length);
    const failureSummary = failures.length ? formatFileDiskFailureSummary(failures).replace(/\n/g, " ") : "";
    const statusMessage = failures.length
      ? `${baseStatus} ${t("file_disk_failed_count", failures.length)} ${failureSummary}`.trim()
      : baseStatus;
    if (failures.length) readerStatusEl.title = formatFileDiskFailureTitle(failures);
    setStatus(statusMessage);
    await openMountedFilesInReader(mountedFileNames);
    readerStatusEl.textContent = statusMessage;
  } catch (error) {
    const message = isAbortError(error) ? t("file_disk_canceled") : error.message;
    readerStatusEl.textContent = message;
    setStatus(message);
    resetReaderDocumentState();
  } finally {
    document.body.classList.remove("is-busy");
    readerWorkspaceEl?.classList.remove("is-importing", "is-dragging");
    readerFetchButton.disabled = false;
    renderMountedTextDisk();
    updateMenuState();
  }
}

function readerMountedFileNamesFromDrop(event) {
  const rawData = event?.dataTransfer?.getData("application/json") || event?.dataTransfer?.getData("text/plain");
  if (!rawData) return [];
  try {
    const data = JSON.parse(rawData);
    if (data?.type !== "mounted-file") return [];
    const ids = Array.isArray(data.ids) ? data.ids : [data.id];
    return ids
      .map((name) => String(name || "").trim())
      .filter((name) => name && mountedTextDisk.files.includes(name));
  } catch {
    return [];
  }
}

function readerCanAcceptDrop(event) {
  return dropHasFilesOrMountedFiles(event);
}

function readerDropEffect(event) {
  return dropEffectForFilesOrMountedFiles(event);
}

function describeReaderDropEvent(event, stage) {
  const types = Array.from(event?.dataTransfer?.types || []).join(",") || "none";
  const target = event?.target?.id || event?.target?.className || event?.target?.tagName || "unknown";
  const files = event?.dataTransfer?.files?.length || 0;
  const message = `Reader drop ${stage}: ${types}; files=${files}; target=${target}`;
  if (readerStatusEl) readerStatusEl.textContent = message;
  setStatus(message);
}

async function openMountedFilesInReader(fileNames = []) {
  const names = Array.from(new Set(fileNames)).filter((name) => mountedTextDisk.files.includes(name));
  if (!names.length) {
    setStatus(t("reader_file_unavailable"));
    return false;
  }
  const tabs = names.map((name) => createReaderFileDocumentTab(name));
  renderReaderTabs();
  if (tabs[0]) openReaderDocumentTab(tabs[0].id);
  openWindow("reader");
  setStatus(t("viewing_mounted_file"));
  return true;
}

function handleReaderDrop(event) {
  describeReaderDropEvent(event, "drop");
  if (!readerCanAcceptDrop(event)) return false;
  event.preventDefault();
  event.stopPropagation();
  readerWorkspaceEl?.classList.remove("is-dragging");
  const mountedFileNames = readerMountedFileNamesFromDrop(event);
  if (mountedFileNames.length) {
    if (readerStatusEl) readerStatusEl.textContent = `Reader drop mounted files: ${mountedFileNames.join(", ")}`;
    openMountedFilesInReader(mountedFileNames);
    return true;
  }
  if (event.dataTransfer?.files?.length) {
    if (readerStatusEl) readerStatusEl.textContent = `Reader drop local files: ${event.dataTransfer.files.length}`;
    importFilesIntoReader(event.dataTransfer.files);
    return true;
  }
  if (readerStatusEl) readerStatusEl.textContent = "Reader drop received, but no usable file payload.";
  return false;
}

function setReaderWindowTitle(page = null) {
  if (!readerTitleEl) return;

  if (!page) {
    readerTitleEl.dataset.i18n = "reader";
    readerTitleEl.textContent = t("reader");
    readerTitleEl.title = t("reader");
    return;
  }

  delete readerTitleEl.dataset.i18n;
  const title = page.title || t("reader");
  readerTitleEl.textContent = title;
  readerTitleEl.title = title;
}

function getReaderSiteLabel(page) {
  if (page?.site) return page.site;
  try {
    return new URL(page?.url || "").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractReaderUrls(text) {
  return (text || "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    });
}

function clipReaderSelection() {
  const { selection, text } = getReaderSelection();

  if (!text) {
    setStatus(t("select_text_first"));
    return;
  }

  const title = document.querySelector("#reader-content h1")?.textContent || "Reader Clip";
  const sourceRef = readerDocumentSource(currentReaderPage);
  const url = currentReaderPage?.url || "";
  const site = currentReaderPage?.site || "";
  const capturedAt = new Date().toISOString();
  const timestamp = new Date(capturedAt).toLocaleString();

  const context = getReaderSelectionContext(selection, text);
  const transcriptContract = readerVideoTranscriptSelectionContract(selection);
  const isVideoTranscriptClip = currentReaderPage?.videoTranscript?.type === "video_transcript" && transcriptContract;
  const videoSourceTitle = currentReaderPage?.videoTranscript?.sourceName || title;
  const videoTimeStart = transcriptContract?.start || "";
  const videoTimeEnd = transcriptContract?.end || "";
  const originalBlockIds = transcriptContract?.blockIds || [];

  const scrapBody = [
    "Selected passage:",
    text,
    "",
    "---",
    `Source: ${title}`,
    site ? `Site: ${site}` : "",
    url ? `URL: ${url}` : `File: ${currentReaderPage?.fileName || sourceRef}`,
    isVideoTranscriptClip ? "Source kind: video_transcript" : "",
    isVideoTranscriptClip ? `Time range: ${videoTimeStart} --> ${videoTimeEnd}` : "",
    isVideoTranscriptClip ? `Original SRT blocks: ${originalBlockIds.join(", ")}` : "",
    currentReaderPage?.author ? `Author: ${currentReaderPage.author}` : "",
    currentReaderPage?.date ? `Date: ${currentReaderPage.date}` : "",
    `Time: ${timestamp}`,
    "",
    "Context before:",
    context.before || "[start of readable text]",
    "",
    "Context after:",
    context.after || "[end of readable text]",
  ].filter(Boolean).join("\n");

  const scrap = createScrap(
    `Clip: ${text.slice(0, 20)}...`,
    scrapBody,
    {
      source: {
        type: "reader-clip",
        readerKind: currentReaderPage?.kind || "web",
        title,
        url,
        source: sourceRef,
        site,
        fileName: currentReaderPage?.fileName || "",
        author: currentReaderPage?.author || "",
        date: currentReaderPage?.date || "",
        capturedAt,
        sourceId: currentReaderPage?.videoTranscript?.id || "",
        sourceTitle: isVideoTranscriptClip ? videoSourceTitle : title,
        sourceKind: isVideoTranscriptClip ? "video_transcript" : "",
        timeStart: videoTimeStart,
        timeEnd: videoTimeEnd,
        timeRange: transcriptContract ? { start: videoTimeStart, end: videoTimeEnd } : null,
        originalBlockIds,
        originalSrtBlockIds: originalBlockIds,
        nearbyContext: context,
      },
      selectedText: text,
      sourceId: currentReaderPage?.videoTranscript?.id || "",
      sourceTitle: isVideoTranscriptClip ? videoSourceTitle : title,
      sourceKind: isVideoTranscriptClip ? "video_transcript" : "",
      timeStart: videoTimeStart,
      timeEnd: videoTimeEnd,
      originalBlockIds,
      nearbyContext: context,
      capturedAt,
      context,
    }
  );

  // Tag it as a clip
  if (scrap) {
    const sourceTags = isVideoTranscriptClip
      ? ["reader-clip", "file-disk", "video-transcript"]
      : currentReaderPage?.kind === "fileDisk" ? ["reader-clip", "file-disk"] : ["reader-clip", "web"];
    scrap.tags = [...new Set([...sourceTags, ...(scrap.tags || [])])];
    currentReaderClipCount += 1;
    saveDeskState();
    renderScraps();
    updateFlowGuideChecklist({ render: false });
  }

  readerStatusEl.textContent = t("reader_clips_count", currentReaderClipCount);
  setStatus(t("reader_clipped"));
  updateReaderTranslationClipButton();
}

async function clipReaderSelectionWithTranslation() {
  const { selection, text } = getReaderSelection();

  if (!text) {
    setStatus(t("select_text_first"));
    return;
  }

  const targetLanguage = getTranslationTargetForUi(text);
  if (!targetLanguage) {
    setStatus(t("reader_clip_no_translation_needed"));
    updateReaderTranslationClipButton();
    return;
  }

  const title = document.querySelector("#reader-content h1")?.textContent || "Reader Clip";
  const sourceRef = readerDocumentSource(currentReaderPage);
  const url = currentReaderPage?.url || "";
  const site = currentReaderPage?.site || "";
  const capturedAt = new Date().toISOString();
  const timestamp = new Date(capturedAt).toLocaleString();
  const context = getReaderSelectionContext(selection, text);
  const transcriptContract = readerVideoTranscriptSelectionContract(selection);
  const isVideoTranscriptClip = currentReaderPage?.videoTranscript?.type === "video_transcript" && transcriptContract;
  const videoSourceTitle = currentReaderPage?.videoTranscript?.sourceName || title;
  const videoTimeStart = transcriptContract?.start || "";
  const videoTimeEnd = transcriptContract?.end || "";
  const originalBlockIds = transcriptContract?.blockIds || [];

  try {
    document.body.classList.add("is-busy");
    if (readerClipTranslateButton) {
      readerClipTranslateButton.disabled = true;
    }
    setStatus(t("translating_selection"));

    const translationCreatedAt = new Date().toISOString();
    const translationModel = currentTranslationModel();
    const translatedText = await translateTextWithLocalModel(text, targetLanguage, {
      preserveMarkdown: false,
      title,
    });

    const scrapBody = [
      "Selected passage:",
      text,
      "",
      `${formatTranslationMeta(targetLanguage, translationCreatedAt, "Reader", translationModel)}:`,
      translatedText,
      "",
      "---",
      `Source: ${title}`,
      site ? `Site: ${site}` : "",
      url ? `URL: ${url}` : `File: ${currentReaderPage?.fileName || sourceRef}`,
      isVideoTranscriptClip ? "Source kind: video_transcript" : "",
      isVideoTranscriptClip ? `Time range: ${videoTimeStart} --> ${videoTimeEnd}` : "",
      isVideoTranscriptClip ? `Original SRT blocks: ${originalBlockIds.join(", ")}` : "",
      currentReaderPage?.author ? `Author: ${currentReaderPage.author}` : "",
      currentReaderPage?.date ? `Date: ${currentReaderPage.date}` : "",
      `Time: ${timestamp}`,
      "",
      "Context before:",
      context.before || "[start of readable text]",
      "",
      "Context after:",
      context.after || "[end of readable text]",
    ].filter(Boolean).join("\n");

    const scrap = createScrap(
      `Clip: ${text.slice(0, 20)}...`,
      scrapBody,
      {
      source: {
        type: "reader-clip",
        readerKind: currentReaderPage?.kind || "web",
          title,
          url,
          source: sourceRef,
          site,
          fileName: currentReaderPage?.fileName || "",
        author: currentReaderPage?.author || "",
        date: currentReaderPage?.date || "",
        capturedAt,
        sourceId: currentReaderPage?.videoTranscript?.id || "",
        sourceTitle: isVideoTranscriptClip ? videoSourceTitle : title,
        sourceKind: isVideoTranscriptClip ? "video_transcript" : "",
        timeStart: videoTimeStart,
        timeEnd: videoTimeEnd,
        timeRange: transcriptContract ? { start: videoTimeStart, end: videoTimeEnd } : null,
        originalBlockIds,
        originalSrtBlockIds: originalBlockIds,
        nearbyContext: context,
      },
        selectedText: text,
        sourceId: currentReaderPage?.videoTranscript?.id || "",
        sourceTitle: isVideoTranscriptClip ? videoSourceTitle : title,
        sourceKind: isVideoTranscriptClip ? "video_transcript" : "",
        timeStart: videoTimeStart,
        timeEnd: videoTimeEnd,
        originalBlockIds,
        nearbyContext: context,
        capturedAt,
        translatedText,
        translationLanguage: targetLanguage,
        translationCreatedAt,
        translationSource: "Reader",
        translationModel,
        context,
      }
    );

    if (scrap) {
      const sourceTags = isVideoTranscriptClip
        ? ["reader-clip", "file-disk", "video-transcript"]
        : currentReaderPage?.kind === "fileDisk" ? ["reader-clip", "file-disk"] : ["reader-clip", "web"];
      scrap.tags = [...new Set([...sourceTags, "translation", ...(scrap.tags || [])])];
      currentReaderClipCount += 1;
      saveDeskState();
      renderScraps();
      updateFlowGuideChecklist({ render: false });
    }

    readerStatusEl.textContent = t("reader_clips_count", currentReaderClipCount);
    setStatus(t("reader_bilingual_clipped"));
  } catch (error) {
    setStatus(t("translation_failed", error.message));
  } finally {
    document.body.classList.remove("is-busy");
    updateReaderTranslationClipButton();
  }
}

async function askReaderQuestion(event) {
  event?.preventDefault();
  const question = (readerQuestionInput?.value || "").trim();
  if (!question) return;
  if (!currentReaderPage) {
    setStatus(t("reader_no_page"));
    openWindow("reader");
    return;
  }

  if (isReaderFullTranslationRequest(question)) {
    await translateCurrentReaderSourceFromQuestion(question);
    return;
  }

  const selection = window.getSelection()?.toString().trim();
  const subject = selection || currentReaderPage.text || "";
  const prompt = currentLanguage === "zh"
    ? [
        resolveWritingRoutePrompt("other-apps.reader-source-question", "zh"),
        typeof sideAskAnswerStyleInstruction === "function" ? sideAskAnswerStyleInstruction() : "回答要短、自然，不要写审稿报告。",
        typeof ragGroundingInstruction === "function" ? ragGroundingInstruction("Reader 来源") : "来源是主要依据，不是回答边界；请区分原文、推断和需要核对的部分。",
        "",
        `用户问题：\n${question}`,
        "",
        `Reader 来源：${currentReaderPage.title}`,
        readerDocumentSource(currentReaderPage),
        "",
        selection ? "当前选中段落：" : "整篇 Reader 来源（按预算裁剪）：",
        clipContextContent(subject, selection ? 6000 : 12000),
      ].join("\n")
    : [
        resolveWritingRoutePrompt("other-apps.reader-source-question", "en"),
        typeof sideAskAnswerStyleInstruction === "function" ? sideAskAnswerStyleInstruction() : "Be brief and natural; do not write a review report.",
        typeof ragGroundingInstruction === "function" ? ragGroundingInstruction("The Reader source") : "The source is primary grounding, not the answer boundary; distinguish source text, inference, and points to check.",
        "",
        `Question:\n${question}`,
        "",
        `Reader source: ${currentReaderPage.title}`,
        readerDocumentSource(currentReaderPage),
        "",
        selection ? "Selected passage:" : "Full Reader source (budget-clipped):",
        clipContextContent(subject, selection ? 6000 : 12000),
      ].join("\n");

  const paired = typeof arrangeReaderAssistantSplit === "function"
    ? await arrangeReaderAssistantSplit()
    : (await openWindow("assistant"), true);
  if (!paired) return;
  if (readerQuestionInput) readerQuestionInput.value = "";
  markAskBarSent("reader");
  setStatus(t("reader_question_sent"));
  await submitUserText(prompt, {
    displayText: `${t("reader")}: ${question}`,
    skipContext: true,
    taskKind: "reader",
  });
}

function isReaderFullTranslationRequest(question) {
  const value = String(question || "").trim().toLowerCase();
  return /^(reader[:：]\s*)?(翻译全文|全文翻译|全部翻译|整篇翻译|翻译整篇|完整翻译|翻译为英文|翻译成英文|翻译为英语|翻译成英语|翻译为繁中|翻译成繁中|翻译为繁体中文|翻译成繁体中文|翻译为繁體中文|翻译成繁體中文|翻译为台湾中文|翻译成台湾中文|翻译为台灣中文|翻译成台灣中文|translate\s+(the\s+)?(full|whole|entire)\s+(text|article|document|source)|translate\s+all|translate\s+to\s+(english|traditional\s+chinese|zh-tw|tw))$/i.test(value);
}

function readerTranslationTargetFromQuestion(question, sourceText) {
  const value = String(question || "").toLowerCase();
  if (/繁中|繁体|繁體|台湾|台灣|traditional|zh-tw|\btw\b/.test(value)) return "tw";
  if (/英文|英语|英譯|英译|english|into\s+en|to\s+english/.test(value)) return "en";
  if (/中文|简中|簡中|汉语|漢語|chinese|into\s+zh|to\s+chinese/.test(value)) return "zh";
  const sourceLanguage = typeof detectTextLanguage === "function" ? detectTextLanguage(sourceText) : "unknown";
  if (sourceLanguage === "zh") return "en";
  if (sourceLanguage === "en") return "zh";
  return currentLanguage === "zh" ? "en" : "zh";
}

function readerActiveVideoTranscript() {
  const direct = currentReaderPage?.videoTranscript;
  if (direct?.type === "video_transcript") return direct;
  if (currentReaderPage?.fileName) {
    const fromDisk = readerVideoTranscriptSource(currentReaderPage.fileName);
    if (fromDisk?.type === "video_transcript") {
      currentReaderPage.videoTranscript = fromDisk;
      return fromDisk;
    }
  }
  return null;
}

function readerSubtitleBlocksForTranslation(transcript = readerActiveVideoTranscript()) {
  if (!transcript || transcript.type !== "video_transcript") return [];
  const blocks = Array.isArray(transcript.blocks) && transcript.blocks.length
    ? transcript.blocks
    : (Array.isArray(transcript.paragraphs) ? transcript.paragraphs.map((paragraph, index) => ({
      index: index + 1,
      start: paragraph.timeStart || paragraph.start || "",
      end: paragraph.timeEnd || paragraph.end || "",
      text: paragraph.text || "",
    })) : []);
  return blocks
    .map((block, index) => ({
      index: block.index || index + 1,
      start: block.start || block.timeStart || "",
      end: block.end || block.timeEnd || "",
      text: block.text || "",
    }))
    .filter((block) => block.start && block.end && String(block.text || "").trim());
}

function readerSubtitleTranslationModeFromQuestion(question) {
  const value = String(question || "").toLowerCase();
  if (/繁中|繁体|繁體|台湾|台灣|traditional|zh-tw|\btw\b/.test(value)) return "tw";
  if (/英文|英语|英譯|英译|english|into\s+en|to\s+english|translate/.test(value)) return "en";
  return "";
}

function readerSubtitleTranslationName(title, mode) {
  const base = readerTitleFromSource({ title, fileName: title }) || t("reader");
  const suffix = mode === "tw" ? "台湾繁中字幕" : "English Subtitles";
  return `${base} - ${suffix}.srt.md`;
}

function createReaderTranslationTeachTextDocument(body, name) {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }
  const folder = ensureFolder(preferredFolderName());
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: project.id,
    type: "text",
    name: nextAvailableProjectFileName(name, project.id),
    folderId: folder.id,
    body,
    source: "Reader",
    durable: true,
    label: "ai",
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  selectedChatFileId = file.id;
  renderDocuments();
  saveDeskState();
  openTextFile(file.id);
  return file;
}

function buildReaderTranslatedSrt(blocks, translations) {
  return blocks.map((block, index) => [
    String(block.index || index + 1),
    `${block.start} --> ${block.end}`,
    String(translations[index] || block.text || "").trim(),
  ].join("\n")).join("\n\n");
}

async function translateReaderSubtitleLocally(blocks, mode, signal) {
  const translations = [];
  const batchSize = 24;
  for (let start = 0; start < blocks.length; start += batchSize) {
    const batch = blocks.slice(start, start + batchSize);
    const result = await sendLocalModelTask({
      payload: {
        model: getLocalModelRequestName(),
        messages: window.AISystem6ModelTaskRuntime.buildSubtitleMessages(batch, mode),
        temperature: 0.2,
        max_tokens: 2600,
        stream: false,
        ai_system6_task_kind: "subtitle-translation",
      },
      signal,
      taskKind: "subtitle-translation",
      streamPreference: "json",
    });
    const parsed = window.AISystem6LocalLMStudio.parseJsonText(result.text);
    const items = Array.isArray(parsed?.translations) ? parsed.translations : [];
    if (items.length !== batch.length) throw new Error("Subtitle model returned an incomplete translation batch.");
    translations.push(...items.map((item) => String(item || "").trim()));
  }
  return buildReaderTranslatedSrt(blocks, translations);
}

async function translateCurrentReaderSubtitleFromQuestion(question) {
  const blocks = readerSubtitleBlocksForTranslation();
  const mode = readerSubtitleTranslationModeFromQuestion(question);
  if (!blocks.length || !mode) return false;
  const title = currentReaderPage?.title || currentReaderPage?.fileName || t("reader");
  if (readerQuestionInput) readerQuestionInput.value = "";
  if (!beginLongTask("reader-subtitle-translation", t("translating_document"))) return true;
  try {
    let translatedSrt = "";
    if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady()) {
      const response = await fetch(apiUrl("/api/subtitles/translate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          blocks,
          _cloud_active: true,
          ...cloudCredentialTransportFields(),
          _cloud_base_url: cloudConfig.baseUrl,
          _cloud_model: cloudConfig.model,
        }),
        signal: getLongTaskSignal(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || "Subtitle translation failed");
      translatedSrt = String(data.srt || "");
    } else {
      translatedSrt = await translateReaderSubtitleLocally(blocks, mode, getLongTaskSignal());
    }
    const documentBody = [
      `# ${mode === "tw" ? "台湾繁中字幕" : "English Subtitles"}: ${title}`,
      "",
      "```srt",
      translatedSrt.trim(),
      "```",
    ].join("\n");
    const file = createReaderTranslationTeachTextDocument(documentBody, readerSubtitleTranslationName(title, mode));
    if (file) setStatus(currentLanguage === "zh" ? `已生成字幕翻译文档：${file.name}` : `Subtitle translation document created: ${file.name}`);
  } catch (error) {
    if (!isAbortError(error)) setStatus(t("translation_failed", error.message));
  } finally {
    endLongTask("reader-subtitle-translation");
  }
  return true;
}

async function translateCurrentReaderSourceFromQuestion(question) {
  const source = window.getSelection()?.toString().trim() || currentReaderPage?.text || "";
  const title = currentReaderPage?.title || currentReaderPage?.fileName || t("reader");
  let targetLanguage = readerTranslationTargetFromQuestion(question, source);

  if (await translateCurrentReaderSubtitleFromQuestion(question)) return;
  if (targetLanguage === "tw") targetLanguage = "zh";

  if (!source.trim()) {
    setStatus(t("reader_no_page"));
    return;
  }

  if (readerQuestionInput) readerQuestionInput.value = "";
  openWindow("assistant");
  addMessage("user", `${t("reader")}: ${question}`);
  const pendingMessage = createPendingMessage();
  startWaitCycle(pendingMessage);
  updatePendingMessage(pendingMessage, 1, t("translating_document"));

  if (!beginLongTask("reader-full-translation", t("translating_document"))) {
    stopWaitCycle();
    pendingMessage.remove();
    return;
  }

  try {
    const translated = await translateTextWithLocalModel(source, targetLanguage, {
      preserveMarkdown: true,
      title,
      chunk: true,
      onProgress: (partial) => updatePendingStreamContent(pendingMessage, partial),
    });
    conversation.push({ role: "user", content: `${t("reader")}: ${question}` });
    conversation.push({ role: "assistant", content: translated });
    resolvePendingMessage(pendingMessage, "assistant", translated);
    setStatus(t("ready"));
  } catch (error) {
    if (!isAbortError(error)) {
      pendingMessage.remove();
      setStatus(t("translation_failed", error.message));
      addMessage("assistant", `${t("translation_failed", error.message)}`);
    }
  } finally {
    endLongTask("reader-full-translation");
  }
}

function readerTitleFromSource(page = currentReaderPage) {
  const raw = String(page?.fileName || page?.title || t("reader") || "").trim();
  const withoutExtension = raw
    .replace(/\.(srt|vtt|ass|ssa|txt|md|markdown|html?)$/i, "")
    .replace(/\s+\d+$/u, "")
    .trim();
  const episodeSplit = withoutExtension.split(/\s+-\s+\d{1,4}\s+-\s+/u);
  return (episodeSplit[0] || withoutExtension || raw).trim();
}

function stripReaderManuscriptNoise(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*\d+\s*$/gm, "")
    .replace(/^\s*\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}.*$/gm, "")
    .replace(/^\s*\[[0-9:,\s.-]+(?:-->|-)[0-9:,\s.-]+\]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readerManuscriptText(selectionText = "") {
  const selection = stripReaderManuscriptNoise(selectionText);
  if (selection) return selection;
  const transcript = currentReaderPage?.videoTranscript;
  if (transcript?.type === "video_transcript" && Array.isArray(transcript.paragraphs) && transcript.paragraphs.length) {
    return transcript.paragraphs
      .map((paragraph) => stripReaderManuscriptNoise(paragraph.text))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }
  return stripReaderManuscriptNoise(currentReaderPage?.text || "");
}

function readerTextNeedsPunctuationPolish(text) {
  const value = String(text || "").replace(/\s+/g, "");
  if (value.length < 80) return false;
  const punctuationCount = (value.match(/[。！？!?；;：:，,、…]/gu) || []).length;
  const cjkCount = (value.match(/[\u3400-\u9fff]/gu) || []).length;
  if (cjkCount >= value.length * 0.45) return punctuationCount < Math.max(2, Math.floor(cjkCount / 120));
  const westernSentenceMarks = (value.match(/[.!?]/g) || []).length;
  return westernSentenceMarks < Math.max(2, Math.floor(value.length / 180));
}

function cleanReaderManuscriptModelOutput(text) {
  return String(text || "")
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function polishReaderTranscriptForManuscript(text, title = "") {
  if (!readerTextNeedsPunctuationPolish(text)) return text;
  if (!beginLongTask("reader-manuscript-polish", currentLanguage === "zh" ? "正在润色转写稿..." : "Polishing transcript...")) return text;
  let result = text;
  try {
    const prompt = `${resolveWritingRoutePrompt("source-apps.reader-transcript-polish", currentLanguage)}

${currentLanguage === "zh" ? `标题线索：${title || "无"}` : `Title hint: ${title || "None"}`}

${currentLanguage === "zh" ? "转写稿：" : "TRANSCRIPT:"}
${text}`;
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.25,
    }, getLongTaskSignal());
    const data = await readChatJson(response);
    const cleaned = cleanReaderManuscriptModelOutput(data?.choices?.[0]?.message?.content || "");
    if (cleaned) result = cleaned;
  } catch (error) {
    if (!isAbortError(error)) {
      console.error("Reader transcript polish failed", error);
      setStatus(t("reader_error", error.message));
    }
  } finally {
    endLongTask("reader-manuscript-polish");
  }
  return result;
}

async function sendReaderCopyToManuscript() {
  if (!currentReaderPage?.text?.trim()) {
    setStatus(t("reader_no_page"));
    return;
  }
  const selection = getReaderSelection().text;
  let text = readerManuscriptText(selection);
  const title = readerTitleFromSource(currentReaderPage);
  text = await polishReaderTranscriptForManuscript(text, title);
  insertIntoTeachText(text, {
    title,
    plain: true,
  });
  setStatus(t(selection ? "reader_selection_sent_manuscript" : "reader_copy_sent_manuscript"));
}

function getReaderSplitSizes() {
  try {
    return JSON.parse(localStorage.getItem(readerSplitStorageKey) || "{}") || {};
  } catch {
    return {};
  }
}

function readerSplitAxis() {
  if (!readerWorkspaceEl) return "horizontal";
  return getComputedStyle(readerWorkspaceEl).flexDirection === "column" ? "vertical" : "horizontal";
}

function clampReaderQueueSize(size, axis = readerSplitAxis()) {
  if (!readerWorkspaceEl) return size;
  const rect = readerWorkspaceEl.getBoundingClientRect();
  const total = axis === "vertical" ? rect.height : rect.width;
  if (total <= 0) return Math.round(size);
  const minQueue = axis === "vertical" ? 72 : 150;
  const minContent = axis === "vertical" ? 96 : 300;
  const handleSize = axis === "vertical"
    ? (readerSplitHandleEl?.getBoundingClientRect().height || 8)
    : (readerSplitHandleEl?.getBoundingClientRect().width || 8);
  const availableMax = total - minContent - handleSize - 8;
  const maxQueue = Math.max(minQueue, availableMax);
  return Math.round(Math.min(Math.max(size, minQueue), maxQueue));
}

function setReaderQueueSize(size, options = {}) {
  if (!readerWorkspaceEl) return;
  const axis = options.axis || readerSplitAxis();
  const clamped = clampReaderQueueSize(size, axis);
  readerWorkspaceEl.style.setProperty("--reader-tabs-size", `${clamped}px`);
  readerSplitHandleEl?.setAttribute("aria-orientation", axis === "vertical" ? "horizontal" : "vertical");
  readerSplitHandleEl?.setAttribute("aria-valuenow", String(clamped));
  if (options.save) {
    const sizes = getReaderSplitSizes();
    sizes[axis] = clamped;
    localStorage.setItem(readerSplitStorageKey, JSON.stringify(sizes));
  }
}

function applyReaderQueueSize() {
  const axis = readerSplitAxis();
  const sizes = getReaderSplitSizes();
  const fallback = axis === "vertical" ? 150 : 190;
  setReaderQueueSize(Number(sizes[axis]) || fallback, { axis });
}

function initReaderSplitHandle() {
  if (!readerWorkspaceEl || !readerSplitHandleEl) return;

  applyReaderQueueSize();
  window.addEventListener("resize", applyReaderQueueSize);
  initReaderDropZone();

  readerSplitHandleEl.addEventListener("pointerdown", (event) => {
    if (readerTabsEl?.classList.contains("is-hidden")) return;
    if (readerWorkspaceEl?.classList.contains("is-reader-tabs-horizontal")) return;
    event.preventDefault();
    const axis = readerSplitAxis();
    const startPoint = axis === "vertical" ? event.clientY : event.clientX;
    const startSize = readerTabsEl.getBoundingClientRect()[axis === "vertical" ? "height" : "width"];
    readerSplitHandleEl.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-reader");

    const onPointerMove = (moveEvent) => {
      const currentPoint = axis === "vertical" ? moveEvent.clientY : moveEvent.clientX;
      setReaderQueueSize(startSize + currentPoint - startPoint, { axis, save: true });
    };

    const finish = () => {
      document.body.classList.remove("is-resizing-reader");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  });

  readerSplitHandleEl.addEventListener("keydown", (event) => {
    if (readerWorkspaceEl?.classList.contains("is-reader-tabs-horizontal")) return;
    const axis = readerSplitAxis();
    const keyDelta = {
      ArrowLeft: axis === "horizontal" ? -16 : 0,
      ArrowRight: axis === "horizontal" ? 16 : 0,
      ArrowUp: axis === "vertical" ? -16 : 0,
      ArrowDown: axis === "vertical" ? 16 : 0,
    }[event.key] || 0;
    if (!keyDelta) return;
    event.preventDefault();
    const current = readerTabsEl?.getBoundingClientRect()[axis === "vertical" ? "height" : "width"] || 0;
    setReaderQueueSize(current + keyDelta, { axis, save: true });
  });
}

function initReaderDropZone() {
  if (!readerWorkspaceEl || readerWorkspaceEl.dataset.readerDropReady === "true") return;
  readerWorkspaceEl.dataset.readerDropReady = "true";
  const readerWindowEl = getWindow("reader");
  const readerDropTargets = [readerWindowEl, readerWorkspaceEl, readerContentEl].filter(Boolean);
  const isPointInReaderWindow = (event) => {
    if (!readerWindowEl || typeof event.clientX !== "number" || typeof event.clientY !== "number") return false;
    const rect = readerWindowEl.getBoundingClientRect();
    return event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
  };
  const isReaderDropEvent = (event) =>
    !!event.target?.closest?.('[data-window="reader"]') || isPointInReaderWindow(event);

  // Dragging a Reader selection out creates a Clipping File on drop.
  readerContentEl.addEventListener("dragstart", (event) => {
    const { selection, text } = getReaderSelection();
    if (!text) return;
    const context = getReaderSelectionContext(selection, text);
    const payload = {
      type: "clipping-selection",
      text,
      projectId: activeProjectId,
      sourceType: currentReaderPage?.kind || "web",
      sourceTitle: currentReaderPage?.title || "",
      sourceUrl: currentReaderPage?.url || "",
      capturedAt: new Date().toISOString(),
      before: context?.before || "",
      after: context?.after || "",
    };
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", text);
    event.dataTransfer.effectAllowed = "copy";
  });

  readerDropTargets.forEach((target) => {
    target.addEventListener("dragenter", (event) => {
      if (!readerCanAcceptDrop(event)) return;
      event.preventDefault();
      readerWorkspaceEl.classList.add("is-dragging");
    }, { capture: true });

    target.addEventListener("dragover", (event) => {
      if (!readerCanAcceptDrop(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = readerDropEffect(event);
      describeReaderDropEvent(event, "over");
      readerWorkspaceEl.classList.add("is-dragging");
    }, { capture: true });

    target.addEventListener("drop", handleReaderDrop, { capture: true });
  });

  readerWorkspaceEl.addEventListener("dragleave", (event) => {
    if (!readerWorkspaceEl.contains(event.relatedTarget)) {
      readerWorkspaceEl.classList.remove("is-dragging");
    }
  });

  document.addEventListener("dragover", (event) => {
    if (!isReaderDropEvent(event) || !readerCanAcceptDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = readerDropEffect(event);
    describeReaderDropEvent(event, "over");
    readerWorkspaceEl.classList.add("is-dragging");
  }, { capture: true });

  document.addEventListener("drop", (event) => {
    if (!isReaderDropEvent(event)) return;
    handleReaderDrop(event);
  }, { capture: true });
}
