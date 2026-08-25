// Feature module: hold-that-thought — the accessory the capture opens into.
//
// Lazy on purpose. held-place.js writes the record before this file is asked
// for, so the thought is safe whether or not the window ever appears; this is
// only the surface you look at afterwards.
//
// Two modes on one small window, because the object has two moments and they
// are not the same size. Catching is four lines of context and two questions.
// Picking up is a pile with a list on it. The mode row is the Alarm Clock's
// figure — equal cells, dividers between, the current one inverted — carried
// over as a layout, not as art: these two modes are verbs with no native glyph
// to copy, and inventing 1-bit icons for them would be drawing from memory.
//
// The window takes the keyboard when it opens, which is a deliberate reversal.
// Apple's shortcut prompts too, and a prompt you must dismiss is a prompt you
// actually answer. Escape is what makes that affordable: it leaves at once and
// the capture is already saved. A page you wrote nothing on is still a complete
// thought — where you were, what you were reading, what was on the clipboard.
//
// Apple's shortcut, torn apart action by action:
// internal/evidence/hold-that-thought/apple-shortcut-teardown.md
//
// Contract: tests/features/held-place.test.mjs

// holdThought's markup lived in index.html, downloaded by every boot for a
// window this module already loads on demand. Built here at module eval,
// before anything below queries its own elements. openWindow() installs
// the grow box.
function installHoldThoughtWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="holdThought"]')) return;
  window.AISystem6ApplicationShell.createWindow({
    windowName: "holdThought",
    windowClass: "hold-thought-window",
    labelledBy: "hold-thought-title",
    titleKey: "hold_that_thought",
    title: "Hold That Thought",
    beforePaneHtml: `
        <div class="hold-thought-modes" role="tablist" data-i18n-aria-label="held_thought_modes" aria-label="Hold That Thought modes">
          <button class="hold-thought-mode is-active" type="button" role="tab" aria-selected="true" data-hold-thought-mode="catch" data-action="hold-thought-catch" data-i18n="held_thought_mode_catch">Hold</button>
          <button class="hold-thought-mode" type="button" role="tab" aria-selected="false" tabindex="-1" data-hold-thought-mode="pile" data-action="hold-thought-pile" data-i18n="held_thought_mode_pile">Pick Up</button>
        </div>`,
    paneClass: "hold-thought-pane",
    paneHtml: `
          <ul class="hold-thought-list" id="hold-thought-list" hidden></ul>
          <dl class="hold-thought-context" id="hold-thought-context" hidden></dl>
          <label class="visually-hidden" for="hold-thought-doing" data-i18n="held_thought_doing">Where were you?</label>
          <!-- data-dictation="off" on both: the floating field button anchors above a
               field it cannot sit beside, and in a 340px accessory that puts it
               straight over the captured context — which is the one thing here
               worth reading. Dictation stays available through its own pad. -->
          <input class="hold-thought-line" id="hold-thought-doing" type="text" maxlength="240" autocomplete="off" data-dictation="off" data-i18n-placeholder="held_thought_doing" placeholder="Where were you?" />
          <label class="visually-hidden" for="hold-thought-next" data-i18n="held_thought_next">First thing back?</label>
          <input class="hold-thought-line" id="hold-thought-next" type="text" maxlength="240" autocomplete="off" data-dictation="off" data-i18n-placeholder="held_thought_next" placeholder="First thing back?" />
          <div class="button-row hold-thought-actions">
            <button class="btn" type="button" id="hold-thought-remove" data-action="hold-thought-remove" data-i18n="delete" hidden>Delete</button>
            <span class="spacer"></span>
            <button class="btn default" type="button" id="hold-thought-back" data-action="resume-my-place" hidden>Back</button>
            <button class="btn default" type="button" id="hold-thought-done" data-action="hold-thought-done" data-i18n="held_thought_done">Done</button>
          </div>`,
  });
}

installHoldThoughtWindow();
let heldThoughtMode = "catch";
let selectedHeldThoughtId = "";
let holdThoughtParts = null;

// Every part is found from the window itself. A new control here cannot take
// the boot down by drifting out of one of the three places a DOM handle would
// otherwise have to be declared.
function holdThoughtFields() {
  if (holdThoughtParts?.pane?.isConnected) return holdThoughtParts;
  const root = document.querySelector('[data-window="holdThought"]');
  if (!root) return null;
  holdThoughtParts = {
    root,
    pane: root.querySelector(".hold-thought-pane"),
    modes: root.querySelectorAll("[data-hold-thought-mode]"),
    list: root.querySelector("#hold-thought-list"),
    context: root.querySelector("#hold-thought-context"),
    doing: root.querySelector("#hold-thought-doing"),
    next: root.querySelector("#hold-thought-next"),
    remove: root.querySelector("#hold-thought-remove"),
    back: root.querySelector("#hold-thought-back"),
    done: root.querySelector("#hold-thought-done"),
  };
  return holdThoughtParts.pane ? holdThoughtParts : null;
}

