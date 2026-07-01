// Lazy feature module: video-transcript.

(function initVideoTranscriptModule() {
  const videoTranscriptDataContract = Object.freeze({
    schemaVersion: 1,
    sourceType: "video_transcript",
    blockFields: Object.freeze(["index", "start", "end", "text"]),
    paragraphFields: Object.freeze(["id", "timeStart", "timeEnd", "blockIds", "text"]),
  });

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeVideoTranscriptSource(raw, fallbackSourceName = "") {
    if (!raw || raw.type === "video_transcript") {
      const blocks = asArray(raw?.blocks)
        .map((block, index) => ({
          index: Number(block?.index) || index + 1,
          start: String(block?.start || ""),
          end: String(block?.end || ""),
          text: String(block?.text || "").trim(),
        }))
        .filter((block) => block.start && block.end && block.text);
      const paragraphs = asArray(raw?.paragraphs)
        .map((paragraph, index) => ({
          id: String(paragraph?.id || `para-${index + 1}`),
          timeStart: String(paragraph?.timeStart || paragraph?.start || ""),
          timeEnd: String(paragraph?.timeEnd || paragraph?.end || ""),
          text: String(paragraph?.text || "").trim(),
          blockIds: asArray(paragraph?.blockIds).map((id) => String(id)),
        }))
        .filter((paragraph) => paragraph.timeStart && paragraph.timeEnd && paragraph.text);
      return {
        id: String(raw?.id || ""),
        type: "video_transcript",
        sourceName: String(raw?.sourceName || fallbackSourceName || ""),
        blocks,
        paragraphs,
      };
    }
    return null;
  }

  function srtTimeToSeconds(value) {
    const match = String(value || "").trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
    if (!match) return 0;
    return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + (Number(match[4]) / 1000);
  }

  function compactSrtTime(value) {
    const match = String(value || "").trim().match(/^(?:(\d{2}):)?(\d{2}):(\d{2}),\d{3}$/);
    if (!match) return String(value || "");
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function parseSrtBlocks(rawText) {
    const normalized = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
    const blocks = [];
    normalized.split(/\n{2,}/).forEach((chunk, chunkIndex) => {
      const lines = chunk.trim().split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
      if (lines.length < 2) return;
      const number = /^\d+$/.test(lines[0].trim()) ? Number(lines.shift().trim()) : chunkIndex + 1;
      const timeline = lines.shift()?.trim() || "";
      const match = timeline.match(/^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/);
      if (!match) return;
      const text = lines.join("\n").replace(/<[^>]+>/g, "").trim();
      if (!text) return;
      blocks.push({
        index: number,
        start: match[1],
        end: match[2],
        text,
      });
    });
    return blocks;
  }

  function buildTranscriptParagraphs(blocks) {
    const paragraphs = [];
    let current = null;
    const sentenceBreak = /[.!?。！？…」』”）)]$/u;
    const softBreak = /[,，;；:：]$/u;
    const flush = () => {
      if (!current || !current.texts.length) return;
      paragraphs.push({
        id: `para-${paragraphs.length + 1}`,
        timeStart: current.timeStart,
        timeEnd: current.timeEnd,
        blockIds: current.blockIds,
        text: current.texts.join(" ").replace(/\s+/g, " ").trim(),
      });
      current = null;
    };

    blocks.forEach((block) => {
      const text = String(block.text || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      const startSeconds = srtTimeToSeconds(block.start);
      const endSeconds = srtTimeToSeconds(block.end);
      const gap = current ? startSeconds - current.lastEndSeconds : 0;
      const projectedChars = (current?.charCount || 0) + text.length;
      const projectedDuration = current ? endSeconds - current.startSeconds : endSeconds - startSeconds;
      if (current && (gap > 2.4 || projectedChars > 180 || projectedDuration > 42)) flush();
      if (!current) {
        current = {
          timeStart: block.start,
          timeEnd: block.end,
          startSeconds,
          lastEndSeconds: endSeconds,
          charCount: 0,
          texts: [],
          blockIds: [],
        };
      }
      current.texts.push(text);
      current.timeEnd = block.end || current.timeEnd;
      current.lastEndSeconds = endSeconds || current.lastEndSeconds;
      current.charCount += text.length;
      current.blockIds.push(String(block.index));
      if (sentenceBreak.test(text) || (softBreak.test(text) && current.charCount >= 90) || current.texts.length >= 6) flush();
    });
    flush();
    return paragraphs;
  }

  function transcriptParagraphText(paragraph) {
    const start = compactSrtTime(paragraph.timeStart || paragraph.start || "");
    const end = compactSrtTime(paragraph.timeEnd || paragraph.end || "");
    return `[${start}-${end}] ${paragraph.text || ""}`.trim();
  }

  function buildVideoTranscriptSource(rawSrt, sourceName = "") {
    const blocks = parseSrtBlocks(rawSrt);
    if (!blocks.length) return null;
    const paragraphs = buildTranscriptParagraphs(blocks);
    return {
      sourceType: "video_transcript",
      type: "video_transcript",
      sourceName: String(sourceName || ""),
      blocks,
      paragraphs,
      text: paragraphs.map(transcriptParagraphText).join("\n\n"),
    };
  }

  function getParagraphForSelection(selection, root) {
    if (!selection?.rangeCount || !root) return null;
    const range = selection.getRangeAt(0);
    const anchorEl = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer?.parentElement;
    const paragraphEl = anchorEl?.closest?.("[data-transcript-paragraph-id]");
    if (!paragraphEl || !root.contains(paragraphEl)) return null;
    const blockIds = String(paragraphEl.dataset.transcriptBlockIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return {
      paragraphId: paragraphEl.dataset.transcriptParagraphId || "",
      start: paragraphEl.dataset.transcriptStart || "",
      end: paragraphEl.dataset.transcriptEnd || "",
      blockIds,
    };
  }

  window.AISystem6VideoTranscript = {
    dataContract: videoTranscriptDataContract,
    buildVideoTranscriptSource,
    compactSrtTime,
    normalizeVideoTranscriptSource,
    getParagraphForSelection,
  };
  window.AISystem6VideoTranscriptLoaded = true;
})();
