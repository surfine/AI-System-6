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
const net = require("node:net");
const zlib = require("node:zlib");
const { StringDecoder } = require("node:string_decoder");

const { decodeResponseText } = require("./charset.js");
const {
  isLoopbackUrl,
  shouldAvoidNodeFetchForTarget,
  proxyUrlForTarget,
  httpProxyAgentFor,
} = require("./proxy.js");

const sharedAgentOptions = {
  keepAlive: true,
  maxSockets: 16,
  maxFreeSockets: 4,
  timeout: 120000,
};
const httpAgent = new http.Agent(sharedAgentOptions);
const httpsAgent = new https.Agent(sharedAgentOptions);

/**
 * @typedef {Object} TextFetchOptions
 * @property {boolean} [followRedirects]
 * @property {number} [maxBytes]
 * @property {string} [pinnedAddress]
 * @property {number} [pinnedFamily]
 */

/**
 * SNI name for an outgoing TLS request. Node refuses an IP address as the
 * server name, so an endpoint written as `https://10.0.0.4:8443` throws
 * before the socket opens unless the name is left out.
 *
 * @param {URL} parsed
 * @returns {string | undefined}
 */
function tlsServerName(parsed) {
  if (parsed.protocol !== "https:") return undefined;
  return net.isIP(parsed.hostname) ? undefined : parsed.hostname;
}

function pinnedLookup(options = {}) {
  if (!options.pinnedAddress) return undefined;
  return (_hostname, lookupOptions, callback) => {
    const family = Number(options.pinnedFamily) || net.isIP(options.pinnedAddress);
    if (lookupOptions?.all) {
      callback(null, [{ address: options.pinnedAddress, family }]);
    } else {
      callback(null, options.pinnedAddress, family);
    }
  };
}

function createSseJsonParser(onEvent) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let dataLines = [];

  const dispatch = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join("\n").trim();
    dataLines = [];
    if (!raw || raw === "[DONE]") return;
    try {
      onEvent(JSON.parse(raw));
    } catch {}
  };
  const consumeLine = (line) => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (!normalized) {
      dispatch();
      return;
    }
    if (normalized.startsWith("data:")) dataLines.push(normalized.slice(5).trimStart());
  };
  const consume = (text) => {
    buffer += text;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  };

  return {
    push(chunk) {
      consume(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ""))));
    },
    end() {
      consume(decoder.end());
      if (buffer) consumeLine(buffer);
      buffer = "";
      dispatch();
    },
  };
}

/**
 * @param {number | undefined} maxBytes
 * @returns {number | undefined}
 */
function normalizedMaxBytes(maxBytes) {
  if (maxBytes === undefined) return undefined;
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new TypeError("maxBytes must be a non-negative finite number.");
  }
  return Math.floor(maxBytes);
}

/**
 * @param {number} maxBytes
 * @returns {Error & { code: string, statusCode: number, maxBytes: number }}
 */
