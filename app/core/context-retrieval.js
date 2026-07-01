

const ragRankCache = new Map();
const ragRankCacheLimit = 24;
let hasShownDeepseekEmbeddingNotice = false;

function ragRankContextVersion(chunks = []) {
  return [
    activeProjectId,
    chunks.length,
    chunks.map((chunk) => `${chunk.id || chunk.source || chunk.referenceName || ""}:${chunk.chunkIndex || chunk.referenceChunkIndex || ""}:${chunk.updatedAt || ""}`).join("|"),
  ].join(";");
}

function rememberRagRankCache(key, scores) {
  ragRankCache.set(key, scores);
  if (ragRankCache.size > ragRankCacheLimit) {
    ragRankCache.delete(ragRankCache.keys().next().value);
  }
}


function preferredChunkEnd(text, start, hardEnd, minSize) {
  if (hardEnd >= text.length) return text.length;
  const slice = text.slice(start, hardEnd);
  const breakpoints = ["\n\n", "\n", "。", "！", "？", "；", "; ", ". "]
    .map((marker) => {
      const index = slice.lastIndexOf(marker);
      return index >= minSize ? index + marker.length : -1;
    })
    .filter((index) => index > 0);
  if (breakpoints.length) return start + Math.max(...breakpoints);
  return hardEnd;
}

function chunkText(text, source) {
  const normalized = normalizeMountedChunkText(text);
  const chunks = [];
  const chunkSize = 900;
  const overlap = 160;
  const minBreakSize = Math.floor(chunkSize * 0.55);
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + chunkSize, normalized.length);
    const end = preferredChunkEnd(normalized, start, hardEnd, minBreakSize);
    const content = normalized.slice(start, end).trim();
    if (content.length > 80) {
      chunks.push({
        source,
        content,
        chunkIndex: chunks.length + 1,
        start,
        end,
      });
    }
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

async function embedTexts(texts, signal) {
  const isCloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig.apiKey;
  const useCloudEmbeddings = isCloud && cloudConfig?.provider && cloudConfig.provider !== "deepseek";
  const modelForCloudEmbeddings = String(cloudConfig?.model || "").trim();
  const localModel = String(embeddingModelInput?.value?.trim() || "");
  const isDeepSeekEmbeddingUnsupported = isCloud && cloudConfig?.provider === "deepseek";

  let bodyObj, path;
  if (useCloudEmbeddings) {
    path = "/api/cloud/embeddings";
    bodyObj = {
      model: modelForCloudEmbeddings,
      input: texts,
      _cloud_api_key: cloudConfig.apiKey,
      _cloud_base_url: cloudConfig.baseUrl,
      _local_provider: document.getElementById("local-provider")?.value || "lm-studio",
      _local_endpoint: endpointInput?.value?.trim() || "",
      _local_model: localModel,
    };
  } else {
    if (isDeepSeekEmbeddingUnsupported && !hasShownDeepseekEmbeddingNotice) {
      if (typeof setStatus === "function") {
        setStatus(t("deepseek_embedding_local_fallback"), { notify: false });
      }
      hasShownDeepseekEmbeddingNotice = true;
    }
    const model = localModel;
    if (!model) throw new Error(t("embedding_model_missing"));
    path = "/api/embeddings";
    bodyObj = {
      model,
      input: texts,
      _local_provider: document.getElementById("local-provider")?.value || "lm-studio",
      _local_endpoint: endpointInput?.value?.trim() || "",
    };
  }

  const response = await fetch(path, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.data.map((item) => item.embedding);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let aSize = 0;
  let bSize = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aSize += a[index] * a[index];
    bSize += b[index] * b[index];
  }

  return dot / (Math.sqrt(aSize) * Math.sqrt(bSize));
}

function normalizeSearchText(value) {
  return String(value || "").normalize("NFKC").toLowerCase();
}

function getQueryWords(userText) {
  const text = normalizeSearchText(userText);
  const terms = new Set();
  const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
  let match;

  while ((match = cjkPattern.exec(text))) {
    const runes = Array.from(match[0]);
    if (runes.length <= 4) {
      terms.add(runes.join(""));
      continue;
    }
    terms.add(runes.join(""));
    for (const size of [2, 3]) {
      for (let index = 0; index <= runes.length - size; index += 1) {
        terms.add(runes.slice(index, index + size).join(""));
      }
    }
  }

  const nonCjkText = text.replace(cjkPattern, " ");
  for (const word of nonCjkText.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) || []) {
    if (word.length > 1) terms.add(word);
  }

  return terms;
}

function keywordScore(text, queryWords) {
  const lower = normalizeSearchText(text);
  let score = 0;

  queryWords.forEach((word) => {
    if (lower.includes(word)) score += word.length >= 4 ? 2 : 1;
  });

  return score;
}

function chunkSourceName(chunk) {
  return String(chunk?.referenceName || chunk?.source || "").trim();
}

function chunkRagSearchText(chunk) {
  return [
    chunkSourceName(chunk) ? `Source: ${chunkSourceName(chunk)}` : "",
    chunk?.fromProjectReference ? "Kind: Project Reference" : "Kind: File Floppy",
    Number.isFinite(Number(chunk?.chunkIndex || chunk?.referenceChunkIndex))
      ? `Chunk: ${chunk.referenceChunkIndex || chunk.chunkIndex}`
      : "",
    chunk?.content || "",
  ].filter(Boolean).join("\n");
}

