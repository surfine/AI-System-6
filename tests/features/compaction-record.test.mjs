// Unified spec (2026-10-10) C02 contract: the send view is separate from the
// original record — versioned compaction records, legacy-unverified handling,
// the user-role envelope, CAS-style coverage commit, and buildPayload that
// assembles without advancing coverage.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("compaction-record");
const chat = read("app/core/chat-messages.js");
const compaction = read("app/core/chat-compaction.js");

// --- shape checks over the real source ---
test.assert(compaction.includes("function compactionRecordVersion1"), "a versioned v1 compaction record exists (lazy module)");
test.assert(compaction.includes('kind: "conversation-compaction"'), "the record carries the conversation-compaction kind");
test.assert(chat.includes("legacy-unverified") || chat.includes("legacyRebuildable"),
  "legacy records are kept readable but marked unverified");
test.assert(compaction.includes("function commitCompactionRecord"), "the CAS-style commit exists (lazy module)");
test.assert(compaction.includes("boundary.id !== record.throughMessageId || hash !== record.coveredHash"),
  "the commit verifies the boundary message id AND the covered hash");
test.assert(compaction.includes('role: "user"') && compaction.includes("content: JSON.stringify({"),
  "the summary rides a USER-role envelope built in the lazy module, never system");
test.assert(chat.includes('"historical_context_data"'),
  "the envelope carries the historical-context kind (not an instruction)");
test.assert(/isChatConversationTaskKind\(taskKind\)\) \{[\s\S]{0,300}?commitCompactionRecord\(compressedConversationMemory\)/.test(chat),
  "the commit happens in the send path, after the payload is chosen");

// --- live vm behavior: record build, CAS commit, stale rejection ---
const context = {
  console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Object, Array, String, Number, Boolean, Promise, BigInt,
  TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder, crypto: globalThis.crypto,
  cloudConfig: undefined, activeProjectId: "proj-1", activeChatFileId: "chat-1",
  scheduleSettingsSave: () => {}, clipContextContent: (text) => String(text || ""),
  clioRunHash: (text) => {
    // A deterministic hash (the real clioRunHash is FNV-1a; any stable hash works here)
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
  },
};
context.globalThis = context; context.window = context;
context.conversation = [];
context.workingSessionContextEpoch = () => 7;
// The compaction functions read a few desk globals; stub them to the values
// a plain chat on a mounted project would see.
context.sideAskEnabled = false;
context.isMultiFinderMode = () => true;
context.clioTalkTemporaryMode = false;
context.rememberInput = { checked: true };
context.compressedConversationMemory = null;
context.clioRunHash = context.clioRunHash || ((text) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < String(text).length; index += 1) {
    hash ^= String(text).charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
});
context.messageRoleLabel = (role) => (role === "user" ? "用户" : "助手");
context.clioTalkAssistantDisplayName = () => "助手";
context.importantConversationLines = (content, limit) => String(content || "").split(/\n+/).filter(Boolean).slice(0, limit);
vm.createContext(context);

