// Feature module: slide themes / deck modes / deck layouts for slides.md.
//
// Lazy-loaded by the slides export path and by ClioStage. It owns the four
// orthogonal dimensions of a deck:
//
//   mode    how the deck argues   (5)  -> title voice, page order, notes tone
//   era     what it looks like    (8)  -> tokens + material delta, ids reused
//                                          from apps/desktop/app/core/theme-registry.js
//   layout  how one page is built (16) -> declared per page as a Marp _class
//   canvas  size + reading mode        -> type-size floor
//
// The Marp mapping is deliberately native: the era travels as the global
// `class:` directive plus the deck's own `style:` block, and a page's layout
// travels as the local `_class` directive. Nothing here invents a second
// syntax that Marp itself would not understand.

window.AISystem6SlideThemesLoaded = true;

// --- eras ------------------------------------------------------------------
// id / label / year / family mirror theme-registry.js. The desk appearance and
// the deck theme are separate choices: a writer on a System 6 desk may hand out
// a Liquid Glass deck.
//
// Each era is the presentation software a Mac (or NeXT) user of that year
// actually had, adapted rather than copied. Evidence, with a source per claim
// and what is only inference (typeface names are eyeballed):
// internal/evidence/drafts/deck-eras/README.zh-CN.md (2026-09-23). CJK faces
// follow the site's era rule: Song for 1988-1999, STHeiti 2001-2014, PingFang
// from 2015. Bullet rules skip the layouts that draw their own list marks.

const SLIDE_LIST_LAYOUTS = ":not(.metric):not(.timeline):not(.takeaway):not(.ledger)";

const SLIDE_ERAS = [
  {
    // PowerPoint 1.0 era: Forethought's own 1985-86 overhead transparencies,
    // printed black on white and photocopied to film. A heavy rounded frame
    // with a black bar across its top; bold centred sans titles; "•" then "—".
    id: "classic", label: "System 6", year: 1988, family: "classic",
    hint: "黑白胶片 / 打印讲义", hintEn: "Black-and-white overheads and handouts",
    tokens: {
      bg: "#ffffff", ink: "#000000", muted: "#333333", rule: "#000000",
      ruleStrong: "#000000", tint: "#e6e6e6", accent: "#000000",
      display: '"Helvetica Neue", Helvetica, Arial, "Songti SC", "STSong", sans-serif',
      body: '"Helvetica Neue", Helvetica, Arial, "Songti SC", "STSong", sans-serif',
      mono: '"Monaco", "Courier New", monospace',
    },
    delta: `
section.era-classic { padding: 96px 100px 78px; }
section.era-classic::before {
  content: ""; position: absolute; inset: 24px 30px 44px; pointer-events: none;
  border: 9px solid currentColor; border-top-width: 42px; border-radius: 24px;
}
section.era-classic h1, section.era-classic h2 { font-weight: 700; letter-spacing: 0; text-align: center; }
section.era-classic.cover, section.era-classic.lead, section.era-classic.closing { justify-content: center; align-items: center; text-align: center; }
section.era-classic${SLIDE_LIST_LAYOUTS} ul { list-style: none; padding-left: 0; }
section.era-classic${SLIDE_LIST_LAYOUTS} li::before { content: "• "; }
section.era-classic${SLIDE_LIST_LAYOUTS} li li::before { content: "— "; }
section.era-classic.table td, section.era-classic.table th { border: 1px solid currentColor; text-align: center; }
section.era-classic.table th { border-bottom-width: 3px; }`,
  },
  {
    // PowerPoint 98 Design Templates (Angles, Dad's Tie, Soaring…): a dark
    // ground, saturated geometry down one edge, white bold type; the era's
    // own advice was dark background, light letters, 36pt titles.
    id: "platinum", label: "Platinum", year: 1998, family: "classic",
    hint: "投影仪 / 深底白字", hintEn: "Projector decks, dark ground",
    tokens: {
      bg: "#0c0c12", ink: "#ffffff", muted: "#c9c9d4", rule: "#4c4c5a",
      ruleStrong: "#ffffff", tint: "#1d1d29", accent: "#e1262d",
      display: 'Arial, Helvetica, "Songti SC", "STSong", sans-serif',
      body: 'Arial, Helvetica, "Songti SC", "STSong", sans-serif',
      mono: '"Courier New", monospace',
    },
    delta: `
section.era-platinum { padding-left: 156px; }
section.era-platinum::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 104px; pointer-events: none;
  background: linear-gradient(180deg, #ef3b40, #9c1218); clip-path: polygon(0 0, 100% 0, 34% 100%, 0 100%);
}
section.era-platinum:not(.dark) { background-image: linear-gradient(118deg, transparent 58.6%, rgba(255,255,255,.3) 58.7%, rgba(255,255,255,.3) 58.9%, transparent 59%); }
section.era-platinum h1, section.era-platinum h2 { font-weight: 700; letter-spacing: 0; }
section.era-platinum${SLIDE_LIST_LAYOUTS} li::marker { content: "■  "; color: var(--slide-accent); font-size: .7em; }`,
  },
  {
    // Keynote 1.0 (2003), Gradient: Apple's own pick "if the occasion is
    // important enough" — near black at the top to dark grey below, white
    // centred type. The face is Gill Sans by eye (inference).
    id: "aqua", label: "Aqua", year: 2000, family: "aqua",
    hint: "正式场合 / 渐变黑", hintEn: "Formal occasions, black gradient",
    tokens: {
      bg: "#111111", ink: "#ffffff", muted: "#bdbdbd", rule: "#555555",
      ruleStrong: "#a0a0a0", tint: "#2b2b2b", accent: "#ffffff",
      display: '"Gill Sans", "Gill Sans MT", "Lucida Grande", "STHeiti", "Heiti SC", sans-serif',
      body: '"Gill Sans", "Gill Sans MT", "Lucida Grande", "STHeiti", "Heiti SC", sans-serif',
      mono: '"Monaco", monospace',
    },
    delta: `
section.era-aqua:not(.dark) { background-image: linear-gradient(180deg, #000000 0%, #171717 42%, #5a5a5a 100%); }
section.era-aqua h1, section.era-aqua h2 { font-weight: 400; letter-spacing: .01em; text-align: center; }
section.era-aqua.cover, section.era-aqua.lead, section.era-aqua.closing, section.era-aqua.divider { justify-content: center; align-items: center; text-align: center; }`,
  },
  {
    // Keynote '09, Showroom: "clean, polished" — a white-to-grey studio glow,
    // thin grey capitals centred, and a mirror under every picture.
    id: "snow-leopard", label: "Snow Leopard", year: 2009, family: "aqua",
    hint: "产品展示 / 摄影棚光", hintEn: "Product showcase, studio light",
    tokens: {
      bg: "#f3f3f3", ink: "#3b3b3b", muted: "#7c7c7c", rule: "#d2d2d2",
      ruleStrong: "#a9a9a9", tint: "#e9e9e9", accent: "#3b3b3b",
      display: '"Helvetica Neue", "Lucida Grande", "STHeiti", "Heiti SC", sans-serif',
      body: '"Lucida Grande", "Helvetica Neue", "STHeiti", "Heiti SC", sans-serif',
      mono: '"Menlo", monospace',
    },
    delta: `
section.era-snow-leopard:not(.dark) { background-image: radial-gradient(ellipse 72% 62% at 50% 40%, #ffffff 0%, #f2f2f2 55%, #d6d6d6 100%); }
section.era-snow-leopard h1, section.era-snow-leopard h2 { font-weight: 300; text-transform: uppercase; letter-spacing: .08em; color: var(--slide-muted); text-align: center; }
section.era-snow-leopard.dark h1, section.era-snow-leopard.dark h2 { color: inherit; }
section.era-snow-leopard.cover, section.era-snow-leopard.lead, section.era-snow-leopard.closing { justify-content: center; align-items: center; text-align: center; }
section.era-snow-leopard img { -webkit-box-reflect: below 2px linear-gradient(transparent 68%, rgba(255,255,255,.4)); }`,
  },
  {
    // Keynote 6 (rewritten 2013, "updated for Yosemite" 2014): White / Black /
    // Gradient — flat grounds, thin centred type, flat single-colour charts.
    id: "yosemite", label: "Yosemite", year: 2014, family: "liquid-glass",
    hint: "研究 / 长文 / 扁平", hintEn: "Research and long-form, flat",
    tokens: {
      bg: "#ffffff", ink: "#1d1d1f", muted: "#8e8e93", rule: "#e5e5ea",
      ruleStrong: "#c7c7cc", tint: "#f2f2f7", accent: "#5aa9e6",
      display: '"Helvetica Neue", "STHeiti", "Heiti SC", sans-serif',
      body: '"Helvetica Neue", "STHeiti", "Heiti SC", sans-serif',
      mono: '"Menlo", monospace',
    },
    delta: `
section.era-yosemite { font-weight: 300; }
section.era-yosemite h1, section.era-yosemite h2, section.era-yosemite h3 { font-weight: 300; letter-spacing: 0; }
section.era-yosemite.cover, section.era-yosemite.lead, section.era-yosemite.closing { justify-content: center; align-items: center; text-align: center; }`,
  },
  {
    // Keynote 10 (2020), Basic White: bold titles set left and low, widescreen,
    // photographs full bleed; Seacoast Shapes lists with a short dash.
    id: "big-sur", label: "Big Sur", year: 2020, family: "liquid-glass",
    hint: "通用默认（推荐）", hintEn: "General default (recommended)",
    tokens: {
      bg: "#ffffff", ink: "#000000", muted: "#6e6e73", rule: "#e3e3e6",
      ruleStrong: "#1d1d1f", tint: "#f5f5f7", accent: "#0071e3",
      display: '"SF Pro Display", -apple-system, "PingFang SC", sans-serif',
      body: '"SF Pro Text", -apple-system, "PingFang SC", sans-serif',
      mono: '"SF Mono", Menlo, monospace',
    },
    delta: `
section.era-big-sur h1, section.era-big-sur h2 { font-weight: 700; letter-spacing: -.02em; }
section.era-big-sur.statement, section.era-big-sur.lead { align-items: flex-start; text-align: left; justify-content: flex-end; }
section.era-big-sur${SLIDE_LIST_LAYOUTS} li::marker { content: "–  "; }
section.era-big-sur .slide-panel { background: var(--slide-tint); border-radius: 14px; border: 0; }`,
  },
  {
    // Keynote 14 (2025): the dynamic, procedurally generated backgrounds. The
    // Liquid Glass material reached Keynote's interface only in January 2026
    // and no Apple theme puts glass on the slide, so this era is flowing colour
    // under Big Sur's left-set bold type, not a glass slide.
    id: "liquid-glass", label: "Liquid Glass", year: 2025, family: "liquid-glass",
    hint: "发布会 / 投影 / 动态底", hintEn: "Keynotes and projection, dynamic ground",
    tokens: {
      bg: "#0b1830", ink: "#ffffff", muted: "#c3d2ee", rule: "rgba(255,255,255,.22)",
      ruleStrong: "rgba(255,255,255,.6)", tint: "rgba(255,255,255,.1)", accent: "#7cf0c8",
      display: '"SF Pro Display", -apple-system, "PingFang SC", sans-serif',
      body: '"SF Pro Text", -apple-system, "PingFang SC", sans-serif',
      mono: '"SF Mono", Menlo, monospace',
    },
    delta: `
section.era-liquid-glass:not(.dark) {
  background-image:
    radial-gradient(95% 75% at 12% 112%, rgba(124,240,200,.55), transparent 62%),
    radial-gradient(70% 60% at 92% -12%, rgba(128,122,255,.6), transparent 62%),
    linear-gradient(160deg, #0b1830, #152b5e 55%, #0b1830);
}
section.era-liquid-glass h1, section.era-liquid-glass h2 { font-weight: 700; letter-spacing: -.02em; }
section.era-liquid-glass.statement, section.era-liquid-glass.lead { align-items: flex-start; text-align: left; justify-content: flex-end; }`,
  },
  {
    // Concurrence (Lighthouse Design), the NeXT presentation program Steve Jobs
    // used for years before Keynote: a dark photographic ground, a white serif
    // title with a drop shadow, black bevelled panels holding bold sans text,
    // and a ▶ on the point being spoken. The only surviving screenshot is
    // greyscale, so the ground is a dark vignette rather than a guessed colour.
    id: "nextstep", label: "NeXTSTEP", year: 1995, family: "nextstep",
    hint: "技术 / 汇报 / 暗底面板", hintEn: "Technical reviews, dark panels",
    tokens: {
      bg: "#2a2a2d", ink: "#ffffff", muted: "#a2a2a6", rule: "#58585e",
      ruleStrong: "#b0b0b0", tint: "#000000", accent: "#ffffff",
      display: '"Times New Roman", Times, "Songti SC", "STSong", serif',
      body: '"Helvetica Neue", Helvetica, "STHeiti", "Heiti SC", sans-serif',
      mono: '"Courier New", monospace',
    },
    delta: `
section.era-nextstep:not(.dark) { background-image: radial-gradient(ellipse 80% 70% at 50% 30%, #4b4b50 0%, #2a2a2d 58%, #151517 100%); }
section.era-nextstep h1, section.era-nextstep h2 { font-weight: 700; text-align: center; text-shadow: 2px 3px 0 rgba(0,0,0,.85); }
section.era-nextstep${SLIDE_LIST_LAYOUTS} > ul, section.era-nextstep.table table {
  background: #000; border: 2px solid; border-color: #8e8e92 #151515 #151515 #8e8e92;
  padding: 18px 24px 18px 48px; margin-top: 24px;
}
section.era-nextstep${SLIDE_LIST_LAYOUTS} ul { list-style: none; }
section.era-nextstep${SLIDE_LIST_LAYOUTS} li ul { margin-top: 6px; padding-left: 36px; }
section.era-nextstep${SLIDE_LIST_LAYOUTS} li { font-weight: 700; }
section.era-nextstep${SLIDE_LIST_LAYOUTS} li::before { content: "▶"; display: inline-block; width: 28px; margin-left: -28px; font-size: .62em; vertical-align: .18em; }
section.era-nextstep .slide-print-foot span:last-child { background: #fff; color: #000; padding: 1px 8px; }`,
  },
];

// --- layouts ---------------------------------------------------------------
// One structure per page, declared by the Marp local `_class` directive. The
// surface is the second token in that directive (hero | light | dark) and is
// what the rhythm gate counts.

const SLIDE_LAYOUTS = [
  { id: "cover", zh: "封面", en: "Cover", surface: "hero", use: "开场定调", useEn: "Open the deck" },
  { id: "lead", zh: "开场钩子", en: "Hook", surface: "hero", use: "第一页就说结论", useEn: "State the point first" },
  { id: "divider", zh: "章节分隔", en: "Divider", surface: "hero", use: "换话题", useEn: "Change chapter" },
  { id: "statement", zh: "单一主张", en: "Statement", surface: "hero", use: "一句主张，不要别的", useEn: "One claim, nothing else" },
  { id: "quote", zh: "引文", en: "Quote", surface: "hero", use: "外部材料显式成引文", useEn: "External material as a quote" },
  { id: "contrast", zh: "左右对置", en: "Contrast", surface: "dark", use: "两件事对着看", useEn: "Two things side by side" },
  { id: "duo-compare", zh: "两栏对置", en: "Duo compare", surface: "light", use: "旧 / 新，各占一半", useEn: "Before and after" },
  { id: "columns", zh: "双栏", en: "Columns", surface: "light", use: "并列两组要点", useEn: "Two parallel groups" },
  { id: "metric", zh: "数字墙", en: "Metric wall", surface: "light", use: "一个主数字 + 2-3 个次数字", useEn: "One lead number, few supports" },
  { id: "evidence", zh: "证据页", en: "Evidence", surface: "light", use: "图 + 一句读图结论", useEn: "Chart plus its reading" },
  { id: "table", zh: "表格页", en: "Table", surface: "light", use: "多列对比", useEn: "Multi-column comparison" },
  { id: "timeline", zh: "时间线", en: "Timeline", surface: "light", use: "沿时间讲过程", useEn: "Process over time" },
  { id: "image-grid", zh: "图片网格", en: "Image grid", surface: "light", use: "三张图统一比例", useEn: "Three images, one ratio" },
  { id: "ledger", zh: "清单", en: "Ledger", surface: "light", use: "分组规格，只在组间划线", useEn: "Grouped specification rows" },
  { id: "takeaway", zh: "结论", en: "Takeaway", surface: "light", use: "三条要点", useEn: "Three points" },
  { id: "closing", zh: "收尾", en: "Closing", surface: "hero", use: "callback + 出处", useEn: "Callback and source" },
];

