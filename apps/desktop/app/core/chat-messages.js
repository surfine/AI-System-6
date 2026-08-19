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
      scrollMessagesToLatest();
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
let clioTalkAutoFollow = true;
let clioTalkTemporaryMode = false;
let clioTalkFindQuery = "";
let clioTalkFindMatchIndex = -1;
let pendingClioTalkFileName = "";
const clioTalkUseResultUndoByMessageId = new Map();

function getPendingClioTalkFileName() {
  if (!pendingClioTalkFileName) pendingClioTalkFileName = getChatFileTitle();
  return pendingClioTalkFileName;
}

function getPendingClioTalkFolder() {
  if (typeof getSelectedFolder !== "function" || typeof getProjectFolders !== "function") return null;
  return getSelectedFolder() || getProjectFolders()[0] || null;
}

function clioTalkPendingObjectPath() {
  const project = getActiveProject();
  if (!project) return "";
  const folder = getPendingClioTalkFolder();
  const folderPath = folder && typeof getFolderPath === "function"
    ? getFolderPath(folder.id).join(" / ")
    : (typeof preferredFolderName === "function" ? preferredFolderName() : "");
  return [project.name, folderPath, getPendingClioTalkFileName()].filter(Boolean).join(" / ");
}

function clioTalkIsNearLatest() {
  if (!messagesEl) return true;
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight <= 56;
}

function syncClioTalkScrollAffordance() {
  if (!clioScrollLatestButton) return;
  clioScrollLatestButton.classList.toggle("is-hidden", clioTalkAutoFollow || clioTalkIsNearLatest());
}

function handleClioTalkMessagesScroll() {
  clioTalkAutoFollow = clioTalkIsNearLatest();
  syncClioTalkScrollAffordance();
}

