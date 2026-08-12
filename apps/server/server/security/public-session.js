"use strict";

const crypto = require("node:crypto");

const { sendJson, readJsonBody, withTimeoutSignal } = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");

const SESSION_COOKIE = "ai_system6_public_session";
const SESSION_TTL_SECONDS = 4 * 60 * 60;
// Rendered as data-action on the widget and echoed back by siteverify. Keep
// the client, the capabilities payload, and the verification check in step:
// changing this on one side alone rejects every token.
const TURNSTILE_ACTION = "turnstile-spin-v2";
const PUBLIC_ORIGIN = String(
  process.env.AI_SYSTEM6_PUBLIC_ORIGIN || "https://system6.aaronlau.me"
).replace(/\/$/, "");
const PUBLIC_HOST = new URL(PUBLIC_ORIGIN).host;

const unprotectedPaths = new Set([
  "/healthz",
  "/readyz",
  "/api/version",
  "/api/capabilities",
  "/api/cloud/models",
  "/api/session/turnstile",
  "/api/session/status",
]);

/** @type {Map<string, { startedAt: number, count: number }>} */
const generalWindows = new Map();
/** @type {Map<string, { startedAt: number, count: number }>} */
const turnstileWindows = new Map();
/** @type {Map<string, number>} */
const activeBySession = new Map();
const activeByGroup = new Map([
  ["cloud", 0],
  ["reader", 0],
]);
let requestCounter = 0;

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signingSecret() {
  return String(process.env.AI_SYSTEM6_SESSION_SECRET || "");
}

function sign(value) {
  return crypto.createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index < 1) return;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  });
  return out;
}

