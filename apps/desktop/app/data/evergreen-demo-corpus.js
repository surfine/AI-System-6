// Evergreen, bilingual demonstration material for AI System 6.
//
// This is a classic script because Help, Rebuild Writing Objects, and the
// demos all load it on demand.  The dated development article remains the
// source of the story; these artifacts deliberately keep only product facts
// that should survive an ordinary release cycle.

(function publishEvergreenDemoCorpus(root) {
  const article = {
    zh: `# 当聊天框装不下一篇文章，我做了一台 1988 年的 AI 电脑

用 AI 写文章时，我常有一种荒唐的感觉：它看起来很能干，真正负责跑腿的人却是我。模型在聊天框里写一段，我搬去编辑器；发现数字不对，我回浏览器找来源；第二天再打开，资料、指令、废稿、核查记录和几份互相冲突的正文，已经挤成一条没有边界的聊天记录。

问题不只是上下文太短。代码可以运行，文章却没有一盏简单的绿灯。一段话可能没有错字，事实也无误，读起来却已经不像写它的人。模型最容易抹掉的，往往正是一句犹豫、一处亲眼看到的细节，或者一句说得不够圆，却真正带着判断的话。

AI System 6 从这个矛盾里长出来：AI 需要一个能够工作的环境，作者又不能退到最后，只负责按下“通过”。

## 聊天只是一款应用

假如 AI 只是一款应用，整台电脑里还应该有什么？答案不该只是另一个更大的聊天框。

一篇文章需要来源、剪贴、原始问题、大纲、草稿、正式稿、审校结果和最后交付的文件。这些东西在普通电脑里各有位置，到了聊天产品里，却常被压成同一种东西——一条消息。

所以 ClioTalk 只是桌面上的一款应用。真正承载工作的，是一组看得见的对象：项目硬盘保存长期状态；文件软盘承接这次带进来的临时材料；问题单留下真实接收者、原始问题、个人观察和反对意见；大纲决定展开次序；章节草稿一次只处理一节；TeachText 拥有正文；审校台检查事实、结构和模型嘴替漂移；项目光盘保存交付物。

这条路线多了几个明确动作，却解决了一个常被忽略的问题：模型写出一段文字，不等于这段文字已经进入稿件。屏幕上出现过，和电脑已经保存，是两件不同的事。

## 这台 Macintosh 住在浏览器里

AI System 6 是一套重新写出来的浏览器桌面，不是旧处理器模拟器。项目、文档、摘录和设置保存在浏览器的 IndexedDB 中；旁边的小型 Node.js 服务只负责连接模型、网页读取、OCR 和转写，不拥有另一份项目数据库。

因此，更换模型不需要搬家；服务重新启动，项目仍在原处；没有接入模型时，桌面依然可以打开文件、整理材料、编辑文字和导出成品。AI 是环境中的能力，不是环境存在的前提。

## 打开、修改和保存，不能混成一个动作

打开、阅读、编辑、审查、绘制结构、演示、附加和导出，是八种不同意图。主题可以改变窗口的样子，不能改变一份文件是否已经保存。

模型也要遵守这条边界。没有界面状态、工具结果或项目记录作证时，它不能说“已经保存”“已经插入正文”或“已经完成事实核查”。来源材料里即使出现命令口吻，也只能作为资料阅读；缺失的作者、日期、权限和引用关系保持未知。

浏览器还允许同一网站同时开在几个窗口里，所以保存背后有一张 single-writer lease：同一时间只有一个窗口可以写项目。接管写入权之前，旧窗口必须先保存；真正落盘之前，新窗口还会再次核对执笔者。保存失败，内存状态回滚，不拿一份看似成功的界面覆盖用户原稿。

## 文字不能被反复压缩

快速草稿把作者文字当作“底片”，把模型处理当作“调整层”。每一层都从作者原文出发，不拿上一层生成的文字继续加工。用户还可以保护一句原话、一个数字或一段私人旁白；发送前它们会被本地标记替代，返回后逐一验明，再放回原位。标记少一个、多一个或损坏一个，整次结果都不应用。

这会让某些模型任务失败，却不会拿用户明确要求保留的文字冒险。

## 两张软盘真的只有两张

开机所需的首页、样式和 JavaScript 必须装进两张 1.44 MB 软盘。字典、DocMap、幻灯片、创意工作台和游戏，只有在用户打开时才加载。

这个限制不断追问同一件事：一项能力真的需要在开机时出现吗？它阻止所有功能一起挤进第一眼，也提醒开发者，删掉十九个不该出现的按钮，往往比再加一个更接近产品完成。

## 停止聊天以后，人还要做什么

作者不只是出题人和验收员。亲眼看到的东西、对某个人的了解、说话时的停顿，以及没有完全想明白的判断，本来就是文章的一部分。

AI System 6 让模型读到项目材料，在不同对象之间工作，也让它根据审校结果继续修改；同时保留几个必须由人完成的动作：挑选资料，写下原始问题，决定哪种改写可以进入草稿，并把临时结果正式保存。

这样一来，人不用继续在聊天框、浏览器和编辑器之间搬运文字。模型的建议也不会趁人不注意，偷偷变成正文。`,
    en: `# When a Chat Box Could Not Hold an Article, I Built a 1988 AI Computer

Writing with AI often leaves me with an absurd feeling: the model looks capable, yet I am the one doing the errands. It writes in chat; I carry the text to an editor. A number looks wrong; I go back to the browser for the source. By the next day, research, instructions, abandoned drafts, fact checks, and several conflicting manuscripts have collapsed into one borderless conversation.

The problem is not only a short context window. Code can run; an article has no single green light. A paragraph may be grammatical and factually correct while no longer sounding like the person who wrote it. The first things a model smooths away are often the things that matter: a hesitation, a witnessed detail, or an inelegant sentence that carries a real judgment.

AI System 6 grew from that tension. AI needs an environment in which it can work, but the writer cannot retreat to the end and merely press Approve.

## Chat Is One Application

If AI is only one application, what else belongs on the computer? The answer should not be a larger chat box.

An article needs sources, clippings, original questions, an outline, drafts, a manuscript, review results, and a final deliverable. Ordinary computers give those things different places. Chat products often compress them into one thing: a message.

ClioTalk is therefore one application on the desk. Visible objects carry the work. Project Hard Disk owns durable state. File Floppy carries temporary material for the current task. Question Sheet keeps the real recipient, rough questions, observations, and objections. Outline decides the order. Section Drafts handle one section at a time. TeachText owns the manuscript. Review Desk checks facts, structure, and model-mouthpiece drift. Project CD holds the handoff.

That route adds a few explicit actions, but it solves an easily missed problem: text produced by a model has not thereby entered the manuscript. Appearing on screen and being saved by the computer are different events.

## This Macintosh Lives in the Browser

AI System 6 is a browser desktop written anew, not an emulator for an old processor. Projects, documents, clips, and settings live in IndexedDB. A small Node.js service connects models, web reading, OCR, and transcription, but owns no second project database.

Changing models does not require moving the project. Restarting the service does not erase it. With no model connected, the desk can still open files, organize material, edit prose, and export finished work. AI is a capability of the environment, not a precondition for the environment to exist.

## Open, Edit, and Save Are Different Verbs

Open, read, edit, review, map, present, attach, and export are different intents. A theme may change the window material; it cannot change whether a file was saved.

The model follows the same boundary. Without UI state, a tool result, or a project record, it cannot claim that something was saved, inserted, exported, or fact-checked. Imperative language inside a source remains source data. Missing authorship, dates, permissions, and citation links remain unknown.

Because a browser can open the same site in several windows, saving also sits behind a single-writer lease. Only one window may write a project. A handoff first saves the old writer's work; every durable write checks ownership once more. If saving fails, memory rolls back instead of letting a successful-looking screen overwrite the writer's draft.

## Prose Must Not Be Repeatedly Compressed

Quick Draft treats the writer's text as a negative and model operations as adjustment layers. Every layer reads the author's source, not another layer's generated result. A writer may also protect a quotation, a number, or a private aside. The browser replaces it with a local marker before the request, verifies every marker on return, and only then restores the original bytes. One missing, duplicated, or damaged marker rejects the entire result.

Some model runs fail because of this rule. The system would rather fail than gamble with words the writer explicitly protected.

## Two Floppies Really Mean Two Floppies

The startup page, styles, and JavaScript must fit on two 1.44 MB floppies. Dictionary, DocMap, slides, creative workbenches, and games load only when summoned.

The limit keeps asking one useful question: does this capability truly belong at startup? It prevents every feature from crowding into the first view, and it reminds the developer that removing nineteen unnecessary buttons can bring a product closer to completion than adding one more.

## What Remains for the Human

A writer is not merely the person who supplies the task and approves the output. What they witnessed, whom they understand, where they pause, and what they have not fully settled are part of the work.

AI System 6 lets a model read project material, work across visible objects, and revise after review. It also keeps several acts human: choosing sources, writing the first questions, deciding which change may enter a draft, and explicitly saving temporary material.

The writer no longer has to carry text between chat, browser, and editor. The model's suggestion does not quietly become the manuscript while nobody is looking.`,
  };

  const questionSheet = {
    zh: `# 一台不让作者变成模型嘴替的 AI 电脑

## 主题
- 为什么长文写作需要一套工作环境，而不只是更长的聊天框？

## 原始问题
- 聊天为什么装不下一篇文章？
- AI 能多做一些，而不替作者说话吗？
- 屏幕上出现过，怎样才算真正保存？

## 原始输入 / 碎念
- AI 很能干，跑腿的却总是我。
- 文章没有代码那样简单的绿灯。
- 最怕不是写错，而是越改越不像自己。

## 接收者 / 受众
- 正在用 AI 写长文，却被复制、版本和来源拖累的写作者。
- 想理解产品边界与实现取舍的开发者。

## 必须记住
- ClioTalk 只是应用；对象才承载状态。
- 模型输出保持临时，直到用户明确保存、摘录、插入或导出。
- 作者的观察、判断、犹豫和声音不是噪声。

## 反对意见 / 张力
- 多几个对象会不会比聊天更麻烦？
- 既然 AI 能执行，为什么不让它自动跑完整条路线？
- 复古外观是否只是一层皮肤？

## 需要区分的术语
- 聊天记录 / 稿件
- 临时材料 / 项目状态
- 模型建议 / 已确认写入
- 复古外观 / 对象约束

## 来源线索
- 浏览器 IndexedDB 与无状态服务边界。
- application intents、single-writer lease、adjustment layers、protected ranges。
- 两张 1.44 MB 软盘的启动预算。

## 语气 / 风格目标
- 第一人称、具体、克制；技术机制要讲成人话。
- 不把开发记写成发布会，也不把个人判断洗成中性总结。

## 交付减摩擦
- 先讲用户为什么累，再讲对象如何分工；术语第一次出现就解释。
- 每个技术机制都回答“它替写作者挡住了什么风险”。

## 输出规则
- 我给 AI 的意图要多于我要求它输出的文字。`,
    en: `# An AI Computer That Does Not Turn the Writer into a Model Mouthpiece

## Topic
- Why does long-form writing need a working environment rather than a longer chat box?

## Original Questions
- Why can a chat box not hold an article?
- Can AI do more without speaking in place of the writer?
- What turns text seen on screen into work that was actually saved?

## Raw Input / Stray Thoughts
- The AI looks capable, but I keep doing the errands.
- An article has no green light as simple as a passing test.
- The frightening failure is not only being wrong; it is becoming less like oneself after every revision.

## Recipient / Audience
- Writers using AI for long work who are tired of carrying versions and sources by hand.
- Developers trying to understand the product's boundaries and implementation choices.

## Must Remember
- ClioTalk is an application; visible objects carry state.
- Model output remains temporary until the user saves, clips, inserts, or exports it.
- Observation, judgment, hesitation, and voice are not noise.

## Objections / Tensions
- Do more objects create more work than chat?
- If AI can execute, why not let it run the whole route alone?
- Is the old Macintosh merely a skin?

## Terms To Distinguish
- conversation / manuscript
- temporary material / project state
- model suggestion / confirmed write
- retro appearance / object constraint

## Source Leads
- Browser IndexedDB and the stateless service boundary.
- Application intents, single-writer lease, adjustment layers, and protected ranges.
- The two-floppy startup budget.

## Tone / Style Target
- First-person, concrete, restrained; explain mechanisms in ordinary adult language.
- Do not turn a development story into launch copy or flatten judgment into neutral summary.

## Handoff Friction
- Begin with why the user is tired, then show how the objects divide the work.
- Every mechanism should answer which risk it removes from the writer.

## Output Rules
- My input intent should be richer than the AI output I ask for.`,
  };

  const outline = {
    zh: `# 当聊天框装不下一篇文章

## 跑腿的人为什么还是我
- 资料、指令、废稿与正文混在一条聊天里。
- 文章没有单一测试；正确也可能已经不像作者。

## 聊天只是一款应用
- 电脑需要来源、问题、大纲、草稿、正文、审校和交付对象。
- 屏幕上出现过，不等于已经进入稿件。

## 浏览器里的 Macintosh
- IndexedDB 拥有项目；Node 服务只做转接。
- 没有模型时，桌面仍然是一台能工作的电脑。

## 打开、修改和保存是不同动作
- application intents 让对象和动作保持明确。
- 来源是资料，不是命令；缺失信息保持未知。
- single-writer lease 保护多个窗口同时写入。

## 保护作者留下的毛边
- 调整层每次从原文出发。
- 受保护文字宁可让任务失败，也不猜着还原。

## 两张软盘与人的位置
- 懒加载迫使每项能力回答“为什么要在开机时出现”。
- 人选择材料、原始问题、可接受的改写和最终保存。`,
    en: `# When a Chat Box Cannot Hold an Article

## Why Am I Still Doing the Errands?
- Research, instructions, abandoned drafts, and manuscript collapse into one conversation.
- An article has no single test; correct prose may still stop sounding like its writer.

## Chat Is One Application
- A computer needs source, question, outline, draft, manuscript, review, and handoff objects.
- Appearing on screen does not mean entering the manuscript.

## A Macintosh in the Browser
- IndexedDB owns the project; the Node service only connects capabilities.
- Without a model, the desktop remains a working computer.

## Open, Edit, and Save Are Different Actions
- Application intents keep objects and verbs explicit.
- Sources are data, not commands; missing information remains unknown.
- A single-writer lease protects concurrent windows.

## Protect the Writer's Rough Edges
- Every adjustment layer begins from the source text.
- Protected words reject the run rather than being guessed back into place.

## Two Floppies and the Human Place
- Lazy loading forces every capability to justify appearing at startup.
- The human chooses sources, first questions, acceptable changes, and the final save.`,
  };

  const clippings = {
    zh: [
      { title: "聊天只是应用", text: "ClioTalk 仍然可以和模型对话，但它只是桌面上的一款应用。聊天不能同时冒充资料库、文件系统、编辑器、项目目录和保存记录。" },
      { title: "出现过与保存过", text: "模型写出一段文字，不等于这段文字已经进入稿件。屏幕上出现过，和电脑已经保存，是两件不同的事。" },
      { title: "作者不是验收员", text: "作者不只是出题人和验收员。亲眼看到的东西、说话时的停顿、没有完全想明白的判断，都会进入文章。" },
      { title: "两张软盘", text: "软盘预算不断追问同一件事：这项能力真的需要在开机时出现吗？判断哪十九个按钮不该出现，仍然需要人。" },
    ],
    en: [
      { title: "Chat is an application", text: "ClioTalk can converse with a model, but it is one application on the desk. Chat cannot also pretend to be the source library, file system, editor, project directory, and save record." },
      { title: "Seen versus saved", text: "Text produced by a model has not thereby entered the manuscript. Appearing on screen and being saved by the computer are different events." },
      { title: "The writer is not an approver", text: "A writer is not merely the person who supplies the task and approves the output. What they witnessed, where they pause, and what they have not settled are part of the work." },
      { title: "Two floppies", text: "The floppy budget keeps asking whether a capability truly belongs at startup. Deciding which nineteen buttons should not exist still belongs to a person." },
    ],
  };

  const teaserManuscript = {
    zh: `# 屏幕上出现过，不等于已经保存

AI 看上去很能干，真正负责跑腿的人却常常还是写作者：把回答搬去编辑器，把来源搬回聊天，再从几份冲突的正文里找出现在这一版。

AI System 6 把聊天放回一款应用的位置。来源、摘录、问题单和正文各自成为对象；模型结果先停在临时状态，只有明确保存、摘录、插入或导出，才进入项目。

这不是多绕一步，而是把“看见了”和“留下了”重新分开。`,
    en: `# Appearing on Screen Is Not the Same as Being Saved

AI looks capable, yet the writer often remains the courier: carrying replies to an editor, bringing sources back to chat, and finding the current manuscript among several conflicting versions.

AI System 6 puts chat back in its place as one application. Sources, clippings, questions, and manuscript become different objects. Model output remains temporary until the writer explicitly saves, clips, inserts, or exports it.

That is not an extra detour. It restores the difference between seeing something and keeping it.`,
  };

  const docMap = {
    zh: `# AI System 6：让 AI 工作，也让作品仍属于作者

## 为什么存在
- 聊天混合来源、指令、废稿和正文
- 长文没有单一“测试通过”
- 正确不等于仍像作者

## 对象而不是消息
- 项目硬盘：长期状态
- 文件软盘：临时材料
- 问题单：接收者、原始问题与张力
- TeachText：正文所有者
- 项目光盘：交付物

## 写作路线
- 问题先于答案
- 大纲决定展开顺序
- 章节草稿一次处理一节
- 审校台检查事实、结构与模型嘴替漂移

## 保存与证据
- 出现过不等于保存过
- 应用意图区分打开、编辑、审查与导出
- 来源内容是资料，不是系统命令
- single-writer lease 保护并发写入

## 保护作者声音
- 调整层每次读取作者底片
- 粗糙观察和犹豫可以有价值
- 受保护文字损坏就拒绝整次结果

## 约束带来的清楚
- 两张软盘限制开机内容
- 大工具只在需要时加载
- 人决定材料、判断、写入与交付`,
    en: `# AI System 6: Let AI Work While the Work Remains the Writer's

## Why It Exists
- Chat mixes sources, instructions, abandoned drafts, and manuscript
- Long writing has no single passing test
- Correct prose may still stop sounding like its writer

## Objects, Not Messages
- Project Hard Disk: durable state
- File Floppy: temporary material
- Question Sheet: recipient, original questions, and tension
- TeachText: manuscript owner
- Project CD: handoff object

## The Writing Route
- Questions precede answers
- Outline decides the order
- Section Drafts handle one section at a time
- Review Desk checks facts, structure, and model-mouthpiece drift

## Saving and Evidence
- Seen is not the same as saved
- Application intents distinguish open, edit, review, and export
- Source content is data, not a system command
- A single-writer lease protects concurrent writes

## Protect the Writer's Voice
- Every adjustment reads the author's negative
- Rough observation and hesitation may carry value
- Damaged protected text rejects the whole result

## Clarity Through Constraint
- Two floppies limit startup content
- Large tools load only when summoned
- The human chooses material, judgment, writes, and handoff`,
  };

  const slides = {
    zh: `---
marp: true
theme: default
paginate: true
size: 16:9
---

# 当聊天框装不下一篇文章

- AI 看上去很能干
- 真正负责搬运上下文的人却是写作者

<!--
notes: 问题不是模型不会写，而是工作没有地方安放。
-->

---

# 正确，还不等于属于作者

- 文章没有单一的绿色测试灯
- 犹豫、细节与不够圆的话，也可能承载判断

---

# 聊天只是一款应用

- 来源不是消息
- 稿件不是回答
- 保存记录也不该藏在聊天里

---

# 让对象承担工作

- 项目硬盘：长期状态
- 文件软盘：临时材料
- TeachText：正文
- 项目光盘：交付

---

# 出现过，和保存过

- 模型结果先保持临时
- 保存、摘录、插入、导出都需要明确动作

---

# 浏览器也能是一台电脑

- IndexedDB 保存项目
- Node.js 服务只连接能力
- 换模型，不必搬项目

---

# 每个动作都留下证据

- open / read / edit / review
- map / present / attach / export
- 没有记录，就不声称已经完成

---

# 不反复压缩作者声音

- 调整层每次从原文出发
- 受保护文字损坏，整次结果作废

---

# 两张软盘是一条真约束

- 开机内容必须说明自己为什么在场
- 大工具只在用户召唤时加载

---

# 人仍然在写

- 人选择资料与原始问题
- 人决定哪种改写进入草稿
- 人把临时结果正式保存

<!--
notes: AI 不再要求人跑腿，也没有取得替人说话的权利。
-->`,
    en: `---
marp: true
theme: default
paginate: true
size: 16:9
---

# When a Chat Box Cannot Hold an Article

- AI looks capable
- The writer still carries the context by hand

<!--
notes: The problem is not that the model cannot write. The work has nowhere to live.
-->

---

# Correct Is Not the Same as Yours

- An article has no single green test light
- Hesitation and awkward detail may carry judgment

---

# Chat Is One Application

- A source is not a message
- A manuscript is not a reply
- A save record should not hide in conversation

---

# Let Objects Carry the Work

- Project Hard Disk: durable state
- File Floppy: temporary material
- TeachText: manuscript
- Project CD: handoff

---

# Seen and Saved Are Different

- Model output begins as temporary material
- Save, clip, insert, and export are explicit actions

---

# A Browser Can Be a Computer

- IndexedDB keeps the project
- The Node.js service only connects capabilities
- Changing models does not move the work

---

# Every Action Leaves Evidence

- open / read / edit / review
- map / present / attach / export
- Without a record, do not claim completion

---

# Do Not Recompress the Writer's Voice

- Every adjustment begins from the source
- Damaged protected text rejects the result

---

# Two Floppies Are a Real Constraint

- Startup content must justify its presence
- Large tools load only when summoned

---

# The Human Still Writes

- A person chooses sources and first questions
- A person decides which change enters the draft
- A person turns temporary material into saved work

<!--
notes: AI no longer makes the writer run errands, and it does not gain the right to speak in the writer's place.
-->`,
  };

  const review = {
    zh: `# 审校示例

- **值得保留**：用“跑腿的人还是我”把抽象的上下文问题落到了日常动作上。
- **事实边界**：技术名词第一次出现时解释用途；不要把一次构建测量写成永久状态。
- **结构风险**：保存、调整层与软盘预算都要回到同一个问题——它们替写作者挡住了什么。
- **模型嘴替检查**：保留第一人称的犹豫和判断，不把结尾抬成空泛宣言。`,
    en: `# Review Example

- **Keep**: “I am still doing the errands” makes an abstract context problem concrete.
- **Fact boundary**: explain a technical term on first use; do not present one build measurement as permanent state.
- **Structure risk**: saving, adjustment layers, and the floppy budget should all return to one question — which risk do they remove from the writer?
- **Model-mouthpiece check**: keep first-person hesitation and judgment; do not inflate the ending into generic uplift.`,
  };

  const corpus = Object.freeze({
    id: "ai-system6-development-story",
    version: 1,
    source: Object.freeze({
      titleZh: "当聊天框装不下一篇文章，我做了一台 1988 年的 AI 电脑",
      titleEn: "When a Chat Box Could Not Hold an Article, I Built a 1988 AI Computer",
      kind: "author-provided-development-article",
      noteZh: "基于作者提供的开发记，抽取不随普通版本更新而失效的产品事实。",
      noteEn: "Derived from the author's development story and limited to product facts that should survive ordinary releases.",
    }),
    projectName: Object.freeze({ zh: "演示项目 - 当聊天框装不下一篇文章", en: "Live Demo - When Chat Cannot Hold an Article" }),
    sourceFileName: Object.freeze({ zh: "AI System 6 开发记（示范来源）", en: "AI System 6 Development Story (Demo Source)" }),
    manuscriptTitle: Object.freeze({ zh: "当聊天框装不下一篇文章", en: "When Chat Cannot Hold an Article" }),
    finalExportTitle: Object.freeze({ zh: "当聊天框装不下一篇文章 - 定稿", en: "When Chat Cannot Hold an Article - Final" }),
    shortIntent: Object.freeze({
      zh: "我想解释为什么 AI 写作需要一台电脑，而不只是更长的聊天框；要保留作者仍然在写这件事。",
      en: "Explain why AI writing needs a computer rather than a longer chat box, while keeping the writer visibly inside the work.",
    }),
    followupQuestions: Object.freeze({
      zh: Object.freeze(["如果把开头剪成 20 秒口播，哪两个动作最值得留下？", "哪些技术判断必须保留原文边界，不能写成宣传承诺？"]),
      en: Object.freeze(["If the opening became a 20-second spoken segment, which two actions should remain?", "Which technical judgments need their source boundary instead of becoming product promises?"]),
    }),
    artifacts: Object.freeze({ article: Object.freeze(article), questionSheet: Object.freeze(questionSheet), outline: Object.freeze(outline), clippings: Object.freeze(clippings), teaserManuscript: Object.freeze(teaserManuscript), docMap: Object.freeze(docMap), slides: Object.freeze(slides), review: Object.freeze(review) }),
  });

  if (typeof module !== "undefined" && module.exports) module.exports = corpus;
  root.AISystem6EvergreenDemoCorpus = corpus;
})(typeof globalThis !== "undefined" ? globalThis : window);
