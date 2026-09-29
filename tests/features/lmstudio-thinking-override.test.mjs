// A Qwen-family model loaded through the desk runs with thinking off in
// LM Studio. LM Studio's MLX engine ignores the request-level switch, so the
// desk pins it in the per-model template override LM Studio reads on load.
// These cases run against a scratch home directory, never the real one.

import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("lmstudio-thinking-override");
const { PIN_LINE, ensureLmStudioThinkingOff } = require("../../apps/server/server/lib/lmstudio-thinking-override.js");

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
} finally {
  await rm(home, { recursive: true, force: true });
}

const loadRoute = read("apps/server/server/routes/models-load.js");
test.assertIncludes(loadRoute, "ensureLmStudioThinkingOff", "the model load route pins thinking off before LM Studio loads the model");
test.assertIncludes(loadRoute, "thinking_override: thinkingOverride", "and reports what it did without failing the load");

test.finish();
