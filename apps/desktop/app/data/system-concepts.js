// Offline, editorially fixed AI System 6 concept artifacts.
//
// Help must work before a model is configured. The corpus is a lazy classic
// script, but the artifacts it contains are authored files, not model output.

window.AISystem6SystemConceptsData = (() => {
  const corpusPath = "app/data/evergreen-demo-corpus.js";
  let corpusPromise = null;

  const brief = Object.freeze({
    zh: [
      "AI System 6 是一张以来源为中心、在浏览器本地保存项目的 AI 写作桌面。",
      "它不是模型名称，也不是把所有任务塞进聊天框的助手；ClioTalk 只是桌面上的一款应用。",
      "它保护写作者自己的来源、判断、感受、粗糙表达和交付意图，不让作者变成模型嘴替。",
      "问题单先接住真实接收者与粗糙人类输入；输入太稀薄，模型就会用自己的均质语言补空。",
      "保护写作者语言，意味着默认追求更少、更清楚的交付，而不是更多版本。",
      "正式路线是：项目硬盘 -> 文件软盘 -> 问题单 -> 大纲 -> 章节草稿 -> TeachText 正文 -> 审校台 -> 项目光盘。",
      "Reader、Scrapbook、Searcher、DocMap 和 ClioStage 是按需召唤的工具，不是每篇文章必经的关卡。",
      "项目硬盘是长期状态；文件软盘、Reader 页面、搜索结果和模型建议先保持临时。",
      "普通 ClioTalk 会保存 Chat 文件与 Run Record，但回复不会自动成为正文；进入正文仍需明确使用结果。",
      "打开、阅读、编辑、审查、绘图、演示、附加与导出是不同动作；没有记录，就不声称动作已经发生。",
      "没有模型时，项目、文档、摘录、编辑与导出仍然可用。",
      "桌面与 Writing Studio 是两个工作区外形；公共部署先打开桌面，写作路线由用户自己进入。",
      "启动包受两张 1.44 MB 软盘约束；大型工具只在用户召唤时加载。",
    ].join("\n"),
    en: [
      "AI System 6 is a source-first AI writing desktop whose projects live locally in the browser.",
      "It is not a model name or an assistant that pushes every task into chat; ClioTalk is one application on the desk.",
      "It protects the writer's sources, judgment, feeling, rough expression, and handoff intent from model-mouthpiece drift.",
      "Question Sheet catches a real recipient and rough human input first; thin input invites the model to fill gaps with uniform language.",
      "Protecting the writer's language includes explicit anti-model-mouthpiece behavior and fewer, clearer handoffs rather than more variants.",
      "The formal route is Project Hard Disk -> File Floppy -> Question Sheet -> Outline -> Section Drafts -> TeachText Manuscript -> Review Desk -> Project CD.",
      "Reader, Scrapbook, Searcher, DocMap, and ClioStage are summoned tools, not mandatory gates for every piece.",
      "Project Hard Disk is durable state; File Floppy, Reader pages, search results, and model suggestions begin as temporary material.",
      "A normal ClioTalk saves a Chat file and Run Record, but a reply does not automatically become manuscript; Use Result remains explicit.",
      "Open, read, edit, review, map, present, attach, and export are different actions; without a record, the system does not claim the action happened.",
      "Without a model, projects, documents, clips, editing, and export still work.",
      "Desktop and Writing Studio are two workspace shapes; the public deployment opens on the desktop and the user enters the writing route deliberately.",
      "The startup bundle is constrained to two 1.44 MB floppies; large tools load only when summoned.",
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

  async function ensureEvergreenCorpus() {
    if (window.AISystem6EvergreenDemoCorpus) return window.AISystem6EvergreenDemoCorpus;
    if (typeof loadClassicScriptOnce !== "function") throw new Error("evergreen_demo_corpus_loader_unavailable");
    corpusPromise ||= loadClassicScriptOnce(corpusPath)
      .then(() => {
        if (!window.AISystem6EvergreenDemoCorpus) throw new Error("evergreen_demo_corpus_missing");
        return window.AISystem6EvergreenDemoCorpus;
      })
      .catch((error) => {
        corpusPromise = null;
        throw error;
      });
    return corpusPromise;
  }

  function docMapSource(language, corpus) {
    const lang = languageKey(language);
    return {
      text: corpus.artifacts.article[lang],
      label: lang === "zh" ? "启动磁盘帮助 / 编辑定稿" : "Startup Disk Help / Editorially Fixed",
      scope: "systemHelp",
      threshold: 0,
      meta: {
        fileName: lang === "zh" ? "AI System 6 基本概念.docmap.md" : "AI System 6 Basic Concepts.docmap.md",
        corpusId: corpus.id,
        corpusVersion: corpus.version,
        generationMethod: "editorial-static",
      },
    };
  }

  async function buildDocMap(language = "zh") {
    const lang = languageKey(language);
    const corpus = await ensureEvergreenCorpus();
    if (typeof parseDocMapMarkdown !== "function") throw new Error("concept_docmap_parser_unavailable");
    const map = parseDocMapMarkdown(corpus.artifacts.docMap[lang], docMapSource(lang, corpus));
    if (!map?.central?.title || !Array.isArray(map.nodes) || map.nodes.length < 16 || !Array.isArray(map.edges) || map.edges.length < 16) {
      throw new Error("concept_docmap_static_artifact_invalid");
    }
    return {
      ...map,
      id: `system-concepts-docmap-${lang}-v${corpus.version}`,
      kind: "docmap",
      title: map.title || titleFor(lang, "docmap"),
      sourceLabel: lang === "zh" ? "启动磁盘帮助 / 编辑定稿" : "Startup Disk Help / Editorially Fixed",
      sourceScope: "systemHelp",
      layout: "balanced",
      status: "ready",
      sourceMeta: {
        ...(map.sourceMeta || {}),
        corpusId: corpus.id,
        corpusVersion: corpus.version,
        generationMethod: "editorial-static",
      },
    };
  }

  function validateStaticSlides(markdown, language) {
    const clean = String(markdown || "").trimEnd() + "\n";
    if (!/^---\s*[\s\S]*?marp:\s*true/im.test(clean)) throw new Error("concept_slides_missing_marp_frontmatter");
    const slideCount = clean.split(/\n---\n/u).filter((part) => /#\s+\S/u.test(part)).length;
    if (slideCount < 9 || slideCount > 11) throw new Error("concept_slides_count_invalid");
    const required = languageKey(language) === "zh"
      ? ["聊天", "项目硬盘", "保存", "作者"]
      : ["Chat", "Project Hard Disk", "Saved", "Human"];
    if (!required.every((term) => clean.toLowerCase().includes(term.toLowerCase()))) throw new Error("concept_slides_topic_drift");
    return clean;
  }

  async function buildSlides(language = "zh") {
    const lang = languageKey(language);
    const corpus = await ensureEvergreenCorpus();
    return {
      title: titleFor(lang, "slides"),
      markdown: validateStaticSlides(corpus.artifacts.slides[lang], lang),
      sourceKind: "systemHelp",
      sourceItemId: `system-concepts-slides-${lang}-v${corpus.version}`,
      generation: {
        method: "editorial-static",
        corpusId: corpus.id,
        corpusVersion: corpus.version,
      },
    };
  }

  return Object.freeze({
    brief,
    buildDocMap,
    buildSlides,
    ensureCorpus: ensureEvergreenCorpus,
  });
})();
