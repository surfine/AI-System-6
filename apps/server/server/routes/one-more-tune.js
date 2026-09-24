// /api/one-more-tune/*
//
// The round authority for the One More Tune window. A question page is given
// tokens and a playback descriptor; the answer key never leaves this process
// until a submission comes back, which is what the package asks for in writing.
//
//   POST /api/one-more-tune/round        open a round
//   POST /api/one-more-tune/answer       submit one answer, or skip
//   GET  /api/one-more-tune/report       the blind-source gate, card by card
//   GET  /api/one-more-tune/credits/:id  the credits path every question carries
//   GET  /api/one-more-tune/media/:id    a reviewed asset, when one exists

"use strict";

const { readJsonBody, sendJson } = require("../lib/http.js");
const deck = require("../one-more-tune.js");

// Which authority answers is the request's own domain, and the list is closed:
// the music deck (the round this endpoint was built for, asked for by sending
// no domain at all), the presenter relay, the keynote line, and the era-
// research edition. A domain this host does not have is refused. It used to
// fall through to the music deck -- a request for a game that does not exist
// here was answered with ten songs, which is not a refusal, it is a different
// game, and the player had no way to tell the two apart.
const ROUND_AUTHORITIES = Object.freeze({
  "": "music",
  music: "music",
  keynote_person: "keynote_person",
  keynote_context: "keynote_context",
  interface_history: "interface_history",
});

function roundAuthority(domain) {
  const key = domain === undefined || domain === null ? "" : String(domain).trim();
  return Object.hasOwn(ROUND_AUTHORITIES, key) ? ROUND_AUTHORITIES[key] : null;
}

function refuseUnknownDomain(res) {
  sendJson(res, 400, {
    code: "unknown_domain",
    error: "This host plays the music deck, the presenter relay, the keynote line and the era-research edition. "
      + "Send one of those domains, or none at all for the deck.",
    domains: ["music", "keynote_person", "keynote_context", "interface_history"],
  });
}

function pathnameOf(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return req.url || "/";
  }
}

async function handleOneMoreTuneRound(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { code: "method_not_allowed", error: "POST only." });
    return;
  }
  let body = {};
  try {
    body = (await readJsonBody(req, { limitBytes: 4 * 1024 })) || {};
  } catch {
    body = {};
  }
  // One authority each, read from the closed list: the music deck, the
  // presenter relay, the keynote line, and the era-research edition (whose
  // questions are written but not yet reviewed, so it answers with that fact
  // instead of with questions). The domain is checked before any of them runs,
  // so an unknown one is a refusal rather than a silently different game.
  const authority = roundAuthority(body?.domain);
  if (!authority) {
    refuseUnknownDomain(res);
    return;
  }
  let round;
  try {
    round = authority === "keynote_person"
      ? require("../one-more-tune-keynote.js").startRound()
      : authority === "keynote_context"
        ? require("../one-more-line.js").startRound()
        : authority === "interface_history"
          ? require("../one-more-tune-interface-history.js").startRound()
          : await deck.startRound({
            challengeId: String(body?.challengeId || ""),
            questionIndex: Number.isInteger(body?.questionIndex) ? body.questionIndex : -1,
          });
  } catch (error) {
    // A text edition that cannot compose an honest round (its bank cannot meet
    // its own quotas any more) refuses with a code. That is an unavailable
    // round, not a crash, and the caller gets neither the bank's contents nor a
    // stack: the selector's code is the whole answer.
    if (error?.name === "SelectionError") {
      sendJson(res, 503, {
        code: error.code,
        domain: authority,
        error: "This edition cannot open a set right now.",
      });
      return;
    }
    throw error;
  }
  // An edition whose questions are drafted but not reviewed says exactly that:
  // how many exist, how many may be served (none), and that it is review and
  // not absence that stands in the way.
  if (round.mode === "unavailable" && round.code === "questions_not_reviewed") {
    sendJson(res, 503, {
      code: round.code,
      domain: round.domain || "interface_history",
      error: "This edition's questions are written but have not been through review, so it does not open yet.",
      drafted: round.drafted ?? 0,
      available: round.available ?? 0,
    });
    return;
  }
  // A set that has gone stale says so; it never quietly becomes a new round.
  if (round.mode === "unavailable" && round.code === "no_sound") {
    // Nothing answered for any of the ten: no store preview, no song video.
    // A guessing game played by ear is not handed out without its sound.
    sendJson(res, 503, { code: round.code, error: "No question can play right now." });
    return;
  }
  if (round.mode === "unavailable") {
    sendJson(res, 404, {
      code: round.code,
      error: round.code === "set_stale"
        ? "This challenge predates a change to the deck, so it is not the same set any more."
        : "That challenge is no longer open.",
      cardId: round.cardId || "",
    });
    return;
  }
  sendJson(res, 200, round);
}