const fns = [];
for (const name of [
  "uniqueMessages", "modelMessageContentIdentity",
  "compactConversationMemoryIfNeeded", "commitCompactionRecord",
]) {
  // The slice starts at "function", but async functions must start at their
  // "async" keyword or the extracted body loses its await context.
  let start = chat.indexOf(`function ${name}`);
  const asyncStart = chat.indexOf(`async function ${name}`);
  if (asyncStart >= 0 && asyncStart < start) start = asyncStart;
  if (start < 0) { test.assert(false, `function ${name} found in source`); continue; }
  // Take up to the next top-level function declaration.
  const next = chat.indexOf("\nasync function ", start + 1) >= 0
    ? Math.min(
        chat.indexOf("\nfunction ", start + 1) < 0 ? Infinity : chat.indexOf("\nfunction ", start + 1),
        chat.indexOf("\nasync function ", start + 1) < 0 ? Infinity : chat.indexOf("\nasync function ", start + 1),
      )
    : chat.indexOf("\nfunction ", start + 1);
  const end2 = next === Infinity || next < 0 ? chat.length : next;
  fns.push(chat.slice(start, end2));
}
// The record/hash/commit trio and the pure formatters live in the lazy side module.
for (const name of ["conversationCoveredHash", "compactionRecordVersion1", "legacyCompactionIsRebuildable", "commitCompactionRecord", "compactionEnvironmentCurrent", "compactMessageForMemory", "buildConversationMemoryText"]) {
  const start = compaction.indexOf(`function ${name}`);
  test.assert(start >= 0, `${name} lives in the lazy compaction module`);
  const next = compaction.indexOf("\n  function ", start + 1);
  const end = next < 0 ? compaction.indexOf("\n})(", start) : next;
  fns.push(compaction.slice(start, end < 0 ? compaction.length : end));
}
test.assert(fns.length === 11, "all compaction functions extracted from their modules");
// The lazy module itself installs root.AISystem6ChatCompaction.
vm.runInContext(compaction, context, { filename: "chat-compaction.vm.js" });
vm.runInContext(`const root = this;\nfunction chatCompactionApi() { return root.AISystem6ChatCompaction || null; }\nfunction root_setCompactionRoleLabel() { this.__compactionRoleLabel = (r) => (r === 'user' ? '用户' : '助手'); }\n${fns.join("\n")}`, context, { filename: "compaction.vm.js" });

// Build a candidate: 6 covered messages, boundary message m6.
vm.runInContext(`this.conversation = [
  { id: "m1", role: "user", content: "第一问" },
  { id: "m2", role: "assistant", content: "第一答" },
  { id: "m3", role: "user", content: "第二问" },
  { id: "m4", role: "assistant", content: "第二答" },
  { id: "m5", role: "user", content: "第三问" },
  { id: "m6", role: "assistant", content: "第三答" },
  { id: "m7", role: "user", content: "第四问" },
];`, context);
const candidate = await vm.runInContext(`(async () => {
  await compactConversationMemoryIfNeeded({ keepMessages: 1, force: true, model: "test-model" });
  return window.compressedConversationMemory ? JSON.parse(JSON.stringify(window.compressedConversationMemory)) : null;
})()`, context);
test.assert(candidate && candidate.version === 1 && candidate.kind === "conversation-compaction",
  `the candidate is a v1 conversation-compaction record (${candidate && candidate.version})`);
test.assert(candidate.throughMessageId === "m6" && candidate.firstKeptMessageId === "m7"
  && candidate.coveredHash.length > 0 && candidate.committed === false,
  "the candidate names its boundary, its first kept message, its hash — and is uncommitted");

// Commit against the unchanged conversation succeeds.
const committed = vm.runInContext(`(function () {
  const result = commitCompactionRecord(window.compressedConversationMemory, window.conversation, {
    commit: (committedRecord) => { window.compressedConversationMemory = committedRecord; },
  });
  return result ? { committed: result.committed, through: result.throughMessageId } : null;
})()`, context);
test.assert(committed && committed.committed === true && committed.through === "m6",
  "committing against the unchanged conversation succeeds");

// A moved conversation rejects the stale candidate.
const staleRejected = vm.runInContext(`(function () {
  // Roll the record back to uncommitted, then edit the covered history.
  window.compressedConversationMemory.committed = false;
  window.conversation[2].content = "被编辑过的第二问";
  const result = commitCompactionRecord(window.compressedConversationMemory, window.conversation, {});
  return { rejected: result === null, stillUncommitted: window.compressedConversationMemory.committed === false };
})()`, context);
test.assert(staleRejected.rejected && staleRejected.stillUncommitted,
  "a candidate whose covered messages changed is refused and stays uncommitted");

// Legacy rebuild: a legacy record whose boundary message survives is rebuildable.
const legacy = vm.runInContext(`(function () {
  // The conversation m6 content edit above means the legacy check must look
  // at its own recorded index, not at the hash.
  window.conversation[2].content = "第二问";
  return legacyCompactionIsRebuildable({ sourceMessages: 6, text: "旧摘要" }, window.conversation);
})()`, context);
test.assert(legacy === true, "a legacy record with its boundary message still present is rebuildable");

test.finish();
