"use strict";

const { sendJson } = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const { sharedSessionFromRequest } = require("../security/public-session.js");
const {
  sharedCloudBudgetSummary,
  sharedCloudConfigured,
} = require("../shared-cloud-budget.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function handleCloudQuota(req, res) {
  if (!isPublicDeployment) {
    sendJson(res, 404, { error: "Not found", code: "public_deployment_required" });
    return;
  }
  if (!sharedCloudConfigured()) {
    sendJson(res, 503, {
      error: "Shared cloud is not configured.",
      code: "shared_cloud_unavailable",
    }, { "Cache-Control": "no-store" });
    return;
  }
  const session = sharedSessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, {
      error: "A verified session is required.",
      code: "verification_required",
    }, { "Cache-Control": "no-store" });
    return;
  }

  try {
    const summary = sharedCloudBudgetSummary({ sessionNonce: session.nonce });
    sendJson(res, 200, {
      credential_mode: "shared",
      available: summary.available,
      pool_state: summary.poolState,
      remaining_session_requests: summary.remainingSessionRequests,
      session_request_limit: summary.sessionRequestLimit,
      resets_at: summary.resetsAt,
      retry_after_seconds: summary.retryAfter,
    }, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "shared_cloud_summary_failed",
      code: String(/** @type {any} */ (error)?.code || "shared_cloud_budget_unavailable"),
    }));
    sendJson(res, 503, {
      error: "Shared cloud allowance is temporarily unavailable.",
      code: "shared_cloud_budget_unavailable",
    }, { "Cache-Control": "no-store", "Retry-After": "60" });
  }
}

module.exports = { handleCloudQuota };
