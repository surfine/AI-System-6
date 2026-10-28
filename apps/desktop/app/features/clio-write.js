/* ClioWrite: the docx editing window (S11 M3, S11-4 / S11-19 / S11-23).
 *
 * One window, two modes over one document, one dirty axis:
 *   ClioWrite Express (the default): the document flows (no pages, no page
 *     numbers); typing changes the text inside a paragraph and nothing else;
 *     comments can be read and added (⌘M windoid); the words inside a table
 *     cell can be changed (N10) while the table's structure stays as it was;
 *     pictures can be inserted (插入 › 图片…, or a screenshot pasted) and
 *     resized by a corner drag, but never typed into.
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
 * caret's place in the model whether it may happen at all: a picture under the
 * caret refuses it, and a table cell takes only the words — its structure
 * (rows, cells, paragraphs across cells) stays as it was — while Express
 * refuses anything that is not text inside one paragraph. While an
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

  /* ------------------------------------------ N13b: the revision author's name */
  // The vendored codec stamps whatever it finds in its own settings store
  // (L.store 'userName', backed by window.VO.settings in common/core.js — with
  // no VO every stamp reads 'Quire User'). ClioWrite backs that one store with
  // localStorage, so the name the writer gives at the 「记录修订」 toggle is the
  // name O.revStamp() stamps into w:ins / w:del (and the package's
  // cp:lastModifiedBy carries). Vendor code untouched.
  function ensureVendorSettings() {
    if (!root.VO) root.VO = {};
    if (root.VO.settings) return;
    root.VO.settings = {
      get(k) { try { return localStorage.getItem(k); } catch (error) { return null; } },
      set(k, v) { try { localStorage.setItem(k, String(v)); return true; } catch (error) { return false; } },
      remove(k) { try { localStorage.removeItem(k); } catch (error) { /* gone */ } },
    };
  }
  function revisionAuthor() {
    ensureVendorSettings();
    const L = root.L;
    const name = L && L.store ? L.store.get('userName', '') : '';
    return name == null ? '' : String(name);
  }
  function rememberRevisionAuthor(name) {
    ensureVendorSettings();
    const L = root.L;
    if (L && L.store) L.store.set('userName', String(name));
  }
  /** N13b: the rename road — the 修订 windoid's 「署名…」 button. The same
   * System 6 input dialog the toggle's first question takes, prefilled with
   * the remembered name; a confirmed non-empty answer is remembered at once,
   * so the very next stamp carries it. Cancelling, or an empty answer, or no
   * dialog on this root leaves the name exactly as it was. */
  async function renameRevisionAuthor() {
    if (typeof root.showInputDialog !== 'function') return null;
    const answer = await root.showInputDialog({ title: tr('clio_write_track_menu'), message: tr('clio_write_track_author_message'), defaultValue: revisionAuthor() });
    if (answer == null) return null;
    const name = String(answer).trim();
    if (name) rememberRevisionAuthor(name);
    return name;
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
    // N13a: the review engine's steps (quire-review.js), named here like the upstream ones.
    'Accept Revision': 'clio_write_step_accept_revision',
    'Reject Revision': 'clio_write_step_reject_revision',
    'Accept All Changes': 'clio_write_step_accept_all',
    'Reject All Changes': 'clio_write_step_reject_all',
    // N13b: the 「记录修订」 toggle — one named model command. The label carries its
    // state as the translation's arg, the way 「全部替换 N 处」 carries its count.
    '记录修订：开': 'clio_write_step_track',
    '记录修订：关': 'clio_write_step_track',
    // N3: the find/replace engine's single replace (find-replace.js); its batch
    // step 「全部替换 N 处」 carries a count, so it is matched below, not listed.
    '替换': 'clio_write_step_replace',
    // N10: the picture commands. 插入图片 / 粘贴图片 are ours (the labels the
    // insert command hands the editor); Resize Picture / Resize Object are the
    // upstream resize steps (editor.js for an inline picture, drawing.js for a
    // floating one), reached by dragging a corner handle.
    '插入图片': 'clio_write_step_insert_image',
    '粘贴图片': 'clio_write_step_paste_image',
    // N11: the desk clipboard's pastes — a ClioChart region becomes a docx
    // table, another ClioWrite document's paragraphs come over as blocks.
    // One named step each, the way 「粘贴图片」 names the picture's.
    '粘贴：来自 ClioChart 的表格': 'clio_write_step_paste_table',
    '粘贴：来自 ClioWrite 的段落': 'clio_write_step_paste_paragraphs',
    // 邮件合并: one clicked column name becomes one «列名» at the caret —
    // one named step, the way 「插入图片」 names the picture's.
    '插入邮件合并占位符': 'clio_write_step_mail_merge_field',
    // N10 补缺: the selected picture's replace, and the table's own structure —
    // six commands the app side composes (the upstream model has no row or
    // column operations), one named model command each.
    '换图': 'clio_write_step_replace_image',
    '插入行': 'clio_write_step_insert_row',
    '删除行': 'clio_write_step_delete_row',
    '插入列': 'clio_write_step_insert_column',
    '删除列': 'clio_write_step_delete_column',
    // 比较→修订: adopting compare candidates writes revision marks as one
    // named step per batch (「比较：采用全部」 below; 第 N 条 matched by pattern).
    '比较：采用全部': 'clio_write_step_compare_all',
    'Resize Picture': 'clio_write_step_resize_picture',
    'Resize Object': 'clio_write_step_resize_object',
  });
  function stepKey(label) {
    const text = String(label || '');
    if (!text) return '';
    if (/^全部替换 \d+ 处$/.test(text)) return 'clio_write_step_replace_all';
    if (/^比较：采用第 \d+ 条$/.test(text)) return 'clio_write_step_compare_one';
    return STEP_KEYS[text] || 'clio_write_step_change';
  }
  /** The count a 「全部替换 N 处」 undo label carries, as the translation's args. */
  function stepLabelArgs(label) {
    const text = String(label || '');
    const m = /^全部替换 (\d+) 处$/.exec(text);
    if (m) return [Number(m[1])];
    const one = /^比较：采用第 (\d+) 条$/.exec(text);
    if (one) return [Number(one[1])];
    return text === '记录修订：开' ? [true] : text === '记录修订：关' ? [false] : [];
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
    if (d.table) {
      // N10 门一: inside a table only the words in a cell may change. The
      // table's structure — rows, cells, a cell's own paragraphs split or
      // joined — stays read-only, and so do formatting into a cell, comments
      // (addComment's own gate) and find/replace (N3's skip). Both modes open
      // the same words: the upstream editor types into a real cell paragraph
      // through the one write-back path.
      if (kind === 'format') return no('READ_ONLY_TABLE');
      if (!d.collapsed && d.object) return no('READ_ONLY_IMAGE');
      if (kind === 'text' || kind === 'delete') return d.paragraphs === 1 ? ok : no('READ_ONLY_TABLE');
      if (kind === 'backward' || kind === 'forward' || kind === 'word-backward' || kind === 'word-forward') {
        if (!d.collapsed) return d.paragraphs === 1 ? ok : no('READ_ONLY_TABLE');
        if ((kind === 'word-backward' || kind === 'word-forward') && d.paragraphHasObject) return no('READ_ONLY_IMAGE');
        const back = kind === 'backward' || kind === 'word-backward';
        // At a cell paragraph's edge the key would join it with the next
        // paragraph (or walk out of the cell): that is the table's structure.
        if (back ? d.atStart : d.atEnd) return no('READ_ONLY_TABLE');
        return (back ? d.objectBefore : d.objectAfter) ? no('READ_ONLY_IMAGE') : ok;
      }
      return no('READ_ONLY_TABLE');   // split / line: a cell's paragraphs are structure
    }
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
    // N2b: the page view is read-only (first version); the way back is named in the words.
    PAGE_VIEW: 'clio_write_reason_page_view',
  });

  /* --------------------------------------------- N2b: the paper, from the file */
  // The page view's paper sizes come from the docx's own section properties
  // (sect.pgW / pgH in points — the same numbers N10's picture column and the
  // upstream page boxes are sized with). A size that is no named paper says its
  // centimetres instead of borrowing a name; the px figures use D.PX and R.px's
  // rounding so the strip and the drawn page box can never disagree.
  const PAPERS = Object.freeze([['A4', 595.3, 841.9], ['Letter', 612, 792], ['Legal', 612, 1008], ['A5', 420, 595.3], ['B5', 515.9, 728.5]]);
  const PX_PER_PT = 96 / 72;   // D.PX in the vendored dmodel
  function pageMetricsFrom(doc) {
    const sect = doc && doc.sect ? doc.sect : {};
    const w = Number(sect.pgW) || 612;
    const h = Number(sect.pgH) || 792;
    // N2c: the margins the file's own pgMar asks for (points), for the 文稿设置 display.
    const ptOf = (v) => Number(v) || 0;
    const pxOf = (pt) => Math.round(pt * PX_PER_PT * 100) / 100;
    const cmOf = (pt) => Math.round(((pt / 72) * 2.54) * 10) / 10;
    const near = (a, b) => Math.abs(a - b) <= 1.5;
    const hit = PAPERS.find((paper) => (near(paper[1], w) && near(paper[2], h)) || (near(paper[1], h) && near(paper[2], w)));
    return {
      widthPt: w, heightPt: h, widthPx: pxOf(w), heightPx: pxOf(h), widthCm: cmOf(w), heightCm: cmOf(h), paper: hit ? hit[0] : '', landscape: w > h,
      margins: { top: cmOf(ptOf(sect.mt)), bottom: cmOf(ptOf(sect.mb)), left: cmOf(ptOf(sect.ml)), right: cmOf(ptOf(sect.mr)) },
    };
  }

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
      view: 'flow',             // N2b: 'flow' (the document flows) | 'pages' (the read-only page view)
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
    // N13a: revisions resolve through the adapter's named-command hook.
    const revisionsAvailable = () => fn(adapter, 'modelCommand') && fn(adapter, 'document');
    // 邮件合并: the template is the body itself — a mounted document with at
    // least one non-empty paragraph has one; an empty one has nothing to merge.
    const hasBody = () => fn(adapter, 'blocks')
      && adapter.blocks().some((block) => block && block.kind === 'paragraph' && String(block.text || '').trim() !== '');
    // N13b: the tracking flag lives in the document itself (doc.settings.track,
    // round-tripped as settings.xml's w:trackRevisions), so a file that Word
    // recorded with opens already checked.
    const trackingOn = () => { const d = fn(adapter, 'document') ? adapter.document() : null; return !!(d && d.settings && d.settings.track); };
    /** N13b: 「记录修订」 — set / clear doc.settings.track as ONE named model
     * command (one undo step, 「记录修订：开/关」). Only a first turn-on with
     * no remembered name asks for one (opts.askRevisionAuthor — the window
     * supplies the System 6 dialog, and the answer is remembered through
     * L.store); a remembered name turns tracking on without a question, and
     * the rename road is the 修订 windoid's 「署名…」 button. Cancelling the
     * question (or an empty answer) leaves tracking off; turning tracking off
     * never asks. */
    async function toggleTracking() {
      if (s.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      const gate = commandState('revisions.track');
      if (!gate.enabled) {
        if (gate.reason) setReceipt('clio_write_receipt_refused', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      const on = !trackingOn();
      if (on) {
        let name = revisionAuthor();
        // 只首次问：a remembered name opens recording without a question —
        // the name is changed through the 修订 windoid's 「署名…」 button.
        if (!name && typeof opts.askRevisionAuthor === 'function') {
          const answer = await opts.askRevisionAuthor(name);
          if (answer == null) return { status: 'cancelled' };
          name = String(answer).trim();
        }
        if (!name) return { status: 'cancelled' };
        rememberRevisionAuthor(name);
      }
      try {
        adapter.modelCommand(on ? '记录修订：开' : '记录修订：关', () => {
          const d = adapter.document();
          const D = root.L && root.L.D;
          if (D) D.touchKey(d, 'settings');   // the flag rides the undo step with it
          d.settings.track = on;
        });
      } catch (error) {
        return { status: 'failed', message: String(error && error.message || error) };
      }
      setReceipt('clio_write_step_track', 'info', [on]);
      return { status: 'ok', on };
    }
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
      // 「全部替换 N 处」 keeps its count in the menu row (undoLabelArgs feeds it).
      undoLabelArgs: () => (canUndo() && fn(adapter, 'undoLabel') ? stepLabelArgs(adapter.undoLabel()) : []),
      redoLabelArgs: () => (canRedo() && fn(adapter, 'redoLabel') ? stepLabelArgs(adapter.redoLabel()) : []),
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
        // N10 门二: 插入 › 图片… needs a caret the picture can stand at — a body
        // paragraph or a table cell's words; the read-only places say so.
        case 'insert.image':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (s.view === 'pages') return { enabled: false, reason: tr('clio_write_reason_page_view') };
          if (!s.caret) return { enabled: false, reason: tr('clio_write_reason_no_caret') };
          if (s.caret.other) return { enabled: false, reason: tr('clio_write_reason_outside') };
          return { enabled: true };
        // N10 补缺: 换图… needs the picture itself selected (the .obj-handles
        // state, as the model sees it: one object run under the selection).
        case 'image.replace':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (s.composing) return { enabled: false, reason: '' };
          if (s.view === 'pages') return { enabled: false, reason: tr('clio_write_reason_page_view') };
          return selectedPicture() ? { enabled: true } : { enabled: false, reason: '' };
        // N2b: the page view is read-only, so the commands that would put a
        // caret or write into the document stand down while it is up; the
        // chrome commands (view, print, save, undo, word count) stay.
        case 'comments.open':
        case 'revisions.open':
        case 'find.open':
        case 'find.next':
          if (s.view === 'pages') return { enabled: false, reason: tr('clio_write_reason_page_view') };
          return { enabled: true };
        case 'view.pages':
        case 'view.flow':
          if (s.composing) return { enabled: false, reason: '' };
          return { enabled: true };
        case 'file.print':
        case 'file.export-pdf':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (s.composing) return { enabled: false, reason: '' };
          return { enabled: true };
        // 邮件合并 needs a body to read the template from; the read-only page
        // view does not block it (the generation reads the model, only the
        // column insert needs a caret).
        case 'file.mail-merge':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (s.composing) return { enabled: false, reason: '' };
          return hasBody() ? { enabled: true } : { enabled: false, reason: tr('clio_write_reason_no_document') };
        // N13b: 「记录修订」 needs the same model-command hook the revisions row does.
        case 'revisions.track':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (s.composing) return { enabled: false, reason: '' };
          if (s.view === 'pages') return { enabled: false, reason: tr('clio_write_reason_page_view') };
          return revisionsAvailable() ? { enabled: true } : { enabled: false, reason: '' };
        // 比较→修订: the windoid itself only reads, but adopting writes marks,
        // so it stands down in the same places the revisions rows do.
        case 'compare.open':
          if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
          if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
          if (s.composing) return { enabled: false, reason: '' };
          if (s.view === 'pages') return { enabled: false, reason: tr('clio_write_reason_page_view') };
          return revisionsAvailable() ? { enabled: true } : { enabled: false, reason: '' };
        default: break;
      }
      // N10 第二阶段: the table's structure commands need the caret inside a
      // table cell. This gate is their own; the words inside a cell keep theirs.
      if (id.startsWith('table.')) {
        if (s.reverting || s.saving) return { enabled: false, reason: tr('clio_write_reason_saving') };
        if (s.confirming) return { enabled: false, reason: tr('clio_write_reason_confirming') };
        if (s.composing) return { enabled: false, reason: '' };
        if (s.view === 'pages') return { enabled: false, reason: tr('clio_write_reason_page_view') };
        const c = s.caret;
        if (!c) return { enabled: false, reason: tr('clio_write_reason_no_caret') };
        if (c.other) return { enabled: false, reason: tr('clio_write_reason_outside') };
        if (!c.table) return { enabled: false, reason: tr('clio_write_reason_not_in_table') };
        return { enabled: true };
      }
      if (id.startsWith('format.')) {
        if (s.mode !== 'full') return { enabled: false, reason: tr('clio_write_reason_express_format') };
        if (s.reverting) return { enabled: false, reason: tr('clio_write_reason_saving') };
        if (s.view === 'pages') return { enabled: false, reason: tr('clio_write_reason_page_view') };
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
        // N2b: the read-only page view, and the one road out to paper — the
        // browser's own print dialog (Save as PDF there is the export).
        { id: 'view.pages', labelKey: 'clio_write_view_pages', shortcut: '', checked: s.view === 'pages' },
        { id: 'view.flow', labelKey: 'clio_write_view_flow', shortcut: '', checked: s.view === 'flow' },
        { id: 'file.print', labelKey: 'clio_write_menu_print', shortcut: '⌘P' },
        { id: 'file.export-pdf', labelKey: 'clio_write_menu_export_pdf', shortcut: '' },
        // 邮件合并: one row, the same list the File menu's own bar carries.
        { id: 'file.mail-merge', labelKey: 'clioworks_mail_merge_menu', shortcut: '' },
        commentsAvailable() ? { id: 'comments.open', labelKey: 'clio_stage_native_cmd_comment', shortcut: '⌘M' } : null,
        revisionsAvailable() ? { id: 'revisions.open', labelKey: 'clio_write_revisions_menu', shortcut: '' } : null,
        // N13b: the 「记录修订」 check row, beside 修订… — the checked state is the document's own flag.
        revisionsAvailable() ? { id: 'revisions.track', labelKey: 'clio_write_track_menu', checked: trackingOn() } : null,
        // 比较→修订: the compare windoid — same review-side path, same hook.
        revisionsAvailable() ? { id: 'compare.open', labelKey: 'clio_write_compare_menu', shortcut: '' } : null,
        fn(adapter, 'paragraphs') ? { id: 'word-count.open', labelKey: 'clio_write_word_count_menu', shortcut: '' } : null,
        // N3: the shared 查找 / 替换 windoid (features/clioworks-find.js).
        { id: 'find.open', labelKey: 'clioworks_find_replace_menu', shortcut: '⌘F' },
        { id: 'find.next', labelKey: 'find_next', shortcut: '⌘G' },
        // N10: 插入 › 图片… (one named step; the same path a pasted screenshot takes).
        { id: 'insert.image', labelKey: 'clio_write_insert_image', shortcut: '' },
        // N10 补缺: the selected picture's own row — 换图… swaps the bytes under
        // the same position (one step; the size rule keeps the original width).
        commandState('image.replace').enabled ? { id: 'image.replace', labelKey: 'clio_write_replace_image', shortcut: '' } : null,
        // N10 第二阶段: the table's own structure, one group of its own — listed
        // only while the caret sits inside a table cell.
        ...(s.caret && s.caret.table ? [
          { separator: true },
          { id: 'table.row-above', labelKey: 'clio_write_table_insert_row_above', shortcut: '' },
          { id: 'table.row-below', labelKey: 'clio_write_table_insert_row_below', shortcut: '' },
          { id: 'table.column-left', labelKey: 'clio_write_table_insert_column_left', shortcut: '' },
          { id: 'table.column-right', labelKey: 'clio_write_table_insert_column_right', shortcut: '' },
          { id: 'table.delete-row', labelKey: 'clio_write_table_delete_row', shortcut: '' },
          { id: 'table.delete-column', labelKey: 'clio_write_table_delete_column', shortcut: '' },
        ] : []),
        ...(wired('setHeading') ? ['format.heading.1', 'format.heading.2', 'format.heading.3', 'format.heading.0'] : []).map((id) => ({ id, labelKey: `clio_write_style_${id.slice(-1) === '0' ? 'body' : 'heading_' + id.slice(-1)}` })),
        ...(wired('toggleRunStyle') ? [['format.bold', 'bold', '⌘B'], ['format.italic', 'italic', '⌘I'], ['format.underline', 'underline', '⌘U']] : []).map(([id, key, shortcut]) => ({ id, labelKey: `clio_write_${key}`, shortcut })),
        ...(wired('setList') ? [['format.list.bullet', 'bullets'], ['format.list.number', 'numbering']] : []).map(([id, key]) => ({ id, labelKey: `clio_write_${key}` })),
      ].filter(Boolean);
      return list.map((command) => ({ ...command, state: command.id ? commandState(command.id) : { enabled: true } }));
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

    /* -- N10 第二阶段: the table's own structure. The vendored model has no row
       or column operation (ops.js builds and removes whole tables, nothing
       between), so these six commands compose D.row / D.cell / D.touchTbl here
       and run through adapter.modelCommand — one named undo step on the same
       write-back path every model command takes. What sits in a row or column
       moves with it (cells are objects); a deleted merge start hands its words
       and its restart to the continuation cell below it. The words inside a
       cell keep their own gate: these commands open structure only. */
    const TABLE_SPECS = Object.freeze({
      'table.row-above': { axis: 'row', where: -1, label: '插入行' },
      'table.row-below': { axis: 'row', where: 1, label: '插入行' },
      'table.column-left': { axis: 'col', where: -1, label: '插入列' },
      'table.column-right': { axis: 'col', where: 1, label: '插入列' },
      'table.delete-row': { axis: 'row', where: 0, label: '删除行' },
      'table.delete-column': { axis: 'col', where: 0, label: '删除列' },
    });
    const cellSpan = (cell) => (cell.tcPr && cell.tcPr.span) || 1;
    const rowGap = (row) => (row.trPr && row.trPr.gridBefore) || 0;
    /** the grid columns each cell of one row covers: [{cell, at, span}] */
    function rowGrid(row) {
      let at = rowGap(row);
      const cells = row.cells.map((cell) => { const span = cellSpan(cell); const entry = { cell, at, span }; at += span; return entry; });
      return { cells, end: at };
    }
    /** the cell of one row whose columns cover grid column col */
    const cellCovering = (row, col) => rowGrid(row).cells.find((entry) => entry.at <= col && entry.at + entry.span > col) || null;
    /** a table's grid, healing a width-less one flat before column surgery (real files carry their own) */
    const gridOf = (tbl) => {
      if (tbl.grid && tbl.grid.length) return tbl.grid;
      const n = Math.max(1, ...tbl.rows.map((row) => rowGrid(row).end));
      tbl.grid = Array.from({ length: n }, () => 72);
      return tbl.grid;
    };
    /** an empty cell shaped like `like` (span, width, paragraph formatting), with or without a vertical merge */
    function emptyCellLike(like, vMerge) {
      const L = root.L;
      const first = like.blocks.find((block) => block.t === 'p');
      const para = L.D.para([], first ? L.clone(first.pPr) : {}, first ? L.clone(first.rPr) : {});
      const tcPr = L.clone(like.tcPr || {});
      if (vMerge) tcPr.vMerge = vMerge; else delete tcPr.vMerge;
      return L.D.cell([para], tcPr);
    }
    /** N10 补缺: the picture under a selection that covers exactly one object
     * run — the model's own picture of the editor's .obj-handles selection —
     * as { p, item }, or null. 换图 reads the bookmark, never the DOM. */
    function selectedPicture() {
      const c = s.caret;
      if (!c || !c.object || c.collapsed || c.paragraphs !== 1 || c.to - c.from !== 1) return null;
      const d = fn(adapter, 'document') ? adapter.document() : null;
      const D = root.L && root.L.D;
      const p = d && D ? D.byId(d, Number(c.paragraphId)) : null;
      if (!p) return null;
      let at = 0;
      for (const item of p.runs) {
        const n = D.ilen(item);
        if (at === c.from && at + n === c.to && item.t === 'img') return { p, item };
        at += n;
      }
      return null;
    }
    /**
     * One named table-structure command (在上方插入行 … 删除列). Reads the caret's
     * cell, mutates the model inside adapter.modelCommand, and says where the
     * selection lands afterwards ({ paragraphId, offset }).
     */
    function tableCommand(id) {
      const spec = TABLE_SPECS[id];
      if (!spec) return { status: 'failed', reason: 'unknown-command' };
      if (s.composing) return { status: 'blocked', code: 'IME_COMPOSING' };
      const gate = commandState(id);
      if (!gate.enabled) {
        if (gate.reason) setReceipt('clio_write_receipt_refused', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      const L = root.L;
      if (!L || !L.D || !fn(adapter, 'modelCommand')) return { status: 'failed', reason: 'unavailable' };
      const D = L.D;
      const c = s.caret;
      if (stale(c)) return refuse('RESELECT');
      const d = fn(adapter, 'document') ? adapter.document() : null;
      const p = d ? D.byId(d, Number(c.paragraphId)) : null;
      const at = p ? D.cellOf(d, p) : null;
      if (!at) {
        setReceipt('clio_write_receipt_refused', 'blocked', [tr('clio_write_reason_not_in_table')]);
        return { status: 'blocked', reason: tr('clio_write_reason_not_in_table') };
      }
      const { tbl, row, ri } = at;
      const mine = rowGrid(row).cells[at.ci];
      const select = { paragraphId: c.paragraphId, offset: c.from };
      try {
        adapter.modelCommand(spec.label, () => {
          if (spec.axis === 'row' && spec.where !== 0) {
            // The new row mirrors the caret row's cells (spans, widths, paragraph
            // formatting) with empty words. A vertical merge the new row lands
            // inside spans it too ('continue'); above a merge's first row the new
            // cells are plain. The caret's own paragraph moves with its row.
            D.touchTbl(tbl);
            const cells = row.cells.map((cell) => {
              const vm = cell.tcPr && cell.tcPr.vMerge;
              return emptyCellLike(cell, vm === 'continue' || (vm === 'restart' && spec.where > 0) ? 'continue' : '');
            });
            const trPr = L.clone(row.trPr || {});
            delete trPr.header;   // a repeated heading row is the table's own property, not the new row's
            tbl.rows.splice(ri + (spec.where > 0 ? 1 : 0), 0, D.row(cells, trPr));
          } else if (spec.axis === 'row') {
            if (tbl.rows.length === 1) {
              // Deleting the last row deletes the table itself (Word does the same).
              const pos = L.O.removeBlock(tbl);
              select.paragraphId = String(pos.p.id);
              select.offset = pos.o;
              return;
            }
            D.touchTbl(tbl);
            const dead = tbl.rows[ri];
            for (const entry of rowGrid(dead).cells) {
              if (!(entry.cell.tcPr && entry.cell.tcPr.vMerge === 'restart')) continue;
              const next = tbl.rows[ri + 1] && cellCovering(tbl.rows[ri + 1], entry.at);
              if (next && next.cell.tcPr && next.cell.tcPr.vMerge === 'continue') {
                // The merge keeps its words: the first continuation below takes the restart and the blocks.
                next.cell.tcPr.vMerge = 'restart';
                next.cell.blocks = entry.cell.blocks;
              }
            }
            tbl.rows.splice(ri, 1);
            const rest = tbl.rows[Math.min(ri, tbl.rows.length - 1)];
            const cover = (rest && (cellCovering(rest, mine.at) || rowGrid(rest).cells[0])) || null;
            const landed = cover && cover.cell.blocks.find((block) => block.t === 'p');
            if (landed) { select.paragraphId = String(landed.id); select.offset = 0; }
          } else if (spec.where !== 0) {
            // One new grid column at the caret cell's near or far edge. It takes
            // the caret column's width; a cell spanning the edge extends over it,
            // every other row gets an empty cell there shaped like its neighbour.
            const grid = gridOf(tbl);
            const g = mine.at + (spec.where > 0 ? mine.span : 0);
            const w = grid[mine.at] || 72;
            D.touchTbl(tbl);
            grid.splice(g, 0, w);
            for (const each of tbl.rows) {
              let spans = false;
              let insertAt = each.cells.length;
              let col = rowGap(each);
              for (let i = 0; i < each.cells.length; i++) {
                const cell = each.cells[i];
                const span = cellSpan(cell);
                if (col >= g) { insertAt = i; break; }
                if (col + span > g) {
                  cell.tcPr.span = span + 1;
                  if (Number.isFinite(cell.tcPr.w)) cell.tcPr.w = L.round(cell.tcPr.w + w, 2);
                  spans = true;
                  break;
                }
                col += span;
              }
              if (!spans) {
                // an empty cell of the new column alone: one column wide, the new
                // column's width, the neighbour's paragraph formatting
                const like = each.cells[Math.min(insertAt, each.cells.length - 1)];
                const fresh = like ? emptyCellLike(like, '') : D.cell([D.para()], {});
                fresh.tcPr.span = 1;
                fresh.tcPr.w = w;
                each.cells.splice(insertAt, 0, fresh);
              }
            }
          } else {
            // The columns the caret cell covers leave every row. A cell that
            // reached past them keeps what remains of its span and its words; a
            // merge whose restart went with them hands the words to the
            // continuation below; the caret lands on the cell now beside them.
            const grid = gridOf(tbl);
            const g0 = mine.at;
            const n = mine.span;
            const g1 = g0 + n;
            const widthOf = (from, to) => grid.slice(Math.max(0, from), Math.max(0, to)).reduce((sum, v) => sum + v, 0);
            const lastColumn = grid.length - n < 1;
            if (lastColumn) {
              // The last column (or the cell's every column) leaving: the table goes with it.
              const pos = L.O.removeBlock(tbl);
              select.paragraphId = String(pos.p.id);
              select.offset = pos.o;
              return;
            }
            D.touchTbl(tbl);
            grid.splice(g0, n);
            const dropped = [];
            for (const each of tbl.rows) {
              let col = rowGap(each);
              const kept = [];
              for (const cell of each.cells) {
                const span = cellSpan(cell);
                const end = col + span;
                const overlap = Math.min(end, g1) - Math.max(col, g0);   // columns this cell loses
                if (overlap <= 0) kept.push(cell);
                else if (col < g0 || end > g1) {
                  // reaches past the deleted columns on one side or both: it stays, narrower
                  cell.tcPr.span = span - overlap;
                  if (Number.isFinite(cell.tcPr.w)) cell.tcPr.w = L.round(cell.tcPr.w - widthOf(Math.max(col, g0), Math.min(end, g1)), 2);
                  kept.push(cell);
                } else if (cell.tcPr && cell.tcPr.vMerge === 'restart') dropped.push({ row: each, at: col, blocks: cell.blocks });
                col = end;
              }
              if (!kept.length) kept.push(D.cell([D.para()], { w: widthOf(g0, g1) || 72 }));
              each.cells = kept;
            }
            for (const gone of dropped) {
              const below = tbl.rows[tbl.rows.indexOf(gone.row) + 1];
              const next = below && cellCovering(below, gone.at);
              if (next && next.cell.tcPr && next.cell.tcPr.vMerge === 'continue') {
                next.cell.tcPr.vMerge = 'restart';
                next.cell.blocks = gone.blocks;
              }
            }
            const rest = tbl.rows[Math.min(ri, tbl.rows.length - 1)];
            const cover = (rest && (cellCovering(rest, Math.min(g0, grid.length - 1)) || rowGrid(rest).cells[0])) || null;
            const landed = cover && cover.cell.blocks.find((block) => block.t === 'p');
            if (landed) { select.paragraphId = String(landed.id); select.offset = 0; }
          }
        });
      } catch (error) {
        return { status: 'failed', message: String(error && error.message || error) };
      }
      return { status: 'ok', select };
    }


    const session = {
      get adapter() { return adapter; },
      get mode() { return s.mode; },
      get view() { return s.view; },
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
      // N2b: the page view. Like mode, a view change is chrome, not a document
      // change — no save, no dirty change, no undo step — and it is never
      // remembered: a document always opens flowing.
      setView(view) {
        if (view !== 'flow' && view !== 'pages') throw new Error('ClioWrite: unknown view ' + view);
        if (view === s.view) return;
        s.view = view;
        settleReceipt();
        notify();
      },
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
      tableCommand,
      selectedPicture,
      commentsAvailable,
      revisionsAvailable,
      trackingOn,
      toggleTracking,
      wordCount,
      // N2b: the paper the file's own section properties ask for (pure model read).
      pageGeometry() { return pageMetricsFrom(fn(adapter, 'document') ? adapter.document() : null); },
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
    // N12: the quiet substituted-fonts note; a real button so the list it opens is keyboard-reachable.
    const fontNote = h(doc, 'button', { type: 'button', class: 'cw-font-note', hidden: true });
    const modeBtn = popButton();
    const cmdBtn = popButton();
    status.replaceChildren(receiptEl, h(doc, 'span', { class: 'status-bar-context cw-context' }, [fileEl, fontNote, modeBtn]), h(doc, 'span', { class: 'status-bar-trailing cw-trailing' }, [cmdBtn]));
    const styleBtn = popButton();
    const listBtn = popButton();
    const strip = h(doc, 'div', { class: 'cw-ruler-strip', role: 'img' });
    ruler.replaceChildren(h(doc, 'span', { class: 'cw-ruler-pops' }, [styleBtn, listBtn]), strip);
    const emptyEl = h(doc, 'div', { class: 'cw-empty' });
    const scroller = h(doc, 'div', { class: 'cw-scroller window-frame-scroller', hidden: true });
    // N2b: the page view's strip — page count, the paper with its 按本机排版
    // note, the substituted-fonts note (N12), 打印… and the ⌘. close.
    // N2c: the 文稿设置 display — the file's own margins and orientation.
    const pageCount = h(doc, 'span', { class: 'cw-page-count' });
    const pagePaper = h(doc, 'span', { class: 'cw-page-paper' });
    const pageMargins = h(doc, 'span', { class: 'cw-page-margins' });
    const pageOrient = h(doc, 'span', { class: 'cw-page-orient' });
    const pageFonts = h(doc, 'span', { class: 'cw-page-fonts', hidden: true });
    const printBtn = h(doc, 'button', { type: 'button', class: 'btn cw-pagebar-print' });
    const closeBtn = h(doc, 'button', { type: 'button', class: 'btn cw-pagebar-close' });
    const pageStrip = h(doc, 'div', { class: 'cw-pagebar', hidden: true }, [
      pageCount, pagePaper, pageMargins, pageOrient, pageFonts,
      h(doc, 'span', { class: 'cw-pagebar-actions' }, [printBtn, closeBtn]),
    ]);
    const captionEl = h(doc, 'p', { class: 'cw-caption' });
    const layer = h(doc, 'div', { class: 'cw-layer', hidden: true });
    pane.replaceChildren(emptyEl, pageStrip, scroller, captionEl, layer);
    chrome = { win, doc, pane, status, ruler, strip, receiptEl, fileEl, fontNote, modeBtn, cmdBtn, styleBtn, listBtn, emptyEl, scroller, pageStrip, pageCount, pagePaper, pageMargins, pageOrient, pageFonts, printBtn, closeBtn, captionEl, layer, titleEl: win.querySelector('#clio-write-title') };
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
    const ed = { L, E: L.ed, LY: L.layout, D: L.D, O: L.O };
    // The upstream layer asks its host for commands, messages and whether a menu or dialog is up.
    L.ui = {
      exec: (name) => { if (active) active.surface.exec(name); },
      toast: () => { if (active) active.session.refuse('PROTECTED'); },
      dialogOpen: () => !!(chrome && !chrome.layer.hidden),
      menuOpen: () => !!(active && active.surface.menuOpen()),
      ...quire.dragHost,   // ui.drag in miniature (quire-adapter.js): pin 32ff53's editor starts every press with it
      // A link's address is shown nowhere here and never opened: the document stays protected text.
      linkDialog: () => {},
    };
    L.app = L.app || {};
    ed.LY.root.dataset.editHistory = 'clioWrite';
    ed.LY.root.setAttribute('aria-label', tr('clio_write_document_label'));
    // The document is the scroller's one tab stop, so a long file scrolls from the keyboard (axe
    // scrollable-region-focusable) without a second stop on the scroller itself.
    ed.LY.root.tabIndex = 0;
    ed.E.init();
    // Count the change first, then read the caret, so the selection's bookmark carries the new revision.
    // N13b: while 记录修订 is on, the revisions windoid follows each edit — a typed
    // word is a new revision, and the list is the writer's way to see it land.
    L.bus.on('doc-changed', () => { if (active && active.session.adapter.document() === ed.D.doc) { active.session.noteExternalEdit(); active.surface.syncCaret(); if (typeof active.surface.refreshReview === 'function') active.surface.refreshReview(); if (typeof active.surface.refreshCompare === 'function') active.surface.refreshCompare(); } });
    L.bus.on('sel', () => { if (active) active.surface.syncCaret(); });
    // N10: a table's cells are the upstream editor's to edit (its own layout marks
    // the structural filler cells); only the object parts stay inert here — a
    // picture or a shape is still selected by a press, never typed into.
    L.bus.on('layout-done', () => { if (ed.LY.root) ed.LY.root.querySelectorAll('img, svg, .obj').forEach((node) => node.setAttribute('contenteditable', 'false')); });
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
    const { E, LY, D, O } = ed;
    const cleanups = [];
    const on = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    };
    let openedMenu = null;
    let windoid = null;
    let fontsWindoid = null;
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
      // N2b: the page view is read-only; editing stays in the flow view.
      if (session.view === 'pages') { refuseEvent(event, 'PAGE_VIEW'); return true; }
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

    /* -- N2b 页面视图: read-only pages over the one model. The upstream layer
       already owns the pagination — LY.view 'preview' runs its Print-Layout
       pass (page boxes at the file's own sect sizes, headers, footers, page
       numbers) — so this window only switches to it, keeps every input out,
       and draws the strip. No cursor lives in the page view and none is
       mapped: the flow's selection is bookmarked on the way in, and a plain
       click on the text is a one-way jump back to it. -- */
    let flowCaret = null;          // the flow selection's bookmark while the pages are up
    let printCleanup = null;       // the afterprint listener, while a print is out
    function drawPageStrip() {
      if (!c.pageStrip) return;
      c.pageCount.textContent = tr('clio_write_pages_count', Array.isArray(LY.pages) ? LY.pages.length : 0);
      const geo = session.pageGeometry();
      c.pagePaper.textContent = geo.paper ? tr('clio_write_pages_paper_local', geo.paper) : tr('clio_write_pages_size_local', geo.widthCm, geo.heightCm);
      // N2c: the 文稿设置 display — the file's own margins and orientation.
      c.pageMargins.textContent = tr('clio_write_pages_margins', geo.margins.top, geo.margins.bottom, geo.margins.left, geo.margins.right);
      c.pageMargins.title = c.pageMargins.textContent;
      c.pageOrient.textContent = tr(geo.landscape ? 'clio_write_pages_orient_landscape' : 'clio_write_pages_orient_portrait');
      const note = fontsNoteNow();
      c.pageFonts.hidden = !note;
      c.pageFonts.textContent = note ? note.summary : '';
      if (note) c.pageFonts.title = note.summary;
    }
    function applyView() {
      if (disposed) return;
      ownDoc();
      if (session.view === 'pages') {
        const mark = selectionNow();
        if (mark) flowCaret = { anchor: mark.anchor, focus: mark.focus };
        const fit = typeof LY.zoomFor === 'function' ? LY.zoomFor('pageWidth') : 1;
        LY.zoom = Number.isFinite(fit) && scroller.clientWidth > 80 ? Math.max(0.25, Math.min(fit, 2)) : 1;
        LY.view = 'preview';
        LY.root.contentEditable = 'false';
        LY.root.setAttribute('contenteditable', 'false');
        E.sel = null;
        E.objSel = null;
        E.readOnly = true;
        LY.render();
        drawPageStrip();
        focusDocument();
      } else {
        LY.view = 'web';
        LY.zoom = 1;
        E.readOnly = false;
        LY.root.contentEditable = 'true';
        LY.root.setAttribute('contenteditable', 'true');
        LY.render();
        // The bookmark goes back where it was; if its paragraphs are gone, the top.
        if (!restoreSelection(flowCaret)) {
          const first = D.firstPara(D.doc.main.blocks);
          if (first) E.setSel(D.pos(first, 0), null, { noScroll: true, noDom: true });
        }
        flowCaret = null;
        syncCaret();
        focusDocument();
      }
      render();
    }
    function setDocView(view) {
      if (session.composing || composingNow()) return;
      if (session.view === view) return;
      session.setView(view);
      applyView();
      refreshMenus();
    }
    /* -- 打印 / 导出为 PDF (N2b): one road. The page view is laid out on its
       paper, only that paper is sent to the printer (styles/84-clio-write.css,
       body.is-cw-printing), and the browser's own dialog does the rest —
       「存储为 PDF」 there is this version's export. No second renderer. -- */
    function endPrint() {
      if (printCleanup) { root.removeEventListener('afterprint', printCleanup); printCleanup = null; }
      if (doc.body && doc.body.classList) doc.body.classList.remove('is-cw-printing');
      LY.zoom = 1;
      if (typeof LY.fitSizer === 'function') LY.fitSizer();
      if (!disposed && session.view === 'pages') { LY.zoom = typeof LY.zoomFor === 'function' && scroller.clientWidth > 80 ? Math.max(0.25, Math.min(LY.zoomFor('pageWidth'), 2)) : 1; if (typeof LY.fitSizer === 'function') LY.fitSizer(); }
    }
    function runPrint(asExport) {
      if (session.composing || composingNow()) return { status: 'blocked', code: 'IME_COMPOSING' };
      if (typeof root.print !== 'function') { session.setReceipt('clio_write_print_none', 'blocked'); return { status: 'blocked', code: 'NO_PRINT' }; }
      if (session.view !== 'pages') setDocView('pages');
      if (session.view !== 'pages' || disposed) return { status: 'blocked' };
      endPrint();   // a previous print's listener never lingers into this one
      doc.body.classList.add('is-cw-printing');
      LY.zoom = 1;   // true size on paper
      if (typeof LY.fitSizer === 'function') LY.fitSizer();
      printCleanup = endPrint;
      root.addEventListener('afterprint', printCleanup);
      if (asExport) session.setReceipt('clio_write_export_pdf_note', 'info');
      try { root.print(); } catch (error) { endPrint(); }
      return { status: 'ok' };
    }
    /* -- 「记录修订」 (N13b): the named toggle lives in the session; this half only
       keeps the composer safe and settles the chrome. */
    async function runTracking() {
      if (session.composing || composingNow()) return { status: 'blocked' };
      const out = await session.toggleTracking();
      refreshMenus();
      if (out.status === 'ok') focusDocument();
      return out;
    }
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
      if (id === 'view.pages') return setDocView('pages');
      if (id === 'view.flow') return setDocView('flow');
      if (id === 'file.print') return runPrint(false);
      if (id === 'file.export-pdf') return runPrint(true);
      if (id === 'file.mail-merge') return openMailMerge();
      if (id === 'comments.open') return openComments();
      if (id === 'revisions.open') return openRevisions();
      if (id === 'revisions.track') return runTracking();
      if (id === 'compare.open') return openCompare();
      if (id === 'word-count.open') return openWordCount();
      if (id === 'find.open') return openFind(false);
      if (id === 'find.next') return openFind(true);
      if (id === 'insert.image') return chooseImage();
      if (id === 'image.replace') return chooseReplaceImage();
      if (id.startsWith('table.')) return runTableCommand(id);
      if (id === 'edit.undo') return travel('undo');
      if (id === 'edit.redo') return travel('redo');
      if (id.startsWith('format.')) return runFormat(id, mark);
      return null;
    }
    // The upstream layer's own command names (L.ui.exec), mapped onto ours.
    const EXEC = Object.freeze({ undo: 'edit.undo', redo: 'edit.redo', bold: 'format.bold', italic: 'format.italic', underline: 'format.underline', save: 'file.save' });
    function exec(name) { const id = EXEC[name]; if (id) runCommand(id); }

    /* -- 插入 › 图片… (N10 门二): one named command puts {t:'img', media, w, h}
       at the caret. The picture's bytes go into the model's own media store
       (L.media, the reader's mechanism), the size comes from the pixels (pt =
       px·72/dpi, never wider than the text column), and the write-back is the
       editor's single path: E.edit → D.tx → doc-changed → adapter.syncExternal()
       — the same road typing takes, one 「插入图片」 undo step. The native file
       input stays behind the menu's Choose (core/image-attachments.js's accept). */
    let imageInput = null;
    function chooseImage() {
      const gate = session.commandState('insert.image');
      if (!gate.enabled) {
        if (gate.reason) session.setReceipt('clio_write_receipt_refused', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      if (session.composing || composingNow()) return { status: 'blocked', code: 'IME_COMPOSING' };
      if (!imageInput) {
        imageInput = h(doc, 'input', { type: 'file', accept: typeof CLIO_IMAGE_ACCEPT === 'string' ? CLIO_IMAGE_ACCEPT : 'image/*' });
        imageInput.hidden = true;
        imageInput.addEventListener('change', () => {
          const file = imageInput.files && imageInput.files[0];
          imageInput.value = '';
          if (file) insertImageFile(file, '插入图片');
        });
        c.pane.append(imageInput);
      }
      imageInput.click();
      return { status: 'ok' };
    }
    async function insertImageFile(file, label = '插入图片') {
      const fail = () => { session.setReceipt('clio_write_receipt_image_failed', 'error'); refreshMenus(); return { status: 'failed', reason: 'image' }; };
      const gate = session.commandState('insert.image');
      if (!gate.enabled) {
        if (gate.reason) session.setReceipt('clio_write_receipt_refused', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      if (session.composing || composingNow()) return { status: 'blocked', code: 'IME_COMPOSING' };
      const L = ed.L;
      let bytes = null;
      try { bytes = new Uint8Array(await file.arrayBuffer()); } catch (error) { bytes = null; }
      if (!bytes || !bytes.length) return fail();
      // The bytes first, then the size: the header sniffer needs no DOM (the
      // browser-only Image fallback covers what it cannot read).
      const media = L.media.add(file, file && file.name ? String(file.name) : 'image');
      let size = typeof L.imageSize === 'function' ? L.imageSize(bytes) : null;
      if ((!size || !size.w || !size.h) && root.Image && typeof L.loadImage === 'function') {
        try { const img = await L.loadImage(L.media.url(media)); size = { w: img.naturalWidth || 0, h: img.naturalHeight || 0, dpiX: 96, dpiY: 96 }; } catch (error) { size = null; }
      }
      if (!size || !size.w || !size.h) return fail();
      let w = (size.w * 72) / (size.dpiX || 96);
      let h = (size.h * 72) / (size.dpiY || 96);
      const sect = (D.doc && D.doc.sect) || {};
      const column = Math.max(72, (Number(sect.pgW) || 612) - (Number(sect.ml) || 0) - (Number(sect.mr) || 0));
      if (w > column) { h = h * (column / w); w = column; }
      const round = (v) => (typeof L.round === 'function' ? L.round(v, 2) : Math.round(v * 100) / 100);
      w = round(w); h = round(h);
      ownDoc();
      if (!E.objSel) E.syncSel();
      if (!E.sel) { const m = E.readDom(); if (m) E.sel = m; }
      if (!E.sel) return session.refuse('NO_CARET');
      let applied = false;
      try {
        applied = E.edit(label, () => O.insertItem(E.deleteSelection(), { t: 'img', media, w, h }));
      } catch (error) { applied = false; }
      if (!applied) return fail();
      refreshMenus();
      focusDocument();
      return { status: 'ok', media, w, h };
    }

    /* -- N10 补缺 换图: the selected picture's own command. The selection
       bookmark (one object run) names the picture; the new file's bytes go into
       the media store and swap in under the same item at the same position —
       one 「换图」 step on the editor's own road (E.edit → D.tx → doc-changed →
       syncExternal). 保留原尺寸: the original width and place stand; a new
       aspect ratio scales the height from that width (h = w·px 高/px 宽), the
       rule this feature ships with. Position never moves: only media (and,
       with a new ratio, h) change on the item. */
    let replaceInput = null;
    function chooseReplaceImage() {
      const gate = session.commandState('image.replace');
      if (!gate.enabled) {
        if (gate.reason) session.setReceipt('clio_write_receipt_refused', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      if (session.composing || composingNow()) return { status: 'blocked', code: 'IME_COMPOSING' };
      if (!replaceInput) {
        replaceInput = h(doc, 'input', { type: 'file', accept: typeof CLIO_IMAGE_ACCEPT === 'string' ? CLIO_IMAGE_ACCEPT : 'image/*' });
        replaceInput.hidden = true;
        replaceInput.addEventListener('change', () => {
          const file = replaceInput.files && replaceInput.files[0];
          replaceInput.value = '';
          if (file) replaceImageFile(file);
        });
        c.pane.append(replaceInput);
      }
      replaceInput.click();
      return { status: 'ok' };
    }
    async function replaceImageFile(file) {
      const fail = () => { session.setReceipt('clio_write_receipt_image_failed', 'error'); refreshMenus(); return { status: 'failed', reason: 'image' }; };
      const gate = session.commandState('image.replace');
      if (!gate.enabled) {
        if (gate.reason) session.setReceipt('clio_write_receipt_refused', 'blocked', [gate.reason]);
        return { status: 'blocked', reason: gate.reason };
      }
      if (session.composing || composingNow()) return { status: 'blocked', code: 'IME_COMPOSING' };
      const L = ed.L;
      let bytes = null;
      try { bytes = new Uint8Array(await file.arrayBuffer()); } catch (error) { bytes = null; }
      if (!bytes || !bytes.length) return fail();
      const media = L.media.add(file, file && file.name ? String(file.name) : 'image');
      let size = typeof L.imageSize === 'function' ? L.imageSize(bytes) : null;
      if ((!size || !size.w || !size.h) && root.Image && typeof L.loadImage === 'function') {
        try { const img = await L.loadImage(L.media.url(media)); size = { w: img.naturalWidth || 0, h: img.naturalHeight || 0, dpiX: 96, dpiY: 96 }; } catch (error) { size = null; }
      }
      if (!size || !size.w || !size.h) return fail();
      const c = session.caret;
      if (!c || c.revision !== undefined && c.revision !== session.revision()) return session.refuse('RESELECT');
      ownDoc();
      const picked = session.selectedPicture();
      const w0 = picked && Number.isFinite(picked.item.w) ? picked.item.w : null;
      if (picked == null || w0 == null) return session.refuse('RESELECT');
      const round = (v) => (typeof L.round === 'function' ? L.round(v, 2) : Math.round(v * 100) / 100);
      const h1 = round((w0 * size.h) / size.w);
      const p = D.byId(D.doc, Number(c.paragraphId));
      if (!p) return session.refuse('RESELECT');
      let applied = false;
      try {
        applied = E.edit('换图', () => {
          D.touch(p);
          let at = 0;
          let found = null;
          for (const item of p.runs) {
            const n = D.ilen(item);
            if (at === c.from && at + n === c.to && item.t === 'img') { found = item; break; }
            at += n;
          }
          if (found) { found.media = media; found.w = w0; found.h = h1; }
          return { a: D.pos(p, c.from), f: D.pos(p, c.to) };
        });
      } catch (error) { applied = false; }
      if (!applied) return fail();
      refreshMenus();
      focusDocument();
      return { status: 'ok', media, w: w0, h: h1 };
    }

    /* -- N10 第二阶段: one table-structure command from the 命令 popup. The
       session's own step names it; the upstream editor's doc-changed handler
       has re-laid the table out, so this only parks the caret where the step
       says it lands and re-reads the bookmark. */
    function runTableCommand(id) {
      if (session.composing) return null;
      syncCaret();
      const out = session.tableCommand(id);
      refreshMenus();
      if (out.status === 'ok' && out.select) {
        ownDoc();
        const p = D.byId(D.doc, Number(out.select.paragraphId));
        if (p && out.select.offset <= D.plen(p)) {
          E.objSel = null;
          E.setSel(D.pos(p, out.select.offset), D.pos(p, out.select.offset), { noScroll: true });
        }
      }
      syncCaret();
      focusDocument();
      return out;
    }

    /* -- comments windoid (⌘M): read, add, reply, resolve -- */
    function openComments() {
      if (!session.commentsAvailable()) return;
      if (session.view === 'pages') { session.refuse('PAGE_VIEW'); return; }   // N2b: the keys arrive here without the menu's gate
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

    /* -- revisions windoid (N13a): the list itself lives in the lazy review module
       (features/clio-write-review.js, config.js ensureClioWriteReviewModule); this
       window only opens it and hands over the surface calls the list needs. -- */
    function reviewContext() {
      return {
        session,
        doc,
        pane: c.pane,
        redraw,
        syncCaret,
        // Put the document selection on one revision (上一处/下一处 and row taps).
        selectRange: (paragraphId, from, to) => restoreSelection({ anchor: { id: String(paragraphId), o: from }, focus: { id: String(paragraphId), o: to } }),
        afterHistory,
        focus: focusDocument,
      };
    }
    function openRevisions() {
      if (!session.revisionsAvailable()) return;
      if (session.view === 'pages') { session.refuse('PAGE_VIEW'); return; }   // N2b
      syncCaret();
      const api = root.AISystem6ClioWriteReview;
      if (api && typeof api.open === 'function') { api.open(reviewContext()); return; }
      const ensure = root.AISystem6EnsureClioWriteReviewModule;
      if (typeof ensure !== 'function') return;
      ensure().then(() => {
        const review = root.AISystem6ClioWriteReview;
        if (review && typeof review.open === 'function') review.open(reviewContext());
      }).catch((error) => console.warn('ClioWrite: review module', error));
    }
    function refreshReview() {
      const review = root.AISystem6ClioWriteReview;
      if (review && typeof review.refresh === 'function') review.refresh();
    }
    function closeReview() {
      const review = root.AISystem6ClioWriteReview;
      if (review && typeof review.close === 'function') review.close();
    }
    function closeCompare() {
      const compare = root.AISystem6ClioWriteCompare;
      if (compare && typeof compare.close === 'function') compare.close();
    }
    /* -- 比较→修订 windoid (GenOffice compare): the engine and the windoid live
       in the lazy compare module (features/clio-write-compare.js, riding the
       review loader with the word-diff core); this window opens it with the same
       surface calls the revisions windoid takes. -- */
    function openCompare() {
      if (!session.revisionsAvailable()) return;
      if (session.view === 'pages') { session.refuse('PAGE_VIEW'); return; }   // N2b: adopting writes marks
      const api = root.AISystem6ClioWriteCompare;
      if (api && typeof api.open === 'function') { api.open(reviewContext()); return; }
      const ensure = root.AISystem6EnsureClioWriteReviewModule;
      if (typeof ensure !== 'function') return;
      ensure().then(() => {
        const compare = root.AISystem6ClioWriteCompare;
        if (compare && typeof compare.open === 'function') compare.open(reviewContext());
      }).catch((error) => console.warn('ClioWrite: compare module', error));
    }
    function refreshCompare() {
      const compare = root.AISystem6ClioWriteCompare;
      if (compare && typeof compare.refresh === 'function') compare.refresh();
    }
    // 字数统计… (N15b): the counting lives in the lazy module
    // (features/clio-write-word-count.js, riding the same config.js loader as
    // the review side path); this window only opens it and hands over the
    // same surface calls the revisions windoid takes.
    function openWordCount() {
      syncCaret();
      const api = root.AISystem6ClioWriteWordCount;
      if (api && typeof api.open === 'function') { api.open(reviewContext()); return; }
      const ensure = root.AISystem6EnsureClioWriteReviewModule;
      if (typeof ensure !== 'function') return;
      ensure().then(() => {
        const counter = root.AISystem6ClioWriteWordCount;
        if (counter && typeof counter.open === 'function') counter.open(reviewContext());
      }).catch((error) => console.warn('ClioWrite: word count module', error));
    }

    /* -- the shared 查找 / 替换 windoid (N3): the window itself lives in the lazy
       find module (features/clioworks-find.js, config.js
       ensureClioWorksFindModule); this surface only hands over what the windoid
       needs — the live adapter, this document's selection, a way to put the
       selection on one match, and the repaint + dirty path of a hand edit. -- */
    function findContext() {
      return {
        appId: 'clioWrite',
        kind: 'docx',
        name: opts.fileName,
        adapter: session.adapter,
        doc,
        pane: c.pane,
        commitPending: () => true,
        // 选中文字's box: one body paragraph's range, or nothing — a caret, a
        // multi-paragraph selection, a table or an object searches the whole
        // document, the way MacWrite II did.
        selection: () => {
          syncCaret();
          const m = session.caret;
          return m && !m.collapsed && !m.table && !m.other && m.paragraphs === 1
            ? { paragraphId: m.paragraphId, from: m.from, to: m.to }
            : null;
        },
        // Put the document selection on a body-paragraph match (scroll to and
        // highlight the range); the read-only table, the notes and the comments
        // have nowhere to put a caret, so they are counted but not shown.
        select(match) {
          const loc = match && match.locator;
          if (!loc || match.readOnly || loc.story !== 'main' || (Array.isArray(loc.path) && loc.path.length > 1)) return false;
          return restoreSelection({ anchor: { id: String(loc.paragraphId), o: loc.from }, focus: { id: String(loc.paragraphId), o: loc.to } });
        },
        // After a replace the engine's own transaction already reached the
        // adapter; this is the chrome half: repaint the document, count the
        // edit once, re-read the selection, refresh the windoids and menus.
        afterEdit() {
          redraw();
          session.noteExternalEdit();
          syncCaret();
          afterHistory();
        },
      };
    }
    function openFind(next) {
      if (session.view === 'pages') { session.refuse('PAGE_VIEW'); return; }   // N2b: its matches would put a caret in the pages
      const ctx = findContext();
      const api = root.AISystem6ClioWorksFind;
      if (api && typeof api.open === 'function') { if (next) api.next(ctx); else api.open(ctx); return; }
      const ensure = root.AISystem6EnsureClioWorksFindModule;
      if (typeof ensure !== 'function') return;
      ensure().then(() => {
        const found = root.AISystem6ClioWorksFind;
        if (!found || typeof found.open !== 'function') return;
        if (next && typeof found.next === 'function') found.next(ctx);
        else found.open(ctx);
      }).catch((error) => console.warn('ClioWrite: find module', error));
    }
    function closeFind() {
      const found = root.AISystem6ClioWorksFind;
      if (found && typeof found.close === 'function') found.close();
    }
    /* -- 邮件合并 (features/clioworks-mailmerge.js, config.js's loader): this
       surface hands the lazy dialog the live document — the template is READ
       through the adapter's blocks, a clicked column name is INSERTED at the
       caret through the editor's own single path (E.edit → D.tx, one named
       undo step), and nothing the merge writes back ever reaches the model:
       its output is files and paper, not manuscript edits. -- */
    function insertMergeField(text) {
      ownDoc();
      if (E.objSel) { session.refuse('READ_ONLY_IMAGE'); return { status: 'blocked' }; }
      if (session.view === 'pages') { session.refuse('PAGE_VIEW'); return { status: 'blocked' }; }
      syncCaret();
      const caret = session.caret;
      if (!caret || caret.other || caret.table) { session.setReceipt('clioworks_mail_merge_need_caret', 'blocked'); return { status: 'blocked' }; }
      const verdict = session.gate('text', caret);
      if (!verdict.allow) return { status: 'blocked' };
      const applied = E.insertTextAt(String(text || ''), '插入邮件合并占位符');
      if (!applied) return { status: 'failed' };
      session.noteExternalEdit();
      syncCaret();
      refreshMenus();
      focusDocument();
      return { status: 'ok' };
    }
    function mailMergeContext() {
      return {
        appId: 'clioWrite',
        name: () => opts.fileName || active.mountedName || '',
        blocks: () => session.adapter.blocks(),
        pageGeometry: () => session.pageGeometry(),
        language: () => (typeof root.currentLanguage !== 'undefined' && root.currentLanguage === 'zh' ? 'zh' : 'en'),
        insert: insertMergeField,
      };
    }
    function openMailMerge() {
      if (session.composing || composingNow()) return { status: 'blocked' };
      const ctx = mailMergeContext();
      const api = root.AISystem6ClioworksMailMerge;
      if (api && typeof api.open === 'function') { api.open(ctx); return { status: 'ok' }; }
      const ensure = root.AISystem6EnsureClioworksMailMerge;
      if (typeof ensure !== 'function') return { status: 'failed' };
      ensure().then(() => { root.AISystem6ClioworksMailMerge?.open?.(ctx); })
        .catch((error) => console.warn('ClioWrite: mail merge module', error));
      return { status: 'ok' };
    }
    /* -- substituted fonts (N12): the display words live in the lazy
       clio-write-fonts.js, which rides this window's loader; this window only
       shows the note and the list windoid. The named fonts cannot change
       through this window's own commands (no font picker; pastes insert plain
       text), so the note is read once per mounted document and again on a
       rebind; the windoid re-reads the live model when it opens. -- */
    function fontsNoteNow() {
      const fonts = root.AISystem6ClioWriteFonts;
      if (!fonts || typeof fonts.substitutions !== 'function' || typeof fonts.note !== 'function') return null;
      return fonts.note(fonts.substitutions(session.adapter.document(), null));
    }
    function mountFonts() {
      if (!c.fontNote) return;
      const note = fontsNoteNow();
      c.fontNote.hidden = !note;
      if (!note) { c.fontNote.textContent = ''; c.fontNote.title = ''; return; }
      c.fontNote.textContent = tr('clio_write_fonts_note', note.count);
      c.fontNote.title = note.summary;
    }
    function openFontsWindoid() {
      // A second click closes it again, the way a menu does.
      if (fontsWindoid) { fontsWindoid.handle.close(); fontsWindoid = null; return; }
      const note = fontsNoteNow();
      if (!note) return;
      const handle = createWindoid(doc, c.pane, {
        title: tr('clio_write_fonts_title'),
        className: 'cw-fonts-windoid',
        onClose: () => { if (fontsWindoid && fontsWindoid.handle === handle) fontsWindoid = null; },
      });
      const ul = h(doc, 'ul', { class: 'windoid-threads cw-fonts-list' });
      note.rows.forEach((row) => ul.append(h(doc, 'li', { class: 'windoid-thread cw-fonts-row', text: row.text })));
      handle.body.append(h(doc, 'p', { class: 'windoid-note', text: note.summary }), ul);
      handle.place();
      fontsWindoid = { handle, refresh: openFontsWindoid };
    }
    on(c.fontNote, 'click', () => { syncCaret(); openFontsWindoid(); });
    // Undo/redo and every outside-the-editor edit land here: both windoids read the model again.
    function afterHistory() { refreshWindoid(); refreshReview(); refreshCompare(); refreshMenus(); }

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
      const pages = session.view === 'pages';
      c.win.dataset.mode = session.mode;
      c.win.dataset.view = session.view;
      c.win.dataset.receiptKind = session.receipt.kind;
      c.win.dataset.dirty = String(session.isDirty());
      c.receiptEl.textContent = session.receiptText() || tr('clio_write_receipt_clean');
      c.fileEl.textContent = opts.fileName || '';
      setPopLabel(c.modeBtn, tr(express ? 'clio_write_mode_express' : 'clio_write_mode_full'));
      setPopLabel(c.cmdBtn, tr('clio_stage_native_commands'));
      if (c.titleEl) c.titleEl.textContent = (express ? 'ClioWrite Express' : 'ClioWrite') + (pages ? tr('clio_write_title_pages') : '');
      // N2b: while the pages are up the ruler is a flow-view thing; the strip takes its place.
      c.ruler.hidden = express || pages;
      c.pageStrip.hidden = !pages;
      c.printBtn.textContent = tr('clio_write_menu_print');
      c.printBtn.title = tr('clio_write_pagebar_print_hint');
      c.closeBtn.textContent = tr('clio_write_pagebar_close');
      c.closeBtn.title = tr('clio_write_pagebar_close_hint');
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
      c.captionEl.textContent = pages
        ? tr('clio_write_caption_pageview')
        : [
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
    // N2b: the page view's own two verbs — the print road, and ⌘. as a button.
    on(c.printBtn, 'click', () => runPrint(false));
    on(c.closeBtn, 'click', () => setDocView('flow'));
    // A re-layout (undo, a rebind, a resize) redraws the page count in the strip.
    if (ed.L.bus && typeof ed.L.bus.on === 'function') cleanups.push(ed.L.bus.on('layout-done', () => { if (!disposed && session.view === 'pages') drawPageStrip(); }));
    on(c.cmdBtn, 'click', () => openMenu(c.cmdBtn, session.commands().filter((command) => !command.id || !command.id.startsWith('format.')).map((command) => ({
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
    /* -- N11: the desk's own clipboard (features/clioworks-clipboard.js) --------
       A copy with a real selection also writes the desk board (a frozen 带来源
       副本) while the system clipboard keeps its exact behaviour — the upstream
       editor's own copy handler still runs and still sets text/plain, text/html
       and its own private flavour. A paste reads the desk board FIRST; only an
       empty board walks the plain-text path below. */
    function deskClipboard() { return root.AISystem6ClioworksClipboard || null; }
    // A table or paragraphs land at a caret in the body — the 插入图片 gate's
    // places minus the inside of a table, where a block cannot be nested in.
    function gateStructuredPaste(event) {
      ownDoc();
      if (session.confirming || systemModalOpen()) { event.preventDefault(); event.stopImmediatePropagation(); return true; }
      if (E.objSel || pictureHeld) { refuseEvent(event, 'READ_ONLY_IMAGE'); return true; }
      const caret = selectionNow();
      if (caret && caret.table) { refuseEvent(event, 'READ_ONLY_TABLE'); return true; }
      const verdict = gateInput(session.mode, 'text', caret);
      if (!verdict.allow) { refuseEvent(event, verdict.code); return true; }
      return false;
    }
    function pasteFromDeskBoard(event) {
      const clip = deskClipboard();
      if (!clip) return false;
      const entry = clip.peek();
      if (!entry) return false;
      const source = entry.source;
      const note = () => session.setReceipt('clio_write_receipt_paste_from', 'info', [source.fileName || source.fileId, source.range]);
      let applied = false;
      try {
        if (entry.kind === 'chart-region') {
          // The region becomes one docx table in ClioWrite's own model
          // (D.simpleTable + O.insertBlockAt), one named step.
          const rows = Array.isArray(entry.snapshot.rows) ? entry.snapshot.rows : [];
          const cols = rows.reduce((n, row) => Math.max(n, Array.isArray(row) ? row.length : 0), 0);
          if (!rows.length || !cols) return false;
          if (gateStructuredPaste(event)) return true;
          applied = E.edit('粘贴：来自 ClioChart 的表格', () => {
            const sect = (D.doc && D.doc.sect) || {};
            // The text measure the model itself uses (fields.js textWidth).
            const column = Math.max(72, (Number(sect.pgW) || 612) - (Number(sect.ml) || 0) - (Number(sect.mr) || 0) - (Number(sect.gutter) || 0));
            const table = D.simpleTable(rows.length, cols, column);
            table.rows.forEach((row, ri) => row.cells.forEach((cell, ci) => {
              const text = rows[ri] && rows[ri][ci] && rows[ri][ci].text;
              if (text == null || text === '') return;
              const p = D.firstPara(cell.blocks);
              if (!p) return;
              p.runs = [D.text(String(text), {})];
            }));
            return O.insertBlockAt(E.deleteSelection(), table);
          });
        } else if (entry.kind === 'write-blocks') {
          // Another document's paragraphs (tables included), one named step.
          if (gateStructuredPaste(event)) return true;
          applied = E.edit('粘贴：来自 ClioWrite 的段落', () => O.insertBlocks(E.deleteSelection(), entry.snapshot.blocks));
        } else {
          // Anything else the board holds pastes as its plain text — the same
          // words the system clipboard would have carried, one 「粘贴」 step.
          pastePlain(event, clip.plainOf(entry), 'Paste');
          return true;
        }
      } catch (error) { applied = false; }
      if (applied) { note(); refreshMenus(); focusDocument(); }
      return true;
    }
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
      // N2b: the page view owns the keyboard. ⌘. closes it; the ⌘ rows that
      // still make sense (save, undo, print, the view rows) run; every key
      // that would edit is refused with the page-view words; the scroll keys
      // move the scroller, because the pages hold no caret to move.
      if (session.view === 'pages') {
        if (commandKey(event) && !event.altKey) {
          const cmdId = keyCommand(session, event);
          event.preventDefault();
          event.stopImmediatePropagation();
          if (cmdId && cmdId !== 'view.flow') runCommand(cmdId);
          else if (cmdId === 'view.flow' || event.key === '.') setDocView('flow');
          return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (/^(Shift|Control|Alt|Meta|CapsLock|Escape|Fn)$/.test(k)) { if (k === 'Escape') event.stopImmediatePropagation(); return; }
        const step = k === 'PageDown' || k === 'PageUp' ? Math.max(48, scroller.clientHeight - 48) : k === 'Home' || k === 'End' ? scroller.scrollHeight : 48;
        if (k === 'ArrowDown' || k === 'PageDown') { event.preventDefault(); event.stopImmediatePropagation(); scroller.scrollTop += step; return; }
        if (k === 'ArrowUp' || k === 'PageUp') { event.preventDefault(); event.stopImmediatePropagation(); scroller.scrollTop -= step; return; }
        if (k === 'Home') { event.preventDefault(); event.stopImmediatePropagation(); scroller.scrollTop = 0; return; }
        if (k === 'End') { event.preventDefault(); event.stopImmediatePropagation(); scroller.scrollTop = scroller.scrollHeight; return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        session.refuse('PAGE_VIEW');
        return;
      }
      ownDoc();
      if (commandKey(event) && !event.altKey) {
        const id = keyCommand(session, event);
        if (id) { event.preventDefault(); event.stopImmediatePropagation(); runCommand(id); return; }
      }
      const chord = event.ctrlKey || event.metaKey;
      if (k === 'Tab') { event.stopImmediatePropagation(); return; }   // focus moves on; no tab characters, no indent
      // N10: a selected picture gives way to the caret — the arrow key puts the
      // caret before (ArrowLeft) or after it, which ends the object selection the
      // way any text selection does. A floating object is still never nudged.
      if (E.objSel && /^Arrow/.test(k)) {
        const os = E.objSel;
        if (!os.float && os.it && os.it.t === 'img') {
          event.preventDefault();
          event.stopImmediatePropagation();
          E.setSel(D.pos(os.p, k === 'ArrowLeft' ? os.o : os.o + 1));
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
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
    // N10: a picture on the clipboard (a screenshot) is a file item — it goes in
    // through the same named command as 插入 › 图片…, one 「粘贴图片」 step; text
    // paste keeps its behaviour exactly.
    on(scroller, 'paste', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (session.composing) return;
      // N11: the desk's own clipboard outranks the system one — a copy made in
      // ClioChart or another ClioWrite keeps its shape and its source here.
      if (pasteFromDeskBoard(event)) return;
      let text = '';
      try { text = event.clipboardData ? event.clipboardData.getData('text/plain') : ''; } catch (error) { text = ''; }
      if (!text) {
        const items = event.clipboardData ? event.clipboardData.items : null;
        const imageItem = items && typeof items.length === 'number'
          ? Array.prototype.find.call(items, (item) => !!item && item.kind === 'file' && String(item.type || '').startsWith('image/'))
          : (items ? Array.from(items).find((item) => !!item && item.kind === 'file' && String(item.type || '').startsWith('image/')) : null);
        const file = imageItem && typeof imageItem.getAsFile === 'function' ? imageItem.getAsFile() : null;
        if (file) { insertImageFile(file, '粘贴图片'); return; }
      }
      pastePlain(event, text, 'Paste');
    }, true);
    // N11: the copy side only observes. The upstream editor's own handler runs
    // after this and fills the system clipboard exactly as before; this capture
    // listener additionally puts the frozen 带来源副本 on the desk board.
    on(scroller, 'copy', (event) => {
      const clip = deskClipboard();
      if (!clip || session.composing) return;
      ownDoc();
      let data = null;
      try { data = E.copyData(); } catch (error) { data = null; }
      if (!data || !Array.isArray(data.blocks) || !data.blocks.length) return;
      // The live selection names the range; the synced caret is only the fallback.
      const caret = selectionNow() || session.caret;
      clip.writeBlocks(data.blocks, data.text, {
        fileId: opts.record && opts.record.id ? String(opts.record.id) : opts.mountedName || '',
        fileName: opts.fileName || '',
        range: caret && caret.paragraphs ? `paragraphs:${caret.paragraphs}` : '',
      });
    }, true);
    on(scroller, 'cut', (event) => { ownDoc(); gated(event, 'delete'); }, true);
    on(scroller, 'drop', (event) => refuseEvent(event, 'DROP'), true);
    on(scroller, 'dragstart', (event) => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
    // Shapes, floating objects and form check boxes are shown, never edited: a
    // press on one would select it, a click on a check box would tick it, both
    // straight into the model. N10 opened the picture's own door: a press on an
    // inline picture selects it (the upstream .obj-handles appear; dragging a
    // corner resizes it as one 「Resize Picture」 step), and the press reaches
    // the upstream editor, so a plain click never moves the caret.
    const OBJECT_PARTS = '.shp, .flt, .obj, .ffcb, [data-control]';
    const objectPress = (event) => {
      const target = event.target;
      // N2b: no caret, no selection and no object press in the page view. One
      // exception, and it is one-way: a click on the text jumps back to the
      // flow view at that paragraph (the fragment names it; nothing is mapped
      // live). A click on the paper's margin keeps the pages up.
      if (session.view === 'pages') {
        if (event.type !== 'click') { event.preventDefault(); event.stopImmediatePropagation(); return; }
        const frag = target && typeof target.closest === 'function' ? target.closest('.p[data-pid]') : null;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!frag || !frag.dataset.pid) return;
        ownDoc();
        const pid = Number(frag.dataset.pid);
        const p = D.byId(D.doc, pid);
        if (!p) return;
        const at = Number(frag.dataset.from) || 0;
        flowCaret = { anchor: { id: String(pid), o: at }, focus: { id: String(pid), o: at } };
        setDocView('flow');
        return;
      }
      if (!target || typeof target.closest !== 'function' || !target.closest(OBJECT_PARTS)) { if (event.type === 'mousedown' || event.type === 'pointerdown') pictureHeld = false; return; }
      ownDoc();
      // The press is swallowed, so the caret stays where it was: what is typed
      // next was aimed at the object, and the refusal names it.
      pictureHeld = true;
      event.stopImmediatePropagation();
      if (target.closest('.ffcb, [data-control]')) event.preventDefault();
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
          : session.view === 'pages' ? { allow: false, code: 'PAGE_VIEW' }
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
      // N2b: leave the shared upstream layer as the next document expects it —
      // flowing, editable, unscaled — and take the print state down with us.
      if (printCleanup) { root.removeEventListener('afterprint', printCleanup); printCleanup = null; }
      if (doc.body && doc.body.classList) doc.body.classList.remove('is-cw-printing');
      if (session.view === 'pages') session.setView('flow');
      LY.view = 'web';
      LY.zoom = 1;
      E.readOnly = false;
      c.layer.hidden = true;
      c.layer.replaceChildren();
      if (windoid) { try { windoid.handle.close(); } catch (error) { /* already gone */ } windoid = null; }
      if (fontsWindoid) { try { fontsWindoid.handle.close(); } catch (error) { /* already gone */ } fontsWindoid = null; }
      closeReview();
      closeCompare();
      closeFind();
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
      delete c.win.dataset.view;
      delete c.win.dataset.dirty;
      delete c.win.dataset.receiptKind;
    }

    c.emptyEl.hidden = true;
    scroller.hidden = false;
    c.fontNote.hidden = true;
    try {
      bindDocument(session.adapter);
      offSession = session.subscribe(render);
      syncCaret();
      render();
      mountFonts();
      applyView();   // N2b: a fresh mount always starts flowing; this is the idempotent guard
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
      findContext,
      // N10: the insert the 插入 › 图片… row and a pasted picture take (the
      // contract drives it without a native file picker).
      insertImageFile,
      // N10 补缺: the replace the selected picture's 换图… row takes.
      replaceImageFile,
      rebind(adapter) { bindDocument(adapter); syncCaret(); mountFonts(); refreshWindoid(); refreshReview(); refreshCompare(); applyView(); },
      afterHistory,
      refreshReview,
      refreshCompare,
      unmount: teardown,
    };
  }

  function keyCommand(session, event) {
    const key = String(event.key || '').toLowerCase();
    if (event.shiftKey) return key === 'z' ? 'edit.redo' : '';
    if (key === 'e') return 'view.mode';
    if (key === 's') return 'file.save';
    // N2b: ⌘P prints through the page view, and ⌘. closes the page view (only
    // while it is up — the desk's panic key keeps its meaning everywhere else).
    if (key === 'p') return 'file.print';
    if (key === '.') return session.view === 'pages' ? 'view.flow' : '';
    if (key === 'z') return 'edit.undo';
    if (key === 'y') return 'edit.redo';
    if (key === 'f') return 'find.open';
    if (key === 'g') return 'find.next';
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
    c.pageStrip.hidden = true;
    c.receiptEl.textContent = '';
    c.fileEl.textContent = '';
    c.fontNote.hidden = true;
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
    // N13b: the codec's stamps (and cp:lastModifiedBy) read L.store 'userName'; give
    // that store its localStorage backing before any edit, so a file whose own
    // w:trackRevisions is already on stamps with the remembered name too.
    ensureVendorSettings();
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
      // N13b: the first 修订署名 question — asked only when no name is
      // remembered yet, on System 6's own input dialog. Renaming afterwards
      // is the 修订 windoid's 「署名…」 button (renameRevisionAuthor below).
      askRevisionAuthor: async (remembered) => {
        if (typeof root.showInputDialog !== 'function') return null;
        const answer = await root.showInputDialog({ title: tr('clio_write_track_menu'), message: tr('clio_write_track_author_message'), defaultValue: remembered });
        return answer == null ? null : String(answer).trim();
      },
    });
    entry.session = session;
    c.modeBtn.hidden = false;
    c.cmdBtn.hidden = false;
    try {
      entry.surface = mountSurface(c, ed, session, { fileName, mountedName, record });
    } catch (error) {
      session.close();
      console.warn('ClioWrite: mount', error);
      drawEmpty();
      return { ok: false, reason: 'mount-failed' };
    }
    active = entry;
    session.subscribe(syncMenuMarks);
    entry.surface.focus();
    // N11: the desk clipboard module rides along with the document, so the
    // first copy's capture listener finds it present.
    if (typeof root.AISystem6EnsureClioworksClipboard === 'function') root.AISystem6EnsureClioworksClipboard().catch(() => {});
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
    'clio-write-revisions': ['revisions.open', '', 'clio_write_revisions_menu'],
    // N13b: the 「记录修订」 check row beside 修订….
    'clio-write-track': ['revisions.track', '', 'clio_write_track_menu'],
    // 比较→修订: the compare windoid, beside the revisions rows it feeds.
    'clio-write-compare': ['compare.open', '', 'clio_write_compare_menu'],
    'clio-write-word-count': ['word-count.open', '', 'clio_write_word_count_menu'],
    'clio-write-find': ['find.open', 'f', 'clioworks_find_replace_menu'],
    'clio-write-find-next': ['find.next', 'g', 'find_next'],
    // N10: the picture insert, one named step.
    'clio-write-insert-image': ['insert.image', '', 'clio_write_insert_image'],
    'clio-write-mode-express': ['view.mode.express', 'e', 'clio_write_mode_express'],
    'clio-write-mode-full': ['view.mode.full', '', 'clio_write_mode_full'],
    // N2b: the read-only page view; printing and the PDF export ride the same road.
    'clio-write-view-pages': ['view.pages', '', 'clio_write_view_pages'],
    'clio-write-view-flow': ['view.flow', '', 'clio_write_view_flow'],
    'clio-write-print': ['file.print', 'p', 'clio_write_menu_print'],
    'clio-write-export-pdf': ['file.export-pdf', '', 'clio_write_menu_export_pdf'],
    // 邮件合并: the File menu's one row; the lazy dialog rides config.js's loader.
    'clio-write-mail-merge': ['file.mail-merge', '', 'clioworks_mail_merge_menu'],
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
      'clio-write-view-pages': s.view === 'pages', 'clio-write-view-flow': s.view === 'flow',
      'clio-write-heading-1': level === 1, 'clio-write-heading-2': level === 2, 'clio-write-heading-3': level === 3, 'clio-write-body': level === 0,
      'clio-write-bullets': list === 'bullet', 'clio-write-numbering': list === 'number',
      'clio-write-track': s.trackingOn(),
    };
    for (const [action, value] of Object.entries(marks)) {
      root.document.querySelectorAll(`[data-app-menu] [data-action="${action}"]`).forEach((button) => button.classList.toggle('is-checked', !!value));
    }
    // Edit › Undo names the step it takes back (「撤销键入」); a 「全部替换 N 处」
    // keeps its count (editHistory's undoLabelArgs feeds the translation).
    for (const [action, getter, plain] of [['clio-write-undo', 'undoLabel', 'undo'], ['clio-write-redo', 'redoLabel', 'redo']]) {
      const step = s.editHistory[getter]();
      const args = typeof s.editHistory[`${getter}Args`] === 'function' ? s.editHistory[`${getter}Args`]() : [];
      const text = step ? tr(`${plain}_step`, tr(step, ...args)) : tr(plain);
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
      // N4: 新建… (⌘N) makes a new Office document (a blank 文稿 by default
      // here); 存为文具… marks the open document a stationery pad. Both are
      // the desk's commands (actions.js), not this session's.
      { id: 'file', labelKey: 'menu_file', items: [editRow('new-office-document', 'office_new_blank', 'new-office-document'), menuRow('clio-write-save'), editRow('clio-write-save-as', 'clioworks_save_as', 'clio-write-save-as'), menuRow('clio-write-revert'), editRow('office-save-as-stationery', 'office_save_as_stationery'), sep, menuRow('clio-write-mail-merge'), menuRow('clio-write-print'), menuRow('clio-write-export-pdf'), sep, editRow('close-active-window', 'close', 'close-window')] },
      { id: 'edit', labelKey: 'menu_edit', items: [menuRow('clio-write-undo'), menuRow('clio-write-redo'), sep, editRow('cut', 'cut', 'cut'), editRow('copy', 'copy', 'copy'), editRow('paste', 'paste', 'paste'), editRow('select-all', 'select_all', 'select-all'), sep, menuRow('clio-write-find'), menuRow('clio-write-find-next'), sep, menuRow('clio-write-comment'), menuRow('clio-write-revisions'), menuRow('clio-write-track'), menuRow('clio-write-compare'), menuRow('clio-write-word-count')] },
      // N10: 插入 › 图片… — one row of its own menu, the way Word keeps Insert apart.
      { id: 'insert', labelKey: 'menu_insert', items: [menuRow('clio-write-insert-image')] },
      { id: 'view', labelKey: 'menu_view', items: [menuRow('clio-write-mode-express'), menuRow('clio-write-mode-full'), sep, menuRow('clio-write-view-pages'), menuRow('clio-write-view-flow')] },
      { id: 'format', labelKey: 'menu_format', items: [menuRow('clio-write-heading-1'), menuRow('clio-write-heading-2'), menuRow('clio-write-heading-3'), menuRow('clio-write-body'), sep, menuRow('clio-write-bold'), menuRow('clio-write-italic'), menuRow('clio-write-underline'), sep, menuRow('clio-write-bullets'), menuRow('clio-write-numbering')] },
      ...(typeof windowMenu === 'function' ? [windowMenu()] : []),
    ];
  }

  // Save As… (N0) is the host's, not the session's: the open document becomes
  // a new Project Hard Disk file, or a download. ⇧⌘S reaches it through the
  // desk's shortcut table while ClioWrite is in front (keyCommand leaves ⇧S alone).
  const saveAsCommand = {
    handler: () => (active && fn(nativeHost(), 'saveNativeDocumentAs') ? nativeHost().saveNativeDocumentAs(active.mountedName) : null),
    isAvailable: () => !!active && !active.session.saving && !active.session.composing && fn(nativeHost(), 'saveNativeDocumentAs'),
    unavailableReason: () => (active ? '' : tr('clio_write_reason_no_document')),
  };

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
    current: () => (active ? { mountedName: active.mountedName, mode: active.session.mode, view: active.session.view, dirty: active.session.isDirty() } : null),
    hasUnsaved: () => !!active && active.session.isDirty(),
    // The Edit menu's history while a document is mounted (registerEditHistory below).
    editHistory: () => (active ? active.session.editHistory : null),
    // N3: the surface the shared 查找 / 替换 windoid acts through, or null.
    findContext: () => (active && active.surface && typeof active.surface.findContext === 'function' ? active.surface.findContext() : null),
    // N10: the picture insert the 插入 › 图片… row and a clipboard screenshot take.
    insertImage: (file, label) => (active && active.surface && typeof active.surface.insertImageFile === 'function' ? active.surface.insertImageFile(file, label) : { status: 'failed', reason: 'unavailable' }),
    // N10 补缺: the picture replace the selected picture's 换图… row takes.
    replaceImage: (file) => (active && active.surface && typeof active.surface.replaceImageFile === 'function' ? active.surface.replaceImageFile(file) : { status: 'failed', reason: 'unavailable' }),
    listed,
    commandState: (commandId) => (active ? active.session.commandState(baseId(commandId)) : null),
    createSession,
    describe,
    gateInput,
    stepKey,
    groupComments,
    // N13b: the 修订 windoid's 「署名…」 button asks and remembers the
    // revision author's name (the toggle itself only asks the first time).
    renameRevisionAuthor,
    // 比较→修订: the compare windoid reads the remembered revision name the
    // same way (a first compare with none remembered asks once through the
    // same dialog), so its stamps carry the name the revisions list shows.
    revisionAuthor,
    // N2b: the paper metrics (pure sect read; the page view's strip draws them).
    pageMetrics: pageMetricsFrom,
    // N13b bridge: the lazy review (N13a) and word-count (N15b) windoids build
    // through this window's own windoid maker; without it on the API their
    // open() returned before ever drawing.
    createWindoid,
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
    if (!keyboardShortcutRegistry.some((entry) => entry.id === 'clio-write-save-as')) {
      keyboardShortcutRegistry.push({ id: 'clio-write-save-as', key: 's', shift: true, action: 'clio-write-save-as', display: '⇧⌘S', labelKey: 'clioworks_save_as', keyCaps: true, scope: ['clioWrite'] });
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
          'clio-write-save-as': saveAsCommand,
        },
      });
    } catch (error) { /* registered by an earlier load */ }
  }
  if (fn(root, 'AISystem6RegisterApplicationMenuSet')) root.AISystem6RegisterApplicationMenuSet('clioWrite', menuDefinitions());
  installWindow();
})(typeof window !== 'undefined' ? window : globalThis);
