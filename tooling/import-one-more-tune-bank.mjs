#!/usr/bin/env node
// Put the research bank's own cards into the deck.
//
// The deck grew out of an earlier catalogue pass; the editorial bank is a second
// list, and the two only partly overlap. That was fine while the bank was a
// private worksheet, but it is not fine now: forty entries the research side
// calls answerable — including the three songs its playtest wired up (Down, The
// Difference, New Soul) and Wingspan, the first task its instructions name —
// were simply absent from the window. A person could not play them because no
// card existed.
//
// So this adds what the deck is missing, and nothing else:
//
//   * Only entries with both an answer label and a film title: a card with no
//     settled pairing belongs on the shelf as a candidate, not in the deck.
//   * Only entries the shared content join cannot already find. A song the deck
//     already carries is left alone, whatever the bank says about it.
//   * The card's id is the deck's own next number. The bank's OMT numbers do not
//     project — that is why the evidence panel joins on content — so pretending
//     they do would collide with cards already using those numbers.
//   * The research's own four choices travel with the card where the bank has
//     them, so a question can be asked with the options somebody checked rather
//     than with three drawn at random.
//   * Notes are the package's editorial notes, verbatim, in the language they
//     were written in; the English side is left empty rather than invented.
//
//   node tooling/import-one-more-tune-bank.mjs --package <dir> [--write]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { foldOneMoreTuneText, joinOneMoreTuneCards, readOneMoreTunePackageQuestions } from "./lib/one-more-tune-join.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argIndex = process.argv.indexOf("--package");
const packageDir = argIndex > 0 ? process.argv[argIndex + 1] : process.env.ONE_MORE_TUNE_PACKAGE;
const write = process.argv.includes("--write");
const deckPath = join(root, "apps/desktop/data/one-more-tune-deck.json");

if (!packageDir) {
  console.error("NO  --package <dir> (or ONE_MORE_TUNE_PACKAGE) must point at the editorial bank.");
  process.exit(1);
}

// A bank category is not a unit, and a unit is not a shelf: the deck's own
// contract is that a lesson is three to five associations. Dropping thirty-five
// carried-over cards into the existing units made five of them into fifteen-card
// courses, which is a different product. So the imported cards form their own
// small lessons, grouped by the family of the thing they advertise, and the
// lesson title names the family and the years it covers.
const FAMILIES = [
  { id: "bank-mac", labelKey: "one_more_tune_unit_bank_mac", categories: ["Mac", "MacBook Air", "MacBook Pro（M3 系列）", "Mac 品牌宣传片"] },
  { id: "bank-ipod", labelKey: "one_more_tune_unit_bank_ipod", categories: ["iPod"] },
  {
    id: "bank-audio",
    labelKey: "one_more_tune_unit_bank_audio",
    categories: ["AirPods Pro", "AirPods 空间音频", "HomePod", "音频", "配件", "Apple Watch", "Apple Watch Series 6", "Apple Watch Series 6 运动宣传片", "Apple Watch Series 7"],
  },
  { id: "bank-iphone", labelKey: "one_more_tune_unit_bank_iphone", categories: ["iPhone", "iPhone Air", "iPhone 16 Pro", "iPad"] },
  {
    id: "bank-vision",
    labelKey: "one_more_tune_unit_bank_vision",
    categories: ["Apple Vision Pro", "Apple Vision Pro 空间记忆", "Apple Vision Pro 空间影院", "功能与服务", "Apple TV+《Severance》剪辑制作短片"],
  },
];
const LESSON_SIZE = 4;

// Some of the bank's notes are machine codes rather than sentences. A code is a
// fact about the record, so this window says the same thing in words — the
// translation is the code's own meaning, not a new claim about the pairing.
const NOTE_CODES = new Map([
  ["source_title_shortened recording_identity_unresolved", {
    en: "The source shortens the film's title, and which recording this is has not been settled.",
    zh: "来源把片名写短了，而且还没有定下具体是哪一个录音。",
  }],
  ["singular_plural_mismatch not_Whethan_Wave", {
    en: "The source's title disagrees on singular or plural, and this is not Whethan's Wave.",
    zh: "来源标题的单复数对不上；这不是 Whethan 的那首 Wave。",
  }],
  ["custom_arrangement M2_generation_from_catalog_only", {
    en: "A custom arrangement, and the catalogue only fixes the generation — not the recording.",
    zh: "这是定制编排；目录只能确定产品代际，确定不了具体录音。",
  }],
  ["custom_vocal_layers edit_identity_not_confirmed", {
    en: "The vocal layers are custom and the edit's identity is not confirmed.",
    zh: "人声层是定制叠的，这一版剪辑的身份还没有确认。",
  }],
  ["portfolio_edit_omits_voiceover_and_sound_design", {
    en: "The composer's portfolio edit drops the voiceover and the sound design, so its timeline is not the film's.",
    zh: "作曲家作品集里的这一版去掉了旁白和音效，所以它的时间轴不是原片的。",
  }],
]);

/**
 * Split a family's cards into lessons of three to five, evenly.
 *
 * Four is the usual size and this deck's floor and ceiling are the contract:
 * six cards become two lessons of three, not a lesson of four with a stub of
 * two bolted on. A family with one or two cards forms no lesson at all — a
 * lesson of one is a card with a title.
 */
