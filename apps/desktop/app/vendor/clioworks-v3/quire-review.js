/* ClioWorks N13a: read Word tracked changes on the desk's Quire model and resolve
 * them one by one. The changes arrive on the model from the vendored reader
 * (docx-read.js): runs carry rPr.ins / rPr.del (inline w:ins / w:del / moves),
 * rPr.chg (w:rPrChange, with .old), paragraphs carry pPr.chg (w:pPrChange, .old)
 * and mark.ins / mark.del (the paragraph mark's own w:ins / w:del).
 *
 * This ports exactly the parts the desk needs from the upstream app's review
 * logic (external/clioworks-upstreams/VibeOffice/public/quire/js/review.js —
 * RV.list, resolve, acceptReject). It is deliberately NOT vendored: the desk has
 * no upstream editor layer here, so this file works headless on a live
 * quire-adapter (open() from quire-adapter.js), resolves through the adapter's
 * one-dirty-source history (modelCommand), and holds no selection, pane or
 * dialog code. Not yet ported from upstream: recording new revisions (N13b),
 * reviewer colours, compare/merge, comment balloons.
 *
 * Loaded lazily with the ClioWrite review windoid (config.js
 * ensureClioWriteReviewModule, after quire-adapter's codec). root.L resolves at
 * call time: the codec is loaded by the time a document is open.
 */
