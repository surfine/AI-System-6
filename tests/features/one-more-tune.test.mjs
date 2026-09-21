// One More Tune — the Apple-advertising music deck.
//
// This contract holds the deck to the research package's own rules, which are
// the ones a redesign is most likely to sand off:
//
//   1. Unknown time is null, and 0 can only arrive from a person. The spec's
//      words: "未知时间用 null。0 是可被实听确认的有效起点，禁止用 0 来填空."
//   2. The three clocks stay apart — a source anchor, the music's place inside
//      a film, and the range a player hears out of a recording.
//   3. learn / recall / challenge are derived gates, and nothing in this deck
//      ships recall-ready, because no segment has been listened through.
//   4. A question never carries its answer, practice is not mastery, and a
//      player fault is not a miss.
//
// The module is also lazy, declared through the window registry, and bilingual.

import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { lazyStyleBundles } from "../../tooling/style-manifest.mjs";
import { windowInterfaceRegistry } from "../../tooling/interface-guidelines-contract.mjs";

const test = createFeatureTest("one-more-tune");

const source = read("app/features/one-more-tune.js");
const config = read("app/core/config.js");
const html = read("index.html");
const actions = read("app/core/actions.js");
const multiFinder = read("app/core/multi-finder.js");
const windowManager = read("app/core/window-manager.js");
const icons = read("app/core/system-icons.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- Lazy, and actually reachable ------------------------------------------
test.assert(lazyRuntimePaths.includes("app/features/one-more-tune.js"), "the module is a lazy runtime file, not a boot cost");
test.assertIncludes(
  config,
  'createLazyModuleLoader("AISystem6OneMoreTuneLoaded", ["app/core/application-shell.js", "app/features/one-more-tune.js"], false, ["styles.one-more-tune.css"])',
  "one loader names the shell, the module, and its stylesheet together"
);
test.assertIncludes(actions, '"open-one-more-tune",{ensure:ensureOneMoreTuneModule}', "the opener is a lazy command, so the first click loads the module");
test.assertIncludes(source, "window.AISystem6OneMoreTuneLoaded = true;", "the module installs its loaded flag");

const styleBundle = lazyStyleBundles.find((bundle) => bundle.id === "one-more-tune");
test.assert(!!styleBundle, "a lazy style bundle is declared");
test.assert(styleBundle?.output === "styles.one-more-tune.css", "its output name matches what the loader requests");

// ---- The window is declared, not improvised --------------------------------
const record = windowRegistryRecords().oneMoreTune;
test.assert(!!record, "oneMoreTune has a window-registry record");
test.assert(record.app === "oneMoreTune", "and it declares its own application id");
test.assert(record.builtByModule === true, "the markup is built by the module, not shipped in index.html on every boot");
test.assert(!!record.lazy, "the registry knows the window arrives lazily");
test.assertIncludes(source, "function installOneMoreTuneWindow()", "the module builds its own window");
test.assertNotIncludes(html, 'data-window="oneMoreTune"', "the window is not duplicated as static markup in index.html");

test.assertIncludes(multiFinder, 'oneMoreTune: "One More Tune"', "MultiFinder can name the running application");
test.assertMatches(
  windowManager,
  /mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*"oneMoreTune"/,
  "the phone shell covers the deck like its sibling applications"
);
test.assertIncludes(icons, "oneMoreTune: `", "a system icon is registered");
test.assertMatches(icons, /classicOnlyModernFallbackIconId = \{[\s\S]*?oneMoreTune: true/, "invented object art shows its Classic line drawing in every appearance rather than joining the era vocabulary unreviewed");
test.assert(windowInterfaceRegistry.oneMoreTune?.role === "creative-lab", "the interface guidelines register the deck as a creative lab");

// ---- The deck, loaded as data ----------------------------------------------
//
// The deck lives in a data file the server reads too, so the contract loads it
// exactly the way the browser does and then asks the real server module to open
// the rounds. Nothing here is a stand-in for the authority that ships.
const require = createRequire(import.meta.url);
const serverSource = read("apps/server/server/one-more-tune.js");
const serverDeck = require("../../apps/server/server/one-more-tune.js");

const deckFile = JSON.parse(read("data/one-more-tune-deck.json"));

const store = new Map();
const context = {
  window: {
    AISystem6ApplicationShell: { createWindow: () => ({}) },
    AISystem6InstanceResources: { create: () => ({ listen() {}, add() {}, dispose() {}, disposed: false }) },
  },
  document: undefined,
  fetch: async (url, init) => {
    const pathname = String(url);
    if (pathname === "/data/one-more-tune-deck.json") {
      return { ok: true, json: async () => deckFile };
    }
    if (pathname === "/api/one-more-tune/round") {
      return { ok: true, json: async () => serverDeck.startRound({ allowPreview: false, allowYoutube: false }) };
    }
    if (pathname === "/api/one-more-tune/answer") {
      return { ok: true, json: async () => serverDeck.submitAnswer(JSON.parse(init?.body || "{}")) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  },
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  },
  navigator: {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  console,
};
context.globalThis = context;
vm.runInNewContext(source, context);
const deck = context.window.AISystem6OneMoreTune;
test.assert(!!deck, "the module exposes window.AISystem6OneMoreTune");
await deck.loadDeck();

// The research deck, whole: what 资料馆 reads. The game reads a subset of it.
const cards = deck.allCards();
const units = deckFile.units;
test.assert(cards.length === deckFile.cards.length,
  "the browser deck is the same file the server reads, card for card");
// ---- The game only asks what it can play -----------------------------------
//
// Which card has a store preview or a video of the song is research, done
// backstage by tooling/pin-one-more-tune-sound.mjs and pinned into the deck.
// The shelf, study and rounds see only settled cards with a pinned sound.
const playableIds = deckFile.cards
  .filter((card) => card.product && card.film && card.questionSound?.provider === "preview")
  .map((card) => card.id);
test.assert(playableIds.length >= 80, `most settled cards have a pinned sound (${playableIds.length})`);
test.assert(JSON.stringify(deck.cards().map((card) => card.id)) === JSON.stringify(playableIds),
  "the player's deck is exactly the settled cards whose sound is pinned");
test.assert(deck.units().every((unit) => deck.cards().some((card) => card.unit === unit.id)),
  "and a unit with nothing playable is not on the shelf");
test.assert(cards.length >= 70, "the deck carries the package's cards, not a handful");
// The official-playlist crosswalk came with real films and real video ids. A
// deck that kept only the pairings someone could recall from memory would be
// smaller and worse sourced, so the count of linked originals is pinned.
test.assert(cards.filter((card) => card.videoId).length >= 20,
  "the package's resolved YouTube targets are carried over, not dropped");
for (const card of cards.filter((card) => card.videoId)) {
  test.assert(/^[\w-]{11}$/.test(card.videoId), `${card.id} carries a well-formed video id`);
}
test.assert(cards.every((card) => card.song), "every card names a recording");
// A card carried over from the bank may hold its note in one language only:
// the package writes its editorial notes in the language its researcher used,
// and the window shows the side that exists rather than an invented translation.
test.assert(cards.every((card) => card.note?.en || card.note?.zh),
  "every card carries the evidence it rests on, in the language it was written in");
test.assert(cards.filter((card) => card.note?.en && card.note?.zh).length >= 70,
  "and the cards that have been written for this window are bilingual");
// Three kinds of claim, and they are not the same claim: the shared package
// named the pairing, an outside report did, or a first-party credit from the
// people who made the film did. The v0.5 foundation added the third.
const BASES = ["package", "reported", "foundation_v05_first_party_credit"];
test.assert(cards.every((card) => BASES.includes(card.basis)),
  "every card says which kind of source put this pairing on it");
test.assert(cards.filter((card) => card.basis === "foundation_v05_first_party_credit").length >= 20,
  "the v0.5 first-party credits are carried, not summarised away");

// A lesson is three to five associations. Cards with no settled product belong
// to no unit at all: they stay on the shelf rather than padding one out.
for (const unit of units) {
  const size = cards.filter((card) => card.unit === unit.id).length;
  test.assert(size >= 3 && size <= 5, `${unit.id} is a lesson-sized unit (${size})`);
}
const unsettled = cards.filter((card) => !card.product || !card.film);
test.assert(unsettled.length > 0, "the deck admits the pairings it has not settled");
test.assert(unsettled.every((card) => card.unit === ""), "an unsettled card is in no unit, rather than being given a product to fit one");

// ---- Rule 1: unknown is null, and 0 is a person's answer --------------------
for (const card of cards) {
  const times = deck.times(card.id);
  test.assert(times.quizClip.start === null, `${card.id} ships no invented in-point`);
  test.assert(times.quizClip.auditioned === false, `${card.id} ships no auditioned range`);
}
test.assertNotMatches(source, /start:\s*0\s*,\s*length:/, "no default range is written into a clip");
test.assertIncludes(source, "one-more-tune-clip-from-start", "reaching 0 needs a control a person presses");
test.assertMatches(source, /if \(action === "one-more-tune-clip-from-start"\)[\s\S]{0,220}setOneMoreTuneQuizClip\(cardId, \{ start: 0/,
  "and that control is the only place a 0 is written");

// A half-filled range is not an audition.
const probe = cards.find((card) => card.product && card.film).id;
deck.setQuizClip(probe, { start: 12 });
test.assert(deck.times(probe).quizClip.auditioned === false, "a start with no end is still half a guess");
test.assert(deck.readiness(probe).recall === false, "and it does not open the recall gate");
deck.setQuizClip(probe, { start: 12, end: 27 });
test.assert(deck.times(probe).quizClip.auditioned === true, "a real range is an audition");

// ---- Rule 2: three clocks, never copied into each other ---------------------
const anchored = cards.filter((card) => Number.isFinite(card.sourceAnchor));
// Exactly one card has a located film segment today, and it is the only one that
// may: the supervisor's clip resolves to Apple's own video of the 30 October
// 2023 event, 19:18.06 to 19:50.45. Every other card's film clock is empty.
const located = cards.filter((card) => Number.isFinite(card.filmClip?.start));
test.assert(located.length >= 1, "the one located film segment is carried");
for (const card of located) {
  test.assert(String(card.videoId || "").trim() !== "" && String(card.filmClip.basis || "").trim() !== "",
    `${card.id} names both the video and the basis for its film window`);
  test.assert(deck.times(card.id).quizClip.start === null,
    `${card.id} did not let the film's clock become the player's`);
}
test.assert(anchored.length >= 6, "the six anchors the package recorded are carried over");
for (const card of anchored) {
  const times = deck.times(card.id);
  test.assert(times.sourceAnchor === card.sourceAnchor, `${card.id} keeps its source anchor`);
  // A film position is allowed only where somebody published one. The guard is
  // not "nobody knows" any more — OMT-060 does, from a clip the film's own music
  // supervisor put out — it is "no card may claim one without naming the video
  // it is inside and the basis it rests on". A window without both is a guess.
  if (times.filmClip.start !== null) {
    test.assert(Number.isFinite(card.filmClip?.start) && Number.isFinite(card.filmClip?.end) && card.filmClip.end > card.filmClip.start,
      `${card.id} carries a real window for the music inside the film`);
    test.assert(String(card.filmClip.basis || "").trim() !== "", `${card.id} says what that window rests on`);
    test.assert(String(card.videoId || "").trim() !== "", `${card.id} names the video the window is inside`);
    test.assert(deck.times(card.id).quizClip.start === null,
      `${card.id} keeps the film's clock out of the player's — a keynote's 19:18 is not a recording's 19:18`);
  } else {
    test.assert(times.filmClip.end === null, `${card.id} has neither end of a film window, or both`);
  }
  test.assert(times.quizClip.start !== times.sourceAnchor || times.quizClip.start === null,
    `${card.id} never pastes a film timeline onto a recording timeline`);
}

// ---- Rule 3: the gates are derived, and nothing ships recall-ready ----------
test.assert(cards.every((card) => deck.readiness(card.id).challenge === false),
  "no card claims to be challenge-ready: the distractors have not been reviewed for ambiguity");
test.assert(unsettled.every((card) => deck.readiness(card.id).learn === false), "an unsettled association is not even learn-ready");
test.assert(unsettled.every((card) => deck.readiness(card.id).reasons.includes("one_more_tune_gate_association_unsettled")),
  "and the gate says why, rather than failing silently");
test.assertIncludes(source, "function oneMoreTuneReadiness", "readiness is computed from the card, not stored on it");

// ---- Options are fair, and a sibling is never a distractor ------------------
const answerable = cards.filter((card) => card.product && card.film);
const options = deck.options(answerable[0].id, 4);
test.assert(options.length === 4, "a four-option question offers four");
test.assert(new Set(options).size === 4, "with no repeats");
test.assert(options.includes(answerable[0].id), "and the right answer among them");
const twinned = cards.find((card) => card.siblingOf);
test.assert(!!twinned, "the deck keeps the film that used two songs");
test.assert(!deck.options(twinned.id, 4).includes(twinned.siblingOf),
  "a film's other song is never offered as a wrong answer — both are right for that film");

// ---- Rule 4: the question does not leak the answer -------------------------
const recallRender = source.slice(source.indexOf("function renderOneMoreTuneRecall"), source.indexOf("function renderOneMoreTuneReveal"));
for (const field of ["card.song", "card.artist", "card.product", "card.film"]) {
  test.assertNotIncludes(recallRender, field, `the recall question never writes ${field} into the page`);
}
test.assertIncludes(recallRender, "clearOneMoreTuneNowPlaying()", "the lock screen is cleared before the question, not left on the last card");
test.assertIncludes(source, "function announceOneMoreTuneNowPlaying", "the now-playing metadata is only filled in by a reveal");
const matchRender = source.slice(source.indexOf("function renderOneMoreTuneMatch"), source.indexOf("function renderOneMoreTuneRecall"));
test.assertIncludes(matchRender, "clearOneMoreTuneNowPlaying()", "the matching question clears it too");
test.assertNotIncludes(source, "file.name", "the chosen file's name is never read into the page — it is usually the answer");
test.assertIncludes(matchRender, "oneMoreTuneStudySound(card)", "the matching face plays the card's pinned sound");
test.assertIncludes(recallRender, "oneMoreTuneStudySound(card)", "and so does the recall face");
test.assertNotIncludes(matchRender + recallRender, "oneMoreTunePlayerBlock", "no blind face carries the segment editor or its clocks");
test.assertMatches(source, /\$\{oneMoreTuneBackstage\(\) \? oneMoreTunePlayerBlock\(card\) : ""\}/,
  "and the answered faces carry it only backstage, where 资料馆 opens it");

// A year is an answer. The era band names the card's decade and the appearance
// that shipped with it, which on an unanswered face narrows the choices for
// free — "2003 · Aqua" over a choice between AirPods and iPod hands it over,
// because AirPods did not exist in 2003. The band is opt-in, and only the two
// faces that already show the product opt in.
// The era ladder must not coerce: Number(null) is 0 and 0 is an integer, so a
// coercing check files every yearless card under "0 \u00b7 System 6" \u2014 an unknown
// printed as a zero, which is the one thing this deck may never do.
const eraFn = source.slice(source.indexOf("function oneMoreTuneEra("), source.indexOf("function oneMoreTuneEraBand"));
test.assertNotIncludes(eraFn, "Number(card?.year)", "the era ladder never coerces a year");
test.assertIncludes(eraFn, "Number.isInteger(year)", "it wants a number that already is one");
test.assertIncludes(eraFn, "year < 1976", "and a year from before Apple existed is a fault, not the earliest era");
// The shelf prints each era's own range, and the design's plate gallery and
// token table both start the first one at 1984 — the Macintosh's year, not the
// year before Apple existed that the fault line above uses. Two numbers, two
// jobs: a chip built off the ladder would have read "1976 — 1994".
const eras = source.slice(source.indexOf("const ONE_MORE_TUNE_ERAS"), source.indexOf("function oneMoreTuneEra("));
test.assertIncludes(eras, 'id: "1", from: 1984, until: 1994', "the first era starts in the year the design prints");
test.assertMatches(eras, /id: "6", from: 2020, until: Infinity/, "and the last one opens at 2020");
const facets = source.slice(source.indexOf("const eraFacets"), source.indexOf("const statusMatches"));
test.assertNotIncludes(facets, "1976", "no facet takes its range from the fault line");
test.assertIncludes(facets, "era.from", "each chip reads the era's own first year");
const lessonCard = source.slice(source.indexOf("function oneMoreTuneLessonCard"), source.indexOf("function oneMoreTuneCardCopy"));
test.assertMatches(lessonCard, /era = false/, "the era band is off unless a face asks for it");
test.assertMatches(lessonCard, /\$\{era \? oneMoreTuneEraBand\(card\) : ""\}/, "and the card top honours that");
test.assertNotIncludes(matchRender, "era: true", "the matching question shows no era");
test.assertNotIncludes(recallRender, "era: true", "and neither does the recall question");
const revealRender = source.slice(source.indexOf("function renderOneMoreTuneReveal"), source.indexOf("function oneMoreTuneChallengePool"));
test.assertIncludes(revealRender, "era: true", "the reveal does, because the product is on the page by then");
const challengeRender = source.slice(source.indexOf("function renderOneMoreTuneChallenge"), source.indexOf("function renderOneMoreTuneRoundResult"));
test.assertMatches(challengeRender, /question\.submitted[\s\S]*oneMoreTuneEraBand\(reveal\)/, "the challenge reveal names the era too, and only after a submission");
test.assertNotMatches(challengeRender.slice(challengeRender.indexOf("clearOneMoreTuneNowPlaying")), /oneMoreTuneEraBand/, "the unanswered question still does not");
test.assertIncludes(
  source.slice(source.indexOf("function renderOneMoreTuneLearn"), source.indexOf("function renderOneMoreTuneMatch")),
  "era: true", "and so does meeting the card");

// The stripes are identity, never a verdict: a card from the red era must not
// light a red lamp for being answered well. Right, wrong and selected take the
// appearance's own selection pair, which is also what makes them legible on a
// 1-bit desk.
const sheet = read("styles/97-one-more-tune.css");
test.assertNotIncludes(sheet, "--omt-acid", "the invented accent is gone");
test.assertNotIncludes(sheet, "var(--lime", "and so are the references to a token no stylesheet defines");
test.assertNotIncludes(sheet, "lime", "the word is gone from the sheet, so no rule can point at a class that no longer exists");
test.assertNotIncludes(source, '" lime"', "and the window never asks for one");
for (const n of [1, 2, 3, 4, 5, 6]) {
  test.assertIncludes(sheet, `--omt-era-${n}:`, `era ${n} has its own token`);
}
test.assertIncludes(sheet, "--omt-era-none:", "a card with no year has one too");
test.assertMatches(sheet, /\.tag\.on \{ background:var\(--selection-bg\)/, "a state tag takes the appearance's selection, not an era colour");
test.assertNotMatches(sheet, /\.rating:nth-child\(/, "no grade button is singled out by its position");
test.assertNotMatches(sheet, /outline:3px solid #/, "the focus ring is the appearance's, not a colour this window invented");
test.assertMatches(sheet, /outline:var\(--control-focus-outline\)/, "it reads the shared token");
// The wordmark is the era mark: six bars, a waveform one way and the 1977
// stripes the other. Four grey bars were neither.
test.assertMatches(source, /<span class="brandmark">(<b><\/b>){6}<\/span>/, "the wordmark has six bars");
test.assertMatches(sheet, /\.brandmark b:nth-child\(6\) \{[^}]*--omt-era-6/, "and the sixth takes the sixth era");

// Four grades, four dates. One shared line of small print told a person nothing
// about the choice they were making — and the dates are the scheduler's own,
// which is the one thing about them that may not be approximated.
test.assertIncludes(source, "function oneMoreTuneGradePreviews", "each grade can say where it would put the card");
test.assertMatches(source, /oneMoreTuneGradePreviews\(cardId\)/, "and the buttons are rendered from that");
test.assertMatches(source, /scheduler\.repeat\(card, now\)/, "the four dates are repeat()'s");
test.assertMatches(source, /scheduler\.next\(oneMoreTuneSchedulerCard\(record, now\), now, rating\)/, "and a commit is next()'s");
test.assertNotIncludes(source, "ONE_MORE_TUNE_DEMO_STEPS_DAYS", "the hand-written ladder is gone");
test.assertMatches(source, /labelled demo ladder[\s\S]{0,200}\[0, 1, 3, 7, 14\]/, "the migration names the ladder it retires");
test.assertIncludes(source, "delete migrated.stage", "and deletes the ladder position rather than converting it");
test.assertNotMatches(source, /record\.stage/, "nothing reads a ladder position any more");
test.assertIncludes(en, "one_more_tune_interval_minutes:", "an interval in minutes has words in English");
test.assertIncludes(zh, "one_more_tune_interval_minutes:", "and in Chinese");
test.assertIncludes(en, "one_more_tune_interval_hours:", "so does one in hours");
test.assertIncludes(zh, "one_more_tune_interval_hours:", "in both languages");
test.assertIncludes(en, "one_more_tune_interval_days:", "and one in days");
test.assertIncludes(zh, "one_more_tune_interval_days:", "in both languages");
test.assertMatches(source, /days === 1 \? "one_more_tune_interval_day"/, "a single day is a day, not 1 days");
test.assertMatches(source, /hours === 1 \? "one_more_tune_interval_hour"/, "and a single hour is an hour");
test.assertIncludes(en, "one_more_tune_interval_unknown:", "a missing date says so rather than guessing");
test.assertIncludes(zh, "one_more_tune_interval_unknown:", "in both languages");
test.assertIncludes(en, "one_more_tune_era_unknown:", "so does a card with no year");
test.assertIncludes(zh, "one_more_tune_era_unknown:", "in both languages");

// ---- The catalogue says why, not just how many -----------------------------
//
// "0 cards can be asked" is a number; the reason each card is stuck is the
// thing worth reading, and it never travelled with the deck. It arrives in its
// own file, fetched by the catalogue alone, because the reasons name films and
// the source URLs carry product names — nothing on this path may reach a
// question.
const evidence = JSON.parse(readFileSync(new URL("../../apps/desktop/data/one-more-tune-evidence.json", import.meta.url), "utf8"));
const builder = readFileSync(new URL("../../tooling/build-one-more-tune-evidence.mjs", import.meta.url), "utf8");
const joinLib = readFileSync(new URL("../../tooling/lib/one-more-tune-join.mjs", import.meta.url), "utf8");
// The deck is not the package renumbered — a re-projection drifted the ids, so
// package OMT-042 is this deck's OMT-018 — and the first build of this file
// joined on the id and gave 73 cards somebody else's reasons. The join is on
// content now and every entry must prove itself: the song title has to fold to
// the card's, and the product or the film has to agree. A card that cannot prove
// it carries no panel, which is why this number is well under 73 and should be.
test.assert(Object.keys(evidence.cards).length >= 35, "the cards that join by content carry their blockers and sources");
test.assert(Object.keys(evidence.sources).length >= 20, "and the sources they cite are addressable");
const foldTitle = (value) => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
const deckById = new Map(cards.map((card) => [card.id, card]));
for (const [cardId, entry] of Object.entries(evidence.cards)) {
  const card = deckById.get(cardId);
  test.assert(!!card, `${cardId} is a card this deck has`);
  test.assert(typeof entry.from === "string" && entry.from.startsWith("OMT-"),
    `${cardId} records which package entry it was joined to`);
  test.assert(foldTitle(card.song).length > 0, `${cardId} has a song to have been joined on`);
}
test.assertIncludes(joinLib, "Joining on the id", "the shared join records why the id is not the key");
test.assertIncludes(builder, "joinOneMoreTuneCards", "and the evidence generator joins through it");
test.assertNotMatches(builder, /cards\[question\.id\]/, "and never keys its output by the package's id again");
for (const [id, card] of Object.entries(evidence.cards)) {
  for (const code of card.blocked) {
    test.assert(evidence.reasons[code]?.en && evidence.reasons[code]?.zh, `${id}: ${code} reads as a sentence in both languages`);
  }
  for (const item of card.evidence) {
    test.assert(evidence.sources[item.source], `${id}: its evidence names a source the file defines`);
  }
}
test.assertIncludes(source, "ONE_MORE_TUNE_EVIDENCE_URL", "the window knows where the file is");
test.assertMatches(source, /function renderOneMoreTuneSources[\s\S]{0,400}oneMoreTuneEnsureEvidence\(\)/, "and only the catalogue fetches it");
// The design's third column is a sheet, not a paragraph: the record's own nine
// rows head it, from the same function the reveal prints, so the two positions
// cannot drift into describing the same record differently. The header names
// the year, and the pairing gets its own line because that is what the row is
// filed under.
const sourceDetail = source.slice(source.indexOf("function oneMoreTuneSourceDetail"), source.indexOf("function oneMoreTuneSourceSpec"));
test.assertMatches(sourceDetail, /oneMoreTuneDeckSpec\(oneMoreTuneCardRecord\(card\), card\.id\)/, "the shelf's detail prints the record's sheet");
test.assertIncludes(source, "function oneMoreTuneCardRecord", "from the card, through one translation");
test.assertMatches(sourceDetail, /data-one-more-tune-open-card="\$\{oneMoreTuneEscape\(card\.id\)\}"/, "and the record opens its own segment editor from there");
test.assertIncludes(en, "one_more_tune_open_editor:", "that entry has words in English");
test.assertIncludes(zh, "one_more_tune_open_editor:", "and in Chinese");
const sourceSpec = source.slice(source.indexOf("function oneMoreTuneSourceSpec"), source.indexOf("function renderOneMoreTuneSources"));
test.assertMatches(sourceSpec, /Number\.isInteger\(card\.year\)[\s\S]{0,120}one_more_tune_era_unknown/, "the header prints the year, or says nobody knows it");
test.assertIncludes(sourceSpec, "one-more-tune-spec-answer", "and the pairing is the record's name there");
// The shelf's caption carries the deck's own number, read from the file rather
// than assumed, because two people comparing a set need to know they played
// the same deck.
test.assertMatches(source, /deck\.version\) \|\| 0/, "the window takes the deck's version from the deck");
test.assertMatches(source, /one_more_tune_state_version[\s\S]{0,40}ONE_MORE_TUNE_DECK_VERSION/, "and prints it beside the unit count");
test.assertIncludes(en, "one_more_tune_state_version:", "the caption has words in English");
test.assertIncludes(zh, "one_more_tune_state_version:", "and in Chinese");
// An era with no card yet says so and names how far back the deck goes — the
// state the design draws on its first era plate — instead of leaving a person
// to wonder whether the filter is broken.
test.assertIncludes(source, "function oneMoreTuneSourceEmptyNote", "an empty era has its own sentence");
test.assertMatches(source, /era\.count === 0[\s\S]{0,200}Math\.min\(\.\.\.years\)/, "naming the deck's earliest year");
test.assertIncludes(en, "one_more_tune_era_empty_note:", "in English");
test.assertIncludes(zh, "one_more_tune_era_empty_note:", "and in Chinese");
// The design's first step is one sentence long: 圆角 goes through the shared
// ladder. A literal radius here is what made the quiz look like a seventh skin,
// identical under all six appearances, so the surfaces take theirs from the
// appearance and only the pills and the 1-bit ticks keep a shape of their own.
// An answer is a control, so it takes the appearance's control corner
// (--btn-radius); every other block here is a surface and takes the surface
// ladder. Both are the appearance's value rather than a literal.
for (const rule of [".lesson-card", ".statbar", ".choice", ".rating", ".unit", ".library-item", ".catalog-spec", ".dialog", ".empty", ".ledger", ".revealbox", ".media"]) {
  const pattern = new RegExp(`\\${rule} \\{[^}]*border-radius:var\\(--(surface|item|inset|container|btn)-radius\\)`);
  test.assertMatches(sheet, pattern, `${rule} takes its corner from the appearance, not from a literal`);
}
const literalRadii = [...sheet.matchAll(/border-radius:\s*([0-9]+)px/g)].map((match) => Number(match[1]));
test.assert(literalRadii.length <= 10, `only the pill and tick shapes keep a literal radius (${literalRadii.length} left)`);
test.assert(literalRadii.every((value) => value >= 24 || value <= 4),
  "and every one of those is a pill or a 1-bit mark, never a surface corner");
// The desk's own app surfaces light themselves with --system-shadow, which is a
// hard offset in the 1-bit eras and a soft one in the modern ones. A card that
// carried its own soft shadow would float the same way under all six.
test.assertMatches(sheet, /\.lesson-card \{[^}]*box-shadow:var\(--system-shadow\)/, "the card takes the desk's own object shadow");
// The player's small print sits on the stage, which the *appearance* paints
// with its ink, so its reading colour cannot be a panel value: --surface-secondary
// is Aqua's pinstripe gradient and Liquid Glass's 34% wash, and using it as type
// left the player's own labels invisible in those two appearances.
test.assertMatches(sheet, /\.one-more-tune-window \{[^}]*--omt-stage-ink:var\(--paper\)/,
  "the deck names one stage ink, the desk's light pole, for the surface the appearance darkens");
test.assertMatches(sheet, /\.playerhead[^}]*color:var\(--omt-stage-ink\)/, "and the player's small print reads it");
test.assertMatches(sheet, /\.triangle \{[^}]*border-left:16px solid var\(--omt-stage-ink\)/, "so does the play triangle");
test.assertMatches(sheet, /\.trackline:before \{[^}]*background:var\(--omt-stage-ink\)/, "and the progress mark");
test.assertNotMatches(sheet.replace(/\/\*[\s\S]*?\*\//g, ""), /color:var\(--surface-secondary\)/,
  "no text in this sheet takes a surface token as its ink");
const challengeFace = source.slice(source.indexOf("function renderOneMoreTuneChallenge"), source.indexOf("function renderOneMoreTuneRoundResult"));
test.assertNotIncludes(challengeFace, "oneMoreTuneEvidencePanel", "a question never shows an evidence panel");
test.assertNotIncludes(recallRender, "oneMoreTuneEvidencePanel", "and neither does a recall card");

// ---- A link is the unit of sharing ----------------------------------------
//
// The set code on its own asks the other person to find a text box and paste
// it, which is a step nobody takes from a feed. What travels is a link that
// opens the desk, the window and that exact ten.
test.assertIncludes(source, "function oneMoreTuneShareLink", "a round has an address, not just a code");
test.assertMatches(source, /launch=one-more-tune&set=\$\{encodeURIComponent\(code\)\}/, "and the address carries the set");
test.assertMatches(source, /"one-more-tune-share-set"[\s\S]{0,120}shareOneMoreTuneInvite\(\)/, "sharing a set hands over the link, through the share sheet or the clipboard");
test.assertMatches(source, /"one-more-tune-share-question"[\s\S]{0,200}oneMoreTuneShareLink\(oneMoreTuneRound\.index\)/, "and so does sharing one question");
test.assertMatches(source, /oneMoreTuneShareLink\(\) \|\| oneMoreTuneShareCode\(\)/, "with the bare code as the fallback when there is no http origin");

// The link lands on the challenge, opens the named set, and never throws away a
// round that is already being played.
test.assertIncludes(source, "function consumeOneMoreTuneLaunchIntent", "an arriving link is read once");
test.assertMatches(source, /oneMoreTuneLaunchConsumed = true/, "and only once");
// The link opens the window it names: nothing else in the desk does that for a
// `?launch=`, which is why a friend tapping `/go/one-more-tune` could land on
// the desk's welcome instead of the quiz on some runs and not others.
test.assertMatches(source, /oneMoreTuneLaunchConsumed = true;[\s\S]{0,700}void openOneMoreTune\(\)\.then/,
  "and the window this link is for is opened by the link");
test.assertMatches(source, /void openOneMoreTune\(\)\.then\(\(\) => \{\s*\n\s*if \(oneMoreTuneRound\) return;/,
  "while a round already in progress still outranks a link");
test.assertMatches(source, /setOneMoreTuneView\("challenge"\);\s*\n\s*if \(intent\.set\)/, "the link lands on the challenge, then opens the set");
test.assertMatches(source, /oneMoreTuneEnsureDeck\(\)\.then\([\s\S]{0,800}consumeOneMoreTuneLaunchIntent\(\)/, "and it waits for the deck, because a round needs cards to name");
test.assertMatches(source, /oneMoreTuneEnsureDeck\(\)\.then\([\s\S]{0,400}await oneMoreTuneHydrateState\(\)/, "the stored progress is adopted after the deck too, since the state is filed by card id");

// The set id is base64url: folding its case hands the authority an id it never
// minted. The client table is the allowlist for both.
const launchIntent = read("app/core/launch-intent.js");
test.assertIncludes(launchIntent, '"one-more-tune": { command: "open-one-more-tune"', "the quiz is a launch route");
test.assertIncludes(launchIntent, "const rawParam", "the set is read without folding its case");
test.assertMatches(launchIntent, /OMT\\\.\\d\{1,4\}/, "and validated to the shape the authority mints");

// A question about a keynote asks about the keynote.
test.assertIncludes(source, "function oneMoreTunePromptKey", "the prompt follows what kind of thing the card is");
test.assertIncludes(en, "one_more_tune_which_segment:", "a keynote segment has its own prompt");
test.assertIncludes(zh, "one_more_tune_which_segment:", "in both languages");

// ---- Practice is not mastery, and a fault is not a miss --------------------
const gradeFn = source.slice(source.indexOf("function oneMoreTuneGrade"), source.indexOf("function undoOneMoreTuneGrade"));
test.assertIncludes(gradeFn, "revealedThisSession", "a grade knows whether this session had just shown the answer");
test.assertMatches(gradeFn, /practiceOnly[\s\S]*record\.practiceGrade = grade\.id;/, "and keeps that one as practice");
test.assertMatches(gradeFn, /\} else if \(oneMoreTuneScheduler\) \{[\s\S]*scheduler\.next\(/, "only a cold recall moves the schedule, and the scheduler moves it");
test.assertMatches(gradeFn, /record\.dueAt = outcome\.card\.due\.getTime\(\)/, "the due date is the scheduler's own");
test.assertMatches(gradeFn, /scheduled: Boolean\(scheduled\)/, "the event says whether anything was scheduled");
test.assertMatches(gradeFn, /associationRevision: ONE_MORE_TUNE_DECK_VERSION/, "and which revision of the knowledge it graded");
test.assertMatches(gradeFn, /before,[\s\S]{0,200}after: scheduled/, "recording the state on both sides of the grade");
// Which library computes the dates is how the game works, not what the player
// reads: no surface names the scheduler.
test.assertNotIncludes(en, "one_more_tune_demo_schedule:", "the scheduler is not named to the player");

// The library ships as its own lazy bundle: the vendor step builds it, the
// window asks for it by itself, and the boot payload never carries it.
const preapp = readFileSync(new URL("../../tooling/build-preapp.mjs", import.meta.url), "utf8");
test.assertIncludes(source, 'const ONE_MORE_TUNE_SCHEDULER_URL = "/app/vendor/fsrs.js"', "the scheduler is a vendor file of its own");
test.assertMatches(source, /import\(`\$\{ONE_MORE_TUNE_SCHEDULER_URL\}/, "loaded on demand, not at boot");
test.assertIncludes(source, "function oneMoreTuneEnsureScheduler", "through one shared, retryable load");
test.assertIncludes(preapp, '"fsrs-vendor"', "the prebuild owns the bundle");
test.assertNotIncludes(html, "app/vendor/fsrs.js", "and index.html never loads it");
test.assertNotMatches(source, /const ONE_MORE_TUNE_DEMO_STEPS|oneMoreTuneGradePreviewDays/, "no demo ladder is left in the window");
const schedulerFn = source.slice(source.indexOf("function oneMoreTuneEnsureScheduler"), source.indexOf("function oneMoreTuneRating("));
test.assertNotIncludes(schedulerFn, "catch(() => {})", "a failed load returns null rather than a plausible object");

// ---- The links the research package found ----------------------------------
//
// The package's link update recorded the film for a number of questions, and
// those ids did not travel into the deck: the shelf was telling people no
// original was linked for cards whose original the research side had already
// written down. tooling/sync-one-more-tune-links.mjs fills that gap, and these
// are the rules it may not break.
const syncTool = readFileSync(new URL("../../tooling/sync-one-more-tune-links.mjs", import.meta.url), "utf8");
const launchIntentSource = read("app/core/launch-intent.js");
const publicSessionSource = readFileSync(new URL("../../apps/server/server/security/public-session.js", import.meta.url), "utf8");
const isVideoId = (value) => /^[\w-]{11}$/.test(String(value || ""));
test.assert(cards.some((card) => isVideoId(card.videoId)), "the deck carries the film links the package recorded");
for (const card of cards) {
  if (!Number.isInteger(card.sourceAnchor)) continue;
  // An anchor may exist with no video at all — those are the keynote rows,
  // which keep their position and give up the link rather than guess an
  // upload. What may never happen is an anchor bound to a *different* upload
  // than the one the card links to.
  if (card.anchorVideoId) {
    test.assert(isVideoId(card.videoId), `${card.id} binds its anchor to a video, so it links one`);
  }
  if (isVideoId(card.videoId) && card.anchorVideoId) {
  test.assert(card.anchorVideoId === card.videoId,
    `${card.id}'s anchor is bound to the upload it was read on, so it can never travel to another`);
  }
}
test.assertIncludes(syncTool, "cardVideo || packageVideo", "the tool fills a missing link and never replaces one");
test.assertIncludes(syncTool, "conflicts.push", "and reports a disagreement instead of overwriting it");
test.assertIncludes(syncTool, "joinOneMoreTuneCards", "joining through the shared rule");
test.assertIncludes(joinLib, "export function joinOneMoreTuneCards", "which is a module because two tools must agree about it");
test.assertIncludes(builder, "joinOneMoreTuneCards", "the evidence panel uses the same join");

// ---- The invite has to work for the person who receives it -----------------
//
// The whole point of a challenge link is that somebody else can open it: it
// lands on the challenge, it opens that exact ten, and it does not ask a
// first-time visitor to prove they are a person before the first question.

// ---- The bank's own cards are in the deck, and its links came with them -----
//
// The deck grew out of an earlier catalogue pass and the editorial bank is a
// second list; for a while the window carried only the overlap. The cards the
// research side pushed hardest — the three its playtest wired up, and Wingspan,
// the first task its instructions name — had no card at all. They do now, and
// the entries the research recorded for hearing the song are on the cards
// rather than in a package nobody opens.
{
  const bySong = (title) => cards.filter((card) => foldTitle(card.song) === foldTitle(title));
  for (const [title, product] of [
    ["Wingspan", "iPhone 16 Pro"],
    ["Down", "AirPods / iPhone 7 · Stroll"],
    ["The Difference (feat. Toro y Moi)", "AirPods Pro"],
  ]) {
    const found = bySong(title);
    test.assert(found.length >= 1, `the deck carries ${title}, which the research bank had and the window did not`);
    test.assert(found.some((card) => card.product === product), `and ${title} is filed under ${product}`);
  }
  // The playtest's third song was already here under the catalogue's own name.
  test.assert(bySong("New Soul").length >= 1, "and New Soul, the third of the three, is carried too");
  // A carried-over card keeps the package's note in the language it was written
  // in; a machine code is not a note.
  for (const card of cards) {
    const note = `${card.note?.en || ""} ${card.note?.zh || ""}`.trim();
    if (!note) continue;
    test.assert(!/^[a-z0-9_]+$/.test(note), `${card.id} carries prose, not an identifier (${note.slice(0, 40)})`);
  }
  // Where the song can be heard, and what the research says about it.
  const withMusic = cards.filter((card) => card.musicEntry);
  test.assert(withMusic.length >= 14, "the research side's music entries reached the deck");
  for (const card of withMusic) {
    test.assert(/^https?:\/\//.test(card.musicEntry.url), `${card.id}'s music entry is an address`);
    test.assert(typeof card.musicEntry.provider === "string" && card.musicEntry.provider,
      `${card.id}'s music entry names where it points`);
    test.assert(card.musicEntry.playbackTested !== true,
      `${card.id} does not claim a link nobody has played through`);
    if (card.musicEntry.provider === "spotify") {
      test.assert(card.musicEntry.use === "reference_only",
        `${card.id} keeps Spotify as a reference: the platform's policy does not permit this game to use its player`);
    }
  }
  const withAlternates = cards.filter((card) => (card.filmAlternates || []).length);
  for (const card of withAlternates) {
    for (const page of card.filmAlternates) {
      test.assert(/^https?:\/\//.test(page.url), `${card.id}'s alternate page is an address`);
      test.assert(page.playbackTested !== true, `${card.id}'s alternate page is not claimed as played`);
    }
  }
  test.assert(cards.some((card) => (card.filmAlternates || []).some((page) => page.provider === "vimeo")),
    "the production company's and the director's backup pages are carried, not left in the package");
  test.assertIncludes(source, "function oneMoreTuneMusicRow", "the window prints the song's own entry");
  test.assertIncludes(source, "function oneMoreTuneFilmAlternates", "and the other pages for the film");
  for (const key of ["one_more_tune_listen_song", "one_more_tune_music_untested", "one_more_tune_film_alternates"]) {
    test.assertIncludes(en, `${key}:`, `${key} has words in English`);
    test.assertIncludes(zh, `${key}:`, `${key} has words in Chinese`);
  }
  test.assertMatches(source, /oneMoreTuneMusicRow\(card\)/, "and the card face renders the song's entry");
}
test.assertMatches(source, /function oneMoreTuneShareLink/, "a round has a link, not only a code");
test.assertIncludes(source, "launch=one-more-tune&set=", "which opens the window and the set in one tap");
test.assertMatches(source, /function oneMoreTuneSetNumber/, "and the set prints as the design draws it");
test.assertMatches(source, /padStart\(4, "0"\)/, "four digits, the way the share card reads");
test.assertMatches(launchIntentSource, /\\d\{1,6\}\|\[A-Za-z0-9_-\]\{6,22\}/, "a shared link's set id may be a number or a legacy token");
test.assertMatches(source, /challengeId: `OMT\.\$\{parts\[1\]\}\.\$\{parts\[2\]\}`/, "the version travels with the code so the authority can refuse a stale one");
for (const pathname of ["/api/one-more-tune/round", "/api/one-more-tune/answer", "/api/one-more-tune/report"]) {
  test.assert(publicSessionSource.includes(`"${pathname}"`),
    `${pathname} is served to a visitor who has not been verified yet`);
}
test.assertIncludes(en, "one_more_tune_share_set:", "the result's invite control is named in English");
test.assertIncludes(zh, "one_more_tune_share_set:", "and in Chinese");
test.assertMatches(source, /async function shareOneMoreTuneInvite/, "the invite goes through the device's own share sheet when there is one");
test.assertMatches(source, /navigator\.share\(\{[\s\S]{0,200}url: link/, "carrying the link itself");
test.assertMatches(source, /await copyOneMoreTuneText\(link, "one_more_tune_share_copied"\)/, "and falling back to the clipboard, never to nothing");
test.assertMatches(source, /oneMoreTuneShareLink\(\) \|\| oneMoreTuneShareCode\(\)/, "the score card carries the link, so a pasted line stays tappable");
test.assertIncludes(en, "one_more_tune_share_sent:", "the outcome has words in English");
test.assertIncludes(zh, "one_more_tune_share_sent:", "and in Chinese");
test.assertMatches(source, /one-more-tune-desk-line[\s\S]{0,200}data-i18n="one_more_tune_desk_link"/, "the result names the desk this quiz is an app on");
test.assertIncludes(en, "one_more_tune_desk_link:", "in English");
test.assertIncludes(zh, "one_more_tune_desk_link:", "and in Chinese");
// A card travels without the link around it, so the address travels on the card.
test.assertMatches(source, /one_more_tune_share_card_desk[\s\S]{0,120}window\.location\?\.host/, "the share card names the desk and its address");
test.assertIncludes(en, "one_more_tune_share_card_desk:", "in English");
test.assertIncludes(zh, "one_more_tune_share_card_desk:", "and in Chinese");

// An exposure is its own kind of record.
const learnRender = source.slice(source.indexOf("function renderOneMoreTuneLearn"), source.indexOf("function renderOneMoreTuneMatch"));
test.assertIncludes(learnRender, 'type: "exposure"', "meeting a card logs an exposure, which is not a recall");

// Every event carries the two facts that decide whether it may be believed.
deck.grade(probe, "good");
const events = deck.events();
test.assert(events.length > 0, "grading writes an event");
test.assert(events.every((event) => event.demoOnly === true), "every event says it came from the demo scheduler");
test.assert(events.every((event) => typeof event.mediaPlayed === "boolean"), "and whether a sound actually reached the person");
test.assert(new Set(events.map((event) => event.eventId)).size === events.length,
  "each event has its own id, so a double tap cannot score twice");
test.assertIncludes(source, 'ONE_MORE_TUNE_STORAGE_KEY = "ai-system-6-one-more-tune-demo-v02"',
  "demo records live in a store named as one, never where a production history could be");

// ---- Where the progress lives, and how it leaves ---------------------------
//
// The spec asks for the visitor's learning state in IndexedDB, with a versioned
// export and import, date validation, deduplication and a way back from a
// refusal. The old localStorage record stays as the migration source and the
// fallback, because a browser that refuses a database must not take the study
// side down with it.
test.assertMatches(source, /indexedDB\.open\(ONE_MORE_TUNE_DB_NAME, 1\)/, "the state lives in a database of its own");
test.assertIncludes(source, 'const ONE_MORE_TUNE_DB_NAME = "ai-system-6-one-more-tune"', "named, so nothing else is written to by accident");
test.assertMatches(source, /oneMoreTuneDatabaseRead\(database\)[\s\S]{0,400}oneMoreTuneReadLocalState\(\)/, "the old localStorage record is read when the database has nothing");
test.assertMatches(source, /oneMoreTuneDatabaseWrite\(database, oneMoreTuneState\)/, "and copied into it once, so the database becomes the writer");
test.assertNotIncludes(source, "removeItem(ONE_MORE_TUNE_STORAGE_KEY)", "the old record is kept: it is the only copy if the database stops opening");
test.assertMatches(source, /oneMoreTuneStorageSource = oneMoreTuneLocalWrite\(state\) \? "local" : "none"/, "a refused write falls back to the older store and then says so");
{
  const payload = deck.progress.exportPayload();
  test.assert(payload.app === "one-more-tune" && payload.schema === 1, "an export names the app and its file format");
  test.assert(Number.isFinite(Date.parse(payload.exportedAt)), "and carries the date it was written");
  test.assert(Number.isInteger(payload.deckVersion), "and the deck it belongs to");
  test.assertIncludes(source, "one-more-tune-progress-", "the file it writes is named for what it is");

  const cardId = cards[0].id;
  const base = {
    app: "one-more-tune",
    schema: 1,
    exportedAt: new Date(Date.now() - 60_000).toISOString(),
    cards: { [cardId]: { ...deck.record(cardId), met: true, dueAt: 1234 } },
    events: [
      { eventId: "imported-one", at: Date.now() - 5000, type: "recall", cardId },
      { eventId: "imported-one", at: Date.now() - 5000, type: "recall", cardId },
    ],
  };
  const accepted = deck.progress.readFile(JSON.stringify(base));
  test.assert(accepted.ok === true, "a well-formed file is accepted");
  test.assert(accepted.state.cards[cardId].dueAt === 1234, "its card record comes in");
  test.assert(accepted.state.events.filter((event) => event.eventId === "imported-one").length === 1,
    "and its duplicate events are merged by id, not appended twice");

  const notOurs = deck.progress.readFile(JSON.stringify({ ...base, app: "something-else" }));
  test.assert(notOurs.ok === false && notOurs.reason === "one_more_tune_progress_not_ours", "a file from another app is refused by name");
  const tooNew = deck.progress.readFile(JSON.stringify({ ...base, schema: 2 }));
  test.assert(tooNew.ok === false && tooNew.reason === "one_more_tune_progress_too_new", "a newer file format is refused rather than half-read");
  const noDate = deck.progress.readFile(JSON.stringify({ ...base, exportedAt: "" }));
  test.assert(noDate.ok === false && noDate.reason === "one_more_tune_progress_no_date", "a file with no export date is refused");
  const future = deck.progress.readFile(JSON.stringify({ ...base, exportedAt: new Date(Date.now() + 5 * 86400000).toISOString() }));
  test.assert(future.ok === false && future.reason === "one_more_tune_progress_from_future", "and one dated in the future is refused too");
  const garbage = deck.progress.readFile("{not json");
  test.assert(garbage.ok === false && garbage.reason === "one_more_tune_progress_unreadable", "unreadable bytes are refused as such");
  const unknownCard = deck.progress.readFile(JSON.stringify({ ...base, cards: { "OMT-999": { met: true, dueAt: 5 } } }));
  test.assert(unknownCard.ok === true && !unknownCard.state.cards["OMT-999"], "a card this deck does not have is dropped rather than invented");

  // A range is a judgement, and the package asks the editor to keep the reason
  // with it: the range goes in the record, the argument goes in the log, and a
  // later range does not erase the earlier reasoning.
  const clipCard = cards[1].id;
  deck.setQuizClip(clipCard, { start: 12, end: 24, reason: "the vocal phrase, not the intro" });
  const clipEvents = deck.events().filter((event) => event.type === "clip" && event.cardId === clipCard);
  test.assert(clipEvents.length === 1, "changing a range writes one event");
  test.assert(clipEvents[0].start === 12 && clipEvents[0].end === 24 && clipEvents[0].auditioned === true,
    "carrying the range it saved");
  test.assert(clipEvents[0].reason === "the vocal phrase, not the intro", "and the reason the person gave");
  test.assert(deck.record(clipCard).quizClip.reason === "the vocal phrase, not the intro", "which stays with the record");
  deck.setQuizClip(clipCard, { end: 26, reason: "the phrase runs two seconds longer" });
  test.assert(deck.events().filter((event) => event.type === "clip" && event.cardId === clipCard).length === 2,
    "and a second judgement is a second entry, not a rewrite");
  // A reason typed on its own is logged when the field commits, not per
  // keystroke: a half-typed sentence is a draft, a sentence left is a judgement.
  test.assertIncludes(source, "function setOneMoreTuneClipReason", "the reason can be recorded on its own");
  test.assertMatches(source, /one-more-tune-clip-reason"\) \{[\s\S]{0,200}setOneMoreTuneClipReason\(cardId/, "and it is logged on the field's change, not its input");
  deck.setQuizClip(clipCard, { reason: "" });
  test.assert(deck.events().filter((event) => event.type === "clip" && event.cardId === clipCard).length === 2,
    "an unchanged range writes nothing");
  const reasonEventsBefore = deck.events().filter((event) => event.type === "clip" && event.cardId === clipCard).length;
  deck.setQuizClip(clipCard, { reason: "the same sentence twice" });
  test.assert(deck.events().filter((event) => event.type === "clip" && event.cardId === clipCard).length === reasonEventsBefore,
    "and a range call without a range change stays quiet, so the committed reason is what logs");
  test.assertIncludes(source, "one-more-tune-clip-reason", "the editor has a field for it");
  test.assertIncludes(en, "one_more_tune_clip_reason:", "named in English");
  test.assertIncludes(zh, "one_more_tune_clip_reason:", "and in Chinese");

  // The outcome is said inside this window. The desk's own status line is
  // behind the window on a phone, so a message that only reached it would be a
  // message nobody saw.
  const shelf = source.slice(source.indexOf("function renderOneMoreTuneShelf"), source.indexOf("function renderOneMoreTuneStudy"));
  test.assertMatches(shelf, /one-more-tune-progress-state[\s\S]{0,300}oneMoreTuneStorageSourceKey\(\)/, "the shelf says which store holds the progress");
  test.assertMatches(shelf, /one-more-tune-progress-note" role="status"/, "and keeps a line for what just happened to it");
  test.assertMatches(shelf, /one-more-tune-export-progress[\s\S]{0,300}one-more-tune-progress-input/, "with the export and the import beside it");
  test.assertMatches(source, /function noteOneMoreTuneProgress/, "one place writes that line");
  for (const key of ["one_more_tune_progress_exported", "one_more_tune_progress_imported", "one_more_tune_progress_export_failed", "one_more_tune_progress_unreadable"]) {
    test.assertMatches(source, new RegExp(`noteOneMoreTuneProgress\\("${key}`), `and ${key} goes through it`);
  }
}

// The last mis-tap can be taken back.
test.assert(deck.undo() === true, "a grade can be undone");
test.assert(deck.events().some((event) => event.undone === true), "and the log records the withdrawal instead of erasing it");

// A player fault never becomes a grade.
const playFn = source.slice(source.indexOf("function playOneMoreTuneWindow"), source.indexOf("function playOneMoreTuneClip"));
test.assertNotIncludes(playFn, "oneMoreTuneGrade", "a failed play never records a miss");
test.assertIncludes(source, "start(0, start, length)", "the segment's end is scheduled by the audio clock, not by a timer that pauses late");

// ---- The challenge is the round the brief describes -------------------------
//
// The design went through a scored listening ladder — three seconds for 100,
// seven for 70, fifteen for 40, twenty-five seconds a question — and dropped it
// before this version: "三秒、七秒、十五秒的分级试听，以及默认二十五秒倒计时，都先拿掉".
// What a round is now: ten questions, no clock, one submission each, a point a
// question, and a question whose sound never played is skipped rather than lost.
test.assertIncludes(source, "ONE_MORE_TUNE_ROUND_SIZE = 10", "ten questions a round");
test.assertNotIncludes(source, "ONE_MORE_TUNE_QUESTION_SECONDS", "no clock");
test.assertNotIncludes(source, "ONE_MORE_TUNE_LADDER", "and no scored rungs");
// No countdown clock, and no poller either: the player reports its own state
// through the platform's API rather than being asked on a timer.
test.assertNotIncludes(source, "oneMoreTuneSecondsLeft", "nothing counts down while a question is open");
test.assertNotIncludes(source, "setInterval", "and nothing polls the player either");
test.assertIncludes(source, "question.points = question.correct ? 1 : 0;", "a question is worth one point, right or nothing");
test.assertMatches(source, /question\.everHeard = true;/, "re-listening is recorded as a count, not as a score");
test.assertMatches(source, /question\.mediaFailed = true;/, "a cue that will not play is marked, so it can be skipped as broken");
test.assertMatches(source, /function submitOneMoreTuneAnswer[\s\S]{0,400}if \(!question \|\| question\.submitted\) return;/, "one submission a question");
// A private listening round needs a segment the person auditioned in their own
// copy; otherwise the round comes from the authority, and every round sounds:
// licensed file, then the store preview, then the song's own video. There is no
// silent round and no generated tone — a game played by ear needs the music.
test.assertMatches(source, /function oneMoreTuneChallengePool\(\)[\s\S]{0,320}oneMoreTuneReadiness\(card\.id\)\.recall && oneMoreTuneHasAudio/,
  "a private practice round is built only from cards whose file the person auditioned");
test.assert(serverDeck.publishableCards().length === 0, "the round authority publishes nothing yet");
test.assert((await serverDeck.startRound({})).mode === "preview",
  "so the round it hands out plays the store preview");
{
  const refused = await serverDeck.startRound({ allowPreview: false, allowYoutube: false });
  test.assert(refused.mode === "unavailable" && refused.code === "no_sound" && refused.questions.length === 0,
    "with no source allowed there is no round at all, rather than a silent one");
  const played = await serverDeck.startRound({});
  test.assert(played.questions.length === 10 && played.questions.every((question) => question.media.provider === "preview"),
    "every question a round hands out plays its pinned store preview — none arrives unplayable");
}
test.assertNotMatches(source, /generated_cue|RenderDemoCue|ONE_MORE_TUNE_DEMO_SECONDS|mode: "silent"/,
  "the window has no generated cue and no silent round");
test.assertNotMatches(serverSource, /generated_cue|DEMO_CUE_SECONDS|"demo"|mode: "silent"/,
  "and neither does the authority");
test.assert(serverDeck.report().mode === "preview",
  "and the report names the same first source a round would reach for, or the challenge screen prints a sentence about a different round");
// The YouTube route is a live lookup and does not belong in a milliseconds
// contract; what belongs here is its shape. The provider order and the matching
// rules are what decide whether a question could ever play the wrong recording.
test.assertIncludes(serverSource, 'const mode = licensed.length ? "licensed" : wantsPreview ? "preview" : "youtube";',
  "the round prefers a licensed asset, then the store preview, then the song's own video, and nothing after that");
test.assertIncludes(serverSource, "if (!title.includes(wanted)) continue;",
  "a song video is only accepted when its title names the song");
test.assertIncludes(serverSource, "function channelCore(value) {",
  "a channel is folded down to the artist inside it, because the artist's own channel is rarely the artist's name verbatim");
test.assertIncludes(serverSource, "&& (channel.includes(wantedArtist) || wantedArtist.includes(channel));",
  "and a song video is only accepted when that folded channel is the artist");
test.assertIncludes(serverSource, 'const alternate = [" live", " remix", " cover",',
  "while a live take, a remix or a cover is refused as a different recording");
test.assertIncludes(source, 'media.provider === "youtube" && !/^[\\w-]{11}$/.test(String(media.videoId || ""))',
  "a song video must carry a well-formed id before the window will render it");
// ---- The way back to the film, and the timestamp that may travel with it ----
//
// A link to the original is the reveal's job. On a question face its title
// alone would be the answer, and the platform's policies forbid the other
// option — splitting the audio out of a hidden player. The timestamp travels
// only when it was measured on the very video being linked.
{
  const withAnchorAndVideo = cards.filter((card) => Number.isInteger(card.sourceAnchor) && card.videoId);
  test.assert(withAnchorAndVideo.length > 0, "at least one card carries both a video and an anchor");
  for (const card of withAnchorAndVideo) {
    test.assert(card.anchorVideoId === card.videoId,
      `${card.id} binds its anchor to the video it was measured on`);
  }
  // Some keynote anchors still have no video id at all: the position is known
  // and the upload is not, so those rows keep the timestamp and give up the
  // link rather than pointing at a guess. (Three of these gained their film's
  // video when the package's link update was taken into the deck; the rule is
  // that a row with no video stays a row with no video.)
  const anchorNoVideo = cards.filter((card) => Number.isInteger(card.sourceAnchor) && !card.videoId);
  test.assert(anchorNoVideo.length >= 1, "the keynote anchors are kept even though no video is linked");
  test.assert(anchorNoVideo.every((card) => !card.anchorVideoId),
    "and none of them invents an upload to point its anchor at");
  test.assert(anchorNoVideo.every((card) => !card.anchorVideoId), "and none of them is given a video to point at");

  test.assertIncludes(source, "function oneMoreTuneWatchLink", "one place builds the link");
  test.assertMatches(source, /const anchorBound = card\.anchorVideoId === videoId/,
    "and it drops the timestamp when the anchor was not measured on that video");
  test.assertMatches(source, /\/\^\[\\w-\]\{11\}\$\/\.test\(videoId\)/, "a malformed id never becomes a URL");
  test.assertIncludes(source, 'rel="noopener noreferrer"', "the link opens safely");

  // The embed exists, and only where the answer already is. The reference
  // implementation this deck follows does the same thing at its reveal and keeps
  // a link for the videos that refuse to be embedded; what none of them may do is
  // put a film on a question face.
  test.assertIncludes(source, "https://www.youtube-nocookie.com", "the reveal embeds the privacy-enhanced host");
  test.assertIncludes(source, "?enablejsapi=1&rel=0&playsinline=1", "with the reference's own parameters, on the frame the API attaches to");
  // The film is watched in a window of its own: the press opens it, and the
  // window it opens is the one the desk's registry knows.
  test.assertMatches(source, /async function playOneMoreTuneFilm\(button\)[\s\S]{0,900}openOneMoreTuneFilmWindow\(card/,
    "and the press opens the film window rather than mounting a player in the answer card");
  test.assertMatches(source, /async function openOneMoreTuneFilmWindow\(card[\s\S]{0,2400}oneMoreTuneMountPlayer\(ONE_MORE_TUNE_FILM_STAGE/,
    "where the player is mounted by that press, not by rendering");
  test.assertIncludes(source, 'const ONE_MORE_TUNE_FILM_WINDOW = "oneMoreTuneFilm";',
    "the film window has a name of its own");
  test.assertMatches(source, /function installOneMoreTuneFilmWindow\(\)[\s\S]{0,400}AISystem6ApplicationShell\.createWindow\(\{\s*windowName: ONE_MORE_TUNE_FILM_WINDOW/,
    "and is built through the shared window shell, so it wears the desk's chrome");
  test.assertMatches(source, /MutationObserver[\s\S]{0,400}is-hidden[\s\S]{0,120}stopOneMoreTuneFilm\(\)/,
    "closing it stops the film, whichever way it was closed");
  test.assertIncludes(source, "installFilmWindow: () => installOneMoreTuneFilmWindow()",
    "the window can be mounted without a card open, which is what the desk's gates do");
  test.assertNotIncludes(source, '<div class="one-more-tune-film" id="one-more-tune-film"',
    "and nothing embeds the film inside the reveal any more");
  test.assertMatches(source, /oneMoreTuneVideo\.videoId === videoId/,
    "a second card's film rebuilds the player instead of leaving the first one playing");

  // ---- A game played by ear has to make a sound anywhere -------------------
  //
  // Every question's sound is a store preview, and a network that cannot reach
  // Apple's CDN — or reaches it too slowly to start a round — would leave the
  // game silent, which is not a harder game, it is no game. The same bytes come
  // back through this desk's own host when the direct fetch fails; the relay
  // answers only for the URLs the deck itself pins, so it is not a proxy.
  const serverRouteSource = read("apps/server/server/routes/one-more-tune.js");
  const serverDeckSource = read("apps/server/server/one-more-tune.js");
  test.assertIncludes(source, "function oneMoreTunePreviewSources(url) {",
    "one question's sound has a source chain of its own");
  test.assertMatches(source, /oneMoreTunePreviewSources\(url\) \{[\s\S]{0,1800}const relay = `\/api\/one-more-tune\/preview\?url=/,
    "one question's sound has two places it can come from, named once");
  test.assertMatches(source, /for \(const source of oneMoreTunePreviewSources\(media\.url\)\)/,
    "and the decoded path walks that chain rather than giving up on the first failure");
  // The chain is not an iOS workaround and must not pretend to be one: the
  // store's CDN answers with `Access-Control-Allow-Origin: *` (measured), so
  // the cross-origin fetch and decode is allowed and a media element needs no
  // CORS at all. The relay is for a network that cannot reach the CDN — the
  // one failure the store's own headers cannot answer.
  test.assertMatches(source, /oneMoreTunePreviewSources\(url\) \{[\s\S]{0,900}return \[direct, relay\];/,
    "and the store's CDN stays the first source for everyone, with the relay as the network's fallback");
  test.assertIncludes(source, "Access-Control-Allow-Origin: *",
    "and the reason is written down where the chain is, not assumed to be iOS");

  // The phone-only silence: iOS plays Web Audio as ambient (muted by the
  // ring/silent switch) and media elements as playback (not muted), and the
  // ring switch exists on iPhones, not on iPads or desks — which is exactly
  // the shape of the report: it sounds on a desk and on an iPad and is silent
  // on a phone. Safari 16.4+ lets the page declare its session; the first tap
  // additionally plays the silent element unmuted, which is what moves the
  // session on older iPhones.
  test.assertIncludes(source, "function oneMoreTuneClaimPlaybackAudioSession() {",
    "a page that is played by ear says out loud that it is playback, not ambience");
  test.assertMatches(source, /session\.type = "playback";/,
    "by declaring the audio session Safari 16.4 added for exactly this");
  test.assertMatches(source, /function unlockOneMoreTuneAudio\(\) \{\s*\n\s*oneMoreTuneClaimPlaybackAudioSession\(\);/,
    "and the tap that unlocks the context claims the session in the same breath");
  test.assertMatches(source, /oneMoreTuneAudio\.context = new Ctor\(\);|new Ctor\(\)/,
    "with the context built beside it");
  test.assertIncludes(source, "function oneMoreTuneSilentWavUrl() {",
    "the unlock plays silence this file builds, so no round trip sits inside a gesture");
  test.assertMatches(source, /element\.muted = false;[\s\S]{0,400}element\.src = oneMoreTuneSilentWavUrl\(\);/,
    "and it plays unmuted, because a muted element moves no audio session");
  test.assertMatches(source, /oneMoreTuneLoadPreviewElement\(key, oneMoreTunePreviewSources\(media\.url\)\)/,
    "so does the media-element path WebKit takes");
  test.assertIncludes(serverDeckSource, "function isPinnedPreviewUrl(value) {",
    "the relay's allowlist is the deck's own pinned previews");
  test.assertMatches(serverRouteSource, /searchParams\.get\("url"\)[\s\S]{0,220}deck\.isPinnedPreviewUrl\(url\)/,
    "and the route refuses anything the deck did not pin");
  const routerSource = read("apps/server/server/router.js");
  test.assertIncludes(routerSource, '{ method: "GET", prefix: "/api/one-more-tune/preview", handler: handleOneMoreTunePreview }',
    "the route is registered for the local host and for the public profile");
  const publicSession = read("apps/server/server/security/public-session.js");
  test.assertIncludes(publicSession, '"/api/one-more-tune/preview",',
    "and a reader with no session may still hear question one");

  // A network that cannot reach YouTube gets an honest film window instead of a
  // player that never paints. That is the film only: the question's sound never
  // comes from the platform.
  test.assertIncludes(source, "function oneMoreTuneProbeYouTube(timeoutMs = 2500) {",
    "the window asks whether this network can reach YouTube");
  test.assertMatches(source, /async function oneMoreTuneYouTubeReachable\(\)[\s\S]{0,400}oneMoreTuneRememberNetwork/,
    "and remembers the answer for the session instead of asking per film");
  test.assertMatches(source, /if \(!await oneMoreTuneYouTubeReachable\(\)\) \{[\s\S]{0,200}one_more_tune_film_blocked/,
    "a blocked network gets the sentence, not a black rectangle");
  test.assertIncludes(en, "one_more_tune_film_blocked:",
    "and the sentence exists in English");
  test.assertIncludes(read("app/data/translations-zh.js"), "one_more_tune_film_blocked:",
    "and in Chinese");
  test.assertIncludes(source, "https://www.youtube.com/iframe_api", "the platform's own IFrame API is what drives playback");
  test.assertIncludes(source, "new api.Player(frame, {", "one place builds a player, for the reveal and for a song question alike");
  test.assertIncludes(source, "oneMoreTuneVideoFrame(`${ONE_MORE_TUNE_YT_ORIGIN}/embed/${encodeURIComponent(videoId)}?enablejsapi=1", "and it builds the privacy-enhanced player");
  // The page is served no-referrer; a frame the API builds inherits that and
  // YouTube refuses it with error 153. Every frame carries its own policy.
  test.assertIncludes(source, 'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>', "the frame sends its origin as referrer, or YouTube answers 153");
  test.assertNotIncludes(source, "new api.Player(slot", "the API never builds a frame of its own");
  test.assertIncludes(source, "if (state === 1 && typeof onPlaying === \"function\") onPlaying();",
    "a listen is recorded only when the platform says it is playing");
  test.assertIncludes(source, 'class="one-more-tune-film one-more-tune-song" id="one-more-tune-question-film"',
    "a song question renders a placeholder for YouTube's own visible player");
  test.assertNotIncludes(source.slice(source.indexOf("function oneMoreTuneSongEmbed"), source.indexOf("function playOneMoreTuneSong")), "autoplay",
    "and it never autoplays: nothing sounds until a person presses play");
  test.assertMatches(source, /if \(code === 153\)[\s\S]{0,80}if \(code === 101 \|\| code === 150\)[\s\S]{0,80}if \(code === 100\)/,
    "with the three refusals named separately, as the reference names them");
  const challengeQuestion = source.slice(
    source.lastIndexOf('clearOneMoreTuneNowPlaying();\n  body.innerHTML'),
    source.indexOf("function renderOneMoreTuneRoundResult"),
  );
  test.assertNotIncludes(challengeQuestion, "oneMoreTuneFilmRow", "a challenge question never draws the film row");
  test.assertNotIncludes(challengeQuestion, "youtube.com", "and never links to the film");
  test.assertNotIncludes(challengeQuestion, "<iframe", "and never embeds one");
  const css = read("styles/97-one-more-tune.css");
  test.assertIncludes(css, ".one-more-tune-film {", "the reveal player is styled");
  // Only the base block: the `[hidden]` override is how the empty slot stays
  // collapsed before a click mounts the frame, so it is not a hiding rule.
  const filmStart = css.indexOf(".one-more-tune-film {");
  const filmCss = css.slice(filmStart, css.indexOf("}", filmStart) + 1);
  for (const hiding of ["display: none", "visibility: hidden", "opacity: 0", "height: 0", "width: 0"]) {
    test.assertNotIncludes(filmCss, hiding, `the reveal player is not ${hiding}`);
  }
}

// ---- A wide window is a desk, not a phone stretched ------------------------
//
// The phone's strategy is one column that has to fit one screen. A desk's is
// the opposite: spend the width. The round puts the music and the question on
// the left and the four answers on the right, the entry face puts its copy
// beside its two ways in, and the ten answers flow down two columns (three on a
// wider window) so the round is read as a page rather than a list.
test.assertIncludes(source, 'data-one-more-tune-command="one-more-tune-play-again"',
  "the round result offers another round, not only the way out");
test.assertIncludes(source, 'if (action === "one-more-tune-play-again") return startOneMoreTuneRound();',
  "and that button starts a real round through the same door as the shelf");
test.assertIncludes(source, '"one-more-tune-play-again",', "the button's press unlocks the audio, so its first question sounds by itself");
{
  const css = read("styles/97-one-more-tune.css");
  const wideStart = css.indexOf("@container (min-width: 851px)");
  const wideEnd = css.indexOf("/* The left column's own grammar");
  const wide = css.slice(wideStart, wideEnd);
  test.assert(wideStart > 0 && wideEnd > wideStart, "the file declares a wide strategy, and it is the one this contract reads");
  test.assertIncludes(wide, "grid-template-areas:", "the wide strategy places blocks by area instead of stacking them");
  test.assertIncludes(wide, ".one-more-tune-step-challenge", "the listening face gets its own wide layout");
  // The question and its four answers are one block on a desk (the wrapper the
  // face puts them in), so the question can never drift away from the answers it
  // belongs to, and the block is what the column centers.
  test.assertIncludes(wide, "grid-area:ask", "the question and its four answers take one column, together");
  test.assertIncludes(wide, "justify-content:center", "and are centered in it rather than clinging to its top edge");
  // The reveal keeps the question's own two columns and puts the way onward at
  // the bottom of the column the answers were given in — the pointer the person
  // just used does not have to cross the window to leave the question.
  test.assertIncludes(wide, ".one-more-tune-round-reveal", "the reveal has a desk layout of its own");
  test.assertIncludes(wide, '"stage record"', "the stage and the record are the question's two columns again");
  test.assertIncludes(wide, "grid-area:tail", "and the actions live in the record's column");
  test.assertIncludes(wide, "columns:2", "the ten answers flow down two columns");
  test.assertIncludes(wide, "@container (min-width: 1000px)", "and three on a window wide enough to hold them");

  // ---- What makes the six appearances six, in this window -------------------
  //
  // The quiz is a window on a desk that has six appearances, and each one has to
  // reach the parts this deck draws. Three rules do it, all by token, so no part
  // of the sheet learns which appearance is on (the budget counts the two
  // appearance selectors the era dithers need, and it may only fall).
  test.assertMatches(sheet, /\.one-more-tune-window \.choice \{[^}]*background:var\(--btn-bg\)[^}]*color:var\(--btn-fg\)/,
    "an answer wears the appearance's control fill and ink, not a panel's");
  test.assertMatches(sheet, /\.one-more-tune-window \.choice \{[^}]*border:var\(--system-control-line\) solid var\(--btn-border-color\)/,
    "and the appearance's control frame, which is what makes it System 6's white square or Aqua's gel");
  test.assertNotMatches(sheet, /\.one-more-tune-window \.btn \{[^}]*background:var\(--ink\)/,
    "the primary button no longer paints itself with the desk's ink");
  test.assertMatches(sheet, /\.one-more-tune-tabs \.system-tab \{[\s\S]{0,1400}--tab-edge-content: none/,
    "and the tab strip refuses the era end caps, which painted 14px of tab art over every label in Platinum");
}

// ---- The menu bar is where the round's commands live -----------------------
//
// The question face stopped carrying a row of four buttons, and the reveal and
// the result shed theirs: a menu is what this bar is for — necessary actions
// that are almost never wanted mid-question. Every one of them is a real
// command with its own availability, so a row that cannot run greys out rather
// than disappearing.
{
  const menuSet = source.slice(source.indexOf('window.AISystem6RegisterApplicationMenuSet?.("oneMoreTune"'));
  const pruned = [
    "one-more-tune-round-next",
    "one-more-tune-round-skip",
    "one-more-tune-find-film",
    "one-more-tune-play-again",
    "one-more-tune-end-round",
    "one-more-tune-add-to-study",
    "one-more-tune-share-question",
    "one-more-tune-report",
    "one-more-tune-review-misses",
    "one-more-tune-share-set",
    "one-more-tune-share-card-image",
    "one-more-tune-share-score",
  ];
  for (const action of pruned) {
    test.assertIncludes(menuSet, `action: "${action}"`, `the Study menu carries ${action}`);
    test.assertIncludes(menuSet, `conditionId: "${action}"`, `and ${action} knows when it cannot run`);
  }
  test.assertIncludes(source, '"one-more-tune-play-again",', "the new round command is a registered command, so its menu row has a verdict");

  // The result face keeps three buttons; the three share actions are menus now.
  const resultFace = source.slice(
    source.indexOf("function renderOneMoreTuneRoundResult"),
    source.indexOf("function oneMoreTuneRoundReviewRow") > 0
      ? source.indexOf("function oneMoreTuneRoundReviewRow")
      : source.indexOf("function reviewOneMoreTuneMisses"),
  );
  const resultCommands = [...resultFace.matchAll(/data-one-more-tune-command="([^"]+)"/g)].map((match) => match[1]);
  test.assert(resultCommands.length === 3,
    `the result face carries three buttons, not a rail of six (${resultCommands.join(", ")})`);
  test.assert(resultCommands.includes("one-more-tune-play-again") && resultCommands.includes("one-more-tune-review-misses")
    && resultCommands.includes("one-more-tune-share-round"),
    "and they are another round, sending this round to a friend, and the misses");
  // Leaving the round is still one press away, in the Study menu — what left
  // the face is the button, not the action.
  test.assertIncludes(source, 'action: "one-more-tune-end-round", labelKey: "one_more_tune_leave"',
    "and leaving the round lives in the menu");

  // ---- What leaves the desk when a round is shared -------------------------
  //
  // The card that travels to WeChat, Telegram and iMessage is the poster, and
  // the round it describes decides what the poster looks like: the era of the
  // last question is the ribbon at the top and the line that names it, so two
  // rounds of the same ten do not produce the same card. Two things are absent
  // on purpose — a song title (the same ten questions play for whoever opens
  // the link, so a name is the answer) and any comparison with somebody else's
  // score, because this is meant to be a happy thing to send, not a ladder.
  test.assertIncludes(source, "function oneMoreTuneRoundEra(round = oneMoreTuneRound) {",
    "the poster takes its era from the round's last answered question");
  test.assertMatches(source, /const closingEra = oneMoreTuneRoundEra\(round\);[\s\S]{0,320}ctx\.fillRect\(0, 0, size, 14\)/,
    "and paints that era as the ribbon across the top of the card");
  test.assertIncludes(en, 'one_more_tune_share_card_era: "last one landed in {era}"',
    "in words as well, because a colour is never the only carrier on this card");
  test.assertIncludes(en, "one_more_tune_share_card_bilibili:",
    "the card says where to follow the person who made it");
  test.assertIncludes(source, 'const ONE_MORE_TUNE_BILIBILI = "space.bilibili.com/544081956";',
    "and that address is named once");

  // ---- A link arrives at a locked door, and says so ------------------------
  //
  // A tap on a link inside a chat window is not a gesture in this page, so the
  // browser keeps the first question's sound shut until the reader touches the
  // player (measured: heard 0 on arrival, 1 after one tap, both engines). The
  // face tells them, once, and the line leaves as soon as it is no longer true.
  test.assertIncludes(source, "let oneMoreTuneArrivedFromLink = false;",
    "arriving from somebody's link is a state the window keeps");
  test.assertMatches(source, /if \(intent\.set\) \{\s*oneMoreTuneArrivedFromLink = true;/,
    "set where the round is opened from that link");
  test.assertMatches(source,
    /oneMoreTuneArrivedFromLink && !question\.everHeard \? `<p class="playstate">[\s\S]{0,260}one_more_tune_tap_to_hear_hint/,
    "and the question face asks for the one tap that starts the music");
  test.assertIncludes(en, "one_more_tune_tap_to_hear:",
    "in English");
  test.assertIncludes(zh, "one_more_tune_tap_to_hear:",
    "and in Chinese");
  test.assertMatches(source, /async function shareOneMoreTuneRound\(\)[\s\S]{0,1400}navigator\.share\(\{[\s\S]{0,200}files: \[file\]/,
    "sharing offers the poster as a file first, which is what a chat app accepts");
  test.assertMatches(source, /async function shareOneMoreTuneRound\(\)[\s\S]{0,2200}downloadOneMoreTuneShareCard\(\)/,
    "falls back to saving the image when the platform has no share sheet");
  test.assertMatches(source, /async function shareOneMoreTuneRound\(\)[\s\S]{0,2600}copyOneMoreTuneText\(text, "one_more_tune_share_round_saved"\)/,
    "and always leaves the text on the clipboard, because a paste always works");
  test.assertNotIncludes(resultFace, '"one-more-tune-share-set"',
    "the round's own share is not three separate rows wearing one face");
  for (const moved of ["one-more-tune-share-set", "one-more-tune-share-card-image", "one-more-tune-share-score"]) {
    test.assertNotIncludes(resultFace, moved, `the result face no longer carries ${moved}`);
  }
}

// ---- Two keys, and only inside this window ---------------------------------
test.assertMatches(source,
  /function handleOneMoreTuneKeydown\(event\) \{\s*\n\s*if \(document\.querySelector\("\.window\.is-active"\)\?\.dataset\.window !== "oneMoreTune"\) return;[\s\S]{0,400}target\.matches\("input, textarea, select, \[contenteditable='true'\]"\)\) return;/,
  "the keys listen only while One More Tune is the active window, and never while a field has focus");
test.assertMatches(source,
  /event\.key === " " && !event\.repeat[\s\S]{0,400}runOneMoreTuneCommand\("one-more-tune-hear"\)/,
  "Space plays the cue again through the same command the menu uses");
test.assertMatches(source,
  /event\.key === "Enter" && oneMoreTuneRound && oneMoreTuneQuestion\(\)\?\.submitted[\s\S]{0,120}runOneMoreTuneCommand\("one-more-tune-round-next"\)/,
  "Return takes the next question once the answer is in");
test.assertNotIncludes(source.replace(/function handleOneMoreTuneKeydown[\s\S]*?\n}/, ""), 'event.key === "Enter"',
  "and neither key is handled anywhere else in the module");

// ---- The result page names five outcomes, and never by colour alone --------
//
// Right, wrong, skipped, a cue that never played, and an answer the round would
// not take. The fifth is the one this contract grew: an answer the server
// refused used to fall through to "wrong", which scored a person for a refusal
// that was not theirs.
test.assertMatches(source, /const mark = question\.correct \? "✓"\s*\n\s*: question\.answerFailed \? "!"\s*\n\s*: question\.mediaFailed \? "⚠"\s*\n\s*: question\.outcome === "skipped" \? "–" : "✗";/,
  "each row carries a mark, so a result is never told by colour alone");
test.assertMatches(source, /const stateKey = question\.correct \? "one_more_tune_right"[\s\S]{0,200}one_more_tune_answer_unaccepted[\s\S]{0,200}one_more_tune_skipped/,
  "and right, wrong, skipped, never-played and not-counted are five outcomes, not two");
test.assertMatches(source, /const broken = questions\.filter\(\(question\) => question\.mediaFailed && !question\.correct\)\.length;/,
  "the result separates questions whose cue never played from the ones answered wrong");
test.assertMatches(source, /mediaPlayed: question\.everHeard === true/,
  "the event records sound that actually started, not the button being pressed");

// ---- Bilingual, key for key -------------------------------------------------
//
// Every key the module renders has to exist in both files, or a Chinese reader
// gets an English word and an English reader gets a key.
const keys = [...new Set([
  ...[...source.matchAll(/data-i18n="([a-z0-9_]+)"/g)].map((match) => match[1]),
  ...[...source.matchAll(/t\("([a-z0-9_]+)"\)/g)].map((match) => match[1]),
  ...[...source.matchAll(/labelKey: "([a-z0-9_]+)"/g)].map((match) => match[1]),
  ...[...source.matchAll(/reasons\.push\("([a-z0-9_]+)"\)/g)].map((match) => match[1]),
])];
for (const key of keys.filter((key) => key.startsWith("one_more_tune"))) {
  test.assertIncludes(en, `${key}:`, `English has ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese has ${key}`);
}

// The sentences a computed branch picks are not literals in the markup, so they
// are named here. A sentence chosen at runtime is exactly the kind that goes
// missing from one language and is never noticed, and it is also the kind that
// goes stale about what a round is playing.
for (const key of [
  "one_more_tune_anchor_auditioned", "one_more_tune_anchor_not_auditioned", "one_more_tune_no_round_pool",
  // A menu row's refusal is returned as `reason`, not pushed into a list, so the
  // extractor above never sees it — and a greyed-out row with a missing sentence
  // is the one place a person reads a key where an explanation belongs.
  "one_more_tune_nothing_to_retry",
]) {
  test.assertIncludes(en, `${key}:`, `English has the sentence ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese has the sentence ${key}`);
}

// ---- Backstage stays backstage -------------------------------------------
//
// Where a question's sound comes from, what a pairing rests on and which checks
// are still open is research. The player's screens name none of it; 资料馆 is
// a tab only a browser sent to ?backstage=1 shows.
for (const key of ["one_more_tune_preview_banner", "one_more_tune_youtube_banner", "one_more_tune_round_mixed",
  "one_more_tune_pool_preview", "one_more_tune_credits", "one_more_tune_disc_caption", "one_more_tune_shelf_notice",
  "one_more_tune_recall_not_ready", "one_more_tune_match_note", "one_more_tune_demo_schedule"]) {
  test.assertNotIncludes(source, `"${key}"`, `the player never reads ${key}`);
}
test.assertIncludes(source, 'data-one-more-tune-view="sources" data-one-more-tune-backstage hidden',
  "the 资料馆 tab is hidden unless the browser opened the backstage");
test.assertMatches(source, /const views = oneMoreTuneBackstage\(\) \? \[[^\]]*"sources"\] : \["shelf", "study", "challenge"\];/,
  "and the view cannot be reached around the hidden tab");
test.assertNotMatches(source, /action: "one-more-tune-(sources|choose-audio|play)"/,
  "the research tools are not in the player's menus");

// ---- The shelf's own card ------------------------------------------------
test.assertNotIncludes(source.slice(source.indexOf("function renderOneMoreTuneChallenge"), source.indexOf("function renderOneMoreTuneRoundResult")), "oneMoreTuneNote(",
  "the round's reveal carries no research note about the card");
test.assertNotIncludes(source, "oneMoreTuneAnchorLine(featured)",
  "the featured card carries no research line about anchors or auditions");
test.assertNotIncludes(source, 't("one_more_tune_clocks_note")).slice(0, 80)',
  "no truncated sentence stands in for the card's own source line");
test.assertIncludes(source, 'data-one-more-tune-open-card="${oneMoreTuneEscape(featured.id)}"',
  "the card on the shelf is a door into that card");
test.assertIncludes(source, "startOneMoreTuneCard(card.dataset.oneMoreTuneOpenCard)",
  "and opening it leads with the card that was asked for");
test.assertIncludes(source, 't("one_more_tune_score_card_title")',
  "the score card is written in the language the desk is in, not in the one this file was first drafted in");
test.assertIncludes(source, 't("one_more_tune_score_card_same")',
  "including the line that carries the set code");

// The catalogue's filter bar and its footer come from the research mock, and
// their labels are chosen from a list rather than written as literals, so they
// are named here the way the round sentences are.
for (const key of [
  "one_more_tune_sources_search", "one_more_tune_sources_unit", "one_more_tune_sources_status",
  "one_more_tune_sources_all_units", "one_more_tune_sources_all_states", "one_more_tune_sources_settled",
  "one_more_tune_sources_unsettled", "one_more_tune_sources_anchored", "one_more_tune_sources_linked",
  "one_more_tune_sources_entries", "one_more_tune_sources_empty",
  "one_more_tune_footer_left", "one_more_tune_footer_index", "one_more_tune_footer_play",
]) {
  test.assertIncludes(en, `${key}:`, `English has the catalogue sentence ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese has the catalogue sentence ${key}`);
}
test.assertIncludes(source, 'id="one-more-tune-source-search"',
  "the catalogue is searchable, the way the research mock's table is");

// ---- The wrist --------------------------------------------------------------
//
// A watch is the smallest glass this quiz runs on, and the plan for it is
// docs/design/FORM-FACTORS.md: a shorter quiz, not a smaller one. What the
// layout owes that plan has to be in the sheet, because the sheet is where a
// layout decision lives. Measured at 396x484 and 368x448, both engines: a round
// starts, the sound plays, nothing scrolls, and all four answers are on screen.
const omtStyles = read("styles/97-one-more-tune.css");
test.assertMatches(omtStyles, /@media \(max-width: 430px\) and \(max-height: 520px\) \{[\s\S]{0,2400}\.one-more-tune-window \.brand \{\s*\n\s*display: none;/,
  "on a watch the masthead stands down — the window title already names the app");
test.assertMatches(omtStyles, /@media \(max-width: 430px\) and \(max-height: 520px\) \{[\s\S]{0,2400}\.one-more-tune-tabs \.system-tab \{\s*\n\s*min-height: 44px;/,
  "the tab row stays, and grows to a thumb, because it is the only way between faces");
test.assertMatches(omtStyles, /@media \(max-width: 430px\) and \(max-height: 520px\) \{[\s\S]{0,4000}height: auto;\s*\n\s*min-height: 0;\s*\n\s*padding: 4px 12px 2px;/,
  "and the header stops reserving a desktop masthead's 98px, which is what kept the last two answers off a 41mm screen");
test.assertMatches(omtStyles, /@media \(max-width: 430px\) and \(max-height: 520px\) \{[\s\S]{0,4000}> \.choices \{\s*\n\s*grid-template-columns: 1fr 1fr;/,
  "the four answers sit two by two, the one shape that fits four labels under a question this short");
// The three faces are the quiz's only navigation. On a touch screen they were a
// 28px strip — a row a finger can miss, between the reader and the only way to
// change which face they are looking at. Measured after: 44px upright, 36px
// sideways, where height is the scarcest thing the product has.
test.assertMatches(omtStyles, /@media \(hover: none\) and \(pointer: coarse\) \{\s*\n\s*\.one-more-tune-window \.one-more-tune-tabs \.system-tab \{ min-height:44px;/,
  "the quiz's own tabs take the touch minimum where the pointer is coarse");
test.assertMatches(omtStyles, /\.one-more-tune-tabs \.system-tab \{ min-height:36px;/,
  "and what the sideways layout can spare rather than the floor it used to sit on");
test.assertIncludes(source, "oneMoreTuneSourceQuery",
  "and the search has state of its own rather than borrowing the shelf's");
test.assertIncludes(source, 'class="page-footer"',
  "the catalogue closes with the mock's own footer");
// A published round's reveal carries no card id, so the miss queue has to find
// the card from the reveal the server did send.
test.assertIncludes(source, "function oneMoreTuneCardIdForReveal(reveal) {",
  "the review queue resolves a reveal back to its card");
test.assertIncludes(source, "question.localAnswer || oneMoreTuneCardIdForReveal(question.reveal)",
  "and uses it for published rounds, where the reveal is the only name the answer has");

// ---- The rendered question, not just the source that writes it -------------
//
// This context paints the window, so it needs the two things the browser
// fetches: the deck file it shares with the server, and the round authority
// itself. Both are the real ones, not stand-ins.
{
  const painted = { html: "" };
  // The English strings, loaded the way the browser loads them, so a rendered
  // sentence is a sentence and not its key.
  const englishContext = { window: {} };
  vm.runInNewContext(en, englishContext);
  const englishStrings = englishContext.window.AISystem6TranslationsEn || {};
  const stub = () => ({
    innerHTML: "", textContent: "", value: "", dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, focus() {}, querySelectorAll: () => [], querySelector: () => null,
    closest: () => null, matches: () => false, click() {}, removeAttribute() {},
  });
  const win = stub();
  win.dataset.window = "oneMoreTune";
  const body = stub();
  Object.defineProperty(body, "innerHTML", {
    get: () => painted.html,
    set: (value) => { painted.html = String(value); },
  });
  const domStore = new Map();
  // A set whose ten all play a store preview: the harness has no YouTube player.
  let previewSet = "";
  for (let number = 1; number <= 400 && !previewSet; number += 1) {
    const probe = await serverDeck.startRound({ challengeId: String(number) });
    if (probe.questions.length === 10 && probe.questions.every((question) => question.media.provider === "preview")) previewSet = String(number);
  }
  test.assert(!!previewSet, "some set plays the store preview on all ten");
  const domContext = {
    fetch: async (url, init) => {
      const pathname = String(url);
      if (pathname === "/data/one-more-tune-deck.json") return { ok: true, json: async () => deckFile };
      // A pinned store preview: the bytes are the decoder's business, stubbed below.
      if (/^https:\/\//.test(pathname)) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
    document: {
      querySelector: (selector) => (String(selector).includes("oneMoreTune") || String(selector).includes("is-active") ? win : null),
      querySelectorAll: () => [],
      getElementById: (id) => (id === "one-more-tune-body" ? body : stub()),
      createElement: () => stub(),
      addEventListener() {},
    },
    navigator: {},
    localStorage: { getItem: (key) => (domStore.has(key) ? domStore.get(key) : null), setItem: (key, value) => domStore.set(key, String(value)) },
    setTimeout, clearTimeout, setInterval, clearInterval, console,
    // Real English strings, not the key: a contract that reads `t` as identity
    // can check that a sentence exists but not that it composes — the score card
    // printed the key where the score belonged until these were loaded.
    t: (key) => englishStrings[key] ?? key,
    setStatus: () => {},
    hydrateSystemIcons: () => {},
    openWindow: async () => {},
    currentLanguage: "en",
    window: {
      // The authority is reached through the service boundary, exactly as the
      // browser reaches it: the window names a route, the provider builds the
      // URL. Rounds play the deck's pinned sounds; the audio fetch is stubbed.
      AISystem6Capabilities: {
        requestService: async (name, input = {}) => {
          if (name !== "oneMoreTune.api") throw new Error(`unexpected service ${name}`);
          const route = String(input.route || "");
          const payload = input.init?.body ? JSON.parse(input.init.body) : {};
          if (route === "round") {
            return { ok: true, json: async () => serverDeck.startRound({ challengeId: previewSet, ...payload }) };
          }
          if (route === "answer") return { ok: true, json: async () => serverDeck.submitAnswer(payload) };
          if (route === "report") return { ok: true, json: async () => ({ ...serverDeck.report(), bank: serverDeck.validateBank() }) };
          return { ok: false, status: 404, json: async () => ({}) };
        },
      },
      AudioContext: class {
        constructor() { this.destination = {}; this.sampleRate = 8000; }
        resume() { return { catch() {} }; }
        close() { return Promise.resolve(); }
        createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
        createBuffer(channels, length) {
          const data = new Float32Array(length);
          return { duration: length / this.sampleRate, length, sampleRate: this.sampleRate, numberOfChannels: channels, getChannelData: () => data };
        }
        decodeAudioData() { return Promise.resolve({ duration: 30 }); }
      },
      AISystem6ApplicationShell: { createWindow: () => win },
      AISystem6InstanceResources: { create: () => ({ listen() {}, add() {}, dispose() {}, disposed: false }) },
      AISystem6TranslateWithin: () => {},
      AISystem6ApplicationRegistry: { registerApplicationLifecycle: () => {} },
      AISystem6RegisterApplicationMenuSet: () => {},
      AISystem6Runtime: { registerApplication: () => {} },
    },
  };
  domContext.globalThis = domContext;
  const painter = vm.createContext(domContext);
  vm.runInContext(source, painter);
  const run = (code) => vm.runInContext(code, painter);
  const live = domContext.window.AISystem6OneMoreTune;
  await live.loadDeck();

  // The answer's own words may appear only as one of the four choices — which
  // is unavoidable, since the right product is one of them. Everything else on
  // the face is checked with the choice labels stripped out, or a card whose
  // artist is short (U2) trips on its own product name
  // ("iPod + iTunes (U2 Special Edition)").
  const escapeChoice = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const withoutChoices = (markup, choices) => choices.reduce(
    (text, choice) => text.split(escapeChoice(choice.label)).join(" "), markup);

  // Walk one unit to the recall step, then read what is on the page.
  live.startUnit("keynote-2020");
  for (let i = 0; i < 20 && live.session()?.step === "learn"; i += 1) run('runOneMoreTuneCommand("one-more-tune-next")');
  test.assert(live.session()?.step === "match", "a unit moves from meeting cards to matching them");
  const unitCards = live.cards().filter((card) => card.unit === "keynote-2020");
  const matchMarkup = painted.html;
  for (const card of unitCards) {
    test.assertNotIncludes(matchMarkup, card.song, `the matching question does not print ${card.song}`);
    test.assertNotIncludes(matchMarkup, card.artist, `the matching question does not print ${card.artist}`);
  }
  for (let i = 0; i < 20 && live.session()?.step === "match"; i += 1) {
    const chosen = /data-one-more-tune-answer="([^"]+)"/.exec(painted.html)?.[1] || "";
    run(`answerOneMoreTuneMatch(${JSON.stringify(chosen)})`);
  }
  test.assert(live.session()?.step === "recall", "and then to recalling them");
  const recallMarkup = painted.html;
  for (const card of unitCards) {
    for (const secret of [card.song, card.artist, card.product, card.film]) {
      test.assertNotIncludes(recallMarkup, secret, `the recall question does not print ${secret}`);
    }
  }
  test.assertNotIncludes(recallMarkup, "youtube.com", "a question never links to the film — the page title is the answer");
  test.assertNotIncludes(matchMarkup, "youtube.com", "and neither does the matching question");

  run('runOneMoreTuneCommand("one-more-tune-reveal")');
  const revealed = live.cards().find((card) => painted.html.includes(card.song) && card.unit === "keynote-2020");
  test.assert(!!revealed, "the reveal is the render that names the card");
  test.assertIncludes(painted.html, revealed.product, "and its product");

  // The gate and the projection live in the round authority, not in the window.
  // A store preview fails the gate by name, and so does every card in this deck:
  // no asset, no rights review, no auditioned cue.
  const gate = serverDeck.assessBlindSource({
    mappingVerified: true, deliveryScopeApproved: true, spoilerReviewPassed: true,
    asset: { provider: "store_preview", recordingVerified: true, durationSeconds: 30, noSpoilerPackagingVerified: true },
    rights: { reviewed: true, active: true, evidenceRef: "x", creditsAvailableDuringPlay: true, grants: {} },
    cue: { auditioned: true, startSeconds: 0, endSeconds: 15 },
  });
  test.assert(gate.ready === false, "a store preview can never be a blind question");
  test.assert(gate.reasons.includes("provider_not_licensed_file"), "and the reason names the provider");
  test.assert(serverDeck.blindSourceRecord().rights.reviewed === false, "no card carries a rights review");
  // Rights arriving is not a card becoming answerable. On 2026-09-18 the owner
  // recorded that permission covers the recordings and the store's preview
  // path, and the visitor copy stopped saying otherwise — while the gate did
  // not move, because the eleven other conditions are untouched by it. This is
  // the assertion that stops the next reader "finishing the job" by flipping a
  // card to enabled.
  const serverSource = readFileSync(new URL("../../apps/server/server/one-more-tune.js", import.meta.url), "utf8");
  test.assertIncludes(serverSource, '"store_preview_cleared_for_this_project"', "the preview marker records the clearance");
  test.assertIncludes(serverSource, "2026-09-18", "and dates it, with the owner named as its source");
  test.assert(serverDeck.validateBank().enabled.length === 0, "no card is enabled by a project-level clearance");
  test.assert(serverDeck.report().publishable === 0, "and the report still says zero");
  const stillBlocked = serverDeck.assessBlindSource({
    ...serverDeck.blindSourceRecord(),
    rights: { reviewed: true, active: true, evidenceRef: "owner-2026-09-18", creditsAvailableDuringPlay: true,
      grants: { recording: true, composition: true, publicPlayback: true, interactiveQuiz: true, excerpt: true, selfHosting: true, deferredCredits: true } },
  });
  test.assert(stillBlocked.ready === false, "a card with every right granted is still not a question");
  for (const reason of ["provider_not_licensed_file", "unverified_recording", "cue_not_auditioned"]) {
    test.assert(stillBlocked.reasons.includes(reason), `because ${reason} is about listening, not about permission`);
  }
  for (const table of [en, zh]) {
    test.assert(!/not (?:yet )?licensed|尚未取得使用授权|尚未获准使用/.test(table),
      "no surface tells a listener the project lacks permission it has");
  }
  const serverRound = await serverDeck.startRound({});
  const wireKeys = new Set(Object.keys(serverRound.questions[0]));
  test.assert([...wireKeys].every((key) => ["token", "prompt", "choices", "media", "creditsUrl"].includes(key)),
    "a question on the wire carries only the five allowed fields");
  test.assert(serverRound.questions.every((question) => ["preview", "youtube", "licensed_file", "none"].includes(question.media.provider)),
    "and its sound comes from one of the three declared providers, or is marked as not playing");
  test.assert(serverRound.questions.every((question) => question.choices.every((choice) => Object.keys(choice).join() === "id,label")),
    "and each choice is a token with a word, nothing else");
  const wire = JSON.stringify(serverRound.questions);
  for (const card of cards) {
    test.assertNotIncludes(wire, card.song, `the wire never carries the song ${card.song}`);
  }
  for (const card of cards.slice(0, 16)) {
    // A product label legitimately contains brand words — "iPod + iTunes (U2
    // Special Edition)" contains the artist of its own card — so a secret is
    // only checkable when no choice label already carries it.
    const insideAChoice = cards.some((entry) => String(entry.product || "").includes(card.artist));
    if (!insideAChoice) test.assertNotIncludes(wire, card.artist, `the wire never carries the artist ${card.artist}`);
    test.assertNotIncludes(wire, card.film, `the wire never carries the film ${card.film}`);
  }
  test.assertNotIncludes(wire, "cardId", "the wire names no card");
  test.assertNotIncludes(wire, "correct", "and says nothing about which choice is right");
  test.assert(serverRound.questions.every((question) => question.choices.length === 4),
    "while every question does carry its four choices");

  // A challenge is a fixed set: the same cards, in the same order, with the
  // same options. "不能只是把首页链接发过去，让对方重新随机抽十道."
  const first = await serverDeck.startRound({});
  const reopened = await serverDeck.startRound({ challengeId: first.setId });
  const labels = (round) => round.questions.map((question) => question.choices.map((choice) => choice.label));
  test.assert(!!first.setId && Number.isFinite(first.deckVersion), "a round carries a set id and the bank version");
  test.assert(reopened.questions.length === first.questions.length,
    "the same set reopens with the same ten");
  // The mode is not part of the set: it says which source this open actually
  // obtained, and that depends on the store answering and on what the caller
  // allows. The ten are what two people compare.
  test.assert(["licensed", "preview", "youtube"].includes(reopened.mode),
    "and the round still names the source it played");
  test.assert(JSON.stringify(labels(reopened)) === JSON.stringify(labels(first)),
    "and with the same questions in the same order, options included");
  test.assert(reopened.questions.every((question, index) => question.token !== first.questions[index].token),
    "while every question gets fresh tokens rather than replayable ones");
  const one = await serverDeck.startRound({ challengeId: first.setId, questionIndex: 3 });
  test.assert(one.questions.length === 1
    && JSON.stringify(labels(one)) === JSON.stringify([labels(first)[3]]),
  "and one question can be sent on its own");
  const gone = await serverDeck.startRound({ challengeId: "nosuchset" });
  test.assert(gone.mode === "unavailable" && gone.code === "set_not_found",
    "a set that is no longer open says so instead of quietly becoming a new round");

  // A set is a NUMBER, not an id this process remembers. The links people send
  // each other have to open tomorrow, on a server a deploy restarted in
  // between, and the same ten has to come back for whoever holds the number.
  test.assert(/^\d{1,6}$/.test(String(first.setId)), "a set id is a number a person can read out");
  const byNumber = await serverDeck.startRound({
    challengeId: `OMT.${first.deckVersion}.${first.setId}`,
  });
  test.assert(JSON.stringify(labels(byNumber)) === JSON.stringify(labels(first)),
    "the number and the bank version alone rebuild the same ten, options included");
  const otherNumber = Number(first.setId) === 7 ? 8 : 7;
  const other = await serverDeck.startRound({ challengeId: String(otherNumber) });
  test.assert(JSON.stringify(labels(other)) !== JSON.stringify(labels(first)),
    "and a different number is a different ten");
  const otherVersion = await serverDeck.startRound({
    challengeId: `OMT.${Number(first.deckVersion) + 1}.${first.setId}`,
  });
  test.assert(otherVersion.mode === "unavailable" && otherVersion.code === "set_stale",
    "a set named against another deck says so rather than serving a similar-looking ten");

  // The share codes carry the set and the version, and nothing else. What a
  // friend opens must be the same ten questions, so the id has to survive.
  const shareSet = await run(`(async () => {
    oneMoreTuneRound = { mode: "preview", origin: "server", token: "t", setId: "AbCdEfGh", deckVersion: 3, index: 2, questions: [
      { token: "q", choices: [{ id: "c", label: "AirPods" }], correct: true, points: 1, reveal: { song: "Secret Song", product: "AirPods" } },
      { token: "q2", choices: [{ id: "c2", label: "iMac" }], correct: false, points: 0, reveal: { song: "Another Song", product: "iMac" } },
    ] };
    return { set: oneMoreTuneShareCode(), single: oneMoreTuneShareCode(1), score: oneMoreTuneScoreCard() };
  })()`);
  test.assert(shareSet.set === "OMT.3.AbCdEfGh", "the set code is the bank version and the set id");
  test.assert(shareSet.single === "OMT.3.AbCdEfGh.1", "a single question adds its index");
  test.assertIncludes(shareSet.score, "AbCdEfGh", "the score card names the set");
  test.assertIncludes(shareSet.score, "1 / 2", "and the result");
  for (const secret of ["Secret Song", "Another Song", "AirPods", "iMac"]) {
    test.assertNotIncludes(shareSet.score, secret, `the score card never carries ${secret}`);
  }

  // The bank check the design asks to run before shipping.
  const bank = serverDeck.validateBank();
  test.assert(bank.checked === cards.length && bank.problems.length === 0,
    "the real bank passes every structural check it can prove");
  test.assert(bank.enabled.length === 0,
    "and enables nothing, because nothing has a cleared recording");
  const grants = Object.fromEntries(serverDeck.RIGHTS_GRANTS.map((name) => [name, true]));
  const complete = {
    mappingVerified: true, deliveryScopeApproved: true, spoilerReviewPassed: true,
    asset: { provider: "licensed_file", recordingVerified: true, durationSeconds: 10, noSpoilerPackagingVerified: true },
    rights: { reviewed: true, active: true, evidenceRef: "grant", creditsAvailableDuringPlay: true, grants },
    cue: { auditioned: true, startSeconds: 2, endSeconds: 8 },
  };
  const seeded = serverDeck.validateBank({ cards: [
    { id: "OMT-PARTIAL", enabled: true, product: "Something", film: "A film", kind: "product_ad", blindSource: complete },
    { id: "OMT-BROKEN", enabled: true, product: "Other", film: "Another film", kind: "product_ad",
      blindSource: { ...complete, cue: { auditioned: true, startSeconds: 8, endSeconds: 4 } } },
  ] });
  test.assert(seeded.enabled.length === 2, "both seeded cards count as enabled");
  test.assert(seeded.problems.some((problem) => problem.includes("without a recording id")),
    "an enabled card without a recording id is a problem");
  test.assert(seeded.problems.some((problem) => problem.includes("without an asset revision")),
    "so is one without an asset revision");
  test.assert(seeded.problems.some((problem) => problem.includes("invalid_cue_window")),
    "and an enabled card whose out-point is not after its in-point fails the gate it claims to pass");

  // The acceptance list's two structural checks: no duplicate ids in the bank,
  // and four distinct choices on any question a card could be asked as.
  const ids = cards.map((card) => card.id);
  test.assert(new Set(ids).size === ids.length, "no card id appears twice");
  const optionProblems = [];
  for (const card of cards.filter((entry) => entry.product && entry.film)) {
    const options = live.options(card.id, 4);
    if (options.length !== 4) optionProblems.push(`${card.id}: ${options.length} options`);
    if (new Set(options).size !== 4) optionProblems.push(`${card.id}: repeated option`);
    if (!options.includes(card.id)) optionProblems.push(`${card.id}: the right answer is not among its choices`);
  }
  test.assert(optionProblems.length === 0, `every askable card has four distinct choices (${optionProblems.join("; ")})`);

  // ---- The bank has to be accurate, not merely drawable --------------------
  //
  // A question is only fair when its four options are four different things.
  // Two cards can carry one recording — a catalogue card and the editorial
  // bank's own record of the same music use, which spells the product in another
  // language — and while that pair is undeclared the same sound is asked twice
  // in a ten and the second answer key marks the first name wrong. Three pairs
  // like that were in the deck on 2026-09-20. These are the checks that keep
  // them out, and they run against the shipped deck rather than a fixture.
  const recordingOf = (card) => String(card.questionSound?.url || "");
  const byRecording = new Map();
  for (const card of deckFile.cards) {
    const key = recordingOf(card);
    if (!key || !card.product || !card.film) continue;
    byRecording.set(key, [...(byRecording.get(key) || []), card]);
  }
  const undeclaredTwins = [];
  for (const group of byRecording.values()) {
    if (group.length < 2) continue;
    for (const card of group) {
      if (!group.some((other) => other.id !== card.id && card.siblingOf === other.id)) undeclaredTwins.push(card.id);
    }
  }
  test.assert(undeclaredTwins.length === 0,
    `no two cards carry one recording as two answers (${undeclaredTwins.join(", ")})`);
  test.assert(serverDeck.validateBank().problems.length === 0,
    "and the bank check looks for exactly that, so the next import cannot slip one in");

  // The rule is kept where a round is built, not only where the deck is edited:
  // sixty numbered sets, ten questions each, one recording per set at most and
  // four different labels to every question.
  const repeatedSound = [];
  const repeatedLabel = [];
  for (let number = 1; number <= 60; number += 1) {
    const round = await serverDeck.startRound({ challengeId: String(number) });
    if (round.questions.length !== 10) continue;
    const sounds = round.questions.map((question) => question.media.url);
    if (new Set(sounds).size !== sounds.length) repeatedSound.push(number);
    for (const question of round.questions) {
      const labels = question.choices.map((choice) => choice.label);
      if (new Set(labels).size !== 4) repeatedLabel.push(`${number}: ${labels.join(" / ")}`);
    }
  }
  test.assert(repeatedSound.length === 0,
    `no set asks one recording twice (${repeatedSound.slice(0, 5).join(", ")})`);
  test.assert(repeatedLabel.length === 0,
    `and no question offers one product under two labels (${repeatedLabel.slice(0, 3).join("; ")})`);

  // A round now comes from the authority: the window receives tokens, choices
  // and a playback descriptor, and never a card id.
  await run("startOneMoreTuneRound()");
  const serverPlayed = live.round();
  test.assert(!!serverPlayed, "a round opens");
  test.assert(serverPlayed.mode === "preview", "and it plays the store preview");
  test.assert(serverPlayed.questions.length === 10, "with ten questions");
  const firstQuestion = serverPlayed.questions[0];
  test.assert(typeof firstQuestion.token === "string" && !firstQuestion.cardId,
    "a question is addressed by an opaque token, not by a card id");
  test.assert(Array.isArray(firstQuestion.choices) && firstQuestion.choices.length === 4,
    "and it carries four choices");
  const questionFace = withoutChoices(painted.html, firstQuestion.choices);
  for (const card of live.cards()) {
    test.assertNotIncludes(questionFace, card.song, `the question face does not print the song ${card.song}`);
  }
  test.assertNotIncludes(painted.html, "youtube.com", "no question links to the film — the page title is the answer");
  test.assertNotIncludes(painted.html, "<iframe", "and no question carries a player to hide or crop");
  test.assertNotMatches(painted.html, /one_more_tune_(preview|youtube)_banner|one_more_tune_credits/, "the question names no source and no licence — that is backstage");
  test.assertNotMatches(painted.html, /itunes\.apple\.com|mzstatic\.com/, "and the preview's address is not printed on the face");
  for (const choice of firstQuestion.choices) {
    test.assertIncludes(painted.html, escapeChoice(choice.label), `the choice "${choice.label}" is on the page`);
  }
  // The question face is the progress, the player, the question and the four
  // answers — nothing else. The two state chips and the row of four controls
  // that used to sit here belong to the Study menu now, and a face that lists
  // every command of a round is the pile the menu bar exists to avoid.
  test.assertIncludes(painted.html, 'class="darkplayer"', "the question face keeps the player");
  test.assertIncludes(painted.html, 'class="choices"', "and the four answers");
  test.assertNotIncludes(painted.html, "one_more_tune_not_revealed", "the face no longer says the answer is unrevealed");
  test.assertNotIncludes(painted.html, "one_more_tune_sounding", "nor narrates the sound it just started");
  for (const command of ["one-more-tune-round-skip", "one-more-tune-find-film", "one-more-tune-end-round", "one-more-tune-hear_again"]) {
    test.assertNotIncludes(painted.html, `data-one-more-tune-command="${command}"`, `the face carries no ${command} button`);
  }
  test.assert(painted.html.split("data-one-more-tune-command=").length - 1 === 1,
    "exactly one command is on the question face, and it is the player's own");
  // The one state that still has to be said: a cue that could not play, because
  // that is when the player has to act — and the action is in the menu.
  test.assertMatches(source,
    /\$\{question\.mediaFailed \? `<p class="playstate">[\s\S]{0,240}one_more_tune_media_failed_hint/,
    "and a failed cue is the only state the face still reports, with where to go");
  // Playing is free and repeatable, and the count of listens is what a later
  // reader trusts when the score is not a listening result.
  //
  // The question plays itself now: the tap that started the round unlocked the
  // audio, so the first cue is already in the air by the time this face paints.
  // A press is the replay — and the retry, when a browser refused the sound.
  test.assert(live.round().questions[0].heard === 1, "the first question sounds by itself");
  await run('runOneMoreTuneCommand("one-more-tune-hear")');
  test.assert(live.round().questions[0].heard === 2, "pressing play replays the preview");
  await run('runOneMoreTuneCommand("one-more-tune-hear")');
  test.assert(live.round().questions[0].heard === 3, "and a second press is allowed, because the round has no clock");
  // The answer is scored by the authority, so this window cannot know which
  // choice is right before it submits — which is the whole point.
  test.assert(live.round().questions[0].correct === false && live.round().questions[0].reveal === null,
    "nothing on the question knows the answer yet");
  await run(`submitOneMoreTuneAnswer(${JSON.stringify(firstQuestion.choices[0].id)})`);
  const submitted = live.round().questions[0];
  test.assert(submitted.reveal && typeof submitted.reveal.song === "string",
    "the reveal arrives with the submission");
  // The reveal keeps its two content links — the film and the recording are the
  // evidence for the answer — one way onward, the film's own player, and the
  // stage it was heard on (whose button is the replay). The three actions that
  // used to crowd it (add to study, send this question, report it) are menu
  // rows, and "another round" is not here at all: that is what the end of a
  // round offers, once the ten are done.
  const revealFace = painted.html;
  test.assert((revealFace.match(/one-more-tune-plain-links/g) || []).length === 1,
    "the reveal carries its content links as one line");
  const revealCommands = [...revealFace.matchAll(/data-one-more-tune-command="([^"]+)"/g)].map((match) => match[1]);
  test.assert(
    revealCommands.every((command) => ["one-more-tune-round-next", "one-more-tune-play-film", "one-more-tune-hear"].includes(command)),
    `and only three at most: the next question, the film's player, and the stage's own replay (${revealCommands.join(", ")})`,
  );
  test.assertIncludes(revealFace, 'data-one-more-tune-command="one-more-tune-round-next"', "one of them takes the next question");
  test.assertIncludes(revealFace, 'data-one-more-tune-command="one-more-tune-hear"', "the stage is on the reveal too, as the replay");
  test.assertNotIncludes(revealFace, 'data-one-more-tune-command="one-more-tune-play-again"',
    "and another round is not offered mid-round, where it would throw the other nine away");
  for (const moved of ["one-more-tune-add-to-study", "one-more-tune-share-question", "one-more-tune-report"]) {
    test.assertNotIncludes(revealFace, `data-one-more-tune-command="${moved}"`, `the reveal no longer carries ${moved}`);
  }
  test.assert(submitted.points === 0 || submitted.points === 1, "and carries the score the authority gave it");
  const roundEvent = live.events().filter((event) => event.type === "challenge").at(-1);
  test.assert(roundEvent.mode === "preview", "the event records which source the round played");
  test.assert(!("silent" in roundEvent), "and has no silent flag, because there is no silent round");
  test.assert(roundEvent.mediaPlayed === true, "and a cue that really played is recorded as heard");
  test.assert(roundEvent.listens === 3, "with the number of listens beside it");
  const before = submitted.points;
  await run(`submitOneMoreTuneAnswer(${JSON.stringify(firstQuestion.choices[1].id)})`);
  test.assert(live.round().questions[0].points === before, "a second submission changes nothing");

  // ---- An answer the round refused is not a wrong answer -------------------
  //
  // The face used to paint the empty reveal and call it "not that one", so a
  // round that had been evicted scored the player for the server's own refusal.
  // The window tells the two states apart, and the retry re-sends the choice
  // that was already made rather than asking for it again.
  const answerRoute = domContext.window.AISystem6Capabilities.requestService;
  let refuseAnswers = true;
  domContext.window.AISystem6Capabilities.requestService = async (name, input = {}) => {
    if (refuseAnswers && String(input.route || "") === "answer") throw new Error("that round is gone");
    return answerRoute(name, input);
  };
  run('runOneMoreTuneCommand("one-more-tune-round-next")');
  const secondQuestion = live.round();
  test.assert(secondQuestion.index === 1 && secondQuestion.questions[1].submitted === false,
    "the next question is a fresh one");
  const refusedChoice = secondQuestion.questions[1].choices[0].id;
  await run(`submitOneMoreTuneAnswer(${JSON.stringify(refusedChoice)})`);
  const refused = live.round().questions[1];
  test.assert(refused.answerFailed === true && refused.reveal === null,
    "an answer the round refuses carries no reveal at all");
  test.assert(refused.correct === false && refused.points === 0 && refused.outcome === "failed",
    "and no score, because nothing was scored");
  test.assertIncludes(painted.html, englishStrings.one_more_tune_answer_unaccepted_hint,
    "the face says the answer never reached the round");
  test.assertNotIncludes(painted.html, englishStrings.one_more_tune_wrong,
    "and never says the answer was wrong");
  test.assertIncludes(painted.html, 'data-one-more-tune-command="one-more-tune-answer-retry"',
    "it offers the retry instead");
  test.assert(live.commandAvailability("one-more-tune-answer-retry").available === true,
    "and the menu row for it is live while the answer is refused");
  refuseAnswers = false;
  await run('runOneMoreTuneCommand("one-more-tune-answer-retry")');
  const retried = live.round().questions[1];
  test.assert(retried.reveal && typeof retried.reveal.song === "string",
    "the retry scores the same choice once the round answers again");
  test.assert(retried.answerFailed === false && retried.points >= 0, "and clears the refusal");
  test.assert(live.commandAvailability("one-more-tune-answer-retry").available === false,
    "with nothing left to send again, the command greys out rather than vanishing");
  test.assertIncludes(painted.html, "one-more-tune-round-reveal",
    "and the reveal is the face again");
  test.assertNotIncludes(painted.html, "one-more-tune-answer-refused",
    "with the refusal face gone");
  domContext.window.AISystem6Capabilities.requestService = answerRoute;
  run('runOneMoreTuneCommand("one-more-tune-end-round")');

  // A private practice round is the other answer to "where does the sound come
  // from": the person's own file, with a range they auditioned themselves.
  const playable = "OMT-020";
  live.setQuizClip(playable, { start: 30, end: 60 });
  run(`oneMoreTuneAudio.buffers.set(${JSON.stringify(playable)}, { duration: 200 })`);
  run("oneMoreTuneAudio.context = { resume: () => ({ catch(){} }), createBufferSource: () => ({ connect(){}, start(){}, stop(){} }), destination: {} }");
  await run("startOneMoreTuneRound()");
  const round = live.round();
  test.assert(round?.questions?.length === 1, "once one card can sound, a private round is built from that card alone");
  test.assert(round.mode === "practice", "and it says it is private practice on the person's own copy");
  const asked = live.cards().find((card) => card.id === round.questions[0].localAnswer);
  const askedFace = withoutChoices(painted.html, round.questions[0].choices);
  for (const secret of [asked.song, asked.artist, asked.film]) {
    test.assertNotIncludes(askedFace, secret, `the practice question does not print ${secret}`);
  }

  // The ledger: one row per card, three independent marks, and it warns that it
  // is a spoiler before it shows one.
  run('setOneMoreTuneView("sources")');
  test.assert(run("oneMoreTuneView") === "shelf", "a player who is not backstage cannot open 资料馆");
  run("setOneMoreTuneBackstage(true)");
  run('setOneMoreTuneView("sources")');
  const ledger = painted.html;
  test.assertIncludes(ledger, "one_more_tune_ledger_spoiler", "the ledger says it reveals the answers");
  for (const card of live.allCards()) {
    test.assertIncludes(ledger, card.id, `the ledger carries a row for ${card.id}`);
  }
  test.assertIncludes(ledger, "one_more_tune_check_mapping", "the pairing check is its own mark");
  test.assertIncludes(ledger, "one_more_tune_check_playback", "so is whether the original still plays");
  test.assertIncludes(ledger, "one_more_tune_check_clip", "so is whether a segment has been listened through");
  // Nothing may claim the original was played: nobody has opened one.
  test.assertNotIncludes(ledger, "one_more_tune_check_playback_done", "no card claims a playback check that never happened");
  const doneMarks = (ledger.match(/one-more-tune-check is-done/g) || []).length;
  test.assert(doneMarks > 0 && doneMarks < live.allCards().length * 3,
    "some marks are earned and most are not — a ledger where everything ticks is not a ledger");

  // ---- The reveal dresses the desk in the card's era -----------------------
  //
  // The promotion the six Appearances get: a card is revealed, and the desk
  // takes the era that card belongs to. The ladder's names ARE the Appearance
  // names, so the two lists are held to each other here rather than by memory,
  // and the mapping is executed rather than read.
  const themeRegistry = read("app/core/theme-registry.js");
  const labelFor = (id) => {
    const entry = themeRegistry.slice(themeRegistry.indexOf(`id: "${id}"`));
    return /label: "([^"]+)"/.exec(entry)?.[1] || "";
  };
  const eras = live.eras();
  test.assert(eras.length === 6, `the ladder names six eras (${eras.length})`);
  for (const era of eras) {
    test.assert(typeof era.theme === "string" && era.theme.length > 0, `era ${era.id} (${era.name}) names the Appearance it is drawn in`);
    test.assert(era.name === labelFor(era.theme), `era ${era.id}'s name is the Appearance label of ${era.theme} ("${era.name}")`);
  }
  // Executed, not read: a 2020 card is Liquid Glass, and a card with no year
  // keeps whatever is on screen instead of being dressed in a guess.
  const dated = live.allCards().find((card) => card.year === 2020);
  const undated = live.allCards().find((card) => !Number.isInteger(card.year));
  test.assert(dated && live.eraFor(dated.id).theme === "liquid-glass", "a 2020 card belongs to Liquid Glass");
  test.assert(undated && live.eraFor(undated.id).theme === "", `a card with no year (${undated?.id}) has no era to wear`);

  // The listen link goes to the storefront the reader is actually in. Apple
  // answers a search at the storefront it resolves and bounces every other
  // storefront's search to that storefront's home page, so a hard-coded /us/
  // was a link that looked fine and landed on "New" for anyone outside the US.
  const language = domContext.navigator?.language;
  const IntlStub = (timeZone) => ({ DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) });
  // A zone the table does not know, so the language is what decides first here.
  domContext.Intl = IntlStub("Antarctica/Troll");
  domContext.navigator.language = "zh-TW";
  test.assert(live.storefront() === "tw", "a zh-TW reader is sent to the Taiwan storefront");
  domContext.navigator.language = "en-US";
  test.assert(live.storefront() === "us", "an en-US reader is sent to the US storefront");
  domContext.navigator.language = "";
  test.assert(live.storefront() === "us", "and a reader who does not say falls back to us");
  // The zone is where the reader actually is, and it decides first: an English
  // browser with a Taiwan account is ordinary, and Apple resolves the storefront
  // by location rather than by browser language.
  domContext.navigator.language = "en-US";
  domContext.Intl = IntlStub("Asia/Taipei");
  test.assert(live.storefront() === "tw", "a reader in Taipei goes to the Taiwan storefront, whatever their browser language says");
  domContext.Intl = IntlStub("Asia/Shanghai");
  test.assert(live.storefront() === "cn", "and one in Shanghai to the China storefront");
  domContext.Intl = IntlStub("America/New_York");
  test.assert(live.storefront() === "us", "and one in New York to the US storefront");
  domContext.Intl = IntlStub("Antarctica/Troll");
  test.assert(live.storefront() === "us", "a zone the table does not know falls back to the language's region");
  domContext.navigator.language = "zh-TW";
  test.assert(live.storefront() === "tw", "so zh-TW is still read");
  domContext.navigator.language = language;
  delete domContext.Intl;
  test.assertIncludes(source, "https://music.apple.com/${oneMoreTuneStorefront()}/search?term=",
    "the listen link is built from that storefront, never from a fixed one");

  // A search URL is not a way into the Music app — macOS opens the app onto an
  // empty Search pane, because the app opens store *items*. So the link becomes
  // the recording's own store page once Apple's catalogue names it, and the two
  // halves of that are executed here: which answer counts as this card's
  // recording, and what the reader's own store page is.
  const { bestMatch, storeUrl } = live.listenStore;
  const track = {
    wrapperType: "track",
    kind: "song",
    artistName: "FIDLAR",
    trackName: "Almost Free",
    trackId: 1440845713,
    collectionId: 1440845571,
    trackViewUrl: "https://music.apple.com/us/album/down/1440845571?i=1440845713&uo=4",
  };
  test.assert(bestMatch([track], { song: "Almost Free", artist: "FIDLAR" }) === track,
    "a matching artist and recording is the card's own song");
  test.assert(bestMatch([track], { song: "Almost Free", artist: "Someone Else" }) === null,
    "a different artist is not this card's recording, however similar the title");
  test.assert(bestMatch([track], { song: "Some Other Song", artist: "FIDLAR" }) === null,
    "and a different recording by the same artist is not claimed either");
  test.assert(
    bestMatch([
      { ...track, trackName: "Almost Free (Live)", trackId: 2 },
      { ...track, trackId: 1 },
    ], { song: "Almost Free", artist: "FIDLAR" })?.trackId === 1,
    "the exact title wins over a longer pressing of the same words",
  );
  test.assert(storeUrl(track, "tw") === "https://music.apple.com/tw/album/down/1440845571?i=1440845713",
    "the store page keeps Apple's own slug and ids, in the reader's storefront, without the tracking parameter");
  test.assert(storeUrl({ trackViewUrl: "https://example.com/not-a-store-url" }, "us") === "",
    "and a URL that is not a store item is refused rather than rewritten");
  test.assertIncludes(source, 'data-one-more-tune-listen="${oneMoreTuneEscape(identity)}"',
    "the face carries the identity the upgrade needs to find the link again");

  // A study card sounds itself, the way a round's question does: the pairing is
  // the sound, and a memory card that needs a Play tap before every card is not
  // the effect. Executed, not read: entering a unit marks the card played, and
  // the next card is a fresh card with its own autoplay.
  live.startUnit(live.units()[0].id);
  await new Promise((resolve) => setTimeout(resolve, 0));
  test.assert(live.session()?.autoPlayed === true, "a study card asks for its sound as it appears");
  run('runOneMoreTuneCommand("one-more-tune-next")');
  await new Promise((resolve) => setTimeout(resolve, 0));
  test.assert(live.session()?.index === 1 && live.session()?.autoPlayed === true,
    "and the next card asks for its own, once");
  test.assertIncludes(source, "oneMoreTuneSession.autoPlayed = false;", "each card and step gets its own autoplay");
  test.assertIncludes(source, "if (!card || !oneMoreTuneSession || oneMoreTuneSession.autoPlayed) return false;",
    "and a re-render never restarts the music under the reader");

  test.assertIncludes(source, "visitOneMoreTuneEraTheme(", "the one reveal hook every face shares is where the era visit happens");
  test.assertIncludes(source, "applyTheme(era.theme, { persist: false, announce: false, saveDesk: false })",
    "the visit previews the Appearance instead of becoming it");
  test.assertIncludes(source, "leaveOneMoreTuneEraTheme();", "and the window's own dispose is what gives it back");
  test.assertIncludes(source, 'event?.detail?.committed === true) oneMoreTuneEraVisitTheme = ""',
    "a deliberate Appearance change ends the visit rather than being undone by it");
}

test.finish();
