"use strict";

const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFile } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");
const { cleanImportedText, decodeUtf16BE } = require("./shared.js");
const { getCanvas, extractImageText } = require("./image-ocr.js");

const execFileAsync = promisify(execFile);
const pdfOcrMaxBytes = 40 * 1024 * 1024;
const pdfMaxInflatedStreamBytes = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_PDF_MAX_STREAM_BYTES || 8 * 1024 * 1024)
);
const pdfOcrMaxPages = Math.max(1, Number(process.env.AI_SYSTEM6_PDF_OCR_MAX_PAGES || 12));
const pdfOcrLongEdge = Math.max(1000, Number(process.env.AI_SYSTEM6_PDF_OCR_LONG_EDGE || 1800));
const pdfImageOcrMode = String(process.env.AI_SYSTEM6_PDF_IMAGE_OCR || "auto").toLowerCase();
const pdfImageOcrMaxPages = Math.max(0, Number(process.env.AI_SYSTEM6_PDF_IMAGE_OCR_MAX_PAGES || 6));
const pdfImageOcrAutoMaxDocumentPages = Math.max(1, Number(process.env.AI_SYSTEM6_PDF_IMAGE_OCR_AUTO_MAX_DOCUMENT_PAGES || 80));
const pdfImageOcrMinTextChars = Math.max(0, Number(process.env.AI_SYSTEM6_PDF_IMAGE_OCR_MIN_TEXT_CHARS || 120));

let pdfJsPromise = null;

function decodePdfString(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodePdfLiteralBytes(value) {
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      bytes.push(value.charCodeAt(index) & 0xff);
      continue;
    }

    const next = value[index + 1];
    if (next === undefined) break;
    if (next === "n") bytes.push(0x0a);
    else if (next === "r") bytes.push(0x0d);
    else if (next === "t") bytes.push(0x09);
    else if (next === "b") bytes.push(0x08);
    else if (next === "f") bytes.push(0x0c);
    else if (/[0-7]/.test(next)) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] || next;
      bytes.push(Number.parseInt(octal, 8) & 0xff);
      index += octal.length - 1;
    } else if (next === "\r" && value[index + 2] === "\n") {
      index += 2;
      continue;
    } else if (next === "\n" || next === "\r") {
      index += 1;
      continue;
    } else {
      bytes.push(next.charCodeAt(0) & 0xff);
    }
    index += 1;
  }
  return Buffer.from(bytes);
}

function decodePdfHexBytes(value) {
  const clean = value.replace(/\s+/g, "");
  return Buffer.from(clean.length % 2 ? `${clean}0` : clean, "hex");
}

function decodePdfUnicodeHex(value) {
  const buffer = decodePdfHexBytes(value);
  return decodeUtf16BE(buffer);
}

function incrementHexUnicode(value, offset) {
  const code = Number.parseInt(value, 16) + offset;
  return code.toString(16).padStart(value.length, "0");
}

function parsePdfCMap(cmapText) {
  const map = new Map();
  const linePattern = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>(?:\s*(?:<([0-9a-fA-F]+)>|\[([^\]]+)\]))?/g;
  let match;

  while ((match = linePattern.exec(cmapText))) {
    const start = match[1].toLowerCase();
    const end = match[2].toLowerCase();
    const target = match[3];
    const targetArray = match[4];
    const startCode = Number.parseInt(start, 16);
    const endCode = Number.parseInt(end, 16);
    if (!Number.isFinite(startCode) || !Number.isFinite(endCode)) continue;

    if (targetArray) {
      const values = [...targetArray.matchAll(/<([0-9a-fA-F]+)>/g)].map((item) => item[1]);
      values.forEach((hex, index) => {
        map.set((startCode + index).toString(16).padStart(start.length, "0"), decodePdfUnicodeHex(hex));
      });
    } else if (target) {
      for (let code = startCode; code <= endCode; code += 1) {
        const source = code.toString(16).padStart(start.length, "0");
        map.set(source, decodePdfUnicodeHex(incrementHexUnicode(target, code - startCode)));
      }
    }
  }

  return map;
}

