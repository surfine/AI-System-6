#!/usr/bin/env node

// Build the discipline page, one source for two pages.
//
// discipline/index.html (English) and discipline/zh-CN.html (Simplified
// Chinese) come from the same section list, so a rule, a source or a link can
// never exist in one language and not the other. The page is the first
// reading face under docs/design/SITE-EDITORIAL.md: paper and ink, one
// oxidized accent, one column, no desktop metaphor around the body copy.
// `--check` fails when either page is stale.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "discipline");
const ORIGIN = "https://aisystem6.aaronlau.me";
const LIVE = "https://system6.aaronlau.me";
const REPO = "https://github.com/surfine/AI-System-6";
const VERSION = "20261104a";

// Every rule below names the part of the product that enforces it. If a file
// path or a behavior changes, the rule's source link changes with this list.
const SOURCES = [
  ["live", "AI System 6 · the running desk", LIVE,
    "开一台试试。不需要模型，也不需要注册。",
    "Boot one and look around. No model and no sign-up required."],
  ["localcloud", "Local and cloud in AI System 6 (document)", `${REPO}/blob/main/docs/LOCAL-AND-CLOUD.md`,
    "本地与云的边界：哪一段路程离线可走、模型路由有哪几条、凭据不进哪些文件。",
    "The local and cloud boundary: which parts of the route run offline, which model routes exist, and which files credentials never enter."],
  ["activity", "The activity states (source)", `${REPO}/blob/main/apps/desktop/app/core/assistant-activity.js`,
    "七个状态只由真实运行事件驱动；模块注释写明不造假状态、不放假的思考动画。",
    "Seven states driven only by real run events; the module states it never invents a state and never fakes a thinking animation."],
  ["receipts", "Run receipts (source)", `${REPO}/blob/main/apps/desktop/app/core/run-receipts.js`,
    "每次模型运行的回执：路由、重试、引用范围；只记可验证事实，不记密钥，不记思维链。",
    "One receipt per model run: route, retries, citation range; verifiable facts only, never credentials, never a chain of thought."],
  ["contracts", "The contracts (tests)", `${REPO}/tree/main/tests/features`,
    "行为契约套件；其中 assistant-activity、run-receipts、research-methodology 三份守着本页的五条规则。",
    "The behavior contract suite; assistant-activity, run-receipts and research-methodology guard the rules on this page."],
];

