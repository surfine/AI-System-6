// The pure half of the fresh-boot ClioWorks smoke (tooling/clioworks-smoke.mjs
// runs it, tests/features/clioworks-smoke-tool.test.mjs holds it to itself in a
// vm). Owner ruling D4: every ClioWorks surface gets an on-demand fresh-boot
// browser smoke — contracts read source and run code in a vm, they never boot
// the desk, so 22 green contracts once left four surfaces broken in a fresh
// browser. This table is what "broken" means here, per surface and step, and
// the assertions below are the ones the evaluation walk taught us (design
// proposal 2026-10-29-clioworks-second-draft, Findings board):
//   整理 stays on 「正在打开整理页面…」, the chart preview is blank, the
//   mail-merge first source radio has no text, pptx has no 放映, and the find
//   windoid writes 「找不到」 before the writer typed anything.
// Nothing here touches node:fs, the network or a browser: scene parsing and
// the step table are plain data and functions so a contract can run them in a
// vm without importing playwright.

/** The scenes, in run order when the caller names none. */
export const SMOKE_SCENES = Object.freeze([
  "write",
  "chart",
  "stage",
  "reader",
  "route",
  "agent",
  "new",
  "phone",
]);

/** A command that opens a modal resolves only when the writer answers, so the
 * runner never awaits it: it races this timeout and moves on. */
export const MODAL_RACE_MS = 2500;

/**
 * Parse the command line's scene names. An empty list means every scene.
 * Unknown names are reported, never silently dropped — a typo must not turn
 * "run the write smoke" into "run nothing".
 * @param {string[]} args words after the script name
 * @returns {{scenes: string[], unknown: string[]}}
 */
export function parseSceneArg(args) {
  const wanted = (args || []).map((name) => String(name || "").trim()).filter(Boolean);
  const known = wanted.filter((name) => SMOKE_SCENES.includes(name));
  return { scenes: wanted.length ? known : [...SMOKE_SCENES], unknown: wanted.filter((name) => !SMOKE_SCENES.includes(name)) };
}

/**
 * What one step asserts, as data the runner turns into DOM probes.
 *  - find:    a CSS selector that must match at least `min` elements
 *             (default 1) inside `scope` ("window" = the active .window).
 *  - empty:   when true, every matched element's text must be blank — the
 *             find windoid's status line before the writer typed.
 *  - absent:  when true, the selector must match nothing (the loading note).
 *  - text:    a literal that must appear in the first matched element.
 *  - pattern: a regular-expression source the first match's text must satisfy.
 *  - front:   the dataset.window the active window must carry, if given.
 */
export const ASSERTION_KINDS = Object.freeze([
  "find",
  "min",
  "empty",
  "absent",
  "text",
  "pattern",
  "front",
]);

/* The corpus, all under the tool's own fixture server at /real-corpus/. */
const D18 = { rel: "real-corpus/docx/D18.docx", name: "访谈安排-回稿.docx", format: "docx" };
const D01 = { rel: "real-corpus/docx/D01.docx", name: "关于开展质量检查的通知.docx", format: "docx" };
const X07 = { rel: "real-corpus/xlsx/X07.xlsx", name: "月度开支表.xlsx", format: "xlsx" };
const P01 = { rel: "real-corpus/pptx/P01.pptx", name: "季度汇报.pptx", format: "pptx" };

/**
 * The steps. `kind` is what the runner does:
 *  - place:    put a corpus file on the Project Hard Disk through the
 *              product's own createProjectDocument, then open it.
 *  - command:  run a menu-bar command id through handleAction. Modal ones
 *              (they wait for the writer's answer) set modal: true and are
 *              raced, never awaited.
 *  - eval:     a scene-specific page expression the runner provides.
 * Every step carries a visible assertion; "the call returned" proves nothing.
 */
