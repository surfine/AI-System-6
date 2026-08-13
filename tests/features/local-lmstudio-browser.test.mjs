import vm from "node:vm";
import { createRequire } from "node:module";
import { read } from "../helpers/feature-test-harness.mjs";

const failures = [];
const ok = (condition, message) => {
  if (condition) console.log(`OK  local-lmstudio-browser: ${message}`);
  else {
    failures.push(message);
    console.error(`NO  local-lmstudio-browser: ${message}`);
  }
};

const source = read("app/core/local-lmstudio-client.js");
const sharedSource = read("app/shared/model-task-runtime.js");
const html = read("index.html");
const manifest = read("tooling/runtime-manifest.mjs");
const chat = read("app/core/chat-messages.js");
const persistenceStatus = read("app/core/persistence-status.js");
const cloudModel = read("app/features/cloud-model.js");
const boot = read("app/core/boot.js");
const context = read("app/core/context-retrieval.js");
const imports = read("app/features/export-import.js");
const importRoute = read("apps/server/server/routes/import-text.js");
const quickDraft = [
  "app/features/draft-desk.js",
  "app/features/quick-draft-ai.js",
].map((path) => read(path)).join("\n");
const meme = read("app/features/bureaucracy-meme.js");
const endfield = read("app/features/endfield-terminal.js");
const reader = read("app/features/reader.js");
const vision = read("app/features/teachtext-accessories.js");
const serverModelRoute = read("apps/server/server/routes/models.js");
const serverLmStudio = read("apps/server/server/lmstudio.js");

const localStateUpdateSource = persistenceStatus.slice(
  persistenceStatus.indexOf("function updateLocalModelState"),
  persistenceStatus.indexOf("const contextMinLength")
);
ok(
  localStateUpdateSource.includes('refreshCloudUsageDisplay === "function"'),
  "refreshes the global model indicator in the same transition as local model state"
);
const indicatorSource = chat.slice(
  chat.indexOf("function isLocalModelIndicatorReady"),
  chat.indexOf("function formatTokenCount")
);
ok(
  indicatorSource.includes('localReady ? "cloudModel" : "cloudModelOff"'),
  "shows the available model glyph only when the local model is loaded"
);
ok(
  indicatorSource.includes('isCloudActive || localReady ? "cloudModel" : "cloudModelOff"')
    && indicatorSource.includes('localReady ? getLocalModelDisplayName() : disconnectedText'),
  "an inactive saved cloud account cannot make an unloaded local model look connected"
);
const popoverSource = cloudModel.slice(
  cloudModel.indexOf("window.renderCloudModelPopover"),
  cloudModel.indexOf("function updateCheckButtonState")
);
ok(
  popoverSource.includes("if (!cloudReady && !localReady)")
    && popoverSource.includes('cloudPopoverElement("div", "cl-hdr", localName)'),
  "shows local model details instead of a disconnected message when no cloud account exists"
);

