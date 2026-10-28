// GET /api/cloud/models
//
// Returns the built-in cloud model registry. Same JSON shape as the
// root server-cloud.js handler: `{ models, source: "builtin" }`, plus
// `by_provider` for a provider whose list is not DeepSeek's (Anthropic, on
// the writer's own Mac only), so the page keeps no copy of it.

"use strict";

const { sendJson } = require("../lib/http.js");
const { DEEPSEEK_CLOUD_MODELS } = require("../cloud.js");
const { ANTHROPIC_MODELS } = require("../anthropic-messages.js");
const { isPublicDeployment } = require("../runtime-profile.js");

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleCloudModels(_req, res) {
  sendJson(res, 200, {
    models: DEEPSEEK_CLOUD_MODELS,
    by_provider: isPublicDeployment ? {} : { anthropic: ANTHROPIC_MODELS },
    source: "builtin",
  });
}

module.exports = { handleCloudModels };
