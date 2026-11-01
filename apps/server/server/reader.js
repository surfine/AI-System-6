// Reader extraction subsystem. Lifts the entire reader pipeline from
// root server.js:
//
//   - URL validation with SSRF guard (validateReaderTarget +
//     isPrivateAddress).
//   - Lazy import of @extractus/article-extractor.
//   - Heuristic content candidate scorer for pages the article
//     extractor can't handle.
//   - JSON-LD article body fallback.
//   - HTML → Markdown converter.
//   - Boilerplate stripper with title/description deduping and
//     dateline / end-matter pruning.
//   - Friendly error message mapper.
//
// Behavior parity with root server.js. The migration's intentional
// changes are limited to source-form-only tweaks documented inline.

"use strict";

const net = require("node:net");
const dns = require("node:dns/promises");

const { decodeHtml, stripTags, cleanText } = require("./lib/text.js");
const { siteFromUrl } = require("./lib/url.js");

/** Hard cap on reader upstream response size. Mirrors `readerMaxBytes`. */
const READER_MAX_BYTES = 2 * 1024 * 1024;

/** Total reader timeout (per-attempt). Mirrors `readerTimeoutMs`. */
const READER_TIMEOUT_MS = 15000;

/**
 * Baidu Baike rejects non-browser desktop fetches with 403, while its public
 * mobile reading endpoint exposes the same entry as ordinary HTML. Keep the
 * original URL as provenance; this only changes the retrieval representation.
 *
 * @param {string} value
 * @returns {string}
 */
function readerFetchUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() === "baike.baidu.com") {
      url.hostname = "wapbaike.baidu.com";
    }
    return url.href;
  } catch {
    return value;
  }
}

/**
 * Convert Jina Reader's documented plain-text envelope into the same article
 * shape returned by our local HTML extractor. The caller keeps the original
 * source URL, rather than Jina's proxy URL, for provenance.
 *
 * @param {string} markdown
 * @param {string} sourceUrl
 * @returns {{ title: string, url: string, site: string, author: string, date: string, text: string }}
 */
function readerArticleFromJinaMarkdown(markdown, sourceUrl) {
  const source = String(markdown || "");
  const title = cleanText((source.match(/^Title:\s*(.+)$/m) || [])[1] || "Untitled Page");
  const marker = "Markdown Content:";
  const markerIndex = source.indexOf(marker);
  const text = cleanText(markerIndex >= 0 ? source.slice(markerIndex + marker.length) : source);
  if (!validReaderText(text)) {
    throw new Error("Reader fallback could not extract readable article text.");
  }
  return { title, url: sourceUrl, site: siteFromUrl(sourceUrl), author: "", date: "", text };
}

/**
 * Substantial-text and meaningful-character regexes use the same CJK
 * code-point range as their search.js counterparts. Built from
 * string literals with explicit \u escapes so the source survives
 * editor encoding round-trips. Same code-points as root's inline
 * /[a-z0-9一-鿿]/.
 */
const READER_SUBSTANTIAL_CHAR = new RegExp("[^a-z0-9\\u4e00-\\u9fff]+", "gi");

// =============================================================================
// SSRF guard
// =============================================================================

/**
 * True for IPv4 / IPv6 addresses that belong to RFC-defined private
 * ranges, loopback, link-local, multicast, broadcast, IPv4-mapped
 * IPv6, etc. Mirrors `isPrivateAddress` from root server.js.
 *
 * @param {string} address
 * @returns {boolean}
 */
function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const [a, b, c] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      // 192.0.0.0/24 and TEST-NET-1; the rest of 192.0/16 is public
      // (iana.org itself lives there).
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isPrivateAddress(normalized.slice(7));
    }
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

/**
 * The address came from the caller, so Reader refusing it is a fault in the
 * request. These were thrown as plain errors and the route answered 502, which
 * told the user that a remote page had failed when Reader had not opened one.
 *
 * @param {string} message
 * @param {string} code
 * @returns {Error & { code?: string, statusCode?: number }}
 */
function readerTargetError(message, code) {
  const error = /** @type {Error & { code?: string, statusCode?: number }} */ (
    new Error(message)
  );
  error.statusCode = 400;
  error.code = code;
  return error;
}

/**
 * Validate that `value` is an http(s) URL targeting a public host.
 * Rejects localhost / private IPs / private DNS results. Returns the
 * canonical URL plus the public address that must be pinned for the request.
 *
 * @param {string} value
 * @returns {Promise<{ url: string, address: string, family: number }>}
 */
async function resolveReaderTarget(value) {
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw readerTargetError("Reader accepts only valid URLs.", "reader_invalid_url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw readerTargetError(
      "Reader accepts only http or https URLs. Give the page address that starts with http:// or https://.",
      "reader_unsupported_scheme"
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(hostname) || hostname.endsWith(".localhost")) {
    throw readerTargetError(
      "Reader cannot open local machine addresses. Give a public web address.",
      "reader_local_address"
    );
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw readerTargetError(
        "Reader cannot open private network addresses. Give a public web address.",
        "reader_private_address"
      );
    }
    return {
      url: parsed.href,
      address: hostname,
      family: net.isIP(hostname),
    };
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw readerTargetError(
      "Reader cannot open private network addresses. Give a public web address.",
      "reader_private_address"
    );
  }

  return {
    url: parsed.href,
    address: addresses[0].address,
    family: addresses[0].family,
  };
}

/**
 * @param {string} value
 * @returns {Promise<string>}
 */