async function handleOneMoreTuneAnswer(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { code: "method_not_allowed", error: "POST only." });
    return;
  }
  let body = null;
  try {
    body = await readJsonBody(req, { limitBytes: 4 * 1024 });
  } catch {
    sendJson(res, 400, { code: "one_more_tune_bad_request", error: "A JSON body is required." });
    return;
  }
  const domain = roundAuthority(body?.domain);
  if (!domain) {
    refuseUnknownDomain(res);
    return;
  }
  const authority = domain === "keynote_person" ? require("../one-more-tune-keynote.js")
    : domain === "keynote_context" ? require("../one-more-line.js")
      : domain === "interface_history" ? require("../one-more-tune-interface-history.js")
        : deck;
  const result = authority.submitAnswer(body || {});
  sendJson(res, result.ok ? 200 : result.code === "invalid_choice" ? 400 : 404, result);
}

async function handleOneMoreTuneReport(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { code: "method_not_allowed", error: "GET only." });
    return;
  }
  sendJson(res, 200, { ...deck.report(), bank: deck.validateBank() });
}

/**
 * Credits stay reachable while the music plays — the package treats hiding a
 * required credit as a failure, not as anti-spoiler hygiene. Today the round
 * carries no licensed recording, so the honest answer is "nothing to credit",
 * said out loud rather than with an empty page.
 */
async function handleOneMoreTuneCredits(req, res) {
  const pathname = pathnameOf(req);
  const id = pathname.slice("/api/one-more-tune/credits/".length);
  if (!/^[A-Za-z0-9_-]{16,}$/.test(id)) {
    sendJson(res, 404, { code: "credits_not_found", error: "No such credits path." });
    return;
  }
  sendJson(res, 200, {
    credits: [],
    note: "This round carries no licensed recording, so there is nothing to credit yet.",
  });
}

/**
 * A reviewed, same-origin asset. There is not one in the deck, so the route
 * answers 404 with the reason instead of streaming something else — the
 * package's rule is that a question without a cleared asset is not a question.
 */
async function handleOneMoreTuneMedia(req, res) {
  const pathname = pathnameOf(req);
  const id = pathname.slice("/api/one-more-tune/media/".length);
  if (!/^[A-Za-z0-9_-]{16,}$/.test(id)) {
    sendJson(res, 404, { code: "media_not_found", error: "No such media path." });
    return;
  }
  sendJson(res, 404, {
    code: "media_not_licensed",
    error: "No recording in this deck has a reviewed licence, so no asset is served.",
  });
}

// The same store preview the round hands out, fetched by this host rather than
// by the reader's network.
//
// Every question plays a promotional preview, and a phone on a network that
// cannot reach Apple's CDN — or reaches it too slowly to start a ten-question
// round — hears nothing at all, which for a game played by ear is the whole
// game. This host can reach it (measured: 403 on the bare host, 200 on assets),
// so it fetches the pinned URL and streams the bytes back. Same content, same
// promotional use, one hop.
//
// It takes a card id and looks the URL up itself: the endpoint never accepts a
// URL from the caller, so it cannot be pointed at anything but the deck's own
// pinned previews.
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 12000;
// How many bytes of pinned previews this host keeps, and the largest single
// preview it will keep. A deck preview is about a megabyte, so the ceiling is
// a couple of dozen of them: the questions a round asks, and the ones the next
// person through asks again.
const PREVIEW_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const PREVIEW_CACHE_ENTRY_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The previews this host has already fetched, newest last.
 *
 * A shared round is the same ten files for everybody who opens the link, and
 * the relay exists for the networks that cannot reach the store's CDN — often
 * a whole carrier, many readers at once. Without this, each of those readers
 * waits on a fresh trip to Apple through one small host, which is the shape
 * that turns a link going around a group chat into silence. The deck pins at
 * most a few dozen URLs, so this is bounded by construction and is emptied
 * oldest-first when it reaches the ceiling.
 */
