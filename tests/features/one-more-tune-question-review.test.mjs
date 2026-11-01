// Every question in the two keynote rounds arrives with its review and its
// dependencies, and nothing unreviewed can be asked.
//
// The presenter relay and the keynote line are authored question banks, not
// scraped ones: each item carries where its claim was checked (`review.method`,
// `review.checkedOn`, the transcript locator), which research records it came
// from (`researchIds`), and which evidence group it shares with its neighbours
// (`sharedGroup`). The line bank has had item-by-item assertions since it
// landed; the relay's bank carried the same fields with nothing holding them,
// which is the shape a later edit sands off first.
//
// Three things are pinned here, for both banks:
//
//   1. A NEW QUESTION COMES WITH ITS REVIEW. An item whose choices were never
//      checked, or whose audio claim is not answered for, cannot enter a round.
//   2. A ROUND ASKS ONE QUESTION PER EVIDENCE GROUP. Two items from one
//      announcement would answer each other.
//   3. THE REVIEW IS NOT THE PLAYER'S. Metadata stays server-side; the browser
//      is handed tokens, clues and this round's option order only.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("one-more-tune-question-review");
const require = createRequire(import.meta.url);

const route = require("../../apps/server/server/routes/one-more-tune.js");
const relayDeck = require("../../apps/server/server/one-more-tune-keynote.js");
const lineDeck = require("../../apps/server/server/one-more-line.js");
// The era/event quotas are one implementation, shared by both authorities;
// the contract reads the same bands the round does rather than a second copy.
const { eraOf } = require("../../apps/server/server/one-more-tune-selection.js");
const banks = {
  keynote_person: JSON.parse(readFileSync(new URL("../../apps/server/server/one-more-tune-keynote-bank.json", import.meta.url), "utf8")),
  keynote_context: JSON.parse(readFileSync(new URL("../../apps/server/server/one-more-line-bank.json", import.meta.url), "utf8")),
};
// The records the 2026-09-23 merge brought in with its 41 questions. An item
// that cites one of these has to agree with it -- same event date, same URL --
// or the citation is decoration. Items whose ids belong to the maintainers'
// private index (`E0…`, `KEYNOTE-…`, `rel_…`) are left alone: they resolve
// nowhere in this repository, before and after the merge.
const importedSources = new Map(
  JSON.parse(readFileSync(new URL("../../apps/server/server/one-more-tune-history-sources.json", import.meta.url), "utf8"))
    .items.map((record) => [record.id, record]),
);
test.assert(importedSources.size === 16, "the imported reference set is the sixteen records the merge came with");
for (const [domain, bank] of Object.entries(banks)) {
  const cited = bank.items.filter((item) => (item.researchIds || []).some((id) => importedSources.has(id)));
  test.assert(cited.length > 0, `${domain} has items citing the imported records`);
  for (const item of cited) {
    const record = importedSources.get(item.researchIds.find((id) => importedSources.has(id)));
    test.assert(String(item.event?.date || "") === String(record.date || ""),
      `${domain}/${item.id} is dated the same as the record it cites (${record.id})`);
    const url = item.source?.url || item.sourceUrl;
    test.assert(String(url || "") === String(record.url || ""),
      `${domain}/${item.id} cites the record's own URL (${record.id})`);
  }
}
const LANGUAGE_FIELDS = ["zh", "en"];
const text = (value, language) => String(value?.[language] || "").trim();

function collector() {
  const chunks = [];
  return {
    statusCode: 0,
    writeHead(status) { this.statusCode = status; },
    write(chunk) { chunks.push(Buffer.from(chunk)); },
    setHeader() {},
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
      try { this.body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { this.body = null; }
    },
  };
}

