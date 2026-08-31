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

  window.AISystem6ListenBeats = Object.freeze({
    segmentListenBeats,
    listenBeatForOffset,
    findListenQuoteRange,
    estimateListenBeatSeconds,
    formatSrtTimestamp,
    buildListenSrt,
  });
})();
