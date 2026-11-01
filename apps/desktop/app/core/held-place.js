// Hold That Thought — the capture half, which has to be here at boot.
//
// You are two sentences into Section 3, someone knocks, and twenty minutes
// later the desk is exactly as you left it and you still have no idea what you
// were about to say. The working session restores windows; it cannot restore a
// person.
//
// Apple's Hold That Thought shortcut answers this by capturing first and asking
// second: it grabs the screen, the calendar, the page you were on and the
// clipboard, and only then asks what you were doing. This is that, in the
// desk's own materials — where you were, what you were reading, what was on the
// clipboard — and the two questions come after, already filled in around.
//
// Two halves, and the split is not arbitrary. Capture and the menu-state
// helpers live here because a menu redraw asks whether anything is held on
// every pass and must not drag a lazy module back in. The window, the pile and
// the way back live in features/stickies.js — a held thought is a sticky of
// kind "held" — which costs nothing until the key is pressed.
//
// There is no screenshot. A browser cannot photograph the screen without a
// permission prompt, and a permission prompt in the middle of an interruption
// IS the interruption. The desk knows its own state instead, which is the
// better half of the trade: "back to Section Drafts" is a button you press, and
// a picture is something you squint at.
//
// The original is kept, taken apart, and compared against ours in
// internal/evidence/hold-that-thought/ — read that before changing what this
// captures or how the two modes divide.
//
// Contract: tests/features/stickies.test.mjs

// Held thoughts are stickies now (features/stickies.js): kind "held", the
// captured context under `held`. The pile lives in deskStickies, which rides
// the desk settings, so a menu redraw reads it without the lazy window.
//
// The two localStorage keys the pile used to live under are read, never
// written: the Stickies migration copies them in once and leaves them for one
// version (owner ruling 2026-10-31).
const heldThoughtsStorageKey = "heldThoughts:v1";
// The single-record key this replaced. Read once, on the way in.
const heldPlaceLegacyStorageKey = "heldPlace:v1";
const heldPlaceSentenceLimit = 90;
const heldThoughtClipboardLimit = 120;
// Two presses in a row are one interruption, not two. A capture nobody has
// written on yet, from the same window, inside this window of time, is
// refreshed rather than stacked.
const heldThoughtRestackWindow = 60000;

// Every sticky on the desk, and whether the three old piles were copied in.
let deskStickies = [];
let stickiesMigrated = false;
// The legacy pile as it was read at boot: the migration's input, nothing else.
let heldThoughts = [];
let heldPlaceCaret = null;

function readHeldThoughts() {
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const stored = read(heldThoughtsStorageKey);
  // One desk, one migration: the old pause button kept a single place, and a
  // single place is a pile of one.
  const legacy = read(heldPlaceLegacyStorageKey);
  heldThoughts = (Array.isArray(stored) ? stored : legacy ? [legacy] : []).filter((record) => record?.where || record?.windowName);
  return heldThoughts;
}

// Newest first, and only the ones still waiting to be picked up.
function getHeldThoughts() {
  return deskStickies.filter((sticky) => sticky.kind === "held" && sticky.held && !sticky.done)
    .sort((a, b) => b.held.at - a.held.at);
}

function latestHeldThought() {
  return getHeldThoughts()[0] || null;
}

function hasHeldPlace() {
  return !!latestHeldThought();
}

// Only prose surfaces are worth returning to, and only ones with an id can be
// found again after a reload. A URL field is not a place you were thinking.
function noteHeldPlaceCaret() {
  const field = document.activeElement;
  if (!(field instanceof HTMLTextAreaElement) || !field.id) return;
  const windowName = field.closest(".window")?.dataset.window;
  if (!windowName) return;
  heldPlaceCaret = {
    windowName,
    fieldId: field.id,
    start: field.selectionStart ?? 0,
    end: field.selectionEnd ?? field.selectionStart ?? 0,
  };
}

// The sentence you were inside, not the paragraph: a paragraph is too much to
// read at a glance and a word is not enough to recognise. Both punctuation
// families end a sentence, because both languages are written here.
function heldPlaceSentence(text, caret) {
  const before = String(text || "").slice(0, caret);
  const opens = ["\n", "。", "！", "？", "…", ".", "!", "?"]
    .map((mark) => before.lastIndexOf(mark) + 1);
  const rest = String(text || "").slice(Math.max(0, ...opens));
  const stop = rest.search(/[。！？\n]|[.!?](?=\s|$)/);
  const sentence = (stop === -1 ? rest : rest.slice(0, stop + 1)).trim();
  return sentence.length > heldPlaceSentenceLimit
    ? `${sentence.slice(0, heldPlaceSentenceLimit)}…`
    : sentence;
}

// The window says its own name. A lookup table would drift the first time a
// window was renamed in one language and not the other.
function heldPlaceWindowLabel(windowName) {
  const win = typeof getWindow === "function" ? getWindow(windowName) : null;
  return win?.querySelector(".title-bar h2")?.textContent?.trim() || windowName || "";
}

function heldThoughtWhere(thought = latestHeldThought()) {
  if (!thought?.held) return "";
  return heldPlaceWindowLabel(thought.held.where) || thought.held.title;
}

function heldPlaceWhere() {
  return heldThoughtWhere();
}

