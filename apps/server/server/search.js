// Search subsystem: DuckDuckGo HTML and Bing (RSS + HTML) providers,
// redirect unwrapping, result normalization, and the per-attempt /
// per-provider race driver. Mirrors the search section of root
// server.js (decodeBase64Url through fetchSearchResults).
//
// Behavior parity preserved exactly:
// - Providers tried in order: DuckDuckGo HTML -> Bing
//   (RSS first, then HTML) when provider=auto OR =duckduckgo.
// - Bing-only and DuckDuckGo-only modes skip the cross-provider
//   fallback.
// - Per-attempt timeout via withTimeoutSignal; default
//   AI_SYSTEM6_SEARCH_TIMEOUT_MS or 8000 ms (floored at 3000).
// - Results capped at the requested limit (3 <= limit <= 8).
// - The runSearchProvider race returns the first successful attempt
//   and discards in-flight ones (Promise.race + active-set
//   bookkeeping).

"use strict";

const { decodeHtml, stripTags, cleanText } = require("./lib/text.js");
const { getTextWithFallback } = require("./lib/fetch.js");
const { withTimeoutSignal } = require("./lib/http.js");
const { siteFromUrl } = require("./lib/url.js");

/**
 * Per-attempt timeout. Mirrors `searchTimeoutMs` from root.
 */
const SEARCH_TIMEOUT_MS = Math.max(3000, Number(process.env.AI_SYSTEM6_SEARCH_TIMEOUT_MS || 8000));

/**
 * Supported provider keys (lower case). Anything else normalizes
 * back to "auto".
 *
 * @type {readonly string[]}
 */
const SEARCH_PROVIDERS = Object.freeze(["duckduckgo", "bing"]);

/**
 * Decode a base64url-encoded string. Returns "" on failure.
 *
 * @param {unknown} value
 * @returns {string}
 */
