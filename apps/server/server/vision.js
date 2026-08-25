"use strict";

// Local vision uses the same model boundary as the rest of AI System 6:
// Gemma/Qwen are first-class local QA targets, while the OpenAI-compatible
// image-content payload keeps the route open to other LM Studio VLMs.

const { getLocalUrls } = require("./lib/local-urls.js");
const { sameModelName } = require("./lib/lmstudio-models.js");
const {
  enforceMarkdownOnlyChatPayload,
  modelContentFromChatData,
  scrubVisibleModelOutput,
  tuneLmStudioChatPayload,
} = require("./chat.js");
const {
  discoverLmStudioVisionModels,
  evictOtherLmStudioModels,
  getLoadedLmStudioModelInfo,
  postLocalChatWithModelAutoload,
  unloadLmStudioModel,
} = require("./lmstudio.js");

const DEFAULT_VISION_ALIAS = "ai-system-main";
const LOCAL_VISION_FALLBACK_MODELS = Object.freeze([
  "qwen3.5-4b-mlx",
  "gemma-4-e4b-it",
]);

/**
 * @param {string} [value]
 * @returns {string}
 */
function normalizeVisionModelName(value = "") {
  return String(value || "").trim();
}

/**
 * Prefer the caller's selected model, then whatever LM Studio reports
 * as loaded, then the setup alias, then concrete VLM fallbacks known
 * to work in AI System 6 local testing.
 *
 * @param {string} [preferred]
 * @returns {string[]}
 */
function localVisionModelCandidates(preferred = "") {
  const candidates = [
    normalizeVisionModelName(preferred),
    normalizeVisionModelName(getLoadedLmStudioModelInfo()?.model),
    normalizeVisionModelName(process.env.AI_SYSTEM6_VISION_MODEL),
    DEFAULT_VISION_ALIAS,
    ...LOCAL_VISION_FALLBACK_MODELS,
  ];
  const seen = new Set();
  return candidates
    .filter((model) => model && model !== "local-model" && !seen.has(model) && seen.add(model));
}

/**
 * The order to try local models in, once LM Studio has been asked what it
 * actually has.
 *
 * Two things this buys over the static list. A model already holding memory
 * goes first when it can see, so the common case costs no load at all — on a
 * machine whose chat model is itself a VLM, nothing is ever swapped. And a
 * model the server says cannot read images is dropped before we pay to load
 * it, instead of after it fails.
 *
 * Falls back to the static list whenever discovery is unavailable, so a
 * machine with an older LM Studio behaves exactly as before.
 *
 * @param {string} preferred
 * @param {string} baseUrl
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<string[]>}
 */
async function resolveLocalVisionModelCandidates(preferred, baseUrl, signal) {
  const staticOrder = localVisionModelCandidates(preferred);
  let discovered = [];
  try {
    discovered = await discoverLmStudioVisionModels(baseUrl, signal);
  } catch {
    return staticOrder;
  }
  if (!discovered.length) return staticOrder;

  const canSee = (model) => discovered.some((item) => sameModelName(item.id, model));
  const known = new Set(discovered.map((item) => item.id));
  const residentVision = discovered.find((item) => item.loaded)?.id || "";

  const ordered = [
    // A model the caller named explicitly still leads, unless the server has
    // told us it cannot read an image.
    ...(preferred && canSee(preferred) ? [normalizeVisionModelName(preferred)] : []),
    // Already in memory and able to see: no load, no eviction, no wait.
    ...(residentVision ? [residentVision] : []),
    normalizeVisionModelName(process.env.AI_SYSTEM6_VISION_MODEL),
    // The two small models this desk is tuned for, ahead of anything larger,
    // because the machine's memory is the binding constraint.
    ...LOCAL_VISION_FALLBACK_MODELS.filter((model) => known.has(model)),
    ...discovered.map((item) => item.id),
  ];

  const seen = new Set();
  const result = ordered.filter((model) =>
    model && model !== "local-model" && !seen.has(model) && seen.add(model));
  return result.length ? result : staticOrder;
}

/**
 * @param {string} dataUrl
 * @returns {{ mimeType: string, base64: string } | null}
 */
function parseImageDataUrl(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpe?g|gif|webp|bmp|heic|heif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase(),
    base64: match[2].replace(/\s+/g, ""),
  };
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {string}
 */
function imageBufferToDataUrl(buffer, mimeType = "image/png") {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

// A local VLM is handed bytes over loopback and cannot go and fetch a link,
// while the cloud model takes the link itself. Both routes must accept the
// same caller input, so a link is downloaded here and inlined before it
// reaches a local model. The numbers match the published cloud limits so one
// route cannot quietly accept what the other rejects.
const VISION_IMAGE_URL_MAX_LENGTH = 8192;
const VISION_IMAGE_URL_TIMEOUT_MS = 60000;
const VISION_LOCAL_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * @param {string} value
 * @returns {boolean}
 */
function isHttpsImageUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.length > VISION_IMAGE_URL_MAX_LENGTH) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Download one linked image and return it as a data URL. Refuses anything the
 * vision models would refuse anyway, so the failure names the real reason.
 *
 * @param {string} url
 * @param {{ signal?: AbortSignal | null, maxBytes?: number }} [options]
 * @returns {Promise<string>}
 */
