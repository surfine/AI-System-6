// Humanizer guidance derived from op7418/Humanizer-zh (MIT License).
// Copyright (c) 2026 歸藏.
// English mirror derived from blader/humanizer (MIT License, Copyright (c) 2025 Siqi Chen),
// the upstream project Humanizer-zh was translated from.
// Adapted for AI System 6 as a compact generation guardrail rather than
// a full rewrite pass.

window.AISystem6Humanizer = (() => {
  const marker = "AI System 6 Humanizer guardrail";
  const source = Object.freeze({
    name: "Humanizer-zh",
    url: "https://github.com/op7418/Humanizer-zh",
    license: "MIT",
  });

  const compactInstruction = [
    `${marker}: reduce AI-flavored prose while preserving the writer's own voice.`,
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

  const reviewChecklist = [
    "夸大的象征意义：作为……的证明、标志着、标志性趋势、标志着关键时刻、不断演变的格局",
    "宣传腔：无缝、直观、充满活力、令人叹为观止、必游之地",
    "模糊归因：专家认为、行业报告显示、观察者指出，但没有具体来源",
    "AI 词汇堆叠：此外、至关重要、深入探讨、彰显、赋能、获得、培养",
    "公式结构：不仅……而且……、三段式排比、从 X 到 Y 的假范围",
    "机械格式：粗体标题加冒号、表情符号装饰、过多破折号揭示",
    "装自然口头禅：别急、当然啦、所以啊、那叫一个、天下没有白吃的午餐",
    "抽象文学腔：缺乏灵魂、生命底色、生命体验、生命质感、生活摩擦感、颗粒度、精密的空壳、虚构本质、真实生命质感、概率预测、概率拼接、概率拼凑、概率最高、白开水、逻辑完美却空洞、逻辑平滑却空洞、精准却空洞、结构完美却无魂、过度平滑、非人本质、轻飘飘、机器拼凑、标准件组装、塑料做的假花、没有重量、空洞且廉价",
    "Gemma E4B 身份误读：智能系统框架、高级认知、自主学习、决策能力、自我优化、内部反馈机制、任务适应性、问题解决能力",
    "聊天残留：当然、希望这有帮助、请告诉我、截至我的训练数据",
    "通用乐观结尾：未来光明、迈出重要一步、持续创新、继续追求卓越",
  ].join("\n");

  function instruction() {
    return compactInstruction;
  }

  function checklist() {
    return reviewChecklist;
  }

  function hasHumanizerInstruction(messages = []) {
    return messages.some((message) => {
      const content = typeof message?.content === "string" ? message.content : "";
      return content.includes(marker);
    });
  }

  return Object.freeze({
    marker,
    source,
    instruction,
    checklist,
    hasHumanizerInstruction,
  });
})();