function decodePdfStreamObject(body) {
  const streamIndex = body.indexOf("stream");
  const endIndex = body.indexOf("endstream", streamIndex);
  if (streamIndex < 0 || endIndex < 0) return "";

  let dataStart = streamIndex + "stream".length;
  if (body[dataStart] === "\r" && body[dataStart + 1] === "\n") dataStart += 2;
  else if (body[dataStart] === "\n" || body[dataStart] === "\r") dataStart += 1;

  let dataEnd = endIndex;
  if (body[dataEnd - 2] === "\r" && body[dataEnd - 1] === "\n") dataEnd -= 2;
  else if (body[dataEnd - 1] === "\n" || body[dataEnd - 1] === "\r") dataEnd -= 1;

  const raw = Buffer.from(body.slice(dataStart, dataEnd), "latin1");
  try {
    return zlib.inflateSync(raw, {
      maxOutputLength: pdfMaxInflatedStreamBytes,
    }).toString("latin1");
  } catch {
    return raw.toString("latin1");
  }
}

function parsePdfObjects(buffer) {
  const latin = buffer.toString("latin1");
  const objects = new Map();
  const objectPattern = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let match;
  while ((match = objectPattern.exec(latin))) {
    objects.set(match[1], match[3]);
  }
  return objects;
}

function buildPdfFontCMaps(objects) {
  const fontRefs = new Map();
  for (const body of objects.values()) {
    const fontDictPattern = /\/Font\s*<<([\s\S]*?)>>/g;
    let dictMatch;
    while ((dictMatch = fontDictPattern.exec(body))) {
      const entryPattern = /\/([A-Za-z0-9_.-]+)\s+(\d+)\s+\d+\s+R/g;
      let entryMatch;
      while ((entryMatch = entryPattern.exec(dictMatch[1]))) {
        if (!fontRefs.has(entryMatch[1])) fontRefs.set(entryMatch[1], entryMatch[2]);
      }
    }
  }

  const fontCMaps = new Map();
  for (const [name, objectId] of fontRefs.entries()) {
    const fontBody = objects.get(objectId) || "";
    const toUnicodeRef = fontBody.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)?.[1];
    if (!toUnicodeRef) continue;
    const cmapStream = decodePdfStreamObject(objects.get(toUnicodeRef) || "");
    const cmap = parsePdfCMap(cmapStream);
    if (cmap.size) fontCMaps.set(name, cmap);
  }
  return fontCMaps;
}

function translatePdfBytes(bytes, cmap) {
  if (!cmap || !cmap.size) return bytes.toString("latin1");

  let output = "";
  for (let index = 0; index < bytes.length;) {
    let translated = "";
    let consumed = 0;
    const maxBytes = Math.min(4, bytes.length - index);
    for (let size = maxBytes; size >= 1; size -= 1) {
      const key = bytes.subarray(index, index + size).toString("hex");
      if (cmap.has(key)) {
        translated = cmap.get(key);
        consumed = size;
        break;
      }
    }
    if (consumed) {
      output += translated;
      index += consumed;
    } else {
      output += String.fromCharCode(bytes[index]);
      index += 1;
    }
  }
  return output;
}

function normalizePdfText(value) {
  return cleanImportedText(String(value || "").replace(/[\u2F00-\u2FDF]/g, (char) => char.normalize("NFKC")));
}

function isLikelyMojibakePdfText(value) {
  const text = String(value || "");
  if (text.length < 200) return false;
  const c1Controls = text.match(/[\u0080-\u009f]/g)?.length || 0;
  const c0Controls = text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)?.length || 0;
  const replacement = text.match(/\uFFFD/g)?.length || 0;
  let expected = 0;
  let suspiciousLetters = 0;

  for (const char of text) {
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Latin}\p{N}]/u.test(char)) {
      expected += 1;
    } else if (/\p{L}/u.test(char)) {
      suspiciousLetters += 1;
    }
  }

  if ((c0Controls + c1Controls + replacement) / text.length > 0.01) return true;
  return suspiciousLetters > 20 && suspiciousLetters > expected * 0.25;
}

