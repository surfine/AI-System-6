// HTTP fetch primitives and high-level fetch-with-fallback helpers.
//
// Behavior parity with root server.js:
// - nodePostJson / nodeGetText use shared keep-alive Agents and
//   propagate AbortSignal by calling request.destroy on abort.
// - proxyJsonStream pipes the upstream response into the caller's
//   res, defaulting content-type to text/event-stream and writing the
//   no-cache / keep-alive headers in the same order.
// - nodeGetText follows up to 5 redirects; redirect handling can be
//   disabled with options.followRedirects = false.
// - nodeGetTextViaProxy uses the cached HttpsProxyAgent and applies
//   the same redirect rules.
// - postJsonWithFallback short-circuits to nodePostJson for loopback
//   targets, otherwise tries global fetch and falls back to
//   nodePostJson on any error.
// - getTextWithFallback / getTextOnceWithFallback try the configured
//   proxy first, fall back to nodeGetText for pkg-loopback targets,
//   then try global fetch with a final nodeGetText fallback. Aborted
//   signals propagate without retry.

"use strict";

const http = require("node:http");
const https = require("node:https");

const {
  isLoopbackUrl,
  shouldAvoidNodeFetchForTarget,
  proxyUrlForTarget,
  httpProxyAgentFor,
} = require("./proxy.js");

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

/**
 * @typedef {Object} FetchLikeResponse
 * @property {boolean} ok
 * @property {number} status
 * @property {{ get: (name: string) => string } | Record<string, string | string[] | undefined>} headers
 * @property {string} [text]
 */

/**
 * Read a header value from either a fetch-style Headers-like object
 * (with `.get`) or a Node IncomingHttpHeaders dictionary. Mirrors the
 * root `headerValue`.
 *
 * @param {any} headers
 * @param {string} name
 * @returns {string}
 */
function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[String(name).toLowerCase()] || headers[name] || "";
}

/**
 * Direct POST via the node http/https client. Resolves to a
 * fetch-like response with a `.headers.get(name)` accessor and an
 * async `.text()`. Mirrors `nodePostJson`.
 *
 * @param {string} targetUrl
 * @param {unknown} payload
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Promise<{
 *   ok: boolean,
 *   status: number,
 *   headers: { get: (name: string) => string },
 *   text: () => Promise<string>,
 * }>}
 */
function nodePostJson(targetUrl, payload, signal, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const body = JSON.stringify(payload);
    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;
    const request = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        agent: isHttps ? httpsAgent : httpAgent,
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode || 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: {
              get(name) {
                return /** @type {any} */ (response.headers)[String(name).toLowerCase()] || "";
              },
            },
            async text() {
              return text;
            },
          });
        });
      }
    );

    request.on("error", reject);
    signal?.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    request.end(body);
  });
}

/**
 * POST to `targetUrl` and pipe the upstream response into `res`.
 * Used for streaming chat / SSE proxies. Mirrors `proxyJsonStream`.
 *
 * @param {string} targetUrl
 * @param {unknown} payload
 * @param {AbortSignal | null | undefined} signal
 * @param {import("node:http").ServerResponse} res
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Promise<true>}
 */
function proxyJsonStream(targetUrl, payload, signal, res, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const body = JSON.stringify(payload);
    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;
    const request = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        agent: isHttps ? httpsAgent : httpAgent,
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (upstream) => {
        const contentType = upstream.headers["content-type"] || "text/event-stream";
        res.writeHead(upstream.statusCode || 200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        upstream.pipe(res);
        upstream.on("end", () => resolve(true));
        upstream.on("error", reject);
      }
    );

    request.on("error", reject);
    signal?.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    request.end(body);
  });
}

/**
 * Direct GET via the node http/https client. Follows up to 5
 * redirects unless `options.followRedirects === false`.
 * Mirrors `nodeGetText`.
 *
 * @param {string} targetUrl
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [headers]
 * @param {number} [redirectCount]
 * @param {{ followRedirects?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, status: number, headers: import("node:http").IncomingHttpHeaders, text: string }>}
 */
function nodeGetText(targetUrl, signal, headers = { "Accept": "application/json" }, redirectCount = 0, options = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;
    const request = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        agent: isHttps ? httpsAgent : httpAgent,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const location = response.headers.location;
          const status = response.statusCode || 0;
          if (
            options.followRedirects !== false &&
            [301, 302, 303, 307, 308].includes(status) &&
            location &&
            redirectCount < 5
          ) {
            resolve(nodeGetText(new URL(location, targetUrl).href, signal, headers, redirectCount + 1, options));
            return;
          }
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: response.headers,
            text,
          });
        });
      }
    );

    request.on("error", reject);
    signal?.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    request.end();
  });
}

/**
 * GET via the system HTTP proxy. Rejects if no proxy is configured.
 * Uses the cached HttpsProxyAgent. Mirrors `nodeGetTextViaProxy`.
 *
 * @param {string} targetUrl
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [headers]
 * @param {number} [redirectCount]
 * @param {{ followRedirects?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, status: number, headers: import("node:http").IncomingHttpHeaders, text: string }>}
 */
