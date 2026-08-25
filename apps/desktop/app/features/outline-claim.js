// Feature module: outline-claim.

// Lazy module: loaded as a classic script when a writing-route AI command is
// summoned; shares the AI System 6 global scope. The Review Desk section
// machinery and the shared Markdown helpers that eager surfaces call
// synchronously live in app/core/review-sections.js — see the note there
// before moving anything back.

window.AISystem6OutlineClaimLoaded = true;

let currentClaimCheckScope = { type: "manuscript", label: "" };
let currentClaimCheckFileId = "";

function validateGeneratedWritingOutline(markdown) {
  const content = String(markdown || "").trim();
  if (!content) throw new Error("empty outline response");
  const sections = content.match(/^##\s+.+$/gm) || [];
  if (!sections.length) {
    throw new Error(t("generated_outline_has_no_writable_sections"));
  }
  const forbiddenHeading = /^##\s*(?:[一二三四五六七八九十\d.、\s-]*)?(?:核验|确认|校验|资料补充|补充资料|下一步|后续行动|行动计划|风险|备注|输出规则|写作准备|读者导向|结构逻辑|数据准确性|工作清单|写作大纲总结)\b/im;
  if (forbiddenHeading.test(content)) {
    throw new Error(currentLanguage === "zh"
      ? "生成的大纲包含工作清单章节，不能直接进入章节草稿。"
      : "Generated outline contains work-list sections that cannot be drafted directly.");
  }
  if (/^###\s+/m.test(content)) {
    throw new Error(currentLanguage === "zh"
      ? "生成的大纲层级过深；请只使用 ## 章节。"
      : "Generated outline is too deeply nested; use ## sections only.");
  }
  if (sections.length > 7) {
    throw new Error(currentLanguage === "zh"
      ? "生成的大纲章节过多，无法快速进入章节草稿。"
      : "Generated outline has too many sections for the drafting flow.");
  }
  const workListLines = content.split("\n").filter((line) => /(?:确认|核验|待补充|资料补充|下一步|后续|风险|备注|输出规则|不要输出解释|只返回|确保)/.test(line));
  if (workListLines.length >= 3) {
    throw new Error(currentLanguage === "zh"
      ? "生成的大纲混入了过多工作流/提示词说明，不能作为口播章节。"
      : "Generated outline contains too many workflow or prompt notes.");
  }
  return content;
}

function buildGeneratedOutlineRetryMessages({
  questions = "",
  existingOutline = "",
  readerClipContext = "",
  projectContext = "",
  badOutput = "",
  failureReason = "",
} = {}) {
  const badSummary = clipContextContent(String(badOutput || ""), 1200);
  const prompt = `你是 AI System 6 的中文视频稿大纲编辑。上一次生成的大纲没有通过校验：${failureReason || "输出不是可直接起草的章节大纲"}。

请重新生成一份能直接进入“章节草稿”的 Markdown 大纲。

硬性要求：
- 只输出最终口播会出现的 4-6 个 ## 章节。
- 不要写研究计划、核验清单、资料补充、后续行动、风险提示、输出规则或提示词说明。
- 不要使用 ###。
- 每个 ## 章节下面写 2-4 条要点；每条说明“这一段要讲什么 / 观众为什么在意 / 可用事实或画面”。
- 章节标题要像视频分段，不要像报告目录或工作流栏目。
- 只返回 Markdown 大纲，不解释。

READER CLIPS:
${readerClipContext || "No Reader clips saved yet."}

PROJECT CONTEXT:
${projectContext || "No relevant project context selected yet."}

USER QUESTIONS & GOALS:
${questions}

EXISTING OUTLINE:
${existingOutline || "No existing outline yet."}

上一次失败输出摘要（不要照抄）：
${badSummary || "No failed output captured."}`;

  return withMarkdownModelMessages([
    {
      role: "system",
      content: resolveWritingRoutePrompt("writing-route.outline-retry"),
    },
    { role: "user", content: prompt },
  ]);
}

async function readRebuildMarkdownPackStream(response, onProgress = null) {
  const markdown = await readModelTextStream(response, {
    signal: getLongTaskSignal(),
    throttleMs: 80,
    onSnapshot: onProgress,
  });
  if (!markdown.trim()) throw new Error("lmstudio_bad_response: empty writing object pack stream");
  return markdown;
}

async function generateOutlineFromQuestionSheetCore(options = {}) {
  const project = getActiveProject();
  if (!project) throw new Error(t("no_project_mounted"));
  const questions = String(options.questions ?? questionSheetBodyInput?.value ?? project.questionSheet ?? "").trim();
  if (!questions) throw new Error(t("question_sheet_hint"));
  const existingOutline = String(options.existingOutline ?? currentOutlineMarkdown(project) ?? "").trim();
  const taskId = options.taskId || "generate-outline";
  const statusLabel = options.statusLabel || t("making_outline");
  const modelName = options.modelName || getLocalModelRequestName();
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 900;
  if (!beginLongTask(taskId, statusLabel)) {
    throw new Error(t("task_already_running", localModelState?.task || t("working_locally")));
  }
  try {
    project.questionSheet = questions;
    project.updatedAt = new Date().toISOString();
    saveDeskState();
    const readerClipContext = clipContextContent(getReaderClipOutlineContext(), 1800);
    const projectContext = await buildBudgetedProjectContext([questions, existingOutline].filter(Boolean).join("\n\n"), {
      budget: Number.isFinite(options.contextBudget) ? options.contextBudget : 5000,
      topK: Number.isFinite(options.contextTopK) ? options.contextTopK : 6,
      maxReferenceChunks: Number.isFinite(options.maxReferenceChunks) ? options.maxReferenceChunks : 5,
      maxCuratedContextItems: Number.isFinite(options.maxCuratedContextItems) ? options.maxCuratedContextItems : 3,
      itemLimit: Number.isFinite(options.contextItemLimit) ? options.contextItemLimit : 800,
      taskKind: "generate-outline",
    });
    const prompt = `${resolveWritingRoutePrompt("writing-route.outline-generate")}

    READER CLIPS:
    ${readerClipContext || "No Reader clips saved yet."}

    PROJECT CONTEXT:
    ${projectContext || "No relevant project context selected yet."}

    USER QUESTIONS & GOALS:
    ${questions}

    EXISTING OUTLINE:
    ${existingOutline || "No existing outline yet."}

    `;

    const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, options.maxAttempts) : 2;
    let content = "";
    let lastError = null;
    await prepareStreamingMarkdownPreview();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const messages = attempt === 0
        ? withMarkdownModelMessages([{ role: "user", content: prompt }])
        : buildGeneratedOutlineRetryMessages({
          questions,
          existingOutline,
          readerClipContext,
          projectContext,
          badOutput: lastError?.badOutput || "",
          failureReason: lastError?.message || "",
        });
      if (attempt > 0) {
        updateLocalModelState({
          running: true,
          task: currentLanguage === "zh" ? "正在重试生成大纲..." : "Retrying outline generation...",
        });
      }
      const response = await fetchModelPayload({
        model: modelName,
        messages,
        temperature: attempt === 0
          ? (Number.isFinite(options.temperature) ? options.temperature : 0.5)
          : (Number.isFinite(options.retryTemperature) ? options.retryTemperature : 0.15),
        max_tokens: maxTokens,
        ai_system6_task_kind: "generate-outline",
        stream: true,
      }, getLongTaskSignal());

      const streamedContent = await readModelTextStream(response, {
        signal: getLongTaskSignal(),
        throttleMs: 120,
        onSnapshot: (markdown) => showStreamingSurfacePreview("outline", stripRebuildMarkdownFence(markdown)),
      });
      const rawContent = stripRebuildMarkdownFence(streamedContent || "").trim();
      try {
        content = validateGeneratedWritingOutline(rawContent);
        showStreamingSurfacePreview("outline", content, { final: true });
        break;
      } catch (error) {
        lastError = error;
        lastError.badOutput = rawContent;
        if (attempt >= maxAttempts - 1) throw error;
      }
    }
    setProjectOutlineMarkdown(project, content);
    markTeachTextAiAssisted();
    project.updatedAt = new Date().toISOString();
    saveDeskState();
    updateFlowGuideChecklist({ render: false });
    renderPipeline();
    return content;
  } finally {
    endLongTask(taskId);
  }
}

