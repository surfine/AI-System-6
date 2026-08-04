// GET /api/capabilities
//
// Gives the browser a single deployment-aware feature switchboard. The local
// profile advertises the complete desktop surface; the public profile only
// advertises routes intentionally registered by router.js.

"use strict";

const { sendJson } = require("../lib/http.js");
const {
  deploymentProfile,
  isPublicDeployment,
} = require("../runtime-profile.js");
const {
  SESSION_TTL_SECONDS,
  TURNSTILE_ACTION,
} = require("../security/public-session.js");
const {
  sharedCloudBudgetConfig,
  sharedCloudConfigured,
} = require("../shared-cloud-budget.js");

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleCapabilities(_req, res) {
  const sharedCloud = isPublicDeployment && sharedCloudConfigured();
  const sharedCloudBudget = sharedCloudBudgetConfig();
  let safariHttpLocalOrigin = "";
  try {
    const candidate = new URL(String(process.env.AI_SYSTEM6_HTTP_LOCAL_ORIGIN || ""));
    if (
      candidate.protocol === "http:"
      && !candidate.username
      && !candidate.password
      && candidate.pathname === "/"
      && !candidate.search
      && !candidate.hash
    ) {
      safariHttpLocalOrigin = candidate.origin;
    }
  } catch {}
  sendJson(res, 200, {
    deployment_profile: deploymentProfile,
    public_deployment: isPublicDeployment,
    public_access: {
      turnstile_required: isPublicDeployment,
      turnstile_site_key: isPublicDeployment
        ? String(process.env.TURNSTILE_SITE_KEY || "")
        : "",
      turnstile_action: isPublicDeployment ? TURNSTILE_ACTION : "",
      session_ttl_seconds: isPublicDeployment ? SESSION_TTL_SECONDS : 0,
      safari_http_local_origin: isPublicDeployment ? safariHttpLocalOrigin : "",
      shared_cloud: {
        available: sharedCloud,
        daily_request_limit: sharedCloud ? sharedCloudBudget.dailyRequestLimit : 0,
        session_request_limit: sharedCloud ? sharedCloudBudget.sessionRequestLimit : 0,
        max_input_tokens: sharedCloud ? sharedCloudBudget.maxInputTokens : 0,
        max_output_tokens: sharedCloud ? sharedCloudBudget.maxOutputTokens : 0,
      },
    },
    features: {
      cloud_byok: true,
      cloud_shared: sharedCloud,
      cloud_embeddings: !isPublicDeployment,
      search: true,
      reader: true,
      time_machine: true,
      endfield_search: true,
      endfield_ask: true,
      bureaucracy_captions: true,
      local_models: !isPublicDeployment,
      local_vision: !isPublicDeployment,
      server_import: !isPublicDeployment,
      server_ocr: !isPublicDeployment,
      audio_transcription: !isPublicDeployment,
      cmf_rendering: !isPublicDeployment,
      image_generation: !isPublicDeployment,
    },
  }, {
    "Cache-Control": "no-store",
  });
}

module.exports = { handleCapabilities };