function heldThoughtAgo(thought = latestHeldThought()) {
  const minutes = Math.max(0, Math.round((Date.now() - (thought?.held?.at || 0)) / 60000));
  if (minutes < 1) return t("held_place_just_now");
  if (minutes < 60) return t("held_place_minutes_ago", minutes);
  return t("held_place_hours_ago", Math.round(minutes / 60));
}

function heldPlaceAgo() {
  return heldThoughtAgo();
}

// What the menu row says when there is somewhere to go back to. A row reading
// "Where I Left Off" tells you nothing; one reading "Back to Section Drafts" is
// the reminder itself, before you even click it. How long ago stays off the
// row — the Apple menu is 190px wide and a clipped reminder is no reminder.
function heldPlaceResumeLabel() {
  return hasHeldPlace() ? t("held_place_resume_at", heldPlaceWhere()) : t("held_place_resume");
}

// Everything the desk can honestly say about this moment. Anything it cannot
// observe is left out of the record entirely rather than stored empty: a line
// the accessory does not print is a line it never claimed.
function captureHeldContext() {
  const context = { routeStop: "", reading: "", clipboard: "" };
  if (typeof currentWritingRouteStop === "function") context.routeStop = currentWritingRouteStop() || "";

  // The source open in Reader is this desk's answer to "the webpage you were
  // on". Reader closed means no reading line, not an empty one.
  const readerOpen = typeof getWindow === "function" && !getWindow("reader")?.classList.contains("is-hidden");
  if (readerOpen && typeof activeReaderTab === "function") {
    const tab = activeReaderTab();
    context.reading = String(tab?.title || tab?.name || "").trim();
  }

  // Apple's shortcut reads the next hour of the calendar; this desk's calendar
  // is the handoff date the writer typed on the mounted project's plan. Kept
  // verbatim — "还有 2 天" is worked out when the thought is read, not frozen
  // at the moment it was caught. No plan date means no line.
  // One line on purpose: this file boots with the desk, and the floppy counts it.
  const handoff = getActiveProject()?.clioProject?.tasks?.projectCd;
  if (handoff?.date && !handoff.done) context.handoff = handoff.date;

  const clipboardField = document.querySelector("#clipboard-text");
  const clipped = String(clipboardField?.value || "").trim().replace(/\s+/g, " ");
  if (clipped) {
    context.clipboard = clipped.length > heldThoughtClipboardLimit
      ? `${clipped.slice(0, heldThoughtClipboardLimit)}…`
      : clipped;
  }
  return context;
}

// Read before anything moves. Once the accessory opens, the active element is
// its own field and the answer would be the accessory itself.
function currentHeldPosition() {
  const caret = heldPlaceCaret;
  const field = caret ? document.getElementById(caret.fieldId) : null;
  const inField = field instanceof HTMLTextAreaElement && !field.closest(".window")?.classList.contains("is-hidden");
  const frontWindow = document.querySelector(".window.is-active:not(.is-hidden):not(.is-collapsed)");
  const windowName = inField ? caret.windowName : frontWindow?.dataset.window || "";
  if (!windowName || windowName === "todo") return null;
  return {
    where: windowName,
    title: heldPlaceWindowLabel(windowName),
    fieldId: inField ? caret.fieldId : "",
    start: inField ? caret.start : 0,
    end: inField ? caret.end : 0,
    sentence: inField ? heldPlaceSentence(field.value, caret.start) : "",
  };
}

// One key from anywhere. The capture is written before the window is asked for,
// so the record survives even if opening the accessory fails — and so Esc, one
// keystroke later, costs nothing. It lands as a held sticky, in the Held view.
async function holdThatThought() {
  const position = currentHeldPosition();
  if (!position) {
    setStatus(t("held_place_nowhere"));
    return;
  }
  const previous = latestHeldThought();
  const now = Date.now();
  const restack = previous
    && previous.held.where === position.where
    && !previous.text.trim()
    && !String(previous.held.next || "").trim()
    && now - previous.held.at < heldThoughtRestackWindow;
  const at = new Date(now).toISOString();
  const thought = {
    id: restack ? previous.id : `held-${now.toString(36)}`,
    kind: "held",
    text: "",
    done: false,
    colour: "yellow",
    createdAt: restack ? previous.createdAt : at,
    updatedAt: at,
    pin: null,
    held: { ...position, ...captureHeldContext(), at: now, next: "" },
  };
  if (restack) deskStickies[deskStickies.indexOf(previous)] = thought;
  else deskStickies.unshift(thought);
  saveDeskState();
  if (typeof updateMenuState === "function") updateMenuState();
  // The Control Strip's Your Place tile reads this same pile, and a capture can
  // arrive from the key equivalent or from a phone tap — paths the strip's own
  // click never sees. One module refresh, not a whole redraw.
  window.AISystem6ControlStrip?.refreshStrip?.("heldPlace");

  // A desk that never loaded cannot keep it; say so rather than "caught".
  setStatus(t(deskPersistenceWritable ? "held_thought_caught" : "held_thought_save_failed", position.title));
  await ensureTodoDaModule();
  await openStickies("held", thought.id, true);
}

function installHeldPlaceTracking() {
  readHeldThoughts();
  document.addEventListener("selectionchange", noteHeldPlaceCaret);
  document.addEventListener("input", noteHeldPlaceCaret, true);
}
