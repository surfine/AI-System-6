import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("held-place");
const html = read("index.html");
// Two files by design: the tracker and the two menu-state helpers boot, while
// the slip that holds, resumes and carries a thought onward loads on demand.
const heldPlaceCore = read("app/core/held-place.js");
const heldPlaceSlip = read("app/core/held-place-slip.js");
const heldPlace = `${heldPlaceCore}\n${heldPlaceSlip}`;
const manifest = read("tooling/runtime-manifest.mjs");
const actions = read("app/core/actions.js");
const windows = read("app/core/window-manager.js");
const wireup = read("app/core/wireup.js");
const stripModules = read("app/features/control-strip-modules.js");
const foundation = read("styles/00-foundation.css");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

// Commands and one Control Strip tile, not a seventh Desk Accessory: opening an
// accessory to record an interruption is itself the interruption.
test.assertIncludes(html, 'data-action="hold-my-place"', "the Apple menu carries the hold command");
test.assertIncludes(html, 'data-action="resume-my-place"', "the Apple menu carries the way back");
test.assertIncludes(html, 'data-action="hold-that-thought"', "the Apple menu carries the passing thought in the same group");
test.assertNotIncludes(html, 'data-window="heldPlace"', "holding a place opens no window of its own");
test.assertNotIncludes(heldPlace, 'windowAppMap', "the slip is desk furniture, not an application window");

// --- One home on the desk ---------------------------------------------------
//
// Holding a place and holding a thought are one movement, so they share one
// object: the Control Strip's Your Place module. It registers as an ordinary
// first-party descriptor — there is no second registration mechanism — and it
// owns no state and no command, so the tile can never disagree with the menu.
test.assertIncludes(stripModules, 'id: "heldPlace"', "the Control Strip carries one Your Place module");
test.assertIncludes(stripModules, 'labelKey: "control_strip_held_place"', "the tile is named, in both languages, from the shared table");
test.assertIncludes(stripModules, "controlStripBuiltinModules", "the module is one of the first-party descriptors, not a private registry");
test.assertIncludes(stripModules, 'run: () => handleAction("hold-my-place")', "the tile holds a place through the existing command");
test.assertIncludes(stripModules, 'run: () => handleAction("resume-my-place")', "and returns through the existing command");
test.assertIncludes(stripModules, 'run: () => handleAction("hold-that-thought")', "and the same tile carries the passing thought");
test.assertNotMatches(
  stripModules.slice(stripModules.indexOf('id: "heldPlace"')),
  /localStorage|heldPlaceStorageKey|showHeldPlaceSlip/,
  "the tile reads the held place; it never writes or re-implements one",
);
test.assertIncludes(stripModules, "hasHeldPlace()", "the tile says whether a place is actually held");
test.assertIncludes(stripModules, "heldPlaceResumeLabel()", "the way back names the place, exactly as the menu row does");
test.assertIncludes(stripModules, 'disabled: !held', "with nowhere to go back to, the row is dim rather than absent");
test.assertIncludes(
  heldPlaceCore,
  'window.AISystem6ControlStrip?.refreshStrip?.("heldPlace")',
  "a hold from the keyboard or the slip still reaches the tile",
);
test.assertIncludes(stripModules, 'openOwner: "notePad"', "the module file opens the window that carries held thoughts");

// The tile is a second door, never the only one: Balloon Help and Key Caps both
// advertise the menu commands, so both key equivalents keep their meanings.
test.assertIncludes(
  actions,
  'id: "hold-that-thought", key: "n", code: "KeyN", option: true, action: "hold-that-thought", display: "⌥⌘N"',
  "catching a passing thought keeps its own key equivalent",
);

test.assertIncludes(
  manifest.slice(0, manifest.indexOf("lazyRuntimePaths")),
  '"app/core/held-place.js"',
  "the pause button boots with the system instead of loading on demand",
);

// The slip half loads on demand. Boot pays for the tracker and the menu-state
// helpers only — a menu redraw asks hasHeldPlace() on every pass, and a lazy
// module reached from a redraw is a lazy module that is never actually lazy.
test.assertIncludes(
  manifest.slice(manifest.indexOf("lazyRuntimePaths")),
  '"app/core/held-place-slip.js"',
  "the slip, the hold and the way back load on demand",
);
test.assertNotIncludes(heldPlaceCore, "function showHeldPlaceSlip", "the boot half carries no slip UI");
test.assertIncludes(heldPlaceCore, "function hasHeldPlace", "the menu-state helpers stay in the boot half");
test.assertIncludes(heldPlaceCore, "function heldPlaceResumeLabel", "so does the label the menu row prints");

test.assertIncludes(actions, 'await ensureHeldPlaceSlipModule(); holdMyPlace();', "the menu row runs the real command");
test.assertIncludes(actions, 'await ensureHeldPlaceSlipModule(); await resumeMyPlace();', "the way back runs the real command");
test.assertIncludes(actions, 'await ensureHeldPlaceSlipModule(); promoteHeldPlace("questionSheet");', "a held line can become a Question Sheet item");
test.assertIncludes(actions, 'await ensureHeldPlaceSlipModule(); promoteHeldPlace("outline");', "a held line can become an Outline section");
test.assertIncludes(actions, 'await ensureHeldPlaceSlipModule(); dismissHeldPlaceSlip();', "the slip can be put away");