function nodeGetTextViaProxy(targetUrl, signal, headers = { "Accept": "application/json" }, redirectCount = 0, options = {}) {
  if (signal?.aborted) return Promise.reject(new Error("Request aborted"));
  const proxy = proxyUrlForTarget(targetUrl);
  if (!proxy) return Promise.reject(new Error("No HTTP proxy configured."));
  const target = new URL(targetUrl);

  return new Promise((resolve, reject) => {
    const client = target.protocol === "https:" ? https : http;
    const request = client.request(
      /** @type {import("node:http").RequestOptions} */ ({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers,
        agent: /** @type {any} */ (httpProxyAgentFor(proxy)),
      }),
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const location = response.headers.location;
          const status = response.statusCode || 0;
          if (
            options.followRedirects !== false &&
            [301, 302, 303, 307, 308].includes(status) &&
            location &&
            redirectCount < 5
          ) {
            resolve(nodeGetTextViaProxy(new URL(location, targetUrl).href, signal, headers, redirectCount + 1, options));
            return;
          }
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: response.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    request.once("error", reject);
    signal?.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    request.end();
  });
}

/**
 * POST JSON with a fetch-first / node-http fallback. Loopback targets
 * always use nodePostJson directly. Mirrors `postJsonWithFallback`.
 *
 * @param {string} targetUrl
 * @param {unknown} payload
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Promise<{ response: any, fallback: boolean, directLoopback?: boolean, fetchError?: unknown }>}
 */
async function postJsonWithFallback(targetUrl, payload, signal, extraHeaders = {}) {
  if (isLoopbackUrl(targetUrl)) {
    return {
      response: await nodePostJson(targetUrl, payload, signal, extraHeaders),
      fallback: true,
      directLoopback: true,
    };
  }

  try {
    return {
      response: await fetch(targetUrl, {
        method: "POST",
        signal: signal ?? undefined,
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify(payload),
      }),
      fallback: false,
    };
  } catch (error) {
    return {
      response: await nodePostJson(targetUrl, payload, signal, extraHeaders),
      fallback: true,
      fetchError: error,
    };
  }
}

/**
 * GET text with proxy → node-fetch-avoidance → global fetch → node
 * http fallback. Follows redirects. Mirrors `getTextWithFallback`.
 *
 * @param {string} targetUrl
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ ok: boolean, status: number, headers: any, text: string }>}
 */
async function getTextWithFallback(targetUrl, signal, headers = { "Accept": "application/json" }) {
  if (proxyUrlForTarget(targetUrl)) {
    try {
      return await nodeGetTextViaProxy(targetUrl, signal, headers);
    } catch (proxyError) {
      if (signal?.aborted) throw proxyError;
    }
  }

  if (shouldAvoidNodeFetchForTarget(targetUrl)) {
    return await nodeGetText(targetUrl, signal, headers);
  }

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      signal: signal ?? undefined,
      headers,
    });
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      text: await response.text(),
    };
  } catch (fetchError) {
    if (signal?.aborted) throw fetchError;
    try {
      return await nodeGetText(targetUrl, signal, headers);
    } catch (nodeError) {
      /** @type {any} */ (nodeError).cause =
        /** @type {any} */ (nodeError).cause || fetchError;
      throw nodeError;
    }
  }
}

/**
 * Same as getTextWithFallback but with `redirect: "manual"` so the
 * caller can inspect 3xx Location headers. Mirrors
 * `getTextOnceWithFallback`.
 *
 * @param {string} targetUrl
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ ok: boolean, status: number, headers: any, text: string }>}
 */
async function getTextOnceWithFallback(targetUrl, signal, headers = { "Accept": "application/json" }) {
  const options = { followRedirects: false };
  if (proxyUrlForTarget(targetUrl)) {
    try {
      return await nodeGetTextViaProxy(targetUrl, signal, headers, 0, options);
    } catch (proxyError) {
      if (signal?.aborted) throw proxyError;
    }
  }

  if (shouldAvoidNodeFetchForTarget(targetUrl)) {
    return await nodeGetText(targetUrl, signal, headers, 0, options);
  }

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "manual",
      signal: signal ?? undefined,
      headers,
    });
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      text: await response.text(),
    };
  } catch (fetchError) {
    if (signal?.aborted) throw fetchError;
    try {
      return await nodeGetText(targetUrl, signal, headers, 0, options);
    } catch (nodeError) {
      /** @type {any} */ (nodeError).cause =
        /** @type {any} */ (nodeError).cause || fetchError;
      throw nodeError;
    }
  }
}

module.exports = {
  headerValue,
  nodePostJson,
  nodeGetText,
  nodeGetTextViaProxy,
  proxyJsonStream,
  postJsonWithFallback,
  getTextWithFallback,
  getTextOnceWithFallback,
};