async function validateReaderTarget(value) {
  return (await resolveReaderTarget(value)).url;
}

// =============================================================================
// HTML helpers
// =============================================================================

/**
 * Extract the `content` attribute value for a `<meta>` tag matching
 * `name` or `property`. Looks for both attribute orderings. Mirrors
 * `metaContent`.
 *
 * @param {string} html
 * @param {string} name
 * @returns {string}
 */
function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i");
  const match = html.match(pattern) || html.match(reversePattern);
  return match ? stripTags(match[1]) : "";
}

/**
 * Lower-case, strip non-word characters, lower-case for comparison
 * keys used by the dedup / dateline / end-matter logic.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeReaderComparable(value) {
  // Letters and digits of every script. A plain \W would treat each Chinese
  // character as punctuation, and a Chinese paragraph would compare as empty
  // and be dropped as boilerplate.
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Recursively scan all JSON-LD script blocks for an `articleBody`
 * string. Mirrors `readerJsonLdArticleBody`.
 *
 * @param {string} html
 * @returns {string}
 */
function readerJsonLdArticleBody(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean);

  /**
   * @param {any} value
   * @returns {string}
   */
  function findArticleBody(value) {
    if (!value || typeof value !== "object") return "";
    if (typeof value.articleBody === "string" && value.articleBody.trim()) return decodeHtml(value.articleBody);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findArticleBody(item);
        if (found) return found;
      }
    }
    for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "hasPart"]) {
      const found = findArticleBody(value[key]);
      if (found) return found;
    }
    return "";
  }

  for (const block of blocks) {
    try {
      const found = findArticleBody(JSON.parse(block));
      if (found) return cleanText(decodeHtml(found));
    } catch {
      // Keep scanning other JSON-LD blocks.
    }
  }
  return "";
}

// =============================================================================
// Embedded article data
// =============================================================================
//
// A large share of modern pages ship the article as data rather than markup:
// JSON-LD, Next.js / Nuxt hydration payloads, inline window-state assignments,
// or a <noscript> copy meant for crawlers. The markup ladder reaches those
// bodies only after the markup is gone, so they are read directly here. Every
// candidate is a regex / string construction; nothing is eval'd, so a page can
// never turn its payload into code.

/** schema.org article-like types whose bodies count as a full article. */
const READER_JSON_LD_ARTICLE_TYPES = new Set([
  "Article",
  "NewsArticle",
  "BlogPosting",
  "Report",
  "TechArticle",
  "SocialMediaPosting",
]);

/**
 * Keys that may carry an article body inside a hydration payload. Narrow on
 * purpose: "description" is included because many CMS payloads put the lede
 * there, and the >= 400 text-character gate below still applies to it.
 */
const READER_EMBEDDED_BODY_KEY = /^(content|body|articleBody|article_body|text|html|richText|contentHtml|markdown|description)$/i;

/** Hydration payloads are untrusted and can be huge; bound the walk. */
const READER_EMBEDDED_MAX_NODES = 20000;
const READER_EMBEDDED_MAX_DEPTH = 40;

/**
 * Split a plain-text body into Markdown paragraphs on blank lines or single
 * newlines. A CMS often stores a hard-wrapped lede with "\n" between lines,
 * which would otherwise collapse into one paragraph.
 *
 * @param {unknown} value
 * @returns {string}
 */
function readerPlainBodyParagraphs(value) {
  return String(value || "")
    .split(/\n{2,}|\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Convert one embedded body string into the reader's Markdown flavor. A body
 * that still carries tags follows the markup converter; plain text is split
 * back into paragraphs first so the boilerplate stripper can see them.
 *
 * @param {unknown} value
 * @param {{ title?: string, description?: string, baseUrl?: string }} [context]
 * @returns {string}
 */
function readerEmbeddedBodyToMarkdown(value, context = {}) {
  const raw = cleanText(String(value || ""));
  if (!raw) return "";
  if (/<[a-z!/][^>]*>/i.test(raw)) return htmlToReaderMarkdown(raw, context);
  return stripReaderBoilerplate(readerPlainBodyParagraphs(raw), context);
}

/**
 * Pull a display name out of a schema.org style value that may be a string, an
 * object with `name`, or a list of either.
 *
 * @param {unknown} value
 * @returns {string}
 */
function readerSchemaName(value) {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = readerSchemaName(item);
      if (name) return name;
    }
    return "";
  }
  if (value && typeof value === "object" && typeof /** @type {any} */ (value).name === "string") {
    return cleanText(/** @type {any} */ (value).name);
  }
  return "";
}

/**
 * Flatten every object reachable from a parsed JSON-LD blob, including @graph
 * arrays and nested mainEntity chains.
 *
 * @param {any} value
 * @param {any[]} out
 * @param {number} [depth]
 * @returns {void}
 */
function readerCollectJsonLdObjects(value, out, depth = 0) {
  if (!value || typeof value !== "object" || depth > READER_EMBEDDED_MAX_DEPTH || out.length > 5000) return;
  if (Array.isArray(value)) {
    for (const item of value) readerCollectJsonLdObjects(item, out, depth + 1);
    return;
  }
  out.push(value);
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "hasPart", "itemListElement"]) {
    if (value[key] !== undefined) readerCollectJsonLdObjects(value[key], out, depth + 1);
  }
}

