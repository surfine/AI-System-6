// LM Studio integration: SDK client, loaded-model state, and the
// model-budget calculator that backs POST /api/model-budget.
//
// Grows as more LM-Studio-facing routes migrate (/api/models,
// /api/models/load, /api/chat autoload, /api/lmstudio/setup).
//
// Cross-route shared state: `loadedLmStudioModelInfo` mirrors the
// same module-level let in root server.js. It is mutated by the
// model-load and model-list routes (not yet migrated) and read by
// the budget and chat-autoload paths. While only some routes live
// in src/, the value stays null in this process — equivalent to a
// fresh root process where no model has been loaded. Once /api/models
// and /api/models/load migrate, the setter exported here will be the
// single source of truth for src/.

"use strict";

const path = require("node:path");
const { LM_STUDIO_BASE_URL_DEFAULT } = require("./lib/local-urls.js");
const { repoRoot } = require("./lib/build-info.js");
const { DEEPSEEK_CLOUD_MODELS } = require("./cloud.js");
const { positiveInteger } = require("./lib/numbers.js");
const {
  autoLoadModelScore,
  knownModelMaxContext,
  loadedModelContext,
  loadedModelName,
  normalizeModelList,
  modelLoadStateFromData,
  sameModelName,
} = require("./lib/lmstudio-models.js");
const { getTextWithFallback, postJsonWithFallback } = require("./lib/fetch.js");

/**
 * Optional download target for /api/lmstudio/setup when the local
 * machine has no LLMs installed. Empty by default so setup does not
 * silently bind AI System 6 to one remote model id.
 */
const DEFAULT_LM_STUDIO_DOWNLOAD_MODEL = String(process.env.AI_SYSTEM6_SETUP_DOWNLOAD_MODEL || "").trim();

/**
 * The SDK ships only dist/index.cjs but declares main: dist/index.js,
 * so the explicit path is required. Mirrors root server.js. When src/
 * eventually replaces root, pkg's asset list will need this path too.
 *
 * @type {any}
 */
let LMStudioClient = null;
try {
  ({ LMStudioClient } = require(
    path.join(repoRoot, "node_modules", "@lmstudio", "sdk", "dist", "index.cjs")
  ));
} catch {
  LMStudioClient = null;
}

/**
 * Cached SDK client promise. Reset by tests if ever needed; not
 * exposed.
 *
 * @type {Promise<any> | null}
 */
let lmStudioSdkClientPromise = null;

/**
 * @typedef {Object} LoadedLmStudioModelInfo
 * @property {string} model
 * @property {number} [context_length]
 * @property {number} [max_context_length]
 */

/** @type {LoadedLmStudioModelInfo | null} */
let loadedLmStudioModelInfo = null;

/**
 * Build the LM Studio WebSocket base URL from the configured HTTP
 * base URL. Mirrors `lmStudioWebSocketBaseUrl` from root.
 *
 * @returns {string}
 */
