// POST /api/models/load-embedding
//
// Loads an auxiliary embedding model into LM Studio. The shorter
// sibling of /api/models/load: no context-config validation, no
// embedding-chained side-effect, no cross-route loadedLmStudioModelInfo
// update.
//
// Behavior parity with root server.js:
// - Accepts model name from any of `model`, `embedding_model`,
//   `embeddingModel`.
// - Missing model returns 400 with { error: "Missing embedding model" }.
// - Non-LM-Studio providers ("ollama", "custom") return 200 with
//   { loaded: true, model } WITHOUT actually contacting any server.
// - LM Studio path delegates to loadLmStudioAuxModel and returns
//   { loaded: true, model, raw }.
// - AbortError swallowed silently.
// - Outer 502 carries { error: "Embedding model load failed", detail }.

"use strict";

const { send, readJsonBody, requestSignal } = require("../lib/http.js");
const { loadLmStudioAuxModel } = require("../lmstudio.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleModelsLoadEmbedding(req, res) {
  const signal = requestSignal(req, res);

  try {
    const body = await readJsonBody(req);
    const provider = body._local_provider || "lm-studio";
    const model = String(body.model || body.embedding_model || body.embeddingModel || "").trim();

    if (!model) {
      send(res, 400, JSON.stringify({ error: "Missing embedding model" }), {
        "Content-Type": "application/json",
      });
      return;
    }

    if (provider === "ollama" || provider === "custom") {
      send(res, 200, JSON.stringify({ loaded: true, model }), {
        "Content-Type": "application/json",
      });
      return;
    }

    const loaded = await loadLmStudioAuxModel(model, signal);
    send(res, 200, JSON.stringify({
      loaded: true,
      model: loaded?.model || model,
      raw: loaded?.raw || null,
    }), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Embedding model load failed",
      detail: /** @type {Error} */ (error).message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleModelsLoadEmbedding };
