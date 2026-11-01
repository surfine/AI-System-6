/* ClioStage native presentation surface (S11 M2; one editing mode since ruling D1).
 *
 * A pptx opened from the desk is edited INSIDE the existing ClioStage window: no
 * new window name. ClioStage's Markdown chrome (details bar, toolbar, viewport,
 * ask bar) steps aside while a presentation is mounted and comes back when it
 * closes. One editing mode (owner ruling D1, 2026-10-29: Express and 完整编辑
 * merged) over one document and one dirty axis: page order, the current page and
 * its speaker notes; change the text of a run, change the notes, read and add
 * comments, and the existing ClioStage page commands applied to the native
 * model — add, duplicate and delete a page, switch to one of THIS deck's own
 * layouts, reset the layout, check the current page. Every command lives in the
 * menu bar; the window's one document bar holds the view (编辑 / 总览), the
 * page's layout, the margin-notes rail's slot and the save state.
 *
 * The page is drawn from the Lectern model at its own pt geometry. Objects this
 * surface cannot model (chart, SmartArt, group, table, other shapes) are drawn
 * read-only as a framed placeholder naming the object, with its lock mark and
 * Balloon Help (D1: marked in place, not handled by a mode); a picture is drawn as its
 * image. Nothing is ever dropped from the page.
 *
 * The document model is the live Lectern adapter the native host puts on the
 * record (record.liveAdapter). This file never parses or writes a package itself
 * and keeps no second model, history or database:
 *   dirty   = adapter.isDirty()                (one source)
 *   undo    = the adapter's own transactions    (Edit menu, via clio-stage.js)
 *   save    = AISystem6ClioWorks.saveNativeDocument (the native host writes)
 *   losses  = adapter.exportReport()            (first-save list only when > 0)
 * Every call into the adapter is feature-detected: the slide-id API (slides /
 * shapes / notes(slideId) / setRunText(slideId, runId, text)) when it is there,
 * otherwise the index API the adapter has always had (presentation / runs /
 * notes(index) / setRunText(index, runIndex, text)). A missing capability is not
 * drawn, or is answered with a receipt, never faked.
 *
 * Layers: createSession() is the document-facing state (no DOM; driven headless
 * by tests/features/clioworks-s11-m2-stage-native.test.mjs); mountSurface()
 * draws it into the window. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioStageNative) return;

  const PX_PER_PT = 4 / 3;
  const READ_ONLY_KINDS = Object.freeze({
    image: 'clio_stage_native_kind_picture',
    table: 'clio_stage_native_kind_table',
    chart: 'clio_stage_native_kind_chart',
    group: 'clio_stage_native_kind_group',
    shape: 'clio_stage_native_kind_shape',
    line: 'clio_stage_native_kind_line',
    other: 'clio_stage_native_kind_other',
  });
  const STEP_KEYS = Object.freeze({
    text: 'clio_stage_native_step_text',
    notes: 'clio_stage_native_step_notes',
    'slide-add': 'clio_stage_native_step_slide_add',
    'slide-duplicate': 'clio_stage_native_step_slide_duplicate',
    'slide-delete': 'clio_stage_native_step_slide_delete',
    'slide-move': 'clio_stage_native_step_slide_move',
    layout: 'clio_stage_native_step_layout',
    animation: 'clio_stage_native_step_animation',
    transition: 'clio_stage_native_step_transition',
    'notes-master': 'clio_stage_native_step_notes_master',
    'comment-add': 'clio_stage_native_step_comment',
    'comment-reply': 'clio_stage_native_step_comment',
    // N3: the find/replace engine's single replace (find-replace.js); its batch
    // step 「全部替换 N 处」 carries a count, so it is matched below, not listed.
    '替换': 'clio_stage_native_step_replace',
  });

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const fn = (target, name) => !!target && typeof target[name] === 'function';
  const cssEscape = (value) => (root.CSS && typeof root.CSS.escape === 'function' ? root.CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'));
  const blocked = (out) => !!out && typeof out === 'object' && (out.status === 'blocked' || out.status === 'failed' || out.ok === false);

  // macOS takes the command key only: Ctrl+E/S/M belong to the text fields there.
  function commandKey(event) {
    const useMeta = typeof shortcutUsesCommandKey === 'function' ? shortcutUsesCommandKey() : /mac|iphone|ipad/i.test(String(typeof navigator !== 'undefined' && (navigator.platform || '')));
    return useMeta ? !!event.metaKey && !event.ctrlKey : !!event.ctrlKey && !event.metaKey;
  }
  function stepKey(label) {
    const text = String(label || '');
    if (!text) return '';
    if (text.startsWith('clio_stage_native_step_')) return text;
    if (/^全部替换 \d+ 处$/.test(text)) return 'clio_stage_native_step_replace_all';
    return STEP_KEYS[text] || 'clio_stage_native_step_change';
  }
  /** The count a 「全部替换 N 处」 undo label carries, as the translation's args. */
  function stepLabelArgs(label) {
    const m = /^全部替换 (\d+) 处$/.exec(String(label || ''));
    return m ? [Number(m[1])] : [];
  }

  /* ------------------------------------------------------------ the deck */
  // One reading of the adapter, whichever API it speaks. Run ids are the
  // adapter's own when it has them; on the index API a run id is
  // "<shape id>:<paragraph>:<run>", mapped back to the run's index in runs().

  const hexFrom = (xml, tag) => {
    const m = new RegExp(`<a:${tag}\\b[^>]*>([\\s\\S]*?)</a:${tag}>`).exec(String(xml || ''));
    const c = m && /srgbClr val="([0-9A-Fa-f]{6})"/.exec(m[1]);
    return c ? '#' + c[1] : '';
  };
  function paragraphDefaults(para) {
    // The codec keeps a paragraph's default run look as its original XML; the
    // size and colour are read from it for drawing only, never written.
    const xml = para && para.pp && para.pp.keep && para.pp.keep.fragment && para.pp.keep.fragment.xml;
    const sz = /<a:defRPr\b[^>]*\bsz="(\d+)"/.exec(String(xml || ''));
    return { size: sz ? Number(sz[1]) / 100 : 0, color: hexFrom(xml, 'defRPr'), bold: /<a:defRPr\b[^>]*\bb="1"/.test(String(xml || '')) };
  }
  function legacyKind(type) {
    if (type === 'text') return 'text';
    if (['image', 'table', 'chart', 'group', 'line', 'shape'].includes(type)) return type;
    return 'other';
  }

  function readDeck(adapter) {
    const modern = fn(adapter, 'slides') && fn(adapter, 'shapes');
    const pres = () => (fn(adapter, 'presentation') ? adapter.presentation() : null);
    const pageSize = () => {
      if (fn(adapter, 'pageSize')) { const s = adapter.pageSize() || {}; if (s.w > 0 && s.h > 0) return { w: s.w, h: s.h }; }
      const p = pres();
      return p && p.W > 0 && p.H > 0 ? { w: p.W, h: p.H } : { w: 960, h: 540 };
    };
    function slides() {
      if (modern) return (adapter.slides() || []).map((s, i) => ({ id: String(s.id), index: Number.isInteger(s.index) ? s.index : i, layoutId: s.layoutId || '', hidden: !!s.hidden }));
      const p = pres();
      return (p && Array.isArray(p.slides) ? p.slides : []).map((s, i) => ({ id: String(s.id || `slide-${i}`), index: i, layoutId: s.layout || '', hidden: !!s.hidden }));
    }
    const indexOf = (slideId) => slides().findIndex((s) => s.id === slideId);
    const rawSlide = (slideId) => { const p = pres(); const i = indexOf(slideId); return p && i >= 0 ? p.slides[i] : null; };
    function legacyShapes(slide) {
      const out = [];
      let runIndex = 0;
      for (const sh of slide && Array.isArray(slide.shapes) ? slide.shapes : []) {
        const kind = legacyKind(sh.type);
        const ps = sh.tx && Array.isArray(sh.tx.ps) ? sh.tx.ps : [];
        const paragraphs = ps.map((para, pi) => {
          const def = paragraphDefaults(para);
          const runs = [];
          (Array.isArray(para.rs) ? para.rs : []).forEach((run, ri) => {
            if (!run || typeof run.t !== 'string') return;
            runs.push({ id: `${sh.id}:${pi}:${ri}`, legacy: runIndex, text: run.t, b: run.b != null ? !!run.b : def.bold, i: !!run.i, u: !!run.u && run.u !== 'none', size: run.sz || def.size || 18, color: run.color || def.color || '' });
            runIndex += 1;
          });
          return { level: para.lvl || 0, bullet: !!(para.pp && para.pp.bu && para.pp.bu.t && para.pp.bu.t !== 'none'), align: (para.pp && para.pp.algn) || 'l', runs };
        });
        let imageUrl = '';
        if (kind === 'image') {
          try {
            const media = root.L && root.L.media && fn(root.L.media, 'get') ? root.L.media.get(sh.media || sh.src || (sh.fill && sh.fill.media)) : null;
            imageUrl = (media && (media.url || media.src)) || '';
          } catch (error) { imageUrl = ''; }
        }
        out.push({
          id: String(sh.id), kind, name: sh.name || '', x: +sh.x || 0, y: +sh.y || 0, w: +sh.w || 0, h: +sh.h || 0,
          placeholder: sh.ph ? (sh.ph.type || 'body') : '',
          // The index API edits a run of any top-level shape that carries text.
          editable: (kind === 'text' || kind === 'shape') && paragraphs.some((para) => para.runs.length > 0),
          paragraphs, imageUrl,
        });
      }
      return out;
    }
    function shapes(slideId) {
      if (modern) {
        return (adapter.shapes(slideId) || []).map((sh) => ({
          ...sh, id: String(sh.id), kind: sh.kind || 'other',
          // The adapter sets `placeholder` only on placeholder shapes, and to undefined when the <p:ph> carries no type.
          placeholder: 'placeholder' in sh ? (sh.placeholder || 'body') : '',
          paragraphs: (Array.isArray(sh.paragraphs) ? sh.paragraphs : []).map((para) => ({
            level: para.level || 0, bullet: !!para.bullet, align: para.align || 'l',
            runs: (para.runs || []).map((run) => ({ ...run, id: String(run.id), text: String(run.text ?? ''), size: run.size || 18 })),
          })),
          editable: !!sh.editable,
        }));
      }
      return legacyShapes(rawSlide(slideId));
    }
    function findRun(slideId, runId) {
      for (const sh of shapes(slideId)) for (const para of sh.paragraphs) for (const run of para.runs) if (run.id === runId) return { shape: sh, run };
      return null;
    }
    function notes(slideId) {
      try {
        if (modern) return fn(adapter, 'notes') ? String(adapter.notes(slideId) ?? '') : '';
        const i = indexOf(slideId);
        return i >= 0 && fn(adapter, 'notes') ? String(adapter.notes(i) ?? '') : '';
      } catch (error) { return ''; }
    }
    function background(slideId) {
      const s = rawSlide(slideId);
      const fill = s && s.bg;
      if (fill && fill.t === 'solid' && /^#[0-9a-f]{6}$/i.test(fill.c || '')) return fill.c;
      return '';
    }
    function setRunText(slideId, runId, text) {
      if (!fn(adapter, 'setRunText')) return { status: 'blocked', code: 'NO_TEXT_EDIT' };
      if (modern) return adapter.setRunText(slideId, runId, text);
      const hit = findRun(slideId, runId);
      if (!hit) return { status: 'failed', code: 'NO_RUN' };
      return adapter.setRunText(indexOf(slideId), hit.run.legacy, text);
    }
    const canSetNotes = () => modern && fn(adapter, 'setNotes');
    const layouts = () => { try { return fn(adapter, 'layouts') ? (adapter.layouts() || []).map((l) => ({ id: String(l.id), name: l.name || String(l.id), kind: l.kind || '' })) : []; } catch (error) { return []; } };
    return { modern, slides, shapes, notes, background, pageSize, findRun, setRunText, canSetNotes, layouts, indexOf };
  }

  // The slide's title in the page list: its title placeholder, else its first line of text.
  function slideTitle(shapes) {
    const text = (sh) => sh.paragraphs.map((para) => para.runs.map((run) => run.text).join('')).join(' ').trim();
    const titled = shapes.find((sh) => /title/i.test(sh.placeholder || '') && text(sh));
    if (titled) return text(titled);
    const first = shapes.find((sh) => text(sh));
    return first ? text(first) : '';
  }

  /* ---------------------------------------------------------------- session */

  /**
   * Document-facing state for one mounted presentation.
   * @param {object} initialAdapter the live Lectern adapter (record.liveAdapter)
   * @param {{fileName?:string, mountedName?:string, host?:object, confirmList?:Function, alertFailure?:Function, readAdapter?:Function, onHistory?:Function}} opts
   */
  /** Handout pages: slide indexes per sheet. `perPage` 1/2/3/4/6/9; `notes` = one slide with its notes per sheet. */
  const HANDOUT_PER_PAGE = Object.freeze([1, 2, 3, 4, 6, 9]);
  function handoutPages(count, { perPage = 1, notes = false } = {}) {
    const per = notes ? 1 : (HANDOUT_PER_PAGE.includes(perPage) ? perPage : 1);
    const pages = [];
    for (let i = 0; i < count; i += per) pages.push(Array.from({ length: Math.min(per, count - i) }, (_, k) => i + k));
    return pages;
  }

  function createSession(initialAdapter, opts = {}) {
    let adapter = initialAdapter;
    let deck = readDeck(adapter);
    const listeners = new Set();
    const host = opts.host || {};
    const s = {
      slideId: (deck.slides()[0] || {}).id || '',
      selection: null,          // { shapeId, runId? } on the current page
      receipt: { key: '', args: [], kind: 'idle' },
      saving: false,
      confirming: false,
      confirmedLost: 0,
      composing: false,
      closed: false,
      reverting: false,
    };

    const notify = () => listeners.forEach((listener) => { try { listener(); } catch (error) { console.error(error); } });
    const isDirty = () => (fn(adapter, 'isDirty') ? !!adapter.isDirty() : false);
    const revision = () => (fn(adapter, 'getEditRevision') ? Number(adapter.getEditRevision()) || 0 : 0);
    const restingReceipt = () => (isDirty() ? { key: 'clio_stage_native_receipt_dirty', args: [], kind: 'dirty' } : { key: '', args: [], kind: 'idle' });
    const setReceipt = (key, kind = 'info', args = []) => { s.receipt = { key, args, kind }; notify(); };
    const settleReceipt = () => { if (s.receipt.kind === 'blocked' || s.receipt.kind === 'info') s.receipt = restingReceipt(); };
    const afterEdit = () => { if (!s.saving) s.receipt = restingReceipt(); notify(); };

    const slides = () => deck.slides();
    const currentSlide = () => slides().find((slide) => slide.id === s.slideId) || slides()[0] || null;
    const pageNumber = () => { const list = slides(); const i = list.findIndex((slide) => slide.id === s.slideId); return { at: i + 1, of: list.length }; };
    function keepSlideValid(preferIndex) {
      const list = slides();
      if (list.some((slide) => slide.id === s.slideId)) return;
      const at = Math.max(0, Math.min(list.length - 1, Number.isInteger(preferIndex) ? preferIndex : 0));
      s.slideId = list[at] ? list[at].id : '';
      s.selection = null;
    }

    function guard() {
      if (s.closed) return { status: 'blocked', code: 'CLOSED' };
      if (s.reverting) return { status: 'blocked', code: 'REVERTING' };
      // The first-save list describes one state; nothing may change under it. (Saving stays editable: the adapter memo keeps the bytes honest.)
      if (s.confirming) return { status: 'blocked', code: 'CONFIRM_OPEN' };
      return null;
    }

    /** Change one run's text. Both modes; a run of a read-only object is refused. */
    function editRun(slideId, runId, text) {
      const stop = guard();
      if (stop) return stop;
      const hit = deck.findRun(slideId, runId);
      if (!hit) return { status: 'failed', code: 'NO_RUN' };
      if (!hit.shape.editable) {
        setReceipt('clio_stage_native_receipt_read_only', 'blocked', [hit.shape.name || tr(READ_ONLY_KINDS[hit.shape.kind] || READ_ONLY_KINDS.other)]);
        return { status: 'blocked', code: 'READ_ONLY_OBJECT' };
      }
      const next = String(text);
      if (next === hit.run.text) return { status: 'ok', code: 'UNCHANGED' };
      let out;
      try { out = deck.setRunText(slideId, runId, next); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
      if (blocked(out)) {
        setReceipt('clio_stage_native_receipt_refused', 'blocked', [String(out.message || out.code || '')]);
        return { status: 'blocked', code: out.code || 'REFUSED' };
      }
      afterEdit();
      return { status: 'ok' };
    }

    /** Change the current page's speaker notes (never shown to the audience). */
    function editNotes(slideId, text) {
      const stop = guard();
      if (stop) return stop;
      const next = String(text);
      if (next === deck.notes(slideId)) return { status: 'ok', code: 'UNCHANGED' };
      if (!deck.canSetNotes()) {
        setReceipt('clio_stage_native_receipt_notes_read_only', 'blocked');
        return { status: 'blocked', code: 'NOTES_READ_ONLY' };
      }
      let out;
      try { out = adapter.setNotes(slideId, next); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
      if (blocked(out)) {
        setReceipt('clio_stage_native_receipt_refused', 'blocked', [String(out.message || out.code || '')]);
        return { status: 'blocked', code: out.code || 'REFUSED' };
      }
      afterEdit();
      return { status: 'ok' };
    }

    /* -- page commands: the existing ClioStage commands, on the native model -- */
    const SLIDE_CALLS = {
      'slide.add': 'addSlide',
      'slide.duplicate': 'duplicateSlide',
      'slide.delete': 'deleteSlide',
      'slide.layout': 'setLayout',
      'slide.reset-layout': 'resetLayout',
    };
    function slideCommand(id, arg) {
      const gate = commandState(id);
      if (!gate.enabled) {
        if (gate.reason) setReceipt('clio_stage_native_receipt_reason', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      const before = slides();
      const at = before.findIndex((slide) => slide.id === s.slideId);
      const current = before[at];
      let out;
      try {
        if (id === 'slide.add') out = adapter.addSlide(current ? current.id : null, arg || (current && current.layoutId) || undefined);
        else if (id === 'slide.layout') out = adapter.setLayout(current.id, arg);
        else out = adapter[SLIDE_CALLS[id]](current.id);
      } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
      if (blocked(out)) {
        setReceipt('clio_stage_native_receipt_refused', 'blocked', [String(out.message || out.code || '')]);
        return { status: 'blocked', code: out.code || 'REFUSED' };
      }
      if (id === 'slide.add' || id === 'slide.duplicate') {
        const known = new Set(before.map((slide) => slide.id));
        const made = (out && (out.slideId || out.id)) || (slides().find((slide) => !known.has(slide.id)) || {}).id;
        if (made) { s.slideId = String(made); s.selection = null; }
      }
      keepSlideValid(at);
      afterEdit();
      return { status: 'ok' };
    }

    /** Move a page from one position to another as one named undo step (the overview's drag). */
    function moveSlide(fromIndex, toIndex) {
      const gate = commandState('slide.move');
      if (!gate.enabled) {
        if (gate.reason) setReceipt('clio_stage_native_receipt_reason', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      const list = slides();
      const from = Number(fromIndex);
      const to = Number(toIndex);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
        return { status: 'failed', code: 'NO_MOVE' };
      }
      const movedId = list[from].id;
      let out;
      try {
        out = adapter.transact('slide-move', () => {
          const doc = adapter.presentation();
          const order = doc.slides;
          const moved = order.splice(from, 1)[0];
          order.splice(to, 0, moved);
        });
      } catch (error) {
        setReceipt('clio_stage_native_receipt_refused', 'blocked', [String(error && error.message || error)]);
        return { status: 'blocked', code: 'REFUSED' };
      }
      if (blocked(out)) {
        setReceipt('clio_stage_native_receipt_refused', 'blocked', [String(out.message || out.code || '')]);
        return { status: 'blocked', code: out.code || 'REFUSED' };
      }
      if (out && out.changed === false) return { status: 'ok', code: 'UNCHANGED' };
      if (slides().some((slide) => slide.id === movedId)) { s.slideId = movedId; s.selection = null; }
      keepSlideValid(slides().findIndex((slide) => slide.id === movedId));
      afterEdit();
      return { status: 'ok' };
    }

    /* -- save, revert and the first-save list: as the workbook surface (S11 M1) -- */
    async function readReport() {
      if (!isDirty()) return { converted: [], lost: [] };
      if (fn(adapter, 'exportReport')) {
        const report = (await adapter.exportReport()) || {};
        return { converted: Array.isArray(report.converted) ? report.converted : [], lost: Array.isArray(report.lost) ? report.lost : [] };
      }
      // Older adapters: the codec's own loss ledger, counted, never shown as part names.
      const seen = new Set();
      const lost = [];
      for (const entry of fn(adapter, 'losses') ? adapter.losses() : []) {
        if (!entry || seen.has(entry.id) || (entry.action !== 'drop' && entry.action !== 'conversion')) continue;
        seen.add(entry.id);
        lost.push({ kind: 'other' });
      }
      return { converted: [], lost };
    }

    /** ⌘S. One candidate is never submitted twice; edits made while saving stay dirty. */
    async function save() {
      const stop = guard();
      if (stop) return stop;
      if (s.saving) return { status: 'blocked', code: 'SAVE_IN_FLIGHT' };
      if (s.confirming) return { status: 'blocked', code: 'CONFIRM_OPEN' };
      if (!isDirty()) {
        setReceipt('clio_stage_native_receipt_nothing', 'info');
        return { status: 'clean' };
      }
      if (!fn(host, 'save')) {
        setReceipt('clio_stage_native_receipt_unavailable', 'error');
        return { status: 'failed', reason: 'unavailable' };
      }
      s.saving = true;
      setReceipt('clio_stage_native_receipt_saving', 'saving');
      let report;
      try { report = await readReport(); } catch (error) {
        s.saving = false;
        setReceipt('clio_stage_native_receipt_failed', 'error');
        if (typeof opts.alertFailure === 'function') await opts.alertFailure({ ok: false, reason: 'report-failed' });
        return { status: 'failed', reason: 'report-failed' };
      }
      const count = report.converted.length + report.lost.length;
      const needsList = count > 0 && count > s.confirmedLost;
      if (needsList) {
        s.saving = false;
        s.confirming = true;
        s.receipt = restingReceipt();
        notify();
        let choice = 'cancel';
        try { choice = typeof opts.confirmList === 'function' ? await opts.confirmList(report) : 'cancel'; }
        finally { s.confirming = false; }
        if (choice !== 'save') {
          setReceipt('clio_stage_native_receipt_not_saved', 'info');
          return { status: 'cancelled' };
        }
        s.saving = true;
        setReceipt('clio_stage_native_receipt_saving', 'saving');
      }
      const rev = revision();
      let result;
      try { result = await host.save(opts.mountedName); } catch (error) {
        result = { ok: false, reason: 'encode-failed', message: String(error && error.message || error) };
      }
      s.saving = false;
      if (!result || !result.ok) {
        setReceipt(result && result.reason === 'unavailable' ? 'clio_stage_native_receipt_unavailable' : 'clio_stage_native_receipt_failed', 'error');
        if (typeof opts.alertFailure === 'function') await opts.alertFailure(result || { ok: false });
        return { status: 'failed', reason: (result && result.reason) || 'failed' };
      }
      if (needsList) s.confirmedLost = count;
      if (revision() > rev || isDirty()) setReceipt('clio_stage_native_receipt_saved_older', 'saved-older');
      else setReceipt('clio_stage_native_receipt_saved', 'saved', [opts.fileName || '']);
      return { status: 'ok', mode: result.mode, byteLength: result.byteLength, sha256: result.sha256 };
    }

    /* Edit › Undo / Redo over the adapter's own transactions. */
    function canUndo() { return !s.closed && !s.confirming && fn(adapter, 'canUndo') && fn(adapter, 'undo') && !!adapter.canUndo(); }
    function canRedo() { return !s.closed && !s.confirming && fn(adapter, 'canRedo') && fn(adapter, 'redo') && !!adapter.canRedo(); }
    function travel(direction) {
      if (direction === 'undo' ? !canUndo() : !canRedo()) return false;
      const at = slides().findIndex((slide) => slide.id === s.slideId);
      const out = adapter[direction]() || {};
      // The page the step changed comes forward, so the writer sees what moved.
      const changed = (Array.isArray(out.changed) ? out.changed : []).map((item) => item && String(item.slide)).filter(Boolean);
      const visible = changed.find((id) => slides().some((slide) => slide.id === id));
      if (visible && visible !== s.slideId) { s.slideId = visible; s.selection = null; }
      keepSlideValid(at);
      if (s.receipt.kind !== 'saving' && s.receipt.kind !== 'error') s.receipt = restingReceipt();
      if (typeof opts.onHistory === 'function') opts.onHistory(out);
      notify();
      return true;
    }
    const editHistory = Object.freeze({
      undo: () => travel('undo'),
      redo: () => travel('redo'),
      canUndo,
      canRedo,
      undoLabel: () => (canUndo() && fn(adapter, 'undoLabel') ? stepKey(adapter.undoLabel()) : ''),
      redoLabel: () => (canRedo() && fn(adapter, 'redoLabel') ? stepKey(adapter.redoLabel()) : ''),
      // 「全部替换 N 处」 keeps its count in the menu row (undoLabelArgs feeds it).
      undoLabelArgs: () => (canUndo() && fn(adapter, 'undoLabel') ? stepLabelArgs(adapter.undoLabel()) : []),
      redoLabelArgs: () => (canRedo() && fn(adapter, 'redoLabel') ? stepLabelArgs(adapter.redoLabel()) : []),
    });

    const commentsAvailable = () => fn(adapter, 'comments') && fn(adapter, 'addComment');
    const checkAvailable = () => typeof opts.checkAvailable === 'function' ? !!opts.checkAvailable() : true;
    // 放映 (must-fix 2) is owned by the mounted surface; the session only needs
    // to know when the show layer is up, so its rows grey like the Markdown deck's.
    const presenting = () => (typeof opts.showActive === 'function' ? !!opts.showActive() : false);
    // The overview's drag: one named undo step in the adapter's own model, through
    // its transact (the slides live in the presentation the adapter returns).
    const canReorder = () => fn(adapter, 'transact') && fn(adapter, 'presentation');

    /** A command that is not wired is not listed; one that is wired but unavailable carries its reason. */
    function commandState(id) {
      if (s.closed) return { enabled: false, reason: '' };
      const busy = s.saving || s.confirming || s.reverting;
      switch (id) {
        case 'file.save':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_stage_native_reason_confirming') };
          if (!isDirty()) return { enabled: false, reason: tr('clio_stage_native_receipt_nothing') };
          return { enabled: true };
        case 'file.revert':
          if (busy) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          if (!isDirty()) return { enabled: false, reason: tr('clio_stage_native_receipt_nothing') };
          return { enabled: true };
        case 'page.prev': return pageNumber().at > 1 ? { enabled: true } : { enabled: false, reason: tr('clio_stage_native_reason_first_page') };
        case 'page.next': { const n = pageNumber(); return n.at < n.of ? { enabled: true } : { enabled: false, reason: tr('clio_stage_native_reason_last_page') }; }
        case 'slide.delete':
          if (busy) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          return slides().length > 1 ? { enabled: true } : { enabled: false, reason: tr('clio_stage_native_reason_last_slide') };
        case 'slide.layout':
          if (busy) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          return deck.layouts().length > 1 ? { enabled: true } : { enabled: false, reason: tr('clio_stage_native_reason_one_layout') };
        case 'slide.reset-layout': {
          if (busy) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          let holders = [];
          try { holders = deck.shapes(s.slideId); } catch (error) { holders = []; }
          return holders.some((sh) => sh.placeholder) ? { enabled: true } : { enabled: false, reason: tr('clio_stage_native_reason_no_placeholder') };
        }
        case 'motion.open':
        case 'notesmaster.open':
        case 'handout.print':
          return busy ? { enabled: false, reason: tr('clio_stage_native_reason_saving') } : { enabled: true };
        case 'slide.add':
        case 'slide.duplicate':
          return busy ? { enabled: false, reason: tr('clio_stage_native_reason_saving') } : { enabled: true };
        // 放映 and 页面总览 (must-fix 2). The overview lives outside the show, as on the deck.
        case 'present': {
          if (busy) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          return presenting() ? { enabled: false, reason: '' } : { enabled: true };
        }
        case 'page.overview': {
          if (busy) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          return presenting() ? { enabled: false, reason: '' } : { enabled: true };
        }
        case 'slide.move': {
          if (busy) return { enabled: false, reason: tr('clio_stage_native_reason_saving') };
          return canReorder() ? { enabled: true } : { enabled: false, reason: tr('clio_stage_native_reason_reorder') };
        }
        default:
          return { enabled: true };
      }
    }
    function commands() {
      const wired = (name) => fn(adapter, name);
      const list = [
        { id: 'file.save', labelKey: 'clio_stage_native_cmd_save', shortcut: '⌘S' },
        fn(host, 'revert') ? { id: 'file.revert', labelKey: 'clio_stage_native_cmd_revert', shortcut: '' } : null,
        { id: 'present', labelKey: 'clio_stage_present', shortcut: '⇧⌘P' },
        { id: 'page.overview', labelKey: 'clio_stage_overview', shortcut: '' },
        { id: 'page.prev', labelKey: 'previous_slide', shortcut: '⌘[' },
        { id: 'page.next', labelKey: 'next_slide', shortcut: '⌘]' },
        wired('addSlide') ? { id: 'slide.add', labelKey: 'clio_stage_slide_add', shortcut: '' } : null,
        wired('duplicateSlide') ? { id: 'slide.duplicate', labelKey: 'clio_stage_slide_duplicate', shortcut: '' } : null,
        wired('deleteSlide') ? { id: 'slide.delete', labelKey: 'clio_stage_slide_delete', shortcut: '' } : null,
        wired('setLayout') && wired('layouts') ? { id: 'slide.layout', labelKey: 'clio_stage_native_cmd_layout', shortcut: '' } : null,
        wired('resetLayout') ? { id: 'slide.reset-layout', labelKey: 'clio_stage_reset_layout', shortcut: '' } : null,
        wired('animations') ? { id: 'motion.open', labelKey: 'clio_stage_native_cmd_motion', shortcut: '' } : null,
        wired('notesMaster') ? { id: 'notesmaster.open', labelKey: 'clio_stage_native_cmd_notes_master', shortcut: '' } : null,
        { id: 'handout.print', labelKey: 'clio_stage_native_cmd_handout', shortcut: '' },
        checkAvailable() ? { id: 'page.check', labelKey: 'clio_stage_native_cmd_check', shortcut: '⌘K' } : null,
        commentsAvailable() ? { id: 'comments.open', labelKey: 'clio_stage_native_cmd_comment', shortcut: '⌘M' } : null,
        // N3: the shared 查找 / 替换 windoid (features/clioworks-find.js).
        { id: 'find.open', labelKey: 'clioworks_find_replace_menu', shortcut: '⌘F' },
        { id: 'find.next', labelKey: 'find_next', shortcut: '⌘G' },
      ].filter(Boolean);
      return list.map((command) => ({ ...command, state: commandState(command.id) }));
    }

    /** 「复原到上次存储…」: the host re-opens the adapter from the last saved bytes. Not undoable. */
    async function revert() {
      if (!fn(host, 'revert')) return { status: 'failed', reason: 'unavailable' };
      const gate = commandState('file.revert');
      if (!gate.enabled) return { status: 'blocked', reason: gate.reason };
      let result;
      s.reverting = true;
      try { result = await host.revert(opts.mountedName); } catch (error) { result = { ok: false, message: String(error && error.message || error) }; } finally { s.reverting = false; }
      let next = null;
      if (result && result.ok) {
        const onRecord = typeof opts.readAdapter === 'function' ? opts.readAdapter() : null;
        next = onRecord && onRecord !== adapter ? onRecord : result.adapter || onRecord;
      }
      if (!next) {
        setReceipt('clio_stage_native_receipt_revert_failed', 'error');
        return { status: 'failed', reason: (result && result.reason) || 'failed' };
      }
      rebind(next);
      setReceipt('clio_stage_native_receipt_reverted', 'info');
      return { status: 'ok' };
    }
    function rebind(next) {
      const at = slides().findIndex((slide) => slide.id === s.slideId);
      adapter = next;
      deck = readDeck(adapter);
      s.selection = null;
      keepSlideValid(at);
    }

    function setSlide(id) {
      if (!slides().some((slide) => slide.id === id)) return false;
      if (id !== s.slideId) { s.slideId = id; s.selection = null; }
      settleReceipt();
      notify();
      return true;
    }
    function step(delta) {
      const list = slides();
      const at = list.findIndex((slide) => slide.id === s.slideId);
      const next = list[at + delta];
      return next ? setSlide(next.id) : false;
    }

    const session = {
      get adapter() { return adapter; },
      get deck() { return deck; },
      get slideId() { return s.slideId; },
      get selection() { return s.selection; },
      get receipt() { return s.receipt; },
      get saving() { return s.saving; },
      get confirming() { return s.confirming; },
      get composing() { return s.composing; },
      set composing(value) { s.composing = !!value; },
      get closed() { return s.closed; },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      notify,
      afterEdit,
      setReceipt,
      receiptText: () => (s.receipt.key ? tr(s.receipt.key, ...s.receipt.args) : ''),
      slides,
      currentSlide,
      pageNumber,
      shapes: (slideId = s.slideId) => deck.shapes(slideId),
      notes: (slideId = s.slideId) => deck.notes(slideId),
      notesEditable: () => deck.canSetNotes(),
      layouts: () => deck.layouts(),
      pageSize: () => deck.pageSize(),
      background: (slideId = s.slideId) => deck.background(slideId),
      slideTitle: (slideId) => slideTitle(deck.shapes(slideId)),
      setSlide,
      step,
      select(shapeId, runId) {
        s.selection = shapeId ? { shapeId: String(shapeId), ...(runId ? { runId: String(runId) } : {}) } : null;
        settleReceipt();
        notify();
      },
      editRun,
      editNotes,
      slideCommand,
      moveSlide,
      save,
      revert,
      rebind,
      isDirty,
      revision,
      commandState,
      commands,
      commentsAvailable,
      editHistory,
      close() { s.closed = true; listeners.clear(); },
    };
    return session;
  }

  /* ----------------------------------------------------- comments, as data */
  // Roots in order with their replies; a reply whose root is gone is kept as a root.
  function groupComments(list) {
    const byId = new Map();
    const roots = [];
    for (const item of Array.isArray(list) ? list : []) byId.set(String(item.id), { item, replies: [] });
    for (const entry of byId.values()) {
      const parent = entry.item.parentId != null ? byId.get(String(entry.item.parentId)) : null;
      if (parent) parent.replies.push(entry.item); else roots.push(entry);
    }
    return roots;
  }

  /* --------------------------------------------------------------- surface */

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

  // M1's placement rule (features/clio-chart-comments.js), shared when loaded.
  const DOCK_HEIGHT_PX = 188;
  function windoidPlacement(width, mainHeight) {
    const shared = root.AISystem6Windoid && root.AISystem6Windoid.placement;
    if (typeof shared === 'function') return shared(width, mainHeight);
    if (!Number.isFinite(Number(width)) || width < 640) return 'swap';
    if (width >= 1040) return 'float-right';
    if (mainHeight === undefined || mainHeight === null) return 'dock-below';
    return Number(mainHeight) >= 200 ? 'dock-below' : 'swap';
  }

  // A windoid: a small tool window with a thin title bar and a close box, one per
  // host, dressed by the desk's .windoid sheet (styles/84-windoid.css).
  function createWindoid(doc, host, { title, className, onClose }) {
    const rootEl = h(doc, 'div', { class: 'windoid ' + className, role: 'dialog', 'aria-label': title });
    const closeBox = h(doc, 'button', { type: 'button', class: 'windoid-close', 'aria-label': tr('clio_comments_close') });
    const titleEl = h(doc, 'span', { class: 'windoid-title', text: title });
    const body = h(doc, 'div', { class: 'windoid-body' });
    rootEl.append(h(doc, 'div', { class: 'windoid-titlebar' }, [closeBox, titleEl]), body);
    host.append(rootEl);
    host.classList.add('has-windoid');
    let closed = false;
    const place = () => {
      const width = host.clientWidth || 0;
      const main = host.querySelector('.csn-body');
      const top = main && Number.isFinite(main.offsetTop) ? Math.max(0, main.offsetTop) : 0;
      // The main area left once a docked windoid has taken its rows (the M1 rule).
      const height = host.clientHeight || 0;
      const placement = windoidPlacement(width, height ? height - top - DOCK_HEIGHT_PX : undefined);
      rootEl.style.setProperty('--windoid-main-top', `${top}px`);
      rootEl.dataset.windoidPlacement = placement;
      host.dataset.windoidPlacement = placement;
    };
    const handle = {
      root: rootEl,
      body,
      setTitle(text) { titleEl.textContent = text; rootEl.setAttribute('aria-label', text); },
      place,
      close() {
        if (closed) return;
        closed = true;
        rootEl.remove();
        host.classList.remove('has-windoid');
        delete host.dataset.windoidPlacement;
        if (typeof onClose === 'function') onClose();
      },
    };
    closeBox.addEventListener('click', () => handle.close());
    rootEl.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !event.isComposing) { event.stopPropagation(); handle.close(); } });
    place();
    return handle;
  }

  /**
   * Draw a session into the ClioStage window. Returns { root, render, runCommand, ... , unmount }.
   * Everything this changes outside its own subtree (title text, the window class) is put back by unmount().
   */
  function mountSurface(windowEl, session, opts = {}) {
    const doc = windowEl.ownerDocument;
    const pane = windowEl.querySelector('.clio-stage-pane');
    if (!pane) throw new Error('ClioStage native: the ClioStage window has no pane');
    const cleanups = [];
    const on = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    };
    let openedMenu = null;
    let runEditor = null;     // { el, slideId, runId, before, done }
    let windoid = null;       // { kind: 'comments'|'check', handle, refresh } — comments only without the rail
    let comments = null;      // D2: { handle, refresh } while the 旁注栏's 批注 panel holds this page's list
    let disposed = false;
    let resizeObserver = null;

    /* -- DOM -- */
    const receiptEl = h(doc, 'span', { class: 'csn-receipt', role: 'status', 'aria-live': 'polite' });
    const popButton = () => h(doc, 'button', { type: 'button', class: 'system-select-button csn-pop', 'aria-haspopup': 'menu' }, [h(doc, 'span', { class: 'system-select-label' })]);
    const setPopLabel = (button, text) => { button.firstChild.textContent = text; };
    // S1: the one document bar — the view (编辑 / 总览), this page's layout, the
    // margin-notes rail's slot (D2: the next lane mounts its toggles there) and
    // the save state. The file's name is the title; no mode, no 命令… pop-up.
    const viewBtn = popButton();
    viewBtn.classList.add('csn-view-pop');
    const layoutBtn = popButton();
    const railSlot = h(doc, 'span', { class: 'doc-rail-slot', dataset: { marginRailSlot: 'clioStage' }, hidden: true });
    const statusBar = h(doc, 'div', { class: 'details-bar app-status-bar csn-status' }, [
      h(doc, 'span', { class: 'status-bar-leading csn-context' }, [viewBtn, layoutBtn]),
      h(doc, 'span', { class: 'status-bar-context csn-rail-slot' }, [railSlot]),
      h(doc, 'span', { class: 'status-bar-trailing csn-trailing' }, [receiptEl]),
    ]);
    const railEl = h(doc, 'ol', { class: 'csn-rail', role: 'listbox', 'aria-label': tr('clio_stage_native_rail_label') });
    const pageEl = h(doc, 'div', { class: 'csn-page', role: 'group' });
    const fitEl = h(doc, 'div', { class: 'csn-fit' }, [pageEl]);
    const stageEl = h(doc, 'div', { class: 'csn-stage' }, [fitEl]);
    const notesLabel = h(doc, 'label', { class: 'csn-notes-label' });
    const notesEl = h(doc, 'textarea', { class: 'csn-notes-input', rows: '3', spellcheck: 'true' });
    const notesBox = h(doc, 'div', { class: 'csn-notes' }, [notesLabel, notesEl]);
    const mainEl = h(doc, 'div', { class: 'csn-main' }, [stageEl, notesBox]);
    const bodyEl = h(doc, 'div', { class: 'csn-body' }, [railEl, mainEl]);
    // ⑤: the status bar reports state only; how to turn pages and what can be
    // edited is its Balloon Help.
    const captionEl = h(doc, 'p', { class: 'csn-caption', dataset: { balloonHelp: 'clio_stage_native_balloon_status' } });
    const layer = h(doc, 'div', { class: 'csn-layer', hidden: true });
    const rootEl = h(doc, 'div', { class: 'clio-stage-native' }, [statusBar, bodyEl, captionEl, layer]);
    const notesId = `csn-notes-${Date.now().toString(36)}`;
    notesEl.id = notesId;
    notesLabel.setAttribute('for', notesId);

    /* -- window chrome: hidden by one class on the window, restored on unmount -- */
    const titleEl = windowEl.querySelector('#clio-stage-title');
    const savedTitle = titleEl ? { text: titleEl.textContent, i18n: titleEl.getAttribute('data-i18n') } : null;
    if (titleEl) titleEl.removeAttribute('data-i18n');
    windowEl.classList.add('is-native-mounted');
    pane.append(rootEl);
    // D2: the 旁注栏 on the page's right — this presentation supports 批注, its
    // one tab. It follows the mounted file (bound once the surface is drawn).
    const Rail = root.AISystem6ClioWorksRail;
    const rail = Rail && typeof Rail.create === 'function'
      ? Rail.create({ doc, appId: 'clioStage', slot: railSlot, host: bodyEl, tabs: ['comments'] })
      : null;

    const refreshMenus = () => { if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* menus redraw next time */ } } };

    /* -- pop-up menus (the workbook's pattern: the desk's menu panel under its button) -- */
    function closeMenu() {
      if (!openedMenu) return;
      const { menu, away } = openedMenu;
      openedMenu = null;
      doc.removeEventListener('pointerdown', away, true);
      menu.remove();
    }
    function openMenu(anchor, items, labelKey) {
      closeMenu();
      const menu = h(doc, 'div', { class: 'menu-popover csn-menu', role: 'menu', 'aria-label': tr(labelKey) });
      for (const item of items) {
        const btn = h(doc, 'button', {
          type: 'button',
          role: item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem',
          class: [item.checked ? 'is-checked' : '', item.enabled === false ? 'is-disabled' : ''].filter(Boolean).join(' ') || undefined,
          dataset: { menuCommand: item.id },
        }, [
          h(doc, 'span', { class: 'csn-menu-label' }, [item.label, item.enabled === false && item.reason ? h(doc, 'small', { text: item.reason }) : null]),
          item.shortcut ? h(doc, 'kbd', { text: item.shortcut }) : null,
        ]);
        if (item.checked !== undefined) btn.setAttribute('aria-checked', String(!!item.checked));
        if (item.enabled === false) btn.setAttribute('aria-disabled', 'true');
        btn.addEventListener('click', () => {
          if (item.enabled === false) return;
          closeMenu();
          anchor.focus();
          if (item.run) item.run();
        });
        menu.append(btn);
      }
      menu.addEventListener('keydown', (event) => {
        const buttons = [...menu.querySelectorAll('button')];
        const index = buttons.indexOf(doc.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); anchor.focus(); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        } else if (event.key === 'Tab') closeMenu();
      });
      const away = (event) => { if (!menu.contains(event.target) && event.target !== anchor) closeMenu(); };
      doc.body.append(menu);
      const rect = anchor.getBoundingClientRect();
      const view = doc.defaultView;
      menu.style.setProperty('--csn-menu-x', `${Math.max(8, Math.min(rect.left, view.innerWidth - menu.offsetWidth - 8))}px`);
      menu.style.setProperty('--csn-menu-y', `${Math.max(8, Math.min(rect.bottom + 2, view.innerHeight - menu.offsetHeight - 8))}px`);
      doc.addEventListener('pointerdown', away, true);
      openedMenu = { menu, away };
      (menu.querySelector('button:not(.is-disabled)') || menu.querySelector('button'))?.focus();
    }

    /* -- typed input: leaving commits; Esc cancels -- */
    function closeRunEditor(cancel) {
      if (!runEditor || runEditor.done) return null;
      const editor = runEditor;
      editor.done = true;
      runEditor = null;
      session.composing = false;
      editor.el.removeAttribute('contenteditable');
      const text = editor.el.textContent;
      const out = cancel ? null : session.editRun(editor.slideId, editor.runId, text);
      if (cancel || (out && out.status !== 'ok')) editor.el.textContent = editor.before;
      render();
      return out;
    }
    function commitNotes() {
      if (notesEl.readOnly || notesEl.dataset.slideId !== session.slideId) return true;
      const out = session.editNotes(session.slideId, notesEl.value);
      return !out || out.status === 'ok';
    }
    /** Commit whatever is typed on screen. Returns false when the text was refused. */
    function commitPending() {
      if (runEditor) {
        const out = closeRunEditor(false);
        if (out && out.status !== 'ok') return false;
      }
      return commitNotes();
    }
    function startRunEdit(runEl) {
      const shapeEl = runEl.closest('[data-shape-id]');
      if (!shapeEl || shapeEl.dataset.editable !== 'true' || runEditor) return;
      session.select(shapeEl.dataset.shapeId, runEl.dataset.runId);
      // render() redrew the page; edit the redrawn run.
      const fresh = pageEl.querySelector(`[data-run-id="${cssEscape(runEl.dataset.runId)}"]`) || runEl;
      runEditor = { el: fresh, slideId: session.slideId, runId: fresh.dataset.runId, before: fresh.textContent, done: false };
      fresh.setAttribute('contenteditable', 'plaintext-only');
      if (fresh.contentEditable !== 'plaintext-only') fresh.setAttribute('contenteditable', 'true');
      fresh.focus();
      try {
        const range = doc.createRange();
        range.selectNodeContents(fresh);
        const sel = doc.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (error) { /* the caret stays where focus put it */ }
    }

    /* -- commands -- */
    async function runSave() {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      if (!commitPending()) return { status: 'blocked', code: 'INPUT_REFUSED' };
      const out = await session.save();
      refreshMenus();
      return out;
    }
    function turn(delta) {
      if (session.composing || !commitPending()) return;
      if (session.step(delta)) { refreshWindoid(); railFocus(); }
      refreshMenus();
    }
    async function runRevert() {
      if (!session.commandState('file.revert').enabled) return;
      const answer = typeof root.showSystemModal === 'function'
        ? await root.showSystemModal(tr('clio_stage_native_revert_confirm', opts.fileName || ''), 'confirm', { defaultAction: 'cancel', confirmKey: 'clio_stage_native_revert_button', danger: true })
        : 'cancel';
      if (answer !== 'yes') return;
      closeRunEditor(true);
      const out = await session.revert();
      if (out.status === 'ok') refreshWindoid();
      render();
      refreshMenus();
    }
    function runSlide(id, arg) {
      if (session.composing || !commitPending()) return null;
      const out = session.slideCommand(id, arg);
      refreshWindoid();
      refreshMenus();
      return out;
    }
    function chooseLayout() {
      if (!session.commandState('slide.layout').enabled) { session.slideCommand('slide.layout'); return; }
      const current = session.currentSlide();
      openMenu(layoutBtn, session.layouts().map((layout) => ({
        id: `layout:${layout.id}`, label: layout.name, checked: !!current && current.layoutId === layout.id,
        run: () => { if (!current || current.layoutId !== layout.id) runSlide('slide.layout', layout.id); },
      })), 'clio_stage_native_menu_layouts');
    }
    function runCommand(id) {
      if (id === 'file.save') return runSave();
      if (id === 'file.revert') return runRevert();
      if (id === 'page.prev') return turn(-1);
      if (id === 'page.next') return turn(1);
      if (id === 'present') return runPresent();
      // The overview lives outside the show, as on the deck: the row greys, and
      // a direct run does nothing while the layer is up.
      if (id === 'page.overview') return (show && show.state.active) ? false : (overviewLayer ? closeOverview() : openOverview(-1));
      if (id === 'comments.open') return openComments();
      if (id === 'find.open') return openFind(false);
      if (id === 'find.next') return openFind(true);
      if (id === 'page.check') return openCheck();
      if (id === 'slide.layout') return chooseLayout();
      if (id === 'motion.open') return openMotion();
      if (id === 'notesmaster.open') return openNotesMaster();
      if (id === 'handout.print') return chooseHandout();
      if (id.startsWith('slide.')) return runSlide(id);
      return null;
    }

    /* -- comments (⌘M): read, add, reply — the 旁注栏's 批注 panel (D2); a
       floating windoid only where the rail module is absent -- */
    function openComments() {
      if (!session.commentsAvailable()) return;
      if (rail) { rail.show('comments'); return; }
      showComments();
    }
    function showComments() {
      if (!session.commentsAvailable() || disposed) return;
      if (comments) { comments.refresh(); return; }
      if (windoid && windoid.kind === 'comments') { windoid.refresh(); return; }
      if (windoid && !rail) windoid.handle.close();
      let draft = '';
      let replyingTo = null;
      let note = '';
      const handle = rail
        ? rail.panel('comments', { title: tr('clio_comments_title'), className: 'csn-comments-panel', onClose: () => { if (comments && comments.handle === handle) comments = null; } })
        : createWindoid(doc, rootEl, { title: tr('clio_comments_title'), className: 'csn-comments-windoid', onClose: () => { if (windoid && windoid.handle === handle) windoid = null; } });
      const el = (tag, className, text) => h(doc, tag, { class: className, text });
      async function write(action) {
        let out;
        try { out = await action(); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
        if (blocked(out)) {
          note = out.code === 'LEGACY_NO_REPLY' ? tr('clio_comments_reply_blocked') : tr('clio_comments_failed', String(out.message || out.code || out.reason || ''));
        } else { note = ''; draft = ''; replyingTo = null; }
        if (blocked(out)) session.notify(); else session.afterEdit();
        refreshMenus();
        draw();
      }
      function composer(placeholder, submitLabel, onSubmit, onCancel) {
        const field = h(doc, 'textarea', { class: 'windoid-input', rows: '2', placeholder, 'aria-label': placeholder });
        field.value = draft;
        const send = h(doc, 'button', { type: 'button', class: 'btn default', text: submitLabel });
        send.disabled = !draft.trim();
        field.addEventListener('input', () => { draft = field.value; send.disabled = !draft.trim(); });
        const submit = () => { if (!send.disabled) onSubmit(draft.trim()); };
        field.addEventListener('keydown', (event) => {
          if (event.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); submit(); }
        });
        send.addEventListener('click', submit);
        const row = h(doc, 'div', { class: 'windoid-actions' }, [send]);
        if (onCancel) {
          const cancel = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_comments_cancel') });
          cancel.addEventListener('click', onCancel);
          row.append(cancel);
        }
        return h(doc, 'div', { class: 'windoid-composer' }, [field, row]);
      }
      const stamp = () => new Date().toISOString();
      const author = () => tr('clio_comments_author_default');
      function draw() {
        const adapter = session.adapter;
        const slideId = session.slideId;
        entry.slideId = slideId;   // render() redraws when the page moves on under the list
        const n = session.pageNumber();
        handle.body.textContent = '';
        let list = [];
        try { list = (adapter.comments(slideId) || []).filter((item) => item.slideId == null || String(item.slideId) === slideId); } catch (error) { note = tr('clio_comments_failed', String(error && error.message || error)); }
        handle.setTitle(list.length ? tr('clio_stage_native_comments_title_count', n.at, list.length) : tr('clio_stage_native_comments_title', n.at));
        const sel = session.selection;
        const anchor = sel && sel.shapeId ? session.shapes().find((sh) => sh.id === sel.shapeId) : null;
        if (replyingTo == null) {
          handle.body.append(composer(
            anchor ? tr('clio_stage_native_comment_on_object', anchor.name || tr(READ_ONLY_KINDS[anchor.kind] || 'clio_stage_native_kind_text')) : tr('clio_stage_native_comment_on_page', n.at),
            tr('clio_comments_add'),
            (text) => write(() => adapter.addComment(slideId, { ...(anchor ? { anchorShapeId: anchor.id } : {}), author: author(), text, date: stamp() })),
          ));
        }
        if (note) { const alert = el('p', 'windoid-note', note); alert.setAttribute('role', 'alert'); handle.body.append(alert); }
        if (!list.length) handle.body.append(el('p', 'windoid-empty', tr('clio_stage_native_comments_empty')));
        const ul = h(doc, 'ul', { class: 'windoid-threads' });
        for (const { item, replies } of groupComments(list)) {
          const box = h(doc, 'li', { class: 'windoid-thread', dataset: { commentId: String(item.id) } });
          for (const entry of [item, ...replies]) {
            const head = h(doc, 'div', { class: 'windoid-comment-head' }, [el('span', 'windoid-author', entry.author || tr('clio_comments_author_unknown'))]);
            if (entry === item && entry.anchorShapeId) {
              const target = session.shapes().find((sh) => sh.id === String(entry.anchorShapeId));
              head.append(el('span', 'windoid-anchor', target ? (target.name || tr(READ_ONLY_KINDS[target.kind] || 'clio_stage_native_kind_text')) : tr('clio_stage_native_comment_anchor_gone')));
            }
            if (entry.date) head.append(el('span', 'windoid-date', String(entry.date).slice(0, 10)));
            if (entry === item && entry.done) head.append(el('span', 'windoid-done', tr('clio_comments_done')));
            box.append(h(doc, 'div', { class: 'windoid-comment' + (entry === item ? '' : ' is-reply') }, [head, el('div', 'windoid-text', entry.text || '')]));
          }
          if (replyingTo === item.id) {
            box.append(composer(tr('clio_comments_reply_placeholder'), tr('clio_comments_reply_send'),
              (text) => write(() => adapter.replyComment(item.id, { author: author(), text, date: stamp() })),
              () => { replyingTo = null; draft = ''; draw(); }));
          } else if (fn(adapter, 'replyComment') && item.modern !== false) {
            // A legacy comment cannot carry a thread, so it gets no reply button.
            const reply = h(doc, 'button', { type: 'button', class: 'btn windoid-reply', text: tr('clio_comments_reply') });
            reply.addEventListener('click', () => { replyingTo = item.id; draft = ''; draw(); });
            box.append(reply);
          }
          ul.append(box);
        }
        if (list.length) handle.body.append(ul);
        handle.place();
        if (rail) rail.update();
      }
      const entry = { kind: 'comments', handle, refresh: () => { replyingTo = null; note = ''; draw(); } };
      if (rail) comments = entry; else windoid = entry;
      draw();
      handle.body.querySelector('textarea')?.focus();
    }

    /* -- 检查当前页 (⌘K): the stage audit's own pure check, fed the native page -- */
    const auditApi = () => root.AISystem6ClioStageAudit;
    function measurePage() {
      const size = session.pageSize();
      const boxes = new Map();
      const unchecked = [];
      for (const el of pageEl.querySelectorAll('[data-shape-id]')) {
        const sh = session.shapes().find((item) => item.id === el.dataset.shapeId);
        if (!sh) continue;
        const kind = sh.kind;
        if (!['text', 'shape', 'image'].includes(kind)) unchecked.push(sh);
        const text = el.querySelector('.csn-text');
        const images = [...el.querySelectorAll('img')].map((img) => ({
          naturalAR: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0,
          renderedAR: sh.w && sh.h ? sh.w / sh.h : 0,
        }));
        if (kind === 'image' && !images.some((image) => image.naturalAR)) unchecked.push(sh);
        boxes.set(sh.id, {
          box: { x: sh.x * PX_PER_PT, y: sh.y * PX_PER_PT, w: Math.max(1, sh.w) * PX_PER_PT, h: Math.max(1, sh.h) * PX_PER_PT },
          // Only text frames take part in the overlap rule: a title over a picture is a design, not a fault.
          placed: kind === 'text' && sh.editable,
          textOverflowY: text ? Math.max(0, text.scrollHeight - text.clientHeight) * PX_PER_PT : 0,
          textOverflowX: text ? Math.max(0, text.scrollWidth - text.clientWidth) * PX_PER_PT : 0,
          images,
        });
      }
      return { canvas: { width: size.w * PX_PER_PT, height: size.h * PX_PER_PT }, boxes, unchecked };
    }
    const FINDING_KEYS = Object.freeze({
      off_slide: 'clio_stage_native_finding_off_slide',
      out_of_bounds: 'clio_stage_native_finding_out_of_bounds',
      text_overflow: 'clio_stage_native_finding_text_overflow',
      text_overflow_width: 'clio_stage_native_finding_text_overflow_width',
      picture_distorted: 'clio_stage_native_finding_picture_distorted',
      overlap: 'clio_stage_native_finding_overlap',
    });
    async function openCheck() {
      if (!session.commandState('page.check').enabled) { session.setReceipt('clio_stage_native_receipt_reason', 'blocked', [session.commandState('page.check').reason]); return; }
      if (windoid && windoid.kind !== 'check') windoid.handle.close();
      if (!auditApi() && typeof root.ensureClioStageAuditModule === 'function') {
        try { await root.ensureClioStageAuditModule(); } catch (error) { /* answered below */ }
      }
      if (disposed) return;
      let handle = windoid && windoid.kind === 'check' ? windoid.handle : null;
      if (!handle) {
        handle = createWindoid(doc, rootEl, { title: tr('clio_stage_native_check_title', session.pageNumber().at), className: 'csn-check-windoid', onClose: () => { if (windoid && windoid.handle === handle) windoid = null; } });
        windoid = { kind: 'check', handle, refresh: () => draw() };
      }
      const el = (tag, className, text) => h(doc, tag, { class: className, text });
      function draw() {
        const n = session.pageNumber();
        handle.setTitle(tr('clio_stage_native_check_title', n.at));
        handle.body.textContent = '';
        const api = auditApi();
        if (!api || typeof api.buildAuditInput !== 'function') {
          handle.body.append(el('p', 'windoid-empty', tr('clio_stage_native_check_unavailable')));
          return;
        }
        const measured = measurePage();
        let report;
        try {
          report = api.buildAuditInput({ canvas: measured.canvas, boxes: measured.boxes, pageIndex: n.at - 1, editable: false, stamp: `native:${session.slideId}:${session.revision()}`, fontsReady: !!(doc.fonts && doc.fonts.status === 'loaded') });
        } catch (error) {
          handle.body.append(el('p', 'windoid-note', tr('clio_stage_native_check_failed')));
          return;
        }
        const findings = Array.isArray(report.findings) ? report.findings : [];
        handle.body.append(el('p', 'csn-check-summary', findings.length ? tr('clio_stage_native_check_count', findings.length) : tr('clio_stage_native_check_none')));
        const ul = h(doc, 'ul', { class: 'csn-check-list' });
        for (const finding of findings) {
          const sh = session.shapes().find((item) => item.id === finding.el);
          const name = sh ? (sh.name || tr(READ_ONLY_KINDS[sh.kind] || 'clio_stage_native_kind_text')) : '';
          const locate = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_stage_native_check_locate') });
          locate.addEventListener('click', () => { if (sh) { session.select(sh.id); pageEl.querySelector(`[data-shape-id="${cssEscape(sh.id)}"]`)?.focus(); } });
          ul.append(h(doc, 'li', { class: 'csn-check-item', dataset: { code: finding.code || '' } }, [
            el('b', 'csn-check-object', name),
            el('span', 'csn-check-text', tr(FINDING_KEYS[finding.code] || 'clio_stage_native_finding_other')),
            sh ? locate : null,
          ]));
        }
        if (findings.length) handle.body.append(ul);
        const missed = [];
        if (report.metrics !== 'measured') missed.push(tr('clio_stage_native_check_fonts_pending'));
        for (const sh of measured.unchecked) missed.push(tr('clio_stage_native_check_not_measured', sh.name || tr(READ_ONLY_KINDS[sh.kind] || READ_ONLY_KINDS.other)));
        if (missed.length) {
          handle.body.append(el('p', 'csn-check-head', tr('clio_stage_native_check_missed')));
          handle.body.append(h(doc, 'ul', { class: 'csn-check-missed' }, missed.map((text) => el('li', '', text))));
        }
        handle.body.append(el('p', 'csn-check-head', tr('clio_stage_native_check_yours')), el('p', 'windoid-hint', tr('clio_stage_native_check_yours_text')));
        handle.place();
      }
      draw();
    }
    function refreshWindoid() { if (windoid) windoid.refresh(); if (comments) comments.refresh(); }

    /* -- first-save list and failure alert -- */
    const LOSS_KINDS = Object.freeze({
      diagram: 'clio_stage_native_lost_kind_diagram',
      chart: 'clio_stage_native_lost_kind_chart',
      picture: 'clio_stage_native_lost_kind_picture',
      'comment-thread': 'clio_stage_native_lost_kind_comment_thread',
      animation: 'clio_stage_native_lost_kind_animation',
      transition: 'clio_stage_native_lost_kind_transition',
      media: 'clio_stage_native_lost_kind_media',
      signature: 'clio_stage_native_lost_kind_signature',
    });
    function lossName(item) {
      const kind = String(item.kind || item.what || '');
      if (Object.prototype.hasOwnProperty.call(LOSS_KINDS, kind)) return tr(LOSS_KINDS[kind]);
      return kind && /\s|[^\x00-\x7f]/.test(kind) ? kind : tr('clio_stage_native_lost_kind_other');
    }
    function lossWhere(item) {
      if (item.slideId == null && item.slide == null) return '';
      const index = session.slides().findIndex((slide) => slide.id === String(item.slideId ?? item.slide));
      return index >= 0 ? tr('clio_stage_native_page_n', index + 1) : '';
    }
    function confirmList(report) {
      return new Promise((resolve) => {
        const itemText = (item) => {
          const page = item.kind === 'notes' ? Number(item.page) : NaN;
          if (Number.isInteger(page) && page > 0) return tr('clio_stage_native_lost_notes_page', page);
          return [lossWhere(item), lossName(item)].filter(Boolean).join(' · ');
        };
        const items = (list) => {
          const shown = list.slice(0, 6).map((item) => h(doc, 'li', { text: itemText(item) }));
          if (list.length > 6) shown.push(h(doc, 'li', { text: tr('clio_stage_native_first_save_more', list.length - 6) }));
          return h(doc, 'ul', {}, shown);
        };
        const titleId = `csn-first-save-${Date.now().toString(36)}`;
        const cancel = h(doc, 'button', { type: 'button', class: 'btn default', dataset: { choice: 'cancel' }, text: tr('cancel') });
        const store = h(doc, 'button', { type: 'button', class: 'btn', dataset: { choice: 'save' }, text: tr('clio_stage_native_cmd_save') });
        const dialog = h(doc, 'div', { class: 'csn-alert', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
          h(doc, 'div', { class: 'csn-alert-in' }, [
            h(doc, 'b', { id: titleId, text: tr('clio_stage_native_first_save_title', opts.fileName || '') }),
            report.converted.length ? h(doc, 'p', { text: tr('clio_stage_native_first_save_converted', report.converted.length) }) : null,
            report.converted.length ? items(report.converted) : null,
            report.lost.length ? h(doc, 'p', { text: tr('clio_stage_native_first_save_lost', report.lost.length) }) : null,
            report.lost.length ? items(report.lost) : null,
            h(doc, 'p', { class: 'csn-alert-note', text: tr('clio_stage_native_first_save_note') }),
            h(doc, 'div', { class: 'csn-alert-row' }, [cancel, store]),
          ]),
        ]);
        const previous = doc.activeElement;
        layer.replaceChildren(dialog);
        layer.hidden = false;
        const done = (choice) => {
          dialog.remove();
          layer.hidden = true;
          if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus(); else railFocus();
          resolve(choice);
        };
        dialog.addEventListener('click', (event) => { const button = event.target.closest('button[data-choice]'); if (button) done(button.dataset.choice); });
        dialog.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done('cancel'); return; }
          if (event.key === 'Tab') { event.preventDefault(); (doc.activeElement === cancel ? store : cancel).focus(); }
          if (event.metaKey || event.ctrlKey) { event.preventDefault(); event.stopPropagation(); }
        });
        // Something is converted or lost, so the default is Cancel.
        cancel.focus();
      });
    }
    async function alertFailure() {
      if (typeof root.showSystemModal === 'function') await root.showSystemModal(tr('clio_stage_native_save_failed', opts.fileName || ''), 'alert');
    }

    /* -- render -- */
    function railFocus() { railEl.querySelector('li[aria-selected="true"]')?.focus(); }
    // Slide text wears the document's own font with the codec's stand-ins
    // (must-fix 9); the chrome around it keeps the desk's UI font. `+mj`/`+mn`
    // name the theme's fonts, so they are read the way the codec draws them.
    const DEFAULT_DOC_FONT = 'Arial,"Arimo",sans-serif';
    const fontStackCache = new Map();
    function docFontStack(slideId, name) {
      const L = root.L;
      if (!L || typeof L.fontStack !== 'function') return DEFAULT_DOC_FONT;
      const key = `${slideId}\u0000${name}\u0000${session.revision()}`;
      if (fontStackCache.has(key)) return fontStackCache.get(key);
      let face = String(name || '');
      try {
        if (typeof L.style?.font === 'function' && L.model && typeof L.model.design === 'function' && (face === '' || face.startsWith('+'))) {
          const docModel = fn(session.adapter, 'presentation') ? session.adapter.presentation() : null;
          const at = session.slides().findIndex((slide) => slide.id === slideId);
          const slide = docModel && at >= 0 ? docModel.slides[at] : null;
          if (slide) face = String(L.style.font(face, L.model.design(docModel, slide)) || face);
        }
      } catch (error) { /* the reference stands as the file typed it */ }
      let stack;
      try { stack = L.fontStack(face) || DEFAULT_DOC_FONT; } catch (error) { stack = DEFAULT_DOC_FONT; }
      fontStackCache.set(key, stack);
      return stack;
    }
    function drawShape(sh, slideId = session.slideId, readOnly = false) {
      const editable = !readOnly && sh.editable;
      const el = h(doc, 'div', {
        class: `csn-shape is-${sh.kind}`,
        role: 'group',
        tabindex: '-1',
        dataset: { shapeId: sh.id, kind: sh.kind, editable: String(editable) },
        'aria-label': sh.name || tr(READ_ONLY_KINDS[sh.kind] || 'clio_stage_native_kind_text'),
      });
      for (const [prop, value] of [['--x', sh.x], ['--y', sh.y], ['--w', Math.max(1, sh.w)], ['--h', Math.max(1, sh.h)]]) el.style.setProperty(prop, `${value}px`);
      const sel = readOnly ? null : session.selection;
      if (sel && sel.shapeId === sh.id) el.classList.add('is-selected');
      const hasText = sh.paragraphs.some((para) => para.runs.length);
      if (sh.kind === 'image' && sh.imageUrl) {
        el.append(h(doc, 'img', { src: sh.imageUrl, alt: sh.name || tr('clio_stage_native_kind_picture'), draggable: 'false' }));
      } else if (!(sh.kind === 'text' || (sh.kind === 'shape' && hasText))) {
        // What this surface cannot model is drawn as a named, framed placeholder and never dropped.
        el.classList.add('is-placeholder');
        el.dataset.balloonHelp = 'clio_stage_native_lock_object';
        el.append(h(doc, 'span', { class: 'csn-placeholder-label' }, [h(doc, 'i', { class: 'doc-lock', 'aria-hidden': 'true' }), tr('clio_stage_native_read_only_object', tr(READ_ONLY_KINDS[sh.kind] || READ_ONLY_KINDS.other), sh.name || '')]));
      }
      if (hasText) {
        const textEl = h(doc, 'div', { class: 'csn-text' });
        for (const para of sh.paragraphs) {
          const p = h(doc, 'div', { class: 'csn-para', dataset: { align: para.align || 'l', level: String(para.level || 0), bullet: String(!!para.bullet) } });
          if (!para.runs.length) p.append(h(doc, 'br'));
          for (const run of para.runs) {
            const span = h(doc, 'span', {
              class: ['csn-run', run.b ? 'is-bold' : '', run.i ? 'is-italic' : '', run.u ? 'is-underline' : ''].filter(Boolean).join(' '),
              dataset: { runId: run.id },
              ...(editable ? { tabindex: '0', role: 'textbox', 'aria-label': tr('clio_stage_native_run_label', run.text) } : {}),
              text: run.text,
            });
            // Drawn as the file has it: size in points, which are the page's own units
            // (the fit transform scales them with the shapes); colour as #rrggbb;
            // the face the file names, with the stand-ins the suite draws for it.
            if (Number.isFinite(Number(run.size)) && Number(run.size) > 0) span.style.setProperty('--size', `${Number(run.size)}px`);
            if (typeof run.color === 'string' && /^#[0-9a-f]{6}$/i.test(run.color)) span.style.setProperty('--color', run.color);
            span.style.setProperty('--font', docFontStack(slideId, run.font));
            p.append(span);
          }
          textEl.append(p);
        }
        el.append(textEl);
      }
      if (!editable) el.classList.add('is-read-only');
      return el;
    }
    function drawPage() {
      if (runEditor) return;   // the run being typed into stays on screen as typed
      const size = session.pageSize();
      pageEl.style.setProperty('--page-w', `${size.w}px`);
      pageEl.style.setProperty('--page-h', `${size.h}px`);
      const bg = session.background();
      if (bg) pageEl.style.setProperty('--page-bg', bg); else pageEl.style.removeProperty('--page-bg');
      pageEl.replaceChildren(...session.shapes().map((sh) => drawShape(sh, session.slideId)));
      const n = session.pageNumber();
      pageEl.setAttribute('aria-label', tr('clio_stage_native_page_label', n.at, n.of));
      fit();
    }
    function fit() {
      const size = session.pageSize();
      const width = stageEl.clientWidth || 0;
      const height = stageEl.clientHeight || 0;
      const scale = width && height ? Math.max(0.05, Math.min((width - 16) / size.w, (height - 16) / size.h)) : 1;
      fitEl.style.setProperty('--csn-scale', String(scale));
      fitEl.style.setProperty('--fit-w', `${size.w * scale}px`);
      fitEl.style.setProperty('--fit-h', `${size.h * scale}px`);
    }

    /* -- 放映, 演讲者视图 and 页面总览 (must-fix 2): the layer is N6's shared
       machinery (features/clio-stage-show.js); this surface only feeds it the
       adapter's own reading of a page, drawn read-only the way the editor draws
       it, at the file's own pt geometry, scaled to the screen. -- */
    function mountShowPage(host, at) {
      const slide = session.slides()[at];
      if (!slide) return null;
      const page = h(doc, 'div', {
        class: 'csn-page is-readonly',
        role: 'group',
        'aria-label': tr('clio_stage_native_page_label', at + 1, session.slides().length),
      });
      const bg = session.background(slide.id);
      if (bg) page.style.setProperty('--page-bg', bg);
      page.replaceChildren(...session.shapes(slide.id).map((sh) => drawShape(sh, slide.id, true)));
      const fitBox = h(doc, 'div', { class: 'csn-fit' }, [page]);
      host.append(fitBox);
      return page;
    }
    function scaleShowPage(host) {
      const room = host?.parentElement;
      const fitBox = host?.querySelector('.csn-fit');
      const page = host?.querySelector('.csn-page');
      if (!room || !fitBox || !page) return;
      const size = session.pageSize();
      const width = room.clientWidth || 0;
      const height = room.clientHeight || 0;
      const scale = width && height ? Math.max(0.05, Math.min(width / size.w, height / size.h)) : 1;
      fitBox.style.setProperty('--csn-scale', String(scale));
      fitBox.style.setProperty('--fit-w', `${size.w * scale}px`);
      fitBox.style.setProperty('--fit-h', `${size.h * scale}px`);
      page.style.setProperty('--page-w', `${size.w}px`);
      page.style.setProperty('--page-h', `${size.h}px`);
    }
    const show = root.AISystem6ClioStageShow?.create({
      count: () => session.slides().length,
      title: () => opts.fileName || tr('clio_stage_title'),
      currentAt: () => session.slides().findIndex((slide) => slide.id === session.slideId),
      mount: (host, at) => mountShowPage(host, at),
      scale: (host) => scaleShowPage(host),
      notes: (at, el) => {
        const slide = session.slides()[at];
        el.textContent = slide ? session.notes(slide.id) : '';
      },
      thumbTitle: (at) => {
        const slide = session.slides()[at];
        return slide ? (session.slideTitle(slide.id) || '') : '';
      },
      openOverview: (at) => { openOverview(at); },
      begin: () => { commitPending(); },
      finish: (fromIndex) => {
        const slide = session.slides()[fromIndex];
        if (slide) session.setSlide(slide.id);
      },
      status: (key) => session.setReceipt(key, 'info'),
      holdWake: () => (fn(root.AISystem6WebPlatform, 'holdScreenWakeLock') ? root.AISystem6WebPlatform.holdScreenWakeLock('clioStage') : undefined),
      releaseWake: () => (fn(root.AISystem6WebPlatform, 'releaseScreenWakeLock') ? root.AISystem6WebPlatform.releaseScreenWakeLock('clioStage') : undefined),
      menuDirty: refreshMenus,
      layerClass: 'clio-stage-native-show',
    }) || null;

    /* -- the page overview: the deck as a light table over the editor -- */
    let overviewLayer = null;
    let overviewGrid = null;
    function closeOverview() {
      overviewGrid?.stop?.();
      overviewGrid = null;
      overviewLayer?.remove();
      overviewLayer = null;
      setPopLabel(viewBtn, tr('clio_stage_native_view_edit'));
      refreshMenus();
      railFocus();
    }
    function openOverview(at = -1) {
      if (!root.AISystem6ClioStageShow || overviewLayer) return;
      const slide = at >= 0 ? session.slides()[at] : null;
      if (slide) session.setSlide(slide.id);
      overviewLayer = h(doc, 'div', { class: 'csn-overview', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('clio_stage_overview') });
      setPopLabel(viewBtn, tr('clio_stage_overview'));
      const head = h(doc, 'div', { class: 'csn-overview-head' }, [
        h(doc, 'b', { class: 'csn-overview-title', text: tr('clio_stage_overview') }),
        h(doc, 'button', { type: 'button', class: 'btn csn-overview-close', text: tr('close'), 'aria-label': tr('close') }),
      ]);
      const body = h(doc, 'div', { class: 'csn-overview-body' });
      overviewLayer.append(head, body);
      // The layer is in the window before the grid builds: the thumbs only mount
      // into connected hosts.
      rootEl.append(overviewLayer);
      overviewGrid = root.AISystem6ClioStageShow.overview(body, {
        count: () => session.slides().length,
        title: (index) => {
          const slide = session.slides()[index];
          return slide ? (session.slideTitle(slide.id) || '') : '';
        },
        currentAt: () => session.slides().findIndex((item) => item.id === session.slideId),
        aspect: () => {
          const size = session.pageSize();
          return size.w > 0 && size.h > 0 ? `${size.w} / ${size.h}` : '16 / 9';
        },
        editable: () => !!session.commandState('slide.move')?.enabled,
        open: (index) => {
          closeOverview();
          const slide = session.slides()[index];
          if (slide) { session.setSlide(slide.id); render(); refreshMenus(); }
        },
        presentFrom: (index) => runPresent(index),
        move: (from, to) => {
          const out = session.moveSlide(from, to);
          if (out.status === 'ok') { render(); refreshWindoid(); refreshMenus(); }
          return out;
        },
        mount: (host, index) => mountShowPage(host, index),
        scale: (host) => scaleShowPage(host),
      });
      head.querySelector('.csn-overview-close')?.addEventListener('click', () => closeOverview());
      overviewLayer.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); closeOverview(); }
      });
      refreshMenus();
      head.querySelector('.csn-overview-close')?.focus();
    }
    async function runPresent(at) {
      if (session.composing || !commitPending()) return false;
      if (!show || show.state.active) return false;
      closeOverview();
      const started = await (at === undefined ? show.start({}) : show.start({ index: at }));
      refreshMenus();
      return started === true;
    }
    function drawRail() {
      const current = session.slideId;
      railEl.replaceChildren(...session.slides().map((slide, i) => {
        const title = session.slideTitle(slide.id) || tr('clio_stage_native_untitled');
        const li = h(doc, 'li', {
          role: 'option', tabindex: slide.id === current ? '0' : '-1', 'aria-selected': String(slide.id === current),
          class: [slide.id === current ? 'is-current' : '', slide.hidden ? 'is-hidden-slide' : ''].filter(Boolean).join(' ') || undefined,
          dataset: { slideId: slide.id },
        }, [h(doc, 'span', { class: 'csn-rail-number', text: String(i + 1) }), h(doc, 'span', { class: 'csn-rail-title', text: title }),
          slide.hidden ? h(doc, 'small', { text: tr('clio_stage_native_hidden_slide') }) : null]);
        return li;
      }));
    }
    function drawNotes() {
      const editable = session.notesEditable();
      notesLabel.textContent = tr('clio_stage_native_notes_label');
      notesEl.readOnly = !editable;
      notesEl.setAttribute('aria-readonly', String(!editable));
      if (doc.activeElement !== notesEl || notesEl.dataset.slideId !== session.slideId) {
        notesEl.value = session.notes();
        notesEl.dataset.slideId = session.slideId;
      }
    }
    function render() {
      if (disposed) return;
      if (rail) rail.update();   // D2: the toggle's 「批注 N」 follows the page on screen
      // The list and its composer follow the page however it changed (overview, show, find).
      for (const open of [comments, windoid]) if (open && open.kind === 'comments' && open.slideId !== session.slideId) open.refresh();
      rootEl.dataset.receiptKind = session.receipt.kind;
      rootEl.dataset.dirty = String(session.isDirty());
      receiptEl.textContent = session.receiptText() || tr('clio_stage_native_receipt_clean', session.slides().length);
      setPopLabel(viewBtn, tr(overviewLayer ? 'clio_stage_overview' : 'clio_stage_native_view_edit'));
      const listed = session.commands();
      const current = session.currentSlide();
      const layout = current && session.layouts().find((item) => item.id === current.layoutId);
      layoutBtn.hidden = !listed.some((command) => command.id === 'slide.layout');
      setPopLabel(layoutBtn, tr('clio_stage_native_layout_popup', layout ? layout.name : tr('clio_stage_native_layout_unknown')));
      // S1: the title names the presentation only.
      if (titleEl) titleEl.textContent = opts.fileName || tr('clio_stage_title');
      drawRail();
      drawPage();
      drawNotes();
      // The overview's grid tracks the deck: a reorder (its own undo step) or an
      // undo/redo re-reads it from the adapter; the current mark follows along.
      if (overviewGrid) overviewGrid.refresh();
      const n = session.pageNumber();
      captionEl.textContent = [
        tr('clio_stage_native_status_page', n.at, n.of),
        session.notesEditable() ? '' : tr('clio_stage_native_caption_notes_read_only'),
      ].filter(Boolean).join(' · ');
    }

    /* -- 动画与切换, 备注母版 (windoids) and 打印讲义 -- */
    const TRIGGERS = ['click', 'with', 'after'];
    const MOTION_CLASSES = ['entr', 'exit', 'emph'];
    let addClass = 'entr';
    let addEffect = 'fade';
    function popChoice(label, items, onPick, labelKey) {
      const button = popButton();
      setPopLabel(button, label);
      button.addEventListener('click', () => openMenu(button, items.map((item) => ({ id: String(item.id), label: item.label, checked: item.checked, run: () => onPick(item.id) })), labelKey));
      return button;
    }
    function motionAct(redraw, call) {
      if (session.confirming || session.closed) return;
      let out;
      try { out = call(session.adapter); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
      if (blocked(out)) session.setReceipt('clio_stage_native_receipt_refused', 'blocked', [String(out.message || out.code || '')]); else session.afterEdit();
      refreshMenus();
      redraw();
    }
    function seconds(ms, onChange, label) {
      const input = h(doc, 'input', { type: 'number', min: '0', step: '0.1', class: 'windoid-input csn-motion-num', 'aria-label': label });
      input.value = String(Math.round(ms) / 1000);
      input.addEventListener('change', () => onChange(input.value === '' ? null : Math.round(Number(input.value) * 1000)));
      return input;
    }
    function openMotion() {
      if (!session.commandState('motion.open').enabled || !fn(session.adapter, 'animations')) return;
      if (windoid && windoid.kind !== 'motion') windoid.handle.close();
      let handle = windoid && windoid.kind === 'motion' ? windoid.handle : null;
      if (!handle) {
        handle = createWindoid(doc, rootEl, { title: tr('clio_stage_motion_title'), className: 'csn-motion-windoid', onClose: () => { if (windoid && windoid.handle === handle) windoid = null; } });
        windoid = { kind: 'motion', handle, refresh: () => draw() };
      }
      const el = (tag, className, text) => h(doc, tag, { class: className, text });
      const act = (call) => motionAct(draw, call);
      function draw() {
        const adapter = session.adapter;
        const slideId = session.slideId;
        const n = session.pageNumber();
        handle.setTitle(tr('clio_stage_motion_title_page', n.at));
        handle.body.textContent = '';
        const list = adapter.animations(slideId);
        handle.body.append(el('p', 'csn-check-head', tr('clio_stage_motion_animations')));
        if (!list.length) handle.body.append(el('p', 'windoid-empty', tr('clio_stage_motion_none')));
        const ol = h(doc, 'ol', { class: 'csn-motion-list' });
        list.forEach((a, i) => {
          const effects = adapter.animationEffects(a.cls);
          const row = h(doc, 'li', { class: 'csn-motion-row', dataset: { animId: a.id } }, [
            el('b', 'csn-motion-name', `${i + 1}. ${a.shapeName || tr('clio_stage_native_kind_text')}`),
            el('span', 'csn-motion-kind', tr('clio_stage_motion_class_' + a.cls)),
            popChoice(a.name, effects.map((e) => ({ id: e.eff, label: e.name, checked: e.eff === a.eff })), (eff) => act((ad) => ad.setAnimation(slideId, a.id, { eff })), 'clio_stage_motion_effect'),
            popChoice(tr('clio_stage_motion_trigger_' + a.trigger), TRIGGERS.map((t) => ({ id: t, label: tr('clio_stage_motion_trigger_' + t), checked: t === a.trigger })), (trigger) => act((ad) => ad.setAnimation(slideId, a.id, { trigger })), 'clio_stage_motion_trigger'),
            h(doc, 'label', { class: 'csn-motion-field' }, [tr('clio_stage_motion_delay'), seconds(a.delay, (ms) => act((ad) => ad.setAnimation(slideId, a.id, { delay: ms })), tr('clio_stage_motion_delay'))]),
            h(doc, 'label', { class: 'csn-motion-field' }, [tr('clio_stage_motion_duration'), seconds(a.dur, (ms) => act((ad) => ad.setAnimation(slideId, a.id, { dur: ms })), tr('clio_stage_motion_duration'))]),
          ]);
          const tools = h(doc, 'span', { class: 'csn-motion-tools' });
          const tool = (text, label, disabled, call) => {
            const b = h(doc, 'button', { type: 'button', class: 'btn', text, 'aria-label': label });
            b.disabled = disabled;
            b.addEventListener('click', () => act(call));
            tools.append(b);
          };
          tool('↑', tr('clio_stage_motion_up'), i === 0, (ad) => ad.moveAnimation(slideId, a.id, -1));
          tool('↓', tr('clio_stage_motion_down'), i === list.length - 1, (ad) => ad.moveAnimation(slideId, a.id, 1));
          tool('✕', tr('clio_stage_motion_remove'), false, (ad) => ad.removeAnimation(slideId, a.id));
          row.append(tools);
          ol.append(row);
        });
        handle.body.append(ol);
        // Add: the class and effect, then the selected object.
        const sel = session.selection;
        const target = sel && sel.shapeId ? session.shapes().find((sh) => sh.id === sel.shapeId) : null;
        const effects = adapter.animationEffects(addClass);
        if (!effects.some((e) => e.eff === addEffect)) addEffect = effects[0].eff;
        const addBtn = h(doc, 'button', { type: 'button', class: 'btn default', text: tr('clio_stage_motion_add') });
        addBtn.disabled = !target;
        addBtn.addEventListener('click', () => act((ad) => ad.addAnimation(slideId, target.id, addClass, addEffect)));
        handle.body.append(h(doc, 'div', { class: 'csn-motion-add' }, [
          popChoice(tr('clio_stage_motion_class_' + addClass), MOTION_CLASSES.map((c) => ({ id: c, label: tr('clio_stage_motion_class_' + c), checked: c === addClass })), (c) => { addClass = c; draw(); }, 'clio_stage_motion_class'),
          popChoice(effects.find((e) => e.eff === addEffect).name, effects.map((e) => ({ id: e.eff, label: e.name, checked: e.eff === addEffect })), (e) => { addEffect = e; draw(); }, 'clio_stage_motion_effect'),
          addBtn,
        ]));
        handle.body.append(el('p', 'windoid-hint', target ? tr('clio_stage_motion_add_to', target.name || tr(READ_ONLY_KINDS[target.kind] || 'clio_stage_native_kind_text')) : tr('clio_stage_motion_add_select')));
        // Transition of this page.
        if (fn(adapter, 'transition')) {
          const t = adapter.transition(slideId);
          const presets = adapter.transitions();
          const click = h(doc, 'input', { type: 'checkbox' });
          click.checked = t.click;
          click.addEventListener('change', () => act((ad) => ad.setTransition(slideId, { click: click.checked })));
          handle.body.append(
            el('p', 'csn-check-head', tr('clio_stage_motion_transition')),
            h(doc, 'div', { class: 'csn-motion-row csn-motion-transition' }, [
              popChoice(t.name, presets.map((p) => ({ id: p.index, label: p.name, checked: p.index === t.preset })), (preset) => act((ad) => ad.setTransition(slideId, { preset })), 'clio_stage_motion_transition'),
              h(doc, 'label', { class: 'csn-motion-field' }, [tr('clio_stage_motion_duration'), seconds(t.dur, (ms) => act((ad) => ad.setTransition(slideId, { dur: ms })), tr('clio_stage_motion_duration'))]),
              h(doc, 'label', { class: 'csn-motion-field' }, [click, tr('clio_stage_motion_on_click')]),
              h(doc, 'label', { class: 'csn-motion-field' }, [tr('clio_stage_motion_after'), seconds(t.after || 0, (ms) => act((ad) => ad.setTransition(slideId, { after: ms || null })), tr('clio_stage_motion_after'))]),
            ]),
          );
        }
        handle.place();
      }
      draw();
    }
    function openNotesMaster() {
      if (!session.commandState('notesmaster.open').enabled || !fn(session.adapter, 'notesMaster')) return;
      if (windoid && windoid.kind !== 'notesmaster') windoid.handle.close();
      let handle = windoid && windoid.kind === 'notesmaster' ? windoid.handle : null;
      if (!handle) {
        handle = createWindoid(doc, rootEl, { title: tr('clio_stage_native_cmd_notes_master'), className: 'csn-motion-windoid', onClose: () => { if (windoid && windoid.handle === handle) windoid = null; } });
        windoid = { kind: 'notesmaster', handle, refresh: () => draw() };
      }
      function draw() {
        handle.body.textContent = '';
        const fields = session.adapter.notesMaster();
        if (!fields.length) handle.body.append(h(doc, 'p', { class: 'windoid-empty', text: tr('clio_stage_notes_master_none') }));
        for (const field of fields) {
          const input = h(doc, 'input', { type: 'text', class: 'windoid-input', 'aria-label': tr('clio_stage_notes_master_' + field.kind) });
          input.value = field.text;
          input.addEventListener('change', () => motionAct(draw, (ad) => ad.setNotesMaster(field.kind, input.value)));
          handle.body.append(h(doc, 'label', { class: 'csn-motion-field csn-notes-master-field' }, [tr('clio_stage_notes_master_' + field.kind), input]));
        }
        handle.body.append(h(doc, 'p', { class: 'windoid-hint', text: tr('clio_stage_notes_master_hint') }));
        handle.place();
      }
      draw();
    }
    // 打印讲义: the page's own drawing at thumbnail size, laid on sheets in a layer the print
    // stylesheet shows alone; the browser's dialog does the rest (the same road as ClioWrite's 打印).
    const HANDOUT_CHOICES = [{ perPage: 1 }, { perPage: 2 }, { perPage: 3 }, { perPage: 4 }, { perPage: 6 }, { perPage: 9 }, { notes: true }];
    const HANDOUT_THUMB_PX = { 1: 560, 2: 420, 3: 300, 4: 300, 6: 260, 9: 190, notes: 480 };
    let printCleanup = null;
    function endHandout() {
      if (printCleanup) { root.removeEventListener('afterprint', printCleanup); printCleanup = null; }
      doc.body.classList.remove('is-csn-printing');
      doc.querySelectorAll('body > .csn-handout').forEach((node) => node.remove());
    }
    function printHandout(layout) {
      if (typeof root.print !== 'function') { session.setReceipt('clio_stage_handout_no_print', 'blocked'); return; }
      endHandout();
      const slides = session.slides();
      const pages = handoutPages(slides.length, layout);
      const size = session.pageSize();
      const key = layout.notes ? 'notes' : layout.perPage;
      const width = HANDOUT_THUMB_PX[key];
      const scale = width / size.w;
      const master = fn(session.adapter, 'notesMaster') ? Object.fromEntries(session.adapter.notesMaster().map((f) => [f.kind, f.text])) : {};
      const sheet = h(doc, 'div', { class: 'clio-stage-native-show csn-handout', dataset: { layout: String(key), sheets: String(pages.length) } });
      pages.forEach((group, sheetAt) => {
        const grid = h(doc, 'div', { class: 'csn-handout-grid' });
        for (const at of group) {
          const thumb = h(doc, 'div', { class: 'csn-handout-thumb' });
          const page = mountShowPage(thumb, at);
          const fitBox = thumb.querySelector('.csn-fit');
          if (page && fitBox) {
            fitBox.style.setProperty('--csn-scale', String(scale));
            fitBox.style.setProperty('--fit-w', `${width}px`);
            fitBox.style.setProperty('--fit-h', `${size.h * scale}px`);
            page.style.setProperty('--page-w', `${size.w}px`);
            page.style.setProperty('--page-h', `${size.h}px`);
          }
          const cell = h(doc, 'figure', { class: 'csn-handout-cell' }, [h(doc, 'figcaption', { class: 'csn-handout-no', text: String(at + 1) }), thumb]);
          if (layout.notes) cell.append(h(doc, 'p', { class: 'csn-handout-notes', text: session.notes(slides[at].id) }));
          else if (layout.perPage === 3) cell.append(h(doc, 'div', { class: 'csn-handout-lines' }));
          grid.append(cell);
        }
        sheet.append(h(doc, 'section', { class: 'csn-handout-sheet' }, [
          h(doc, 'header', { class: 'csn-handout-head', text: master.hdr || '' }),
          grid,
          h(doc, 'footer', { class: 'csn-handout-foot' }, [h(doc, 'span', { text: master.ftr || '' }), h(doc, 'span', { text: `${sheetAt + 1} / ${pages.length}` })]),
        ]));
      });
      doc.body.append(sheet);
      doc.body.classList.add('is-csn-printing');
      printCleanup = endHandout;
      root.addEventListener('afterprint', printCleanup);
      try { root.print(); } catch (error) { endHandout(); }
    }
    function chooseHandout() {
      if (!session.commandState('handout.print').enabled) return;
      openMenu(viewBtn, HANDOUT_CHOICES.map((choice) => ({
        id: 'handout:' + (choice.notes ? 'notes' : choice.perPage),
        label: choice.notes ? tr('clio_stage_handout_notes') : tr('clio_stage_handout_per_page', choice.perPage),
        run: () => printHandout(choice),
      })), 'clio_stage_native_cmd_handout');
    }

    /* -- wiring -- */
    // The view pop-up is 查看's two rows: the page being edited, or the overview.
    on(viewBtn, 'click', () => openMenu(viewBtn, [
      { id: 'view.edit', label: tr('clio_stage_native_view_edit'), checked: !overviewLayer, run: () => { if (overviewLayer) closeOverview(); } },
      { id: 'page.overview', label: tr('clio_stage_overview'), checked: !!overviewLayer, run: () => { if (!overviewLayer) runCommand('page.overview'); } },
    ], 'menu_view'));
    on(layoutBtn, 'click', chooseLayout);
    on(railEl, 'click', (event) => {
      const li = event.target.closest('li[data-slide-id]');
      if (!li || !commitPending()) return;
      if (session.setSlide(li.dataset.slideId)) { refreshWindoid(); railFocus(); refreshMenus(); }
    });
    on(railEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey || event.altKey) return;
      const delta = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      turn(delta);
    });
    on(pageEl, 'click', (event) => {
      const runEl = event.target.closest('.csn-run[tabindex]');
      if (runEl) { if (!runEditor || runEditor.el !== runEl) startRunEdit(runEl); return; }
      const shapeEl = event.target.closest('[data-shape-id]');
      if (runEditor) closeRunEditor(false);
      session.select(shapeEl ? shapeEl.dataset.shapeId : null);
    });
    on(pageEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target;
      if (runEditor && runEditor.el === target) {
        if (event.key === 'Enter') { event.preventDefault(); const out = closeRunEditor(false); if (!out || out.status === 'ok') pageEl.querySelector(`[data-run-id="${cssEscape(target.dataset.runId)}"]`)?.focus(); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRunEditor(true); pageEl.querySelector(`[data-run-id="${cssEscape(target.dataset.runId)}"]`)?.focus(); }
        return;
      }
      if ((event.key === 'Enter' || event.key === 'F2') && target.classList && target.classList.contains('csn-run')) { event.preventDefault(); startRunEdit(target); }
    });
    let editorComposing = false;
    on(pageEl, 'compositionstart', () => { editorComposing = true; session.composing = true; });
    on(pageEl, 'compositionend', () => { editorComposing = false; session.composing = false; });
    on(pageEl, 'focusout', (event) => {
      if (runEditor && runEditor.el === event.target && !editorComposing) closeRunEditor(false);
    });
    let notesComposing = false;
    on(notesEl, 'compositionstart', () => { notesComposing = true; session.composing = true; });
    on(notesEl, 'compositionend', () => { notesComposing = false; session.composing = false; });
    on(notesEl, 'blur', () => { if (!notesComposing && !disposed) commitNotes(); });
    on(notesEl, 'keydown', (event) => {
      if (event.isComposing || notesComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); notesEl.value = session.notes(); railFocus(); }
    });
    // ⌘E, ⌘S, ⌘M, ⌘K, ⌘[ and ⌘] live on the surface; none is taken while an input method is composing.
    on(rootEl, 'keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || session.composing) return;
      if (!commandKey(event) || event.altKey || event.shiftKey) return;
      const id = keyCommand(session, event);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      runCommand(id);
    });
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => { fit(); if (windoid) windoid.handle.place(); });
      resizeObserver.observe(stageEl);
    }

    let offSession = () => {};
    function teardown() {
      if (disposed) return;
      closeRunEditor(true);
      disposed = true;
      // The show and the overview are this surface's layers; both come down
      // before the editor's chrome comes back.
      show?.end?.();
      closeOverview();
      closeMenu();
      if (windoid) { try { windoid.handle.close(); } catch (error) { /* already gone */ } windoid = null; }
      if (rail) rail.destroy();
      comments = null;
      if (resizeObserver) resizeObserver.disconnect();
      offSession();
      cleanups.splice(0).forEach((off) => { try { off(); } catch (error) { /* gone */ } });
      rootEl.remove();
      windowEl.classList.remove('is-native-mounted');
      windowEl.dataset.cwf = 'n'; // back to the route view: 交给 Clio… greys
      if (titleEl && savedTitle) {
        if (savedTitle.i18n) {
          titleEl.setAttribute('data-i18n', savedTitle.i18n);
          titleEl.textContent = tr(savedTitle.i18n);
        } else titleEl.textContent = savedTitle.text;
      }
    }
    try {
      offSession = session.subscribe(render);
      render();
      if (rail) {
        rail.bind({
          show: (id) => { if (id === 'comments') showComments(); },
          // The pending count is this page's open threads — the list the panel shows.
          count: () => {
            if (!session.commentsAvailable()) return 0;
            try { return (session.adapter.comments(session.slideId) || []).filter((item) => item.parentId == null && !item.done && (item.slideId == null || String(item.slideId) === session.slideId)).length; } catch (error) { return 0; }
          },
          name: () => opts.fileName || '',
        });
      }
    } catch (error) {
      teardown();
      throw error;
    }

    return {
      root: rootEl,
      render,
      runSave,
      runCommand,
      commitPending,
      confirmList,
      alertFailure,
      focus: railFocus,
      // The shared show layer this surface mounted (features/clio-stage-show.js).
      show,
      // The find windoid's select-a-match: bring the slide forward and put the
      // page's selection on the text box, or the caret range on the notes.
      revealFindMatch(locator) {
        if (!locator) return false;
        closeRunEditor(false);
        if (!session.setSlide(String(locator.slide))) return false;
        if (locator.notes) {
          session.select(null);
          if (notesEl.readOnly) return true;   // read-only notes come forward but take no caret
          notesEl.focus();
          try { notesEl.setSelectionRange(locator.from, locator.to); } catch (error) { /* the caret stays where focus put it */ }
          return true;
        }
        if (locator.shape == null) return false;
        session.select(String(locator.shape));
        return true;
      },
      afterHistory: () => { render(); refreshWindoid(); refreshMenus(); },
      unmount: teardown,
    };
  }

  function keyCommand(session, event) {
    const key = String(event.key || '').toLowerCase();
    // ⇧⌘S is Save As… (N0), which the desk's shortcut table takes.
    if (key === 's') return event.shiftKey ? '' : 'file.save';
    if (key === 'm' && session.commentsAvailable()) return 'comments.open';
    if (key === 'k') return 'page.check';
    // N3: the shared 查找 / 替换 windoid (features/clioworks-find.js).
    if (key === 'f' && !event.shiftKey) return 'find.open';
    if (key === 'g' && !event.shiftKey) return 'find.next';
    if (key === '[' || event.code === 'BracketLeft') return 'page.prev';
    if (key === ']' || event.code === 'BracketRight') return 'page.next';
    return '';
  }

  /* -------------------------------------------------------------- the API */

  let active = null;   // { record, mountedName, fileName, session, surface }
  let opening = null;

  const nativeHost = () => root.AISystem6ClioWorks;
  function hostCalls() {
    return {
      save: fn(nativeHost(), 'saveNativeDocument') ? (name) => nativeHost().saveNativeDocument(name) : (async () => ({ ok: false, reason: 'unavailable' })),
      revert: fn(nativeHost(), 'revertNativeDocument') ? (name) => nativeHost().revertNativeDocument(name) : undefined,
    };
  }

  async function openPresentation(record, meta = {}) {
    if (opening) await opening.catch(() => null);
    const run = openNow(record, meta);
    opening = run;
    try { return await run; } finally { if (opening === run) opening = null; }
  }

  async function openNow(record, meta) {
    const adapter = record && record.liveAdapter;
    const readable = adapter && ((fn(adapter, 'slides') && fn(adapter, 'shapes')) || fn(adapter, 'presentation'));
    if (!readable) return { ok: false, reason: 'no-adapter' };
    const mountedName = meta.mountedName || record.mountedName || '';
    const fileName = meta.fileName || record.fileName || mountedName;
    // One session per file: a second open brings the first forward.
    if (active && active.mountedName === mountedName) {
      if (typeof root.openWindow === 'function') await root.openWindow('clioStage');
      active.surface.focus();
      return { ok: true, reason: 'focused' };
    }
    if (active) {
      const answer = await closePresentation();
      if (answer === 'cancelled') return { ok: false, reason: 'cancelled' };
    }
    if (typeof root.openWindow === 'function') await root.openWindow('clioStage');
    const windowEl = root.document.querySelector('[data-window="clioStage"]');
    if (!windowEl) return { ok: false, reason: 'no-window' };

    const entry = { record, mountedName, fileName, session: null, surface: null };
    const session = createSession(adapter, {
      fileName,
      mountedName,
      host: hostCalls(),
      readAdapter: () => record.liveAdapter,
      confirmList: (report) => entry.surface.confirmList(report),
      alertFailure: (result) => entry.surface.alertFailure(result),
      onHistory: () => entry.surface && entry.surface.afterHistory(),
      checkAvailable: () => !!root.AISystem6ClioStageAudit || typeof root.ensureClioStageAuditModule === 'function',
      // The mounted surface owns the show layer (features/clio-stage-show.js);
      // the session's own rows grey while it is up.
      showActive: () => !!entry.surface?.show?.state.active,
    });
    entry.session = session;
    try {
      entry.surface = mountSurface(windowEl, session, { fileName });
    } catch (error) {
      session.close();
      windowEl.classList.remove('is-native-mounted');
      console.warn('ClioStage native: mount', error);
      return { ok: false, reason: 'mount-failed' };
    }
    active = entry;
    // 交给 Clio… greys while the deck is not a project document yet; the menu
    // reads the window's cwf marker (window-manager.js hand-to-clio).
    if (record?.source?.kind === 'project') delete windowEl.dataset.cwf; else windowEl.dataset.cwf = 'n';
    swapMenus(true);
    entry.surface.focus();
    if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* next redraw */ } }
    return { ok: true };
  }

  function unmountActive() {
    const entry = active;
    if (!entry) return;
    active = null;
    entry.surface.unmount();
    entry.session.close();
    if (typeof root.AISystem6ClioWorksFind?.close === 'function') root.AISystem6ClioWorksFind.close();
    swapMenus(false);
    if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* next redraw */ } }
  }

  /** Three choices, default Cancel, Esc = Cancel. Never closes silently over unsaved work. */
  async function closePresentation() {
    const entry = active;
    if (!entry) return 'clean';
    if (!entry.surface.commitPending()) return 'cancelled';
    if (!entry.session.isDirty()) { unmountActive(); return 'clean'; }
    const answer = typeof root.showSystemModal === 'function'
      ? await root.showSystemModal(tr('clio_stage_native_unsaved_close', entry.fileName), 'confirm', { defaultAction: 'cancel', confirmKey: 'clio_stage_native_cmd_save', altKey: 'clio_stage_native_dont_save' })
      : 'cancel';
    if (active !== entry) return 'cancelled';
    if (answer === 'yes') {
      const out = await entry.surface.runSave();
      if (out.status !== 'ok' || entry.session.isDirty()) return 'cancelled';
      unmountActive();
      return 'saved';
    }
    if (answer === 'no') {
      // The edits live only in the in-memory model; dropping it is the discard.
      if (entry.record && entry.record.liveAdapter === entry.session.adapter) entry.record.liveAdapter = null;
      unmountActive();
      return 'discarded';
    }
    return 'cancelled';
  }

  /* ------------------------------------------------- the shared find windoid (N3) */

  /**
   * The surface the shared find windoid acts through (features/clioworks-find.js):
   * the live Lectern adapter session, the editor's own selection as the chosen
   * text box, and the select-a-match that brings a slide's shape or notes
   * forward. Null when no presentation is mounted — the Edit › 查找 rows answer
   * through listed().
   */
  function findContext() {
    if (!active) return null;
    const entry = active;
    const surface = entry.surface;
    const session = entry.session;
    return {
      appId: 'clioStage',
      kind: 'pptx',
      name: entry.fileName,
      adapter: session.adapter,
      doc: surface.root.ownerDocument,
      pane: surface.root,
      commitPending: () => surface.commitPending(),
      // 选中文字's box: the selected text box, or nothing (the page, its notes
      // and every other text box are searched).
      selection: () => {
        const sel = session.selection;
        return sel && sel.shapeId ? { shapeId: sel.shapeId } : null;
      },
      select: (match) => surface.revealFindMatch(match && match.locator),
      // The engine's run/notes edits go through the adapter's own steps; this
      // is the repaint half, as for a hand edit.
      afterEdit: () => { session.afterEdit(); surface.afterHistory(); },
    };
  }
  function openFind(next) {
    const ctx = findContext();
    if (!ctx) return;
    const api = root.AISystem6ClioWorksFind;
    if (api && typeof api.open === 'function') { if (next) api.next(ctx); else api.open(ctx); return; }
    const ensure = root.AISystem6EnsureClioWorksFindModule;
    if (typeof ensure !== 'function') return;
    ensure().then(() => {
      const found = root.AISystem6ClioWorksFind;
      if (!found || typeof found.open !== 'function') return;
      if (next && typeof found.next === 'function') found.next(ctx);
      else found.open(ctx);
    }).catch((error) => console.warn('ClioStage native: find module', error));
  }

  /* ------------------------------------------------- the desk's menu bar */
  // ClioStage's menus are declared with the shell (app/data/menus.js), so a
  // mounted presentation brings its own rows the way a lazy application does:
  // while it is mounted the ClioStage menu set lists the presentation's
  // commands, and the Markdown deck's set comes back, as it was, on unmount.
  // Every row is a runtime command answering from the session's commandState.
  const MENU_COMMANDS = Object.freeze({
    'clio-stage-native-save': ['file.save', 's', 'clio_stage_native_cmd_save'],
    'clio-stage-native-revert': ['file.revert', '', 'clio_stage_native_cmd_revert'],
    'clio-stage-native-comment': ['comments.open', 'm', 'clio_stage_native_cmd_comment'],
    'clio-stage-native-prev': ['page.prev', '[', 'previous_slide'],
    'clio-stage-native-next': ['page.next', ']', 'next_slide'],
    'clio-stage-native-add-slide': ['slide.add', '', 'clio_stage_slide_add'],
    'clio-stage-native-duplicate-slide': ['slide.duplicate', '', 'clio_stage_slide_duplicate'],
    'clio-stage-native-delete-slide': ['slide.delete', '', 'clio_stage_slide_delete'],
    'clio-stage-native-layout': ['slide.layout', '', 'clio_stage_native_cmd_layout'],
    'clio-stage-native-reset-layout': ['slide.reset-layout', '', 'clio_stage_reset_layout'],
    'clio-stage-native-check': ['page.check', 'k', 'clio_stage_native_cmd_check'],
    'clio-stage-native-motion': ['motion.open', '', 'clio_stage_native_cmd_motion'],
    'clio-stage-native-notes-master': ['notesmaster.open', '', 'clio_stage_native_cmd_notes_master'],
    'clio-stage-native-handout': ['handout.print', '', 'clio_stage_native_cmd_handout'],
    // N3: the shared 查找 / 替换 windoid (features/clioworks-find.js), the keys
    // taken by the surface while a presentation is in front.
    'clio-stage-native-find': ['find.open', 'f', 'clioworks_find_replace_menu'],
    'clio-stage-native-find-next': ['find.next', 'g', 'find_next'],
  });
  const baseId = (commandId) => commandId;
  const listed = (commandId) => !!active && active.session.commands().some((command) => command.id === commandId);
  const stageWindowInFront = () => {
    const win = root.document && root.document.querySelector('.window.is-active[data-window]');
    return !!win && win.dataset.window === 'clioStage';
  };
  const menuCommand = (commandId) => ({
    handler: () => (active ? active.surface.runCommand(commandId) : null),
    isAvailable: () => !!active && listed(commandId) && active.session.commandState(commandId).enabled,
    unavailableReason: () => (active ? active.session.commandState(baseId(commandId)).reason || '' : ''),
  });
  Object.entries(MENU_COMMANDS).forEach(([action, [commandId, key, labelKey]]) => {
    try { root.AISystem6Runtime?.registerCommand?.(action, menuCommand(commandId)); } catch (error) { /* already registered by an earlier load */ }
    if (key && typeof keyboardShortcutRegistry !== 'undefined' && !keyboardShortcutRegistry.some((entry) => entry.id === action)) {
      // Shown in the menus; the keys themselves are taken below, only while a presentation is in front.
      const code = { m: 'KeyM', '[': 'BracketLeft', ']': 'BracketRight' }[key];
      keyboardShortcutRegistry.push({ id: action, key, ...(code ? { code } : {}), action, display: '⌘' + key.toUpperCase(), labelKey, dispatch: false, scope: ['clioStage'] });
    }
  });

  // Save As… (N0) is the host's, not the session's: a new Project Hard Disk
  // file the window then edits, or a download. ⇧⌘S through the desk's table.
  try {
    root.AISystem6Runtime?.registerCommand?.('clio-stage-native-save-as', {
      handler: () => (active && fn(nativeHost(), 'saveNativeDocumentAs') ? nativeHost().saveNativeDocumentAs(active.mountedName) : null),
      isAvailable: () => !!active && !active.session.saving && fn(nativeHost(), 'saveNativeDocumentAs'),
      unavailableReason: () => '',
    });
  } catch (error) { /* already registered by an earlier load */ }
  if (typeof keyboardShortcutRegistry !== 'undefined' && !keyboardShortcutRegistry.some((entry) => entry.id === 'clio-stage-native-save-as')) {
    keyboardShortcutRegistry.push({ id: 'clio-stage-native-save-as', key: 's', shift: true, action: 'clio-stage-native-save-as', display: '⇧⌘S', labelKey: 'clioworks_save_as', keyCaps: true, scope: ['clioStage'] });
  }

  let savedMenus = null;
  function nativeMenuSet(original) {
    const item = (action, labelKey) => menuItem(action, labelKey, MENU_COMMANDS[action][1] ? action : '');
    const keep = original.filter((definition) => definition && definition.id !== 'file' && definition.id !== 'edit' && definition.id !== 'presentation');
    const edit = original.find((definition) => definition && definition.id === 'edit');
    const rows = (list) => list.filter((action) => listed(MENU_COMMANDS[action][0])).map((action) => item(action, MENU_COMMANDS[action][2]));
    const sep = typeof menuSeparator !== 'undefined' ? [menuSeparator] : [];
    // S5 (2026-10-29): 文件 · 编辑 · 查看 · 演示 · 审阅 · 特别 — the shape ClioWrite and
    // a mounted workbook keep; 批注 sits in 审阅 where 修订 · 批注 · 比较 · 字数统计 live.
    return [
      menu('file', 'menu_file', [...rows(['clio-stage-native-save']), menuItem('clio-stage-native-save-as', 'clioworks_save_as', 'clio-stage-native-save-as'), ...rows(['clio-stage-native-revert']), ...sep, ...rows(['clio-stage-native-handout']), ...sep, menuItem('close-active-window', 'close', 'close-window')]),
      menu('edit', 'menu_edit', [
        ...(edit ? edit.items : []),
        // N3: the shared 查找 / 替换 windoid; the rows only stand while the command is listed.
        ...(listed('find.open') ? [...sep, item('clio-stage-native-find', 'clioworks_find_replace_menu'), item('clio-stage-native-find-next', 'find_next')] : []),
      ]),
      // 页面总览 answers by the name the ClioStage set already registered
      // (must-fix 2): clio-stage.js delegates it to this surface while mounted.
      menu('view', 'menu_view', [...rows(['clio-stage-native-prev', 'clio-stage-native-next']), ...sep, menuItem('clio-stage-overview', 'clio_stage_overview')]),
      menu('presentation', 'menu_presentation', [
        // 放映 (⇧⌘P) likewise answers by the ClioStage set's own name.
        menuItem('clio-stage-present', 'clio_stage_present', 'clio-stage-present'), ...sep,
        ...rows(['clio-stage-native-add-slide', 'clio-stage-native-duplicate-slide', 'clio-stage-native-delete-slide', 'clio-stage-native-layout', 'clio-stage-native-reset-layout']), ...sep,
        ...rows(['clio-stage-native-motion', 'clio-stage-native-notes-master']), ...sep,
        ...rows(['clio-stage-native-check']),
      ]),
      ...(listed('comments.open') ? [menu('review', 'menu_review', [item('clio-stage-native-comment', 'clio_stage_native_cmd_comment')])] : []),
      ...keep,
    ];
  }
  function swapMenus(mounted) {
    // The shell's ClioStage set is a plain array (app/data/menus.js); without it there is no menu bar to dress.
    if (typeof clioStageMenus === 'undefined' || !Array.isArray(clioStageMenus) || typeof menu !== 'function' || typeof menuItem !== 'function') return;
    if (mounted && !savedMenus) {
      savedMenus = clioStageMenus.slice();
      clioStageMenus.splice(0, clioStageMenus.length, ...nativeMenuSet(savedMenus));
    } else if (!mounted && savedMenus) {
      clioStageMenus.splice(0, clioStageMenus.length, ...savedMenus);
      savedMenus = null;
    } else return;
    if (typeof renderAppMenuBar === 'function') {
      try {
        const owner = (typeof menuOwnerAppId !== 'undefined' && menuOwnerAppId) || (typeof activeAppId !== 'undefined' && activeAppId) || '';
        if (owner === 'clioStage') renderAppMenuBar('clioStage', { force: true });
      } catch (error) { /* the bar is rebuilt the next time ClioStage comes forward */ }
    }
  }

  // Focus outside the surface (the title bar, the window body) still reaches the
  // keys while a presentation is in front. Taken in the capture phase, so the
  // desk's Minimize (⌘M) finds the event already handled; never while an input
  // method is composing; keys pressed inside the surface are the surface's own.
  if (root.document && fn(root.document, 'addEventListener')) {
    root.document.addEventListener('keydown', (event) => {
      if (!active || event.defaultPrevented || event.isComposing || event.keyCode === 229 || active.session.composing) return;
      // The show layer owns the keyboard while it is up; nothing beneath it answers.
      if (active.surface?.show?.state.active) return;
      if (!commandKey(event) || event.altKey || event.shiftKey) return;
      if (root.document.body && root.document.body.classList.contains('has-system-modal')) return;
      if (active.surface.root.contains(event.target) || !stageWindowInFront()) return;
      const id = keyCommand(active.session, event);
      if (!id) return;
      event.preventDefault();
      active.surface.runCommand(id);
    }, true);
  }

  root.AISystem6ClioStageNative = Object.freeze({
    open: openPresentation,
    close: closePresentation,
    current: () => (active ? { mountedName: active.mountedName, dirty: active.session.isDirty(), slideId: active.session.slideId } : null),
    hasUnsaved: () => !!active && active.session.isDirty(),
    // The Edit menu's history while a presentation is mounted (read by clio-stage.js).
    editHistory: () => (active ? active.session.editHistory : null),
    // N3: the surface the shared 查找 / 替换 windoid acts through, or null.
    findContext,
    listed,
    commandState: (commandId) => (active ? active.session.commandState(baseId(commandId)) : null),
    // 放映 and 页面总览 on the native surface (must-fix 2): clio-stage.js
    // delegates both menu rows and ⇧⌘P here while a presentation is mounted.
    commandAvailable: (action) => {
      if (!active) return false;
      if (action === 'clio-stage-present') return active.session.commandState('present').enabled;
      if (action === 'clio-stage-overview') return active.session.commandState('page.overview').enabled;
      return false;
    },
    runCommand: (action) => {
      if (!active) return null;
      if (action === 'clio-stage-present') return active.surface.runCommand('present');
      if (action === 'clio-stage-overview') return active.surface.runCommand('page.overview');
      return null;
    },
    createSession,
    groupComments,
    handoutPages,
  });
})(typeof window !== 'undefined' ? window : globalThis);
