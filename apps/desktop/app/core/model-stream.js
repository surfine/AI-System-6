// Core module: shared model response streaming helpers.

async function readModelTextStream(response, options = {}) {
  const { onSnapshot, onUsage, onFinishReason, onResponseId, onResponseApi, throttleMs = 80, signal } = options;
  if (!response?.ok) {
    const text = await response?.text?.().catch(() => "") || "";
    const detail = text || response?.statusText || `HTTP ${response?.status || 0}`;
    const code = typeof classifyLmStudioError === "function" ? classifyLmStudioError(detail, response) : "";
    throw new Error([code, detail].filter(Boolean).join(": "));
  }

  const emitSnapshot = (() => {
    let lastEmitAt = 0;
    let pending = "";
    return (text, force = false) => {
      pending = text;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!force && throttleMs > 0 && now - lastEmitAt < throttleMs) return;
      lastEmitAt = now;
      onSnapshot?.(pending);
    };
  })();

  const readJsonFallback = async () => {
    const data = await response.json();
    if (data?.usage?.prompt_tokens) onUsage?.(data.usage);
    if (data?.ai_system6_lmstudio_response_id) onResponseId?.(String(data.ai_system6_lmstudio_response_id));
    if (data?.ai_system6_lmstudio_api) onResponseApi?.(String(data.ai_system6_lmstudio_api));
    const content = data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.text
      ?? data?.choices?.[0]?.delta?.content
      ?? "";
    const text = String(content || "");
    emitSnapshot(text, true);
    return text;
  };

  const reader = response.body?.getReader?.();
  const contentType = response.headers?.get?.("content-type") || "";
  const isEventStream = /event-stream/i.test(contentType);
  if (/json/i.test(contentType) && !/event-stream/i.test(contentType)) return readJsonFallback();
  if (!reader) return readJsonFallback();

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;
  let finishReason = "";
  let responseId = "";
  let responseApi = "";
  let sawEventFrame = false;

  const appendChunk = (chunk) => {
    if (!chunk) return;
    content += chunk;
    emitSnapshot(content);
  };

  const consumeDataLine = (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed.startsWith("data:")) return false;
    sawEventFrame = true;
    const raw = trimmed.replace(/^data:\s*/, "");
    if (!raw || raw === "[DONE]") return true;
    try {
      const data = JSON.parse(raw);
      if (data.usage?.prompt_tokens) usage = data.usage;
      if (data.ai_system6_lmstudio_response_id) responseId = String(data.ai_system6_lmstudio_response_id);
      if (data.ai_system6_lmstudio_api) responseApi = String(data.ai_system6_lmstudio_api);
      const nextFinishReason = data?.choices?.[0]?.finish_reason;
      if (nextFinishReason) finishReason = String(nextFinishReason);
      appendChunk(
        data?.choices?.[0]?.delta?.content
        ?? data?.choices?.[0]?.message?.content
        ?? data?.choices?.[0]?.text
        ?? ""
      );
    } catch {
      // Ignore keepalive or partial event frames; the buffer splitter handles partial frames.
    }
    return true;
  };

  const consumeEvent = (eventText) => {
    const lines = String(eventText || "").split(/\r?\n/);
    let consumedSse = false;
    let sawSseControl = false;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith(":") || /^(?:event|id|retry):/i.test(trimmed)) {
        sawSseControl = true;
      }
      consumedSse = consumeDataLine(line) || consumedSse;
    });
    if (!consumedSse && !sawEventFrame && !isEventStream && !sawSseControl) appendChunk(eventText);
  };

  while (!signal?.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (isEventStream || /data:\s*/.test(buffer) || sawEventFrame) {
      const events = buffer.split(/\n\n|\r\n\r\n/);
      buffer = events.pop() || "";
      events.forEach(consumeEvent);
    } else {
      appendChunk(buffer);
      buffer = "";
    }
  }

  if (signal?.aborted) {
    const error = new DOMException("The model response was stopped.", "AbortError");
    if (content.trim()) error.partialContent = content.trim();
    throw error;
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  if (usage) onUsage?.(usage);
  if (finishReason) onFinishReason?.(finishReason);
  if (responseId) onResponseId?.(responseId);
  if (responseApi) onResponseApi?.(responseApi);
  emitSnapshot(content, true);
  return content;
}

/**
 * Read the server-side web-search SSE stream produced by /api/search/answer
 * with stream=true. The protocol is: status events
 * `{"ai_system6_status":"..."}`, chat-completions-shaped text deltas
 * `{"choices":[{"delta":{"content":"..."}}]}`, a final envelope
 * `{"ai_system6_result":{...}}`, an error event `{"ai_system6_error":{...}}`,
 * and a terminating `{"type":"done"}` (or `data: [DONE]`).
 *
 * @param {Response} response
 * @param {{
 *   onStatus?: (status: string) => void,
 *   onDelta?: (content: string) => void,
 *   onResult?: (result: any) => void,
 *   signal?: AbortSignal,
 *   throttleMs?: number,
 * }} [options]
 * @returns {Promise<any>}
 */
async function readWebSearchStream(response, options = {}) {
  const { onStatus, onDelta, onResult, signal, throttleMs = 80 } = options;
  if (!response?.ok) {
    const text = await response?.text?.().catch(() => "") || "";
    throw new Error(text || `HTTP ${response?.status || 0}`);
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const data = await response.json().catch(() => null);
    if (data?.ai_system6_error) {
      const error = new Error(String(data.ai_system6_error.detail || data.ai_system6_error.error || "Web search failed"));
      error.code = data.ai_system6_error.code || "";
      error.warning = data.ai_system6_error.warning || "";
      throw error;
    }
    return data;
  }

  const emitDelta = (() => {
    let lastEmitAt = 0;
    let pending = "";
    return (content, force = false) => {
      pending = content;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!force && throttleMs > 0 && now - lastEmitAt < throttleMs) return;
      lastEmitAt = now;
      onDelta?.(pending);
    };
  })();

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let result = null;
  let streamError = null;
  let finished = false;

  const consumeEvent = (eventText) => {
    const dataLine = String(eventText || "").split(/\r?\n/).find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    const raw = String(dataLine).slice(5).trim();
    if (!raw || raw === "[DONE]") {
      if (raw === "[DONE]") finished = true;
      return;
    }
    let data = null;
    try { data = JSON.parse(raw); } catch { return; }
    if (data.ai_system6_status) onStatus?.(String(data.ai_system6_status));
    const delta = data?.choices?.[0]?.delta?.content;
    if (typeof delta === "string") {
      content += delta;
      emitDelta(content);
    }
    if (data.ai_system6_result) result = data.ai_system6_result;
    if (data.ai_system6_error) streamError = data.ai_system6_error;
    if (data.type === "done") finished = true;
  };

  while (!signal?.aborted && !finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.search(/\r?\n\r?\n/);
    while (boundary !== -1) {
      const eventText = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + (buffer[boundary] === "\r" ? 4 : 2));
      consumeEvent(eventText);
      boundary = buffer.search(/\r?\n\r?\n/);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);

  if (signal?.aborted) {
    throw new DOMException("The web search stream was stopped.", "AbortError");
  }
  if (streamError) {
    const error = new Error(String(streamError.detail || streamError.error || "Web search failed"));
    error.code = String(streamError.code || "");
    error.warning = String(streamError.warning || "");
    throw error;
  }
  emitDelta(content, true);
  if (result) onResult?.(result);
  return result || { answer: content, citations: [], results: [], searchCalls: [] };
}
