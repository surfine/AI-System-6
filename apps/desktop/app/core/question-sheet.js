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

// The template is blank, all of it. The one line that used to arrive
// pre-filled -- "my input intent should be richer than the AI output I ask
// for" -- is a rule ABOUT this sheet, and it was sitting INSIDE it as though
// the writer had written it. It is the sheet's own hint text now, and the
// "output rules" section is left for the writer's rules: do not use that word,
// do not summarise at the end, keep my "roughly".
function buildQuestionSheetTemplate(language = currentLanguage) {
  return buildQuestionSheetMarkdown({ includeEmpty: true, language, sections: {} });
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
    : (language === "zh" ? record?.bodies?.zh : record?.bodies?.en);
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

// --- Reading the sheet, rather than scoring it ---------------------------
//
// CLAUDE.md names what this sheet exists to protect: "real recipient, raw
// questions, personal observations, objections, usage details, pressure
// points, handoff friction". Five of the eleven sections carry those. The
// other six are useful; these five are load-bearing, so these are the ones
// the sheet reports on -- in the order the charter names them.
//
// It reports one gap, not a score. "4 of 11" turns the sheet back into a form
// with marks on it, and invites filling boxes to raise the number.
const QUESTION_SHEET_LOAD_BEARING = ["recipient", "originalQuestions", "rawInput", "objections", "handoff"];

// Headings the writer may already have, from earlier versions of the template.
// A section written under an old heading must not read as unwritten.
const QUESTION_SHEET_HEADING_ALIASES = {
  recipient: ["接收者", "受众", "Recipient", "Audience"],
  originalQuestions: ["原始问题", "Original Questions"],
  rawInput: ["原始输入", "碎念", "Raw Input", "Stray Thoughts"],
  objections: ["反对意见", "张力", "Objections", "Tensions"],
  handoff: ["交付减摩擦", "交付摩擦", "Handoff", "Handoff Friction"],
  terms: ["需要区分的概念", "Terms to distinguish"],
  outputRules: ["Output Rule"],
};

function questionSheetHeadingKeyMap() {
  const map = new Map();
  const add = (text, key) => {
    const normalized = String(text || "").replace(/\s+/g, "").toLowerCase();
    if (normalized && !map.has(normalized)) map.set(normalized, key);
  };
  QUESTION_SHEET_SECTION_KEYS.forEach((key) => {
    add(questionSheetSectionLabel(key, "zh"), key);
    add(questionSheetSectionLabel(key, "en"), key);
    (QUESTION_SHEET_HEADING_ALIASES[key] || []).forEach((alias) => add(alias, key));
  });
  return map;
}

// A section counts as said when something is written under its heading. An
// empty bullet, the template's "- ", and the empty marker do not count -- they
// are what the form left behind, not what the writer put there.
function questionSheetCoveredSections(markdown) {
  const headings = questionSheetHeadingKeyMap();
  const covered = new Set();
  const emptyMarkers = new Set(["（空）", "(empty)"]);
  let current = "";

  normalizeMarkdownText(markdown).split("\n").forEach((line) => {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      current = headings.get(heading[1].replace(/\s+/g, "").toLowerCase()) || "";
      return;
    }
    if (!current || covered.has(current)) return;
    const content = line.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "").trim();
    if (content && !emptyMarkers.has(content)) covered.add(current);
  });

  return covered;
}

// The first load-bearing section this sheet has not said anything about, or ""
// when it has said something about all five.
function questionSheetFirstGap(markdown) {
  const covered = questionSheetCoveredSections(markdown);
  return QUESTION_SHEET_LOAD_BEARING.find((key) => !covered.has(key)) || "";
}

// --- The sheet as a specification ----------------------------------------
//
// The sheet writes down constraints and, until now, nothing at the end of the
// route ever read them back. Two channels carry them, split by what kind of
// rule each is rather than by what is cheap:
//
//   exact   a word the writer put in quotes is a hard rule. String matching
//           cannot miss one and cannot invent one, and it can point at the
//           line. A model asked the same question can do neither reliably.
//   judged  everything else -- tone, whether the personal detail survived,
//           "do not summarise at the end" -- needs reading, so it goes to the
//           style check along with the rest of the sheet's constraints.

// The text under one section heading, or "".
function questionSheetSectionBody(markdown, key) {
  const headings = questionSheetHeadingKeyMap();
  const lines = [];
  let current = "";

  normalizeMarkdownText(markdown).split("\n").forEach((line) => {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      current = headings.get(heading[1].replace(/\s+/g, "").toLowerCase()) || "";
      return;
    }
    if (current === key) lines.push(line);
  });

  return lines.join("\n").trim();
}

