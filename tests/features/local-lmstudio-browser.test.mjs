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
const manifest = read("scripts/runtime-manifest.mjs");
const chat = read("app/core/chat-messages.js");
const context = read("app/core/context-retrieval.js");
const imports = read("app/features/export-import.js");
const importRoute = read("src/server/routes/import-text.js");
const quickDraft = read("app/features/finder-draft.js");
const meme = read("app/features/bureaucracy-meme.js");
const endfield = read("app/features/endfield-terminal.js");
const reader = read("app/features/reader.js");
const vision = read("app/features/teachtext-accessories.js");

function makeClient(fetchImpl, options = {}) {
  const values = {
    endpoint: options.endpoint || "http://127.0.0.1:1234",
    "local-api-token": options.token || "",
  };
  const contextObject = {
    window: {
      location: {
        protocol: options.protocol || "https:",
        hostname: options.hostname || "system6.aaronlau.me",
      },
    },
    document: {
      getElementById(id) {
        return { value: values[id] || "" };
      },
    },
    navigator: {
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

const require = createRequire(import.meta.url);
const sharedRuntime = require("../../app/shared/model-task-runtime.js");
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
  ok(requests[0].options.targetAddressSpace === "loopback", "declares the loopback target address space for Safari/WebKit");
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
    if (url.endsWith("/v1/chat/completions")) {
      chatAttempts += 1;
      if (chatAttempts === 1) return Response.json({ error: { message: "model not loaded" } }, { status: 400 });
      return Response.json({ choices: [{ message: { content: "ready" } }] });
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
  ok((await response.json()).choices[0].message.content === "ready", "returns OpenAI-compatible chat JSON");
  ok(chatAttempts === 2, "performs exactly one load-and-retry when a chat model is not loaded");
  ok(requests.filter((request) => request.url.endsWith("/api/v1/models/load")).length === 1, "does not loop model loading");
  const chatBody = JSON.parse(requests.find((request) => request.url.endsWith("/v1/chat/completions")).options.body);
  ok(!("ai_system6_task_kind" in chatBody), "does not leak client-only tuning fields to LM Studio");
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
  const encoder = new TextEncoder();
  const client = makeClient(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n"));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  const response = await client.chat({ model: "stream-model", messages: [], stream: true });
  ok((await response.text()).includes("[DONE]"), "passes LM Studio SSE streams to the shared browser stream reader");
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

ok(!source.includes("/api/v0/"), "never probes the legacy v0 API");
ok(!source.includes('"/api/chat"') && !source.includes('"/api/models"'), "client contains no VPS local-model proxy fallback");
ok(manifest.includes('"app/shared/model-task-runtime.js"') && manifest.includes('"app/core/local-lmstudio-client.js"'), "loads shared contracts before the browser adapter");
ok(html.includes('id="local-api-token" type="password"') && html.includes('id="connect-local-model"'), "control panel exposes token and explicit user connection");
ok(chat.includes("AISystem6LocalLMStudio.chat") && !chat.includes('fetch("/api/model-budget"'), "chat and context budgeting stay in the browser");
ok(chat.includes("streamFallback: true") && chat.includes("stream: false"), "abnormal streams retry once as non-streaming JSON");
ok(context.includes("AISystem6LocalLMStudio.embed"), "RAG embeddings can execute directly in the browser");
ok(imports.includes('model_execution: "client"') && importRoute.includes('body.model_execution === "client"'), "import requests prevent server-side model execution");
ok(quickDraft.includes("sendLocalModelTask"), "Quick Draft has a direct local-model path");
ok(meme.includes("sendLocalModelTask"), "Bureaucracy Meme has a direct local-model path");
ok(endfield.includes('fetch("/api/endfield/search"') && endfield.includes("sendLocalModelTask"), "Endfield separates deterministic VPS search from browser inference");
ok(reader.includes("translateReaderSubtitleLocally"), "subtitle translation has a browser-local path");
ok(vision.includes("sendLocalModelTask"), "vision analysis has a browser-local path");
ok(importRoute.includes('require("../../../app/shared/model-task-runtime.js")'), "Node import repair uses the same pure prompt and cleanup module");
ok(!imports.includes("localApiToken") && !importRoute.includes("localApiToken"), "LM Studio token is absent from import payloads and server processing");

if (failures.length) {
  console.error(`\nlocal-lmstudio-browser feature test failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log("\nlocal-lmstudio-browser feature test passed.");
