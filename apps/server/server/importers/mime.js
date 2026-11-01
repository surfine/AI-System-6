// MIME importer for email and web archives: .eml, .mbox, .mhtml/.mht.
//
// Mail is someone else's words, so the reader quotes the envelope headers
// verbatim and never rewrites the body. The only transforms applied are the
// ones MIME itself defines: transfer-encoding decode, charset decode, and
// encoded-word decode for subjects. Every parse decision is evidence driven.
// A 2005 Chinese mail client labels GBK bytes "gb2312" or omits the label
// entirely, and an archive replay stamps its own headers over legacy bytes, so
// a decode that produced replacement characters is retried as GB18030 instead
// of shipping mojibake to the reader.
//
// No third-party MIME parser is used: the grammar is small, the failure modes
// are known, and a dependency would still need auditing for the same edges.

"use strict";

const {
  decodeTextBuffer,
  decodePlainTextBuffer,
} = require("./shared.js");
const { extractHtmlTextFromString } = require("./text.js");

// Header heuristics read a prefix, not the whole file: an .eml dropped on the
// File Floppy can be hundreds of megabytes of base64, and sniffing it should
// not copy that.
const HEADER_PROBE_BYTES = 4 * 1024;

// Mailboxes are unbounded. The caps keep one import from turning into a
// multi-minute read, and the reader is told in the output what was left out.
const MIME_ATTACHMENT_LIMIT = 40;
const MBOX_MESSAGE_LIMIT = 500;

const MHTML_NOT_READABLE = "Could not find readable text in MHTML.";

/**
 * A leaf MIME entity, flattened out of any multipart/* nesting.
 *
 * @typedef {object} MimePart
 * @property {Map<string, string[]>} headers
 * @property {string} contentType Lowercased media type, e.g. "text/plain".
 * @property {string} charset Declared charset label, lowercased, or "".
 * @property {string} filename Decoded Content-Disposition filename or name.
 * @property {string} contentId Content-ID without angle brackets.
 * @property {string} contentLocation Content-Location, trimmed.
 * @property {string} disposition Lowercased Content-Disposition type.
 * @property {Buffer} body Transfer-encoded bytes as they appeared.
 */

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripAngles(value) {
  return String(value || "").trim().replace(/^<|>$/g, "").trim();
}

/**
 * @param {Map<string, string[]>} headers
 * @param {string} name
 * @returns {string[]}
 */
function headerValues(headers, name) {
  return headers.get(String(name).toLowerCase()) || [];
}

/**
 * @param {Map<string, string[]>} headers
 * @param {string} name
 * @returns {string}
 */
function firstHeader(headers, name) {
  const values = headerValues(headers, name);
  return values.length ? values[0] : "";
}

/**
 * Split on a separator that appears outside double quotes. Content-Type
 * parameters legally contain ';' inside quoted filenames, so a plain split
 * would cut a filename in half.
 *
 * @param {string} text
 * @param {string} separator
 * @returns {string[]}
 */
function splitTopLevel(text, separator) {
  const pieces = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "\"") {
      quoted = !quoted;
      current += ch;
      continue;
    }
    if (ch === separator && !quoted) {
      pieces.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  pieces.push(current);
  return pieces;
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  const text = String(value || "").trim();
  if (text.length >= 2 && text.startsWith("\"") && text.endsWith("\"")) {
    return text.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return text;
}

/**
 * Unfold RFC 5322 headers into a lowercased name to value-list Map. A folded
 * line keeps its leading whitespace, so an encoded-word pair split across a
 * fold stays separable when the words are later joined.
 *
 * @param {string} headerText
 * @returns {Map<string, string[]>}
 */
function parseHeaders(headerText) {
  const headers = new Map();
  let name = null;
  let value = "";

  const flush = () => {
    if (name === null) return;
    const key = name.toLowerCase();
    const list = headers.get(key);
    if (list) list.push(value.trim());
    else headers.set(key, [value.trim()]);
    name = null;
    value = "";
  };

  for (const line of String(headerText || "").split(/\r\n|\n|\r/)) {
    if (/^[ \t]/.test(line)) {
      if (name === null) continue;
      value += line;
      continue;
    }
    flush();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    name = line.slice(0, colon);
    value = line.slice(colon + 1);
  }
  flush();
  return headers;
}

/**
 * Locate the blank line that ends the header block. latin1 keeps a 1:1 byte
 * mapping so indices can be reused as buffer offsets.
 *
 * @param {Buffer} buffer
 * @returns {{ headerText: string, bodyStart: number }}
 */
function splitEntity(buffer) {
  const text = buffer.toString("latin1");
  const blank = /\r\n\r\n|\n\n|\r\r/.exec(text);
  if (blank === null) return { headerText: text, bodyStart: buffer.length };
  return {
    headerText: text.slice(0, blank.index),
    bodyStart: blank.index + blank[0].length,
  };
}

/**
 * @param {Buffer} buffer
 * @returns {{ headers: Map<string, string[]>, body: Buffer }}
 */
function parseEntity(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ""), "utf8");
  const { headerText, bodyStart } = splitEntity(source);
  // Headers are found by byte offset (latin1), but read as UTF-8 when they
  // are valid UTF-8: mail written by most clients today puts a name such as
  // 编辑 in the From line as raw UTF-8 (RFC 6532) rather than encoded-words.
  const headerBytes = Buffer.from(headerText, "latin1");
  const utf8 = headerBytes.toString("utf8");
  const readable = /[\x80-\xff]/.test(headerText) && !utf8.includes("\uFFFD") ? utf8 : headerText;
  return { headers: parseHeaders(readable), body: source.subarray(bodyStart) };
}

