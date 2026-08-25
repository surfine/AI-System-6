// POST /api/import-text.
//
// Mirrors the root importer request/response contract while delegating
// each native file-format family to apps/server/server/importers/* modules.

"use strict";

const { readJsonBody, requestSignal, send } = require("../lib/http.js");
const { postJsonWithFallback } = require("../lib/fetch.js");
const { DEEPSEEK_BASE_URL_DEFAULT, resolveCloudTarget } = require("../cloud.js");
const { resolveCloudCredential } = require("../credential-vault.js");
const {
  buildImportRepairMessages,
  cleanModelOutput,
} = require("../../../desktop/app/shared/model-task-runtime.js");
const {
  importedTextQualityScore,
  importExtension,
  decodePlainTextBuffer,
} = require("../importers/shared.js");
const { tryExtractWithMarkitdown } = require("../importers/markitdown.js");
const { extractSimpleImportedTextNative } = require("../importers/text.js");
const {
  extractSrtText,
  parseSrtBlocks,
  buildTranscriptParagraphsFromSrtBlocks,
  translateSrtToEnglishAndTaiwanSrt,
} = require("../importers/srt.js");
const {
  extractDocxText,
  extractPptxText,
  extractXlsxText,
  extractEpubText,
} = require("../importers/office.js");
const { extractWebArchiveText } = require("../importers/webarchive.js");
const { extractPdfText } = require("../importers/pdf.js");
const {
  extractPagesText,
  extractNumbersText,
  extractKeynoteText,
} = require("../importers/iwork.js");
const {
  imageMimeTypeFromName,
  extractImageText,
  normalizeOcrEngine,
} = require("../importers/image-ocr.js");
const {
  canTranscribeAudioImport,
  extractAudioTranscript,
} = require("../importers/audio.js");

const importJsonMaxBytes = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_IMPORT_JSON_MAX_BYTES || 80 * 1024 * 1024)
);
const lmStudioUrl = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234/v1/chat/completions";
const visionOcrModel = process.env.AI_SYSTEM6_VISION_MODEL || "ai-system-main";

/**
 * @param {string} name
 * @param {string} mimeType
 * @returns {boolean}
 */
