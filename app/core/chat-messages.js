// Core runtime module: chat-messages.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function translationButtonLabel(targetLanguage) {
  return targetLanguage === "zh" ? t("translate_to_chinese") : t("translate_to_english");
}

function appendMessageTranslation(actions, item, role, content) {
  const targetLanguage = getTranslationTargetForUi(content);
  if (!targetLanguage) return;

  const translateBtn = document.createElement("button");
  translateBtn.className = "btn mini-btn";
  translateBtn.textContent = role === "user" ? t("show_translation") : translationButtonLabel(targetLanguage);
  translateBtn.onclick = async () => {
    const existing = item.querySelector(".message-translation");
    if (existing) {
      existing.remove();
      return;
    }

    translateBtn.disabled = true;
    const originalLabel = translateBtn.textContent;
    translateBtn.textContent = t("translating_selection");
    setStatus(t("translating_selection"));

    try {
      const translated = await translateTextWithLocalModel(content, targetLanguage, { preserveMarkdown: true });
      const translation = document.createElement("div");
      translation.className = "message-translation";
      translation.innerHTML = `<b>${escapeHtml(formatTranslationMeta(targetLanguage, new Date().toISOString(), role === "user" ? t("you") : t("assistant"), currentTranslationModel()))}</b><div>${markdownToSystemHtml(translated)}</div>`;
      item.querySelector(".message-content")?.append(translation);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      setStatus(t("ready"));
    } catch (error) {
      setStatus(t("translation_failed", error.message));
    } finally {
      translateBtn.disabled = false;
      translateBtn.textContent = originalLabel;
    }
  };

  actions.append(translateBtn);
}

function formatClioTalkGroundingSource(contextItem) {
  if (!contextItem) return null;
  const label = typeof contextSourceLabel === "function"
    ? contextSourceLabel(contextItem)
    : (contextItem.title || contextItem.source || contextItem.name || "");
  if (!label) return null;
  const citation = contextItem.citationId || (typeof sourceCitationForContextItem === "function" ? sourceCitationForContextItem(contextItem) : "");
  return {
    key: typeof getContextSourceKey === "function" ? getContextSourceKey(contextItem) : `${contextItem.kind || "context"}:${contextItem.id || label}`,
    citation,
    label,
    kind: contextItem.kind || contextItem.type || "",
  };
}

function clioTalkAttachedClipSources() {
  if (!attachedClipIds?.size) return [];
  return [...attachedClipIds].map((id) => {
    const scrap = scraps.find((item) => item.id === id && isInActiveProject(item));
    if (!scrap) return null;
    return formatClioTalkGroundingSource({
      id: scrap.id,
      title: scrap.title,
      source: scrap.source?.url || scrap.title,
      sourceType: scrap.source?.type || "",
      site: scrap.source?.site || "",
      url: scrap.source?.url || "",
      kind: "scrap",
      projectId: scrap.projectId,
      tags: scrap.tags || [],
    });
  }).filter(Boolean);
}

let sideAskClioTalkSession = null;
let sideAskClioTalkAnchor = "";
let quickDraftClioTalkSession = null;

function resetClioTalkRuntimeState(options = {}) {
  conversation.length = 0;
  compressedConversationMemory = { text: "", sourceMessages: 0, updatedAt: "" };
  attachedClipIds.clear();
  lastAssistantText = "";
  lastUserText = "";
  if (messagesEl) messagesEl.replaceChildren();
  if (options.clearPrompt !== false && promptInput) promptInput.value = "";
  lastContextBudget = null;
  lastRetrievedContextItems = [];
  if (typeof ragRankCache !== "undefined" && typeof ragRankCache.clear === "function") ragRankCache.clear();
  renderAttachedClips();
  scheduleRenderTasks("contextPanel");
  updateMenuState();
}

function snapshotClioTalkRuntimeState() {
  return {
    conversation: conversation.map((item) => ({ ...item })),
    compressedConversationMemory: { ...compressedConversationMemory },
    attachedClipIds: [...attachedClipIds],
    lastAssistantText,
    lastUserText,
    prompt: promptInput?.value || "",
    scrollTop: messagesEl?.scrollTop || 0,
  };
}

function restoreClioTalkRuntimeState(state = null) {
  resetClioTalkRuntimeState({ clearPrompt: true });
  if (!state) return false;
  conversation.push(...(Array.isArray(state.conversation) ? state.conversation : []).map((item) => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: String(item.content || ""),
  })));
  compressedConversationMemory = {
    text: String(state.compressedConversationMemory?.text || ""),
    sourceMessages: Number(state.compressedConversationMemory?.sourceMessages || 0),
    updatedAt: String(state.compressedConversationMemory?.updatedAt || ""),
  };
  (Array.isArray(state.attachedClipIds) ? state.attachedClipIds : []).forEach((id) => attachedClipIds.add(id));
  lastAssistantText = String(state.lastAssistantText || "");
  lastUserText = String(state.lastUserText || "");
  if (promptInput) promptInput.value = String(state.prompt || "");
  messagesEl?.replaceChildren();
  conversation.forEach((item) => addMessage(item.role, item.content));
  requestAnimationFrame(() => {
    if (messagesEl) messagesEl.scrollTop = Number(state.scrollTop) || messagesEl.scrollHeight;
  });
  renderAttachedClips();
  updateMenuState();
  return true;
}

function isQuickDraftClioTalkActive() {
  return !!sideAskClioTalkSession && sideAskClioTalkAnchor === "quickDraft";
}

function isSideAskClioTalkActive() {
  return !!sideAskClioTalkSession;
}

function clioTalkAssistantDisplayName() {
  return sideAskEnabled && !isMultiFinderMode()
    ? t("quick_draft_copilot_title")
    : t("assistant");
}

function enterSideAskClioTalkSession(anchorAppId = sideAskAnchorAppId || "teachText") {
  const anchor = anchorAppId || "teachText";
  if (sideAskClioTalkSession) {
    if (sideAskClioTalkAnchor === anchor) return false;
    sideAskClioTalkAnchor = anchor;
    resetClioTalkRuntimeState({ clearPrompt: true });
    return true;
  }
  sideAskClioTalkSession = snapshotClioTalkRuntimeState();
  quickDraftClioTalkSession = sideAskClioTalkSession;
  sideAskClioTalkAnchor = anchor;
  resetClioTalkRuntimeState({ clearPrompt: true });
  return true;
}

function exitSideAskClioTalkSession(options = {}) {
  if (!sideAskClioTalkSession) {
    if (options.clear === true) resetClioTalkRuntimeState({ clearPrompt: true });
    return false;
  }
  const restore = options.restore !== false;
  const snapshot = sideAskClioTalkSession;
  sideAskClioTalkSession = null;
  quickDraftClioTalkSession = null;
  sideAskClioTalkAnchor = "";
  if (restore) restoreClioTalkRuntimeState(snapshot);
  else resetClioTalkRuntimeState({ clearPrompt: true });
  return true;
}

function enterQuickDraftClioTalkSession() {
  return enterSideAskClioTalkSession("quickDraft");
}

function exitQuickDraftClioTalkSession(options = {}) {
  if (!isQuickDraftClioTalkActive()) {
    if (options.clear === true) resetClioTalkRuntimeState({ clearPrompt: true });
    return false;
  }
  return exitSideAskClioTalkSession(options);
}

