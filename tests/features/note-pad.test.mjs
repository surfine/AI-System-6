// Note Pad slips: hold that thought, and get back to the sentence.
//
// Being interrupted is normal on this desk, and losing a sentence is the harm
// the product exists to prevent. A Note Pad page is therefore a slip — the
// words plus the window and caret they came from — and the slip's own default
// button is the way back. Nothing rolls off to make room: a dropped page is a
// lost thought.
//
// Note Pad had no feature contract at all before this one.

import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("note-pad");
const indexHtml = read("index.html");
const accessories = read("app/features/teachtext-accessories.js");
const actions = read("app/core/actions.js");
const persistence = read("app/core/persistence-status.js");
const desktopTools = read("app/features/desktop-tools.js");
// Dictation is two halves now: the eager field service, and the lazy window.
const dictation = read("app/features/dictation.js") + read("app/features/dictation-pad.js");
const windowChrome = read("styles/10-windows.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- The window ------------------------------------------------------------

test.assertIncludes(indexHtml, 'id="note-pad-page-label"', "the pager says which slip this is");
test.assertIncludes(indexHtml, 'id="note-pad-destination" data-action="note-pad-cycle-destination"', "the status bar carries the destination, and it is a button");
test.assertIncludes(indexHtml, '<div class="da-origin" id="note-pad-origin" hidden>', "the provenance row starts hidden and is the shared one every accessory uses");
test.assertIncludes(indexHtml, 'data-action="note-pad-back"', "the way back is a declared action");
test.assertIncludes(indexHtml, 'data-action="note-pad-new-slip"', "a new slip is a declared action");
test.assertIncludes(indexHtml, 'data-action="note-pad-send"', "sending the slip is a declared action");
test.assertNotIncludes(indexHtml, 'id="note-pad-send-teachtext"', "the three competing Send buttons are gone; one destination answers for them");
test.assertNotIncludes(indexHtml, 'data-i18n="note_pad_hint"', "the three-line hint is replaced by the destination the writer can see");

["hold-that-thought", "note-pad-new-slip", "note-pad-send", "note-pad-back", "note-pad-cycle-destination"].forEach((action) => {
  test.assertMatches(actions, new RegExp(`^\\s{4}"${action}":`, "m"), `${action} reaches a handler`);
});
test.assertIncludes(
  actions,
  'code: "KeyN", option: true, action: "hold-that-thought"',
  "holding a thought is bound to Command-Option-N by physical key"
);
test.assertIncludes(
  actions,
  "(candidate.code ? candidate.code === event.code : candidate.key === key)",
  "a shortcut may pin the physical key, because Option composes a different character on many layouts"
);
test.assertIncludes(actions, 'scope: "global"', "the shortcut works wherever the writer is");

// A command reachable only by its shortcut is a command only Key Caps can
// show. Hold That Thought sits with Hold My Place under Your Place: two ways
// to hold an interruption, and one way back.
test.assertIncludes(
  indexHtml,
  '<button data-action="hold-that-thought" data-i18n="hold_that_thought">',
  "Hold That Thought has a menu row, not only a keystroke"
);
const yourPlaceGroup = indexHtml.slice(
  indexHtml.indexOf("apple_menu_place"),
  indexHtml.indexOf("apple_menu_writing_da")
);
test.assert(
  [...yourPlaceGroup.matchAll(/data-action="([a-z-]+)"/g)].map((match) => match[1]).join(" ")
    === "hold-my-place hold-that-thought resume-my-place",
  "Your Place reads: hold the place, hold the thought, go back"
);

// Two commands that print the identical words are one command the writer
// cannot choose between. The menu row names the marked caret; the Note Pad's
// own button names the window its slip came from. Both once read "Back to
// TeachText" and nothing told them apart.
[["English", en], ["Chinese", zh]].forEach(([language, source]) => {
  const heldPlace = source.match(/held_place_resume_at: \(where\) => `([^`]*)`/)?.[1];
  const slipOrigin = source.match(/note_pad_back_to: \(title\) => `([^`]*)`/)?.[1];
  test.assert(
    Boolean(heldPlace) && Boolean(slipOrigin)
      && heldPlace.replace("${where}", "X") !== slipOrigin.replace("${title}", "X"),
    `${language}: the held place and the slip's origin do not print the same row (got "${heldPlace}" / "${slipOrigin}")`
  );
});

// The display trap: an author `display` outranks the [hidden] attribute.
test.assertIncludes(windowChrome, ".da-origin:not([hidden])", "the provenance row is hidden by the attribute, not fought by a display rule");
test.assertIncludes(persistence, "notePadDestination,", "the chosen destination survives the session");

["note_pad_slip", "note_pad_new_slip", "note_pad_from", "note_pad_back_to", "note_pad_held", "hold_that_thought", "bell_stopped_here"].forEach((key) => {
  test.assertIncludes(en, `${key}:`, `English names ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese names ${key}`);
});

// The group is read in the order the writer reaches for it, not the order the
// windows were built.
const writingDaGroup = indexHtml.slice(indexHtml.indexOf("apple_menu_writing_da"), indexHtml.indexOf("apple_menu_reference_da"));
const groupOrder = [...writingDaGroup.matchAll(/data-action="open-([a-z-]+)"/g)].map((match) => match[1]);
test.assert(
  groupOrder.join(" ") === "note-pad dictation sideask-pad translation-pad clipboard writing-bell",
  `the Writing DA group runs catch, say, ask, carry, stop (got: ${groupOrder.join(" ")})`
);

// ---- The bell knocks through the channel that already exists ----------------

test.assertIncludes(desktopTools, "function knockAfterWritingBell()", "the bell has one way to knock");
test.assertIncludes(desktopTools, "pushSystemNotification(t(\"bell_stopped_here\", where.title), {", "the bell posts a system message rather than inventing a channel");
test.assertIncludes(desktopTools, "windowName: where.window,", "the message carries the way back the Notification Center already draws");
test.assertIncludes(desktopTools, "writingBellStartedFrom = typeof currentWritingPosition === \"function\"", "the bell learns the way back before it rings");

// ---- A paused bell does not hand time back ---------------------------------
//
// How long a bell is *set* for and how much of it is *left* are different
// quantities. The one-minute floor that keeps a setting usable was also
// applied to the remainder, so pausing at 00:05 reopened the bell at 1 min:
// the writer earned up to 59 seconds by interrupting themselves, and the big
// read-out ("1 min") contradicted its own status line ("00:05 left").
const bellNormalizers = desktopTools.slice(
  desktopTools.indexOf("// How long a bell can be *set* for"),
  desktopTools.indexOf("function formatWritingBellTime")
);
const bellContext = vm.createContext({});
vm.runInContext(bellNormalizers, bellContext);

test.assert(
  bellContext.normalizeWritingBellDuration(5, 25 * 60) === 60,
  "a bell set to five seconds is still one minute: the floor protects the setting"
);
test.assert(
  bellContext.normalizeWritingBellRemaining(5, 25 * 60) === 5,
  "five seconds left stays five seconds left"
);
test.assert(
  bellContext.normalizeWritingBellRemaining(0, 25 * 60) === 0,
  "a spent bell reads empty rather than refilling itself with a minute"
);
test.assert(
  bellContext.normalizeWritingBellRemaining(-3, 25 * 60) === 0,
  "a bell that ran past its end floors at empty, never below"
);
test.assert(
  bellContext.normalizeWritingBellRemaining("not a number", 25 * 60) === 25 * 60,
  "an unreadable remainder falls back to the whole interval"
);
test.assertNotIncludes(
  desktopTools,
  "writingBellRemaining = normalizeWritingBellDuration(",
  "no remaining time is measured with the setting's floor"
);

// The knock has to outlive the interruption it is about. A message used to die
// with the reload, taking its Open button — the way back — with it.
const persistenceSource = read("app/core/persistence-status.js");
test.assertIncludes(persistenceSource, "systemNotifications: serializeSystemNotifications(),", "system messages are written with the desk");
test.assertIncludes(persistenceSource, "restoreSystemNotifications(settings.systemNotifications);", "system messages come back with the desk");
test.assertIncludes(persistenceSource, "const systemNotificationRestoreWindowMs = 24 * 60 * 60 * 1000;", "only the last day comes back; older messages are litter");
test.assertIncludes(persistenceSource, "  unreadSystemNotifications = 0;\n  updateNotificationIndicator();\n  renderNotificationCenter();\n}", "a restored desk comes back quiet rather than announcing yesterday");

// ---- A spoken sentence is never swallowed ----------------------------------

test.assertIncludes(dictation, "appendToNotePad(text);", "Send always has somewhere to put what was said");
test.assertNotIncludes(dictation, 'setStatus(t("select_text_first"));\n}', "Send no longer ends in a message nobody can see");
test.assertIncludes(
  dictation,
  'setDictationDestination(dictationInputTarget ? dest : "notepad");',
  "the pad names the place the words will actually land"
);

// ---- The slip itself --------------------------------------------------------

const slipSource = accessories.slice(
  accessories.indexOf("function normalizeNotePadOrigin"),
  accessories.indexOf("function renderClipboard")
);

function fakeField(value = "") {
  return {
    value,
    selectionStart: 0,
    isConnected: true,
    tagName: "TEXTAREA",
    disabled: false,
    hidden: false,
    className: "",
    textContent: "",
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    focus() {},
    setSelectionRange(start) { this.selectionStart = start; },
    addEventListener() {},
    closest: () => null,
  };
}

const notePadTextInput = fakeField();
const parts = {
  "#note-pad-origin": fakeField(),
  "#note-pad-origin-label": fakeField(),
  "#note-pad-origin-time": fakeField(),
  "#note-pad-destination": fakeField(),
  "#note-pad-send": fakeField(),
  "#note-pad-back": fakeField(),
};
const teachTextField = fakeField("She put the kettle on and said nothing about the rent.");
const opened = [];

const context = vm.createContext({
  console,
  currentLanguage: "en",
  notePadPages: [{ text: "", from: null }],
  notePadPageIndex: 0,
  notePadDestination: "teachtext",
  notePadTextInput,
  notePadPageLabelEl: fakeField(),
  notePadPrevButton: fakeField(),
  notePadNextButton: fakeField(),
  document: {
    activeElement: null,
    querySelector: (selector) => (selector === '[data-window="notePad"]'
      ? { querySelector: (id) => parts[id] || null }
      : null),
  },
  getWindow: (name) => (name === "teachText" ? { querySelector: () => teachTextField } : null),
  openWindow: async (name) => { opened.push(name); },
  saveDeskState: () => {},
  setStatus: () => {},
  playSystemSound: () => {},
  sendTextToDestination: () => {},
  t: (key, value) => (value === undefined ? key : `${key}:${value}`),
});
vm.runInContext(slipSource, context);

// Older desks saved plain strings.
const migrated = context.normalizeNotePadPages(["one", "two"]);
test.assert(
  migrated.length === 2 && migrated[0].text === "one" && migrated[0].from === null,
  "pages saved as plain strings migrate into slips without losing a word"
);

// The writer is mid-sentence in TeachText when the thought arrives.
context.document.activeElement = {
  ...teachTextField,
  selectionStart: 20,
  closest: () => ({ dataset: { window: "teachText" }, contains: () => true, querySelector: () => ({ textContent: "TeachText" }) }),
};
await context.holdThatThought();

const firstSlip = context.notePadPages[context.notePadPageIndex];
test.assert(opened.includes("notePad"), "holding a thought opens the pad");
test.assert(firstSlip.from?.window === "teachText", "the slip remembers the window the thought came from");
test.assert(firstSlip.from?.caret === 20, "the slip remembers the character the writer left");
test.assert(context.notePadPages.length === 1, "an untouched empty slip is reused instead of stacking blank pages");

// A second thought, with the first one written on.
notePadTextInput.value = "the bit about her hands";
await context.holdThatThought();
test.assert(context.notePadPages.length === 2, "a thought arriving on a written slip starts a new one");
test.assert(context.notePadPages[0].text === "the bit about her hands", "the earlier slip keeps its words");

// The way back.
context.notePadPageIndex = 0;
await context.returnToNotePadOrigin();
test.assert(opened.includes("teachText"), "Back opens the window the slip came from");
test.assert(teachTextField.selectionStart === 20, "Back puts the caret where the writer left it");

// The default verb follows the slip: the way back when there is one, sending
// when there is not.
const defaults = [];
parts["#note-pad-back"].classList = { toggle: (name, on) => defaults.push(["back", on]) };
parts["#note-pad-send"].classList = { toggle: (name, on) => defaults.push(["send", on]) };
context.renderNotePadPage();
test.assert(
  defaults.some(([who, on]) => who === "back" && on === true) && defaults.some(([who, on]) => who === "send" && on === false),
  "a slip with an origin makes the way back the one default button"
);

context.notePadPages[0].from = null;
defaults.length = 0;
context.renderNotePadPage();
test.assert(
  defaults.some(([who, on]) => who === "back" && on === false) && defaults.some(([who, on]) => who === "send" && on === true),
  "a slip with nowhere to go back to makes Send the one default button"
);

test.finish();