function decodeBase64Url(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Recover the actual destination URL from a Bing /ck/a click-tracking
 * redirect. Returns "" if `parsed` is not a Bing redirect we know.
 *
 * @param {URL} parsed
 * @returns {string}
 */
function unwrapBingRedirect(parsed) {
  if (!/(\.|^)bing\.com$/i.test(parsed.hostname) || !/^\/ck\/a/i.test(parsed.pathname)) {
    return "";
  }

  const encodedUrl = parsed.searchParams.get("u");
  if (!encodedUrl) return "";

  const candidates = [
    encodedUrl,
    encodedUrl.replace(/^a1/i, ""),
    decodeBase64Url(encodedUrl),
    decodeBase64Url(encodedUrl.replace(/^a1/i, "")),
  ];

  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return "";
}

/**
 * Recover the actual destination URL from a DuckDuckGo `/l/?uddg=...`
 * redirect. Returns "" if `parsed` is not a DDG URL.
 *
 * @param {URL} parsed
 * @returns {string}
 */
function unwrapDuckDuckGoRedirect(parsed) {
  if (!/(\.|^)duckduckgo\.com$/i.test(parsed.hostname)) {
    return "";
  }

  const encodedUrl = parsed.searchParams.get("uddg");
  if (!encodedUrl) return "";

  try {
    return decodeURIComponent(encodedUrl);
  } catch {
    return encodedUrl;
  }
}

/**
 * Parse, optionally unwrap provider-specific redirects, and re-serialize
 * a URL string. Recursive in the unwrap step to handle chained
 * redirects. Returns "" for unparseable input.
 *
 * @param {unknown} value
 * @param {string} [baseUrl]
 * @returns {string}
 */
function cleanSearchUrl(value, baseUrl = "") {
  try {
    const url = new URL(decodeHtml(value), baseUrl || undefined);
    const unwrapped = unwrapDuckDuckGoRedirect(url) || unwrapBingRedirect(url);
    if (unwrapped) return cleanSearchUrl(unwrapped);
    return url.href;
  } catch {
    return "";
  }
}

/**
 * Flatten DuckDuckGo's nested RelatedTopics tree into a single list.
 *
 * @param {any[]} topics
 * @param {any[]} [output]
 * @returns {any[]}
 */
function flattenDuckDuckGoRelatedTopics(topics, output = []) {
  for (const topic of Array.isArray(topics) ? topics : []) {
    if (topic?.FirstURL && topic?.Text) {
      output.push(topic);
    }
    if (Array.isArray(topic?.Topics)) {
      flattenDuckDuckGoRelatedTopics(topic.Topics, output);
    }
  }
  return output;
}

/**
 * @typedef {{ title: string, url: string, site: string, snippet: string }} SearchResult
 */

/**
 * Parse a DuckDuckGo Instant Answer API response into our search
 * result shape. Mirrors `parseDuckDuckGoApiResults`.
 *
 * @param {string} text
 * @param {number} limit
 * @returns {SearchResult[]}
 */
function parseDuckDuckGoApiResults(text, limit) {
  /** @type {any} */
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return [];
  }

  /** @type {SearchResult[]} */
  const results = [];
  const seen = new Set();
  /** @type {{ url: string, title: string, snippet: string }[]} */
  const candidates = [];
  const heading = cleanText(payload.Heading || payload.AbstractSource || "");
  const abstractUrl = payload.AbstractURL || "";
  const definitionUrl = payload.DefinitionURL || abstractUrl;

  if (abstractUrl && (heading || payload.AbstractText || payload.Abstract)) {
    candidates.push({
      url: abstractUrl,
      title: heading || payload.AbstractURL,
      snippet: payload.AbstractText || payload.Abstract || "",
    });
  }

  if (definitionUrl && payload.Definition) {
    candidates.push({
      url: definitionUrl,
      title: heading ? `Definition: ${heading}` : "Definition",
      snippet: payload.Definition,
    });
  }

  if (abstractUrl && payload.Answer) {
    candidates.push({
      url: abstractUrl,
      title: heading ? `Answer: ${heading}` : "Answer",
      snippet: payload.Answer,
    });
  }

  (Array.isArray(payload.Results) ? payload.Results : []).forEach((/** @type {any} */ result) => {
    if (result?.FirstURL && result?.Text) {
      candidates.push({
        url: result.FirstURL,
        title: result.Text.split(" - ")[0] || result.FirstURL,
        snippet: result.Text,
      });
    }
  });

  flattenDuckDuckGoRelatedTopics(payload.RelatedTopics).forEach((topic) => {
    candidates.push({
      url: topic.FirstURL,
      title: topic.Text.split(" - ")[0] || topic.FirstURL,
      snippet: topic.Text,
    });
  });

  for (const candidate of candidates) {
    if (results.length >= limit) break;
    const url = cleanSearchUrl(candidate.url);
    const title = cleanText(candidate.title);
    const snippet = cleanText(candidate.snippet).slice(0, 320);
    if (!/^https?:\/\//i.test(url) || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title,
      url,
      site: siteFromUrl(url),
      snippet,
    });
  }

  return results;
}

/**
 * Parse DuckDuckGo's HTML result page. Its Instant Answer API returns
 * knowledge-card and related-topic data rather than normal web results, so it
 * can be sparse or unrelated to the search query.
 *
 * @param {string} html
 * @param {number} limit
 * @returns {SearchResult[]}
 */
