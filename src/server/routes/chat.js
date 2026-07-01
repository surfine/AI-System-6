// POST /api/chat
//
// Proxies an OpenAI-compatible chat request to the local LM Studio /
// Ollama endpoint. Two response shapes:
//   - stream=true:  pipe upstream SSE directly via proxyJsonStream
//   - stream=false: buffer, parse, decorate with ai_system6_metrics,
//                   handle the "no model loaded" autoload-and-retry
//                   path transparently.
//
// Behavior parity with root server.js:
// - Strips _local_provider / _local_endpoint from the payload after
//   pulling them into locals. Default provider "lm-studio".
// - Markdown-only normalization is applied before LM-Studio tuning,
//   so the prepended system instruction is also visible to the tuner.
// - tuneLmStudioChatPayload disables local thinking/reasoning by
//   default and applies known family-specific tuning.
// - Stream branch never sees autoload — root behaves the same.
// - Non-JSON upstream response: maps to 401 (heuristic auth) or
//   upstream status, with a provider-flavored error message
//   ("LM Studio" / "Ollama" / "Local Model").
// - JSON error response: merges upstream body and synthesizes detail
//   from data.detail / data.error / raw text / status. Adds a
//   provider-specific code via classifyLmStudioProxyError when
//   upstream did not provide one.
// - Success response decorated with ai_system6_metrics
//   { elapsed_ms, finish_reason, model, usage, auto_loaded_model,
//     auto_selected_model }.
// - Outer 502 carries { error: "Proxy failed", code, detail } where
//   code is classifyLmStudioProxyError(error.message, 502).
// - AbortError swallowed silently.
// - "[local-chat] model: ... provider: ... url: ..." log line
//   preserved verbatim.

"use strict";

const { send, readJsonBody, requestSignal } = require("../lib/http.js");
const { proxyJsonStream } = require("../lib/fetch.js");
const { getLocalUrls } = require("../lib/local-urls.js");
const {
  enforceMarkdownOnlyChatPayload,
  modelContentFromChatData,
  scrubVisibleModelOutput,
  tuneLmStudioChatPayload,
} = require("../chat.js");
const {
  findHumanizerOutputHits,
  isHumanizerRepairMetaResponse,
  scrubHumanizerOutput,
  shouldRepairHumanizerOutput,
} = require("../humanizer.js");
const {
  classifyLmStudioProxyError,
  postLocalChatWithModelAutoload,
} = require("../lmstudio.js");

/**
 * @param {string} provider
 * @returns {string}
 */
function providerDisplayName(provider) {
  if (provider === "lm-studio") return "LM Studio";
  if (provider === "ollama") return "Ollama";
  return "Local Model";
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
 *   chatUrl: string,
 *   provider: string,
 *   model: string,
 *   signal: AbortSignal | null | undefined,
 * }} options
 */
async function repairHumanizerOutputIfNeeded(options) {
  const { payload, taskKind, chatUrl, provider, model, signal } = options;
  if (!shouldRepairHumanizerOutput(taskKind)) return options.data;
  let data = options.data;
  let content = modelContentFromChatData(data).trim();
  let hits = findHumanizerOutputHits(content);
  if (!content || !hits.length) return data;

  let attempts = 0;
  for (; attempts < 2 && hits.length; attempts += 1) {
    const repairPayload = tuneLmStudioChatPayload({
      ...payload,
      stream: false,
      temperature: 0.18,
      ai_system6_task_kind: taskKind,
      messages: [
        ...(Array.isArray(payload.messages) ? payload.messages : []),
        { role: "assistant", content },
        {
          role: "user",
          content: [
            "上一版仍然有 AI 腔残留。",
            `必须删除这些片段或结构：${hits.join("、")}`,
            "只重写上一版，不要添加新事实，不要解释，不要列禁词清单。",
            "不要用别急、当然啦、所以啊、那叫一个这类表演式口语来假装自然。",
            "如果原文太空，就写短一点，直接说明缺少具体信息。",
          ].join("\n"),
        },
      ],
    });
    const { response } = await postLocalChatWithModelAutoload({
      chatUrl,
      payload: repairPayload,
      provider,
      model,
      signal,
    });
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
 * @param {any} data
 * @returns {any}
 */
function scrubVisibleOutputInData(data) {
  const content = modelContentFromChatData(data);
  if (!content) return data;
  const clean = scrubVisibleModelOutput(content);
  if (clean !== content) setModelContent(data, clean);
  return data;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleChat(req, res) {
  const signal = requestSignal(req, res);
  const startedAt = Date.now();

  try {
    const rawPayload = await readJsonBody(req);
    const taskKind = rawPayload.ai_system6_task_kind || "chat";
    const provider = rawPayload._local_provider || "lm-studio";
    const endpoint = rawPayload._local_endpoint || "";
    delete rawPayload._local_provider;
    delete rawPayload._local_endpoint;

    const payload = tuneLmStudioChatPayload(enforceMarkdownOnlyChatPayload(rawPayload));
    const { chatUrl } = getLocalUrls(provider, endpoint);

    console.log("[local-chat] model:", payload.model, "provider:", provider, "url:", chatUrl);
    if (payload.stream === true) {
      await proxyJsonStream(chatUrl, payload, signal, res);
      return;
    }

    const {
      response: upstream,
      autoLoaded,
      autoLoadedModel,
      autoSelectedModel,
    } = await postLocalChatWithModelAutoload({
      chatUrl,
      payload,
      provider,
      model: payload.model,
      signal,
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";
    const displayName = providerDisplayName(provider);

    if (!contentType.includes("application/json")) {
      const isAuthError = /auth|key|unauthorized|authentica/i.test(text);
      const status = isAuthError ? 401 : (upstream.ok ? 502 : upstream.status);
      send(res, status, JSON.stringify({
        error: isAuthError ? `${displayName} authentication failed` : `${displayName} request failed`,
        detail: text.substring(0, 1000) || `HTTP ${upstream.status}`,
      }), { "Content-Type": "application/json" });
      return;
    }

    let data = JSON.parse(text);
    if (!upstream.ok) {
      const detail = data.detail || data.error || text || `${displayName} returned ${upstream.status}`;
      send(res, upstream.status, JSON.stringify({
        ...data,
        error: data.error || `${displayName} request failed`,
        code: data.code || classifyLmStudioProxyError(detail, upstream.status),
        detail,
      }), {
        "Content-Type": "application/json",
      });
      return;
    }
    data = scrubVisibleOutputInData(data);
    data = await repairHumanizerOutputIfNeeded({
      data,
      payload,
      taskKind,
      chatUrl,
      provider,
      model: payload.model,
      signal,
    });
    data = scrubVisibleOutputInData(data);
    const choice = data?.choices?.[0] || {};
    data.ai_system6_metrics = {
      elapsed_ms: Date.now() - startedAt,
      finish_reason: choice.finish_reason || data.stop_reason || "",
      model: data.model || payload.model || "",
      usage: data.usage || null,
      auto_loaded_model: autoLoaded ? autoLoadedModel || payload.model || "" : "",
      auto_selected_model: autoSelectedModel || "",
    };

    send(res, upstream.status, JSON.stringify(data), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const message = /** @type {Error} */ (error).message;
    send(res, 502, JSON.stringify({
      error: "Proxy failed",
      code: classifyLmStudioProxyError(message, 502),
      detail: message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleChat };
