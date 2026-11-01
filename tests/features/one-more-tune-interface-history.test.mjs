// The era-research edition's own rules.
//
// The 16 questions in this bank were written from the WWDC20 session and the
// NeXTSTEP 3.3 guide, and the package says plainly what has not happened to
// them: independent second review, runtime integration, audio audition. So the
// authority exists, refuses to serve an unreviewed question, and the two rules
// that matter for the day the flags do flip are here as facts rather than as
// intentions:
//
//   1. a round may not contain two questions where one gives away the other --
//      including transitively, because the whole round is composed before any
//      of it is answered; and
//   2. nothing that reaches the browser before an answer names the answer: no
//      `answerId`, no explanation, no evidence locator, and not even the bank's
//      own option ids, which are re-minted per round.

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("one-more-tune-interface-history");

const authority = require("../../apps/server/server/one-more-tune-interface-history.js");
const bank = require("../../apps/server/server/one-more-tune-interface-history-bank.json");
const references = require("../../apps/server/server/one-more-tune-interface-history-references.json");

// 0. Where the evidence points has to be in the repository. The candidates cite
//    the era package's own records ("NS04" for the 3.3 Controls chapter); with
//    those records imported alongside the bank, a reviewer can follow a
//    question to its source without the package, and the coverage read-out says
//    whether any citation dangles.
test.assert(
  Array.isArray(references.items) && references.items.length === 26
    && references.importedFrom?.package === "ai_system6_era_support_20260923",
  "the reference records the candidates cite are imported with their provenance",
);
const knownReferences = new Set(references.items.map((record) => record.id));
for (const item of bank.items) {
  const cited = item.evidence?.referenceIds || [];
  test.assert(cited.length > 0, `${item.id} cites at least one reference record`);
  test.assert(cited.every((id) => knownReferences.has(id)),
    `${item.id}'s citations resolve inside the repository`);
}
test.assert(authority.coverage().unresolvableReferences.length === 0,
  "and the authority's own coverage read-out reports no dangling citation");

// 1. The shipped bank is draft material: nothing in it may be served today.
test.assert(
  bank.items.length === 16 && bank.items.every((item) => item.quizEnabled === false),
  "every candidate arrives switched off, so the bank is content and not yet a game",
);
test.assert(
  authority.publishedItems().length === 0,
  "the authority publishes only questions whose editor switch is on, and none are",
);
const round = authority.startRound();
test.assert(
  round.mode === "unavailable" && round.code === "questions_not_reviewed",
  "asking for a round says the questions are not through review instead of opening an empty one",
);
test.assert(
  round.drafted === 16 && round.available === 0,
  "the refusal counts what exists and what may be served",
);
test.assert(
  !("questions" in round) && !JSON.stringify(round).includes("answerId"),
  "a refused round carries no question payload at all",
);

// 2. The dependency rule is transitive. A -> B and B -> C means A and C cannot
//    share a round even though neither names the other.
const chain = [
  { id: "a", quizEnabled: true, revealsQuestionIds: ["b"] },
  { id: "b", quizEnabled: true, revealsQuestionIds: ["c"] },
  { id: "c", quizEnabled: true, revealsQuestionIds: [] },
  { id: "d", quizEnabled: true, revealsQuestionIds: [] },
];
const selected = authority.selectIndependent(chain, 3).map((item) => item.id);
test.assert(
  !(selected.includes("a") && selected.includes("c")),
  "a question and the question two links down its reveal chain never share a round",
);
test.assert(
  !(selected.includes("a") && selected.includes("b")),
  "a question and the question it reveals never share a round",
);
test.assert(selected.includes("d"), "an unrelated question is still available, so the rule excludes rather than empties");
test.assert(
  authority.selectIndependent(chain, 4).length === 2,
  "the round is limited by the rule, not padded past it",
);

// 3. What a browser may see before it answers.
const item = {
  id: "omt-ui-fixture",
  topic: "interface_archaeology",
  subject: { system: "NeXTSTEP", version: "3.3", historicalYear: 1995 },
  knowledgeKind: "state_meaning",
  prompt: { zh: "題幹", en: "Prompt" },
  options: [
    { id: "a", zh: "選項甲", en: "Choice one" },
    { id: "b", zh: "選項乙", en: "Choice two" },
    { id: "c", zh: "選項丙", en: "Choice three" },
    { id: "d", zh: "選項丁", en: "Choice four" },
  ],
  answerId: "b",
  explanation: { zh: "解釋", en: "Explanation" },
  evidence: { referenceIds: ["NS01"], locator: "Application Icons" },
  sharedEvidenceGroupId: "ns33-dock-state",
  quizEnabled: true,
};
const before = authority.publicQuestion(item, "round-token");
const serialized = JSON.stringify(before);
test.assert(
  !/answerId|explanation|evidence|Application Icons|ns33-dock-state/.test(serialized),
  "the pre-answer payload names no answer, explanation, evidence or shared group",
);
test.assert(
  before.choices.length === 4 && before.choices.every((choice) => !["a", "b", "c", "d"].includes(choice.id)),
  "the bank's own option ids stay in this process; the browser gets minted ones",
);
test.assert(
  before.choices.some((choice) => choice.en === "Choice two") && before.prompt.en === "Prompt",
  "the question itself travels intact, in both languages",
);

// 4. The route reaches this authority, and its refusal is what a caller reads.
//    Driven through the deployed route rather than read from it: the domain
//    list is where a fourth edition is most likely to be forgotten, and the
//    honest state of the bank has to survive the trip through HTTP.
{
  const route = require("../../apps/server/server/routes/one-more-tune.js");
  const post = async (handler, payload) => {
    const body = JSON.stringify(payload);
    const chunks = [];
    const response = {
      statusCode: 0,
      headers: null,
      writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
      write(chunk) { chunks.push(Buffer.from(chunk)); },
      setHeader() {},
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk));
        this.body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
      },
    };
    await handler({
      method: "POST",
      url: "/api/one-more-tune/round",
      headers: { host: "localhost", "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
      async *[Symbol.asyncIterator]() { yield Buffer.from(body); },
    }, response);
    return response;
  };

  const served = await post(route.handleOneMoreTuneRound, { domain: "interface_history" });
  test.assert(served.statusCode === 503 && served.body?.code === "questions_not_reviewed",
    "the route serves this domain as a review refusal, not as questions and not as an absent game");
  test.assert(served.body?.drafted === 16 && served.body?.available === 0,
    "the refusal counts the sixteen drafted questions and the none that may be served");
  const unknown = await post(route.handleOneMoreTuneRound, { domain: "interface" });
  test.assert(unknown.statusCode === 400 && unknown.body?.code === "unknown_domain",
    "a near miss is still an unknown domain, so the fourth edition did not widen the list to anything");
  test.assert(Array.isArray(unknown.body?.domains) && unknown.body.domains.includes("interface_history"),
    "and the refusal names this edition among the domains this host really plays");
}

test.finish();
