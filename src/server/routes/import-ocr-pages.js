// POST /api/import-ocr-pages
//
// Prepares page images for browser-side OCR engines such as PaddleOCR Tiny.
// The server renders PDFs/iWork previews; the browser performs recognition.

"use strict";

const { readJsonBody, requestSignal, sendJson } = require("../lib/http.js");
const { importExtension } = require("../importers/shared.js");
const { renderPdfOcrImages } = require("../importers/pdf.js");
const { renderIworkOcrImages } = require("../importers/iwork.js");

const importOcrPagesJsonMaxBytes = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_IMPORT_OCR_PAGES_JSON_MAX_BYTES || 80 * 1024 * 1024)
);

function encodePage(page) {
  return {
    pageNumber: page.pageNumber,
    mimeType: page.mimeType || "image/png",
    data: Buffer.from(page.buffer).toString("base64"),
  };
}

async function prepareOcrPages(name, mimeType, buffer) {
  const ext = importExtension(name);
  if (ext === ".pdf" || mimeType === "application/pdf") {
    return renderPdfOcrImages(buffer);
  }
  if (ext === ".pages") {
    return renderIworkOcrImages(buffer, "pages");
  }
  if (ext === ".numbers" || mimeType === "application/vnd.apple.numbers") {
    return renderIworkOcrImages(buffer, "numbers");
  }
  if (ext === ".key" || mimeType === "application/vnd.apple.keynote") {
    return renderIworkOcrImages(buffer, "keynote");
  }
  throw new Error("PaddleOCR page rendering supports PDF, Pages, Numbers, and Keynote files.");
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleImportOcrPages(req, res) {
  const signal = requestSignal(req, res);
  try {
    const body = await readJsonBody(req, { limitBytes: importOcrPagesJsonMaxBytes });
    if (signal.aborted) return;

    const name = String(body.name || "Untitled");
    const mimeType = String(body.type || "");
    const buffer = Buffer.from(String(body.data || ""), "base64");
    const result = await prepareOcrPages(name, mimeType, buffer);
    if (signal.aborted) return;

    sendJson(res, 200, {
      text: "text" in result && typeof result.text === "string" ? result.text : "",
      pages: Array.isArray(result.pages) ? result.pages.map(encodePage) : [],
      pageCount: Number(result.pageCount) || 0,
      truncated: !!result.truncated,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "OCR page rendering failed",
      detail: error?.message || String(error),
    });
  }
}

module.exports = {
  handleImportOcrPages,
  prepareOcrPages,
};
