#!/usr/bin/env node

// Build the crawlable Simplified Chinese page from the English page without
// duplicating its structure by hand. Interactive copy is localized separately
// by site/js/copy.js; this file owns HTML, metadata, labels, and no-script text.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(root, "index.html");
const outputPath = join(root, "zh-CN.html");

const replacements = [
  ['<html lang="en">', '<html lang="zh-CN">'],
  ['<title>AI System 6 - A writing desk that keeps your voice yours</title>', '<title>AI System 6 - 让作品仍然像你写的</title>'],
  ['content="A local-first writing desk where sources, questions, drafts, review, and handoff stay visible, and AI output never becomes your work until you choose to keep it."', 'content="一张本地优先的写作桌，让来源、问题、草稿、审校与交付始终可见；AI 输出只有在你明确留下以后，才会成为作品的一部分。"'],
  ['<link rel="canonical" href="https://aisystem6.pages.dev/">', '<link rel="canonical" href="https://aisystem6.pages.dev/zh-CN.html">'],
  ['content="AI System 6 - Keep your voice, sources, and judgment visible"', 'content="AI System 6 - 把你的语言、来源与判断留在明处"'],
  ['content="A local-first writing desk where AI helps without quietly becoming the writer."', 'content="一张本地优先的写作桌，让 AI 帮忙，却不让它悄悄变成写作者。"'],
  ['content="AI System 6. Six Macintosh-era icons on a timeline from 1988 to 2026."', 'content="AI System 6：六个 Macintosh 时代的图标排列在 1988 至 2026 年的时间线上。"'],
  ['<meta property="og:url" content="https://aisystem6.pages.dev/">', '<meta property="og:url" content="https://aisystem6.pages.dev/zh-CN.html">'],

  ['Starting AI System 6&hellip;', '正在启动 AI System 6&hellip;'],
  ['Startup Disk</span>', '启动磁盘</span>'],
  ['Six Appearances</span>', '六套外观</span>'],
  ['It is now safe to shut down AI&nbsp;System&nbsp;6.', '现在可以安全地关闭 AI&nbsp;System&nbsp;6。'],
  ['>Restart</button>', '>重新启动</button>'],
  ['aria-label="Site"', 'aria-label="网站"'],
  ['System menu', '系统菜单'],
  ['About AI System 6&hellip;', '关于 AI System 6&hellip;'],
  ['Open the Live System', '打开运行中的系统'],
  ['<summary>File</summary>', '<summary>文件</summary>'],
  ['New Project&hellip;', '新建项目&hellip;'],
  ['Download for Mac&hellip;', '下载 Mac 版&hellip;'],
  ['View Source&hellip;', '查看源代码&hellip;'],
  ['<summary>View</summary>', '<summary>显示</summary>'],
  ['The Writing Route', '写作路线'],
  ['Nothing Saves Itself', '任何东西都不会自动保存'],
  ['Chat Is an App', '聊天只是一款应用'],
  ['Six Appearances, One Desk', '六套外观，同一张桌面'],
  ['It Also Runs DOOM', '它也能运行 DOOM'],
  ['The Little Things', '留下来的小工具'],
  ['Inside the Constraint', '约束之内'],
  ['Two Floppies', '两张软盘'],
  ['Choose a Model', '选择模型'],
  ['50s Demo', '50 秒演示'],
  ['Read Me', '说明文件'],
  ['<summary>Special</summary>', '<summary>特别</summary>'],
  ['Cycle Appearances', '循环切换外观'],
  ['Shut Down&hellip;', '关机&hellip;'],
  ['<summary>Help</summary>', '<summary>帮助</summary>'],
  ['Show Balloons', '显示气球帮助'],
  ['Read Me&hellip;', '说明文件&hellip;'],
  ['Live&nbsp;System', '运行中系统'],
  ['<a class="menu-link" href="zh-CN.html" lang="zh-CN">简体中文</a>', '<a class="menu-link" href="index.html" lang="en">English</a>'],

  ['YOUR WORDS SHOULD<br>STILL SOUND LIKE YOU.', '写到最后，<br>仍然应该像你。'],
  ['AI System 6 keeps sources, questions, drafts, review, and handoff in visible places. The model may help, but it never quietly takes the pen.', 'AI System 6 把来源、问题、草稿、审校与交付分别放在看得见的位置。模型可以帮忙，却不能悄悄接过笔。'],
  ['Boot the Live System', '启动运行中的系统'],
  ['See the Writing Route', '查看写作路线'],
  ['Saves a share card of this desktop, in whatever year you stopped on.', '把当前时代的桌面保存成分享卡片。'],
  ['Snapshot 1988', '保存 1988 截图'],
  ['alt="The AI System 6 desktop, captured from the real app: Searcher, ClioTalk, Scrapbook, TeachText, and Review Desk around one manuscript."', 'alt="拍摄自真实应用的 AI System 6 桌面：Searcher、ClioTalk、Scrapbook、TeachText 与审校台围绕同一份正文。"'],

  ['ONE PIECE OF WRITING.<br>EIGHT VISIBLE PLACES.', '一份作品，<br>八个看得见的位置。'],
  ['The route is the product. Each stop keeps a different kind of responsibility visible, from the first source to the finished handoff.', '路线就是产品。从第一份来源到最后的交付，每一站都让一种不同的责任留在明处。'],
  ['Captured by <code>tooling/capture-site-route.mjs</code>. No model was connected.', '由 <code>tooling/capture-site-route.mjs</code> 从运行中的应用拍摄；没有连接模型。'],
  ['NOTHING SAVES ITSELF.', '任何东西都不会自动保存。'],
  ['A model reply is still only a reply. It becomes part of the work only when you save, clip, insert, or export it.', '模型回复仍然只是一份回复。只有在你保存、摘录、插入或导出以后，它才会成为作品的一部分。'],
  ['Output arrives temporary', '输出到来时仍是临时的'],
  ['You can read it, reject it, or decide where it belongs without changing the manuscript.', '你可以阅读、拒绝，或决定它应该去哪里，而不必先改动正文。'],
  ['You choose the destination', '由你决定去处'],
  ['Question Sheet, Outline, the current section, TeachText, Scrapbook, or a new project file.', '问题单、大纲、当前章节、TeachText、Scrapbook，或一份新的项目文件。'],
  ['Sources keep their identity', '来源保留自己的身份'],
  ['Searcher finds a source door. Reader opens the original. Scrapbook keeps only the passages you chose.', 'Searcher 寻找来源入口，阅读器打开原文，Scrapbook 只留下你亲自挑选的段落。'],
  ['The desk reports what happened', '桌面只报告真正发生过的事'],
  ['Saved, searched, clipped, and reviewed are states with receipts, not words the model is allowed to guess.', '保存、检索、摘录和审校都有状态与回执，不是模型可以猜测的措辞。'],
  ['CHAT IS AN APP.<br>NOT THE WHOLE COMPUTER.', '聊天只是一款应用。<br>不是整台电脑。'],
  ['ClioTalk is one window. The desk around it holds the sources, drafts, decisions, and files that a conversation should not have to impersonate.', 'ClioTalk 只是一扇窗口。周围的桌面保存来源、草稿、决定与文件，不让一段对话同时冒充这一切。'],
  ['A chat product', '一个聊天产品'],
  ['One thread carries every kind of material', '一条会话承载所有材料'],
  ['Context disappears into a prompt', '上下文消失在提示词里'],
  ['A reply can look like a saved result', '回复看起来像已经保存的结果'],
  ['The answer becomes the endpoint', '答案本身就是终点'],
  ['This computer', '这台电脑'],
  ['Each object has one visible responsibility', '每个对象只有一项看得见的责任'],
  ['Sources, clips, maps, and drafts keep their identity', '来源、摘录、地图与草稿各自保留身份'],
  ['Output stays temporary until you keep it', '输出在你留下以前始终是临时的'],
  ['The endpoint is a file you can hand to someone', '终点是一份能够交给别人的文件'],
  ['A hard disk tells you what lasts. A floppy tells you what is temporary. Scrapbook holds only what you chose to keep.', '硬盘告诉你什么会长期留下，软盘告诉你什么只是临时材料，Scrapbook 里只有你选择保留的东西。'],

  ['THE DESK CHANGES.<br>THE OBJECTS KEEP THEIR MEANING.', '桌面改变外观。<br>对象守住意义。'],
  ['System 6 supplies the grammar: visible objects, deliberate saving, one task at a time. Six appearances test whether that grammar survives a change of material.', 'System 6 提供一套语法：对象可见、保存明确、一次专注一件事。六套外观检验这套语法能否经受材质变化。'],
  ['<h2>Appearances</h2>', '<h2>外观</h2>'],
  ['6 appearances          1 desk          the same files', '6 套外观          1 张桌面          同一批文件'],
  ['Interfaces age. Objects do not.', '界面会老去，对象不会。'],
  ['The chrome changed. The responsibility of each object did not.', '窗口材质改变了，每个对象承担的责任没有。'],

  ['IT ALSO RUNS DOOM.', '它也能运行 DOOM。'],
  ['Micropolis. OpenTTD. DOOM. In windows, next to your manuscript.', 'Micropolis、OpenTTD、DOOM，都在窗口里，就在正文旁边。'],
  ['Not videos of games. The games, compiled to WebAssembly, in the same MultiFinder as Searcher and Review Desk.', '不是游戏录像，而是编译为 WebAssembly 的游戏本身，与 Searcher 和审校台运行在同一个 MultiFinder 里。'],
  ['Jan 1900. $20,000. Welcome, Mayor.', '1900 年 1 月，$20,000。欢迎你，市长。'],
  ['1950, in Chinese, mid-game.', '1950 年，中文，中局。'],
  ['Engine ready. Bring your own demons.', '引擎就绪，恶魔请自备。'],
  ['Photographed from the running desktop by the same script that shoots everything else on this page.', '与本页其他画面一样，由脚本从运行中的桌面拍摄。'],
  ['Go Play Them', '去运行这些游戏'],

  ['THE LITTLE THINGS, KEPT.', '那些小东西，也被留下。'],
  ['Calculator, puzzle, writing bell, alarm clock, dictation pad, memory cards. The small tools that say the desk was made with care.', '计算器、数字华容道、写作铃、闹钟、听写板和记忆卡片。这些小工具说明，桌面也在意工作之外的片刻。'],
  ['Adds up, in a beveled window.', '在带斜面的窗口里完成计算。'],
  ['<h3>Calculator</h3>', '<h3>计算器</h3>'],
  ['The sliding-tile puzzle, mid-move.', '一局还没有复原的数字华容道。'],
  ['<h3>Puzzle</h3>', '<h3>数字华容道</h3>'],
  ['A Pomodoro timer that rings like 1988.', '一只听起来像 1988 年的番茄钟。'],
  ['<h3>Writing Bell</h3>', '<h3>写作铃</h3>'],
  ['Winds up, goes off, looks the part.', '上弦、响铃，也像它应该有的样子。'],
  ['<h3>Alarm Clock</h3>', '<h3>闹钟</h3>'],
  ['Speak into the field you are already in.', '就在当前工作旁边把话说下来。'],
  ['<h3>Dictation Pad</h3>', '<h3>听写板</h3>'],
  ['Flip two, find the pair.', '翻开两张，寻找成对图案。'],
  ['<h3>Memory Cards</h3>', '<h3>记忆卡片</h3>'],
  ['Photographed from the running desktop. They are objects, not pictures.', '拍摄自运行中的桌面。它们是对象，不是摆拍图片。'],
  ['alt="Micropolis running in an AI System 6 window: the classic tool palette beside a freshly generated river map, with the status line Welcome to your new city, Mayor."', 'alt="AI System 6 窗口里的 Micropolis：经典工具面板旁是一张新生成的河流地图，状态栏欢迎新市长。"'],
  ['alt="OpenTTD in Chinese, mid-game in 1950: a coal mine above an autumn forest, the full game toolbar, and 100,000 pounds to spend."', 'alt="中文 OpenTTD 的 1950 年中局：秋色森林上方是一座煤矿，画面保留完整工具栏与资金状态。"'],
  ['alt="The DOOM window asking for a local IWAD: choose a file you own, it never leaves this browser."', 'alt="DOOM 窗口正在请求用户自有的本地 IWAD 文件；文件不会离开当前浏览器。"'],
  ['alt="The Calculator desk accessory: a beveled 1988 keypad showing 1988 plus 38."', 'alt="计算器桌面附件：带斜面的 1988 风格键盘，显示 1988 加 38。"'],
  ['alt="The Puzzle desk accessory: a shuffled sliding-tile board."', 'alt="数字华容道桌面附件：一盘被打乱的滑块。"'],
  ['alt="The Writing Bell desk accessory: a Pomodoro timer at 25 minutes in Work mode."', 'alt="写作铃桌面附件：工作模式设为 25 分钟。"'],
  ['alt="The Alarm Clock desk accessory: current time, date, and a 09:00 alarm."', 'alt="闹钟桌面附件：显示当前时间、日期与 09:00 的提醒。"'],
  ['alt="The Dictation Pad desk accessory: a filled transcript and a disabled Send until you choose where it lands."', 'alt="听写板桌面附件：已有转写文字；在选择去处以前，发送按钮保持停用。"'],
  ['alt="The Memory Cards desk accessory: a shuffled four-by-four board."', 'alt="记忆卡片桌面附件：一盘打乱的四乘四卡片。"'],

  ['WHAT FITS INSIDE THE CONSTRAINT.', '约束之内，仍然装得下什么。'],
  ['Things a Quiet Writing Desk Can Still Make Room For', '一张安静的写作桌仍能为这些事留出位置'],
  ['12 items          2 floppies          on demand', '12 个项目          2 张软盘          按需打开'],
  ['Photographs of the real app, running. No mockups anywhere on this page.', '运行中真实应用的截图。本页没有模型图。'],
  ['TWO FLOPPIES.', '两张软盘。'],
  ['CHOOSE THE MODEL.<br>KEEP THE WORKSPACE.', '更换模型。<br>工作空间仍在。'],
  ['The menu bar tells the truth. No model is connected, and the desk still works.', '菜单栏如实显示：没有连接模型，桌面仍然可以工作。'],
  ['aria-label="Supported providers"', 'aria-label="支持的模型服务商"'],
  ['Any OpenAI-compatible', '任何 OpenAI 兼容端点'],

  ['AI System 6 - The Film', 'AI System 6 - 影片'],
  ['50s&nbsp;Demo', '50 秒演示'],
  ['Play the 50-second film', '播放 50 秒影片'],
  ['alt="Poster frame: the AI System 6 desktop with Searcher, Reader, DocMap, and ClioTalk windows open."', 'alt="影片封面：AI System 6 桌面同时打开 Searcher、阅读器、DocMap 与 ClioTalk 窗口。"'],
  ['Plays here via Bilibili, or <a href="https://www.bilibili.com/video/BV1ht3m6UEDb/">watch it on the site</a>.', '通过哔哩哔哩在这里播放，也可以<a href="https://www.bilibili.com/video/BV1ht3m6UEDb/">前往网站观看</a>。'],
  ['READY TO BOOT?', '准备好启动了吗？'],
  ['Boot the Live System', '启动运行中的系统'],
  ['Mac Application', 'Mac 应用程序'],
  ['Download for Apple silicon', '下载 Apple 芯片版本'],
  ['Source Folder', '源代码文件夹'],
  ['View on GitHub', '在 GitHub 查看'],

  ['<h2 id="readme-title">Read Me</h2>', '<h2 id="readme-title">说明文件</h2>'],
  ['Six objects, one discipline: the writer remains visible in the work.', '六个对象，一条纪律：写作者始终留在作品里。'],
  ['The work has a durable home', '作品有长期留下的地方'],
  ['Projects, references, drafts, and chosen clips remain on the Project Hard Disk when the conversation is over.', '对话结束以后，项目、参考资料、草稿和主动选择的摘录仍留在项目硬盘里。'],
  ['Temporary material stays temporary', '临时材料继续保持临时'],
  ['Files on the File Floppy and replies from a model do not become project memory by appearing on screen.', '文件软盘里的材料与模型回复，不会只因出现在屏幕上就变成项目记忆。'],
  ['Your question comes before the prose', '你的问题先于正文'],
  ['The recipient, the objection, the detail you saw yourself, and the doubt you have not resolved all have somewhere to stay.', '接收者、反对意见、亲眼看到的细节和尚未解决的疑问，都有地方留下。'],
  ['Selection becomes memory', '选择让材料成为记忆'],
  ['Scrapbook holds only the passages you chose, with a path back to the source.', 'Scrapbook 只保存你选择的段落，并保留回到来源的路径。'],
  ['The manuscript has one owner', '正文同一时间只有一个编辑者'],
  ['Each phase names the one editable surface, so a command cannot quietly rewrite an older version of the article.', '每个阶段都明确唯一可编辑的表面，因此一条命令不会悄悄改写文章的旧版本。'],
  ['Review Desk reads it back', '审校台把作品读回来'],
  ['It makes factual, structural, and model-voice risk visible before the work leaves your hands.', '在作品离开你手中之前，它会把事实、结构和模型口吻风险摆到明处。'],
  ["The project stays in this browser's IndexedDB. A local model keeps requests on your machine; cloud requests follow the policy of the provider you choose. The server keeps no second project database.", '项目保存在这个浏览器的 IndexedDB 中。本机模型让请求留在本机；云端请求遵循你所选服务商的政策。服务端不保存第二份项目数据库。'],

  ['Live system', '运行中系统'],
  ['50-second demo', '50 秒演示'],
  ['>Issues</a>', '>问题反馈</a>'],
  ['MIT licensed. AI System 6 is an independent project and is not affiliated with or endorsed by Apple&nbsp;Inc.', '采用 MIT 许可。AI System 6 是独立项目，与 Apple&nbsp;Inc. 没有关联，也未获其背书。'],
  ['It is now safe to shut down AI System 6.', '现在可以安全地关闭 AI System 6。'],
  ['<a href="zh-CN.html" lang="zh-CN">简体中文</a>', '<a href="index.html" lang="en">English</a>'],
];

function buildChinesePage() {
  let output = readFileSync(sourcePath, "utf8");
  for (const [from, to] of replacements) output = output.split(from).join(to);
  return output;
}

const next = buildChinesePage();
if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== next) {
    console.error("site/zh-CN.html is stale; run node site/build-zh-page.mjs");
    process.exit(1);
  }
  console.log("site/zh-CN.html matches site/index.html and the Chinese copy map");
} else {
  writeFileSync(outputPath, next);
  console.log("built site/zh-CN.html");
}
