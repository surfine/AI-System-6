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

const { send, sendJson, readJsonBody, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const { getTextOnceWithFallback } = require("../lib/fetch.js");
const {
  cloudAuthHeaders,
  DEEPSEEK_BASE_URL_DEFAULT,
  DEEPSEEK_PUBLIC_BASE_URL,
  resolveCloudTarget,
} = require("../cloud.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { resolveCloudCredential } = require("../credential-vault.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleCloudStatus(req, res) {
  const timeoutHandle = withTimeoutSignal(requestSignal(req, res), 30000);
  const signal = timeoutHandle.signal;

  try {
    const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
    const usingSharedCloud = isPublicDeployment && !String(body.api_key || "").trim();
    const requestedBaseUrl = isPublicDeployment
      ? DEEPSEEK_PUBLIC_BASE_URL
      : body.base_url || DEEPSEEK_BASE_URL_DEFAULT;
    const cloudTarget = await resolveCloudTarget(requestedBaseUrl);
    const baseUrl = cloudTarget.baseUrl;
    const apiKey = String(await resolveCloudCredential({
      credentialId: body.credential_id,
      provider: body.provider || "deepseek",
      targetBaseUrl: baseUrl,
      suppliedApiKey: body.api_key,
      allowSupplied: isPublicDeployment,
    })).trim();
    if (!apiKey) {
      sendJson(res, 400, { error: "Missing API key", connected: false });
      return;
    }

    const authHeaders = cloudAuthHeaders(apiKey);
    const fetchOptions = {
      maxBytes: 4 * 1024 * 1024,
      pinnedAddress: cloudTarget.address,
      pinnedFamily: cloudTarget.family,
    };

    let connected = false;
    /** @type {string | null} */
    let modelError = null;
    try {
      const modelResult = await getTextOnceWithFallback(
        `${baseUrl}/v1/models`,
        signal,
        {
          "Accept": "application/json",
          ...authHeaders,
        },
        fetchOptions
      );
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
    if (connected && !usingSharedCloud) {
      try {
        let balanceResult = await getTextOnceWithFallback(
          `${baseUrl}/v1/user/balance`,
          signal,
          {
            "Accept": "application/json",
            ...authHeaders,
          },
          fetchOptions
        );
        if (!balanceResult.ok && balanceResult.status === 404) {
          balanceResult = await getTextOnceWithFallback(
            `${baseUrl}/user/balance`,
            signal,
            {
              "Accept": "application/json",
              ...authHeaders,
            },
            fetchOptions
          );
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
      credential_mode: usingSharedCloud ? "shared" : "byok",
      model_error: modelError,
      balance,
      balance_error: balanceError,
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const status = Number(/** @type {any} */ (error)?.statusCode) || 502;
    send(res, status, JSON.stringify({
      error: status < 500 ? /** @type {Error} */ (error).message : "Cloud status check failed",
      code: String(/** @type {any} */ (error)?.code || "cloud_status_failed"),
      connected: false,
    }), { "Content-Type": "application/json" });
  } finally {
    timeoutHandle.cleanup();
  }
}

module.exports = { handleCloudStatus };
