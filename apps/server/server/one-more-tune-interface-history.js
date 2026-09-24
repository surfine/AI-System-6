// Interface History: the era-research edition of One More Tune.
//
// The bank is the 16 bilingual candidates written from the WWDC20 session and
// the NeXTSTEP 3.3 guide. They are *editorial* material: every one of them
// carries `quizEnabled: false` and `review.independentSecondReview: false`,
// which is what the package says about them -- text written, independent
// second review not done, runtime integration not done.
//
// So this authority exists, and it refuses to serve. That is the honest
// state, and it is a state the caller can read rather than a silence: a round
// asked for a bank whose questions have not been reviewed gets
// `questions_not_reviewed` and nothing else. When a question is reviewed, the
// flag on that item becomes the only switch that puts it into a round.
//
// The question shape is deliberately not the music deck's: these questions
// name a system in the prompt (that is the subject, not a leak), they are
// untimed, and a wrong answer costs a point rather than revealing an audio cue.
// Everything else follows the deck's rule -- answer keys, explanations,
// evidence and internal ids stay in this process.
"use strict";

const { randomBytes, randomInt } = require("node:crypto");
const bank = require("./one-more-tune-interface-history-bank.json");
// The records the candidates' `evidence.referenceIds` point at, imported with
// the 2026-09-23 package so a reviewer can resolve "NS04" inside this
// repository instead of only inside that package. It is reference material, not
// a question bank: nothing here is served.
const references = require("./one-more-tune-interface-history-references.json");

const rounds = new Map();
const TTL = 2 * 60 * 60 * 1000;
const token = () => randomBytes(16).toString("hex");

function shuffled(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function prune() {
  for (const [id, round] of rounds) if (Date.now() - round.startedAt > TTL) rounds.delete(id);
  while (rounds.size >= 256) rounds.delete(rounds.keys().next().value);
}

/**
 * The published questions. `quizEnabled` is the switch the editor owns; a
 * question that has not been through review is not merely unlisted here, it
 * cannot reach a round even if a round is asked for by id.
 */
function publishedItems() {
  return (bank.items || []).filter((item) => item?.quizEnabled === true);
}

/**
 * A round must not contain a question whose answer another question in the
 * same round gives away. `revealsQuestionIds` is written per question; the
 * exclusion is transitive because a round is composed before any of it is
 * answered, so "A reveals B" and "B reveals C" makes A and C the same round's
 * problem even though neither names the other.
 */
function selectIndependent(items, size) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const reachable = new Map();
  const reach = (id, seen = new Set()) => {
    if (reachable.has(id)) return reachable.get(id);
    const item = byId.get(id);
    const out = new Set();
    for (const next of item?.revealsQuestionIds || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.add(next);
      for (const deeper of reach(next, seen)) out.add(deeper);
    }
    reachable.set(id, out);
    return out;
  };
  const chosen = [];
  for (const item of items) {
    if (chosen.length >= size) break;
    const conflicts = new Set([item.id, ...reach(item.id)]);
    const clashes = chosen.some((other) => conflicts.has(other.id) || reach(other.id).has(item.id));
    if (!clashes) chosen.push(item);
  }
  return chosen;
}

/**
 * What the browser may see before it answers. No `answerId`, no explanation,
 * no evidence locator, no internal id: the option ids are minted per round so
 * the bank's own `a`/`b`/`c`/`d` order never reaches the page either.
 */
function publicQuestion(item, roundToken) {
  const choices = shuffled(item.options).map((option) => ({ id: token(), text: option }));
  const answer = choices.find((choice) => choice.text.id === item.answerId);
  return {
    token: token(),
    domain: "interface_history",
    topic: item.topic,
    subject: item.subject,
    knowledgeKind: item.knowledgeKind,
    prompt: item.prompt,
    choices: choices.map(({ id, text }) => ({ id, zh: text.zh, en: text.en })),
    answerToken: answer?.id || "",
  };
}

function startRound({ size = 5 } = {}) {
  prune();
  const published = publishedItems();
  if (!published.length) {
    return {
      domain: "interface_history",
      mode: "unavailable",
      code: "questions_not_reviewed",
      bankVersion: bank.schemaVersion,
      bankRevision: bank.bankRevision,
      drafted: (bank.items || []).length,
      available: 0,
    };
  }
  const items = selectIndependent(shuffled(published), size);
  const roundToken = token();
  const questions = items.map((item) => publicQuestion(item, roundToken));
  rounds.set(roundToken, {
    startedAt: Date.now(),
    bankRevision: bank.bankRevision,
    questions: new Map(questions.map((question, index) => [question.token, { item: items[index], answerToken: question.answerToken }])),
  });
  return {
    domain: "interface_history",
    mode: "text_scenario",
    roundToken,
    bankVersion: bank.schemaVersion,
    bankRevision: bank.bankRevision,
    questions: questions.map(({ answerToken, ...rest }) => rest),
  };
}

/**
 * An answer names its round and its question; the choice is the option id the
 * round minted. The destructured signature needs its own type, or a default of
 * `{}` leaves the two tokens unreadable to the compiler.
 *
 * @param {{ roundToken?: string, questionToken?: string, choiceToken?: string }} [request]
 */
function submitAnswer({ roundToken, questionToken, choiceToken = "" } = {}) {
  prune();
  const round = rounds.get(String(roundToken || ""));
  if (!round) return { ok: false, code: "round_not_found" };
  if (round.bankRevision !== bank.bankRevision) return { ok: false, code: "round_stale" };
  const question = round.questions.get(String(questionToken || ""));
  if (!question) return { ok: false, code: "question_not_found" };
  if (question.answered) return { ok: false, code: "already_answered" };
  question.answered = true;
  const correct = Boolean(choiceToken) && choiceToken === question.answerToken;
  const item = question.item;
  return {
    ok: true,
    correct,
    points: correct ? 1 : 0,
    answerId: item.answerId,
    explanation: item.explanation,
    evidence: { referenceIds: item.evidence?.referenceIds || [], locator: item.evidence?.locator || "" },
    sharedEvidenceGroupId: item.sharedEvidenceGroupId,
  };
}

function coverage() {
  const items = bank.items || [];
  const knownReferences = new Set((references.items || []).map((record) => record.id));
  const unresolvable = items.flatMap((item) => (item.evidence?.referenceIds || [])
    .filter((id) => !knownReferences.has(id))
    .map((id) => `${item.id} -> ${id}`));
  return {
    domain: "interface_history",
    bankRevision: bank.bankRevision,
    drafted: items.length,
    published: publishedItems().length,
    secondReviewComplete: items.every((item) => item?.review?.independentSecondReview === true),
    references: knownReferences.size,
    unresolvableReferences: unresolvable,
    edition: "interface_history",
  };
}

module.exports = { startRound, submitAnswer, coverage, publishedItems, selectIndependent, publicQuestion };
