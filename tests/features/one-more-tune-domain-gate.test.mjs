// A request for a round this host does not play must be refused, not answered
// with a different game.
//
// The round route serves three authorities, and which one answers is the
// request's own `domain`. Before this gate the deck was the fall-through arm of
// a two-branch ternary: `{domain: "anything-else"}` opened a ten-song music
// round, so a client asking for a game that does not exist here was handed the
// one it did not ask for, with no way to tell. This contract drives the real
// route with a stubbed deck, which is the only place that difference is
// visible: an unknown domain must reach no authority at all.

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("one-more-tune-domain-gate");

const route = require("../../apps/server/server/routes/one-more-tune.js");
const deck = require("../../apps/server/server/one-more-tune.js");

function jsonRequest(pathname, body) {
  const payload = Buffer.from(JSON.stringify(body));
  return {
    method: "POST",
    url: pathname,
    headers: { host: "localhost", "content-type": "application/json", "content-length": String(payload.byteLength) },
    async *[Symbol.asyncIterator]() { yield payload; },
  };
}

function collector() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: null,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    write(chunk) { chunks.push(Buffer.from(chunk)); },
    end(chunk) { if (chunk) chunks.push(Buffer.from(chunk)); },
    body() { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); },
  };
}

async function ask(body, pathname = "/api/one-more-tune/round", handler = route.handleOneMoreTuneRound) {
  const res = collector();
  await handler(jsonRequest(pathname, body), res);
  return { status: res.statusCode, payload: res.body() };
}

// The deck is stubbed so that "did the music deck run" is a fact this test can
// see. A real round would go to the store for previews, which is exactly the
// call whose absence matters here.
const counters = { rounds: 0, answers: 0 };
const realStartRound = deck.startRound;
const realSubmitAnswer = deck.submitAnswer;
deck.startRound = async (...args) => { counters.rounds += 1; return realStartRound(...args); };
deck.submitAnswer = (...args) => { counters.answers += 1; return realSubmitAnswer(...args); };

// 1. An unknown domain reaches no authority and says so.
for (const domain of ["beats", "one-more-tune", "keynote", "constructor", "__proto__", "toString"]) {
  const before = counters.rounds;
  const { status, payload } = await ask({ domain });
  test.assert(status === 400 && payload?.code === "unknown_domain",
    `\`${domain}\` is refused with its own code instead of being answered by the music deck`);
  test.assert(counters.rounds === before,
    `\`${domain}\` never reaches the music deck's round`);
  test.assert(Array.isArray(payload?.domains) && payload.domains.includes("music") && payload.domains.includes("keynote_person"),
    `the refusal names the domains this host does play (${domain})`);
}

// 2. The deck is still what "no domain" and the deck's own name mean.
const plain = await ask({ challengeId: "not-a-real-challenge" });
test.assert(counters.rounds === 1, "a request with no domain still opens a music round");
test.assert(plain.payload?.mode !== undefined || plain.status !== 400, "the deck's own round keeps its own answer shape");
const named = await ask({ domain: "music" });
test.assert(counters.rounds === 2, "the deck can also be asked for by name");
test.assert(named.status !== 400 || named.payload?.code !== "unknown_domain", "the deck's own name is not an unknown domain");

// 3. The other two authorities are reached by their own names, from their own
//    banks, without the deck being touched at all.
const keynote = await ask({ domain: "keynote_person" });
test.assert(keynote.status === 200 && Array.isArray(keynote.payload?.questions) && keynote.payload.questions.length === 6,
  "the presenter relay answers a keynote_person round with its six questions");
const line = await ask({ domain: "keynote_context" });
test.assert(line.status === 200 && Array.isArray(line.payload?.questions) && line.payload.questions.length > 0,
  "the keynote line answers a keynote_context round");
test.assert(counters.rounds === 2, "neither keynote round fell through to the music deck");

// 4. The same gate guards the answer route: an unknown domain is refused before
//    any authority is handed the submission.
const beforeAnswers = counters.answers;
const unknownAnswer = await ask({ domain: "beats", token: "0".repeat(32), choice: "0".repeat(16) },
  "/api/one-more-tune/answer", route.handleOneMoreTuneAnswer);
test.assert(unknownAnswer.status === 400 && unknownAnswer.payload?.code === "unknown_domain",
  "an answer for an unknown domain is refused with the same code");
test.assert(counters.answers === beforeAnswers, "an unknown domain's answer never reaches the music deck");
const deckAnswer = await ask({ token: "0".repeat(32), choice: "0".repeat(16) },
  "/api/one-more-tune/answer", route.handleOneMoreTuneAnswer);
test.assert(counters.answers === beforeAnswers + 1,
  "an answer with no domain still goes to the deck, so the gate did not close the deck's own path");
test.assert(deckAnswer.status >= 400, "an unknown token is still refused by the deck itself");

// 5. The era-research edition is on the list, and it answers with the review
//    state instead of with questions: 16 candidates exist, none may be served
//    yet, and that is said rather than shown as an empty round.
const history = await ask({ domain: "interface_history" });
test.assert(
  history.status === 503 && history.payload?.code === "questions_not_reviewed",
  "an edition whose questions are not through review refuses with that reason",
);
test.assert(
  history.payload?.drafted === 16 && history.payload?.available === 0,
  "the refusal reports how many questions were drafted and how many may be served",
);
test.assert(
  !JSON.stringify(history.payload).match(/answerId|explanation|evidence|omt-ui-/),
  "the refusal carries no answer key, explanation, evidence locator or internal id",
);
test.assert(counters.rounds === 2, "the era-research round never reached the music deck either");

const historyAnswer = await ask({ domain: "interface_history", roundToken: "0".repeat(32), questionToken: "0".repeat(32), choiceToken: "0".repeat(32) },
  "/api/one-more-tune/answer", route.handleOneMoreTuneAnswer);
test.assert(
  historyAnswer.status >= 400 && historyAnswer.payload?.ok === false,
  "an answer submitted to the unreviewed edition is refused, because no round was ever opened",
);
test.assert(counters.answers === beforeAnswers + 1, "that answer never reached the music deck");

// 6. A text edition that cannot compose an honest round says so with a code:
//    the whole-round selector refuses rather than shrinking a round, and the
//    route turns that into an unavailable response with no bank contents and no
//    stack in it.
const relay = require("../../apps/server/server/one-more-tune-keynote.js");
const { SelectionError } = require("../../apps/server/server/one-more-tune-selection.js");
const realRelayStart = relay.startRound;
relay.startRound = () => { throw new SelectionError("no_round_satisfies_constraints", "No selection meets the editorial constraints"); };
const refused = await ask({ domain: "keynote_person" });
relay.startRound = realRelayStart;
test.assert(
  refused.status === 503 && refused.payload?.code === "no_round_satisfies_constraints",
  "a bank that cannot meet its own quotas answers with the selector's code",
);
test.assert(
  !JSON.stringify(refused.payload).match(/stack|at Object|clues|answer/i),
  "and the refusal carries neither a stack nor the bank's contents",
);
test.assert(counters.rounds === 2, "a refused relay round never falls through to the music deck");

deck.startRound = realStartRound;
deck.submitAnswer = realSubmitAnswer;

test.finish();
