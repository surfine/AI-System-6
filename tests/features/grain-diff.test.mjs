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
function reportRuns(versions, bodyText, options = {}) {
  const model = context.grainBodyModel(bodyText);
  const chain = { versions, indexes: versions.map((_, index) => index), passes: versions.length };
  return context.grainRunsFromGenerations(model, context.grainGenerations(model, chain, options));
}

function runsForRecord(parts, bodyText, options = {}) {
  const model = context.grainBodyModel(bodyText);
  const chain = context.grainChainFromRecordParts(parts);
  return { chain, runs: context.grainRunsFromGenerations(model, context.grainGenerations(model, chain, options)) };
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

// Text the writer types after the last pass. The chain records what each pass
// replaced, never what it produced, so these tokens sit in no version and used
// to be charged to the newest pass — the writer's own new sentence was reported
// as the model's. The delivered body is the reference that separates them.
const negativeText = "他要的不是流程图。";
const deliveredText = "他需要的并不是一张流程图。";
const afterWriterTyped = "他需要的并不是一张流程图。我后来自己补了这句。";

const withoutReference = runsForRecord(
  { humanAnchor: negativeText, humanAnchorUpdatedAt: "T1", dumps: [negativeText] },
  afterWriterTyped
).runs;
const strandedRun = withoutReference.find((run) => run.text.includes("我后来自己补了这句"));
test.assert(
  Boolean(strandedRun) && strandedRun.source === "model",
  "without the delivered body, a sentence typed after the pass still reads as the model's"
);

const withReference = runsForRecord(
  { humanAnchor: negativeText, humanAnchorUpdatedAt: "T1", dumps: [negativeText] },
  afterWriterTyped,
  { modelDelivered: deliveredText }
).runs;
const ownRun = withReference.find((run) => run.text.includes("我后来自己补了这句"));
test.assert(
  Boolean(ownRun) && ownRun.source === "author" && ownRun.generation === 0,
  "with the delivered body, a sentence typed after the pass belongs to the writer"
);
test.assert(
  withReference.some((run) => run.source === "model" && run.generation === 1),
  "the reference does not hand the model's own rewrite back to the writer"
);

// A record written before the field existed passes an empty reference, and the
// reading has to stay exactly as it was rather than turning every stranded
// token into the writer's work.
test.assert(
  JSON.stringify(runsForRecord(
    { humanAnchor: negativeText, humanAnchorUpdatedAt: "T1", dumps: [negativeText] },
    afterWriterTyped,
    { modelDelivered: "" }
  ).runs) === JSON.stringify(withoutReference),
  "an empty delivered body reads exactly as before the reference existed"
);

// FatBits cells. Structure is cut before sentences: a heading and a list item
// stay whole, and a badge is never pinned across two of them.
const cellRuns = [
  { text: "## 交接给谁\n\n他", source: "author", generation: 0 },
  { text: "需要的并不是一张流程图（这点很关键）", source: "model", generation: 1 },
  { text: "。上一版没人看。\n\n- 只写三件事\n- 出事了找谁\n\n版本号是 1.0.49 不该断开。", source: "author", generation: 0 },
];
const cells = context.grainSentenceCells(cellRuns);
test.assert(cells.length === 6, "structure and sentences together produce one cell each");
test.assert(cells[0].text === "## 交接给谁", "a heading line is one cell and is never split at a stop");
test.assert(
  cells[1].text === "他需要的并不是一张流程图（这点很关键）。",
  "a closing bracket and the stop after it belong to the sentence they close"
);
test.assert(cells[1].generation === 1, "a cell carries the deepest generation inside it");
test.assert(
  cells[1].parts.length === 3 && cells[1].parts[0].source === "author" && cells[1].parts[1].source === "model",
  "a cell keeps its parts, so one rewritten clause does not make the whole sentence the model's"
);
test.assert(cells[2].text === "上一版没人看。" && cells[2].line === cells[1].line, "two sentences on one line are two cells on that line");
test.assert(cells[3].text === "- 只写三件事" && cells[4].text === "- 出事了找谁", "each list item is its own cell");
test.assert(
  cells[5].text === "版本号是 1.0.49 不该断开。",
  "an ASCII stop with no space after it does not split a version number"
);
test.assert(
  context.grainSentenceCells([{ text: "\n\n   \n", source: "author", generation: 0 }]).length === 0,
  "blank lines produce no cells"
);

// The offsets are what an edited cell is spliced back by, so they have to name
// the exact span in the body — searching for the text would hit the wrong
// sentence in a draft that repeats one.
const cellBody = cellRuns.map((run) => run.text).join("");
test.assert(
  cells.every((cell) => cellBody.slice(cell.start, cell.end) === cell.text),
  "every cell offset names its own span of the body"
);
const twice = context.grainSentenceCells([{ text: "一样的话。一样的话。", source: "author", generation: 0 }]);
test.assert(
  twice.length === 2 && twice[0].start === 0 && twice[1].start === 5,
  "two identical sentences keep separate offsets"
);

// The histogram. It measures, it does not judge: no threshold lives here, and
// the evidence a writer reads is their own negative beside the current body.
const wide = context.grainHistogramForText("他要的不是流程图。是出事了找谁。上一版没人看，因为写给了流程，不是写给人，交接的时候没人翻开过它。短。");
const flat = context.grainHistogramForText("他需要的并不是一张流程图。他真正需要的是出事了找谁。上一版的交接文档没有人看。这次要换一个写法。");
test.assert(wide.count === 4 && flat.count === 4, "both drafts are four sentences, so the shape is the only difference");
test.assert(wide.spread > 0 && flat.spread === 0, "a draft pulled to one sentence length has no spread left");
test.assert(wide.longest > flat.longest && wide.shortest < flat.shortest, "flattening cuts the long sentences and pads the short ones");

const buckets = wide.buckets;
test.assert(buckets.length === 12, "the axis is twelve buckets");
test.assert(buckets[0].from === 0 && buckets[0].to === 4 && buckets[1].from === 5, "each bucket is five characters wide");
test.assert(buckets[11].to === 0, "the last bucket is open-ended so a long sentence is never dropped");
test.assert(
  buckets.reduce((sum, bucket) => sum + bucket.total, 0) === wide.count,
  "every sentence lands in exactly one bucket"
);

const mixed = context.grainHistogram([
  { text: "作者写的一句话。", generation: 0 },
  { text: "模型改过的一句。", generation: 2 },
]);
const mixedBucket = mixed.buckets.find((bucket) => bucket.total === 2);
test.assert(Boolean(mixedBucket) && mixedBucket.model === 1, "a bucket counts how many of its sentences the model wrote");
test.assert(context.grainHistogram([]).count === 0 && context.grainHistogram([]).peak === 0, "an empty draft measures zero, not NaN");

// The history brush finds the sentence an earlier version had in the same
// place in the argument, not the same place in the file.
const older = "他要的不是流程图。上一版没人看。所以这次换个写法。";
const rewritten = "他需要的并不是一张流程图。";
const found = context.grainAncestorSentence(rewritten, older);
test.assert(Boolean(found) && found.text === "他要的不是流程图。", "a rewritten sentence finds the one it was rewritten from");
test.assert(found.unchanged === false, "an ancestor that differs is offered as a restore");

const moved = context.grainAncestorSentence("所以这次换个写法。", "所以这次换个写法。他要的不是流程图。");
test.assert(Boolean(moved) && moved.unchanged === true, "a sentence that only moved reports nothing to restore");

test.assert(
  context.grainAncestorSentence("完全无关的一句话，讲的是别的事情。", older) === null,
  "a sentence with no ancestor returns nothing rather than the nearest thing available"
);
test.assert(context.grainAncestorSentence("", older) === null, "an empty sentence has no ancestor");
test.assert(context.grainAncestorSentence("他要的不是流程图。", "") === null, "an empty version has no ancestors to give");

// The canvas frame measures and marks; it never removes anything, because
// cropping is the writer choosing what to lose, one sentence at a time.
const frameCells = [
  { text: "一二三四五。" },
  { text: "六七八九十。" },
  { text: "十一十二十三。" },
];
const frame = context.grainCanvasFrame(frameCells, 12);
test.assert(frame.total === 19, "the frame measures the whole draft, including what falls outside it");
test.assert(frame.inside === 2 && frame.edge === 2, "the edge is the first sentence that no longer fits");
test.assert(frame.marks[0].fits && frame.marks[1].fits && !frame.marks[2].fits, "every sentence is marked inside or outside, none is dropped");
test.assert(frame.over === 7, "the overflow is stated in the same unit as the target");
test.assert(frame.marks.length === frameCells.length, "the frame returns one mark per sentence, always");

const noTarget = context.grainCanvasFrame(frameCells, 0);
test.assert(noTarget.marks.every((mark) => mark.fits) && noTarget.edge === -1 && noTarget.over === 0, "with no target nothing is outside");
test.assert(
  context.grainCanvasFrame(frameCells, 12, () => 1).inside === 3,
  "the measure is injected, so the frame counts words or seconds without knowing which"
);

test.finish();