function parseDuckDuckGoHtmlResults(html, limit) {
  /** @type {SearchResult[]} */
  const results = [];
  const seen = new Set();
  const blocks = String(html || "").split("result__body");

  for (const block of blocks.slice(1)) {
    if (results.length >= limit) break;
    const linkMatch = block.match(/<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/<(?:a|div)\b[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    const url = cleanSearchUrl(linkMatch[1], "https://html.duckduckgo.com");
    const title = stripTags(linkMatch[2]);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]).slice(0, 320) : "";
    if (!/^https?:\/\//i.test(url) || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, site: siteFromUrl(url), snippet });
  }

  return results;
}

/**
 * Parse Jina Reader's Markdown rendering of a DuckDuckGo result page. Jina is
 * only tried after direct public providers fail, so normal traffic does not
 * depend on it; it gives Searcher a browser-grade, no-key fallback when those
 * providers start serving bot challenges or corrupt result sets.
 *
 * @param {string} markdown
 * @param {number} limit
 * @returns {SearchResult[]}
 */
function parseJinaSearchResults(markdown, limit) {
  /** @type {SearchResult[]} */
  const results = [];
  const seen = new Set();
  const sections = String(markdown || "").split(/\n##\s+/);
  for (const section of sections.slice(1)) {
    if (results.length >= limit) break;
    const heading = section.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (!heading) continue;
    const url = cleanSearchUrl(heading[2]);
    const title = cleanText(heading[1]);
    const links = [...section.matchAll(/\[([^\]]+)\]\((https?:[^)]+)\)/g)]
      .map((match) => cleanText(match[1]))
      .filter((text) => text.length >= 12 && text !== title && !/^image\s+\d+$/i.test(text) && !/^[\w.-]+(?:\/|$)/i.test(text));
    const snippet = (links[0] || "").slice(0, 320);
    if (!/^https?:\/\//i.test(url) || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, site: siteFromUrl(url), snippet });
  }
  return results;
}

/**
 * Parse a Bing HTML search response.
 *
 * @param {string} html
 * @param {number} limit
 * @returns {SearchResult[]}
 */
function parseBingResults(html, limit) {
  /** @type {SearchResult[]} */
  const results = [];
  const seen = new Set();
  const blocks = html.split(/<li\b[^>]+class="[^"]*\bb_algo\b[^"]*"[^>]*>/i);
  blocks.shift();

  for (const block of blocks) {
    if (results.length >= limit) break;
    const linkMatch = block.match(/<h2\b[^>]*>\s*<a\b[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i)
      || block.match(/<a\b[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const url = cleanSearchUrl(decodeHtml(linkMatch[1]), "https://www.bing.com");
    const title = stripTags(linkMatch[2]);
    const snippetMatch = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]).slice(0, 320) : "";

    if (!/^https?:\/\//i.test(url) || /bing\.com\/search/i.test(url) || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title,
      url,
      site: siteFromUrl(url),
      snippet,
    });
  }

  return results;
}

/**
 * Pull the inner text of a single XML / RSS tag, unwrapping CDATA.
 *
 * @param {string} block
 * @param {string} tag
 * @returns {string}
 */
function readXmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1")
    .trim();
}

/**
 * Parse a Bing RSS feed search response.
 *
 * @param {string} xml
 * @param {number} limit
 * @returns {SearchResult[]}
 */
function parseBingRssResults(xml, limit) {
  /** @type {SearchResult[]} */
  const results = [];
  const seen = new Set();
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];

  for (const item of items) {
    if (results.length >= limit) break;
    const block = item[1];
    const url = cleanSearchUrl(decodeHtml(readXmlTag(block, "link")));
    const title = stripTags(readXmlTag(block, "title"));
    const snippet = stripTags(readXmlTag(block, "description")).slice(0, 320);

    if (!/^https?:\/\//i.test(url) || /bing\.com\/(search|ck\/a)/i.test(url) || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title,
      url,
      site: siteFromUrl(url),
      snippet,
    });
  }

  return results;
}

/**
 * @param {string} provider
 * @returns {string}
 */
function searchProviderDisplayName(provider) {
  if (provider === "bing") return "Bing";
  if (provider === "duckduckgo") return "DuckDuckGo";
  return "the selected search engine";
}

/**
 * Map a low-level fetch error to a human-friendly per-provider
 * description.
 *
 * @param {any} error
 * @param {string} provider
 * @returns {string}
 */
function describeSearchFetchError(error, provider) {
  const providerName = searchProviderDisplayName(provider);
  const code = error?.cause?.code || error?.code || "";
  const message = error?.cause?.message || error?.message || "";
  if (/request aborted/i.test(message)) return `${providerName} request was aborted`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `Cannot resolve ${providerName}`;
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT") return `Cannot reach ${providerName}`;
  if (/certificate|tls|ssl/i.test(message)) return `${providerName} TLS connection failed`;
  if (/fetch failed/i.test(message)) return `Cannot reach ${providerName}`;
  return message || `Cannot reach ${providerName}`;
}

/**
 * @param {unknown} provider
 * @returns {string}
 */
function normalizeSearchProvider(provider) {
  const normalized = String(provider || "auto").toLowerCase();
  return normalized === "auto" || SEARCH_PROVIDERS.includes(normalized) ? normalized : "auto";
}

/**
 * Reject an upstream result when it contains none of the user's query terms.
 * This guards against provider/proxy responses that are syntactically valid
 * search pages but contain an unrelated result set.
 *
 * @param {string} query
 * @param {string} title
 * @param {string} snippet
 * @returns {boolean}
 */
