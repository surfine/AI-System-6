// A Qwen-family model loaded through the desk runs with thinking off in
// LM Studio. LM Studio's MLX engine ignores the request-level switch, so the
// desk pins it in the per-model template override LM Studio reads on load.
// These cases run against a scratch home directory, never the real one.
//
// The route that performs the pin is not read as text: this contract requires
// apps/server/server/routes/models-load.js and drives its exported handler,
// with only the two things that would leave the machine (the `lms` CLI listing
// and LM Studio's own HTTP calls) stubbed. The ratchet counts the route module
// as real execution for exactly that reason.

import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("lmstudio-thinking-override");
const overrideModule = require("../../apps/server/server/lib/lmstudio-thinking-override.js");
const { PIN_LINE, ensureLmStudioThinkingOff } = overrideModule;

const template = "{%- if add_generation_prompt %}{%- if enable_thinking is defined and enable_thinking is false %}<think>\n\n</think>{%- endif %}{%- endif %}";
const home = await mkdtemp(join(tmpdir(), "lmstudio-override-"));
try {
  const models = join(home, ".lmstudio", "models");
  const configRoot = join(home, ".lmstudio", ".internal", "user-concrete-model-default-config");
  const addModel = async (relative, files) => {
    await mkdir(join(models, relative), { recursive: true });
    for (const [name, body] of Object.entries(files)) await writeFile(join(models, relative, name), body);
  };
  await addModel("mlx-community/Qwen3.5-4B-MLX-4bit", { "chat_template.jinja": template });
  await addModel("prism-ml/Ternary-Bonsai-27B-mlx-2bit", { "tokenizer_config.json": JSON.stringify({ chat_template: template }) });
  await addModel("vendor/Plain-Model", { "chat_template.jinja": "{{ messages }}" });
  const listed = [
    { modelKey: "qwen3.5-4b-mlx", path: "mlx-community/Qwen3.5-4B-MLX-4bit", format: "safetensors" },
    { modelKey: "ternary-bonsai-27b-mlx", path: "prism-ml/Ternary-Bonsai-27B-mlx-2bit", format: "safetensors" },
    { modelKey: "gemma-4-e4b-it", path: "vendor/Plain-Model", format: "safetensors" },
    { modelKey: "qwen3.8-no-switch", path: "vendor/Plain-Model", format: "safetensors" },
    { modelKey: "qwen3.6-27b-gguf", path: "unsloth/Qwen3.6-27B-GGUF/q.gguf", format: "gguf" },
    { modelKey: "qwen3.5-escape", path: "../outside", format: "safetensors" },
  ];
  const run = (modelKey) => ensureLmStudioThinkingOff({ modelKey, models: listed, home });

  // An existing override keeps the fields the writer did not come for.
  const qwenConfig = join(configRoot, "mlx-community/Qwen3.5-4B-MLX-4bit.json");
  await mkdir(join(configRoot, "mlx-community"), { recursive: true });
  const before = { preset: "", operation: { fields: [] }, load: { fields: [{ key: "llm.load.contextLength", value: 262144 }] } };
  await writeFile(qwenConfig, JSON.stringify(before));

  const first = await run("qwen3.5-4b-mlx");
  test.assert(first.status === "written", "a Qwen 3.5 MLX model gets its override written");
  const written = JSON.parse(await readFile(qwenConfig, "utf8"));
  const prediction = written.operation.fields.find((field) => field.key === "llm.prediction.promptTemplate");
  const load = written.load.fields.find((field) => field.key === "llm.load.promptTemplate");
  test.assert(prediction?.value?.jinjaPromptTemplate?.template === `${PIN_LINE}\n${template}`, "the prediction template is the model's own template with thinking pinned off");
  test.assert(load?.value?.jinjaPromptTemplate?.template === `${PIN_LINE}\n${template}`, "the load template carries the same pin");
  test.assert(written.load.fields.some((field) => field.key === "llm.load.contextLength" && field.value === 262144), "the writer's existing context length survives");
  test.assert(JSON.parse(await readFile(`${qwenConfig}.ai-system6-backup`, "utf8")).load.fields.length === 1, "the file it first changed is kept as a backup");

  const second = await run("qwen3.5-4b-mlx");
  test.assert(second.status === "already", "a second load leaves a pinned override alone");

  const bonsai = await run("ternary-bonsai-27b-mlx");
  test.assert(bonsai.status === "written", "Bonsai, whose template lives in tokenizer_config.json, is pinned too");
  test.assert(await stat(join(configRoot, "prism-ml/Ternary-Bonsai-27B-mlx-2bit.json")).then(() => true, () => false), "and its override lands at its own model path");

  test.assert((await run("gemma-4-e4b-it")).reason === "not_qwen_family", "a model outside the Qwen family is not touched");
  test.assert((await run("qwen3.8-no-switch")).reason === "template_has_no_thinking_switch", "a template without the switch is not rewritten");
  test.assert((await run("qwen3.6-27b-gguf")).reason === "not_mlx", "a GGUF model, whose template lives inside the file, is left to LM Studio");
  test.assert((await run("qwen3.5-escape")).reason === "unsafe_path", "a listed path that climbs out of the models folder is refused");
  test.assert((await run("not-listed")).reason === "model_not_listed", "a model LM Studio did not list is skipped");

  await writeFile(qwenConfig, "{ not json");
  const unreadable = await run("qwen3.5-4b-mlx");
  test.assert(unreadable.reason === "existing_config_unreadable" && (await readFile(qwenConfig, "utf8")) === "{ not json", "an override it cannot parse is left exactly as it was");

  // --- The shipped load route really pins thinking off before it loads ------
  //
  // A fresh model, never touched above, so the route's own write is the only
  // thing that can have produced the override on disk. The `lms` listing and
  // LM Studio's HTTP calls are stubbed because they would leave the machine;
  // the route module, its body parsing, its response shape and the override
  // writer are all the real ones.
  await addModel("vendor/Qwen3.5-Route", { "chat_template.jinja": template });
  listed.push({ modelKey: "qwen3.5-route", path: "vendor/Qwen3.5-Route", format: "safetensors" });

  const lmsCli = require("../../apps/server/server/lib/lms-cli.js");
  const lmstudio = require("../../apps/server/server/lmstudio.js");
  const fetchLib = require("../../apps/server/server/lib/fetch.js");
  const order = [];
  const realRunLms = lmsCli.runLms;
  const realUnloadAll = lmstudio.unloadAllLoadedLmStudioModels;
  const realPostJson = fetchLib.postJsonWithFallback;
  const realEnsure = overrideModule.ensureLmStudioThinkingOff;
  lmsCli.runLms = async () => { order.push("list"); return { stdout: JSON.stringify(listed), stderr: "" }; };
  lmstudio.unloadAllLoadedLmStudioModels = async () => { order.push("unload"); return []; };
  fetchLib.postJsonWithFallback = async () => {
    order.push("load");
    return { response: { ok: true, status: 200, text: async () => JSON.stringify({ model: "qwen3.5-route", load_config: { context_length: 32768 } }) } };
  };
  overrideModule.ensureLmStudioThinkingOff = async (options) => { order.push("pin"); return realEnsure(options); };

  const realHome = process.env.HOME;
  process.env.HOME = home;
  let routePayload = null;
  try {
    const route = require("../../apps/server/server/routes/models-load.js");
    const body = Buffer.from(JSON.stringify({ model: "qwen3.5-route", max_context_length: 32768, max_context_source: "user" }));
    const req = {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(body.length) },
      on() {},
      async *[Symbol.asyncIterator]() { yield body; },
    };
    const res = {
      destroyed: false,
      writableEnded: false,
      statusCode: 0,
      body: "",
      on() {},
      writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
      end(chunk) { this.writableEnded = true; this.body = chunk || ""; },
    };
    await route.handleModelsLoad(req, res);
    routePayload = { status: res.statusCode, json: JSON.parse(res.body) };
  } finally {
    process.env.HOME = realHome;
    lmsCli.runLms = realRunLms;
    lmstudio.unloadAllLoadedLmStudioModels = realUnloadAll;
    fetchLib.postJsonWithFallback = realPostJson;
    overrideModule.ensureLmStudioThinkingOff = realEnsure;
  }

  const routeConfig = join(configRoot, "vendor/Qwen3.5-Route.json");
  const routeWritten = JSON.parse(await readFile(routeConfig, "utf8"));
  const routeTemplate = routeWritten.load.fields
    .find((field) => field.key === "llm.load.promptTemplate")?.value?.jinjaPromptTemplate?.template;
  test.assert(routePayload.status === 200, "the load route answers a Qwen-family load through the real handler");
  test.assert(order.indexOf("pin") !== -1 && order.indexOf("pin") < order.indexOf("load"),
    "the route calls the thinking-off writer before it asks LM Studio to load the model");
  test.assert(routeTemplate?.startsWith(PIN_LINE), "and the override the route wrote on disk is the pinned template");
  test.assert(routePayload.json.thinking_override?.status === "written",
    "the route reports the override it wrote without failing the load");
} finally {
  await rm(home, { recursive: true, force: true });
}

test.finish();
