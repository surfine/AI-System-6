// POST /api/cloud/chat
//
// Forwards an OpenAI-compatible chat request to the configured cloud
// provider, with two response shapes:
//   - stream=true:  pipe upstream SSE directly into res via proxyJsonStream
//   - stream=false: buffer, parse, decorate with ai_system6_metrics
//
// Behavior parity with root server-cloud.js, including:
// - Markdown-only normalization via enforceMarkdownOnlyChatPayload.
// - Strips client-only underscore-prefixed fields (_cloud_*) from the
//   payload after pulling them into locals.
// - Strips deepseek-v4 sampling/local-thinking fields (temperature, top_p,
//   presence_*, frequency_*, logprobs, top_logprobs, reasoning_effort,
//   enable_thinking, chat_template_kwargs, top_k, min_p) when targeting v4-pro/v4-flash
//   with thinking enabled. Thinking is "enabled" by default; only an
//   explicit { thinking: { type: "disabled" } } skips the strip.
// - Non-JSON upstream response: maps to 401 (heuristic auth) or
//   upstream status (or 502 if upstream was somehow OK).
// - JSON error response: merges upstream body and synthesizes detail
//   from data.detail / data.error.message / raw text / status.
// - Success response is decorated with ai_system6_metrics containing
//   elapsed_ms, finish_reason, model, usage.
// - AbortError is swallowed silently.
// - One console.log line ("[cloud-chat] model:") is preserved
//   verbatim for operator visibility.

"use strict";

const { send, readJsonBody, requestSignal } = require("../lib/http.js");
const { postJsonWithFallback, proxyJsonStream } = require("../lib/fetch.js");
const { enforceMarkdownOnlyChatPayload, modelContentFromChatData } = require("../chat.js");
const {
  findHumanizerOutputHits,
  isHumanizerRepairMetaResponse,
  scrubHumanizerOutput,
  shouldRepairHumanizerOutput,
} = require("../humanizer.js");
const {
  cloudAuthHeaders,
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
} = require("../cloud.js");

const DEEPSEEK_V4_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash", "v4-pro", "v4-flash"]);

/**
 * @param {any} payload
 * @returns {boolean}
 */
function shouldStripDeepseekV4Sampling(payload) {
  if (!DEEPSEEK_V4_MODELS.has(payload.model)) return false;
  return !payload.thinking || payload.thinking.type !== "disabled";
}

/**
 * @param {any} payload
 */
function stripDeepseekV4LocalOnlyFields(payload) {
  delete payload.reasoning_effort;
  delete payload.enable_thinking;
  delete payload.chat_template_kwargs;
  delete payload.top_k;
  delete payload.min_p;
}

/**
 * @param {any} payload
 */
function stripCloudLocalOnlyFields(payload) {
  if (String(payload.reasoning_effort || "").toLowerCase() === "none") {
    delete payload.reasoning_effort;
  }
  delete payload.enable_thinking;
  delete payload.chat_template_kwargs;
  delete payload.top_k;
  delete payload.min_p;
}

/**
 * @param {any} data
 * @param {string} content
 */
function setModelContent(data, content) {
  if (data?.choices?.[0]?.message) {
    data.choices[0].message.content = content;
  } else if (data?.choices?.[0]) {
    data.choices[0].text = content;
  }
}

/**
 * @param {{
 *   data: any,
 *   payload: any,
 *   taskKind: string,
 *   targetUrl: string,
 *   signal: AbortSignal | null | undefined,
 *   authHeaders: Record<string, string>,
 * }} options
 */