function extractTextFromPdfStream(streamText, fontCMaps = new Map()) {
  const parts = [];
  let currentFont = "";
  const tokenPattern = /\/([A-Za-z0-9_.-]+)\s+[-+]?\d*\.?\d+\s+Tf|\((?:\\.|[^\\)])*\)\s*Tj|<([0-9a-fA-F\s]+)>\s*Tj|\[((?:.|\n)*?)\]\s*TJ/g;
  let match;

  while ((match = tokenPattern.exec(streamText))) {
    if (match[1]) {
      currentFont = match[1];
      continue;
    }

    const cmap = fontCMaps.get(currentFont);
    if (match[0].endsWith("Tj") && match[0].startsWith("(")) {
      const literal = match[0].replace(/\s*Tj$/, "").slice(1, -1);
      parts.push(translatePdfBytes(decodePdfLiteralBytes(literal), cmap));
    } else if (match[2]) {
      parts.push(translatePdfBytes(decodePdfHexBytes(match[2]), cmap));
    } else if (match[3]) {
      const segment = match[3];
      const strings = [];
      const itemPattern = /\((?:\\.|[^\\)])*\)|<([0-9a-fA-F\s]+)>/g;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(segment))) {
        if (itemMatch[0].startsWith("(")) {
          strings.push(translatePdfBytes(decodePdfLiteralBytes(itemMatch[0].slice(1, -1)), cmap));
        } else if (itemMatch[1]) {
          strings.push(translatePdfBytes(decodePdfHexBytes(itemMatch[1]), cmap));
        }
      }
      if (strings.length) parts.push(strings.join(""));
    }
  }

  return parts.join("\n");
}

function pdfReadableCharCount(text) {
  return cleanImportedText(text).match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
}

function isLikelyUsefulPdfLayerText(text, pageCount = 1) {
  const value = cleanImportedText(text);
  const readable = pdfReadableCharCount(value);
  const expectedPages = Math.max(1, Number(pageCount) || 1);
  const minimumReadable = expectedPages > 1 ? Math.min(160, expectedPages * 40) : 12;
  if (readable < 12) return false;
  if (readable < minimumReadable) return false;
  if (readable / Math.max(value.length, 1) < 0.2) return false;
  return true;
}

function extractPdfTextLayer(buffer) {
  const latin = buffer.toString("latin1");
  const objects = parsePdfObjects(buffer);
  const fontCMaps = buildPdfFontCMaps(objects);
  const chunks = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;

  while ((match = streamPattern.exec(latin))) {
    const start = match.index + match[0].indexOf(match[1]);
    const raw = buffer.subarray(start, start + match[1].length);
    let text = "";
    try {
      text = zlib.inflateSync(raw, {
        maxOutputLength: pdfMaxInflatedStreamBytes,
      }).toString("latin1");
    } catch {
      text = raw.toString("latin1");
    }
    const extracted = extractTextFromPdfStream(text, fontCMaps);
    if (extracted.trim()) chunks.push(extracted);
  }

  const fallback = chunks.length ? chunks.join("\n\n") : latin.match(/\((?:\\.|[^\\)]){2,}\)/g)?.map((item) => decodePdfString(item.slice(1, -1))).join("\n") || "";
  const cleaned = normalizePdfText(fallback.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n"));
  if (!cleaned || !isLikelyUsefulPdfLayerText(cleaned)) {
    throw new Error("Could not extract enough readable text from this PDF.");
  }
  if (isLikelyMojibakePdfText(cleaned)) {
    throw new Error("This PDF text layer could not be decoded cleanly. Use HTML/WebArchive, DOCX, or OCR before adding it to File Disk.");
  }
  return cleaned;
}

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfJsPromise;
}

// pdfjs 6 no longer guesses where its packaged standard fonts live when it
// runs under Node; hand it the installed directory so font-dependent pages
// keep extracting and rendering at full fidelity.
function pdfJsStandardFontDataUrl() {
  const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return pathToFileURL(path.join(packageRoot, "standard_fonts") + path.sep).href;
}

function makePdfJsData(buffer) {
  return new Uint8Array(buffer);
}

