// ClioWorks unified spec (R07): comparison and challenge. A comparison
// carries its two (or more) anchored sides, lists the differences first —
// object, date, definition, condition — and only then offers an explanation.
// A contradiction is never adjudicated without evidence: the module marks
// what would settle it instead. "凭什么" and "怎样推翻" produce evidence
// paths or open questions, not verdicts. Lazy.
(function (root) {
  'use strict';
  if (root.AISystem6ReadingCompare) return;

  /** The comparison facets R07 names, listed before any explanation. */
  const FACETS = Object.freeze(["object", "date", "definition", "condition"]);

  const FACET_LABELS = Object.freeze({
    zh: { object: "对象", date: "日期", definition: "定义", condition: "条件" },
    en: { object: "Object", date: "Date", definition: "Definition", condition: "Condition" },
  });

  function facetLabel(facet, language = "zh") {
    const table = FACET_LABELS[language === "en" ? "en" : "zh"] || FACET_LABELS.zh;
    return table[facet] || facet;
  }

  /** One difference row: which facet differs, what each side actually says
   * (quotes from the anchored ends), and whether the two sides genuinely
   * conflict on it. A side with no quote on the facet contributes "unknown",
   * not a guess. */
  function buildDifference({ facet, sides } = {}) {
    if (!FACETS.includes(String(facet || ""))) return null;
    const entries = (Array.isArray(sides) ? sides : [])
      .map((side) => ({
        label: String(side?.label || ""),
        quote: String(side?.quote || "").trim(),
        says: String(side?.says || "").trim(),
      }))
      .filter((side) => side.label);
    if (entries.length < 2) return null;
    const stated = entries.filter((side) => side.says);
    const differs = stated.length >= 2
      && stated.some((side) => side.says !== stated[0].says);
    return {
      facet,
      sides: entries,
      // "unknown" on a facet is honest: the comparison says what is missing.
      differs: stated.length === entries.length ? differs : null,
    };
  }

  /** The comparison record: sides first (each an anchored ref with its own
   * label), then differences, then — only then — an optional explanation
   * that cites which differences it rests on. */
  function buildComparison({ sides, differences, explanation } = {}) {
    const anchored = (Array.isArray(sides) ? sides : [])
      .filter((side) => side?.ref?.selectors?.[0]?.quote && String(side.label || "").trim());
    if (anchored.length < 2) return null;
    const rows = (Array.isArray(differences) ? differences : []).filter(Boolean);
    return {
      sides: anchored.map((side) => ({
        label: String(side.label),
        sourceId: String(side.ref.sourceId || ""),
        revision: String(side.ref.revision || ""),
        quote: String(side.ref.selectors[0].quote),
      })),
      differences: rows,
      // An explanation must name the rows it rests on; an unexplained
      // conclusion is not a comparison result.
      explanation: String(explanation || "").trim(),
      explanationRestsOn: rows.filter((row) => row.differs === true).map((row) => row.facet),
    };
  }

  /** 没有依据不裁定矛盾: a pair of differing sides is only a CONFLICT when
   * the caller supplies evidence that both sides describe the same object
   * under the same conditions. Otherwise the module returns what would
   * settle it — an open question, not a verdict. */
  function adjudicate(difference, { sameObjectEvidence = null } = {}) {
    if (!difference || difference.differs !== true) {
      return { verdict: "no-difference", needs: [] };
    }
    if (!sameObjectEvidence) {
      return {
        verdict: "unsettled",
        needs: ["same-object-evidence"],
        openQuestion: `双方在「${facetLabel(difference.facet)}」上说法不同——它们说的是同一个对象、同一组条件吗？`,
      };
    }
    return { verdict: "conflict", needs: [] };
  }

  /** "凭什么" — the evidence path for an accepted claim: the anchored quote
   * plus what would check it. "怎样推翻" — what would count against it.
   * Both are questions to run, not verdicts. */
  function challengePaths({ claim, supportingRef } = {}) {
    const quote = String(supportingRef?.selectors?.[0]?.quote || "").trim();
    const asserted = String(claim || "").trim();
    if (!asserted || !quote) return null;
    return {
      claim: asserted,
      support: { sourceId: String(supportingRef.sourceId || ""), quote },
      // 凭什么: what would confirm it beyond this one quote.
      confirmPath: `在来源 ${String(supportingRef.sourceId || "")} 之外，还有哪里独立地说了这件事？`,
      // 怎样推翻: what observation would count against it.
      refutePath: `如果找到与「${asserted.slice(0, 60)}」相悖的同期记录，这条主张要怎么改？`,
      appendedToThread: true,
    };
  }

  root.AISystem6ReadingCompare = Object.freeze({
    FACETS,
    facetLabel,
    buildDifference,
    buildComparison,
    adjudicate,
    challengePaths,
  });
})(typeof window !== "undefined" ? window : globalThis);
