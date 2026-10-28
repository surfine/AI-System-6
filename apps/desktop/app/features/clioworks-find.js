/* ClioWorks N3 (UI): the shared 查找 / 替换 windoid for ClioWrite, the ClioChart
 * workbook and ClioStage.
 *
 * One non-modal windoid, MacWrite II style: it floats over the editor in front,
 * drags by its title bar, and collapses to its title bar (the shade box) and is
 * kept around. The three editors hand over one surface each (findContext in
 * features/clio-write.js, clio-chart-workbook.js, clio-stage-native.js): the
 * live adapter session, the document kind, the editor's own selection, a way to
 * put the selection on one match, and the repaint + dirty path of a hand edit.
 * This file owns no model code — search and replace go through
 * ClioWorksFindReplace (app/vendor/clioworks-v3/find-replace.js), whose
 * 「全部替换」 is one named step per document in that document's undo history.
 *
 * Scope 本文稿 / 选中文字 searches the front document (选中文字 keeps the box it
 * was given: putting the selection on a match must not shrink the next search);
 * 全部打开的文件 walks every document the three editors hold — one named undo
 * step per document, counts listed per document — and never reaches TeachText
 * or any other writing-route manuscript, because only the three Office editors
 * are ever asked. Read-only matches (ClioWrite tables, formula display values,
 * deck shapes without an editable text box) are counted and reported, never
 * replaced.
 *
 * The search-state half is pure (wrapIndex, statusText, engineOptions,
 * filterSelection, planAllFiles, replaceAllFiles, readOnlyNote) so
 * tests/features/clioworks-n3-find-ui.test.mjs can drive it against the real
 * codecs and adapters without a window. Loaded lazily by config.js's
 * ensureClioWorksFindModule, after the engine and with the ClioWrite lazy
 * stylesheet; only the 编辑 menu rows and this loader are eager. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWorksFind) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);

  /* Only these editors are ever asked for a document — that is the whole reason
   * the 「全部打开的文件」 scope cannot reach TeachText or a writing-route stop. */
  const OFFICE_APPS = Object.freeze(['clioWrite', 'clioChart', 'clioStage']);
  const OFFICE_EDITORS = Object.freeze([
    () => root.AISystem6ClioWrite,
    () => root.AISystem6ClioChartWorkbook,
    () => root.AISystem6ClioStageNative,
  ]);
  const READONLY_KEYS = Object.freeze({
    docx: 'clioworks_find_readonly_docx',
    xlsx: 'clioworks_find_readonly_xlsx',
    pptx: 'clioworks_find_readonly_pptx',
  });
  const CHECK_KEYS = Object.freeze({
    case: 'clioworks_find_case',
    fullHalf: 'clioworks_find_full_half',
    wholeWord: 'clioworks_find_whole_word',
    comments: 'clioworks_find_comments',
    formulas: 'clioworks_find_formulas',
    notes: 'clioworks_find_notes',
  });
  /* The checkbox row per document kind: what the engine's options mean there. */
  const CHECK_ROWS = Object.freeze({
    docx: ['case', 'fullHalf', 'wholeWord', 'comments'],
    xlsx: ['case', 'fullHalf', 'wholeWord', 'formulas'],
    pptx: ['case', 'fullHalf', 'wholeWord', 'notes'],
  });
  const SCOPES = Object.freeze(['doc', 'selection', 'files']);
  const SCOPE_KEYS = Object.freeze({
    doc: 'clioworks_find_scope_doc',
    selection: 'clioworks_find_scope_selection',
    files: 'clioworks_find_scope_files',
  });
  const REPLACE_ALL_LABEL = /^全部替换 (\d+) 处$/;

  /* --------------------------------------------- search state, as pure functions */

  /** 查找下一个 / 查找上一个: one step with wrap; no matches at all is no index. */
  function wrapIndex(at, total, delta) {
    if (!total) return -1;
    const step = delta < 0 ? -1 : 1;
    return ((Number(at) + step) % total + total) % total;
  }

  /** The status line 「第 n 处 / 共 m 处」; nothing found says so in its own words. */
  function statusText(at, total) {
    if (!total) return { key: 'clioworks_find_none', args: [] };
    return { key: 'clioworks_find_status', args: [Math.min(Math.max(Number(at) + 1, 1), total), total] };
  }

  /** The engine options the windoid's checkboxes mean for one document kind.
   * A checkbox that kind does not show contributes nothing, so options carried
   * over from another editor cannot widen a search behind the writer's back. */
  function engineOptions(fields, kind) {
    const f = fields || {};
    const options = {
      caseSensitive: !!f.case,
      wholeWord: !!f.wholeWord,
      fullHalfWidthEquivalent: !!f.fullHalf,
      scope: 'all',
    };
    for (const name of CHECK_ROWS[kind] || []) {
      if (name === 'comments') options.includeComments = !!f.comments;
      else if (name === 'formulas') options.inFormulas = !!f.formulas;
      else if (name === 'notes') options.includeNotes = !!f.notes;
    }
    return options;
  }

  /** 选中文字: keep only the matches inside the selection the scope was given.
   * A collapsed or missing selection searches the whole document, the way
   * MacWrite II did. The editor's own shapes: docx names paragraphs, xlsx a
   * rectangle of rows and columns (the engine's rows and columns are 1-based),
   * pptx one text box — speaker notes are never inside a text-box selection. */
  function filterSelection(matches, selection) {
    if (!selection) return matches;
    return (matches || []).filter((m) => {
      const loc = m && m.locator;
      if (!loc) return false;
      if (selection.sheet != null) {
        if (String(loc.sheet) !== String(selection.sheet)) return false;
        return loc.row >= selection.r1 + 1 && loc.row <= selection.r2 + 1
          && loc.col >= selection.c1 + 1 && loc.col <= selection.c2 + 1;
      }
      if (selection.shapeId != null) return !loc.notes && String(loc.shape) === String(selection.shapeId);
      const ids = selection.paragraphIds && selection.paragraphIds.length ? selection.paragraphIds : [selection.paragraphId];
      return ids.map(String).includes(String(loc.paragraphId));
    });
  }

  /** The engine if this file can search at all; without it every read stays empty. */
  const engine = () => (root.ClioWorksFindReplace && typeof root.ClioWorksFindReplace.find === 'function' ? root.ClioWorksFindReplace : null);

  /** The native host owns the three codecs' shared names on `L` (native-host.js
   * ownCodec): the last codec loaded owns L.preserve and friends, and the
   * writers read those names at call time — so before a document's engine call
   * its format's world is pointed back, or a find across formats reads another
   * codec's names and the replacement is refused. Where the host is absent (a
   * bare contract context, one codec loaded) this is a no-op. */
  const ownCodec = (kind) => {
    const host = root.AISystem6ClioWorks;
    return host && typeof host.ownCodec === 'function' ? host.ownCodec(kind) : Promise.resolve(null);
  };

  /** One plan per document the three editors hold, in a fixed editor order. A
   * context that is not one of the three Office editors (TeachText, a writing
   * route stop, anything else) is skipped, never searched. */
  async function planAllFiles(contexts, query, options) {
    const fr = engine();
    const plans = [];
    for (const ctx of contexts || []) {
      if (!ctx || !OFFICE_APPS.includes(ctx.appId) || !ctx.adapter) continue;
      let matches = [];
      if (fr) {
        try { await ownCodec(ctx.kind); matches = fr.find(ctx.adapter, ctx.kind, query, options) || []; } catch (error) { matches = []; }
      }
      plans.push({ ctx, matches });
    }
    return plans;
  }

  /** 「全部替换」 across documents: one engine replaceAll per document, so each
   * document gets its own named undo step (「全部替换 N 处」); a document with
   * only read-only matches raises no step. afterEdit fires only where the
   * document actually changed. Every result names its document. */
  async function replaceAllFiles(contexts, query, replacement, options) {
    const fr = engine();
    const results = [];
    for (const ctx of contexts || []) {
      if (!ctx || !OFFICE_APPS.includes(ctx.appId) || !ctx.adapter) continue;
      let out = null;
      if (fr) {
        try { await ownCodec(ctx.kind); out = fr.replaceAll(ctx.adapter, ctx.kind, query, replacement, options || {}); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
      }
      const count = (out && out.count) || 0;
      if (count && typeof ctx.afterEdit === 'function') ctx.afterEdit();
      results.push({
        appId: ctx.appId,
        name: ctx.name || '',
        kind: ctx.kind,
        count,
        skipped: (out && out.skipped) || 0,
        blocked: out && out.status === 'blocked' ? out.code || '' : '',
        failed: !!(out && out.status === 'failed'),
      });
    }
    return results;
  }

  /** The read-only matches a set of plans holds, said per kind: 「3 处在只读表
   * 格中，未替换」. A plan carries either matches or a replaceAll's skipped. */
  function readOnlyNote(plans) {
    const skippedByKind = new Map();
    for (const plan of plans || []) {
      if (!plan) continue;
      const kind = plan.kind || (plan.ctx && plan.ctx.kind) || '';
      const n = plan.skipped != null ? plan.skipped : (plan.matches || []).filter((m) => m && m.readOnly).length;
      if (!n || !kind) continue;
      skippedByKind.set(kind, (skippedByKind.get(kind) || 0) + n);
    }
    return [...skippedByKind].map(([kind, n]) => ({ key: READONLY_KEYS[kind] || 'clioworks_find_readonly_docx', args: [n] }));
  }

  /** The count a replaceAll's named step carries, for the Edit menu's undo row. */
  function replaceAllCount(label) {
    const m = REPLACE_ALL_LABEL.exec(String(label || ''));
    return m ? [Number(m[1])] : [];
  }

  /* ------------------------------------------------------------- the windoid */

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

  /* The query, the replacement, the checkboxes, the scope and the collapsed
   * state survive closing the windoid and moving it to another editor. */
  const persisted = {
    query: '',
    replacement: '',
    fields: { case: false, fullHalf: false, wholeWord: false, comments: false, formulas: false, notes: false },
    scope: 'doc',
    collapsed: false,
    selection: null,   // the box 选中文字 was given (never the match the windoid put there)
  };

  let open = null;   // { handle, doc, host, ctx, docs, at, results, failure, doc }
  let windoidCount = 0;

  const collectContexts = () => OFFICE_EDITORS
    .map((get) => (typeof get() === 'object' && get() && typeof get().findContext === 'function' ? get().findContext() : null))
    .filter((ctx) => !!ctx);

  /** The front document's plan: the one whose context the windoid was opened for. */
  const currentPlan = () => (open && open.docs.find((plan) => plan.ctx === open.ctx)) || (open && open.docs[0]) || null;

  async function search() {
    if (!open || !open.ctx) return;
    const options = engineOptions(persisted.fields, open.ctx.kind);
    if (persisted.scope === 'files') {
      open.docs = await planAllFiles(collectContexts(), persisted.query, options);
    } else {
      let matches = [];
      const fr = engine();
      if (fr) {
        try { await ownCodec(open.ctx.kind); matches = fr.find(open.ctx.adapter, open.ctx.kind, persisted.query, options) || []; } catch (error) { open.failure = String(error && error.message || error); }
      }
      if (persisted.scope === 'selection') matches = filterSelection(matches, persisted.selection);
      open.docs = [{ ctx: open.ctx, matches }];
    }
  }

  /** 查找下一个: refresh the plan, step with wrap, put the selection on the match. */
  async function findNext(delta) {
    if (!open || !persisted.query) return;
    open.failure = '';
    open.results = null;   // the counts a finished replacement produced give way to the next search
    if (open.ctx && typeof open.ctx.commitPending === 'function') open.ctx.commitPending();
    await search();
    const plan = currentPlan();
    const total = plan ? plan.matches.length : 0;
    if (!total) { open.at = -1; draw(); return; }
    open.at = open.at < 0 || open.at >= total ? (delta < 0 ? total - 1 : 0) : wrapIndex(open.at, total, delta);
    const match = plan.matches[open.at];
    if (match && typeof plan.ctx.select === 'function') plan.ctx.select(match);
    draw();
  }

  /** 替换 the match in hand, then find the next one from where it stood. */
  async function replaceOne() {
    if (!open || !persisted.query) return;
    const plan = currentPlan();
    const match = plan && open.at >= 0 ? plan.matches[open.at] : null;
    if (!match) { await findNext(1); return; }
    const fr = engine();
    let out = null;
    if (fr) {
      try { await ownCodec(open.ctx.kind); out = fr.replace(open.ctx.adapter, open.ctx.kind, match, persisted.replacement); } catch (error) { out = { status: 'failed', message: String(error && error.message || error) }; }
    }
    if (out && out.count && typeof open.ctx.afterEdit === 'function') open.ctx.afterEdit();
    open.failure = out && out.status === 'blocked' ? blockedNote(out.code) : '';
    if (out && out.status === 'failed') open.failure = tr('clioworks_find_failed');
    // The next occurrence now stands where this one did.
    open.at -= 1;
    await findNext(1);
  }

  const blockedNote = (code) => (code === 'TRACKED' ? tr('clioworks_find_tracked') : tr('clioworks_find_failed'));

  /** 全部替换: the current document, or every open Office document in the files
   * scope — each its own named undo step, read-only matches counted, never
   * replaced. The per-document counts the replacement produced stay on screen
   * until the next find (a fresh search would show 0 处 everywhere and call a
   * successful replace a failure). */
  async function replaceAll() {
    if (!open || !persisted.query) return;
    open.failure = '';
    const options = engineOptions(persisted.fields, open.ctx.kind);
    const results = await replaceAllFiles(
      persisted.scope === 'files' ? open.docs.map((plan) => plan.ctx) : [open.ctx],
      persisted.query,
      persisted.replacement,
      options,
    );
    open.results = results;
    for (const out of results) {
      if (out.blocked) open.failure = blockedNote(out.blocked);
      else if (out.failed) open.failure = tr('clioworks_find_failed');
    }
    await search();
    open.at = -1;
    draw();
  }

  /* -- the windoid frame -- */

  function createWindoid(doc, host, title) {
    const rootEl = h(doc, 'div', { class: 'windoid clioworks-find-windoid', role: 'dialog', 'aria-label': title });
    const closeBox = h(doc, 'button', { type: 'button', class: 'windoid-close', 'aria-label': tr('clio_comments_close') });
    const shade = h(doc, 'button', { type: 'button', class: 'windoid-shade', 'aria-label': tr('clioworks_find_collapse'), 'aria-expanded': String(!persisted.collapsed) });
    const titleEl = h(doc, 'span', { class: 'windoid-title', text: title });
    const titlebar = h(doc, 'div', { class: 'windoid-titlebar' }, [closeBox, titleEl, shade]);
    const body = h(doc, 'div', { class: 'windoid-body' });
    rootEl.append(titlebar, body);
    if (persisted.collapsed) rootEl.classList.add('is-collapsed');
    // Painted below the host's own alert layer (the first-save list): no z-index,
    // the DOM order between the windoid and the layer decides, as everywhere else.
    const alertLayer = host.querySelector('.cw-layer, .cwk-layer, .csn-layer');
    if (alertLayer && alertLayer.parentNode === host) host.insertBefore(rootEl, alertLayer);
    else host.append(rootEl);
    host.classList.add('has-windoid');
    let closed = false;
    const handle = {
      root: rootEl,
      titlebar,
      body,
      setTitle(text) { titleEl.textContent = text; rootEl.setAttribute('aria-label', text); },
      close() {
        if (closed) return;
        closed = true;
        rootEl.remove();
        // A host can hold the comments windoid too: only the last one out lowers the flag.
        if (!host.querySelector('.windoid')) host.classList.remove('has-windoid');
      },
    };
    closeBox.addEventListener('click', () => handle.close());
    shade.addEventListener('click', () => {
      persisted.collapsed = !persisted.collapsed;
      rootEl.classList.toggle('is-collapsed', persisted.collapsed);
      shade.setAttribute('aria-expanded', String(!persisted.collapsed));
    });
    // Movable (MacWrite II): the title bar drags the windoid within its host.
    titlebar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const rect = rootEl.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const offX = event.clientX - rect.left;
      const offY = event.clientY - rect.top;
      const move = (e) => {
        const left = Math.round(Math.max(0, Math.min(e.clientX - hostRect.left - offX, Math.max(0, hostRect.width - rect.width))));
        const top = Math.round(Math.max(0, Math.min(e.clientY - hostRect.top - offY, Math.max(0, hostRect.height - rect.height))));
        // Custom properties, not inline layout: the sheet owns left/top/right.
        rootEl.style.setProperty('--find-x', `${left}px`);
        rootEl.style.setProperty('--find-y', `${top}px`);
        rootEl.style.setProperty('--find-right', 'auto');
      };
      const up = () => {
        doc.removeEventListener('pointermove', move, true);
        doc.removeEventListener('pointerup', up, true);
      };
      doc.addEventListener('pointermove', move, true);
      doc.addEventListener('pointerup', up, true);
      event.preventDefault();
    });
    rootEl.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !event.isComposing) { event.stopPropagation(); handle.close(); } });
    return handle;
  }

  /* -- the body: fields, scope, checkboxes, buttons, status -- */

  function buildBody() {
    if (!open) return;
    const { handle, doc, ctx } = open;
    const id = `clioworks-find-${++windoidCount}`;
    handle.body.textContent = '';
    const grid = h(doc, 'div', { class: 'clioworks-find-grid' });

    const findField = h(doc, 'input', { class: 'windoid-input', type: 'text', id: `${id}-what`, spellcheck: 'false', autocomplete: 'off', value: persisted.query, 'aria-label': tr('clioworks_find_what') });
    const replaceField = h(doc, 'input', { class: 'windoid-input', type: 'text', id: `${id}-with`, spellcheck: 'false', autocomplete: 'off', value: persisted.replacement, 'aria-label': tr('clioworks_find_replace_with') });
    findField.addEventListener('input', () => { persisted.query = findField.value; refreshStatus(); });
    replaceField.addEventListener('input', () => { persisted.replacement = replaceField.value; });
    findField.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') { event.preventDefault(); findNext(1); }
    });
    grid.append(
      h(doc, 'label', { for: `${id}-what`, text: tr('clioworks_find_what') }), findField,
      h(doc, 'label', { for: `${id}-with`, text: tr('clioworks_find_replace_with') }), replaceField,
      h(doc, 'span', { class: 'clioworks-find-scope-label', text: tr('clioworks_find_scope') }),
    );

    const scopeBox = h(doc, 'span', { class: 'clioworks-find-scope', role: 'radiogroup', 'aria-label': tr('clioworks_find_scope') });
    for (const scope of SCOPES) {
      const radio = h(doc, 'input', { type: 'radio', name: `${id}-scope`, value: scope });
      radio.checked = persisted.scope === scope;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        persisted.scope = scope;
        // 选中文字 keeps the box it was given: a later match must not shrink
        // the next search to itself.
        if (scope === 'selection' && ctx && typeof ctx.selection === 'function') persisted.selection = ctx.selection() || null;
        else if (scope !== 'selection') persisted.selection = null;
        open.at = -1;
        open.results = null;
        search().then(draw);
      });
      scopeBox.append(h(doc, 'label', { class: 'clioworks-find-choice' }, [radio, tr(SCOPE_KEYS[scope])]));
    }
    grid.append(scopeBox);

    const checks = h(doc, 'span', { class: 'clioworks-find-checks' });
    for (const name of CHECK_ROWS[ctx.kind] || CHECK_ROWS.docx) {
      const box = h(doc, 'input', { type: 'checkbox', value: name });
      box.checked = !!persisted.fields[name];
      box.addEventListener('change', () => { persisted.fields[name] = !!box.checked; });
      checks.append(h(doc, 'label', { class: 'clioworks-find-choice' }, [box, tr(CHECK_KEYS[name])]));
    }
    grid.append(h(doc, 'span'), checks);
    handle.body.append(grid);

    const actions = h(doc, 'div', { class: 'clioworks-find-actions' });
    const nextBtn = h(doc, 'button', { type: 'button', class: 'btn default', text: tr('clioworks_find_next') });
    nextBtn.addEventListener('click', () => findNext(1));
    const oneBtn = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clioworks_find_replace') });
    oneBtn.addEventListener('click', () => replaceOne());
    const allBtn = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clioworks_find_replace_all') });
    allBtn.addEventListener('click', () => replaceAll());
    actions.append(nextBtn, oneBtn, allBtn);
    handle.body.append(actions);

    const status = h(doc, 'p', { class: 'clioworks-find-status', role: 'status' });
    const docsList = h(doc, 'ul', { class: 'clioworks-find-docs' });
    const note = h(doc, 'p', { class: 'clioworks-find-note' });
    handle.body.append(status, docsList, note);
    open.el = { findField, nextBtn, oneBtn, allBtn, status, docsList, note };
  }

  /** The status area only: the fields stay as the writer typed them. */
  function refreshStatus() {
    if (!open || !open.el) return;
    const { el } = open;
    const hasQuery = !!persisted.query;
    el.nextBtn.disabled = !hasQuery;
    el.allBtn.disabled = !hasQuery;
    const plan = currentPlan();
    const total = plan ? plan.matches.length : 0;
    el.oneBtn.disabled = !hasQuery || open.at < 0 || !plan || !plan.matches[open.at];
    const line = statusText(open.at, total);
    el.status.textContent = tr(line.key, ...line.args);
    el.docsList.replaceChildren();
    // 全部打开的文件 lists every document's count — what the last replaceAll
    // replaced while it is the fresh answer, otherwise what the search holds.
    const perDoc = persisted.scope === 'files'
      ? (open.results && open.results.length ? open.results : open.docs.map((docPlan) => ({ name: docPlan.ctx.name, count: docPlan.matches.length })))
      : [];
    if (perDoc.length) {
      for (const out of perDoc) {
        el.docsList.append(h(open.doc, 'li', {
          text: tr('clioworks_find_doc_count', out.name || tr('clioworks_find_untitled'), out.count || 0),
        }));
      }
      el.docsList.hidden = false;
    } else el.docsList.hidden = true;
    const notes = [];
    if (open.failure) notes.push(open.failure);
    for (const note of readOnlyNote(open.results && open.results.length ? open.results : open.docs)) {
      notes.push(tr(note.key, ...note.args));
    }
    el.note.textContent = notes.join(' ');
    el.note.hidden = !notes.length;
  }
  const draw = () => { if (open) refreshStatus(); };

  async function openWindoid(ctx) {
    if (!ctx || !ctx.adapter || !ctx.pane) return false;
    const doc = ctx.doc || (ctx.pane.ownerDocument) || root.document;
    if (open && open.host === ctx.pane && open.handle.root.isConnected) {
      // Same editor in front: keep the windoid where it stands, retarget it. The
      // editors hand over a fresh surface object per call, so the kind decides
      // whether the checkbox row and the search have to be rebuilt.
      const sameKind = open.ctx && open.ctx.kind === ctx.kind;
      open.ctx = ctx;
      if (!sameKind || (persisted.scope === 'selection' && typeof ctx.selection === 'function')) {
        if (persisted.scope === 'selection') persisted.selection = (typeof ctx.selection === 'function' ? ctx.selection() : null) || null;
        buildBody();
        await search();
        open.at = -1;
      }
      draw();
      return true;
    }
    if (open) open.handle.close();
    const handle = createWindoid(doc, ctx.pane, tr('clioworks_find_title'));
    open = { handle, doc, host: ctx.pane, ctx, docs: [], at: -1, results: null, failure: '', el: null };
    if (persisted.scope === 'selection' && typeof ctx.selection === 'function') persisted.selection = ctx.selection() || null;
    buildBody();
    await search();
    draw();
    try { open.el.findField.focus(); open.el.findField.select(); } catch (error) { /* the field stays where focus put it */ }
    return true;
  }

  /** ⌘G: the windoid comes back if it was closed, then the next match. */
  async function nextFrom(ctx) {
    if (!ctx) return false;
    // A fresh surface object per call: the editor in front is its host + kind.
    const sameEditor = !!(open && open.handle.root.isConnected && open.ctx && open.ctx.kind === ctx.kind);
    if (!sameEditor) await openWindoid(ctx);
    await findNext(1);
    return true;
  }

  function close() {
    if (!open) return;
    open.handle.close();
    open = null;
  }

  root.AISystem6ClioWorksFind = Object.freeze({
    open: openWindoid,
    next: nextFrom,
    close,
    refresh: draw,
    /** True while the windoid stands, wherever it stands. */
    isOpen: () => !!(open && open.handle.root.isConnected),
    // The search state's pure half, held by tests/features/clioworks-n3-find-ui.test.mjs.
    OFFICE_APPS,
    wrapIndex,
    statusText,
    engineOptions,
    filterSelection,
    planAllFiles,
    replaceAllFiles,
    readOnlyNote,
    replaceAllCount,
  });
  root.AISystem6ClioWorksFindLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