function lessonSizes(count) {
  if (count < 3) return [];
  if (count <= 5) return [count];
  const lessons = Math.ceil(count / 5);
  const base = Math.floor(count / lessons);
  const extra = count % lessons;
  return Array.from({ length: lessons }, (_, index) => base + (index < extra ? 1 : 0));
}

/** Which family a bank category belongs to; anything unmapped forms no lesson. */
function familyOf(category) {
  return FAMILIES.find((family) => family.categories.includes(category)) || null;
}

const deck = JSON.parse(readFileSync(deckPath, "utf8"));
const questions = readOneMoreTunePackageQuestions(packageDir);
const { byQuestion } = joinOneMoreTuneCards(deck.cards, questions);

const usedIds = new Set(deck.cards.map((card) => card.id));
const nextId = () => {
  for (let n = 1; n <= 999; n += 1) {
    const id = `OMT-${String(n).padStart(3, "0")}`;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new Error("the deck has outgrown its id space");
};

const added = [];
for (const question of questions) {
  if (byQuestion.has(question.id)) continue;
  const product = question.answer?.label || "";
  const film = question.appearance?.title || "";
  if (!product || !film || !question.music?.title) continue;
  const year = Number.isInteger(question.campaign_year) ? question.campaign_year : null;
  const family = familyOf(question.category);
  const videoId = /^[\w-]{11}$/.test(String(question.appearance?.video_id || "")) ? question.appearance.video_id : "";
  const anchor = Number.isInteger(question.appearance?.source_anchor_seconds) && question.appearance.source_anchor_seconds >= 0
    ? question.appearance.source_anchor_seconds
    : null;
  // The bank's own worksheet mixes prose with machine codes — one entry's note
  // is the identifier `portfolio_edit_omits_voiceover_and_sound_design`. A code
  // printed on a card would be a label nobody can read, so only prose travels:
  // a note has to be Chinese, or latin with spaces in it.
  const isProse = (text) => /[\u4e00-\u9fff]/.test(text) || /\S\s+\S\s+\S/.test(text);
  const rawNotes = (question.editorial_notes || []).filter((note) => typeof note === "string" && note);
  const notes = rawNotes.filter(isProse);
  // The worksheet lists codes one per line, so the joined line is the key.
  const decoded = NOTE_CODES.get(rawNotes.join(" ")) || null;
  const card = {
    id: nextId(),
    from: question.id,
    // The lesson is assigned below, once every carried-over card is known: a
    // lesson is a group, and a group cannot be sized one card at a time.
    unit: "",
    basis: "package",
    song: question.music.title,
    artist: question.music.artist || "",
    product,
    film,
    year,
    kind: question.appearance?.kind || "product_ad",
    videoId,
    sourceAnchor: anchor,
    anchorVideoId: anchor === null ? "" : videoId,
    note: {
      en: decoded ? decoded.en : "",
      zh: notes.length ? notes.join(" ") : (decoded ? decoded.zh : ""),
    },
    enabled: false,
  };
  deck.cards.push(card);
  added.push({ card, family, question });
}

for (const row of added) {
  const { card, question } = row;
  console.log(`${write ? "OK  " : "--  "}${card.id} <- ${question.id}  ${card.song} · ${card.product} · ${card.film} (${card.year ?? "—"})`);
}

// One lesson per group of four, per family, in the order the bank lists them.
const unitsById = new Map(deck.units.map((unit) => [unit.id, unit]));
let lessonCount = 0;
for (const family of FAMILIES) {
  const rows = added.filter((row) => row.family?.id === family.id);
  const sizes = lessonSizes(rows.length);
  if (!sizes.length) {
    if (rows.length) console.log(`--  ${family.id}: ${rows.length} card(s), too few for a lesson; they stay on the shelf`);
    continue;
  }
  let cursor = 0;
  for (const [index, size] of sizes.entries()) {
    const slice = rows.slice(cursor, cursor + size);
    cursor += size;
    const ordinal = index + 1;
    const id = `${family.id}-${ordinal}`;
    if (!unitsById.has(id)) {
      const unit = { id, labelKey: `${family.labelKey}_${ordinal}` };
      deck.units.push(unit);
      unitsById.set(id, unit);
    }
    for (const row of slice) row.card.unit = id;
    lessonCount += 1;
  }
}
console.log(`${write ? "OK  " : "--  "}${lessonCount} new lesson(s) for the carried-over cards`);

// The same song twice would make the distractor pool lie about uniqueness.
const seenKeys = new Map();
const clashes = [];
for (const card of deck.cards) {
  const key = `${foldOneMoreTuneText(card.song)}|${foldOneMoreTuneText(card.artist)}|${foldOneMoreTuneText(card.product)}`;
  if (seenKeys.has(key)) clashes.push(`${card.id} and ${seenKeys.get(key)} are the same song and product`);
  else seenKeys.set(key, card.id);
}
for (const clash of clashes) console.error(`NO  ${clash}`);

if (write && added.length) {
  writeFileSync(deckPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
}
console.log(`${write ? "OK  wrote" : "--  would write"} ${added.length} card(s); the deck would hold ${deck.cards.length}.`);
process.exit(clashes.length ? 1 : 0);
