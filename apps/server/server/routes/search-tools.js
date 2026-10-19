// POST /api/search/tools
//
// DeepSeek's Tools API search, as an OPTIONAL backend: off unless the
// deployment sets AI_SYSTEM6_DEEPSEEK_TOOLS=1, and BYOK-only because the API
// bills per successful request (about ¥5 per 1,000). It returns the result
// list; the desk composes its own answer, as it does for other search sources.

"use strict";

const { send, readJsonBody, requestSignal, withTimeoutSignal } = require("../lib/http.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const {
  callDeepseekToolsSearch,
  deepseekToolsEnabled,
} = require("../web-search.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleSearchTools(req, res) {
  if (!deepseekToolsEnabled()) {
    send(res, 501, JSON.stringify({
      error: "The DeepSeek Tools search backend is not enabled on this deployment",
      code: "deepseek_tools_disabled",
    }), { "Content-Type": "application/json" });
    return;
  }
  const requestAbortSignal = requestSignal(req, res);
  const timeoutHandle = withTimeoutSignal(requestAbortSignal, 30000);
  const signal = timeoutHandle.signal;
  try {
    const body = await readJsonBody(req, { limitBytes: 32 * 1024 });
    const query = String(body.q || "").trim();
    if (!query) {
      send(res, 400, JSON.stringify({ error: "Missing query", code: "missing_query" }), { "Content-Type": "application/json" });
      return;
    }
    // Tools search bills per call, so the shared cloud key is never used for it.
    const apiKey = String(await resolveCloudCredential({ provider: "deepseek" })).trim();
    if (!apiKey) {
      send(res, 400, JSON.stringify({
        error: "Missing API key",
        code: "missing_byok_key",
      }), { "Content-Type": "application/json" });
      return;
    }
    const result = await callDeepseekToolsSearch({
      apiKey,
      query,
      count: body.count,
      signal,
    });
    send(res, 200, JSON.stringify(result), { "Content-Type": "application/json" });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    const status = Number(/** @type {any} */ (error)?.statusCode || /** @type {any} */ (error)?.status) || 502;
    send(res, status, JSON.stringify({
      error: status < 500 ? /** @type {Error} */ (error).message : "Search backend failed",
      code: String(/** @type {any} */ (error)?.code || "deepseek_tools_failed"),
    }), { "Content-Type": "application/json" });
  } finally {
    timeoutHandle.cleanup();
  }
}

module.exports = { handleSearchTools };
