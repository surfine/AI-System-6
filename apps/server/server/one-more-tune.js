// One More Tune — the round authority.
//
// The answer key lives here and nowhere else in transit. A question page
// receives an opaque round token, the prompt, four opaque choice tokens with
// their words, and a playback descriptor; the song, the artist, the film, the
// product and the evidence stay in this process until a submission arrives.
// That is the rule the package writes down — "不能给前端 answer、歌曲标题、证据描述、
// 广告视频链接" — and the reason `prepare_question` returns two objects rather
// than one.
//
// The deck is read from the same JSON the browser reads for its study faces,
// so there is one copy of the data and one place a pairing can be corrected.

"use strict";

const crypto = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const DECK_PATH = path.join(__dirname, "..", "..", "desktop", "data", "one-more-tune-deck.json");

// The package's access policy, applied to any question this process will hand
// out: a provider that is a reviewed same-origin file, a verified recording,
// an auditioned cue, a live rights review naming every granted use, reachable
// credits, an approved delivery scope, non-spoiling packaging, and a spoiler
// review. Nothing in the deck meets it, which is the state the package itself
// reports — its real bank's ready count is 0.
const RIGHTS_GRANTS = Object.freeze([
  "recording", "composition", "publicPlayback", "interactiveQuiz",
  "excerpt", "selfHosting", "deferredCredits",
]);

const ROUND_SIZE = 10;
const ROUND_TTL_MS = 2 * 60 * 60 * 1000;
// How many rounds stay open at once, across every visitor. Each round is a
// handful of tokens and ten question maps — a few hundred bytes — so the cap is
// about the desk's memory, not the quiz's speed. Thirty-two was small enough
// that a shared link being passed around could evict a round from under whoever
// was in the middle of it, and an evicted round is an answer the server refuses.
const MAX_ROUNDS = 256;

// Preview lookup, kept to the server so the browser never talks to a third
// party and never sees a title in a URL. The store's preview is the promotional
// material Apple publishes for these recordings.
//
// Rights, recorded because a reader a year from now will ask: on 2026-09-18 the
// project owner stated that permission covers both the recordings and this
// delivery path — the store's preview endpoint — and that the position was
// taken on professional advice. That is why the round no longer tells every
// listener the source is unlicensed; it was true when it was written and is not
// now. It is a project-level clearance and this comment is its whole provenance:
// no per-card licence document has been filed here, which is why it changes
// nothing about the gate below.
const PREVIEW_ENDPOINT = "https://itunes.apple.com/search";
const PREVIEW_LIMIT_SECONDS = 30;
const YOUTUBE_CUE_SECONDS = 30;
const previewCache = new Map();

// The YouTube route the package allows for a question: a song's own video —
// an art track or an official audio upload — played in YouTube's visible
// player. The ad itself may never be the question's sound, because the ad shows
// the product, which is the answer. A song video shows the song, which the
// package accepts: "必要时允许玩家看到歌曲名称，仍然猜产品关联".
// Two doors that are shut, recorded so they are not pushed again.
//
// Spotify: its Developer Policy III.2 does not permit building games, quizzes
// included (reviewed 2026-09-18). A round of research produced eight Spotify
// track links for these recordings; they are a place to go and listen, and they
// are not a playback branch this quiz may add. Nothing here calls Spotify.
//
// And a verification rule that costs a day to relearn: an iframe player firing
// onReady, a page answering 200, even a PLAYING state with a clock that moves,
// none of them prove a person heard anything, and none of them prove the passage
// is the one the ad used. Only a listener does. Everything below that says
// "verified" means a person listened.
const YOUTUBE_SEARCH_ENDPOINT = "https://www.youtube.com/results";
const YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const youtubeCache = new Map();

const rounds = new Map();
// A fixed challenge: the same cards, in the same order, with the same options,
// so two people can compare an attempt instead of playing two random rounds.
const sets = new Map();
let deckCache = null;

function loadDeck() {
  if (!deckCache) {
    const raw = JSON.parse(readFileSync(DECK_PATH, "utf8"));
    deckCache = { units: raw.units || [], cards: raw.cards || [], version: Number(raw.version) || 1 };
  }
  return deckCache;
}

/** The private record a blind question is judged on. Editorial work, not data. */
function blindSourceRecord() {
  return {
    mappingVerified: false,
    deliveryScopeApproved: false,
    spoilerReviewPassed: false,
    asset: { provider: "none", recordingVerified: false, durationSeconds: null, noSpoilerPackagingVerified: false },
    rights: { reviewed: false, active: false, evidenceRef: "", creditsAvailableDuringPlay: false, grants: {} },
    cue: { auditioned: false, startSeconds: null, endSeconds: null },
  };
}

