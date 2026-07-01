// POST /api/cloud/status
//
// Checks whether the configured cloud provider is reachable with the
// supplied API key, and (when reachable) reads the user balance. The
// balance lookup probes /v1/user/balance first and falls back to
// /user/balance for providers that expose the legacy path.
//
// Behavior parity with root server-cloud.js:
// - Missing API key short-circuits to a 400 with body
//   { error: "Missing API key", connected: false }.
// - Connectivity check uses GET /v1/models. Non-OK responses populate
//   `model_error` with the parsed error.message when the body is JSON,
//   else the raw text or the status code.
// - Balance check is only attempted when connectivity succeeds.
// - The balance shape is { currency, total, topped_up, granted,
//   is_available } pulled from balance_infos[0].
// - The outer catch returns 502 with { error, detail, connected: false }
//   and swallows AbortError.

"use strict";

const { send, sendJson, readJsonBody, requestSignal } = require("../lib/http.js");
const { getTextWithFallback } = require("../lib/fetch.js");
const {
  cloudAuthHeaders,
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
} = require("../cloud.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleCloudStatus(req, res) {
  const signal = requestSignal(req, res);

  try {
    const body = await readJsonBody(req);
    const apiKey = String(body.api_key || DEEPSEEK_API_KEY_DEFAULT).trim();
    if (!apiKey) {
      sendJson(res, 400, { error: "Missing API key", connected: false });
      return;
    }

    const authHeaders = cloudAuthHeaders(apiKey);
    const baseUrl = String(body.base_url || DEEPSEEK_BASE_URL_DEFAULT).replace(/\/$/, "");

    let connected = false;
    /** @type {string | null} */
    let modelError = null;
    try {
      const modelResult = await getTextWithFallback(`${baseUrl}/v1/models`, signal, {
        "Accept": "application/json",
        ...authHeaders,
      });
      connected = modelResult.ok;
      if (!modelResult.ok) {
        try {
          const errObj = JSON.parse(modelResult.text);
          modelError = errObj?.error?.message || modelResult.text || `HTTP ${modelResult.status}`;
        } catch {
          modelError = modelResult.text || `HTTP ${modelResult.status}`;
        }
      }
    } catch (err) {
      modelError = /** @type {Error} */ (err).message;
    }

    /** @type {null | {
     *   currency: string,
     *   total: string,
     *   topped_up: string,
     *   granted: string,
     *   is_available: boolean,
     * }} */
    let balance = null;
    /** @type {string | null} */
    let balanceError = null;
    if (connected) {
      try {
        let balanceResult = await getTextWithFallback(`${baseUrl}/v1/user/balance`, signal, {
          "Accept": "application/json",
          ...authHeaders,
        });
        if (!balanceResult.ok && balanceResult.status === 404) {
          balanceResult = await getTextWithFallback(`${baseUrl}/user/balance`, signal, {
            "Accept": "application/json",
            ...authHeaders,
          });
        }
        if (balanceResult.ok) {
          try {
            const data = JSON.parse(balanceResult.text);
            const info = Array.isArray(data && data.balance_infos) ? data.balance_infos[0] : null;
            if (info) {
              balance = {
                currency: info.currency || "CNY",
                total: info.total_balance || "0",
                topped_up: info.topped_up_balance || "0",
                granted: info.granted_balance || "0",
                is_available: !!data.is_available,
              };
            }
          } catch {
            balanceError = "Could not parse balance response";
          }
        } else {
          balanceError = `HTTP ${balanceResult.status}`;
        }
      } catch (err) {
        balanceError = /** @type {Error} */ (err).message;
      }
    }

    sendJson(res, 200, {
      connected,
      model_error: modelError,
      balance,
      balance_error: balanceError,
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Cloud status check failed",
      detail: /** @type {Error} */ (error).message,
      connected: false,
    }), { "Content-Type": "application/json" });
  }
}

module.exports = { handleCloudStatus };
