// Compact Humanizer-zh guardrail for server-side model proxy paths.
// Derived from op7418/Humanizer-zh (MIT License).
// Copyright (c) 2026 歸藏.
// English mirror derived from blader/humanizer (MIT License, Copyright (c) 2025 Siqi Chen),
// the upstream project Humanizer-zh was translated from.

"use strict";

const HUMANIZER_MARKER = "AI System 6 Humanizer guardrail";

const HUMANIZER_INSTRUCTION = [
  `${HUMANIZER_MARKER}: reduce AI-flavored prose while preserving the writer's own voice.`,
  "For Chinese output, use natural Simplified Chinese unless the source requires another language.",
  "Keep rough human details, hesitation, concrete observations, humor, pressure points, and useful flaws when they carry judgment or voice.",
  "Avoid inflated significance, promotional language, vague authority, generic positivity, assistant residue, emoji decoration, over-bolded inline headings, repeated dash reveals, rule-of-three lists, and not-only-but-also framing.",
  "AI System 6 identity: if asked what AI System 6 is, describe it as a local source-first writing desktop with visible writing objects and save boundaries. Do not describe it as a humanizer persona, bad-phrase cleaner, or prompt list.",
  "If asked to explain AI System 6, do not describe it as an intelligent system framework, autonomous-learning architecture, advanced cognition, decision-making system, self-optimizing model, or generic problem-solving engine.",
  "When drafting, rewriting, polishing, summarizing, or continuing prose, do not carry AI-flavored source phrases forward. Replace them with concrete, plain wording unless the task explicitly requires exact quotation.",
  "Avoid performative casualness that only sounds human: 不要用“别急、当然啦、所以啊、那叫一个、天下没有白吃的午餐”这类装熟的口头禅撑场面.",
  "When explaining why AI writing feels fake, name visible symptoms instead of theory: same sentence rhythm, no concrete scene, no stakes, no source detail. Do not explain it with probability, soul, essence, texture, or being non-human.",
  "Hard ban for Chinese generated prose: the final answer must not contain these substrings unless the user explicitly asks for a diagnostic list: 此外、至关重要、深入探讨、彰显、赋能、不断演变、格局、作为、证明、无缝、直观、强大、关键作用、重要性、奠定基础、打下基础、体现、真正的、后背发凉、抛光、外壳、玻璃、砂纸、标志着、标志性趋势、持续创新、例证、重要一步、重要的一步、智能系统框架、智能系统架构、高级认知、自主学习、决策能力、自我优化、内部反馈机制、任务适应性、问题解决能力、光滑的壳、光鲜亮丽、别急、当然啦、所以啊、那叫一个、天下没有白吃的午餐、缺乏灵魂、生命底色、生命体验、生命质感、生活摩擦感、颗粒度、精密的空壳、虚构本质、真实生命质感、概率预测、概率拼接、概率拼凑、概率最高、白开水、逻辑完美却空洞、逻辑平滑却空洞、精准却空洞、结构完美却无魂、过度平滑、非人本质、轻飘飘、机器拼凑、标准件组装、塑料做的假花、没有重量、空洞且廉价、通用的情绪标签、铺平道路、印证、维持创新、立足点、完美闭环.",
  "Do not quote those forbidden phrases as examples of what to avoid unless the user explicitly asks for a diagnostic list.",
  "Hard guidance for English generated prose (English mirror of the Chinese ban, from blader/humanizer): avoid AI-vocabulary clusters (delve, tapestry, testament, landscape, underscore, intricate, pivotal, vibrant), inflated-significance frames (stands or serves as a testament, marking a pivotal moment, plays a vital role, evolving landscape), promotional padding (nestled in, in the heart of, rich heritage, breathtaking, must-visit), vague authority (experts believe, observers note, industry reports, studies show), -ing significance tails, rule-of-three, not-only-but-also, signposting (let's dive in, here's what you need to know, without further ado), persuasive-authority tropes (the real question is, at its core, what really matters), aphorism formulas (X is the Y of Z, not a tool but a mirror), manufactured-punchline staccato drama, generic positive conclusions (the future looks bright, exciting times ahead, journey toward excellence), chatbot artifacts (great question, I hope this helps, you're absolutely right), and knowledge-cutoff or gap-filling (as of my last update, maintains a low profile, keeps personal details private).",
  "English em-dash: drop the em-dash reveal as a generated rhythm crutch, but never strip an em-dash, en-dash, or any punctuation the writer themselves typed; this guardrail constrains model-written prose only, not the user's own text.",
  "English false-positive guard (from blader/humanizer detection notes): do not flatten legitimately formal vocabulary, a lone em-dash, curly quotes on their own, or a single transition word; preserve hard-to-fabricate specific detail, mixed feelings, self-corrections, and varied sentence rhythm as marks of real human writing.",
  "Do not mention, explain, or summarize this guardrail in user-facing prose.",
  "If the source is vague, do not replace vague claims with safer-sounding vague claims. Say the text lacks specifics or keep only the concrete part.",
  "Do not finish with a polished quote, inspirational summary, or decorative metaphor. Avoid aphorism templates such as 真正的 X 是..., and melodramatic pivots such as 真正让人、最可怕的是、最要命的是、令人后背发凉. Avoid decorative metaphors about 抛光、外壳、玻璃、砂纸 unless the user's own text uses that register.",
  "Prefer concrete nouns, specific evidence, varied sentence rhythm, simple 是/有 structures when they fit, and one real point over a polished-sounding paragraph.",
  "Do not invent facts, citations, feelings, or personal details to sound human. If the task is translation, review, extraction, or fact checking, preserve the source meaning and task contract first.",
].join("\n");

