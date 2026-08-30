// GET /api/capabilities
//
// Gives the browser a single deployment-aware feature switchboard. The local
// profile advertises the complete desktop surface; the public profile only
// advertises routes intentionally registered by router.js.

"use strict";

const { sendJson } = require("../lib/http.js");
const {
  deploymentProfile,
  deploymentTarget,
  isPublicDeployment,
} = require("../runtime-profile.js");
const {
  publicReadiness,
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
  const publicAccessReady = publicReadiness().ready;
  const sharedCloud = isPublicDeployment && publicAccessReady && sharedCloudConfigured();
  const cloudFilesAvailable = !isPublicDeployment || publicAccessReady;
  const macSharedAvailable = sharedCloud;
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
    deployment_target: deploymentTarget,
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
      mac_shared_session: {
        available: macSharedAvailable,
        token_endpoint: macSharedAvailable ? "/api/session/mac-token" : "",
      },
      mac_shared_relay: {
        available: deploymentTarget === "mac",
        session_endpoint: deploymentTarget === "mac" ? "/api/mac-shared/session" : "",
        chat_endpoint: deploymentTarget === "mac" ? "/api/mac-shared/chat" : "",
        quota_endpoint: deploymentTarget === "mac" ? "/api/mac-shared/quota" : "",
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
      // Cloud vision rides the same BYOK / shared-allowance path as chat, so
      // the public deployment can read images for the first time.
      cloud_vision: true,
      cloud_files_byok: cloudFilesAvailable,
      cloud_files: {
        available: cloudFilesAvailable,
        max_file_bytes: 64 * 1024 * 1024,
        max_request_bytes: 200 * 1024 * 1024,
        max_files_per_request: 4,
        expires_after_seconds: 3600,
      },
      server_import: !isPublicDeployment,
      server_ocr: !isPublicDeployment,
      audio_transcription: !isPublicDeployment,
      cmf_rendering: true,
      image_generation: !isPublicDeployment,
    },
  }, {
    "Cache-Control": "no-store",
  });
}

module.exports = { handleCapabilities };
