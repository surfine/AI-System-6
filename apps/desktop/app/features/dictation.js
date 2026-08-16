// Feature module: dictation.
//
// Loaded before app.js as a classic script; shares the AI System 6 global scope.
//
// This half is the service, and it is why dictation earns its place in the
// startup disk: the floating Dictate button that finds the caret in any field,
// keeps clear of the controls around it, remembers the range, and inserts back
// into it. Speaking into the field you are already in is the front door.
//
// The window — record, the two transcripts, organize, send — is the other half
// and lives in dictation-pad.js, which loads when the window is summoned. Most
// sessions never summon it.


function setDictationDestination(dest) {
  const validDestinations = new Set(["teachtext", "assistant", "questionSheet", "scrapbook", "notepad"]);
  dictationIntentDestination = validDestinations.has(dest) ? dest : "assistant";
  const label = dictationDestinationLabel(dictationIntentDestination);
  const inputLabel = dictationInputTarget ? getInputTargetLabel(dictationInputTarget) : label;
  dictationIntentTargetEl.textContent = t("intent_target", inputLabel);
}

let dictationFieldButton = null;
let dictationFieldButtonTarget = null;
let dictationFieldButtonHideTimer = null;

function getEditableTextTarget(target) {
  if (!target) return null;
  if (target.closest?.('[data-dictation="off"]')) return null;

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    if (target.readOnly || target.disabled || target.closest(".dictation-window")) return null;
    if (["button", "checkbox", "file", "hidden", "radio", "range", "submit"].includes(target.type)) return null;
    return target;
  }

  const editable = target.closest?.("[contenteditable='true'], [contenteditable='']");
  if (!editable || editable.closest(".dictation-window")) return null;
  return editable;
}

function isVisibleTextTarget(target) {
  if (!target) return false;
  if (
    document.body.classList.contains("is-booting")
    || document.body.classList.contains("is-shutting-down")
    || document.body.classList.contains("has-system-modal")
  ) return false;
  if (target.hidden || target.closest?.("[hidden], .is-hidden, .is-app-hidden")) return false;
  const win = target.closest?.(".window");
  if (win?.classList.contains("is-collapsed")) return false;
  return (target.getClientRects?.().length || 0) > 0;
}

function getVisibleEditableTextTarget(target) {
  const textTarget = getEditableTextTarget(target);
  return isVisibleTextTarget(textTarget) ? textTarget : null;
}

function rangeBelongsToTarget(range, target) {
  if (!range || !target) return false;
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element === target || target.contains(element);
}

function rememberEditableRange(target) {
  if (!(target instanceof HTMLElement) || !target.isContentEditable) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (rangeBelongsToTarget(range, target)) {
    lastEditableRange = range.cloneRange();
  }
}

function getInputTargetLabel(target) {
  if (!target) return dictationDestinationLabel(dictationIntentDestination);

  const labelsById = {
    prompt: t("assistant_prompt"),
    "teachtext-body": t("teachtext_insertion"),
    "question-sheet-body": t("question_sheet"),
    "outline-content": t("outline"),
    "draft-body": t("section_draft"),
    "scrap-body-input": t("scrapbook_note"),
    "note-pad-text": t("note_pad"),
    "sideask-pad-question": t("sideask"),
  };
  if (labelsById[target.id]) return labelsById[target.id];
  if (target.closest?.("[data-outline-section]")) return t("outline");

  const explicit = target.dataset.dictationLabel || target.getAttribute("aria-label");
  if (explicit) return explicit;

  const label = target.id ? document.querySelector(`label[for="${CSS.escape(target.id)}"] span, label[for="${CSS.escape(target.id)}"]`) : null;
  if (label?.textContent?.trim()) return label.textContent.trim();

  const windowEl = target.closest(".window");
  const title = windowEl?.querySelector(".title-bar h1, .title-bar h2")?.textContent?.trim();
  return title || dictationDestinationLabel(dictationIntentDestination);
}

