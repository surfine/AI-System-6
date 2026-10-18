/* ClioWrite: the docx editing window (S11 M3, S11-4 / S11-19 / S11-23).
 *
 * One window, two modes over one document, one dirty axis:
 *   ClioWrite Express (the default): the document flows (no pages, no page
 *     numbers); typing changes the text inside a paragraph and nothing else;
 *     comments can be read and added (⌘M windoid); tables and pictures are shown
 *     and never edited.
 *   ClioWrite (full editing, ⌘E): the S11-4 subset on top — heading 1-3 / body
 *     text, bold / italic / underline, bullet / numbered list, splitting and
 *     joining paragraphs — from the Format menu and the ruler's pop-ups. The
 *     ruler only shows the file's margins and the paragraph's indents.
 *
 * The document model is the live Quire adapter the native host puts on the
 * record (record.liveAdapter). The editing layer is the vendored upstream
 * editor (quire/editor.js), which intercepts beforeinput and applies typing to
 * that same model; it reports every change back through adapter.syncExternal().
 * This file never parses or writes a package and keeps no second model,
 * history or store:
 *   dirty     = adapter.isDirty()                      (one source)
 *   commands  = the adapter's narrow face (setHeading, toggleRunStyle, setList,
 *               addComment / replyComment / setCommentDone, undo / redo)
 *   save      = AISystem6ClioWorks.saveNativeDocument  (the one write-back)
 *   losses    = adapter.exportReport()                 (first-save list only when > 0)
 *
 * Before the upstream editor sees an input, the gate below decides from the
 * caret's place in the model whether it may happen at all: a table or a picture
 * under the caret refuses it (the upstream editor would type into a table), and
 * Express refuses anything that is not text inside one paragraph. While an
 * input method is composing nothing is intercepted and the document DOM is not
 * rebuilt (S11-C8); a composition that started somewhere it may not land is
 * discarded only after it ends.
 * Dictation does not offer itself here (features/dictation.js skips .cw-scroller):
 * it writes into the DOM directly, which would bypass the model.
 *
 * Layers: describe() / gateInput() read the model only; createSession() is the
 * document-facing state (no DOM; driven headless by
 * tests/features/clioworks-s11-m3-write-surface.test.mjs); the window and the
 * editor mount live below it. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWrite) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const fn = (target, name) => !!target && typeof target[name] === 'function';
  const isBlocked = (out) => !!out && typeof out === 'object' && (out.status === 'blocked' || out.status === 'failed' || out.ok === false);

  // macOS takes the command key only: Ctrl+letter belongs to the text there.
  function commandKey(event) {
    const useMeta = typeof shortcutUsesCommandKey === 'function' ? shortcutUsesCommandKey() : /mac|iphone|ipad/i.test(String(typeof navigator !== 'undefined' && (navigator.platform || '')));
    return useMeta ? !!event.metaKey && !event.ctrlKey : !!event.ctrlKey && !event.metaKey;
  }

  /* -------------------------------------------------------- step names */
  // The upstream model names its transactions in English ("Typing", "Heading 1").
  // The Edit menu says them in the writer's language.
  const STEP_KEYS = Object.freeze({
    Typing: 'clio_write_step_typing',
    Delete: 'clio_write_step_delete',
    Cut: 'clio_write_step_cut',
    Paste: 'clio_write_step_paste',
    Insert: 'clio_write_step_typing',
    'Line Break': 'clio_write_step_line_break',
    'Split Paragraph': 'clio_write_step_split',
    'Join Paragraphs': 'clio_write_step_join',
    'Heading 1': 'clio_write_step_heading_1',
    'Heading 2': 'clio_write_step_heading_2',
    'Heading 3': 'clio_write_step_heading_3',
    'Body Text': 'clio_write_step_body',
    'Apply Bold': 'clio_write_step_bold',
    'Remove Bold': 'clio_write_step_bold',
    'Apply Italic': 'clio_write_step_italic',
    'Remove Italic': 'clio_write_step_italic',
    'Apply Underline': 'clio_write_step_underline',
    'Remove Underline': 'clio_write_step_underline',
    Bullets: 'clio_write_step_bullets',
    Numbering: 'clio_write_step_numbering',
    'Remove List': 'clio_write_step_remove_list',
    'Insert Comment': 'clio_write_step_comment',
    'Reply to Comment': 'clio_write_step_reply',
    'Resolve Comment': 'clio_write_step_resolve',
    'Reopen Comment': 'clio_write_step_reopen',
  });
  function stepKey(label) {
    const text = String(label || '');
    if (!text) return '';
    return STEP_KEYS[text] || 'clio_write_step_change';
  }

  /* ------------------------------------------------- the model's facts */
  const OBJECT_TYPES = new Set(['img', 'shape', 'group', 'chart']);

  /** 'body' (a top-level paragraph of the main story), 'table', or 'other'. */
  function placeOf(D, doc, p) {
    if (!p) return 'other';
    const info = D.info(doc, p);
    if (!info || info.story !== doc.main) return 'other';
    return info.parents && info.parents.length ? 'table' : 'body';
  }
  function objectIn(D, p, from, to) {
    let at = 0;
    for (const item of p.runs) {
      const n = D.ilen(item);
      if (n && at < to && at + n > from && OBJECT_TYPES.has(item.t)) return true;
      at += n;
    }
    return false;
  }

  /**
   * What a selection from a to b (ordered model positions {p, o}) covers,
   * read from the model only.
   */
  function describe(D, doc, a, b) {
    const paras = a.p === b.p ? [a.p] : D.parasBetween(doc, a.p, b.p);
    const places = paras.map((p) => placeOf(D, doc, p));
    const prev = D.prevPara(doc, a.p);
    const next = D.nextPara(doc, b.p);
    const len = D.plen(b.p);
    return {
      paragraphId: String(b.p.id),
      paragraphIds: paras.filter((p, i) => places[i] === 'body').map((p) => String(p.id)),
      paragraphs: paras.length,
      from: a.p === b.p ? a.o : 0,
      to: a.p === b.p ? b.o : len,
      collapsed: a.p === b.p && a.o === b.o,
      table: places.includes('table'),
      other: places.includes('other'),
      object: paras.some((p) => objectIn(D, p, p === a.p ? a.o : 0, p === b.p ? b.o : D.plen(p))),
      atStart: a.o === 0,
      atEnd: b.o === len,
      objectBefore: a.o > 0 && objectIn(D, a.p, a.o - 1, a.o),
      objectAfter: b.o < len && objectIn(D, b.p, b.o, b.o + 1),
      paragraphHasObject: paras.some((p) => objectIn(D, p, 0, D.plen(p))),
      prev: prev ? placeOf(D, doc, prev) : '',
      next: next ? placeOf(D, doc, next) : '',
    };
  }

  /**
   * May this input happen here? kind: text | split | line | break | backward |
   * forward | word-backward | word-forward | delete | format.
   * Returns { allow, code } — code names the refusal.
   */
  function gateInput(mode, kind, d) {
    const ok = { allow: true, code: '' };
    const no = (code) => ({ allow: false, code });
    if (!d) return no('NO_CARET');
    if (d.other) return no('OUTSIDE_BODY');
    if (d.table) return no('READ_ONLY_TABLE');
    const express = mode !== 'full';
    if (kind === 'break') return no('NOT_IN_SUBSET');
    if (kind === 'format') return express ? no('EXPRESS_FORMAT') : ok;
    if (d.paragraphs > 1 && express) return no('EXPRESS_ONE_PARAGRAPH');
    if (!d.collapsed && d.object) return no('READ_ONLY_IMAGE');
    switch (kind) {
      case 'text':
      case 'delete':
        return ok;
      case 'split':
      case 'line':
        return express ? no('EXPRESS_STRUCTURE') : ok;
      case 'word-backward':
      case 'word-forward':
        if (d.collapsed && d.paragraphHasObject) return no('READ_ONLY_IMAGE');
      // falls through
      case 'backward':
      case 'forward': {
        if (!d.collapsed) return ok;
        const back = kind === 'backward' || kind === 'word-backward';
        const edge = back ? d.atStart : d.atEnd;
        if (edge) {
          // At a paragraph's edge the key joins two paragraphs (or drops a list mark).
          if (express) return no('EXPRESS_STRUCTURE');
          const neighbour = back ? d.prev : d.next;
          if (neighbour === 'table') return no('READ_ONLY_TABLE');
          if (neighbour === 'other') return no('OUTSIDE_BODY');
          return ok;
        }
        if (back ? d.objectBefore : d.objectAfter) return no('READ_ONLY_IMAGE');
        return ok;
      }
      default:
        return no('NOT_IN_SUBSET');
    }
  }

  const REFUSAL_KEYS = Object.freeze({
    NO_CARET: 'clio_write_reason_no_caret',
    OUTSIDE_BODY: 'clio_write_reason_outside',
    READ_ONLY_TABLE: 'clio_write_reason_table',
    READ_ONLY_IMAGE: 'clio_write_reason_image',
    EXPRESS_FORMAT: 'clio_write_reason_express_format',
    EXPRESS_STRUCTURE: 'clio_write_reason_express_structure',
    EXPRESS_ONE_PARAGRAPH: 'clio_write_reason_express_one_paragraph',
    NOT_IN_SUBSET: 'clio_write_reason_not_in_subset',
    DROP: 'clio_write_reason_drop',
    PROTECTED: 'clio_write_reason_protected',
    CONFIRM_OPEN: 'clio_write_reason_confirming',
    DIALOG_OPEN: 'clio_write_reason_dialog',
    RESELECT: 'clio_write_reason_reselect',
  });

  /* ---------------------------------------------------------------- session */

  /**
   * Document-facing state for one mounted document.
   * @param {object} initialAdapter the live Quire adapter (record.liveAdapter)
   * @param {{fileName?:string, mountedName?:string, host?:object, confirmList?:Function, alertFailure?:Function, readAdapter?:Function, onHistory?:Function, onRebind?:Function, dialogOpen?:Function}} opts
   */
  function createSession(initialAdapter, opts = {}) {
    let adapter = initialAdapter;
    const listeners = new Set();
    const host = opts.host || {};
    const s = {
      mode: 'express',
      caret: null,              // describe() of the current selection
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
    const restingReceipt = () => (isDirty() ? { key: 'clio_write_receipt_dirty', args: [], kind: 'dirty' } : { key: '', args: [], kind: 'idle' });
    const setReceipt = (key, kind = 'info', args = []) => { s.receipt = { key, args, kind }; notify(); };
    const settleReceipt = () => { if (s.receipt.kind === 'blocked' || s.receipt.kind === 'info') s.receipt = restingReceipt(); };
    const afterEdit = () => { if (!s.saving) s.receipt = restingReceipt(); notify(); };

    function refuse(code) {
      setReceipt('clio_write_receipt_refused', 'blocked', [tr(REFUSAL_KEYS[code] || 'clio_write_reason_not_in_subset')]);
      return { status: 'blocked', code };
    }

    /** The editing layer changed the model: count it once (the adapter decides) and redraw the chrome. */
    function noteExternalEdit() {
      if (fn(adapter, 'syncExternal')) adapter.syncExternal();
      afterEdit();
    }

    function paragraph(id) {
      if (!id || !fn(adapter, 'paragraphs')) return null;
      return adapter.paragraphs().find((p) => p.id === String(id)) || null;
    }

    /* -- the selection as a bookmark (S11-C8): ids and offsets stamped with the document's
       revision, never DOM nodes. A command checks it before it runs; once the document has
       changed under it the command does nothing and asks for a new selection. -- */
    const stamp = (caret) => (caret ? { ...caret, revision: revision() } : null);
    const stale = (caret) => !!caret && caret.revision !== undefined && caret.revision !== revision();
    // After our own command: the same paragraphs still stand, so the bookmark moves to the new revision.
    function restamp(caret) {
      if (!caret) return null;
      const ids = caret.paragraphIds && caret.paragraphIds.length ? caret.paragraphIds : [caret.paragraphId];
      return ids.every((pid) => !!paragraph(pid)) ? stamp(caret) : null;
    }

    /* -- the S11-4 subset, through the adapter's narrow face -- */
    const FORMAT = Object.freeze({
      'format.heading.1': ['heading', 1], 'format.heading.2': ['heading', 2], 'format.heading.3': ['heading', 3], 'format.heading.0': ['heading', 0],
      'format.bold': ['style', 'b'], 'format.italic': ['style', 'i'], 'format.underline': ['style', 'u'],
      'format.list.bullet': ['list', 'bullet'], 'format.list.number': ['list', 'number'], 'format.list.none': ['list', 'none'],
    });
    function format(id) {
      const gate = commandState(id);
      if (!gate.enabled) {
        if (gate.reason) setReceipt('clio_write_receipt_refused', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      const [what, arg] = FORMAT[id];
      const c = s.caret;
      if (stale(c)) return refuse('RESELECT');
      let out;
      try {
        if (what === 'heading') {
          for (const pid of c.paragraphIds) { out = adapter.setHeading(pid, arg); if (isBlocked(out)) break; }
        } else if (what === 'style') {
          out = adapter.toggleRunStyle(c.paragraphId, arg, { from: c.from, to: c.to });
        } else {
          // Choosing the list a paragraph already has takes it off again (Word does the same).
          const kinds = c.paragraphIds.map((pid) => { const p = paragraph(pid); return p && p.list ? p.list.kind : 'none'; });
          const kind = arg !== 'none' && kinds.every((k) => k === arg) ? 'none' : arg;
          out = adapter.setList(c.paragraphIds, kind);
        }
      } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
      if (isBlocked(out)) return refuse(out.code || 'NOT_IN_SUBSET');
      s.caret = restamp(c);
      afterEdit();
      return { status: 'ok' };
    }

    /* -- comments -- */
    const commentsAvailable = () => fn(adapter, 'comments') && fn(adapter, 'addComment');
    function addComment(text, caret = s.caret) {
      if (s.confirming) return { status: 'blocked', code: 'CONFIRM_OPEN' };
      const c = caret;
      if (!c) return refuse('NO_CARET');
      if (stale(c)) return refuse('RESELECT');
      if (c.other) return refuse('OUTSIDE_BODY');
      if (c.table) return refuse('READ_ONLY_TABLE');
      const one = c.paragraphs === 1;
      // A caret comments the whole paragraph; a selection inside one paragraph comments that range.
      const range = one && !c.collapsed ? { from: c.from, to: c.to } : undefined;
      let out;
      try { out = adapter.addComment(c.paragraphIds[c.paragraphIds.length - 1] || c.paragraphId, range, { author: tr('clio_comments_author_default'), text, date: new Date().toISOString() }); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
      if (isBlocked(out)) return out.code ? refuse(out.code) : out;
      if (s.caret === c) s.caret = restamp(c);
      afterEdit();
      return { status: 'ok', id: out && out.id };
    }

    /* -- save, revert and the first-save list: as the M1 workbook and M2 presentation -- */
    async function readReport() {
      if (!isDirty() || !fn(adapter, 'exportReport')) return { converted: [], lost: [] };
      const report = (await adapter.exportReport()) || {};
      return { converted: Array.isArray(report.converted) ? report.converted : [], lost: Array.isArray(report.lost) ? report.lost : [] };
    }

    /** ⌘S. One candidate is never submitted twice; edits made while saving stay dirty. */
    async function save() {
      if (s.closed) return { status: 'blocked', code: 'CLOSED' };
      if (s.reverting) return { status: 'blocked', code: 'REVERTING' };
      if (s.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      if (s.saving) return { status: 'blocked', code: 'SAVE_IN_FLIGHT' };
      if (s.confirming) return { status: 'blocked', code: 'CONFIRM_OPEN' };
      if (!isDirty()) { setReceipt('clio_write_receipt_nothing', 'info'); return { status: 'clean' }; }
      if (!fn(host, 'save')) { setReceipt('clio_write_receipt_unavailable', 'error'); return { status: 'failed', reason: 'unavailable' }; }
      s.saving = true;
      setReceipt('clio_write_receipt_saving', 'saving');
      let report;
      try { report = await readReport(); } catch (error) {
        s.saving = false;
        setReceipt('clio_write_receipt_failed', 'error');
        if (typeof opts.alertFailure === 'function') await opts.alertFailure({ ok: false, reason: 'report-failed' });
        return { status: 'failed', reason: 'report-failed' };
      }
      const count = report.converted.length + report.lost.length;
      // Asked once per session, again only when more would change (S11-13).
      const needsList = count > 0 && count > s.confirmedLost;
      if (needsList) {
        s.saving = false;
        s.confirming = true;
        s.receipt = restingReceipt();
        notify();
        let choice = 'cancel';
        try { choice = typeof opts.confirmList === 'function' ? await opts.confirmList(report) : 'cancel'; } finally { s.confirming = false; }
        if (s.closed) return { status: 'cancelled' };
        if (choice !== 'save') { setReceipt('clio_write_receipt_not_saved', 'kept'); return { status: 'cancelled' }; }
        s.saving = true;
        setReceipt('clio_write_receipt_saving', 'saving');
      }
      const rev = revision();
      let result;
      try { result = await host.save(opts.mountedName); } catch (error) { result = { ok: false, reason: 'encode-failed', message: String(error && error.message || error) }; }
      s.saving = false;
      if (!result || !result.ok) {
        setReceipt(result && result.reason === 'unavailable' ? 'clio_write_receipt_unavailable' : 'clio_write_receipt_failed', 'error');
        if (typeof opts.alertFailure === 'function') await opts.alertFailure(result || { ok: false });
        return { status: 'failed', reason: (result && result.reason) || 'failed' };
      }
      if (needsList) s.confirmedLost = count;
      if (revision() > rev || isDirty()) setReceipt('clio_write_receipt_saved_older', 'saved-older');
      else setReceipt('clio_write_receipt_saved', 'saved', [opts.fileName || '']);
      return { status: 'ok', mode: result.mode, byteLength: result.byteLength, sha256: result.sha256 };
    }

    /* Edit › Undo / Redo: the adapter's own transactions, named in the writer's words.
       Every route (the keys, beforeinput, the desk's Edit menu) ends here, so a system dialog
       open over the window (the close box's three choices) stops all of them at once. */
    const dialogOpen = () => typeof opts.dialogOpen === 'function' && !!opts.dialogOpen();
    const historyHeld = () => s.closed || s.confirming || s.composing || dialogOpen();
    const canUndo = () => !historyHeld() && fn(adapter, 'canUndo') && !!adapter.canUndo();
    const canRedo = () => !historyHeld() && fn(adapter, 'canRedo') && !!adapter.canRedo();
    function travel(direction) {
      if (direction === 'undo' ? !canUndo() : !canRedo()) return false;
      const out = adapter[direction]() || {};
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
    });

    /** A command that is not wired is not listed; one that is wired but unavailable says why. */
    function commandState(id) {
      if (s.closed) return { enabled: false, reason: '' };
      switch (id) {
        case 'file.save':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (!isDirty()) return { enabled: false, reason: tr('clio_write_receipt_nothing') };
          return { enabled: true };
        case 'file.revert':
          if (s.saving || s.confirming || s.reverting) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (!isDirty()) return { enabled: false, reason: tr('clio_write_receipt_nothing') };
          return { enabled: true };
        case 'edit.undo':
        case 'edit.redo':
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (dialogOpen()) return { enabled: false, reason: tr('clio_write_reason_dialog') };
          if (id === 'edit.undo') return canUndo() ? { enabled: true } : { enabled: false, reason: tr('clio_write_nothing_to_undo') };
          return canRedo() ? { enabled: true } : { enabled: false, reason: tr('clio_write_nothing_to_redo') };
        default: break;
      }
      if (id.startsWith('format.')) {
        if (s.mode !== 'full') return { enabled: false, reason: tr('clio_write_reason_express_format') };
        if (s.reverting) return { enabled: false, reason: tr('clio_write_reason_saving') };
        if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
        const c = s.caret;
        if (!c) return { enabled: false, reason: tr('clio_write_reason_no_caret') };
        if (c.other) return { enabled: false, reason: tr('clio_write_reason_outside') };
        if (c.table) return { enabled: false, reason: tr('clio_write_reason_table') };
        if (FORMAT[id] && FORMAT[id][0] === 'style') {
          if (c.collapsed) return { enabled: false, reason: tr('clio_write_reason_select_text') };
          if (c.paragraphs > 1) return { enabled: false, reason: tr('clio_write_reason_one_paragraph') };
          if (c.object) return { enabled: false, reason: tr('clio_write_reason_image') };
        }
        return FORMAT[id] ? { enabled: true } : { enabled: false, reason: '' };
      }
      return { enabled: true };
    }
    function commands() {
      const wired = (name) => fn(adapter, name);
      const list = [
        { id: 'file.save', labelKey: 'clio_stage_native_cmd_save', shortcut: '⌘S' },
        fn(host, 'revert') ? { id: 'file.revert', labelKey: 'clio_stage_native_cmd_revert', shortcut: '' } : null,
        { id: 'view.mode', labelKey: 'clio_write_mode_full', shortcut: '⌘E', checked: s.mode === 'full' },
        commentsAvailable() ? { id: 'comments.open', labelKey: 'clio_stage_native_cmd_comment', shortcut: '⌘M' } : null,
        ...(wired('setHeading') ? ['format.heading.1', 'format.heading.2', 'format.heading.3', 'format.heading.0'] : []).map((id) => ({ id, labelKey: `clio_write_style_${id.slice(-1) === '0' ? 'body' : 'heading_' + id.slice(-1)}` })),
        ...(wired('toggleRunStyle') ? [['format.bold', 'bold', '⌘B'], ['format.italic', 'italic', '⌘I'], ['format.underline', 'underline', '⌘U']] : []).map(([id, key, shortcut]) => ({ id, labelKey: `clio_write_${key}`, shortcut })),
        ...(wired('setList') ? [['format.list.bullet', 'bullets'], ['format.list.number', 'numbering']] : []).map(([id, key]) => ({ id, labelKey: `clio_write_${key}` })),
      ].filter(Boolean);
      return list.map((command) => ({ ...command, state: commandState(command.id) }));
    }

    /** 「复原到上次存储…」: the host re-opens the adapter from the stored bytes. Not undoable. */
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
      if (!next) { setReceipt('clio_write_receipt_revert_failed', 'error'); return { status: 'failed', reason: (result && result.reason) || 'failed' }; }
      rebind(next);
      setReceipt('clio_write_receipt_reverted', 'info');
      return { status: 'ok' };
    }
    function rebind(next) {
      adapter = next;
      s.caret = null;
      if (typeof opts.onRebind === 'function') opts.onRebind(next);
    }

    // Characters and words as a writer counts them: each CJK character is one, a Latin word is one.
    function wordCount() {
      if (!fn(adapter, 'blocks')) return 0;
      let n = 0;
      for (const b of adapter.blocks()) {
        const text = b.kind === 'table' ? b.rows.map((r) => r.map((c) => c.text).join(' ')).join(' ') : String(b.text || '');
        n += (text.match(/[㐀-鿿豈-﫿]/g) || []).length + (text.replace(/[㐀-鿿豈-﫿]/g, ' ').match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) || []).length;
      }
      return n;
    }

    const session = {
      get adapter() { return adapter; },
      get mode() { return s.mode; },
      get caret() { return s.caret; },
      get receipt() { return s.receipt; },
      get saving() { return s.saving; },
      get confirming() { return s.confirming; },
      get composing() { return s.composing; },
      set composing(value) { s.composing = !!value; },
      get closed() { return s.closed; },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      notify,
      setReceipt,
      receiptText: () => (s.receipt.key ? tr(s.receipt.key, ...s.receipt.args) : ''),
      // Mode never touches the document: no save, no dirty change, the selection stays.
      setMode(mode) {
        if (mode !== 'express' && mode !== 'full') throw new Error('ClioWrite: unknown mode ' + mode);
        if (mode === s.mode) return;
        s.mode = mode;
        settleReceipt();
        notify();
      },
      toggleMode() { session.setMode(s.mode === 'express' ? 'full' : 'express'); },
      setCaret(caret) {
        const was = s.caret;
        // A bookmark keeps the revision it was taken at; a fresh reading is stamped now.
        s.caret = caret && caret.revision !== undefined ? caret : stamp(caret);
        // A refusal stays on screen until the caret really moves.
        const moved = !was || !s.caret || was.paragraphId !== s.caret.paragraphId || was.from !== s.caret.from || was.to !== s.caret.to;
        if (moved) settleReceipt();
        notify();
      },
      /** Gate one input at the caret; a refusal leaves a receipt and changes nothing. */
      gate(kind, caret = s.caret) {
        const verdict = gateInput(s.mode, kind, caret);
        if (!verdict.allow) refuse(verdict.code);
        return verdict;
      },
      refuse,
      noteExternalEdit,
      paragraph,
      headingLevel: () => { const p = s.caret && paragraph(s.caret.paragraphId); return p ? p.headingLevel || 0 : 0; },
      listKind: () => { const p = s.caret && paragraph(s.caret.paragraphId); return p && p.list ? p.list.kind : 'none'; },
      format,
      addComment,
      commentsAvailable,
      wordCount,
      save,
      revert,
      rebind,
      isDirty,
      revision,
      commandState,
      commands,
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

  /* --------------------------------------------------------------- the window */

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

  // The window is built once, by this module (S11-C4: it exists before its name is registered).
  function installWindow() {
    const doc = root.document;
    const shell = root.AISystem6ApplicationShell;
    if (!doc || !shell || typeof doc.querySelector !== 'function') return null;
    const existing = doc.querySelector('[data-window="clioWrite"]');
    if (existing) return existing;
    return shell.createWindow({
      windowName: 'clioWrite',
      windowClass: 'clio-write-window',
      labelledBy: 'clio-write-title',
      // A Clio- name is an application name, the same in both languages.
      title: 'ClioWrite',
      statusClass: 'app-status-bar cw-status',
      statusHtml: '',
      beforePaneHtml: '<div class="cw-ruler" hidden></div>',
      paneClass: 'clio-write-pane',
      paneHtml: '',
    });
  }

  let chrome = null;   // the window's own parts, built once
  function buildChrome(win) {
    if (chrome && chrome.win === win) return chrome;
    const doc = win.ownerDocument || root.document;
    const status = win.querySelector(':scope > .details-bar') || win.querySelector('.cw-status');
    const ruler = win.querySelector('.cw-ruler');
    const pane = win.querySelector('.clio-write-pane') || win.querySelector('.window-pane');
    const popButton = () => h(doc, 'button', { type: 'button', class: 'system-select-button cw-pop', 'aria-haspopup': 'menu' }, [h(doc, 'span', { class: 'system-select-label' })]);
    const receiptEl = h(doc, 'span', { class: 'status-bar-leading cw-receipt', role: 'status', 'aria-live': 'polite' });
    const fileEl = h(doc, 'b', { class: 'cw-file' });
    const modeBtn = popButton();
    const cmdBtn = popButton();
    status.replaceChildren(receiptEl, h(doc, 'span', { class: 'status-bar-context cw-context' }, [fileEl, modeBtn]), h(doc, 'span', { class: 'status-bar-trailing cw-trailing' }, [cmdBtn]));
    const styleBtn = popButton();
    const listBtn = popButton();
    const strip = h(doc, 'div', { class: 'cw-ruler-strip', role: 'img' });
    ruler.replaceChildren(h(doc, 'span', { class: 'cw-ruler-pops' }, [styleBtn, listBtn]), strip);
    const emptyEl = h(doc, 'div', { class: 'cw-empty' });
    const scroller = h(doc, 'div', { class: 'cw-scroller window-frame-scroller', hidden: true });
    const captionEl = h(doc, 'p', { class: 'cw-caption' });
    const layer = h(doc, 'div', { class: 'cw-layer', hidden: true });
    pane.replaceChildren(emptyEl, scroller, captionEl, layer);
    chrome = { win, doc, pane, status, ruler, strip, receiptEl, fileEl, modeBtn, cmdBtn, styleBtn, listBtn, emptyEl, scroller, captionEl, layer, titleEl: win.querySelector('#clio-write-title') };
    return chrome;
  }

  /* -- the upstream editor, mounted once into the window's scroller -- */
  let editor = null;   // { L, E, LY, D }
  async function ensureEditor(c) {
    if (editor) return editor;
    const quire = root.ClioWorksQuireAdapter;
    if (!quire || !fn(quire, 'loadEditor')) throw new Error('ClioWrite: the Quire editing layer is not loaded');
    const L = await quire.loadEditor();
    if (editor) return editor;
    L.layout.mount(c.scroller);
    L.layout.view = 'web';     // the document flows; no pages, no page numbers
    const ed = { L, E: L.ed, LY: L.layout, D: L.D };
    // The upstream layer asks its host for commands, messages and whether a menu or dialog is up.
    L.ui = {
      exec: (name) => { if (active) active.surface.exec(name); },
      toast: () => { if (active) active.session.refuse('PROTECTED'); },
      dialogOpen: () => !!(chrome && !chrome.layer.hidden),
      menuOpen: () => !!(active && active.surface.menuOpen()),
    };
    L.app = L.app || {};
    ed.LY.root.dataset.editHistory = 'clioWrite';
    ed.LY.root.setAttribute('aria-label', tr('clio_write_document_label'));
    // The document is the scroller's one tab stop, so a long file scrolls from the keyboard (axe
    // scrollable-region-focusable) without a second stop on the scroller itself.
    ed.LY.root.tabIndex = 0;
    ed.E.init();
    // Count the change first, then read the caret, so the selection's bookmark carries the new revision.
    L.bus.on('doc-changed', () => { if (active && active.session.adapter.document() === ed.D.doc) { active.session.noteExternalEdit(); active.surface.syncCaret(); } });
    L.bus.on('sel', () => { if (active) active.surface.syncCaret(); });
    // Tables and pictures are shown, never typed into: the browser gets no caret in them either.
    L.bus.on('layout-done', () => { if (ed.LY.root) ed.LY.root.querySelectorAll('table, img, svg, .tbl, .obj').forEach((node) => node.setAttribute('contenteditable', 'false')); });
    editor = ed;
    return ed;
  }

  // M1's placement rule (features/clio-chart-comments.js), shared when loaded; the same as ClioStage's.
  const DOCK_HEIGHT_PX = 188;
  function windoidPlacement(width, mainHeight) {
    const shared = root.AISystem6Windoid && root.AISystem6Windoid.placement;
    if (typeof shared === 'function') return shared(width, mainHeight);
    if (!Number.isFinite(Number(width)) || width < 640) return 'swap';
    if (width >= 1040) return 'float-right';
    if (mainHeight === undefined || mainHeight === null) return 'dock-below';
    return Number(mainHeight) >= 200 ? 'dock-below' : 'swap';
  }

  // A windoid: a small tool window with a thin title bar and a close box (styles/84-windoid.css).
  function createWindoid(doc, hostEl, { title, className, onClose }) {
    const rootEl = h(doc, 'div', { class: 'windoid ' + className, role: 'dialog', 'aria-label': title });
    const closeBox = h(doc, 'button', { type: 'button', class: 'windoid-close', 'aria-label': tr('clio_comments_close') });
    const titleEl = h(doc, 'span', { class: 'windoid-title', text: title });
    const body = h(doc, 'div', { class: 'windoid-body' });
    rootEl.append(h(doc, 'div', { class: 'windoid-titlebar' }, [closeBox, titleEl]), body);
    hostEl.append(rootEl);
    hostEl.classList.add('has-windoid');
    let closed = false;
    const place = () => {
      const width = hostEl.clientWidth || 0;
      const main = hostEl.querySelector('.cw-scroller');
      const top = main && Number.isFinite(main.offsetTop) ? Math.max(0, main.offsetTop) : 0;
      // The main area left once a docked windoid has taken its rows (the M1 rule).
      const height = hostEl.clientHeight || 0;
      const placement = windoidPlacement(width, height ? height - top - DOCK_HEIGHT_PX : undefined);
      rootEl.style.setProperty('--windoid-main-top', `${top}px`);
      rootEl.dataset.windoidPlacement = placement;
      hostEl.dataset.windoidPlacement = placement;
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
        hostEl.classList.remove('has-windoid');
        delete hostEl.dataset.windoidPlacement;
        if (typeof onClose === 'function') onClose();
      },
    };
    closeBox.addEventListener('click', () => handle.close());
    rootEl.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !event.isComposing) { event.stopPropagation(); handle.close(); } });
    place();
    return handle;
  }

  /**
   * Draw a session into the ClioWrite window around the mounted editor.
   * Returns { exec, runCommand, runSave, syncCaret, confirmList, alertFailure, focus, menuOpen, unmount }.
   */
  function mountSurface(c, ed, session, opts = {}) {
    const { doc, scroller } = c;
    const { E, LY, D } = ed;
    const cleanups = [];
    const on = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    };
    let openedMenu = null;
    let windoid = null;
    let disposed = false;
    let blockedComposition = false;
    let orphanComposition = false;   // a composition whose end must not reach the editor (blur, revert)
    let lastCompositionEnd = 0;
    let pendingEnd = null;           // { data, timer } a compositionend held until the task it came in is over
    let replayingEnd = false;        // the held compositionend handed on to the upstream editor
    let pendingConfirm = null;       // { done } while the first-save list is open
    let resizeObserver = null;

    const refreshMenus = () => { if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* menus redraw next time */ } } };
    const focusDocument = () => { try { LY.root.focus({ preventScroll: true }); } catch (error) { /* not focusable yet */ } };

    /* -- the document in the editor -- */
    function bindDocument(adapter) {
      // Any adapter call binds the model's global document and this document's own history.
      if (fn(adapter, 'canUndo')) adapter.canUndo();
      D.doc = adapter.document();
      E.overtype = false;
      LY.root.contentEditable = 'true';
      LY.render();
      const first = D.firstPara(D.doc.main.blocks);
      E.sel = null;
      E.objSel = null;
      if (first) E.setSel(D.pos(first, 0), null, { noScroll: true, noDom: true });
      scroller.scrollTop = 0;
    }

    // The model's document and history are shared by every docx open in the page. Before the
    // upstream editor acts on anything, make them this window's own again (another file's
    // adapter may have bound them since, e.g. while a Cancel was pending).
    let pictureHeld = false;   // a press on a picture was swallowed and the caret has not moved since
    function ownDoc() {
      const mine = session.adapter.document();
      if (D.doc === mine) return true;
      try { if (fn(session.adapter, 'canUndo')) session.adapter.canUndo(); } catch (error) { /* bound below */ }
      if (D.doc !== mine) D.doc = mine;
      // Positions read while another file was bound mean nothing here: read the caret afresh.
      E.sel = null;
      E.objSel = null;
      return true;
    }
    function redraw() {
      if (disposed) return;
      ownDoc();
      LY.render();
      E.restoreDom(true);
    }

    function selectionNow() {
      ownDoc();
      if (!E.objSel) E.syncSel();
      if (!E.sel) { const m = E.readDom(); if (m) E.sel = m; }
      if (!E.sel || D.doc !== session.adapter.document()) return null;
      const [a, b] = E.range();
      // Stable paragraph ids and offsets, so a command can put the selection back (S11-C8).
      return { ...describe(D, D.doc, a, b), anchor: { id: String(a.p.id), o: a.o }, focus: { id: String(b.p.id), o: b.o } };
    }
    // Put the editor's selection back on a bookmark; false when its paragraphs are gone.
    function restoreSelection(mark) {
      if (!mark || !mark.anchor || !mark.focus) return false;
      ownDoc();
      const a = D.byId(D.doc, Number(mark.anchor.id));
      const b = D.byId(D.doc, Number(mark.focus.id));
      if (!a || !b || mark.anchor.o > D.plen(a) || mark.focus.o > D.plen(b)) return false;
      E.objSel = null;
      E.setSel(D.pos(a, mark.anchor.o), D.pos(b, mark.focus.o), { noScroll: true });
      return true;
    }
    const systemModalOpen = () => !!(doc.body && doc.body.classList && doc.body.classList.contains('has-system-modal'));
    function syncCaret() {
      if (disposed || session.composing) return;
      pictureHeld = false;   // the selection really moved: the press no longer stands for the picture
      session.setCaret(selectionNow());
    }
    // End any composition without a compositionend: focus left, the element went, a revert began.
    // The DOM the input method drew is thrown away and rebuilt from the model.
    function abandonComposition() {
      if (pendingEnd) { pendingEnd.blurred = true; settleEnd(); }
      const was = session.composing || E.composing || blockedComposition;
      const code = blockedComposition;
      session.composing = false;
      E.composing = false;
      blockedComposition = false;
      if (!was) return;
      orphanComposition = true;
      if (!disposed) { redraw(); if (code) session.refuse(code); }
    }
    // Still composing in a window the writer is in. A composition left over from a window that
    // lost focus or was taken out of the page is dropped here instead of blocking the close forever.
    function composingNow() {
      if (!(session.composing || E.composing)) return false;
      const host = LY.root;
      const active = doc.activeElement;
      const stale = !host || host.isConnected === false || (active && active !== host && !(host.contains && host.contains(active)));
      if (stale) { abandonComposition(); return false; }
      return true;
    }
    function refuseEvent(event, code) {
      event.preventDefault();
      event.stopImmediatePropagation();
      session.refuse(code);
    }
    // Run one input past the gate. Returns true when it was refused (and stopped).
    function gated(event, kind) {
      ownDoc();
      E.overtype = false;   // overwrite mode would delete what follows the caret, pictures included
      // The first-save list or a system dialog is open: no input reaches the document under it.
      if (session.confirming || systemModalOpen()) { event.preventDefault(); event.stopImmediatePropagation(); return true; }
      if (E.objSel || pictureHeld) { refuseEvent(event, 'READ_ONLY_IMAGE'); return true; }
      const caret = selectionNow();
      const verdict = gateInput(session.mode, kind, caret);
      if (verdict.allow) return false;
      refuseEvent(event, verdict.code);
      return true;
    }

    /* -- pop-up menus (the M1/M2 pattern: the desk's menu panel under its button) -- */
    function closeMenu() {
      if (!openedMenu) return;
      const { menu, away } = openedMenu;
      openedMenu = null;
      doc.removeEventListener('pointerdown', away, true);
      menu.remove();
    }
    function openMenu(anchor, items, labelKey) {
      closeMenu();
      const menu = h(doc, 'div', { class: 'menu-popover cw-menu', role: 'menu', 'aria-label': tr(labelKey) });
      for (const item of items) {
        if (item.separator) { menu.append(h(doc, 'hr')); continue; }
        const btn = h(doc, 'button', {
          type: 'button',
          role: item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem',
          class: [item.checked ? 'is-checked' : '', item.enabled === false ? 'is-disabled' : ''].filter(Boolean).join(' ') || undefined,
          dataset: { menuCommand: item.id },
        }, [
          h(doc, 'span', { class: 'cw-menu-label' }, [item.label, item.enabled === false && item.reason ? h(doc, 'small', { text: item.reason }) : null]),
          item.shortcut ? h(doc, 'kbd', { text: item.shortcut }) : null,
        ]);
        if (item.checked !== undefined) btn.setAttribute('aria-checked', String(!!item.checked));
        if (item.enabled === false) btn.setAttribute('aria-disabled', 'true');
        // The caret stays in the document while a pop-up is chosen from.
        btn.addEventListener('mousedown', (event) => event.preventDefault());
        btn.addEventListener('click', () => {
          if (item.enabled === false) return;
          closeMenu();
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
      menu.style.setProperty('--cw-menu-x', `${Math.max(8, Math.min(rect.left, view.innerWidth - menu.offsetWidth - 8))}px`);
      menu.style.setProperty('--cw-menu-y', `${Math.max(8, Math.min(rect.bottom + 2, view.innerHeight - menu.offsetHeight - 8))}px`);
      doc.addEventListener('pointerdown', away, true);
      openedMenu = { menu, away };
      if (!anchor.matches || !anchor.matches('.cw-ruler-pops button')) (menu.querySelector('button:not(.is-disabled)') || menu.querySelector('button'))?.focus();
    }

    /* -- commands -- */
    async function runSave() {
      if (session.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      const out = await session.save();
      refreshMenus();
      return out;
    }
    function setMode(mode) {
      if (session.composing || mode === session.mode) return;
      session.setMode(mode);
      refreshMenus();
    }
    const toggleMode = () => setMode(session.mode === 'express' ? 'full' : 'express');
    async function runRevert() {
      if (!session.commandState('file.revert').enabled || composingNow()) return;
      const answer = typeof root.showSystemModal === 'function'
        ? await root.showSystemModal(tr('clio_stage_native_revert_confirm', opts.fileName || ''), 'confirm', { defaultAction: 'cancel', confirmKey: 'clio_stage_native_revert_button', danger: true })
        : 'cancel';
      if (answer !== 'yes') return;
      abandonComposition();   // the revert replaces the model under any open composition
      await session.revert();
      refreshWindoid();
      refreshMenus();
    }
    // mark: the selection a pop-up was opened on. A command from the menu bar reads the selection now.
    function runFormat(id, mark) {
      if (session.composing) return null;
      if (mark) session.setCaret(mark);
      else syncCaret();
      const before = session.caret;
      const out = session.format(id);
      refreshMenus();
      if (out.status === 'ok') {
        // Verify after: the command leaves the selection where it found it.
        if (!restoreSelection(before)) E.restoreDom(true);
        syncCaret();
        focusDocument();
      }
      return out;
    }
    function travel(direction) {
      if (session.composing) return false;
      const moved = session.editHistory[direction]();
      // Under the first-save list the list itself is the answer; otherwise say there is nothing to take back.
      if (!moved && !session.confirming && !systemModalOpen()) session.setReceipt(direction === 'undo' ? 'clio_write_nothing_to_undo' : 'clio_write_nothing_to_redo', 'info');
      refreshMenus();
      return moved;
    }
    function runCommand(id, mark) {
      if (id === 'file.save') return runSave();
      if (id === 'file.revert') return runRevert();
      if (id === 'view.mode') return toggleMode();
      if (id === 'view.mode.express') return setMode('express');
      if (id === 'view.mode.full') return setMode('full');
      if (id === 'comments.open') return openComments();
      if (id === 'edit.undo') return travel('undo');
      if (id === 'edit.redo') return travel('redo');
      if (id.startsWith('format.')) return runFormat(id, mark);
      return null;
    }
    // The upstream layer's own command names (L.ui.exec), mapped onto ours.
    const EXEC = Object.freeze({ undo: 'edit.undo', redo: 'edit.redo', bold: 'format.bold', italic: 'format.italic', underline: 'format.underline', save: 'file.save' });
    function exec(name) { const id = EXEC[name]; if (id) runCommand(id); }

    /* -- comments windoid (⌘M): read, add, reply, resolve -- */
    function openComments() {
      if (!session.commentsAvailable()) return;
      syncCaret();
      if (windoid) { windoid.refresh(); return; }
      let draft = '';
      let replyingTo = null;
      let note = '';
      const handle = createWindoid(doc, c.pane, { title: tr('clio_comments_title'), className: 'cw-comments-windoid', onClose: () => { if (windoid && windoid.handle === handle) windoid = null; } });
      const el = (tag, className, text) => h(doc, tag, { class: className, text });
      function write(action) {
        let out;
        if (session.confirming || systemModalOpen()) out = { status: 'blocked', code: session.confirming ? 'CONFIRM_OPEN' : 'DIALOG_OPEN' };
        else try { out = action(); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
        if (isBlocked(out)) note = tr('clio_comments_failed', tr(REFUSAL_KEYS[out.code] || '') || String(out.message || out.code || ''));
        else { note = ''; draft = ''; replyingTo = null; session.noteExternalEdit(); }
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
      function draw() {
        const adapter = session.adapter;
        handle.body.textContent = '';
        let list = [];
        try { list = adapter.comments() || []; } catch (error) { note = tr('clio_comments_failed', String(error && error.message || error)); }
        handle.setTitle(list.length ? tr('clio_comments_title_count', list.length) : tr('clio_comments_title'));
        const caret = session.caret;   // the bookmark a new comment is anchored to (checked again on submit)
        if (replyingTo == null) {
          let placeholder = tr('clio_write_comment_pick');
          if (caret && !caret.table && !caret.other) {
            const p = session.paragraph(caret.paragraphId);
            const quote = p && !caret.collapsed && caret.paragraphs === 1 ? p.text.slice(caret.from, caret.to) : '';
            placeholder = quote ? tr('clio_write_comment_on_range', quote.length > 16 ? quote.slice(0, 16) + '…' : quote) : tr('clio_write_comment_on_paragraph');
          }
          handle.body.append(composer(placeholder, tr('clio_comments_add'), (text) => write(() => session.addComment(text, caret))));
        }
        if (note) { const alert = el('p', 'windoid-note', note); alert.setAttribute('role', 'alert'); handle.body.append(alert); }
        if (!list.length) handle.body.append(el('p', 'windoid-empty', tr('clio_write_comments_empty')));
        const ul = h(doc, 'ul', { class: 'windoid-threads' });
        for (const { item, replies } of groupComments(list)) {
          const box = h(doc, 'li', { class: 'windoid-thread', dataset: { commentId: String(item.id) } });
          for (const entry of [item, ...replies]) {
            const head = h(doc, 'div', { class: 'windoid-comment-head' }, [el('span', 'windoid-author', entry.author || tr('clio_comments_author_unknown'))]);
            if (entry === item) head.append(el('span', 'windoid-anchor', entry.anchor && entry.anchor.quote ? `「${entry.anchor.quote}」` : tr('clio_comments_orphans')));
            if (entry.date) head.append(el('span', 'windoid-date', String(entry.date).slice(0, 10)));
            if (entry === item && entry.done) head.append(el('span', 'windoid-done', tr('clio_comments_done')));
            box.append(h(doc, 'div', { class: 'windoid-comment' + (entry === item ? '' : ' is-reply') }, [head, el('div', 'windoid-text', entry.text || '')]));
          }
          if (replyingTo === item.id) {
            box.append(composer(tr('clio_comments_reply_placeholder'), tr('clio_comments_reply_send'),
              (text) => write(() => adapter.replyComment(item.id, { author: tr('clio_comments_author_default'), text, date: new Date().toISOString() })),
              () => { replyingTo = null; draft = ''; draw(); }));
          } else {
            const actions = h(doc, 'div', { class: 'windoid-actions' });
            if (fn(adapter, 'replyComment')) {
              const reply = h(doc, 'button', { type: 'button', class: 'btn windoid-reply', text: tr('clio_comments_reply') });
              reply.addEventListener('click', () => { replyingTo = item.id; draft = ''; draw(); });
              actions.append(reply);
            }
            if (fn(adapter, 'setCommentDone')) {
              const done = h(doc, 'button', { type: 'button', class: 'btn', text: tr(item.done ? 'clio_write_comment_reopen' : 'clio_write_comment_resolve') });
              done.addEventListener('click', () => write(() => adapter.setCommentDone(item.id, !item.done)));
              actions.append(done);
            }
            if (actions.childNodes.length) box.append(actions);
          }
          ul.append(box);
        }
        if (list.length) handle.body.append(ul);
        if (list.some((item) => item.parentId == null && !item.anchor)) handle.body.append(el('p', 'windoid-hint', tr('clio_write_comments_orphans_hint')));
        handle.place();
      }
      windoid = { handle, refresh: () => { replyingTo = null; note = ''; draw(); } };
      draw();
      handle.body.querySelector('textarea')?.focus();
    }
    function refreshWindoid() { if (windoid) windoid.refresh(); }

    /* -- first-save list and failure alert -- */
    // The codec's kinds (quire-adapter lossKind) in the writer's words; its own detail is English.
    const LOSS_KINDS = Object.freeze({
      object: 'clio_write_lost_kind_object',
      range: 'clio_write_lost_kind_range',
      part: 'clio_write_lost_kind_part',
      signature: 'clio_write_lost_kind_signature',
      formatting: 'clio_write_lost_kind_formatting',
      content: 'clio_write_lost_kind_content',
    });
    const LOSS_SUBJECTS = Object.freeze({
      'table-widths': () => tr('clio_write_loss_table_widths'),
      bookmark: () => tr('clio_write_loss_bookmark'),
      bookmarks: (item) => tr('clio_write_loss_bookmarks', Number(item.count) || 0),
    });
    const PART_PLACES = Object.freeze({ header: 'clio_write_loss_at_header', footer: 'clio_write_loss_at_footer', footnotes: 'clio_write_loss_at_footnotes', endnotes: 'clio_write_loss_at_endnotes', comments: 'clio_write_loss_at_comments' });
    // Where in the file, in the writer's words: the paragraph's number and its first words, a table, a named part.
    function lossPlace(item) {
      const place = item && item.place;
      // An item the codec ties to no one place applies to the whole document, and says so.
      if (!place) return tr('clio_write_loss_at_document');
      if (place.type === 'paragraph') return tr('clio_write_loss_at_paragraph', place.n, place.quote || '');
      if (place.type === 'table') return tr('clio_write_loss_at_table');
      if (place.type === 'part' && PART_PLACES[place.part]) return tr(PART_PLACES[place.part]);
      return '';
    }
    function lossLine(item) {
      const what = lossName(item);
      const where = lossPlace(item);
      return where ? tr('clio_write_loss_line', where, what) : what;
    }
    function lossName(item) {
      if (item.subject && LOSS_SUBJECTS[item.subject]) return LOSS_SUBJECTS[item.subject](item);
      const kind = String(item.kind || item.what || '');
      if (Object.prototype.hasOwnProperty.call(LOSS_KINDS, kind)) return tr(LOSS_KINDS[kind]);
      const text = String(item.detail || item.what || '');
      return text && /[^\x00-\x7f]/.test(text) ? text : tr('clio_write_lost_kind_other');
    }
    function confirmList(report) {
      return new Promise((resolve) => {
        const items = (list) => {
          const shown = list.slice(0, 6).map((item) => h(doc, 'li', { text: lossLine(item) }));
          if (list.length > 6) shown.push(h(doc, 'li', { text: tr('clio_stage_native_first_save_more', list.length - 6) }));
          return h(doc, 'ul', {}, shown);
        };
        const titleId = `cw-first-save-${Date.now().toString(36)}`;
        const cancel = h(doc, 'button', { type: 'button', class: 'btn default', dataset: { choice: 'cancel' }, text: tr('cancel') });
        const store = h(doc, 'button', { type: 'button', class: 'btn', dataset: { choice: 'save' }, text: tr('clio_stage_native_cmd_save') });
        const dialog = h(doc, 'div', { class: 'cw-alert', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
          h(doc, 'div', { class: 'cw-alert-in' }, [
            h(doc, 'b', { id: titleId, text: tr('clio_stage_native_first_save_title', opts.fileName || '') }),
            report.converted.length ? h(doc, 'p', { text: tr('clio_stage_native_first_save_converted', report.converted.length) }) : null,
            report.converted.length ? items(report.converted) : null,
            report.lost.length ? h(doc, 'p', { text: tr('clio_stage_native_first_save_lost', report.lost.length) }) : null,
            report.lost.length ? items(report.lost) : null,
            h(doc, 'p', { class: 'cw-alert-note', text: tr('clio_stage_native_first_save_note') }),
            h(doc, 'div', { class: 'cw-alert-row' }, [cancel, store]),
          ]),
        ]);
        c.layer.replaceChildren(dialog);
        c.layer.hidden = false;
        const done = (choice) => {
          if (pendingConfirm && pendingConfirm.dialog === dialog) pendingConfirm = null;
          dialog.remove();
          c.layer.hidden = true;
          if (!disposed) focusDocument();
          resolve(choice);
        };
        pendingConfirm = { dialog, done };
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

    /* -- the ruler (full editing): the file's margins and this paragraph's indents, shown, not dragged -- */
    function drawRuler() {
      const sect = (D.doc && D.doc.sect) || {};
      const width = Number(sect.pgW) || 612;
      const left = Number(sect.ml) || 0;
      const right = Number(sect.mr) || 0;
      const pct = (pt) => `${Math.max(0, Math.min(100, (pt / width) * 100))}%`;
      let ind = { l: 0, fl: 0, r: 0 };
      const p = E.sel && E.sel.f && E.sel.f.p;
      if (p && placeOf(D, D.doc, p) === 'body') { try { ind = Object.assign(ind, D.pProps(D.doc, p, null).ind || {}); } catch (error) { /* body indents */ } }
      const strip = c.strip;
      strip.style.setProperty('--cw-margin-left', pct(left));
      strip.style.setProperty('--cw-margin-right', pct(width - right));
      strip.style.setProperty('--cw-indent-left', pct(left + (Number(ind.l) || 0)));
      strip.style.setProperty('--cw-indent-first', pct(left + (Number(ind.l) || 0) + (Number(ind.fl) || 0)));
      strip.style.setProperty('--cw-indent-right', pct(width - right - (Number(ind.r) || 0)));
      const cm = (pt) => (pt / 72 * 2.54).toFixed(1);
      strip.setAttribute('aria-label', tr('clio_write_ruler_label', cm(left), cm(right)));
      if (!strip.firstChild) strip.append(h(doc, 'i', { class: 'cw-mark is-margin-left' }), h(doc, 'i', { class: 'cw-mark is-margin-right' }), h(doc, 'i', { class: 'cw-mark is-indent-first' }), h(doc, 'i', { class: 'cw-mark is-indent-left' }), h(doc, 'i', { class: 'cw-mark is-indent-right' }));
    }

    /* -- the chrome around the document -- */
    const setPopLabel = (button, text) => { button.firstChild.textContent = text; };
    function render() {
      if (disposed) return;
      const express = session.mode === 'express';
      c.win.dataset.mode = session.mode;
      c.win.dataset.receiptKind = session.receipt.kind;
      c.win.dataset.dirty = String(session.isDirty());
      c.receiptEl.textContent = session.receiptText() || tr('clio_write_receipt_clean');
      c.fileEl.textContent = opts.fileName || '';
      setPopLabel(c.modeBtn, tr(express ? 'clio_write_mode_express' : 'clio_write_mode_full'));
      setPopLabel(c.cmdBtn, tr('clio_stage_native_commands'));
      if (c.titleEl) c.titleEl.textContent = express ? 'ClioWrite Express' : 'ClioWrite';
      c.ruler.hidden = express;
      if (!express) {
        const level = session.headingLevel();
        setPopLabel(c.styleBtn, tr(level ? `clio_write_style_heading_${level}` : 'clio_write_style_body'));
        const list = session.listKind();
        setPopLabel(c.listBtn, tr(list === 'bullet' ? 'clio_write_bullets' : list === 'number' ? 'clio_write_numbering' : 'clio_write_no_list'));
        const ready = session.commandState('format.heading.0').enabled;
        c.styleBtn.setAttribute('aria-disabled', String(!ready));
        c.listBtn.setAttribute('aria-disabled', String(!ready));
        drawRuler();
      }
      c.captionEl.textContent = [
        tr(express ? 'clio_write_caption_express' : 'clio_write_caption_full'),
        tr('clio_write_caption_flow', session.wordCount()),
      ].join(' · ');
    }

    // A ruler pop-up's rows act on the selection the pop-up was opened on (S11-C8).
    const formatItem = (id, labelKey, extra = {}, mark = session.caret) => {
      const state = session.commandState(id);
      return { id, label: tr(labelKey), enabled: state.enabled, reason: state.reason, run: () => runCommand(id, mark), ...extra };
    };

    /* -- wiring -- */
    on(c.modeBtn, 'click', () => openMenu(c.modeBtn, [
      { id: 'view.mode.express', label: tr('clio_write_mode_express'), shortcut: '⌘E', checked: session.mode === 'express', run: () => setMode('express') },
      { id: 'view.mode.full', label: tr('clio_write_mode_full'), checked: session.mode === 'full', run: () => setMode('full') },
    ], 'clio_stage_native_menu_mode'));
    on(c.cmdBtn, 'click', () => openMenu(c.cmdBtn, session.commands().filter((command) => !command.id.startsWith('format.')).map((command) => ({
      id: command.id, label: tr(command.labelKey), shortcut: command.shortcut, checked: command.checked,
      enabled: command.state.enabled, reason: command.state.reason, run: () => runCommand(command.id),
    })), 'clio_stage_native_menu_commands'));
    on(c.styleBtn, 'mousedown', (event) => event.preventDefault());
    on(c.styleBtn, 'click', () => {
      syncCaret();
      const level = session.headingLevel();
      openMenu(c.styleBtn, [1, 2, 3, 0].map((n) => formatItem(`format.heading.${n}`, n ? `clio_write_style_heading_${n}` : 'clio_write_style_body', { checked: level === n })), 'clio_write_menu_style');
    });
    on(c.listBtn, 'mousedown', (event) => event.preventDefault());
    on(c.listBtn, 'click', () => {
      syncCaret();
      const kind = session.listKind();
      openMenu(c.listBtn, [
        formatItem('format.list.none', 'clio_write_no_list', { checked: kind === 'none' }),
        formatItem('format.list.bullet', 'clio_write_bullets', { checked: kind === 'bullet' }),
        formatItem('format.list.number', 'clio_write_numbering', { checked: kind === 'number' }),
      ], 'clio_write_menu_list');
    });

    // The gate, ahead of the upstream editor's own listeners on its host (capture phase).
    const INPUT_KINDS = Object.freeze({
      insertText: 'text', insertReplacementText: 'text',
      insertParagraph: 'split', insertLineBreak: 'line',
      deleteContentBackward: 'backward', deleteContentForward: 'forward',
      deleteWordBackward: 'word-backward', deleteWordForward: 'word-forward',
      deleteSoftLineBackward: 'delete', deleteHardLineBackward: 'delete', deleteSoftLineForward: 'delete', deleteHardLineForward: 'delete', deleteContent: 'delete', deleteByCut: 'delete',
    });
    const FORMAT_INPUTS = Object.freeze({ formatBold: 'format.bold', formatItalic: 'format.italic', formatUnderline: 'format.underline' });
    // Menu Paste reaches the editor as beforeinput insertText (execCommand), not as a paste event.
    // Both go through here: Express keeps the text in one paragraph, full editing splits at lines.
    function pastePlain(event, raw, label) {
      let text = String(raw || '').replace(/\r\n?/g, '\n');
      if (!text) return;
      let flattened = false;
      if (session.mode !== 'full' && text.includes('\n')) { text = text.replace(/\s*\n+\s*/g, ' ').trim(); flattened = true; }
      if (!text) return;
      if (gated(event, text.includes('\n') ? 'split' : 'text')) return;
      E.insertTextAt(text, label);
      if (flattened) session.setReceipt('clio_write_receipt_paste_flattened', 'info');
    }
    const dataOf = (event) => {
      if (event.data != null) return String(event.data);
      try { return event.dataTransfer ? event.dataTransfer.getData('text/plain') : ''; } catch (error) { return ''; }
    };
    on(scroller, 'beforeinput', (event) => {
      const type = event.inputType;
      // A held compositionend lands before the next input (it never waits behind a keystroke).
      if (pendingEnd && !/Composition/.test(type)) settleEnd();
      // Never during an input method's composition (S11-C8): the editor commits it at compositionend.
      if (session.composing || E.composing || /Composition/.test(type)) return;
      if (systemModalOpen()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      ownDoc();
      if (type === 'historyUndo' || type === 'historyRedo') { event.preventDefault(); event.stopImmediatePropagation(); travel(type === 'historyUndo' ? 'undo' : 'redo'); return; }
      if (FORMAT_INPUTS[type]) { event.preventDefault(); event.stopImmediatePropagation(); runCommand(FORMAT_INPUTS[type]); return; }
      const kind = INPUT_KINDS[type];
      if (!kind) return;
      if ((type === 'insertText' || type === 'insertReplacementText') && /[\r\n]/.test(dataOf(event))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pastePlain(event, dataOf(event), 'Paste');
        return;
      }
      gated(event, kind);
    }, true);
    on(scroller, 'keydown', (event) => {
      const k = event.key;
      // Safari ends a composition (compositionend) and THEN delivers the Enter that confirmed the
      // candidate: keyCode 229, isComposing already false. It confirmed text; it is not a new line.
      if (k === 'Enter' && event.keyCode === 229 && !event.isComposing && Date.now() - lastCompositionEnd < 500) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (pendingEnd && !event.isComposing && event.keyCode !== 229) settleEnd();
      if (event.isComposing || event.keyCode === 229 || session.composing) return;
      // A system dialog (the close box's three choices) owns the keys: nothing here acts behind it.
      if (systemModalOpen()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      ownDoc();
      if (commandKey(event) && !event.altKey) {
        const id = keyCommand(session, event);
        if (id) { event.preventDefault(); event.stopImmediatePropagation(); runCommand(id); return; }
      }
      const chord = event.ctrlKey || event.metaKey;
      if (k === 'Tab') { event.stopImmediatePropagation(); return; }   // focus moves on; no tab characters, no indent
      // A selected picture or floating object is never moved: the arrow keys would nudge it.
      if (E.objSel && /^Arrow/.test(k)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      // Overwrite mode would type over what follows the caret, a picture included.
      if (k === 'Insert' && !chord && !event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); E.overtype = false; return; }
      let kind = '';
      if (k === 'Enter') kind = chord ? 'break' : event.shiftKey ? 'line' : 'split';
      else if (k === ' ' && chord && event.shiftKey) kind = 'text';   // upstream types a space straight into the model
      else if (k === 'Backspace') {
        // Option+Backspace deletes the word before the caret on macOS; it is not Undo.
        if (event.altKey) {
          if (!gated(event, 'word-backward')) { event.preventDefault(); event.stopImmediatePropagation(); E.backspace(true); }
          return;
        }
        kind = chord ? 'word-backward' : 'backward';
      } else if (k === 'Delete') kind = chord ? 'word-forward' : event.shiftKey ? 'delete' : 'forward';
      if (kind) gated(event, kind);
    }, true);
    // Paste is plain text into the model; Express keeps it inside one paragraph.
    on(scroller, 'paste', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (session.composing) return;
      let text = '';
      try { text = event.clipboardData ? event.clipboardData.getData('text/plain') : ''; } catch (error) { text = ''; }
      pastePlain(event, text, 'Paste');
    }, true);
    on(scroller, 'cut', (event) => { ownDoc(); gated(event, 'delete'); }, true);
    on(scroller, 'drop', (event) => refuseEvent(event, 'DROP'), true);
    on(scroller, 'dragstart', (event) => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
    // Pictures, shapes, floating objects, their resize handles and form check boxes are shown,
    // never edited: a press on one would select it, a handle drag would resize it, a click
    // on a check box would tick it, all straight into the model.
    const OBJECT_PARTS = '.img, .shp, .flt, .obj-handles, .oh, .ffcb, [data-control]';
    const objectPress = (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function' || !target.closest(OBJECT_PARTS)) { if (event.type === 'mousedown' || event.type === 'pointerdown') pictureHeld = false; return; }
      ownDoc();
      // The press is swallowed, so the caret stays where it was (maybe in a table): what is typed
      // next was aimed at the picture, and the refusal names the picture.
      pictureHeld = true;
      event.stopImmediatePropagation();
      if (target.closest('.obj-handles, .oh, .ffcb, [data-control]')) event.preventDefault();
    };
    for (const type of ['mousedown', 'pointerdown', 'click', 'dblclick']) on(scroller, type, objectPress, true);
    // A caret key or a touch elsewhere ends the picture press even when the selection lands where it was.
    on(scroller, 'keydown', (event) => { if (/^(Arrow|Home$|End$|Page)/.test(event.key)) pictureHeld = false; }, true);
    on(scroller, 'touchstart', (event) => { if (!event.target?.closest?.(OBJECT_PARTS)) pictureHeld = false; }, true);
    // A composition that starts somewhere it may not land is left to the browser and
    // discarded after it ends: nothing is rebuilt while the input method is open. The editor
    // is told it is composing either way, so a selectionchange cannot re-read the DOM the
    // input method is drawing into and move the caret.
    on(scroller, 'compositionstart', (event) => {
      if (pendingEnd) settleEnd();
      ownDoc();
      orphanComposition = false;
      session.composing = true;
      const caret = selectionNow();
      const verdict = session.confirming ? { allow: false, code: 'CONFIRM_OPEN' }
        : systemModalOpen() ? { allow: false, code: 'DIALOG_OPEN' }
          : E.objSel ? { allow: false, code: 'READ_ONLY_IMAGE' } : gateInput(session.mode, 'text', caret);
      if (!verdict.allow) { blockedComposition = verdict.code; E.composing = true; event.stopImmediatePropagation(); }
    }, true);
    // Chrome ends a composition on blur by firing compositionend (with its data) and THEN
    // focusout, in the same task. So an allowed compositionend is held until that task is over
    // and handed on to the editor only if no blur came with it (S11-C8: a blur commits nothing).
    function settleEnd() {
      const held = pendingEnd;
      pendingEnd = null;
      if (!held || disposed) return;
      clearTimeout(held.timer);
      if (held.blurred) return;   // abandonComposition already threw the drawn text away
      session.composing = false;
      const Ctor = (doc.defaultView && doc.defaultView.CompositionEvent) || root.CompositionEvent;
      const replay = typeof Ctor === 'function' ? new Ctor('compositionend', { data: held.data, bubbles: true }) : null;
      if (!replay) { E.composing = false; redraw(); return; }
      ownDoc();
      replayingEnd = true;
      try { LY.root.dispatchEvent(replay); } finally { replayingEnd = false; }
    }
    on(scroller, 'compositionend', (event) => {
      if (replayingEnd) return;
      lastCompositionEnd = Date.now();
      if (orphanComposition) { session.composing = false; orphanComposition = false; event.stopImmediatePropagation(); return; }
      if (!blockedComposition) {
        // Still composing (session and editor) until it settles: nothing re-reads the drawn DOM meanwhile.
        event.stopImmediatePropagation();
        if (pendingEnd) settleEnd();
        pendingEnd = { data: event.data == null ? '' : String(event.data), blurred: false, timer: 0 };
        pendingEnd.timer = setTimeout(settleEnd, 0);
        return;
      }
      session.composing = false;
      const code = blockedComposition;
      blockedComposition = false;
      E.composing = false;
      event.stopImmediatePropagation();
      setTimeout(() => { redraw(); session.refuse(code); }, 0);
    }, true);
    on(scroller, 'focusout', () => abandonComposition(), true);
    if (typeof ResizeObserver === 'function') {
      let width = scroller.clientWidth;
      resizeObserver = new ResizeObserver(() => {
        if (windoid) windoid.handle.place();
        // The flow follows the window's width; never while an input method is composing.
        if (Math.abs(scroller.clientWidth - width) > 1 && !session.composing && !E.composing) { width = scroller.clientWidth; redraw(); }
      });
      resizeObserver.observe(scroller);
    }

    let offSession = () => {};
    function teardown() {
      if (disposed) return;
      disposed = true;
      closeMenu();
      // The upstream editor is shared by the next document: leave it with no composition and no list pending.
      session.composing = false;
      E.composing = false;
      blockedComposition = false;
      orphanComposition = false;
      if (pendingEnd) { clearTimeout(pendingEnd.timer); pendingEnd = null; }
      if (pendingConfirm) pendingConfirm.done('cancel');
      c.layer.hidden = true;
      c.layer.replaceChildren();
      if (windoid) { try { windoid.handle.close(); } catch (error) { /* already gone */ } windoid = null; }
      if (resizeObserver) resizeObserver.disconnect();
      offSession();
      cleanups.splice(0).forEach((off) => { try { off(); } catch (error) { /* gone */ } });
      E.sel = null;
      E.objSel = null;
      LY.root.contentEditable = 'false';
      LY.root.textContent = '';
      scroller.hidden = true;
      c.ruler.hidden = true;
      delete c.win.dataset.mode;
      delete c.win.dataset.dirty;
      delete c.win.dataset.receiptKind;
    }

    c.emptyEl.hidden = true;
    scroller.hidden = false;
    try {
      bindDocument(session.adapter);
      offSession = session.subscribe(render);
      syncCaret();
      render();
    } catch (error) {
      teardown();
      throw error;
    }

    return {
      exec,
      runCommand,
      runSave,
      syncCaret,
      confirmList,
      alertFailure,
      render,
      own: ownDoc,
      composingNow,
      menuOpen: () => !!openedMenu,
      focus: focusDocument,
      rebind(adapter) { bindDocument(adapter); syncCaret(); refreshWindoid(); },
      afterHistory: () => { refreshWindoid(); refreshMenus(); },
      unmount: teardown,
    };
  }

  function keyCommand(session, event) {
    const key = String(event.key || '').toLowerCase();
    if (event.shiftKey) return key === 'z' ? 'edit.redo' : '';
    if (key === 'e') return 'view.mode';
    if (key === 's') return 'file.save';
    if (key === 'z') return 'edit.undo';
    if (key === 'y') return 'edit.redo';
    if (key === 'm' && session.commentsAvailable()) return 'comments.open';
    if (key === 'b') return 'format.bold';
    if (key === 'i') return 'format.italic';
    if (key === 'u') return 'format.underline';
    return '';
  }

  /* ---------------------------------------------- empty window and the API */

  let active = null;   // { record, mountedName, fileName, session, surface }
  let opening = null;

  function drawEmpty() {
    const win = installWindow();
    if (!win) return;
    const c = buildChrome(win);
    if (active) return;
    c.emptyEl.hidden = false;
    c.scroller.hidden = true;
    c.ruler.hidden = true;
    c.receiptEl.textContent = '';
    c.fileEl.textContent = '';
    c.modeBtn.hidden = true;
    c.cmdBtn.hidden = true;
    if (c.titleEl) c.titleEl.textContent = 'ClioWrite';
    c.emptyEl.replaceChildren(h(c.doc, 'b', { text: tr('clio_write_empty_title') }), h(c.doc, 'p', { text: tr('clio_write_empty_body') }));
    c.captionEl.textContent = tr('clio_write_empty_caption');
  }

  const nativeHost = () => root.AISystem6ClioWorks;
  function hostCalls() {
    return {
      save: fn(nativeHost(), 'saveNativeDocument') ? (name) => nativeHost().saveNativeDocument(name) : (async () => ({ ok: false, reason: 'unavailable' })),
      revert: fn(nativeHost(), 'revertNativeDocument') ? (name) => nativeHost().revertNativeDocument(name) : undefined,
    };
  }

  async function openDocument(record, meta = {}) {
    if (opening) await opening.catch(() => null);
    const run = openNow(record, meta);
    opening = run;
    try { return await run; } finally { if (opening === run) opening = null; }
  }

  async function openNow(record, meta) {
    const adapter = record && record.liveAdapter;
    if (!adapter || !fn(adapter, 'document') || !fn(adapter, 'paragraphs')) return { ok: false, reason: 'no-adapter' };
    const mountedName = meta.mountedName || record.mountedName || '';
    const fileName = meta.fileName || record.fileName || mountedName;
    // One session per file (S11-18): a second open brings the first forward.
    if (active && active.mountedName === mountedName) {
      if (typeof root.openWindow === 'function') await root.openWindow('clioWrite');
      active.surface.focus();
      return { ok: true, reason: 'focused' };
    }
    if (active) {
      const answer = await closeDocument();
      if (answer === 'cancelled') {
        // The other file's adapter has bound the shared model since; this window's document is still the one on screen.
        if (active) active.surface.own();
        return { ok: false, reason: 'cancelled' };
      }
    }
    if (typeof root.openWindow === 'function') await root.openWindow('clioWrite');
    const win = installWindow();
    if (!win) return { ok: false, reason: 'no-window' };
    const c = buildChrome(win);
    let ed;
    try { ed = await ensureEditor(c); } catch (error) { console.warn('ClioWrite: editor', error); return { ok: false, reason: 'editor-unavailable' }; }

    const entry = { record, mountedName, fileName, session: null, surface: null };
    const session = createSession(adapter, {
      fileName,
      mountedName,
      host: hostCalls(),
      readAdapter: () => record.liveAdapter,
      confirmList: (report) => entry.surface.confirmList(report),
      alertFailure: (result) => entry.surface.alertFailure(result),
      onHistory: () => entry.surface && entry.surface.afterHistory(),
      onRebind: (next) => entry.surface && entry.surface.rebind(next),
      dialogOpen: () => !!(c.doc.body && c.doc.body.classList && c.doc.body.classList.contains('has-system-modal')),
    });
    entry.session = session;
    c.modeBtn.hidden = false;
    c.cmdBtn.hidden = false;
    try {
      entry.surface = mountSurface(c, ed, session, { fileName });
    } catch (error) {
      session.close();
      console.warn('ClioWrite: mount', error);
      drawEmpty();
      return { ok: false, reason: 'mount-failed' };
    }
    active = entry;
    session.subscribe(syncMenuMarks);
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
    drawEmpty();
    if (typeof root.updateMenuState === 'function') { try { root.updateMenuState(); } catch (error) { /* next redraw */ } }
  }

  /** Three choices, default Cancel, Esc = Cancel. Never closes silently over unsaved work. */
  async function closeDocument() {
    const entry = active;
    if (!entry) return 'clean';
    if (entry.surface.composingNow() || entry.session.saving) return 'cancelled';
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

  /* ------------------------------------------------- the desk's menu bar */
  // action -> [command id, key shown in the menu, label key]
  const MENU_COMMANDS = Object.freeze({
    'clio-write-save': ['file.save', 's', 'clio_stage_native_cmd_save'],
    'clio-write-revert': ['file.revert', '', 'clio_stage_native_cmd_revert'],
    'clio-write-undo': ['edit.undo', 'z', 'undo'],
    'clio-write-redo': ['edit.redo', 'y', 'redo'],
    'clio-write-comment': ['comments.open', 'm', 'clio_stage_native_cmd_comment'],
    'clio-write-mode-express': ['view.mode.express', 'e', 'clio_write_mode_express'],
    'clio-write-mode-full': ['view.mode.full', '', 'clio_write_mode_full'],
    'clio-write-heading-1': ['format.heading.1', '', 'clio_write_style_heading_1'],
    'clio-write-heading-2': ['format.heading.2', '', 'clio_write_style_heading_2'],
    'clio-write-heading-3': ['format.heading.3', '', 'clio_write_style_heading_3'],
    'clio-write-body': ['format.heading.0', '', 'clio_write_style_body'],
    'clio-write-bold': ['format.bold', 'b', 'clio_write_bold'],
    'clio-write-italic': ['format.italic', 'i', 'clio_write_italic'],
    'clio-write-underline': ['format.underline', 'u', 'clio_write_underline'],
    'clio-write-bullets': ['format.list.bullet', '', 'clio_write_bullets'],
    'clio-write-numbering': ['format.list.number', '', 'clio_write_numbering'],
  });
  const baseId = (commandId) => (commandId.startsWith('view.mode') ? 'view.mode' : commandId);
  const listed = (commandId) => !!active && (commandId.startsWith('edit.') || active.session.commands().some((command) => command.id === baseId(commandId)));

  function syncMenuMarks() {
    if (!active || !root.document) return;
    const s = active.session;
    const level = s.headingLevel();
    const list = s.listKind();
    const marks = {
      'clio-write-mode-express': s.mode === 'express', 'clio-write-mode-full': s.mode === 'full',
      'clio-write-heading-1': level === 1, 'clio-write-heading-2': level === 2, 'clio-write-heading-3': level === 3, 'clio-write-body': level === 0,
      'clio-write-bullets': list === 'bullet', 'clio-write-numbering': list === 'number',
    };
    for (const [action, value] of Object.entries(marks)) {
      root.document.querySelectorAll(`[data-app-menu] [data-action="${action}"]`).forEach((button) => button.classList.toggle('is-checked', !!value));
    }
    // Edit › Undo names the step it takes back (「撤销键入」).
    for (const [action, getter, plain] of [['clio-write-undo', 'undoLabel', 'undo'], ['clio-write-redo', 'redoLabel', 'redo']]) {
      const step = s.editHistory[getter]();
      const text = step ? tr(`${plain}_step`, tr(step)) : tr(plain);
      root.document.querySelectorAll(`[data-app-menu] [data-action="${action}"]`).forEach((row) => {
        if (!(typeof writeShortcutRowLabel === 'function' && writeShortcutRowLabel(row, text))) row.textContent = text;
      });
    }
  }
  const menuCommand = (commandId) => ({
    handler: () => (active ? active.surface.runCommand(commandId) : null),
    isAvailable: () => {
      syncMenuMarks();
      if (!active || !listed(commandId)) return false;
      if (commandId.startsWith('view.mode.')) return !active.session.composing;
      return active.session.commandState(commandId).enabled;
    },
    unavailableReason: () => (active ? active.session.commandState(baseId(commandId)).reason || '' : tr('clio_write_reason_no_document')),
  });

  const menuRow = (action) => ({ type: 'item', action, labelKey: MENU_COMMANDS[action][2], conditionId: action, ...(MENU_COMMANDS[action][1] ? { shortcutId: action } : {}) });
  const sep = { type: 'separator' };
  const editRow = (action, labelKey, shortcutId) => ({ type: 'item', action, labelKey, conditionId: action, ...(shortcutId ? { shortcutId } : {}) });
  function menuDefinitions() {
    return [
      { id: 'file', labelKey: 'menu_file', items: [menuRow('clio-write-save'), menuRow('clio-write-revert'), sep, editRow('close-active-window', 'close', 'close-window')] },
      { id: 'edit', labelKey: 'menu_edit', items: [menuRow('clio-write-undo'), menuRow('clio-write-redo'), sep, editRow('cut', 'cut', 'cut'), editRow('copy', 'copy', 'copy'), editRow('paste', 'paste', 'paste'), editRow('select-all', 'select_all', 'select-all'), sep, menuRow('clio-write-comment')] },
      { id: 'view', labelKey: 'menu_view', items: [menuRow('clio-write-mode-express'), menuRow('clio-write-mode-full')] },
      { id: 'format', labelKey: 'menu_format', items: [menuRow('clio-write-heading-1'), menuRow('clio-write-heading-2'), menuRow('clio-write-heading-3'), menuRow('clio-write-body'), sep, menuRow('clio-write-bold'), menuRow('clio-write-italic'), menuRow('clio-write-underline'), sep, menuRow('clio-write-bullets'), menuRow('clio-write-numbering')] },
      ...(typeof windowMenu === 'function' ? [windowMenu()] : []),
    ];
  }

  // Focus outside the document (the title bar, the status bar) still reaches the keys
  // while ClioWrite is in front. Capture phase, so the desk's Minimize (⌘M) finds the
  // event handled; never while an input method is composing.
  const writeWindowInFront = () => {
    const win = root.document && root.document.querySelector('.window.is-active[data-window]');
    return !!win && win.dataset.window === 'clioWrite';
  };
  if (root.document && fn(root.document, 'addEventListener')) {
    root.document.addEventListener('keydown', (event) => {
      if (!active || event.defaultPrevented || event.isComposing || event.keyCode === 229 || active.session.composing) return;
      if (!commandKey(event) || event.altKey) return;
      if (root.document.body && root.document.body.classList.contains('has-system-modal')) return;
      if (!writeWindowInFront()) return;
      const target = event.target;
      if (target && target.closest && target.closest('.cw-scroller, textarea, input')) return;
      const id = keyCommand(active.session, event);
      if (!id || id.startsWith('format.')) return;
      event.preventDefault();
      active.surface.runCommand(id);
    }, true);
  }

  root.AISystem6ClioWrite = Object.freeze({
    open: openDocument,
    close: closeDocument,
    attach: drawEmpty,
    current: () => (active ? { mountedName: active.mountedName, mode: active.session.mode, dirty: active.session.isDirty() } : null),
    hasUnsaved: () => !!active && active.session.isDirty(),
    // The Edit menu's history while a document is mounted (registerEditHistory below).
    editHistory: () => (active ? active.session.editHistory : null),
    listed,
    commandState: (commandId) => (active ? active.session.commandState(baseId(commandId)) : null),
    createSession,
    describe,
    gateInput,
    stepKey,
    groupComments,
  });
  root.AISystem6ClioWriteLoaded = true;

  // Desk registrations, each guarded: a bare test context has none of them.
  if (typeof registerEditHistory === 'function') registerEditHistory('clioWrite', () => root.AISystem6ClioWrite.editHistory());
  if (typeof keyboardShortcutRegistry !== 'undefined' && Array.isArray(keyboardShortcutRegistry)) {
    for (const [action, [, key, labelKey]] of Object.entries(MENU_COMMANDS)) {
      if (!key || keyboardShortcutRegistry.some((entry) => entry.id === action)) continue;
      // Shown in the menus; the keys themselves are taken by the surface while ClioWrite is in front.
      keyboardShortcutRegistry.push({ id: action, key, ...(key === 'm' ? { code: 'KeyM' } : {}), action, display: '⌘' + key.toUpperCase(), labelKey, dispatch: false, scope: ['clioWrite'] });
    }
  }
  if (root.AISystem6Runtime && fn(root.AISystem6Runtime, 'registerApplication')) {
    try {
      root.AISystem6Runtime.registerApplication({
        id: 'clioWrite',
        windowName: 'clioWrite',
        mount: drawEmpty,
        restore: drawEmpty,
        commands: {
          'open-clio-write': { handler: () => (typeof root.openWindow === 'function' ? root.openWindow('clioWrite') : null), isAvailable: () => true },
          ...Object.fromEntries(Object.entries(MENU_COMMANDS).map(([action, [commandId]]) => [action, menuCommand(commandId)])),
        },
      });
    } catch (error) { /* registered by an earlier load */ }
  }
  if (fn(root, 'AISystem6RegisterApplicationMenuSet')) root.AISystem6RegisterApplicationMenuSet('clioWrite', menuDefinitions());
  installWindow();
})(typeof window !== 'undefined' ? window : globalThis);
