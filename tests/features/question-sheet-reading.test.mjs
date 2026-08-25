// The Question Sheet reads itself, rather than scoring itself.
//
// CLAUDE.md names what this sheet exists to protect: "real recipient, raw
// questions, personal observations, objections, usage details, pressure
// points, handoff friction", and names the failure it guards against --
// "sparse prompts create mouthpiece output". The sheet used to have no way to
// say it was sparse: eleven empty bullets look exactly like eleven answered
// ones, and the pack went to the model either way.
//
// So it reports ONE gap, in plain words, in the cell that already carries its
// count. Not "4 of 11": a score turns the sheet back into a form with marks on
// it, and invites filling boxes to raise the number.
//
// The reading is deterministic -- no model, no guess -- so it is executed here.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("question-sheet-reading");

const questionSheet = read("app/core/question-sheet.js");
const markdown = read("app/core/markdown.js");
const writingFlow = read("app/features/writing-flow.js");

const context = vm.createContext({ window: {}, Math, globalThis: {}, currentLanguage: "zh" });
vm.runInContext(markdown, context);
vm.runInContext(questionSheet, context);
// A top-level `const` is not exposed as a property of the vm context; `var` is.
vm.runInContext(
  "var loadBearing = QUESTION_SHEET_LOAD_BEARING; var sectionKeys = QUESTION_SHEET_SECTION_KEYS;",
  context,
);

// --- The five, and their order -------------------------------------------

test.assert(
  context.loadBearing.join(",") === "recipient,originalQuestions,rawInput,objections,handoff",
  "the load-bearing five are the ones CLAUDE.md names, in the order it names them",
);
test.assert(
  context.loadBearing.every((key) => context.sectionKeys.includes(key)),
  "and each is a real section of the sheet, not an invented one",
);

// --- What counts as said --------------------------------------------------

const template = context.buildQuestionSheetTemplate("zh");
test.assert(
  context.questionSheetCoveredSections(template).size === 0,
  "a freshly inserted template has said nothing: its empty bullets are what the form left behind",
);
test.assert(
  context.questionSheetFirstGap("") === "recipient",
  "an empty sheet is asked for the recipient first",
);
test.assert(
  context.questionSheetFirstGap("交给收件人，她没做过供应链。") === "recipient",
  "and so is a sheet with a raw dump in it but nothing filed",
);
test.assert(
  context.questionSheetFirstGap("## 接收者 / 受众\n\n- 收件人\n") === "originalQuestions",
  "once the recipient is said, the next unsaid one is named",
);
test.assert(
  context.questionSheetFirstGap(
    "## 接收者 / 受众\n- 收件人\n## 原始问题\n- 为什么晚了\n## 原始输入 / 碎念\n- 我看见仓库在改单\n"
    + "## 反对意见 / 张力\n- 采购会说不是他们的错\n## 交付减摩擦\n- 她只在周三看邮件\n",
  ) === "",
  "and a sheet that has said all five reports no gap at all",
);

// A section written under an earlier version's heading must not read as
// unwritten -- the writer said it; the template changed, not them.
test.assert(
  context.questionSheetFirstGap("## 受众\n\n- 收件人\n") === "originalQuestions",
  "a legacy heading still counts as said",
);

// The empty marker is the pack's own placeholder, not the writer's words.
test.assert(
  context.questionSheetCoveredSections("## 接收者 / 受众\n\n（空）\n").size === 0,
  "the empty marker does not count as having said something",
);

// --- One gap, in the cell that already exists -----------------------------

test.assertIncludes(writingFlow, "function questionSheetCellText", "the cell text has one owner");
test.assertMatches(
  writingFlow,
  /function questionSheetCellText[\s\S]*?questionSheetFirstGap\(markdown\)/,
  "which asks for the first gap, not for a count of gaps",
);
test.assertNotMatches(
  writingFlow,
  /questionSheetCellText[\s\S]{0,400}?covered\.size/,
  "no score reaches the cell",
);
test.assert(
  (writingFlow.match(/questionCountEl\.textContent = questionSheetCellText/g) || []).length === 2,
  "every site that writes the cell goes through it, so the two cannot drift",
);

// The words are the writer's language, not the schema's. "Not said yet: who
// this is for" beats "recipient: missing".
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");
context.loadBearing.forEach((key) => {
  test.assertIncludes(zh, `question_sheet_gap_${key}:`, `zh names the ${key} gap in plain words`);
  test.assertIncludes(en, `question_sheet_gap_${key}:`, `en names the ${key} gap in plain words`);
});

// --- The template says nothing of its own ---------------------------------
test.assertNotIncludes(questionSheet, "outputRuleDefault", "the template ships no pre-written line");
test.assertMatches(
  questionSheet,
  /function buildQuestionSheetTemplate[\s\S]*?sections: \{\}/,
  "it is blank, all of it",
);
test.assertIncludes(zh, "你给 AI 的意图，要多于你要求它输出的文字。", "the rule about the sheet lives in the sheet's hint");
// Dictation already accepts the Question Sheet as a destination; the empty
// state is where a writer with a mess in their head finds out. It is named,
// not given a control: the Dictation Pad is a desk accessory, and the Apple
// menu is where the whole group is meant to be seen at once.
test.assertIncludes(zh, "就用听写簿说", "the empty sheet says you can speak instead of type");
test.assertIncludes(en, "or say it, with the Dictation Pad", "in both languages");
test.assertNotIncludes(read("index.html"), 'data-action="open-dictation" class="btn"', "without adding a button for it");

// --- The Outline carries the same unsaid thing ---------------------------
//
// The product may speak; it may not block. Advancing from a thin sheet says
// what is still unsaid, once, and goes -- and the Outline keeps saying it, for
// the writer only.
test.assertMatches(
  writingFlow,
  /openWindow\("outline"\);[\s\S]{0,220}?questionSheetFirstGap\(project\.questionSheet \|\| ""\)/,
  "advancing from a thin sheet names what is still unsaid",
);
test.assertNotMatches(
  writingFlow,
  /questionSheetFirstGap[\s\S]{0,200}?\breturn;\s*\n/,
  "and nothing about the gap stops the advance",
);
test.assertMatches(
  writingFlow,
  /function updateOutlineSectionStatus[\s\S]*?questionSheetFirstGap\(sheet\)/,
  "the Outline's own cell says it too",
);
// Computed live from the sheet, not stamped at the moment of advance: a mark
// that cannot go stale, and one that disappears by itself when the writer goes
// back and says the thing.
test.assertNotIncludes(writingFlow, "outlineFromThinSheet", "no stored flag to go stale");
// It is for the writer. It reaches no prompt.
test.assertNotMatches(
  read("app/core/question-sheet.js"),
  /questionSheetFirstGap[\s\S]{0,200}?buildQuestionSheetMarkdown/,
  "the gap never travels into the pack",
);

test.finish();
