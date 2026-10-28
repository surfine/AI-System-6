// Anthropic Messages adapter: an OpenAI-shaped request goes out as a native
// Messages call and comes back as an OpenAI-shaped answer. Offline: the
// transport is a fake and nothing touches the network.

import a from "../../apps/server/server/anthropic-messages.js";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("anthropic-messages");

const user = (text) => ({ role: "user", content: text });
const req = (messages, extra = {}) => a.toAnthropicRequest({ model: "claude-opus-5-5", messages, ...extra });

// --- urls, models, headers --------------------------------------------------
test.assert(a.isAnthropicUrl("https://api.anthropic.com/v1/chat/completions") && !a.isAnthropicUrl("http://api.anthropic.com") && !a.isAnthropicUrl("https://api.anthropic.com.evil.test/"), "only https api.anthropic.com counts");
test.assert(a.ANTHROPIC_MODELS.length === 4 && Object.isFrozen(a.ANTHROPIC_MODELS) && a.ANTHROPIC_DEFAULT_MODEL === "claude-opus-5-5", "four frozen models, Opus 5.5 default");
test.assert(a.anthropicHeaders("k")["anthropic-beta"] === undefined && a.anthropicHeaders("k", true)["anthropic-beta"] === "server-side-fallback-2026-07-01" && a.anthropicHeaders("k")["x-api-key"] === "k", "the beta header rides only with fallbacks");

// --- system placement -------------------------------------------------------
{
  const body = req([{ role: "system", content: "A" }, { role: "system", content: "B" }, user("hi")]);
  test.assert(body.system.length === 2 && body.system[1].cache_control?.type === "ephemeral" && !body.system[0].cache_control, "leading system messages become system blocks, cache mark on the last");
  test.assert(body.messages.length === 1 && body.messages[0].role === "user" && body.cache_control.type === "ephemeral", "no system message leads messages; top-level cache_control set");
  const kept = req([user("q"), { role: "system", content: "mid" }, { role: "assistant", content: "a" }, user("r")]);
  test.assert(kept.messages[1].role === "system" && kept.messages[1].content === "mid", "a mid system after a user and before an assistant stays in place");
  const folded = req([user("q"), { role: "assistant", content: "a" }, { role: "system", content: "late" }, user("r")]);
  test.assert(!folded.messages.some((m) => m.role === "system") && folded.messages[2].content.at(-1).text === "late", "any other mid system folds into the next user message");
}

{
  const body = req([user("q"), { role: "assistant", content: "" }, user(""), user("r")]);
  test.assert(body.messages.length === 1 && body.messages[0].content.length === 2, "empty turns are dropped before the merge, never sent as empty content");
}

// --- tool round-trip --------------------------------------------------------
{
  const body = req([
    user("go"),
    { role: "assistant", content: "ok", tool_calls: [{ id: "t1", type: "function", function: { name: "f", arguments: '{"x":1}' } }, { id: "t2", type: "function", function: { name: "g", arguments: "not json" } }] },
    { role: "tool", tool_call_id: "t1", content: "r1" },
    { role: "tool", tool_call_id: "t2", content: "r2" },
    user("thanks"),
  ]);
  const [, assistant, results] = body.messages;
  test.assert(assistant.content[0].type === "text" && assistant.content[1].input.x === 1 && assistant.content[2].input && Object.keys(assistant.content[2].input).length === 0, "tool_calls become tool_use blocks; bad JSON becomes {}");
  test.assert(body.messages.length === 3 && results.role === "user" && results.content.length === 3 && results.content[0].type === "tool_result" && results.content[1].tool_use_id === "t2" && results.content[2].text === "thanks", "tool messages share one user message; a following user merges after them");
}

