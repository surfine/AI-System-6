// Shared text utilities. Mirrors the implementations in the root
// `server.js` and `server-importers.js` exactly enough to be a drop-in
// replacement for either caller.
//
// Behavior parity notes:
// - decodeHtml and stripTags adopt the defensive `String(value || "")`
//   form used in server-importers.js. That form is a strict superset
//   of server.js's bare-string form for any string input, and only
//   differs when the input is null/undefined (where the root server.js
//   version throws). No existing call site relies on the throw.
// - cleanText mirrors the root server.js version, which is a stronger
//   transform than the importer's local cleanText (CRLF normalization,
//   wider whitespace class, double-sided newline trim). The lighter
//   importer-side cleanText is intentionally NOT consolidated here; it
//   is a separate transform with its own call sites and will be moved
//   later under a distinct name when the importer is migrated.
//
// The whitespace regexes are intentionally built from string literals
// with explicit \\u escapes rather than inline regex literals. Some
// editors silently normalize invisible Unicode whitespace inside regex
// literals, which would change matching behavior. Strings round-trip
// safely.

"use strict";

const NBSP_AND_TAB_LIKE = new RegExp("[\\t\\f\\v\\u00a0]+", "g");
const UNICODE_SPACES = new RegExp("[ \\u2000-\\u200a\\u202f\\u205f\\u3000]+", "g");

/**
 * Decode a small set of common HTML entities and numeric character
 * references into their Unicode equivalents.
 *
 * @param {unknown} value
 * @returns {string}
 */
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(Number.parseInt(code, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number.parseInt(code, 10));
      } catch {
        return _;
      }
    });
}

/**
 * Remove HTML tags and collapse internal whitespace, then decode
 * common HTML entities. Intended for short snippets such as titles
 * and meta descriptions, not full document bodies.
 *
 * @param {unknown} value
 * @returns {string}
 */
function stripTags(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Normalize a raw text blob for downstream display or model input:
 * CRLF to LF, exotic whitespace to a single space, no trailing
 * whitespace on lines, no leading indentation on continuation lines,
 * and at most one blank line in a row.
 *
 * @param {unknown} value
 * @returns {string}
 */
function cleanText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(NBSP_AND_TAB_LIKE, " ")
    .replace(UNICODE_SPACES, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = {
  decodeHtml,
  stripTags,
  cleanText,
};