const SECTIONS = [
  {
    id: "d-thinking",
    en: {
      title: "It does not pretend to think",
      body: [
        "The status line has seven states: offline, idle, reading, working, waiting, ready, error. They change only when a real run event says so. The module that owns them carries its own note that it never invents a state and never fakes a thinking animation, and the Stop button appears only when a run can actually be stopped.",
        "A desk that performs thinking invites you to stop checking. This one would rather report nothing than report a mood.",
      ],
    },
    zh: {
      title: "它不假装在思考",
      body: [
        "状态行只有七种状态：离线、空闲、正在读、正在写、等待、就绪、出错。它们只在真实运行事件发生时变化。管理它们的模块自带一句注释：不虚构状态，不播放假的「思考中」动画；只有真的能停下时，Stop 按钮才会出现。",
        "一台表演思考的机器，会让人放松检查。这一台宁可什么都不报，也不报一种情绪。",
      ],
    },
  },
  {
    id: "d-receipts",
    en: {
      title: "It does not hide what it read",
      body: [
        "Every model run ends in a receipt: which route it took, how many retries it made, which reference range it was allowed to see. Receipts live in the project, so they travel with a backup and can be read later.",
        "The Memory Inspector window shows what a run took, as a count against a budget. Receipts never store credentials, and they never store a chain of thought.",
      ],
    },
    zh: {
      title: "它不隐瞒读过什么",
      body: [
        "每一次模型运行都留下一张回执：走了哪条路由、重试了几次、被允许看哪一段引用范围。回执存在项目里，随备份一起走，事后随时能查。",
        "记忆边界窗口把每次运行取用的上下文显示为一个数目，对着一份预算。回执永远不存凭据，也永远不存思维链。",
      ],
    },
  },
  {
    id: "d-voice",
    en: {
      title: "It does not become your voice",
      body: [
        "Model output stays a candidate until you accept it, clip it, insert it or export it yourself. Nothing enters the manuscript on its own.",
        "On the Review Desk, the returning reviewer reports AI-mouthpiece risk as its own column, beside fact risk and structure risk, so a piece drifting toward the machine's register is checked with the same seriousness as an error.",
      ],
    },
    zh: {
      title: "它不变成你的声音",
      body: [
        "模型的输出在你亲手收下、剪入、插入或导出之前，始终只是候选。没有任何东西会自己进入稿子。",
        "在审稿台上，回来的审稿伙伴把「AI 传声筒风险」单独立一栏，和事实风险、结构风险并列。一篇稿子漂向机器腔调，会像一处错误一样被认真对待。",
      ],
    },
  },
  {
    id: "d-asks",
    en: {
      title: "It asks before it writes",
      body: [
        "When Clio works on files, in ClioWork for documents or ClioCode for a code folder, read-only commands run without asking, and every dangerous command asks each time. Permission answers are yours, and they are remembered as yours.",
        "Each call leaves a checkpoint, so a change you regret is a rewind, not a restore from backup.",
      ],
    },
    zh: {
      title: "动笔之前，先问过你",
      body: [
        "当 Clio 处理文件时，无论是管文档的 ClioWork，还是管代码文件夹的 ClioCode，只读命令不问就跑，每一条危险命令每次都问。许可由你给，也记成你给的。",
        "每次调用都留下检查点。后悔的一次改动是一次回退，不是一场从备份开始的恢复。",
      ],
    },
  },
  {
    id: "d-yours",
    en: {
      title: "It runs on your machine, or on the model you name",
      body: [
        "Six routes: LM Studio and Ollama local, DeepSeek and Anthropic Messages in the cloud, a custom endpoint, or no model at all. Without a model the writing route still runs end to end; the one stop that wants one, outline generation, says so plainly and keeps everything you typed.",
        "The server is stateless and keeps no project database. Credentials never enter project files, chats, backups or exports, and the project itself is an IndexedDB database in your browser that you can export.",
      ],
    },
    zh: {
      title: "它跑在你的机器上，或者跑在你指定的模型上",
      body: [
        "六条路由：本地的 LM Studio 和 Ollama，云端的 DeepSeek 和 Anthropic Messages，自定义端点，以及不接模型。不接模型时写作路线照样从头走到尾；唯一想要模型的一站，大纲生成，会明说，并保留你打下的每一个字。",
        "服务器无状态，没有第二个项目数据库。凭据永远不进项目文件、对话、备份或导出；项目本身是你浏览器里一个可以导出的 IndexedDB 数据库。",
      ],
    },
  },
];

