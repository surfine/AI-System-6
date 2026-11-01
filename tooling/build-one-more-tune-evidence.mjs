#!/usr/bin/env node
// Why a card is not a question yet, and who says what it says.
//
// The deck ships the facts a card shows. The research package behind it carries
// the other half — the reason each card is still blocked, and the source behind
// each claim — and that half never travelled, so the window could say "0 cards
// can be asked with sound" without ever saying why. This writes the missing half
// into `apps/desktop/data/one-more-tune-evidence.json`, which the catalogue
// loads on demand.
//
// The package is the write source and lives outside this repository: it is the
// private editorial bank and it carries every answer. Point this at an unpacked
// copy and re-run it. Nothing here invents a reason or a source.
//
//   node tooling/build-one-more-tune-evidence.mjs --package <dir>
//   ONE_MORE_TUNE_PACKAGE=<dir> node tooling/build-one-more-tune-evidence.mjs
//
// What is not copied: prose. A reason code and a URL are facts about where to
// look; the sentences below are written here, for this window, in both
// languages. A source whose text would have to travel does not travel.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { joinOneMoreTuneCards } from "./lib/one-more-tune-join.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argIndex = process.argv.indexOf("--package");
const packageDir = argIndex > 0 ? process.argv[argIndex + 1] : process.env.ONE_MORE_TUNE_PACKAGE;

// Each blocked step, said so a player learns something from it. The codes are
// the package's; the sentences are this window's.
const REASONS = {
  music_recording_and_listening_window_not_auditioned: {
    en: "Nobody has listened to a recording against this film, so the passage has no in-point and no out-point.",
    zh: "还没有人把录音和这支影片对着听过，所以乐段没有起点也没有终点。",
  },
  playback_and_usage_conditions_not_checked: {
    en: "How this recording may be played, and on what terms, has not been checked.",
    zh: "这段录音能怎么播、按什么条件播，还没查过。",
  },
  distractors_need_reuse_review: {
    en: "The three wrong answers have not been checked for a product that used this same song.",
    zh: "三个错误选项还没核过：其中会不会有产品也用过这首歌。",
  },
  distractors_not_reviewed: {
    en: "This card has no reviewed set of wrong answers yet.",
    zh: "这张卡还没有经过复核的错误选项。",
  },
  audio_asset_not_resolved: {
    en: "No specific recording has been settled on — only a title and an artist.",
    zh: "还没定下具体是哪个录音，只有曲名和艺人。",
  },
  cue_not_auditioned: {
    en: "The passage has not been auditioned, so where it starts and ends is unknown.",
    zh: "乐段没有实听过，起止位置未知。",
  },
  usage_permission_not_established: {
    en: "Permission to use this particular recording as a question's audio has not been established.",
    zh: "把这一个录音用作题目音源的许可还没有确立。",
  },
  original_video_id_unresolved: {
    en: "The original film has not been pinned to a specific video.",
    zh: "原片还没有定位到具体的一支视频。",
  },
  track_identity_pending: {
    en: "Two sources disagree about which recording this is.",
    zh: "两个来源对这是哪个录音意见不一致。",
  },
};

// What a piece of evidence is actually good for. This is the distinction the
// package insists on: a written credit names a film, and naming a film is not
// the same as proving which recording was played.
const SUPPORTS = {
  music_to_campaign_mapping: {
    en: "records that this music belongs to this campaign",
    zh: "记录了这段音乐属于这支广告",
  },
  "written music-to-film credit; not audio identity": {
    en: "a written credit naming the film — not proof of which recording",
    zh: "一条写下的署名，指明了影片——但不证明是哪个录音",
  },
  mapping_or_media_link: {
    en: "the pairing, or a link to the film itself",
    zh: "这组对应关系，或一条原片链接",
  },
  catalog_music_listing_only: {
    en: "a catalogue listing only — it does not name the film",
    zh: "只是目录里的一条收录，没有指明影片",
  },
  user_mapping_and_anchor: {
    en: "supplied by the person who set the question, with a place to start looking",
    zh: "出题者提供的对应关系，外加一个查找位置",
  },
};

function fallbackSupport(text) {
  const value = String(text || "").trim();
  return { en: value, zh: value };
}

function main() {
  if (!packageDir) {
    console.error("NO  --package <dir> (or ONE_MORE_TUNE_PACKAGE) must point at an unpacked Foundation package.");
    console.error("    The package is the write source and is not carried in this repository.");
    process.exit(1);
  }
  const questions = JSON.parse(readFileSync(join(packageDir, "data/questions.json"), "utf8")).questions;
  const sourceTable = JSON.parse(readFileSync(join(packageDir, "data/sources.json"), "utf8"));

  // The join is the shared one (tooling/lib/one-more-tune-join.mjs): content
  // only, and a card it cannot prove gets no entry and therefore no panel.
  const deck = JSON.parse(readFileSync(join(root, "apps/desktop/data/one-more-tune-deck.json"), "utf8")).cards;
  const { byQuestion: joined, unjoined } = joinOneMoreTuneCards(deck, questions);

  const usedSources = new Set();
  const cards = {};
  let unmapped = 0;
  for (const question of questions) {
    const cardId = joined.get(question.id);
    if (!cardId) continue;
    const blocked = (question.gate_reasons || []).filter((code) => {
      if (REASONS[code]) return true;
      unmapped += 1;
      console.error(`NO  no sentence for gate reason "${code}" (${question.id})`);
      return false;
    });
    const evidence = (question.evidence || [])
      .filter((entry) => entry && entry.source_id)
      .map((entry) => {
        usedSources.add(entry.source_id);
        return { source: entry.source_id, supports: SUPPORTS[entry.supports] || fallbackSupport(entry.supports) };
      });
    if (!blocked.length && !evidence.length) continue;
    cards[cardId] = { blocked, evidence, from: question.id };
  }

  // Only the sources this deck cites, and only their address: a source row is a
  // label and a URL, which are facts about where to look.
  const sources = {};
  for (const id of [...usedSources].sort()) {
    const entry = sourceTable[id];
    if (!entry) {
      console.error(`NO  evidence cites source "${id}", which sources.json does not define`);
      unmapped += 1;
      continue;
    }
    sources[id] = { url: typeof entry === "string" ? entry : String(entry.url || "") };
  }

  if (unmapped) {
    console.error(`NO  ${unmapped} unmapped item(s); nothing written.`);
    process.exit(1);
  }

  console.log(`OK  joined ${joined.size} of ${deck.length} deck cards by content; ${unjoined.length} carry no panel`);
  const out = {
    version: 2,
    joined: joined.size,
    unjoined: unjoined.length,
    note: "Why each card is not a question yet, and the source behind each claim. Generated from the private research package by tooling/build-one-more-tune-evidence.mjs.",
    reasons: REASONS,
    sources,
    cards,
  };
  writeFileSync(join(root, "apps/desktop/data/one-more-tune-evidence.json"), `${JSON.stringify(out, null, 1)}\n`, "utf8");
  console.log(`OK  ${Object.keys(cards).length} card(s), ${Object.keys(sources).length} source(s) -> apps/desktop/data/one-more-tune-evidence.json`);
}

main();