const SLIDE_HEIGHTS = ["16:9", "4:3"];

// What the model writes for each layout, in plain Marp markdown. These shapes
// are the contract the layout CSS styles; a page that writes another shape gets
// the layout's default typesetting and none of its composition.
const SLIDE_LAYOUT_MARKDOWN = {
  cover: "`# 标题` + 一段副题 + 最后一段写来源/日期",
  lead: "`## 一句结论`（可加一行 `**强调**`）",
  divider: "单独一段写编号，再 `## 章节名`",
  statement: "`## 一句主张`，最后一段写依据",
  quote: "`> 引文` + 一段出处",
  contrast: "两列表格：表头是两个对象的名字，一行数据放两个大数字",
  "duo-compare": "两列表格：第一列旧、第二列新，逐行对应",
  columns: "`## 标题` + 两个 `### 小标题` 各带一个列表",
  metric: "一个列表，每项以 `**数值** 说明` 开头；第一项是最重要的那个",
  evidence: "先放图（或 `![说明](…)`），再一段读图结论，最后一段写未测项",
  table: "GFM 表格 + 最后一段写结论",
  timeline: "一个列表，每项以 `**时间** 事件` 开头，共 3-4 项",
  "image-grid": "三张图写在同一行（同一段），比例统一 16:10",
  ledger: "每 2-3 行一个 `### 分组名`，下面跟一个两列表格",
  takeaway: "一个三行的有序列表",
  closing: "`## 一句收束` + 一段出处",
};

const SLIDE_READING_MODES = [
  { id: "text", zh: "阅读优先", en: "Reading first", body: 20, meta: 14, note: "自包含，供传阅与打印" },
  { id: "balanced", zh: "兼顾", en: "Balanced", body: 24, meta: 14, note: "默认：既能念也能读" },
  { id: "presentation", zh: "演讲优先", en: "Speaker led", body: 32, meta: 16, note: "字大，一页一个意思" },
];

// --- modes -----------------------------------------------------------------
// How the deck argues. Independent of the era: any mode pairs with any era.
// `titleRule` is what the model must do to a page title; `affinity` orders the
// layouts this mode reaches for first.

const DECK_MODES = [
  {
    id: "pyramid",
    zh: "结论先行", en: "Conclusion first",
    hint: "给要拍板的人看", hintEn: "For the reader who decides",
    titleRule: "标题就是结论，不是主题",
    titleRuleEn: "The title is the conclusion, not the topic",
    tendency: "先说答案，再用证据撑住；每个数字尽量配一个站得住的比较",
    notes: "备注先给结论，再补紧凑的事实",
    affinity: ["cover", "statement", "evidence", "metric", "table", "takeaway", "closing", "divider"],
  },
  {
    id: "narrative",
    zh: "故事线", en: "Narrative",
    hint: "讲故事、讲人", hintEn: "Pitches and case studies",
    titleRule: "标题是节拍，不是标签",
    titleRuleEn: "Titles are beats that move the story",
    tendency: "情形 → 张力 → 解决；一段密集之后留一页呼吸",
    notes: "像跟人说话：设问、类比、把抽象落到一个人或一个时刻",
    affinity: ["cover", "quote", "lead", "evidence", "image-grid", "divider", "contrast", "closing"],
  },
  {
    id: "instructional",
    zh: "教学", en: "Instructional",
    hint: "培训、教程、知识分享", hintEn: "Training and explainers",
    titleRule: "标题说明这一页教什么",
    titleRuleEn: "Titles state what the page teaches",
    tendency: "拆解 → 排序 → 举例；并列概念用同一种形状",
    notes: "先定义再使用；用例子锚住原则；提示下一步",
    affinity: ["cover", "timeline", "columns", "ledger", "evidence", "table", "takeaway", "divider"],
  },
  {
    id: "showcase",
    zh: "视觉主导", en: "Showcase",
    hint: "发布、品牌、开场", hintEn: "Launches and reveals",
    titleRule: "标题是短语，不是句子",
    titleRuleEn: "Titles are short and evocative",
    tendency: "图或数字先说话；大胆的页之间插一页安静的",
    notes: "短句、有节奏；让画面承担信息，念的是感觉和判断",
    affinity: ["cover", "statement", "image-grid", "contrast", "quote", "divider", "closing", "metric"],
  },
  {
    id: "briefing",
    zh: "中性完备", en: "Briefing",
    hint: "进度、参考、会议包", hintEn: "Status and reference decks",
    titleRule: "标题写主题，不写主张",
    titleRuleEn: "Titles name the subject, not a claim",
    tendency: "齐全、可扫、可查；同类项同权重，不制造高潮",
    notes: "平铺直叙地读出来，不设悬念、不逼结论；数字照实说",
    affinity: ["cover", "ledger", "table", "columns", "timeline", "metric", "image-grid", "closing"],
  },
];

// --- the deck's own CSS ----------------------------------------------------
// Written once in Marp's `section` dialect: the same text is inlined into the
// deck's `style:` block and scoped into ClioStage's slide frame by
// scopeSlideCss(), so "what you saw" and "what you exported" cannot drift.

function slideEraById(id) {
  return SLIDE_ERAS.find((era) => era.id === id) || null;
}

function slideLayoutById(id) {
  return SLIDE_LAYOUTS.find((layout) => layout.id === id) || null;
}

function slideModeById(id) {
  return DECK_MODES.find((mode) => mode.id === id) || null;
}

function slideEraTokensCss(era) {
  const t = era.tokens;
  return `section.era-${era.id} {
  --slide-bg: ${t.bg}; --slide-ink: ${t.ink}; --slide-muted: ${t.muted};
  --slide-rule: ${t.rule}; --slide-rule-strong: ${t.ruleStrong};
  --slide-tint: ${t.tint}; --slide-accent: ${t.accent};
  --slide-display: ${t.display}; --slide-body: ${t.body}; --slide-mono: ${t.mono};
}`;
}