const previewCache = new Map();
let previewCacheBytes = 0;

function readCachedPreview(url) {
  const kept = previewCache.get(url);
  if (!kept) return null;
  // Re-inserted so the least recently wanted one is the first to go.
  previewCache.delete(url);
  previewCache.set(url, kept);
  return kept;
}

function keepCachedPreview(url, buffer) {
  if (!buffer || buffer.byteLength === 0 || buffer.byteLength > PREVIEW_CACHE_ENTRY_MAX_BYTES) return;
  const previous = previewCache.get(url);
  if (previous) {
    previewCacheBytes -= previous.byteLength;
    previewCache.delete(url);
  }
  previewCache.set(url, buffer);
  previewCacheBytes += buffer.byteLength;
  while (previewCacheBytes > PREVIEW_CACHE_MAX_BYTES && previewCache.size) {
    const oldest = previewCache.keys().next().value;
    previewCacheBytes -= previewCache.get(oldest).byteLength;
    previewCache.delete(oldest);
  }
}

function sendPreviewBytes(res, contentType, buffer, method) {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": String(buffer.byteLength),
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(buffer);
}

async function handleOneMoreTunePreview(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { code: "method_not_allowed", error: "GET only." });
    return;
  }
  const url = String(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams.get("url") || "");
  if (!/^https:\/\/audio-ssl\.itunes\.apple\.com\//.test(url) || !deck.isPinnedPreviewUrl(url)) {
    sendJson(res, 404, { code: "preview_not_found", error: "That is not one of this deck's pinned previews." });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const kept = readCachedPreview(url);
    if (kept) {
      sendPreviewBytes(res, kept.contentType, kept.bytes, req.method);
      return;
    }
    const upstream = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "audio/*,*/*;q=0.8" },
    });
    if (!upstream.ok || !upstream.body) {
      sendJson(res, 502, { code: "preview_unreachable", error: "The store preview did not answer." });
      return;
    }
    const length = Number(upstream.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > PREVIEW_MAX_BYTES) {
      sendJson(res, 502, { code: "preview_too_large", error: "That preview is larger than this relay serves." });
      return;
    }
    const contentType = upstream.headers.get("content-type") || "audio/mp4";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    // A stream, not a buffer: a ten-question round asks for ten of these, and
    // holding each one whole in the host's memory to re-serve it is work the
    // host does not need to do.
    const reader = upstream.body.getReader();
    let sent = 0;
    const held = [];
    let heldBytes = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- the stream is sequential.
      const { done, value } = await reader.read();
      if (done) break;
      sent += value.byteLength;
      if (sent > PREVIEW_MAX_BYTES) break;
      const chunk = Buffer.from(value);
      if (heldBytes + chunk.byteLength <= PREVIEW_CACHE_ENTRY_MAX_BYTES) {
        held.push(chunk);
        heldBytes += chunk.byteLength;
      }
      res.write(chunk);
    }
    res.end();
    // The next reader of these same bytes — the same question in the same
    // shared round — is answered from here instead of from Apple.
    if (heldBytes > 0) keepCachedPreview(url, { bytes: Buffer.concat(held, heldBytes), contentType });
  } catch {
    if (!res.headersSent) {
      sendJson(res, 504, { code: "preview_timeout", error: "The store preview took too long." });
    } else {
      res.end();
    }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  handleOneMoreTuneRound,
  handleOneMoreTuneAnswer,
  handleOneMoreTuneReport,
  handleOneMoreTuneCredits,
  handleOneMoreTuneMedia,
  handleOneMoreTunePreview,
};
