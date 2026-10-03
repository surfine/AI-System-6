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
// - A registered task contract is applied before LM-Studio tuning,
//   so Markdown and structured-output tasks keep distinct envelopes.
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

const { send, readJsonBody, requestSignal, respondIfClientError } = require("../lib/http.js");
const { proxyJsonStream } = require("../lib/fetch.js");
const { taskContractForPayload } = require("../../../desktop/app/shared/model-task-runtime.js");
const { sameModelName } = require("../lib/lmstudio-models.js");
const { getLocalUrls } = require("../lib/local-urls.js");
const {
  applyChatTaskContract,
  modelContentFromChatData,
  scrubVisibleModelOutput,
  tuneLmStudioChatPayload,
} = require("../chat.js");
const {
  findHumanizerOutputHits,
  findHumanizerStyleDiagnostics,
  isHumanizerRepairMetaResponse,
  shouldLintHumanizerOutput,
  shouldRepairHumanizerOutput,
} = require("../humanizer.js");
const {
  getLoadedLmStudioModelInfo,
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

// Request-local dispatch bounds. Counters report sends, never load probes or
// token/currency spend. Standalone APIs retain their existing two repairs.
/** @param {any} raw */
function createChatFollowupBudget(raw = {}) {
  const parent = Object.hasOwn(raw, "ai_system6_max_followup_calls") || Object.hasOwn(raw, "ai_system6_max_repair_calls");
  const limit = (value, fallback, cap) => Number.isInteger(value) ? Math.max(0, Math.min(cap, value)) : fallback;
  let remaining = parent ? limit(raw.ai_system6_max_followup_calls, 0, 4) : Infinity;
  let remainingRepairs = parent ? limit(raw.ai_system6_max_repair_calls, 0, 1) : 2;
  delete raw.ai_system6_max_followup_calls;
  delete raw.ai_system6_max_repair_calls;
  let providerCalls = 0;
  let repairCalls = 0;
  let thinkingCalls = 0;
  /** @type {any} */
  let stopped = null;
  const stop = (error) => {
    const code = String(error?.code || "");
    const status = Number(error?.status || error?.statusCode || 0);
    if (code === "writing_call_budget_exhausted" || status === 429 || status === 402
        || /quota|insufficient.?balance|shared_cloud_(?:session_limit|daily_request_limit|daily_token_limit)/i.test(`${code} ${error?.message || ""}`)) {
      stopped = { code: code || (status === 429 ? "rate_limit" : "cloud_insufficient_balance"), status, message: String(error?.message || "") };
      return true;
    }
    return false;
  };
  return {
    get remaining() { return remaining; },
    get remainingRepairs() { return remainingRepairs; },
    reserve(kind) {
      if (stopped || remaining <= 0 || (kind === "repair" && remainingRepairs <= 0)) {
        const error = Object.assign(new Error("The parent writing call allowance is exhausted."), { code: "writing_call_budget_exhausted", status: 429 });
        stop(error);
        throw error;
      }
      remaining -= 1;
      if (kind === "repair") remainingRepairs -= 1;
    },
    sent(kind) {
      providerCalls += 1;
      if (kind === "repair") repairCalls += 1;
      if (kind === "thinking-fallback") thinkingCalls += 1;
    },
    stop,
    metrics: () => ({ provider_calls: providerCalls, repair_attempts: repairCalls, thinking_fallback_attempts: thinkingCalls, ...(stopped ? { call_stop: stopped } : {}) }),
  };
}

/**
 * @param {{
 *   data: any,
 *   payload: any,
 *   taskKind: string,
 *   taskContract?: any,
 *   chatUrl: string,
 *   provider: string,
 *   model: string,
 *   signal: AbortSignal | null | undefined,
 *   callBudget?: any,
 * }} options
 */
async function repairHumanizerOutputIfNeeded(options) {
  const { payload, taskKind, chatUrl, provider, model, signal } = options;
  let data = options.data;
  let content = modelContentFromChatData(data).trim();
  if (!content || options.taskContract?.humanizer === "off" || !shouldLintHumanizerOutput(taskKind)) return data;
  let hits = findHumanizerOutputHits(content);
  const explicitRewrite = shouldRepairHumanizerOutput(taskKind);

  let attempts = 0;
  let repaired = false;
  const callBudget = options.callBudget || createChatFollowupBudget({});
  const maxRepairs = Math.min(2, callBudget.remaining, callBudget.remainingRepairs);
  for (let round = 0; explicitRewrite && round < maxRepairs && hits.length; round += 1) {
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
            "上一版有机械检查标出的候选问题，请按语义判断。",
            `候选片段或结构（不是禁词）：${hits.join("、")}`,
            "只在确有空话、错误联系或模板表达时修改上一版；保留普通词语的准确用法、来源原话、数字、限定条件与作者声音。不要添加新事实、加强无证据的推论或列禁词清单；没有真实问题就原样返回。",
            "不要用别急、当然啦、所以啊、那叫一个这类表演式口语来假装自然。",
            "如果原文太空，就写短一点，直接说明缺少具体信息。",
          ].join("\n"),
        },
      ],
    });
    let response;
    try {
      const result = await postLocalChatWithModelAutoload({
        chatUrl, payload: repairPayload, provider, model, signal,
        beforeRequest: () => callBudget.reserve("repair"),
        onRequest: () => { attempts += 1; callBudget.sent("repair"); },
      });
      response = result.response;
    } catch (error) {
      callBudget.stop(error);
      if (error?.name === "AbortError") throw error;
      break;
    }
    const text = await response.text();
    if (!response.ok) {
      let failure; try { failure = JSON.parse(text); } catch { failure = {}; }
      callBudget.stop({ status: response.status, code: failure.code, message: failure.detail || failure.error || text });
      break;
    }
    let repairData = {};
    try {
      repairData = JSON.parse(text);
    } catch {
      break;
    }
    const nextContent = modelContentFromChatData(repairData).trim();
    if (!nextContent) break;
    if (isHumanizerRepairMetaResponse(nextContent)) break;
    if (nextContent === content) break;
    data = repairData;
    content = nextContent;
    repaired = true;
    hits = findHumanizerOutputHits(content);
  }

  data.ai_system6_humanizer = {
    mode: explicitRewrite ? "explicit-rewrite" : "lint",
    repaired,
    repair_attempts: attempts,
    remaining_hits: hits,
    diagnostics: findHumanizerStyleDiagnostics(content),
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
  let callBudget = null;

  try {
    const rawPayload = await readJsonBody(req);
    callBudget = createChatFollowupBudget(rawPayload);
    const taskKind = rawPayload.ai_system6_task_kind || "chat";
    const provider = rawPayload._local_provider || "lm-studio";
    const endpoint = rawPayload._local_endpoint || "";
    delete rawPayload._local_provider;
    delete rawPayload._local_endpoint;

    const taskContract = taskContractForPayload(rawPayload);
    const loaded = getLoadedLmStudioModelInfo();
    const loadedContext = provider === "lm-studio" && sameModelName(rawPayload.model, loaded?.model) ? Number(loaded?.context_length || 0) : 0;
    const payload = tuneLmStudioChatPayload(applyChatTaskContract(rawPayload), { contextLimit: loadedContext });
    const { chatUrl } = getLocalUrls(provider, endpoint);

    console.log("[local-chat] model:", payload.model, "provider:", provider, "url:", chatUrl);
    if (payload.stream === true) {
      await proxyJsonStream(chatUrl, payload, signal, res);
      return;
    }

    let firstRequest = true;
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
      beforeRequest: () => { if (!firstRequest) callBudget.reserve("retry"); firstRequest = false; },
      onRequest: () => callBudget.sent("model"),
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
        ai_system6_metrics: callBudget.metrics(),
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
      taskContract,
      chatUrl,
      provider,
      model: payload.model,
      signal,
      callBudget,
    });
    data = scrubVisibleOutputInData(data);
    const choice = data?.choices?.[0] || {};
    data.ai_system6_metrics = {
      elapsed_ms: Date.now() - startedAt,
      finish_reason: choice.finish_reason || data.stop_reason || "",
      model: data.model || payload.model || "",
      usage: data.usage || null,
      ...callBudget.metrics(),
      auto_loaded_model: autoLoaded ? autoLoadedModel || payload.model || "" : "",
      auto_selected_model: autoSelectedModel || "",
    };

    send(res, upstream.status, JSON.stringify(data), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    // The classifier reads an upstream message and names a cause such as
    // "lmstudio_server_offline". A rejected body never reached the model
    // server, so the classifier would state a cause that is false: the user
    // read that the local model server was down when the JSON was bad.
    const clientError = /** @type {any} */ (error);
    if (clientError?.status >= 400 && clientError.status < 500) {
      send(res, clientError.status, JSON.stringify({ error: clientError.message, code: clientError.code, budget: clientError.budget, ai_system6_metrics: callBudget?.metrics() }), { "Content-Type": "application/json" });
      return;
    }
    if (respondIfClientError(res, error)) return;
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

module.exports = { handleChat, createChatFollowupBudget, repairHumanizerOutputIfNeeded };