function chunkRagEmbeddingText(chunk) {
  const source = chunkSourceName(chunk);
  return [
    source ? `Source file: ${source}` : "",
    chunk?.fromProjectReference ? "Source type: Project Reference" : "Source type: File Floppy",
    chunk?.content || "",
  ].filter(Boolean).join("\n");
}

function isComparativeRagQuery(userText) {
  return /(比较|对比|差异|区别|不同|相同|哪个|哪份|compare|versus|\bvs\.?\b|difference|different|similar)/i.test(String(userText || ""));
}

function selectDiverseRankedChunks(candidates, limit, userText) {
  if (candidates.length <= limit) return candidates.slice(0, limit);
  const sourceCount = new Set(candidates.map((chunk) => chunkSourceName(chunk) || chunk.source || "unknown")).size;
  if (sourceCount <= 1) return candidates.slice(0, limit);

  const maxPerSource = isComparativeRagQuery(userText)
    ? Math.max(1, Math.ceil(limit / 2))
    : Math.max(2, Math.ceil(limit * 0.75));
  const selected = [];
  const sourceCounts = new Map();
  const used = new Set();

  candidates.forEach((chunk, index) => {
    if (selected.length >= limit) return;
    const key = chunkSourceName(chunk) || chunk.source || "unknown";
    const count = sourceCounts.get(key) || 0;
    if (count >= maxPerSource) return;
    selected.push(chunk);
    used.add(index);
    sourceCounts.set(key, count + 1);
  });

  candidates.forEach((chunk, index) => {
    if (selected.length >= limit || used.has(index)) return;
    selected.push(chunk);
  });

  return selected;
}

