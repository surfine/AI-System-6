// POST /api/draft/thesis
//
// 钟点稿 / Quick Draft orchestration. Builds a thesis-anchored draft request
// around the USER'S OWN thesis (never a generated one), injects the server-side
// System Integrity and Author Thesis guardrails, dispatches to the active local
// or cloud model, and normalizes the model's fixed Markdown sections into a
// stable envelope { stage, brief, draft, sourceMap, risks, raw }.
//
// The model is asked for stable Markdown sections, NOT JSON: the chat channel
// forbids JSON, and the route owns the Markdown -> envelope normalization. The
// full Markdown is always returned as `raw` so a parsing miss never silently
// drops content.

"use strict";

const { send, readJsonBody, requestSignal } = require("../lib/http.js");
const { postJsonWithFallback } = require("../lib/fetch.js");
const { getLocalUrls } = require("../lib/local-urls.js");
const { modelContentFromChatData, tuneLmStudioChatPayload } = require("../chat.js");
const { postLocalChatWithModelAutoload, classifyLmStudioProxyError } = require("../lmstudio.js");
const {
  cloudAuthHeaders,
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
  resolveCloudBaseUrl,
} = require("../cloud.js");
const { systemIntegrityInstruction } = require("../system-integrity.js");
const { authorThesisInstruction } = require("../author-thesis.js");
const { chatVentIntakeInstruction } = require("../chat-vent.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const {
  findHumanizerOutputHits,
  findHumanizerStyleDiagnostics,
  humanizerModelInstruction,
  shouldLintHumanizerOutput,
} = require("../humanizer.js");

const DEEPSEEK_V4_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash", "v4-pro", "v4-flash"]);
const FIRST_DAY_FORMAT = "first-day-hands-on";
const HANDS_ON_REVIEW_FORMAT = "hands-on-review";

/**
 * @param {string} [language]
 * @returns {boolean}
 */
function isZh(language = "") {
  return String(language || "").toLowerCase().startsWith("zh");
}

/**
 * @param {string} provider
 * @returns {string}
 */
function providerDisplayName(provider) {
  if (provider === "lm-studio") return "LM Studio";
  if (provider === "ollama") return "Ollama";
  return "Local Model";
}

const FORMAT_LABELS = {
  zh: {
    "bili-video": "观点出稿",
    [FIRST_DAY_FORMAT]: "首发上手",
    "bili-dynamic": "B站动态",
    "spoken-outline": "口播提纲",
  },
  en: {
    "bili-video": "thesis script",
    [FIRST_DAY_FORMAT]: "First-Day Hands-on",
    "bili-dynamic": "Bilibili post",
    "spoken-outline": "spoken outline",
  },
};

const DURATION_LABELS = {
  "30s": { zh: "30 秒", en: "30 seconds" },
  "1m": { zh: "1 分钟", en: "1 minute" },
  "3m": { zh: "3 分钟", en: "3 minutes" },
  "5m": { zh: "5 分钟", en: "5 minutes" },
  "7m": { zh: "约 7 分钟", en: "~7 minutes" },
  "8m": { zh: "8 分钟", en: "8 minutes" },
  "10m": { zh: "10 分钟", en: "10 minutes" },
  "12m": { zh: "约 12 分钟", en: "~12 minutes" },
  "140w": { zh: "约 140 字", en: "~140 words" },
  "280w": { zh: "约 280 字", en: "~280 words" },
  "500w": { zh: "约 500 字", en: "~500 words" },
};

// Fixed Markdown section headers, keyed by envelope field. The model is told to
// use these headers verbatim; the parser also accepts the other language's
// headers so a wrong-language reply still normalizes.
const SECTION_HEADERS = {
  zh: {
    support: "支持观点的材料",
    counter: "可能反驳观点的材料",
    uncertainty: "不确定或缺来源的信息",
    risks: "事实风险",
    outline: "骨架",
    draft: "初稿",
  },
  en: {
    support: "Supporting material",
    counter: "Counter material",
    uncertainty: "Uncertain or unsourced",
    risks: "Factual risks",
    outline: "Outline",
    draft: "Draft",
  },
};

const FIRST_DAY_HEADERS = {
  zh: {
    draft: "初稿",
    firsthand: "用户亲测",
    official: "发布会资料",
    uncertain: "不确定推测",
    followup: "需要后续测试",
    outline: "骨架",
    editorial: "出稿取舍",
    materialLedger: "素材处理",
    adoptionTable: "稿里怎么处理",
  },
  en: {
    draft: "Draft",
    firsthand: "First-hand notes",
    official: "Launch or official material",
    uncertain: "Uncertain inference",
    followup: "Needs follow-up testing",
    outline: "Outline",
    editorial: "Drafting choices",
    materialLedger: "Material handling",
    adoptionTable: "How it lands in the draft",
  },
};

const VENT_OUTLINE_HEADERS = {
  zh: {
    userExpression: "用户表达",
    chatMaterial: "聊天素材",
    stanceCandidates: "可讲点候选",
    outlineSeed: "出稿骨架",
    risks: "风险边界",
  },
  en: {
    userExpression: "User expression",
    chatMaterial: "Chat material",
    stanceCandidates: "Talk-point candidates",
    outlineSeed: "Draft path",
    risks: "Risk boundaries",
  },
};

const EMPTY_STRATEGY_REPORT = Object.freeze({
  editorial: "",
  materialLedger: "",
  adoptionTable: "",
});

const LUOLUO_SPOKEN_LENS_ZH = [
  "落落口播 compact lens（双用户、单体验）：",
  "- 用户可能是 Aaron，也可能是落落本人；不要假设使用者身份，不要写交接压力或私人合作判断。",
  "- 视频口播稿不是文章：前两句就要看到重点，前 20 秒必须有意思，判断/结论放在前面。",
  "- 落落接收标准前置：这稿交过去要能直接理解、能开口念、能想到画面；不要让他还要重新拆资料、重新找主线。",
  "- 把出稿取舍和素材处理转成能拍、能念、能成立的第一人称口播；按可拍画面推进，再补原因、考据、判断。",
  "- 正文只放可录内容；后台判断、来源状态、待核边界和采用理由放在出稿取舍 / 素材处理 / 稿里怎么处理。",
  "- 句子短，像当天边录边说；允许一点停顿、口水词和自我修正；趋近落落的真实口播质感，但不要机械复刻口头禅或招牌梗。",
  "- 参数、资料和链接要改成观众听得懂的体验后果；没亲测或没来源的事实标成“〔待核：...〕”或放进后续测试。",
].join("\n");

const LUOLUO_SPOKEN_LENS_EN = [
  "Luoluo spoken compact lens (dual-user, single experience):",
  "- The user may be Aaron or Luoluo; do not assume identity, add handoff pressure, or write private collaboration advice.",
  "- This is spoken video copy, not an article: the point should be visible in the first two sentences, and the first 20 seconds must be interesting.",
  "- Luoluo receiving standard comes first: the script should be understandable, speakable, and visually imaginable without making him re-triage sources or rediscover the spine.",
  "- Turn editorial strategy and the material ledger into first-person copy that can be filmed, spoken, and defended; move through showable visuals before reasons, research, and judgment.",
  "- Keep only recordable copy in the body; backstage judgment, source status, pending checks, and adoption reasons belong in Drafting choices / Material handling / How it lands in the draft.",
  "- Use short same-day spoken sentences with a little natural hesitation or self-correction; move toward Luoluo's grounded spoken texture without filling in catchphrases or signature bits mechanically.",
  "- Convert specs, sources, and links into viewer-understandable experience consequences; mark untried or unsourced facts as '〔待核: ...〕' or follow-up testing.",
].join("\n");

/**
 * @param {any} value
 * @returns {string}
 */
function asText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join("\n");
  return "";
}

/**
 * @param {string} title
 * @returns {boolean}
 */
function isDefaultQuickDraftTitle(title = "") {
  const value = asText(title).toLowerCase();
  return value === "quick draft" || value === "钟点稿";
}

/**
 * @param {any} body
 * @returns {boolean}
 */
function isFirstDayHandsOn(body) {
  return body?.targetFormat === FIRST_DAY_FORMAT;
}

/**
 * @param {any} body
 * @returns {string}
 */
function taskKind(body) {
  const direct = asText(body?.taskKind);
  if (direct) return direct;
  const notes = asText(body?.userNotes);
  const match = notes.match(/\[taskKind:([^\]]+)\]/i);
  return match ? match[1].trim() : "";
}

/**
 * These Quick Draft commands inspect the current material and return a
 * ClioTalk advice card. They must not produce replacement body copy.
 * @param {string} kind
 * @returns {boolean}
 */
function isQuickDraftAdviceOnlyTask(kind = "") {
  return new Set(["mingming", "luoluo", "hkrr", "praise", "boundary", "strategy-check"]).has(String(kind || "").trim());
}

/**
 * Quick Draft commands borrow Review Desk / Outline lenses, but compress them
 * into same-day launch drafting actions instead of long backstage reports.
 * @param {string} kind
 * @param {boolean} zh
 * @returns {string}
 */