async function generateOutline() {
  await ensureWritingFlowModule();
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  const questions = questionSheetBodyInput.value.trim();
  if (!questions) {
    setStatus(t("question_sheet_hint"));
    return;
  }

  const existingOutline = currentOutlineMarkdown(project).trim();
  // Warn about losing work, not about losing the system's own placeholder. A
  // fresh project ships "## New Section", so the old check fired an overwrite
  // confirmation on every first outline - and a warning that cries wolf is
  // training for clicking through the one that matters.
  const hasWorkToLose = getMeaningfulOutlineSections(extractOutlineSections(existingOutline)).length > 0;
  if (existingOutline && hasWorkToLose) {
    const result = await showSystemModal(t("outline_overwrite_confirm"), "confirm");
    if (result !== "yes") return;
  }

  let didGenerateOutline = false;
  let didFail = false;
  try {
    await generateOutlineFromQuestionSheetCore({ questions, existingOutline });
    openWindow("outline");
    didGenerateOutline = true;
  } catch (error) {
    if (!isAbortError(error)) {
      didFail = true;
      console.error("Generate outline failed", error);
      // The transport's own string ("lmstudio_server_offline: ...") is a
      // diagnostic, not product copy. Say what failed, then what to do next,
      // and put the next step on a button instead of naming a window the
      // writer then has to go find.
      await reportWritingRouteModelFailure(error, t("make_outline"));
    }
  } finally {
    if (didFail) return;
    if (didGenerateOutline) setStatus(t("outline_generated"));
    else clearStatus();
  }
}

// Consumer-facing failure copy for a route command that asked a model: what
// happened, then the action that fixes it. Diagnostics stay in the console.
async function reportWritingRouteModelFailure(error, taskLabel) {
  const detail = typeof explainStatusError === "function"
    ? explainStatusError(String(error?.message || error || ""))
    : "";
  const headline = currentLanguage === "zh"
    ? `「${taskLabel}」没有完成。`
    : `${taskLabel} could not finish.`;
  const message = [headline, detail].filter(Boolean).join(" ");
  setStatus(message);
  const offline = typeof modelReadyForRequests === "function" && !modelReadyForRequests();
  try {
    if (offline) {
      const openControl = await showSystemModal(
        currentLanguage === "zh"
          ? `${message}\n\n要现在打开控制面板接一个模型吗？`
          : `${message}\n\nOpen Control Panel to connect a model?`,
        "confirm",
      );
      if (openControl === "yes") handleAction("open-control");
      return;
    }
    await showSystemModal(message, "alert");
  } catch {
    // Keep the status text if the modal cannot open.
  }
}