async function inlineRemoteVisionImage(url, options = {}) {
  if (!isHttpsImageUrl(url)) {
    throw new Error("A linked image must be an HTTPS address of 8192 characters or fewer.");
  }
  const maxBytes = Number(options.maxBytes) || VISION_LOCAL_MAX_IMAGE_BYTES;
  const timeout = AbortSignal.timeout(VISION_IMAGE_URL_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  const response = await fetch(url, { signal, redirect: "follow" });
  if (!response.ok) throw new Error(`The linked image could not be fetched (${response.status}).`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new Error("The linked image is larger than this route accepts.");
  }
  // Format is judged by content, not by the served header, so sniff the magic
  // bytes rather than trusting Content-Type.
  const mimeType = sniffImageMimeType(buffer);
  if (!mimeType) throw new Error("The linked file is not a JPEG, PNG, GIF, or WebP image.");
  return imageBufferToDataUrl(buffer, mimeType);
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function sniffImageMimeType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("latin1").startsWith("GIF8")) return "image/gif";
  if (buffer.length >= 12
    && buffer.subarray(0, 4).toString("latin1") === "RIFF"
    && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return "";
}

/**
 * Normalize whatever the caller sent into data URLs a local model can read.
 * Data URLs pass through; HTTPS links are downloaded.
 *
 * @param {string[]} sources
 * @param {{ signal?: AbortSignal | null }} [options]
 * @returns {Promise<string[]>}
 */
async function resolveLocalVisionImages(sources, options = {}) {
  const values = (Array.isArray(sources) ? sources : [sources])
    .filter((value) => typeof value === "string" && value.trim());
  const resolved = [];
  for (const value of values) {
    resolved.push(/^data:/i.test(value.trim())
      ? value.trim()
      : await inlineRemoteVisionImage(value, { signal: options.signal }));
  }
  return resolved;
}

/**
 * @param {string} mode
 * @param {{ name?: string, prompt?: string }} [options]
 * @returns {{ system: string, user: string, temperature: number, maxTokens: number, taskKind: string }}
 */
function visionPromptForMode(mode = "describe", options = {}) {
  const name = options.name ? `\nImage name: ${options.name}` : "";
  const extra = options.prompt ? `\nUser context: ${options.prompt}` : "";
  if (mode === "ocr") {
    return {
      system: "You transcribe visible text from images for AI System 6. Preserve source text, reading order, line breaks, numbers, dates, units, and Chinese variants. Do not summarize or describe non-text content.",
      user: `OCR task. Transcribe all visible text in the image. Output plain text only.${name}${extra}`,
      temperature: 0,
      maxTokens: 1600,
      taskKind: "ocr",
    };
  }
  if (mode === "pages") {
    // Consecutive pages of one document, read together. This is the whole
    // reason to send a stack instead of a page at a time: reading order,
    // a table that runs across a page break, and a repeated header are
    // things only the whole stack can settle.
    return {
      system: "You transcribe scanned documents for AI System 6. The images are consecutive pages of one document, in order. Preserve source text, reading order, line breaks, numbers, dates, units, and Chinese variants. Do not summarize, describe non-text content, or invent text you cannot see.",
      user: [
        "Transcribe these pages as one document, in the order given.",
        "Mark each page boundary on its own line as: --- page N ---",
        "Keep a table together when it runs across a page break.",
        "Drop running headers and footers that repeat on every page.",
        "Output plain text only.",
        name,
        extra,
      ].filter(Boolean).join("\n"),
      temperature: 0,
      maxTokens: 4000,
      taskKind: "extract-vision-pages",
    };
  }
  if (mode === "writing-context") {
    return {
      system: "You inspect images for a local source-first writing desktop. Return grounded notes the writer can use. Do not invent facts, names, motives, brands, dates, or off-image context.",
      user: [
        "Read this image for writing use.",
        "Return Markdown with:",
        "- Visible subject and setting",
        "- Concrete details worth citing",
        "- Any visible text, copied carefully",
        "- Useful writing angles, clearly marked as possible angles",
        "Keep it concise and grounded in what is visible.",
        name,
        extra,
      ].filter(Boolean).join("\n"),
      temperature: 0.2,
      maxTokens: 900,
      taskKind: "extract-vision-writing-context",
    };
  }
  if (mode === "layout") {
    return {
      system: "You inspect images for layout and cover-design decisions. Judge only visible properties; do not set raw UI numbers.",
      user: [
        "Analyze this image for layout/design use.",
        "Return Markdown bullets for: backdrop tone, visual busyness, light direction, dominant colors, safe negative-space areas, and title/readability risks.",
        name,
        extra,
      ].filter(Boolean).join("\n"),
      temperature: 0.2,
      maxTokens: 700,
      taskKind: "extract-vision-layout",
    };
  }
  return {
    system: "You inspect images for AI System 6. Describe only what is visible and separate observation from inference.",
    user: [
      "Describe this image in concise Markdown.",
      "Include visible subject, setting, notable details, text in the image, and uncertainty if anything is unclear.",
      name,
      extra,
    ].filter(Boolean).join("\n"),
    temperature: 0.2,
    maxTokens: 900,
    taskKind: "extract-vision-describe",
  };
}

/**
 * @param {{
 *   dataUrl: string,
 *   images?: Array<string>,
 *   mode?: string,
 *   model?: string,
 *   name?: string,
 *   prompt?: string,
 *   provider?: string,
 *   endpoint?: string,
 *   signal?: AbortSignal | null,
 * }} options
 * @returns {Promise<{ text: string, model: string, usage: any, raw: any }>}
 */
async function postLocalVisionAnalysis(options) {
  // Accept exactly what the cloud route accepts: one image or many, as data
  // URLs or as HTTPS links. A local model gets bytes either way.
  const images = await resolveLocalVisionImages(
    Array.isArray(options.images) && options.images.length ? options.images : [options.dataUrl],
    { signal: options.signal }
  );
  if (!images.length) throw new Error("Missing or invalid image data URL.");

  for (const image of images) {
    const parsed = parseImageDataUrl(image);
    if (!parsed) throw new Error("Missing or invalid image data URL.");
    const approxBytes = Math.ceil((parsed.base64.length * 3) / 4);
    if (approxBytes > VISION_LOCAL_MAX_IMAGE_BYTES) {
      throw new Error("Image is too large for local vision analysis. Use a smaller preview.");
    }
  }

  const mode = String(options.mode || "describe").trim() || "describe";
  const prompt = visionPromptForMode(mode, { name: options.name, prompt: options.prompt });
  const provider = String(options.provider || "lm-studio").trim();
  const endpoint = String(options.endpoint || "").trim();
  const { chatUrl } = getLocalUrls(provider, endpoint);
  const baseUrl = new URL(chatUrl).origin;
  const candidates = provider === "lm-studio"
    ? await resolveLocalVisionModelCandidates(options.model, baseUrl, options.signal)
    : localVisionModelCandidates(options.model);
  let lastError = null;

  for (const model of candidates) {
    // One vision model resident at a time. Loading alone will not enforce it:
    // loadLmStudioAuxModel evicts only the same model's duplicate instances,
    // so without this a fallback step leaves two sets of weights in memory.
    if (provider === "lm-studio") {
      try {
        await evictOtherLmStudioModels(model, options.signal, { baseUrl });
      } catch {
        // Eviction is best-effort; a machine with room still answers.
      }
    }

    const payload = tuneLmStudioChatPayload(enforceMarkdownOnlyChatPayload({
      model,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt.user },
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
      temperature: prompt.temperature,
      max_tokens: prompt.maxTokens,
      stream: false,
      ai_system6_task_kind: prompt.taskKind,
    }));

    try {
      const { response } = await postLocalChatWithModelAutoload({
        chatUrl,
        payload,
        provider,
        model,
        signal: options.signal,
      });
      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }
      if (!response.ok) {
        throw new Error(data.detail || data.error?.message || data.error || responseText || `Vision model returned ${response.status}`);
      }
      const text = scrubVisibleModelOutput(modelContentFromChatData(data)).trim();
      if (!text) throw new Error("Vision model response was empty.");
      return {
        text,
        model: data.model || model,
        usage: data.usage || null,
        raw: data,
      };
    } catch (error) {
      if (/** @type {any} */ (error)?.name === "AbortError") throw error;
      lastError = error;
      // The candidate may have loaded and then failed the request. Leaving it
      // resident while the next one loads is exactly how two models end up in
      // memory at once.
      if (provider === "lm-studio") {
        try {
          await unloadLmStudioModel(model, options.signal, { baseUrl, exactOnly: true });
        } catch {
          // Best-effort.
        }
      }
    }
  }

  throw lastError || new Error("No local vision model is available.");
}

module.exports = {
  DEFAULT_VISION_ALIAS,
  LOCAL_VISION_FALLBACK_MODELS,
  VISION_IMAGE_URL_MAX_LENGTH,
  VISION_LOCAL_MAX_IMAGE_BYTES,
  imageBufferToDataUrl,
  inlineRemoteVisionImage,
  isHttpsImageUrl,
  localVisionModelCandidates,
  parseImageDataUrl,
  resolveLocalVisionModelCandidates,
  postLocalVisionAnalysis,
  resolveLocalVisionImages,
  sniffImageMimeType,
  visionPromptForMode,
};