function responseTooLargeError(maxBytes) {
  const error = /** @type {Error & { code: string, statusCode: number, maxBytes: number }} */ (
    new Error(`Upstream response exceeded the ${maxBytes} byte limit.`)
  );
  error.code = "ERR_RESPONSE_TOO_LARGE";
  error.statusCode = 413;
  error.maxBytes = maxBytes;
  return error;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isResponseTooLargeError(error) {
  return /** @type {any} */ (error)?.code === "ERR_RESPONSE_TOO_LARGE";
}

/**
 * Consume a fetch Response body while enforcing a byte limit during
 * download. The byte count is over the wire-decoded body bytes, before
 * decoding into a JavaScript string. The bytes are read rather than taken
 * from `response.text()` so the body can be decoded with the charset the
 * response declares — `Response.text()` always assumes UTF-8.
 *
 * @param {Response} response
 * @param {number | undefined} maxBytes
 * @returns {Promise<string>}
 */
async function readFetchText(response, maxBytes) {
  const limit = normalizedMaxBytes(maxBytes);
  const contentType = headerValue(response.headers, "content-type");
  if (limit === undefined) {
    return decodeResponseText(Buffer.from(await response.arrayBuffer()), contentType);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > limit) {
    await response.body?.cancel().catch(() => {});
    throw responseTooLargeError(limit);
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > limit) {
        await reader.cancel().catch(() => {});
        throw responseTooLargeError(limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeResponseText(Buffer.from(body.buffer, body.byteOffset, body.byteLength), contentType);
}

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
 * Decode response bytes from the direct Node HTTP path. Some old archive
 * snapshots contain a gzip body even when the replay response has lost its
 * Content-Encoding header, so the gzip magic bytes are also recognized.
 *
 * @param {Buffer} buffer
 * @param {any} headers
 * @param {number | undefined} maxBytes
 * @returns {string}
 */
function decodeTextBuffer(buffer, headers, maxBytes) {
  const encoding = String(headerValue(headers, "content-encoding") || "").toLowerCase();
  const decodeOptions = maxBytes === undefined
    ? undefined
    : { maxOutputLength: Math.max(1, maxBytes) };
  let decoded = buffer;
  try {
    if (encoding.includes("br")) {
      decoded = zlib.brotliDecompressSync(buffer, decodeOptions);
    } else if (encoding.includes("gzip") || (buffer[0] === 0x1f && buffer[1] === 0x8b)) {
      decoded = zlib.gunzipSync(buffer, decodeOptions);
    } else if (encoding.includes("deflate")) {
      decoded = zlib.inflateSync(buffer, decodeOptions);
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.code === "ERR_BUFFER_TOO_LARGE") {
      throw responseTooLargeError(maxBytes);
    }
    throw error;
  }
  if (maxBytes !== undefined && decoded.byteLength > maxBytes) {
    throw responseTooLargeError(maxBytes);
  }
  return decodeResponseText(decoded, headerValue(headers, "content-type"));
}

/**
 * Read an upstream node response to the end as text, with the same
 * size limit as the buffered POST/GET helpers.
 *
 * @param {import("node:http").IncomingMessage} response
 * @param {number | undefined} maxBytes
 * @returns {Promise<string>}
 */
function readIncomingText(response, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    response.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (maxBytes !== undefined && totalBytes > maxBytes) {
        settled = true;
        const error = responseTooLargeError(maxBytes);
        response.destroy(error);
        reject(error);
        return;
      }
      chunks.push(buffer);
    });
    response.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    response.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
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
function nodePostJson(targetUrl, payload, signal, extraHeaders = {}, options = {}) {
  const maxBytes = normalizedMaxBytes(options.maxBytes);
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
        servername: tlsServerName(parsed),
        lookup: pinnedLookup(options),
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        let totalBytes = 0;
        let settled = false;
        response.on("data", (chunk) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.length;
          if (maxBytes !== undefined && totalBytes > maxBytes) {
            settled = true;
            const error = responseTooLargeError(maxBytes);
            response.destroy(error);
            reject(error);
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
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
            text() {
              return Promise.resolve(text);
            },
          });
        });
      }
    );

    request.on("error", reject);
    if (typeof options.onRequest === "function") request.once("finish", options.onRequest);
    signal?.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    request.end(body);
  });
}

/**
 * Direct POST via the node http/https client that resolves as soon as the
 * response headers arrive and exposes the upstream stream as `body`.
 *
 * `nodePostJson` buffers the whole response before it resolves, so an SSE
 * call routed through it loses every incremental event and hands the caller
 * a response with no `body` to iterate. Streaming callers use this instead;
 * `text()` still reads the rest of the stream for the error path.
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
 *   body: import("node:http").IncomingMessage,
 * }>}
 */
function nodePostJsonStream(targetUrl, payload, signal, extraHeaders = {}, options = {}) {
  const maxBytes = normalizedMaxBytes(options.maxBytes);
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
        servername: tlsServerName(parsed),
        lookup: pinnedLookup(options),
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const status = response.statusCode || 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: {
            get(name) {
              return /** @type {any} */ (response.headers)[String(name).toLowerCase()] || "";
            },
          },
          text() {
            return readIncomingText(response, maxBytes);
          },
          body: response,
        });
      }
    );

    request.on("error", reject);
    if (typeof options.onRequest === "function") request.once("finish", options.onRequest);
    signal?.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    request.end(body);
  });
}

function boundedFetchResponse(response, maxBytes) {
  const limit = normalizedMaxBytes(maxBytes);
  if (limit === undefined) return response;
  let textPromise = null;
  const text = () => {
    textPromise ||= readFetchText(response, limit);
    return textPromise;
  };
  const wrapped = {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    text,
    body: response.body,
  };
  wrapped.clone = () => wrapped;
  return wrapped;
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
 * @param {{ maxBytes?: number, onData?: (chunk: Buffer | string) => void, onRequest?: () => void, onBeforeEnd?: () => void, pinnedAddress?: string, pinnedFamily?: number }} [options]
 * @returns {Promise<boolean>}
 */
function proxyJsonStream(targetUrl, payload, signal, res, extraHeaders = {}, options = {}) {
  const maxBytes = normalizedMaxBytes(options.maxBytes);
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
        servername: tlsServerName(parsed),
        lookup: pinnedLookup(options),
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (upstream) => {
        let totalBytes = 0;
        let settled = false;
        const contentType = upstream.headers["content-type"] || "text/event-stream";
        res.writeHead(upstream.statusCode || 200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        upstream.on("data", (chunk) => {
          if (settled) return;
          if (typeof options.onData === "function") {
            options.onData(chunk);
          }
          totalBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
          if (maxBytes !== undefined && totalBytes > maxBytes) {
            settled = true;
            upstream.destroy();
            res.destroy();
            resolve(false);
          }
        });
        upstream.pipe(res, { end: false });
        upstream.on("end", () => {
          if (settled) return;
          settled = true;
          try {
            if (typeof options.onBeforeEnd === "function") options.onBeforeEnd();
          } catch (error) {
            res.destroy();
            reject(error);
            return;
          }
          res.end();
          resolve(true);
        });
        upstream.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
      }
    );

    request.on("error", reject);
    if (typeof options.onRequest === "function") request.once("finish", options.onRequest);
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
 * @param {TextFetchOptions} [options]
 * @returns {Promise<{ ok: boolean, status: number, headers: import("node:http").IncomingHttpHeaders, text: string }>}
 */
function nodeGetText(targetUrl, signal, headers = { "Accept": "application/json" }, redirectCount = 0, options = {}) {
  const maxBytes = normalizedMaxBytes(options.maxBytes);
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
        servername: tlsServerName(parsed),
        lookup: pinnedLookup(options),
      },
      (response) => {
        const chunks = [];
        let totalBytes = 0;
        let settled = false;
        const contentLength = Number(response.headers["content-length"] || 0);
        if (maxBytes !== undefined && Number.isFinite(contentLength) && contentLength > maxBytes) {
          settled = true;
          const error = responseTooLargeError(maxBytes);
          response.destroy();
          reject(error);
          return;
        }
        response.on("data", (chunk) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.byteLength;
          if (maxBytes !== undefined && totalBytes > maxBytes) {
            settled = true;
            const error = responseTooLargeError(maxBytes);
            response.destroy(error);
            reject(error);
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
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
          let text;
          try {
            text = decodeTextBuffer(Buffer.concat(chunks), response.headers, maxBytes);
          } catch (error) {
            reject(error);
            return;
          }
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
 * @param {TextFetchOptions} [options]
 * @returns {Promise<{ ok: boolean, status: number, headers: import("node:http").IncomingHttpHeaders, text: string }>}
 */
function nodeGetTextViaProxy(targetUrl, signal, headers = { "Accept": "application/json" }, redirectCount = 0, options = {}) {
  if (signal?.aborted) return Promise.reject(new Error("Request aborted"));
  const maxBytes = normalizedMaxBytes(options.maxBytes);
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
        let totalBytes = 0;
        let settled = false;
        const contentLength = Number(response.headers["content-length"] || 0);
        if (maxBytes !== undefined && Number.isFinite(contentLength) && contentLength > maxBytes) {
          settled = true;
          const error = responseTooLargeError(maxBytes);
          response.destroy();
          reject(error);
          return;
        }
        response.on("data", (chunk) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.byteLength;
          if (maxBytes !== undefined && totalBytes > maxBytes) {
            settled = true;
            const error = responseTooLargeError(maxBytes);
            response.destroy(error);
            reject(error);
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
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
          let text;
          try {
            text = decodeTextBuffer(Buffer.concat(chunks), response.headers, maxBytes);
          } catch (error) {
            reject(error);
            return;
          }
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: response.headers,
            text,
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
 * POST JSON with one transport selected before bytes are written. A failed
 * POST is never replayed through a second transport because the first server
 * may already have processed it.
 *
 * Address pinning forces the node transport, which buffers by default. Set
 * `options.streamResponse` when the caller iterates `response.body` (SSE), or
 * the response arrives as one blob with no body.
 *
 * @param {string} targetUrl
 * @param {unknown} payload
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [extraHeaders]
 * @param {{ maxBytes?: number, streamResponse?: boolean, pinnedAddress?: string, pinnedFamily?: number, onRequest?: () => void }} [options]
 * @returns {Promise<{
 *   response: any,
 *   fallback: boolean,
 *   directLoopback?: boolean,
 *   transport: "fetch" | "node",
 * }>}
 */
async function postJsonWithFallback(targetUrl, payload, signal, extraHeaders = {}, options = {}) {
  const forceNodeTransport =
    process.env.AI_SYSTEM6_HTTP_TRANSPORT === "node"
    || Boolean(options.pinnedAddress)
    || isLoopbackUrl(targetUrl)
    || shouldAvoidNodeFetchForTarget(targetUrl);
  if (forceNodeTransport) {
    return {
      response: options.streamResponse
        ? await nodePostJsonStream(targetUrl, payload, signal, extraHeaders, options)
        : await nodePostJson(targetUrl, payload, signal, extraHeaders, options),
      fallback: false,
      directLoopback: isLoopbackUrl(targetUrl),
      transport: "node",
    };
  }

  return {
    response: boundedFetchResponse(await fetch(targetUrl, {
      method: "POST",
      redirect: "error",
      signal: signal ?? undefined,
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    }), options.maxBytes),
    fallback: false,
    transport: "fetch",
  };
}

/**
 * GET text with proxy → node-fetch-avoidance → global fetch → node
 * http fallback. Follows redirects. Mirrors `getTextWithFallback`.
 *
 * @param {string} targetUrl
 * @param {AbortSignal | null | undefined} signal
 * @param {Record<string, string>} [headers]
 * @param {{ maxBytes?: number, pinnedAddress?: string, pinnedFamily?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, headers: any, text: string }>}
 */
async function getTextWithFallback(targetUrl, signal, headers = { "Accept": "application/json" }, options = {}) {
  const fetchOptions = {
    maxBytes: normalizedMaxBytes(options.maxBytes),
    pinnedAddress: options.pinnedAddress,
    pinnedFamily: options.pinnedFamily,
  };
  if (fetchOptions.pinnedAddress) {
    return await nodeGetText(targetUrl, signal, headers, 0, fetchOptions);
  }
  if (proxyUrlForTarget(targetUrl)) {
    try {
      return await nodeGetTextViaProxy(targetUrl, signal, headers, 0, fetchOptions);
    } catch (proxyError) {
      if (signal?.aborted || isResponseTooLargeError(proxyError)) throw proxyError;
    }
  }

  if (shouldAvoidNodeFetchForTarget(targetUrl)) {
    return await nodeGetText(targetUrl, signal, headers, 0, fetchOptions);
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
      text: await readFetchText(response, fetchOptions.maxBytes),
    };
  } catch (fetchError) {
    if (signal?.aborted || isResponseTooLargeError(fetchError)) throw fetchError;
    try {
      return await nodeGetText(targetUrl, signal, headers, 0, fetchOptions);
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
 * @param {{ maxBytes?: number, pinnedAddress?: string, pinnedFamily?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, headers: any, text: string }>}
 */
async function getTextOnceWithFallback(targetUrl, signal, headers = { "Accept": "application/json" }, options = {}) {
  const fetchOptions = {
    followRedirects: false,
    maxBytes: normalizedMaxBytes(options.maxBytes),
    pinnedAddress: options.pinnedAddress,
    pinnedFamily: options.pinnedFamily,
  };
  if (fetchOptions.pinnedAddress) {
    return await nodeGetText(targetUrl, signal, headers, 0, fetchOptions);
  }
  if (proxyUrlForTarget(targetUrl)) {
    try {
      return await nodeGetTextViaProxy(targetUrl, signal, headers, 0, fetchOptions);
    } catch (proxyError) {
      if (signal?.aborted || isResponseTooLargeError(proxyError)) throw proxyError;
    }
  }

  if (shouldAvoidNodeFetchForTarget(targetUrl)) {
    return await nodeGetText(targetUrl, signal, headers, 0, fetchOptions);
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
      text: await readFetchText(response, fetchOptions.maxBytes),
    };
  } catch (fetchError) {
    if (signal?.aborted || isResponseTooLargeError(fetchError)) throw fetchError;
    try {
      return await nodeGetText(targetUrl, signal, headers, 0, fetchOptions);
    } catch (nodeError) {
      /** @type {any} */ (nodeError).cause =
        /** @type {any} */ (nodeError).cause || fetchError;
      throw nodeError;
    }
  }
}

module.exports = {
  headerValue,
  decodeTextBuffer,
  nodePostJson,
  nodeGetText,
  nodeGetTextViaProxy,
  proxyJsonStream,
  postJsonWithFallback,
  getTextWithFallback,
  getTextOnceWithFallback,
  responseTooLargeError,
  isResponseTooLargeError,
  createSseJsonParser,
};
