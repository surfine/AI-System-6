// POST /api/cloud/chat
//
// Forwards an OpenAI-compatible chat request to the configured cloud
// provider, with two response shapes:
//   - stream=true:  pipe upstream SSE directly into res via proxyJsonStream
//   - stream=false: buffer, parse, decorate with ai_system6_metrics
//
// Behavior parity with root server-cloud.js, including:
// - Registered task-contract normalization keeps Markdown and structured
//   output requests separate.
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

const { send, readJsonBody, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const { createSseJsonParser, postJsonWithFallback, proxyJsonStream } = require("../lib/fetch.js");
const { applyChatTaskContract, modelContentFromChatData } = require("../chat.js");
const {
  findHumanizerOutputHits,
  findHumanizerStyleDiagnostics,
  isHumanizerRepairMetaResponse,
  shouldLintHumanizerOutput,
  shouldRepairHumanizerOutput,
} = require("../humanizer.js");
const {
  cloudAuthHeaders,
  DEEPSEEK_CLOUD_MODELS,
  DEEPSEEK_BASE_URL_DEFAULT,
  DEEPSEEK_PUBLIC_BASE_URL,
  resolveCloudTarget,
} = require("../cloud.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const { sessionFromRequest } = require("../security/public-session.js");
const {
  pseudonymousCloudUserId,
  reserveSharedCloudRequest,
  sharedCloudBudgetConfig,
  usageTokenTotal,
} = require("../shared-cloud-budget.js");
const { cloudUpstreamWarning, responsesEffortForTask } = require("../responses.js");

const DEEPSEEK_V4_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash", "v4-pro", "v4-flash"]);

// Cloud-chat task kinds that may run with chain-of-thought enabled. The
// reasoning effort still comes from the shared task-type policy; everything
// outside this whitelist stays thinking-off so instant surfaces never slow
// down or spend hidden reasoning tokens.
const CLOUD_THINKING_TASKS = new Set([
  "docmap",
  "outline",
  "draft",
  "review",
  "thesis",
  "hkrr",
]);

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
 * @param {{
 *   data: any,
 *   payload: any,
 *   taskKind: string,
 *   targetUrl: string,
 *   signal: AbortSignal | null | undefined,
 *   authHeaders: Record<string, string>,
 *   transportOptions: { maxBytes?: number, pinnedAddress?: string, pinnedFamily?: number },
 *   reserveSharedCall?: (payload: any) => any,
 *   initialUsageTokens?: number,
 * }} options
 */
async function repairCloudHumanizerOutputIfNeeded(options) {
  const { payload, taskKind, targetUrl, signal, authHeaders, transportOptions } = options;
  let data = options.data;
  let content = modelContentFromChatData(data).trim();
  if (!content || !shouldLintHumanizerOutput(taskKind)) return data;
  let hits = findHumanizerOutputHits(content);
  const explicitRewrite = shouldRepairHumanizerOutput(taskKind);

  let attempts = 0;
  let repaired = false;
  let totalUsageTokens = Math.max(0, Number(options.initialUsageTokens) || 0);
  for (; explicitRewrite && attempts < 2 && hits.length; attempts += 1) {
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
    let repairReservation = null;
    try {
      repairReservation = options.reserveSharedCall?.(repairPayload) || null;
      const { response } = await postJsonWithFallback(
        targetUrl,
        repairPayload,
        signal,
        authHeaders,
        {
          ...transportOptions,
          onRequest: () => repairReservation?.markUpstreamStarted(),
        }
      );
      const text = await response.text();
      if (!response.ok) break;
      let repairData = {};
      try {
        repairData = JSON.parse(text);
      } catch {
        break;
      }
      const repairUsage = usageTokenTotal(repairData?.usage);
      if (repairUsage !== null) {
        repairReservation?.addUsage(repairData.usage);
        totalUsageTokens += repairUsage;
      }
      const nextContent = modelContentFromChatData(repairData).trim();
      if (!nextContent) break;
      if (isHumanizerRepairMetaResponse(nextContent)) break;
      data = repairData;
      content = nextContent;
      repaired = true;
      hits = findHumanizerOutputHits(content);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "cloud_humanizer_repair_failed",
        code: String(/** @type {any} */ (error)?.code || "repair_failed"),
      }));
      break;
    } finally {
      repairReservation?.settle();
    }
  }

  data.ai_system6_humanizer = {
    mode: explicitRewrite ? "explicit-rewrite" : "lint",
    repaired,
    repair_attempts: attempts,
    total_usage_tokens: totalUsageTokens,
    remaining_hits: hits,
    diagnostics: findHumanizerStyleDiagnostics(content),
  };
  return data;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleCloudChat(req, res) {
  const requestAbortSignal = requestSignal(req, res);
  let timeoutHandle = null;
  let sharedReservation = null;
  const startedAt = Date.now();

  try {
    const raw = /** @type {any} */ (
      applyChatTaskContract(await readJsonBody(req, { limitBytes: 512 * 1024 }))
    );
    timeoutHandle = withTimeoutSignal(
      requestAbortSignal,
      raw.stream === true ? 600000 : 120000
    );
    const signal = timeoutHandle.signal;
    const suppliedPublicApiKey = isPublicDeployment
      ? String(raw._cloud_api_key || "").trim()
      : "";
    const usingSharedCloud = isPublicDeployment && !suppliedPublicApiKey;
    const requestedTargetBaseUrl = isPublicDeployment
      ? DEEPSEEK_PUBLIC_BASE_URL
      : raw._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT;
    const cloudTarget = await resolveCloudTarget(requestedTargetBaseUrl);
    const targetBaseUrl = cloudTarget.baseUrl;
    const apiKey = await resolveCloudCredential({
      credentialId: raw._cloud_credential_id,
      provider: "deepseek",
      targetBaseUrl,
      suppliedApiKey: raw._cloud_api_key,
      allowSupplied: isPublicDeployment,
    });
    const targetUrl = `${targetBaseUrl}/v1/chat/completions`;
    const transportOptions = {
      maxBytes: 16 * 1024 * 1024,
      pinnedAddress: cloudTarget.address,
      pinnedFamily: cloudTarget.family,
    };

    if (raw._cloud_model) raw.model = raw._cloud_model;
    delete raw._cloud_api_key;
    delete raw._cloud_credential_id;
    delete raw._cloud_model;
    delete raw._cloud_base_url;
    const taskKind = raw.ai_system6_task_kind || "chat";
    delete raw.ai_system6_task_kind;
    delete raw.ai_system6_enable_thinking;

    const payload = raw;
    if (!apiKey) {
      send(res, 400, JSON.stringify({
        error: "Missing API key",
        code: "missing_byok_key",
      }), { "Content-Type": "application/json" });
      return;
    }
    if (
      isPublicDeployment
      && !new Set(DEEPSEEK_CLOUD_MODELS.map((item) => item.id)).has(payload.model)
    ) {
      send(res, 400, JSON.stringify({
        error: "Unsupported public cloud model",
        code: "unsupported_model",
      }), { "Content-Type": "application/json" });
      return;
    }
    if (isPublicDeployment) {
      const requestedMaxTokens = Number(payload.max_tokens);
      payload.max_tokens = Number.isFinite(requestedMaxTokens)
        ? Math.min(8192, Math.max(1, Math.floor(requestedMaxTokens)))
        : 1800;
      const publicSession = sessionFromRequest(req);
      payload.user_id = pseudonymousCloudUserId(publicSession?.nonce || "");
      if (usingSharedCloud) {
        payload.max_tokens = Math.min(
          payload.max_tokens,
          sharedCloudBudgetConfig().maxOutputTokens
        );
        let reservation;
        try {
          reservation = reserveSharedCloudRequest({
            sessionNonce: publicSession?.nonce || "",
            payload,
          });
        } catch (error) {
          console.error("[cloud-chat] shared budget unavailable:", /** @type {Error} */ (error).message);
          send(res, 503, JSON.stringify({
            error: "Shared cloud allowance is temporarily unavailable",
            code: "shared_cloud_budget_unavailable",
          }), { "Content-Type": "application/json", "Retry-After": "60" });
          return;
        }
        if (!reservation.ok) {
          const status = reservation.code === "shared_cloud_input_too_large" ? 413 : 429;
          const headers = reservation.retryAfter > 0
            ? {
                "Content-Type": "application/json",
                "Retry-After": String(reservation.retryAfter),
              }
            : { "Content-Type": "application/json" };
          send(res, status, JSON.stringify({
            error: reservation.detail,
            code: reservation.code,
          }), headers);
          return;
        }
        sharedReservation = reservation;
      }
    }
    stripCloudLocalOnlyFields(payload);
    if (DEEPSEEK_V4_MODELS.has(payload.model)) {
      const taskKindName = String(taskKind || "chat").toLowerCase();
      const thinkingEffort = CLOUD_THINKING_TASKS.has(taskKindName)
        ? responsesEffortForTask(taskKindName)
        : "none";
      payload.thinking = thinkingEffort === "none"
        ? { type: "disabled" }
        : { type: "enabled" };
      stripDeepseekV4LocalOnlyFields(payload);
      if (thinkingEffort !== "none") payload.reasoning_effort = thinkingEffort;
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
      payload.stream_options = {
        ...(payload.stream_options && typeof payload.stream_options === "object" ? payload.stream_options : {}),
        include_usage: true,
      };
      const streamParser = createSseJsonParser((event) => {
        if (event?.usage) sharedReservation?.addUsage(event.usage);
      });
      await proxyJsonStream(targetUrl, payload, signal, res, authHeaders, {
        maxBytes: isPublicDeployment ? 32 * 1024 * 1024 : undefined,
        pinnedAddress: cloudTarget.address,
        pinnedFamily: cloudTarget.family,
        onRequest: () => sharedReservation?.markUpstreamStarted(),
        onData: (chunk) => streamParser.push(chunk),
        onBeforeEnd: () => {
          streamParser.end();
          sharedReservation?.settle();
          sharedReservation = null;
        },
      });
      return;
    }

    const { response: upstream } = await postJsonWithFallback(
      targetUrl,
      payload,
      signal,
      authHeaders,
      {
        ...transportOptions,
        onRequest: () => sharedReservation?.markUpstreamStarted(),
      }
    );
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    if (!contentType.includes("application/json")) {
      const isAuthError = /auth|key|unauthorized|authentica/i.test(text);
      const status = isAuthError ? 401 : (upstream.ok ? 502 : upstream.status);
      send(res, status, JSON.stringify({
        error: isAuthError ? "Cloud API authentication failed" : "Cloud API request failed",
        detail: `Cloud API returned HTTP ${upstream.status}`,
      }), { "Content-Type": "application/json" });
      return;
    }

    let data = JSON.parse(text);
    if (!upstream.ok) {
      const warning = cloudUpstreamWarning(upstream.status);
      send(res, upstream.status, JSON.stringify({
        error: "Cloud API request failed",
        ...(warning ? { warning } : {}),
        detail: `Cloud API returned HTTP ${upstream.status}`,
      }), { "Content-Type": "application/json" });
      return;
    }

    const initialUsageTokens = usageTokenTotal(data?.usage);
    if (initialUsageTokens !== null) sharedReservation?.addUsage(data.usage);

    data = await repairCloudHumanizerOutputIfNeeded({
      data,
      payload,
      taskKind,
      targetUrl,
      signal,
      authHeaders,
      transportOptions,
      initialUsageTokens: initialUsageTokens || 0,
      reserveSharedCall: usingSharedCloud
        ? (repairPayload) => {
            const publicSession = sessionFromRequest(req);
            const reservation = reserveSharedCloudRequest({
              sessionNonce: publicSession?.nonce || "",
              payload: repairPayload,
            });
            if (!reservation.ok) {
              const error = /** @type {Error & { code?: string }} */ (new Error(reservation.detail));
              error.code = reservation.code;
              throw error;
            }
            return reservation;
          }
        : undefined,
    });
    const choice = data && data.choices ? data.choices[0] : {};
    data.ai_system6_metrics = {
      elapsed_ms: Date.now() - startedAt,
      finish_reason: choice.finish_reason || data.stop_reason || "",
      model: data.model || payload.model || "",
      usage: data.ai_system6_humanizer?.total_usage_tokens
        ? { ...(data.usage || {}), total_tokens: data.ai_system6_humanizer.total_usage_tokens }
        : data.usage || null,
    };

    send(res, upstream.status, JSON.stringify(data), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const status = Number(/** @type {any} */ (error)?.statusCode) || 502;
    const code = String(/** @type {any} */ (error)?.code || "cloud_proxy_failed");
    send(res, status, JSON.stringify({
      error: status < 500 ? /** @type {Error} */ (error).message : "Cloud proxy failed",
      code,
    }), { "Content-Type": "application/json" });
  } finally {
    sharedReservation?.settle();
    timeoutHandle?.cleanup();
  }
}

module.exports = { handleCloudChat };