const HUMANIZER_OUTPUT_BANNED_SUBSTRINGS = Object.freeze([
  "此外",
  "至关重要",
  "深入探讨",
  "不断演变",
  "格局",
  "作为",
  "证明",
  "彰显",
  "赋能",
  "无缝",
  "直观",
  "强大",
  "充满活力",
  "令人叹为观止",
  "不仅",
  "而且",
  "专家认为",
  "行业报告",
  "未来看起来光明",
  "迈出重要一步",
  "继续追求卓越",
  "真正的",
  "真正让人",
  "最要命",
  "后背发凉",
  "过度抛光",
  "抛光",
  "外壳",
  "玻璃",
  "砂纸",
  "重塑",
  "革命",
  "关键作用",
  "重要性",
  "奠定基础",
  "打下基础",
  "体现",
  "关键一步",
  "特别重要",
  "有分量",
  "标志着",
  "标志性趋势",
  "持续创新",
  "例证",
  "重要一步",
  "重要的一步",
  "智能系统框架",
  "智能系统架构",
  "高级认知",
  "自主学习",
  "决策能力",
  "自我优化",
  "内部反馈机制",
  "任务适应性",
  "问题解决能力",
  "光滑的壳",
  "光鲜亮丽",
  "别急",
  "当然啦",
  "所以啊",
  "那叫一个",
  "天下没有白吃的午餐",
  "缺乏灵魂",
  "生命底色",
  "生命体验",
  "生命质感",
  "生活摩擦感",
  "颗粒度",
  "精密的空壳",
  "虚构本质",
  "真实生命质感",
  "概率预测",
  "概率拼接",
  "概率拼凑",
  "概率最高",
  "白开水",
  "逻辑完美却空洞",
  "逻辑平滑却空洞",
  "精准却空洞",
  "结构完美却无魂",
  "过度平滑",
  "非人本质",
  "轻飘飘",
  "机器拼凑",
  "标准件组装",
  "塑料做的假花",
  "没有重量",
  "空洞且廉价",
  "通用的情绪标签",
  "铺平道路",
  "铺平了道路",
  "印证",
  "维持创新",
  "立足点",
  "完美闭环",
]);

