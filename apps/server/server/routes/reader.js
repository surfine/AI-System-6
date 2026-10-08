// GET /api/reader?url=...
//
// Fetch a public web page and return the reader-extracted article.
//
// Reading mode is a ladder. Each rung is tried only when the one before it
// could not produce readable text, and a final failure names the rungs that
// were tried, so "Reader failed" always says what failed:
//
//   1. The page itself, fetched with the private-network check and the
//      address pinned (up to 3 redirects, each re-checked). An address that
//      turns out to be a document (PDF, Word, EPUB…) goes to the same
//      importer a dropped file does; plain text, Markdown and JSON are read
//      as they are.
//   2. The extractor in reader.js, which reads data the page embeds (JSON-LD,
//      Next.js / Nuxt state, <noscript>) as well as the visible article.
//   3. The page's AMP version, when it names one.
//   4. r.jina.ai's rendering of the page — also when the site refused us,
//      timed out, or sent a JavaScript shell.
//   5. The latest Wayback Machine capture, labelled as an archive copy.
//
// When all of them fail on a page that looked like a JavaScript app, the
// answer says so (`code: "reader_needs_render"`); the desk can then render
// the page in Time Machine's live engine and send the HTML to
// POST /api/reader/extract.

"use strict";

const { send, requestSignal } = require("../lib/http.js");
const { nodeGetText, nodeGetTextViaProxy, headerValue, decodeTextBuffer, isResponseTooLargeError } = require("../lib/fetch.js");
const { localProxyRoute } = require("../lib/proxy-route.js");
const reader = require("../reader.js");
const { isPublicDeployment } = require("../runtime-profile.js");

const {
  READER_MAX_BYTES,
  READER_TIMEOUT_MS,
  readerFetchUrl,
  resolveReaderTarget,
  validateReaderTarget,
  cleanHtmlForReader,
  readerArticleFromJinaMarkdown,
  friendlyReaderError,
} = reader;

// A document link is larger than a page and takes longer to read.
const READER_DOCUMENT_MAX_BYTES = isPublicDeployment ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
const READER_LADDER_TIMEOUT_MS = Math.max(READER_TIMEOUT_MS, 40000);

const readerHeaders = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const documentTypes = [
  { pattern: /application\/pdf/i, ext: ".pdf" },
  { pattern: /wordprocessingml/i, ext: ".docx" },
  { pattern: /presentationml/i, ext: ".pptx" },
  { pattern: /spreadsheetml/i, ext: ".xlsx" },
  { pattern: /application\/epub\+zip/i, ext: ".epub" },
  { pattern: /application\/rtf|text\/rtf/i, ext: ".rtf" },
  { pattern: /opendocument\.text/i, ext: ".odt" },
  { pattern: /application\/x-ipynb\+json/i, ext: ".ipynb" },
];

/**
 * @param {string} url
 * @param {AbortSignal} signal
 * @param {number} maxBytes
 */
/**
 * A Mac that reaches the web through a proxy (where many sites are blocked,
 * a direct connection to the address DNS gives is often a dead end) reads
 * through that proxy, after the same private-network check. The public
 * server always connects directly to the address it checked.
 *
 * @param {string} url
 */
async function readerViaProxy(url) {
  return Boolean(await localProxyRoute(url, reader.isPrivateAddress));
}

async function fetchReaderTarget(url, signal, maxBytes) {
  let finalUrl = readerFetchUrl(url);
  /** @type {any} */
  let upstream;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (await readerViaProxy(finalUrl)) {
      upstream = await nodeGetTextViaProxy(finalUrl, signal, readerHeaders, 0, { followRedirects: false, maxBytes, binary: true });
    } else {
      const resolved = await resolveReaderTarget(finalUrl);
      finalUrl = resolved.url;
      upstream = await nodeGetText(finalUrl, signal, readerHeaders, 0, {
        followRedirects: false,
        maxBytes,
        pinnedAddress: resolved.address,
        pinnedFamily: resolved.family,
        binary: true,
      });
    }
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
    const location = headerValue(upstream.headers, "location");
    if (!location) throw new Error(`Upstream returned ${upstream.status}`);
    finalUrl = new URL(location, finalUrl).href;
  }
  if ([301, 302, 303, 307, 308].includes(upstream.status)) {
    throw new Error("Reader page redirected too many times.");
  }
  return { ...upstream, finalUrl };
}

/** @param {string} url */
function documentName(url, ext) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
    return `${last || new URL(url).hostname}${ext}`;
  } catch {
    return `document${ext}`;
  }
}

/**
 * A link to a document rather than a page, read by the importer a dropped
 * file goes through.
 *
 * @param {Buffer} buffer
 * @param {string} contentType
 * @param {string} url
 * @param {AbortSignal} signal
 */
async function readDocumentLink(buffer, contentType, url, signal) {
  const match = documentTypes.find((entry) => entry.pattern.test(contentType))
    || (/\.(pdf|docx|pptx|xlsx|epub|rtf|odt|ipynb)(?:$|\?)/i.exec(new URL(url).pathname)
      ? { ext: `.${/\.(pdf|docx|pptx|xlsx|epub|rtf|odt|ipynb)(?:$|\?)/i.exec(new URL(url).pathname)[1].toLowerCase()}` }
      : null);
  if (!match) return null;
  const name = documentName(url, match.ext);
  // Reader shows what the document says: no model rewrites it here, and the
  // public server does not run OCR for a link anyone can send it.
  const text = match.ext === ".pdf"
    ? await require("../importers/pdf.js").extractPdfText(buffer, { allowOcr: !isPublicDeployment, signal })
    : await require("./import-text.js").extractImportedText(name, contentType.split(";")[0].trim(), buffer, {
      modelExecution: "client",
      signal,
    });
  if (!String(text || "").trim()) return null;
  return {
    title: name,
    url,
    site: (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })(),
    author: "",
    date: "",
    text: String(text),
    sourceKind: "document",
    documentType: match.ext.slice(1),
  };
}

/**
 * @param {Buffer} buffer
 * @param {string} contentType
 * @param {string} url
 */
function readPlainLink(buffer, contentType, url) {
  if (!/^(text\/(plain|markdown|x-markdown|csv)|application\/json)/i.test(contentType)) return null;
  let text = decodeTextBuffer(buffer, { "content-type": contentType }, READER_DOCUMENT_MAX_BYTES);
  if (/application\/json/i.test(contentType)) {
    try {
      text = "```json\n" + JSON.stringify(JSON.parse(text), null, 2).slice(0, 400000) + "\n```";
    } catch {}
  }
  if (!text.trim()) return null;
  return {
    title: documentName(url, ""),
    url,
    site: new URL(url).hostname.replace(/^www\./, ""),
    author: "",
    date: "",
    text,
    sourceKind: "text",
  };
}

