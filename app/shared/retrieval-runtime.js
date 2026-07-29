// Pure retrieval contracts. No DOM, browser storage, network, or project globals.

(function exposeRetrievalRuntime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6RetrievalRuntime = api;
})(typeof globalThis !== "undefined" ? (/** @type {any} */ (globalThis)).window || null : null, () => {
  const chunkingVersion = "text-900-overlap-160-v2";

  function stableHash(value = "") {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u0000/g, "")
      .trim();
  }

  function preferredChunkEnd(text, start, hardEnd, minSize) {
    if (hardEnd >= text.length) return text.length;
    const slice = text.slice(start, hardEnd);
    const breakpoints = ["\n\n", "\n", "。", "！", "？", "；", "; ", ". "]
      .map((marker) => {
        const index = slice.lastIndexOf(marker);
        return index >= minSize ? index + marker.length : -1;
      })
      .filter((index) => index > 0);
    return breakpoints.length ? start + Math.max(...breakpoints) : hardEnd;
  }

  function chunkText(text, source, options = {}) {
    const normalized = typeof options.normalize === "function"
      ? options.normalize(text)
      : normalizeText(text);
    const size = Number.isInteger(options.chunkSize) ? options.chunkSize : 900;
    const overlap = Number.isInteger(options.overlap) ? options.overlap : 160;
    if (size < 100 || overlap < 0 || overlap >= size) throw new RangeError("Invalid retrieval chunk geometry.");
    const chunks = [];
    const minBreakSize = Math.floor(size * 0.55);
    let start = 0;
    while (start < normalized.length) {
      const hardEnd = Math.min(start + size, normalized.length);
      const end = preferredChunkEnd(normalized, start, hardEnd, minBreakSize);
      const content = normalized.slice(start, end).trim();
      if (content.length > 80) {
        chunks.push({
          source,
          content,
          chunkIndex: chunks.length + 1,
          start,
          end,
          chunkHash: stableHash(content),
          chunkingVersion: options.chunkingVersion || chunkingVersion,
        });
      }
      if (end >= normalized.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    return chunks;
  }

  function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
    let dot = 0;
    let aSize = 0;
    let bSize = 0;
    for (let index = 0; index < a.length; index += 1) {
      const left = Number(a[index]);
      const right = Number(b[index]);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
      dot += left * right;
      aSize += left * left;
      bSize += right * right;
    }
    if (aSize === 0 || bSize === 0) return 0;
    const score = dot / (Math.sqrt(aSize) * Math.sqrt(bSize));
    return Number.isFinite(score) ? score : 0;
  }

  function normalizeSearchText(value) {
    return String(value || "").normalize("NFKC").toLowerCase();
  }

  function getQueryWords(userText) {
    const text = normalizeSearchText(userText);
    const terms = new Set();
    const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
    let match;
    while ((match = cjkPattern.exec(text))) {
      const runes = Array.from(match[0]);
      if (runes.length <= 4) {
        terms.add(runes.join(""));
        continue;
      }
      terms.add(runes.join(""));
      for (const width of [2, 3]) {
        for (let index = 0; index <= runes.length - width; index += 1) {
          terms.add(runes.slice(index, index + width).join(""));
        }
      }
    }
    const nonCjkText = text.replace(cjkPattern, " ");
    for (const word of nonCjkText.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) || []) {
      if (word.length > 1) terms.add(word);
    }
    return terms;
  }

  function keywordScore(text, queryWords) {
    const lower = normalizeSearchText(text);
    let score = 0;
    queryWords.forEach((word) => {
      if (lower.includes(word)) score += word.length >= 4 ? 2 : 1;
    });
    return score;
  }

  function chunkIdentity(chunk = {}) {
    return String(
      chunk.id
      || chunk.chunkId
      || [
        chunk.sourceId || chunk.referenceId || chunk.source || chunk.referenceName || "source",
        chunk.chunkIndex || chunk.referenceChunkIndex || 1,
      ].join(":")
    );
  }

  function sourceContentHash(chunk = {}) {
    return String(
      chunk.sourceHash
      || chunk.contentHash
      || chunk.hash
      || stableHash(chunk.content || chunk.text || "")
    );
  }

  function buildRetrievalCacheVersion(options = {}) {
    const chunks = Array.isArray(options.chunks) ? options.chunks : [];
    const dimension = Number(options.embeddingDimensions || chunks.find((chunk) => Array.isArray(chunk.embedding))?.embedding?.length || 0);
    const records = chunks
      .map((chunk) => [
        chunkIdentity(chunk),
        sourceContentHash(chunk),
        chunk.chunkingVersion || options.chunkingVersion || chunkingVersion,
      ].join("@"))
      .sort();
    return [
      `project=${String(options.projectId || "")}`,
      `chunking=${String(options.chunkingVersion || chunkingVersion)}`,
      `provider=${String(options.embeddingProvider || "local")}`,
      `model=${String(options.embeddingModel || "")}`,
      `dimensions=${Number.isFinite(dimension) ? dimension : 0}`,
      `chunks=${stableHash(records.join("|"))}`,
    ].join(";");
  }

  function normalizeEvidence(item = {}, defaults = {}) {
    const projectId = String(item.projectId || "");
    const sourceId = String(item.sourceId || item.referenceId || item.fileId || item.id || "");
    const chunkId = String(item.chunkId || item.id || `${sourceId}:${item.chunkIndex || item.referenceChunkIndex || 1}`);
    const text = String(item.text || item.content || "");
    return {
      projectId,
      sourceId,
      sourceVersion: String(item.sourceVersion || item.updatedAt || ""),
      sourceHash: sourceContentHash(item),
      chunkId,
      span: {
        start: Number.isFinite(Number(item.start)) ? Number(item.start) : null,
        end: Number.isFinite(Number(item.end)) ? Number(item.end) : null,
      },
      role: String(item.role || defaults.role || "source"),
      text,
      citation: String(item.citation || item.citationId || ""),
      score: Number.isFinite(Number(item.score ?? item.lastQueryScore)) ? Number(item.score ?? item.lastQueryScore) : 0,
      retrievedAt: String(item.retrievedAt || defaults.retrievedAt || ""),
    };
  }

  function evidenceBelongsToScope(evidence, options = {}) {
    if (!evidence || String(evidence.projectId || "") !== String(options.projectId || "")) return false;
    const sourceIds = (options.sourceIds || []).map(String);
    const citationIds = (options.citationIds || []).map(String);
    if (sourceIds.length && !sourceIds.includes(String(evidence.sourceId || ""))) return false;
    if (citationIds.length && !citationIds.includes(String(evidence.citation || ""))) return false;
    return true;
  }

  return Object.freeze({
    chunkingVersion,
    stableHash,
    normalizeText,
    chunkText,
    cosineSimilarity,
    normalizeSearchText,
    getQueryWords,
    keywordScore,
    buildRetrievalCacheVersion,
    normalizeEvidence,
    evidenceBelongsToScope,
  });
});
