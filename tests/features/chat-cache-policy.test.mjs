// Unified spec (2026-10-10) C06 contract: cache policy per provider adapter.
// Drives the REAL vendored cache-policy module: DeepSeek sends no directives
// (automatic caching) and records hit/miss; OpenAI sends nothing unconfigured;
// Anthropic preserves breakpoints with TTL ordering; local and subscription
// CLI adapters make no cloud claims; unknown providers are closed off.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import * as policyApi from "../../apps/desktop/app/vendor/unified-spec/cache-policy.mjs";
import * as contracts from "../../apps/desktop/app/vendor/unified-spec/contracts.mjs";

const test = createFeatureTest("chat-cache-policy");

test.assert(!!policyApi && typeof policyApi.cacheAdapterFor === "function", "the cache policy module installs");

// 1. DeepSeek: automatic caching — no directives on the wire, fork allowed.
const deepseek = policyApi.cacheAdapterFor("deepseek");
test.assert(deepseek.known && deepseek.wireDirectives({ historyMessageCount: 3 }).cache_control === undefined,
  "deepseek sends no cache directives (automatic caching)");
test.assert(deepseek.allowFork === true, "deepseek's prefix may fork (C04)");

// 2. Anthropic: explicit breakpoints, preserved order, short TTL on history.
const anthropicDirectives = policyApi.summaryRequestDirectives("anthropic", { historyMessageCount: 3, longLivedPrefix: true });
test.assert(Array.isArray(anthropicDirectives.cache_control) && anthropicDirectives.cache_control.length === 4
  && anthropicDirectives.cache_control[3].ttl === "1h" && anthropicDirectives.cache_control[0].ttl === "5m",
  "anthropic carries history breakpoints (5m) plus the long-lived system marker (1h)");
test.assert(policyApi.cacheAdapterFor("anthropic").allowFork === false,
  "anthropic's prefix may not fork (breakpoints preserved, not rewritten)");

// 3. OpenAI and LM Studio send nothing unconfigured.
test.assert(Object.keys(policyApi.summaryRequestDirectives("openai", { historyMessageCount: 4 })).length === 0,
  "openai sends no cache directives without a model-specific adapter");
test.assert(policyApi.cacheAdapterFor("lm-studio").allowFork === false,
  "lm-studio makes no cloud fork or TTL claims");

// 4. Subscription CLI: fork unsupported (the CLI's upstream body is invisible).
test.assert(policyApi.cacheAdapterFor("subscription-cli").allowFork === false,
  "the subscription CLI adapter does not claim compact parity");

// 5. Unknown provider: fully closed.
const unknown = policyApi.cacheAdapterFor("brand-new-provider");
test.assert(unknown.known === false && unknown.allowFork === false,
  "an unknown provider is closed off, not guessed");

// 6. Hit/miss accounting from the vendored usage normalizer.
const outcomes = {
  deepseekHit: policyApi.cacheOutcome(contracts.normalizeUsage("deepseek", { prompt_tokens: 100, prompt_cache_hit_tokens: 80 })),
  deepseekWrite: policyApi.cacheOutcome(contracts.normalizeUsage("deepseek", { prompt_tokens: 100, cache_write_tokens: 100 })),
  anthropicHit: policyApi.cacheOutcome(contracts.normalizeUsage("anthropic", { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 })),
  noneReported: policyApi.cacheOutcome(contracts.normalizeUsage("deepseek", { prompt_tokens: 50 })),
};
test.assert(outcomes.deepseekHit === "hit", "a deepseek cache-hit is recorded as hit");
test.assert(outcomes.deepseekWrite === "write", "a deepseek cache-write is recorded as write");
test.assert(outcomes.anthropicHit === "hit", "an anthropic cache-read is recorded as hit");
test.assert(outcomes.noneReported === "none", "no cache data records as none (not hit)");

test.finish();
