"use strict";

// Local vision uses the same model boundary as the rest of AI System 6:
// Gemma/Qwen are first-class local QA targets, while the OpenAI-compatible
// image-content payload keeps the route open to other LM Studio VLMs.

const { getLocalUrls } = require("./lib/local-urls.js");
const {
  enforceMarkdownOnlyChatPayload,
  modelContentFromChatData,
  scrubVisibleModelOutput,
  tuneLmStudioChatPayload,
} = require("./chat.js");
const {
  getLoadedLmStudioModelInfo,
  postLocalChatWithModelAutoload,
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
 * @param {string} dataUrl
 * @returns {{ mimeType: string, base64: string } | null}
 */
function parseImageDataUrl(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpe?g|webp|bmp|heic|heif));base64,([a-z0-9+/=\s]+)$/i);
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
  const parsed = parseImageDataUrl(options.dataUrl);
  if (!parsed) throw new Error("Missing or invalid image data URL.");

  const approxBytes = Math.ceil((parsed.base64.length * 3) / 4);
  if (approxBytes > 10 * 1024 * 1024) {
    throw new Error("Image is too large for local vision analysis. Use a smaller preview.");
  }

  const mode = String(options.mode || "describe").trim() || "describe";
  const prompt = visionPromptForMode(mode, { name: options.name, prompt: options.prompt });
  const provider = String(options.provider || "lm-studio").trim();
  const endpoint = String(options.endpoint || "").trim();
  const { chatUrl } = getLocalUrls(provider, endpoint);
  const candidates = localVisionModelCandidates(options.model);
  let lastError = null;

  for (const model of candidates) {
    const payload = tuneLmStudioChatPayload(enforceMarkdownOnlyChatPayload({
      model,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt.user },
            { type: "image_url", image_url: { url: options.dataUrl } },
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
    }
  }

  throw lastError || new Error("No local vision model is available.");
}

module.exports = {
  DEFAULT_VISION_ALIAS,
  LOCAL_VISION_FALLBACK_MODELS,
  imageBufferToDataUrl,
  localVisionModelCandidates,
  parseImageDataUrl,
  postLocalVisionAnalysis,
  visionPromptForMode,
};
