// GET|POST /api/endfield/search
//
// Keyword search over the Warfarin / Endfield archive. Accepts both
// GET with query params and POST with a JSON body for the same set
// of inputs (query, limit). An empty query returns the dataset
// metadata only (used by the client's first-load info panel).
//
// Behavior parity with root server.js's `searchEndfieldStories`:
// - Method-driven body parsing.
// - limit clamped to [1, 50], default 12.
// - Empty query response includes meta + results:[].
// - 500 catch-all carries { error: "Endfield search failed", detail }.

"use strict";

const { send, readJsonBody, respondIfClientError } = require("../lib/http.js");
const {
  findEndfieldStoryMatches,
  buildEndfieldEmptyMeta,
} = require("../endfield.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleEndfieldSearch(req, res) {
  try {
    /** @type {any} */
    const body = req.method === "POST"
      ? await readJsonBody(req)
      : Object.fromEntries(new URL(req.url || "/", `http://${req.headers.host}`).searchParams.entries());
    const query = String(body.query || body.q || "").trim();
    const limit = Math.min(Math.max(Number(body.limit || 12), 1), 50);

    if (!query) {
      const meta = await buildEndfieldEmptyMeta();
      send(res, 200, JSON.stringify({
        query,
        meta,
        results: [],
      }), { "Content-Type": "application/json" });
      return;
    }

    const matches = await findEndfieldStoryMatches(query, limit);
    send(res, 200, JSON.stringify({
      query,
      ...matches,
    }), { "Content-Type": "application/json" });
  } catch (error) {
    // A bad request body is the caller's fault, not a fault in the archive
    // search, so it must not be reported at server-error status.
    if (respondIfClientError(res, error)) return;
    send(res, 500, JSON.stringify({
      error: "Endfield search failed",
      detail: /** @type {Error} */ (error).message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleEndfieldSearch };
