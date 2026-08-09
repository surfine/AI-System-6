"use strict";

const { handleTurnstileSession, sessionFromRequest } = require("../security/public-session.js");
const { sendJson } = require("../lib/http.js");

/**
 * Lightweight session probe used by the browser before it opens the
 * verification modal. Not a gate: a failed or missing probe simply falls back
 * to the Turnstile flow, and protected requests remain the authority on
 * whether a session actually exists.
 */
function handleSessionStatus(req, res) {
  sendJson(res, 200, {
    verified: !!sessionFromRequest(req),
  }, {
    "Cache-Control": "no-store",
  });
}

module.exports = { handleTurnstileSession, handleSessionStatus };