function quickDraftTitleFromBody(body = "") {
  const text = String(body || "");
  const heading = text.split(/\r?\n/).find((line) => /^#{1,6}\s+\S/.test(line.trim()));
  const fallback = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || "";
  return String(heading || fallback || "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

function currentQuickDraftForClioTalk() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const saved = project?.quickDraft && typeof project.quickDraft === "object" ? project.quickDraft : {};
  const workspace = saved.workspace && typeof saved.workspace === "object" ? saved.workspace : {};
  const toolInputs = workspace.toolInputs && typeof workspace.toolInputs === "object" ? workspace.toolInputs : {};
  const annotations = workspace.annotations && typeof workspace.annotations === "object" ? workspace.annotations : {};
  const value = (id, fallback = "") => {
    const el = document.getElementById(id);
    return typeof el?.value === "string" ? el.value : fallback;
  };
  const body = value("quick-draft-draft", workspace.body || saved.draft || "");
  const title = quickDraftTitleFromBody(body) || value("quick-draft-title-input", workspace.title || saved.title || "");
  return {
    title,
    body,
    thesis: value("quick-draft-thesis", toolInputs.thesis || saved.thesis || ""),
    pastedSources: value("quick-draft-sources", toolInputs.pastedSources || saved.pastedSources || ""),
    targetFormat: document.getElementById("quick-draft-format")?.value || workspace.scenario || saved.targetFormat || "",
    targetDuration: document.getElementById("quick-draft-duration")?.value || toolInputs.targetDuration || saved.targetDuration || "",
    firstDaySubject: title || value("quick-draft-first-day-subject", toolInputs.firstDaySubject || saved.firstDaySubject || ""),
    handsOnNotes: value("quick-draft-hands-on", toolInputs.handsOnNotes || saved.handsOnNotes || ""),
    officialMaterials: value("quick-draft-official-materials", toolInputs.officialMaterials || saved.officialMaterials || ""),
    unavailableNotes: value("quick-draft-unavailable", toolInputs.unavailableNotes || saved.unavailableNotes || ""),
    audienceConcerns: value("quick-draft-audience-concerns", toolInputs.audienceConcerns || saved.audienceConcerns || ""),
    firstImpression: value("quick-draft-first-impression", toolInputs.firstImpression || saved.firstImpression || ""),
    tone: value("quick-draft-tone", toolInputs.tone || saved.tone || ""),
    mustInclude: value("quick-draft-must-include", toolInputs.mustInclude || saved.mustInclude || ""),
    mustAvoid: value("quick-draft-must-avoid", toolInputs.mustAvoid || saved.mustAvoid || ""),
    annotations: {
      firsthand: annotations.firsthand || saved.brief?.support || "",
      official: annotations.official || saved.brief?.counter || "",
      uncertainty: annotations.uncertainty || saved.brief?.uncertainty || "",
      followup: annotations.followup || saved.risks || "",
    },
    intake: workspace.intake && typeof workspace.intake === "object" ? workspace.intake : {},
    strategyReport: workspace.strategyReport && typeof workspace.strategyReport === "object" ? workspace.strategyReport : {},
    sourceMap: Array.isArray(workspace.sourceMap) ? workspace.sourceMap : (Array.isArray(saved.sourceMap) ? saved.sourceMap : []),
  };
}

function formatQuickDraftForClioTalk() {
  const record = currentQuickDraftForClioTalk();
  const launchDayFormat = record.targetFormat === "first-day-hands-on" || record.targetFormat === "hands-on-review";
  const lines = [];
  const pushSection = (heading, body, limit = 10000) => {
    const text = String(body || "").trim();
    if (!text) return;
    lines.push(`## ${heading}`, clipContextContent(text, limit), "");
  };

  pushSection(t(launchDayFormat ? "quick_draft_first_day_title" : "quick_draft_title"), record.title, 1200);
  pushSection(t("quick_draft_draft_label"), record.body, 12000);
  pushSection(t("quick_draft_thesis_label"), record.thesis, 2400);
  if (launchDayFormat) {
    pushSection(t("quick_draft_first_day_subject"), record.firstDaySubject, 1200);
    pushSection(t("quick_draft_hands_on"), record.handsOnNotes, 6000);
    pushSection(t("quick_draft_official_materials"), record.officialMaterials, 9000);
    pushSection(t("quick_draft_unavailable"), record.unavailableNotes, 4000);
    pushSection(t("quick_draft_audience_concerns"), record.audienceConcerns, 3000);
    pushSection(t("quick_draft_first_impression"), record.firstImpression, 2400);
  }
  const intake = record.intake && typeof record.intake === "object" ? record.intake : {};
  const ventLog = Array.isArray(intake.ventLog) ? intake.ventLog : [];
  const chatMaterials = Array.isArray(intake.chatMaterials) ? intake.chatMaterials : [];
  const stanceCandidates = Array.isArray(intake.stanceCandidates) ? intake.stanceCandidates : [];
  pushSection(
    t("quick_draft_vent_log"),
    ventLog.map((entry, index) => `${index + 1}. ${entry?.text || entry}`).join("\n"),
    6000
  );
  pushSection(
    t("quick_draft_chat_materials"),
    chatMaterials.map((item, index) => [
      `### ${item?.name || `Chat ${index + 1}`}`,
      `Platform: ${item?.platform || "generic-chat"}`,
      item?.text || "",
    ].filter(Boolean).join("\n")).join("\n\n"),
    9000
  );
  pushSection(t("quick_draft_stance_candidates"), stanceCandidates.join("\n"), 2400);
  pushSection(t("quick_draft_outline_seed"), intake.outlineSeed || "", 6000);
  const strategyReport = record.strategyReport && typeof record.strategyReport === "object" ? record.strategyReport : {};
  pushSection(t("quick_draft_editorial_strategy"), strategyReport.editorial, 4000);
  pushSection(t("quick_draft_material_ledger"), strategyReport.materialLedger, 5000);
  pushSection(t("quick_draft_adoption_table"), strategyReport.adoptionTable, 5000);
  const setup = [
    record.targetFormat ? `${t("quick_draft_format")}: ${record.targetFormat}` : "",
    record.targetDuration ? `${t(record.targetFormat === "bili-dynamic" ? "quick_draft_word_count" : "quick_draft_duration")}: ${record.targetDuration}` : "",
    record.tone ? `${t("quick_draft_tone")}: ${record.tone}` : "",
    record.mustInclude ? `${t("quick_draft_must_include")}: ${record.mustInclude}` : "",
    record.mustAvoid ? `${t("quick_draft_must_avoid")}: ${record.mustAvoid}` : "",
  ].filter(Boolean).join("\n");
  pushSection(currentLanguage === "zh" ? "出稿设置" : "Draft Settings", setup, 2000);
  pushSection(t("quick_draft_sources_label"), record.pastedSources, 9000);
  pushSection(t("quick_draft_first_day_annotated_hands_on"), record.annotations.firsthand, 6000);
  pushSection(t("quick_draft_first_day_annotated_official"), record.annotations.official, 4000);
  pushSection(t("quick_draft_first_day_annotated_uncertain"), record.annotations.uncertainty, 4000);
  pushSection(t("quick_draft_first_day_annotated_followup"), record.annotations.followup, 4000);

  if (record.sourceMap.length) {
    const sourceMap = record.sourceMap
      .map((item) => `- ${item.label || item.id || ""}`.trim())
      .filter((item) => item !== "-")
      .join("\n");
    pushSection(t("quick_draft_source_map"), sourceMap, 2000);
  }
  return lines.join("\n").trim()
    || (currentLanguage === "zh"
      ? "钟点稿还没有观点、资料或草稿。请先帮助用户写下自己的观点，不要替用户生成立场。"
      : "Quick Draft has no thesis, sources, or draft yet. Help the user state their own thesis first; do not generate the stance for them.");
}

function clioTalkSideAskGroundingSource() {
  if (!sideAskEnabled || isMultiFinderMode()) return null;
  const anchor = sideAskAnchorAppId || "teachText";
  if (anchor === "quickDraft") {
    return { key: "sideask:quickDraft", citation: "", label: t("quick_draft_copilot_title"), kind: "sideask" };
  }
  if (anchor === "teachText") {
    const title = typeof getTeachTextDocumentName === "function"
      ? getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || t("teachtext_label") })
      : t("teachtext_label");
    return { key: "sideask:teachText", citation: "", label: `${t("teachtext_label")} / ${title}`, kind: "sideask" };
  }
  if (anchor === "reader" && currentReaderPage) {
    return { key: "sideask:reader", citation: "", label: `${t("reader")} / ${currentReaderPage.title || t("reader")}`, kind: "sideask" };
  }
  if (anchor === "scrapbook") return { key: "sideask:scrapbook", citation: "", label: t("scrapbook"), kind: "sideask" };
  if (anchor === "docMap" && currentDocMap) {
    return { key: "sideask:docMap", citation: "", label: `${t("docmap")} / ${currentDocMap.sourceLabel || t("docmap")}`, kind: "sideask" };
  }
  if (anchor === "clioStage" && typeof clioStageState !== "undefined" && clioStageState?.source?.markdown) {
    return { key: "sideask:clioStage", citation: "", label: `${t("clio_stage_label")} / ${clioStageState.source.title || t("clio_stage_label")}`, kind: "sideask" };
  }
  return null;
}

