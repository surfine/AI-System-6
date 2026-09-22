// One More Line — the keynote-line round.
//
// A third text game beside the music deck and the presenter relay, built from
// the keynote-language research package. This contract holds it to that
// package's rules, which are the ones a later edit is most likely to sand off:
//
//   1. NO UNREVIEWED AUDIO. Every item is text-only because the recordings
//      behind the lines have not been auditioned; the face may not grow a
//      player, and a transcript position may not be presented as a playback
//      second.
//   2. THE ANSWER KEY STAYS ON THE SERVER. A round carries tokens, prompts and
//      this round's option order — never the answer, the explanation or the
//      source.
//   3. READING IS NOT A MISS. Skipping is allowed, still opens the note, and is
//      reported apart from the first answers.
//   4. RELATED LINES DO NOT SIT TOGETHER. A phrase with two checked uses may
//      not fill two adjacent questions, or the first explanation answers the
//      second question.
//
// The last one is a property, not a spot check: the ordering is exercised over
// many draws, because a plain shuffle violates it regularly.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("one-more-line");
const require = createRequire(import.meta.url);

// The route file is required, not read: it is the module the deployed server
// serves as its endpoint, so driving its handlers runs the dispatch this mode
// had to be added to — including the parts that must still answer the relay and
// the music deck.
const route = require("../../apps/server/server/routes/one-more-tune.js");
const bank = JSON.parse(readFileSync(new URL("../../apps/server/server/one-more-line-bank.json", import.meta.url), "utf8"));
const routes = read("app/features/one-more-tune.js");
const routeFile = readFileSync(new URL("../../apps/server/server/routes/one-more-tune.js", import.meta.url), "utf8");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

const LANGUAGE_FIELDS = ["zh", "en"];
const text = (value, language) => String(value?.[language] || "").trim();

/** A response object the route can write into, the way the relay's contract does. */
function collector() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: null,
    body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    write(chunk) { chunks.push(Buffer.from(chunk)); },
    setHeader() {},
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
      try {
        this.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        this.body = null;
      }
    },
  };
}

/** One POST through the real route, answered. */
async function post(handler, payload) {
  const body = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const request = {
    method: "POST",
    url: "/api/one-more-tune/round",
    headers: { host: "localhost", "content-type": "application/json", "content-length": String(encoder.encode(body).byteLength) },
    async *[Symbol.asyncIterator]() {
      yield encoder.encode(body);
    },
  };
  const response = collector();
  await handler(request, response);
  return response;
}

const startRound = async (payload) => (await post(route.handleOneMoreTuneRound, payload)).body;
const answerRound = async (payload) => (await post(route.handleOneMoreTuneAnswer, payload)).body;

// ---- The bank --------------------------------------------------------------
test.assert(bank.schemaVersion === 1, "the bank declares the schema version it is written in");
test.assert(bank.mode === "keynote_context", "the bank names the domain the round asks for");
test.assert(bank.items.length === 12, `the bank carries the research package's twelve checked questions (${bank.items.length})`);
test.assert(LANGUAGE_FIELDS.every((language) => text(bank.title, language) && text(bank.purpose, language)),
  "the bank's own title and purpose are written in both languages");
test.assert(Array.isArray(bank.reviewNotes) && bank.reviewNotes.length >= 3, "the bank states what it is not: the sample boundary and the audio boundary");

const idCounts = new Map();
const phraseItems = new Map();
for (const item of bank.items) {
  idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);
}
test.assert([...idCounts.values()].every((count) => count === 1), "every question id is unique");