function normalizeContextExcerpt(content) {
  return String(content || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function excerptCutPoint(text, limit) {
  if (text.length <= limit) return text.length;
  const floor = Math.floor(limit * 0.65);
  const slice = text.slice(0, limit);
  const breakpoints = ["\n\n", "\n", "。", "！", "？", "；", "; ", ". "]
    .map((marker) => {
      const index = slice.lastIndexOf(marker);
      return index >= floor ? index + marker.length : -1;
    })
    .filter((index) => index > 0);
  return breakpoints.length ? Math.max(...breakpoints) : limit;
}

function clipContextContent(content, limit = maxContextItemChars) {
  const normalized = normalizeContextExcerpt(content);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, excerptCutPoint(normalized, limit - 3)).trimEnd()}...`;
}

function sourceKindRank(kind) {
  return {
    scrap: 10,
    readerClip: 11,
    documentClip: 12,
    searchResult: 13,
    file: 20,
    reference: 30,
    textDisk: 40,
  }[kind] || 90;
}

function compareSourceItems(a, b) {
  const rank = sourceKindRank(a.kind) - sourceKindRank(b.kind);
  if (rank !== 0) return rank;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function getScrapSourceKind(scrap) {
  const sourceType = scrap?.source?.type || "";
  const tags = scrap?.tags || [];
  if (sourceType === "reader-clip" || tags.includes("reader-clip")) return "readerClip";
  if (sourceType === "document-clip" || tags.includes("document-clip")) return "documentClip";
  if (sourceType === "search-result" || tags.includes("search-result")) return "searchResult";
  return "scrap";
}

function sourceKindLabel(kind) {
  return {
    videoTranscriptClip: "Video Transcript Clip",
    readerClip: t("source_reader_clip"),
    documentClip: t("source_document_clip"),
    searchResult: t("source_search_result"),
    scrap: t("source_scrapbook_clip"),
    file: t("source_document"),
    reference: t("source_project_reference"),
    textDisk: t("source_text_disk"),
  }[kind] || t("source_unknown");
}

function sourceContractForScrap(scrap) {
  const kind = getScrapSourceKind(scrap);
  const source = scrap?.source || {};
  const sourceKind = source.sourceKind || scrap?.sourceKind || "";
  const isVideoTranscript = sourceKind === "video_transcript";
  const timeStart = source.timeStart || scrap?.timeStart || source.timeRange?.start || "";
  const timeEnd = source.timeEnd || scrap?.timeEnd || source.timeRange?.end || "";
  const timeRange = timeStart && timeEnd ? `${timeStart} --> ${timeEnd}` : "";
  const title = source.sourceTitle || scrap?.sourceTitle || source.title || scrap?.title || t("scrapbook");
  return {
    kind,
    label: isVideoTranscript ? sourceKindLabel("videoTranscriptClip") : sourceKindLabel(kind),
    title,
    origin: isVideoTranscript
      ? [title, timeRange].filter(Boolean).join(" / ")
      : source.site || source.origin || source.url || source.title || t("source_saved_in_project"),
    target: kind === "readerClip"
      ? t("reader")
      : kind === "documentClip"
      ? t("documents")
      : t("scrapbook"),
    url: source.url || "",
    readerKind: source.readerKind || "",
    fileName: source.fileName || "",
    fileId: source.fileId || "",
    sourceKind,
    sourceId: source.sourceId || scrap?.sourceId || "",
    timeStart,
    timeEnd,
    timeRange,
    originalBlockIds: source.originalBlockIds || source.originalSrtBlockIds || scrap?.originalBlockIds || [],
  };
}

function sourceContractForRegistryItem(source) {
  if (!source) return null;
  if (["readerClip", "documentClip", "searchResult", "scrap"].includes(source.kind)) {
    const contract = sourceContractForScrap(source.item);
    return {
      ...contract,
      citation: source.citationPrefix || "",
      title: source.title || contract.title,
    };
  }
  return {
    kind: source.kind,
    label: sourceKindLabel(source.kind),
    title: source.title || t("source_unknown"),
    origin: source.subtitle || t("source_saved_in_project"),
    target: source.kind === "file"
      ? t("documents")
      : source.kind === "reference"
      ? t("project_references")
      : source.kind === "textDisk"
      ? t("mounted_text_disk")
      : t("source_saved_in_project"),
    citation: source.citationPrefix || "",
  };
}

function sourceContractForContextItem(contextItem) {
  const registrySource = getSourceRegistryItemForContextItem(contextItem);
  if (registrySource) return sourceContractForRegistryItem(registrySource);
  if (contextItem?.kind === "scrap") {
    return sourceContractForScrap({
      title: contextItem.title,
      tags: contextItem.tags || [],
      source: {
        type: contextItem.sourceType || "",
        url: contextItem.url || "",
        site: contextItem.site || "",
        title: contextItem.source || contextItem.title || "",
      },
    });
  }
  return {
    kind: contextItem?.kind || "",
    label: sourceKindLabel(contextItem?.kind),
    title: contextItem?.name || contextItem?.referenceName || contextItem?.source || contextItem?.title || t("source_unknown"),
    origin: contextSourceLabel(contextItem) || t("source_saved_in_project"),
    target: contextItem?.kind === "file" ? t("documents") : t("source_saved_in_project"),
    citation: contextItem?.citationId || "",
  };
}

function buildProjectSourceRegistry() {
  const items = [];
  if (!isProjectMounted || !activeProjectId) return items;

  getProjectScraps().forEach((scrap) => {
    const kind = getScrapSourceKind(scrap);
    const contract = sourceContractForScrap(scrap);
    items.push({
      key: `scrap:${scrap.id}`,
      kind,
      title: scrap.title || t("scrapbook"),
      subtitle: contract.origin,
      url: scrap.source?.url || "",
      item: scrap,
    });
  });

  getProjectFiles()
    .filter((file) => file.type === "text")
    .forEach((file) => {
      items.push({
        key: `file:${file.id}`,
        kind: "file",
        title: file.name || t("documents"),
        subtitle: t("documents"),
        item: file,
      });
    });

  projectReferences
    .filter((reference) => reference.projectId === activeProjectId && reference.enabled !== false)
    .forEach((reference) => {
      items.push({
        key: `reference:${reference.id}`,
        kind: "reference",
        title: reference.name || t("references"),
        subtitle: reference.source || t("project_disk"),
        item: reference,
      });
    });

  getMountedTextDiskChunks()
    .forEach((chunk) => {
      items.push({
        key: `textdisk:${chunk.source}`,
        kind: "textDisk",
        title: chunk.source || t("mounted_text_disk"),
        subtitle: t("mounted_text_disk"),
        item: chunk,
      });
    });

  const seen = new Map();
  items.sort(compareSourceItems).forEach((item) => {
    if (!seen.has(item.key)) seen.set(item.key, item);
  });

  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) {
    return Array.from(seen.values()).map((item, index) => ({
      ...item,
      sourceId: `S${index + 1}`,
      citationPrefix: `[S${index + 1}]`,
    }));
  }

  const registry = ensureProjectSourceRegistry(project);
  let dirty = false;
  const result = Array.from(seen.values()).map((item) => {
    let id = registry.allocations[item.key];
    if (!id) {
      id = `S${registry.nextN}`;
      registry.allocations[item.key] = id;
      registry.nextN += 1;
      dirty = true;
    }
    return { ...item, sourceId: id, citationPrefix: `[${id}]` };
  });

  if (dirty && typeof saveDeskState === "function") {
    project.updatedAt = new Date().toISOString();
    saveDeskState();
  }
  return result;
}

function ensureProjectSourceRegistry(project) {
  if (!project) return { allocations: {}, nextN: 1 };
  if (!project.sourceRegistry || typeof project.sourceRegistry !== "object") {
    project.sourceRegistry = { allocations: {}, nextN: 1 };
  }
  const registry = project.sourceRegistry;
  if (!registry.allocations || typeof registry.allocations !== "object") {
    registry.allocations = {};
  }
  const maxAllocated = Object.values(registry.allocations).reduce((max, id) => {
    const n = parseInt(String(id).replace(/^S/, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  if (!Number.isFinite(registry.nextN) || registry.nextN <= maxAllocated) {
    registry.nextN = maxAllocated + 1;
  }
  return registry;
}

function getCitingDraftsForReference(referenceId) {
  return getCitingDraftsForSource(referenceId ? `reference:${referenceId}` : "");
}

function getCitingDraftsForSource(stableKey) {
  if (!isProjectMounted || !activeProjectId || !stableKey) return [];
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) return [];
  buildProjectSourceRegistry();
  const allocations = project.sourceRegistry?.allocations || {};
  const sourceId = allocations[stableKey];
  if (!sourceId) return [];

  const pattern = new RegExp(`\\[${sourceId}(?::\\d+)?\\]`);
  const hits = [];
  const scan = (surface, surfaceLabel, body, sectionTitle, index) => {
    if (typeof body !== "string" || !body) return;
    if (pattern.test(body)) {
      hits.push({
        surface,
        surfaceLabel,
        sectionTitle: sectionTitle || "",
        index: typeof index === "number" ? index : -1,
        sourceId,
      });
    }
  };

  scan("outline", t("outline"), project.outline);
  scan("questionSheet", t("question_sheet"), project.questionSheet);
  (project.drafts || []).forEach((draft, index) => {
    scan(
      "draft",
      t("section_drafts"),
      draft.body,
      draft.title || draft.sectionTitle || "",
      index
    );
  });
  return hits;
}

const citationCycleIndex = new Map();

function selectCitationInInput(input, sourceId) {
  if (!input || typeof input.value !== "string") return false;
  const text = input.value;
  const regex = new RegExp(`\\[${sourceId}(?::\\d+)?\\]`);
  const match = text.match(regex);
  if (!match) return false;
  const start = match.index;
  const end = start + match[0].length;
  input.focus();
  try { input.setSelectionRange(start, end); } catch (_) {}
  const linesBefore = text.slice(0, start).split("\n").length;
  const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 18;
  input.scrollTop = Math.max(0, (linesBefore - 5) * lineHeight);
  return true;
}

async function jumpToCitation(hit) {
  if (!hit || typeof openWindow !== "function") return false;
  if (hit.surface === "outline") {
    await openWindow("outline");
    return selectCitationInInput(typeof outlineContentEl !== "undefined" ? outlineContentEl : null, hit.sourceId);
  }
  if (hit.surface === "questionSheet") {
    await openWindow("questionSheet");
    return selectCitationInInput(typeof questionSheetBodyInput !== "undefined" ? questionSheetBodyInput : null, hit.sourceId);
  }
  if (hit.surface === "draft") {
    await openWindow("sectionDrafts");
    if (typeof selectedDraftIndex !== "undefined" && hit.index >= 0) selectedDraftIndex = hit.index;
    if (typeof renderPipeline === "function") renderPipeline();
    return selectCitationInInput(typeof draftBodyInput !== "undefined" ? draftBodyInput : null, hit.sourceId);
  }
  return false;
}

async function cycleCitationJump(stableKey) {
  const hits = getCitingDraftsForSource(stableKey);
  if (!hits.length) {
    if (typeof setStatus === "function") setStatus(t("citation_jump_none"));
    return false;
  }
  const last = citationCycleIndex.has(stableKey) ? citationCycleIndex.get(stableKey) : -1;
  const next = (last + 1) % hits.length;
  citationCycleIndex.set(stableKey, next);
  const hit = hits[next];
  if (!await jumpToCitation(hit)) {
    if (typeof setStatus === "function") setStatus(t("citation_jump_failed"));
    return false;
  }
  const label = hit.sectionTitle || hit.surfaceLabel;
  if (typeof setStatus === "function") {
    setStatus(t("citation_jump_status", label, next + 1, hits.length));
  }
  return true;
}

function collectCitedSourceIds(markdown) {
  const ids = new Set();
  if (typeof markdown !== "string" || !markdown) return ids;
  const pattern = /\[(S\d+)(?::\d+)?\]/g;
  let match;
  while ((match = pattern.exec(markdown))) ids.add(match[1]);
  return ids;
}

function buildSourceBibliography(markdown) {
  const ids = collectCitedSourceIds(markdown);
  if (!ids.size) return [];
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project) return [];
  const allocations = project.sourceRegistry?.allocations || {};
  const keyById = new Map();
  Object.entries(allocations).forEach(([key, id]) => keyById.set(id, key));

  const registry = typeof buildProjectSourceRegistry === "function" ? buildProjectSourceRegistry() : [];
  const sourceById = new Map(registry.map((item) => [item.sourceId, item]));

  const sortById = (a, b) => {
    const an = parseInt(String(a).replace(/^S/, ""), 10) || 0;
    const bn = parseInt(String(b).replace(/^S/, ""), 10) || 0;
    return an - bn;
  };

  return [...ids].sort(sortById).map((sourceId) => {
    const item = sourceById.get(sourceId);
    if (item) {
      const url = item.url || item.item?.source?.url || "";
      return {
        sourceId,
        title: item.title || "",
        url,
        kind: item.kind || "",
        missing: false,
      };
    }
    const orphanKey = keyById.get(sourceId) || "";
    return { sourceId, title: "", url: "", kind: orphanKey.split(":")[0] || "", missing: true };
  });
}

function formatBibliographyMarkdown(entries) {
  if (!entries.length) return "";
  const lines = entries.map((entry) => {
    if (entry.missing) return `- [${entry.sourceId}] ${t("bibliography_missing_source")}`;
    const titlePart = entry.title || `[${entry.sourceId}]`;
    const urlPart = entry.url ? ` — ${entry.url}` : "";
    return `- [${entry.sourceId}] ${titlePart}${urlPart}`;
  });
  return `## ${t("bibliography_heading")}\n\n${lines.join("\n")}\n`;
}

