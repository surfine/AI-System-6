// Feature module: Mingming / Luoluo style lens.

// Loaded on demand as a classic script; shares the AI System 6 global scope.
// This file is one long style contract that only the Mingming commands read,
// so it stays off the startup disk: the Review Desk command awaits
// ensureMingmingLensModule, and the two lazy writing modules that build a
// rewrite prompt (outline-claim, quick-draft-ai) load it with themselves.

window.AISystem6MingmingLensLoaded = true;



function buildMingmingRewritePrompt({
  questionSheet = "",
  readerClipContext = "",
  projectContext = "",
  outline = "",
} = {}) {
  return `${resolveWritingRoutePrompt("other-apps.mingming-rewrite")}

输出格式：
- 第一行用一个 Markdown H1 标题，标题可以有落落式趣味和本期核心对象。
- 正文必须按内容生成 Markdown 二级标题（##），给章节草稿和审校台作为章节锚点。
- 即使参考样例或目标口播看起来是连续正文，实际返回也必须插入自生成的 ## 章节标题；没有 ## 就是失败输出。
- 这些 ## 是软件里的章节锚点，不是口播里要念出来的标题；标题服务后续工作流，正文仍然像自然说话。
- 二级标题要短、具体、服务口播流程；不要沿用“序 / 末 / 浅粉色”这类文章式或原始占位标题。
- 每个 ## 下面用自然段写口播，不要用条目清单。
- 可以穿插少量画面提示，格式为〔画面：……〕。画面提示要服务于拍摄，不要泛泛说明。
- 保留 4-7 个 ## 章节，让后续章节草稿、审校台和章节级检查能继续工作。
- 结尾使用落落式收束：“好了，这次节目就到这里了，喜欢的话关注一下也是可以的，我们下次见。”

改写要求：
- 只输出改写后的完整文案，不要输出大纲表、交接清单、分析报告、修改说明或多版本。
- 第一段就把最抓人的点、核心判断和态度说出来；不要先解释这是哪一章。
- 中段把材料里的真实体验、限制、意外发现和可拍画面串成“然后我拿它试了一下”的口播流。
- 链接、快捷指令、App、论文、网页、产品页等不要原样展开；改成视频里观众能听懂的交代方式，例如“链接放评论区 / 这个来源我放简介 / 这里先看结论”。
- 结尾要回答题材自己的核心判断：值不值、该不该做、适合谁、为什么值得存在、还有什么遗憾；再收回到材料里最有记忆点的意象或动作。
- 开头 2-4 句内给出判断或最强反差，不能文学铺垫。
- 句子短，像说话；多用“然后 / 所以 / 不过 / 其实 / 诶 / 哦对”，但不要每句硬塞。
- 允许轻微口水和重复，允许“这个东西它”“这部分其实”“怎么说呢”这种真实口播冗余；不要把每句都修到书面上的最佳状态。
- 信息点按观众兴趣排序：颜色/价格/争议/最好玩的画面点先行，参数和背景后置或压缩。
- 主动保留 1-2 个缺点或遗憾，保持真诚，不要写成广告。
- 升华最多一次，而且要从材料里自然长出来。

QUESTION SHEET:
${questionSheet || "No Question Sheet provided."}

READER CLIPS:
${readerClipContext || "No Reader clips saved yet."}

PROJECT CONTEXT:
${projectContext || "No relevant project context selected yet."}

CURRENT OUTLINE:
${outline}`;
}