function makeClient(fetchImpl, options = {}) {
  const protocol = options.protocol || "https:";
  const hostname = options.hostname || "system6.aaronlau.me";
  const values = {
    endpoint: options.endpoint || "http://127.0.0.1:1234",
    "local-provider": options.provider || "lm-studio",
    "local-api-token": options.token || "",
  };
  const contextObject = {
    window: {
      location: {
        protocol,
        hostname,
        href: options.href || `${protocol}//${hostname}/`,
      },
    },
    document: {
      getElementById(id) {
        return { value: values[id] || "" };
      },
    },
    navigator: {
      userAgent: options.userAgent || "Mozilla/5.0 Chrome/140.0 Safari/537.36",
      vendor: options.vendor || "Google Inc.",
      permissions: {
        async query() {
          return { state: options.permission || "granted" };
        },
      },
    },
    fetch: fetchImpl,
    URL,
    Headers,
    Response,
    ReadableStream,
    TextDecoder,
    TextEncoder,
    AbortController,
    AbortSignal,
    DOMException,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(sharedSource, contextObject, { filename: "model-task-runtime.js" });
  vm.runInNewContext(source, contextObject, { filename: "local-lmstudio-client.js" });
  return contextObject.window.AISystem6LocalLMStudio;
}

{
  const requests = [];
  const ollamaTags = {
    models: [
      { name: "qwen3:4b", model: "qwen3:4b" },
      { name: "embeddinggemma:latest", model: "embeddinggemma:latest" },
    ],
  };
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/api/tags")) return Response.json(ollamaTags);
    if (url.endsWith("/api/ps")) return Response.json({ models: [] });
    if (url.endsWith("/api/show")) {
      const model = JSON.parse(options.body).model;
      return Response.json(model.startsWith("embeddinggemma")
        ? { capabilities: ["embedding"], model_info: { "bert.context_length": 8192 } }
        : { capabilities: ["completion", "tools"], model_info: { "qwen3.context_length": 32768 } });
    }
    if (url.endsWith("/v1/chat/completions")) return Response.json({ choices: [{ message: { content: "ollama ready" } }] });
    return Response.json({});
  }, { provider: "ollama", endpoint: "http://127.0.0.1:11434" });
  const result = await client.listModels();
  ok(requests[0].url === "http://127.0.0.1:11434/api/tags", "discovers Ollama through its native tags endpoint");
  ok(result.autoLoad === true && result.chatModels.length === 1 && result.embeddingModels.length === 1, "classifies Ollama chat and embedding models");
  ok(result.chatModels[0].max_context_length === 32768, "reads Ollama context metadata from the show endpoint");
  const response = await client.chat({ model: "qwen3:4b", messages: [{ role: "user", content: "hello" }] });
  ok((await response.json()).choices[0].message.content === "ollama ready", "uses Ollama's OpenAI-compatible chat endpoint");
}

const require = createRequire(import.meta.url);
const sharedRuntime = require("../../apps/desktop/app/shared/model-task-runtime.js");
ok(sharedRuntime.buildImportRepairMessages("raw", "scan.pdf").length === 2, "loads the same pure task contract in Node");
ok(sharedRuntime.localChatDefaults("qwen3.5-4b", { taskKind: "draft" }).enable_thinking === false, "shares local model tuning without DOM or Node dependencies");
ok(sharedRuntime.scrubVisibleModelOutput("<|channel>final answer<channel|>") === "answer", "shares visible-output cleanup");
ok(sharedRuntime.findHumanizerOutputHits("此外，这很重要").length === 1, "shares humanizer output detection");

const modelPayload = {
  models: [
    {
      type: "llm",
      key: "google/gemma-4-4b",
      display_name: "Gemma 4 4B",
      max_context_length: 131072,
      capabilities: { vision: true },
      loaded_instances: [{ id: "gemma-live", config: { context_length: 32768 } }],
    },
    {
      type: "embedding",
      key: "nomic/embed-text",
      display_name: "Nomic Embed",
      max_context_length: 8192,
      loaded_instances: [],
    },
  ],
};

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    return Response.json(modelPayload);
  }, { token: "lm-secret" });
  const result = await client.listModels();
  ok(requests[0].url === "http://127.0.0.1:1234/api/v1/models", "discovers models through the native v1 endpoint");
  ok(requests[0].options.mode === "cors" && requests[0].options.credentials === "omit", "uses CORS without browser credentials");
  ok(requests[0].options.targetAddressSpace === "loopback", "declares the loopback target address space for Chromium Local Network Access");
  ok(requests[0].options.headers.get("Authorization") === "Bearer lm-secret", "sends the optional token only as a Bearer header");
  ok(result.chatModels.length === 1 && result.embeddingModels.length === 1, "classifies chat and embedding models");
  ok(result.loaded_context_length === 32768 && result.chatModels[0].max_context_length === 131072, "synchronizes loaded and maximum context lengths");
  ok(result.chatModels[0].vision === true, "preserves the latest v1 vision capability");
}

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/load")) return Response.json({ status: "loaded", instance_id: "gemma-live" });
    if (url.endsWith("/unload")) return Response.json({ instance_id: "gemma-live" });
    return Response.json(modelPayload);
  });
  await client.loadModel("google/gemma-4-4b", { contextLength: 16384 });
  await client.unloadInstance("gemma-live");
  const load = requests.find((request) => request.url.endsWith("/api/v1/models/load"));
  const unload = requests.find((request) => request.url.endsWith("/api/v1/models/unload"));
  ok(JSON.parse(load.options.body).context_length === 16384, "loads a v1 model with the selected context length");
  ok(JSON.parse(unload.options.body).instance_id === "gemma-live", "unloads a v1 loaded instance by instance_id");
}