/** A page that ships its text in scripts rather than markup. */
function looksScriptRendered(html) {
  const text = String(html || "");
  const scripts = (text.match(/<script\b/gi) || []).length;
  const visible = text
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
  return scripts >= 3 && visible < 1500;
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
async function jinaRung(url, signal) {
  const target = new URL(url);
  // https stays https: the reading service fetches the page as asked.
  const jinaUrl = `https://r.jina.ai/${target.href}`;
  const jinaHeaders = { "Accept": "text/plain,*/*;q=0.8", "User-Agent": "AI-System-6/1.0" };
  let fallback;
  if (await readerViaProxy(jinaUrl)) {
    fallback = await nodeGetTextViaProxy(jinaUrl, signal, jinaHeaders, 0, { followRedirects: false, maxBytes: READER_MAX_BYTES });
  } else {
    const fallbackTarget = await resolveReaderTarget(jinaUrl);
    fallback = await nodeGetText(fallbackTarget.url, signal, jinaHeaders, 0, {
      followRedirects: false,
      maxBytes: READER_MAX_BYTES,
      pinnedAddress: fallbackTarget.address,
      pinnedFamily: fallbackTarget.family,
    });
  }
  if (!fallback.ok) throw new Error(`Reading service returned ${fallback.status}`);
  return { ...readerArticleFromJinaMarkdown(fallback.text, url), via: "jina" };
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
async function waybackRung(url, signal) {
  const timeMachine = require("../time-machine.js");
  const today = new Date().toISOString().slice(0, 10);
  const captures = await timeMachine.queryWaybackCaptures(url, today, signal);
  const capture = captures.find((candidate) => candidate?.browseUrl || candidate?.snapshotUrl);
  if (!capture) throw new Error("No archive copy of this page.");
  const page = await timeMachine.browseTimeMachinePage(capture.browseUrl || capture.snapshotUrl, url, signal);
  if (!page?.reader?.text) throw new Error("The archive copy has no readable text.");
  return {
    ...page.reader,
    url,
    // An old copy must not pass for the page as it is today.
    archive: {
      provider: "wayback",
      snapshotUrl: capture.snapshotUrl || "",
      capturedAt: capture.capturedAt || "",
    },
    via: "wayback",
  };
}

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

  /** @type {string[]} */
  const attempted = [];
  /** @type {unknown} */
  let firstError = null;
  let scriptRendered = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout;
  const respond = (article) => {
    send(res, 200, JSON.stringify({ ...article, attempted }), { "Content-Type": "application/json" });
  };
  try {
    const readerUrl = await validateReaderTarget(targetUrl);
    const timeoutController = new AbortController();
    timeout = setTimeout(() => timeoutController.abort(), READER_LADDER_TIMEOUT_MS);
    signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
    const ladderSignal = timeoutController.signal;

    // 1–2. The page itself.
    attempted.push("page");
    let html = "";
    try {
      const upstream = await fetchReaderTarget(readerUrl, ladderSignal, READER_DOCUMENT_MAX_BYTES);
      if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
      const contentType = String(headerValue(upstream.headers, "content-type") || "");
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        attempted.push("document");
        const article = readPlainLink(upstream.buffer, contentType, readerUrl)
          || await readDocumentLink(upstream.buffer, contentType, readerUrl, ladderSignal);
        if (article) {
          respond(article);
          return;
        }
        throw new Error("Reader can only open web pages and documents it knows how to read.");
      }
      if (upstream.buffer.length > READER_MAX_BYTES * 2) throw new Error("Reader page is too large.");
      html = decodeTextBuffer(upstream.buffer, upstream.headers, READER_MAX_BYTES * 2);
      scriptRendered = looksScriptRendered(html);
      // Keep the user-supplied canonical URL in saved source provenance even
      // when a site-specific public reading representation was fetched.
      respond(await cleanHtmlForReader(html, readerUrl));
      return;
    } catch (error) {
      if (/** @type {any} */ (error)?.name === "AbortError" && signal.aborted) throw error;
      firstError = error;
    }

    // 3. AMP.
    const ampUrl = html && typeof reader.readerAmpUrl === "function" ? reader.readerAmpUrl(html, readerUrl) : null;
    if (ampUrl) {
      attempted.push("amp");
      try {
        const amp = await fetchReaderTarget(ampUrl, ladderSignal, READER_MAX_BYTES);
        if (amp.ok) {
          respond({ ...(await cleanHtmlForReader(decodeTextBuffer(amp.buffer, amp.headers, READER_MAX_BYTES), readerUrl)), via: "amp" });
          return;
        }
      } catch {}
    }

    // 4. A reading service that renders the page.
    attempted.push("jina");
    try {
      respond(await jinaRung(readerUrl, ladderSignal));
      return;
    } catch {}

    // 5. The archive.
    attempted.push("wayback");
    try {
      respond(await waybackRung(readerUrl, ladderSignal));
      return;
    } catch {}

    const error = /** @type {any} */ (firstError || new Error("Reader could not extract readable article text."));
    if (scriptRendered && !error.statusCode) error.code = "reader_needs_render";
    throw error;
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError" && signal.aborted) return;
    if (isResponseTooLargeError(error) || /** @type {any} */ (error)?.code === "ERR_RESPONSE_TOO_LARGE") {
      error = new Error("Reader page is too large.");
    }
    // A refused address is the caller's fault; only a real attempt at a remote
    // page can fail upstream.
    const declaredStatus = Number(/** @type {any} */ (error)?.statusCode);
    const status = Number.isInteger(declaredStatus) && declaredStatus >= 400 && declaredStatus <= 499
      ? declaredStatus
      : 502;
    const code = /** @type {any} */ (error)?.code ? String(/** @type {any} */ (error).code) : "";
    send(res, status, JSON.stringify({
      error: "Reader failed",
      detail: friendlyReaderError(error),
      attempted,
      ...(code && (status !== 502 || code === "reader_needs_render") ? { code } : {}),
    }), {
      "Content-Type": "application/json",
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = { handleReader, looksScriptRendered };