/** The gate, as a list of reasons rather than a boolean. */
function assessBlindSource(record) {
  const reasons = [];
  if (!record || typeof record !== "object") return { ready: false, reasons: ["missing_record"] };
  const asset = record.asset || {};
  const rights = record.rights || {};
  const cue = record.cue || {};
  if (asset.provider !== "licensed_file") reasons.push("provider_not_licensed_file");
  if (!record.mappingVerified) reasons.push("unverified_ad_mapping");
  if (!asset.recordingVerified) reasons.push("unverified_recording");
  if (!cue.auditioned) reasons.push("cue_not_auditioned");
  if (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0) reasons.push("unknown_duration");
  if (!Number.isFinite(cue.startSeconds) || !Number.isFinite(cue.endSeconds)
    || cue.startSeconds < 0 || cue.endSeconds <= cue.startSeconds
    || cue.endSeconds > asset.durationSeconds) reasons.push("invalid_cue_window");
  if (!rights.reviewed || !rights.active || !String(rights.evidenceRef || "").trim()) reasons.push("missing_rights_review");
  for (const name of RIGHTS_GRANTS) {
    if (rights.grants?.[name] !== true) reasons.push(`permission_unconfirmed:${name}`);
  }
  if (!rights.creditsAvailableDuringPlay) reasons.push("credits_must_remain_accessible");
  if (!record.deliveryScopeApproved) reasons.push("territory_term_commercial_scope_not_approved");
  if (!asset.noSpoilerPackagingVerified) reasons.push("asset_metadata_not_reviewed");
  if (!record.spoilerReviewPassed) reasons.push("question_spoiler_review_missing");
  return { ready: reasons.length === 0, reasons };
}

/**
 * Cards a published blind round may draw from.
 *
 * A project-level clearance for the preview path (2026-09-18, see the note by
 * PREVIEW_ENDPOINT) is one of the twelve conditions below, and it is not the
 * one standing in the way. No card here has a licensed asset, a verified
 * recording, an auditioned cue or a duration, so `publishable` stays 0 and
 * should: rights arriving is not a card becoming answerable, and the day this
 * function returns something it will be because a person listened to a
 * recording, not because a permission was granted.
 *
 * A card is *enabled* only when the deck says so, and the deck may only say so
 * for a card that clears the gate — `validateBank` is what holds those two
 * facts together. Empty today, on purpose: no card has an asset, a rights
 * record or an auditioned cue, so every round is labelled not scored until one
 * does. It still plays: the store preview, then the song's own video.
 */
function publishableCards() {
  return loadDeck().cards.filter((card) => card.enabled === true
    && card.product && card.film
    && assessBlindSource(card.blindSource).ready);
}

