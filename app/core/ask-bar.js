// Ask bar — the shared question footer under Reader, Scrapbook, DocMap,
// ClioStage, and Time Machine. Each window registers a describe() that reports
// what the next question would actually carry; this file renders that scope row
// and gates the controls on there being something to ask. The answer always
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
  if (!ready) return;
  const objectEl = form.querySelector(".ask-scope-object");
  const rangeEl = form.querySelector(".ask-scope-range");
  if (objectEl) objectEl.textContent = scope.object || "";
  if (rangeEl) rangeEl.textContent = scope.range || "";
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

// The question was handed to ClioTalk; say so where the scope was, then let the
// window's own state take the row back.
function markAskBarSent(appId) {
  const form = askBarForm(appId);
  const rangeEl = form ? form.querySelector(".ask-scope-range") : null;
  if (!rangeEl) return;
  rangeEl.textContent = t("ask_scope_sent");
  window.setTimeout(() => refreshAskBar(appId), 1800);
}

