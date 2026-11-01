// ClioWorks unified spec (P4): the reading DTOs mapped onto the records this
// desk already has — reader pages resolve as snapshots, selections anchor as
// PassageRefs, and "stay here" rides the scrap record itself. No parallel
// store: a ref or thread extension is a field on the object the desk already
// saves. Lazy: nothing on the boot path pays for this until a reading route
// actually anchors a passage.
(function (root) {
  'use strict';
  if (root.AISystem6ReadingBridge) return;

  const contracts = () => root.ClioWorksUnifiedContracts;

  /** The reader page as a resolvable snapshot (the vendored resolvePassage
   * shape). The revision is whatever the page itself swears by — its hash —
   * so a re-fetch that changes content invalidates old anchors honestly. */
  function snapshotFromReaderPage(page) {
    const body = String(page?.body || page?.text || "");
    const revision = String(page?.revision || page?.hash
      || (root.clioRunHash ? root.clioRunHash(body) : `len-${body.length}`));
    return {
      id: String(page?.id || page?.url || page?.title || "reader"),
      revision,
      text: body,
      title: String(page?.title || ""),
      origin: page?.url
        ? { type: "url", locator: String(page.url) }
        : { type: "file", locator: String(page?.file || page?.fileName || page?.title || "") },
    };
  }

  /** A PassageRef for the current selection — quote plus surrounding text
   * captured BEFORE any tool click, so blur can never lose the passage.
   * The affixes are what let the vendored resolver disambiguate a repeated
   * sentence instead of guessing. */
  function passageRefFromSelection(snapshot, selectionText, { affixLength = 48, at: atHint = null } = {}) {
    const quote = String(selectionText || "").trim();
    if (!quote || !snapshot?.text) return null;
    // A repeated sentence appears at several offsets; the caller may pin the
    // one it means (the selection's own range start). Without a hint the
    // first occurrence anchors — the affixes still travel, so the resolver
    // can flag what a bare quote never could.
    const at = Number.isInteger(atHint) && atHint >= 0
      ? atHint
      : snapshot.text.indexOf(quote);
    if (at < 0) return null;
    const anchor = Math.max(0, at);
    return {
      id: `passage-${root.clioRunHash ? root.clioRunHash(`${snapshot.id}\n${anchor}:${quote}`) : `${snapshot.id}:${anchor}:${quote.length}`}`,
      sourceId: snapshot.id,
      revision: snapshot.revision,
      selectors: [{
        kind: "text",
        blockId: String(anchor),
        quote,
        prefix: snapshot.text.slice(Math.max(0, anchor - affixLength), anchor),
        suffix: snapshot.text.slice(anchor + quote.length, anchor + quote.length + affixLength),
        offset: anchor,
        textProjectionVersion: 1,
      }],
      evidenceKind: "text",
      extractionMethod: "selection",
      match: "exact",
    };
  }

  /** Resolve a stored ref against the page it claims — the vendored verdict:
   * found (with the offset), ambiguous, lost, stale, or wrong-source. The
   * desk repeats what the contract says rather than inventing a nicer one. */
  function resolveRef(ref, snapshot) {
    const resolvePassage = contracts()?.resolvePassage;
    if (!resolvePassage) return { status: "unknown", candidates: [] };
    const selector = ref?.selectors?.[0] || {};
    return resolvePassage(snapshot, {
      sourceId: String(ref?.sourceId || ""),
      revision: String(ref?.revision || ""),
      quote: String(selector.quote || ""),
      prefix: selector.prefix || "",
      suffix: selector.suffix || "",
    });
  }

  /** S01 留在这里: the stable object IS the scrap — the reading extension is
   * fields on the record the desk already saves (Reader annotation drawer,
   * Scrapbook and Finder stay views of one object). Partial extensions never
   * masquerade as an adopted answer: adopted ids travel only when given. */
  function attachToScrap(scrap, extension = {}) {
    if (!scrap || typeof scrap !== "object") return scrap;
    const reading = {
      originalPassageRefs: Array.isArray(extension.originalPassageRefs)
        ? extension.originalPassageRefs.map((ref) => ({ ...ref }))
        : [],
      userNote: String(extension.userNote || ""),
      adoptedInterpretationIds: Array.isArray(extension.adoptedInterpretationIds)
        ? extension.adoptedInterpretationIds.map(String)
        : [],
    };
    if (extension.readingThreadId) reading.readingThreadId = String(extension.readingThreadId);
    if (Array.isArray(extension.relations)) reading.relations = extension.relations.map((relation) => ({ ...relation }));
    if (extension.adoptedAt) reading.adoptedAt = String(extension.adoptedAt);
    return { ...scrap, readingScrap: reading };
  }

  function readingExtensionOf(scrap) {
    return scrap?.readingScrap || null;
  }

  /** Thread citations must live inside the passages this run was allowed to
   * read (the vendored validateCitations; no invented certainty). */
  function citationsValid(evidenceIds, allowedRefs) {
    const validate = contracts()?.validateCitations;
    if (!validate) return { ok: false, reason: "contracts-unavailable" };
    return validate(evidenceIds, allowedRefs);
  }

  root.AISystem6ReadingBridge = Object.freeze({
    snapshotFromReaderPage,
    passageRefFromSelection,
    resolveRef,
    attachToScrap,
    readingExtensionOf,
    citationsValid,
  });
})(typeof window !== "undefined" ? window : globalThis);
