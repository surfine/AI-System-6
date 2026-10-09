// @ts-check
// Text quote: a way to point at a passage that survives edits around it.
//
// A character offset is only true for the text it was measured on; the moment
// a word is typed in front of it, it points at something else. The W3C Web
// Annotation answer is to name the passage by what it says: the exact quote,
// a little of what came before and after it, and the offset it last had. To
// find it again, the quote is searched for and the context decides between
// copies; the old offset decides only when the context cannot. If the quote is
// gone, the passage is lost, and it is reported lost: this module never
// invents a position. (After the TextQuoteSelector of the Web Annotation Data
// Model, and the anchoring of pdfcraft's annotation layer.)
//
// Used by Review Desk's comments (app/core/review-comments.js) and by Reader
// clips, which store the same shape in whitespace-collapsed page text so a
// clip can be found again in its page.
//
// No DOM, no translations: the executable contract runs this bare.

(function installTextQuote(root) {
  if (root.AISystem6TextQuote) return;

  const CONTEXT = 32;
  const MAX_QUOTE = 4000;

  /**
   * Never cut a surrogate pair in half: an emoji split in two is two
   * replacement characters in the quote. A start moves back to the pair's
   * edge, an end moves forward, so the selection only ever grows.
   * @param {string} text @param {number} index @param {number} direction
   */
  function boundary(text, index, direction) {
    const at = Math.max(0, Math.min(text.length, Math.trunc(index)));
    if (at > 0 && at < text.length) {
      const code = text.charCodeAt(at);
      const before = text.charCodeAt(at - 1);
      if (code >= 0xdc00 && code <= 0xdfff && before >= 0xd800 && before <= 0xdbff) return at + direction;
    }
    return at;
  }

  /**
   * @param {string} text the document the range was measured on
   * @param {number} start
   * @param {number} end
   * @returns {{ quote: string, prefix: string, suffix: string, offset: number } | null}
   */
  function createAnchor(text, start, end) {
    const source = String(text ?? "");
    const from = boundary(source, start, -1);
    const to = boundary(source, end, 1);
    if (!(to > from)) return null;
    const quote = source.slice(from, to);
    if (!quote.trim() || quote.length > MAX_QUOTE) return null;
    return {
      quote,
      prefix: source.slice(boundary(source, from - CONTEXT, -1), from),
      suffix: source.slice(to, boundary(source, to + CONTEXT, 1)),
      offset: from,
    };
  }

  /** @param {string} text @param {string} quote */
  function occurrences(text, quote) {
    const found = [];
    if (!quote) return found;
    let at = text.indexOf(quote);
    while (at >= 0) {
      found.push(at);
      at = text.indexOf(quote, at + 1);
    }
    return found;
  }

  /**
   * Where the passage is now.
   *
   *   found  context  — a copy of the quote whose prefix and suffix both still
   *                     match; the nearest to the old offset if there are several.
   *   found  side     — otherwise, a copy that still matches on one side (the
   *                     text on the other side was edited).
   *   found  nearest  — otherwise, the copy of the quote nearest the old offset.
   *   lost            — the quote is not in the text. Nothing is guessed; the
   *                     caller keeps showing the original quote.
   *
   * @param {string} text
   * @param {{ quote?: string, prefix?: string, suffix?: string, offset?: number } | null | undefined} anchor
   * @returns {{ status: "found" | "lost", start: number, end: number, how: "" | "context" | "side" | "nearest", moved: boolean }}
   */
  function resolveAnchor(text, anchor) {
    const lost = { status: /** @type {"lost"} */ ("lost"), start: -1, end: -1, how: /** @type {""} */ (""), moved: false };
    const source = String(text ?? "");
    const quote = typeof anchor?.quote === "string" ? anchor.quote : "";
    if (!quote) return lost;
    const hits = occurrences(source, quote);
    if (!hits.length) return lost;
    const prefix = typeof anchor?.prefix === "string" ? anchor.prefix : "";
    const suffix = typeof anchor?.suffix === "string" ? anchor.suffix : "";
    const offset = Number.isFinite(anchor?.offset) ? Number(anchor?.offset) : 0;
    const scored = hits.map((at) => ({
      at,
      distance: Math.abs(at - offset),
      before: !prefix || source.slice(Math.max(0, at - prefix.length), at) === prefix,
      after: !suffix || source.slice(at + quote.length, at + quote.length + suffix.length) === suffix,
    }));
    const nearest = (/** @type {typeof scored} */ list) => list.reduce((best, item) => (item.distance < best.distance ? item : best));
    const both = scored.filter((item) => item.before && item.after);
    const one = scored.filter((item) => item.before || item.after);
    /** @type {"context" | "side" | "nearest"} */
    let how = "nearest";
    let pick;
    if (both.length) { pick = nearest(both); how = "context"; }
    else if (one.length) { pick = nearest(one); how = "side"; }
    else pick = nearest(scored);
    return { status: "found", start: pick.at, end: pick.at + quote.length, how, moved: pick.at !== offset };
  }

  /**
   * The anchor to keep after a successful resolve: the same quote and context,
   * the offset it has now.
   * @param {{ quote: string, prefix: string, suffix: string, offset: number }} anchor
   * @param {{ status: string, start: number }} resolved
   */
  function withOffset(anchor, resolved) {
    return resolved.status === "found" ? { ...anchor, offset: resolved.start } : anchor;
  }

  /** Whitespace runs collapse to one space: the text Reader clips anchor in. */
  function collapse(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
  }

  root.AISystem6TextQuote = Object.freeze({ CONTEXT, MAX_QUOTE, createAnchor, resolveAnchor, withOffset, collapse });
})(typeof window !== "undefined" ? window : globalThis);
