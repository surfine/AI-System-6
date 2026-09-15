"use strict";

// Cloud vision. DeepSeek's `deepseek-flash` reads images through the same
// OpenAI-compatible content blocks the local VLM path already builds, so the
// prompt bodies in vision.js are shared and only the transport differs. The
// retired `deepseek-v4-flash-vision-exp` name still resolves upstream, but the
// product pins the current id; see cloud.js for the alias table.
//
// Boundary: this module never runs on its own. A caller must pass an explicit
// cloud route, because sending a user's image to a provider is a decision the
// user makes per surface — see routes/vision-analyze.js.

const {
  CLOUD_VISION_LIMITS,
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
  cloudAuthHeaders,
  resolveCloudTarget,
  resolveCloudVisionModel,
} = require("./cloud.js");
const { modelContentFromChatData, scrubVisibleModelOutput } = require("./chat.js");
const { resolveCloudCredential } = require("./credential-vault.js");
const { CLOUD_FILE_LIMITS, detectCloudFileMimeType } = require("./cloud-files.js");
const { postJsonWithFallback } = require("./lib/fetch.js");
const { preparePublicCloudCall } = require("./lib/cloud-route.js");
const { isPublicDeployment } = require("./runtime-profile.js");
const { parseImageDataUrl, visionPromptForMode } = require("./vision.js");

const MAX_IMAGE_URL_LENGTH = 8192;
const IMAGE_MAGIC_BYTES = 24;
const MAX_FILENAME_LENGTH = 255;
// Dimensions and format both live near the front of the file. Decode a bounded
// prefix so a request never pays for a full copy of a large photo just to
// measure it; a header that does not fit is reported as unmeasurable.
const IMAGE_HEADER_SCAN_BYTES = 64 * 1024;

/**
 * Return true for either of the two DeepSeek vision wire forms used by the
 * product: an inline/URL image, or a Files API reference. The latter is still
 * represented by a signed AI System 6 token until cloud-chat resolves it.
 *
 * @param {unknown} block
 * @returns {boolean}
 */
function isCloudVisionContentBlock(block) {
  if (!block || typeof block !== "object") return false;
  const value = /** @type {any} */ (block);
  return value.type === "image_url" || value.type === "file";
}

/**
 * @param {string} message
 * @param {number} status
 * @returns {Error & { statusCode: number }}
 */
function visionInputError(message, status = 400) {
  const error = /** @type {Error & { statusCode: number }} */ (new Error(message));
  error.statusCode = status;
  return error;
}

/**
 * Decode and validate an inline base64 image. The declared MIME type has to
 * match the bytes, and the payload has to stay under the published inline
 * image ceiling.
 *
 * @param {string} value Data URL.
 * @returns {{ header: Buffer, mimeType: string }}
 */
function readInlineImageBytes(value) {
  const parsed = parseImageDataUrl(value);
  if (!parsed) throw visionInputError("Image data URL is not readable.");
  const mimeType = String(parsed.mimeType || "").toLowerCase();
  if (!CLOUD_VISION_LIMITS.mimeTypes.includes(mimeType)) {
    throw visionInputError(
      `Cloud vision accepts ${CLOUD_VISION_LIMITS.mimeTypes.join(", ")}. This image is ${mimeType || "an unknown type"}.`
    );
  }
  if (!parsed.base64 || parsed.base64.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(parsed.base64)) {
    throw visionInputError("Image data URL has invalid base64 encoding.");
  }
  const header = Buffer.from(
    parsed.base64.slice(0, Math.ceil(IMAGE_HEADER_SCAN_BYTES / 3) * 4),
    "base64"
  );
  const detectedMimeType = detectCloudFileMimeType(header.subarray(0, IMAGE_MAGIC_BYTES));
  if (!detectedMimeType || detectedMimeType !== mimeType) {
    throw visionInputError("Image content does not match its declared JPEG, PNG, GIF, or WebP format.");
  }
  const padding = parsed.base64.endsWith("==") ? 2 : parsed.base64.endsWith("=") ? 1 : 0;
  const approxBytes = Math.floor((parsed.base64.length * 3) / 4) - padding;
  if (approxBytes > CLOUD_VISION_LIMITS.maxImageBytes) {
    throw visionInputError("Image is larger than the 32 MiB cloud vision limit. Send a smaller copy.", 413);
  }
  return { header, mimeType };
}

