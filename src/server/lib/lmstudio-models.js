// Pure model-data utilities for LM Studio and OpenAI-compatible
// model lists. No I/O. Used by /api/models, /api/models/load,
// /api/lmstudio/setup, /api/chat autoload, and other LM Studio
// consumers.
//
// Behavior parity with the matching functions in root server.js.
// All shapes and field orders preserved verbatim.

"use strict";

const { positiveInteger } = require("./numbers.js");

/**
 * Floor on requested context length. Mirrors `minContextLength` from
 * root server.js (1024). Used by requestedContextConfig.
 */
const MIN_CONTEXT_LENGTH = 1024;

/**
 * Hard-coded per-model context maxima for models the SDK does not
 * always report correctly. Mirrors `knownModelMaxContext` from root
 * server.js. Moved here from src/server/lmstudio.js so this module
 * has no upward dependency on the stateful lmstudio.js.
 *
 * @param {string | undefined | null} model
 * @returns {number}
 */
function knownModelMaxContext(model) {
  const value = String(model || "");
  if (/(^|[/\s_-])qwen3\.5[-_\s]?4b($|[/\s_-])/i.test(value)) return 262144;
  if (/gemma[-_/ ]?4/i.test(value) && /26b/i.test(value) && /a4b/i.test(value)) return 262144;
  if (/gemma[-_/ ]?4/i.test(value) && /e4b/i.test(value)) return 131072;
  return 0;
}

/**
 * Classify a model record as either "embedding" or "chat" based on
 * id, name, and a handful of provider-specific fields.
 *
 * @param {any} item
 * @param {string} id
 * @param {string} name
 * @returns {"embedding" | "chat"}
 */
function modelKindFromData(item, id, name) {
  const text = [
    id,
    name,
    item?.type,
    item?.kind,
    item?.architecture,
    item?.metadata?.type,
    item?.metadata?.kind,
  ].filter(Boolean).join(" ");
  return /embed|embedding/i.test(text) ? "embedding" : "chat";
}

/**
 * Decide whether a single model record is currently loaded, returning
 * a tri-state { known, loaded, state }.
 *
 * @param {any} item
 * @returns {{ known: boolean, loaded: boolean, state: string }}
 */
function modelLoadStateFromData(item) {
  if (!item || typeof item === "string") return { known: false, loaded: false, state: "" };
  const state = String(item.state || item.status || item.load_state || "").trim().toLowerCase();
  if (state) {
    return {
      known: true,
      loaded: /(^|[-_\s])loaded($|[-_\s])/.test(state) && !/not[-_\s]?loaded|unloaded/.test(state),
      state,
    };
  }
  if (Array.isArray(item.loaded_instances)) {
    return {
      known: true,
      loaded: item.loaded_instances.length > 0,
      state: item.loaded_instances.length > 0 ? "loaded" : "not-loaded",
    };
  }
  if (typeof item.loaded === "boolean") {
    return { known: true, loaded: item.loaded, state: item.loaded ? "loaded" : "not-loaded" };
  }
  return { known: false, loaded: false, state: "" };
}

/**
 * Read the maximum-context-length field from a model record, trying
 * many provider-specific field names. Returns 0 if none are positive.
 *
 * @param {any} data
 * @returns {number}
 */
function modelMaxContextFromData(data) {
  if (!data || typeof data === "string") return 0;
  return positiveInteger(
    data.max_context_length ||
    data.max_context ||
    data.context_length_max ||
    data.trained_context_length ||
    data.context_length ||
    data.n_ctx ||
    data.config?.max_context_length ||
    data.config?.context_length ||
    data.load_config?.max_context_length ||
    data.load_config?.context_length
  );
}

/**
 * Read the currently-loaded context length from a model record.
 *
 * @param {any} data
 * @param {number} fallbackContext
 * @returns {number}
 */
function loadedModelContext(data, fallbackContext) {
  return Number(
    data?.load_config?.context_length ||
    data?.config?.context_length ||
    data?.context_length ||
    fallbackContext
  );
}

/**
 * Read the canonical model id/name from a load-status record.
 *
 * @param {any} data
 * @param {string} fallbackModel
 * @returns {string}
 */
