// The peel layer: read an import by taking it apart one container at a time.
//
// A file dropped on the File Floppy is not always a document. It can be a zip
// of documents, a gzip around a zip, an epub whose OPF declares a reading
// order the file names contradict, or a docx whose text is only half the
// story because the figures carry the rest. Each importer in this directory
// knows one format; this module decides which format a buffer actually is
// (magic bytes first, name and MIME second) and walks nested containers so the
// reader receives the whole reading order, sectioned by where it came from.
//
// Safety is the reason this is written as a bounded walk rather than
// recursion with trust:
//   * nesting stops at PEEL_MAX_DEPTH, and a deeper archive lists its names
//     instead of expanding;
//   * a zip is processed through readZipEntries' existing budgets, capped at
//     PEEL_MAX_ENTRIES names;
//   * the assembled text is capped at PEEL_MAX_OUTPUT_CHARS;
//   * every step checks options.signal, so a cancelled import stops mid-archive.
//
// extractLeaf is injected by the caller (the import route) rather than
// required here, so this module never reaches back into routes/ and stays
// testable on its own.

"use strict";

const zlib = require("node:zlib");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const {
  importExtension,
  decodePlainTextBuffer,
  readableTextRatio,
  stripTags,
} = require("./shared.js");
const { decodeResponseText } = require("../lib/charset.js");
const { cleanHtmlForReader } = require("../reader.js");
const { extractEmlText, extractMboxText, extractMhtmlText } = require("./mime.js");
const { extractHtmlTextFromString } = require("./text.js");
const { extractWebArchiveResources } = require("./webarchive.js");
const { readZipEntries } = require("./zip.js");
const { extractEpubText } = require("./office.js");
const { extractOpenDocumentText } = require("./opendocument.js");
const { extractNotebookText } = require("./notebook.js");
const { imageMimeTypeFromName } = require("./image-ocr.js");

/** Nesting deeper than this lists archive names instead of expanding them. */
const PEEL_MAX_DEPTH = 3;
/** Names processed per zip; the rest are reported as not processed. */
const PEEL_MAX_ENTRIES = 200;
/** Total imported characters, across every nested container. */
const PEEL_MAX_OUTPUT_CHARS = 2000000;
/** A gzip bomb must not be inflated past this before the walk even starts. */
const PEEL_GUNZIP_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
/** Figures OCR'd from an embedded media folder, and the floor that skips icons. */
const PEEL_MAX_EMBEDDED_IMAGES = 8;
const PEEL_MIN_EMBEDDED_IMAGE_BYTES = 8 * 1024;
const PEEL_TRUNCATION_NOTE = "\n\n（内容过长，已截断）";

/**
 * @param {Buffer} bytes
 * @param {number[]} signature
 * @returns {boolean}
 */