function page(en) {
  const t = (zh, eng) => (en ? eng : zh);
  const lang = en ? "en" : "zh-CN";
  const self = en ? `${ORIGIN}/discipline/` : `${ORIGIN}/discipline/zh-CN`;
  const home = en ? "../" : "../zh-CN";
  const other = en ? "zh-CN" : "./";
  const title = t("这台桌上的 AI 不做什么", "What the AI here won't do");
  const kicker = t("AI System 6 · 纪律", "AI System 6 · Discipline");
  const dek = t(
    "五条规则，写在这台桌子的代码里，而不是写在一份政策页上。每一条都注明由产品的哪一部分执行，也各有会在它被悄悄移除时失败的测试。",
    "Five rules the desk enforces in its own code, not on a policy page. Each rule names the part of the product that enforces it, and each one has a test that fails if it is quietly removed.",
  );
  const description = dek;

  const sections = SECTIONS.map((section) => {
    const copy = en ? section.en : section.zh;
    return `      <section class="dp-section" id="${section.id}" aria-labelledby="h-${section.id}">
        <h2 id="h-${section.id}">${copy.title}</h2>
${copy.body.map((paragraph) => `        <p>${paragraph}</p>`).join("\n")}
      </section>`;
  }).join("\n");

  const sources = SOURCES.map(([id, label, href, zhNote, enNote], index) => {
    const n = index + 1;
    const note = t(zhNote, enNote);
    return `      <li id="src-${id}"><span class="dp-src-n">${n}</span><div><a href="${href}" target="_blank" rel="noopener">${label} &#8599;</a><p>${note}</p></div></li>`;
  }).join("\n");

  return `<!doctype html>
<html lang="${lang}" class="discipline-note">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t("这台桌上的 AI 不做什么 · AI System 6", "What the AI here won't do · AI System 6")}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${self}">
<link rel="alternate" hreflang="en" href="${ORIGIN}/discipline/">
<link rel="alternate" hreflang="zh-CN" href="${ORIGIN}/discipline/zh-CN">
<link rel="alternate" hreflang="x-default" href="${ORIGIN}/discipline/">
<link rel="icon" href="../img/app-icon-192.png">
<link rel="apple-touch-icon" href="../img/app-icon-180.png">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${ORIGIN}/img/og-poster.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t("AI System 6，一张 1988 年的写作桌。", "AI System 6, a writing desk from 1988.")}">
<meta property="og:url" content="${self}">
<meta property="og:site_name" content="AI System 6">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ORIGIN}/img/og-poster.png">
<link rel="stylesheet" href="../site.css?v=${VERSION}">
<link rel="stylesheet" href="../discipline.css?v=${VERSION}">
</head>
<body>

<nav class="menu-bar" aria-label="Site">
  <a class="menu-home" href="${home}"><span class="menu-apple s6-mark" aria-hidden="true"></span><span class="menu-title">AI System 6</span></a>
  <span class="menu-here">${t("纪律", "Discipline")}</span>
  <span class="menu-spacer"></span>
  <a class="menu-link" href="${other}" lang="${en ? "zh-CN" : "en"}">${en ? "简体中文" : "English"}</a>
  <a class="menu-link menu-link-live" href="${LIVE}">${t("运行中系统", "Live&nbsp;System")}</a>
</nav>

<main class="dp" id="top">
  <header class="dp-header">
    <p class="dp-kicker">${kicker}</p>
    <h1>${t("这台桌上的 AI 不做什么", "What the AI here won't do")}</h1>
    <p class="dp-dek">${dek}</p>
    <p class="dp-meta">${t("2026 年 11 月 4 日 · 约 4 分钟", "November 4, 2026 · 4 min")}</p>
  </header>

  <article class="dp-article">
${sections}

    <aside class="dp-callout" aria-label="${t("本页不证明什么", "What this does not prove")}">
      <p class="dp-callout-title">${t("本页不证明什么", "What this does not prove")}</p>
      <p>${t(
        "这五条是软件行为，背后是会失败的测试。它们不会让任何人成为更好的作者，也不担保一篇稿子句句属实。它们只保证这台桌子对机器做过什么保持诚实，好让你自己的判断始终是那件要紧的事。",
        "These five rules are software behavior with tests behind them. They do not make anyone a better writer, and they do not certify that a piece is truthful. They keep the desk honest about what the machine did, so your own judgment stays the part that matters.",
      )}</p>
    </aside>

    <p class="dp-actions"><a class="dp-button" href="${LIVE}">${t("开一台试试", "Boot the desk")}</a><a class="dp-quiet" href="${home}">${t("回首页", "Back to the home page")}</a></p>
  </article>

  <section class="dp-sources" id="sources" aria-labelledby="sources-title">
    <h2 id="sources-title">${t("出处", "Sources")}</h2>
    <p>${t(
      "每条规则后面的执行者都可以打开看：两个源码文件、一份边界文档、一套契约测试，以及运行中的系统本身。核对于 2026 年 11 月 4 日。",
      "The part of the product behind each rule can be opened and read: two source files, one boundary document, the contract suite, and the running system. Checked on November 4, 2026.",
    )}</p>
    <ol>
${sources}
    </ol>
  </section>

  <footer class="site-footer dp-footer">
    <p><a href="${home}">${t("AI System 6 首页", "AI System 6 home")}</a> / <a href="${LIVE}">${t("运行中系统", "Live system")}</a> / <a href="${REPO}">GitHub</a></p>
    <p>${t("采用 MIT 许可。AI System 6 是独立项目，与 Apple&nbsp;Inc. 没有关联，也未获其背书。", "MIT licensed. AI System 6 is an independent project and is not affiliated with or endorsed by Apple&nbsp;Inc.")}</p>
  </footer>
</main>
</body>
</html>
`;
}

const check = process.argv.includes("--check");
mkdirSync(outDir, { recursive: true });
let stale = false;
for (const en of [true, false]) {
  const name = en ? "index.html" : "zh-CN.html";
  const target = join(outDir, name);
  const html = `${page(en)}\n`;
  if (check) {
    const current = readFileSync(target, "utf8");
    if (current !== html) {
      stale = true;
      console.error(`${target} is stale; run node site/build-discipline-page.mjs`);
    }
  } else {
    writeFileSync(target, html);
    console.log(`wrote ${target} (${html.length} bytes)`);
  }
}
if (check && stale) process.exit(1);