function selectedHeldThought() {
  const thoughts = getHeldThoughts();
  return thoughts.find((thought) => thought.id === selectedHeldThoughtId) || thoughts[0] || null;
}

function formatHeldThoughtTime(at) {
  const date = at ? new Date(at) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const sameDay = new Date().toDateString() === date.toDateString();
  const locale = currentLanguage === "zh" ? "zh-CN" : "en-US";
  return sameDay
    ? date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

// A row per captured line, and only for lines that were really captured. An
// absent source is absent from the window: the desk never prints an empty
// "reading" row to prove it looked.
function renderHeldThoughtContext(thought) {
  const parts = holdThoughtFields();
  if (!parts) return;
  const rows = [
    [t("held_thought_where"), thought ? heldThoughtWhere(thought) : ""],
    [t("held_thought_sentence"), thought?.sentence || ""],
    [t("held_thought_reading"), thought?.reading || ""],
    [t("held_thought_clipboard"), thought?.clipboard || ""],
  ].filter(([, value]) => !!value);

  parts.context.replaceChildren();
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    parts.context.append(term, detail);
  });
  parts.context.hidden = !rows.length;
}

function renderHeldThoughtList() {
  const parts = holdThoughtFields();
  if (!parts) return;
  const thoughts = getHeldThoughts();
  parts.list.replaceChildren();
  thoughts.forEach((thought) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `hold-thought-row${thought.id === selectedHeldThought()?.id ? " is-current" : ""}`;
    button.dataset.heldThought = thought.id;
    if (thought.id === selectedHeldThought()?.id) button.setAttribute("aria-current", "true");
    const where = document.createElement("b");
    // The line you wrote names the row better than the window does, when there
    // is one. Otherwise the place is the only name it has.
    where.textContent = thought.doing.trim() || heldThoughtWhere(thought);
    const when = document.createElement("small");
    when.textContent = formatHeldThoughtTime(thought.at);
    button.append(where, when);
    row.append(button);
    parts.list.append(row);
  });
  parts.list.hidden = !thoughts.length;
}

function renderHoldThought() {
  const parts = holdThoughtFields();
  if (!parts) return;
  const thoughts = getHeldThoughts();
  // A pile of nothing has nothing to pick up from. The window falls back to the
  // catching side rather than showing an empty list with no way out of it.
  if (heldThoughtMode === "pile" && !thoughts.length) heldThoughtMode = "catch";
  const thought = selectedHeldThought();
  const pile = heldThoughtMode === "pile";

  parts.modes.forEach((button) => {
    const isCurrent = button.dataset.holdThoughtMode === heldThoughtMode;
    button.classList.toggle("is-active", isCurrent);
    button.setAttribute("aria-selected", isCurrent ? "true" : "false");
    button.tabIndex = isCurrent ? 0 : -1;
  });

  parts.root.classList.toggle("is-picking-up", pile);
  if (pile) renderHeldThoughtList();
  else parts.list.hidden = true;

  renderHeldThoughtContext(thought);
  parts.doing.value = thought?.doing || "";
  parts.next.value = thought?.next || "";
  parts.doing.disabled = !thought;
  parts.next.disabled = !thought;

  // One default per moment. Catching ends with "done"; picking up ends by
  // going back, which is the only place a thought can be sent.
  parts.remove.hidden = !pile || !thought;
  parts.back.hidden = !pile || !thought;
  parts.done.hidden = pile;
  if (thought) parts.back.textContent = t("held_place_resume_at", heldThoughtWhere(thought));
}

function setHeldThoughtMode(mode) {
  heldThoughtMode = mode === "pile" ? "pile" : "catch";
  if (heldThoughtMode === "catch") selectedHeldThoughtId = "";
  renderHoldThought();
  if (heldThoughtMode === "catch") focusHeldThoughtCapture();
}

function selectHeldThought(id) {
  syncHeldThoughtFields();
  selectedHeldThoughtId = String(id || "");
  renderHoldThought();
}

