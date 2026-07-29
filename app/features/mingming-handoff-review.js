// Feature module: Luoluo receiving-mode handoff review.
//
// Loaded lazily from Review Desk. Keeps the external handoff card separate from
// the backstage review so the recipient sees less while the creator keeps the
// factual and structural guardrails.

const MINGMING_HANDOFF_CARD_HEADINGS = new Set([
  "给落落看的 30 秒版",
  "一句话交稿",
  "必须守住",
  "30-Second Version for Luoluo",
  "One-Line Handoff",
  "Must Preserve",
]);

function normalizeMingmingHandoffMode(mode = "card") {
  return mode === "backstage" ? "backstage" : "card";
}

function buildMingmingHandoffReviewPrompt({
  language = "zh",
  mode = "card",
  sectionTitle = "",
  sectionText = "",
  fullContext = "",
  questionSheet = "",
  projectContext = "",
} = {}) {
  const isZh = language === "zh";
  const normalizedMode = normalizeMingmingHandoffMode(mode);
  const isBackstage = normalizedMode === "backstage";
  const titleLine = sectionTitle ? `${isZh ? "当前章节：" : "Current section:"} ${sectionTitle}` : "";
  const promptContract = resolveWritingRoutePrompt("other-apps.mingming-handoff", language);
  const modeInstructions = [promptContract, isBackstage
    ? (isZh
      ? [
          "输出模式：交付后台审校。",
          "这是给 Aaron/创作者自己看的后台备忘，不是外发给接收者的短卡；不要自动复制，也不要写成给对方看的说明。",
          "可以使用 HKRR、落落接收视角、可删地图和事实护栏，但所有判断都必须服务于降低交付摩擦，不评判对方。",
          "后台模式可以指出不能删、容易被顺手删、可以退让的部分，但语气要保护创作信心。"
        ]
      : [
          "Output mode: backstage handoff review.",
          "This is a backstage note for Aaron/the creator, not the external card for the recipient; do not make it sound like a message to send.",
          "You may use HKRR, Luoluo's receiving mode, deletion mapping, and factual guardrails, but every judgment must reduce handoff friction rather than judge the other person.",
          "The backstage mode may identify what cannot be deleted, what may be casually deleted, and what can be conceded, while protecting creative confidence."
        ])
    : (isZh
      ? [
          "输出模式：外发短卡（默认）。",
          "你可以在内部使用落落接收视角、HKRR、事实护栏和可删地图做判断，但不要把推理过程写出来。",
          "短卡模式禁止输出长报告、大表格、完整 HKRR 分析、forensic fact-check 表格、可删地图或后台审校。",
          "不要出现“AI 认为”“HKRR 显示”“我替你审了”“系统判断”“事实护栏”“后台审校”“可删地图”等工具感或后台术语。",
          "默认短卡会被复制给接收者；只能写轻、短、顺、低压力、可以直接发的内容。"
        ]
      : [
          "Output mode: external short card (default).",
          "You may internally use Luoluo's receiving mode, HKRR, factual guardrails, and deletion mapping, but do not show that reasoning process.",
          "Short-card mode must not output long reports, large tables, full HKRR analysis, forensic fact-check tables, deletion maps, or backstage review.",
          "Do not use tool-ish or backstage language such as 'the AI thinks', 'HKRR shows', 'I reviewed this for you', 'the system judges', 'fact guardrail', 'backstage review', or 'deletion map'.",
          "The default card will be copied for the recipient; write only light, short, smooth, low-pressure content that can be sent directly."
        ])].join("\n\n");
  const outputContract = isBackstage
    ? (isZh
      ? [
          "必须按以下 Markdown 结构输出，标题一字不改：",
          "",
          "## 先看见",
          "2-4 句具体情绪价值：这段稿子真正有价值的地方、作者在保护什么、为什么值得继续改。不要转折式夸奖。",
          "",
          "## 核心不能删",
          "列 2-4 条真正支撑稿件成立的核心句、事实或结构。每条说明为什么不能无替代删除。",
          "",
          "## 容易被顺手删的点",
          "列 2-4 条接收者可能因为顺口、太长、像论文或不好拍而误删的内容，并给更好接的处理方式。",
          "",
          "## HKRR 后台判断",
          "用 Happiness / Knowledge / Resonance / Rhythm 四项各写一句后台判断，只保留最关键观察。",
          "",
          "## 事实护栏",
          "只列 1-3 条必须守住的事实、机制或低级误导风险。无来源就标“待核”；需要证据引用时建议使用现有事实核查命令。",
          "",
          "## 可退让区域",
          "说明哪些细节、彩蛋、例子或表达可以删、可以放评论区、可以换成更口语的说法。",
          "",
          "## 下一步怎么交",
          "给当前创作者 2-4 条低压力交稿建议，不要评判对方，不要写私人关系判断。"
        ].join("\n")
      : [
          "Return exactly these Markdown headings:",
          "",
          "## First Notice",
          "2-4 specific encouragement sentences: what is valuable, what the writer is protecting, and why it is worth revising. No backhanded praise.",
          "",
          "## Must Not Delete",
          "List 2-4 core sentences, facts, or structural supports that make the piece work. Explain why each cannot be deleted without replacement.",
          "",
          "## Likely Casual Deletions",
          "List 2-4 items a recipient may remove because they feel long, essay-like, hard to film, or less smooth, with an easier receiving strategy.",
          "",
          "## HKRR Backstage Judgment",
          "Write one backstage sentence each for Happiness / Knowledge / Resonance / Rhythm. Keep only the key observation.",
          "",
          "## Fact Guardrails",
          "Only 1-3 facts, mechanisms, or low-level misleading risks to protect. Mark unsupported items as 待核; suggest the existing Fact Check command when evidence citations are needed.",
          "",
          "## Negotiable Area",
          "Say which details, bonus points, examples, or phrasings can be deleted, moved to comments, or made more colloquial.",
          "",
          "## Next Handoff Move",
          "Give the current creator 2-4 low-pressure handoff suggestions. Do not judge the other person or write private relationship analysis."
        ].join("\n"))
    : (isZh
      ? [
          "必须只按以下三个 Markdown 标题输出，标题一字不改；不要增加任何其他标题：",
          "",
          "## 给落落看的 30 秒版",
          "120-220 字，像真实交稿说明：先看见这段稿子的价值，再把主轴说清楚，语气轻、顺、少压力，不要像审稿报告。",
          "",
          "## 一句话交稿",
          "只写一句可以直接发送的低压力完整句，不能以冒号、破折号或“如下”结尾。",
          "",
          "## 必须守住",
          "必须使用 Markdown bullet，最多 1-3 条，每条一短句。只写事实、机制或不能误删的底线；无来源时每一条都必须写成“- 待核：……”。"
        ].join("\n")
      : [
          "Return only these three Markdown headings exactly; do not add any other headings:",
          "",
          "## 30-Second Version for Luoluo",
          "120-220 Chinese characters or 70-120 English words. Write like a real handoff note: first notice the value, then clarify the spine. Keep it light, smooth, low-pressure, and unlike a review report.",
          "",
          "## One-Line Handoff",
          "Only one complete low-pressure sentence that can be sent directly. Do not end with a colon, dash, or 'as follows'.",
          "",
          "## Must Preserve",
          "Use Markdown bullets. At most 1-3 short bullets. Include only facts, mechanisms, or must-not-delete guardrails; when unsupported, every item must be formatted as '- 待核: ...'."
        ].join("\n"));

  return [
    isZh
      ? "你是 AI System 6 的「若是落落会怎么接」顾问。你的任务不是重写全文，而是在作品交给真实接收者前，生成低压力、可接收、事实不翻车的交稿支持。"
      : "You are AI System 6's How Luoluo Would Receive It adviser. Your job is not to rewrite the full text, but to prepare low-pressure handoff support a real recipient can receive without losing factual guardrails.",
    "",
    isZh ? "双用户约束：" : "Dual-user constraint:",
    isZh
      ? "- 用户可能是 Aaron，也可能是落落本人；不要假设使用者身份。"
      : "- The user may be Aaron or Luoluo; do not assume who is using this.",
    isZh
      ? "- 不要输出私人合作判断、表白、道德审判、站队、第三方裁判或“你应该如何对待他”。"
      : "- Do not output private relationship judgments, confession-like language, moral judgment, faction framing, third-party refereeing, or advice about how one person should treat another.",
    isZh
      ? "- 只把喜欢、在乎或认真转译成：尊重、减负、保护创作信心、保护事实底线和降低交付摩擦。"
      : "- Translate care, affection, or seriousness only into respect, reduced burden, protected creative confidence, factual guardrails, and lower handoff friction.",
    isZh
      ? "- 先给足情绪价值，再给事实护栏；不要把输出写成冷冰冰的审稿意见。"
      : "- Lead with emotional value before factual guardrails; do not make the output feel like cold copyediting notes.",
    "",
    isZh ? "落落接收视角与 HKRR：" : "Luoluo receiving lens and HKRR:",
    isZh
      ? "- 代入落落的接收方式：他可能优先看读起来顺不顺、能不能拍、前两句有没有重点、会不会太像论文。"
      : "- Simulate Luoluo's receiving mode: he may first judge whether it reads smoothly, can be filmed, shows the point in the first two sentences, and avoids sounding like an essay.",
    isZh
      ? "- 用 HKRR 审视：Happiness=发现感/趣味/反直觉；Knowledge=信息增量/人话解释；Resonance=共鸣/人的感受；Rhythm=节奏/呼吸/停顿/转场。"
      : "- Use HKRR: Happiness=discovery/interest/counterintuition; Knowledge=information gain/plain explanation; Resonance=human feeling; Rhythm=breathing/pauses/transitions.",
    isZh
      ? "- 事实核查只做温柔事实护栏：必须守住的事实、机制或低级误导风险，并给更稳说法。不要输出 forensic fact-check 表格。"
      : "- Fact-checking here is only a gentle factual guardrail: facts, mechanisms, or low-level misleading risks to protect, with safer wording. Do not output a forensic fact-check table.",
    isZh
      ? "- 没有来源支持时，不得宣称已核实；请标成“待核”。需要证据引用时，应建议使用现有事实核查命令。"
      : "- Without source support, never claim verification; mark it as '待核'. If evidence citations are needed, suggest using the existing Fact Check command.",
    isZh
      ? "- 如果 PROJECT CONTEXT 没有明确来源支撑，所有事实护栏条目都必须逐条标“待核：”，不能只标其中一条。"
      : "- If PROJECT CONTEXT does not provide explicit source support, every factual guardrail item must be individually prefixed with '待核:'; do not mark only one item.",
    "",
    ...modeInstructions,
    "",
    outputContract,
    "",
    titleLine,
    "",
    isZh ? "QUESTION SHEET（接收者和交付摩擦语境）：" : "QUESTION SHEET (recipient and handoff friction context):",
    questionSheet || (isZh ? "（无）" : "(none)"),
    "",
    isZh ? "PROJECT CONTEXT（有限来源语境；不能替代事实核查）：" : "PROJECT CONTEXT (limited source context; not a substitute for fact-checking):",
    projectContext || (isZh ? "（无）" : "(none)"),
    "",
    isZh ? "CURRENT SECTION:" : "CURRENT SECTION:",
    sectionText,
    "",
    isZh ? "WHOLE MANUSCRIPT CONTEXT:" : "WHOLE MANUSCRIPT CONTEXT:",
    fullContext,
  ].join("\n");
}