/**
 * Read the pixel size out of an image header. Returns null when the format
 * cannot be measured, so an unreadable header never blocks a valid image.
 *
 * @param {Buffer} bytes
 * @returns {{ width: number, height: number } | null}
 */
function parseImageDimensions(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.alloc(0);
  if (buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10) {
    const signature = buffer.subarray(0, 6).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
  }
  if (buffer.length >= 4
    && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // Standalone markers carry no length payload.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + segmentLength;
    }
    return null;
  }
  if (buffer.length >= 16
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 " && buffer.length >= 30
      && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }
  return null;
}

/**
 * @param {number} imageCount
 * @returns {number}
 */
function maxImageSideForImages(imageCount) {
  return imageCount >= CLOUD_VISION_LIMITS.manyImagesThreshold
    ? CLOUD_VISION_LIMITS.maxImageSideManyImages
    : CLOUD_VISION_LIMITS.maxImageSide;
}

/**
 * @param {Buffer} bytes
 * @param {number} maxImageSide
 */
function assertImageSideWithinLimit(bytes, maxImageSide) {
  const dimensions = parseImageDimensions(bytes);
  if (!dimensions) return;
  if (Math.max(dimensions.width, dimensions.height) > maxImageSide) {
    throw visionInputError(
      `Image is ${dimensions.width}×${dimensions.height}px. One side may be at most ${maxImageSide}px.`,
      413
    );
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeImageFilename(value) {
  const filename = String(value || "").trim() || "image";
  if (filename.length > MAX_FILENAME_LENGTH || /[\u0000-\u001f\u007f/\\]/.test(filename)) {
    throw visionInputError("The image filename is invalid.");
  }
  return filename;
}

/**
 * Normalize one caller-supplied image into an `image_url` content block, and
 * fail early on anything the provider would reject anyway.
 *
 * @param {string} source Data URL or public HTTPS URL.
 * @param {string} detail
 * @param {{ maxImageSide?: number }} [options]
 * @returns {{ type: "image_url", image_url: { url: string, detail?: string } }}
 */
function imageContentBlock(source, detail, options = {}) {
  const value = String(source || "").trim();
  if (!value) throw visionInputError("Missing image.");
  const maxImageSide = Number(options.maxImageSide) || CLOUD_VISION_LIMITS.maxImageSide;

  if (/^data:/i.test(value)) {
    const { header } = readInlineImageBytes(value);
    assertImageSideWithinLimit(header, maxImageSide);
    return { type: "image_url", image_url: { url: value, detail } };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw visionInputError("Image must be a data URL or a public HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw visionInputError("An image URL must use HTTPS.");
  }
  if (value.length > MAX_IMAGE_URL_LENGTH) {
    throw visionInputError("Image URL is longer than the 8192-character limit.");
  }
  return { type: "image_url", image_url: { url: value, detail } };
}

/**
 * Validate and canonicalize image_url blocks in an OpenAI-compatible message
 * list. DeepSeek accepts image input only in user messages. Files API blocks
 * backed by a signed token are counted here but intentionally left
 * unresolved; cloud-files verifies the token against the active session and
 * credential immediately before the upstream call. Inline `file_data` blocks
 * (the guide's base64 Files API form) are validated here instead.
 *
 * @param {any[]} messages
 * @returns {{ messages: any[], imageCount: number, fileCount: number, hasVision: boolean }}
 */
function normalizeCloudVisionMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  const visionBlockCount = source.reduce((total, message) => (
    total + (Array.isArray(message?.content) ? message.content.filter(isCloudVisionContentBlock).length : 0)
  ), 0);
  const maxImageSide = maxImageSideForImages(visionBlockCount);
  let imageCount = 0;
  let fileCount = 0;
  const normalized = source.map((message) => {
    if (!Array.isArray(message?.content)) return message;
    const carriesVision = message.content.some(isCloudVisionContentBlock);
    if (carriesVision && message.role !== "user") {
      throw visionInputError("Cloud vision images are allowed only in user messages.");
    }
    const content = message.content.map((block) => {
      if (block?.type === "image_url") {
        const imageUrl = block.image_url;
        const url = typeof imageUrl === "string" ? imageUrl : imageUrl?.url;
        const detail = normalizeDetail(typeof imageUrl === "object" ? imageUrl?.detail : "");
        imageCount += 1;
        return imageContentBlock(url, detail, { maxImageSide });
      }
      if (block?.type === "file") {
        const fileId = typeof block.file_id === "string" ? block.file_id.trim() : "";
        const fileData = typeof block.file_data === "string" ? block.file_data.trim() : "";
        if (fileId && fileData) {
          throw visionInputError("A cloud file block carries either file_id or file_data, not both.");
        }
        if (fileId) {
          fileCount += 1;
          return { type: "file", file_id: fileId };
        }
        if (fileData) {
          // Inline Files API form: the bytes count against the request body
          // and the 32 MiB inline ceiling, not the 64 MiB file_id one.
          imageCount += 1;
          const { header } = readInlineImageBytes(fileData);
          assertImageSideWithinLimit(header, maxImageSide);
          return {
            type: "file",
            file_data: fileData,
            filename: normalizeImageFilename(block.filename),
          };
        }
        throw visionInputError("Cloud file blocks require a file_id or file_data.");
      }
      return block;
    });
    return { ...message, content };
  });
  const total = imageCount + fileCount;
  if (total > CLOUD_FILE_LIMITS.maxFilesPerRequest) {
    throw visionInputError(
      `AI System 6 accepts at most ${CLOUD_FILE_LIMITS.maxFilesPerRequest} images in one request.`
    );
  }
  return { messages: normalized, imageCount, fileCount, hasVision: total > 0 };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeDetail(value) {
  const detail = String(value || "auto").trim().toLowerCase();
  return CLOUD_VISION_LIMITS.detailModes.includes(detail) ? detail : "auto";
}

/**
 * Build the request body. The provider rejects images in `system` or
 * `assistant` messages, so every image block goes in the one user message.
 *
 * @param {{ images: string[], detail: string, mode?: string, name?: string, prompt?: string }} options
 * @returns {{ messages: any[], temperature: number, max_tokens: number, taskKind: string }}
 */
function buildCloudVisionMessages(options) {
  const prompt = visionPromptForMode(options.mode || "describe", {
    name: options.name,
    prompt: options.prompt,
  });
  const maxImageSide = maxImageSideForImages(options.images.length);
  const imageBlocks = options.images.map((image) => imageContentBlock(image, options.detail, { maxImageSide }));
  return {
    messages: [
      { role: "system", content: prompt.system },
      {
        role: "user",
        content: [{ type: "text", text: prompt.user }, ...imageBlocks],
      },
    ],
    temperature: prompt.temperature,
    max_tokens: prompt.maxTokens,
    taskKind: prompt.taskKind,
  };
}

/**
 * @param {{
 *   dataUrl?: string,
 *   images?: string[],
 *   mode?: string,
 *   name?: string,
 *   prompt?: string,
 *   model?: string,
 *   detail?: string,
 *   credentialId?: string,
 *   apiKey?: string,
 *   baseUrl?: string,
 *   signal?: AbortSignal | null,
 *   req?: import("node:http").IncomingMessage,
 * }} options
 * @returns {Promise<{ text: string, model: string, usage: any, raw: any, source: string }>}
 */
async function postCloudVisionAnalysis(options) {
  const images = (Array.isArray(options.images) && options.images.length
    ? options.images
    : [options.dataUrl]
  ).filter((image) => typeof image === "string" && image.trim());

  if (!images.length) throw visionInputError("Missing image data URL.");
  if (images.length > CLOUD_FILE_LIMITS.maxFilesPerRequest) {
    throw visionInputError(`AI System 6 accepts at most ${CLOUD_FILE_LIMITS.maxFilesPerRequest} images in one request.`);
  }

  const built = buildCloudVisionMessages({
    images,
    detail: normalizeDetail(options.detail),
    mode: options.mode,
    name: options.name,
    prompt: options.prompt,
  });
  const model = resolveCloudVisionModel(options.model);
  /** @type {any} */
  const payload = {
    model,
    messages: built.messages,
    temperature: built.temperature,
    max_tokens: built.max_tokens,
    stream: false,
    // Vision extraction is an instant, bounded task. Do not let the provider's
    // default thinking mode consume the answer budget, and never send the
    // product's internal task-routing field upstream.
    thinking: { type: "disabled" },
  };

  let response;
  /** @type {any} */
  let reservation = null;

  try {
    if (isPublicDeployment) {
      const cloud = await preparePublicCloudCall({
        credentialId: options.credentialId,
        suppliedApiKey: options.apiKey,
        model,
        payload,
        req: options.req,
      });
      reservation = cloud.reservation;
      ({ response } = await postJsonWithFallback(
        `${cloud.baseUrl}/v1/chat/completions`,
        cloud.payload,
        options.signal,
        cloud.authHeaders,
        {
          pinnedAddress: cloud.pinnedAddress,
          pinnedFamily: cloud.pinnedFamily,
          onRequest: () => reservation?.markUpstreamStarted(),
        }
      ));
    } else {
      const cloudTarget = await resolveCloudTarget(options.baseUrl || DEEPSEEK_BASE_URL_DEFAULT);
      const apiKey = String(await resolveCloudCredential({
        credentialId: options.credentialId,
        provider: "deepseek",
        targetBaseUrl: cloudTarget.baseUrl,
        suppliedApiKey: options.apiKey || DEEPSEEK_API_KEY_DEFAULT,
        allowSupplied: false,
      })).trim();
      if (!apiKey) throw visionInputError("No cloud API key is configured for vision.", 400);
      ({ response } = await postJsonWithFallback(
        `${cloudTarget.baseUrl}/v1/chat/completions`,
        payload,
        options.signal,
        cloudAuthHeaders(apiKey),
        { pinnedAddress: cloudTarget.address, pinnedFamily: cloudTarget.family }
      ));
    }

    const responseText = await response.text();
    /** @type {any} */
    let data = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }
    if (!response.ok) {
      throw visionInputError(
        data.detail || data.error?.message || data.error || responseText || `Cloud vision returned ${response.status}`,
        response.status === 413 ? 413 : 502
      );
    }
    const text = scrubVisibleModelOutput(modelContentFromChatData(data)).trim();
    if (!text) throw visionInputError("Cloud vision returned no usable text.", 502);
    reservation?.addUsage(data.usage);
    return {
      text,
      model: data.model || model,
      usage: data.usage || null,
      raw: data,
      source: "cloud-vision",
    };
  } finally {
    // The shared-allowance reservation must be released on every path, or a
    // failed image request keeps holding public budget.
    reservation?.settle();
  }
}

/**
 * Turn stored preview data URLs into content blocks for a prompt the server
 * builds itself (Quick Draft). Anything unreadable is skipped rather than
 * failing the whole draft — a picture is extra material, not the request.
 *
 * @param {Array<string | { previewDataUrl?: string, dataUrl?: string }>} sources
 * @param {{ limit?: number, detail?: string }} [options]
 * @returns {Array<{ type: string, image_url: { url: string, detail?: string } }>}
 */
function imageBlocksFromSources(sources, options = {}) {
  const detail = normalizeDetail(options.detail);
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : 4;
  const maxImageSide = maxImageSideForImages(limit);
  const blocks = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    if (blocks.length >= limit) break;
    const url = typeof source === "string"
      ? source
      : String(source?.previewDataUrl || source?.dataUrl || "");
    if (!url) continue;
    try {
      blocks.push(imageContentBlock(url, detail, { maxImageSide }));
    } catch {
      // Skip the unreadable one, keep the draft.
    }
  }
  return blocks;
}

module.exports = {
  buildCloudVisionMessages,
  imageBlocksFromSources,
  imageContentBlock,
  isCloudVisionContentBlock,
  parseImageDimensions,
  normalizeCloudVisionMessages,
  normalizeDetail,
  postCloudVisionAnalysis,
};
