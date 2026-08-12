// GET /api/cloud/models
//
// Returns the built-in cloud model registry. Same JSON shape as the
// root server-cloud.js handler: `{ models, source: "builtin" }`.

"use strict";

const { sendJson } = require("../lib/http.js");
const { DEEPSEEK_CLOUD_MODELS } = require("../cloud.js");

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleCloudModels(_req, res) {
  sendJson(res, 200, {
    models: DEEPSEEK_CLOUD_MODELS,
    source: "builtin",
  });
}

module.exports = { handleCloudModels };
