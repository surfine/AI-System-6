// Anthropic Messages API adapter: the desk's server speaks OpenAI Chat
// Completions internally, so this module takes an OpenAI-shaped request aimed
// at https://api.anthropic.com/v1/chat/completions, calls the real
// POST /v1/messages, and answers with a Response whose body is exactly what an
// OpenAI-compatible server would send (JSON, or SSE frames ending [DONE]).
// Nothing upstream of it changes. The API key is read from the Authorization
// header the caller built and is never logged.

"use strict";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
const FALLBACK_MODELS = Object.freeze(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
const EFFORTS = Object.freeze({ none: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" });

const ANTHROPIC_MODELS = Object.freeze([
  Object.freeze({ id: "claude-opus-5-5", name: "Claude Opus 5.5", context_length: 1000000 }),
  Object.freeze({ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", context_length: 1000000 }),
  Object.freeze({ id: "claude-haiku-5-5", name: "Claude Haiku 5.5", context_length: 1000000 }),
  Object.freeze({ id: "claude-fable-5-1", name: "Claude Fable 5.1", context_length: 1000000 }),
]);

/**
 * @param {unknown} url
 * @returns {boolean}
 */
function isAnthropicUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" && parsed.hostname === "api.anthropic.com";
  } catch {
    return false;
  }
}

/**
 * @param {string} apiKey
 * @param {boolean} [withFallbacks]
 * @returns {Record<string, string>}
 */
function anthropicHeaders(apiKey, withFallbacks = false) {
  /** @type {Record<string, string>} */
  const headers = { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" };
  if (withFallbacks) headers["anthropic-beta"] = ANTHROPIC_FALLBACK_BETA;
  return headers;
}

/**
 * Remembers whole assistant content arrays (thinking and fallback blocks
 * included) by tool_use id, so a later request can echo them unchanged.
 *
 * @param {{ max?: number, ttlMs?: number, now?: () => number }} [options]
 */
function createThinkingCache({ max = 200, ttlMs = 30 * 60 * 1000, now = Date.now } = {}) {
  /** @type {Map<string, { content: any[], at: number }>} */
  const entries = new Map();
  return {
    /** @param {any[]} content */
    remember(content) {
      if (!Array.isArray(content)) return;
      const ids = content.filter((block) => block && block.type === "tool_use" && block.id).map((block) => String(block.id));
      if (!ids.length) return;
      const entry = { content, at: now() };
      for (const id of ids) {
        entries.delete(id);
        entries.set(id, entry);
      }
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
    /**
     * @param {string[]} toolCallIds
     * @returns {any[] | null}
     */
    lookup(toolCallIds) {
      if (!Array.isArray(toolCallIds) || !toolCallIds.length) return null;
      const first = entries.get(String(toolCallIds[0]));
      if (!first || now() - first.at > ttlMs) return null;
      for (const id of toolCallIds) if (entries.get(String(id)) !== first) return null;
      return first.content;
    },
  };
}

const defaultThinkingCache = createThinkingCache();

/** @param {any} content */
function userBlocks(content) {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  /** @type {any[]} */
  const blocks = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text") {
      if (typeof part.text === "string" && part.text) blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const url = String(typeof part.image_url === "string" ? part.image_url : part.image_url?.url || "");
      const data = /^data:([^;,]+);base64,(.*)$/s.exec(url);
      if (data) blocks.push({ type: "image", source: { type: "base64", media_type: data[1], data: data[2] } });
      else if (/^https?:\/\//i.test(url)) blocks.push({ type: "image", source: { type: "url", url } });
    }
  }
  return blocks;
}

/** @param {any} content */
function plainText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === "string" ? part : part?.type === "text" ? part.text || "" : "")).join("");
  return content == null ? "" : String(content);
}

/** @param {string} text */
function parseArguments(text) {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * Pure: OpenAI chat-completions payload to an Anthropic Messages body.
 *
 * @param {any} payload
 * @param {{ thinkingCache?: ReturnType<typeof createThinkingCache> }} [options]
 */
function toAnthropicRequest(payload, { thinkingCache } = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const streaming = source.stream === true;
  const model = typeof source.model === "string" && source.model.startsWith("claude-") ? source.model : ANTHROPIC_DEFAULT_MODEL;
  const requested = Number.isFinite(Number(source.max_tokens)) && source.max_tokens != null ? Math.trunc(Number(source.max_tokens)) : 16000;
  const maxTokens = Math.min(streaming ? 64000 : 16000, Math.max(1, requested));
  const input = Array.isArray(source.messages) ? source.messages : [];

  let index = 0;
  /** @type {any[]} */
  const system = [];
  while (index < input.length && input[index]?.role === "system") {
    const text = plainText(input[index].content);
    if (text) system.push({ type: "text", text });
    index += 1;
  }
  if (system.length) system[system.length - 1].cache_control = { type: "ephemeral" };

  /** @type {({ role: string, content: any[] } | { sys: string })[]} */
  const items = [];
  for (; index < input.length; index += 1) {
    const message = input[index];
    if (!message || typeof message !== "object") continue;
    if (message.role === "system") {
      items.push({ sys: plainText(message.content) });
    } else if (message.role === "user") {
      items.push({ role: "user", content: userBlocks(message.content) });
    } else if (message.role === "tool") {
      items.push({ role: "user", content: [{ type: "tool_result", tool_use_id: String(message.tool_call_id || ""), content: plainText(message.content) }] });
    } else if (message.role === "assistant") {
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      const cached = calls.length && thinkingCache ? thinkingCache.lookup(calls.map((call) => String(call?.id || ""))) : null;
      if (Array.isArray(cached)) {
        items.push({ role: "assistant", content: cached });
        continue;
      }
      /** @type {any[]} */
      const content = [];
      const text = plainText(message.content);
      if (text) content.push({ type: "text", text });
      for (const call of calls) {
        content.push({ type: "tool_use", id: String(call?.id || ""), name: String(call?.function?.name || ""), input: parseArguments(call?.function?.arguments) });
      }
      items.push({ role: "assistant", content });
    }
  }

  // Place the later system messages.
  /** @type {({ role: string, content: any } | null)[]} */
  const placed = items.map((item) => ("sys" in item ? null : item));
  const neighbour = (from, step) => {
    for (let i = from + step; i >= 0 && i < items.length; i += step) if (!("sys" in items[i])) return items[i];
    return null;
  };
  items.forEach((item, i) => {
    if (!("sys" in item) || !item.sys) return;
    const prev = neighbour(i, -1);
    const next = neighbour(i, 1);
    if (prev && "role" in prev && prev.role === "user" && (!next || ("role" in next && next.role === "assistant"))) {
      placed[i] = { role: "system", content: item.sys };
      return;
    }
    for (let j = i + 1; j < items.length; j += 1) {
      const target = placed[j];
      if (target && target.role === "user") {
        target.content = [...target.content, { type: "text", text: item.sys }];
        return;
      }
    }
    placed.push({ role: "user", content: [{ type: "text", text: item.sys }] });
  });

  /** @type {{ role: string, content: any }[]} */
  const messages = [];
  for (const item of placed) {
    // An empty turn (blank text, an assistant with neither text nor calls)
    // is a 400 at Anthropic; dropping it before the merge keeps roles paired.
    if (!item || (Array.isArray(item.content) && !item.content.length)) continue;
    const last = messages[messages.length - 1];
    if (last && last.role === item.role && item.role !== "system") last.content = [...last.content, ...item.content];
    else messages.push({ role: item.role, content: item.content });
  }
  const first = messages.findIndex((message) => message.role !== "system");
  if (first >= 0 && messages[first].role === "assistant") messages.splice(first, 0, { role: "user", content: [{ type: "text", text: "(continue)" }] });
  while (messages.length && messages[0].role === "system") messages.shift();

  /** @type {Record<string, any>} */
  const body = { model, max_tokens: maxTokens, messages, cache_control: { type: "ephemeral" } };
  if (system.length) body.system = system;
  const tools = (Array.isArray(source.tools) ? source.tools : [])
    .filter((tool) => tool && tool.function && tool.function.name)
    .map((tool) => ({
      name: String(tool.function.name),
      description: tool.function.description || "",
      input_schema: tool.function.parameters || { type: "object", properties: {} },
    }));
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = source.tool_choice === "none" ? { type: "none" } : { type: "auto" };
  }
  const effort = EFFORTS[String(source.ai_system6_anthropic_effort ?? source.reasoning_effort ?? "").toLowerCase()];
  if (effort) body.output_config = { effort };
  if (FALLBACK_MODELS.includes(model)) body.fallbacks = "default";
  const stop = typeof source.stop === "string" ? [source.stop] : Array.isArray(source.stop) ? source.stop.filter((s) => typeof s === "string") : [];
  if (stop.length) body.stop_sequences = stop;
  if (streaming) body.stream = true;
  return body;
}

/** @param {string | null | undefined} reason */
function finishReason(reason) {
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "tool_calls";
  if (reason === "refusal") return "content_filter";
  return "stop";
}

/** @param {any} usage */
function openAiUsage(usage) {
  const u = usage || {};
  const cacheRead = Number(u.cache_read_input_tokens) || 0;
  const prompt = (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + cacheRead;
  const completion = Number(u.output_tokens) || 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, prompt_tokens_details: { cached_tokens: cacheRead } };
}

/** @param {string} model */
const providerBlock = (model) => ({ id: "anthropic", host: "Anthropic API", model });

/**
 * Pure: Anthropic message to an OpenAI chat.completion object.
 *
 * @param {any} message
 */
function fromAnthropicMessage(message) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const texts = blocks.filter((block) => block?.type === "text" && typeof block.text === "string");
  const toolCalls = blocks
    .filter((block) => block?.type === "tool_use")
    .map((block) => ({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }));
  /** @type {Record<string, any>} */
  const out = { role: "assistant", content: texts.length ? texts.map((block) => block.text).join("") : null };
  if (toolCalls.length) out.tool_calls = toolCalls;
  return {
    id: message?.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: message?.model,
    choices: [{ index: 0, message: out, finish_reason: finishReason(message?.stop_reason) }],
    usage: openAiUsage(message?.usage),
    ai_system6_provider: providerBlock(message?.model),
  };
}

