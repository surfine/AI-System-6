// Find / Change for the writing surfaces.
//
// Modeless on purpose. MacWrite's Find/Change was a window you kept open while
// you read, and stepping through matches with the dialog in the way is the one
// thing a writer cannot do. It therefore edits whichever writing surface was
// last in front rather than owning a document of its own, and names that target
// in its own status row so it is never a guess.
//
// Every edit goes through mdeApply, i.e. execCommand("insertText"), so the
// native undo stack survives and a real `input` event fires — which is what
// keeps the modified flag, the linked-document sync and the preview refresh
// working. Change All is a single apply over the whole document: one undo
// entry, not one per match.

const findChangeSurfaceSelectors = Object.freeze({
  teachText: "#teachtext-body",
  questionSheet: "#question-sheet-body",
  outline: "#outline-content",
  sectionDrafts: "#draft-body",
  reviewDesk: "#review-desk-body",
});

const findChangeSurfaceLabelKeys = Object.freeze({
  teachText: "manuscript",
  questionSheet: "question_sheet",
  outline: "outline",
  sectionDrafts: "section_drafts",
  reviewDesk: "review_desk",
});

let findChangeTargetName = "";

function findChangeQueryInput() {
  return document.querySelector("#find-change-query");
}

function findChangeReplacementInput() {
  return document.querySelector("#find-change-replacement");
}

function findChangeMatchCase() {
  return document.querySelector("#find-change-match-case")?.checked === true;
}

// A candidate surface is one Find can actually land a match in. An open window
// is not enough: a surface showing its Markdown preview has no caret and cannot
// display a selection, so targeting it would report matches the writer could
// never see.
function findChangeSurfaceIsOpen(name) {
  const win = typeof getWindow === "function" ? getWindow(name) : null;
  if (!win || win.classList.contains("is-hidden")) return false;
  const editor = document.querySelector(findChangeSurfaceSelectors[name]);
  if (!editor || editor.classList.contains("is-hidden")) return false;
  return editor.offsetParent !== null;
}

// The target follows the writer, in this order:
//   1. the writing surface the caret is actually in,
//   2. the writing surface whose window is in front,
//   3. the surface that holds the pen in the current phase,
//   4. any open writing surface.
//
// The caret comes first because the route raises the manuscript beside Section
// Drafts: "the window in front" alone would aim Find at the read-only
// projection while the writer was typing in the editable one. When the Find
// window itself is in front, the last resolved target is remembered, and a
// stale name never survives its window closing.
function findChangeCaretSurfaceName() {
  const focused = document.activeElement;
  if (!focused?.id) return "";
  return Object.keys(findChangeSurfaceSelectors)
    .find((name) => findChangeSurfaceSelectors[name] === `#${focused.id}`) || "";
}

function findChangeWritableSurfaceName() {
  return Object.keys(findChangeSurfaceSelectors).find((name) => {
    if (!findChangeSurfaceIsOpen(name)) return false;
    return findChangeTargetIsWritable(document.querySelector(findChangeSurfaceSelectors[name]));
  }) || "";
}

function findChangeResolveTargetName() {
  const caret = findChangeCaretSurfaceName();
  if (caret && findChangeSurfaceIsOpen(caret)) {
    findChangeTargetName = caret;
    return findChangeTargetName;
  }
  const active = document.querySelector(".window.is-active:not(.is-hidden)")?.dataset.window || "";
  if (findChangeSurfaceSelectors[active]) {
    findChangeTargetName = active;
    return findChangeTargetName;
  }
  if (findChangeTargetName && findChangeSurfaceIsOpen(findChangeTargetName)) return findChangeTargetName;
  findChangeTargetName = findChangeWritableSurfaceName()
    || Object.keys(findChangeSurfaceSelectors).find(findChangeSurfaceIsOpen)
    || "";
  return findChangeTargetName;
}

function findChangeTargetElement() {
  const name = findChangeResolveTargetName();
  if (!name) return null;
  return document.querySelector(findChangeSurfaceSelectors[name]) || null;
}

function findChangeTargetIsWritable(target) {
  return !!target && !target.readOnly && !target.disabled;
}

