// Finishing Receipt: the Project CD burn is the end of the writing route, so
// the work is receipted there. The contract is narrow on purpose -- the
// receipt may state what was stored and nothing else. It must never grade the
// writing, score it, encourage the writer, or fill a missing fact with an
// estimate.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("finishing-receipt");

const receiptSource = read("app/features/project-cd-print.js");
const revisionsSource = read("app/core/document-revisions.js");
const html = read("index.html");
const css = read("styles/30-surfaces.css");
const responsiveCss = read("styles/60-responsive.css");
const config = read("app/core/config.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const manifest = read("tooling/runtime-manifest.mjs");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- the receipt arithmetic runs headless ------------------------------------

const context = { window: {}, console, crypto: { randomUUID: () => "id" } };
vm.createContext(context);
vm.runInContext(revisionsSource, context);
// countMarkdownWords lives in the (much larger) export/import module; the
// receipt only needs it as a fallback, so the contract stubs it here.
vm.runInContext("function countMarkdownWords(text) { return String(text || '').length; }", context);
vm.runInContext(receiptSource, context);
vm.runInContext(`
  globalThis.buildFinishingReceipt = buildFinishingReceipt;
  globalThis.receiptOpeningLine = receiptOpeningLine;
  globalThis.isReceiptQuotableLine = isReceiptQuotableLine;
`, context);
const { buildFinishingReceipt, receiptOpeningLine, isReceiptQuotableLine } = context;

test.assert(typeof buildFinishingReceipt === "function", "the lazy module installs buildFinishingReceipt");

// Four drafts written over three days. Two lines from the first draft are
// still in the burned text; the opening is replaced twice, then left alone.
const drafts = [
  "# 暖气片\n\n暖气片响了一夜。\n\n我睡不着，就把它记下来。\n\n第二天早上，水管里还有声音。\n",
  "# 暖气片\n\n昨晚楼上在装修。\n\n暖气片响了一夜。\n\n我睡不着，就把它记下来。\n\n第二天早上，水管里还有声音。\n",
  "# 暖气片\n\n那天夜里，楼上在装修。\n\n暖气片响了一夜。\n\n我睡不着，就把它记下来，第二天早上水管里还有声音。\n",
  "# 暖气片\n\n那天夜里，楼上在装修。\n\n暖气片响了一夜。\n\n我睡不着，就把它记下来。第二天早上，水管里还是有声音。\n",
];
const day = 86400000;
const burnedAt = new Date(Date.UTC(2026, 7, 15, 12)).toISOString();
const revisions = drafts.map((body, index) => ({
  body,
  createdAt: new Date(Date.UTC(2026, 7, 15, 12) - (drafts.length - index) * day).toISOString(),
}));
// The burn writes its own revision of text the writer already saved; only the
// trailing newline differs.
revisions.push({ body: `${drafts[3]}\n`, createdAt: burnedAt });

const burned = {
  title: "暖气片.md",
  body: drafts[3],
  burnedAt,
  metadata: { wordCount: 42 },
};
const receipt = buildFinishingReceipt(burned, revisions);

test.assert(receipt.words === 42, "the word count is the count stored with the burn");
test.assert(receipt.drafts === 4,
  `drafts counts distinct texts, so a re-serialised burn is not another draft (got ${receipt.drafts})`);
test.assert(receipt.elapsedDays === 4,
  `the span is measured from the earliest stored revision (got ${receipt.elapsedDays})`);
test.assert(receipt.openingRewrites === 2,
  `the opening rewrite count follows the first prose line through the chain (got ${receipt.openingRewrites})`);
test.assert(receipt.keptLines === 2 && receipt.totalLines === 4,
  `the kept count is the LCS of first-draft and burned content lines (got ${receipt.keptLines}/${receipt.totalLines})`);
test.assert(receipt.keptQuote === "暖气片响了一夜。",
  `the quoted line is a real first-draft line that survived (got ${JSON.stringify(receipt.keptQuote)})`);
test.assert(receipt.startedAt === revisions[0].createdAt, "the start is the earliest stored revision");

// A surviving title is a weaker fact than a surviving sentence, so headings and
// other Markdown scaffolding never stand in for the line the writer wrote.
test.assert(!isReceiptQuotableLine("# 暖气片"), "a heading is not quotable as a surviving line");
test.assert(!isReceiptQuotableLine("- 一条列表"), "a list marker is not quotable as a surviving line");
test.assert(isReceiptQuotableLine("暖气片响了一夜。"), "a prose line is quotable");
test.assert(receiptOpeningLine(drafts[0]) === "暖气片响了一夜。",
  "the opening is the first prose line, not the title");

const titleOnly = buildFinishingReceipt(
  { title: "t.md", body: "# 标题\n\n全新的一段。\n", burnedAt, metadata: { wordCount: 8 } },
  [{ body: "# 标题\n\n完全不同的一段。\n", createdAt: new Date(Date.UTC(2026, 7, 14)).toISOString() }]
);
test.assert(titleOnly.keptQuote === "",
  "when only the title survived, the receipt quotes nothing rather than quoting the title");

// No stored history means fewer statements, never invented ones.
const bare = buildFinishingReceipt({ title: "t.md", body: "只有一句。\n", burnedAt, metadata: { wordCount: 4 } }, []);
test.assert(bare.drafts === 0 && bare.startedAt === "" && bare.keptQuote === "" && bare.keptLines === 0,
  "with no stored revisions the receipt claims no history at all");
test.assert(bare.words === 4, "the word count still comes from the burn itself");

// --- the receipt is wired into the route -------------------------------------

test.assertIncludes(html, 'data-window="finishingReceipt"', "the receipt window is registered in index.html");
test.assertIncludes(html, 'id="finishing-receipt-stats"', "the receipt window carries the Get Info stat list");
test.assertIncludes(html, 'id="finishing-receipt-kept"', "the receipt window carries the kept-line block");
test.assertIncludes(html, 'data-system-icon="projectDisc"', "the receipt shows the Project CD it describes");
test.assertIncludes(html, 'data-action="open-finishing-receipt"',
  "the Project CD window can reopen the receipt for the selected disc");
test.assertIncludes(actions, 'registerCommand?.("open-finishing-receipt"',
  "the action resolves the lazy function at dispatch time, not at registry build time");
test.assertIncludes(actions, "await showFinishingReceiptForBurn(item)",
  "the burn opens the receipt after the Project CD window, so the receipt is not covered");
test.assertIncludes(config, '"showFinishingReceiptForBurn"',
  "the burn entry point is a registered lazy stub");
test.assertIncludes(config, '"openFinishingReceiptForSelection"',
  "the reopen entry point is a registered lazy stub");
test.assertIncludes(manifest, '"app/features/project-cd-print.js"',
  "the receipt stays in a lazy module, off the boot bundle");
test.assertNotIncludes(html, "app/features/project-cd-print.js",
  "index.html never loads the receipt module eagerly");
test.assertIncludes(windowManager, '"finishingReceipt"',
  "the receipt is presented as a dialog on a phone in portrait");

// The window reuses Get Info geometry; only the quotation block is new.
test.assertIncludes(html, 'class="window info-window finishing-receipt-window',
  "the receipt reuses the Get Info window shape");
test.assertIncludes(css, ".receipt-kept {", "the kept-line quotation has its own block style");
test.assertNotMatches(css, /\.finishing-receipt-window\s*\{[^}]*\bwidth\s*:/,
  "the receipt introduces no window width of its own");

// --- the receipt stays readable on a phone and a tablet ----------------------
//
// A phone in landscape is about 400px tall. Two things went wrong there: the
// restore path fills the window after the window manager has placed it, so a
// receipt that was 138px tall when it was positioned grew to ~340px and hung
// below the fold; and the window carries overflow: hidden, so a receipt the
// manager had shortened cut its last stated fact off instead of scrolling.
// Measured before the fix at 912x420 (iPhone Air, landscape): the window ran
// to y=546 against a 420px viewport, with 126px of stated fact unreachable.

test.assertIncludes(receiptSource, "clampWindowToViewport(win)",
  "a receipt rendered into an already-open window is pulled back onto the screen");
test.assertIncludes(receiptSource, 'window.matchMedia("(max-width: 860px)").matches',
  "below 860px the stylesheet owns the frame, so the clamp must not write an absolute left onto a centred window");
test.assertMatches(receiptSource, /typeof clampWindowToViewport === "function"/,
  "the lazy module guards the eager helper by typeof, never by a bare reference");
test.assertMatches(responsiveCss, /@media \(max-height: 700px\) \{\s*\.finishing-receipt-window \.info-pane \{\s*overflow-y: auto;/,
  "on a short viewport the receipt pane scrolls rather than clipping a stated fact");

// --- the copy states facts and stops -----------------------------------------

for (const [label, table] of [["English", en], ["Chinese", zh]]) {
  const keys = [
    "finishing_receipt", "finishing_receipt_ellipsis", "receipt_burned_on",
    "receipt_words", "receipt_words_value", "receipt_drafts", "receipt_drafts_value",
    "receipt_started", "receipt_elapsed", "receipt_elapsed_value",
    "receipt_opening", "receipt_opening_value", "receipt_kept", "receipt_kept_value",
    "receipt_kept_lede", "receipt_kept_quote", "receipt_kept_written_on",
  ];
  const missing = keys.filter((key) => !table.includes(`${key}:`));
  test.assert(missing.length === 0, `${label} defines every receipt string`, missing.join(", "));

  const block = table.slice(table.indexOf("finishing_receipt:"), table.indexOf("receipt_kept_written_on:") + 200);
  const praise = [
    "很棒", "真棒", "不错", "优秀", "出色", "了不起", "继续保持", "加油", "恭喜", "厉害",
    "great", "excellent", "amazing", "well done", "keep it up", "congrat", "impressive", "proud",
  ].filter((word) => block.toLowerCase().includes(word.toLowerCase()));
  test.assert(praise.length === 0, `${label} receipt copy never grades the writing`, praise.join(", "));
}

test.assertIncludes(zh, "receipt_kept_quote: (line) => `「${line}」`",
  "Chinese quotes the writer's own line in corner brackets");

test.finish();
