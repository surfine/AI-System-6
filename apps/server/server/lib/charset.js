// Character-encoding resolution for fetched web pages.
//
// Old pages — the ones Time Machine spends most of its time on — are rarely
// UTF-8. A 2004 Chinese page is GB2312/GBK, a Japanese one Shift_JIS, and the
// Wayback replay serves those original bytes back with no charset in the
// Content-Type header. Decoding them as UTF-8 turns the whole document into
// replacement characters, so the encoding is resolved from the evidence the
// response actually carries, in the Encoding Standard's order:
//
//   1. a byte order mark
//   2. the Content-Type charset parameter
//   3. the document's own <meta> declaration (prescan)
//   4. UTF-8, with the same GB18030 rescue the file importers already use
//
// One deliberate deviation from the standard: an archive replay often stamps
// its own `charset=utf-8` over legacy bytes. When the header says UTF-8, the
// bytes are not valid UTF-8, and the page declares something else, the page's
// own declaration wins.

"use strict";

// The Encoding Standard prescans 1024 bytes. Archive replays inject a banner
// ahead of the original <head>, which pushes the real meta well past that.
const META_PRESCAN_BYTES = 65536;

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeCharsetLabel(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
}

/**
 * @param {string} label
 * @returns {boolean}
 */
function isUtf8Label(label) {
  return /^(?:utf-?8|unicode-1-1-utf-8|x-unicode20utf8)$/.test(label);
}

/**
 * Read the charset parameter out of a Content-Type value.
 *
 * @param {unknown} contentType
 * @returns {string}
 */
function charsetFromContentType(contentType) {
  const match = /;\s*charset\s*=\s*("[^"]*"|'[^']*'|[^;\s]+)/i.exec(String(contentType || ""));
  return match ? normalizeCharsetLabel(match[1]) : "";
}

/**
 * @param {unknown} contentType
 * @returns {boolean}
 */
function allowsMetaPrescan(contentType) {
  const value = String(contentType || "");
  if (!value.trim()) return true;
  return /text\/html|application\/xhtml\+xml|\+xml|text\/xml|application\/xml/i.test(value);
}

/**
 * @param {string} tag
 * @param {RegExp} pattern
 * @returns {string}
 */
function attributeValue(tag, pattern) {
  const match = pattern.exec(tag);
  if (!match) return "";
  return match.slice(1).find((group) => group !== undefined) || "";
}

/**
 * Scan the head of an HTML document for its own charset declaration. Only
 * <meta> tags count — `charset="utf-8"` also appears on the <script> tags an
 * archive replay injects ahead of the page, and those describe the script
 * file, not the document.
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
function charsetFromMetaPrescan(buffer) {
  const head = buffer.subarray(0, META_PRESCAN_BYTES).toString("latin1");
  const metaTag = /<meta\b[^>]*>/gi;
  let match;
  while ((match = metaTag.exec(head))) {
    const tag = match[0];
    if (/\bhttp-equiv\s*=\s*(?:["']?)content-type/i.test(tag)) {
      const label = charsetFromContentType(
        attributeValue(tag, /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
      );
      if (label) return label;
      continue;
    }
    const label = normalizeCharsetLabel(
      attributeValue(tag, /\bcharset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
    );
    if (label) return label;
  }
  return "";
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function charsetFromBom(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return "utf-8";
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return "utf-16le";
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return "utf-16be";
  return "";
}

/**
 * @param {Buffer} buffer
 * @param {string} label
 * @returns {string | null}
 */
function decodeWithLabel(buffer, label) {
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return null;
  }
}

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isValidUtf8(buffer) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the encoding label for a fetched body without decoding it.
 *
 * @param {Buffer} buffer
 * @param {unknown} contentType
 * @returns {string}
 */
function resolveResponseCharset(buffer, contentType) {
  const bom = charsetFromBom(buffer);
  if (bom) return bom;

  const headerLabel = charsetFromContentType(contentType);
  const metaLabel = allowsMetaPrescan(contentType) ? charsetFromMetaPrescan(buffer) : "";
  if (headerLabel && isUtf8Label(headerLabel) && metaLabel && !isUtf8Label(metaLabel) && !isValidUtf8(buffer)) {
    return metaLabel;
  }
  const declared = headerLabel || metaLabel;
  if (declared) return declared;
  if (isValidUtf8(buffer)) return "utf-8";
  return "gb18030";
}

/**
 * Decode a fetched body using the encoding the response declares. Falls back
 * to UTF-8 whenever the declared label is unknown to this runtime, so a page
 * still renders as best it can instead of failing the request.
 *
 * @param {Buffer} buffer
 * @param {unknown} contentType
 * @returns {string}
 */
function decodeResponseText(buffer, contentType) {
  if (!buffer || !buffer.length) return "";
  const label = resolveResponseCharset(buffer, contentType);
  if (isUtf8Label(label)) return buffer.toString("utf8").replace(/^﻿/, "");
  return decodeWithLabel(buffer, label) ?? buffer.toString("utf8");
}

module.exports = {
  charsetFromContentType,
  charsetFromMetaPrescan,
  resolveResponseCharset,
  decodeResponseText,
};