// --- dropped params, tools, effort, fallbacks -------------------------------
{
  const body = req([user("x")], { temperature: 0.2, top_p: 1, presence_penalty: 1, frequency_penalty: 1, thinking: { type: "disabled" }, reasoning_effort: "medium", stream_options: {}, user: "u", n: 2, response_format: {}, ai_system6_x: 1, _private: 1, stop: "END" });
  const banned = ["temperature", "top_p", "top_k", "presence_penalty", "frequency_penalty", "thinking", "reasoning_effort", "stream_options", "user", "user_id", "n", "response_format", "ai_system6_x", "_private"];
  test.assert(banned.every((k) => !(k in body)), "sampling and desk-private keys are dropped, and no thinking key");
  test.assert(body.stop_sequences[0] === "END" && body.output_config.effort === "medium" && body.max_tokens === 16000 && !("stream" in body), "stop, effort and default max_tokens map");
  test.assert(req([user("x")], { stream: true, max_tokens: 99999 }).max_tokens === 64000 && req([user("x")], { max_tokens: 99999 }).max_tokens === 16000, "max_tokens clamps by mode");
  const efforts = Object.fromEntries(["none", "minimal", "low", "medium", "high", "xhigh", "max", "weird"].map((e) => [e, req([user("x")], { reasoning_effort: e }).output_config?.effort]));
  test.assert(efforts.none === "low" && efforts.minimal === "low" && efforts.low === "low" && efforts.xhigh === "xhigh" && efforts.max === "max" && efforts.high === "high" && efforts.weird === undefined, "effort levels map, unknown is omitted");
  test.assert(req([user("x")], { reasoning_effort: "low", ai_system6_anthropic_effort: "max" }).output_config.effort === "max", "the desk's own effort field wins");
  const tools = [{ type: "function", function: { name: "f", description: "d", parameters: { type: "object", properties: { a: {} } } } }, { type: "function", function: { name: "g" } }];
  const withTools = req([user("x")], { tools, tool_choice: "required" });
  test.assert(withTools.tools[0].input_schema.properties.a && withTools.tools[1].input_schema.type === "object" && withTools.tool_choice.type === "auto", "tools map and forced choice becomes auto");
  test.assert(req([user("x")], { tools, tool_choice: "none" }).tool_choice.type === "none" && !("tools" in req([user("x")])) && !("tool_choice" in req([user("x")])), "none stays none; no tools means no tool keys");
  test.assert(body.fallbacks === "default" && req([user("x")], { model: "claude-haiku-5-5" }).fallbacks === undefined && req([user("x")], { model: "gpt-4o" }).model === "claude-opus-5-5", "fallbacks on opus, not haiku; foreign model falls to default");
}

// --- content parts, first message ------------------------------------------
{
  const body = req([{ role: "assistant", content: "hello" }, { role: "user", content: [{ type: "text", text: "see" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } }, { type: "image_url", image_url: { url: "https://x.test/a.png" } }, { type: "audio", data: 1 }, { type: "text", text: "" }] }]);
  test.assert(body.messages[0].role === "user" && body.messages[0].content[0].text === "(continue)", "an assistant-first conversation gets a continue user turn");
  const parts = body.messages[2]?.content || body.messages[1].content;
  test.assert(parts.length === 3 && parts[1].source.type === "base64" && parts[1].source.media_type === "image/png" && parts[2].source.type === "url", "images map; unknown parts and empty text drop");
}

// --- thinking cache ---------------------------------------------------------
{
  const cache = a.createThinkingCache();
  const content = [{ type: "thinking", thinking: "hm", signature: "sig" }, { type: "tool_use", id: "toolu_1", name: "f", input: {} }];
  cache.remember(content);
  const body = a.toAnthropicRequest({ model: "claude-opus-5-5", messages: [user("go"), { role: "assistant", content: "", tool_calls: [{ id: "toolu_1", type: "function", function: { name: "f", arguments: "{}" } }] }, { role: "tool", tool_call_id: "toolu_1", content: "r" }] }, { thinkingCache: cache });
  test.assert(body.messages[1].content === content, "a remembered assistant turn is replayed verbatim");
  let clock = 0;
  const aging = a.createThinkingCache({ ttlMs: 10, now: () => clock });
  aging.remember(content);
  clock = 11;
  test.assert(aging.lookup(["toolu_1"]) === null && cache.lookup(["nope"]) === null, "expired or unknown ids miss");
}

// --- non-stream response ----------------------------------------------------
{
  const out = a.fromAnthropicMessage({ id: "msg_1", model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "a" }, { type: "text", text: "b" }, { type: "tool_use", id: "t", name: "f", input: { q: 1 } }], usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 20, output_tokens: 7 } });
  test.assert(out.object === "chat.completion" && out.choices[0].message.content === "ab" && out.choices[0].finish_reason === "tool_calls" && out.choices[0].message.tool_calls[0].function.arguments === '{"q":1}', "text joins, tool_use becomes tool_calls");
  test.assert(out.usage.prompt_tokens === 35 && out.usage.completion_tokens === 7 && out.usage.total_tokens === 42 && out.usage.prompt_tokens_details.cached_tokens === 20 && out.ai_system6_provider.host === "Anthropic API", "usage and provider block map");
  const reasons = ["end_turn", "max_tokens", "refusal", "pause_turn", "stop_sequence"].map((r) => a.fromAnthropicMessage({ stop_reason: r, content: [] }).choices[0].finish_reason);
  test.assert(reasons.join() === "stop,length,content_filter,stop,stop" && a.fromAnthropicMessage({ content: [] }).choices[0].message.content === null, "finish reasons map; no text is null");
}