function slideLayoutCss() {
  return `section {
  --slide-bg: #fbfbfd; --slide-ink: #1d1d1f; --slide-muted: #636366;
  --slide-rule: #e2e2e7; --slide-rule-strong: #b8b8c1;
  --slide-tint: #f0f0f5; --slide-accent: #0071e3;
  --slide-display: "SF Pro Display", -apple-system, sans-serif;
  --slide-body: "SF Pro Text", -apple-system, sans-serif;
  --slide-mono: "SF Mono", Menlo, monospace;
  box-sizing: border-box; width: 1280px; height: 720px; position: relative;
  padding: 60px 72px 52px; display: flex; flex-direction: column;
  background: var(--slide-bg); color: var(--slide-ink);
  font-family: var(--slide-body); font-size: 24px; line-height: 1.45;
}
section { justify-content: flex-start; }
section h1 { font-family: var(--slide-display); font-size: 66px; line-height: 1.05; letter-spacing: -.02em; margin: 0; }
section h2 { font-family: var(--slide-display); font-size: 38px; line-height: 1.12; letter-spacing: -.015em; margin: 0; }
section h3 { font-family: var(--slide-display); font-size: 26px; line-height: 1.25; margin: 0 0 10px; }
section p { margin: 0; }
section p + p { margin-top: 10px; }
section strong { font-weight: 700; }
section ul, section ol { margin: 14px 0 0; padding-left: 22px; }
section li { margin-bottom: 8px; }
section::after { color: var(--slide-muted); font-family: var(--slide-mono); font-size: 15px; }
section .slide-kicker {
  font-family: var(--slide-mono); font-size: 14px; letter-spacing: .16em;
  text-transform: uppercase; color: var(--slide-muted); margin-bottom: 16px;
}
/* The last paragraph of a page is its footnote — the same convention
   Notebookcheck and the writing route already use for a source line. */
section p:last-child { margin-top: auto; padding-top: 14px; border-top: 2px solid var(--slide-rule-strong); color: var(--slide-muted); font-size: 16px; }

/* cover */
section.cover { justify-content: flex-end; }
section.cover h1 { font-size: 82px; }
section.cover p { font-size: 27px; color: var(--slide-muted); margin-top: 18px; max-width: 18em; }
section.cover p:last-child { font-size: 16px; border-top: 2px solid var(--slide-ink); max-width: none; }

/* lead */
section.lead { justify-content: center; }
section.lead h2 { font-size: 46px; line-height: 1.2; max-width: 16em; letter-spacing: -.01em; }

/* divider */
section.divider { justify-content: center; }
section.divider p { font-family: var(--slide-mono); font-size: 92px; line-height: 1; color: var(--slide-muted); margin: 0; }
section.divider p:last-child { border: 0; padding: 0; font-size: 92px; }
section.divider h2 { font-size: 54px; margin-top: 12px; }

/* statement */
section.statement { justify-content: center; align-items: center; text-align: center; }
section.statement h2 { font-size: 48px; line-height: 1.3; max-width: 20em; letter-spacing: -.01em; }
section.statement p:last-child { border: 0; padding: 0; font-size: 17px; margin-top: 24px; }

/* quote */
section.quote { justify-content: center; }
section.quote blockquote { margin: 0; font-family: var(--slide-display); font-size: 40px; line-height: 1.3; max-width: 16em; border: 0; padding: 0; }
section.quote p { margin-top: 26px; font-size: 18px; }
section.quote p:last-child { border: 0; padding: 0; margin-top: 26px; }

/* contrast · two columns of one table, the right one on the ink ground */
section.contrast { justify-content: center; }
section.contrast table { margin-top: 26px; width: 100%; table-layout: fixed; }
section.contrast th, section.contrast td { border: 0; padding: 18px 22px; text-align: center; font-family: var(--slide-display); font-variant-numeric: tabular-nums; }
section.contrast th { font-size: 30px; font-weight: 600; }
section.contrast td { font-size: 84px; line-height: 1.05; letter-spacing: -.02em; }
section.contrast td:nth-child(2), section.contrast th:nth-child(2) { background: var(--slide-ink); color: var(--slide-bg); }
/* On the ink ground the emphasised column turns to paper; ink on ink said
   nothing about which side is the point. */
section.contrast.dark td:nth-child(2), section.contrast.dark th:nth-child(2) { background: var(--slide-bg); color: var(--slide-ink); }
section.contrast p:last-child { border-top-color: var(--slide-rule-strong); }

/* duo-compare · a two-column table, the divider drawn between the columns */
section.duo-compare table { margin-top: 26px; }
section.duo-compare th { font-size: 22px; }
section.duo-compare td { font-family: var(--slide-display); font-variant-numeric: tabular-nums; font-size: 40px; }
section.duo-compare th + th, section.duo-compare td + td { border-left: 1px solid var(--slide-rule-strong); padding-left: 34px; }

/* columns */
section.columns { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: min-content; column-gap: 46px; align-content: start; }
section.columns h1, section.columns h2, section.columns > p:first-child { grid-column: 1 / -1; }
section.columns h3 { border-top: 3px solid var(--slide-ink); padding-top: 16px; margin-top: 26px; }
section.columns p:last-child { grid-column: 1 / -1; }

/* metric · a list of numbers; the first one leads */
section.metric ul { display: flex; gap: 34px; margin-top: 30px; padding: 0; list-style: none; }
section.metric li { flex: 1; border-top: 2px solid var(--slide-rule); padding-top: 14px; margin: 0; }
section.metric li strong { display: block; font-family: var(--slide-display); font-variant-numeric: tabular-nums; font-size: 44px; line-height: 1.1; letter-spacing: -.02em; }
section.metric li:first-child { flex: 1.35; border-top: 3px solid var(--slide-ink); }
section.metric li:first-child strong { font-size: 80px; white-space: nowrap; }

/* evidence · the figure, then the sentence that reads it */
section.evidence img { max-height: 46%; max-width: 100%; margin: 22px 0 0; }
section.evidence > p { margin-top: 18px; border-left: 2px solid var(--slide-rule-strong); padding-left: 22px; font-size: 21px; max-width: 62ch; }
section.evidence p:last-child { border-left: 0; border-top: 2px solid var(--slide-rule-strong); padding-left: 0; font-size: 16px; }

/* table */
section.table table { width: 100%; border-collapse: collapse; margin-top: 22px; font-size: 20px; }
section.table th, section.table td { text-align: left; padding: 12px 10px; border-bottom: 1px solid var(--slide-rule-strong); }
section.table th { font-family: var(--slide-mono); font-size: 14px; letter-spacing: .12em; text-transform: uppercase; color: var(--slide-muted); border-bottom: 2px solid var(--slide-ink); }
section.table td + td { font-family: var(--slide-mono); }
section.table p:last-child { border-top: 2px solid var(--slide-ink); font-size: 21px; color: var(--slide-ink); }

/* timeline · one list, one node per item */
section.timeline ul { display: flex; margin: 52px 0 0; padding: 0; list-style: none; }
section.timeline li { flex: 1; padding: 20px 24px 0 0; border-top: 2px solid var(--slide-ink); margin: 0; position: relative; font-size: 21px; }
section.timeline li::before { content: ""; position: absolute; top: -7px; left: 0; width: 12px; height: 12px; border-radius: 50%; background: var(--slide-ink); }
section.timeline li strong { display: block; font-family: var(--slide-mono); font-size: 16px; font-weight: 400; color: var(--slide-muted); margin-bottom: 8px; }
section.era-classic.timeline li::before { border-radius: 0; }

/* image-grid · the images of one paragraph share the row at one ratio */
section.image-grid p img { width: 32%; margin-right: 1.6%; aspect-ratio: 16 / 10; object-fit: cover; background: var(--slide-tint); }
section.image-grid p:last-child { border-top: 2px solid var(--slide-rule-strong); }

/* ledger */
section.ledger h3 { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--slide-rule-strong); font-family: var(--slide-mono); font-size: 15px; letter-spacing: .1em; text-transform: uppercase; color: var(--slide-muted); }
section.ledger h3:first-of-type { margin-top: 24px; }
section.ledger table { margin-top: 4px; }
section.ledger th, section.ledger td { text-align: left; padding: 6px 0; border: 0; font-size: 21px; }
section.ledger td + td { font-family: var(--slide-mono); }
section.ledger thead { display: none; }
section.ledger p:last-child { border-top: 2px solid var(--slide-rule-strong); }

/* takeaway */
section.takeaway ol { margin: 24px 0 0; padding: 0; list-style: none; counter-reset: slide-point; }
section.takeaway li { counter-increment: slide-point; display: flex; gap: 20px; align-items: baseline; padding: 15px 0; border-bottom: 1px solid var(--slide-rule-strong); font-size: 27px; }
section.takeaway li::before { content: counter(slide-point, decimal-leading-zero); font-family: var(--slide-mono); font-size: 17px; color: var(--slide-muted); }

/* closing */
section.closing { justify-content: center; }
section.closing h2 { font-size: 44px; line-height: 1.2; max-width: 26ch; }
section.closing p:last-child { border: 0; padding: 0; margin-top: 30px; font-size: 18px; }

/* dark surface: the same structure on the ink ground of the era */
section.dark { background: var(--slide-ink); color: var(--slide-bg); }
section.dark p:last-child { border-top-color: var(--slide-bg); color: var(--slide-bg); }
section.dark th, section.dark td { border-color: var(--slide-bg); }
section.dark .slide-kicker { color: var(--slide-bg); }`;
}

function slideThemeCss(eraId) {
  const era = slideEraById(eraId) || slideEraById("big-sur");
  return [
    "/* clio-slide-theme: " + era.id + " */",
    slideLayoutCss(),
    slideEraTokensCss(era),
    (era.delta || "").trim(),
  ].join("\n").trimEnd() + "\n";
}

// ClioStage renders one <section class="clio-stage-slide-frame …"> per page, so
// the deck's own CSS reaches it by prefixing every `section` selector. Rules
// that do not start with `section` are left out rather than leaking app-wide.
const SLIDE_SCOPE_PASSTHROUGH = /^@(media|supports|page|font-face|keyframes|-webkit-keyframes)\b/i;

// `dropContainers` is for ClioStage, whose frame already owns the box and the
// scroll: there the deck's page geometry and its page-level flex/grid would
// fight the shell, so those declarations are removed and the composition is
// approximated. The printed sheet and an external Marp render use the untouched
// CSS, so what leaves the desk is exact.
const SLIDE_SCOPE_DROP = /(?:^|;)\s*(?:width|height|padding|padding-top|padding-bottom|padding-left|padding-right|display|flex|flex-direction|justify-content|align-items|grid-template-columns|grid-auto-rows|column-gap|align-content|box-sizing)\s*:[^;}]*/gi;

function scopeSlideCss(css, scopeSelector, options = {}) {
  const text = String(css || "");
  const scope = String(scopeSelector || ".clio-stage-slide-frame");
  const dropContainers = options && options.dropContainers === true;
  const out = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("{", index);
    if (open < 0) break;
    const selector = text.slice(index, open).trim();
    let depth = 1;
    let cursor = open + 1;
    while (cursor < text.length && depth > 0) {
      const char = text[cursor];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      cursor += 1;
    }
    const isBase = !selector || selector === "section";
    const rawBody = text.slice(open + 1, depth === 0 ? cursor - 1 : cursor);
    const body = dropContainers && isBase ? rawBody.replace(SLIDE_SCOPE_DROP, "") : rawBody;
    if (!selector) {
      out.push(body);
    } else if (SLIDE_SCOPE_PASSTHROUGH.test(selector)) {
      out.push(`${selector}{${body}}`);
    } else {
      const scoped = selector
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.startsWith("section"))
        .map((part) => `${scope}${part.slice("section".length)}`);
      if (scoped.length) out.push(`${scoped.join(", ")}{${body}}`);
    }
    index = cursor;
  }
  return out.join("\n");
}

// --- the deck spec ---------------------------------------------------------
// A deck carries one <!-- clio-deck: {...} --> block. It is the plan artifact:
// repairs locate their owning layer from it, and the gates read it.

const CLIO_DECK_PATTERN = /^\s*<!--\s*clio-deck\s*:\s*(\{[\s\S]*?\})\s*-->\s*$/i;

function slideDeckDefaultSpec() {
  return { mode: "briefing", era: "big-sur", canvas: "16:9", reading: "balanced" };
}

function slideDeckSpecLine(spec) {
  const value = { ...slideDeckDefaultSpec(), ...(spec || {}) };
  const clean = {};
  Object.keys(value).sort().forEach((key) => {
    if (value[key] === null || value[key] === undefined || value[key] === "") return;
    clean[key] = value[key];
  });
  return `<!-- clio-deck: ${JSON.stringify(clean)} -->`;
}

// The spec line arrives inside a file, so it is data. The reader above hands it
// back as written, because the structure gate has to name an unknown era rather
// than guess one; anything that renders a deck asks this instead, where each
// closed field keeps a value this module knows or falls back to the default.
// The era in particular reaches class names and the print sheet's markup, where
// anything else would be an injection rather than an appearance.
function slideDeckCleanSpec(parsed) {
  const spec = { ...slideDeckDefaultSpec(), ...parsed };
  const fallback = slideDeckDefaultSpec();
  if (!slideEraById(spec.era)) spec.era = fallback.era;
  if (!SLIDE_HEIGHTS.includes(spec.canvas)) spec.canvas = fallback.canvas;
  if (!DECK_MODES.some((mode) => mode.id === spec.mode)) spec.mode = fallback.mode;
  if (!SLIDE_READING_MODES.some((mode) => mode.id === spec.reading)) spec.reading = fallback.reading;
  return spec;
}

function slideDeckParseSpec(markdown) {
  const lines = String(markdown || "").split(/\r\n|\r|\n/);
  for (const line of lines) {
    const match = line.match(CLIO_DECK_PATTERN);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === "object") return { ...slideDeckDefaultSpec(), ...parsed };
    } catch (error) {
      return { ...slideDeckDefaultSpec(), _invalid: match[1] };
    }
  }
  return null;
}

function slideDeckBody(markdown) {
  return String(markdown || "")
    .split(/\r\n|\r|\n/)
    .filter((line) => !CLIO_DECK_PATTERN.test(line))
    .join("\n");
}

// --- reading a deck page by page ------------------------------------------

function slideDeckSplitPages(markdown) {
  const lines = String(markdown || "").split(/\r\n|\r|\n/);
  let body = lines;
  if (lines[0] && lines[0].trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === "---") { body = lines.slice(index + 1); break; }
    }
  }
  const pages = [];
  let current = [];
  let inFence = false;
  let fenceChar = "";
  const push = () => { pages.push(current.join("\n").trim()); current = []; };
  body.forEach((line) => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) { inFence = true; fenceChar = fence[1][0]; }
      else if (fence[1][0] === fenceChar) inFence = false;
      current.push(line);
      return;
    }
    if (!inFence && line.trim() === "---") { push(); return; }
    current.push(line);
  });
  push();
  return pages;
}

function slideDeckDirective(page, name) {
  const pattern = new RegExp(`<!--\\s*${name}\\s*:\\s*([\\s\\S]*?)\\s*-->`, "i");
  const match = String(page || "").match(pattern);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function slideDeckImages(page) {
  const sources = [];
  const pattern = /!\[[^\]]*\]\(([^)\s]+)/g;
  let match = pattern.exec(String(page || ""));
  while (match) { sources.push(match[1]); match = pattern.exec(page); }
  return sources;
}

// The page's `_class` line carries layout and surface: `<!-- _class: evidence dark -->`.
function slideDeckPageClasses(page) {
  const raw = slideDeckDirective(page, "_class");
  if (!raw) return { layout: "", surface: "", extra: [] };
  const names = raw.split(/\s+/).map((name) => name.trim()).filter(Boolean);
  const layout = names.find((name) => !!slideLayoutById(name)) || "";
  const surface = names.find((name) => ["hero", "light", "dark"].includes(name)) || "";
  return { layout, surface, extra: names.filter((name) => name !== layout && name !== surface) };
}

function slideDeckPages(markdown) {
  return slideDeckSplitPages(slideDeckBody(markdown))
    .map((page, index) => {
      const classes = slideDeckPageClasses(page);
      const layout = classes.layout ? slideLayoutById(classes.layout) : null;
      return {
        index: index + 1,
        page,
        layout: classes.layout,
        surface: classes.surface || (layout ? layout.surface : ""),
        extraClasses: classes.extra,
        job: slideDeckDirective(page, "job"),
        notes: slideDeckDirective(page, "notes"),
        header: slideDeckDirective(page, "header"),
        images: slideDeckImages(page),
        empty: !page.trim(),
      };
    });
}

// --- gates -----------------------------------------------------------------

const SLIDE_METRIC_FLOOR_CACHE = new WeakMap();

function slideDeckReadingMode(spec) {
  const id = spec && spec.reading;
  return SLIDE_READING_MODES.find((mode) => mode.id === id) || SLIDE_READING_MODES[1];
}

// Structural gate. `strict` is the AI-generation path: there a broken rhythm or
// an unknown class is an error the repair loop must fix; an imported deck only
// gets a warning, because the writer's file is not ours to reject.
function validateSlideDeck(markdown, options = {}) {
  const strict = !!options.strict;
  const errors = [];
  const warnings = [];
  const spec = slideDeckParseSpec(markdown);
  const pages = slideDeckPages(markdown);
  const pages0 = pages.filter((page) => !page.empty);
  const era = spec ? slideEraById(spec.era) : null;
  const mode = spec ? slideModeById(spec.mode) : null;

  if (spec && spec._invalid !== undefined) errors.push("deck_spec_unparsable");
  if (spec && !era) errors.push(`unknown_era:${spec.era}`);
  if (spec && !mode) errors.push(`unknown_mode:${spec.mode}`);
  if (spec && !SLIDE_HEIGHTS.includes(spec.canvas)) errors.push(`unknown_canvas:${spec.canvas}`);
  if (spec && !SLIDE_READING_MODES.some((mode) => mode.id === spec.reading)) errors.push(`unknown_reading:${spec.reading}`);

  const unknownLayouts = new Set();
  pages0.forEach((page) => {
    const classes = slideDeckDirective(page.page, "_class")
      .split(/\s+/)
      .map((name) => name.trim())
      .filter(Boolean);
    classes.forEach((name) => {
      if (["hero", "light", "dark"].includes(name)) return;
      if (!slideLayoutById(name)) unknownLayouts.add(name);
    });
    if (!page.layout) warnings.push(`missing_layout:${page.index}`);
  });
  if (unknownLayouts.size) {
    const list = [...unknownLayouts].join(",");
    (strict ? errors : warnings).push(`unknown_layout:${list}`);
  }

  if (pages0.length && spec && mode) {
    const first = pages0[0];
    if (first.layout && !["cover", "lead"].includes(first.layout)) {
      (strict ? errors : warnings).push(`first_page_not_hero:${first.layout}`);
    }
    if (mode.affinity.length && !mode.affinity.includes(first.layout)) {
      (strict ? errors : warnings).push(`mode_layout_mismatch:${mode.id}:${first.layout}`);
    }
    const offMode = pages0
      .filter((page) => page.layout && !mode.affinity.includes(page.layout))
      .map((page) => `${page.index}:${page.layout}`);
    if (offMode.length > Math.max(1, Math.floor(pages0.length / 3))) {
      (strict ? errors : warnings).push(`mode_layout_drift:${offMode.slice(0, 6).join(",")}`);
    }

    // Rhythm: no more than two consecutive pages on the same surface, one hero
    // per four pages, and a dark page once a deck is long enough to need air.
    let run = 0;
    let previous = "";
    pages0.forEach((page) => {
      const surface = page.surface || "light";
      run = surface === previous ? run + 1 : 1;
      previous = surface;
      if (run > 2) (strict ? errors : warnings).push(`surface_run:${page.index}:${surface}`);
    });
    const heroes = pages0.filter((page) => (page.surface || "") === "hero").length;
    if (heroes < Math.ceil(pages0.length / 4)) {
      (strict ? errors : warnings).push(`too_few_heroes:${heroes}/${pages0.length}`);
    }
    if (pages0.length >= 8 && !pages0.some((page) => (page.surface || "") === "dark")) {
      (strict ? errors : warnings).push("no_dark_surface");
    }
  }

  return { ok: errors.length === 0, errors, warnings, spec, pages: pages0, era, mode };
}

// Carrier receipt: what each page actually carries, taken from the text rather
// than from what a prompt intended.
function slideDeckCarrierReceipt(markdown) {
  const spec = slideDeckParseSpec(markdown);
  return slideDeckPages(markdown)
    .filter((page) => !page.empty)
    .map((page) => ({
      page: page.index,
      layout: page.layout || "(none)",
      surface: page.surface || "(none)",
      era: spec ? spec.era : "(none)",
      job: page.job || "",
      notes: page.notes ? "yes" : "",
      images: page.images,
      classes: page.extraClasses,
    }));
}

// Font floor: the reading mode decides the smallest body text a page may use.
function slideDeckFontFloor(spec) {
  const mode = slideDeckReadingMode(spec);
  return { body: mode.body, meta: mode.meta, id: mode.id };
}

function slideDeckMeasureFailures(frames, spec) {
  const floor = slideDeckFontFloor(spec);
  const results = [];
  Array.from(frames || []).forEach((frame, index) => {
    if (!frame || typeof frame.querySelectorAll !== "function") return;
    const surface = frame.querySelector(".clio-stage-slide-stage") || frame;
    const available = surface.clientHeight;
    const body = frame.querySelector(".clio-stage-slide-body") || surface;
    const overflow = Math.max(0, Math.round((body.scrollHeight || 0) - available));
    const active = Math.min(body.scrollHeight || 0, available);
    const whitespace = Math.max(0, Math.round(available - active));
    let smallest = Infinity;
    frame.querySelectorAll("p, li, td, blockquote, h1, h2, h3, figcaption").forEach((node) => {
      const size = parseFloat(window.getComputedStyle(node).fontSize) || 0;
      if (size > 0) smallest = Math.min(smallest, size);
    });
    const scale = frame.dataset?.clioFitScale ? parseFloat(frame.dataset.clioFitScale) : 1;
    const effective = Number.isFinite(smallest) ? Math.round(smallest * (Number.isFinite(scale) ? scale : 1)) : 0;
    results.push({
      page: index + 1,
      overflow,
      whitespace,
      fontSize: effective,
      belowFloor: effective > 0 && effective < floor.body,
      repair: overflow > 160 ? "layout" : overflow > 90 ? "title" : overflow > 40 ? "spacing" : overflow > 0 ? "nudge" : "",
    });
  });
  return results;
}

// The deck's own print sheet: one page per slide, the era's CSS verbatim, the
// deck title and page number in the footer. Animations are replaced by their
// final state, which is what a PDF is.
const SLIDE_PRINT_SIZES = {
  "16:9": { css: "338.7mm 190.5mm", width: 338.7, height: 190.5 },
  "4:3": { css: "254mm 190.5mm", width: 254, height: 190.5 },
};