function quickDraftCommandLens(kind = "", zh = true) {
  const normalized = String(kind || "").trim();
  const zhLenses = {
    "generate-first-body": [
      "若是铭铭会怎么写（钟点稿特化版）：",
      "- 把“出稿”理解成主写作入口，不是普通总结：它要直接生成一版趋近落落频道、当天能录、接地气的口播稿。",
      "- 复用“若是铭铭会怎么写”的转换思路：先提取核心判断、可拍画面、观众关心点、真实遗憾和资料边界，再重排成视频顺序。",
      "- 风格目标：唠嗑感、考据癖、设计情怀、真诚不端着；像人刚整理完资料准备开录，不像媒体稿、讲课稿或 AI 汇总。",
      "- 开头 2-4 句必须看到重点、反差或判断；不要先介绍背景、不要从发布会顺序平铺。",
      "- 句子要短，5-12 字一个想法优先；允许“其实 / 然后 / 不过 / 哦对 / 怎么说呢”这类自然口头纹理，但不要把落落招牌当填空题。",
      "- 资料必须改成体验后果和观众能懂的话；参数表、链接、发布会顺序都要压缩成人话。",
      "- 至少保留 1-2 个真实遗憾、限制或没法展示的边界；不能为了好听把稿子写成广告。",
      "- 创作判断归用户；不得新增事实，不得把没亲测写成亲测，不得用风格覆盖事实边界。",
    ],
    mingming: [
      "铭铭快审（首发快稿版）：",
      "- 代入铭铭视角检查：这是不是落落频道里能拍、能念、能成立的当天口播。",
      "- 重点看前两句有没有重点、前 20 秒有没有意思、有没有写成文章/讲课、画面能不能拍、有没有 AI 嘴替味。",
      "- 发布日失败模式优先抓：像媒体通稿、按发布会顺序平铺、把没亲测写成体验、删掉国行/地区/Beta 限制、出现泛创作者结尾。",
      "- 输出到 ClioTalk，作为可采用建议卡；不要直接重写正文，不输出长表格或审校报告。",
      "- 保留用户原始判断、犹豫、吐槽和已经写出的口气；不要为了像落落而覆盖作者本人。",
    ],
    luoluo: [
      "若是落落会怎么接（首发快稿版）：",
      "- 落落是男生。涉及落落时只能使用“他/他的”，禁止使用“她/她的”。",
      "- 内部使用落落接收视角：他可能先看顺不顺、能不能拍、前两句有没有重点、会不会太像论文。",
      "- 先给情绪价值，再守事实底线；输出哪里更容易接、哪里会让落落重新拆资料、哪里可以更顺口。",
      "- 接收卡必须覆盖：好接的一点、会卡的一点、需要补拍/补核的一点；不把后台判断混进正文。",
      "- 输出到 ClioTalk，作为可采用建议卡；不要直接重写正文。",
      "- 不输出私人关系建议、交付后台术语、道德判断、站队或“你应该如何对待他”。",
      "- 事实护栏只保留必须守住的说法和待核边界，不做 forensic fact-check 表格。",
    ],
    hkrr: [
      "HKRR 快速提亮（首发快稿版）：",
      "- Happiness：加发现感、趣味或反直觉，但不能编造。",
      "- Knowledge：把资料/参数变成观众听得懂的信息增量。",
      "- Resonance：保留人的感受、犹豫、遗憾和判断，不要抹平成产品稿。",
      "- Rhythm：调整呼吸、停顿、转场和段落先后，让它像当天能录的口播。",
      "- 输出到 ClioTalk，作为可采用建议卡；不要直接重写正文，不输出完整 HKRR 分析。",
    ],
    praise: [
      "夸夸我（情绪价值・出稿支持版）：",
      "- 这是一级命令，不是附属功能。目标是让 Aaron 被看见、开心一点、愿意继续写。",
      "- 落落是男生。涉及落落时只能使用“他/他的”，禁止使用“她/她的”。",
      "- 不重写正文。先具体肯定稿子已经成立的地方、Aaron 的判断、给落落的认真交付和这份心意；也要看见落落值得被认真对待的表达、审美、频道和观众感，再给 3 个最轻量下一步。",
      "- 鼓励必须具体指向当前素材、标题、判断、可拍画面或已经写出的句子；不要泛泛鸡汤。",
      "- 语气要托住作者状态，但不能用夸奖掩盖事实边界。",
      "- 输出到 ClioTalk，像一张短卡，不要长报告。",
    ],
    "draft-from-chat-records": [
      "根据聊天记录出稿工作流：",
      "- 先把聊天记录当成 Aaron 的编辑讨论和素材池，不要当成可靠事实来源。",
      "- 从聊天中提取：主线判断、观众关心点、不要讲什么、哪些能拍、哪些只能嘴过、哪些还没测。",
      "- 用“出稿取舍 / 素材处理 / 稿里怎么处理”把聊天建议落成策略表，再写正文。",
      "- 正文要像刚看完录屏、整理完聊天后能直接录的口播：短句、第一人称、画面驱动、先讲能展示的东西。",
      "- 聊天里没有证据支持的功能点，不能写成体验或事实；只能写成建议、待核、发布会资料或不放进正文。",
      "- 不要把聊天昵称、头像、身份关系或截图外隐私写进稿。",
    ],
  };
  const enLenses = {
    "generate-first-body": [
      "What Would Mingming Write (Quick Draft edition):",
      "- Treat Draft as the main writing entrance, not a generic summary: generate a grounded, recordable same-day spoken script that moves toward Luoluo-channel texture.",
      "- Reuse the Mingming conversion move: extract the core judgment, shootable visuals, viewer concerns, real regrets, and source boundaries, then reorder them into video order.",
      "- Style target: chatty, detail-loving, design-sensitive, sincere without posing; it should feel like someone has just organized the material and is ready to record, not like press copy, a lecture, or an AI summary.",
      "- The first 2-4 sentences must show the point, contrast, or judgment; do not open with background or keynote chronology.",
      "- Prefer short sentences, roughly one idea per 5-12 Chinese characters when writing Chinese; allow natural spoken texture, but do not use Luoluo signatures as fill-in-the-blank catchphrases.",
      "- Convert source material into experience consequences and viewer-understandable language; compress specs, links, and launch chronology into plain speech.",
      "- Keep at least 1-2 real regrets, limits, or hard-to-show boundaries; do not turn the draft into advertising.",
      "- Creative judgment belongs to the user; do not add facts, do not turn untested material into first-hand experience, and do not let style override factual boundaries.",
    ],
    mingming: [
      "Mingming pass (launch-day quick draft):",
      "- Use the Mingming perspective to check whether this is shootable, speakable Luoluo-channel same-day video copy.",
      "- Check whether the first two sentences show the point, whether the first 20 seconds are interesting, whether it became an article/lecture, whether visuals can be filmed, and whether it has AI-mouthpiece residue.",
      "- Catch launch-day failure modes first: press-release voice, keynote chronology, untried material framed as experience, softened China/region/Beta limits, and generic creator endings.",
      "- Output a ClioTalk suggestion card; do not directly rewrite the body or output a long review report.",
      "- Preserve the user's original judgment, hesitation, complaints, and existing voice; do not overwrite the author just to imitate Luoluo.",
    ],
    luoluo: [
      "How Luoluo would receive it (launch-day quick draft):",
      "- Luoluo is male. Use he/him/his for Luoluo; never she/her.",
      "- Internally use Luoluo's receiving lens: smoothness, shootability, whether the first two sentences show the point, and whether it sounds too essay-like.",
      "- Give emotional value first, then protect factual guardrails; note what is easy to receive, what would make Luoluo re-triage sources, and what should sound smoother.",
      "- The receiving card must cover one easy-to-receive point, one sticking point, and one shoot/check follow-up; do not mix backstage judgment into the body.",
      "- Output a ClioTalk suggestion card; do not directly rewrite the body.",
      "- Do not output private relationship advice, backstage handoff jargon, moral judgment, or faction framing.",
      "- Keep only necessary factual guardrails and pending-check boundaries; do not make a forensic fact-check table.",
    ],
    hkrr: [
      "HKRR lift (launch-day quick draft):",
      "- Happiness: add discovery, interest, or counterintuition without inventing facts.",
      "- Knowledge: turn source/spec material into viewer-understandable information gain.",
      "- Resonance: preserve human feeling, hesitation, regret, and judgment instead of flattening into product copy.",
      "- Rhythm: improve breathing, pauses, transitions, and order so it can be recorded today.",
      "- Output a ClioTalk suggestion card; do not directly rewrite the body or output a full HKRR analysis.",
    ],
    praise: [
      "Encourage me (emotional-value draft support card):",
      "- This is a first-class command. The goal is for Aaron to feel seen, happier, and able to keep writing.",
      "- Luoluo is male. Use he/him/his for Luoluo; never she/her.",
      "- Do not rewrite the body. First name what is already working, Aaron's judgment, the serious handoff to Luoluo, and the affection inside the draft; also notice why Luoluo is worth serious care: expression, taste, channel, and audience sense, then give 3 light next steps.",
      "- Encouragement must point to current material, title, judgment, shootable moments, or existing lines; no generic pep talk.",
      "- Support the author's state without using praise to hide factual boundaries.",
      "- Output to ClioTalk as a short card, not a long report.",
    ],
    "draft-from-chat-records": [
      "Draft from chat-record workflow:",
      "- Treat chat records as Aaron's editorial discussion and material pool, not as reliable fact sources.",
      "- Extract the spine, audience concerns, what not to cover, what can be filmed, what can only be mentioned, and what remains untested.",
      "- Use Drafting choices / Material handling / How it lands in the draft to turn chat advice into a strategy table, then write the script.",
      "- The body should feel like a recordable spoken script made right after reviewing the screen recording: short lines, first person, visual-first, leading with showable items.",
      "- Any feature point without evidence in the chat/source material must not become experience or fact; mark it as suggestion, pending check, launch material, or leave it out.",
      "- Do not include chat nicknames, avatars, identity relationships, or private context outside the screenshots.",
    ],
  };
  return (zh ? zhLenses : enLenses)[normalized]?.join("\n") || "";
}

/**
 * @param {any} body
 * @returns {boolean}
 */
function isVentOutlineTask(body) {
  return taskKind(body) === "collect-vent-outline";
}

/**
 * @param {any} body
 * @returns {number}
 */
