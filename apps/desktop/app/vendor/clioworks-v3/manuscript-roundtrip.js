/* ClioWorks N14: the manuscript round trip's engine — 送审 planning and 回稿
 * alignment (design proposal RoundTrip.dc.html). Pure logic, no DOM: the
 * dialog and the windoid live in features/manuscript-roundtrip.js, which this
 * file precedes in one lazy loader (config.js ensureManuscriptRoundTripModule).
 *
 * N14's half is machinery and storage only: it plans what a clean 送审 .docx
 * carries (the manuscript's own text, the cited sources as footnotes, nothing
 * of the desk's own marks), names each round from what the 来回 folder already
 * holds, and aligns a 回稿 paragraph by paragraph against the round it answers.
 * The per-paragraph candidates, the message column and the three-way compare
 * are N8's work and stay out of here; importing never touches the manuscript.
 *
 * The citation grammar is the one core/context-retrieval.js owns
 * (collectCitedSourceIds): `[S3]` and `[S3:12]` both name source S3, the
 * number after the colon a passage inside it. A mark whose source the project
 * registry does not resolve is kept in the text verbatim and reported — it is
 * never dropped silently. Source entries arrive in buildSourceBibliography()'s
 * shape ({ sourceId, title, url, kind, missing }), so the engine reads what
 * the desk already knows rather than building a second registry.
 *
 * AI trace comments follow formatTeachTextInsertion (core/persistence-status.js):
 * `<!-- AI System 6 insertion\n…\n-->` is the desk's own provenance note, so it
 * is what gets removed; every other comment is the writer's and stays. */
