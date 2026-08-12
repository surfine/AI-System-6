// Ask bar — the shared question footer under Reader, Scrapbook, DocMap,
// ClioStage, and Time Machine. Each window registers a describe() that reports
// what the next question would actually carry; this file gates the controls on
// there being something to ask. The answer always
// lands in ClioTalk, so nothing here ever renders a reply.
const askBarSources = new Map();

function askBarForm(appId) {
  return document.querySelector(`[data-ask-source="${appId}"]`);
}

// describe() -> { ready, object, range }
// `range` must describe the context the request will really carry — whole
// source, current selection, N scraps, a focused branch. Never a guess.
function registerAskBarSource(appId, describe) {
  if (!appId || typeof describe !== "function") return;
  askBarSources.set(appId, describe);
  refreshAskBar(appId);
}

function renderAskBar(appId, scope) {
  const form = askBarForm(appId);
  if (!form) return;
  const ready = Boolean(scope && scope.ready);
  const input = form.querySelector("input");
  const button = form.querySelector('button[type="submit"]');
  form.classList.toggle("is-empty", !ready);
  if (input) input.disabled = !ready;
  if (button) button.disabled = !ready;
}

function refreshAskBar(appId) {
  const describe = askBarSources.get(appId);
  if (!describe) return;
  let scope = null;
  try {
    scope = describe();
  } catch {
    scope = null;
  }
  renderAskBar(appId, scope);
}

function refreshAskBars() {
  askBarSources.forEach((_describe, appId) => refreshAskBar(appId));
}

// Preserve the shared completion hook for callers; the compact bar has no
// secondary status row, so its owning window simply resumes its current state.
function markAskBarSent(appId) {
  refreshAskBar(appId);
}
