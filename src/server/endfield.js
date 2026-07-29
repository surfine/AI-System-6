// Endfield (终末地) story-archive subsystem.
//
// Provides keyword search and RAG-style Q&A over a local corpus of
// Warfarin mission transcripts, operator profiles, tutorials, lore
// entries, and central documents. Used by GET|POST /api/endfield/search
// and POST /api/endfield/ask.
//
// Behavior parity with the corresponding block in root server.js.
// Five JSON data files are loaded lazily on first request and cached
// per process; missing files (anything but missions.json) degrade
// gracefully to empty caches.

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { repoRoot } = require("./lib/build-info.js");
const { postJsonWithFallback } = require("./lib/fetch.js");
const { getLocalUrls } = require("./lib/local-urls.js");
const { positiveInteger } = require("./lib/numbers.js");
const {
  DEEPSEEK_CLOUD_MODELS,
  DEEPSEEK_BASE_URL_DEFAULT,
  resolveCloudBaseUrl,
} = require("./cloud.js");
const {
  enforceMarkdownOnlyChatPayload,
  tuneLmStudioChatPayload,
} = require("./chat.js");
const {
  knownModelMaxContext,
} = require("./lib/lmstudio-models.js");
const {
  getLoadedLmStudioModelInfo,
  postLocalChatWithModelAutoload,
} = require("./lmstudio.js");
const { resolveCloudCredential } = require("./credential-vault.js");

// =============================================================================
// Data loaders (lazy, cached per-process)
// =============================================================================

/** @type {any} */
let endfieldStoryCache = null;
/** @type {any} */
let endfieldOperatorCache = null;
/** @type {any} */
let endfieldTutorialCache = null;
/** @type {any} */
let endfieldLoreCache = null;
/** @type {any} */
let endfieldDocumentCache = null;

/**
 * Load the Warfarin mission transcript corpus. Throws if
 * missions.json is missing — every other dataset has a graceful
 * fallback, but the mission file is the primary corpus.
 *
 * @returns {Promise<any>}
 */
async function loadEndfieldStoryData() {
  if (endfieldStoryCache) return endfieldStoryCache;
  const filePath = path.join(repoRoot, "data", "warfarin-missions-lines", "missions.json");
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  const lines = [];
  for (const mission of data.missions || []) {
    for (const [lineIndex, line] of (mission.transcript || []).entries()) {
      lines.push({
        missionId: mission.id,
        missionTitle: mission.title,
        section: mission.section || "",
        chapter: mission.chapter || "",
        process: mission.process || "",
        missionUrl: mission.url,
        speaker: line.speaker || "Unknown",
        initial: line.initial || "",
        text: line.text || "",
        lineIndex,
      });
    }
  }
  endfieldStoryCache = {
    source: data.source,
    scrapedAt: data.scrapedAt,
    gameVersion: data.gameVersion,
    lastUpdated: data.lastUpdated,
    missions: data.missions || [],
    lines,
  };
  return endfieldStoryCache;
}

/**
 * @returns {Promise<any>}
 */
async function loadEndfieldOperatorData() {
  if (endfieldOperatorCache) return endfieldOperatorCache;
  const filePath = path.join(repoRoot, "data", "warfarin-operators", "operators.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const lines = [];
    for (const operator of data.operators || []) {
      const base = {
        missionId: `operator:${operator.id}`,
        missionTitle: operator.name,
        chapter: operator.overview?.englishName || "",
        missionUrl: operator.url,
      };
      let lineIndex = 0;
      /**
       * @param {string} section
       * @param {string} process
       * @param {string} speaker
       * @param {string} text
       */
      const pushLine = (section, process, speaker, text) => {
        if (!text) return;
        lines.push({
          ...base,
          section,
          process,
          speaker,
          initial: operator.name?.slice(0, 1) || "",
          text,
          lineIndex,
        });
        lineIndex += 1;
      };

      pushLine("干员总览", "简介", operator.name, operator.overview?.summary || operator.description || "");
      pushLine("干员总览", "特点", operator.name, operator.overview?.trait || "");
      for (const entry of operator.intel || []) {
        pushLine("干员情报", entry.title, entry.title, entry.text);
      }
      for (const entry of operator.files || []) {
        pushLine("干员档案", entry.title, entry.title, entry.text);
      }
      for (const entry of operator.voiceLines || []) {
        pushLine("干员语音", entry.label, operator.name, entry.text);
      }
    }
    endfieldOperatorCache = {
      source: data.source,
      scrapedAt: data.scrapedAt,
      operators: data.operators || [],
      lines,
    };
  } catch {
    endfieldOperatorCache = {
      source: "",
      scrapedAt: "",
      operators: [],
      lines: [],
    };
  }
  return endfieldOperatorCache;
}

