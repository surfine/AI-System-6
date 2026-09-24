// Keynote Relay: an authored text-clue game, separate from music and FSRS.
// Only the server holds answers and unopened clues. These records do not grant
// permission to play keynote audio or promote the supplied research drafts.
"use strict";
const { randomBytes, randomInt } = require("node:crypto");
const bank = require("./one-more-tune-keynote-bank.json");
const { pickDiverseItems } = require("./one-more-tune-selection.js");
const rounds = new Map();
const ROUND_SIZE = 6;
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
function publicQuestion(question) {
  const item = question.item;
  return { token: question.token, event: item.event, role: item.role,
    clues: { zh: item.clues.zh.slice(0, question.level + 1), en: item.clues.en.slice(0, question.level + 1) },
    level: question.level, availablePoints: 3 - question.level, choices: question.choices };
}
function startRound() {
  prune();
  // One question per shared-evidence group, at most two per event, at least two
  // era buckets and three historical questions: the editorial policy the
  // 2026-09-22 package brought with its questions. The selector throws a coded
  // SelectionError instead of quietly shrinking the round, and the route turns
  // that into an unavailable response.
  const items = pickDiverseItems(bank.items, {
    size: ROUND_SIZE,
    maxPerEvent: 2,
    minEras: 2,
    minOld: 3,
    oldYear: 2019,
  });
  const roundToken = token();
  const questions = items.map((item) => {
    const choices = shuffled([item.answer, ...item.distractors]).map((label) => ({ id: token(), label }));
    return { token: token(), item, choices, correctToken: choices.find((c) => c.label === item.answer).id, level: 0, result: null };
  });
  rounds.set(roundToken, { startedAt: Date.now(), questions });
  return { domain: "keynote_person", mode: "text_clues", roundToken, bankVersion: bank.schemaVersion,
    questions: questions.map(publicQuestion), maxPoints: ROUND_SIZE * 3 };
}
/** @param {any} input */
function submitAnswer(input = {}) {
  const { roundToken, questionToken, choiceToken = "", skipped = false, action = "answer", hintLevel } = input;
  const round = rounds.get(roundToken);
  if (!round || Date.now() - round.startedAt > TTL) {
    rounds.delete(roundToken);
    return { ok: false, code: "round_not_found" };
  }
  const q = round.questions.find((question) => question.token === questionToken);
  if (!q) return { ok: false, code: "question_not_found" };
  if (q.result) return { ok: true, repeated: true, ...q.result };
  if (action === "hint") {
    if (!Number.isInteger(hintLevel) || hintLevel < 1 || hintLevel > 2 || hintLevel > q.level + 1) return { ok: false, code: "invalid_choice" };
    // A repeated network request for the same hint never charges twice.
    q.level = Math.max(q.level, hintLevel);
    return { ok: true, question: publicQuestion(q) };
  }
  if (action !== "answer" || (!skipped && !q.choices.some((c) => c.id === choiceToken))) return { ok: false, code: "invalid_choice" };
  const correct = !skipped && choiceToken === q.correctToken;
  q.result = { correct, points: correct ? 3 - q.level : 0, skipped, hintsUsed: q.level,
    reveal: { answer: q.item.answer, correctToken: q.correctToken, story: q.item.story,
      sourceUrl: q.item.sourceUrl, sourceLabel: q.item.sourceLabel, role: q.item.role } };
  return { ok: true, repeated: false, ...q.result };
}
module.exports = { startRound, submitAnswer, ROUND_SIZE };
