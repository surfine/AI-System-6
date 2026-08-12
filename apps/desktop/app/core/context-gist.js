// Core runtime module: context-gist.
//
// Application-level HD-Gist: compress retrieved context into coarse cards,
// reveal detail only for matching sources, and fall back to raw excerpts when
// the compressed packet fails a small reconstruction guard.

const contextGistMaxCoarseChars = 280;
const contextGistMaxDetailChars = 760;
const contextGistMaxRawChars = 1400;
const contextGistMaxAnchors = 10;

function contextGistNormalizeText(text = "") {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contextGistPlainText(text = "") {
  return contextGistNormalizeText(text)
    .replace(/[#>*_`~()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contextGistClip(text = "", limit = contextGistMaxCoarseChars) {
  const clean = contextGistNormalizeText(text);
  if (clean.length <= limit) return clean;
  const slice = clean.slice(0, Math.max(0, limit - 3));
  const cut = Math.max(
    slice.lastIndexOf("\n\n"),
    slice.lastIndexOf("\n"),
    slice.lastIndexOf("。"),
    slice.lastIndexOf("！"),
    slice.lastIndexOf("？"),
    slice.lastIndexOf(". "),
    slice.lastIndexOf("; ")
  );
  return `${slice.slice(0, cut > limit * 0.5 ? cut + 1 : slice.length).trimEnd()}...`;
}

function contextGistWords(text = "") {
  const normalized = String(text || "").normalize("NFKC").toLowerCase();
  const words = [];
  const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
  let match;
  while ((match = cjkPattern.exec(normalized))) {
    const runes = Array.from(match[0]);
    if (runes.length >= 2) words.push(runes.slice(0, 10).join(""));
    if (runes.length > 4) {
      for (let index = 0; index <= runes.length - 2 && words.length < 40; index += 1) {
        words.push(runes.slice(index, index + 2).join(""));
      }
    }
  }
  const nonCjkText = normalized.replace(cjkPattern, " ");
  for (const word of nonCjkText.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) || []) {
    if (word.length > 2) words.push(word);
  }
  return words;
}

function contextGistTopAnchors(text = "", title = "") {
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "about", "there",
    "these", "those", "have", "has", "was", "were", "are", "you", "your", "user",
    "context", "source", "document", "section",
  ]);
  const counts = new Map();
  [...contextGistWords(title), ...contextGistWords(text)].forEach((word) => {
    if (stop.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + (String(title || "").toLowerCase().includes(word) ? 2 : 1));
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word)
    .slice(0, contextGistMaxAnchors);
}

function contextGistParagraphs(text = "") {
  const clean = contextGistNormalizeText(text);
  const paragraphs = clean.split(/\n{2,}/).map((item) => item.trim()).filter((item) => item.length > 40);
  if (paragraphs.length) return paragraphs;
  return (clean.match(/[^。！？.!?]+[。！？.!?]?/g) || [])
    .map((item) => item.trim())
    .filter((item) => item.length > 40);
}

function contextGistSourceTitle(item) {
  return String(
    item?.title ||
    item?.name ||
    item?.referenceName ||
    item?.source ||
    item?.fileName ||
    "Context"
  ).trim();
}

function contextGistBaseCitation(citationId = "") {
  const match = String(citationId || "").match(/\[(S\d+)/);
  return match ? match[1] : String(citationId || "").replace(/[[\]]/g, "");
}

function contextGistSourceKey(item, citationId = "", index = 0) {
  if (typeof getContextSourceKey === "function") {
    const key = getContextSourceKey(item);
    if (key) return key;
  }
  return `${contextGistBaseCitation(citationId) || "gist"}:${index}`;
}

function contextGistMakeChild(card, paragraph, index) {
  const detail = contextGistClip(paragraph, contextGistMaxDetailChars);
  return {
    id: `${card.id}:child:${index + 1}`,
    sourceId: card.sourceId,
    level: "detail",
    title: `${card.title} detail ${index + 1}`,
    coarse: contextGistClip(paragraph, 180),
    detail,
    anchors: contextGistTopAnchors(paragraph, card.title),
    citationId: card.citationId,
    children: [],
    tokenEstimate: typeof estimateTokens === "function" ? estimateTokens(detail) : Math.ceil(detail.length / 4),
  };
}

function contextGistMakeCard(entry, index = 0) {
  const item = entry.item || entry;
  const raw = contextGistNormalizeText(entry.rawText || entry.text || item.content || item.body || item.selectedText || "");
  const title = contextGistSourceTitle(item);
  const sourceLabel = typeof contextSourceLabel === "function" ? contextSourceLabel(item) : title;
  const citationId = entry.citationId || item.citationId || `[G${index + 1}]`;
  const sourceId = contextGistSourceKey(item, citationId, index);
  const paragraphs = contextGistParagraphs(raw);
  const coarseSeed = [
    sourceLabel,
    paragraphs[0] || raw,
  ].filter(Boolean).join("\n");
  const detailSeed = paragraphs.slice(0, 3).join("\n\n") || raw;
  const card = {
    id: `${sourceId}:${index + 1}`,
    sourceId,
    level: "source",
    title,
    coarse: contextGistClip(coarseSeed, contextGistMaxCoarseChars),
    detail: contextGistClip(detailSeed, contextGistMaxDetailChars),
    anchors: contextGistTopAnchors(raw, `${title} ${sourceLabel}`),
    citationId,
    children: [],
    tokenEstimate: typeof estimateTokens === "function" ? estimateTokens(coarseSeed) : Math.ceil(coarseSeed.length / 4),
    rawText: raw,
    item,
    sourceType: entry.type || item.type || "",
    score: Number(item.score || entry.score || 0),
  };
  card.children = paragraphs.slice(0, 4).map((paragraph, childIndex) =>
    contextGistMakeChild(card, paragraph, childIndex)
  );
  return card;
}

function contextGistScore(card, queryWords) {
  const haystack = contextGistPlainText([
    card.title,
    card.coarse,
    card.detail,
    card.anchors.join(" "),
  ].join("\n"));
  let score = Math.max(0, Number(card.score || 0));
  queryWords.forEach((word) => {
    if (haystack.toLowerCase().includes(word)) score += word.length >= 4 ? 2 : 1;
  });
  return score;
}

function contextGistIsHighRisk(userText = "", taskKind = "") {
  return /(fact|claim|review|hkrr|critique|citation|quote|source|evidence|number|date|compare|verify|audit|检查|核查|事实|引用|证据|数字|日期|原文|对比|比较|审校|审查)/i
    .test(`${userText}\n${taskKind}`);
}

function contextGistProtectedAtoms(cards, userText = "", options = {}) {
  const atoms = new Set();
  const queryWords = new Set(contextGistWords(userText).filter((word) => word.length >= 4 || /[\u3400-\u9fff]/.test(word)));
  const highRisk = contextGistIsHighRisk(userText, options.taskKind || "");
  cards.forEach((card) => {
    const raw = card.rawText || "";
    (raw.match(/\b\d{1,4}(?:[.,:/-]\d{1,4})*\b/g) || []).slice(0, highRisk ? 24 : 8).forEach((atom) => atoms.add(atom));
    (raw.match(/\[[A-Z]?\d+(?::\d+)?\]/g) || []).forEach((atom) => atoms.add(atom));
    (raw.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g) || []).slice(0, 16).forEach((atom) => atoms.add(atom));
    queryWords.forEach((word) => {
      if (contextGistPlainText(raw).toLowerCase().includes(word)) atoms.add(word);
    });
  });
  return [...atoms].filter((atom) => String(atom).length > 1).slice(0, highRisk ? 48 : 20);
}

function contextGistMissingAtoms(packetText, atoms) {
  const haystack = contextGistPlainText(packetText).toLowerCase();
  return atoms.filter((atom) => !haystack.includes(String(atom).toLowerCase()));
}

function contextGistRoleForCard(card, revealed, rawCards) {
  if (rawCards.has(card.id)) return "raw";
  if (revealed.has(card.id)) return "revealed";
  return "coarse";
}

function contextGistFormatCard(card) {
  const anchors = card.anchors.length ? `\nAnchors: ${card.anchors.join(", ")}` : "";
  return `${card.citationId} ${card.title}\nGist: ${card.coarse}${anchors}`;
}

function contextGistFormatDetail(card) {
  const children = card.children
    .slice(0, 2)
    .map((child) => `- ${child.citationId} ${child.coarse}`)
    .join("\n");
  return [
    `${card.citationId} ${card.title}`,
    `Detail gist: ${card.detail}`,
    children ? `Focused details:\n${children}` : "",
  ].filter(Boolean).join("\n");
}

function contextGistFormatRaw(card) {
  return `${card.citationId} ${card.title}\nRaw excerpt for reconstruction guard:\n${contextGistClip(card.rawText, contextGistMaxRawChars)}`;
}

function buildContextGistPacket(userText, entries = [], options = {}) {
  const cards = entries
    .map((entry, index) => contextGistMakeCard(entry, index))
    .filter((card) => card.rawText);
  if (!cards.length) return null;

  const queryWords = new Set(contextGistWords(userText));
  const highRisk = contextGistIsHighRisk(userText, options.taskKind || "");
  const revealLimit = highRisk ? 5 : 3;
  const scored = cards
    .map((card) => ({ card, score: contextGistScore(card, queryWords) }))
    .sort((a, b) => b.score - a.score);
  const revealedCards = scored
    .filter((entry, index) => entry.score > 0 || index === 0)
    .slice(0, Math.min(revealLimit, cards.length))
    .map((entry) => entry.card);

  const coarseText = [
    "Hierarchical context gist. Read coarse cards first; use revealed details only when they match the user's request. Cite bracket IDs when useful.",
    ...cards.map(contextGistFormatCard),
  ].join("\n\n");
  const revealedText = revealedCards.length
    ? [
        "Dynamically revealed detail gist for matching sources:",
        ...revealedCards.map(contextGistFormatDetail),
      ].join("\n\n")
    : "";
  let packetText = [coarseText, revealedText].filter(Boolean).join("\n\n");
  const rawCards = new Set();

  if (highRisk) {
    const protectedAtoms = contextGistProtectedAtoms(cards, userText, options);
    let missing = contextGistMissingAtoms(packetText, protectedAtoms);
    if (missing.length) {
      scored.slice(0, Math.min(3, cards.length)).forEach(({ card }) => rawCards.add(card.id));
      const rawText = cards.filter((card) => rawCards.has(card.id)).map(contextGistFormatRaw).join("\n\n");
      packetText = [coarseText, revealedText, rawText ? `Necessary raw excerpts:\n\n${rawText}` : ""].filter(Boolean).join("\n\n");
      missing = contextGistMissingAtoms(packetText, protectedAtoms);
      if (missing.length) {
        return {
          text: options.rawContextText || packetText,
          cards,
          revealedCards,
          rawCards: cards,
          usedFallback: true,
          fallbackReason: `missing ${missing.slice(0, 5).join(", ")}`,
          rolesByCitation: Object.fromEntries(cards.map((card) => [card.citationId, "raw"])),
          stats: contextGistStats(cards, revealedCards, cards, options.rawContextText || packetText, true),
        };
      }
    }
  }

  const revealed = new Set(revealedCards.map((card) => card.id));
  const rawCardList = cards.filter((card) => rawCards.has(card.id));
  const rolesByCitation = Object.fromEntries(cards.map((card) => [
    card.citationId,
    contextGistRoleForCard(card, revealed, rawCards),
  ]));

  return {
    text: packetText,
    cards,
    revealedCards,
    rawCards: rawCardList,
    usedFallback: false,
    fallbackReason: "",
    rolesByCitation,
    stats: contextGistStats(cards, revealedCards, rawCardList, packetText, false),
  };
}

function contextGistStats(cards, revealedCards, rawCards, packetText, usedFallback) {
  const rawChars = cards.reduce((sum, card) => sum + (card.rawText || "").length, 0);
  const packetChars = String(packetText || "").length || 1;
  return {
    coarseCards: cards.length,
    revealedCards: revealedCards.length,
    rawExcerpts: rawCards.length,
    compressionRatio: Math.max(1, Math.round((rawChars / packetChars) * 10) / 10),
    budgetSource: usedFallback ? "hd-gist+raw-fallback" : "hd-gist",
    usedFallback,
  };
}
