// Cloud (OpenAI-compatible) helpers.
//
// Mirrors the role of root server-cloud.js. Grows incrementally as
// individual cloud routes are migrated into src/. Currently exposes:
//   - DEEPSEEK_CLOUD_MODELS  (static registry)
//   - cloudAuthHeaders       (Bearer token helper)
//   - DEEPSEEK_API_KEY_DEFAULT / DEEPSEEK_BASE_URL_DEFAULT
//     (env-derived defaults; route handlers fall back to these when
//     the request body does not supply an explicit value)
//
// DeepSeek is the first-class cloud QA target. The protocol stays
// OpenAI-compatible so operators can still point the app at another
// compatible endpoint as a best-effort escape hatch.

"use strict";

const DEEPSEEK_API_KEY_DEFAULT = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL_DEFAULT =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

/**
 * @typedef {Object} CloudModelDescriptor
 * @property {string} id              Provider model id (used as the
 *                                    OpenAI-compatible `model` field).
 * @property {string} name            Human display name.
 * @property {number} context_length  Maximum context window in tokens.
 */

/**
 * Built-in cloud model registry. Mirrors the same array in root
 * server-cloud.js exactly. The order is significant — the client
 * surfaces it in this order in the cloud-model picker.
 *
 * @type {readonly CloudModelDescriptor[]}
 */
const DEEPSEEK_CLOUD_MODELS = [
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", context_length: 1000000 },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", context_length: 1000000 },
];

/**
 * Build the auth headers for an OpenAI-compatible cloud request.
 * Returns an empty object when no key is supplied; callers spread
 * the result into their headers map.
 *
 * @param {string | null | undefined} apiKey
 * @returns {Record<string, string>}
 */
function cloudAuthHeaders(apiKey) {
  if (!apiKey) return {};
  return { "Authorization": `Bearer ${apiKey}` };
}

module.exports = {
  DEEPSEEK_CLOUD_MODELS,
  cloudAuthHeaders,
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
};
