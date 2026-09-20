// How a research-package question and a deck card are known to be the same
// record, in one place.
//
// The deck is not the package renumbered: a previous pass re-projected it and
// the ids drifted, so package OMT-042 is the deck's OMT-018. Joining on the id
// attached every card's blockers to a different card, which is how one build
// shipped 73 panels of somebody else's reasons.
//
// The join is on content, and it refuses anything it cannot prove: exactly one
// package entry whose song title folds to the card's, AND a product or a film
// that agrees. A card that does not join gets nothing, which is the honest
// shape — better a card with no explanation than a card wearing another card's.
//
// Two tools read the package this way (the evidence panel and the link fill),
// and they must agree about which package entry a card is. That is why this is
// a module and not two copies of the same twenty lines.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Case, accents and punctuation must not decide whether two titles are one. */
export function foldOneMoreTuneText(value) {
  return String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The package's questions, read from the directory the caller pointed at. */
export function readOneMoreTunePackageQuestions(packageDir) {
  return JSON.parse(readFileSync(join(packageDir, "data/questions.json"), "utf8")).questions;
}

function agrees(a, b) {
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

/**
 * Which package entry each deck card is, and which cards could not be proved.
 *
 * @returns {{ byCard: Map<string, object>, byQuestion: Map<string, string>, unjoined: string[] }}
 */
export function joinOneMoreTuneCards(deck, questions) {
  const byTitle = new Map();
  for (const question of questions) {
    const key = foldOneMoreTuneText(question.music?.title);
    if (!key) continue;
    byTitle.set(key, [...(byTitle.get(key) || []), question]);
  }
  const byCard = new Map();
  const byQuestion = new Map();
  const unjoined = [];
  for (const card of deck) {
    const candidates = byTitle.get(foldOneMoreTuneText(card.song)) || [];
    if (candidates.length !== 1) {
      unjoined.push(card.id);
      continue;
    }
    const question = candidates[0];
    const sameProduct = agrees(foldOneMoreTuneText(card.product), foldOneMoreTuneText(question.answer?.label));
    const sameFilm = agrees(foldOneMoreTuneText(card.film), foldOneMoreTuneText(question.appearance?.title));
    if (!sameProduct && !sameFilm) {
      unjoined.push(card.id);
      continue;
    }
    byCard.set(card.id, question);
    byQuestion.set(question.id, card.id);
  }
  return { byCard, byQuestion, unjoined };
}