function pdfJsTextItemsToText(items = []) {
  const positioned = [];
  const unpositioned = [];

  for (const item of items) {
    const text = String(item?.str || "").trim();
    if (!text) continue;

    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4]);
    const y = Number(transform[5]);
    const height = Math.max(4, Number(item.height || 0));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      positioned.push({ text, x, y, height, hasEOL: !!item.hasEOL });
    } else {
      unpositioned.push(text);
    }
  }

  if (!positioned.length) return unpositioned.join("\n");

  const sorted = positioned.sort((a, b) => {
    const lineThreshold = Math.max(a.height, b.height) * 0.6;
    if (Math.abs(a.y - b.y) > lineThreshold) return b.y - a.y;
    return a.x - b.x;
  });

  const lines = [];
  let currentText = [];
  let lineY = sorted[0]?.y ?? 0;
  let lineMaxHeight = sorted[0]?.height ?? 0;
  let lastX = 0;

  for (const item of sorted) {
    const lineThreshold = Math.max(4, item.height * 0.7);
    if (currentText.length && (Math.abs(item.y - lineY) > lineThreshold || item.x < lastX - 18)) {
      lines.push({ text: currentText.join(" "), y: lineY, height: lineMaxHeight });
      currentText = [];
      lineMaxHeight = 0;
    }
    currentText.push(item.text);
    lineY = currentText.length === 1 ? item.y : lineY;
    lineMaxHeight = Math.max(lineMaxHeight, item.height);
    lastX = item.x;
    if (item.hasEOL && currentText.length) {
      lines.push({ text: currentText.join(" "), y: lineY, height: lineMaxHeight });
      currentText = [];
      lineMaxHeight = 0;
    }
  }
  if (currentText.length) {
    lines.push({ text: currentText.join(" "), y: lineY, height: lineMaxHeight });
  }

  if (!lines.length) return unpositioned.join("\n\n");

  const heights = lines.map((line) => line.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 10;
  const outputBlocks = [];
  let currentParagraph = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];
    const text = line.text.trim();
    const isHeader = line.height >= medianHeight * 1.25 && text.length < 80;
    const isListStart = /^[-•*]\s|^\d+\.\s/.test(text);

    if (isHeader) {
      if (currentParagraph.length) {
        outputBlocks.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      const level = line.height >= medianHeight * 1.5 ? 1 : 2;
      outputBlocks.push(`${"#".repeat(level)} ${text}`);
      continue;
    }

    if (isListStart) {
      if (currentParagraph.length) {
        outputBlocks.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      outputBlocks.push(text);
      continue;
    }

    currentParagraph.push(text);
    let isBreak = false;
    if (nextLine) {
      const gap = Math.abs(line.y - nextLine.y);
      if (gap > line.height * 1.8) {
        isBreak = true;
      } else {
        const endsWithPunct = /[.!?。！？\uFF0C\u3002]$/.test(text);
        if (endsWithPunct && gap > line.height * 1.3) {
          isBreak = true;
        }
      }
    } else {
      isBreak = true;
    }

    if (isBreak) {
      let paragraphText = "";
      for (let i = 0; i < currentParagraph.length; i++) {
        const segment = currentParagraph[i];
        if (i === 0) {
          paragraphText = segment;
        } else {
          const prevSegment = currentParagraph[i - 1];
          const prevIsChinese = /[\u4e00-\u9fa5]$/.test(prevSegment);
          const curIsChinese = /^[\u4e00-\u9fa5]/.test(segment);
          if (prevIsChinese && curIsChinese) {
            paragraphText += segment;
          } else {
            paragraphText += " " + segment;
          }
        }
      }
      outputBlocks.push(paragraphText);
      currentParagraph = [];
    }
  }

  return [...outputBlocks, ...unpositioned].join("\n\n");
}

function pdfImageOperatorValues(pdfjsLib) {
  const ops = pdfjsLib?.OPS || {};
  return new Set([
    ops.paintImageXObject,
    ops.paintInlineImageXObject,
    ops.paintImageXObjectRepeat,
    ops.paintInlineImageXObjectGroup,
    ops.paintImageMaskXObject,
    ops.paintImageMaskXObjectGroup,
    ops.paintImageMaskXObjectRepeat,
  ].filter((value) => Number.isFinite(value)));
}

async function pageHasPdfImages(pdfjsLib, page) {
  try {
    const imageOps = pdfImageOperatorValues(pdfjsLib);
    if (!imageOps.size) return false;
    const operatorList = await page.getOperatorList();
    return Array.isArray(operatorList?.fnArray) && operatorList.fnArray.some((fn) => imageOps.has(fn));
  } catch {
    return false;
  }
}

