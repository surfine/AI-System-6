// Core module: shared model response streaming helpers.

async function readModelTextStream(response, options = {}) {
  const { onSnapshot, onUsage, onFinishReason, throttleMs = 80, signal } = options;
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
  emitSnapshot(content, true);
  return content;
}