function scrollMessagesToLatest({ force = false } = {}) {
  if (!messagesEl) return;
  if (!force && !clioTalkAutoFollow) {
    syncClioTalkScrollAffordance();
    return;
  }
  clioTalkAutoFollow = true;
  const scroll = () => {
    if (!force && !clioTalkAutoFollow) {
      syncClioTalkScrollAffordance();
      return;
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
    syncClioTalkScrollAffordance();
  };
  scroll();
  requestAnimationFrame(scroll);
}

async function findInClioTalkConversation(query = "", options = {}) {
  let requested = String(query || "").trim();
  if (!requested && options.prompt !== false) {
    requested = String(await showInputDialog({
      message: t("clio_find_prompt"),
      defaultValue: clioTalkFindQuery,
    }) || "").trim();
  }
  if (!requested) {
    setStatus(t("clio_find_empty"));
    return null;
  }

  const normalized = requested.toLocaleLowerCase();
  const matches = conversation.filter((message) => (
    String(message?.content || "").toLocaleLowerCase().includes(normalized)
  ));
  if (!matches.length) {
    clioTalkFindQuery = requested;
    clioTalkFindMatchIndex = -1;
    setStatus(t("clio_find_no_match", requested));
    return null;
  }

  if (clioTalkFindQuery.toLocaleLowerCase() !== normalized) {
    clioTalkFindQuery = requested;
    clioTalkFindMatchIndex = 0;
  } else {
    clioTalkFindMatchIndex = options.advance === false
      ? Math.max(0, clioTalkFindMatchIndex)
      : (clioTalkFindMatchIndex + 1) % matches.length;
  }

  const record = matches[clioTalkFindMatchIndex];
  const item = record?.id
    ? messagesEl?.querySelector(`[data-message-id="${record.id}"]`)
    : null;
  if (item) {
    item.tabIndex = -1;
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    item.focus({ preventScroll: true });
  }
  setStatus(t("clio_find_result", clioTalkFindMatchIndex + 1, matches.length));
  return record;
}

async function findNextInClioTalkConversation() {
  return findInClioTalkConversation(clioTalkFindQuery, {
    prompt: !clioTalkFindQuery,
    advance: true,
  });
}

function renderClioTalkWelcome() {
  if (!messagesEl) return;
  const existingWelcome = messagesEl.querySelector(":scope > .clio-welcome");
  if (messagesEl.children.length && !(messagesEl.children.length === 1 && existingWelcome)) return;
  if (existingWelcome) messagesEl.replaceChildren();
  const item = document.createElement("article");
  item.className = "message assistant clio-welcome";
  item.setAttribute("aria-label", clioTalkAssistantDisplayName());

  item.insertAdjacentHTML("beforeend", renderSystemIcon("assistant", {
    size: "ordinary",
    className: "clio-welcome-icon",
  }));

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = clioTalkAssistantDisplayName();

  const body = document.createElement("div");
  body.className = "message-content";
  const modelReady = clioTalkModelReady();
  const welcomeKey = !modelReady
    ? "clio_model_required_message"
    : (sideAskEnabled && !isMultiFinderMode()
      ? "sideask_welcome_message"
      : (clioTalkTemporaryMode ? "temporary_welcome_message" : "welcome_message"));
  body.innerHTML = `<p>${t(welcomeKey)}</p>`;

  if (!modelReady) {
    const actions = document.createElement("div");
    actions.className = "clio-welcome-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn default";
    button.dataset.action = "open-clio-model-settings";
    button.textContent = t("clio_connect_ai");
    actions.append(button);
    body.append(actions);
  } else if (!sideAskEnabled && !clioTalkTemporaryMode) {
    const actions = document.createElement("div");
    actions.className = "clio-welcome-actions";
    [
      ["open-clio-attachment-picker", "compose_attach_project_file"],
      ["open-question-sheet", "clio_welcome_question_sheet"],
      ["paste-clio-interview", "clio_welcome_paste_interview"],
    ].forEach(([action, labelKey]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.dataset.action = action;
      button.textContent = t(labelKey);
      button.disabled = action === "open-clio-attachment-picker" && !getActiveProject();
      actions.append(button);
    });
    body.append(actions);
  }

  item.append(speaker, body);
  messagesEl.append(item);
}

function clioTalkModelReady() {
  const cloudReady = !!(
    typeof cloudConfig !== "undefined"
    && cloudConfig?.active
    && cloudConfig?.provider
    && cloudCredentialReady()
    && cloudConfig?.model
  );
  const localReady = typeof localModelState !== "undefined"
    && (localModelState?.ready || localModelState?.loaded);
  return cloudReady || localReady;
}

function syncClioTalkModelAvailability() {
  if (!conversation.length && messagesEl?.querySelector(":scope > .clio-welcome")) {
    renderClioTalkWelcome();
  }
  syncClioTalkSendButton();
  if (typeof syncPromptPlaceholder === "function") syncPromptPlaceholder();
  if (typeof syncWelcomeFloppyState === "function") syncWelcomeFloppyState();
}

function formatClioTalkContextTokens(tokens) {
  const value = Math.max(0, Number(tokens) || 0);
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function renderClioTalkContextSpace() {
  const contextSpaceEl = document.querySelector("#assistant-context-space");
  if (!contextSpaceEl) return;
  const total = Number(lastContextBudget?.contextTokens || (
    typeof getEffectiveContextTokens === "function" ? getEffectiveContextTokens() : 0
  ));
  if (!total) {
    contextSpaceEl.textContent = t("clio_context_space_empty");
    contextSpaceEl.title = t("clio_context_space_help");
    return;
  }
  const prompt = Math.max(0, Number(window.lastContextLoadout?.promptTokens || lastContextBudget?.promptTokens || 0));
  const available = Math.max(0, total - prompt);
  const percent = Math.round((available / total) * 100);
  contextSpaceEl.textContent = t(
    "clio_context_space",
    formatClioTalkContextTokens(available),
    formatClioTalkContextTokens(total),
    percent
  );
  contextSpaceEl.title = t(
    "clio_context_space_detail",
    formatClioTalkContextTokens(available),
    formatClioTalkContextTokens(total),
    percent
  );
  window.AISystem6ControlStrip?.refreshStrip?.();
}

function clioRunHash(body = "") {
  return window.AISystem6PromptFilesRuntime?.hashPromptBody(String(body || ""))
    || `length-${String(body || "").length}`;
}

function clioTalkProjectObjectPath(file, fallback = "") {
  if (!file) return fallback;
  if (file.path) return String(file.path);
  const folderPath = file.folderId && typeof getFolderPath === "function"
    ? getFolderPath(file.folderId).join(" / ")
    : "";
  return [getActiveProject()?.name, folderPath, file.name].filter(Boolean).join(" / ") || fallback || file.name;
}

function clioTalkFileDescriptor(file, overrides = {}) {
  const body = String(overrides.body ?? file?.body ?? "");
  return {
    id: String(overrides.id || file?.id || ""),
    name: String(overrides.name || file?.name || overrides.id || ""),
    kind: String(overrides.kind || file?.artifactKind || file?.type || "file"),
    path: String(overrides.path || clioTalkProjectObjectPath(file, overrides.name || "")),
    source: String(overrides.source || ""),
    version: String(overrides.version || file?.skillManifest?.version || ""),
    reason: String(overrides.reason || ""),
    body,
    hash: String(overrides.hash || clioRunHash(body)),
  };
}

function getClioTalkPromptFileDescriptors() {
  const runtime = window.AISystem6PromptFilesRuntime;
  if (!runtime) return [];
  return [
    ["cliotalk.main", "prompt"],
    ["system.model-boundaries", "policy"],
  ].map(([id, kind]) => {
    const resolved = runtime.resolvePromptFile(id, kind === "prompt" ? activeProjectId : null, currentLanguage);
    const system = (window.AISystem6PromptFiles || []).find((item) => item.id === id);
    return resolved?.status === "ready"
      ? clioTalkFileDescriptor(null, {
          id,
          name: system?.name || id,
          kind,
          path: resolved.path,
          source: resolved.source,
          body: resolved.body,
          hash: resolved.hash,
        })
      : null;
  }).filter(Boolean);
}

function getClioTalkPendingSkillDescriptors(userText = "", options = {}) {
  const temporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  const manual = [...(window.nextTaskSkillIds || [])]
    .map((id) => getProjectFiles().find((file) => file.id === id && file.artifactKind === "ai-skill"))
    .map((file) => ({ file, parsed: file && typeof parseProjectSkillFile === "function" ? parseProjectSkillFile(file) : null, reason: "user order" }))
    .filter((entry) => entry.file && entry.parsed?.valid);
  const automatic = !temporaryChat && typeof getAutoCallableProjectSkills === "function"
    ? getAutoCallableProjectSkills(String(userText || ""))
        .filter((entry) => !manual.some((selected) => selected.file.id === entry.file.id))
        .map((entry) => ({ ...entry, reason: "project opt-in auto call" }))
    : [];
  return [...manual, ...automatic].map(({ file, parsed, reason }) => clioTalkFileDescriptor(file, {
    kind: "skill",
    name: parsed?.manifest?.name || file.name,
    version: parsed?.manifest?.version || "",
    reason,
  }));
}

function getClioTalkPendingHarnessDescriptor() {
  const id = String(window.nextTaskHarnessFileId || "");
  if (!id) return null;
  const file = getProjectFiles().find((item) => item.id === id && item.artifactKind === "task-config");
  return file ? clioTalkFileDescriptor(file, { kind: "harness" }) : null;
}

function getClioTalkPendingInputDescriptors(options = {}) {
  const temporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  const inputs = [];
  const activeChat = typeof getActiveConversationFile === "function" ? getActiveConversationFile() : null;
  if (!temporaryChat && activeChat) inputs.push(clioTalkFileDescriptor(activeChat, {
    kind: "chat",
    body: typeof formatChatFileMarkdown === "function" ? formatChatFileMarkdown(activeChat) : formatChatFile(activeChat),
  }));
  [...(window.nextTaskInputFileIds || [])].forEach((id) => {
    const file = getProjectFiles().find((item) => item.id === id);
    if (file) inputs.push(clioTalkFileDescriptor(file, {
      kind: "input",
      body: file.type === "chat" && typeof formatChatFileMarkdown === "function"
        ? formatChatFileMarkdown(file)
        : String(file.body || ""),
    }));
  });
  [...(attachedClipIds || [])].forEach((id) => {
    const scrap = scraps.find((item) => item.id === id && isInActiveProject(item));
    if (scrap) inputs.push(clioTalkFileDescriptor(scrap, {
      kind: "scrap",
      name: scrap.title,
      path: `${getActiveProject()?.name || ""} / Scrapbook / ${scrap.title}`,
      body: scrap.body,
    }));
  });
  if (!temporaryChat && typeof hasMountedFileDiskContext === "function" && hasMountedFileDiskContext()) {
    mountedTextDisk.files.forEach((name) => inputs.push(clioTalkFileDescriptor(null, {
      id: `file-floppy:${name}`,
      kind: "file-floppy",
      name,
      path: `${t("file_floppy")} / ${name}`,
      body: mountedTextDisk.fileBodies?.[name] || "",
    })));
  }
  if (!temporaryChat && typeof getProjectMemoryFiles === "function") {
    getProjectMemoryFiles({ activeOnly: true }).forEach((file) => inputs.push(clioTalkFileDescriptor(file, { kind: "project-memory" })));
  }
  [...(window.nextTaskRetrospectiveIds || [])].forEach((id) => {
    const file = getProjectFiles().find((item) => item.id === id && item.artifactKind === "retrospective");
    if (file) inputs.push(clioTalkFileDescriptor(file, { kind: "retrospective" }));
  });
  const seen = new Set();
  return inputs.filter((input) => {
    const key = input.id || `${input.kind}:${input.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The info bar is this window's Finder header: it counts what is in the
// conversation and names the file it lives in. "Unkept" is the number that
// matters — it is the only place the product's central rule appears as a
// running total rather than as a per-message state.
function renderClioTalkTally() {
  const tally = document.querySelector("#clio-tally");
  if (!tally) return;
  const turns = conversation.filter((message) => ["user", "assistant"].includes(message.role)).length;
  const replies = conversation.filter((message) => message.role === "assistant");
  const unkept = replies.filter((message) => (
    !["inserted", "clipped", "saved"].includes(String(message?.replyReceipt?.state || "temporary"))
  )).length;
  const basis = new Set();
  replies.forEach((message) => {
    (message.grounding?.sources || []).forEach((source) => basis.add(source.key || source.label || ""));
  });
  basis.delete("");

  tally.replaceChildren();
  if (!turns) {
    tally.hidden = true;
    return;
  }
  tally.hidden = false;
  const counts = document.createElement("span");
  counts.textContent = t("clio_tally_counts", turns, basis.size);
  tally.append(counts);
  if (unkept > 0) {
    const unkeptButton = document.createElement("button");
    unkeptButton.type = "button";
    unkeptButton.className = "clio-tally-unkept";
    unkeptButton.textContent = t("clio_tally_unkept", unkept);
    unkeptButton.onclick = () => {
      const first = messagesEl?.querySelector('.message.assistant[data-reply-state="temporary"]');
      first?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    tally.append(unkeptButton);
  }
}

function renderClioTalkFileBar() {
  const button = document.querySelector("#clio-chat-file-link");
  const name = document.querySelector("#clio-chat-file-name");
  const path = document.querySelector("#clio-chat-file-path");
  if (!button || !name || !path) return;
  const file = typeof getActiveConversationFile === "function" ? getActiveConversationFile() : null;
  const project = getActiveProject();
  const keepButton = document.querySelector("#clio-keep-temporary");
  // SideAsk and "temporary conversation" were two names for one state. The
  // info bar now carries the single fact that separates them — whether this
  // conversation is bound to a window — and both render the same way.
  keepButton?.classList.toggle("is-hidden", !(clioTalkTemporaryMode && !!project && conversation.length > 0));
  if (clioTalkTemporaryMode) {
    button.hidden = false;
    button.disabled = true;
    name.textContent = t("clio_temporary_chat");
    path.textContent = sideAskEnabled && !isMultiFinderMode()
      ? t("clio_temporary_chat_bound", sideAskSourceDisplayLabel())
      : t("clio_temporary_chat_path");
    button.title = path.textContent;
    return;
  }
  button.hidden = false;
  button.disabled = !file;
  name.textContent = file?.name || (project ? getPendingClioTalkFileName() : t("clio_chat_file_no_project"));
  path.textContent = file
    ? clioTalkProjectObjectPath(file)
    : (project ? t("clio_chat_file_path_pending", clioTalkPendingObjectPath()) : "");
  button.title = path.textContent || name.textContent;
}

function syncClioTalkSendButton() {
  const sendButton = form?.querySelector("#send");
  if (!sendButton) return;
  if (sendButton.dataset.mode === "stop") {
    sendButton.disabled = false;
    return;
  }
  const isBusy = !!activeAbortController || form.classList.contains("is-generating");
  sendButton.disabled = !clioTalkModelReady() || isBusy || !String(promptInput?.value || "").trim();
}

function setComposerSubmitMode(isBusy) {
  const button = form?.querySelector("#send");
  if (!button) return;
  const mode = isBusy ? "stop" : "send";
  button.dataset.mode = mode;
  button.type = isBusy ? "button" : "submit";
  button.classList.toggle("is-stop", isBusy);
  button.dataset.i18nAriaLabel = mode;
  button.dataset.i18nTitle = mode;
  button.setAttribute("aria-label", t(mode));
  button.title = t(mode);
  // The balloon has to follow the button. Left on the Send text, it described
  // sending while the control did the opposite, and the stop balloon is also
  // where a writer learns that Esc and Command-period reach the same brake.
  button.dataset.balloonHelp = isBusy ? "balloon_clio_stop" : "balloon_clio_send";
  const label = button.querySelector(".composer-submit-label");
  if (label) {
    label.dataset.i18n = mode;
    label.textContent = t(mode);
  }
  if (isBusy) button.disabled = false;
  else syncClioTalkSendButton();
}

// What this send will carry that nothing else on screen already shows.
//
// This replaces the "Run details" disclosure that used to sit in the composer:
// four sections of prompt-file / Skill / harness / input assembly plus a memory
// inspector link. That panel answered a debugging question ("what did the app
// assemble?") and it answered it permanently, in the middle of the writing
// surface. The writer's question is narrower — "what goes with this message?"
// — and it is one line. The assembly detail still exists, in the Context Panel,
// reachable from the model readout in the info bar.
//
// Two kinds of thing are deliberately left out. Attached files and clips are
// already removable chips above the text area, so repeating them here as dead
// text listed the same attachment twice, once operable and once not. Standing
// context — the Chat file itself, project memory, a mounted File Floppy — is
// carried by every message in the conversation, so naming it per message turned
// a "what did I add?" line into permanent furniture that was never empty again.
// When there is nothing extra, this line says nothing.
const CLIO_ENTRY_AMBIENT_INPUT_KINDS = new Set(["chat", "project-memory", "file-floppy"]);
const CLIO_ENTRY_SHELF_INPUT_KINDS = new Set(["input", "scrap"]);

function renderClioTalkRunAssembly() {
  syncClioTalkSendButton();
  const loadout = document.querySelector("#clio-entry-loadout");
  if (!loadout) return;
  const inputs = getClioTalkPendingInputDescriptors({ temporaryChat: clioTalkTemporaryMode })
    .filter((entry) => !CLIO_ENTRY_AMBIENT_INPUT_KINDS.has(entry.kind) && !CLIO_ENTRY_SHELF_INPUT_KINDS.has(entry.kind));
  const skills = getClioTalkPendingSkillDescriptors(promptInput?.value || "", { temporaryChat: clioTalkTemporaryMode });
  const webSearchEntry = clioWebSearchToggleActive() ? [{ name: t("clio_entry_web_search") }] : [];
  const carried = [...webSearchEntry, ...inputs, ...skills].map((entry) => entry.label || entry.name).filter(Boolean);
  loadout.textContent = carried.length ? t("clio_entry_carrying", carried.join(" · ")) : "";
  loadout.title = carried.length ? `${loadout.textContent}\n${t("clio_entry_carrying_help")}` : "";
  loadout.setAttribute("aria-label", carried.length ? `${loadout.textContent} — ${t("clio_entry_carrying_help")}` : "");
  loadout.disabled = !carried.length;
  renderClioTalkFileBar();
  renderClioTalkTally();
}

function recordContextLoadout(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const entries = messages.map((message, index) => {
    const content = String(message?.content || "");
    const kind = /Project Memory|项目长期记忆/.test(content) ? "project-memory"
      : /retrospective files|复盘文件/.test(content) ? "retrospective"
      : /^# Conversation Memory/.test(content) ? "compressed-memory"
        : /small, curated local context|小而精选的本地上下文|主要依据/.test(content) ? "retrieved-context"
          : message?.role === "user" ? "current-conversation"
            : index < 2 ? "system" : "conversation";
    return { id: `${kind}:${index}`, kind, label: kind, estimatedTokens: estimateTokenCount(content) + 6, content };
  });
  const skipped = (lastRetrievedContextItems || [])
    .filter((item) => item.included === false || item.excluded)
    .map((item) => ({ id: item.id || getContextSourceKey(item), kind: "skipped", label: contextSourceLabel(item), estimatedTokens: 0, reason: item.excluded ? "disabled by user" : "budget or ranking" }));
  window.lastContextLoadout = {
    capturedAt: new Date().toISOString(),
    entries,
    skipped,
    promptTokens: entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0),
    contextTokens: Number(lastContextBudget?.contextTokens || (typeof getEffectiveContextTokens === "function" ? getEffectiveContextTokens() : 0)),
  };
  const promptFiles = (window.lastTaskPromptFiles || []).map((file) => ({ ...file }));
  const labelPromptMessage = (message, index) => {
    const content = String(message?.content || "");
    const matchedFile = promptFiles.find((file) => file.hash === clioRunHash(content));
    if (matchedFile) return matchedFile.name;
    if (content.includes(window.AISystem6SystemIntegrity?.marker || "\u0000")) return "System Integrity · runtime";
    if (content.includes(window.AISystem6Humanizer?.marker || "\u0000")) return "Humanizer · runtime";
    if (content === clioTalkLanguageInstruction()) return "Interface Language · runtime";
    if (/\[skill:[^\]]+\]/.test(content)) return "Skill Envelope · runtime";
    if (/Project Memory|项目长期记忆/.test(content)) return "Project Memory Envelope · runtime";
    if (/retrospective files|复盘文件/.test(content)) return "Retrospective Envelope · runtime";
    return `Application message ${index + 1}`;
  };
  const messageStack = messages.map((message, index) => ({
    index,
    role: String(message?.role || ""),
    label: labelPromptMessage(message, index),
    body: String(message?.content || ""),
    hash: clioRunHash(message?.content || ""),
  }));
  window.lastTaskRunManifest = {
    schemaVersion: 1,
    scope: "application-supplied",
    scopeNote: t("clio_run_runtime_note"),
    capturedAt: new Date().toISOString(),
    taskKind: String(payload?.ai_system6_task_kind || "chat"),
    model: String(payload?.model || ""),
    modelRole: String(payload?.ai_system6_model_role || "default"),
    modelFallbackReason: String(payload?.ai_system6_model_fallback_reason || ""),
    parameters: {
      temperature: Number(payload?.temperature),
      maxTokens: Number(payload?.max_tokens || 0),
      stream: !!payload?.stream,
    },
    promptFiles,
    policyFiles: promptFiles.filter((file) => file.kind === "policy"),
    promptStack: messageStack.filter((message) => message.role === "system"),
    messageStack,
    skillFiles: (window.lastTaskSkillFiles || []).map((file) => ({ ...file })),
    harnessFile: window.lastTaskHarnessFile ? { ...window.lastTaskHarnessFile } : null,
    inputFiles: (window.lastTaskInputFiles || []).map((file) => ({ ...file })),
    contextManifest: window.lastContextManifest || null,
  };
  // The Context Manifest is written at retrieval time with model: null; now
  // that the task's role and model are resolved, record the ACTUAL model and
  // any fallback reason so the manifest and the Run Record always agree.
  if (window.lastContextManifest && typeof window.lastContextManifest === "object") {
    window.lastContextManifest = {
      ...window.lastContextManifest,
      requestedRole: String(payload?.ai_system6_model_role || "default"),
      actualModel: String(payload?.model || ""),
      fallbackReason: String(payload?.ai_system6_model_fallback_reason || ""),
    };
  }
  renderClioTalkContextSpace();
  renderClioTalkRunAssembly();
  scheduleRenderTasks("contextPanel");
}

function resetClioTalkRuntimeState(options = {}) {
  conversation.length = 0;
  activeChatFileId = null;
  lastClioWebSearchCall = null;
  compressedConversationMemory = { text: "", sourceMessages: 0, updatedAt: "" };
  attachedClipIds.clear();
  lastAssistantText = "";
  lastUserText = "";
  clioTalkFindQuery = "";
  clioTalkFindMatchIndex = -1;
  pendingClioTalkFileName = "";
  clioTalkUseResultUndoByMessageId.clear();
  clioTalkAutoFollow = true;
  if (messagesEl) messagesEl.replaceChildren();
  renderClioTalkWelcome();
  if (options.clearPrompt !== false && promptInput) promptInput.value = "";
  lastContextBudget = null;
  window.lastContextLoadout = null;
  window.lastTaskRunManifest = null;
  window.lastTaskPromptFiles = [];
  window.lastTaskSkillFiles = [];
  window.lastTaskHarnessFile = null;
  window.lastTaskInputFiles = [];
  window.lastTaskExplicitInputFiles = [];
  window.nextTaskInputFileIds = new Set();
  renderClioTalkContextSpace();
  lastRetrievedContextItems = [];
  if (typeof ragRankCache !== "undefined" && typeof ragRankCache.clear === "function") ragRankCache.clear();
  renderAttachedClips();
  syncClioTalkScrollAffordance();
  renderClioTalkFileBar();
  renderClioTalkRunAssembly();
  scheduleRenderTasks("contextPanel");
  updateMenuState();
}

function snapshotClioTalkRuntimeState() {
  return {
    conversation: conversation.map((item) => ({ ...item })),
    activeChatFileId,
    compressedConversationMemory: { ...compressedConversationMemory },
    attachedClipIds: [...attachedClipIds],
    nextTaskInputFileIds: [...(window.nextTaskInputFileIds || [])],
    lastAssistantText,
    lastUserText,
    prompt: promptInput?.value || "",
    scrollTop: messagesEl?.scrollTop || 0,
  };
}

function restoreClioTalkRuntimeState(state = null) {
  clioTalkTemporaryMode = false;
  resetClioTalkRuntimeState({ clearPrompt: true });
  if (!state) return false;
  conversation.push(...(Array.isArray(state.conversation) ? state.conversation : []).map((item) => ({
    ...item,
    id: String(item.id || crypto.randomUUID()),
    role: item.role === "assistant" ? "assistant" : "user",
    content: String(item.content || ""),
    deliveryState: item.deliveryState === "sending" ? "failed" : String(item.deliveryState || ""),
  })));
  activeChatFileId = String(state.activeChatFileId || "") || null;
  compressedConversationMemory = {
    text: String(state.compressedConversationMemory?.text || ""),
    sourceMessages: Number(state.compressedConversationMemory?.sourceMessages || 0),
    updatedAt: String(state.compressedConversationMemory?.updatedAt || ""),
  };
  (Array.isArray(state.attachedClipIds) ? state.attachedClipIds : []).forEach((id) => attachedClipIds.add(id));
  window.nextTaskInputFileIds = new Set(
    Array.isArray(state.nextTaskInputFileIds) ? state.nextTaskInputFileIds : []
  );
  lastAssistantText = String(state.lastAssistantText || "");
  lastUserText = String(state.lastUserText || "");
  if (promptInput) promptInput.value = String(state.prompt || "");
  messagesEl?.replaceChildren();
  conversation.forEach((item, index) => addMessage(item.role, item.content, {
    messageRecord: item,
    messageIndex: index,
    grounding: item.grounding || null,
  }));
  renderClioTalkWelcome();
  requestAnimationFrame(() => {
    if (messagesEl) {
      messagesEl.scrollTop = Number(state.scrollTop) || messagesEl.scrollHeight;
      handleClioTalkMessagesScroll();
    }
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
    ? t("sideask")
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

function currentQuickDraftForClioTalk() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  return window.AISystem6QuickDraft?.getContextSnapshot?.()
    || quickDraftContextSnapshot(project?.quickDraft || {});
}

function formatQuickDraftForClioTalk() {
  const record = currentQuickDraftForClioTalk();
  const setupRecord = record.setup && typeof record.setup === "object" ? record.setup : {};
  const launchDayFormat = setupRecord.scenario === "first-day-hands-on" || setupRecord.scenario === "hands-on-review";
  const lines = [];
  const pushSection = (heading, body, limit = 10000) => {
    const text = String(body || "").trim();
    if (!text) return;
    lines.push(`## ${heading}`, clipContextContent(text, limit), "");
  };

  pushSection(t(launchDayFormat ? "quick_draft_first_day_title" : "quick_draft_title"), record.title, 1200);
  pushSection(t("quick_draft_draft_label"), record.body, 12000);
  pushSection(t("quick_draft_thesis_label"), setupRecord.thesis, 2400);
  if (launchDayFormat) {
    pushSection(t("quick_draft_first_day_subject"), setupRecord.firstDaySubject || record.title, 1200);
    pushSection(t("quick_draft_hands_on"), setupRecord.handsOnNotes, 6000);
    pushSection(t("quick_draft_official_materials"), setupRecord.officialMaterials, 9000);
    pushSection(t("quick_draft_unavailable"), setupRecord.unavailableNotes, 4000);
    pushSection(t("quick_draft_audience_concerns"), setupRecord.audienceConcerns, 3000);
    pushSection(t("quick_draft_first_impression"), setupRecord.firstImpression, 2400);
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
  const strategyReport = record.strategy && typeof record.strategy === "object" ? record.strategy : {};
  pushSection(t("quick_draft_editorial_strategy"), strategyReport.editorial, 4000);
  pushSection(t("quick_draft_material_ledger"), strategyReport.materialLedger, 5000);
  pushSection(t("quick_draft_adoption_table"), strategyReport.adoptionTable, 5000);
  const setup = [
    setupRecord.scenario ? `${t("quick_draft_format")}: ${setupRecord.scenario}` : "",
    setupRecord.targetDuration ? `${t(setupRecord.scenario === "bili-dynamic" ? "quick_draft_word_count" : "quick_draft_duration")}: ${setupRecord.targetDuration}` : "",
    setupRecord.tone ? `${t("quick_draft_tone")}: ${setupRecord.tone}` : "",
    setupRecord.mustInclude ? `${t("quick_draft_must_include")}: ${setupRecord.mustInclude}` : "",
    setupRecord.mustAvoid ? `${t("quick_draft_must_avoid")}: ${setupRecord.mustAvoid}` : "",
  ].filter(Boolean).join("\n");
  pushSection(currentLanguage === "zh" ? "出稿设置" : "Draft Settings", setup, 2000);
  pushSection(t("quick_draft_sources_label"), setupRecord.pastedSources, 9000);
  pushSection(t("quick_draft_first_day_annotated_hands_on"), record.annotations.firsthand, 6000);
  pushSection(t("quick_draft_first_day_annotated_official"), record.annotations.official, 4000);
  pushSection(t("quick_draft_first_day_annotated_uncertain"), record.annotations.uncertainty, 4000);
  pushSection(t("quick_draft_first_day_annotated_followup"), record.annotations.followup, 4000);

  if (record.materials.length) {
    const sourceMap = record.materials
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
    return { key: "sideask:quickDraft", citation: "", label: t("quick_draft_label"), kind: "sideask" };
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
  if (anchor === "timeMachine" && typeof currentTimeMachinePage !== "undefined" && currentTimeMachinePage?.reader?.text) {
    const page = currentTimeMachinePage;
    return { key: "sideask:timeMachine", citation: "", label: `${t("time_machine")} / ${page.reader.title || page.title || t("time_machine")}`, kind: "sideask" };
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
  const temporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  const usedContextItems = Array.isArray(lastRetrievedContextItems)
    ? lastRetrievedContextItems.filter((contextItem) => contextItem.included !== false && !contextItem.excluded)
    : [];
  const sideAskSource = clioTalkSideAskGroundingSource();
  const sources = uniqueClioTalkGroundingSources([
    sideAskSource,
    ...clioTalkAttachedClipSources(),
    ...usedContextItems.map(formatClioTalkGroundingSource),
    ...[...(window.lastTaskRetrospectiveIds || [])].map((id) => {
      const file = getProjectFiles().find((item) => item.id === id && item.artifactKind === "retrospective");
      return file ? { key: `retrospective:${file.id}`, label: file.name, kind: "retrospective" } : null;
    }).filter(Boolean),
    ...[...(window.lastTaskSkillIds || [])].map((id) => {
      const file = getProjectFiles().find((item) => item.id === id && item.artifactKind === "ai-skill");
      return file ? { key: `skill:${file.id}`, label: `${file.skillManifest?.name || file.name} v${file.skillManifest?.version || ""}`, kind: "skill" } : null;
    }).filter(Boolean),
    ...(window.lastTaskExplicitInputFiles || []).map((file) => ({
      key: `input:${file.id || file.name}`,
      label: file.name,
      kind: file.kind || "input",
    })),
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
  // A capped tool loop is a kind of missing, so it is stated in the slot that
  // already exists for missing things rather than in furniture of its own.
  // Silence here would be the System Integrity rule inverted: the answer is
  // shorter than the question deserved and nothing on screen says so.
  if (window.lastWritingAgentGenerated?.toolLoopTruncated === true) {
    missing.push(t("clio_grounding_reading_capped"));
  }
  return {
    sources: sources.slice(0, 4),
    sourceCount: sources.length,
    missing,
    contextPanelAvailable: !!(sources.length || lastRetrievedContextItems?.length || lastContextBudget),
    usedContext: !!sources.length,
    projectMemoryIds: !temporaryChat && typeof getProjectMemoryFiles === "function"
      ? getProjectMemoryFiles({ activeOnly: true }).map((file) => file.id)
      : [],
  };
}

// Sources are the spine of this product, so they render as objects — one chip
// per file, each openable — rather than as a run-on line of grey small print.
// When nothing was used, that is stated outright: silence would let the reader
// assume grounding that never happened.
function appendMessageGrounding(item, grounding) {
  item.querySelector(".message-grounding-strip")?.remove();
  if (!grounding) return;
  const body = item.querySelector(".message-content");
  if (!body) return;

  const strip = document.createElement("div");
  strip.className = "message-grounding-strip";
  strip.dataset.clioGrounding = "true";

  const label = document.createElement("span");
  label.className = "message-grounding-label";
  label.textContent = t("clio_grounding_label");
  strip.append(label);

  const sources = Array.isArray(grounding.sources) ? grounding.sources : [];
  if (sources.length) {
    sources.forEach((source, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "clio-basis-chip";
      chip.dataset.groundingKind = String(source.kind || "");
      const mark = document.createElement("span");
      mark.className = "clio-basis-chip-mark";
      mark.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = `${index + 1} · ${source.label || ""}`;
      chip.append(mark, text);
      chip.onclick = () => revealClioTalkGroundingSource(source);
      strip.append(chip);
    });
    if (grounding.sourceCount > sources.length) {
      const more = document.createElement("span");
      more.className = "message-grounding-more";
      more.textContent = t("clio_grounding_more_sources", grounding.sourceCount - sources.length);
      strip.append(more);
    }
  } else {
    const none = document.createElement("span");
    none.className = "message-grounding-none";
    none.textContent = t("clio_grounding_none_stated");
    strip.append(none);
  }

  if (grounding.missing?.length) {
    const missing = document.createElement("span");
    missing.className = "message-grounding-more";
    missing.textContent = `${t("clio_grounding_missing")}: ${grounding.missing.join(" · ")}`;
    strip.append(missing);
  }

  body.append(strip);
}

// A basis chip has to land on the thing it names. Project files reveal in the
// Finder; anything else falls back to the context panel, which is where the
// retrieval detail actually lives.
function revealClioTalkGroundingSource(source) {
  const contextItem = lastRetrievedContextItems?.find((item) => (
    typeof getContextSourceKey === "function" && getContextSourceKey(item) === source?.key
  ));
  if (contextItem && typeof openCitationContextItem === "function") {
    openCitationContextItem(contextItem);
    return;
  }

  const registrySource = typeof buildProjectSourceRegistry === "function"
    ? buildProjectSourceRegistry().find((item) => item.key === source?.key)
    : null;
  if (registrySource && typeof openCitationContextItem === "function") {
    const projectId = activeProjectId;
    const registryContextItem = registrySource.kind === "file"
      ? { ...registrySource.item, kind: "file", projectId }
      : registrySource.key.startsWith("scrap:")
        ? { ...registrySource.item, kind: "scrap", projectId }
        : registrySource.key.startsWith("reference:")
          ? { ...registrySource.item, kind: "reference", fromProjectReference: true, referenceId: registrySource.item?.id, projectId }
          : { ...registrySource.item, kind: "chunk", projectId };
    openCitationContextItem(registryContextItem);
    return;
  }

  const key = String(source?.key || "");
  const id = key.includes(":") ? key.slice(key.indexOf(":") + 1) : "";
  const file = id && typeof getProjectFiles === "function"
    ? getProjectFiles().find((item) => item.id === id)
    : null;
  if (file && typeof revealChatFileInFinder === "function") {
    revealChatFileInFinder(file.id);
    return;
  }
  if (typeof openWindow === "function") openWindow("contextPanel");
}

function decorateClioTalkInlineCitations(item, grounding) {
  const body = item.querySelector(".message-content");
  const sources = Array.isArray(grounding?.sources) ? grounding.sources : [];
  if (!body || !sources.length) return;

  const sourceById = new Map();
  sources.forEach((source, index) => {
    const sourceId = String(source?.citation || "").match(/\[(S\d+)(?::\d+)?\]/)?.[1];
    if (sourceId && !sourceById.has(sourceId)) sourceById.set(sourceId, { source, index });
  });
  if (!sourceById.size) return;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest("code, pre, a, button, .message-grounding-strip")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const text = node.nodeValue || "";
    const pattern = /\[(S\d+)(?::\d+)?\]/g;
    let match;
    let cursor = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    while ((match = pattern.exec(text))) {
      const mapped = sourceById.get(match[1]);
      if (!mapped) continue;
      changed = true;
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clio-inline-citation";
      button.dataset.citation = match[0];
      button.textContent = String(mapped.index + 1);
      button.setAttribute("aria-label", t("clio_inline_citation", mapped.index + 1, mapped.source.label || ""));
      button.onclick = () => revealClioTalkGroundingSource(mapped.source);
      fragment.append(button);
      cursor = match.index + match[0].length;
    }
    if (!changed) return;
    fragment.append(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  });
}

function clioTalkHasChartableTable(content = "") {
  const text = String(content || "");
  return /(?:^|\n)\s*\|?.+\|.+\r?\n\s*\|?\s*:?-{3,}.*\|.*\r?\n(?:\s*\|?.*\d.*\|.*(?:\n|$)){2,}/m.test(text);
}

function clioTalkReplayOptions(options = {}, taskKind = "chat") {
  const replay = {
    taskKind: String(options.taskKind || taskKind || "chat"),
  };
  if (options.skipContext === true) replay.skipContext = true;
  if (options.temporaryChat === true) replay.temporaryChat = true;
  if (options.fileNative === false) replay.fileNative = false;
  if (options.skipQuickDraftVent === true) replay.skipQuickDraftVent = true;
  if (Number.isFinite(options.temperature)) replay.temperature = Number(options.temperature);
  if (Number.isFinite(options.maxTokens)) replay.maxTokens = Number(options.maxTokens);
  if (String(options.displayText || "").trim()) replay.displayText = String(options.displayText);
  if (String(options.branchChatId || "").trim()) replay.branchChatId = String(options.branchChatId);
  if (String(options.continuationMessageId || "").trim()) {
    replay.continuationMessageId = String(options.continuationMessageId);
  }
  return replay;
}

function clioTalkContinuationMessages(options = {}) {
  const messageId = String(options.continuationMessageId || "");
  if (!messageId) return [];
  const assistantIndex = conversation.findIndex((message) => (
    message.id === messageId
    && message.role === "assistant"
    && String(message.content || "").trim()
  ));
  if (assistantIndex < 0) return [];
  const assistant = conversation[assistantIndex];
  const request = assistant.requestMessageId
    ? conversation.find((message) => message.id === assistant.requestMessageId && message.role === "user")
    : [...conversation.slice(0, assistantIndex)].reverse().find((message) => message.role === "user");
  if (!request?.content) return [];
  return [
    { role: "user", content: request.content },
    { role: "assistant", content: assistant.content },
  ];
}

function persistClioTalkConversationMutation() {
  if (clioTalkTemporaryMode) return true;
  let persisted = true;
  try {
    if (typeof persistActiveChatFile === "function") persistActiveChatFile();
  } catch (error) {
    persisted = false;
    console.warn("ClioTalk Chat file persistence failed.", error);
  }
  try {
    if (typeof scheduleWorkingSessionSave === "function") scheduleWorkingSessionSave();
  } catch (error) {
    persisted = false;
    console.warn("ClioTalk Working Session persistence failed.", error);
  }
  return persisted;
}

function updateClioTalkMessageRecord(messageId, updates = {}) {
  if (!messageId) return null;
  const record = conversation.find((candidate) => candidate.id === messageId);
  if (!record) return null;
  Object.assign(record, updates);
  persistClioTalkConversationMutation();
  return record;
}

function removeClioTalkMessageRecord(messageId) {
  if (!messageId) return false;
  const index = conversation.findIndex((candidate) => candidate.id === messageId);
  if (index < 0) return false;
  conversation.splice(index, 1);
  lastAssistantText = [...conversation].reverse().find((candidate) => candidate.role === "assistant")?.content || "";
  lastUserText = [...conversation].reverse().find((candidate) => candidate.role === "user")?.content || "";
  persistClioTalkConversationMutation();
  return true;
}

function clioTalkReplyReceiptState(record) {
  const state = String(record?.replyReceipt?.state || "temporary");
  return ["inserted", "clipped", "saved", "undone"].includes(state) ? state : "temporary";
}

function clioTalkReplyReceiptKey(state) {
  return {
    inserted: "clio_reply_inserted",
    clipped: "clio_reply_clipped",
    saved: "clio_reply_saved_document",
    undone: "clio_reply_undone",
  }[state] || "clio_reply_temporary";
}

function clioTalkReplyReceiptLabel(record) {
  const state = clioTalkReplyReceiptState(record);
  const targetName = String(record?.replyReceipt?.destinationName || "").trim();
  if (targetName && ["inserted", "clipped", "saved"].includes(state)) {
    return t("clio_reply_written_to", targetName);
  }
  return t(clioTalkReplyReceiptKey(state));
}

function appendClioTalkRunState(item, record) {
  item.querySelector(".message-run-state")?.remove();
  const isPartialReply = record?.role === "assistant" && (record?.stopped || record?.incomplete);
  const isFailedMessage = record?.role === "user" && record?.deliveryState === "failed";
  if (!isPartialReply && !isFailedMessage) return;
  const body = item.querySelector(".message-content");
  if (!body) return;
  const state = document.createElement("div");
  state.className = "message-run-state";
  const label = document.createElement("span");
  const partialStateKey = record?.finishReason === "length"
    ? "clio_reply_output_limit"
    : ["content_filter", "insufficient_system_resource"].includes(record?.finishReason)
      ? "clio_reply_provider_stopped"
      : record?.finishReason === "interrupted"
        ? "clio_reply_interrupted"
        : "clio_reply_stopped";
  label.textContent = t(isPartialReply ? partialStateKey : "clio_message_not_sent");
  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "btn mini-btn";
  actionButton.textContent = t(isPartialReply ? "clio_continue_reply" : "retry");
  actionButton.onclick = () => {
    if (isPartialReply) {
      const replayOptions = clioTalkReplayOptions(record.requestOptions || {}, record.taskKind || "chat");
      submitUserText(t("clio_continue_message"), {
        ...replayOptions,
        displayText: t("clio_continue_reply"),
        taskKind: record.taskKind || "chat",
        continuationMessageId: record.id,
      });
      return;
    }
    const retryText = String(record.content || "").trim();
    if (!retryText) return;
    removeClioTalkMessageRecord(record.id);
    item.remove();
    submitUserText(retryText, {
      ...clioTalkReplayOptions(record.requestOptions || {}, record.taskKind || "chat"),
      retryOf: record.id,
    });
  };
  state.append(label, actionButton);
  body.append(state);
}

function appendClioTalkRunReceipt(item, record) {
  item.querySelector(".message-run-receipt")?.remove();
  if (!record?.runManifest || (!record.runRecordId && !record.temporaryChat)) return;
  const body = item.querySelector(".message-content");
  if (!body) return;
  const receipt = document.createElement("div");
  receipt.className = "message-run-receipt";
  const manifest = record.runManifest;
  const summary = t(
    record.temporaryChat ? "clio_temporary_run_summary" : "clio_run_record_summary",
    manifest.promptStack?.length || 0,
    manifest.skillFiles?.length || 0,
    manifest.harnessFile?.name || t("clio_run_direct")
  );
  if (record.temporaryChat) {
    const label = document.createElement("span");
    label.textContent = summary;
    label.title = t("clio_temporary_chat_path");
    receipt.append(label);
  } else {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "clio-context-link";
    link.textContent = summary;
    link.title = t("reveal_in_project_disk");
    link.addEventListener("click", () => revealChatFileInFinder(record.runRecordId));
    receipt.append(link);
  }
  body.append(receipt);
}

// Before/After are a confirmation, not a reading surface: a short excerpt keeps
// the pinned outcome block a predictable height in both themes.
function compactClioTalkUseResultPreview(value, { fromEnd = false, limit = 180 } = {}) {
  const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return t("clio_preview_empty");
  if (normalized.length <= limit) return normalized;
  return fromEnd ? `…${normalized.slice(-limit)}` : `${normalized.slice(0, limit)}…`;
}

// The dialog subject is one ellipsized line, so the reply must collapse to a
// single run of text before the browser truncates it.
function clioTalkUseResultSubjectLine(content) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (!normalized) return t("clio_preview_empty");
  return normalized.length <= 200 ? normalized : `${normalized.slice(0, 200)}…`;
}

function clioTalkUseResultSelection(input) {
  if (!input || !("selectionStart" in input) || !("selectionEnd" in input)) {
    return { start: 0, end: 0, text: "" };
  }
  const start = Number(input.selectionStart || 0);
  const end = Number(input.selectionEnd || 0);
  return {
    start,
    end,
    text: start === end ? "" : String(input.value || "").slice(start, end),
  };
}

function appendClioTalkUseResultText(current, addition) {
  const before = String(current || "");
  const next = String(addition || "").trim();
  if (!before.trim()) return next;
  if (!next) return before;
  const separator = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  return `${before}${separator}${next}`;
}

function replaceClioTalkUseResultSelection(current, addition, selection) {
  const before = String(current || "");
  const start = Math.max(0, Math.min(before.length, Number(selection?.start || 0)));
  const end = Math.max(start, Math.min(before.length, Number(selection?.end || start)));
  return `${before.slice(0, start)}${String(addition || "").trim()}${before.slice(end)}`;
}

function clioTalkUseResultNextText(target, content, mode, patch = null) {
  // A proposal writes the sentence it named, not the reply that explained it.
  // Everything downstream is unchanged: the caller still re-reads the target
  // and refuses on a hash mismatch, so a manuscript edited since the proposal
  // is never overwritten from a stale offer.
  if (mode === "replace-proposal" && patch) {
    return String(target.before || "").replace(patch.target, patch.replacement);
  }
  return mode === "replace-selection"
    ? replaceClioTalkUseResultSelection(target.before, content, target.selection)
    : appendClioTalkUseResultText(target.before, content);
}

function clioTalkPatchFitsTarget(target, patch) {
  return !!patch && !!target && target.kind !== "create" && String(target.before || "").includes(patch.target);
}

function clioTalkUseResultTextTarget({
  id,
  labelKey,
  helpKey,
  input,
  before,
  available = true,
  unavailableReason = "",
  write,
} = {}) {
  return {
    id,
    kind: "text",
    label: t(labelKey),
    help: t(helpKey),
    input,
    before: String(before || ""),
    selection: clioTalkUseResultSelection(input),
    available,
    unavailableReason,
    write,
  };
}

function getClioTalkUseResultTargets() {
  const project = getActiveProject();
  const block = typeof selectedOutlineDraftBlock === "function" ? selectedOutlineDraftBlock(project) : null;
  const selectedDraft = Number.isInteger(selectedDraftIndex) && selectedDraftIndex >= 0
    ? project?.drafts?.[selectedDraftIndex] || null
    : null;
  const draftBefore = selectedDraft?.body || block?.body || "";
  const teachTextIsRouteManuscript = typeof isTeachTextManuscriptRole === "function" && isTeachTextManuscriptRole();
  const teachTextLocked = teachTextIsRouteManuscript
    && typeof manuscriptPhase === "function"
    && manuscriptPhase() === "drafting";
  const hasTeachTextTarget = !!(activeTextFileId || teachTextIsRouteManuscript || String(teachTextBodyInput?.value || "").trim());

  return [
    clioTalkUseResultTextTarget({
      id: "question-sheet",
      labelKey: "clio_target_question_sheet",
      helpKey: "clio_target_question_sheet_help",
      input: questionSheetBodyInput,
      before: project?.questionSheet || questionSheetBodyInput?.value || "",
      write: (value) => {
        questionSheetBodyInput.value = value;
        if (typeof noteWritingSurfaceEdit === "function") noteWritingSurfaceEdit("questionSheet");
        savePipelineData();
        refreshTeachTextSurfacePreview("questionSheet");
        return true;
      },
    }),
    clioTalkUseResultTextTarget({
      id: "outline",
      labelKey: "clio_target_outline",
      helpKey: "clio_target_outline_help",
      input: outlineContentEl,
      before: project?.outline || outlineContentEl?.value || "",
      write: (value) => {
        outlineContentEl.value = value;
        if (typeof noteWritingSurfaceEdit === "function") noteWritingSurfaceEdit("outline");
        savePipelineData();
        refreshTeachTextSurfacePreview("outline");
        return true;
      },
    }),
    clioTalkUseResultTextTarget({
      id: "section-draft",
      labelKey: "clio_target_section_draft",
      helpKey: "clio_target_section_draft_help",
      input: draftBodyInput,
      before: draftBefore,
      available: !!block,
      unavailableReason: t("clio_target_section_missing"),
      write: (value) => {
        const draft = ensureDraftForOutlineBlock(block, { seedBody: true });
        if (!draft) return false;
        draftBodyInput.value = value;
        if (typeof noteWritingSurfaceEdit === "function") noteWritingSurfaceEdit("draft");
        savePipelineData();
        updateDraftVoiceStats(value);
        refreshTeachTextSurfacePreview("sectionDrafts");
        return true;
      },
    }),
    clioTalkUseResultTextTarget({
      id: "teachtext",
      labelKey: "clio_target_teachtext",
      helpKey: "clio_target_teachtext_help",
      input: teachTextBodyInput,
      before: teachTextBodyInput?.value || "",
      available: hasTeachTextTarget && !teachTextLocked,
      unavailableReason: teachTextLocked ? t("clio_target_teachtext_locked") : t("clio_target_unavailable"),
      write: (value) => {
        teachTextBodyInput.value = value;
        const cursor = value.length;
        teachTextBodyInput.setSelectionRange(cursor, cursor);
        if (teachTextIsRouteManuscript && typeof noteWritingSurfaceEdit === "function") {
          noteWritingSurfaceEdit("manuscript");
          savePipelineData();
        }
        markTeachTextModified();
        updateTeachTextBoundaries();
        updateTeachTextTranslateButton();
        updateTeachTextBilingualExportButton();
        syncTeachTextPreview({ force: true });
        return true;
      },
    }),
    {
      id: "scrapbook",
      kind: "create",
      label: t("clio_target_scrapbook"),
      help: t("clio_target_scrapbook_help"),
      before: "",
      selection: { start: 0, end: 0, text: "" },
      available: true,
    },
    {
      id: "project-document",
      kind: "create",
      label: t("clio_target_project_document"),
      help: t("clio_target_project_document_help"),
      before: "",
      selection: { start: 0, end: 0, text: "" },
      available: true,
    },
  ];
}

// A destination row says what it is; the detail pane beside it says what the
// write will do. Only a destination the user cannot pick has to carry a second
// line, because its reason is the difference between "broken" and "not yet".
function createClioTalkUseResultChoice(name, value, label, help, { checked = false, disabled = false } = {}) {
  const row = document.createElement("label");
  row.className = "finder-operation-item";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.disabled = disabled;
  const copy = document.createElement("span");
  copy.className = "finder-operation-item-copy";
  const title = document.createElement("b");
  title.textContent = label;
  copy.append(title);
  if (help) {
    const detail = document.createElement("small");
    detail.textContent = help;
    copy.append(detail);
  }
  row.append(input, copy);
  return { row, input };
}

function clioTalkUseResultDefaultTarget(targets) {
  const stageTarget = {
    questionSheet: "question-sheet",
    outline: "outline",
    sectionDrafts: "section-draft",
    teachText: "teachtext",
    reviewDesk: "teachtext",
    scrapbook: "scrapbook",
  }[inferClioTalkWritingStage()];
  return targets.find((target) => target.available && target.selection?.text)
    || targets.find((target) => target.available && target.id === stageTarget)
    || targets.find((target) => target.available);
}

async function chooseClioTalkUseResult(content, messageRecord) {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }
  if (typeof ensureWritingFlowModule === "function") await ensureWritingFlowModule();

  const dialog = document.querySelector("#clio-use-result-modal");
  const targetsEl = document.querySelector("#clio-use-result-targets");
  const modesEl = document.querySelector("#clio-use-result-modes");
  const beforeEl = document.querySelector("#clio-use-result-before");
  const afterEl = document.querySelector("#clio-use-result-after");
  const recordEl = document.querySelector("#clio-use-result-record");
  const purposeEl = document.querySelector("#clio-use-result-purpose");
  const subjectEl = document.querySelector("#clio-use-result-subject");
  const confirmButton = document.querySelector("#clio-use-result-confirm");
  if (!dialog || !targetsEl || !modesEl || !beforeEl || !afterEl || !recordEl || !confirmButton) return null;

  const targets = getClioTalkUseResultTargets();
  const patch = messageRecord?.manuscriptPatch || null;
  const modeForTarget = (target) => {
    if (target?.kind === "create") return "create";
    // A proposal is the most specific offer on the table, so it leads when the
    // sentence it named is still there to replace.
    if (clioTalkPatchFitsTarget(target, patch)) return "replace-proposal";
    return target?.selection?.text ? "replace-selection" : "append";
  };
  let selectedTarget = clioTalkUseResultDefaultTarget(targets);
  let selectedMode = modeForTarget(selectedTarget);

  if (subjectEl) subjectEl.textContent = clioTalkUseResultSubjectLine(content);

  const updatePreview = () => {
    if (purposeEl) purposeEl.textContent = selectedTarget?.help || "";
    if (!selectedTarget) {
      confirmButton.disabled = true;
      return;
    }
    const next = selectedTarget.kind === "create"
      ? String(content || "").trim()
      : clioTalkUseResultNextText(selectedTarget, content, selectedMode, patch);
    // A proposal previews the one sentence it swaps, not the whole document
    // around it: the writer is deciding on that sentence.
    beforeEl.textContent = selectedTarget.kind === "create"
      ? t("clio_preview_created")
      : compactClioTalkUseResultPreview(
          selectedMode === "replace-proposal" ? patch?.target || "" :
          selectedMode === "replace-selection" ? selectedTarget.selection.text : selectedTarget.before,
          { fromEnd: selectedMode === "append" }
        );
    afterEl.textContent = compactClioTalkUseResultPreview(
      selectedMode === "replace-proposal" ? patch?.replacement || "" :
      selectedMode === "replace-selection" ? String(content || "").trim() : next,
      { fromEnd: selectedMode === "append" }
    );
    recordEl.textContent = messageRecord?.temporaryChat
      ? t("clio_temporary_delivery_record")
      : t("clio_run_record_delivery");
    confirmButton.disabled = !selectedTarget.available
      || (selectedMode === "replace-selection" && !selectedTarget.selection.text)
      || (selectedMode === "replace-proposal" && !clioTalkPatchFitsTarget(selectedTarget, patch));
  };

  const renderModes = () => {
    modesEl.replaceChildren();
    const modes = selectedTarget?.kind === "create"
      ? [{ id: "create", label: t("clio_mode_create"), help: t("clio_mode_create_help"), available: true }]
      : [
          ...(patch ? [{
            id: "replace-proposal",
            label: t("clio_mode_replace_proposal"),
            help: clioTalkPatchFitsTarget(selectedTarget, patch)
              ? patch.reason || t("clio_mode_replace_proposal_help")
              : t("clio_mode_replace_proposal_stale"),
            available: clioTalkPatchFitsTarget(selectedTarget, patch),
          }] : []),
          { id: "append", label: t("clio_mode_append"), help: t("clio_mode_append_help"), available: true },
          {
            id: "replace-selection",
            label: t("clio_mode_replace_selection"),
            help: selectedTarget?.selection?.text ? t("clio_mode_replace_selection_help") : t("clio_no_selection"),
            available: !!selectedTarget?.selection?.text,
          },
        ];
    if (!modes.some((mode) => mode.id === selectedMode && mode.available)) {
      selectedMode = modes.find((mode) => mode.available)?.id || "";
    }
    // Write method as one segmented row + a single contextual help line:
    // the previous per-mode radio rows with their own help text made the
    // dialog read as two stacked choice lists.
    const segmented = document.createElement("div");
    segmented.className = "finder-operation-modes";
    const activeMode = modes.find((mode) => mode.id === selectedMode);
    modes.forEach((mode) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn${mode.id === selectedMode ? " default" : ""}`;
      button.disabled = !mode.available;
      button.setAttribute("aria-pressed", mode.id === selectedMode ? "true" : "false");
      button.textContent = mode.label;
      button.addEventListener("click", () => {
        if (button.disabled) return;
        selectedMode = mode.id;
        renderModes();
      });
      segmented.append(button);
    });
    const help = document.createElement("p");
    help.className = "finder-operation-mode-help";
    help.textContent = activeMode?.help || "";
    modesEl.append(segmented, help);
    updatePreview();
  };

  targetsEl.replaceChildren();
  targets.forEach((target) => {
    const choice = createClioTalkUseResultChoice(
      "clio-use-result-target",
      target.id,
      target.label,
      target.available ? "" : target.unavailableReason,
      { checked: target.id === selectedTarget?.id, disabled: !target.available }
    );
    choice.input.addEventListener("change", () => {
      selectedTarget = target;
      selectedMode = modeForTarget(target);
      renderModes();
    });
    targetsEl.append(choice.row);
  });
  renderModes();

  return new Promise((resolve) => {
    if (typeof closeMenus === "function") closeMenus();
    document.body.classList.add("has-system-modal");
    modalScrim.classList.remove("is-hidden");
    dialog.onclose = () => {
      modalScrim.classList.add("is-hidden");
      document.body.classList.remove("has-system-modal");
      resolve(dialog.returnValue === "apply" && selectedTarget
        ? { target: selectedTarget, mode: selectedMode, patch }
        : null);
    };
    if (dialog.open) dialog.close("cancel");
    dialog.showModal();
  });
}

function persistClioTalkUseResultRunReceipt(messageRecord, delivery) {
  const recordFile = messageRecord?.runRecordId
    ? chatFiles.find((file) => file.id === messageRecord.runRecordId && file.artifactKind === "clio-run-record")
    : null;
  if (!recordFile?.runRecord || typeof formatClioTalkRunRecordBody !== "function") return false;
  recordFile.runRecord.resultUse = structuredClone(delivery);
  recordFile.body = formatClioTalkRunRecordBody(recordFile.runRecord);
  recordFile.hash = contentHash(recordFile.body);
  recordFile.updatedAt = new Date().toISOString();
  saveDeskState();
  renderDocuments();
  return true;
}

function refreshClioTalkMessageActions(messageId) {
  const item = messagesEl?.querySelector(`[data-message-id="${messageId}"]`);
  const record = conversation.find((candidate) => candidate.id === messageId);
  if (!item || !record) return;
  appendMessageActions(item, record.role, record.content, { messageRecord: record });
  renderClioTalkTally();
}

function finishClioTalkUseResult(messageRecord, state, destination, delivery) {
  const updated = updateClioTalkMessageRecord(messageRecord.id, {
    replyReceipt: {
      state,
      destinationType: String(destination.type || ""),
      destinationId: String(destination.id || ""),
      destinationName: String(destination.name || ""),
      updatedAt: new Date().toISOString(),
      delivery: structuredClone(delivery),
    },
  });
  if (updated) persistClioTalkUseResultRunReceipt(updated, delivery);
  refreshClioTalkMessageActions(messageRecord.id);
}

function removeClioTalkCreatedResult(undo) {
  if (undo.kind === "scrapbook") {
    const index = scraps.findIndex((scrap) => scrap.id === undo.createdId && isInActiveProject(scrap));
    if (index < 0) return false;
    scraps.splice(index, 1);
    if (selectedScrapId === undo.createdId) selectedScrapId = getProjectScraps()[0]?.id || null;
    renderScraps();
    return true;
  }
  if (undo.kind === "project-document") {
    const index = chatFiles.findIndex((file) => file.id === undo.createdId && isInActiveProject(file));
    if (index < 0) return false;
    chatFiles.splice(index, 1);
    if (selectedChatFileId === undo.createdId) selectedChatFileId = null;
    renderDocuments();
    renderProjectDisks();
    return true;
  }
  return false;
}

async function applyClioTalkUseResult(content, messageRecord, choice) {
  const target = choice?.target;
  if (!target || !messageRecord) return false;
  const now = new Date().toISOString();
  let destination = { type: target.id, id: "", name: target.label };
  let state = "inserted";
  let undo = null;
  let beforeHash = contentHash(target.before || "");
  let afterHash = "";

  if (target.kind === "text") {
    const currentTargets = getClioTalkUseResultTargets();
    const currentTarget = currentTargets.find((candidate) => candidate.id === target.id);
    if (!currentTarget?.available || contentHash(currentTarget.before) !== beforeHash) {
      setStatus(t("clio_result_write_failed"));
      return false;
    }
    const next = clioTalkUseResultNextText(target, content, choice.mode, choice.patch);
    if (!target.write(next)) return false;
    afterHash = contentHash(next);
    destination.id = target.id === "teachtext" ? String(activeTextFileId || "") : target.id;
    undo = {
      kind: "text",
      targetId: target.id,
      before: target.before,
      after: next,
      destination,
    };
  } else if (target.id === "scrapbook") {
    const scrap = createScrap(null, content, {
      reveal: false,
      source: {
        type: "clio-talk-reply",
        sourceId: messageRecord.id,
        sourceTitle: t("assistant"),
      },
    });
    if (!scrap) return false;
    state = "clipped";
    destination = { type: "scrap", id: scrap.id, name: target.label };
    afterHash = contentHash(scrap.body);
    undo = { kind: "scrapbook", createdId: scrap.id, destination };
  } else {
    const file = saveMessageAsDocument(content);
    if (!file) return false;
    state = "saved";
    destination = { type: "project-document", id: file.id, name: target.label };
    afterHash = contentHash(file.body);
    undo = { kind: "project-document", createdId: file.id, destination };
  }

  const delivery = {
    schemaVersion: 1,
    status: "applied",
    targetType: destination.type,
    targetId: destination.id,
    targetName: destination.name,
    operation: choice.mode,
    appliedAt: now,
    beforeHash,
    afterHash,
  };
  clioTalkUseResultUndoByMessageId.set(messageRecord.id, { ...undo, delivery });
  finishClioTalkUseResult(messageRecord, state, destination, delivery);
  saveDeskState();
  setStatus(t("clio_result_written", destination.name));
  return true;
}

async function undoClioTalkUseResult(messageId) {
  const undo = clioTalkUseResultUndoByMessageId.get(messageId);
  const messageRecord = conversation.find((candidate) => candidate.id === messageId);
  if (!undo || !messageRecord) return false;
  let restored = false;

  if (undo.kind === "text") {
    if (typeof ensureWritingFlowModule === "function") await ensureWritingFlowModule();
    const target = getClioTalkUseResultTargets().find((candidate) => candidate.id === undo.targetId);
    if (target?.available && contentHash(target.before) === contentHash(undo.after)) {
      restored = !!target.write(undo.before);
    }
  } else {
    restored = removeClioTalkCreatedResult(undo);
  }

  if (!restored) {
    setStatus(t("clio_result_undo_unavailable"));
    return false;
  }
  const delivery = {
    ...undo.delivery,
    status: "undone",
    undoneAt: new Date().toISOString(),
  };
  clioTalkUseResultUndoByMessageId.delete(messageId);
  finishClioTalkUseResult(messageRecord, "undone", undo.destination, delivery);
  saveDeskState();
  setStatus(t("clio_result_undone"));
  return true;
}

// Whether a reply has been written anywhere yet is the product's central rule,
// so it is a state of the message element, not a line of small print inside it:
// `data-reply-state` drives the slip's border in both themes.
function syncClioTalkReplyState(item, messageRecord) {
  if (!item?.classList.contains("assistant")) return "temporary";
  const state = clioTalkReplyReceiptState(messageRecord);
  const kept = ["inserted", "clipped", "saved"].includes(state);
  item.dataset.replyState = kept ? "kept" : "temporary";
  return state;
}

// Verbs belong to the turn being worked on, not to all of them. Twenty turns
// used to stack twenty identical rows of Use Result / Copy / Discard, and none
// of those verbs means anything on a reply from five turns ago.
//
// This is not the hover-reveal that was tried and rejected here: nothing
// depends on where the pointer is, the row is reachable by tap and by Tab, and
// the state line ("Not saved to project") stays on every reply because it is
// evidence, not a verb. It is the Finder's own grammar — an unselected object
// is just an object; select it and the verbs come back to it.
function markClioTalkCurrentTurn(item) {
  if (!item || !messagesEl?.contains(item)) return;
  messagesEl.querySelector(".message.is-current-turn")?.classList.remove("is-current-turn");
  item.classList.add("is-current-turn");
  // Older turns stay in the tab order so their verbs can still be reached
  // without a pointer.
  item.tabIndex = 0;
}

function appendMessageActions(item, role, content, options = {}) {
  item.querySelector(".message-actions")?.remove();
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const messageId = options.messageRecord?.id || item.dataset.messageId || "";

  if (role === "user") {
    // Visible, not hover-revealed: System 6 controls dim, they do not vanish,
    // and a hover-only row is unreachable by touch.
    if (!options.messageRecord?.temporaryChat) {
      const editBtn = document.createElement("button");
      editBtn.className = "btn mini-btn";
      editBtn.textContent = t("clio_edit_and_branch");
      editBtn.onclick = () => editAndResendConversationMessage({
        messageId: options.messageRecord?.id || item.dataset.messageId || "",
        messageIndex: Number.isInteger(options.messageIndex) ? options.messageIndex : -1,
        content,
      });
      actions.append(editBtn);
    }
    appendMessageTranslation(actions, item, role, content);
  } else if (role === "assistant") {
    const disposition = document.createElement("strong");
    disposition.className = "message-disposition";
    syncClioTalkReplyState(item, options.messageRecord);
    const kept = item.dataset.replyState === "kept";
    disposition.dataset.replyState = item.dataset.replyState;
    disposition.textContent = clioTalkReplyReceiptLabel(options.messageRecord);
    disposition.hidden = false;

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn mini-btn";
    copyBtn.textContent = t("copy");
    copyBtn.onclick = async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(content);
        } else {
          const copyTarget = document.createElement("textarea");
          copyTarget.className = "visually-hidden";
          copyTarget.value = content;
          document.body.append(copyTarget);
          try {
            copyTarget.select();
            if (!document.execCommand("copy")) throw new Error("copy failed");
          } finally {
            copyTarget.remove();
          }
        }
        setStatus(t("selection_copied"));
      } catch {
        setStatus(t("copy_failed"));
      }
    };
    // One flat row of real buttons, always visible. The old shape was two
    // nested disclosure menus ("Use reply" and "•••") plus a hidden
    // disposition line — three ways to hide the same four verbs.
    const useResultBtn = document.createElement("button");
    useResultBtn.className = "btn mini-btn default";
    useResultBtn.textContent = t("clio_use_reply");
    useResultBtn.disabled = !options.messageRecord;
    useResultBtn.hidden = kept;
    useResultBtn.onclick = async () => {
      const choice = await chooseClioTalkUseResult(content, options.messageRecord);
      if (choice) await applyClioTalkUseResult(content, options.messageRecord, choice);
    };

    const chartBtn = document.createElement("button");
    chartBtn.className = "btn mini-btn";
    chartBtn.textContent = t("clio_chart_make_chart");
    chartBtn.hidden = kept || !clioTalkHasChartableTable(content);
    chartBtn.onclick = async () => {
      if (typeof ensureClioChartModule === "function") await ensureClioChartModule();
      window.AISystem6ClioChart?.open?.({ markdown: content, title: t("clio_chart_label") });
    };

    const undoBtn = document.createElement("button");
    undoBtn.className = "btn mini-btn";
    undoBtn.textContent = t("clio_result_undo");
    undoBtn.hidden = !kept;
    undoBtn.disabled = kept && !clioTalkUseResultUndoByMessageId.has(messageId);
    if (undoBtn.disabled) undoBtn.title = t("clio_result_undo_unavailable");
    undoBtn.onclick = () => undoClioTalkUseResult(messageId);

    // Discarding drops the turn from the .talk file, so it asks first.
    const ignoreBtn = document.createElement("button");
    ignoreBtn.className = "btn mini-btn";
    ignoreBtn.textContent = t("clio_discard_reply");
    ignoreBtn.hidden = kept;
    ignoreBtn.onclick = async () => {
      const confirmed = await showSystemModal(t("clio_discard_reply_confirm"), "confirm", {
        confirmKey: "clio_discard_reply",
        defaultAction: "cancel",
        danger: true,
      });
      if (confirmed !== "yes") return;
      removeClioTalkMessageRecord(messageId);
      item.remove();
      renderClioTalkTally();
      updateMenuState();
    };

    const runRecordBtn = document.createElement("button");
    runRecordBtn.className = "btn mini-btn";
    runRecordBtn.textContent = t("clio_view_run_record");
    runRecordBtn.hidden = !options.messageRecord?.runRecordId;
    runRecordBtn.onclick = () => revealChatFileInFinder(options.messageRecord.runRecordId);

    actions.append(disposition, useResultBtn, chartBtn, undoBtn, copyBtn, runRecordBtn, ignoreBtn);
    appendMessageTranslation(actions, item, role, content);
  }

  // The action row belongs to the message, not to the reply text: it is a grid
  // child beside the speaker column, which is what `grid-column` and
  // `justify-self` on `.message-actions` have always described. Inside
  // `.message-content` those rules are inert, which is how the user's "•••"
  // ended up sitting inside the message bubble.
  if (actions.children.length) item.append(actions);
}

function refreshMessageTranslationButtons() {
  messagesEl?.querySelectorAll(".message").forEach((item) => {
    const content = item.dataset.rawContent;
    if (!content) return;
    const role = item.classList.contains("user") ? "user" : "assistant";
    const messageRecord = conversation.find((candidate) => candidate.id === item.dataset.messageId) || null;
    appendMessageActions(item, role, content, { messageRecord });
  });
}

function addMessage(role, content, options = {}) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  item.setAttribute("aria-label", role === "user" ? t("you") : clioTalkAssistantDisplayName());
  item.dataset.rawContent = content;
  if (options.messageRecord?.id) item.dataset.messageId = options.messageRecord.id;

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = role === "user" ? t("you") : clioTalkAssistantDisplayName();

  const body = document.createElement("div");
  body.className = "message-content";
  body.innerHTML = markdownToSystemHtml(options.messageRecord?.displayContent || content);

  item.append(speaker, body);
  messagesEl.append(item);

  if (role === "assistant") {
    lastAssistantText = content;
    appendMessageGrounding(item, options.grounding || null);
    appendClioTalkReadingTrace(item, options.messageRecord);
    decorateClioTalkInlineCitations(item, options.grounding || null);
  }
  appendClioTalkRunState(item, options.messageRecord);
  appendClioTalkRunReceipt(item, options.messageRecord);
  appendMessageActions(item, role, content, options);
  markClioTalkCurrentTurn(item);
  renderClioTalkTally();
  updateMenuState();
  scrollMessagesToLatest();
}

function saveMessageAsDocument(content) {
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return null;
  }
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
  return file;
}

function isCloudModelActive() {
  return typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady();
}

function modelRouteText(localKey, cloudKey) {
  return isCloudModelActive() ? t(cloudKey) : t(localKey);
}

function createPendingMessage() {
  const item = document.createElement("article");
  item.className = "message assistant pending";
  item.setAttribute("aria-label", clioTalkAssistantDisplayName());
  item.setAttribute("aria-live", "polite");

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = clioTalkAssistantDisplayName();

  const body = document.createElement("div");
  body.className = "message-content system-wait";
  body.innerHTML = `
    <div class="wait-title">${escapeHtml(modelRouteText("working_locally", "working_cloud"))}</div>
    <div class="progress-track" role="progressbar" aria-label="${escapeHtml(t("clio_progress"))}" aria-valuetext="${escapeHtml(modelRouteText("wait_opening", "wait_opening_cloud"))}"><div class="progress-bar"></div></div>
    <div class="wait-copy">${escapeHtml(modelRouteText("wait_opening", "wait_opening_cloud"))}</div>
    <div class="wait-steps" aria-label="${escapeHtml(t("clio_working_steps"))}">
      <div class="wait-step is-active" data-step="0">${escapeHtml(t("checking_context"))}</div>
      <div class="wait-step" data-step="1">${escapeHtml(modelRouteText("consulting_model", "consulting_cloud_model"))}</div>
      <div class="wait-step" data-step="2">${escapeHtml(t("typesetting_reply"))}</div>
    </div>
  `;

  item.append(speaker, body);
  messagesEl.append(item);
  scrollMessagesToLatest();

  return item;
}

function updatePendingMessage(item, step, copy) {
  if (!item) return;

  const copyEl = item.querySelector(".wait-copy");
  if (!copyEl) return;
  copyEl.textContent = copy;
  item.querySelector(".progress-track")?.setAttribute("aria-valuetext", copy);
  item.querySelectorAll(".wait-step").forEach((node, index) => {
    node.classList.toggle("is-active", index === step);
    if (index === step) node.setAttribute("aria-current", "step");
    else node.removeAttribute("aria-current");
  });
}

// The writing tools name themselves in API terms. The wait line is read by the
// writer, so it names the object instead: "Reading the project dictionary", not
// "readProjectTerms". A tool with no entry here says nothing rather than
// leaking its identifier onto the desk.
const clioTalkToolActivityKeys = Object.freeze({
  searchProjectSources: "clio_tool_search_sources",
  readSourceDocMap: "clio_tool_read_docmap",
  readProjectScrap: "clio_tool_read_scrap",
  readDraftStructure: "clio_tool_read_draft",
  checkExistingCitation: "clio_tool_check_citation",
  readProjectTerms: "clio_tool_read_terms",
  readCitation: "clio_tool_read_citation",
  proposeManuscriptPatch: "clio_tool_propose_patch",
});

// One line, in the gap where the answer is about to appear, replaced by the
// next tool. This says what is happening now; what was read is kept on the
// finished turn by the reading trace below, because the basis strip only
// names sources the answer cites and stays silent about reading that cited
// nothing — which read as "the model's own words" after four tools had run.
function reportClioTalkToolActivity(item, calls = []) {
  const labels = calls
    .map((call) => clioTalkToolActivityKeys[String(call?.name || "")])
    .filter(Boolean)
    .map((key) => t(key));
  if (!labels.length || !item) return;
  // Real events replace the timed stage cycle: a rotating caption that keeps
  // moving while nothing happens is the fake progress this product forbids.
  stopWaitCycle();
  updatePendingMessage(item, 1, t("clio_tool_activity_line", [...new Set(labels)]));
}

// What the finished run actually opened, in the writer's vocabulary, small
// enough to ride the saved reply. Only tools this desk can name are kept: an
// unrecognized identifier is left out rather than leaked onto the turn.
function clioTalkReadingTrace() {
  const calls = window.lastWritingAgentGenerated?.toolCalls;
  if (!Array.isArray(calls) || !calls.length) return [];
  return calls
    .filter((call) => clioTalkToolActivityKeys[String(call?.name || "")])
    .map((call) => ({
      name: String(call.name),
      round: Number(call.round) || 0,
      ok: call.result?.ok !== false,
    }));
}

// Reading is work the writer did not see and cannot otherwise check, so the
// finished turn keeps a record of it. Collapsed by default: this is evidence
// on request, not a construction site in the middle of a quiet desk. It never
// says more than the run reported — no counts are inferred from an empty list.
function appendClioTalkReadingTrace(item, record) {
  item.querySelector(".message-reading-trace")?.remove();
  const reading = Array.isArray(record?.reading) ? record.reading : [];
  if (!reading.length) return;
  const body = item.querySelector(".message-content");
  if (!body) return;

  const trace = document.createElement("div");
  trace.className = "message-reading-trace";

  // A Finder disclosure row, not a native details element: the message row
  // owns its own triangle everywhere else in this window, and the verbs in a
  // turn are never allowed to hide inside a browser widget.
  const list = document.createElement("ul");
  list.className = "message-reading-list";
  list.id = `reading-trace-${crypto.randomUUID()}`;
  list.hidden = true;
  reading.forEach((entry) => {
    const key = clioTalkToolActivityKeys[String(entry?.name || "")];
    if (!key) return;
    const row = document.createElement("li");
    row.textContent = entry?.ok === false
      ? t("clio_reading_trace_failed", t(key))
      : t(key);
    list.append(row);
  });

  const summary = document.createElement("button");
  summary.type = "button";
  summary.className = "message-reading-summary";
  summary.setAttribute("aria-expanded", "false");
  summary.setAttribute("aria-controls", list.id);
  summary.textContent = t("clio_reading_trace_summary", reading.length);
  summary.onclick = () => {
    const open = list.hidden;
    list.hidden = !open;
    summary.setAttribute("aria-expanded", String(open));
  };

  trace.append(summary, list);
  body.append(trace);
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
  item.setAttribute("aria-label", role === "user" ? t("you") : clioTalkAssistantDisplayName());
  item.dataset.rawContent = content;
  if (options.messageRecord?.id) item.dataset.messageId = options.messageRecord.id;
  item.querySelector(".speaker").textContent = role === "user" ? t("you") : clioTalkAssistantDisplayName();
  const body = item.querySelector(".message-content");
  body.className = "message-content";
  body.innerHTML = markdownToSystemHtml(options.messageRecord?.displayContent || content);

  if (role === "assistant") {
    lastAssistantText = content;
    appendMessageGrounding(item, options.grounding || null);
    appendClioTalkReadingTrace(item, options.messageRecord);
    decorateClioTalkInlineCitations(item, options.grounding || null);
  }
  appendClioTalkRunState(item, options.messageRecord);
  appendClioTalkRunReceipt(item, options.messageRecord);
  appendMessageActions(item, role, content, options);
  markClioTalkCurrentTurn(item);
  scrollMessagesToLatest();
}

function updatePendingStreamContent(item, content) {
  if (!item) return;
  stopWaitCycle();
  item.className = "message assistant pending streaming";
  item.setAttribute("aria-label", clioTalkAssistantDisplayName());
  item.dataset.rawContent = content;
  item.querySelector(".speaker").textContent = clioTalkAssistantDisplayName();
  const body = item.querySelector(".message-content");
  body.className = "message-content";
  body.innerHTML = renderStreamingMarkdownHtml(content || "...");
  scrollMessagesToLatest();
}

function resolvePendingStatus(item, content, options = {}) {
  stopWaitCycle();
  if (item && options.retryText) {
    item.className = "message assistant is-error";
    item.setAttribute("role", "alert");
    item.setAttribute("aria-label", `${clioTalkAssistantDisplayName()}: ${content}`);
    item.querySelector(".speaker").textContent = clioTalkAssistantDisplayName();
    const body = item.querySelector(".message-content");
    body.className = "message-content message-error";
    body.replaceChildren();
    const copy = document.createElement("p");
    copy.textContent = content;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn mini-btn message-retry-button";
    retry.textContent = t("retry");
    retry.onclick = () => {
      removeClioTalkMessageRecord(options.userRecordId);
      const failedUserItem = item.previousElementSibling;
      if (failedUserItem?.classList.contains("user")) {
        failedUserItem.remove();
      }
      item.remove();
      submitUserText(options.retryText, {
        ...(options.retryOptions || {}),
        retryOf: options.userRecordId || options.retryOptions?.retryOf || "",
      });
    };
    body.append(copy, retry);
    scrollMessagesToLatest();
    setStatus(t("clio_message_not_sent"));
  } else {
    item?.remove();
    setStatus(content);
  }
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

function clioTalkPromptMessages(options = {}) {
  const runtime = window.AISystem6PromptFilesRuntime;
  const resolved = runtime?.resolvePromptFile("cliotalk.main", activeProjectId, currentLanguage);
  if (!resolved || resolved.status !== "ready") {
    throw new Error(currentLanguage === "zh" ? "ClioTalk 主提示词文件不可用。" : "The ClioTalk main prompt file is unavailable.");
  }
  const boundary = runtime.resolvePromptFile("system.model-boundaries", null, currentLanguage);
  if (options.temporaryChat !== true) {
    runtime.recordPromptRun?.(activeProjectId, "cliotalk.main", resolved);
    if (boundary.status === "ready") runtime.recordPromptRun?.(activeProjectId, "system.model-boundaries", boundary);
  }
  window.lastTaskPromptFiles = getClioTalkPromptFileDescriptors();
  return [{ role: "system", content: resolved.body }];
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
    // The writer's own ban list travels with the word that owns it. It is the
    // one part of this context the model must obey rather than consider.
    const avoid = Array.isArray(term.avoid) && term.avoid.length
      ? `\n    ${currentLanguage === "zh" ? "不要用" : "never use"}: ${term.avoid.slice(0, 12).join(", ")}`
      : "";
    return `[T${index + 1}] ${term.term}${kind}: ${clipContextContent(definition, 240)}${avoid}`;
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
      timeMachine: "timeMachine",
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
  if (anchor === "timeMachine" && typeof currentTimeMachinePage !== "undefined" && currentTimeMachinePage?.reader?.text) {
    const page = currentTimeMachinePage;
    return section(`${t("time_machine")} / ${page.reader.title || page.title || t("time_machine")}`, page.reader.text, 12000);
  }
  if (anchor === "imagePromptStudio") {
    const studio = document.querySelector('[data-window="imagePromptStudio"]');
    if (!studio) return "";
    const idea = studio.querySelector("#ips-idea")?.value?.trim() || "";
    const title = studio.querySelector("#ips-title")?.value?.trim() || "";
    const gptImage = studio.querySelector("#ips-gpt-out")?.value?.trim() || "";
    const universal = studio.querySelector("#ips-universal-out")?.value?.trim() || "";
    const content = [
      idea ? `Idea / brief:\n${idea}` : "",
      title ? `Title / overlay text:\n${title}` : "",
      gptImage ? `GPT-Image prompt:\n${gptImage}` : "",
      universal ? `Universal prompt:\n${universal}` : "",
    ].filter(Boolean).join("\n\n");
    return section(t("image_prompt_studio_label"), content, 12000);
  }
  return "";
}

function buildPayload(userText, options = {}) {
  compactConversationMemoryIfNeeded(options);
  const contextSections = [];
  const skipContext = options.skipContext === true;
  const temporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  const isSideAskChat = !skipContext && sideAskEnabled && !isMultiFinderMode();
  const isScopedSideAskChat = isSideAskChat;
  const taskKind = options.taskKind || (isSideAskChat ? "sideask" : "chat");
  window.lastTaskHarnessFile = getClioTalkPendingHarnessDescriptor();
  const explicitInputIds = new Set(window.nextTaskInputFileIds || []);
  window.lastTaskInputFiles = getClioTalkPendingInputDescriptors({ temporaryChat });
  window.lastTaskExplicitInputFiles = window.lastTaskInputFiles.filter((file) => explicitInputIds.has(file.id));
  window.nextTaskHarnessFileId = "";
  window.nextTaskInputFileIds = new Set();
  renderAttachedClips();

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

  const projectTermsContext = (skipContext || isScopedSideAskChat || temporaryChat) ? "" : formatProjectDictionaryTermsForContext();
  if (projectTermsContext) {
    contextSections.push([
      currentLanguage === "zh"
        ? "当前项目词典术语。这些是写作者自己的说法：相关时按这些定义用词，遇到「不要用」列出的词就换成写作者的说法。"
        : "Current Project Terms from Dictionary. These are the writer's own words: use these definitions when relevant, and never use a word listed after \"never use\" — use the writer's term instead.",
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

  const hasMountedFileDisk = !temporaryChat && !skipContext && !isScopedSideAskChat && hasMountedFileDiskContext();
  const useBroadContext = !temporaryChat && !skipContext && !isScopedSideAskChat && (rememberInput.checked || attachedClipIds.size > 0);
  const useContext = useBroadContext || hasMountedFileDisk;
  const continuationMessages = clioTalkContinuationMessages(options);
  const recentMessages = !continuationMessages.length && !skipContext && (temporaryChat || rememberInput.checked || isScopedSideAskChat)
    ? conversation
        .filter((message) => !["failed", "sending"].includes(message?.deliveryState))
        .slice(-6)
    : [];
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
  const projectMemoryFiles = !temporaryChat && typeof getProjectMemoryFiles === "function"
    ? getProjectMemoryFiles({ activeOnly: true })
    : [];
  const retrospectiveFiles = [...(window.nextTaskRetrospectiveIds || [])]
    .map((id) => getProjectFiles().find((file) => file.id === id && file.artifactKind === "retrospective"))
    .filter(Boolean);
  window.lastTaskRetrospectiveIds = retrospectiveFiles.map((file) => file.id);
  window.nextTaskRetrospectiveIds = new Set();
  const retrospectiveMessage = retrospectiveFiles.length
    ? {
        role: "system",
        content: [
          currentLanguage === "zh" ? "以下是用户明确附加给本次任务的复盘文件。把它当作可见项目来源，而非自动安装的技能。" : "These are retrospective files explicitly attached to this task. Treat them as visible project sources, not automatically installed Skills.",
          ...retrospectiveFiles.map((file) => `## ${file.name} [retrospective:${file.id}]\n${String(file.body || "").trim()}`),
        ].join("\n\n"),
      }
    : null;
  const manuallySelectedSkills = [...(window.nextTaskSkillIds || [])]
    .map((id) => getProjectFiles().find((file) => file.id === id && file.artifactKind === "ai-skill"))
    .map((file) => ({ file, parsed: typeof parseProjectSkillFile === "function" ? parseProjectSkillFile(file) : { valid: false } }))
    .filter((entry) => entry.parsed.valid);
  const autoCalledSkills = !temporaryChat && typeof getAutoCallableProjectSkills === "function"
    ? getAutoCallableProjectSkills(userText)
    : [];
  const selectedSkills = [...manuallySelectedSkills, ...autoCalledSkills.filter((entry) => !manuallySelectedSkills.some((selected) => selected.file.id === entry.file.id))];
  const skillConflicts = selectedSkills.flatMap((entry, index) => selectedSkills.slice(index + 1).flatMap((other) => (
    /\b(always|must)\b/i.test(entry.file.body) && /\b(never|must not)\b/i.test(other.file.body)
      ? [`${entry.parsed.manifest.id} ↔ ${other.parsed.manifest.id}`] : []
  )));
  window.lastTaskSkillReceipt = selectedSkills.map((entry) => ({ id: entry.file.id, version: entry.parsed.manifest.version, adopted: true, reason: autoCalledSkills.some((auto) => auto.file.id === entry.file.id) ? "project opt-in auto call" : "user order" }));
  if (window.lastSkillSuggestion) window.lastTaskSkillReceipt.push({ id: window.lastSkillSuggestion.selected || "suggestion-declined", version: "", adopted: !!window.lastSkillSuggestion.selected, reason: `${window.lastSkillSuggestion.reason}; candidates: ${window.lastSkillSuggestion.candidates.join(", ")}` });
  window.lastTaskSkillIds = selectedSkills.map((entry) => entry.file.id);
  window.lastTaskSkillFiles = selectedSkills.map(({ file, parsed }) => clioTalkFileDescriptor(file, {
    kind: "skill",
    name: parsed.manifest.name,
    version: parsed.manifest.version,
    reason: autoCalledSkills.some((auto) => auto.file.id === file.id) ? "project opt-in auto call" : "user order",
  }));
  window.lastAutoSkillCall = autoCalledSkills;
  window.nextTaskSkillIds = new Set();
  const skillMessage = selectedSkills.length
    ? {
        role: "system",
        content: [
          currentLanguage === "zh" ? "以下是本次任务选择或经项目主动开启的只读自动调用的 Skill。仅执行其中的提示词和参考资料，不获得写入或脚本能力。" : "These Skills were selected for this task or auto-called through the project's explicit read-only opt-in. Use only their prompts and references; they grant no write or script capability.",
          skillConflicts.length ? `Potential conflicts: ${skillConflicts.join(", ")}. Follow user-selected order; later Skills do not override safety boundaries.` : "",
          ...selectedSkills.map(({ file, parsed }) => [`## ${parsed.manifest.name} v${parsed.manifest.version} [skill:${file.id}]`, file.body, ...(parsed.references || [])].join("\n\n")),
        ].join("\n\n"),
      }
    : null;
  const projectMemoryMessage = projectMemoryFiles.length
    ? {
        role: "system",
        content: [
          currentLanguage === "zh" ? "以下是用户明确保存的项目长期记忆。它们可在项目硬盘中编辑或停用；仅在相关时使用。" : "These are explicitly saved project memories. They are editable or disableable on the Project Hard Disk; use them only when relevant.",
          ...projectMemoryFiles.map((file) => `## ${file.name} [memory:${file.id}]\n${String(file.body || "").trim()}`),
        ].join("\n\n"),
      }
    : null;
  const explicitInputMessage = window.lastTaskExplicitInputFiles?.length
    ? {
        role: "system",
        content: [
          currentLanguage === "zh"
            ? "以下是用户明确附加给本次消息的项目文件。只在相关时使用，并把文件内容与推断分开。"
            : "These project files were explicitly attached to this message. Use them when relevant and keep file content separate from inference.",
          ...window.lastTaskExplicitInputFiles.slice(0, 6).map((file, index) => [
            `## I${index + 1} · ${file.name} [input:${file.id || index + 1}]`,
            clipContextContent(file.body || "", 12000),
          ].join("\n")),
        ].join("\n\n"),
      }
    : null;
  const memoryMessage = conversationMemorySystemMessage(options);

  const payload = {
    model: getLocalModelRequestName(),
    ...(typeof currentContextRouteConfig === "function" ? currentContextRouteConfig() : {}),
    messages: withMarkdownModelMessages([
      ...clioTalkPromptMessages({ temporaryChat }),
      { role: "system", content: clioTalkLanguageInstruction() },
      ...(projectMemoryMessage ? [projectMemoryMessage] : []),
      ...(retrospectiveMessage ? [retrospectiveMessage] : []),
      ...(skillMessage ? [skillMessage] : []),
      ...(explicitInputMessage ? [explicitInputMessage] : []),
      ...(contextMessage ? [contextMessage] : []),
      ...(memoryMessage ? [memoryMessage] : []),
      ...continuationMessages,
      ...recentMessages
        .filter((message) => (
          conversation.indexOf(message) >= Number(compressedConversationMemory?.sourceMessages || 0)
        ))
        .map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: userText },
    ]),
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
    stream: false,
    ai_system6_task_kind: taskKind,
    ai_system6_record_loadout: true,
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
  if (window.AISystem6ModelTaskRuntime?.scrubVisibleModelOutput) {
    return window.AISystem6ModelTaskRuntime.scrubVisibleModelOutput(text);
  }
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
  if (window.AISystem6ModelTaskRuntime?.localChatDefaults) {
    return window.AISystem6ModelTaskRuntime.localChatDefaults(modelName, options);
  }
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
  const usable = messages.filter((message) => (
    !["failed", "sending"].includes(message?.deliveryState)
      && String(message?.content || "").trim()
  ));
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
  const temporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  if ((!temporaryChat && !rememberInput?.checked) || options.skipContext === true) return false;
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
  const temporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  if ((!temporaryChat && !rememberInput?.checked) || options.skipContext === true) return null;
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
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const contextLength = Math.max(1024, Number(
    typeof getEffectiveContextTokens === "function"
      ? getEffectiveContextTokens()
      : contextLengthInput?.value || 8192
  ) || 8192);
  const promptTokens = (payload.messages || []).reduce(
    (sum, message) => sum + estimateTokenCount(message?.content || "") + 6,
    0
  );
  const requestedOutputTokens = defaultRequestedOutputTokens(options);
  const availableOutputTokens = Math.max(0, contextLength - promptTokens - reservedSafetyTokens);
  const budget = {
    context_length: contextLength,
    prompt_tokens: promptTokens,
    requested_output_tokens: requestedOutputTokens,
    available_output_tokens: availableOutputTokens,
    fits: availableOutputTokens >= requestedOutputTokens,
    budget_source: "browser_estimate",
  };
  endPerf?.({ source: budget.budget_source, fits: budget.fits });
  return budget;
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
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady()) {
    return "same-origin-cloud-chat";
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
  form.classList.toggle("is-generating", isBusy);
  form.setAttribute("aria-busy", String(isBusy));
  messagesEl?.setAttribute("aria-busy", String(isBusy));
  promptInput.disabled = false;
  composeToolsToggleButton.disabled = false;
  clipSelectionButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  retryButton.disabled = isBusy;
  retryButton.hidden = true;
  setComposerSubmitMode(isBusy);
  if (composerKeyHintEl) {
    const hintKey = isBusy ? "clio_composer_draft_hint" : "clio_composer_key_hint";
    composerKeyHintEl.dataset.i18n = hintKey;
    composerKeyHintEl.textContent = t(hintKey);
  }
}

function stopGeneration() {
  activeAbortController?.abort();
}

// The brake also needs a key. The 1992 HIG asks it as a review question --
// "If an operation can be interrupted, do you provide a Cancel or Stop
// button? Can Escape or Command-period be used to cancel or stop these
// operations?" (ch.10) -- and Escape's documented meaning is "let me out of
// here" (p.277), with Command-period reserved for "Terminate an operation"
// (Table 4-1) and unclaimed here. Both reach the same brake as the button, so
// what is already on screen is kept exactly as pressing Stop keeps it.
function stopRunningTaskFromKeyboard() {
  if (!activeAbortController) return false;
  stopGeneration();
  return true;
}

function estimateTokenCount(text) {
  const normalized = typeof text === "string" ? text.trim() : JSON.stringify(text || "");
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

  // Throughput only. Which model is answering is already named in the menu
  // bar's model indicator, and repeating it here spent the width that made
  // this readout ellipsize.
  assistantMeterButton.textContent = `${speedText} · ${elapsedText}`;
  assistantMeterButton.title = [`${tokenText} · ${elapsedText}`, slowText ? `Last slow operation: ${slowText}` : ""].filter(Boolean).join(" · ");
  meterSpeedEl.textContent = speedText;
  meterTokensEl.textContent = tokenText;
  meterElapsedEl.textContent = elapsedText;
  meterStopEl.textContent = slowText ? `${stopText} · ${slowText}` : stopText;
  updateModelMeterVisibility();
  updateMenuStatus();
  renderAboutMacintosh();
}


// DeepSeek prices per million tokens, in CNY. The flat promotional rate runs
// until 2026-08-17 00:00 Beijing time; after that the rate depends on the
// hour — peak is 09:00-12:00 and 14:00-18:00 Beijing time, off-peak is every
// other hour and costs half of peak.
const CLOUD_PRICING_PROMO_END_MS = Date.UTC(2026, 7, 16, 16, 0, 0);
const CLOUD_PRICING_CNY_PER_1M = {
  "deepseek-v4-flash": {
    promo: { inputCacheHit: 0.02, inputCacheMiss: 1.0, output: 2.0 },
    peak: { inputCacheHit: 0.1, inputCacheMiss: 3.0, output: 9.0 },
    offPeak: { inputCacheHit: 0.05, inputCacheMiss: 1.5, output: 4.5 },
  },
  "deepseek-v4-pro": {
    promo: { inputCacheHit: 0.025, inputCacheMiss: 3.0, output: 6.0 },
    peak: { inputCacheHit: 0.3, inputCacheMiss: 9.0, output: 27.0 },
    offPeak: { inputCacheHit: 0.15, inputCacheMiss: 4.5, output: 13.5 },
  },
};
CLOUD_PRICING_CNY_PER_1M["v4-flash"] = CLOUD_PRICING_CNY_PER_1M["deepseek-v4-flash"];
CLOUD_PRICING_CNY_PER_1M["v4-pro"] = CLOUD_PRICING_CNY_PER_1M["deepseek-v4-pro"];

function cloudPricingBand(when) {
  if (when.getTime() < CLOUD_PRICING_PROMO_END_MS) return "promo";
  const beijingHour = new Date(when.getTime() + 8 * 60 * 60 * 1000).getUTCHours();
  const peak = (beijingHour >= 9 && beijingHour < 12) || (beijingHour >= 14 && beijingHour < 18);
  return peak ? "peak" : "offPeak";
}

function cloudPricingFor(modelName, when) {
  const table = CLOUD_PRICING_CNY_PER_1M[String(modelName || "").trim()];
  return table ? table[cloudPricingBand(when || new Date())] : null;
}


var latestCloudUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0, reasoning_tokens: 0, cost_cny: 0 };
var sessionCloudUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0, reasoning_tokens: 0, cost_cny: 0 };

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
  const parts = [`${formatTokenCount(usage.total_tokens)} tok`];
  if (usage.cached_tokens) parts.push(t("usage_cache_hit", formatTokenCount(usage.cached_tokens)));
  if (usage.reasoning_tokens) parts.push(t("usage_reasoning_tokens", formatTokenCount(usage.reasoning_tokens)));
  if (usage.cost_cny) parts.push(`¥${usage.cost_cny.toFixed(4)}`);
  return parts.join(" · ");
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

function isLocalModelIndicatorReady() {
  return typeof localModelState !== "undefined"
    && !!(localModelState?.ready || localModelState?.loaded);
}

function refreshCloudUsageDisplay() {
  var indicator = document.querySelector("#cloud-model-indicator");
  if (!indicator) return;
  var labelEl = document.querySelector("#cloud-model-label");
  var iconEl = indicator.querySelector("[data-system-icon]");
  var hasCloudConfig = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.provider && cloudCredentialReady();
  var isCloudActive = !!(hasCloudConfig && cloudConfig.active);
  var localReady = isLocalModelIndicatorReady();
  var disconnectedText = typeof t === "function" ? t("model_not_connected") : "Model not connected";
  if (!hasCloudConfig) {
    var localName = localReady ? getLocalModelDisplayName() : disconnectedText;
    if (labelEl) labelEl.textContent = localName;
    if (iconEl) {
      iconEl.dataset.systemIcon = localReady ? "cloudModel" : "cloudModelOff";
      iconEl.innerHTML = systemIconSvg(iconEl.dataset.systemIcon, { sourceSize: 16 });
    }
    indicator.classList.add("is-local-model");
    indicator.title = localReady
      ? `${typeof t === "function" ? t("local_model") : "Local Model"}: ${localName}`
      : disconnectedText;
    indicator.setAttribute("aria-label", indicator.title);
    indicator.classList.remove("is-hidden");
    if (typeof renderCloudModelPopover === "function") renderCloudModelPopover();
    syncClioTalkModelAvailability();
    return;
  }
  var modelName = isCloudActive
    ? (cloudConfig.model || "cloud")
    : localReady ? getLocalModelDisplayName() : disconnectedText;
  var displayName = isCloudActive ? cloudModelShortName(modelName) : modelName;
  if (labelEl) labelEl.textContent = displayName;
  if (iconEl) {
    iconEl.dataset.systemIcon = isCloudActive || localReady ? "cloudModel" : "cloudModelOff";
    iconEl.innerHTML = systemIconSvg(iconEl.dataset.systemIcon, { sourceSize: 16 });
  }
  if (typeof syncPromptPlaceholder === "function") syncPromptPlaceholder();
  indicator.classList.toggle("is-local-model", !isCloudActive);
  indicator.title = isCloudActive
    ? `${typeof t === "function" ? t("cloud_model") : "Cloud Model"}: ${displayName}`
    : localReady
      ? `${typeof t === "function" ? t("local_model") : "Local Model"}: ${displayName}`
      : disconnectedText;
  indicator.setAttribute("aria-label", indicator.title);
  indicator.classList.remove("is-hidden");
  if (typeof renderCloudModelPopover === "function") {
    renderCloudModelPopover();
  }
  if (typeof renderCloudStatePanel === "function") {
    renderCloudStatePanel();
  }
  syncClioTalkModelAvailability();
}

function formatTokenCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function estimateCloudCostCny(promptTokens, completionTokens, usage = {}, modelName = "") {
  // Price the model that actually ran, not the one the panel shows: on the
  // automatic setting the server picks the tier per task.
  var pricing = cloudPricingFor(modelName || cloudConfig.model);
  if (!pricing) return 0;
  var cacheHitTokens = Number(usage.prompt_cache_hit_tokens || 0);
  var cacheMissTokens = Number(usage.prompt_cache_miss_tokens || 0);
  var countedInputTokens = cacheHitTokens + cacheMissTokens;
  if (!countedInputTokens) cacheMissTokens = Number(promptTokens || 0);
  return (cacheHitTokens / 1e6) * pricing.inputCacheHit
    + (cacheMissTokens / 1e6) * pricing.inputCacheMiss
    + (Number(completionTokens || 0) / 1e6) * pricing.output;
}

function trackCloudTokenUsage(promptTokens, completionTokens, totalTokens, usage = {}, modelName = "") {
  if (typeof cloudConfig === "undefined" || !cloudConfig || !cloudConfig.active) return;

  const cachedTokens = Number(usage?.input_tokens_details?.cached_tokens || usage?.prompt_tokens_details?.cached_tokens || 0);
  const reasoningTokens = Number(usage?.output_tokens_details?.reasoning_tokens || usage?.completion_tokens_details?.reasoning_tokens || 0);
  latestCloudUsage.prompt_tokens = promptTokens;
  latestCloudUsage.completion_tokens = completionTokens;
  latestCloudUsage.total_tokens = totalTokens;
  latestCloudUsage.cached_tokens = cachedTokens;
  latestCloudUsage.reasoning_tokens = reasoningTokens;
  latestCloudUsage.cost_cny = estimateCloudCostCny(promptTokens, completionTokens, usage, modelName);

  sessionCloudUsage.prompt_tokens += promptTokens;
  sessionCloudUsage.completion_tokens += completionTokens;
  sessionCloudUsage.total_tokens += totalTokens;
  sessionCloudUsage.cached_tokens += cachedTokens;
  sessionCloudUsage.reasoning_tokens += reasoningTokens;
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
  storedUsage.cached_tokens = (storedUsage.cached_tokens || 0) + cachedTokens;
  storedUsage.reasoning_tokens = (storedUsage.reasoning_tokens || 0) + reasoningTokens;
  storedUsage.cost_cny = (storedUsage.cost_cny || 0) + latestCloudUsage.cost_cny;
  try { localStorage.setItem(key, JSON.stringify(storedUsage)); } catch (ignore) {}
  refreshCloudUsageDisplay();
}

function modelMetricsFromResponse(data, content, elapsedMs) {
  const serverMetrics = data?.ai_system6_metrics || {};
  const usage = data?.usage || serverMetrics.usage || {};
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && usage.prompt_tokens) {
    trackCloudTokenUsage(
      usage.prompt_tokens,
      usage.completion_tokens || 0,
      usage.total_tokens || 0,
      usage,
      String(serverMetrics.model || data?.model || "")
    );
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
  let finishReason = "";
  let responseId = "";
  let responseApi = "";
  let servedModel = "";
  let latestContent = "";
  let toolCalls = [];
  try {
    const content = await readModelTextStream(response, {
      signal,
      throttleMs: 60,
      onToolCalls: (calls) => {
        toolCalls = Array.isArray(calls) ? calls : [];
      },
      onSnapshot: (snapshot) => {
        latestContent = String(snapshot || "");
        onToken?.(latestContent);
      },
      onUsage: (usage) => {
        streamUsage = usage;
      },
      onFinishReason: (reason) => {
        finishReason = String(reason || "");
      },
      onResponseId: (id) => {
        responseId = String(id || "");
      },
      onResponseApi: (api) => {
        responseApi = String(api || "");
      },
      onModel: (name) => {
        servedModel = String(name || "");
      },
    });
    return { content, usage: streamUsage, finishReason, responseId, responseApi, servedModel, toolCalls };
  } catch (error) {
    if (latestContent.trim()) {
      error.partialContent = latestContent.trim();
      error.finishReason = "interrupted";
    }
    throw error;
  }
}

async function readJsonModelResult(response, startedAt, endPerf, streamFallback = false) {
  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const content = typeof message?.content === "string" ? message.content : "";
  if (!content && !toolCalls.length) {
    throw new Error("LM Studio response did not include assistant content or tool calls.");
  }
  const trimmed = scrubVisibleModelOutput(content);
  const metrics = modelMetricsFromResponse(data, trimmed, performance.now() - startedAt);
  updateModelMeter(metrics);
  endPerf?.({ streamed: false, streamFallback, tokens: metrics.tokens });
  return {
    text: trimmed,
    metrics,
    budget: lastContextBudget,
    message,
    toolCalls,
    responseId: String(data?.ai_system6_lmstudio_response_id || ""),
    responseApi: String(data?.ai_system6_lmstudio_api || ""),
  };
}

function withBrowserLocalSafetyMessages(messages = [], taskKind = "") {
  const normalized = Array.isArray(messages) ? messages : [];
  const integrity = window.AISystem6SystemIntegrity;
  const humanizer = window.AISystem6Humanizer;
  const taskContract = window.AISystem6ModelTaskRuntime?.taskContractRegistry?.require(taskKind);
  const additions = [];
  if (integrity && !integrity.hasIntegrityInstruction(normalized)) {
    additions.push({ role: "system", content: integrity.instruction() });
  }
  if (taskContract?.humanizer !== "off"
      && humanizer && !humanizer.hasHumanizerInstruction(normalized)) {
    additions.push({ role: "system", content: humanizer.instruction() });
  }
  return [...additions, ...normalized];
}

async function maybeRepairBrowserLocalResult(result, requestPayload, taskKind, streamPreference, signal) {
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady();
  const runtime = window.AISystem6ModelTaskRuntime;
  if (isCloud || streamPreference === "json" || !runtime?.shouldRepairHumanizerOutput?.(taskKind)) return result;
  const originalHits = runtime.findHumanizerOutputHits(result?.text);
  if (!originalHits.length) return result;

  const repairResponse = await fetchModelPayload({
    model: requestPayload.model,
    messages: runtime.buildHumanizerRepairMessages(result.text),
    temperature: 0.2,
    max_tokens: Math.max(320, Number(requestPayload.max_tokens || 0)),
    stream: false,
    ai_system6_task_kind: "humanizer-repair",
  }, signal);
  if (!repairResponse.ok) return result;
  const data = await repairResponse.json().catch(() => null);
  const repaired = scrubVisibleModelOutput(data?.choices?.[0]?.message?.content || "");
  if (!repaired) return result;
  return runtime.findHumanizerOutputHits(repaired).length < originalHits.length
    // The repair is a separate model request. Its visible answer is not part
    // of the original native response chain, so continuing from that response
    // id would give the next turn different history from the saved chat.
    ? { ...result, text: repaired, responseId: "", responseApi: "" }
    : result;
}

function currentClioTalkNativeResponseScope() {
  try {
    const config = window.AISystem6LocalLMStudio?.currentConfig?.();
    return {
      provider: String(config?.provider || ""),
      endpoint: String(config?.baseUrl || ""),
      model: String(getLocalModelRequestName() || ""),
    };
  } catch {
    return { provider: "", endpoint: "", model: "" };
  }
}

function clioTalkPreviousNativeResponseId(taskKind = "") {
  if (!/^(chat|sideask)$/.test(String(taskKind || "").toLowerCase())) return null;
  const currentUserIndex = conversation.findLastIndex(
    (record) => record?.role === "user" && record.deliveryState === "sending"
  );
  if (currentUserIndex <= 0) return null;
  const previous = conversation[currentUserIndex - 1];
  if (previous?.role !== "assistant") return null;
  if (!previous.providerResponse?.id || !["lmstudio-native-v1", "lmstudio-responses-v1"].includes(previous.providerResponse?.api)) return null;
  const scope = currentClioTalkNativeResponseScope();
  if (!scope.provider || !scope.endpoint || !scope.model) return null;
  if (previous.providerResponse.provider !== scope.provider
      || previous.providerResponse.endpoint !== scope.endpoint
      || previous.providerResponse.model !== scope.model) return null;
  return {
    id: String(previous.providerResponse.id),
    api: String(previous.providerResponse.api),
  };
}

function fetchModelPayload(payload, signal) {
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady();
  let nextPayload = { ...payload };
  const shouldRecordLoadout = nextPayload.ai_system6_record_loadout === true;

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
    Object.assign(nextPayload, cloudCredentialTransportFields());
    nextPayload._cloud_base_url = cloudConfig.baseUrl;
    nextPayload._cloud_model = cloudModel;
    if (nextPayload.stream) nextPayload.stream_options = { include_usage: true };
    delete nextPayload.ai_system6_record_loadout;
    if (shouldRecordLoadout) recordContextLoadout(nextPayload);
  } else {
    if (!localLmStudioConnectionEnabled) {
      throw new Error("lmstudio_server_offline: Connect to LM Studio in Control Panel first.");
    }
    const taskKind = nextPayload.ai_system6_task_kind || "chat";
    const roleResolution = window.AISystem6ModelRoles?.resolveForTask
      ? window.AISystem6ModelRoles.resolveForTask(taskKind)
      : { model: nextPayload.model, role: "default", fallbackReason: "" };
    nextPayload.model = roleResolution.model;
    nextPayload.ai_system6_model_role = roleResolution.role;
    if (roleResolution.fallbackReason) {
      nextPayload.ai_system6_model_fallback_reason = roleResolution.fallbackReason;
    }
    nextPayload = {
      ...localChatDefaults(nextPayload.model, {
        taskKind,
        temperature: Number(nextPayload.temperature),
      }),
      ...nextPayload,
      messages: withBrowserLocalSafetyMessages(nextPayload.messages, taskKind),
    };
    const previousResponse = clioTalkPreviousNativeResponseId(taskKind);
    if (previousResponse && !nextPayload._lmstudio_previous_response_id) {
      nextPayload._lmstudio_previous_response_id = previousResponse.id;
      nextPayload._lmstudio_previous_response_api = previousResponse.api;
    }
    delete nextPayload.ai_system6_record_loadout;
    if (shouldRecordLoadout) recordContextLoadout(nextPayload);
    return window.AISystem6LocalLMStudio.chat(nextPayload, {
      signal,
      contextLength: Number(contextLengthInput?.value || 0),
      autoLoad: true,
    });
  }

  const endpoint = getChatCompletionsEndpoint();
  if (endpoint === "same-origin-cloud-chat") {
    return window.AISystem6Capabilities.requestService("cloud.chat", {
      init: {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPayload),
      },
    });
  }
  return fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextPayload),
  });
}

