// A walk Shortcut copies an optional 【散步】 / 【Walk】 date header and the
// writer's verbatim transcript. Spoken marks follow the words worth keeping.
// This data-only module extracts exact substrings; it never rewrites the voice.
(() => {
  const WALK_MARK_WORDS = Object.freeze(["标记", "记一下", "记下来", "mark this"]);

  function parseWalkEnvelope(text = "") {
    const value = String(text).trim();
    const header = value.match(/^【(?:散步|Walk)】([^\r\n]*)(?:\r?\n|$)/);
    return header
      ? { meta: header[1].trim(), body: value.slice(header[0].length).trim() }
      : { meta: "", body: value };
  }

  function findSpokenMarks(body = "") {
    const marks = [];
    const pattern = /标记|记一下|记下来|\bmark this\b/gi;
    for (const match of body.matchAll(pattern)) {
      // A marker can follow a completed sentence (「这一句。标记」).
      // Step over its closing punctuation before finding the prior boundary.
      let end = match.index;
      while (end > 0 && /[\s。！？!?，,、]/.test(body[end - 1])) end -= 1;
      let start = end;
      while (start > 0 && !/[。！？!?\n]/.test(body[start - 1])) start -= 1;
      const quote = body.slice(start, end).trim();
      if (quote && !WALK_MARK_WORDS.includes(quote.toLowerCase())) {
        marks.push({ index: match.index, word: match[0], quote });
      }
    }
    return marks;
  }

  function walkMaterialText({ body, marks = [], labels }) {
    if (!marks.length) return body;
    return `${labels.marksHeading}\n${marks.map((mark, index) => `${index + 1}. ${mark.quote}`).join("\n")}\n\n${labels.transcriptHeading}\n${body}`;
  }

  function walkFileName({ meta = "", now = new Date(), prefix }) {
    const match = meta.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    const parts = match ? match.slice(1) : [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes()];
    const [year, month, day, hour, minute] = parts.map((part) => String(part).padStart(2, "0"));
    return `${prefix} ${year}-${month}-${day} ${hour}.${minute}.txt`;
  }

  window.AISystem6WalkTranscript = Object.freeze({ parseWalkEnvelope, findSpokenMarks, walkMaterialText, walkFileName, WALK_MARK_WORDS });
})();