/**
 * @returns {Promise<any>}
 */
async function loadEndfieldTutorialData() {
  if (endfieldTutorialCache) return endfieldTutorialCache;
  const filePath = path.join(repoRoot, "data", "warfarin-tutorials", "tutorials.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const lines = [];
    for (const tutorial of data.tutorials || []) {
      for (const [index, section] of (tutorial.sections || []).entries()) {
        if (!section.text) continue;
        lines.push({
          missionId: `tutorial:${tutorial.id}`,
          missionTitle: tutorial.title,
          section: "教学记录",
          chapter: tutorial.type || "教学",
          process: section.title || "概要",
          missionUrl: tutorial.url,
          speaker: section.title || tutorial.title,
          initial: "教",
          text: section.text,
          lineIndex: index,
        });
      }
    }
    endfieldTutorialCache = {
      source: data.source,
      scrapedAt: data.scrapedAt,
      tutorials: data.tutorials || [],
      lines,
    };
  } catch {
    endfieldTutorialCache = {
      source: "",
      scrapedAt: "",
      tutorials: [],
      lines: [],
    };
  }
  return endfieldTutorialCache;
}

/**
 * @returns {Promise<any>}
 */
async function loadEndfieldLoreData() {
  if (endfieldLoreCache) return endfieldLoreCache;
  const filePath = path.join(repoRoot, "data", "warfarin-lore", "lore.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const lines = [];
    for (const entry of data.lore || []) {
      for (const [index, section] of (entry.sections || []).entries()) {
        if (!section.text) continue;
        lines.push({
          missionId: `lore:${entry.id}`,
          missionTitle: entry.title,
          section: "见闻辑录",
          chapter: entry.type || "世界观",
          process: section.title || "正文",
          missionUrl: entry.url,
          speaker: entry.type || "见闻辑录",
          initial: "档",
          text: section.text,
          lineIndex: index,
        });
      }
    }
    endfieldLoreCache = {
      source: data.source,
      scrapedAt: data.scrapedAt,
      typeCounts: data.typeCounts || {},
      lore: data.lore || [],
      lines,
    };
  } catch {
    endfieldLoreCache = {
      source: "",
      scrapedAt: "",
      typeCounts: {},
      lore: [],
      lines: [],
    };
  }
  return endfieldLoreCache;
}

/**
 * @returns {Promise<any>}
 */
async function loadEndfieldDocumentData() {
  if (endfieldDocumentCache) return endfieldDocumentCache;
  const filePath = path.join(repoRoot, "data", "warfarin-documents", "documents.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const lines = [];
    for (const entry of data.documents || []) {
      for (const [index, section] of (entry.sections || []).entries()) {
        if (!section.text) continue;
        lines.push({
          missionId: `document:${entry.id}`,
          missionTitle: entry.title,
          section: "中枢档案",
          chapter: entry.type || "中枢档案",
          process: section.title || "正文",
          missionUrl: entry.url,
          speaker: entry.type || "中枢档案",
          initial: "档",
          text: section.text,
          lineIndex: index,
        });
      }
    }
    endfieldDocumentCache = {
      source: data.source,
      scrapedAt: data.scrapedAt,
      typeCounts: data.typeCounts || {},
      documents: data.documents || [],
      lines,
    };
  } catch {
    endfieldDocumentCache = {
      source: "",
      scrapedAt: "",
      typeCounts: {},
      documents: [],
      lines: [],
    };
  }
  return endfieldDocumentCache;
}

// =============================================================================
// Search helpers
// =============================================================================

/**
 * The CJK code-point regex is built from a string literal so the
 * \u escapes survive Write-tool round-trips. Same range as root.
 */
const CJK_CHAR_PATTERN = new RegExp("[\\u4e00-\\u9fff]");

/**
 * NUL-byte separator for dedup keys. Mirrors root server.js's
 * `String.fromCharCode(0)` literal. Built via String.fromCharCode so the source
 * form has no embedded NUL byte (which many editors silently strip
 * or warn on).
 */
const DEDUP_KEY_SEPARATOR = String.fromCharCode(0);

/**
 * @param {any[]} lines
 * @returns {any[]}
 */
function dedupeEndfieldLines(lines) {
  const seen = new Set();
  return lines.filter((line) => {
    const key = [
      line.section === "见闻辑录" || line.section === "中枢档案" ? line.chapter : line.section,
      line.missionTitle,
      line.process,
      line.text,
    ].join(DEDUP_KEY_SEPARATOR);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {any[]} items
 * @returns {any[]}
 */
function dedupeEndfieldMatches(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [
      item.section === "见闻辑录" || item.section === "中枢档案" ? item.chapter : item.section,
      item.title,
      item.summary,
    ].join(DEDUP_KEY_SEPARATOR);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {string} query
 * @returns {string[]}
 */
function endfieldSearchTokens(query) {
  const baseTokens = String(query || "")
    .toLowerCase()
    .replace(/[，。！？、；：“”‘’（）【】《》,.!?;:"'()[\]<>]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const grams = [];
  for (const token of baseTokens) {
    if (!CJK_CHAR_PATTERN.test(token) || token.length <= 2) continue;
    for (let size = 2; size <= Math.min(4, token.length); size += 1) {
      for (let i = 0; i <= token.length - size; i += 1) {
        grams.push(token.slice(i, i + size));
      }
    }
  }
  return [...new Set([...baseTokens, ...grams])];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeEndfieldSearchText(value) {
  return String(value || "").toLowerCase().trim();
}

/**
 * @param {any} operator
 * @returns {string[]}
 */
function endfieldOperatorSearchKeys(operator) {
  return [
    operator.id,
    operator.name,
    operator.overview?.name,
    operator.overview?.englishName,
    operator.url?.split("/").filter(Boolean).pop(),
  ].map(normalizeEndfieldSearchText).filter(Boolean);
}

/**
 * @param {string} query
 * @param {any[]} [operators]
 * @returns {Array<{ id: any, name: any, keys: string[] }>}
 */
function detectMentionedEndfieldOperators(query, operators = []) {
  const normalizedQuery = normalizeEndfieldSearchText(query);
  if (!normalizedQuery) return [];
  return (operators || [])
    .map((operator) => ({
      id: operator.id,
      name: operator.name,
      keys: endfieldOperatorSearchKeys(operator),
    }))
    .filter((operator) => operator.keys.some((key) => key && normalizedQuery.includes(key)));
}

/**
 * @param {any} item
 * @param {any[]} [mentionedOperators]
 * @returns {number}
 */
function endfieldOperatorEntityScore(item, mentionedOperators = []) {
  if (!mentionedOperators.length) return 0;
  const itemId = normalizeEndfieldSearchText(item.id || "");
  const itemTitle = normalizeEndfieldSearchText(item.title || "");
  const itemText = normalizeEndfieldSearchText(item.text || "");
  const isOperatorCard = ["干员资料", "干员总览", "干员情报", "干员档案", "干员语音"].includes(item.section);
  let score = 0;
  let matched = false;

  for (const operator of mentionedOperators) {
    const sameOperator = itemId === normalizeEndfieldSearchText(operator.id) || itemTitle === normalizeEndfieldSearchText(operator.name);
    const mentionsOperator = operator.keys.some((key) => key && itemText.includes(key));
    if (sameOperator) {
      score += 520;
      matched = true;
    } else if (mentionsOperator) {
      score += 140;
      matched = true;
    }
  }

  if (mentionedOperators.length === 1 && isOperatorCard && !matched) score -= 420;
  return score;
}

/**
 * @param {any} line
 * @param {string} query
 * @param {string[]} tokens
 * @param {any[]} [mentionedOperators]
 * @returns {number}
 */
function scoreEndfieldLine(line, query, tokens, mentionedOperators = []) {
  const haystacks = {
    text: line.text.toLowerCase(),
    speaker: line.speaker.toLowerCase(),
    title: line.missionTitle.toLowerCase(),
    chapter: line.chapter.toLowerCase(),
    section: line.section.toLowerCase(),
  };
  const normalizedQuery = query.toLowerCase().trim();
  let score = 0;

  if (normalizedQuery && haystacks.text.includes(normalizedQuery)) score += 80;
  if (normalizedQuery && haystacks.speaker.includes(normalizedQuery)) score += 55;
  if (normalizedQuery && haystacks.title.includes(normalizedQuery)) score += 35;
  if (normalizedQuery && haystacks.chapter.includes(normalizedQuery)) score += 20;

  for (const token of tokens) {
    if (haystacks.text.includes(token)) score += token.length > 1 ? 18 : 5;
    if (haystacks.speaker.includes(token)) score += 28;
    if (haystacks.title.includes(token)) score += 12;
    if (haystacks.chapter.includes(token) || haystacks.section.includes(token)) score += 8;
  }

  if (/主线|main/i.test(query) && line.section === "Main Missions") score += 16;
  if (/干员|operator/i.test(query) && (line.section === "Operator Missions" || line.section === "干员资料")) score += 16;
  if (/档案|file/i.test(query) && line.section === "干员档案") score += 70;
  if (/语音|voice|台词/i.test(query) && line.section === "干员语音") score += 70;
  if (/情报|intel/i.test(query) && line.section === "干员情报") score += 70;
  if (/教学|教程|记录|tutorial/i.test(query) && line.section === "教学记录") score += 70;
  if (/中枢|档案|见闻|世界观|lore|document/i.test(query) && line.section === "见闻辑录") score += 70;
  if (/中枢|档案|世界观|document/i.test(query) && line.section === "中枢档案") score += 90;
  if (/中枢|document/i.test(query) && line.chapter === "中枢档案") score += 40;
  score += endfieldOperatorEntityScore({
    id: line.missionId?.replace(/^operator:/, ""),
    title: line.missionTitle,
    text: [line.speaker, line.text, line.chapter, line.process].join(" "),
    section: line.section,
  }, mentionedOperators);
  return score;
}

/**
 * @param {any} item
 * @param {string} query
 * @param {string[]} tokens
 * @param {any[]} [mentionedOperators]
 * @returns {number}
 */
function scoreEndfieldMatch(item, query, tokens, mentionedOperators = []) {
  const haystack = [item.title, item.summary, item.section, item.chapter, item.process]
    .join(" ")
    .toLowerCase();
  let score = haystack.includes(query.toLowerCase()) ? 60 : 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) continue;
    score += token.length > 1 ? 12 : 3;
    if (String(item.title || "").toLowerCase().includes(token)) score += 18;
    if (String(item.chapter || "").toLowerCase().includes(token)) score += 10;
  }
  if (/中枢|档案|见闻|世界观|lore|document/i.test(query) && item.section === "见闻辑录") score += 60;
  if (/中枢|档案|世界观|document/i.test(query) && item.section === "中枢档案") score += 90;
  if (/中枢|document/i.test(query) && item.chapter === "中枢档案") score += 35;
  score += endfieldOperatorEntityScore({
    id: String(item.id || "").replace(/^operator:/, ""),
    title: item.title,
    text: [item.summary, item.chapter, item.process].join(" "),
    section: item.section,
  }, mentionedOperators);
  return score;
}

/**
 * @param {any[]} lines
 * @param {any} line
 * @param {number} [radius]
 * @returns {Array<{ speaker: string, text: string, lineIndex: number }>}
 */
function nearbyEndfieldLines(lines, line, radius = 1) {
  return lines
    .filter((candidate) =>
      candidate.missionId === line.missionId &&
      Math.abs(candidate.lineIndex - line.lineIndex) <= radius &&
      candidate.lineIndex !== line.lineIndex
    )
    .sort((a, b) => a.lineIndex - b.lineIndex)
    .map((candidate) => ({
      speaker: candidate.speaker,
      text: candidate.text,
      lineIndex: candidate.lineIndex,
    }));
}

/**
 * Top-level search: rank both line-level matches and mission/operator/
 * tutorial/lore/document-card matches; return both. Mirrors
 * `findEndfieldStoryMatches` from root server.js.
 *
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<{ meta: any, results: any[], missionMatches: any[] }>}
 */
async function findEndfieldStoryMatches(query, limit = 12) {
  const data = await loadEndfieldStoryData();
  const operatorData = await loadEndfieldOperatorData();
  const tutorialData = await loadEndfieldTutorialData();
  const loreData = await loadEndfieldLoreData();
  const documentData = await loadEndfieldDocumentData();
  const archiveLines = dedupeEndfieldLines([
    ...data.lines,
    ...operatorData.lines,
    ...tutorialData.lines,
    ...documentData.lines,
    ...loreData.lines,
  ]);
  const tokens = endfieldSearchTokens(query);
  const mentionedOperators = detectMentionedEndfieldOperators(query, operatorData.operators);
  const scored = archiveLines
    .map((line) => ({ line, score: scoreEndfieldLine(line, query, tokens, mentionedOperators) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.line.missionId.localeCompare(b.line.missionId) || a.line.lineIndex - b.line.lineIndex)
    .slice(0, limit)
    .map(({ line, score }) => ({
      score,
      missionId: line.missionId,
      missionTitle: line.missionTitle,
      section: line.section,
      chapter: line.chapter,
      process: line.process,
      missionUrl: line.missionUrl,
      speaker: line.speaker,
      initial: line.initial,
      text: line.text,
      lineIndex: line.lineIndex,
      context: nearbyEndfieldLines(archiveLines, line),
    }));

  const missionMatches = dedupeEndfieldMatches([
    ...data.missions.map((mission) => ({
      id: mission.id,
      title: mission.title,
      summary: mission.description || mission.summary || "",
      section: mission.section,
      chapter: mission.chapter,
      process: mission.process,
      url: mission.url,
    })),
    ...operatorData.operators.map((operator) => ({
      id: `operator:${operator.id}`,
      title: operator.name,
      summary: operator.overview?.summary || operator.description || "",
      section: "干员资料",
      chapter: operator.overview?.englishName || "",
      process: [operator.overview?.element, operator.overview?.class].filter(Boolean).join(" / "),
      url: operator.url,
    })),
    ...tutorialData.tutorials.map((tutorial) => ({
      id: `tutorial:${tutorial.id}`,
      title: tutorial.title,
      summary: tutorial.text || "",
      section: "教学记录",
      chapter: tutorial.type || "教学",
      process: `${tutorial.sections?.length || 0} sections`,
      url: tutorial.url,
    })),
    ...documentData.documents.map((entry) => ({
      id: `document:${entry.id}`,
      title: entry.title,
      summary: entry.text || "",
      section: "中枢档案",
      chapter: entry.type || "中枢档案",
      process: `${entry.sections?.length || 0} sections`,
      url: entry.url,
    })),
    ...loreData.lore.map((entry) => ({
      id: `lore:${entry.id}`,
      title: entry.title,
      summary: entry.text || "",
      section: "见闻辑录",
      chapter: entry.type || "世界观",
      process: `${entry.sections?.length || 0} sections`,
      url: entry.url,
    })),
  ])
    .map((item) => ({ ...item, score: scoreEndfieldMatch(item, query, tokens, mentionedOperators) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
    .slice(0, 8)
    .map(({ score, ...item }) => item);

  return {
    meta: {
      source: data.source,
      scrapedAt: data.scrapedAt,
      gameVersion: data.gameVersion,
      lastUpdated: data.lastUpdated,
      missionCount: data.missions.length,
      transcriptLineCount: archiveLines.length,
      operatorCount: operatorData.operators.length,
      operatorLineCount: operatorData.lines.length,
      tutorialCount: tutorialData.tutorials.length,
      tutorialLineCount: tutorialData.lines.length,
      loreCount: loreData.lore.length,
      loreLineCount: loreData.lines.length,
      loreTypeCounts: loreData.typeCounts,
      documentCount: documentData.documents.length,
      documentLineCount: documentData.lines.length,
      documentTypeCounts: documentData.typeCounts,
    },
    results: scored,
    missionMatches,
  };
}

/**
 * Build the metadata payload for the empty-query branch of
 * /api/endfield/search. Mirrors the inline block in root.
 *
 * @returns {Promise<any>}
 */
async function buildEndfieldEmptyMeta() {
  const data = await loadEndfieldStoryData();
  const operatorData = await loadEndfieldOperatorData();
  const tutorialData = await loadEndfieldTutorialData();
  const loreData = await loadEndfieldLoreData();
  const documentData = await loadEndfieldDocumentData();
  return {
    source: data.source,
    scrapedAt: data.scrapedAt,
    gameVersion: data.gameVersion,
    lastUpdated: data.lastUpdated,
    missionCount: data.missions.length,
    transcriptLineCount: dedupeEndfieldLines([
      ...data.lines,
      ...operatorData.lines,
      ...tutorialData.lines,
      ...documentData.lines,
      ...loreData.lines,
    ]).length,
    operatorCount: operatorData.operators.length,
    operatorLineCount: operatorData.lines.length,
    tutorialCount: tutorialData.tutorials.length,
    tutorialLineCount: tutorialData.lines.length,
    loreCount: loreData.lore.length,
    loreLineCount: loreData.lines.length,
    loreTypeCounts: loreData.typeCounts,
    documentCount: documentData.documents.length,
    documentLineCount: documentData.lines.length,
    documentTypeCounts: documentData.typeCounts,
  };
}

// =============================================================================
// Evidence helpers for the RAG ask path
// =============================================================================

/**
 * @param {any[]} results
 * @returns {string}
 */
function endfieldEvidenceBlock(results) {
  return results.map((result, index) => {
    const route = [result.section, result.chapter, result.process, result.missionTitle].filter(Boolean).join(" / ");
    const before = result.context?.filter((item) => item.lineIndex < result.lineIndex).map((item) => `${item.speaker}: ${item.text}`).join("\n");
    const after = result.context?.filter((item) => item.lineIndex > result.lineIndex).map((item) => `${item.speaker}: ${item.text}`).join("\n");
    return [
      `【${index + 1}】${route}`,
      `任务ID: ${result.missionId}`,
      before ? `前文:\n${before}` : "",
      `命中台词:\n${result.speaker}: ${result.text}`,
      after ? `后文:\n${after}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");
}

/**
 * @param {any} [body]
 * @param {string} [model]
 * @returns {number}
 */
function endfieldContextLength(body = {}, model = "") {
  if (body._cloud_active) {
    const cloudModel = Array.isArray(DEEPSEEK_CLOUD_MODELS)
      ? DEEPSEEK_CLOUD_MODELS.find((item) => item.id === body._cloud_model || item.id === body.model)
      : null;
    return positiveInteger(cloudModel?.context_length || body.context_length || knownModelMaxContext(model) || 8192);
  }
  return positiveInteger(
    body.context_length ||
    getLoadedLmStudioModelInfo()?.context_length ||
    knownModelMaxContext(model) ||
    8192
  );
}

/**
 * @param {any} [body]
 * @param {string} [model]
 * @param {number} [outputTokens]
 * @returns {{ contextLength: number, evidenceChars: number, resultLimit: number }}
 */
function endfieldEvidenceBudget(body = {}, model = "", outputTokens = 1200) {
  const contextLength = endfieldContextLength(body, model);
  const promptReserve = 1600;
  const availablePromptTokens = Math.max(2400, contextLength - outputTokens - promptReserve);
  const evidenceChars = Math.max(3200, Math.min(18000, Math.floor(availablePromptTokens * 0.85)));
  const resultLimit = contextLength >= 65536 ? 18 : contextLength >= 32768 ? 14 : contextLength >= 16384 ? 10 : 8;
  return { contextLength, evidenceChars, resultLimit };
}

/**
 * Route the assembled RAG payload to either the cloud model (if the
 * request opted into it) or the local LM Studio chat path with
 * autoload-on-failure.
 *
 * Cloud and local branches both apply enforceMarkdownOnlyChatPayload
 * to the assembled payload; the local branch additionally applies
 * tuneLmStudioChatPayload (Qwen 3.5 tuning).
 *
 * The DeepSeek v4 sampling-strip block is the same as in cloud-chat
 * and bureaucracy. Not DRY-d here; that's a separate refactor.
 *
 * @param {any} payload
 * @param {any} body
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{
 *   response: any, source: string, model: string,
 *   autoLoaded?: boolean, autoLoadedModel?: string, autoSelectedModel?: string,
 * }>}
 */
async function postEndfieldChatPayload(payload, body, signal) {
  const cloudApiKey = body._cloud_active
    ? await resolveCloudCredential({
        credentialId: body._cloud_credential_id,
        provider: "deepseek",
        suppliedApiKey: body._cloud_api_key,
        allowSupplied: false,
      })
    : "";
  if (body._cloud_active && cloudApiKey) {
    const model = String(body._cloud_model || payload.model || "deepseek-v4-flash").trim();
    const baseUrl = resolveCloudBaseUrl(body._cloud_base_url || DEEPSEEK_BASE_URL_DEFAULT);
    const cloudPayload = enforceMarkdownOnlyChatPayload({ ...payload, model });
    if (/^(?:deepseek-)?v4-(?:pro|flash)$/i.test(model)
        && (!cloudPayload.thinking || cloudPayload.thinking.type !== "disabled")) {
      delete cloudPayload.temperature;
      delete cloudPayload.top_p;
      delete cloudPayload.presence_penalty;
      delete cloudPayload.frequency_penalty;
      delete cloudPayload.logprobs;
      delete cloudPayload.top_logprobs;
    }
    const { response } = await postJsonWithFallback(`${baseUrl}/v1/chat/completions`, cloudPayload, signal, {
      Authorization: `Bearer ${cloudApiKey}`,
    });
    return { response, source: "cloud", model };
  }

  const provider = body._local_provider || "lm-studio";
  const endpoint = body._local_endpoint || "";
  const model = String(body.model || getLoadedLmStudioModelInfo()?.model || "local-model").trim();
  const localPayload = tuneLmStudioChatPayload(enforceMarkdownOnlyChatPayload({ ...payload, model }));
  const { chatUrl } = getLocalUrls(provider, endpoint);
  const { response, autoLoaded, autoLoadedModel, autoSelectedModel } = await postLocalChatWithModelAutoload({
    chatUrl,
    payload: localPayload,
    provider,
    model,
    signal,
  });
  return { response, source: provider || "local", model, autoLoaded, autoLoadedModel, autoSelectedModel };
}

module.exports = {
  loadEndfieldStoryData,
  loadEndfieldOperatorData,
  loadEndfieldTutorialData,
  loadEndfieldLoreData,
  loadEndfieldDocumentData,
  dedupeEndfieldLines,
  findEndfieldStoryMatches,
  buildEndfieldEmptyMeta,
  endfieldEvidenceBlock,
  endfieldEvidenceBudget,
  postEndfieldChatPayload,
};