{
  const requests = [];
  let chatAttempts = 0;
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/api/v1/chat")) {
      chatAttempts += 1;
      if (chatAttempts === 1) return Response.json({ error: { message: "model not loaded" } }, { status: 400 });
      return Response.json({
        model_instance_id: "gemma-live",
        output: [{ type: "message", content: "ready" }],
        stats: { input_tokens: 4, total_output_tokens: 2 },
        response_id: "resp_ready",
      });
    }
    if (url.endsWith("/load")) return Response.json({ status: "loaded", instance_id: "gemma-live" });
    return Response.json(modelPayload);
  });
  const response = await client.chat({
    model: "google/gemma-4-4b",
    messages: [{ role: "user", content: "hello" }],
    stream: false,
    ai_system6_task_kind: "chat",
  });
  const responseData = await response.json();
  ok(responseData.choices[0].message.content === "ready", "adapts native v1 chat JSON for the shared task runtime");
  ok(responseData.ai_system6_lmstudio_response_id === "resp_ready", "preserves the native response_id for stateful follow-ups");
  ok(chatAttempts === 2, "performs exactly one load-and-retry when a chat model is not loaded");
  ok(requests.filter((request) => request.url.endsWith("/api/v1/models/load")).length === 1, "does not loop model loading");
  const chatBody = JSON.parse(requests.find((request) => request.url.endsWith("/api/v1/chat")).options.body);
  ok(chatBody.input === "hello" && chatBody.store === true, "maps system/user chat payloads to native v1 input and state storage");
  ok(!("ai_system6_task_kind" in chatBody), "does not leak client-only tuning fields to LM Studio");
}

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    return Response.json({
      id: "resp_history",
      status: "completed",
      model: "gemma-live",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "responses history" }] }],
      usage: { input_tokens: 8, output_tokens: 2 },
    });
  });
  const response = await client.chat({
    model: "google/gemma-4-4b",
    messages: [
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "follow-up" },
    ],
    stream: false,
  });
  ok((await response.json()).choices[0].message.content === "responses history", "keeps durable legacy histories usable during migration");
  ok(requests[0].url.endsWith("/v1/responses"), "uses the stateful Responses REST endpoint when assistant history has no native response_id");
}

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/api/v1/chat")) {
      return Response.json({ error: "Not Found" }, { status: 404 });
    }
    return Response.json({
      id: "resp_route_fallback",
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "responses endpoint" }] }],
      usage: { input_tokens: 4, output_tokens: 2 },
    });
  });
  const response = await client.chat({
    model: "google/gemma-4-4b",
    messages: [{ role: "user", content: "hello" }],
    stream: false,
  });
  ok((await response.json()).choices[0].message.content === "responses endpoint", "keeps inference on a modern REST route when native chat is unavailable");
  ok(requests[0].url.endsWith("/api/v1/chat") && requests[1].url.endsWith("/v1/responses"), "falls back once from native chat to Responses");
}

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    return Response.json({
      model_instance_id: "gemma-live",
      output: [{ type: "message", content: "stateful answer" }],
      stats: { input_tokens: 6, total_output_tokens: 3 },
      response_id: "resp_next",
    });
  });
  await client.chat({
    model: "google/gemma-4-4b",
    messages: [
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "follow-up" },
    ],
    _lmstudio_previous_response_id: "resp_previous",
    _lmstudio_previous_response_api: "lmstudio-native-v1",
    stream: false,
  });
  const body = JSON.parse(requests[0].options.body);
  ok(requests[0].url.endsWith("/api/v1/chat") && body.previous_response_id === "resp_previous", "continues native v1 chats by response_id");
  ok(body.input === "follow-up" && !("system_prompt" in body), "sends only the new user turn for a stateful follow-up");
}

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/api/v1/chat")) {
      return Response.json({ error: { message: "previous_response_id not found" } }, { status: 404 });
    }
    return Response.json({
      id: "resp_recovered",
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "recovered history" }] }],
      usage: { input_tokens: 10, output_tokens: 2 },
    });
  });
  const response = await client.chat({
    model: "google/gemma-4-4b",
    messages: [
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "follow-up" },
    ],
    _lmstudio_previous_response_id: "resp_stale",
    _lmstudio_previous_response_api: "lmstudio-native-v1",
    stream: false,
  });
  ok((await response.json()).choices[0].message.content === "recovered history", "recovers when an imported or expired native response chain is unavailable");
  ok(requests[1].url.endsWith("/v1/responses"), "replays the durable file history once through Responses when response_id recovery is needed");
}

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    return Response.json({
      id: "resp_tool",
      status: "completed",
      model: "gemma-live",
      output: [{ type: "function_call", call_id: "call_1", name: "read_project_file", arguments: "{\"id\":\"f1\"}" }],
      usage: { input_tokens: 12, output_tokens: 4 },
    });
  });
  const response = await client.chat({
    model: "google/gemma-4-4b",
    messages: [{ role: "user", content: "Read the file" }],
    tools: [{ type: "function", function: { name: "read_project_file", description: "Read", parameters: { type: "object", properties: { id: { type: "string" } } } } }],
    tool_choice: "auto",
    stream: false,
  });
  const data = await response.json();
  const body = JSON.parse(requests[0].options.body);
  ok(requests[0].url.endsWith("/v1/responses") && body.tools[0].name === "read_project_file", "routes custom project tools through the Responses REST endpoint");
  ok(data.choices[0].message.tool_calls[0].function.name === "read_project_file", "adapts Responses function calls for the existing browser tool loop");
  ok(data.ai_system6_lmstudio_response_id === "resp_tool" && data.ai_system6_lmstudio_api === "lmstudio-responses-v1", "preserves Responses state for the next tool or chat turn");
}

