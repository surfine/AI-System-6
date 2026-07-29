// Shared Question Sheet semantics for every feature that creates or rewrites
// upstream writing intent. Keep labels, prompts, and templates in one place so
// Rebuild, DocMap, Scrapbook, and Outline do not drift into different objects.

const QUESTION_SHEET_SECTION_KEYS = [
  "topic",
  "originalQuestions",
  "rawInput",
  "recipient",
  "mustRemember",
  "objections",
  "terms",
  "sourceLeads",
  "toneStyle",
  "handoff",
  "outputRules",
];

const QUESTION_SHEET_SPECS = {
  zh: {
    title: "问题单",
    packTitle: "写作对象包",
    languageName: "Chinese",
    intro: "问题单是正文上游的意图纸，不是摘要、大纲或正文。它保留作者要解决的问题、粗糙人类输入、接收者、反对意见、关键限制、术语区分、来源线索、语气目标、交付减摩擦和输出规则。",
    fields: {
      topic: "主题",
      originalQuestions: "原始问题",
      rawInput: "原始输入 / 碎念",
      recipient: "接收者 / 受众",
      mustRemember: "必须记住",
      objections: "反对意见 / 张力",
      terms: "需要区分的术语",
      sourceLeads: "来源线索",
      toneStyle: "语气 / 风格目标",
      handoff: "交付减摩擦",
      outputRules: "输出规则",
    },
    outputRuleDefault: "我给 AI 的意图要多于我要求它输出的文字。",
    emptyMarker: "（空）",
  },
  en: {
    title: "Question Sheet",
    packTitle: "Writing Object Pack",
    languageName: "English",
    intro: "A Question Sheet is upstream writing intent, not a summary, outline, or draft. It preserves the writer's questions, rough human input, recipient, objections, constraints, term distinctions, source leads, tone target, handoff friction, and output rules.",
    fields: {
      topic: "Topic",
      originalQuestions: "Original Questions",
      rawInput: "Raw Input / Stray Thoughts",
      recipient: "Recipient / Audience",
      mustRemember: "Must Remember",
      objections: "Objections / Tensions",
      terms: "Terms To Distinguish",
      sourceLeads: "Source Leads",
      toneStyle: "Tone / Style Target",
      handoff: "Handoff Friction",
      outputRules: "Output Rules",
    },
    outputRuleDefault: "My input intent should be richer than the AI output I ask for.",
    emptyMarker: "(empty)",
  },
};

function questionSheetLanguage(language = currentLanguage) {
  return language === "zh" ? "zh" : "en";
}

function questionSheetSpec(language = currentLanguage) {
  return QUESTION_SHEET_SPECS[questionSheetLanguage(language)];
}

function questionSheetSectionLabel(key, language = currentLanguage) {
  return questionSheetSpec(language).fields[key] || key;
}

function questionSheetSectionHeading(key, language = currentLanguage) {
  return `## ${questionSheetSectionLabel(key, language)}`;
}