/**
 * Consumes raw Anthropic SSE text (any chunking) and returns OpenAI SSE text.
 *
 * @param {{ model?: string, onMessage?: (content: any[]) => void }} [options]
 */
function createAnthropicStreamTranslator({ model = "", onMessage } = {}) {
  let buffer = "";
  let id = "chatcmpl-anthropic";
  let modelName = model;
  const created = Math.floor(Date.now() / 1000);
  let started = false;
  let done = false;
  let stopReason = null;
  /** @type {Record<string, any>} */
  let usage = {};
  /** @type {Map<number, any>} */
  const blocks = new Map();
  /** @type {Map<number, number>} */
  const toolIndex = new Map();
  let toolCount = 0;

  /** @param {Record<string, any>} delta @param {Record<string, any>} [extra] */
  const chunk = (delta, extra = {}) => {
    const out = { id, object: "chat.completion.chunk", created, model: modelName, choices: [{ index: 0, delta: started ? delta : { role: "assistant", ...delta } }], ...extra };
    started = true;
    return `data: ${JSON.stringify(out)}\n\n`;
  };

  /** @param {any} event */
  function handle(event) {
    if (done || !event || typeof event !== "object") return "";
    switch (event.type) {
      case "message_start": {
        const message = event.message || {};
        if (message.id) id = message.id;
        if (message.model) modelName = message.model;
        usage = { ...usage, ...(message.usage || {}) };
        return "";
      }
      case "content_block_start": {
        const block = { ...(event.content_block || {}) };
        if (block.type === "text") block.text = block.text || "";
        if (block.type === "thinking") block.thinking = block.thinking || "";
        if (block.type === "tool_use") block._json = "";
        blocks.set(event.index, block);
        if (block.type === "tool_use") {
          const k = toolCount++;
          toolIndex.set(event.index, k);
          return chunk({ tool_calls: [{ index: k, id: block.id, type: "function", function: { name: block.name, arguments: "" } }] });
        }
        return "";
      }
      case "content_block_delta": {
        const block = blocks.get(event.index);
        const delta = event.delta || {};
        if (!block) return "";
        if (delta.type === "text_delta") {
          block.text = (block.text || "") + (delta.text || "");
          return delta.text ? chunk({ content: delta.text }) : "";
        }
        if (delta.type === "input_json_delta") {
          block._json += delta.partial_json || "";
          return chunk({ tool_calls: [{ index: toolIndex.get(event.index), function: { arguments: delta.partial_json || "" } }] });
        }
        if (delta.type === "thinking_delta") block.thinking = (block.thinking || "") + (delta.thinking || "");
        else if (delta.type === "signature_delta") block.signature = (block.signature || "") + (delta.signature || "");
        return "";
      }
      case "message_delta": {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        usage = { ...usage, ...(event.usage || {}) };
        return "";
      }
      case "message_stop": {
        done = true;
        const content = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => {
          if (block.type !== "tool_use") return block;
          const { _json, ...rest } = block;
          return { ...rest, input: _json ? parseArguments(_json) : (block.input || {}) };
        });
        if (onMessage) {
          try {
            onMessage(content);
          } catch {
            // The cache is an optimisation; it must not break the stream.
          }
        }
        return finalFrame();
      }
      case "error": {
        done = true;
        const message = String(event.error?.message || "Anthropic stream error");
        const type = String(event.error?.type || "api_error");
        return `data: ${JSON.stringify({ error: { message, type }, ai_system6_error: { message, code: "anthropic_stream_error" } })}\n\ndata: [DONE]\n\n`;
      }
      default:
        return "";
    }
  }

  function finalFrame() {
    const out = {
      id, object: "chat.completion.chunk", created, model: modelName,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason(stopReason) }],
      usage: openAiUsage(usage),
      ai_system6_provider: providerBlock(modelName),
    };
    started = true;
    return `data: ${JSON.stringify(out)}\n\ndata: [DONE]\n\n`;
  }

  /** @param {string} line */
  function line(line) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.startsWith("data:")) return "";
    const text = trimmed.slice(5).trim();
    if (!text || text === "[DONE]") return "";
    try {
      return handle(JSON.parse(text));
    } catch {
      return "";
    }
  }

  return {
    /** @param {string} text */
    push(text) {
      buffer += String(text || "");
      let out = "";
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        out += line(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
      }
      return out;
    },
    end() {
      let out = buffer ? line(buffer) : "";
      buffer = "";
      if (!done) {
        done = true;
        out += finalFrame();
      }
      return out;
    },
  };
}