// --- stream translation, split mid-line ------------------------------------
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const upstream = [
  sse("message_start", { type: "message_start", message: { id: "msg_s", model: "claude-opus-5-5", usage: { input_tokens: 12, cache_read_input_tokens: 3 } } }),
  sse("ping", { type: "ping" }),
  sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
  sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }),
  sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "S" } }),
  sse("content_block_stop", { type: "content_block_stop", index: 0 }),
  sse("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "你好" } }),
  sse("content_block_stop", { type: "content_block_stop", index: 1 }),
  sse("content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_9", name: "f", input: {} } }),
  sse("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"a":' } }),
  sse("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "1}" } }),
  sse("content_block_stop", { type: "content_block_stop", index: 2 }),
  sse("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } }),
  sse("message_stop", { type: "message_stop" }),
].join("");
const frames = (text) => text.split("\n\n").filter(Boolean).map((f) => f.slice(6)).map((f) => (f === "[DONE]" ? f : JSON.parse(f)));
const sizes = [7, 13, 5, 31];

{
  let remembered = null;
  const tr = a.createAnthropicStreamTranslator({ model: "claude-opus-5-5", onMessage: (c) => { remembered = c; } });
  let out = "";
  for (let i = 0, n = 0; i < upstream.length; n += 1) {
    const size = sizes[n % sizes.length];
    out += tr.push(upstream.slice(i, i + size));
    i += size;
  }
  out += tr.end();
  const fs = frames(out);
  const chunks = fs.filter((f) => f !== "[DONE]");
  test.assert(fs.at(-1) === "[DONE]" && out.endsWith("data: [DONE]\n\n") && out.split("[DONE]").length === 2, "the stream ends with exactly one [DONE]");
  test.assert(chunks[0].choices[0].delta.role === "assistant" && chunks.filter((c) => c.choices[0].delta.role).length === 1, "only the first chunk carries the role");
  test.assert(chunks.map((c) => c.choices[0].delta.content).filter(Boolean).join("") === "你好", "text deltas stream through");
  const calls = chunks.flatMap((c) => c.choices[0].delta.tool_calls || []);
  test.assert(calls.length === 3 && calls[0].index === 0 && calls[0].id === "toolu_9" && calls[0].function.name === "f" && calls[0].function.arguments === "" && calls.slice(1).map((c) => c.function.arguments).join("") === '{"a":1}', "a tool call opens, then streams two argument pieces");
  const last = chunks.at(-1);
  test.assert(last.choices[0].finish_reason === "tool_calls" && Object.keys(last.choices[0].delta).length === 0 && last.usage.prompt_tokens === 15 && last.usage.completion_tokens === 9 && last.usage.prompt_tokens_details.cached_tokens === 3 && last.ai_system6_provider.id === "anthropic", "the closing chunk has finish_reason, merged usage and provider");
  test.assert(remembered?.length === 3 && remembered[0].signature === "S" && remembered[0].thinking === "hmm" && remembered[2].input.a === 1, "onMessage gets the reassembled content with thinking and parsed input");
  const err = a.createAnthropicStreamTranslator({ model: "m" }).push(sse("error", { type: "error", error: { type: "overloaded_error", message: "busy" } }));
  const ef = frames(err);
  test.assert(ef[0].error.message === "busy" && ef[0].ai_system6_error.code === "anthropic_stream_error" && ef[1] === "[DONE]", "an error event becomes an error frame then [DONE]");
}

// --- anthropicChatResponse with a fake transport ----------------------------
const URL_CHAT = "https://api.anthropic.com/v1/chat/completions";
const auth = { Authorization: "Bearer sk-ant-test" };
const fakeResponse = (status, text, body) => ({ ok: status >= 200 && status < 300, status, text: async () => text, body });
const payload = { model: "claude-opus-5-5", messages: [user("hi")] };

{
  let called = 0;
  const noCall = async () => { called += 1; return { response: fakeResponse(200, "{}") }; };
  const missing = await a.anthropicChatResponse(URL_CHAT, payload, null, { headers: {}, postJson: noCall });
  const body = await missing.json();
  test.assert(missing.status === 400 && body.error.code === "missing_byok_key" && called === 0, "a missing key answers 400 without calling the transport");
  const emb = await a.anthropicChatResponse("https://api.anthropic.com/v1/embeddings", payload, null, { headers: auth, postJson: noCall });
  test.assert(emb.status === 400 && (await emb.json()).error.code === "anthropic_no_embeddings" && called === 0, "embeddings answer 400 with its code");
  const other = await a.anthropicChatResponse("https://api.anthropic.com/v1/models", payload, null, { headers: auth, postJson: noCall });
  test.assert(other.status === 404 && called === 0, "an unknown path answers 404");
}

{
  let seen;
  const cache = a.createThinkingCache();
  const message = { id: "msg_n", model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "thinking", thinking: "t", signature: "s" }, { type: "tool_use", id: "toolu_1", name: "f", input: {} }], usage: { input_tokens: 1, output_tokens: 2 } };
  const postJson = async (url, body, signal, headers, options) => { seen = { url, body, headers, options }; return { response: fakeResponse(200, JSON.stringify(message)) }; };
  const res = await a.anthropicChatResponse(URL_CHAT, payload, null, { headers: auth, postJson, thinkingCache: cache });
  const json = await res.json();
  test.assert(seen.url === "https://api.anthropic.com/v1/messages" && seen.headers["x-api-key"] === "sk-ant-test" && seen.headers["anthropic-beta"] && !("Authorization" in seen.headers) && seen.options.streamResponse === false, "the call goes to /v1/messages with Anthropic headers and no bearer");
  test.assert(res.status === 200 && json.choices[0].finish_reason === "tool_calls" && cache.lookup(["toolu_1"])?.[0].type === "thinking", "a 200 maps to chat.completion and fills the thinking cache");
  await a.anthropicChatResponse(URL_CHAT, { ...payload, model: "claude-haiku-5-5" }, null, { headers: auth, postJson, thinkingCache: cache });
  test.assert(!("anthropic-beta" in seen.headers), "no beta header for haiku");
}