/**
 * Parse a Content-Type / Content-Disposition value into a lowercased media
 * type plus a lowercased parameter Map. Values are unquoted here; RFC 2231
 * and encoded-word handling happen when a parameter is named.
 *
 * @param {string} value
 * @returns {{ mediaType: string, params: Map<string, string> }}
 */
function parseContentTypeHeader(value) {
  const segments = splitTopLevel(String(value || "").trim(), ";");
  const mediaType = String(segments.shift() || "").trim().toLowerCase();
  const params = new Map();
  for (const segment of segments) {
    const equals = segment.indexOf("=");
    if (equals < 0) continue;
    const name = segment.slice(0, equals).trim().toLowerCase();
    if (name.length === 0) continue;
    params.set(name, unquote(segment.slice(equals + 1)));
  }
  return { mediaType, params };
}

/**
 * Percent-decode an RFC 2231 value into raw bytes. Each character that is not
 * a valid escape maps to its own byte, which is how an unlabelled 8-bit
 * filename survives.
 *
 * @param {string} value
 * @returns {Buffer}
 */
function percentDecode(value) {
  const text = String(value || "");
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "%") {
      const hex = text.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }
    bytes.push(text.charCodeAt(index) & 0xff);
  }
  return Buffer.from(bytes);
}

/**
 * Decode an RFC 2231 extended parameter value: charset'language'percent-bytes.
 *
 * @param {string} value
 * @returns {string}
 */