function appendBibliographyToMarkdown(markdown) {
  const entries = buildSourceBibliography(markdown);
  if (!entries.length) return markdown;
  const bibliography = formatBibliographyMarkdown(entries);
  if (!bibliography) return markdown;
  const trimmed = String(markdown || "").replace(/\s+$/, "");
  return `${trimmed}\n\n${bibliography}`;
}

function sourceTextForRegistryItem(source) {
  if (!source?.item) return "";
  if (source.kind === "reference") return getProjectReferenceText(source.item);
  if (source.kind === "file") return source.item.body || "";
  if (source.kind === "textDisk") return mountedTextDisk.fileBodies[source.item.source] || source.item.content || "";
  return source.item.body || source.item.selectedText || "";
}

function sourceQuoteForRegistryItem(source) {
  if (!source?.item) return "";
  if (["readerClip", "documentClip", "searchResult"].includes(source.kind)) return source.item.selectedText || source.item.body || "";
  if (source.kind === "scrap") return source.item.body || "";
  return "";
}

function getSourceRegistryItemForContextItem(contextItem) {
  const key = getContextSourceKey(contextItem);
  return buildProjectSourceRegistry().find((source) => source.key === key) || null;
}

function sourceLabelFromRegistryItem(source) {
  if (!source) return "";
  const contract = sourceContractForRegistryItem(source);
  return `${source.citationPrefix} ${contract.label} / ${contract.title || t("source")}`;
}

