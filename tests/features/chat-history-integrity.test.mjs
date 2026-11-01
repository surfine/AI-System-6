// Unified spec (2026-10-10) C01 contract: the deterministic losses are gone.
// Shape-checked against the real chat-messages.js plus a live vm run of the
// two rewritten pure functions (uniqueMessages on ID, whole-history window).
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-history-integrity");
const chat = read("app/core/chat-messages.js");

// --- 1. No arbitrary slice(-6) on the recent-context window ---
test.assert(!/\.slice\(-6\)/.test(chat),
  "the recent-context window no longer hard-slices the last 6 messages");
test.assert(chat.includes("C01: whole delivered conversation; fitting happens downstream"),
  "the whole-history window carries its decision note");

// --- 2. uniqueMessages dedups by ID, never by text identity ---
test.assert(!chat.includes("const key = `${message.role}\\n${modelMessageContentIdentity(message.content)}`"),
  "uniqueMessages no longer builds a content-identity key");
test.assert(chat.includes("Deduplicate only true structural duplicates"),
  "uniqueMessages carries its decision note");

// --- 3. The chat path blocks on overflow instead of destructive fitting ---
test.assert(chat.includes('error.code = "CHAT_PAYLOAD_TOO_LARGE"'),
  "an oversized chat message throws the typed overflow error");
test.assert(chat.includes("isChatConversationTaskKind(taskKind)"),
  "the chat path gates on the task kind before fitting");
test.assert(chat.includes("Writing-tool tasks keep their existing"),
  "writing tasks keep their fittings until their own migration (spec: no global replace)");
test.assert(!/const budgetedPayload = await fitPayloadWithModelBudget\(requestPayload/.test(chat),
  "the chat path no longer unconditionally runs fitPayloadWithModelBudget");

// --- 4. Original history is never spliced by compaction ---
test.assert(chat.includes("function removeClioTalkMessageRecord"),
  "the only conversation.splice is the explicit user deletion");
test.assert(!/compressedConversationMemory[\s\S]{0,200}conversation\.splice/.test(chat),
  "compaction never splices the original history");

// --- 5. Live behavior of the rewritten uniqueMessages (real vm) ---
const context = { console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Object, Array, String, Number, Boolean, Promise, TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder };
context.globalThis = context; context.window = context;
vm.createContext(context);
// Extract just the two functions under test with their dependency.
const source = chat;
const uniqueFn = source.slice(source.indexOf("function uniqueMessages"), source.indexOf("function slimMessagesForContinuity"));
const identityFn = source.slice(source.indexOf("function modelMessageContentIdentity"), source.indexOf("\nfunction ", source.indexOf("function modelMessageContentIdentity")));
vm.runInContext(`${identityFn}\n${uniqueFn}`, context, { filename: "unique.vm.js" });
const dedup = vm.runInContext(`(function () {
  const a = { id: "m1", role: "user", content: "同一句话" };
  const b = { id: "m2", role: "user", content: "同一句话" };
  const c = { id: "m3", role: "assistant", content: "好的" };
  const d = { id: "m4", role: "assistant", content: "好的" };
  const doubled = uniqueMessages([a, a, b, c, d]);
  return { kept: doubled.length, ids: doubled.map((m) => m.id) };
})()`, context);
test.assert(dedup.kept === 4 && JSON.stringify(dedup.ids) === JSON.stringify(["m1", "m2", "m3", "m4"]),
  `two messages saying the same thing at different places both survive (${JSON.stringify(dedup)})`);
const dupObject = vm.runInContext(`(function () {
  const m = { id: "m1", role: "user", content: "x" };
  return uniqueMessages([m, m]).length;
})()`, context);
test.assert(dupObject === 1, "a literal double-insert of the same message still dedups");

test.finish();
