// Cover Glass cut-out: take the background away from a picture, locally.
//
// A background-removal model runs in the browser through the vendored
// transformers.js (the same copy, and the same ONNX runtime wasm, the in-browser
// embedding model uses: app/core/embed-in-browser.js). No picture leaves this
// machine and nothing is generated: the model only says, pixel by pixel, how
// much of the picture is the subject. That answer is a greyscale mask, and the
// caller keeps it apart from the picture (a smart object: source + mask +
// transform), so the mask can be refined later without losing a pixel.
//
// Where the model comes from. The page's content security policy lets scripts
// and requests reach this origin only, so the usual download from
// huggingface.co is refused, and loosening that for a third party is the
// owner's decision, not this module's. Two same-origin routes exist:
//
//   1. a model tree staged beside the app, by tooling/build-cutout-assets.mjs,
//      under app/vendor/cutout-model/ (git-ignored, like the embedding model);
//   2. model files the writer downloaded and chose in the window (the hidden
//      file input behind the Choose button). They are kept in the browser's
//      Cache Storage, so the choice is made once.
//
// With neither, status() says so and the window tells the writer plainly. This
// module never fails silently and never reaches for the network.
//
// Model: Xenova/modnet (MODNet portrait matting, Apache-2.0), transformers.js's
// own default for the background-removal task.

window.AISystem6CoverCutoutLoaded = true;

