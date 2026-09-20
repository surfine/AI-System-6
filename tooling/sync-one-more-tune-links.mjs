#!/usr/bin/env node
// Take the research package's film links into the deck, filling gaps only.
//
// The package's link update recorded, for a number of questions, the film the
// music was used in — a YouTube id, and sometimes where in that film a source
// says to start looking. Those two facts never travelled into the deck, so the
// shelf was telling people "no playable original is linked for this card yet"
// about cards whose original the research side had already found and written
// down.
//
// What this writes, and what it refuses to:
//
//   * Only pairs the shared content join can prove (tooling/lib/one-more-tune-join.mjs).
//   * Only gaps. A card the deck already links is left exactly as it is, and a
//     card whose id disagrees with the package's is a conflict for a person to
//     read, not something to overwrite.
//   * `anchorVideoId` is only ever set to the video the anchor was read on, so
//     a position can never travel onto a different upload.
//   * `uploader_verification: "not_checked"` and `playback_check: "not_tested"`
//     are the package's own words for these links; the window already prints
//     "a source anchor, not a verified music in-point" beside them, and the
//     ledger's "original plays" check stays untested until a person plays one.
//
//   node tooling/sync-one-more-tune-links.mjs --package <dir>          # dry run
//   node tooling/sync-one-more-tune-links.mjs --package <dir> --write
//
// Without --write nothing is touched; the run prints the table it would apply.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { joinOneMoreTuneCards, readOneMoreTunePackageQuestions } from "./lib/one-more-tune-join.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argIndex = process.argv.indexOf("--package");
const packageDir = argIndex > 0 ? process.argv[argIndex + 1] : process.env.ONE_MORE_TUNE_PACKAGE;
const write = process.argv.includes("--write");
const deckPath = join(root, "apps/desktop/data/one-more-tune-deck.json");

if (!packageDir) {
  console.error("NO  --package <dir> (or ONE_MORE_TUNE_PACKAGE) must point at an unpacked Foundation package.");
  console.error("    The package is the write source for these links and is not carried in this repository.");
  process.exit(1);
}

const deck = JSON.parse(readFileSync(deckPath, "utf8"));
const questions = readOneMoreTunePackageQuestions(packageDir);
const { byCard, unjoined } = joinOneMoreTuneCards(deck.cards, questions);

const isVideoId = (value) => /^[\w-]{11}$/.test(String(value || ""));
const isAnchor = (value) => Number.isInteger(value) && value >= 0;

const filled = [];
const conflicts = [];
for (const card of deck.cards) {
  const question = byCard.get(card.id);
  if (!question) continue;
  const film = question.appearance || {};
  const packageVideo = isVideoId(film.video_id) ? film.video_id : "";
  const packageAnchor = isAnchor(film.source_anchor_seconds) ? film.source_anchor_seconds : null;
  const cardVideo = isVideoId(card.videoId) ? card.videoId : "";
  const cardAnchor = isAnchor(card.sourceAnchor) ? card.sourceAnchor : null;
  const before = { videoId: cardVideo, sourceAnchor: cardAnchor, anchorVideoId: card.anchorVideoId || "" };
  if (cardVideo && packageVideo && cardVideo !== packageVideo) {
    conflicts.push({ cardId: card.id, questionId: question.id, field: "videoId", deck: cardVideo, package: packageVideo });
    continue;
  }
  if (cardAnchor !== null && packageAnchor !== null && cardAnchor !== packageAnchor) {
    conflicts.push({ cardId: card.id, questionId: question.id, field: "sourceAnchor", deck: cardAnchor, package: packageAnchor });
    continue;
  }
  const nextVideo = cardVideo || packageVideo;
  const nextAnchor = cardAnchor !== null ? cardAnchor : packageAnchor;
  // An anchor belongs to the upload it was read on. Filling a missing video id
  // is therefore also what lets an anchor that was already in the deck show.
  const nextAnchorVideo = nextAnchor === null ? "" : (card.anchorVideoId || nextVideo);
  if (nextVideo === before.videoId && nextAnchor === before.sourceAnchor && nextAnchorVideo === before.anchorVideoId) continue;
  filled.push({
    cardId: card.id,
    questionId: question.id,
    song: card.song,
    film: card.film,
    videoId: nextVideo === before.videoId ? "" : nextVideo,
    sourceAnchor: nextAnchor === before.sourceAnchor ? null : nextAnchor,
    anchorVideoId: nextAnchorVideo === before.anchorVideoId ? "" : nextAnchorVideo,
    package: { videoId: packageVideo, anchor: packageAnchor, playback: film.playback_check, uploader: film.uploader_verification },
  });
  if (write) {
    if (nextVideo !== before.videoId) card.videoId = nextVideo;
    if (nextAnchor !== before.sourceAnchor) card.sourceAnchor = nextAnchor;
    if (nextAnchorVideo !== before.anchorVideoId) card.anchorVideoId = nextAnchorVideo;
  }
}

for (const row of filled) {
  const bits = [
    row.videoId ? `video ${row.videoId}` : "",
    row.sourceAnchor !== null ? `anchor ${row.sourceAnchor}` : "",
    row.anchorVideoId ? `anchor on ${row.anchorVideoId}` : "",
  ].filter(Boolean).join(", ");
  console.log(`${write ? "OK  " : "--  "}${row.cardId} <- ${row.questionId}  ${row.song} · ${row.film}: ${bits}`);
}

for (const row of conflicts) {
  console.error(`NO  ${row.cardId} <- ${row.questionId}: the deck says ${row.field}=${row.deck}, the package says ${row.package}. Left alone.`);
}

if (write && filled.length) {
  // The deck file's own shape: two spaces, and no rewrite of anything but the
  // fields above — a data edit a person can read in `git diff`.
  writeFileSync(deckPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
}

console.log(
  `${write ? "OK  wrote" : "--  would write"} ${filled.length} card(s); `
  + `${unjoined.length} card(s) have no provable package entry; ${conflicts.length} conflict(s).`,
);
process.exit(conflicts.length ? 1 : 0);
