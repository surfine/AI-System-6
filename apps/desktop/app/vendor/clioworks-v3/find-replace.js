/* ClioWorks N3 (core): the shared find/replace engine over the three Office document models.
 *
 * One engine for ClioWrite (docx, Quire model), the ClioChart workbook (xlsx, Ledger model)
 * and ClioStage (pptx, Lectern model). Roadmap N3: documents search paragraph by paragraph,
 * workbooks cell by cell, presentations text box by text box and speaker notes; every
 * replacement is a NAMED command on the document model (the UI is only a projection), and
 * 「全部替换」 is ONE named step in the undo history (e.g. 「全部替换 3 处」).
 *
 * `model` is an open adapter session (ClioWorksQuireAdapter.open / ClioWorksLedgerAdapter.open /
 * ClioWorksLecternAdapter.open) — the same object the editors hold. A raw document model
 * (the Quire doc, the Ledger wb, the Lectern presentation) is also accepted for find.
 *
 * Edits go through the edit operations the editors already use, so undo works:
 *  - docx: the vendored dmodel primitives (D.touch + the same text-run surgery as
 *    quire/ops.js cutRange) inside ONE D.tx per command, reported to the adapter with
 *    syncExternal() — one named undo step;
 *  - xlsx: adapter.setCell (the cell / formula edit steps) nested inside ONE outer
 *    wb.undo transaction — the Ledger Undo is depth-nested, so N cell edits are one
 *    named undo step and the adapter still counts the edit and invalidates dependents;
 *  - pptx: adapter.setRunText / adapter.setNotes. Today's lectern-adapter owns its
 *    snapshot history behind a closure-private transact, so a replaceAll over N runs is
 *    N undo steps; when the adapter exposes transact(label, fn), the engine runs the
 *    whole replaceAll inside it as one named step automatically.
 *
 * Never touched: fields (docx fb..fe runs, pptx fld runs), hyperlink targets (run rPr
 * passes through), formulas unless options.inFormulas, and content the adapters treat as
 * read-only — docx table paragraphs and pptx shapes without an editable text box report
 * matches with readOnly: true, and replaceAll skips them (returned as skipped).
 *
 * Tracked documents (docx settings.track) refuse replacement with code TRACKED: the
 * engine's surgery does not produce revision marks; a later job routes it through the
 * tracked ops instead.
 *
 * Exposes window.ClioWorksFindReplace = { find, replace, replaceAll }. No UI here.
 */
