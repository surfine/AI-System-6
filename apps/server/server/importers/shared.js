// Shared importer utilities. These are copied from server-importers.js
// rather than reusing server/lib/text.js because the importer has a
// lighter `cleanText` transform that is part of the import contract.

"use strict";

const path = require("node:path");
const { TextDecoder } = require("node:util");
const { decodeHtml } = require("../lib/text.js");

/**
 * @param {string} name
 * @returns {string}
 */
function importExtension(name) {
  return path.extname(name || "").toLowerCase();
}

/**
 * @param {string} name
 * @returns {string}
 */
function safeTempExtension(name) {
  const ext = importExtension(name);
  return /^[a-z0-9.]{1,16}$/i.test(ext) ? ext : ".bin";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanImportedText(value) {
  return String(value || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stripXml(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeTextEncodingName(value) {
  const normalized = String(value || "utf-8").trim().toLowerCase().replace(/_/g, "-");
  const aliases = {
    "": "utf-8",
    unicode: "utf-16le",
    utf16: "utf-16le",
    "utf-16": "utf-16le",
    "utf-16be": "utf-16be",
    "utf-16le": "utf-16le",
    "iso-latin-1": "iso-8859-1",
    "latin-1": "iso-8859-1",
    macroman: "macintosh",
    "x-mac-roman": "macintosh",
  };
  return aliases[normalized] || normalized || "utf-8";
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function decodeUtf16BE(buffer) {
  const even = buffer.length % 2 === 0 ? buffer : buffer.subarray(0, buffer.length - 1);
  const swapped = Buffer.from(even);
  swapped.swap16();
  return swapped.toString("utf16le");
}

/**
 * @param {Buffer} buffer
 * @param {string} [encoding]
 * @returns {string}
 */
function decodeTextBuffer(buffer, encoding = "utf-8") {
  const label = normalizeTextEncodingName(encoding);
  if (label === "utf-16be") return decodeUtf16BE(buffer);

  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    if (label === "utf-16le") return buffer.toString("utf16le");
    if (/latin|8859|windows-1252/.test(label)) return buffer.toString("latin1");
    return buffer.toString("utf8");
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stripLeadingBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function decodePlainTextBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return stripLeadingBom(decodeTextBuffer(buffer.subarray(3), "utf-8"));
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripLeadingBom(decodeTextBuffer(buffer.subarray(2), "utf-16le"));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return stripLeadingBom(decodeTextBuffer(buffer.subarray(2), "utf-16be"));
  }

  try {
    return stripLeadingBom(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    try {
      return stripLeadingBom(new TextDecoder("gb18030").decode(buffer));
    } catch {
      return stripLeadingBom(buffer.toString("utf8"));
    }
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function readableTextRatio(value) {
  const text = String(value || "");
  if (!text.length) return 0;
  const readable = text.match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
  return readable / text.length;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function importedTextQualityScore(value) {
  const text = cleanImportedText(value);
  if (!text) return 0;

  const readable = text.match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
  const replacementCount = text.match(/\uFFFD/g)?.length || 0;
  const controlCount = text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)?.length || 0;
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const uniqueLineRatio = lines.length
    ? new Set(lines.map((line) => line.toLowerCase())).size / lines.length
    : 1;

  return readable
    + Math.min(text.length, 4000) * 0.08
    + Math.min(lines.length, 80) * 4
    + uniqueLineRatio * 80
    - replacementCount * 35
    - controlCount * 20;
}

module.exports = {
  importExtension,
  safeTempExtension,
  cleanImportedText,
  stripTags,
  stripXml,
  decodeUtf16BE,
  decodeTextBuffer,
  decodePlainTextBuffer,
  readableTextRatio,
  importedTextQualityScore,
};
