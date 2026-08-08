// @ts-check
// Quick Draft protected ranges — immutable sentinel enforcement, pure data.
//
// A protected range is a property of the text: the writer protects a quote
// from every AI operation. The guarantee is byte-identical preservation, so
// protection cannot be line-number bookkeeping ("restore lines 3-5 after the
// model rewrote everything else") — that silently guesses positions and can
// splice the quote back into the wrong sentence. Instead, before a model
// request the protected regions are replaced with unique immutable sentinel
// tokens (⟦AI6_PROTECTED_<hash>⟧), the token→original-bytes map is kept
// locally, and the prompt requires the tokens to survive verbatim. After the
// model returns, verification is strict:
//
//   - every sentinel appears exactly once;
//   - characters and case match exactly;
//   - no unknown sentinel appears;
//   - output contains no partial or damaged token.
//
// If any check fails the whole composition fails. There is no best-effort
// restore, no guessing, and protected text is never appended at the end.
//
// Masks (line ranges) still exist, but only as a scope for an adjustment
// layer; they never define how protection is enforced.

const PROTECTED_TOKEN_OPEN = "\u27e6AI6_PROTECTED_";
const PROTECTED_TOKEN_CLOSE = "\u27e7";
const PROTECTED_TOKEN_PATTERN = /⟦AI6_PROTECTED_(\d{2})_([A-Fa-f0-9]{8})⟧/g;
const PROTECTED_TOKEN_TEST_PATTERN = /^⟦AI6_PROTECTED_\d{2}_[A-Fa-f0-9]{8}⟧$/;

