// Core module: shared model response streaming helpers.

/**
 * Assemble OpenAI-shaped tool calls that arrive in pieces.
 *
 * A streamed tool call is not one object: each frame carries a fragment tagged
 * with `index`, the function name usually appears only in the first fragment,
 * and `function.arguments` is a JSON string glued together across many frames.
 * Nothing is decodable until the stream ends, so this collects fragments and
 * refuses to guess: a call whose arguments never finish is an error, not an
 * empty object. Guessing here would invent a tool input the model never sent.
 */
function createToolCallAssembler() {
  const drafts = new Map();

  const draftFor = (index) => {
    const key = Number.isInteger(index) ? index : drafts.size;
    if (!drafts.has(key)) drafts.set(key, { key, id: "", type: "", name: "", arguments: "" });
    return drafts.get(key);
  };

  // A name may arrive whole in the first fragment, or split across fragments.
  // Providers that repeat the whole name in every fragment must not have it
  // concatenated into itself, so an identical repeat is ignored.
  const mergeName = (draft, name) => {
    if (!name) return;
    if (!draft.name) draft.name = name;
    else if (draft.name !== name) draft.name += name;
  };

  return {
    /** Merge one incremental `delta.tool_calls` array. */
    pushDelta(rawCalls) {
      if (!Array.isArray(rawCalls)) return;
      rawCalls.forEach((call, position) => {
        const draft = draftFor(Number.isInteger(call?.index) ? call.index : position);
        if (call?.id) draft.id = String(call.id);
        if (call?.type) draft.type = String(call.type);
        mergeName(draft, String(call?.function?.name || ""));
        const args = call?.function?.arguments;
        if (typeof args === "string") draft.arguments += args;
        else if (args && typeof args === "object") draft.arguments = JSON.stringify(args);
      });
    },
    /**
     * Replace the drafts with a complete `message.tool_calls` array. Some
     * providers send the finished message inside a stream frame rather than
     * deltas; that is a snapshot, so appending it would double every argument.
     */
    replaceWithSnapshot(rawCalls) {
      if (!Array.isArray(rawCalls) || !rawCalls.length) return;
      drafts.clear();
      rawCalls.forEach((call, position) => {
        const draft = draftFor(Number.isInteger(call?.index) ? call.index : position);
        draft.id = String(call?.id || "");
        draft.type = String(call?.type || "");
        draft.name = String(call?.function?.name || "");
        const args = call?.function?.arguments;
        draft.arguments = typeof args === "string" ? args : args ? JSON.stringify(args) : "";
      });
    },
    get size() {
      return drafts.size;
    },
    /**
     * Produce the finished tool calls, or throw when a call's arguments never
     * became valid JSON. Throwing keeps a half-received argument list from
     * being run as if the writer's project had asked for it.
     */
    finish() {
      const assembled = [...drafts.values()]
        .sort((a, b) => a.key - b.key)
        .map((draft, position) => ({
          id: draft.id || `tool-call-${position + 1}`,
          type: draft.type || "function",
          function: { name: draft.name, arguments: draft.arguments },
        }));
      assembled.forEach((call) => {
        const args = String(call.function.arguments || "").trim();
        if (!args) return;
        try {
          JSON.parse(args);
        } catch (error) {
          throw new Error(
            `Streamed tool arguments for "${call.function.name || call.id}" are incomplete JSON: ${String(error?.message || error)}`
          );
        }
      });
      return assembled;
    },
  };
}

