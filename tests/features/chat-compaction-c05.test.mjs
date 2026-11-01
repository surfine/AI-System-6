// Unified spec (2026-10-10) C05 contract: summary content and permissions.
// Drives the REAL lazy chat-compaction module: pins are app-verified against
// the original messages (never model-claimed), model-produced summaries are
// structurally validated before any record commits, assistant suggestions are
// never written as user decisions, and provenance (open questions, covered
// message ids, source versions) travels with the record.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-compaction-c05");
const compaction = read("app/core/chat-compaction.js");

const context = {
  console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Object, Array, String, Number, Boolean, Promise, BigInt,
  TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder,
};
context.globalThis = context; context.window = context;
// The lazy module hashes via root.clioRunHash — provide a deterministic stand-in.
context.clioRunHash = (text) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < String(text).length; index += 1) {
    hash ^= String(text).charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};
vm.createContext(context);
vm.runInContext(compaction, context, { filename: "chat-compaction.vm.js" });
const api = context.window.AISystem6ChatCompaction;
test.assert(!!api && typeof api.prepareCandidate === "function", "the lazy compaction module installs");

// The originals are real messages with ids — the pin validation base.
const originals = [
  { id: "m1", role: "user", content: "这台机器的导出用了 42 秒。" },
  { id: "m2", role: "assistant", content: "好的，我记下了这个时间。" },
  { id: "m3", role: "user", content: "为什么是 42 秒？" },
];

// 1. Pin validation: a real quote passes; a fabricated one is refused.
test.assert(api.validatePins(
  [{ messageId: "m1", text: "导出用了 42 秒" }], originals,
), "a pin quoting its cited message validates");
test.assert(!api.validatePins(
  [{ messageId: "m1", text: "这句不在原消息里" }], originals,
), "a pin whose text is absent from the cited message is refused (不靠模型自报)");
test.assert(!api.validatePins([{ messageId: "missing", text: "x" }], originals),
  "a pin citing an unknown message is refused");

// 2. Summary structural validation.
const okSummary = { text: "要点如下", stopReason: "stop", throughMessageId: "m3" };
const checked = api.validateSummary(okSummary, { expectedThrough: "m3" });
test.assert(checked.ok === true, "a clean summary passes structural validation");
test.assert(!api.validateSummary({ ...okSummary, toolCalls: [{ id: "t" }] }, {}).ok,
  "a summary requesting tools is refused (工具请求拒绝)");
test.assert(!api.validateSummary({ text: "", stopReason: "stop" }, {}).ok,
  "an empty summary is refused");
test.assert(api.validateSummary({ text: "x".repeat(16001), stopReason: "stop" }, {}).reason === "oversize",
  "an oversize summary is refused");
test.assert(api.validateSummary({ text: "x", stopReason: "stop", throughMessageId: "m9" }, { expectedThrough: "m3" }).reason === "wrong-coverage",
  "a summary covering different messages is refused (wrong-coverage)");

// 3. Provenance travels: open questions and accepted decisions ride the record.
const conversation = [
  { id: "m1", role: "user", content: "第一问" },
  { id: "m2", role: "assistant", content: "第一答" },
  { id: "m3", role: "user", content: "第二问" },
  { id: "m4", role: "assistant", content: "第二答" },
  { id: "m5", role: "user", content: "第三问" },
  { id: "m6", role: "assistant", content: "第三答" },
  { id: "m7", role: "user", content: "第四问" },
];
const candidate = api.prepareCandidate(conversation, {
  keepMessages: 1,
  force: true,
  model: "test-model",
  projectId: "proj-1",
  chatId: "chat-1",
  contextEpoch: 3,
  openQuestionIds: ["q-1"],
  acceptedDecisions: [{ decision: "keep-42s", by: "user" }],
  sourceVersions: { "doc:1": 4 },
  // The host's own dedup policy, role vocabulary and clipping budget.
  uniqueTurns: (messages) => api.uniqueTurns(messages),
  roleLabel: (role) => (role === "user" ? "用户" : "助手"),
  clip: (text, limit) => String(text || "").slice(0, limit),
});
test.assert(candidate.openQuestionIds.includes("q-1") && candidate.acceptedDecisions[0].by === "user"
  && candidate.sourceVersions["doc:1"] === 4,
  "open questions and USER-made accepted decisions travel with the record");
test.assert(candidate.coveredMessageIds.length === 6 && candidate.coveredMessageIds[0] === "m1",
  "the covered message ids are listed (C05 provenance)");

// 4. Assistant suggestions are never written as user decisions: prepareCandidate
//    ignores a model-injected acceptedDecisions field on the context unless the
//    host passed it — simulate a model trying to self-accept.
const tampered = api.prepareCandidate(conversation, {
  keepMessages: 1, force: true,
  uniqueTurns: (messages) => api.uniqueTurns(messages),
  roleLabel: (role) => role,
  clip: (text, limit) => String(text || "").slice(0, limit),
  acceptedDecisions: [{ decision: "auto-accepted", by: "assistant" }],
});
test.assert(tampered.acceptedDecisions.every((d) => d.by === "assistant"),
  "the record preserves who made each decision (助手建议不写成用户决定)");

test.finish();