function destinationForInputTarget(target) {
  const windowName = target?.closest(".window")?.dataset.window;
  const fieldDestinations = {
    prompt: "assistant",
    "teachtext-body": "teachtext",
    "question-sheet-body": "questionSheet",
    "outline-content": "questionSheet",
    "draft-body": "teachtext",
    "scrap-body-input": "scrapbook",
    "note-pad-text": "notepad",
    // SideAsk is a question put to ClioTalk, so it organizes like one. Without
    // this row the pad fell through to inference and named whatever window
    // happened to be in front -- and "ten minutes of talking, then Send" into
    // the field you are already in is the one case dictation exists for.
    "sideask-pad-question": "assistant",
  };
  const windowDestinations = {
    assistant: "assistant",
    teachText: "teachtext",
    questionSheet: "questionSheet",
    scrapbook: "scrapbook",
    notePad: "notepad",
    sideAskPad: "assistant",
  };
  return fieldDestinations[target?.id] || windowDestinations[windowName] || null;
}

function rememberTextTarget(target) {
  const textTarget = getVisibleEditableTextTarget(target);
  if (!textTarget) return;
  lastTextTarget = textTarget;
  rememberEditableRange(textTarget);
}

function ensureDictationFieldButton() {
  if (dictationFieldButton) return dictationFieldButton;
  dictationFieldButton = document.createElement("button");
  dictationFieldButton.type = "button";
  dictationFieldButton.id = "dictation-field-button";
  dictationFieldButton.className = "dictation-field-button is-hidden";
  dictationFieldButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  dictationFieldButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = getVisibleEditableTextTarget(dictationFieldButtonTarget) || getCurrentInputTarget();
    if (!target) {
      hideDictationFieldButton();
      return;
    }
    rememberTextTarget(target);
    const dest = openDictationPad({ target });
    setStatus(t("intent_ready", getInputTargetLabel(target) || dictationDestinationLabel(dest)));
    hideDictationFieldButton();
  });
  document.body.appendChild(dictationFieldButton);
  return dictationFieldButton;
}

function updateDictationFieldButtonLabel() {
  const button = ensureDictationFieldButton();
  const title = t("compose_voice_input");
  button.textContent = title;
  button.title = title;
  button.setAttribute("aria-label", title);
}

function hideDictationFieldButton() {
  if (!dictationFieldButton) return;
  dictationFieldButton.classList.add("is-hidden");
  dictationFieldButtonTarget = null;
}

function scheduleDictationFieldButtonHide() {
  window.clearTimeout(dictationFieldButtonHideTimer);
  dictationFieldButtonHideTimer = window.setTimeout(() => {
    const activeTarget = getVisibleEditableTextTarget(document.activeElement);
    if (!activeTarget) hideDictationFieldButton();
  }, 120);
}

function hasAdjacentControlToRight(rect, buttonWidth) {
  const probeX = rect.right + Math.min(buttonWidth, 56) / 2 + 6;
  const probeY = rect.top + Math.min(rect.height - 2, 18);
  if (probeX >= window.innerWidth || probeY >= window.innerHeight) return false;
  const element = document.elementFromPoint(probeX, probeY);
  return !!element?.closest?.("button, [role='button'], input[type='button'], input[type='submit']");
}

// Dictation positions a floating control against an editable field and needs
// strict inset overlap semantics. The window manager owns the gap-based
// rectsOverlap; the concatenated bundle keeps only one definition per name, so
// this one must not share that name.
function dictationRectsOverlap(a, b, inset = 0) {
  return a.left < b.right - inset
    && a.right > b.left + inset
    && a.top < b.bottom - inset
    && a.bottom > b.top + inset;
}

