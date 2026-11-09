// Front-matter for the two built-in git-static sites (文思泉涌, lane C P1).
//
// Hand-written on purpose: no YAML dependency. Only the shapes the two sites
// actually use are parsed — `key: value` scalars (quoted or bare, including
// dates), `key: [a, b]` flow lists, and multi-line `- item` lists. Everything
// else (aaronlau's `predictions: [{claim: …}]` flow mappings, stray
// continuations) is kept opaque: the entry's exact source lines ride along so
// a parse → serialize round trip loses no characters, and the value surfaces
// to the desk as the raw string.
//
// The write path never re-formats an untouched field: serializeFrontMatter is
// fed through mergeFrontMatter, which keeps an entry's original lines when the
// incoming value is deep-equal to the parsed one. Only edited fields are
// re-emitted canonically, so `git diff` after a property edit shows exactly
// those lines (PLAN P1 acceptance).

"use strict";

const FRONT_MATTER_OPEN = /^---[ \t]*\r?$/;
const FRONT_MATTER_CLOSE = /^---[ \t]*\r?$/;
const KEY_LINE = /^([A-Za-z0-9_-]+):(?:[ \t](.*))?$/;
const LIST_ITEM = /^-[ \t]+(.*)$/;

/**
 * @typedef {object} FrontMatterEntry
 * @property {string} key
 * @property {string | number | boolean | string[]} value  the parsed value;
 *                                    an opaque value surfaces as its raw text
 * @property {string[]} lines  the entry's exact source lines (without \n)
 * @property {boolean} opaque  true when the value shape is not one of the
 *                             supported ones; the server keeps the original
 *                             bytes and the route protects the key on write
 */

/**
 * @typedef {object} FrontMatterParse
 * @property {Record<string, string | number | boolean | string[]>} fields
 * @property {string} body  everything after the closing delimiter, verbatim
 * @property {FrontMatterEntry[]} entries  source order, each with its raw lines
 * @property {boolean} present  whether a front-matter block was there at all
 * @property {string[]} opaqueKeys  keys whose value shape is not one of the
 *                                  supported ones (kept verbatim on write)
 */

