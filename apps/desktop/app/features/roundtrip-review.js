/* ClioWorks N8 (Review Desk 回稿 tab): per-paragraph candidates, the verbatim
 * message column and the three-way compare for a 回稿 round (design proposal
 * RoundTrip.dc.html). Loaded lazily behind config.js's
 * ensureRoundtripReviewModule — engine and N14's UI first (lastImport() is
 * where a fresh import is read, openReturnImport() is where the guide button
 * goes), then the shared word-diff core the highlighting reads, then this
 * file. The Review Desk panel (features/review-comments.js) owns only the tab
 * row and the placeholder container; everything the tab shows lives here.
 *
 * The lines this tab does not cross:
 *  - Only 采纳 writes into the manuscript, and each acceptance is ONE editor
 *    step: a whole-body replace through mdeApply (execCommand "insertText"),
 *    the applyRestoredBody path N15a established, so Edit ▸ Undo puts the
 *    writer's own paragraph back in one step. The step is named
 *    「采纳回稿：第 N 段」(roundtrip_accept_step) in the status line. 不采纳
 *    records a decision; 改一下… walks the same path with the writer's edit.
 *    撤回 takes an acceptance back down the same one-step road, to the send
 *    words (roundtrip_revert_step), and the decision returns to 未定. There
 *    is no wholesale overwrite, ever.
 *  - A paragraph is located by its words with whitespace folded, and with the
 *    engine's own citation transform ([S3] → [^S3], vendor/manuscript-
 *    roundtrip.js cleanManuscriptForReview) folded back before comparing. A
 *    paragraph that does not stand exactly once stays untouched and is said
 *    aloud — never guessed at.
 *  - The other side's comments are shown verbatim, with who said them to whom;
 *    AI never summarises other people's words into a view. Replies ride the
 *    existing Word comment pipeline on the next 送审 (word-export.js findings
 *    through features/manuscript-roundtrip.js; no new comment renderer), and
 *    only the ones the pipeline actually placed are marked carried.
 *  - The three-way compare (送审版 · 现在 · 对方改回) is read-only. The tone
 *    hint on wholesale rewrites only hints; the style check is the writer's
 *    own call (R5).
 *
 * Persistence is record data beside the manuscript, the same rule as
 * reviewComments: project.roundTrip holds the round's rows snapshot with every
 * decision, reply and handled flag. No IndexedDB store, version or migration
 * is involved — a project without the field simply has no 回稿 yet.
 */
