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

  function segmentListenBeats(body = "") {
    const source = String(body || "");
    const beats = [];
    const pushBeat = (start, end) => {
      const text = source.slice(start, end);
      if (!text.trim()) return;
      beats.push({ index: beats.length, start, end, text });
    };
    const blockPattern = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
    let block;
    while ((block = blockPattern.exec(source)) !== null) {
      const blockStart = block.index;
      const blockText = block[0];
      if (!blockText.trim()) continue;
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

  window.AISystem6ListenBeats = Object.freeze({
    segmentListenBeats,
    listenBeatForOffset,
    findListenQuoteRange,
  });
})();