function shouldOcrPdfImagePage(summary, pageCount, selectedCount) {
  if (!summary?.hasImages) return false;
  if (pdfImageOcrMaxPages <= 0 || selectedCount >= pdfImageOcrMaxPages) return false;
  if (pdfImageOcrMode === "off" || pdfImageOcrMode === "false" || pdfImageOcrMode === "0") return false;
  if (pdfImageOcrMode === "always" || pdfImageOcrMode === "full" || pdfImageOcrMode === "deep") return true;

  const readable = pdfReadableCharCount(summary.text);
  if (readable < pdfImageOcrMinTextChars) return true;
  return pageCount <= Math.min(pdfImageOcrMaxPages, 6);
}

function compactDuplicateText(value) {
  return String(value || "")
    .replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function isLikelyDuplicateOcrText(ocrText, pageText) {
  const ocr = compactDuplicateText(ocrText);
  const text = compactDuplicateText(pageText);
  if (ocr.length < 40 || text.length < 40) return false;
  return text.includes(ocr) || ocr.includes(text);
}

async function extractPdfTextLayerWithPdfJs(buffer, options = {}) {
  const pdfjsLib = await getPdfJs();
  const loadingTask = pdfjsLib.getDocument({
    data: makePdfJsData(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: pdfJsStandardFontDataUrl(),
  });
  const document = await loadingTask.promise;
  const pages = [];
  const pageSummaries = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent({ includeMarkedContent: false });
        const text = pdfJsTextItemsToText(content.items);
        const hasImages = await pageHasPdfImages(pdfjsLib, page);
        if (text.trim()) pages.push(text);
        pageSummaries.push({ pageNumber, text, hasImages });
      } finally {
        page.cleanup?.();
      }
    }

    const cleaned = normalizePdfText(pages.join("\n\n"));
    if (!cleaned || !isLikelyUsefulPdfLayerText(cleaned, document.numPages)) {
      throw new Error("PDF.js could not extract enough readable text from this PDF.");
    }
    if (isLikelyMojibakePdfText(cleaned)) {
      throw new Error("PDF.js extracted text looks garbled.");
    }
    return await appendPdfImageOcrSupplement(buffer, cleaned, pageSummaries, document.numPages, options);
  } finally {
    await document.destroy?.();
  }
}

