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

// What the pad was opened on: the element, the words in it and the identity of
// the document behind it. Send checks this before writing, because an element
// that is still in the DOM is not necessarily the same piece of writing
// (spec §8).
let dictationTargetSnapshot = null;
let dictationTargetStale = false;

// Which native inputs are surfaces a floating microphone belongs over. The
// rule is a whitelist: text and search hold prose. Everything else — password,
// hidden, number, date, file and friends — is not a place to speak into, and
// setRangeText is not even supported on some of them. A field that looks like
// text but is an API key or a one-time code opts out through autocomplete.
const DICTATION_SAFE_INPUT_TYPES = new Set(["text", "search"]);
const DICTATION_BLOCKED_AUTOCOMPLETE = new Set(["current-password", "new-password", "one-time-code"]);

function dictationInputIsSafe(target) {
  if (!(target instanceof HTMLInputElement)) return true;
  const type = String(target.type || "text").toLowerCase();
  if (!DICTATION_SAFE_INPUT_TYPES.has(type)) return false;
  const autocomplete = String(target.getAttribute?.("autocomplete") || "").toLowerCase();
  if (DICTATION_BLOCKED_AUTOCOMPLETE.has(autocomplete)) return false;
  return true;
}

// The app's own name for the document a field belongs to. Two copies of a
// field from different projects are different writing, even when the element,
// the id and the value look the same.
function dictationDocumentIdentity(target) {
  const windowName = target?.closest?.(".window")?.dataset.window || "";
  const project = typeof activeProjectId === "string" ? activeProjectId : "";
  if (windowName === "teachText" || windowName === "assistant" || windowName === "questionSheet") {
    return `${windowName}:${project}`;
  }
  return windowName || "desk";
}

function captureDictationTarget(target) {
  if (!target) return null;
  const windowName = target.closest?.(".window")?.dataset.window || "";
  const identity = dictationDocumentIdentity(target);
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    return {
      element: target,
      kind: "field",
      id: target.id || "",
      windowName,
      documentId: identity,
      value: target.value,
      selectionStart: target.selectionStart ?? target.value.length,
      selectionEnd: target.selectionEnd ?? target.value.length,
    };
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    const range = lastEditableRange && rangeBelongsToTarget(lastEditableRange, target)
      ? lastEditableRange.cloneRange()
      : null;
    return {
      element: target,
      kind: "editable",
      id: target.id || "",
      windowName,
      documentId: identity,
      text: target.textContent || "",
      range,
    };
  }
  return null;
}

// Why this target cannot take the words now, or "" when it can. Every reason
// is a refusal, never a reason to quietly pick another field.
function dictationTargetProblem(snapshot) {
  if (!snapshot || !snapshot.element) return "target-missing";
  const element = snapshot.element;
  if (!document.contains(element)) return "target-missing";
  if (!isVisibleTextTarget(element)) return "target-hidden";
  if (element.disabled || element.readOnly) return "target-locked";
  if (element instanceof HTMLInputElement && !dictationInputIsSafe(element)) return "target-unsafe";
  if (dictationDocumentIdentity(element) !== snapshot.documentId) return "target-changed";
  if (snapshot.kind === "field") {
    if (element.value !== snapshot.value) return "target-changed";
  } else if ((element.textContent || "") !== snapshot.text) {
    return "target-changed";
  }
  return "";
}

