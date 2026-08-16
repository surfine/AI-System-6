// The writer's own words. A project has always carried `dictionaryTerms`,
// ClioTalk has always read up to twelve of them into the context of every
// request, and the writing agent has always exposed them as evidence — while no
// screen in the product could add one. The list was created empty and never
// written, so the one feature that makes a model keep the writer's own sense of
// a word was switched off by a missing button.
//
// This contract holds the whole path open: the door in the Dictionary window,
// the record it writes, and the line the model actually reads.

import vm from "node:vm";
import { webcrypto } from "node:crypto";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("dictionary-terms");
const indexHtml = read("index.html");
const dictionary = read("app/features/dictionary-help.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const chatMessages = read("app/core/chat-messages.js");
const projectDisk = read("app/features/project-disk.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- The door ---------------------------------------------------------------

test.assertIncludes(indexHtml, 'id="dictionary-word-list"', "the Dictionary shows the writer's own word list");
test.assertIncludes(indexHtml, 'id="dictionary-entry-definition"', "the writer says how they use the word");
test.assertIncludes(indexHtml, 'id="dictionary-entry-avoid"', "the writer keeps a personal ban list beside the word");
test.assertIncludes(indexHtml, 'data-action="dictionary-keep-word"', "Keep as my word is a declared action");
test.assertIncludes(indexHtml, 'data-action="dictionary-delete-word"', "a kept word can be deleted");
test.assertIncludes(indexHtml, '<button class="btn default" type="button" id="dictionary-keep-word"', "keeping the word is the window's one default button");
test.assertIncludes(indexHtml, '<button class="btn" type="submit" id="dictionary-lookup"', "Look Up steps down so the window has a single default");
test.assertMatches(indexHtml, /id="dictionary-keep-word"[^>]*data-requires-write/, "keeping a word is gated by the write lease");
test.assertMatches(indexHtml, /id="dictionary-delete-word"[^>]*data-requires-write/, "deleting a word is gated by the write lease");

test.assertIncludes(actions, '"dictionary-keep-word": () => keepDictionaryWord(),', "the keep action reaches a handler, wrapped for the lazy module");
test.assertIncludes(actions, '"dictionary-delete-word": () => deleteDictionaryWord(),', "the delete action reaches a handler, wrapped for the lazy module");
test.assertIncludes(actions, '  "dictionary-keep-word",\n  "dictionary-delete-word",', "both actions declare that they write durable project state");
test.assertIncludes(windowManager, 'if (typeof renderDictionaryWords === "function") renderDictionaryWords();', "the word list is drawn when the window opens, without a bare lazy reference");

["dictionary_my_words", "dictionary_how_i_use_it", "dictionary_never_say", "dictionary_keep_word", "dictionary_words_need_project", "dictionary_keep_needs_definition"].forEach((key) => {
  test.assertIncludes(en, `${key}:`, `English names ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese names ${key}`);
});
test.assertIncludes(en, 'dictionary_project_source: "My Word"', "the source chip says the word is the writer's own");
test.assertIncludes(zh, 'dictionary_project_source: "我的词"', "the Chinese source chip says the word is the writer's own");
test.assertIncludes(projectDisk, "dictionaryTerms: []", "a new project still starts with an empty word list");

// ---- The record -------------------------------------------------------------

function fakeElement() {
  const element = {
    value: "",
    textContent: "",
    disabled: false,
    isConnected: true,
    className: "",
    children: [],
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {},
    focus() {},
    append(...nodes) { element.children.push(...nodes); },
    replaceChildren() { element.children = []; },
    setAttribute() {},
  };
  return element;
}

const fields = {
  "#dictionary-word-list": fakeElement(),
  "#dictionary-words-count": fakeElement(),
  "#dictionary-entry-definition": fakeElement(),
  "#dictionary-entry-avoid": fakeElement(),
  "#dictionary-keep-word": fakeElement(),
  "#dictionary-delete-word": fakeElement(),
};

const project = { id: "p1", dictionaryTerms: [] };
let saves = 0;
const statuses = [];

const context = vm.createContext({
  crypto: webcrypto,
  window: {},
  console,
  document: {
    querySelector: (selector) => (selector === '[data-window="dictionary"]'
      ? { querySelector: (id) => fields[id] || null }
      : null),
    createElement: () => fakeElement(),
  },
  currentLanguage: "en",
  systemDictionaryEntries: [],
  dictionaryQueryInput: { value: "" },
  dictionaryTermEl: fakeElement(),
  dictionarySourceEl: fakeElement(),
  dictionaryResultEl: null,
  dictionaryRecentEl: null,
  getActiveProject: () => project,
  saveDeskState: () => { saves += 1; },
  setStatus: (message) => statuses.push(message),
  t: (key, value) => (value === undefined ? key : `${key}:${value}`),
  // Keeping a word redraws the result card, which the shared normaliser builds.
  detectTextLanguage: () => "en",
  selectionLabelForContext: () => "",
  sourceContextText: () => "",
  currentTranslationModel: () => "",
  escapeHtml: (value) => String(value),
  markdownToSystemHtml: (value) => String(value),
  languageDisplayName: (value) => String(value),
});

vm.runInContext(dictionary, context);

context.fillDictionaryEntry("aunt-voice");
fields["#dictionary-entry-definition"].value = "the flat way she talks about money. Not warmth.";
fields["#dictionary-entry-avoid"].value = "heartfelt, journey , tapestry";
context.keepDictionaryWord();

test.assert(project.dictionaryTerms.length === 1, "keeping a word writes it into the project the model already reads");
const kept = project.dictionaryTerms[0];
test.assert(kept.term === "aunt-voice", "the record keeps the writer's term");
test.assert(kept.definition === "the flat way she talks about money. Not warmth.", "the record keeps the writer's own sense of it");
test.assert(
  Array.isArray(kept.avoid) && kept.avoid.join("|") === "heartfelt|journey|tapestry",
  "the ban list is stored as separate words, whatever spacing the writer used"
);
test.assert(saves === 1, "keeping a word saves the desk once");

// Keeping the same word again corrects the entry instead of growing a second one.
fields["#dictionary-entry-definition"].value = "the flat way she talks about money.";
context.keepDictionaryWord();
test.assert(project.dictionaryTerms.length === 1, "keeping a term twice corrects the entry instead of duplicating it");
test.assert(project.dictionaryTerms[0].definition === "the flat way she talks about money.", "the correction wins");

// A verb that cannot work says so instead of doing nothing.
fields["#dictionary-entry-definition"].value = "";
context.fillDictionaryEntry("the handover");
context.keepDictionaryWord();
test.assert(project.dictionaryTerms.length === 1, "a word with no definition is not kept");
test.assert(
  statuses[statuses.length - 1] === "dictionary_keep_needs_definition",
  "the window says what is missing rather than failing in silence"
);

context.deleteDictionaryWord();
test.assert(project.dictionaryTerms.length === 0, "deleting the selected word removes it from the project");

// ---- The line the model reads ----------------------------------------------

const formatterSource = chatMessages.slice(
  chatMessages.indexOf("function formatProjectDictionaryTermsForContext"),
  chatMessages.indexOf("function sideAskAnswerStyleInstruction")
);
const formatterContext = vm.createContext({
  currentLanguage: "en",
  clipContextContent: (text) => text,
  getActiveProject: () => null,
});
vm.runInContext(formatterSource, formatterContext);

const line = formatterContext.formatProjectDictionaryTermsForContext({
  dictionaryTerms: [{ term: "aunt-voice", kind: "phrase", definition: "the flat way she talks about money.", avoid: ["heartfelt", "journey"] }],
});
test.assertIncludes(line, "[T1] aunt-voice (phrase): the flat way she talks about money.", "the writer's word and sense reach the model context");
test.assertIncludes(line, "never use: heartfelt, journey", "the writer's ban list travels with the word that owns it");
test.assertIncludes(
  chatMessages,
  'never use a word listed after \\"never use\\" — use the writer\'s term instead',
  "the request tells the model the ban list is an instruction, not a note"
);
test.assertIncludes(chatMessages, "遇到「不要用」列出的词就换成写作者的说法", "the Chinese request carries the same rule");

test.finish();