function uniqueClioTalkGroundingSources(sources = []) {
  const seen = new Set();
  return sources.filter((source) => {
    if (!source?.label) return false;
    const key = source.key || source.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isClioTalkAnswerContractTask(taskKind = "chat", options = {}) {
  if (options.skipContext === true) return false;
  const kind = String(taskKind || "chat").toLowerCase();
  return !/writing-tool|translation|reader|scrapbook|docmap-question|clio-stage|slides|marp|dictation|speech|transcript/.test(kind);
}

function captureClioTalkGroundingSnapshot(options = {}) {
  if (!isClioTalkAnswerContractTask(options.taskKind || "chat", options)) return null;
  const usedContextItems = Array.isArray(lastRetrievedContextItems)
    ? lastRetrievedContextItems.filter((contextItem) => contextItem.included !== false && !contextItem.excluded)
    : [];
  const sideAskSource = clioTalkSideAskGroundingSource();
  const sources = uniqueClioTalkGroundingSources([
    sideAskSource,
    ...clioTalkAttachedClipSources(),
    ...usedContextItems.map(formatClioTalkGroundingSource),
  ]);
  const contextWasRequested = !!(
    sideAskSource
    || sources.length
    || lastContextBudget
    || rememberInput?.checked
    || attachedClipIds?.size
    || hasMountedFileDiskContext()
  );
  const missing = contextWasRequested && !sources.length
    ? [t("clio_grounding_missing_no_relevant_sources")]
    : [];
  return {
    sources: sources.slice(0, 4),
    sourceCount: sources.length,
    missing,
    contextPanelAvailable: !!(sources.length || lastRetrievedContextItems?.length || lastContextBudget),
    usedContext: !!sources.length,
  };
}

function formatClioTalkGrounding(snapshot) {
  if (!snapshot) return "";
  const visibleSources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
  const sourceText = visibleSources.length
    ? visibleSources.map((source) => source.label).join(" · ")
    : t("clio_grounding_no_project_context");
  const moreText = snapshot.sourceCount > visibleSources.length
    ? ` · ${t("clio_grounding_more_sources", snapshot.sourceCount - visibleSources.length)}`
    : "";
  const missingText = snapshot.missing?.length
    ? ` · ${t("clio_grounding_missing")}: ${snapshot.missing.join(" · ")}`
    : "";
  return `${sourceText}${moreText}${missingText}`;
}

function appendMessageGrounding(item, grounding) {
  item.querySelector(".message-grounding-strip")?.remove();
  if (!grounding) return;
  const summary = formatClioTalkGrounding(grounding);
  if (!summary) return;
  const body = item.querySelector(".message-content");
  if (!body) return;

  const strip = document.createElement("div");
  strip.className = "message-grounding-strip";
  strip.dataset.clioGrounding = "true";

  const label = document.createElement("strong");
  label.textContent = t("clio_grounding_label");
  const copy = document.createElement("span");
  copy.textContent = `: ${summary}`;
  strip.append(label, copy);

  if (grounding.contextPanelAvailable && typeof openWindow === "function") {
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn mini-btn";
    openBtn.textContent = t("clio_grounding_open_context_panel");
    openBtn.onclick = () => openWindow("contextPanel");
    strip.append(" ", openBtn);
  }

  body.append(strip);
}

function appendMessageActions(item, role, content) {
  item.querySelector(".message-actions")?.remove();
  const actions = document.createElement("div");
  actions.className = "message-actions";

  if (role === "assistant") {
    const insertBtn = document.createElement("button");
    insertBtn.className = "btn mini-btn";
    insertBtn.textContent = t("insert");
    insertBtn.onclick = () => insertAssistantText(content);

    const clipBtn = document.createElement("button");
    clipBtn.className = "btn mini-btn";
    clipBtn.textContent = t("clip");
    clipBtn.onclick = () => {
      createScrap(`Clip: ${content.slice(0, 30)}...`, content);
    };

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn mini-btn";
    saveBtn.textContent = t("save");
    saveBtn.onclick = () => saveMessageAsDocument(content);

    const ignoreBtn = document.createElement("button");
    ignoreBtn.className = "btn mini-btn";
    ignoreBtn.textContent = t("ignore");
    ignoreBtn.onclick = () => {
      item.remove();
      updateMenuState();
    };

    actions.append(insertBtn, clipBtn, saveBtn, ignoreBtn);
  }

  appendMessageTranslation(actions, item, role, content);
  if (actions.children.length) {
    item.querySelector(".message-content")?.append(actions);
  }
}

function refreshMessageTranslationButtons() {
  messagesEl?.querySelectorAll(".message").forEach((item) => {
    const content = item.dataset.rawContent;
    if (!content) return;
    const role = item.classList.contains("user") ? "user" : "assistant";
    appendMessageActions(item, role, content);
  });
}

function addMessage(role, content, options = {}) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  item.dataset.rawContent = content;

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = role === "user" ? t("you") : clioTalkAssistantDisplayName();

  const body = document.createElement("div");
  body.className = "message-content";
  body.innerHTML = markdownToSystemHtml(content);

  item.append(speaker, body);
  messagesEl.append(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  if (role === "assistant") {
    lastAssistantText = content;
    appendMessageGrounding(item, options.grounding || null);
  }
  appendMessageActions(item, role, content);
  updateMenuState();
}

function insertAssistantText(content) {
  insertIntoTeachText(content, {
    source: t("assistant"),
    title: t("assistant"),
  });
}

function saveMessageAsDocument(content) {
  const folder = ensureFolder(t("default_folder"));
  const name = `Response ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    name,
    folderId: folder.id,
    body: content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  chatFiles.unshift(file);
  renderDocuments();
  saveDeskState();
  setStatus(t("saved"));
}

function isCloudModelActive() {
  return typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudConfig.apiKey;
}

function modelRouteText(localKey, cloudKey) {
  return isCloudModelActive() ? t(cloudKey) : t(localKey);
}

function createPendingMessage() {
  const item = document.createElement("article");
  item.className = "message assistant pending";

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = t("assistant");

  const body = document.createElement("div");
  body.className = "message-content system-wait";
  body.innerHTML = `
    <div class="wait-title">${escapeHtml(modelRouteText("working_locally", "working_cloud"))}</div>
    <div class="progress-track" aria-label="Progress"><div class="progress-bar"></div></div>
    <div class="wait-copy">${escapeHtml(modelRouteText("wait_opening", "wait_opening_cloud"))}</div>
    <div class="wait-steps" aria-label="Working steps">
      <div class="wait-step is-active" data-step="0">${escapeHtml(t("checking_context"))}</div>
      <div class="wait-step" data-step="1">${escapeHtml(modelRouteText("consulting_model", "consulting_cloud_model"))}</div>
      <div class="wait-step" data-step="2">${escapeHtml(t("typesetting_reply"))}</div>
    </div>
  `;

  item.append(speaker, body);
  messagesEl.append(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return item;
}

function updatePendingMessage(item, step, copy) {
  if (!item) return;

  const copyEl = item.querySelector(".wait-copy");
  if (!copyEl) return;
  copyEl.textContent = copy;
  item.querySelectorAll(".wait-step").forEach((node, index) => {
    node.classList.toggle("is-active", index === step);
  });
}

function startWaitCycle(item) {
  const stages = [
    `${t("checking_context")}.`,
    `${modelRouteText("consulting_model", "consulting_cloud_model")}.`,
    t("waiting_ribbon"),
    `${t("typesetting_reply")}.`,
  ];
  let index = 0;

  clearInterval(waitTimer);
  waitTimer = setInterval(() => {
    index = (index + 1) % stages.length;
    updatePendingMessage(item, Math.min(index, 2), stages[index]);
  }, 1800);
}

function stopWaitCycle() {
  clearInterval(waitTimer);
  waitTimer = null;
}

function resolvePendingMessage(item, role, content, options = {}) {
  stopWaitCycle();

  if (!item) {
    addMessage(role, content, options);
    return;
  }

  item.className = `message ${role}`;
  item.dataset.rawContent = content;
  item.querySelector(".speaker").textContent = role === "user" ? t("you") : t("assistant");
  const body = item.querySelector(".message-content");
  body.className = "message-content";
  body.innerHTML = markdownToSystemHtml(content);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  if (role === "assistant") {
    lastAssistantText = content;
    appendMessageGrounding(item, options.grounding || null);
  }
  appendMessageActions(item, role, content);
}

function updatePendingStreamContent(item, content) {
  if (!item) return;
  stopWaitCycle();
  item.className = "message assistant pending streaming";
  item.dataset.rawContent = content;
  item.querySelector(".speaker").textContent = t("assistant");
  const body = item.querySelector(".message-content");
  body.className = "message-content";
  body.innerHTML = renderStreamingMarkdownHtml(content || "...");
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function resolvePendingStatus(item, content) {
  stopWaitCycle();
  item?.remove();
  setStatus(content);
  updateMenuState();
}

function formatSystemHelpTermsForContext() {
  const priorityIds = [
    "ai-system-6",
    "first-writing-pass",
    "project-disk",
    "file-disk",
    "reader",
    "scrapbook",
    "question-sheet",
    "outline",
    "section-drafts",
    "teachtext",
    "claim-check",
    "project-cd",
    "context-window-memory",
    "assistant",
    "start-here",
    "linked-writing-views",
    "rebuild-article",
    "system-help",
  ];
  const priorityEntries = priorityIds
    .map((id) => systemDictionaryEntries.find((entry) => entry.id === id))
    .filter(Boolean);
  const remainingEntries = systemDictionaryEntries.filter((entry) => !priorityIds.includes(entry.id));
  return [...priorityEntries, ...remainingEntries].slice(0, 24).map((entry, index) => {
    const aliases = (entry.aliases || []).filter((alias) => alias !== entry.term).slice(0, 3);
    const aliasText = aliases.length ? `; aliases: ${aliases.join(", ")}` : "";
    const definition = typeof systemHelpLocalizedDefinition === "function"
      ? systemHelpLocalizedDefinition(entry)
      : entry.definition || entry.definitionZh || entry.chineseExplanation || "";
    return `[S${index + 1}] ${entry.term}${aliasText}: ${clipContextContent(definition, 220)}`;
  }).join("\n");
}

function clioTalkLanguageInstruction() {
  return currentLanguage === "zh"
    ? "界面语言是简体中文。默认用简体中文回答；只有用户明确要求英文、翻译成其他语言，或要求保留原文时才切换。不要因为系统上下文或术语名是英文而改用英文。"
    : "Interface language is English. Answer in English by default unless the user clearly asks for another language, translation, or preserved source wording.";
}

function aiSystem6IdentityContext() {
  if (currentLanguage === "zh") {
    return [
      "AI System 6 产品身份：",
      "- 它是本地优先、资料优先的写作桌面，不是套了复古皮肤的聊天页，也不是任何模型厂商的产品名。",
      "- 它帮助写作者把资料、判断、感受和自己的语言，做成真实接收者更容易接住的作品；默认追求更少、更清楚的交付，而不是更多版本。",
      "- 保护写作者不要变成模型嘴替：粗糙输入、个人细节、犹豫、吐槽和有判断力的缺陷要保留下来。",
      "- 主路线是：项目硬盘 -> 文件软盘 -> Reader/Scrapbook -> 问题单 -> 大纲 -> 章节草稿 -> TeachText 正文 -> 审校台 -> 项目光盘。",
      "- 项目硬盘是持久项目状态；文件软盘、Reader/Searcher 结果和 ClioTalk 输出都是临时的，只有保存、摘录、插入或导出后才成为项目内容。",
      "- 问题单负责问题、接收者、约束和交付摩擦；TeachText 才是正文；ClioTalk 只是被召唤的助手声音。",
      "- 输入太稀薄时，先帮用户捕捉具体观察，不要用通用模型语言替用户填满。",
      "- 被问到 AI System 6 是什么时，只解释可见写作对象、保存边界和主路线；不要把它说成坏词清理器，也不要列举或引用 AI 腔禁词。",
      "- 回答产品、记忆和写作流程问题时，像桌面向导一样解释可见写作对象和下一步。",
    ].join("\n");
  }
  return [
    "AI System 6 product identity:",
    "- AI System 6 is a source-first local writing desktop, not a chat page with a retro skin or a model-vendor product.",
    "- It helps a writer turn sources, judgment, feeling, and their own language into work that a real recipient can receive; it favors fewer, clearer handoffs over more variants.",
    "- Protect the writer from becoming a model mouthpiece: preserve rough input, personal details, hesitation, complaints, and useful flaws.",
    "- Core route: Project Hard Disk -> File Floppy -> Reader/Scrapbook -> Question Sheet -> Outline -> Section Drafts -> TeachText Manuscript -> Review Desk -> Project CD.",
    "- Project Hard Disk is durable state. File Floppy, Reader/Searcher results, and ClioTalk output are temporary until saved, clipped, inserted, or exported.",
    "- Question Sheet owns the problem, recipient, constraints, and handoff friction; TeachText is the manuscript; ClioTalk is only the summoned assistant voice.",
    "- When input is thin, help capture concrete observations instead of filling gaps with generic model language.",
    "- When asked what AI System 6 is, explain visible writing objects, save boundaries, and the core route; do not frame it as a bad-phrase cleaner or quote AI-flavored banned words.",
    "- For product, memory, or writing-flow questions, answer as a practical guide to the visible writing objects.",
  ].join("\n");
}

function formatProjectDictionaryTermsForContext(project = getActiveProject()) {
  const terms = Array.isArray(project?.dictionaryTerms) ? project.dictionaryTerms : [];
  if (!terms.length) return "";
  return terms.slice(0, 12).map((term, index) => {
    const definition = term.definition || term.chineseExplanation || "";
    const kind = term.kind ? ` (${term.kind})` : "";
    return `[T${index + 1}] ${term.term}${kind}: ${clipContextContent(definition, 240)}`;
  }).join("\n");
}

function sideAskAnswerStyleInstruction() {
  const zh = currentLanguage === "zh";
  return zh
    ? [
        "SideAsk 回答方式：像在旁边帮用户看一眼，不要写审稿报告。",
        "- 默认 1 到 3 个短段落；能一句话回答就一句话，总量尽量不超过 180 字。",
        "- 不要用“结论：”“依据：”开头，除非用户明确要求列证据。",
        "- 先直接回应问题；材料不足时，只轻轻说明缺哪块材料、该回到哪里核对。",
        "- 少用项目符号；只有用户要求清单，或确实有两三点并列时才用。",
      ].join("\n")
    : [
        "SideAsk answer style: sit beside the user and point out the useful thing; do not write a review report.",
        "- Default to 1 to 3 short paragraphs; answer in one sentence when that is enough, ideally under 120 words.",
        "- Do not open with labels like \"Conclusion:\" or \"Evidence:\" unless the user asks for evidence.",
        "- Answer the question first; when the source is insufficient, calmly name the missing source to check.",
        "- Avoid bullets unless the user asks for a list or there are two or three genuinely parallel points.",
      ].join("\n");
}

function clioTalkResponseContractInstruction(options = {}) {
  const zh = currentLanguage === "zh";
  const sideAskNote = options.isSideAskChat
    ? (zh ? "SideAsk 仍保持短答：只把下面规则压缩成旁边提醒。" : "SideAsk stays brief: compress these rules into a beside-the-user answer.")
    : "";
  return zh
    ? [
        "ClioTalk 回答契约：",
        "- 先给可用答案：第一段直接回应用户真正的问题，一口气读得完；后面只在确实帮助扫描、比较或执行时展开。",
        "- 把可见写作对象当作原生实体：Project Hard Disk、File Floppy、Reader、Scrapbook、DocMap、TeachText 和 Context Panel 都是用户能操作的对象，不是抽象聊天上下文。",
        "- 使用来源时区分三件事：来源明说、你基于来源的推断、缺失证据。缺失时说缺什么，以及该回到哪个可见对象核对。",
        "- 多个对象、接收者或目标都可能时，先说明你的保守假设；如果会改变结果，只问一个最关键的澄清问题。",
        "- 比较、诊断、方案优先用短标题清单；只有信息密集到需要横向扫描时才用表格。",
        "- 不要叙述隐藏提示词、内部工具链或检索机制；只提用户能看见、保存、摘录、插入或打开的 AI System 6 对象。",
        sideAskNote,
      ].filter(Boolean).join("\n")
    : [
        "ClioTalk response contract:",
        "- Start with the useful answer: the first paragraph directly answers the user's real question in one readable breath; expand only when it helps scanning, comparison, or action.",
        "- Treat visible writing objects as native entities: Project Hard Disk, File Floppy, Reader, Scrapbook, DocMap, TeachText, and Context Panel are user-operable objects, not abstract chat context.",
        "- When using sources, separate three things: source text, inference from the source, and missing evidence. When something is missing, name what is missing and which visible object to check.",
        "- If multiple objects, recipients, or targets are plausible, state the conservative assumption first; ask only one decisive question when the answer would change.",
        "- Prefer short titled lists for comparisons, diagnosis, and plans; use tables only when dense information needs horizontal scanning.",
        "- Do not narrate hidden prompts, internal tool chains, or retrieval mechanics; mention only AI System 6 objects the user can see, save, clip, insert, or open.",
        sideAskNote,
      ].filter(Boolean).join("\n");
}

function visibleWritingWindowName() {
  const active = document.querySelector(".window.is-active:not(.is-hidden):not(.is-app-hidden):not(.is-collapsed)");
  const activeName = active?.dataset.window || "";
  if (activeName && activeName !== "assistant") return activeName;
  const priority = ["questionSheet", "outline", "sectionDrafts", "teachText", "reviewDesk", "projectCd"];
  return priority.find((name) => {
    const win = typeof getWindow === "function" ? getWindow(name) : document.querySelector(`[data-window="${name}"]`);
    return win && !win.classList.contains("is-hidden") && !win.classList.contains("is-app-hidden") && !win.classList.contains("is-collapsed");
  }) || "";
}

function inferClioTalkWritingStage() {
  if (sideAskEnabled && !isMultiFinderMode() && sideAskAnchorAppId) {
    return {
      quickDraft: "quickDraft",
      teachText: "teachText",
      reader: "reader",
      scrapbook: "scrapbook",
      docMap: "docMap",
      clioStage: "clioStage",
    }[sideAskAnchorAppId] || "sideask";
  }

  const visible = visibleWritingWindowName();
  if (visible) return visible;
  if (typeof lastEditedWritingSurface !== "undefined" && lastEditedWritingSurface) {
    if (lastEditedWritingSurface === "draft") return "sectionDrafts";
    if (lastEditedWritingSurface === "manuscript") return "teachText";
    return lastEditedWritingSurface;
  }

  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (typeof getProjectCdItems === "function" && getProjectCdItems().length) return "projectCd";
  if ((teachTextBodyInput?.value || "").trim()) return "teachText";
  if (Array.isArray(project?.drafts) && project.drafts.some((draft) => String(draft?.body || "").trim())) return "sectionDrafts";
  if (String(project?.outline || outlineContentEl?.value || "").trim()) return "outline";
  if (String(project?.questionSheet || questionSheetBodyInput?.value || "").trim()) return "questionSheet";
  return "questionSheet";
}

function clioTalkWritingStageInstruction(stage = inferClioTalkWritingStage()) {
  const zh = currentLanguage === "zh";
  const normalized = String(stage || "questionSheet");
  const stageName = {
    questionSheet: zh ? "问题单" : "Question Sheet",
    outline: zh ? "大纲" : "Outline",
    sectionDrafts: zh ? "章节草稿" : "Section Drafts",
    teachText: zh ? "TeachText 正文" : "TeachText Manuscript",
    quickDraft: zh ? "钟点稿" : "Quick Draft",
    reviewDesk: zh ? "审校台" : "Review Desk",
    projectCd: zh ? "项目光盘" : "Project CD",
    reader: zh ? "Reader" : "Reader",
    scrapbook: zh ? "Scrapbook" : "Scrapbook",
    docMap: zh ? "DocMap" : "DocMap",
    clioStage: zh ? "ClioStage" : "ClioStage",
  }[normalized] || (zh ? "当前写作对象" : "Current writing object");

  const zhGuidance = {
    questionSheet: [
      "问题单阶段：不要急着写正文或总结。先帮用户捕捉真实接收者、原始问题、个人观察、反对意见、约束、术语差异、来源线索、语气目标和交付摩擦。",
      "如果输入稀薄，给一个能立刻补材料的小问题或字段，不要用模型语言替用户填满。",
    ],
    outline: [
      "大纲阶段：讨论结构选择、段落功能和顺序，不要把大纲扩写成正文。",
      "把每一节都对回问题单里的接收者、约束和交付摩擦；发现缺口时建议回到问题单或来源对象补证据。",
    ],
    sectionDrafts: [
      "章节草稿阶段：只围绕当前章节推进；保护用户已有措辞、粗糙判断、个人细节和有用的不完美。",
      "提出改法时说明会影响哪个段落目的；不要把作者声音磨成通用模型腔。",
    ],
    teachText: [
      "TeachText 正文阶段：把回答服务于整篇稿子的连贯、节奏、插入位置和删减边界。",
      "可以建议下一处修改，但不要声称已经改写、插入或保存正文，除非用户明确执行了相应动作。",
    ],
    quickDraft: [
      "发布日协作模式：围绕钟点稿正文、左侧卡片（设定/第一感受/亲测/AI归类/倒料/策略）、边界标注和当前来源回答；不要替用户生成或替换个人感受。",
      "可以响应“整理”“出稿”“缩短”“钩子”“补边界”这些短指令；整理只归类和提候选，出稿才替换正文，并且第一感受必须来自用户原话。",
      "优先帮助用户在当天快速取舍、改口播、补事实边界、压字数或时长和安排下一步检查；不要把 SideAsk 回答当作已保存稿件。",
    ],
    reviewDesk: [
      "审校台阶段：像审校伙伴一样分清事实风险、AI 嘴替风险、结构风险和交付风险。",
      "事实与引用问题优先标出来源/推断/缺证据；风格问题优先指出具体症状和最小修法。",
    ],
    projectCd: [
      "项目光盘阶段：把回答服务于最终交付、摘录、摘要、对外说明和事实边界。",
      "不要默认更改已导出内容；如果用户要再加工，先说明这是从 Project CD 产物派生的新动作。",
    ],
    reader: [
      "Reader 阶段：把页面内容当作阅读材料；回答意义、用途、风险和下一步时区分原文、推断与待核。",
    ],
    scrapbook: [
      "Scrapbook 阶段：把摘录当作用户精选材料；帮助组合、归类和判断用途，不要扩写成未经来源支持的新事实。",
    ],
    docMap: [
      "DocMap 阶段：围绕结构、节点关系和遗漏分支回答；不要把地图当成完整原文。",
    ],
    clioStage: [
      "ClioStage 阶段：围绕讲演结构、听众路径、幻灯片节奏和讲者提示回答；不要把幻灯片当成完整论文。",
    ],
  };
  const enGuidance = {
    questionSheet: [
      "Question Sheet stage: do not rush into manuscript prose or summary. Help capture the real recipient, raw questions, personal observations, objections, constraints, term distinctions, source leads, tone target, and handoff friction.",
      "When input is thin, ask for one immediately useful field or detail instead of filling gaps with model prose.",
    ],
    outline: [
      "Outline stage: discuss structure choices, section jobs, and order; do not expand the outline into manuscript prose.",
      "Tie each section back to the Question Sheet recipient, constraints, and handoff friction; when evidence is missing, suggest returning to Question Sheet or source objects.",
    ],
    sectionDrafts: [
      "Section Drafts stage: work on the current section, not the whole project by default. Preserve the user's wording, rough judgment, personal details, and useful imperfections.",
      "When suggesting edits, name which section job changes; do not sand the writer's voice into generic model prose.",
    ],
    teachText: [
      "TeachText Manuscript stage: serve whole-draft continuity, rhythm, insertion points, and deletion boundaries.",
      "You may suggest the next edit, but do not claim the manuscript has been rewritten, inserted, or saved unless the user performs that action.",
    ],
    quickDraft: [
      "Launch-day copilot mode: answer around the Quick Draft body, left cards (setup, first impression, hands-on, AI classification, dump, strategy), boundary annotations, and current sources; do not generate or replace the user's personal judgment.",
      "You may respond to short commands like organize, draft, shorten, hook, and boundaries; organize only classifies and offers candidates, while draft replaces the body and still requires the user's own first impression.",
      "Prefer helping the user make same-day tradeoffs, make prose more spoken, add fact boundaries, compress word count or duration, and decide what to check next; do not treat SideAsk answers as saved manuscript text.",
    ],
    reviewDesk: [
      "Review Desk stage: act like a review partner and separate factual risk, AI-mouthpiece risk, structure risk, and handoff risk.",
      "For facts and citations, prioritize source/inference/missing-evidence boundaries; for style, name the symptom and smallest useful fix.",
    ],
    projectCd: [
      "Project CD stage: serve final handoff, excerpting, summaries, external notes, and fact boundaries.",
      "Do not assume exported material should change; if the user asks to reuse it, frame that as a new derived action from Project CD.",
    ],
    reader: [
      "Reader stage: treat the page as reading material; when answering meaning, use, risk, or next steps, separate source text, inference, and points to check.",
    ],
    scrapbook: [
      "Scrapbook stage: treat clips as user-curated material; help combine, sort, and judge use without expanding into unsupported new facts.",
    ],
    docMap: [
      "DocMap stage: answer around structure, node relationships, and missing branches; do not treat the map as the complete source text.",
    ],
    clioStage: [
      "ClioStage stage: answer around talk structure, audience path, slide rhythm, and speaker cues; do not treat slides as a full paper.",
    ],
  };

  const sections = [
    zh ? `ClioTalk 当前写作阶段：${stageName}` : `ClioTalk current writing stage: ${stageName}`,
    ...(zh ? (zhGuidance[normalized] || zhGuidance.questionSheet) : (enGuidance[normalized] || enGuidance.questionSheet)),
    zh
      ? "除非用户明确要求跨阶段规划，否则回答要服务当前阶段的下一个可执行判断。"
      : "Unless the user explicitly asks for cross-stage planning, serve the next actionable decision for the current stage.",
  ];

  // Quick Draft / 钟点稿 SideAsk is governed by the full Author Thesis
  // guardrail: the user's thesis is the highest-priority author intent and the
  // model may not generate or replace it. Mirrors the server-side injection on
  // /api/draft/thesis so the conversation about the draft is held to the same
  // boundary as the draft generation itself.
  if (normalized === "quickDraft" && typeof window !== "undefined" && window.AISystem6AuthorThesis?.instruction) {
    sections.push(window.AISystem6AuthorThesis.instruction({ language: currentLanguage }));
  }
  if (normalized === "quickDraft" && typeof window !== "undefined" && window.AISystem6ChatVent?.instruction) {
    sections.push(window.AISystem6ChatVent.instruction({ language: currentLanguage }));
  }

  return sections.join("\n");
}

function ragGroundingInstruction(sourceLabel = "") {
  const zh = currentLanguage === "zh";
  const label = String(sourceLabel || "").trim();
  return zh
    ? [
        `${label || "材料"}是主要依据，不是回答边界。`,
        "可以结合常识、写作判断或结构判断帮助用户理解，但要分清：材料明说了什么、你从材料推断了什么、哪些需要回到来源或外部事实核对。",
        "不要把材料外的判断伪装成材料原文，也不要因为材料没直接写就拒绝回答用户真正想问的意义、用途、风险或下一步。",
      ].join("\n")
    : [
        `${label || "The source"} is the primary grounding, not the boundary of the answer.`,
        "You may use common sense, writing judgment, or structural judgment to help the user understand, but distinguish what the source says, what you infer from it, and what needs source or external checking.",
        "Do not pretend outside judgment is in the source, and do not refuse the user's real question about meaning, use, risk, or next steps merely because the source does not state it directly.",
      ].join("\n");
}

function formatSideAskAnchorContext() {
  if (!sideAskEnabled || isMultiFinderMode()) return "";
  const anchor = sideAskAnchorAppId || "teachText";
  const zh = currentLanguage === "zh";
  const heading = zh
    ? "SideAsk 当前配对材料。用户正在对这个可见窗口持续追问；把它作为主要依据，同时区分原文、推断和需要核对的部分："
    : "Current SideAsk paired material. The user is asking follow-ups about this visible window; use it as primary grounding while distinguishing source text, inference, and points to check:";
  const section = (label, text, limit = 12000) => {
    const body = String(text || "").trim();
    return body ? [heading, `${label}:`, clipContextContent(body, limit)].join("\n") : "";
  };

  if (anchor === "teachText") {
    const title = typeof getTeachTextDocumentName === "function"
      ? getTeachTextDocumentName({ fallback: teachTextNameInput?.value?.trim() || t("teachtext_label") })
      : t("teachtext_label");
    return section(`${t("teachtext_label")} / ${title}`, teachTextBodyInput?.value || "", 14000);
  }
  if (anchor === "quickDraft") {
    return section(t("quick_draft_label"), formatQuickDraftForClioTalk(), 18000);
  }
  if (anchor === "reader" && currentReaderPage) {
    return section(`${t("reader")} / ${currentReaderPage.title || t("reader")}`, currentReaderPage.text || "", 14000);
  }
  if (anchor === "scrapbook") {
    const selected = typeof getSelectedScraps === "function" ? getSelectedScraps() : [];
    const sourceScraps = selected.length ? selected : scraps.filter((scrap) => isInActiveProject(scrap));
    return section(t("scrapbook"), typeof formatScrapsForTransfer === "function" ? formatScrapsForTransfer(sourceScraps) : "", selected.length ? 9000 : 14000);
  }
  if (anchor === "docMap" && currentDocMap && typeof formatDocMapMarkdown === "function") {
    return section(`${t("docmap")} / ${currentDocMap.sourceLabel || t("docmap")}`, formatDocMapMarkdown(currentDocMap), 12000);
  }
  if (anchor === "clioStage" && typeof clioStageState !== "undefined" && clioStageState?.source?.markdown) {
    return section(`${t("clio_stage_label")} / ${clioStageState.source.title || t("clio_stage_label")}`, clioStageState.source.markdown, 14000);
  }
  return "";
}

function buildPayload(userText, options = {}) {
  compactConversationMemoryIfNeeded(options);
  const contextSections = [];
  const skipContext = options.skipContext === true;
  const isSideAskChat = !skipContext && sideAskEnabled && !isMultiFinderMode();
  const isScopedSideAskChat = isSideAskChat;
  const taskKind = options.taskKind || (isSideAskChat ? "sideask" : "chat");

  contextSections.push(aiSystem6IdentityContext());
  if (isSideAskChat) contextSections.push(sideAskAnswerStyleInstruction());
  if (isClioTalkAnswerContractTask(taskKind, options)) {
    contextSections.push(clioTalkResponseContractInstruction({ isSideAskChat }));
    contextSections.push(clioTalkWritingStageInstruction());
  }

  const systemTermsContext = (skipContext || isScopedSideAskChat) ? "" : formatSystemHelpTermsForContext();
  if (systemTermsContext) {
    contextSections.push([
      currentLanguage === "zh"
        ? "AI System 6 系统帮助术语。涉及产品概念时，以这些定义为准："
        : "AI System 6 System Help terms. Use these canonical definitions for product concepts when relevant:",
      systemTermsContext,
    ].join("\n"));
  }

  const projectTermsContext = (skipContext || isScopedSideAskChat) ? "" : formatProjectDictionaryTermsForContext();
  if (projectTermsContext) {
    contextSections.push([
      currentLanguage === "zh"
        ? "当前项目词典术语。相关时用这些定义保持称呼一致："
        : "Current Project Terms from Dictionary. Use these definitions to keep wording consistent when relevant:",
      projectTermsContext,
    ].join("\n"));
  }

  const sideAskContext = skipContext ? "" : formatSideAskAnchorContext();
  if (sideAskContext) contextSections.push(sideAskContext);

  if (!skipContext && !isScopedSideAskChat && attachedClipIds.size > 0) {
    const attachedScraps = [...attachedClipIds]
      .map((id) => scraps.find((scrap) => scrap.id === id && isInActiveProject(scrap)))
      .filter(Boolean);
    const clipTexts = takeWithinBudget(
      attachedScraps,
      maxAttachedContextChars,
      (scrap, index) => {
        const contextItem = {
          id: scrap.id,
          kind: "scrap",
          projectId: scrap.projectId,
          tags: scrap.tags || [],
          sourceType: scrap.source?.type || "",
        };
        const citationId = sourceCitationForContextItem(contextItem, index) || `[A${index + 1}]`;
        return `${citationId} Explicit Scrapbook attachment / ${scrap.title}\n${clipContextContent(scrap.body, maxContextItemChars)}`;
      }
    );

    if (clipTexts.length) {
      contextSections.push(
        [
          currentLanguage === "zh"
            ? "用户手动附加了这些 Scrapbook 摘录作为主要上下文。先使用它们，再使用更宽泛的检索："
            : "The user manually attached these Scrapbook clips as primary context. Use them before broader retrieval:",
          ...clipTexts,
        ].join("\n\n")
      );
    }
  }

  const hasMountedFileDisk = !skipContext && !isScopedSideAskChat && hasMountedFileDiskContext();
  const useBroadContext = !skipContext && !isScopedSideAskChat && (rememberInput.checked || attachedClipIds.size > 0);
  const useContext = useBroadContext || hasMountedFileDisk;
  const recentMessages = !skipContext && (rememberInput.checked || isScopedSideAskChat) ? conversation.slice(-6) : [];
  const budgetInfo = getRagContextBudget(userText, recentMessages);
  const retrievedContext = useContext
    ? retrieveContext(userText, {
        budgetInfo,
        taskKind,
        includeCurated: useBroadContext,
        includeProjectReferences: useBroadContext,
        includeTextDisk: hasMountedFileDisk || useBroadContext,
      })
    : "";
  if (!useContext) {
    lastContextBudget = null;
    lastRetrievedContextItems = [];
    scheduleRenderTasks("contextPanel");
  }
  if (retrievedContext) contextSections.push(retrievedContext);
  const contextIntro = currentLanguage === "zh"
    ? (isSideAskChat
      ? "把这些本地上下文当作可见 SideAsk 配对窗口的主要依据，但不要被它关住。回答用户真正的问题；区分来源明说、你的推断和需要核对的部分。有可用编号时引用方括号编号。不要编造细节，也不要把外部判断伪装成来源原文。"
      : "相关时使用这些小而精选的本地上下文。它可能包含用户选择的摘录、保存文稿、插入的文件软盘片段和保存来源。有可用编号时引用 [S1] 或 [S1:2] 这样的编号。不要编造摘录以外的细节；如果摘录无法回答，说明缺什么，再给出最稳妥的一般判断或下一步核对。")
    : (isSideAskChat
      ? "Use this local context as the primary grounding for the visible SideAsk pair, not as a prison. Help answer the user's actual question; distinguish what the source says, what you infer from it, and what needs checking. Cite useful excerpts with bracket IDs when available. Do not invent details or present outside judgment as source text."
      : "Use this small, curated local context when it is relevant. It may contain user-selected clips, saved documents, inserted File Floppy excerpts, and saved references. Cite useful excerpts with their bracket IDs such as [S1] or [S1:2]. Do not invent details beyond these excerpts. If the excerpts do not answer the question, say what is missing and then help with the safest general reasoning or next check.");
  const contextMessage = contextSections.length
    ? {
        role: "system",
        content: `${contextIntro}\n\n${contextSections.join("\n\n")}`,
      }
    : null;
  const memoryMessage = conversationMemorySystemMessage(options);

  const payload = {
    model: getLocalModelRequestName(),
    ...(typeof currentContextRouteConfig === "function" ? currentContextRouteConfig() : {}),
    messages: withMarkdownModelMessages([
      { role: "system", content: systemInput.value.trim() },
      { role: "system", content: clioTalkLanguageInstruction() },
      ...(contextMessage ? [contextMessage] : []),
      ...(memoryMessage ? [memoryMessage] : []),
      ...recentMessages.filter((_, index) => {
        const messageIndex = conversation.length - recentMessages.length + index;
        return messageIndex >= Number(compressedConversationMemory?.sourceMessages || 0);
      }),
      { role: "user", content: userText },
    ]),
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
    stream: false,
    ai_system6_task_kind: taskKind,
  };
  const localDefaults = localChatDefaults(payload.model, options);
  Object.assign(payload, localDefaults);
  if (Number.isFinite(options.maxTokens)) payload.max_tokens = Math.max(1, Math.round(options.maxTokens));

  return payload;
}

function isQwen35ModelName(value = "") {
  return /qwen(?:[-_/ ]?3\.[56]|3\.[56])/i.test(String(value || ""));
}

function isGemma4ModelName(value = "") {
  return /gemma[-_/ ]?4/i.test(String(value || ""));
}

function qwen35ChatDefaults(modelName, options = {}) {
  if (!isQwen35ModelName(modelName)) return {};
  const taskKind = String(options.taskKind || "chat").toLowerCase();
  const thinking = false;
  const maxTokens = qwen35AppMaxTokens(taskKind);
  const temperature = Number.isFinite(options.temperature)
    ? options.temperature
    : qwen35TaskTemperature(taskKind);
  return {
    max_tokens: maxTokens,
    temperature,
    top_p: 0.8,
    top_k: 20,
    min_p: 0,
    presence_penalty: 1.5,
    enable_thinking: thinking,
    reasoning_effort: "none",
    chat_template_kwargs: { enable_thinking: thinking },
  };
}

function gemma4ChatDefaults(modelName, options = {}) {
  if (!isGemma4ModelName(modelName)) return {};
  const taskKind = String(options.taskKind || "chat").toLowerCase();
  return {
    max_tokens: localTaskMaxTokens(taskKind),
    temperature: Number.isFinite(options.temperature) ? options.temperature : 1.0,
    top_p: 0.95,
    top_k: 64,
    min_p: 0,
    enable_thinking: false,
    thinking: { type: "disabled" },
    reasoning_effort: "none",
    chat_template_kwargs: { enable_thinking: false },
  };
}

function scrubVisibleModelOutput(text = "") {
  return String(text || "")
    .replace(/<\|channel\>thought[\s\S]*?<channel\|>/gi, "")
    .replace(/<\|channel\>(?:final|answer)\s*/gi, "")
    .replace(/<channel\|>/gi, "")
    .trim();
}

function qwen35TaskTemperature(taskKind = "chat") {
  const kind = String(taskKind || "chat").toLowerCase();
  if (/dictation|speech|transcript/.test(kind)) return 0.25;
  if (/draft|rewrite|polish|writing-tool|continue|chat/.test(kind)) return 0.55;
  if (/organize-question-sheet|question-sheet|generate-outline|docmap|review|claim|hkrr|dictionary/.test(kind)) return 0.35;
  return 0.6;
}

function localTaskMaxTokens(taskKind = "chat") {
  return qwen35AppMaxTokens(taskKind);
}

function localNoThinkingDefaults(taskKind = "chat") {
  return {
    max_tokens: localTaskMaxTokens(taskKind),
    enable_thinking: false,
    thinking: { type: "disabled" },
    reasoning_effort: "none",
    chat_template_kwargs: { enable_thinking: false },
  };
}

function localChatDefaults(modelName, options = {}) {
  const taskKind = String(options.taskKind || "chat").toLowerCase();
  return {
    ...localNoThinkingDefaults(taskKind),
    ...gemma4ChatDefaults(modelName, options),
    ...qwen35ChatDefaults(modelName, options),
  };
}

function qwen35AppMaxTokens(taskKind = "chat") {
  const kind = String(taskKind || "chat").toLowerCase();
  if (/mingming/.test(kind)) return 5200;
  if (/sideask|reader|scrapbook|clio-stage/.test(kind)) return 520;
  if (/docmap-question/.test(kind)) return 520;
  if (/dictation|speech|transcript/.test(kind)) return 900;
  if (/organize-question-sheet|question-sheet/.test(kind)) return 420;
  if (/generate-outline/.test(kind)) return 900;
  if (/writing-demo-rag/.test(kind)) return 260;
  if (/docmap|outline|draft|rebuild|writing_object|hkrr|slides|marp|critique|review|claim/.test(kind)) return 2600;
  if (/bureaucracy|meme|caption/.test(kind)) return 1200;
  if (/dictionary/.test(kind)) return 900;
  return 1600;
}

function isDeepSeekV4ModelName(value = "") {
  return /^(?:deepseek-)?v4-(?:pro|flash)$/i.test(String(value || ""));
}

function cloudTaskMaxTokens(taskKind = "chat") {
  const kind = String(taskKind || "chat").toLowerCase();
  if (/mingming/.test(kind)) return 5200;
  if (/sideask|reader|scrapbook|clio-stage/.test(kind)) return 520;
  if (/docmap-question/.test(kind)) return 520;
  if (/docmap|outline|draft|rebuild|writing_object|hkrr|slides|marp|critique|review|claim/.test(kind)) return 2600;
  if (/bureaucracy|meme|caption/.test(kind)) return 1200;
  if (/dictionary/.test(kind)) return 900;
  return 1800;
}

function deepSeekV4CloudDefaults(modelName, taskKind = "chat") {
  if (!isDeepSeekV4ModelName(modelName)) return {};
  const kind = String(taskKind || "chat").toLowerCase();
  const structuredTask = /mingming|docmap|outline|draft|rebuild|writing_object|hkrr|slides|marp|critique|review|claim|dictionary|translation|reader|scrapbook|bureaucracy|meme|caption/.test(kind);
  return {
    thinking: { type: "disabled" },
    max_tokens: structuredTask ? cloudTaskMaxTokens(kind) : cloudTaskMaxTokens("chat"),
  };
}

function sanitizeDeepSeekV4CloudPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (!isDeepSeekV4ModelName(payload.model)) return payload;
  const nextPayload = { ...payload, thinking: { type: "disabled" } };
  delete nextPayload.reasoning_effort;
  delete nextPayload.enable_thinking;
  delete nextPayload.chat_template_kwargs;
  delete nextPayload.top_k;
  delete nextPayload.min_p;
  return nextPayload;
}

function sanitizeCloudChatPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const nextPayload = { ...payload };
  if (String(nextPayload.reasoning_effort || "").toLowerCase() === "none") {
    delete nextPayload.reasoning_effort;
  }
  delete nextPayload.enable_thinking;
  delete nextPayload.chat_template_kwargs;
  delete nextPayload.top_k;
  delete nextPayload.min_p;
  return nextPayload;
}

function messageRoleLabel(role) {
  return role === "assistant" ? clioTalkAssistantDisplayName() : role === "user" ? "User" : "System";
}

const memoryLinePattern = /^#{1,4}\s|^[-*+]\s|\d+\.\s|^(Title|标题|Goal|目标|Constraint|限制|Decision|决定|TODO|Next|下一步)[:：]|必须|不要|保留|修改|失败|错误|上下文|预算|模型|写作对象|DocMap|outline|draft|context|budget|must|should|avoid|error|failed/i;

function importantConversationLines(text, limit = 8) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => memoryLinePattern.test(line))
    .slice(0, limit)
    .map((line) => line.length > 260 ? `${line.slice(0, 257).trim()}...` : line);
}

function compactMessageForMemory(message, index) {
  const content = String(message?.content || "").trim();
  if (!content) return "";
  const lines = importantConversationLines(content, 6);
  return [
    `### ${index + 1}. ${messageRoleLabel(message.role)}`,
    lines.length ? lines.map((line) => `- ${line}`).join("\n") : clipContextContent(content, 520),
  ].join("\n").trim();
}

function buildConversationMemoryText(messages, previousMemory = "") {
  const usable = messages.filter((message) => String(message?.content || "").trim());
  const firstUser = usable.find((message) => message.role === "user");
  const memoryTurns = uniqueMessages([firstUser, ...usable.slice(-14)])
    .map((message, index) => compactMessageForMemory(message, index))
    .filter(Boolean)
    .join("\n\n");
  return [
    "# Conversation Memory",
    "This is an automatic continuity note. Treat it as compressed working memory, not as source text to quote.",
    previousMemory ? `## Prior compressed memory\n${clipContextContent(previousMemory, 5000)}` : "",
    memoryTurns ? `## Compressed turns\n${memoryTurns}` : "",
  ].filter(Boolean).join("\n\n").trim();
}

function compactConversationMemoryIfNeeded(options = {}) {
  if (sideAskEnabled && !isMultiFinderMode()) return false;
  if (!rememberInput?.checked || options.skipContext === true) return false;
  const keepMessages = Number.isFinite(options.keepMessages) ? options.keepMessages : 6;
  const cutoff = Math.max(0, conversation.length - keepMessages);
  if (cutoff < 4) return false;
  if (!options.force && cutoff <= Number(compressedConversationMemory?.sourceMessages || 0)) return false;

  const nextText = buildConversationMemoryText(
    conversation.slice(0, cutoff),
    compressedConversationMemory?.text || ""
  );
  compressedConversationMemory = {
    text: clipContextContent(nextText, 14000),
    sourceMessages: cutoff,
    updatedAt: new Date().toISOString(),
  };
  scheduleSettingsSave();
  return true;
}

function conversationMemorySystemMessage(options = {}) {
  if (sideAskEnabled && !isMultiFinderMode()) return null;
  if (!rememberInput?.checked || options.skipContext === true) return null;
  const text = String(compressedConversationMemory?.text || "").trim();
  if (!text) return null;
  return {
    role: "system",
    content: `${text}\n\nContinuity memory only. Current user instructions override it.`,
  };
}

function invalidateSessionContextAfterTrash() {
  resetClioTalkRuntimeState({ clearPrompt: false });
}

function isConversationMemoryMessage(message) {
  return /^# Conversation Memory\b/.test(String(message?.content || ""));
}

function isRetrievedContextMessage(message) {
  return /^Use this small, curated local context\b/.test(String(message?.content || ""));
}

function uniqueMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    if (!message) return false;
    const key = `${message.role}\n${message.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slimMessagesForContinuity(messages = []) {
  const firstSystem = messages[0] || null;
  const memory = messages.find(isConversationMemoryMessage);
  const context = messages.find(isRetrievedContextMessage);
  const lastUser = [...messages].reverse().find((message) => message.role === "user") || messages.at(-1);
  return uniqueMessages([firstSystem, memory, context, lastUser]);
}

function compressMarkdownForContinuity(text, limit, label) {
  const clean = String(text || "").trim();
  if (clean.length <= limit) return clean;
  const lines = clean.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const highSignal = [
    ...lines.filter((line) => /^#{1,4}\s/.test(line)).slice(0, 40),
    ...importantConversationLines(clean, 40),
  ];
  const headSize = Math.max(600, Math.floor(limit * 0.34));
  const tailSize = Math.max(600, Math.floor(limit * 0.28));
  const middleSize = Math.max(800, limit - headSize - tailSize - 900);
  const middle = highSignal
    .filter(Boolean)
    .slice(0, 60)
    .join("\n")
    .slice(0, middleSize)
    .trim();
  return [
    `[Compressed context: ${label}; original ${clean.length} chars]`,
    "Preserved structure, constraints, citations, opening, and ending.",
    "",
    "## Opening",
    clean.slice(0, headSize).trim(),
    middle ? `\n## Signals\n${middle}` : "",
    "## Ending",
    clean.slice(-tailSize).trim(),
  ].filter(Boolean).join("\n\n").slice(0, limit).trim();
}