function getEditableTextTarget(target) {
  if (!target) return null;
  if (target.closest?.('[data-dictation="off"]')) return null;

  if (target instanceof HTMLTextAreaElement) {
    if (target.readOnly || target.disabled || target.closest(".dictation-window")) return null;
    return target;
  }

  if (target instanceof HTMLInputElement) {
    if (target.readOnly || target.disabled || target.closest(".dictation-window")) return null;
    return dictationInputIsSafe(target) ? target : null;
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
  if (!isVisibleTextTarget(textTarget)) return null;
  // A filter box inside a transient menu (the All Windows overview, a Dock
  // menu) takes a word or two and closes; the floating Dictation button beside
  // it was one more control to read in a list meant for a glance (seen
  // 2026-10-08). Dictation keeps to the fields that hold writing.
  if (textTarget.closest?.(".window-browse-popover, .menu-popover")) return null;
  return textTarget;
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
  // A native <dialog> lives in the top layer, where no z-index can reach it.
  // The button belongs to the field it floats beside, and that field can be
  // inside such a dialog (naming a new Project Hard Disk is the everyday
  // case), so the control has to be in the same layer rather than behind the
  // window it was placed for. Balloon help already rides the top layer this
  // way; manual popovers are the established mechanism here.
  dictationFieldButton.setAttribute("popover", "manual");
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
  closeDictationFieldButtonLayer(dictationFieldButton);
  dictationFieldButtonTarget = null;
}

/**
 * Re-promote the button in the top layer. Top-layer order is promotion order,
 * so hiding and showing again is what keeps the control above a dialog that
 * was opened after it. A browser without the Popover API leaves the button
 * exactly as it was: a fixed element at its own z-index.
 *
 * @param {HTMLElement} button
 */
function openDictationFieldButtonLayer(button) {
  if (typeof button.showPopover !== "function") return;
  try {
    if (button.matches(":popover-open")) button.hidePopover();
    button.showPopover();
  } catch {}
}

/** @param {HTMLElement} button */
function closeDictationFieldButtonLayer(button) {
  if (typeof button.hidePopover !== "function") return;
  try {
    if (button.matches(":popover-open")) button.hidePopover();
  } catch {}
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
  //
  // The field is in this list too: its first line is where a writer puts the
  // caret, and a slot clamped into the window's lane lands right there and
  // swallows the click that was meant for the paper.
  const controls = [target, ...document.querySelectorAll("button, [role='button'], summary, select, input[type='button'], input[type='submit'], .da-origin")];
  return controls.some((control) => {
    if (control === dictationFieldButton || (control !== target && target.contains?.(control))) return false;
    // A disabled button still occupies its place: Section Drafts' "Next
    // section" is disabled until there is a next section, and the button used
    // to land on top of it and stay there once it was enabled.
    if (control.closest?.(".is-hidden") || control.hidden) return false;
    const rect = control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return dictationRectsOverlap(candidateRect, rect, 2);
  });
}

// The slot the button prefers -- the band directly above the field -- is the
// window's own details bar, so the button arrives as a second control in a row
// that already has one. It used to be dropped flush against the field at a
// height of its own (28px, and 30px under Liquid Glass), which left it 4-11px
// taller than that row's pop-up menu, 6-9px below the menu's centre line, and
// with its bottom edge over the first line of the paper. Return the row's own
// control, so the button can take that height and that centre line. No token
// holds the number: every era measures its pop-up from its own evidence, and
// Aqua's is a 21px pixel-art rail.
function dictationToolbarRowAbove(textTarget, fieldRect) {
  const owner = textTarget.closest(".window");
  if (!owner) return null;
  for (const bar of owner.querySelectorAll(".details-bar")) {
    const barBox = bar.getBoundingClientRect();
    if (barBox.height <= 0) continue;
    // Directly above means the bar ends before the field starts, and the two
    // are no further apart than the bar is tall.
    if (barBox.bottom > fieldRect.top + 2) continue;
    if (fieldRect.top - barBox.bottom > barBox.height) continue;
    const control = [...bar.querySelectorAll(".system-select-button, select, button")]
      .find((element) => !element.hidden
        && !element.closest(".is-hidden")
        // The select harness leaves the native control in place at the
        // wrapper's full size and paints nothing. Under Liquid Glass that
        // wrapper is 1.3px taller than the pop-up the reader sees, so the
        // row's control is the button the harness draws, never the select.
        && !(element.tagName === "SELECT" && element.closest(".select-wrap.has-system-select"))
        && element.getBoundingClientRect().height > 0);
    // A row with no control of its own -- Question Sheet's bar is three pieces
    // of text -- tells the button where the line is, not how tall to be. Taking
    // the bar's own height there made a button as tall as the whole row.
    const controlBox = control ? control.getBoundingClientRect() : null;
    return { barTop: barBox.top, barHeight: barBox.height, control: controlBox };
  }
  return null;
}

function positionDictationFieldButton(target = dictationFieldButtonTarget) {
  const textTarget = getVisibleEditableTextTarget(target);
  // The writing surfaces keep 听写 in fixed places instead: Edit › Dictation
  // Pad on the desk, and the format bar beside a phone's keyboard. A floating
  // button over their header only ever covered "Saved" or the status pop-up.
  if (!textTarget || textTarget.closest(".is-hidden") || textTarget.closest(".mde-surface.is-cm")) {
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
  openDictationFieldButtonLayer(button);
  button.style.removeProperty("--dictation-field-button-height");

  const gap = 4;
  const margin = 4;
  const buttonWidth = button.offsetWidth || 48;
  const buttonHeight = button.getBoundingClientRect().height || 28;
  const row = dictationToolbarRowAbove(textTarget, rect);
  const rowSlot = row
    ? {
      left: rect.right - buttonWidth - gap,
      top: row.control ? row.control.top : row.barTop + (row.barHeight - buttonHeight) / 2,
      width: buttonWidth,
      height: row.control ? row.control.height : buttonHeight,
      rowHeight: row.control ? row.control.height : 0,
    }
    : null;
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
    rowSlot || { left: rect.right - buttonWidth - gap, top: rect.top - buttonHeight - gap, width: buttonWidth, height: buttonHeight },
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
    top: clampNumber(candidate.top, 28, Math.max(28, window.innerHeight - candidate.height - margin)),
  }));
  const selected = clampedCandidates.find((candidate) => !dictationButtonWouldCoverControl(candidate, textTarget))
    || clampedCandidates[0]
    || {
      left: clampNumber(rect.right - buttonWidth - gap, limitLeft, limitRight),
      top: clampNumber(rect.top + gap, 28, Math.max(28, window.innerHeight - buttonHeight - margin)),
    };

  // Only the row slot carries a height: everywhere else the button keeps the
  // era's push-button height from the stylesheet.
  if (selected.rowHeight) {
    button.style.setProperty("--dictation-field-button-height", `${selected.rowHeight}px`);
  }
  button.style.setProperty("--dictation-field-button-x", `${selected.left}px`);
  button.style.setProperty("--dictation-field-button-y", `${selected.top}px`);
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
    if (!dictationInputIsSafe(target)) return false;
    if (target.readOnly || target.disabled || !document.contains(target)) return false;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const before = target.value;
    // The app's own editing transaction (markdown-editor.js): it keeps the
    // native undo stack and fires one real input event, so the document's own
    // state moves — not just the DOM (T05, T08).
    if (typeof mdeApply === "function") {
      mdeApply(target, { from: start, to: end, insert: text, selStart: start + text.length });
    } else {
      target.focus();
      target.setRangeText(text, start, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Success is the buffer having changed, not the call having returned.
    if (target.value === before) return false;
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (!(target instanceof HTMLElement) || !target.isContentEditable || !document.contains(target)) return false;
  const beforeText = target.textContent || "";

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
  return (target.textContent || "") !== beforeText;
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
  // No field was captured when the pad opened: the Note Pad was the declared
  // destination from the start, not a fallback chosen after a failure.
  if (!dictationTargetSnapshot) {
    if (getVisibleEditableTextTarget(dictationInputTarget)) return;
    dictationInputTarget = null;
    setDictationDestination("notepad");
    return;
  }
  const problem = dictationTargetProblem(dictationTargetSnapshot);
  dictationTargetStale = problem !== "";
  // A captured field that went away keeps its name in the window and its
  // refusal at Send. Choosing a new field here is what "spoke ten minutes into
  // the wrong place" looked like.
  dictationInputTarget = dictationTargetSnapshot.element;
}

// The one door into the lazy half. Every control that reaches a window function
// goes through here: a bare reference resolves at boot, throws a ReferenceError
// the moment it is touched, and takes the whole command registry with it.
async function withDictationPad(run) {
  if (typeof ensureDictationPadModule === "function") await ensureDictationPadModule();
  return run();
}

function openDictationPad(options = {}) {
  const requested = getVisibleEditableTextTarget(options.target) || getCurrentInputTarget();
  const dest = options.dest || destinationForInputTarget(requested) || inferDictationDestination();
  const target = requested || getVisibleEditableTextTarget(defaultInputTargetForDestination(dest));
  dictationInputTarget = target;
  // Captured before the pad takes focus: the element, its words, its selection
  // and the document behind it (§8.1).
  dictationTargetSnapshot = captureDictationTarget(target);
  dictationTargetStale = false;
  // The window names where the words will actually land. With no field open,
  // naming ClioTalk was a promise the Send button could not keep.
  setDictationDestination(target ? dest : "notepad");
  openWindow("dictation");
  dictationRawInput.focus();
  return target ? dest : "notepad";
}

function invokeIntentKey() {
  const dest = openDictationPad();
  setStatus(t("intent_ready", dictationDestinationLabel(dest)));
}

window.AISystem6Runtime?.registerApplication({
  id: "dictation",
  windowName: "dictation",
  commands: {
    "open-dictation": {
      handler: invokeIntentKey,
      isAvailable: () => true,
    },
  },
});