function lmStudioWebSocketBaseUrl() {
  return LM_STUDIO_BASE_URL_DEFAULT.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

/**
 * Return a singleton LM Studio SDK client. Throws if the SDK is not
 * installed.
 *
 * @returns {Promise<any>}
 */
async function getLmStudioSdkClient() {
  lmStudioSdkClientPromise ||= Promise.resolve().then(() => {
    if (!LMStudioClient) throw new Error("LM Studio SDK is unavailable");
    return new LMStudioClient({
      baseUrl: lmStudioWebSocketBaseUrl(),
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
  });
  return lmStudioSdkClientPromise;
}

/**
 * Return a model handle for the named model if reachable, otherwise
 * fall through to whichever model is currently loaded in LM Studio.
 * Mirrors `getLmStudioBudgetModel`.
 *
 * @param {string} [modelName]
 * @returns {Promise<any>}
 */
async function getLmStudioBudgetModel(modelName = "") {
  const client = await getLmStudioSdkClient();
  const modelKey = String(modelName || loadedLmStudioModelInfo?.model || "").trim();
  if (modelKey) {
    try {
      const handle = client.llm.createDynamicHandle(modelKey);
      const info = await handle.getModelInfo();
      if (info) return handle;
    } catch {
      // Fall through to any currently loaded model.
    }
  }
  return client.llm.model();
}

/**
 * Cheap heuristic token count: ~4 characters per token plus 6 tokens
 * of overhead per message. Mirrors `estimateModelBudgetTokens`.
 *
 * @param {Array<{ content?: unknown }>} [messages]
 * @returns {number}
 */
function estimateModelBudgetTokens(messages = []) {
  return messages.reduce((sum, message) =>
    sum + Math.max(1, Math.ceil(String(message?.content || "").length / 4)) + 6,
  0);
}

/**
 * @typedef {Object} ModelBudgetResult
 * @property {number} context_length
 * @property {number} prompt_tokens
 * @property {number} available_output_tokens
 * @property {boolean} fits
 * @property {"cloud_model" | "lmstudio_sdk" | "estimated_fallback"} budget_source
 * @property {string} [reason]
 */

/**
 * Compute the prompt-token cost and output budget for a chat payload.
 * Mirrors `calculateModelBudget` from root server.js.
 *
 * - Cloud models short-circuit to the heuristic estimate against the
 *   registry's context_length.
 * - LM Studio path uses the SDK's applyPromptTemplate + countTokens
 *   for an accurate count.
 * - On SDK failure (no LM Studio running, no model loaded, etc.),
 *   falls back to the same heuristic, sourcing context_length from
 *   the request, the loaded-model info, a known-model override, or
 *   the 8192 default.
 *
 * @param {{ model?: string, messages?: any[], requested_output_tokens?: number,
 *           max_tokens?: number, context_length?: number }} [body]
 * @returns {Promise<ModelBudgetResult>}
 */
async function calculateModelBudget(body = {}) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const requestedOutputTokens = positiveInteger(body.requested_output_tokens || body.max_tokens || 0);

  const cloudModel = Array.isArray(DEEPSEEK_CLOUD_MODELS)
    && DEEPSEEK_CLOUD_MODELS.find((m) => m.id === body.model);
  if (cloudModel) {
    const contextLength = cloudModel.context_length;
    const promptTokens = estimateModelBudgetTokens(messages);
    const availableOutputTokens = Math.max(0, contextLength - promptTokens);
    return {
      context_length: contextLength,
      prompt_tokens: promptTokens,
      available_output_tokens: availableOutputTokens,
      fits: promptTokens + requestedOutputTokens <= contextLength,
      budget_source: "cloud_model",
    };
  }

  try {
    const model = await getLmStudioBudgetModel(body.model);
    const formattedPrompt = await model.applyPromptTemplate(messages);
    const promptTokens = await model.countTokens(formattedPrompt);
    const contextLength = await model.getContextLength();
    const availableOutputTokens = Math.max(0, contextLength - promptTokens);
    return {
      context_length: contextLength,
      prompt_tokens: promptTokens,
      available_output_tokens: availableOutputTokens,
      fits: promptTokens + requestedOutputTokens <= contextLength,
      budget_source: "lmstudio_sdk",
    };
  } catch (error) {
    const contextLength = positiveInteger(
      body.context_length ||
      loadedLmStudioModelInfo?.context_length ||
      loadedLmStudioModelInfo?.max_context_length ||
      knownModelMaxContext(body.model) ||
      8192
    );
    const promptTokens = estimateModelBudgetTokens(messages);
    const availableOutputTokens = Math.max(0, contextLength - promptTokens);
    return {
      context_length: contextLength,
      prompt_tokens: promptTokens,
      available_output_tokens: availableOutputTokens,
      fits: promptTokens + requestedOutputTokens <= contextLength,
      budget_source: "estimated_fallback",
      reason: /** @type {Error} */ (error).message,
    };
  }
}

/**
 * @returns {LoadedLmStudioModelInfo | null}
 */
function getLoadedLmStudioModelInfo() {
  return loadedLmStudioModelInfo;
}

/**
 * @param {LoadedLmStudioModelInfo | null} info
 */
function setLoadedLmStudioModelInfo(info) {
  loadedLmStudioModelInfo = info;
}

/**
 * Pick the first non-empty value, stringifying objects via JSON when
 * they are not already strings. Used to extract a human-readable
 * error from an LM Studio response that may carry `detail`, `error`,
 * or just a raw text body. Mirrors `lmStudioErrorText` from root.
 *
 * @param {...unknown} values
 * @returns {string}
 */
function lmStudioErrorText(...values) {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return "";
}

async function discoverLmStudioModels(baseUrl, signal) {
  const candidates = [`${baseUrl}/api/v1/models`, `${baseUrl}/api/v0/models`];
  for (const url of candidates) {
    try {
      const response = await getTextWithFallback(url, signal);
      if (!response.ok) continue;
      const parsed = JSON.parse(response.text);
      const discovered = Array.isArray(parsed?.data)
        ? parsed.data
        : Array.isArray(parsed?.models)
          ? parsed.models
          : Array.isArray(parsed)
            ? parsed
            : [];
      if (discovered.length) return discovered;
    } catch {
      // Best-effort only.
    }
  }
  return [];
}

async function unloadLmStudioModelExact(instanceId, signal, baseUrl) {
  const id = String(instanceId || "").trim();
  if (!id) return;
  const urls = [`${baseUrl}/api/v1/models/unload`, `${baseUrl}/api/v0/models/unload`];
  const payloads = [
    { instance_id: id, model: id },
    { instance_id: id },
    { identifier: id },
    { id },
    { model: id },
  ];
  for (const url of urls) {
    for (const payload of payloads) {
      try {
        const { response } = await postJsonWithFallback(url, payload, signal);
        await response.text().catch(() => "");
        if (response.ok) return;
      } catch {
        // Continue trying fallback variants.
      }
    }
  }
}

/**
 * Best-effort unload of a named LM Studio model via the REST v1
 * endpoint. By default, unloads both the exact id and any sibling
 * instances with the same base id (`model`, `model:2`, `model:3`...).
 *
 * @param {string | null | undefined} model
 * @param {AbortSignal | null | undefined} signal
 * @param {{ baseUrl?: string, exactOnly?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function unloadLmStudioModel(model, signal, options = {}) {
  const instanceId = String(model || "").trim();
  if (!instanceId) return;
  const baseUrl = String(options.baseUrl || LM_STUDIO_BASE_URL_DEFAULT).replace(/\/$/, "");
  if (options.exactOnly) {
    await unloadLmStudioModelExact(instanceId, signal, baseUrl);
    return;
  }

  const discovered = await discoverLmStudioModels(baseUrl, signal);
  const unloadCandidates = new Set([instanceId]);
  discovered.forEach((item) => {
    const familyMatches = (value) => {
      const id = String(value || "").trim();
      return id === instanceId || id.startsWith(`${instanceId}:`);
    };
    if (Array.isArray(item?.loaded_instances)) {
      item.loaded_instances.forEach((instance) => {
        const id = String(instance?.id || "").trim();
        if (familyMatches(id)) unloadCandidates.add(id);
      });
      return;
    }
    const id = String(item?.id || item?.model || "").trim();
    if (familyMatches(id)) unloadCandidates.add(id);
  });

  for (const id of unloadCandidates) {
    await unloadLmStudioModelExact(id, signal, baseUrl);
  }
}

/**
 * Best-effort unload of all currently loaded LM Studio models.
 * Used to prevent instance stacking (`model`, `model:2`, ...) when
 * callers want a clean load cycle.
 *
 * @param {AbortSignal | null | undefined} signal
 * @param {{ baseUrl?: string }} [options]
 * @returns {Promise<string[]>}
 */
async function unloadAllLoadedLmStudioModels(signal, options = {}) {
  const baseUrl = String(options.baseUrl || LM_STUDIO_BASE_URL_DEFAULT).replace(/\/$/, "");
  const discovered = await discoverLmStudioModels(baseUrl, signal);

  const unloadCandidates = new Set();
  discovered.forEach((item) => {
    const loadState = modelLoadStateFromData(item);
    if (!loadState.loaded) return;
    if (Array.isArray(item?.loaded_instances)) {
      item.loaded_instances.forEach((instance) => {
        const id = String(instance?.id || "").trim();
        if (id) unloadCandidates.add(id);
      });
      return;
    }
    const id = String(item?.id || item?.model || "").trim();
    if (id) unloadCandidates.add(id);
  });

  const unloaded = [];
  for (const modelName of unloadCandidates) {
    await unloadLmStudioModel(modelName, signal, { baseUrl, exactOnly: true });
    unloaded.push(modelName);
  }
  return unloaded;
}

/**
 * Load an auxiliary LM Studio model (embedding or vision). Used both
 * by the dedicated /api/models/load-embedding route and as a side
 * effect of the chat-model load route. Mirrors `loadLmStudioAuxModel`
 * from root server.js.
 *
 * @param {string | null | undefined} model
 * @param {AbortSignal | null | undefined} signal
 * @param {{ baseUrl?: string, contextLength?: number }} [options]
 * @returns {Promise<{ model: string, raw: any } | null>}
 */
async function loadLmStudioAuxModel(model, signal, options = {}) {
  const modelName = String(model || "").trim();
  if (!modelName) return null;
  const baseUrl = String(options.baseUrl || LM_STUDIO_BASE_URL_DEFAULT).replace(/\/$/, "");
  await unloadLmStudioModel(modelName, signal, { baseUrl });
  const url = `${baseUrl}/api/v1/models/load`;
  /** @type {Record<string, any>} */
  const payload = {
    model: modelName,
    echo_load_config: true,
  };
  const contextLength = positiveInteger(options.contextLength || 0);
  if (contextLength) payload.context_length = contextLength;
  const { response } = await postJsonWithFallback(url, payload, signal);
  const text = await response.text();
  /** @type {any} */
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(lmStudioErrorText(data.detail, data.error, text) || `LM Studio returned ${response.status}`);
  }
  return {
    model: loadedModelName(data, modelName),
    raw: data,
  };
}

/**
 * Pick the "loaded model" summary for a normalized model list. When
 * the upstream reports explicit load state, that drives the decision
 * AND updates the cross-route loadedLmStudioModelInfo. When upstream
 * is silent, falls back to whatever model the last load route
 * remembered. Mirrors `loadedModelSummary` from root server.js.
 *
 * @param {import("./lib/lmstudio-models.js").NormalizedModel[]} models
 * @returns {{
 *   loaded: boolean,
 *   loaded_model: string,
 *   loaded_model_name: string,
 *   loaded_context_length: number,
 *   load_state_known: boolean,
 * }}
 */
function loadedModelSummary(models) {
  const hasExplicitLoadState = models.some((model) => model.load_state_known);
  const active = models.find((model) => model.loaded && model.kind !== "embedding")
    || models.find((model) => model.loaded);
  const remembered = !hasExplicitLoadState && loadedLmStudioModelInfo?.model
    ? models.find((model) =>
        sameModelName(model.id, loadedLmStudioModelInfo.model) ||
        sameModelName(model.name, loadedLmStudioModelInfo.model))
    : null;
  const selected = active || remembered || null;

  if (hasExplicitLoadState) {
    loadedLmStudioModelInfo = selected ? {
      model: selected.id,
      context_length: selected.loaded_context_length || loadedLmStudioModelInfo?.context_length || 8192,
      max_context_length: selected.max_context_length || loadedLmStudioModelInfo?.max_context_length || 0,
    } : null;
  }

  return {
    loaded: !!selected,
    loaded_model: selected?.id || "",
    loaded_model_name: selected?.name || "",
    loaded_context_length: selected?.loaded_context_length || loadedLmStudioModelInfo?.context_length || 0,
    load_state_known: hasExplicitLoadState,
  };
}

/**
 * Probe whether the LM Studio HTTP server is reachable on the
 * configured base URL. Best-effort; returns false on any error.
 * Mirrors `isLmStudioServerOnline` from root server.js.
 *
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<boolean>}
 */
async function isLmStudioServerOnline(signal) {
  try {
    const response = await getTextWithFallback(`${LM_STUDIO_BASE_URL_DEFAULT}/api/v1/models`, signal);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Poll isLmStudioServerOnline at 1 Hz until it returns true or the
 * timeout elapses. Mirrors `waitForLmStudioServer` from root.
 *
 * @param {AbortSignal | null | undefined} signal
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
async function waitForLmStudioServer(signal, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isLmStudioServerOnline(signal)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * Coarse classification of LM Studio proxy errors into a small set of
 * code strings the client can branch on (server offline, model not
 * loaded, context too long, etc). Empty string for unrecognized
 * shapes. Mirrors `classifyLmStudioProxyError`.
 *
 * @param {string | undefined | null} message
 * @param {number} [status]
 * @returns {string}
 */
function classifyLmStudioProxyError(message = "", status = 0) {
  const normalized = String(message || "").toLowerCase();
  if (/context length|tokens to keep|too many tokens|prompt.*too long|input.*too long|shorter input|larger context/.test(normalized)) return "lmstudio_context_length";
  if (/econnrefused|connection refused|fetch failed|socket hang up|enotfound|ehostunreach|network/.test(normalized)) return "lmstudio_server_offline";
  if (/timeout|timed out|aborted/.test(normalized)) return "lmstudio_timeout";
  if (/model .*not found|model_not_found|model does not exist|model .*not loaded|no model loaded/.test(normalized)) return "lmstudio_model_not_loaded";
  if (/unexpected token|invalid json|malformed|choices/.test(normalized)) return "lmstudio_bad_response";
  if (status === 404) return "lmstudio_endpoint_missing";
  if ([502, 503, 504].includes(status)) return "lmstudio_server_offline";
  return "";
}

/**
 * Heuristic detector for the "model not loaded" class of LM Studio
 * upstream errors. Looks at the raw error text (or stringified JSON
 * body) plus the HTTP status. Mirrors `lmStudioChatNeedsModelLoad`.
 *
 * @param {unknown} text
 * @param {number} [status]
 * @returns {boolean}
 */
function lmStudioChatNeedsModelLoad(text = "", status = 0) {
  const value = typeof text === "string" ? text : JSON.stringify(text || "");
  if (/no models loaded|model .*not loaded|no model loaded|please load a model/i.test(value)) return true;
  return status === 400 && /model/i.test(value) && /load/i.test(value);
}

/**
 * Remove the load-config fields that should never leak into a chat
 * payload. Mirrors `stripLmStudioLoadFields`.
 *
 * @param {Record<string, any>} [payload]
 * @returns {Record<string, any>}
 */
function stripLmStudioLoadFields(payload = {}) {
  const nextPayload = { ...payload };
  delete nextPayload.context_length;
  delete nextPayload.max_context_length;
  delete nextPayload.max_context_source;
  delete nextPayload.model_info;
  return nextPayload;
}

/**
 * Resolve the context length to use when autoloading a model in
 * response to a chat request. Caps the requested length at the
 * known/declared maximum. Returns 0 when no length can be inferred.
 * Mirrors `lmStudioAutoloadContext`.
 *
 * @param {Record<string, any>} [payload]
 * @param {string} [model]
 * @returns {number}
 */
function lmStudioAutoloadContext(payload = {}, model = "") {
  const contextLength = positiveInteger(
    payload.context_length || loadedLmStudioModelInfo?.context_length || 0
  );
  if (!contextLength) return 0;
  const maxContext = positiveInteger(
    payload.max_context_length
      || loadedLmStudioModelInfo?.max_context_length
      || knownModelMaxContext(model)
  );
  return maxContext ? Math.min(contextLength, maxContext) : contextLength;
}

/**
 * Discover the chat models LM Studio knows about. Tries /api/v0/models
 * then /api/v1/models, returning the first non-empty chat-only list.
 * Mirrors `discoverLmStudioChatModels`.
 *
 * @param {string} baseUrl
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<import("./lib/lmstudio-models.js").NormalizedModel[]>}
 */
async function discoverLmStudioChatModels(baseUrl, signal) {
  const root = String(baseUrl || LM_STUDIO_BASE_URL_DEFAULT).replace(/\/$/, "");
  const candidates = [`${root}/api/v0/models`, `${root}/api/v1/models`];
  const errors = [];
  for (const url of candidates) {
    try {
      const response = await getTextWithFallback(url, signal);
      if (!response.ok) {
        errors.push(`${url} returned ${response.status}`);
        continue;
      }
      const models = normalizeModelList(JSON.parse(response.text))
        .filter((item) => item.kind !== "embedding");
      if (models.length) return models;
      errors.push(`${url} returned no chat models`);
    } catch (error) {
      if (/** @type {any} */ (error)?.name === "AbortError") throw error;
      errors.push(`${url}: ${/** @type {Error} */ (error).message}`);
    }
  }
  throw new Error(errors.join("; ") || "No LM Studio chat models found.");
}

/**
 * Pick the best LM Studio chat model to autoload. Prefers a model
 * matching `preferredModel` by name; otherwise sorts by
 * autoLoadModelScore (lower is better). Returns null if discovery
 * returns no models. Mirrors `chooseLmStudioAutoloadModel`.
 *
 * @param {string} baseUrl
 * @param {AbortSignal | null | undefined} signal
 * @param {string} [preferredModel]
 * @returns {Promise<import("./lib/lmstudio-models.js").NormalizedModel | null>}
 */
async function chooseLmStudioAutoloadModel(baseUrl, signal, preferredModel = "") {
  const models = await discoverLmStudioChatModels(baseUrl, signal);
  const preferred = models.find((item) =>
    sameModelName(item.id, preferredModel) || sameModelName(item.name, preferredModel)
  );
  if (preferred) return preferred;
  return models
    .slice()
    .sort((a, b) => autoLoadModelScore(a) - autoLoadModelScore(b))[0] || null;
}

/**
 * @typedef {Object} AutoloadChatResult
 * @property {any}     response          The fetch-like upstream response.
 * @property {boolean} fallback          Whether the request went through
 *                                       the node-http fallback path.
 * @property {boolean} [directLoopback]  Set when the loopback short
 *                                       circuit fired.
 * @property {unknown} [fetchError]      Original fetch error if any.
 * @property {boolean} autoLoaded        True when this call triggered
 *                                       a model load and retry.
 * @property {string}  [autoLoadedModel] Model name as loaded.
 * @property {string}  [autoSelectedModel] Different from the request
 *                                         only when the requested model
 *                                         was unavailable and a
 *                                         fallback was picked.
 */

/**
 * POST the chat payload, and if LM Studio responds with a "no model
 * loaded" error, load the requested model (or a sensible fallback)
 * and retry once. Mirrors `postLocalChatWithModelAutoload`.
 *
 * Non-lm-studio providers skip the autoload step and return
 * `{ ...result, autoLoaded: false }`.
 *
 * @param {{ chatUrl: string, payload: any, provider: string,
 *           model?: string, signal?: AbortSignal | null }} input
 * @returns {Promise<AutoloadChatResult>}
 */
async function postLocalChatWithModelAutoload({ chatUrl, payload, provider, model, signal }) {
  const chatPayload = stripLmStudioLoadFields(payload);
  let result = await postJsonWithFallback(chatUrl, chatPayload, signal);
  if (provider !== "lm-studio") {
    return { ...result, autoLoaded: false };
  }

  let probeText = "";
  try {
    probeText = typeof result.response.clone === "function"
      ? await result.response.clone().text()
      : await result.response.text();
  } catch {
    probeText = "";
  }

  if (!result.response.ok && lmStudioChatNeedsModelLoad(probeText, result.response.status)) {
    const baseUrl = new URL(chatUrl).origin;
    const requestedModel = model || payload.model;
    let selectedModel = requestedModel;
    /** @type {{ model: string, raw: any } | null} */
    let loaded = null;
    try {
      loaded = await loadLmStudioAuxModel(selectedModel, signal, {
        baseUrl,
        contextLength: lmStudioAutoloadContext(payload, selectedModel),
      });
    } catch (error) {
      if (requestedModel) throw error;
      const fallback = await chooseLmStudioAutoloadModel(baseUrl, signal, requestedModel);
      if (!fallback || sameModelName(fallback.id, requestedModel)) throw error;
      selectedModel = fallback.id;
      loaded = await loadLmStudioAuxModel(selectedModel, signal, {
        baseUrl,
        contextLength: lmStudioAutoloadContext(payload, selectedModel),
      });
    }
    const loadedContext = loadedModelContext(
      loaded?.raw,
      loadedLmStudioModelInfo?.context_length || 0
    );
    loadedLmStudioModelInfo = {
      model: loaded?.model || selectedModel,
      context_length: loadedContext || loadedLmStudioModelInfo?.context_length || 8192,
      max_context_length: loadedLmStudioModelInfo?.max_context_length || 0,
    };
    chatPayload.model = loaded?.model || selectedModel;
    result = await postJsonWithFallback(chatUrl, chatPayload, signal);
    return {
      ...result,
      autoLoaded: true,
      autoLoadedModel: loaded?.model || selectedModel,
      autoSelectedModel: !sameModelName(selectedModel, requestedModel) ? selectedModel : "",
    };
  }

  return { ...result, autoLoaded: false };
}

module.exports = {
  DEFAULT_LM_STUDIO_DOWNLOAD_MODEL,
  calculateModelBudget,
  classifyLmStudioProxyError,
  chooseLmStudioAutoloadModel,
  discoverLmStudioChatModels,
  estimateModelBudgetTokens,
  getLmStudioBudgetModel,
  getLmStudioSdkClient,
  isLmStudioServerOnline,
  knownModelMaxContext,
  lmStudioAutoloadContext,
  lmStudioChatNeedsModelLoad,
  lmStudioErrorText,
  lmStudioWebSocketBaseUrl,
  loadedModelSummary,
  loadLmStudioAuxModel,
  unloadAllLoadedLmStudioModels,
  unloadLmStudioModel,
  postLocalChatWithModelAutoload,
  stripLmStudioLoadFields,
  waitForLmStudioServer,
  getLoadedLmStudioModelInfo,
  setLoadedLmStudioModelInfo,
};
