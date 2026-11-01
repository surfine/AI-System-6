// Unified spec (2026-10-10) C07 contract: the native response chain rebuilds
// after a committed compaction — clioTalkPreviousNativeResponseId refuses the
// old response id when the compaction's coverage advanced past the turn the
// response was built against. Drives the REAL host accessor in a vm.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-native-chain-c07");
const chat = read("app/core/chat-messages.js");

const context = {
  console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Object, Array, String, Number, Boolean, Promise,
};
context.globalThis = context; context.window = context;
context.conversation = [];
context.compressedConversationMemory = null;
context.currentClioTalkNativeResponseScope = () => ({
  provider: "lm-studio", endpoint: "http://127.0.0.1:1", model: "served-model",
});
vm.createContext(context);

// Extract just the accessor (host function, no awaits).
const start = chat.indexOf("function clioTalkPreviousNativeResponseId");
let end = chat.indexOf("\nfunction ", start + 1);
if (end < 0) end = chat.length;
const fn = chat.slice(start, end);
vm.runInContext(fn, context, { filename: "native-id.vm.js" });
const run = (expr) => vm.runInContext(expr, context);

// The accessor only trusts a response whose recorded scope still matches the
// live one, and it looks for the turn currently being SENT (deliveryState on
// the trailing user record).
const nativeResponse = (id) => JSON.stringify({
  id, api: "lmstudio-native-v1",
  provider: "lm-studio", endpoint: "http://127.0.0.1:1", model: "served-model",
});

// Scenario A: no compaction, native response on the last assistant turn.
run(`conversation = [
  { id: "m1", role: "user", content: "一" },
  { id: "m2", role: "assistant", content: "一答", providerResponse: ${nativeResponse("resp-1")} },
  { id: "m3", role: "user", content: "二", deliveryState: "sending" },
];`);
const noCompaction = run("clioTalkPreviousNativeResponseId('chat')");
test.assert(noCompaction && noCompaction.id === "resp-1",
  "without compaction the previous native response id is returned");

// Scenario B: a committed compaction whose coverage reaches the user turn
// being sent (sourceMessages 2 >= the sending user's index 2) — the response
// predates the compaction boundary, so the chain must NOT continue from it.
run(`compressedConversationMemory = {
  committed: true, throughMessageId: "m2", coveredHash: "hash-x",
  sourceMessages: 2, providerScope: "local", contextEpoch: 1,
};`);
const covered = run("clioTalkPreviousNativeResponseId('chat')");
test.assert(covered === null,
  `a compaction covering the response's own turn refuses the old chain (${JSON.stringify(covered)})`);

// Scenario C: the compaction covers only BEFORE the served response — a later
// native response still serves as the chain prefix.
run(`conversation = [
  { id: "m1", role: "user", content: "一" },
  { id: "m2", role: "assistant", content: "一答", providerResponse: ${nativeResponse("resp-2")} },
  { id: "m3", role: "user", content: "二", deliveryState: "sent" },
  { id: "m4", role: "assistant", content: "二答", providerResponse: ${nativeResponse("resp-3")} },
  { id: "m5", role: "user", content: "三", deliveryState: "sending" },
];`);
run(`compressedConversationMemory = {
  committed: true, throughMessageId: "m2", coveredHash: "hash-y",
  sourceMessages: 2, providerScope: "local", contextEpoch: 1,
};`);
const stillServed = run("clioTalkPreviousNativeResponseId('chat')");
test.assert(stillServed && stillServed.id === "resp-3",
  `a later response still serves as the chain prefix (${JSON.stringify(stillServed)})`);

// Scenario D: legacy record (no committed marker) does not gate the chain.
run(`conversation = [
  { id: "m1", role: "user", content: "一" },
  { id: "m2", role: "assistant", content: "一答", providerResponse: ${nativeResponse("resp-4")} },
  { id: "m3", role: "user", content: "二", deliveryState: "sending" },
];`);
run(`compressedConversationMemory = { committed: false, sourceMessages: 99 };`);
const legacy = run("clioTalkPreviousNativeResponseId('chat')");
test.assert(legacy && legacy.id === "resp-4",
  `an uncommitted compaction does not gate the chain (${JSON.stringify(legacy)})`);

// Scenario E: the gate never widens the scope check — a changed endpoint
// still refuses the chain even with no compaction in play.
run(`compressedConversationMemory = null;`);
run(`currentClioTalkNativeResponseScope = () => ({
  provider: "lm-studio", endpoint: "http://127.0.0.1:2", model: "served-model",
});`);
const scopeMismatch = run("clioTalkPreviousNativeResponseId('chat')");
test.assert(scopeMismatch === null,
  `a mismatched endpoint still refuses the chain (${JSON.stringify(scopeMismatch)})`);

test.finish();