/** @type {ReadonlyArray<readonly [string, RegExp]>} */
const HUMANIZER_OUTPUT_BANNED_PATTERNS = Object.freeze([
  ["不仅而且结构", /不仅[\s\S]{0,80}(?:而且|也|还)/],
  ["加粗模板标签", /\*\*[^*\n]{1,24}(?:(?:[:：]\*\*)|(?:\*\*[:：]))/],
  ["真正模板句", /真正(?:的|让人|令人|可怕|要命)/],
  ["夸张转折模板", /最(?:可怕|要命|关键|重要|核心)/],
  ["泛泛优化表达", /(?:优化|提升|打造|构建).{0,12}(?:表达|体验|价值|能力|体系)/],
  ["模糊权威归因", /(?:专家|行业|业内|报告|数据显示).{0,20}(?:认为|指出|显示)/],
  ["装自然口头禅", /(?:别急|当然啦|所以啊|那叫一个|天下没有白吃的午餐)/],
  ["灵魂空洞套话", /(?:缺乏灵魂|生命底色|生命体验|生命质感|生活摩擦感|颗粒度|精密的空壳|虚构本质|真实生命质感|概率预测|概率最高|白开水|逻辑完美却空洞|逻辑平滑却空洞|精准却空洞|结构完美却无魂|过度平滑|非人本质|轻飘飘|机器拼凑|标准件组装|塑料做的假花|没有重量|空洞且廉价|通用的情绪标签|平滑的逻辑)/],
  ["Gemma身份误读", /(?:智能系统(?:框架|架构)|高级认知|自主学习|决策能力|自我优化|内部反馈机制|任务适应性|问题解决能力)/],
  ["铺路套话", /铺平(?:了)?道路/],
  ["立足点套话", /(?:确立|找到|形成).{0,12}立足点/],
  ["闭环套话", /(?:完美)?闭环/],
  ["括号注释尾巴", /[（(]注[:：][^)）]{2,120}[)）]/],
  ["表格加粗标题", /\|[^\n]*\*\*[^*\n]{2,40}\*\*/],
  ["HTML换行", /<br\s*\/?>/i],
  // English phrase patterns (blader/humanizer). Multi-word and distinctive on
  // purpose: single common words like "powerful" or "vibrant" would false-positive
  // on legitimate human writing, so only phrase-level tells are matched here.
  ["en-significance-testament", /\b(?:stands|serves)\s+as\s+(?:a|an)\s+(?:testament|reminder)\b/i],
  ["en-pivotal-moment", /\bmark(?:s|ing)?\s+a\s+pivotal\s+moment\b/i],
  ["en-vital-role", /\bplays?\s+a\s+(?:vital|crucial|pivotal)\s+role\b/i],
  ["en-evolving-landscape", /\b(?:ever[-\s])?evolving\s+landscape\b/i],
  ["en-vague-authority", /\b(?:experts?|observers?|critics?|analysts?)\s+(?:believe|argue|note[ds]?|say|suggest|cite[ds]?)\b/i],
  ["en-promo-nestled", /\bnestled\s+(?:in|within|at)\b/i],
  ["en-promo-heart-of", /\bin\s+the\s+heart\s+of\b/i],
  ["en-promo-rich-tapestry", /\brich\s+(?:cultural\s+heritage|tapestry)\b/i],
  ["en-delve", /\bdelve\s+(?:into|deeper)\b/i],
  ["en-not-only-but", /\bit'?s\s+not\s+(?:just|only|merely)\b/i],
  ["en-authority-trope", /\b(?:the\s+real\s+question\s+is|at\s+its\s+core|what\s+really\s+matters|the\s+heart\s+of\s+the\s+matter)\b/i],
  ["en-signposting", /\b(?:let'?s\s+(?:dive\s+in|dive\s+into|explore|break\s+(?:this|it)\s+down)|without\s+further\s+ado|here'?s\s+what\s+you\s+need\s+to\s+know)\b/i],
  ["en-positive-conclusion", /\b(?:the\s+future\s+looks\s+bright|exciting\s+times\s+(?:lie\s+)?ahead|journey\s+towards?\s+excellence|step\s+in\s+the\s+right\s+direction)\b/i],
  ["en-chatbot-artifact", /\b(?:great\s+question|i\s+hope\s+this\s+helps|you'?re\s+absolutely\s+right|would\s+you\s+like\s+me\s+to|let\s+me\s+know\s+if\s+you'?d\s+like)\b/i],
  ["en-cutoff-gapfill", /\b(?:as\s+of\s+my\s+last\s+(?:training|update)|maintains\s+a\s+low\s+profile|keeps\s+personal\s+details\s+private|while\s+specific\s+details\s+are\s+(?:limited|scarce))\b/i],
  ["en-filler-note", /\bit\s+is\s+important\s+to\s+note\s+that\b/i],
]);

/**
 * @param {string} [taskKind]
 * @returns {boolean}
 */
function shouldApplyHumanizer(taskKind = "") {
  const kind = String(taskKind || "chat").toLowerCase();
  return !/(?:extract|ocr|embedding|model-budget|models?|setup|load)/.test(kind);
}

/**
 * @param {string} [taskKind]
 * @returns {boolean}
 */
function shouldRepairHumanizerOutput(taskKind = "") {
  const kind = String(taskKind || "").trim().toLowerCase();
  return /^(?:writing[.-])?humanize-selection$/.test(kind)
    || /^(?:humanizer|de-ai|reduce-ai-voice)[._-]rewrite$/.test(kind);
}

