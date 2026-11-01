"use strict";

const {
  handleTurnstileSession,
  anonymousSessionIdentity,
  issueMacSharedToken,
  macTurnstileHostnames,
  PUBLIC_ORIGIN,
  sessionFromRequest,
  verifyTurnstileAttempt,
} = require("../security/public-session.js");
const { readJsonBody, sendJson } = require("../lib/http.js");

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

async function handleMacSharedToken(req, res) {
  const body = await readJsonBody(req, { limitBytes: 1024 });
  const unexpectedKeys = Object.keys(body).filter((key) => key !== "turnstile_token");
  if (unexpectedKeys.length) {
    sendJson(res, 400, {
      error: "Mac shared session accepts only a Turnstile token.",
      code: "unsupported_session_option",
    });
    return;
  }
  let session = sessionFromRequest(req);
  if (!session) {
    const turnstileToken = String(body.turnstile_token || "");
    if (!turnstileToken) {
      sendJson(res, 401, { error: "Verification required", code: "verification_required" });
      return;
    }
    const verification = await verifyTurnstileAttempt(
      turnstileToken,
      req,
      macTurnstileHostnames()
    );
    if (!verification.ok) {
      sendJson(res, verification.status, {
        error: verification.error,
        code: verification.code,
      }, verification.retryAfter ? { "Retry-After": String(verification.retryAfter) } : {});
      return;
    }
    session = anonymousSessionIdentity();
  }
  const issued = issueMacSharedToken(session);
  if (!issued) {
    sendJson(res, 503, {
      error: "Mac shared session is unavailable.",
      code: "mac_shared_session_unavailable",
    });
    return;
  }
  sendJson(res, 200, {
    access_token: issued.token,
    token_type: "Bearer",
    expires_in: issued.expiresIn,
    expires_at: issued.expiresAt,
    scope: "mac-shared",
    public_origin: PUBLIC_ORIGIN,
  }, { "Cache-Control": "no-store" });
}

module.exports = { handleTurnstileSession, handleSessionStatus, handleMacSharedToken };