function buildMingmingReviewPrompt({
  language = "zh",
  sectionText = "",
  fullContext = "",
} = {}) {
  const isZh = language === "zh";
  return [
    resolveWritingRoutePrompt("other-apps.mingming-review", language),
    isZh
      ? "你是 AI System 6 的「代入铭铭视角」创作自检器。请检查这段稿子是否还像落落频道里能拍、能念、能成立的视频口播。"
      : "You are AI System 6's Mingming-perspective creative self-check. Review whether this draft still feels like shootable, speakable Luoluo-channel video copy.",
    isZh
      ? "这是双用户、单体验的工具：用户可能是 Aaron，也可能是落落本人；不要假设使用者身份，不要输出关系建议、交接压力或私人合作判断。"
      : "This is one experience for two possible users: the user may be Aaron or Luoluo. Do not assume identity, and do not output relationship advice, handoff pressure, or private collaboration judgments.",
    isZh
      ? "内置落落规则：视频口播稿，不是文章；前两句看到重点，前 20 秒有意思；发现模式，不是讲课模式；观察 → 原因/考据 → 判断 → 然后下一个；声画互补；本代特异性；大白话短句；不写给媒体老师或官方认可看。"
      : "Built-in Luoluo rules: spoken video, not an article; focus visible in the first two sentences; first 20 seconds must be interesting; discovery mode, not lecture mode; observation -> reason/research -> judgment -> then next; audio-visual complement; generation-specific value; plain short sentences; not for insiders or official approval.",
    isZh
      ? "反 AI 嘴替检查：提示词禁令只能辅助，不能替代真实输入。若句长比例过分规整、个人碎事消失、风格被同一种调料抹平、每段都像模型漂洗后的标准答案，要直接指出，并建议回到原始材料、落落真实口语和更具体的用机场景。"
      : "Anti-AI-mouthpiece check: prompt prohibitions only help; they cannot replace real source input. If sentence lengths become too regular, personal usage bits vanish, style is flattened into one model flavor, or every paragraph feels model-polished, say so directly and suggest returning to raw material, Luoluo's real speech, and more concrete usage scenes.",
    isZh
      ? "模型适配检查：这个产品预期常搭配 Qwen 3.5 / Qwen 3.6 / DeepSeek v4。若像 Qwen 那样把稿子做成规整模板、只按字面完成任务，或像 DeepSeek v4 那样形容词偏多、总结感偏重、频繁讲“核心/本质/关键”，都要归到 AI 嘴替或视频感问题。"
      : "Model-fit check: this product is expected to pair with Qwen 3.5 / Qwen 3.6 / DeepSeek v4. If the draft becomes a regular template like Qwen often can, or becomes adjective-heavy and summary-heavy with frequent 'core/essence/key' moves like DeepSeek v4 often can, treat it as an AI-mouthpiece or video-feel issue.",
    isZh
      ? "请审视：观众点进来想看什么；有没有废话；这个点是否足够有意思；信息点是否两三句能说完；有没有写成文章/剧本/讲课；画面能不能拍；有没有脱离落落基本盘；是否让创作更顺、更轻。若内容不是新品，标准更严格。"
      : "Review what viewers came for, filler, whether the point is interesting enough, whether each point can be said in two or three sentences, whether it feels like an article/script/lecture, whether the visuals are shootable, whether it leaves Luoluo's base, and whether it makes creation smoother and lighter. If this is not a new product, apply a stricter standard.",
    isZh
      ? "不要重写全文，不要事实核查，不要泛泛夸，不要用“我是为你好”的口吻说服。只指出会影响留存、兴趣、节奏、视频感、风格成立度和压力感的问题；如果这个点本身不够有意思，要直接说。"
      : "Do not rewrite the full text, fact-check, give generic praise, or persuade from an 'I know what's best' posture. Only flag issues that affect retention, interest, rhythm, video feel, style fit, and pressure. If the point itself is not interesting enough, say so directly.",
    isZh
      ? "返回 Markdown，只输出一张表。字段：视角 / 观察 / 风险 / 建议。不要输出“位置”列。视角限定为：开头钩子、观众动机、废话密度、有趣程度、发现感、视频感、本代特异性、AI 嘴替、压力感、结尾回收。最多 5 条。若没有明显问题，只输出一行说“这一节已经顺”。"
      : "Return Markdown only, as one table. Columns: Lens / Observation / Risk / Suggestion. Do not include a Location column. Lens must be one of: hook, viewer motivation, filler density, interest, discovery feel, video feel, generation-specific value, AI mouthpiece, pressure feel, ending payoff. Max 5 rows. If there is no obvious issue, output one row saying the section already flows.",
    "",
    isZh ? "当前章节：" : "CURRENT SECTION:",
    sectionText,
    "",
    isZh ? "全文语境：" : "WHOLE MANUSCRIPT CONTEXT:",
    fullContext,
  ].join("\n");
}
