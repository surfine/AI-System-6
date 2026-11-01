// Pure product-help routing and ranking. No DOM, storage, network, or model
// dependency: callers supply the current System Help entries and decide how
// the selected topics enter a ClioTalk run.

(function exposeProductHelpRuntime(root, factory) {
  let retrievalRuntime = root?.AISystem6RetrievalRuntime || null;
  if (!retrievalRuntime && typeof module === "object" && module.exports && typeof require === "function") {
    retrievalRuntime = require("../shared/retrieval-runtime.js");
  }
  const api = factory(retrievalRuntime);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6ProductHelpRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis.window || null : null, (retrievalRuntime) => {
  const defaultMaxTopics = 5;
  const defaultMinTopics = 2;

  const ambiguousAliases = new Set([
    "ai", "app", "application", "cloud", "file", "help", "install", "mac",
    "memory", "model", "outline", "pages", "project", "reader", "search",
    "status", "system", "trash", "web",
    "云端", "大纲", "安装", "帮助", "模型", "搜索", "文件", "状态", "系统", "项目",
  ]);

  const helpCuePattern = /(?:\b(?:can|can't|cannot|could|difference|error|failed|help|how|install|open|quota|read[ -]?only|remaining|restore|save|should|switch|tour|unavailable|what|where|which|why)\b|不能|为什么|为何|区别|不同|只读|多少|剩余|在哪里|在哪|怎么|如何|怎么办|是什么|干嘛|哪一个|哪个|错误|失败|不可用|切换|打开|保存|删除|恢复|安装|介绍|导览|带我看看)/iu;
  const selfCuePattern = /(?:\b(?:ai system 6|clio(?:talk)?|current (?:app|desktop|project|system)|this (?:app|desktop|project|system))\b|这个(?:应用|软件|系统|项目)|当前(?:应用|模型|项目|系统|窗口)|现在(?:使用|用)|这里)/iu;
  const productMarkerPattern = /(?:\b(?:ai system 6|cliotalk|cliochart|cliostage|context panel|docmap|file floppy|lm studio|project hard disk|question sheet|review desk|scrapbook|system help|teachtext)\b|AI System 6|ClioTalk|ClioChart|ClioStage|DocMap|File Floppy|LM Studio|Project Hard Disk|Question Sheet|Review Desk|Scrapbook|System Help|TeachText|文件软盘|问题单|审校台|项目硬盘|系统帮助|共享 AI|网站 AI)/iu;
  const productStatePattern = /(?:\b(?:deployment target|read[ -]?only|shared (?:ai|allowance|quota)|website ai)\b|只读|共享(?: AI)?额度|网站 AI|部署(?:目标|版本)|Pages 版|VPS 版|Mac 版)/iu;
  const explicitWebPattern = /(?:\b(?:browse the web|look online|search (?:online|the web)|use (?:internet|web) search)\b|上网查|联网查|网上查|搜索网页|查网页|使用联网搜索)/iu;

  function normalizeSearchText(value) {
    if (typeof retrievalRuntime?.normalizeSearchText === "function") {
      return retrievalRuntime.normalizeSearchText(value);
    }
    return String(value || "").normalize("NFKC").toLowerCase();
  }

  function getQueryWords(value) {
    if (typeof retrievalRuntime?.getQueryWords === "function") {
      return retrievalRuntime.getQueryWords(value);
    }
    return new Set(normalizeSearchText(value).match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) || []);
  }

  function keywordScore(value, queryWords) {
    if (typeof retrievalRuntime?.keywordScore === "function") {
      return retrievalRuntime.keywordScore(value, queryWords);
    }
    const text = normalizeSearchText(value);
    let score = 0;
    queryWords.forEach((word) => {
      if (text.includes(word)) score += word.length >= 4 ? 2 : 1;
    });
    return score;
  }

  function entryId(entry = {}) {
    return String(entry.id || entry.term || "").trim();
  }

  function entryAliases(entry = {}) {
    return [entry.term, entry.termZh, ...(entry.aliases || [])]
      .map(normalizeSearchText)
      .filter(Boolean);
  }

  function entrySearchText(entry = {}) {
    return [
      entry.id,
      entry.term,
      entry.termZh,
      ...(entry.aliases || []),
      ...(entry.keywords || []),
      entry.category,
      entry.definition,
      entry.definitionZh,
      entry.example,
      entry.exampleZh,
    ].filter(Boolean).join("\n");
  }

  function exactAliasMatch(query, entry = {}) {
    const normalized = normalizeSearchText(query).trim();
    if (!normalized) return "";
    return entryAliases(entry).find((alias) => normalized === alias) || "";
  }

  function includedAliasMatches(query, entry = {}) {
    const normalized = normalizeSearchText(query);
    return entryAliases(entry).filter((alias) => alias.length > 1 && normalized.includes(alias));
  }

  function aliasIsDistinctive(alias) {
    const normalized = normalizeSearchText(alias).trim();
    if (!normalized || ambiguousAliases.has(normalized)) return false;
    if (/\s/u.test(normalized)) return normalized.length >= 5;
    if (/[^\x00-\x7f]/u.test(normalized)) return Array.from(normalized).length >= 2;
    return normalized.length >= 5;
  }

  function scoreEntry(query, entry, index = 0) {
    const normalizedQuery = normalizeSearchText(query).trim();
    const queryWords = getQueryWords(normalizedQuery);
    const exactAlias = exactAliasMatch(normalizedQuery, entry);
    const includedAliases = includedAliasMatches(normalizedQuery, entry);
    const distinctiveAliases = includedAliases.filter(aliasIsDistinctive);
    let score = keywordScore(entrySearchText(entry), queryWords);
    if (exactAlias) score += 120;
    distinctiveAliases.forEach((alias) => {
      score += 32 + Math.min(18, Array.from(alias).length);
    });
    includedAliases.filter((alias) => !distinctiveAliases.includes(alias)).forEach(() => {
      score += 8;
    });
    if (normalizeSearchText(entry.id).includes(normalizedQuery) && normalizedQuery.length > 2) score += 18;
    return {
      id: entryId(entry),
      entry,
      score,
      index,
      exactAlias: exactAlias || "",
      distinctiveAlias: distinctiveAliases[0] || "",
    };
  }

  function scoreProductHelpTopics(query, entries = []) {
    return (Array.isArray(entries) ? entries : [])
      .map((entry, index) => scoreEntry(query, entry, index))
      .filter((result) => result.id && result.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
  }

  function productHelpIntent(query, scored = []) {
    const text = String(query || "").trim();
    const top = scored[0];
    if (!text || !top) return { matched: false, reason: "no-match" };
    if (top.exactAlias) return { matched: true, reason: "exact-topic" };
    if (productStatePattern.test(text) && helpCuePattern.test(text)) {
      return { matched: true, reason: "product-state-question" };
    }
    if (top.distinctiveAlias && helpCuePattern.test(text)) {
      return { matched: true, reason: "topic-help-question" };
    }
    if (selfCuePattern.test(text) && helpCuePattern.test(text) && top.score >= 4) {
      return { matched: true, reason: "self-help-question" };
    }
    if (productMarkerPattern.test(text) && helpCuePattern.test(text) && top.score >= 4) {
      return { matched: true, reason: "named-product-question" };
    }
    return { matched: false, reason: "ordinary-chat" };
  }

  function relatedTopicResults(primaryResults, entries, limit, minimum) {
    const byId = new Map(entries.map((entry, index) => [entryId(entry), { entry, index }]));
    const selected = [];
    const seen = new Set();
    const add = (result) => {
      if (!result?.id || seen.has(result.id) || selected.length >= limit) return;
      seen.add(result.id);
      selected.push(result);
    };
    primaryResults.forEach(add);
    for (const result of [...selected]) {
      if (selected.length >= minimum) break;
      for (const relatedId of result.entry.related || []) {
        const related = byId.get(String(relatedId));
        if (!related) continue;
        add({
          id: String(relatedId),
          entry: related.entry,
          score: Math.max(1, result.score * 0.18),
          index: related.index,
          exactAlias: "",
          distinctiveAlias: "",
          relatedTo: result.id,
        });
        if (selected.length >= minimum) break;
      }
    }
    return selected.slice(0, limit);
  }

  function retrieveProductHelp(query, entries = [], options = {}) {
    const limit = Math.max(1, Math.min(5, Number(options.maxTopics) || defaultMaxTopics));
    const minimum = Math.max(1, Math.min(limit, Number(options.minTopics) || defaultMinTopics));
    const scored = scoreProductHelpTopics(query, entries);
    const intent = options.force === true
      ? { matched: scored.length > 0, reason: "forced" }
      : productHelpIntent(query, scored);
    if (!intent.matched) return { matched: false, reason: intent.reason, topics: [] };

    const relativeFloor = Math.max(3, (scored[0]?.score || 0) * 0.15);
    const positive = scored.filter((result) => result.score >= relativeFloor).slice(0, limit);
    const topics = relatedTopicResults(positive.length ? positive : scored.slice(0, 1), entries, limit, minimum);
    return {
      matched: topics.length > 0,
      reason: topics.length ? intent.reason : "no-match",
      topics,
    };
  }

  function explicitlyRequestsWeb(query) {
    return explicitWebPattern.test(String(query || ""));
  }

  function resolveProductHelpRoute(query, entries = [], options = {}) {
    if (options.explicitWeb === true || explicitlyRequestsWeb(query)) {
      return { route: "web", reason: "explicit-web", topics: [] };
    }
    const retrieval = retrieveProductHelp(query, entries, options);
    return retrieval.matched
      ? { route: "product-help", reason: retrieval.reason, topics: retrieval.topics }
      : { route: "chat", reason: retrieval.reason, topics: [] };
  }

  return Object.freeze({
    defaultMaxTopics,
    defaultMinTopics,
    normalizeSearchText,
    entrySearchText,
    scoreProductHelpTopics,
    retrieveProductHelp,
    explicitlyRequestsWeb,
    resolveProductHelpRoute,
  });
});