function questionSheetItemLines(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((item) => String(item || "").split(/\n+/))
    .map((item) => item.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .map((item) => `- ${item}`);
}

function buildQuestionSheetMarkdown({
  title = "",
  sections = {},
  includeEmpty = false,
  language = currentLanguage,
} = {}) {
  const lines = [];
  const cleanTitle = String(title || "").trim();
  if (cleanTitle) lines.push(`# ${cleanTitle}`, "");

  QUESTION_SHEET_SECTION_KEYS.forEach((key) => {
    const items = questionSheetItemLines(sections[key]);
    if (!includeEmpty && !items.length) return;
    lines.push(questionSheetSectionHeading(key, language), "");
    lines.push(...(items.length ? items : ["- "]), "");
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildQuestionSheetTemplate(language = currentLanguage) {
  const spec = questionSheetSpec(language);
  return buildQuestionSheetMarkdown({
    includeEmpty: true,
    language,
    sections: {
      outputRules: spec.outputRuleDefault,
    },
  });
}

function questionSheetFieldList(language = currentLanguage) {
  return QUESTION_SHEET_SECTION_KEYS.map((key) => `- ${questionSheetSectionLabel(key, language)}`).join("\n");
}

function resolveWritingRoutePrompt(id, language = currentLanguage) {
  const projectId = typeof activeProjectId === "undefined" ? null : activeProjectId;
  const resolved = window.AISystem6PromptFilesRuntime?.resolvePromptFile(id, projectId, language);
  const record = window.AISystem6PromptFiles?.find?.((item) => item.id === id);
  const body = resolved?.status === "ready"
    ? resolved.body
    : (language === "zh" ? record?.body : record?.en);
  if (!body) {
    throw new Error(language === "zh" ? "写作路线提示词文件不可用。" : "The Writing Route prompt file is unavailable.");
  }
  if (resolved?.status === "ready") {
    window.AISystem6PromptFilesRuntime?.recordPromptRun?.(projectId, id, resolved);
  }
  return body;
}

function questionSheetPromptContract(language = currentLanguage) {
  const spec = questionSheetSpec(language);
  return [
    spec.intro,
    "",
    language === "zh" ? "固定语义：" : "Fixed semantics:",
    language === "zh"
      ? "- 只返回完整的问题单 Markdown，不要解释。"
      : "- Return the full Question Sheet Markdown only. No explanation.",
    language === "zh"
      ? "- 不要改成摘要、大纲、正文、事实核查报告或泛泛建议。"
      : "- Do not turn it into a summary, outline, draft, fact-check report, or generic advice.",
    language === "zh"
      ? "- 保留用户原本的问题意识、限制、反对意见和输出要求；不要新增没有来源支持的事实结论。"
      : "- Preserve the user's original questions, constraints, objections, and output rules; do not add unsupported factual conclusions.",
    language === "zh"
      ? "- 保留还没整理好的粗糙观察、个人细节、犹豫、吐槽和口头判断；不要为了整齐把它们漂洗成模型自己的话。"
      : "- Preserve rough observations, personal details, hesitation, complaints, and spoken judgments that are not organized yet; do not wash them into the model's own language for neatness.",
    language === "zh"
      ? "- 接收者要写成真实的人或真实群体；交付减摩擦要说明怎样让对方更容易接收，而不是让作者产出更多。"
      : "- Write the recipient as a real person or real group; handoff friction should say how to make the work easier to receive, not how to make the writer produce more.",
    language === "zh"
      ? "- 每个栏目用短项目符号；问题尽量写成真正的问题。"
      : "- Use short bullets in each section; make questions actual questions when possible.",
    "",
    language === "zh" ? "使用这些栏目，必要时可以删掉空栏目：" : "Use these sections when useful; omit empty sections:",
    questionSheetFieldList(language),
  ].join("\n");
}

function buildQuestionSheetRewritePrompt({
  sourceName = "",
  sourceMarkdown = "",
  existing = "",
  context = "",
  language = currentLanguage,
} = {}) {
  const spec = questionSheetSpec(language);
  const sourceLabel = sourceName || spec.title;
  return [
    language === "zh"
      ? "你是 AI System 6 的写作规划助手。请把输入改写并整合成真正可用于写作流程的问题单。"
      : "You are an AI System 6 writing planner. Rewrite and integrate the input into a real Question Sheet for the writing workflow.",
    "",
    questionSheetPromptContract(language),
    "",
    language === "zh"
      ? `输入来源：${sourceLabel}`
      : `Input source: ${sourceLabel}`,
    sourceMarkdown || spec.emptyMarker,
    "",
    language === "zh" ? "现有问题单：" : "Existing Question Sheet:",
    existing || spec.emptyMarker,
    "",
    context
      ? (language === "zh" ? "项目上下文：" : "Project context:")
      : "",
    context,
  ].filter((line) => line !== "").join("\n");
}

function buildQuestionSheetRewriteMessages({
  sourceName = "",
  sourceMarkdown = "",
  existing = "",
  context = "",
  language = currentLanguage,
} = {}) {
  const spec = questionSheetSpec(language);
  const sourceLabel = sourceName || spec.title;
  const headings = QUESTION_SHEET_SECTION_KEYS
    .filter((key) => key !== "outputRules")
    .map((key) => questionSheetSectionHeading(key, language))
    .join("\n");
  const system = resolveWritingRoutePrompt("writing-route.question-sheet-organize", language);
  const user = [
    language === "zh"
      ? "请生成一份可保存的问题单 Markdown。"
      : "Generate a savable Question Sheet in Markdown.",
    headings,
    "",
    language === "zh" ? "【用户输入】" : "[User Input]",
    sourceMarkdown || spec.emptyMarker,
    "",
    existing ? (language === "zh" ? "【现有问题单】" : "[Existing Question Sheet]") : "",
    existing,
    "",
    context ? (language === "zh" ? "【项目材料】" : "[Project Material]") : "",
    context,
  ].filter((line) => line !== "").join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function questionSheetSectionHeadingPattern(keys = QUESTION_SHEET_SECTION_KEYS, language = currentLanguage) {
  const labels = keys.map((key) => questionSheetSectionLabel(key, language).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const legacy = language === "zh"
    ? ["问题单", "原始问题", "原始输入", "碎念", "接收者", "受众", "必须记住", "反对意见", "需要区分的概念", "需要区分的术语", "来源线索", "语气 / 风格目标", "交付减摩擦", "输出规则"]
    : ["Question Sheet", "Original Questions", "Raw Input", "Stray Thoughts", "Recipient", "Audience", "Recipient / Audience", "Must Remember", "Objections", "Objections / Tensions", "Terms to distinguish", "Terms To Distinguish", "Source Leads", "Tone / Style target", "Tone / Style Target", "Handoff", "Handoff Friction", "Output Rule", "Output Rules"];
  return new RegExp(`^##\\s+(?:${[...labels, ...legacy.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))].join("|")})\\s*$`, "im");
}
