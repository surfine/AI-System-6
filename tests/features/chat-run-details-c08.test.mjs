// Unified spec (2026-10-10) C08 contract: usage accounting and the folded
// run-details panel. Drives the REAL lazy chat-run-details module, the REAL
// vendored contracts and cache policy, and the REAL eager delegates — usage
// rides the run receipt (native accounting or an explicit estimate), the
// context panel folds run details closed by default, and failure copy says
// the original context was not replaced.
import vm from "node:vm";
import * as contracts from "../../apps/desktop/app/vendor/unified-spec/contracts.mjs";
import * as cachePolicy from "../../apps/desktop/app/vendor/unified-spec/cache-policy.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-run-details-c08");
const chat = read("app/core/chat-messages.js");
const receipts = read("app/core/run-receipts.js");
const scrapbook = read("app/features/scrapbook.js");
const compaction = read("app/core/chat-compaction.js");
const runDetails = read("app/core/chat-run-details.js");

// --- 1. The vendored chain: normalizeUsage → cacheOutcome.
const deepseekUsage = contracts.normalizeUsage("deepseek", {
  prompt_tokens: 1000, prompt_cache_hit_tokens: 640, completion_tokens: 40,
});
test.assert(cachePolicy.cacheOutcome(deepseekUsage) === "hit",
  "deepseek cache hits read from prompt_cache_hit_tokens");
const openaiUsage = contracts.normalizeUsage("openai", { prompt_tokens: 100, completion_tokens: 5 });
test.assert(openaiUsage.reported === true && cachePolicy.cacheOutcome(openaiUsage) === "none",
  "a provider response without cache fields reports 'none', not a guess");
const blankUsage = contracts.normalizeUsage("openai", {});
test.assert(cachePolicy.cacheOutcome(blankUsage) === "unknown",
  "no usage at all is 'unknown'");
const writeUsage = contracts.normalizeUsage("anthropic", { input_tokens: 10, cache_creation_input_tokens: 8, output_tokens: 2 });
test.assert(cachePolicy.cacheOutcome(writeUsage) === "write",
  "anthropic cache creation reads as a write");

// --- 2. The lazy run-details module, booted in a vm with the real modules.
const host = {
  console, String, JSON, Number, Math,
  cloudConfig: { active: true, provider: "deepseek" },
  ClioWorksUnifiedContracts: { ...contracts },
  AISystem6ChatCachePolicy: { ...cachePolicy },
};
host.window = host;
host.globalThis = host;

/** Lift one top-level function's source out of a classic script. */
const slice = (source, name) => {
  const start = source.indexOf(`function ${name}`);
  const bounds = ["\nfunction ", "\n})(typeof window"]
    .map((marker) => source.indexOf(marker, start + 1))
    .filter((at) => at > start);
  return source.slice(start, bounds.length ? Math.min(...bounds) : source.length);
};

vm.createContext(host);
vm.runInContext(runDetails, host, { filename: "chat-run-details.vm.js" });
const api = host.window.AISystem6ChatRunDetails;
test.assert(!!api && typeof api.usageSummary === "function" && typeof api.renderInto === "function",
  "the lazy run-details module installs its full surface");

const native = api.usageSummary(
  { prompt_tokens: 1000, prompt_cache_hit_tokens: 640, completion_tokens: 40, cost_cny: 0.0021 },
  123,
);
test.assert(native.provider === "deepseek" && native.inputTokens === 1000 && native.outputTokens === 40,
  "the usage summary carries native input/output counts");
test.assert(native.cachedTokens === 640 && native.cacheOutcome === "hit",
  "the usage summary carries the provider's cache verdict");
test.assert(native.estimated === false && native.tokens === 40 && native.requests === 1,
  "native accounting is not marked as an estimate");
test.assert(native.costCny === 0.0021, "provider-reported cost travels");

const estimated = api.usageSummary({}, 123);
test.assert(estimated.estimated === true && estimated.tokens === 123 && estimated.cacheOutcome === "unknown",
  "without native usage the count is the desk's own estimate and the cache is unknown");

