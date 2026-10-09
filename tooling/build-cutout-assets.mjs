// Stages the Cover Glass cut-out model (Xenova/modnet, Apache-2.0) beside the
// app, so Remove Background runs inside the app origin: the page's content
// security policy lets requests reach this origin only, so the model cannot be
// fetched from huggingface.co at run time. Output is git-ignored and served
// under /app/vendor/cutout-model/, like the embedding model
// (tooling/build-embed-assets.mjs, which also stages the ONNX runtime wasm the
// cut-out shares).
//
// The release owner runs this once, on purpose: it downloads about 7 MB. A
// desk without it still works; Cover Glass then asks the writer to choose the
// model files they downloaded (see app/features/liquid-cover-cutout.js).
//
// Idempotent: existing files are kept unless --force is passed.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { desktopRoot } from "./lib/paths.mjs";

const MODEL_ID = "Xenova/modnet";
const MODEL_FILES = ["config.json", "preprocessor_config.json", "onnx/model_quantized.onnx"];
const modelDir = join(desktopRoot, "app", "vendor", "cutout-model", MODEL_ID);
const force = process.argv.includes("--force");

await mkdir(join(modelDir, "onnx"), { recursive: true });
for (const file of MODEL_FILES) {
  const target = join(modelDir, file);
  if (existsSync(target) && !force) {
    console.log(`  keep ${file}`);
    continue;
  }
  const response = await fetch(`https://huggingface.co/${MODEL_ID}/resolve/main/${file}`);
  if (!response.ok) throw new Error(`fetch ${file} -> HTTP ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  console.log(`  ${file}: ${(await stat(target)).size} bytes`);
}
console.log(`[cutout-assets] done: ${modelDir}`);