function decodeRfc2231(value) {
  const text = String(value || "");
  const match = /^([^']*)'([^']*)'([\s\S]*)$/.exec(text);
  if (match) return decodeBodyText(percentDecode(match[3]), match[1] || "utf-8");
  return decodeBodyText(percentDecode(text), "utf-8");
}

/**
 * Resolve one parameter by name, following the RFC 2231 spellings: the plain
 * form, the extended `name*=` form, and `name*0*=` continuations. Encoded-word
 * filenames (the RFC 2047 misuse Outlook ships) decode too.
 *
 * @param {Map<string, string>} params
 * @param {string} base
 * @returns {string}
 */
function readContentTypeParameter(params, base) {
  const lower = String(base || "").toLowerCase();
  const extended = params.get(`${lower}*`);
  if (extended !== undefined) return decodeRfc2231(extended);

  const indexed = [];
  const pattern = new RegExp(`^${escapeRegExp(lower)}\\*(\\d+)(\\*)?$`);
  for (const [key, value] of params) {
    const match = pattern.exec(key);
    if (match) indexed.push({ index: Number(match[1]), encoded: Boolean(match[2]), value });
  }
  if (indexed.length) {
    indexed.sort((left, right) => left.index - right.index);
    const joined = indexed.map((item) => item.value).join("");
    if (indexed.some((item) => item.encoded)) return decodeRfc2231(joined);
    return decodeEncodedWords(joined);
  }

  const plain = params.get(lower);
  if (plain !== undefined) return decodeEncodedWords(plain);
  return "";
}

/**
 * Decode the Q (quoted-printable-like) payload of an encoded word: "_" is a
 * space, "=XX" is one byte, everything else is its own byte.
 *
 * @param {string} text
 * @returns {Buffer}
 */
function decodeQEncoding(text) {
  const source = String(text || "");
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "_") {
      bytes.push(0x20);
      continue;
    }
    if (ch === "=") {
      const hex = source.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
    }
    bytes.push(source.charCodeAt(index) & 0xff);
  }
  return Buffer.from(bytes);
}

/**
 * @param {string} charset
 * @param {string} encoding "B" or "Q".
 * @param {string} text
 * @returns {string}
 */
function decodeEncodedWord(charset, encoding, text) {
  const payload = String(text || "");
  const bytes = /^b$/i.test(encoding)
    ? Buffer.from(payload.replace(/\s+/g, ""), "base64")
    : decodeQEncoding(payload);
  return decodeBodyText(bytes, String(charset || "").trim().toLowerCase());
}

/**
 * Decode RFC 2047 encoded words. Per the spec the linear whitespace between
 * two adjacent encoded words is not part of the value and is dropped; that is
 * why a long subject split across a header fold re-joins into one word.
 *
 * @param {string} value
 * @returns {string}
 */
function decodeEncodedWords(value) {
  const input = String(value || "");
  const pattern = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g;
  let result = "";
  let lastIndex = 0;
  let lastWasEncoded = false;
  let match = pattern.exec(input);
  while (match) {
    const between = input.slice(lastIndex, match.index);
    if (lastWasEncoded && /^\s*$/.test(between)) {
      // Adjacent encoded words: the fold's whitespace is not message text.
    } else {
      result += between;
    }
    result += decodeEncodedWord(match[1], match[2], match[3]);
    lastWasEncoded = true;
    lastIndex = match.index + match[0].length;
    match = pattern.exec(input);
  }
  result += input.slice(lastIndex);
  return result;
}

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function decodeBase64Body(buffer) {
  return Buffer.from(buffer.toString("latin1").replace(/\s+/g, ""), "base64");
}

/**
 * Decode quoted-printable. A soft line break is the "=" immediately before a
 * CRLF (or bare LF); it is removed and joins the two lines into one.
 *
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function decodeQuotedPrintableBody(buffer) {
  const text = buffer.toString("latin1");
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "=") {
      const hex = text.slice(index + 1, index + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
      const next = text[index + 1];
      if (next === "\r" && text[index + 2] === "\n") {
        index += 2;
        continue;
      }
      if (next === "\n" || next === "\r") {
        index += 1;
        continue;
      }
    }
    bytes.push(text.charCodeAt(index) & 0xff);
  }
  return Buffer.from(bytes);
}

/**
 * @param {Buffer} body
 * @param {string} encoding Content-Transfer-Encoding value.
 * @returns {Buffer}
 */
function decodeTransferEncoding(body, encoding) {
  const label = String(encoding || "").trim().toLowerCase();
  if (label === "base64") return decodeBase64Body(body);
  if (label === "quoted-printable") return decodeQuotedPrintableBody(body);
  return Buffer.from(body);
}

/**
 * Decode a byte run with a declared charset. A missing label uses the shared
 * plain-text decoder, which tries strict UTF-8 and falls back to GB18030 --
 * exactly the rescue a header-less legacy Chinese body needs. A declared
 * UTF-8 label that still yields U+FFFD gets the same rescue, because archive
 * replays and mislabelled mail both stamp UTF-8 over legacy bytes.
 *
 * @param {Buffer} buffer
 * @param {string} charset
 * @returns {string}
 */
function decodeBodyText(buffer, charset) {
  const label = String(charset || "").trim().toLowerCase();
  if (label.length === 0) return decodePlainTextBuffer(buffer);
  const decoded = decodeTextBuffer(buffer, label).replace(/^\uFEFF/, "");
  if (/^utf-?8$/.test(label) && decoded.includes("\uFFFD")) {
    return decodeTextBuffer(buffer, "gb18030").replace(/^\uFEFF/, "");
  }
  return decoded;
}

/**
 * Split a multipart body into its entity buffers. The boundary line may be
 * quoted in the parameter but is bare here; preamble and epilogue are dropped
 * by construction, and the CRLF that belongs to the delimiter is excluded from
 * the preceding part.
 *
 * @param {Buffer} body
 * @param {string} boundary
 * @returns {Buffer[]}
 */
function splitMultipart(body, boundary) {
  const text = body.toString("latin1");
  const pattern = new RegExp(`(?:^|\\r?\\n)--${escapeRegExp(boundary)}(--)?[ \\t]*(?:\\r?\\n|$)`, "g");
  const segments = [];
  let contentStart = -1;
  let match = pattern.exec(text);
  while (match) {
    if (contentStart >= 0) segments.push(body.subarray(contentStart, match.index));
    if (match[1]) break;
    contentStart = pattern.lastIndex;
    if (contentStart > text.length) contentStart = text.length;
    match = pattern.exec(text);
  }
  return segments;
}

/**
 * Flatten every leaf entity under this one. message/rfc822 is deliberately a
 * leaf: the caller's peel callback owns the recursion, so this parser never
 * reads an attached message it was not asked to read.
 *
 * @param {Map<string, string[]>} headers
 * @param {Buffer} body
 * @param {MimePart[]} parts
 * @returns {void}
 */
function collectLeafParts(headers, body, parts) {
  const contentType = parseContentTypeHeader(firstHeader(headers, "content-type"));
  const mediaType = contentType.mediaType || "text/plain";

  if (mediaType.startsWith("multipart/")) {
    const boundary = readContentTypeParameter(contentType.params, "boundary");
    if (boundary.length === 0) return;
    for (const segment of splitMultipart(body, boundary)) {
      const entity = parseEntity(segment);
      collectLeafParts(entity.headers, entity.body, parts);
    }
    return;
  }

  const disposition = parseContentTypeHeader(firstHeader(headers, "content-disposition"));
  const filename = readContentTypeParameter(disposition.params, "filename")
    || readContentTypeParameter(contentType.params, "name");
  parts.push({
    headers,
    contentType: mediaType,
    charset: String(contentType.params.get("charset") || "").trim().toLowerCase(),
    filename: String(filename || "").trim(),
    contentId: stripAngles(firstHeader(headers, "content-id")),
    contentLocation: firstHeader(headers, "content-location").trim(),
    disposition: disposition.mediaType || "",
    body: Buffer.from(body),
  });
}

/**
 * Parse a MIME entity into its headers and flattened leaf parts.
 *
 * @param {Buffer} buffer
 * @returns {{ headers: Map<string, string[]>, parts: MimePart[] }}
 */
function parseMimeMessage(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ""), "utf8");
  const entity = parseEntity(source);
  const parts = [];
  collectLeafParts(entity.headers, entity.body, parts);
  return { headers: entity.headers, parts };
}

