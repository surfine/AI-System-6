// POST /api/search/answer
//
// Searcher's "DeepSeek" provider: one server-side Responses API call with the
// web_search tool returns a cited answer plus the underlying search results.
// The browser supplies a BYOK key when one is present; otherwise the shared
// allowance meters the request through the same daily budget as the other
// cloud routes. The Responses API exists only on the official DeepSeek
// endpoint, so this route pins that base URL regardless of deployment.

"use strict";

const { send, readJsonBody, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const { DEEPSEEK_API_KEY_DEFAULT } = require("../cloud.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const { preparePublicCloudCall } = require("../lib/cloud-route.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const {
  settleSharedCloudRequest,
  sharedCloudBudgetConfig,
} = require("../shared-cloud-budget.js");
const {
  callWebSearchAnswer,
  callWebSearchAnswerStream,
  WEB_SEARCH_MAX_OUTPUT_TOKENS,
  WEB_SEARCH_MODES,
  WEB_SEARCH_QUERY_MAX_LENGTH,
} = require("../web-search.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleSearchAnswer(req, res) {
  const requestAbortSignal = requestSignal(req, res);
  const timeoutHandle = withTimeoutSignal(requestAbortSignal, 120000);
  const signal = timeoutHandle.signal;
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(req, { limitBytes: 128 * 1024 });
    const query = String(body.q || "").trim();
    if (!query) {
      send(res, 400, JSON.stringify({
        error: "Missing query",
        code: "missing_query",
      }), { "Content-Type": "application/json" });
      return;
    }
    if (query.length > WEB_SEARCH_QUERY_MAX_LENGTH) {
      send(res, 400, JSON.stringify({
        error: "Query too long",
        code: "query_too_long",
      }), { "Content-Type": "application/json" });
      return;
    }
    const mode = String(body.mode || "answer").toLowerCase();
    if (!WEB_SEARCH_MODES.has(mode)) {
      send(res, 400, JSON.stringify({
        error: "Unsupported search mode",
        code: "invalid_mode",
      }), { "Content-Type": "application/json" });
      return;
    }
    const stream = body.stream === true;
    const searchCalls = Array.isArray(body.search_calls)
      ? body.search_calls.filter((call) => call && typeof call === "object" && call.type === "web_search_call")
      : [];

    const requestedMax = Number(body.max_output_tokens);
    const maxOutputTokens = Number.isFinite(requestedMax)
      ? Math.min(WEB_SEARCH_MAX_OUTPUT_TOKENS, Math.max(200, Math.floor(requestedMax)))
      : WEB_SEARCH_MAX_OUTPUT_TOKENS;
    let apiKey = "";
    let userId = "";
    let effectiveMaxOutputTokens = maxOutputTokens;
    let sharedReservation = null;

    if (isPublicDeployment) {
      // Representative payload so the shared allowance can meter the whole
      // call before we know how many search-result tokens arrive.
      const payload = {
        model: "deepseek-v4-flash",
        max_tokens: maxOutputTokens,
        input: query,
      };
      const cloud = await preparePublicCloudCall({
        credentialId: body._cloud_credential_id,
        suppliedApiKey: body._cloud_api_key,
        model: "deepseek-v4-flash",
        payload,
        req,
      });
      apiKey = cloud.apiKey;
      userId = String(cloud.payload.user_id || "");
      sharedReservation = cloud.reservation;
      effectiveMaxOutputTokens = Math.min(
        maxOutputTokens,
        Number(cloud.payload.max_tokens) || maxOutputTokens,
        sharedCloudBudgetConfig().maxOutputTokens
      );
    } else {
      apiKey = String(await resolveCloudCredential({
        credentialId: body._cloud_credential_id,
        provider: "deepseek",
        suppliedApiKey: body._cloud_api_key,
        allowSupplied: false,
      })).trim();
    }

    if (!apiKey) {
      const shared = isPublicDeployment && !String(body._cloud_api_key || "").trim();
      send(res, shared ? 503 : 400, JSON.stringify({
        error: shared
          ? "The site has no shared cloud key configured"
          : "Missing API key",
        code: shared ? "shared_cloud_budget_unavailable" : "missing_byok_key",
      }), { "Content-Type": "application/json" });
      return;
    }

    const envelope = (result) => ({
      provider: "deepseek",
      mode,
      answer: result.answer,
      verdict: result.verdict || null,
      citations: result.citations,
      results: result.results,
      searchCalls: result.searchCalls,
      usage: result.usage,
      ai_system6_metrics: {
        elapsed_ms: Date.now() - startedAt,
        model: "deepseek-v4-flash",
        usage: result.usage,
      },
    });

    const writeSse = (payload) => {
      if (res.destroyed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      let streamError = null;
      try {
        const finalResult = await callWebSearchAnswerStream({
          apiKey,
          query,
          signal,
          mode,
          maxOutputTokens: effectiveMaxOutputTokens,
          userId,
          searchCalls,
          onStatus: (status) => writeSse({ ai_system6_status: status }),
          onDelta: (content) => writeSse({ choices: [{ delta: { content } }] }),
          onDone: (result) => writeSse({ ai_system6_result: envelope(result) }),
        });
        if (signal.aborted) return;
        if (sharedReservation && finalResult) {
          settleSharedCloudRequest({
            reservedTokens: sharedReservation.reservedTokens,
            actualTokens: Number(finalResult.usage?.total_tokens || 0),
          });
        }
      } catch (error) {
        if (signal.aborted) return;
        streamError = /** @type {any} */ (error);
      }
      if (streamError) {
        writeSse({
          ai_system6_error: {
            error: String(streamError.message || ""),
            ...(streamError.code ? { code: streamError.code } : {}),
            ...(streamError.warning ? { warning: streamError.warning } : {}),
            detail: String(streamError.message || ""),
          },
        });
      }
      writeSse({ type: "done" });
      res.end();
      return;
    }

    const result = await callWebSearchAnswer({
      apiKey,
      query,
      signal,
      mode,
      maxOutputTokens: effectiveMaxOutputTokens,
      userId,
      searchCalls,
    });
    if (signal.aborted) return;
    if (sharedReservation) {
      settleSharedCloudRequest({
        reservedTokens: sharedReservation.reservedTokens,
        actualTokens: Number(result.usage?.total_tokens || 0),
      });
    }

    send(res, 200, JSON.stringify(envelope(result)), { "Content-Type": "application/json" });
  } catch (error) {
    if (signal.aborted) return;
    const status = /** @type {any} */ (error)?.statusCode || 502;
    const headers = { "Content-Type": "application/json" };
    if (/** @type {any} */ (error)?.retryAfter > 0) {
      headers["Retry-After"] = String(/** @type {any} */ (error).retryAfter);
    }
    send(res, status, JSON.stringify({
      error: String(/** @type {Error} */ (error).message),
      ...(/** @type {any} */ (error)?.code ? { code: /** @type {any} */ (error).code } : {}),
      ...(/** @type {any} */ (error)?.warning ? { warning: /** @type {any} */ (error).warning } : {}),
      detail: String(/** @type {Error} */ (error).message),
    }), headers);
  }
}

module.exports = { handleSearchAnswer };
