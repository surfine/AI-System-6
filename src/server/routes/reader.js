// GET /api/reader?url=...
//
// Fetch a public web page and return the reader-extracted article.
// Validates the target URL against private network ranges, follows
// up to 3 HTTP redirects (re-validating each hop), caps the page
// size at 2 MiB, then runs the article through cleanHtmlForReader.
//
// Behavior parity with root server.js:
// - Missing url -> 400 { error: "Missing url" }.
// - Per-request 15 s timeout via a chained AbortController.
// - Redirect re-validation: each Location is passed through
//   validateReaderTarget so a redirect into a private host fails
//   the same as a direct private host would.
// - More than 3 redirects -> "Reader page redirected too many times."
// - Non-HTML content-type -> "Reader can only open HTML pages."
// - Content-length OR actual body exceeding READER_MAX_BYTES ->
//   "Reader page is too large."
// - 502 with { error: "Reader failed", detail: friendlyReaderError }.
// - AbortError swallowed silently.

"use strict";

const { send, requestSignal } = require("../lib/http.js");
const { getTextOnceWithFallback, headerValue } = require("../lib/fetch.js");
const {
  READER_MAX_BYTES,
  READER_TIMEOUT_MS,
  validateReaderTarget,
  cleanHtmlForReader,
  friendlyReaderError,
} = require("../reader.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleReader(req, res) {
  const signal = requestSignal(req, res);
  const urlParams = new URL(req.url || "/", `http://${req.headers.host}`).searchParams;
  const targetUrl = urlParams.get("url");

  if (!targetUrl) {
    send(res, 400, JSON.stringify({ error: "Missing url" }), {
      "Content-Type": "application/json",
    });
    return;
  }

  /** @type {string} */
  let readerUrl;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout;
  try {
    readerUrl = await validateReaderTarget(targetUrl);
    const timeoutController = new AbortController();
    timeout = setTimeout(() => timeoutController.abort(), READER_TIMEOUT_MS);
    signal.addEventListener("abort", () => timeoutController.abort(), { once: true });

    const readerHeaders = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    /** @type {{ ok: boolean, status: number, headers: any, text: string }} */
    let upstream;
    let finalReaderUrl = readerUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      upstream = await getTextOnceWithFallback(finalReaderUrl, timeoutController.signal, readerHeaders);

      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;

      const location = headerValue(upstream.headers, "location");
      if (!location) throw new Error(`Upstream returned ${upstream.status}`);
      finalReaderUrl = await validateReaderTarget(new URL(location, finalReaderUrl).href);
    }

    if ([301, 302, 303, 307, 308].includes(/** @type {any} */ (upstream).status)) {
      throw new Error("Reader page redirected too many times.");
    }

    if (!(/** @type {any} */ (upstream).ok)) {
      throw new Error(`Upstream returned ${/** @type {any} */ (upstream).status}`);
    }

    const contentType = headerValue(/** @type {any} */ (upstream).headers, "content-type");
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("Reader can only open HTML pages.");
    }

    const contentLength = Number(headerValue(/** @type {any} */ (upstream).headers, "content-length") || 0);
    if (contentLength > READER_MAX_BYTES) {
      throw new Error("Reader page is too large.");
    }

    const html = /** @type {any} */ (upstream).text;
    if (html.length > READER_MAX_BYTES) {
      throw new Error("Reader page is too large.");
    }
    const cleaned = await cleanHtmlForReader(html, finalReaderUrl);

    send(res, 200, JSON.stringify(cleaned), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Reader failed",
      detail: friendlyReaderError(error),
    }), {
      "Content-Type": "application/json",
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = { handleReader };
