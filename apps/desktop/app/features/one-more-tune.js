// Feature module: One More Tune — 再来一首.
//
// An Apple-advertising music deck, built to the research package's own spec
// (One_More_Tune_全量题库与学习模式.md and One_More_Tune_音源接入与盲听规则.md).
// Three entrances over one set of checked associations, never three copies of
// the answers:
//
//   学习 (Study)     — 认识 → 配对 → 回想, for someone meeting these ads.
//   卡片架 (Shelf)   — the collection, searchable, and the review queue.
//   挑战 (Challenge) — ten questions a round, 3 → 7 → 15 seconds of the same
//                     segment, 100 / 70 / 40 points, one submission each.
//
// Four rules from that spec are structural here, not decoration:
//
//   1. UNKNOWN IS NULL, AND 0 IS AN ANSWER. "未知时间用 null。0 是可被实听
//      确认的有效起点，禁止用 0 来填空。" So a clip with no audition has
//      start === null, the player refuses to run, and the only way to reach 0
//      is a person pressing 从头开始试听 — which is a confirmation, not a
//      default. An earlier build of this file defaulted to 0/12s; that is the
//      exact thing the spec forbids.
//   2. THREE KINDS OF TIME, NEVER COPIED INTO EACH OTHER. `sourceAnchor` is
//      where a source says to start looking (a keynote's 28:10). `filmClip` is
//      where the music actually sits inside that film. `quizClip` is what the
//      player hears out of a recording. A keynote timeline cannot be pasted
//      onto a song's timeline, so the three are stored apart and only the
//      third is ever played.
//   3. THREE READINESS GATES, DERIVED. learn / recall / challenge are computed
//      from what a card actually has (oneMoreTuneReadiness), so a card cannot
//      claim to be askable because someone set a flag. Nothing ships
//      recall-ready: no segment in this deck has been listened through.
//   4. PRACTICE IS NOT MASTERY, AND A PLAYER FAULT IS NOT A MISS. Every event
//      this prototype writes carries demoOnly and mediaPlayed, lives in its own
//      store, and is never a production FSRS record.
//
// The deck ships no licensed audio, so a question gets its sound in this order:
// the store's public preview of the recording — promotional material, and every
// surface that uses it says the project is not licensed for it yet — then the
// song's own YouTube video in YouTube's own player, then a generated cue, which
// the question names as a demonstration. The store leads because it is the one
// of the two that plays: its preview is a plain audio URL, while a video can
// refuse to be embedded by whoever owns it. A round built from a file the
// person picked for themselves plays through Web Audio's start(when, offset,
// duration), so the segment ends on the audio clock rather than on a timer.
//
// Leak control is enforced by construction: a question is rendered from a card
// id alone (renderOneMoreTuneRecall / renderOneMoreTuneChallenge write no
// answer text at all), the chosen file's name is never printed, and the
// system's now-playing metadata is cleared before every question and filled in
// only by a reveal.
//
// Progress is feature-local: this window's own database, its own key, and a
// file a person can carry out of it. Nothing here opens a shared persistence
// boundary or writes anywhere another feature reads.

window.AISystem6OneMoreTuneLoaded = true;

// A demo store, named as one. The spec is explicit that prototype scheduling
// records must not be importable into a production FSRS history, so they do not
// share a key with anything that could later hold one.
const ONE_MORE_TUNE_STORAGE_KEY = "ai-system-6-one-more-tune-demo-v02";
// The visitor's learning state lives in a database of its own. The old
// localStorage record is read once, migrated, and then kept as the fallback for
// a browser that refuses a database (private mode, a blocked origin): the study
// side must not become unusable because storage was denied, and a person whose
// progress is not being saved has to be told so and given the export.
const ONE_MORE_TUNE_DB_NAME = "ai-system-6-one-more-tune";
const ONE_MORE_TUNE_DB_STORE = "progress";
const ONE_MORE_TUNE_DB_RECORD = "state";
// The file a person exports carries its own format version, which is not the
// same number as the record shape inside it: a file has to stay readable when
// the state grows a field.
const ONE_MORE_TUNE_EXPORT_SCHEMA = 1;
const ONE_MORE_TUNE_EVENT_LIMIT = 500;
// 3: the ladder is retired and the schedule is ts-fsrs's own. The key keeps its
// v02 name so the migration above can find what a person already did; the
// version inside is what a reader has to trust.
// 4: a round in progress is remembered — the set, the question it reached and
// the mode — so leaving the page (closing a wrist, switching apps, answering a
// message) does not throw the ten away. Lifeline's wrist loop is the model: the
// story waits for you, and coming back continues it rather than starting over.
const ONE_MORE_TUNE_STATE_VERSION = 4;

// One round is ten questions, untimed, one submission each, a point a question.
//
// The design went through a scored ladder — three seconds for 100, seven for 70,
// fifteen for 40, twenty-five seconds a question — and dropped it deliberately:
// "三秒、七秒、十五秒的分级试听，以及默认二十五秒倒计时，都先拿掉。第一版先允许
// 反复听同一段，让朋友有时间回忆". A music quiz that turns into a reaction test
// loses the thing it is testing, so re-listening is free and the clock is gone.
//
// What the score does keep is the distinction the design asks for: a question
// whose sound never played is not a wrong answer, so it is skipped, not lost.
const ONE_MORE_TUNE_ROUND_SIZE = 10;

const ONE_MORE_TUNE_GRADES = Object.freeze([
  { id: "again", labelKey: "one_more_tune_grade_forgot", rating: "Again" },
  { id: "hard", labelKey: "one_more_tune_grade_hard", rating: "Hard" },
  { id: "good", labelKey: "one_more_tune_grade_good", rating: "Good" },
  { id: "easy", labelKey: "one_more_tune_grade_easy", rating: "Easy" },
]);

// --- The scheduler -----------------------------------------------------
//
// The four grades are ts-fsrs's own, and so are the numbers under them:
// `repeat()` computes the four dates the buttons offer, `next()` computes the
// state a commit stores. The library ships as a lazy bundle of its own bytes
// (app/vendor/fsrs.js, built by tooling/build-fsrs-vendor.mjs) and is asked for
// when this window mounts, so the desk's boot payload never carries it.
//
// The parameters are the library's defaults with fuzz off: a "≈ 10 min" that
// shakes between two draws of the same card is a number nobody can compare with
// the card they graded yesterday.
const ONE_MORE_TUNE_SCHEDULER_URL = "/app/vendor/fsrs.js";
const ONE_MORE_TUNE_FSRS_PARAMETERS = Object.freeze({ request_retention: 0.9, enable_fuzz: false });

let oneMoreTuneScheduler = null;
let oneMoreTuneSchedulerPromise = null;

/** The scheduler, once. Every caller shares one load, and a failure is retryable. */
function oneMoreTuneEnsureScheduler() {
  if (oneMoreTuneScheduler) return Promise.resolve(oneMoreTuneScheduler);
  if (oneMoreTuneSchedulerPromise) return oneMoreTuneSchedulerPromise;
  const build = window.AISystem6Config?.getAppBuildInfo?.().build || "dev";
  oneMoreTuneSchedulerPromise = import(`${ONE_MORE_TUNE_SCHEDULER_URL}?v=${encodeURIComponent(build)}`)
    .then((module) => {
      oneMoreTuneScheduler = {
        createEmptyCard: module.createEmptyCard,
        Rating: module.Rating,
        State: module.State,
        scheduler: module.fsrs(module.generatorParameters({ ...ONE_MORE_TUNE_FSRS_PARAMETERS })),
      };
      return oneMoreTuneScheduler;
    })
    .catch(() => {
      // Losing the library is not a reason to lose the person's grade: the
      // buttons stay usable and say the date is unavailable, and the event log
      // records that nothing was scheduled.
      oneMoreTuneSchedulerPromise = null;
      return null;
    });
  return oneMoreTuneSchedulerPromise;
}

/** The library's own Rating for one of this window's four buttons. */
function oneMoreTuneRating(gradeId) {
  const grade = ONE_MORE_TUNE_GRADES.find((entry) => entry.id === gradeId);
  return grade && oneMoreTuneScheduler ? oneMoreTuneScheduler.Rating[grade.rating] : null;
}

/**
 * The card as the scheduler sees it.
 *
 * A card the person has never graded under FSRS is an empty card: `stage` from
 * the retired ladder was a position on a list, not a memory state, and turning
 * one into stability and difficulty would be a fiction no later reader could
 * tell from real history.
 */
function oneMoreTuneSchedulerCard(record, now) {
  if (!oneMoreTuneScheduler) return null;
  return record?.fsrs && typeof record.fsrs === "object"
    ? record.fsrs
    : oneMoreTuneScheduler.createEmptyCard(now);
}

/**
 * What each of the four buttons would do, straight from `repeat()`.
 *
 * @returns {Record<string, Date>|null} null when the library is not loaded yet
 */
function oneMoreTuneGradePreviews(cardId, now = new Date()) {
  if (!oneMoreTuneScheduler) return null;
  const card = oneMoreTuneSchedulerCard(oneMoreTuneRecord(cardId), now);
  let log = null;
  try {
    log = oneMoreTuneScheduler.scheduler.repeat(card, now);
  } catch {
    return null;
  }
  const previews = {};
  for (const grade of ONE_MORE_TUNE_GRADES) {
    const due = log?.[oneMoreTuneScheduler.Rating[grade.rating]]?.card?.due;
    previews[grade.id] = due instanceof Date && Number.isFinite(due.getTime()) ? due : null;
  }
  return previews;
}

// Units are lessons, three to five associations each. An entry whose product is
// not settled belongs to no unit: it stays on the shelf and in 资料, and never
// becomes a question. That is the spec's rule, not a shortcut — "不能为了让每条
// 都能出题，给它硬配一个产品".
// The deck itself lives in a data file, not in this module.
//
// It is the same file the server reads to hold the answer key, which is the
// point: a question's answer may exist in exactly one place, and the browser
// gets it only after a submission comes back. This module loads the deck for
// the shelf, the study faces and 资料 — surfaces that show answers on purpose —
// and the challenge asks the server instead.
const ONE_MORE_TUNE_DECK_URL = "/data/one-more-tune-deck.json";

let ONE_MORE_TUNE_UNITS = Object.freeze([]);
let ONE_MORE_TUNE_CARDS = Object.freeze([]);
// Everything the research holds, for the backstage 资料馆 only. The game itself
// — shelf, study, rounds — sees ONE_MORE_TUNE_CARDS: settled cards whose
// question sound is pinned, so nothing a player meets is a card that cannot play.
let ONE_MORE_TUNE_ALL_CARDS = Object.freeze([]);
let ONE_MORE_TUNE_ALL_UNITS = Object.freeze([]);
// The deck's own number. It travels in the file and in every round token, and
// the shelf prints it, because two people comparing a set need to know they
// played the same deck.
let ONE_MORE_TUNE_DECK_VERSION = 0;
let oneMoreTuneDeckPromise = null;

// Why a card is not a question, and who says what it says. A separate file and
// a separate fetch, because only the catalogue reads it and the catalogue is the
// one page a person opens after playing: every row there already shows its
// answer. Nothing on this path may reach a question — the reasons name films and
// the sources are URLs with product names in them.
const ONE_MORE_TUNE_EVIDENCE_URL = "/data/one-more-tune-evidence.json";
let ONE_MORE_TUNE_EVIDENCE = null;
let oneMoreTuneEvidencePromise = null;

/** Load the evidence file once, and only when the catalogue asks for it. */
function oneMoreTuneEnsureEvidence() {
  if (!oneMoreTuneEvidencePromise) {
    oneMoreTuneEvidencePromise = fetch(ONE_MORE_TUNE_EVIDENCE_URL, { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && data.cards && data.reasons) ONE_MORE_TUNE_EVIDENCE = data;
        return data;
      })
      .catch(() => null);
  }
  return oneMoreTuneEvidencePromise;
}

/**
 * What this card is still missing, and what the claim rests on.
 *
 * Absent evidence is not an error: the file is fetched on demand and a
 * catalogue painted before it lands simply shows the row without this panel.
 */
function oneMoreTuneEvidenceFor(cardId) {
  const lang = oneMoreTuneLanguage() === "zh" ? "zh" : "en";
  const entry = ONE_MORE_TUNE_EVIDENCE?.cards?.[cardId];
  if (!entry) return null;
  const blocked = (entry.blocked || [])
    .map((code) => ONE_MORE_TUNE_EVIDENCE.reasons?.[code]?.[lang] || "")
    .filter(Boolean);
  const evidence = (entry.evidence || []).map((item) => ({
    url: ONE_MORE_TUNE_EVIDENCE.sources?.[item.source]?.url || "",
    source: item.source,
    supports: item.supports?.[lang] || item.supports?.en || "",
  }));
  return blocked.length || evidence.length ? { blocked, evidence } : null;
}