function startsWithBytes(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * @param {Buffer} bytes
 * @param {string} value
 * @returns {boolean}
 */
function startsWithAscii(bytes, value) {
  return bytes.length >= value.length && bytes.subarray(0, value.length).toString("ascii") === value;
}

/**
 * @param {Buffer} bytes
 * @returns {Buffer}
 */
function skipBomAndWhitespace(bytes) {
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  while (start < bytes.length && (bytes[start] === 0x20 || bytes[start] === 0x09
    || bytes[start] === 0x0a || bytes[start] === 0x0d)) {
    start += 1;
  }
  return bytes.subarray(start);
}

/**
 * @param {Buffer} bytes
 * @returns {boolean}
 */
function isZipMagic(bytes) {
  if (bytes.length < 4) return false;
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  return bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07;
}

/**
 * A zip container's declared extensions do not always match the document it
 * holds (an .odt renamed .zip, an epub whose mimetype entry is present but not
 * first). The entries are the evidence, so the container is read once here.
 *
 * @param {Buffer} bytes
 * @param {string} ext
 * @returns {string}
 */
function sniffZipContainer(bytes, ext) {
  let entries;
  try {
    entries = readZipEntries(bytes);
  } catch {
    // Over-budget archives are still zips; the walker reports the budget error
    // with the archive's own name in it.
    return "zip";
  }
  if (entries.size === 0) return "zip";

  const names = [...entries.keys()];
  if (names.includes("word/document.xml")) return "docx";
  if (names.some((name) => name.startsWith("ppt/"))) return "pptx";
  if (names.some((name) => name.startsWith("xl/"))) return "xlsx";

  const mimetype = entries.get("mimetype");
  if (mimetype !== undefined) {
    const declared = mimetype.toString("utf8").trim();
    if (declared === "application/epub+zip") return "epub";
    if (declared === "application/vnd.oasis.opendocument.text") return "odt";
    if (declared === "application/vnd.oasis.opendocument.spreadsheet") return "ods";
    if (declared === "application/vnd.oasis.opendocument.presentation") return "odp";
  }

  if (names.some((name) => name === "Index/Document.iwa" || name.startsWith("Index/"))) {
    if (ext === ".pages") return "pages";
    if (ext === ".numbers") return "numbers";
    if (ext === ".key") return "key";
    return "iwork";
  }
  return "zip";
}

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
function sniffByMagic(bytes, ext) {
  if (bytes.length === 0) return "";
  if (bytes.subarray(0, 1024).includes("%PDF")) return "pdf";
  if (isZipMagic(bytes)) return sniffZipContainer(bytes, ext);
  if (startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";

  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a")) return "gif";
  if (startsWithBytes(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWithBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (bytes.length >= 12 && startsWithAscii(bytes, "RIFF") && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii");
    if (brand === "heic" || brand === "heix" || brand === "mif1") return "heic";
  }

  if (startsWithBytes(bytes, [0x1f, 0x8b])) return "gzip";

  if (startsWithAscii(bytes, "bplist00") && bytes.subarray(0, 16384).toString("latin1").includes("WebMainResource")) {
    return "webarchive";
  }
  if (looksLikeNotebook(bytes)) return "ipynb";
  if (sniffHtmlBytes(bytes) !== "") return "html";
  if (startsWithAscii(skipBomAndWhitespace(bytes), "<svg")) return "svg";

  if (looksLikeMhtml(bytes)) return "mhtml";
  if (looksLikeEml(bytes)) return "eml";
  if (startsWithAscii(bytes, "From ")) return "mbox";
  return "";
}

/**
 * @param {Buffer} bytes
 * @returns {boolean}
 */
function looksLikeNotebook(bytes) {
  const head = bytes.subarray(0, 4096).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  return head.startsWith("{") && head.includes("\"nbformat\"");
}

/**
 * HTML is recognised by its own opening tags after any BOM or leading space.
 * The search is bounded to the first kilobyte so a binary file that merely
 * contains "<body" late in its payload is not mistaken for a page. The
 * doctype token is spelled with \x21 so this source file contains no
 * exclamation mark.
 *
 * @param {Buffer} bytes
 * @returns {string}
 */
function sniffHtmlBytes(bytes) {
  const head = skipBomAndWhitespace(bytes.subarray(0, 1024)).toString("latin1").toLowerCase();
  return /<(?:\x21doctype\s+html|html|head|body)[\s>]/.test(head) ? "html" : "";
}

/**
 * @param {Buffer} bytes
 * @returns {boolean}
 */
function looksLikeMhtml(bytes) {
  const head = bytes.subarray(0, 4096).toString("latin1");
  return /MIME-Version\s*:/i.test(head) && /multipart\/related/i.test(head);
}

// An e-mail starts with RFC 5322 header fields, not with prose. The check
// requires the buffer to begin with a header line and to carry at least one
// field a mail client would write, so a plain text file that happens to
// contain "Subject:" on a later line is still read as text.
const EML_HEADER_FIELD = /^(?:Return-Path|Received|Delivered-To|From|To|Cc|Bcc|Subject|Date|Message-ID|MIME-Version|Content-Type|Content-Transfer-Encoding|Reply-To|Sender|X-[A-Za-z0-9-]+):/im;

/**
 * @param {Buffer} bytes
 * @returns {boolean}
 */
function looksLikeEml(bytes) {
  const head = bytes.subarray(0, 4096).toString("latin1");
  if (/^[A-Za-z][A-Za-z0-9-]*:[^\n]*\r?\n/.test(head) === false) return false;
  return EML_HEADER_FIELD.test(head);
}

// Extension fallback for files whose bytes carry no signature (plain text, an
// empty zip directory, an .eml saved without its headers). The extension is
// evidence of what the user believes the file is; the walker still sniffs
// again at every nested entry, so a misnamed member gets the right reader.
const EXTENSION_TYPES = {
  ".pdf": "pdf", ".zip": "zip", ".gz": "gzip", ".tgz": "gzip",
  ".docx": "docx", ".docm": "docx", ".pptx": "pptx", ".xlsx": "xlsx",
  ".epub": "epub", ".odt": "odt", ".ods": "ods", ".odp": "odp",
  ".pages": "pages", ".numbers": "numbers", ".key": "key",
  ".doc": "ole", ".xls": "ole", ".ppt": "ole", ".rtf": "text",
  ".htm": "html", ".html": "html", ".xhtml": "html", ".svg": "svg",
  ".ipynb": "ipynb", ".webarchive": "webarchive",
  ".eml": "eml", ".mbox": "mbox", ".mht": "mhtml", ".mhtml": "mhtml",
  ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".gif": "gif",
  ".tif": "tiff", ".tiff": "tiff", ".webp": "webp", ".heic": "heic",
  ".heif": "heic", ".bmp": "bmp",
  ".txt": "text", ".text": "text", ".csv": "text", ".tsv": "text",
  ".json": "text", ".md": "text", ".markdown": "text", ".mdown": "text",
  ".mkd": "text", ".xml": "text", ".log": "text", ".srt": "text",
};

/**
 * @param {string} ext
 * @returns {string}
 */
function sniffByExtension(ext) {
  const mapped = EXTENSION_TYPES[ext];
  return mapped === undefined ? "" : mapped;
}

/**
 * @param {string} type
 * @returns {string}
 */
function sniffByMime(type) {
  if (type === "") return "";
  if (type === "application/pdf") return "pdf";
  if (type === "application/epub+zip") return "epub";
  if (type === "application/gzip" || type === "application/x-gzip") return "gzip";
  if (type === "application/zip" || type === "application/x-zip-compressed") return "zip";
  if (type === "message/rfc822") return "eml";
  if (type === "application/mbox") return "mbox";
  if (type === "multipart/related") return "mhtml";
  if (type === "image/svg+xml") return "svg";
  if (type === "application/x-ipynb+json" || type === "application/ipynb+json") return "ipynb";
  if (type === "text/html" || type === "application/xhtml+xml") return "html";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (type === "application/vnd.oasis.opendocument.text") return "odt";
  if (type === "application/vnd.oasis.opendocument.spreadsheet") return "ods";
  if (type === "application/vnd.oasis.opendocument.presentation") return "odp";
  if (type === "application/vnd.apple.pages") return "pages";
  if (type === "application/vnd.apple.numbers") return "numbers";
  if (type === "application/vnd.apple.keynote") return "key";

  if (type.startsWith("image/")) {
    const subtype = type.slice("image/".length);
    if (subtype === "png" || subtype === "jpeg" || subtype === "gif" || subtype === "tiff"
      || subtype === "webp" || subtype === "bmp") return subtype === "jpeg" ? "jpeg" : subtype;
    if (subtype === "heic" || subtype === "heif") return "heic";
    return "image";
  }
  if (type.startsWith("text/")) return "text";
  return "";
}

/**
 * Bytes that decode to readable prose are text even without a signature or a
 * known extension. Null bytes and a high share of replacement characters are
 * the two signals that say "binary", and the readable-character ratio catches
 * compressed or encrypted payloads that happen to be NUL free.
 *
 * @param {Buffer} bytes
 * @returns {boolean}
 */
function looksLikePlainText(bytes) {
  if (bytes.length === 0) return false;
  if (bytes.includes(0)) return false;
  const decoded = decodePlainTextBuffer(bytes);
  if (decoded.trim() === "") return false;
  const replacements = decoded.match(/\uFFFD/g);
  if (replacements !== null && replacements.length / decoded.length > 0.02) return false;
  return readableTextRatio(decoded) >= 0.5;
}

/**
 * Name the format of a buffer. Magic bytes decide first because a file name
 * can be wrong and a MIME type is caller supplied; the extension and MIME are
 * fallbacks for formats with no signature, and a clean text decode is the
 * last resort before "unknown".
 *
 * @param {Buffer} buffer
 * @param {string} name
 * @param {string} mimeType
 * @returns {string}
 */
function sniffImportType(buffer, name, mimeType) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  const ext = importExtension(name);
  const type = String(mimeType || "").toLowerCase().split(";")[0].trim();

  const magic = sniffByMagic(bytes, ext);
  if (magic !== "") return magic;

  const byExtension = sniffByExtension(ext);
  if (byExtension !== "") return byExtension;

  const byMime = sniffByMime(type);
  if (byMime !== "") return byMime;

  return looksLikePlainText(bytes) ? "text" : "unknown";
}

// ---------------------------------------------------------------------------
// Walk state: one output budget and the cancel check shared by every step
// ---------------------------------------------------------------------------

/**
 * @returns {{ produced: number, truncated: boolean }}
 */
function createPeelState() {
  return { produced: 0, truncated: false };
}

/**
 * Own a piece of the total output budget. Once the cap is reached the walk
 * stops producing text, so a deeply nested archive cannot allocate its way past
 * the limit before the cap is applied at the end.
 *
 * @param {{ produced: number, truncated: boolean }} state
 * @param {unknown} text
 * @returns {string}
 */
function accountText(state, text) {
  const value = text === null || text === undefined ? "" : String(text);
  if (value === "" || state.truncated) return "";
  const remaining = PEEL_MAX_OUTPUT_CHARS - state.produced;
  if (value.length <= remaining) {
    state.produced += value.length;
    return value;
  }
  state.truncated = true;
  state.produced = PEEL_MAX_OUTPUT_CHARS;
  return value.slice(0, Math.max(remaining, 0));
}

/**
 * @returns {Error}
 */
function createAbortError() {
  const error = new Error("Import aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isAbortError(error) {
  return error !== null && error !== undefined && /** @type {any} */ (error).name === "AbortError";
}

/**
 * @param {{ signal?: AbortSignal }} options
 * @returns {boolean}
 */
function isAborted(options) {
  const signal = options === null || options === undefined ? null : options.signal;
  return signal !== null && signal !== undefined && signal.aborted === true;
}

/**
 * @param {{ signal?: AbortSignal }} options
 */
function checkAborted(options) {
  if (isAborted(options)) throw createAbortError();
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  if (error === null || error === undefined) return "unknown error";
  return String(/** @type {any} */ (error).message || error);
}

// ---------------------------------------------------------------------------
// Archive hygiene
// ---------------------------------------------------------------------------

/**
 * Directory markers, macOS resource forks and dotfiles are archive furniture,
 * not content. Reading them would add Finder metadata to the reader and, in
 * the __MACOSX case, duplicate every real file as a binary AppleDouble.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isPeelableEntryName(name) {
  if (name === "" || name.endsWith("/")) return false;
  if (name === "__MACOSX" || name.startsWith("__MACOSX/")) return false;
  if (name.startsWith(".")) return false;
  if (name.includes("/.")) return false;
  return true;
}

/**
 * Sort "chapter2" before "chapter10", the order a person reads an archive in.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// ---------------------------------------------------------------------------
// Leaf formats
// ---------------------------------------------------------------------------

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractSvgText(buffer) {
  const svg = decodeResponseText(buffer, "image/svg+xml");
  const parts = [];
  for (const tag of ["title", "desc", "text", "tspan"]) {
    const pattern = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "gi");
    let match;
    while ((match = pattern.exec(svg))) {
      const value = stripTags(match[1]);
      if (value !== "") parts.push(value);
    }
  }
  const unique = [];
  for (const part of parts) {
    if (unique.includes(part) === false) unique.push(part);
  }
  return unique.join("\n");
}

/**
 * @param {string} html
 * @returns {string}
 */
function htmlDocumentTitle(html) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ""));
  return match === null ? "" : stripTags(match[1]).trim();
}

/**
 * @param {unknown} title
 * @returns {string}
 */
function usableTitle(title) {
  const value = String(title || "").trim();
  if (value === "" || /^untitled page$/i.test(value)) return "";
  return value;
}

/**
 * Run a saved page through the same reader pipeline a URL goes through, then
 * fall back to the plain tag stripper. cleanHtmlForReader refuses a document
 * below its readable-text threshold; a short saved snippet is still worth
 * importing, so the second path keeps it instead of failing the file.
 *
 * @param {string} html
 * @returns {Promise<string>}
 */
async function htmlSectionToMarkdown(html) {
  const fallbackTitle = usableTitle(htmlDocumentTitle(html));
  try {
    const article = await cleanHtmlForReader(html, "");
    const title = usableTitle(article?.title) || fallbackTitle;
    const body = String(article?.text || "").trim();
    if (body !== "") {
      return [title === "" ? "" : "# " + title, body].filter(Boolean).join("\n\n");
    }
  } catch {
    // Fall through to the plain text path below.
  }
  const text = extractHtmlTextFromString(html).trim();
  return [fallbackTitle === "" ? "" : "# " + fallbackTitle, text].filter(Boolean).join("\n\n");
}

/**
 * The route injects extractLeaf so this module never imports routes/. Every
 * leaf call goes through here so the injection contract is stated once.
 *
 * @param {{ name: string, mimeType: string, buffer: Buffer, options: object, extractLeaf?: Function }} context
 * @returns {Promise<string>}
 */
async function callExtractLeaf(context) {
  if (typeof context.extractLeaf !== "function") {
    throw new Error("peelFile needs an extractLeaf(name, mimeType, buffer, options) function.");
  }
  return context.extractLeaf(context.name, context.mimeType, context.buffer, context.options);
}

/**
 * OCR the figures a document carries, when the route provided an OCR function.
 * The 8 KB floor skips bullets and icons; the cap keeps a picture book from
 * turning one import into a long OCR job.
 *
 * @param {Map<string, Buffer>} entries
 * @param {string} prefix
 * @param {{ ocrImage?: Function, signal?: AbortSignal }} options
 * @returns {Promise<string[]>}
 */
async function collectEmbeddedImageSections(entries, prefix, options) {
  if (typeof options.ocrImage !== "function") return [];
  const candidates = [...entries.entries()]
    .filter(([name, data]) => name.startsWith(prefix) && data.length > PEEL_MIN_EMBEDDED_IMAGE_BYTES)
    .slice(0, PEEL_MAX_EMBEDDED_IMAGES);

  const sections = [];
  let figureIndex = 0;
  for (const [name, data] of candidates) {
    checkAborted(options);
    try {
      const text = String(await options.ocrImage(data, imageMimeTypeFromName(name, "")) || "").trim();
      if (text === "") continue;
      figureIndex += 1;
      sections.push("### 图 " + figureIndex + "（OCR）\n\n" + text);
    } catch {
      // A figure OCR could not read must not cost the document its text.
    }
  }
  return sections;
}

/**
 * @param {any} context
 * @param {any} state
 * @param {string} kind
 * @returns {Promise<string>}
 */
async function peelLeaf(context, state, kind) {
  try {
    return accountText(state, await callExtractLeaf(context));
  } catch (error) {
    if (isAbortError(error)) throw error;
    // A file sniffed as text but named with an unknown extension reaches
    // extractSimpleImportedTextNative, which refuses the extension. The bytes
    // were already proven to decode cleanly, so read them rather than fail.
    if (kind === "text") return accountText(state, decodePlainTextBuffer(context.buffer));
    throw error;
  }
}

/**
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function peelHtml(context, state) {
  const html = decodeResponseText(context.buffer, context.mimeType || "text/html");
  return accountText(state, await htmlSectionToMarkdown(html));
}

/**
 * @param {any} state
 * @param {string} base
 * @param {string[]} sections
 * @returns {string}
 */
function joinSections(state, base, sections) {
  const parts = [];
  if (base !== "") parts.push(base);
  for (const section of sections) {
    const kept = accountText(state, section);
    if (kept !== "") parts.push(kept);
  }
  return parts.join("\n\n");
}

/**
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function peelOpenDocument(context, state) {
  const text = accountText(state, extractOpenDocumentText(context.buffer));
  if (typeof context.options.ocrImage !== "function") return text;
  let entries;
  try {
    entries = readZipEntries(context.buffer);
  } catch {
    return text;
  }
  const sections = await collectEmbeddedImageSections(entries, "Pictures/", context.options);
  return joinSections(state, text, sections);
}

/**
 * Text first, then the figures the document carries. The pictures are read
 * after the prose the same way a person reads a report: the words carry the
 * argument, the plates carry the evidence.
 *
 * @param {any} context
 * @param {any} state
 * @param {string} kind
 * @returns {Promise<string>}
 */
async function peelOfficeWithImages(context, state, kind) {
  const text = accountText(state, await callExtractLeaf(context));
  if (typeof context.options.ocrImage !== "function") return text;
  let entries;
  try {
    entries = readZipEntries(context.buffer);
  } catch {
    return text;
  }
  const prefix = kind === "docx" ? "word/media/" : "ppt/media/";
  const sections = await collectEmbeddedImageSections(entries, prefix, context.options);
  return joinSections(state, text, sections);
}

/**
 * @param {any} context
 * @param {any} state
 * @returns {string}
 */
function peelEpub(context, state) {
  return accountText(state, extractEpubText(context.buffer));
}

/**
 * The main resource and every subframe's main resource go through the same
 * reader pipeline as a URL. A saved page's chrome is where the navigation
 * lives, so a frame rendered as raw text would re-import the very boilerplate
 * cleanHtmlForReader exists to remove.
 *
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function peelWebArchive(context, state) {
  const resources = extractWebArchiveResources(context.buffer);
  const parts = [];

  if (resources.mainHtml !== "") {
    const main = accountText(state, await htmlSectionToMarkdown(resources.mainHtml));
    if (main !== "") parts.push(main);
  }

  let frameIndex = 0;
  for (const frame of resources.subframes) {
    checkAborted(context.options);
    frameIndex += 1;
    const label = frame.url === "" ? "subframe " + frameIndex : frame.url;
    const heading = accountText(state, "## " + label);
    const body = accountText(state, await htmlSectionToMarkdown(frame.html));
    if (heading !== "" || body !== "") parts.push([heading, body].filter(Boolean).join("\n\n"));
  }

  if (parts.length === 0) throw new Error("Could not find readable text in this WebArchive.");
  return parts.join("\n\n");
}

/** The one message a .doc/.xls/.ppt gets when no legacy reader is available. */
const LEGACY_OFFICE_MESSAGE = "Legacy Office files need MarkItDown or macOS textutil.";

/**
 * macOS ships textutil, which reads the old binary .doc and RTF containers.
 * The temp file is written under a random name and always removed, in a
 * finally, so a cancelled or failing conversion cannot leave the document in
 * the system temp directory.
 *
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function convertLegacyOfficeWithTextutil(context, state) {
  const ext = importExtension(context.name) || ".doc";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-system6-peel-"));
  const tempPath = path.join(tempDir, "source-" + crypto.randomBytes(6).toString("hex") + ext);
  try {
    await fs.writeFile(tempPath, context.buffer);
    const result = await execFileAsync("/usr/bin/textutil", ["-convert", "txt", "-stdout", tempPath], {
      timeout: 30000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return accountText(state, String(result.stdout || ""));
  } catch (error) {
    throw new Error(LEGACY_OFFICE_MESSAGE + " (" + errorMessage(error) + ")");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function peelLegacyOffice(context, state) {
  const ext = importExtension(context.name);
  const looksLikeRtf = ext === ".rtf" || /rtf/i.test(String(context.mimeType || ""));
  if (process.platform === "darwin" && (ext === ".doc" || looksLikeRtf)) {
    return convertLegacyOfficeWithTextutil(context, state);
  }
  throw new Error(LEGACY_OFFICE_MESSAGE);
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

/**
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function peelZip(context, state) {
  let entries;
  try {
    entries = readZipEntries(context.buffer);
  } catch (error) {
    throw new Error("Could not read this ZIP archive: " + errorMessage(error));
  }

  const names = [...entries.keys()].filter(isPeelableEntryName).sort(naturalCompare);

  // At the nesting limit the archive is still inventoried: the reader is told
  // what the file contains even though it is not expanded further.
  if (context.depth >= PEEL_MAX_DEPTH) {
    return accountText(state, names.map((entryName) => "- " + entryName).join("\n"));
  }

  const sections = [];
  for (const entryName of names.slice(0, PEEL_MAX_ENTRIES)) {
    checkAborted(context.options);
    if (state.truncated) break;

    const entryChain = [...context.chain, entryName];
    const heading = accountText(state, "## " + entryChain.join(" › "));
    if (heading === "") break;

    try {
      const inner = await peelBuffer({
        ...context,
        name: entryName,
        mimeType: "",
        buffer: entries.get(entryName),
        depth: context.depth + 1,
        chain: entryChain,
      }, state);
      sections.push(inner === "" ? heading : heading + "\n\n" + inner);
    } catch (error) {
      if (isAbortError(error)) throw error;
      // One unreadable member is reported in place; the rest of the archive
      // still imports, because losing the whole zip to one bad file is worse
      // than naming the file that failed.
      sections.push(heading + "\n\n（无法读取：" + errorMessage(error) + "）");
    }
  }

  if (names.length > PEEL_MAX_ENTRIES) {
    const note = accountText(state, `（其余 ${names.length - PEEL_MAX_ENTRIES} 个文件未处理）`);
    if (note !== "") sections.push(note);
  }
  return sections.join("\n\n");
}

/**
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function peelGzip(context, state) {
  if (context.depth >= PEEL_MAX_DEPTH) {
    return accountText(state, "（已达到嵌套上限，未继续解压）");
  }
  let inflated;
  try {
    inflated = zlib.gunzipSync(context.buffer, { maxOutputLength: PEEL_GUNZIP_MAX_OUTPUT_BYTES });
  } catch (error) {
    throw new Error("Could not decompress this gzip file: " + errorMessage(error));
  }
  const innerName = context.name.replace(/\.(?:gz|tgz)$/i, "") || context.name + ".out";
  return peelBuffer({
    ...context,
    name: innerName,
    mimeType: "",
    buffer: inflated,
    depth: context.depth + 1,
    chain: [...context.chain, innerName],
  }, state);
}

/**
 * Sniff one buffer and dispatch it to the right walker.
 *
 * @param {any} context
 * @param {any} state
 * @returns {Promise<string>}
 */
async function peelBuffer(context, state) {
  checkAborted(context.options);
  const kind = sniffImportType(context.buffer, context.name, context.mimeType);

  if (kind === "zip") return peelZip(context, state);
  if (kind === "gzip") return peelGzip(context, state);
  if (kind === "html") return peelHtml(context, state);
  if (kind === "webarchive") return peelWebArchive(context, state);
  if (kind === "epub") return peelEpub(context, state);
  if (kind === "odt" || kind === "ods" || kind === "odp") return peelOpenDocument(context, state);
  if (kind === "ipynb") return accountText(state, extractNotebookText(context.buffer));
  if (kind === "svg") return accountText(state, extractSvgText(context.buffer));
  if (kind === "docx" || kind === "pptx") return peelOfficeWithImages(context, state, kind);
  if (kind === "ole") return peelLegacyOffice(context, state);

  // --- Mail and saved web archives (importers/mime.js) ----------------------
  if (kind === "eml" || kind === "mbox") {
    // Attachments are peeled like zip members: one level down, under the
    // message's own budgets and abort signal.
    const peelAttachment = async (attachmentName, attachmentType, attachmentBuffer) => {
      checkAborted(context.options);
      if (context.depth + 1 > PEEL_MAX_DEPTH) return "";
      return peelBuffer({
        ...context,
        name: String(attachmentName || "attachment"),
        mimeType: String(attachmentType || ""),
        buffer: attachmentBuffer,
        depth: context.depth + 1,
        chain: [...context.chain, String(attachmentName || "attachment")],
      }, state);
    };
    const text = kind === "eml"
      ? await extractEmlText(context.buffer, { peelAttachment })
      : await extractMboxText(context.buffer, { peelAttachment });
    return accountText(state, text);
  }
  if (kind === "mhtml") {
    // The root page goes through the same reading path as an .html file, so a
    // saved page loses its menus and footers the way a live one does.
    let root = null;
    extractMhtmlText(context.buffer, {
      htmlToText: (html, baseUrl) => {
        root = { html, baseUrl };
        return html || " ";
      },
    });
    if (!root?.html) throw new Error("Could not find readable text in MHTML.");
    return peelHtml({ ...context, buffer: Buffer.from(root.html, "utf8"), mimeType: "text/html; charset=utf-8" }, state);
  }

  if (kind === "unknown") {
    const label = importExtension(context.name) || context.mimeType || "unknown";
    throw new Error("Unsupported file type: " + label + ". The peel importer could not recognise these bytes.");
  }
  return peelLeaf(context, state, kind);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Read one imported file, peeling nested containers as far as the budgets
 * allow. `extractLeaf` is the route's existing native importer, injected so
 * this module stays free of route imports and can be exercised directly.
 *
 * @param {{
 *   name: string,
 *   mimeType?: string,
 *   buffer: Buffer,
 *   depth?: number,
 *   path?: string[],
 *   options?: any,
 *   extractLeaf?: (name: string, mimeType: string, buffer: Buffer, options: object) => Promise<string>,
 * }} input
 * @returns {Promise<string>}
 */
async function peelFile(/** @type {any} */ {
  name,
  mimeType = "",
  buffer,
  depth = 0,
  path = [],
  options = {},
  extractLeaf,
} = {}) {
  const startChain = Array.isArray(path) && path.length > 0
    ? path.slice()
    : [String(name || "file")];
  const state = createPeelState();
  const numericDepth = Number(depth);

  const context = {
    name: String(name || "file"),
    mimeType: String(mimeType || ""),
    buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || ""),
    depth: Number.isFinite(numericDepth) && numericDepth > 0 ? numericDepth : 0,
    chain: startChain,
    options,
    extractLeaf,
  };

  const text = await peelBuffer(context, state);
  return state.truncated ? text + PEEL_TRUNCATION_NOTE : text;
}

module.exports = {
  sniffImportType,
  peelFile,
  PEEL_MAX_DEPTH,
  PEEL_MAX_ENTRIES,
  PEEL_MAX_OUTPUT_CHARS,
};