function questionSheetPromptLeakReason(markdown) {
  const text = String(markdown || "");
  const promptLeakPatterns = [
    /固定语义[:：]/,
    /Fixed semantics:/i,
    /输入来源[:：]/,
    /Input source:/i,
    /现有问题单[:：]/,
    /Existing Question Sheet:/i,
    /项目上下文[:：]/,
    /Project context:/i,
    /使用这些栏目/,
    /Use these sections/i,
    /只返回完整的问题单 Markdown/,
    /Return the full Question Sheet Markdown only/i,
    /不要改成摘要、大纲、正文、事实核查报告或泛泛建议/,
    /Do not turn it into a summary, outline, draft, fact-check report/i,
  ];
  const hits = promptLeakPatterns.filter((pattern) => pattern.test(text)).length;
  if (hits >= 2) {
    return currentLanguage === "zh"
      ? "模型输出包含提示词契约，而不是可保存的问题单。"
      : "The model output contains prompt contract text instead of a usable Question Sheet.";
  }
  if (/输出规则[\s\S]{0,240}(?:只返回完整的问题单 Markdown|不要解释|不要改成摘要、大纲、正文)/.test(text)) {
    return currentLanguage === "zh"
      ? "模型把系统输出规则写进了问题单。"
      : "The model copied system output rules into the Question Sheet.";
  }
  if (/(?:##\s+输出规则|##\s+Output Rules)[\s\S]{0,900}(?:不要输出任何关于任务|提示词|系统消息|操作过程|只使用输入和项目材料中已有的信息|保留用户原本的问题意识|接收者要写成真实的人或真实群体|Do not output notes about the task|prompt|system message|Use only the input and project material|Preserve the user's questions)/i.test(text)) {
    return currentLanguage === "zh"
      ? "模型把任务规则当成了问题单的输出规则。"
      : "The model treated task rules as Question Sheet output rules.";
  }
  if (/(?:保留用户原本的问题意识|不要为了整齐把它们改成模型自己的均质语言|只使用输入和项目材料中已有的信息提出问题与边界|不要新增没有来源支持的事实结论|交付减摩擦要说明怎样让对方更容易接收|可保存的问题单 Markdown|优先使用上述栏目|只保留最有用的栏目|每个栏目\s*1-2\s*行|不要长段落|Preserve the user's questions|do not wash them into generic model language|Use only the input and project material|do not add unsupported factual conclusions|handoff friction should make the work easier to receive|Keep only the useful sections|no long paragraphs)/i.test(text)) {
    return currentLanguage === "zh"
      ? "模型把系统任务约束写进了问题单内容。"
      : "The model copied system task constraints into the Question Sheet content.";
  }
  return "";
}

function validateOrganizedQuestionSheet(markdown) {
  const text = stripRebuildMarkdownFence(markdown).trim();
  if (!text) {
    throw new Error(t("the_model_returned_an_empty_question"));
  }
  const leakReason = questionSheetPromptLeakReason(text);
  if (leakReason) throw new Error(leakReason);
  const hasQuestionHeading = questionSheetSectionHeadingPattern(QUESTION_SHEET_SECTION_KEYS, currentLanguage).test(text);
  const questionLikeCount = (text.match(/[？?]/g) || []).length;
  const bulletCount = (text.match(/^\s*[-*+]\s+\S/gm) || []).length;
  if (!hasQuestionHeading) {
    throw new Error(currentLanguage === "zh"
      ? "整理后的问题单缺少标准栏目标题。"
      : "The organized Question Sheet is missing standard section headings.");
  }
  if (questionLikeCount < 2 && bulletCount < 6) {
    throw new Error(currentLanguage === "zh"
      ? "整理后的问题单太薄，无法支撑下一步大纲。"
      : "The organized Question Sheet is too thin to support an outline.");
  }
  return text;
}

function buildQuestionSheetRetryPrompt({
  sourceName = "",
  sourceMarkdown = "",
  existing = "",
  context = "",
  badOutput = "",
  language = currentLanguage,
} = {}) {
  const spec = questionSheetSpec(language);
  const sourceLabel = sourceName || spec.title;
  const badSummary = clipContextContent(String(badOutput || ""), 1200);
  return [
    language === "zh"
      ? "你是 AI System 6 的写作规划助手。上一次整理失败，因为输出像提示词规则或元说明。请重新整理成真正可用于写作流程的问题单。"
      : "You are an AI System 6 writing planner. The previous organization failed because the output looked like prompt rules or meta instructions. Rewrite it into a real Question Sheet for the writing workflow.",
    "",
    language === "zh"
      ? "输出必须是用户会保存并继续用于大纲的问题单，不是摘要、正文、建议清单或提示词说明。"
      : "The output must be a Question Sheet a user would save and use for an outline, not a summary, draft, suggestion list, or prompt note.",
    language === "zh"
      ? "硬性要求：输出必须以 `## 主题` 或 `# 标题` 后接 `## 主题` 开始；不要出现“固定语义 / 输入来源 / 现有问题单 / 项目上下文 / 使用这些栏目 / 只返回完整的问题单 Markdown / 不要解释”等提示词说明；只写用户会保存并继续用于大纲的问题单。"
      : "Hard rule: start with `## Topic` or a title followed by `## Topic`; do not include prompt instructions such as Fixed semantics, Input source, Existing Question Sheet, Project context, Use these sections, Return the full Question Sheet Markdown only, or No explanation; write only the Question Sheet a user would save and use for an outline.",
    "",
    language === "zh" ? `输入来源：${sourceLabel}` : `Input source: ${sourceLabel}`,
    sourceMarkdown || spec.emptyMarker,
    "",
    language === "zh" ? "现有问题单：" : "Existing Question Sheet:",
    existing || spec.emptyMarker,
    "",
    context ? (language === "zh" ? "项目上下文（已压缩去重，用来提出更有效的问题）：" : "Project context (compressed and deduplicated, for better questions):") : "",
    context,
    "",
    badSummary ? (language === "zh" ? "上一次失败输出摘要（不要照抄）：" : "Previous failed output excerpt (do not copy):") : "",
    badSummary,
  ].join("\n");
}

function buildQuestionSheetRetryMessages(options = {}) {
  const retryPrompt = buildQuestionSheetRetryPrompt(options);
  const language = options.language || currentLanguage;
  return [
    {
      role: "system",
      content: resolveWritingRoutePrompt("writing-route.question-sheet-retry", language),
    },
    { role: "user", content: retryPrompt },
  ];
}

function compactQuestionSheetPromptInput(markdown, limit = 1600) {
  const text = String(markdown || "").replace(/\r\n?/g, "\n").trim();
  if (text.length <= limit) return text;
  const lines = text.split("\n");
  const kept = [];
  const seen = new Set();
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) {
      if (kept.at(-1) !== "") kept.push("");
      continue;
    }
    if (/^(Context before|Context after|Time|Site):/i.test(clean)) continue;
    const key = clean.replace(/\d+/g, "#").slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
    if (kept.join("\n").length >= limit) break;
  }
  const compact = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return clipContextContent(compact || text, limit);
}

async function organizeQuestionSheetCore(options = {}) {
  const sourceMarkdown = String(options.sourceMarkdown ?? questionSheetBodyInput?.value ?? "").trim();
  if (!sourceMarkdown) throw new Error(t("question_sheet_hint"));
  const taskId = options.taskId || "organize-question-sheet";
  const statusLabel = options.statusLabel || t("organizing_question_sheet");
  const modelName = options.modelName || getLocalModelRequestName();
  const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, options.maxAttempts) : 2;
  if (!beginLongTask(taskId, statusLabel)) {
    throw new Error(t("task_already_running", localModelState?.task || t("working_locally")));
  }

  try {
    updateLocalModelState({ running: true, task: currentLanguage === "zh" ? "正在检索问题单上下文..." : "Retrieving Question Sheet context..." });
    const projectContext = options.context ?? await buildBudgetedProjectContext(sourceMarkdown, {
      budget: Number.isFinite(options.contextBudget) ? options.contextBudget : 9000,
      topK: Number.isFinite(options.contextTopK) ? options.contextTopK : 8,
      maxReferenceChunks: Number.isFinite(options.maxReferenceChunks) ? options.maxReferenceChunks : 8,
      maxCuratedContextItems: Number.isFinite(options.maxCuratedContextItems) ? options.maxCuratedContextItems : 4,
      itemLimit: Number.isFinite(options.contextItemLimit) ? options.contextItemLimit : 1000,
      taskKind: "organize-question-sheet",
    });
    updateLocalModelState({ running: true, task: statusLabel });
    const sourceForPrompt = options.compactSource === false
      ? sourceMarkdown
      : compactQuestionSheetPromptInput(sourceMarkdown, Number.isFinite(options.sourceBudget) ? options.sourceBudget : 1600);
    const baseMessages = buildQuestionSheetRewriteMessages({
      sourceName: options.sourceName || t("question_sheet"),
      sourceMarkdown: sourceForPrompt,
      existing: options.existing || "",
      context: projectContext || "No relevant project context selected yet.",
    });
    const requestTimeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 90000;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const messages = attempt === 0
        ? baseMessages
        : buildQuestionSheetRetryMessages({
          sourceName: options.sourceName || t("question_sheet"),
          sourceMarkdown: sourceForPrompt,
          existing: options.existing || "",
          context: projectContext || "No relevant project context selected yet.",
          badOutput: lastError?.badOutput || "",
        });
      const attemptLabel = attempt === 0
        ? statusLabel
        : (currentLanguage === "zh" ? "正在重试整理问题单..." : "Retrying Question Sheet organization...");
      updateLocalModelState({ running: true, task: `${attemptLabel} ${currentLanguage === "zh" ? `上下文约 ${projectContext.length} 字。` : `Context ~${projectContext.length} chars.`}` });
      const controller = new AbortController();
      const longTaskSignal = getLongTaskSignal();
      const abortFromLongTask = () => controller.abort();
      if (longTaskSignal) {
        if (longTaskSignal.aborted) controller.abort();
        else longTaskSignal.addEventListener("abort", abortFromLongTask, { once: true });
      }
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      let response;
      try {
        response = await fetchModelPayload({
          model: modelName,
          // Photographed notes are raw input: the model reads what the writer
          // scribbled, and the sheet's own sections are unchanged by it.
          messages: attachImagesToModelMessages(
            withMarkdownModelMessages(messages),
            getQuestionSheetPhotos()
          ),
          temperature: attempt === 0
            ? (Number.isFinite(options.temperature) ? options.temperature : 0.25)
            : (Number.isFinite(options.retryTemperature) ? options.retryTemperature : 0.12),
          max_tokens: Number.isFinite(options.maxTokens) ? options.maxTokens : 420,
          ai_system6_task_kind: "organize-question-sheet",
        }, controller.signal);
      } catch (error) {
        if (controller.signal.aborted && !longTaskSignal?.aborted) {
          throw new Error(currentLanguage === "zh"
            ? `整理问题单超时：${Math.round(requestTimeoutMs / 1000)} 秒内没有返回。请减少重复材料或换用更快模型后重试。`
            : `Question Sheet organization timed out after ${Math.round(requestTimeoutMs / 1000)}s. Reduce duplicated material or use a faster model and retry.`);
        }
        throw error;
      } finally {
        clearTimeout(timer);
        if (longTaskSignal) longTaskSignal.removeEventListener("abort", abortFromLongTask);
      }
      const data = await readChatJson(response);
      const finishReason = data?.choices?.[0]?.finish_reason || data?.stop_reason || "";
      const organized = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
      try {
        updateLocalModelState({ running: true, task: currentLanguage === "zh" ? "正在校验问题单输出..." : "Validating Question Sheet output..." });
        const validated = validateOrganizedQuestionSheet(organized);
        if (String(finishReason).toLowerCase() === "length" && /(?:[,，、:：;；（(]|\b(?:and|or|the|to|of))\s*$/i.test(validated)) {
          throw new Error(currentLanguage === "zh"
            ? "整理问题单失败：模型输出疑似半截，请降低输出长度或提高输出预算后重试。"
            : "Question Sheet organization failed: model output appears truncated. Shorten the output or increase the output budget and retry.");
        }
        return validated;
      } catch (error) {
        lastError = error;
        lastError.badOutput = organized;
        if (attempt >= maxAttempts - 1) throw error;
      }
    }
    throw lastError || new Error(currentLanguage === "zh" ? "整理问题单失败。" : "Question Sheet organization failed.");
  } finally {
    endLongTask(taskId);
  }
}