function canCheaplyChallengeMarkitdown(name, mimeType) {
  const ext = importExtension(name);
  const type = String(mimeType || "").toLowerCase();
  return [
    ".txt", ".text", ".csv", ".tsv", ".json", ".js", ".ts", ".css", ".xml", ".log",
    ".md", ".mdx", ".markdown", ".mdown", ".mkd", ".mkdn",
    ".htm", ".html", ".xhtml",
    ".rtf",
  ].includes(ext)
    || type.startsWith("text/")
    || type === "application/json"
    || type === "application/markdown"
    || type === "application/rtf"
    || type === "text/rtf"
    || type === "application/x-rtf";
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @param {Buffer} buffer
 * @param {string} externalText
 * @returns {Promise<string>}
 */
async function maybePreferNativeText(name, mimeType, buffer, externalText, options = {}) {
  if (!canCheaplyChallengeMarkitdown(name, mimeType)) return externalText;

  try {
    const nativeText = await extractImportedTextNative(name, mimeType, buffer, options);
    const externalScore = importedTextQualityScore(externalText);
    const nativeScore = importedTextQualityScore(nativeText);
    return nativeScore > externalScore * 1.15 ? nativeText : externalText;
  } catch {
    return externalText;
  }
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
async function extractImportedTextNative(name, mimeType, buffer, options = {}) {
  const ext = importExtension(name);
  if (canTranscribeAudioImport(name, mimeType)) {
    return extractAudioTranscript(name, mimeType, buffer);
  }
  if (ext === ".srt") {
    return extractSrtText(buffer);
  }
  if (ext === ".webarchive" || mimeType === "application/x-webarchive") {
    return extractWebArchiveText(buffer);
  }
  if (ext === ".pdf" || mimeType === "application/pdf") {
    return extractPdfText(buffer, options);
  }
  if (ext === ".pages") {
    return extractPagesText(buffer, options);
  }
  if (ext === ".numbers" || mimeType === "application/vnd.apple.numbers") {
    return extractNumbersText(buffer, options);
  }
  if (ext === ".key" || mimeType === "application/vnd.apple.keynote") {
    return extractKeynoteText(buffer, options);
  }
  if (ext === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocxText(buffer);
  }
  if (ext === ".pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return extractPptxText(buffer);
  }
  if (ext === ".xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return extractXlsxText(buffer);
  }
  if (ext === ".epub" || mimeType === "application/epub+zip") {
    return extractEpubText(buffer);
  }
  if ([".bmp", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) {
    return extractImageText(buffer, imageMimeTypeFromName(name, mimeType), options);
  }
  return extractSimpleImportedTextNative(name, mimeType, buffer);
}

/**
 * @param {string} text
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<string>}
 */
async function repairTextWithLocalModel(text, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = Math.max(5000, Number(process.env.AI_SYSTEM6_LOCAL_REPAIR_TIMEOUT_MS || 25000));
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortLocalRepair = () => controller.abort();
  if (signal) {
    if (signal.aborted) abortLocalRepair();
    else signal.addEventListener("abort", abortLocalRepair, { once: true });
  }
  const payload = {
    model: visionOcrModel,
    messages: buildImportRepairMessages(text),
    temperature: 0.1,
    max_tokens: 2200,
    ai_system6_task_kind: "extract",
    chat_template_kwargs: { enable_thinking: false },
  };

  try {
    const { response } = await postJsonWithFallback(lmStudioUrl, payload, controller.signal);
    const responseText = await response.text();
    let data = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }
    if (!response.ok) {
      throw new Error(data.detail || data.error?.message || responseText || `LM Studio returned status ${response.status}`);
    }
    const repairedText = cleanModelOutput(data?.choices?.[0]?.message?.content || "");
    return repairedText || text;
  } catch (error) {
    if (timedOut) {
      console.error(`Local text repair timed out after ${timeoutMs}ms, returning raw extracted text.`);
      return text;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.("abort", abortLocalRepair);
  }
}

/**
 * @param {string} text
 * @param {{
 *   cloudApiKey?: string,
 *   cloudBaseUrl?: string,
 *   cloudPinnedAddress?: string,
 *   cloudPinnedFamily?: number,
 *   cloudModel?: string,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<string>}
 */
async function repairTextWithCloudModel(text, options) {
  const apiKey = options.cloudApiKey;
  const baseUrl = (options.cloudBaseUrl || "").replace(/\/$/, "");
  const targetUrl = `${baseUrl}/v1/chat/completions`;
  const model = options.cloudModel || "deepseek-v4-flash";
  const payload = {
    model,
    messages: buildImportRepairMessages(text),
    temperature: 0.1,
  };
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const { response } = await postJsonWithFallback(targetUrl, payload, options.signal, headers, {
    pinnedAddress: options.cloudPinnedAddress,
    pinnedFamily: options.cloudPinnedFamily,
  });
  const responseText = await response.text();
  let data = {};
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { raw: responseText };
  }
  if (!response.ok) {
    throw new Error(data.detail || data.error?.message || responseText || `Cloud API returned status ${response.status}`);
  }
  const repairedText = cleanModelOutput(data?.choices?.[0]?.message?.content || "");
  return repairedText || text;
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @returns {boolean}
 */
function isOcrOrLayoutHeavyImport(name, mimeType) {
  const ext = importExtension(name);
  return ext === ".pdf" || mimeType === "application/pdf" ||
    ext === ".pages" || ext === ".key" || ext === ".numbers" ||
    ext === ".webarchive" || ext === ".html" || ext === ".htm" ||
    [".bmp", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext);
}

// The cloud route the OCR ladder is allowed to fall back to. It exists only
// when the writer turned cloud on and a key is actually reachable -- the same
// condition under which this import's extracted text already goes to the cloud
// for repair, so the image follows the text rather than opening a new door.
function cloudVisionRouteFromOptions(options) {
  if (!options.cloudActive || !(options.cloudApiKey || options.cloudCredentialId)) return null;
  return {
    active: true,
    apiKey: options.cloudApiKey || "",
    credentialId: options.cloudCredentialId || "",
    baseUrl: options.cloudBaseUrl || "",
    model: options.cloudVisionModel || "",
    pinnedAddress: options.cloudPinnedAddress || "",
    pinnedFamily: options.cloudPinnedFamily,
  };
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @param {Buffer} buffer
 * @param {{
 *   importerMode?: string,
 *   ocrEngine?: string,
 *   cloudActive?: boolean,
 *   cloudApiKey?: string,
 *   cloudBaseUrl?: string,
 *   cloudPinnedAddress?: string,
 *   cloudPinnedFamily?: number,
 *   cloudModel?: string,
 *   cloudVisionModel?: string,
 *   cloudCredentialId?: string,
 *   onOcrEngine?: (engine: string) => void,
 *   language?: string,
 *   modelExecution?: "client" | "server",
 *   signal?: AbortSignal,
 * }} [options]
 * @returns {Promise<string>}
 */
async function extractImportedText(name, mimeType, buffer, options = {}) {
  const importerMode = options.importerMode || "auto";
  // Forwarded, not captured here: the handler owns the variable, so two
  // imports in flight at once cannot report each other's engine.
  const onOcrEngine = options.onOcrEngine;
  if (canTranscribeAudioImport(name, mimeType)) {
    return extractAudioTranscript(name, mimeType, buffer, {
      language: options.language,
      signal: options.signal,
      repairWithModel: options.modelExecution !== "client",
    });
  }

  let text = "";
  const markitdownText = await tryExtractWithMarkitdown(name, mimeType, buffer);
  if (markitdownText !== null) {
    text = importerMode === "auto"
      ? await maybePreferNativeText(name, mimeType, buffer, markitdownText, {
          allowVisionFallback: options.modelExecution !== "client",
          cloudVision: cloudVisionRouteFromOptions(options),
          onOcrEngine,
        })
      : markitdownText;
  } else {
    if (importerMode === "markitdown") {
      throw new Error("MarkItDown importer is unavailable or could not extract usable text.");
    }
    text = await extractImportedTextNative(name, mimeType, buffer, {
      ocrEngine: options.ocrEngine,
      allowOcrFallback: options.ocrEngine !== "paddle",
      allowVisionFallback: options.modelExecution !== "client",
      cloudVision: cloudVisionRouteFromOptions(options),
      onOcrEngine,
    });
  }

  if (isOcrOrLayoutHeavyImport(name, mimeType) && options.cloudActive && options.cloudApiKey && text.trim()) {
    try {
      text = await repairTextWithCloudModel(text, options);
    } catch (err) {
      console.error("Cloud text repair failed, returning raw extracted text:", err);
    }
  } else if (isOcrOrLayoutHeavyImport(name, mimeType) && !options.cloudActive && options.modelExecution !== "client" && lmStudioUrl && text.trim()) {
    try {
      text = await repairTextWithLocalModel(text, options.signal);
    } catch (err) {
      console.error("Local text repair failed, returning raw extracted text:", err);
    }
  }

  return text;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleImportText(req, res) {
  const signal = requestSignal(req, res);
  try {
    const body = await readJsonBody(req, { limitBytes: importJsonMaxBytes });
    if (signal.aborted) return;
    const name = String(body.name || "Untitled");
    const mimeType = String(body.type || "");
    const importerMode = ["auto", "markitdown"].includes(body.importerMode)
      ? body.importerMode
      : "auto";
    const ocrEngine = normalizeOcrEngine(body.ocrEngine);
    const data = String(body.data || "");
    const buffer = Buffer.from(data, "base64");
    const ext = importExtension(name);

    const modelExecution = /** @type {"client" | "server"} */ (
      body.model_execution === "client" ? "client" : "server"
    );
    const cloudTarget = body._cloud_active
      ? await resolveCloudTarget(body._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT)
      : null;
    const cloudApiKey = cloudTarget
      ? await resolveCloudCredential({
          credentialId: body._cloud_credential_id,
          provider: "deepseek",
          targetBaseUrl: cloudTarget.baseUrl,
          suppliedApiKey: body._cloud_api_key,
          allowSupplied: false,
        })
      : "";
    const options = {
      importerMode,
      ocrEngine,
      cloudActive: !!body._cloud_active,
      cloudApiKey,
      cloudBaseUrl: cloudTarget?.baseUrl || "",
      cloudPinnedAddress: cloudTarget?.address || "",
      cloudPinnedFamily: cloudTarget?.family || 0,
      cloudModel: body._cloud_model,
      language: body.language,
      modelExecution,
      signal,
    };

    // Recorded whether or not the text survives: the disclosure is about the

    // image having left the machine, not about which result was kept.

    let ocrReadBy = "";

    const text = await extractImportedText(name, mimeType, buffer, {

      ...options,

      onOcrEngine: (engine) => { ocrReadBy = engine; },

    });
    let subtitleTranslations = null;
    let videoTranscript = null;
    if (ext === ".srt") {
      const rawSrt = decodePlainTextBuffer(buffer);
      const blocks = parseSrtBlocks(rawSrt);
      videoTranscript = {
        sourceType: "video_transcript",
        blocks: blocks.map((block) => ({
          index: Number(block.number),
          start: block.start,
          end: block.end,
          text: block.textLines.join("\n").trim(),
        })),
        paragraphs: buildTranscriptParagraphsFromSrtBlocks(blocks),
      };
      const translated = await translateSrtToEnglishAndTaiwanSrt(buffer, options);
      subtitleTranslations = {
        enSrt: translated.enSrt,
        twSrt: translated.twSrt,
        blockCount: translated.blockCount,
      };
    }
    if (signal.aborted) return;
    send(res, 200, JSON.stringify({
      name,
      text,
      subtitleTranslations,
      videoTranscript,
      // Names the rung that read an imported image. The browser says so in the
      // import status when it is a cloud one, so a picture never goes to a
      // third party with the interface silent about it.
      ocrReadBy,
      modelPostprocessRequired: options.modelExecution === "client"
        && !options.cloudActive
        && (canTranscribeAudioImport(name, mimeType) || isOcrOrLayoutHeavyImport(name, mimeType))
        && !!text.trim(),
    }), {
      "Content-Type": "application/json",
    });
  } catch (error) {
    if (signal.aborted) return;
    const status = /** @type {any} */ (error).statusCode || 422;
    send(res, status, JSON.stringify({
      error: "Import failed",
      detail: /** @type {Error} */ (error).message,
    }), {
      "Content-Type": "application/json",
    });
  }
}

module.exports = {
  handleImportText,
  extractImportedText,
};