/** Unescape the two escapes the sites' double-quoted strings ever carry. */
function unquoteDouble(raw) {
  return raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

function unquoteSingle(raw) {
  return raw.slice(1, -1).replace(/''/g, "'");
}

function isQuoted(value) {
  return value.length >= 2
    && ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'")));
}

/** A scalar: quoted string, bare string (dates, urls), number or boolean. */
function parseScalar(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return "";
  if (isQuoted(text)) {
    return text.startsWith('"') ? unquoteDouble(text) : unquoteSingle(text);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/**
 * Split a flow list on top-level commas, respecting quotes. Returns null when
 * the list nests (a flow mapping inside — aaronlau's `predictions:
 * [{claim: …}]`), never closes, or is quoted across an unclosed bracket:
 * those bytes are kept verbatim instead of guessed at.
 * @param {string} text the value text without the outer brackets
 */
function splitFlowItems(text) {
  const items = [];
  let current = "";
  let quote = "";
  let depth = 0;
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") {
      depth -= 1;
      if (depth < 0) return null;
    }
    if (char === "," && depth === 0) {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (quote || depth !== 0) return null;
  items.push(current);
  // A nested bracket anywhere means the item is a mapping or a nested list —
  // not one of the supported shapes. Opaque beats lossy.
  if (items.some((item) => /[\[\{}]/.test(item))) return null;
  return items;
}

/**
 * Parse one `key: value` payload. Returns { value, opaque }.
 * @param {string} raw the text after the colon
 */
function parseValue(raw) {
  const text = String(raw ?? "").trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    const items = splitFlowItems(text.slice(1, -1));
    if (items === null) return { value: text, opaque: true };
    return { value: items.map((item) => parseScalar(item)), opaque: false };
  }
  return { value: parseScalar(text), opaque: false };
}

/**
 * Parse a document into front-matter and body. A document without a
 * front-matter block comes back whole as the body.
 * @param {string} text
 * @returns {FrontMatterParse}
 */
function parseFrontMatter(text) {
  const source = String(text ?? "");
  const lines = source.split("\n");
  if (lines.length === 0 || !FRONT_MATTER_OPEN.test(lines[0])) {
    return { fields: {}, body: source, entries: [], present: false, opaqueKeys: [] };
  }
  /** @type {FrontMatterEntry[]} */
  const entries = [];
  let index = 1;
  while (index < lines.length && !FRONT_MATTER_CLOSE.test(lines[index])) {
    const match = KEY_LINE.exec(lines[index]);
    if (!match) {
      // A continuation we do not model (a stray indented line, a comment):
      // fold it into the previous entry so the bytes survive a round trip,
      // and mark that entry opaque — its value text is no longer the whole
      // truth.
      const previous = entries[entries.length - 1];
      if (previous) {
        previous.lines.push(lines[index]);
        previous.opaque = true;
      }
      index += 1;
      continue;
    }
    const key = match[1];
    const start = index;
    index += 1;
    const inline = match[2] ?? "";
    if (inline.trim() === "") {
      // Either a multi-line list (`key:` then `  - item` lines) or an empty
      // value; look ahead for list items only.
      const items = [];
      let opaque = false;
      while (index < lines.length && !FRONT_MATTER_CLOSE.test(lines[index])) {
        const item = /^[ \t]+-[ \t]+(.*)$/.exec(lines[index]);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      if (items.length > 0) {
        const parsed = items.map((item) => parseValue(item));
        opaque = parsed.some((one) => one.opaque);
        entries.push({
          key,
          value: items.map((item) => parseScalar(item)),
          lines: lines.slice(start, index),
          opaque,
        });
        continue;
      }
      entries.push({ key, value: "", lines: lines.slice(start, index), opaque: false });
      continue;
    }
    const { value, opaque } = parseValue(inline);
    entries.push({ key, value, lines: lines.slice(start, index), opaque });
  }
  // `index` sits on the closing delimiter (or ran past the end): the body
  // starts after that line's own newline.
  const body = lines.slice(index + 1).join("\n");
  /** @type {Record<string, string | number | boolean | string[]>} */
  const fields = {};
  for (const entry of entries) fields[entry.key] = entry.value;
  return {
    fields,
    body,
    entries,
    present: true,
    opaqueKeys: entries.filter((entry) => entry.opaque).map((entry) => entry.key),
  };
}

/** A string is emitted bare only when no YAML-significant character is in it. */
function needsQuotes(value) {
  return value === ""
    || value !== value.trim()
    || /[:#\[\]{}"'&*!|>%@`,\n\r\t\\]/.test(value)
    || /^(?:true|false|null|~|- ?|\d+(?:\.\d+)?$)/.test(value);
}

/** @param {string | number | boolean | object} value */
function emitScalar(value) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  const text = String(value ?? "");
  return needsQuotes(text) ? JSON.stringify(text) : text;
}

/**
 * Canonical lines for one entry (a changed or brand-new field).
 * @param {string} key
 * @param {unknown} value
 * @returns {string[]}
 */
function emitEntryLines(key, value) {
  if (value === null || value === undefined) return [`${key}: ""`];
  if (Array.isArray(value)) {
    return [`${key}: [${value.map((item) => emitScalar(/** @type {any} */ (item))).join(", ")}]`];
  }
  if (typeof value === "object") {
    // The desk never sends objects (opaque values ride back as strings); a
    // defensive JSON dump beats silent corruption.
    return [`${key}: ${JSON.stringify(value)}`];
  }
  return [`${key}: ${emitScalar(/** @type {any} */ (value))}`];
}

/** Value comparison across one parse and one client payload. */
function valueEquals(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compose the front-matter block for a write. Existing entries keep their
 * exact source lines unless the client changed that key's value; keys the
 * client omits are dropped; new keys are appended canonically. Protected keys
 * (readonly fields, opaque values) are always restored from the existing
 * file, with a warning when the client sent something different.
 *
 * @param {FrontMatterParse} existing the parse of the file on disk
 * @param {Record<string, unknown>} updates the client's front-matter object
 * @param {{ protectedKeys?: string[], warnings?: string[] }} [options]
 * @returns {string[]} the block's lines, without the `---` delimiters
 */
function mergeFrontMatter(existing, updates, options = {}) {
  const warnings = options.warnings || [];
  const protectedKeys = new Set(options.protectedKeys || []);
  const pending = { ...(updates && typeof updates === "object" ? updates : {}) };
  /** @type {string[]} */
  const out = [];
  for (const entry of existing.entries) {
    const sent = Object.prototype.hasOwnProperty.call(pending, entry.key)
      ? pending[entry.key]
      : undefined;
    delete pending[entry.key];
    if (protectedKeys.has(entry.key) || entry.opaque) {
      if (entry.key in (updates || {}) && !valueEquals(sent, entry.value)) {
        warnings.push(
          `「${entry.key}」以服务器现有内容为准，客户端的改动被丢弃（该字段由站点自己维护）`
        );
      }
      out.push(...entry.lines);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(updates || {}, entry.key)) continue;
    out.push(valueEquals(sent, entry.value) ? entry.lines.join("\n") : emitEntryLines(entry.key, sent).join("\n"));
  }
  for (const key of Object.keys(pending)) {
    if (protectedKeys.has(key)) {
      warnings.push(`「${key}」是只读字段，新值被丢弃`);
      continue;
    }
    out.push(emitEntryLines(key, pending[key]).join("\n"));
  }
  return out;
}

/**
 * Serialize a whole document. `blockLines` comes from mergeFrontMatter (or
 * emitEntryLines for a brand-new article).
 * @param {string[]} blockLines
 * @param {string} body
 */
function serializeFrontMatter(blockLines, body) {
  if (!blockLines.length) return String(body ?? "");
  return `---\n${blockLines.join("\n")}\n---\n${String(body ?? "")}`;
}

module.exports = {
  parseFrontMatter,
  mergeFrontMatter,
  serializeFrontMatter,
};
