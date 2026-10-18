// Local vision on the built-in model: with nothing named, an image goes to the
// helper's built-in model first (as private temporary files that are gone
// afterwards); a provider or model the caller names is the explicit LM Studio
// choice and never reaches the helper; a built-in failure falls back to
// LM Studio; AI_SYSTEM6_VISION_BUILT_IN=0 turns the rung off.

import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("device-model-vision");

const tmp = mkdtempSync(join(tmpdir(), "ais6-device-vision-"));
const logFile = join(tmp, "helper.log");
const scenarioFile = join(tmp, "scenario.json");
process.env.AI_SYSTEM6_DEVICE_MODEL_HELPER = join(root, "tests/helpers/fake-device-model-helper.mjs");
process.env.FAKE_DEVICE_MODEL_LOG = logFile;
process.env.FAKE_DEVICE_MODEL_SCENARIO_FILE = scenarioFile;
// LM Studio is pointed at a closed port: any request that reaches it fails fast.
process.env.LM_STUDIO_URL = "http://127.0.0.1:9/v1/chat/completions";
process.env.LM_STUDIO_BASE_URL = "http://127.0.0.1:9";

const device = require("../../apps/server/server/device-model.js");
const vision = require("../../apps/server/server/vision.js");
const logLines = (prefix) => (existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter((line) => line.startsWith(prefix)) : []);
const png = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]).toString("base64")}`;

function setScenario(env = {}) {
  writeFileSync(scenarioFile, JSON.stringify(env));
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  device.resetDeviceModelStatusCache();
}

try {
  setScenario({ FAKE_DEVICE_MODEL_MLX: "qwen3.5-4b-4bit" });
  const read = await vision.postLocalVisionAnalysis({ dataUrl: png, mode: "describe" });
  test.assert(read.text === "Where did this start?" && read.model === "built-in:qwen3.5-4b-4bit", "with nothing named, the built-in model reads the image");
  const request = JSON.parse(logLines("REQUEST ")[0].slice(8));
  test.assert(request.engine === "mlx" && request.images.length === 1 && /You inspect images/.test(request.instructions),
    "the helper gets the vision prompt and one image file");
  test.assert(logLines("IMAGES ")[0] === "IMAGES 1 true", "the image file exists while the helper reads it");
  test.assert(!existsSync(request.images[0]), "the temporary image file is removed afterwards");

  rmSync(logFile, { force: true });
  let explicitError = null;
  try {
    await vision.postLocalVisionAnalysis({ dataUrl: png, mode: "describe", provider: "lm-studio", model: "qwen3.5-4b-mlx" });
  } catch (error) {
    explicitError = error;
  }
  test.assert(explicitError && !logLines("REQUEST ").length, "a named LM Studio provider and model are the writer's choice and skip the built-in model");

  rmSync(logFile, { force: true });
  setScenario({ FAKE_DEVICE_MODEL_MLX: "qwen3.5-4b-4bit", FAKE_DEVICE_MODEL_CHAT: "memoryGate" });
  let fellBack = null;
  try {
    await vision.postLocalVisionAnalysis({ dataUrl: png, mode: "ocr" });
  } catch (error) {
    fellBack = error;
  }
  test.assert(logLines("REQUEST ").length === 1 && fellBack && !/mlx memoryGate/.test(String(fellBack.message)),
    "a built-in failure falls through to LM Studio, whose own error is the one reported");

  rmSync(logFile, { force: true });
  setScenario({ FAKE_DEVICE_MODEL_MLX: "" });
  await vision.postLocalVisionAnalysis({ dataUrl: png }).catch(() => {});
  test.assert(!logLines("REQUEST ").length, "without a built-in vision model nothing is sent to the helper");

  setScenario({ FAKE_DEVICE_MODEL_MLX: "qwen3.5-4b-4bit" });
  process.env.AI_SYSTEM6_VISION_BUILT_IN = "0";
  await vision.postLocalVisionAnalysis({ dataUrl: png }).catch(() => {});
  test.assert(!logLines("REQUEST ").length, "AI_SYSTEM6_VISION_BUILT_IN=0 turns the built-in rung off");
  delete process.env.AI_SYSTEM6_VISION_BUILT_IN;
} finally {
  await device.shutdownDeviceModelHelpers();
  rmSync(tmp, { recursive: true, force: true });
}

test.finish();
