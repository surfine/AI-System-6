// The Question Sheet gets a verifier.
//
// The sheet writes down what the piece must keep -- the recipient, what must
// be remembered, the objections, the tone, the writer's own output rules --
// and until now nothing at the end of the route ever read them back. The style
// check sent the manuscript body and a prompt file, nothing else. CLAUDE.md
// charges the Review Desk with catching "missing personal detail" and
// "flattened flavor" while it held no record of which details were personal.
//
// Two channels now carry the sheet's constraints, split by what KIND of rule
// each is rather than by what is cheap:
//
//   exact    a word the writer put in quotes is a hard rule. String matching
//            cannot miss one and cannot invent one, and it reports a line.
//   judged   tone, whether the personal detail survived, "do not summarise at
//            the end" -- these need reading, so they go to the style check
//            along with the rest of the constraints.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("question-sheet-as-spec");

const questionSheet = read("app/core/question-sheet.js");
const translation = read("app/features/translation.js");

const context = vm.createContext({ window: {}, Math, currentLanguage: "zh" });
vm.runInContext(read("app/core/markdown.js"), context);
vm.runInContext(questionSheet, context);

const sheet = [
  "## 接收者 / 受众", "- 收件人", "",
  "## 输出规则",
  "- 不要用「赋能」这个词",
  "- 也别写「抓手」",
  "- 结尾不要总结",
  "", "## 必须记住", "- 她只在周三看邮件",
].join("\n");

// --- The exact channel ----------------------------------------------------

const terms = context.questionSheetQuotedRules(sheet);
test.assert(terms.join(",") === "赋能,抓手", "a quoted word is a hard rule");
test.assert(
  !terms.includes("结尾不要总结"),
  "an unquoted rule is not one: it needs reading, so it is left to the check that can read",
);
test.assert(
  context.questionSheetQuotedRules("## 必须记住\n- 她说过「按时」").length === 0,
  "and only the writer's OWN output rules are read this way, not every quotation in the sheet",
);

const breaches = context.outputRuleBreaches(terms, "这次改造赋能了整条供应链。\n\n我们找到了新的抓手。");
test.assert(breaches.length === 2, "every appearance is reported");
test.assert(
  breaches[0].line === 1 && breaches[1].line === 3,
  "each with the line it is on, which is what exactness buys",
);
test.assert(
  context.outputRuleBreaches(terms, "这段话很干净。").length === 0,
  "and a clean text reports nothing",
);

// --- The judged channel ---------------------------------------------------

const constraints = context.questionSheetReviewContext(sheet);
// Headings come out in the running language; this context is zh.
["接收者 / 受众", "必须记住", "输出规则"].forEach((heading) => {
  test.assertIncludes(constraints, heading, `the reviewer is given the writer's ${heading}`);
});
test.assert(
  !constraints.includes("原始问题") && !constraints.includes("Original Questions"),
  "but not the whole sheet: sections a reviewer does not need would only spend context",
);
test.assert(
  context.questionSheetReviewContext(sheet, 40).length <= 40,
  "and it is capped",
);

// --- Wired into the check, in the right order ----------------------------

test.assertMatches(
  translation,
  /const exactFindings = outputRuleBreaches\(questionSheetQuotedRules\(sheetMarkdown\), body\)/,
  "the exact findings are computed from the sheet and the body",
);
test.assertMatches(
  translation,
  /renderStyleSheet\(exactFindings, exactFindings\.length \? "" : checkingMessage\);[\s\S]{0,80}?try \{/,
  "and rendered BEFORE the model is asked anything",
);
test.assertMatches(
  translation,
  /console\.error\("Style check failed"[\s\S]{0,200}?renderStyleSheet\(exactFindings,/,
  "they survive the model's failure: they never needed it",
);
test.assertIncludes(
  translation,
  "const findings = [...exactFindings, ...parseStyleFindings(content)];",
  "and they lead the list when the model does answer",
);
test.assertMatches(
  translation,
  /THE WRITER'S OWN CONSTRAINTS, from their Question Sheet/,
  "the judged channel carries the sheet into the prompt",
);
test.assertMatches(
  translation,
  /const constraints = questionSheetReviewContext\(sheetMarkdown\);/,
  "through the capped selection rather than the whole document",
);

// The findings are reported in the Review Desk and nowhere else: a banned word
// flagged while the writer is still typing the sentence is an interruption,
// not a review.
test.assertNotIncludes(read("app/core/markdown-editor.js"), "outputRuleBreaches", "the editor does not police the text as it is typed");
test.assertNotIncludes(read("app/features/writing-flow.js"), "outputRuleBreaches", "nor does the route");

test.finish();
