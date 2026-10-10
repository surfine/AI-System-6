/* ClioWorks v4 (V4-04): data references and the editable-object handover.
 *
 * A workbook range the narration or a chart cites is captured as a REFERENCE,
 * not pasted as loose numbers:
 *  - Range semantics: sheet + A1 range + the revision the copy was made at;
 *    hidden sheets stay out unless explicitly included (隐藏表默认不带出).
 *  - Blank is not zero: an empty cell records { blank: true }; it never
 *    becomes 0 on the way into text or a chart (空白不等于零).
 *  - One computation owner: GridCraft recalculates; a captured reference
 *    carries the calcResult binding (input snapshot identity) so a derived
 *    value is never mistaken for a source value.
 *  - Updates apply as DECLARED SPANS on the target text — the exact needle,
 *    verified unique — never a wholesale number replace across the document
 *    (不能简单全文替换数字).
 *
 * The handover to another editor rides core/edit-embeds.js: a copy with a
 * source { app, fileId, ref, rev, kept } and sourceState(), never a live link.
 * No DOM, no translations: the executable contract runs this bare.
 */
(function (root) {
  'use strict';
  if (root.AISystem6DataReferences) return;

  function embeds() {
    const api = root.AISystem6EditEmbeds;
    if (!api || typeof api.contentRev !== 'function' || typeof api.sourceState !== 'function') {
      throw new Error('data-references: core/edit-embeds.js is required');
    }
    return api;
  }

  function splitRange(range) {
    const match = /^([A-Za-z]+[0-9]+)(?::([A-Za-z]+[0-9]+))?$/.exec(String(range || '').trim());
    if (!match) throw new Error('data-references: a range looks like D5 or A1:B4');
    return { from: match[1].toUpperCase(), to: (match[2] || match[1]).toUpperCase() };
  }

  function cellToRC(ref) {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref);
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { row: Number(m[2]), col };
  }

  function expandRange(range) {
    const { from, to } = splitRange(range);
    const a = cellToRC(from);
    const b = cellToRC(to);
    const out = [];
    for (let row = a.row; row <= b.row; row += 1) {
      for (let col = a.col; col <= b.col; col += 1) {
        let c = col;
        let name = '';
        do { name = String.fromCharCode(64 + ((c - 1) % 26 + 1)) + name; c = Math.floor((c - 1) / 26); } while (c > 0);
        out.push(name + row);
      }
    }
    if (out.length > 4096) throw new Error('data-references: range too large to capture as a reference');
    return out;
  }

  /**
   * Capture a range reference from a live workbook adapter.
   * @param {{documentId:string, generation:number}} identity
   * @param {object} adapter the Ledger adapter (sheets/getCell)
   * @param {string} sheetId @param {string} range
   * @param {{includeHidden?:boolean, calcResultId?:string}} [options]
   */
  function captureRangeReference(identity, adapter, sheetId, range, options = {}) {
    if (!identity || typeof identity.documentId !== 'string') throw new Error('data-references: documentId is required');
    if (!adapter || typeof adapter.getCell !== 'function' || typeof adapter.sheets !== 'function') {
      throw new Error('data-references: a workbook adapter is required');
    }
    const sheet = adapter.sheets().find((s) => s.name === sheetId || s.id === sheetId);
    if (!sheet) throw new Error(`data-references: unknown sheet ${sheetId}`);
    const hidden = sheet.state === 'hidden' || sheet.state === 'veryHidden';
    if (hidden && !options.includeHidden) {
      const error = new Error(`data-references: sheet ${sheet.name} is ${sheet.state}; hidden sheets stay out unless explicitly included`);
      error.code = 'HIDDEN_SHEET';
      throw error;
    }
    const cells = expandRange(range).map((ref) => {
      const cell = adapter.getCell(sheet.name, ref);
      if (!cell || !cell.exists) return { ref, blank: true };
      const entry = { ref };
      if (cell.formula != null) entry.formula = cell.formula;
      entry.value = cell.value === undefined ? null : cell.value;
      if (cell.formula == null) entry.literal = true;
      return entry;
    });
    return {
      schema: 1,
      documentId: identity.documentId,
      generation: identity.generation,
      sheetId: sheet.name,
      sheetState: sheet.state || 'visible',
      includedHidden: !!options.includeHidden,
      range: `${splitRange(range).from}:${splitRange(range).to}`,
      cells,
      // The copy's content revision (edit-embeds' short hash): "changed since
      // the copy" is decided against THIS, never against live sheet state.
      rev: embeds().contentRev(cells),
      ...(options.calcResultId ? { calcResultId: options.calcResultId } : {}),
    };
  }

  /**
   * Declared spans for a paragraph update: one needle per non-blank cell,
   * materialised from the values the copy holds. The needle must occur exactly
   * once in the target text when it is applied.
   */
  function declaredSpans(reference, { needles } = {}) {
    if (!reference || reference.schema !== 1) throw new Error('data-references: a captured reference is required');
    if (needles && needles.length !== reference.cells.length) {
      throw new Error('data-references: one needle per cell (blanks included) — the shape never reflows');
    }
    return reference.cells.map((cell, index) => {
      const needle = needles ? needles[index] : String(cell.blank ? '' : (cell.value ?? ''));
      return {
        cellRef: cell.ref,
        blank: !!cell.blank,
        value: cell.blank ? null : cell.value,
        needle,
      };
    }).filter((span) => span.needle && String(span.needle).length > 0);
  }

  /**
   * The update spans between two captures of the SAME range: the needle is
   * the value the before-copy held (what the text says now), the replacement
   * is the after-copy's value. Cell refs must line up; blank↔value turns are
   * carried as empty-string replacements.
   */
  function spansBetween(before, after) {
    if (!before || !after || before.schema !== 1 || after.schema !== 1) throw new Error('data-references: two captured references are required');
    if (before.documentId !== after.documentId || before.range !== after.range || before.sheetId !== after.sheetId) {
      throw new Error('data-references: spans compare the same sheet range of the same document');
    }
    return before.cells.map((cell, index) => {
      const next = after.cells[index];
      if (!next || next.ref !== cell.ref) throw new Error('data-references: the range shape changed between captures');
      const needle = cell.blank ? '' : String(cell.value ?? '');
      return {
        cellRef: cell.ref,
        blank: !!next.blank,
        value: next.blank ? '' : next.value,
        needle,
      };
    }).filter((span) => span.needle.length > 0);
  }

  /**
   * Apply declared spans to a text. Each needle must occur EXACTLY once (or a
   * position must pin it); otherwise the whole application refuses — numbers
   * are never replaced wholesale across the document.
   */
  function applySpans(text, spans, { positions } = {}) {
    const source = String(text ?? '');
    const edits = [];
    for (let index = 0; index < spans.length; index += 1) {
      const span = spans[index];
      const replacement = span.blank ? '' : String(span.value ?? '');
      let at;
      if (positions && Number.isFinite(positions[index])) {
        at = positions[index];
        if (source.slice(at, at + span.needle.length) !== span.needle) {
          const error = new Error(`data-references: the pinned span for ${span.cellRef} no longer matches its needle`);
          error.code = 'SPAN_MOVED';
          throw error;
        }
      } else {
        const first = source.indexOf(span.needle);
        if (first < 0) {
          const error = new Error(`data-references: the value for ${span.cellRef} is not in the target text`);
          error.code = 'SPAN_NOT_FOUND';
          throw error;
        }
        if (source.indexOf(span.needle, first + 1) >= 0) {
          const error = new Error(`data-references: the value for ${span.cellRef} occurs more than once; pin the occurrence or edit by hand`);
          error.code = 'SPAN_AMBIGUOUS';
          throw error;
        }
        at = first;
      }
      edits.push({ start: at, end: at + span.needle.length, text: replacement, cellRef: span.cellRef });
    }
    edits.sort((a, b) => a.start - b.start);
    let out = '';
    let cursor = 0;
    for (const edit of edits) {
      if (edit.start < cursor) throw new Error('data-references: spans overlap');
      out += source.slice(cursor, edit.start) + edit.text;
      cursor = edit.end;
    }
    return out + source.slice(cursor);
  }

  /**
   * The embed handover for a chart/deck copy of the reference: the edit-embeds
   * envelope source. A changed original is offered, never applied.
   */
  function embedSource(reference, { app = 'ledger', fileId } = {}) {
    if (!reference || reference.schema !== 1) throw new Error('data-references: a captured reference is required');
    return {
      app,
      fileId: fileId || reference.documentId,
      ref: `${reference.sheetId}!${reference.range}`,
      rev: reference.rev,
      kept: null,
    };
  }

  /** Has the original moved on since the copy? current | changed | missing. */
  function referenceState(reference, currentRev) {
    return embeds().sourceState({ source: { rev: reference.rev } }, currentRev);
  }

  root.AISystem6DataReferences = Object.freeze({
    captureRangeReference,
    declaredSpans,
    spansBetween,
    applySpans,
    embedSource,
    referenceState,
    expandRange,
  });
})(typeof window !== 'undefined' ? window : globalThis);
