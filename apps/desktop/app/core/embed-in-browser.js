// Lazy in-browser embedding backend (option B).
//
// Loads transformers.js on demand and runs multilingual-e5-small locally so
// semantic retrieval works even when the configured chat provider (DeepSeek)
// has no embeddings endpoint and no local LM Studio is connected. It is the
// final rung of the embedTexts fallback chain and speaks the same wire shape
// as the cloud / LM Studio paths: embed(texts) -> number[][].
//
// Model + recipe (verified against the real ONNX model in this repo's history):
//   Xenova/multilingual-e5-small, 384 dims, mean pooling + L2 normalization,
//   "query: " / "passage: " prefixes per sentence-transformers conventions.
//
// Asset strategy (one code path for every surface):
//   - Same-origin assets win when present: `/app/vendor/embed-model/` holds
//     the e5 ONNX tree and `/app/vendor/embed/` holds the ORT wasm files.
//     tooling/build-embed-assets.mjs stages them (deploy-time; gitignored).
//   - Otherwise we fall back to the remote defaults (Hugging Face model +
//     jsdelivr wasm), which is the desktop-dev path with no CSP and needs no
//     staged files. The choice is probed once per session and cached.

"use strict";

window.AISystem6EmbedInBrowser = (() => {
  const MODEL_ID = "Xenova/multilingual-e5-small";
  const MODEL_DIMS = 384;
  const VENDOR_URL = "/app/vendor/embed/transformers.min.js";
  const DTYPE = "q8";

  let extractorPromise = null;

  const MODEL_ROOT = "/app/vendor/embed-model/";
  const WASM_ROOT = "/app/vendor/embed/";

  let assetProbe = null;

  async function sameOriginAssetsAvailable() {
    if (assetProbe === null) {
      assetProbe = fetch(`${MODEL_ROOT}${MODEL_ID}/config.json`, { method: "GET" })
        .then((response) => response.ok)
        .catch(() => false);
    }
    return assetProbe;
  }

  async function loadTransformerModule() {
    const mod = await import(VENDOR_URL);
    if (!mod || typeof mod.pipeline !== "function") {
      throw new Error("embed_in_browser_bad_vendor: transformers.js did not expose pipeline");
    }
    if (await sameOriginAssetsAvailable()) {
      // Same-origin staged assets: keep everything inside the app origin so the
      // strict public CSP (connect-src 'self') never needs a third party.
      const env = mod.env;
      if (env.wasm) env.wasm.wasmPaths = WASM_ROOT;
      else if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = WASM_ROOT;
      mod.env.allowLocalModels = true;
      mod.env.allowRemoteModels = false;
      mod.env.localModelPath = MODEL_ROOT;
    } else {
      // No staged assets (fresh desktop checkout): remote defaults, proven path.
      mod.env.allowLocalModels = false;
      mod.env.allowRemoteModels = true;
    }
    return mod;
  }

  function getExtractor() {
    if (!extractorPromise) {
      extractorPromise = loadTransformerModule().then((mod) =>
        mod.pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE })
      );
    }
    return extractorPromise;
  }

  function reset() {
    extractorPromise = null;
  }

  async function encode(text, isQuery) {
    const extractor = await getExtractor();
    const output = await extractor(
      `${isQuery ? "query: " : "passage: "}${text}`,
      { pooling: "mean", normalize: true }
    );
    return Array.from(output.data);
  }

  /**
   * Warm the model in the background (download + compile) without embedding.
   * Callers fire this and forget; the first real embed then reuses the warm
   * extractor, so the first search does not stall on the model download.
   */
  async function preload() {
    await getExtractor();
  }

  /**
   * Embed a batch of source texts (passage side).
   * @param {string[]} texts
   * @returns {Promise<number[][]>} one normalized 384-dim vector per input.
   */
  async function embed(texts = []) {
    const vectors = [];
    for (const text of texts) {
      vectors.push(await encode(String(text || ""), false));
    }
    return vectors;
  }

  /** Embed a single user query (query side). */
  async function embedQuery(text = "") {
    return encode(String(text || ""), true);
  }

  return {
    embed,
    embedQuery,
    preload,
    reset,
    model: MODEL_ID,
    dims: MODEL_DIMS,
  };
})();

window.AISystem6EmbedInBrowserLoaded = true;