/**
 * Read every <script type="application/ld+json"> block and turn any
 * article-typed object into a candidate body. A block without an article type
 * is skipped so a WebSite or BreadcrumbList blob cannot claim the article.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {Array<{ title: string, byline: string, published: string, markdown: string, source: string }>}
 */
function readerJsonLdCandidates(html, pageUrl) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const candidates = [];
  for (const block of blocks) {
    /** @type {any} */
    let parsed;
    try {
      parsed = JSON.parse(decodeHtml(block));
    } catch {
      continue;
    }
    const objects = [];
    readerCollectJsonLdObjects(parsed, objects);
    for (const object of objects) {
      const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
      if (!types.some((type) => typeof type === "string" && READER_JSON_LD_ARTICLE_TYPES.has(type))) continue;
      const body = typeof object.articleBody === "string" && object.articleBody.trim()
        ? object.articleBody
        : typeof object.text === "string" ? object.text : "";
      if (!body.trim()) continue;
      const title = readerSchemaName(object.headline) || readerSchemaName(object.name);
      const markdown = readerEmbeddedBodyToMarkdown(body, { title, baseUrl: pageUrl });
      if (!markdown) continue;
      candidates.push({
        title,
        byline: readerSchemaName(object.author),
        published: cleanText(object.datePublished || object.dateCreated || ""),
        markdown,
        source: "json-ld",
      });
    }
  }
  return candidates;
}

/**
 * Parse a JSON payload carried by an element with a known id, e.g. Next.js's
 * <script id="__NEXT_DATA__">. Returns null when the element or JSON is
 * missing, so the ladder simply moves on.
 *
 * @param {string} html
 * @param {string} id
 * @returns {any}
 */
function readerParseJsonScript(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("<script\\b[^>]*id=[\"']" + escaped + "[\"'][^>]*>([\\s\\S]*?)<\\/script>", "i");
  const match = html.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(decodeHtml(match[1]).trim());
  } catch {
    return null;
  }
}

/**
 * Slice a JSON object literal out of source text, starting at its opening
 * brace. This is a string-aware brace scanner: braces that live inside quoted
 * strings do not change the depth, so a payload may contain "{" or "}" in a
 * field without truncating the literal. Nothing is eval'd; the slice is
 * returned only for JSON.parse.
 *
 * @param {string} source
 * @param {number} startIndex index of the opening "{"
 * @returns {string}
 */
function readerBraceLiteral(source, startIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }
  return "";
}

/**
 * Find `window.NAME = {...}` assignments and return their parsed object. Only a
 * JSON object literal is accepted; a function call, `undefined`, or a bare
 * identifier is ignored rather than guessed at.
 *
 * @param {string} html
 * @param {string[]} names
 * @param {string} source label for the winning candidate
 * @returns {Array<{ value: any, source: string }>}
 */
function readerWindowAssignments(html, names, source) {
  const values = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp("window\\." + escaped + "\\s*=\\s*").exec(html);
    if (!match) continue;
    let index = match.index + match[0].length;
    while (index < html.length && /\s/.test(html[index])) index += 1;
    if (html[index] !== "{") continue;
    const literal = readerBraceLiteral(html, index);
    if (!literal) continue;
    try {
      values.push({ value: JSON.parse(literal), source });
    } catch {
      // Not a JSON payload; leave it for another rung.
    }
  }
  return values;
}

/**
 * Walk a hydration payload and collect long strings held under body-like keys,
 * remembering the sibling title / author / date so the candidate carries real
 * provenance. The walk is breadth-first with a hard node and depth cap: the
 * payload is page-controlled and may be adversarially large.
 *
 * @param {any} root
 * @param {string} source
 * @returns {Array<{ title: string, byline: string, published: string, value: string, source: string }>}
 */
function readerCollectEmbeddedBodies(root, source) {
  const found = [];
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length && nodes < READER_EMBEDDED_MAX_NODES) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (depth > READER_EMBEDDED_MAX_DEPTH || !value || typeof value !== "object") continue;
    const title = cleanText(typeof value.title === "string" ? value.title
      : typeof value.headline === "string" ? value.headline : "");
    const byline = readerSchemaName(value.author) || cleanText(typeof value.byline === "string" ? value.byline : "");
    const published = cleanText(value.datePublished || value.publishedAt || value.published || value.date || "");
    const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
    for (const [key, child] of entries) {
      if (typeof child === "string") {
        if (!READER_EMBEDDED_BODY_KEY.test(String(key))) continue;
        if (stripTags(child).length < 400) continue;
        found.push({ title, byline, published, value: child, source });
      } else if (child && typeof child === "object") {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return found;
}

/**
 * Read the framework hydration payloads the ladder knows: Next.js
 * __NEXT_DATA__, Nuxt __NUXT__ / __NUXT_DATA__, and the common
 * __INITIAL_STATE__ / __PRELOADED_STATE__ / __APOLLO_STATE__ assignments.
 * Each long body string becomes a candidate; the longest valid one is chosen
 * by readerEmbeddedArticle.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {Array<{ title: string, byline: string, published: string, markdown: string, source: string }>}
 */
function readerFrameworkCandidates(html, pageUrl) {
  const payloads = [];
  const nextData = readerParseJsonScript(html, "__NEXT_DATA__");
  if (nextData !== null) payloads.push({ value: nextData, source: "next-data" });
  const nuxtData = readerParseJsonScript(html, "__NUXT_DATA__");
  if (nuxtData !== null) payloads.push({ value: nuxtData, source: "nuxt" });
  payloads.push(...readerWindowAssignments(html, ["__NUXT__"], "nuxt"));
  payloads.push(...readerWindowAssignments(html, ["__INITIAL_STATE__", "__PRELOADED_STATE__", "__APOLLO_STATE__"], "initial-state"));

  const candidates = [];
  for (const payload of payloads) {
    const bodies = readerCollectEmbeddedBodies(payload.value, payload.source)
      .sort((a, b) => substantialReaderTextLength(stripTags(b.value)) - substantialReaderTextLength(stripTags(a.value)))
      .slice(0, 8);
    for (const body of bodies) {
      const markdown = readerEmbeddedBodyToMarkdown(body.value, { title: body.title, baseUrl: pageUrl });
      if (!markdown) continue;
      candidates.push({
        title: body.title,
        byline: body.byline,
        published: body.published,
        markdown,
        source: body.source,
      });
    }
  }
  return candidates;
}

/**
 * A <noscript> block is the markup a crawler without JavaScript sees; on a
 * JavaScript shell it is often the only copy of the article. Combine the
 * blocks, then run the same candidate scorer the markup path uses so class
 * names and paragraph structure still count.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {Array<{ title: string, byline: string, published: string, markdown: string, source: string }>}
 */
function readerNoscriptCandidates(html, pageUrl) {
  const blocks = [...html.matchAll(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi)].map((match) => match[1]);
  if (!blocks.length) return [];
  const combined = blocks.join("\n");
  if (!validReaderText(cleanText(stripTags(combined)))) return [];
  const candidate = bestReaderContentCandidate(combined) || combined;
  const markdown = htmlToReaderMarkdown(candidate, { baseUrl: pageUrl });
  if (!markdown || !validReaderText(markdown)) return [];
  return [{ title: "", byline: "", published: "", markdown, source: "noscript" }];
}

/**
 * The Reader's answer to an embedded-data page. Collects candidates from
 * JSON-LD, framework hydration payloads, and <noscript>, then returns the
 * LONGEST one whose plain text survives validation. Longest wins because a
 * long string is almost always the article while a short one is a teaser or a
 * meta description.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {{ title: string, byline: string, published: string, markdown: string, source: string } | null}
 */
function readerEmbeddedArticle(html, pageUrl) {
  const candidates = [
    ...readerJsonLdCandidates(html, pageUrl),
    ...readerFrameworkCandidates(html, pageUrl),
    ...readerNoscriptCandidates(html, pageUrl),
  ];
  let best = null;
  let bestLength = -1;
  for (const candidate of candidates) {
    const text = cleanText(decodeHtml(candidate.markdown));
    if (!validReaderText(text)) continue;
    const length = substantialReaderTextLength(text);
    if (length > bestLength) {
      best = candidate;
      bestLength = length;
    }
  }
  return best;
}

/**
 * Absolute HTTPS address of the page's AMP twin, or null. The route uses this
 * later to try the lighter representation when the main page is a shell.
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {string | null}
 */
function readerAmpUrl(html, pageUrl) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel=["']?amphtml["']?/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]?.trim();
    if (!href) continue;
    try {
      const absolute = new URL(decodeHtml(href), pageUrl || undefined);
      if (absolute.protocol === "https:") return absolute.href;
    } catch {
      // Keep looking: one malformed link should not hide a later good one.
    }
  }
  return null;
}

// =============================================================================
// Content candidate scoring
// =============================================================================

/**
 * @param {string} tag
 * @param {RegExp[]} patterns
 * @returns {boolean}
 */
function openingTagHasClassOrId(tag, patterns) {
  const values = [...tag.matchAll(/\b(?:class|id)=["']([^"']+)["']/gi)]
    .map((match) => decodeHtml(match[1]).toLowerCase());
  return values.some((value) => patterns.some((pattern) => pattern.test(value)));
}

/**
 * Concatenate the class / id / role / aria-label values from a tag's
 * attributes into a single lower-case string used by the pattern
 * weight scorer.
 *
 * @param {unknown} tag
 * @returns {string}
 */
function readerAttributeText(tag) {
  return [...String(tag || "").matchAll(/\b(?:class|id|role|aria-label)=["']([^"']+)["']/gi)]
    .map((match) => decodeHtml(match[1]).toLowerCase())
    .join(" ");
}

/**
 * @param {string} value
 * @param {Array<[RegExp, number]>} weightedPatterns
 * @returns {number}
 */
function readerPatternWeight(value, weightedPatterns) {
  return weightedPatterns.reduce((score, [pattern, weight]) => (
    pattern.test(value) ? score + weight : score
  ), 0);
}

/**
 * Slice the inner HTML of an element whose opening tag starts at
 * `startIndex`. Handles nesting by counting open/close tag depth.
 *
 * @param {string} html
 * @param {number} startIndex
 * @param {string} tagName
 * @returns {string}
 */
function extractBalancedElementInner(html, startIndex, tagName) {
  const openEnd = html.indexOf(">", startIndex);
  if (openEnd < 0) return "";
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = startIndex;
  let depth = 0;
  /** @type {RegExpExecArray | null} */
  let match;
  while ((match = tagPattern.exec(html))) {
    const isClose = /^<\//.test(match[0]);
    if (isClose) {
      depth -= 1;
      if (depth === 0) return html.slice(openEnd + 1, match.index);
    } else {
      depth += 1;
    }
  }
  return "";
}

/**
 * @param {string} html
 * @param {string} tagName
 * @param {{ patterns?: RegExp[] | null, priority?: number }} [options]
 * @returns {Array<{ html: string, attrs: string, tagName: string, priority: number }>}
 */