function applyOrganizedQuestionSheet(organized, project = getActiveProject()) {
  const nextQuestionSheet = validateOrganizedQuestionSheet(organized);
  if (!project) throw new Error(t("no_project_mounted"));
  questionSheetBodyInput.value = nextQuestionSheet;
  project.questionSheet = nextQuestionSheet;
  project.flowState = { ...(project.flowState || {}), topic: true };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  refreshTeachTextSurfacePreview("questionSheet");
  renderPipeline();
  openWindow("questionSheet");
  questionSheetBodyInput.focus();
  return nextQuestionSheet;
}

async function organizeQuestionSheet() {
  await ensureWritingFlowModule();
  const project = getActiveProject();
  const questions = questionSheetBodyInput.value.trim();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  if (!questions) {
    setStatus(t("question_sheet_hint"));
    openWindow("questionSheet");
    questionSheetBodyInput.focus();
    return;
  }

  let organized = "";
  try {
    organized = await organizeQuestionSheetCore({ sourceMarkdown: questions });
  } catch (error) {
    if (!isAbortError(error)) {
      console.error("Organize question sheet failed", error);
      setStatus(currentLanguage === "zh"
        ? `整理问题失败：${error?.message || error}`
        : `Question Sheet organization failed: ${error?.message || error}`);
      try {
        await showSystemModal(currentLanguage === "zh"
          ? `整理问题失败：${error?.message || error}`
          : `Question Sheet organization failed: ${error?.message || error}`, "alert");
      } catch {
        // Keep the status text visible if the modal cannot open.
      }
    }
  }

  if (!organized) {
    clearStatus();
    return;
  }

  const preview = clipContextContent(organized, 1600);
  const result = await showSystemModal(t("organize_question_sheet_confirm", preview), "confirm");
  if (result !== "yes") {
    clearStatus();
    return;
  }

  try {
    applyOrganizedQuestionSheet(organized, project);
  } catch (error) {
    setStatus(currentLanguage === "zh"
      ? `整理问题失败：${error?.message || error}`
      : `Question Sheet organization failed: ${error?.message || error}`);
    return;
  }
  setStatus(t("question_sheet_organized"));
}

async function expandOutline() {
  await ensureWritingFlowModule();
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  savePipelineData();
  const outline = currentOutlineMarkdown(project).trim();
  if (!outline) {
    setStatus(t("outline_needs_content"));
    openWindow("outline");
    requestAnimationFrame(() => outlineContentEl?.focus());
    return;
  }

  if (!beginLongTask("expand-outline", t("expanding_outline"))) return;
  let content = "";
  try {
    await prepareStreamingMarkdownPreview();
    const questionSheet = (project.questionSheet || "").trim();
    const contextQuery = [questionSheet, outline].filter(Boolean).join("\n");
    const projectContext = await buildBudgetedProjectContext(contextQuery, { taskKind: "rewrite-outline" });
    const prompt = `${resolveWritingRoutePrompt("writing-route.outline-expand")}

QUESTION SHEET:
${questionSheet || "No Question Sheet provided."}

PROJECT CONTEXT:
${projectContext || "No relevant project context selected yet."}

CURRENT OUTLINE:
${outline}`;
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.7,
      ai_system6_task_kind: "expand-outline",
      stream: true,
    }, getLongTaskSignal());

    const streamedContent = await readModelTextStream(response, {
      signal: getLongTaskSignal(),
      throttleMs: 120,
      onSnapshot: (markdown) => showStreamingSurfacePreview("outline", stripRebuildMarkdownFence(markdown)),
    });
    content = stripRebuildMarkdownFence(streamedContent || "").trim();
    if (content) showStreamingSurfacePreview("outline", content, { final: true });
  } catch (error) {
    if (!isAbortError(error)) console.error("Expand outline failed", error);
  } finally {
    endLongTask("expand-outline");
  }

  if (!content) {
    clearStatus();
    return;
  }

  await confirmAndApplyAiOutline(content, "outline_fill_weak_confirm", "outline_filled_weak");
}

function getOutlineOperationContext(project) {
  const selection = getOutlineSelectionText();
  const outlineSections = getProjectOutlineSections(project);
  const outline = currentOutlineMarkdown(project).trim();
  return { selection, outlineSections, outline };
}