// --- 3. The receipt: usage rides the record; the eager side only forwards.
const kept = api.usageFromInput({
  provider: "deepseek", inputTokens: 1000, outputTokens: 40, cachedTokens: 640,
  cacheOutcome: "hit", costCny: 0.0021, estimated: false, tokens: 40,
  secretlyAttachedProviderPayload: { everything: true },
});
test.assert(kept.inputTokens === 1000 && kept.cacheOutcome === "hit" && kept.costCny === 0.0021,
  "the receipt keeps the usage fields it owns");
test.assert(kept.secretlyAttachedProviderPayload === undefined,
  "caller-attached extras do not become receipt evidence");
test.assert(api.usageLine(null) === "—",
  "no usage renders a plain dash");

const withApi = (expr) => vm.runInContext(expr, host);
const usedBody = withApi(`(function () {
  ${slice(receipts, "runReceiptIsAdopted")}
  ${slice(receipts, "formatRunReceiptBody")}
  return formatRunReceiptBody({
    sourceAppId: "clioTalk", status: "completed", runId: "r1",
    provider: "deepseek", model: "deepseek-chat", attempts: [],
    userAction: "", usage: ${JSON.stringify(kept)},
  });
})()`);
test.assert(usedBody.includes("- Usage: 40 tok out · 1000 tok in · 640 tok cached · cache hit · ¥0.0021 · provider-reported"),
  `the receipt body carries the full usage verdict (${usedBody.split("\n").find((line) => line.includes("Usage")) || "?"})`);

const estimatedBody = withApi(`(function () {
  ${slice(receipts, "runReceiptIsAdopted")}
  ${slice(receipts, "formatRunReceiptBody")}
  return formatRunReceiptBody({
    sourceAppId: "clioTalk", status: "completed", runId: "r2",
    provider: "lm-studio", model: "served", attempts: [],
    userAction: "", usage: { provider: "openai", inputTokens: 0, outputTokens: 123, cachedTokens: 0, cacheOutcome: "unknown", costCny: 0, requests: 1, estimated: true, tokens: 123 },
  });
})()`);
const estimatedLine = estimatedBody.split("\n").find((line) => line.includes("- Usage:")) || "";
test.assert(estimatedLine.includes("cache unknown") && estimatedLine.includes("estimated")
  && !estimatedLine.includes("¥"),
  "an estimate says estimated, an unverified cache says unknown, absent cost stays absent");

const oldBody = withApi(`(function () {
  ${slice(receipts, "runReceiptIsAdopted")}
  ${slice(receipts, "formatRunReceiptBody")}
  return formatRunReceiptBody({
    sourceAppId: "clioTalk", status: "completed", runId: "r3", provider: "x", model: "y", attempts: [], userAction: "",
  });
})()`);
test.assert(oldBody.includes("- Usage: —"),
  "receipts from before usage accounting show — rather than guessing");

// --- 4. The context panel's folded run details, via the real module.
const untouched = api.contextRunDetails(null, null, "zh");
test.assert(untouched.rows.some((row) => row.value.includes("原始对话完整保留，未替换")),
  "with no compaction the panel says the original history stands, not replaced");

const compacted = api.contextRunDetails(
  { through: "m12", pins: 2, legacy: false, sourceMessages: 12, keptFrom: "m13" },
  { cacheOutcome: "hit", estimated: false, costCny: 0.5 },
  "en",
);
test.assert(compacted.rows.some((row) => row.value.includes("first 12 (through m12)")),
  "the details name how far the compaction reaches");
test.assert(compacted.rows.some((row) => row.value.includes("kept verbatim from m13")),
  "the details name where the verbatim keep starts");
test.assert(compacted.rows.some((row) => row.value.includes("provider-reported: hit")),
  "a reported cache verdict names its source");
