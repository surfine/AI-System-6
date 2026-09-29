// Keep a Qwen-family model's thinking off inside LM Studio.
//
// LM Studio's MLX engine ignores `chat_template_kwargs.enable_thinking` and
// `reasoning_effort` sent with a request, so a Qwen 3.5+ model (and Bonsai,
// a low-bit Qwen build) thinks on every call and a 400-token answer spends
// its budget in the reasoning channel. LM Studio does honor a per-model
// prompt-template override stored under
// `~/.lmstudio/.internal/user-concrete-model-default-config/<model path>.json`
// and read when the model loads. This module writes that override: the
// model's own chat template with `enable_thinking` pinned to false, which is
// what the template itself checks before opening a <think> block.
//
// The file format is LM Studio's internal one, not a documented API, so the
// writer is conservative: it only touches MLX models whose own template
// reads `enable_thinking`, keeps every other field in an existing file,
// keeps a one-time backup of the file it first changes, and leaves a file
// it cannot parse alone.

"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const PIN_LINE = "{%- set enable_thinking = false %}";
const TEMPLATE_KEYS = ["llm.prediction.promptTemplate", "llm.load.promptTemplate"];

/** @param {unknown} value */
function isQwenFamilyName(value) {
  return /qwen[-_/ ]?3\.[5-9]|bonsai/i.test(String(value || ""));
}

/** @param {string} home */
async function lmStudioModelsDir(home) {
  try {
    const settings = JSON.parse(await fs.readFile(path.join(home, ".lmstudio", "settings.json"), "utf8"));
    if (typeof settings?.downloadsFolder === "string" && settings.downloadsFolder) return settings.downloadsFolder;
  } catch {
    // No settings file, or one we cannot read: LM Studio's default location.
  }
  return path.join(home, ".lmstudio", "models");
}

/** @param {string} modelDir */
async function readChatTemplate(modelDir) {
  try {
    return await fs.readFile(path.join(modelDir, "chat_template.jinja"), "utf8");
  } catch {
    // Older MLX conversions carry the template inside tokenizer_config.json.
  }
  try {
    const config = JSON.parse(await fs.readFile(path.join(modelDir, "tokenizer_config.json"), "utf8"));
    return typeof config?.chat_template === "string" ? config.chat_template : "";
  } catch {
    return "";
  }
}

/**
 * @param {any[]} fields
 * @param {string} key
 * @param {string} template
 */
function upsertTemplateField(fields, key, template) {
  const existing = fields.find((field) => field?.key === key);
  const value = {
    ...(existing?.value && typeof existing.value === "object" ? existing.value : {}),
    type: "jinja",
    jinjaPromptTemplate: { template },
  };
  if (existing) existing.value = value;
  else fields.push({ key, value });
}

/** @param {any} config */
function pinnedAlready(config) {
  const fields = [...(config?.operation?.fields || []), ...(config?.load?.fields || [])];
  return TEMPLATE_KEYS.every((key) => {
    const template = fields.find((field) => field?.key === key)?.value?.jinjaPromptTemplate?.template;
    return typeof template === "string" && template.startsWith(PIN_LINE);
  });
}

/**
 * Make sure LM Studio loads this model with thinking off.
 *
 * @param {{ modelKey: string, models: Array<{ modelKey?: string, path?: string, format?: string }>, home?: string }} options
 * @returns {Promise<{ status: "written" | "already" | "skipped", reason?: string, configPath?: string }>}
 */
async function ensureLmStudioThinkingOff({ modelKey, models, home = os.homedir() }) {
  const entry = (models || []).find((model) => model?.modelKey === modelKey);
  if (!entry || typeof entry.path !== "string" || !entry.path) return { status: "skipped", reason: "model_not_listed" };
  if (!isQwenFamilyName(modelKey) && !isQwenFamilyName(entry.path)) return { status: "skipped", reason: "not_qwen_family" };
  if (entry.format && !/safetensors|mlx/i.test(entry.format)) return { status: "skipped", reason: "not_mlx" };
  const relative = path.normalize(entry.path);
  if (path.isAbsolute(relative) || relative.split(path.sep).includes("..")) return { status: "skipped", reason: "unsafe_path" };

  const template = await readChatTemplate(path.join(await lmStudioModelsDir(home), relative));
  if (!/enable_thinking/.test(template)) return { status: "skipped", reason: "template_has_no_thinking_switch" };

  const configPath = path.join(home, ".lmstudio", ".internal", "user-concrete-model-default-config", `${relative}.json`);
  /** @type {any} */
  let config = { preset: "", operation: { fields: [] }, load: { fields: [] } };
  let original = null;
  try {
    original = await fs.readFile(configPath, "utf8");
  } catch {
    // No override yet: start from an empty one.
  }
  if (original !== null) {
    try {
      config = JSON.parse(original);
    } catch {
      return { status: "skipped", reason: "existing_config_unreadable", configPath };
    }
    if (pinnedAlready(config)) return { status: "already", configPath };
  }

  const pinned = template.startsWith(PIN_LINE) ? template : `${PIN_LINE}\n${template}`;
  config.operation = config.operation && typeof config.operation === "object" ? config.operation : {};
  config.load = config.load && typeof config.load === "object" ? config.load : {};
  config.operation.fields = Array.isArray(config.operation.fields) ? config.operation.fields : [];
  config.load.fields = Array.isArray(config.load.fields) ? config.load.fields : [];
  upsertTemplateField(config.operation.fields, TEMPLATE_KEYS[0], pinned);
  upsertTemplateField(config.load.fields, TEMPLATE_KEYS[1], pinned);

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  if (original !== null) {
    const backup = `${configPath}.ai-system6-backup`;
    await fs.writeFile(backup, original, { flag: "wx" }).catch((error) => {
      if (error?.code !== "EEXIST") throw error;
    });
  }
  const temp = `${configPath}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await fs.rename(temp, configPath);
  return { status: "written", configPath };
}

module.exports = {
  PIN_LINE,
  ensureLmStudioThinkingOff,
  isQwenFamilyName,
};