async function throwModelResponseError(response, endPerf) {
  const detail = await response.text();
  const routeLabel = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active
    ? "Cloud API"
    : "LM Studio";
  const message = `${routeLabel} returned ${response.status}: ${serviceErrorDetail(response.status, detail)}`;
  const code = typeof classifyLmStudioError === "function" ? classifyLmStudioError(message, response) : "";
  endPerf?.({ error: true, status: response.status });
  const error = new Error([code, message].filter(Boolean).join(": "));
  error.status = response.status;
  throw error;
}

async function sendLocalModelTask(options = {}) {
  // Prompt files are lazy-loaded; boot preloads them, and the task entry
  // awaits them so no payload is ever assembled without its system prompts.
  await ensurePromptFilesData();
  const {
    userText = "",
    payload,
    signal,
    taskKind = "chat",
    streamPreference = "auto",
    onToken,
  } = options;
  const startedAt = performance.now();
  window.lastLocalModelResponseId = "";
  window.lastLocalModelResponseApi = "";
  const endPerf = window.AISystem6Perf?.start("model_request", { taskKind, streamPreference });
  const requestPayload = payload || buildPayload(userText, { ...options, taskKind });
  if (window.lastAutoSkillCall?.length) options.onAutoSkillCall?.(window.lastAutoSkillCall);
  const budgetedPayload = await fitPayloadWithModelBudget(requestPayload, { ...options, taskKind }, signal);
  const normalizedTaskKind = String(taskKind || "").toLowerCase();
  const explicitHumanizerRewrite = window.AISystem6ModelTaskRuntime
    ?.shouldRepairHumanizerOutput?.(normalizedTaskKind) === true;
  const gemma4NeedsVisibleRepair = normalizedTaskKind === "chat" && isGemma4ModelName(budgetedPayload.model);
  const localNeedsVisibleRepair = explicitHumanizerRewrite || gemma4NeedsVisibleRepair;
  const shouldStream = streamPreference === "stream" || (streamPreference === "auto" && normalizedTaskKind === "chat" && !localNeedsVisibleRepair);
  const finalPayload = { ...budgetedPayload, stream: shouldStream };

  const response = await fetchModelPayload(finalPayload, signal);
  if (!response.ok) await throwModelResponseError(response, endPerf);

  const contentType = response.headers.get("content-type") || "";
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady();
  if (shouldStream && response.body && /event-stream|text\/plain|octet-stream/i.test(contentType)) {
    try {
      const {
        content: streamedText,
        usage: streamUsage,
        finishReason,
        responseId,
        responseApi,
        servedModel,
        toolCalls: streamedToolCalls,
      } = await readChatCompletionStream(response, onToken, signal);
      const text = streamedText.trim();
      const toolCalls = Array.isArray(streamedToolCalls) ? streamedToolCalls : [];
      // A turn that only asks for a tool has no visible text, and that is a
      // complete turn, not an empty one. Mirrors the JSON reader's rule.
      if (!text && !toolCalls.length) throw new Error("LM Studio stream did not include content.");
      if (isCloud && streamUsage?.prompt_tokens) {
        trackCloudTokenUsage(streamUsage.prompt_tokens, streamUsage.completion_tokens || 0, streamUsage.total_tokens || 0, streamUsage, servedModel);
      }
      if (isCloud && typeof window.fetchCloudBalanceSilent === "function") {
        window.fetchCloudBalanceSilent().catch(() => {});
      }
      const metrics = modelMetricsFromStream(text, performance.now() - startedAt, finishReason || "stop");
      updateModelMeter(metrics);
      window.lastLocalModelResponseId = String(responseId || "");
      window.lastLocalModelResponseApi = String(responseApi || "");
      endPerf?.({ streamed: true, tokens: metrics.tokens });
      return {
        text,
        metrics,
        budget: lastContextBudget,
        // The tool loop reads the assistant turn back off this result, so a
        // streamed turn must present the same message shape as a JSON turn.
        message: { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
        toolCalls,
        responseId: window.lastLocalModelResponseId,
        responseApi: window.lastLocalModelResponseApi,
      };
    } catch (streamError) {
      if (signal?.aborted) throw streamError;
      if (String(streamError?.partialContent || "").trim()) throw streamError;
      window.AISystem6Perf?.record("model_request", performance.now() - startedAt, { streamFallback: true });
      const retryResponse = await fetchModelPayload({ ...budgetedPayload, stream: false }, signal);
      if (!retryResponse.ok) await throwModelResponseError(retryResponse);
      const fallbackResult = await readJsonModelResult(retryResponse, startedAt, endPerf, true);
      const repairedResult = await maybeRepairBrowserLocalResult(fallbackResult, budgetedPayload, taskKind, streamPreference, signal);
      window.lastLocalModelResponseId = String(repairedResult?.responseId || fallbackResult.responseId || "");
      window.lastLocalModelResponseApi = String(repairedResult?.responseApi || fallbackResult.responseApi || "");
      return repairedResult;
    }
  }

  if (isCloud && typeof window.fetchCloudBalanceSilent === "function") {
    window.fetchCloudBalanceSilent().catch(() => {});
  }
  const jsonResult = await readJsonModelResult(response, startedAt, endPerf);
  const finalResult = await maybeRepairBrowserLocalResult(jsonResult, budgetedPayload, taskKind, streamPreference, signal);
  window.lastLocalModelResponseId = String(finalResult?.responseId || jsonResult.responseId || "");
  window.lastLocalModelResponseApi = String(finalResult?.responseApi || jsonResult.responseApi || "");
  return finalResult;
}

async function sendToLmStudio(userText, signal, options = {}) {
  return runWritingTask({
    ...options,
    userInput: userText,
    signal,
    taskKind: options.taskKind || "chat",
  });
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
  if (/^(落落接收|落落会怎么接|若是落落会怎么接|落落|luoluo|luoluo receive)$/.test(value)) return "luoluo";
  if (/^(hkrr|hkrr 提亮|提亮|快速提亮|lift)$/.test(value)) return "hkrr";
  if (/^(夸夸我|夸我|praise|encourage me)$/.test(value)) return "praise";
  return "";
}

function createClioTalkPreflightRunManifest(taskKind = "chat", error = "", options = {}) {
  const temporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  const promptFiles = (window.lastTaskPromptFiles?.length ? window.lastTaskPromptFiles : getClioTalkPromptFileDescriptors())
    .map((file) => ({ ...file }));
  return {
    schemaVersion: 1,
    scope: "application-supplied-preflight",
    scopeNote: error
      ? `${t("clio_run_runtime_note")} Error before or during transport: ${error}`
      : t("clio_run_runtime_note"),
    capturedAt: new Date().toISOString(),
    taskKind,
    model: getLocalModelRequestName(),
    parameters: {},
    promptFiles,
    policyFiles: promptFiles.filter((file) => file.kind === "policy"),
    promptStack: [],
    messageStack: [],
    skillFiles: (window.lastTaskSkillFiles?.length ? window.lastTaskSkillFiles : getClioTalkPendingSkillDescriptors(promptInput?.value || "", { temporaryChat }))
      .map((file) => ({ ...file })),
    harnessFile: window.lastTaskHarnessFile
      ? { ...window.lastTaskHarnessFile }
      : getClioTalkPendingHarnessDescriptor(),
    inputFiles: (window.lastTaskInputFiles?.length ? window.lastTaskInputFiles : getClioTalkPendingInputDescriptors({ temporaryChat }))
      .map((file) => ({ ...file })),
    agentRun: window.lastWritingAgentRun
      ? window.AISystem6WritingAgentRuntime.snapshotAgentRun(window.lastWritingAgentRun)
      : null,
  };
}

function captureClioTalkGroundingSafely(options = {}) {
  try {
    return captureClioTalkGroundingSnapshot(options);
  } catch (error) {
    console.warn("ClioTalk grounding receipt failed; preserving the reply without it.", error);
    return null;
  }
}

function isIncompleteModelFinishReason(reason = "") {
  return ["length", "content_filter", "insufficient_system_resource", "interrupted"].includes(String(reason));
}

// The eighth writing tool builds a manuscript patch and stops there — nothing
// applied it, and nothing showed it, so the model could only describe the edit
// in prose and the writer had to retype it. This lifts the last proposal out of
// the finished run so the reply can carry it.
function clioTalkProposedManuscriptPatch() {
  const calls = window.lastWritingAgentGenerated?.toolCalls;
  if (!Array.isArray(calls)) return null;
  const proposal = [...calls]
    .reverse()
    .find((call) => call?.name === "proposeManuscriptPatch" && call?.result?.ok !== false);
  const data = proposal?.result?.data;
  if (!data || data.kind !== "manuscript-patch") return null;
  const target = String(data.target || "");
  const replacement = String(data.replacement || "");
  if (!target || target === replacement) return null;
  return { target, replacement, reason: String(data.reason || "") };
}

function createClioTalkAssistantRecord({
  content,
  taskKind,
  requestRecord,
  requestOptions,
  grounding,
  finishReason = "stop",
  stopped = false,
  temporaryChat = false,
  webSearch = null,
  providerResponseId = "",
  providerResponseApi = "",
} = {}) {
  const nativeResponseId = String(providerResponseId || "");
  const nativeResponseApi = String(providerResponseApi || "");
  const nativeScope = currentClioTalkNativeResponseScope();
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: String(content || ""),
    taskKind: String(taskKind || "chat"),
    createdAt: new Date().toISOString(),
    requestMessageId: requestRecord?.id || "",
    requestOptions: clioTalkReplayOptions(requestOptions, taskKind),
    stopped: !!stopped,
    incomplete: !stopped && isIncompleteModelFinishReason(finishReason),
    finishReason: String(finishReason || (stopped ? "stopped" : "stop")),
    temporaryChat: !!temporaryChat,
    grounding: grounding || null,
    // What the run opened before it answered. Kept on the record so the
    // evidence survives a reload, not only the moment it scrolled past.
    reading: clioTalkReadingTrace(),
    // A patch the run proposed but did not apply. It rides the reply so the
    // offer is still on the table when the writer comes back to an older turn,
    // and it stays a proposal until Use Result writes it.
    manuscriptPatch: clioTalkProposedManuscriptPatch(),
    webSearch: webSearch || null,
    providerResponse: nativeResponseId && nativeResponseApi ? {
      api: nativeResponseApi,
      id: nativeResponseId,
      ...nativeScope,
    } : null,
    harness: {
      taskKind: String(taskKind || "chat"),
      model: currentTranslationModel(),
      contextSources: grounding?.sources || [],
      projectMemoryIds: grounding?.projectMemoryIds || [],
    },
    runManifest: cloneClioRunManifest(
      window.lastTaskRunManifest || createClioTalkPreflightRunManifest(taskKind)
    ),
  };
}

