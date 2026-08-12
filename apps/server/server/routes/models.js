// GET /api/models
//
// Lists available LLM and embedding models from the local provider.
// LM Studio is probed via three URL shapes in preference order;
// Ollama uses two. When HTTP discovery fails entirely for LM Studio,
// falls back to `lms ls`.
//
// Behavior parity with root server.js:
// - Default provider is "lm-studio". Anything other than "ollama"
//   falls through to the LM Studio URL shape (via getLocalUrls).
// - LM Studio candidate order: /api/v0/models, /v1/models, /api/v1/models.
// - Ollama candidate order: /v1/models, /api/tags.
// - First candidate to return parsed models wins.
// - Response includes models, chatModels, embeddingModels, source,
//   plus a load-state summary:
//     LM Studio: loadedModelSummary(models) (may mutate cross-route
//                loaded-model state when upstream reports load_state).
//     Ollama:    synthesized { loaded: true, loaded_model: ..., ... }
//                (Ollama lists currently-running models in /v1/models;
//                this branch reflects that.)
// - AbortError ends processing without sending.
// - 502 with { error, detail } when all candidates and the lms
//   fallback fail; detail is the joined error list.

"use strict";

const { send, requestSignal } = require("../lib/http.js");
const { getTextWithFallback } = require("../lib/fetch.js");
const { getLocalUrls } = require("../lib/local-urls.js");
const { normalizeModelList } = require("../lib/lmstudio-models.js");
const { getLocalLmsModels } = require("../lib/lms-cli.js");
const { loadedModelSummary } = require("../lmstudio.js");

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleModels(req, res) {
  const signal = requestSignal(req, res);
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const provider = parsedUrl.searchParams.get("provider") || "lm-studio";
  const endpoint = parsedUrl.searchParams.get("endpoint") || "";

  const { baseUrl, modelsUrl } = getLocalUrls(provider, endpoint);

  /** @type {string[]} */
  let candidates = [];
  if (provider === "ollama") {
    candidates = [
      modelsUrl,
      `${baseUrl}/api/tags`,
    ];
  } else {
    candidates = [
      `${baseUrl}/api/v0/models`,
      modelsUrl,
      `${baseUrl}/api/v1/models`,
    ];
  }
  const errors = [];

  for (const url of candidates) {
    try {
      const response = await getTextWithFallback(url, signal);
      if (!response.ok) {
        errors.push(`${url} returned ${response.status}`);
        continue;
      }

      const data = JSON.parse(response.text);
      const models = normalizeModelList(data);
      const chatModels = models.filter((model) => model.kind !== "embedding");
      const embeddingModels = models.filter((model) => model.kind === "embedding");
      if (models.length) {
        const loadSummary = provider === "lm-studio"
          ? loadedModelSummary(models)
          : {
              loaded: true,
              loaded_model: chatModels[0]?.id || models[0]?.id || "",
              loaded_model_name: chatModels[0]?.name || models[0]?.name || "",
              loaded_context_length: 0,
              load_state_known: false,
            };
        send(res, 200, JSON.stringify({
          models,
          chatModels,
          embeddingModels,
          source: url,
          ...loadSummary,
        }), {
          "Content-Type": "application/json",
        });
        return;
      }
      errors.push(`${url} returned no models`);
    } catch (error) {
      if (/** @type {any} */ (error)?.name === "AbortError") return;
      errors.push(`${url}: ${/** @type {Error} */ (error).message}`);
    }
  }

  if (provider === "lm-studio") {
    try {
      const models = await getLocalLmsModels();
      const chatModels = models.filter((model) => model.kind !== "embedding");
      const embeddingModels = models.filter((model) => model.kind === "embedding");
      if (models.length) {
        send(res, 200, JSON.stringify({
          models,
          chatModels,
          embeddingModels,
          source: "lms",
          loaded: false,
        }), {
          "Content-Type": "application/json",
        });
        return;
      }
      errors.push("lms returned no models");
    } catch (error) {
      errors.push(`lms: ${/** @type {Error} */ (error).message}`);
    }
  }

  send(res, 502, JSON.stringify({
    error: "Model discovery failed",
    detail: errors.join("; "),
  }), {
    "Content-Type": "application/json",
  });
}

module.exports = { handleModels };
