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
  DEEPSEEK_BASE_URL_DEFAULT,
  DEEPSEEK_PUBLIC_BASE_URL,
  isDeepSeekCloudModelId,
  isTrustedDeepSeekCredentialTarget,
  normalizeCloudModelId,
  resolveCloudTarget,
  resolveCloudVisionModel,
} = require("../cloud.js");
const { normalizeCloudVisionMessages } = require("../cloud-vision.js");
const { handleCloudFileTokenMessages } = require("../cloud-files.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const { sharedSessionFromRequest } = require("../security/public-session.js");
const {
  pseudonymousCloudUserId,
  reserveSharedCloudRequest,
  sharedCloudBudgetConfig,
  usageTokenTotal,
} = require("../shared-cloud-budget.js");
const { cloudUpstreamWarning } = require("../responses.js");
const {
  autoModelForTask,
  cloudModelBudgetWeight,
  isAutoModelId,
  resolveTaskPolicy,
} = require("../task-policy.js");

/**
 * @param {any} payload
 * @returns {boolean}
 */
function shouldStripDeepseekV4Sampling(payload) {
  if (!isDeepSeekCloudModelId(payload.model)) return false;
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
 *   onUsage?: (usage: any) => void,
 * }} options
 */
async function repairCloudHumanizerOutputIfNeeded(options) {
  const { payload, taskKind, targetUrl, signal, authHeaders, transportOptions } = options;
  let data = options.data;
  let content = modelContentFromChatData(data).trim();
  if (!content || !shouldLintHumanizerOutput(taskKind)) return data;
  let hits = findHumanizerOutputHits(content);
  const explicitRewrite = shouldRepairHumanizerOutput(taskKind);

  // What the run's ledger is told about each repair call. An attempt exists
  // from the moment the request is on the wire - not from the moment a
  // response happens to be readable - so a call that was sent and then cut off
  // is still one attempt the run owes an explanation for.
  let attempts = 0;
  let repaired = false;
  let totalUsageTokens = Math.max(0, Number(options.initialUsageTokens) || 0);
  // `round` bounds the loop the way `attempts < 2` used to: the counter itself
  // may only move when a request is really sent, and a loop bounded by it
  // could spin forever if a transport never reported the send.
  for (let round = 0; explicitRewrite && round < 2 && hits.length; round += 1) {
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
    let requestSent = false;
    let usageBooked = false;
    try {
      repairReservation = options.reserveSharedCall?.(repairPayload) || null;
      const { response } = await postJsonWithFallback(
        targetUrl,
        repairPayload,
        signal,
        authHeaders,
        {
          ...transportOptions,
          // One callback per call, but a transport may report the send more
          // than once: the attempt is registered the first time and never
          // counted twice.
          onRequest: () => {
            if (!requestSent) {
              requestSent = true;
              attempts += 1;
            }
            repairReservation?.markUpstreamStarted();
          },
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
      // Each repair call is its own upstream call: the run's ledger books it
      // whether or not its usage arrived, so a missing figure widens the
      // unknown instead of vanishing into the total.
      options.onUsage?.(repairData?.usage);
      usageBooked = true;
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
      // Sent, but the response never produced a usage figure - a broken body,
      // an unreadable stream, a cancelled call. The ledger learns that this
      // call cost something it cannot quantify, so the run reports a floor
      // marked unknown rather than a smaller, precise-looking total. A call
      // that was refused before it was sent is not booked at all.
      if (requestSent && !usageBooked) options.onUsage?.(undefined);
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
 * A completion that spent its whole budget thinking: the upstream stops with
 * `finish_reason: "length"` and no message content at all. DeepSeek counts
 * reasoning tokens inside `max_tokens`, so this is a budget failure, and it
 * arrives as a silent blank rather than an error.
 *
 * @param {any} data
 * @returns {boolean}
 */
function isBudgetStarvedCompletion(data) {
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  if (!choice) return false;
  if (String(choice.finish_reason || "") !== "length") return false;
  return !String(choice.message?.content || "").trim();
}

/**
 * What the run cost, as opposed to what the answer says.
 *
 * `data.usage` describes the reply that survived; a run that answered twice
 * paid for two calls. The returned object keeps the answering call's own
 * prompt/completion numbers - callers show those - and carries the run total
 * the caller can add up. When any call never reported its usage the total is
 * marked as unknown rather than presented as an exact figure.
 *
 * @param {any} finalUsage
 * @param {number} knownTokens
 * @param {boolean} unknown
 */
function cloudRunUsageMetrics(finalUsage, knownTokens, unknown) {
  if (!finalUsage && !knownTokens && !unknown) return null;
  const usage = { ...(finalUsage || {}) };
  if (unknown) {
    // A call that never reported its usage makes the total a floor, not a
    // measurement: say so, and do not print a precise-looking zero.
    usage.total_tokens_known = false;
    if (knownTokens > 0) usage.total_tokens = knownTokens;
  } else {
    usage.total_tokens = knownTokens;
  }
  return usage;
}

/**
 * Run the same request once more with thinking off. The answer budget is
 * unchanged, so the tokens that went into the truncated thinking chain go to
 * the answer instead. Returns null when the retry is not usable.
 *
 * @param {{
 *   payload: any,
 *   targetUrl: string,
 *   signal: AbortSignal | null | undefined,
 *   authHeaders: Record<string, string>,
 *   transportOptions: { maxBytes?: number, pinnedAddress?: string, pinnedFamily?: number },
 *   reserveSharedCall?: (payload: any) => any,
 * }} options
 * @returns {Promise<any | null>}
 */
async function retryWithoutThinking({ payload, targetUrl, signal, authHeaders, transportOptions, reserveSharedCall }) {
  const retryPayload = { ...payload, thinking: { type: "disabled" } };
  delete retryPayload.reasoning_effort;
  /** @type {any} */
  let reservation = null;
  try {
    if (reserveSharedCall) reservation = reserveSharedCall(retryPayload);
    // The retry is a request of its own, so it is marked the same way every
    // other send path marks one: from the moment the request is on the wire.
    // Waiting for the response means a request that was sent and then cut off
    // looks like one that was never sent, and its reservation is released
    // instead of retained for a call that really happened.
    const { response } = await postJsonWithFallback(
      targetUrl,
      retryPayload,
      signal,
      authHeaders,
      {
        ...transportOptions,
        onRequest: () => reservation?.markUpstreamStarted(),
      }
    );
    const text = await response.text();
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") || "").includes("application/json")) return null;
    const retried = JSON.parse(text);
    reservation?.addUsage(retried?.usage);
    if (isBudgetStarvedCompletion(retried)) return null;
    return retried;
  } catch {
    return null;
  } finally {
    reservation?.settle();
  }
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
      applyChatTaskContract(await readJsonBody(req, { limitBytes: 10 * 1024 * 1024 }))
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

    if (raw._cloud_model) raw.model = normalizeCloudModelId(raw._cloud_model);
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
    const policy = resolveTaskPolicy(taskKind);
    const deepSeekTarget = isTrustedDeepSeekCredentialTarget("deepseek", targetBaseUrl);
    const vision = normalizeCloudVisionMessages(payload.messages);
    payload.messages = vision.messages;
    if (vision.fileCount && usingSharedCloud) {
      send(res, 400, JSON.stringify({
        error: "DeepSeek Files API requires your own API key",
        code: "cloud_files_byok_required",
      }), { "Content-Type": "application/json" });
      return;
    }
    if (vision.fileCount) {
      const files = handleCloudFileTokenMessages(payload.messages, {
        apiKey,
        baseUrl: targetBaseUrl,
        sessionNonce: isPublicDeployment ? sharedSessionFromRequest(req)?.nonce || "" : "",
        isPublic: isPublicDeployment,
      });
      payload.messages = files.messages;
    }
    if (vision.hasVision) {
      if (!deepSeekTarget) {
        send(res, 400, JSON.stringify({
          error: "Cloud image input needs the DeepSeek vision endpoint",
          code: "cloud_vision_endpoint_required",
        }), { "Content-Type": "application/json" });
        return;
      }
      payload.model = resolveCloudVisionModel(payload.model);
    }
    if (isAutoModelId(payload.model)) {
      if (!deepSeekTarget) {
        send(res, 400, JSON.stringify({
          error: "Automatic model choice needs the DeepSeek endpoint",
          code: "auto_model_unavailable",
          warning: "自动选择模型只在 DeepSeek 端点上可用，请在 Control Panel 选择一个具体模型。",
        }), { "Content-Type": "application/json" });
        return;
      }
      payload.model = autoModelForTask(taskKind);
    }
    if (
      isPublicDeployment
      && !isDeepSeekCloudModelId(payload.model)
    ) {
      send(res, 400, JSON.stringify({
        error: "Unsupported public cloud model",
        code: "unsupported_model",
      }), { "Content-Type": "application/json" });
      return;
    }

    // The browser's max_tokens is an *answer* budget. DeepSeek counts
    // reasoning tokens inside max_tokens, so the thinking headroom is added
    // here and every later clamp applies to the answer part alone. Without
    // this, a thinking task spends its whole allowance reasoning and returns
    // an empty message with finish_reason "length".
    const answerBudget = Number.isFinite(Number(payload.max_tokens))
      ? Math.max(1, Math.floor(Number(payload.max_tokens)))
      : policy.answerBudget;
    const reasoningAllowance = isDeepSeekCloudModelId(payload.model)
      ? policy.reasoningAllowance
      : 0;

    if (isPublicDeployment) {
      const publicAnswerBudget = Math.min(8192, answerBudget);
      payload.max_tokens = publicAnswerBudget + reasoningAllowance;
      const publicSession = sharedSessionFromRequest(req);
      payload.user_id = pseudonymousCloudUserId(publicSession?.nonce || "");
      if (usingSharedCloud) {
        payload.max_tokens = Math.min(
          publicAnswerBudget,
          sharedCloudBudgetConfig().maxOutputTokens
        ) + reasoningAllowance;
        let reservation;
        try {
          reservation = reserveSharedCloudRequest({
            sessionNonce: publicSession?.nonce || "",
            payload,
            reasoningAllowance,
            modelWeight: cloudModelBudgetWeight(payload.model),
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
    if (isDeepSeekCloudModelId(payload.model)) {
      payload.thinking = policy.thinking
        ? { type: "enabled" }
        : { type: "disabled" };
      stripDeepseekV4LocalOnlyFields(payload);
      // `reasoning_effort` stays a top-level field: measured 2026-08-14, the
      // nested `thinking.reasoning_effort` form has no effect on the spend.
      if (policy.thinking) payload.reasoning_effort = policy.effort;
      // A tool-carrying request has to echo every round's reasoning_content
      // back or DeepSeek answers 400, and thinking mode rejects a forced tool
      // choice. Tool rounds therefore run non-thinking with an automatic
      // choice; see the thinking-mode and tool-call guides.
      if (Array.isArray(payload.tools) && payload.tools.length) {
        payload.thinking = { type: "disabled" };
        delete payload.reasoning_effort;
        if (payload.tool_choice && payload.tool_choice !== "auto") delete payload.tool_choice;
      }
      if (!isPublicDeployment) {
        payload.max_tokens = answerBudget + reasoningAllowance;
      }
    }
    if (vision.hasVision) {
      payload.thinking = { type: "disabled" };
      delete payload.reasoning_effort;
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

    // The run's own ledger, one entry per upstream call.
    //
    // The answer that is RETURNED is not the sum of what the run cost: a
    // thinking fallback replaces the first answer, and a humanizer repair
    // replaces it again, so reading the total off the surviving `data` charges
    // the run for whichever call happened to be last. Each call books its own
    // usage here, and a call whose usage never arrived leaves the total marked
    // unknown instead of reporting a smaller, precise-looking number.
    let knownUsageTokens = 0;
    let usageIsUnknown = false;
    const noteRunUsage = (usage) => {
      const total = usageTokenTotal(usage);
      if (total === null) usageIsUnknown = true;
      else knownUsageTokens += total;
      return total;
    };
    /** @type {number | null | undefined} what the first answer reported */
    let firstAnswerUsageTokens;
    /** @type {number | null | undefined} undefined = this run never retried */
    let retriedUsageTokens;

    if (policy.thinking && isBudgetStarvedCompletion(data)) {
      // The first request's usage is booked here, once, and before anything
      // decides to retry. Booking it afterwards is what charged the first
      // reservation for both calls: the answer the retry returned was added to
      // the request it replaced, on top of the retry's own settlement.
      firstAnswerUsageTokens = usageTokenTotal(data?.usage);
      if (firstAnswerUsageTokens !== null) sharedReservation?.addUsage(data.usage);
      const retried = await retryWithoutThinking({
        payload,
        targetUrl,
        signal,
        authHeaders,
        transportOptions,
        reserveSharedCall: usingSharedCloud
          ? (retryPayload) => {
              const publicSession = sharedSessionFromRequest(req);
              const reservation = reserveSharedCloudRequest({
                sessionNonce: publicSession?.nonce || "",
                payload: retryPayload,
                // One reservation per call, at the weight of the model that
                // will answer. This retry runs with thinking disabled, so the
                // headroom the first call reserved for reasoning is plain
                // answer budget here: no allowance is subtracted, which is
                // this payload's own budget rule rather than the first
                // call's.
                modelWeight: cloudModelBudgetWeight(retryPayload.model),
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
      if (!retried) {
        send(res, 502, JSON.stringify({
          error: "The reasoning chain used the whole answer budget",
          code: "reasoning_budget_exhausted",
          warning: "这次思考用光了回答额度，没有正文返回。请缩短输入或稍后重试。",
        }), { "Content-Type": "application/json" });
        return;
      }
      // A second upstream call answered. It settles on its own reservation
      // (see retryWithoutThinking); this is the same figure booked once for
      // the run, or null when that call reported no usage at all - which the
      // total below must keep visible rather than quietly drop.
      retriedUsageTokens = usageTokenTotal(retried?.usage);
      retried.ai_system6_thinking_fallback = {
        reason: "reasoning_budget_exhausted",
        retried_without_thinking: true,
      };
      data = retried;
    }

    // No fallback: this is still the first answer, and its usage belongs to
    // the first reservation. After a fallback the answer in `data` is the
    // retry's own, already booked above - so this must not add it to the
    // first request a second time.
    if (!data?.ai_system6_thinking_fallback?.retried_without_thinking) {
      firstAnswerUsageTokens = usageTokenTotal(data?.usage);
      if (firstAnswerUsageTokens !== null) sharedReservation?.addUsage(data.usage);
    }

    // What the humanizer is repairing is the answer that will be returned.
    const initialUsageTokens = usageTokenTotal(data?.usage);

    data = await repairCloudHumanizerOutputIfNeeded({
      data,
      payload,
      taskKind,
      targetUrl,
      signal,
      authHeaders,
      transportOptions,
      initialUsageTokens: initialUsageTokens || 0,
      onUsage: noteRunUsage,
      reserveSharedCall: usingSharedCloud
        ? (repairPayload) => {
            const publicSession = sharedSessionFromRequest(req);
            const reservation = reserveSharedCloudRequest({
              sessionNonce: publicSession?.nonce || "",
              payload: repairPayload,
              reasoningAllowance,
              modelWeight: cloudModelBudgetWeight(repairPayload.model),
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

    // Assemble the run's ledger from the calls that actually happened: the
    // first answer, the retry that replaced it if there was one, and anything
    // the humanizer repaired. Each is booked once.
    [firstAnswerUsageTokens, retriedUsageTokens].forEach((tokens) => {
      if (tokens === null) usageIsUnknown = true;
      else if (typeof tokens === "number") knownUsageTokens += tokens;
    });

    const choice = data && data.choices ? data.choices[0] : {};
    data.ai_system6_metrics = {
      elapsed_ms: Date.now() - startedAt,
      finish_reason: choice.finish_reason || data.stop_reason || "",
      model: data.model || payload.model || "",
      usage: cloudRunUsageMetrics(data.usage, knownUsageTokens, usageIsUnknown),
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

// `repairCloudHumanizerOutputIfNeeded` is exported for its own accounting
// contract: whether a sent repair call reaches the run's ledger is decided
// inside it, and the alternative - driving it only through the whole route -
// would need a public-deployment session to reach the same lines.
module.exports = { handleCloudChat, repairCloudHumanizerOutputIfNeeded };