window.AISystem6CoverCutout = (() => {
  "use strict";

  const MODEL_ID = "Xenova/modnet";
  const VENDOR_URL = "/app/vendor/embed/transformers.min.js";
  const WASM_ROOT = "/app/vendor/embed/";
  const STAGED_ROOT = "/app/vendor/cutout-model/";
  const IMPORT_ROOT = "/__cover-cutout-model/";
  const CACHE_NAME = "ai-system-6-cover-cutout-model";
  const MODEL_PAGE = "https://huggingface.co/Xenova/modnet/tree/main";
  // What a model tree must hold, relative to the model folder.
  const REQUIRED = ["config.json", "preprocessor_config.json"];
  const DTYPE_BY_FILE = {
    "model_quantized.onnx": "q8",
    "model_int8.onnx": "int8",
    "model_uint8.onnx": "uint8",
    "model_fp16.onnx": "fp16",
    "model.onnx": "fp32",
  };
  const DTYPE_ORDER = ["model_quantized.onnx", "model_int8.onnx", "model_uint8.onnx", "model_fp16.onnx", "model.onnx"];
  const MAX_EDGE = 1536;

  let pipelinePromise = null;
  const memory = new Map(); // relative path -> Blob, when Cache Storage is unavailable

  const importedUrl = (relative) => new URL(IMPORT_ROOT + relative, location.origin).href;

  async function openCache() {
    return typeof caches !== "undefined" ? caches.open(CACHE_NAME) : null;
  }

  /** Which relative paths the writer has already imported. */
  async function importedPaths() {
    const found = new Set(memory.keys());
    try {
      const cache = await openCache();
      if (cache) for (const request of await cache.keys()) found.add(new URL(request.url).pathname.slice(IMPORT_ROOT.length));
    } catch { /* an unavailable cache is the same as an empty one */ }
    return found;
  }

  function chooseDtype(paths) {
    const onnx = DTYPE_ORDER.find((name) => paths.has(`onnx/${name}`));
    return onnx ? { file: `onnx/${onnx}`, dtype: DTYPE_BY_FILE[onnx] } : null;
  }

  async function stagedAvailable() {
    try {
      const response = await fetch(`${STAGED_ROOT}${MODEL_ID}/config.json`, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Whether a cut-out can run, and from where.
   * @returns {Promise<{ ready: boolean, source: "staged"|"imported"|"none", dtype?: string, missing?: string[] }>}
   */
  async function status() {
    if (await stagedAvailable()) return { ready: true, source: "staged", dtype: "q8" };
    const paths = await importedPaths();
    const missing = REQUIRED.filter((name) => !paths.has(name));
    const weights = chooseDtype(paths);
    if (!weights) missing.push("onnx/model_quantized.onnx");
    if (!missing.length) return { ready: true, source: "imported", dtype: weights.dtype };
    return { ready: false, source: "none", missing };
  }

  /**
   * Keep the model files the writer chose. All or nothing: a half-imported
   * model is reported, not stored, so the next try starts clean.
   * @param {ArrayLike<File>} files
   */
  async function importFiles(files) {
    const picked = new Map();
    for (const file of Array.from(files || [])) {
      const name = String(file.name || "");
      if (name === "config.json" || name === "preprocessor_config.json") picked.set(name, file);
      else if (/\.onnx$/i.test(name)) picked.set(`onnx/${name}`, file);
    }
    const missing = REQUIRED.filter((name) => !picked.has(name));
    if (!chooseDtype(new Set(picked.keys()))) missing.push("onnx/model_quantized.onnx");
    if (missing.length) return { ok: false, stored: [], missing };
    const cache = await openCache().catch(() => null);
    for (const [relative, file] of picked) {
      if (cache) {
        await cache.put(importedUrl(relative), new Response(file, { headers: { "content-type": relative.endsWith(".onnx") ? "application/octet-stream" : "application/json", "content-length": String(file.size) } }));
      } else {
        memory.set(relative, file);
      }
    }
    pipelinePromise = null; // a new model replaces the one in memory
    return { ok: true, stored: [...picked.keys()], missing: [] };
  }

  async function forget() {
    memory.clear();
    pipelinePromise = null;
    try { if (typeof caches !== "undefined") await caches.delete(CACHE_NAME); } catch { /* nothing to forget */ }
  }

  // transformers.js asks its cache before the network. This one answers from
  // the imported files and never stores anything itself.
  function importedCache() {
    const find = async (request) => {
      const url = typeof request === "string" ? request : request.url;
      const cache = await openCache().catch(() => null);
      for (const relative of ["config.json", "preprocessor_config.json", ...DTYPE_ORDER.map((name) => `onnx/${name}`)]) {
        if (!url.endsWith(`/${relative}`)) continue;
        if (memory.has(relative)) return new Response(memory.get(relative));
        const hit = cache ? await cache.match(importedUrl(relative)) : null;
        if (hit) return hit;
      }
      return undefined;
    };
    return { match: find, put: async () => {} };
  }

  async function getPipeline() {
    if (pipelinePromise) return pipelinePromise;
    pipelinePromise = (async () => {
      const current = await status();
      if (!current.ready) throw Object.assign(new Error("cutout_model_missing"), { missing: current.missing });
      const mod = await import(VENDOR_URL);
      if (!mod || typeof mod.pipeline !== "function") throw new Error("cutout_bad_vendor");
      const env = mod.env;
      if (env.wasm) env.wasm.wasmPaths = WASM_ROOT;
      else if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = WASM_ROOT;
      // Never the network: the policy refuses it, and this feature is local.
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      const previous = { custom: env.useCustomCache, cache: env.customCache, path: env.localModelPath };
      try {
        if (current.source === "staged") {
          env.localModelPath = STAGED_ROOT;
        } else {
          env.useCustomCache = true;
          env.customCache = importedCache();
          env.localModelPath = IMPORT_ROOT;
        }
        return await mod.pipeline("background-removal", MODEL_ID, { dtype: current.dtype });
      } finally {
        // The embedding model shares this module's settings; give them back.
        env.useCustomCache = previous.custom;
        env.customCache = previous.cache;
        env.localModelPath = previous.path;
      }
    })();
    pipelinePromise.catch(() => { pipelinePromise = null; });
    return pipelinePromise;
  }

  /**
   * The subject mask of a picture: a greyscale canvas, white where the subject
   * is. The picture is not changed and not stored here.
   * @param {CanvasImageSource & { naturalWidth?: number, width?: number }} image
   * @param {{ onStage?: (stage: "model"|"run") => void }} [options]
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function cutout(image, options = {}) {
    options.onStage?.("model");
    const pipe = await getPipeline();
    const mod = await import(VENDOR_URL);
    const sw = image.naturalWidth || image.videoWidth || image.width;
    const sh = image.naturalHeight || image.videoHeight || image.height;
    if (!sw || !sh) throw new Error("cutout_empty_picture");
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const source = document.createElement("canvas");
    source.width = w; source.height = h;
    const context = source.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, w, h);
    const rgba = context.getImageData(0, 0, w, h);
    options.onStage?.("run");
    const result = await pipe(new mod.RawImage(rgba.data, w, h, 4));
    const out = Array.isArray(result) ? result[0] : result;
    if (!out || !out.data || out.width !== w || out.height !== h) throw new Error("cutout_bad_result");
    const channels = out.channels || Math.round(out.data.length / (w * h));
    if (channels < 4) throw new Error("cutout_no_alpha");
    const mask = document.createElement("canvas");
    mask.width = w; mask.height = h;
    const target = mask.getContext("2d");
    const pixels = target.createImageData(w, h);
    for (let i = 0, n = w * h; i < n; i++) {
      const alpha = out.data[i * channels + 3];
      pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = alpha;
      pixels.data[i * 4 + 3] = 255;
    }
    target.putImageData(pixels, 0, 0);
    return mask;
  }

  return { MODEL_ID, MODEL_PAGE, REQUIRED, status, importFiles, forget, cutout };
})();
