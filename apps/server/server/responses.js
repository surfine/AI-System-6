// DeepSeek Responses API transport shared by the server-side structured
// routes. The Responses API exists only on the official DeepSeek endpoint, so
// every route that uses this module keeps its existing Chat Completions path
// as the fallback: local deployments with custom endpoints are untouched.
// Both v4 models are served here — v4-pro was verified against the live API
// on 2026-08-14, where it ran three web searches for a question flash covered
// with one.

"use strict";

const { postJsonWithFallback } = require("./lib/fetch.js");
const { cloudAuthHeaders, DEEPSEEK_PUBLIC_BASE_URL, resolveCloudTarget } = require("./cloud.js");
const { taskReasoningEffort } = require("./task-policy.js");

const DEEPSEEK_RESPONSES_URL = `${DEEPSEEK_PUBLIC_BASE_URL}/responses`;
const CANONICAL_RESPONSES_MODEL = "deepseek-v4-flash";
const RESPONSES_MODELS = new Set([
  "deepseek-v4-flash",
  "v4-flash",
  "deepseek-v4-pro",
  "v4-pro",
]);
const RESPONSES_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

/**
 * Pick the reasoning effort for a task kind. The table lives in
 * `task-policy.js` with the model tier, the thinking switch, and the output
 * budget, because those four are one decision. Unknown kinds fall back to the
 * low tier rather than the strongest one, so a new surface never surprises
 * users with slow, expensive thinking.
 *
 * @param {string} [taskKind]
 * @returns {string}
 */
function responsesEffortForTask(taskKind) {
  return taskReasoningEffort(taskKind);
}

/**
 * Whether a route's cloud call can use the Responses API: the official
 * DeepSeek base URL plus a Responses-capable model.
 *
 * @param {{ baseUrl?: string, model?: string }} options
 * @returns {boolean}
 */
function isResponsesEligible({ baseUrl = "", model = "" }) {
  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "").toLowerCase();
  return normalizedBase === DEEPSEEK_PUBLIC_BASE_URL.toLowerCase()
    && RESPONSES_MODELS.has(String(model || "").toLowerCase());
}

function normalizeResponsesEffort(value) {
  const candidate = String(value || "low").toLowerCase();
  return RESPONSES_EFFORTS.has(candidate) ? candidate : "low";
}

/**
 * User-facing warning for upstream HTTP statuses that deserve copy instead of
 * a raw error: insufficient balance, rate limiting, and server busy.
 *
 * @param {number} [status]
 * @returns {string}
 */
function cloudUpstreamWarning(status) {
  if (status === 402) return "DeepSeek 账户余额不足，请充值后重试；使用共享额度时请检查服务器配置的密钥。";
  if (status === 429) return "DeepSeek 请求频率或并发超限，请稍后重试。";
  if (status === 503) return "DeepSeek 服务繁忙，请稍后重试。";
  return "";
}

/**
 * Convert a Chat Completions `messages` array into Responses API input items.
 * Used by routes that keep message-shaped prompts.
 *
 * @param {Array<{ role?: string, content?: unknown }>} [messages]
 * @returns {Array<{ type: string, role: string, content: Array<{ type: string, text: string }> }>}
 */
function chatMessagesToResponsesInput(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => ({
      type: "message",
      role: String(message?.role || "user"),
      content: [{ type: "input_text", text: String(message?.content ?? "") }],
    }))
    .filter((item) => item.content[0].text.length > 0);
}

/**
 * @param {{
 *   model?: string,
 *   instructions?: string,
 *   input: unknown,
 *   textFormat?: Record<string, unknown> | null,
 *   reasoningEffort?: string,
 *   maxOutputTokens?: number,
 *   userId?: string,
 * }} options
 * @returns {Record<string, unknown>}
 */