function protectedTokenId(sourceText = "") {
  // Deterministic per protected bytes: the same protected text produces the
  // same token, so composite cache keys stay stable across passes.
  let hash = 5381;
  const value = String(sourceText || "");
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function protectedToken(text = "", occurrence = 1) {
  const ordinal = String(Math.max(1, Number(occurrence) || 1)).padStart(2, "0");
  return `${PROTECTED_TOKEN_OPEN}${ordinal}_${protectedTokenId(text)}${PROTECTED_TOKEN_CLOSE}`;
}

function isProtectedToken(value = "") {
  return PROTECTED_TOKEN_TEST_PATTERN.test(String(value || ""));
}

/**
 * Replace every protected line range with a single sentinel token line.
 * @param {string} source
 * @param {Array<{start: number; end: number}>} protectedRanges normalized
 *   1-based inclusive line ranges
 * @returns {{ protectedText: string; sentinels: Array<{token: string; text: string}> }}
 */
function protectTextWithSentinels(source = "", protectedRanges = []) {
  const text = String(source || "");
  if (!text) return { protectedText: text, sentinels: [] };
  const lines = text.split(/\n/);
  const ranges = [...(protectedRanges || [])]
    .map((range) => ({
      start: Math.max(1, Math.floor(Number(range?.start) || 0)),
      end: Math.max(1, Math.floor(Number(range?.end) || 0)),
    }))
    .filter((range) => range.start <= range.end && range.start <= lines.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  const sentinels = [];
  const protectedLines = new Set();
  for (const range of merged) {
    const end = Math.min(range.end, lines.length);
    const start = Math.min(range.start, end);
    const protectedText = lines.slice(start - 1, end).join("\n");
    let occurrence = sentinels.length + 1;
    let token = protectedToken(protectedText, occurrence);
    while (text.includes(token) || sentinels.some((entry) => entry.token === token)) {
      occurrence += 1;
      token = protectedToken(protectedText, occurrence);
    }
    sentinels.push({ token, text: protectedText });
    for (let line = start; line <= end; line += 1) protectedLines.add(line);
  }
  const next = [];
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    if (!protectedLines.has(lineNumber)) {
      next.push(lines[index]);
      continue;
    }
    const range = merged.find((item) => lineNumber >= item.start && lineNumber <= item.end);
    if (!range) {
      next.push(lines[index]);
      continue;
    }
    if (lineNumber === range.start) {
      const protectedText = lines.slice(range.start - 1, Math.min(range.end, lines.length)).join("\n");
      const rangeIndex = merged.indexOf(range);
      const entry = sentinels[rangeIndex];
      next.push(entry?.token || protectedToken(protectedText, rangeIndex + 1));
    }
    // Every later line of the range is consumed by the token line.
  }
  return { protectedText: next.join("\n"), sentinels };
}

/**
 * Strict sentinel verification after a model pass.
 * @param {string} output
 * @param {Array<{token: string; text: string}>} sentinels
 * @returns {{ valid: boolean; errors: string[] }}
 */
function verifyProtectedSentinels(output = "", sentinels = []) {
  const text = String(output || "");
  const errors = [];
  const expected = new Map(sentinels.map((entry) => [entry.token, entry.text]));
  const counts = new Map();
  let match;
  const pattern = new RegExp(PROTECTED_TOKEN_PATTERN.source, "g");
  while ((match = pattern.exec(text)) !== null) {
    const token = match[0];
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  for (const entry of sentinels) {
    const count = counts.get(entry.token) || 0;
    if (count === 0) {
      errors.push(`protected sentinel ${entry.token} is missing from the model output`);
    } else if (count > 1) {
      errors.push(`protected sentinel ${entry.token} appears ${count} times; it must appear exactly once`);
    }
  }
  for (const [token] of counts) {
    if (!expected.has(token)) {
      errors.push(`unknown protected sentinel ${token} appeared in the model output`);
    }
  }
  // Damaged tokens: strip every complete valid token first, then flag any
  // remaining opening marker that is not a valid, expected token (a partial
  // token or a malformed body would otherwise sail through the count check).
  const damaged = text.replace(PROTECTED_TOKEN_PATTERN, "").match(/⟦AI6_PROTECTED_[^⟧]*/g) || [];
  for (const partial of damaged) {
    if (!expected.has(partial)) {
      errors.push(`damaged protected token fragment "${partial}" appeared in the model output`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Replace sentinel tokens with the original protected bytes. Only call this
 * after verifyProtectedSentinels passed; restore is deterministic because the
 * tokens are unique.
 * @param {string} output
 * @param {Array<{token: string; text: string}>} sentinels
 * @returns {string}
 */
function restoreProtectedSentinels(output = "", sentinels = []) {
  let text = String(output || "");
  for (const entry of sentinels) {
    text = text.split(entry.token).join(entry.text);
  }
  return text;
}

/**
 * Remap a layer mask's line numbers onto the sentinel-protected text: each
 * protected range collapses to one token line, so later lines shift up by
 * (protected line count - 1). Used only to keep the prompt's line numbers
 * honest; protection itself never depends on line numbers.
 * @param {Array<{start: number; end: number}>} ranges
 * @param {Array<{start: number; end: number}>} protectedRanges
 * @returns {Array<{start: number; end: number}>}
 */
function remapLineRangesAfterSentinels(ranges = [], protectedRanges = []) {
  const collapsed = (protectedRanges || [])
    .map((range) => ({
      start: Math.max(1, Math.floor(Number(range?.start) || 0)),
      end: Math.max(1, Math.floor(Number(range?.end) || 0)),
    }))
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const protectedLines = new Set();
  for (const range of collapsed) {
    for (let line = range.start; line <= range.end; line += 1) protectedLines.add(line);
  }
  const shiftBefore = (line) => {
    let removed = 0;
    for (const range of collapsed) {
      // Each protected range collapses to a single token line, so the lines
      // it removes are (range length - 1) for every range fully before this
      // line.
      if (range.end < line) removed += range.end - range.start;
    }
    return line - removed;
  };
  const merged = [];
  for (const range of ranges || []) {
    const start = Math.max(1, Math.floor(Number(range?.start) || 0));
    const end = Math.max(start, Math.floor(Number(range?.end) || start));
    let next = null;
    for (let line = start; line <= end; line += 1) {
      if (protectedLines.has(line)) continue;
      const position = shiftBefore(line);
      if (next && next.end === position - 1) {
        next.end = position;
      } else {
        next = { start: position, end: position };
        merged.push(next);
      }
    }
  }
  return merged;
}

window.AISystem6ProtectedRanges = Object.freeze({
  PROTECTED_TOKEN_OPEN,
  PROTECTED_TOKEN_CLOSE,
  isProtectedToken,
  protectTextWithSentinels,
  protectedToken,
  protectedTokenId,
  remapLineRangesAfterSentinels,
  restoreProtectedSentinels,
  verifyProtectedSentinels,
});
