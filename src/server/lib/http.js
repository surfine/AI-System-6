// HTTP utilities lifted from the root server.js. Behavior is identical
// to the originals; signatures are documented with JSDoc so a future
// tsc --noEmit pass catches contract drift.

"use strict";

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
  const limitBytes = Number.isFinite(options.limitBytes) ? options.limitBytes : Infinity;
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > limitBytes) {
    const error = /** @type {Error & { statusCode?: number }} */ (
      new Error(`Request body is too large. Limit is ${limitBytes} bytes.`)
    );
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > limitBytes) {
      const error = /** @type {Error & { statusCode?: number }} */ (
        new Error(`Request body is too large. Limit is ${limitBytes} bytes.`)
      );
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};

  return JSON.parse(raw);
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
  requestSignal,
  withTimeoutSignal,
  readJsonBody,
};
