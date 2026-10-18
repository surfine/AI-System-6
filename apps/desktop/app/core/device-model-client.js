// On-device models, page side: the built-in model (Qwen3.5 4B through the Mac
// helper) when it is downloaded, else Apple's on-device model. Lazy: loaded by
// ensureDeviceModelModule() when the provider resolver probes the Mac route or
// a bounded door (the three-questions door, a side question, a title) asks for
// it. Everything goes through the registered "device.status" and "device.chat"
// services; the answer is temporary text for the caller to show, and nothing
// here saves or inserts it.
(function installDeviceModelClient(root) {
  "use strict";
  if (root.AISystem6DeviceModel) return;

  const reasonCopy = Object.freeze({
    helperMissing: "device_model_reason_helper_missing",
    deviceNotEligible: "device_model_reason_device_not_eligible",
    appleIntelligenceNotEnabled: "device_model_reason_apple_intelligence_off",
    modelNotReady: "device_model_reason_model_not_ready",
    osTooOld: "device_model_reason_os_too_old",
    frameworkMissingAtBuild: "device_model_reason_framework_missing",
    other: "device_model_reason_other",
  });
  const errorCopy = Object.freeze({
    device_guardrail_violation: "device_model_error_guardrail",
    device_refusal: "device_model_error_guardrail",
    "context-budget-exceeded": "device_model_error_too_long",
    device_language_unsupported: "device_model_error_language",
    device_busy: "device_model_error_busy",
    rate_limit: "device_model_error_busy",
    device_task_unavailable: "device_model_error_task",
    device_text_only: "device_model_error_task",
    device_unavailable: "device_model_error_unavailable",
    device_memory_gate: "device_model_error_unavailable",
  });

  function unavailable(reason) {
    return { available: false, reason: reasonCopy[reason] ? reason : "other", contextSize: null };
  }

  // The engine a door uses: the built-in model when it is downloaded (measured
  // faster than LM Studio on the same model), else Apple's model.
  let lastEngine = "apple";

  async function status(options = {}) {
    try {
      const response = await root.AISystem6Capabilities.requestService("device.status", { signal: options.signal });
      if (!response.ok) return unavailable("helperMissing");
      const data = await response.json();
      if (data?.builtIn?.available === true) {
        lastEngine = "mlx";
        return {
          ...data,
          available: true,
          reason: null,
          engine: "mlx",
          builtInModel: data.builtIn.defaultModel || "",
          contextSize: data.builtIn.contextSize || data.contextSize || null,
        };
      }
      lastEngine = "apple";
      if (data?.available === true) return { ...data, available: true, reason: null, engine: "apple" };
      return { ...data, ...unavailable(String(data?.reason || "other")), engine: "apple" };
    } catch {
      return unavailable("helperMissing");
    }
  }

  // The translation key for a status or an error code. Callers pass it to t().
  function copyKeyForStatus(result) {
    return result?.available === true ? "device_model_ready" : reasonCopy[result?.reason] || reasonCopy.other;
  }

  function failure(code, message, data = {}) {
    const error = new Error(message || "The on-device model stopped without an answer.");
    error.code = code || "device_failed";
    error.copyKey = errorCopy[error.code] || "device_model_error_failed";
    error.reason = data.reason || "";
    error.wayOut = Array.isArray(data.way_out) ? data.way_out : [];
    return error;
  }

  // task: "three-questions" | "side-question" | "title". Resolves to the full
  // text; onDelta(textSoFar) fires as it streams.
  // engine: "mlx" | "apple"; by default the one the last status() chose.
  async function chat({ task, messages, language, maxTokens, temperature, signal, onDelta, engine } = {}) {
    const useEngine = engine === "mlx" || engine === "apple" ? engine : lastEngine;
    const response = await root.AISystem6Capabilities.requestService("device.chat", {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_system6_task_kind: task,
          messages,
          language: language || document.documentElement.lang || "",
          max_tokens: maxTokens,
          temperature,
          stream: true,
          ...(useEngine === "mlx" ? { engine: "mlx" } : {}),
        }),
      },
      signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw failure(data.code, data.error, data);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let done = false;
    while (!done) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        if (!block.startsWith("data: ")) continue;
        const payload = block.slice(6).trim();
        if (payload === "[DONE]") { done = true; break; }
        let event;
        try { event = JSON.parse(payload); } catch { continue; }
        if (event.error) throw failure(event.error.code, event.error.error, event.error);
        if (typeof event.ai_system6_replace === "string") {
          text = event.ai_system6_replace;
          onDelta?.(text);
          continue;
        }
        const piece = event.choices?.[0]?.delta?.content;
        if (piece) {
          text += piece;
          onDelta?.(text);
        }
      }
    }
    if (!done) throw failure("device_failed", "The on-device model stopped before it finished.");
    return text;
  }

  // The built-in model as the Mac's local route (resolver: built-in first; LM
  // Studio when the writer picks it). General chat and the writing tasks go to
  // the device route with engine "mlx", which assembles guardrails exactly as
  // /api/chat does; an image, a tool list or a JSON schema stays with LM Studio.
  function builtInCanServe(payload = {}) {
    if (Array.isArray(payload.tools) && payload.tools.length) return false;
    const format = payload.response_format?.type;
    if (format && format !== "text") return false;
    return (Array.isArray(payload.messages) ? payload.messages : []).every((message) => {
      const content = message?.content;
      if (typeof content === "string" || content == null) return true;
      return Array.isArray(content) && content.every((part) => typeof part === "string" || part?.type === "text");
    });
  }

  function builtInChat(payload = {}, { signal } = {}) {
    const local = root.AISystem6BuiltInLocal;
    return root.AISystem6Capabilities.requestService("device.chat", {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          engine: "mlx",
          model: local?.model || "",
          ai_system6_task_kind: payload.ai_system6_task_kind || "chat",
          language: payload.language || document.documentElement.lang || "",
        }),
        signal,
      },
      signal,
    });
  }

  function activateBuiltInLocal(info = {}) {
    const model = String(info.model || "qwen3.5-4b-4bit");
    root.AISystem6BuiltInLocal = Object.freeze({
      active: true,
      model,
      label: model === "qwen3.5-4b-4bit" ? "Qwen3.5 4B" : model,
      contextSize: Number(info.contextSize) || null,
      canServe: builtInCanServe,
      chat: builtInChat,
    });
    return root.AISystem6BuiltInLocal;
  }

  function deactivateBuiltInLocal() {
    root.AISystem6BuiltInLocal = null;
  }

  root.AISystem6DeviceModel = Object.freeze({
    status,
    chat,
    copyKeyForStatus,
    provider: "apple-foundation-models",
    engine: () => lastEngine,
    activateBuiltInLocal,
    deactivateBuiltInLocal,
  });
  root.AISystem6DeviceModelLoaded = true;
})(window);