async function getPdfPageCount(buffer) {
  const pdfjsLib = await getPdfJs();
  const loadingTask = pdfjsLib.getDocument({
    data: makePdfJsData(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: pdfJsStandardFontDataUrl(),
  });
  const document = await loadingTask.promise;
  try {
    return document.numPages || 0;
  } finally {
    await document.destroy?.();
  }
}

function makeNodeCanvasFactory(createCanvas) {
  return {
    create(width, height) {
      if (width <= 0 || height <= 0) {
        throw new Error("Invalid PDF page size.");
      }
      const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
      return {
        canvas,
        context: canvas.getContext("2d"),
      };
    },
    reset(target, width, height) {
      if (!target?.canvas || width <= 0 || height <= 0) {
        throw new Error("Invalid PDF page size.");
      }
      target.canvas.width = Math.ceil(width);
      target.canvas.height = Math.ceil(height);
    },
    destroy(target) {
      if (!target?.canvas) return;
      target.canvas.width = 0;
      target.canvas.height = 0;
      target.canvas = null;
      target.context = null;
    },
  };
}

async function renderPdfPagesWithPdfJs(buffer, options = {}) {
  const [pdfjsLib, canvasModule] = await Promise.all([getPdfJs(), getCanvas()]);
  const canvasFactory = makeNodeCanvasFactory(canvasModule.createCanvas);
  const loadingTask = pdfjsLib.getDocument({
    data: makePdfJsData(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: pdfJsStandardFontDataUrl(),
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages || 0;
  const requestedPageNumbers = Array.isArray(options.pageNumbers)
    ? options.pageNumbers
      .map((pageNumber) => Number(pageNumber))
      .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount)
    : null;
  const pageNumbers = requestedPageNumbers?.length
    ? [...new Set(requestedPageNumbers)]
    : Array.from({ length: Math.min(pageCount, pdfOcrMaxPages) }, (_, index) => index + 1);
  const pages = [];

  try {
    for (const pageNumber of pageNumbers) {
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const baseLongEdge = Math.max(baseViewport.width, baseViewport.height, 1);
      const scale = Math.max(1, Math.min(2.4, pdfOcrLongEdge / baseLongEdge));
      const viewport = page.getViewport({ scale });
      const target = canvasFactory.create(viewport.width, viewport.height);

      try {
        target.context.save();
        target.context.fillStyle = "#ffffff";
        target.context.fillRect(0, 0, target.canvas.width, target.canvas.height);
        target.context.restore();
        await page.render({
          canvasContext: target.context,
          viewport,
          canvasFactory,
          background: "white",
        }).promise;
        pages.push({
          pageNumber,
          buffer: target.canvas.toBuffer("image/png"),
        });
      } finally {
        page.cleanup?.();
        canvasFactory.destroy(target);
      }
    }
  } finally {
    await document.destroy?.();
  }

  return {
    pages,
    pageCount,
    truncated: requestedPageNumbers?.length ? requestedPageNumbers.length > pageNumbers.length : pageCount > pageNumbers.length,
  };
}

async function renderPdfOcrImages(buffer, options = {}) {
  if (buffer.length > pdfOcrMaxBytes) {
    throw new Error("This PDF is too large for local PDF OCR. Split it or import a smaller file.");
  }

  if (process.platform === "darwin" && options.quickLook && !options.pageNumbers?.length) {
    try {
      const quickLookPages = await renderPdfQuickLookPreview(buffer);
      if (quickLookPages.length) {
        return {
          pages: quickLookPages.map((page) => ({
            pageNumber: page.pageNumber,
            mimeType: "image/png",
            buffer: page.buffer,
          })),
          pageCount: quickLookPages.length,
          truncated: false,
        };
      }
    } catch {
      // Fall through to PDF.js rendering.
    }
  }

  const rendered = await renderPdfPagesWithPdfJs(buffer, options);
  return {
    ...rendered,
    pages: rendered.pages.map((page) => ({
      pageNumber: page.pageNumber,
      mimeType: "image/png",
      buffer: page.buffer,
    })),
  };
}

function quickLookPreviewFiles(outputDir) {
  try {
    return fsSync.readdirSync(outputDir)
      .map((entry) => path.join(outputDir, entry))
      .filter((entryPath) => /\.(png|jpe?g)$/i.test(entryPath))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function renderPdfQuickLookPreview(buffer) {
  if (process.platform !== "darwin") return [];

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-system6-pdf-quicklook-"));
  const inputPath = path.join(tempDir, "source.pdf");
  const outputDir = path.join(tempDir, "preview");

  try {
    await fs.mkdir(outputDir);
    await fs.writeFile(inputPath, buffer);
    await execFileAsync("qlmanage", ["-t", "-s", String(pdfOcrLongEdge), "-o", outputDir, inputPath], {
      timeout: 15000,
    });
    const files = quickLookPreviewFiles(outputDir);
    const firstPreview = files[0];
    if (!firstPreview) return [];
    return [{
      pageNumber: 1,
      buffer: await fs.readFile(firstPreview),
    }];
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function ocrRenderedPdfPages(pages, truncated = false, options = {}) {
  const texts = [];
  const errors = [];

  for (const page of pages) {
    try {
      const text = await extractImageText(page.buffer, "image/png", options);
      if (text.trim()) {
        texts.push(`第 ${page.pageNumber} 页\n${text}`);
      }
    } catch (error) {
      errors.push(`page ${page.pageNumber}: ${error.message}`);
    }
  }

  if (!texts.length) {
    throw new Error(errors.length ? errors.join("; ") : "No PDF pages were rendered for OCR.");
  }

  if (truncated) {
    texts.push(`PDF OCR 已在前 ${pdfOcrMaxPages} 页后停止。设置 AI_SYSTEM6_PDF_OCR_MAX_PAGES 可以导入更多页。`);
  }

  return cleanImportedText(texts.join("\n\n"));
}

async function appendPdfImageOcrSupplement(buffer, textLayerText, pageSummaries, pageCount, options = {}) {
  if (pdfImageOcrMaxPages <= 0 || buffer.length > pdfOcrMaxBytes) return textLayerText;
  if (pdfImageOcrMode === "off" || pdfImageOcrMode === "false" || pdfImageOcrMode === "0") return textLayerText;
  if (pdfImageOcrMode === "auto" && pageCount > pdfImageOcrAutoMaxDocumentPages) return textLayerText;

  const candidates = [];
  for (const summary of pageSummaries) {
    if (shouldOcrPdfImagePage(summary, pageCount, candidates.length)) {
      candidates.push(summary);
    }
  }
  if (!candidates.length) return textLayerText;

  try {
    const rendered = await renderPdfPagesWithPdfJs(buffer, {
      pageNumbers: candidates.map((summary) => summary.pageNumber),
    });
    const summaryByPage = new Map(pageSummaries.map((summary) => [summary.pageNumber, summary]));
    const supplements = [];

    for (const page of rendered.pages) {
      try {
        const ocrText = await extractImageText(page.buffer, "image/png", options);
        const pageText = summaryByPage.get(page.pageNumber)?.text || "";
        if (isLikelyDuplicateOcrText(ocrText, pageText)) continue;
        supplements.push(`第 ${page.pageNumber} 页图片 OCR\n${ocrText}`);
      } catch {
        // PDF image OCR is a supplement. Keep the text layer usable if OCR is noisy.
      }
    }

    if (!supplements.length) return textLayerText;
    if (pageSummaries.filter((summary) => summary.hasImages).length > candidates.length) {
      supplements.push(`图片 OCR 已自动限制在 ${candidates.length} 个含图片页面内。设置 AI_SYSTEM6_PDF_IMAGE_OCR=always 和 AI_SYSTEM6_PDF_IMAGE_OCR_MAX_PAGES 可加深扫描。`);
    }
    return cleanImportedText(`${textLayerText}\n\n图片 OCR 补充\n${supplements.join("\n\n")}`);
  } catch {
    return textLayerText;
  }
}

async function extractScannedPdfText(buffer, options = {}) {
  if (buffer.length > pdfOcrMaxBytes) {
    throw new Error("This PDF is too large for local PDF OCR. Split it or import a smaller file.");
  }

  let pageCount = 0;
  let pageCountError = null;
  try {
    pageCount = await getPdfPageCount(buffer);
  } catch (error) {
    pageCountError = error;
  }

  if (process.platform === "darwin" && pageCount === 1) {
    try {
      const quickLookPages = await renderPdfQuickLookPreview(buffer);
      if (quickLookPages.length) {
        return await ocrRenderedPdfPages(quickLookPages, false, options);
      }
    } catch {
      // Fall through to the cross-platform renderer.
    }
  }

  try {
    const rendered = await renderPdfPagesWithPdfJs(buffer);
    return await ocrRenderedPdfPages(rendered.pages, rendered.truncated, options);
  } catch (error) {
    if (pageCountError) {
      throw new Error(`PDF page rendering failed: ${pageCountError.message}; ${error.message}`);
    }
    throw new Error(`PDF page rendering failed: ${error.message}`);
  }
}

async function extractPdfText(buffer, options = {}) {
  let textLayerError = null;
  try {
    const textLayer = extractPdfTextLayer(buffer);
    if (pdfReadableCharCount(textLayer) < 160) {
      try {
        const pageCount = await getPdfPageCount(buffer);
        if (!isLikelyUsefulPdfLayerText(textLayer, pageCount)) {
          throw new Error("PDF text layer is too thin for the page count.");
        }
      } catch (error) {
        if (!/^PDF text layer is too thin/.test(error.message)) {
          return textLayer;
        }
        throw error;
      }
    }
    return textLayer;
  } catch (error) {
    textLayerError = error;
  }

  let pdfJsTextLayerError = null;
  try {
    return await extractPdfTextLayerWithPdfJs(buffer, options);
  } catch (error) {
    pdfJsTextLayerError = error;
  }

  try {
    return await extractScannedPdfText(buffer, options);
  } catch (ocrError) {
    throw new Error(`${textLayerError.message} PDF.js text extraction also failed: ${pdfJsTextLayerError.message}. PDF OCR also failed: ${ocrError.message}`);
  }
}

module.exports = {
  extractPdfText,
  extractPdfTextLayer,
  extractPdfTextLayerWithPdfJs,
  renderPdfOcrImages,
};