function sourceCitationForContextItem(contextItem, passageIndex = null) {
  const source = getSourceRegistryItemForContextItem(contextItem);
  if (!source) return contextItem?.citationId || "";
  if (passageIndex === null || passageIndex === undefined) return source.citationPrefix;
  return `[${source.sourceId}:${passageIndex + 1}]`;
}

function contextSourceLabel(contextItem) {
  if (!contextItem) return "";
  const registrySource = getSourceRegistryItemForContextItem(contextItem);
  if (registrySource) {
    const chunkLabel = contextItem.kind === "reference" || contextItem.fromProjectReference || contextItem.kind === "chunk"
      ? ` / chunk ${contextItem.referenceChunkIndex || contextItem.chunkIndex || 1}`
      : "";
    return `${sourceLabelFromRegistryItem(registrySource)}${chunkLabel}`;
  }
  if (contextItem.kind === "scrap") {
    const contract = sourceContractForContextItem(contextItem);
    return `${contract.label} / ${contract.title || contextItem.source || "Untitled"}`;
  }
  if (contextItem.kind === "file") return `Documents / ${contextItem.name || contextItem.source || "Untitled"}`;
  if (contextItem.fromProjectReference || contextItem.kind === "reference") {
    return `Project Reference / ${contextItem.referenceName || contextItem.source || "Untitled"} / chunk ${contextItem.referenceChunkIndex || contextItem.chunkIndex || 1}`;
  }
  if (contextItem.kind === "chunk") return `File Floppy / ${contextItem.source || "Untitled"} / chunk ${contextItem.chunkIndex || 1}`;
  return contextItem.source || contextItem.title || "Context";
}

function getContextSourceKey(contextItem) {
  if (!contextItem) return "";
  if (contextItem.kind === "scrap") return `scrap:${contextItem.id}`;
  if (contextItem.kind === "file") return `file:${contextItem.id}`;
  if (contextItem.fromProjectReference || contextItem.kind === "reference") return `reference:${contextItem.referenceId || contextItem.source}`;
  if (contextItem.kind === "chunk") return `textdisk:${contextItem.source}`;
  return `${contextItem.kind || "context"}:${contextItem.id || contextItem.source || ""}`;
}

function isContextSourceEnabled(contextItem) {
  return !excludedContextKeys.has(getContextSourceKey(contextItem));
}

function isContextSourceLive(contextItem) {
  if (!contextItem || contextItem.projectId !== activeProjectId) return false;
  if (contextItem.kind === "scrap") return getProjectScraps().some((scrap) => scrap.id === contextItem.id);
  if (contextItem.kind === "file") return getProjectFiles().some((file) => file.id === contextItem.id);
  if (contextItem.fromProjectReference || contextItem.kind === "reference") {
    const referenceId = contextItem.referenceId || contextItem.id;
    return projectReferences.some((reference) =>
      reference.projectId === activeProjectId
      && reference.enabled !== false
      && (reference.id === referenceId || reference.name === contextItem.source)
    );
  }
  if (contextItem.kind === "chunk") {
    return mountedTextDisk.projectId === activeProjectId
      && mountedTextDisk.files.includes(contextItem.source)
      && ragChunks.some((chunk) =>
        chunk.projectId === activeProjectId
        && !chunk.fromProjectReference
        && chunk.source === contextItem.source
      );
  }
  return true;
}

