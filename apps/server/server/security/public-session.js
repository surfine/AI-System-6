"use strict";

const crypto = require("node:crypto");
const net = require("node:net");

const { sendJson, readJsonBody, withTimeoutSignal } = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");

const SESSION_COOKIE = "ai_system6_public_session";
const SESSION_TTL_SECONDS = 4 * 60 * 60;
const MAC_SHARED_TOKEN_TTL_SECONDS = 30 * 60;
// Rendered as data-action on the widget and echoed back by siteverify. Keep
// the client, the capabilities payload, and the verification check in step:
// changing this on one side alone rejects every token.
const TURNSTILE_ACTION = "turnstile-spin-v2";
const MIN_SESSION_SECRET_BYTES = 32;
const PUBLIC_ORIGIN = String(
  process.env.AI_SYSTEM6_PUBLIC_ORIGIN || "https://system6.aaronlau.me"
).replace(/\/$/, "");
const PUBLIC_HOST = new URL(PUBLIC_ORIGIN).host;
const TRUST_PROXY_MODE = String(process.env.AI_SYSTEM6_TRUST_PROXY || "").trim().toLowerCase();
if (TRUST_PROXY_MODE && !new Set(["cloudflare", "nginx"]).has(TRUST_PROXY_MODE)) {
  throw new Error("AI_SYSTEM6_TRUST_PROXY must be either cloudflare or nginx.");
}

const unprotectedPaths = new Set([
  "/healthz",
  "/readyz",
  "/api/version",
  "/api/capabilities",
  "/api/cloud/models",
  "/api/session/turnstile",
  "/api/session/status",
]);
const selfAuthenticatedPaths = new Set([
  "/api/session/mac-token",
]);

