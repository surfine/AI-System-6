// Stages the same-origin embedding assets (multilingual-e5-small ONNX tree +
// the onnxruntime-web wasm files transformers.js fetches). Output is
// gitignored and served under /app/vendor/embed{,-model}/, so the embed
// module can run fully inside the app origin (strict public CSP needs no
// third-party CDN). Desktop dev without these files automatically falls back
// to the remote Hugging Face model.
//
// Idempotent: existing files are kept unless --force is passed.

import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";

const MODEL_ID = "Xenova/multilingual-e5-small";
const MODEL_VERSION = "4.2.0"; // transformers.js version that pins the layout
const MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "sentencepiece.bpe.model",
  "onnx/model_quantized.onnx",
];
const WASM_FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
];

const modelDir = join(desktopRoot, "app", "vendor", "embed-model", MODEL_ID);
const wasmDir = join(desktopRoot, "app", "vendor", "embed");
const onnxRuntimeDist = join(
  repositoryRoot,
  "node_modules",
  "onnxruntime-web",
  "dist"
);

const force = process.argv.includes("--force");

async function fetchFile(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url} -> HTTP ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  console.log(`  ${target.split("/").pop()}: ${(await stat(target)).size} bytes`);
}

async function copyWasm() {
  console.log(`[embed-assets] staging ORT wasm into ${wasmDir}`);
  await mkdir(wasmDir, { recursive: true });
  for (const file of WASM_FILES) {
    const target = join(wasmDir, file);
    if (existsSync(target) && !force) {
      console.log(`  keep ${file}`);
      continue;
    }
    const source = join(onnxRuntimeDist, file);
    if (existsSync(source)) {
      await copyFile(source, target);
      console.log(`  ${file}: ${(await stat(target)).size} bytes (node_modules)`);
    } else {
      await fetchFile(
        `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/${file}`,
        target
      );
    }
  }
}

async function stageModel() {
  console.log(`[embed-assets] staging ${MODEL_ID} into ${modelDir}`);
  await mkdir(join(modelDir, "onnx"), { recursive: true });
  const base = `https://huggingface.co/${MODEL_ID}/resolve/main`;
  for (const file of MODEL_FILES) {
    const target = join(modelDir, file);
    if (existsSync(target) && !force) {
      console.log(`  keep ${file}`);
      continue;
    }
    await fetchFile(`${base}/${file}`, target);
  }
}

await copyWasm();
await stageModel();
console.log(
  `[embed-assets] done (transformers.js v${MODEL_VERSION}; re-run with --force to refresh)`
);
