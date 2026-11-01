// Endfield → ClioTalk/SideAsk grounding adapter.
//
// One RAG pipeline (server /api/endfield/search), two surfaces with their own
// character:
//   - the Endfield Terminal keeps its single-shot Q&A, 【n】 citations and
//     expandable evidence cards;
//   - a SideAsk conversation paired with the terminal re-runs the same
//     search for the CURRENT question and feeds the results into ClioTalk's
//     existing grounding/citation system ([S1]…[Sn]).
//
// Nothing here calls a model. It only retrieves and shapes evidence.

window.AISystem6EndfieldGrounding = (() => {
  const DEFAULT_LIMIT = 14;
  const sourceFlag = { enabled: false };

  // Latest per-question state. Written by prepare() before a SideAsk message
  // is sent; read by the SideAsk context builder and the grounding merger.
  let latest = {
    query: "",
    results: [],
    grounding: null,
    fallback: false,
    error: "",
  };

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function lineKey(result, index) {
    const missionId = normalizeText(result.missionId || result.id);
    const base = missionId ? `endfield:${missionId}` : `endfield:line`;
    return `${base}:${index + 1}`;
  }

  /**
   * Map one /api/endfield/search result to a ClioTalk grounding source.
   * @param {any} result
   * @param {number} index zero-based
   */
  function resultToSource(result, index) {
    const route = [
      result.missionTitle || result.title,
      result.section,
      result.chapter,
      result.process,
    ].filter(Boolean).join(" / ");
    const speaker = normalizeText(result.speaker);
    const title = route || normalizeText(result.missionId || result.id) || "Endfield";
    const label = speaker ? `${title} / ${speaker}` : title;
    return {
      kind: "endfield",
      label,
      key: lineKey(result, index),
      index: index + 1,
      citation: `[S${index + 1}]`,
      text: normalizeText(result.text),
      url: normalizeText(result.missionUrl || result.url),
      missionId: normalizeText(result.missionId || result.id),
      speaker,
      context: Array.isArray(result.context) ? result.context.slice(0, 2) : [],
    };
  }

  /**
   * @param {Array<any>} results
   * @returns {{ sources: Array<any>, sourceCount: number }}
   */
  function buildFromResults(results) {
    const list = Array.isArray(results) ? results.slice(0, DEFAULT_LIMIT) : [];
    const sources = list.map(resultToSource);
    return {
      sources,
      sourceCount: sources.length,
    };
  }

  /**
   * @param {string} query
   * @param {Array<any>} results
   * @param {{ lang?: string }} [options]
   */
  function toSideAskContext(query, results, options = {}) {
    const zh = options.lang !== "en";
    const grounded = buildFromResults(results);
    const heading = zh
      ? "以下编号证据来自终末地剧情终端语料检索（剧情+世界观共享库）。回答只能依据证据，用 [S1]…[Sn] 引用，不要把证据外内容说成事实；查不到就建议换用游戏内正式名称。"
      : "Numbered evidence below comes from the Endfield story-terminal corpus (story + worldview share one library). Answer only from it, cite claims as [S1]…[Sn], and never present out-of-evidence content as fact. If nothing matches, suggest an in-game name instead.";
    const body = grounded.sources.map((source) => {
      const route = source.label;
      const text = source.text || "";
      const contextLines = (source.context || [])
        .map((ctx) => `${ctx.speaker || "Unknown"}：${ctx.text || ""}`)
        .join("\n");
      return `${source.citation} ${route}\n${text}${contextLines ? `\n${contextLines}` : ""}`;
    }).join("\n\n");
    if (!body) {
      return [
        heading,
        zh
          ? "当前检索没有命中原文证据。请让用户换用游戏内正式名称或更短关键词。"
          : "The search returned no matching source text. Ask the user to try an in-game name or a shorter keyword.",
      ].join("\n\n");
    }
    return `${heading}\n\n${query ? `用户问题：${query}\n\n` : ""}${body}`;
  }

  /**
   * Run the shared search endpoint and shape the result for SideAsk.
   * @param {string} query
   * @param {{ signal?: AbortSignal, limit?: number }} [options]
   */
  async function searchForSideAsk(query, options = {}) {
    const normalized = normalizeText(query);
    const requestService = window.AISystem6Capabilities?.requestService;
    if (!requestService) {
      return { ok: false, error: "shared-request-service-unavailable", results: [] };
    }
    try {
      const response = await requestService("endfield.search", {
        query: normalized,
        limit: Math.min(Math.max(Number(options.limit || DEFAULT_LIMIT), 1), 28),
        signal: options.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, error: payload.detail || payload.error || `HTTP ${response.status}`, results: [] };
      }
      return { ok: true, results: Array.isArray(payload.results) ? payload.results : [] };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return { ok: false, error: String(error?.message || error || "search-failed"), results: [] };
    }
  }

  /**
   * Called right before a SideAsk message is sent while the terminal is the
   * anchor: retrieve fresh evidence for the CURRENT question and remember it.
   * On failure it falls back to the terminal's last cached answer.
   * @param {string} query
   * @param {{ signal?: AbortSignal }} [options]
   */
  async function prepare(query, options = {}) {
    const normalized = normalizeText(query);
    if (!normalized) return latest;
    const result = await searchForSideAsk(normalized, options);
    if (result.ok) {
      latest = {
        query: normalized,
        results: result.results,
        grounding: buildFromResults(result.results),
        fallback: false,
        error: "",
      };
      return latest;
    }
    // Fallback: reuse the terminal's most recent single-shot answer.
    const cached = window.AISystem6EndfieldSideAsk;
    if (cached && Array.isArray(cached.results)) {
      latest = {
        query: normalized,
        results: cached.results,
        grounding: buildFromResults(cached.results),
        fallback: true,
        error: result.error || "",
      };
    } else {
      latest = {
        query: normalized,
        results: [],
        grounding: { sources: [], sourceCount: 0 },
        fallback: false,
        error: result.error || "",
      };
    }
    return latest;
  }

  function snapshot() {
    return latest;
  }

  function isSourceEnabled() {
    return sourceFlag.enabled === true;
  }

  function setSourceEnabled(value) {
    sourceFlag.enabled = value === true;
    return sourceFlag.enabled;
  }

  return Object.freeze({
    searchForSideAsk,
    buildFromResults,
    toSideAskContext,
    prepare,
    snapshot,
    isSourceEnabled,
    setSourceEnabled,
  });
})();
// Session-level memory flag: ClioTalk's optional Endfield retrieval source.
// Default off, never persisted; SideAsk pairing is independent of this flag.
window.AISystem6EndfieldSource = Object.freeze({
  get enabled() {
    return window.AISystem6EndfieldGrounding?.isSourceEnabled?.() === true;
  },
  set enabled(value) {
    window.AISystem6EndfieldGrounding?.setSourceEnabled?.(value === true);
  },
});
window.AISystem6EndfieldGroundingLoaded = true;