for (const item of bank.items) {
  const optionIds = item.options.map((option) => option.id);
  test.assert(item.options.length === 4, `${item.id} offers four options`);
  test.assert(new Set(optionIds).size === 4, `${item.id} offers four distinct options`);
  test.assert(optionIds.includes(item.answerId), `${item.id} names an answer that is one of its options`);
  test.assert(LANGUAGE_FIELDS.every((language) => text(item.prompt, language)), `${item.id} asks its question in both languages`);
  test.assert(LANGUAGE_FIELDS.every((language) => text(item.explanation, language)), `${item.id} carries the explanation in both languages`);
  test.assert(item.options.every((option) => LANGUAGE_FIELDS.every((language) => text(option, language))), `${item.id} writes every option in both languages`);
  test.assert(/^https:\/\//.test(String(item.source?.url || "")), `${item.id} links a source over https`);
  test.assert(LANGUAGE_FIELDS.every((language) => text(item.source?.label, language) && text(item.source?.locator, language)),
    `${item.id} names the source and its transcript position in both languages`);
  test.assert(item.source?.permanent === false, `${item.id} marks its transcript position as a lookup, not a timeline`);
  test.assert(Array.isArray(item.researchIds) && item.researchIds.length > 0, `${item.id} traces back to the research evidence ids`);
  test.assert(Boolean(String(item.sharedGroup || "")), `${item.id} belongs to a shared evidence group`);
  // Rule 1, item by item: an item may not claim audio that was never auditioned.
  test.assert(item.review?.audioReviewed === false && item.review?.audioAllowed === false,
    `${item.id} ships with no reviewed or allowed audio`);
  test.assert(item.review?.productionEnabled === false, `${item.id} is a learning item, not a production question`);
  test.assert(item.review?.textDemoEnabled === true, `${item.id} is enabled as a written question`);
}

// Rule 4 needs the phrase pairs to be findable; a note that names the other use
// is what makes the second question worth asking rather than a free answer.
for (const item of bank.items) {
  const key = item.phrase?.id || "";
  if (!key) continue;
  if (!phraseItems.has(key)) phraseItems.set(key, []);
  phraseItems.get(key).push(item);
}
const reusedPhrases = [...phraseItems.entries()].filter(([, items]) => items.length > 1);
test.assert(reusedPhrases.length === 2, `two phrases carry two checked uses each (${reusedPhrases.map(([key]) => key).join(", ")})`);
for (const [key, items] of reusedPhrases) {
  test.assert(items.length === 2, `${key} has exactly two questions, so the pair is separable`);
  for (const item of items) {
    test.assert(LANGUAGE_FIELDS.every((language) => text(item.phraseNote, language)),
      `${item.id} names the other use of ${key} in both languages`);
  }
}
for (const item of bank.items) {
  const note = item.phraseNote || {};
  const written = LANGUAGE_FIELDS.filter((language) => text(note, language));
  // A note is optional, but a half-written one is not: the window would show a
  // blank line in one language and a sentence in the other.
  test.assert(written.length === 0 || written.length === 2,
    written.length === 0
      ? `${item.id} leaves its phrase note empty rather than half-written`
      : `${item.id} writes its phrase note in both languages`);
}

// ---- The round, through the endpoint the browser calls ---------------------
{
  const response = await post(route.handleOneMoreTuneRound, { domain: "keynote_context" });
  const round = response.body;
  test.assert(response.statusCode === 200, "the round route answers a line request");
  test.assert(round.domain === "keynote_context" && round.mode === "text_lines", "a round announces its own domain and mode");
  test.assert(round.questions.length === 10 && round.roundSize === 10, `a round asks ten of the twelve questions (${round.questions.length})`);
  test.assert(round.maxPoints === 10, "a round scores one point a question");
  for (const question of round.questions) {
    test.assert(Boolean(question.token) && question.choices.length === 4, "each question carries a token and four options");
    test.assert(question.choices.every((choice) => ["a", "b", "c", "d"].includes(choice.id)), "options are labelled by position, not by the bank's own ids");
    test.assert(question.choices.every((choice) => text(choice.text, "zh") && text(choice.text, "en")), "options arrive in both languages");
    test.assert(LANGUAGE_FIELDS.every((language) => text(question.prompt, language)), "the prompt arrives in both languages");
  }
  // Rule 2: what the browser is handed may not contain the answer.
  const payload = JSON.stringify(round);
  for (const leak of ["answerId", "correctId", "explanation", "phraseNote", "source", "researchIds", "review"]) {
    test.assert(!payload.includes(`"${leak}"`), `a round never ships ${leak}`);
  }
  const leakedExplanation = bank.items.find((item) => payload.includes(item.explanation.zh.slice(0, 16))
    || payload.includes(item.explanation.en.slice(0, 16)));
  test.assert(!leakedExplanation, leakedExplanation
    ? `a round ships the explanation of ${leakedExplanation.id}`
    : "a round ships no explanation text");
}

// Rule 4 as a property: the same phrase may not fill two adjacent questions.
// Sixty draws, because a plain shuffle violates this often enough that a broken
// rule cannot survive the sample, and rare enough that a working one can.
{
  let worst = "";
  for (let draw = 0; draw < 60 && !worst; draw += 1) {
    const round = await startRound({ domain: "keynote_context" });
    const keys = round.questions.map((question) => question.phrase?.id || `solo:${question.token}`);
    for (let i = 1; i < keys.length; i += 1) {
      if (keys[i] === keys[i - 1] && !keys[i].startsWith("solo:")) worst = keys[i];
    }
  }
  test.assert(!worst, worst ? `two questions about ${worst} sat next to each other in 60 draws` : "60 draws never put two questions about one phrase side by side");
}

// The other two authorities still answer: a dispatch that grew a third branch
// must not have swallowed the two it already had.
{
  const relay = await startRound({ domain: "keynote_person" });
  test.assert(relay.domain === "keynote_person" && relay.questions.length === 6, "the relay still opens a round of six handoffs");
}

// ---- Answering, skipping, and what a reveal is allowed to say ---------------
{
  const round = await startRound({ domain: "keynote_context" });
  const [first, second] = round.questions;
  test.assert((await answerRound({ domain: "keynote_context", roundToken: round.roundToken, questionToken: first.token, choiceId: "zzz" })).code === "invalid_choice",
    "a choice the round never offered is refused");
  test.assert((await answerRound({ domain: "keynote_context", roundToken: round.roundToken, questionToken: "foreign", choiceId: "a" })).code === "question_not_found",
    "a question token from outside the round is refused");
  test.assert((await answerRound({ domain: "keynote_context", roundToken: "foreign", questionToken: first.token, choiceId: "a" })).code === "round_not_found",
    "a round token that was never issued is refused");

  const skipped = await answerRound({ domain: "keynote_context", roundToken: round.roundToken, questionToken: first.token, action: "skip" });
  test.assert(skipped.ok && skipped.skipped === true && skipped.correct === false && skipped.points === 0,
    "a skip is recorded as a skip, not as a wrong answer that was guessed");
  test.assert(Boolean(skipped.reveal?.explanation?.zh) && Boolean(skipped.reveal?.source?.url),
    "a skipped question still opens its note and its source");

  const repeated = await answerRound({ domain: "keynote_context", roundToken: round.roundToken, questionToken: first.token, choiceId: "a" });
  test.assert(repeated.repeated === true && repeated.skipped === true, "a second submission returns the first outcome rather than a new one");

  const correctId = second.choices[0].id;
  const answered = await answerRound({ domain: "keynote_context", roundToken: round.roundToken, questionToken: second.token, choiceId: correctId });
  test.assert(answered.ok && answered.repeated === false, "the second question still accepts a submission");
  test.assert(answered.correct === (correctId === answered.reveal.correctId), "the reveal names the option that was right, so a face can mark it");
  test.assert(answered.points === (answered.correct ? 1 : 0), "one point for a right answer, none otherwise");
  test.assert(text(answered.reveal.answer, "zh") && text(answered.reveal.answer, "en"), "the reveal states the answer in both languages");
  test.assert(Boolean(answered.reveal.source.locator.zh) && answered.reveal.source.permanent === false,
    "the reveal carries the transcript position and says it is not a playback second");

  // The relay's tokens belong to the relay: one authority may not answer for
  // another, or a stale tab could spend a round it does not own.
  const relayRound = await startRound({ domain: "keynote_person" });
  test.assert((await answerRound({ domain: "keynote_context", roundToken: relayRound.roundToken, questionToken: relayRound.questions[0].token, choiceId: "a" })).code === "round_not_found",
    "a relay round token is not a line round token");
}

// ---- The route the browser actually uses -----------------------------------
test.assertIncludes(routeFile, 'body?.domain === "keynote_context"', "the round route dispatches the line domain");
test.assertIncludes(routeFile, 'require("../one-more-line.js")', "and to the line authority, not to the music deck");
// The Pages tree is not published, so a public clone carries no functions/
// directory. Where it exists, the forwarding route set is asserted; the private
// tree is where that claim can be made at all.
if (exists("functions/api/one-more-tune/[[path]].js")) {
  test.assertIncludes(
    read("functions/api/one-more-tune/[[path]].js"),
    'QUIZ_ROUTES = new Set(["round", "answer"',
    "the public origin forwards the same two routes, so the deployed site reaches this authority",
  );
}

// ---- The face --------------------------------------------------------------
test.assertIncludes(routes, 'data-one-more-tune-view="line" data-i18n="one_more_tune_view_line"', "the mode has a public tab of its own");
test.assertIncludes(routes, 'oneMoreTuneView === "line"', "and a face the window can draw");
test.assertIncludes(routes, "function renderOneMoreTuneLine(body)", "drawn by its own renderer");
test.assertIncludes(routes, "async function startOneMoreTuneLineRound()", "opened through the existing service boundary");
test.assertIncludes(routes, 'body: { domain: "keynote_context" }', "which is the line domain and not the relay's");
test.assertIncludes(routes, "oneMoreTuneLineRound", "the round lives in this window's own state");
test.assertIncludes(routes, '"one-more-tune-line-start"', "the start command is registered");
test.assertIncludes(routes, '"one-more-tune-line-next"', "so is the next command");
test.assertIncludes(routes, 'target.closest("[data-one-more-tune-line-answer]")', "an option is answered by the click the person made");
test.assertIncludes(routes, 'target.closest("[data-one-more-tune-line-skip]")', "and a skip is its own control rather than a guessed option");

// Rule 1 on the face: no player, no media command, no audio element.
{
  const face = routes.slice(routes.indexOf("function renderOneMoreTuneLine(body)"), routes.indexOf("function renderOneMoreTuneAnswerUnaccepted"));
  for (const forbidden of ["<audio", "<video", "<iframe", "one-more-tune-hear", "one-more-tune-play-film", "darkplayer"]) {
    test.assert(!face.includes(forbidden), `the line face carries no ${forbidden}`);
  }
  test.assert(face.includes("one_more_tune_line_audio_note"), "it says in writing why there is nothing to play");
  // Rule 2 on the face: nothing from the reveal is drawn before a submission.
  const beforeAnswer = face.slice(face.indexOf("!question.submitted ?"), face.indexOf(": `<div class=\"revealbox\">"));
  test.assert(!beforeAnswer.includes("reveal"), "the question half of the face reads nothing from the reveal");
  test.assert(face.includes("phraseNote") && face.includes("one_more_tune_line_same_phrase"),
    "a second use of the same phrase is named as such in the reveal, not folded into the explanation");
  test.assert(face.includes("one_more_tune_line_source") && face.includes("source?.locator"),
    "the reveal shows where in the source the line sits");
}

// Rule 3 on the face: the round separates first answers from skips.
test.assertIncludes(routes, "if (result.skipped) oneMoreTuneLineRound.skipped += 1", "a skip is counted as a skip");
test.assertIncludes(routes, "if (result.correct) oneMoreTuneLineRound.correct += 1", "and a right first answer as a right answer");
test.assertMatches(routes, /one_more_tune_line_score_line[\s\S]{0,240}\{right\}[\s\S]{0,120}\{max\}[\s\S]{0,120}\{skipped\}/,
  "the result names the two numbers apart rather than adding them into one");

// ---- Copy, in both languages ------------------------------------------------
const LINE_KEYS = [
  "one_more_tune_view_line",
  "one_more_tune_line_tag",
  "one_more_tune_line_title",
  "one_more_tune_line_intro",
  "one_more_tune_line_audio_note",
  "one_more_tune_line_start",
  "one_more_tune_line_again",
  "one_more_tune_line_opening",
  "one_more_tune_line_unavailable",
  "one_more_tune_line_answer",
  "one_more_tune_line_same_phrase",
  "one_more_tune_line_source",
  "one_more_tune_line_finish",
  "one_more_tune_line_done",
  "one_more_tune_line_score_title",
  "one_more_tune_line_score_line",
];
for (const key of LINE_KEYS) {
  test.assertIncludes(en, `    ${key}:`, `the English table carries ${key}`);
  test.assertIncludes(zh, `    ${key}:`, `中文表里有 ${key}`);
}
test.assertIncludes(zh, 'one_more_tune_line_audio_note: "这一版使用发布会文字资料，不播放尚未审听的讲者原声；文字稿里的位置不是播放秒数。"',
  "中文里说清了这一版没有原声、文字稿位置也不是播放秒数");
test.assertIncludes(en, "transcript position is not a playback second", "the English note draws the same boundary");

test.finish();