function resolveClioTalkReplySafely(pendingMessage, content, options = {}) {
  try {
    resolvePendingMessage(pendingMessage, "assistant", content, options);
    return true;
  } catch (error) {
    console.error("ClioTalk rich reply rendering failed; using plain text.", error);
    stopWaitCycle();
    if (!pendingMessage) return false;
    pendingMessage.className = "message assistant";
    pendingMessage.setAttribute("aria-label", clioTalkAssistantDisplayName());
    pendingMessage.dataset.rawContent = String(content || "");
    if (options.messageRecord?.id) pendingMessage.dataset.messageId = options.messageRecord.id;
    const speaker = pendingMessage.querySelector(".speaker");
    if (speaker) speaker.textContent = clioTalkAssistantDisplayName();
    const body = pendingMessage.querySelector(".message-content");
    if (body) {
      body.className = "message-content";
      body.replaceChildren();
      String(content || "").split("\n").forEach((line, index) => {
        if (index) body.append(document.createElement("br"));
        body.append(document.createTextNode(line));
      });
    }
    lastAssistantText = String(content || "");
    try { appendClioTalkRunState(pendingMessage, options.messageRecord); } catch {}
    try { appendMessageActions(pendingMessage, "assistant", content, options); } catch {}
    scrollMessagesToLatest();
    return false;
  }
}

