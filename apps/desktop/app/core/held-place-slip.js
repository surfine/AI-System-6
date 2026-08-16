// The slip half of Hold My Place: holding, resuming, and the paper slip that
// carries the held thought onward. None of it is needed to boot — the tracker
// and the two menu-state helpers stay eager in held-place.js, because a menu
// redraw asks whether a place is held on every pass and must not drag a lazy
// module back in.

function holdMyPlace() {
  const caret = heldPlaceCaret;
  const field = caret ? document.getElementById(caret.fieldId) : null;
  const frontWindow = document.querySelector(".window.is-active:not(.is-hidden)");
  const windowName = field ? caret.windowName : frontWindow?.dataset.window || "";
  if (!windowName) {
    setStatus(t("held_place_nowhere"));
    return;
  }

  // A note on the outgoing slip is a sentence the writer already typed once.
  // It goes to the Note Pad rather than under the new one, so that holding
  // your place twice in a row can never cost you a line.
  if (heldPlace?.note && typeof appendToNotePad === "function") appendToNotePad(heldPlace.note);

  heldPlace = {
    at: Date.now(),
    windowName,
    fieldId: field ? caret.fieldId : "",
    start: field ? caret.start : 0,
    end: field ? caret.end : 0,
    sentence: field ? heldPlaceSentence(field.value, caret.start) : "",
    note: "",
  };
  writeHeldPlace();
  showHeldPlaceSlip("held");
}

async function resumeMyPlace() {
  if (!heldPlace) return;
  const place = heldPlace;
  await openWindow(place.windowName);
  const field = place.fieldId ? document.getElementById(place.fieldId) : null;
  let landed = false;
  if (field instanceof HTMLTextAreaElement) {
    const start = Math.min(place.start, field.value.length);
    const end = Math.min(Math.max(place.end, start), field.value.length);
    field.focus({ preventScroll: true });
    field.setSelectionRange(start, end);
    // Say so when the sentence is gone. The window opening is not proof that
    // the thought is still in it — the project may have been switched, or the
    // paragraph rewritten, since you left.
    landed = !place.sentence || heldPlaceSentence(field.value, start) === place.sentence;
  }
  showHeldPlaceSlip(landed ? "back" : "moved");
}

function heldPlaceSlipRoot() {
  const existing = document.querySelector(".held-place-slip");
  if (existing) return existing;
  const slip = document.createElement("aside");
  slip.className = "held-place-slip is-hidden";
  slip.setAttribute("role", "status");
  slip.innerHTML = `<p class="held-place-slip-where"></p>
    <p class="held-place-slip-sentence"></p>
    <input class="held-place-slip-note" type="text" maxlength="240" data-i18n-placeholder="held_place_note_placeholder" />
    <div class="button-row held-place-slip-actions">
      <button class="btn" type="button" data-action="held-place-to-question-sheet" data-i18n="held_place_to_question_sheet"></button>
      <button class="btn" type="button" data-action="held-place-to-outline" data-i18n="held_place_to_outline"></button>
      <button class="btn default" type="button" data-action="held-place-dismiss" data-i18n="held_place_dismiss"></button>
    </div>`;
  document.querySelector(".desktop")?.append(slip);

  // Touching the line stops the clock. A slip that vanishes mid-sentence would
  // take the one thing it was there to catch.
  const note = slip.querySelector(".held-place-slip-note");
  const hold = () => clearTimeout(heldPlaceSlipTimer);
  note.addEventListener("focus", hold);
  note.addEventListener("input", hold);
  // Touching the line and then walking away is the ordinary case, not a
  // mistake. The clock restarts, and dismissing keeps whatever was typed.
  note.addEventListener("blur", () => {
    if (document.querySelector(".held-place-slip")?.dataset.kind !== "held") return;
    heldPlaceSlipTimer = setTimeout(dismissHeldPlaceSlip, heldPlaceQuietLife);
  });
  note.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      keepHeldPlaceNote();
      dismissHeldPlaceSlip();
    } else if (event.key === "Escape") {
      event.preventDefault();
      dismissHeldPlaceSlip();
    }
  });
  if (typeof applyLanguage === "function") applyLanguage();
  return slip;
}