async function runOutlineOperation(mode) {
  if (mode === "mingming") await ensureMingmingLensModule();
  await ensureWritingFlowModule();
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }

  savePipelineData();
  const { outlineSections, outline } = getOutlineOperationContext(project);
  if (!outline) {
    setStatus(t("outline_needs_content"));
    openWindow("outline");
    requestAnimationFrame(() => outlineContentEl?.focus());
    return;
  }

  const statusByMode = {
    critique: "critiquing_outline",
    mingming: "mingming_outline_running",
    reduce: "reducing_outline",
    structure: "structuring_outline",
  };
  const taskKey = `outline-${mode}`;
  if (!beginLongTask(taskKey, t(statusByMode[mode] || "expanding_outline"))) return;

  let failed = false;
  let content = "";
  try {
    await prepareStreamingMarkdownPreview();
    const readerClipContext = getReaderClipOutlineContext(4000);
    const questionSheet = (project.questionSheet || "").trim();
    const contextQuery = [questionSheet, outline].filter(Boolean).join("\n");
    const projectContext = await buildBudgetedProjectContext(contextQuery, { taskKind: "review-outline" });
    const instructionIds = {
      critique: "writing-route.outline-critique",
      reduce: "writing-route.outline-reduce",
      structure: "writing-route.outline-structure",
    };
    const prompt = mode === "mingming"
      ? buildMingmingRewritePrompt({ questionSheet, readerClipContext, projectContext, outline })
      : `${resolveWritingRoutePrompt(instructionIds[mode])}

QUESTION SHEET:
${questionSheet || "No Question Sheet provided."}

READER CLIPS:
${readerClipContext || "No Reader clips saved yet."}

PROJECT CONTEXT:
${projectContext || "No relevant project context selected yet."}

CURRENT OUTLINE:
${outline}`;

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: mode === "critique" ? 0.35 : 0.45,
      max_tokens: mode === "mingming" ? 5200 : undefined,
      ai_system6_task_kind: mode === "mingming" ? "mingming_rewrite" : `outline_${mode}`,
      stream: true,
    }, getLongTaskSignal());

    const streamedContent = await readModelTextStream(response, {
      signal: getLongTaskSignal(),
      throttleMs: 120,
      onSnapshot: (markdown) => showStreamingSurfacePreview("outline", stripRebuildMarkdownFence(markdown)),
    });
    content = stripRebuildMarkdownFence(streamedContent || "").trim();
    if (!content) return;
    showStreamingSurfacePreview("outline", content, { final: true });

    if (mode === "critique") {
      project.outlineCritique = content;
      markTeachTextAiAssisted();
      project.flowState = { ...(project.flowState || {}), outline: true };
      project.updatedAt = new Date().toISOString();
      saveDeskState();
      updateFlowGuideChecklist({ render: false });
      renderPipeline();
      openWindow("outline");
    }
  } catch (error) {
    failed = true;
    if (!isAbortError(error)) {
      console.error("Outline operation failed", error);
      setStatus(t("reader_error", error.message));
    }
  } finally {
    const cancelled = endLongTask(taskKey);
    if (!failed && !cancelled && mode === "critique") clearStatus();
  }

  if (!failed && mode !== "critique" && content) {
    const confirmKey = mode === "mingming" ? "mingming_outline_confirm" : "outline_structure_confirm";
    const statusKey = mode === "mingming" ? "mingming_outline_done" : "outline_structured";
    await confirmAndApplyAiOutline(content, confirmKey, statusKey);
  }
}

async function confirmAndApplyAiOutline(markdown, confirmKey, statusKey) {
  const project = getActiveProject();
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return false;
  }

  const nextOutline = stripRebuildMarkdownFence(markdown).trim();
  if (!nextOutline) return false;
  const preview = clipContextContent(nextOutline, 1800);
  const result = await showSystemModal(t(confirmKey, preview), "confirm");
  if (result !== "yes") {
    clearStatus();
    return false;
  }

  const outlineSections = setProjectOutlineMarkdown(project, nextOutline);
  project.outlineCritique = "";
  project.flowState = { ...(project.flowState || {}), outline: getMeaningfulOutlineSections(outlineSections).length > 0 };
  project.updatedAt = new Date().toISOString();
  markTeachTextAiAssisted();
  syncDraftsFromProjectOutline(project);
  syncLinkedTeachTextFromProject(project);
  saveDeskState();
  updateFlowGuideChecklist({ render: false });
  renderPipeline();
  openWindow("outline");
  setStatus(t(statusKey));
  requestAnimationFrame(() => outlineContentEl?.focus());
  return true;
}

async function polishDraft() {
  await ensureWritingFlowModule();
  const context = currentSectionDraftContext({ ensureDraft: true });
  if (!context) {
    setStatus(t("section_draft_needs_section"));
    openWindow("outline");
    return;
  }
  const body = draftBodyInput.value.trim();
  if (!body) {
    setStatus(t("draft_needs_content"));
    openWindow("sectionDrafts");
    requestAnimationFrame(() => draftBodyInput?.focus());
    return;
  }

  if (!beginLongTask("polish-draft", t("polishing_draft"))) return;
  let content = "";
  try {
    await prepareStreamingMarkdownPreview();
    const questionSheet = (context.project.questionSheet || "").trim();
    const projectContext = await buildBudgetedProjectContext([questionSheet, context.outlineMarkdown, body].filter(Boolean).join("\n\n"), { taskKind: "polish-section" });
    const eli5Block = typeof writingStudioEli5Block === "function" ? writingStudioEli5Block() : "";
    const prompt = `${resolveWritingRoutePrompt("writing-route.section-polish")}

QUESTION SHEET:
${questionSheet || "No Question Sheet provided."}

PROJECT CONTEXT:
${projectContext || "No relevant project context selected yet."}

CURRENT SECTION:
${context.title}

SECTION OUTLINE:
${context.outlineMarkdown || context.outlineBody || context.title}

CURRENT DRAFT:
${body}${eli5Block ? `\n\n${eli5Block}` : ""}`;
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.3,
      ai_system6_task_kind: "polish-draft",
      stream: true,
    }, getLongTaskSignal());

    const streamedContent = await readModelTextStream(response, {
      signal: getLongTaskSignal(),
      throttleMs: 120,
      onSnapshot: (markdown) => showStreamingSurfacePreview("sectionDrafts", stripRebuildMarkdownFence(markdown)),
    });
    content = stripRebuildMarkdownFence(streamedContent || "").trim();
    if (content) showStreamingSurfacePreview("sectionDrafts", content, { final: true });
  } catch (error) {
    if (!isAbortError(error)) console.error("Polish draft failed", error);
  } finally {
    endLongTask("polish-draft");
  }

  if (!content) {
    clearStatus();
    return;
  }

  await confirmAndApplySectionDraft(content, "polish_replace_confirm", "section_draft_polished");
}

