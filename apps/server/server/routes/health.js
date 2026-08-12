// Lightweight liveness and readiness probes. These handlers deliberately avoid
// importing model, OCR, document, or rendering dependencies.

"use strict";

const { sendJson } = require("../lib/http.js");
const { deploymentProfile } = require("../runtime-profile.js");
const { publicReadiness } = require("../security/public-session.js");

const startedAt = Date.now();

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleHealth(_req, res) {
  sendJson(res, 200, {
    status: "ok",
    profile: deploymentProfile,
    uptime_seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
  }, {
    "Cache-Control": "no-store",
  });
}

/**
 * The current server has no mandatory database or model dependency. Reaching
 * the dispatcher means it is ready to serve its configured route surface.
 *
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 */
function handleReady(_req, res) {
  const readiness = publicReadiness();
  sendJson(res, readiness.ready ? 200 : 503, {
    status: readiness.ready ? "ready" : "not_ready",
    profile: deploymentProfile,
    missing_configuration: readiness.missing,
  }, {
    "Cache-Control": "no-store",
  });
}

module.exports = { handleHealth, handleReady };