function compressPayloadForContinuity(payload, budget = {}, options = {}) {
  const contextLength = Math.max(4096, Number(budget.context_length || contextLengthInput?.value || 8192) || 8192);
  const outputReserve = defaultRequestedOutputTokens(options);
  const promptCharBudget = Math.max(6000, (contextLength - outputReserve - reservedSafetyTokens) * contextCharsPerToken);
  const hard = options.hard === true;
  const limits = {
    system: hard ? 1800 : 3600,
    memory: hard ? 5000 : Math.min(12000, Math.floor(promptCharBudget * 0.12)),
    context: hard ? 9000 : Math.min(30000, Math.floor(promptCharBudget * 0.24)),
    user: hard ? 36000 : Math.max(12000, Math.floor(promptCharBudget * 0.52)),
  };

  const messages = slimMessagesForContinuity(payload.messages || []).map((message) => {
    if (!message) return message;
    const kind = isConversationMemoryMessage(message) ? "memory"
      : isRetrievedContextMessage(message) ? "context"
        : message.role === "user" ? "user"
          : message.role === "system" ? "system"
            : "";
    return kind
      ? { ...message, content: compressMarkdownForContinuity(message.content, limits[kind], kind) }
      : message;
  });

  lastContextBudget = {
    ...(lastContextBudget || {}),
    compressed: true,
    budgetSource: lastContextBudget?.budgetSource
      ? `${lastContextBudget.budgetSource}+compressed`
      : "compressed",
  };
  scheduleRenderTasks("contextPanel");
  return { ...payload, messages: uniqueMessages(messages) };
}