function loadedModelName(data, fallbackModel) {
  return data?.model || data?.id || data?.load_config?.model || fallbackModel;
}

/**
 * Compare two model identifiers tolerantly. Names are equal if they
 * are case-insensitively the same after trimming, or if one ends with
 * `/${other}` (a common namespace/repo prefix pattern).
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
function sameModelName(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

/**
 * Parse the active and total billion-parameter counts out of a model
 * label. Defaults both to 99 when neither pattern matches (so unknown
 * models sort to the bottom of the autoload preference list).
 *
 * @param {string} [model]
 * @returns {{ active: number, total: number }}
 */
function modelBillionParams(model = "") {
  const value = String(model || "").toLowerCase();
  const active = value.match(/a(\d+(?:\.\d+)?)b\b/);
  const total = value.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)b\b/);
  return {
    active: active ? Number(active[1]) : total ? Number(total[1]) : 99,
    total: total ? Number(total[1]) : active ? Number(active[1]) : 99,
  };
}

/**
 * Score a model for autoload preference. Lower is more preferred.
 * Heuristics mirror root server.js: prefer already-loaded models,
 * prefer Qwen, prefer instruct/chat variants, penalize multimodal /
 * rerank / quantized labels, scale on parameter counts.
 *
 * @param {{ id?: string, name?: string, loaded?: boolean }} model
 * @returns {number}
 */
function autoLoadModelScore(model) {
  const label = `${model?.id || ""} ${model?.name || ""}`.toLowerCase();
  const params = modelBillionParams(label);
  let score = 0;
  if (model.loaded) score -= 1000;
  if (/qwen/.test(label)) score -= 20;
  if (/instruct|chat/.test(label)) score -= 8;
  if (/vl|vision|image|audio|rerank/.test(label)) score += 35;
  if (/mlx|gguf|q4|int4|4bit/.test(label)) score -= 2;
  score += params.active * 10;
  score += params.total * 0.8;
  return score;
}

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: "embedding" | "chat",
 *   load_state_known?: boolean,
 *   loaded?: boolean,
 *   load_state?: string,
 *   loaded_context_length?: number,
 *   size?: number,
 *   max_context_length?: number,
 *   max_context_source?: "detected" | "known",
 * }} NormalizedModel
 */

/**
 * Normalize an OpenAI-style or provider-native model list payload
 * into the cross-route shape used by the client.
 *
 * @param {any} data
 * @returns {NormalizedModel[]}
 */
function normalizeModelList(data) {
  const rawModels = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
        ? data
        : [];

  const seen = new Set();
  return rawModels
    .map((item) => {
      const id = typeof item === "string"
        ? item
        : item?.id || item?.model || item?.modelKey || item?.model_key || item?.key || item?.name || item?.path || "";
      const name = typeof item === "string"
        ? item
        : item?.displayName || item?.display_name || item?.name || id;
      const detectedMaxContext = modelMaxContextFromData(item);
      const maxContext = detectedMaxContext || knownModelMaxContext(id) || knownModelMaxContext(name);
      const kind = modelKindFromData(item, id, name);
      const loadState = modelLoadStateFromData(item);
      const loadedContext = loadedModelContext(item, 0);
      return /** @type {NormalizedModel} */ ({
        id: String(id || "").trim(),
        name: String(name || id || "").trim(),
        kind,
        ...(loadState.known ? {
          load_state_known: true,
          loaded: loadState.loaded,
          load_state: loadState.state,
        } : {}),
        ...(loadedContext ? { loaded_context_length: loadedContext } : {}),
        ...(item?.size || item?.size_bytes || item?.file_size ? {
          size: item.size || item.size_bytes || item.file_size,
        } : {}),
        ...(maxContext ? {
          max_context_length: maxContext,
          max_context_source: detectedMaxContext ? "detected" : "known",
        } : {}),
      });
    })
    .filter((model) => model.id && !seen.has(model.id) && seen.add(model.id));
}

/**
 * Normalize the `lms ls --llm --json` output. Same shape as
 * normalizeModelList minus the load-state/loaded-context fields the
 * lms CLI does not report.
 *
 * @param {any} data
 * @returns {NormalizedModel[]}
 */
