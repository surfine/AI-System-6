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
      (a === 192 && b === 0) ||
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
 * Validate that `value` is an http(s) URL targeting a public host.
 * Rejects localhost / private IPs / private DNS results. Returns the
 * canonical URL string. Mirrors `validateReaderTarget`.
 *
 * @param {string} value
 * @returns {Promise<string>}
 */
async function validateReaderTarget(value) {
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Reader accepts only valid URLs.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Reader accepts only http or https URLs.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(hostname) || hostname.endsWith(".localhost")) {
    throw new Error("Reader cannot open local machine addresses.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Reader cannot open private network addresses.");
    }
    return parsed.href;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.every((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Reader cannot open private network addresses.");
  }

  return parsed.href;
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
  return cleanText(value)
    .toLowerCase()
    .replace(/[\W_]+/g, "");
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

  while (blocks.length > 1) {
    const plain = blocks[0].replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").trim();
    const bodyLength = normalizeReaderComparable(plain).length;
    if (bodyLength >= 24 || /[。！？.!?]/.test(plain)) break;
    blocks.shift();
  }

  while (blocks.length > 1) {
    const plain = blocks[blocks.length - 1].replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").trim();
    const bodyLength = normalizeReaderComparable(plain).length;
    if (bodyLength >= 24 || /[。！？.!?]/.test(plain)) break;
    blocks.pop();
  }

  return blocks.join("\n\n");
}

/**
 * Convert an HTML fragment into the reader's flavor of Markdown,
 * then run it through stripReaderBoilerplate. Mirrors
 * `htmlToReaderMarkdown`.
 *
 * @param {string} html
 * @param {{ title?: string, description?: string }} [context]
 * @returns {string}
 */
function htmlToReaderMarkdown(html, context = {}) {
  const withoutChrome = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<picture\b[^<]*(?:(?!<\/picture>)<[^<]*)*<\/picture>/gi, "")
    .replace(/<figure\b[^<]*(?:(?!<\/figure>)<[^<]*)*<\/figure>/gi, "")
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
    || /please enable javascript/i.test(text);
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
      cleanText(decodeHtml(htmlToReaderMarkdown(article.content, { title, description }))),
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
 *   date: string, text: string,
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

  const extracted = await extractWithArticleExtractor(html, url, { title, description, author, date });
  if (extracted) return extracted;

  // Simple body extraction - look for semantic article/post containers before falling back to <body>.
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

  const jsonLdText = stripReaderBoilerplate(readerJsonLdArticleBody(html), { title, description });
  let text = jsonLdText || htmlToReaderMarkdown(bodyContent, { title, description });
  text = cleanText(decodeHtml(text));

  if (!validReaderText(text)) {
    throw new Error("Reader could not extract readable article text. If this page is a JavaScript app, import a saved webarchive or document instead.");
  }

  return {
    title,
    url,
    site: siteFromUrl(url),
    author,
    date,
    text,
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
  if (/abort/i.test(/** @type {any} */ (error)?.name || message)) {
    return "Reader timed out while opening that page.";
  }
  return message || "Reader could not open that page.";
}

module.exports = {
  READER_MAX_BYTES,
  READER_TIMEOUT_MS,
  isPrivateAddress,
  validateReaderTarget,
  metaContent,
  normalizeReaderComparable,
  readerJsonLdArticleBody,
  bestReaderContentCandidate,
  stripReaderBoilerplate,
  htmlToReaderMarkdown,
  substantialReaderTextLength,
  validReaderText,
  cleanHtmlForReader,
  friendlyReaderError,
};
