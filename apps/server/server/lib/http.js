// HTTP utilities lifted from the root server.js. Behavior is identical
// to the originals; signatures are documented with JSDoc so a future
// tsc --noEmit pass catches contract drift.

"use strict";

const DEFAULT_JSON_LIMIT_BYTES = Math.max(
  64 * 1024,
  Number(process.env.AI_SYSTEM6_JSON_MAX_BYTES || 1024 * 1024)
);

function httpError(message, statusCode, code) {
  const error = /** @type {Error & { statusCode?: number, code?: string }} */ (
    new Error(message)
  );
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

/**
 * Send a response if the socket is still open. Mirrors `send` from the
 * root server.js byte for byte.
 *
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {string | Buffer} body
 * @param {Record<string, string | number | string[]>} [headers]
 */
function send(res, status, body, headers = {}) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, headers);
  res.end(body);
}

/**
 * Build an AbortSignal tied to the lifetime of a single HTTP request.
 * Aborts when the client disconnects or the response closes before
 * `writableEnded`. Mirrors `requestSignal` from the root server.js.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {AbortSignal}
 */
function requestSignal(req, res) {
  const controller = new AbortController();
  req.on("aborted", () => {
    controller.abort();
  });
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

/**
 * @typedef {Object} TimeoutSignalHandle
 * @property {AbortSignal} signal     New signal that aborts on parent
 *                                    abort or timeout.
 * @property {() => boolean} timedOut Whether the timeout itself fired.
 * @property {() => void} cleanup     Clear timer and unsubscribe.
 */

/**
 * Compose a parent AbortSignal with a timeout, producing a new signal
 * and a cleanup hook. Mirrors `withTimeoutSignal` from the root
 * server.js.
 *
 * @param {AbortSignal | null | undefined} signal
 * @param {number} timeoutMs
 * @returns {TimeoutSignalHandle}
 */
function withTimeoutSignal(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

/**
 * Read a JSON-encoded request body with an optional byte limit. Throws
 * an Error with `statusCode = 413` on overflow. Mirrors `readJsonBody`
 * from the root server.js. An empty body resolves to `{}`.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {{ limitBytes?: number }} [options]
 * @returns {Promise<any>}
 */
async function readJsonBody(req, options = {}) {
  const method = String(req.method || "").toUpperCase();
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method)
    && !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")
  ) {
    throw httpError(
      "Expected application/json.",
      415,
      "unsupported_media_type"
    );
  }
  const limitBytes = Number.isFinite(options.limitBytes)
    ? Math.max(0, Number(options.limitBytes))
    : DEFAULT_JSON_LIMIT_BYTES;
  const contentLength = Number(req.headers["content-length"] || 0);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw httpError("Invalid Content-Length header.", 400, "invalid_content_length");
  }
  if (contentLength > limitBytes) {
    throw httpError(
      `Request body is too large. Limit is ${limitBytes} bytes.`,
      413,
      "request_body_too_large"
    );
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > limitBytes) {
      throw httpError(
        `Request body is too large. Limit is ${limitBytes} bytes.`,
        413,
        "request_body_too_large"
      );
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw httpError("Request body must be valid JSON.", 400, "invalid_json");
  }

  // A body of `null`, a bare array, or a scalar parses as valid JSON, but every
  // route reads named fields from the result. Before this check, `null` reached
  // the handler and threw "Cannot read properties of null (reading 'x')" — an
  // internal symbol name, at status 500 or 502, for a request that was only
  // wrong. No client sends a top-level array or scalar, so the object shape is
  // a safe requirement and the caller gets a message it can act on.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw httpError(
      "Request body must be a JSON object. Send named fields, for example {}.",
      400,
      "invalid_json_body"
    );
  }
  return parsed;
}

/**
 * Answer a request whose own input was wrong, and report whether it did.
 *
 * A route wraps its work in one catch block that frames every failure as an
 * upstream failure ("Proxy failed", "Model load failed"). A bad body, an
 * oversized body, or a wrong content type never reaches an upstream, so that
 * frame states a cause that did not occur: the product told the user the local
 * model server was offline when the true fault was the request. Errors that
 * carry a deliberate 4xx `statusCode` come from this file and from the route
 * guards, so they are safe to report to the caller word for word.
 *
 * @param {import("node:http").ServerResponse} res
 * @param {unknown} error
 * @param {Record<string, unknown>} [extraFields] Fields the route's own failure
 *   shape always carries, so a client error keeps the same shape.
 * @returns {boolean} True when the response is sent.
 */
function respondIfClientError(res, error, extraFields = {}) {
  const status = Number(/** @type {any} */ (error)?.statusCode);
  if (!Number.isInteger(status) || status < 400 || status > 499) return false;
  const message = /** @type {any} */ (error)?.message;
  sendJson(res, status, {
    ...extraFields,
    error: String(message || "Request rejected."),
    ...(/** @type {any} */ (error)?.code
      ? { code: String(/** @type {any} */ (error).code) }
      : {}),
  });
  return true;
}

/**
 * Convenience: write a JSON body with the right content-type header.
 * Not present in the root server.js; added here so route handlers do
 * not have to repeat the boilerplate. Pass-through to `send`.
 *
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 * @param {Record<string, string | number | string[]>} [extraHeaders]
 */
function sendJson(res, status, payload, extraHeaders = {}) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
}

module.exports = {
  send,
  sendJson,
  httpError,
  respondIfClientError,
  requestSignal,
  withTimeoutSignal,
  readJsonBody,
  DEFAULT_JSON_LIMIT_BYTES,
};
