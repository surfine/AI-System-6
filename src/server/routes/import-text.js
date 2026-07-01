// POST /api/import-text.
//
// Mirrors the root importer request/response contract while delegating
// each native file-format family to src/server/importers/* modules.

"use strict";

const { readJsonBody, requestSignal, send } = require("../lib/http.js");
const { postJsonWithFallback } = require("../lib/fetch.js");
const { DEEPSEEK_BASE_URL_DEFAULT } = require("../cloud.js");
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
const repairSystemPrompt = "你是 AI System 6 的文档重建助手。请处理 OCR 或抽取文本，把它修复成干净、忠于原文的 Markdown。修复明显 OCR 错字、断行、栏位阅读顺序和段落结构。保持原文语气、信息顺序和内容完整。不总结、不删减、不扩写，不添加来源中没有的标题、解释、注释或结论。不输出“以下是修复结果”等元说明。直接输出干净 Markdown，不要代码围栏。";

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
async function maybePreferNativeText(name, mimeType, buffer, externalText) {
  if (!canCheaplyChallengeMarkitdown(name, mimeType)) return externalText;

  try {
    const nativeText = await extractImportedTextNative(name, mimeType, buffer);
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
 * @param {string} value
 * @returns {string}
 */
function unwrapMarkdownFence(value) {
  let text = String(value || "").trim();
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines.length && lines[lines.length - 1].startsWith("```")) lines.pop();
    text = lines.join("\n").trim();
  }
  return text;
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
    messages: [
      { role: "system", content: repairSystemPrompt },
      { role: "user", content: `Please repair and format the following raw OCR or extracted document text into clean Markdown:\n\n${text}` },
    ],
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
    const repairedText = unwrapMarkdownFence(data?.choices?.[0]?.message?.content || "");
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
    messages: [
      { role: "system", content: repairSystemPrompt },
      { role: "user", content: `Please repair and format the following raw OCR or extracted document text into clean Markdown:\n\n${text}` },
    ],
    temperature: 0.1,
  };
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const { response } = await postJsonWithFallback(targetUrl, payload, options.signal, headers);
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
  const repairedText = unwrapMarkdownFence(data?.choices?.[0]?.message?.content || "");
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
 *   cloudModel?: string,
 *   language?: string,
 *   signal?: AbortSignal,
 * }} [options]
 * @returns {Promise<string>}
 */
async function extractImportedText(name, mimeType, buffer, options = {}) {
  const importerMode = options.importerMode || "auto";
  if (canTranscribeAudioImport(name, mimeType)) {
    return extractAudioTranscript(name, mimeType, buffer, {
      language: options.language,
      signal: options.signal,
    });
  }

  let text = "";
  const markitdownText = await tryExtractWithMarkitdown(name, mimeType, buffer);
  if (markitdownText !== null) {
    text = importerMode === "auto"
      ? await maybePreferNativeText(name, mimeType, buffer, markitdownText)
      : markitdownText;
  } else {
    if (importerMode === "markitdown") {
      throw new Error("MarkItDown importer is unavailable or could not extract usable text.");
    }
    text = await extractImportedTextNative(name, mimeType, buffer, {
      ocrEngine: options.ocrEngine,
      allowOcrFallback: options.ocrEngine !== "paddle",
    });
  }

  if (isOcrOrLayoutHeavyImport(name, mimeType) && options.cloudActive && options.cloudApiKey && text.trim()) {
    try {
      text = await repairTextWithCloudModel(text, options);
    } catch (err) {
      console.error("Cloud text repair failed, returning raw extracted text:", err);
    }
  } else if (isOcrOrLayoutHeavyImport(name, mimeType) && !options.cloudActive && lmStudioUrl && text.trim()) {
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

    const options = {
      importerMode,
      ocrEngine,
      cloudActive: !!body._cloud_active,
      cloudApiKey: body._cloud_api_key,
      cloudBaseUrl: body._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT,
      cloudModel: body._cloud_model,
      language: body.language,
      signal,
    };

    const text = await extractImportedText(name, mimeType, buffer, options);
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
