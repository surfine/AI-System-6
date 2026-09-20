#!/usr/bin/env node
// Pin each settled card's question sound into the deck, backstage.
//
// A round only asks what it can play. Which card has a store preview is
// research done here — once, ahead of time — and not something a player waits
// on or watches fail. The server's own resolver does the matching: a store row
// whose title folds to the card's and whose artist agrees.
//
// Only store previews are pinned. A song's own YouTube video was tried and
// dropped (2026-09-19): label videos pass YouTube's oEmbed check and then say
// "This video is unavailable" inside an embed on this site, so no check here
// can prove one plays. The preview is fetched and played by the page itself.
//
// A card that resolves to neither keeps `questionSound: null` and stays out of
// every round. A pinned card keeps its pin while it still plays; a pin that has
// stopped playing is resolved again. --refresh resolves every card afresh.
//
//   node tooling/pin-one-more-tune-sound.mjs [--write] [--refresh]

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deckPath = join(root, "apps/desktop/data/one-more-tune-deck.json");
const require = createRequire(import.meta.url);
const server = require(join(root, "apps/server/server/one-more-tune.js"));

const write = process.argv.includes("--write");
const refresh = process.argv.includes("--refresh");
const deck = JSON.parse(readFileSync(deckPath, "utf8"));

// A pin is only a pin once it has been fetched from here: the store must hand
// back audio for the preview.
async function previewPlays(url) {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-1023" } });
    return (response.status === 200 || response.status === 206) && /audio|mp4|octet/.test(response.headers.get("content-type") || "");
  } catch {
    return false;
  }
}

async function soundPlays(sound) {
  if (sound?.provider === "preview") return previewPlays(sound.url);
  return false;
}

const counts = { preview: 0, none: 0, kept: 0, unsettled: 0, dropped: 0 };
for (const card of deck.cards) {
  if (!card.product || !card.film) {
    card.questionSound = null;
    counts.unsettled += 1;
    continue;
  }
  if (card.questionSound && !refresh) {
    if (await soundPlays(card.questionSound)) {
      counts.kept += 1;
      continue;
    }
    counts.dropped += 1;
    console.log(`pin no longer plays: ${card.id} ${card.questionSound.provider}`);
  }
  const preview = await server.resolvePreview(card);
  if (preview && await previewPlays(preview.url)) {
    card.questionSound = { provider: "preview", url: preview.url };
    counts.preview += 1;
    continue;
  }
  card.questionSound = null;
  counts.none += 1;
  console.log(`no sound: ${card.id} ${card.song} — ${card.artist}`);
}

console.log(JSON.stringify(counts));
if (write) {
  writeFileSync(deckPath, `${JSON.stringify(deck, null, 2)}\n`);
  console.log(`wrote ${deckPath}`);
} else {
  console.log("dry run; pass --write to save");
}
