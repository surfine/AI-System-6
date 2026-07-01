// SRT import and subtitle translation pipeline. Copied from
// server-importers.js so /api/import-text preserves both the plain
// transcript extraction and the generated subtitle sidecar outputs.

"use strict";

const { postJsonWithFallback } = require("../lib/fetch.js");
const {
  cleanImportedText,
  decodePlainTextBuffer,
} = require("./shared.js");

const lmStudioUrl = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234/v1/chat/completions";
const visionOcrModel = process.env.AI_SYSTEM6_VISION_MODEL || "ai-system-main";

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractSrtText(buffer) {
  const text = decodePlainTextBuffer(buffer);
  return cleanImportedText(
    text
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/^\d+$/.test(trimmed)) return false;
        if (/^\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed)) return false;
        return true;
      })
      .join("\n")
  );
}

/**
 * @param {string} rawText
 * @returns {Array<{
 *   blockIndex: number,
 *   number: string,
 *   timeline: string,
 *   start: string,
 *   end: string,
 *   textLines: string[],
 * }>}
 */
function parseSrtBlocks(rawText) {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const chunks = normalized.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean);
  const blocks = [];
  chunks.forEach((chunk, chunkIndex) => {
    const lines = chunk.split("\n").map((line) => line.replace(/\s+$/g, ""));
    if (lines.length < 2) return;
    const number = lines[0].trim();
    const timeline = lines[1].trim();
    if (!/^\d+$/.test(number)) return;
    if (!/^\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(timeline)) return;
    const timelineMatch = timeline.match(/^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/);
    const textLines = lines.slice(2);
    blocks.push({
      blockIndex: chunkIndex,
      number,
      timeline,
      start: timelineMatch?.[1] || "",
      end: timelineMatch?.[2] || "",
      textLines,
    });
  });
  return blocks;
}

/**
 * @param {ReturnType<typeof parseSrtBlocks>} blocks
 * @returns {Array<{ id: string, timeStart: string, timeEnd: string, text: string, blockIds: string[] }>}
 */
function buildTranscriptParagraphsFromSrtBlocks(blocks) {
  const paragraphs = [];
  let current = null;
  const sentenceBreak = /[.!?。！？…]$/u;

  const flush = () => {
    if (!current || !current.texts.length) return;
    paragraphs.push({
      id: `para-${paragraphs.length + 1}`,
      timeStart: current.start,
      timeEnd: current.end,
      text: current.texts.join(" ").replace(/\s+/g, " ").trim(),
      blockIds: current.blockIds,
    });
    current = null;
  };

  blocks.forEach((block, index) => {
    const blockText = block.textLines.join(" ").replace(/\s+/g, " ").trim();
    if (!blockText) return;
    if (!current) {
      current = {
        start: block.start,
        end: block.end,
        texts: [],
        blockIds: [],
      };
    }
    current.texts.push(blockText);
    current.end = block.end || current.end;
    current.blockIds.push(String(block.number || index + 1));
    if (sentenceBreak.test(blockText) || current.texts.length >= 4) flush();
  });
  flush();

  return paragraphs;
}

/**
 * @param {ReturnType<typeof parseSrtBlocks>} blocks
 * @param {string[]} translatedTexts
 * @returns {string}
 */