/**
 * @param {MimePart} part
 * @returns {boolean}
 */
function isHtmlPart(part) {
  return /^text\/html$|^application\/xhtml\+xml$/.test(part.contentType);
}

/**
 * @param {MimePart} part
 * @returns {boolean}
 */
function isTextPart(part) {
  return part.contentType.startsWith("text/");
}

/**
 * An attachment is a part the reader must not fold into the body: one the
 * sender marked "attachment", a non-text part carrying a filename, or an
 * embedded message. An inline image named by cid is body material, not an
 * attachment, so it stays out of the attachment list.
 *
 * @param {MimePart} part
 * @returns {boolean}
 */
function isAttachmentPart(part) {
  if (part.contentType === "message/rfc822") return true;
  if (part.disposition === "attachment") return true;
  if (part.disposition === "inline" && part.contentId.length > 0) return false;
  if (part.filename.length > 0 && isTextPart(part) === false) return true;
  return false;
}

/**
 * @param {MimePart} part
 * @returns {Buffer}
 */
function decodedPartBody(part) {
  return decodeTransferEncoding(part.body, firstHeader(part.headers, "content-transfer-encoding"));
}

/**
 * @param {MimePart} part
 * @returns {string}
 */
function decodePartText(part) {
  return decodeBodyText(decodedPartBody(part), part.charset);
}

/**
 * Keep ">" reply lines as Markdown blockquotes. A bare ">quoted" is not a
 * blockquote in Markdown, so the space after the marker is restored; nothing
 * is removed.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeQuotedReplyLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/^(>+)(?=\S)/, "$1 "))
    .join("\n");
}

/**
 * @param {string} label
 * @param {Map<string, string[]>} headers
 * @param {string} name
 * @returns {string}
 */
function provenanceLine(label, headers, name) {
  const values = headerValues(headers, name);
  if (values.length === 0) return "";
  return `**${label}:** ${decodeEncodedWords(values.join(", "))}`;
}