async function readModelTextStream(response, options = {}) {
  const { onSnapshot, onUsage, onFinishReason, onResponseId, onResponseApi, onModel, onToolCalls, onStreamEnd, throttleMs = 80, signal } = options;
  if (!response?.ok) {
    const text = await response?.text?.().catch(() => "") || "";
    const detail = text || response?.statusText || `HTTP ${response?.status || 0}`;
    const code = typeof classifyLmStudioError === "function" ? classifyLmStudioError(detail, response) : "";
    throw new Error([code, detail].filter(Boolean).join(": "));
  }

  /**
   * One assembled SSE event, split into its own lines.
   *
   * Assembling first and deciding afterwards is the difference between a
   * provider's answer and noise: an event ends at a blank line, `data:` lines
   * inside it belong to the same event, `event:` names it, a line starting
   * with `:` is the comment a provider sends while it is still thinking, and
   * every other field is an extension to keep or ignore - never a reason to
   * fail. Parsing line by line as the bytes arrive is what made a split UTF-8
   * character, a CRLF, or a JSON object spread over several data lines look
   * like a broken answer.
   */
  const parseEventFrame = (frameText) => {
    const lines = String(frameText ?? "").split(/\r\n|\r|\n/);
    const dataLines = [];
    let eventName = "";
    let sawControl = false;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith(":")) {
        sawControl = true;
        return;
      }
      const colon = trimmed.indexOf(":");
      const field = colon === -1 ? trimmed : trimmed.slice(0, colon);
      let value = colon === -1 ? "" : trimmed.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") {
        dataLines.push(value);
        return;
      }
      if (field === "event") eventName = value;
      else if (field === "id" || field === "retry") sawControl = true;
      // Any other field is an extension: recognised, kept out of the way, and
      // never a parse failure.
    });
    return { eventName, data: dataLines.join("\n"), hasData: dataLines.length > 0, sawControl };
  };

  /**
   * The decoded objects an event carries.
   *
   * The standard joins an event's data lines with newlines, and that is what
   * is tried first. Some providers instead put one complete JSON object on
   * each data line of the same event; when the joined text is not JSON, each
   * line is decoded on its own. When neither works the event is genuinely
   * corrupt - and it is reported, never dropped as if it had not arrived yet.
   */
  const decodeEventData = (raw) => {
    try {
      return [JSON.parse(raw)];
    } catch {}
    const pieces = String(raw).split("\n").filter((line) => line.trim());
    if (!pieces.length) return null;
    const parsed = [];
    for (const piece of pieces) {
      try {
        parsed.push(JSON.parse(piece));
      } catch {
        return null;
      }
    }
    return parsed;
  };

  /** The failure an event describes, whichever shape the provider uses. */
  const errorFromEvent = (data) => {
    const error = data?.error;
    if (error) {
      const message = typeof error === "string"
        ? error
        : String(error.message || error.detail || error.code || "The model stream failed.");
      return { code: String(error.code || "model_stream_error"), message };
    }
    const own = data?.ai_system6_error;
    if (own) {
      const message = typeof own === "string"
        ? own
        : String(own.detail || own.error || own.message || "The model stream failed.");
      return { code: String(own.code || "model_stream_error"), message };
    }
    return null;
  };

  /** A failure that keeps the text already received, verbatim. */
  const modelStreamFailure = (code, message, partial) => {
    const error = new Error(message);
    error.code = code;
    if (partial) error.partialContent = partial;
    return error;
  };

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

  const toolCallAssembler = createToolCallAssembler();

  const readJsonFallback = async () => {
    const data = await response.json();
    // A provider that answers in JSON can still answer with a failure; both
    // the OpenAI shape and this project's own envelope mean the same thing.
    const failure = errorFromEvent(data);
    if (failure) throw modelStreamFailure(failure.code, failure.message, "");
    if (data?.usage?.prompt_tokens) onUsage?.(data.usage);
    if (data?.model) onModel?.(String(data.model));
    if (data?.ai_system6_lmstudio_response_id) onResponseId?.(String(data.ai_system6_lmstudio_response_id));
    if (data?.ai_system6_lmstudio_api) onResponseApi?.(String(data.ai_system6_lmstudio_api));
    const finishReasonFromJson = data?.choices?.[0]?.finish_reason;
    if (finishReasonFromJson) onFinishReason?.(String(finishReasonFromJson));
    // A provider that ignored stream:true still answers with tool calls; the
    // caller must see them, or the loop would treat the turn as a plain reply.
    toolCallAssembler.replaceWithSnapshot(data?.choices?.[0]?.message?.tool_calls);
    if (toolCallAssembler.size) onToolCalls?.(toolCallAssembler.finish());
    const content = data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.text
      ?? data?.choices?.[0]?.delta?.content
      ?? "";
    const text = String(content || "");
    emitSnapshot(text, true);
    // A JSON answer is complete when it arrived: the completion rules of an
    // event stream do not apply to a body that was never framed as events.
    onStreamEnd?.({ completed: true, sawDone: false, sawFinishReason: Boolean(finishReasonFromJson), streamed: false });
    return text;
  };

  const contentType = response.headers?.get?.("content-type") || "";
  const isEventStream = /event-stream/i.test(contentType);
  if (/json/i.test(contentType) && !/event-stream/i.test(contentType)) return readJsonFallback();
  const reader = response.body?.getReader?.();
  if (!reader) return readJsonFallback();

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;
  let finishReason = "";
  let responseId = "";
  let responseApi = "";
  // The served model, which on the automatic setting is chosen per task by
  // the server rather than by the panel.
  let servedModel = "";
  let sawEventFrame = false;
  let sawDone = false;
  let deliveredToolCalls = false;

  const stopReader = () => {
    // Wake a read that is already waiting instead of leaving it to observe the
    // signal on some later turn of the loop, which is how a cancelled stream
    // keeps a tab pinned until the provider decides to answer.
    let cancellation = null;
    try {
      cancellation = reader.cancel?.() || null;
    } catch {
      return;
    }
    if (cancellation && typeof cancellation.catch === "function") cancellation.catch(() => {});
  };

  const appendChunk = (chunk) => {
    if (!chunk) return;
    content += chunk;
    emitSnapshot(content);
  };

  /** Handle one decoded payload of one event. */
  const consumePayload = (data) => {
    const failure = errorFromEvent(data);
    if (failure) throw modelStreamFailure(failure.code, failure.message, content);
    if (data?.usage?.prompt_tokens) usage = data.usage;
    if (data.model) servedModel = String(data.model);
    if (data.ai_system6_lmstudio_response_id) responseId = String(data.ai_system6_lmstudio_response_id);
    if (data.ai_system6_lmstudio_api) responseApi = String(data.ai_system6_lmstudio_api);
    const nextFinishReason = data?.choices?.[0]?.finish_reason;
    if (nextFinishReason) finishReason = String(nextFinishReason);
    toolCallAssembler.pushDelta(data?.choices?.[0]?.delta?.tool_calls);
    toolCallAssembler.replaceWithSnapshot(data?.choices?.[0]?.message?.tool_calls);
    appendChunk(
      data?.choices?.[0]?.delta?.content
      ?? data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.text
      ?? ""
    );
  };

  const consumeEvent = (eventText) => {
    const frame = parseEventFrame(eventText);
    const looksLikeEvent = frame.hasData || Boolean(frame.eventName) || frame.sawControl;
    if (!looksLikeEvent) {
      // Not an event at all: a transport that ignored stream:true and sent
      // plain text through a body that happened to contain a blank line.
      if (!sawEventFrame && !isEventStream) appendChunk(eventText);
      return;
    }
    sawEventFrame = true;
    if (frame.eventName === "error") {
      const detail = decodeEventData(frame.data)?.[0];
      throw modelStreamFailure(
        String(errorFromEvent(detail)?.code || "model_stream_error"),
        String(errorFromEvent(detail)?.message || frame.data || "The model stream reported an error."),
        content
      );
    }
    if (!frame.hasData) return;
    if (frame.data === "[DONE]") {
      sawDone = true;
      return;
    }
    const decoded = decodeEventData(frame.data);
    if (!decoded) {
      // The buffer splitter only hands over finished events, so a payload that
      // does not parse is a corrupt answer, not a fragment that is still on
      // its way. Saying so keeps a decoder's silence from reading as success.
      throw modelStreamFailure(
        "model_stream_invalid_json",
        `The model stream sent an event that is not valid JSON: ${String(frame.data).slice(0, 200)}`,
        content
      );
    }
    decoded.forEach(consumePayload);
  };

  const abortError = () => {
    const error = new DOMException("The model response was stopped.", "AbortError");
    if (content) error.partialContent = content;
    return error;
  };
  const onAbort = () => stopReader();
  if (signal) {
    if (signal.aborted) throw abortError();
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (isEventStream || sawEventFrame || /data:\s*/.test(buffer)) {
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        events.forEach(consumeEvent);
      } else {
        appendChunk(buffer);
        buffer = "";
      }
    }

    if (signal?.aborted) throw abortError();
    buffer += decoder.decode();
    if (buffer.trim()) consumeEvent(buffer);
    if (toolCallAssembler.size) {
      // Assembled only after the last frame: the argument JSON is not
      // complete, and therefore not decodable, until then. A failure here
      // carries the text that did stream so the caller can still keep it,
      // clearly marked partial.
      try {
        onToolCalls?.(toolCallAssembler.finish());
        deliveredToolCalls = true;
      } catch (error) {
        if (content) error.partialContent = content;
        throw error;
      }
    }
    if (usage) onUsage?.(usage);
    if (finishReason) onFinishReason?.(finishReason);
    if (responseId) onResponseId?.(responseId);
    if (responseApi) onResponseApi?.(responseApi);
    if (servedModel) onModel?.(servedModel);
    emitSnapshot(content, true);
    // The stream is over. Whether that means the answer finished is a separate
    // question: an event stream that ends without its own completion signal
    // ([DONE] or a finish reason) may have been cut off mid-answer, and the
    // caller - not this reader - decides what its run should say about it.
    onStreamEnd?.({
      completed: !sawEventFrame || sawDone || Boolean(finishReason) || deliveredToolCalls,
      sawDone,
      sawFinishReason: Boolean(finishReason),
      streamed: true,
    });
    return content;
  } catch (error) {
    if (content && error && typeof error === "object" && error.partialContent === undefined) {
      error.partialContent = content;
    }
    throw error;
  } finally {
    signal?.removeEventListener?.("abort", onAbort);
    try {
      reader.releaseLock?.();
    } catch {}
  }
}