function isSearchResultRelevant(query, title, snippet) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = `${title}\n${snippet}`.toLowerCase();
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  if (compactQuery.length >= 2 && haystack.replace(/\s+/g, "").includes(compactQuery)) return true;

  const cjkChars = [...new Set(normalizedQuery.match(/[\u4e00-\u9fff]/g) || [])];
  if (cjkChars.length) {
    const hits = cjkChars.filter((character) => haystack.includes(character)).length;
    if (hits >= Math.min(2, cjkChars.length)) return true;
  }

  const terms = [...new Set(normalizedQuery.match(/[a-z0-9][a-z0-9._-]{1,}/g) || [])];
  if (terms.length) {
    const hits = terms.filter((term) => haystack.includes(term)).length;
    if (hits >= Math.max(1, Math.ceil(terms.length / 2))) return true;
  }

  return false;
}

// Title meaningfulness regex. Built from a string literal with an
// explicit \u escape so editors do not silently re-encode the CJK
// range in a regex literal. Mirrors the inline /[A-Za-z0-9一-鿿]/
// from root server.js.
const MEANINGFUL_TITLE_CHAR = new RegExp("[A-Za-z0-9\\u4e00-\\u9fff]", "g");

/**
 * Final filter and de-noise pass over parsed results. Drops anything
 * lacking a proper http(s) URL, a meaningful title, or that points at
 * a search engine landing page.
 *
 * @param {unknown[]} results
 * @param {number} limit
 * @returns {SearchResult[]}
 */
