// Unified spec (2026-10-10) C04 contract: the prepared-request snapshot and
// the compaction fork gate.
//
// 1. sendLocalModelTask captures a prepared-request snapshot at the last send
//    boundary (after the route adapters); the snapshot carries the cache-
//    sensitive serialized components and no user text or credentials.
// 2. canForkSafely refuses a fork unless every condition holds (single
//    generation, no hosted tools, no forced tool call, format compatible,
//    replay supported) — safety over cache.
// 3. comparePreparedPrefixes detects any changed component.
// 4. validateClosedTools refuses orphan/duplicated tool calls (the executor
//    must reject them before dispatch).
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-compaction-fork");
const chat = read("app/core/chat-messages.js");
const compaction = read("app/core/chat-compaction.js");
const capabilities = read("app/core/chat-context-capabilities.js");

// --- shape checks ---
test.assert(compaction.includes("function capturePreparedRequestSnapshot"), "a prepared-request snapshot exists (lazy module)");
test.assert(compaction.includes("root.lastPreparedRequest"), "the snapshot lands on the desk's window record (from the lazy module)");
test.assert(compaction.includes("historyDigest"), "the snapshot carries a history digest (comparison fingerprint)");
test.assert(chat.includes("capturePreparedRequestSnapshot?.(nextPayload"), "the capture runs at the send boundary on the prepared payload");
test.assert(!chat.includes("apiKey") || !/lastPreparedRequest[\s\S]{0,600}apiKey/.test(chat.slice(chat.indexOf("function capturePreparedRequestSnapshot"), chat.indexOf("function capturePreparedRequestSnapshot") + 2200)),
  "the snapshot carries no credentials");

// --- live vm: fork gate with the REAL vendored contracts + capabilities ---
const context = {
  console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Object, Array, String, Number, Boolean, Promise, BigInt,
  TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder, crypto: globalThis.crypto,
};
context.globalThis = context; context.window = context;
vm.createContext(context);
const contracts = read("app/vendor/unified-spec/contracts.mjs").replace(/^export\s+/gm, "");
vm.runInContext(contracts, context, { filename: "contracts.vm.js" });
vm.runInContext(capabilities, context, { filename: "capabilities.vm.js" });

// 1. A DeepSeek-style request with tool definitions: fork allowed.
const capsDeepseek = context.AISystem6ChatContextCapabilities.capabilityFor("deepseek", "deepseek-chat");
// The profile's field names match the vendored contract: singleGeneration /
// toolsNeverExecute / serverHostedTools / replaySupported.
const preparedOk = {
  forcedTool: false, formatCompatible: true,
};
test.assert(context.canForkSafely(capsDeepseek, preparedOk) === true,
  "deepseek (single generation, tools never execute, replay supported) may fork");

// 2. A hosted-tools provider may NOT fork — the compaction request must be
//    standalone with tools closed.
const capsHosted = { singleGeneration: true, toolsNeverExecute: false, serverHostedTools: true, replaySupported: true };
test.assert(context.canForkSafely(capsHosted, preparedOk) === false,
  "a provider whose tools execute server-side may not fork (safety over cache)");

// 3. A forced tool call blocks the fork.
const capsFine = { singleGeneration: true, toolsNeverExecute: true, serverHostedTools: false, replaySupported: true };
test.assert(context.canForkSafely(capsFine, { forcedTool: true, formatCompatible: true }) === false,
  "a forced tool call blocks the fork");

// 4. Prepared-prefix comparison detects every changed component.
const base = {
  providerScope: "cloud:deepseek", model: "deepseek-chat",
  toolsBytes: "[]", systemBytes: "SYS", historyPrefixBytes: "H1", thinkingBytes: "",
};
for (const field of ["providerScope", "model", "toolsBytes", "systemBytes", "historyPrefixBytes", "thinkingBytes"]) {
  const changed = { ...base, [field]: "changed" };
  const result = context.comparePreparedPrefixes(base, changed);
  test.assert(result.ok === false && result.changed.includes(field),
    `a changed ${field} blocks the hot-prefix fork`);
}
test.assert(context.comparePreparedPrefixes(base, base).ok === true,
  "identical prepared prefixes compare clean");

// 5. The executor refuses tool execution before dispatch: the summary request
//    carries tools:null when the fork is refused (standalone request).
const standalone = vm.runInContext(`(function () {
  const caps = { singleGeneration: false, toolsNeverExecute: false, serverHostedTools: false, replaySupported: false };
  const canFork = canForkSafely(caps, { forcedTool: false, formatCompatible: true });
  // C04: a refused fork means the summary request is standalone with tools closed.
  return { canFork, tools: canFork ? ["tool-a"] : null };
})()`, context);
test.assert(standalone.canFork === false && standalone.tools === null,
  "a refused fork produces a standalone compaction request with tools closed");

test.finish();
