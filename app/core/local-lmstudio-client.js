// Browser-side LM Studio 0.4.x client.
// Public Web builds must talk to the visitor's loopback server directly;
// they must never fall back to the VPS-local proxy routes.

window.AISystem6LocalLMStudio = (() => {
  const DEFAULT_BASE_URL = "http://127.0.0.1:1234";
  const API_VERSION = "v1";
  const REQUEST_TIMEOUT_MS = 10000;
  const INFERENCE_TIMEOUT_MS = 180000;
  let connected = false;
  let lastModels = [];

  function normalizeBaseUrl(value = "") {
    const raw = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("lmstudio_endpoint_invalid");
    }
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
      throw new Error("lmstudio_loopback_required");
    }
    if (parsed.username || parsed.password || (parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
      throw new Error("lmstudio_endpoint_invalid");
    }
    return parsed.origin;
  }

  function currentConfig() {
    const endpoint = document.getElementById("endpoint")?.value || DEFAULT_BASE_URL;
    const token = document.getElementById("local-api-token")?.value?.trim() || "";
    return {
      baseUrl: normalizeBaseUrl(endpoint),
      token,
    };
  }

  function isPublicWebMode() {
    const hostname = String(window.location?.hostname || "").toLowerCase();
    return ["http:", "https:"].includes(window.location?.protocol)
      && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
  }

  async function browserPermissionState() {
    if (!navigator.permissions?.query) return "unsupported";
    try {
      const status = await navigator.permissions.query({ name: "local-network-access" });
      return status?.state || "unsupported";
    } catch {
      return "unsupported";
    }
  }

  function requestHeaders(extra = {}) {
    const { token } = currentConfig();
    const headers = new Headers(extra);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  }

  function requestSignal(signal, timeoutMs = REQUEST_TIMEOUT_MS) {
    const timeout = Number(timeoutMs);
    if (!Number.isFinite(timeout) || timeout <= 0) return signal;
    if (typeof AbortSignal?.timeout === "function") {
      const timeoutSignal = AbortSignal.timeout(timeout);
      if (!signal) return timeoutSignal;
      if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeoutSignal]);
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException("LM Studio request timed out.", "TimeoutError")),
      timeout
    );
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      controller.abort(signal.reason);
    }, { once: true });
    return controller.signal;
  }

  function networkError(error) {
    if (error?.name === "TimeoutError" || /timed out|timeout/i.test(String(error?.message || ""))) {
      return new Error(`lmstudio_timeout: ${error?.message || error}`);
    }
    if (error?.name === "AbortError") return error;
    return new Error(`lmstudio_cors_or_offline: ${error?.message || error}`);
  }

  function errorDetail(data, fallback = "") {
    if (!data) return fallback;
    if (typeof data === "string") return data || fallback;
    return data.detail || data.error?.message || data.error || data.message || fallback;
  }

  async function lmStudioFetch(path, options = {}) {
    const { baseUrl } = currentConfig();
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      // Safari/WebKit requires the destination address space to be explicit
      // when a secure public page calls a plain-HTTP loopback service.
      targetAddressSpace: "loopback",
      headers: requestHeaders(options.headers),
    });
    return response;
  }

  async function readErrorResponse(response) {
    const text = await response.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    const detail = String(errorDetail(data, text || response.statusText || `HTTP ${response.status}`)).slice(0, 1200);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`lmstudio_auth_failed: ${detail}`);
    }
    if (response.status === 404) {
      throw new Error(`lmstudio_v1_required: ${detail}`);
    }
    throw new Error(`${classifyError(detail, response.status)}: ${detail}`);
  }

  function normalizedModel(model = {}) {
    const instances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
    const loaded = instances.length > 0;
    const firstInstance = instances[0] || {};
    const type = model.type === "embedding" ? "embedding" : "llm";
    return {
      id: String(model.key || ""),
      name: String(model.display_name || model.key || ""),
      type,
      loaded,
      instance_id: String(firstInstance.id || ""),
      loaded_context_length: Number(firstInstance.config?.context_length || 0),
      max_context_length: Number(model.max_context_length || 0),
      max_context_source: "lmstudio-v1",
      vision: !!model.capabilities?.vision,
      raw: model,
    };
  }

  async function listModels(options = {}) {
    let response;
    try {
      response = await lmStudioFetch("/api/v1/models", {
        method: "GET",
        signal: requestSignal(options.signal, options.timeoutMs),
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      connected = false;
      if (await browserPermissionState() === "denied") {
        throw new Error("lmstudio_browser_permission_denied");
      }
      throw networkError(error);
    }
    if (!response.ok) {
      connected = false;
      await readErrorResponse(response);
    }
    const data = await response.json().catch(() => {
      throw new Error("lmstudio_bad_response: /api/v1/models did not return JSON");
    });
    if (!Array.isArray(data.models)) {
      connected = false;
      throw new Error("lmstudio_v1_required: /api/v1/models response is incompatible");
    }
    connected = true;
    lastModels = data.models.map(normalizedModel).filter((model) => model.id);
    return {
      models: lastModels,
      chatModels: lastModels.filter((model) => model.type === "llm"),
      embeddingModels: lastModels.filter((model) => model.type === "embedding"),
      loaded: lastModels.some((model) => model.type === "llm" && model.loaded),
      loaded_model: lastModels.find((model) => model.type === "llm" && model.loaded)?.id || "",
      loaded_context_length: lastModels.find((model) => model.type === "llm" && model.loaded)?.loaded_context_length || 0,
      browserPermission: await browserPermissionState(),
    };
  }

  async function unloadInstance(instanceId, signal) {
    const id = String(instanceId || "").trim();
    if (!id) return null;
    const response = await lmStudioFetch("/api/v1/models/unload", {
      method: "POST",
      signal: requestSignal(signal, 60000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ instance_id: id }),
    });
    if (!response.ok) await readErrorResponse(response);
    return response.json().catch(() => ({ instance_id: id }));
  }

  async function loadModel(model, options = {}) {
    const modelId = String(model || "").trim();
    if (!modelId) throw new Error("lmstudio_model_missing");
    const payload = { model: modelId };
    const contextLength = Number(options.contextLength || 0);
    if (Number.isFinite(contextLength) && contextLength > 0) payload.context_length = Math.round(contextLength);
    const response = await lmStudioFetch("/api/v1/models/load", {
      method: "POST",
      signal: requestSignal(options.signal, options.timeoutMs || 120000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) await readErrorResponse(response);
    const data = await response.json().catch(() => ({}));
    const refreshed = await listModels({ signal: options.signal });
    const loaded = refreshed.models.find((item) => item.id === modelId && item.loaded)
      || refreshed.models.find((item) => item.loaded && item.name === modelId)
      || null;
    return {
      loaded: true,
      model: loaded?.id || data.model || modelId,
      context_length: loaded?.loaded_context_length || contextLength || 0,
      max_context_length: loaded?.max_context_length || 0,
      max_context_source: "lmstudio-v1",
      raw: data,
    };
  }

  function stripClientOnlyFields(payload = {}) {
    const next = { ...payload };
    [
      "_local_provider",
      "_local_endpoint",
      "_local_model",
      "context_length",
      "max_context_length",
      "max_context_source",
      "model_info",
      "ai_system6_task_kind",
      "ai_system6_enable_thinking",
    ].forEach((key) => delete next[key]);
    return next;
  }

  function needsModelLoad(text = "", status = 0) {
    const value = String(text || "");
    return /no models loaded|model .*not loaded|no model loaded|please load a model/i.test(value)
      || (status === 400 && /model/i.test(value) && /load/i.test(value));
  }

  async function chat(payload, options = {}) {
    const requestPayload = stripClientOnlyFields(payload);
    const post = () => lmStudioFetch("/v1/chat/completions", {
      method: "POST",
      signal: requestSignal(options.signal, options.timeoutMs || INFERENCE_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: requestPayload.stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify(requestPayload),
    });
    let response;
    try {
      response = await post();
    } catch (error) {
      connected = false;
      throw networkError(error);
    }
    if (!response.ok && options.autoLoad !== false) {
      const probeText = await response.clone().text().catch(() => "");
      if (needsModelLoad(probeText, response.status) && requestPayload.model) {
        await loadModel(requestPayload.model, {
          signal: options.signal,
          contextLength: options.contextLength,
        });
        response = await post();
      }
    }
    if (!response.ok) await readErrorResponse(response);
    connected = true;
    return response;
  }

  async function embed(payload, options = {}) {
    const requestPayload = stripClientOnlyFields(payload);
    const post = () => lmStudioFetch("/v1/embeddings", {
      method: "POST",
      signal: requestSignal(options.signal, options.timeoutMs || INFERENCE_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestPayload),
    });
    let response;
    try {
      response = await post();
    } catch (error) {
      connected = false;
      throw networkError(error);
    }
    if (!response.ok && options.autoLoad !== false) {
      const probeText = await response.clone().text().catch(() => "");
      if (needsModelLoad(probeText, response.status) && requestPayload.model) {
        await loadModel(requestPayload.model, { signal: options.signal });
        response = await post();
      }
    }
    if (!response.ok) await readErrorResponse(response);
    connected = true;
    return response;
  }

  function classifyError(message = "", status = 0) {
    const value = String(message || "").toLowerCase();
    if (status === 401 || status === 403 || /unauthorized|forbidden|api token|authentication/.test(value)) return "lmstudio_auth_failed";
    if (status === 404 || /api\/v1|not found/.test(value)) return "lmstudio_v1_required";
    if (/cors|load failed|failed to fetch|networkerror|network request failed/.test(value)) return "lmstudio_cors_or_offline";
    if (/context length|too many tokens|prompt.*too long/.test(value)) return "lmstudio_context_length";
    if (/no models loaded|model .*not loaded|please load a model/.test(value)) return "lmstudio_model_not_loaded";
    if (/timeout|timed out/.test(value)) return "lmstudio_timeout";
    return "lmstudio_request_failed";
  }

  function parseJsonText(text = "") {
    if (window.AISystem6ModelTaskRuntime?.parseJsonText) {
      return window.AISystem6ModelTaskRuntime.parseJsonText(text);
    }
    const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(clean);
    } catch {
      const objectStart = clean.indexOf("{");
      const objectEnd = clean.lastIndexOf("}");
      if (objectStart >= 0 && objectEnd > objectStart) {
        try {
          return JSON.parse(clean.slice(objectStart, objectEnd + 1));
        } catch {}
      }
      const arrayStart = clean.indexOf("[");
      const arrayEnd = clean.lastIndexOf("]");
      if (arrayStart >= 0 && arrayEnd > arrayStart) {
        try {
          return JSON.parse(clean.slice(arrayStart, arrayEnd + 1));
        } catch {}
      }
      return null;
    }
  }

  function isConnected() {
    return connected;
  }

  function models() {
    return [...lastModels];
  }

  return Object.freeze({
    API_VERSION,
    DEFAULT_BASE_URL,
    REQUEST_TIMEOUT_MS,
    INFERENCE_TIMEOUT_MS,
    isPublicWebMode,
    browserPermissionState,
    normalizeBaseUrl,
    currentConfig,
    listModels,
    loadModel,
    unloadInstance,
    chat,
    embed,
    classifyError,
    parseJsonText,
    isConnected,
    models,
  });
})();
