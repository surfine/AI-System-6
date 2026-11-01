#!/usr/bin/env node
// Merge research as metadata, never as playback approval. Keep the full package
// in the private preparation area and retain the runtime IDs and progress keys.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { joinOneMoreTuneCards, foldOneMoreTuneText as fold } from "./lib/one-more-tune-join.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv.indexOf("--package");
if (arg < 0 || !process.argv[arg + 1]) throw new Error("--package <assessment directory> required");
const source = resolve(process.argv[arg + 1]);
const write = process.argv.includes("--write");
const deckPath = join(root, "apps/desktop/data/one-more-tune-deck.json");
const original = readFileSync(deckPath, "utf8");
const deck = JSON.parse(original);
const read = (name) => JSON.parse(readFileSync(join(source, "data", `${name}.json`), "utf8"));
const questions = read("questions").questions;
const catalog = read("catalog_full").rows;
const candidates = read("campaign_candidates");
const observations = read("usage_observations");
const links = read("link_updates");
if (!Number.isInteger(deck.version) || new Set(deck.cards.map((c) => c.id)).size !== deck.cards.length) throw new Error("Invalid runtime deck");
if (catalog.length < 2870 || questions.length < 74 || observations.length < 3288) throw new Error("Incomplete assessment package");
const { byCard, unjoined } = joinOneMoreTuneCards(deck.cards, questions);
const work = (song, artist) => `${fold(song)}|${fold(artist)}`;
const evidencePath = join(root, "apps/desktop/data/one-more-tune-evidence.json");
const evidenceOriginal = readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(evidenceOriginal);
const sources = JSON.parse(readFileSync(join(source, "history/sources.json"), "utf8"));
const unresolvedSources = new Set();
let evidenceChanges = 0;
const changed = [];
for (const card of deck.cards) {
  const question = byCard.get(card.id);
  if (!question) continue;
  const citations = [];
  for (const item of question.evidence || []) {
    const entry = sources[item.source_id] || evidence.sources[item.source_id];
    const url = typeof entry === "string" ? entry : entry?.url;
    if (!url) { unresolvedSources.add(item.source_id); continue; }
    evidence.sources[item.source_id] = { url };
    const old = evidence.cards[card.id]?.evidence?.find((e) => e.source === item.source_id);
    citations.push(old || { source: item.source_id, supports: { en: "Source reference; recording and playback remain unverified.", zh: "来源参考；录音身份和播放仍待核验。" } });
  }
  const panel = { blocked: (question.gate_reasons || []).filter((code) => evidence.reasons[code]), evidence: citations, from: question.id };
  if (JSON.stringify(evidence.cards[card.id]) !== JSON.stringify(panel)) {
    evidence.cards[card.id] = panel;
    evidenceChanges++;
  }
  const metadata = {
    namespace: "omt-research-v08", researchId: question.id,
    joinBasis: "unicode_song_artist_complete_film", doesNotGrantReadiness: true,
    catalogCandidateIds: question.v08?.catalog_candidate_ids || [],
    mediaCandidates: question.v08?.new_catalog_media_candidates || [],
    editorialDifficulty: question.v08?.editorial_difficulty || null,
    empiricalP: null, itemRestCorrelation: null,
  };
  if (JSON.stringify(card.researchV08) !== JSON.stringify(metadata)) {
    card.researchV08 = metadata;
    changed.push(card.id);
  }
}
// Connected sibling records and the same named work must not compete as wrong
// answers, even if their CDN URLs or recordings differ. This is a conservative
// exclusion, not a claim that all these recordings have been verified.
const parent = new Map(deck.cards.map((c) => [c.id, c.id]));
const find = (id) => parent.get(id) === id ? id : find(parent.get(id));
const union = (a, b) => { if (parent.has(b)) parent.set(find(a), find(b)); };
const seenWork = new Map();
for (const card of deck.cards) {
  if (card.siblingOf) union(card.id, card.siblingOf);
  if (!card.song || !card.artist) continue;
  const key = work(card.song, card.artist);
  if (seenWork.has(key)) union(card.id, seenWork.get(key));
  seenWork.set(key, card.id);
}
const groups = new Map();
for (const card of deck.cards) {
  const key = find(card.id);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(card);
}
let exclusionChanges = 0;
for (const group of groups.values()) {
  const groupId = group.map((c) => c.id).sort()[0];
  const keys = new Set(group.map((c) => work(c.song, c.artist)));
  const labels = new Set(group.map((c) => c.product).filter(Boolean));
  // Source product mentions are only used to veto distractors, never to create
  // a new approved answer or enable an unreviewed candidate.
  for (const row of catalog) {
    if (!keys.has(work(row.song_title, row.artist))) continue;
    for (const use of row.uses || []) {
      for (const mention of use.product_mentions || []) {
        const label = typeof mention === "string" ? mention : mention.verbatim;
        if (!label) continue;
        labels.add(label);
        for (const other of deck.cards) {
          if (other.product === label || other.product?.startsWith(`${label} (`)) labels.add(other.product);
        }
      }
    }
  }
  for (const card of group) {
    const excludedAnswerLabels = [...labels].sort();
    if (card.knowledgeGroup !== groupId || JSON.stringify(card.excludedAnswerLabels) !== JSON.stringify(excludedAnswerLabels)) exclusionChanges++;
    card.knowledgeGroup = groupId;
    card.excludedAnswerLabels = excludedAnswerLabels;
  }
}
const hasChanges = changed.length || exclusionChanges;
if (hasChanges) deck.version++;
const report = { oldVersion: JSON.parse(original).version, newVersion: deck.version,
  cards: deck.cards.length, pinnedSounds: deck.cards.filter((c) => c.questionSound).length,
  matched: byCard.size, changed, unmatched: unjoined, exclusionChanges, evidenceChanges, unresolvedSources: [...unresolvedSources].sort(),
  catalogRows: catalog.length, usageObservations: observations.length,
  campaignCandidates: candidates.length, linkObservations: links.length,
  newPlayableCards: 0, readinessPromotions: 0 };
if (write) {
  const archive = join(root, ".jspace/omt-v08");
  mkdirSync(archive, { recursive: true });
  const hash = createHash("sha256").update(original).digest("hex");
  copyFileSync(deckPath, join(archive, `deck-before-${hash}.json`));
  cpSync(source, join(archive, "assessment-package"), { recursive: true });
  writeFileSync(join(archive, "update-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (evidenceChanges) {
    copyFileSync(evidencePath, join(archive, "evidence-before-update.json"));
    writeFileSync(`${evidencePath}.staged`, `${JSON.stringify(evidence, null, 1)}\n`);
    renameSync(`${evidencePath}.staged`, evidencePath);
  }
  if (hasChanges) {
    const staged = `${deckPath}.staged`;
    writeFileSync(staged, `${JSON.stringify(deck, null, 2)}\n`);
    renameSync(staged, deckPath);
  }
}
console.log(JSON.stringify(report, null, 2));
