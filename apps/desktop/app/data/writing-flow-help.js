// Lazy system-folder documents for AI System 6.
window.AISystem6WritingFlowHelpData = (() => {
  const docs = {
    readMe: {
      zhTitle: "说明文件",
      enTitle: "Read Me",
      zhLead: [
        "AI System 6 是一张以来源为中心的本地 AI 写作桌面。它不是聊天框，也不是复古皮肤；它帮助你把资料、判断、情感和自己的语言整理成能被真实接收者接住的作品。",
        "它把长文写作里最容易混在一起的东西分开：资料、摘录、问题、接收者、结构、草稿、正文、审校和交付。",
        "它也防止模型变成你的嘴替：粗糙表达、个人碎事、犹豫、吐槽和多样的缺陷，只要承载真实判断，就应该被保住，而不是被漂洗成同一种 AI 味。",
        "这里的 Macintosh 隐喻不是装饰，而是一种写作纪律：对象要看得见，保存要明确，模型回复不能偷偷变成你的成果。",
      ],
      enLead: [
        "AI System 6 is a source-first local AI writing desktop. It is not a chat box and not a retro skin. It helps you turn sources, judgment, feeling, and your own language into work a real recipient can receive.",
        "It separates the parts of long writing that usually collapse into one place: sources, clips, questions, recipient, structure, drafts, manuscript, review, and handoff.",
        "It also keeps the model from becoming your mouthpiece: rough phrasing, personal bits, hesitation, complaints, and diverse flaws should be preserved when they carry real judgment instead of being washed into one AI flavor.",
        "The Macintosh metaphor is not decoration. It is discipline: visible objects, explicit saving, and no model reply becomes your work until you choose where it belongs.",
      ],
      sections: [
        {
          zh: "最短路线",
          en: "Shortest Route",
          zhBody: [
            "**项目硬盘**：为这篇文章开一个清楚的项目房间。",
            "**文件软盘**：临时插入本次写作要用的来源材料。",
            "**Reader 与 Scrapbook**：先阅读，再只留下你确认有价值的摘录。",
            "**问题单**：写清接收者、问题、主张、限制、反对意见、交付摩擦和必须记住的点。",
            "**大纲**：把意图变成章节顺序。",
            "**章节草稿**：一次只处理一个章节。",
            "**TeachText**：完成真正的正文手稿。",
            "**审校台与项目光盘**：检查风险，收束交付。",
          ],
          enBody: [
            "**Project Hard Disk**: the project room for this piece.",
            "**File Floppy**: temporary source material for this startup.",
            "**Reader and Scrapbook**: inspect sources, then keep only chosen clips.",
            "**Question Sheet**: state the recipient, problem, claim, constraints, objections, handoff friction, and must-remember points.",
            "**Outline**: turn intent into section order.",
            "**Section Drafts**: work one section at a time.",
            "**TeachText**: finish the manuscript body.",
            "**Review Desk and Project CD**: check risk, then hand off the export cleanly.",
          ],
        },
        {
          zh: "使用原则",
          en: "How To Use It",
          zhBody: [
            "先走主路线，再召唤工具。Searcher、Reader、DocMap、ClioChart、ClioStage、时光机、Cover Glass、图片提示词工作室、词典、翻译和 ClioTalk 都是帮手，不是新的主线。",
            "模型可以帮助阅读、规划、起草、改写和审校，但它不拥有正文。只有保存、摘录、插入、写入项目硬盘或导出的内容，才真正进入项目。",
            "不要为了显得整齐而提前删掉自己的口水话、碎念和真实使用细节。输入太稀薄时，模型会用自己的均质语言补空；输入够具体时，模型才是在整理你。",
            "如果你在为另一个人、团队、客户、观众或编辑准备东西，先让问题单说清“对方是谁”和“怎样让对方更容易接收”。AI System 6 默认偏向更少、更清楚的交付，而不是更多版本。",
          ],
          enBody: [
            "Walk the main route first, then summon tools. Searcher, Reader, DocMap, ClioChart, ClioStage, Time Machine, Cover Glass, Image Prompt Studio, Dictionary, Translation, and ClioTalk are helpers, not new routes.",
            "The model may help read, plan, draft, rewrite, and review, but it does not own the manuscript. Only saved, clipped, inserted, written, or exported material enters the project.",
            "Do not delete your messy speech, stray thoughts, or real usage details just to look orderly. Thin input makes the model fill gaps with its own uniform language; concrete input lets the model organize you.",
            "If you are preparing work for another person, team, client, audience, or editor, let the Question Sheet name who receives it and how to make it easier to receive. AI System 6 defaults toward fewer, clearer handoffs, not more variants.",
          ],
        },
        {
          zh: "研究、呈现与外观工具",
          en: "Research, Presentation, And Appearance Tools",
          zhBody: [
            "**Searcher → Reader → DocMap**：Searcher 只负责找到来源入口；在 Reader 检查原文并摘录；只有需要展开一份来源的层级、论断与关系时，才把已加载材料交给 DocMap。不要把搜索摘要直接当证据。",
            "**ClioChart → ClioStage**：在 ClioChart 的可编辑网格中整理有来源的数据，让空白保持未知，再选择只读投影并送入 ClioStage。ClioStage 继续保留源码、文档、幻灯和提词视图，以及讲者备注。",
            "**时光机与 Cover Glass**：时光机用真实存档日期检查历史网页；Cover Glass 用场景、图层、画板和 Glass Mix 玻璃总控合成生产封面。Cover Glass 需要背景提示词时使用共享的图片提示词运行时，但图像生成本身在其外完成。它们的结果只有在明确摘录、保存或导出后才进入项目。",
            "**图片提示词工作室**：把一句想法、可选叠层文字、画面比例和可选参考图，写成可直接粘贴的 GPT-Image 与通用提示词。它只写提示词，不生成图片。",
            "**MultiFinder 与外观**：MultiFinder 保持多个应用运行，并从菜单栏切回指定应用。可在“特别 → 外观”沿 System 6、Platinum、Aqua、Snow Leopard、Yosemite、Liquid Glass 时间线选择界面；改变的是同一工作区的外观，不是另一套文件。",
            "**手机工作区**：内容始终优先。应用占满菜单栏下方的屏幕；桌面附件在水平居中的纵向轨道里整体重排，不互相遮盖；详细命令仍保留在菜单与辅助功能名称中。",
          ],
          enBody: [
            "**Searcher → Reader → DocMap**: Searcher only finds source doors. Inspect and clip the original in Reader; hand the loaded material to DocMap only when you need its hierarchy, claims, and relations. Never treat a search snippet as evidence.",
            "**ClioChart → ClioStage**: organize sourced data in ClioChart's editable grid, keep blanks unknown, then choose a read-only projection and send it to ClioStage. ClioStage preserves Source, Document, Slide, and Cue views plus speaker notes.",
            "**Time Machine and Cover Glass**: use real archive dates in Time Machine to inspect the historical web. Use Cover Glass scene, layers, artboard, and the global Glass Mix control to compose a production cover. Cover Glass uses the shared Image Prompt runtime for background prompts, but generating the image stays outside it. Their results enter the project only after an explicit clip, save, or export.",
            "**Image Prompt Studio**: turn an idea, optional overlay title, aspect ratio, and optional reference image into ready-to-paste GPT-Image and universal prompts. It writes prompts; it does not draw the picture.",
            "**MultiFinder and appearance**: MultiFinder keeps applications running and returns to a chosen app from the menu bar. Special → Appearance follows the System 6, Platinum, Aqua, Snow Leopard, Yosemite, and Liquid Glass timeline; the same workspace and files remain underneath.",
            "**Mobile Workspace**: content stays primary. An application fills the screen below the menu bar; Desk Accessories reflow together in one horizontally centered column without covering one another; full command wording remains in menus and accessible names.",
          ],
        },
      ],
    },
    flow: {
      zhTitle: "从问题到正文",
      enTitle: "From Questions to Manuscript",
      zhLead: [
        "长文写作最危险的不是写得慢，而是来源、意图、接收者、AI 建议和最终正文全都挤在一个聊天窗口里。AI System 6 的写作流程，就是为了让这些东西保持各自的位置。",
      ],
      enLead: [
        "Long writing does not fail only because prose is slow. It fails when sources, intent, recipient, AI suggestions, and final prose collapse into one chat. AI System 6 keeps them apart.",
      ],
      sections: [
        {
          zh: "问题单",
          en: "Question Sheet",
          zhBody: ["问题单不是摘要，也不是正文。它保存作者真正要解决的问题：接收者是谁，主张是什么，对方可能卡在哪里，哪些术语要区分，哪些反对意见必须正面处理，哪些来源线索不能丢。它也应该保留还没变成 prose 的人类输入：碎念、用机细节、犹豫、口头判断和压力点。"],
          enBody: ["The Question Sheet is not a summary and not manuscript text. It preserves the writer's problem: recipient, claim, where the other person may get stuck, distinctions, objections, source leads, and output rules. It should also keep human input before it becomes prose: stray thoughts, usage details, hesitation, spoken judgments, and pressure points."],
        },
        {
          zh: "大纲",
          en: "Outline",
          zhBody: ["大纲把问题变成顺序。每个 `##` 都是未来的章节草稿目标。趁 prose 还不沉重时，在这里移动结构。"],
          enBody: ["Outline turns the question into order. Each `##` becomes a future Section Draft target. Move structure here before prose becomes expensive."],
        },
        {
          zh: "章节草稿",
          en: "Section Drafts",
          zhBody: ["章节草稿让一篇大文章变小。一次只处理一个 `##`：看证据，写一节，改一节，然后再进入下一节。"],
          enBody: ["Section Drafts make a large article small. Work one `##` at a time: inspect evidence, draft, revise, then move on."],
        },
        {
          zh: "TeachText",
          en: "TeachText",
          zhBody: ["TeachText 是正文手稿。联动写作流程里，它的标题会同步给问题单、大纲和章节草稿；但正文真正属于 TeachText。"],
          enBody: ["TeachText is the manuscript body. In the linked flow, its title is shared with Question Sheet, Outline, and Section Drafts; the body belongs in TeachText."],
        },
        {
          zh: "审校与交付",
          en: "Review And Handoff",
          zhBody: ["审校台把隐藏风险变成可见风险：缺少支持的论断、松散的章节、风格问题、AI 嘴替漂移、接收者摩擦和最后清理。项目光盘负责交付最终 Markdown 或双语 Markdown。"],
          enBody: ["Review Desk turns hidden risk visible: unsupported claims, loose sections, style issues, AI-mouthpiece drift, recipient friction, and final cleanup. Project CD hands off final Markdown or bilingual Markdown."],
        },
      ],
    },
    memory: {
      zhTitle: "什么会被记住",
      enTitle: "What Gets Remembered",
      zhLead: [
        "模型回复本身不是记忆。搜索结果不是记忆。打开的 Reader 页面也不是记忆。AI System 6 只通过用户选择或保存的可见对象来记住东西。",
      ],
      enLead: [
        "A model reply is not memory. A search result is not memory. An open Reader page is not memory. AI System 6 remembers through visible objects the user chooses or saves.",
      ],
      sections: [
        {
          zh: "会留下的东西",
          en: "Durable Things",
          zhBody: [
            "保存在当前项目硬盘里的 TeachText 文稿与写作记录。",
            "用户主动摘录的 Scrapbook 片段。",
            "写入项目硬盘的参考资料和导入记录。",
            "问题单、大纲、章节草稿、审校状态、废纸篓、项目光盘导出和项目设置。",
          ],
          enBody: [
            "Saved TeachText documents and Writing Records on the current Project Hard Disk.",
            "Scrapbook clips chosen by the user.",
            "References and imported records written to the project.",
            "Question Sheet, Outline, Section Drafts, review state, Trash, Project CD exports, and project settings.",
          ],
        },
        {
          zh: "临时上下文",
          en: "Temporary Context",
          zhBody: [
            "当前 ClioTalk 消息和可选会话上下文。",
            "本次启动挂载的文件软盘材料。",
            "Reader 页面、Searcher 结果、DocMap 视图和未保存的模型回复。",
            "记忆边界只显示上一次模型运行装入了什么；它不是存储位置。",
          ],
          enBody: [
            "The current ClioTalk message and optional session context.",
            "File Floppy material mounted for this startup.",
            "Reader pages, Searcher results, DocMap views, and unsaved model replies.",
            "Memory Inspector shows what entered the last model run; it is not storage.",
          ],
        },
        {
          zh: "一句话规则",
          en: "Rule",
          zhBody: ["重要的东西要放到看得见的位置。证据放进 Scrapbook 或项目硬盘；正文放进章节草稿或 TeachText；交付物放进项目光盘。"],
          enBody: ["If it matters, put it somewhere visible. Evidence goes to Scrapbook or Project Hard Disk; prose goes to Section Drafts or TeachText; handoff goes to Project CD."],
        },
      ],
    },
  };

  function renderDoc(key, language = "zh") {
    const doc = docs[key] || docs.readMe;
    const zh = language === "zh";
    const title = zh ? doc.zhTitle : doc.enTitle;
    const lead = zh ? doc.zhLead : doc.enLead;
    const lines = [`# ${title}`, "", ...lead.flatMap((paragraph) => [paragraph, ""])];
    doc.sections.forEach((section) => {
      lines.push(`## ${zh ? section.zh : section.en}`, "");
      const body = zh ? section.zhBody : section.enBody;
      body.forEach((line) => lines.push(line));
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  const api = {
    render: renderDoc,
    readMe: {},
    flow: {},
    memory: {},
  };

  ["readMe", "flow", "memory"].forEach((key) => {
    Object.defineProperty(api[key], "zh", { get: () => renderDoc(key, "zh") });
    Object.defineProperty(api[key], "en", { get: () => renderDoc(key, "en") });
  });

  return Object.freeze(api);
})();
