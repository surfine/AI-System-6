// ClioWorks unified spec (C03): provider context capability profile.
//
// Values are facts from the provider's own documentation at the recorded doc
// version; `null` means UNKNOWN — never zero, never an advertised maximum.
// A provider whose limits are unknown gets null, and the budget layer treats
// null as "cannot verify" rather than guessing.
//
// inputLimit: the provider's per-request INPUT cap (what may be sent).
// contextWindow: the total window (input + output share it).
// outputBudgetCountsThinking: whether the provider counts reasoning tokens
//   inside the requested output budget (Anthropic-style) — callers must not
//   double-count thinking when this is true.
// cacheForkSupported: whether a compaction summary request may safely fork
//   the cached prefix (C04 gate; provider and payload conditions both apply).
//
// Lazy classic script; installed as window.AISystem6ChatContextCapabilities.
(function (root) {
  'use strict';
  if (root.AISystem6ChatContextCapabilities) return;

  const DOC_VERSION = "2026-10-19";

  const PROVIDERS = Object.freeze({
    deepseek: Object.freeze({
      inputLimit: 1000000,
      contextWindow: 1000000,
      outputBudgetCountsThinking: true,
      cacheForkSupported: false,
      singleGeneration: true,
      toolsNeverExecute: true,
      serverHostedTools: false,
      replaySupported: true,
      docVersion: DOC_VERSION,
      testedModels: Object.freeze(["deepseek-flash", "deepseek-v4-pro"]),
    }),
    anthropic: Object.freeze({
      inputLimit: 200000,
      contextWindow: 200000,
      outputBudgetCountsThinking: true,
      cacheForkSupported: false,
      singleGeneration: false,
      toolsNeverExecute: false,
      serverHostedTools: false,
      replaySupported: true,
      docVersion: DOC_VERSION,
      testedModels: Object.freeze([]),
    }),
    openai: Object.freeze({
      // OpenAI's per-model windows vary too widely to hard-code; the profile
      // carries the shape and nulls until a model-specific value is wired.
      inputLimit: null,
      contextWindow: null,
      outputBudgetCountsThinking: false,
      cacheForkSupported: true,
      singleGeneration: true,
      toolsNeverExecute: true,
      serverHostedTools: false,
      replaySupported: true,
      docVersion: DOC_VERSION,
      testedModels: Object.freeze([]),
    }),
    "lm-studio": Object.freeze({
      // Local servers expose their real loaded window at run time; the
      // provider record itself carries none.
      inputLimit: null,
      contextWindow: null,
      outputBudgetCountsThinking: false,
      cacheForkSupported: false,
      singleGeneration: true,
      toolsNeverExecute: true,
      serverHostedTools: false,
      replaySupported: false,
      docVersion: DOC_VERSION,
      testedModels: Object.freeze([]),
    }),
  });

  function normalizeProvider(name) {
    const key = String(name || "").toLowerCase();
    if (PROVIDERS[key]) return key;
    // A cloud route that is not in the table is unknown — nulls, not guesses.
    if (key.includes("deepseek")) return "deepseek";
    if (key.includes("anthropic") || key.includes("claude")) return "anthropic";
    if (key.includes("openai") || key.includes("gpt")) return "openai";
    return null;
  }

  /** The capability profile for a provider/model pair. Unknown fields are
   * null; an unknown provider is a null profile with the doc version. */
  function capabilityFor(providerName, modelName = "") {
    const key = normalizeProvider(providerName);
    if (!key) {
      return Object.freeze({
        provider: null, model: String(modelName || ""), inputLimit: null, contextWindow: null,
        outputBudgetCountsThinking: false, cacheForkSupported: false, singleGeneration: false,
        toolsNeverExecute: false, serverHostedTools: false, replaySupported: false,
        docVersion: DOC_VERSION, known: false,
      });
    }
    const base = PROVIDERS[key];
    return Object.freeze({
      provider: key, model: String(modelName || ""),
      inputLimit: base.inputLimit, contextWindow: base.contextWindow,
      outputBudgetCountsThinking: base.outputBudgetCountsThinking,
      cacheForkSupported: base.cacheForkSupported,
      singleGeneration: base.singleGeneration, toolsNeverExecute: base.toolsNeverExecute,
      serverHostedTools: base.serverHostedTools, replaySupported: base.replaySupported,
      docVersion: base.docVersion, known: true,
    });
  }

  /** C03: resolve the input limit for a send. route is "cloud" or "local";
   * cloudProvider/cloudModel name the cloud model when the route is cloud.
   * Returns { inputLimit, providerScope, source } — null limit and the
   * browser-estimate source when the provider is unknown. */
  function resolveInputLimit(route, cloudProvider = "", cloudModel = "") {
    if (route !== "cloud") return { inputLimit: null, providerScope: "local", source: "browser-estimate" };
    const profile = capabilityFor(cloudProvider, cloudModel);
    if (!profile.known || !Number.isFinite(profile.inputLimit) || profile.inputLimit <= 0) {
      return { inputLimit: null, providerScope: `cloud:${cloudProvider || ""}`, source: "browser-estimate" };
    }
    return { inputLimit: profile.inputLimit, providerScope: `cloud:${profile.provider}`, source: "provider-input-limit" };
  }

  /** C03/C08: build the budget from the window plus the resolved input limit.
   * The host passes its own estimate; this names the source and caps the
   * prompt when the provider's input limit is known. */
  function buildBudget({ contextLength, promptTokens, requestedOutputTokens, safetyTokens }) {
    const resolvedInput = typeof root.clioCloudRouteActive === "function" && root.clioCloudRouteActive()
      ? capabilityFor(String(root.clioCloudProvider || root.cloudConfig?.provider || ""))
      : null;
    const inputLimit = resolvedInput ? resolvedInput.inputLimit : null;
    const providerScope = resolvedInput ? `cloud:${resolvedInput.provider}` : "local";
    const availableOutputTokens = Math.max(0, contextLength - promptTokens - safetyTokens);
    return {
      context_length: contextLength,
      input_limit: inputLimit,
      provider_scope: providerScope,
      prompt_tokens: promptTokens,
      requested_output_tokens: requestedOutputTokens,
      available_output_tokens: availableOutputTokens,
      fits: availableOutputTokens >= requestedOutputTokens
        && (inputLimit === null || promptTokens <= inputLimit),
      budget_source: inputLimit !== null ? "provider-input-limit" : "browser-estimate",
    };
  }

  root.AISystem6ChatContextCapabilities = Object.freeze({
    capabilityFor,
    resolveInputLimit,
    buildBudget,
    normalizeProvider,
    docVersion: DOC_VERSION,
  });
})(typeof window !== "undefined" ? window : globalThis);
