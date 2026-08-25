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
// Being interrupted, and going back to the sentence you left, belong to Hold
// That Thought. What is left here is the pad you write on.
test.assertNotIncludes(indexHtml, 'id="note-pad-origin"', "the pad no longer carries where a slip came from");
test.assertNotIncludes(indexHtml, 'data-action="note-pad-back"', "nor a way back that duplicates the Apple menu's row word for word");
test.assertIncludes(indexHtml, 'data-action="note-pad-new-slip"', "a new slip is a declared action");
test.assertIncludes(indexHtml, 'data-action="note-pad-send"', "sending the slip is a declared action");
test.assertNotIncludes(indexHtml, 'id="note-pad-send-teachtext"', "the three competing Send buttons are gone; one destination answers for them");
test.assertNotIncludes(indexHtml, 'data-i18n="note_pad_hint"', "the three-line hint is replaced by the destination the writer can see");

test.assertMatches(actions, /^\s{4}"hold-that-thought":/m, "hold-that-thought reaches a global handler");
["note-pad-new-slip", "note-pad-send", "note-pad-cycle-destination"].forEach((action) => {
  test.assertIncludes(accessories, `["${action}"`, `${action} reaches a runtime handler`);
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
// show. Hold That Thought is the whole of Your Place now: one way to hold an
// interruption, one way back, and the accessory they share.
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
    === "hold-that-thought resume-my-place open-hold-thought",
  "Your Place reads: hold the thought, go back, open the pile"
);

// Two commands that print the identical words are one command the writer
// cannot choose between. The menu row names the marked caret; the Note Pad
// used to name the window its slip came from, and both read "Back to
// TeachText". Only one of them says it now.
test.assertNotIncludes(en, "note_pad_back_to", "the pad's own way back is retired, not reworded");
test.assertNotIncludes(zh, "note_pad_back_to", "in both languages");

// The display trap: an author `display` outranks the [hidden] attribute.
test.assertIncludes(windowChrome, ".da-origin:not([hidden])", "the provenance row is hidden by the attribute, not fought by a display rule");
test.assertIncludes(persistence, "notePadDestination,", "the chosen destination survives the session");

["note_pad_slip", "note_pad_new_slip", "hold_that_thought", "bell_stopped_here"].forEach((key) => {
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
  accessories.indexOf("function normalizeNotePadPages"),
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
  "#note-pad-destination": fakeField(),
  "#note-pad-send": fakeField(),
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

// Older desks stamped an origin on a page. The shape is read and dropped: the
// pad keeps the words and nothing else.
const stamped = context.normalizeNotePadPages([
  { text: "the bit about her hands", from: { window: "teachText", title: "TeachText", caret: 20 } },
]);
test.assert(
  stamped.length === 1 && stamped[0].text === "the bit about her hands" && stamped[0].from === null,
  "a page that used to carry an origin keeps its words and loses the origin"
);

// A new slip is a blank page, and the one before it keeps what was typed.
notePadTextInput.value = "the bit about her hands";
context.addNotePadPage();
test.assert(context.notePadPages.length === 2, "New Slip adds a page");
test.assert(context.notePadPages[0].text === "the bit about her hands", "and the earlier page keeps its words");
test.assert(context.notePadPages[1].from === null, "a new page has no origin to carry");

// Sending is the only thing this window does with a page, so it is the one
// default button. There is no second verb to choose between.
const defaults = [];
parts["#note-pad-send"].classList = { add: (name) => defaults.push(name), toggle() {}, remove() {}, contains: () => false };
context.notePadPageIndex = 0;
context.renderNotePadPage();
test.assert(defaults.includes("default"), "Send is the one default button");

test.finish();