/**
 * @param {number} status
 * @param {any} body
 */
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * The fetch-shaped answer postJsonWithFallback hands back for an Anthropic URL.
 *
 * @param {string} targetUrl
 * @param {any} payload
 * @param {AbortSignal | null | undefined} signal
 * @param {{ headers?: Record<string, string>, postJson: (url: string, body: any, signal: any, headers: Record<string, string>, options: { streamResponse: boolean }) => Promise<{ response: any }>, stream?: boolean, thinkingCache?: ReturnType<typeof createThinkingCache> }} options
 * @returns {Promise<Response>}
 */
async function anthropicChatResponse(targetUrl, payload, signal, { headers = {}, postJson, stream = false, thinkingCache = defaultThinkingCache } = /** @type {any} */ ({})) {
  const pathname = (() => {
    try {
      return new URL(targetUrl).pathname;
    } catch {
      return "";
    }
  })();
  if (/\/embeddings$/.test(pathname)) {
    return jsonResponse(400, { error: { message: "Anthropic does not provide embeddings.", code: "anthropic_no_embeddings" } });
  }
  if (!/\/chat\/completions$/.test(pathname)) {
    return jsonResponse(404, { error: { message: `Unsupported path ${pathname}.`, code: "anthropic_unsupported_path" } });
  }
  const authorization = String(headers.Authorization || headers.authorization || "");
  const apiKey = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) return jsonResponse(400, { error: { message: "Missing Anthropic API key", code: "missing_byok_key" } });

  const body = toAnthropicRequest({ ...payload, stream }, { thinkingCache });
  const { response } = await postJson(`${ANTHROPIC_BASE_URL}/v1/messages`, body, signal, anthropicHeaders(apiKey, Boolean(body.fallbacks)), { streamResponse: stream });

  if (!response.ok) {
    const text = await response.text();
    let error = {};
    try {
      error = JSON.parse(text)?.error || {};
    } catch {
      // Not JSON; fall back to the raw text below.
    }
    const message = String(/** @type {any} */ (error).message || text || `Anthropic returned ${response.status}`);
    const type = String(/** @type {any} */ (error).type || "api_error");
    return jsonResponse(response.status, { error: { message, type, code: type } });
  }

  if (!stream) {
    const message = JSON.parse(await response.text());
    thinkingCache.remember(message.content);
    return jsonResponse(200, fromAnthropicMessage(message));
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const translator = createAnthropicStreamTranslator({ model: body.model, onMessage: (content) => thinkingCache.remember(content) });
  const iterator = response.body[Symbol.asyncIterator]();
  let closed = false;
  /** @type {ReadableStream<Uint8Array>} */
  const readable = new ReadableStream({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
        Promise.resolve(iterator.return?.()).catch(() => {});
      };
      if (signal) {
        if (signal.aborted) close();
        else signal.addEventListener("abort", close, { once: true });
      }
    },
    async pull(controller) {
      if (closed) return;
      try {
        // Keep reading until something is enqueued, or the stream is done:
        // a pull that enqueues nothing is not called again.
        for (;;) {
          const step = await iterator.next();
          if (closed) return;
          if (step.done) {
            const tail = translator.push(decoder.decode()) + translator.end();
            if (tail) controller.enqueue(encoder.encode(tail));
            closed = true;
            controller.close();
            return;
          }
          const value = step.value;
          const text = typeof value === "string" ? value : decoder.decode(value, { stream: true });
          const out = translator.push(text);
          if (out) {
            controller.enqueue(encoder.encode(out));
            return;
          }
        }
      } catch (error) {
        if (closed) return;
        const message = String(/** @type {any} */ (error)?.message || error || "Anthropic stream failed");
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message, type: "api_error" }, ai_system6_error: { message, code: "anthropic_stream_error" } })}\n\ndata: [DONE]\n\n`));
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
      Promise.resolve(iterator.return?.()).catch(() => {});
    },
  });
  return new Response(readable, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

module.exports = {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MODELS,
  anthropicChatResponse,
  anthropicHeaders,
  createAnthropicStreamTranslator,
  createThinkingCache,
  fromAnthropicMessage,
  isAnthropicUrl,
  toAnthropicRequest,
};
