"use strict";

// Public-deployment cloud preflight shared by the server-side model routes
// (bureaucracy captions, Endfield ask). /api/cloud/chat keeps its own inline
// copy so the browser chat surface stays decoupled; this helper mirrors that
// contract for routes that call the model on the server: BYOK key when the
// browser supplied one, otherwise the shared allowance (server key plus the
// daily budget reservation), the public model allowlist, and the public base
// URL. Local deployments never call this helper.

const { isPublicDeployment } = require("../runtime-profile.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const { sessionFromRequest } = require("../security/public-session.js");
const {
  pseudonymousCloudUserId,
  reserveSharedCloudRequest,
  sharedCloudBudgetConfig,
} = require("../shared-cloud-budget.js");
const {
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_CLOUD_MODELS,
  DEEPSEEK_PUBLIC_BASE_URL,
  cloudAuthHeaders,
} = require("../cloud.js");

const PUBLIC_MODEL_IDS = new Set(DEEPSEEK_CLOUD_MODELS.map((item) => item.id));

/**
 * Build a structured model-route error that carries the HTTP status, machine
 * code, retry hint, and a user-facing warning the route handler can forward.
 *
 * @param {number} status
 * @param {string} code
 * @param {number} retryAfter
 * @param {string} detail
 * @param {string} warning
 * @returns {Error & { statusCode?: number, code?: string, warning?: string, retryAfter?: number }}
 */
function cloudRouteError(status, code, retryAfter, detail, warning) {
  const error = /** @type {Error & { statusCode?: number, code?: string, warning?: string, retryAfter?: number }} */ (
    new Error(detail)
  );
  error.statusCode = status;
  error.code = code;
  error.warning = warning;
  if (retryAfter > 0) error.retryAfter = retryAfter;
  return error;
}

/**
 * Resolve how a server-side model route should call the cloud on the public
 * deployment: the browser-supplied BYOK key when one is present, otherwise the
 * shared allowance with a budget reservation. Failures throw the structured
 * error from `cloudRouteError`, so callers forward `statusCode` / `code` /
 * `warning` straight from their existing catch blocks.
 *
 * @param {object} options
 * @param {string} [options.credentialId]
 * @param {string} [options.suppliedApiKey]
 * @param {string} [options.requestedBaseUrl]
 * @param {string} [options.model]
 * @param {object} options.payload
 * @param {import("node:http").IncomingMessage} [options.req]
 * @returns {Promise<{
 *   apiKey: string, baseUrl: string, model: string, payload: object,
 *   authHeaders: object, usingSharedCloud: boolean,
 * }>}
 */
async function preparePublicCloudCall({
  credentialId = "",
  suppliedApiKey = "",
  requestedBaseUrl = "",
  model = "deepseek-v4-flash",
  payload,
  req,
}) {
  if (!isPublicDeployment) {
    throw new Error("preparePublicCloudCall is only for the public deployment");
  }

  const suppliedPublicApiKey = String(suppliedApiKey || "").trim();
  const usingSharedCloud = !suppliedPublicApiKey;
  const apiKey = String(await resolveCloudCredential({
    credentialId,
    provider: "deepseek",
    suppliedApiKey: suppliedPublicApiKey || DEEPSEEK_API_KEY_DEFAULT,
    allowSupplied: true,
  })).trim();
  const modelName = String(model || "deepseek-v4-flash").trim();

  if (!PUBLIC_MODEL_IDS.has(modelName)) {
    throw cloudRouteError(
      400,
      "unsupported_model",
      0,
      "Unsupported public cloud model",
      "该模型不在公网可用模型列表中，请在 Control Panel 选择 DeepSeek V4 系列模型。"
    );
  }

  const publicSession = sessionFromRequest(req);
  const sessionNonce = publicSession?.nonce || "";
  const sessionUserId = pseudonymousCloudUserId(sessionNonce);

  if (usingSharedCloud) {
    payload.max_tokens = Math.min(
      Number.isFinite(Number(payload.max_tokens)) ? Number(payload.max_tokens) : 1800,
      sharedCloudBudgetConfig().maxOutputTokens
    );
    payload.user_id = sessionUserId;
    let reservation;
    try {
      reservation = reserveSharedCloudRequest({ sessionNonce, payload });
    } catch (error) {
      throw cloudRouteError(
        503,
        "shared_cloud_budget_unavailable",
        60,
        String(error?.message || "Shared cloud allowance is temporarily unavailable"),
        "共享云端额度暂时不可用，请稍后再试，或在 Control Panel 配置自己的密钥。"
      );
    }
    if (!reservation.ok) {
      throw cloudRouteError(
        reservation.code === "shared_cloud_input_too_large" ? 413 : 429,
        reservation.code,
        reservation.retryAfter || 0,
        reservation.detail,
        "共享云端额度已用完，请明天再试，或在 Control Panel 配置自己的密钥。"
      );
    }
  } else {
    payload.user_id = sessionUserId;
  }

  if (!apiKey) {
    throw cloudRouteError(
      usingSharedCloud ? 503 : 400,
      usingSharedCloud ? "shared_cloud_budget_unavailable" : "missing_byok_key",
      0,
      usingSharedCloud
        ? "The site has no shared cloud key configured"
        : "Missing API key",
      "缺少云端 API 密钥，请在 Control Panel 的云端模型设置里填写。"
    );
  }

  return {
    apiKey,
    baseUrl: DEEPSEEK_PUBLIC_BASE_URL,
    model: modelName,
    payload,
    authHeaders: cloudAuthHeaders(apiKey),
    usingSharedCloud,
  };
}

module.exports = { preparePublicCloudCall };