for (const status of [401, 429, 529]) {
  const postJson = async () => ({ response: fakeResponse(status, JSON.stringify({ type: "error", error: { type: "some_error", message: `m${status}` } })) });
  const res = await a.anthropicChatResponse(URL_CHAT, payload, null, { headers: auth, postJson });
  const body = await res.json();
  test.assert(res.status === status && body.error.message === `m${status}` && body.error.code === "some_error" && body.error.type === "some_error", `upstream ${status} keeps its status and maps its error`);
}

{
  const encoder = new TextEncoder();
  const pieces = [];
  for (let i = 0; i < upstream.length; i += 17) pieces.push(encoder.encode(upstream.slice(i, i + 17)));
  const webBody = new ReadableStream({ start(c) { for (const p of pieces) c.enqueue(p); c.close(); } });
  const cache = a.createThinkingCache();
  let options;
  const postJson = async (url, body, signal, headers, opts) => { options = { body, opts }; return { response: fakeResponse(200, "", webBody) }; };
  const res = await a.anthropicChatResponse(URL_CHAT, { ...payload }, null, { headers: auth, postJson, stream: true, thinkingCache: cache });
  const text = await res.text();
  test.assert(res.headers.get("content-type") === "text/event-stream" && options.body.stream === true && options.opts.streamResponse === true, "stream mode asks for a streamed body and answers text/event-stream");
  test.assert(text.endsWith("data: [DONE]\n\n") && frames(text).filter((f) => f !== "[DONE]").length >= 5 && cache.lookup(["toolu_9"]) !== null, "the stream reaches [DONE] and fills the cache");

  // A Node-style async iterable that never ends, then an abort.
  const ac = new AbortController();
  async function* endless() { yield encoder.encode(upstream.slice(0, 40)); await new Promise((r) => setTimeout(r, 5000)); }
  const slow = async () => ({ response: fakeResponse(200, "", endless()) });
  const aborted = await a.anthropicChatResponse(URL_CHAT, payload, ac.signal, { headers: auth, postJson: slow, stream: true });
  const reader = aborted.body.getReader();
  setTimeout(() => ac.abort(), 20);
  const result = await Promise.race([
    (async () => { for (;;) { const { done } = await reader.read(); if (done) return "closed"; } })(),
    new Promise((r) => setTimeout(() => r("hung"), 2000)),
  ]);
  test.assert(result === "closed", "an abort closes the stream");
}

test.finish();