function buildSrtFromBlocks(blocks, translatedTexts) {
  return blocks
    .map((block, index) => {
      const translated = String(translatedTexts[index] ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
      const lines = translated ? translated.split("\n") : [""];
      return [block.number, block.timeline, ...lines].join("\n");
    })
    .join("\n\n")
    .trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeModelJsonText(value) {
  const source = String(value || "").trim();
  if (!source) return source;
  if (!source.startsWith("```")) return source;
  const lines = source.split("\n");
  if (lines[0].startsWith("```")) lines.shift();
  if (lines.length && lines[lines.length - 1].startsWith("```")) lines.pop();
  return lines.join("\n").trim();
}

/**
 * @param {string} content
 * @param {number} expectedCount
 * @returns {string[] | null}
 */
function parseSubtitleModelTranslations(content, expectedCount) {
  const clean = sanitizeModelJsonText(content);
  const candidates = [clean];
  const firstBracket = clean.indexOf("[");
  const lastBracket = clean.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(clean.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? "").trim());
    } catch {
      // Try the next extraction strategy.
    }
  }

  const tableRows = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .filter((line) => !/^\|\s*:?-{2,}:?\s*\|/.test(line))
    .filter((line) => !/\|\s*(index|序号|编号)\s*\|/i.test(line))
    .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()))
    .map((cells) => (cells.length >= 2 ? cells.slice(1).join(" | ") : ""))
    .filter(Boolean);
  if (tableRows.length === expectedCount) return tableRows.map((item) => item.replace(/<br\s*\/?>/gi, "\n"));

  const numbered = [];
  const pattern = /(?:^|\n)\s*(?:[-*]\s*)?(\d{1,4})[.)、]\s*([\s\S]*?)(?=\n\s*(?:[-*]\s*)?\d{1,4}[.)、]\s+|$)/g;
  let match;
  while ((match = pattern.exec(clean))) {
    const value = String(match[2] || "")
      .replace(/\n{2,}/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .trim();
    if (value) numbered[Number(match[1]) - 1] = value;
  }
  const compactNumbered = numbered.filter((item) => item !== undefined);
  if (compactNumbered.length === expectedCount) return numbered.map((item) => String(item || "").trim());

  const looseLines = clean
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*(?:[-*]|\d+[.)、]|#{1,6})\s*/, "")
      .replace(/^["“”]+|["“”]+$/g, "")
      .trim())
    .filter((line) => line && !/^(输出|翻译|以下|here|translation|translated|markdown|subtitle)/i.test(line));
  if (looseLines.length >= expectedCount) return looseLines.slice(0, expectedCount);
  if (expectedCount === 1 && looseLines.length === 1) return looseLines;

  return null;
}

/**
 * @param {string} content
 * @param {number} expectedCount
 * @returns {string[] | null}
 */
function parseParagraphTranslationMarkdown(content, expectedCount) {
  const clean = sanitizeModelJsonText(content);
  const byHeading = [];
  const headingPattern = /(?:^|\n)#{2,4}\s*P(\d{1,4})\s*\n([\s\S]*?)(?=\n#{2,4}\s*P\d{1,4}\s*\n|$)/gi;
  let headingMatch;
  while ((headingMatch = headingPattern.exec(clean))) {
    byHeading[Number(headingMatch[1]) - 1] = String(headingMatch[2] || "").trim();
  }
  if (byHeading.filter(Boolean).length === expectedCount) return byHeading.map((item) => item.trim());

  const numbered = [];
  const numberedPattern = /(?:^|\n)\s*(?:[-*]\s*)?P?(\d{1,4})[.)、]\s*([\s\S]*?)(?=\n\s*(?:[-*]\s*)?P?\d{1,4}[.)、]\s+|$)/gi;
  let numberedMatch;
  while ((numberedMatch = numberedPattern.exec(clean))) {
    numbered[Number(numberedMatch[1]) - 1] = String(numberedMatch[2] || "").trim();
  }
  if (numbered.filter(Boolean).length === expectedCount) return numbered.map((item) => item.trim());
  return null;
}

/**
 * @param {string} text
 * @param {number} count
 * @param {"en" | "tw"} mode
 * @returns {string[]}
 */
function splitTranslatedParagraphForBlocks(text, count, mode) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (count <= 1) return [clean];
  if (!clean) return Array(count).fill("");
  const sentencePattern = mode === "en"
    ? /[^.!?;:]+[.!?;:]?/g
    : /[^。！？；：]+[。！？；：]?/gu;
  const pieces = (clean.match(sentencePattern) || [])
    .map((item) => item.trim())
    .filter(Boolean);
  const out = Array(count).fill("");
  if (pieces.length >= count) {
    pieces.forEach((piece, index) => {
      const bucket = Math.min(count - 1, Math.floor(index * count / pieces.length));
      out[bucket] = out[bucket] ? `${out[bucket]} ${piece}` : piece;
    });
    return out.map((item) => item.trim());
  }

  const words = mode === "en" ? clean.split(/\s+/).filter(Boolean) : Array.from(clean);
  const per = Math.max(1, Math.ceil(words.length / count));
  for (let index = 0; index < count; index += 1) {
    const chunk = words.slice(index * per, (index + 1) * per);
    out[index] = mode === "en" ? chunk.join(" ") : chunk.join("");
  }
  return out.map((item) => item.trim());
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function englishSubtitleStillLooksChinese(text) {
  const value = String(text || "");
  const cjk = (value.match(/[\u3400-\u9fff]/gu) || []).length;
  const letters = (value.match(/[A-Za-z]/g) || []).length;
  if (!value.trim()) return true;
  if (/[\u3400-\u9fff]{4,}/u.test(value)) return true;
  return cjk > 0 && (letters === 0 || cjk / Math.max(1, cjk + letters) > 0.08);
}