function buildResponsesPayload({
  model = CANONICAL_RESPONSES_MODEL,
  instructions = "",
  input,
  textFormat = null,
  reasoningEffort = "low",
  maxOutputTokens,
  userId = "",
}) {
  const payload = {
    model: RESPONSES_MODELS.has(String(model || "").toLowerCase())
      ? String(model)
      : CANONICAL_RESPONSES_MODEL,
    instructions,
    input,
    reasoning: { effort: normalizeResponsesEffort(reasoningEffort) },
    text: { format: textFormat || { type: "text" } },
    stream: false,
  };
  if (Number.isFinite(Number(maxOutputTokens))) {
    payload.max_output_tokens = Math.max(1, Math.floor(Number(maxOutputTokens)));
  }
  if (userId) payload.user = userId;
  return payload;
}

/**
 * POST a non-streaming Responses request and return the parsed JSON, with
 * errors normalized to carry `statusCode` / `code` / `detail`.
 *
 * @param {{
 *   apiKey: string,
 *   payload: Record<string, unknown>,
 *   signal?: AbortSignal | null,
 *   maxBytes?: number,
 *   onRequest?: () => void,
 * }} options
 * @returns {Promise<any>}
 */
async function callResponsesJson({ apiKey, payload, signal, maxBytes = 16 * 1024 * 1024, onRequest }) {
  const cloudTarget = await resolveCloudTarget(DEEPSEEK_PUBLIC_BASE_URL);
  const { response } = await postJsonWithFallback(
    DEEPSEEK_RESPONSES_URL,
    payload,
    signal,
    cloudAuthHeaders(apiKey),
    {
      maxBytes,
      pinnedAddress: cloudTarget.address,
      pinnedFamily: cloudTarget.family,
      onRequest,
    }
  );
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json";

  if (!contentType.includes("application/json")) {
    const isAuthError = /auth|key|unauthorized|authentica/i.test(text);
    const error = /** @type {Error & { statusCode?: number, code?: string }} */ (
      new Error(`Responses API returned HTTP ${response.status}`)
    );
    error.statusCode = isAuthError ? 401 : (response.ok ? 502 : response.status);
    error.code = isAuthError ? "cloud_auth_failed" : "responses_upstream_failed";
    throw error;
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    const error = /** @type {Error & { statusCode?: number, code?: string }} */ (
      new Error("Responses API returned unreadable JSON")
    );
    error.statusCode = 502;
    error.code = "responses_unreadable";
    throw error;
  }

  if (!response.ok) {
    const detail = `Responses API returned HTTP ${response.status}`;
    const warning = cloudUpstreamWarning(response.status);
    const error = /** @type {Error & { statusCode?: number, code?: string, detail?: string, warning?: string }} */ (
      new Error(warning ? `${warning}（${detail}）` : detail)
    );
    error.statusCode = response.status || 502;
    error.code = String(data?.code || "responses_upstream_error");
    error.detail = detail;
    if (warning) error.warning = warning;
    throw error;
  }
  return data;
}

/**
 * Extract the assistant's output text from a non-streaming Responses payload.
 *
 * @param {any} data
 * @returns {string}
 */
function extractResponsesText(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (block?.type === "output_text" && String(block.text || "").trim()) {
        return String(block.text).trim();
      }
    }
  }
  return "";
}

/**
 * @param {any} usage
 * @returns {{
 *   input_tokens: number,
 *   cached_tokens: number,
 *   output_tokens: number,
 *   reasoning_tokens: number,
 *   total_tokens: number,
 * }}
 */
function normalizeResponsesUsage(usage) {
  return {
    input_tokens: Number(usage?.input_tokens || 0),
    cached_tokens: Number(usage?.input_tokens_details?.cached_tokens || 0),
    output_tokens: Number(usage?.output_tokens || 0),
    reasoning_tokens: Number(usage?.output_tokens_details?.reasoning_tokens || 0),
    total_tokens: Number(usage?.total_tokens || 0),
  };
}

module.exports = {
  CANONICAL_RESPONSES_MODEL,
  DEEPSEEK_RESPONSES_URL,
  buildResponsesPayload,
  callResponsesJson,
  chatMessagesToResponsesInput,
  cloudUpstreamWarning,
  extractResponsesText,
  isResponsesEligible,
  responsesEffortForTask,
  normalizeResponsesEffort,
  normalizeResponsesUsage,
};
