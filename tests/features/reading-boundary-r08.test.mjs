// Unified spec (2026-10-10) R08 contract: the reader's read boundary filters
// BEFORE retrieval (the vendored selectReadableBlocks is the authority) and
// again at request validation; a request anchored past the boundary is
// refused with the reason, never answered from loaded-but-unauthorized text.
// Unlimited is an explicit choice. The scope statement controls what the desk
// sends and states — does not promise about — model pretraining. Rereading
// shows the reader's own questions and understanding log: no quiz, no score.
// Drives the REAL lazy module with the REAL vendored contracts.
import vm from "node:vm";
import * as contracts from "../../apps/desktop/app/vendor/unified-spec/contracts.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reading-boundary-r08");
const source = read("app/features/reading-boundary.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Map, Error, Boolean, Promise, Date };
context.globalThis = context; context.window = context;
context.ClioWorksUnifiedContracts = { ...contracts };
context.clioRunHash = (t) => "h";
vm.createContext(context);
vm.runInContext(source, context, { filename: "reading-boundary.vm.js" });
const api = context.window.AISystem6ReadingBoundary;
test.assert(!!api && typeof api.readableBlocks === "function" && typeof api.requestWithinBoundary === "function",
  "the boundary module installs its full surface");

// Boundaries: block, time, or an explicit unlimited. Nothing else.
test.assert(api.buildBoundary({ kind: "block", blockOrder: 5 })?.blockOrder === 5,
  "a block boundary builds");
test.assert(api.buildBoundary({ kind: "time", timeMs: 90000 })?.timeMs === 90000,
  "a time boundary builds");
test.assert(api.buildBoundary({ kind: "unlimited" })?.kind === "unlimited",
  "unlimited is a buildable, explicit choice");
test.assert(api.buildBoundary({ kind: "block", blockOrder: -1 }) === null
  && api.buildBoundary({ kind: "block", blockOrder: 2.5 }) === null
  && api.buildBoundary({ kind: "time", timeMs: "soon" }) === null
  && api.buildBoundary({ kind: "vibes" }) === null,
  "invalid boundaries are refused, not defaulted");

// Filtering BEFORE retrieval — the vendored contract is the authority.
const blocks = [
  { order: 0, text: "第一段。" },
  { order: 1, text: "第二段。" },
  { order: 2, text: "剧透：主角其实没死。" },
  { order: 3, text: "结局。" },
];
const readable = api.readableBlocks(blocks, api.buildBoundary({ kind: "block", blockOrder: 1 }));
test.assert(readable.length === 2 && readable.every((block) => block.order <= 1),
  "block filtering reaches only the allowed orders");
test.assert(api.readableBlocks(blocks, api.buildBoundary({ kind: "unlimited" })).length === 4,
  "explicit unlimited reads everything");
const timed = api.readableBlocks([
  { startMs: 10000, text: "开场。" },
  { startMs: 30000, text: "中段。" },
  { startMs: 80000, text: "结局。" },
], api.buildBoundary({ kind: "time", timeMs: 60000 }));
test.assert(timed.length === 2 && timed.every((block) => block.startMs <= 60000),
  "time filtering keeps blocks that start before the reader's position");

// Passage admission mirrors the same boundary.
const inside = { blockOrder: 1 };
const outside = { blockOrder: 2 };
const blockBoundary = api.buildBoundary({ kind: "block", blockOrder: 1 });
test.assert(api.passageAllowed(inside, blockBoundary) === true
  && api.passageAllowed(outside, blockBoundary) === false,
  "passage admission matches the block boundary");
test.assert(api.passageAllowed({ startMs: 50000 }, api.buildBoundary({ kind: "time", timeMs: 60000 })) === true
  && api.passageAllowed({ startMs: 70000 }, api.buildBoundary({ kind: "time", timeMs: 60000 })) === false,
  "passage admission matches the time boundary");

// 规格原话：允许范围不足就说明 — the refusal names what is outside.
const request = api.requestWithinBoundary([inside, outside], blockBoundary);
test.assert(request.ok === false && request.reason === "beyond-read-boundary"
  && request.outsideCount === 1
  && request.message.includes("未授权的后文"),
  "an over-boundary request is refused with the reason, never answered from the tail");
const fine = api.requestWithinBoundary([inside], blockBoundary);
test.assert(fine.ok === true && fine.allowedRefs.length === 1,
  "an within-boundary request passes with its refs");
test.assert(api.requestWithinBoundary([], blockBoundary).reason === "no-anchors",
  "an anchorless request is refused outright");
test.assert(api.requestWithinBoundary([outside], null).ok === true,
  "no boundary at all admits everything (the desk default is explicit elsewhere)");

// The scope statement controls what the desk sends — and says what it cannot.
const statement = api.scopeStatement(blockBoundary);
test.assert(statement.includes("第 1 段") && statement.includes("只用这个范围里的内容"),
  "the statement names the boundary and what it governs");
test.assert(statement.includes("不约束模型预训练"),
  "the statement does not promise about model pretraining — it says so");

// Rereading: the reader's own trail, no quiz, no score.
const trail = api.rereadingTrail({
  openQuestions: [
    { id: "q1", gap: "合并后单期是多少？", quote: "预算合并为 1200 万", status: "open" },
    { id: "q2", gap: "口径出处？", quote: "附录给出口径", status: "resolved", resolvedBy: "附录第二段" },
    { id: "q3", gap: "已撤回的问题", quote: "x", status: "withdrawn" },
  ],
  understandingLog: [
    { at: "2026-10-01T00:00:00Z", note: "以为是分期" },
    { at: "2026-10-11T00:00:00Z", note: "原来是合并口径" },
  ],
});
test.assert(trail.questions.length === 2
  && !trail.questions.some((question) => question.id === "q3"),
  "withdrawn questions do not resurface in rereading");
test.assert(trail.questions.find((question) => question.id === "q2").resolvedBy === "附录第二段",
  "a resolved question shows what answered it");
test.assert(trail.changes.length === 2 && trail.changes.every((change) => change.authoredBy === "reader"),
  "understanding changes stay the reader's own words");
test.assert(trail.quiz === null && trail.score === null,
  "no quiz and no score — rereading is not a test");

test.finish();