// Typed lines belong to the thought, not to the window. They are written back
// on every change so that closing the window — or pressing Escape halfway
// through the second question — never costs the first one.
function syncHeldThoughtFields() {
  const parts = holdThoughtFields();
  const thought = selectedHeldThought();
  if (!parts || !thought) return;
  const doing = parts.doing.value;
  const next = parts.next.value;
  if (thought.doing === doing && thought.next === next) return;
  thought.doing = doing;
  thought.next = next;
  writeHeldThoughts();
}

function focusHeldThoughtCapture() {
  const parts = holdThoughtFields();
  if (!parts || heldThoughtMode !== "catch") return;
  parts.doing.focus();
  parts.doing.select();
}

// The way back, and the only way out. The window opens and the caret returns to
// the character you left. A window that no longer holds that field still opens:
// being back in the right room is most of the point, and the desk says so when
// the sentence itself has moved on.
async function resumeMyPlace() {
  const thought = selectedHeldThought();
  if (!thought) return;
  syncHeldThoughtFields();
  closeWindow("holdThought");
  await openWindow(thought.where);
  const field = thought.fieldId ? document.getElementById(thought.fieldId) : null;
  if (!(field instanceof HTMLTextAreaElement)) {
    setStatus(t("held_place_slip_back", heldThoughtWhere(thought), heldThoughtAgo(thought)));
    return;
  }
  const start = Math.min(thought.start, field.value.length);
  const end = Math.min(Math.max(thought.end, start), field.value.length);
  field.focus({ preventScroll: true });
  field.setSelectionRange(start, end);
  const landed = !thought.sentence || heldPlaceSentence(field.value, start) === thought.sentence;
  setStatus(landed
    ? t("held_place_slip_back", heldThoughtWhere(thought), heldThoughtAgo(thought))
    : t("held_place_slip_moved", heldThoughtWhere(thought)));
}

// Into the Trash with everything else, so it can be pulled back out. A thought
// is a few dozen characters; what makes it worth a Trash record is that you
// were the one who decided it was finished with.
//
// No setStatus: this accessory has no status host, so a message here would fall
// through to ClioTalk's info bar and be invisible. The row leaving the list is
// the feedback, and the Trash is where it went.
function removeHeldThought() {
  const thought = selectedHeldThought();
  if (!thought) return;
  const thoughts = getHeldThoughts();
  const index = thoughts.indexOf(thought);
  if (index === -1) return;
  const lines = [thought.doing, thought.next, thought.sentence].map((line) => line.trim()).filter(Boolean);
  trashItems.unshift({
    projectId: activeProjectId,
    title: thought.doing.trim() || heldThoughtWhere(thought),
    body: lines.join("\n\n"),
    originalPath: t("hold_that_thought"),
    originalType: "heldThought",
    originalData: thought,
  });
  thoughts.splice(index, 1);
  selectedHeldThoughtId = "";
  writeHeldThoughts();
  renderHoldThought();
  saveDeskState();
}

function mountHoldThoughtRuntime() {
  const parts = holdThoughtFields();
  if (!parts || parts.root.dataset.holdThoughtWired === "true") {
    renderHoldThought();
    return;
  }
  parts.root.dataset.holdThoughtWired = "true";

  [parts.doing, parts.next].forEach((field) => {
    field.addEventListener("input", syncHeldThoughtFields);
    field.addEventListener("change", syncHeldThoughtFields);
  });
  // Enter moves on rather than submitting: the second question is the one
  // people forget, so the first field should hand over to it.
  parts.doing.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    parts.next.focus();
  });
  // Escape is the whole reason this window may take the keyboard.
  parts.root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    syncHeldThoughtFields();
    closeWindow("holdThought");
  });
  parts.list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-held-thought]");
    if (row) selectHeldThought(row.dataset.heldThought);
  });
  renderHoldThought();
}

window.AISystem6Runtime?.registerApplication({
  id: "holdThought",
  windowName: "holdThought",
  mount: () => mountHoldThoughtRuntime(),
  restore: () => mountHoldThoughtRuntime(),
  commands: {
    "open-hold-thought": { handler: () => openWindow("holdThought"), isAvailable: () => true },
    "hold-thought-catch": { handler: () => setHeldThoughtMode("catch"), isAvailable: () => true },
    "hold-thought-pile": { handler: () => setHeldThoughtMode("pile"), isAvailable: () => hasHeldPlace() },
    "hold-thought-remove": { handler: () => removeHeldThought(), isAvailable: () => hasHeldPlace() },
    "hold-thought-done": {
      handler: () => { syncHeldThoughtFields(); closeWindow("holdThought"); },
      isAvailable: () => true,
    },
  },
});

window.AISystem6HoldThatThoughtLoaded = true;
