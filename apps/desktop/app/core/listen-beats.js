// Listen beats are the spoken units of a Quick Draft body: blank-line
// paragraphs, split again into sentence groups when one paragraph is too long
// to speak in one breath. Every beat carries character offsets into the raw
// body, so body.slice(start, end) === text always holds and a beat maps 1:1
// to a textarea selection.
//
// findListenQuoteRange locates a model-quoted sentence in the body through a
// ladder of progressively looser candidates and returns null when none match.
// Callers must refuse the action on null — never guess a position.
(() => {
  const LONG_BEAT_CHARS = 110;
  const MIN_CANDIDATE_CHARS = 9;

  function splitSentences(text) {
    const parts = [];
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      if ("。！？!?…".includes(text[i])) {
        let end = i + 1;
        while (end < text.length && "”』」\"')）]".includes(text[end])) end += 1;
        parts.push({ start, end });
        start = end;
        i = end - 1;
      }
    }
    if (start < text.length) parts.push({ start, end: text.length });
    return parts;
  }

  // Blank-line blocks: the one paragraph rule shared by beats and storyboard rows.
  function listenBlocks(source) {
    const blocks = [];
    const blockPattern = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
    let block;
    while ((block = blockPattern.exec(source)) !== null) {
      if (block[0].trim()) blocks.push({ start: block.index, text: block[0] });
    }
    return blocks;
  }

  function segmentListenBeats(body = "") {
    const source = String(body || "");
    const beats = [];
    const pushBeat = (start, end) => {
      const text = source.slice(start, end);
      if (!text.trim()) return;
      beats.push({ index: beats.length, start, end, text });
    };
    for (const { start: blockStart, text: blockText } of listenBlocks(source)) {
      if (blockText.trim().length <= LONG_BEAT_CHARS) {
        pushBeat(blockStart, blockStart + blockText.length);
        continue;
      }
      const sentences = splitSentences(blockText);
      let groupStart = null;
      let groupEnd = null;
      for (const sentence of sentences) {
        if (groupStart === null) {
          groupStart = sentence.start;
          groupEnd = sentence.end;
          continue;
        }
        if (sentence.end - groupStart > LONG_BEAT_CHARS) {
          pushBeat(blockStart + groupStart, blockStart + groupEnd);
          groupStart = sentence.start;
          groupEnd = sentence.end;
        } else {
          groupEnd = sentence.end;
        }
      }
      if (groupStart !== null) pushBeat(blockStart + groupStart, blockStart + groupEnd);
    }
    return beats;
  }

  function listenBeatForOffset(beats = [], offset = 0) {
    const at = Number(offset) || 0;
    let previous = null;
    for (const beat of beats) {
      if (at >= beat.start && at < beat.end) return beat;
      if (beat.end <= at) previous = beat;
      if (beat.start > at) return previous || beat;
    }
    return previous;
  }

  function normalizeQuoteSearchText(text) {
    return String(text || "")
      .replace(/[“”"'']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // A CJK character carries far more information than a Latin one, so a short
  // Chinese quote is still specific enough to anchor on.
  function quoteCandidateUsable(candidate) {
    if (!candidate) return false;
    const min = /[㐀-鿿]/.test(candidate) ? 4 : MIN_CANDIDATE_CHARS;
    return candidate.length >= min;
  }

  function findListenQuoteRange(body = "", quote = "") {
    const text = String(body || "");
    const normalized = normalizeQuoteSearchText(quote);
    if (!text.trim() || !normalized) return null;
    const candidates = [
      String(quote || "").trim(),
      normalized,
      normalized.split(/[.;。！？!?]/)[0]?.trim(),
      normalized.slice(0, 120).trim(),
    ].filter((item, index, arr) => quoteCandidateUsable(item) && arr.indexOf(item) === index);
    for (const candidate of candidates) {
      const start = text.indexOf(candidate);
      if (start >= 0) return { start, end: start + candidate.length };
    }
    const lowerText = text.toLowerCase();
    for (const candidate of candidates) {
      const start = lowerText.indexOf(candidate.toLowerCase());
      if (start >= 0) return { start, end: start + candidate.length };
    }
    return null;
  }

  // --- subtitle timing (estimates, and they say so) -------------------------
  // A beat's duration is estimated from reading speed — the same rates the
  // draft statistics use (≈5 CJK characters or 2.4 Latin words per second),
  // divided by the playback rate. An SRT built here is a draft timeline for an
  // editor to slide, never a claim of measured audio.

  function estimateListenBeatSeconds(text = "", rate = 1) {
    const value = String(text || "");
    const cjk = value.match(/[㐀-鿿]/g)?.length || 0;
    const words = value.replace(/[㐀-鿿]/g, " ").match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length || 0;
    const seconds = cjk / 5 + words / 2.4;
    const speed = Number(rate) > 0 ? Number(rate) : 1;
    return Math.max(1.2, seconds / speed);
  }

  function formatSrtTimestamp(totalSeconds = 0) {
    const clamped = Math.max(0, Number(totalSeconds) || 0);
    const milliseconds = Math.round((clamped % 1) * 1000);
    const whole = Math.floor(clamped);
    const hours = String(Math.floor(whole / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
    const seconds = String(whole % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds},${String(milliseconds).padStart(3, "0")}`;
  }

  function buildListenSrt(beats = [], { rate = 1 } = {}) {
    let clock = 0;
    return beats.map((beat, index) => {
      const start = clock;
      clock += estimateListenBeatSeconds(beat.text, rate);
      const text = String(beat.text || "").replace(/\s*\n\s*/g, " ").trim();
      return `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(clock)}\n${text}\n`;
    }).join("\n");
  }

  // --- storyboard (分镜) rows -------------------------------------------------
  // One row per paragraph, never per beat: a paragraph is one run of shots.
  // A one-sentence transition ("内存正常了，我就想试点更过分的。") introduces
  // the shots after it, so it folds forward into the next paragraph; Markdown
  // headings are not shots and never become rows. Each row carries a q: anchor
  // (its opening words) that findListenQuoteRange resolves back to the row's
  // own start, and an estimate that sums the SRT's per-beat estimates, so the
  // two exports share one clock (the SRT alone also reads a heading aloud). Visual cues are placed by quote; a cue
  // whose sentence has left the body is dropped, never guessed onto a row.
  const TRANSITION_MAX_CHARS = 60;
  const ANCHOR_MAX_CHARS = 40;

  function segmentListenParagraphs(body = "") {
    const source = String(body || "");
    const paragraphs = [];
    let pendingStart = null;
    const push = (start, end) => {
      paragraphs.push({ index: paragraphs.length, start, end, text: source.slice(start, end) });
    };
    const blocks = listenBlocks(source);
    blocks.forEach((block, position) => {
      const trimmed = block.text.trim();
      const end = block.start + block.text.length;
      if (isHeadingBlock(block)) return;
      const start = pendingStart ?? block.start;
      const isTransition = trimmed.length <= TRANSITION_MAX_CHARS && splitSentences(trimmed).length === 1;
      const next = blocks[position + 1];
      // A transition never folds across a heading or past the last paragraph.
      if (isTransition && next && !isHeadingBlock(next)) {
        pendingStart = start;
        return;
      }
      pendingStart = null;
      push(start, end);
    });
    return paragraphs;
  }

  function isHeadingBlock(block) {
    const trimmed = block.text.trim();
    return /^#{1,6}\s/.test(trimmed) && !trimmed.includes("\n");
  }

  // The shortest opening that ends at a clause mark, reads as words, and
  // resolves to this paragraph's own start. "" when none does: the row then
  // carries no anchor rather than one that points somewhere else.
  function listenParagraphAnchor(body = "", paragraph = {}) {
    const source = String(body || "");
    const opening = String(paragraph.text || "").trimStart();
    const start = source.indexOf(opening, paragraph.start || 0);
    if (!opening || start < 0) return "";
    const head = opening.slice(0, ANCHOR_MAX_CHARS).split(/\n|\||--/)[0];
    const cuts = [];
    for (let i = 0; i < head.length; i += 1) {
      if ("，、；：。！？,;:.!?".includes(head[i])) cuts.push(i);
    }
    cuts.push(head.length);
    for (const cut of cuts) {
      const candidate = head.slice(0, cut).trim();
      if (candidate.length < 6 || !quoteCandidateUsable(candidate)) continue;
      if (findListenQuoteRange(source, candidate)?.start === start) return candidate;
    }
    return "";
  }

  function buildStoryboardRows(body = "", { rate = 1, cues = [] } = {}) {
    const source = String(body || "");
    const beats = segmentListenBeats(source);
    const rows = segmentListenParagraphs(source).map((paragraph) => ({
      ...paragraph,
      anchor: listenParagraphAnchor(source, paragraph),
      seconds: beats
        .filter((beat) => beat.start >= paragraph.start && beat.start < paragraph.end)
        .reduce((sum, beat) => sum + estimateListenBeatSeconds(beat.text, rate), 0),
      cues: [],
    }));
    for (const cue of cues || []) {
      const range = findListenQuoteRange(source, cue?.quote);
      const row = range && rows.find((item) => range.start >= item.start && range.start < item.end);
      if (row) row.cues.push(cue);
    }
    return rows;
  }

  function formatStoryboardDuration(totalSeconds = 0) {
    const whole = Math.round(Math.max(0, Number(totalSeconds) || 0));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  // The file is a plain GFM table plus a list; the machine's anchors ride in
  // HTML comments. Footage and cuttable cells stay empty: only the writer
  // knows what has been shot and what can go.
  function buildStoryboardMarkdown(rows = [], { title = "", intro = "", columns = [], notesHeading = "", visual = () => "" } = {}) {
    const cell = (value) => String(value || "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
    const lines = rows.map((row, position) => {
      const anchor = row.anchor ? ` <!-- q:${row.anchor} -->` : "";
      return `| ${position + 1}${anchor} | ${cell(visual(row))} |  | ${formatStoryboardDuration(row.seconds)} |  |`;
    });
    return [
      `# ${title}`,
      "",
      intro,
      "",
      `| ${columns.map(cell).join(" | ")} |`,
      `|${" --- |".repeat(columns.length)}`,
      ...lines,
      "",
      notesHeading,
      "",
    ].join("\n");
  }

  window.AISystem6ListenBeats = Object.freeze({
    segmentListenBeats,
    segmentListenParagraphs,
    listenParagraphAnchor,
    buildStoryboardRows,
    formatStoryboardDuration,
    buildStoryboardMarkdown,
    listenBeatForOffset,
    findListenQuoteRange,
    estimateListenBeatSeconds,
    formatSrtTimestamp,
    buildListenSrt,
  });
})();