async function repairCloudHumanizerOutputIfNeeded(options) {
  const { payload, taskKind, targetUrl, signal, authHeaders } = options;
  if (!shouldRepairHumanizerOutput(taskKind)) return options.data;
  let data = options.data;
  let content = modelContentFromChatData(data).trim();
  let hits = findHumanizerOutputHits(content);
  if (!content || !hits.length) return data;

  let attempts = 0;
  for (; attempts < 2 && hits.length; attempts += 1) {
    const repairPayload = {
      ...payload,
      stream: false,
      temperature: 0.18,
      messages: [
        ...(Array.isArray(payload.messages) ? payload.messages : []),
        { role: "assistant", content },
        {
          role: "user",
          content: [
            "上一版仍然有 AI 腔残留。",
            `必须删除这些片段或结构：${hits.join("、")}`,
            "只重写上一版，不要添加新事实，不要解释，不要列禁词清单。",
            "如果是在提修改建议，不要逐字引用源文里的套话；用“这类词”“这个判断”指代即可。",
            "如果原文太空，就写短一点，直接说明缺少具体信息。",
          ].join("\n"),
        },
      ],
    };
    const { response } = await postJsonWithFallback(targetUrl, repairPayload, signal, authHeaders);
    const text = await response.text();
    if (!response.ok) break;
    let repairData = {};
    try {
      repairData = JSON.parse(text);
    } catch {
      break;
    }
    const nextContent = modelContentFromChatData(repairData).trim();
    if (!nextContent) break;
    if (isHumanizerRepairMetaResponse(nextContent)) break;
    data = repairData;
    content = nextContent;
    hits = findHumanizerOutputHits(content);
  }

  let scrubbed = false;
  if (hits.length) {
    const clean = scrubHumanizerOutput(content);
    const cleanHits = findHumanizerOutputHits(clean);
    if (clean !== content && cleanHits.length <= hits.length) {
      scrubbed = true;
      content = clean;
      hits = cleanHits;
      setModelContent(data, content);
    }
  }

  data.ai_system6_humanizer = {
    repaired: attempts > 0,
    repair_attempts: attempts,
    scrubbed,
    remaining_hits: hits,
  };
  return data;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleCloudChat(req, res) {
  const signal = requestSignal(req, res);
  const startedAt = Date.now();

  try {
    const raw = /** @type {any} */ (enforceMarkdownOnlyChatPayload(await readJsonBody(req)));
    const apiKey = raw._cloud_api_key || DEEPSEEK_API_KEY_DEFAULT;
    const baseUrl = (raw._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT).replace(/\/$/, "");
    const targetUrl = `${baseUrl}/v1/chat/completions`;

    if (raw._cloud_model) raw.model = raw._cloud_model;
    delete raw._cloud_api_key;
    delete raw._cloud_model;
    delete raw._cloud_base_url;
    const taskKind = raw.ai_system6_task_kind || "chat";
    delete raw.ai_system6_task_kind;
    delete raw.ai_system6_enable_thinking;

    const payload = raw;
    stripCloudLocalOnlyFields(payload);
    if (DEEPSEEK_V4_MODELS.has(payload.model)) {
      payload.thinking = { type: "disabled" };
      stripDeepseekV4LocalOnlyFields(payload);
      if (!Number.isFinite(Number(payload.max_tokens))) payload.max_tokens = 1800;
    }
    if (shouldStripDeepseekV4Sampling(payload)) {
      delete payload.temperature;
      delete payload.top_p;
      delete payload.presence_penalty;
      delete payload.frequency_penalty;
      delete payload.logprobs;
      delete payload.top_logprobs;
    }
    console.log("[cloud-chat] model:", payload.model, "stream:", payload.stream, "has_key:", !!apiKey);

    const authHeaders = cloudAuthHeaders(apiKey);

    if (payload.stream === true) {
      await proxyJsonStream(targetUrl, payload, signal, res, authHeaders);
      return;
    }

    const { response: upstream } = await postJsonWithFallback(targetUrl, payload, signal, authHeaders);
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    if (!contentType.includes("application/json")) {
      const isAuthError = /auth|key|unauthorized|authentica/i.test(text);
      const status = isAuthError ? 401 : (upstream.ok ? 502 : upstream.status);
      send(res, status, JSON.stringify({
        error: isAuthError ? "Cloud API authentication failed" : "Cloud API request failed",
        detail: text.substring(0, 1000) || `HTTP ${upstream.status}`,
      }), { "Content-Type": "application/json" });
      return;
    }

    let data = JSON.parse(text);
    if (!upstream.ok) {
      const errorObj = data.error;
      const detail = data.detail
        || (typeof errorObj === "string" ? errorObj : errorObj?.message)
        || text
        || `Cloud API returned ${upstream.status}`;
      send(res, upstream.status, JSON.stringify({
        ...data,
        error: errorObj || "Cloud API request failed",
        detail,
      }), { "Content-Type": "application/json" });
      return;
    }

    data = await repairCloudHumanizerOutputIfNeeded({
      data,
      payload,
      taskKind,
      targetUrl,
      signal,
      authHeaders,
    });
    const choice = data && data.choices ? data.choices[0] : {};
    data.ai_system6_metrics = {
      elapsed_ms: Date.now() - startedAt,
      finish_reason: choice.finish_reason || data.stop_reason || "",
      model: data.model || payload.model || "",
      usage: data.usage || null,
    };

    send(res, upstream.status, JSON.stringify(data), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Cloud proxy failed",
      detail: /** @type {Error} */ (error).message,
    }), { "Content-Type": "application/json" });
  }
}

module.exports = { handleCloudChat };
