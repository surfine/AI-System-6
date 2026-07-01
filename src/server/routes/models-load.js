// POST /api/models/load
//
// Load a chat model into LM Studio with an explicit context length,
// optionally also loading an embedding model on the side. Updates the
// cross-route loadedLmStudioModelInfo so /api/chat autoload, the
// budget fallback, and subsequent /api/models calls can see the
// freshly-loaded model.
//
// Behavior parity with root server.js:
// - Reads provider from `_local_provider` (default "lm-studio").
// - "ollama" / "custom" provider returns 200 { loaded:true, model,
//   context_length: body.context_length || 8192 } WITHOUT contacting
//   any server.
// - Missing model returns 400 { error: "Missing model" }.
// - Context config errors (errorStatus 409/422) propagate as
//   { error, detail } at the indicated HTTP status. The `maxContext`
//   / `maxContextSource` fields that requestedContextConfig may
//   include on a 422 are dropped from the wire response (root does
//   the same).
// - LM Studio errors map to upstream status with
//   { error: "Model load failed", detail: data.detail || data.error
//   || text || `LM Studio returned ${status}` }.
// - On success: mutates loadedLmStudioModelInfo, then attempts to
//   load `embedding_model` or `embeddingModel` if present. Embedding
//   load failure does NOT fail the route; the error message goes
//   into the `embedding_warning` field.
// - AbortError swallowed silently.
// - Outer 502 carries { error: "Model load failed", detail }.

"use strict";

const { send, readJsonBody, requestSignal } = require("../lib/http.js");
const { postJsonWithFallback } = require("../lib/fetch.js");
const { LM_STUDIO_BASE_URL_DEFAULT } = require("../lib/local-urls.js");
const {
  requestedContextConfig,
  loadedModelContext,
  loadedModelName,
} = require("../lib/lmstudio-models.js");
const {
  loadLmStudioAuxModel,
  setLoadedLmStudioModelInfo,
  unloadAllLoadedLmStudioModels,
  unloadLmStudioModel,
} = require("../lmstudio.js");

function firstErrorText(...values) {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      const nested = firstErrorText(value.message, value.detail, value.error, value.code, value.type);
      if (nested) return nested;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }
  return "";
}

function isAlreadyLoadedConflict(text = "") {
  return /(already loaded|model is loaded|duplicate instance|already exists|instance.*exists|409)/i.test(String(text || ""));
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleModelsLoad(req, res) {
  const signal = requestSignal(req, res);

  try {
    const body = await readJsonBody(req);
    const provider = body._local_provider || "lm-studio";
    const model = String(body.model || "").trim();

    if (provider === "ollama" || provider === "custom") {
      send(res, 200, JSON.stringify({
        loaded: true,
        model,
        context_length: body.context_length || 8192,
      }), {
        "Content-Type": "application/json",
      });
      return;
    }

    if (!model) {
      send(res, 400, JSON.stringify({ error: "Missing model" }), {
        "Content-Type": "application/json",
      });
      return;
    }
    const contextConfig = requestedContextConfig(body, model);
    if ("errorStatus" in contextConfig) {
      send(res, contextConfig.errorStatus, JSON.stringify({
        error: contextConfig.error,
        detail: contextConfig.detail,
      }), { "Content-Type": "application/json" });
      return;
    }

    const payload = {
      model,
      context_length: contextConfig.contextLength,
      echo_load_config: true,
    };
    const unloadExisting = body.unload_existing !== false;
    if (unloadExisting) {
      await unloadAllLoadedLmStudioModels(signal);
    } else {
      await unloadLmStudioModel(model, signal);
    }
    const url = `${LM_STUDIO_BASE_URL_DEFAULT}/api/v1/models/load`;
    /** @type {Response | null} */
    let response = null;
    let text = "";
    /** @type {any} */
    let data = {};
    const runLoad = async () => {
      const result = await postJsonWithFallback(url, payload, signal);
      response = result.response;
      text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    };

    await runLoad();
    if (response && !response.ok) {
      const firstDetail = firstErrorText(data.detail, data.error, text, response.statusText, `LM Studio returned ${response.status}`);
      if (isAlreadyLoadedConflict(firstDetail)) {
        await unloadLmStudioModel(model, signal);
        await runLoad();
      }
    }

    if (!response || !response.ok) {
      const detail = firstErrorText(data.detail, data.error, text, response?.statusText, response ? `LM Studio returned ${response.status}` : "LM Studio did not respond");
      send(res, response?.status || 502, JSON.stringify({
        error: "Model load failed",
        detail,
      }), {
        "Content-Type": "application/json",
      });
      return;
    }

    setLoadedLmStudioModelInfo({
      model: loadedModelName(data, model),
      context_length: loadedModelContext(data, contextConfig.contextLength),
      max_context_length: contextConfig.maxContext,
    });

    const embeddingModel = String(body.embedding_model || body.embeddingModel || "").trim();
    /** @type {{ model: string, raw: any } | null} */
    let embeddingLoaded = null;
    let embeddingWarning = "";
    if (embeddingModel) {
      try {
        embeddingLoaded = await loadLmStudioAuxModel(embeddingModel, signal);
      } catch (error) {
        embeddingWarning = /** @type {Error} */ (error).message || String(error);
      }
    }

    send(res, 200, JSON.stringify({
      model: loadedModelName(data, model),
      context_length: loadedModelContext(data, contextConfig.contextLength),
      max_context_length: contextConfig.maxContext,
      max_context_source: contextConfig.maxContextSource,
      embedding_model: embeddingLoaded?.model || "",
      embedding_warning: embeddingWarning,
      raw: data,
    }), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (/** @type {any} */ (error)?.name === "AbortError") return;
    send(res, 502, JSON.stringify({
      error: "Model load failed",
      detail: /** @type {Error} */ (error).message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = { handleModelsLoad };