function slideDeckPrintHtml({ title, markdown, spec }) {
  const resolved = slideDeckCleanSpec(spec || slideDeckParseSpec(markdown) || {});
  const size = SLIDE_PRINT_SIZES[resolved.canvas] || SLIDE_PRINT_SIZES["16:9"];
  const pages = slideDeckSplitPages(slideDeckBody(markdown)).filter((page) => page.trim());
  const css = slideThemeCss(resolved.era);
  const frames = pages.map((page, index) => {
    const classes = slideDeckPageClasses(page);
    const surface = classes.surface || (classes.layout ? (slideLayoutById(classes.layout) || {}).surface : "");
    const body = page
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const footer = `<footer class="slide-print-foot"><span>${escapeHtml(title || "")}</span><span>${index + 1} / ${pages.length}</span></footer>`;
    // The footer goes first and out of the flow: appended last with
    // margin-top:auto it took the page's free space, so every layout's own
    // alignment (cover low, lead and statement centred) collapsed to the top,
    // and the page's real last paragraph lost its footnote rule.
    return `<section class="clio-print-page era-${escapeHtml(resolved.era)} ${escapeHtml(classes.layout)} ${escapeHtml(surface)}">${footer}${markdownToSystemHtml(body)}</section>`;
  }).join("\n");
  const lang = currentLanguage === "zh" ? "zh-Hans" : "en";
  const bodyClass = `era-${escapeHtml(resolved.era)}`;
  const fontStack = (slideEraById(resolved.era) || {}).tokens;
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title || "")}</title>
  <style>
    @page { size: ${size.css}; margin: 0; }
    html, body { margin: 0; background: #6f6f74; }
    body { font-family: ${fontStack ? fontStack.body : "sans-serif"}; }
    ${css}
    section.clio-print-page { margin: 0 auto; box-shadow: 0 10px 26px rgba(0,0,0,.35); position: relative; }
    section.clio-print-page .slide-print-foot {
      position: absolute; left: 72px; right: 72px; bottom: 18px;
      display: flex; justify-content: space-between; font-family: var(--slide-mono);
      font-size: 13px; color: var(--slide-muted);
    }
    section.clio-print-page.dark .slide-print-foot { color: var(--slide-bg); opacity: .7; }
    @media screen {
      body { padding: 26px 0; }
      section.clio-print-page { margin-bottom: 26px; }
    }
    @media print {
      html, body { background: #fff; padding: 0; }
      section.clio-print-page { break-after: page; page-break-after: always; box-shadow: none; margin: 0; }
      section.clio-print-page:last-child { break-after: auto; page-break-after: auto; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body class="${bodyClass}">
${frames}
</body>
</html>`;
}

// --- the frontmatter the generator writes -----------------------------------

function slideDeckFrontmatter(specInput) {
  const spec = { ...slideDeckDefaultSpec(), ...(specInput || {}) };
  const era = slideEraById(spec.era) || slideEraById("big-sur");
  const style = slideThemeCss(era.id)
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
  return [
    "---",
    "marp: true",
    "theme: default",
    `class: era-${era.id}`,
    "paginate: true",
    `size: ${spec.canvas === "4:3" ? "4:3" : "16:9"}`,
    "style: |",
    style.trimEnd(),
    "---",
    "",
    slideDeckSpecLine(spec),
  ].join("\n");
}

// Drops one YAML block (`key:` and its indented body) from frontmatter lines.
function slideDeckDropBlock(rows, key) {
  const out = [];
  let dropping = false;
  rows.forEach((line) => {
    if (new RegExp(`^${key}\\s*:`, "i").test(line)) { dropping = true; return; }
    if (dropping) {
      if (/^\S/.test(line)) dropping = false;
      else return;
    }
    out.push(line);
  });
  return out;
}

// The restyle route: change what a deck is, never what it says. Frontmatter
// keys the writer or the model added (header, footer, a custom theme) survive;
// the era class, the stylesheet it carries and the spec line are replaced.
function slideDeckRestyle(markdown, specInput) {
  const spec = { ...slideDeckDefaultSpec(), ...(specInput || {}) };
  const text = String(markdown || "").replace(/\r\n/g, "\n").trimEnd();
  const lines = text.split("\n");
  let frontmatterEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === "---") { frontmatterEnd = index; break; }
    }
  }
  if (frontmatterEnd < 0) {
    const body = lines.filter((line) => !CLIO_DECK_PATTERN.test(line)).join("\n").replace(/^\n+/, "");
    return `${slideDeckFrontmatter(spec)}\n\n${body}`.trimEnd() + "\n";
  }
  let head = lines.slice(0, frontmatterEnd + 1);
  const hadMarpTrue = /^marp\s*:\s*true\s*$/im.test(head.join("\n"));
  head = slideDeckDropBlock(head, "class");
  head = slideDeckDropBlock(head, "style");
  const identity = [
    `class: era-${spec.era}`,
    "style: |",
    ...slideThemeCss(spec.era).split("\n").map((line) => (line ? `  ${line}` : line)),
  ];
  const sizeIndex = head.findIndex((line) => /^size\s*:/i.test(line));
  const anchor = sizeIndex >= 0 ? sizeIndex : head.findIndex((line) => /^paginate\s*:/i.test(line));
  if (anchor >= 0) head.splice(anchor + 1, 0, ...identity);
  else head.splice(head.length - 1, 0, ...identity);
  if (!hadMarpTrue) head.splice(1, 0, "marp: true");
  const body = lines.slice(frontmatterEnd + 1)
    .filter((line) => !CLIO_DECK_PATTERN.test(line))
    .join("\n")
    .replace(/^\n+/, "");
  return `${head.join("\n")}\n${slideDeckSpecLine(spec)}\n\n${body}`.trimEnd() + "\n";
}

function slideDeckIndex() {
  return {
    eras: SLIDE_ERAS.map((era) => ({
      id: era.id, label: era.label, year: era.year, family: era.family,
      hint: era.hint, hintEn: era.hintEn,
    })),
    layouts: SLIDE_LAYOUTS.map((layout) => ({ ...layout })),
    modes: DECK_MODES.map((mode) => ({
      id: mode.id, zh: mode.zh, en: mode.en, hint: mode.hint, hintEn: mode.hintEn,
      titleRule: mode.titleRule, titleRuleEn: mode.titleRuleEn, affinity: mode.affinity,
    })),
    readingModes: SLIDE_READING_MODES.map((mode) => ({ ...mode })),
    canvases: SLIDE_HEIGHTS.slice(),
  };
}

// --- the one dialog a deck may open ----------------------------------------
// Two questions the desk cannot invent (how the deck argues; how the page will
// be read) plus the era, which is shown as real miniature slides instead of a
// list of names. The choice is remembered, so the second deck costs one Enter.

const SLIDE_SETUP_STORAGE_KEY = "ai-system-6-deck-setup";

// The dialog is built on demand rather than parked in index.html: the shell's
// payload is a permanent budget, and a surface that only exists while a deck is
// being made has no business in it.
function slideDeckEnsureSetupDialog() {
  let dialog = document.querySelector("#clio-deck-setup-modal");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "clio-deck-setup-modal";
  dialog.className = "finder-operation-modal app-input-modal";
  dialog.innerHTML = `
    <form method="dialog">
      <section class="finder-operation-body">
        <h2 id="clio-deck-setup-title"></h2>
        <p id="clio-deck-setup-lede" class="finder-operation-lede"></p>
        <fieldset style="border:0;padding:0;margin:0 0 14px">
          <legend id="clio-deck-setup-mode-legend"></legend>
          <div id="clio-deck-setup-modes" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px"></div>
        </fieldset>
        <fieldset style="border:0;padding:0;margin:0 0 14px">
          <legend id="clio-deck-setup-era-legend"></legend>
          <div id="clio-deck-setup-eras" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px"></div>
        </fieldset>
        <fieldset style="border:0;padding:0;margin:0">
          <legend id="clio-deck-setup-reading-legend"></legend>
          <div id="clio-deck-setup-reading" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px"></div>
          <div id="clio-deck-setup-canvas" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px"></div>
        </fieldset>
        <p id="clio-deck-setup-floor" class="finder-operation-lede"></p>
      </section>
      <div class="button-row finder-operation-actions">
        <button class="btn" value="cancel" id="clio-deck-setup-cancel">Cancel</button>
        <button class="btn default" value="ok" id="clio-deck-setup-ok">OK</button>
      </div>
    </form>`;
  document.body.append(dialog);
  return dialog;
}

function slideDeckStoredSetup() {
  try {
    const raw = window.localStorage?.getItem(SLIDE_SETUP_STORAGE_KEY);
    if (!raw) return slideDeckDefaultSpec();
    const parsed = JSON.parse(raw);
    return { ...slideDeckDefaultSpec(), ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch (error) {
    return slideDeckDefaultSpec();
  }
}

function slideDeckSaveSetup(spec) {
  try {
    window.localStorage?.setItem(SLIDE_SETUP_STORAGE_KEY, JSON.stringify(spec));
  } catch (error) {
    /* a desk that cannot remember a preference still gets a deck */
  }
}

// Every era's rules, scoped to the dialog's preview box. The shared layout CSS
// is emitted once and each era only adds its tokens and material delta.
function slideDeckPreviewCss() {
  const parts = [scopeSlideCss(slideLayoutCss(), ".clio-deck-preview")];
  SLIDE_ERAS.forEach((era) => {
    parts.push(scopeSlideCss(slideEraTokensCss(era), ".clio-deck-preview"));
    if (era.delta) parts.push(scopeSlideCss(era.delta, ".clio-deck-preview"));
  });
  return parts.join("\n");
}

const SLIDE_PREVIEW_SAMPLE = {
  zh: { kicker: "实测 · 第 3 天", title: "风扇第一次转起来", row: [["续航", "17.2 h"], ["跑分", "1070"], ["噪音", "34.5 dB"]], foot: "数据：本机实测" },
  en: { kicker: "Day three", title: "The fan turned on", row: [["Battery", "17.2 h"], ["Score", "1070"], ["Noise", "34.5 dB"]], foot: "Measured on this machine" },
};

function slideDeckPreviewSample(era, zh) {
  const sample = zh ? SLIDE_PREVIEW_SAMPLE.zh : SLIDE_PREVIEW_SAMPLE.en;
  const metrics = sample.row.map(([label, value]) => (
    `<li><strong>${escapeHtml(value)}</strong> ${escapeHtml(label)}</li>`
  )).join("");
  return `<div style="width:206px;height:116px;overflow:hidden;background:#fff">
    <section class="clio-deck-preview era-${era.id} metric" style="transform:scale(.1609);transform-origin:top left;width:1280px;height:720px">
      <p class="slide-kicker">${escapeHtml(sample.kicker)}</p>
      <h2>${escapeHtml(sample.title)}</h2>
      <ul>${metrics}</ul>
      <p>${escapeHtml(sample.foot)}</p>
    </section>
  </div>`;
}

function slideDeckChooseSetup() {
  const zh = typeof currentLanguage !== "undefined" && currentLanguage === "zh";
  const copy = zh ? {
    title: "做一份 deck",
    lede: "两个问题决定它怎么说话、给谁看；选完就能改，下次会记住。",
    modeLegend: "这一份要让读者先拿到什么？",
    eraLegend: "用哪个时代的样子？",
    readingLegend: "正文按哪种距离排？",
    canvasLegend: "画布",
    floor: (mode) => `正文下限 ${mode.body}px，注解 ${mode.meta}px。放不下就拆页，不缩字。`,
    ok: "开始", cancel: "取消",
  } : {
    title: "Make a deck",
    lede: "Two questions decide how it argues and who reads it. Changeable later; remembered next time.",
    modeLegend: "What should the reader get first?",
    eraLegend: "Which era should it look like?",
    readingLegend: "How close is the page read?",
    canvasLegend: "Canvas",
    floor: (mode) => `Body floor ${mode.body}px, annotations ${mode.meta}px. Split the page rather than shrink the type.`,
    ok: "Make it", cancel: "Cancel",
  };

  const dialog = slideDeckEnsureSetupDialog();
  const stored = slideDeckStoredSetup();
  if (!dialog) return Promise.resolve({ ...stored, remembered: true });

  const setText = (selector, text) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };
  setText("#clio-deck-setup-title", copy.title);
  setText("#clio-deck-setup-lede", copy.lede);
  setText("#clio-deck-setup-mode-legend", copy.modeLegend);
  setText("#clio-deck-setup-era-legend", copy.eraLegend);
  setText("#clio-deck-setup-reading-legend", copy.readingLegend);
  setText("#clio-deck-setup-ok", copy.ok);
  setText("#clio-deck-setup-cancel", copy.cancel);

  let style = document.querySelector("#clio-deck-setup-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "clio-deck-setup-style";
    document.head.append(style);
  }
  style.textContent = slideDeckPreviewCss();

  const modesHost = document.querySelector("#clio-deck-setup-modes");
  if (modesHost && !modesHost.dataset.ready) {
    modesHost.dataset.ready = "true";
    modesHost.innerHTML = DECK_MODES.map((mode) => `
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px">
        <input type="radio" name="clio-deck-mode" value="${mode.id}" />
        <span><b>${escapeHtml(zh ? mode.zh : mode.en)}</b><br /><span style="color:#5b5b60">${escapeHtml(zh ? mode.hint : mode.hintEn)}</span></span>
      </label>`).join("");
  }
  const erasHost = document.querySelector("#clio-deck-setup-eras");
  erasHost.innerHTML = SLIDE_ERAS.map((era) => `
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;cursor:pointer">
      <input type="radio" name="clio-deck-era" value="${era.id}" />
      <span>${escapeHtml(era.label)} · ${era.year}</span>
      ${slideDeckPreviewSample(era, zh)}
      <span style="color:#5b5b60">${escapeHtml(zh ? era.hint : era.hintEn)}</span>
    </label>`).join("");

  const readingHost = document.querySelector("#clio-deck-setup-reading");
  if (readingHost && !readingHost.dataset.ready) {
    readingHost.dataset.ready = "true";
    readingHost.innerHTML = SLIDE_READING_MODES.map((mode) => `
      <label style="display:flex;gap:6px;align-items:center;font-size:13px">
        <input type="radio" name="clio-deck-reading" value="${mode.id}" />
        <span>${escapeHtml(zh ? mode.zh : mode.en)} · ${mode.body}px</span>
      </label>`).join("");
  }
  const canvasHost = document.querySelector("#clio-deck-setup-canvas");
  if (canvasHost && !canvasHost.dataset.ready) {
    canvasHost.dataset.ready = "true";
    canvasHost.innerHTML = SLIDE_HEIGHTS.map((height) => `
      <label style="display:flex;gap:6px;align-items:center;font-size:13px">
        <input type="radio" name="clio-deck-canvas" value="${height}" /><span>${height}</span>
      </label>`).join("");
  }

  const check = (name, value) => {
    const input = dialog.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  check("clio-deck-mode", slideModeById(stored.mode) ? stored.mode : "briefing");
  check("clio-deck-era", slideEraById(stored.era) ? stored.era : "big-sur");
  check("clio-deck-reading", slideDeckReadingMode(stored).id);
  check("clio-deck-canvas", SLIDE_HEIGHTS.includes(stored.canvas) ? stored.canvas : "16:9");

  const floorNote = () => {
    const chosen = dialog.querySelector('input[name="clio-deck-reading"]:checked');
    const mode = slideDeckReadingMode({ reading: chosen ? chosen.value : "balanced" });
    setText("#clio-deck-setup-floor", copy.floor(mode));
  };
  dialog.querySelectorAll('input[name="clio-deck-reading"]').forEach((input) => {
    input.addEventListener("change", floorNote);
  });
  floorNote();

  if (typeof closeMenus === "function") closeMenus();
  if (typeof modalScrim !== "undefined" && modalScrim) modalScrim.classList.remove("is-hidden");

  return new Promise((resolve) => {
    const finish = () => {
      dialog.removeEventListener("close", finish);
      if (dialog.returnValue !== "ok") { resolve(null); return; }
      const value = (name, fallback) => {
        const input = dialog.querySelector(`input[name="${name}"]:checked`);
        return input && input.value ? input.value : fallback;
      };
      const next = {
        mode: value("clio-deck-mode", stored.mode),
        era: value("clio-deck-era", stored.era),
        reading: value("clio-deck-reading", stored.reading),
        canvas: value("clio-deck-canvas", stored.canvas),
      };
      slideDeckSaveSetup(next);
      resolve(next);
    };
    dialog.addEventListener("close", finish);
    document.body.classList.add("has-system-modal");
    dialog.showModal();
    const ok = document.querySelector("#clio-deck-setup-ok");
    if (typeof wireDialogEnterDefault === "function") wireDialogEnterDefault(dialog, () => ok);
    else ok?.focus();
  });
}

window.AISystem6SlideThemes = {
  eraList: () => SLIDE_ERAS.map((era) => ({ ...era, tokens: { ...era.tokens } })),
  layoutList: () => SLIDE_LAYOUTS.map((layout) => ({ ...layout })),
  modeList: () => DECK_MODES.map((mode) => ({ ...mode, affinity: mode.affinity.slice() })),
  readingModes: () => SLIDE_READING_MODES.map((mode) => ({ ...mode })),
  index: slideDeckIndex,
  markdownContract: () => ({ ...SLIDE_LAYOUT_MARKDOWN }),
  byId: slideEraById,
  cssFor: slideThemeCss,
  scopeCss: scopeSlideCss,
  defaultSpec: slideDeckDefaultSpec,
  frontmatter: slideDeckFrontmatter,
  specLine: slideDeckSpecLine,
  parseSpec: slideDeckParseSpec,
  cleanSpec: slideDeckCleanSpec,
  stripSpec: slideDeckBody,
  restyle: slideDeckRestyle,
  splitPages: slideDeckSplitPages,
  pages: slideDeckPages,
  pageClasses: slideDeckPageClasses,
  validate: validateSlideDeck,
  receipt: slideDeckCarrierReceipt,
  fontFloor: slideDeckFontFloor,
  measureFailures: slideDeckMeasureFailures,
  printHtml: slideDeckPrintHtml,
  printSizes: SLIDE_PRINT_SIZES,
  chooseSetup: slideDeckChooseSetup,
  storedSetup: slideDeckStoredSetup,
  saveSetup: slideDeckSaveSetup,
};