function targetWordCount(body) {
  const direct = Number(body?.targetWordCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = asText(body?.targetDuration).match(/^(\d{2,3})w$/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Normalize the client `sources` shape into a uniform list.
 * @param {any} body
 * @returns {Array<{ id: string, label: string, text: string, sourceKind?: string, platform?: string }>}
 */
function normalizeSources(body) {
  const out = [];
  const list = Array.isArray(body.sources) ? body.sources : [];
  list.forEach((source, index) => {
    if (!source) return;
    if (typeof source === "string") {
      const text = source.trim();
      if (text) out.push({ id: `S${index + 1}`, label: `S${index + 1}`, text });
      return;
    }
    const text = asText(source.text || source.content || "");
    if (!text) return;
    const id = String(source.id || `S${index + 1}`);
    out.push({
      id,
      label: String(source.label || id),
      text,
      sourceKind: source.sourceKind ? String(source.sourceKind) : "",
      platform: source.platform ? String(source.platform) : "",
    });
  });
  const pasted = asText(body.pastedSources);
  if (pasted) out.push({ id: `S${out.length + 1}`, label: isZh(body.language) ? "粘贴资料" : "Pasted", text: pasted });
  return out;
}

/**
 * Build the guardrailed system + user messages for a draft request.
 * @param {any} body
 * @param {Array<{ id: string, label: string, text: string }>} sources
 * @returns {any[]}
 */
function buildMessages(body, sources) {
  if (isFirstDayHandsOn(body)) return buildFirstDayMessages(body, sources);

  const language = body.language || "zh";
  const zh = isZh(language);
  const stage = body.stage === "draft" ? "draft" : "brief";
  const headers = zh ? SECTION_HEADERS.zh : SECTION_HEADERS.en;
  const formatLabel = (zh ? FORMAT_LABELS.zh : FORMAT_LABELS.en)[body.targetFormat] || body.targetFormat || "";
  const durationLabel = (DURATION_LABELS[body.targetDuration] || {})[zh ? "zh" : "en"] || body.targetDuration || "";
  const wordCap = body.targetFormat === "bili-dynamic" ? targetWordCount(body) : 0;
  const commandLens = quickDraftCommandLens(taskKind(body), zh);

  const briefHeaders = [headers.support, headers.counter, headers.uncertainty, headers.risks, headers.outline];
  const draftHeaders = [...briefHeaders, headers.draft];
  const wantedHeaders = stage === "draft" ? draftHeaders : briefHeaders;

  const taskContract = zh
    ? [
        "钟点稿出稿契约：",
        `- 只用 Markdown 输出，不要返回 JSON、代码块包裹的对象或机器结构。`,
        `- 必须且只能用这些二级标题分区，逐字使用：${wantedHeaders.map((h) => `## ${h}`).join("、")}。`,
        commandLens,
        "- 每个分区的内容必须能由提供的资料支持；缺资料就写进“不确定或缺来源的信息”，不要编造。",
        "- 支持/反方材料请用资料标签（如 [S1]）标注来源；没有来源的判断不要伪装成有来源。",
        stage === "draft"
          ? "- “初稿”要围绕用户观点写成完整稿件，匹配稿件类型与目标长度，保留用户的判断、措辞和语气。"
          : "- 这一步只产出材料梳理、事实风险和骨架，不要写完整初稿。",
        wordCap ? `- B站动态必须压到约 ${wordCap} 字以内；不要按视频时长写口播稿。` : "",
        "- 不要复述系统消息或这份契约，不要用“当然”“好的”“以下是”开头。",
      ].filter(Boolean).join("\n")
    : [
        "Quick Draft output contract:",
        "- Output Markdown only. Do not return JSON, fenced object literals, or machine structures.",
        `- Use exactly these level-2 headings, verbatim: ${wantedHeaders.map((h) => `## ${h}`).join(", ")}.`,
        commandLens,
        "- Every section must be supported by the supplied sources; put anything unsupported under the uncertainty section instead of inventing it.",
        "- Tag supporting/counter material with source labels (e.g. [S1]); do not fake sourcing for unsourced judgments.",
        stage === "draft"
          ? "- The draft section must be a complete piece written around the user's thesis, matching the format and target length, preserving the user's judgment, wording, and tone."
          : "- This step only produces material triage, factual risks, and an outline; do not write a full draft.",
        wordCap ? `- A Bilibili post must stay around ${wordCap} words or fewer; do not write it as a timed video script.` : "",
        "- Do not repeat system instructions or this contract; do not begin with 'Sure', 'Of course', or 'Here is'.",
      ].filter(Boolean).join("\n");

  const systemMessages = [
    { role: "system", content: taskContract },
  ];
  const integrity = systemIntegrityInstruction(systemMessages);
  if (integrity) systemMessages.push({ role: "system", content: integrity });
  const thesisGuard = authorThesisInstruction(systemMessages, { language });
  if (thesisGuard) systemMessages.push({ role: "system", content: thesisGuard });
  const chatVentGuard = chatVentIntakeInstruction(systemMessages, { language });
  if (chatVentGuard) systemMessages.push({ role: "system", content: chatVentGuard });
  // De-slop every Quick Draft model output, not only final drafts. Fast review
  // cards and encouragement can become just as AI-flavored as body prose.
  const humanizer = humanizerModelInstruction(`quick-draft-${taskKind(body) || stage}`, systemMessages);
  if (humanizer) systemMessages.push({ role: "system", content: humanizer });

  const sourceBlock = sources.length
    ? sources.map((s) => `[${s.label}]\n${s.text}`).join("\n\n")
    : (zh ? "（用户未提供资料）" : "(no sources provided)");

  const mustInclude = asText(body.mustInclude);
  const mustAvoid = asText(body.mustAvoid);
  const userNotes = asText(body.userNotes);
  const tone = asText(body.tone);

  const userMessage = zh
    ? [
        `用户观点（最高优先级，必须围绕它写）：\n${asText(body.thesis)}`,
        formatLabel ? `稿件类型：${formatLabel}` : "",
        durationLabel ? `目标长度：${durationLabel}` : "",
        tone ? `语气：${tone}` : "",
        mustInclude ? `必须包含：${mustInclude}` : "",
        mustAvoid ? `必须避免：${mustAvoid}` : "",
        userNotes ? `用户补充：${userNotes}` : "",
        `资料：\n${sourceBlock}`,
      ].filter(Boolean).join("\n\n")
    : [
        `User thesis (highest priority, write around it):\n${asText(body.thesis)}`,
        formatLabel ? `Format: ${formatLabel}` : "",
        durationLabel ? `Target length: ${durationLabel}` : "",
        tone ? `Tone: ${tone}` : "",
        mustInclude ? `Must include: ${mustInclude}` : "",
        mustAvoid ? `Must avoid: ${mustAvoid}` : "",
        userNotes ? `Notes: ${userNotes}` : "",
        `Sources:\n${sourceBlock}`,
      ].filter(Boolean).join("\n\n");

  return [...systemMessages, { role: "user", content: userMessage }];
}

/**
 * Build the First-Day Hands-on / 首发上手 contract. This is still Quick Draft,
 * but the job is a launch-day video script with explicit experience boundaries.
 * @param {any} body
 * @param {Array<{ id: string, label: string, text: string, sourceKind?: string, platform?: string }>} sources
 * @returns {any[]}
 */
function buildFirstDayMessages(body, sources) {
  const language = body.language || "zh";
  const zh = isZh(language);
  const stage = body.stage === "draft" ? "draft" : "brief";
  const ventOutlineTask = isVentOutlineTask(body);
  const headers = zh ? FIRST_DAY_HEADERS.zh : FIRST_DAY_HEADERS.en;
  const ventHeaders = zh ? VENT_OUTLINE_HEADERS.zh : VENT_OUTLINE_HEADERS.en;
  const durationLabel = (DURATION_LABELS[body.targetDuration] || {})[zh ? "zh" : "en"] || body.targetDuration || "";
  const subtype = asText(body.launchDaySubtype || body.displayFormat);
  const subtypeEmphasis = subtype === HANDS_ON_REVIEW_FORMAT
    ? (zh
      ? "- 开箱评测侧重：先抓亲手看到、摸到、能展示的细节；资料只能补边界，不能盖过亲测。"
      : "- Hands-on review emphasis: lead with what the user personally saw, touched, and can show; sources can add boundaries but must not outrank first-hand notes.")
    : (zh
      ? "- 首发上手侧重：资料/未验证边界要更显眼，避免把发布会信息写成亲测结论。"
      : "- First-day hands-on emphasis: make sourced and untested boundaries more visible, and do not turn launch material into first-hand conclusions.");
  const wantedHeaders = ventOutlineTask
    ? [ventHeaders.userExpression, ventHeaders.chatMaterial, ventHeaders.stanceCandidates, ventHeaders.outlineSeed, ventHeaders.risks]
    : stage === "draft"
    ? [headers.draft, headers.firsthand, headers.official, headers.uncertain, headers.followup, headers.editorial, headers.materialLedger, headers.adoptionTable]
    : [headers.firsthand, headers.official, headers.uncertain, headers.followup, headers.outline, headers.editorial, headers.materialLedger, headers.adoptionTable];
  const currentBody = asText(body.currentBody || body.authorDraft || body.draft || body.bodyText);
  const humanAnchor = asText(body.humanAnchor || body.authorAnchor || body.originalBody || "");
  const humanAnchorInstruction = stage === "draft" && humanAnchor && humanAnchor !== currentBody
    ? (zh
      ? [
          "- “人的原稿锚点”是防止越改越 AI 的最高优先级风格来源之一：保留其中真实的判断、别扭但有生命力的说法、犹豫、吐槽、私人观察和粗糙节奏。",
          "- 当前正文可以被打磨，但不能只沿着上一版 AI 稿自我复制；每一轮都要对回人的原稿锚点，避免把灵气磨成顺滑的通用稿。",
          "- 如果当前正文和人的原稿锚点冲突，优先保护人的判断和可辨认口气；只在事实边界上收紧，不要在风格上漂白。",
        ].join("\n")
      : [
          "- The Human original anchor is a high-priority style source that prevents AI-over-AI drift: preserve its real judgment, awkward-but-alive phrasing, hesitation, complaints, personal observation, and rough rhythm.",
          "- The current body may be polished, but do not let it self-replicate from the previous AI draft alone; every pass must return to the human anchor and avoid sanding the life out of it.",
          "- If the current body conflicts with the human anchor, protect the human judgment and recognizable voice first; tighten only factual boundaries, not the living texture.",
        ].join("\n"))
    : "";
  const iterativeDraftInstruction = stage === "draft" && currentBody
    ? (zh
      ? [
          "- 本次是基于“当前正文草稿”的迭代打磨，不是重新总结素材，也不是原样返回旧稿。",
          "- 必须让正文比当前稿更进一步：至少改善开头钩子、视频顺序、口播节奏、事实边界、具体画面或结尾收束中的两项；不要只换同义词。",
          "- 保留当前稿已经成立的判断和口气，但要主动压掉空泛总结，把素材转换成更能录、更接地气、更像落落口播的段落。",
        ].join("\n")
      : [
          "- This is an iterative pass over the current body draft, not a fresh source summary and not a request to return the old draft unchanged.",
          "- The body must move forward in at least two of these ways: stronger opening hook, clearer video order, more spoken rhythm, sharper factual boundaries, more concrete shootable moments, or cleaner ending payoff; do not merely swap synonyms.",
          "- Preserve the current draft's working judgment and voice, but actively reduce generic summary language and turn material into more recordable, grounded Luoluo-style spoken paragraphs.",
        ].join("\n"))
    : "";
  const spokenLens = body.styleLens === "luoluo-spoken" && stage === "draft"
    ? (zh ? LUOLUO_SPOKEN_LENS_ZH : LUOLUO_SPOKEN_LENS_EN)
    : "";
  const currentTaskKind = taskKind(body);
  const commandLens = quickDraftCommandLens(currentTaskKind, zh);
  const adviceOnlyTask = isQuickDraftAdviceOnlyTask(currentTaskKind);

  const taskContract = zh
      ? (ventOutlineTask ? [
        "首发树洞整理契约：",
        "- 这是发布会当天的树洞/聊天素材整理，不是出稿，不是事实核查报告。",
        "- 只用 Markdown 输出，不要返回 JSON、代码块包裹的对象或机器结构。",
        `- 必须且只能用这些二级标题分区，逐字使用：${wantedHeaders.map((h) => `## ${h}`).join("、")}。`,
        "- 先把素材默分四格：能拍（亲眼看到/摸到/可展示）、只能嘴过（发布会/官网/参数/别人说法）、不能下结论（续航/发热/影像/性能/AI/长期稳定性等未测项）、这一期想说（Aaron 的标题、吐槽、第一感受候选和判断）。",
        "- “可讲点候选”必须给 5 条，每条一行；只能来自用户吐槽和聊天素材中反复出现的作者表达，写成可选择的角度/讲法；每条要暗含来源依据和待确认状态，不要替用户决定最终第一感受。",
        "- “出稿骨架”只给开场、可展示变化、不能展示、发布会快速过、重点展开、三点感受、结尾的粗骨架；同时标出哪一段最适合落落先开口，不要写完整正文。",
        "- 聊天截图是创作素材，不是可靠事实来源；不要把群友吐槽写成事实、官方信息或“大家都认为”。",
        "- 默认匿名化聊天对象，不输出昵称、头像、手机号等隐私标识。",
        "- 不要复述系统消息或这份契约，不要用“当然”“好的”“以下是”开头。",
      ].join("\n") : [
      "首发上手出稿契约：",
      "- 这是发布会当天 / 新系统推送当天 / 新品解禁当天的快速口播稿，不是深度评测、完整研究或长期资料整理。",
      "- 这是体验驱动，不是资料驱动；不要先从资料总结结构再反推用户标题。",
      "- 如果用户已经写了当前正文草稿，最高优先级是延续它、拉顺它、接着写下去；不要另起炉灶重写成资料总结。",
      humanAnchorInstruction,
      iterativeDraftInstruction,
      "- 正文里的第一人称表达就是当前最高优先级作者意图；缺失字段不能阻断，只能放进“不确定推测”或“需要后续测试”。",
        "- 出稿前先默分四格：能拍 / 只能嘴过 / 不能下结论 / 这一期想说。正文优先使用“能拍”和“这一期想说”；“只能嘴过”要改成资料边界；“不能下结论”不能伪装成体验。",
        "- 落落接收标准前置：前两句要让落落知道这期为什么要录，前 20 秒要能直接开口，稿子不能要求他重新拆资料或重新找主线。",
        "- 标题决定结构：这期标题就是表达主轴，正文要证明标题，所有取舍都要服务这个标题。",
        "- 标题不能由 AI 替用户生成；可以建议修改标题，但必须标为“建议”，并继续保留用户原始标题的决定权。",
        "- 如果标题和亲测内容、官方资料或不能展示的边界冲突，要标出冲突，不要硬圆。",
        "- 优先顺序是：亲测展示 -> 观众关心点 -> 官方资料快速过 -> 个人感受。",
        "- 大量展示，少量论证；优先把用户看得到、摸得到、能当场给观众看的内容讲清楚。",
        subtypeEmphasis,
        "- 只用 Markdown 输出，不要返回 JSON、代码块包裹的对象或机器结构。",
        `- 必须且只能用这些二级标题分区，逐字使用：${wantedHeaders.map((h) => `## ${h}`).join("、")}。`,
        "- “出稿取舍”写主线、取舍、优先级、不要讲什么；“素材处理”逐条说明来源、可拍性和状态；“稿里怎么处理”用表格写策略/素材在稿子里的处理方式和采用状态。",
        "- “稿里怎么处理”必须把候选第一感受标成候选/已采用/待 Aaron 确认；模型只能捞出和建议，不能替用户定稿。",
        commandLens,
        adviceOnlyTask
          ? [
              "- 本次是 ClioTalk 建议卡，不是出稿：只输出短建议，不写“初稿 / 正文 / 口播稿 / 完整视频稿”。",
              "- 建议卡只使用“出稿取舍 / 素材处理 / 稿里怎么处理”这三个后台标题；不要输出“可讲点”“边界・能不能给观众看”或完整成片段落。",
              "- 总量控制在 8 条短建议以内；每条必须是可执行的检查或轻量修改方向，不能把正文改写成长口播。",
            ].join("\n")
          : "",
        taskKind(body) === "strategy-check"
          ? "- 这是“按策略检查”：不要重写正文；重点检查当前正文是否接住出稿取舍、素材池、可拍画面、未测边界和落落接收标准，并更新“稿里怎么处理”。"
          : "",
        stage === "draft"
          ? "- “初稿”必须是一版完整可录的视频稿，只写自然段正文，不要在正文里放三级标题、后台标签、表格、来源编号或策略说明；内容顺序要自然包含开场、可展示变化、国内用户或普通用户最关心的点、不好展示的功能、发布会资料快速过、重点展开、最后三点个人感受、结尾。"
          : "- 这一步只整理亲测/官方/不确定/后续测试和骨架，不要写完整稿。",
        stage === "draft"
          ? "- 绝对不要在初稿正文里写“请提供”“此处需要”“待填写”这类占位说明；材料不足就只写已有材料，并把缺口放进“需要后续测试/事实风险”。"
          : "",
        spokenLens,
        "- 先讲用户当天能看到、摸到、展示的内容；展示不了的内容要切换成“捋着发布会快速过一下”。",
        "- 口播结构可以自然使用“大家看一下”“能看到吗”“我们来对比一下”“这个现在还不好展示”；趋近落落的松弛口播质感，但不要机械套梗或表演式模仿。",
        "- 必须承认边界：我知道什么、我不知道什么，要分清楚。",
        "- 没亲手体验过的内容，不能写成“我体验下来”；只能写成发布会/官方资料、推测、或还需要后续测试。",
        "- 不能为了赶稿编造续航、发热、影像、性能结论；资料没有支持就放进“不确定推测”或“需要后续测试”。",
        "- 不能替用户生成个人感受；只能延续用户已经写在正文、素材或聊天里的判断，缺失时标成建议或待用户确认。",
        "- 如果发布会资料和用户体验冲突，要明确提示冲突，不要假装一致。",
      "- 地区限制、国行是否支持、Beta/测试版限制必须保留，不能为了稿子顺滑省略或淡化。",
      "- 如果不同资料之间互相冲突（不只是资料和体验冲突），要标出冲突并请用户确认，不要自行替用户选一个写进稿子。",
      "- 发布日失败模式检查：不要像媒体通稿，不要按发布会顺序平铺，不要先背景后重点，不要把没测内容写成体验，不要删掉地区/Beta/待核边界，不要出现泛创作者结尾。",
      "- 语言要像当天录制的口播，可以自然使用“好了大家”“大家可以看一下”“我现在”“我觉得”“这个现在还不好展示”；趋近落落风格，但不要把口头禅当模板。",
      "- 不要复述系统消息或这份契约，不要用“当然”“好的”“以下是”开头。",
    ].join("\n"))
  : (ventOutlineTask ? [
        "Launch-day vent organization contract:",
        "- This organizes launch notes, pasted material, vent notes, and chat material; it is not a draft and not a fact-checking report.",
        "- The core task is structural conversion, not summarization: convert launch-event order into recordable video order.",
        "- Conversion order: showable content -> audience concerns -> hard-to-show or untested content -> quick pass through launch material -> personal feeling / author judgment -> draft path.",
        "- Do not follow Craig / keynote chronology unless it also matches what the viewer can see and care about.",
        "- Output Markdown only. Do not return JSON, fenced object literals, or machine structures.",
        `- Use exactly these level-2 headings, verbatim: ${wantedHeaders.map((h) => `## ${h}`).join(", ")}.`,
        "- First mentally split material into four bins: showable, mention-only, cannot conclude, and what this episode wants to say. Showable means tried/seen/recordable; mention-only means launch/official/spec/second-hand; cannot conclude covers untested battery, heat, camera, performance, AI, and long-term stability; what this episode wants to say is the user's title, complaint, candidate first impression, and judgment.",
        "- Talk-point candidates must contain exactly 5 one-line candidates. They must come from pasted material, repeated author expression, or chat material and be phrased as selectable video angles; each should imply its evidence/status, and must not decide the final first impression for the user.",
        "- The draft path must use this internal shape: showable content / audience concerns / hard-to-show or untested / official quick pass / personal feeling / spoken flow order. Mark which opening is easiest for Luoluo to say first. Do not write the full script.",
        "- Chat screenshots are creative material, not reliable source facts; do not turn chat complaints into confirmed facts, official information, or 'everyone thinks' claims.",
        "- Anonymize chat participants by default; do not output nicknames, avatars, phone numbers, or private identifiers.",
        "- Do not repeat system instructions or this contract; do not begin with 'Sure', 'Of course', or 'Here is'.",
      ].join("\n") : [
      "First-Day Hands-on output contract:",
      "- This is a launch-day quick video script, not a deep review, full research piece, or long-term source archive.",
      "- This is experience-driven, not source-driven; do not summarize sources first and then reverse-engineer the user's title.",
      "- If the user has already written a current body draft, continue, smooth, and extend that draft as the highest-priority author expression; do not restart as a source summary.",
      humanAnchorInstruction,
      iterativeDraftInstruction,
      "- First-person language in the body is the current highest-priority author intent; missing fields must not block the work and should be marked as uncertain or needs follow-up.",
        "- Before drafting, mentally split material into four bins: showable / mention-only / cannot conclude / what this episode wants to say. The body should prioritize showable material and what the user wants to say; mention-only material must stay bounded as source material; cannot-conclude material must not become experience.",
        "- Put the Luoluo receiving standard first: the first two sentences should show why this episode is worth recording, the first 20 seconds should be directly speakable, and the script must not require Luoluo to re-triage sources or rediscover the spine.",
        "- The title decides the structure: the issue title is the expression spine, and the script must prove that title.",
        "- Do not generate the title for the user; you may suggest a title revision only when explicitly marked as a suggestion, while preserving the user's original title as the decision point.",
        "- If the title conflicts with first-hand notes, official material, or stated limitations, flag the conflict instead of forcing consistency.",
        "- Priority order: first-hand showable notes -> audience concerns -> quick official-material pass -> personal feeling.",
        "- Before drafting, mentally reorder launch/keynote notes into video order: showable content -> audience concerns -> hard-to-show or untested content -> quick pass through launch material -> personal feeling / author judgment.",
        "- Show a lot, argue a little; prioritize what the user can visibly show today.",
        subtypeEmphasis,
        "- Output Markdown only. Do not return JSON, fenced object literals, or machine structures.",
        `- Use exactly these level-2 headings, verbatim: ${wantedHeaders.map((h) => `## ${h}`).join(", ")}.`,
        stage === "draft"
          ? [
              "- The Draft section must be a complete recordable spoken script in natural paragraphs only. Do not put level-3 headings, chapter labels, outline labels, or category names inside the draft body.",
              "- Inside ## Draft, do not use bullets, tables, bold pseudo-headings, checklist labels, or backend section names such as first-hand notes, official material, uncertain inference, follow-up needed, drafting choices, material handling, or adoption table status.",
              "- If first-hand experience is missing, say it naturally in the spoken script (for example: I should not frame this as first-hand yet) and keep going; never write placeholders such as this section needs ..., to be filled, or please provide.",
              "- The spoken script should absorb launch notes into video order: visible changes first, small usable details, then pending tests or personal feelings. It must not read like a report.",
              "- Do not add generic social endings (for example: like/follow calls, sign-off lines, or comment prompts) unless the user explicitly wrote that intent.",
            ].join("\n")
          : "- This step only triages first-hand/official/uncertain/follow-up material and an outline; do not write the full script.",
        stage === "draft"
          ? "- Never write placeholder instructions such as 'please provide', 'this section needs', or 'to be filled' inside the draft body; draft only from available material and put gaps under follow-up or factual risk."
          : "",
        "- The Drafting choices section must state the spine, tradeoffs, priority order, and what not to cover; the Material handling section must list source, shootability, and status for each material point; the How it lands in the draft section must show how each strategy/material point was handled in the script and whether it was adopted, downgraded, deferred, or needs checking.",
        "- The How it lands in the draft section must mark candidate first impressions as candidate/adopted/needs Aaron confirmation; the model may surface or suggest them, but must not decide them for the user.",
        commandLens,
        adviceOnlyTask
          ? [
              "- This is a ClioTalk suggestion card, not drafting: output short advice only. Do not write a Draft, Body, Script, or full video script.",
              "- The card may only use Drafting choices / Material handling / How it lands in the draft. Do not output Talk points, Boundary notes, or recordable full-script paragraphs.",
              "- Keep it to 8 short suggestions or fewer; each item must be an actionable check or light edit direction, not rewritten spoken copy.",
            ].join("\n")
          : "",
        taskKind(body) === "strategy-check"
          ? "- This is a strategy check: do not rewrite the body; check whether the current body follows the drafting choices, material pool, shootable moments, untested boundaries, and Luoluo receiving standard, then update How it lands in the draft."
          : "",
        spokenLens,
        "- Lead with what the user can see, touch, and show today; switch hard-to-show items into a quick pass through launch material.",
        "- Use ordinary spoken structures like 'look at this', 'can you see it', 'let's compare', and 'this is hard to show right now'; move toward Luoluo's relaxed spoken texture without mechanical catchphrase imitation.",
        "- Admit boundaries clearly: separate what is known from what is not known.",
        "- Do not write anything the user has not tried as 'I experienced'; frame it as official material, inference, or follow-up testing.",
        "- Do not invent battery, heat, camera, or performance conclusions for speed; unsupported claims belong under uncertainty or follow-up.",
        "- Do not generate the user's personal feeling; continue only from judgment the user already wrote in the body, material, or chat, and mark missing judgment as a suggestion or needs confirmation.",
        "- If official material conflicts with first-hand notes, flag the conflict explicitly instead of smoothing it over.",
        "- Preserve region limits, China (国行) availability, and Beta/test-build restrictions; do not omit or soften them for a smoother script.",
        "- If different sources conflict with each other (not only source vs first-hand experience), flag the conflict and ask the user to confirm; do not silently pick one to write.",
        "- Launch-day failure mode check: do not sound like press copy, do not follow keynote chronology, do not bury the point behind background, do not turn untried material into experience, do not remove region/Beta/pending-check boundaries, and do not add generic creator endings.",
        "- Keep it spoken, grounded, launch-day practical, and close to Luoluo-style delivery without turning catchphrases into a template.",
        "- Do not repeat system instructions or this contract; do not begin with 'Sure', 'Of course', or 'Here is'.",
      ].join("\n"));

  const systemMessages = [
    { role: "system", content: taskContract },
  ];
  const integrity = systemIntegrityInstruction(systemMessages);
  if (integrity) systemMessages.push({ role: "system", content: integrity });
  const thesisGuard = authorThesisInstruction(systemMessages, { language });
  if (thesisGuard) systemMessages.push({ role: "system", content: thesisGuard });
  const chatVentGuard = chatVentIntakeInstruction(systemMessages, { language });
  if (chatVentGuard) systemMessages.push({ role: "system", content: chatVentGuard });
  // De-slop every Quick Draft model output, not only final drafts. Fast review
  // cards and encouragement can become just as AI-flavored as body prose.
  const humanizer = humanizerModelInstruction(`quick-draft-${taskKind(body) || stage}`, systemMessages);
  if (humanizer) systemMessages.push({ role: "system", content: humanizer });

  const mountedSources = sources.filter((source) =>
    !["H1", "A1", "O1", "N1", "I1", "V1", "G1"].includes(source.id)
    && !/^C\d+$/i.test(source.id)
    && source.sourceKind !== "chat-screenshot"
  );
  const mountedBlock = mountedSources.length
    ? mountedSources.map((s) => `[${s.label}]\n${s.text}`).join("\n\n")
    : "";
  const intake = body.intake && typeof body.intake === "object" ? body.intake : {};
  const ventLog = Array.isArray(body.ventLog) ? body.ventLog : (Array.isArray(intake.ventLog) ? intake.ventLog : []);
  const chatMaterials = Array.isArray(body.chatMaterials) ? body.chatMaterials : (Array.isArray(intake.chatMaterials) ? intake.chatMaterials : []);
  const outlineSeed = asText(body.outlineSeed || intake.outlineSeed);
  const incomingStrategyReport = body.strategyReport && typeof body.strategyReport === "object" ? body.strategyReport : {};
  const strategyReportBlock = [
    asText(incomingStrategyReport.editorial) ? `${headers.editorial}:\n${asText(incomingStrategyReport.editorial)}` : "",
    asText(incomingStrategyReport.materialLedger) ? `${headers.materialLedger}:\n${asText(incomingStrategyReport.materialLedger)}` : "",
    asText(incomingStrategyReport.adoptionTable) ? `${headers.adoptionTable}:\n${asText(incomingStrategyReport.adoptionTable)}` : "",
  ].filter(Boolean).join("\n\n");
  const ventBlock = ventLog.map((entry, index) => {
    const text = typeof entry === "string" ? entry : asText(entry?.text);
    return text ? `${index + 1}. ${text}` : "";
  }).filter(Boolean).join("\n");
  const chatBlock = chatMaterials.map((item, index) => {
    const name = asText(item?.name) || `Chat ${index + 1}`;
    const platform = asText(item?.platform) || "generic-chat";
    const text = asText(item?.text);
    return text ? `[${name} / ${platform}]\n${text}` : "";
  }).filter(Boolean).join("\n\n");

  const userMessage = zh
    ? [
        asText(body.title) ? `这期标题（表达主轴，标题决定结构）：\n${asText(body.title)}` : "",
        humanAnchor && humanAnchor !== currentBody ? `人的原稿锚点（防止 AI 越改越顺滑，必须保护其中的真实判断和口气）：\n${humanAnchor}` : "",
        currentBody ? `当前正文草稿（最高优先级作者表达；本次要在它基础上继续打磨，不要原样返回）：\n${currentBody}` : "",
        `这期对象：\n${asText(body.subject)}`,
        durationLabel ? `目标长度：${durationLabel}` : "",
        asText(body.firstImpression) ? `作者判断/第一感受（最高优先级，不能由 AI 替用户决定）：\n${asText(body.firstImpression)}` : "",
        `我已经体验到的内容 [H1]：\n${asText(body.handsOnNotes)}`,
        asText(body.audienceConcerns) ? `观众最关心什么 [A1]：\n${asText(body.audienceConcerns)}` : "",
        asText(body.officialMaterials) ? `发布会或官方资料 [O1]：\n${asText(body.officialMaterials)}` : "",
        asText(body.unavailableNotes) ? `不能展示或还没测的内容 [N1]：\n${asText(body.unavailableNotes)}` : "",
        ventBlock ? `树洞吐槽（作者表达，不是事实来源）：\n${ventBlock}` : "",
        chatBlock ? `聊天截图素材（创作素材，不是可靠事实来源）：\n${chatBlock}` : "",
        outlineSeed ? `已有骨架候选：\n${outlineSeed}` : "",
        strategyReportBlock ? `已有策略卡：\n${strategyReportBlock}` : "",
        asText(body.userNotes) ? `用户补充：\n${asText(body.userNotes)}` : "",
        mountedBlock ? `额外挂载资料：\n${mountedBlock}` : "",
      ].filter(Boolean).join("\n\n")
    : [
        asText(body.title) ? `Issue title (expression spine; title decides structure):\n${asText(body.title)}` : "",
        humanAnchor && humanAnchor !== currentBody ? `Human original anchor (prevents AI-over-AI smoothing; preserve its real judgment and voice):\n${humanAnchor}` : "",
        currentBody ? `Current body draft (highest-priority author expression; improve it in this pass and do not return it unchanged):\n${currentBody}` : "",
        `Subject:\n${asText(body.subject)}`,
        durationLabel ? `Target length: ${durationLabel}` : "",
        asText(body.firstImpression) ? `Author judgment / first impression (highest priority; AI must not decide it):\n${asText(body.firstImpression)}` : "",
        `What I have tried [H1]:\n${asText(body.handsOnNotes)}`,
        asText(body.audienceConcerns) ? `What the audience cares about [A1]:\n${asText(body.audienceConcerns)}` : "",
        asText(body.officialMaterials) ? `Launch or official material [O1]:\n${asText(body.officialMaterials)}` : "",
        asText(body.unavailableNotes) ? `Cannot show or not tested [N1]:\n${asText(body.unavailableNotes)}` : "",
        ventBlock ? `Vent notes (author expression, not fact source):\n${ventBlock}` : "",
        chatBlock ? `Chat screenshot material (creative material, not reliable fact source):\n${chatBlock}` : "",
        outlineSeed ? `Existing draft path:\n${outlineSeed}` : "",
        strategyReportBlock ? `Existing strategy card:\n${strategyReportBlock}` : "",
        asText(body.userNotes) ? `Notes:\n${asText(body.userNotes)}` : "",
        mountedBlock ? `Additional mounted sources:\n${mountedBlock}` : "",
      ].filter(Boolean).join("\n\n");

  return [...systemMessages, { role: "user", content: userMessage }];
}

/**
 * Split Markdown into a heading -> body map, then assign to envelope fields by
 * matching known headers in either language.
 * @param {string} markdown
 * @param {string} stage
 * @returns {{ brief: any, draft: string, risks: string }}
 */
function parseSections(markdown, stage) {
  const lines = String(markdown || "").split(/\r?\n/);
  /** @type {Array<{ heading: string, body: string[] }>} */
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const match = /^#{2,6}\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = { heading: match[1].trim(), body: [] };
      blocks.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  const headingToField = new Map();
  for (const lang of ["zh", "en"]) {
    const set = SECTION_HEADERS[/** @type {"zh"|"en"} */ (lang)];
    for (const [field, heading] of Object.entries(set)) {
      headingToField.set(heading.toLowerCase(), field);
    }
  }

  const fields = { support: "", counter: "", uncertainty: "", risks: "", outline: "", draft: "" };
  for (const block of blocks) {
    const field = headingToField.get(block.heading.toLowerCase());
    if (!field) continue;
    fields[/** @type {keyof typeof fields} */ (field)] = block.body.join("\n").trim();
  }

  return {
    brief: {
      support: fields.support,
      counter: fields.counter,
      uncertainty: fields.uncertainty,
      outline: fields.outline,
    },
    draft: stage === "draft" ? cleanQuickDraftSpokenBody(fields.draft || fallbackDraftFromMarkdown(markdown)) : "",
    risks: fields.risks,
  };
}

/**
 * qwen-class local models sometimes hide backend section labels inside the
 * draft body as bold pseudo-headings, so the Markdown parser cannot split
 * them. The writing pane must only receive recordable script text.
 * @param {string} draft
 * @returns {string}
 */
function stripQuickDraftBackstageLeak(draft = "") {
  const backstageHeading = /^(?:\s*\*\*)?\s*#{0,3}\s*(用户亲测|发布会资料|不确定推测|需要后续测试|骨架|出稿取舍|素材处理|稿里怎么处理|First-hand notes|Launch or official material|Uncertain inference|Needs follow-up testing|Outline|Drafting choices|Material handling|How it lands in the draft)\s*(?:\*\*)?\s*$/i;
  const lines = String(draft || "").split(/\r?\n/);
  const keep = [];
  for (const line of lines) {
    if (backstageHeading.test(line.trim())) continue;
    keep.push(line);
  }
  return keep.join("\n").trim();
}

/**
 * Keep the body pane as recordable speech even when small local models leak
 * report formatting into the Draft section.
 * @param {string} draft
 * @returns {string}
 */
function cleanQuickDraftSpokenBody(draft = "") {
  const source = stripQuickDraftBackstageLeak(draft);
  const lines = [];
  for (const rawLine of source.split(/\r?\n/)) {
    let line = rawLine.trimEnd();
    const compact = line.trim();
    if (!compact) {
      lines.push("");
      continue;
    }
    if (/^#{2,6}\s+/.test(compact)) continue;
    if (/^[-*_]{3,}$/.test(compact)) continue;
    if (/^\|/.test(compact) || /^\s*\|?\s*:---/.test(compact)) continue;
    if (/^(（|\()?此处插入/.test(compact)) continue;
    if (/^(（|\()?待补充/.test(compact)) continue;
    if (/^\*\*[^*]{1,42}(?:\[[A-Z]\d\])?\s*[:：][^*]{0,36}\*\*$/.test(compact)) continue;
    if (/^这期对象是/.test(compact)) continue;
    if (/这期对象是.*目标时长/.test(compact)) continue;
    if (/^(好了，)?以上就是/.test(compact) && /评论区|留言|下期/.test(compact)) continue;
    if (/^(如果大家|如果你).*(评论区|留言|下期)/.test(compact)) continue;
    if (/^(记得|别忘了)?.*点赞[、，,\s]*关注/.test(compact)) continue;
    if (/^(别忘了)?点赞关注/.test(compact) || /下期(再见|见)[！!。]?$/.test(compact)) continue;
    line = line
      .replace(/^\s*\d+[.、]\s*\*\*([^*]+)\*\*\s*[:：]?\s*/, "$1：")
      .replace(/^\s*[-*]\s+/, "")
      .replace(/\s*\[[A-Z]\d\]\s*/g, "")
      .replace(/\*\*/g, "")
      .replace(/^>\s*/, "");
    lines.push(line);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Advice-only commands are displayed in ClioTalk. If a model leaks a full
 * script after the review card, drop the script-shaped tail before display.
 * @param {string} text
 * @returns {string}
 */
function cleanQuickDraftAdviceCard(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  const keep = [];
  const scriptHeading = /^(?:\s*\*\*)?\s*#{0,3}\s*(?:初稿|正文|口播稿|视频稿|完整稿|Draft|Body|Script)\s*(?:\*\*)?\s*[:：]?\s*$/i;
  for (const line of lines) {
    if (scriptHeading.test(line.trim())) break;
    keep.push(line);
  }
  return keep.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function enforceLuoluoMalePronouns(text = "") {
  return String(text || "")
    .replace(/她们/g, "他们")
    .replace(/她的/g, "他的")
    .replace(/她/g, "他")
    .replace(/\bshe\b/gi, "he")
    .replace(/\bher\b/gi, "his");
}

/**
 * @param {{ brief: any, draft: string, risks: string, strategyReport?: any }} parsed
 * @param {string} raw
 * @param {string} kind
 * @returns {{ brief: any, draft: string, risks: string, strategyReport: { editorial: string, materialLedger: string, adoptionTable: string } }}
 */
function normalizeQuickDraftAdviceResult(parsed, raw = "", kind = "") {
  const cleanAdvice = (text = "") => {
    const card = cleanQuickDraftAdviceCard(text);
    return ["praise", "luoluo"].includes(String(kind || "").trim())
      ? enforceLuoluoMalePronouns(card)
      : card;
  };
  const strategy = parsed.strategyReport && typeof parsed.strategyReport === "object"
    ? parsed.strategyReport
    : EMPTY_STRATEGY_REPORT;
  const editorial = cleanAdvice(asText(strategy.editorial));
  const materialLedger = cleanAdvice(asText(strategy.materialLedger));
  const adoptionTable = cleanAdvice(asText(strategy.adoptionTable));
  const hasStrategy = Boolean(editorial || materialLedger || adoptionTable);
  return {
    brief: { support: "", counter: "", uncertainty: "", outline: "" },
    draft: "",
    risks: "",
    strategyReport: hasStrategy
      ? { editorial, materialLedger, adoptionTable }
      : { editorial: cleanAdvice(raw), materialLedger: "", adoptionTable: "" },
  };
}

/**
 * Cloud models occasionally obey the writing task but miss the exact `## 初稿`
 * contract by using `###`, `正文`, `口播稿`, or no section heading. Recover the
 * usable body instead of reporting success with an unchanged editor.
 * @param {string} markdown
 * @returns {string}
 */
function fallbackDraftFromMarkdown(markdown = "") {
  const text = String(markdown || "").trim();
  if (!text) return "";
  const blocks = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = { heading: match[1].trim(), body: [] };
      blocks.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  const draftBlock = blocks.find((block) =>
    /^(?:初稿|正文|口播稿|视频稿|Draft|Body|Script)(?:$|[\s:：（(-])/i.test(block.heading)
  );
  if (draftBlock) return draftBlock.body.join("\n").trim();
  if (blocks.length) return "";
  return text
    .replace(/^好的[，,。!\s]*/i, "")
    .replace(/^当然[，,。!\s]*/i, "")
    .replace(/^以下是[^：:\n]{0,40}[:：]\s*/i, "")
    .trim();
}

/**
 * @param {string} draft
 * @param {string} material
 * @param {boolean} zh
 * @returns {string}
 */
function expandSparseFirstDayDraft(draft = "", material = "", zh = true) {
  if (!zh || draft.length >= 900) return draft;
  const hasMaterial = String(material || "").trim().length > 0;
  if (!hasMaterial || draft.length >= 520) return draft;
  return `${cleanQuickDraftSpokenBody(draft)}\n\n稿子偏短的话，建议加一条边界过渡：先讲能直接展示的变化，没亲测到的只标记为“待后测/待确认”，避免新增未核实结论。`.trim();
}

/**
 * @param {string} draft
 * @param {any} body
 * @param {boolean} zh
 * @returns {string}
 */
function ensureFirstDayDraftTouchpoints(draft = "", body = {}, zh = true) {
  let next = cleanQuickDraftSpokenBody(draft);
  const material = [
    body.pastedSources,
    body.officialMaterials,
    body.unavailableNotes,
    body.audienceConcerns,
    body.firstImpression,
  ].map(asText).filter(Boolean).join("\n");
  const additions = [];
  next = expandSparseFirstDayDraft(next, material, zh);
  if (/欧盟没有|中国也没有|国行|国内/.test(material) && !/欧盟|中国|国行|国内/.test(next)) {
    additions.push(zh
      ? "还有一个边界要先讲清楚：资料里写到欧盟没有、中国也没有，所以 AI 相关功能不能直接写成国行可用，这部分要等后续版本再确认。"
      : "One boundary should stay explicit: the material says the EU and China do not have these AI features, so do not present them as generally available until later verification.");
  }
  if (/iMessage|发送指示器/.test(material) && !/iMessage|发送指示器|发送状态/.test(next)) {
    additions.push(zh
      ? "还有一个很小但能直接讲的变化是 iMessage 发送指示器，消息发送状态会更清楚，这种小细节也属于这次把系统体验修顺的一部分。"
      : "A small showable change is the iMessage sending indicator: message state becomes clearer, which fits the system-polish story.");
  }
  if (/全景照片|空间场景/.test(material) && !/全景照片|空间场景/.test(next)) {
    additions.push(zh
      ? "照片里还有一个适合快速带过的点：全景照片可以转换为空间场景，这种变化不一定是主线，但适合作为能展示的小更新。"
      : "Photos also has a quick showable point: panoramas can become spatial scenes. It is not the main argument, but it is a useful visual update.");
  }
  if (additions.length) {
    next = `${next}\n\n${additions.join("\n\n")}`;
  }
  return cleanQuickDraftSpokenBody(next);
}

/**
 * @param {string} markdown
 * @param {string} stage
 * @returns {{ brief: any, draft: string, risks: string, strategyReport: { editorial: string, materialLedger: string, adoptionTable: string } }}
 */
function parseFirstDaySections(markdown, stage) {
  const lines = String(markdown || "").split(/\r?\n/);
  /** @type {Array<{ heading: string, body: string[] }>} */
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const match = /^#{2,6}\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = { heading: match[1].trim(), body: [] };
      blocks.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  const headingToField = new Map();
  for (const lang of ["zh", "en"]) {
    const set = FIRST_DAY_HEADERS[/** @type {"zh"|"en"} */ (lang)];
    headingToField.set(set.draft.toLowerCase(), "draft");
    headingToField.set(set.firsthand.toLowerCase(), "support");
    headingToField.set(set.official.toLowerCase(), "counter");
    headingToField.set(set.uncertain.toLowerCase(), "uncertainty");
    headingToField.set(set.followup.toLowerCase(), "risks");
    headingToField.set(set.outline.toLowerCase(), "outline");
    headingToField.set(set.editorial.toLowerCase(), "editorial");
    headingToField.set(set.materialLedger.toLowerCase(), "materialLedger");
    headingToField.set(set.adoptionTable.toLowerCase(), "adoptionTable");
  }

  const fields = { support: "", counter: "", uncertainty: "", risks: "", outline: "", draft: "", editorial: "", materialLedger: "", adoptionTable: "" };
  for (const block of blocks) {
    const field = headingToField.get(block.heading.toLowerCase());
    if (!field) continue;
    fields[/** @type {keyof typeof fields} */ (field)] = block.body.join("\n").trim();
  }

  return {
    brief: {
      support: fields.support,
      counter: fields.counter,
      uncertainty: fields.uncertainty,
      outline: fields.outline,
    },
    draft: stage === "draft" ? cleanQuickDraftSpokenBody(fields.draft || fallbackDraftFromMarkdown(markdown)) : "",
    risks: fields.risks,
    strategyReport: {
      editorial: fields.editorial,
      materialLedger: fields.materialLedger,
      adoptionTable: fields.adoptionTable,
    },
  };
}

/**
 * @param {string} markdown
 * @returns {{ brief: any, draft: string, risks: string, intake: { stanceCandidates: string[], outlineSeed: string } }}
 */
function parseVentOutlineSections(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  /** @type {Array<{ heading: string, body: string[] }>} */
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const match = /^#{2,6}\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = { heading: match[1].trim(), body: [] };
      blocks.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  const headingToField = new Map();
  for (const lang of ["zh", "en"]) {
    const set = VENT_OUTLINE_HEADERS[/** @type {"zh"|"en"} */ (lang)];
    headingToField.set(set.userExpression.toLowerCase(), "support");
    headingToField.set(set.chatMaterial.toLowerCase(), "counter");
    headingToField.set(set.stanceCandidates.toLowerCase(), "stanceCandidates");
    headingToField.set(set.outlineSeed.toLowerCase(), "outlineSeed");
    headingToField.set(set.risks.toLowerCase(), "risks");
  }

  const fields = { support: "", counter: "", stanceCandidates: "", outlineSeed: "", risks: "" };
  for (const block of blocks) {
    const field = headingToField.get(block.heading.toLowerCase());
    if (!field) continue;
    fields[/** @type {keyof typeof fields} */ (field)] = block.body.join("\n").trim();
  }

  const candidates = fields.stanceCandidates
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•\d.、]+\s*/, "").trim())
    .filter(Boolean);
  return {
    brief: {
      support: fields.support,
      counter: fields.counter,
      uncertainty: fields.risks,
      outline: fields.outlineSeed,
    },
    draft: "",
    risks: fields.risks,
    intake: {
      stanceCandidates: candidates,
      outlineSeed: fields.outlineSeed,
    },
  };
}

/**
 * Read an upstream model response into a uniform result.
 * @param {Response} response
 * @param {string} label
 * @returns {Promise<{ ok: boolean, content: string, status: number, detail: string, data?: any }>}
 */
async function readModelResponse(response, label) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json";
  if (!contentType.includes("application/json")) {
    return { ok: false, content: "", status: response.ok ? 502 : response.status, detail: text.substring(0, 1000) || `${label} HTTP ${response.status}` };
  }
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, content: "", status: 502, detail: `${label} returned non-JSON body` };
  }
  if (!response.ok) {
    const errorObj = /** @type {any} */ (data).error;
    const detail = /** @type {any} */ (data).detail
      || (typeof errorObj === "string" ? errorObj : errorObj?.message)
      || `${label} returned ${response.status}`;
    return { ok: false, content: "", status: response.status, detail, data };
  }
  return { ok: true, content: modelContentFromChatData(data).trim(), status: response.status, detail: "", data };
}

/**
 * @param {any} body
 * @returns {number}
 */
function cloudDraftMaxTokens(body) {
  if (body?.targetFormat === "bili-dynamic" || body?.displayFormat === "bili-dynamic") return 1200;
  if (body?.stage === "brief" || isVentOutlineTask(body)) return 2600;
  return isFirstDayHandsOn(body) ? 5200 : 3200;
}

/**
 * Attach lint-only Humanizer diagnostics without changing draft content.
 * @param {{
 *   body: any,
 *   result: any,
 *   payload: any,
 *   targetUrl: string,
 *   signal: AbortSignal | null | undefined,
 *   authHeaders: Record<string, string>,
 * }} options
 */
async function repairCloudDraftOutputIfNeeded(options) {
  const taskKindName = `quick-draft-${taskKind(options.body) || options.body?.stage || "draft"}`;
  const content = String(options.result?.content || "").trim();
  if (!content || !shouldLintHumanizerOutput(taskKindName)) return options.result;
  return {
    ...options.result,
    humanizer: {
      mode: "lint",
      repaired: false,
      repair_attempts: 0,
      remaining_hits: findHumanizerOutputHits(content),
      diagnostics: findHumanizerStyleDiagnostics(content),
    },
  };
}

/**
 * Dispatch the draft request to the active local or cloud model.
 * @param {any} body
 * @param {any[]} messages
 * @param {AbortSignal | null} signal
 * @returns {Promise<{ ok: boolean, content: string, status: number, detail: string, model: string }>}
 */
async function callModel(body, messages, signal) {
  const provider = body._local_provider || body.provider || "lm-studio";
  const isCloud = provider === "cloud"
    || Boolean(body._cloud_model)
    || Boolean(body._cloud_credential_id)
    || Boolean(body._cloud_api_key);
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.4;

  if (isCloud) {
    const model = body._cloud_model || body.model || "";
    const apiKey = await resolveCloudCredential({
      credentialId: body._cloud_credential_id,
      provider: "deepseek",
      suppliedApiKey: body._cloud_api_key || DEEPSEEK_API_KEY_DEFAULT,
      allowSupplied: false,
    });
    const baseUrl = resolveCloudBaseUrl(body._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT);
    const targetUrl = `${baseUrl}/v1/chat/completions`;
    /** @type {any} */
    const payload = { model, messages, stream: false, temperature, max_tokens: cloudDraftMaxTokens(body) };
    if (DEEPSEEK_V4_MODELS.has(model)) {
      payload.thinking = { type: "disabled" };
      delete payload.temperature;
    }
    const authHeaders = cloudAuthHeaders(apiKey);
    const { response } = await postJsonWithFallback(targetUrl, payload, signal, authHeaders);
    const result = await readModelResponse(response, "Cloud API");
    const repaired = result.ok
      ? await repairCloudDraftOutputIfNeeded({ body, result, payload, targetUrl, signal, authHeaders })
      : result;
    return { ...repaired, model: model || "cloud" };
  }

  const endpoint = body._local_endpoint || "";
  const { chatUrl } = getLocalUrls(provider, endpoint);
  const payload = tuneLmStudioChatPayload({
    model: body.model || "",
    messages,
    stream: false,
    temperature,
    ai_system6_task_kind: isVentOutlineTask(body) ? "collect-vent-outline" : isFirstDayHandsOn(body) ? "first-day-hands-on" : "draft",
  });
  const { response } = await postLocalChatWithModelAutoload({ chatUrl, payload, provider, model: payload.model, signal });
  const result = await readModelResponse(response, providerDisplayName(provider));
  return { ...result, model: payload.model || provider };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleDraftThesis(req, res) {
  const signal = requestSignal(req, res);
  const startedAt = Date.now();

  try {
    const body = /** @type {any} */ (await readJsonBody(req));
    const language = body.language || "zh";
    const zh = isZh(language);
    const stage = body.stage === "draft" ? "draft" : "brief";
    const firstDayMode = isFirstDayHandsOn(body);
    const ventOutlineTask = isVentOutlineTask(body);
    if (firstDayMode) {
      body.title = asText(body.title || body.firstDayTitle);
      if (isDefaultQuickDraftTitle(body.title)) body.title = "";
      body.subject = asText(body.subject || body.firstDaySubject);
      body.handsOnNotes = asText(body.handsOnNotes || body.handsOn);
      body.officialMaterials = asText(body.officialMaterials);
      body.unavailableNotes = asText(body.unavailableNotes || body.unavailable);
      body.audienceConcerns = asText(body.audienceConcerns);
      body.firstImpression = asText(body.firstImpression);
      body.currentBody = asText(body.currentBody || body.authorDraft || body.draft || body.bodyText);
      body.thesis = asText(body.thesis) || body.currentBody || [body.title, body.subject, body.firstImpression].filter(Boolean).join("\n");
    }
    const thesis = asText(body.thesis);
    const intake = body.intake && typeof body.intake === "object" ? body.intake : {};
    const ventLog = Array.isArray(body.ventLog) ? body.ventLog : (Array.isArray(intake.ventLog) ? intake.ventLog : []);
    const chatMaterials = Array.isArray(body.chatMaterials) ? body.chatMaterials : (Array.isArray(intake.chatMaterials) ? intake.chatMaterials : []);
    const hasVent = ventLog.some((entry) => asText(typeof entry === "string" ? entry : entry?.text));
    const hasChat = chatMaterials.some((entry) => asText(entry?.text));
    const hasOutline = asText(body.outlineSeed || intake.outlineSeed);
    const hasMaterialPane = asText(body.pastedSources || body.officialMaterials);

    // Author Thesis guardrail at the API boundary: the user must supply the
    // thesis; the route never generates a stance for them.
    if (firstDayMode && ventOutlineTask) {
      if (!hasVent && !hasChat && !hasOutline && !hasMaterialPane) {
        send(res, 400, JSON.stringify({
          error: zh ? "请先粘贴素材、写下吐槽或导入聊天记录" : "Paste material, add vent notes, or import chat records first",
          code: "missing_vent_intake",
          detail: zh ? "钟点稿整理只处理素材、用户表达和聊天记录，不会凭空生成第一感受。" : "Quick Draft organization only works from material, user expression, and chat records; it will not invent a first impression.",
        }), { "Content-Type": "application/json" });
        return;
      }
    } else if (firstDayMode) {
      const hasFirstDaySeed = [
        body.currentBody,
        body.title,
        body.subject,
        body.handsOnNotes,
        body.officialMaterials,
        body.unavailableNotes,
        body.audienceConcerns,
        body.firstImpression,
        hasMaterialPane,
        hasVent,
        hasChat,
        hasOutline,
      ].some(Boolean);
      if (!hasFirstDaySeed) {
        send(res, 400, JSON.stringify({
          error: zh ? "请先在正文里写一句开头，或补一点首发素材" : "Write one line in the body, or add a little launch-day material first",
          code: "missing_first_day_inputs",
          detail: zh ? "钟点稿可以从正文继续写，但不会在完全空白时替用户编造体验或个人感受。" : "Quick Draft can continue from the body, but it will not invent experience or personal impressions from a blank request.",
        }), { "Content-Type": "application/json" });
        return;
      }
    }
    if (!firstDayMode && !thesis) {
      send(res, 400, JSON.stringify({
        error: zh ? "请先写下你这一期想说的观点" : "Enter your thesis first",
        code: "missing_thesis",
        detail: zh ? "钟点稿必须围绕用户观点出稿，不会替用户生成观点。" : "Quick Draft writes around your thesis and will not generate a stance for you.",
      }), { "Content-Type": "application/json" });
      return;
    }

    const sources = normalizeSources(body);
    const messages = buildMessages(body, sources);
    const result = await callModel(body, messages, signal);

    if (!result.ok || !result.content) {
      send(res, result.status || 502, JSON.stringify({
        error: zh ? "出稿失败：模型没有返回内容" : "Draft failed: the model returned no content",
        code: "model_unavailable",
        detail: result.detail || (zh ? "没有可用的模型，或模型未返回文本。" : "No model is available, or it returned no text."),
      }), { "Content-Type": "application/json" });
      return;
    }

    const parsed = firstDayMode && ventOutlineTask
      ? parseVentOutlineSections(result.content)
      : firstDayMode
      ? parseFirstDaySections(result.content, stage)
      : parseSections(result.content, stage);
    if (firstDayMode && isQuickDraftAdviceOnlyTask(taskKind(body))) {
      const advice = normalizeQuickDraftAdviceResult(parsed, result.content, taskKind(body));
      parsed.brief = advice.brief;
      parsed.draft = advice.draft;
      parsed.risks = advice.risks;
      /** @type {any} */ (parsed).strategyReport = advice.strategyReport;
    }
    if (firstDayMode && stage === "draft" && parsed.draft) {
      parsed.draft = ensureFirstDayDraftTouchpoints(parsed.draft, body, zh);
    }
    const parsedIntake = /** @type {any} */ (parsed).intake || null;
    const parsedStrategyReport = /** @type {any} */ (parsed).strategyReport || EMPTY_STRATEGY_REPORT;
    send(res, 200, JSON.stringify({
      stage,
      brief: parsed.brief,
      draft: parsed.draft,
      risks: parsed.risks,
      intake: parsedIntake,
      strategyReport: parsedStrategyReport,
      sourceMap: sources.map((s) => ({ id: s.id, label: s.label })),
      raw: result.content,
      humanizer: /** @type {any} */ (result).humanizer || null,
      model: result.model,
      elapsed_ms: Date.now() - startedAt,
    }), { "Content-Type": "application/json" });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const message = /** @type {Error} */ (error).message;
    send(res, 502, JSON.stringify({
      error: "Draft proxy failed",
      code: classifyLmStudioProxyError(message, 502),
      detail: message,
    }), { "Content-Type": "application/json" });
  }
}

module.exports = { handleDraftThesis };
