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
    tchg: 'clio_write_revisions_kind_tchg',
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

  // B2 (owner rulings D1/D2): ClioTalk's signed revisions ride this same list.
  // The delivery lane (clio-write-agent-delivery.js, the same loader) holds the
  // per-document report: which of its records are 跑腿件 (batchable errands),
  // which are 动字件 (the writer's own wording, one by one), each with its
  // reason and the lent source it stands on, plus the rows that did not attach.
  const agentApi = () => (root.AISystem6ClioWriteAgentDelivery && typeof root.AISystem6ClioWriteAgentDelivery.metaForRecord === 'function' ? root.AISystem6ClioWriteAgentDelivery : null);
  const agentReportOf = (adapter) => {
    const agent = agentApi();
    if (!agent) return null;
    try { return agent.reportFor(adapter) || null; } catch (error) { console.warn('ClioWrite review:', error); return null; }
  };
  const isAgentRecord = (report, record) => !!report && record.author === report.author;

  /** 收下跑腿件: the errand records resolve as one named step; the writer's
   * own wording (and ClioTalk's voice rows) are never in a batch. */
  function errandRecordsOf(records, adapter) {
    const agent = agentApi();
    const report = agentReportOf(adapter);
    if (!agent || !report) return [];
    return records.filter((record) => {
      if (!isAgentRecord(report, record)) return false;
      const meta = agent.metaForRecord(adapter, record);
      return !!meta && meta.class === 'errand';
    });
  }

  /** 留话…: a Word comment the writer signs, anchored on this revision. The
   * next ClioTalk turn reads that a note is waiting; the words stay the
   * writer's own. */
  async function leaveMessage(record) {
    if (!open) return;
    const clio = root.AISystem6ClioWrite;
    const adapter = open.entry.session.adapter;
    const who = clio && typeof clio.revisionAuthor === 'function' ? clio.revisionAuthor() : '';
    const author = who || tr('clio_comments_author_default');
    const text = typeof root.showInputDialog === 'function'
      ? await root.showInputDialog({ title: tr('clio_write_agent_leave_message'), message: tr('clio_write_agent_leave_message_prompt'), defaultValue: '' })
      : null;
    if (text == null || !String(text).trim()) return;
    let failure = '';
    try {
      adapter.addComment(record.paragraphId, { from: record.from, to: record.to }, { author, text: String(text), date: new Date().toISOString() });
    } catch (error) { failure = String(error && error.message || error); }
    if (!failure) {
      open.entry.session.noteExternalEdit();
      open.entry.redraw();
      open.entry.syncCaret();
      open.entry.afterHistory();
    }
    open.failure = failure;
    draw();
  }

  function draw() {
    if (!open) return;
    const { handle, entry } = open;
    const doc = open.doc;
    const adapter = entry.session.adapter;
    const agent = agentApi();
    const report = agentReportOf(adapter);
    handle.body.textContent = '';
    let records = [];
    let failure = open.failure || '';
    try { records = listRevisions(adapter); } catch (error) { failure = String(error && error.message || error); }
    handle.setTitle(records.length ? tr('clio_write_revisions_title_count', records.length) : tr('clio_write_revisions_title'));

    /* the command row above the list: resolve everything, or walk the list.
       With ClioTalk errands waiting, 「接受全部」 becomes 「收下跑腿件（N）」
       and takes exactly the errand rows — voice rows are never in a batch. */
    const errands = agent ? errandRecordsOf(records, adapter) : [];
    const commands = h(doc, 'div', { class: 'windoid-actions cw-rev-commands' });
    const command = (labelKey, run) => {
      const btn = h(doc, 'button', { type: 'button', class: 'btn', text: tr(labelKey) });
      btn.addEventListener('click', run);
      commands.append(btn);
      return btn;
    };
    const batchCommand = (label, run) => {
      const btn = h(doc, 'button', { type: 'button', class: 'btn', text: label });
      btn.addEventListener('click', run);
      commands.append(btn);
      return btn;
    };
    if (errands.length) batchCommand(tr('clio_write_agent_batch_button', errands.length), () => apply(errands, true, '收下跑腿件'));
    else command('clio_write_revisions_accept_all', () => apply(records, true));
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
    if (!records.length && !(report && report.unattached.length)) {
      handle.body.append(h(doc, 'p', { class: 'windoid-empty', text: tr('clio_write_revisions_empty') }));
      open.nav = -1;
      handle.place();
      return;
    }
    if (open.nav >= records.length) open.nav = records.length - 1;

    const ul = h(doc, 'ul', { class: 'windoid-threads cw-rev-list' });
    records.forEach((record, index) => {
      const meta = agent && isAgentRecord(report, record) ? agent.metaForRecord(adapter, record) : null;
      const box = h(doc, 'li', { class: 'windoid-thread cw-rev' + (index === open.nav ? ' is-current' : ''), dataset: { revisionIndex: String(index) } });
      // A move (W2) is listed as 「Moved」; it still resolves, and is drawn, as the ins/del it is underneath.
      const kind = tr(record.move ? 'clio_write_revisions_kind_move' : (KIND_KEYS[record.type] || 'clio_write_revisions_kind_chg'));
      // Write board ③: page · kind, then who and when. The page is known once the
      // page view has laid the document out (ctx.pageOf); otherwise the kind stands alone.
      const page = typeof entry.pageOf === 'function' ? entry.pageOf(record.paragraphId) : 0;
      const head = h(doc, 'div', { class: 'windoid-comment-head' }, [
        h(doc, 'span', { class: 'cw-rev-kind', text: page ? tr('clio_write_revisions_page_kind', page, kind) : kind }),
        h(doc, 'span', { class: 'windoid-author', text: record.author || tr('clio_comments_author_unknown') }),
      ]);
      if (meta) {
        // 跑腿件与动字件由页面分（裁定 D2）：the tag says which one this row is.
        const tag = h(doc, 'span', { class: 'cw-agent-tag' + (meta.class === 'voice' ? ' is-inverse' : ''), text: tr(meta.class === 'errand' ? 'clio_write_agent_tag_errand' : 'clio_write_agent_tag_voice') });
        head.append(tag);
      }
      if (record.date) head.append(h(doc, 'span', { class: 'windoid-date', text: String(record.date).slice(0, 10) }));
      // 插入的文字带下划线，删除的文字带删除线 —— 与文稿中的画法一致，1-bit，不用颜色区分。
      const text = record.type === 'pchg' ? tr('clio_write_revisions_paragraph_format') : record.type === 'tchg' ? tr('clio_write_revisions_table_format') : record.text;
      const line = record.type === 'del' || record.type === 'mdel'
        ? h(doc, 'del', { class: 'cw-rev-text', text })
        : h(doc, 'ins', { class: 'cw-rev-text', text });
      box.append(h(doc, 'div', { class: 'windoid-comment' }, [head, line]));
      if (meta) {
        // The why and the where: the class's own reason, then the lent source
        // the new value came verbatim out of (裁定 D2 的「依据」).
        box.append(h(doc, 'p', { class: 'windoid-note cw-agent-reason', text: tr(meta.reason.key, ...(meta.reason.args || [])) }));
        if (meta.basis) box.append(h(doc, 'p', { class: 'windoid-note cw-agent-basis', text: tr('clio_write_agent_basis_line', meta.basis.source, meta.basis.quote) }));
      }
      const actions = h(doc, 'div', { class: 'windoid-actions' });
      // Accept is the default button (board ③), the way 「查找下一个」 is in the find windoid —
      // except on a voice row, where the writer's wording is presumed theirs: 退回 is default.
      const voiceRow = !!meta && meta.class === 'voice';
      const accept = h(doc, 'button', { type: 'button', class: index === open.nav && !voiceRow ? 'btn default' : 'btn', text: tr('clio_write_revisions_accept') });
      accept.addEventListener('click', () => apply([record], true));
      const reject = h(doc, 'button', { type: 'button', class: index === open.nav && voiceRow ? 'btn default' : 'btn', text: tr('clio_write_revisions_reject') });
      reject.addEventListener('click', () => apply([record], false));
      actions.append(accept, reject);
      if (meta) {
        const note = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_agent_leave_message') });
        note.addEventListener('click', () => leaveMessage(record));
        actions.append(note);
      }
      box.append(actions);
      // 指到这一处：把文稿里的选区放到该修订上（与 Word 的「上一处/下一处」一致）。
      box.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        open.nav = index;
        entry.selectRange(record.paragraphId, record.from, record.to);
        draw();
      });
      ul.append(box);
    });
    if (records.length) {
      // ↑ / ↓ walk the list and jump in the document, as the two buttons above do.
      ul.tabIndex = 0;
      ul.setAttribute('aria-label', tr('clio_write_revisions_title'));
      ul.addEventListener('keydown', (event) => {
        if (event.isComposing || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        step(event.key === 'ArrowUp' ? -1 : 1);
        open?.handle.body.querySelector('.cw-rev-list')?.focus();
      });
      handle.body.append(ul);
    }
    // B2: the rows that did not attach come back as facts, never as guesses —
    // 「原文已经改过，这条没挂上」, and a road back to ClioTalk when one exists.
    if (report && report.unattached.length) {
      const section = h(doc, 'div', { class: 'cw-agent-unattached' });
      section.append(h(doc, 'p', { class: 'windoid-note', text: tr('clio_write_agent_unattached_title', report.unattached.length) }));
      for (const row of report.unattached) {
        const kindWord = row.before && row.after ? 'clio_write_agent_kind_replace' : row.after ? 'clio_write_agent_kind_insert' : 'clio_write_agent_kind_remove';
        const box = h(doc, 'div', { class: 'windoid-thread cw-agent-missed' });
        box.append(h(doc, 'div', { class: 'windoid-comment-head' }, [
          h(doc, 'span', { class: 'cw-rev-kind', text: `${report.author} · ${tr(kindWord)}` }),
        ]));
        box.append(h(doc, 'p', { class: 'windoid-note', text: tr(row.status === 'refused' ? 'clio_write_agent_reason_others_words' : row.status === 'ambiguous' ? 'clio_write_agent_reason_ambiguous' : row.status === 'unsupported' ? 'clio_write_agent_reason_unsupported' : 'clio_write_agent_lost_line') }));
        if (agent && agent.hasTellHandler()) {
          const actions = h(doc, 'div', { class: 'windoid-actions' });
          const tell = h(doc, 'button', { type: 'button', class: 'btn', text: tr('clio_write_agent_tell') });
          tell.addEventListener('click', () => agent.tell(row));
          actions.append(tell);
          box.append(actions);
        }
        section.append(box);
      }
      handle.body.append(section);
    }
    handle.place();
  }

  /** Resolve the records on the adapter as one named undo step. A ClioTalk
   * voice row the writer accepts is theirs now — its range lands in the
   * document's AI-字 ledger (裁定 D2) until the writer rewrites it. The one
   * road for both this list and ClioTalk's document panel (cliotalk-shell.js).
   * @returns {string} the failure, '' when the step was taken */
  function take(adapter, records, accept, label) {
    const review = root.ClioWorksQuireReview;
    if (!adapter || !Array.isArray(records) || !records.length || !review || typeof review.resolve !== 'function') return 'unavailable';
    const agent = agentApi();
    const report = agentReportOf(adapter);
    try { review.resolve(adapter, records, accept, label); } catch (error) { return String(error && error.message || error); }
    if (accept && agent && report) {
      for (const record of records) {
        const meta = agent.metaForRecord(adapter, record);
        if (meta && meta.class === 'voice') agent.noteVoiceAccepted(report.docId, record);
      }
    }
    return '';
  }

  /** Resolve the records as one named undo step, then redraw document and list. */
  function apply(records, accept, labelOverride) {
    if (!open || !records.length) return;
    const { entry } = open;
    const review = root.ClioWorksQuireReview;
    if (!review || typeof review.resolve !== 'function') return;
    const label = labelOverride || (records.length > 1
      ? (accept ? 'Accept All Changes' : 'Reject All Changes')
      : (accept ? 'Accept Revision' : 'Reject Revision'));
    const failure = take(entry.session.adapter, records, accept, label);
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
    // The handover carries selectRange itself (reviewContext); there is no entry.surface.
    entry.selectRange(record.paragraphId, record.from, record.to);
    draw();
  }

  // D2: the list lives in the window's 旁注栏 when the window hands over a panel
  // (ctx.panel, features/clioworks-rail.js); the floating windoid is the fallback.
  function openWindoid(ctx) {
    const createWindoid = root.AISystem6ClioWrite && root.AISystem6ClioWrite.createWindoid;
    if (typeof ctx.panel !== 'function' && typeof createWindoid !== 'function') return;
    if (open) {
      if (open.pane === ctx.pane) { open.entry = ctx; draw(); return; }
      close();
    }
    const options = {
      title: tr('clio_write_revisions_title'),
      className: 'cw-revisions-windoid',
      onClose: () => { if (open && open.handle === handle) open = null; },
    };
    const handle = typeof ctx.panel === 'function' ? ctx.panel('revisions', { ...options, className: 'cw-revisions-panel' }) : createWindoid(ctx.doc, ctx.pane, options);
    if (!handle) return;
    open = { handle, entry: ctx, doc: ctx.doc, pane: ctx.pane, nav: -1, failure: '' };
    draw();
  }

  function close() { if (open) open.handle.close(); open = null; }

  root.AISystem6ClioWriteReview = Object.freeze({
    /** ctx: { session, doc, pane, redraw, syncCaret, selectRange, afterHistory, focus } from ClioWrite. */
    open: openWindoid,
    refresh: draw,
    close,
    /** How many revisions the document still holds (the rail toggle's 「修订 N」). */
    count: (adapter) => listRevisions(adapter).length,
    /** ClioTalk's document panel reads and resolves through the same two:
     * the errand records 收下跑腿件 takes, and the resolution itself. */
    errandRecords: (adapter) => errandRecordsOf(listRevisions(adapter), adapter),
    take,
  });
  root.AISystem6ClioWriteReviewLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
