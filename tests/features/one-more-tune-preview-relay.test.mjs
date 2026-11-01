// The relay's own work, when a network cannot reach the store's CDN.
//
// One shared round is ten files for everybody who opens the link, and the
// readers who need the relay are usually a whole carrier's worth of them at
// once — a link going around a group chat is exactly that. So the relay keeps
// what it has already fetched: the second reader of the same question is
// answered from this host's memory, not from another trip to Apple through one
// small machine. This drives the route itself with a stubbed store, because
// that is the only place the difference is visible.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("one-more-tune-preview-relay");

const route = require("../../apps/server/server/routes/one-more-tune.js");
const deck = require("../../apps/server/server/one-more-tune.js");

const deckJson = JSON.parse(readFileSync(new URL("../../apps/desktop/data/one-more-tune-deck.json", import.meta.url), "utf8"));
const cards = Array.isArray(deckJson) ? deckJson : (deckJson.cards || deckJson.deck || []);
const pinned = cards
  .map((card) => String(card?.questionSound?.url || ""))
  .find((url) => url.startsWith("https://audio-ssl.itunes.apple.com/"));
test.assert(!!pinned && deck.isPinnedPreviewUrl(pinned), "the deck still pins the preview this contract uses");

const AUDIO = Buffer.alloc(64 * 1024, 7);

function previewRequest(url = pinned) {
  return {
    method: "GET",
    url: `/api/one-more-tune/preview?url=${encodeURIComponent(url)}`,
    headers: { host: "localhost" },
  };
}

function collector() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: null,
    ended: false,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    write(chunk) { chunks.push(Buffer.from(chunk)); },
    end(chunk) { if (chunk) chunks.push(Buffer.from(chunk)); this.ended = true; },
    bytes() { return Buffer.concat(chunks); },
  };
}

const realFetch = globalThis.fetch;
let storeFetches = 0;
globalThis.fetch = async () => {
  storeFetches += 1;
  return new Response(AUDIO, {
    status: 200,
    headers: { "Content-Type": "audio/x-m4p", "Content-Length": String(AUDIO.byteLength) },
  });
};

try {
  const first = collector();
  await route.handleOneMoreTunePreview(previewRequest(), first);
  test.assert(first.statusCode === 200, "the first reader is served the store's preview");
  test.assert(first.bytes().byteLength === AUDIO.byteLength, "whole, byte for byte");
  test.assert(storeFetches === 1, "and the store was asked once");

  const second = collector();
  await route.handleOneMoreTunePreview(previewRequest(), second);
  test.assert(second.statusCode === 200, "the second reader is served it too");
  test.assert(second.bytes().equals(AUDIO), "with the same bytes");
  test.assert(storeFetches === 1, "without asking the store again — the round's files are this host's now");
  test.assert(second.headers?.["Cache-Control"] === "public, max-age=86400",
    "and the browser is told it may keep its own copy");

  // The allowlist is unchanged by the cache: the cache is keyed by the deck's
  // own URLs, and nothing else may be asked for.
  const refused = collector();
  await route.handleOneMoreTunePreview(
    previewRequest("https://audio-ssl.itunes.apple.com/itunes-assets/not-in-this-deck.m4a"),
    refused,
  );
  test.assert(refused.statusCode === 404, "a URL the deck does not pin is still refused");
  test.assert(storeFetches === 1, "and refused before anything is fetched");
} finally {
  globalThis.fetch = realFetch;
}

test.finish();