function sessionFromRequest(req) {
  const secret = signingSecret();
  if (!secret) return null;
  const token = parseCookies(req)[SESSION_COOKIE] || "";
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = sign(encoded);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (
      payload?.v !== 1
      || typeof payload.nonce !== "string"
      || payload.nonce.length < 16
      || !Number.isFinite(payload.exp)
      || payload.exp <= now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function issueSessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const encoded = base64urlJson({
    v: 1,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(18).toString("base64url"),
  });
  return [
    `${SESSION_COOKIE}=${encoded}.${sign(encoded)}`,
    "Path=/api",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

function clientIp(req) {
  return String(
    req.headers["cf-connecting-ip"]
    || req.headers["x-real-ip"]
    || req.socket.remoteAddress
    || "unknown"
  ).trim();
}

function consumeFixedWindow(map, key, limit, durationMs) {
  const now = Date.now();
  const current = map.get(key);
  if (!current || now - current.startedAt >= durationMs) {
    map.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function pruneWindows() {
  requestCounter += 1;
  if (requestCounter % 100 !== 0) return;
  const now = Date.now();
  for (const [key, value] of generalWindows) {
    if (now - value.startedAt > 15 * 60 * 1000) generalWindows.delete(key);
  }
  for (const [key, value] of turnstileWindows) {
    if (now - value.startedAt > 15 * 60 * 1000) turnstileWindows.delete(key);
  }
}

function requestPath(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || PUBLIC_HOST}`).pathname;
  } catch {
    return "/";
  }
}

function requestGroup(pathname) {
  if (pathname.startsWith("/api/cloud/")) return "cloud";
  if (
    pathname.startsWith("/api/reader")
    || pathname.startsWith("/api/search")
    || pathname.startsWith("/api/endfield/search")
  ) {
    return "reader";
  }
  return "";
}

function validateRequestOrigin(req) {
  const host = String(req.headers.host || "").toLowerCase();
  if (host !== PUBLIC_HOST.toLowerCase()) return false;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "GET")) return true;
  return String(req.headers.origin || "").replace(/\/$/, "") === PUBLIC_ORIGIN;
}

async function validateTurnstileToken(token, req) {
  const secret = String(process.env.TURNSTILE_SECRET || "");
  if (!secret) throw new Error("Turnstile is not configured.");
  const timeout = withTimeoutSignal(null, 10000);
  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: clientIp(req),
      idempotency_key: crypto.randomUUID(),
    });
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        signal: timeout.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
    const result = /** @type {any} */ (await response.json());
    // Canonical gate: nothing passes without an explicit success === true.
    if (!response.ok || result?.success !== true) return false;
    // Defence in depth: the token must also have been solved on this host and
    // carry the action our widget renders with.
    return result.hostname === PUBLIC_HOST.split(":")[0]
      && result.action === TURNSTILE_ACTION;
  } finally {
    timeout.cleanup();
  }
}

async function handleTurnstileSession(req, res) {
  if (!isPublicDeployment) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  if (!validateRequestOrigin(req)) {
    sendJson(res, 403, { error: "Invalid request origin", code: "invalid_origin" });
    return;
  }
  if (!consumeFixedWindow(turnstileWindows, clientIp(req), 10, 10 * 60 * 1000)) {
    sendJson(res, 429, { error: "Too many verification attempts", code: "rate_limited" }, {
      "Retry-After": "60",
    });
    return;
  }
  const body = await readJsonBody(req, { limitBytes: 4096 });
  const token = String(body.token || "");
  let valid = false;
  try {
    valid = !!token && token.length <= 2048 && await validateTurnstileToken(token, req);
  } catch (error) {
    console.error("Turnstile validation failed:", /** @type {Error} */ (error).message);
  }
  if (!valid) {
    sendJson(res, 403, { error: "Verification failed", code: "turnstile_failed" });
    return;
  }
  sendJson(res, 200, { verified: true, expires_in: SESSION_TTL_SECONDS }, {
    "Set-Cookie": issueSessionCookie(),
    "Cache-Control": "no-store",
  });
}

/**
 * Guard one public request and hold its concurrency slot until `handler`
 * completes. Local deployment calls the handler directly.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {() => void | Promise<void>} handler
 */
async function runWithPublicGuard(req, res, handler) {
  if (!isPublicDeployment) return handler();
  const pathname = requestPath(req);
  if (unprotectedPaths.has(pathname)) return handler();
  if (!pathname.startsWith("/api/")) return handler();
  if (!validateRequestOrigin(req)) {
    sendJson(res, 403, { error: "Invalid request origin", code: "invalid_origin" });
    return;
  }

  const session = sessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, {
      error: "Verification required",
      code: "verification_required",
    });
    return;
  }

  pruneWindows();
  if (!consumeFixedWindow(generalWindows, session.nonce, 120, 60 * 1000)) {
    sendJson(res, 429, { error: "Request rate limit exceeded", code: "rate_limited" }, {
      "Retry-After": "5",
    });
    return;
  }

  const group = requestGroup(pathname);
  const globalLimit = group === "cloud" ? 8 : group === "reader" ? 4 : Infinity;
  const sessionLimit = group ? (group === "cloud" ? 2 : 1) : Infinity;
  const sessionKey = `${session.nonce}:${group}`;
  if (
    group
    && (
      (activeByGroup.get(group) || 0) >= globalLimit
      || (activeBySession.get(sessionKey) || 0) >= sessionLimit
    )
  ) {
    sendJson(res, 429, { error: "Server is at its concurrency limit", code: "busy" }, {
      "Retry-After": "5",
    });
    return;
  }

  if (group) {
    activeByGroup.set(group, (activeByGroup.get(group) || 0) + 1);
    activeBySession.set(sessionKey, (activeBySession.get(sessionKey) || 0) + 1);
  }
  try {
    await handler();
  } finally {
    if (group) {
      activeByGroup.set(group, Math.max(0, (activeByGroup.get(group) || 1) - 1));
      const next = Math.max(0, (activeBySession.get(sessionKey) || 1) - 1);
      if (next) activeBySession.set(sessionKey, next);
      else activeBySession.delete(sessionKey);
    }
  }
}

function publicReadiness() {
  if (!isPublicDeployment) return { ready: true, missing: [] };
  const missing = [];
  if (Buffer.byteLength(signingSecret(), "utf8") < 32) {
    missing.push("AI_SYSTEM6_SESSION_SECRET (minimum 32 bytes)");
  }
  if (!process.env.TURNSTILE_SECRET) missing.push("TURNSTILE_SECRET");
  if (!process.env.TURNSTILE_SITE_KEY) missing.push("TURNSTILE_SITE_KEY");
  return { ready: missing.length === 0, missing };
}

module.exports = {
  PUBLIC_ORIGIN,
  PUBLIC_HOST,
  SESSION_TTL_SECONDS,
  TURNSTILE_ACTION,
  handleTurnstileSession,
  runWithPublicGuard,
  publicReadiness,
  sessionFromRequest,
};
