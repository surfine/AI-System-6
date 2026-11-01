// Drive the actual local/cloud handlers over loopback HTTP. Provider dispatch,
// credential lookup and DNS resolution are controlled; no external requests.
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtimePath = require.resolve("../../apps/desktop/app/shared/model-task-runtime.js");
const chatPath = require.resolve("../../apps/server/server/chat.js");
const localRoutePath = require.resolve("../../apps/server/server/routes/chat.js");
const cloudRoutePath = require.resolve("../../apps/server/server/routes/cloud-chat.js");
const runtime = require(runtimePath);
const lmstudio = require("../../apps/server/server/lmstudio.js");
const cloud = require("../../apps/server/server/cloud.js");
const fetchHelpers = require("../../apps/server/server/lib/fetch.js");
const credentialVault = require("../../apps/server/server/credential-vault.js");
const profile = require("../../apps/server/server/runtime-profile.js");
const originalLoadedModel = lmstudio.getLoadedLmStudioModelInfo();
const sent = [];
const budgets = [];
let answer = '{"quote":"此外，作者的原话必须保留。","changes":[]}';
let trustedCloudTarget = true;
const savedCache = new Map();

function mockExports(modulePath, exports) {
  if (!savedCache.has(modulePath)) savedCache.set(modulePath, require.cache[modulePath]);
  require.cache[modulePath] = { ...(require.cache[modulePath] || {}), exports };
}
function completion(payload) {
  sent.push(JSON.parse(JSON.stringify(payload)));
  return Promise.resolve({ response: new Response(JSON.stringify({
    model: payload.model,
    choices: [{ message: { role: "assistant", content: answer }, finish_reason: "stop" }],
    usage: { total_tokens: 5 },
  }), { status: 200, headers: { "Content-Type": "application/json" } }), autoLoaded: false });
}
// Observe the real pure validator; its return value/errors are unchanged.
mockExports(runtimePath, {
  ...runtime,
  assertFinalChatPayloadBudget(payload, options) {
    try {
      const budget = runtime.assertFinalChatPayloadBudget(payload, options);
      budgets.push(budget);
      return budget;
    } catch (error) {
      if (error.budget) budgets.push(error.budget);
      throw error;
    }
  },
});
mockExports(chatPath, undefined);
delete require.cache[chatPath];
require(chatPath);
mockExports(require.resolve("../../apps/server/server/lmstudio.js"), {
  ...lmstudio,
  postLocalChatWithModelAutoload: ({ payload }) => completion(payload),
});
mockExports(require.resolve("../../apps/server/server/lib/fetch.js"), {
  ...fetchHelpers,
  postJsonWithFallback: (_url, payload) => completion(payload),
  proxyJsonStream: () => { throw new Error("This contract only uses buffered responses"); },
});
mockExports(require.resolve("../../apps/server/server/cloud.js"), {
  ...cloud,
  resolveCloudTarget: () => Promise.resolve({ baseUrl: "https://controlled-provider.invalid", address: "127.0.0.1", family: 4 }),
  isTrustedDeepSeekCredentialTarget: () => trustedCloudTarget,
});
mockExports(require.resolve("../../apps/server/server/credential-vault.js"), {
  ...credentialVault,
  resolveCloudCredential: () => Promise.resolve("controlled-key-never-transmitted"),
});
mockExports(require.resolve("../../apps/server/server/runtime-profile.js"), { ...profile, isPublicDeployment: false });
for (const routePath of [localRoutePath, cloudRoutePath]) {
  if (!savedCache.has(routePath)) savedCache.set(routePath, require.cache[routePath]);
  delete require.cache[routePath];
}
const { handleChat } = require(localRoutePath);
const { handleCloudChat } = require(cloudRoutePath);
const handlers = { "/local": handleChat, "/cloud": handleCloudChat };
const server = http.createServer((req, res) => {
  const handler = handlers[req.url];
  if (!handler) { res.writeHead(404); res.end(); return; }
  handler(req, res).catch((error) => { res.writeHead(500); res.end(JSON.stringify({ error: error.message })); });
});
const failures = [];
async function verify(label, action) {
  sent.length = 0;
  budgets.length = 0;
  try {
    await action();
    console.log(`OK  writing-transport-budget: ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`NO  writing-transport-budget: ${label}: ${error.message}`);
  }
}
function request(route, payload) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const body = JSON.stringify(payload);
    const req = http.request({ host: "127.0.0.1", port: address.port, path: route, method: "POST", headers: {
      "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
    } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}
const messages = [{ role: "user", content: "AUTHOR: rough wording 42. TARGET: keep the final paragraph 尾部目标。" }];
const jsonSchema = { type: "json_schema", json_schema: { name: "source_facts", schema: { type: "object", properties: { quote: { type: "string" } } } } };
const cloudModel = cloud.DEEPSEEK_CLOUD_MODELS.find((model) => model.context_length > 0);
assert.ok(cloudModel, "the test uses an actual published registry export");
const base = (route) => ({ model: route === "/cloud" ? cloudModel.id : "controlled-local-model", ai_system6_task_kind: "source.extract-facts", messages, response_format: jsonSchema, max_tokens: 100, stream: false });
function assertRejected(result, limit) {
  assert.equal(result.status, 413);
  assert.equal(result.body.code, "context-budget-exceeded");
  assert.equal(result.body.budget.contextLimit, limit);
  assert.equal(result.body.budget.status, "exceeded");
  assert.ok(result.body.budget.totalTokens > limit);
  assert.equal(result.body.budget.estimator, "conservative-utf8-bytes-v1");
  assert.equal(sent.length, 0, "a rejected request must never reach provider dispatch");
}

try {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  for (const route of ["/local", "/cloud"]) {
    await verify(`${route} rejects unknown task as a client error before dispatch`, async () => {
      const result = await request(route, { ...base(route), ai_system6_task_kind: "writing.unregistered-edit" });
      assert.equal(result.status, 400);
      assert.equal(result.body.code, "task-unavailable");
      assert.notEqual(result.body.code, "lmstudio_server_offline");
      assert.equal(sent.length, 0);
    });
    await verify(`${route} a small structured request fits the same real explicit budget`, async () => {
      const result = await request(route, { ...base(route), ai_system6_context_limit: 5000 });
      assert.equal(result.status, 200);
      assert.equal(sent.length, 1);
      assert.equal(budgets.at(-1).contextLimit, 5000);
      assert.equal(budgets.at(-1).status, "within-limit");
    });
    for (const field of ["tools", "response_format"]) {
      await verify(`${route} final ${field} cost rejects before dispatch with structured budget evidence`, async () => {
        const extra = field === "tools"
          ? { tools: [{ type: "function", function: { name: "read_record", description: "tool-schema ".repeat(750), parameters: { type: "object" } } }] }
          : { response_format: { type: "json_schema", json_schema: { name: "facts", schema: { type: "object", description: "output-schema ".repeat(750) } } } };
        const result = await request(route, { ...base(route), ...extra, ai_system6_context_limit: 5000 });
        assertRejected(result, 5000);
      });
    }
    await verify(`${route} keeps the smallest supplied run/context limit`, async () => {
      const result = await request(route, { ...base(route), ai_system6_context_limit: 30000, loaded_context_length: 5000, tools: [{ type: "function", function: { name: "read", description: "tool-schema ".repeat(750) } }] });
      assertRejected(result, 5000);
    });
    for (const task of ["source.extract-facts", "writing.humanize-selection"]) {
      await verify(`${route} ${task} preserves structured output and never runs prose repair`, async () => {
        const result = await request(route, { ...base(route), ai_system6_task_kind: task, ai_system6_context_limit: 100000, ai_system6_reserved_output_tokens: 100 });
        assert.equal(result.status, 200);
        assert.equal(sent.length, 1, "the hit inside a JSON quote must not trigger a second humanizer call");
        assert.deepEqual(sent[0].response_format, jsonSchema);
        assert.deepEqual(sent[0].messages.at(-1), messages[0], "author and target must survive unchanged");
        const systemText = sent[0].messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
        assert.ok(!systemText.includes("Humanizer guardrail"));
        assert.ok(!systemText.includes("Return Markdown only"));
        assert.equal(result.body.choices[0].message.content, answer);
        assert.ok(!result.body.ai_system6_humanizer);
        assert.ok(!("ai_system6_context_limit" in sent[0]));
        assert.ok(!("ai_system6_reserved_output_tokens" in sent[0]));
      });
    }
  }
  await verify("local final Gemma adapter/system instructions count before dispatch", async () => {
    const payload = { model: "gemma-4-e4b-it", ai_system6_task_kind: "chat", messages: [{ role: "user", content: "short request" }], max_tokens: 50, ai_system6_context_limit: 700 };
    assert.ok(runtime.estimateFinalChatPayloadBudget(payload).totalTokens < 700);
    assertRejected(await request("/local", payload), 700);
  });
  await verify("local uses the actual matching loaded-model context export", async () => {
    lmstudio.setLoadedLmStudioModelInfo({ model: "controlled-local-model", context_length: 5000, max_context_length: 500000 });
    const result = await request("/local", { ...base("/local"), tools: [{ type: "function", function: { name: "read", description: "tool-schema ".repeat(750) } }] });
    assertRejected(result, 5000);
  });
  await verify("local does not apply a different model's cached context", async () => {
    lmstudio.setLoadedLmStudioModelInfo({ model: "other-model", context_length: 500 });
    const result = await request("/local", base("/local"));
    assert.equal(result.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(budgets.at(-1).contextLimit, null);
    assert.equal(budgets.at(-1).status, "unknown");
  });
  await verify("another local provider does not inherit the LM Studio cached context", async () => {
    lmstudio.setLoadedLmStudioModelInfo({ model: "controlled-local-model", context_length: 500 });
    const result = await request("/local", { ...base("/local"), _local_provider: "ollama" });
    assert.equal(result.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(budgets.at(-1).contextLimit, null);
  });
  lmstudio.setLoadedLmStudioModelInfo(null);
  await verify("cloud uses the real trusted provider model registry without an explicit limit", async () => {
    const result = await request("/cloud", { ...base("/cloud"), tools: [{ type: "function", function: { name: "read", description: "x".repeat(cloudModel.context_length + 1) } }] });
    assertRejected(result, cloudModel.context_length);
  });
  await verify("custom cloud endpoint/model has unknown context instead of a guessed provider window", async () => {
    trustedCloudTarget = false;
    const result = await request("/cloud", { ...base("/cloud"), model: "vendor-custom-model" });
    assert.equal(result.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(budgets.at(-1).contextLimit, null);
    assert.equal(budgets.at(-1).status, "unknown");
    const namedResult = await request("/cloud", base("/cloud"));
    assert.equal(namedResult.status, 200);
    assert.equal(budgets.at(-1).contextLimit, null, "a DeepSeek-looking model id on a custom endpoint is not provider context evidence");
    assert.equal(budgets.at(-1).status, "unknown");
    trustedCloudTarget = true;
  });
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE4sAAAAASUVORK5CYII=";
  for (const route of ["/local", "/cloud"]) {
    await verify(`${route} image costs stay unknown rather than certified as within-limit`, async () => {
      const result = await request(route, { ...base(route), ai_system6_context_limit: 100000, messages: [{ role: "user", content: [{ type: "text", text: "Inspect this image" }, { type: "image_url", image_url: { url: image } }] }] });
      assert.equal(result.status, 200);
      assert.equal(sent.length, 1);
      assert.equal(budgets.at(-1).status, "unknown");
      assert.equal(budgets.at(-1).unknownModalities, 1);
      assert.ok(budgets.at(-1).totalTokens < 100000);
    });
  }
} finally {
  lmstudio.setLoadedLmStudioModelInfo(originalLoadedModel);
  await new Promise((resolve) => server.close(resolve));
  for (const [modulePath, previous] of savedCache) {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  }
}
if (failures.length) {
  console.error(`\nwriting-transport-budget failed: ${failures.length} issue(s).`);
  process.exitCode = 1;
} else console.log("PASS writing-transport-budget");
