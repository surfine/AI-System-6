// GET /api/search?q=...&limit=...&start=...&provider=auto|duckduckgo|bing
//
// Bounded web search proxy. Tries DuckDuckGo web results first (when auto or
// duckduckgo) and falls back to Bing. Returns up to `limit` deduped
// results.
//
// Behavior parity with root server.js:
// - Missing query -> 400 { error: "Missing query" }.
// - limit clamped to [3, 8] (default 5).
// - start passed through as the 1-based Bing "first" parameter.
// - Empty results array after all providers -> 502 with
//   { error: "Search returned no readable results", detail }.
// - Failure path -> 502 with { error: "Search failed", detail }.
// - AbortError swallowed silently.
// - Response shape on success:
//     { provider, actualProvider, results: [...] }
//   where `provider` is the normalized request value (auto, ...) and
//   `actualProvider` is the one that succeeded.

"use strict";

const { send, requestSignal } = require("../lib/http.js");
const {
  fetchSearchResults,
  normalizeSearchProvider,
  searchProviderDisplayName,
} = require("../search.js");

// Search engines carry the query in the request line. A query longer than this
// is refused by each engine in turn, and the route then reported "Search
// failed" with four engine names — which hid the one correctable fact, that
// the query is too long. The bound is checked before any request is spent.
const SEARCH_QUERY_MAX_CHARS = 512;

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleSearch(req, res) {
  const signal = requestSignal(req, res);
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const query = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 5), 3), 8);
  const start = Number(url.searchParams.get("start") || 0);
  const provider = normalizeSearchProvider(url.searchParams.get("provider") || "auto");

  if (!query) {
    send(res, 400, JSON.stringify({ error: "Missing query" }), {
      "Content-Type": "application/json",
    });
    return;
  }

  if (query.length > SEARCH_QUERY_MAX_CHARS) {
    send(res, 400, JSON.stringify({
      error: "Search query is too long",
      code: "search_query_too_long",
      detail: `A search query must be ${SEARCH_QUERY_MAX_CHARS} characters or less. This one is ${query.length}. Shorten it to the key words.`,
    }), {
      "Content-Type": "application/json",
    });
    return;
  }

  try {
    const search = await fetchSearchResults(query, limit, start, provider, signal);
    const results = search.results || [];

    if (!results.length) {
      send(res, 502, JSON.stringify({
        error: "Search returned no readable results",
        detail: `${searchProviderDisplayName(provider)} returned no readable results`,
      }), {
        "Content-Type": "application/json",
      });
      return;
    }

    send(res, 200, JSON.stringify({
      provider,
      actualProvider: search.provider || provider,
      results,
    }), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Search failed",
      detail: /** @type {Error} */ (error).message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleSearch };
