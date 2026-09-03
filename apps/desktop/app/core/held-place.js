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
// the way back live in features/hold-that-thought.js, which costs nothing until
// the key is pressed.
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
// Contract: tests/features/held-place.test.mjs

const heldThoughtsStorageKey = "heldThoughts:v1";
// The single-record key this replaced. Read once, on the way in.
const heldPlaceLegacyStorageKey = "heldPlace:v1";
// Set once the Note Pad has handed over its interruption slips.
const heldThoughtsCarriedKey = "heldThoughts:carried";
const heldPlaceSentenceLimit = 90;
const heldThoughtClipboardLimit = 120;
// Two presses in a row are one interruption, not two. A capture nobody has
// written on yet, from the same window, inside this window of time, is
// refreshed rather than stacked.
const heldThoughtRestackWindow = 60000;

let heldThoughts = [];
let heldPlaceCaret = null;

function normalizeHeldThought(record) {
  if (!record || typeof record !== "object") return null;
  const where = String(record.where || record.windowName || "");
  if (!where) return null;
  return {
    id: String(record.id || `ht-${record.at || Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    at: Number.isFinite(record.at) ? record.at : Date.now(),
    where,
    title: String(record.title || ""),
    fieldId: String(record.fieldId || ""),
    start: Number.isFinite(record.start) ? record.start : 0,
    end: Number.isFinite(record.end) ? record.end : 0,
    sentence: String(record.sentence || ""),
    routeStop: String(record.routeStop || ""),
    reading: String(record.reading || ""),
    clipboard: String(record.clipboard || ""),
    doing: String(record.doing ?? record.note ?? ""),
    next: String(record.next || ""),
  };
}

function readHeldThoughts() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(heldThoughtsStorageKey) || "null");
  } catch {
    stored = null;
  }
  if (Array.isArray(stored)) {
    heldThoughts = stored.map(normalizeHeldThought).filter(Boolean);
    return heldThoughts;
  }
  // One desk, one migration: the old pause button kept a single place, and a
  // single place is a pile of one.
  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem(heldPlaceLegacyStorageKey) || "null");
  } catch {
    legacy = null;
  }
  const carried = normalizeHeldThought(legacy);
  heldThoughts = carried ? [carried] : [];
  if (carried) writeHeldThoughts();
  return heldThoughts;
}

function writeHeldThoughts() {
  let persisted = true;
  try {
    if (heldThoughts.length) localStorage.setItem(heldThoughtsStorageKey, JSON.stringify(heldThoughts));
    else localStorage.removeItem(heldThoughtsStorageKey);
    localStorage.removeItem(heldPlaceLegacyStorageKey);
  } catch (error) {
    // lane-errors: this used to swallow the failure outright, so a full or
    // blocked localStorage (private browsing, quota) left the in-memory
    // array updated while nothing durable existed — the caller showed
    // "Held" and the thought was gone on reload. holdThatThought() below
    // checks this return value and says so instead.
    console.warn("Hold My Place: could not persist held thoughts", error);
    persisted = false;
  }
  if (typeof updateMenuState === "function") updateMenuState();
  // The Control Strip's Your Place tile reads this same pile, and a capture can
  // arrive from the key equivalent or from a phone tap — paths the strip's own
  // click never sees. One module refresh, not a whole redraw.
  window.AISystem6ControlStrip?.refreshStrip?.("heldPlace");
  return persisted;
}

function getHeldThoughts() {
  return heldThoughts;
}

function latestHeldThought() {
  return heldThoughts[0] || null;
}

function hasHeldPlace() {
  return heldThoughts.length > 0;
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
  if (!thought) return "";
  return heldPlaceWindowLabel(thought.where) || thought.title;
}

function heldPlaceWhere() {
  return heldThoughtWhere();
}

function heldThoughtAgo(thought = latestHeldThought()) {
  const minutes = Math.max(0, Math.round((Date.now() - (thought?.at || 0)) / 60000));
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
  if (!windowName || windowName === "holdThought") return null;
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
// keystroke later, costs nothing.
async function holdThatThought() {
  const position = currentHeldPosition();
  if (!position) {
    setStatus(t("held_place_nowhere"));
    return;
  }
  const previous = latestHeldThought();
  const restack = previous
    && previous.where === position.where
    && !previous.doing.trim()
    && !previous.next.trim()
    && Date.now() - previous.at < heldThoughtRestackWindow;

  const thought = normalizeHeldThought({
    ...position,
    ...captureHeldContext(),
    id: restack ? previous.id : "",
    at: Date.now(),
  });
  if (restack) heldThoughts[0] = thought;
  else heldThoughts.unshift(thought);
  const persisted = writeHeldThoughts();

  setStatus(persisted ? t("held_thought_caught", position.title) : t("held_thought_save_failed"));
  await openWindow("holdThought");
  if (typeof focusHeldThoughtCapture === "function") focusHeldThoughtCapture();
}

// Note Pad carried the interruption slips because there was nowhere else to
// put them. There is now, and the product is emphatic that Scrapbook is not a
// notepad — by the same reasoning a Note Pad is not an interruption log.
//
// A page only ever carried an origin if Hold That Thought put it there: the New
// Slip button stamps the window you started from, and it returns nothing while
// the Note Pad itself is in front, which is the only time you can press it. So
// the origin is a reliable mark, and pages you typed by hand stay where they
// are. Run once, because New Slip may legitimately stamp an origin later.
function carryNotePadSlipsToHeldThoughts(pages = []) {
  let done = false;
  try {
    done = localStorage.getItem(heldThoughtsCarriedKey) === "1";
  } catch {
    done = true;
  }
  if (done) return pages;

  const kept = [];
  const carried = [];
  pages.forEach((page) => {
    const from = page?.from;
    if (!from?.window) {
      kept.push(page);
      return;
    }
    carried.push(normalizeHeldThought({
      at: Date.parse(from.at || "") || Date.now(),
      where: from.window,
      title: from.title || "",
      start: Number.isFinite(from.caret) ? from.caret : 0,
      end: Number.isFinite(from.caret) ? from.caret : 0,
      doing: String(page.text || ""),
    }));
  });
  if (carried.length) {
    // Newest first, matching how the pile is read everywhere else.
    heldThoughts = [...carried, ...heldThoughts].sort((a, b) => b.at - a.at);
    writeHeldThoughts();
  }
  try {
    localStorage.setItem(heldThoughtsCarriedKey, "1");
  } catch {}
  // A pad with no pages still shows one empty slip, which is what it opens as.
  return kept.length ? kept : [{ text: "", from: null }];
}

function installHeldPlaceTracking() {
  readHeldThoughts();
  document.addEventListener("selectionchange", noteHeldPlaceCaret);
  document.addEventListener("input", noteHeldPlaceCaret, true);
}