/**
 * Quote the envelope verbatim, with who said it to whom. Subject encoded-words
 * decode; everything else is passed through as the sender wrote it.
 *
 * @param {Map<string, string[]>} headers
 * @returns {string}
 */
function provenanceBlock(headers) {
  const lines = [];
  for (const [label, name] of [["From", "from"], ["To", "to"], ["Cc", "cc"], ["Date", "date"], ["Subject", "subject"]]) {
    const line = provenanceLine(label, headers, name);
    if (line.length > 0) lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Pick the readable body: text/plain wins over text/html, and neither wins
 * over the parts the sender marked as attachments.
 *
 * @param {MimePart[]} parts
 * @returns {string}
 */
function selectBodyText(parts) {
  const plain = parts.find((part) => part.contentType === "text/plain" && isAttachmentPart(part) === false);
  if (plain) return normalizeQuotedReplyLines(decodePartText(plain)).replace(/\r\n?/g, "\n");
  const html = parts.find((part) => isHtmlPart(part) && isAttachmentPart(part) === false);
  if (html) return extractHtmlTextFromString(decodePartText(html));
  return "";
}

/**
 * @param {MimePart} part
 * @returns {string}
 */
function attachmentLabel(part) {
  if (part.filename.length > 0) return part.filename;
  if (part.contentType === "message/rfc822") return "message.eml";
  return "未命名附件";
}

/**
 * Render the attachment list, or peel each attachment through the caller's
 * callback. A callback that throws becomes one line in the output rather than
 * a failed import: the reader still gets the mail, and is told which enclosure
 * could not be opened.
 *
 * @param {MimePart[]} parts
 * @param {any} options
 * @returns {Promise<string>}
 */
async function renderAttachments(parts, options) {
  const attachments = parts.filter(isAttachmentPart);
  if (attachments.length === 0) return "";

  const callback = options.peelAttachment;
  const childDepth = (Number(options.depth) || 0) + 1;
  const blocks = [];
  for (const part of attachments.slice(0, MIME_ATTACHMENT_LIMIT)) {
    const label = attachmentLabel(part);
    const bytes = decodedPartBody(part);
    if (typeof callback === "function") {
      blocks.push(`## 附件：${label}`);
      try {
        const text = String(await callback(label, part.contentType, bytes, childDepth) || "").trim();
        if (text.length > 0) blocks.push(text);
      } catch (error) {
        blocks.push(`（无法读取：${error && error.message ? error.message : String(error)}）`);
      }
    } else {
      blocks.push(`- ${label} (${part.contentType}, ${bytes.length} bytes)`);
    }
  }
  const skipped = attachments.length - MIME_ATTACHMENT_LIMIT;
  if (skipped > 0) blocks.push(`- （其余 ${skipped} 个附件未列出）`);
  return blocks.join("\n\n");
}

/**
 * Extract an .eml as Markdown: a verbatim provenance block, the preferred
 * body, then the attachments.
 *
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {(name: string, mimeType: string, buffer: Buffer, depth: number) => Promise<string>} [options.peelAttachment]
 * @param {number} [options.depth]
 * @returns {Promise<string>}
 */
async function extractEmlText(buffer, options = {}) {
  const message = parseMimeMessage(buffer);
  const sections = [];
  const provenance = provenanceBlock(message.headers);
  if (provenance.length > 0) sections.push(provenance);
  const body = selectBodyText(message.parts);
  if (body.trim().length > 0) sections.push(body.trim());
  const attachments = await renderAttachments(message.parts, options);
  if (attachments.length > 0) sections.push(attachments);
  return sections.join("\n\n").trim();
}

/**
 * Undo mboxrd/mboxo escaping: a body line that looked like a separator was
 * stored with one extra ">" and is restored here. The delimiter search has
 * already run on the escaped text, so this cannot re-split a message.
 *
 * @param {string} text
 * @returns {string}
 */
function unescapeMbox(text) {
  return String(text || "").replace(/^>(>*From )/gm, "$1");
}

/**
 * @param {Buffer} buffer
 * @returns {Buffer[]}
 */
function splitMboxMessages(buffer) {
  const text = buffer.toString("latin1");
  const separator = /^From .*$/gm;
  const starts = [];
  let match = separator.exec(text);
  while (match) {
    starts.push(match.index);
    match = separator.exec(text);
  }
  const messages = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : text.length;
    messages.push(Buffer.from(unescapeMbox(text.slice(start, end)), "latin1"));
  }
  return messages;
}

/**
 * Extract every message in an mbox. Each message runs through the .eml path,
 * so options (including the peel callback) apply unchanged.
 *
 * @param {Buffer} buffer
 * @param {object} [options]
 * @returns {Promise<string>}
 */
async function extractMboxText(buffer, options = {}) {
  const messages = splitMboxMessages(buffer);
  const sections = [];
  for (const message of messages.slice(0, MBOX_MESSAGE_LIMIT)) {
    sections.push(await extractEmlText(message, options));
  }
  const skipped = messages.length - MBOX_MESSAGE_LIMIT;
  if (skipped > 0) sections.push(`（另有 ${skipped} 封邮件未导入）`);
  return sections.join("\n\n---\n\n");
}

/**
 * Choose the MHTML root: the part named by the Content-Type start parameter,
 * else the first text/html part. Returning null lets the caller say plainly
 * that nothing readable was found.
 *
 * @param {{ headers: Map<string, string[]>, parts: MimePart[] }} message
 * @returns {MimePart | null}
 */
function selectMhtmlRoot(message) {
  const parts = message.parts;
  if (parts.length === 0) return null;
  const top = parseContentTypeHeader(firstHeader(message.headers, "content-type"));
  const start = stripAngles(readContentTypeParameter(top.params, "start"));
  if (start.length > 0) {
    const root = parts.find((part) =>
      stripAngles(part.contentId) === start || stripAngles(part.contentLocation) === start);
    if (root) return root;
  }
  return parts.find(isHtmlPart) || null;
}

/**
 * Extract an MHTML/MHT archive: decode the root HTML part and hand it to the
 * supplied converter, or to the shared HTML-to-text extractor. The base URL
 * lets a subclassed converter resolve relative links against the page the
 * snapshot was taken from.
 *
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {(html: string, baseUrl: string) => string} [options.htmlToText]
 * @returns {string}
 */
function extractMhtmlText(buffer, options = {}) {
  const message = parseMimeMessage(buffer);
  const root = selectMhtmlRoot(message);
  if (root === null) throw new Error(MHTML_NOT_READABLE);
  const decoded = decodePartText(root);
  const baseUrl = root.contentLocation || firstHeader(message.headers, "snapshot-content-location").trim();
  const convert = options.htmlToText;
  const text = typeof convert === "function" ? convert(decoded, baseUrl) : extractHtmlTextFromString(decoded);
  if (String(text || "").trim().length === 0) throw new Error(MHTML_NOT_READABLE);
  return text;
}

/**
 * Sniff an .eml without parsing it. Two distinct RFC 5322 header lines before
 * the first blank line is enough to tell mail from arbitrary text; the probe
 * stops at 4 KB so a huge attachment is never read for this decision.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function looksLikeMimeMessage(buffer) {
  if (Buffer.isBuffer(buffer) === false || buffer.length === 0) return false;
  const head = buffer.subarray(0, HEADER_PROBE_BYTES).toString("latin1");
  const blank = /\r\n\r\n|\n\n|\r\r/.exec(head);
  const headerBlock = blank === null ? head : head.slice(0, blank.index);
  const wanted = /^(from|to|subject|date|mime-version|content-type):/i;
  let count = 0;
  for (const line of headerBlock.split(/\r\n|\n|\r/)) {
    if (wanted.test(line.trim())) count += 1;
  }
  return count >= 2;
}

/**
 * Sniff an mbox: a "From " line followed by at least one header line before
 * the blank, so a body that merely starts with the word "From" is not a box.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function looksLikeMbox(buffer) {
  if (Buffer.isBuffer(buffer) === false || buffer.length === 0) return false;
  const lines = buffer.subarray(0, HEADER_PROBE_BYTES).toString("latin1").split(/\r\n|\n|\r/);
  if (/^From /.test(lines[0] || "") === false) return false;
  const rest = lines.slice(1);
  const blank = rest.indexOf("");
  const headerLines = blank >= 0 ? rest.slice(0, blank) : rest;
  return headerLines.some((line) => /^[A-Za-z][A-Za-z0-9-]*:/.test(line));
}

module.exports = {
  parseMimeMessage,
  extractEmlText,
  extractMboxText,
  extractMhtmlText,
  looksLikeMimeMessage,
  looksLikeMbox,
};