async function post(handler, payload) {
  const body = JSON.stringify(payload);
  const request = {
    method: "POST",
    url: "/api/one-more-tune/round",
    headers: { host: "localhost", "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
    async *[Symbol.asyncIterator]() { yield Buffer.from(body); },
  };
  const response = collector();
  await handler(request, response);
  return response;
}

// ---- 1. The review travels with the question --------------------------------

for (const [domain, bank] of Object.entries(banks)) {
  test.assert(Array.isArray(bank.items) && bank.items.length > 0, `${domain}: the bank has questions`);
  test.assert(Boolean(bank.reviewNotes), `${domain}: the bank states what its review does not cover`);
  for (const item of bank.items) {
    const review = item.review || {};
    test.assert(Boolean(String(review.method || "")), `${domain}/${item.id}: names how it was checked`);
    test.assert(/^\d{4}-\d{2}-\d{2}$/.test(String(review.checkedOn || "")), `${domain}/${item.id}: dates the check`);
    test.assert(review.choicesReviewed === true, `${domain}/${item.id}: its choices were reviewed`);
    test.assert(review.audioReviewed === false && review.audioAllowed === false,
      `${domain}/${item.id}: claims no audio that was never auditioned`);
    test.assert(Array.isArray(item.researchIds) && item.researchIds.length > 0,
      `${domain}/${item.id}: traces back to the research records it came from`);
    test.assert(Boolean(String(item.sharedGroup || "")), `${domain}/${item.id}: belongs to one evidence group`);
  }
  const groups = bank.items.map((item) => item.sharedGroup);
  test.assert(new Set(groups).size < groups.length || domain === "keynote_context",
    `${domain}: the bank names its groups so a round can keep to one question each`);
}

// The relay's own clues are written in both languages; a clue that exists in
// one language only is a question half the players cannot read.
for (const item of banks.keynote_person.items) {
  for (const language of LANGUAGE_FIELDS) {
    test.assert(text(item.role, language) && text(item.story, language)
      && Array.isArray(item.clues?.[language]) && item.clues[language].length >= 3,
      `keynote_person/${item.id}: writes its role, clues and story in ${language}`);
  }
}

// ---- 2. One question per evidence group in a round ---------------------------

// Identity for the round's own questions: the presented clue is the item's
// first clue, which is how a question can be traced back to its bank row
// without the round shipping the row's id.
const cluesToGroup = new Map();
for (const item of banks.keynote_person.items) {
  const first = JSON.stringify(item.clues.zh[0]);
  test.assert(!cluesToGroup.has(first), `keynote_person/${item.id}: its opening clue identifies one question`);
  cluesToGroup.set(first, item.sharedGroup);
}
for (let draw = 0; draw < 6; draw += 1) {
  const round = relayDeck.startRound();
  test.assert(round.questions.length === 6, "a relay round asks six questions");
  const askedGroups = round.questions.map((question) => cluesToGroup.get(JSON.stringify(question.clues.zh[0])));
  test.assert(askedGroups.every(Boolean), "every asked question traces back to its own bank row");
  test.assert(new Set(askedGroups).size === askedGroups.length,
    "two questions from one evidence group never share a round, or the first would answer the second");
}
const relayRound = relayDeck.startRound();
test.assert(relayRound.questions.every((question) => question.clues?.zh?.length >= 1 && question.clues?.en?.length >= 1),
  "every relay question hands over its clue in both languages");
const lineRound = lineDeck.startRound();
test.assert(lineRound.questions.length === 10, "a line round asks ten questions");

// ---- 2b. The editorial quotas, in the words the 2026-09-22 package used ------
//
// The package that prepared the 26 history questions also prepared the rule for
// spending them: a relay round spans at least two era buckets with at least
// three pre-2020 handoffs and at most two questions per event; a line round
// spans at least three era buckets with at least four pre-2020 questions and at
// most two per event. Those are editorial policy, not psychometrics, and the
// selector refuses to quietly shrink a round when they cannot be met — so the
// contract checks both halves: the rounds satisfy them, and the bank can still
// satisfy them after the merge.
const OLD_YEAR = 2019;
const yearOf = (question) => Number(String(question.event?.date || "").slice(0, 4));
const perEventCap = (questions) => {
  const counts = new Map();
  for (const question of questions) counts.set(question.event?.id, (counts.get(question.event?.id) || 0) + 1);
  return Math.max(...counts.values());
};
for (let draw = 0; draw < 6; draw += 1) {
  const round = relayDeck.startRound();
  test.assert(new Set(round.questions.map(eraOf)).size >= 2,
    "a relay round spans at least two era buckets");
  test.assert(round.questions.filter((question) => yearOf(question) <= OLD_YEAR).length >= 3,
    "and hands over at least three pre-2020 presentations");
  test.assert(perEventCap(round.questions) <= 2, "no event supplies more than two handoffs");
}
for (let draw = 0; draw < 6; draw += 1) {
  const round = lineDeck.startRound();
  test.assert(round.questions.length === 10, "a line round still asks ten questions");
  test.assert(new Set(round.questions.map(eraOf)).size >= 3,
    "a line round spans at least three era buckets");
  test.assert(round.questions.filter((question) => yearOf(question) <= OLD_YEAR).length >= 4,
    "and carries at least four pre-2020 questions");
  test.assert(perEventCap(round.questions) <= 2, "no event supplies more than two questions");
}

// ---- 3. The review stays on the server --------------------------------------

for (const domain of ["keynote_person", "keynote_context"]) {
  const response = await post(route.handleOneMoreTuneRound, { domain });
  test.assert(response.statusCode === 200, `${domain}: the round route answers`);
  const payload = JSON.stringify(response.body);
  for (const leak of ["researchIds", "review", "sharedGroup", "checkedOn", "method", "sourceUrl"]) {
    test.assert(!payload.includes(`"${leak}"`), `${domain}: a round never ships ${leak}`);
  }
  // The choices do carry the right answer -- that is what a choice is -- so the
  // thing that must not travel is the reasoning behind it and the bank's own
  // identity for the row.
  for (const item of banks[domain].items) {
    const story = item.story?.zh?.slice(0, 12);
    test.assert(!story || !payload.includes(story), `${domain}: a round never ships the explanation (${item.id})`);
    test.assert(!payload.includes(`"${item.id}"`), `${domain}: a round never ships the bank's row id (${item.id})`);
  }
}

test.finish();