(function (root) {
  'use strict';
  if (root.AISystem6ManuscriptRoundTrip) return;

  const ROUND_FOLDER_NAME = '来回';
  const SEND_TOKEN = '送审';
  const RETURN_TOKEN = '回稿';
  // 「<标题>-送审-第N轮.docx」 / 「<标题>-回稿-第N轮.docx」. The round name is
  // part of the file's identity, so both languages write the same pattern and
  // the pairing below can always read it back.
  const ROUND_NAME_RE = /^(.+)-(送审|回稿)-第(\d+)轮\.docx$/;
  // collectCitedSourceIds' grammar, restated here because the engine is loaded
  // alone in contracts: [S3] and [S3:12] both name source S3.
  const CITATION_RE = /\[(S\d+)(?::\d+)?\]/g;
  const AI_INSERTION_COMMENT_RE = /<!--\s*AI System 6 insertion\b[\s\S]*?-->\s*/g;
  // The LCS table is O(n·m); past the cap the alignment falls back to plain
  // index pairing, which reports fewer matches than exist, never wrong ones.
  const ALIGN_CELL_CAP = 250_000;

  const roundOf = (sourceId) => parseInt(String(sourceId || '').replace(/^S/, ''), 10) || 0;
  const byRound = (a, b) => roundOf(a) - roundOf(b);
  const textOf = (entry) => (entry && typeof entry === 'object' ? String(entry.text ?? '') : String(entry ?? ''));
  const idOf = (entry) => (entry && typeof entry === 'object' ? String(entry.id ?? '') : '');

  /** One title as a file name can carry: filename-illegal characters folded,
   * whitespace squeezed, and a neutral fallback when nothing is left. */
  function sanitizeFileTitle(title) {
    const cleaned = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || 'manuscript';
  }

  /** The manuscript's display title: the document name, else the first level-1
   * heading. The caller (getTeachTextDocumentName) usually resolves both, but
   * the engine answers from the raw markdown when handed only that. */
  function manuscriptTitle(markdown, documentName) {
    const named = String(documentName || '').trim();
    if (named && named !== 'Untitled' && named !== '未命名') return sanitizeFileTitle(named);
    const heading = /^#\s+(.+?)\s*$/m.exec(String(markdown || ''));
    return sanitizeFileTitle(heading ? heading[1] : '');
  }

  /** Read one 来回 file name: { title, kind: 'send'|'return', round } or null. */
  function parseRoundName(name) {
    const match = ROUND_NAME_RE.exec(String(name || '').trim());
    if (!match) return null;
    const round = parseInt(match[3], 10);
    if (!Number.isFinite(round) || round < 1) return null;
    return { title: match[1], kind: match[2] === SEND_TOKEN ? 'send' : 'return', round };
  }

  function sendFileName(title, round) {
    return `${sanitizeFileTitle(title)}-${SEND_TOKEN}-第${round}轮.docx`;
  }

  function returnFileName(title, round) {
    return `${sanitizeFileTitle(title)}-${RETURN_TOKEN}-第${round}轮.docx`;
  }

  /** The rounds a title already sent, highest first. */
  function sendRoundsFor(names, title) {
    const wanted = String(title || '');
    return (Array.isArray(names) ? names : [])
      .map(parseRoundName)
      .filter((parsed) => parsed && parsed.kind === 'send' && parsed.title === wanted)
      .map((parsed) => parsed.round)
      .sort((a, b) => b - a);
  }

  /** N for the next send: the highest same-title round plus one, from 1. */
  function nextSendRound(names, title) {
    const rounds = sendRoundsFor(names, title);
    return rounds.length ? rounds[0] + 1 : 1;
  }

  /** The send round a 回稿 answers: the latest same-title one, or null. */
  function latestSendRound(names, title) {
    const rounds = sendRoundsFor(names, title);
    return rounds.length ? { round: rounds[0], name: `${String(title)}-${SEND_TOKEN}-第${rounds[0]}轮.docx` } : null;
  }

  /** The desk's own provenance notes out, the words around them untouched. */
  function stripAiInsertionComments(markdown) {
    return String(markdown || '').replace(AI_INSERTION_COMMENT_RE, '').trimEnd();
  }

  function footnoteBodyFor(entry) {
    const title = String(entry?.title || '').trim();
    const url = String(entry?.url || '').trim();
    return (title && url ? `${title} — ${url}` : title || url || '') || '[?]';
  }

  /**
   * The manuscript a reviewer receives. AI-insertion comments are gone;
   * citation marks whose source the registry resolves become `[^S3]` with one
   * definition per source appended at the end (word-export.js writes those as
   * real Word footnotes); unresolved marks stay in the text exactly as typed
   * and are named in unresolvedMarks. Definitions are blank-line separated so
   * each is its own paragraph to the shared lexer.
   * @param {string} markdown
   * @param {Array<{sourceId: string, title?: string, url?: string, missing?: boolean}>} sources
   */
  function cleanManuscriptForReview(markdown, sources) {
    const resolvable = new Map();
    for (const entry of Array.isArray(sources) ? sources : []) {
      if (entry && !entry.missing && entry.sourceId) resolvable.set(String(entry.sourceId), entry);
    }
    const body = stripAiInsertionComments(markdown);
    const unresolved = new Set();
    const used = new Set();
    const converted = body.replace(CITATION_RE, (mark, sourceId) => {
      if (!resolvable.has(sourceId)) {
        unresolved.add(sourceId);
        return mark; // 查不到来源的引用标记原样保留，不许静默丢。
      }
      used.add(sourceId);
      return `[^${sourceId}]`;
    });
    const footnotes = [...used].sort(byRound).map((sourceId) => ({
      sourceId,
      body: footnoteBodyFor(resolvable.get(sourceId)),
    }));
    const definitions = footnotes.map((note) => `[^${note.sourceId}]: ${note.body}`).join('\n\n');
    const withNotes = definitions ? `${converted}\n\n${definitions}` : converted;
    return {
      markdown: withNotes,
      footnotes,
      unresolvedMarks: [...unresolved].sort(byRound),
    };
  }

  /**
   * Everything the 送审 dialog shows and the export consumes, computed once:
   * the title, the round the 来回 folder's own names give it, the cleaned
   * markdown and which citation marks did not resolve.
   * @param {{ markdown?: string, documentName?: string, folderFileNames?: string[],
   *   sources?: Array<object>, convertCitations?: boolean }} input
   */
  function planSendReview(input = {}) {
    const rawMarkdown = String(input.markdown || '');
    const title = manuscriptTitle(rawMarkdown, input.documentName);
    const cleaned = input.convertCitations === false
      ? { markdown: stripAiInsertionComments(rawMarkdown), footnotes: [], unresolvedMarks: [] }
      : cleanManuscriptForReview(rawMarkdown, input.sources);
    const round = nextSendRound(input.folderFileNames, title);
    const previous = sendRoundsFor(input.folderFileNames, title)[0] || null;
    return {
      title,
      round,
      previousRound: previous,
      fileName: sendFileName(title, round),
      folderName: ROUND_FOLDER_NAME,
      markdown: cleaned.markdown,
      footnotes: cleaned.footnotes,
      unresolvedMarks: cleaned.unresolvedMarks,
    };
  }

  /** Longest common subsequence of equal texts, as index pairs in order. */
  function textMatches(sentTexts, returnedTexts) {
    const n = sentTexts.length;
    const m = returnedTexts.length;
    if (!n || !m || n * m > ALIGN_CELL_CAP) return null;
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * width + j] = sentTexts[i] === returnedTexts[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    const pairs = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (sentTexts[i] === returnedTexts[j]) {
        pairs.push([i, j]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
    return pairs;
  }

  /**
   * One paragraph of the returned document against the send it answers:
   * same (untouched), changed (a rewrite, paired in order inside its stretch),
   * added (no counterpart in the send) or removed (dropped by the reviewer).
   * Index fallback pairs positionally when the texts are too long for the LCS.
   * @param {Array<{id?: string, text: string}|string>} sent
   * @param {Array<{id?: string, text: string}|string>} returned
   * @returns {Array<{index: number, sentIndex: number, returnedIndex: number,
   *   sentId: string, returnedId: string, sentText: string, returnedText: string,
   *   kind: 'same'|'changed'|'added'|'removed', changed: boolean, comments: Array<object>}>}
   */
  function alignParagraphs(sent, returned) {
    const sentList = (Array.isArray(sent) ? sent : [])
      .map((entry, at) => ({ id: idOf(entry), text: textOf(entry), at }));
    const returnedList = (Array.isArray(returned) ? returned : [])
      .map((entry, at) => ({ id: idOf(entry), text: textOf(entry), at }));
    const sentTexts = sentList.map((entry) => entry.text);
    const returnedTexts = returnedList.map((entry) => entry.text);
    const pairs = textMatches(sentTexts, returnedTexts) || (
      // Positional fallback: an index whose texts are equal is a match; the
      // rest pair positionally, which can only under-report matches.
      sentTexts.map((text, index) => [index, returnedTexts.indexOf(text, index)])
        .filter(([i, j]) => j >= 0)
    );

    // Rows as { sent, returned, kind } halves first; one reshape at the end.
    const halves = [];
    let cursorSent = 0;
    let cursorReturned = 0;
    const pushGap = (untilSent, untilReturned) => {
      const gapSent = [];
      const gapReturned = [];
      while (cursorSent < untilSent) gapSent.push(sentList[cursorSent++]);
      while (cursorReturned < untilReturned) gapReturned.push(returnedList[cursorReturned++]);
      const paired = Math.min(gapSent.length, gapReturned.length);
      for (let k = 0; k < paired; k += 1) halves.push({ sent: gapSent[k], returned: gapReturned[k], kind: 'changed' });
      for (let k = paired; k < gapSent.length; k += 1) halves.push({ sent: gapSent[k], returned: null, kind: 'removed' });
      for (let k = paired; k < gapReturned.length; k += 1) halves.push({ sent: null, returned: gapReturned[k], kind: 'added' });
    };
    for (const [i, j] of pairs) {
      pushGap(i, j);
      halves.push({ sent: sentList[i], returned: returnedList[j], kind: 'same' });
      cursorSent = i + 1;
      cursorReturned = j + 1;
    }
    pushGap(sentList.length, returnedList.length);

    return halves.map((half, at) => ({
      index: at + 1,
      sentIndex: half.sent ? half.sent.at : null,
      returnedIndex: half.returned ? half.returned.at : null,
      sentId: half.sent ? half.sent.id : '',
      returnedId: half.returned ? half.returned.id : '',
      sentText: half.sent ? half.sent.text : '',
      returnedText: half.returned ? half.returned.text : '',
      kind: half.kind,
      changed: half.kind !== 'same',
      comments: [],
    }));
  }

  /**
   * Hang each reviewer comment on the row its anchor sits in. A comment whose
   * anchor paragraph is gone from the alignment (the reviewer commented a
   * stretch they then deleted) keeps its text in the summary count and lands
   * on no row — reported, not dropped.
   * @param {Array<object>} rows alignParagraphs() output (mutated)
   * @param {Array<{author?: string, text: string, anchor?: {paragraphId?: string,
   *   endParagraphId?: string}}>} comments quire-adapter comments()
   */
  function attachComments(rows, comments) {
    const rowByReturnedId = new Map();
    for (const row of rows) if (row.returnedId) rowByReturnedId.set(row.returnedId, row);
    const unplaced = [];
    for (const comment of Array.isArray(comments) ? comments : []) {
      if (!comment || !String(comment.text || '').trim()) continue;
      const anchor = comment.anchor || {};
      const row = rowByReturnedId.get(String(anchor.paragraphId || ''))
        || rowByReturnedId.get(String(anchor.endParagraphId || ''));
      const record = { author: String(comment.author || ''), text: String(comment.text || '') };
      if (row) row.comments.push(record);
      else unplaced.push(record);
    }
    return unplaced;
  }

  /** The one line the windoid shows: paragraphs the other side touched, and
   * the notes they left, counted from the rows themselves. */
  function summarizeReturn(rows, commentCount) {
    const list = Array.isArray(rows) ? rows : [];
    const changed = list.filter((row) => row.kind === 'changed').length;
    const added = list.filter((row) => row.kind === 'added').length;
    const removed = list.filter((row) => row.kind === 'removed').length;
    return {
      changedParagraphs: changed + added + removed,
      edited: changed,
      added,
      removed,
      comments: Number.isFinite(commentCount) ? commentCount : list.reduce((sum, row) => sum + row.comments.length, 0),
    };
  }

  root.AISystem6ManuscriptRoundTrip = Object.freeze({
    ROUND_FOLDER_NAME,
    sanitizeFileTitle,
    manuscriptTitle,
    parseRoundName,
    sendFileName,
    returnFileName,
    nextSendRound,
    latestSendRound,
    stripAiInsertionComments,
    cleanManuscriptForReview,
    planSendReview,
    alignParagraphs,
    attachComments,
    summarizeReturn,
  });
})(typeof window !== 'undefined' ? window : globalThis);
