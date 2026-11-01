// Short-lived signatures for downloaded audio played across origins.
//
// A public page (VPS or Pages) plays audio from this Mac with a plain
// <audio src="http://127.0.0.1:4173/…">. Media requests carry no Origin
// header, so the origin allowlist cannot vouch for them, and the path itself
// is guessable (cache keys are public Apple Music ids). A signature bound to
// the exact path and an expiry is what lets such a request through; without
// one, cross-site requests stay refused. The key lives only in memory and is
// new on every start.

"use strict";

const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");

const SIGNATURE_TTL_SECONDS = 12 * 60 * 60;
const key = randomBytes(32);

function digest(pathname, expires) {
  return createHmac("sha256", key).update(`${pathname}\n${expires}`).digest("base64url");
}

/**
 * Sign one decoded-or-encoded request path (use exactly what the browser will
 * request, before the query string).
 *
 * @param {string} pathname
 * @param {number} [nowMs]
 * @returns {string} The query string, without "?".
 */
function signMediaPath(pathname, nowMs = Date.now()) {
  const expires = Math.floor(nowMs / 1000) + SIGNATURE_TTL_SECONDS;
  // Sign the path in the form the verifier will see after URL parsing.
  const normalized = new URL(String(pathname || "/"), "http://127.0.0.1").pathname;
  return `exp=${expires}&sig=${digest(normalized, expires)}`;
}

/**
 * @param {string} rawUrl A request URL such as req.url.
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function verifySignedMediaUrl(rawUrl, nowMs = Date.now()) {
  let url;
  try {
    url = new URL(String(rawUrl || ""), "http://127.0.0.1");
  } catch {
    return false;
  }
  const expires = Number(url.searchParams.get("exp"));
  const signature = String(url.searchParams.get("sig") || "");
  if (!Number.isInteger(expires) || !signature) return false;
  if (expires * 1000 < nowMs) return false;
  if (expires * 1000 > nowMs + (SIGNATURE_TTL_SECONDS + 60) * 1000) return false;
  const expected = Buffer.from(digest(url.pathname, expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

module.exports = {
  SIGNATURE_TTL_SECONDS,
  signMediaPath,
  verifySignedMediaUrl,
};