function purgeContextForTrashedItems(items = []) {
  const records = Array.from(items || []).filter(Boolean);
  if (!records.length) return;
  const fileNames = new Set();
  const fileIds = new Set();
  const scrapIds = new Set();
  const referenceIds = new Set();
  const mountedNames = new Set();

  records.forEach((record) => {
    const type = record.type || record.originalType || record.kind;
    const item = record.item || record.originalData || record;
    if (type === "file") {
      if (record.id || item.id) fileIds.add(record.id || item.id);
      if (item.name || record.name) fileNames.add(item.name || record.name);
    } else if (type === "folder") {
      (item.files || record.files || []).forEach((file) => {
        if (file.id) fileIds.add(file.id);
        if (file.name) fileNames.add(file.name);
      });
    } else if (type === "scrap") {
      if (record.id || item.id) scrapIds.add(record.id || item.id);
    } else if (type === "projectReference") {
      if (record.id || item.id) referenceIds.add(record.id || item.id);
      if (item.name || record.name) fileNames.add(item.name || record.name);
    } else if (type === "mountedFile") {
      if (record.id || item.name || record.name) mountedNames.add(record.id || item.name || record.name);
    }
  });

  const deadKeys = new Set([
    ...[...fileIds].map((id) => `file:${id}`),
    ...[...scrapIds].map((id) => `scrap:${id}`),
    ...[...referenceIds].map((id) => `reference:${id}`),
    ...[...mountedNames].map((name) => `textdisk:${name}`),
  ]);
  deadKeys.forEach((key) => excludedContextKeys.delete(key));
  scrapIds.forEach((id) => attachedClipIds.delete(id));

  for (let index = ragChunks.length - 1; index >= 0; index -= 1) {
    const chunk = ragChunks[index];
    const removeReference = chunk.fromProjectReference && (referenceIds.has(chunk.referenceId) || referenceIds.has(chunk.id));
    const removeMounted = !chunk.fromProjectReference && (fileNames.has(chunk.source) || mountedNames.has(chunk.source));
    if (removeReference || removeMounted) ragChunks.splice(index, 1);
  }

  lastRetrievedContextItems = lastRetrievedContextItems.filter(isContextSourceLive);
  if (typeof ragRankCache !== "undefined" && typeof ragRankCache.clear === "function") ragRankCache.clear();
  if (typeof invalidateSessionContextAfterTrash === "function") invalidateSessionContextAfterTrash();
  scheduleRenderTasks("contextPanel");
}

function contextPriority(contextItem) {
  if (contextItem.kind === "scrap") return contextItem.tags?.includes("reader-clip") ? 0.38 : 0.42;
  if (contextItem.kind === "file") return 0.3;
  if (contextItem.fromProjectReference || contextItem.kind === "reference") return 0.22;
  return 0;
}

function estimateTokens(text = "") {
  return Math.ceil(String(text).length / contextCharsPerToken);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

var CLOUD_MODEL_CONTEXT_LENGTHS = { "deepseek-v4-flash": 1000000, "deepseek-v4-pro": 1000000, "v4-flash": 1000000, "v4-pro": 1000000 };

function currentModelMaxContextTokens() {
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.model) {
    const cloudContextLength = CLOUD_MODEL_CONTEXT_LENGTHS[cloudConfig.model];
    if (cloudContextLength) return cloudContextLength;
  }
  if (typeof contextMaxRecordForModel !== "function") return 0;
  return Number(contextMaxRecordForModel()?.max || 0);
}

function getEffectiveContextTokens(options = {}) {
  const requested = Number(options.contextTokens || contextLengthInput.value || 8192);
  const modelMax = Number(options.maxContextTokens || currentModelMaxContextTokens() || 0);
  if (modelMax > 0) return clampNumber(requested, contextMinLength || 1024, modelMax);
  return Math.max(contextMinLength || 1024, requested);
}

function getDynamicContextCap(contextTokens, modelMaxTokens = 0) {
  const effectiveTokens = modelMaxTokens > 0 ? Math.min(contextTokens, modelMaxTokens) : contextTokens;
  if (effectiveTokens >= 262144) return 240000;
  if (effectiveTokens >= 131072) return 140000;
  if (effectiveTokens >= 65536) return 80000;
  if (effectiveTokens >= 32768) return 48000;
  if (effectiveTokens >= 16384) return 28000;
  return maxContextChars;
}

function getRagContextBudget(userText, recentMessages = [], options = {}) {
  const modelMaxTokens = Number(options.maxContextTokens || currentModelMaxContextTokens() || 0);
  const contextTokens = getEffectiveContextTokens({ ...options, maxContextTokens: modelMaxTokens });
  const recentTokens = recentMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  const fixedTokens =
    reservedOutputTokens +
    reservedSafetyTokens +
    estimateTokens(systemInput.value) +
    estimateTokens(userText) +
    recentTokens;
  const availableTokens = Math.max(0, contextTokens - fixedTokens);
  const budgetTokens = Math.floor(availableTokens * ragBudgetShare);
  const capChars = options.capChars || getDynamicContextCap(contextTokens, modelMaxTokens);
  const budgetChars = clampNumber(budgetTokens * contextCharsPerToken, 0, capChars);

  return {
    contextTokens,
    modelMaxTokens,
    fixedTokens,
    availableTokens,
    budgetTokens,
    budgetChars,
    usedChars: 0,
  };
}

function getSystemRagTopK(budgetInfo, options = {}) {
  if (Number.isFinite(options.topK)) return options.topK;
  const contextTokens = Number(budgetInfo?.contextTokens || getEffectiveContextTokens());
  const automaticTopK =
    contextTokens >= 262144 ? 12 :
      contextTokens >= 131072 ? 10 :
        contextTokens >= 65536 ? 8 :
          contextTokens >= 32768 ? 6 :
            contextTokens >= 16384 ? 5 : 4;
  return Math.min(automaticTopK, options.maxReferenceChunks || maxReferenceChunks);
}

function takeWithinBudget(items, budget, formatItem) {
  const selected = [];
  let used = 0;

  for (const item of items) {
    const text = formatItem(item, selected.length);
    if (used + text.length > budget && selected.length) break;
    selected.push(text);
    used += text.length;
    if (used >= budget) break;
  }

  return selected;
}