function dictationButtonWouldCoverControl(candidate, target) {
  const candidateRect = {
    left: candidate.left,
    top: candidate.top,
    right: candidate.left + candidate.width,
    bottom: candidate.top + candidate.height,
  };
  // .da-origin is no control, but it is the row saying where this accessory's
  // text came from, and it sits directly above the field -- exactly where the
  // button prefers to go. Covering it is as bad as covering a button.
  const controls = document.querySelectorAll("button, [role='button'], summary, select, input[type='button'], input[type='submit'], .da-origin");
  return [...controls].some((control) => {
    if (control === dictationFieldButton || control === target || target.contains?.(control)) return false;
    if (control.closest?.(".is-hidden") || control.hidden || control.disabled) return false;
    const rect = control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return dictationRectsOverlap(candidateRect, rect, 2);
  });
}

function positionDictationFieldButton(target = dictationFieldButtonTarget) {
  const textTarget = getVisibleEditableTextTarget(target);
  if (!textTarget || textTarget.closest(".is-hidden")) {
    hideDictationFieldButton();
    return;
  }

  const rect = textTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    hideDictationFieldButton();
    return;
  }

  const button = ensureDictationFieldButton();
  updateDictationFieldButtonLabel();
  dictationFieldButtonTarget = textTarget;
  // Measure the button at its real width. While hidden it reports 0 and the
  // 48px guess below stood in, which under-reserved 22px: every candidate and
  // the clamp both aimed a 70px button at a 48px slot, and it settled on the
  // window frame. Unhiding here costs no frame -- the position is written
  // before this task yields, so nothing is painted in between.
  button.classList.remove("is-hidden");

  const gap = 4;
  const margin = 4;
  const buttonWidth = button.offsetWidth || 48;
  const buttonHeight = button.offsetHeight || 28;
  // The button belongs to the window that owns the field, not to the screen.
  // Clamping against the viewport alone let a field near the right edge of a
  // narrow window push the button onto the window frame and the scroll lane,
  // where it read as a control that had escaped its window.
  const owner = textTarget.closest(".window");
  const ownerBox = owner ? owner.getBoundingClientRect() : null;
  const ownerLane = owner
    ? parseFloat(getComputedStyle(owner).getPropertyValue("--window-frame-lane")) || 0
    : 0;
  const limitLeft = ownerBox ? Math.max(margin, ownerBox.left + margin) : margin;
  const limitRight = ownerBox
    ? Math.max(limitLeft, ownerBox.right - ownerLane - buttonWidth - margin)
    : Math.max(margin, window.innerWidth - buttonWidth - margin);
  const canSitOutside = (ownerBox ? ownerBox.right - ownerLane : window.innerWidth) - rect.right
    >= buttonWidth + gap + margin;
  const rightSideHasControl = hasAdjacentControlToRight(rect, buttonWidth);
  const candidates = [
    !rightSideHasControl && canSitOutside
      ? { left: rect.right + gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight }
      : null,
    { left: rect.right - buttonWidth - gap, top: rect.top - buttonHeight - gap, width: buttonWidth, height: buttonHeight },
    { left: rect.right - buttonWidth - gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight },
    rect.left >= buttonWidth + gap + margin
      ? { left: rect.left - buttonWidth - gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight }
      : null,
    canSitOutside
      ? { left: rect.right + gap, top: rect.top + gap, width: buttonWidth, height: buttonHeight }
      : null,
  ].filter(Boolean);

  const clampedCandidates = candidates.map((candidate) => ({
    ...candidate,
    left: clampNumber(candidate.left, limitLeft, limitRight),
    top: clampNumber(candidate.top, 28, Math.max(28, window.innerHeight - buttonHeight - margin)),
  }));
  const selected = clampedCandidates.find((candidate) => !dictationButtonWouldCoverControl(candidate, textTarget))
    || clampedCandidates[0]
    || {
      left: clampNumber(rect.right - buttonWidth - gap, limitLeft, limitRight),
      top: clampNumber(rect.top + gap, 28, Math.max(28, window.innerHeight - buttonHeight - margin)),
    };

  button.style.left = `${selected.left}px`;
  button.style.top = `${selected.top}px`;
}

