/* ClioWorks v4 (V4-01): native PPTX open/edit/save adapter around the vendored
 * VibeOffice Lectern codec (apps/desktop/app/vendor/vibeoffice/, Apache-2.0,
 * pinned upstream 32ff53a5da0e75ebac11acdb0251cd3d8c7bf408).
 *
 * Contract (INTEROPERABILITY.zh-CN) — same shape as the Ledger/Quire adapters:
 *  - Unchanged bytes pass through untouched: save() returns the original
 *    ArrayBuffer when the presentation was never modified (original-bytes mode).
 *  - After a real edit, the Lectern preserving writer rebuilds only owned parts
 *    (slides, presentation-level rels); media, theme, layouts, masters and notes
 *    slides keep original bytes (preserving-edit).
 *  - This adapter never goes through the plain-text importer and never
 *    overwrites the source record with extracted text.
 *
 * Loaded only by the ClioWorks host (lazy, classic script). No UI here. */
(function (root) {
  'use strict';

  const MODULES = [
    'app/vendor/vibeoffice/common/zip.js',
    'app/vendor/vibeoffice/common/sha.js',
    'app/vendor/vibeoffice/common/core.js',
    'app/vendor/vibeoffice/common/xml.js',
    'app/vendor/vibeoffice/common/opc.js',
    'app/vendor/vibeoffice/common/opc-order.js',
    'app/vendor/vibeoffice/common/crypto.js',
    'app/vendor/vibeoffice/common/geometry.js',
    'app/vendor/vibeoffice/common/metafile.js',
    'app/vendor/vibeoffice/common/numfmt.js',
    'app/vendor/vibeoffice/common/charts.js',
    'app/vendor/vibeoffice/common/dml.js',
    'app/vendor/vibeoffice/ledger/xml.js',
    'app/vendor/vibeoffice/lectern/model.js',
    'app/vendor/vibeoffice/lectern/comments.js',
    'app/vendor/vibeoffice/lectern/designs.js',
    'app/vendor/vibeoffice/lectern/frames.js',
    'app/vendor/vibeoffice/lectern/properties.js',
    'app/vendor/vibeoffice/lectern/slideshow.js',
    'app/vendor/vibeoffice/lectern/preserve.js',
    'app/vendor/vibeoffice/lectern/pptx-read.js',
    'app/vendor/vibeoffice/lectern/pptx-write.js',
  ];

  let loadPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('lectern-adapter: failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  /** Load the vendored Lectern codec once. Rejects leave no partial retry state. */
  function loadCodec() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      for (const src of MODULES) await loadScript(src);
      const L = root.L;
      if (!L || !L.pptx || typeof L.pptx.read !== 'function' || typeof L.pptx.write !== 'function') {
        throw new Error('lectern-adapter: VibeOffice Lectern codec incomplete after load');
      }
      return L;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  function bytesEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a);
    const y = new Uint8Array(b);
    for (let i = 0; i < x.length; i += 1) {
      if (x[i] !== y[i]) return false;
    }
    return true;
  }

  function cloneBytes(bytes) {
    return bytes.slice(0);
  }

  function slideRuns(slide) {
    const out = [];
    const shapes = (slide && Array.isArray(slide.shapes)) ? slide.shapes : [];
    for (const shape of shapes) {
      const ps = shape && shape.tx && Array.isArray(shape.tx.ps) ? shape.tx.ps : [];
      for (const para of ps) {
        const rs = Array.isArray(para.rs) ? para.rs : [];
        for (const run of rs) {
          if (run && typeof run.t === 'string') {
            out.push({ shapeId: shape.id, shapeName: shape.name || '', run });
          }
        }
      }
    }
    return out;
  }


  /* Effective run size/colour. The codec stores a paragraph's own <a:pPr><a:defRPr> (which
   * LibreOffice and the M2 fixtures use to style a text box) only as a preserved fragment, so it is
   * read from there; everything else comes through L.style.para (layout/master/theme defaults). */
  function fragmentDefRPr(para) {
    const xml = para && para.pp && para.pp.keep && para.pp.keep.fragment && para.pp.keep.fragment.xml;
    if (typeof xml !== 'string') return null;
    const m = /<a:defRPr\b([^>]*?)(\/>|>([\s\S]*?)<\/a:defRPr>)/.exec(xml);
    if (!m) return null;
    const sz = /\bsz="(\d+)"/.exec(m[1]);
    const out = { sz: sz ? Number(sz[1]) / 100 : undefined, color: undefined };
    const fill = m[3] && /<a:solidFill>\s*<a:(srgbClr|schemeClr|sysClr|prstClr)\b([^>]*?)(\/>|>([\s\S]*?)<\/a:\1>)/.exec(m[3]);
    if (fill) {
      const val = /\bval="([^"]*)"/.exec(fill[2]);
      const last = /\blastClr="([0-9A-Fa-f]{6})"/.exec(fill[2]);
      const mods = [];
      const re = /<a:(lumMod|lumOff|tint|shade|satMod|satOff|hueMod|hueOff)\s+val="(-?\d+)"/g;
      let mm;
      while ((mm = re.exec(fill[4] || ''))) mods.push({ name: mm[1], val: Number(mm[2]) });
      if (fill[1] === 'srgbClr' && val) out.color = { base: '#' + val[1], mods };
      else if (fill[1] === 'schemeClr' && val) out.color = { base: val[1], mods };
      else if (fill[1] === 'sysClr' && last) out.color = { base: '#' + last[1], mods };
    }
    return out;
  }
  const HEX6 = /^#[0-9a-fA-F]{6}$/;
  function effectiveColor(L, design, raw) {
    if (raw == null || raw === '') return null;
    let base = raw;
    let mods = [];
    if (typeof raw === 'object') {
      if (typeof raw.base !== 'string') return null;
      base = raw.base; mods = raw.mods || [];
    }
    if (typeof base !== 'string') return null;
    try {
      let hex = base[0] === '#' ? base : L.model.resolveColor(base, design, null);
      if (!hex || !HEX6.test(hex)) return null;
      if (mods.length) hex = L.color.applyMods(hex, mods);
      return HEX6.test(hex) ? hex.toLowerCase() : null;
    } catch (_) { return null; }
  }

  const pickSize = (...c) => { for (const v of c) if (typeof v === 'number' && isFinite(v) && v > 0) return v; return undefined; };
  const BLOCKED = (code, message) => ({ status: 'blocked', code, message });
  const RUN_ID = /^(.+):(\d+):(\d+)$/;
  const EDITABLE_TYPES = new Set(['text', 'shape']);
  const KINDS = { text: 'text', shape: 'shape', image: 'image', table: 'table', chart: 'chart', group: 'group', line: 'line' };

  /**
   * Open a native PPTX presentation.
   * @param {ArrayBuffer|Uint8Array} bytes the untouched original package bytes
   * @param {{name?:string, scopeId?:string, documentId?:string, generation?:number}} meta
   */

  async function open(bytes, meta = {}) {
    const L = await loadCodec();
    const original = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes.slice(0);
    const doc = await L.pptx.read(cloneBytes(original));
    if (!doc || !Array.isArray(doc.slides)) {
      throw new Error('lectern-adapter: presentation model missing after read');
    }
    // ONE dirty source: isDirty() = editRevision !== savedRevision. "Ever edited"
    // (editRevision > 0) picks the save mode and never goes back: an undo to the saved
    // state is still an edit, because the bytes were not proven equal.
    let editRevision = 0;
    let savedRevision = 0;
    let encodeMemo = null;
    const touchedRuns = [];
    // Part preservation (R1): the baseline is what the writer makes of the UNEDITED presentation,
    // written once in idle time after open (L.zip.idleBaseline). Every part the baseline and the
    // edited write agree on keeps its original bytes (L.zip.preserveUntouched).
    const written = async (pres) => {
      L.pres = pres;
      try { return await (await L.pptx.write(pres, { format: 'pptx' })).arrayBuffer(); } finally { L.pres = doc; }
    };
    const baseline = L.zip.idleBaseline(() => {
      if (L.hist && typeof L.hist.clear === 'function') L.hist.clear();
      if (Array.isArray(doc.losses)) doc.losses = doc.losses.filter((e) => e.phase !== 'save');
      return written(doc);
    }, () => editRevision === 0);
    const undoStack = [];
    const redoStack = [];

    /* --------------------------------------------------------------- history */
    // The edit history is a stack of slide-list snapshots (one JSON string per slide), so
    // a transaction costs one stringify and an undo only rebuilds the slides that differ.
    const snap = () => ({ order: doc.slides.map((sl) => sl.id), by: new Map(doc.slides.map((sl) => [sl.id, JSON.stringify(sl)])) });
    let current = null;
    const head = () => current || (current = snap());
    function diffSlides(a, b) {
      const ids = [];
      for (const id of b.order) if (a.by.get(id) !== b.by.get(id)) ids.push(id);
      for (const id of a.order) if (!b.by.has(id)) ids.push(id);
      if (!ids.length && a.order.join('\n') !== b.order.join('\n')) ids.push(...b.order);
      return ids;
    }
    function restore(target) {
      const live = new Map(doc.slides.map((sl) => [sl.id, sl]));
      const now = head();
      doc.slides = target.order.map((id) => (live.has(id) && now.by.get(id) === target.by.get(id) ? live.get(id) : JSON.parse(target.by.get(id))));
      current = target;
    }
    function transact(label, fn) {
      const before = head();
      let result;
      try {
        result = fn();
      } catch (error) {
        restore(before);
        throw error;
      }
      const after = snap();
      const slides = diffSlides(before, after);
      if (!slides.length) { current = before; return { changed: false, slides, result }; }
      current = after;
      undoStack.push({ label, before, after });
      redoStack.length = 0;
      editRevision += 1;
      encodeMemo = null;
      return { changed: true, slides, result };
    }

    /* ---------------------------------------------------------------- lookups */
    const findSlide = (id) => doc.slides.find((sl) => sl.id === id) || null;
    const slideByRef = (ref) => (typeof ref === 'number' ? doc.slides[ref] || null : findSlide(ref));
    const design = (sl) => L.model.design(doc, sl);
    const layoutKind = (type) => (L.model.LAYOUTS.find((l) => l.ox === type) || {}).key || null;

    function layoutTable() {
      const out = [];
      for (const d of Object.values(doc.designs || {})) {
        const parts = (d.keep && d.keep.layoutParts) || [];
        for (const part of parts) {
          out.push({ id: d.id + '|' + part.lkey, name: (d.layoutNames && d.layoutNames[part.lkey]) || part.lkey, kind: layoutKind(part.type) || 'other', designId: d.id, lkey: part.lkey, modelKey: layoutKind(part.type) });
        }
      }
      // A deck written by Lectern itself has no layout parts: list what its slides use.
      if (!out.length) {
        const seen = new Set();
        for (const sl of doc.slides) {
          const id = sl.design + '|model:' + sl.layout;
          if (seen.has(id)) continue;
          seen.add(id);
          const info = L.model.layoutInfo(sl.layout);
          out.push({ id, name: info.name, kind: info.key, designId: sl.design, lkey: '', modelKey: info.key });
        }
      }
      return out;
    }
    const layoutIdOf = (sl) => sl.design + '|' + (sl.lkey || 'model:' + sl.layout);
    const layoutFor = (id) => layoutTable().find((l) => l.id === id) || null;

    /* ---------------------------------------------------------------- shapes */
    function shapeInfo(sl, sh) {
      const kind = KINDS[sh.type] || 'other';
      const info = { id: sh.id, kind, name: sh.name || '', x: sh.x, y: sh.y, w: sh.w, h: sh.h, editable: false };
      if (sh.rot) info.rot = sh.rot;
      if (sh.ph) info.placeholder = sh.ph.type;
      if (kind === 'image') {
        try { info.imageUrl = L.media.url(sh.media) || ''; } catch (_) { info.imageUrl = ''; }
      }
      if (EDITABLE_TYPES.has(sh.type) && sh.tx && Array.isArray(sh.tx.ps)) {
        info.editable = true;
        info.paragraphs = sh.tx.ps.map((para, pi) => {
          let style = {};
          try { style = L.style.para(sh, para, design(sl)) || {}; } catch (_) { style = {}; }
          const rs = Array.isArray(para.rs) && para.rs.length ? para.rs : [{ t: '' }];
          const rPr = style.rPr || {};
          const frag = para.pp && para.pp.rPr ? null : fragmentDefRPr(para);
          const dsn = design(sl);
          return {
            level: para.lvl || 0,
            bullet: !!(style.bu && style.bu.t && style.bu.t !== 'none'),
            runs: rs.map((run, ri) => {
              const out = { id: sh.id + ':' + pi + ':' + ri, text: typeof run.t === 'string' ? run.t : '', b: !!(run.b !== undefined ? run.b : rPr.b), i: !!(run.i !== undefined ? run.i : rPr.i), u: !!(run.u !== undefined ? run.u && run.u !== 'none' : rPr.u && rPr.u !== 'none'), size: pickSize(run.sz, frag && frag.sz, rPr.sz), color: effectiveColor(L, dsn, run.color != null ? run.color : (frag && frag.color) || rPr.color), font: run.font !== undefined ? run.font : rPr.font };
              if (run.fld) out.field = true;
              return out;
            }),
          };
        });
      }
      return info;
    }

    /* -------------------------------------------------------------- comments */
    const commentsOf = (sl) => L.comments.entries(doc, sl);
    function findComment(id) {
      for (const sl of doc.slides) {
        const hit = commentsOf(sl).find((c) => c.id === id);
        if (hit) return { slide: sl, comment: hit };
      }
      return null;
    }
    const nowStamp = () => new Date().toISOString();
    const tailOf = (id) => String(id).slice(String(id).indexOf('#') + 1);

    /* ------------------------------------------------------------------ encode */
    async function encodeCurrent() {
      if (encodeMemo && encodeMemo.revision === editRevision) return encodeMemo;
      const rev = editRevision; // taken before the await: an edit during the encode must leave the memo stale
      const base = await baseline.get(); // first: a baseline still being written finishes before this write starts
      L.pres = doc;
      if (L.hist && typeof L.hist.clear === 'function') L.hist.clear();
      if (Array.isArray(doc.losses)) doc.losses = doc.losses.filter((e) => e.phase !== 'save');
      const blob = await L.pptx.write(doc, { format: 'pptx' });
      let buffer = await blob.arrayBuffer();
      const losses = (Array.isArray(doc.losses) ? doc.losses : []).filter((e) => !e.phase || e.phase === 'save').map((e) => ({ ...e }));
      const merged = base && await L.zip.preserveUntouched({ original, baseline: base, edited: buffer, mime: blob.type });
      L.pres = doc;
      if (merged) buffer = merged.buffer;
      const memo = { revision: rev, bytes: buffer, losses, parts: merged ? { kept: merged.kept, written: merged.written } : null };
      if (rev === editRevision) encodeMemo = memo;
      return memo;
    }

    const api = {
      kind: 'pptx',
      name: meta.name || 'presentation.pptx',
      scopeId: meta.scopeId || '',
      documentId: meta.documentId || '',
      generation: Number.isSafeInteger(meta.generation) ? meta.generation : 1,

      /** The single dirty source: the revision moved since the last markSaved(). */
      isDirty: () => editRevision !== savedRevision,
      // The saved revision is the one that was encoded; edits made while the save
      // ran keep the document dirty.
      markSaved(revision) { savedRevision = Number.isSafeInteger(revision) ? revision : editRevision; },
      getEditRevision: () => editRevision,

      presentation: () => doc,
      slideCount: () => doc.slides.length,
      pageSize: () => ({ w: doc.W, h: doc.H }),

      /* ------------------------------------------------------------ read face */
      slides: () => doc.slides.map((sl, index) => ({ id: sl.id, index, layoutId: layoutIdOf(sl), hidden: !!sl.hidden, size: { w: doc.W, h: doc.H } })),
      layouts: () => layoutTable().map(({ id, name, kind }) => ({ id, name, kind })),
      shapes(slideId) {
        const sl = findSlide(slideId);
        if (!sl) throw new Error('lectern-adapter: unknown slide ' + slideId);
        return sl.shapes.map((sh) => shapeInfo(sl, sh));
      },

      /** Slide identities with their text runs (stable shape ids, exact order). */
      runs(slideIndex) {
        const slide = doc.slides[slideIndex];
        if (!slide) throw new Error('lectern-adapter: unknown slide index ' + slideIndex);
        return slideRuns(slide).map((entry, i) => ({ index: i, shapeId: entry.shapeId, shapeName: entry.shapeName, text: entry.run.t }));
      },

      /** Speaker notes text of a slide (never shown on the audience screen). Takes a slide id (or a legacy index). */
      notes(ref) {
        const slide = slideByRef(ref);
        if (!slide) throw new Error('lectern-adapter: unknown slide ' + ref);
        return typeof slide.notes === 'string' ? slide.notes : '';
      },

      /* ----------------------------------------------------------- write face */
      /**
       * Edit exactly one run's text as one undo step. New form: (slideId, runId, text) where
       * runId comes from shapes(); the legacy form (slideIndex, runListIndex, text) still works.
       */
      setRunText(slideRef, runRef, text) {
        if (typeof slideRef === 'number') {
          const slide = doc.slides[slideRef];
          if (!slide) throw new Error('lectern-adapter: unknown slide index ' + slideRef);
          const entry = slideRuns(slide)[runRef];
          if (!entry) throw new Error('lectern-adapter: slide ' + slideRef + ' has no run ' + runRef);
          const before = entry.run.t;
          transact('text', () => { entry.run.t = String(text); });
          touchedRuns.push({ slideIndex: slideRef, runListIndex: runRef, shapeId: entry.shapeId, before, after: String(text) });
          return { slideIndex: slideRef, runListIndex: runRef, shapeId: entry.shapeId, before, after: String(text) };
        }
        const slide = findSlide(slideRef);
        if (!slide) return BLOCKED('NO_SLIDE', 'unknown slide');
        const m = RUN_ID.exec(String(runRef));
        const shape = m && slide.shapes.find((sh) => sh.id === m[1]);
        if (!shape) return BLOCKED('NO_RUN', 'unknown text run');
        if (!EDITABLE_TYPES.has(shape.type) || !shape.tx || !Array.isArray(shape.tx.ps)) return BLOCKED('NOT_EDITABLE', 'this object has no editable text');
        const para = shape.tx.ps[Number(m[2])];
        if (!para) return BLOCKED('NO_RUN', 'unknown text run');
        const runs = Array.isArray(para.rs) ? para.rs : (para.rs = []);
        const index = Number(m[3]);
        if (index > runs.length || (index === runs.length && index > 0)) return BLOCKED('NO_RUN', 'unknown text run');
        if (runs[index] && runs[index].fld) return BLOCKED('FIELD_RUN', 'a live field (page number, date) is not plain text');
        const next = String(text);
        const was = runs[index] ? runs[index].t : '';
        if (was === next) return { status: 'ok', changed: false };
        const out = transact('text', () => {
          if (runs[index]) runs[index].t = next;
          else runs.push({ t: next });
        });
        touchedRuns.push({ slideId: slide.id, runId: String(runRef), before: was, after: next });
        return { status: 'ok', changed: out.changed, slide: slide.id };
      },

      setNotes(slideId, text) {
        const slide = findSlide(slideId);
        if (!slide) return BLOCKED('NO_SLIDE', 'unknown slide');
        const next = String(text == null ? '' : text);
        if ((slide.notes || '') === next) return { status: 'ok', changed: false };
        const out = transact('notes', () => { slide.notes = next; });
        return { status: 'ok', changed: out.changed, slide: slide.id };
      },

      /** Insert a page after `afterSlideId` (null = at the end) using one of this deck's layouts. */
      addSlide(afterSlideId, layoutId) {
        const after = afterSlideId ? findSlide(afterSlideId) : null;
        if (afterSlideId && !after) return BLOCKED('NO_SLIDE', 'unknown slide');
        let layout = null;
        if (layoutId) {
          layout = layoutFor(layoutId);
          if (!layout) return BLOCKED('UNKNOWN_LAYOUT', 'this deck has no such layout');
        } else if (after) {
          layout = layoutFor(layoutIdOf(after)) || null;
        }
        const key = layout ? layout.modelKey : (after ? after.layout : 'text');
        if (!key) return BLOCKED('LAYOUT_UNSUPPORTED', 'this layout cannot be placed by the page editor');
        const designId = layout ? layout.designId : (after ? after.design : Object.keys(doc.designs)[0]);
        let id = '';
        const out = transact('slide-add', () => {
          const slide = L.model.newSlide(doc, key, designId);
          if (layout && layout.lkey) slide.lkey = layout.lkey;
          const at = after ? doc.slides.indexOf(after) + 1 : doc.slides.length;
          L.model.insertSlides(doc, at, [slide]);
          id = slide.id;
        });
        return { status: 'ok', changed: out.changed, slide: id };
      },

      duplicateSlide(slideId) {
        const slide = findSlide(slideId);
        if (!slide) return BLOCKED('NO_SLIDE', 'unknown slide');
        let id = '';
        const out = transact('slide-duplicate', () => {
          const copy = L.model.dupSlide(slide);
          L.model.insertSlides(doc, doc.slides.indexOf(slide) + 1, [copy]);
          id = copy.id;
        });
        return { status: 'ok', changed: out.changed, slide: id };
      },

      deleteSlide(slideId) {
        const slide = findSlide(slideId);
        if (!slide) return BLOCKED('NO_SLIDE', 'unknown slide');
        if (doc.slides.length < 2) return BLOCKED('LAST_SLIDE', 'a presentation keeps at least one page');
        const index = doc.slides.indexOf(slide);
        const out = transact('slide-delete', () => { doc.slides.splice(index, 1); });
        // The page that now sits at the same position (or the new last one), for the caller's selection.
        const next = doc.slides[Math.min(index, doc.slides.length - 1)];
        return { status: 'ok', changed: out.changed, slide: next ? next.id : '' };
      },

      setLayout(slideId, layoutId) {
        const slide = findSlide(slideId);
        if (!slide) return BLOCKED('NO_SLIDE', 'unknown slide');
        const layout = layoutFor(layoutId);
        if (!layout) return BLOCKED('UNKNOWN_LAYOUT', 'this deck has no such layout');
        if (!layout.modelKey) return BLOCKED('LAYOUT_UNSUPPORTED', 'this layout cannot be placed by the page editor');
        if (layoutIdOf(slide) === layout.id) return { status: 'ok', changed: false };
        const out = transact('layout', () => {
          slide.design = layout.designId;
          L.model.applyLayout(doc, slide, layout.modelKey);
          if (layout.lkey) slide.lkey = layout.lkey; else delete slide.lkey;
        });
        return { status: 'ok', changed: out.changed, slide: slide.id };
      },

      resetLayout(slideId) {
        const slide = findSlide(slideId);
        if (!slide) return BLOCKED('NO_SLIDE', 'unknown slide');
        const out = transact('layout', () => { L.model.applyLayout(doc, slide, slide.layout); });
        return { status: 'ok', changed: out.changed, slide: slide.id };
      },

      /* ------------------------------------------------------------- comments */
      comments: (slideId) => (slideId ? (findSlide(slideId) ? commentsOf(findSlide(slideId)) : []) : doc.slides.flatMap(commentsOf)),

      addComment(slideId, { anchorShapeId, author = '', text = '', date = '' } = {}) {
        const slide = findSlide(slideId);
        if (!slide) return BLOCKED('NO_SLIDE', 'unknown slide');
        if (!String(text).trim()) return BLOCKED('EMPTY', 'a comment needs some text');
        if (anchorShapeId && !L.model.shapeById(slide, anchorShapeId)) return BLOCKED('NO_SHAPE', 'unknown object');
        const item = { uid: L.uid('cm'), parent: null, anchor: anchorShapeId || '', author: String(author), text: String(text), date: String(date || nowStamp()), modern: L.comments.flavour(doc, slide) };
        transact('comment-add', () => { L.comments.add(slide, item); });
        return { status: 'ok', id: slide.id + '#' + item.uid };
      },

      /** Reply into a thread (a reply to a reply joins the same root). Legacy threads use p15:parentCm. */
      replyComment(rootId, { author = '', text = '', date = '' } = {}) {
        const hit = findComment(rootId);
        if (!hit) return BLOCKED('NO_COMMENT', 'unknown comment');
        if (!String(text).trim()) return BLOCKED('EMPTY', 'a reply needs some text');
        const root = hit.comment.parentId ? findComment(hit.comment.parentId) : hit;
        if (!root) return BLOCKED('NO_COMMENT', 'unknown comment');
        const item = { uid: L.uid('cm'), parent: tailOf(root.comment.id), anchor: '', author: String(author), text: String(text), date: String(date || nowStamp()), modern: !!root.comment.modern };
        transact('comment-reply', () => { L.comments.add(hit.slide, item); });
        return { status: 'ok', id: hit.slide.id + '#' + item.uid };
      },

      touched: () => touchedRuns.slice(),

      /* ----------------------------------------------------------------- undo */
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      undoLabel: () => (undoStack.length ? undoStack[undoStack.length - 1].label : ''),
      // One named undo step around several model edits (find/replace's 全部替换).
      transact: (label, fn) => transact(String(label || ''), fn),
      redoLabel: () => (redoStack.length ? redoStack[redoStack.length - 1].label : ''),
      undo() {
        const step = undoStack.pop();
        if (!step) return { changed: [] };
        redoStack.push(step);
        restore(step.before);
        editRevision += 1;
        encodeMemo = null;
        return { changed: diffSlides(step.after, step.before).map((slide) => ({ slide })) };
      },
      redo() {
        const step = redoStack.pop();
        if (!step) return { changed: [] };
        undoStack.push(step);
        restore(step.after);
        editRevision += 1;
        encodeMemo = null;
        return { changed: diffSlides(step.before, step.after).map((slide) => ({ slide })) };
      },

      /**
       * Serialize. Never edited: byte-identical pass-through. Otherwise the Lectern
       * preserving writer, same package variant as the input.
       */
      async save() {
        if (editRevision === 0) return { bytes: cloneBytes(original), mode: 'original-bytes' };
        const out = await encodeCurrent();
        return { bytes: out.bytes.slice(0), mode: 'preserving-edit' };
      },

      /**
       * What saving the current model would convert or lose, from the encode path itself:
       * { converted: [{ slide, what, kind, detail, id }], lost: [...] }. A deck that was never
       * edited reports nothing because save() hands back the original bytes.
       */
      async exportReport() {
        const report = { converted: [], lost: [] };
        if (editRevision === 0) return report;
        const out = await encodeCurrent();
        const seen = new Set();
        for (const entry of out.losses) {
          if (entry.action !== 'conversion' && entry.action !== 'drop') continue;
          const id = String(entry.id || '');
          const kind = id.split(':')[0] || 'other';
          const place = String(entry.place || entry.where || '');
          const key = entry.action + '|' + id + '|' + place;
          if (seen.has(key)) continue;
          seen.add(key);
          const item = { slide: place, what: kind, kind, detail: String(entry.what || ''), id };
          if (kind === 'notes-edit') {
            // The loss entry names the notes part; the page is the slide the id points at.
            const at = doc.slides.findIndex((sl) => sl.id === id.slice(id.indexOf(':') + 1));
            item.kind = 'notes'; item.what = 'notes';
            if (at >= 0) { item.page = at + 1; item.slideId = doc.slides[at].id; }
          }
          (entry.action === 'drop' ? report.lost : report.converted).push(item);
        }
        return report;
      },

      /** Feature/loss ledger as the codec reports it. */
      losses: () => (Array.isArray(doc.losses) ? doc.losses.slice() : []),

      originalBytes: () => cloneBytes(original),
      originalBytesEqual: (candidate) => bytesEqual(original, candidate),
    };
    await baseline.schedule();
    return api;
  }

  root.ClioWorksLecternAdapter = Object.freeze({ open, loadCodec, MODULES: MODULES.slice() });
})(typeof window !== 'undefined' ? window : globalThis);