(function (root) {
  'use strict';
  if (root.AISystem6RoundtripReview) return;

  const RECORD_VERSION = 1;
  // N14's 送审 dialog remembers the last recipient under this key
  // (features/manuscript-roundtrip.js RECIPIENT_KEY). The UI exposes no
  // getter, so the tab reads the preference where N14 wrote it.
  const RECIPIENT_KEY = 'ai-system6-roundtrip-recipient';

  const say = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);
  const status = (text) => { if (typeof root.setStatus === 'function') root.setStatus(text); };
  const engine = () => root.AISystem6ManuscriptRoundTrip || null;
  const roundTripUI = () => root.AISystem6ManuscriptRoundTripUI || null;
  const activeProject = () => (typeof root.getActiveProject === 'function' ? root.getActiveProject() : null);

  /* ------------------------------------------------------ locating paragraphs */

  // Whitespace folds away entirely: a docx paragraph and a wrapped markdown
  // line are the same words, and so are 「第二 段」and「第二段」 once the spaces
  // the layout added are gone. [^S3] folds back to [S3] because that is the
  // engine's own outbound transform (cleanManuscriptForReview) — folding it
  // back is reading the round trip's own grammar, not a guess.
  function normalizePara(text) {
    return String(text || '').replace(/\[\^(S\d+)(?::\d+)?\]/g, '[$1]').replace(/\s+/g, '');
  }

  // The manuscript's own blocks: runs of non-blank lines, with their offsets.
  function blocksOf(body) {
    const value = String(body || '');
    const blocks = [];
    let start = -1;
    let at = 0;
    const lines = value.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineStart = at;
      at += line.length + 1;
      if (!line.trim() && start < 0) continue;
      if (start < 0) start = lineStart;
      if (!line.trim() || index === lines.length - 1) {
        // A blank line ends the block before the newline that leads into it,
        // so the separation between blocks survives a replacement.
        const end = line.trim() ? value.length : lineStart - 1;
        blocks.push({ start, end, text: value.slice(start, end) });
        start = -1;
      }
    }
    return blocks;
  }

  function locateInBlocks(blocks, text) {
    const want = normalizePara(text);
    if (!want) return { status: 'lost', index: -1 };
    const hits = [];
    blocks.forEach((block, index) => {
      if (normalizePara(block.text) === want) hits.push(index);
    });
    if (hits.length === 1) return { status: 'found', index: hits[0] };
    if (!hits.length) return { status: 'lost', index: -1 };
    return { status: 'ambiguous', count: hits.length };
  }

  function locateInBody(body, text) {
    return locateInBlocks(blocksOf(body), text);
  }

  // Removing a block takes one adjoining blank run with it, so the neighbours
  // do not end up glued or double-spaced.
  function deletionRange(blocks, index) {
    const block = blocks[index];
    const next = blocks[index + 1];
    if (next) return { start: block.start, end: next.start };
    const previous = blocks[index - 1];
    if (previous) return { start: previous.end, end: block.end };
    return { start: 0, end: block.end };
  }

  /* -------------------------------------------------------- the round record */

  function commentState(comment) {
    return {
      author: String((comment && comment.author) || ''),
      text: String((comment && comment.text) || ''),
      reply: '',
      repliedAt: '',
      done: false,
      carriedIn: '',
    };
  }

  function rowState(row) {
    const source = row || {};
    return {
      index: Number(source.index) || 0,
      sentIndex: source.sentIndex ?? null,
      returnedIndex: source.returnedIndex ?? null,
      sentId: String(source.sentId || ''),
      returnedId: String(source.returnedId || ''),
      sentText: String(source.sentText || ''),
      returnedText: String(source.returnedText || ''),
      kind: ['same', 'changed', 'added', 'removed'].includes(source.kind) ? source.kind : 'same',
      changed: !!source.changed,
      comments: Array.isArray(source.comments) ? source.comments.map(commentState) : [],
      decision: 'undecided',
      acceptedText: '',
      lost: false,
    };
  }

  function readRecipient() {
    try { return (typeof root.localStorage !== 'undefined' && root.localStorage && root.localStorage.getItem(RECIPIENT_KEY)) || ''; } catch { return ''; }
  }

  function commentAuthorName(comment, record) {
    const author = String(comment?.author || '').trim();
    if (author) return author;
    return String(record?.recipient || '').trim();
  }

  /** One fresh record from N14's in-memory import; decisions start undecided. */
  function freshRecord(imp, options = {}) {
    const item = imp && imp.item ? imp.item : null;
    const parsed = engine()?.parseRoundName ? engine().parseRoundName(item?.name) : null;
    return {
      version: RECORD_VERSION,
      round: parsed?.round || 0,
      fileName: String(item?.name || ''),
      fileId: String(item?.id || ''),
      importedAt: options.now || new Date().toISOString(),
      recipient: String(options.recipient != null ? options.recipient : readRecipient()),
      rows: (Array.isArray(imp?.rows) ? imp.rows : []).map(rowState),
      unplacedComments: (Array.isArray(imp?.unplacedComments) ? imp.unplacedComments : []).map(commentState),
    };
  }

  /** project.roundTrip as this tab reads it, or null when there is none. */
  function readRecord(project) {
    const record = project?.roundTrip;
    if (!record || typeof record !== 'object' || Number(record.version) !== RECORD_VERSION
      || !Array.isArray(record.rows)) return null;
    for (const row of record.rows) {
      if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.index))
        || !['same', 'changed', 'added', 'removed'].includes(row.kind)
        || typeof row.sentText !== 'string' || typeof row.returnedText !== 'string') return null;
    }
    return record;
  }

  function writeRecord(project, record) {
    if (!project || !record) return false;
    project.roundTrip = record;
    project.updatedAt = new Date().toISOString();
    if (typeof root.saveDeskState === 'function') root.saveDeskState();
    return true;
  }

  /**
   * The record the tab should show. A fresh N14 import (a file id the record
   * does not hold yet) replaces the record as the newest round; the same file
   * id keeps the decisions, replies and handled flags the writer already made.
   */
  function syncFromLastImport(project, options = {}) {
    if (!project) return null;
    const existing = readRecord(project);
    const last = roundTripUI()?.lastImport?.() || null;
    if (last && Array.isArray(last.rows)) {
      const fileId = String(last.item?.id || '');
      if (!existing || existing.fileId !== fileId) {
        const record = freshRecord(last, options);
        writeRecord(project, record);
        return record;
      }
    }
    return existing;
  }

  function rowOf(record, index) {
    const wanted = Number(index);
    return (record?.rows || []).find((row) => Number(row.index) === wanted) || null;
  }

  /* ---------------------------------------------------------- adoption plans */

  /**
   * What one acceptance would do to the body, without doing it:
   *   { status: 'ready', from, to, insert, text } — the replacement range and
   *     the paragraph text that lands there ('' for a removal);
   *   { status: 'lost' | 'ambiguous' } — the manuscript has moved on, or the
   *     same words stand twice. Both leave the candidate untouched.
   * @param {object} record  the round record
   * @param {number} index   the row's paragraph number (「第 N 段」)
   * @param {string} body    the manuscript as it stands
   * @param {{ edit?: string }} [options] the writer's 改一下 text, if any
   */
  function planAdoption(record, index, body, options = {}) {
    const row = rowOf(record, index);
    if (!row || row.kind === 'same') return { status: 'lost' };
    const value = String(body || '');
    const blocks = blocksOf(value);
    const replacement = options.edit != null ? String(options.edit) : String(row.returnedText || '');

    if (row.kind === 'changed') {
      const found = locateInBlocks(blocks, row.sentText);
      if (found.status !== 'found') return { status: found.status };
      const block = blocks[found.index];
      return { status: 'ready', from: block.start, to: block.end, insert: replacement, text: replacement };
    }
    if (row.kind === 'removed') {
      const found = locateInBlocks(blocks, row.sentText);
      if (found.status !== 'found') return { status: found.status };
      const range = deletionRange(blocks, found.index);
      return { status: 'ready', from: range.start, to: range.end, insert: '', text: '' };
    }
    // An added paragraph has no send counterpart. It lands after the nearest
    // preceding paragraph the manuscript still carries word for word; without
    // one there is no honest place to put it.
    for (let at = (record?.rows || []).indexOf(row) - 1; at >= 0; at -= 1) {
      const anchor = record.rows[at];
      if (!anchor || !String(anchor.sentText || '').trim()) continue;
      const found = locateInBlocks(blocks, anchor.sentText);
      if (found.status === 'ambiguous') return { status: 'ambiguous' };
      if (found.status !== 'found') continue;
      const block = blocks[found.index];
      return { status: 'ready', from: block.start, to: block.end, insert: `${block.text}\n\n${replacement}`, text: replacement };
    }
    return { status: 'lost' };
  }

  /**
   * What withdrawing one acceptance would do to the body, without doing it —
   * the locating mirror of planAdoption: the replace target is the paragraph
   * as the manuscript holds it now (acceptedText — the writer's own edit for
   * a 改一下 acceptance; '' for an accepted removal never stands and reads
   * lost), and the insert is the send text ('' for an accepted insertion,
   * which takes one blank run with it the way any clean deletion does). A
   * paragraph that does not stand exactly once leaves the acceptance
   * untouched — never guessed at.
   * @param {object} record the round record
   * @param {number} index  the row's paragraph number (「第 N 段」)
   * @param {string} body   the manuscript as it stands
   */
  function planRevert(record, index, body) {
    const row = rowOf(record, index);
    if (!row || row.decision !== 'accepted') return { status: 'lost' };
    const blocks = blocksOf(String(body || ''));
    const found = locateInBlocks(blocks, row.acceptedText);
    if (found.status !== 'found') return { status: found.status };
    const sent = String(row.sentText || '');
    if (!normalizePara(sent)) {
      const range = deletionRange(blocks, found.index);
      return { status: 'ready', from: range.start, to: range.end, insert: '' };
    }
    const block = blocks[found.index];
    return { status: 'ready', from: block.start, to: block.end, insert: sent };
  }

  /* ---------------------------------------------- rewrite measure (口吻提示) */

  /**
   * How much of the writer's paragraph survived, from the shared word-diff
   * core: kept characters over the sent paragraph's length, the change count
   * the status line shows, and whether this reads as a wholesale rewrite —
   * the cue for the tone hint, which only hints. The bar is survival under
   * 60%: the design's own 交通费 rewrite (half the characters kept) reads as
   * 改写了整段; a swapped word keeps almost everything and does not.
   */
  function rewriteMeasure(sentText, returnedText) {
    const before = String(sentText || '');
    const total = Math.max(before.length, 1);
    const api = root.AISystem6WordDiff;
    if (!api || !before.trim()) return { kept: before.length, total, heavy: false, edits: 0 };
    const hunks = api.wordDiff(before, String(returnedText || '')).hunks || [];
    let kept = 0;
    let cursor = 0;
    for (const hunk of hunks) {
      kept += Math.max(0, Number(hunk.before?.start || 0) - cursor);
      cursor = Math.max(cursor, Number(hunk.before?.end || 0));
    }
    kept += Math.max(0, before.length - cursor);
    return { kept, total, heavy: kept / total < 0.6 && before.trim().length >= 8, edits: hunks.length };
  }

  /* ----------------------------------------------- replies as Word comments */

  function eachComment(record, visit) {
    for (const row of record?.rows || []) {
      (row.comments || []).forEach((comment, index) => visit(comment, `r${row.index}-${index}`, row));
    }
    (record?.unplacedComments || []).forEach((comment, index) => visit(comment, `u${index}`, null));
  }

  function setReply(record, commentId, text) {
    let touched = false;
    eachComment(record, (comment, id) => {
      if (id !== commentId) return;
      const value = String(text || '').trim();
      if (value) {
        comment.reply = value;
        comment.repliedAt = new Date().toISOString();
      } else {
        comment.reply = '';
        comment.repliedAt = '';
      }
      touched = true;
    });
    return touched;
  }

  function setDone(record, commentId, done) {
    let touched = false;
    eachComment(record, (comment, id) => {
      if (id !== commentId) return;
      comment.done = !!done;
      touched = true;
    });
    return touched;
  }

  // The anchor a reply rides on the next 送审: the paragraph as the manuscript
  // holds it now — the accepted text once accepted, else the sent words. An
  // added-but-unaccepted paragraph has no anchor and stays in the tab.
  function anchorTextFor(row) {
    if (!row) return '';
    if (row.decision === 'accepted' && String(row.acceptedText || '').trim()) return row.acceptedText;
    return String(row.sentText || '');
  }

  /** word-export.js findings ({anchor, note, author}) for replies not yet carried. */
  function replyFindingsFromRecord(record, options = {}) {
    if (!readRecord({ roundTrip: record })) return [];
    const findings = [];
    const author = String(options.author != null ? options.author : say('review_comment_writer'));
    eachComment(record, (comment, id, row) => {
      if (!comment.reply || comment.carriedIn) return;
      const anchor = anchorTextFor(row);
      if (!normalizePara(anchor)) return; // nowhere to hang it: it stays in the tab, visibly pending
      findings.push({ anchor, note: comment.reply, author, commentId: id });
    });
    return findings;
  }

  /** Stamp the replies the pipeline actually placed; the rest stay pending. */
  function markCarriedInRecord(record, fileName, carriedNotes) {
    const carried = new Set((carriedNotes || []).map(String));
    let touched = 0;
    eachComment(record, (comment) => {
      if (comment.reply && !comment.carriedIn && carried.has(comment.reply)) {
        comment.carriedIn = String(fileName || '');
        touched += 1;
      }
    });
    return touched;
  }

  /* ------------------------------------------------------------ three columns */

  /**
   * The 三方对照 rows, read-only: for every changed/added/removed paragraph,
   * what was sent, what the manuscript holds now, and what came back. The
   * 「now」 column is located in the live body (see inside); nothing here
   * writes, and no side's changes are silently overwritten by looking.
   * @param {object} record the round record
   * @param {string} body the manuscript as it stands
   */
  function threeWayRows(record, body) {
    const blocks = blocksOf(body);
    return (record?.rows || [])
      .filter((row) => row.kind !== 'same')
      .map((row) => {
        // 「现在」 is located in the live body: the accepted text once
        // accepted, else the sent words, else (the writer took the other
        // side's version by hand) the returned words. A paragraph none of
        // the three can find is said to be gone — never guessed at.
        const accepted = row.decision === 'accepted' && String(row.acceptedText || '').trim();
        const candidates = accepted
          ? [[row.acceptedText, 'accepted'], [row.sentText, 'sent']]
          : [[row.sentText, 'sent'], [row.returnedText, 'returned']];
        let current = '';
        let currentStatus = 'gone';
        for (const [text, status] of candidates) {
          const found = locateInBlocks(blocks, text);
          if (found.status === 'found') {
            current = blocks[found.index].text;
            currentStatus = status;
            break;
          }
        }
        return {
          index: row.index,
          kind: row.kind,
          sent: String(row.sentText || ''),
          returned: String(row.returnedText || ''),
          current,
          currentStatus,
        };
      });
  }

  /* -------------------------------------------------------------- desk glue */

  function persistRecord(project, record) {
    if (!project || !record) return;
    writeRecord(project, record);
  }

  /**
   * 采纳 (or 改一下 with options.edit): locate, then ONE whole-body mdeApply
   * — the same single undo step a Versions restore is — and record it. A
   * paragraph that cannot be located exactly once is left alone; the row is
   * flagged so the card says so, and the decision stays undecided.
   */
  function adoptRow(record, index, options = {}) {
    const paper = typeof root.teachTextBodyInput !== 'undefined' ? root.teachTextBodyInput : null;
    const project = activeProject();
    if (!paper || !project) {
      status(say('roundtrip_needs_manuscript'));
      return { ok: false, reason: 'no-manuscript' };
    }
    const row = rowOf(record, index);
    if (!row || row.kind === 'same') return { ok: false, reason: 'not-a-candidate' };
    const body = String(paper.value || '');
    const plan = planAdoption(record, index, body, options);
    if (plan.status !== 'ready') {
      row.lost = true;
      persistRecord(project, record);
      status(say('roundtrip_lost_note'));
      render();
      return { ok: false, reason: plan.status };
    }
    if (typeof root.mdeApply !== 'function') return { ok: false, reason: 'no-editor' };
    const next = body.slice(0, plan.from) + plan.insert + body.slice(plan.to);
    // One execCommand("insertText") whole-body replace: Edit ▸ Undo is one
    // step back to the writer's own paragraph (writing-safety.js, N15a).
    root.mdeApply(paper, { from: 0, to: body.length, insert: next, selStart: 0, selEnd: 0 });
    row.decision = 'accepted';
    row.acceptedText = String(plan.text || '');
    row.lost = false;
    persistRecord(project, record);
    status(say('roundtrip_accept_step', row.index));
    render();
    return { ok: true };
  }

  function rejectRow(record, index) {
    const project = activeProject();
    const row = rowOf(record, index);
    if (!row || !project) return false;
    row.decision = 'rejected';
    persistRecord(project, record);
    render();
    return true;
  }

  /**
   * 撤回: put one accepted paragraph back to its send words — the same ONE
   * whole-body mdeApply road the acceptance took (still one step in the
   * manuscript's own undo history, named 「撤回采纳：第 N 段」). The decision
   * returns to 未定, acceptedText clears, and the summary line follows. The
   * replace target is the paragraph as the manuscript holds it now; a
   * paragraph the writer has since moved on from — or the same words standing
   * twice — is left alone and said aloud, and the card keeps its accepted
   * state: never guessed at.
   */
  function revertRow(record, index) {
    const paper = typeof root.teachTextBodyInput !== 'undefined' ? root.teachTextBodyInput : null;
    const project = activeProject();
    if (!paper || !project) {
      status(say('roundtrip_needs_manuscript'));
      return { ok: false, reason: 'no-manuscript' };
    }
    const row = rowOf(record, index);
    if (!row || row.decision !== 'accepted') return { ok: false, reason: 'not-accepted' };
    const body = String(paper.value || '');
    const plan = planRevert(record, index, body);
    if (plan.status !== 'ready') {
      status(say('roundtrip_lost_note'));
      return { ok: false, reason: plan.status };
    }
    if (typeof root.mdeApply !== 'function') return { ok: false, reason: 'no-editor' };
    const next = body.slice(0, plan.from) + plan.insert + body.slice(plan.to);
    root.mdeApply(paper, { from: 0, to: body.length, insert: next, selStart: 0, selEnd: 0 });
    row.decision = 'undecided';
    row.acceptedText = '';
    row.lost = false;
    persistRecord(project, record);
    status(say('roundtrip_revert_step', row.index));
    render();
    return { ok: true };
  }

  function decisionCounts(record) {
    const rows = (record?.rows || []).filter((row) => row.kind !== 'same');
    const changed = rows.length;
    let comments = 0;
    eachComment(record, () => { comments += 1; });
    const accepted = rows.filter((row) => row.decision === 'accepted').length;
    const rejected = rows.filter((row) => row.decision === 'rejected').length;
    return { changed, comments, accepted, rejected, undecided: changed - accepted - rejected };
  }

  /* ------------------------------------------------------------ the DOM side */

  let host = null;
  let compareOpen = false;

  function node(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function button(label, action, className = 'btn mini-btn') {
    const element = node('button', className, label);
    element.type = 'button';
    element.dataset.rtAction = action;
    return element;
  }

  function visibleRows(record) {
    return (record?.rows || []).filter((row) => row.kind !== 'same');
  }

  // The one line each candidate head carries: who did what. The name is the
  // comment author the docx itself carries, else the round's recipient.
  function rowStatusLabel(record, row) {
    const who = commentAuthorName({ author: '' }, record) || say('roundtrip_reviewer_fallback');
    const measure = rewriteMeasure(row.sentText, row.returnedText);
    if (row.kind === 'added') return say('roundtrip_kind_added', who);
    if (row.kind === 'removed') return say('roundtrip_kind_removed', who);
    if (measure.heavy) return say('roundtrip_kind_rewritten', who);
    return say('roundtrip_kind_changed', who, measure.edits);
  }

  // The candidate's own text as one reading: the words that went, struck
  // through, then the words that came, underlined — the same black-white pair
  // the compare tab already uses (design .del/.ins).
  function diffNode(sentText, returnedText) {
    const holder = node('p', 'roundtrip-cand-text');
    const api = root.AISystem6WordDiff;
    const before = String(sentText || '');
    const after = String(returnedText || '');
    if (!api || !before || !after) {
      holder.textContent = after || before;
      return holder;
    }
    const hunks = api.wordDiff(before, after).hunks || [];
    let cursor = 0;
    for (const hunk of hunks) {
      if (hunk.before.start > cursor) holder.append(document.createTextNode(before.slice(cursor, hunk.before.start)));
      const group = node('span', 'review-diff-hunk');
      if (hunk.before.end > hunk.before.start) group.append(node('del', 'review-diff-del', before.slice(hunk.before.start, hunk.before.end)));
      if (hunk.after.end > hunk.after.start) group.append(node('ins', 'review-diff-ins', after.slice(hunk.after.start, hunk.after.end)));
      holder.append(group);
      cursor = hunk.before.end;
    }
    if (cursor < before.length) holder.append(document.createTextNode(before.slice(cursor)));
    return holder;
  }

  function decisionNode(row) {
    if (row.lost) return node('p', 'roundtrip-decision is-lost', say('roundtrip_lost_note'));
    if (row.decision === 'accepted') return node('p', 'roundtrip-decision is-accepted', say('roundtrip_accepted_note'));
    if (row.decision === 'rejected') return node('p', 'roundtrip-decision is-rejected', say('roundtrip_rejected_note'));
    return null;
  }

  function candidateCard(record, row, editing) {
    const card = node('li', `roundtrip-cand${row.decision === 'accepted' ? ' is-accepted' : ''}${row.lost ? ' is-lost' : ''}`);
    card.dataset.rtRow = String(row.index);

    const head = node('div', 'roundtrip-cand-head');
    head.append(node('strong', '', say('roundtrip_paragraph', row.index)));
    head.append(node('span', 'roundtrip-cand-status', rowStatusLabel(record, row)));
    card.append(head);

    card.append(diffNode(row.sentText, row.returnedText));

    const measure = rewriteMeasure(row.sentText, row.returnedText);
    if (row.kind === 'changed' && measure.heavy) {
      // 只提示，绝不代改 (R5): the style check stays the writer's own call,
      // and this row only points at it. The button rides the existing
      // style-check-manuscript command and its own availability.
      const hint = node('p', 'roundtrip-tone');
      hint.append(node('span', '', say('roundtrip_tone_hint')));
      const open = node('button', 'btn mini-btn', say('roundtrip_tone_check'));
      open.type = 'button';
      open.dataset.action = 'style-check-manuscript';
      hint.append(open);
      card.append(hint);
    }

    const decision = decisionNode(row);
    if (decision) card.append(decision);

    if (editing === row.index) {
      const box = node('div', 'roundtrip-editbox');
      const text = node('textarea');
      text.rows = 3;
      text.dataset.rtEditText = '';
      text.value = String(row.returnedText || '');
      const rowButtons = node('div', 'roundtrip-cand-actions');
      const apply = button(say('roundtrip_confirm'), 'apply-edit', 'btn mini-btn default');
      apply.dataset.rtRow = String(row.index);
      rowButtons.append(apply, button(say('cancel'), 'cancel-edit'));
      box.append(text, rowButtons);
      card.append(box);
    } else if (!row.lost && row.decision === 'undecided') {
      const actions = node('div', 'roundtrip-cand-actions');
      const accept = button(say('roundtrip_accept'), 'accept', 'btn mini-btn default');
      accept.dataset.rtRow = String(row.index);
      const reject = button(say('roundtrip_reject'), 'reject');
      reject.dataset.rtRow = String(row.index);
      const edit = button(say('roundtrip_edit'), 'edit');
      edit.dataset.rtRow = String(row.index);
      actions.append(accept, reject, edit);
      card.append(actions);
    } else if (!row.lost && row.decision === 'accepted') {
      // N8: an accepted card — 改一下… acceptances included — says how to take
      // it back: the same one-step road, to the send words. A paragraph the
      // manuscript no longer holds keeps the acceptance (定位不到，未改).
      const actions = node('div', 'roundtrip-cand-actions');
      const withdraw = button(say('roundtrip_revert'), 'revert');
      withdraw.dataset.rtRow = String(row.index);
      actions.append(withdraw);
      card.append(actions);
    }
    return card;
  }

  function messageCard(record, comment, commentId, anchorLabel) {
    const card = node('li', `roundtrip-message${comment.done ? ' is-done' : ''}`);
    card.dataset.rtComment = commentId;

    const head = node('div', 'roundtrip-message-head');
    head.append(node('strong', '', say('roundtrip_message_from', commentAuthorName(comment, record))));
    head.append(node('span', 'roundtrip-message-anchor', anchorLabel));
    card.append(head);

    const quote = node('blockquote', 'review-thread-quote', comment.text);
    card.append(quote);

    if (comment.reply) {
      const reply = node('p', 'roundtrip-message-reply');
      reply.append(node('strong', '', say('roundtrip_message_reply_label')));
      reply.append(document.createTextNode(comment.reply));
      card.append(reply);
    }
    if (comment.done) card.append(node('p', 'roundtrip-message-note', say('roundtrip_done_note')));
    if (comment.carriedIn) card.append(node('p', 'roundtrip-message-note', say('roundtrip_carried_note', comment.carriedIn)));

    const actions = node('div', 'roundtrip-cand-actions');
    const replyButton = button(say('roundtrip_reply'), 'reply');
    replyButton.dataset.rtComment = commentId;
    const doneButton = button(say('roundtrip_done'), 'mark-done');
    doneButton.dataset.rtComment = commentId;
    doneButton.classList.toggle('is-on', !!comment.done);
    actions.append(replyButton, doneButton);
    card.append(actions);

    if (replying === commentId) {
      const box = node('div', 'roundtrip-editbox');
      const text = node('textarea');
      text.rows = 2;
      text.dataset.rtReplyText = '';
      text.value = comment.reply || '';
      const send = button(say('roundtrip_confirm'), 'send-reply', 'btn mini-btn default');
      send.dataset.rtComment = commentId;
      const actions = node('div', 'roundtrip-cand-actions');
      actions.append(send);
      box.append(text, actions);
      card.append(box);
    }
    return card;
  }

  let replying = '';
  let editing = 0;

  function renderGuide() {
    host.replaceChildren();
    host.append(node('p', 'empty-folder-note', say('roundtrip_guide')));
    const open = node('button', 'btn default', say('roundtrip_open_import'));
    open.type = 'button';
    open.dataset.rtAction = 'open-import';
    host.append(open);
  }

  function renderCompare(record) {
    const paper = typeof root.teachTextBodyInput !== 'undefined' ? root.teachTextBodyInput : null;
    const body = paper ? String(paper.value || '') : '';
    host.replaceChildren();

    const head = node('div', 'roundtrip-summary');
    head.append(node('span', '', say('roundtrip_compare_title')));
    head.append(node('span', 'roundtrip-note', say('roundtrip_compare_readonly')));
    const back = button(say('roundtrip_compare_back'), 'close-compare');
    head.append(back);
    host.append(head);

    const rows = threeWayRows(record, body);
    if (!rows.length) {
      host.append(node('p', 'empty-folder-note', say('roundtrip_compare_none')));
      return;
    }
    const table = node('div', 'roundtrip-compare-table');
    [say('roundtrip_compare_col_sent'), say('roundtrip_compare_col_now'), say('roundtrip_compare_col_returned')]
      .forEach((label) => table.append(node('b', 'roundtrip-compare-head', label)));
    for (const row of rows) {
      table.append(node('div', 'roundtrip-compare-cell', row.sent));
      table.append(node('div', `roundtrip-compare-cell is-${row.currentStatus}`,
        row.current || say('roundtrip_compare_gone')));
      table.append(node('div', 'roundtrip-compare-cell', row.returned));
    }
    host.append(table);
  }

  function renderCandidates(record) {
    host.replaceChildren();

    const summary = node('div', 'roundtrip-summary');
    const counts = decisionCounts(record);
    const roundLine = record.round
      ? say('roundtrip_round_line', record.round, record.recipient || say('roundtrip_reviewer_fallback'))
      : record.fileName;
    summary.append(node('span', '', roundLine));
    summary.append(node('span', '', say('roundtrip_summary', counts.changed, counts.comments, counts.accepted, counts.undecided)));
    const compare = button(say('roundtrip_compare'), 'open-compare');
    summary.append(compare);
    host.append(summary);

    const columns = node('div', 'roundtrip-columns');
    const list = node('ol', 'roundtrip-candidates');
    const rows = visibleRows(record);
    if (!rows.length) list.append(node('li', 'empty-folder-note', say('roundtrip_no_candidates')));
    rows.forEach((row) => list.append(candidateCard(record, row, editing)));
    columns.append(list);

    const messages = node('div', 'roundtrip-messages');
    messages.append(node('b', 'roundtrip-messages-title', say('roundtrip_messages_title')));
    const messageList = node('ul', 'roundtrip-message-list');
    let any = false;
    (record.rows || []).forEach((row) => (row.comments || []).forEach((comment, index) => {
      any = true;
      messageList.append(messageCard(record, comment, `r${row.index}-${index}`, say('roundtrip_paragraph', row.index)));
    }));
    if ((record.unplacedComments || []).length) {
      const group = node('li', 'roundtrip-unplaced');
      group.append(node('b', '', say('roundtrip_unplaced_title')));
      const inner = node('ul', 'roundtrip-message-list');
      record.unplacedComments.forEach((comment, index) => {
        any = true;
        inner.append(messageCard(record, comment, `u${index}`, say('roundtrip_unplaced')));
      });
      group.append(inner);
      messageList.append(group);
    }
    if (!any) messageList.append(node('li', 'empty-folder-note', say('roundtrip_no_messages')));
    messages.append(messageList);
    messages.append(node('p', 'roundtrip-note', say('roundtrip_footnote')));
    columns.append(messages);
    host.append(columns);
  }

  function render() {
    if (!host) return;
    const record = readRecord(activeProject());
    if (!record) renderGuide();
    else if (compareOpen) renderCompare(record);
    else renderCandidates(record);
  }

  function wire() {
    host.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const trigger = target?.closest('[data-rt-action]');
      if (!trigger || !host.contains(trigger)) return;
      const project = activeProject();
      const record = readRecord(project);
      const rowIndex = Number(trigger.dataset.rtRow || 0);
      const commentId = trigger.dataset.rtComment || '';
      switch (trigger.dataset.rtAction) {
        case 'open-import':
          roundTripUI()?.openReturnImport?.();
          break;
        case 'accept':
          if (record) adoptRow(record, rowIndex);
          break;
        case 'reject':
          if (record && rejectRow(record, rowIndex)) status(say('roundtrip_rejected_note'));
          break;
        case 'revert':
          if (record) revertRow(record, rowIndex);
          break;
        case 'edit':
          editing = editing === rowIndex ? 0 : rowIndex;
          replying = '';
          render();
          host.querySelector(`[data-rt-row="${rowIndex}"] [data-rt-edit-text]`)?.focus();
          break;
        case 'cancel-edit':
          editing = 0;
          render();
          break;
        case 'apply-edit': {
          if (!record) break;
          const box = host.querySelector(`[data-rt-row="${rowIndex}"] [data-rt-edit-text]`);
          const text = box ? String(box.value || '') : '';
          if (!text.trim()) { status(say('roundtrip_edit_empty')); break; }
          editing = 0;
          // The writer's edit walks the same one-step adoption path, with the
          // same step name: there is exactly one road into the manuscript.
          adoptRow(record, rowIndex, { edit: text });
          break;
        }
        case 'reply':
          replying = replying === commentId ? '' : commentId;
          editing = 0;
          render();
          host.querySelector(`[data-rt-comment="${CSS.escape(commentId)}"] [data-rt-reply-text]`)?.focus();
          break;
        case 'send-reply': {
          if (!record || !project) break;
          const box = host.querySelector(`[data-rt-comment="${CSS.escape(commentId)}"] [data-rt-reply-text]`);
          if (!box || !String(box.value || '').trim()) break;
          setReply(record, commentId, box.value);
          replying = '';
          persistRecord(project, record);
          render();
          break;
        }
        case 'mark-done': {
          if (!record || !project) break;
          let done = false;
          eachComment(record, (entry, id) => { if (id === commentId) done = !!entry.done; });
          setDone(record, commentId, !done);
          persistRecord(project, record);
          render();
          break;
        }
        case 'open-compare':
          compareOpen = true;
          render();
          break;
        case 'close-compare':
          compareOpen = false;
          render();
          break;
        default: break;
      }
    });
  }

  /** The panel's tab calls this with its placeholder container. */
  function show(container) {
    if (!container) return false;
    const fresh = !host || host !== container;
    host = container;
    if (fresh) {
      host.replaceChildren();
      wire();
    }
    compareOpen = false;
    editing = 0;
    replying = '';
    syncFromLastImport(activeProject());
    render();
    return true;
  }

  /* ------------------------------------------------- the 送审 side (replies) */

  function pendingReplyFindings() {
    const record = readRecord(activeProject());
    return record ? replyFindingsFromRecord(record) : [];
  }

  function markRepliesCarried(fileName, carriedNotes) {
    const project = activeProject();
    const record = readRecord(project);
    if (!record) return 0;
    const touched = markCarriedInRecord(record, fileName, carriedNotes);
    if (touched) persistRecord(project, record);
    return touched;
  }

  root.AISystem6RoundtripReview = Object.freeze({
    show,
    state: () => {
      const record = readRecord(activeProject());
      return record ? { round: record.round, fileName: record.fileName, counts: decisionCounts(record) } : null;
    },
    // The desk model, exposed for the contract and the panel's assembly.
    RECORD_VERSION,
    freshRecord,
    readRecord,
    writeRecord,
    syncFromLastImport,
    blocksOf,
    locateInBody,
    planAdoption,
    planRevert,
    rewriteMeasure,
    replyFindingsFromRecord,
    markCarriedInRecord,
    threeWayRows,
    setReply,
    setDone,
    // The tab's write paths, exposed for the contract the way the panel's own
    // API is: adoptRow is the ONE road into the manuscript, and revertRow the
    // one road back out of an acceptance.
    adoptRow,
    rejectRow,
    revertRow,
  });
  root.AISystem6RoundtripReviewLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