// The slip never calls focus(): the caret has to stay exactly where the
// interruption found it, or the pause button becomes the interruption.
function showHeldPlaceSlip(kind) {
  const slip = heldPlaceSlipRoot();
  if (!slip || !heldPlace) return;
  clearTimeout(heldPlaceSlipTimer);
  slip.dataset.kind = kind;
  slip.classList.remove("is-hidden");
  const where = heldPlaceWhere();
  slip.querySelector(".held-place-slip-where").textContent = kind === "held"
    ? t("held_place_slip_held", where)
    : kind === "moved"
      ? t("held_place_slip_moved", where)
      : t("held_place_slip_back", where, heldPlaceAgo());
  // On the way out the slip shows the sentence you were in; on the way back it
  // shows the line you left, because that is the part you cannot reread from
  // the window itself.
  const promoting = kind !== "held" && !!heldPlace.note;
  const sentence = slip.querySelector(".held-place-slip-sentence");
  sentence.textContent = promoting ? heldPlace.note : heldPlace.sentence;
  sentence.hidden = !sentence.textContent;

  const note = slip.querySelector(".held-place-slip-note");
  note.hidden = kind !== "held";
  if (kind === "held") note.value = "";
  slip.querySelector(".held-place-slip-actions").hidden = kind === "held";
  slip.querySelectorAll(".held-place-slip-actions .btn").forEach((button) => {
    button.hidden = button.dataset.action !== "held-place-dismiss" && !promoting;
  });

  if (kind === "held") heldPlaceSlipTimer = setTimeout(dismissHeldPlaceSlip, heldPlaceQuietLife);
}

// Nothing typed is ever thrown away: an unplaced line goes to the Note Pad,
// which is what a 便签本 is for.
function keepHeldPlaceNote() {
  const slip = document.querySelector(".held-place-slip");
  const line = slip?.querySelector(".held-place-slip-note")?.value.trim() || "";
  if (!line || !heldPlace) return;
  heldPlace.note = line;
  writeHeldPlace();
}

function dismissHeldPlaceSlip() {
  clearTimeout(heldPlaceSlipTimer);
  const slip = document.querySelector(".held-place-slip");
  if (!slip) return;
  if (slip.dataset.kind === "held") keepHeldPlaceNote();
  // The bookmark is spent once you are back. A leftover note is not: it goes
  // to the Note Pad instead of quietly disappearing with the slip.
  if (slip.dataset.kind !== "held") {
    if (heldPlace?.note && typeof appendToNotePad === "function") appendToNotePad(heldPlace.note);
    heldPlace = null;
    writeHeldPlace();
  }
  slip.classList.add("is-hidden");
}

// The thought that arrived out of order does not have to wait for its station.
// It lands now and is placed later — which is the whole difference between a
// route you follow and a route that follows you.
function promoteHeldPlace(target) {
  const line = heldPlace?.note?.trim();
  if (!line) return;
  const field = document.getElementById(target === "outline" ? "outline-content" : "question-sheet-body");
  if (!field) {
    setStatus(t("held_place_promote_unavailable"));
    return;
  }
  const back = heldPlace.fieldId ? document.getElementById(heldPlace.fieldId) : null;
  const caret = heldPlace.start;
  const entry = target === "outline" ? `\n\n## ${line}` : `\n\n- ${line}`;
  field.value = `${field.value.trimEnd()}${entry}`.trimStart();
  field.dispatchEvent(new Event("input", { bubbles: true }));
  heldPlace = null;
  writeHeldPlace();
  dismissHeldPlaceSlip();
  // Filing a line is not a request to be taken somewhere else. The writer just
  // asked to come back here, and opening the Question Sheet over the draft
  // would undo the return in the same gesture that rewarded it.
  if (back instanceof HTMLTextAreaElement) {
    const at = Math.min(caret, back.value.length);
    back.focus({ preventScroll: true });
    back.setSelectionRange(at, at);
  }
  setStatus(t(target === "outline" ? "held_place_sent_outline" : "held_place_sent_question_sheet"));
}

window.AISystem6HeldPlaceSlipLoaded = true;
