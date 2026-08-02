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

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleCapabilities(_req, res) {
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
    },
    features: {
      cloud_byok: true,
      cloud_embeddings: !isPublicDeployment,
      search: true,
      reader: true,
      time_machine: true,
      endfield_search: true,
      endfield_ask: !isPublicDeployment,
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
