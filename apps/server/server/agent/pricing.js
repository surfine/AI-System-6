// The provider price table for a task's cost estimate.
//
// A server-side copy of the table the desk already uses for runUsageText
// (CLOUD_PRICING_CNY_PER_1M and cloudPricingFor in app/core/chat-messages.js,
// browser code the server cannot load); tests/features/agent-tasks.test.mjs
// reads both and fails when they drift. DeepSeek prices are CNY per million
// tokens, peak 09:00-12:00 and 14:00-18:00 Beijing time, off-peak otherwise.
// Only DeepSeek models are priced: Anthropic and LM Studio runs show tokens
// only, so a task that ran one has no estimate.
//
// A run's usage counter is the context window's used tokens, which bills at
// the input rate, so the estimate is tokens at inputCacheMiss.

"use strict";

const CLOUD_PRICING_CNY_PER_1M = {
  "deepseek-flash": {
    peak: { inputCacheHit: 0.04, inputCacheMiss: 2.0, output: 8.0 },
    offPeak: { inputCacheHit: 0.02, inputCacheMiss: 1.0, output: 4.0 },
  },
  "deepseek-v4-pro": {
    peak: { inputCacheHit: 0.3, inputCacheMiss: 9.0, output: 27.0 },
    offPeak: { inputCacheHit: 0.15, inputCacheMiss: 4.5, output: 13.5 },
  },
};

/** @param {Date} when */
function pricingBand(when) {
  const beijingHour = new Date(when.getTime() + 8 * 60 * 60 * 1000).getUTCHours();
  const peak = (beijingHour >= 9 && beijingHour < 12) || (beijingHour >= 14 && beijingHour < 18);
  return peak ? "peak" : "offPeak";
}

/**
 * @param {string} modelName
 * @param {Date} [when]
 * @returns {{ inputCacheHit: number, inputCacheMiss: number, output: number } | null}
 */
function pricingFor(modelName, when) {
  const id = String(modelName || "").trim().toLowerCase();
  const key = /^(?:deepseek-)?v4-flash(?:-vision-exp)?$/.test(id)
    ? "deepseek-flash"
    : id === "v4-pro" ? "deepseek-v4-pro" : id;
  const table = CLOUD_PRICING_CNY_PER_1M[key];
  return table ? table[pricingBand(when || new Date())] : null;
}

/**
 * CNY for `tokens` of context at the model's input rate, or null when the
 * model has no price.
 * @param {string} modelName
 * @param {number} tokens
 * @param {Date} [when]
 */
function inputCostCny(modelName, tokens, when) {
  const price = pricingFor(modelName, when);
  return price ? (tokens / 1e6) * price.inputCacheMiss : null;
}

module.exports = { CLOUD_PRICING_CNY_PER_1M, inputCostCny, pricingFor };