/** Load the deck once. Every entry point that reads cards goes through this. */
/** The pinned sound a card is asked with, or null: a store preview or the song's own video. */
function oneMoreTuneQuestionSound(card) {
  const sound = card?.questionSound;
  if (sound?.provider === "preview" && /^https:\/\/[\w.-]+\//.test(String(sound.url || ""))) return sound;
  return null;
}

function oneMoreTuneEnsureDeck() {
  if (!oneMoreTuneDeckPromise) {
    oneMoreTuneDeckPromise = fetch(ONE_MORE_TUNE_DECK_URL, { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((deck) => {
        if (Array.isArray(deck?.units) && Array.isArray(deck?.cards) && deck.cards.length) {
          ONE_MORE_TUNE_ALL_UNITS = Object.freeze(deck.units);
          ONE_MORE_TUNE_ALL_CARDS = Object.freeze(deck.cards);
          const playable = deck.cards.filter((card) => card.product && card.film && oneMoreTuneQuestionSound(card));
          ONE_MORE_TUNE_CARDS = Object.freeze(playable);
          ONE_MORE_TUNE_UNITS = Object.freeze(deck.units.filter((unit) => playable.some((card) => card.unit === unit.id)));
          ONE_MORE_TUNE_DECK_VERSION = Number(deck.version) || 0;
        }
        return deck;
      })
      .catch(() => null);
  }
  return oneMoreTuneDeckPromise;
}

let oneMoreTuneState = null;
let oneMoreTuneResources = null;
let oneMoreTuneView = "challenge";
let oneMoreTuneSession = null;
let oneMoreTuneRound = null;
let oneMoreTuneKeynoteRound = null;
let oneMoreTuneLineRound = null;
let oneMoreTuneUndo = null;
let oneMoreTuneQuery = "";
let oneMoreTuneFilter = "all";
// The catalogue's own filters, which are not the shelf's: the shelf asks "what
// should I meet next", and the catalogue asks "where is the row for this song".
let oneMoreTuneSourceQuery = "";
let oneMoreTuneSourceUnit = "all";
let oneMoreTuneSourceStatus = "all";
let oneMoreTuneSourceEra = "all";
// The record whose spec pane is open, if any: the third column's subject.
let oneMoreTuneSourceOpen = "";

// One coordinator, one sounding source. Buffers are per card because a
// challenge round moves between cards, and they are per session because the
// files belong to the person, not to this deck.
let oneMoreTuneAudio = { context: null, buffers: new Map(), elements: new Map(), node: null, gate: null, stopTimer: null, playingCardId: "", wechatHooked: false, gateArmed: undefined, cueSource: "", cueStart: null, cueEnd: null, cueClockAt: null, discFrame: 0, discAt: 0, pendingCue: false };

// --- Storage -----------------------------------------------------------

function oneMoreTuneBlankCardRecord() {
  return {
    met: false,
    match: { right: 0, wrong: 0 },
    // The scheduler's own card object — ts-fsrs's `due`, `stability`,
    // `difficulty`, `state` and counters — or null for a card that has never
    // been graded cold. Nothing here is derived by hand.
    fsrs: null,
    // When this card comes back. Written by the scheduler on every cold grade,
    // and pulled forward when a person deliberately queues a missed card.
    dueAt: 0,
    lastGrade: "",
    practiceGrade: "",
    // The person's own audition of their own file: start/end in seconds, or
    // null while unknown. `auditioned` only becomes true when they set it.
    // `reason` is the judgement the person typed for the range, kept with it;
    // `reasonLogged` is the last one that reached the event log.
    quizClip: { start: null, end: null, auditioned: false, reason: "", reasonLogged: "" },
  };
}

/**
 * The store's own migration, run when a v2 record is opened.
 *
 * v2 scheduled with a labelled demo ladder: `stage` was a position on
 * [0, 1, 3, 7, 14] days and `dueAt` was that ladder's promise. The ladder is
 * gone and ts-fsrs is here, and a ladder position is not a memory state —
 * turning one into stability and difficulty would be a fiction no later reader
 * could tell from real history. So the migration keeps what was real: that the
 * card was met, the match tally, a clip the person set, and the date the card
 * was owed. It deletes the ladder position. The card's first cold grade under
 * FSRS starts its memory state from empty, which is exactly what it is.
 *
 * @returns {object|null} the record in the current shape, or null when the
 *   stored object is not a version this window can read.
 */
function oneMoreTuneMigrateState(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const version = Number(parsed.v);
  if (version !== 2 && version !== 3 && version !== ONE_MORE_TUNE_STATE_VERSION) return null;
  if (version === 3) return { ...parsed, v: ONE_MORE_TUNE_STATE_VERSION, round: null };
  if (version === ONE_MORE_TUNE_STATE_VERSION) return parsed;
  const cards = {};
  for (const [cardId, record] of Object.entries(parsed.cards || {})) {
    if (!record || typeof record !== "object") continue;
    const migrated = { ...record, fsrs: null };
    delete migrated.stage;
    cards[cardId] = migrated;
  }
  return { ...parsed, v: ONE_MORE_TUNE_STATE_VERSION, cards };
}

function oneMoreTuneBlankState() {
  return {
    v: ONE_MORE_TUNE_STATE_VERSION,
    cards: {},
    events: [],
    settings: { newPerDay: 5, dueBatch: 10 },
    round: null,
  };
}

function readOneMoreTuneState() {
  // The synchronous read, so the first paint already shows the person's cards.
  // oneMoreTuneHydrateState then asks the database and adopts whichever store
  // actually holds them.
  return oneMoreTuneNormalizeState(oneMoreTuneReadLocalState());
}

function oneMoreTuneStateNow() {
  if (!oneMoreTuneState) oneMoreTuneState = readOneMoreTuneState();
  return oneMoreTuneState;
}

function oneMoreTuneRecord(cardId) {
  const state = oneMoreTuneStateNow();
  if (!state.cards[cardId]) state.cards[cardId] = oneMoreTuneBlankCardRecord();
  return state.cards[cardId];
}

// --- Where the progress lives ------------------------------------------
//
// One record, one key, one writer. The database is asked for first; the older
// localStorage record is what a person already had, and what a browser with no
// database still gets. What was read is reported as a source, so the shelf can
// say which of the two is holding the progress instead of leaving a person to
// guess.
let oneMoreTuneDatabase = null;
let oneMoreTuneDatabasePromise = null;
// "database" once the round-tripped store is in use, "local" when the fallback
// is, "none" when neither would take a write, "unknown" before the first read.
let oneMoreTuneStorageSource = "unknown";
// The last thing that happened to the progress, said inside this window. The
// desk's own status line is behind the window on a phone, so an outcome that
// only reached it would be an outcome nobody saw.
let oneMoreTuneProgressNote = "";

function oneMoreTuneOpenDatabase() {
  if (oneMoreTuneDatabasePromise) return oneMoreTuneDatabasePromise;
  oneMoreTuneDatabasePromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined" || !indexedDB) {
      resolve(null);
      return;
    }
    let request = null;
    try {
      request = indexedDB.open(ONE_MORE_TUNE_DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ONE_MORE_TUNE_DB_STORE)) {
        database.createObjectStore(ONE_MORE_TUNE_DB_STORE);
      }
    };
    request.onsuccess = () => {
      oneMoreTuneDatabase = request.result;
      resolve(oneMoreTuneDatabase);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return oneMoreTuneDatabasePromise;
}

function oneMoreTuneDatabaseRead(database) {
  return new Promise((resolve) => {
    try {
      const request = database.transaction(ONE_MORE_TUNE_DB_STORE, "readonly")
        .objectStore(ONE_MORE_TUNE_DB_STORE)
        .get(ONE_MORE_TUNE_DB_RECORD);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function oneMoreTuneDatabaseWrite(database, state) {
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(ONE_MORE_TUNE_DB_STORE, "readwrite");
      transaction.objectStore(ONE_MORE_TUNE_DB_STORE)
        .put(JSON.parse(JSON.stringify(state)), ONE_MORE_TUNE_DB_RECORD);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function oneMoreTuneLocalWrite(state) {
  try {
    localStorage.setItem(ONE_MORE_TUNE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * Take the state that is actually on this machine, migrating the old record
 * forward and leaving it where it is.
 *
 * A brand-new visitor has neither, which is a normal first read rather than a
 * failure. A visitor who has been here before gets their cards whichever of the
 * two holds them — and when the database is the empty one, the localStorage
 * record is copied into it once and the database becomes the writer from then
 * on. The old record is not deleted: it is the only copy if the database ever
 * stops opening.
 */
async function oneMoreTuneHydrateState() {
  const database = await oneMoreTuneOpenDatabase();
  let stored = null;
  if (database) stored = await oneMoreTuneDatabaseRead(database);
  const fromDatabase = stored && typeof stored === "object";
  if (fromDatabase) oneMoreTuneStorageSource = "database";
  if (!fromDatabase) {
    const legacy = oneMoreTuneReadLocalState();
    if (legacy) {
      oneMoreTuneState = oneMoreTuneNormalizeState(legacy);
      if (database) {
        const wrote = await oneMoreTuneDatabaseWrite(database, oneMoreTuneState);
        oneMoreTuneStorageSource = wrote ? "database" : "local";
      } else {
        oneMoreTuneStorageSource = "local";
      }
      return { migrated: true };
    }
    oneMoreTuneStorageSource = database ? "database" : "local";
    return { migrated: false };
  }
  oneMoreTuneState = oneMoreTuneNormalizeState(stored);
  return { migrated: false };
}

function oneMoreTuneReadLocalState() {
  try {
    const raw = localStorage.getItem(ONE_MORE_TUNE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * A stored object in the shape this window renders: the version it can read,
 * every card of the current deck present, events capped.
 */
function oneMoreTuneNormalizeState(parsed) {
  const blank = oneMoreTuneBlankState();
  const readable = oneMoreTuneMigrateState(parsed);
  if (!readable) return blank;
  const cards = {};
  for (const card of ONE_MORE_TUNE_ALL_CARDS) {
    const stored = readable.cards?.[card.id];
    const base = oneMoreTuneBlankCardRecord();
    cards[card.id] = stored && typeof stored === "object"
      ? { ...base, ...stored, match: { ...base.match, ...stored.match }, quizClip: { ...base.quizClip, ...stored.quizClip } }
      : base;
  }
  return {
    ...blank,
    cards,
    events: Array.isArray(readable.events) ? readable.events.slice(-ONE_MORE_TUNE_EVENT_LIMIT) : [],
    settings: { ...blank.settings, ...readable.settings },
    round: oneMoreTuneReadableRound(readable.round),
  };
}

/**
 * A stored round cursor, or null.
 *
 * Only what a resume needs: which set, which question, and which mode. The
 * questions themselves are rebuilt from the set id — the deck is on this
 * device, so a set id plus a deck version is enough to name the same ten, which
 * is the property the share link already relies on.
 */
function oneMoreTuneReadableRound(value) {
  if (!value || typeof value !== "object") return null;
  const setId = String(value.setId || "");
  const deckVersion = Number(value.deckVersion || 0);
  const index = Number(value.index || 0);
  const mode = String(value.mode || "");
  if (!setId || !Number.isFinite(deckVersion) || deckVersion <= 0) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  return { setId, deckVersion, index, mode, startedAt: Number(value.startedAt || 0) };
}

function writeOneMoreTuneState() {
  const state = oneMoreTuneStateNow();
  if (oneMoreTuneDatabase) {
    void oneMoreTuneDatabaseWrite(oneMoreTuneDatabase, state).then((wrote) => {
      if (wrote) {
        oneMoreTuneStorageSource = "database";
        return;
      }
      // The database refused mid-session (quota, a revoked permission): keep
      // the older store working and say which one is holding the progress.
      oneMoreTuneStorageSource = oneMoreTuneLocalWrite(state) ? "local" : "none";
      oneMoreTuneReportStorage();
    });
    if (oneMoreTuneStorageSource === "database") return;
  }
  oneMoreTuneStorageSource = oneMoreTuneLocalWrite(state) ? "local" : "none";
  oneMoreTuneReportStorage();
}

/** Say out loud when nothing is being saved; a person can then export. */
function oneMoreTuneReportStorage() {
  if (oneMoreTuneStorageSource !== "none") return;
  oneMoreTuneProgressNote = t("one_more_tune_progress_not_saved");
  setStatus?.(oneMoreTuneProgressNote);
}

/** The outcome of an export or an import, said in this window and on the desk. */
function noteOneMoreTuneProgress(key, replacements = null) {
  let text = t(key);
  for (const [name, value] of Object.entries(replacements || {})) {
    text = text.replace(`{${name}}`, String(value));
  }
  oneMoreTuneProgressNote = text;
  setStatus?.(text);
}

/**
 * Which store is holding the progress, said plainly.
 *
 * The fallback is honest rather than silent: a person whose browser refused a
 * database should know their record is in the older store, and someone whose
 * browser refused both should know before they close the window.
 */
function oneMoreTuneStorageSourceKey() {
  if (oneMoreTuneStorageSource === "database") return "one_more_tune_progress_in_database";
  if (oneMoreTuneStorageSource === "local") return "one_more_tune_progress_in_local";
  if (oneMoreTuneStorageSource === "none") return "one_more_tune_progress_in_none";
  return "one_more_tune_progress_unknown";
}

// --- Taking the progress out, and putting it back -----------------------
//
// A visitor's study history is theirs, and it is the one thing here that gets
// lost when a browser clears its data, a person moves to another device, or a
// private window is closed. So it leaves as a file: versioned, readable, and
// validated on the way back in rather than trusted.

/** The file. One record per card, the event log, and what it belongs to. */
function oneMoreTuneExportPayload() {
  const state = oneMoreTuneStateNow();
  return {
    app: "one-more-tune",
    schema: ONE_MORE_TUNE_EXPORT_SCHEMA,
    stateVersion: ONE_MORE_TUNE_STATE_VERSION,
    deckVersion: ONE_MORE_TUNE_DECK_VERSION,
    exportedAt: new Date().toISOString(),
    cards: state.cards,
    events: state.events,
    settings: state.settings,
  };
}

function oneMoreTuneExportFileName() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `one-more-tune-progress-${stamp}.json`;
}

function downloadOneMoreTuneProgress() {
  try {
    const body = `${JSON.stringify(oneMoreTuneExportPayload(), null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = oneMoreTuneExportFileName();
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    noteOneMoreTuneProgress("one_more_tune_progress_exported");
  } catch {
    noteOneMoreTuneProgress("one_more_tune_progress_export_failed");
  }
  renderOneMoreTune();
}

/**
 * Read a file the person chose, and refuse anything it cannot vouch for.
 *
 * The checks are the ones the spec asks for and no more: the file has to be
 * this app's, its format must not be newer than this window understands, a date
 * may not come from the future (a clock that is wrong is a file that cannot be
 * trusted), events are deduplicated by their own id, and a card this deck does
 * not have is dropped rather than invented. What survives replaces the cards it
 * names and unions the log.
 *
 * @returns {{ ok: true, state: object, added: number, merged: number }|{ ok: false, reason: string }}
 */
function oneMoreTuneReadProgressFile(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(text || ""));
  } catch {
    return { ok: false, reason: "one_more_tune_progress_unreadable" };
  }
  if (!parsed || typeof parsed !== "object" || parsed.app !== "one-more-tune") {
    return { ok: false, reason: "one_more_tune_progress_not_ours" };
  }
  const schema = Number(parsed.schema);
  if (!Number.isInteger(schema) || schema < 1) return { ok: false, reason: "one_more_tune_progress_not_ours" };
  if (schema > ONE_MORE_TUNE_EXPORT_SCHEMA) return { ok: false, reason: "one_more_tune_progress_too_new" };
  const exportedAt = Number.isFinite(Date.parse(String(parsed.exportedAt || "")))
    ? Date.parse(String(parsed.exportedAt))
    : null;
  if (exportedAt === null) return { ok: false, reason: "one_more_tune_progress_no_date" };
  if (exportedAt > Date.now() + 24 * 60 * 60 * 1000) return { ok: false, reason: "one_more_tune_progress_from_future" };
  if (!parsed.cards || typeof parsed.cards !== "object") return { ok: false, reason: "one_more_tune_progress_not_ours" };

  const current = oneMoreTuneStateNow();
  const known = new Set(ONE_MORE_TUNE_ALL_CARDS.map((card) => card.id));
  const state = JSON.parse(JSON.stringify(current));
  let merged = 0;
  for (const [cardId, record] of Object.entries(parsed.cards)) {
    if (!known.has(cardId) || !record || typeof record !== "object") continue;
    const dueAt = Number(record.dueAt);
    state.cards[cardId] = {
      ...oneMoreTuneBlankCardRecord(),
      ...record,
      dueAt: Number.isFinite(dueAt) && dueAt >= 0 ? dueAt : 0,
      fsrs: record.fsrs && typeof record.fsrs === "object" ? record.fsrs : null,
    };
    merged += 1;
  }
  const seen = new Set(state.events.map((event) => String(event?.eventId || "")));
  let added = 0;
  for (const event of Array.isArray(parsed.events) ? parsed.events : []) {
    const eventId = String(event?.eventId || "");
    if (!eventId || seen.has(eventId)) continue;
    if (!Number.isFinite(Number(event?.at))) continue;
    seen.add(eventId);
    state.events.push(event);
    added += 1;
  }
  state.events = state.events.slice(-ONE_MORE_TUNE_EVENT_LIMIT);
  if (parsed.settings && typeof parsed.settings === "object") {
    state.settings = { ...state.settings, ...parsed.settings };
  }
  return { ok: true, state, added, merged };
}

function applyOneMoreTuneProgressFile(text) {
  const read = oneMoreTuneReadProgressFile(text);
  if (!read.ok) {
    noteOneMoreTuneProgress(read.reason);
    return false;
  }
  oneMoreTuneState = read.state;
  writeOneMoreTuneState();
  noteOneMoreTuneProgress("one_more_tune_progress_imported", { cards: read.merged, events: read.added });
  return true;
}

async function handleOneMoreTuneProgressFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    applyOneMoreTuneProgressFile(text);
    renderOneMoreTune();
  } catch {
    noteOneMoreTuneProgress("one_more_tune_progress_unreadable");
    renderOneMoreTune();
  }
}

/**
 * The review log is append-only and every entry carries the two facts that
 * decide whether it may ever be believed: which knowledge revision it graded
 * (and, for a recall, what the scheduler did with it), and whether a sound
 * actually reached the person. `eventId` exists so a double tap, a refresh or a
 * replayed handler cannot score the same answer twice.
 *
 * @param {{ type: string, cardId?: string, grade?: string, correct?: boolean, mediaPlayed?: boolean, tierSeconds?: number, points?: number }} entry
 */
function appendOneMoreTuneEvent(entry) {
  const state = oneMoreTuneStateNow();
  const event = {
    eventId: `omt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    demoOnly: true,
    mediaPlayed: entry.mediaPlayed === true,
    ...entry,
  };
  state.events.push(event);
  if (state.events.length > 500) state.events = state.events.slice(-500);
  writeOneMoreTuneState();
  return event;
}

// --- The deck, and what each card is ready for -------------------------

function oneMoreTuneCard(cardId) {
  return ONE_MORE_TUNE_ALL_CARDS.find((card) => card.id === cardId) || null;
}

function oneMoreTuneUnitCards(unitId) {
  return ONE_MORE_TUNE_CARDS.filter((card) => card.unit === unitId);
}

/**
 * Readiness is derived, never stored. Three separate conditions, in the order
 * the spec sets them out, each one adding to the last:
 *
 *   learn      — the association is settled and there is somewhere to send a
 *                person to see it. A film with no located segment is fine here;
 *                it is shown as unlocated rather than hidden.
 *   recall     — on top of that, the recording and the range the question
 *                actually plays have been listened through. Nothing in this
 *                deck ships that way; it becomes true for a card once the
 *                person auditions their own file and sets a range.
 *   challenge  — on top of that, the distractors have been reviewed for
 *                ambiguity, so a single scored attempt can be fair. No card in
 *                this deck has had that review, so scoring rounds are always
 *                labelled practice.
 *
 * @returns {{ learn: boolean, recall: boolean, challenge: boolean, reasons: string[] }}
 */
function oneMoreTuneReadiness(cardId) {
  const card = oneMoreTuneCard(cardId);
  const reasons = [];
  if (!card) return { learn: false, recall: false, challenge: false, reasons: ["one_more_tune_gate_unknown_card"] };

  const learn = Boolean(card.product && card.film);
  if (!learn) reasons.push("one_more_tune_gate_association_unsettled");

  const clip = oneMoreTuneRecord(cardId).quizClip;
  const auditioned = clip.auditioned === true && Number.isFinite(clip.start) && Number.isFinite(clip.end) && clip.end > clip.start;
  const recall = learn && auditioned;
  if (learn && !auditioned) reasons.push("one_more_tune_gate_not_auditioned");

  // choicesReviewedForReuse is false for every card in this deck, and it is not
  // a field a person can flip from the interface: reviewing whether the same
  // recording was also used by a distractor's product is editorial work.
  const challenge = recall && card.choicesReviewedForReuse === true;
  if (recall && !challenge) reasons.push("one_more_tune_gate_choices_unreviewed");

  return { learn, recall, challenge, reasons };
}

/**
 * The six appearances this desk already owns, oldest first. A card is dressed
 * in the interface language that shipped alongside it, which is a thing only
 * this desk can do: the deck runs 1999 to 2024 and the appearance ladder runs
 * 1988 to 2026. The six also happen to be the six stripes of the 1977 Apple
 * mark, which is where the era colours come from.
 *
 * `from` is the year the design prints beside each one — 1984 for the first,
 * the year the Macintosh shipped. The ladder below starts at 1976 instead, and
 * the two are different jobs: 1976 is the line where a year stops being a year
 * this deck could hold, while 1984 is what the era is called on the shelf.
 */
// The six eras, and the appearance each one is drawn in. The names are the
// Appearance names the rest of the desk already uses, so `theme` is the id of
// that Appearance: a reveal can put the desk into the era the card belongs to,
// and a contract can hold the two lists to each other rather than to a memory.
const ONE_MORE_TUNE_ERAS = Object.freeze([
  { id: "1", from: 1984, until: 1994, name: "System 6", theme: "classic" },
  { id: "2", from: 1995, until: 2000, name: "Platinum", theme: "platinum" },
  { id: "3", from: 2001, until: 2006, name: "Aqua", theme: "aqua" },
  { id: "4", from: 2007, until: 2011, name: "Snow Leopard", theme: "snow-leopard" },
  { id: "5", from: 2012, until: 2019, name: "Yosemite", theme: "yosemite" },
  { id: "6", from: 2020, until: Infinity, name: "Liquid Glass", theme: "liquid-glass" },
]);

/**
 * Which era a card belongs to, or "none" when its year is unknown. A third of
 * this deck's cards carry no year at all; they stay unplaced rather than being
 * rounded into a decade, because a guessed year would then dress the card in
 * an interface it never shared a room with.
 *
 * @returns {{ id: string, name: string, theme: string }}
 */
function oneMoreTuneEra(card) {
  // Number(null) is 0, and 0 is an integer, so coercing first placed every
  // yearless card in the era that ends in 1994 and printed "0 · System 6" on
  // the reveal. That is this deck's one unforgivable move — an unknown turned
  // into a zero — so the check refuses anything that is not already a number.
  const year = card?.year;
  // The ladder is open at the top and closed at the bottom: a year before Apple
  // existed is a data fault, not the earliest era, and it must not inherit
  // System 6 by being small.
  if (!Number.isInteger(year) || year < 1976) return { id: "none", name: "", theme: "" };
  const era = ONE_MORE_TUNE_ERAS.find((entry) => year <= entry.until);
  return era ? { id: era.id, name: era.name, theme: era.theme } : { id: "none", name: "", theme: "" };
}

/**
 * The era a finished round ended in: the one belonging to the last question
 * that was actually answered. A card whose year nobody knows has no era, so it
 * does not take the card's — the same refusal the reveal makes, kept here so
 * the poster can say nothing it cannot name.
 */
function oneMoreTuneRoundEra(round = oneMoreTuneRound) {
  const questions = Array.isArray(round?.questions) ? round.questions : [];
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    const question = questions[index];
    if (!question?.submitted) continue;
    const cardId = question.localAnswer || oneMoreTuneCardIdForReveal(question.reveal);
    const era = oneMoreTuneEra(oneMoreTuneCard(cardId));
    if (era.name) return era;
  }
  return null;
}

/**
 * The band that names a card's era beside its stripe. The words carry the
 * answer; the colour only agrees with them, so nothing here depends on being
 * able to tell six hues apart.
 */
function oneMoreTuneEraBand(card) {
  const era = oneMoreTuneEra(card);
  const label = era.id === "none"
    ? `<span data-i18n="one_more_tune_era_unknown">Era unknown</span>`
    : `${card.year} · ${oneMoreTuneEscape(era.name)}`;
  return `<span class="era-band" data-era="${era.id}"><b aria-hidden="true"></b>${label}</span>`;
}

function oneMoreTuneAnswerable(card) {
  return Boolean(card && card.product && card.film);
}

function oneMoreTuneDue(cardId, at = Date.now()) {
  const record = oneMoreTuneRecord(cardId);
  // `dueAt` is the one answer to "when does this come back": the scheduler
  // writes it with every cold grade, and a deliberate review pulls it forward.
  // Zero means nobody has scheduled this card yet — a card that was only met,
  // or only matched, is not a backlog item; it is the rest of the unit's work,
  // and the recall phase takes it after the due ones.
  return record.met && record.dueAt > 0 && record.dueAt <= at;
}

function oneMoreTuneDueCount() {
  const now = Date.now();
  return ONE_MORE_TUNE_CARDS.filter((card) => oneMoreTuneDue(card.id, now)).length;
}

function oneMoreTuneMetCount() {
  return ONE_MORE_TUNE_CARDS.filter((card) => oneMoreTuneRecord(card.id).met).length;
}

function oneMoreTuneShuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The recording a card is asked with, as one string.
 *
 * Two cards can carry the same store preview: the catalogue's record of a music
 * use and the editorial bank's record of the same use, written in another
 * language. They are one song heard once, and this is the key that says so —
 * their product labels cannot, because they spell it differently.
 */
function oneMoreTuneRecordingKey(card) {
  return String(card?.questionSound?.url || "").trim();
}

/**
 * Options for a matching or challenge question. Distractors are drawn from the
 * same kind of thing first — a keynote segment against other keynote segments,
 * a product ad against other product ads — because the spec's rule is that a
 * very specific right answer must not sit among three obviously unrelated ones.
 * A card's own sibling (the other song from the same film) is never a
 * distractor: both are correct for that film.
 */
function oneMoreTuneOptions(card, count = 4) {
  if (!card) return [];
  const others = ONE_MORE_TUNE_CARDS.filter((other) => other.id !== card.id
    && oneMoreTuneAnswerable(other)
    && other.product !== card.product
    && other.id !== card.siblingOf
    && other.siblingOf !== card.id
    && !(card.knowledgeGroup && other.knowledgeGroup === card.knowledgeGroup)
    && !(card.excludedAnswerLabels || []).includes(other.product)
    // Never the card's own recording under a second name: two labels for one
    // sound is a question with two right answers and one of them marked wrong.
    && !(oneMoreTuneRecordingKey(other) && oneMoreTuneRecordingKey(other) === oneMoreTuneRecordingKey(card)));
  const sameKind = others.filter((other) => other.kind === card.kind);
  const rest = others.filter((other) => other.kind !== card.kind);
  const pool = [...oneMoreTuneShuffle(sameKind), ...oneMoreTuneShuffle(rest)];
  const seen = new Set([card.product]);
  const distractors = [];
  for (const other of pool) {
    if (seen.has(other.product)) continue;
    seen.add(other.product);
    distractors.push(other);
    if (distractors.length >= count - 1) break;
  }
  return oneMoreTuneShuffle([card, ...distractors]);
}

/**
 * The label a question asks for. A keynote segment is asked about as a keynote
 * segment; the spec's warning is that a player quizzed on "which product" will
 * keep reaching for hardware even when the answer is a feature or an event.
 */
function oneMoreTunePromptKey(card) {
  if (card?.kind === "event_segment") return "one_more_tune_which_segment";
  if (card?.kind === "brand_film") return "one_more_tune_which_film";
  if (card?.kind === "feature_reveal" || card?.kind === "service_ad") return "one_more_tune_which_feature";
  return "one_more_tune_which_product";
}

// --- Grading -----------------------------------------------------------

/**
 * A grade moves the schedule only when the person recalled the card cold. If
 * this session already showed them the answer, the grade is kept as practice:
 * otherwise a card would graduate on the strength of having been read out loud
 * a minute earlier. The previous record is snapshotted first so the last
 * mis-tap can be taken back — self-assessment with no undo turns one slip into
 * a fortnight's wrong interval.
 *
 * A cold grade is `next()`: the scheduler returns the card's new state and the
 * log that explains it, and both are written into the record and the event.
 * `dueAt` is the projection every queue reads — written by the scheduler here,
 * and pulled forward when the person deliberately queues a card for review — so
 * there is still exactly one answer to "when does this come back".
 */
function oneMoreTuneGrade(cardId, gradeId, { mediaPlayed = false } = {}) {
  const grade = ONE_MORE_TUNE_GRADES.find((entry) => entry.id === gradeId);
  const card = oneMoreTuneCard(cardId);
  if (!grade || !card) return null;
  const record = oneMoreTuneRecord(cardId);
  oneMoreTuneUndo = { cardId, record: JSON.parse(JSON.stringify(record)), eventId: "" };

  const practiceOnly = Boolean(oneMoreTuneSession?.revealedThisSession?.has(cardId));
  const now = new Date();
  const before = oneMoreTuneScheduler ? JSON.parse(JSON.stringify(oneMoreTuneSchedulerCard(record, now))) : null;
  let scheduled = null;
  if (practiceOnly) {
    record.practiceGrade = grade.id;
  } else if (oneMoreTuneScheduler) {
    const rating = oneMoreTuneRating(grade.id);
    try {
      const outcome = oneMoreTuneScheduler.scheduler.next(oneMoreTuneSchedulerCard(record, now), now, rating);
      record.fsrs = outcome.card;
      record.dueAt = outcome.card.due.getTime();
      scheduled = outcome.card;
    } catch {
      scheduled = null;
    }
    record.lastGrade = grade.id;
  } else {
    // The library did not arrive. The grade is still the person's own judgement
    // and is kept as one; it simply schedules nothing, and both the event and
    // the button row say so instead of inventing a date.
    record.lastGrade = grade.id;
  }
  record.met = true;
  const event = appendOneMoreTuneEvent({
    type: practiceOnly ? "practice" : "recall",
    cardId,
    grade: grade.id,
    mediaPlayed,
    // The knowledge version this grade belongs to, and what the scheduler did
    // with it. A later revision of the same card can then be told apart from
    // this one without guessing.
    associationRevision: ONE_MORE_TUNE_DECK_VERSION,
    scheduled: Boolean(scheduled),
    dueAt: scheduled ? scheduled.due.getTime() : 0,
    before,
    after: scheduled ? JSON.parse(JSON.stringify(scheduled)) : null,
  });
  oneMoreTuneUndo.eventId = event.eventId;
  writeOneMoreTuneState();
  return { practiceOnly, event };
}

/**
 * Where one grade would put this card, as words.
 *
 * The four buttons used to share a single line of small print, so all four
 * offered the same information: none. A person choosing between "hard" and
 * "good" is choosing between two dates, and the honest way to ask is to show
 * both. The two dates are `repeat()`'s own — the same numbers a commit would
 * produce — rounded to the unit a person can compare, and the caption under the
 * row names the library they came from.
 */
function oneMoreTuneIntervalLabel(due, at = Date.now()) {
  if (!(due instanceof Date) || !Number.isFinite(due.getTime())) return "";
  const minutes = Math.max(1, Math.round((due.getTime() - at) / 60000));
  if (minutes < 60) {
    return `≈ ${minutes} ${t(minutes === 1 ? "one_more_tune_interval_minute" : "one_more_tune_interval_minutes")}`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `≈ ${hours} ${t(hours === 1 ? "one_more_tune_interval_hour" : "one_more_tune_interval_hours")}`;
  }
  const days = Math.round(hours / 24);
  return `≈ ${days} ${t(days === 1 ? "one_more_tune_interval_day" : "one_more_tune_interval_days")}`;
}

/** The four grade buttons, each carrying its own interval. */
function oneMoreTuneGradeButtons(cardId) {
  const previews = oneMoreTuneGradePreviews(cardId);
  return ONE_MORE_TUNE_GRADES.map((grade) => {
    const when = previews?.[grade.id]
      ? `<span class="mono">${oneMoreTuneEscape(oneMoreTuneIntervalLabel(previews[grade.id]))}</span>`
      : `<span data-i18n="one_more_tune_interval_unknown">date unavailable</span>`;
    return `<button class="rating" type="button" data-one-more-tune-grade="${grade.id}"><span data-i18n="${grade.labelKey}">${grade.id}</span><small>${when}</small></button>`;
  }).join("");
}

function undoOneMoreTuneGrade() {
  if (!oneMoreTuneUndo) return false;
  const state = oneMoreTuneStateNow();
  state.cards[oneMoreTuneUndo.cardId] = oneMoreTuneUndo.record;
  // The event is withdrawn rather than erased: an undone grade is a thing that
  // happened, and the log is append-only everywhere else.
  const event = state.events.find((entry) => entry.eventId === oneMoreTuneUndo.eventId);
  if (event) event.undone = true;
  oneMoreTuneUndo = null;
  writeOneMoreTuneState();
  return true;
}

// --- Time, and the refusal to guess it ---------------------------------

/**
 * The three kinds of time a card can carry, kept apart.
 *
 * `sourceAnchor` belongs to a film's timeline and says where to start looking.
 * `filmClip` would be where the music sits inside that film. `quizClip` is the
 * only one the player ever uses, and it belongs to a recording's timeline.
 * Copying any one into another is the mistake the spec names outright: a
 * keynote's 23:10 is not a song's 23:10.
 */
function oneMoreTuneTimes(cardId) {
  const card = oneMoreTuneCard(cardId);
  const clip = oneMoreTuneRecord(cardId).quizClip;
  return {
    sourceAnchor: Number.isFinite(card?.sourceAnchor) ? card.sourceAnchor : null,
    // Where the music sits inside the film. This was a hardcoded null for as
    // long as no card had one; OMT-060 now does, from a clip the film's own
    // music supervisor published on Apple's channel. It is the FILM's clock and
    // it is never the player's: a keynote's 19:18 is not a recording's 19:18,
    // and nothing below copies one into the other.
    filmClip: {
      start: Number.isFinite(card?.filmClip?.start) ? card.filmClip.start : null,
      end: Number.isFinite(card?.filmClip?.end) ? card.filmClip.end : null,
    },
    quizClip: {
      start: Number.isFinite(clip.start) ? clip.start : null,
      end: Number.isFinite(clip.end) ? clip.end : null,
      auditioned: clip.auditioned === true,
    },
  };
}

/**
 * The way back to the original film.
 *
 * This is a plain link to a visible YouTube page, not a hidden player: the
 * platform's policies forbid splitting audio off a video or covering the
 * player's own controls, and a guessing game is exactly where someone would be
 * tempted to. The film therefore belongs to the reveal and to the study face,
 * never to a question — the page title alone would give the answer away.
 *
 * The timestamp travels only when it was measured on THIS video. The reference
 * implementation this follows drops its start second whenever
 * reveal_start_video_id !== video_id, and it is right to: a position read off
 * one upload means nothing on a re-upload, a different cut, or a regional
 * replacement. Our five keynote anchors have no video id at all, so they get a
 * ledger row and no link rather than a link to a guess.
 *
 * @returns {{ href: string, anchor: number|null }|null}
 */
function oneMoreTuneWatchLink(card) {
  const videoId = String(card?.videoId || "");
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const anchorBound = card.anchorVideoId === videoId
    && Number.isInteger(card.sourceAnchor)
    && card.sourceAnchor >= 0;
  return {
    href: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${anchorBound ? `&t=${card.sourceAnchor}s` : ""}`,
    anchor: anchorBound ? card.sourceAnchor : null,
  };
}

/**
 * The film row, for the two faces that are allowed to show it. It says which
 * kind of position the link carries, because "jump to 28:10" and "the music
 * starts at 28:10" are not the same claim and only the first one is true here.
 */
/**
 * The player's side of the film and the song: two plain links, or nothing.
 * Whether a link was tested, where an anchor came from, which service it is —
 * that is the research, and it stays in 资料馆.
 */
function oneMoreTunePlainLinks(card) {
  const film = oneMoreTuneWatchLink(card);
  const links = [
    film ? `<a class="one-more-tune-watch" href="${oneMoreTuneEscape(film.href)}" target="_blank" rel="noopener noreferrer" data-i18n="one_more_tune_watch_plain">Watch the original</a>` : "",
    card?.song ? oneMoreTuneListenLink(card) : "",
  ].filter(Boolean);
  return links.length ? `<p class="one-more-tune-plain-links">${links.join(" · ")}</p>` : "";
}

function oneMoreTuneFilmRow(card) {
  const link = oneMoreTuneWatchLink(card);
  const alternates = oneMoreTuneFilmAlternates(card);
  if (!link) {
    return `<p class="hint one-more-tune-film-row" data-i18n="one_more_tune_no_film_link">No playable original is linked for this card yet.</p>${alternates}`;
  }
  const label = link.anchor === null ? "one_more_tune_watch_plain" : "one_more_tune_watch_at";
  const text = link.anchor === null
    ? ""
    : ` ${oneMoreTuneEscape(formatOneMoreTuneSeconds(link.anchor))}`;
  return `<p class="one-more-tune-film-row">
          <a class="one-more-tune-watch" href="${oneMoreTuneEscape(link.href)}" target="_blank" rel="noopener noreferrer"><span data-i18n="${label}">Watch the original</span>${text} <span aria-hidden="true">\u2197</span></a>
          <span class="hint" data-i18n="${link.anchor === null ? "one_more_tune_watch_note_plain" : "one_more_tune_watch_note_anchor"}">A source anchor, not a verified music in-point.</span>
        </p>${alternates}`;
}

/**
 * The other pages research kept for the same film.
 *
 * A single years-old upload is one region-lock, one takedown or one re-edit away
 * from being no page at all. The research side recorded backups — the production
 * company's page for Stroll, the director's for Snap — and they were sitting in
 * the package while the window offered only the one address. Each is labelled
 * with what it is: a page somebody else published, not this project's film.
 */
function oneMoreTuneFilmAlternates(card) {
  const pages = (card?.filmAlternates || []).filter((page) => page?.url);
  if (!pages.length) return "";
  const rows = pages.map((page) => {
    const label = page.label ? oneMoreTuneEscape(page.label) : oneMoreTuneEscape(page.provider || "");
    const state = page.playbackTested
      ? t("one_more_tune_music_tested")
      : t("one_more_tune_music_untested");
    return `<a href="${oneMoreTuneEscape(page.url)}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">\u2197</span></a><span class="hint">${oneMoreTuneEscape(state)}</span>`;
  }).join("");
  return `<p class="hint one-more-tune-film-alternates"><span data-i18n="one_more_tune_film_alternates">Other pages for this film:</span> ${rows}</p>`;
}

/**
 * Where the song itself can be heard.
 *
 * The reveal has always named the song and the artist; until now it gave a
 * person nowhere to go and listen to it. The research side recorded those
 * entries — an artist's own music video, a track page, a composer's library —
 * and every one of them carries `playback_tested: false`, so the row says that
 * instead of implying the link plays. Spotify's entries travel as references and
 * say so: the platform's policy does not permit this game to use its player.
 */
function oneMoreTuneMusicRow(card) {
  const entry = card?.musicEntry;
  if (!entry?.url) return "";
  const provider = entry.provider || "";
  const stateKey = entry.playbackTested ? "one_more_tune_music_tested" : "one_more_tune_music_untested";
  const reference = entry.use === "reference_only"
    ? `<span class="hint" data-i18n="one_more_tune_music_reference_only">${oneMoreTuneEscape(t("one_more_tune_music_reference_only"))}</span>`
    : "";
  return `<p class="one-more-tune-music-row">
          <a class="one-more-tune-listen" href="${oneMoreTuneEscape(entry.url)}" target="_blank" rel="noopener noreferrer"><span data-i18n="one_more_tune_listen_song">Listen to the song</span>${provider ? ` <span class="hint">${oneMoreTuneEscape(provider)}</span>` : ""} <span aria-hidden="true">\u2197</span></a>
          <span class="hint" data-i18n="${stateKey}">${oneMoreTuneEscape(t(stateKey))}</span>
          ${reference}
        </p>`;
}

/**
 * The reveal's own player, offered beside the link rather than instead of it.
 *
 * The embed only exists after a click, so a question face — which never renders
 * this at all — cannot leak through a preloaded frame, and the link is always
 * there for a region or a video that refuses to be embedded.
 */
function formatOneMoreTuneSeconds(value) {
  if (!Number.isFinite(value)) return t("one_more_tune_time_unknown");
  const total = Math.max(0, Math.round(value));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// --- The players ---------------------------------------------------------
//
// Two players, one mechanism: YouTube's own IFrame API.
//
// An earlier version wrote the player's handshake by hand — postMessage a
// `listening` event, guess the state envelope, hope the frame was past
// about:blank. That worked sometimes and silently did nothing other times. The
// API does all of it by construction: onReady, onStateChange, playVideo, and it
// owns the autoplay gesture rules too. The grant it needs is one script host
// (see the CSP), and the player it builds is the privacy-enhanced one.
//
// The deck keeps its own promise either way: nothing sounds before a person
// presses, a listen is only recorded when the platform says it is playing, and
// every refusal is named rather than left as a black rectangle.

const ONE_MORE_TUNE_YT_API = "https://www.youtube.com/iframe_api";
const ONE_MORE_TUNE_YT_ORIGIN = "https://www.youtube-nocookie.com";
const ONE_MORE_TUNE_FILM_READY_MS = 6000;

const oneMoreTuneVideo = { player: null, slotId: "", videoId: "", ready: false, pending: null, playerState: null, lastEvent: "", mounting: null };
let oneMoreTuneYouTubeApiPromise = null;

/** Load the IFrame API once. Resolves to null when it cannot be had. */
function oneMoreTuneEnsureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (oneMoreTuneYouTubeApiPromise) return oneMoreTuneYouTubeApiPromise;
  oneMoreTuneYouTubeApiPromise = new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const previous = window.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    window.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } catch {
        // A previous handler that throws must not cost us the API.
      }
      finish(window.YT || null);
    };
    const script = document.createElement("script");
    script.src = ONE_MORE_TUNE_YT_API;
    script.async = true;
    script.addEventListener("error", () => finish(null));
    document.head.appendChild(script);
    // Offline, blocked, or slow: the caller falls back to the plain frame.
    setTimeout(() => finish(window.YT || null), ONE_MORE_TUNE_FILM_READY_MS);
  });
  return oneMoreTuneYouTubeApiPromise;
}

function oneMoreTuneVideoState() {
  return {
    slotId: oneMoreTuneVideo.slotId,
    ready: oneMoreTuneVideo.ready,
    playerState: oneMoreTuneVideo.playerState,
    lastEvent: oneMoreTuneVideo.lastEvent,
  };
}

/** Destroy whatever player or frame is mounted. */
function oneMoreTuneUnmountVideo() {
  try {
    oneMoreTuneVideo.player?.destroy?.();
  } catch {
    // A player that is already gone is the state we wanted.
  }
  oneMoreTuneVideo.player = null;
  oneMoreTuneVideo.mounting = null;
  const slot = oneMoreTuneVideo.slotId ? document.getElementById(oneMoreTuneVideo.slotId) : null;
  if (slot) {
    slot.innerHTML = "";
    slot.hidden = true;
    delete slot.dataset.oneMoreTuneSrc;
  }
  oneMoreTuneVideo.slotId = "";
  oneMoreTuneVideo.videoId = "";
  oneMoreTuneVideo.ready = false;
  oneMoreTuneVideo.pending = null;
  oneMoreTuneVideo.playerState = null;
  oneMoreTuneVideo.lastEvent = "";
}

/** The plain, controls-and-all frame: the fallback when the API cannot load. */
function oneMoreTuneVideoFrame(src) {
  return `<iframe title="${oneMoreTuneEscape(t("one_more_tune_film_title"))}"
      src="${oneMoreTuneEscape(src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

/**
 * Mount a player into a slot and, once it is ready, run `action`.
 *
 * `action` receives the YT player, so callers say what to do (seek and play)
 * without caring whether the player existed a moment ago.
 */
async function oneMoreTuneMountPlayer(slotId, { videoId, startSeconds = 0, playWhenReady = false, onPlaying } = {}) {
  const slot = document.getElementById(slotId);
  if (!slot || !/^[\w-]{11}$/.test(String(videoId || ""))) return false;
  // Already the same player, playing the same film: leave it alone, it may be
  // mid-song. A *different* film in the same slot is not the same player — the
  // window is one window and the card changes under it, so the old video has to
  // be torn down or the next card's film would never be heard.
  if (oneMoreTuneVideo.slotId === slotId && oneMoreTuneVideo.videoId === videoId && oneMoreTuneVideo.player) {
    if (playWhenReady) oneMoreTuneVideoPlayerPlay(startSeconds);
    return true;
  }
  // A second press while the first is still building the player must not
  // destroy the one being built: it waits for it instead.
  if (oneMoreTuneVideo.mounting) {
    await oneMoreTuneVideo.mounting.catch(() => {});
    if (oneMoreTuneVideo.slotId === slotId && oneMoreTuneVideo.videoId === videoId && oneMoreTuneVideo.player) {
      if (playWhenReady) oneMoreTuneVideoPlayerPlay(startSeconds);
      return true;
    }
  }
  oneMoreTuneUnmountVideo();
  oneMoreTuneVideo.slotId = slotId;
  oneMoreTuneVideo.videoId = String(videoId);
  slot.hidden = false;
  const api = await oneMoreTuneEnsureYouTubeApi();
  if (!api?.Player || !document.getElementById(slotId)) {
    // No API: show the frame itself, with its own controls. Nothing is hidden,
    // and the person can still hear the song.
    const origin = typeof location === "undefined" ? "" : location.origin;
    slot.innerHTML = oneMoreTuneVideoFrame(`${ONE_MORE_TUNE_YT_ORIGIN}/embed/${encodeURIComponent(videoId)}?rel=0&playsinline=1&origin=${encodeURIComponent(origin)}`);
    return false;
  }
  // The page is served with Referrer-Policy: no-referrer, and an iframe the
  // API builds for itself inherits it — YouTube then sees no Referer and
  // refuses with error 153. So the frame is ours, carrying its own referrer
  // policy, and the API attaches to it.
  const origin = typeof location === "undefined" ? "" : location.origin;
  slot.innerHTML = oneMoreTuneVideoFrame(`${ONE_MORE_TUNE_YT_ORIGIN}/embed/${encodeURIComponent(videoId)}?enablejsapi=1&rel=0&playsinline=1&modestbranding=1&origin=${encodeURIComponent(origin)}`);
  const frame = slot.querySelector("iframe");
  const mounting = new Promise((resolve) => {
    oneMoreTuneVideo.player = new api.Player(frame, {
      events: {
        onReady: () => {
          oneMoreTuneVideo.ready = true;
          oneMoreTuneVideo.lastEvent = "onReady";
          // A player built inside the press that wanted it can start now: this
          // is the gesture YouTube's own API document describes.
          if (playWhenReady) oneMoreTuneVideoPlayerPlay(startSeconds);
          resolve(true);
        },
        onStateChange: (event) => {
          const state = Number(event?.data);
          if (Number.isFinite(state)) {
            oneMoreTuneVideo.playerState = state;
            const slotEl = document.getElementById(slotId);
            if (slotEl) slotEl.dataset.oneMoreTunePlayerState = String(state);
          }
          oneMoreTuneVideo.lastEvent = "onStateChange";
          // 1 is playing: the platform's own statement that sound is coming
          // out, and the only moment a listen may be recorded.
          if (state === 1 && typeof onPlaying === "function") onPlaying();
        },
        onError: (event) => {
          const code = Number(event?.data);
          oneMoreTuneVideo.lastEvent = "onError";
          if (code === 153) oneMoreTuneFilmNote("one_more_tune_film_origin_refused");
          else if (code === 101 || code === 150) oneMoreTuneFilmNote("one_more_tune_film_not_embeddable");
          else if (code === 100) oneMoreTuneFilmNote("one_more_tune_film_gone");
          else oneMoreTuneFilmNote("one_more_tune_film_no_word");
          resolve(false);
        },
      },
    });
  });
  oneMoreTuneVideo.mounting = mounting;
  const mounted = await mounting;
  oneMoreTuneVideo.mounting = null;
  return mounted;
}

/** Ask the mounted player to do something, waiting for it if it is not ready. */
function oneMoreTuneVideoRun(action) {
  if (oneMoreTuneVideo.ready) {
    action();
    return true;
  }
  oneMoreTuneVideo.pending = action;
  return false;
}

function oneMoreTuneVideoPlayerPlay(startSeconds) {
  const player = oneMoreTuneVideo.player;
  if (!player) return;
  try {
    player.seekTo(Number.isFinite(startSeconds) ? startSeconds : 0, true);
    player.playVideo();
  } catch {
    oneMoreTuneFilmNote("one_more_tune_film_no_word");
  }
}

function oneMoreTuneFilmSlot() {
  return document.getElementById(oneMoreTuneVideo.slotId || "");
}

function oneMoreTuneFilmNote(messageKey) {
  const slot = document.getElementById("one-more-tune-film-note");
  if (!slot) return;
  slot.hidden = false;
  slot.dataset.i18n = messageKey;
  slot.textContent = t(messageKey);
}

/* --- The film window ----------------------------------------------------
 *
 * The original is watched in a window of its own, centered on the work area,
 * because that is what a desk does with a film: the quiz keeps its own window,
 * the film gets one, and the two can be moved, stacked and closed apart. The
 * first build pasted a 16:9 player into the middle of the reveal, which made a
 * slab of the answer card and left the film inside an application that is about
 * questions.
 *
 * It is the same application: same app id, so one MultiFinder entry, one
 * lifecycle, one lazy module, and closing the desk's window closes the film.
 */
const ONE_MORE_TUNE_FILM_WINDOW = "oneMoreTuneFilm";
const ONE_MORE_TUNE_FILM_STAGE = "one-more-tune-film-stage";
const ONE_MORE_TUNE_NETWORK_KEY = "ai-system6-one-more-tune-network";
const ONE_MORE_TUNE_NETWORK_TTL_MS = 6 * 60 * 60 * 1000;
// Where the person who made this wants to be found. The card is the one thing
// that travels without a link around it, so the address travels on the card.
const ONE_MORE_TUNE_BILIBILI = "space.bilibili.com/544081956";

/**
 * Can this network reach YouTube at all?
 *
 * Some of the originals this deck points at live on YouTube, and on a network
 * that cannot reach it — mainland China, a school filter, a country where the
 * platform is blocked — the embed is not a slow load, it is a black rectangle
 * that never resolves. Asking costs one embed load with a short ceiling, the
 * answer is remembered for the session, and everything after it is decided
 * without making a reader wait for a frame that will never arrive.
 *
 * It is asked lazily: only when somebody actually asks to watch a film. Nothing
 * at boot, nothing during a round, nothing for a reader who never opens one.
 */
let oneMoreTuneNetwork = null;

function oneMoreTuneNetworkCache() {
  if (oneMoreTuneNetwork) return oneMoreTuneNetwork;
  try {
    const raw = sessionStorage.getItem(ONE_MORE_TUNE_NETWORK_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.youtube === "boolean" && Date.now() - Number(parsed.at || 0) < ONE_MORE_TUNE_NETWORK_TTL_MS) {
      oneMoreTuneNetwork = { youtube: parsed.youtube, at: Number(parsed.at || 0), probed: false };
    }
  } catch {
    // A browser that refuses storage simply asks again.
  }
  return oneMoreTuneNetwork;
}

function oneMoreTuneRememberNetwork(youtube) {
  oneMoreTuneNetwork = { youtube, at: Date.now(), probed: true };
  try {
    sessionStorage.setItem(ONE_MORE_TUNE_NETWORK_KEY, JSON.stringify({ youtube, at: oneMoreTuneNetwork.at }));
  } catch {
    // Storage is a convenience here, never the record.
  }
  return youtube;
}

/** Does a YouTube embed page load on this network? Resolves false on the ceiling. */
function oneMoreTuneProbeYouTube(timeoutMs = 2500) {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      frame.remove();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    frame.setAttribute("aria-hidden", "true");
    frame.hidden = true;
    frame.referrerPolicy = "no-referrer";
    // A player page, not an autoplay: this asks whether the host is reachable,
    // and the answer is the frame's own load event.
    frame.src = `${ONE_MORE_TUNE_YT_ORIGIN}/embed/GDqnzW8nP0A?playsinline=1`;
    frame.addEventListener("load", () => finish(true), { once: true });
    frame.addEventListener("error", () => finish(false), { once: true });
    document.body.appendChild(frame);
  });
}

/** What this session knows about the two hosts a film needs. */
async function oneMoreTuneYouTubeReachable() {
  const cached = oneMoreTuneNetworkCache();
  if (cached) return cached.youtube;
  return oneMoreTuneRememberNetwork(await oneMoreTuneProbeYouTube());
}

function installOneMoreTuneFilmWindow() {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector(`[data-window="${ONE_MORE_TUNE_FILM_WINDOW}"]`);
  if (existing) return existing;
  const win = window.AISystem6ApplicationShell.createWindow({
    windowName: ONE_MORE_TUNE_FILM_WINDOW,
    windowClass: "one-more-tune-film-window",
    labelledBy: "one-more-tune-film-title",
    titleTag: "h1",
    // Replaced with the film's own name the moment one opens; this is what the
    // title bar says in the second before that.
    title: t("one_more_tune_watch_here"),
    statusClass: "compact-status-bar",
    statusHtml: `
          <span class="status-bar-leading" id="one-more-tune-film-status"></span>
          <span class="status-bar-trailing" id="one-more-tune-film-card"></span>`,
    paneClass: "one-more-tune-film-pane",
    paneHtml: `
          <div class="one-more-tune-film-stage" id="${ONE_MORE_TUNE_FILM_STAGE}"></div>
          <p class="hint one-more-tune-film-note" id="one-more-tune-film-note" hidden></p>
          <p class="one-more-tune-film-foot">
            <span id="one-more-tune-film-card-line"></span>
            <a class="linkbutton" id="one-more-tune-film-link" href="#" target="_blank" rel="noopener noreferrer" data-i18n="one_more_tune_watch_plain">Watch the original</a>
          </p>`,
  });
  // A film playing behind a closed window is sound with nothing on screen to
  // stop it. Every way of closing — the box, the File menu, ⌘W, the sidebar
  // sweep — ends in the same `is-hidden`, so the window watches its own class
  // rather than the manager being taught about one more application.
  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => {
      if (win.classList.contains("is-hidden")) stopOneMoreTuneFilm();
    });
    observer.observe(win, { attributes: true, attributeFilter: ["class"] });
  }
  return win;
}

/**
 * Open (or re-open) the film window on one card's original.
 *
 * Re-opening is the same window: the title, the credit line and the link are
 * rewritten, and the player is rebuilt only when the film is a different one.
 */
async function openOneMoreTuneFilmWindow(card, { videoId, startSeconds = 0 } = {}) {
  const win = installOneMoreTuneFilmWindow();
  if (!win) return false;
  const heading = win.querySelector(".title-bar h1, .title-bar h2");
  if (heading) heading.textContent = String(card?.film || t("one_more_tune_watch_here"));
  const status = win.querySelector("#one-more-tune-film-status");
  if (status) status.textContent = [card?.song, card?.artist].filter(Boolean).join(" — ");
  const cardLine = win.querySelector("#one-more-tune-film-card-line");
  if (cardLine) cardLine.textContent = [card?.product, card?.film].filter(Boolean).join(" · ");
  const link = win.querySelector("#one-more-tune-film-link");
  const watch = oneMoreTuneWatchLink(card);
  if (link) {
    if (watch?.href) {
      link.href = watch.href;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  }
  await openWindow(ONE_MORE_TUNE_FILM_WINDOW);
  // A network that cannot reach the platform gets the honest state rather than
  // a player that never paints: the film is named, the ways to it are listed,
  // and the game's own sound (which never comes from here) is unaffected.
  if (!await oneMoreTuneYouTubeReachable()) {
    oneMoreTuneUnmountVideo();
    oneMoreTuneFilmNote("one_more_tune_film_blocked");
    return true;
  }
  const mounted = await oneMoreTuneMountPlayer(ONE_MORE_TUNE_FILM_STAGE, {
    videoId,
    startSeconds: Number.isFinite(startSeconds) ? startSeconds : 0,
    playWhenReady: true,
  });
  if (!mounted) oneMoreTuneFilmNote("one_more_tune_film_no_word");
  oneMoreTuneInstanceResources().add(stopOneMoreTuneFilm, "one-more-tune-film-stop");
  return true;
}

/** The reveal's own player, offered beside the link rather than instead of it. */
async function playOneMoreTuneFilm(button) {
  const videoId = button?.dataset?.oneMoreTuneVideoId || "";
  const start = Number(button?.dataset?.oneMoreTuneStart || 0);
  if (!videoId) return;
  const card = oneMoreTuneCard(oneMoreTuneCardIdForReveal(oneMoreTuneQuestion()?.reveal));
  button.disabled = true;
  try {
    await openOneMoreTuneFilmWindow(card, { videoId, startSeconds: Number.isFinite(start) ? start : 0 });
  } finally {
    // The press opens a window rather than consuming itself: the same button is
    // how somebody looks at the film again.
    button.disabled = false;
  }
}

/** Unmounting is what stops it; the API has no other handle once destroyed. */
function stopOneMoreTuneFilm() {
  oneMoreTuneUnmountVideo();
}

/*
 * A question whose sound is the song's own video.
 *
 * The player is visible with YouTube's controls, the way the platform requires,
 * and the film of the ad never appears here: an ad shows the product, which is
 * the answer. What the player does show is the song's title — which the package
 * accepts, on the condition that the question is still about the product.
 */
function oneMoreTuneSongEmbed(question) {
  const media = question?.media || {};
  if (media.provider !== "youtube") return "";
  oneMoreTuneVideo.slotId = "one-more-tune-question-film";
  return `<div class="one-more-tune-film one-more-tune-song" id="one-more-tune-question-film" hidden></div>`;
}

/** Play (or replay) the question's song video, bounded to its cue window. */
/**
 * Update only what the player's own report changes.
 *
 * Re-rendering the face would destroy the player that is currently singing —
 * the most expensive possible way to show a new listen count. The count and the
 * tag are the parts that move, so they are the parts touched.
 */
function oneMoreTuneRefreshPlayerChrome() {
  const question = oneMoreTuneQuestion();
  if (!question) return;
  const badge = document.querySelector(".one-more-tune-window [data-disc-heard]");
  if (badge) badge.textContent = question.everHeard ? `${String(question.heard).padStart(2, "0")} ×` : "— : —";
  const tag = document.querySelector(".one-more-tune-window .sectiontag .tag");
  if (tag && question.everHeard) {
    tag.classList.add("green");
    tag.textContent = t("one_more_tune_tag_listened");
  }
}

async function playOneMoreTuneSong(question) {
  const media = question?.media || {};
  const start = Number.isFinite(media.startSeconds) ? Math.floor(media.startSeconds) : 0;
  return oneMoreTuneMountPlayer("one-more-tune-question-film", {
    videoId: media.videoId,
    startSeconds: start,
    playWhenReady: true,
    onPlaying: () => {
      const current = oneMoreTuneQuestion();
      if (!current || oneMoreTuneVideo.slotId !== "one-more-tune-question-film") return;
      current.mediaFailed = false;
      current.everHeard = true;
      current.heard = Math.max(1, current.heard + 1);
      oneMoreTuneRefreshPlayerChrome();
    },
  });
}

/**
 * "Hear the whole song", which the design asks the reveal to offer.
 *
 * It goes to a music service, never to a file we host: this deck holds a licence
 * for nothing. When a card carries a resolved catalogue entry the link is that
 * recording; when it does not, the link is a search for the song and artist, so
 * the person can still find it without this page claiming which pressing the ad
 * used — the very distinction the package writes down for 《I Am the Greatest》
 * and the two 《Come Rain Or Come Shine》 recordings.
 */
/**
 * Which Apple Music storefront a reader is sent to.
 *
 * Apple serves a store item at the storefront it resolves the reader to and
 * sends every other storefront's address to that storefront's *home* page. A
 * hard-coded `/us/` therefore took a reader in Taiwan to "New" — which is also
 * why the Music app opened onto an empty Search pane instead of the recording.
 *
 * A page cannot see Apple's own answer, so it uses the two hints it has: where
 * the reader is (the time zone — an English browser with a Taiwan account is
 * ordinary) and, when that zone is not in the table, the language. `us` is the
 * fallback for a reader who says neither.
 */
const ONE_MORE_TUNE_ZONE_STOREFRONTS = Object.freeze({
  "Asia/Taipei": "tw",
  "Asia/Shanghai": "cn", "Asia/Chongqing": "cn", "Asia/Harbin": "cn", "Asia/Urumqi": "cn",
  "Asia/Hong_Kong": "hk", "Asia/Macau": "mo",
  "Asia/Tokyo": "jp", "Asia/Seoul": "kr", "Asia/Singapore": "sg",
  "Asia/Kuala_Lumpur": "my", "Asia/Bangkok": "th", "Asia/Jakarta": "id",
  "Asia/Manila": "ph", "Asia/Kolkata": "in", "Asia/Dubai": "ae",
  "Europe/London": "gb", "Europe/Berlin": "de", "Europe/Paris": "fr",
  "Europe/Madrid": "es", "Europe/Rome": "it", "Europe/Amsterdam": "nl",
  "Europe/Stockholm": "se", "Europe/Zurich": "ch",
  "America/New_York": "us", "America/Chicago": "us", "America/Denver": "us",
  "America/Los_Angeles": "us", "America/Anchorage": "us", "Pacific/Honolulu": "us",
  "America/Toronto": "ca", "America/Vancouver": "ca", "America/Sao_Paulo": "br",
  "America/Mexico_City": "mx", "Australia/Sydney": "au", "Australia/Perth": "au",
  "Pacific/Auckland": "nz",
});

function oneMoreTuneStorefront() {
  let zone = "";
  try {
    zone = String(Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || "");
  } catch {
    zone = "";
  }
  const byZone = ONE_MORE_TUNE_ZONE_STOREFRONTS[zone];
  if (byZone) return byZone;
  const region = String(navigator?.language || "").split("-")[1] || "";
  return /^[A-Za-z]{2}$/.test(region) ? region.toLowerCase() : "us";
}

// The recording's own store page, once Apple's catalogue has named it. Nothing
// here invents an id: a card the catalogue cannot resolve keeps the search link,
// and the two are labelled differently so the page never claims more than it has.
const oneMoreTuneListenCache = new Map();

function oneMoreTuneListenKey(card) {
  const song = String(card?.song || "").trim().toLowerCase();
  const artist = String(card?.artist || "").trim().toLowerCase();
  return `${song}\u0000${artist}\u0000${oneMoreTuneStorefront()}`;
}

/**
 * The best catalogue match for a card, or null.
 *
 * The store's search answers with several pressings of the same song; the deck's
 * own rule is that an unresolved pressing must not be claimed, so a match has to
 * agree on the artist and share the recording's words before it is used.
 */
function oneMoreTuneBestSongMatch(results, card) {
  const normal = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const song = normal(card?.song);
  const artist = normal(card?.artist);
  if (!song || !artist) return null;
  const scored = [];
  for (const track of Array.isArray(results) ? results : []) {
    if (track?.wrapperType !== "track" || track?.kind !== "song") continue;
    if (!track.trackViewUrl || !track.trackId || !track.collectionId) continue;
    const trackArtist = normal(track.artistName);
    if (trackArtist && !trackArtist.includes(artist) && !artist.includes(trackArtist)) continue;
    const trackSong = normal(track.trackName);
    const sameWords = trackSong === song
      || (song.length > 6 && (trackSong.includes(song) || song.includes(trackSong)));
    if (!sameWords) continue;
    scored.push({ track, exact: trackSong === song ? 1 : 0, primary: track.collectionArtistName ? 1 : 0 });
  }
  scored.sort((left, right) => (right.exact - left.exact) || (right.primary - left.primary));
  return scored[0]?.track || null;
}

/** Apple's own store URL with the reader's storefront put back in. */
function oneMoreTuneStoreUrl(track, storefront = oneMoreTuneStorefront()) {
  const raw = String(track?.trackViewUrl || "");
  const match = /^https:\/\/music\.apple\.com\/[a-z]{2}\/(album\/[^?]+)(\?(.*))?$/.exec(raw);
  if (!match) return "";
  const query = String(match[3] || "").split("&").filter((part) => part && !/^uo=/.test(part)).join("&");
  return `https://music.apple.com/${storefront}/${match[1]}${query ? `?${query}` : ""}`;
}

/**
 * Ask Apple's catalogue what this card's store page is.
 *
 * A search URL is not a way into the Music app: macOS opens the app onto an
 * empty Search pane, because the app handles store *items*, not web search. The
 * store's public Search API names the item, and that page is what both the
 * browser and the app open. It is asked for the reader's storefront first, and
 * again without one when that storefront does not carry the recording — the
 * item ids are the same everywhere, so the page is still the reader's own.
 */
async function oneMoreTuneLookupListenUrl(card) {
  const key = oneMoreTuneListenKey(card);
  if (oneMoreTuneListenCache.has(key)) return oneMoreTuneListenCache.get(key);
  const term = encodeURIComponent(`${card?.song || ""} ${card?.artist || ""}`.trim());
  if (!term) return "";
  const storefront = oneMoreTuneStorefront();
  for (const country of [`&country=${storefront}`, ""]) {
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5${country}`, { credentials: "omit" });
      if (!response.ok) continue;
      const payload = await response.json();
      const track = oneMoreTuneBestSongMatch(payload?.results, card);
      const url = oneMoreTuneStoreUrl(track, storefront);
      if (url) {
        oneMoreTuneListenCache.set(key, url);
        return url;
      }
    } catch {
      // Offline, blocked, or refused: the search link stays, which is what the
      // card had before this lookup existed.
    }
  }
  oneMoreTuneListenCache.set(key, "");
  return "";
}

/**
 * Upgrade whatever listen links are on screen, once the catalogue answers.
 *
 * The face paints immediately with the search link, so nothing waits on the
 * network; when the item is known the link becomes the store page and says so.
 */
async function oneMoreTuneUpgradeListenLinks() {
  const links = [...(oneMoreTuneRoot()?.querySelectorAll("a[data-one-more-tune-listen]") || [])];
  for (const link of links) {
    const [song, artist] = String(link.dataset.oneMoreTuneListen || "").split("\u0001");
    const card = ONE_MORE_TUNE_ALL_CARDS.find((entry) => entry.song === song && entry.artist === artist) || { song, artist };
    const url = await oneMoreTuneLookupListenUrl(card);
    if (!url || !link.isConnected) continue;
    link.href = url;
    link.dataset.i18n = "one_more_tune_listen_full";
    link.textContent = t("one_more_tune_listen_full");
  }
}

function oneMoreTuneListenLink(card) {
  const resolved = typeof card?.listenUrl === "string" && /^https:\/\//.test(card.listenUrl) ? card.listenUrl : "";
  const query = encodeURIComponent(`${card?.song || ""} ${card?.artist || ""}`.trim());
  const href = resolved || `https://music.apple.com/${oneMoreTuneStorefront()}/search?term=${query}`;
  const labelKey = resolved ? "one_more_tune_listen_full" : "one_more_tune_listen_search";
  const identity = `${String(card?.song || "")}\u0001${String(card?.artist || "")}`;
  return `<a class="link-ish" href="${oneMoreTuneEscape(href)}" target="_blank" rel="noopener noreferrer" data-i18n="${labelKey}" data-one-more-tune-listen="${oneMoreTuneEscape(identity)}">Hear the whole song</a>`;
}

/**
 * Set the person's own in-point. Nothing here ever writes a value the person
 * did not give: passing 0 is how a confirmed "from the very beginning" is
 * recorded, and it can only arrive from a control they pressed.
 */
/**
 * Save an audition range, and the judgement behind it.
 *
 * The package's editor ask is that a range is a person's decision about a
 * recording and a film, recorded with what it rests on: "保存修改和修订理由".
 * So a range that changes writes an event with the two ends, whether the range
 * is a range yet, and the reason the person typed — the clipboard keeps the
 * edit, the event keeps the argument, and the event log is append-only, so a
 * later range does not erase the earlier reasoning.
 */
function setOneMoreTuneQuizClip(cardId, { start, end, reason }) {
  const record = oneMoreTuneRecord(cardId);
  const clip = record.quizClip;
  const before = { start: clip.start, end: clip.end, auditioned: clip.auditioned };
  if (start !== undefined) clip.start = Number.isFinite(start) && start >= 0 ? start : null;
  if (end !== undefined) clip.end = Number.isFinite(end) && end > 0 ? end : null;
  // A range is auditioned when it is a range: a start with no end is still
  // half a guess.
  clip.auditioned = Number.isFinite(clip.start) && Number.isFinite(clip.end) && clip.end > clip.start;
  if (typeof reason === "string" && reason.trim()) clip.reason = reason.trim().slice(0, 240);
  const changed = before.start !== clip.start || before.end !== clip.end || before.auditioned !== clip.auditioned;
  if (changed) {
    appendOneMoreTuneEvent({
      type: "clip",
      cardId,
      start: clip.start,
      end: clip.end,
      auditioned: clip.auditioned,
      reason: clip.reason || "",
      mediaPlayed: false,
    });
  }
  writeOneMoreTuneState();
}

/**
 * The reason on its own, logged when the field is committed rather than on every
 * keystroke: a half-typed sentence is a draft, a sentence a person left is a
 * judgement. The record keeps the latest; the log keeps each one that landed.
 */
function setOneMoreTuneClipReason(cardId, reason) {
  const record = oneMoreTuneRecord(cardId);
  const text = String(reason || "").trim().slice(0, 240);
  // `reason` is the sentence on screen; `reasonLogged` is the last one that
  // reached the log. Typing updates the first on every keystroke; committing
  // compares against the second, so a draft that ends where the log already is
  // writes nothing.
  if ((record.quizClip.reasonLogged || "") === text) return;
  record.quizClip.reason = text;
  record.quizClip.reasonLogged = text;
  appendOneMoreTuneEvent({
    type: "clip",
    cardId,
    start: record.quizClip.start,
    end: record.quizClip.end,
    auditioned: record.quizClip.auditioned,
    reason: text,
    mediaPlayed: false,
  });
  writeOneMoreTuneState();
}

function clearOneMoreTuneQuizClip(cardId) {
  oneMoreTuneRecord(cardId).quizClip = { start: null, end: null, auditioned: false };
  writeOneMoreTuneState();
}

// --- Audio -------------------------------------------------------------
//
// One file at a time per card, chosen by the person, played through Web Audio
// so the segment's end is scheduled by the audio clock rather than by a timer
// that pauses the player after the fact.

function oneMoreTuneAudioContext() {
  if (!oneMoreTuneAudio.context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    oneMoreTuneClaimPlaybackAudioSession();
    oneMoreTuneAudio.context = new Ctor();
    oneMoreTuneInstanceResources().add(() => oneMoreTuneAudio.context?.close?.().catch(() => {}), "one-more-tune-audio-context");
  }
  return oneMoreTuneAudio.context;
}

function oneMoreTuneHasAudio(cardId) {
  const key = String(cardId || "");
  return oneMoreTuneAudio.buffers.has(key) || oneMoreTuneAudio.elements.has(key);
}

/**
 * iOS starts a Web Audio context suspended, and only a call made inside the tap
 * that asked for the sound may resume it. Everything else on this face's play
 * path waits on a fetch and a decode, so the unlock belongs at the door of the
 * command, before the first await. Without it the context stays suspended, the
 * round is silent, and the face still says a sound started — which is the
 * report this was written from: "it used to make a sound, now it does not".
 *
 * The same tap has to bless the fallback's media element, because iOS gives a
 * media element the right to play later only if a gesture played it first.
 */
function unlockOneMoreTuneAudio() {
  oneMoreTuneClaimPlaybackAudioSession();
  const context = oneMoreTuneAudioContext();
  if (context && context.state !== "running") context.resume?.().catch(() => {});
  // WeChat's iOS browser keeps the audio bridge shut until this event fires;
  // it can arrive after the app is already running, so both are hooked.
  if (!oneMoreTuneAudio.wechatHooked) {
    oneMoreTuneAudio.wechatHooked = true;
    const bridgeTry = () => unlockOneMoreTuneAudio();
    try {
      document.addEventListener("WeixinJSBridgeReady", bridgeTry, { once: true });
    } catch {}
  }
  oneMoreTuneAudioElement();
  return context;
}

/**
 * Say out loud that this page is playback, not ambience.
 *
 * This is the phone-only silence. iOS plays Web Audio as *ambient* sound, which
 * the ring/silent switch mutes; a media element plays as *playback* and is not
 * muted by it. So the same quiz sounded on a desk and on an iPad — no iPad has
 * a ring switch — and stayed silent on a phone whose switch was down, with no
 * error and a face that looked like it was playing. Nothing on this page could
 * have noticed: Safari does not report the switch.
 *
 * Safari 16.4 and later let the page declare its audio session, and the same
 * declaration covers the installed app and WeChat's in-app browser, which are
 * the same WebKit underneath. Older iPhones are handled by the media element
 * the first tap already plays (see oneMoreTuneAudioElement).
 */
function oneMoreTuneClaimPlaybackAudioSession() {
  const session = typeof navigator === "undefined" ? null : navigator.audioSession;
  if (!session) return false;
  try {
    session.type = "playback";
    return true;
  } catch {
    return false;
  }
}

/**
 * A quarter second of silence, as a WAV, built here rather than fetched: the
 * unlock below has to run inside the tap, and a network round trip inside a
 * gesture is the one thing that cannot be waited for.
 */
function oneMoreTuneSilentWavUrl() {
  const rate = 8000;
  const samples = rate / 4;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const ascii = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  // Eight-bit PCM is unsigned, so 128 is silence, not a click.
  new Uint8Array(buffer, 44, samples).fill(128);
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * The one media element this window plays through, and the only one a store
 * preview ever needs. It is created — and played once, muted — inside the tap
 * that opened the round, which is what lets every later question start by
 * itself on iOS and in WeChat's browser. Reusing it is the point: a fresh
 * element for each preview would be refused the moment nobody tapped.
 */
function oneMoreTuneAudioElement() {
  const existing = oneMoreTuneAudio.gate;
  // A gate whose play was turned down is not armed. iOS grants this element the
  // right to play later only if a gesture played it, so one the engine refused
  // has to be played again inside the next gesture rather than handed back as
  // though it were ready — which is how every question after the first went
  // silent in the home-screen app with nothing on screen to say so.
  if (existing && oneMoreTuneAudio.gateArmed !== false) return existing;
  try {
    const element = existing || new Audio();
    if (!existing) {
      // Unmuted on purpose. A muted element does not move the device's audio
      // session to playback, and moving it is half of what this first play is
      // for; the other half is the right to play later without a tap. The sound
      // is silence, so nothing is heard either way.
      element.muted = false;
      element.playsInline = true;
      element.setAttribute("playsinline", "");
      element.preload = "auto";
      element.setAttribute("x-webkit-airplay", "deny");
      element.src = oneMoreTuneSilentWavUrl();
      element.dataset.oneMoreTuneGate = "1";
      oneMoreTuneAudio.gate = element;
    }
    const played = element.play?.();
    if (played?.then) {
      played.then(() => {
        oneMoreTuneAudio.gateArmed = true;
        // Silence, and paused straight away: this play is for the session and
        // the permission, never for the ear.
        if (element.dataset.oneMoreTuneGate === "1") { try { element.pause(); } catch {} }
      }).catch(() => {
        oneMoreTuneAudio.gateArmed = false;
      });
    }
    return element;
  } catch {
    oneMoreTuneAudio.gate = null;
  }
  return oneMoreTuneAudio.gate;
}

// --- The record ---------------------------------------------------------
//
// A round is played on a white label: an unprinted test pressing, the record a
// DJ is handed before anybody has told them what it is. Before the answer its
// paper label carries the track code (A3) and 33⅓ and nothing else, so the
// question prints no hint — not even an era colour. The record does the jobs the
// disc did, in a shape a person already knows:
//
//   the platter   turns at 33⅓ while there is sound, and coasts to a stop
//   the tonearm   sits on THIS question's band — side A's five tracks run from
//                 the rim inward, side B's the same — and moves inward with the
//                 cue's own clock
//   the rim       how far into THIS recording we are, in the room's ink
//
// At the answer the label prints: the era's colour and the year, or plain paper
// and "year unknown" for a card nobody dated. Colour is identity and arrives only
// with the answer; right and wrong are marks, never an era's hue. The drawn
// design and its one-screen measurements are in
// internal/evidence/drafts/one-more-tune-redesign/white-label/.

const ONE_MORE_TUNE_DISC_ARC_MS = 250;
// 33⅓ rpm is 1.8 seconds a turn. A platter is a heavy thing: it spins up and
// coasts down rather than jumping between rates.
const ONE_MORE_TUNE_SPIN_TURN_MS = 1800;
const ONE_MORE_TUNE_SPIN_UP_S = 0.28;
const ONE_MORE_TUNE_SPIN_DOWN_S = 0.55;
const ONE_MORE_TUNE_SIDE_TRACKS = 5;
// The tonearm, in units of the record's diameter: the pivot's offset from the
// spindle, the stylus's place along the arm, and the five bands of a side.
const ONE_MORE_TUNE_ARM = Object.freeze({ pivotX: 0.6, pivotY: 0.4, tipX: -0.045, tipY: 0.771, outer: 0.47, band: 0.05, groove: 0.045 });
// The rim is drawn in a 100-unit box, so one set of numbers holds at any size.
const ONE_MORE_TUNE_RIM_STROKE = 1.2;

function oneMoreTuneDiscClamp(value, low, high) {
  const number = Number(value);
  if (!Number.isFinite(number)) return low;
  return number < low ? low : number > high ? high : number;
}

/**
 * The disc's whole visual state, as data.
 *
 * Pure on purpose: this is the part a contract can pin without a DOM, and the
 * part that says what "unknown" means — no position and no duration means no
 * arc and no `aria-valuenow`, because this deck's own rule is that an unknown
 * is null and 0 is an answer.
 *
 * @returns {{ playing: boolean, unknown: boolean, reveal: boolean, era: string,
 *            progress: number|null, attrs: Record<string,string>,
 *            elapsed: string, total: string, aria: { now: number|null, text: string } }}
 */
function oneMoreTuneDiscFrame(input) {
  const playback = String(input?.playback || "idle");
  const playing = playback === "playing";
  const position = Number.isFinite(input?.position) ? Number(input.position) : null;
  const duration = Number.isFinite(input?.duration) && Number(input.duration) > 0 ? Number(input.duration) : null;
  const reveal = input?.reveal === true;
  const era = /^[1-6]$/.test(String(input?.era || "")) ? String(input.era) : "";
  const hasArc = position !== null && duration !== null;
  const progress = hasArc ? oneMoreTuneDiscClamp(position / duration, 0, 1) : null;
  const unknown = !hasArc;
  return {
    playing,
    unknown,
    reveal,
    era,
    progress,
    attrs: {
      "data-playback": playing ? "playing" : playback,
      "data-unknown": unknown ? "true" : "false",
      "data-reveal": reveal ? "true" : "false",
      ...(era ? { "data-era": era } : {}),
    },
    elapsed: unknown ? "— : —" : formatOneMoreTuneSeconds(position),
    total: unknown ? "— : —" : formatOneMoreTuneSeconds(duration),
    aria: {
      now: progress === null ? null : Math.round(progress * 100),
      text: unknown ? "— : —" : `${formatOneMoreTuneSeconds(position)} / ${formatOneMoreTuneSeconds(duration)}`,
    },
  };
}

/**
 * The rim's numbers, computed from whatever diameter the disc has, so one
 * component works at 132px and at 296px. What it replaces was a
 * `stroke-dasharray="817"` typed into a mockup and a `width:22%` typed into
 * this window's sheet, each true at exactly one size.
 */
function oneMoreTuneDiscRim(size, stroke) {
  const width = oneMoreTuneDiscClamp(stroke ?? ONE_MORE_TUNE_RIM_STROKE, 1, 8);
  const radius = Math.max(1, (Number(size) || 0) / 2 - width / 2 - 1);
  const length = 2 * Math.PI * radius;
  const box = radius * 2 + width + 2;
  return {
    box,
    radius,
    stroke: width,
    length,
    lead: (value) => {
      const angle = ((oneMoreTuneDiscClamp(value, 0, 1) * 360) - 90) * (Math.PI / 180);
      const scale = 100 / box;
      return {
        x: (box / 2 + radius * Math.cos(angle)) * scale,
        y: (box / 2 + radius * Math.sin(angle)) * scale,
      };
    },
  };
}

/** The side and track a question sits on: A1–A5, then B1–B5. */
function oneMoreTuneTrackCode(index) {
  const at = Math.max(0, Math.floor(Number(index) || 0));
  return `${at < ONE_MORE_TUNE_SIDE_TRACKS ? "A" : "B"}${(at % ONE_MORE_TUNE_SIDE_TRACKS) + 1}`;
}

/**
 * The tonearm's swing, in degrees, that puts the stylus at `radius` (a fraction
 * of the record's diameter). The stylus travels a circle round the pivot, the
 * band is a circle round the spindle, and the arm swings to where they cross.
 */
function oneMoreTuneArmAngle(radius) {
  const { pivotX, pivotY, tipX, tipY } = ONE_MORE_TUNE_ARM;
  const arm = Math.hypot(tipX, tipY);
  const reach = Math.hypot(pivotX, pivotY);
  const along = (pivotX * pivotX + pivotY * pivotY + arm * arm - radius * radius) / (2 * arm * reach);
  const swing = Math.asin(oneMoreTuneDiscClamp(along, -1, 1)) - Math.atan2(pivotY, pivotX) - Math.atan2(-tipX, tipY);
  return swing * 180 / Math.PI;
}

/** Where the arm lands for one question, and where it has reached when the cue ends. */
function oneMoreTuneArmBand(index) {
  const { outer, band, groove } = ONE_MORE_TUNE_ARM;
  const track = Math.max(0, Math.floor(Number(index) || 0)) % ONE_MORE_TUNE_SIDE_TRACKS;
  const from = outer - band * track;
  return { from: oneMoreTuneArmAngle(from), to: oneMoreTuneArmAngle(from - groove) };
}

/**
 * The reveal's naming, as a record's liner notes. These are ad tunes and sound
 * logos, so there are no lines to sync: what a sleeve can honestly print is the
 * thing a person would hum, who played it, and where it aired. A missing field
 * is left out rather than filled in, and a card with no year has no era.
 */
function oneMoreTuneLinerNotes(reveal) {
  if (!reveal) return null;
  const era = oneMoreTuneEra(reveal);
  return {
    song: String(reveal.song || "").trim(),
    artist: String(reveal.artist || "").trim(),
    film: String(reveal.film || "").trim(),
    year: Number.isInteger(reveal.year) ? String(reveal.year) : "",
    era: era.id !== "none" ? era : null,
  };
}

/**
 * The record, on every face of one question.
 *
 * The button is the whole record — pressing the record is the gesture a phone
 * wants for the sound — and it keeps `.playbutton`, the name the contracts and
 * the menu wiring were written with. The rim is the stage's sibling of the
 * button rather than its child, because a button's children are presentational
 * to assistive technology and the rim is a progressbar somebody may need to read.
 */
function oneMoreTuneRoundStage(question, { idle = false } = {}) {
  const reveal = !idle && question?.submitted ? question.reveal || null : null;
  const index = oneMoreTuneRound?.index ?? 0;
  const code = idle ? "?" : oneMoreTuneTrackCode(index);
  const side = t(index < ONE_MORE_TUNE_SIDE_TRACKS ? "one_more_tune_side_a" : "one_more_tune_side_b");
  const era = reveal ? oneMoreTuneEra(reveal) : null;
  const known = Boolean(era && era.id !== "none");
  const band = oneMoreTuneArmBand(index);
  const printed = reveal
    ? `<span class="omt-label omt-label-print"${known ? ` data-era="${era.id}"` : ""}><small>${code}</small><b>${known ? oneMoreTuneEscape(String(reveal.year)) : "—"}</b><small>${oneMoreTuneEscape(known ? era.name : t("one_more_tune_era_unknown"))}</small></span>`
    : "";
  const command = idle ? "one-more-tune-start-round" : "one-more-tune-hear";
  const label = idle ? t("one_more_tune_start_round") : t("one_more_tune_hear");
  return `<div class="omt-stage" data-disc-stage data-token="${oneMoreTuneEscape(question?.token || "")}" data-playback="idle"${reveal ? " data-printed" : ""}${question?.mediaFailed ? " data-failed" : ""} style="--omt-arm-from:${band.from.toFixed(2)}deg;--omt-arm-to:${band.to.toFixed(2)}deg">
          <button class="omt-deck playbutton" type="button" data-disc data-one-more-tune-command="${command}" aria-label="${oneMoreTuneEscape(label)}" data-unknown="true" data-reveal="${reveal ? "true" : "false"}"${known ? ` data-era="${era.id}"` : ""}>
            <span class="omt-flip" aria-hidden="true"><span class="omt-spin" data-disc-platter>
              <span class="omt-grooves"></span>
              <span class="omt-label omt-label-white"><b>${code}</b><small>${idle ? "33⅓" : `33⅓ · ${oneMoreTuneEscape(side)}`}</small></span>
              ${printed}
              <span class="omt-hole"></span>
            </span></span>
            <span class="omt-sheen" aria-hidden="true"></span>
          </button>
          <svg class="omt-rim" data-disc-rim data-disc-progress role="progressbar" aria-label="${oneMoreTuneEscape(t("one_more_tune_disc_progress"))}" focusable="false" viewBox="0 0 100 100">
            <circle class="omt-rim-bed" data-disc-bed cx="50" cy="50" r="48.4"></circle>
            <circle class="omt-rim-arc" data-disc-arc cx="50" cy="50" r="48.4" transform="rotate(-90 50 50)"></circle>
          </svg>
          <span class="omt-arm" aria-hidden="true"><span class="omt-arm-base"></span><span class="omt-arm-swing"><span class="omt-arm-track"><span class="omt-arm-cw"></span><span class="omt-arm-tube"></span><span class="omt-arm-head"></span></span></span><span class="omt-arm-cap"></span></span>
        </div>`;
}

/**
 * Keep the record that is already turning.
 *
 * A face re-renders when the answer arrives, when a replay finishes and when a
 * link upgrades; a record rebuilt each time would jump back to 0° and drop its
 * arm in one frame. The platter (with its angle and its spin) and the arm (with
 * its place on the band) move into the fresh stage; everything else — the
 * printed label, the state attributes — comes from the fresh markup.
 */
function oneMoreTuneCarryRecord(body, token, paint) {
  const find = (root) => (typeof root?.querySelectorAll === "function"
    ? [...root.querySelectorAll("[data-disc-stage]")].find((stage) => stage.dataset.token === token) || null
    : null);
  const old = token ? find(body) : null;
  paint();
  if (!old) return;
  const fresh = find(body);
  if (!fresh || fresh === old) return;
  const oldPlatter = old.querySelector("[data-disc-platter]");
  const freshPlatter = fresh.querySelector("[data-disc-platter]");
  if (oldPlatter && freshPlatter) {
    oldPlatter.querySelector(".omt-label-print")?.remove();
    const print = freshPlatter.querySelector(".omt-label-print");
    if (print) oldPlatter.querySelector(".omt-hole")?.before(print);
    freshPlatter.replaceWith(oldPlatter);
  }
  const oldArm = old.querySelector(".omt-arm");
  const freshArm = fresh.querySelector(".omt-arm");
  if (oldArm && freshArm) freshArm.replaceWith(oldArm);
  // The stage the arm and platter just left said "playing"; the fresh one starts
  // from what the audio says now, so the arm lifts or stays in one transition.
  fresh.dataset.playback = old.dataset.playback || "idle";
}

/** Where we are inside THIS cue — the segment, not the film it came from. */
function oneMoreTuneDiscPosition() {
  const from = oneMoreTuneAudio.cueStart;
  const to = oneMoreTuneAudio.cueEnd;
  if (!oneMoreTuneAudio.playingCardId || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return { position: null, duration: null };
  }
  const duration = to - from;
  if (oneMoreTuneAudio.cueSource === "element") {
    const element = oneMoreTuneAudio.gate;
    const at = element && Number.isFinite(element.currentTime) ? element.currentTime : from;
    return { position: oneMoreTuneDiscClamp(at - from, 0, duration), duration };
  }
  const context = oneMoreTuneAudio.context;
  if (!context || !Number.isFinite(oneMoreTuneAudio.cueClockAt)) return { position: 0, duration };
  return { position: oneMoreTuneDiscClamp(context.currentTime - oneMoreTuneAudio.cueClockAt, 0, duration), duration };
}

/** The frame in front of us right now, from the round and the audio state. */
function oneMoreTuneDiscFrameNow() {
  const question = oneMoreTuneQuestion();
  const reveal = question?.submitted ? question.reveal || null : null;
  const era = reveal ? oneMoreTuneEra(reveal) : null;
  const { position, duration } = oneMoreTuneDiscPosition();
  return oneMoreTuneDiscFrame({
    playback: oneMoreTuneAudio.playingCardId ? "playing" : "idle",
    position,
    duration,
    reveal: Boolean(reveal),
    era: era && era.id !== "none" ? era.id : null,
  });
}

/**
 * Paint the record that is on screen, from the live audio state.
 *
 * The rim and the arm are drawn against the clock four times a second with a
 * 250ms linear transition, which turns four samples a second into continuous
 * motion; the platter's rate is stepped every frame by the ticker. The size is
 * the sheet's business — container queries on the room — so nothing here
 * measures layout.
 */
function paintOneMoreTuneDisc() {
  const el = document.querySelector(".one-more-tune-window [data-disc]");
  if (!el) return false;
  const stage = el.closest("[data-disc-stage]") || el;
  const room = el.closest(".omt-room") || stage;
  const frame = oneMoreTuneDiscFrameNow();
  for (const [name, value] of Object.entries(frame.attrs)) el.setAttribute(name, value);
  const question = oneMoreTuneQuestion();
  // Four states the arm can show: resting, cued over the band while the sound
  // is fetched, down on the record, and left in mid-air when the sound refused
  // to start — a question that cannot play says so before anybody reads a word.
  const playback = frame.playing ? "playing"
    : oneMoreTuneAudio.pendingCue ? "loading"
      : question?.mediaFailed && !question?.submitted ? "failed" : "idle";
  if (stage.dataset && stage.dataset.playback !== playback) stage.dataset.playback = playback;
  stage.style?.setProperty?.("--omt-arm-p", frame.progress === null ? "0" : frame.progress.toFixed(3));
  const rim = oneMoreTuneDiscRim(100, ONE_MORE_TUNE_RIM_STROKE);
  const arc = stage.querySelector?.("[data-disc-arc]");
  if (arc) {
    const drawn = frame.progress === null ? 0 : frame.progress * rim.length;
    arc.setAttribute("stroke-dasharray", rim.length.toFixed(2));
    arc.setAttribute("stroke-dashoffset", (rim.length - drawn).toFixed(2));
  }
  const elapsed = room.querySelector?.("[data-disc-elapsed]");
  if (elapsed) elapsed.textContent = frame.elapsed;
  const total = room.querySelector?.("[data-disc-total]");
  if (total) total.textContent = frame.total;
  // The meter is the rim, which is the thing a reader can see: its accessible
  // value follows the same frame, and an unknown position leaves `aria-valuenow`
  // off rather than calling it zero.
  const svg = stage.querySelector?.("[data-disc-rim]");
  if (svg) {
    svg.setAttribute("aria-valuemin", "0");
    svg.setAttribute("aria-valuemax", "100");
    if (frame.aria.now === null) svg.removeAttribute("aria-valuenow");
    else svg.setAttribute("aria-valuenow", String(frame.aria.now));
    svg.setAttribute("aria-valuetext", frame.aria.text);
  }
  el.setAttribute("aria-pressed", frame.playing ? "true" : "false");
  return true;
}

/**
 * Step the platter's speed toward what the audio says: up to 33⅓ while there is
 * sound, down to a stop when it ends. An exponential approach, so a pause or a
 * submission coasts instead of braking in one frame. Reduced motion keeps the
 * platter still; the rim and the arm still move, because they carry information.
 * Returns whether the platter is still turning.
 */
function stepOneMoreTuneSpin(seconds) {
  const platter = document.querySelector(".one-more-tune-window [data-disc-platter]");
  if (!platter || typeof platter.animate !== "function") return false;
  if (!platter.__omtSpin) {
    platter.__omtSpin = platter.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: ONE_MORE_TUNE_SPIN_TURN_MS,
      iterations: Infinity,
    });
    platter.__omtSpin.playbackRate = 0;
    platter.__omtRate = 0;
  }
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const target = oneMoreTuneAudio.playingCardId && !still ? 1 : 0;
  const current = platter.__omtRate || 0;
  const settle = target > current ? ONE_MORE_TUNE_SPIN_UP_S : ONE_MORE_TUNE_SPIN_DOWN_S;
  let next = current + (target - current) * (1 - Math.exp(-seconds / settle));
  if (target === 0 && next < 0.01) next = 0;
  if (target === 1 && next > 0.995) next = 1;
  platter.__omtRate = next;
  platter.__omtSpin.playbackRate = next;
  return next > 0;
}

/** Repaint the record after a face is painted, and bind its ticker. */
function syncOneMoreTuneDisc() {
  const painted = paintOneMoreTuneDisc();
  if (painted) startOneMoreTuneDiscTicker();
  return painted;
}

/**
 * One clock for the record: the platter's rate every frame, the rim and the
 * arm four times a second, and nothing at all once the sound has stopped and
 * the platter has coasted to rest.
 */
function startOneMoreTuneDiscTicker() {
  if (oneMoreTuneAudio.discFrame || typeof requestAnimationFrame !== "function") return;
  let last = 0;
  const tick = (now) => {
    oneMoreTuneAudio.discFrame = 0;
    const seconds = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const turning = stepOneMoreTuneSpin(seconds);
    const sounding = Boolean(oneMoreTuneAudio.playingCardId);
    if (sounding && now - oneMoreTuneAudio.discAt >= ONE_MORE_TUNE_DISC_ARC_MS) {
      oneMoreTuneAudio.discAt = now;
      paintOneMoreTuneDisc();
    }
    if (!sounding && !turning) {
      paintOneMoreTuneDisc();
      return;
    }
    oneMoreTuneAudio.discFrame = requestAnimationFrame(tick);
  };
  oneMoreTuneAudio.discAt = 0;
  oneMoreTuneAudio.discFrame = requestAnimationFrame(tick);
}

function stopOneMoreTuneDiscTicker() {
  if (!oneMoreTuneAudio.discFrame) return;
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(oneMoreTuneAudio.discFrame);
  oneMoreTuneAudio.discFrame = 0;
}

/**
 * The coordinator's one job: before a card changes, a face turns, a round moves
 * on or the window closes, whatever is sounding stops. Two sources at once is
 * the failure the spec calls out by name.
 */
function stopOneMoreTuneAudio() {
  if (oneMoreTuneAudio.stopTimer) {
    clearTimeout(oneMoreTuneAudio.stopTimer);
    oneMoreTuneAudio.stopTimer = null;
  }
  try {
    oneMoreTuneAudio.node?.stop();
  } catch {
    // Already finished; a source node can only be stopped once.
  }
  try {
    oneMoreTuneAudio.gate?.pause();
  } catch {
    // A media element that already ended refuses a second pause on some
    // browsers; that is the same "nothing is sounding" this call wants.
  }
  oneMoreTuneAudio.node = null;
  oneMoreTuneAudio.playingCardId = "";
  oneMoreTuneAudio.cueSource = "";
  oneMoreTuneAudio.cueStart = null;
  oneMoreTuneAudio.cueEnd = null;
  oneMoreTuneAudio.cueClockAt = null;
  oneMoreTuneAudio.pendingCue = false;
  // The platter coasts to a stop and the arm lifts: the ticker runs until the
  // record is at rest, then ends itself.
  paintOneMoreTuneDisc();
  startOneMoreTuneDiscTicker();
}

function chooseOneMoreTuneAudioFile(cardId) {
  const input = document.getElementById("one-more-tune-audio-input");
  if (!input || !cardId) return;
  input.dataset.oneMoreTuneCard = cardId;
  input.click();
}

async function loadOneMoreTuneAudioFile(file, cardId) {
  const context = oneMoreTuneAudioContext();
  if (!context || !file) {
    setStatus(t("one_more_tune_audio_unavailable"));
    return;
  }
  try {
    const bytes = await file.arrayBuffer();
    const buffer = await context.decodeAudioData(bytes);
    oneMoreTuneAudio.buffers.set(cardId, buffer);
    // The file's name is not shown and not stored: it is routinely the song
    // title, which is the answer.
    setStatus(t("one_more_tune_audio_ready"));
  } catch {
    oneMoreTuneAudio.buffers.delete(cardId);
    setStatus(t("one_more_tune_audio_failed"));
  }
  renderOneMoreTune();
}

/**
 * A cue the browser refused, reported against the question that asked for it.
 *
 * The refusal arrives a tick late — `play()` says so in a promise — so the
 * record has to be corrected after the fact rather than read before it. The
 * count of listenings is this deck's own account of what was heard, and a play
 * the engine turned down is not one of them: leaving the count up would mark
 * the question as heard on a score card the person never heard.
 *
 * The words are the ones the suspended Web Audio context already uses, because
 * it is the same thing happening: a home-screen launch is a document nobody has
 * touched yet, so the first sound waits for a finger. The block is not fatal —
 * the record is still on screen, and pressing it is the gesture that lets the
 * sound through.
 */
function failOneMoreTuneCue(cardId, statusKey) {
  const question = oneMoreTuneQuestion();
  if (question && oneMoreTuneQuestionAudioKey(question) === String(cardId || "")) {
    question.mediaFailed = true;
    question.heard = Math.max(0, Number(question.heard || 0) - 1);
    question.everHeard = question.heard > 0;
    renderOneMoreTune();
  }
  setStatus(t(statusKey));
}

/**
 * Play a window of the card's own file.
 *
 * `from` and `to` are absolute seconds inside the recording. The caller owns
 * the ladder; this only refuses to invent one. A missing range is not filled
 * in, and a player fault returns false so the caller can offer a retry instead
 * of writing down a miss.
 *
 * @returns {boolean} whether a sound actually started
 */
function playOneMoreTuneWindow(cardId, from, to) {
  const context = oneMoreTuneAudioContext();
  const buffer = oneMoreTuneAudio.buffers.get(cardId);
  const elementUrl = oneMoreTuneAudio.elements.get(cardId);
  if (!buffer && !elementUrl) {
    setStatus(t("one_more_tune_no_audio_for_card"));
    return false;
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    setStatus(t("one_more_tune_no_range"));
    return false;
  }
  stopOneMoreTuneAudio();
  context?.resume?.().catch(() => {});
  // A preview the context refused — iOS Safari will not hand every store
  // preview to decodeAudioData — plays through its own media element. The
  // element is the fallback, not the first choice: Web Audio keeps the end of
  // the segment on the audio clock instead of a timer that pauses after it.
  if (!buffer) {
    const element = oneMoreTuneAudioElement();
    if (!element) {
      setStatus(t("one_more_tune_audio_failed"));
      return false;
    }
    try {
      if (element.src !== elementUrl) element.src = elementUrl;
      element.muted = false;
      element.currentTime = Math.max(0, from);
      // What the rim is allowed to say: this cue's own window, and the element's
      // clock as the place to read it from.
      oneMoreTuneAudio.cueSource = "element";
      oneMoreTuneAudio.cueStart = Math.max(0, from);
      oneMoreTuneAudio.cueEnd = to;
      oneMoreTuneAudio.cueClockAt = null;
      // The play's own promise is the only answer the engine gives, and this
      // path used to throw it away: a refusal resolved to nothing, the block
      // below returned true, and the question was counted as heard on a face
      // that looked like it was playing. That is the whole of "in the
      // home-screen app there is no sound and no error" — on iOS this is the
      // path every store preview takes, because WebKit refuses to decode them
      // (see oneMoreTuneLoadMedia) and the element is what plays them instead.
      const started = element.play?.();
      if (started?.then) {
        started.then(() => {
          // The same element, and now it has played inside a gesture: this is
          // what makes the next question's play legal.
          oneMoreTuneAudio.gateArmed = true;
        }).catch(() => {
          oneMoreTuneAudio.gateArmed = false;
          try { element.pause(); } catch {}
          if (oneMoreTuneAudio.playingCardId === cardId) oneMoreTuneAudio.playingCardId = "";
          failOneMoreTuneCue(cardId, "one_more_tune_audio_blocked");
        });
      }
      oneMoreTuneAudio.playingCardId = cardId;
      oneMoreTuneAudio.stopTimer = setTimeout(() => {
        try { element.pause(); } catch {}
        oneMoreTuneAudio.stopTimer = null;
        oneMoreTuneAudio.playingCardId = "";
      }, (Math.max(0.05, to - from) + 0.2) * 1000);
      return true;
    } catch {
      setStatus(t("one_more_tune_audio_failed"));
      return false;
    }
  }
  const start = Math.min(Math.max(0, from), Math.max(0, buffer.duration - 0.05));
  const length = Math.min(to - from, Math.max(0.05, buffer.duration - start));
  try {
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.start(0, start, length);
    // The segment, not the film: `length` is what this question plays, and the
    // context's own clock is what says how far into it we are.
    oneMoreTuneAudio.cueSource = "buffer";
    oneMoreTuneAudio.cueStart = start;
    oneMoreTuneAudio.cueEnd = start + length;
    oneMoreTuneAudio.cueClockAt = context.currentTime;
    oneMoreTuneAudio.node = node;
    oneMoreTuneAudio.playingCardId = cardId;
    oneMoreTuneAudio.stopTimer = setTimeout(() => {
      oneMoreTuneAudio.node = null;
      oneMoreTuneAudio.stopTimer = null;
      oneMoreTuneAudio.playingCardId = "";
    }, (length + 0.2) * 1000);
    return true;
  } catch {
    setStatus(t("one_more_tune_audio_failed"));
    return false;
  }
}

/** Play the whole auditioned range of a card, for study and recall. */
function playOneMoreTuneClip(cardId) {
  const clip = oneMoreTuneTimes(cardId).quizClip;
  if (!clip.auditioned) {
    setStatus(t("one_more_tune_no_range"));
    return false;
  }
  return playOneMoreTuneWindow(cardId, clip.start, clip.end);
}

/**
 * The lock screen is part of the question. A browser that kept the previous
 * card's metadata would hand the next answer to anyone who glanced at their
 * phone, so this runs before every question and a reveal is the only thing that
 * fills it in again.
 */
function clearOneMoreTuneNowPlaying() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  } catch {
    // Not every engine allows clearing; the question still carries no title.
  }
}

// --- The reveal dresses the desk in the card's era -------------------------
//
// Every reveal — a challenge answer, a study card, a recall — runs through
// announceOneMoreTuneNowPlaying, so that is the one hook the era visit needs.
// The visit is a preview: it never becomes the writer's Appearance, it lasts
// until the next reveal, and the window gives it back when it closes.
let oneMoreTuneEraVisitTheme = "";
let oneMoreTuneEraWatchAttached = false;

/** The writer's own Appearance — what the visit is given back to. */
function oneMoreTuneCommittedTheme() {
  return window.AISystem6Theme?.getCommittedTheme?.() || getCurrentTheme();
}

/**
 * A deliberate Appearance change is the writer's call, not a visit: forget the
 * visit so nothing puts the old one back when the window closes. Attached once;
 * it only clears a module variable, so it is harmless with the window shut.
 */
function watchOneMoreTuneEraVisits() {
  if (oneMoreTuneEraWatchAttached || typeof document === "undefined") return;
  oneMoreTuneEraWatchAttached = true;
  document.addEventListener("ai-system6-themechange", (event) => {
    if (event?.detail?.committed === true) oneMoreTuneEraVisitTheme = "";
  });
}

/**
 * Put the desk in the appearance of the card's era, for this session only.
 *
 * A card whose year is unknown keeps whatever is on screen: this deck refuses
 * to guess a year, and dressing a card in an interface it never shared a room
 * with is the same guess wearing a different hat.
 */
function visitOneMoreTuneEraTheme(card) {
  if (typeof applyTheme !== "function") return false;
  const era = oneMoreTuneEra(card);
  if (!era.theme) return false;
  watchOneMoreTuneEraVisits();
  oneMoreTuneEraVisitTheme = era.theme;
  if (era.theme === getCurrentTheme()) return true;
  // persist:false is the registry's preview: this session's screen changes, the
  // Appearance the writer chose does not, and the desk record is not written.
  applyTheme(era.theme, { persist: false, announce: false, saveDesk: false });
  return true;
}

/** Give the writer's own Appearance back, and forget the visit. */
function leaveOneMoreTuneEraTheme() {
  const visited = oneMoreTuneEraVisitTheme;
  oneMoreTuneEraVisitTheme = "";
  if (!visited || typeof applyTheme !== "function") return false;
  const committed = oneMoreTuneCommittedTheme();
  if (committed && committed !== getCurrentTheme()) {
    applyTheme(committed, { persist: false, announce: false, saveDesk: false });
  }
  return true;
}

/**
 * The reveal, in the two channels it has: the lock screen's own metadata, and
 * the era the desk wears while this card is the one being talked about.
 *
 * The challenge reveal arrives from the round authority and carries the song
 * rather than the card, so the local deck is asked which card it was.
 */
function announceOneMoreTuneNowPlaying(card) {
  if (!card) return;
  // A deck card names its own unit; a server reveal names the song. The two are
  // told apart by that, and a reveal is resolved back to the local card so its
  // year can decide the era.
  const local = typeof card.unit === "string"
    ? card
    : ONE_MORE_TUNE_ALL_CARDS.find((entry) => entry.id === oneMoreTuneCardIdForReveal(card)) || null;
  visitOneMoreTuneEraTheme(local);
  if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({ title: card.song, artist: card.artist, album: card.product || "" });
  } catch {
    // Metadata is a courtesy after the reveal, never a requirement.
  }
}

// --- Window ------------------------------------------------------------

function installOneMoreTuneWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="oneMoreTune"]')) return;
  window.AISystem6ApplicationShell.createWindow({
    windowName: "oneMoreTune",
    windowClass: "one-more-tune-window",
    labelledBy: "one-more-tune-title",
    // Untranslated in both languages, like Scrapbook and TeachText: it is the
    // application's name, not a description of it.
    title: "One More Tune",
    statusClass: "compact-status-bar",
    statusHtml: `
          <span class="status-bar-leading" id="one-more-tune-status"></span>
          <span class="status-bar-trailing one-more-tune-status-counts" id="one-more-tune-counts"></span>`,
    // The window's title already says what this is, so the head carries no
    // wordmark: printing the name twice was the repetition the owner asked to
    // lose. What is left is the three games (and 资料, for a backstage browser
    // only). The card shelf and study are places a person goes to on purpose,
    // and they live in the Study menu; a round in progress hides this row
    // altogether (see renderOneMoreTune).
    beforePaneHtml: `
        <header class="top">
          <nav class="nav one-more-tune-tabs" role="tablist" aria-label="One More Tune sections" data-i18n-aria-label="one_more_tune_sections">
            <button class="system-tab is-active" type="button" role="tab" aria-selected="true" data-one-more-tune-view="challenge" data-i18n="one_more_tune_view_challenge">Challenge</button>
            <button class="system-tab" type="button" role="tab" aria-selected="false" data-one-more-tune-view="keynote" data-i18n="one_more_tune_view_keynote">Relay</button>
            <button class="system-tab" type="button" role="tab" aria-selected="false" data-one-more-tune-view="line" data-i18n="one_more_tune_view_line">Next Act</button>
            <button class="system-tab" type="button" role="tab" aria-selected="false" data-one-more-tune-view="sources" data-one-more-tune-backstage hidden data-i18n="one_more_tune_view_sources">Sources</button>
          </nav>
        </header>`,
    paneClass: "one-more-tune-pane",
    paneHtml: `
          <div class="one-more-tune-body" id="one-more-tune-body"></div>
          <input type="file" id="one-more-tune-audio-input" accept="audio/*" hidden />`,
  });
}

installOneMoreTuneWindow();

function oneMoreTuneInstanceResources() {
  if (!oneMoreTuneResources || oneMoreTuneResources.disposed) {
    oneMoreTuneResources = window.AISystem6InstanceResources.create("oneMoreTune");
  }
  return oneMoreTuneResources;
}

function oneMoreTuneRoot() {
  return document.querySelector('[data-window="oneMoreTune"]');
}

function oneMoreTuneBody() {
  return document.getElementById("one-more-tune-body");
}

function oneMoreTuneLanguage() {
  return typeof currentLanguage === "string" ? currentLanguage : "zh";
}

function oneMoreTuneNote(card) {
  // A card carried over from the bank may hold a note in only one language:
  // the package writes its editorial notes in the language its researcher used,
  // and inventing the other side would be inventing research. An empty side
  // falls back to the side that exists.
  const note = card?.note || {};
  const wanted = oneMoreTuneLanguage() === "zh" ? note.zh : note.en;
  return wanted || note.zh || note.en || "";
}

function oneMoreTuneUnitLabel(unitId) {
  const unit = ONE_MORE_TUNE_ALL_UNITS.find((entry) => entry.id === unitId);
  return unit ? t(unit.labelKey) : t("one_more_tune_no_unit");
}

function oneMoreTuneEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

// --- Rendering ---------------------------------------------------------

function renderOneMoreTune() {
  const body = oneMoreTuneBody();
  if (!body) return;
  syncOneMoreTuneTabs();
  // Three facts the sheet lays the window out by. A challenge face is a room
  // that fills the pane rather than a page that scrolls; a round in progress
  // hides the tab row, because nothing on it is wanted between the first
  // question and the back cover — leaving is in the menu; and a question on
  // screen hides the study counts as well.
  const root = oneMoreTuneRoot();
  root?.toggleAttribute?.("data-omt-room", oneMoreTuneView === "challenge");
  root?.toggleAttribute?.("data-omt-round", oneMoreTuneView === "challenge" && Boolean(oneMoreTuneRound));
  root?.toggleAttribute?.("data-omt-asking", oneMoreTuneView === "challenge" && Boolean(oneMoreTuneRound && oneMoreTuneQuestion()));
  // Each face starts at its own top. A phase change that leaves the reader
  // halfway down the previous face is the one scroll behaviour the design
  // names: "scrollTo" on every step.
  const pane = body.closest?.(".one-more-tune-pane");
  if (pane) pane.scrollTop = 0;
  if (oneMoreTuneView === "shelf") renderOneMoreTuneShelf(body);
  else if (oneMoreTuneView === "study") renderOneMoreTuneStudy(body);
  else if (oneMoreTuneView === "challenge") renderOneMoreTuneChallenge(body);
  else if (oneMoreTuneView === "keynote") renderOneMoreTuneKeynote(body);
  else if (oneMoreTuneView === "line") renderOneMoreTuneLine(body);
  else renderOneMoreTuneSources(body);
  window.AISystem6TranslateWithin?.(body);
  hydrateSystemIcons?.(body);
  syncOneMoreTuneCounts();
  // The disc is painted from the audio state rather than from the markup, so a
  // re-render has to hand it the frame it is actually in: a question already
  // sounding keeps its arc, and a reveal shows the era band it just earned.
  // A window that destroys its own chord here is the bug this exists to stop.
  syncOneMoreTuneDisc();
  // The listen link paints as a search and becomes the recording's own store
  // page when the catalogue answers — the Music app opens a store item, not a
  // search. Nothing here blocks the face: a reader who clicks before the answer
  // arrives gets the search, and one who waits gets the song.
  void oneMoreTuneUpgradeListenLinks();
}

function syncOneMoreTuneTabs() {
  const backstage = oneMoreTuneBackstage();
  oneMoreTuneRoot()?.querySelectorAll("[data-one-more-tune-backstage]").forEach((tab) => {
    tab.hidden = !backstage;
  });
  oneMoreTuneRoot()?.querySelectorAll("[data-one-more-tune-view]").forEach((tab) => {
    const active = tab.dataset.oneMoreTuneView === oneMoreTuneView;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function syncOneMoreTuneCounts() {
  const counts = document.getElementById("one-more-tune-counts");
  if (!counts) return;
  counts.textContent = t("one_more_tune_counts")
    .replace("{met}", String(oneMoreTuneMetCount()))
    .replace("{total}", String(ONE_MORE_TUNE_CARDS.length))
    .replace("{due}", String(oneMoreTuneDueCount()));
}

/** The card's stage line: 阶段 + 编号, the spec's top-of-card anatomy. */
function oneMoreTuneStageHead(stepKey, card, index, total) {
  return `<p class="one-more-tune-step-label"><span data-i18n="${stepKey}">${stepKey}</span>
            <span class="one-more-tune-step-count">${index + 1} / ${total}</span>
            <span class="one-more-tune-card-id">${oneMoreTuneEscape(card.id)}</span></p>`;
}

function oneMoreTuneVisibleCards() {
  const query = oneMoreTuneQuery.trim().toLowerCase();
  const now = Date.now();
  return ONE_MORE_TUNE_CARDS.filter((card) => {
    const record = oneMoreTuneRecord(card.id);
    if (oneMoreTuneFilter === "learned" && !record.met) return false;
    if (oneMoreTuneFilter === "due" && !oneMoreTuneDue(card.id, now)) return false;
    if (!query) return true;
    // An unmet card is searchable by its own facts too: the shelf is the
    // person's collection as much as it is a queue, and a search that only
    // matched what they had already learnt could never find anything new.
    return [card.song, card.artist, card.product, card.film, card.id]
      .some((field) => String(field || "").toLowerCase().includes(query));
  });
}

function renderOneMoreTuneShelf(body) {
  const cards = oneMoreTuneVisibleCards();
  const met = ONE_MORE_TUNE_CARDS.filter((card) => oneMoreTuneRecord(card.id).met).length;
  const due = oneMoreTuneDueCount();
  const unmet = ONE_MORE_TUNE_CARDS.length - met;
  // The one card the shelf puts on top: the next thing to meet, or the next
  // thing due. A shelf that shows a card is a shelf you can start from.
  const featured = ONE_MORE_TUNE_CARDS.find((card) => oneMoreTuneDue(card.id))
    || ONE_MORE_TUNE_CARDS.find((card) => !oneMoreTuneRecord(card.id).met)
    || ONE_MORE_TUNE_CARDS[0];

  const units = ONE_MORE_TUNE_UNITS.map((unit, index) => {
    const unitCards = oneMoreTuneUnitCards(unit.id);
    const seen = unitCards.filter((card) => oneMoreTuneRecord(card.id).met).length;
    const dots = unitCards.map((card) => `<span class="${oneMoreTuneRecord(card.id).met ? "seen" : ""}"></span>`).join("");
    return `
        <article class="unit">
          <div class="unit-top"><span class="chip">UNIT ${String(index + 1).padStart(2, "0")} · ${unitCards.length}</span><span class="unit-dots" aria-hidden="true">${dots}</span></div>
          <h3>${oneMoreTuneEscape(t(unit.labelKey))}</h3>
          <p>${t("one_more_tune_unit_met").replace("{met}", String(seen)).replace("{total}", String(unitCards.length))}</p>
          <button class="btn ghost" type="button" data-one-more-tune-open-unit="${oneMoreTuneEscape(unit.id)}" data-i18n="one_more_tune_unit_start">Start this unit</button>
        </article>`;
  }).join("");

  const rows = cards.map((card) => {
    const record = oneMoreTuneRecord(card.id);
    const settled = oneMoreTuneAnswerable(card);
    const line = record.met && settled
      ? `${oneMoreTuneEscape(card.song)} · ${oneMoreTuneEscape(card.artist)}`
      : settled ? oneMoreTuneEscape(t("one_more_tune_card_unmet")) : oneMoreTuneEscape(t("one_more_tune_needs_check"));
    return `
        <button class="library-card${record.met ? " is-met" : ""}" type="button" ${settled ? `data-one-more-tune-open-unit="${oneMoreTuneEscape(card.unit)}"` : `data-one-more-tune-sources="1"`}>
          <span class="card-top"><span class="chip${record.met ? " on" : ""}">${oneMoreTuneEscape(card.id)}</span><span class="id">${oneMoreTuneEscape(oneMoreTuneUnitLabel(card.unit))}</span></span>
          <span class="library-line">${line}</span>
          <span class="library-sub">${settled ? oneMoreTuneEscape(card.product) : `<span data-i18n="one_more_tune_artist_unknown">Artist not settled</span>`}${oneMoreTuneDue(card.id) ? ` · <span data-i18n="one_more_tune_due_now">Due</span>` : ""}</span>
        </button>`;
  }).join("");

  body.innerHTML = `
      <section class="one-more-tune-shelf" aria-labelledby="one-more-tune-shelf-title">
        <div class="collection-head">
          <div>
            <div class="eyebrow" data-i18n="one_more_tune_shelf_eyebrow">YOUR LISTENING COLLECTION</div>
            <h1 id="one-more-tune-shelf-title">${t("one_more_tune_shelf_title")}</h1>
            <p>${t("one_more_tune_shelf_intro")}</p>
            <div class="buttons">
              <button class="btn default" type="button" data-one-more-tune-open-unit="${oneMoreTuneEscape(featured?.unit || "")}">${t("one_more_tune_shelf_start")} <span aria-hidden="true">→</span></button>
            </div>
            <div class="stats">
              <div><strong>${unmet}</strong><small data-i18n="one_more_tune_stat_unmet">Not met yet</small></div>
              <div><strong>${due}</strong><small data-i18n="one_more_tune_stat_due">Due</small></div>
              <div><strong>${met}</strong><small data-i18n="one_more_tune_stat_met">Met</small></div>
            </div>
            <div class="one-more-tune-progress">
              <span class="one-more-tune-progress-state" data-i18n="${oneMoreTuneStorageSourceKey()}">${oneMoreTuneStorageSourceKey()}</span>
              <span class="one-more-tune-progress-note" role="status">${oneMoreTuneEscape(oneMoreTuneProgressNote)}</span>
              <button class="linkbutton" type="button" data-one-more-tune-command="one-more-tune-export-progress" data-i18n="one_more_tune_progress_export">Export progress</button>
              <label class="linkbutton" for="one-more-tune-progress-input" data-i18n="one_more_tune_progress_import">Import progress</label>
              <input id="one-more-tune-progress-input" type="file" accept="application/json,.json" hidden />
            </div>
          </div>
          ${featured ? `<div class="card-stack"><article class="lesson-card">
            <div class="card-top"><span class="chip on">${oneMoreTuneRecord(featured.id).met ? t("one_more_tune_step_recall") : t("one_more_tune_step_learn")}</span>${oneMoreTuneEraBand(featured)}<span class="id">${oneMoreTuneEscape(featured.id)}</span></div>
            <div class="disc-area"><div class="disc" aria-hidden="true"><div class="disc-center">♫</div></div><span class="disc-caption">${oneMoreTuneEscape(oneMoreTuneUnitLabel(featured.unit))}</span></div>
            <div class="card-copy">
              <div class="eyebrow">${oneMoreTuneEscape(featured.film || "")}</div>
              <h2>${oneMoreTuneEscape(featured.product || t("one_more_tune_needs_check"))}</h2>
              <p class="song">${oneMoreTuneEscape(featured.song)}</p>
              <div class="artist">${oneMoreTuneEscape(featured.artist)}</div>
              <button class="btn ghost compact" type="button" data-one-more-tune-open-card="${oneMoreTuneEscape(featured.id)}" data-i18n="one_more_tune_see_card">See this card</button>
            </div>
            <div class="card-end"><span>${oneMoreTuneEscape(t("one_more_tune_unit_cards"))}</span><span>${ONE_MORE_TUNE_CARDS.indexOf(featured) + 1} / ${ONE_MORE_TUNE_CARDS.length}</span></div>
          </article></div>` : ""}
        </div>
        <section class="section">
          <div class="section-heading">
            <div><div class="eyebrow" data-i18n="one_more_tune_units_eyebrow">SMALL LESSONS / NO LOCKED PATHS</div><h2 data-i18n="one_more_tune_units_title">Pick a small group to start.</h2><p data-i18n="one_more_tune_units_intro">Each unit is three to five cards. Nothing is locked behind an era.</p></div>
            <span class="chip">${ONE_MORE_TUNE_UNITS.length}</span>
          </div>
          <div class="unit-grid">${units}</div>
        </section>
        <section class="section">
          <div class="section-heading">
            <div><div class="eyebrow" data-i18n="one_more_tune_library_eyebrow">MEMORY CARDS</div><h2 data-i18n="one_more_tune_library_title">Your card shelf</h2></div>
          </div>
          <div class="filters">
            <label class="one-more-tune-search">
              <span class="visually-hidden" data-i18n="one_more_tune_search">Search the shelf</span>
              <input type="search" id="one-more-tune-search" value="${oneMoreTuneEscape(oneMoreTuneQuery)}" data-i18n-placeholder="one_more_tune_search" placeholder="Search the shelf" />
            </label>
            <div class="one-more-tune-filters" role="group" data-i18n-aria-label="one_more_tune_filters" aria-label="Filters">
              ${["all", "learned", "due"].map((id) => `<button class="chip${oneMoreTuneFilter === id ? " on" : ""}" type="button" data-one-more-tune-filter="${id}" data-i18n="one_more_tune_filter_${id}">${id}</button>`).join("")}
            </div>
          </div>
          <p class="eyebrow one-more-tune-shown">${cards.length} / ${ONE_MORE_TUNE_CARDS.length}</p>
          <div class="library-grid">${rows}</div>
          ${cards.length ? "" : `<p class="one-more-tune-empty" data-i18n="one_more_tune_no_cards">Nothing on the shelf matches that.</p>`}
        </section>
      </section>`;
}

/**
 * The card's mono source line, in the learning mock's own words: the anchor the
 * research package recorded for this pairing, and whether anyone has listened
 * the segment through. It replaces a truncated paragraph — the first eighty
 * characters of the "three kinds of time" note say nothing about this card's own
 * anchor and stop mid-sentence.
 */
/**
 * The half of a card that a quiz normally hides: what it is still missing, and
 * what each claim rests on.
 *
 * This is the reason the catalogue is worth reading. A row that cannot be asked
 * says which step it is stuck on — nobody has listened to it, the film is not
 * pinned to a video, the wrong answers have not been checked for a product that
 * used the same song — and every claim carries the address it came from. The
 * counts on this page are not a score to improve; they are a worklist.
 */
function oneMoreTuneEvidencePanel(cardId) {
  const found = oneMoreTuneEvidenceFor(cardId);
  if (!found) return "";
  const blocked = found.blocked.length
    ? `<div class="one-more-tune-blocked">
            <h4 data-i18n="one_more_tune_blocked_title">What this card is still missing</h4>
            <ul>${found.blocked.map((line) => `<li>${oneMoreTuneEscape(line)}</li>`).join("")}</ul>
          </div>`
    : "";
  const evidence = found.evidence.length
    ? `<div class="one-more-tune-evidence-list">
            <h4 data-i18n="one_more_tune_evidence_title">What the pairing rests on</h4>
            <ul>${found.evidence.map((item) => {
      const label = oneMoreTuneEscape(item.url ? item.url.replace(/^https?:\/\//, "").replace(/\/$/, "") : item.source);
      const link = item.url
        ? `<a href="${oneMoreTuneEscape(item.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label;
      return `<li>${link} <span class="hint">${oneMoreTuneEscape(item.supports)}</span></li>`;
    }).join("")}</ul>
          </div>`
    : "";
  return `${blocked}${evidence}`;
}

/**
 * The card itself, in the learning design's anatomy: a coloured strip with the
 * stage and the card id, the record and its caption, the copy, and a foot strip
 * with the progress. The same card is used for meeting, for recalling and for
 * the reveal; only `body` changes, which is what keeps the two faces the same
 * size when a card turns over.
 */
function oneMoreTuneLessonCard({ card, stageKey, stageOn = false, era = false, body: face, footLeft = "", footRight = "" }) {
  return `<article class="lesson-card">
          <div class="card-top"><span class="chip${stageOn ? " on" : ""}" data-i18n="${stageKey}">${stageKey}</span>${era ? oneMoreTuneEraBand(card) : ""}<span class="id">${oneMoreTuneEscape(card.id)}</span></div>
          <div class="disc-area"><div class="disc" aria-hidden="true"><div class="disc-center">♫</div></div></div>
          ${face}
          <div class="card-end"><span>${footLeft}</span><span>${footRight}</span></div>
        </article>`;
}

/** The copy on the back of a card: year and kind, product, song, artist, note. */
function oneMoreTuneCardCopy(card) {
  return `<div class="card-copy">
            <div class="eyebrow">${oneMoreTuneEscape(card.film || "")}${card.year ? ` · ${card.year}` : ""}</div>
            <h2>${oneMoreTuneEscape(card.product)}</h2>
            <p class="song">${oneMoreTuneEscape(card.song)}</p>
            <div class="artist">${oneMoreTuneEscape(card.artist)}</div>
            ${oneMoreTunePlainLinks(card)}
          </div>`;
}

/**
 * The sound a blind study face plays: the card's pinned store preview, or the
 * song's own video in YouTube's visible player. The same source a round uses,
 * so studying and playing sound alike.
 */
function oneMoreTuneStudySound(card) {
  const sound = oneMoreTuneQuestionSound(card);
  if (!sound) return "";
  const slot = sound.provider === "youtube" ? `<div class="one-more-tune-film one-more-tune-song" id="one-more-tune-study-film" hidden></div>` : "";
  return `<div class="one-more-tune-player">
          <button class="btn default one-more-tune-play" type="button" data-one-more-tune-command="one-more-tune-study-hear" data-i18n="one_more_tune_hear">Play</button>
        </div>${slot}`;
}

async function playOneMoreTuneStudySound(card) {
  const sound = oneMoreTuneQuestionSound(card);
  if (!sound) return false;
  if (sound.provider === "youtube") {
    const slot = document.getElementById("one-more-tune-study-film");
    if (slot) slot.hidden = false;
    return oneMoreTuneMountPlayer("one-more-tune-study-film", { videoId: sound.videoId, startSeconds: 0, playWhenReady: true });
  }
  const question = { token: `study-${card.id}`, media: { provider: "preview", url: sound.url, startSeconds: 0, endSeconds: 30 }, heard: 0 };
  if (!(await oneMoreTuneLoadMedia(question))) {
    setStatus(t("one_more_tune_media_unavailable"));
    return false;
  }
  return playOneMoreTuneWindow(oneMoreTuneQuestionAudioKey(question), 0, 30);
}

/**
 * A study card sounds itself, the way a round's question does.
 *
 * The card's whole point is the pairing — a phrase and the picture that came
 * with it — and that pairing is a sound. Making the reader press Play before
 * every card turns a memory card into a two-tap form, which is the one thing
 * that makes the effect impossible. The button stays, as the replay and the
 * retry, and the sound is asked for once per card and step: a re-render (an era
 * visit, a resize, a grade) must not restart the music under the reader.
 */
function autoPlayOneMoreTuneStudySound(card) {
  if (!card || !oneMoreTuneSession || oneMoreTuneSession.autoPlayed) return false;
  oneMoreTuneSession.autoPlayed = true;
  return playOneMoreTuneStudySound(card);
}

function oneMoreTunePlayerBlock(card, { blind = false } = {}) {
  const times = oneMoreTuneTimes(card.id);
  const hasAudio = oneMoreTuneHasAudio(card.id);
  const clip = times.quizClip;
  const canPlay = hasAudio && clip.auditioned;
  const anchor = times.sourceAnchor === null
    ? `<span data-i18n="one_more_tune_time_unknown">unknown</span>`
    : oneMoreTuneEscape(formatOneMoreTuneSeconds(times.sourceAnchor));
  const clock = blind ? "" : `
        <dl class="one-more-tune-clocks">
          <div><dt data-i18n="one_more_tune_clock_anchor">Source anchor</dt><dd>${anchor}</dd></div>
          <div><dt data-i18n="one_more_tune_clock_film">Music inside the film</dt><dd>${times.filmClip.start === null || times.filmClip.end === null
            ? `<span data-i18n="one_more_tune_time_unlocated">not located</span>`
            : `${oneMoreTuneEscape(formatOneMoreTuneSeconds(times.filmClip.start))}–${oneMoreTuneEscape(formatOneMoreTuneSeconds(times.filmClip.end))}`}</dd></div>
          <div><dt data-i18n="one_more_tune_clock_quiz">What the player hears</dt><dd>${clip.auditioned
            ? `${oneMoreTuneEscape(formatOneMoreTuneSeconds(clip.start))}–${oneMoreTuneEscape(formatOneMoreTuneSeconds(clip.end))}`
            : `<span data-i18n="one_more_tune_time_unknown">unknown</span>`}</dd></div>
        </dl>`;
  return `
        ${clock}
        <div class="one-more-tune-player">
          <button class="btn default one-more-tune-play" type="button" data-one-more-tune-command="one-more-tune-play" data-i18n="${canPlay ? "one_more_tune_play" : "one_more_tune_play_no_source"}">Play the segment</button>
          <button class="btn" type="button" data-one-more-tune-command="one-more-tune-choose-audio" data-i18n="${hasAudio ? "one_more_tune_replace_audio" : "one_more_tune_choose_audio"}">Choose audio…</button>
          <label class="one-more-tune-clip-field"><span data-i18n="one_more_tune_clip_start">Start (s)</span><input type="number" min="0" step="0.5" id="one-more-tune-clip-start" value="${clip.start === null ? "" : clip.start}" placeholder="—" /></label>
          <label class="one-more-tune-clip-field"><span data-i18n="one_more_tune_clip_end">End (s)</span><input type="number" min="0" step="0.5" id="one-more-tune-clip-end" value="${clip.end === null ? "" : clip.end}" placeholder="—" /></label>
          <button class="btn mini-btn" type="button" data-one-more-tune-command="one-more-tune-clip-from-start"${hasAudio ? "" : " disabled"} data-i18n="one_more_tune_clip_from_start">Audition from 0:00</button>
        </div>
        <label class="one-more-tune-clip-reason"><span data-i18n="one_more_tune_clip_reason">Why this range</span><input type="text" id="one-more-tune-clip-reason" value="${oneMoreTuneEscape(clip.reason || "")}" placeholder="—" data-i18n-placeholder="one_more_tune_clip_reason_placeholder" /></label>
        <p class="hint one-more-tune-clip-reason-note" data-i18n="one_more_tune_clip_reason_note">The reason is saved with the range.</p>
        <p class="hint one-more-tune-clip-note" data-i18n="${clip.auditioned ? "one_more_tune_clip_yours" : "one_more_tune_clip_uncalibrated"}">${clip.auditioned
          ? "Your own file, your own audition."
          : "No in-point yet. An unknown stays empty, never 0."}</p>
        <p class="hint one-more-tune-audio-note" data-i18n="one_more_tune_audio_note">No music ships here. Pick a file from your disk; it stays in this session.</p>`;
}

// --- Study session -----------------------------------------------------

function oneMoreTunePhaseQueue(unitId, phase) {
  const cards = oneMoreTuneUnitCards(unitId).filter((card) => oneMoreTuneReadiness(card.id).learn);
  const settings = oneMoreTuneStateNow().settings;
  if (phase === "learn") {
    // A day's worth of new cards, not the whole unit at once.
    return cards.filter((card) => !oneMoreTuneRecord(card.id).met).slice(0, Math.max(1, settings.newPerDay)).map((card) => card.id);
  }
  if (phase === "recall") {
    // Due first, then the rest of the unit, capped at the due batch so a week
    // away does not produce a red backlog demanding to be cleared in one go.
    const due = cards.filter((card) => oneMoreTuneDue(card.id));
    const rest = cards.filter((card) => !oneMoreTuneDue(card.id));
    return oneMoreTuneSpaceSiblings([...due, ...rest]).slice(0, Math.max(1, settings.dueBatch)).map((card) => card.id);
  }
  return oneMoreTuneSpaceSiblings(cards).map((card) => card.id);
}

/**
 * Two questions that share a film — Someday's two songs — must not sit next to
 * each other: answering the first hands over the second. This nudges any such
 * pair apart rather than reshuffling until luck separates them.
 */
function oneMoreTuneSpaceSiblings(cards) {
  const ordered = [...cards];
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    if (ordered[i].film && ordered[i].film === previous.film) {
      const swapWith = ordered.findIndex((card, index) => index > i && card.film !== previous.film);
      if (swapWith > -1) [ordered[i], ordered[swapWith]] = [ordered[swapWith], ordered[i]];
    }
  }
  return ordered;
}

/**
 * One association, one question of a round.
 *
 * Two cards can be the same answer: a pair the deck declares as siblings, and
 * two records of one recording. A round that asks both asks one thing twice,
 * and the second time the answer key names it differently, so the first answer
 * reads as wrong. The private practice round is the only round the window still
 * builds, and it is held to the same rule the authority applies to its own.
 */
function oneMoreTuneOncePerAssociation(cards) {
  const asked = new Set();
  const heard = new Set();
  return cards.filter((card) => {
    const sibling = String(card.siblingOf || "");
    const recording = oneMoreTuneRecordingKey(card);
    if (sibling && asked.has(sibling)) return false;
    if (card.knowledgeGroup && asked.has(card.knowledgeGroup)) return false;
    if (recording && heard.has(recording)) return false;
    asked.add(card.id);
    if (card.knowledgeGroup) asked.add(card.knowledgeGroup);
    if (recording) heard.add(recording);
    return true;
  });
}

function startOneMoreTuneUnit(unitId) {
  stopOneMoreTuneAudio();
  clearOneMoreTuneNowPlaying();
  oneMoreTuneUndo = null;
  oneMoreTuneSession = {
    unitId,
    step: "learn",
    queue: oneMoreTunePhaseQueue(unitId, "learn"),
    index: 0,
    revealed: false,
    options: [],
    revealedThisSession: new Set(),
    mediaPlayed: false,
    autoPlayed: false,
  };
  oneMoreTuneView = "study";
  if (!oneMoreTuneSession.queue.length) advanceOneMoreTunePhase();
  else prepareOneMoreTuneStep();
  renderOneMoreTune();
}

/**
 * One card, from the shelf, because the card on the shelf is a door.
 *
 * The unit's own session starts at whatever is next due; a person who pressed
 * "See this card" asked for that card, so it leads the queue whether or not it
 * was the next one the schedule wanted.
 */
function startOneMoreTuneCard(cardId) {
  const card = oneMoreTuneCard(String(cardId || ""));
  if (!card) return;
  startOneMoreTuneUnit(card.unit);
  if (!oneMoreTuneSession) return;
  oneMoreTuneSession.step = "learn";
  oneMoreTuneSession.queue = [card.id, ...oneMoreTuneSession.queue.filter((id) => id !== card.id)];
  oneMoreTuneSession.index = 0;
  oneMoreTuneSession.revealed = false;
  oneMoreTuneSession.options = [];
  prepareOneMoreTuneStep();
  renderOneMoreTune();
}

function advanceOneMoreTunePhase() {
  const order = ["learn", "match", "recall"];
  let next = order[order.indexOf(oneMoreTuneSession.step) + 1];
  while (next) {
    const queue = oneMoreTunePhaseQueue(oneMoreTuneSession.unitId, next);
    if (queue.length) {
      oneMoreTuneSession.step = next;
      oneMoreTuneSession.queue = queue;
      oneMoreTuneSession.index = 0;
      oneMoreTuneSession.revealed = false;
      prepareOneMoreTuneStep();
      return;
    }
    next = order[order.indexOf(next) + 1];
  }
  // Nothing left to do in this unit: an empty queue is what the study view
  // reads as "finished".
  oneMoreTuneSession.queue = [];
  oneMoreTuneSession.index = 0;
}

function prepareOneMoreTuneStep() {
  const card = oneMoreTuneCard(oneMoreTuneSession.queue[oneMoreTuneSession.index]);
  if (!card) return;
  oneMoreTuneSession.revealed = false;
  oneMoreTuneSession.mediaPlayed = false;
  // A new card, or a new step, gets its own autoplay.
  oneMoreTuneSession.autoPlayed = false;
  // Two options while a pairing is new, four once this card has been matched
  // before. The count belongs to the question, so it is decided here rather
  // than by whatever the last render happened to draw.
  const record = oneMoreTuneRecord(card.id);
  const answered = record.match.right + record.match.wrong;
  oneMoreTuneSession.options = oneMoreTuneSession.step === "match" ? oneMoreTuneOptions(card, answered >= 1 ? 4 : 2) : [];
  stopOneMoreTuneAudio();
}

function advanceOneMoreTuneCard() {
  if (!oneMoreTuneSession) return;
  stopOneMoreTuneAudio();
  oneMoreTuneSession.index += 1;
  if (oneMoreTuneSession.index >= oneMoreTuneSession.queue.length) advanceOneMoreTunePhase();
  else prepareOneMoreTuneStep();
  renderOneMoreTune();
}

function endOneMoreTuneSession() {
  stopOneMoreTuneAudio();
  clearOneMoreTuneNowPlaying();
  oneMoreTuneSession = null;
  oneMoreTuneUndo = null;
  oneMoreTuneView = "shelf";
  renderOneMoreTune();
}

function answerOneMoreTuneMatch(chosenId) {
  if (!oneMoreTuneSession || oneMoreTuneSession.step !== "match") return;
  const card = oneMoreTuneCard(oneMoreTuneSession.queue[oneMoreTuneSession.index]);
  if (!card) return;
  const record = oneMoreTuneRecord(card.id);
  const right = chosenId === card.id;
  if (right) record.match.right += 1;
  else record.match.wrong += 1;
  record.met = true;
  appendOneMoreTuneEvent({ type: "match", cardId: card.id, correct: right, mediaPlayed: oneMoreTuneSession.mediaPlayed });
  writeOneMoreTuneState();
  setStatus(t(right ? "one_more_tune_match_right" : "one_more_tune_match_wrong"));
  advanceOneMoreTuneCard();
}

function revealOneMoreTuneCard() {
  if (!oneMoreTuneSession || oneMoreTuneSession.step !== "recall" || oneMoreTuneSession.revealed) return;
  oneMoreTuneSession.revealed = true;
  renderOneMoreTune();
}

function gradeOneMoreTuneCard(gradeId) {
  if (!oneMoreTuneSession || !oneMoreTuneSession.revealed) return;
  const cardId = oneMoreTuneSession.queue[oneMoreTuneSession.index];
  oneMoreTuneGrade(cardId, gradeId, { mediaPlayed: oneMoreTuneSession.mediaPlayed });
  advanceOneMoreTuneCard();
}

function renderOneMoreTuneStudy(body) {
  if (!oneMoreTuneSession) {
    const settings = oneMoreTuneStateNow().settings;
    body.innerHTML = `
      <section class="one-more-tune-study one-more-tune-study-idle section">
        <div class="section-heading"><div><div class="eyebrow" data-i18n="one_more_tune_units_eyebrow">SMALL LESSONS / NO LOCKED PATHS</div><h2 data-i18n="one_more_tune_pick_unit">Pick a unit to study</h2></div></div>
        <div class="unit-grid">
          ${ONE_MORE_TUNE_UNITS.map((unit, index) => {
            const size = oneMoreTuneUnitCards(unit.id).length;
            const seen = oneMoreTuneUnitCards(unit.id).filter((card) => oneMoreTuneRecord(card.id).met).length;
            return `<article class="unit">
              <div class="unit-top"><span class="chip">UNIT ${String(index + 1).padStart(2, "0")} · ${size}</span><span class="unit-dots" aria-hidden="true">${oneMoreTuneUnitCards(unit.id).map((card) => `<span class="${oneMoreTuneRecord(card.id).met ? "seen" : ""}"></span>`).join("")}</span></div>
              <h3>${oneMoreTuneEscape(t(unit.labelKey))}</h3>
              <p>${t("one_more_tune_unit_met").replace("{met}", String(seen)).replace("{total}", String(size))}</p>
              <button class="btn ghost" type="button" data-one-more-tune-open-unit="${unit.id}" data-i18n="one_more_tune_unit_start">Start this unit</button>
            </article>`;
          }).join("")}
        </div>
        <p class="hint" data-i18n="one_more_tune_study_hint">Each unit: meet, match, recall.</p>
        <div class="one-more-tune-budget">
          <label class="one-more-tune-clip-field"><span data-i18n="one_more_tune_new_per_day">New cards a day</span><input type="number" min="1" max="20" id="one-more-tune-new-per-day" value="${settings.newPerDay}" /></label>
          <label class="one-more-tune-clip-field"><span data-i18n="one_more_tune_due_batch">Due cards a session</span><input type="number" min="1" max="50" id="one-more-tune-due-batch" value="${settings.dueBatch}" /></label>
        </div>
        <p class="hint" data-i18n="one_more_tune_budget_note">Most per session. Time away never builds a backlog.</p>
      </section>`;
    return;
  }
  const card = oneMoreTuneCard(oneMoreTuneSession.queue[oneMoreTuneSession.index]);
  if (!card) {
    body.innerHTML = `
      <section class="one-more-tune-study one-more-tune-study-done">
        <h3 data-i18n="one_more_tune_unit_done">Unit finished</h3>
        <p class="hint" data-i18n="one_more_tune_unit_done_hint">Grades are saved; cards you were just shown count as practice.</p>
        <button class="btn default" type="button" data-one-more-tune-command="one-more-tune-end-session" data-i18n="one_more_tune_back_to_shelf">Back to the shelf</button>
      </section>`;
    return;
  }
  if (oneMoreTuneSession.step === "learn") renderOneMoreTuneLearn(body, card);
  else if (oneMoreTuneSession.step === "match") renderOneMoreTuneMatch(body, card);
  else renderOneMoreTuneRecall(body, card);
  // Every card face asks for its own sound as it appears — meeting the card,
  // matching it, recalling it — because the pairing is the sound.
  void autoPlayOneMoreTuneStudySound(card);
}

function renderOneMoreTuneLearn(body, card) {
  oneMoreTuneSession.revealedThisSession.add(card.id);
  const record = oneMoreTuneRecord(card.id);
  if (!record.met) {
    record.met = true;
    // Meeting a card is an exposure, and an exposure is not a recall. It is
    // logged as its own kind so nothing downstream can count it as one.
    appendOneMoreTuneEvent({ type: "exposure", cardId: card.id, mediaPlayed: false });
  }
  writeOneMoreTuneState();
  announceOneMoreTuneNowPlaying(card);
  const total = oneMoreTuneSession.queue.length;
  body.innerHTML = `
      <section class="one-more-tune-study one-more-tune-step-learn" aria-labelledby="one-more-tune-step-title">
        ${oneMoreTuneLessonCard({
          card,
          stageKey: "one_more_tune_step_learn",
          era: true,
          stageOn: true,
          body: `${oneMoreTuneCardCopy(card)}
            ${card.recordingWarning ? `<p class="notice" data-i18n="one_more_tune_recording_warning">The film uses a different recording from the album version.</p>` : ""}
            <div class="recall-bottom">
              <button class="btn default" type="button" data-one-more-tune-command="one-more-tune-next" data-i18n="one_more_tune_next">Next</button>
              <button class="textbtn" type="button" data-one-more-tune-command="one-more-tune-end-session" data-i18n="one_more_tune_leave">Leave</button>
            </div>`,
          footLeft: t("one_more_tune_stage_foot_learn"),
          footRight: `${oneMoreTuneSession.index + 1} / ${total}`,
        })}
        ${oneMoreTuneBackstage() ? oneMoreTunePlayerBlock(card) : ""}
      </section>`;
}

function renderOneMoreTuneMatch(body, card) {
  clearOneMoreTuneNowPlaying();
  const options = oneMoreTuneSession.options || [];
  const total = oneMoreTuneSession.queue.length;
  body.innerHTML = `
      <section class="one-more-tune-study one-more-tune-step-match" aria-labelledby="one-more-tune-step-title">
        ${oneMoreTuneLessonCard({
          card,
          stageKey: "one_more_tune_step_match",
          body: `<div class="recall-prompt">
              <h2 id="one-more-tune-step-title" data-i18n="${oneMoreTunePromptKey(card)}">Which one does this belong to?</h2>
            </div>
            <div class="choices">
              ${options.map((option, index) => `<button class="choice" type="button" data-one-more-tune-answer="${oneMoreTuneEscape(option.id)}"><span class="letter">${String.fromCharCode(65 + index)}</span>${oneMoreTuneEscape(option.product)}</button>`).join("")}
            </div>`,
          footLeft: t("one_more_tune_stage_foot_match"),
          footRight: `${oneMoreTuneSession.index + 1} / ${total}`,
        })}
        ${oneMoreTuneStudySound(card)}
      </section>`;
}

/**
 * The recall question. Nothing about the answer reaches this markup: no title,
 * no artist, no product, no artwork, no film, and the file's name is never
 * printed. The reveal is a separate render, and only that one carries them.
 */
function renderOneMoreTuneRecall(body, card) {
  clearOneMoreTuneNowPlaying();
  if (oneMoreTuneSession.revealed) {
    renderOneMoreTuneReveal(body, card);
    return;
  }
  const total = oneMoreTuneSession.queue.length;
  body.innerHTML = `
      <section class="one-more-tune-study one-more-tune-step-recall one-more-tune-face" aria-labelledby="one-more-tune-step-title">
        ${oneMoreTuneLessonCard({
          card,
          stageKey: "one_more_tune_step_recall",
          body: `<div class="recall-prompt">
              <h2 id="one-more-tune-step-title" data-i18n="one_more_tune_recall_prompt">Play it, answer in your head, then turn the card over.</h2>
            </div>
            <div class="recall-bottom">
              <button class="btn default" type="button" data-one-more-tune-command="one-more-tune-reveal" data-i18n="one_more_tune_reveal">Turn the card over</button>
              <button class="textbtn" type="button" data-one-more-tune-command="one-more-tune-skip" data-i18n="one_more_tune_skip">Skip</button>
            </div>`,
          footLeft: t("one_more_tune_stage_foot_recall"),
          footRight: `${oneMoreTuneSession.index + 1} / ${total}`,
        })}
        ${oneMoreTuneStudySound(card)}
      </section>`;
}

function renderOneMoreTuneReveal(body, card) {
  announceOneMoreTuneNowPlaying(card);
  const practiceOnly = oneMoreTuneSession.revealedThisSession.has(card.id);
  const total = oneMoreTuneSession.queue.length;
  body.innerHTML = `
      <section class="one-more-tune-study one-more-tune-step-reveal one-more-tune-face" aria-labelledby="one-more-tune-step-title">
        ${oneMoreTuneLessonCard({
          card,
          stageKey: "one_more_tune_step_reveal",
          era: true,
          body: `${oneMoreTuneCardCopy(card)}
            <div class="ratings" role="group" data-i18n-aria-label="one_more_tune_grades" aria-label="How did that go?">
              ${oneMoreTuneGradeButtons(card.id)}
            </div>
            <div class="recall-bottom">
              <button class="textbtn" type="button" data-one-more-tune-command="one-more-tune-undo" data-i18n="one_more_tune_undo_grade">Undo that grade</button>
              <button class="btn" type="button" data-one-more-tune-command="one-more-tune-next" data-i18n="one_more_tune_next">Next</button>
              <button class="textbtn" type="button" data-one-more-tune-command="one-more-tune-end-session" data-i18n="one_more_tune_leave">Leave</button>
            </div>`,
          footLeft: practiceOnly ? t("one_more_tune_practice_only") : "",
          footRight: `${oneMoreTuneSession.index + 1} / ${total}`,
        })}
        ${oneMoreTuneBackstage() ? oneMoreTunePlayerBlock(card) : ""}
      </section>`;
}

/** The authority's routes, named the way the service boundary names them. */
const ONE_MORE_TUNE_ROUND_ROUTE = "round";
const ONE_MORE_TUNE_ANSWER_ROUTE = "answer";
const ONE_MORE_TUNE_REPORT_ROUTE = "report";

function oneMoreTuneChallengePool() {
  return ONE_MORE_TUNE_CARDS.filter((card) => oneMoreTuneReadiness(card.id).recall && oneMoreTuneHasAudio(card.id));
}

/** Cards a round can be asked from: the pairing is settled. */
function oneMoreTuneRoundPool() {
  return ONE_MORE_TUNE_CARDS.filter((card) => oneMoreTuneReadiness(card.id).learn);
}

/** True when the person is practising on their own copy. */
function oneMoreTuneRoundIsPractice() {
  return oneMoreTuneRound?.mode === "practice";
}

/**
 * The round authority, reached through the service boundary rather than by
 * fetching its route from here. Same origin, same JSON, one registration in
 * app/core/service-providers.js instead of three in this file.
 */
async function oneMoreTuneRequestRoute(route, { body = null, cache = "no-store", id = "" } = {}) {
  const response = await window.AISystem6Capabilities.requestService("oneMoreTune.api", {
    route,
    id,
    init: {
      method: body === null ? "GET" : "POST",
      cache,
      ...(body === null ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    },
  });
  if (!response.ok) throw new Error(`one-more-tune ${route} ${response.status}`);
  return response.json();
}

/**
 * Accept a server question only if it looks like the wire shape the package
 * defines: a token, a prompt, four choice tokens with words, and a media
 * descriptor. A payload that carries anything else — a card id, a song, a
 * product — is refused rather than rendered, because a question page that
 * quietly accepted one would be the leak it exists to prevent.
 */
function oneMoreTuneAcceptServerQuestion(raw) {
  const token = String(raw?.token || "");
  const choices = Array.isArray(raw?.choices) ? raw.choices : [];
  const allowed = ["token", "prompt", "choices", "media", "creditsUrl"];
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return null;
  if (Object.keys(raw).some((key) => !allowed.includes(key))) return null;
  if (!String(raw.prompt || "").startsWith("one_more_tune_which_")) return null;
  if (choices.length !== 4) return null;
  if (new Set(choices.map((choice) => choice?.id)).size !== 4) return null;
  for (const choice of choices) {
    if (!/^[A-Za-z0-9_-]{12,}$/.test(String(choice?.id || ""))) return null;
    if (typeof choice?.label !== "string" || !choice.label.trim()) return null;
  }
  const media = raw.media || {};
  // "none" is one question whose card no source answered for: it arrives
  // already broken and is skipped, never scored.
  if (!["preview", "youtube", "licensed_file", "none"].includes(media.provider)) return null;
  if (media.provider === "youtube" && !/^[\w-]{11}$/.test(String(media.videoId || ""))) return null;
  if (media.provider === "preview" && !/^https:\/\/[\w.-]+\//.test(String(media.url || ""))) return null;
  if (media.provider !== "none" && (!Number.isFinite(media.startSeconds) || !Number.isFinite(media.endSeconds) || media.endSeconds <= media.startSeconds)) return null;
  return {
    token,
    prompt: String(raw.prompt),
    choices: choices.map(({ id, label }) => ({ id, label })),
    media,
    creditsUrl: String(raw.creditsUrl || ""),
  };
}

/** Open the server's round, or null when this build has no round authority. */
async function oneMoreTuneOpenServerRound(options = {}) {
  try {
    const payload = await oneMoreTuneRequestRoute(ONE_MORE_TUNE_ROUND_ROUTE, { body: {
      challengeId: String(options.challengeId || ""),
      questionIndex: Number.isInteger(options.questionIndex) ? options.questionIndex : -1,
    } });
    const questions = (payload?.questions || [])
      .map(oneMoreTuneAcceptServerQuestion)
      .filter(Boolean)
      .map(oneMoreTuneBlankQuestion);
    if (!questions.length) return null;
    return {
      mode: ["licensed", "youtube", "preview"].includes(payload.mode) ? payload.mode : "preview",
      roundToken: String(payload.roundToken || ""),
      setId: String(payload.setId || ""),
      deckVersion: Number(payload.deckVersion) || 0,
      questions,
      origin: "server",
    };
  } catch {
    return null;
  }
}

function oneMoreTuneBlankQuestion(question) {
  return {
    ...question,
    heard: 0,
    everHeard: false,
    mediaFailed: question.media?.provider === "none",
    submitted: false,
    chosen: "",
    correct: false,
    points: 0,
    outcome: "",
    reveal: null,
  };
}

/**
 * A private practice round over the person's own copy. It is built here because
 * the answer key for someone's own file is theirs, not the server's business.
 */
function oneMoreTuneOpenPracticeRound(cards) {
  const questions = cards.slice(0, ONE_MORE_TUNE_ROUND_SIZE).map((card) => {
    const options = oneMoreTuneOptions(card, 4);
    return oneMoreTuneBlankQuestion({
      token: `local-${card.id}-${Date.now().toString(36)}`,
      prompt: oneMoreTunePromptKey(card),
      media: { provider: "own_file", cardId: card.id },
      creditsUrl: "",
      choices: options.map((option) => ({ id: `local-${option.id}-choice`, label: option.product })),
      localAnswer: card.id,
      localReveal: {
        product: card.product,
        film: card.film,
        year: card.year ?? null,
        song: card.song,
        artist: card.artist,
        note: card.note || null,
        videoId: card.videoId || "",
        anchorVideoId: card.anchorVideoId || "",
        sourceAnchor: Number.isInteger(card.sourceAnchor) ? card.sourceAnchor : null,
      },
    });
  });
  return { mode: "practice", questions, origin: "local" };
}

function oneMoreTuneAdoptRound(round, { index = 0, single = false } = {}) {
  stopOneMoreTuneAudio();
  clearOneMoreTuneNowPlaying();
  const questions = round.questions || [];
  const start = Number.isInteger(index) && index >= 0 && index < questions.length ? index : 0;
  oneMoreTuneRound = {
    startedAt: Date.now(),
    mode: round.mode,
    origin: round.origin,
    token: round.roundToken || "",
    setId: round.setId || "",
    deckVersion: round.deckVersion || 0,
    index: start,
    // One question a link named on its own. Its index is 0 of 1, not a place
    // in the set's ten, so it never writes or clears this device's cursor.
    single: single === true,
    questions,
  };
  oneMoreTuneView = "challenge";
  oneMoreTuneRememberRound();
  renderOneMoreTune();
}

/**
 * Keep the round's place on this device.
 *
 * Lifeline's loop is the model: the wrist raises, the message is read, one
 * decision is made, the wrist drops — and the story waits. Nothing here is
 * server state: a set id and a deck version already name the same ten questions
 * for everyone, which is what the share link relies on, so the cursor needs no
 * more than the question it reached. Written on every move (start, advance,
 * answer) and cleared when the round is over or refused as stale.
 */
function oneMoreTuneRememberRound() {
  if (oneMoreTuneRound?.single) return;
  const state = oneMoreTuneStateNow();
  if (!oneMoreTuneRound?.setId) {
    state.round = null;
    writeOneMoreTuneState();
    return;
  }
  state.round = {
    setId: oneMoreTuneRound.setId,
    deckVersion: Number(oneMoreTuneRound.deckVersion || 0),
    index: oneMoreTuneRound.index,
    mode: oneMoreTuneRound.mode,
    startedAt: oneMoreTuneRound.startedAt,
  };
  writeOneMoreTuneState();
}

function oneMoreTuneForgetRound() {
  const state = oneMoreTuneStateNow();
  if (!state.round) return;
  state.round = null;
  writeOneMoreTuneState();
}

/** The stored round, when this deck can still build the set it names. */
function oneMoreTuneResumableRound() {
  const stored = oneMoreTuneStateNow().round;
  if (!stored) return null;
  const deckVersion = Number(ONE_MORE_TUNE_DECK_VERSION || 0);
  if (deckVersion && stored.deckVersion && stored.deckVersion !== deckVersion) return null;
  // A round that reached its end is not a round to come back to.
  if (stored.index >= ONE_MORE_TUNE_ROUND_SIZE) return null;
  return stored;
}

/**
 * The question plays itself.
 *
 * The sound *is* the question: asking somebody to press Play before they can
 * hear it makes a listening game into a two-tap one. The round was entered by a
 * tap ("Start a round", or the shelf's own start), and that tap unlocked the
 * audio, so every question after it starts on its own. A press on the player is
 * a replay — and the retry, when the browser refused the sound the first time.
 *
 * Nothing here claims a sound that did not start: `playOneMoreTuneQuestion`
 * reports the failure on the face, and a question whose cue never played is
 * never scored as a miss.
 */
function autoPlayOneMoreTuneQuestion() {
  const question = oneMoreTuneQuestion();
  if (!question || question.submitted || question.autoPlayed) return false;
  question.autoPlayed = true;
  return playOneMoreTuneQuestion(question).then(() => renderOneMoreTune());
}

/**
 * Get the sound ready before anybody asks for it.
 *
 * Playback needs a gesture; *fetching and decoding* do not. This deck used to
 * do both inside the press that wanted the sound, so the press paid the whole
 * download — measured on a phone-sized WebKit against the live site: six
 * seconds between the tap and the first note on a cold question, which is not a
 * quiz, it is a wait with a question attached. Called when a question's face is
 * painted and again, opportunistically, for the question after it: by the time
 * a finger lands on the record, starting it is the only work left.
 */
function preloadOneMoreTuneQuestion(question = oneMoreTuneQuestion()) {
  if (!question || question.submitted) return null;
  const media = question.media || {};
  if (media.provider !== "preview" && media.provider !== "licensed_file") return null;
  const key = oneMoreTuneQuestionAudioKey(question);
  if (oneMoreTuneAudio.buffers.has(key) || oneMoreTuneAudio.elements.has(key)) return null;
  if (question.preloading) return question.preloading;
  question.preloading = oneMoreTuneLoadMedia(question).then((ready) => {
    question.preloaded = ready === true;
    return ready;
  }).catch(() => false);
  return question.preloading;
}

/**
 * Open a round. A private practice round wins when the person has one, because
 * it is the only round that plays their own recording; otherwise the server's
 * round is used. There is no local fallback: a round without sound is not one.
 */
async function startOneMoreTuneRound() {
  const practice = oneMoreTuneOncePerAssociation(oneMoreTuneSpaceSiblings(oneMoreTuneShuffle(oneMoreTuneChallengePool())));
  if (practice.length) {
    oneMoreTuneAdoptRound(oneMoreTuneOpenPracticeRound(practice));
    await autoPlayOneMoreTuneQuestion();
    return;
  }
  setStatus(t("one_more_tune_round_opening"));
  const server = await oneMoreTuneOpenServerRound();
  if (server) {
    oneMoreTuneAdoptRound(server);
    // "The round started" means the first question is in the air: a caller that
    // waits on this one gets the sound, not just the face.
    await autoPlayOneMoreTuneQuestion();
    return;
  }
  setStatus(t("one_more_tune_no_round_pool"));
}

function oneMoreTuneQuestion() {
  return oneMoreTuneRound?.questions?.[oneMoreTuneRound.index] || null;
}

function oneMoreTuneQuestionAudioKey(question) {
  return String(question?.token || question?.media?.cardId || "");
}

/**
 * How many questions the round authority would publish right now.
 *
 * It is asked rather than computed here, because the gate is the server's — the
 * same function that decides whether a round may hand out a question at all.
 * An unreachable authority reads as "—" instead of a number this window made
 * up.
 */
let oneMoreTuneReportValue = null;

/**
 * What the authority says about the bank right now: how many questions it would
 * publish, and which source a round would use. Asked rather than computed here,
 * because the gate lives on that side. An unreachable authority reads as "—"
 * instead of a number this window made up.
 */
function oneMoreTuneServerReport() {
  if (oneMoreTuneReportValue === null) {
    // The deck's own flag first: every card carries `enabled`, and a question
    // can only be published when it is true. That is the same number the
    // authority computes, and it costs nothing to read.
    const localPublishable = ONE_MORE_TUNE_ALL_CARDS.filter((card) => card.enabled === true).length;
    oneMoreTuneReportValue = { publishable: String(localPublishable), mode: "" };
    const ask = () => oneMoreTuneRequestRoute(ONE_MORE_TUNE_REPORT_ROUTE)
      .catch(() => null)
      .then((report) => {
        if (!report) return;
        oneMoreTuneReportValue = {
          publishable: Number.isFinite(report.publishable) ? String(report.publishable) : "—",
          mode: String(report.mode || ""),
        };
        if (oneMoreTuneView === "sources" || !oneMoreTuneRound) renderOneMoreTune();
      })
      .catch(() => {});
    // On the public deployment a protected request opens the verification
    // modal, and opening a catalogue page is not a reason to ask somebody to
    // prove they are a person. The report is asked for once the visit already
    // has a session; before that the deck's own count stands, and the page
    // still says the condition is unmet rather than missing.
    const profile = document.documentElement?.dataset?.deploymentProfile || "";
    if (profile === "local") void ask();
    else if (profile === "public") {
      // The access gate already knows how to ask that question without opening
      // its modal, so the deck asks it instead of keeping a second copy of the
      // probe — and never fetches an /api path of its own.
      const session = window.AISystem6PublicAccess?.hasSession?.() || Promise.resolve(false);
      void session.then((verified) => (verified ? ask() : null)).catch(() => {});
    } else {
      // Whichever profile this is has not been announced yet. Ask when it is,
      // rather than guessing and paying for it with a modal.
      document.addEventListener("ai-system6:capabilities", () => {
        oneMoreTuneReportValue = null;
        renderOneMoreTune();
      }, { once: true });
    }
  }
  return oneMoreTuneReportValue;
}

function oneMoreTuneGateReport() {
  return oneMoreTuneServerReport().publishable;
}

/** The cue this question plays: the one approved window, whole. */
function oneMoreTuneCueWindow(question) {
  const media = question?.media || {};
  if (Number.isFinite(media.startSeconds) && Number.isFinite(media.endSeconds) && media.endSeconds > media.startSeconds) {
    return { start: media.startSeconds, end: media.endSeconds };
  }
  const clip = oneMoreTuneTimes(question?.media?.cardId || "").quizClip;
  return { start: clip.start, end: clip.end };
}

/**
 * A store preview the context could not decode, loaded as a media element
 * instead. It reports ready only once the element holds real audio, so a
 * question is never counted as heard from a load that failed.
 *
 * `sources` is the fallback chain: the store's CDN, then this host relaying the
 * same file. An element that errors on one source is pointed at the next, so a
 * network that cannot reach Apple still hears the question.
 */
async function oneMoreTuneLoadPreviewElement(key, sources) {
  const chain = (Array.isArray(sources) ? sources : [sources]).filter((value) => value);
  if (!chain.length) return false;
  if (oneMoreTuneAudio.elements.has(key)) return Promise.resolve(true);
  const element = oneMoreTuneAudioElement();
  if (!element) return false;
  for (const url of chain) {
    if (!/^(?:https:\/\/|\/api\/one-more-tune\/preview\?url=)/.test(String(url))) continue;
    // eslint-disable-next-line no-await-in-loop -- a fallback chain is sequential.
    const loaded = await new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        element.removeEventListener("loadeddata", ready);
        element.removeEventListener("error", failed);
        resolve(value);
      };
      const ready = () => {
        oneMoreTuneAudio.elements.set(key, url);
        finish(true);
      };
      const failed = () => finish(false);
      if (element.dataset.oneMoreTuneGate === "1") delete element.dataset.oneMoreTuneGate;
      if (element.src !== url) {
        element.muted = false;
        element.src = url;
      }
      element.addEventListener("loadeddata", ready);
      element.addEventListener("error", failed);
      // Some browsers report neither for a preview they will still play; the
      // timeout asks the element itself rather than guessing, and an element
      // holding real audio is a loaded preview either way.
      timer = setTimeout(() => {
        if (element.readyState >= 2) ready();
        else finish(false);
      }, 8000);
    });
    if (loaded) return true;
  }
  return false;
}

/**
 * Put this question's sound in the audio map, once.
 *
 * Three providers, and each stays inside its own boundary: the person's own
 * file (already in memory because they chose it), the store's preview, and a
 * licensed asset fetched from this origin over an opaque path. Nothing plays
 * out of a hidden player.
 */
/**
 * Where this question's sound may come from, in the order to try.
 *
 * The store's CDN first, because it is the shortest path and usually the
 * fastest. Then this desk's own host, which can reach the same file and stream
 * it back: on a network that cannot reach Apple's CDN — or reaches it too
 * slowly to start a round — the second source is the difference between a game
 * played by ear and a game with no sound at all, which is not a game.
 *
 * The relay takes the URL, and answers only for the URLs this deck pins (the
 * deck is the allowlist), so nothing here is a general-purpose proxy.
 */
function oneMoreTunePreviewSources(url) {
  const direct = String(url || "");
  if (!/^https:\/\//.test(direct)) return [];
  const relay = `/api/one-more-tune/preview?url=${encodeURIComponent(direct)}`;
  // The store's CDN answers with `Access-Control-Allow-Origin: *` (measured,
  // 2026-09-20), so a cross-origin fetch and decode is allowed, and a media
  // element does not need CORS at all. The relay is not a workaround for iOS
  // — it is for the network: a reader whose connection cannot reach Apple's
  // CDN, or cannot reach it fast enough to start a question, still hears the
  // question through this host's copy of the same pinned file.
  return [direct, relay];
}

async function oneMoreTuneLoadMedia(question) {
  const key = oneMoreTuneQuestionAudioKey(question);
  const media = question?.media || {};
  if (oneMoreTuneAudio.buffers.has(key) || oneMoreTuneAudio.elements.has(key)) return true;
  if (media.provider === "own_file") return oneMoreTuneAudio.buffers.has(String(media.cardId || ""));
  if (media.provider === "preview") {
    // The store's own promotional preview of the recording, fetched straight
    // from Apple's CDN. The URL is opaque — no title, no cover, no product —
    // and the round says in words that this source is not licensed for the
    // project yet. If the reader's network cannot fetch it, the same bytes come
    // back through this host (see oneMoreTunePreviewSources).
    const context = oneMoreTuneAudioContext();
    if (context && !oneMoreTuneAudio.contextCannotDecode) {
      let decodeRefused = false;
      for (const source of oneMoreTunePreviewSources(media.url)) {
        try {
          // eslint-disable-next-line no-await-in-loop -- the sources are a fallback chain.
          const response = await fetch(source, { credentials: "omit" });
          if (!response.ok) continue;
          // eslint-disable-next-line no-await-in-loop -- same chain.
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          const window = oneMoreTuneCueWindow(question);
          if (Number.isFinite(buffer.duration) && buffer.duration > 0 && window.start < buffer.duration) {
            oneMoreTuneAudio.buffers.set(key, buffer);
            return true;
          }
        } catch {
          // A context that cannot decode what the store serves still meets a
          // player that can. WebKit refuses these previews every time, so it is
          // not asked twice — on a phone that saves a megabyte and a second of
          // silence before each question, which is the difference between an
          // autoplay and a wait. A network failure is not that: it moves on to
          // the next source instead.
          decodeRefused = true;
        }
      }
      if (decodeRefused) oneMoreTuneAudio.contextCannotDecode = true;
    }
    return oneMoreTuneLoadPreviewElement(key, oneMoreTunePreviewSources(media.url));
  }
  if (media.provider === "licensed_file") {
    const context = oneMoreTuneAudioContext();
    if (!context) return false;
    const url = new URL(String(media.url || ""), location.origin);
    if (url.origin !== location.origin || !/^\/api\/one-more-tune\/media\//.test(url.pathname)) return false;
    try {
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return false;
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const window = oneMoreTuneCueWindow(question);
      if (window.end > buffer.duration + 0.002) return false;
      oneMoreTuneAudio.buffers.set(key, buffer);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Play the question's cue, whole, from the start.
 *
 * Nothing autoplays, nothing overlaps, and a cue that cannot sound marks the
 * question skippable instead of scoring it.
 */
async function playOneMoreTuneQuestion(question) {
  if (!question) return false;
  oneMoreTuneAudio.pendingCue = true;
  paintOneMoreTuneDisc();
  try {
    return await playOneMoreTuneQuestionCue(question);
  } finally {
    oneMoreTuneAudio.pendingCue = false;
    paintOneMoreTuneDisc();
  }
}

async function playOneMoreTuneQuestionCue(question) {
  if (question.media?.provider === "none") {
    question.mediaFailed = true;
    setStatus(t("one_more_tune_media_unavailable"));
    return false;
  }
  if (question.media?.provider === "youtube") {
    // The song's own video, in YouTube's visible player. Readiness is reported
    // by the player itself, so a listen is only counted once it is playing.
    const posted = playOneMoreTuneSong(question);
    if (!posted && !oneMoreTuneVideo.slotId) {
      question.mediaFailed = true;
      setStatus(t("one_more_tune_media_unavailable"));
      renderOneMoreTune();
    }
    return posted;
  }
  if (!(await oneMoreTuneLoadMedia(question))) {
    question.mediaFailed = true;
    setStatus(t("one_more_tune_media_unavailable"));
    renderOneMoreTune();
    return false;
  }
  // The question after this one is almost certainly next, and its download can
  // happen while this one is playing: the round is ten questions, so warming
  // one ahead is what keeps every tap after the first instant.
  preloadOneMoreTuneQuestion(oneMoreTuneRound?.questions?.[(oneMoreTuneRound?.index ?? 0) + 1]);
  const { start, end } = oneMoreTuneCueWindow(question);
  const key = oneMoreTuneQuestionAudioKey(question);
  const played = playOneMoreTuneWindow(key, start, end);
  if (!played) {
    question.mediaFailed = true;
    return false;
  }
  // A context iOS kept suspended schedules the node and sounds nothing, while
  // the face would say a sound started. The question is only counted as heard
  // once the context is really running; the writer is told to tap once more,
  // which is the gesture that lets it through.
  const context = oneMoreTuneAudio.context;
  // Only a *suspended* context is the iOS refusal this reports. An engine that
  // does not publish `state` at all is trusted, as it was before this check.
  if (oneMoreTuneAudio.buffers.has(key) && context?.state === "suspended") {
    await context.resume?.().catch?.(() => {});
    if (context.state === "suspended") {
      question.mediaFailed = true;
      setStatus(t("one_more_tune_audio_blocked"));
      renderOneMoreTune();
      return false;
    }
  }
  question.mediaFailed = false;
  question.heard += 1;
  question.everHeard = true;
  // The sound is in the air, so the disc follows it from here: the arc reads the
  // cue's own clock, and the platter turns for as long as that clock moves.
  paintOneMoreTuneDisc();
  startOneMoreTuneDiscTicker();
  return true;
}

/**
 * One submission a question, and the sound stops with it.
 *
 * A published question is scored by the server, which is where its answer lives;
 * a private practice question is scored here. A skip is recorded as a skip and a
 * cue that never played is not a miss, which is the distinction the review page
 * shows.
 */
async function submitOneMoreTuneAnswer(chosenId, { outcome = "answered" } = {}) {
  const question = oneMoreTuneQuestion();
  if (!question || question.submitted) return;
  question.submitted = true;
  question.chosen = chosenId;
  question.outcome = chosenId ? "answered" : outcome;
  // The press is answered on the frame it lands: the chosen row stays down and
  // the other three step back while the authority scores it, so a slow network
  // reads as "sent" rather than as a tap that did nothing.
  question.pending = true;
  const room = document.querySelector?.(".one-more-tune-window .omt-room");
  room?.setAttribute?.("data-omt-waiting", "");
  room?.querySelectorAll?.("[data-one-more-tune-submit]").forEach((button) => {
    if (button.dataset.oneMoreTuneSubmit === chosenId) button.dataset.state = "pending";
    button.setAttribute("aria-disabled", "true");
  });
  stopOneMoreTuneAudio();
  if (oneMoreTuneRound.origin === "server") {
    try {
      const result = await oneMoreTuneRequestRoute(ONE_MORE_TUNE_ANSWER_ROUTE, { body: {
        roundToken: oneMoreTuneRound.token,
        questionToken: question.token,
        choiceToken: chosenId,
        skipped: question.outcome === "skipped",
      } });
      question.correct = result.correct === true;
      question.points = Number(result.points) || 0;
      question.reveal = result.reveal || null;
      question.correctChoice = typeof result.correctChoice === "string" ? result.correctChoice : "";
    } catch {
      // The round did not take the answer, so this question has no result at
      // all: no reveal, no verdict, no point. It is marked as its own state
      // rather than as a wrong answer, because the two are different things —
      // the reveal that never arrived used to be rendered as "not that one",
      // which scores a person for the server's refusal.
      question.correct = false;
      question.points = 0;
      question.outcome = "failed";
      question.answerFailed = true;
      setStatus(t("one_more_tune_answer_failed"));
    }
  } else {
    question.correct = Boolean(chosenId) && chosenId === `local-${question.localAnswer}-choice`;
    question.points = question.correct ? 1 : 0;
    question.reveal = question.localReveal || null;
  }
  appendOneMoreTuneEvent({
    type: "challenge",
    cardId: question.reveal?.product ? question.localAnswer || "" : "",
    correct: question.correct,
    points: question.points,
    outcome: question.outcome,
    // This field is the one a later reader trusts, so it records sound that
    // actually started rather than the button being pressed.
    mediaPlayed: question.everHeard === true,
    listens: question.heard,
    mode: oneMoreTuneRound?.mode || "",
  });
  question.pending = false;
  renderOneMoreTune();
}

/**
 * Send the answer the round refused a second time.
 *
 * The person's choice is still on the question, so nothing is asked of them but
 * the press: the same choice goes back out, and the round scores it if the
 * round is there again. A skip stays a skip, so a retried "give up" does not
 * quietly turn into an answer somebody never gave.
 */
async function retryOneMoreTuneAnswer() {
  const question = oneMoreTuneQuestion();
  if (!question?.answerFailed) return;
  const chosen = question.chosen || "";
  // The failed submission is unwound rather than replaced, because
  // submitOneMoreTuneAnswer refuses a question that already has one.
  question.submitted = false;
  question.answerFailed = false;
  question.revealPainted = false;
  question.reveal = null;
  question.correct = false;
  question.points = 0;
  question.outcome = "";
  await submitOneMoreTuneAnswer(chosen, { outcome: chosen ? "answered" : "skipped" });
}

function advanceOneMoreTuneRound() {
  if (!oneMoreTuneRound) return;
  stopOneMoreTuneFilm();
  oneMoreTuneUnmountVideo();
  stopOneMoreTuneAudio();
  clearOneMoreTuneNowPlaying();
  oneMoreTuneRound.index += 1;
  // The place moves with the person: a round that reached its tenth question
  // is finished rather than paused, so the cursor goes with it. A lone
  // question finishing says nothing about the ten the cursor is kept for.
  if (oneMoreTuneRound.index >= oneMoreTuneRound.questions.length) {
    if (!oneMoreTuneRound.single) oneMoreTuneForgetRound();
  } else oneMoreTuneRememberRound();
  renderOneMoreTune();
  autoPlayOneMoreTuneQuestion();
}

function endOneMoreTuneRound() {
  stopOneMoreTuneFilm();
  stopOneMoreTuneAudio();
  clearOneMoreTuneNowPlaying();
  const single = oneMoreTuneRound?.single === true;
  oneMoreTuneRound = null;
  if (!single) oneMoreTuneForgetRound();
  renderOneMoreTune();
}

/**
 * "Something wrong with this question?", which the design puts beside the
 * reveal. It copies a line naming the card and the round, so a report points at
 * one question rather than at "one of the Apple ones".
 */
/**
 * The two things a person can send to somebody else.
 *
 * A challenge code names a fixed set and its bank version, so a friend opens
 * the same ten questions in the same order rather than a fresh random draw; a
 * score card carries the set, the version and the result, and never a song, a
 * product or an answer. Both are plain text, because this window has no public
 * URL to hand out and pretending otherwise would be a link that goes nowhere.
 */
/**
 * The address a round is shared at.
 *
 * The code on its own — OMT.2.aB3x — asks the other person to find a text box
 * and paste it, which is a step nobody takes from a feed. The link opens the
 * desk, opens this window, and opens this exact ten, so what travels is one tap.
 * The code is kept beside it for the box that still accepts one, and because a
 * link that has been mangled by a chat app can still be read out.
 */
function oneMoreTuneShareLink(index = -1) {
  const code = oneMoreTuneShareCode(index);
  if (!code) return "";
  const origin = String(window.location?.origin || "");
  const base = /^https?:/i.test(origin) ? origin : "";
  return `${base}/?launch=one-more-tune&set=${encodeURIComponent(code)}`;
}

function oneMoreTuneShareCode(index = -1) {
  const round = oneMoreTuneRound;
  if (!round?.setId) return "";
  const head = `OMT.${round.deckVersion || 1}.${round.setId}`;
  return index >= 0 ? `${head}.${index}` : head;
}

/**
 * The set as the design prints it: 第 0042 套.
 *
 * Four digits, because that is the number a person reads off the share card and
 * types into a chat, and because the number is now the whole identity of a set:
 * anyone holding it can rebuild the same ten from the same deck, which is what
 * makes a link worth sending.
 */
function oneMoreTuneSetNumber() {
  const setId = String(oneMoreTuneRound?.setId || "");
  return /^\d{1,6}$/.test(setId) ? setId.padStart(4, "0") : setId;
}

function oneMoreTuneScoreCard() {
  const round = oneMoreTuneRound;
  if (!round) return "";
  const right = round.questions.filter((question) => question.correct).length;
  return [
    // The card travels out of the window and into a chat, so it is written in
    // the language the desk is in rather than in the language this file was
    // first drafted in.
    t("one_more_tune_score_card_title")
      .replace("{setId}", oneMoreTuneSetNumber())
      .replace("{version}", String(round.deckVersion || 1)),
    t("one_more_tune_score_card_right")
      .replace("{right}", String(right))
      .replace("{total}", String(round.questions.length)),
    t("one_more_tune_score_card_same"),
    // The link, not only the code: a chat turns a URL into something tappable,
    // and this text is meant to be pasted into a chat. The code stays beside it
    // in the first line for anybody who would rather read it out.
    oneMoreTuneShareLink() || oneMoreTuneShareCode(),
  ].join("\n");
}

/**
 * Send a finished round to a friend.
 *
 * The three places this deck is passed around — WeChat, Telegram, iMessage —
 * all take an image, and the poster is the thing worth sending: it carries the
 * score, the ten cells, the era the round ended in and where to find the desk,
 * with no song titles on it (the same ten questions play for whoever opens the
 * link, so a name would be the answer). Score comparison is deliberately absent
 * too: this is meant to be a happy thing to send, not a ladder.
 *
 * The order of the three ways out matters. A share sheet is the best one when
 * the platform has it and accepts files. Downloading the image is second — the
 * person can put it wherever they like. Copying the text is always last and
 * always happens, because a chat window that refuses the sheet still accepts a
 * paste, and a shared round with no poster is better than no shared round.
 */
async function shareOneMoreTuneRound() {
  const round = oneMoreTuneRound;
  if (!round) return;
  const canvas = oneMoreTuneShareCardCanvas();
  const text = oneMoreTuneScoreCard();
  if (!canvas) {
    await copyOneMoreTuneText(text, "one_more_tune_share_round_copied");
    return;
  }
  const file = await new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ? new File([blob], `one-more-tune-${round.setId || "set"}.png`, { type: "image/png" }) : null), "image/png");
    } catch {
      resolve(null);
    }
  });
  if (file && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: t("one_more_tune_share_sheet_title"),
        text: `${text}\n\n${ONE_MORE_TUNE_BILIBILI}`,
      });
      setStatus(t("one_more_tune_share_round_sent"));
      return;
    } catch (error) {
      // A cancelled sheet is a decision, not a failure: the poster must not
      // arrive in somebody's Files anyway because they changed their mind.
      if (error?.name === "AbortError") return;
    }
  }
  downloadOneMoreTuneShareCard();
  await copyOneMoreTuneText(text, "one_more_tune_share_round_saved");
}

async function copyOneMoreTuneText(text, doneKey) {
  if (!text) {
    setStatus(t("one_more_tune_share_unavailable"));
    return;
  }
  try {
    await navigator.clipboard?.writeText?.(text);
    setStatus(t(doneKey));
  } catch {
    setStatus(text);
  }
}

/**
 * Send the invite the way the device sends things.
 *
 * The clipboard is the fallback, not the feature: on a phone the share sheet is
 * what turns "a link" into "a message to this group", and that is the whole loop
 * — play a set, hand the same ten to somebody else, they hand it on.
 */
async function shareOneMoreTuneInvite() {
  const link = oneMoreTuneShareLink();
  if (!link) {
    setStatus(t("one_more_tune_share_unavailable"));
    return;
  }
  const canShare = typeof navigator.share === "function";
  if (canShare) {
    try {
      await navigator.share({
        title: t("one_more_tune_share_sheet_title"),
        text: oneMoreTuneScoreCard() || link,
        url: link,
      });
      setStatus(t("one_more_tune_share_sent"));
      return;
    } catch (error) {
      // A cancelled share is not a failure to report; anything else falls
      // through to the clipboard so the link is never simply lost.
      if (error?.name === "AbortError") return;
    }
  }
  await copyOneMoreTuneText(link, "one_more_tune_share_copied");
}

/** Open a set somebody sent: the same cards, in the same order. */
async function openOneMoreTuneChallenge(code) {
  const parts = String(code || "").trim().split(".");
  if (parts.length < 3 || parts[0] !== "OMT") {
    setStatus(t("one_more_tune_challenge_code_bad"));
    return;
  }
  const explicit = parts.length > 3 ? Number.parseInt(parts[3], 10) : -1;
  // A link that names one question is that question alone, and only that link
  // asks the authority for one. A link that names a set with no question in it
  // resumes the round this device already reached into, rather than starting
  // the same ten again. That is the wrist's loop: a shared round comes back to
  // the message, the wrist raises, and the round is where it was left.
  //
  // The two used to share one index, so the device's place went to the server
  // as a question number and a resumed round came back as "question 01 / 1":
  // the ten were gone and the place was lost with them. The place is where the
  // cursor lands in the whole ten; the questions before it were already
  // passed, so they are behind the cursor rather than asked again.
  const single = Number.isInteger(explicit) && explicit >= 0 ? explicit : -1;
  const stored = single < 0 ? oneMoreTuneResumableRound() : null;
  const index = stored && stored.setId === parts[2] ? stored.index : 0;
  setStatus(t("one_more_tune_round_opening"));
  const round = await oneMoreTuneOpenServerRound({
    // The whole code travels, not just its middle: the version in it is what
    // lets the authority say "that set is from another deck" instead of serving
    // a ten that merely looks similar.
    challengeId: `OMT.${parts[1]}.${parts[2]}`,
    questionIndex: single,
  });
  if (!round) {
    // The set it names is gone or stale: a cursor pointing at it would only
    // offer a round that cannot open again.
    oneMoreTuneForgetRound();
    setStatus(t("one_more_tune_challenge_code_gone"));
    renderOneMoreTune();
    return;
  }
  if (single >= 0) oneMoreTuneAdoptRound(round, { single: true });
  else oneMoreTuneAdoptRound(round, { index });
}

async function reportOneMoreTuneQuestion() {
  const question = oneMoreTuneQuestion();
  if (!question) return;
  const reveal = question.reveal || {};
  const line = `One More Tune · ${reveal.song || question.token} — ${reveal.artist || ""} · ${reveal.film || ""} · round ${oneMoreTuneRound.index + 1}/${oneMoreTuneRound.questions.length} · mode ${oneMoreTuneRound.mode}`;
  try {
    await navigator.clipboard?.writeText?.(line);
    setStatus(t("one_more_tune_report_copied"));
  } catch {
    setStatus(line);
  }
}

/**
 * The round's room: one surface for the start, the question, the reveal and
 * the back cover.
 *
 * It is always dark — a listening room, whatever the desk's appearance — so the
 * answer's colour has somewhere to arrive, and the 1-bit desk gets the same
 * room in black and white. `data-omt-enter` marks the first paint of a face,
 * which is the only paint its entrance plays on: a reveal re-rendered by a
 * replay or a link upgrade must not shake the wrong answer a second time.
 */
function oneMoreTuneRoom(phase, inner, { era = "", enter = false } = {}) {
  return `<section class="omt-room" data-omt-phase="${phase}"${era ? ` data-lit data-era="${era}"` : ""}${enter ? " data-omt-enter" : ""} aria-labelledby="one-more-tune-step-title">
        <div class="omt-light" aria-hidden="true"></div><div class="omt-wash" aria-hidden="true"></div>
        <div class="omt-in">${inner}</div>
      </section>`;
}

/**
 * The round as a track list: side A, side B, five each. An empty slot is still
 * to come, the dotted one is playing, and a heard one carries its card's era —
 * identity, which the answer has already disclosed — and a mark for the
 * verdict, so colour never says right or wrong on its own.
 */
function oneMoreTuneTrackList(round, { enter = false } = {}) {
  const questions = round?.questions || [];
  const now = round?.index ?? 0;
  const right = questions.filter((question) => question.correct).length;
  const label = t("one_more_tune_track_label")
    .replace("{n}", String(Math.min(now + 1, questions.length)))
    .replace("{total}", String(questions.length))
    .replace("{right}", String(right));
  const slots = questions.map((question, index) => {
    const side = index === 0 ? '<span class="omt-side">A</span>'
      : index === ONE_MORE_TUNE_SIDE_TRACKS ? '<span class="omt-side is-b">B</span>' : "";
    const heard = index < now || (index === now && question.submitted);
    if (!heard) return `${side}<span class="omt-slot"${index === now ? " data-now" : ""}></span>`;
    const era = question.reveal ? oneMoreTuneEra(question.reveal) : null;
    const state = question.correct ? "right"
      : question.answerFailed || (question.mediaFailed && !question.correct) ? "broken"
        : question.outcome === "skipped" ? "skip" : "wrong";
    const mark = { right: "✓", wrong: "✕", skip: "–", broken: "!" }[state];
    return `${side}<span class="omt-slot" data-s="${state}"${era && era.id !== "none" ? ` data-era="${era.id}"` : ""}${enter && index === now ? " data-fresh" : ""}>${mark}</span>`;
  }).join("");
  return `<p class="omt-slots" role="img" aria-label="${oneMoreTuneEscape(label)}">${slots}</p>`;
}

/**
 * Which of the four was right. The round's authority says so with the answer;
 * an older authority that does not can still be read by label, and a practice
 * round knows its own answer. When none of the three can say, nothing is marked
 * right rather than something being marked by a guess.
 */
function oneMoreTuneCorrectChoiceId(question) {
  if (!question) return "";
  if (question.correctChoice) return String(question.correctChoice);
  if (question.localAnswer) return `local-${question.localAnswer}-choice`;
  const product = String(question.reveal?.product || "").trim();
  const match = product ? (question.choices || []).filter((choice) => choice.label === product) : [];
  return match.length === 1 ? match[0].id : "";
}

const ONE_MORE_TUNE_TICK = '<svg class="omt-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.6 3.6 7.4-8"></path></svg>';
const ONE_MORE_TUNE_CROSS = '<svg class="omt-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"></path></svg>';

/**
 * The challenge faces.
 *
 * A question face may show the progress, the record, the question and the four
 * choices, and nothing else: the reveal comes back from the server with the
 * submission, so there is no answer in the page to hide in the first place.
 */
function renderOneMoreTuneChallenge(body) {
  if (!oneMoreTuneRound) {
    // Every card the player can see plays; where its sound comes from is not
    // the player's business, so the start screen names none of it. A round this
    // device already reached into comes first, as a round rather than a start
    // button, and starting a fresh ten stays beside it.
    const count = oneMoreTuneChallengePool().length || oneMoreTuneRoundPool().length;
    const resumable = oneMoreTuneResumableRound();
    const resumeLine = resumable
      ? `<button class="omt-next" type="button" data-one-more-tune-command="one-more-tune-resume-round">${oneMoreTuneEscape(t("one_more_tune_continue_round").replace("{n}", String(resumable.index + 1)))}</button>`
      : "";
    body.innerHTML = oneMoreTuneRoom("idle", `
          <div class="omt-track"><p class="omt-kicker"><span data-i18n="one_more_tune_feature_ten">Every round is ten</span><span data-i18n="one_more_tune_feature_untimed">No clock</span><span data-i18n="one_more_tune_feature_reveal">The reveal opens the original</span></p></div>
          ${oneMoreTuneRoundStage(null, { idle: true })}
          <div class="omt-gap"></div>
          <div class="omt-q"><h2 class="omt-step-title" id="one-more-tune-step-title">${t("one_more_tune_hero_line")}</h2><p class="omt-intro">${t("one_more_tune_hero_intro")}</p></div>
          <div class="omt-opts">
            <div class="omt-start">${resumeLine}<button class="${resumable ? "omt-2nd" : "omt-next"}" type="button" data-one-more-tune-command="one-more-tune-start-round"${count ? "" : " disabled"} data-i18n="one_more_tune_start_round">Start a round</button></div>
            <div class="omt-code">
              <label class="omt-code-label" for="one-more-tune-challenge-input" data-i18n="one_more_tune_challenge_code_label">Sent a set?</label>
              <input id="one-more-tune-challenge-input" type="text" autocomplete="off" spellcheck="false" data-i18n-placeholder="one_more_tune_challenge_code_placeholder" placeholder="OMT.1.xxxxxxxx" />
              <button class="omt-2nd" type="button" data-one-more-tune-command="one-more-tune-open-challenge" data-i18n="one_more_tune_challenge_code_open">Open that set</button>
            </div>
          </div>`);
    return;
  }
  const question = oneMoreTuneQuestion();
  if (!question) {
    renderOneMoreTuneRoundResult(body);
    return;
  }
  if (question.submitted) {
    // An answer the round refused is its own face, and it comes first: there is
    // no reveal to paint, and painting the empty one would print a blank card
    // under the verdict "not that one" — the bug that made a server refusal
    // look like a wrong answer.
    if (question.answerFailed) {
      renderOneMoreTuneAnswerUnaccepted(body);
      return;
    }
    // An answer sent and not yet scored: the face stays as it is, with the
    // chosen row held down, until the authority answers.
    if (question.pending) return;
    const reveal = question.reveal || {};
    // The reveal is the only challenge render that names anything.
    if (reveal.song) announceOneMoreTuneNowPlaying(reveal);
    const verdictKey = question.correct ? "one_more_tune_right"
      : question.outcome === "skipped" ? "one_more_tune_skipped"
        : "one_more_tune_wrong";
    const enter = !question.revealPainted;
    question.revealPainted = true;
    const notes = oneMoreTuneLinerNotes(reveal) || { song: "", artist: "", film: "", year: "", era: null };
    const last = oneMoreTuneRound.index + 1 >= oneMoreTuneRound.questions.length;
    const correctId = oneMoreTuneCorrectChoiceId(question);
    const picked = question.outcome === "answered" ? question.chosen : "";
    // The four answers stay where they were asked. The right one fills and is
    // ticked, a wrong pick is struck through, and the two that had nothing to
    // do with it fold away — on the first paint only; later paints omit them.
    const rows = (question.choices || []).map((choice, index) => {
      const isRight = choice.id === correctId;
      const isPick = choice.id === picked && !isRight;
      const text = `<span class="omt-key" aria-hidden="true">${index + 1}</span><span class="omt-opt-label">${oneMoreTuneEscape(choice.label)}</span>`;
      if (!isRight && !isPick) {
        return enter ? `<div class="omt-ow" data-gone aria-hidden="true"><div class="omt-opt"><span class="omt-opt-in">${text}</span></div></div>` : "";
      }
      const role = isRight ? t("one_more_tune_row_answer") : t("one_more_tune_row_yours");
      return `<div class="omt-ow"><div class="omt-opt" data-state="${isRight ? "right" : "wrong"}"${enter && !isRight ? " data-shake" : ""}><span class="omt-opt-in">${text}<span class="omt-sr">${oneMoreTuneEscape(role)}</span>${isRight ? ONE_MORE_TUNE_TICK : ONE_MORE_TUNE_CROSS}</span></div></div>`;
    }).join("");
    // The two doors stay in the record's notes, on the line that says where the
    // music came from: the whole song, and the original in its own window.
    const watch = oneMoreTuneWatchLink(reveal);
    const film = watch
      ? `<button class="omt-link" type="button" data-one-more-tune-command="one-more-tune-play-film" data-one-more-tune-video-id="${oneMoreTuneEscape(reveal.videoId)}" data-one-more-tune-start="${watch.anchor === null ? "" : Math.floor(watch.anchor)}" data-i18n="one_more_tune_watch_plain">Watch the original</button>`
      : "";
    const listen = reveal.song ? oneMoreTuneListenLink(reveal) : "";
    const links = listen || film ? `<span class="omt-links">${listen}${film}</span>` : "";
    const where = [
      notes.film ? `<span>${oneMoreTuneEscape(notes.film)}</span>` : "",
      `<span>${oneMoreTuneEscape(notes.year || t("one_more_tune_era_unknown"))}</span>`,
      notes.era ? `<span class="omt-era-name" data-era="${notes.era.id}"><i aria-hidden="true"></i>${oneMoreTuneEscape(notes.era.name)}</span>` : "",
    ].join("");
    oneMoreTuneCarryRecord(body, question.token, () => {
      body.innerHTML = oneMoreTuneRoom("reveal", `
          <div class="omt-track">${oneMoreTuneTrackList(oneMoreTuneRound, { enter })}<span class="omt-verdict" data-s="${question.correct ? "right" : question.outcome === "skipped" ? "skip" : "wrong"}"><span aria-hidden="true">${question.correct ? "✓" : question.outcome === "skipped" ? "–" : "✕"}</span><span data-i18n="${verdictKey}">${oneMoreTuneEscape(t(verdictKey))}</span></span></div>
          ${oneMoreTuneRoundStage(question)}
          <div class="omt-gap"></div>
          <div class="omt-q"><div class="omt-notes">
            <h2 class="omt-song" id="one-more-tune-step-title">${oneMoreTuneEscape(notes.song)}</h2>
            ${notes.artist ? `<p class="omt-artist">${oneMoreTuneEscape(notes.artist)}</p>` : ""}
            <p class="omt-meta">${where}${links}</p>
            ${question.mediaFailed ? `<p class="omt-note" data-i18n="one_more_tune_result_broken">${oneMoreTuneEscape(t("one_more_tune_result_broken"))}</p>` : ""}
          </div></div>
          <div class="omt-opts">
            <div class="omt-grid">${rows}</div>
            <div class="omt-act"><button class="omt-next" type="button" data-one-more-tune-command="one-more-tune-round-next" data-i18n="${last ? "one_more_tune_see_result" : "one_more_tune_next"}">${oneMoreTuneEscape(t(last ? "one_more_tune_see_result" : "one_more_tune_next"))}</button></div>
          </div>`, { era: notes.era ? notes.era.id : "", enter });
    });
    // The fold is the motion; the removal is the fact. Once the two rows have
    // had their 260ms they leave the page, so a fold interrupted by the desk
    // changing appearance mid-reveal cannot leave them holding their space.
    if (enter && typeof setTimeout === "function") {
      setTimeout(() => body.querySelectorAll?.(".omt-room [data-gone]").forEach((row) => row.remove()), 300);
    }
    return;
  }
  clearOneMoreTuneNowPlaying();
  // The face is about to be painted, so the sound it will be asked for is
  // fetched and decoded now rather than inside the reader's press.
  preloadOneMoreTuneQuestion(question);
  // The one state that still has to be said out loud is a cue that could not
  // play, because that is the moment the player has to act on it. Skip, give
  // up, leave and replay are menu rows; the record itself is the replay.
  const notice = question.mediaFailed
    ? `<p class="omt-note" role="status"><span data-i18n="one_more_tune_media_failed">${oneMoreTuneEscape(t("one_more_tune_media_failed"))}</span> <span data-i18n="one_more_tune_media_failed_hint">${oneMoreTuneEscape(t("one_more_tune_media_failed_hint"))}</span></p>`
    : oneMoreTuneArrivedFromLink && !question.everHeard
      ? `<p class="omt-note"><span data-i18n="one_more_tune_tap_to_hear">${oneMoreTuneEscape(t("one_more_tune_tap_to_hear"))}</span> <span data-i18n="one_more_tune_tap_to_hear_hint">${oneMoreTuneEscape(t("one_more_tune_tap_to_hear_hint"))}</span></p>`
      : "";
  oneMoreTuneCarryRecord(body, question.token, () => {
    body.innerHTML = oneMoreTuneRoom("question", `
          <div class="omt-track">${oneMoreTuneTrackList(oneMoreTuneRound)}<span class="omt-aux mono" aria-hidden="true"><span data-disc-elapsed>— : —</span><span class="omt-sep">/</span><span data-disc-total>— : —</span></span></div>
          ${oneMoreTuneRoundStage(question)}
          <div class="omt-gap"></div>
          <div class="omt-q"><h2 class="omt-qtext" id="one-more-tune-step-title" data-i18n="${question.prompt}">Which one does this belong to?</h2>${notice}${oneMoreTuneSongEmbed(question)}</div>
          <div class="omt-opts"><div class="omt-grid">
            ${question.choices.map((choice, index) => `<div class="omt-ow"><button class="omt-opt" type="button" data-one-more-tune-submit="${oneMoreTuneEscape(choice.id)}"><span class="omt-opt-in"><span class="omt-key" aria-hidden="true">${index + 1}</span><span class="omt-opt-label">${oneMoreTuneEscape(choice.label)}</span></span></button></div>`).join("")}
          </div></div>`);
  });
}

/**
 * Keynote Relay is a separate knowledge dimension: a short Apple event clue
 * asks who handled a specific handoff. It deliberately has no audio player;
 * the supplied research package has text evidence but no auditioned keynote
 * clips, so this mode remains playable without pretending a voice track was
 * reviewed. Hints reveal the next clue and reduce the three-point score.
 */
function keynoteText(value) {
  const language = oneMoreTuneLanguage() === "zh" ? "zh" : "en";
  return String(value?.[language] || value?.en || value?.zh || "");
}

function keynoteQuestion() {
  return oneMoreTuneKeynoteRound?.questions?.[oneMoreTuneKeynoteRound.index] || null;
}

async function startOneMoreTuneKeynoteRound() {
  setStatus(t("one_more_tune_keynote_opening"));
  try {
    const payload = await oneMoreTuneRequestRoute(ONE_MORE_TUNE_ROUND_ROUTE, {
      body: { domain: "keynote_person" },
    });
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];
    if (payload?.domain !== "keynote_person" || questions.length !== 6) throw new Error("invalid keynote round");
    oneMoreTuneKeynoteRound = {
      token: String(payload.roundToken || ""),
      index: 0,
      questions: questions.map((question) => ({ ...question, submitted: false, result: null })),
      total: 0,
      maxPoints: Number(payload.maxPoints) || questions.length * 3,
    };
    oneMoreTuneView = "keynote";
    renderOneMoreTune();
  } catch {
    oneMoreTuneKeynoteRound = null;
    setStatus(t("one_more_tune_keynote_unavailable"));
    renderOneMoreTune();
  }
}

async function submitOneMoreTuneKeynote(action, value = "") {
  const question = keynoteQuestion();
  if (!question || question.submitted && action !== "hint") return;
  const body = {
    domain: "keynote_person",
    roundToken: oneMoreTuneKeynoteRound.token,
    questionToken: question.token,
    action,
  };
  if (action === "hint") body.hintLevel = Number(value);
  else body.choiceToken = String(value || "");
  try {
    const result = await oneMoreTuneRequestRoute(ONE_MORE_TUNE_ANSWER_ROUTE, { body });
    if (action === "hint" && result.question) {
      oneMoreTuneKeynoteRound.questions[oneMoreTuneKeynoteRound.index] = {
        ...oneMoreTuneKeynoteRound.questions[oneMoreTuneKeynoteRound.index],
        ...result.question,
      };
    } else if (result.ok) {
      question.submitted = true;
      question.result = result;
      oneMoreTuneKeynoteRound.total += Number(result.points) || 0;
    }
  } catch {
    setStatus(t("one_more_tune_answer_failed"));
  }
  renderOneMoreTune();
}

function advanceOneMoreTuneKeynote() {
  if (!oneMoreTuneKeynoteRound) return;
  oneMoreTuneKeynoteRound.index += 1;
  if (oneMoreTuneKeynoteRound.index >= oneMoreTuneKeynoteRound.questions.length) {
    const score = oneMoreTuneKeynoteRound.total;
    oneMoreTuneKeynoteRound = { ...oneMoreTuneKeynoteRound, done: true, score };
  }
  renderOneMoreTune();
}

function renderOneMoreTuneKeynote(body) {
  const round = oneMoreTuneKeynoteRound;
  if (!round) {
    body.innerHTML = `<section class="one-more-tune-study one-more-tune-keynote">
      <div class="sectiontag"><span class="eyebrow">KEYNOTE RELAY</span><span class="tag on" data-i18n="one_more_tune_keynote_tag">Six handoffs</span></div>
      <h1 data-i18n="one_more_tune_keynote_title">Who takes the stage?</h1>
      <p class="intro" data-i18n="one_more_tune_keynote_intro">Follow a product through its Apple keynote handoff. Open clues one at a time, then pick the presenter.</p>
      <p class="notice" data-i18n="one_more_tune_keynote_audio_note">This edition uses written keynote evidence. No unreviewed voice recording is played.</p>
      <div class="toolbar"><button class="btn default" type="button" data-one-more-tune-command="one-more-tune-keynote-start" data-i18n="one_more_tune_keynote_start">Start the relay</button></div>
    </section>`;
    return;
  }
  if (round.done) {
    body.innerHTML = `<section class="one-more-tune-study one-more-tune-keynote">
      <div class="sectiontag"><span class="eyebrow" data-i18n="one_more_tune_keynote_done">RELAY COMPLETE</span><span class="tag on">${round.score} / ${round.maxPoints}</span></div>
      <h1 data-i18n="one_more_tune_keynote_score_title">The handoff is yours.</h1>
      <p class="intro">${oneMoreTuneEscape(t("one_more_tune_keynote_score_line").replace("{score}", String(round.score)).replace("{max}", String(round.maxPoints)))}</p>
      <div class="toolbar"><button class="btn default" type="button" data-one-more-tune-command="one-more-tune-keynote-start" data-i18n="one_more_tune_keynote_again">Run it again</button></div>
    </section>`;
    return;
  }
  const question = keynoteQuestion();
  if (!question) return;
  const role = keynoteText(question.role);
  const clues = Array.isArray(question.clues?.[oneMoreTuneLanguage()]) ? question.clues[oneMoreTuneLanguage()] : question.clues?.en || [];
  const result = question.result;
  body.innerHTML = `<section class="one-more-tune-study one-more-tune-keynote">
    <div class="sectiontag"><span class="eyebrow">${oneMoreTuneEscape(question.event?.name || "APPLE KEYNOTE")} · ${oneMoreTuneEscape(question.event?.date || "")}</span><span class="tag on">${oneMoreTuneKeynoteRound.index + 1} / ${round.questions.length}</span></div>
    <h2>${oneMoreTuneEscape(role)}</h2>
    <p class="intro" data-i18n="one_more_tune_keynote_prompt">Which presenter takes this handoff?</p>
    <div class="one-more-tune-keynote-clues">${clues.map((clue, index) => `<div class="one-more-tune-keynote-clue"><span class="eyebrow">${index + 1}</span><span>${oneMoreTuneEscape(clue)}</span></div>`).join("")}</div>
    ${!question.submitted ? `<div class="toolbar one-more-tune-keynote-actions">
      ${question.level < 2 ? `<button class="btn light" type="button" data-one-more-tune-command="one-more-tune-keynote-hint" data-one-more-tune-hint="${question.level + 1}">${oneMoreTuneEscape(t("one_more_tune_keynote_hint").replace("{points}", String(2 - question.level)))}</button>` : ""}
      <span class="hint">${oneMoreTuneEscape(t("one_more_tune_keynote_points").replace("{points}", String(question.availablePoints)))}</span>
    </div><div class="choices">${question.choices.map((choice, index) => `<button class="choice" type="button" data-one-more-tune-keynote-answer="${oneMoreTuneEscape(choice.id)}"><span class="letter">${String.fromCharCode(65 + index)}</span>${oneMoreTuneEscape(choice.label)}</button>`).join("")}</div>` : `<div class="revealbox"><h3>${result.correct ? oneMoreTuneEscape(t("one_more_tune_correct")) : oneMoreTuneEscape(t("one_more_tune_keynote_reveal").replace("{name}", result.reveal.answer))}</h3><p>${oneMoreTuneEscape(keynoteText(result.reveal.story))}</p><a href="${oneMoreTuneEscape(result.reveal.sourceUrl)}" target="_blank" rel="noopener noreferrer">${oneMoreTuneEscape(result.reveal.sourceLabel)}</a></div><div class="toolbar"><button class="btn default" type="button" data-one-more-tune-command="one-more-tune-keynote-next">${round.index + 1 < round.questions.length ? oneMoreTuneEscape(t("one_more_tune_next")) : oneMoreTuneEscape(t("one_more_tune_keynote_finish"))}</button></div>`}
  </section>`;
}

/**
 * One More Line: the keynote-line round.
 *
 * The window's third game, and a different task from the other two. The music
 * round asks which advertisement a segment belonged to; the relay asks who
 * took a hand-off, from clues opened one at a time; this one asks what a spoken
 * line was doing and which chapter came after it. The research package behind
 * it is explicit that those are separate jobs — "音乐记忆、人物原声辨认、发布史
 * 知识和语境理解是不同任务" — so it is a round of its own rather than a third
 * face of one score.
 *
 * Three of the package's rules are visible in this half:
 *
 *   1. NO UNREVIEWED AUDIO. There is no player on this face at all, and the
 *      intro says why: the bank's items rest on written evidence, and the
 *      recordings behind them have not been auditioned line by line.
 *   2. READING IS NOT A MISS. 跳过 is offered beside the four answers, and a
 *      skipped question still opens its note; the round result counts the first
 *      answers apart from the skips instead of turning both into one number.
 *   3. THE NOTE IS THE POINT. A reveal carries the line's explanation, the
 *      source it rests on with its transcript position, and — where the same
 *      phrase has a second checked use — the other use, named as the other use.
 *      Two questions about one phrase never sit next to each other: the round
 *      is ordered so that the first one cannot hand over the second.
 *
 * A round is ten questions of twelve, no timer, one submission each, a point a
 * question. The answers live on the server; the browser holds tokens.
 */
function oneMoreTuneLineQuestion() {
  return oneMoreTuneLineRound?.questions?.[oneMoreTuneLineRound.index] || null;
}

async function startOneMoreTuneLineRound() {
  setStatus(t("one_more_tune_line_opening"));
  try {
    const payload = await oneMoreTuneRequestRoute(ONE_MORE_TUNE_ROUND_ROUTE, {
      body: { domain: "keynote_context" },
    });
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];
    if (payload?.domain !== "keynote_context" || !questions.length) throw new Error("invalid line round");
    oneMoreTuneLineRound = {
      token: String(payload.roundToken || ""),
      index: 0,
      questions: questions.map((question) => ({ ...question, submitted: false, result: null })),
      correct: 0,
      skipped: 0,
      maxPoints: Number(payload.maxPoints) || questions.length,
    };
    oneMoreTuneView = "line";
    renderOneMoreTune();
  } catch {
    oneMoreTuneLineRound = null;
    setStatus(t("one_more_tune_line_unavailable"));
    renderOneMoreTune();
  }
}

async function submitOneMoreTuneLine(action, value = "") {
  const question = oneMoreTuneLineQuestion();
  if (!question || question.submitted) return;
  const body = {
    domain: "keynote_context",
    roundToken: oneMoreTuneLineRound.token,
    questionToken: question.token,
  };
  if (action === "skip") body.action = "skip";
  else body.choiceId = String(value || "");
  try {
    const result = await oneMoreTuneRequestRoute(ONE_MORE_TUNE_ANSWER_ROUTE, { body });
    if (result.ok) {
      question.submitted = true;
      question.result = result;
      if (result.correct) oneMoreTuneLineRound.correct += 1;
      if (result.skipped) oneMoreTuneLineRound.skipped += 1;
    }
  } catch {
    setStatus(t("one_more_tune_answer_failed"));
  }
  renderOneMoreTune();
}

function advanceOneMoreTuneLine() {
  if (!oneMoreTuneLineRound) return;
  oneMoreTuneLineRound.index += 1;
  if (oneMoreTuneLineRound.index >= oneMoreTuneLineRound.questions.length) {
    oneMoreTuneLineRound = { ...oneMoreTuneLineRound, done: true };
  }
  renderOneMoreTune();
}

function renderOneMoreTuneLine(body) {
  const round = oneMoreTuneLineRound;
  if (!round) {
    body.innerHTML = `<section class="one-more-tune-study one-more-tune-line">
      <div class="sectiontag"><span class="eyebrow">ONE MORE LINE</span><span class="tag on" data-i18n="one_more_tune_line_tag">Ten lines</span></div>
      <h1 data-i18n="one_more_tune_line_title">What happens after the line?</h1>
      <p class="intro" data-i18n="one_more_tune_line_intro">What a keynote line was doing, and which chapter followed it. Ten written questions a round, no clock, and every answer comes with its note and its source.</p>
      <p class="notice" data-i18n="one_more_tune_line_audio_note">This edition uses written keynote evidence. No unreviewed voice recording is played, and a transcript position is not a playback second.</p>
      <div class="toolbar"><button class="btn default" type="button" data-one-more-tune-command="one-more-tune-line-start" data-i18n="one_more_tune_line_start">Start the round</button></div>
    </section>`;
    return;
  }
  if (round.done) {
    body.innerHTML = `<section class="one-more-tune-study one-more-tune-line">
      <div class="sectiontag"><span class="eyebrow" data-i18n="one_more_tune_line_done">ROUND COMPLETE</span><span class="tag on">${round.correct} / ${round.maxPoints}</span></div>
      <h1 data-i18n="one_more_tune_line_score_title">Ten lines, ten notes.</h1>
      <p class="one-more-tune-score-line">${oneMoreTuneEscape(t("one_more_tune_line_score_line")
        .replace("{right}", String(round.correct))
        .replace("{max}", String(round.maxPoints))
        .replace("{skipped}", String(round.skipped)))}</p>
      <div class="toolbar"><button class="btn default" type="button" data-one-more-tune-command="one-more-tune-line-start" data-i18n="one_more_tune_line_again">Run it again</button></div>
    </section>`;
    return;
  }
  const question = oneMoreTuneLineQuestion();
  if (!question) return;
  const result = question.result;
  const prompt = keynoteText(question.prompt);
  const phrase = question.phrase ? String(question.phrase.form || "") : "";
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const reveal = result?.reveal || null;
  const answer = reveal ? keynoteText(reveal.answer) : "";
  const explanation = reveal ? keynoteText(reveal.explanation) : "";
  const phraseNote = reveal?.phraseNote ? keynoteText(reveal.phraseNote) : "";
  const sourceLabel = reveal ? keynoteText(reveal.source?.label) : "";
  const sourceLocator = reveal ? keynoteText(reveal.source?.locator) : "";
  body.innerHTML = `<section class="one-more-tune-study one-more-tune-line">
    <div class="sectiontag">
      <span class="eyebrow">ONE MORE LINE · ${oneMoreTuneEscape(question.event?.name || "APPLE KEYNOTE")} · ${oneMoreTuneEscape(question.event?.date || "")}</span>
      <span class="tag on">${round.index + 1} / ${round.questions.length}</span>
    </div>
    <div class="one-more-tune-line-card">
    ${phrase ? `<p class="one-more-tune-line-quote"><q>${oneMoreTuneEscape(phrase)}</q></p>` : ""}
    <h2>${oneMoreTuneEscape(prompt)}</h2>
    ${!question.submitted ? `<div class="choices">${choices.map((choice, index) => `<button class="choice" type="button" data-one-more-tune-line-answer="${oneMoreTuneEscape(choice.id)}"><span class="letter">${String.fromCharCode(65 + index)}</span>${oneMoreTuneEscape(keynoteText(choice.text))}</button>`).join("")}</div>
      <div class="toolbar one-more-tune-line-actions"><button class="textbtn" type="button" data-one-more-tune-line-skip="true" data-i18n="one_more_tune_skip">Skip</button></div>`
      : `<div class="revealbox">
        <h3>${result?.correct ? oneMoreTuneEscape(t("one_more_tune_correct")) : oneMoreTuneEscape(t("one_more_tune_line_answer").replace("{answer}", answer))}</h3>
        <p>${oneMoreTuneEscape(explanation)}</p>
        ${phraseNote ? `<p class="one-more-tune-line-note"><span class="eyebrow" data-i18n="one_more_tune_line_same_phrase">Same line, other use</span> ${oneMoreTuneEscape(phraseNote)}</p>` : ""}
        <p class="one-more-tune-line-source"><span data-i18n="one_more_tune_line_source">Source</span> <a href="${oneMoreTuneEscape(reveal?.source?.url || "")}" target="_blank" rel="noopener noreferrer">${oneMoreTuneEscape(sourceLabel)}</a> <span class="eyebrow">${oneMoreTuneEscape(sourceLocator)}</span></p>
      </div>
      <div class="toolbar"><button class="btn default" type="button" data-one-more-tune-command="one-more-tune-line-next">${round.index + 1 < round.questions.length ? oneMoreTuneEscape(t("one_more_tune_next")) : oneMoreTuneEscape(t("one_more_tune_line_finish"))}</button></div>`}
    </div>
  </section>`;
}

/**
 * The answer the round would not take.
 *
 * The submission left, the round did not answer — a round that was evicted, a
 * desk that restarted, a network that dropped it. Nothing here guesses at the
 * card: there is no reveal to show, so the face says exactly that, keeps the
 * score at zero without calling it a miss, and offers the one action that can
 * still finish the question. The chosen answer is still in hand, so the retry
 * re-sends the same one rather than asking the person to remember it.
 */
function renderOneMoreTuneAnswerUnaccepted(body) {
  clearOneMoreTuneNowPlaying();
  const question = oneMoreTuneQuestion();
  oneMoreTuneCarryRecord(body, question?.token || "", () => {
    body.innerHTML = oneMoreTuneRoom("refused", `
          <div class="omt-track">${oneMoreTuneTrackList(oneMoreTuneRound)}<span class="omt-verdict" data-s="broken"><span aria-hidden="true">!</span><span data-i18n="one_more_tune_answer_unaccepted">${oneMoreTuneEscape(t("one_more_tune_answer_unaccepted"))}</span></span></div>
          ${oneMoreTuneRoundStage(question)}
          <div class="omt-gap"></div>
          <div class="omt-q"><h2 class="omt-qtext" id="one-more-tune-step-title" data-i18n="one_more_tune_answer_failed">${oneMoreTuneEscape(t("one_more_tune_answer_failed"))}</h2>
            <p class="omt-note" data-i18n="one_more_tune_answer_unaccepted_hint">${oneMoreTuneEscape(t("one_more_tune_answer_unaccepted_hint"))}</p></div>
          <div class="omt-opts"><div class="omt-act">
            <button class="omt-next" type="button" data-one-more-tune-command="one-more-tune-answer-retry" data-i18n="one_more_tune_answer_retry">${oneMoreTuneEscape(t("one_more_tune_answer_retry"))}</button>
            <button class="omt-2nd" type="button" data-one-more-tune-command="one-more-tune-round-next" data-i18n="one_more_tune_next">${oneMoreTuneEscape(t("one_more_tune_next"))}</button>
          </div></div>`);
  });
}

/**
 * The back cover: the round as the record it was.
 *
 * A small record whose ten rings are the ten cards' eras — the round's own
 * fingerprint, and colour only where every answer is already out — the score
 * on its label, the ten tracks in one column (two on a wide window), and the
 * two things a finished round is for: another ten, or sending this one on.
 * Reviewing the misses lives in the Study menu.
 */
function renderOneMoreTuneRoundResult(body) {
  const questions = oneMoreTuneRound.questions;
  const right = questions.filter((question) => question.correct).length;
  const broken = questions.filter((question) => (question.mediaFailed || question.answerFailed) && !question.correct).length;
  const skipped = questions.filter((question) => question.outcome === "skipped" && !question.mediaFailed).length;
  const wrong = questions.length - right - broken - skipped;
  // One custom property per ring, named for its track; the sheet owns the
  // gradient, and the 1-bit desk swaps every era for its own ink.
  const rings = questions.slice(0, 10).map((question, index) => {
    const era = question.reveal ? oneMoreTuneEra(question.reveal) : null;
    return `--omt-r${index + 1}:var(--omt-ring-${era && era.id !== "none" ? era.id : "none"})`;
  }).join(";");
  const counts = t("one_more_tune_round_counts")
    .replace("{right}", String(right))
    .replace("{wrong}", String(wrong))
    .replace("{skipped}", String(skipped + broken));
  const setLine = oneMoreTuneRound.setId
    ? ` · ${oneMoreTuneEscape(t("one_more_tune_share_card_set")
      .replace("{setId}", oneMoreTuneSetNumber())
      .replace("{version}", String(oneMoreTuneRound.deckVersion || 1)))}`
    : "";
  const rows = questions.map((question, index) => {
    const reveal = question.reveal || {};
    const era = question.reveal ? oneMoreTuneEra(reveal) : null;
    // Five outcomes, not two: right, wrong, skipped, a cue that never played,
    // and an answer the round would not take. A skip is not a wrong answer, and
    // an answer that never left is not one either.
    const state = question.correct ? "right"
      : question.answerFailed ? "unaccepted"
        : question.mediaFailed ? "broken"
          : question.outcome === "skipped" ? "skip" : "wrong";
    const stateKey = { right: "one_more_tune_right", unaccepted: "one_more_tune_answer_unaccepted", broken: "one_more_tune_result_broken", skip: "one_more_tune_skipped", wrong: "one_more_tune_wrong" }[state];
    const mark = { right: "✓", wrong: "✕", skip: "–", broken: "⚠", unaccepted: "!" }[state];
    const stateLabel = t(stateKey);
    const named = reveal.song
      ? `<b>${oneMoreTuneEscape(reveal.song)}</b>${reveal.artist ? `<span>${oneMoreTuneEscape(reveal.artist)}</span>` : ""}`
      : `<b>${oneMoreTuneEscape(stateLabel)}</b>`;
    const rowLabel = reveal.song ? `${reveal.song} — ${reveal.artist || ""}, ${stateLabel}` : stateLabel;
    return `<li data-s="${state}" aria-label="${oneMoreTuneEscape(rowLabel)}"><span class="omt-no" aria-hidden="true">${oneMoreTuneTrackCode(index)}</span><i class="omt-dot"${era && era.id !== "none" ? ` data-era="${era.id}"` : ""} aria-hidden="true"></i><span class="omt-t" aria-hidden="true">${named}</span><span class="omt-mark-text" aria-hidden="true">${mark}</span></li>`;
  }).join("");
  body.innerHTML = oneMoreTuneRoom("result", `
          <header class="omt-rhead">
            <span class="omt-mini" style="${rings}" aria-hidden="true"><span class="omt-label omt-label-white"><b>${right}/${questions.length}</b></span></span>
            <div><h2 class="omt-score" id="one-more-tune-step-title"><span class="omt-sr" data-i18n="one_more_tune_round_done">Round finished</span>${right}<span class="omt-of">/${questions.length}</span></h2>
            <p class="omt-rsub">${oneMoreTuneEscape(counts)}${setLine}</p></div>
          </header>
          <ol class="omt-list">${rows}</ol>
          <div class="omt-gap"></div>
          <div class="omt-racts">
            <button class="omt-next" type="button" data-one-more-tune-command="one-more-tune-play-again" data-i18n="one_more_tune_play_again">Play again</button>
            <button class="omt-2nd" type="button" data-one-more-tune-command="one-more-tune-share-round" data-i18n="one_more_tune_share_friend">Send to a friend</button>
          </div>
          ${oneMoreTuneArrivedFromLink ? `<p class="omt-desk"><a href="/" target="_blank" rel="noopener noreferrer" data-i18n="one_more_tune_desk_link">Open the desk</a></p>` : ""}`);
}

/** Put this round's misses back in the review queue, as the spec asks. */
/**
 * The share card: what actually leaves the desk.
 *
 * It is the round's own object — the white label — at 1200×1200: ten bands on
 * the record, solid for a tune named, hollow for a miss, a hairline for a skip
 * and a dashed one for a cue that never played. It names no song and paints no
 * band in an era's colour, because a friend is about to play the same ten. Two
 * places take colour: the six-bar mark, and the label, which wears the era the
 * round ended in (the owner's rule: the last card decides). 9:41 is the card's
 * private joke — every device on an Apple keynote screen is stopped at that
 * minute — and the card does not explain it.
 */
function oneMoreTuneShareCardCanvas() {
  const round = oneMoreTuneRound;
  if (!round) return null;
  const size = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const font = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const questions = round.questions;
  const right = questions.filter((question) => question.correct).length;
  const wrong = questions.filter((question) => question.outcome === "answered" && !question.correct).length;
  const skipped = questions.filter((question) => question.outcome === "skipped" || question.outcome === "failed").length;
  const eras = ["1", "2", "3", "4", "5", "6"];
  const closingEra = oneMoreTuneRoundEra(round);
  const eraColor = closingEra ? oneMoreTuneEraColor(closingEra.id) : "";
  const ink = "#F5F5F7";
  const soft = "#AEAEB4";
  const hair = "#8A8A90";
  const text = (value, x, y, style, color, align = "left") => {
    ctx.font = style;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
    ctx.textAlign = "left";
  };

  ctx.fillStyle = "#111113";
  ctx.fillRect(0, 0, size, size);
  ctx.textBaseline = "alphabetic";

  // The mark: six bars, whose heights are fixed rather than derived so the mark
  // is the same on every card ever exported.
  const heights = [22, 44, 30, 38, 18, 34];
  heights.forEach((height, index) => {
    const color = oneMoreTuneEraColor(eras[index]);
    const x = 72 + index * 22;
    toppaint: {
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, 108 - height, 12, height);
        break toppaint;
      }
      // Classic has no rainbow: the same six-part mark arrives as six dot
      // patterns, exactly as it does on the 1-bit desk.
      const step = 2 + index;
      ctx.fillStyle = ink;
      for (let y = 108 - height; y < 108; y += step) {
        for (let dx = 0; dx < 12; dx += step) ctx.fillRect(x + dx, y, Math.min(step - 1, 12 - dx), 1);
      }
    }
  });
  text("ONE MORE TUNE", 72 + 6 * 22 + 14, 108, `600 26px ${mono}`, ink);
  text(t("one_more_tune_share_card_set")
    .replace("{setId}", oneMoreTuneSetNumber())
    .replace("{version}", String(round.deckVersion || 1)), 72, 150, `400 22px ${mono}`, soft);
  text("9:41", 1128, 108, `500 30px ${mono}`, soft, "right");

  // The record, and one band per question from the rim inward.
  const cx = 600;
  const cy = 525;
  const radius = 320;
  const circle = (r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  };
  circle(radius);
  ctx.fillStyle = "#0B0B0C";
  ctx.fill();
  ctx.strokeStyle = "#1A1A1C";
  ctx.lineWidth = 1;
  for (let r = radius * 0.36; r <= radius * 0.95; r += 3) {
    circle(r);
    ctx.stroke();
  }
  questions.slice(0, 10).forEach((question, index) => {
    const outer = radius * (0.955 - 0.06 * index);
    const inner = outer - radius * 0.05;
    const mid = (outer + inner) / 2;
    if (question.correct) {
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
      ctx.fillStyle = ink;
      ctx.fill();
      return;
    }
    // Four outcomes, four weights: a miss is hollow, a skip is a hairline, and
    // a cue that never played is dashed. A skip is not a miss, so it must not
    // read like one at a glance.
    if (question.mediaFailed || question.answerFailed) {
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = hair;
      circle(mid);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    if (question.outcome === "skipped") {
      ctx.lineWidth = 1;
      ctx.strokeStyle = hair;
      circle(mid);
      ctx.stroke();
      return;
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = ink;
    circle(outer - 1.5);
    ctx.stroke();
    circle(inner + 1.5);
    ctx.stroke();
  });
  // The label wears the era the round ended in — paper on the 1-bit desk, and
  // paper for a last card nobody dated.
  circle(radius * 0.31);
  ctx.fillStyle = eraColor || "#EFEBE1";
  ctx.fill();
  const labelInk = eraColor && ["4", "5", "6"].includes(closingEra?.id) ? "#FFFFFF" : "#1D1D1F";
  text(`${right}/${questions.length}`, cx, 548, `700 88px ${font}`, labelInk, "center");
  ctx.globalAlpha = 0.65;
  text("33⅓", cx, 590, `500 24px ${font}`, labelInk, "center");
  ctx.globalAlpha = 1;
  circle(7);
  ctx.fillStyle = "#0B0B0C";
  ctx.fill();

  t("one_more_tune_share_card_headline").split("\n")
    .forEach((line, index) => text(line, 72, 940 + index * 62, `700 50px ${font}`, ink));
  text(t("one_more_tune_share_card_invite"), 72, 1068, `600 34px ${font}`, ink);
  text(oneMoreTuneShareCode() || "", 1128, 1068, `400 28px ${mono}`, soft, "right");
  const footer = `400 20px ${mono}`;
  text([
    `${t("one_more_tune_right")} ${right}`,
    `${t("one_more_tune_wrong")} ${wrong}`,
    `${t("one_more_tune_skipped")} ${skipped}`,
  ].join("   "), 72, 1122, footer, soft);
  // The era the round ended in, in words: a colour is never the only thing that
  // says anything on this card.
  if (closingEra) text(t("one_more_tune_share_card_era").replace("{era}", closingEra.name), 1128, 1122, footer, soft, "right");
  // The desk the quiz is an app on, and where to follow the person who made it:
  // a card is the one thing here that travels without the link around it.
  text(t("one_more_tune_share_card_desk").replace("{host}", String(window.location?.host || "system6.aaronlau.me")), 72, 1156, footer, soft);
  text(t("one_more_tune_share_card_bilibili").replace("{handle}", ONE_MORE_TUNE_BILIBILI), 72, 1184, footer, soft);
  return canvas;
}

/**
 * The era's own colour, from the window's tokens rather than a second table.
 * Returns "" in the one appearance whose tokens are dither patterns instead of
 * colours — the 1-bit desk — so the caller can draw the pattern rather than
 * guess a colour the appearance deliberately does not have.
 */
function oneMoreTuneEraColor(eraId) {
  const root = oneMoreTuneRoot();
  const value = root ? getComputedStyle(root).getPropertyValue(`--omt-era-${eraId}`).trim() : "";
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : "";
}

/** Export the card as a PNG, and say where it went when the browser blocks it. */
function downloadOneMoreTuneShareCard() {
  const canvas = oneMoreTuneShareCardCanvas();
  if (!canvas) {
    setStatus(t("one_more_tune_share_unavailable"));
    return;
  }
  try {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `one-more-tune-${oneMoreTuneRound?.setId || "set"}.png`;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setStatus(t("one_more_tune_share_card_saved"));
  } catch {
    setStatus(t("one_more_tune_share_unavailable"));
  }
}

/** One row of the reveal's spec sheet. */
function oneMoreTuneSpecRow(labelKey, value) {
  return `<div><dt data-i18n="${labelKey}">${oneMoreTuneEscape(t(labelKey))}</dt><dd>${oneMoreTuneEscape(value)}</dd></div>`;
}

/**
 * The card in the shape the spec sheet reads.
 *
 * A round's reveal arrives from the server as its own object; a catalogue card
 * is a card. The sheet wants four facts and one position, and both callers have
 * them, so this is the whole translation — the shelf's third column does not
 * need a second sheet that would drift from the reveal's.
 */
function oneMoreTuneCardRecord(card) {
  return {
    song: card?.song || "",
    artist: card?.artist || "",
    film: card?.film || "",
    year: Number.isInteger(card?.year) ? card.year : null,
    sourceAnchor: Number.isFinite(card?.sourceAnchor) ? card.sourceAnchor : null,
  };
}

/**
 * What this record knows, printed the way a reference work prints it.
 *
 * The design's line is that the sheet IS the design: Mactracker leaves a field
 * it does not have empty, and this deck's own rule is that an unknown stays
 * null and 0 is never a stand-in. So an unknown prints as an em dash and never
 * as 0:00, and the two rows nobody can honestly answer yet — the recording
 * behind the ad, and the licence to play it — say so by name rather than by
 * leaving the row out. Both derive from the card's own gate: nothing in this
 * deck is cleared, so both read as they do here, and a card that is cleared
 * will read differently without this function changing.
 *
 * The shelf's third column renders this too, from the card itself, which is why
 * it takes a record rather than a round's reveal.
 */
function oneMoreTuneDeckSpec(reveal, cardId) {
  const card = oneMoreTuneCard(cardId);
  const times = cardId ? oneMoreTuneTimes(cardId) : null;
  const cleared = card?.enabled === true;
  const dash = "\u2014";
  const clock = (seconds) => (Number.isFinite(seconds) ? formatOneMoreTuneSeconds(seconds) : dash);
  const range = (clip) => (Number.isFinite(clip?.start) && Number.isFinite(clip?.end)
    ? `${formatOneMoreTuneSeconds(clip.start)}\u2013${formatOneMoreTuneSeconds(clip.end)}`
    : dash);
  return `<div class="deck-spec">
      <div class="eyebrow" data-i18n="one_more_tune_spec_title">What this record knows</div>
      <dl>
        ${oneMoreTuneSpecRow("one_more_tune_spec_song", reveal.song || dash)}
        ${oneMoreTuneSpecRow("one_more_tune_spec_artist", reveal.artist || dash)}
        ${oneMoreTuneSpecRow("one_more_tune_spec_film", reveal.film || dash)}
        ${oneMoreTuneSpecRow("one_more_tune_spec_year", Number.isFinite(reveal.year) ? String(reveal.year) : dash)}
        ${oneMoreTuneSpecRow("one_more_tune_clock_anchor", clock(reveal.sourceAnchor))}
        ${oneMoreTuneSpecRow("one_more_tune_clock_film", range(times?.filmClip))}
        ${oneMoreTuneSpecRow("one_more_tune_clock_quiz", times?.quizClip?.auditioned ? range(times.quizClip) : dash)}
        ${oneMoreTuneSpecRow("one_more_tune_spec_recording", t(cleared ? "one_more_tune_spec_checked" : "one_more_tune_spec_unchecked"))}
        ${oneMoreTuneSpecRow("one_more_tune_spec_licence", t(cleared ? "one_more_tune_spec_granted" : "one_more_tune_spec_not_granted"))}
      </dl>
      <p class="deck-spec-note" data-i18n="one_more_tune_spec_note">An em dash is an unknown, never a zero.</p>
    </div>`;
}

/**
 * Which card a reveal belongs to.
 *
 * A published round's reveal names the song, the artist and the film but not
 * the card, and the review queue is keyed by the card. The deck the browser
 * already holds is the lookup, so this costs no new field on the wire — and
 * without it "Add the misses to review" queued nothing at all for a published
 * round, because the only id it looked for was the private round's.
 */
function oneMoreTuneCardIdForReveal(reveal) {
  if (!reveal?.song) return "";
  const same = ONE_MORE_TUNE_ALL_CARDS.filter((card) => card.song === reveal.song && card.artist === reveal.artist);
  if (!same.length) return "";
  if (same.length === 1) return same[0].id;
  return (same.find((card) => card.film === reveal.film) || same[0]).id;
}

function reviewOneMoreTuneMisses() {
  if (!oneMoreTuneRound) return;
  for (const question of oneMoreTuneRound.questions) {
    if (question.correct) continue;
    const cardId = question.localAnswer || oneMoreTuneCardIdForReveal(question.reveal);
    if (!cardId) continue;
    const record = oneMoreTuneRecord(cardId);
    record.met = true;
    record.dueAt = Date.now();
  }
  writeOneMoreTuneState();
  setStatus(t("one_more_tune_misses_queued"));
  endOneMoreTuneRound();
}

/**
 * The ledger.
 *
 * Three checks, and they are independent on purpose. The reference
 * implementation this follows keeps 來源對應／原站播放／乾淨片段 as three
 * separate marks, because the usual way a deck starts lying is one tick that
 * quietly stands for all three: a pairing someone found in an article becomes
 * "verified", and the verification is then read as covering the recording and
 * the segment nobody has listened to.
 *
 *   mapping  — is the association settled, and on what evidence.
 *   playback — has the linked original actually been opened and played.
 *   clip     — is there a listened-through range a question could play.
 *
 * Only the third can be earned from inside this application, by a person
 * auditioning their own file. The first two are editorial work that has not
 * been done, so they read as pending for every card and say so.
 */
function oneMoreTuneLedger(card) {
  const ready = oneMoreTuneReadiness(card.id);
  return [
    {
      key: "mapping",
      done: Boolean(card.product && card.film),
      labelKey: "one_more_tune_check_mapping",
      stateKey: card.product && card.film
        ? (card.basis === "package" ? "one_more_tune_check_mapping_package" : "one_more_tune_check_mapping_reported")
        : "one_more_tune_check_mapping_open",
    },
    {
      key: "playback",
      // Nothing here has been played through. A link that exists is not a link
      // that works: the reference deck found videos that were removed, region
      // locked, or refused embedding, and only playing them says which.
      done: false,
      labelKey: "one_more_tune_check_playback",
      stateKey: oneMoreTuneWatchLink(card) ? "one_more_tune_check_playback_untested" : "one_more_tune_check_playback_nolink",
    },
    {
      key: "clip",
      done: ready.recall,
      labelKey: "one_more_tune_check_clip",
      stateKey: ready.recall ? "one_more_tune_check_clip_yours" : "one_more_tune_check_clip_open",
    },
  ];
}

/**
 * One catalogue row's detail — what the pairing rests on, the three checks, the
 * ledger and the film. It is the inline detail on a narrow window and the
 * design's third column on a wide one, from one function, so the two positions
 * cannot drift into saying different things about the same record.
 *
 * The record's own sheet heads it, exactly as the design draws the third
 * column: the same nine rows the reveal prints, from the same function. The
 * sheet is what Mactracker is: the fields a record has, and an em dash where it
 * has none. It reads the card, so the shelf and the reveal cannot disagree
 * about what this record knows.
 */
function oneMoreTuneSourceDetail(card, { open = false, pane = false } = {}) {
  const checks = oneMoreTuneLedger(card).map((check) => `<span class="one-more-tune-check${check.done ? " is-done" : ""}"><span aria-hidden="true">${check.done ? "\u2713" : "\u2013"}</span><span data-i18n="${check.labelKey}">${check.key}</span></span>`).join("");
  return `<div class="one-more-tune-source-detail${pane ? " is-pane" : ""}" data-one-more-tune-source-detail="${oneMoreTuneEscape(card.id)}"${open ? "" : " hidden"}>
      ${oneMoreTuneDeckSpec(oneMoreTuneCardRecord(card), card.id)}
      <p>${oneMoreTuneEscape(oneMoreTuneNote(card))}</p>
      <p class="one-more-tune-checks">${checks}</p>
      ${oneMoreTuneEvidencePanel(card.id)}
      <p class="one-more-tune-source-actions"><button class="btn" type="button" data-one-more-tune-open-card="${oneMoreTuneEscape(card.id)}" data-i18n="one_more_tune_open_editor">Open the segment editor</button></p>
      ${oneMoreTuneMusicRow(card)}
      ${oneMoreTuneFilmRow(card)}
    </div>`;
}

/** The catalogue's third column: the selected record, or the way to select one. */
function oneMoreTuneSourceSpec(card) {
  if (!card) {
    return `<div class="eyebrow" data-i18n="one_more_tune_spec_pane">The selected record</div>
      <p class="hint" data-i18n="one_more_tune_spec_pane_hint">Pick a row: what that record still needs, and its evidence.</p>`;
  }
  // The header the design draws: the record's number, the year it shipped in
  // (or the neutral word when nobody knows it), and what kind of thing the
  // record is. The answer follows on its own line, because on this page the
  // pairing is the record's name.
  const year = Number.isInteger(card.year) ? String(card.year) : t("one_more_tune_era_unknown");
  return `<div class="eyebrow">${oneMoreTuneEscape(card.id)} · ${oneMoreTuneEscape(year)} · ${oneMoreTuneEscape(oneMoreTuneUnitLabel(card.unit))}</div>
    <p class="one-more-tune-spec-answer">${card.product ? oneMoreTuneEscape(card.product) : `<span data-i18n="one_more_tune_needs_check">Needs checking</span>`}</p>
    ${oneMoreTuneSourceDetail(card, { open: true, pane: true })}`;
}

/**
 * Why a filter with nothing under it is empty.
 *
 * The design draws this state on the era plates: an era with no card yet says
 * so and names how far back the deck goes, rather than leaving a person to
 * wonder whether the filter is broken. Every other empty result keeps the plain
 * sentence, because there the filter really did just match nothing.
 */
function oneMoreTuneSourceEmptyNote(eraFacets) {
  const era = eraFacets.find((facet) => facet.id === oneMoreTuneSourceEra);
  const years = ONE_MORE_TUNE_ALL_CARDS.map((card) => card.year).filter((year) => Number.isInteger(year));
  if (era && era.count === 0) {
    const earliest = years.length ? Math.min(...years) : "\u2014";
    return `<p class="one-more-tune-empty">${oneMoreTuneEscape(t("one_more_tune_era_empty_note").replace("{year}", String(earliest)))}</p>`;
  }
  return `<p class="one-more-tune-empty" data-i18n="one_more_tune_sources_empty">No row in this catalogue matches that.</p>`;
}

function renderOneMoreTuneSources(body) {
  // The evidence file is fetched the first time this page is painted, and the
  // page repaints when it lands. A catalogue drawn before it simply has no
  // panel yet, which is the same shape as a catalogue drawn with it missing.
  if (!ONE_MORE_TUNE_EVIDENCE) {
    oneMoreTuneEnsureEvidence().then((data) => {
      if (data && oneMoreTuneView === "sources" && oneMoreTuneRoot()) renderOneMoreTune();
    });
  }
  const anchored = ONE_MORE_TUNE_ALL_CARDS.filter((card) => Number.isFinite(card.sourceAnchor));
  const auditioned = ONE_MORE_TUNE_ALL_CARDS.filter((card) => oneMoreTuneReadiness(card.id).recall);
  // The publishable count is not a placeholder: it is the server's blind-source
  // gate applied to every card, and it is 0 because no recording has been
  // verified, no rights review exists and no cue has been auditioned. When the
  // round authority is unreachable the row says so rather than guessing.
  const publishable = oneMoreTuneGateReport();
  const linked = ONE_MORE_TUNE_ALL_CARDS.filter((card) => oneMoreTuneWatchLink(card));

  // The research catalogue's own row: number, song and artist, the pairing, the
  // film, and where it was anchored. The three checks live under each row, so a
  // tick can never spread from one card to the next.
  // The research mock's catalogue is a table you search, not a wall of rows:
  // seventy-three cards is past the point where scrolling is a filter.
  const query = oneMoreTuneSourceQuery.trim().toLowerCase();
  // The catalogue's own two facets, and the counts come off the deck rather
  // than off the design's snapshot: the numbers move whenever a card lands or a
  // link is added, and a facet that lies is worse than a facet that is empty.
  // The names are the ones this project already uses for the same facts — the
  // ledger's checks and the era ladder — so the left column and the panel on
  // the right cannot disagree about what "awaiting an audition" means.
  const facetFacts = [
    { id: "no-link", labelKey: "one_more_tune_facet_no_link", test: (card) => !oneMoreTuneWatchLink(card) },
    { id: "not-auditioned", labelKey: "one_more_tune_facet_not_auditioned", test: (card) => !oneMoreTuneReadiness(card.id).recall },
    { id: "choices-unreviewed", labelKey: "one_more_tune_facet_choices_unreviewed", test: (card) => card.choicesReviewedForReuse !== true },
    { id: "reuse", labelKey: "one_more_tune_facet_reuse", test: (card) => Boolean(card.siblingOf || card.recordingWarning) },
  ];
  const eraFacets = [
    { id: "all", range: "", name: "", count: ONE_MORE_TUNE_ALL_CARDS.length },
    ...ONE_MORE_TUNE_ERAS.map((era) => {
      const ours = ONE_MORE_TUNE_ALL_CARDS.filter((card) => oneMoreTuneEra(card).id === era.id);
      // The chip prints the era's own range, which is the one the design's
      // plate gallery and token table both carry. A card that predated its own
      // era would widen the range rather than sit under a year it never had;
      // none does, so the label reads exactly as the design draws it.
      const from = ours.reduce((low, card) => Math.min(low, card.year), era.from);
      const until = Number.isFinite(era.until) ? era.until : new Date().getFullYear();
      return {
        id: era.id,
        range: `${from} — ${until}`,
        name: era.name,
        count: ours.length,
      };
    }),
    { id: "none", range: "", name: "", count: ONE_MORE_TUNE_ALL_CARDS.filter((card) => oneMoreTuneEra(card).id === "none").length },
  ];
  const statusMatches = (card) => {
    if (oneMoreTuneSourceStatus === "settled") return oneMoreTuneAnswerable(card);
    if (oneMoreTuneSourceStatus === "unsettled") return !oneMoreTuneAnswerable(card);
    if (oneMoreTuneSourceStatus === "anchored") return Number.isFinite(card.sourceAnchor);
    if (oneMoreTuneSourceStatus === "linked") return Boolean(oneMoreTuneWatchLink(card));
    const facet = facetFacts.find((entry) => entry.id === oneMoreTuneSourceStatus);
    if (facet) return facet.test(card);
    return true;
  };
  const visible = ONE_MORE_TUNE_ALL_CARDS.filter((card) => {
    if (oneMoreTuneSourceUnit !== "all" && card.unit !== oneMoreTuneSourceUnit) return false;
    if (oneMoreTuneSourceEra !== "all" && oneMoreTuneEra(card).id !== oneMoreTuneSourceEra) return false;
    if (!statusMatches(card)) return false;
    if (!query) return true;
    return [card.id, card.song, card.artist, card.product, card.film, card.year, card.unit]
      .some((field) => String(field ?? "").toLowerCase().includes(query));
  });

  const rows = visible.map((card) => {
    const index = ONE_MORE_TUNE_ALL_CARDS.indexOf(card);
    const open = oneMoreTuneSourceOpen === card.id;
    return `<button class="datarow${open ? " is-open" : ""}" type="button" data-one-more-tune-source-row="${oneMoreTuneEscape(card.id)}" aria-expanded="${open ? "true" : "false"}">
            <span class="num mono">${String(index + 1).padStart(3, "0")}</span>
            <span class="cellmain">${oneMoreTuneEscape(card.song)}<span class="cellsub">${oneMoreTuneEscape(card.artist)}</span></span>
            <span class="cellmain productcol">${card.product ? oneMoreTuneEscape(card.product) : `<span data-i18n="one_more_tune_needs_check">Needs checking</span>`}<span class="cellsub">${card.year || ""} · ${oneMoreTuneEscape(oneMoreTuneUnitLabel(card.unit))}</span></span>
            <span class="cellsub campaigncol">${oneMoreTuneEscape(card.film || "")}</span>
            <span class="time">${Number.isFinite(card.sourceAnchor) ? oneMoreTuneEscape(formatOneMoreTuneSeconds(card.sourceAnchor)) : t("one_more_tune_time_unknown")}</span>
            <span class="arrow" aria-hidden="true">↗</span>
          </button>
          ${oneMoreTuneSourceDetail(card, { open })}`;
  }).join("");

  body.innerHTML = `
      <section class="one-more-tune-sources catalog">
        <div class="section-heading">
          <div>
            <div class="eyebrow" data-i18n="one_more_tune_sources_eyebrow">THE RESEARCH COLLECTION / 1999—2024</div>
            <h2 data-i18n="one_more_tune_ledger_title">Card by card</h2>
            <p data-i18n="one_more_tune_scope_note">Cards carried over from the research package, each with its evidence.</p>
          </div>
          <span class="chip" data-i18n="one_more_tune_ledger_spoiler">Every answer is on this page. Read it after playing.</span>
        </div>
        <div class="statbar">
          <div class="stat"><strong>${ONE_MORE_TUNE_ALL_CARDS.length}</strong><small data-i18n="one_more_tune_state_cards">Cards</small></div>
          <div class="stat"><strong>${linked.length}</strong><small data-i18n="one_more_tune_state_linked">Cards with a linkable original</small></div>
          <div class="stat"><strong>${anchored.length}</strong><small data-i18n="one_more_tune_state_anchors">Cards with a recorded source anchor</small></div>
          <div class="stat"><strong>${publishable}</strong><small data-i18n="one_more_tune_state_publishable">Publishable blind-listen questions</small></div>
        </div>
        <div class="catalog-body">
        <div class="catalog-facets">
        <div class="facets">
          <div class="facetrow">
            <span class="facetlabel" data-i18n="one_more_tune_facet_era">By era</span>
            ${eraFacets.map((facet) => `<button class="chip${oneMoreTuneSourceEra === facet.id ? " on" : ""}" type="button" data-one-more-tune-source-era="${oneMoreTuneEscape(facet.id)}">${oneMoreTuneEscape(facet.id === "all"
              ? `${t("one_more_tune_facet_all")} ${facet.count}`
              : facet.id === "none"
                ? `${t("one_more_tune_facet_none")} ${facet.count}`
                : `${facet.range} · ${facet.name} ${facet.count}`)}</button>`).join("")}
          </div>
          <div class="facetrow">
            <span class="facetlabel" data-i18n="one_more_tune_facet_status">By state</span>
            <button class="chip${oneMoreTuneSourceStatus === "all" ? " on" : ""}" type="button" data-one-more-tune-source-status="all">${oneMoreTuneEscape(`${t("one_more_tune_facet_all")} ${ONE_MORE_TUNE_ALL_CARDS.length}`)}</button>
            ${facetFacts.map((facet) => `<button class="chip${oneMoreTuneSourceStatus === facet.id ? " on" : ""}" type="button" data-one-more-tune-source-status="${oneMoreTuneEscape(facet.id)}">${oneMoreTuneEscape(`${t(facet.labelKey)} ${ONE_MORE_TUNE_ALL_CARDS.filter(facet.test).length}`)}</button>`).join("")}
          </div>
        </div>
        </div>
        <div class="catalog-list">
        <div class="datahead"><span>#</span><span data-i18n="one_more_tune_col_song">Song / artist</span><span class="productcol" data-i18n="one_more_tune_col_product">Product</span><span class="campaigncol" data-i18n="one_more_tune_col_film">Film</span><span data-i18n="one_more_tune_col_anchor">Anchor</span><span></span></div>
        <div class="filterbar">
          <input type="search" id="one-more-tune-source-search" value="${oneMoreTuneEscape(oneMoreTuneSourceQuery)}"
            data-i18n-placeholder="one_more_tune_sources_search" data-i18n-aria-label="one_more_tune_sources_search" placeholder="Search the songs, the products, the films…" aria-label="Search the catalogue" />
          <select id="one-more-tune-source-unit" data-i18n-aria-label="one_more_tune_sources_unit" aria-label="Filter by unit">
            <option value="all"${oneMoreTuneSourceUnit === "all" ? " selected" : ""}>${oneMoreTuneEscape(t("one_more_tune_sources_all_units"))}</option>
            ${ONE_MORE_TUNE_ALL_UNITS.map((unit) => `<option value="${oneMoreTuneEscape(unit.id)}"${oneMoreTuneSourceUnit === unit.id ? " selected" : ""}>${oneMoreTuneEscape(t(unit.labelKey))}</option>`).join("")}
          </select>
          <select id="one-more-tune-source-status" data-i18n-aria-label="one_more_tune_sources_status" aria-label="Filter by state">
            ${[["all", "one_more_tune_sources_all_states"], ["settled", "one_more_tune_sources_settled"], ["unsettled", "one_more_tune_sources_unsettled"], ["anchored", "one_more_tune_sources_anchored"], ["linked", "one_more_tune_sources_linked"]]
              .map(([id, key]) => `<option value="${id}"${oneMoreTuneSourceStatus === id ? " selected" : ""}>${oneMoreTuneEscape(t(key))}</option>`).join("")}
          </select>
          <span class="count">${oneMoreTuneEscape(t("one_more_tune_sources_entries").replace("{shown}", String(visible.length)).replace("{total}", String(ONE_MORE_TUNE_ALL_CARDS.length)))}</span>
        </div>
        <div class="one-more-tune-source-rows">${rows}</div>
        ${visible.length ? "" : oneMoreTuneSourceEmptyNote(eraFacets)}
        </div>
        <div class="catalog-spec">${oneMoreTuneSourceSpec(ONE_MORE_TUNE_ALL_CARDS.find((card) => card.id === oneMoreTuneSourceOpen) || null)}</div>
        </div>
        <p class="one-more-tune-shown eyebrow">${t("one_more_tune_state_auditioned")}: ${auditioned.length} · ${t("one_more_tune_state_units")}: ${ONE_MORE_TUNE_ALL_UNITS.length} · ${t("one_more_tune_state_version")} ${ONE_MORE_TUNE_DECK_VERSION}</p>
        <h3 data-i18n="one_more_tune_clocks_title">Three kinds of time</h3>
        <p data-i18n="one_more_tune_clocks_note">Three clocks: the source anchor, the music's place in the film, the player's cue. They are never copied into each other.</p>
        <h3 data-i18n="one_more_tune_music_note_title">About the music</h3>
        <p data-i18n="one_more_tune_music_note">No music is bundled or streamed. The player reads a file you choose, for this session.</p>
        <p class="notice" data-i18n="one_more_tune_ledger_note">A settled pairing, a playable link and an auditioned segment are three different things.</p>
        <footer class="page-footer">
          <div>
            <div data-i18n="one_more_tune_footer_left">One More Tune · an unofficial fan project</div>
          </div>
          <div>
            <div data-i18n="one_more_tune_footer_index">Selection index: AppleMusic.info and the sources listed row by row.</div>
            <div data-i18n="one_more_tune_footer_play">Play style from the original guessing game.</div>
          </div>
        </footer>
      </section>`;
}


const ONE_MORE_TUNE_COMMAND_NAMES = [
  "one-more-tune-play",
  "one-more-tune-choose-audio",
  "one-more-tune-clip-from-start",
  "one-more-tune-reveal",
  "one-more-tune-next",
  "one-more-tune-skip",
  "one-more-tune-undo",
  "one-more-tune-end-session",
  "one-more-tune-start-round",
  "one-more-tune-keynote-start",
  "one-more-tune-keynote-hint",
  "one-more-tune-keynote-next",
  "one-more-tune-line-start",
  "one-more-tune-line-next",
  "one-more-tune-hear",
  "one-more-tune-round-next",
  "one-more-tune-answer-retry",
  "one-more-tune-round-skip",
  "one-more-tune-play-again",
  "one-more-tune-report",
  "one-more-tune-play-film",
  "one-more-tune-share-question",
  "one-more-tune-share-set",
  "one-more-tune-share-score",
  "one-more-tune-export-progress",
  "one-more-tune-open-challenge",
  "one-more-tune-end-round",
  "one-more-tune-review-misses",
  "one-more-tune-share-round",
  "one-more-tune-add-to-study",
  "one-more-tune-find-film",
  "one-more-tune-share-card-image",
  "one-more-tune-shelf",
  "one-more-tune-study-view",
  "one-more-tune-challenge",
  "one-more-tune-sources",
  "one-more-tune-study-hear",
];

function oneMoreTuneCurrentCardId() {
  if (oneMoreTuneRound && oneMoreTuneQuestion()) return oneMoreTuneQuestion().cardId;
  return oneMoreTuneSession?.queue?.[oneMoreTuneSession.index] || "";
}

// The commands that can put a sound in the room, named once because the
// gesture-time unlock has to happen before any of them awaits.
const ONE_MORE_TUNE_SOUND_COMMANDS = new Set([
  "one-more-tune-hear",
  "one-more-tune-start-round",
  "one-more-tune-play-again",
  "one-more-tune-study-hear",
  "one-more-tune-play",
  "one-more-tune-clip-from-start",
]);

function oneMoreTuneCommandAvailability(action) {
  if (action === "open-one-more-tune") return { available: true, reason: "" };
  const activeWindow = document.querySelector(".window.is-active");
  if (activeWindow?.dataset.window !== "oneMoreTune") {
    return { available: false, reason: "one_more_tune_needs_window" };
  }
  const cardId = oneMoreTuneCurrentCardId();
  const inSession = Boolean(oneMoreTuneSession && oneMoreTuneSession.queue.length);
  const inRound = Boolean(oneMoreTuneRound && oneMoreTuneQuestion());

  if (["one-more-tune-next", "one-more-tune-skip", "one-more-tune-end-session"].includes(action) && !inSession) {
    return { available: false, reason: "one_more_tune_needs_session" };
  }
  if (["one-more-tune-hear", "one-more-tune-round-skip", "one-more-tune-report",
    "one-more-tune-play-film",
  "one-more-tune-share-question", "one-more-tune-share-set", "one-more-tune-share-score"].includes(action) && !inRound) {
    return { available: false, reason: "one_more_tune_needs_round" };
  }
  if (action === "one-more-tune-reveal" && (!inSession || oneMoreTuneSession.step !== "recall" || oneMoreTuneSession.revealed)) {
    return { available: false, reason: "one_more_tune_nothing_to_reveal" };
  }
  // The retry belongs to one state only: an answer this round would not take.
  // Everywhere else there is nothing to send again, and a menu row that offers
  // to re-send an answer that was already scored is a second point waiting to
  // happen. Greyed out rather than hidden, the way the rest of the menu works.
  if (action === "one-more-tune-answer-retry" && !oneMoreTuneQuestion()?.answerFailed) {
    return { available: false, reason: "one_more_tune_nothing_to_retry" };
  }
  if (action === "one-more-tune-undo" && !oneMoreTuneUndo) {
    return { available: false, reason: "one_more_tune_nothing_to_undo" };
  }
  if (["one-more-tune-play", "one-more-tune-choose-audio", "one-more-tune-clip-from-start"].includes(action) && !cardId) {
    return { available: false, reason: "one_more_tune_needs_session" };
  }
  if (action === "one-more-tune-play" && !(oneMoreTuneHasAudio(cardId) && oneMoreTuneTimes(cardId).quizClip.auditioned)) {
    return { available: false, reason: "one_more_tune_no_audio_for_card" };
  }
  if (action === "one-more-tune-start-round" && !oneMoreTuneRoundPool().length) {
    return { available: false, reason: "one_more_tune_no_round_pool" };
  }
  return { available: true, reason: "" };
}

function oneMoreTuneCommandAvailable(action) {
  return oneMoreTuneCommandAvailability(action).available;
}

function runOneMoreTuneCommand(action) {
  const cardId = oneMoreTuneCurrentCardId();
  // Every command that can sound starts by unlocking the audio context, inside
  // the tap that asked for it: iOS only lets a gesture do that, and the play
  // itself waits on a fetch and a decode before it can start anything.
  if (ONE_MORE_TUNE_SOUND_COMMANDS.has(action)) unlockOneMoreTuneAudio();
  if (action === "open-one-more-tune") return openOneMoreTune();
  if (action === "one-more-tune-play") {
    const played = playOneMoreTuneClip(cardId);
    if (played && oneMoreTuneSession) oneMoreTuneSession.mediaPlayed = true;
    return;
  }
  if (action === "one-more-tune-choose-audio") return chooseOneMoreTuneAudioFile(cardId);
  if (action === "one-more-tune-clip-from-start") {
    // The one place a 0 is written, and a person pressed it.
    setOneMoreTuneQuizClip(cardId, { start: 0, end: 15 });
    return void renderOneMoreTune();
  }
  if (action === "one-more-tune-reveal") return void revealOneMoreTuneCard();
  if (action === "one-more-tune-next" || action === "one-more-tune-skip") return void advanceOneMoreTuneCard();
  if (action === "one-more-tune-undo") {
    if (undoOneMoreTuneGrade()) setStatus(t("one_more_tune_undone"));
    return void renderOneMoreTune();
  }
  if (action === "one-more-tune-end-session") return void endOneMoreTuneSession();
  // These three can wait on a lookup, a fetch and a decode, so the command
  // hands the promise back instead of swallowing it: a caller that wants to
  // act after the sound starts needs something to wait on.
  if (action === "one-more-tune-start-round") return startOneMoreTuneRound();
  if (action === "one-more-tune-keynote-start") return startOneMoreTuneKeynoteRound();
  if (action === "one-more-tune-keynote-hint") {
    const hint = document.querySelector("[data-one-more-tune-hint]");
    return void submitOneMoreTuneKeynote("hint", hint?.dataset.oneMoreTuneHint || "");
  }
  if (action === "one-more-tune-keynote-next") return void advanceOneMoreTuneKeynote();
  if (action === "one-more-tune-line-start") return startOneMoreTuneLineRound();
  if (action === "one-more-tune-line-next") return void advanceOneMoreTuneLine();
  // One press for another ten. The fresh round shuffles a new set, and its
  // first question plays itself because this press is the gesture that opened
  // the audio in the first place.
  if (action === "one-more-tune-play-again") return startOneMoreTuneRound();
  if (action === "one-more-tune-hear") {
    const question = oneMoreTuneQuestion();
    if (!question) return undefined;
    // A song-video question keeps its player: the press only tells the frame to
    // play, and the frame's own state report is what updates the face.
    if (question.media?.provider === "youtube") {
      return playOneMoreTuneQuestion(question).then(() => oneMoreTuneRefreshPlayerChrome());
    }
    // The cue is loaded inside; the render that follows is what shows the
    // player's new label and any failure note.
    return playOneMoreTuneQuestion(question).then(() => renderOneMoreTune());
  }
  if (action === "one-more-tune-report") return void reportOneMoreTuneQuestion();
  if (action === "one-more-tune-play-film") return void playOneMoreTuneFilm(document.querySelector("[data-one-more-tune-command=\"one-more-tune-play-film\"]"));
  if (action === "one-more-tune-share-question") {
    return void copyOneMoreTuneText(oneMoreTuneShareLink(oneMoreTuneRound.index) || oneMoreTuneShareCode(oneMoreTuneRound.index), "one_more_tune_share_copied");
  }
  if (action === "one-more-tune-share-set") {
    return void shareOneMoreTuneInvite();
  }
  if (action === "one-more-tune-share-score") {
    return void copyOneMoreTuneText(oneMoreTuneScoreCard(), "one_more_tune_share_copied");
  }
  if (action === "one-more-tune-share-card-image") return void downloadOneMoreTuneShareCard();
  if (action === "one-more-tune-export-progress") return void downloadOneMoreTuneProgress();
  if (action === "one-more-tune-open-challenge") {
    const input = document.getElementById("one-more-tune-challenge-input");
    return void openOneMoreTuneChallenge(input?.value || "");
  }
  if (action === "one-more-tune-round-next") return void advanceOneMoreTuneRound();
  if (action === "one-more-tune-resume-round") {
    const stored = oneMoreTuneResumableRound();
    if (!stored) {
      renderOneMoreTune();
      return;
    }
    return void openOneMoreTuneChallenge(`OMT.${stored.deckVersion || 1}.${stored.setId}`);
  }
  // The promise goes back to the caller: the retry waits on the round, and a
  // caller that wants to know when the answer is in needs something to wait on.
  if (action === "one-more-tune-answer-retry") return retryOneMoreTuneAnswer();
  if (action === "one-more-tune-round-skip") return void submitOneMoreTuneAnswer("", { outcome: "skipped" });
  if (action === "one-more-tune-end-round") return void endOneMoreTuneRound();
  if (action === "one-more-tune-review-misses") return void reviewOneMoreTuneMisses();
  if (action === "one-more-tune-share-round") return shareOneMoreTuneRound();
  // The reveal's two doors, in the design's own words: add the card to the
  // study queue, or open the film the sound came from.
  if (action === "one-more-tune-add-to-study") {
    return void startOneMoreTuneCard(oneMoreTuneCardIdForReveal(oneMoreTuneQuestion()?.reveal));
  }
  if (action === "one-more-tune-find-film") {
    // Giving up is not wrong: the question is marked skipped and the reveal
    // opens, which is where the film link lives.
    return void submitOneMoreTuneAnswer("", { outcome: "skipped" });
  }
  if (action === "one-more-tune-shelf") return void setOneMoreTuneView("shelf");
  if (action === "one-more-tune-study-view") return void setOneMoreTuneView("study");
  if (action === "one-more-tune-challenge") return void setOneMoreTuneView("challenge");
  if (action === "one-more-tune-sources") return void setOneMoreTuneView("sources");
  if (action === "one-more-tune-study-hear") {
    const card = oneMoreTuneCard(oneMoreTuneSession?.queue?.[oneMoreTuneSession.index]);
    return card ? playOneMoreTuneStudySound(card) : undefined;
  }
}

// 资料馆 is backstage: the research behind the deck — sources, checks, the
// segment editor. Players never see its tab. It opens in a browser that was
// sent to ?launch=one-more-tune&backstage=1 once (backstage=0 closes it again).
const ONE_MORE_TUNE_BACKSTAGE_KEY = "ai-system-6-one-more-tune-backstage";

function oneMoreTuneBackstage() {
  try {
    return localStorage.getItem(ONE_MORE_TUNE_BACKSTAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setOneMoreTuneBackstage(open) {
  try {
    if (open) localStorage.setItem(ONE_MORE_TUNE_BACKSTAGE_KEY, "1");
    else localStorage.removeItem?.(ONE_MORE_TUNE_BACKSTAGE_KEY);
  } catch {
    // A browser that refuses storage simply has no backstage.
  }
}

function setOneMoreTuneView(view) {
  const views = oneMoreTuneBackstage()
    ? ["shelf", "study", "challenge", "keynote", "line", "sources"]
    : ["shelf", "study", "challenge", "keynote", "line"];
  oneMoreTuneView = views.includes(view) ? view : "shelf";
  stopOneMoreTuneFilm();
  stopOneMoreTuneAudio();
  renderOneMoreTune();
}

function handleOneMoreTuneClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const view = target.closest("[data-one-more-tune-view]");
  if (view) return void setOneMoreTuneView(view.dataset.oneMoreTuneView);
  const sources = target.closest("[data-one-more-tune-sources]");
  if (sources) return void setOneMoreTuneView("sources");
  const unit = target.closest("[data-one-more-tune-open-unit]");
  if (unit) return void startOneMoreTuneUnit(unit.dataset.oneMoreTuneOpenUnit);
  const card = target.closest("[data-one-more-tune-open-card]");
  if (card) return void startOneMoreTuneCard(card.dataset.oneMoreTuneOpenCard);
  // The credits entry opens by itself (it is a <details>); the click only asks
  // its own path for what to put inside, once.
  const filter = target.closest("[data-one-more-tune-filter]");
  if (filter) {
    oneMoreTuneFilter = filter.dataset.oneMoreTuneFilter;
    return void renderOneMoreTune();
  }
  // The catalogue's two facets: a year range, and one of the four states a
  // record can be in. Clicking the active chip clears it, so the facet is never
  // a trap.
  const sourceEra = target.closest("[data-one-more-tune-source-era]");
  if (sourceEra) {
    const value = sourceEra.dataset.oneMoreTuneSourceEra || "all";
    oneMoreTuneSourceEra = oneMoreTuneSourceEra === value ? "all" : value;
    return void renderOneMoreTune();
  }
  const sourceStatus = target.closest("[data-one-more-tune-source-status]");
  if (sourceStatus) {
    const value = sourceStatus.dataset.oneMoreTuneSourceStatus || "all";
    oneMoreTuneSourceStatus = oneMoreTuneSourceStatus === value ? "all" : value;
    return void renderOneMoreTune();
  }
  const answer = target.closest("[data-one-more-tune-answer]");
  if (answer) return void answerOneMoreTuneMatch(answer.dataset.oneMoreTuneAnswer);
  const keynoteAnswer = target.closest("[data-one-more-tune-keynote-answer]");
  if (keynoteAnswer) return void submitOneMoreTuneKeynote("answer", keynoteAnswer.dataset.oneMoreTuneKeynoteAnswer);
  const lineAnswer = target.closest("[data-one-more-tune-line-answer]");
  if (lineAnswer) return void submitOneMoreTuneLine("answer", lineAnswer.dataset.oneMoreTuneLineAnswer);
  const lineSkip = target.closest("[data-one-more-tune-line-skip]");
  if (lineSkip) return void submitOneMoreTuneLine("skip");
  const keynoteHint = target.closest("[data-one-more-tune-hint]");
  if (keynoteHint) return void submitOneMoreTuneKeynote("hint", keynoteHint.dataset.oneMoreTuneHint);
  // A catalogue row opens its own card's detail in place, the way the research
  // reader does: the checks stay with the row they belong to.
  const row = target.closest("[data-one-more-tune-source-row]");
  if (row) {
    // One piece of state for both positions: the row's inline detail on a
    // narrow window, the third column on a wide one. The design's catalogue has
    // the spec pane beside the list, and a window too narrow for three columns
    // gets the same block under the row rather than a squeezed pane.
    const id = row.dataset.oneMoreTuneSourceRow;
    oneMoreTuneSourceOpen = oneMoreTuneSourceOpen === id ? "" : id;
    return void renderOneMoreTune();
  }
  const submit = target.closest("[data-one-more-tune-submit]");
  if (submit) return void submitOneMoreTuneAnswer(submit.dataset.oneMoreTuneSubmit);
  const grade = target.closest("[data-one-more-tune-grade]");
  if (grade) return void gradeOneMoreTuneCard(grade.dataset.oneMoreTuneGrade);
  const command = target.closest("[data-one-more-tune-command]");
  if (command) runOneMoreTuneCommand(command.dataset.oneMoreTuneCommand);
}

function handleOneMoreTuneInput(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.id === "one-more-tune-search") {
    oneMoreTuneQuery = String(target.value || "");
    renderOneMoreTune();
    // Re-rendering the shelf replaces the field the person is typing in, so the
    // caret goes back where it was rather than to the end of the list.
    document.getElementById("one-more-tune-search")?.focus();
    return;
  }
  if (target.id === "one-more-tune-source-search") {
    oneMoreTuneSourceQuery = String(target.value || "");
    const caret = target.selectionStart;
    renderOneMoreTune();
    const field = document.getElementById("one-more-tune-source-search");
    field?.focus();
    if (field && caret !== null) field.setSelectionRange(caret, caret);
    return;
  }
  // A select fires `input` before `change`, so the delegated input listener
  // carries both of the catalogue's menus.
  if (target.id === "one-more-tune-source-unit") {
    oneMoreTuneSourceUnit = String(target.value || "all");
    return void renderOneMoreTune();
  }
  if (target.id === "one-more-tune-source-status") {
    oneMoreTuneSourceStatus = String(target.value || "all");
    return void renderOneMoreTune();
  }
  const state = oneMoreTuneStateNow();
  if (target.id === "one-more-tune-new-per-day") {
    state.settings.newPerDay = Math.max(1, Math.min(20, Number(target.value) || 5));
    return void writeOneMoreTuneState();
  }
  if (target.id === "one-more-tune-due-batch") {
    state.settings.dueBatch = Math.max(1, Math.min(50, Number(target.value) || 10));
    return void writeOneMoreTuneState();
  }
  const cardId = oneMoreTuneCurrentCardId();
  if (!cardId) return;
  // An emptied field means unknown again, not zero.
  if (target.id === "one-more-tune-clip-start") {
    const raw = String(target.value).trim();
    return void (raw === "" ? clearOneMoreTuneQuizClip(cardId) : setOneMoreTuneQuizClip(cardId, { start: Number(raw) }));
  }
  if (target.id === "one-more-tune-clip-end") {
    const raw = String(target.value).trim();
    return void (raw === "" ? setOneMoreTuneQuizClip(cardId, { end: null }) : setOneMoreTuneQuizClip(cardId, { end: Number(raw) }));
  }
  // The judgement itself. Typing it saves it with the range; the range's own
  // event carries the reason when the range changes with it, and the committed
  // sentence logs one of its own, so a later reason never rewrites history.
  if (target.id === "one-more-tune-clip-reason") {
    oneMoreTuneRecord(cardId).quizClip.reason = String(target.value || "").slice(0, 240);
    return void writeOneMoreTuneState();
  }
}

function handleOneMoreTuneFileChange(event) {
  const input = event.target;
  const file = input?.files?.[0];
  const cardId = String(input?.dataset?.oneMoreTuneCard || "");
  // The input keeps no reference to the file: re-choosing the same file has to
  // fire change again, and the name must not linger in the DOM.
  input.value = "";
  delete input.dataset.oneMoreTuneCard;
  if (file && cardId) loadOneMoreTuneAudioFile(file, cardId);
}

/**
 * Keys belong to the card, not to the document: 1–4 grade a revealed card and
 * Escape leaves, but a person typing a start time into a number field keeps
 * every key they press.
 */
function handleOneMoreTuneKeydown(event) {
  if (document.querySelector(".window.is-active")?.dataset.window !== "oneMoreTune") return;
  const target = event.target;
  if (target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']")) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "Escape") {
    if (oneMoreTuneRound) endOneMoreTuneRound();
    else if (oneMoreTuneSession) endOneMoreTuneSession();
    return;
  }
  // The two habits a game on a desk is expected to have, and only inside this
  // window with the focus outside a field: Space plays the cue again, Return
  // takes the next question once the answer is in. Both go through the same
  // commands the menus use, so the audio unlock and the availability rules stay
  // in one place. Neither is a global shortcut — the desk's keys are untouched.
  if (event.key === " " && !event.repeat) {
    if (oneMoreTuneRound && oneMoreTuneQuestion() && !oneMoreTuneQuestion().submitted) {
      event.preventDefault();
      runOneMoreTuneCommand("one-more-tune-hear");
      return;
    }
    if (oneMoreTuneSession && oneMoreTuneSession.step !== "match") {
      event.preventDefault();
      runOneMoreTuneCommand("one-more-tune-study-hear");
      return;
    }
  }
  // 1–4 answer the question in front of you — the keys the four rows are
  // numbered with on a desk. A phone never shows the numbers.
  if (/^[1-4]$/.test(event.key) && oneMoreTuneRound && oneMoreTuneQuestion() && !oneMoreTuneQuestion().submitted) {
    const choice = oneMoreTuneQuestion().choices?.[Number(event.key) - 1];
    if (choice) {
      event.preventDefault();
      void submitOneMoreTuneAnswer(choice.id);
    }
    return;
  }
  if (event.key === "Enter" && oneMoreTuneRound && oneMoreTuneQuestion()?.submitted) {
    event.preventDefault();
    runOneMoreTuneCommand("one-more-tune-round-next");
    return;
  }
  if (!oneMoreTuneSession?.revealed) return;
  const index = Number(event.key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= ONE_MORE_TUNE_GRADES.length) return;
  event.preventDefault();
  gradeOneMoreTuneCard(ONE_MORE_TUNE_GRADES[index].id);
}

async function openOneMoreTune() {
  // The shelf, the study faces and 资料 all read the deck, so the window waits
  // for it rather than painting an empty one.
  await oneMoreTuneEnsureDeck();
  await openWindow("oneMoreTune");
}

/**
 * A link that arrives from outside.
 *
 * `?launch=one-more-tune` lands on the challenge rather than the card shelf,
 * because a link is shared to be played, not browsed, and `&set=OMT.<v>.<id>`
 * opens that exact ten so two people are comparing the same round rather than
 * two random ones. Read once per visit: reopening the window later is the
 * person's own navigation, not the link arriving again, and a round already in
 * progress is never thrown away for it.
 */
let oneMoreTuneLaunchConsumed = false;
/**
 * True when this round arrived from somebody else's link.
 *
 * It matters for one reason: a tap on a link in a chat window is not a gesture
 * inside this page, so the browser will not let the first question's sound
 * start on its own. iOS is the strict one, and it is most of the audience. The
 * friend gets the question face with the music waiting and no idea that a tap
 * is what starts it — measured: `heard: 0` on arrival, `heard: 1` after one tap
 * on the player, in both engines. So the face says so, in one short line, and
 * the line goes away the moment they do it.
 */
let oneMoreTuneArrivedFromLink = false;

function consumeOneMoreTuneLaunchIntent() {
  if (oneMoreTuneLaunchConsumed) return;
  const intent = window.AISystem6LaunchIntent?.parse?.(String(window.location?.search || "")) || {};
  if (intent.launch?.name !== "one-more-tune") return;
  oneMoreTuneLaunchConsumed = true;
  // Open the window this link is for.
  //
  // Nothing else in the desk opens a window for a `?launch=` link — measured
  // 2026-09-20: `/go/one-more-tune` reached this file and no further, so whether
  // a friend landed in the quiz depended on whether a first-run window happened
  // to leave it in front. On a phone that is the whole difference between
  // "手机版有 bug" and a quiz: the shared link opened the desk's welcome and
  // nothing else. The window is opened here, after the deck, and the rest of
  // the intent is applied to it.
  void openOneMoreTune().then(() => {
    if (oneMoreTuneRound) return;
    const backstage = new URLSearchParams(String(window.location?.search || "")).get("backstage");
    if (backstage === "1" || backstage === "0") {
      setOneMoreTuneBackstage(backstage === "1");
      if (backstage === "1") return void setOneMoreTuneView("sources");
    }
    setOneMoreTuneView("challenge");
    if (intent.set) {
      oneMoreTuneArrivedFromLink = true;
      void openOneMoreTuneChallenge(intent.set);
    }
  });
}

function attachOneMoreTune() {
  const root = oneMoreTuneRoot();
  if (!root) return;
  if (root.dataset.oneMoreTuneBound !== "true") {
    root.dataset.oneMoreTuneBound = "true";
    const resources = oneMoreTuneInstanceResources();
    resources.listen(root, "click", handleOneMoreTuneClick);
    // The first touch anywhere in the window is a gesture, and iOS keeps the
    // audio shut until one arrives. Unlocking here means the round the person
    // is about to start can ask its own questions out loud, in Safari, in the
    // installed app, and in WeChat's browser, without a second tap per card.
    resources.listen(root, "pointerdown", () => unlockOneMoreTuneAudio());
    resources.listen(root, "touchstart", () => unlockOneMoreTuneAudio());
    resources.listen(root, "input", handleOneMoreTuneInput);
    resources.listen(root, "change", (event) => {
      if (event.target?.id === "one-more-tune-audio-input") handleOneMoreTuneFileChange(event);
      if (event.target?.id === "one-more-tune-progress-input") void handleOneMoreTuneProgressFile(event.target.files?.[0] || null);
      if (event.target?.id === "one-more-tune-clip-reason") {
        const cardId = oneMoreTuneCurrentCardId();
        if (cardId) setOneMoreTuneClipReason(cardId, event.target.value);
      }
    });
    resources.listen(document, "keydown", handleOneMoreTuneKeydown);
  }
  // The deck is a file, so a window opened by a menu click, a restored session
  // or the MultiFinder can arrive before it. Paint once now — the empty state
  // is honest — and paint again the moment the deck lands, so "start a round"
  // is never a greyed-out button on a deck that is simply still loading.
  renderOneMoreTune();
  setStatus(t("one_more_tune_ready"));
  oneMoreTuneEnsureDeck().then(async () => {
    if (oneMoreTuneRoot()?.dataset?.oneMoreTuneBound !== "true") return;
    // After the deck, because the state is filed by card id: adopting a stored
    // record before the cards are known would drop every card it names.
    await oneMoreTuneHydrateState();
    if (oneMoreTuneRoot()?.dataset?.oneMoreTuneBound !== "true") return;
    renderOneMoreTune();
    // After the deck, because a challenge opened against no deck would render a
    // round whose cards it cannot name.
    consumeOneMoreTuneLaunchIntent();
  });
  // The scheduler is a vendor bundle of its own, asked for beside the deck so
  // that the four buttons can show the dates `repeat()` computes by the time a
  // card is turned over. A load that lands late repaints the face it belongs to
  // — and one that never lands leaves the buttons usable and honest about the
  // missing date.
  oneMoreTuneEnsureScheduler().then((schedule) => {
    if (!schedule || oneMoreTuneRoot()?.dataset?.oneMoreTuneBound !== "true") return;
    renderOneMoreTune();
  });
}

function disposeOneMoreTune() {
  // The era visit is given back with the window: the desk returns to the
  // Appearance the writer chose, which is what "this session only" means.
  leaveOneMoreTuneEraTheme();
  stopOneMoreTuneFilm();
  stopOneMoreTuneAudio();
  clearOneMoreTuneNowPlaying();
  const root = oneMoreTuneRoot();
  if (root) delete root.dataset.oneMoreTuneBound;
  oneMoreTuneResources?.dispose("one-more-tune-disposed");
  oneMoreTuneSession = null;
  oneMoreTuneRound = null;
  oneMoreTuneKeynoteRound = null;
  oneMoreTuneUndo = null;
  oneMoreTuneAudio = { context: null, buffers: new Map(), elements: new Map(), node: null, gate: null, stopTimer: null, playingCardId: "", wechatHooked: false, gateArmed: undefined, cueSource: "", cueStart: null, cueEnd: null, cueClockAt: null, discFrame: 0, discAt: 0, pendingCue: false };
}

// Playing music is exactly the thing a backgrounded application must stop
// doing, and a disposed one must also give back its audio context. The era visit
// goes back with both: leaving the deck — closing the window, or the game
// falling behind another one — is leaving the round, and the writer gets their
// own Appearance back. Browsing the shelf inside the game is not leaving it, and
// there the last revealed era stands, which is the whole point of the visit.
window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("oneMoreTune", {
  onSuspend: () => {
    stopOneMoreTuneFilm();
    stopOneMoreTuneAudio();
    leaveOneMoreTuneEraTheme();
  },
  onDispose: () => disposeOneMoreTune(),
});

window.AISystem6RegisterApplicationMenuSet?.("oneMoreTune", [
  {
    id: "file",
    labelKey: "menu_file",
    items: [
      { type: "item", action: "close-active-window", labelKey: "close", shortcutId: "close-window", conditionId: "close-active-window" },
    ],
  },
  {
    id: "edit",
    labelKey: "menu_edit",
    items: [
      { type: "item", action: "one-more-tune-undo", labelKey: "one_more_tune_undo_grade", conditionId: "one-more-tune-undo" },
      { type: "separator" },
      { type: "item", action: "cut", labelKey: "cut", shortcutId: "cut", conditionId: "cut" },
      { type: "item", action: "copy", labelKey: "copy", shortcutId: "copy", conditionId: "copy" },
      { type: "item", action: "paste", labelKey: "paste", shortcutId: "paste", conditionId: "paste" },
    ],
  },
  {
    id: "study",
    labelKey: "one_more_tune_menu_study",
    items: [
      { type: "item", action: "one-more-tune-reveal", labelKey: "one_more_tune_reveal", conditionId: "one-more-tune-reveal" },
      { type: "item", action: "one-more-tune-skip", labelKey: "one_more_tune_skip", conditionId: "one-more-tune-skip" },
      { type: "separator" },
      { type: "item", action: "one-more-tune-start-round", labelKey: "one_more_tune_start_round", conditionId: "one-more-tune-start-round" },
      { type: "item", action: "one-more-tune-hear", labelKey: "one_more_tune_hear", conditionId: "one-more-tune-hear" },
      // The round's own commands live here rather than as a row of buttons on
      // the question's face: a menu is what this bar is for — the actions are
      // necessary and almost never wanted mid-question. Same ids as before, so
      // nothing else has to learn a new name. Each carries its conditionId, so
      // an action that cannot run now (skip outside a round, share outside an
      // invited set) greys out instead of disappearing.
      { type: "separator" },
      { type: "item", action: "one-more-tune-round-next", labelKey: "one_more_tune_next", conditionId: "one-more-tune-round-next" },
      // The retry is the same action the refused answer's own face offers, and
      // it lives here too so the two are one command rather than two: a menu
      // that cannot reach a state the face can is a menu with a hole in it.
      { type: "item", action: "one-more-tune-answer-retry", labelKey: "one_more_tune_answer_retry", conditionId: "one-more-tune-answer-retry" },
      { type: "item", action: "one-more-tune-round-skip", labelKey: "one_more_tune_skip_question", conditionId: "one-more-tune-round-skip" },
      { type: "item", action: "one-more-tune-find-film", labelKey: "one_more_tune_find_film", conditionId: "one-more-tune-find-film" },
      { type: "item", action: "one-more-tune-play-again", labelKey: "one_more_tune_play_again", conditionId: "one-more-tune-play-again" },
      { type: "item", action: "one-more-tune-end-round", labelKey: "one_more_tune_leave", conditionId: "one-more-tune-end-round" },
      { type: "separator" },
      { type: "item", action: "one-more-tune-add-to-study", labelKey: "one_more_tune_add_to_study", conditionId: "one-more-tune-add-to-study" },
      { type: "item", action: "one-more-tune-share-question", labelKey: "one_more_tune_share_question", conditionId: "one-more-tune-share-question" },
      { type: "item", action: "one-more-tune-report", labelKey: "one_more_tune_report", conditionId: "one-more-tune-report" },
      { type: "separator" },
      { type: "item", action: "one-more-tune-review-misses", labelKey: "one_more_tune_queue_misses", conditionId: "one-more-tune-review-misses" },
      { type: "item", action: "one-more-tune-share-round", labelKey: "one_more_tune_share_round", conditionId: "one-more-tune-share-round" },
      { type: "item", action: "one-more-tune-share-set", labelKey: "one_more_tune_share_set", conditionId: "one-more-tune-share-set" },
      { type: "item", action: "one-more-tune-share-card-image", labelKey: "one_more_tune_share_card_image", conditionId: "one-more-tune-share-card-image" },
      { type: "item", action: "one-more-tune-share-score", labelKey: "one_more_tune_share_score", conditionId: "one-more-tune-share-score" },
      { type: "separator" },
      // The places a person goes to on purpose. They left the tab row when the
      // round became a room, and this is where they are reached from.
      { type: "item", action: "one-more-tune-shelf", labelKey: "one_more_tune_view_shelf", conditionId: "one-more-tune-shelf" },
      { type: "item", action: "one-more-tune-study-view", labelKey: "one_more_tune_view_study", conditionId: "one-more-tune-study-view" },
      { type: "item", action: "one-more-tune-end-session", labelKey: "one_more_tune_back_to_shelf", conditionId: "one-more-tune-end-session" },
    ],
  },
]);

window.AISystem6OneMoreTune = Object.freeze({
  attach: attachOneMoreTune,
  /**
   * The film window is built when somebody asks for a film rather than at
   * boot: the desk's Appearance gate mounts every registered window, and the
   * window manager mounts this one through the registry, so both need a way in
   * that does not depend on a card being open.
   */
  installFilmWindow: () => installOneMoreTuneFilmWindow(),
  /**
   * What the mounted player last said. Read-only, and the only way a contract
   * or a person can tell "the frame is there" from "the sound started".
   */
  videoState: () => oneMoreTuneVideoState(),
  dispose: disposeOneMoreTune,
  /** The share card, as a canvas: contracts check it, the button exports it. */
  shareCardCanvas: () => oneMoreTuneShareCardCanvas(),
  /** Read the deck file once; every reader waits on the same promise. */
  loadDeck: oneMoreTuneEnsureDeck,
  /**
   * Where the study progress is kept, and how it leaves and comes back. The
   * export payload and the file reader are here so a contract can drive the
   * refusals with real files rather than by reading the source.
   */
  progress: Object.freeze({
    exportPayload: () => oneMoreTuneExportPayload(),
    readFile: (text) => oneMoreTuneReadProgressFile(text),
    applyFile: (text) => applyOneMoreTuneProgressFile(text),
    source: () => oneMoreTuneStorageSource,
    hydrate: () => oneMoreTuneHydrateState(),
  }),
  /** The deck as data, for contracts and for anything that reads the shelf. */
  cards: () => ONE_MORE_TUNE_CARDS.map((card) => ({ ...card })),
  allCards: () => ONE_MORE_TUNE_ALL_CARDS.map((card) => ({ ...card })),
  units: () => ONE_MORE_TUNE_UNITS.map((unit) => ({ ...unit })),
  /** learn / recall / challenge, derived, with the reasons a gate is shut. */
  readiness: (cardId) => oneMoreTuneReadiness(String(cardId || "")),
  /** The three clocks, kept apart; unknown reads null, never 0. */
  times: (cardId) => oneMoreTuneTimes(String(cardId || "")),
  /** The six eras, and the Appearance each one is drawn in. */
  eras: () => ONE_MORE_TUNE_ERAS.map((era) => ({ ...era })),
  /**
   * What this session has measured about the hosts a film needs, and the two
   * places one question's sound may come from. Both are read-only views for
   * contracts and for the backstage, never a way to change them.
   */
  network: () => ({ ...(oneMoreTuneNetworkCache() || { youtube: null, at: 0, probed: false }) }),
  previewSources: (url) => oneMoreTunePreviewSources(String(url || "")),
  /** Which era a card belongs to, by its year; an unknown year has no theme. */
  eraFor: (cardId) => oneMoreTuneEra(oneMoreTuneCard(String(cardId || ""))),
  /** Which App Store storefront a listen link is built for (see its comment). */
  storefront: () => oneMoreTuneStorefront(),
  /**
   * The listen link's two pure halves, for contracts: which catalogue answer is
   * this card's recording, and what the reader's own store page is. Both refuse
   * rather than guess — a card the catalogue cannot name keeps the search link.
   */
  listenStore: Object.freeze({
    bestMatch: (results, card) => oneMoreTuneBestSongMatch(results, card),
    storeUrl: (track, storefront) => oneMoreTuneStoreUrl(track, storefront),
  }),
  setQuizClip: (cardId, range) => setOneMoreTuneQuizClip(String(cardId || ""), range || {}),
  options: (cardId, count) => oneMoreTuneOptions(oneMoreTuneCard(String(cardId || "")), count).map((card) => card.id),
  grade: (cardId, gradeId) => oneMoreTuneGrade(String(cardId || ""), String(gradeId || "")),
  undo: () => undoOneMoreTuneGrade(),
  record: (cardId) => JSON.parse(JSON.stringify(oneMoreTuneRecord(String(cardId || "")))),
  events: () => oneMoreTuneStateNow().events.map((event) => ({ ...event })),
  session: () => (oneMoreTuneSession ? { unitId: oneMoreTuneSession.unitId, step: oneMoreTuneSession.step, index: oneMoreTuneSession.index, revealed: oneMoreTuneSession.revealed, autoPlayed: oneMoreTuneSession.autoPlayed === true } : null),
  round: () => (oneMoreTuneRound ? { index: oneMoreTuneRound.index, mode: oneMoreTuneRound.mode, questions: oneMoreTuneRound.questions.map((question) => ({ ...question })) } : null),
  startUnit: startOneMoreTuneUnit,
  commandAvailability: (action) => oneMoreTuneCommandAvailability(String(action || "")),
});

window.AISystem6Runtime?.registerApplication({
  id: "oneMoreTune",
  windowName: "oneMoreTune",
  mount: attachOneMoreTune,
  restore: attachOneMoreTune,
  commands: Object.fromEntries(
    ["open-one-more-tune", ...ONE_MORE_TUNE_COMMAND_NAMES].map((action) => [action, {
      handler: () => runOneMoreTuneCommand(action),
      isAvailable: () => oneMoreTuneCommandAvailable(action),
      unavailableReason: () => oneMoreTuneCommandAvailability(action).reason,
    }])
  ),
});
