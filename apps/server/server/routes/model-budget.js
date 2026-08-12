// POST /api/model-budget
//
// Computes the prompt-token cost and remaining output budget for a
// chat payload. Cloud models use a heuristic against the static
// context_length; LM Studio models use the SDK; on SDK failure the
// route falls back to the heuristic with several configurable
// context-length sources.
//
// Behavior parity with root server.js:
// - Same JSON shape and field order as calculateModelBudget.
// - AbortError swallowed silently.
// - Outer 502 carries { error: "Model budget failed", detail }.

"use strict";

const { send, readJsonBody } = require("../lib/http.js");
const { calculateModelBudget } = require("../lmstudio.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleModelBudget(req, res) {
  try {
    const body = await readJsonBody(req);
    send(res, 200, JSON.stringify(await calculateModelBudget(body)), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Model budget failed",
      detail: /** @type {Error} */ (error).message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleModelBudget };
