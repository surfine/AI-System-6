// Compression grain — pure text diff. The grain view's rounding rules are the
// part most likely to be broken by a later edit, and a text grep cannot see
// them, so the module is executed here in a bare vm context. It touches no
// DOM, no record, and no translations: text in, data out.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("grain-diff");
const source = read("app/core/grain-diff.js");

// The module is a pure text layer by contract.
test.assertNotIncludes(source, "document.", "grain-diff never touches the DOM");
test.assertNotIncludes(source, "activeProjectQuickDraft", "grain-diff never touches the draft record");
test.assertNotIncludes(source, "t(\"", "grain-diff never touches translations");
test.assertNotIncludes(source, "grainVersionChain", "the version chain stays record-aware in Draft Desk");
test.assertNotIncludes(source, "renderQuickDraftGrain", "rendering stays in Draft Desk");
test.assertIncludes(source, "GRAIN_DIFF_CELL_BUDGET", "the LCS cell budget lives with the pure diff");
test.assertIncludes(source, "GRAIN_PARAGRAPH_MATCH", "the paragraph-match threshold lives with the pure diff");
test.assertIncludes(source, "GRAIN_MIN_AUTHOR_RUN", "the survivor-run floor lives with the pure diff");

const context = vm.createContext({});
vm.runInContext(source, context);

// Calls the same composition the view calls. It must not be reimplemented
// here: a copy would keep passing while the real one drifts, which is how a
// record-layer defect once survived a green test run.
function reportRuns(versions, bodyText) {
  const model = context.grainBodyModel(bodyText);
  const chain = { versions, indexes: versions.map((_, index) => index), passes: versions.length };
  return context.grainRunsFromGenerations(model, context.grainGenerations(model, chain));
}

function runsForRecord(parts, bodyText) {
  const model = context.grainBodyModel(bodyText);
  const chain = context.grainChainFromRecordParts(parts);
  return { chain, runs: context.grainRunsFromGenerations(model, context.grainGenerations(model, chain)) };
}

// 1. No anchor, body typed by the writer: every run has generation 0.
const typedBody = "我亲手写的正文。";
const typedModel = context.grainBodyModel(typedBody);
const typedRuns = context.grainRunsFromGenerations(typedModel, typedModel.tokens.map(() => 0));
test.assert(
  typedRuns.length === 1 && typedRuns[0].generation === 0 && typedRuns[0].source === "author",
  "a draft with no model pass reads as entirely the writer's"
);

// 2. Anchor equal to the body: every run has generation 0.
const equalRuns = reportRuns([typedBody], typedBody);
test.assert(equalRuns.every((run) => run.generation === 0), "an anchor identical to the body keeps every run at generation 0");

// 3. A three-version chain: one clause kept from the first pass through two
// more (written out three times) reports 3, a clause written by the last pass
// reports 1, and the writer's opening stays generation 0.
const chainVersions = [
  "开头。\n\n甲乙。\n\n丙丁。",
  "开头。\n\n戊己。\n\n丙丁。",
  "开头。\n\n戊己。\n\n庚辛。",
];
const chainRuns = reportRuns(chainVersions, "开头。\n\n戊己。\n\n壬癸。");
const deepestRun = chainRuns.find((run) => run.text.includes("戊己"));
const singlePassRun = chainRuns.find((run) => run.text.includes("壬癸"));
test.assert(deepestRun?.generation === 3, "a clause written out by all three passes reports the deepest generation");
test.assert(singlePassRun?.generation === 1, "a clause written only by the last pass reports generation 1");
test.assert(!chainRuns.some((run) => run.generation === 2), "the chain reports 3 and 1, never an invented middle depth");
test.assert(chainRuns.some((run) => run.generation === 0), "the writer's opening survives in the chain");

// 4. Smoothing: a lone character that survives inside a rewritten clause is
// coincidence, not preserved authorship. It must never render as its own
// generation-0 run.
const smoothedRuns = reportRuns(["结果它没变卡"], "结果它并没有出现明显的性能下降");
test.assert(
  !smoothedRuns.some((run) => run.generation === 0 && run.text.includes("没")),
  "the handoff example never leaves 没 as a separate generation-0 run"
);
const sharpSmoothedRuns = reportRuns(["它没变卡"], "它并没有变卡");
test.assert(
  !sharpSmoothedRuns.some((run) => run.generation === 0 && run.text.includes("没")),
  "a single surviving character between rewritten runs is absorbed into the model span"
);
test.assert(
  sharpSmoothedRuns.some((run) => run.generation === 0 && run.text === "它"),
  "a real preserved prefix still reads as the writer's"
);

// 5. Collapsing: one contiguous rewritten stretch produces exactly one run,
// and that run reports the deepest generation in the stretch.
const collapsed = context.grainCollapseRewritten([
  { text: "a", generation: 1 },
  { text: "b", generation: 3 },
  { text: "c", generation: 1 },
]);
test.assert(
  collapsed.length === 1 && collapsed[0].text === "abc" && collapsed[0].generation === 3,
  "a contiguous rewritten stretch collapses to one run with the deepest generation"
);

// 6. A moved paragraph, unchanged in text, stays generation 0: blocks match by
// content rather than by position.
const movedRuns = reportRuns(
  ["第一段。\n\n第二段。\n\n第三段。"],
  "第三段。\n\n第一段。\n\n第二段。"
);
test.assert(movedRuns.every((run) => run.generation === 0), "a reordered paragraph is still the writer's");

// Task 1 at the text level: an empty anchor with one recorded pass (the
// writer had written nothing when the first model pass ran) masks nothing, so
// every visible token carries generation 1.
const bornBody = "模型从空白起稿的正文。";
const bornModel = context.grainBodyModel(bornBody);
const bornMask = context.grainPresenceMask("", bornModel);
test.assert(
  bornModel.tokens.every((token, index) => !context.grainVisibleLength(token) || !bornMask[index]),
  "an empty anchor marks no visible token as surviving"
);
const bornRuns = reportRuns([""], bornBody);
test.assert(
  bornRuns.every((run) => !context.grainVisibleLength(run.text) || run.generation === 1),
  "a draft born from an empty body carries generation 1 on every visible token"
);

// The version chain. This layer held a defect that a green test run missed,
// because it was record-aware and only covered by text greps. The rule is pure
// and belongs here.

const writerOnly = context.grainChainFromRecordParts({ humanAnchor: "", humanAnchorUpdatedAt: "", dumps: [] });
test.assert(writerOnly.passes === 0 && !writerOnly.versions.length, "a draft with no model pass has no version chain");

const bornOnePass = context.grainChainFromRecordParts({ humanAnchor: "", humanAnchorUpdatedAt: "T1", dumps: [] });
test.assert(
  bornOnePass.passes === 1 && bornOnePass.versions.length === 1 && bornOnePass.versions[0] === "",
  "an anchor timestamp with an empty anchor is one real pass over an empty negative"
);

// The case that regressed: on the second pass the first model output is stored
// as a dump. The empty negative is not in the dumps, so it has to be put back,
// or that model output becomes the negative and reads as the writer's.
const M1 = "液态玻璃这版更新在多种光照环境下的可读性表现值得关注。";
const M2 = "液态玻璃这版更新在多种光照环境下的界面可读性表现尤其值得关注。";
const bornTwoPasses = runsForRecord(
  { humanAnchor: "", humanAnchorUpdatedAt: "T1", dumps: [M1] },
  M2
);
test.assert(bornTwoPasses.chain.passes === 2, "a draft born empty and rewritten twice reports two passes");
test.assert(bornTwoPasses.chain.versions[0] === "", "the empty negative stays at the head of the chain");
test.assert(
  bornTwoPasses.runs.every((run) => !context.grainVisibleLength(run.text) || run.generation > 0),
  "no word of a draft born from an empty body is ever reported as the writer's"
);

// The ordinary case must not move: the writer's body is the negative.
const writerRewritten = context.grainChainFromRecordParts({
  humanAnchor: "作者原稿。",
  humanAnchorUpdatedAt: "T1",
  dumps: ["作者原稿。"],
});
test.assert(
  writerRewritten.passes === 1 && writerRewritten.versions[0] === "作者原稿。",
  "a written negative is not duplicated at the head of the chain"
);

// Capping keeps the negative and the most recent versions, and still reports
// the true pass count.
const many = Array.from({ length: 20 }, (_, index) => `第 ${index} 版。`);
const capped = context.grainChainFromRecordParts({ humanAnchor: many[0], humanAnchorUpdatedAt: "T1", dumps: many });
test.assert(capped.passes === 20, "capping the chain still reports the true number of passes");
test.assert(capped.versions.length === 12, "the chain is capped at twelve compared versions");
test.assert(capped.versions[0] === many[0] && capped.indexes[0] === 0, "the negative survives capping");
test.assert(capped.indexes[capped.indexes.length - 1] === 19, "the most recent version survives capping");

test.finish();