function defaultRequestedOutputTokens(options = {}) {
  if (Number.isFinite(options.maxTokens)) return Math.max(1, Math.round(options.maxTokens));
  if (isQwen35ModelName(getLocalModelRequestName())) return qwen35AppMaxTokens(options.taskKind || "chat");
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active) return 32768;
  return Math.max(reservedOutputTokens, 4096);
}

async function readModelBudget(payload, options = {}, signal = null) {
  const endPerf = window.AISystem6Perf?.start("budget_preflight", { taskKind: options.taskKind || "chat" });
  try {
    const response = await fetch("/api/model-budget", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        task_kind: options.taskKind || "chat",
        requested_output_tokens: defaultRequestedOutputTokens(options),
        context_length: contextLengthInput?.value,
      }),
    });
    if (!response.ok) throw new Error("model_budget_unavailable");
    const budget = await response.json();
    endPerf?.({ source: budget.budget_source, fits: budget.fits });
    return budget;
  } catch (error) {
    endPerf?.({ error: true });
    throw error;
  }
}

function recordModelBudget(budget) {
  if (!budget) return;
  lastContextBudget = {
    ...(lastContextBudget || {}),
    contextTokens: budget.context_length,
    promptTokens: budget.prompt_tokens,
    availableOutputTokens: budget.available_output_tokens,
    budgetSource: budget.budget_source,
  };
  scheduleRenderTasks("contextPanel");
}