function token(bytes = 12) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Fold a title or artist down to something a lookup can be judged on. */
function fold(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[([{].*?[)\]}]/g, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function primaryArtist(value) {
  return fold(String(value ?? "").split(/\s*(?:&|,|\/|\bfeat\.?\b|\bwith\b|\bx\b|\band\b)\s*/i)[0]);
}

/**
 * A channel name folded down to the artist inside it.
 *
 * "The Rolling Stones" uploads as `RollingStonesVEVO`, "Yael Naim" as
 * `Yael Naim - Topic`, and an official channel often appends "Official". None
 * of those is the artist's name verbatim, and requiring that would reject the
 * artist's own channel — so the comparison is made on the letters that are
 * left once the platform's own furniture is removed.
 */
function channelCore(value) {
  return fold(value)
    .replace(/^the /, "")
    .replace(/ vevo$/, "")
    .replace(/ - topic$/, "")
    .replace(/ official$/, "")
    .replace(/\s+/g, "");
}

function artistCore(value) {
  return primaryArtist(value).replace(/^the /, "").replace(/\s+/g, "");
}

/**
 * The song's own YouTube video, or nothing.
 *
 * Matching is deliberately strict, and it fails closed: the title has to fold
 * to the song, the channel has to be the artist or the artist's "- Topic"
 * channel, and the video has to answer an oEmbed request. A near miss is worse
 * than no sound here — a wrong recording turns the question into a different
 * question, which is the failure the package warns about for 《I Am the
 * Greatest》 and the two 《Come Rain Or Come Shine》 recordings.
 */
async function resolveSongVideo(card) {
  const key = `${card.song}|${card.artist}`;
  if (youtubeCache.has(key)) return youtubeCache.get(key);
  const lookup = (async () => {
    try {
      const query = encodeURIComponent(`${card.song} ${card.artist} official audio`);
      const response = await fetch(`${YOUTUBE_SEARCH_ENDPOINT}?search_query=${query}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) return null;
      const html = await response.text();
      const match = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
      if (!match) return null;
      const wanted = fold(card.song);
      const wantedArtist = artistCore(card.artist);
      const candidates = [];
      const walk = (node) => {
        if (!node || typeof node !== "object") return;
        if (node.videoRenderer) {
          const renderer = node.videoRenderer;
          const title = (renderer.title?.runs || []).map((run) => run.text).join("");
          const channel = renderer.ownerText?.runs?.[0]?.text || "";
          if (renderer.videoId && title) candidates.push({ videoId: renderer.videoId, title, channel });
        }
        for (const value of Object.values(node)) walk(value);
      };
      walk(JSON.parse(match[1]));
      let attempts = 0;
      for (const candidate of candidates) {
        const title = fold(candidate.title);
        if (!title.includes(wanted)) continue;
        // A live take, a remix or a cover is a different recording, and the
        // package is explicit that the game must play the one the ad used. A
        // card whose own title says "Live" or "Remix" keeps the right to it.
        const alternate = [" live", " remix", " cover", " karaoke", " instrumental", " sped up", " nightcore", " lyric", "(live", "[live"];
        if (alternate.some((marker) => title.includes(marker) && !wanted.includes(marker.trim()))) continue;
        const channel = channelCore(candidate.channel);
        const artistMatches = Boolean(wantedArtist)
          && (channel.includes(wantedArtist) || wantedArtist.includes(channel));
        if (!artistMatches) continue;
        attempts += 1;
        if (attempts > 3) break;
        const verified = await verifyEmbeddable(candidate.videoId);
        if (!verified) continue;
        return { videoId: candidate.videoId, title: candidate.title, channel: candidate.channel };
      }
      return null;
    } catch {
      return null;
    }
  })();
  youtubeCache.set(key, lookup);
  return lookup;
}

/** oEmbed answers 200 only for a video that exists and may be embedded. */
async function verifyEmbeddable(videoId) {
  try {
    const response = await fetch(`${YOUTUBE_OEMBED_ENDPOINT}?url=https%3A//www.youtube.com/watch%3Fv%3D${encodeURIComponent(videoId)}&format=json`, {
      headers: { "User-Agent": "AI-System-6/1.0" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The media descriptor for a song's own video.
 *
 * One function because two branches hand out this source, and the descriptor
 * carries the two facts the question face prints: which player, and that the
 * ad itself is never the thing being played.
 */
function songVideoMedia(song) {
  return {
    provider: "youtube",
    videoId: song.videoId,
    startSeconds: 0,
    endSeconds: YOUTUBE_CUE_SECONDS,
    // The player stays visible with YouTube's own controls; the song's own
    // video is the question's material, never the ad.
    rights: "youtube_song_video_visible_player",
  };
}

/** The recording this card names, or nothing. A near miss is worse than none. */
async function resolvePreview(card) {
  const key = `${card.song}|${card.artist}`;
  if (previewCache.has(key)) return previewCache.get(key);
  const lookup = (async () => {
    try {
      const term = encodeURIComponent(`${card.song} ${card.artist}`.trim());
      const response = await fetch(`${PREVIEW_ENDPOINT}?term=${term}&entity=song&limit=10`, {
        headers: { "User-Agent": "AI-System-6/1.0" },
      });
      if (!response.ok) return null;
      /** @type {{ results?: Array<{ previewUrl?: string, trackName?: string, artistName?: string }> }} */
      const body = await response.json();
      const wantTitle = fold(card.song);
      const wantArtist = primaryArtist(card.artist);
      for (const row of body?.results || []) {
        if (!row?.previewUrl) continue;
        if (fold(row.trackName) !== wantTitle) continue;
        const artist = fold(row.artistName);
        if (wantArtist && !(artist.includes(wantArtist) || wantArtist.includes(artist))) continue;
        return { url: String(row.previewUrl), trackName: String(row.trackName || ""), artistName: String(row.artistName || "") };
      }
      return null;
    } catch {
      return null;
    }
  })();
  previewCache.set(key, lookup);
  return lookup;
}

function squareBracket(seed) {
  // A stable hash, so a set number rebuilds the same ten on any server.
  let hash = 2166136261;
  for (const char of String(seed || "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/**
 * The same shuffle, driven by a seed instead of the machine's entropy.
 *
 * A shared challenge has to be the same ten for two people — and it has to
 * still be the same ten tomorrow, on a server that was restarted by a deploy in
 * between. So a set is not a random id kept in memory: it is a NUMBER, and the
 * round behind it is a function of (deck version, number). Everything below
 * that draws from a seeded generator is rebuildable by anyone holding those two
 * integers; the Map is only a cache of what was already minted.
 */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** The generator one set number owns. Namespaced by deck version on purpose. */
function setRandom(version, number) {
  return seededRandom(squareBracket(`omt-set:${Number(version) || 0}:${Number(number) || 0}`));
}

/**
 * The recording a card is asked with, as one string.
 *
 * Two cards can carry the same store preview: the catalogue's own record of a
 * music use, and the editorial bank's record of the same use written in another
 * language. They are one song heard once, and this is the key that says so —
 * the card's *product* label cannot, because the two cards name it differently.
 */
function recordingKey(card) {
  return String(card?.questionSound?.url || "").trim();
}

/**
 * Four choices of the same kind, never the card's own sibling, and never the
 * card's own recording under a second name.
 *
 * The sibling rule covers the pair the deck declares by hand; the recording rule
 * covers the pair the deck has not declared yet, so a question can never offer
 * two labels for one sound and mark one of them wrong.
 */
function choicesFor(card, cards, random = null) {
  const mix = (items) => (random ? seededShuffle(items, random) : shuffle(items));
  const others = cards.filter((other) => other.id !== card.id
    && other.product && other.film
    && other.product !== card.product
    && other.id !== card.siblingOf
    && other.siblingOf !== card.id
    && !(card.knowledgeGroup && other.knowledgeGroup === card.knowledgeGroup)
    && !(card.excludedAnswerLabels || []).includes(other.product)
    && !(recordingKey(other) && recordingKey(other) === recordingKey(card)));
  const sameKind = others.filter((other) => other.kind === card.kind);
  const rest = others.filter((other) => other.kind !== card.kind);
  const seen = new Set([card.product]);
  const picked = [];
  for (const other of [...mix(sameKind), ...mix(rest)]) {
    if (seen.has(other.product)) continue;
    seen.add(other.product);
    picked.push(other);
    if (picked.length >= 3) break;
  }
  return mix([card, ...picked]);
}

/**
 * The ten a set number names, rebuilt from the deck rather than remembered.
 *
 * Ten cards with four options each, in the order the seeded shuffle puts them,
 * so two people holding the same number are answering the same questions in the
 * same order with the same four labels in the same places.
 */
function setOrderFor(version, number, cards) {
  const random = setRandom(version, number);
  // Only what can be played: a settled card with its sound pinned backstage.
  const pool = cards.filter((card) => card.product && card.film && pinnedSound(card));
  const order = [];
  // One association, one question of a ten. Two cards can be the same answer —
  // a pair the deck declares as siblings, or two records of one recording — and
  // asking both would put one sound in a set twice, the second time under a
  // label that makes the first answer look wrong. The seeded shuffle decides
  // which of the two survives, so the number still names the same ten for
  // everyone who opens it.
  const asked = new Set();
  const heard = new Set();
  for (const card of seededShuffle(pool, random)) {
    if (order.length >= ROUND_SIZE) break;
    const sibling = String(card.siblingOf || "");
    const recording = recordingKey(card);
    if ((sibling && asked.has(sibling)) || (card.knowledgeGroup && asked.has(card.knowledgeGroup)) || (recording && heard.has(recording))) continue;
    const optionCards = choicesFor(card, cards, random);
    if (optionCards.length !== 4) continue;
    asked.add(card.id);
    if (card.knowledgeGroup) asked.add(card.knowledgeGroup);
    if (recording) heard.add(recording);
    order.push({ cardId: card.id, optionCardIds: optionCards.map((option) => option.id) });
  }
  return order;
}

/** A fresh number for a fresh round. Small enough to read out in a chat. */
function newSetNumber() {
  return 1 + crypto.randomInt(9999);
}

function pruneRounds(now = Date.now()) {
  for (const [id, round] of rounds) {
    if (now - round.startedAt > ROUND_TTL_MS) rounds.delete(id);
  }
  while (rounds.size > MAX_ROUNDS) {
    rounds.delete(rounds.keys().next().value);
  }
}

/**
 * Fixed sets outlive a round on purpose: a challenge is meant to be opened
 * later by somebody else, so they keep for a week rather than two hours.
 */
const SET_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SETS = 200;

function pruneSets(now = Date.now()) {
  for (const [id, set] of sets) {
    if (now - set.createdAt > SET_TTL_MS) sets.delete(id);
  }
  while (sets.size > MAX_SETS) {
    sets.delete(sets.keys().next().value);
  }
}

/**
 * Build a round and return only what a question page may see.
 *
 * `prepare_question` in the package's own words: one object for the wire, one
 * for the server. Every question sounds: a licensed file, the store's preview,
 * or the song's own video. There is no silent round and no generated tone — a
 * guessing game you play by ear does not exist without the music.
 */
/**
 * A fresh round: a number nobody has used yet, and the ten that number names.
 */
/**
 * The sound a card is asked with: its store preview, pinned into the deck by
 * tooling/pin-one-more-tune-sound.mjs after the tool fetched it. Resolving it
 * is research done ahead of time, so a round never waits on a lookup and never
 * hands out a card that turns out not to play. A song's own YouTube video is
 * not a question source: label videos refuse embedding on this site.
 */
function pinnedSound(card) {
  const sound = card?.questionSound;
  if (sound?.provider === "preview" && /^https:\/\/[\w.-]+\//.test(String(sound.url || ""))) return sound;
  return null;
}

async function startRound({ allowPreview = true, allowYoutube = true, challengeId = "", questionIndex = -1 } = {}) {
  const requested = String(challengeId || "").trim();
  if (requested) return startFixedRound(requested, Number(questionIndex), { allowPreview, allowYoutube });
  const { version } = loadDeck();
  return startNumberedRound({ version, number: newSetNumber(), allowPreview, allowYoutube, questionIndex: -1 });
}

/**
 * Mint the round a set number names.
 *
 * The set is drawn only from cards whose sound is pinned, so the same number
 * names the same ten for everyone and every one of them plays. A round in
 * which nothing may play (no source allowed) is not handed out: it comes back
 * `unavailable` / `no_sound`.
 *
 * @param {{ version: number, number: number, allowPreview: boolean, allowYoutube: boolean, questionIndex: number }} options
 */
async function startNumberedRound({ version, number, allowPreview, allowYoutube, questionIndex }) {
  const { cards } = loadDeck();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const order = setOrderFor(version, number, cards);
  if (!order.length) return { mode: "unavailable", code: "no_questions", questions: [] };
  const entries = questionIndex >= 0 ? [order[questionIndex]].filter(Boolean) : order;
  if (!entries.length) return { mode: "unavailable", code: "question_not_found", questions: [] };
  for (const entry of entries) {
    if (!byId.has(entry.cardId) || entry.optionCardIds.some((id) => !byId.has(id))) {
      return { mode: "unavailable", code: "set_stale", cardId: entry.cardId, questions: [] };
    }
  }
  // The file route is not implemented. An unrelated licensed record must never
  // divert these pinned previews into its zero-duration placeholder.
  const wantsPreview = allowPreview;
  const wantsSong = allowYoutube;
  if (!wantsPreview && !wantsSong) return { mode: "unavailable", code: "no_sound", questions: [] };
  const mode = wantsPreview ? "preview" : "youtube";
  pruneRounds();
  const roundToken = token(16);
  const creditsPath = `/api/one-more-tune/credits/${token(16)}`;
  const mintedAll = await Promise.all(entries.map((entry) => mintQuestion(
    byId.get(entry.cardId),
    entry.optionCardIds.map((id) => byId.get(id)),
    mode,
    { creditsPath, roundToken, allowPreview: wantsPreview, allowYoutube: wantsSong },
  )));
  const questions = mintedAll.map((minted) => minted.question);
  const key = new Map(mintedAll.map((minted) => [minted.question.token, minted.key]));
  const obtainedPreview = questions.some((question) => question.media.provider === "preview");
  const obtainedSong = questions.some((question) => question.media.provider === "youtube");
  // The label describes what was actually handed out, not what was hoped for,
  // and each question's own note says which source it ended up playing. A
  // round where nothing may play is not a round.
  if (!obtainedPreview && !obtainedSong) return { mode: "unavailable", code: "no_sound", questions: [] };
  const finalMode = obtainedPreview ? "preview" : "youtube";
  // The cache is a convenience, not the identity: the number and the deck
  // version already name this set, and a restart throws away nothing a link
  // needs.
  const setId = String(number);
  sets.set(setId, { deckVersion: version, mode: finalMode, createdAt: Date.now(), order, roundToken });
  rounds.set(roundToken, { mode: finalMode, setId, startedAt: Date.now(), questions: key, creditsPath });
  return { mode: finalMode, roundToken, setId, deckVersion: version, questions };
}

/**
 * The set id a code names: `OMT.<deckVersion>.<number>` from a shared link, the
 * bare number from an older code, or a legacy random token from a set this
 * process still remembers.
 */
function parseChallengeId(value) {
  const text = String(value || "").trim();
  if (/^\d{1,6}$/.test(text)) return { version: loadDeck().version, number: Number(text) };
  const match = /^OMT\.(\d{1,4})\.(\d{1,6})$/.exec(text);
  if (match) return { version: Number(match[1]), number: Number(match[2]) };
  return null;
}

/** Mint one question: opaque tokens, four labels, and a media descriptor. */
async function mintQuestion(card, optionCards, mode, { creditsPath, roundToken, allowPreview = true, allowYoutube = true }) {
  const questionToken = token(16);
  /** @type {{ provider: string, url?: string, videoId?: string, startSeconds: number, endSeconds: number, durationSeconds?: number, rights?: string }} */
  // "none" only when the caller allows neither pinned source for this card.
  let media = { provider: "none", startSeconds: 0, endSeconds: 0 };
  const sound = pinnedSound(card);
  if (mode === "licensed") {
    media = { provider: "licensed_file", url: mediaPathFor(roundToken, questionToken), startSeconds: 0, endSeconds: 0, durationSeconds: 0 };
  }
  if (mode !== "licensed" && sound?.provider === "preview" && allowPreview) {
    media = {
      provider: "preview",
      url: sound.url,
      startSeconds: 0,
      endSeconds: PREVIEW_LIMIT_SECONDS,
      rights: "store_preview_cleared_for_this_project",
    };
  }
  if (mode !== "licensed" && sound?.provider === "youtube" && allowYoutube) {
    media = songVideoMedia(sound);
  }
  const optionTokens = optionCards.map((option) => ({
    id: token(9),
    label: option.product,
    cardId: option.id,
  }));
  return {
    question: {
      token: questionToken,
      prompt: promptKey(card),
      choices: optionTokens.map(({ id, label }) => ({ id, label })),
      media,
      creditsUrl: creditsPath,
    },
    key: {
      cardId: card.id,
      optionCardIds: optionCards.map((option) => option.id),
      choiceTokens: optionTokens.map((option) => option.id),
      correctToken: optionTokens.find((option) => option.cardId === card.id)?.id || "",
      chosenToken: "",
      submitted: false,
      result: null,
    },
  };
}

/**
 * Re-open a fixed challenge: the same cards, the same order, the same options.
 *
 * The design asks for this in as many words — a challenge link has to carry a
 * fixed list, order and bank version, "不能只是把首页链接发过去，让对方重新随机抽十道",
 * and a set whose cards have since changed must say so rather than quietly
 * swapping in different questions.
 *
 * A numbered set is rebuilt from the deck rather than looked up, so a link
 * minted last week still opens after a deploy: the number and the version are
 * the whole record. A legacy random token is still honoured while this process
 * remembers it, because the links already in people's chats should keep
 * working for as long as they can.
 */
async function startFixedRound(challengeId, questionIndex, { allowPreview = true, allowYoutube = true } = {}) {
  pruneSets();
  const { cards, version } = loadDeck();
  const numbered = parseChallengeId(challengeId);
  if (numbered) {
    if (numbered.version && numbered.version !== version) {
      // The deck the link names is not the deck this server holds. Saying so is
      // the rule; serving a similar-looking ten instead would be the silent
      // swap the design forbids.
      return { mode: "unavailable", code: "set_stale", questions: [] };
    }
    return startNumberedRound({
      version,
      number: numbered.number,
      allowPreview,
      allowYoutube,
      questionIndex: Number(questionIndex) >= 0 ? Number(questionIndex) : -1,
    });
  }
  const set = sets.get(challengeId);
  if (!set) return { mode: "unavailable", code: "set_not_found", questions: [] };
  const byId = new Map(cards.map((card) => [card.id, card]));
  const entries = questionIndex >= 0 ? [set.order[questionIndex]].filter(Boolean) : set.order;
  if (!entries.length) return { mode: "unavailable", code: "question_not_found", questions: [] };
  for (const entry of entries) {
    if (!byId.has(entry.cardId) || entry.optionCardIds.some((id) => !byId.has(id))) {
      return { mode: "unavailable", code: "set_stale", cardId: entry.cardId, questions: [] };
    }
  }
  const roundToken = token(16);
  const creditsPath = `/api/one-more-tune/credits/${token(16)}`;
  const questions = [];
  const key = new Map();
  for (const entry of entries) {
    const card = byId.get(entry.cardId);
    const optionCards = entry.optionCardIds.map((id) => byId.get(id));
    const minted = await mintQuestion(card, optionCards, set.mode, { creditsPath, roundToken, allowPreview, allowYoutube });
    questions.push(minted.question);
    key.set(minted.question.token, minted.key);
  }
  rounds.set(roundToken, { mode: set.mode, setId: challengeId, startedAt: Date.now(), questions: key, creditsPath });
  return { mode: set.mode, roundToken, setId: challengeId, deckVersion: version, questions };
}

function promptKey(card) {
  if (card.kind === "event_segment") return "one_more_tune_which_segment";
  if (card.kind === "brand_film") return "one_more_tune_which_film";
  if (card.kind === "feature_reveal" || card.kind === "service_ad") return "one_more_tune_which_feature";
  return "one_more_tune_which_product";
}

function mediaPathFor(roundToken, questionToken) {
  // Opaque and round-scoped: the path names no card, so an asset URL can never
  // carry a product name a listener could read.
  return `/api/one-more-tune/media/${roundToken.slice(0, 10)}${questionToken.slice(0, 10)}`;
}

function cardById(cardId) {
  return loadDeck().cards.find((card) => card.id === cardId) || null;
}

/**
 * Every store preview this deck pins, as a set of URLs.
 *
 * The relay in routes/one-more-tune.js takes a URL rather than a card id,
 * because the browser is never handed a card — and it answers only for URLs in
 * this set, so it is not a general-purpose proxy: the deck itself is the
 * allowlist.
 */
let pinnedPreviewUrlSet = null;
function pinnedPreviewUrls() {
  if (pinnedPreviewUrlSet) return pinnedPreviewUrlSet;
  const urls = new Set();
  for (const card of loadDeck().cards) {
    const sound = pinnedSound(card);
    if (sound) urls.add(String(sound.url));
  }
  pinnedPreviewUrlSet = urls;
  return urls;
}

function isPinnedPreviewUrl(value) {
  return pinnedPreviewUrls().has(String(value || ""));
}

/** The reveal, and the only thing a submission may return. */
function revealFor(card) {
  return {
    product: card.product,
    film: card.film,
    year: card.year ?? null,
    song: card.song,
    artist: card.artist,
    note: card.note || null,
    videoId: card.videoId || "",
    anchorVideoId: card.anchorVideoId || "",
    sourceAnchor: Number.isInteger(card.sourceAnchor) ? card.sourceAnchor : null,
  };
}

/**
 * One submission a question. A second one returns the stored result rather than
 * rescoring, so a double tap cannot turn one question into two points, and a
 * skip is recorded as a skip rather than as a wrong answer.
 */
/**
 * @param {{ roundToken?: string, questionToken?: string, choiceToken?: string, skipped?: boolean }} [submission]
 */
function submitAnswer({ roundToken, questionToken, choiceToken = "", skipped = false } = {}) {
  pruneRounds();
  const round = rounds.get(String(roundToken || ""));
  if (!round) return { ok: false, code: "round_not_found", error: "That round is no longer open." };
  const question = round.questions.get(String(questionToken || ""));
  if (!question) return { ok: false, code: "question_not_found", error: "No such question in this round." };
  if (question.submitted) return { ok: true, repeated: true, ...question.result };
  if (choiceToken && !question.choiceTokens.includes(choiceToken)) {
    return { ok: false, code: "invalid_choice", error: "Choose one of this question’s options." };
  }
  const card = cardById(question.cardId);
  if (!card) return { ok: false, code: "card_missing", error: "The deck no longer carries this card." };
  const outcome = skipped || !choiceToken ? "skipped" : "answered";
  const correct = outcome === "answered" && choiceToken === question.correctToken;
  question.submitted = true;
  question.chosenToken = skipped ? "" : String(choiceToken);
  question.result = {
    correct,
    points: correct ? 1 : 0,
    outcome,
    cardId: card.id,
    reveal: revealFor(card),
  };
  return { ok: true, repeated: false, ...question.result };
}

/** What the 资料 page needs: the gate applied to every card, with reasons. */
function report() {
  const { cards, units } = loadDeck();
  const gate = assessBlindSource(blindSourceRecord());
  const licensed = publishableCards().length;
  return {
    units: units.length,
    cards: cards.length,
    publishable: licensed,
    gateReasons: gate.reasons,
    // What a round reaches for first, in the same order startRound uses: a
    // cleared asset, then the store's public preview, then the song's own video.
    // The window prints the sentence that matches this, so the two layers have
    // to answer the same question the same way.
    mode: "preview",
  };
}

/**
 * The bank check the design asks to run before shipping.
 *
 * "验证所有启用题目拥有真实录音 ID、非空入出点、出点晚于入点、准确来源及人工/可信听音
 * 审查记录", plus "题库中没有重复 ID" and "同一题四个选项唯一". A card is *enabled*
 * when it passes the blind-source gate; everything enabled must therefore carry
 * the whole record, and the empty answer is the honest one today: nothing is
 * enabled, so nothing is asserted about a recording nobody has cleared.
 *
 * @param {{ cards?: Array<object> }} [override] a synthetic bank, for the contract
 * @returns {{ checked: number, enabled: string[], problems: string[], deckVersion: number }}
 */
function validateBank(override = {}) {
  const loaded = loadDeck();
  const cards = Array.isArray(override.cards) ? override.cards : loaded.cards;
  const version = loaded.version;
  const problems = [];
  const enabled = [];
  const seen = new Set();
  for (const card of cards) {
    if (!card || typeof card.id !== "string" || !card.id) {
      problems.push("a card has no id");
      continue;
    }
    if (seen.has(card.id)) problems.push(`${card.id}: duplicate id`);
    seen.add(card.id);
    if (!card.product || !card.film) {
      // Not a problem: an unsettled pairing stays a research row and is never
      // asked as a question. It only has to be honest about it.
      continue;
    }
    const options = choicesFor(card, cards).map((option) => option.product);
    if (options.length !== 4) problems.push(`${card.id}: ${options.length} choices`);
    if (new Set(options).size !== 4) problems.push(`${card.id}: a choice is repeated`);
    if (card.enabled !== true) continue;
    enabled.push(card.id);
    const record = card.blindSource || {};
    const gate = assessBlindSource(record);
    if (!gate.ready) {
      // This is the check that matters: a card marked playable that does not
      // carry the evidence to be playable.
      problems.push(`${card.id}: enabled without clearing the gate (${gate.reasons.join(",")})`);
      continue;
    }
    if (!String(record.asset?.recordingId || "").trim()) problems.push(`${card.id}: enabled without a recording id`);
    if (!String(record.asset?.assetRevision || "").trim()) problems.push(`${card.id}: enabled without an asset revision`);
    if (!String(record.rights?.evidenceRef || "").trim()) problems.push(`${card.id}: enabled without rights evidence`);
    const { startSeconds, endSeconds } = record.cue || {};
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      problems.push(`${card.id}: enabled with an empty cue window`);
    } else if (endSeconds <= startSeconds) {
      problems.push(`${card.id}: enabled with an out-point at or before its in-point`);
    }
    if (!Number.isFinite(record.asset?.durationSeconds) || endSeconds > record.asset.durationSeconds) {
      problems.push(`${card.id}: cue runs past the end of the recording`);
    }
  }
  // One recording, one card. Two cards can end up carrying the same store
  // preview — the catalogue's record of a music use and the editorial bank's
  // record of the same use — and the pair only reaches a question as one answer
  // when the deck says so out loud. Undeclared, they are two names for one
  // sound, and the second name is scored as a wrong answer.
  const byRecording = new Map();
  for (const card of cards) {
    const key = recordingKey(card);
    if (!key || !card.product || !card.film) continue;
    if (!byRecording.has(key)) byRecording.set(key, []);
    byRecording.get(key).push(card);
  }
  for (const group of byRecording.values()) {
    if (group.length < 2) continue;
    const undeclared = group.filter((card) => !group.some((other) =>
      other.id !== card.id && card.siblingOf === other.id));
    if (undeclared.length) {
      problems.push(`${undeclared.map((card) => card.id).join(" and ")}: one recording, two cards, not declared as siblings`);
    }
  }
  return { checked: cards.length, enabled, problems, deckVersion: version };
}

module.exports = {
  loadDeck,
  assessBlindSource,
  blindSourceRecord,
  publishableCards,
  isPinnedPreviewUrl,
  resolveSongVideo,
  resolvePreview,
  startRound,
  startFixedRound,
  submitAnswer,
  report,
  validateBank,
  RIGHTS_GRANTS,
  ROUND_SIZE,
};
