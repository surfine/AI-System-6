// ClioWorks unified spec (S05): versions, maintenance and dead anchors.
// A source's new revision and the reader's old snapshot coexist; older
// annotations say what they were based on and may request a change
// comparison. Only SEMANTIC changes become candidates — an ad slot changing
// never triggers anything. A saved quote that no longer resolves shows the
// original plus a dead-anchor flag; moving it needs the reader's explicit
// confirmation. Checks run when the reader asks, by default — no background
// monitoring of anything. Lazy.
(function (root) {
  'use strict';
  if (root.AISystem6SourceVersions) return;

  const contracts = () => root.ClioWorksUnifiedContracts;

  /** Coexistence: the old snapshot and the new revision are two records, and
   * an annotation remembers which one it was made against. */
  function annotateProvenance(annotation, snapshot) {
    if (!annotation || typeof annotation !== "object") return annotation || null;
    if (!snapshot?.revision) return annotation;
    return {
      ...annotation,
      basedOnRevision: String(snapshot.revision),
      basedOnHash: String(snapshot.contentHash || snapshot.revision || ""),
    };
  }

  /** Whether an annotation is stale against the current page. A revision
   * mismatch IS the staleness verdict — the quote lookup is for same-revision
   * loss, not for telling versions apart. */
  function annotationIsStale(annotation, currentSnapshot, { resolveRef = null } = {}) {
    if (!annotation?.basedOnRevision) return { stale: false };
    if (currentSnapshot?.revision
      && String(currentSnapshot.revision) !== String(annotation.basedOnRevision)) {
      return { stale: true, lost: false, verdict: "stale" };
    }
    const resolve = resolveRef || contracts()?.resolvePassage;
    if (!resolve || !currentSnapshot) return { stale: false };
    const ref = {
      sourceId: String(annotation.sourceId || currentSnapshot.id || ""),
      revision: String(annotation.basedOnRevision),
      quote: String(annotation.quote || ""),
      prefix: String(annotation.prefix || ""),
      suffix: String(annotation.suffix || ""),
    };
    const verdict = resolve(currentSnapshot, ref);
    return {
      stale: verdict.status === "stale",
      lost: verdict.status === "lost",
      verdict: verdict.status,
    };
  }

  /** The comparison a reader can request: what changed between the snapshot
   * the annotation was based on and the current text, at the sentence level.
   * Only semantic changes become candidates — noise (ads, counters, layout
   * tokens) is stripped before the diff, and pure-noise diffs return
   * "no-semantic-change" so nothing notifies. */
  // A fresh regex per strip: a /g regex keeps lastIndex across calls, and
  // a stale lastIndex silently skips matches on the next text.
  const noisePattern = "(?:\\bads?\\b|advertisement|sponsor(?:ed)?|cookie|subscribe|sign\\s*in|log\\s*in|共\\s*\\d+\\s*次阅读|点击查看|查看更多|订阅我们|广告位?[A-Za-z0-9]*|扫码|登录|注册|阅读量)";
  const NOISE = () => new RegExp(noisePattern, "gi");

  // Sentence enders (CJK and Latin) stay attached to the sentence they end.
  // Scanned, not split on a lookbehind: older WebKit (macOS 12) rejects one at
  // parse time and the module would not load.
  function sentencesOf(text) {
    const ENDS = "。！？；.!?;";
    const parts = [];
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (!ENDS.includes(text[index])) continue;
      parts.push(text.slice(start, index + 1));
      start = index + 1;
    }
    if (start < text.length) parts.push(text.slice(start));
    return parts;
  }

  function stripNoise(text) {
    // Sentence-wise: stripping tokens from the whole text re-joins around
    // the holes and shifts every sentence boundary — an ad swap would then
    // look like a semantic change. Per sentence, the borders stay put. A
    // sentence the pattern touched keeps only its stripped remainder, and a
    // sentence that was nothing but template copy drops out entirely: promo
    // text is a network's template, so "订阅我们！" vs "登录查看更多" is a
    // network swap, not a change of meaning.
    return sentencesOf(String(text || ""))
      .filter((sentence) => {
        if (!sentence.trim()) return false;
        // A sentence the template pattern touches AND strips below the
        // content floor is promo copy — it drops out entirely. A touched
        // sentence with real content left keeps only that content.
        const touched = NOISE().test(sentence);
        const stripped = sentence.replace(NOISE(), " ").replace(/\s+/g, " ").trim();
        if (!touched) return true;
        return stripped.replace(/[\p{P}\p{S}\s]/gu, "").length >= 4;
      })
      .map((sentence) => sentence.replace(NOISE(), " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
  }

  function compareRevisions(oldText, newText) {
    const before = stripNoise(oldText);
    const after = stripNoise(newText);
    if (before === after) return { changed: false, reason: "no-semantic-change" };
    const sentenceIds = (text) => sentencesOf(text).map((part) => part.trim()).filter(Boolean);
    const oldSentences = sentenceIds(before);
    const newSentences = sentenceIds(after);
    const removed = oldSentences.filter((sentence) => !newSentences.includes(sentence));
    const added = newSentences.filter((sentence) => !oldSentences.includes(sentence));
    if (!removed.length && !added.length) return { changed: false, reason: "no-semantic-change" };
    return {
      changed: true,
      removed,
      added,
      // The reader decides; a candidate is an offer, not an update.
      candidateForReview: true,
    };
  }

  /** The dead anchor's honest display: the original words are kept verbatim,
   * flagged; a suggested new position is an offer needing confirmation —
   * never a silent re-anchor. */
  function deadAnchor(annotation, suggestion = null) {
    if (!annotation) return null;
    const confirmed = suggestion && typeof suggestion === "object"
      && Number.isInteger(Number(suggestion.at))
      && String(suggestion.confirmedByUser || "") !== "";
    return {
      quote: String(annotation.quote || ""),
      lostAt: new Date().toISOString(),
      // The original stands, flagged — it is never replaced by a guess.
      status: "dead-anchor",
      suggestion: suggestion ? {
        at: Number(suggestion.at),
        // Re-anchoring is the reader's act; until confirmed this is only a
        // candidate location.
        confirmed: confirmed === true,
        needsConfirmation: !confirmed,
      } : null,
    };
  }

  /** The refresh rule: checks run when the reader asks. A check record
   * carries who asked; an automatic check is only legal with an explicit,
   * named opt-in — none exists by default. */
  function checkProvenance({ requestedBy = "reader", automaticOptIn = null } = {}) {
    const automatic = requestedBy !== "reader";
    return {
      requestedBy: automatic ? String(requestedBy) : "reader",
      // Default: no automatic anything. A future automatic mode needs an
      // explicit opt-in with a stated frequency — recorded here, never assumed.
      automaticAllowed: automatic && !!automaticOptIn && typeof automaticOptIn.frequency === "string"
        && automaticOptIn.frequency.length > 0,
      frequency: automatic ? String(automaticOptIn?.frequency || "") : null,
      checkedAt: new Date().toISOString(),
    };
  }

  root.AISystem6SourceVersions = Object.freeze({
    annotateProvenance,
    annotationIsStale,
    stripNoise,
    compareRevisions,
    deadAnchor,
    checkProvenance,
  });
})(typeof window !== "undefined" ? window : globalThis);
