"use strict";

const { Readable } = require("node:stream");

const MAX_TOKEN_BYTES = 4096;
const MAX_SESSION_TTL_SECONDS = 30 * 60;
let relaySession = null;

function publicOrigin() {
  const candidate = new URL(String(
    process.env.AI_SYSTEM6_PUBLIC_ORIGIN || "https://system6.aaronlau.me"
  ));
  if (
    candidate.protocol !== "https:"
    || candidate.username
    || candidate.password
    || candidate.pathname !== "/"
    || candidate.search
    || candidate.hash
  ) {
    const error = /** @type {Error & { code?: string }} */ (
      new Error("The Website AI origin is invalid.")
    );
    error.code = "mac_shared_origin_invalid";
    throw error;
  }
  return candidate.origin;
}

function normalizedToken(value) {
  const token = String(value || "").trim();
  if (
    !token.startsWith("m1.")
    || token.split(".").length !== 3
    || Buffer.byteLength(token, "utf8") > MAX_TOKEN_BYTES
  ) {
    const error = /** @type {Error & { code?: string }} */ (
      new Error("The Mac shared session token is invalid.")
    );
    error.code = "mac_shared_token_invalid";
    throw error;
  }
  return token;
}

function currentMacSharedSession(now = Date.now()) {
  if (!relaySession || relaySession.expiresAt <= now) {
    relaySession = null;
    return null;
  }
  return { expiresAt: relaySession.expiresAt };
}

function relayHeaders(token, method) {
  return {
    "Accept": "application/json, text/event-stream",
    "Authorization": `Bearer ${token}`,
    ...(method === "POST" ? {
      "Content-Type": "application/json",
      "Origin": publicOrigin(),
    } : {}),
  };
}

async function responseError(response, fallback) {
  const data = /** @type {any} */ (await response.json().catch(() => ({})));
  const error = /** @type {Error & { code?: string, statusCode?: number }} */ (
    new Error(String(data.error || fallback))
  );
  error.code = String(data.code || "mac_shared_session_rejected");
  error.statusCode = response.status;
  return error;
}

async function fetchMacSharedCapabilities(signal) {
  const origin = publicOrigin();
  const response = await fetch(`${origin}/api/capabilities`, {
    method: "GET",
    headers: { "Accept": "application/json" },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response, "Website AI capabilities are unavailable.");
  const data = /** @type {any} */ (await response.json().catch(() => ({})));
  const pairing = data?.public_access?.mac_shared_session || {};
  const tokenEndpoint = String(pairing.token_endpoint || "");
  const sitekey = String(data?.public_access?.turnstile_site_key || "");
  const action = String(data?.public_access?.turnstile_action || "");
  const available = pairing.available === true
    && tokenEndpoint === "/api/session/mac-token"
    && !!sitekey
    && !!action;
  return {
    available,
    publicOrigin: origin,
    sitekey: available ? sitekey : "",
    action: available ? action : "",
    tokenEndpoint: available ? tokenEndpoint : "",
  };
}

async function exchangeMacTurnstileToken(turnstileToken, signal) {
  const token = String(turnstileToken || "").trim();
  if (!token || token.length > 2048) {
    const error = /** @type {Error & { code?: string, statusCode?: number }} */ (
      new Error("The Turnstile token is invalid.")
    );
    error.code = "turnstile_failed";
    error.statusCode = 403;
    throw error;
  }
  const origin = publicOrigin();
  const response = await fetch(`${origin}/api/session/mac-token`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Origin": origin,
    },
    body: JSON.stringify({ turnstile_token: token }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response, "Website AI verification failed.");
  const data = /** @type {any} */ (await response.json().catch(() => ({})));
  if (
    data.scope !== "mac-shared"
    || data.token_type !== "Bearer"
    || data.public_origin !== origin
  ) {
    const error = /** @type {Error & { code?: string, statusCode?: number }} */ (
      new Error("Website AI returned an invalid Mac shared session.")
    );
    error.code = "mac_shared_session_invalid";
    error.statusCode = 502;
    throw error;
  }
  return {
    accessToken: String(data.access_token || ""),
    expiresIn: Number(data.expires_in) || MAX_SESSION_TTL_SECONDS,
  };
}

async function stageMacSharedSession({ accessToken, expiresIn }, signal) {
  const token = normalizedToken(accessToken);
  const origin = publicOrigin();
  const response = await fetch(`${origin}/api/cloud/quota`, {
    method: "GET",
    headers: relayHeaders(token, "GET"),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw await responseError(response, "The Website AI session could not be verified.");
  }
  const ttlSeconds = Math.min(
    MAX_SESSION_TTL_SECONDS,
    Math.max(1, Math.floor(Number(expiresIn) || MAX_SESSION_TTL_SECONDS))
  );
  relaySession = {
    token,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  return { expiresAt: relaySession.expiresAt };
}

function clearMacSharedSession() {
  relaySession = null;
}

function relayToken() {
  if (!currentMacSharedSession()) {
    const error = /** @type {Error & { code?: string, statusCode?: number }} */ (
      new Error("A Website AI session is required.")
    );
    error.code = "mac_shared_session_required";
    error.statusCode = 401;
    throw error;
  }
  return relaySession.token;
}

async function fetchMacShared(pathname, options = {}) {
  const token = relayToken();
  const method = options.method === "POST" ? "POST" : "GET";
  return fetch(`${publicOrigin()}${pathname}`, {
    method,
    headers: relayHeaders(token, method),
    ...(method === "POST" ? { body: JSON.stringify(options.body || {}) } : {}),
    signal: options.signal,
    cache: "no-store",
  });
}

async function pipeMacSharedResponse(upstream, res) {
  const headers = {
    "Content-Type": upstream.headers.get("content-type") || "application/json",
    "Cache-Control": "no-store",
  };
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) headers["Retry-After"] = retryAfter;
  res.writeHead(upstream.status, headers);
  if (!upstream.body) {
    res.end();
    return;
  }
  try {
    for await (const chunk of Readable.fromWeb(upstream.body)) {
      if (res.destroyed || res.writableEnded) break;
      res.write(chunk);
    }
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

module.exports = {
  clearMacSharedSession,
  currentMacSharedSession,
  exchangeMacTurnstileToken,
  fetchMacSharedCapabilities,
  fetchMacShared,
  pipeMacSharedResponse,
  publicOrigin,
  stageMacSharedSession,
};