function renderFindChangeTarget() {
  const label = document.querySelector("#find-change-target");
  if (!label) return;
  const name = findChangeResolveTargetName();
  const target = name ? document.querySelector(findChangeSurfaceSelectors[name]) : null;
  const writable = findChangeTargetIsWritable(target);
  if (!name) {
    label.textContent = t("find_no_target");
  } else {
    const surface = t(findChangeSurfaceLabelKeys[name] || name);
    label.textContent = writable ? t("find_target", surface) : t("find_target_read_only", surface);
  }
  // Change is impossible on a read-only projection; say so by greying the
  // controls rather than by failing after the click. The greying is a
  // registered reason, never a direct assignment: the write lease owns
  // `disabled` on every [data-requires-write] control, and a second writer
  // would simply be overwritten on the next lease sync.
  window.AISystem6WriteLease?.syncReadOnlySurface?.();
}

const findChangeWriteControls = new Set([
  "find-change-all",
  "find-change-current",
  "find-change-replacement",
]);

function findChangeControlIsReadOnly(element) {
  if (!findChangeWriteControls.has(element?.id)) return false;
  return !findChangeTargetIsWritable(findChangeTargetElement());
}

function findChangeOccurrences(text, query, matchCase) {
  const haystack = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  const found = [];
  if (!needle) return found;
  let index = haystack.indexOf(needle, 0);
  while (index >= 0) {
    found.push(index);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return found;
}

function findChangeRevealMatch(target, name, start, end) {
  // Raise, do not re-open: openWindow runs the whole placement pipeline and
  // would re-arrange the workspace on every press of Find Next.
  const win = name && typeof getWindow === "function" ? getWindow(name) : null;
  if (win?.classList.contains("is-hidden")) {
    if (typeof openWindow === "function") openWindow(name);
  } else if (win && typeof focusWindow === "function") {
    focusWindow(win);
  }
  target.focus();
  target.setSelectionRange(start, end);
  // Focus alone does not always bring the selection into view in a scrolled
  // textarea; nudging the scroll position by the caret's line does.
  const before = target.value.slice(0, start);
  const lineHeight = parseFloat(getComputedStyle(target).lineHeight) || 16;
  const line = before.split("\n").length - 1;
  const wanted = Math.max(0, (line * lineHeight) - (target.clientHeight / 2));
  if (Math.abs(target.scrollTop - wanted) > target.clientHeight / 2) target.scrollTop = wanted;
}

function findChangeNext({ announce = true } = {}) {
  // Re-aim before acting, so the row can never name one surface while the
  // command edits another.
  renderFindChangeTarget();
  const query = String(findChangeQueryInput()?.value || "");
  if (!query) {
    if (announce) setStatus(t("find_enter_text"));
    findChangeQueryInput()?.focus();
    return null;
  }
  const name = findChangeResolveTargetName();
  const target = findChangeTargetElement();
  if (!target) {
    if (announce) setStatus(t("find_no_target"));
    return null;
  }

  const matchCase = findChangeMatchCase();
  const matches = findChangeOccurrences(target.value, query, matchCase);
  if (!matches.length) {
    if (announce) setStatus(t("find_no_match", query));
    return null;
  }

  const from = Number(target.selectionEnd) || 0;
  let ordinal = matches.findIndex((index) => index >= from);
  const wrapped = ordinal < 0;
  if (wrapped) ordinal = 0;
  const start = matches[ordinal];
  findChangeRevealMatch(target, name, start, start + query.length);
  if (announce) {
    setStatus(wrapped
      ? t("find_wrapped", ordinal + 1, matches.length)
      : t("find_match_count", ordinal + 1, matches.length));
  }
  return { target, name, start, end: start + query.length, total: matches.length };
}

function findChangeCurrent() {
  // Re-aim before acting, so the row can never name one surface while the
  // command edits another.
  renderFindChangeTarget();
  const target = findChangeTargetElement();
  if (!findChangeTargetIsWritable(target)) {
    setStatus(t("find_change_blocked"));
    renderFindChangeTarget();
    return;
  }
  const query = String(findChangeQueryInput()?.value || "");
  if (!query) {
    setStatus(t("find_enter_text"));
    findChangeQueryInput()?.focus();
    return;
  }

  const matchCase = findChangeMatchCase();
  const start = Number(target.selectionStart) || 0;
  const end = Number(target.selectionEnd) || 0;
  const selected = target.value.slice(start, end);
  const selectionIsMatch = selected.length === query.length
    && (matchCase ? selected === query : selected.toLowerCase() === query.toLowerCase());

  // "Change, then Find": with nothing matching selected yet, the first press
  // only finds — the same order MacWrite used, so a stray press never edits
  // text the writer has not seen highlighted.
  if (!selectionIsMatch) {
    findChangeNext();
    return;
  }

  const replacement = String(findChangeReplacementInput()?.value || "");
  mdeApply(target, { from: start, to: end, insert: replacement, selStart: start + replacement.length });
  const next = findChangeNext({ announce: false });
  setStatus(next ? t("find_changed_one_more", next.total) : t("find_changed_one"));
}

async function findChangeAll() {
  // Re-aim before acting, so the row can never name one surface while the
  // command edits another.
  renderFindChangeTarget();
  const target = findChangeTargetElement();
  if (!findChangeTargetIsWritable(target)) {
    setStatus(t("find_change_blocked"));
    renderFindChangeTarget();
    return;
  }
  const query = String(findChangeQueryInput()?.value || "");
  if (!query) {
    setStatus(t("find_enter_text"));
    findChangeQueryInput()?.focus();
    return;
  }

  const matchCase = findChangeMatchCase();
  const text = target.value;
  const matches = findChangeOccurrences(text, query, matchCase);
  if (!matches.length) {
    setStatus(t("find_no_match", query));
    return;
  }

  // One edit that rewrites every match at once has one undo entry and one
  // input event; N separate edits would leave the writer pressing Cmd-Z N times
  // to take back a single decision.
  const confirmed = await showSystemModal(t("find_change_all_confirm", matches.length, query), "confirm");
  if (confirmed !== "yes") return;

  const replacement = String(findChangeReplacementInput()?.value || "");
  let rebuilt = "";
  let cursor = 0;
  matches.forEach((index) => {
    rebuilt += text.slice(cursor, index) + replacement;
    cursor = index + query.length;
  });
  rebuilt += text.slice(cursor);
  mdeApply(target, { from: 0, to: text.length, insert: rebuilt, selStart: 0 });
  setStatus(t("find_changed_all", matches.length));
}

function openFindChangeWindow() {
  renderFindChangeTarget();
  const opened = typeof openWindow === "function" ? openWindow("findChange") : null;
  const focusField = () => {
    const field = findChangeQueryInput();
    if (!field) return;
    field.focus();
    field.select();
  };
  if (opened && typeof opened.then === "function") opened.then(focusField);
  else requestAnimationFrame(focusField);
  return opened;
}

function initializeFindChange() {
  const form = document.querySelector("#find-change-form");
  if (!form || form.dataset.findChangeWired === "true") {
    renderFindChangeTarget();
    return;
  }
  form.dataset.findChangeWired = "true";
  window.AISystem6WriteLease?.registerReadOnlyRule?.(findChangeControlIsReadOnly);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    findChangeNext();
  });
  findChangeQueryInput()?.addEventListener("input", () => renderFindChangeTarget());
  // Clicking into another writing surface re-aims the panel, so the row always
  // names the surface the next press will act on.
  document.addEventListener("focusin", (event) => {
    if (!event.target?.matches?.("#teachtext-body, #question-sheet-body, #outline-content, #draft-body, #review-desk-body")) return;
    renderFindChangeTarget();
  }, true);
  renderFindChangeTarget();
}

window.AISystem6FindChange = Object.freeze({
  open: openFindChangeWindow,
  next: findChangeNext,
  changeCurrent: findChangeCurrent,
  changeAll: findChangeAll,
  renderTarget: renderFindChangeTarget,
  initialize: initializeFindChange,
});

window.AISystem6FindChangeLoaded = true;
initializeFindChange();
