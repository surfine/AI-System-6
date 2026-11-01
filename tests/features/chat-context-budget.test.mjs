// Unified spec (2026-10-10) C03 contract: the budget comes from the FINAL
// payload and the provider's REAL input limit; unknown providers get nulls,
// never advertised maxima; the vendor contextBudget formula matches the 8K
// test fixture (trigger 5888); the capability profile carries its doc version
// and refuses to guess for unlisted providers.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-context-budget");
const chat = read("app/core/chat-messages.js");
const capabilities = read("app/core/chat-context-capabilities.js");

// --- shape: readModelBudget consults the capability profile ---
test.assert(chat.includes("input_limit"), "the budget carries a separate input limit");
test.assert(chat.includes('"provider-input-limit"'), "a provider-derived budget names its source");
test.assert(chat.includes('"browser_estimate"'), "an unknown provider falls back to the browser estimate (named, not hidden)");
test.assert(chat.includes("resolveInputLimit"), "the budget consults the capability profile resolver");
test.assert(capabilities.includes("docVersion"), "the capability profile carries a documentation version");
test.assert(capabilities.includes('inputLimit: null'), "unknown providers carry null limits, never advertised maxima");

// --- live vm: the capability profile ---
const context = {
  console, Map, Set, JSON, Math, Date, Intl, RegExp, Error, Object, Array, String, Number, Boolean, Promise,
};
context.globalThis = context; context.window = context;
vm.createContext(context);
vm.runInContext(capabilities, context, { filename: "chat-context-capabilities.vm.js" });
const caps = context.AISystem6ChatContextCapabilities;

const deepseek = caps.capabilityFor("deepseek", "deepseek-flash");
test.assert(deepseek.known === true && deepseek.inputLimit === 1000000 && deepseek.contextWindow === 1000000,
  "deepseek's profile carries its documented input limit and window");
test.assert(deepseek.docVersion === "2026-10-19", "the profile names its documentation version");
const unknown = caps.capabilityFor("some-new-provider", "x");
test.assert(unknown.known === false && unknown.inputLimit === null && unknown.contextWindow === null,
  "an unlisted provider gets null limits (never advertised maxima)");
const fuzzy = caps.capabilityFor("deepseek-official", "");
test.assert(fuzzy.known === true, "provider name matching handles common variants");

// --- live vm: the vendored contextBudget formula (the spec's 8K fixture) ---
vm.runInContext(read("app/vendor/unified-spec/contracts.mjs").replace(/^export\s+/gm, ""), context, { filename: "contracts.vm.js" });
const vendoredBudget = vm.runInContext(`({
  over: contextBudget({ window: 8192, inputLimit: 8192, reply: 1024, summary: 1024, directive: 256, safety: 512, growth: 512, input: 6000 }),
  fitsCase: contextBudget({ window: 8192, inputLimit: 8192, reply: 1024, summary: 1024, directive: 256, safety: 512, growth: 512, input: 5000 }),
})`, context);
test.assert(vendoredBudget.over.trigger === 5888, `the 8K fixture trigger is 5888 (${vendoredBudget.over.trigger})`);
test.assert(vendoredBudget.over.needsCompaction === true, "6000 input needs compaction");
test.assert(vendoredBudget.fitsCase.needsCompaction === false && vendoredBudget.fitsCase.fitsNormal,
  "5000 input fits without compaction");

// --- the chat path's real readModelBudget honors a provider input limit ---
// Build a minimal vm around the real readModelBudget extraction.
const budgetContext = {
  console, setTimeout,
  AISystem6Perf: null,
  getEffectiveContextTokens: () => 8192,
  contextLengthInput: null,
  estimateTokenCount: (content) => Math.ceil(String(content).length / 4),
  defaultRequestedOutputTokens: () => 1024,
  reservedSafetyTokens: 512,
  clioCloudRouteActive: () => true,
  cloudConfig: { active: true, provider: "deepseek", model: "deepseek-flash" },
  AISystem6ChatContextCapabilities: caps,
};
budgetContext.globalThis = budgetContext;
budgetContext.window = budgetContext;
vm.createContext(budgetContext);
const budgetStart = chat.indexOf("async function readModelBudget");
const budgetEnd = chat.indexOf("\nasync function ", budgetStart + 1);
vm.runInContext(chat.slice(budgetStart, budgetEnd), budgetContext, { filename: "readModelBudget.vm.js" });
const realBudget = await budgetContext.readModelBudget({
  messages: [
    { role: "system", content: "x".repeat(2000) },
    { role: "user", content: "y".repeat(2000) },
    { role: "assistant", content: "z".repeat(2000) },
  ],
}, { taskKind: "chat" });
test.assert(realBudget.input_limit === 1000000 && realBudget.provider_scope === "cloud:deepseek",
  `the real readModelBudget resolves deepseek's input limit (${realBudget.input_limit}, ${realBudget.provider_scope})`);
test.assert(realBudget.budget_source === "provider-input-limit",
  "a known provider names its budget source provider-input-limit");
const localBudget = await vm.runInContext(`(async () => {
  clioCloudRouteActive = () => false;
  const b = await readModelBudget({ messages: [{ role: "user", content: "q" }] }, { taskKind: "chat" });
  return { source: b.budget_source, limit: b.input_limit };
})()`, budgetContext);
test.assert(localBudget.source === "browser_estimate" && localBudget.limit === null,
  "the local route keeps the browser estimate with no input limit");

test.finish();