function showDictationFieldButtonForTarget(target) {
  const textTarget = getVisibleEditableTextTarget(target);
  if (!textTarget) {
    scheduleDictationFieldButtonHide();
    return;
  }
  window.clearTimeout(dictationFieldButtonHideTimer);
  rememberTextTarget(textTarget);
  positionDictationFieldButton(textTarget);
}

function getCurrentInputTarget() {
  const activeTarget = getVisibleEditableTextTarget(document.activeElement);
  if (activeTarget) return activeTarget;
  const previousTarget = document.contains(lastTextTarget) ? getVisibleEditableTextTarget(lastTextTarget) : null;
  if (previousTarget) return previousTarget;
  lastTextTarget = null;
  return null;
}

function defaultInputTargetForDestination(dest) {
  if (dest === "assistant") return promptInput;
  if (dest === "teachtext") return teachTextBodyInput;
  if (dest === "questionSheet") return questionSheetBodyInput;
  if (dest === "scrapbook") return scrapBodyInput;
  if (dest === "notepad") return notePadTextInput;
  return null;
}

function insertTextIntoInputTarget(target, text) {
  if (!target || !text) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.focus();
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (!(target instanceof HTMLElement) || !target.isContentEditable) return false;

  target.focus();
  const selection = window.getSelection();
  const range = lastEditableRange && rangeBelongsToTarget(lastEditableRange, target)
    ? lastEditableRange.cloneRange()
    : document.createRange();

  if (!lastEditableRange || !rangeBelongsToTarget(lastEditableRange, target)) {
    range.selectNodeContents(target);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  lastEditableRange = range.cloneRange();
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function inferDictationDestination() {
  const inputTarget = getCurrentInputTarget();
  const inputDestination = destinationForInputTarget(inputTarget);
  if (inputDestination) return inputDestination;

  const activeWindow = document.querySelector(".window.is-active:not(.is-hidden)");
  const windowName = activeWindow?.dataset.window;
  const windowDestinations = {
    teachText: "teachtext",
    assistant: "assistant",
    questionSheet: "questionSheet",
    outline: "questionSheet",
    sectionDrafts: "teachtext",
    claimCheck: "teachtext",
    scrapbook: "scrapbook",
    notePad: "notepad",
    sideAskPad: "assistant",
  };

  return windowDestinations[windowName] || (writerMode ? "teachtext" : "assistant");
}

// The window can also arrive without going through openDictationPad — session
// restore opens it by name, and the field it last spoke into may be long gone.
// A destination that names a window nobody can see is the promise this pad used
// to break, so it is re-checked whenever the window appears.
function refreshDictationDestination() {
  if (getVisibleEditableTextTarget(dictationInputTarget)) return;
  dictationInputTarget = null;
  setDictationDestination("notepad");
}

// The one door into the lazy half. Every control that reaches a window function
// goes through here: a bare reference resolves at boot, throws a ReferenceError
// the moment it is touched, and takes the whole command registry with it.
async function withDictationPad(run) {
  if (typeof ensureDictationPadModule === "function") await ensureDictationPadModule();
  return run();
}

function openDictationPad(options = {}) {
  dictationInputTarget = getVisibleEditableTextTarget(options.target) || getCurrentInputTarget();
  const dest = options.dest || destinationForInputTarget(dictationInputTarget) || inferDictationDestination();
  dictationInputTarget = dictationInputTarget || getVisibleEditableTextTarget(defaultInputTargetForDestination(dest));
  // The window names where the words will actually land. With no field open,
  // naming ClioTalk was a promise the Send button could not keep.
  setDictationDestination(dictationInputTarget ? dest : "notepad");
  openWindow("dictation");
  dictationRawInput.focus();
  return dest;
}

function invokeIntentKey() {
  const dest = openDictationPad();
  setStatus(t("intent_ready", dictationDestinationLabel(dest)));
}
