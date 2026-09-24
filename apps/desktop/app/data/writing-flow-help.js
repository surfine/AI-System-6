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
    shared: Object.freeze({
      question: "What are the demonstration project disks?",
      stuckPoint: "A finished piece is usually passed around as a file or a screenshot, so the route that produced it disappears.",
      directAnswer: "Thirty-five disks ship with the application; the Startup Disk holds a folder that lists them, /go/dtk and /go/ipad1 open single ones, and each becomes an ordinary editable project on this computer.",
      boundary: "Nothing is imported until someone opens a disk on purpose, and the disks carry the writers' own working material rather than a polished showcase.",
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

## Demonstration project disks

Two disks ship with the application, so the way a piece travels from a question sheet to a manuscript stays visible. Their addresses are \`system6.aaronlau.me/go/<route>\`; **File › Open Demonstration Project Disks…**, the Write to Project Hard Disk window, and the help page "Demonstration Project Disks" all lead to them.

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

## 演示用项目硬盘

随应用发布的两块盘，能让一篇作品从问题单走到正文的过程看得见。地址是 \`system6.aaronlau.me/go/<route>\`；**File 菜单的「打开演示用项目硬盘…」**、「写入项目硬盘」窗口，以及说明文件夹里的「演示用项目硬盘」这一篇，都会带你到它们。

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
    shared: Object.freeze({
      en: `# Demonstration Project Disks

Thirty-five project disks ship with the application, so the way a finished piece travels from a question sheet to a manuscript stays visible. They are a folder on the Startup Disk, beside the writer's own Project Hard Disk; the File menu opens the same folder. Each disk also has an address of its own, \`https://system6.aaronlau.me/go/<route>\`, which anyone can pass on.

## What happens when you open one

- The disk is checked first. If its checksum or version history does not hold, the import stops cleanly instead of leaving half a project behind.
- What passes becomes an ordinary project on this computer. It comes back from the Project Hard Disk list like any other project, and it stays editable.
- Opening the same disk again reuses the copy you already have instead of adding a second one.

## The thirty-five disks

- \`/go/dtk\` — *After the Bridge Opens*: six years of a 2020 Developer Transition Kit, from GoldenGateSeedSpike to macOS 27 Golden Gate: a board brought back to life, and a server that no longer recognises it.
- \`/go/ipad1\` — *Why the First iPad Had Only 256MB*: from a blurry childhood video to the 2010 specification sheet.
- \`/go/m5ipad\` — *M5 iPad Pro: Mac's last line, or the start of something else?*: two people, two sizes, and one keyboard that decides which of the two machines you get.
- \`/go/iphone17e\` — *iPhone 17e, pale pink: unremarkable, and better than it looks*: the cheapest new iPhone, argued from the things you bump into while using it.
- \`/go/sleeve\` — *The MagSafe Leather Sleeve: how did Apple think about phone dependence?*: a window that ran the always-on logic on iPhone two years early, the 2018 belief in digital wellbeing behind it, and why Apple's always-on display went another way.
- \`/go/iphone6sp\` — *Does anyone remember 3D Touch?*: the generation that made "durable" a word for an iPhone, and the press-and-hold that stayed.
- \`/go/pocket\` — *When the iPhone wears Issey Miyake*: one cloth, one pocket, and the line of Apple accessories that made the device part of your body.
- \`/go/macpro19\` — *The Mac Pro (2019): the drawer that holds the Intel era*: the last expandable tower, and the only machine that ever had MPX.
- \`/go/ceramic\` — *The ceramic Apple Watch: my first love*: a finish Apple barely advertised, retired in 2020 as its advantages wore away — and back in 2026.
- \`/go/sympathy\` — *Project Sympathy: the iPod is gone, the music is not*: AirPods Max read as the continuation of the iPod line, with a cable that proves it.
- \`/go/pm17\` — *The generation where form followed function*: aluminium came back for heat, three fused cameras made the middle quality tier usable, and A19 Pro pays for Liquid Glass.
- \`/go/airbattery\` — *The iPhone Air MagSafe Battery: three generations, one question — who charges whom*: the mechanism behind Apple's battery accessories, told through the same cell as the phone.
- \`/go/ipad97\` — *iPad Pro 9.7: the same rebellion, one size down*: what the smaller Pro kept, what it gave back, and why its successor was called Air.
- \`/go/glass\` — *Glass and Where It Comes From*: Aqua, Aero, iOS 7 and Liquid Glass read as one trade — what each era's glass was for.
- \`/go/bongo\` — *Toward One Piece of Glass*: Project Bongo, the two 2006 prototypes Apple rejected, and why a button you cannot press is the entry ticket for a glass phone.
- \`/go/pm12\` — *iPhone 12 Pro Max: unboxing one never activated, and Apple's oddest case*: a sealed unit revived by raising a flat battery's voltage, the gemstone blue, the first iPhone to shoot 10-bit and where it fell short, and a leather sleeve that assumes you own the whole Apple family.
- \`/go/iphone17\` — *iPhone 17: where the base model stopped being the cheap one*: the year 120Hz, 256GB and a self-designed radio chip all moved down a tier, and what that says about who the base model is really for.
- \`/go/windowshade\` — *Shade the window, keep its place*: the WindowShade site read as one piece — a 1994 double-click that became a System 7.5 control panel, lost out to the Dock, lived on in Stickies, and came back to the Mac thirty years later.
- \`/go/cdma4\` — *CDMA iPhone 4*: The first "China eSIM" iPhone — only half true: writing a number welds it to the phone while eSIM frees it, yet China's eSIM walked back to the counter.
- \`/go/noport\` — *Portless Apple Watch*: A safety net came before the missing port: the diagnostic link went from pins to 60.5GHz, and the real driver was that a device has to be able to recover itself.
- \`/go/touch2\` — *touch 2 Engineering Board*: A device that is not a device: built to test a chip rather than be an iPod, it answers to two products, has no serial number, and outlives its own launch.
- \`/go/airact\` — *iPhone Air*: 165 grams used to be a normal phone: the radical move here is subtraction, and it proves thin does not have to mean short battery life — the costs land elsewhere.
- \`/go/ip4sdemo\` — *iPhone 4S Demo Unit*: A key back to the past: a demo unit belongs switched on — its value comes from being used, not enshrined, and it recalibrates what a good experience feels like.
- \`/go/airtrans\` — *Transparent Air Prototypes*: Transparency is a working method, not a colourway: the clear shell is the engineer's window onto a product before it is frozen, and that habit now shows up as material and depth in the interface.
- \`/go/t2nic\` — *Apple T2 Network Card*: Two devices on one card: the NIC half is standard, and the real question is the device beside it — Apple builds interfaces, not single-purpose parts.
- \`/go/mgscrap\` — *MagSafe Prototypes*: How Apple treats its failures: two months after AirPower was cancelled, Apple had already turned — these unsold samples are proof of effort, and what Apple lacks today is execution, not invention.
- \`/go/ip16p\` — *iPhone 16 Prototype*: Details of products to come: a board with no screen, and last year's firmware already naming this year's chips — some shipped, some stayed in testing.
- \`/go/ipada4\` — *iPad Air 4 Prototype*: Digging through Apple's internal system — a factory machine with no screen — mirrored, copied out, and found to still carry the model number of an A8X iPad Pro Apple never shipped.
- \`/go/ios19\` — *WWDC2099*: Engineering files never record what is about to ship, only what was once bet on — reading an internal build through the placeholder that admits it.
- \`/go/sd\` — *Studio Display*: Buying peace of mind: why a 60Hz panel still holds the desk, from pixel-exact rendering to system features that live in the display — and the expensive mismatch for PC and HDR buyers.
- \`/go/mkb\` — *Magic Keyboard (USB-C)*: A 1399 membrane keyboard does not sell feel, it sells certainty: Touch ID wired into the system, keys that only the first party can deliver, and a tool that never asks for attention.
- \`/go/mini7\` — *iPad mini (A17 Pro)*: The one that actually leaves the house: the short-edge camera and the slide-over saga say it is built for content, and its value is utilisation, not speed.
- \`/go/mbneo\` — *MacBook Neo*: The first Mac with an iPhone chip is not a cheap Mac but a trade-off table: the price came first, and it decided which lines were cut and which were kept.
- \`/go/m5mba\` — *M5 MacBook Air*: The upgrade is in the drive, not the chip: internal storage wins on speed and on price for the first time, and the line between Air and Pro moves to thermals, screen and ports.
- \`/go/pm11\` — *iPhone 11 Pro Max*: The ugliest iPhone, in my view: a sealed AT&T unit on iOS 13.0, before Deep Fusion and with the out-of-frame capture iOS 14 would remove — and an unlock that made it perfect.

## What is inside

The question sheet, the outline, the section drafts, the manuscript and the review record are all there, so you can walk back up the route. This is not a read-only showcase; your copy is yours to change, and you can export it as a backup at any time.

A disk that arrives as a file from another computer goes in through the Project backup section of the Write to Project Hard Disk window. The address and the file are two doors to the same room.`,
      zh: `# 演示用项目硬盘

这三十五块盘随应用发布，用来看清一篇作品是怎么从问题单走到正文的。它们是启动磁盘上的一个文件夹，就放在作者自己那块项目硬盘旁边；文件菜单打开的是同一个文件夹。每块盘另有一个自己的地址 \`https://system6.aaronlau.me/go/<route>\`，谁都可以把它转给别人。

## 打开之后会发生什么

- 先检查这块盘有没有被改过。校验或版本历史不过关，就直接干净退出，不会留下一个半截的项目。
- 通过之后，它成为这台电脑上的一个普通项目；回到桌面，从「项目硬盘」的列表里就能再打开它，可以照常修改，也能随时导出成备份。
- 再打开同一块盘，用的是你已经有的那一份，不会多出一份副本。

## 现在有哪三十五块

- \`/go/dtk\`《未来通车之后》：一台 2020 年 DTK 的六年，从 GoldenGateSeedSpike 到 macOS 27 Golden Gate：一块救回来的板子，和一台不再承认它的服务器。
- \`/go/ipad1\`《初代 iPad 为什么只有 256MB》：从童年一段模糊视频，追到 2010 年的那张配置表。
- \`/go/m5ipad\`《M5 iPad Pro：是 Mac 的防线，还是 AI 交互的起点？》：两个人、两个尺寸，和一块键盘决定的两种生活。
- \`/go/iphone17e\`《iPhone 17e 浅粉色：其貌不扬，但很有料》：最便宜的一台新 iPhone，从用的时候撞到的那些瞬间写起。
- \`/go/sleeve\`《MagSafe 皮革保护套：苹果是怎么看待手机依赖的？》：一扇提前两年跑过息屏显示逻辑的小窗，它背后 2018 年「数字健康」的信念，以及苹果的息屏显示为什么走了另一条路。
- \`/go/iphone6sp\`《还有人记得 3D Touch 吗 · iPhone 6s Plus》：让「耐用」第一次能用在一台 iPhone 上的那一代。
- \`/go/pocket\`《当 iPhone 穿上三宅一生》：一块布、一个口袋，以及那条把设备变成身体延伸的配件线。
- \`/go/macpro19\`《大学时的白月光 · Mac Pro (2019)》：苹果最后一次把选择权摊在桌面上，也是唯一有 MPX 的机器。
- \`/go/ceramic\`《陶瓷 Apple Watch：我的白月光》：一种苹果几乎没宣传过的工艺，优势被一条条抵消后在 2020 年退场，2026 年又回来了。
- \`/go/sympathy\`《Project Sympathy：iPod 消失了，音乐没有》：把 AirPods Max 接回 iPod，用一根线检验这条线有没有断。
- \`/go/pm17\`《形式追随功能的一代 · iPhone 17 Pro Max》：铝回来是为了散热，三颗融合式是为了让中间那一档画质可用。
- \`/go/airbattery\`《iPhone Air 专用 MagSafe 电池：三代电池，改的是谁给谁充》：苹果外接电池的机制谱系，讲的是关系不是容量。
- \`/go/ipad97\`《iPad Pro 9.7：叛逆的另一种尺寸》：小一号的 Pro 留下了什么、拿走了什么，以及它的继任者为什么叫 Air。
- \`/go/glass\`《玻璃与他们的产地》：Aqua、Aero、iOS 7 到 Liquid Glass，问的不是谁抄谁，是每一代玻璃为什么在那儿。
- \`/go/bongo\`《走向一整块玻璃》：从 Project Bongo 与两台被否掉的原型机，看 iPhone 为什么非得变成一整块玻璃。
- \`/go/pm12\`《iPhone 12 Pro Max：开箱一台未激活的，还有苹果最奇葩的手机壳》：放了五年的全新机，电池只是亏电没坏；从宝石来的蓝；第一代能拍 10-bit，却卡在接口和屏幕；一个假设你有全家桶的皮革保护套。
- \`/go/iphone17\`《iPhone 17 标准版：诚意不是心情，是价格行为》：高刷、256GB 起步与自研无线芯片在同一年下放到标准版；这一代真正被抬高的，是 iPhone 的体验基线。
- \`/go/windowshade\`《收起窗口，留下位置：一个比 Mac 还老的双击》：把 WindowShade 官网整站读成一篇文章——1994 年的一个双击，进了 System 7.5 的控制面板，被 Dock 送走，在便笺里留了一口气，三十年后又回到 Mac 上。
- \`/go/cdma4\`《CDMA iPhone 4》：最早的「国行 eSIM」iPhone：这话只对了一半——写号把号码锁进机器，eSIM 把它解放出来，可国行 eSIM 又走回了营业厅的柜台。
- \`/go/noport\`《无接口 Apple Watch》：先有安全网，才敢拆掉那个口：诊断接口从针脚走到 60.5GHz，真正的推手是「设备必须能自己恢复」——手表又一次替手机先走一步。
- \`/go/touch2\`《touch 2 工程板》：一块不是设备的设备：它的使命是测一颗芯片，而不是当一台播放器——既是 nano 4 也是 touch 2、没有序列号、比同期 iPhone 还快，却活得比发布会更久。
- \`/go/airact\`《iPhone Air》：165 克本该是正常手机的重量：做减法反而少见——它证明轻薄不等于续航差，真正的代价落在接口、扬声器与相机上。
- \`/go/ip4sdemo\`《iPhone 4S Demo》：回到过去的钥匙：展示机的正确归宿是亮起来——它的价值来自被使用，而不是被供奉；这台机器是一次对好体验的校准。
- \`/go/airtrans\`《透明探索版 Air》：透明不是配色，是工作方法：透明外壳是工程师的观察窗，记录的是定稿之前的样子；这份讲究今天变成了界面里的材质与层次。
- \`/go/t2nic\`《T2 网卡》：一块卡上的两台设备：网卡那半是标准件，真正的问题在旁边那个只知道编号的设备——苹果做的是接口，而不是单品。
- \`/go/mgscrap\`《MagSafe 废案》：苹果怎么对待失败的作品：AirPower 取消两个月后，苹果已经换了一条路；这些没卖出去的样品是它努力过的证明，今天缺的不是创新，是执行力。
- \`/go/ip16p\`《iPhone 16 工程机》：竟然有未来产品的细节？一块没有屏幕的主板，去年的固件里已经写着今年的芯片——有的发布了，有的停在了测试里。
- \`/go/ipada4\`《iPad Air 4 工程机》：挖挖苹果内部的工程系统：一台没有屏幕的产线机器，投屏、拷贝系统之后，在一个弃用的测试 App 里翻出了一台苹果从未发布的 A8X iPad Pro。
- \`/go/ios19\`《WWDC2099》：苹果最诚实的标签：工程文件记录的不是「即将发布什么」，而是「曾经被押注过什么」——从 TargetRelease 的占位符读懂一份内部构建。
- \`/go/sd\`《Studio Display》：买断一份安心：一块 60Hz 的屏幕为什么还占着桌面 C 位——点对点渲染、解耦的系统功能，以及对 PC 与 HDR 刚需者的昂贵错配。
- \`/go/mkb\`《Magic Keyboard》：一把 1399 元的薄膜键盘卖的不是手感，是确定性：Touch ID 与系统的深度集成、地球键与菜单键的按键语义，以及永远在那儿不打断创作的状态。
- \`/go/mini7\`《iPad mini (A17 Pro)》：每天跟着你出门的那一台：短边摄像头与 Slide Over 的进出，说明它被定位成消费内容的设备；它的价值在利用率，不在性能。
- \`/go/mbneo\`《MacBook Neo》：苹果把 iPhone 芯片放进 Mac 的第一天：这不是便宜的 Mac，而是一张取舍表——先定价格，再决定砍掉哪几条线、保住哪几条线。
- \`/go/m5mba\`《M5 MacBook Air》：这一次的牙膏挤在硬盘上：内置存储第一次同时赢了速度与价格，而 Air 与 Pro 的分界从 CPU 挪到了散热、屏幕与接口。
- \`/go/pm11\`《iPhone 11 Pro Max》：我觉得最丑的一代 iPhone：一台全新的美版有锁机，停在 iOS 13.0，还没有 Deep Fusion，还留着后来被取消的超取景框取景，最后官方解锁成功。

## 盘里有什么

问题单、大纲、分节草稿、正文、审校记录都在里面，可以沿着路线一层层往回看。这不是只读的展示页；你拿到的是一份可以照常修改的副本。

从另一台电脑拿来的是文件，用「写入项目硬盘」窗口里的「项目备份」导入它。地址和文件，是进同一个房间的两扇门。`,
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
