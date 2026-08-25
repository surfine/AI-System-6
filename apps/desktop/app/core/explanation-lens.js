// Shared explanation lens normalization for ELI5 ("explain like a five-year-old").
//
// The lens is NOT a style: it describes how the audience will understand the
// work. Quick Draft stores it under `workspace.intake.setup.explanationLens`;
// Writing Studio stores it at `project.explanationLens`. Both surfaces use the
// same shape and default so the durable contract cannot drift.

window.AISystem6ExplanationLens = (() => {
  const BASELINE_KNOWLEDGE = Object.freeze([
    "secondary-school",
    "some-familiarity",
    "familiar",
  ]);

  // Writing for one-pass listening is a default capability, not an opt-in
  // feature: a reader who has to go back and re-read a sentence has already
  // lost it, and that is true of every piece the route produces. A writer can
  // still switch it off per project - an explicit false is honoured below.
  function blankExplanationLens() {
    return {
      id: "eli5",
      enabled: true,
      audience: "general-public",
      baselineKnowledge: "secondary-school",
      medium: "spoken-video",
      question: "",
      stuckPointHint: "",
      mustKeepTerms: [],
    };
  }

  function asString(value) {
    return typeof value === "string" ? value : "";
  }

  function normalizeExplanationLens(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const blank = blankExplanationLens();
    const baselineKnowledge = BASELINE_KNOWLEDGE.includes(source.baselineKnowledge)
      ? source.baselineKnowledge
      : blank.baselineKnowledge;
    const mustKeepTerms = (Array.isArray(source.mustKeepTerms) ? source.mustKeepTerms : [])
      .map((term) => asString(term).trim())
      .filter(Boolean)
      .filter((term, index, all) => all.indexOf(term) === index);

    return {
      ...blank,
      id: asString(source.id) || blank.id,
      // Missing means "never chosen", which now means on. Only an explicit
      // false turns it off, so a project the writer switched off stays off.
      enabled: source.enabled !== false,
      audience: asString(source.audience) || blank.audience,
      baselineKnowledge,
      medium: asString(source.medium) || blank.medium,
      question: asString(source.question),
      stuckPointHint: asString(source.stuckPointHint),
      mustKeepTerms,
    };
  }

  return Object.freeze({
    blankExplanationLens,
    normalizeExplanationLens,
  });
})();