function saveClioTalkRunRecordSafely(options = {}) {
  if (options.messageRecord?.temporaryChat || clioTalkTemporaryMode) return { file: null, error: null };
  if (typeof saveClioTalkRunRecord !== "function") return { file: null, error: null };
  try {
    return { file: saveClioTalkRunRecord(options), error: null };
  } catch (error) {
    console.warn("ClioTalk Run Record persistence failed; preserving the reply.", error);
    return { file: null, error };
  }
}

function finalizeClioTalkAssistantReply({
  pendingMessage,
  activeConversationFile,
  submittedUserRecord,
  assistantRecord,
  runStatus = "completed",
} = {}) {
  submittedUserRecord.deliveryState = "sent";
  if (!conversation.some((record) => record.id === submittedUserRecord.id)) {
    conversation.push(submittedUserRecord);
  }
  if (!conversation.some((record) => record.id === assistantRecord.id)) {
    conversation.push(assistantRecord);
  }

  const rendered = resolveClioTalkReplySafely(pendingMessage, assistantRecord.content, {
    grounding: assistantRecord.grounding,
    messageRecord: assistantRecord,
  });
  const persisted = persistClioTalkConversationMutation();
  const runResult = saveClioTalkRunRecordSafely({
    chatFile: activeConversationFile,
    messageRecord: assistantRecord,
    manifest: assistantRecord.runManifest,
    status: runStatus,
  });
  assistantRecord.runRecordId = runResult.file?.id || "";
  if (assistantRecord.runRecordId || assistantRecord.temporaryChat) {
    const replyItem = messagesEl?.querySelector(`[data-message-id="${assistantRecord.id}"]`);
    if (replyItem) appendClioTalkRunReceipt(replyItem, assistantRecord);
    if (assistantRecord.runRecordId) persistClioTalkConversationMutation();
  }
  if (!assistantRecord.temporaryChat && window.lastAutoSkillCall?.length && typeof saveSkillAutoCallReceipt === "function") {
    try {
      saveSkillAutoCallReceipt(window.lastAutoSkillCall);
    } catch (error) {
      console.warn("ClioTalk Skill receipt persistence failed.", error);
    }
  }

  const runRecordExpected = !!(getActiveProject() && activeConversationFile);
  return {
    warnings: [
      ...(!rendered ? ["display"] : []),
      ...(!persisted ? ["chat-file"] : []),
      ...(runRecordExpected && runResult.error ? ["run-record"] : []),
    ],
  };
}