/**
 * @param {ReturnType<typeof parseSrtBlocks>} blocks
 * @returns {Array<{ id: string, blockIndexes: number[], text: string }>}
 */
function buildSubtitleTranslationParagraphs(blocks) {
  const paragraphs = buildTranscriptParagraphsFromSrtBlocks(blocks);
  const blockByNumber = new Map(blocks.map((block, index) => [String(block.number || index + 1), index]));
  return paragraphs.map((paragraph, index) => ({
    id: `P${index + 1}`,
    blockIndexes: paragraph.blockIds
      .map((id) => blockByNumber.get(String(id)))
      .filter((value) => Number.isInteger(value)),
    text: paragraph.text,
  })).filter((paragraph) => paragraph.blockIndexes.length && paragraph.text);
}

/**
 * @param {Array<{ id: string, text: string }>} paragraphs
 * @param {"en" | "tw"} mode
 * @param {{ cloudActive?: boolean, cloudApiKey?: string, cloudBaseUrl?: string, cloudModel?: string, signal?: AbortSignal }} options
 * @returns {Promise<string[] | null>}
 */
async function requestParagraphBatchTranslation(paragraphs, mode, options) {
  const cloudActive = !!(options.cloudActive && options.cloudApiKey);
  const model = cloudActive ? (options.cloudModel || "deepseek-v4-flash") : visionOcrModel;
  const systemPrompt = mode === "en"
    ? "你是 AI System 6 的字幕翻译助手。请把中文视频字幕段落翻译成自然、简洁的英文。"
    : "你是 AI System 6 的字幕本地化助手。请把简体中文视频字幕段落本地化为台湾使用的自然繁体中文。";
  const userPrompt = [
    mode === "en" ? "请翻译这些字幕段落。" : "请本地化这些字幕段落。",
    "返回 Markdown，不要代码围栏。",
    "每个输入段落必须对应一个输出段落，编号必须保持一致。",
    "格式固定：",
    "### P1",
    "译文",
    "### P2",
    "译文",
    "",
    "规则：只返回译文段落，不要解释；不要增删段落；保留专有名词；英文要适合字幕阅读，台湾繁中要自然。",
    "",
    paragraphs.map((paragraph) => `### ${paragraph.id}\n${paragraph.text}`).join("\n\n"),
  ].join("\n");
  const payload = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  let response;
  if (cloudActive) {
    const apiKey = options.cloudApiKey;
    const baseUrl = (options.cloudBaseUrl || "").replace(/\/$/, "");
    const targetUrl = `${baseUrl}/v1/chat/completions`;
    ({ response } = await postJsonWithFallback(targetUrl, payload, options.signal, {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }));
  } else {
    ({ response } = await postJsonWithFallback(lmStudioUrl, payload, options.signal));
  }
  const raw = await response.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (!response.ok) {
    throw new Error(data.detail || data.error?.message || raw || `Subtitle paragraph translation failed (${response.status}).`);
  }
  return parseParagraphTranslationMarkdown(data?.choices?.[0]?.message?.content || "", paragraphs.length);
}

/**
 * @param {{ id: string, text: string }} paragraph
 * @param {"en" | "tw"} mode
 * @param {{ cloudActive?: boolean, cloudApiKey?: string, cloudBaseUrl?: string, cloudModel?: string, signal?: AbortSignal }} options
 * @returns {Promise<string | null>}
 */
async function retryOneParagraphTranslation(paragraph, mode, options) {
  const translated = await requestParagraphBatchTranslation([{
    id: "P1",
    text: paragraph.text,
  }], mode, options).catch(() => null);
  return translated?.[0] || null;
}

/**
 * @param {string} sourceText
 * @param {string} translatedText
 * @returns {boolean}
 */
function englishSubtitleTooLong(sourceText, translatedText) {
  const source = String(sourceText || "").replace(/\s+/g, " ").trim();
  const translated = String(translatedText || "").replace(/\s+/g, " ").trim();
  if (!translated) return false;
  const sourceLen = source.length;
  const translatedLen = translated.length;
  const softLimit = Math.max(42, Math.round(sourceLen * 1.9) + 12);
  return translatedLen > softLimit;
}

/**
 * @param {string[]} texts
 * @param {"en" | "tw"} mode
 * @param {{ cloudActive?: boolean, cloudApiKey?: string, cloudBaseUrl?: string, cloudModel?: string, signal?: AbortSignal }} options
 * @param {string} [attemptLabel]
 * @returns {Promise<string[]>}
 */