(function (root) {
  'use strict';
  if (root.ClioWorksQuireReview) return;

  const codec = () => {
    const L = root.L;
    if (!L || !L.D || !L.O) throw new Error('quire-review: the Quire codec is not loaded');
    return L;
  };

  const revOf = (it) => { const r = it.rPr || {}; return r.ins ? ['ins', r.ins] : r.del ? ['del', r.del] : r.chg ? ['chg', r.chg] : null; };

  /**
   * Every revision on the main story (body paragraphs and table cells) in reading
   * order; adjacent runs of one revision merge, as upstream RV.list does.
   * Returns plain records for the UI: { index, type, author, date, paragraphId,
   * from, to, text } — from/to are character offsets in the paragraph; a
   * paragraph-mark revision (mins/mdel) sits at from == to == plen. Call again
   * after any edit: offsets and ids are read fresh each time.
   */
  function revisions(adapter) {
    const D = codec().D;
    const doc = adapter.document();
    D.reindex(doc);
    const out = [];
    for (const p of doc.main.paras || []) {
      let o = 0;
      let cur = null;
      for (const it of p.runs) {
        const n = D.ilen(it);
        const rv = n ? revOf(it) : null;
        if (rv && cur && cur.type === rv[0] && cur.stamp.author === rv[1].author && cur.b === o) { cur.b = o + n; cur.text += it.t === 'text' ? it.text : ' '; }
        else if (rv) { cur = { type: rv[0], stamp: rv[1], p, a: o, b: o + n, text: it.t === 'text' ? it.text : it.t === 'tab' ? '\t' : '[object]' }; out.push(cur); }
        else if (n) cur = null;
        o += n;
      }
      if (p.pPr.chg) out.push({ type: 'pchg', stamp: p.pPr.chg, p, a: 0, b: D.plen(p), text: 'Paragraph formatting' });
      if (p.mark && (p.mark.ins || p.mark.del)) out.push({ type: p.mark.ins ? 'mins' : 'mdel', stamp: p.mark.ins || p.mark.del, p, a: D.plen(p), b: D.plen(p), text: '¶' });
    }
    return out.map((r, index) => ({ index, type: r.type, author: r.stamp.author || '', date: r.stamp.date || '', paragraphId: String(r.p.id), from: r.a, to: r.b, text: r.text }));
  }

  /* Accepting a paragraph-mark insertion, or rejecting its deletion, removes the
   * paragraph boundary: the paragraph joins the one that follows. The join runs
   * with tracking off so the merge does not record revisions of its own
   * (upstream joinNoTrack). O.joinNext refuses when there is no next paragraph. */
  function joinNoTrack(O, doc, p) {
    const trk = doc.settings && doc.settings.track;
    if (doc.settings) doc.settings.track = false;
    try { O.joinNext(p); } finally { if (doc.settings) doc.settings.track = trk; }
  }

  /**
   * Apply accept/reject to one revision record against the CURRENT model, inside
   * the caller's transaction. Ported from upstream review.js resolve(): a pchg
   * keeps or restores the old paragraph properties; a mark revision clears the
   * mark and joins when the boundary goes away; an inserted run is kept without
   * its mark or dropped; a deleted run is dropped or kept without its mark; a
   * run-format change (chg) keeps the run and takes the new or the old rPr.
   * Zero-length items (comment ranges, bookmarks) are never dropped.
   */
  function resolveRevision(L, doc, record, accept) {
    const D = L.D, O = L.O;
    const p = D.byId(doc, Number(record.paragraphId));
    if (!p || p.t !== 'p') return false;
    D.touch(p);
    if (record.type === 'pchg') {
      const chg = p.pPr && p.pPr.chg;
      if (accept) delete p.pPr.chg;
      else p.pPr = Object.assign({}, (chg && chg.old) || {});
      return true;
    }
    if (record.type === 'mins' || record.type === 'mdel') {
      const join = (record.type === 'mins' && !accept) || (record.type === 'mdel' && accept);
      delete p.mark.ins;
      delete p.mark.del;
      if (!Object.keys(p.mark).length) delete p.mark;
      if (join) joinNoTrack(O, doc, p);
      return true;
    }
    const i0 = D.splitAt(p, record.from), i1 = D.splitAt(p, record.to);
    const keep = [];
    for (let i = 0; i < p.runs.length; i++) {
      const it = p.runs[i];
      if (i < i0 || i >= i1 || !D.ilen(it)) { keep.push(it); continue; }
      const rp = it.rPr || {};
      if (record.type === 'ins') { if (accept) { delete rp.ins; keep.push(it); } }
      else if (record.type === 'del') { if (!accept) { delete rp.del; keep.push(it); } }
      else if (record.type === 'chg') {
        if (accept) delete rp.chg;
        else {
          const old = rp.chg && rp.chg.old ? L.clone(rp.chg.old) : {};
          for (const k of ['ins', 'del', 'link']) if (rp[k]) old[k] = rp[k];
          it.rPr = old;
        }
        keep.push(it);
      }
    }
    p.runs = keep;
    D.normalize(p);
    return true;
  }

  /**
   * Resolve the given records (from revisions()) as ONE named command on the
   * adapter's undo history. Paragraph order runs from the end so the earlier
   * offsets stay valid while the later ones are resolved; run revisions resolve
   * before paragraph marks, whose joins change the block list (upstream
   * acceptReject's order). Returns how many records were taken.
   */
  function resolve(adapter, records, accept, label) {
    const list = (Array.isArray(records) ? records : []).filter(Boolean);
    if (!list.length || typeof adapter.modelCommand !== 'function') return 0;
    const L = codec();
    const doc = adapter.document();
    adapter.canUndo();   // bind the model and this document's history slice first
    L.D.reindex(doc);
    const orderOf = new Map();
    for (const p of doc.main.paras || []) orderOf.set(String(p.id), p._o || 0);
    const ordered = list.slice().sort((x, y) => {
      if (x.paragraphId === y.paragraphId) return y.from - x.from;
      return (orderOf.get(String(y.paragraphId)) || 0) - (orderOf.get(String(x.paragraphId)) || 0);
    });
    const runs = ordered.filter((r) => r.type !== 'mins' && r.type !== 'mdel');
    const marks = ordered.filter((r) => r.type === 'mins' || r.type === 'mdel');
    adapter.modelCommand(label, () => {
      for (const r of runs) resolveRevision(L, doc, r, accept);
      for (const r of marks) resolveRevision(L, doc, r, accept);
    });
    return list.length;
  }

  /** Accept or reject every revision on the document as one command. */
  function resolveAll(adapter, accept, label) {
    return resolve(adapter, revisions(adapter), accept, label);
  }

  root.ClioWorksQuireReview = Object.freeze({ revisions, resolve, resolveAll });
})(typeof window !== 'undefined' ? window : globalThis);