function clioWebSearchSetting() {
  const input = document.getElementById("clio-web-search");
  return !!input?.checked;
}

// The most recent web_search_call item from a ClioTalk web-search reply.
// Follow-up messages pass it back so the model reuses the prior search
// results instead of searching again (verified against the live API).
let lastClioWebSearchCall = null;

function clioWebSearchToggleActive() {
  if (!clioWebSearchSetting()) return false;
  const toggle = document.getElementById("clio-web-search-toggle");
  return toggle?.getAttribute("aria-expanded") === "true";
}

function clioTalkWebSearchReady() {
  return typeof cloudConfig !== "undefined"
    && cloudConfig?.active
    && cloudConfig?.provider
    && cloudCredentialReady();
}

/**
 * Show or hide the per-message web-search switch beside the composer and
 * clear its pressed state whenever the Control Panel setting is off.
 */
function refreshClioTalkWebSearchToggle() {
  const toggle = document.getElementById("clio-web-search-toggle");
  if (!toggle) return;
  const enabled = clioWebSearchSetting();
  toggle.classList.toggle("is-hidden", !enabled);
  if (!enabled) toggle.setAttribute("aria-expanded", "false");
  renderClioTalkRunAssembly();
}

/**
 * One web-search answer for ClioTalk: the server runs the Responses API
 * web_search tool in companion mode and returns a cited answer.
 *
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @param {{ onDelta?: (content: string) => void }} [options]
 * @returns {Promise<{ answer: string, citations: Array<{ url: string, title: string }>, results?: Array<object>, searchCalls?: Array<object>, usage?: object }>}
 */