function elementInnerHtmlByTag(html, tagName, { patterns = null, priority = 0 } = {}) {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  /** @type {Array<{ html: string, attrs: string, tagName: string, priority: number }>} */
  const candidates = [];
  /** @type {RegExpExecArray | null} */
  let match;
  while ((match = tagPattern.exec(html))) {
    const attrs = readerAttributeText(match[0]);
    if (patterns && !openingTagHasClassOrId(match[0], patterns)) continue;
    const inner = extractBalancedElementInner(html, match.index, tagName);
    if (inner) candidates.push({ html: inner, attrs, tagName, priority });
  }
  return candidates;
}

/**
 * Walk candidate `<article>`, `<main>`, `<section>`, `<div>` blocks
 * with strong / broad class-name patterns, score them by a mix of
 * content length, paragraph count, punctuation, positive class
 * weights, and negative class weights, and return the best-scoring
 * candidate's HTML.
 *
 * @param {string} html
 * @returns {string}
 */
function bestReaderContentCandidate(html) {
  const strongPatterns = [
    /\bpost-body\b/,
    /\bentry-content\b/,
    /\barticle-body\b/,
    /\barticle-content\b/,
    /\bstory-body\b/,
    /\bpost-content\b/,
    /\bpost-entry\b/,
    /\bposttext\b/,
  ];
  const broadPatterns = [
    /\bbody\b/,
    /\bmain\b/,
    /\bcontent\b/,
    /\bpost\b/,
    /\bhentry\b/,
    /\barticle\b/,
  ];
  /** @type {Array<[RegExp, number]>} */
  const positiveWeights = [
    [/\b(article|body|content|entry|hentry|main|page|post|story|text)\b/, 3],
    [/\b(blog|column|essay|news|report)\b/, 1],
  ];
  /** @type {Array<[RegExp, number]>} */
  const negativeWeights = [
    [/\b(ad|advert|banner|cookie|comment|combx|contact|footer|header|modal|nav|outbrain|promo|related|remark|reply|share|sidebar|social|sponsor|subscribe|tag|widget)\b/, 5],
    [/\b(author|bio|breadcrumb|byline|caption|credit|meta|newsletter|popular|recommend|tools?)\b/, 3],
  ];
  const candidates = [
    ...elementInnerHtmlByTag(html, "article", { priority: 4 }),
    ...elementInnerHtmlByTag(html, "main", { priority: 3 }),
    ...elementInnerHtmlByTag(html, "section", { patterns: strongPatterns, priority: 3 }),
    ...elementInnerHtmlByTag(html, "div", { patterns: strongPatterns, priority: 3 }),
    ...elementInnerHtmlByTag(html, "section", { patterns: broadPatterns, priority: 1 }),
    ...elementInnerHtmlByTag(html, "div", { patterns: broadPatterns, priority: 0 }),
  ];

  return candidates
    .map((candidate) => {
      const text = cleanText(stripTags(candidate.html));
      const comparableText = normalizeReaderComparable(text);
      const linkTextLength = normalizeReaderComparable(
        [...candidate.html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => stripTags(match[1])).join(" ")
      ).length;
      const paragraphCount = [...candidate.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((match) => normalizeReaderComparable(stripTags(match[1])).length)
        .filter((length) => length >= 40).length;
      const punctuationCount = (text.match(/[。！？；，、,.!?;:]/g) || []).length;
      const positiveWeight = readerPatternWeight(candidate.attrs, positiveWeights);
      const negativeWeight = readerPatternWeight(candidate.attrs, negativeWeights);
      const textLength = comparableText.length;
      const linkDensity = textLength ? linkTextLength / textLength : 1;

      return {
        ...candidate,
        textLength,
        linkDensity,
        score:
          (candidate.priority * 180)
          + (positiveWeight * 120)
          + Math.min(textLength, 5000)
          + (paragraphCount * 180)
          + Math.min(punctuationCount * 18, 900)
          - Math.round(linkDensity * Math.max(textLength, 400) * 1.8)
          - (negativeWeight * 260),
      };
    })
    .filter((candidate) =>
      candidate.textLength >= (candidate.priority >= 3 ? 80 : 160)
      && candidate.linkDensity < 0.62
      && candidate.score > 0
    )
    .sort((a, b) => b.score - a.score)[0]?.html || "";
}

// =============================================================================
// Markdown / boilerplate
// =============================================================================

/**
 * Drop blocks that look like UI chrome, dedupe the title and
 * description, and trim dateline / end-matter regions.
 *
 * @param {string} markdown
 * @param {{ title?: string, description?: string }} [context]
 * @returns {string}
 */
function stripReaderBoilerplate(markdown, { title = "", description = "" } = {}) {
  const titleKey = normalizeReaderComparable(title);
  const descriptionKey = normalizeReaderComparable(description);
  const seen = new Set();
  const boilerplateBlockPatterns = [
    /^(advertisement|advertising|cookies?|privacy policy|terms of use)$/i,
    /^(continue reading|keep reading|read also|read more|related|related articles?|recommended|more from)/i,
    /^(share|share this|share article|copy link|copied|listen to article)$/i,
    /^(sign up|subscribe|newsletter|follow us|support independent|download app)/i,
    /^(all rights reserved|copyright|©)/i,
  ];
  let blocks = cleanText(markdown)
    .split(/\n{2,}/)
    .map((block) => cleanText(block))
    .filter(Boolean)
    .filter((block) => {
      if (isReaderFigureBlock(block)) return true;
      const plain = block.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").trim();
      const key = normalizeReaderComparable(plain);
      if (!key || key === titleKey || key === descriptionKey) return false;
      if (/^[-*+•]+$/.test(plain)) return false;
      if (boilerplateBlockPatterns.some((pattern) => pattern.test(plain))) return false;
      if (/^(press release|news release|share article|download image)$/i.test(plain)) return false;
      if (/^(opens in a new window|copy text|close|read more)$/i.test(plain)) return false;
      if (/^(home|menu|search|sections?|topics?|latest|popular|trending)$/i.test(plain)) return false;
      if (/^(facebook|twitter|x|linkedin|whatsapp|email|print)$/i.test(plain)) return false;
      if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(plain)) return false;
      if (/^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(plain)) return false;
      if (key.length > 36 && seen.has(key)) return false;
      if (key.length > 36) seen.add(key);
      return true;
    });

  const datelineIndex = blocks.findIndex((block) =>
    /^[A-Z][A-Z\s.,-]{5,}\s+[A-Z][a-z]/.test(block.replace(/^#{1,6}\s+/, ""))
  );
  if (datelineIndex > 0) blocks = blocks.slice(datelineIndex);
  const endMatterIndex = blocks.findIndex((block) =>
    /^#{2,6}\s*(media|about|press contacts?|contact|images?|downloads?)$/i.test(block)
    || /^[-*+]\s*text of this article\b/i.test(block)
  );
  if (endMatterIndex > 0) blocks = blocks.slice(0, endMatterIndex);

  // These two loops shave short opening and closing blocks. A figure is short
  // by nature, so it stops the trim rather than being eaten by it.
  while (blocks.length > 1) {
    const plain = blocks[0].replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").trim();
    const bodyLength = normalizeReaderComparable(plain).length;
    if (isReaderFigureBlock(blocks[0]) || bodyLength >= 24 || /[。！？.!?]/.test(plain)) break;
    blocks.shift();
  }

  while (blocks.length > 1) {
    const last = blocks[blocks.length - 1];
    const plain = last.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").trim();
    const bodyLength = normalizeReaderComparable(plain).length;
    if (isReaderFigureBlock(last) || bodyLength >= 24 || /[。！？.!?]/.test(plain)) break;
    blocks.pop();
  }

  return blocks.join("\n\n");
}

// A clipped page keeps its figures, but a page is not a gallery: past a
// dozen, what arrives is furniture rather than evidence.
const READER_MAX_FIGURES = 12;
// The cloud vision route refuses a longer address, so a link that could never
// be read is not worth carrying.
const READER_MAX_IMAGE_URL_LENGTH = 8192;
const READER_TRACKING_PIXEL_PATTERN = /(^|[/_-])(1x1|pixel|spacer|blank|beacon|tracker)([._-]|$)/i;

/**
 * @param {string} fragment
 * @returns {string}
 */
function readerImageSource(fragment) {
  const direct = fragment.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1]
    || fragment.match(/\sdata-src\s*=\s*["']([^"']+)["']/i)?.[1]
    || "";
  if (direct) return direct.trim();
  // A responsive set lists "url width" pairs; the first entry is enough,
  // because the model rescales whatever it is given anyway.
  const srcset = fragment.match(/\s(?:data-)?srcset\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  return srcset.split(",")[0]?.trim().split(/\s+/)[0] || "";
}

/**
 * Turn one figure, picture, or image element into Markdown the writer can see
 * and the vision route can read. Returns "" for anything not worth keeping.
 *
 * @param {string} fragment
 * @param {string} [baseUrl]
 * @returns {string}
 */
function readerFigureMarkdown(fragment, baseUrl = "") {
  const source = readerImageSource(fragment);
  // An inline data URI is a sprite or an icon, never the article's evidence.
  if (!source || /^data:/i.test(source)) return "";

  let absolute;
  try {
    absolute = new URL(source, baseUrl || undefined).toString();
  } catch {
    return "";
  }
  if (!/^https:\/\//i.test(absolute)) return "";
  if (absolute.length > READER_MAX_IMAGE_URL_LENGTH) return "";
  if (READER_TRACKING_PIXEL_PATTERN.test(absolute)) return "";

  // Publishers mark counting pixels with explicit 1x1 geometry.
  const width = Number(fragment.match(/\swidth\s*=\s*["']?(\d+)/i)?.[1] || 0);
  const height = Number(fragment.match(/\sheight\s*=\s*["']?(\d+)/i)?.[1] || 0);
  if (width && height && width <= 2 && height <= 2) return "";

  const caption = cleanText(stripTags(
    fragment.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || ""
  ));
  const alt = cleanText(fragment.match(/\salt\s*=\s*["']([^"']*)["']/i)?.[1] || "");
  const label = (caption || alt).replace(/[\[\]\n\r]/g, " ").replace(/\s+/g, " ").trim();
  return `![${label}](${absolute})`;
}

/**
 * A kept figure is one Markdown line with no sentence punctuation, which is
 * exactly the shape stripReaderBoilerplate prunes. It has to be told.
 *
 * @param {string} block
 * @returns {boolean}
 */
function isReaderFigureBlock(block) {
  return /^!\[[^\]]*\]\(https:\/\/\S+\)$/.test(String(block || "").trim());
}

/**
 * Convert an HTML fragment into the reader's flavor of Markdown,
 * then run it through stripReaderBoilerplate. Mirrors
 * `htmlToReaderMarkdown`.
 *
 * @param {string} html
 * @param {{ title?: string, description?: string, baseUrl?: string }} [context]
 * @returns {string}
 */
function htmlToReaderMarkdown(html, context = {}) {
  let figureBudget = READER_MAX_FIGURES;
  const keepFigure = (fragment) => {
    if (figureBudget <= 0) return "\n\n";
    const markdown = readerFigureMarkdown(fragment, context.baseUrl);
    if (!markdown) return "\n\n";
    figureBudget -= 1;
    return `\n\n${markdown}\n\n`;
  };

  const withoutChrome = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    // A clipped article's chart or diagram is often the evidence itself, so a
    // figure becomes a Markdown image instead of being deleted. Only the
    // address travels; the bytes stay where the publisher put them.
    .replace(/<figure\b[^<]*(?:(?!<\/figure>)<[^<]*)*<\/figure>/gi, keepFigure)
    .replace(/<picture\b[^<]*(?:(?!<\/picture>)<[^<]*)*<\/picture>/gi, keepFigure)
    .replace(/<img\b[^>]*>/gi, keepFigure)
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
    .replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, "");

  const articleCandidates = [...withoutChrome.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)]
    .map((match) => match[1]);
  const bodyMatch = withoutChrome.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = articleCandidates.sort((a, b) => b.length - a.length)[0] || bodyMatch?.[1] || withoutChrome;

  const markdown = bodyContent
    .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, content) => {
      const level = Math.min(Number(tag.slice(1)) + 1, 6);
      const text = stripTags(content);
      return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "\n\n";
    })
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => {
      const text = stripTags(content);
      return text ? `\n\n${text}\n\n` : "\n\n";
    })
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => {
      const text = stripTags(content);
      return text ? `\n\n- ${text}\n\n` : "\n\n";
    })
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");

  return stripReaderBoilerplate(markdown, context);
}

// =============================================================================
// Result validation
// =============================================================================

/**
 * Length of meaningful (alphanumeric + CJK) characters. Mirrors
 * `substantialReaderTextLength`.
 *
 * @param {string} text
 * @returns {number}
 */
function substantialReaderTextLength(text) {
  return cleanText(text).toLowerCase().replace(READER_SUBSTANTIAL_CHAR, "").length;
}

/**
 * Drop pages that look like JavaScript-app loading screens or that
 * have negligible substantial text.
 *
 * @param {string} text
 * @returns {boolean}
 */
function validReaderText(text) {
  const looksLikeScriptShell =
    /you need to enable javascript to run this app/i.test(text)
    || /please enable javascript/i.test(text)
    // A <noscript> notice is not the page: "This page requires JavaScript",
    // "turn on JavaScript", "请启用 JavaScript". Read it as the shell it is, so
    // the page goes to a rung that runs its scripts.
    || (substantialReaderTextLength(text) < 600
      && /(requires? javascript|turn on javascript|javascript (is )?(disabled|required|must be enabled)|enable javascript in your browser|(启用|开启|打开|需要)\s*javascript)/i.test(text));
  return !looksLikeScriptShell && substantialReaderTextLength(text) >= 80;
}

// =============================================================================
// External extractor
// =============================================================================

/**
 * Cached dynamic import promise for @extractus/article-extractor.
 * Same lazy-load pattern as root server.js.
 *
 * @type {Promise<any> | null}
 */
let articleExtractorPromise = null;

/**
 * @returns {Promise<any>}
 */
function loadArticleExtractor() {
  articleExtractorPromise ||= import("@extractus/article-extractor");
  return articleExtractorPromise;
}

/**
 * Run the @extractus/article-extractor on `html`. Returns null on
 * any failure so the caller falls back to the in-tree heuristic
 * pipeline.
 *
 * @param {string} html
 * @param {string} url
 * @param {{ title?: string, description?: string, author?: string, date?: string }} [fallback]
 * @returns {Promise<{
 *   title: string, url: string, site: string, author: string,
 *   date: string, text: string,
 * } | null>}
 */
async function extractWithArticleExtractor(html, url, fallback = {}) {
  try {
    const { extractFromHtml } = await loadArticleExtractor();
    const article = await extractFromHtml(html, url, {
      contentLengthThreshold: 80,
    });
    if (!article?.content) return null;

    const title = cleanText(article.title || fallback.title || "Untitled Page");
    const description = cleanText(article.description || fallback.description || "");
    const text = stripReaderBoilerplate(
      cleanText(decodeHtml(htmlToReaderMarkdown(article.content, { title, description, baseUrl: article.url || url }))),
      { title, description }
    );
    if (!validReaderText(text)) return null;
    return {
      title,
      url: article.url || url,
      site: article.source || siteFromUrl(url),
      author: cleanText(article.author || fallback.author || ""),
      date: cleanText(article.published || fallback.date || ""),
      text,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Top-level orchestration
// =============================================================================

/**
 * Reduce a fetched HTML page into the reader's article shape.
 * Mirrors `cleanHtmlForReader`.
 *
 * @param {string} html
 * @param {string} url
 * @returns {Promise<{
 *   title: string, url: string, site: string, author: string,
 *   date: string, text: string, extractionPath: string,
 * }>}
 */
async function cleanHtmlForReader(html, url) {
  // Remove heavy elements
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, "");

  // Try to find main content
  const titleMatch = cleaned.match(/<title>([\s\S]*?)<\/title>/i);
  const title =
    metaContent(cleaned, "og:title") ||
    metaContent(cleaned, "twitter:title") ||
    (titleMatch ? stripTags(titleMatch[1]) : "Untitled Page");
  const description =
    metaContent(cleaned, "description") ||
    metaContent(cleaned, "og:description") ||
    metaContent(cleaned, "twitter:description") ||
    "";
  const author =
    metaContent(cleaned, "author") ||
    metaContent(cleaned, "article:author") ||
    "";
  const date =
    metaContent(cleaned, "article:published_time") ||
    metaContent(cleaned, "date") ||
    metaContent(cleaned, "pubdate") ||
    "";

  // Run all three ladders, then let the longest valid text win. A page can
  // return a short teaser from the extractor and a full body from JSON-LD (or
  // the reverse); picking the longest is what turns a part article into a
  // whole one. Ties keep the earlier ladder.
  const extracted = await extractWithArticleExtractor(html, url, { title, description, author, date });

  // Heuristic markup path.
  let bodyContent = "";
  const articleMatch = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const candidate = bestReaderContentCandidate(cleaned);
  if (candidate) {
    bodyContent = candidate;
  } else if (articleMatch) {
    bodyContent = articleMatch[1];
  } else {
    const bodyMatch = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    bodyContent = bodyMatch ? bodyMatch[1] : cleaned;
  }
  const heuristicText = cleanText(decodeHtml(htmlToReaderMarkdown(bodyContent, { title, description, baseUrl: url })));

  // Embedded-data path: JSON-LD, hydration payloads, and <noscript>.
  const embedded = readerEmbeddedArticle(html, url);
  const embeddedText = embedded ? cleanText(decodeHtml(embedded.markdown)) : "";

  /** @type {Array<{ path: string, text: string }>} */
  const winners = [];
  if (extracted) winners.push({ path: "article-extractor", text: extracted.text });
  if (embedded && validReaderText(embeddedText)) winners.push({ path: embedded.source, text: embeddedText });
  if (validReaderText(heuristicText)) winners.push({ path: "heuristic", text: heuristicText });

  if (!winners.length) {
    throw new Error("Reader could not extract readable article text. If this page is a JavaScript app, import a saved webarchive or document instead.");
  }

  // The extractor's article is the cleanest when it has one. Data the page
  // embeds replaces it only when it is clearly the fuller text (a JavaScript
  // app whose markup holds a teaser); the heuristic scrape, which counts menus
  // and footers in its length, is the last resort and never outbids either.
  const extractorEntry = winners.find((entry) => entry.path === "article-extractor");
  const embeddedEntry = winners.find((entry) => entry.path !== "article-extractor" && entry.path !== "heuristic");
  let winner = extractorEntry || embeddedEntry || winners[0];
  if (extractorEntry && embeddedEntry
    && substantialReaderTextLength(embeddedEntry.text) > substantialReaderTextLength(extractorEntry.text) * 1.2) {
    winner = embeddedEntry;
  }
  // A page that is not one article (a portal's front page) gives the
  // extractor a caption or two; the scrape of the whole page is then the
  // better reading, menus and all.
  const heuristicEntry = winners.find((entry) => entry.path === "heuristic");
  const winnerLength = substantialReaderTextLength(winner.text);
  if (heuristicEntry && winner !== heuristicEntry && winnerLength < 400
    && substantialReaderTextLength(heuristicEntry.text) > winnerLength * 3) {
    winner = heuristicEntry;
  }

  if (winner.path === "article-extractor") {
    return { ...extracted, extractionPath: "article-extractor" };
  }
  if (winner.path !== "heuristic") {
    return {
      title: embedded.title || title,
      url,
      site: siteFromUrl(url),
      author: embedded.byline || author,
      date: embedded.published || date,
      text: winner.text,
      extractionPath: embedded.source,
    };
  }
  return {
    title,
    url,
    site: siteFromUrl(url),
    author,
    date,
    text: winner.text,
    extractionPath: "heuristic",
  };
}

/**
 * Translate low-level error messages into reader-facing strings.
 * Mirrors `friendlyReaderError`.
 *
 * @param {unknown} error
 * @returns {string}
 */
function friendlyReaderError(error) {
  const message = String(/** @type {any} */ (error)?.message || "");
  if (/^Reader |^Upstream returned|^Invalid redirect/i.test(message)) {
    return message;
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|network/i.test(message)) {
    return "Reader could not reach that page. Check the URL or try again later.";
  }
  if (/abort/i.test(/** @type {any} */ (error)?.name) || /abort/i.test(message)) {
    return "Reader timed out while opening that page.";
  }
  return message || "Reader could not open that page.";
}

module.exports = {
  READER_MAX_BYTES,
  READER_TIMEOUT_MS,
  readerFetchUrl,
  readerArticleFromJinaMarkdown,
  isPrivateAddress,
  resolveReaderTarget,
  validateReaderTarget,
  metaContent,
  normalizeReaderComparable,
  readerJsonLdArticleBody,
  readerEmbeddedArticle,
  readerAmpUrl,
  bestReaderContentCandidate,
  stripReaderBoilerplate,
  htmlToReaderMarkdown,
  READER_MAX_FIGURES,
  isReaderFigureBlock,
  readerFigureMarkdown,
  readerImageSource,
  substantialReaderTextLength,
  validReaderText,
  cleanHtmlForReader,
  friendlyReaderError,
};