async function checkedBudget(payload, options, signal, compressed = false) {
  const budget = await readModelBudget(payload, options, signal);
  recordModelBudget(compressed ? { ...budget, budget_source: `${budget.budget_source}+compressed` } : budget);
  return budget;
}

async function fitPayloadWithModelBudget(payload, options = {}, signal = null) {
  let candidate = payload;
  try {
    let budget = await checkedBudget(candidate, options, signal);
    if (budget.fits) return candidate;

    const slimPayload = { ...payload, messages: slimMessagesForContinuity(payload.messages) };
    candidate = slimPayload;
    budget = await checkedBudget(candidate, options, signal);
    if (budget.fits) return candidate;

    candidate = compressPayloadForContinuity(slimPayload, budget, options);
    budget = await checkedBudget(candidate, options, signal, true);
    if (budget.fits) return candidate;

    candidate = compressPayloadForContinuity(slimPayload, budget, { ...options, hard: true });
    budget = await checkedBudget(candidate, options, signal, true);
    if (budget.fits) return candidate;
  } catch {
    return fitChatPayloadToContext(candidate, options);
  }

  return fitChatPayloadToContext(candidate, options);
}

function fitChatPayloadToContext(payload, options = {}) {
  const contextTokens = Number.isFinite(options.contextTokens)
    ? Math.max(1024, Math.round(options.contextTokens))
    : (typeof getEffectiveContextTokens === "function"
      ? getEffectiveContextTokens()
      : Math.max(1024, Number(contextLengthInput?.value || 8192) || 8192));
  const outputReserve = Number.isFinite(options.maxTokens)
    ? Math.max(256, Math.round(options.maxTokens))
    : defaultRequestedOutputTokens(options);
  const promptBudget = Math.max(512, contextTokens - outputReserve - reservedSafetyTokens);
  let messages = [...(payload.messages || [])];
  const messageTokens = (message) => estimateTokenCount(message?.content || "") + 6;
  const promptTokensFor = (items) => items.reduce((sum, message) => sum + messageTokens(message), 0);
  if (promptTokensFor(messages) <= promptBudget) return payload;

  messages = [
    ...messages.slice(0, 2),
    ...(messages.at(-1) ? [messages.at(-1)] : []),
  ];
  if (promptTokensFor(messages) <= promptBudget) {
    return { ...payload, messages };
  }

  const fixedTokens = messages
    .slice(0, -1)
    .reduce((sum, message) => sum + messageTokens(message), 0);
  const userBudget = Math.max(120, promptBudget - fixedTokens - 6);
  const userMessage = messages.at(-1) || { role: "user", content: "" };
  const clean = String(userMessage.content || "").trim();
  const charBudget = Math.max(0, Math.floor(userBudget * contextCharsPerToken));
  const notice = currentLanguage === "zh"
    ? "\n\n[已裁剪]\n\n"
    : "\n\n[Clipped]\n\n";
  const available = Math.max(120, charBudget - notice.length);
  const head = Math.floor(available * 0.62);
  messages[messages.length - 1] = {
    ...userMessage,
    content: clean.length > charBudget && charBudget >= 240
      ? `${clean.slice(0, head).trim()}${notice}${clean.slice(-(available - head)).trim()}`
      : clean.slice(0, charBudget).trim(),
  };
  return { ...payload, messages };
}

