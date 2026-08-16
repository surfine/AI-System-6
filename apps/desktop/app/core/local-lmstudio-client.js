// Browser-side client for local LM Studio and Ollama servers.
// Public Web builds must talk to the visitor's loopback server directly;
// they must never fall back to the VPS-local proxy routes.

window.AISystem6LocalLMStudio = (() => {
  const DEFAULT_BASE_URL = "http://127.0.0.1:1234";
  const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
  const API_VERSION = "v1";
  const REQUEST_TIMEOUT_MS = 10000;
  // Bounds silence, not total generation time. A healthy streaming server can
  // run for minutes as long as it keeps producing model-load, prompt, or token
  // events; a socket that never returns headers or stops producing bytes must
  // release the desk instead of leaving Busy stuck forever.
  const INFERENCE_TIMEOUT_MS = 45000;
  let connected = false;
  let lastModels = [];

  function currentProvider() {
    const value = document.getElementById("local-provider")?.value || "lm-studio";
    return value === "ollama" ? "ollama" : "lm-studio";
  }

  function defaultBaseUrl(provider = currentProvider()) {
    return provider === "ollama" ? DEFAULT_OLLAMA_BASE_URL : DEFAULT_BASE_URL;
  }

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
    const provider = currentProvider();
    const endpoint = document.getElementById("endpoint")?.value || defaultBaseUrl(provider);
    const token = document.getElementById("local-api-token")?.value?.trim() || "";
    return {
      baseUrl: normalizeBaseUrl(endpoint),
      provider,
      token: provider === "lm-studio" ? token : "",
    };
  }

  function isPublicWebMode() {
    const hostname = String(window.location?.hostname || "").toLowerCase();
    return ["http:", "https:"].includes(window.location?.protocol)
      && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
  }

  function isSafariBrowser() {
    const userAgent = String(navigator.userAgent || "");
    const vendor = String(navigator.vendor || "");
    return /AppleWebKit/i.test(userAgent)
      && /Safari/i.test(userAgent)
      && /Apple/i.test(vendor)
      && !/(CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Edg|OPR)/i.test(userAgent);
  }

  function isSafariPublicWebUnsupported() {
    return isPublicWebMode() && window.location?.protocol === "https:" && isSafariBrowser();
  }

  function isSafariHttpLocalMode() {
    return isPublicWebMode() && window.location?.protocol === "http:" && isSafariBrowser();
  }

  function httpLocalEntryUrl(origin = "") {
    let targetOrigin;
    try {
      targetOrigin = new URL(String(origin || ""));
    } catch {
      throw new Error("lmstudio_safari_http_unavailable");
    }
    if (
      targetOrigin.protocol !== "http:"
      || targetOrigin.username
      || targetOrigin.password
      || targetOrigin.pathname !== "/"
      || targetOrigin.search
      || targetOrigin.hash
    ) {
      throw new Error("lmstudio_safari_http_unavailable");
    }
    const current = new URL(window.location.href);
    current.protocol = targetOrigin.protocol;
    current.hostname = targetOrigin.hostname;
    current.port = targetOrigin.port;
    return current.href;
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

  function responseTimeoutGuard(signal, timeoutMs = INFERENCE_TIMEOUT_MS) {
    const timeout = Number(timeoutMs);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return { signal, timedOut: false, clear() {} };
    }
    const controller = new AbortController();
    let timedOut = false;
    const abortFromParent = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromParent();
    else signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("LM Studio did not begin responding in time.", "TimeoutError"));
    }, timeout);
    return {
      signal: controller.signal,
      get timedOut() {
        return timedOut;
      },
      clear() {
        clearTimeout(timer);
        // Keep the one-shot parent abort bridge alive for the response body.
        // Clearing only the initial-response deadline must not break the Stop
        // button after streaming headers have already arrived.
      },
    };
  }

  function networkError(error, signal) {
    if (error?.name === "TimeoutError" || /timed out|timeout/i.test(String(error?.message || ""))) {
      return new Error(`lmstudio_timeout: ${error?.message || error}`);
    }
    if (error?.name === "AbortError") {
      // WebKit reports a timed-out fetch as a plain AbortError; the actual
      // reason lives on the signal. Without this, a server that hangs is
      // silently treated as a user cancellation and no error is shown.
      const reason = signal?.reason || error?.reason;
      if (reason?.name === "TimeoutError" || /timed out|timeout/i.test(String(reason?.message || ""))) {
        return new Error(`lmstudio_timeout: ${reason?.message || "request timed out"}`);
      }
      return error;
    }
    return new Error(`lmstudio_cors_or_offline: ${error?.message || error}`);
  }

  function responseWithIdleTimeout(response, timeoutMs = INFERENCE_TIMEOUT_MS) {
    const timeout = Number(timeoutMs);
    const reader = response?.body?.getReader?.();
    if (!reader || !Number.isFinite(timeout) || timeout <= 0) return response;
    const stream = new ReadableStream({
      async pull(controller) {
        let timer;
        try {
          const result = await Promise.race([
            reader.read(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("lmstudio_timeout: LM Studio stopped responding.")),
                timeout
              );
            }),
          ]);
          if (result.done) controller.close();
          else controller.enqueue(result.value);
        } catch (error) {
          reader.cancel(error).catch(() => {});
          controller.error(error);
        } finally {
          clearTimeout(timer);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  function errorDetail(data, fallback = "") {
    if (!data) return fallback;
    if (typeof data === "string") return data || fallback;
    return data.detail || data.error?.message || data.error || data.message || fallback;
  }

  async function localModelFetch(path, options = {}) {
    const { baseUrl } = currentConfig();
    const { responseTimeoutMs = 0, ...fetchOptions } = options;
    const guard = responseTimeoutGuard(fetchOptions.signal, responseTimeoutMs);
    const requestOptions = {
      ...fetchOptions,
      signal: guard.signal,
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: requestHeaders(fetchOptions.headers),
    };
    // Chromium's Local Network Access flow needs this hint. WebKit rejects the
    // non-standard option in affected Safari versions, including on the HTTP
    // local entry where the request itself is otherwise allowed.
    if (!isSafariBrowser()) requestOptions.targetAddressSpace = "loopback";
    try {
      return await fetch(`${baseUrl}${path}`, requestOptions);
    } catch (error) {
      if (guard.timedOut) throw networkError(error, guard.signal);
      throw error;
    } finally {
      guard.clear();
    }
  }

  async function readErrorResponse(response, provider = currentProvider()) {
    const text = await response.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    // This module also runs outside the app bundle (its own test harness), so
    // the shared body-is-not-a-message rule is used when it is present.
    const fallback = typeof serviceErrorDetail === "function"
      ? serviceErrorDetail(response.status, text)
      : (text || response.statusText || `HTTP ${response.status}`);
    const detail = String(errorDetail(data, fallback)).slice(0, 1200);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`lmstudio_auth_failed: ${detail}`);
    }
    if (provider === "ollama" && response.status === 404) {
      throw new Error(`ollama_api_incompatible: ${detail}`);
    }
    if (provider === "lm-studio" && response.status === 404) {
      throw new Error(`lmstudio_v1_required: ${detail}`);
    }
    throw new Error(`${classifyError(detail, response.status, provider)}: ${detail}`);
  }

  function ollamaContextLength(modelInfo = {}) {
    return Object.entries(modelInfo).reduce((largest, [key, value]) => {
      if (!/\.context_length$/.test(key)) return largest;
      const length = Number(value || 0);
      return Number.isFinite(length) ? Math.max(largest, length) : largest;
    }, 0);
  }

  function normalizedOllamaModel(model = {}, detail = {}, running = null) {
    const id = String(model.model || model.name || "");
    const capabilities = Array.isArray(detail.capabilities) ? detail.capabilities : [];
    const embedding = capabilities.includes("embedding")
      || (!capabilities.includes("completion") && /(^|[-_:])(embed|embedding)|all-minilm|bge-|e5-/i.test(id));
    return {
      id,
      name: String(model.name || id),
      type: embedding ? "embedding" : "llm",
      loaded: !!running,
      instance_id: running ? id : "",
      loaded_context_length: Number(running?.context_length || 0),
      max_context_length: ollamaContextLength(detail.model_info),
      max_context_source: "ollama-show",
      vision: capabilities.includes("vision"),
      raw: { ...model, detail, running },
    };
  }

  async function fetchOllamaJson(path, options = {}) {
    const response = await localModelFetch(path, options);
    if (!response.ok) await readErrorResponse(response, "ollama");
    return response.json().catch(() => {
      throw new Error(`ollama_bad_response: ${path} did not return JSON`);
    });
  }

  async function listOllamaModels(options = {}) {
    const signal = requestSignal(options.signal, options.timeoutMs);
    const tags = await fetchOllamaJson("/api/tags", {
      method: "GET",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!Array.isArray(tags.models)) throw new Error("ollama_api_incompatible: /api/tags response is incompatible");
    const runningData = await fetchOllamaJson("/api/ps", {
      method: "GET",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).catch(() => ({ models: [] }));
    const runningModels = Array.isArray(runningData.models) ? runningData.models : [];
    const details = await Promise.all(tags.models.map((model) => fetchOllamaJson("/api/show", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model: model.model || model.name }),
    }).catch(() => ({}))));
    lastModels = tags.models.map((model, index) => {
      const id = String(model.model || model.name || "");
      const running = runningModels.find((item) => String(item.model || item.name || "") === id) || null;
      return normalizedOllamaModel(model, details[index], running);
    }).filter((model) => model.id);
    connected = true;
    const chatModels = lastModels.filter((model) => model.type === "llm");
    const embeddingModels = lastModels.filter((model) => model.type === "embedding");
    const loadedChat = chatModels.find((model) => model.loaded);
    return {
      provider: "ollama",
      autoLoad: true,
      models: lastModels,
      chatModels,
      embeddingModels,
      loaded: !!loadedChat,
      loaded_model: loadedChat?.id || "",
      loaded_context_length: loadedChat?.loaded_context_length || 0,
      browserPermission: await browserPermissionState(),
    };
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
    if (isSafariPublicWebUnsupported()) {
      connected = false;
      throw new Error("lmstudio_safari_unsupported");
    }
    const { provider } = currentConfig();
    let response;
    let signal;
    try {
      if (provider === "ollama") return await listOllamaModels(options);
      signal = requestSignal(options.signal, options.timeoutMs);
      response = await localModelFetch("/api/v1/models", {
        method: "GET",
        signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      connected = false;
      if (await browserPermissionState() === "denied") {
        throw new Error("lmstudio_browser_permission_denied");
      }
      if (provider === "ollama") {
        throw new Error(`ollama_cors_or_offline: ${error?.message || error}`);
      }
      throw networkError(error, signal);
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
      provider: "lm-studio",
      autoLoad: false,
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
    if (currentProvider() === "ollama") return null;
    const id = String(instanceId || "").trim();
    if (!id) return null;
    const response = await localModelFetch("/api/v1/models/unload", {
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
    if (currentProvider() === "ollama") {
      const catalog = lastModels.length ? lastModels : (await listModels(options)).models;
      if (!catalog.some((item) => item.id === modelId || item.name === modelId)) {
        throw new Error(`ollama_model_missing: ${modelId}`);
      }
      return { loaded: false, autoLoad: true, model: modelId, context_length: 0 };
    }
    const payload = { model: modelId };
    const contextLength = Number(options.contextLength || 0);
    if (Number.isFinite(contextLength) && contextLength > 0) payload.context_length = Math.round(contextLength);
    const response = await localModelFetch("/api/v1/models/load", {
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
      "_lmstudio_previous_response_id",
      "_lmstudio_previous_response_api",
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

  function nativeV1ChatRequest(payload = {}, options = {}) {
    if (currentProvider() !== "lm-studio") return null;
    if (payload.tools || payload.tool_choice || payload.response_format) return null;

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const previousResponseId = String(payload._lmstudio_previous_response_id || "").trim();
    const previousResponseApi = String(payload._lmstudio_previous_response_api || "").trim();
    if (previousResponseId && previousResponseApi && previousResponseApi !== "lmstudio-native-v1") return null;
    const unsupportedHistory = messages.some((message) => !["system", "user"].includes(String(message?.role || "")));
    if (unsupportedHistory && !previousResponseId) return null;

    const userMessages = messages.filter((message) => message?.role === "user");
    const inputMessages = previousResponseId ? userMessages.slice(-1) : userMessages;
    if (!inputMessages.length) return null;

    const request = {
      model: String(payload.model || "").trim(),
      input: inputMessages.length === 1
        ? String(inputMessages[0].content || "")
        : inputMessages.map((message) => ({ type: "message", content: String(message.content || "") })),
      stream: payload.stream === true,
      store: true,
    };
    if (!request.model || (typeof request.input === "string" && !request.input.trim())) return null;

    if (previousResponseId) {
      request.previous_response_id = previousResponseId;
    } else {
      const systemPrompt = messages
        .filter((message) => message?.role === "system")
        .map((message) => String(message.content || "").trim())
        .filter(Boolean)
        .join("\n\n");
      if (systemPrompt) request.system_prompt = systemPrompt;
    }

    const contextLength = Number(options.contextLength || payload.context_length || 0);
    if (Number.isFinite(contextLength) && contextLength > 0) request.context_length = Math.round(contextLength);
    ["temperature", "top_p", "top_k", "min_p", "repeat_penalty"].forEach((key) => {
      const value = Number(payload[key]);
      if (Number.isFinite(value)) request[key] = value;
    });
    const maxOutputTokens = Number(payload.max_output_tokens || payload.max_tokens || 0);
    if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
      request.max_output_tokens = Math.round(maxOutputTokens);
    }
    return request;
  }

  function nativeV1Usage(stats = {}) {
    const promptTokens = Number(stats.input_tokens || 0);
    const completionTokens = Number(stats.total_output_tokens || 0);
    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
  }

  function nativeV1MessageText(data = {}) {
    return (Array.isArray(data.output) ? data.output : [])
      .filter((item) => item?.type === "message")
      .map((item) => String(item.content || ""))
      .join("");
  }

  function openAiChatEnvelope(data = {}, content = nativeV1MessageText(data)) {
    return {
      id: String(data.response_id || ""),
      object: "chat.completion",
      model: String(data.model_instance_id || ""),
      choices: [{
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      }],
      usage: nativeV1Usage(data.stats),
      ai_system6_lmstudio_api: "lmstudio-native-v1",
      ai_system6_lmstudio_response_id: String(data.response_id || ""),
    };
  }

  function responsesV1InputItems(messages = []) {
    const items = [];
    messages.forEach((message) => {
      const role = String(message?.role || "");
      if (role === "tool") {
        items.push({
          type: "function_call_output",
          call_id: String(message.tool_call_id || message.id || ""),
          output: String(message.content || ""),
        });
        return;
      }
      const content = typeof message?.content === "string" ? message.content : "";
      if (content && ["system", "user", "assistant"].includes(role)) {
        items.push({ role, content });
      }
      if (role === "assistant" && Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((call) => {
          items.push({
            type: "function_call",
            call_id: String(call?.id || ""),
            name: String(call?.function?.name || ""),
            arguments: String(call?.function?.arguments || "{}"),
          });
        });
      }
    });
    return items.filter((item) => item.type !== "function_call_output" || item.call_id);
  }

  function responsesV1Tools(tools = []) {
    return (Array.isArray(tools) ? tools : []).map((tool) => {
      if (tool?.type !== "function" || !tool.function?.name) return null;
      return {
        type: "function",
        name: String(tool.function.name),
        description: String(tool.function.description || ""),
        parameters: tool.function.parameters || { type: "object", properties: {} },
        ...(typeof tool.function.strict === "boolean" ? { strict: tool.function.strict } : {}),
      };
    }).filter(Boolean);
  }

  function responsesV1Request(payload = {}, options = {}, forceFresh = false) {
    if (currentProvider() !== "lm-studio" || payload.response_format) return null;
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const model = String(payload.model || "").trim();
    if (!model || !messages.length) return null;
    const previousResponseId = forceFresh ? "" : String(payload._lmstudio_previous_response_id || "").trim();
    const previousResponseApi = String(payload._lmstudio_previous_response_api || "").trim();
    const canContinue = previousResponseId && previousResponseApi === "lmstudio-responses-v1";
    // With previous_response_id, LM Studio already owns every item through
    // the preceding response. Only return outputs for the most recent tool
    // calls; replaying older outputs on round three can duplicate a call_id
    // that is already committed in the server-side response chain.
    const latestAssistantIndex = messages.findLastIndex((message) => message?.role === "assistant");
    const toolOutputs = messages
      .slice(latestAssistantIndex + 1)
      .filter((message) => message?.role === "tool");
    const latestUser = [...messages].reverse().find((message) => message?.role === "user");
    const input = canContinue
      ? (toolOutputs.length ? responsesV1InputItems(toolOutputs) : latestUser ? [{ role: "user", content: String(latestUser.content || "") }] : [])
      : responsesV1InputItems(messages);
    if (!input.length) return null;
    const request = { model, input, stream: payload.stream === true, store: true };
    if (canContinue) request.previous_response_id = previousResponseId;
    const tools = responsesV1Tools(payload.tools);
    if (tools.length) {
      request.tools = tools;
      if (payload.tool_choice) request.tool_choice = payload.tool_choice;
    }
    ["temperature", "top_p"].forEach((key) => {
      const value = Number(payload[key]);
      if (Number.isFinite(value)) request[key] = value;
    });
    const maxOutputTokens = Number(payload.max_output_tokens || payload.max_tokens || 0);
    if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) request.max_output_tokens = Math.round(maxOutputTokens);
    return request;
  }

  function responsesV1Message(data = {}) {
    const output = Array.isArray(data.output) ? data.output : [];
    const content = output
      .filter((item) => item?.type === "message")
      .flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .filter((item) => ["output_text", "text"].includes(String(item?.type || "")))
      .map((item) => String(item.text || item.content || ""))
      .join("");
    const toolCalls = output
      .filter((item) => item?.type === "function_call")
      .map((item) => ({
        id: String(item.call_id || item.id || ""),
        type: "function",
        function: {
          name: String(item.name || ""),
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments || {}),
        },
      }));
    return { content, toolCalls };
  }

  function openAiResponsesEnvelope(data = {}) {
    const { content, toolCalls } = responsesV1Message(data);
    const inputTokens = Number(data?.usage?.input_tokens || 0);
    const outputTokens = Number(data?.usage?.output_tokens || 0);
    return {
      id: String(data.id || ""),
      object: "chat.completion",
      model: String(data.model || ""),
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: content || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length ? "tool_calls" : data.status === "incomplete" ? "length" : "stop",
      }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
      ai_system6_lmstudio_api: "lmstudio-responses-v1",
      ai_system6_lmstudio_response_id: String(data.id || ""),
    };
  }

  async function adaptResponsesV1JsonResponse(response) {
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") throw new Error("lmstudio_bad_response: /v1/responses did not return JSON");
    return new Response(JSON.stringify(openAiResponsesEnvelope(data)), {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "application/json" },
    });
  }

  async function adaptNativeV1JsonResponse(response) {
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") {
      throw new Error("lmstudio_bad_response: /api/v1/chat did not return JSON");
    }
    return new Response(JSON.stringify(openAiChatEnvelope(data)), {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "application/json" },
    });
  }

  function openAiStreamFrame(content = "", finishReason = null, usage = null, responseId = "", responseApi = "lmstudio-native-v1", toolCalls = []) {
    // Tool calls have to ride the stream too. This adapter used to emit only
    // text, so a streamed Responses turn could report finish_reason
    // "tool_calls" while carrying no calls at all, and the loop would read the
    // turn as a finished reply that had quietly skipped the tool.
    const calls = Array.isArray(toolCalls) ? toolCalls : [];
    const delta = {
      ...(content ? { content } : {}),
      ...(calls.length ? { tool_calls: calls.map((call, index) => ({ index, ...call })) } : {}),
    };
    return `data: ${JSON.stringify({
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta, finish_reason: finishReason }],
      ...(usage ? { usage } : {}),
      ...(responseId ? { ai_system6_lmstudio_response_id: responseId } : {}),
      ai_system6_lmstudio_api: responseApi,
    })}\n\n`;
  }

  function adaptNativeV1StreamResponse(response) {
    const reader = response.body?.getReader?.();
    if (!reader) return adaptNativeV1JsonResponse(response);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";
    let emittedContent = "";
    let ended = false;

    const stream = new ReadableStream({
      async start(controller) {
        const emitEvent = (eventText) => {
          const lines = String(eventText || "").split(/\r?\n/);
          const eventName = String(lines.find((line) => line.startsWith("event:")) || "").slice(6).trim();
          const raw = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!raw) return;
          let data;
          try { data = JSON.parse(raw.trim()); } catch { return; }
          const type = String(data?.type || eventName || "");
          if (type === "message.delta") {
            const content = String(data.content || "");
            emittedContent += content;
            if (content) controller.enqueue(encoder.encode(openAiStreamFrame(content)));
            return;
          }
          if (type === "error") {
            const error = new Error(String(data?.error?.message || "LM Studio native v1 stream failed."));
            error.code = String(data?.error?.code || data?.error?.type || "");
            controller.error(error);
            ended = true;
            return;
          }
          if (type !== "chat.end") return;
          const result = data.result || {};
          const fullContent = nativeV1MessageText(result);
          const remainder = fullContent.startsWith(emittedContent)
            ? fullContent.slice(emittedContent.length)
            : emittedContent ? "" : fullContent;
          if (remainder) {
            emittedContent += remainder;
            controller.enqueue(encoder.encode(openAiStreamFrame(remainder)));
          }
          controller.enqueue(encoder.encode(openAiStreamFrame(
            "",
            "stop",
            nativeV1Usage(result.stats),
            String(result.response_id || "")
          )));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          ended = true;
        };

        try {
          while (!ended) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split(/\n\n|\r\n\r\n/);
            buffer = events.pop() || "";
            events.forEach((eventText) => {
              if (!ended) emitEvent(eventText);
            });
          }
          buffer += decoder.decode();
          if (!ended && buffer.trim()) emitEvent(buffer);
          if (!ended) controller.close();
        } catch (error) {
          if (!ended) controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  function adaptResponsesV1StreamResponse(response) {
    const reader = response.body?.getReader?.();
    if (!reader) return adaptResponsesV1JsonResponse(response);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";
    let emittedContent = "";
    let ended = false;

    const stream = new ReadableStream({
      async start(controller) {
        const emitEvent = (eventText) => {
          const raw = String(eventText || "").split(/\r?\n/).find((line) => line.startsWith("data:"));
          if (!raw) return;
          let data;
          try { data = JSON.parse(raw.slice(5).trim()); } catch { return; }
          const type = String(data?.type || "");
          if (type === "response.output_text.delta") {
            const content = String(data.delta || "");
            emittedContent += content;
            if (content) controller.enqueue(encoder.encode(openAiStreamFrame(content)));
            return;
          }
          if (["error", "response.failed"].includes(type)) {
            const error = new Error(String(data?.error?.message || data?.response?.error?.message || "LM Studio Responses stream failed."));
            error.code = String(data?.error?.code || data?.response?.error?.code || "");
            controller.error(error);
            ended = true;
            return;
          }
          if (type !== "response.completed") return;
          const result = data.response || {};
          const fullContent = responsesV1Message(result).content;
          const remainder = fullContent.startsWith(emittedContent)
            ? fullContent.slice(emittedContent.length)
            : emittedContent ? "" : fullContent;
          if (remainder) {
            emittedContent += remainder;
            controller.enqueue(encoder.encode(openAiStreamFrame(remainder)));
          }
          const envelope = openAiResponsesEnvelope(result);
          controller.enqueue(encoder.encode(openAiStreamFrame(
            "",
            envelope.choices[0].finish_reason,
            envelope.usage,
            envelope.ai_system6_lmstudio_response_id,
            "lmstudio-responses-v1",
            envelope.choices[0].message.tool_calls || []
          )));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          ended = true;
        };

        try {
          while (!ended) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split(/\n\n|\r\n\r\n/);
            buffer = events.pop() || "";
            events.forEach((eventText) => {
              if (!ended) emitEvent(eventText);
            });
          }
          buffer += decoder.decode();
          if (!ended && buffer.trim()) emitEvent(buffer);
          if (!ended) controller.close();
        } catch (error) {
          if (!ended) controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  function invalidNativeResponseChain(text = "", status = 0) {
    return status === 404 || /previous_response_id|response[_ ]id|job not found|response.*not found/i.test(String(text || ""));
  }

  function nativeChatEndpointUnavailable(text = "", status = 0) {
    if ([405, 501].includes(status)) return true;
    if (status !== 404) return false;
    return !/model|previous_response_id|response[_ ]id|job/i.test(String(text || ""));
  }

  function needsModelLoad(text = "", status = 0) {
    const value = String(text || "");
    return /no models loaded|model .*not loaded|no model loaded|please load a model/i.test(value)
      || (status === 400 && /model/i.test(value) && /load/i.test(value));
  }

  async function chat(payload, options = {}) {
    const nativeRequest = nativeV1ChatRequest(payload, options);
    let responsesRequest = nativeRequest ? null : responsesV1Request(payload, options);
    const requestPayload = stripClientOnlyFields(payload);
    const signal = options.signal;
    const inferenceTimeoutMs = options.timeoutMs || INFERENCE_TIMEOUT_MS;
    const postCompatible = async () => responseWithIdleTimeout(await localModelFetch("/v1/chat/completions", {
      method: "POST",
      signal,
      responseTimeoutMs: inferenceTimeoutMs,
      headers: {
        "Content-Type": "application/json",
        Accept: requestPayload.stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify(requestPayload),
    }), inferenceTimeoutMs);
    const postNative = async () => responseWithIdleTimeout(await localModelFetch("/api/v1/chat", {
      method: "POST",
      signal,
      responseTimeoutMs: inferenceTimeoutMs,
      headers: {
        "Content-Type": "application/json",
        Accept: nativeRequest?.stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify(nativeRequest),
    }), inferenceTimeoutMs);
    const postResponses = async () => responseWithIdleTimeout(await localModelFetch("/v1/responses", {
      method: "POST",
      signal,
      responseTimeoutMs: inferenceTimeoutMs,
      headers: {
        "Content-Type": "application/json",
        Accept: responsesRequest?.stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify(responsesRequest),
    }), inferenceTimeoutMs);
    let apiMode = nativeRequest ? "native" : responsesRequest ? "responses" : "compatible";
    const post = () => apiMode === "native" ? postNative() : apiMode === "responses" ? postResponses() : postCompatible();
    let response;
    try {
      response = await post();
    } catch (error) {
      connected = false;
      throw networkError(error, signal);
    }
    if (!response.ok && apiMode === "native") {
      const probeText = await response.clone().text().catch(() => "");
      const missingResponseChain = nativeRequest.previous_response_id
        && invalidNativeResponseChain(probeText, response.status);
      const missingNativeEndpoint = !nativeRequest.previous_response_id
        && nativeChatEndpointUnavailable(probeText, response.status);
      if (missingResponseChain || missingNativeEndpoint) {
        responsesRequest = responsesV1Request(payload, options, true);
        apiMode = responsesRequest ? "responses" : "compatible";
        response = await post();
      }
    }
    if (!response.ok && apiMode === "responses") {
      const probeText = await response.clone().text().catch(() => "");
      const staleChain = responsesRequest.previous_response_id
        && invalidNativeResponseChain(probeText, response.status);
      const endpointUnavailable = nativeChatEndpointUnavailable(probeText, response.status);
      if (staleChain) {
        responsesRequest = responsesV1Request(payload, options, true);
        if (responsesRequest) response = await postResponses();
        else {
          apiMode = "compatible";
          response = await postCompatible();
        }
      } else if (endpointUnavailable) {
        apiMode = "compatible";
        response = await postCompatible();
      }
    }
    if (!response.ok && currentProvider() === "lm-studio" && options.autoLoad !== false) {
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
    if (apiMode === "native") {
      const contentType = response.headers.get("content-type") || "";
      return /event-stream/i.test(contentType)
        ? adaptNativeV1StreamResponse(response)
        : adaptNativeV1JsonResponse(response);
    }
    if (apiMode === "responses") {
      const contentType = response.headers.get("content-type") || "";
      return /event-stream/i.test(contentType)
        ? adaptResponsesV1StreamResponse(response)
        : adaptResponsesV1JsonResponse(response);
    }
    return response;
  }

  async function embed(payload, options = {}) {
    const requestPayload = stripClientOnlyFields(payload);
    const signal = options.signal;
    const inferenceTimeoutMs = options.timeoutMs || INFERENCE_TIMEOUT_MS;
    const post = async () => responseWithIdleTimeout(await localModelFetch("/v1/embeddings", {
      method: "POST",
      signal,
      responseTimeoutMs: inferenceTimeoutMs,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestPayload),
    }), inferenceTimeoutMs);
    let response;
    try {
      response = await post();
    } catch (error) {
      connected = false;
      throw networkError(error, signal);
    }
    if (!response.ok && currentProvider() === "lm-studio" && options.autoLoad !== false) {
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

  function classifyError(message = "", status = 0, provider = currentProvider()) {
    const value = String(message || "").toLowerCase();
    if (status === 401 || status === 403 || /unauthorized|forbidden|api token|authentication/.test(value)) return "lmstudio_auth_failed";
    if (status === 404 || /api\/v1|not found/.test(value)) return provider === "ollama" ? "ollama_api_incompatible" : "lmstudio_v1_required";
    if (/cors|load failed|failed to fetch|networkerror|network request failed/.test(value)) return provider === "ollama" ? "ollama_cors_or_offline" : "lmstudio_cors_or_offline";
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
    DEFAULT_OLLAMA_BASE_URL,
    REQUEST_TIMEOUT_MS,
    INFERENCE_TIMEOUT_MS,
    isPublicWebMode,
    isSafariPublicWebUnsupported,
    isSafariHttpLocalMode,
    httpLocalEntryUrl,
    browserPermissionState,
    normalizeBaseUrl,
    currentProvider,
    defaultBaseUrl,
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
