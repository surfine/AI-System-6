"use strict";

const net = require("node:net");

const { sendJson } = require("../lib/http.js");

const modifyingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const loopbackHostnames = new Set(["127.0.0.1", "::1", "localhost"]);
const defaultBrowserBridgeOrigins = Object.freeze([
  "https://system6.aaronlau.me",
  "http://local.system6.aaronlau.me",
]);

function normalizedHostname(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
}

function hostHeaderParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return { hostname: "", port: "" };
  try {
    const url = new URL(`http://${raw}`);
    return {
      hostname: normalizedHostname(url.hostname),
      port: url.port,
    };
  } catch {
    return { hostname: "", port: "" };
  }
}

function isLoopbackHostname(value) {
  const hostname = normalizedHostname(value);
  if (loopbackHostnames.has(hostname)) return true;
  if (hostname.startsWith("::ffff:")) {
    return isLoopbackHostname(hostname.slice("::ffff:".length));
  }
  if (net.isIP(hostname) === 4) {
    return hostname.split(".")[0] === "127";
  }
  return false;
}

function requestPath(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function configuredLocalRequestPolicy(port) {
  const allowLan = process.env.AI_SYSTEM6_ALLOW_LAN === "1";
  const configuredHost = normalizedHostname(process.env.AI_SYSTEM6_HOST || "");
  const host = allowLan
    ? configuredHost || "0.0.0.0"
    : "127.0.0.1";
  const authToken = String(process.env.AI_SYSTEM6_AUTH_TOKEN || "");
  const browserBridgeOrigins = new Set([
    ...defaultBrowserBridgeOrigins,
    ...String(process.env.AI_SYSTEM6_BROWSER_BRIDGE_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);

  if (!allowLan && configuredHost && !isLoopbackHostname(configuredHost)) {
    throw new Error(
      "AI_SYSTEM6_HOST may leave loopback only when AI_SYSTEM6_ALLOW_LAN=1."
    );
  }
  if (allowLan && Buffer.byteLength(authToken, "utf8") < 24) {
    throw new Error(
      "LAN mode requires AI_SYSTEM6_AUTH_TOKEN with at least 24 bytes."
    );
  }

  const allowedHostnames = new Set(["127.0.0.1", "::1", "localhost"]);
  if (allowLan && configuredHost && !["0.0.0.0", "::"].includes(configuredHost)) {
    allowedHostnames.add(configuredHost);
  }

  return Object.freeze({
    allowLan,
    allowedHostnames,
    authToken,
    browserBridgeOrigins,
    host,
    port: String(port),
  });
}

function trustedBrowserBridgeOrigin(req, policy) {
  if (requestPath(req) !== "/api/music/system") return "";
  const host = hostHeaderParts(req.headers.host);
  if (!isLoopbackHostname(host.hostname) || (host.port && host.port !== policy.port)) return "";
  const origin = String(req.headers.origin || "").trim();
  return policy.browserBridgeOrigins.has(origin) ? origin : "";
}

function applyBrowserBridgeCors(req, res, policy) {
  const origin = trustedBrowserBridgeOrigin(req, policy);
  if (!origin) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Vary", "Origin, Access-Control-Request-Private-Network");
  return true;
}

function handleBrowserBridgePreflight(req, res, policy) {
  if (String(req.method || "").toUpperCase() !== "OPTIONS") return false;
  if (!applyBrowserBridgeCors(req, res, policy)) return false;
  res.writeHead(204);
  res.end();
  return true;
}

function requestOriginIsTrusted(req, policy) {
  const method = String(req.method || "GET").toUpperCase();
  const host = hostHeaderParts(req.headers.host);
  const tokenMatches =
    policy.allowLan
    && String(req.headers["x-ai-system-6-token"] || "") === policy.authToken;
  if (
    !host.hostname
    || (!policy.allowedHostnames.has(host.hostname) && !tokenMatches)
  ) {
    return false;
  }
  if (host.port && host.port !== policy.port) return false;

  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  const fetchDest = String(req.headers["sec-fetch-dest"] || "").toLowerCase();
  // #time-machine-frame loads archived pages via sandbox="allow-scripts"
  // (no allow-same-origin) so its content stays isolated from the app's
  // real origin. That opaqueness makes the browser report the frame's own
  // *navigation* to our same-server render route as Sec-Fetch-Site:
  // cross-site — indistinguishable, by that header alone, from a foreign
  // site embedding us. Sec-Fetch-Dest: iframe narrows the exception to
  // exactly that navigation, not to script-initiated fetch/XHR calls
  // against this or any other /api/* route.
  const isSandboxedRenderFrame =
    fetchSite === "cross-site"
    && fetchDest === "iframe"
    && requestPath(req) === "/api/time-machine/render";
  if (fetchSite === "cross-site" && !isSandboxedRenderFrame) return false;

  const origin = String(req.headers.origin || "").trim();
  // A request from a sandboxed iframe without allow-same-origin (the Time
  // Machine content frame) carries the literal header value "null", not an
  // absent header — new URL("null") throws, so without this check every
  // such request fell through to the catch below and was rejected as
  // untrusted. Treat it the same as no Origin header at all.
  if (!origin || origin === "null") {
    return isLoopbackHostname(req.socket?.remoteAddress || "")
      || (policy.allowLan && !!policy.authToken);
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsedOrigin.protocol)) return false;
  if (normalizedHostname(parsedOrigin.hostname) !== host.hostname) return false;
  const originPort = parsedOrigin.port
    || (parsedOrigin.protocol === "https:" ? "443" : "80");
  const requestPort = host.port || (parsedOrigin.protocol === "https:" ? "443" : "80");
  if (originPort !== requestPort) return false;

  return true;
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(self), payment=(), usb=()"
  );
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Chrome ignores IPv6 literals in CSP host sources (the entry is parsed
      // as invalid and dropped), so http://[::1]:* only produced console noise
      // and never actually allowed anything. localhost covers the local model
      // endpoint for both address families.
      "connect-src 'self' http://127.0.0.1:* http://localhost:*",
      "worker-src 'self' blob:",
      // 'self' is for #time-machine-frame, which embeds our own
      // /api/time-machine/render endpoint (see routes/time-machine.js).
      "frame-src 'self' https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
}

async function runWithLocalRequestGuard(req, res, policy, handler) {
  const pathname = requestPath(req);
  if (!pathname.startsWith("/api/")) return handler();
  const trustedBrowserBridge = applyBrowserBridgeCors(req, res, policy);
  if (!requestOriginIsTrusted(req, policy) && !trustedBrowserBridge) {
    sendJson(res, 403, {
      error: "Untrusted local request",
      code: "untrusted_local_request",
    });
    return;
  }

  if (policy.allowLan && String(req.headers["x-ai-system-6-token"] || "") !== policy.authToken) {
    sendJson(res, 401, {
      error: "Invalid LAN access token",
      code: "invalid_lan_token",
    });
    return;
  }

  if (
    modifyingMethods.has(String(req.method || "GET").toUpperCase())
    && !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")
  ) {
    sendJson(res, 415, {
      error: "Expected application/json",
      code: "unsupported_media_type",
    });
    return;
  }

  return handler();
}

module.exports = {
  applySecurityHeaders,
  configuredLocalRequestPolicy,
  handleBrowserBridgePreflight,
  hostHeaderParts,
  isLoopbackHostname,
  requestOriginIsTrusted,
  runWithLocalRequestGuard,
};