function extractMingmingHandoffCard(markdown = "") {
  const chunks = [];
  let current = [];
  let isCapturing = false;
  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join("\n").trim());
    current = [];
  };

  String(markdown || "").split(/\r?\n/).forEach((line) => {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1]?.trim();
    if (heading) {
      flush();
      isCapturing = MINGMING_HANDOFF_CARD_HEADINGS.has(heading);
      current = isCapturing ? [line] : [];
      return;
    }
    if (isCapturing) current.push(line);
  });
  flush();
  return chunks.join("\n\n").trim();
}

function copyMingmingHandoffCardToClipboard(markdown = "") {
  const card = extractMingmingHandoffCard(markdown);
  if (!card || typeof setClipboard !== "function") return false;
  setClipboard(card, t("review_mingming_handoff"));
  navigator.clipboard?.writeText(card).catch(() => {});
  return true;
}

async function runMingmingHandoffReview(options = {}) {
  if (!ensureTeachTextReviewState({ promoteSavedFinal: true })) return;
  if (!syncReviewDeskToTeachText()) return;

  const mode = normalizeMingmingHandoffMode(options.mode);
  const isBackstage = mode === "backstage";
  const currentSection = currentReviewDeskSectionBlock() || null;
  const sectionText = (currentSection?.text || reviewDeskBodyInput?.value || "").trim();
  const fullContext = (teachTextBodyInput?.value || reviewDeskBodyInput?.value || "").trim();
  if (!sectionText) {
    setStatus(t("print_to_ai_empty"));
    openWindow("reviewDesk");
    return;
  }

  const runningLabel = isBackstage
    ? (currentLanguage === "zh" ? "正在生成交付后台审校..." : "Generating backstage handoff review...")
    : (currentLanguage === "zh" ? "正在生成若是落落会怎么接..." : "Generating How Luoluo Would Receive It...");
  const taskId = isBackstage ? "mingming-handoff-backstage-review" : "mingming-handoff-review";
  if (!beginLongTask(taskId, runningLabel)) return;
  setReviewDeskMode("facts");
  clearReviewFeedbackSlot("facts", runningLabel);
  openReviewDesk("facts");

  try {
    const questionSheet = String(questionSheetBodyInput?.value || getActiveProject()?.questionSheet || "").trim();
    let projectContext = "";
    try {
      projectContext = await buildBudgetedProjectContext([
        questionSheet,
        currentSection?.title || "",
        sectionText,
      ].filter(Boolean).join("\n\n"), {
        budget: 5000,
        topK: 5,
        maxReferenceChunks: 4,
        maxCuratedContextItems: 3,
        itemLimit: 900,
        taskKind: "mingming-handoff-review",
      });
    } catch (error) {
      projectContext = currentLanguage === "zh"
        ? `（项目上下文检索失败；本次不能宣称事实已核实：${error.message}）`
        : `(Project context retrieval failed; do not claim facts are verified: ${error.message})`;
    }

    const prompt = buildMingmingHandoffReviewPrompt({
      language: currentLanguage,
      mode,
      sectionTitle: currentSection?.title || "",
      sectionText: clampPrintToAiText(sectionText, 5200),
      fullContext: clampPrintToAiText(fullContext, 9000),
      questionSheet: clampPrintToAiText(questionSheet, 2600),
      projectContext: clipContextContent(projectContext, 5000),
    });

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: isBackstage ? 0.25 : 0.2,
      max_tokens: isBackstage ? 3200 : 1600,
      ai_system6_task_kind: isBackstage ? "mingming_handoff_backstage_review" : "mingming_handoff_card",
      stream: false,
    }, getLongTaskSignal());
    const data = await readChatJson(response);
    const content = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
    const visibleContent = isBackstage ? content : (extractMingmingHandoffCard(content) || content);
    appendReviewFeedbackToBody(visibleContent || (isBackstage
      ? (currentLanguage === "zh" ? "没有生成交付后台审校结果。" : "No backstage handoff review was generated.")
      : (currentLanguage === "zh" ? "没有生成若是落落会怎么接结果。" : "No How Luoluo Would Receive It result was generated.")));

    if (isBackstage) {
      setStatus(currentLanguage === "zh" ? "交付后台审校完成。" : "Backstage handoff review ready.");
    } else {
      const copied = copyMingmingHandoffCardToClipboard(visibleContent);
      setStatus(copied
        ? (currentLanguage === "zh" ? "交付卡已生成，可以直接发，也可以再改一句。" : "Handoff card ready and copied; you can send it or tweak one line.")
        : (currentLanguage === "zh" ? "交付卡已生成；剪贴板不可用，可以从结果栏复制。" : "Handoff card ready; clipboard unavailable, copy it from the result panel."));
    }
  } catch (error) {
    if (!isAbortError(error)) {
      const message = `${t("connection_error")} ${error.message}`;
      if (claimResultsEl) claimResultsEl.innerHTML = `<div class="empty-folder-note">${escapeHtml(message)}</div>`;
      setStatus(message);
    }
  } finally {
    endLongTask(taskId);
  }
}