// The key equivalent has to survive a caret: mid-sentence is exactly when the
// door goes.
test.assertIncludes(
  actions,
  // Not ⇧⌘H: iPadOS keeps ⌘H and ⇧⌘H for itself, so the app would never see
  // the key. ⌥⌘H is Hide Others on macOS and ⇧⌘P opens a private window in
  // Firefox; ⌥⌘P is free on all three and P matches the "Your Place" group.
  'id: "hold-my-place", key: "p", option: true, action: "hold-my-place", display: "⌥⌘P"',
  "holding a place has one global key equivalent",
);
test.assertNotIncludes(
  actions.slice(actions.indexOf('id: "hold-my-place"'), actions.indexOf('id: "hold-my-place"') + 220),
  "suppressInEditable",
  "the key still works while the writer is typing",
);

// Capture must cost nothing. The slip never takes the caret, and it only counts
// down while nobody is writing on it.
test.assertNotIncludes(heldPlace, "note.focus(", "the slip never steals the caret it was called to protect");
test.assertIncludes(heldPlace, "clearTimeout(heldPlaceSlipTimer)", "typing on the slip stops its clock");
test.assertIncludes(heldPlace, "heldPlaceQuietLife", "an untouched slip puts itself away");

// Coming back restores less than it could, on purpose.
test.assertIncludes(heldPlace, "field.setSelectionRange(start, end)", "the way back puts the caret in the sentence you left");
test.assertNotIncludes(heldPlace, "restoreWorkingSession", "returning never hauls the old desk over the work you are doing now");
test.assertIncludes(
  heldPlace,
  'showHeldPlaceSlip(landed ? "back" : "moved")',
  "a sentence that moved is reported as moved instead of pretended to be found",
);

// Nothing typed is ever thrown away.
test.assertIncludes(heldPlace, "if (heldPlace?.note && typeof appendToNotePad === \"function\") appendToNotePad(heldPlace.note)", "a superseded or dismissed line lands in the Note Pad");
test.assertIncludes(heldPlace, 'document.getElementById(target === "outline" ? "outline-content" : "question-sheet-body")', "promotion writes into the real route surfaces");
test.assertIncludes(heldPlace, 'field.dispatchEvent(new Event("input", { bubbles: true }))', "promoted lines run the surface's own sync");
test.assertIncludes(heldPlace, "setStatus(t(\"held_place_promote_unavailable\"))", "a missing surface is reported rather than silently swallowing the line");
test.assertNotIncludes(
  heldPlace.slice(heldPlace.indexOf("function promoteHeldPlace")),
  "openWindow(",
  "filing a line leaves the writer in the window they just came back to",
);

// Storage is small, synchronous and crash-proof: a held place must outlive the
// tab that was holding it.
test.assertIncludes(heldPlace, 'const heldPlaceStorageKey = "heldPlace:v1"', "the held place persists under one versioned key");
test.assertIncludes(heldPlace, "localStorage.setItem(heldPlaceStorageKey", "holding a place survives a reload or a crash");

test.assertIncludes(windows, '"resume-my-place": typeof hasHeldPlace === "function" && hasHeldPlace()', "the way back dims when there is nowhere to go");
test.assertIncludes(windows, "btn.textContent = heldPlaceResumeLabel()", "the menu row names the place and how long ago you left it");
test.assertIncludes(wireup, "installHeldPlaceTracking()", "the desk watches where the caret is before it is ever asked");

test.assertIncludes(foundation, ".held-place-slip {", "the slip has System 6 paper of its own");
test.assertIncludes(foundation, "bottom: max(22px, var(--safe-area-bottom))", "the slip clears a notch or a home indicator");

test.assertIncludes(translationsEn, 'held_place_hold: "Hold My Place"', "English names the command");
test.assertIncludes(translationsZh, 'held_place_hold: "按下不表"', "Chinese uses the storyteller's own phrase for this pause");
test.assertIncludes(translationsZh, 'held_place_resume: "回头再说"', "and its matching phrase for coming back");
test.assertIncludes(translationsEn, "held_place_note_placeholder", "the optional line invites a word without demanding one");
test.assertIncludes(translationsZh, "held_place_note_placeholder", "in both languages");

for (const key of [
  "control_strip_held_place",
  "control_strip_held_place_none",
  "control_strip_held_place_at",
  "control_strip_held_place_since",
  "balloon_control_strip_held_place",
]) {
  test.assertIncludes(translationsEn, `${key}:`, `English names the tile's ${key}`);
  test.assertIncludes(translationsZh, `${key}:`, `Chinese names the tile's ${key}`);
}
test.assertIncludes(translationsEn, 'control_strip_held_place: "Your Place"', "the tile and the Apple menu section share one name");
test.assertIncludes(translationsZh, 'control_strip_held_place: "你停在哪"', "and share it in Chinese too");

test.finish();
