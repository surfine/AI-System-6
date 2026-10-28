/* ClioWrite review windoid (N13a): the 「修订」 list on the same review side path
 * as the comments windoid (⌘M). Reads the revisions quire-review.js lists on the
 * live Quire adapter, selects each one in the document, and resolves it with
 * 接受 / 拒绝 — one named undo step each, or all of them as one step. POST-7:
 * like every new ClioWorks dialog this one takes the 「第三稿」 policy — plain
 * System 6 controls, 1-bit, no reviewer colours; inserted text shows underlined
 * and deleted text struck through, the way the document itself draws it.
 *
 * This file holds no model code: listing and resolving go through
 * ClioWorksQuireReview, the document through the surface ClioWrite hands over
 * (reviewContext in features/clio-write.js). Loaded lazily by config.js's
 * ensureClioWriteReviewModule, after the review engine and with the ClioWrite
 * lazy stylesheet. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWriteReview) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const KIND_KEYS = Object.freeze({
    ins: 'clio_write_revisions_kind_ins',
    del: 'clio_write_revisions_kind_del',
    chg: 'clio_write_revisions_kind_chg',
    pchg: 'clio_write_revisions_kind_chg',
    mins: 'clio_write_revisions_kind_mins',
    mdel: 'clio_write_revisions_kind_mdel',
  });

  let open = null;   // { handle, entry, nav } while the windoid is up

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

  const listRevisions = (adapter) => {
    const review = root.ClioWorksQuireReview;
    if (!review || typeof review.revisions !== 'function') return [];
    try { return review.revisions(adapter) || []; } catch (error) { console.warn('ClioWrite review:', error); return []; }
  };

  function draw() {
    if (!open) return;
    const { handle, entry } = open;
    const doc = open.doc;
    const surface = entry.surface;
    const adapter = entry.session.adapter;
    handle.body.textContent = '';
    let records = [];
    let failure = open.failure || '';
    try { records = listRevisions(adapter); } catch (error) { failure = String(error && error.message || error); }
    handle.setTitle(records.length ? tr('clio_write_revisions_title_count', records.length) : tr('clio_write_revisions_title'));

    /* the command row above the list: resolve everything, or walk the list */
    const commands = h(doc, 'div', { class: 'windoid-actions cw-rev-commands' });
    const command = (labelKey, run) => {
      const btn = h(doc, 'button', { type: 'button', class: 'btn', text: tr(labelKey) });
      btn.addEventListener('click', run);
      commands.append(btn);
      return btn;
    };
    command('clio_write_revisions_accept_all', () => apply(records, true));
    command('clio_write_revisions_reject_all', () => apply(records, false));
    const prev = command('clio_write_revisions_prev', () => step(-1));
    const next = command('clio_write_revisions_next', () => step(1));
    // N13b: 「署名…」 — the rename road for the revision author's name: the
    // same System 6 input dialog the first 「记录修订」 question took,
    // prefilled with the remembered name, and a confirmed answer is
    // remembered at once (this file holds no model code — the question and
    // the store stay in features/clio-write.js).
    command('clio_write_track_author_button', async () => {
      const clio = root.AISystem6ClioWrite;
      if (clio && typeof clio.renameRevisionAuthor === 'function') await clio.renameRevisionAuthor();
    });
    prev.disabled = !records.length || open.nav <= 0;
    next.disabled = !records.length || open.nav >= records.length - 1;
    handle.body.append(commands);

    if (failure) { const alert = h(doc, 'p', { class: 'windoid-note', text: failure }); alert.setAttribute('role', 'alert'); handle.body.append(alert); }
    if (!records.length) {
      handle.body.append(h(doc, 'p', { class: 'windoid-empty', text: tr('clio_write_revisions_empty') }));
      open.nav = -1;
      handle.place();
      return;
    }
    if (open.nav >= records.length) open.nav = records.length - 1;

    const ul = h(doc, 'ul', { class: 'windoid-threads cw-rev-list' });
    records.forEach((record, index) => {
      const box = h(doc, 'li', { class: 'windoid-thread cw-rev' + (index === open.nav ? ' is-current' : ''), dataset: { revisionIndex: String(index) } });
      const kind = tr(KIND_KEYS[record.type] || 'clio_write_revisions_kind_chg');
      const head = h(doc, 'div', { class: 'windoid-comment-head' }, [
        h(doc, 'span', { class: 'cw-rev-kind', text: kind }),
        h(doc, 'span', { class: 'windoid-author', text: record.author || tr('clio_comments_author_unknown') }),
      ]);
      if (record.date) head.append(h(doc, 'span', { class: 'windoid-date', text: String(record.date).slice(0, 10) }));
      // 插入的文字带下划线，删除的文字带删除线 —— 与文稿中的画法一致，1-bit，不用颜色区分。
      const text = record.type === 'pchg' ? tr('clio_write_revisions_paragraph_format') : record.text;
      const line = record.type === 'del' || record.type === 'mdel'
        ? h(doc, 'del', { class: 'cw-rev-text', text })
        : h(doc, 'ins', { class: 'cw-rev-text', text });
      box.append(h(doc, 'div', { class: 'windoid-comment' }, [head, line]));
      const actions = h(doc, 'div', { class: 'windoid-actions' });
      const accept = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_revisions_accept') });
      accept.addEventListener('click', () => apply([record], true));
      const reject = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_revisions_reject') });
      reject.addEventListener('click', () => apply([record], false));
      actions.append(accept, reject);
      box.append(actions);
      // 指到这一处：把文稿里的选区放到该修订上（与 Word 的「上一处/下一处」一致）。
      box.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        open.nav = index;
        surface.selectRange(record.paragraphId, record.from, record.to);
        draw();
      });
      ul.append(box);
    });
    handle.body.append(ul);
    handle.place();
  }

  /** Resolve the records as one named undo step, then redraw document and list. */
  function apply(records, accept) {
    if (!open || !records.length) return;
    const review = root.ClioWorksQuireReview;
    const { entry } = open;
    if (!review || typeof review.resolve !== 'function') return;
    const label = records.length > 1
      ? (accept ? 'Accept All Changes' : 'Reject All Changes')
      : (accept ? 'Accept Revision' : 'Reject Revision');
    let failure = '';
    try { review.resolve(entry.session.adapter, records, accept, label); } catch (error) { failure = String(error && error.message || error); }
    if (!failure) {
      // The adapter already counted the edit; this only settles the chrome.
      // N13b bridge: the context ClioWrite hands over (reviewContext) carries
      // redraw / syncCaret / afterHistory directly — entry.surface never existed.
      entry.session.noteExternalEdit();
      entry.redraw();
      entry.syncCaret();
      entry.afterHistory();
      const left = listRevisions(entry.session.adapter);
      if (open.nav >= left.length) open.nav = left.length - 1;
    }
    open.failure = failure;
    draw();
  }

  /** 上一处 / 下一处: move the pointer and select the revision in the document. */
  function step(direction) {
    if (!open) return;
    const { entry } = open;
    const records = listRevisions(entry.session.adapter);
    const nav = open.nav + direction;
    if (nav < 0 || nav >= records.length) return;
    open.nav = nav;
    const record = records[nav];
    entry.surface.selectRange(record.paragraphId, record.from, record.to);
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
      title: tr('clio_write_revisions_title'),
      className: 'cw-revisions-windoid',
      onClose: () => { if (open && open.handle === handle) open = null; },
    });
    open = { handle, entry: ctx, doc: ctx.doc, pane: ctx.pane, nav: -1, failure: '' };
    draw();
    handle.body.querySelector('button')?.focus();
  }

  root.AISystem6ClioWriteReview = Object.freeze({
    /** ctx: { session, doc, pane, redraw, syncCaret, selectRange, afterHistory, focus } from ClioWrite. */
    open: openWindoid,
    refresh: draw,
    close() { if (open) open.handle.close(); open = null; },
  });
  root.AISystem6ClioWriteReviewLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
