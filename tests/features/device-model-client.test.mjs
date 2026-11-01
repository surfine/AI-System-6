// The page side of the on-device model: status reasons map to door copy that
// exists in both languages, a streamed answer arrives as running text, and a
// guardrail violation carries the way out instead of retrying.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("device-model-client");
const source = read("app/core/device-model-client.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

function load(requestService) {
  const window = { AISystem6Capabilities: { requestService } };
  const context = vm.createContext({ window, document: { documentElement: { lang: "en" } }, TextDecoder, JSON });
  vm.runInContext(source, context);
  return window.AISystem6DeviceModel;
}
const sse = (...events) => new Response(events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join(""));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

for (const reason of ["helperMissing", "deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady", "osTooOld", "frameworkMissingAtBuild", "other"]) {
  const client = load(async () => json({ available: false, reason }));
  const result = await client.status();
  const key = client.copyKeyForStatus(result);
  test.assert(result.available === false && result.reason === reason, `status keeps ${reason}`);
  test.assert(en.includes(`${key}:`) && zh.includes(`${key}:`), `${reason} has door copy in both languages (${key})`);
}
{
  const client = load(() => { throw new Error("service unavailable"); });
  test.assert((await client.status()).reason === "helperMissing", "a target without the service reads as a missing helper");
}

{
  const seen = [];
  const client = load(async (name, input) => {
    seen.push([name, JSON.parse(input.init.body)]);
    return sse(
      { choices: [{ delta: { content: "Where" }, finish_reason: null }] },
      { choices: [{ delta: { content: " now?" }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
      "[DONE]"
    );
  });
  const running = [];
  const text = await client.chat({ task: "three-questions", messages: [{ role: "user", content: "hi" }], onDelta: (value) => running.push(value) });
  test.assert(text === "Where now?" && running.join("|") === "Where|Where now?", "the answer arrives as running text");
  test.assert(seen[0][0] === "device.chat" && seen[0][1].ai_system6_task_kind === "three-questions", "the task kind goes through the device.chat service");
}

{
  // A downloaded built-in model is the door's engine even when Apple's model is not ready.
  const seen = [];
  const client = load(async (name, input) => {
    if (name === "device.status") return json({ available: false, reason: "modelNotReady", builtIn: { available: true, defaultModel: "qwen3.5-4b-4bit", contextSize: 4096 } });
    seen.push(JSON.parse(input.init.body));
    return sse({ choices: [{ delta: { content: "Why?" } }] }, "[DONE]");
  });
  const result = await client.status();
  test.assert(result.available === true && result.engine === "mlx" && result.contextSize === 4096, "a downloaded built-in model makes the door available on its own window");
  await client.chat({ task: "title", messages: [{ role: "user", content: "hi" }] });
  test.assert(seen[0].engine === "mlx" && client.engine() === "mlx", "the door's request goes to the built-in engine");
  await client.chat({ task: "title", messages: [{ role: "user", content: "hi" }], engine: "apple" });
  test.assert(!("engine" in seen[1]), "a caller can still ask for Apple's model");
}

{
  // The built-in model as the Mac's local route: what it can read goes to the device route.
  const seen = [];
  const window = { AISystem6Capabilities: { requestService: async (name, input) => { seen.push([name, JSON.parse(input.init.body)]); return json({}); } } };
  const context = vm.createContext({ window, document: { documentElement: { lang: "zh-Hans" } }, TextDecoder, JSON });
  vm.runInContext(source, context);
  const local = window.AISystem6DeviceModel.activateBuiltInLocal({ model: "qwen3.5-4b-4bit", contextSize: 16384 });
  test.assert(local.active && local.label === "Qwen3.5 4B" && window.AISystem6BuiltInLocal === local, "activating publishes the built-in local route");
  test.assert(local.canServe({ messages: [{ role: "user", content: "hi" }] }), "plain text is the built-in model's");
  test.assert(!local.canServe({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:" } }] }] }), "an image stays with LM Studio");
  test.assert(!local.canServe({ messages: [], tools: [{}] }) && !local.canServe({ messages: [], response_format: { type: "json_schema" } }), "tools and a JSON schema stay with LM Studio");
  await local.chat({ messages: [{ role: "user", content: "hi" }], stream: true, ai_system6_task_kind: "chat" });
  test.assert(seen[0][0] === "device.chat" && seen[0][1].engine === "mlx" && seen[0][1].model === "qwen3.5-4b-4bit" && seen[0][1].stream === true,
    "a general chat goes to the device route on the built-in engine");
  window.AISystem6DeviceModel.deactivateBuiltInLocal();
  test.assert(window.AISystem6BuiltInLocal === null, "deactivating hands the route back");
}

{
  const client = load(async () => sse(
    { choices: [{ delta: { content: "The cat sat" } }] },
    { choices: [{ delta: {} }], ai_system6_replace: "The dog sat on" },
    { choices: [{ delta: { content: " a mat" } }] },
    "[DONE]"
  ));
  const running = [];
  const text = await client.chat({ task: "side-question", messages: [], onDelta: (value) => running.push(value) });
  test.assert(text === "The dog sat on a mat" && running.join("|") === "The cat sat|The dog sat on|The dog sat on a mat", "a replace event swaps the running text instead of appending");
}

{
  const client = load(async () => json({ code: "device_guardrail_violation", error: "declined", way_out: ["website", "byok", "skip"] }, 422));
  const error = await client.chat({ task: "three-questions", messages: [] }).catch((caught) => caught);
  test.assert(error.code === "device_guardrail_violation" && error.wayOut.includes("skip") && error.copyKey === "device_model_error_guardrail", "a guardrail violation carries copy and the way out");
  test.assert(en.includes("device_model_error_guardrail:") && zh.includes("device_model_error_guardrail:"), "the guardrail copy exists in both languages");
}
{
  const client = load(async () => sse({ choices: [{ delta: { content: "Wh" } }] }, { error: { code: "device_guardrail_violation", error: "declined" } }));
  const error = await client.chat({ task: "title", messages: [] }).catch((caught) => caught);
  test.assert(error.code === "device_guardrail_violation", "an error event mid-stream rejects the call");
}
{
  const client = load(async () => sse({ choices: [{ delta: { content: "Wh" } }] }));
  const error = await client.chat({ task: "title", messages: [] }).catch((caught) => caught);
  test.assert(error.code === "device_failed", "a stream that ends without [DONE] is not an answer");
}

test.finish();
