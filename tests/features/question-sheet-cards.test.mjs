// The Question Sheet as a card deck.
//
// The deck is a VIEW of the same eleven sections the page edits, never a
// second store, plus one unnamed twelfth card for the mess that has not been
// sorted into a section yet -- CLAUDE.md's charge that the sheet "must
// welcome messy human input before prose". This is checked at two levels:
// the deterministic parse/serialize round trip (executed here, no model), and
// the wiring that makes an edit in a card reach the same textarea and the
// same save path the page already uses.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("question-sheet-cards");

const questionSheet = read("app/core/question-sheet.js");
const markdown = read("app/core/markdown.js");
const writingFlow = read("app/features/writing-flow.js");
const actions = read("app/core/actions.js");
const windowManager = read("app/core/window-manager.js");
const indexHtml = read("index.html");
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");

const context = vm.createContext({ window: {}, Math, globalThis: {}, currentLanguage: "zh" });
vm.runInContext(markdown, context);
vm.runInContext(questionSheet, context);
// A top-level `const` is not exposed as a property of the vm context; `var` is.
vm.runInContext("var sectionKeys = QUESTION_SHEET_SECTION_KEYS;", context);

// --- Twelve cards, not eleven -----------------------------------------------

const empty = context.questionSheetCardsFromMarkdown("");
test.assert(empty.length === 12, "the deck has twelve cards");
test.assert(empty[0].key === "unnamed" && empty[0].label === "", "card 0 is unnamed");
test.assert(
  empty.slice(1).every((card, index) => card.key === context.sectionKeys[index]),
  "the other eleven are the sheet's own sections, in the sheet's own order",
);

// --- The unnamed card is a dump target, not a twelfth section --------------

const dumped = "just typing something down before I know where it goes\nmore of it\n\n## 接收者 / 受众\n- 收件人";
const cards = context.questionSheetCardsFromMarkdown(dumped);
test.assert(
  cards[0].body.includes("just typing something down"),
  "text with no heading lands in the unnamed card",
);
test.assert(
  cards.find((card) => card.key === "recipient").body === "- 收件人",
  "and a real section after it still parses as that section",
);

// A leading `# Title` line is the pack's title, not part of the mess.
const titled = "# My Piece\n\nsome loose notes\n\n## 必须记住\n- remember this";
const titledCards = context.questionSheetCardsFromMarkdown(titled);
test.assertNotIncludes(titledCards[0].body, "# My Piece", "the title line does not leak into the unnamed card");
test.assertIncludes(titledCards[0].body, "some loose notes", "but the loose notes do");

// --- The round trip: cards back into one document ---------------------------

const roundTripped = context.questionSheetMarkdownFromCards(cards, "zh");
test.assertIncludes(roundTripped, "just typing something down", "the dump survives the round trip");
test.assertIncludes(roundTripped, "收件人", "and so does the real section");

const withEmptySections = context.questionSheetCardsFromMarkdown("## 接收者 / 受众\n- 收件人\n");
const rebuiltEmpty = context.questionSheetMarkdownFromCards(withEmptySections, "zh");
test.assert(
  !/## 必须记住/.test(rebuiltEmpty),
  "an empty card drops out on the way back, the same way an empty section already does",
);

// The keep lives in the lazy writing route. Load just those two functions into
// the same vm, so a card edit is checked against the document it was read from.
const keepStart = writingFlow.indexOf("function questionSheetKeptOutsideCards");
const keepEnd = writingFlow.indexOf("// One card changed:");
vm.runInContext(writingFlow.slice(keepStart, keepEnd), context);

const messy = "# 这篇的题\n\n还没归类的几句\n\n## 必须记住\n- 留下这句\n\n## 我自己的一节\n这里不是十一个栏目之一\n";
const messyCards = context.questionSheetCardsFromMarkdown(messy);
messyCards.find((card) => card.key === "mustRemember").body = "- 留下这句\n- 又补了一句";
const messyBack = context.questionSheetMarkdownKeepingAuthorText(messyCards, messy);
test.assertIncludes(messyBack, "# 这篇的题", "the pack title survives a card edit");
test.assertIncludes(messyBack, "还没归类的几句", "unsorted notes stay on the unnamed card");
test.assertIncludes(messyBack, "又补了一句", "the edited known section keeps the new line");
test.assertIncludes(messyBack, "## 我自己的一节", "a section the sheet does not recognize is kept");
test.assertIncludes(messyBack, "这里不是十一个栏目之一", "and so is the writing under that section");

// --- Wired into the writing route, not a second store -----------------------

test.assertIncludes(writingFlow, "questionSheetCardsFromMarkdown(project?.questionSheet", "cards are read from the project's own Question Sheet field, via question-sheet.js's parse");
test.assertIncludes(writingFlow, "questionSheetMarkdownKeepingAuthorText(cards, project.questionSheet || \"\")", "a card edit writes back into the SAME textarea, keeping the title and any section the cards do not edit");
test.assertIncludes(writingFlow, "savePipelineData();", "and is saved through the existing pipeline save, not a new one");
test.assertMatches(
  writingFlow,
  /function commitQuestionSheetCardEdit\(\)[\s\S]*?savePipelineData\(\)/,
  "commitQuestionSheetCardEdit is the one place a card edit lands",
);

// --- Per-project, the way the task asked ------------------------------------

test.assertIncludes(writingFlow, "project.questionSheetView", "the chosen view is a field on the project record");
test.assertMatches(
  writingFlow,
  /function setQuestionSheetView\(mode\)[\s\S]*?saveDeskState\(\);/,
  "and changing it is saved",
);

// --- Menu wiring: View ▸ Page / Cards, Finder's checked-item grammar ---

test.assertIncludes(actions, '"question-sheet-view-page": () => setQuestionSheetView("page")', "the Page command is wired");
test.assertIncludes(actions, '"question-sheet-view-cards": () => setQuestionSheetView("cards")', "the Cards command is wired");
test.assertIncludes(
  indexHtml,
  'data-action="question-sheet-view-page" aria-pressed="true" data-i18n="question_sheet_view_page"',
  "the Page toggle is in the Question Sheet's own Commands menu",
);
test.assertIncludes(
  indexHtml,
  'data-action="question-sheet-view-cards" aria-pressed="false" data-i18n="question_sheet_view_cards"',
  "and the Cards toggle beside it",
);
test.assertIncludes(
  windowManager,
  'if (action === "question-sheet-view-page" || action === "question-sheet-view-cards")',
  "exactly one of the two reads as checked at a time",
);

// --- Bilingual copy ----------------------------------------------------------

["question_sheet_view_page", "question_sheet_view_cards", "question_sheet_card_unnamed_hint"].forEach((key) => {
  test.assertIncludes(zh, `${key}:`, `zh has ${key}`);
  test.assertIncludes(en, `${key}:`, `en has ${key}`);
});

test.finish();