export const STEPS = Object.freeze([
  /* ---- write: D18 then D01, the Office editor and its windoids ---- */
  // D1/S1 (2026-10-29): the title names the file only, and the window carries no mode.
  { scene: "write", id: "write-open", title: "打开 D18（ClioWrite，标题只写文件名）", kind: "place", file: D18, settle: 2500,
    assert: { find: "#clio-write-title", text: D18.name, absent: ".window[data-window=\"clioWrite\"][data-mode]", front: "clioWrite" } },
  // D2 (2026-10-29): 修订 · 批注 · 比较 · 字数 · 字体 live in one 旁注栏 on the
  // window's right, one tab at a time; 审阅's rows open it on their own tab.
  { scene: "write", id: "write-revisions", title: "修订（旁注栏的修订页）", kind: "command", command: "clio-write-revisions",
    assert: { find: ".window[data-window=\"clioWrite\"] .doc-rail:not([hidden]) .doc-rail-tab.is-active", pattern: "^修订" } },
  { scene: "write", id: "write-revisions-list", title: "修订列表（第几页 · 什么改动 · 谁 · 何时）", kind: "eval", eval: "noop",
    assert: { find: ".window[data-window=\"clioWrite\"] .doc-rail [data-rail-panel=\"revisions\"]:not([hidden]) .cw-rev .cw-rev-kind", min: 1 } },
  { scene: "write", id: "write-pages", title: "页面视图", kind: "command", command: "clio-write-view-pages",
    assert: { find: ".window[data-window=\"clioWrite\"] .cw-page-count", pattern: "\\d" } },
  // S3 (Write board ②): the page view's first screen is a whole page — the
  // zoom reads 整页 and page 1's box sits entirely inside the scroller.
  { scene: "write", id: "write-pages-whole", title: "页面视图首屏是整页", kind: "eval", eval: "pageWhole", settle: 800,
    assert: { find: ".window[data-window=\"clioWrite\"] .cw-scroller[data-smoke-page-whole=\"inside\"]", min: 1 } },
  { scene: "write", id: "write-flow", title: "回到正文视图", kind: "command", command: "clio-write-view-flow",
    assert: { find: ".window[data-window=\"clioWrite\"] [contenteditable=\"true\"]", min: 1 } },
  { scene: "write", id: "write-find", title: "查找（未输入时状态为空）", kind: "command", command: "clio-write-find", modal: true,
    assert: { find: ".clioworks-find-status", empty: true } },
  { scene: "write", id: "write-word-count", title: "字数（旁注栏的字数页）", kind: "command", command: "clio-write-word-count",
    assert: { find: ".doc-rail [data-rail-panel=\"words\"]:not([hidden]) .windoid-count", pattern: "中文字 \\d+ · 英文词 \\d+ · 字符（不含空格）\\d+ · 段落 \\d+" } },
  { scene: "write", id: "write-compare", title: "比较（旁注栏的比较页）", kind: "command", command: "clio-write-compare",
    assert: { find: ".window[data-window=\"clioWrite\"] .doc-rail [data-rail-panel=\"compare\"]:not([hidden]) .doc-rail-title", text: "比较" } },
  { scene: "write", id: "write-open-d01", title: "换开 D01", kind: "place", file: D01, settle: 2500,
    assert: { find: ".window[data-window=\"clioWrite\"] [contenteditable=\"true\"]", min: 1, front: "clioWrite" } },
  // The rail follows the window's current document: it names D01 now.
  { scene: "write", id: "write-rail-follows", title: "旁注栏跟着换开的文件", kind: "eval", eval: "noop",
    assert: { find: ".window[data-window=\"clioWrite\"] .doc-rail:not([hidden]) .doc-rail-caption", text: D01.name } },
  { scene: "write", id: "write-mailmerge", title: "邮件合并（来源单选钮有字）", kind: "command", command: "clio-write-mail-merge", modal: true,
    assert: { find: "#clioworks-mailmerge-modal label[for=\"mm-source-workbook\"]", pattern: "\\S" } },

  /* ---- chart: X07, a range, the 制图 dialog and 粘贴函数 ---- */
  { scene: "chart", id: "chart-open", title: "打开 X07（ClioChart，标题只写文件名）", kind: "place", file: X07, settle: 3000,
    assert: { find: "#clio-chart-title", text: X07.name, absent: ".clio-chart-workbook[data-mode]", front: "clioChart" } },
  { scene: "chart", id: "chart-select", title: "选一个范围", kind: "eval", eval: "selectRange",
    assert: { find: ".window[data-window=\"clioChart\"]", min: 1 } },
  { scene: "chart", id: "chart-dialog", title: "制图对话框（预览有柱）", kind: "command", command: "clio-chart-workbook-chart", modal: true, settle: 1500,
    assert: { find: "dialog.cwk-dialog[open] .cwk-preview svg rect", min: 1 } },
  { scene: "chart", id: "chart-paste-function", title: "粘贴函数", kind: "command", command: "clio-chart-workbook-paste-function", modal: true, settle: 1200,
    assert: { find: "dialog[open]", min: 1 } },
  { scene: "chart", id: "chart-comments", title: "批注（旁注栏，ClioChart 只有这一页）", kind: "command", command: "clio-chart-workbook-comment", settle: 800,
    assert: { find: ".window[data-window=\"clioChart\"] .doc-rail:not([hidden]) [data-rail-panel=\"comments\"]:not([hidden]) .windoid-composer", min: 1 } },

  /* ---- stage: P01, 放映 and 总览 ---- */
  { scene: "stage", id: "stage-open", title: "打开 P01（ClioStage，标题只写文件名）", kind: "place", file: P01, settle: 3000,
    assert: { find: "#clio-stage-title", text: P01.name, absent: ".clio-stage-native[data-mode]", front: "clioStage" } },
  { scene: "stage", id: "stage-comments", title: "批注（旁注栏，ClioStage 只有这一页）", kind: "command", command: "clio-stage-native-comment", settle: 800,
    assert: { find: ".window[data-window=\"clioStage\"] .doc-rail:not([hidden]) [data-rail-panel=\"comments\"]:not([hidden]) .windoid-composer", min: 1 } },
  { scene: "stage", id: "stage-present", title: "放映（覆盖层出现）", kind: "command", command: "clio-stage-present", modal: true, settle: 1500,
    assert: { find: ".clio-stage-show, :fullscreen", min: 1 } },
  { scene: "stage", id: "stage-overview", title: "总览", kind: "command", command: "clio-stage-overview", settle: 1200,
    assert: { find: ".csn-overview .clio-stage-overview-card, .csn-overview [class*=\"thumb\"]", min: 1 } },

  /* ---- reader: F03 through the File Floppy, 原页 and 整理 ---- */
  { scene: "reader", id: "reader-open", title: "F03 进文件软盘并打开（原页）", kind: "eval", eval: "readerOpen", settle: 4000,
    assert: { find: ".window[data-window=\"reader\"] .reader-pages-bar, .window[data-window=\"reader\"] canvas", min: 1 } },
  { scene: "reader", id: "reader-organize", title: "整理（缩略图代替加载文案）", kind: "eval", eval: "readerOrganize", settle: 3000,
    assert: { find: ".reader-organize-frame canvas", min: 1, absent: ".reader-pages-note" } },

  /* ---- route: a manuscript through TeachText and 送审… ---- */
  { scene: "route", id: "route-manuscript", title: "写一份手稿并打开 TeachText", kind: "eval", eval: "routeManuscript", settle: 1500,
    assert: { find: ".window[data-window=\"teachText\"]", min: 1 } },
  { scene: "route", id: "route-send", title: "送审…", kind: "command", command: "send-manuscript-review", modal: true, settle: 1500,
    assert: { find: "#manuscript-roundtrip-send-modal[open]", min: 1 } },

  /* ---- agent: ClioTalk 代理 ---- */
  { scene: "agent", id: "agent-open", title: "ClioTalk 代理模式", kind: "eval", eval: "agentMode", settle: 2500,
    assert: { find: ".clio-agent-bar .clio-agent-modes", min: 1 } },

  /* ---- new: the 新建… dialog ---- */
  { scene: "new", id: "new-dialog", title: "新建…", kind: "command", command: "new-office-document", modal: true, settle: 800,
    assert: { find: "#office-new-modal[open]", min: 1 } },

  /* ---- phone (S6, Refusal board ⑤): 390×844 upright, then 844×390 sideways.
     D01's form is wider than an upright phone: the page never scrolls
     sideways, the table scrolls in its own frame with the hint under it, the
     page view is refused, 查找 is a drawer that leaves the top half of the
     text (sideways: the left half), and the 旁注栏 is a sheet over the lower
     half (sideways: beside the text, as on the desk). ---- */
  { scene: "phone", id: "phone-open", title: "手机尺寸打开 D01", kind: "place", file: D01, settle: 3000,
    assert: { find: ".window[data-window=\"clioWrite\"]", front: "clioWrite" } },
  { scene: "phone", id: "phone-no-side-scroll", title: "竖放：页面不横滚，正文按屏宽重排", kind: "eval", eval: "phoneFit", settle: 400,
    assert: { find: "html[data-smoke-side-scroll=\"none\"]" } },
  { scene: "phone", id: "phone-table-frame", title: "竖放：宽表格在自己的框里横滑，框下一行提示", kind: "eval", eval: "tableFrame", settle: 400,
    assert: { find: ".window[data-window=\"clioWrite\"] .cw-table-frame[data-smoke-scrolls=\"yes\"] + .cw-table-hint", text: "← 表格可横向滑动 →" } },
  { scene: "phone", id: "phone-pages-refused", title: "手机上不给页面视图（菜单命令被拒、仍是流式）", kind: "command", command: "clio-write-view-pages",
    assert: { find: ".window[data-window=\"clioWrite\"][data-view=\"flow\"]", absent: ".window[data-window=\"clioWrite\"][data-view=\"pages\"]" } },
  { scene: "phone", id: "phone-find", title: "手机尺寸查找", kind: "command", command: "clio-write-find", modal: true,
    assert: { find: ".clioworks-find-status", empty: true } },
  { scene: "phone", id: "phone-find-drawer", title: "竖放：查找是底部抽屉，正文上半屏还看得到", kind: "eval", eval: "findDrawer", settle: 400,
    assert: { find: ".clioworks-find-windoid.is-drawer[data-smoke-leaves-text=\"yes\"]" } },
  { scene: "phone", id: "phone-rail-sheet", title: "竖放：旁注栏是盖住下半屏的抽屉，开关在文件条", kind: "eval", eval: "railSheet", settle: 400,
    assert: { find: ".window[data-window=\"clioWrite\"] .doc-rail[data-smoke-rail=\"sheet\"]" } },
  { scene: "phone", id: "phone-landscape", title: "横放 844×390：页面不横滚，正文按屏宽重排", kind: "eval", eval: "phoneLandscape", settle: 400,
    assert: { find: "html[data-smoke-side-scroll=\"none\"]" } },
  { scene: "phone", id: "phone-landscape-table", title: "横放：表格放得下就整张看得到，放不下就在框里横滑", kind: "eval", eval: "tableFrame", settle: 400,
    assert: { find: ".window[data-window=\"clioWrite\"] .cw-scroller[data-smoke-tables=\"ok\"]" } },
  { scene: "phone", id: "phone-landscape-find", title: "横放：查找抽屉立在右半，正文左半还看得到", kind: "eval", eval: "findDrawer", settle: 400,
    assert: { find: ".clioworks-find-windoid.is-drawer[data-smoke-leaves-text=\"yes\"]" } },
  { scene: "phone", id: "phone-landscape-rail", title: "横放：旁注栏立在正文旁边，不盖正文", kind: "eval", eval: "railSheet", settle: 400,
    assert: { find: ".window[data-window=\"clioWrite\"] .doc-rail[data-smoke-rail=\"beside\"]" } },
]);