(function (root) {
  'use strict';

  const BLOCKED = (code, extra) => Object.assign({ status: 'blocked', code }, extra || {});
  const DEFAULTS = {
    caseSensitive: false,
    wholeWord: false,
    fullHalfWidthEquivalent: false,
    includeComments: false,
    includeNotes: false,
    inFormulas: false,
    scope: 'all',
  };
  const readOptions = (options) => Object.assign({}, DEFAULTS, options || {});

  /* ------------------------------------------------------- query matching (shared) */
  /* Width folding (full-width ASCII block and the ideographic space) and case folding
   * are both 1:1 per code point, so offsets in the folded string are offsets in the
   * original: a match found folded can be cut from the untouched text. */
  function fold(text, o) {
    let out = '';
    for (const ch of String(text)) {
      let cp = ch.codePointAt(0);
      if (o.fullHalfWidthEquivalent) {
        if (cp === 0x3000) cp = 0x20;
        else if (cp >= 0xff01 && cp <= 0xff5e) cp -= 0xfee0;
      }
      let s = String.fromCodePoint(cp);
      if (!o.caseSensitive) {
        const low = s.toLowerCase();
        if (low.length === 1) s = low; // a fold that changes length would move offsets
      }
      out += s;
    }
    return out;
  }

  /* wholeWord only constrains Latin letters/digits: Chinese has no word boundaries,
   * so a query that neither starts nor ends with one is matched without boundary checks. */
  const isLatinAlnum = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');

  /** matchIn(text, report(from, to, matchedText)) — non-overlapping, left to right. */
  function makeMatcher(query, o) {
    const q = fold(query, o);
    if (!q) return null;
    const word = !!o.wholeWord;
    const headWord = isLatinAlnum(q[0]);
    const tailWord = isLatinAlnum(q[q.length - 1]);
    return function (text, report) {
      const t = fold(text, o);
      const n = t.length;
      let i = 0;
      while ((i = t.indexOf(q, i)) >= 0) {
        const end = i + q.length;
        const bounded = !word || ((!headWord || i === 0 || !isLatinAlnum(t[i - 1]))
          && (!tailWord || end === n || !isLatinAlnum(t[end])));
        if (bounded) { report(i, end, String(text).slice(i, end)); i = end; }
        else i += 1;
      }
    };
  }

  /* ---------------------------------------------------------------- model unwrapping */
  /* The engine prefers the adapter session (it owns undo, revision counting and save);
     a raw model is enough to search. */
  const isAdapter = (model, prop) => !!model && typeof model[prop] === 'function';

  function quireDoc(model) {
    if (isAdapter(model, 'document')) return model.document();
    if (model && model.main) return model;
    throw new Error('find-replace: not a docx model (open one with ClioWorksQuireAdapter)');
  }
  function ledgerWb(model) {
    if (isAdapter(model, 'workbook')) return model.workbook();
    if (model && Array.isArray(model.sheets)) return model;
    throw new Error('find-replace: not an xlsx model (open one with ClioWorksLedgerAdapter)');
  }
  function lecternPres(model) {
    if (isAdapter(model, 'presentation')) return model.presentation();
    if (model && Array.isArray(model.slides)) return model;
    throw new Error('find-replace: not a pptx model (open one with ClioWorksLecternAdapter)');
  }
  /** Replacement mutates through the adapter's edit steps; a raw model cannot. */
  function requireAdapter(model, kind, prop) {
    if (isAdapter(model, prop)) return model;
    throw new Error('find-replace: ' + kind + ' replacement needs the adapter session (undo and save live there)');
  }

  /* Run the matcher over one text unit; breaks are offsets a match may not contain. */
  function collect(matcher, text, breaks, report) {
    matcher(text, (from, to, matched) => {
      if (breaks && breaks.some((b) => from < b && b < to)) return; // a match never crosses a segment
      report({ from, to, text: matched });
    });
  }

  /* =================================================================== docx (Quire) */
  /* The searchable text of a paragraph: its text runs, minus field content (between an
   * fb and its fe) and tracked deletions. Every other length-bearing item (tab, break,
   * picture…) breaks the text into segments; zero-length markers (comment ranges,
   * bookmarks, content controls) do not, so a match may span a comment boundary and the
   * marker survives the surgery. Offsets are into the concatenated text-run text. */
  function docxSpans(D, p) {
    const spans = [];
    const breaks = [];
    let text = '';
    let depth = 0;
    let segStart = true;
    for (let i = 0; i < p.runs.length; i++) {
      const it = p.runs[i];
      if (it.t === 'fb') { depth += 1; segStart = true; continue; }
      if (it.t === 'fe') { if (depth) depth -= 1; segStart = true; continue; }
      const n = D.ilen(it);
      if (depth || it.t !== 'text' || !n || (it.rPr && it.rPr.del)) {
        if (n && !depth) segStart = true;
        continue;
      }
      if (segStart && text.length) breaks.push(text.length);
      segStart = false;
      spans.push({ ri: i, item: it, start: text.length, end: text.length + n });
      text += it.text;
    }
    return { text, spans, breaks };
  }

  const spanCovering = (spans, at) => {
    for (const s of spans) if (at >= s.start && at < s.end) return s;
    return null;
  };

  /* Walk a story's block tree: paragraphs with an index path; table-cell paragraphs are
   * read-only (ClioWrite tables are read-only today). Shape textboxes are not searched:
   * the adapter surface does not reach them either. */
  function walkBlocks(blocks, visit, prefix, readOnly) {
    const list = Array.isArray(blocks) ? blocks : [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.t === 'p') visit(b, prefix.concat(i), readOnly);
      else if (b.t === 'tbl') {
        for (let r = 0; r < b.rows.length; r++) {
          const cells = b.rows[r].cells;
          for (let c = 0; c < cells.length; c++) walkBlocks(cells[c].blocks, visit, prefix.concat(i, r, c), true);
        }
      }
    }
  }

  function docxStories(doc, o) {
    const out = [];
    if (o.scope === 'all' || o.scope == null || o.scope === 'main') {
      out.push({ name: 'main', story: doc.main, blocks: doc.main && doc.main.blocks });
    }
    if (o.scope === 'all' || o.scope == null) {
      for (const key of Object.keys(doc.hf || {})) {
        const st = doc.hf[key];
        out.push({ name: (st && st.kind === 'ftr' ? 'footer:' : 'header:') + key, story: st, blocks: st && st.blocks });
      }
      if (o.includeNotes) {
        for (const key of Object.keys(doc.fn || {})) out.push({ name: 'footnote:' + key, story: doc.fn[key], blocks: doc.fn[key] && doc.fn[key].blocks });
        for (const key of Object.keys(doc.en || {})) out.push({ name: 'endnote:' + key, story: doc.en[key], blocks: doc.en[key] && doc.en[key].blocks });
      }
      if (o.includeComments) {
        for (const id of Object.keys(doc.comments || {})) out.push({ name: 'comment:' + id, story: doc.comments[id], blocks: doc.comments[id] && doc.comments[id].blocks });
      }
    }
    return out.filter((s) => s.blocks);
  }

  /** Every paragraph of the included stories; visit(p, storyName, path, readOnly). */
  function eachDocxParagraph(doc, o, visit) {
    for (const s of docxStories(doc, o)) walkBlocks(s.blocks, (p, path, ro) => visit(p, s.name, path, ro), [], false);
  }

  function docxFind(model, query, options) {
    const o = readOptions(options);
    const matcher = makeMatcher(query, o);
    if (!matcher) return [];
    const D = root.L && root.L.D;
    if (!D) throw new Error('find-replace: docx find needs the vendored Quire codec (L.D)');
    const doc = quireDoc(model);
    const out = [];
    eachDocxParagraph(doc, o, (p, storyName, path, readOnly) => {
      const { text, spans, breaks } = docxSpans(D, p);
      collect(matcher, text, breaks, (hit) => {
        const first = spanCovering(spans, hit.from);
        const last = spanCovering(spans, hit.to - 1);
        out.push({
          kind: 'docx',
          text: hit.text,
          readOnly,
          locator: { story: storyName, path, paragraphId: String(p.id), from: hit.from, to: hit.to, firstRun: first.ri, lastRun: last.ri },
        });
      }, breaks);
    });
    return out;
  }

  /** The same surgery as ops.js cutRange, restricted to text runs: split the first and
   * last covered runs at the match boundaries, drop fully covered text runs, keep every
   * zero-length marker, and put the replacement in with the FIRST covered run's rPr
   * (hyperlink targets and other run properties pass through untouched). */
  function docxApplyOne(root_, D, p, from, to, replacement) {
    const { spans } = docxSpans(D, p);
    const first = spanCovering(spans, from);
    const last = spanCovering(spans, to - 1);
    if (!first || !last) return false;
    const fCut = from - first.start;
    const lCut = to - last.start;
    const rPr = root_.L.clone(first.item.rPr || {});
    delete rPr.ins;
    delete rPr.del;
    const runs = p.runs;
    const out = [];
    for (let i = 0; i < runs.length; i++) {
      const it = runs[i];
      if (i < first.ri || i > last.ri) { out.push(it); continue; }
      const text = it.t === 'text' ? it.text : '';
      if (i === first.ri) {
        if (fCut > 0) out.push(Object.assign({}, it, { text: text.slice(0, fCut) }));
        if (replacement) out.push(D.text(replacement, rPr));
        if (first.ri === last.ri && lCut < text.length) out.push(Object.assign({}, it, { text: text.slice(lCut) }));
        continue;
      }
      if (i === last.ri) {
        if (lCut < text.length) out.push(Object.assign({}, it, { text: text.slice(lCut) }));
        continue;
      }
      if (D.ilen(it) === 0) out.push(it); // comment/bookmark markers inside the match stay
      /* a fully covered middle text run IS the match: dropped */
    }
    D.touch(p);
    p.runs = out;
    D.normalize(p);
    return true;
  }

  /** One named model command. Binds the model's global document the way the adapter does
   * around every operation, and reports the history move so the adapter's dirty source,
   * undo snapshot and save mode stay coherent with the engine's step. */
  function docxTransact(model, label, fn) {
    const L = root.L;
    const D = L.D;
    const adapter = isAdapter(model, 'document') ? model : null;
    const doc = adapter ? adapter.document() : model;
    if (doc.settings && doc.settings.track) return BLOCKED('TRACKED');
    D.doc = doc;
    let result;
    try {
      result = D.tx(label, fn);
    } finally {
      if (adapter && typeof adapter.syncExternal === 'function') adapter.syncExternal();
    }
    if (result === false) return BLOCKED('LOCKED_CONTROL'); // D.tx refused a locked content control
    return { result, entry: D.hist.undo[D.hist.undo.length - 1] || null };
  }

  function docxParagraphByLocator(doc, locator) {
    let found = null;
    eachDocxParagraph(doc, { scope: 'all', includeNotes: true, includeComments: true }, (p, storyName, path) => {
      if (found) return;
      if (storyName === locator.story && String(p.id) === String(locator.paragraphId) && path.join('/') === (locator.path || []).join('/')) found = p;
    });
    return found;
  }

  function docxVerify(D, p, match) {
    const { text } = docxSpans(D, p);
    return text.slice(match.locator.from, match.locator.to) === match.text;
  }

  function docxReplace(model, match, replacement) {
    if (!match || match.kind !== 'docx') return BLOCKED('BAD_MATCH');
    if (match.readOnly) return BLOCKED('READ_ONLY');
    const L = root.L;
    const D = L.D;
    const doc = quireDoc(model);
    const p = docxParagraphByLocator(doc, match.locator);
    if (!p) return BLOCKED('NO_TARGET');
    if (!docxVerify(D, p, match)) return BLOCKED('STALE_MATCH');
    if (replacement === match.text) return { count: 0, step: null };
    const step = docxTransact(model, '替换', () => {
      if (!docxApplyOne(root, D, p, match.locator.from, match.locator.to, String(replacement))) return BLOCKED('STALE_MATCH');
    });
    if (step && step.status === 'blocked') return step;
    return { count: 1, step: { label: '替换', entry: step.entry } };
  }

  function docxReplaceAll(model, query, replacement, options) {
    const o = readOptions(options);
    const matches = docxFind(model, query, o);
    const doable = matches.filter((m) => !m.readOnly);
    const skipped = matches.length - doable.length;
    if (!doable.length) return { count: 0, step: null, skipped };
    if (replacement === query) return { count: 0, step: null, skipped };
    const L = root.L;
    const D = L.D;
    const doc = quireDoc(model);
    // Group by paragraph and resolve the live objects up front, so the transaction only
    // performs verified surgery.
    const groups = new Map();
    for (const m of doable) {
      const key = m.locator.story + '#' + m.locator.path.join('/');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    const planned = [];
    for (const list of groups.values()) {
      const p = docxParagraphByLocator(doc, list[0].locator);
      if (!p) return BLOCKED('NO_TARGET');
      for (const m of list) {
        if (!docxVerify(D, p, m)) return BLOCKED('STALE_MATCH', { locator: m.locator });
        planned.push({ p, from: m.locator.from, to: m.locator.to });
      }
    }
    const label = '全部替换 ' + planned.length + ' 处';
    const step = docxTransact(model, label, () => {
      // Right-to-left within a paragraph keeps the earlier offsets valid.
      for (let i = planned.length - 1; i >= 0; i--) {
        const one = planned[i];
        if (!docxApplyOne(root, D, one.p, one.from, one.to, String(replacement))) throw new Error('find-replace: replaceAll match disappeared mid-transaction');
      }
    });
    if (step && step.status === 'blocked') return step;
    return { count: planned.length, step: { label, entry: step.entry }, skipped };
  }

  /* =================================================================== xlsx (Ledger) */
  const XLSX_RE = /^([A-Za-z]+)([0-9]+)$/;

  function xlsxRefOf(r, c) {
    const F = root.L && root.L.formula;
    if (F && typeof F.cellName === 'function') return F.cellName(r, c);
    let s = '';
    for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s + (r + 1);
  }

  /* The cell as the grid shows it — the same face the adapter's displayText gives:
     errors as their code, booleans as TRUE/FALSE, numbers through their number format. */
  function xlsxDisplay(wb, cell) {
    const v = cell.v;
    if (v == null || v === '') return '';
    if (v && typeof v === 'object' && v.e) return String(v.e);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') {
      let code = 'General';
      try { code = wb.styles.get(cell.s || 0).nf || 'General'; } catch (error) { /* default style */ }
      try { return String(root.L.numfmt.text(code, v)); } catch (error) { return String(v); }
    }
    return String(v);
  }

  function xlsxSheets(wb, o) {
    if (o.scope === 'all' || o.scope == null) return (wb.sheets || []).slice();
    const wanted = Array.isArray(o.scope) ? o.scope : [o.scope];
    return (wb.sheets || []).filter((sh) => wanted.includes(sh.name) || wanted.includes(sh.id));
  }

  function xlsxFind(model, query, options) {
    const o = readOptions(options);
    const matcher = makeMatcher(query, o);
    if (!matcher) return [];
    const wb = ledgerWb(model);
    const out = [];
    for (const sheet of xlsxSheets(wb, o)) {
      const rows = sheet.rows || [];
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row.cells) continue;
        for (const key in row.cells) {
          const cell = row.cells[key];
          if (!cell) continue;
          const c = Number(key);
          const base = { sheet: sheet.name, ref: xlsxRefOf(r, c), row: r + 1, col: c + 1 };
          if (typeof cell.f === 'string' && cell.f) {
            if (o.inFormulas) {
              collect(matcher, cell.f, null, (hit) => out.push({
                kind: 'xlsx', text: hit.text, readOnly: false, formula: true,
                locator: Object.assign({ from: hit.from, to: hit.to, formula: true, inFormula: true }, base),
              }));
            } else {
              const display = xlsxDisplay(wb, cell);
              if (display) collect(matcher, display, null, (hit) => out.push({
                kind: 'xlsx', text: hit.text, readOnly: true, formula: true,
                locator: Object.assign({ from: hit.from, to: hit.to, formula: true, displayed: true }, base),
              }));
            }
          } else if (typeof cell.v === 'string' && cell.v) {
            collect(matcher, cell.v, null, (hit) => out.push({
              kind: 'xlsx', text: hit.text, readOnly: false,
              locator: Object.assign({ from: hit.from, to: hit.to }, base),
            }));
          }
        }
      }
      if (o.includeComments && sheet.comments && typeof sheet.comments.values === 'function') {
        for (const cm of sheet.comments.values()) {
          if (!cm || typeof cm.text !== 'string' || !cm.text) continue;
          const base = { sheet: sheet.name, ref: xlsxRefOf(cm.r, cm.c), row: cm.r + 1, col: cm.c + 1, comment: true };
          collect(matcher, cm.text, null, (hit) => out.push({
            kind: 'xlsx', text: hit.text, readOnly: true, // no adapter edit step for comment text yet
            locator: Object.assign({ from: hit.from, to: hit.to }, base),
          }));
        }
      }
    }
    return out;
  }

  /* One cell with its matches: the source string (value or formula text), verified, and
   * the replacement result. Reads go through the live model so a stale caller fails here
   * instead of mid-transaction. */
  function xlsxPlanCell(adapter, wb, matches, inFormulas) {
    const first = matches[0];
    const sheet = (wb.sheets || []).find((sh) => sh.name === first.locator.sheet || sh.id === first.locator.sheet);
    if (!sheet) throw new Error('find-replace: unknown sheet ' + first.locator.sheet);
    const cell = sheet.get(first.locator.row - 1, first.locator.col - 1);
    if (!cell) throw new Error('find-replace: cell ' + first.locator.ref + ' disappeared');
    const source = inFormulas && first.locator.inFormula
      ? (typeof cell.f === 'string' ? cell.f : '')
      : (typeof cell.v === 'string' ? cell.v : String(cell.v == null ? '' : cell.v));
    let final = source;
    const ordered = matches.slice().sort((a, b) => b.locator.from - a.locator.from);
    for (const m of ordered) {
      const { from, to } = m.locator;
      if (source.slice(from, to) !== m.text) throw new Error('find-replace: stale match in ' + first.locator.sheet + '!' + first.locator.ref);
      final = final.slice(0, from) + m.replacement + final.slice(to);
    }
    const label = first.locator.inFormula ? 'formula' : 'cell';
    const patch = first.locator.inFormula ? { formula: final, label } : { value: final, label };
    return { sheet, ref: first.locator.ref, patch };
  }

  function xlsxReplaceAll(model, query, replacement, options) {
    const adapter = requireAdapter(model, 'xlsx', 'workbook');
    const o = readOptions(options);
    const matches = xlsxFind(model, query, o);
    const doable = matches.filter((m) => !m.readOnly);
    const skipped = matches.length - doable.length;
    if (!doable.length) return { count: 0, step: null, skipped };
    if (replacement === query) return { count: 0, step: null, skipped };
    const wb = adapter.workbook();
    // Group per cell and compute every final string BEFORE the transaction opens.
    const cells = new Map();
    for (const m of doable) {
      const key = m.locator.sheet + '!' + m.locator.ref + (m.locator.inFormula ? '#f' : '');
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(Object.assign({}, m, { replacement: String(replacement) }));
    }
    const planned = [];
    for (const list of cells.values()) planned.push(xlsxPlanCell(adapter, wb, list, o.inFormulas));
    const label = '全部替换 ' + doable.length + ' 处';
    // One outer wb.undo transaction around the adapter's cell/formula edit steps: the
    // Ledger Undo is depth-nested, so N setCell calls close as ONE named undo step.
    const undo = wb.undo;
    undo.begin(label);
    try {
      for (const plan of planned) {
        const res = adapter.setCell(plan.sheet.name, plan.ref, plan.patch);
        if (res && res.status === 'blocked') throw new Error('find-replace: the desk refused ' + plan.sheet.name + '!' + plan.ref + ': ' + JSON.stringify(res));
      }
    } finally {
      undo.end();
    }
    const entry = undo.stack[undo.stack.length - 1] || null;
    return { count: doable.length, step: { label, entry }, skipped };
  }

  function xlsxReplace(model, match, replacement) {
    if (!match || match.kind !== 'xlsx') return BLOCKED('BAD_MATCH');
    if (match.readOnly) return BLOCKED('READ_ONLY');
    const adapter = requireAdapter(model, 'xlsx', 'workbook');
    const wb = adapter.workbook();
    const plan = xlsxPlanCell(adapter, wb, [Object.assign({}, match, { replacement: String(replacement) })], !!match.locator.inFormula);
    if (replacement === match.text) return { count: 0, step: null };
    const res = adapter.setCell(plan.sheet.name, plan.ref, plan.patch);
    if (res && res.status === 'blocked') return res;
    return { count: 1, step: { label: match.locator.inFormula ? 'formula' : 'cell' } };
  }

  /* =================================================================== pptx (Lectern) */
  const EDITABLE_TYPES = new Set(['text', 'shape']);

  /* The searchable text of a text-box paragraph: its runs; a live field run (page
   * number, date) is never searched and breaks the text into segments. */
  function pptxSpans(para) {
    const rs = Array.isArray(para.rs) ? para.rs : [];
    const spans = [];
    const breaks = [];
    let text = '';
    let segStart = true;
    for (let i = 0; i < rs.length; i++) {
      const run = rs[i];
      const t = run && typeof run.t === 'string' ? run.t : '';
      if (!run || run.fld) { segStart = true; continue; }
      if (!t) continue;
      if (segStart && text.length) breaks.push(text.length);
      segStart = false;
      spans.push({ ri: i, start: text.length, end: text.length + t.length });
      text += t;
    }
    return { text, spans, breaks, rs };
  }

  function pptxFind(model, query, options) {
    const o = readOptions(options);
    const matcher = makeMatcher(query, o);
    if (!matcher) return [];
    const pres = lecternPres(model);
    const out = [];
    const wantSlides = o.scope === 'all' || o.scope == null || o.scope === 'slides';
    const wantNotes = (o.scope === 'all' || o.scope == null || o.scope === 'notes') && o.includeNotes;
    for (const slide of pres.slides) {
      if (wantSlides) {
        for (const shape of slide.shapes || []) {
          const tx = shape && shape.tx;
          if (!tx || !Array.isArray(tx.ps)) continue;
          const editable = EDITABLE_TYPES.has(shape.type);
          tx.ps.forEach((para, pi) => {
            const { text, spans, breaks } = pptxSpans(para);
            collect(matcher, text, breaks, (hit) => {
              const first = spanCovering(spans, hit.from);
              const last = spanCovering(spans, hit.to - 1);
              const matchSpans = spans
                .filter((s) => s.end > hit.from && s.start < hit.to)
                .map((s) => ({ ri: s.ri, from: Math.max(0, hit.from - s.start), to: Math.min(s.end, hit.to) - s.start }));
              out.push({
                kind: 'pptx',
                text: hit.text,
                readOnly: !editable,
                locator: {
                  slide: slide.id, shape: shape.id, paragraph: pi,
                  from: hit.from, to: hit.to,
                  run: first.ri, runFrom: hit.from - first.start, runTo: hit.to - last.start,
                  spans: matchSpans,
                },
              });
            });
          });
        }
      }
      if (wantNotes && typeof slide.notes === 'string' && slide.notes) {
        collect(matcher, slide.notes, null, (hit) => out.push({
          kind: 'pptx', text: hit.text, readOnly: false,
          locator: { slide: slide.id, notes: true, from: hit.from, to: hit.to },
        }));
      }
      if (o.includeComments) {
        const L = root.L;
        let entries = null;
        try { entries = L && L.comments && typeof L.comments.entries === 'function' ? L.comments.entries(pres, slide) : null; } catch (error) { entries = null; }
        for (const entry of entries || []) {
          if (!entry || typeof entry.text !== 'string' || !entry.text) continue;
          collect(matcher, entry.text, null, (hit) => out.push({
            kind: 'pptx', text: hit.text, readOnly: true, // no adapter edit step for comment text yet
            locator: { slide: slide.id, comment: entry.uid != null ? String(entry.uid) : String(entry.id), from: hit.from, to: hit.to },
          }));
        }
      }
    }
    return out;
  }

  /** Re-resolve a paragraph locator against the live model. Returns { slide, shape, para, rs } or null. */
  function pptxParaByLocator(pres, locator) {
    const slide = (pres.slides || []).find((sl) => sl.id === locator.slide);
    if (!slide) return null;
    const shape = (slide.shapes || []).find((sh) => sh && sh.id === locator.shape);
    if (!shape || !shape.tx || !Array.isArray(shape.tx.ps)) return null;
    const para = shape.tx.ps[locator.paragraph];
    if (!para) return null;
    return { slide, shape, para, rs: Array.isArray(para.rs) ? para.rs : [] };
  }

  function pptxVerifyPara(pres, locator, match) {
    const hit = pptxParaByLocator(pres, locator);
    if (!hit) return null;
    const { text } = pptxSpans(hit.para);
    return text.slice(locator.from, locator.to) === match.text ? hit : null;
  }

  /** The final text of every covered run after applying matches right-to-left. */
  function pptxFinalRunTexts(rs, matches, replacement) {
    const finals = rs.map((run) => (run && typeof run.t === 'string' ? run.t : ''));
    for (const m of matches.slice().sort((a, b) => b.locator.from - a.locator.from)) {
      const spans = m.locator.spans;
      const first = spans[0];
      const last = spans[spans.length - 1];
      const before = finals[first.ri].slice(0, first.from);
      const after = finals[last.ri].slice(last.to);
      for (const s of spans) finals[s.ri] = '';
      finals[first.ri] = before + replacement;
      if (last.ri === first.ri) finals[first.ri] = before + replacement + after;
      else finals[last.ri] = after;
    }
    return finals;
  }

  function pptxReplace(model, match, replacement) {
    if (!match || match.kind !== 'pptx') return BLOCKED('BAD_MATCH');
    if (match.readOnly) return BLOCKED('READ_ONLY');
    const adapter = requireAdapter(model, 'pptx', 'presentation');
    const pres = lecternPres(model);
    const loc = match.locator;
    const text = String(replacement);
    if (loc.notes) {
      const slide = (pres.slides || []).find((sl) => sl.id === loc.slide);
      if (!slide) return BLOCKED('NO_TARGET');
      const notes = typeof slide.notes === 'string' ? slide.notes : '';
      if (notes.slice(loc.from, loc.to) !== match.text) return BLOCKED('STALE_MATCH');
      if (text === match.text) return { count: 0, step: null };
      adapter.setNotes(loc.slide, notes.slice(0, loc.from) + text + notes.slice(loc.to));
      return { count: 1, step: { label: 'notes' } };
    }
    if (loc.comment) return BLOCKED('READ_ONLY');
    const hit = pptxVerifyPara(pres, loc, match);
    if (!hit) return BLOCKED(text === match.text ? 'NO_TARGET' : 'STALE_MATCH');
    if (text === match.text) return { count: 0, step: null };
    if (loc.spans.length === 1) {
      const run = hit.rs[loc.run];
      const current = run && typeof run.t === 'string' ? run.t : '';
      if (current.slice(loc.runFrom, loc.runTo) !== match.text) return BLOCKED('STALE_MATCH');
      const res = adapter.setRunText(loc.slide, loc.shape + ':' + loc.paragraph + ':' + loc.run, current.slice(0, loc.runFrom) + text + current.slice(loc.runTo));
      if (res && res.status === 'blocked') return res;
      return { count: 1, step: { label: 'text' } };
    }
    /* A match across several runs: the first run takes prefix + replacement (its own
     * formatting), the tail keeps the last run's remainder, covered middle runs empty
     * out. Each run's text goes through the adapter's own run edit step. */
    const finals = pptxFinalRunTexts(hit.rs, [match], text);
    for (const s of loc.spans) {
      if (finals[s.ri] === (hit.rs[s.ri] ? hit.rs[s.ri].t : '')) continue;
      const res = adapter.setRunText(loc.slide, loc.shape + ':' + loc.paragraph + ':' + s.ri, finals[s.ri]);
      if (res && res.status === 'blocked') return res;
    }
    return { count: 1, step: { label: 'text', steps: loc.spans.length } };
  }

  function pptxReplaceAll(model, query, replacement, options) {
    const adapter = requireAdapter(model, 'pptx', 'presentation');
    const o = readOptions(options);
    const matches = pptxFind(model, query, o);
    const doable = matches.filter((m) => !m.readOnly);
    const skipped = matches.length - doable.length;
    if (!doable.length) return { count: 0, step: null, skipped };
    if (replacement === query) return { count: 0, step: null, skipped };
    const pres = lecternPres(model);
    const text = String(replacement);
    // Verify everything against the live model before any edit.
    const paras = new Map(); // slide|shape|para -> matches
    const notes = new Map(); // slide -> matches
    for (const m of doable) {
      const loc = m.locator;
      if (loc.notes) {
        const slide = (pres.slides || []).find((sl) => sl.id === loc.slide);
        if (!slide) return BLOCKED('NO_TARGET');
        const current = typeof slide.notes === 'string' ? slide.notes : '';
        if (current.slice(loc.from, loc.to) !== m.text) return BLOCKED('STALE_MATCH', { locator: loc });
        if (!notes.has(loc.slide)) notes.set(loc.slide, []);
        notes.get(loc.slide).push(m);
        continue;
      }
      if (loc.comment) return BLOCKED('READ_ONLY');
      const hit = pptxVerifyPara(pres, loc, m);
      if (!hit) return BLOCKED('STALE_MATCH', { locator: loc });
      const key = loc.slide + '|' + loc.shape + '|' + loc.paragraph;
      if (!paras.has(key)) paras.set(key, { slide: loc.slide, shape: loc.shape, paragraph: loc.paragraph, para: hit.para, hits: [] });
      paras.get(key).hits.push(m);
    }
    const label = '全部替换 ' + doable.length + ' 处';
    const edits = [];
    for (const group of paras.values()) {
      const finals = pptxFinalRunTexts(group.para.rs, group.hits, text);
      group.para.rs.forEach((run, ri) => {
        if ((run && typeof run.t === 'string' ? run.t : '') !== finals[ri]) {
          edits.push({ run: group.slide + ':' + group.shape + ':' + group.paragraph + ':' + ri, text: finals[ri] });
        }
      });
    }
    const noteEdits = [];
    for (const [slideId, list] of notes) {
      const slide = (pres.slides || []).find((sl) => sl.id === slideId);
      const current = typeof slide.notes === 'string' ? slide.notes : '';
      const ordered = list.slice().sort((a, b) => b.locator.from - a.locator.from);
      let next = current;
      for (const m of ordered) next = next.slice(0, m.locator.from) + text + next.slice(m.locator.to);
      noteEdits.push({ slide: slideId, text: next });
    }
    /* When the adapter exposes a batch transaction the whole replaceAll becomes one
     * named step with direct model edits; until then every run/note goes through its
     * own adapter edit step (each individually undoable). */
    if (typeof adapter.transact === 'function') {
      adapter.transact(label, () => {
        for (const e of edits) {
          const parts = e.run.split(':');
          const slide = (pres.slides || []).find((sl) => sl.id === parts[0]);
          const shape = slide && (slide.shapes || []).find((sh) => sh.id === parts[1]);
          const para = shape && shape.tx && shape.tx.ps[Number(parts[2])];
          const rs = para && Array.isArray(para.rs) ? para.rs : [];
          const run = rs[Number(parts[3])];
          if (run) run.t = e.text;
        }
        for (const e of noteEdits) {
          const slide = (pres.slides || []).find((sl) => sl.id === e.slide);
          if (slide) slide.notes = e.text;
        }
      });
      return { count: doable.length, step: { label }, skipped };
    }
    for (const e of edits) {
      const res = adapter.setRunText(e.run.split(':')[0], e.run.slice(e.run.indexOf(':') + 1), e.text);
      if (res && res.status === 'blocked') return res;
    }
    for (const e of noteEdits) {
      const res = adapter.setNotes(e.slide, e.text);
      if (res && res.status === 'blocked') return res;
    }
    return { count: doable.length, step: { label, steps: edits.length + noteEdits.length }, skipped };
  }

  /* ==================================================================== facade */
  function find(model, kind, query, options) {
    if (kind === 'docx') return docxFind(model, query, options);
    if (kind === 'xlsx') return xlsxFind(model, query, options);
    if (kind === 'pptx') return pptxFind(model, query, options);
    throw new Error('find-replace: unknown kind ' + kind);
  }

  function replace(model, kind, match, replacement) {
    if (kind === 'docx') return docxReplace(model, match, replacement);
    if (kind === 'xlsx') return xlsxReplace(model, match, replacement);
    if (kind === 'pptx') return pptxReplace(model, match, replacement);
    throw new Error('find-replace: unknown kind ' + kind);
  }

  function replaceAll(model, kind, query, replacement, options) {
    if (kind === 'docx') return docxReplaceAll(model, query, replacement, options);
    if (kind === 'xlsx') return xlsxReplaceAll(model, query, replacement, options);
    if (kind === 'pptx') return pptxReplaceAll(model, query, replacement, options);
    throw new Error('find-replace: unknown kind ' + kind);
  }

  root.ClioWorksFindReplace = Object.freeze({ find, replace, replaceAll });
})(typeof window !== 'undefined' ? window : globalThis);
