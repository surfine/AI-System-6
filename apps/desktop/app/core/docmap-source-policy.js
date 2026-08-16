// Shared DocMap source policy.
//
// This stays pure so every source app can use the same readiness decision and
// the feature contract can execute the selection/whole-source fallback without
// a DOM. Source discovery remains in docmap-entry.js.

function chooseDocMapSourceCandidate(selectionSource, wholeSource, rangeMode = "auto") {
  const requestedRange = rangeMode === "selection" || rangeMode === "source" ? rangeMode : "auto";
  const isReady = (source) => !!source?.text && source.text.length >= source.threshold;
  const selectionReady = isReady(selectionSource);
  const wholeReady = isReady(wholeSource);
  let source = null;

  if (requestedRange === "selection") source = selectionSource;
  else if (requestedRange === "source") source = wholeSource;
  else if (selectionReady) source = selectionSource;
  else if (wholeReady) source = wholeSource;
  else source = selectionSource || wholeSource || null;

  return {
    state: source ? (isReady(source) ? "ready" : "too-short") : "empty",
    ready: isReady(source),
    source,
    selectionSource,
    wholeSource,
    selectionReady,
    wholeReady,
    requestedRange,
    fellBackToSource: requestedRange === "auto" && !!selectionSource && !selectionReady && wholeReady,
  };
}

globalThis.AISystem6DocMapSourcePolicy = Object.freeze({ chooseDocMapSourceCandidate });