async function runClioTalkWebSearch(query, signal, options = {}) {
  const response = await window.AISystem6Capabilities.requestService("search.remote", {
    path: "/api/search/answer",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: query,
        mode: "clio",
        stream: true,
        search_calls: lastClioWebSearchCall ? [lastClioWebSearchCall] : [],
        ...cloudCredentialTransportFields(),
      }),
      signal,
    },
  });
  if (!response.ok) throw new Error(await response.text());
  const result = await readWebSearchStream(response, {
    onDelta: (content) => options.onDelta?.(content),
  });
  if (Array.isArray(result?.searchCalls) && result.searchCalls.length) {
    lastClioWebSearchCall = result.searchCalls[result.searchCalls.length - 1];
  }
  return result;
}

function openClioWebCitationInReader(url) {
  if (!url) return;
  readerUrlInput.value = url;
  openWindow("reader");
  fetchReaderPage(url);
  setStatus(t("claim_check_online_opened_source"));
}

/**
 * Append the transient cited-sources block under a web-search reply. The
 * sources stay temporary: each button opens Reader so the original can be
 * checked before the answer is relied on.
 *
 * @param {HTMLElement} messageElement
 * @param {Array<{ url: string, title: string }>} [citations]
 */
function appendClioTalkWebSearchCitations(messageElement, citations) {
  if (!messageElement || !Array.isArray(citations) || !citations.length) return;
  const wrap = document.createElement("div");
  wrap.className = "clio-web-search-citations";
  const label = document.createElement("b");
  label.textContent = t("clio_web_search_citations");
  wrap.append(label);
  citations.forEach((citation) => {
    if (!citation.url) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn mini-btn citation-btn";
    button.textContent = citation.title || citation.url;
    button.addEventListener("click", () => openClioWebCitationInReader(citation.url));
    wrap.append(button);
  });
  const note = document.createElement("div");
  note.className = "hint";
  note.textContent = t("clio_web_search_note");
  wrap.append(note);
  messageElement.append(wrap);
}