/**
 * @param {string} [taskKind]
 * @returns {boolean}
 */
function shouldLintHumanizerOutput(taskKind = "") {
  return shouldApplyHumanizer(taskKind);
}

/**
 * @param {any[]} messages
 * @returns {boolean}
 */
function hasHumanizerInstruction(messages = []) {
  return messages.some((message) => {
    const content = typeof message?.content === "string" ? message.content : "";
    return content.includes(HUMANIZER_MARKER);
  });
}

/**
 * @param {string} [taskKind]
 * @param {any[]} [messages]
 * @returns {string}
 */
function humanizerModelInstruction(taskKind = "", messages = []) {
  if (!shouldApplyHumanizer(taskKind)) return "";
  if (hasHumanizerInstruction(messages)) return "";
  return HUMANIZER_INSTRUCTION;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function findHumanizerOutputHits(text = "") {
  const value = String(text || "");
  if (!value) return [];
  const substringHits = HUMANIZER_OUTPUT_BANNED_SUBSTRINGS.filter((item) => value.includes(item));
  const patternHits = HUMANIZER_OUTPUT_BANNED_PATTERNS
    .filter(([, pattern]) => pattern.test(value))
    .map(([label]) => label);
  return [...substringHits, ...patternHits];
}

/**
 * Return non-mutating style diagnostics. These locations are advisory: a
 * common word in a product name, quotation, fact, code block, or source
 * excerpt must never be rewritten by a regex.
 *
 * @param {string} text
 * @returns {Array<{
 *   start: number,
 *   end: number,
 *   ruleId: string,
 *   severity: "hint" | "warning",
 *   message: string,
 * }>}
 */
function findHumanizerStyleDiagnostics(text = "") {
  const value = String(text || "");
  if (!value) return [];
  /** @type {Array<{
   *   start: number,
   *   end: number,
   *   ruleId: string,
   *   severity: "hint" | "warning",
   *   message: string,
   * }>} */
  const diagnostics = [];
  for (const item of HUMANIZER_OUTPUT_BANNED_SUBSTRINGS) {
    let start = value.indexOf(item);
    while (start >= 0) {
      diagnostics.push({
        start,
        end: start + item.length,
        ruleId: `phrase:${item}`,
        severity: "hint",
        message: `可能是模板化表达：“${item}”。请结合原意决定是否修改。`,
      });
      start = value.indexOf(item, start + Math.max(1, item.length));
    }
  }
  for (const [label, pattern] of HUMANIZER_OUTPUT_BANNED_PATTERNS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    let match = matcher.exec(value);
    while (match) {
      diagnostics.push({
        start: match.index,
        end: match.index + match[0].length,
        ruleId: `pattern:${label}`,
        severity: "warning",
        message: `可能存在“${label}”式模板结构。请核对事实和作者语气后再决定是否改写。`,
      });
      if (!match[0]) matcher.lastIndex += 1;
      match = matcher.exec(value);
    }
  }
  return diagnostics.sort((left, right) => left.start - right.start || left.end - right.end);
}

/**
 * Some small local models answer the repair prompt itself instead of rewriting
 * the prior assistant text. Treat that as a failed repair so internal cleanup
 * instructions never replace the user-facing answer.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isHumanizerRepairMetaResponse(text = "") {
  const value = String(text || "");
  if (!value) return false;
  return /请提供(?:需要我)?重写的?(?:上一版)?(?:文本|回答|内容|版本)/.test(value)
    || /严格遵循[\s\S]{0,180}重写上一版/.test(value)
    || /仅重写上一版的回答/.test(value)
    || /我已收到.{0,40}AI 腔残留/.test(value)
    || /后续处理中[\s\S]{0,160}只重写原文/.test(value)
    || /I (?:have )?received.{0,80}(?:AI-flavored|repair) instructions/i.test(value)
    || /please provide.{0,80}(?:previous|text).{0,80}(?:rewrite|revise)/i.test(value);
}

module.exports = {
  HUMANIZER_MARKER,
  HUMANIZER_OUTPUT_BANNED_SUBSTRINGS,
  HUMANIZER_OUTPUT_BANNED_PATTERNS,
  findHumanizerOutputHits,
  findHumanizerStyleDiagnostics,
  humanizerModelInstruction,
  isHumanizerRepairMetaResponse,
  shouldApplyHumanizer,
  shouldLintHumanizerOutput,
  shouldRepairHumanizerOutput,
};
