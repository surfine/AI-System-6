"use strict";

// D7 (owner ruling 2026-10-29): the local /api/agent routes answer only to a
// token minted once per server boot. Only the desktop receives it — the Mac
// shell in the identity proof (shell-session.js), or, on the weaker npm-start
// profile, the served desk page (static.js injects a same-origin script that
// sets it). Anything without it gets 401 agent_token_required, whatever else
// about the request looks local.

const crypto = require("node:crypto");

/** The request header that carries the token. */
const AGENT_TOKEN_HEADER = "x-ai-system6-agent-token";

const token = crypto.randomBytes(32).toString("hex");

/**
 * Timing-safe comparison of a presented value against this boot's token.
 * @param {string} candidate
 */
function tokenMatches(candidate) {
  const text = String(candidate || "");
  if (!/^[a-f0-9]{64}$/.test(text)) return false;
  return crypto.timingSafeEqual(Buffer.from(text), Buffer.from(token));
}

module.exports = { AGENT_TOKEN_HEADER, agentToken: token, tokenMatches };