async function suggestDraft() {
  await ensureWritingFlowModule();
  const context = currentSectionDraftContext({ ensureDraft: true, seedBody: true });
  if (!context) {
    setStatus(t("section_draft_needs_section"));
    openWindow("outline");
    return;
  }

  if (!beginLongTask("suggest-draft", t("suggesting_draft"))) return;
  let content = "";
  try {
    await prepareStreamingMarkdownPreview();
    const questionSheet = (context.project.questionSheet || "").trim();
    const currentDraft = String(draftBodyInput.value || context.body || "").trim();
    const projectContext = await buildBudgetedProjectContext([questionSheet, context.outlineMarkdown, currentDraft].filter(Boolean).join("\n\n"), { taskKind: "review-section" });
    const eli5Block = typeof writingStudioEli5Block === "function" ? writingStudioEli5Block() : "";
    const prompt = `${resolveWritingRoutePrompt("writing-route.section-suggest")}

QUESTION SHEET:
${questionSheet || "No Question Sheet provided."}

PROJECT CONTEXT:
${projectContext || "No relevant project context selected yet."}

CURRENT SECTION:
${context.title}

SECTION OUTLINE:
${context.outlineMarkdown || context.outlineBody || context.title}

CURRENT DRAFT:
${currentDraft || "No draft yet. Give planning suggestions for starting this section."}${eli5Block ? `\n\n${eli5Block}` : ""}`;
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.35,
      ai_system6_task_kind: "suggest-draft",
      stream: true,
    }, getLongTaskSignal());

    const streamedContent = await readModelTextStream(response, {
      signal: getLongTaskSignal(),
      throttleMs: 120,
      onSnapshot: (markdown) => showStreamingSurfacePreview("sectionDrafts", stripRebuildMarkdownFence(markdown)),
    });
    content = stripRebuildMarkdownFence(streamedContent || "").trim();
    if (content) showStreamingSurfacePreview("sectionDrafts", content, { final: true });
  } catch (error) {
    if (!isAbortError(error)) console.error("Suggest draft failed", error);
  } finally {
    endLongTask("suggest-draft");
  }

  if (!content) {
    clearStatus();
    return;
  }

  const preview = clipContextContent(content, 1800);
  const result = await showSystemModal(t("suggest_append_confirm", preview), "confirm");
  if (result !== "yes") {
    clearStatus();
    return;
  }

  applySectionDraftMarkdown(content, { append: true, ai: true, statusKey: "section_draft_suggested" });
}

function getClaimCheckWritingObjectContext(project = getActiveProject()) {
  const parts = [];
  if (currentDocMap) {
    parts.push([
      "## Current DocMap",
      clipContextContent(formatDocMapMarkdown(currentDocMap), 3200),
    ].join("\n\n"));
  }

  const files = getProjectFiles(project)
    .filter((file) => file.type === "text" && String(file.body || "").trim())
    .filter((file) => /docmap|claim|事实|核查|writing object pack/i.test(file.name || ""))
    .slice(0, 4);

  files.forEach((file) => {
    parts.push([
      `## ${file.name}`,
      clipContextContent(file.body, 2200),
    ].join("\n\n"));
  });

  return parts.join("\n\n---\n\n");
}

function claimCheckScopeLabel(scope) {
  if (scope?.type === "section") return scope.label || t("claim_check_section");
  return t("claim_scope_manuscript");
}

function claimCheckQueryText(body) {
  const documentModel = parseMarkdownDocument(body);
  const headings = documentModel.headings.map((heading) => heading.text).filter(Boolean).slice(0, 8);
  const claims = inferRebuildClaims(getRebuildParagraphs(body)).slice(0, 10);
  return [
    markdownDocumentTitle(body),
    headings.length ? `Headings:\n${headings.map((item) => `- ${item}`).join("\n")}` : "",
    claims.length ? `Likely claims:\n${claims.map((item) => `- ${item}`).join("\n")}` : "",
    clipContextContent(documentModel.plainText || body, 1800),
  ].filter(Boolean).join("\n\n");
}

/**
 * Pull up to four checkable claims out of a manuscript/section body. Prefers
 * paragraphs when the body has them, otherwise falls back to sentence splits.
 *
 * @param {string} body
 * @returns {string[]}
 */
function extractOnlineCheckClaims(body) {
  const paragraphs = String(body || "")
    .split(/\n+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 20);
  const candidates = paragraphs.length >= 3
    ? paragraphs
    : String(body || "")
        .split(/(?<=[。！？.!?])\s+/)
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter((item) => item.length > 20);
  return candidates
    .filter((candidate) => onlineClaimPattern.test(candidate))
    .slice(0, 4)
    .map((candidate) => shortClaimText(candidate, currentLanguage === "zh" ? 120 : 160));
}

/**
 * Parse the leading verdict line the claim-mode instructions require. Unknown
 * or missing shapes fall back to "needs manual review" rather than inventing
 * a verdict.
 *
 * @param {string} answer
 * @returns {string}
 */
function onlineClaimVerdict(answer) {
  const match = String(answer || "").match(/结论[：:]\s*(支持|可能矛盾|证据不足|需人工核实|部分支持)/);
  const verdict = match ? match[1] : "";
  if (verdict === "支持") return t("claim_verdict_supported");
  if (verdict === "可能矛盾") return t("claim_verdict_contradiction");
  if (verdict === "证据不足") return t("claim_verdict_insufficient");
  if (verdict === "部分支持") return t("claim_verdict_partial");
  return t("claim_verdict_manual");
}

/**
 * Map the schema-enforced verdict enum from claim mode to the localized label.
 * Unknown values fall back to manual review instead of inventing a verdict.
 *
 * @param {string} conclusion
 * @returns {string}
 */
function onlineClaimVerdictFromEnum(conclusion) {
  const labels = {
    supported: "claim_verdict_supported",
    possible_contradiction: "claim_verdict_contradiction",
    evidence_insufficient: "claim_verdict_insufficient",
    partially_supported: "claim_verdict_partial",
    needs_manual_review: "claim_verdict_manual",
  };
  return t(labels[conclusion] || "claim_verdict_manual");
}

/**
 * One claim -> one server-side web_search answer in claim mode.
 *
 * @param {string} claim
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ answer: string, citations: Array<{ url: string, title: string }> }>}
 */
async function fetchOnlineClaimVerdict(claim, signal) {
  const response = await window.AISystem6Capabilities.requestService("search.remote", {
    path: "/api/search/answer",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: claim,
        mode: "claim",
        ...cloudCredentialTransportFields(),
      }),
      signal,
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/**
 * Render per-claim online verification cards into the Review Desk facts pane.
 * The report is temporary model output: each card carries the same
 * "open the source in Reader before relying on it" boundary as Searcher.
 *
 * @param {Array<{ claim: string, verdict: string, answer: string, citations: Array<{ url: string, title: string }> }>} results
 * @param {{ type?: string, label?: string }} [scope]
 */
function renderOnlineClaimResults(results, scope = {}) {
  claimResultsEl.classList.remove("is-hidden");
  claimResultsEl.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = t("claim_check_online_title");
  const meta = document.createElement("p");
  meta.className = "empty-folder-note";
  meta.textContent = `${t("claim_check_online_scope")}: ${scope.label || t("claim_scope_manuscript")}`;
  const note = document.createElement("p");
  note.className = "empty-folder-note";
  note.textContent = t("claim_check_online_note");
  claimResultsEl.append(title, meta, note);

  results.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "context-item";
    const claim = document.createElement("strong");
    claim.textContent = entry.claim;
    const verdict = document.createElement("p");
    verdict.textContent = `${t("claim_verdict_label")}: ${entry.verdict}`;
    const answer = document.createElement("p");
    answer.textContent = entry.answer;
    card.append(claim, verdict, answer);
    (entry.citations || []).forEach((citation) => {
      if (!citation.url) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn mini-btn citation-btn";
      button.textContent = citation.title || citation.url;
      button.addEventListener("click", () => openOnlineCitationInReader(citation.url));
      card.append(button);
    });
    claimResultsEl.append(card);
  });
  markClaimCheckComplete(results);
}