async function submitUserTextCore(userText, options = {}) {
  if (!userText) return;
  if (!clioTalkModelReady()) {
    setStatus(t("clio_model_required_status"));
    syncClioTalkModelAvailability();
    return;
  }
  if (clioWebSearchToggleActive() && !clioTalkWebSearchReady()) {
    setStatus(t("clio_web_search_cloud_required"));
    return;
  }

  // The global Retry action re-runs the last failed AI action. ClioTalk
  // registers its own submit so retry never falls through to another app.
  window.AISystem6ModelUserErrors?.registerRetryable?.({
    owner: "clioTalk",
    projectId: activeProjectId,
    conversationId: getActiveConversationFile()?.id || "",
    callback: () => {
      const text = lastUserText || userText;
      if (text) submitUserText(text, options);
    },
  });

  const quickDraftAction = options.quickDraftAction || quickDraftActionFromText(userText);
  if (quickDraftAction && typeof window !== "undefined" && typeof window.AISystem6QuickDraft?.runClioTalkAction === "function") {
    addMessage("user", options.displayText || userText);
    promptInput.value = "";
    promptInput.focus();
    await window.AISystem6QuickDraft.runClioTalkAction(quickDraftAction);
    return;
  }

  if (shouldCaptureQuickDraftVentInput(options)) {
    const captured = await window.AISystem6QuickDraft.captureVentText(userText, {
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

  const messageTaskKind = options.taskKind || (sideAskEnabled && !isMultiFinderMode() ? "sideask" : "chat");
  const isTemporaryChat = options.temporaryChat === true || clioTalkTemporaryMode;
  const runtimeOptions = { ...options, temporaryChat: isTemporaryChat };
  const requiresDurableChatFile = !isTemporaryChat
    && options.fileNative !== false
    && !sideAskEnabled
    && isClioTalkAnswerContractTask(messageTaskKind, runtimeOptions);
  if (requiresDurableChatFile && !getActiveProject()) {
    setStatus(t("clio_project_required_for_chat"));
    openWindow("projects");
    return;
  }

  lastUserText = userText;
  window.lastTaskRunManifest = null;
  window.lastTaskPromptFiles = [];
  window.lastTaskSkillFiles = [];
  window.lastTaskHarnessFile = null;
  window.lastTaskInputFiles = [];
  window.lastTaskExplicitInputFiles = [];
  window.lastWritingAgentRun = null;
  const replayOptions = clioTalkReplayOptions(runtimeOptions, messageTaskKind);
  const submittedUserRecord = {
    id: crypto.randomUUID(),
    role: "user",
    content: userText,
    displayContent: options.displayText && options.displayText !== userText ? options.displayText : "",
    taskKind: messageTaskKind,
    requestOptions: replayOptions,
    temporaryChat: isTemporaryChat,
    deliveryState: "sending",
    createdAt: new Date().toISOString(),
  };
  conversation.push(submittedUserRecord);
  // Keep this run-local file distinct from the active-file lookup above. A
  // declaration named activeConversationFile made the earlier retry receipt
  // either hit its temporal dead zone or reference a missing global, so both
  // Enter and button submits rejected before adding a message.
  const conversationFile = requiresDurableChatFile
    ? ensureCurrentConversationFile()
    : (isTemporaryChat ? null : getActiveConversationFile());
  if (requiresDurableChatFile && !conversationFile) {
    conversation.pop();
    setStatus(t("clio_project_required_for_chat"));
    openWindow("projects");
    return;
  }
  clioTalkAutoFollow = true;
  addMessage("user", userText, { messageRecord: submittedUserRecord });
  const pendingMessage = createPendingMessage();
  startWaitCycle(pendingMessage);
  promptInput.value = "";
  promptInput.focus();
  persistClioTalkConversationMutation();

  activeAbortController = new AbortController();
  setComposerBusy(true);
  setStatus(t("thinking"));
  updateLocalModelState({ running: true, task: modelRouteText("consulting_model", "consulting_cloud_model") });
  let receivedAssistantText = "";

  try {
    const hasMountedProjectDisk = ragChunks.some((chunk) => chunk.projectId === activeProjectId);
    updatePendingMessage(pendingMessage, hasMountedProjectDisk ? 0 : 1, hasMountedProjectDisk ? t("searching_scraps") : `${modelRouteText("consulting_model", "consulting_cloud_model")}.`);
    await prepareStreamingMarkdownPreview();
    if (clioWebSearchToggleActive()) {
      updatePendingMessage(pendingMessage, 1, t("clio_web_search_running"));
      const webResult = await runClioTalkWebSearch(userText, activeAbortController.signal, {
        onDelta: (content) => updatePendingStreamContent(pendingMessage, content),
      });
      receivedAssistantText = String(webResult.answer || "").trim();
      if (!receivedAssistantText) throw new Error(t("clio_web_search_empty"));
      updatePendingMessage(pendingMessage, 2, `${t("typesetting_reply")}.`);
      const grounding = captureClioTalkGroundingSafely({
        ...runtimeOptions,
        taskKind: messageTaskKind,
      });
      const assistantRecord = createClioTalkAssistantRecord({
        content: receivedAssistantText,
        taskKind: messageTaskKind,
        requestRecord: submittedUserRecord,
        requestOptions: replayOptions,
        grounding,
        finishReason: "stop",
        temporaryChat: isTemporaryChat,
        webSearch: {
          citations: Array.isArray(webResult.citations) ? webResult.citations : [],
          usage: webResult.usage || null,
        },
      });
      const finalization = finalizeClioTalkAssistantReply({
        pendingMessage,
        activeConversationFile: conversationFile,
        submittedUserRecord,
        assistantRecord,
        runStatus: "completed",
      });
      appendClioTalkWebSearchCitations(pendingMessage, webResult.citations);
      updateLocalModelState({ server: true, selected: true, ready: true, running: false, task: "" });
      setStatus(finalization.warnings.length
        ? t("clio_reply_preserved_record_warning")
        : t("ready"));
      return;
    }
    receivedAssistantText = await sendToLmStudio(userText, activeAbortController.signal, {
      ...runtimeOptions,
      taskKind: messageTaskKind,
      streamPreference: "auto",
      onToken: (content) => updatePendingStreamContent(pendingMessage, content),
      onAutoSkillCall: (skills) => updatePendingMessage(pendingMessage, 0, currentLanguage === "zh" ? `正在自动调用只读技能：${skills.map((entry) => entry.parsed.manifest.name).join("、")}` : `Auto-calling read-only Skill: ${skills.map((entry) => entry.parsed.manifest.name).join(", ")}`),
      onToolActivity: (calls) => reportClioTalkToolActivity(pendingMessage, calls),
    });
    const grounding = captureClioTalkGroundingSafely({
      ...runtimeOptions,
      taskKind: messageTaskKind,
    });
    updatePendingMessage(pendingMessage, 2, `${t("typesetting_reply")}.`);
    const finishReason = String(lastModelMetrics?.stopReason || "stop");
    const assistantRecord = createClioTalkAssistantRecord({
      content: receivedAssistantText,
      taskKind: messageTaskKind,
      requestRecord: submittedUserRecord,
      requestOptions: replayOptions,
      grounding,
      finishReason,
      temporaryChat: isTemporaryChat,
      providerResponseId: window.lastLocalModelResponseId,
      providerResponseApi: window.lastLocalModelResponseApi,
    });
    const finalization = finalizeClioTalkAssistantReply({
      pendingMessage,
      activeConversationFile: conversationFile,
      submittedUserRecord,
      assistantRecord,
      runStatus: assistantRecord.incomplete ? "incomplete" : "completed",
    });
    updateLocalModelState({ server: true, selected: true, ready: true, running: false, task: "" });
    setStatus(finalization.warnings.length ? t("clio_reply_preserved_record_warning") : t("ready"));
  } catch (error) {
    const interruptedPartial = error?.name !== "AbortError"
      ? String(error?.partialContent || "").trim()
      : "";
    if (interruptedPartial) {
      const grounding = captureClioTalkGroundingSafely({
        ...runtimeOptions,
        taskKind: messageTaskKind,
      });
      const assistantRecord = createClioTalkAssistantRecord({
        content: interruptedPartial,
        taskKind: messageTaskKind,
        requestRecord: submittedUserRecord,
        requestOptions: replayOptions,
        grounding,
        finishReason: "interrupted",
        temporaryChat: isTemporaryChat,
        providerResponseId: window.lastLocalModelResponseId,
        providerResponseApi: window.lastLocalModelResponseApi,
      });
      const finalization = finalizeClioTalkAssistantReply({
        pendingMessage,
        activeConversationFile: conversationFile,
        submittedUserRecord,
        assistantRecord,
        runStatus: "interrupted",
      });
      updateLocalModelState({ server: true, selected: true, ready: true, running: false, task: "" });
      setStatus(finalization.warnings.length
        ? t("clio_reply_preserved_record_warning")
        : t("clio_reply_interrupted"));
    } else if (error?.name === "AbortError") {
      const partialContent = String(error?.partialContent || pendingMessage?.dataset.rawContent || "").trim();
      if (partialContent) {
        const grounding = captureClioTalkGroundingSafely({
          ...runtimeOptions,
          taskKind: messageTaskKind,
        });
        const assistantRecord = createClioTalkAssistantRecord({
          content: partialContent,
          taskKind: messageTaskKind,
          requestRecord: submittedUserRecord,
          requestOptions: replayOptions,
          grounding,
          stopped: true,
          finishReason: "stopped",
          temporaryChat: isTemporaryChat,
          providerResponseId: window.lastLocalModelResponseId,
          providerResponseApi: window.lastLocalModelResponseApi,
        });
        finalizeClioTalkAssistantReply({
          pendingMessage,
          activeConversationFile: conversationFile,
          submittedUserRecord,
          assistantRecord,
          runStatus: "stopped",
        });
      } else {
        submittedUserRecord.deliveryState = "sent";
        submittedUserRecord.runManifest = cloneClioRunManifest(
          window.lastTaskRunManifest || createClioTalkPreflightRunManifest(messageTaskKind)
        );
        const runResult = saveClioTalkRunRecordSafely({
          chatFile: conversationFile,
          messageRecord: submittedUserRecord,
          manifest: submittedUserRecord.runManifest,
          status: "stopped",
        });
        submittedUserRecord.runRecordId = runResult.file?.id || "";
        const stoppedUserItem = messagesEl?.querySelector(`[data-message-id="${submittedUserRecord.id}"]`);
        if (stoppedUserItem) appendClioTalkRunReceipt(stoppedUserItem, submittedUserRecord);
        resolvePendingStatus(pendingMessage, t("stopped"));
        persistClioTalkConversationMutation();
      }
      setStatus(t("stopped"));
    } else if (receivedAssistantText) {
      const grounding = captureClioTalkGroundingSafely({
        ...runtimeOptions,
        taskKind: messageTaskKind,
      });
      const assistantRecord = createClioTalkAssistantRecord({
        content: receivedAssistantText,
        taskKind: messageTaskKind,
        requestRecord: submittedUserRecord,
        requestOptions: replayOptions,
        grounding,
        finishReason: String(lastModelMetrics?.stopReason || "stop"),
        temporaryChat: isTemporaryChat,
        providerResponseId: window.lastLocalModelResponseId,
        providerResponseApi: window.lastLocalModelResponseApi,
      });
      assistantRecord.localCommitWarning = String(error?.message || error || "");
      finalizeClioTalkAssistantReply({
        pendingMessage,
        activeConversationFile: conversationFile,
        submittedUserRecord,
        assistantRecord,
        runStatus: "completed-with-warning",
      });
      console.error("ClioTalk received a model reply but could not complete local bookkeeping.", error);
      updateLocalModelState({ server: true, selected: true, ready: true, running: false, task: "" });
      setStatus(t("clio_reply_preserved_record_warning"));
    } else {
      const code = typeof classifyLmStudioError === "function" ? classifyLmStudioError(error) : "";
      const isCloudActive = typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active;
      const modelRecovery = window.AISystem6ModelUserErrors?.failure?.(error, {
        provider: isCloudActive ? (cloudConfig?.provider || "deepseek") : "lm-studio",
        kind: isCloudActive ? "cloud" : "local",
      });
      const cloudErrorKey = {
        cloud_invalid_key: "cloud_invalid_key",
        cloud_insufficient_balance: "cloud_insufficient_balance",
        cloud_rate_limit: "cloud_rate_limit",
        cloud_shared_limit: "cloud_shared_limit",
        cloud_invalid_request: "cloud_invalid_request",
        cloud_service_unavailable: "cloud_service_unavailable",
      }[code];
      const prefix = cloudErrorKey ? t(cloudErrorKey)
        : code === "lmstudio_context_length" ? t("lm_context_error")
        : isCloudActive ? t("cloud_api_error")
        : t("connection_error");
      // Ordinary UI shows a localized message + next step, never a raw HTTP
      // code or fetch failure. The original error stays in the run record and
      // console for Advanced diagnostics / System Status.
      const userMessage = cloudErrorKey || code === "lmstudio_context_length"
        ? prefix
        : modelRecovery
          ? `${t(modelRecovery.messageKey)} ${t(modelRecovery.actionKey)}`
          : `${prefix} ${t("ai_error_unknown")} ${t("ai_action_view_connection")}`;
      if (modelRecovery?.actionId && typeof window.AISystem6ModelUserErrors?.notify === "function") {
        window.AISystem6ModelUserErrors.notify(error, {
          provider: isCloudActive ? (cloudConfig?.provider || "deepseek") : "lm-studio",
          kind: isCloudActive ? "cloud" : "local",
        });
      }
      submittedUserRecord.deliveryState = "failed";
      if (!conversation.some((record) => record.id === submittedUserRecord.id)) {
        conversation.push(submittedUserRecord);
      }
      submittedUserRecord.runManifest = cloneClioRunManifest(
        window.lastTaskRunManifest || createClioTalkPreflightRunManifest(messageTaskKind, error.message)
      );
      const runResult = saveClioTalkRunRecordSafely({
        chatFile: conversationFile,
        messageRecord: submittedUserRecord,
        manifest: submittedUserRecord.runManifest,
        status: "failed",
        error: error.message,
      });
      submittedUserRecord.runRecordId = runResult.file?.id || "";
      persistClioTalkConversationMutation();
      const failedUserItem = messagesEl?.querySelector(`[data-message-id="${submittedUserRecord.id}"]`);
      if (failedUserItem) {
        appendClioTalkRunState(failedUserItem, submittedUserRecord);
        appendClioTalkRunReceipt(failedUserItem, submittedUserRecord);
      }
      resolvePendingStatus(pendingMessage, userMessage, {
        retryText: userText,
        retryOptions: replayOptions,
        userRecordId: submittedUserRecord.id,
      });
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

// Event listeners cannot await an uncaught async rejection. Keep one outer
// boundary around every ClioTalk entry point so an unexpected preflight bug
// becomes a visible, retryable failed turn instead of making Enter and Send
// appear to do nothing. Expected transport failures remain handled inside the
// core path above, with their more specific recovery copy and Run Record.
async function submitUserText(userText, options = {}) {
  try {
    return await submitUserTextCore(userText, options);
  } catch (error) {
    console.error("ClioTalk submission failed outside the model error boundary.", error);

    activeAbortController?.abort();
    activeAbortController = null;
    stopWaitCycle();
    updateLocalModelState({ running: false, task: "" });
    setComposerBusy(false);

    const cleanText = String(userText || "").trim();
    let submittedUserRecord = [...conversation]
      .reverse()
      .find((record) => record?.role === "user" && record.deliveryState === "sending");
    if (!submittedUserRecord && cleanText) {
      submittedUserRecord = {
        id: crypto.randomUUID(),
        role: "user",
        content: cleanText,
        displayContent: options.displayText && options.displayText !== cleanText ? options.displayText : "",
        taskKind: options.taskKind || "chat",
        requestOptions: clioTalkReplayOptions(options, options.taskKind || "chat"),
        temporaryChat: options.temporaryChat === true || clioTalkTemporaryMode,
        deliveryState: "failed",
        createdAt: new Date().toISOString(),
      };
      conversation.push(submittedUserRecord);
      addMessage("user", cleanText, { messageRecord: submittedUserRecord });
    }

    if (submittedUserRecord) {
      submittedUserRecord.deliveryState = "failed";
      try {
        submittedUserRecord.runManifest = cloneClioRunManifest(
          window.lastTaskRunManifest
            || createClioTalkPreflightRunManifest(submittedUserRecord.taskKind, error?.message || String(error))
        );
        const runResult = saveClioTalkRunRecordSafely({
          chatFile: getActiveConversationFile(),
          messageRecord: submittedUserRecord,
          manifest: submittedUserRecord.runManifest,
          status: "failed",
          error: error?.message || String(error),
        });
        submittedUserRecord.runRecordId = runResult.file?.id || "";
      } catch (receiptError) {
        console.warn("ClioTalk could not preserve the unexpected failure receipt.", receiptError);
      }
      persistClioTalkConversationMutation();
      const userItem = messagesEl?.querySelector(`[data-message-id="${submittedUserRecord.id}"]`);
      if (userItem) {
        appendClioTalkRunState(userItem, submittedUserRecord);
        appendClioTalkRunReceipt(userItem, submittedUserRecord);
      }
    }

    const pendingMessage = [...(messagesEl?.querySelectorAll(".message.assistant.pending") || [])].at(-1)
      || createPendingMessage();
    resolvePendingStatus(pendingMessage, `${t("ai_error_unknown")} ${t("ai_action_view_connection")}`, {
      retryText: cleanText,
      retryOptions: clioTalkReplayOptions(options, options.taskKind || "chat"),
      userRecordId: submittedUserRecord?.id || "",
    });
    syncClioTalkSendButton();
    return null;
  }
}
