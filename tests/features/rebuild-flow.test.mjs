// Rebuild Flow — executable contract for the desk's 「还原写作对象」 window.
//
// The window builds the same rebuild pack a guest hands in over MCP and runs
// the same validator. What it promises on its own:
//
//   1. sections follow the article: one per `##` heading; without headings,
//      paragraphs, each section naming words that start it and no earlier
//      paragraph (owner decision 2026-09-26: the article sets the count);
//   2. the model only drafts around the text, and what it drafts that cannot
//      stand (an official claim with no URL, an unknown label) is dropped and
//      counted, never repaired into a claim it did not make;
//   3. an own pack never changes the writer's words and passes the validator
//      as a round; someone else's article only ever becomes a new disk;
//   4. nothing is handed in without a model (owner decision D2), and the
//      check lines say why in plain words;
//   5. the window is built by its module, not shipped in index.html, and owns
//      its buttons' availability.
//
// Every fixture is synthetic.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("rebuild-flow");

let modelReady = true;
const project = { id: "p1", name: "灯塔" };
const context = {
  window: {},
  currentLanguage: "zh",
  t: (key, ...args) => (args.length ? `${key}(${args.join(",")})` : key),
  inferRebuildTitle: (text) => String(text || "").trim().split("\n")[0].slice(0, 12),
  stripRebuildMarkdownFence: (markdown) => String(markdown || "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim(),
  modelReadyForRequests: () => modelReady,
  getActiveProject: () => project,
  rebuildMinSourceChars: 40,
  console,
};
context.window = context;
vm.createContext(context);
vm.runInContext(read("apps/desktop/app/core/markdown.js"), context, { filename: "markdown.js" });
vm.runInContext(read("apps/desktop/app/core/rebuild-pack.js"), context, { filename: "rebuild-pack.js" });
vm.runInContext(read("apps/desktop/app/features/rebuild-flow.js"), context, { filename: "rebuild-flow.js" });
const R = context.AISystem6RebuildPack;
const run = (source) => vm.runInContext(source, context);

// --- 1. sections follow the article ------------------------------------------

const headed = "# 灯塔\n\n开头。\n\n## 第一夜\n\n甲。\n\n## 第二夜\n\n乙。\n\n## 第三夜\n\n丙。";
const byHeading = context.splitRebuildFlowByRules(headed);
test.assert(byHeading.length === 3 && byHeading.every((section, index) => section.covers[0] === ["第一夜", "第二夜", "第三夜"][index]), "one section per ## heading");
const stamped = context.splitRebuildFlowByRules("# 灯塔\n\n## 一 {#a1b2c3}\n\n甲。\n\n## 二\n\n乙。");
test.assert(stamped[0].covers[0] === "一", "a stamped heading id is not part of the section name");

const plain = "# 无题\n\n我们到海边的那座灯塔去的时候是春天。\n\n我们到海边的那座灯塔去的时候下了雨。\n\n雾很大。\n\n风停了。";
const byParagraph = context.splitRebuildFlowByRules(plain);
test.assert(byParagraph.length === 4 && byParagraph[0].startQuote === "", "without headings each paragraph is a section up to eight");
test.assert(byParagraph[1].startQuote.length > 14 && "我们到海边的那座灯塔去的时候下了雨。".startsWith(byParagraph[1].startQuote), "a start quote grows until no earlier paragraph starts the same way");
const long = `# 长\n\n${Array.from({ length: 20 }, (_, index) => `第 ${index + 1} 段的内容。`).join("\n\n")}`;
const grouped = context.splitRebuildFlowByRules(long);
test.assert(grouped.length === 5 && R.validateRebuildPack({ packVersion: 1, mode: "study", target: { kind: "new-project", name: "长" }, roundDate: "2026-09-26", manuscript: { markdown: long }, sections: grouped.map((section, index) => ({ ...section, title: `节${index}` })) }, {}).ok, "a long article without headings is grouped, and the grouping splits it cleanly");
test.assert(context.splitRebuildFlowByRules("# 一段\n\n只有一段。").length === 0, "an article of one paragraph cannot be split");

// --- 2. the model's draft: dropped, never repaired -----------------------------

const draft = `## 问题单这一轮
- 灯塔为什么转十四圈？
- 守塔人是谁？

## 大纲前言
论：灯塔的光是数得出来的。
做法：照原文。
不写：私人对话。

## 分节说明
### 1. 第一夜
HKRR: K
说明：开头和第一夜。
### 2. 第二夜
HKRR: R
说明：雾。
### 3. 第三夜
说明：灯泡。

## 事实账
- 光转十四圈 ｜ 管理处公告 ｜ 官方 ｜ https://example.org/notice
- 管理处换了灯泡 ｜ 管理处 ｜ 官方
- 守塔人姓林 ｜ 作者回忆 ｜ 推测
- 雾有一百米 ｜ 气象站 ｜ 大概

## 谱系
- 2026-03 ｜ 公告 ｜ 管理处`;
const parsed = context.parseRebuildFlowDraft(draft, byHeading, R);
test.assert(parsed.bullets.length === 2 && parsed.preface.thesis === "灯塔的光是数得出来的。" && parsed.complete, "the questions and the preface are read from their headings");
test.assert(parsed.notes[1].hkrr === "R" && parsed.notes[1].note === "雾。" && parsed.notes[2].note === "灯泡。", "each section's note is read in order");
test.assert(parsed.factLedger.length === 2 && parsed.dropped === 2, "an official claim without a URL and an unknown label are dropped and counted");
test.assert(parsed.factLedger.some((row) => row.confidence === "推测") && !parsed.factLedger.some((row) => /灯泡|一百米/.test(row.claim)), "a dropped claim is never relabelled into the ledger");
test.assert(parsed.timeline.length === 1 && parsed.timeline[0].event === "公告", "the timeline is read");

// --- 3. the pack --------------------------------------------------------------

run(`Object.assign(rebuildFlow, { text: ${JSON.stringify(headed)}, label: "TeachText", mode: "own", target: "round", sections: ${JSON.stringify(byHeading)} })`);
context.rebuildFlow_drafted = parsed;
run("rebuildFlow.drafted = rebuildFlow_drafted");
const snapshot = { project, scraps: [], references: [], files: [], baseManuscript: "", sourceRevision: "rev-1" };
const ownPack = context.buildRebuildFlowPack(snapshot);
const ownVerdict = R.validateRebuildPack(ownPack, snapshot);
test.assert(ownVerdict.ok, `an own round from the window passes the validator (${JSON.stringify(ownVerdict.errors)})`);
test.assert(ownPack.manuscript.markdown === headed && ownPack.manuscript.base.text === headed && ownPack.manuscript.changes.length === 0, "an own pack carries the article unchanged as both text and base");
test.assert(ownPack.target.kind === "round" && ownPack.target.projectId === "p1" && ownPack.target.sourceRevision === "rev-1", "a round names the project and the revision it was checked against");
test.assert(ownPack.sections[0].note === "开头和第一夜。" && ownPack.sections[0].covers[0] === "第一夜", "sections carry the model's notes and the rules' split");

run(`Object.assign(rebuildFlow, { text: ${JSON.stringify(plain.replace(/^# 无题\n\n/, ""))}, mode: "study", target: "round", diskName: "学：灯塔" })`);
run(`rebuildFlow.sections = splitRebuildFlowByRules(rebuildFlowManuscript(rebuildFlow.text))`);
run("rebuildFlow.drafted = { bullets: ['问'], preface: {}, notes: [], factLedger: [], timeline: [], complete: true }");
run("rebuildFlow.target = 'new-project'");
const studyPack = context.buildRebuildFlowPack(snapshot);
test.assert(studyPack.mode === "study" && studyPack.target.kind === "new-project" && studyPack.target.name === "学：灯塔" && !studyPack.manuscript.base, "someone else's article becomes a new disk under the name the writer gave it");
test.assert(/^# /.test(studyPack.manuscript.markdown) && studyPack.manuscript.markdown.endsWith("风停了。"), "an article without a title line is given one; its body is untouched");
test.assert(R.validateRebuildPack(studyPack, { project: null }).ok, `a study pack from the window passes the validator (${JSON.stringify(R.validateRebuildPack(studyPack, { project: null }).errors)})`);

// --- 4. no model, no hand-in ---------------------------------------------------

run(`Object.assign(rebuildFlow, { mode: "own", target: "round", drafted: null, phase: "ready", verdict: { ok: true, errors: [], warnings: [] }, editing: -1 })`);
modelReady = false;
const noModel = context.rebuildFlowCheckLines();
test.assert(noModel.some(([kind, text]) => kind === "bad" && text === "rebuild_check_no_model") && !context.rebuildFlowCanHandIn(), "without a model the check says so and nothing can be handed in");
modelReady = true;
run("rebuildFlow.drafted = rebuildFlow_drafted");
const ready = context.rebuildFlowCheckLines();
test.assert(!ready.some(([kind]) => kind === "bad") && context.rebuildFlowCanHandIn(), "a drafted, valid round can be handed in");
test.assert(ready.some(([kind, text]) => kind === "warn" && text === "rebuild_check_dropped(2)"), "dropped claims are reported as a warning, not an error");
run(`rebuildFlow.verdict = { ok: false, errors: [{ code: "E2", path: "sections[1]", message: "x" }], warnings: [] }`);
const broken = context.rebuildFlowCheckLines();
test.assert(broken.some(([kind, text]) => kind === "bad" && text === "rebuild_check_start_missing(2)") && !context.rebuildFlowCanHandIn(), "a section whose start is not found is named by its number and blocks the hand-in");

// --- 5. wiring -----------------------------------------------------------------

const index = read("apps/desktop/index.html");
const flow = read("apps/desktop/app/features/rebuild-flow.js");
test.assertNotIncludes(index, 'data-window="rebuildFlow"', "the window is not shipped in index.html");
test.assertIncludes(flow, 'windowName: "rebuildFlow"', "the module builds the window");
test.assertIncludes(read("apps/desktop/app/core/config.js"), '"app/features/rebuild-flow.js",', "the module loads with Writing Flow");
test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/features/rebuild-flow.js",', "the module is a lazy runtime path");
test.assertIncludes(flow, 'role="radiogroup" aria-labelledby="rebuild-flow-mode-label"', "whose article it is is a labelled radio group");
test.assertIncludes(flow, '<div class="select-wrap"><select id="rebuild-flow-source-kind">', "the source is chosen with the System 6 select harness");
test.assertIncludes(read("apps/desktop/app/features/guest-tools.js"), "async function submitDeskRebuildPack(", "a desk round is handed in through the guests' receipt path");

test.finish();