/**
 * Read the server-side web-search SSE stream produced by /api/search/answer
 * with stream=true. The protocol is: status events
 * `{"ai_system6_status":"..."}`, chat-completions-shaped text deltas
 * `{"choices":[{"delta":{"content":"..."}}]}`, a final envelope
 * `{"ai_system6_result":{...}}`, an error event `{"ai_system6_error":{...}}`,
 * and a terminating `{"type":"done"}` (or `data: [DONE]`).
 *
 * The final envelope is what makes the answer an answer: the text that
 * streamed before it is a preview of a run that has not finished, and the
 * citations only arrive with the envelope. A stream that ends without one has
 * been cut off, and a call that returns the partial text as an ordinary result
 * reports a broken search as a complete one - so it throws instead, carrying
 * the text received so far as `partialContent` and a stable `code`:
 *
 *   - `web_search_incomplete`    the stream ended before the final envelope
 *                                (including a frame cut off mid-JSON at EOF)
 *   - `web_search_invalid_event` a complete event frame carried broken JSON
 *   - the server's own code      for an `ai_system6_error` event
 *
 * Events that carry no data (comments, heartbeats) and fields the protocol
 * does not define are ignored, not read as damage.
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
  // A frame that carried data and could not be parsed. Tracked rather than
  // dropped: a provider whose events arrive damaged is not a provider that
  // answered with an empty citation list.
  let brokenEvent = "";
  let truncatedEvent = false;

  /**
   * The answer so far, plus the reason it is not a complete one. Callers keep
   * the text through `partialContent`; nothing here invents citations for it.
   */
  const incomplete = (code, message) => {
    if (content) emitDelta(content, true);
    const error = new Error(message);
    error.code = code;
    if (content) error.partialContent = content;
    return error;
  };

  const consumeEvent = (eventText, complete = true) => {
    const dataLine = String(eventText || "").split(/\r?\n/).find((line) => line.startsWith("data:"));
    // A comment or a heartbeat frame carries no data line at all.
    if (!dataLine) return;
    const raw = String(dataLine).slice(5).trim();
    if (!raw || raw === "[DONE]") {
      if (raw === "[DONE]") finished = true;
      return;
    }
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // The last frame has no terminator to prove it was whole: that is the
      // connection stopping mid-event, not an event that arrived damaged.
      if (complete) brokenEvent = raw.slice(0, 200);
      else truncatedEvent = true;
      return;
    }
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

  // A waiting read is woken by the abort: without this, a cancelled search
  // held its reader (and its connection) until the socket happened to end.
  const abortError = () => {
    const error = new DOMException("The web search stream was stopped.", "AbortError");
    if (content) error.partialContent = content;
    return error;
  };
  const onAbort = () => {
    try {
      reader.cancel?.()?.catch?.(() => {});
    } catch {}
  };
  if (signal) {
    if (signal.aborted) throw abortError();
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
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
    // What is left is an event with no closing blank line. It is still read -
    // a provider may simply end its stream after the last frame - but a JSON
    // failure in it is a truncated stream, not a damaged event.
    if (buffer.trim()) consumeEvent(buffer, false);

    if (signal?.aborted) throw abortError();
    if (streamError) {
      const error = new Error(String(streamError.detail || streamError.error || "Web search failed"));
      error.code = String(streamError.code || "");
      error.warning = String(streamError.warning || "");
      if (content) error.partialContent = content;
      throw error;
    }
    if (brokenEvent) {
      throw incomplete(
        "web_search_invalid_event",
        `The web search sent an event that is not valid JSON: ${brokenEvent}`
      );
    }
    if (truncatedEvent) {
      throw incomplete("web_search_incomplete", "The web search stopped in the middle of an event.");
    }
    if (!result) {
      // Ended without the final envelope. `finished` only says the provider
      // closed the stream; the answer it was building never arrived.
      throw incomplete(
        "web_search_incomplete",
        "The web search ended before its final answer arrived."
      );
    }
    emitDelta(content, true);
    onResult?.(result);
    return result;
  } finally {
    signal?.removeEventListener?.("abort", onAbort);
    try {
      reader.releaseLock?.();
    } catch {}
  }
}
