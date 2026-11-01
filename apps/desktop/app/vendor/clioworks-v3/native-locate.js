/* ClioWorks v4 (V4-02): native-document locations — capture, resolve, cite.
 *
 * A Location (contracts/ports.d.ts) points at a passage in a native document
 * by what it is, not by where it was: a text quote with context, a cell range,
 * a slide shape. Resolving a location against a live adapter document answers
 * exactly / lost / ambiguous — never a guess:
 *  - exact: the quote is the only candidate, or the only one whose prefix and
 *    suffix both still match (W3C TextQuoteSelector semantics, shared with
 *    Review Desk and Reader clips through core/text-quote.js).
 *  - ambiguous: the quote still occurs but context cannot pick one copy — the
 *    caller keeps showing the original and asks the user, it never takes the
 *    first match (adapter-map V4-02 rule).
 *  - lost: the quote is gone. The original sentence stays; nothing is invented.
 *
 * Clipping keeps the original sentence verbatim and the note (paraphrase)
 * separate; both ride the same location so "return to source" works after
 * edits around the passage. No DOM, no translations: the contract runs bare.
 */
(function (root) {
  'use strict';
  if (root.AISystem6NativeLocate) return;

  const TEXT_QUOTE = () => root.AISystem6TextQuote;

  function requireTextQuote() {
    const tq = TEXT_QUOTE();
    if (!tq || typeof tq.createAnchor !== 'function' || typeof tq.resolveAnchor !== 'function') {
      throw new Error('native-locate: core/text-quote.js is required');
    }
    return tq;
  }

  function checkIdentity(identity) {
    if (!identity || typeof identity.documentId !== 'string' || !identity.documentId) {
      throw new Error('native-locate: documentId is required');
    }
    if (!Number.isSafeInteger(identity.generation) || identity.generation < 1) {
      throw new Error('native-locate: generation must be a positive integer');
    }
  }

  /** Count occurrences of quote in text (plain indexOf walk). */
  function countOccurrences(text, quote) {
    let at = text.indexOf(quote);
    let n = 0;
    while (at >= 0) {
      n += 1;
      at = text.indexOf(quote, at + 1);
    }
    return n;
  }

  /** How many occurrences still match BOTH the recorded prefix and suffix. */
  function contextMatches(text, anchor) {
    const quote = anchor.quote || '';
    let at = text.indexOf(quote);
    let both = 0;
    while (at >= 0) {
      const before = !anchor.prefix || text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix;
      const after = !anchor.suffix || text.slice(at + quote.length, at + quote.length + anchor.suffix.length) === anchor.suffix;
      if (before && after) both += 1;
      at = text.indexOf(quote, at + 1);
    }
    return both;
  }

  /**
   * Capture a text location from the document's own text.
   * @param {{documentId:string, generation:number}} identity
   * @param {string} text the text the range was measured on
   * @param {number} start @param {number} end character range (surrogate-safe)
   */
  function captureTextLocation(identity, text, start, end) {
    checkIdentity(identity);
    const tq = requireTextQuote();
    const anchor = tq.createAnchor(String(text || ''), start, end);
    if (!anchor) throw new Error('native-locate: the range is empty or too long to quote');
    return {
      documentId: identity.documentId,
      generation: identity.generation,
      kind: 'text',
      quote: { ...anchor, unit: 'utf16' },
    };
  }

  /** Capture a cell-range location (workbook adapters). */
  function captureCellLocation(identity, sheetId, range) {
    checkIdentity(identity);
    if (!sheetId || !/^[A-Za-z]+[0-9]+(:[A-Za-z]+[0-9]+)?$/.test(String(range || ''))) {
      throw new Error('native-locate: a cell range looks like D5 or A1:B2');
    }
    return {
      documentId: identity.documentId,
      generation: identity.generation,
      kind: 'cell-range',
      sheetId: String(sheetId),
      range: String(range).toUpperCase(),
    };
  }

  /** Capture a slide-shape location (presentation adapters). */
  function captureSlideShapeLocation(identity, slideIndex, shapeId) {
    checkIdentity(identity);
    if (!Number.isSafeInteger(slideIndex) || slideIndex < 0) throw new Error('native-locate: slideIndex must be a non-negative integer');
    if (shapeId == null) throw new Error('native-locate: shapeId is required');
    return {
      documentId: identity.documentId,
      generation: identity.generation,
      kind: 'slide-shape',
      slideIndex,
      objectId: String(shapeId),
    };
  }

  /** The document's plain-text projection a text location resolves against. */
  function documentText(document) {
    if (!document || typeof document !== 'object') throw new Error('native-locate: a document model is required');
    if (typeof document.textProjection === 'function') return String(document.textProjection() || '');
    if (document.kind === 'docx' && typeof document.paragraphs === 'function') {
      return document.paragraphs().map((p) => p.text).join('\n');
    }
    if (document.kind === 'pptx' && typeof document.slideCount === 'function') {
      const parts = [];
      for (let i = 0; i < document.slideCount(); i += 1) {
        for (const run of document.runs(i)) parts.push(run.text);
      }
      return parts.join('\n');
    }
    if (document.kind === 'xlsx' && typeof document.sheets === 'function' && typeof document.listCells === 'function') {
      const parts = [];
      for (const sheet of document.sheets()) {
        for (const cell of document.listCells(sheet.name)) {
          const v = cell.cell && cell.cell.v;
          if (v != null) parts.push(String(v));
        }
      }
      return parts.join('\n');
    }
    throw new Error('native-locate: unknown document model kind');
  }

  /**
   * Resolve a location against a live adapter document (or a plain string for
   * text locations). Answers exact / lost / ambiguous — never a guess.
   */
  function resolveLocation(location, document) {
    if (!location || !location.kind) throw new Error('native-locate: a location needs a kind');
    if (location.documentId && document && document.documentId && location.documentId !== document.documentId) {
      return { resolution: 'lost', reason: 'document-id-mismatch', location };
    }
    if (location.generation && document && document.generation && location.generation !== document.generation) {
      // The file was replaced: the old location is void, not "approximately there".
      return { resolution: 'lost', reason: 'generation-mismatch', location };
    }
    if (location.kind === 'text') {
      const tq = requireTextQuote();
      const text = typeof document === 'string' ? document : documentText(document);
      const resolved = tq.resolveAnchor(text, location.quote);
      if (resolved.status === 'lost') return { resolution: 'lost', reason: 'quote-not-found', location };
      const total = countOccurrences(text, location.quote?.quote || '');
      if (total > 1) {
        const both = contextMatches(text, location.quote || {});
        if (both !== 1) {
          return { resolution: 'ambiguous', reason: both ? 'context-matches-multiple' : 'context-cannot-disambiguate', location, occurrences: total };
        }
      }
      return { resolution: 'exact', location, start: resolved.start, end: resolved.end, moved: resolved.moved, how: resolved.how };
    }
    if (location.kind === 'cell-range') {
      if (!document || typeof document.getCell !== 'function') throw new Error('native-locate: cell-range needs a workbook adapter');
      const cell = document.getCell(location.sheetId, location.range.split(':')[0]);
      if (!cell || !cell.exists) return { resolution: 'lost', reason: 'cell-not-found', location };
      return { resolution: 'exact', location, value: cell.value ?? null };
    }
    if (location.kind === 'slide-shape') {
      if (!document || typeof document.runs !== 'function') throw new Error('native-locate: slide-shape needs a presentation adapter');
      const runs = document.runs(location.slideIndex);
      if (!runs.some((r) => String(r.shapeId) === String(location.objectId))) {
        return { resolution: 'lost', reason: 'shape-not-found', location };
      }
      return { resolution: 'exact', location, texts: runs.filter((r) => String(r.shapeId) === String(location.objectId)).map((r) => r.text) };
    }
    // pdf-region / media-range carry their shapes; their engines arrive with
    // V4-07/V4-08 — reporting them unresolved is honest, guessing is not.
    return { resolution: 'lost', reason: 'kind-not-yet-resolvable', location };
  }

  /**
   * A clip record for the Scrapbook: the original sentence verbatim, the
   * paraphrase/note separate, and the location that returns to the source.
   */
  function clipRecord({ identity, location, verbatim, note, projectId }) {
    checkIdentity(identity);
    if (!location || !location.kind) throw new Error('native-locate: a clip needs a location');
    if (typeof verbatim !== 'string' || !verbatim.trim()) throw new Error('native-locate: the original sentence is required verbatim');
    return {
      schema: 1,
      documentId: identity.documentId,
      generation: identity.generation,
      projectId: projectId || null,
      location,
      verbatim: verbatim,
      note: typeof note === 'string' ? note : '',
      clippedAt: new Date().toISOString(),
    };
  }

  root.AISystem6NativeLocate = Object.freeze({
    captureTextLocation,
    captureCellLocation,
    captureSlideShapeLocation,
    resolveLocation,
    clipRecord,
    documentText,
  });
})(typeof window !== 'undefined' ? window : globalThis);