/**
 * The steps of the given scenes, in table order.
 * @param {string[]} scenes scene ids the caller asked for
 * @returns {object[]}
 */
export function planFor(scenes) {
  const wanted = new Set(scenes && scenes.length ? scenes : SMOKE_SCENES);
  return STEPS.filter((step) => wanted.has(step.scene));
}

/**
 * One line per failed step, as the tool prints them.
 * @param {object} result a runner result { id, ok, detail? }
 * @returns {string}
 */
export function failureLine(result) {
  const step = STEPS.find((candidate) => candidate.id === result.id);
  const title = step ? step.title : result.id;
  return `FAIL ${result.id} — ${title}${result.detail ? `: ${result.detail}` : ""}`;
}

/** True when the step's assertion is well-formed enough for the runner to run. */
export function assertionIsWellFormed(assertion) {
  if (!assertion || typeof assertion !== "object") return false;
  if (typeof assertion.find !== "string" || !assertion.find) return false;
  const known = Object.keys(assertion).every((key) => ASSERTION_KINDS.includes(key));
  if (!known) return false;
  if (assertion.front != null && typeof assertion.front !== "string") return false;
  if (assertion.text != null && typeof assertion.text !== "string") return false;
  if (assertion.pattern != null && typeof assertion.pattern !== "string") return false;
  return true;
}
