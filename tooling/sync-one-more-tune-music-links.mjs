#!/usr/bin/env node
// Take the research side's music entries and backup film pages into the deck.
//
// Round v0.6 of the research recorded, per question, where the *song* can be
// heard — a Spotify track page, a YouTube upload, a composer's library — and a
// few candidate pages for the film itself. Round v0.7 added three more, one of
// them the artist's own music video for The Difference, and backup pages
// published by the production company and the director. None of it travelled
// into the deck, so the window could show a card's song and artist and give a
// person nowhere to go and listen to it.
//
// What this writes, and what it refuses to:
//
//   * Only pairs the shared content join can prove (tooling/lib/one-more-tune-join.mjs).
//   * Only gaps. A card that already names a music entry or an alternate film
//     page keeps it, byte for byte.
//   * A music entry is a place to listen, not a claim: the research side marks
//     every one of these `playback_tested: false`, and the deck carries that
//     status so the window can say so instead of implying the link plays.
//   * Spotify is recorded as a reference and never as this project's player:
//     v0.7 retracted it for game use under the platform's developer policy. The
//     tool keeps the row (the link is where the recording can be heard) and puts
//     `reference_only` on it, so no surface can mistake it for a playback path.
//
//   node tooling/sync-one-more-tune-music-links.mjs --package <v06 dir> [--playtest <v07 dir>] [--write]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { joinOneMoreTuneCards, readOneMoreTunePackageQuestions } from "./lib/one-more-tune-join.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : "";
};
const packageDir = valueAfter("--package") || process.env.ONE_MORE_TUNE_PACKAGE || "";
const playtestDir = valueAfter("--playtest") || process.env.ONE_MORE_TUNE_PLAYTEST || "";
const write = process.argv.includes("--write");
const deckPath = join(root, "apps/desktop/data/one-more-tune-deck.json");

if (!packageDir) {
  console.error("NO  --package <dir> (or ONE_MORE_TUNE_PACKAGE) must point at the v0.6 link-update package.");
  process.exit(1);
}

// Which candidates belong to the song, and which to the film. The roles are the
// package's own words; nothing here guesses from the URL.
const MUSIC_ROLES = new Set([
  "music_recording_candidate",
  "music_video_candidate",
  "alternate_recording_candidate",
  "commercial_recording_candidate_not_ad_mix",
  "licensable_catalog_candidate",
]);
const FILM_ROLES = new Set([
  "ad_video_candidate",
  "campaign_video_candidate",
  "ad_clip_candidate",
  "advertisement_archive_candidate",
]);

const deck = JSON.parse(readFileSync(deckPath, "utf8"));
const questions = readOneMoreTunePackageQuestions(packageDir);
const { byCard, unjoined } = joinOneMoreTuneCards(deck.cards, questions);
const bankById = new Map(questions.map((question) => [question.id, question]));

// The playtest round is additive: it appends to the bank rather than replacing
// it, so it is read as a patch keyed by the package's own question ids.
const patchById = new Map();
if (playtestDir) {
  const patch = JSON.parse(readFileSync(join(playtestDir, "private/data_patch_v07.json"), "utf8"));
  for (const change of patch.changes || []) patchById.set(change.question_id, change);
}

const providerOf = (url) => {
  const host = (() => {
    try { return new URL(url).host.replace(/^www\./, ""); } catch { return ""; }
  })();
  if (!host) return "";
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "youtube";
  if (host === "open.spotify.com") return "spotify";
  if (host === "vimeo.com") return "vimeo";
  if (host === "music.apple.com") return "apple_music";
  if (host.endsWith("bandcamp.com")) return "bandcamp";
  return host;
};

const filled = [];
const conflicts = [];
for (const card of deck.cards) {
  const question = byCard.get(card.id);
  if (!question) continue;
  const change = patchById.get(question.id) || null;

  if (!card.musicEntry) {
    const candidates = (question.media_source_candidates || []).filter((entry) => entry && MUSIC_ROLES.has(entry.role) && entry.url);
    // The playtest's own music candidate is the newest and the one the research
    // side chose to stand behind for those three cards.
    const patched = change?.append_music_candidate;
    const picked = patched?.url
      ? { provider: patched.provider, url: patched.url, label: patched.identity_basis || "", tested: patched.playback_verified === true }
      : candidates.find((entry) => entry.provider === "youtube") || candidates[0];
    if (picked) {
      const provider = picked.provider || providerOf(picked.url);
      card.musicEntry = {
        provider,
        url: picked.url,
        // A link to a song is where the recording can be heard. Spotify's is
        // kept as a reference and marked so, because the game may not play it.
        use: provider === "spotify" ? "reference_only" : "reference",
        playbackTested: picked.tested === true,
        label: picked.label || "",
      };
      filled.push({ cardId: card.id, questionId: question.id, song: card.song, kind: "music", provider, url: picked.url });
    }
  } else {
    filled.push({ cardId: card.id, questionId: question.id, song: card.song, kind: "music-kept", provider: card.musicEntry.provider, url: card.musicEntry.url });
  }

  const alternates = [];
  for (const entry of question.media_source_candidates || []) {
    if (!entry || !entry.url || !FILM_ROLES.has(entry.role)) continue;
    alternates.push({ url: entry.url, provider: entry.provider || providerOf(entry.url), label: entry.label || "", role: entry.role, playbackTested: entry.playback_tested === true });
  }
  for (const page of change?.append_ad_fallback_pages || []) {
    if (!page?.url) continue;
    alternates.push({
      url: page.url,
      provider: providerOf(page.url),
      label: page.label || "",
      role: page.identity_status || "fallback_page",
      playbackTested: page.playback_verified === true,
    });
  }
  const known = new Set((card.filmAlternates || []).map((entry) => entry.url));
  const additions = alternates.filter((entry) => !known.has(entry.url));
  if (additions.length) {
    card.filmAlternates = [...(card.filmAlternates || []), ...additions];
    for (const entry of additions) {
      filled.push({ cardId: card.id, questionId: question.id, song: card.song, kind: "film", provider: entry.provider, url: entry.url });
    }
  }
}

for (const row of filled) {
  const prefix = row.kind === "music-kept" ? "==  " : write ? "OK  " : "--  ";
  console.log(`${prefix}${row.cardId} <- ${row.questionId}  ${row.song} [${row.kind}] ${row.provider} ${row.url}`);
}
for (const row of conflicts) {
  console.error(`NO  ${row.cardId}: ${row.detail}`);
}

if (write && filled.some((row) => row.kind !== "music-kept")) {
  writeFileSync(deckPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
}

const added = filled.filter((row) => row.kind !== "music-kept").length;
console.log(`${write ? "OK  wrote" : "--  would write"} ${added} link(s); ${unjoined.length} card(s) have no provable package entry.`);
