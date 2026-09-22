// One More Line: the keynote-line round, and its answer key.
//
// A third text mode beside the music deck and the Keynote Relay, and a
// different task from both. The relay asks WHO took a hand-off, from clues
// opened one at a time; this one asks what a line was doing and what came next.
// The research package behind it is explicit that those are separate jobs —
// "音乐记忆、人物原声辨认、发布史知识和语境理解是不同任务" — so they are
// separate rounds rather than three faces of one score.
//
// Four rules come from that package and are structural here:
//
//   1. NO UNREVIEWED AUDIO. Every bank item carries audioAuditioned false, and
//      this module hands out no media descriptor at all. A line is asked about
//      in writing until a same-version recording has been auditioned line by
//      line and its usage cleared.
//   2. THE ANSWER KEY STAYS HERE. A round carries tokens, prompt text and this
//      round's own option order — no answer, no explanation, no source. Those
//      arrive only in the reply to a submission.
//   3. LEARNING IS NOT A MISS. Skipping is allowed and still reveals the line,
//      its explanation and its source: the question somebody could not answer
//      is the one they most need the note for. The round reports skips apart
//      from the answers that were offered, and nothing here grades a person —
//      "答题失败只说明本题未选中正确选项，不作知识水平评价".
//   4. RELATED LINES DO NOT SIT TOGETHER. A phrase with two checked uses (One
//      more thing at WWDC23 and WWDC24; heading downstairs in 2022 and 2023)
//      must not fill two adjacent questions, or the explanation of the first
//      one hands over the second.
//
// Ten questions a round — the package asks for "十题左右为一次短轮" — drawn
// from a bank of twelve, untimed, one submission each, a point a question.
"use strict";
const { randomBytes, randomInt } = require("node:crypto");
const bank = require("./one-more-line-bank.json");

const ROUND_SIZE = 10;
const TTL = 2 * 60 * 60 * 1000;
const MAX_ROUNDS = 256;
const LETTERS = ["a", "b", "c", "d", "e", "f"];

const rounds = new Map();
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
  while (rounds.size >= MAX_ROUNDS) rounds.delete(rounds.keys().next().value);
}

/** The phrase a question rests on, or the question's own id when it has none. */
function phraseKey(item) {
  return item.phrase?.id || `solo:${item.id}`;
}

/** Does this order ever put two questions about the same phrase side by side? */
function hasNeighbouringPhrase(items) {
  for (let i = 1; i < items.length; i += 1) {
    if (phraseKey(items[i]) === phraseKey(items[i - 1])) return true;
  }
  return false;
}

/**
 * Ten questions, with the two-use phrases held apart.
 *
 * A plain shuffle put the two One more thing questions next to each other often
 * enough to matter, and the second one is then free: the explanation of the
 * first names the other use on purpose. The order is repaired by drawing the
 * next question from the phrases that are not the previous one, and the whole
 * draw is retried if the bank is ever edited into a shape where that cannot
 * work — the invariant is checked, not assumed.
 */
function pickItems() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const remaining = shuffled(bank.items).slice(0, ROUND_SIZE);
    const ordered = [];
    while (remaining.length) {
      const previous = ordered[ordered.length - 1];
      const allowed = remaining.filter((item) => !previous || phraseKey(item) !== phraseKey(previous));
      const next = (allowed.length ? allowed : remaining)[randomInt((allowed.length ? allowed : remaining).length)];
      ordered.push(next);
      remaining.splice(remaining.indexOf(next), 1);
    }
    if (!hasNeighbouringPhrase(ordered)) return ordered;
  }
  throw new Error("One More Line cannot separate two questions about the same phrase");
}

/**
 * What the browser may see before it answers.
 *
 * Options travel in this round's own order and are labelled by position, so the
 * letter on screen carries no information about the answer: the correct letter
 * changes from round to round, and the answer key never leaves this process.
 */
function publicQuestion(question) {
  const item = question.item;
  return {
    token: question.token,
    event: item.event,
    phrase: item.phrase?.form ? item.phrase : null,
    kind: item.kind,
    prompt: item.prompt,
    // The bank's own option ids stay here: only the position letter a person
    // reads on screen travels, and it is recomputed every round.
    choices: question.choices.map((choice) => ({ id: choice.id, text: choice.text })),
  };
}

function startRound() {
  prune();
  const items = pickItems();
  if (items.length !== ROUND_SIZE) throw new Error("One More Line needs ten questions");
  const roundToken = token();
  const questions = items.map((item) => {
    const choices = shuffled(item.options).map((option, index) => ({
      id: LETTERS[index] || String(index),
      text: { zh: option.zh, en: option.en },
      sourceId: option.id,
    }));
    return {
      token: token(),
      item,
      choices,
      correctId: choices.find((choice) => choice.sourceId === item.answerId).id,
      result: null,
    };
  });
  rounds.set(roundToken, { startedAt: Date.now(), questions });
  return {
    domain: "keynote_context",
    mode: "text_lines",
    roundToken,
    bankVersion: bank.schemaVersion,
    roundSize: ROUND_SIZE,
    maxPoints: ROUND_SIZE,
    questions: questions.map(publicQuestion),
  };
}

/**
 * One submission, or one skip. Both come back with the reveal, because the
 * explanation and the source are the part of this game that is worth keeping.
 */
/** @param {any} input */
function submitAnswer(input = {}) {
  const { roundToken, questionToken, choiceId = "", skipped = false, action = "answer" } = input;
  const round = rounds.get(roundToken);
  if (!round || Date.now() - round.startedAt > TTL) {
    rounds.delete(roundToken);
    return { ok: false, code: "round_not_found" };
  }
  const question = round.questions.find((entry) => entry.token === questionToken);
  if (!question) return { ok: false, code: "question_not_found" };
  if (question.result) return { ok: true, repeated: true, ...question.result };
  const skip = skipped === true || action === "skip";
  if (action !== "answer" && action !== "skip") return { ok: false, code: "invalid_action" };
  if (!skip && !question.choices.some((choice) => choice.id === choiceId)) {
    return { ok: false, code: "invalid_choice" };
  }
  const item = question.item;
  const correct = !skip && choiceId === question.correctId;
  question.result = {
    correct,
    points: correct ? 1 : 0,
    skipped: skip,
    reveal: {
      answer: (() => {
        const option = item.options.find((entry) => entry.id === item.answerId);
        return option ? { zh: option.zh, en: option.en } : null;
      })(),
      correctId: question.correctId,
      explanation: item.explanation,
      phraseNote: item.phraseNote?.zh || item.phraseNote?.en ? item.phraseNote : null,
      phrase: item.phrase?.form ? item.phrase : null,
      event: item.event,
      kind: item.kind,
      source: item.source,
      researchIds: item.researchIds,
    },
  };
  return { ok: true, repeated: false, ...question.result };
}

module.exports = { startRound, submitAnswer, ROUND_SIZE, bankVersion: bank.schemaVersion };