function takeWithinBudgetDetailed(items, budget, formatItem) {
  const selected = [];
  const dropped = [];
  let used = 0;

  for (const item of items) {
    const text = formatItem(item, selected.length);
    if (budget <= 0 || used + text.length > budget) {
      dropped.push({ item, text, chars: text.length });
      continue;
    }
    selected.push({ item, text, chars: text.length });
    used += text.length;
  }

  return { selected, dropped, used };
}

function getCuratedContextItems(userText, limit = maxCuratedContextItems) {
  const queryWords = getQueryWords(userText);
  const contextItems = [
    ...getProjectScraps().map((scrap) => ({
      id: scrap.id,
      title: scrap.title,
      source: scrap.source?.url || scrap.title,
      sourceType: scrap.source?.type || "",
      site: scrap.source?.site || "",
      url: scrap.source?.url || "",
      content: scrap.body,
      kind: "scrap",
      projectId: scrap.projectId,
      tags: scrap.tags || [],
    })),
    ...getProjectFiles()
      .filter((file) => file.type === "text")
      .map((file) => ({
        id: file.id,
        name: `${file.name}.text`,
        source: file.name,
        content: file.body,
        kind: "file",
        projectId: file.projectId,
      })),
  ];

  return contextItems
    .filter((contextItem) => contextItem.content?.trim())
    .filter(isContextSourceLive)
    .map((contextItem) => ({
      ...contextItem,
      score: keywordScore(contextItem.content, queryWords) + contextPriority(contextItem),
    }))
    .filter((contextItem) => contextItem.score > 0 || queryWords.size === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function retrieveContext(userText, options = {}) {
  if (!isProjectMounted || !activeProjectId) {
    lastContextBudget = null;
    lastRetrievedContextItems = [];
    scheduleRenderTasks("contextPanel");
    return "";
  }

  const includeCurated = options.includeCurated !== false;
  const includeProjectReferences = options.includeProjectReferences !== false;
  const includeTextDisk = options.includeTextDisk !== false;
  const budgetInfo = options.budgetInfo || getRagContextBudget(userText, []);
  const topK = getSystemRagTopK(budgetInfo, options);
  const candidatePoolSize = Math.max(topK * 4, topK + excludedContextKeys.size);
  const contextBudget = Number.isFinite(options.budget) ? options.budget : budgetInfo.budgetChars;
  const itemLimit = options.itemLimit || maxContextItemChars;
  const queryWords = getQueryWords(userText);
  const curatedCandidates = includeCurated
    ? getCuratedContextItems(userText, options.maxCuratedContextItems || maxCuratedContextItems)
    : [];
  const curated = curatedCandidates.filter(isContextSourceEnabled);
  const excludedCurated = curatedCandidates.filter((contextItem) => !isContextSourceEnabled(contextItem));

  const rankedCandidates = ragChunks
    .filter((chunk) => chunk.projectId === activeProjectId)
    .filter((chunk) => {
      if (chunk.fromProjectReference) return includeProjectReferences;
      return includeTextDisk;
    })
    .map((chunk) => {
      const keywordHits = keywordScore(chunkRagSearchText(chunk), queryWords);
      const sourceHits = keywordScore(chunkSourceName(chunk), queryWords);

      return {
        ...chunk,
        kind: chunk.fromProjectReference ? "reference" : "chunk",
        score: (chunk.lastQueryScore ?? 0) + (keywordHits * 0.03) + (sourceHits * 0.08) + contextPriority(chunk),
      };
    })
    .filter(isContextSourceLive)
    .sort((a, b) => b.score - a.score)
    .slice(0, candidatePoolSize);
  const ranked = selectDiverseRankedChunks(rankedCandidates.filter(isContextSourceEnabled), topK, userText);
  const excludedRanked = rankedCandidates.filter((contextItem) => !isContextSourceEnabled(contextItem));

  const sections = [];
  const rawSections = [];
  const contextPanelItems = [];
  const selectedGistEntries = [];
  let usedChars = 0;

  excludedCurated.forEach((contextItem) => contextPanelItems.push({ ...contextItem, type: "curated", included: false, excluded: true, budgetChars: 0 }));
  excludedRanked.forEach((contextItem) => contextPanelItems.push({ ...contextItem, type: "ranked", included: false, excluded: true, budgetChars: 0 }));

  if (curated.length) {
    const curatedResult = takeWithinBudgetDetailed(
      curated,
      Math.floor(contextBudget * 0.4),
      (contextItem, index) => {
        const citationId = sourceCitationForContextItem(contextItem, index) || `[M${index + 1}]`;
        return `${citationId} ${contextSourceLabel(contextItem)}\n${clipContextContent(contextItem.content, itemLimit)}`;
      }
    );
    usedChars += curatedResult.used;
    curatedResult.selected.forEach((entry, index) => {
      const citationId = sourceCitationForContextItem(entry.item, index) || `[M${index + 1}]`;
      selectedGistEntries.push({
        item: entry.item,
        type: "curated",
        text: entry.text,
        rawText: entry.item.content || entry.text,
        citationId,
        score: entry.item.score || 0,
      });
      contextPanelItems.push({
        ...entry.item,
        type: "curated",
        citationId,
        included: true,
        budgetChars: entry.chars,
        excluded: false,
      });
    });
    curatedResult.dropped.forEach((entry) => contextPanelItems.push({ ...entry.item, type: "curated", included: false, budgetChars: entry.chars, excluded: false }));
    if (curatedResult.selected.length) {
      rawSections.push(
        [
          "Curated context selected or saved by the user:",
          ...curatedResult.selected.map((entry) => entry.text),
        ].join("\n\n")
      );
    }
  }

  if (ranked.length) {
    const rankedResult = takeWithinBudgetDetailed(
      ranked,
      Math.floor(contextBudget * 0.6),
      (chunk, index) => {
        const citationId = sourceCitationForContextItem(chunk, index) || `[R${index + 1}]`;
        return `${citationId} ${contextSourceLabel(chunk)}\n${clipContextContent(chunk.content, itemLimit)}`;
      }
    );
    usedChars += rankedResult.used;
    rankedResult.selected.forEach((entry, index) => {
      const citationId = sourceCitationForContextItem(entry.item, index) || `[R${index + 1}]`;
      selectedGistEntries.push({
        item: entry.item,
        type: "ranked",
        text: entry.text,
        rawText: entry.item.content || entry.text,
        citationId,
        score: entry.item.score || entry.item.lastQueryScore || 0,
      });
      contextPanelItems.push({
        ...entry.item,
        type: "ranked",
        citationId,
        included: true,
        budgetChars: entry.chars,
        excluded: false,
      });
    });
    rankedResult.dropped.forEach((entry) => contextPanelItems.push({ ...entry.item, type: "ranked", included: false, budgetChars: entry.chars, excluded: false }));
    if (rankedResult.selected.length) {
      rawSections.push(
        [
          "Selected reference excerpts. Use only what these excerpts support; if they are insufficient, say so:",
          ...rankedResult.selected.map((entry) => entry.text),
        ].join("\n\n")
      );
    }
  }

  const rawContextText = rawSections.join("\n\n");
  const gistPacket = typeof buildContextGistPacket === "function" && selectedGistEntries.length
    ? buildContextGistPacket(userText, selectedGistEntries, {
        taskKind: options.taskKind || "",
        rawContextText,
      })
    : null;
  if (gistPacket?.text) {
    sections.push(gistPacket.text);
    if (gistPacket.rolesByCitation) {
      contextPanelItems.forEach((contextItem) => {
        if (contextItem.included === false || contextItem.excluded || !contextItem.citationId) return;
        const role = gistPacket.rolesByCitation[contextItem.citationId];
        if (role) contextItem.gistRole = role;
      });
    }
  } else if (rawContextText) {
    sections.push(rawContextText);
  }

  lastContextBudget = {
    ...budgetInfo,
    budgetChars: contextBudget,
    usedChars: gistPacket?.text ? gistPacket.text.length : usedChars,
    rawChars: usedChars,
    ...(gistPacket?.stats ? { gist: gistPacket.stats } : {}),
    ...(gistPacket?.fallbackReason ? { gistFallbackReason: gistPacket.fallbackReason } : {}),
  };
  lastRetrievedContextItems = contextPanelItems;
  scheduleRenderTasks("contextPanel");

  return sections.join("\n\n");
}

async function buildBudgetedProjectContext(userText, options = {}) {
  await rankChunksForQuery(userText, options.signal);
  const budgetInfo = getRagContextBudget(userText, [], {
    capChars: options.budget || maxPipelineContextChars,
  });
  return retrieveContext(userText, {
    budget: Math.min(options.budget || maxPipelineContextChars, budgetInfo.budgetChars),
    budgetInfo,
    taskKind: options.taskKind || "project-context",
    topK: options.topK || maxPipelineReferenceChunks,
    maxReferenceChunks: options.maxReferenceChunks || maxPipelineReferenceChunks,
    maxCuratedContextItems: options.maxCuratedContextItems || 6,
    itemLimit: options.itemLimit || maxContextItemChars,
  });
}

async function rankChunksForQuery(userText, signal) {
  if (!isProjectMounted || !activeProjectId) return;
  const projectChunks = ragChunks.filter((chunk) => chunk.projectId === activeProjectId && Array.isArray(chunk.embedding));
  if (!projectChunks.length) return;
  const endPerf = window.AISystem6Perf?.start("rag_rank", { chunks: projectChunks.length });
  const cacheKey = `${normalizeSearchText(userText)}::${ragRankContextVersion(projectChunks)}`;
  const cached = ragRankCache.get(cacheKey);
  if (cached) {
    projectChunks.forEach((chunk) => {
      chunk.lastQueryScore = cached.get(chunk.id || `${chunk.source}:${chunk.chunkIndex}`) || 0;
    });
    endPerf?.({ cached: true });
    return;
  }

  try {
    const [queryEmbedding] = await embedTexts([userText], signal);
    const scores = new Map();
    projectChunks.forEach((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      chunk.lastQueryScore = score;
      scores.set(chunk.id || `${chunk.source}:${chunk.chunkIndex}`, score);
    });
    rememberRagRankCache(cacheKey, scores);
    endPerf?.({ cached: false });
  } catch (error) {
    console.warn("Embedding ranking failed; falling back to keyword search.", error);
    projectChunks.forEach((chunk) => {
      chunk.lastQueryScore = 0;
    });
    endPerf?.({ error: true });
  }
}