// Words the writer quoted inside their own output rules. Quoting is not a
// syntax anyone has to learn: a writer naming a word they do not want already
// puts it in quotes.
function questionSheetQuotedRules(markdown) {
  const body = questionSheetSectionBody(markdown, "outputRules");
  if (!body) return [];

  const found = [];
  const pattern = /[「『“"']([^」』”"'\n]{1,40})[」』”"']/g;
  let match = pattern.exec(body);
  while (match) {
    const term = match[1].trim();
    if (term && !found.includes(term)) found.push(term);
    match = pattern.exec(body);
  }
  return found;
}

// Where each quoted term appears in the manuscript. Exact, so it reports a
// line rather than an impression.
function outputRuleBreaches(terms, body) {
  const lines = normalizeMarkdownText(body).split("\n");
  const breaches = [];

  (terms || []).forEach((term) => {
    if (!term) return;
    lines.forEach((line, index) => {
      if (!line.includes(term)) return;
      breaches.push({ term, line: index + 1, text: line.trim().slice(0, 160) });
    });
  });

  return breaches;
}

// The constraints the writer stated, for the check that needs to read them.
// Not the whole sheet: these five sections are the ones a reviewer has to hold
// in mind, and the rest would only spend context.
function questionSheetReviewContext(markdown, limit = 1200) {
  const keys = ["recipient", "mustRemember", "objections", "toneStyle", "outputRules"];
  const parts = keys
    .map((key) => {
      const body = questionSheetSectionBody(markdown, key);
      return body ? `## ${questionSheetSectionLabel(key)}\n${body}` : "";
    })
    .filter(Boolean);
  return parts.join("\n\n").slice(0, limit);
}

function questionSheetSectionHeadingPattern(keys = QUESTION_SHEET_SECTION_KEYS, language = currentLanguage) {
  const labels = keys.map((key) => questionSheetSectionLabel(key, language).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const legacy = language === "zh"
    ? ["问题单", "原始问题", "原始输入", "碎念", "接收者", "受众", "必须记住", "反对意见", "需要区分的概念", "需要区分的术语", "来源线索", "语气 / 风格目标", "交付减摩擦", "输出规则"]
    : ["Question Sheet", "Original Questions", "Raw Input", "Stray Thoughts", "Recipient", "Audience", "Recipient / Audience", "Must Remember", "Objections", "Objections / Tensions", "Terms to distinguish", "Terms To Distinguish", "Source Leads", "Tone / Style target", "Tone / Style Target", "Handoff", "Handoff Friction", "Output Rule", "Output Rules"];
  return new RegExp(`^##\\s+(?:${[...labels, ...legacy.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))].join("|")})\\s*$`, "im");
}

// --- Photographed input -----------------------------------------------------
//
// The Question Sheet asks for the messy human material before prose: real
// questions, raw notes, objections. A photograph of a scribbled page is the
// messiest and most human of those, and it was the one kind the sheet could not
// take. Photos are raw input, not an AI-written section: they ride along with
// the Organize pass so the model can read what the writer scribbled, and the
// sheet's own sections stay exactly as they were.

const QUESTION_SHEET_PHOTO_LIMIT = 8;
const QUESTION_SHEET_PHOTO_SURFACE = "questionSheet";

/**
 * @returns {any[]}
 */
function getQuestionSheetPhotos() {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) return [];
  return imageAttachmentsForProject(project.id, {
    surface: QUESTION_SHEET_PHOTO_SURFACE,
    limit: QUESTION_SHEET_PHOTO_LIMIT,
  });
}

function renderQuestionSheetPhotos() {
  const strip = document.getElementById("question-sheet-photos");
  if (!strip) return;
  const photos = getQuestionSheetPhotos();
  strip.classList.toggle("is-hidden", !photos.length);
  strip.replaceChildren();
  if (!photos.length) return;

  photos.forEach((photo) => {
    const item = document.createElement("span");
    item.className = "question-sheet-photo";
    const thumb = document.createElement("img");
    thumb.className = "question-sheet-photo-thumb";
    thumb.src = imageAttachmentVisionDataUrl(photo);
    thumb.alt = photo.alt || photo.name || "";
    const label = document.createElement("span");
    label.className = "question-sheet-photo-name";
    label.textContent = photo.name || "";
    const remove = document.createElement("button");
    remove.className = "btn mini-btn question-sheet-photo-remove";
    remove.type = "button";
    remove.textContent = t("remove");
    remove.addEventListener("click", () => removeQuestionSheetPhoto(photo.id));
    item.append(thumb, label, remove);
    strip.append(item);
  });
}