function getChatCompletionsEndpoint() {
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudConfig.apiKey) {
    return "/api/cloud/chat";
  }

  const endpoint = endpointInput.value.trim().replace(/\/$/, "");

  if (endpoint.startsWith("/")) {
    return endpoint;
  }

  if (endpoint.endsWith("/chat/completions")) {
    return endpoint;
  }

  if (endpoint.endsWith("/v1")) {
    return `${endpoint}/chat/completions`;
  }

  return endpoint;
}

function normalizeMountedChunkText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\f\v\u00a0]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function setComposerBusy(isBusy) {
  document.body.classList.toggle("is-busy", isBusy);
  promptInput.disabled = isBusy;
  clipSelectionButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  retryButton.disabled = isBusy;
  retryButton.hidden = isBusy || !lastUserText;
  stopButton.hidden = !isBusy;
  form.querySelector("button[type='submit']").disabled = isBusy;
}

function stopGeneration() {
  activeAbortController?.abort();
}

function estimateTokenCount(text) {
  const normalized = (text || "").trim();
  if (!normalized) return 0;
  return Math.max(1, Math.round(normalized.length / 4));
}

function normalizeStopReason(value) {
  return String(value || "--").replace(/_/g, " ");
}

function formatMetricDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "--";
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`;
}

function updateModelMeterVisibility() {
  const visible = performanceMeterInput.checked && !!lastModelMetrics;
  assistantMeterButton.classList.toggle("is-hidden", !visible);
  updateMenuState();
}

function updateModelMeter(metrics) {
  lastModelMetrics = metrics;
  if (!metrics) {
    updateModelMeterVisibility();
    return;
  }

  const speedText = metrics.tokensPerSecond ? `${metrics.tokensPerSecond.toFixed(1)} tok/s` : "-- tok/s";
  const tokenText = `${metrics.tokens} tok`;
  const elapsedText = formatMetricDuration(metrics.elapsedMs);
  const stopText = normalizeStopReason(metrics.stopReason);
  const slow = window.AISystem6Perf?.slowEvents?.().at(-1);
  const slowText = slow ? `${slow.name} ${formatMetricDuration(slow.duration)}` : "";

  assistantMeterButton.textContent = `${speedText} · ${tokenText} · ${elapsedText}`;
  assistantMeterButton.title = slowText ? `Last slow operation: ${slowText}` : "";
  meterSpeedEl.textContent = speedText;
  meterTokensEl.textContent = tokenText;
  meterElapsedEl.textContent = elapsedText;
  meterStopEl.textContent = slowText ? `${stopText} · ${slowText}` : stopText;
  updateModelMeterVisibility();
  updateMenuStatus();
  renderAboutMacintosh();
}


const CLOUD_PRICING_CNY_PER_1M = {
  "deepseek-v4-flash": { inputCacheHit: 0.02, inputCacheMiss: 1.0, output: 2.0 },
  "deepseek-v4-pro": { inputCacheHit: 0.025, inputCacheMiss: 3.0, output: 6.0 },
  "v4-flash": { inputCacheHit: 0.02, inputCacheMiss: 1.0, output: 2.0 },
  "v4-pro": { inputCacheHit: 0.025, inputCacheMiss: 3.0, output: 6.0 },
};


var latestCloudUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_cny: 0 };
var sessionCloudUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_cny: 0 };

function cloudProviderDisplayName(provider) {
  if (provider === "deepseek") return "DeepSeek";
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : (typeof t === "function" ? t("cloud_model") : "Cloud Model");
}

function cloudModelShortName(model) {
  return String(model || "").replace(/^deepseek-/, "") || "-";
}

function cloudModelRouteLabel(config = cloudConfig) {
  const provider = cloudProviderDisplayName(config?.provider);
  const model = cloudModelShortName(config?.model);
  return model === "-" ? provider : `${provider} · ${model}`;
}

function cloudUsageText(usage) {
  if (!usage?.total_tokens) return "-";
  const tokens = formatTokenCount(usage.total_tokens);
  return usage.cost_cny ? `${tokens} tok · ¥${usage.cost_cny.toFixed(4)}` : `${tokens} tok`;
}

function cloudBalanceText(config = cloudConfig) {
  return config?.balance
    ? `${config.balance.currency || "CNY"} ${Number(config.balance.total).toFixed(2)}`
    : "-";
}

function formatContextWindowSize(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toLocaleString("en-US") : "-";
}

function knownCloudContextWindow(config = cloudConfig) {
  if (!config?.model || typeof CLOUD_MODEL_CONTEXT_LENGTHS === "undefined") return 0;
  return Number(CLOUD_MODEL_CONTEXT_LENGTHS[config.model] || 0);
}

function currentContextWindowText(config = cloudConfig) {
  const activeCloud = config?.active && config?.model;
  if (activeCloud) return formatContextWindowSize(knownCloudContextWindow(config));
  return formatContextWindowSize(contextLengthInput?.value);
}

function refreshCloudUsageDisplay() {
  var indicator = document.querySelector("#cloud-model-indicator");
  if (!indicator) return;
  var labelEl = document.querySelector("#cloud-model-label");
  var iconEl = indicator.querySelector("[data-system-icon]");
  var hasCloudConfig = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.provider && cloudConfig.apiKey;
  var isCloudActive = !!(hasCloudConfig && cloudConfig.active);
  if (!hasCloudConfig) {
    indicator.classList.add("is-hidden");
    return;
  }
  var modelName = isCloudActive ? (cloudConfig.model || "cloud") : getLocalModelDisplayName();
  var displayName = isCloudActive ? cloudModelShortName(modelName) : modelName;
  if (labelEl) labelEl.textContent = displayName;
  if (iconEl) {
    iconEl.dataset.systemIcon = isCloudActive ? "cloudModel" : "cloudModelOff";
    iconEl.innerHTML = systemIconSvg(iconEl.dataset.systemIcon);
  }
  if (typeof syncPromptPlaceholder === "function") syncPromptPlaceholder();
  indicator.classList.toggle("is-local-model", !isCloudActive);
  indicator.title = isCloudActive
    ? `${typeof t === "function" ? t("cloud_model") : "Cloud Model"}: ${displayName}`
    : `${currentLanguage === "zh" ? "云端关闭，使用本地模型：" : "Cloud off, using local model: "}${displayName}`;
  indicator.setAttribute("aria-label", indicator.title);
  indicator.classList.remove("is-hidden");
  if (typeof renderCloudModelPopover === "function") {
    renderCloudModelPopover();
  }
  if (typeof renderCloudStatePanel === "function") {
    renderCloudStatePanel();
  }
}

function formatTokenCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function estimateCloudCostCny(promptTokens, completionTokens, usage = {}) {
  var pricing = CLOUD_PRICING_CNY_PER_1M[cloudConfig.model] || null;
  if (!pricing) return 0;
  var cacheHitTokens = Number(usage.prompt_cache_hit_tokens || 0);
  var cacheMissTokens = Number(usage.prompt_cache_miss_tokens || 0);
  var countedInputTokens = cacheHitTokens + cacheMissTokens;
  if (!countedInputTokens) cacheMissTokens = Number(promptTokens || 0);
  return (cacheHitTokens / 1e6) * pricing.inputCacheHit
    + (cacheMissTokens / 1e6) * pricing.inputCacheMiss
    + (Number(completionTokens || 0) / 1e6) * pricing.output;
}

function trackCloudTokenUsage(promptTokens, completionTokens, totalTokens, usage = {}) {
  if (typeof cloudConfig === "undefined" || !cloudConfig || !cloudConfig.active) return;

  latestCloudUsage.prompt_tokens = promptTokens;
  latestCloudUsage.completion_tokens = completionTokens;
  latestCloudUsage.total_tokens = totalTokens;
  latestCloudUsage.cost_cny = estimateCloudCostCny(promptTokens, completionTokens, usage);

  sessionCloudUsage.prompt_tokens += promptTokens;
  sessionCloudUsage.completion_tokens += completionTokens;
  sessionCloudUsage.total_tokens += totalTokens;
  sessionCloudUsage.cost_cny += latestCloudUsage.cost_cny;

  var key = "ai-system6-cloud-usage";
  var storedUsage = {};
  try {
    var raw = localStorage.getItem(key);
    if (raw) storedUsage = JSON.parse(raw);
  } catch (ignore) {}
  storedUsage.prompt_tokens = (storedUsage.prompt_tokens || 0) + promptTokens;
  storedUsage.completion_tokens = (storedUsage.completion_tokens || 0) + completionTokens;
  storedUsage.total_tokens = (storedUsage.total_tokens || 0) + totalTokens;
  storedUsage.cost_cny = (storedUsage.cost_cny || 0) + latestCloudUsage.cost_cny;
  try { localStorage.setItem(key, JSON.stringify(storedUsage)); } catch (ignore) {}
  refreshCloudUsageDisplay();
}

function modelMetricsFromResponse(data, content, elapsedMs) {
  const serverMetrics = data?.ai_system6_metrics || {};
  const usage = data?.usage || serverMetrics.usage || {};
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && usage.prompt_tokens) {
    trackCloudTokenUsage(usage.prompt_tokens, usage.completion_tokens || 0, usage.total_tokens || 0, usage);
  }
  const tokens = Number(usage.completion_tokens || usage.total_tokens || estimateTokenCount(content));
  const measuredMs = Number(serverMetrics.elapsed_ms || elapsedMs || 0);
  return {
    elapsedMs: measuredMs,
    tokens,
    tokensPerSecond: measuredMs > 0 ? tokens / (measuredMs / 1000) : 0,
    stopReason: data?.choices?.[0]?.finish_reason || serverMetrics.finish_reason || "--",
  };
}

function modelMetricsFromStream(content, elapsedMs, stopReason = "stop") {
  return modelMetricsFromResponse({ choices: [{ finish_reason: stopReason }] }, content, elapsedMs);
}

async function readChatCompletionStream(response, onToken, signal) {
  let streamUsage = null;
  const content = await readModelTextStream(response, {
    signal,
    throttleMs: 60,
    onSnapshot: onToken,
    onUsage: (usage) => {
      streamUsage = usage;
    },
  });
  return { content, usage: streamUsage };
}

async function readJsonModelResult(response, startedAt, endPerf, streamFallback = false) {
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LM Studio response did not include choices[0].message.content.");
  }
  const trimmed = scrubVisibleModelOutput(content);
  const metrics = modelMetricsFromResponse(data, trimmed, performance.now() - startedAt);
  updateModelMeter(metrics);
  endPerf?.({ streamed: false, streamFallback, tokens: metrics.tokens });
  return { text: trimmed, metrics, budget: lastContextBudget };
}

function fetchModelPayload(payload, signal) {
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudConfig.apiKey;
  let nextPayload = { ...payload };

  if (isCloud) {
    const cloudModel = cloudConfig.model || nextPayload.model;
    nextPayload = {
      ...deepSeekV4CloudDefaults(cloudModel, nextPayload.ai_system6_task_kind || "chat"),
      ...nextPayload,
    };
    if (isDeepSeekV4ModelName(cloudModel)) {
      nextPayload.thinking = { type: "disabled" };
      nextPayload = sanitizeDeepSeekV4CloudPayload(nextPayload);
    }
    nextPayload = sanitizeCloudChatPayload(nextPayload);
    nextPayload._cloud_api_key = cloudConfig.apiKey;
    nextPayload._cloud_base_url = cloudConfig.baseUrl;
    nextPayload._cloud_model = cloudModel;
    if (nextPayload.stream) nextPayload.stream_options = { include_usage: true };
  } else {
    const localProviderEl = document.getElementById("local-provider");
    const localProvider = localProviderEl ? localProviderEl.value : "lm-studio";
    const endpoint = endpointInput?.value?.trim() || "";
    nextPayload._local_provider = localProvider;
    nextPayload._local_endpoint = endpoint;
  }

  return fetch(getChatCompletionsEndpoint(), {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextPayload),
  });
}

async function throwModelResponseError(response, endPerf) {
  const detail = await response.text();
  const code = typeof classifyLmStudioError === "function" ? classifyLmStudioError(detail, response) : "";
  endPerf?.({ error: true, status: response.status });
  throw new Error([code, `${typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active ? "Cloud API" : "LM Studio"} returned ${response.status}: ${detail}`].filter(Boolean).join(": "));
}

async function sendLocalModelTask(options = {}) {
  const {
    userText = "",
    payload,
    signal,
    taskKind = "chat",
    streamPreference = "auto",
    onToken,
  } = options;
  const startedAt = performance.now();
  const endPerf = window.AISystem6Perf?.start("model_request", { taskKind, streamPreference });
  const requestPayload = payload || buildPayload(userText, { ...options, taskKind });
  const budgetedPayload = await fitPayloadWithModelBudget(requestPayload, { ...options, taskKind }, signal);
  const normalizedTaskKind = String(taskKind || "").toLowerCase();
  const qwenNeedsHumanizerRepair = normalizedTaskKind === "chat" && isQwen35ModelName(budgetedPayload.model);
  const gemma4NeedsVisibleRepair = normalizedTaskKind === "chat" && isGemma4ModelName(budgetedPayload.model);
  const localNeedsVisibleRepair = qwenNeedsHumanizerRepair || gemma4NeedsVisibleRepair;
  const shouldStream = streamPreference === "stream" || (streamPreference === "auto" && normalizedTaskKind === "chat" && !localNeedsVisibleRepair);
  const finalPayload = { ...budgetedPayload, stream: shouldStream };

  const response = await fetchModelPayload(finalPayload, signal);
  if (!response.ok) await throwModelResponseError(response, endPerf);

  const contentType = response.headers.get("content-type") || "";
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig?.apiKey;
  if (shouldStream && response.body && /event-stream|text\/plain|octet-stream/i.test(contentType)) {
    try {
      const { content: streamedText, usage: streamUsage } = await readChatCompletionStream(response, onToken, signal);
      const text = streamedText.trim();
      if (!text) throw new Error("LM Studio stream did not include content.");
      if (isCloud && streamUsage?.prompt_tokens) {
        trackCloudTokenUsage(streamUsage.prompt_tokens, streamUsage.completion_tokens || 0, streamUsage.total_tokens || 0);
      }
      if (isCloud && typeof window.fetchCloudBalanceSilent === "function") {
        window.fetchCloudBalanceSilent().catch(() => {});
      }
      const metrics = modelMetricsFromStream(text, performance.now() - startedAt);
      updateModelMeter(metrics);
      endPerf?.({ streamed: true, tokens: metrics.tokens });
      return { text, metrics, budget: lastContextBudget };
    } catch (streamError) {
      if (signal?.aborted) throw streamError;
      window.AISystem6Perf?.record("model_request", performance.now() - startedAt, { streamFallback: true });
      const retryResponse = await fetchModelPayload({ ...budgetedPayload, stream: false }, signal);
      if (!retryResponse.ok) await throwModelResponseError(retryResponse);
      return readJsonModelResult(retryResponse, startedAt, endPerf, true);
    }
  }

  if (isCloud && typeof window.fetchCloudBalanceSilent === "function") {
    window.fetchCloudBalanceSilent().catch(() => {});
  }
  return readJsonModelResult(response, startedAt, endPerf);
}

async function sendToLmStudio(userText, signal, options = {}) {
  const skipContextRanking = options.skipContext === true;
  const sideAskChat = sideAskEnabled && !isMultiFinderMode();
  if (!sideAskChat && !skipContextRanking && (rememberInput.checked || attachedClipIds.size > 0 || hasMountedFileDiskContext())) {
    await rankChunksForQuery(userText, signal);
  }
  const result = await sendLocalModelTask({ ...options, userText, signal, taskKind: options.taskKind || "chat" });
  return result.text;
}

function shouldCaptureQuickDraftVentInput(options = {}) {
  if (options.skipQuickDraftVent === true) return false;
  const kind = String(options.taskKind || "").toLowerCase();
  if (kind && kind !== "chat" && kind !== "sideask") return false;
  if (!sideAskEnabled || isMultiFinderMode() || sideAskAnchorAppId !== "quickDraft") return false;
  return typeof window !== "undefined"
    && typeof window.AISystem6QuickDraft?.isVentIntakeActive === "function"
    && window.AISystem6QuickDraft.isVentIntakeActive();
}

function quickDraftActionFromText(text = "") {
  if (!sideAskEnabled || isMultiFinderMode() || sideAskAnchorAppId !== "quickDraft") return "";
  const value = String(text || "").trim().toLowerCase();
  if (!value) return "";
  if (/^(树洞|进入树洞|开始树洞|开启树洞|vent|vent mode|start vent)$/.test(value)) return "vent-on";
  if (/^(结束树洞|退出树洞|停止树洞|关闭树洞|end vent|stop vent|exit vent)$/.test(value)) return "vent-off";
  if (/^(汇总树洞|整理树洞|树洞整理|树洞汇总|summarize vents|organize vents)$/.test(value)) return "vent-summary";
  if (/^(整理|归类|organize)$/.test(value)) return "organize";
  if (/^(出稿|写稿|draft)$/.test(value)) return "draft";
  if (/^(缩短|shorten)$/.test(value)) return "shorten";
  if (/^(钩子|加钩子|hook)$/.test(value)) return "hook";
  if (/^(补边界|标边界|边界|boundary|boundaries)$/.test(value)) return "boundary";
  if (/^(铭铭快审|铭铭|mingming|mingming pass)$/.test(value)) return "mingming";
  if (/^(接收者接收|接收者会怎么接|若是接收者会怎么接|接收者|recipient|recipient receive)$/.test(value)) return "recipient";
  if (/^(hkrr|hkrr 提亮|提亮|快速提亮|lift)$/.test(value)) return "hkrr";
  if (/^(夸夸我|夸我|praise|encourage me)$/.test(value)) return "praise";
  return "";
}

async function submitUserText(userText, options = {}) {
  if (!userText) return;

  const quickDraftAction = options.quickDraftAction || quickDraftActionFromText(userText);
  if (quickDraftAction && typeof window !== "undefined" && typeof window.AISystem6QuickDraft?.runClioTalkAction === "function") {
    addMessage("user", options.displayText || userText);
    promptInput.value = "";
    promptInput.focus();
    await window.AISystem6QuickDraft.runClioTalkAction(quickDraftAction);
    return;
  }

  if (shouldCaptureQuickDraftVentInput(options)) {
    const captured = window.AISystem6QuickDraft.captureVentText(userText, {
      sourceKind: "clioTalk-vent",
    });
    if (captured) {
      addMessage("user", options.displayText || userText);
      promptInput.value = "";
      promptInput.focus();
      const count = Number(captured.count) || window.AISystem6QuickDraft?.ventEntryCount?.() || 0;
      const feedback = t(captured.strategyCaptured ? "quick_draft_strategy_captured" : "quick_draft_vent_captured", count);
      addMessage("assistant", feedback);
      setStatus(feedback);
      return;
    }
  }

  if (activeAbortController) {
    setStatus(t("task_already_running", localModelState.task || t("working_locally")));
    return;
  }

  lastUserText = userText;
  addMessage("user", options.displayText || userText);
  const pendingMessage = createPendingMessage();
  startWaitCycle(pendingMessage);
  promptInput.value = "";
  promptInput.focus();

  activeAbortController = new AbortController();
  setComposerBusy(true);
  setStatus(t("thinking"));
  updateLocalModelState({ running: true, task: modelRouteText("consulting_model", "consulting_cloud_model") });

  try {
    const hasMountedProjectDisk = ragChunks.some((chunk) => chunk.projectId === activeProjectId);
    updatePendingMessage(pendingMessage, hasMountedProjectDisk ? 0 : 1, hasMountedProjectDisk ? t("searching_scraps") : `${modelRouteText("consulting_model", "consulting_cloud_model")}.`);
    await prepareStreamingMarkdownPreview();
    const assistantText = await sendToLmStudio(userText, activeAbortController.signal, {
      ...options,
      streamPreference: "auto",
      onToken: (content) => updatePendingStreamContent(pendingMessage, content),
    });
    const grounding = captureClioTalkGroundingSnapshot({
      ...options,
      taskKind: options.taskKind || (sideAskEnabled && !isMultiFinderMode() ? "sideask" : "chat"),
    });
    updatePendingMessage(pendingMessage, 2, `${t("typesetting_reply")}.`);
    conversation.push({ role: "user", content: userText });
    conversation.push({ role: "assistant", content: assistantText });
    resolvePendingMessage(pendingMessage, "assistant", assistantText, { grounding });
    updateLocalModelState({ server: true, selected: true, ready: true, running: false, task: "" });
    setStatus(t("ready"));
  } catch (error) {
    if (error.name === "AbortError") {
      resolvePendingStatus(pendingMessage, t("stopped"));
    } else {
      const code = typeof classifyLmStudioError === "function" ? classifyLmStudioError(error) : "";
      const isCloudActive = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active;
      const cloudErrorKey = { cloud_invalid_key: "cloud_invalid_key", cloud_insufficient_balance: "cloud_insufficient_balance", cloud_rate_limit: "cloud_rate_limit" }[code];
      const prefix = cloudErrorKey ? t(cloudErrorKey)
        : code === "lmstudio_context_length" ? t("lm_context_error")
        : isCloudActive ? t("cloud_api_error")
        : t("connection_error");
      resolvePendingStatus(pendingMessage, `${prefix} ${error.message}`);
      updateLocalModelState({
        server: code !== "lmstudio_server_offline",
        ready: code === "lmstudio_context_length" ? localModelState.ready : false,
        running: false,
        task: "",
      });
    }
  } finally {
    stopWaitCycle();
    activeAbortController = null;
    updateLocalModelState({ running: false, task: "" });
    setComposerBusy(false);
  }
}