async function requestSubtitleBatchTranslation(texts, mode, options, attemptLabel = "") {
  const cloudActive = !!(options.cloudActive && options.cloudApiKey);
  const model = cloudActive ? (options.cloudModel || "deepseek-v4-flash") : visionOcrModel;
  const systemPrompt = mode === "en"
    ? "你是 AI System 6 的字幕翻译助手。请把简体中文字幕行翻译成适合屏幕阅读的自然英文字幕。"
    : "你是 AI System 6 的字幕本地化助手。请把简体中文字幕行转换成台湾使用的自然繁体中文字幕。";
  const userPrompt = mode === "en"
    ? [
      `请把 JSON 数组里的每条字幕翻译成英文。${attemptLabel}`.trim(),
      "输出格式：",
      "- 返回 Markdown 编号列表，不要代码围栏。",
      "- 每条输入对应一条输出，数量必须完全一致。",
      "- 格式固定为：1. translated subtitle",
      "- 如果一条字幕需要换行，用 <br> 表示。",
      "规则：",
      "- 只翻译字幕正文，不添加解释。",
      "- 保留每个 item 内必要换行。",
      "- 英文要简洁、自然，适合字幕阅读速度。",
      "- 不要过度扩写，专有名词保持一致。",
      "",
      JSON.stringify(texts),
    ].join("\n")
    : [
      `请把 JSON 数组里的每条字幕本地化为台湾繁体中文。${attemptLabel}`.trim(),
      "输出格式：",
      "- 返回 Markdown 编号列表，不要代码围栏。",
      "- 每条输入对应一条输出，数量必须完全一致。",
      "- 格式固定为：1. 本地化字幕",
      "- 如果一条字幕需要换行，用 <br> 表示。",
      "规则：",
      "- 只处理字幕正文，不添加解释。",
      "- 保持原意忠实。",
      "- 使用台湾繁体中文和台湾常用词，不要只是简转繁。",
      "- 优先使用台湾用语，例如：视频->影片，软件->軟體，芯片->晶片，默认->預設，信息->資訊。",
      "- 字幕要短、自然，适合屏幕阅读。专有名词保持一致。",
      "",
      JSON.stringify(texts),
    ].join("\n");
  const payload = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  let response;
  if (cloudActive) {
    const apiKey = options.cloudApiKey;
    const baseUrl = (options.cloudBaseUrl || "").replace(/\/$/, "");
    const targetUrl = `${baseUrl}/v1/chat/completions`;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    ({ response } = await postJsonWithFallback(targetUrl, payload, options.signal, headers));
  } else {
    ({ response } = await postJsonWithFallback(lmStudioUrl, payload, options.signal));
  }
  const raw = await response.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (!response.ok) {
    throw new Error(data.detail || data.error?.message || raw || `Subtitle translation failed (${response.status}).`);
  }
  const parsed = parseSubtitleModelTranslations(data?.choices?.[0]?.message?.content || "", texts.length);
  if (parsed) return parsed;

  // Last-resort fallback: keep the import/export flow alive even when
  // a local model ignores the requested Markdown list shape.
  return texts.map((text) => String(text || "").trim());
}

/**
 * @param {ReturnType<typeof parseSrtBlocks>} blocks
 * @param {"en" | "tw"} mode
 * @param {{ cloudActive?: boolean, cloudApiKey?: string, cloudBaseUrl?: string, cloudModel?: string, signal?: AbortSignal }} options
 * @returns {Promise<string[]>}
 */
