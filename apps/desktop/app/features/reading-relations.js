// ClioWorks unified spec (S04): relations between materials, as candidates.
// A relation candidate carries both ends as real PassageRefs (the reading
// bridge's anchors, not free text), a named type, and a reason — and it stays
// a proposal until the user accepts it. DocMap reuses these edges; there is
// no second graph truth. Cross-project material is only what the caller
// explicitly allows in. Lazy: nothing pays for this until a relation exists.
(function (root) {
  'use strict';
  if (root.AISystem6ReadingRelations) return;

  /** The five types S04 names. "共同来源" is one type — articles citing the
   * same report stay ONE lineage, never counted as independent support. */
  const TYPES = ["explains", "qualifies", "contrasts", "same-upstream-source", "analogy"];

  const LABELS = {
    zh: {
      explains: "解释", qualifies: "补充条件", contrasts: "相反证据",
      "same-upstream-source": "共同来源", analogy: "类比",
    },
    en: {
      explains: "Explains", qualifies: "Qualifies", contrasts: "Contrasts",
      "same-upstream-source": "Same upstream source", analogy: "Analogy",
    },
  };

  function isKnownType(type) {
    return TYPES.includes(String(type || ""));
  }

  function typeLabel(type, language = "zh") {
    const table = LABELS[language === "en" ? "en" : "zh"] || LABELS.zh;
    return table[type] || type;
  }

  /** Build a relation candidate. Both ends must be bridge-shaped refs with a
   * quote; the reason is required — a bare "these differ" is not evidence of
   * anything. A relation between the ends of one passage is refused. */
  function buildRelation({ from, to, type, reason } = {}) {
    const fromQuote = String(from?.selectors?.[0]?.quote || "").trim();
    const toQuote = String(to?.selectors?.[0]?.quote || "").trim();
    const why = String(reason || "").trim();
    if (!fromQuote || !toQuote || !why) return null;
    if (!isKnownType(type)) return null;
    if (String(from?.sourceId || "") === String(to?.sourceId || "")
      && String(from?.selectors?.[0]?.quote || "") === String(to?.selectors?.[0]?.quote || "")) {
      return null;
    }
    return {
      id: `relation-${root.clioRunHash ? root.clioRunHash(`${fromQuote}\u0000${toQuote}\u0000${type}`) : `rel-${Date.now()}`}`,
      from: structuredClone(from),
      to: structuredClone(to),
      type,
      reason: why,
      status: "proposed",
      acceptedByUserAt: null,
    };
  }

  /** The user's acceptance is the only door to "accepted"; withdrawal keeps
   * the candidate. Everything else stays a proposal. */
  function acceptRelation(candidate) {
    if (!candidate || candidate.status === "withdrawn") return candidate || null;
    return { ...candidate, status: "accepted", acceptedByUserAt: new Date().toISOString() };
  }

  function withdrawRelation(candidate) {
    if (!candidate) return candidate || null;
    return { ...candidate, status: "withdrawn", acceptedByUserAt: null };
  }

  /** DocMap reuse: accepted relations become the map's edge list — the same
   * shapes formatDocMapMarkdown's ## Relations section already writes and
   * parseExportedDocMapMarkdown already reads (`- from -> to: label`). Both
   * ends' node ids come from the caller's node table; a relation whose end
   * has no node on this map contributes nothing (DocMap shows its own nodes,
   * not a foreign graph). */
  function edgesForDocMap(relation, nodeIdByQuote) {
    if (!relation || relation.status !== "accepted") return [];
    const lookup = (ref) => {
      const quote = String(ref?.selectors?.[0]?.quote || "");
      if (!quote) return null;
      // The most specific matching key wins — a quote mentioning both the
      // budget and the schedule must not silently collapse into whichever
      // key Object.entries happened to list first.
      let best = null;
      for (const [key, nodeId] of Object.entries(nodeIdByQuote || {})) {
        if (!key || (!quote.includes(key) && !key.includes(quote))) continue;
        if (!best || key.length > best.key.length) best = { key, nodeId };
      }
      return best?.nodeId || null;
    };
    const from = lookup(relation.from);
    const to = lookup(relation.to);
    if (!from || !to || from === to) return [];
    return [{
      id: `edge-${relation.id}`,
      from,
      to,
      label: typeLabel(relation.type).slice(0, 48),
      type: relation.type,
    }];
  }

  /** S04's lineage rule: articles that share one upstream source are one
   * support line, not N. Two accepted relations of type same-upstream-source
   * whose reasons name the same origin collapse into one lineage entry. */
  function lineagesOf(acceptedRelations) {
    const byOrigin = new Map();
    (acceptedRelations || []).forEach((relation) => {
      if (relation?.type !== "same-upstream-source") return;
      const origin = String(relation.reason || "").trim().toLowerCase();
      if (!origin) return;
      byOrigin.set(origin, (byOrigin.get(origin) || 0) + 1);
    });
    return [...byOrigin.entries()].map(([origin, count]) => ({ origin, articles: count, independent: 1 }));
  }

  root.AISystem6ReadingRelations = Object.freeze({
    TYPES,
    isKnownType,
    typeLabel,
    buildRelation,
    acceptRelation,
    withdrawRelation,
    edgesForDocMap,
    lineagesOf,
  });
})(typeof window !== "undefined" ? window : globalThis);
