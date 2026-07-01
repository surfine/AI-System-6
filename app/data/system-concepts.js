// Runtime AI generation for AI System 6 concept help artifacts.
window.AISystem6SystemConceptsData = (() => {
  const brief = Object.freeze({
    zh: [
      "AI System 6 是一张以来源为中心的本地 AI 写作桌面。",
      "它不是模型名称，不是 LM Studio、DeepSeek、OpenAI 或任何供应商，也不是把所有任务塞进聊天框的助手。",
      "它解决的痛点是：长文写作中，来源、摘录、问题、接收者、模型建议、正文和交付物很容易混在一起。",
      "它帮助用户把资料、判断、情感和自己的语言整理成能被真实接收者接住的作品；默认追求更少、更清楚的交付，而不是更多版本。",
      "它防止用户变成模型嘴替：粗糙表达、个人碎事、犹豫、吐槽和多样的缺陷，只要承载声音或判断，就应该被保留。",
      "System 6 的复古隐喻不是皮肤，而是约束：对象可见、保存明确、一次只推进一条写作路线。",
      "主路线：项目硬盘 -> 文件软盘 -> Reader / Scrapbook -> 问题单 -> 大纲 -> 章节草稿 -> TeachText 正文 -> 审校台 -> 项目光盘。",
      "文件软盘是临时来源；Reader 是检查来源的阅读室；Scrapbook 是用户主动留下的证据本。",
      "问题单固定接收者、主张、限制、反对意见、交付摩擦和输出规则；大纲把问题变成章节顺序；章节草稿一次只处理一节。",
      "问题单也要先接住混乱的人类输入；输入太稀薄时，模型会用自己的均质语言补空。",
      "TeachText 才是手稿；ClioTalk 是助手声音，可以建议、整理、起草和审校，但它的回复不会自动成为正文。",
      "审校台不只检查事实和结构，也检查 AI 嘴替漂移：句长过分规整、个人细节消失、总结腔过重或模型味抹平。",
      "会被记住：项目硬盘、保存的 TeachText、Scrapbook 摘录、写作记录、项目光盘。",
      "不会自动记住：ClioTalk 回复、搜索结果、Reader 页面、DocMap 视图、文件软盘里的临时材料。",
      "进入项目的动作必须明确：保存、摘录、插入、写入、导出。",
      "用户使用它的理由：在 AI 帮助下，仍然清楚地拥有来源、问题、正文和交付，并且知道作品是交给谁的。",
    ].join("\n"),
    en: [
      "AI System 6 is a source-first local AI writing desktop.",
      "It is not a model name, LM Studio, DeepSeek, OpenAI, or any vendor, and it is not an assistant that pushes every task into chat.",
      "The pain it solves: in long writing, sources, clips, questions, recipient, model suggestions, manuscript, and handoff easily collapse together.",
      "It helps users turn sources, judgment, feeling, and their own language into work a real recipient can receive; it defaults toward fewer, clearer handoffs rather than more variants.",
      "It keeps the user from becoming a model mouthpiece: rough phrasing, personal bits, hesitation, complaints, and diverse flaws should be preserved when they carry voice or judgment.",
      "The System 6 metaphor is not a skin; it is a constraint: visible objects, explicit saving, one writing route at a time.",
      "Main route: Project Hard Disk -> File Floppy -> Reader / Scrapbook -> Question Sheet -> Outline -> Section Drafts -> TeachText Manuscript -> Review Desk -> Project CD.",
      "File Floppy is temporary source context; Reader inspects sources; Scrapbook keeps evidence the user explicitly chooses.",
      "Question Sheet fixes recipient, claim, constraints, objections, handoff friction, and output rules; Outline orders sections; Section Drafts handle one section at a time.",
      "Question Sheet should also catch messy human input first; when input is thin, the model fills gaps with its own uniform language.",
      "TeachText is the manuscript; ClioTalk is the assistant voice that may suggest, organize, draft, and review, but its replies do not automatically become manuscript.",
      "Review Desk checks not only facts and structure but AI-mouthpiece drift: overly regular rhythm, missing personal details, summary-heavy language, or flattened model flavor.",
      "Durable memory: Project Hard Disk, saved TeachText, Scrapbook clips, Writing Records, Project CD.",
      "Not automatic memory: ClioTalk replies, search results, Reader pages, DocMap views, temporary File Floppy material.",
      "Material enters the project only through explicit actions: save, clip, insert, write, export.",
      "Why users choose it: with AI help, they still own sources, questions, manuscript, handoff, and the knowledge of who the work is for.",
    ].join("\n"),
  });

  function languageKey(language = "zh") {
    return String(language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function titleFor(language, kind) {
    const zh = languageKey(language) === "zh";
    if (kind === "docmap") return zh ? "AI System 6 是什么" : "What AI System 6 Is";
    return zh ? "AI System 6 基本概念.slides.md" : "AI System 6 Basic Concepts.slides.md";
  }

  function stripMarkdownFence(text = "") {
    return String(text || "")
      .trim()
      .replace(/^```(?:markdown|md)?\s*/iu, "")
      .replace(/\s*```$/u, "")
      .trim();
  }

  function modelMessages(messages) {
    return typeof withMarkdownModelMessages === "function" ? withMarkdownModelMessages(messages) : messages;
  }

  function requireModelGenerationHelpers() {
    if (
      typeof fetchModelPayload !== "function" ||
      typeof readChatJson !== "function" ||
      typeof getLocalModelRequestName !== "function"
    ) {
      throw new Error("concept_generation_requires_model");
    }
  }

  async function askModelForMarkdown(messages, { maxTokens, temperature, taskKind }) {
    requireModelGenerationHelpers();
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: modelMessages(messages),
      temperature,
      max_tokens: maxTokens,
      ai_system6_task_kind: taskKind,
      stream: false,
    }, typeof getLongTaskSignal === "function" ? getLongTaskSignal() : undefined);
    const data = await readChatJson(response);
    return stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
  }

  function docMapPrompt(language) {
    const zh = languageKey(language) === "zh";
    return zh ? [
      "请现场生成一份 AI System 6 基本概念 DocMap。",
      "受众：第一次打开系统的新用户、需要解释产品的开发者、后来的 agent。",
      "",
      "不要做功能清单。先解释产品是什么、为什么存在、用户为什么会信任它，再解释路线和记忆边界。",
      "",
      "只输出可解析的 DocMap Markdown，不要代码围栏、JSON、前言或后记。",
      "中心标题必须回答产品定位，不要只写“AI System 6 基本概念”。",
      "使用 5 到 7 个 ## 主分支，每个主分支 3 到 6 个短子节点。",
      "必须覆盖：产品定位、用户痛点、真实接收者、保护写作者语言、反模型嘴替、主写作路线、对象边界、什么会被记住、ClioTalk/模型关系、第一次怎么用、用户为什么会用。",
      "子节点要像思维导图标签；冒号后可以有一句解释，但不要长段落。",
      "不要夸张营销，不要承诺自动引用、自动记忆或自动保证事实正确。",
      "",
      "事实边界：",
      brief.zh,
    ].join("\n") : [
      "Generate an AI System 6 Basic Concepts DocMap at runtime.",
      "Audience: first-time users, developers who need to explain the product, and future agents.",
      "",
      "Do not make a feature inventory. Explain what the product is, why it exists, why users can trust it, then explain the route and memory boundary.",
      "",
      "Return parseable DocMap Markdown only. No code fences, JSON, preface, or afterword.",
      "The center title must answer the product positioning, not merely repeat 'Basic Concepts'.",
      "Use 5 to 7 ## branches. Each branch should have 3 to 6 short child nodes.",
      "Must cover: positioning, user pain, real recipient, protecting the writer's language, anti-model-mouthpiece behavior, main writing route, object boundaries, what gets remembered, ClioTalk/model relationship, first use, why users choose it.",
      "Child nodes should read like mind-map labels; one sentence after a colon is fine, but no long paragraphs.",
      "No hype. Do not promise automatic citation, automatic memory, or guaranteed factual correctness.",
      "",
      "Fact boundary:",
      brief.en,
    ].join("\n");
  }

  function docMapSource(language) {
    const zh = languageKey(language) === "zh";
    return {
      text: zh ? brief.zh : brief.en,
      label: zh ? "AI 现场生成的系统概念" : "AI-generated system concepts",
      scope: "systemHelp",
      threshold: 0,
      meta: {
        fileName: zh ? "AI System 6 基本概念.docmap.md" : "AI System 6 Basic Concepts.docmap.md",
      },
    };
  }

  function docMapHasEnoughStructure(map) {
    if (!map?.central?.title || !Array.isArray(map.nodes) || !Array.isArray(map.edges)) return false;
    const branchCount = map.nodes.filter((item) => item.kind === "branch" || item.importance >= 5).length;
    return map.nodes.length >= 16 && map.edges.length >= 16 && branchCount >= 5;
  }

  async function buildDocMap(language = "zh") {
    const lang = languageKey(language);
    if (typeof parseDocMapMarkdown !== "function") throw new Error("concept_docmap_parser_unavailable");
    const markdown = await askModelForMarkdown([
      {
        role: "system",
        content: lang === "zh"
          ? "你是一位产品解释能力很强的信息架构师。只输出 DocMap Markdown。"
          : "You are an information architect with strong product explanation taste. Return DocMap Markdown only.",
      },
      { role: "user", content: docMapPrompt(lang) },
    ], { maxTokens: 4600, temperature: 0.28, taskKind: "docmap" });
    const map = parseDocMapMarkdown(markdown, docMapSource(lang));
    if (!docMapHasEnoughStructure(map)) throw new Error("concept_docmap_quality_gate");
    const generatedAt = new Date().toISOString();
    return {
      ...map,
      id: `system-concepts-docmap-${lang}-${generatedAt}`,
      kind: "docmap",
      title: map.title || titleFor(lang, "docmap"),
      sourceLabel: lang === "zh" ? "启动磁盘帮助 / AI 现场生成" : "Startup Disk Help / AI Generated",
      sourceScope: "systemHelp",
      layout: "balanced",
      status: "generated",
      sourceMeta: {
        ...(map.sourceMeta || {}),
        generatedAt,
        generationMethod: "ai",
      },
    };
  }

  function slidesPrompt(language) {
    const zh = languageKey(language) === "zh";
    return zh ? [
      "请现场生成一份 ClioStage / Marp 幻灯片，解释 AI System 6 到底是干嘛的。",
      "受众：第一次使用的新用户、开发者、后来的 agent。",
      "文风要像清醒、体面、有判断力的产品设计者：清楚、克制、具体，不要营销腔，也不要内部术语表。",
      "",
      "只输出 Marp Markdown。",
      "必须有 frontmatter：marp: true、theme: default、paginate: true、size: 16:9。",
      "生成 9 到 11 页。每页用 # 标题，正文 2 到 4 个 bullet。",
      "每页可用 HTML 注释写 speaker notes，格式：<!--\\nnotes: ...\\n-->。",
      "必须解释：它是什么、它不是什么、为什么不是普通聊天框、怎样保护写作者语言、怎样避免模型嘴替、主写作路线、对象边界、什么会被记住、AI/ClioTalk 在哪里、第一次怎么用、用户为什么会用它。",
      "不要承诺自动引用、自动记忆或自动保证事实正确。",
      "",
      "事实边界：",
      brief.zh,
    ].join("\n") : [
      "Generate a ClioStage / Marp deck explaining what AI System 6 does.",
      "Audience: first-time users, developers, and future agents.",
      "Tone: clear, restrained, concrete, and tasteful; not marketing copy and not an internal glossary.",
      "",
      "Return Marp Markdown only.",
      "Include frontmatter: marp: true, theme: default, paginate: true, size: 16:9.",
      "Create 9 to 11 slides. Each slide uses a # title and 2 to 4 bullets.",
      "You may include speaker notes as: <!--\\nnotes: ...\\n-->.",
      "Must explain: what it is, what it is not, why it is not an ordinary chat box, how it protects the writer's language, how it avoids model-mouthpiece drift, main writing route, object boundaries, what gets remembered, where AI/ClioTalk lives, first use, why users choose it.",
      "Do not promise automatic citation, automatic memory, or guaranteed factual correctness.",
      "",
      "Fact boundary:",
      brief.en,
    ].join("\n");
  }

  function normalizeSlidesMarkdown(markdown, language) {
    const clean = stripMarkdownFence(markdown).trimEnd() + "\n";
    if (!/^---\s*[\s\S]*?marp:\s*true/im.test(clean)) throw new Error("concept_slides_missing_marp_frontmatter");
    const slideCount = clean.split(/\n---\n/u).filter((part) => /#\s+\S/u.test(part)).length;
    if (slideCount < 8) throw new Error("concept_slides_too_short");
    if (languageKey(language) === "zh" && !/来源|写作|记住|ClioTalk|TeachText/u.test(clean)) {
      throw new Error("concept_slides_topic_drift");
    }
    return clean;
  }

  async function buildSlides(language = "zh") {
    const lang = languageKey(language);
    const markdown = await askModelForMarkdown([
      {
        role: "system",
        content: lang === "zh"
          ? "你是一位能把复杂产品讲清楚的演示文稿作者。只输出 Marp Markdown。"
          : "You are a presentation writer who explains complex products clearly. Return Marp Markdown only.",
      },
      { role: "user", content: slidesPrompt(lang) },
    ], { maxTokens: 5600, temperature: 0.32, taskKind: "slides" });
    const generatedAt = new Date().toISOString();
    return {
      title: titleFor(lang, "slides"),
      markdown: normalizeSlidesMarkdown(markdown, lang),
      sourceKind: "systemHelp",
      sourceItemId: `system-concepts-slides-${lang}-${generatedAt}`,
      generation: { method: "ai", generatedAt },
    };
  }

  return Object.freeze({
    brief,
    buildDocMap,
    buildSlides,
  });
})();