/**
 * @param {ArrayLike<File>} files
 */
async function addQuestionSheetPhotoFiles(files) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  const incoming = imageFilesFromList(files);
  if (!incoming.length) return;

  const openSlots = Math.max(0, QUESTION_SHEET_PHOTO_LIMIT - getQuestionSheetPhotos().length);
  if (!openSlots) {
    setStatus(t("question_sheet_photo_limit", QUESTION_SHEET_PHOTO_LIMIT));
    return;
  }

  const built = await buildImageAttachments(incoming.slice(0, openSlots), {
    projectId: project.id,
    surface: QUESTION_SHEET_PHOTO_SURFACE,
    limit: openSlots,
  });
  if (!built.length) return;
  saveImageAttachments(built);
  project.updatedAt = new Date().toISOString();
  renderQuestionSheetPhotos();
  setStatus(incoming.length > built.length
    ? t("question_sheet_photo_limit", QUESTION_SHEET_PHOTO_LIMIT)
    : t("question_sheet_photos_added", built.length));
  saveDeskState();
}

function addQuestionSheetPhotos() {
  if (typeof openTransientFilePicker !== "function") return;
  // One Choose-button picker, no permanent file input in the markup.
  openTransientFilePicker({
    accept: IMAGE_ATTACHMENT_ACCEPT,
    multiple: true,
    onSelect: (files) => addQuestionSheetPhotoFiles(files),
  });
}

// --- The sheet as a card deck ----------------------------------------------
//
// The deck is a VIEW of the same Markdown the page edits, never a second
// store: reading it takes the eleven sections apart, and writing it puts them
// back together the same way buildQuestionSheetMarkdown does. A twelfth card
// carries no section of its own -- CLAUDE.md's "Question Sheet must welcome
// messy human input before prose" needs a place for a raw dump before the
// writer knows which of the eleven boxes it belongs in, and the text before
// the first section heading (the title line aside) already is that place.

const QUESTION_SHEET_UNNAMED_CARD = "unnamed";

// The lines before the first recognized section heading -- skipping a leading
// `# Title` line, which is the pack's title, not the writer's mess.
function questionSheetPreamble(markdown) {
  const headings = questionSheetHeadingKeyMap();
  const lines = [];

  normalizeMarkdownText(markdown).split("\n").some((line) => {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      if (heading[1].length === 1) return false; // the title line: skip, keep scanning
      if (headings.has(heading[2].replace(/\s+/g, "").toLowerCase())) return true; // first known section: stop
      lines.push(line); // an unrecognized heading is still part of the mess
      return false;
    }
    lines.push(line);
    return false;
  });

  return lines.join("\n").trim();
}

// Twelve cards: the unnamed dump first, then the eleven sections in the
// sheet's own order.
function questionSheetCardsFromMarkdown(markdown, language = currentLanguage) {
  const cards = [{
    key: QUESTION_SHEET_UNNAMED_CARD,
    label: "",
    body: questionSheetPreamble(markdown),
  }];
  QUESTION_SHEET_SECTION_KEYS.forEach((key) => {
    cards.push({ key, label: questionSheetSectionLabel(key, language), body: questionSheetSectionBody(markdown, key) });
  });
  return cards;
}

// The inverse: card bodies back into one Markdown document. Empty cards drop
// out, exactly as buildQuestionSheetMarkdown already does for empty sections
// -- the deck does not invent placeholder text the page would not have shown.
function questionSheetMarkdownFromCards(cards, language = currentLanguage) {
  const byKey = new Map((cards || []).map((card) => [card.key, card.body]));
  const lines = [];
  const preamble = String(byKey.get(QUESTION_SHEET_UNNAMED_CARD) || "").trim();
  if (preamble) lines.push(preamble, "");

  QUESTION_SHEET_SECTION_KEYS.forEach((key) => {
    const body = String(byKey.get(key) || "").trim();
    if (!body) return;
    lines.push(questionSheetSectionHeading(key, language), "", body, "");
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * @param {string} id
 */
function removeQuestionSheetPhoto(id) {
  if (!removeImageAttachment(id)) return;
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (project) project.updatedAt = new Date().toISOString();
  renderQuestionSheetPhotos();
  setStatus(t("question_sheet_photo_removed"));
  saveDeskState();
}
