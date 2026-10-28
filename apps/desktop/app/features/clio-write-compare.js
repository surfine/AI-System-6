/* ClioWorks 比较→修订 (GenOffice compare): ClioWrite's 「与另一份比较…」.
 *
 * The GenOffice suite's compare-to-revisions, answered on the desk's own
 * documents: the writer picks a second .docx, the two live Quire models are
 * aligned paragraph by paragraph, and the differences come back as CANDIDATES
 * (R5 — the compare never touches the document by itself). 「采用为修订」
 * writes the candidate's own ins/del stamps into the current model as ONE
 * named model command (「比较：采用第 N 条」 / 「比较：采用全部」, one undo
 * step each batch), and from there the N13a 修订 windoid accepts or rejects
 * them like any Word tracked change — the compare produces REVISION MARKS,
 * the final wording still travels the revision flow. That is the whole
 * meaning of 比较→修订.
 *
 * Boundaries (this version):
 *  - Body paragraphs and table cell text only. A table difference aligns
 *    CELL BY CELL (same row and column) into paragraph-level marks on the
 *    cell's one paragraph; a cell with several paragraphs, or a grid that
 *    grew or shrank, is only REPORTED (结构不同), never guessed at.
 *  - A picture difference is only reported as a fact (有差异); no picture
 *    diff, and an added paragraph that carries a picture is not adoptable
 *    (its bytes cannot travel through a text compare).
 *  - Formatting (font, colour, sizes) is not compared — words only. A run
 *    struck through by a pending deletion is not prose yet and reads as
 *    absent (the word count's own rule); inserted-but-unaccepted words are
 *    prose. Tabs and line breaks carry no words and are not compared.
 *  - No three-way compare, no merge.
 *
 * The engine half (unitsOf / compareDocuments / applyCandidates) holds no
 * DOM and runs headless in the contract's VM; the windoid half rides the
 * same lazy loader as the N13a review side path (config.js
 * ensureClioWriteReviewModule, with the shared word-diff core ahead of it)
 * and reuses the review windoid's own bones — 1-bit, no reviewer colours:
 * inserted words underlined, deleted words struck through, the same marks
 * the document itself draws. The author on every stamp is the revision
 * name N13b remembers (L.store 'userName'); a first compare with no
 * remembered name asks once on the same 「署名」 dialog. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWriteCompare) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);

  /* ------------------------------------------------- the model, as compare reads it */

  const IMAGE_TYPES = new Set(['img', 'shape', 'group', 'chart']);
  const isDeleted = (run) => !!(run && run.rPr && run.rPr.del);
  const isInserted = (run) => !!(run && run.rPr && run.rPr.ins);

  /** One paragraph's final words (struck-through runs are not prose yet) and
   * whether it draws a picture. Empty text means nothing to compare. */
  function readParagraph(p) {
    let text = '';
    let hasImage = false;
    for (const run of (p && Array.isArray(p.runs) ? p.runs : [])) {
      if (IMAGE_TYPES.has(run.t)) hasImage = true;
      else if (run.t === 'text' && !isDeleted(run)) text += String(run.text || '');
    }
    return { text, hasImage };
  }

  const cellKey = (cell) => cell.text + (cell.hasImage ? '\u0003' : '');

  /** The comparable units of one adapter's main story, in reading order: every
   * non-empty paragraph, and every table as its per-cell text grid. */
  function unitsOf(adapter) {
    const doc = adapter && typeof adapter.document === 'function' ? adapter.document() : null;
    const blocks = doc && doc.main && Array.isArray(doc.main.blocks) ? doc.main.blocks : [];
    const units = [];
    for (const block of blocks) {
      if (!block) continue;
      if (block.t === 'p') {
        const reading = readParagraph(block);
        if (!reading.text) continue;   // an empty paragraph carries no words to compare
        units.push({ type: 'para', id: String(block.id), text: reading.text, hasImage: reading.hasImage });
      } else if (block.t === 'tbl') {
        const rows = (Array.isArray(block.rows) ? block.rows : []).map((row) =>
          (Array.isArray(row.cells) ? row.cells : []).map((cell) => {
            const paras = Array.isArray(cell.blocks) ? cell.blocks.filter((b) => b && b.t === 'p') : [];
            const readings = paras.map(readParagraph);
            return {
              text: readings.map((r) => r.text).join('\n'),
              hasImage: readings.some((r) => r.hasImage),
              paragraphIds: paras.map((p) => String(p.id)),
              paragraphs: paras.length,
            };
          }));
        units.push({ type: 'table', id: String(block.id), rows });
      }
    }
    return units;
  }

  /** Longest common subsequence of equal units (manuscript-roundtrip's own
   * walk): index pairs in reading order, or null past the cell cap. */
  const ALIGN_CELL_CAP = 250_000;
  function textMatches(aKeys, bKeys) {
    const n = aKeys.length;
    const m = bKeys.length;
    if (!n || !m || n * m > ALIGN_CELL_CAP) return null;
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * width + j] = aKeys[i] === bKeys[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    const pairs = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (aKeys[i] === bKeys[j]) { pairs.push([i, j]); i += 1; j += 1; }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
      else j += 1;
    }
    return pairs;
  }

  const unitKey = (unit) => unit.type === 'table'
    ? unit.rows.map((row) => row.map(cellKey).join('\u0002')).join('\u0001')
    : unit.text + (unit.hasImage ? '\u0003' : '');

  /** Whole-paragraph fallback when the word-diff core is not on this root. */
  const wholeHunk = (before, after) => [{ kind: 'replace', before: { start: 0, end: before.length }, after: { start: 0, end: after.length } }];

  function wordHunks(before, after) {
    const api = root.AISystem6WordDiff;
    if (!api || typeof api.wordDiff !== 'function') return wholeHunk(before, after);
    const hunks = api.wordDiff(before, after).hunks || [];
    return hunks.length ? hunks : wholeHunk(before, after);
  }

  /**
   * The two documents' differences as candidate rows, in reading order. Each
   * row is { index (第 N 条), kind, adoptable, before, after, hunks? } plus the
   * locator the adoption needs (paragraphId for changed/removed/cell; the
   * anchor paragraph or table an added row inserts after). Nothing is written.
   * @param {object} adapterA the current document (the one revision marks land in)
   * @param {object} adapterB the other file
   */
  function compareDocuments(adapterA, adapterB) {
    const a = unitsOf(adapterA);
    const b = unitsOf(adapterB);
    const aKeys = a.map(unitKey);
    const bKeys = b.map(unitKey);
    const pairs = textMatches(aKeys, bKeys)
      || aKeys.map((key, index) => [index, bKeys.indexOf(key, index)]).filter(([, j]) => j >= 0);   // positional fallback under-reports, never invents

    const candidates = [];
    let anchor = null;   // the last A-side unit an inserted paragraph can follow
    const push = (candidate) => candidates.push(Object.assign({ index: candidates.length + 1 }, candidate));

    const unitText = (unit) => unit.type === 'table'
      ? unit.rows.map((row) => row.map((cell) => cell.text).join('\t')).join('\n')
      : unit.text;

    const pushPair = (unitA, unitB) => {
      anchor = unitA;
      if (unitA.type === 'table' && unitB.type === 'table') {
        const rows = Math.max(unitA.rows.length, unitB.rows.length);
        for (let r = 0; r < rows; r += 1) {
          const rowA = unitA.rows[r] || [];
          const rowB = unitB.rows[r] || [];
          const cols = Math.max(rowA.length, rowB.length);
          for (let c = 0; c < cols; c += 1) {
            const cellA = rowA[c] || null;
            const cellB = rowB[c] || null;
            if (cellA && cellB && cellKey(cellA) === cellKey(cellB)) continue;
            if (!cellA || !cellB) { push({ kind: 'structure', adoptable: false, before: cellA ? cellA.text : '', after: cellB ? cellB.text : '' }); continue; }
            if (cellA.hasImage || cellB.hasImage) { push({ kind: 'image', adoptable: false, before: cellA.text, after: cellB.text, row: r + 1, column: c + 1 }); continue; }
            if (cellA.paragraphs !== 1) { push({ kind: 'structure', adoptable: false, before: cellA.text, after: cellB.text, row: r + 1, column: c + 1 }); continue; }
            push({ kind: 'cell', adoptable: true, paragraphId: cellA.paragraphIds[0], before: cellA.text, after: cellB.text, hunks: wordHunks(cellA.text, cellB.text), row: r + 1, column: c + 1 });
          }
        }
        return;
      }
      if (unitA.type !== 'para' || unitB.type !== 'para') {
        // 段落对面是表格（或反过来）：结构不同，只报事实。
        push({ kind: 'structure', adoptable: false, before: unitText(unitA), after: unitText(unitB) });
        return;
      }
      if (unitA.text === unitB.text) {
        if (unitA.hasImage !== unitB.hasImage) push({ kind: 'image', adoptable: false, paragraphId: unitA.id, before: unitA.text, after: unitB.text });
        return;
      }
      push({
        kind: 'changed', adoptable: true, paragraphId: unitA.id,
        before: unitA.text, after: unitB.text, hunks: wordHunks(unitA.text, unitB.text),
        imageNote: unitA.hasImage !== unitB.hasImage,
      });
    };

    const pushRemoved = (unitA) => {
      anchor = unitA;
      if (unitA.type === 'table') { push({ kind: 'structure', adoptable: false, before: unitText(unitA), after: '' }); return; }
      // 删除段内的图片随整段一起划删（trackDelete 的同一路）；新增段的图片带不过去，才不可采用。
      push({ kind: 'removed', adoptable: true, paragraphId: unitA.id, before: unitA.text, after: '' });
    };

    const pushAdded = (unitB) => {
      if (unitB.type === 'table') { push({ kind: 'structure', adoptable: false, before: '', after: unitText(unitB) }); return; }
      push({
        kind: 'added', adoptable: !unitB.hasImage, imageNote: unitB.hasImage,
        anchorParaId: anchor && anchor.type === 'para' ? anchor.id : '',
        anchorTableId: anchor && anchor.type === 'table' ? anchor.id : '',
        before: '', after: unitB.text,
      });
    };

    let cursorA = 0;
    let cursorB = 0;
    const gap = (untilA, untilB) => {
      const left = [];
      const right = [];
      while (cursorA < untilA) left.push(a[cursorA++]);
      while (cursorB < untilB) right.push(b[cursorB++]);
      const paired = Math.min(left.length, right.length);
      for (let k = 0; k < paired; k += 1) pushPair(left[k], right[k]);
      for (let k = paired; k < left.length; k += 1) pushRemoved(left[k]);
      for (let k = paired; k < right.length; k += 1) pushAdded(right[k]);
    };
    for (const [i, j] of pairs) {
      gap(i, j);
      anchor = a[i];   // matched units are equal down to their picture flags
      cursorA = i + 1;
      cursorB = j + 1;
    }
    gap(a.length, b.length);

    const count = (kind) => candidates.filter((c) => c.kind === kind).length;
    return {
      candidates,
      summary: {
        total: candidates.length,
        changed: count('changed'),
        added: count('added'),
        removed: count('removed'),
        cells: count('cell'),
        images: count('image'),
        structure: count('structure'),
      },
    };
  }

  /* ------------------------------------------------- adoption: marks into the model */

  const stampOf = (D, author) => ({
    author: String(author || ''),
    date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    id: D.nid(),
  });

  /** Kept-text spans of one paragraph: where each final-text offset sits in the
   * model, whose own offsets also count struck-through words and pictures. */
  function finalSpans(D, p) {
    const spans = [];
    let model = 0;
    let text = 0;
    for (const run of p.runs) {
      const n = D.ilen(run);
      if (n && run.t === 'text' && !isDeleted(run)) {
        spans.push({ textStart: text, textEnd: text + n, modelStart: model });
        text += n;
      }
      model += n;
    }
    return spans;
  }

  /** Final-text offset → model offset (monotone; excluded material maps past itself). */
  function mapOffset(spans, at, fallback) {
    for (const span of spans) {
      if (at < span.textStart) return span.modelStart;
      if (at <= span.textEnd) return span.modelStart + (at - span.textStart);
    }
    return fallback;
  }

  /** The formatting fresh inserted words should carry: the run before them. */
  function inheritProps(D, p, atIndex) {
    const source = atIndex > 0 ? p.runs[atIndex - 1] : null;
    if (!source || source.t !== 'text' || !source.rPr) return {};
    const rPr = Object.assign({}, source.rPr);
    delete rPr.ins;
    delete rPr.del;
    delete rPr.chg;
    return rPr;
  }

  /** One word-level hunk: the words that went are struck (del stamp), the
   * words that came stand in their place underlined (ins stamp). */
  function applyHunk(L, D, p, candidate, hunk, spans, stamp) {
    const len = D.plen(p);
    const from = mapOffset(spans, hunk.before.start, len);
    const to = mapOffset(spans, hunk.before.end, len);
    const words = String(candidate.after || '').slice(hunk.after.start, hunk.after.end);
    const i0 = D.splitAt(p, from);
    const i1 = D.splitAt(p, to);
    const fresh = [];
    if (words) fresh.push(D.text(words, Object.assign(inheritProps(D, p, i0), { ins: stamp })));
    const kept = [];
    for (let i = i0; i < i1; i += 1) {
      const it = p.runs[i];
      if (D.isMarker(it)) { kept.push(it); continue; }          // zero-length ends stay where they were
      if (isInserted(it)) continue;                              // 删自己未接受的插入：直接拿掉（Word 的口径）
      kept.push(Object.assign({}, it, { rPr: Object.assign({}, it.rPr, { del: stamp }) }));
    }
    p.runs.splice(i0, i1 - i0, ...fresh, ...kept);
  }

  function applyOne(L, D, doc, candidate, nextStamp, lastInserted) {
    if (candidate.kind === 'changed' || candidate.kind === 'cell') {
      const p = D.byId(doc, Number(candidate.paragraphId));
      if (!p || p.t !== 'p') return false;
      D.touch(p);
      const spans = finalSpans(D, p);   // computed on the pristine paragraph; later hunks apply first
      const hunks = (candidate.hunks || []).slice().sort((x, y) => y.before.start - x.before.start);
      for (const hunk of hunks) applyHunk(L, D, p, candidate, hunk, spans, nextStamp());
      D.normalize(p);
      return true;
    }
    if (candidate.kind === 'removed') {
      const p = D.byId(doc, Number(candidate.paragraphId));
      if (!p || p.t !== 'p') return false;
      const stamp = nextStamp();
      D.touch(p);
      const out = [];
      for (const it of p.runs) {
        if (D.isMarker(it) || !D.ilen(it)) { out.push(it); continue; }
        if (isInserted(it)) continue;
        out.push(Object.assign({}, it, { rPr: Object.assign({}, it.rPr, { del: stamp }) }));
      }
      p.runs = out;
      if (!(p.mark && p.mark.ins)) p.mark = Object.assign({}, p.mark, { del: stamp });   // the ¶ goes with the words
      D.normalize(p);
      return true;
    }
    if (candidate.kind === 'added') {
      const blocks = doc.main && Array.isArray(doc.main.blocks) ? doc.main.blocks : null;
      if (!blocks) return false;
      const chainKey = candidate.anchorParaId || candidate.anchorTableId || '';
      const chained = lastInserted.get(chainKey);
      const anchorPara = candidate.anchorParaId ? D.byId(doc, Number(candidate.anchorParaId)) : null;
      const anchorTable = candidate.anchorTableId && doc._tbls ? (doc._tbls.get(Number(candidate.anchorTableId)) || null) : null;
      let at = null;
      if (chained) at = blocks.indexOf(chained) + 1;   // 同一空档里的第二条跟在第一条后面
      else if (anchorPara && anchorPara.t === 'p') at = blocks.indexOf(anchorPara) + 1;
      else if (anchorTable && anchorTable.tbl) at = blocks.indexOf(anchorTable.tbl) + 1;
      else if (chainKey) return false;                 // the anchor the row named is gone; the row is not written on a guess
      const stamp = nextStamp();
      const np = D.para([D.text(String(candidate.after || ''), { ins: stamp })], anchorPara && anchorPara.t === 'p' && anchorPara.pPr ? L.clone(anchorPara.pPr) : {});
      np.mark = { ins: stamp };   // 拒绝时整段随之退场（N13a 的 mins 语义）
      D.touchList(doc.main);
      blocks.splice(at == null || at < 0 ? 0 : at, 0, np);
      lastInserted.set(chainKey, np);
      return true;
    }
    return false;
  }

  /**
   * Write the chosen candidates' ins/del stamps into the current document as
   * ONE named model command (one undo step, the label the Edit menu names).
   * Returns how many rows were taken; a row whose paragraph has moved on is
   * skipped, never guessed at.
   * @param {object} adapter the current document's live Quire adapter
   * @param {Array<object>} candidates the rows to adopt (adoptable ones only are taken)
   * @param {string} author the revision name every stamp carries
   * @param {string} label the undo step's name (「比较：采用第 N 条」 / 「比较：采用全部」)
   */
  function applyCandidates(adapter, candidates, author, label) {
    const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.adoptable);
    if (!list.length || typeof adapter.modelCommand !== 'function') return 0;
    const L = root.L;
    const D = L && L.D;
    if (!D) return 0;
    adapter.canUndo();   // bind this document's history slice first
    const doc = adapter.document();
    let taken = 0;
    adapter.modelCommand(String(label || '比较：采用'), () => {
      const lastInserted = new Map();
      for (const candidate of list) {
        try { if (applyOne(L, D, doc, candidate, () => stampOf(D, author), lastInserted)) taken += 1; } catch (error) { /* one moved-on row never sinks the step */ }
      }
      doc._idxDirty = true;
    });
    return taken;
  }

  /* ------------------------------------------------- the windoid (the N13a bones) */

  function h(doc, tag, props = {}, children = []) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child.nodeType ? child : doc.createTextNode(String(child)));
    return node;
  }

  let open = null;   // { handle, entry, doc, pane, fileName, other, author, rows, failure, busy }

  const KIND_KEYS = Object.freeze({
    changed: 'clio_write_compare_kind_changed',
    added: 'clio_write_compare_kind_added',
    removed: 'clio_write_compare_kind_removed',
    cell: 'clio_write_compare_kind_cell',
    image: 'clio_write_compare_kind_image',
    structure: 'clio_write_compare_kind_structure',
  });

  const kindWord = (row) => row.kind === 'cell' || (row.row && row.column)
    ? tr('clio_write_compare_kind_cell', row.row || 1, row.column || 1)
    : tr(KIND_KEYS[row.kind] || 'clio_write_compare_kind_changed');

  /** The row's own words as one reading: the words that went struck through,
   * the words that came underlined — the document's own 1-bit marks. */
  function diffLine(doc, row) {
    const line = h(doc, 'div', { class: 'windoid-comment cw-compare-text' });
    if (row.kind === 'added') { line.append(h(doc, 'ins', { class: 'cw-rev-text', text: row.after })); return line; }
    if (row.kind === 'removed' || row.kind === 'image' || row.kind === 'structure') {
      if (row.kind === 'removed') line.append(h(doc, 'del', { class: 'cw-rev-text', text: row.before }));
      else line.append(h(doc, 'span', { class: 'cw-rev-text', text: row.before || row.after }));
      return line;
    }
    const before = String(row.before || '');
    let cursor = 0;
    for (const hunk of row.hunks || []) {
      if (hunk.before.start > cursor) line.append(doc.createTextNode(before.slice(cursor, hunk.before.start)));
      const group = h(doc, 'span', { class: 'review-diff-hunk' });
      if (hunk.before.end > hunk.before.start) group.append(h(doc, 'del', { class: 'cw-rev-text', text: before.slice(hunk.before.start, hunk.before.end) }));
      const words = String(row.after || '').slice(hunk.after.start, hunk.after.end);
      if (words) group.append(h(doc, 'ins', { class: 'cw-rev-text', text: words }));
      line.append(group);
      cursor = hunk.before.end;
    }
    if (cursor < before.length) line.append(doc.createTextNode(before.slice(cursor)));
    return line;
  }

  function draw() {
    if (!open) return;
    const { handle, doc } = open;
    const rows = open.rows;
    handle.body.textContent = '';
    handle.setTitle(rows.length ? tr('clio_write_compare_title_count', rows.length) : tr('clio_write_compare_title'));

    /* the command row: choose the other file, or adopt everything at once */
    const commands = h(doc, 'div', { class: 'windoid-actions cw-rev-commands' });
    const picker = h(doc, 'input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true, dataset: { comparePick: '' } });
    picker.addEventListener('change', () => {
      const file = picker.files && picker.files[0];
      picker.value = '';
      if (file) readFile(file);
    });
    const choose = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_compare_pick'), disabled: open.busy });
    choose.addEventListener('click', () => picker.click());
    commands.append(choose, picker);
    if (open.fileName) commands.append(h(doc, 'span', { class: 'windoid-note', text: tr('clio_write_compare_picked', open.fileName) }));
    if (open.author) commands.append(h(doc, 'span', { class: 'windoid-author', text: tr('clio_write_compare_author_line', open.author) }));
    if (rows.some((row) => row.decision === 'undecided' && row.adoptable)) {
      const all = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_compare_adopt_all'), disabled: open.busy });
      all.addEventListener('click', () => adopt(rows));
      commands.append(all);
    }
    handle.body.append(commands);

    if (open.failure) { const alert = h(doc, 'p', { class: 'windoid-note', role: 'alert', text: open.failure }); handle.body.append(alert); }
    if (!open.other) {
      handle.body.append(h(doc, 'p', { class: 'windoid-empty', text: tr('clio_write_compare_hint') }));
      handle.place();
      return;
    }
    if (!rows.length) {
      handle.body.append(h(doc, 'p', { class: 'windoid-empty', text: tr('clio_write_compare_empty') }));
      handle.place();
      return;
    }

    const ul = h(doc, 'ul', { class: 'windoid-threads cw-rev-list' });
    for (const row of rows) {
      const box = h(doc, 'li', { class: 'windoid-thread cw-rev cw-compare' + (row.decision !== 'undecided' ? ' is-' + row.decision : ''), dataset: { compareIndex: String(row.index) } });
      box.append(h(doc, 'div', { class: 'windoid-comment-head' }, [
        h(doc, 'span', { class: 'cw-rev-kind', text: tr('clio_write_compare_number', row.index) + ' · ' + kindWord(row) }),
        h(doc, 'span', { class: 'windoid-author', text: open.author || tr('clio_comments_author_unknown') }),
      ]));
      box.append(diffLine(doc, row));
      if (row.imageNote || row.kind === 'image') box.append(h(doc, 'p', { class: 'windoid-hint', text: tr('clio_write_compare_image_note') }));
      const actions = h(doc, 'div', { class: 'windoid-actions' });
      if (row.decision === 'undecided') {
        if (row.adoptable) {
          const adoptBtn = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_compare_adopt') });
          adoptBtn.addEventListener('click', () => adopt([row]));
          actions.append(adoptBtn);
        }
        const ignore = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_compare_ignore') });
        ignore.addEventListener('click', () => { row.decision = 'ignored'; draw(); });
        actions.append(ignore);
      } else {
        actions.append(h(doc, 'span', { class: 'windoid-note', text: tr(row.decision === 'adopted' ? 'clio_write_compare_adopted' : 'clio_write_compare_ignored') }));
      }
      box.append(actions);
      ul.append(box);
    }
    handle.body.append(ul);
    handle.place();
  }

  /** 逐条或全部「采用为修订」: one named model command, then the document and
   * the N13a list repaint — the marks are ordinary revisions from here on. */
  function adopt(rows) {
    if (!open || open.busy) return;
    const entry = open.entry;
    const chosen = (Array.isArray(rows) ? rows : []).filter((row) => row && row.decision === 'undecided' && row.adoptable);
    if (!chosen.length) return;
    const label = chosen.length > 1 ? '比较：采用全部' : `比较：采用第 ${chosen[0].index} 条`;
    const taken = applyCandidates(entry.session.adapter, chosen, open.author, label);
    if (!taken) { open.failure = tr('clio_write_compare_adopt_failed'); draw(); return; }
    for (const row of chosen) row.decision = 'adopted';
    open.failure = '';
    // The adapter already counted the edit; this only settles the chrome (the N13a apply's own pair).
    entry.session.noteExternalEdit();
    entry.redraw();
    entry.syncCaret();
    entry.afterHistory();
    draw();
  }

  /** 选取第二份 → 读取 → 对齐 → 候选。署名先取已记之名，无名则问一次（N13b 的机制）。 */
  async function readFile(file) {
    if (!open || open.busy) return;
    open.busy = true;
    open.failure = '';
    draw();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const factory = root.ClioWorksQuireAdapter;
      if (!factory || typeof factory.open !== 'function') throw new Error('the Quire adapter did not load');
      const clio = root.AISystem6ClioWrite;
      let author = clio && typeof clio.revisionAuthor === 'function' ? clio.revisionAuthor() : '';
      if (!author && clio && typeof clio.renameRevisionAuthor === 'function') author = await clio.renameRevisionAuthor();
      if (!author) {
        open.failure = tr('clio_write_compare_cancelled');
        return;
      }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const other = await factory.open(buffer, { name: String(file.name || 'document.docx') });
      open.other = other;
      open.fileName = String(file.name || '');
      open.author = String(author);
      open.rows = compareDocuments(open.entry.session.adapter, other).candidates.map((candidate) => ({ ...candidate, decision: 'undecided' }));
    } catch (error) {
      open.other = null;
      open.fileName = '';
      open.rows = [];
      open.failure = tr('clio_write_compare_read_failed', String(error && error.message || error));
    } finally {
      open.busy = false;
      draw();
    }
  }

  /** An outside edit moved the document: read the candidates again off the
   * live model, keeping the decisions the rows' own signatures still match. */
  function refresh() {
    if (!open || !open.other || open.busy) return;
    const signature = (row) => [row.kind, row.paragraphId || '', row.anchorParaId || '', row.before, row.after].join('\u0000');
    const remembered = new Map(open.rows.map((row) => [signature(row), row.decision]));
    open.rows = compareDocuments(open.entry.session.adapter, open.other).candidates.map((candidate) => ({ ...candidate, decision: remembered.get(signature(candidate)) || 'undecided' }));
    draw();
  }

  function openWindoid(ctx) {
    const createWindoid = root.AISystem6ClioWrite && root.AISystem6ClioWrite.createWindoid;
    if (typeof createWindoid !== 'function') return;
    if (open) {
      if (open.pane === ctx.pane) { open.entry = ctx; draw(); return; }
      close();
    }
    const handle = createWindoid(ctx.doc, ctx.pane, {
      title: tr('clio_write_compare_title'),
      // The review windoid's own bones (its sheet is already here): the 1-bit
      // ins/del pair, the list, the row chrome — a compare list, not a new look.
      className: 'cw-revisions-windoid cw-compare-windoid',
      onClose: () => { if (open && open.handle === handle) open = null; },
    });
    open = { handle, entry: ctx, doc: ctx.doc, pane: ctx.pane, fileName: '', other: null, author: '', rows: [], failure: '', busy: false };
    draw();
  }

  root.AISystem6ClioWriteCompare = Object.freeze({
    /** ctx: { session, doc, pane, redraw, syncCaret, selectRange, afterHistory, focus } from ClioWrite. */
    open: openWindoid,
    refresh,
    close() { if (open) open.handle.close(); open = null; },
    /* the engine, headless for the contract */
    compare: compareDocuments,
    apply: applyCandidates,
  });
})(typeof window !== 'undefined' ? window : globalThis);