async function translateSubtitleBlocks(blocks, mode, options) {
  const paragraphOutputs = await translateSubtitleBlocksByParagraphs(blocks, mode, options).catch(() => null);
  if (paragraphOutputs) return paragraphOutputs;

  const batchSize = 20;
  const outputs = Array(blocks.length).fill("");
  for (let start = 0; start < blocks.length; start += batchSize) {
    const end = Math.min(start + batchSize, blocks.length);
    const batchBlocks = blocks.slice(start, end);
    const sourceTexts = batchBlocks.map((block) => block.textLines.join("\n").trim());
    let translated = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        translated = await requestSubtitleBatchTranslation(sourceTexts, mode, options);
        if (translated.length !== sourceTexts.length) {
          throw new Error(`Model returned ${translated.length} items for a ${sourceTexts.length}-item batch.`);
        }
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!translated) {
      throw new Error(`Subtitle translation failed in batch ${Math.floor(start / batchSize) + 1}: ${lastError?.message || "unknown error"}`);
    }
    if (mode === "en") {
      const tooLong = [];
      translated.forEach((text, idx) => {
        if (englishSubtitleTooLong(sourceTexts[idx], text)) tooLong.push(idx);
      });
      if (tooLong.length) {
        for (let retry = 0; retry < 2 && tooLong.length; retry += 1) {
          const retrySourceTexts = tooLong.map((idx) => sourceTexts[idx]);
          const retryTranslated = await requestSubtitleBatchTranslation(
            retrySourceTexts,
            mode,
            options,
            "Some prior outputs were too long; make each one much shorter while preserving meaning."
          );
          if (retryTranslated.length !== retrySourceTexts.length) continue;
          tooLong.forEach((sourceIdx, i) => {
            translated[sourceIdx] = retryTranslated[i];
          });
          for (let i = tooLong.length - 1; i >= 0; i -= 1) {
            const sourceIdx = tooLong[i];
            if (!englishSubtitleTooLong(sourceTexts[sourceIdx], translated[sourceIdx])) tooLong.splice(i, 1);
          }
        }
      }
    }
    translated.forEach((text, idx) => {
      outputs[start + idx] = text;
    });
  }
  return outputs;
}

/**
 * @param {ReturnType<typeof parseSrtBlocks>} blocks
 * @param {"en" | "tw"} mode
 * @param {{ cloudActive?: boolean, cloudApiKey?: string, cloudBaseUrl?: string, cloudModel?: string, signal?: AbortSignal }} options
 * @returns {Promise<string[] | null>}
 */
async function translateSubtitleBlocksByParagraphs(blocks, mode, options) {
  const paragraphs = buildSubtitleTranslationParagraphs(blocks);
  if (!paragraphs.length) return null;
  const outputs = Array(blocks.length).fill("");
  const batchSize = 8;
  for (let start = 0; start < paragraphs.length; start += batchSize) {
    const batch = paragraphs.slice(start, start + batchSize);
    const translatedParagraphs = await requestParagraphBatchTranslation(batch, mode, options);
    if (!translatedParagraphs || translatedParagraphs.length !== batch.length) return null;
    for (let index = 0; index < batch.length; index += 1) {
      const paragraph = batch[index];
      let translated = translatedParagraphs[index] || "";
      if (mode === "en" && englishSubtitleStillLooksChinese(translated)) {
        translated = await retryOneParagraphTranslation(paragraph, mode, options) || translated;
      }
      if (mode === "en" && englishSubtitleStillLooksChinese(translated)) return null;
      const pieces = splitTranslatedParagraphForBlocks(translated, paragraph.blockIndexes.length, mode);
      paragraph.blockIndexes.forEach((blockIndex, pieceIndex) => {
        outputs[blockIndex] = pieces[pieceIndex] || "";
      });
    }
  }
  blocks.forEach((block, index) => {
    if (!outputs[index]) outputs[index] = block.textLines.join("\n").trim();
  });
  return outputs;
}

/**
 * @param {Buffer} buffer
 * @param {{ cloudActive?: boolean, cloudApiKey?: string, cloudBaseUrl?: string, cloudModel?: string, signal?: AbortSignal }} options
 * @returns {Promise<{ enSrt: string, twSrt: string, blockCount: number }>}
 */
async function translateSrtToEnglishAndTaiwanSrt(buffer, options) {
  const rawText = decodePlainTextBuffer(buffer);
  const blocks = parseSrtBlocks(rawText);
  if (!blocks.length) {
    throw new Error("SRT parse failed: no valid subtitle blocks were found.");
  }
  const enTexts = await translateSubtitleBlocks(blocks, "en", options);
  const twTexts = await translateSubtitleBlocks(blocks, "tw", options);
  if (enTexts.length !== blocks.length || twTexts.length !== blocks.length) {
    throw new Error("Subtitle translation failed: output block count mismatch.");
  }
  return {
    enSrt: buildSrtFromBlocks(blocks, enTexts),
    twSrt: buildSrtFromBlocks(blocks, twTexts),
    blockCount: blocks.length,
  };
}

module.exports = {
  extractSrtText,
  parseSrtBlocks,
  buildTranscriptParagraphsFromSrtBlocks,
  buildSrtFromBlocks,
  sanitizeModelJsonText,
  englishSubtitleTooLong,
  requestSubtitleBatchTranslation,
  translateSubtitleBlocks,
  translateSrtToEnglishAndTaiwanSrt,
};
