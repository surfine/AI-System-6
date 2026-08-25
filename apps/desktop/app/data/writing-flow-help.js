// Lazy, read-only help documents. Editorial cards are internal comprehension
// checks: they keep each document aimed at one real beginner question without
// leaking an agent checklist into the user-facing prose.
window.AISystem6WritingFlowHelpData = (() => {
  const editorialCards = Object.freeze({
    readMe: Object.freeze({
      question: "What is this desk for?",
      stuckPoint: "The Macintosh appearance and the many applications can hide the writing problem it solves.",
      directAnswer: "It gives sources, human intent, drafts, review, and handoff separate visible places.",
      boundary: "AI remains optional and its visible replies are not automatically project work.",
    }),
    flow: Object.freeze({
      question: "How does one long piece move from a rough question to a finished file?",
      stuckPoint: "Readers may mistake every useful tool for a required route stop.",
      directAnswer: "Eight writing objects own eight different decisions; other applications are summoned only when needed.",
      boundary: "The route guides order but does not force the writer through an unnecessary step.",
    }),
    memory: Object.freeze({
      question: "What will still be here next time?",
      stuckPoint: "Visible, sent, saved, and remembered can look like the same state in a chat interface.",
      directAnswer: "Only a confirmed project object is durable; temporary views and model output remain temporary.",
      boundary: "Normal Chats are saved files, but their replies still do not become manuscript text automatically.",
    }),
  });

  const documents = Object.freeze({
    readMe: Object.freeze({
      en: `# Read Me

AI System 6 is a writing desk. Sources, questions, drafts, review, and finished files have different places, so a model reply cannot quietly become your manuscript.

The Macintosh appearance is not the purpose. It supplies a useful rule: an object should show what it is, where it belongs, and whether it has actually been saved.

## Two ways to begin

- **Quick Draft** is the shortest route to one small finished piece. Bring in fragments, write or develop the draft, save it, then download it or continue in TeachText.
- **Writing Studio** is the complete route for a long piece that needs an explicit question, sections, review, and handoff.

## The eight writing objects

1. **Project Hard Disk** keeps one project's durable files apart from every other project.
2. **File Floppy** carries temporary source material for the current work.
3. **Question Sheet** keeps the recipient, raw questions, observations, objections, and limits upstream of prose.
4. **Outline** decides the order and job of each section.
5. **Section Drafts** makes one large article small enough to work on one part at a time.
6. **Manuscript** shows the whole piece in TeachText.
7. **Review Desk** separates factual, structural, voice, and handoff risks before delivery.
8. **Project CD** holds the files you deliberately prepared for handoff.

Reader, Scrapbook, Searcher, DocMap, ClioChart, ClioStage, and ClioTalk are tools you summon when one of those objects needs help. They are not extra checkpoints.

## What AI may do

AI may help read, organize, draft, rewrite, and review. Its answer remains conversation material until you save, clip, insert, confirm Use Result, or export it. Appearing on screen and being saved are different states.

The writer remains part of the work. Personal observation, uncertainty, an awkward but honest sentence, and a real objection are not defects to wash away when they carry judgment.

If you are preparing the piece for another person, team, client, audience, or editor, let the Question Sheet name the real recipient first. AI System 6 defaults toward fewer, clearer handoffs, not more variants.

Close this document when you are ready. Nothing here creates a project or chooses the next step for you.`,
      zh: `# 说明文件

AI System 6 是一张写作桌。来源、问题、草稿、审校和交付文件各有位置，因此模型回复不会悄悄变成你的正文。

Macintosh 的样子不是产品目的。它提供了一条有用的规矩：一个对象应当让人看出它是什么、放在哪里，以及究竟有没有保存。

## 两种开始方式

- **钟点稿**是完成一篇小作品的最短路线。带入碎片，手写或显影成稿，保存后下载，或继续送进 TeachText。
- **创作坊**是长文的完整路线，适合需要明确问题、分节、审校和交付的作品。

## 八个写作对象

1. **项目硬盘**长期保存一个项目的文件，并把它们同其他项目分开。
2. **文件软盘**装入本次工作临时要用的来源材料。
3. **问题单**在正文之前保住接收者、原始问题、个人观察、反对意见和限制。
4. **大纲**决定章节顺序，以及每一节要完成什么。
5. **章节草稿**把一篇大文章拆成一次能处理的一小部分。
6. **正文**在 TeachText 中显示整篇作品。
7. **审校台**在交付前分开检查事实、结构、作者声音和交付风险。
8. **项目光盘**保存你明确准备交出去的文件。

Reader、Scrapbook、Searcher、DocMap、ClioChart、ClioStage 和 ClioTalk 都是按需召唤的工具，不是额外关卡。

## AI 可以做什么

AI 可以帮助阅读、整理、起草、改写和审校。它的回答仍是对话材料，直到你明确保存、摘录、插入、确认“使用结果”或导出。屏幕上出现过，和电脑已经保存，是两种状态。

写作者始终是作品的一部分。粗糙表达、个人碎事、犹豫、吐槽和多样的缺陷，只要承载真实判断，就不该被漂洗掉，也不该让模型变成你的嘴替。

如果这份作品要交给另一个人、团队、客户、观众或编辑，先让问题单说清真实接收者是谁。AI System 6 默认偏向更少、更清楚的交付，而不是更多版本。

准备好以后关掉这份说明即可。这里不会替你新建项目，也不会替你决定下一步。`,
    }),
    flow: Object.freeze({
      en: `# From Questions to Manuscript

A long piece becomes manageable when each decision has one owner. AI System 6 uses eight visible objects so sources, intent, model suggestions, manuscript text, and delivery do not collapse into one chat thread.

## 1. Choose the durable room

Mount the correct **Project Hard Disk** first. It is the durable room for this piece. Insert a **File Floppy** only when temporary local material should join the current work.

The hard disk and floppy answer different questions: the hard disk says what should still be here next time; the floppy says what is available for this session.

## 2. Preserve the human problem

The **Question Sheet** is not a summary and not early manuscript prose. Write who will receive the piece, what they need answered, what you observed, where they may object, which terms need separating, and what remains unknown.

Concrete input matters. When the human problem is thin, a model can fill the empty space with its own generic language.

## 3. Decide order before prose becomes expensive

The **Outline** turns the problem into section order. Each second-level Markdown heading, written as \`##\`, becomes a Section Draft target. Markdown is plain text with small marks that describe structure; here, two number signs mean “start a section.”

Use **DocMap** for the structure of source material. Use **Outline** for the structure you intend to write.

## 4. Work one section at a time

**Section Drafts** owns editable text during drafting. The **Manuscript** in TeachText shows the whole article but remains read-only while a section owns the text. This prevents two windows from silently editing different copies of the same paragraph.

## 5. Read the finished piece back

After the Manuscript is marked Final, **Review Desk** reads it beside the final text. Fact Check asks what visible sources support. Other checks look for loose structure, missing personal detail, overly regular model rhythm, and avoidable friction for the recipient.

Review findings are advice and evidence, not silent edits. The writer chooses what returns to the Manuscript.

## 6. Hand off a file

**Project CD** contains deliberate handoff files. Exporting or burning to it is a separate action from seeing text on screen. The route ends with an object someone else can receive, not with another model answer.

The research chain has its own order: **Searcher → Reader → DocMap**. Searcher finds a source door, Reader opens the original, and DocMap spreads the source's structure out for inspection. Scrapbook keeps only the passages the writer deliberately clips.

ClioTalk, ClioChart, and ClioStage may also join wherever the work needs them. If a step is unnecessary, do not perform it merely to complete a checklist.`,
      zh: `# 从问题到正文

一篇长文之所以能变得好处理，是因为每一种决定只有一个主人。AI System 6 用八个看得见的对象，把来源、意图、模型建议、正文和交付分开，不让它们全挤进一条聊天记录。

## 1. 先选长期保存的房间

首先挂载正确的**项目硬盘**。它是这篇作品长期留下的房间。只有本次需要临时本地材料时，才插入**文件软盘**。

硬盘和软盘回答的是两个问题：硬盘说明“下次还要不要在”；软盘说明“这次能不能使用”。

## 2. 先保住人的问题

**问题单**不是摘要，也不是提前写正文。写清作品交给谁、对方需要得到什么答案、你亲眼看到什么、对方可能怎样反驳、哪些术语必须分开，以及什么仍然未知。

具体输入很重要。人的问题太稀薄时，模型很容易用自己的通用语言填满空白。

## 3. 在正文变重以前决定顺序

**大纲**把问题变成章节顺序。Markdown 中的二级标题写成 \`##\`，每个二级标题都会成为一份章节草稿。Markdown 是一种用少量符号标出文字结构的纯文本格式；这里的两个井号表示“从这一行开始是一节”。

理解来源材料的结构时用 **DocMap**；规划自己要写的结构时用**大纲**。

## 4. 一次只处理一节

起草阶段由**章节草稿**持有可编辑正文。TeachText 中的**正文**显示整篇文章，但章节仍在起草时保持只读。这样，两扇窗口就不会各自偷偷修改同一段文字的不同副本。

## 5. 把定稿重新读一遍

正文标记为定稿后，**审校台**会同定稿并排打开。事实核查询问眼前哪些来源能提供支持；其他检查寻找松散结构、消失的个人细节、过分整齐的模型节奏，以及接收者不必承受的交付摩擦。

审校发现只是证据和建议，不是暗中改写。哪些内容回到正文，由写作者决定。

## 6. 交付一个文件

**项目光盘**保存明确准备交付的文件。把文字导出或刻录进去，是独立于“屏幕上已经出现文字”的另一个动作。路线最终交出的是别人能收到的对象，不是另一条模型回答。

研究工具有自己的先后关系：**Searcher → Reader → DocMap**。Searcher 找到来源入口，Reader 打开原文，DocMap 再把来源的结构摊开供人检查。Scrapbook 只留下写作者明确摘录的段落。

ClioTalk、ClioChart 和 ClioStage 也可以在需要时加入。如果某一步对当前作品没有帮助，不要只为完成清单而使用它。`,
    }),
    memory: Object.freeze({
      en: `# What Gets Remembered

Visible does not mean saved. AI System 6 remembers durable work through confirmed project objects; temporary views and unaccepted model output can disappear.

## Where durable work lives

The browser keeps projects on this device in its built-in database, called **IndexedDB**. Think of it as the file cabinet behind the desk: Project Hard Disks, documents, references, Scrapbook clips, Project CD files, and Trash live there.

The small Node.js server beside the browser connects to models, web reading, OCR, and transcription. It is a bridge, not another file cabinet, and it does not keep a second Project Hard Disk.

## What a normal Chat saves

A normal ClioTalk conversation becomes a **Chat file** when its first message is sent. Each completed, stopped, or failed model request can also create a **Run Record**: a receipt of what the application sent, which Prompt and inputs it used, and what status returned.

Saving a Chat does not make every reply manuscript text. A reply enters Question Sheet, Outline, a Section Draft, TeachText, Scrapbook, or a new document only after the writer reviews and confirms Use Result.

## What stays temporary

- A **Temporary Chat** disappears when it closes unless the user explicitly saves it.
- A Searcher result is only a source door until the original is opened and useful material is clipped or saved.
- An unsaved Reader page, DocMap view, or model reply may help the current work without becoming a durable project file.
- A File Floppy is temporary context. Ejecting it removes that mounted material from the current work.

## Why another window may be read-only

Several tabs or installed app windows can point to the same IndexedDB file cabinet. To stop an older copy from overwriting newer work, only one AI System 6 instance may save changes at a time. Other instances remain read-only until write access is safely handed over.

## How to carry work elsewhere

Browser storage belongs to this browser on this device. Export a **Project Backup** before clearing site data, changing browsers, or moving to another device. A backup is the explicit portable copy; the server is not a hidden cloud backup.

The practical rule is short: if something matters, put it in a visible project object and wait for the save receipt.`,
      zh: `# 什么会被记住

看得见，不等于已经保存。AI System 6 只通过确认写入的项目对象长期记住工作；临时视图和未采用的模型结果可能消失。

## 长期内容放在哪里

浏览器把项目保存在这台设备的内建数据库中，这个数据库叫 **IndexedDB**。可以把它理解成桌面背后的文件柜：项目硬盘、文档、参考资料、Scrapbook 摘录、项目光盘文件和废纸篓都放在里面。

浏览器旁边的小型 Node.js 服务负责连接模型、网页读取、OCR 和音频转写。OCR 是从图片中识别文字。这个服务是一座桥，不是另一只文件柜，也不会另存一份项目硬盘。

## 普通 Chat 会保存什么

普通 ClioTalk 对话发送第一条消息时，会成为一个 **Chat 文件**。每次完成、停止或失败的模型请求还可以生成一份**运行记录**：它是一张回执，说明应用发送了什么、使用了哪些 Prompt 与输入，以及最后返回什么状态。

保存 Chat 不等于把所有回复写进正文。回复只有在写作者查看并确认“使用结果”后，才会进入问题单、大纲、章节草稿、TeachText、Scrapbook 或新文档。

## 什么仍然是临时的

- **临时对话**关闭后消失，除非用户明确保存。
- Searcher 结果只是来源入口；打开原文并摘录或保存以后，有用材料才会留下。
- 未保存的 Reader 页面、DocMap 视图或模型回复可以帮助当前工作，但不因此自动成为项目文件。
- 文件软盘是临时上下文。推出软盘后，这批挂载材料会离开当前工作。

## 为什么另一扇窗口可能只读

多个浏览器标签页或安装后的应用窗口，可能共同指向同一只 IndexedDB 文件柜。为了防止较旧的副本覆盖较新的工作，同一时间只有一个 AI System 6 实例可以保存修改。其他实例保持只读，直到写入权限安全移交。

## 怎样把项目带到别处

浏览器存储属于这台设备上的当前浏览器。清理网站数据、更换浏览器或换设备前，应先导出**项目备份**。备份才是明确的可携带副本；旁边的服务不是隐藏的云备份。

实际规则很短：重要的东西要放进看得见的项目对象，并等到保存回执出现。`,
    }),
  });

  function languageKey(language = "zh") {
    return String(language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function render(documentKey = "readMe", language = "zh") {
    const document = documents[documentKey] || documents.readMe;
    return document[languageKey(language)];
  }

  const api = { render, editorialCards };
  for (const key of Object.keys(documents)) {
    api[key] = Object.freeze({
      get zh() { return documents[key].zh; },
      get en() { return documents[key].en; },
    });
  }
  return Object.freeze(api);
})();
