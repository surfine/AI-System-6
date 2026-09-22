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
// failed its transport check is resolved again; a failed lookup preserves the old pin. --refresh resolves every card afresh.
//
//   node tooling/pin-one-more-tune-sound.mjs [--write] [--refresh]

import { readFileSync, writeFileSync, renameSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deckPath = join(root, "apps/desktop/data/one-more-tune-deck.json");
const require = createRequire(import.meta.url);
const server = require(join(root, "apps/server/server/one-more-tune.js"));

const write = process.argv.includes("--write");
const refresh = process.argv.includes("--refresh");
const original = readFileSync(deckPath, "utf8");
const deck = JSON.parse(original);
if (!Number.isInteger(deck.version) || new Set(deck.cards.map((card) => card.id)).size !== deck.cards.length) throw new Error("Invalid deck; nothing written");
const originalPins = JSON.stringify(deck.cards.map((card) => card.questionSound));

// A pin is only a pin once it has been fetched from here: the store must hand
// back audio for the preview.
async function probePreviewTransport(url) {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(10000) });
    const ok = (response.status === 200 || response.status === 206) && /audio|mp4|octet/.test(response.headers.get("content-type") || "");
    await response.body?.cancel();
    return ok;
  } catch {
    return false;
  }
}

async function probeSoundTransport(sound) {
  if (sound?.provider === "preview") return probePreviewTransport(sound.url);
  return false;
}

const counts = { preview: 0, none: 0, kept: 0, unsettled: 0, retainedAfterFailure: 0 };
for (const card of deck.cards) {
  const previous = card.questionSound;
  if (!card.product || !card.film) {
    counts.unsettled += 1;
    continue;
  }
  if (card.questionSound && !refresh) {
    if (await probeSoundTransport(card.questionSound)) {
      counts.kept += 1;
      continue;
    }
    console.log(`transport probe failed: ${card.id} ${card.questionSound.provider}`);
  }
  const preview = await server.resolvePreview(card);
  if (preview && await probePreviewTransport(preview.url)) {
    card.questionSound = { provider: "preview", url: preview.url };
    counts.preview += 1;
    continue;
  }
  // A transport/lookup failure does not prove the last successful pin is dead.
  if (previous?.provider === "preview") {
    card.questionSound = previous;
    card.soundHealth = { transport: "unconfirmed", checkedAt: new Date().toISOString(), audioAuditioned: false };
    counts.retainedAfterFailure += 1;
    continue;
  }
  card.questionSound = null;
  counts.none += 1;
  console.log(`no sound: ${card.id} ${card.song} — ${card.artist}`);
}

console.log(JSON.stringify(counts));
if (write) {
  if (originalPins !== JSON.stringify(deck.cards.map((card) => card.questionSound))) deck.version += 1;
  copyFileSync(deckPath, `${deckPath}.before`);
  writeFileSync(`${deckPath}.staged`, `${JSON.stringify(deck, null, 2)}\n`);
  renameSync(`${deckPath}.staged`, deckPath);
  console.log(`wrote ${deckPath}`);
} else {
  console.log("dry run; pass --write to save");
}