class TtlLruWindows {
  constructor(maxEntries, ttlMs) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  prune(now = Date.now()) {
    for (const [key, value] of this.entries) {
      if (now - value.lastUsedAt >= this.ttlMs) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  consume(key, limit, durationMs, now = Date.now()) {
    this.prune(now);
    const current = this.entries.get(key);
    if (!current || now - current.startedAt >= durationMs) {
      this.entries.delete(key);
      this.entries.set(key, { startedAt: now, lastUsedAt: now, count: 1 });
      this.prune(now);
      return true;
    }
    this.entries.delete(key);
    current.lastUsedAt = now;
    this.entries.set(key, current);
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  get size() {
    return this.entries.size;
  }
}

const generalWindows = new TtlLruWindows(5000, 15 * 60 * 1000);
const turnstileWindows = new TtlLruWindows(5000, 15 * 60 * 1000);
/** @type {Map<string, number>} */
const activeBySession = new Map();
const activeByGroup = new Map([
  ["cloud", 0],
  ["cloud-files", 0],
  ["reader", 0],
  ["cmf", 0],
]);
const macSharedPaths = new Set([
  "/api/cloud/chat",
  "/api/cloud/quota",
  "/api/cloud/status",
]);

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signingSecret() {
  return String(process.env.AI_SYSTEM6_SESSION_SECRET || "");
}

function sessionSecretConfigured() {
  return Buffer.byteLength(signingSecret(), "utf8") >= MIN_SESSION_SECRET_BYTES;
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
  if (!sessionSecretConfigured()) return null;
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

function bearerToken(req) {
  const authorization = String(req.headers.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || "";
}

function macSharedSessionFromRequest(req) {
  if (!sessionSecretConfigured()) return null;
  const token = bearerToken(req);
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "m1") return null;
  const encoded = parts[1];
  const suppliedSignature = parts[2];
  const expectedSignature = sign(`mac-shared.${encoded}`);
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
      || payload.scope !== "mac-shared"
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

function sharedSessionFromRequest(req) {
  return sessionFromRequest(req) || macSharedSessionFromRequest(req);
}

function issueMacSharedToken(session) {
  if (!sessionSecretConfigured() || !session?.nonce) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    scope: "mac-shared",
    iat: now,
    exp: now + MAC_SHARED_TOKEN_TTL_SECONDS,
    nonce: String(session.nonce),
  };
  const encoded = base64urlJson(payload);
  return {
    token: `m1.${encoded}.${sign(`mac-shared.${encoded}`)}`,
    expiresIn: MAC_SHARED_TOKEN_TTL_SECONDS,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

function issueSessionCookie() {
  if (!sessionSecretConfigured()) return "";
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

function normalizeClientIp(value) {
  let candidate = String(Array.isArray(value) ? value[0] : value || "").trim();
  if (!candidate || candidate.includes(",")) return "";
  if (candidate.startsWith("[") && candidate.endsWith("]")) candidate = candidate.slice(1, -1);
  const zoneIndex = candidate.indexOf("%");
  if (zoneIndex > 0) candidate = candidate.slice(0, zoneIndex);
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mapped = candidate.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) return mapped;
  }
  return net.isIP(candidate) ? candidate.toLowerCase() : "";
}

function clientIp(req) {
  const remote = normalizeClientIp(req.socket?.remoteAddress) || "unknown";
  if (TRUST_PROXY_MODE === "cloudflare") {
    return normalizeClientIp(req.headers["cf-connecting-ip"]) || remote;
  }
  if (TRUST_PROXY_MODE === "nginx") {
    return normalizeClientIp(req.headers["x-real-ip"]) || remote;
  }
  return remote;
}

function consumeFixedWindow(container, key, limit, durationMs) {
  return container.consume(key, limit, durationMs);
}

function requestPath(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || PUBLIC_HOST}`).pathname;
  } catch {
    return "/";
  }
}

function requestGroup(pathname) {
  if (pathname.startsWith("/api/cmf/")) return "cmf";
  if (pathname === "/api/cloud/files") return "cloud-files";
  if (pathname.startsWith("/api/cloud/")) return "cloud";
  if (pathname === "/api/vision/analyze") return "cloud";
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

async function validateTurnstileToken(token, req, allowedHostnames = [PUBLIC_HOST.split(":")[0]]) {
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
    const hostname = String(result.hostname || "").trim().toLowerCase();
    const allowed = new Set(allowedHostnames.map((value) => String(value || "").trim().toLowerCase()));
    return allowed.has(hostname)
      && result.action === TURNSTILE_ACTION;
  } finally {
    timeout.cleanup();
  }
}

async function verifyTurnstileAttempt(token, req, allowedHostnames) {
  if (!process.env.TURNSTILE_SECRET) {
    return {
      ok: false,
      status: 503,
      code: "turnstile_not_configured",
      error: "Turnstile is not configured.",
      retryAfter: 0,
    };
  }
  if (!consumeFixedWindow(turnstileWindows, clientIp(req), 10, 10 * 60 * 1000)) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      error: "Too many verification attempts",
      retryAfter: 60,
    };
  }
  let valid = false;
  try {
    valid = !!token
      && token.length <= 2048
      && await validateTurnstileToken(token, req, allowedHostnames);
  } catch (error) {
    console.error("Turnstile validation failed:", /** @type {Error} */ (error).message);
  }
  return valid
    ? { ok: true, status: 200, code: "", error: "", retryAfter: 0 }
    : { ok: false, status: 403, code: "turnstile_failed", error: "Verification failed", retryAfter: 0 };
}

function macTurnstileHostnames() {
  return [PUBLIC_HOST.split(":")[0], "localhost", "127.0.0.1"];
}

function anonymousSessionIdentity() {
  return { nonce: crypto.randomBytes(18).toString("base64url") };
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
  const body = await readJsonBody(req, { limitBytes: 4096 });
  const token = String(body.token || "");
  const verification = await verifyTurnstileAttempt(token, req, [PUBLIC_HOST.split(":")[0]]);
  if (!verification.ok) {
    sendJson(res, verification.status, {
      error: verification.error,
      code: verification.code,
    }, verification.retryAfter ? { "Retry-After": String(verification.retryAfter) } : {});
    return;
  }
  const sessionCookie = issueSessionCookie();
  if (!sessionCookie) {
    sendJson(res, 503, { error: "Session signing is not configured.", code: "session_not_configured" });
    return;
  }
  sendJson(res, 200, { verified: true, expires_in: SESSION_TTL_SECONDS }, {
    "Set-Cookie": sessionCookie,
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
  if (selfAuthenticatedPaths.has(pathname)) return handler();

  const session = sessionFromRequest(req)
    || (macSharedPaths.has(pathname) ? macSharedSessionFromRequest(req) : null);
  if (!session) {
    sendJson(res, 401, {
      error: "Verification required",
      code: "verification_required",
    });
    return;
  }

  if (!consumeFixedWindow(generalWindows, session.nonce, 120, 60 * 1000)) {
    sendJson(res, 429, { error: "Request rate limit exceeded", code: "rate_limited" }, {
      "Retry-After": "5",
    });
    return;
  }

  const group = requestGroup(pathname);
  const globalLimit = group === "cmf" ? 1
    : group === "cloud-files" ? 4
      : group === "cloud" ? 8
        : group === "reader" ? 4
          : Infinity;
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
  if (!sessionSecretConfigured()) {
    missing.push(`AI_SYSTEM6_SESSION_SECRET (minimum ${MIN_SESSION_SECRET_BYTES} bytes)`);
  }
  if (!process.env.TURNSTILE_SECRET) missing.push("TURNSTILE_SECRET");
  if (!process.env.TURNSTILE_SITE_KEY) missing.push("TURNSTILE_SITE_KEY");
  return { ready: missing.length === 0, missing };
}

module.exports = {
  PUBLIC_ORIGIN,
  PUBLIC_HOST,
  SESSION_TTL_SECONDS,
  MAC_SHARED_TOKEN_TTL_SECONDS,
  TURNSTILE_ACTION,
  handleTurnstileSession,
  runWithPublicGuard,
  publicReadiness,
  sessionFromRequest,
  sharedSessionFromRequest,
  macSharedSessionFromRequest,
  issueMacSharedToken,
  issueSessionCookie,
  verifyTurnstileAttempt,
  macTurnstileHostnames,
  anonymousSessionIdentity,
  clientIp,
  normalizeClientIp,
  TtlLruWindows,
  rateLimitStateForTests: () => ({
    general: generalWindows.size,
    turnstile: turnstileWindows.size,
  }),
};
