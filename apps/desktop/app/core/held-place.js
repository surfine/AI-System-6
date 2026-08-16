// Hold My Place — the desk's pause button.
//
// The working session already survives a reload: it puts the windows back and
// the caret with them. What it cannot survive is a person. You are two
// sentences into Section 3, someone knocks, and twenty minutes later the desk
// is exactly as you left it and you still have no idea what you were about to
// say.
//
// So this is one command, and it lives on the menu bar because the menu bar
// belongs to the whole desk rather than to any one window. The Control Strip's
// Your Place module is the same command with a face: one tile that says whether
// anything is held, holds or returns from its menu, and carries Hold That
// Thought beside them, because they are one movement and deserve one home. It
// is a second door, never the only one — Balloon Help and Key Caps both name
// the menu rows. It costs nothing to
// run: it takes no focus, opens nothing, and asks for nothing. It writes down
// which window, which field, which character, and the sentence that surrounded
// it. Then a slip appears in the corner with one empty line on it. Leave a
// word if you have one, walk away if you do not — and walking away is the case
// that matters, because a pause button you have to fill in is not a pause
// button.
//
// Coming back is the other command, and it deliberately restores less than it
// could. It opens that window and puts the caret back in that sentence, and
// leaves the rest of the desk alone: by the time you return you are often in
// the middle of something else, and hauling the old desk back over it would be
// a second interruption wearing the costume of a rescue.
//
// Contract: tests/features/held-place.test.mjs

const heldPlaceStorageKey = "heldPlace:v1";
// The slip only counts down while nobody is writing on it.
const heldPlaceQuietLife = 12000;
const heldPlaceSentenceLimit = 90;

let heldPlace = null;
let heldPlaceCaret = null;
let heldPlaceSlipTimer = null;

function readHeldPlace() {
  try {
    const stored = JSON.parse(localStorage.getItem(heldPlaceStorageKey) || "null");
    heldPlace = stored && typeof stored.windowName === "string" ? stored : null;
  } catch {
    heldPlace = null;
  }
  return heldPlace;
}

function writeHeldPlace() {
  try {
    if (heldPlace) localStorage.setItem(heldPlaceStorageKey, JSON.stringify(heldPlace));
    else localStorage.removeItem(heldPlaceStorageKey);
  } catch {}
  if (typeof updateMenuState === "function") updateMenuState();
  // The Control Strip's Your Place tile reads this same record, and a hold can
  // arrive from the key equivalent or from the slip putting itself away — paths
  // the strip's own click never sees. One module refresh, not a whole redraw.
  window.AISystem6ControlStrip?.refreshStrip?.("heldPlace");
}

function hasHeldPlace() {
  return !!heldPlace;
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

function heldPlaceWhere() {
  return heldPlace ? heldPlaceWindowLabel(heldPlace.windowName) : "";
}

function heldPlaceAgo() {
  const minutes = Math.max(0, Math.round((Date.now() - (heldPlace?.at || 0)) / 60000));
  if (minutes < 1) return t("held_place_just_now");
  if (minutes < 60) return t("held_place_minutes_ago", minutes);
  return t("held_place_hours_ago", Math.round(minutes / 60));
}

// What the menu row says when there is somewhere to go back to. A row reading
// "Where I Left Off" tells you nothing; one reading "Back to Section Drafts" is
// the reminder itself, before you even click it. How long ago stays off the
// row — the Apple menu is 190px wide and a clipped reminder is no reminder.
// The slip says it on arrival, which is when there is time to read it.
function heldPlaceResumeLabel() {
  return heldPlace ? t("held_place_resume_at", heldPlaceWhere()) : t("held_place_resume");
}


function installHeldPlaceTracking() {
  readHeldPlace();
  document.addEventListener("selectionchange", noteHeldPlaceCaret);
  document.addEventListener("input", noteHeldPlaceCaret, true);
}
