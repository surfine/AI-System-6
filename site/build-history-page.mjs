#!/usr/bin/env node

// Build the Field Notes essay, one source for two pages.
//
// history/index.html (English) and history/zh-CN.html (Simplified Chinese)
// come from the same chapter list, so a date, a source or a figure can never
// exist in one language and not the other. Every year in the essay points at
// an entry in SOURCES; the machine in chapter 3 is Infinite Mac's, loaded only
// when the reader presses Boot. `--check` fails when either page is stale.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "history");
const ORIGIN = "https://aisystem6.pages.dev";
const LIVE = "https://system6.aaronlau.me";
const VERSION = "20260923a";

const ERAS = [
  ["classic", "1988", "System 6", "svg"],
  ["platinum", "1999", "Platinum", "png"],
  ["aqua", "2002", "Aqua", "png"],
  ["snow-leopard", "2009", "Snow Leopard", "png"],
  ["yosemite", "2014", "Yosemite", "png"],
  ["big-sur", "2020", "Big Sur", "png"],
  ["liquid-glass", "2026", "Liquid Glass", "png"],
];

function page(en) {
  const t = (zh, eng) => (en ? eng : zh);
  const lang = en ? "en" : "zh-CN";
  const self = en ? `${ORIGIN}/history/` : `${ORIGIN}/history/zh-CN`;
  const home = en ? "../" : "../zh-CN";
  const other = en ? "zh-CN" : "./";

  const SOURCES = [
    ["jobs", "The Marginalian · Steve Jobs on why computers are like a bicycle for the mind (1990)", "https://www.themarginalian.org/2011/12/21/steve-jobs-bicycle-for-the-mind-1990/",
      t("乔布斯在 1990 年的影片《Memory & Imagination》里说，电脑相当于我们思想的自行车。题记是 AI System 6 第一版说明对这句话的化用。", "In the 1990 film Memory & Imagination, Jobs calls the computer the equivalent of a bicycle for our minds. The epigraph is how AI System 6's first Read Me put it.")],
    ["desktop98", "AI Desktop 98 · App Store", "https://apps.apple.com/us/app/ai-desktop-98/id6761027867",
      t("把 ChatGPT、Claude、Gemini 等模型装进一张 Windows 98 风格桌面的 iOS 应用，AI System 6 最早的灵感。", "An iOS app that puts ChatGPT, Claude, Gemini and other models on a Windows 98-style desktop; AI System 6's first spark.")],
    ["conan", "Salon · George R.R. Martin tells Conan why he writes on a DOS word processor · 2014-05-14", "https://www.salon.com/2014/05/14/george_r_r_martin_tells_conan_why_he_writes_on_a_dos_word_processor/",
      t("马丁在节目里讲的两台电脑、不联网的 DOS 写作机、WordStar 4.0，以及他对自动大写和拼写检查的看法。", "Martin's two computers, the offline DOS machine he writes on, WordStar 4.0, and what he thinks of automatic capitals and spell check.")],
    ["wordstar", "WordStar · Wikipedia", "https://en.wikipedia.org/wiki/WordStar",
      t("WordStar 1979 年首发；4.0 版 1987 年推出；马丁到 2020 年仍在用 DOS 版 WordStar 4.0。", "WordStar first shipped in 1979; version 4.0 came in 1987; Martin was still using the DOS version of WordStar 4.0 in 2020.")],
    ["system1", "System 1 · Wikipedia", "https://en.wikipedia.org/wiki/System_1",
      t("1984 年 1 月 24 日随第一台 Macintosh 发布；七个桌面附件；整套系统约 216 KB。", "Released with the first Macintosh on January 24, 1984; the seven desk accessories; about 216 KB in all.")],
    ["system6", "System 6 · Wikipedia", "https://en.wikipedia.org/wiki/System_6",
      t("System 6 与 MultiFinder。MultiFinder 最早出现在前一年的 System 5。", "System 6 and MultiFinder, which first appeared a year earlier in System 5.")],
    ["infinite", "Infinite Mac · Mihai Parparita", "https://infinitemac.org/",
      t("把 System 6.0 记为 1988 年 4 月 30 日，把 Mac OS X 10.0 记为建在 NeXTSTEP 之上。第三章的旧 Mac 在这里运行，点了才加载；本站不存放系统镜像。", "Dates System 6.0 to April 30, 1988, and describes Mac OS X 10.0 as built on NeXTSTEP. The Mac in chapter 3 runs here and loads only when you boot it; this site hosts no system images.")],
    ["windowshade", "WindowShade · " + t("窗口往事", "Window stories"), en ? "https://windowshade.aaronlau.me/en/history/" : "https://windowshade.aaronlau.me/history/",
      t("WindowShade 从 1994 年的小工具到 System 7.5 的来龙去脉，每个年份都有出处。这篇长文的写法也照着它来。", "How WindowShade went from a 1994 utility into System 7.5, every year sourced. This essay borrows its form, too.")],
    ["assistant", "Office Assistant · Wikipedia", "https://en.wikipedia.org/wiki/Office_Assistant",
      t("Office 97 引入；打出地址和「Dear」后的写信提示；下一版默认关闭；Office 2007 起整个移除。", "Introduced in Office 97; the letter prompt after an address and “Dear”; off by default in the next version; removed from Office 2007 on.")],
    ["macromaker", "MacroMaker · Wikipedia", "https://en.wikipedia.org/wiki/MacroMaker",
      t("随 1988 年的 System 6 推出，像录音机一样录下鼠标和键盘操作；鼠标点击记的是位置，窗口一动就会点空；System 7 起由 AppleScript 取代。", "Shipped with System 6 in 1988 and recorded mouse and keyboard input like a tape recorder; clicks were stored as positions, so they missed once windows moved; replaced by AppleScript from System 7.")],
    ["osx", "Apple · Mac OS X to Ship on March 24 · 2001", "https://www.apple.com/newsroom/2001/01/09Apples-Mac-OS-X-to-Ship-on-March-24/",
      t("Mac OS X 的上市日期。", "The day Mac OS X went on sale.")],
    ["chatgpt", "OpenAI · Introducing ChatGPT · 2022-11-30", "https://openai.com/index/chatgpt/",
      t("ChatGPT 公开发布的日期。", "The day ChatGPT was released to the public.")],
    ["frame", "Frame of preference · Marcin Wichary", "https://aresluna.org/frame-of-preference/",
      t("互动长文这种写法的另一个榜样。", "Another model for what an interactive essay can be.")],
  ];
  const cite = (id) => {
    const i = SOURCES.findIndex((s) => s[0] === id);
    return `<a class="fn-cite" href="#src-${id}" aria-label="${t("出处", "Source")} ${i + 1}">${i + 1}</a>`;
  };

  const CHAPTERS = [
    {
      id: "prologue", toc: t("序", "Intro"), date: t("序 · 2026 年 5 月 17 日", "Prologue · May 17, 2026"), title: t("那天凌晨", "The night it started"),
      body: [
        t("2026 年 5 月 16 日深夜，某位重要的人在赶一期笔记本评测，需要在片子里演示一下本机跑的 AI。能想到的演示，只有翻译。凌晨两点多，AI System 6 的作者发过去一句：要不来个有意思的用法吧。",
          "Late on May 16, 2026, someone important to the author was racing to finish a laptop review that needed a demo of AI running on the machine itself. The only demo anyone could think of was translation. A little after two in the morning, the person who would build AI System 6 sent a message: how about something more interesting?"),
        t("四点，浏览器里多了一个 System 6 的界面。它通过 LM Studio 和本机的模型说话，聊过的内容可以存成文件，文件可以收进文件夹，用的是桌面的隐喻。六点多，桌上有了记事本，能存下对话片段，还能上网找灵感。那天下午，作者把它打包发过去试用，名字叫 AI System 6。",
          "By four, there was a System 6 interface in the browser. It talked to a model on the same computer through LM Studio; a conversation could be saved as a file, and files could go into folders, the way a desktop works. By half past six there was a note pad, a way to keep pieces of a conversation, and a way to search the web for ideas. That afternoon it was sent over to try, under the name AI System 6."),
        t(`灵感来自一个叫 AI Desktop 98 的应用${cite("desktop98")}，它把聊天机器人装进了一张 Windows 98 的桌面。换成 90 年代的 Mac 会怎样？顺便，还能当一个写作系统。`,
          `The spark was an app called AI Desktop 98${cite("desktop98")}, which puts chatbots on a Windows 98 desktop. What would a 90s Mac look like instead? And it could double as a place to write.`),
        t("第二天，作者把真正想说的话说清楚了：它不是给 AI 套一层怀旧的壳。《冰与火之歌》是在 DOS 下写出来的；借 System 6 的桌面，是为了把 AI 看不见的上下文和记忆，变成桌上看得见的东西。",
          "The next day the real idea was put into words: this is not a nostalgic shell around an AI. A Song of Ice and Fire was written under DOS. The System 6 desktop is there to turn what AI keeps out of sight, its context and its memory, into things you can see on a desk."),
        t("那天深夜，作者还说过一句：这套东西太复杂，不可能给普通人用。之后的四个月，很多功夫都花在推翻这句话上。这篇往事，就从那位小说家的 DOS 电脑讲起。",
          "Late that same night came one more sentence: this is far too complicated for ordinary people. A good part of the four months since went into proving it wrong. The story starts with that novelist's DOS machine."),
      ],
    },
    {
      id: "2014", toc: "2014", date: "01 · 2014", title: t("「我不要任何帮助」", "“I don't want any help”"),
      body: [
        t(`2014 年 5 月，乔治·R·R·马丁上康纳·奥布莱恩的节目，说起自己的秘密武器：他有两台电脑${cite("conan")}。一台用来上网、收邮件、报税；另一台专门写作，是一台不联网的 DOS 电脑，跑的是 1987 年的 WordStar 4.0${cite("wordstar")}。《冰与火之歌》就在那台电脑上写。`,
          `In May 2014, George R.R. Martin went on Conan O'Brien's show and told him about his secret weapon: two computers${cite("conan")}. One is for the internet, his email, and his taxes. The other is for writing: a DOS machine that isn't connected to the internet, running WordStar 4.0, from 1987${cite("wordstar")}. A Song of Ice and Fire is written on that one.`),
        t("他说他喜欢 WordStar，因为它做完一个写作程序该做的事，别的一概不做。他讨厌拼写检查，也讨厌那些自作主张把小写改成大写的新软件：「如果我想要大写，我自己会打大写。」",
          "He likes WordStar, he said, because it does everything he wants a writing program to do, and nothing else. He hates spell check, and the new programs that decide your lowercase letter should have been a capital: “If I wanted a capital, I would have typed a capital.”"),
        t("2026 年 5 月 18 日，AI System 6 写下第一份设计文档，第一行抄的就是马丁这段话。它敬佩的不是旧软件本身，而是那份规矩：稳定，可预料，不挡路；不自动纠错，不自动插入，不在背后改写。想要帮忙，你自己开口。",
          "On May 18, 2026, AI System 6 got its first design document, and its first lines are Martin's. What it admired was not old software for its own sake but the manners: stable, predictable, out of the way. No autocorrect, no automatic insertion, no rewriting behind your back. If you want help, you ask."),
        t("它的第一版说明也是同一天写的，开头就把话挑明：这不是一个套了复古皮肤的聊天机器人，而是一张写作的桌子；像 DOS 上的 WordStar，或者一台调校过的 System 6 写作机器，它看重速度、限制、稳定的肌肉记忆，以及你对每一个保存下来的念头的控制权。",
          "Its first Read Me was written the same day, and says it plainly: this is not a chatbot with a retro skin but a writing desk. Like WordStar on DOS, or a System 6 machine tuned for writing, it values speed, limits, steady muscle memory, and your control over every thought you choose to keep."),
        t("只是今天，大多数人和马丁不一样，是想要一点帮助的。于是问题变成：怎么让帮忙进门，又不让它接过笔？",
          "Most of us, unlike Martin, do want a little help now. So the question became: how do you let help in without letting it take the pen?"),
        t("WordStar 给了这张桌子脾气，1988 年的 Mac 给了它样子。DOS 的一屏字，装不下 AI 带来的那些看不见的东西：哪段对话只是临时的，哪条摘录被留了下来，模型这会儿能看到哪些资料。Mac 的桌面能把它们变成指得着的东西：磁盘、软盘、Scrapbook、废纸篓。下面每一章，讲的都是其中一样东西的来历。",
          "WordStar gave this desk its manners; a 1988 Mac gave it its shape. A screen of DOS text has nowhere to put the invisible things AI brings with it: which conversation is only temporary, which clip was kept, what the model can see right now. A Mac desktop turns them into things you can point at: disks, floppies, Scrapbook, the Trash. Each chapter below is the story of one of them."),
      ],
      quote: t("「我不要任何帮助。」<cite>乔治·R·R·马丁，2014</cite>", "“I don't want any help.”<cite>George R.R. Martin, 2014</cite>"),
      quoteAfter: 1,
    },
    {
      id: "1984", toc: "1984", date: "02 · 1984", title: t("Scrapbook：只收你挑的", "Scrapbook: only what you chose"),
      body: [
        t(`1984 年 1 月 24 日，第一台 Macintosh 上市${cite("system1")}。它带的系统软件，后来被叫作 System 1，把电脑做成了一张桌子：文件是一个能指着的图标，文件夹要打开来看，不要的东西拖进废纸篓。桌角还摆着七样小东西，叫作「桌面附件」：闹钟、计算器、控制面板、按键图、便签本、拼图，还有 Scrapbook。整套系统大约 216 KB，比今天手机里随便一张照片还小。`,
          `On January 24, 1984, the first Macintosh went on sale${cite("system1")}. The software that came with it, later called System 1, turned the computer into a desk: a document was an icon you could point at, a folder was something you opened, and what you no longer wanted went in the Trash. In the corner sat seven small things called desk accessories: Alarm Clock, Calculator, Control Panel, Key Caps, Note Pad, Puzzle, and Scrapbook. The whole system took about 216 KB, less than any photo on your phone today.`),
        t("Scrapbook 是其中最安静的一样。剪下、拷贝的东西，想留着，就贴进去。它只收你放进去的，从不自己判断什么值得留。",
          "Scrapbook was the quietest of the seven. Whatever you cut or copied and wanted to keep, you pasted in. It kept what you put there, and made no decisions of its own about what deserved keeping."),
        t("这七样里，有六样今天还在 AI System 6 的桌上：闹钟、计算器、控制面板、便签本、拼图和 Scrapbook。Scrapbook 的规矩没变，只多了一条：每一条摘录，都记得回到出处的路。它旁边还多了一个「阅读器」。阅读器不是浏览器，它只把一个网页洗成干净的正文，让你读、让你剪；整页读完，不会自己变成记忆，被你剪下的那几句才会。",
          "Six of the seven are on the AI System 6 desk today: Alarm Clock, Calculator, Control Panel, Note Pad, Puzzle, and Scrapbook. Scrapbook kept its manners, with one addition: every clip remembers the way back to where it came from. Next to it sits Reader. Reader is not a browser; it washes a web page down to clean text for you to read and clip. Reading a whole page does not make it memory. The sentences you clip do."),
      ],
      figure: `<figure class="fn-figure fn-das">
          <img src="../img/proofs/calculator.webp?v=20260817a" alt="${t("今天桌面上的计算器，拍摄自运行中的应用。", "Today's Calculator, photographed in the running app.")}" loading="lazy" decoding="async">
          <img src="../img/proofs/puzzle.webp?v=20260817a" alt="${t("今天桌面上的拼图，拍摄自运行中的应用。", "Today's Puzzle, photographed in the running app.")}" loading="lazy" decoding="async">
          <img src="../img/proofs/alarm-clock.webp?v=20260817a" alt="${t("今天桌面上的闹钟，拍摄自运行中的应用。", "Today's Alarm Clock, photographed in the running app.")}" loading="lazy" decoding="async">
          <figcaption>${t("今天这张桌面上的计算器、拼图和闹钟，拍摄自运行中的 AI System 6。", "Calculator, Puzzle, and Alarm Clock on today's desk, photographed in the running AI System 6.")}</figcaption>
        </figure>`,
    },
    {
      id: "1988", toc: "1988", date: "03 · 1988", title: t("「存储」是你亲手按下的", "Save was something you did"),
      body: [
        t(`1988 年，System 6 来了${cite("infinite")}。它带着前一年才出现的 MultiFinder${cite("system6")}：几个程序可以同时开着，你在它们之间来回切换，每扇窗口还是只管自己那一件事。`,
          `In 1988 came System 6${cite("infinite")}, and with it MultiFinder, which had first appeared a year earlier${cite("system6")}: several programs could stay open at once, you moved between them, and each window kept to its own job.`),
        t("它很慢，也很老实。没按「存储」的改动，就留不下来；没有哪个程序会在你背后替你写一个字。作品放在叫得出名字的磁盘上，软盘负责把东西带进、带出。任何时候，你都知道哪些是你的，它们在哪。",
          "It was slow, and it was honest. A change you hadn't saved was a change that didn't last, and no program wrote a word behind your back. Your work sat on a disk you could name, and floppies carried things in and out. At any moment you knew which things were yours, and where they were."),
        t("AI System 6 把这两样东西原样搬了回来。要长久留下的作品，放在「项目硬盘」上；这一次带进来的 PDF、网页、录音，放在「文件软盘」上，只做参考，不会悄悄变成项目的一部分。它还给自己立了一条同样老派的规矩：开机要用的全部东西，必须装得进两张 1.44 MB 软盘，超了，构建就失败；重的工具放在「第三张盘」上，用到才加载。",
          "AI System 6 brought both back as they were. Work that lasts lives on the Project Hard Disk; the PDFs, pages, and recordings you bring in for this piece ride on the File Floppy, as reference that never quietly joins the project. It also set itself a rule just as old-fashioned: everything needed to boot must fit on two 1.44 MB floppies, or the build fails. The heavy tools live on a “third disk” and load only when used."),
      ],
      figure: `<figure class="fn-figure fn-objects">
          <div><img data-icon="hardDisk" src="../img/themes/liquid-glass/hardDisk.png" width="64" height="64" alt=""><b>${t("项目硬盘", "Project Hard Disk")}</b><span>${t("要长久留下的", "What lasts")}</span></div>
          <div><img data-icon="fileFloppy" src="../img/themes/liquid-glass/fileFloppy.png" width="64" height="64" alt=""><b>${t("文件软盘", "File Floppy")}</b><span>${t("这一次带进来的", "What you brought in this time")}</span></div>
          <figcaption>${t("今天桌面上的两个图标，取自 AI System 6 的 Liquid Glass 外观。", "The two icons as they sit on today's desk, in AI System 6's Liquid Glass appearance.")}</figcaption>
        </figure>`,
      lab: true,
    },
    {
      id: "1994", toc: "1994", date: "04 · 1994", title: t("先让窗口让开", "Let the window step aside"),
      body: [
        t(`1994 年，一个叫 WindowShade 的小工具被收进了 System 7.5${cite("windowshade")}：双击标题栏，窗口就卷成一条，停在原处；再双击，它原样回来。`,
          `In 1994, a small utility called WindowShade was taken into System 7.5${cite("windowshade")}: double-click a title bar and the window rolls up into a strip, right where it was; double-click again and it comes back as it was.`),
        t("写东西的时候，参考资料总会挡住草稿。关掉，回头又得找；拖到一边，桌面又挤。AI System 6 的每一扇窗口都能这样收起来。它和「缩放」是两回事，各管各的。",
          "When you write, the reference always ends up covering the draft. Close it and you have to find it again; drag it aside and the desk gets crowded. Every window on AI System 6 can roll up like this. It is not the same as zoom; each does its own job."),
        t("这个动作后来还有了一个独立的 Mac 应用，也叫 WindowShade，出自同一位作者，把 1994 年的那一下双击带回了今天的 macOS。",
          "The gesture later got a Mac app of its own, also called WindowShade, by the same author, bringing that 1994 double-click back to today's macOS."),
      ],
    },
    {
      id: "1997", toc: "1997", date: "05 · 1997", title: t("帮忙，别站在稿子上", "Help, but not on the page"),
      body: [
        t(`1997 年，Office 97 带来了一个会动的助手${cite("assistant")}。你打好地址，再打一个「Dear」，它就跳出来：「看起来你在写信，需要帮忙吗？」`,
          `In 1997, Office 97 arrived with an animated assistant${cite("assistant")}. Type an address, then “Dear”, and up it popped: “It looks like you're writing a letter. Would you like help?”`),
        t("用意是好的，毛病在它站的位置：就在你的稿子上面，就在你还没想清楚要说什么的时候。很多人觉得它烦。下一版 Office 把它默认关了；到 2007 年，它被整个拿掉。",
          "The intention was kind. The trouble was where it stood: right on top of the page, at the very moment you were still working out what to say. Many people found it maddening. The next version of Office turned it off by default, and by 2007 it was gone altogether."),
        t("所以 AI System 6 的模型住在自己的窗口里，叫 ClioTalk，它写的字先待在那里。「听写板」也守同一条规矩：你说完，它先把听到的字摆给你看，再问你要放到哪里，不会自己钻进正文。",
          "So the model on AI System 6 lives in a window of its own, ClioTalk, and what it writes stays there first. Dictation Pad keeps the same rule: when you finish speaking, it shows you what it heard and asks where the words should go. They never slip into the manuscript on their own."),
      ],
      quote: t("「看起来你在写信。」", "“It looks like you're writing a letter.”"),
    },
    {
      id: "2001", toc: "2001", date: "06 · 2001 → 2026", title: t("材质一变再变", "The material kept changing"),
      body: [
        t(`2001 年 3 月 24 日，Mac OS X 上市${cite("osx")}。它建在 NeXTSTEP 之上${cite("infinite")}，带来了 Aqua 的光泽和 Dock。后来，窗口先是变平，再变圆，今天成了玻璃。`,
          `On March 24, 2001, Mac OS X went on sale${cite("osx")}. It was built on NeXTSTEP${cite("infinite")}, and brought Aqua's gloss and the Dock. After that the windows went flat, then round, and today they are glass.`),
        t("变的是材质。文件还是文件，废纸篓还是废纸篓，「存储」也还是那个意思。AI System 6 把 1988 到 2026 年的七个年代都穿了一遍，只为检验一件事：这些规矩，经不经得起换一身衣服。",
          "What changed was the material. A file stayed a file, the Trash stayed the Trash, and Save kept its meaning. AI System 6 wears seven of those eras, from 1988 to 2026, to test one thing: whether those rules survive a change of clothes."),
      ],
      figure: `<figure class="fn-figure fn-eras">
          <ol>${ERAS.map(([id, year, label, ext]) => `<li><img src="../img/themes/${id}/teachText.${ext}" width="48" height="48" alt=""${id === "classic" || id === "platinum" ? ' class="is-pixel"' : ""} loading="lazy" decoding="async"><b>${year}</b><span>${label}</span></li>`).join("")}</ol>
          <figcaption>${t("同一个正文图标，在 AI System 6 七个年代里各自的样子。", "The same manuscript icon, as each of AI System 6's seven eras draws it.")} <a href="${home}#argument">${t("去首页换一换", "Try them on the home page")} &rarr;</a></figcaption>
        </figure>`,
    },
    {
      id: "2022", toc: "2022", date: "07 · 2022 → 2026", title: t("电脑开始写字", "The computer started writing"),
      body: [
        t(`2022 年 11 月 30 日，ChatGPT 上线${cite("chatgpt")}。没过多久，「帮我改一下」就从一句客气话，变成了很多人每天都在做的一件事。`,
          `On November 30, 2022, ChatGPT was released${cite("chatgpt")}. Before long, “could you fix this for me” stopped being a polite request and became something many people do every day.`),
        t("这一回，助手不站在稿子上了。它有自己的对话框，客客气气地把一段字递给你。可递过来的字，和你的字长得一模一样，复制一次，就再也分不开；对话框也慢慢成了放东西的地方：资料在里面，草稿在里面，决定也在里面。于是那个老问题又回来了，而且更难答：这些字里，哪些是我的？",
          "This time the helper doesn't stand on the page. It has a conversation of its own, and politely hands you a paragraph. But the paragraph looks exactly like yours, and after one copy the two can no longer be told apart. The conversation slowly becomes where things live, too: the sources, the drafts, the decisions. So the old question comes back, harder than before: which of these words are mine?"),
        t("AI System 6 在一头一尾各放了一样东西。开头是「问题单」：动笔之前，先把你自己的问题、亲眼看到的细节、预料中的反对意见写下来。人的材料越具体，模型越没有地方用通用的腔调补空。结尾是「审校台」：交出去之前，它把稿子读回给你，指出哪里事实站不住，也指出哪些句子开始像模型。",
          "AI System 6 put one thing at each end. At the start there is the Question Sheet: before any prose, you write down your own questions, the details you saw yourself, the objection you expect. The more specific the human material, the less room the model has to fill with a generic voice. At the end there is Review Desk: before the work leaves, it reads it back to you, and points out the shaky facts and the sentences that have started to sound like a model."),
        t("到了 6 月，它已经是一件为那个人量身定做的写稿工具：一个做创作的判断，一个负责资料和考据，两个人的笔迹都不该被一段通用的文字磨平。「审校台」检查哪些句子开始像模型，守的也是这件事。",
          "By June it had become a writing tool made to measure for that same person: one makes the creative calls, the other brings the research, and neither hand should be sanded down into generic prose. When Review Desk looks for sentences that have started to sound like a model, that is what it is guarding."),
        t("中间，就是马丁那台电脑的规矩，再加上一扇给模型的窗口：",
          "In between are the manners of Martin's computer, plus one window for the model:"),
      ],
      list: [
        t("要长久留下的，放在「项目硬盘」上。", "Work that lasts lives on the Project Hard Disk."),
        t("这一次带进来的材料，放在「文件软盘」上。", "What you bring in for this piece rides on the File Floppy."),
        t("存储、摘录、插入、导出，每一步都得你亲手按。", "Save, clip, insert, export: each one is a key you press."),
        t("模型住在 ClioTalk 里，它写的字待在那扇窗口里，直到你亲手把它搬出来。", "The model lives in ClioTalk, and what it writes stays in that window until you carry it out."),
        t("不自动纠错，不自动插入，不在背后改写。想要帮忙，你自己开口。", "No autocorrect, no automatic insertion, no rewriting behind your back. If you want help, you ask."),
      ],
      figure: `<figure class="fn-figure fn-desk">
          <img src="../img/frames/liquid-glass.webp" width="2880" height="1800" alt="${t("今天的 AI System 6 桌面：Searcher、Scrapbook、ClioTalk、TeachText 与审校台，拍摄自运行中的应用。", "Today's AI System 6 desk: Searcher, Scrapbook, ClioTalk, TeachText, and Review Desk, photographed in the running app.")}" loading="lazy" decoding="async">
          <figcaption>${t("今天的这张桌子，拍摄自运行中的应用，没有连接模型。", "Today's desk, photographed in the running app, with no model connected.")}</figcaption>
        </figure>`,
    },
    {
      id: "coda", toc: t("尾声", "Coda"), date: t("尾声", "Coda"), title: t("还没做完的一件事", "One thing left undone"),
      body: [
        t(`System 6 里有一个小工具，叫 MacroMaker${cite("macromaker")}。它长得像一台录音机：按下录音，把一串操作做一遍，它记下来；下次按一个键，它照着再做一遍。它的毛病也出在这里：它记的是鼠标点在哪儿，窗口一挪，就点空了。到了 System 7，它被 AppleScript 取代。`,
          `System 6 came with a small tool called MacroMaker${cite("macromaker")}. It looked like a tape recorder: press record, go through a few steps, and it remembered them; press a key next time, and it did them again. That was also its weakness. It remembered where the mouse had clicked, so once a window moved, the click landed on nothing. From System 7 on, AppleScript took its place.`),
        t("AI System 6 最早的路线图上，最后一项就是它的后代：把你亲手做过的几步，比如搜索、摘录、插入，存成一个小小的「仪式」，下次一键重来。照路线图上的写法，它要记的是对哪样东西做了什么，而不是鼠标点在哪儿；每跑一次，都留下一行白话记录，写明它做了什么，能撤回的地方都能撤回；它也不会在背后定时、反复地替你做事。",
          "The last line of AI System 6's first roadmap is its descendant: take a few steps you did yourself, such as search, clip, and insert, and keep them as a small ritual you can run again with one key. As the roadmap puts it, it would remember what was done to which object, not where the mouse was; every run would leave a plain-language note of what it did, with an undo wherever one is possible; and it would never repeat itself on a schedule behind your back."),
        t("这一项到今天还没做。四个月里，桌上多了许多东西，它一直排在最后。现在到处都是会自己动手的 AI，这张桌子想先守住一件事：每一个替你做的动作，你都看得见，也都能叫停。",
          "It is still not built. In four months a great deal has arrived on the desk, and this has stayed at the end of the list. Now that AI that acts on its own is everywhere, the desk wants to hold on to one thing first: every action taken for you is one you can see, and one you can stop."),
      ],
      closing: t("当年让慢电脑一目了然的规矩，<br>正是今天让快电脑保持诚实的规矩。", "The rules that made a slow computer clear<br>are the ones that keep a fast one honest."),
    },
  ];

  const toc = CHAPTERS.map((c) => `<li><a href="#ch-${c.id}"><b>${c.toc}</b><span>${c.title}</span></a></li>`).join("\n          ");

  const lab = `<aside class="fn-lab" id="lab" aria-labelledby="lab-title">
          <div class="fn-lab-copy">
            <p class="fn-dateline">${t("动手试试", "Try it")}</p>
            <h3 id="lab-title">${t("开一台真正的 1988 年 Mac", "Boot a real Mac from 1988")}</h3>
            <p>${t("这台不是图片，是在你浏览器里运行的 System 6.0，由 Infinite Mac 提供。按下「开机」之前，什么都不会加载。", "This one isn't a picture. It is System 6.0, running in your browser, provided by Infinite Mac. Nothing loads until you press Boot.")}</p>
            <ol class="fn-tasks">
              <li>${t("桌面出来后，按住左上角的 Apple 菜单，桌面附件都在里面。", "Once the desktop appears, hold down the Apple menu in the top-left corner. The desk accessories live there.")}</li>
              <li>${t("找找今天的桌面上也有的：闹钟、计算器、控制面板、Scrapbook。", "Find the ones today's desk still has: Alarm Clock, Calculator, Control Panel, Scrapbook.")}</li>
              <li>${t("打开 Scrapbook，翻一翻 1988 年的人往里面存了什么。", "Open Scrapbook and leaf through what 1988 kept in it.")}</li>
            </ol>
            <p class="fn-lab-note">${t("开机大约二十秒。最好用电脑和鼠标。", "It takes about twenty seconds to boot. A computer and a mouse work best.")} <a id="lab-external" href="https://infinitemac.org/1988/System%206.0" target="_blank" rel="noopener">${t("在独立页面打开", "Open on its own page")} &#8599;</a></p>
          </div>
          <div class="fn-machine">
            <div class="fn-screen" id="lab-screen">
              <div class="fn-screen-idle" id="lab-idle">
                <div class="happy-mac" aria-hidden="true"><span class="happy-mac-face"></span></div>
                <button type="button" class="fn-button" id="lab-boot">${t("开机", "Boot")}</button>
              </div>
            </div>
            <div class="fn-chin"><span><i id="lab-light"></i> System 6.0 &middot; Infinite Mac</span><button type="button" class="fn-quiet" id="lab-stop" hidden>${t("关机", "Shut down")}</button></div>
            <p class="fn-lab-status" id="lab-status" aria-live="polite">${t("还没开机。", "Not running yet.")}</p>
          </div>
        </aside>`;

  const chapters = CHAPTERS.map((c) => `
      <section class="fn-chapter" id="ch-${c.id}" aria-labelledby="h-${c.id}">
        <p class="fn-dateline">${c.date}</p>
        <h2 id="h-${c.id}">${c.title}</h2>
        ${c.body.map((p, i) => `<p>${p}</p>${c.quote && c.quoteAfter === i ? `\n        <p class="fn-pull">${c.quote}</p>` : ""}`).join("\n        ")}${c.quote && c.quoteAfter === undefined ? `\n        <p class="fn-pull">${c.quote}</p>` : ""}${c.list ? `\n        <ul class="fn-rules">\n          ${c.list.map((li) => `<li>${li}</li>`).join("\n          ")}\n        </ul>` : ""}${c.figure ? `\n        ${c.figure}` : ""}${c.lab ? `\n        ${lab}` : ""}${c.closing ? `\n        <p class="fn-closing">${c.closing}</p>\n        <p class="fn-actions"><a class="fn-button" href="${LIVE}">${t("启动这张桌子", "Boot the desk")}</a><a class="fn-quiet" href="${home}">${t("回到首页", "Back to the home page")}</a></p>` : ""}
      </section>`).join("\n");

  const sources = SOURCES.map(([id, title, url, note], i) => `<li id="src-${id}"><span class="fn-src-n">${i + 1}</span><div><a href="${url}" target="_blank" rel="noopener">${title} &#8599;</a><p>${note}</p></div></li>`).join("\n          ");

  const title = t("电脑，曾经是会等你的 · AI System 6 往事", "The computer used to wait for you · AI System 6 Field Notes");
  const desc = t("AI System 6 诞生在 2026 年 5 月 17 日凌晨，它的规矩来自《冰与火之歌》作者的那台 DOS 电脑。每一个功能，都有一段来历：七个短章，读到第三章可以开一台真正的 1988 年 Mac，每个年份都有出处。",
    "AI System 6 was born in the small hours of May 17, 2026, and its rules come from the DOS machine A Song of Ice and Fire is written on. Every feature has a story behind it: seven short chapters, a real 1988 Mac you can boot in chapter three, and a source for every date.");

  return `<!doctype html>
<html lang="${lang}" data-theme="liquid-glass" class="field-notes">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${self}">
<link rel="alternate" hreflang="en" href="${ORIGIN}/history/">
<link rel="alternate" hreflang="zh-CN" href="${ORIGIN}/history/zh-CN">
<link rel="alternate" hreflang="x-default" href="${ORIGIN}/history/">
<link rel="icon" href="../img/app-icon-192.png">
<link rel="apple-touch-icon" href="../img/app-icon-180.png">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${ORIGIN}/img/${en ? "og-history.png" : "og-history-zh.png"}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t("AI System 6 往事：电脑，曾经是会等你的。下方是同一个正文图标在 1988 到 2026 年七个年代里的样子。", "AI System 6 Field Notes: The computer used to wait for you. Below it, the same manuscript icon as seven eras from 1988 to 2026 drew it.")}">
<meta property="og:url" content="${self}">
<meta property="og:site_name" content="AI System 6">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${ORIGIN}/img/${en ? "og-history.png" : "og-history-zh.png"}">
<link rel="stylesheet" href="../site.css?v=${VERSION}">
<link rel="stylesheet" href="../history.css?v=${VERSION}">
</head>
<body>
<div class="fn-progress" aria-hidden="true"><span id="fn-progress"></span></div>

<nav class="menu-bar" aria-label="${t("网站", "Site")}">
  <a class="menu-home" href="${home}"><span class="menu-apple s6-mark" aria-hidden="true"></span><span class="menu-title">AI System 6</span></a>
  <span class="menu-here">${t("往事", "Field Notes")}</span>
  <span class="menu-spacer"></span>
  <a class="menu-link" href="${other}" lang="${en ? "zh-CN" : "en"}">${en ? "简体中文" : "English"}</a>
  <a class="menu-link menu-link-live" href="${LIVE}">${t("运行中系统", "Live&nbsp;System")}</a>
</nav>

<main class="fn" id="top">
  <header class="fn-hero">
    <p class="fn-label">${t("AI System 6 往事 · 第 001 篇", "AI System 6 Field Notes · No. 001")}</p>
    <h1>${t("电脑，<br>曾经是会等你的。", "The computer used to<br>wait for you.")}</h1>
    <blockquote class="fn-epigraph">
      <p>${t("电脑是思想的自行车。", "A computer is a bicycle for the mind.")}</p>
      <cite>${t("AI System 6 第一版说明的题记，化用史蒂夫·乔布斯 1990 年的话", "The epigraph of AI System 6's first Read Me, after Steve Jobs, 1990")}${cite("jobs")}</cite>
    </blockquote>
    <p class="fn-dek">${desc}</p>
    <nav class="fn-toc" aria-label="${t("目录", "Contents")}">
      <ol>
          ${toc}
      </ol>
    </nav>
  </header>

  <article class="fn-article">${chapters}
  </article>

  <section class="fn-sources" id="sources" aria-labelledby="sources-title">
    <h2 id="sources-title">${t("出处与致谢", "Sources and thanks")}</h2>
    <p>${t("马丁的话引自 2014 年的访谈报道，中文为本文翻译。AI System 6 诞生那几天的对话和第一份设计文档（2026 年 5 月 18 日）没有公开发布，序章与第一章据此写成。文中今天的界面，都拍摄自运行中的 AI System 6；旧系统由 Infinite Mac 运行。两处出处对某一天说法不同时，正文只写年份。查阅于 2026 年 9 月 23 日。", "Martin's words are quoted from the 2014 interview coverage. The conversations from the days AI System 6 was born, and its first design document (May 18, 2026), are unpublished; the prologue and chapter 1 draw on them. Every interface from today on this page is photographed in the running AI System 6; the old system runs on Infinite Mac. Where two sources disagree about a day, the essay gives only the year. Checked on September 23, 2026.")}</p>
    <ol>
          ${sources}
    </ol>
  </section>

  <footer class="site-footer fn-footer">
    <p><a href="${home}">${t("AI System 6 首页", "AI System 6 home")}</a> / <a href="${LIVE}">${t("运行中系统", "Live system")}</a> / <a href="https://github.com/surfine/AI-System-6">GitHub</a></p>
    <p>${t("采用 MIT 许可。AI System 6 是独立项目，与 Apple&nbsp;Inc. 没有关联，也未获其背书。", "MIT licensed. AI System 6 is an independent project and is not affiliated with or endorsed by Apple&nbsp;Inc.")}</p>
  </footer>
</main>
<script type="module" src="../js/history.js?v=${VERSION}"></script>
</body>
</html>
`;
}

const outputs = [["index.html", page(true)], ["zh-CN.html", page(false)]];
if (process.argv.includes("--check")) {
  const stale = outputs.filter(([name, html]) => {
    try { return readFileSync(join(outDir, name), "utf8") !== html; } catch { return true; }
  });
  if (stale.length) {
    console.error(`site/history/${stale.map(([n]) => n).join(", ")} stale; run node site/build-history-page.mjs`);
    process.exit(1);
  }
  console.log("site/history pages match the Field Notes source");
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [name, html] of outputs) writeFileSync(join(outDir, name), html);
  console.log("built site/history/index.html and site/history/zh-CN.html");
}