test.assert(compacted.rows.some((row) => row.value.includes("¥0.5000")),
  "reported cost shows with four decimals");
test.assert(compacted.title === "This run", "the fold has a title");

const foldable = api.contextRunDetails(
  null,
  { cacheOutcome: "unknown", estimated: true, costCny: 0 },
  "zh",
);
test.assert(foldable.rows.some((row) => row.value.includes("未验证（供应商未报告）")),
  "an unverified cache says unverified");
test.assert(foldable.rows.some((row) => row.value.includes("估算")),
  "an estimated token count says 估算");
test.assert(!foldable.rows.some((row) => row.label.includes("费用")),
  "absent cost renders no cost row");

// renderInto: draws a closed fold with the rows; appends nothing when empty.
const drawn = (() => {
  const nodes = [];
  const el = (tag) => ({ tag, className: "", children: [], style: { cssText: "" }, append(...items) { this.children.push(...items); } });
  host.document = {
    createElement: (tag) => el(tag),
    createTextNode: (text) => ({ text }),
  };
  const listEl = el("div");
  api.renderInto(listEl, { through: "m2", pins: 1, legacy: false, sourceMessages: 4, keptFrom: "m3" },
    { cacheOutcome: "write", estimated: false, costCny: 0 }, "en");
  delete host.document;
  return listEl.children[0] || null;
})();
test.assert(drawn && drawn.tag === "details" && drawn.className === "context-run-details",
  "renderInto draws the details fold");
test.assert(drawn.children[0]?.tag === "summary" && drawn.children[0]?.children.length === 0
  && drawn.children[0]?.textContent === "This run",
  "the fold title is a summary (closed by default)");
test.assert(drawn.children.slice(1).some((node) => node.tag === "div" && node.className === "context-run-detail-row"),
  "each detail row renders as its own line");
const nothing = (() => {
  const el = () => ({ className: "", children: [], style: { cssText: "" }, append() {} });
  const listEl = el();
  api.renderInto(listEl, null, null, "zh");
  return listEl.children.length;
})();
test.assert(nothing === 0,
  "renderInto draws nothing when there is nothing to fold");

// --- 5. Wiring: coverage shape, delegates, manifest registration.
test.assert(compaction.includes("sourceMessages: Number(memory.sourceMessages) || 0")
  && compaction.includes("keptFrom: String(memory.firstKeptMessageId || \"\")"),
  "the coverage shape carries the boundary and the verbatim start");
test.assert(chat.includes("usageSummary: window.AISystem6ChatRunDetails?.usageSummary?.(usage, tokens) || null"),
  "the chat metrics carry the lazy run-details usage summary");
test.assert(chat.includes("window.lastClioTalkUsage = record.usage || null"),
  "the chat run's usage feeds the context panel's fold");
test.assert(chat.includes("typeof ensureChatRunDetailsModule === \"function\""),
  "the send path ensures the run-details module is installed");
test.assert(receipts.includes("usageFromInput?.(input.usage)")
  && receipts.includes("usageLine?.(record.usage)"),
  "the eager receipt side forwards to the lazy module");
test.assert(receipts.includes("usageLine?.(record.usage)"),
  "the receipt body renders the usage line from the record");
test.assert(scrapbook.includes("renderInto?.(")
  && scrapbook.includes("window.lastClioTalkUsage || null"),
  "the context panel delegates the fold to the lazy module");
test.assert(read("app/core/config.js").includes('"app/core/chat-run-details.js"'),
  "the lazy loader registers the module");
test.assert(read("tooling/runtime-manifest.mjs").includes("app/core/chat-run-details.js"),
  "the runtime manifest lists the module");

// --- 6. Failure copy: the original context was NOT replaced.
test.assert(read("app/data/translations-zh.js").includes("原始上下文未替换"),
  "the too-large state says the original context was not replaced (zh)");
test.assert(read("app/data/translations-en.js").includes("the original context was not replaced"),
  "the too-large state says the original context was not replaced (en)");

test.finish();
