// 潮汐信笺 → ClioTalk/SideAsk grounding adapter.
//
// The same shape as the Endfield adapter (app/core/endfield-grounding.js):
// while 潮汐信笺 is the SideAsk anchor, every question first searches the
// aaronlau.me corpus and the results become ClioTalk's existing grounding
// sources ([S1]…[Sn]). The corpus is the blog's own chunk index (ai6/rag.json,
// written by the blog generator), ranked by app/shared/blog-rag-runtime.js:
//   1. on the desk server  (/api/aaron-blog/retrieve, verified + cached pack);
//   2. offline, in the browser, over the pack the reader keeps in IndexedDB;
//   3. failing both, the last evidence this adapter retrieved (fallback).
//
// Nothing here calls a model, and nothing private enters the query: only the
// question text and the public post id the reader is showing.

window.AISystem6AaronBlogGrounding = (() => {
  const DEFAULT_LIMIT = 8;

  let scope = { type: "blog", id: "", title: "", date: "" };
  let latest = {
    query: "",
    results: [],
    grounding: null,
    fallback: false,
    offline: false,
    yearRelaxed: false,
    order: "relevance",
    error: "",
    scope,
  };
  let localIndex = null;

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function kindNote(result, zh) {
    if (result.prediction) {
      const state = result.prediction.label || result.prediction.status || "";
      return zh ? `预言账本·${state}` : `prediction · ${result.prediction.status || state}`;
    }
    if (result.long || result.kind === "long") {
      if (result.appScope) return zh ? "长文·原载 App-scope" : "long read · first published on App-scope";
      return zh ? "长文" : "long read";
    }
    if (result.kind === "note") return zh ? "笔记" : "note";
    if (result.appScope) return zh ? "App-scope 旧文" : "App-scope archive";
    return "";
  }

  /**
   * Map one retrieval result to a ClioTalk grounding source.
   * @param {any} result
   * @param {number} index zero-based
   */
  function resultToSource(result, index) {
    const id = normalizeText(result.id);
    const para = Number.isInteger(result.para) ? result.para : -1;
    const title = normalizeText(result.title) || id || "aaronlau.me";
    const date = normalizeText(result.date);
    const label = [date, title, normalizeText(result.heading)].filter(Boolean).join(" · ");
    const text = normalizeText(result.text);
    return {
      kind: "aaronBlog",
      label,
      key: `aaronBlog:${id}:${para}:${index + 1}`,
      index: index + 1,
      citation: `[S${index + 1}]`,
      text,
      url: normalizeText(result.url),
      postId: id,
      para,
      quote: text.slice(0, 32),
      date,
      docKind: normalizeText(result.kind) || "post",
      prediction: result.prediction || null,
      speaker: "",
      context: [],
    };
  }

  /**
   * @param {Array<any>} results
   * @returns {{ sources: Array<any>, sourceCount: number }}
   */
  function buildFromResults(results) {
    const list = Array.isArray(results) ? results.slice(0, 24) : [];
    const sources = list.map(resultToSource);
    return { sources, sourceCount: sources.length };
  }

  /**
   * @param {string} query
   * @param {Array<any>} results
   * @param {{ lang?: string, scope?: any, yearRelaxed?: boolean, order?: string, offline?: boolean }} [options]
   */
  function toSideAskContext(query, results, options = {}) {
    const zh = options.lang !== "en";
    const activeScope = options.scope || scope;
    const grounded = buildFromResults(results);
    const heading = zh
      ? "以下编号证据检索自 aaronlau.me（Aaron Lau／韩栖的博客：日更推送、长文、预言账本）。只依据这些证据回答，用 [S1]…[Sn] 标出处；每个论断带上原文日期。证据跨越多个年份时，按时间先后讲清他的看法怎么变。不要把证据外的内容说成他写过的。"
      : "The numbered evidence below was retrieved from aaronlau.me (Aaron Lau's blog: daily posts, long reads, the prediction ledger). Answer only from it, cite claims as [S1]…[Sn], and give each claim its original date. When the evidence spans several years, tell how his view changed in date order. Never present anything outside the evidence as something he wrote.";
    const notes = [];
    if (activeScope?.type === "post" && activeScope.title) {
      notes.push(zh
        ? `用户正在读《${activeScope.title}》（${activeScope.date || ""}），这篇的段落排在前面。`
        : `The user is reading “${activeScope.title}” (${activeScope.date || ""}); its paragraphs come first.`);
    }
    if (options.yearRelaxed) {
      notes.push(zh
        ? "注意：问到的年份里没有检索到相关原文，以下证据来自其他年份；回答时先说明那一年博客里没写到。"
        : "Note: nothing matched in the year asked about; the evidence below comes from other years. Say first that the blog has nothing on it for that year.");
    }
    if (options.order === "chronological" && grounded.sources.length > 1) {
      notes.push(zh ? "证据已按日期从早到晚排列。" : "The evidence is in date order, earliest first.");
    }
    if (options.offline) {
      notes.push(zh ? "（本次检索用的是已同步的离线内容包。）" : "(This search used the offline pack synced earlier.)");
    }
    const body = grounded.sources.map((source, index) => {
      const result = results[index] || {};
      const note = kindNote(result, zh);
      const head = `${source.citation} ${source.date} 《${normalizeText(result.title)}》${note ? `（${note}）` : ""}${result.heading ? ` / ${result.heading}` : ""}`;
      return `${head}\n${source.text}`;
    }).join("\n\n");
    if (!body) {
      return [
        heading,
        zh
          ? `这次检索在博客语料里没有找到相关原文${query ? `（问题：${query}）` : ""}。直接告诉用户：博客里没有写过这个话题（至少按这个说法检索不到），不要凭常识替作者作答；可以建议换个关键词或年份。`
          : `The search found nothing about this in the blog corpus${query ? ` (question: ${query})` : ""}. Tell the user plainly that the blog has not written about it (at least not in these words); do not answer for the author from general knowledge. Suggest another keyword or year.`,
      ].join("\n\n");
    }
    return [heading, ...notes, query ? (zh ? `用户问题：${query}` : `Question: ${query}`) : "", body].filter(Boolean).join("\n\n");
  }

  function requestOptions(options = {}) {
    return {
      limit: Math.min(Math.max(Number(options.limit || DEFAULT_LIMIT), 1), 24),
      docId: options.docId !== undefined ? options.docId : (scope.type === "post" ? scope.id : ""),
    };
  }

  /**
   * Ask the desk server's retrieval route (the same fixed, session-free
   * /api/aaron-blog door the reader syncs through, reached through the
   * service boundary) and shape the result.
   * @param {string} query
   * @param {{ signal?: AbortSignal, limit?: number, docId?: string }} [options]
   */
  async function searchForSideAsk(query, options = {}) {
    const normalized = normalizeText(query);
    const { limit, docId } = requestOptions(options);
    const requestService = window.AISystem6Capabilities?.requestService;
    if (!requestService) {
      return { ok: false, error: "shared-request-service-unavailable", results: [] };
    }
    try {
      const response = await requestService("aaron-blog.search", {
        query: normalized,
        limit: String(limit),
        ...(docId ? { doc: docId } : {}),
        signal: options.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, error: payload.detail || payload.error || `HTTP ${response.status}`, results: [] };
      }
      return {
        ok: true,
        results: Array.isArray(payload.results) ? payload.results : [],
        yearRelaxed: payload.yearRelaxed === true,
        order: payload.order || "relevance",
        offline: payload.pack?.offline === true,
      };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return { ok: false, error: String(error?.message || error || "search-failed"), results: [] };
    }
  }

  /**
   * Offline path: rank the pack 潮汐信笺 keeps in IndexedDB with the same
   * runtime the server uses.
   * @param {string} query
   * @param {{ limit?: number, docId?: string }} [options]
   */
  async function searchLocally(query, options = {}) {
    const runtime = window.AISystem6BlogRagRuntime;
    const reader = window.AISystem6AaronBlog;
    if (!runtime || typeof reader?.ragPack !== "function") return { ok: false, error: "offline-pack-unavailable", results: [] };
    try {
      const pack = await reader.ragPack();
      if (!pack || !runtime.validatePack(pack)) return { ok: false, error: "offline-pack-unavailable", results: [] };
      const stamp = `${pack.generatedAt || ""}:${pack.chunks.length}`;
      if (!localIndex || localIndex.stamp !== stamp) localIndex = { stamp, index: runtime.buildIndex(pack) };
      const found = runtime.search(localIndex.index, normalizeText(query), requestOptions(options));
      return { ok: true, results: found.results, yearRelaxed: found.yearRelaxed, order: found.order, offline: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error || "offline-search-failed"), results: [] };
    }
  }

  /**
   * Called right before a SideAsk message is sent while 潮汐信笺 is the
   * anchor: retrieve fresh evidence for the CURRENT question.
   * @param {string} query
   * @param {{ signal?: AbortSignal }} [options]
   */
  async function prepare(query, options = {}) {
    const normalized = normalizeText(query);
    if (!normalized) return latest;
    let result = await searchForSideAsk(normalized, options);
    if (!result.ok) {
      const local = await searchLocally(normalized, options);
      if (local.ok) result = local;
      else result = { ...result, error: [result.error, local.error].filter(Boolean).join("; ") };
    }
    if (result.ok) {
      latest = {
        query: normalized,
        results: result.results,
        grounding: buildFromResults(result.results),
        fallback: false,
        offline: result.offline === true,
        yearRelaxed: result.yearRelaxed === true,
        order: result.order || "relevance",
        error: "",
        scope: { ...scope },
      };
      return latest;
    }
    const previous = latest.results;
    latest = {
      query: normalized,
      results: previous,
      grounding: buildFromResults(previous),
      fallback: previous.length > 0,
      offline: false,
      yearRelaxed: false,
      order: latest.order,
      error: result.error || "",
      scope: { ...scope },
    };
    return latest;
  }

  /**
   * Set what the next questions are about: the whole blog, or one post.
   * @param {{ type?: string, id?: string, title?: string, date?: string }} [next]
   */
  function setScope(next = {}) {
    scope = next.type === "post" && next.id
      ? { type: "post", id: String(next.id), title: String(next.title || ""), date: String(next.date || "") }
      : { type: "blog", id: "", title: "", date: "" };
    return { ...scope };
  }

  /**
   * The whole SideAsk anchor context for the evidence of the last question.
   * @param {string} [language]
   */
  function anchorContext(language = "zh") {
    const zh = language === "zh";
    const body = toSideAskContext(latest.query, latest.results, {
      lang: zh ? "zh" : "en",
      scope: latest.scope,
      yearRelaxed: latest.yearRelaxed,
      order: latest.order,
      offline: latest.offline,
    });
    if (!latest.fallback) return body;
    return `${body}\n\n${zh
      ? "（本次检索没有成功，以上是上一个问题检索到的证据；不足以回答时请直说。）"
      : "(This search failed; the evidence above is from the previous question. Say so if it does not answer this one.)"}`;
  }

  /**
   * A chip or [Sn] was clicked: open the post in 潮汐信笺 (opening the window
   * when it is not on the desk) and mark the cited paragraph; fall back to the
   * aaronlau.me page.
   * @param {any} source
   */
  async function reveal(source = {}) {
    const openSite = () => { if (source.url) window.open(source.url, "_blank", "noopener,noreferrer"); return false; };
    try {
      if (!window.AISystem6AaronBlog && typeof ensureAaronBlogModule === "function") await ensureAaronBlogModule();
      const shown = await window.AISystem6AaronBlog?.reveal?.({ postId: source.postId, para: source.para, quote: source.quote });
      return shown ? true : openSite();
    } catch {
      return openSite();
    }
  }

  function getScope() {
    return { ...scope };
  }

  function snapshot() {
    return latest;
  }

  return Object.freeze({
    searchForSideAsk,
    searchLocally,
    buildFromResults,
    toSideAskContext,
    anchorContext,
    reveal,
    prepare,
    snapshot,
    setScope,
    getScope,
  });
})();
// SideAsk's anchor registry (anchorHook in chat-messages.js): while
// 潮汐信笺 is the anchor, each question is prepared here first, and a chip of
// kind "aaronBlog" reveals its paragraph here.
window.AISystem6SideAskAnchors = Object.assign(window.AISystem6SideAskAnchors || {}, {
  aaronBlog: Object.freeze({
    prepare: (query, signal) => window.AISystem6AaronBlogGrounding.prepare(query, { signal }).catch(() => null),
    grounding: () => window.AISystem6AaronBlogGrounding.snapshot().grounding,
    context: (language) => window.AISystem6AaronBlogGrounding.anchorContext(language),
    label: () => window.AISystem6AaronBlog?.sideAskLabel?.() || "潮汐信笺",
    reveal: (source) => window.AISystem6AaronBlogGrounding.reveal(source),
  }),
});
window.AISystem6AaronBlogGroundingLoaded = true;