function openOnlineCitationInReader(url) {
  return openClioWebCitationInReader(url);
}

async function runClaimCheck(options = {}) {
  if (!ensureTeachTextReviewState({ promoteSavedFinal: true })) return;
  const fullBody = teachTextBodyInput.value.trim();
  if (!fullBody) {
    setStatus(t("teachtext_empty"));
    return;
  }

  const sectionOnly = options.sectionOnly === true;
  const section = sectionOnly ? selectedClaimCheckSection() : null;
  if (sectionOnly && !section?.text) {
    setStatus(t("claim_section_empty"));
    renderClaimCheckSections();
    return;
  }
  const body = sectionOnly ? section.text : fullBody;
  const scope = sectionOnly
    ? { type: "section", label: section.title, index: section.index }
    : { type: "manuscript", label: t("claim_scope_manuscript") };
  currentClaimCheckScope = scope;
  const taskKey = sectionOnly ? "claim-check-section" : "claim-check";
  const runningLabel = sectionOnly ? t("running_section_check", section.title) : t("running_check");
  currentClaimCheckFileId = activeTextFileId || "";

  if (!beginLongTask(taskKey, runningLabel)) return;
  openReviewDesk("facts");
  setClaimCheckWaiting(sectionOnly ? t("claim_check_scanning_section", section.title) : t("claim_check_scanning"));

  try {
    if (options.online === true) {
      const claims = extractOnlineCheckClaims(body);
      if (!claims.length) {
        claimResultsEl.innerHTML = `<div class="empty-folder-note">${escapeHtml(t("claim_check_online_none"))}</div>`;
        setStatus(t("claim_check_online_none"));
        return;
      }
      const results = [];
      for (let index = 0; index < claims.length; index += 1) {
        setClaimCheckWaiting(t("claim_check_online_checking", index + 1, claims.length));
        const data = await fetchOnlineClaimVerdict(claims[index], getLongTaskSignal());
        const verdict = data?.verdict?.conclusion
          ? onlineClaimVerdictFromEnum(data.verdict.conclusion)
          : onlineClaimVerdict(data.answer);
        const citations = Array.isArray(data.citations) && data.citations.length
          ? data.citations
          : Array.isArray(data?.verdict?.sources)
            ? data.verdict.sources.map((url) => ({ url, title: url }))
            : [];
        results.push({
          claim: claims[index],
          verdict,
          answer: String(data.answer || ""),
          citations,
        });
      }
      setClaimCheckWaiting(t("claim_check_online_rendering"));
      renderOnlineClaimResults(results, currentClaimCheckScope);
      setStatus(t("claim_check_online_done"));
      return;
    }

    setClaimCheckWaiting(sectionOnly ? t("claim_check_retrieving_section", section.title) : t("claim_check_retrieving"));
    const queryText = claimCheckQueryText(body);
    const context = await buildBudgetedProjectContext(queryText, {
      budget: Math.min(maxPipelineContextChars, 12000),
      topK: Math.min(maxPipelineReferenceChunks, 8),
      maxCuratedContextItems: 4,
      itemLimit: 1800,
      taskKind: "claim-check",
    });
    claimCitationContextItems = lastRetrievedContextItems.map((contextItem) => ({ ...contextItem }));
    const writingObjectContext = getClaimCheckWritingObjectContext();
    const sourceCount = claimCitationContextItems.filter((item) => item.included !== false && !item.excluded).length;
    setClaimCheckWaiting(sectionOnly ? t("claim_check_generating_section", sourceCount, section.title) : t("claim_check_generating", sourceCount));

    const prompt = `You are a forensic fact-checking editor for AI System 6.
Verify the factual claims in the ${sectionOnly ? `selected TeachText section "${section.title}"` : "TeachText manuscript"} against the verification sources.
Return Markdown only. Do not return JSON.

Rules:
- Use only citation IDs that appear in VERIFICATION SOURCES, such as [S1], [S1:2], [M1], or [R2].
- Do not invent citation IDs.
- DocMap and Fact Queue are planning context. They may suggest what to inspect, but they are not evidence unless they cite a verification source.
- Extract concrete checkable claims first. Check each claim separately.
- If a claim is not supported by the verification sources, mark it "证据不足 / Evidence Insufficient".
- If a source appears to contradict the manuscript, mark it "可能矛盾 / Possible Contradiction".
- If a claim is too subjective or not factual, mark it "不需核查 / Not factual" and suggest tightening only if needed.
- Quote short evidence snippets from sources when available.
- If this is a section check, do not imply that the whole manuscript has been checked.
- Do not summarize vaguely. Prefer a row-by-row claim table.
- Write in ${currentLanguage === "zh" ? "Chinese" : "English"}.

Required Markdown format:
# ${currentLanguage === "zh" ? "事实核查报告" : "Claim Check Report"}

## ${currentLanguage === "zh" ? "核查范围" : "Scope"}
- ${currentLanguage === "zh" ? "核查对象：" : "Checked text:"}
- ${currentLanguage === "zh" ? "可用来源数量：" : "Available source count:"}
- ${currentLanguage === "zh" ? "限制：" : "Limit:"} ${currentLanguage === "zh" ? "只基于当前项目内来源，不联网，不凭常识补证据。" : "Project sources only; no web lookup and no evidence from model memory."}

## ${currentLanguage === "zh" ? "逐条主张核查" : "Claim-by-Claim Check"}
| ${currentLanguage === "zh" ? "位置" : "Location"} | ${currentLanguage === "zh" ? "主张" : "Claim"} | ${currentLanguage === "zh" ? "类型" : "Type"} | ${currentLanguage === "zh" ? "证据" : "Evidence"} | ${currentLanguage === "zh" ? "状态" : "Status"} | ${currentLanguage === "zh" ? "建议" : "Suggestion"} |
|---|---|---|---|---|---|
| ${currentLanguage === "zh" ? "段落/句子" : "Paragraph/sentence"} | ${currentLanguage === "zh" ? "可核查主张" : "Checkable claim"} | ${currentLanguage === "zh" ? "数字/时间/人物/因果/绝对化/引用/其他" : "number/date/person/causal/absolute/quote/other"} | ${currentLanguage === "zh" ? "短证据 + 来源 ID，或“无”" : "short evidence + source ID, or None"} | ${currentLanguage === "zh" ? "已支持/证据不足/可能矛盾/不需核查" : "Supported/Evidence Insufficient/Possible Contradiction/Not factual"} | ${currentLanguage === "zh" ? "保留、补来源、弱化、删去或改写方向" : "keep, add source, soften, remove, or revision direction"} |

## ${currentLanguage === "zh" ? "优先处理" : "Priorities"}
- ${currentLanguage === "zh" ? "列出最需要作者处理的 1-3 个风险。" : "List the 1-3 issues the author should handle first."}

CHECK SCOPE:
${sectionOnly ? `Selected section: ${section.title}` : "Full TeachText manuscript"}

WRITING OBJECT CONTEXT:
${writingObjectContext || "No DocMap or fact queue saved for this project."}

VERIFICATION SOURCES:
${context || "No verification sources were found in the current Project Disk."}

${sectionOnly ? "TEACHTEXT SECTION:" : "TEACHTEXT MANUSCRIPT:"}
${body}`;

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      // A claim can rest on a figure. Only figures the draft cites are sent.
      messages: attachImagesToModelMessages(
        withMarkdownModelMessages([{ role: "user", content: prompt }]),
        teachTextFiguresReferencedIn(body)
      ),
      temperature: 0.1,
      max_tokens: 3000,
      ai_system6_task_kind: "critique",
      stream: true,
    }, getLongTaskSignal());

    let lastPreviewAt = 0;
    const content = await readRebuildMarkdownPackStream(response, (markdown) => {
      const now = Date.now();
      if (now - lastPreviewAt < 360) return;
      lastPreviewAt = now;
      setStatus(t("claim_check_receiving", markdown.length));
      renderClaimCheckDraft(markdown);
    });
    renderClaimResults(stripRebuildMarkdownFence(content));
  } catch (error) {
    if (!isAbortError(error)) {
      console.error("Claim check failed", error);
      const message = t("claim_check_error", error.message);
      claimResultsEl.innerHTML = `<div class="empty-folder-note">${message}</div>`;
      setStatus(message);
    }
  } finally {
    endLongTask(taskKey);
  }
}