function normalizeSearchResults(results, limit, query = "") {
  /** @type {SearchResult[]} */
  const output = [];
  const seen = new Set();
  for (const result of Array.isArray(results) ? results : []) {
    const anyResult = /** @type {any} */ (result);
    const url = cleanSearchUrl(anyResult?.url || "");
    const title = cleanText(anyResult?.title || "");
    const snippet = cleanText(anyResult?.snippet || "").slice(0, 320);
    const meaningfulTitleChars = (title.match(MEANINGFUL_TITLE_CHAR) || []).length;
    if (!/^https?:\/\//i.test(url) || meaningfulTitleChars < 2 || seen.has(url)) continue;
    if (/^https?:\/\/(?:www\.)?(?:bing|duckduckgo)\.com\/(?:search|html|lite|ck\/a|l\/|y\.js|\?)/i.test(url)) continue;
    if (!isSearchResultRelevant(query, title, snippet)) continue;
    seen.add(url);
    output.push({
      title,
      url,
      site: anyResult.site || siteFromUrl(url),
      snippet,
    });
    if (output.length >= limit) break;
  }
  return output;
}

/**
 * @typedef {Object} SearchAttempt
 * @property {string}                              label
 * @property {string}                              url
 * @property {(text: string, limit: number) => SearchResult[]} parse
 * @property {string}                              [accept]
 * @property {string}                              [acceptLanguage]
 * @property {string}                              [userAgent]
 * @property {string}                              [provider]
 * @property {number}                              [timeoutMs]
 */

/**
 * Build the list of HTTP attempts for a provider+query combination.
 *
 * @param {string} provider
 * @param {string} query
 * @param {number} limit
 * @param {number} start
 * @returns {SearchAttempt[]}
 */
function buildSearchAttempts(provider, query, limit, start) {
  const encodedQuery = encodeURIComponent(query);
  const firstResult = Math.max(1, start + 1);

  /** @type {Record<string, SearchAttempt[]>} */
  const attemptsByProvider = {
    duckduckgo: [
      {
        label: "DuckDuckGo web search",
        url: `https://html.duckduckgo.com/html/?q=${encodedQuery}&s=${start}`,
        parse: parseDuckDuckGoHtmlResults,
      },
    ],
    bing: [
      {
        label: "Bing RSS",
        url: `https://www.bing.com/search?format=rss&q=${encodedQuery}`,
        parse: parseBingRssResults,
      },
      {
        label: "Bing HTML",
        url: `https://www.bing.com/search?q=${encodedQuery}&first=${firstResult}`,
        parse: parseBingResults,
      },
    ],
    jina: [
      {
        label: "Jina Reader search fallback",
        url: `https://r.jina.ai/http://html.duckduckgo.com/html/?q=${encodedQuery}&s=${start}`,
        parse: parseJinaSearchResults,
        accept: "text/plain,*/*;q=0.8",
        userAgent: "AI-System-6/1.0",
      },
    ],
  };

  return (attemptsByProvider[provider] || []).map((attempt) => ({
    ...attempt,
    provider: attempt.provider || provider,
  }));
}

/**
 * Run a single attempt with its own timeout signal and parse the
 * result. Throws a descriptive Error on failure.
 *
 * @param {SearchAttempt} attempt
 * @param {number} limit
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{ provider: string, results: SearchResult[] }>}
 */
async function runSearchAttempt(attempt, limit, signal) {
  const headers = {
    "User-Agent": attempt.userAgent || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": attempt.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": attempt.acceptLanguage || "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };
  const attemptSignal = withTimeoutSignal(signal, attempt.timeoutMs || SEARCH_TIMEOUT_MS);
  try {
    const upstream = await getTextWithFallback(attempt.url, attemptSignal.signal, headers);
    if (!upstream.ok) throw new Error(`${attempt.label} returned ${upstream.status}`);
    const results = normalizeSearchResults(attempt.parse(upstream.text, limit), limit, new URL(attempt.url).searchParams.get("q") || "");
    if (!results.length) throw new Error(`${attempt.label} returned no readable results`);
    return { provider: /** @type {string} */ (attempt.provider), results };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (attemptSignal.timedOut()) throw new Error(`${attempt.label} timed out`);
    throw new Error(describeSearchFetchError(error, /** @type {string} */ (attempt.provider)));
  } finally {
    attemptSignal.cleanup();
  }
}

/**
 * Race a provider's attempts; return the first success.
 *
 * @param {string} provider
 * @param {string} query
 * @param {number} limit
 * @param {number} start
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{ provider: string, results: SearchResult[] }>}
 */
async function runSearchProvider(provider, query, limit, start, signal) {
  const attempts = buildSearchAttempts(provider, query, limit, start);
  const errors = [];
  const pending = attempts.map((attempt, index) => ({
    index,
    promise: runSearchAttempt(attempt, limit, signal)
      .then((result) => ({ index, result, error: /** @type {any} */ (undefined) }))
      .catch((error) => ({ index, result: /** @type {any} */ (undefined), error })),
  }));

  const active = new Map(pending.map((entry) => [entry.index, entry.promise]));
  while (active.size) {
    const settled = await Promise.race(active.values());
    active.delete(settled.index);
    if (settled.result) return settled.result;
    errors.push(settled.error?.message || String(settled.error));
  }

  throw new Error(errors.join("; ") || `${searchProviderDisplayName(provider)} returned no readable results`);
}

/**
 * Top-level search driver. Picks a provider list based on `provider`,
 * then races each provider's attempts in order. Mirrors
 * `fetchSearchResults`.
 *
 * @param {string} query
 * @param {number} limit
 * @param {number} start
 * @param {string} provider
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{ provider: string, results: SearchResult[] }>}
 */
async function fetchSearchResults(query, limit, start, provider, signal) {
  const normalizedProvider = normalizeSearchProvider(provider);
  const providers = normalizedProvider === "auto" || normalizedProvider === "duckduckgo"
    ? ["duckduckgo", "bing", "jina"]
    : [normalizedProvider];
  const errors = [];

  for (const item of providers) {
    try {
      return await runSearchProvider(item, query, limit, start, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(/** @type {Error} */ (error).message);
    }
  }

  throw new Error(errors.filter(Boolean).join("; ") || `${searchProviderDisplayName(normalizedProvider)} returned no readable results`);
}

module.exports = {
  SEARCH_TIMEOUT_MS,
  SEARCH_PROVIDERS,
  decodeBase64Url,
  unwrapBingRedirect,
  unwrapDuckDuckGoRedirect,
  cleanSearchUrl,
  parseDuckDuckGoApiResults,
  parseDuckDuckGoHtmlResults,
  parseJinaSearchResults,
  parseBingResults,
  parseBingRssResults,
  readXmlTag,
  searchProviderDisplayName,
  describeSearchFetchError,
  normalizeSearchProvider,
  isSearchResultRelevant,
  normalizeSearchResults,
  buildSearchAttempts,
  runSearchAttempt,
  runSearchProvider,
  fetchSearchResults,
};