{
  const requests = [];
  const client = makeClient(async (url, options) => {
    requests.push({ url, options });
    return Response.json({
      id: "resp_after_second_tool",
      status: "completed",
      model: "gemma-live",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }],
      usage: { input_tokens: 6, output_tokens: 1 },
    });
  });
  await client.chat({
    model: "google/gemma-4-4b",
    messages: [
      { role: "user", content: "Use two tools" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "read_project_file", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_1", content: "first result" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_2", type: "function", function: { name: "read_project_file", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_2", content: "second result" },
    ],
    tools: [{ type: "function", function: { name: "read_project_file", parameters: { type: "object", properties: {} } } }],
    _lmstudio_previous_response_id: "resp_second_call",
    _lmstudio_previous_response_api: "lmstudio-responses-v1",
    stream: false,
  });
  const body = JSON.parse(requests[0].options.body);
  ok(body.previous_response_id === "resp_second_call", "continues a Responses tool chain from the last server-owned response");
  ok(body.input.length === 1 && body.input[0].call_id === "call_2", "sends only the newest tool output instead of replaying settled call ids");
}

{
  let embeddingAttempts = 0;
  const paths = [];
  const client = makeClient(async (url) => {
    paths.push(url);
    if (url.endsWith("/v1/embeddings")) {
      embeddingAttempts += 1;
      if (embeddingAttempts === 1) return Response.json({ error: "no model loaded" }, { status: 400 });
      return Response.json({ data: [{ embedding: [0.1, 0.2] }] });
    }
    if (url.endsWith("/load")) return Response.json({ status: "loaded" });
    return Response.json(modelPayload);
  });
  const response = await client.embed({ model: "nomic/embed-text", input: ["a", "b"] });
  ok((await response.json()).data[0].embedding.length === 2, "supports batched OpenAI-compatible embeddings");
  ok(embeddingAttempts === 2 && paths.some((path) => path.endsWith("/api/v1/models/load")), "loads and retries an embedding model once");
}

{
  const client = makeClient(async () => Response.json({ error: "bad token" }, { status: 401 }));
  await client.listModels().then(
    () => ok(false, "classifies rejected tokens"),
    (error) => ok(String(error.message).includes("lmstudio_auth_failed"), "classifies rejected tokens")
  );
}

{
  const client = makeClient(async () => {
    throw new TypeError("Failed to fetch");
  });
  await client.listModels().then(
    () => ok(false, "classifies CORS or offline failures"),
    (error) => ok(String(error.message).includes("lmstudio_cors_or_offline"), "classifies CORS or offline failures")
  );
}

{
  const client = makeClient(async () => Response.json({ data: [] }));
  await client.listModels().then(
    () => ok(false, "rejects incompatible model APIs"),
    (error) => ok(String(error.message).includes("lmstudio_v1_required"), "rejects incompatible model APIs")
  );
  ok(client.parseJsonText("```json\n{\"ok\":true}\n```")?.ok === true, "parses fenced structured output without a server");
}

{
  const client = makeClient(async () => Response.json(modelPayload));
  ok(client.normalizeBaseUrl("http://localhost:1234/") === "http://localhost:1234", "accepts HTTP loopback endpoints");
  for (const unsafe of ["http://192.168.1.9:1234", "https://127.0.0.1:1234", "http://127.0.0.1:1234/v1"]) {
    try {
      client.normalizeBaseUrl(unsafe);
      ok(false, `rejects unsafe endpoint ${unsafe}`);
    } catch {
      ok(true, `rejects unsafe endpoint ${unsafe}`);
    }
  }
  ok(client.isPublicWebMode() === true, "detects the public Web runtime");
}

{
  let requestCount = 0;
  const safariUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
  const client = makeClient(async () => {
    requestCount += 1;
    return Response.json(modelPayload);
  }, { userAgent: safariUserAgent, vendor: "Apple Computer, Inc." });
  ok(client.isSafariPublicWebUnsupported() === true, "recognizes Safari on the public Web before attempting loopback access");
  await client.listModels().then(
    () => ok(false, "stops Safari before an unsupported loopback request"),
    (error) => ok(String(error.message).includes("lmstudio_safari_unsupported") && requestCount === 0, "gives Safari a dedicated transport explanation")
  );

  const localClient = makeClient(async () => Response.json(modelPayload), {
    hostname: "127.0.0.1",
    userAgent: safariUserAgent,
    vendor: "Apple Computer, Inc.",
  });
  ok(localClient.isSafariPublicWebUnsupported() === false, "keeps Safari available when the app itself runs locally");

  const httpClient = makeClient(async () => Response.json(modelPayload), {
    protocol: "http:",
    hostname: "local.system6.aaronlau.me",
    userAgent: safariUserAgent,
    vendor: "Apple Computer, Inc.",
  });
  ok(httpClient.isSafariPublicWebUnsupported() === false && httpClient.isSafariHttpLocalMode() === true, "allows Safari from the dedicated HTTP local entry");
  const safariRequests = [];
  const safariFetchClient = makeClient(async (url, options) => {
    safariRequests.push({ url, options });
    return Response.json(modelPayload);
  }, {
    protocol: "http:",
    hostname: "local.system6.aaronlau.me",
    userAgent: safariUserAgent,
    vendor: "Apple Computer, Inc.",
  });
  await safariFetchClient.listModels();
  ok(!("targetAddressSpace" in safariRequests[0].options), "omits Chromium's loopback hint in Safari/WebKit");
  ok(
    client.httpLocalEntryUrl("http://local.system6.aaronlau.me") === "http://local.system6.aaronlau.me/",
    "builds the configured Safari HTTP entry without weakening the HTTPS host"
  );
  ok(
    /function openSafariHttpLocalEntry\(\)[\s\S]*?const blankTab = window\.open\([\s\S]*?getCapabilities/.test(persistenceStatus),
    "opens the Safari paste tab synchronously inside the click gesture, before any await"
  );
  ok(
    /blankTab\?\.close\(\)[\s\S]*?throw error/.test(persistenceStatus),
    "closes the paste tab again when the local HTTP origin is not configured"
  );
}

{
  const encoder = new TextEncoder();
  const client = makeClient(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("event: message.delta\ndata: {\"type\":\"message.delta\",\"content\":\"Hi\"}\n\n"));
      controller.enqueue(encoder.encode("event: chat.end\ndata: {\"type\":\"chat.end\",\"result\":{\"model_instance_id\":\"stream-model\",\"output\":[{\"type\":\"message\",\"content\":\"Hi\"}],\"stats\":{\"input_tokens\":1,\"total_output_tokens\":1},\"response_id\":\"resp_stream\"}}\n\n"));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  const response = await client.chat({ model: "stream-model", messages: [{ role: "user", content: "hello" }], stream: true });
  const streamText = await response.text();
  ok(streamText.includes("[DONE]") && streamText.includes("resp_stream"), "adapts native named SSE events and preserves the response_id");
}

{
  const client = makeClient(async () => new Response(new ReadableStream({
    start() {
      // Headers arrive, then the model never emits a byte.
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  const response = await client.chat(
    { model: "idle-model", messages: [{ role: "user", content: "hello" }], stream: true },
    { timeoutMs: 5 }
  );
  await response.text().then(
    () => ok(false, "times out an idle inference stream"),
    (error) => ok(String(error.message).includes("lmstudio_timeout"), "times out an idle inference stream")
  );
}

{
  let cancelObserved = false;
  const client = makeClient(async (_url, options) => new Response(new ReadableStream({
    start(controller) {
      options.signal.addEventListener("abort", () => {
        cancelObserved = true;
        controller.error(options.signal.reason);
      }, { once: true });
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  const controller = new AbortController();
  const response = await client.chat(
    { model: "cancel-stream-model", messages: [{ role: "user", content: "hello" }], stream: true },
    { signal: controller.signal, timeoutMs: 1000 }
  );
  controller.abort();
  await response.text().catch(() => {});
  ok(cancelObserved, "keeps user cancellation wired after streaming headers arrive");
}

{
  const client = makeClient(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  const controller = new AbortController();
  const request = client.chat({ model: "cancel-model", messages: [], stream: true }, {
    signal: controller.signal,
    timeoutMs: 1000,
  });
  controller.abort();
  await request.then(
    () => ok(false, "propagates user cancellation"),
    (error) => ok(error?.name === "AbortError", "propagates user cancellation")
  );
}

{
  const client = makeClient(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  const keepProcessAlive = setTimeout(() => {}, 100);
  try {
    await client.chat({ model: "timeout-model", messages: [], stream: false }, { timeoutMs: 5 }).then(
      () => ok(false, "classifies request timeouts"),
      (error) => ok(String(error.message).includes("lmstudio_timeout"), "classifies request timeouts")
    );
  } finally {
    clearTimeout(keepProcessAlive);
  }
}

{
  // WebKit presents a timed-out fetch as a plain AbortError ("Fetch is
  // aborted") while the real reason lives on the signal. The client must
  // still classify it as a timeout instead of swallowing it as a user
  // cancellation (which left the desk Busy forever on WebKit).
  const client = makeClient(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      reject(new DOMException("Fetch is aborted", "AbortError"));
    }, { once: true });
  }));
  const keepProcessAlive = setTimeout(() => {}, 100);
  try {
    await client.chat({ model: "timeout-model", messages: [], stream: false }, { timeoutMs: 5 }).then(
      () => ok(false, "classifies WebKit-shaped timeout aborts"),
      (error) => ok(String(error.message).includes("lmstudio_timeout"), "classifies WebKit-shaped timeout aborts")
    );
  } finally {
    clearTimeout(keepProcessAlive);
  }
}

ok(!source.includes("/api/v0/"), "never probes the legacy v0 API");
ok(
  serverModelRoute.indexOf("`${baseUrl}/api/v1/models`")
    < serverModelRoute.indexOf("`${baseUrl}/api/v0/models`"),
  "server model discovery prefers the native v1 inventory over the legacy v0 fallback"
);
ok(
  serverLmStudio.indexOf("const candidates = [`${root}/api/v1/models`, `${root}/api/v0/models`]") !== -1,
  "server autoload discovery prefers the native v1 inventory"
);
ok(!source.includes('"/api/chat"') && !source.includes('"/api/models"'), "client contains no VPS local-model proxy fallback");
ok(read("app/core/persistence-status.js").includes('local_connection_safari_unsupported'), "control panel maps Safari to a dedicated connection state");
ok(/connectLocalLmStudio[\s\S]*?setModelPickerOptions\(chatModels, embeddingModels\)[\s\S]*?renderLocalConnectionStatus\("ready", data\)/.test(read("app/core/persistence-status.js")), "a successful connection fills the model pickers before showing ready");
ok(/connectLocalLmStudio[\s\S]*?if \(!selectedModel && chatModels\.length && !isManualLocalModelMode\(\)\)[\s\S]*?modelInput\.value = selectedModel\.id/.test(persistenceStatus), "switching endpoints selects a model from the new inventory instead of leaving every AI composer disabled");
ok(read("app/core/persistence-status.js").includes('window.location.assign(`lmstudio:${slashes}`)'), "control panel can open the installed LM Studio app directly");
ok(/function connectOrLaunchLocalModel\(\)[\s\S]*?openLocalModelApp\(\);[\s\S]*?connectLocalLmStudio\(\{ toggle: false \}\)/.test(read("app/core/persistence-status.js")), "one local-model button launches LM Studio and then attempts the connection");
ok(boot.includes('isSafariHttpLocalMode') && boot.includes('setControlTab("local")'), "Safari HTTP entry opens directly on local-model setup");
ok(read("app/data/translations-en.js").includes("open this site in Chrome or Edge, or use a cloud model"), "English guidance offers two supported next steps");
ok(read("app/data/translations-zh.js").includes("Safari 本机入口（HTTP）、改用 Chrome/Edge，或改用云端模型"), "Chinese guidance offers supported next steps without blaming LM Studio");
ok(manifest.includes('"app/shared/model-task-runtime.js"') && manifest.includes('"app/core/local-lmstudio-client.js"'), "loads shared contracts before the browser adapter");
ok(html.includes('id="local-api-token" type="password"') && html.includes('id="connect-local-model"') && !html.includes('id="open-local-model-app"'), "control panel exposes one launch/connect toggle instead of two competing buttons");
ok(chat.includes("AISystem6LocalLMStudio.chat") && !chat.includes('fetch("/api/model-budget"'), "chat and context budgeting stay in the browser");
ok(chat.includes("streamFallback: true") && chat.includes("stream: false"), "abnormal streams retry once as non-streaming JSON");
ok(context.includes("AISystem6LocalLMStudio.embed"), "RAG embeddings can execute directly in the browser");
ok(imports.includes('model_execution: "client"') && importRoute.includes('body.model_execution === "client"'), "import requests prevent server-side model execution");
ok(quickDraft.includes("sendLocalModelTask"), "Quick Draft has a direct local-model path");
ok(meme.includes("sendLocalModelTask"), "Bureaucracy Meme has a direct local-model path");
ok(endfield.includes('fetch("/api/endfield/search"') && endfield.includes("sendLocalModelTask"), "Endfield separates deterministic VPS search from browser inference");
ok(reader.includes("translateReaderSubtitleLocally"), "subtitle translation has a browser-local path");
ok(vision.includes("sendLocalModelTask"), "vision analysis has a browser-local path");
ok(importRoute.includes('require("../../../desktop/app/shared/model-task-runtime.js")'), "Node import repair uses the same pure prompt and cleanup module");
ok(!imports.includes("localApiToken") && !importRoute.includes("localApiToken"), "LM Studio token is absent from import payloads and server processing");

if (failures.length) {
  console.error(`\nlocal-lmstudio-browser feature test failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log("\nlocal-lmstudio-browser feature test passed.");