function markClaimCheckComplete(results = []) {
  const project = getActiveProject();
  if (!project) return;
  const scope = currentClaimCheckScope || { type: "manuscript", label: "" };
  project.flowState = {
    ...(project.flowState || {}),
    check: scope.type === "manuscript" ? true : project.flowState?.check === true,
  };
  project.lastClaimCheck = {
    checkedAt: new Date().toISOString(),
    scope: scope.type,
    sectionTitle: scope.type === "section" ? scope.label : "",
    resultCount: Array.isArray(results) ? results.length : 0,
  };
  project.updatedAt = new Date().toISOString();
  saveDeskState();
  // Review Desk / Claim Check is the one producer of Finder Label suggestions:
  // it already read the whole manuscript and emitted structured risk. The
  // suggestion is written to the separate finderLabelSuggestion field (lazy
  // module, kept out of the boot bundle); the user adopts it in Get Info.
  if (typeof ensureHkrrReviewModule === "function") {
    ensureHkrrReviewModule().then(() => {
      suggestFinderLabelForClaimCheck(results, claimResultsEl?.innerText || "", currentClaimCheckFileId);
    });
  }
  setStatus(scope.type === "section" ? t("claim_section_check_done", claimCheckScopeLabel(scope)) : t("claim_check_done"));
}

function openSourceForContextItem(contextItem) {
  if (contextItem?.kind === "scrap") {
    const scrap = scraps.find((item) => item.id === contextItem.id && isInActiveProject(item));
    if (scrap && canOpenScrapSource(scrap)) {
      const contract = sourceContractForScrap(scrap);
      if (contract.kind === "readerClip" && contract.url) {
        readerUrlInput.value = contract.url;
        openWindow("reader");
        fetchReaderPage(contract.url);
        return;
      }
      if (contract.kind === "documentClip" && contract.fileId) {
        openTextFile(contract.fileId);
        return;
      }
    }
  }
  openCitationContextItem(contextItem);
}

function normalizeClaimSearchText(text) {
  return String(text || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jumpToTeachTextClaim(claim) {
  const text = teachTextBodyInput.value;
  const normalizedClaim = normalizeClaimSearchText(claim);
  if (!text.trim() || !normalizedClaim) {
    setStatus(t("claim_jump_missing"));
    return;
  }

  const candidates = [
    String(claim || "").trim(),
    normalizedClaim,
    normalizedClaim.split(/[.;。！？!?]/)[0]?.trim(),
    normalizedClaim.slice(0, 120).trim(),
  ].filter((item, index, arr) => item && item.length > 8 && arr.indexOf(item) === index);

  let start = -1;
  let found = "";
  for (const candidate of candidates) {
    start = text.indexOf(candidate);
    if (start >= 0) {
      found = candidate;
      break;
    }
  }

  if (start < 0) {
    const lowerText = text.toLowerCase();
    for (const candidate of candidates) {
      start = lowerText.indexOf(candidate.toLowerCase());
      if (start >= 0) {
        found = text.slice(start, start + candidate.length);
        break;
      }
    }
  }

  if (start < 0) {
    setStatus(t("claim_jump_missing"));
    return;
  }

  openWindow("teachText");
  teachTextBodyInput.focus();
  teachTextBodyInput.selectionStart = start;
  teachTextBodyInput.selectionEnd = start + found.length;
  clearStatus();
}

function renderClaimResults(markdown) {
  claimResultsEl.innerHTML = markdownToSystemHtml(markdown);

  // Make REF IDs interactive (S for Scrapbook, D for File Floppy)
  let content = claimResultsEl.innerHTML;

  // Replace [REF-S-...]
  content = content.replace(/\[REF-S-([a-z0-9-]+)\]/gi, (match, id) => {
    return `<button class="btn mini-btn citation-btn" data-type="scrap" data-id="${id}">${match}</button>`;
  });

  // Replace [REF-D-...]
  content = content.replace(/\[REF-D-(\d+)\]/gi, (match, index) => {
    return `<button class="btn mini-btn citation-btn" data-type="disk" data-index="${index}">${match}</button>`;
  });

  content = content.replace(/\[([MR])(\d+)\]/gi, (match, prefix, index) => {
    return `<button class="btn mini-btn citation-btn" data-type="context" data-prefix="${prefix.toUpperCase()}" data-index="${index}">${match}</button>`;
  });

  content = content.replace(/\[S\d+(?::\d+)?\]/gi, (match) => {
    return `<button class="btn mini-btn citation-btn" data-type="source-ref" data-ref="${escapeHtml(match)}">${match}</button>`;
  });

  claimResultsEl.innerHTML = content;

  // Add listeners
  claimResultsEl.querySelectorAll(".citation-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      if (type === "scrap") {
        const scrapId = btn.dataset.id;
        const scrap = scraps.find(s => s.id === scrapId);
        if (scrap) {
          selectedScrapId = scrapId;
          // Try to find URL for Reader
          const urlMatch = scrap.body.match(/URL:\s*(https?:\/\/\S+)/i);
          if (urlMatch) {
            readerUrlInput.value = urlMatch[1];
            openWindow("reader");
            fetchReaderPage(urlMatch[1]);
          } else {
            openWindow("scrapbook");
            renderScraps();
          }
        }
      } else if (type === "disk") {
        const index = parseInt(btn.dataset.index, 10);
        const chunks = getMountedTextDiskChunks();
        const chunk = chunks[index];
        if (chunk) {
          selectedMountedFile = chunk.source;
          openWindow("textDisk");
          renderMountedTextDisk();
          openMountedTextFile(chunk.source);
        }
      } else if (type === "context") {
        openCitationContextItem(resolveCitationRef(`[${btn.dataset.prefix}${btn.dataset.index}]`));
      } else if (type === "source-ref") {
        openCitationContextItem(resolveCitationRef(btn.dataset.ref));
      }
    });
  });
  markClaimCheckComplete();
  updateFlowGuideChecklist({ render: false });
}
