// ClioWorks unified spec (R06): the three reading layers — the original,
// a translation close to the original sentence, and a plain explanation —
// are three fields on one record, never blended. Alignment rides sentence
// ids; copying defaults to the layer the reader explicitly selected; direct
// quotation only ever comes from the original. Depth is an explicit setting,
// not an invisible persona. Lazy: nothing pays for this until a layered
// note exists.
(function (root) {
  'use strict';
  if (root.AISystem6ReadingLayers) return;

  /** The target languages R06 names as already-existing options: Simplified
   * Chinese, Traditional Chinese, English. Anything else the caller's
   * translation channel can actually serve may join, but nothing is invented
   * here. */
  const TARGET_LANGUAGES = Object.freeze(["zh", "zh-Hant", "en"]);

  const LANGUAGE_LABELS = Object.freeze({
    zh: { zh: "简体中文", "zh-Hant": "繁體中文", en: "英文" },
    en: { zh: "Simplified Chinese", "zh-Hant": "Traditional Chinese", en: "English" },
  });

  function isKnownTarget(language) {
    return TARGET_LANGUAGES.includes(String(language || ""));
  }

  function languageLabel(language, ui = "zh") {
    const table = LANGUAGE_LABELS[ui === "en" ? "en" : "zh"] || LANGUAGE_LABELS.zh;
    return table[language] || String(language || "");
  }

  /** Sentence ids are the alignment spine: stable, position-based, computed
   * from the original text both layers were built from. A translation or an
   * explanation aligns by citing these ids — never by claiming a text match. */
  function sentenceIds(originalText) {
    const text = String(originalText || "");
    const ids = [];
    let index = 0;
    // Split on sentence enders (CJK and Latin), keeping the ends attached.
    const parts = text.split(/(?<=[。！？；.!?;])/);
    parts.forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      ids.push({ id: `s-${index + 1}`, text: trimmed, offset: text.indexOf(trimmed) });
      index += 1;
    });
    return ids;
  }

  /** Build the layered record. The original is the only quotable layer —
   * enforced here by the field name the quoting paths must use. */
  function buildLayers({ original, translation, explanation, targetLanguage } = {}) {
    const text = String(original || "").trim();
    if (!text) return null;
    const sentences = sentenceIds(text);
    return {
      original: text,
      originalSentenceIds: sentences.map((sentence) => sentence.id),
      // Close-to-sentence translation: aligned where the channel said so,
      // otherwise whole-passage (aligned to every sentence id it covers).
      translation: String(translation || "").trim(),
      translationAlignedIds: sentences.map((sentence) => sentence.id),
      explanation: String(explanation || "").trim(),
      explanationDepth: "standard",
      targetLanguage: isKnownTarget(targetLanguage) ? String(targetLanguage) : "",
      // Citation discipline lives in the field name: direct quotes read
      // original, never translation/explanation.
      quotableLayer: "original",
    };
  }

  /** Copy semantics: default to the layer the reader explicitly selected.
   * Direct quotation is refused on any layer but the original — the caller
   * gets the refusal reason, not a silently swapped text. */
  function copyLayer(layers, layerName, { requestedQuote = false } = {}) {
    if (!layers) return { ok: false, reason: "no-layers" };
    const name = String(layerName || "");
    if (!["original", "translation", "explanation"].includes(name)) {
      return { ok: false, reason: "unknown-layer" };
    }
    if (requestedQuote && name !== layers.quotableLayer) {
      return { ok: false, reason: "quotes-come-from-original-only" };
    }
    const text = String(layers[name] || "");
    if (!text) return { ok: false, reason: `empty-${name}` };
    return { ok: true, text, layer: name };
  }

  /** The explicit depth setting. Three reader-chosen levels; a request may
   * override for one task, and the override rides the request — it never
   * rewrites the setting or builds a profile. */
  const DEPTHS = Object.freeze(["brief", "standard", "deep"]);
  function normalizeDepth(depth) {
    return DEPTHS.includes(String(depth || "")) ? String(depth) : "standard";
  }
  function withDepth(layers, depth, { forOneRequest = false } = {}) {
    if (!layers) return layers || null;
    const next = normalizeDepth(depth);
    if (forOneRequest) {
      return { ...layers, requestDepthOverride: next };
    }
    return { ...layers, explanationDepth: next, requestDepthOverride: null };
  }

  /** Cultural-context premises are three kinds, and the kind is honest:
   * "cited" points at the original (with the sentence id), "explained" is
   * the desk's own background knowledge and says so, "assumption" is not
   * established and is marked to verify. */
  function buildPremise({ kind, text, sentenceId } = {}) {
    const body = String(text || "").trim();
    if (!body) return null;
    if (!["cited", "explained", "assumption"].includes(String(kind || ""))) return null;
    if (kind === "cited" && !String(sentenceId || "")) return null;
    return {
      kind,
      text: body,
      sentenceId: kind === "cited" ? String(sentenceId) : null,
      needsVerification: kind === "assumption",
    };
  }

  /** A metaphor is walked in a domain the reader already knows; the mapping
   * shows both where it holds and where it breaks. */
  function buildAnalogy({ domain, correspondences, breaks } = {}) {
    const where = String(domain || "").trim();
    const pairs = (Array.isArray(correspondences) ? correspondences : [])
      .map((pair) => ({ from: String(pair?.from || "").trim(), to: String(pair?.to || "").trim() }))
      .filter((pair) => pair.from && pair.to);
    if (!where || !pairs.length) return null;
    return {
      domain: where,
      correspondences: pairs,
      breaks: String(breaks || "").trim(),
    };
  }

  root.AISystem6ReadingLayers = Object.freeze({
    TARGET_LANGUAGES,
    isKnownTarget,
    languageLabel,
    sentenceIds,
    buildLayers,
    copyLayer,
    DEPTHS,
    normalizeDepth,
    withDepth,
    buildPremise,
    buildAnalogy,
  });
})(typeof window !== "undefined" ? window : globalThis);
