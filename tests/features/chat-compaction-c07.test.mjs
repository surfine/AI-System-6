// Unified spec (2026-10-10) C07 contract: commit-time environment CAS and the
// native chain rebuild. Drives the REAL lazy chat-compaction module: the
// commit only lands when the covered hash, boundary message id, chat/branch,
// provider scope, model, context epoch and lease epoch are ALL still current;
// any mismatch leaves the previous coverage standing. After a committed
// compaction the native response chain is rebuilt from the new view.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-compaction-c07");
const compactionSource = read("app/core/chat-compaction.js");

const context = {
  console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Object, Array, String, Number, Boolean, Promise,
  TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder,
};
context.globalThis = context; context.window = context;
context.clioRunHash = (text) => {
  let hash = 0x811c9dc5;
  const text2 = String(text || "");
  for (let index = 0; index < text2.length; index += 1) {
    hash ^= text2.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};
vm.createContext(context);
vm.runInContext(compactionSource, context, { filename: "chat-compaction.vm.js" });
const api = context.window.AISystem6ChatCompaction;
test.assert(!!api && typeof api.commitCompactionRecord === "function", "the lazy compaction module installs");

const conversation = [
  { id: "m1", role: "user", content: "第一问" },
  { id: "m2", role: "assistant", content: "第一答" },
  { id: "m3", role: "user", content: "第二问" },
  { id: "m4", role: "assistant", content: "第二答" },
  { id: "m5", role: "user", content: "第三问" },
  { id: "m6", role: "assistant", content: "第三答" },
  { id: "m7", role: "user", content: "第四问" },
];

const prepare = (over = {}) => api.prepareCandidate(conversation, {
  keepMessages: 1, force: true, model: "deepseek-chat",
  projectId: "proj-1", chatId: "chat-1", branchId: "main",
  leaseEpoch: 5, providerScope: "cloud:deepseek", contextEpoch: 3,
  uniqueTurns: api.uniqueTurns, roleLabel: (r) => r,
  clip: (t, l) => String(t || "").slice(0, l),
  ...over,
});

const candidate = prepare();
test.assert(!!candidate && candidate.committed === false, "the candidate is uncommitted");

// 1. Commit with the matching environment lands.
const environment = { projectId: "proj-1", chatId: "chat-1", branchId: "main",
  providerScope: "cloud:deepseek", model: "deepseek-chat", contextEpoch: 3, leaseEpoch: 5, cancelled: false };
const committed = api.commitCompactionRecord(candidate, conversation, {
  environment, commit: (record) => { context.committedRecord = record; },
});
test.assert(committed && committed.committed === true, "the commit lands when the environment matches");

// 2. Each scope mismatch blocks the commit.
const cases = [
  ["chatId", "chat-2"], ["branchId", "other"], ["providerScope", "local"],
  ["model", "other-model"], ["contextEpoch", 99], ["leaseEpoch", 99],
];
for (const [key, value] of cases) {
  const fresh = prepare();
  const moved = { ...environment, [key]: value };
  const blocked = api.commitCompactionRecord(fresh, conversation, { environment: moved, commit: () => {} });
  test.assert(blocked === null, `a moved ${key} blocks the commit (环境 CAS)`);
}

// 3. Cancellation blocks the commit regardless of scope.
const cancelled = api.commitCompactionRecord(prepare(), conversation, {
  environment: { ...environment, cancelled: true }, commit: () => {},
});
test.assert(cancelled === null, "a cancelled compaction never commits");

// 4. Native chain rebuild.
test.assert(api.nativeChainInvalidAfterCompaction() === true,
  "a committed compaction invalidates the old native response chain (从新视图建新链)");

test.finish();