function normalizeLmsModels(data) {
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data?.items)
        ? data.items
        : [];
  const seen = new Set();
  return raw
    .map((item) => {
      const id = typeof item === "string"
        ? item
        : item?.modelKey || item?.model_key || item?.key || item?.id || item?.path || item?.name || "";
      const name = typeof item === "string"
        ? item
        : item?.displayName || item?.display_name || item?.name || item?.id || id;
      const detectedMaxContext = modelMaxContextFromData(item);
      const maxContext = detectedMaxContext || knownModelMaxContext(id) || knownModelMaxContext(name);
      const kind = modelKindFromData(item, id, name);
      return /** @type {NormalizedModel} */ ({
        id: String(id || "").trim(),
        name: String(name || id || "").trim(),
        kind,
        ...(maxContext ? {
          max_context_length: maxContext,
          max_context_source: detectedMaxContext ? "detected" : "known",
        } : {}),
      });
    })
    .filter((model) => model.id && !seen.has(model.id) && seen.add(model.id));
}

/**
 * Resolve the requested context configuration for a model-load
 * request. Returns either a successful descriptor or an error object
 * with errorStatus + error + detail keyed for HTTP forwarding.
 *
 * @param {any} body
 * @param {string} model
 * @returns {{
 *   contextLength: number,
 *   maxContext: number,
 *   maxContextSource: string
 * } | {
 *   errorStatus: number,
 *   error: string,
 *   detail: string,
 *   maxContext?: number,
 *   maxContextSource?: string
 * }}
 */
function requestedContextConfig(body, model) {
  const requestMaxContext = positiveInteger(body.max_context_length);
  const detectedMaxContext = modelMaxContextFromData(body.model_info);
  const knownMaxContext = knownModelMaxContext(model);
  const maxContext = requestMaxContext || detectedMaxContext || knownMaxContext;
  const maxContextSource = body.max_context_source
    || (requestMaxContext ? "user" : detectedMaxContext ? "detected" : knownMaxContext ? "known" : "");
  const requestedContext = positiveInteger(body.context_length || 8192);

  if (!maxContext) {
    return {
      errorStatus: 409,
      error: "Missing model max context",
      detail: "This model's maximum context window is unknown. Confirm the model max context before loading.",
    };
  }

  if (maxContext < MIN_CONTEXT_LENGTH) {
    return {
      errorStatus: 422,
      error: "Invalid model max context",
      detail: `Model max context must be at least ${MIN_CONTEXT_LENGTH}.`,
    };
  }

  const contextLength = Math.max(MIN_CONTEXT_LENGTH, requestedContext || 8192);
  if (contextLength > maxContext) {
    return {
      errorStatus: 422,
      error: "Context exceeds model max",
      detail: `Requested context ${contextLength} exceeds this model's maximum context ${maxContext}.`,
      maxContext,
      maxContextSource,
    };
  }

  return { contextLength, maxContext, maxContextSource };
}

/**
 * Pick a model from a normalized list according to user preference.
 * If `preferredModel` is given, prefer an exact id/name match, then
 * an id/name substring match. Otherwise return the first model.
 * Mirrors `pickSetupModel` from root server.js.
 *
 * @param {NormalizedModel[]} models
 * @param {string | null | undefined} preferredModel
 * @returns {NormalizedModel | null}
 */
function pickSetupModel(models, preferredModel) {
  const preferred = String(preferredModel || "").trim();
  if (preferred) {
    return models.find((model) => model.id === preferred || model.name === preferred)
      || models.find((model) => model.id.includes(preferred) || model.name.includes(preferred))
      || null;
  }
  return models[0] || null;
}

module.exports = {
  MIN_CONTEXT_LENGTH,
  knownModelMaxContext,
  modelKindFromData,
  modelLoadStateFromData,
  modelMaxContextFromData,
  loadedModelContext,
  loadedModelName,
  sameModelName,
  modelBillionParams,
  autoLoadModelScore,
  normalizeModelList,
  normalizeLmsModels,
  requestedContextConfig,
  pickSetupModel,
};
