// Lazy feature module: video-docmap.

const videoDocMapFunctions = new Set(["hook", "background", "knowledge", "experience", "transition", "callback", "ending", "other"]);
const videoDocMapFunctionAliases = Object.freeze({
  钩子: "hook",
  开场: "hook",
  背景: "background",
  知识: "knowledge",
  信息: "knowledge",
  体验: "experience",
  经验: "experience",
  转场: "transition",
  转折: "transition",
  过渡: "transition",
  呼应: "callback",
  回调: "callback",
  结尾: "ending",
  收束: "ending",
  其他: "other",
});
const videoHkrrLabels = Object.freeze({
  Happiness: "lightness, pleasure, humor, surprise, or shareable lift without forcing jokes",
  Knowledge: "clear, valuable, accessible information gain without data dumping",
  Resonance: "relatable situations, stories, dilemmas, or emotional connection without forced sentiment",
  Rhythm: "sound, movement, information, emotion, pause, turn, setup, and payoff structure",
});
const videoHkrrLabelSet = new Set(Object.keys(videoHkrrLabels));
const videoDocMapDataContract = Object.freeze({
  schemaVersion: 1,
  sourceType: "video_transcript",
  mapKind: "videoDocMap",
  nodeFields: Object.freeze(["id", "sourceId", "timeStart", "timeEnd", "title", "summary", "function", "claims", "notableLines", "blockIds", "hkrr"]),
  hkrrOverlayFields: Object.freeze(["nodeId", "labels"]),
  hkrrItemFields: Object.freeze(["type", "reason"]),
  forbiddenFields: Object.freeze(["score", "rank", "probability", "qualityJudgment"]),
});

function videoDocMapTimeMs(value) {
  const match = normalizeVideoDocMapTime(value).match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  return match ? (((Number(match[1]) * 60 + Number(match[2])) * 60) + Number(match[3])) * 1000 + Number(match[4]) : 0;
}

function normalizeVideoDocMapFunction(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  if (videoDocMapFunctions.has(lower)) return lower;
  return videoDocMapFunctionAliases[raw] || "other";
}

function escapeVideoDocMapRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeVideoDocMapTime(value) {
  const raw = String(value || "").trim().replace(/[.．]/g, ",");
  const match = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(?:,(\d{1,3}))?/);
  if (!match) return "";
  const hasHours = typeof match[3] !== "undefined";
  const hours = hasHours ? Number(match[1]) : 0;
  const minutes = hasHours ? Number(match[2]) : Number(match[1]);
  const seconds = hasHours ? Number(match[3]) : Number(match[2]);
  const millis = String(match[4] || "0").padEnd(3, "0").slice(0, 3);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":") + `,${millis}`;
}

function extractVideoDocMapTimeRange(value) {
  const times = String(value || "")
    .match(/\d{1,2}:\d{2}(?::\d{2})?(?:[,.．]\d{1,3})?/g) || [];
  if (times.length < 2) return null;
  const timeStart = normalizeVideoDocMapTime(times[0]);
  const timeEnd = normalizeVideoDocMapTime(times[1]);
  return timeStart && timeEnd ? { timeStart, timeEnd } : null;
}

function stripVideoDocMapTimeRange(value) {
  return String(value || "")
    .replace(/\[?\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.．]\d{1,3})?\s*(?:-->|->|—|–|-|至|到)\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.．]\d{1,3})?\s*\]?/g, "")
    .replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "")
    .trim();
}

function videoDocMapBlockIds(blocks, start, end) {
  const startMs = videoDocMapTimeMs(start);
  const endMs = videoDocMapTimeMs(end);
  if (!startMs && !endMs) return [];
  return (blocks || [])
    .filter((block) => videoDocMapTimeMs(block.end) >= startMs && videoDocMapTimeMs(block.start) <= endMs)
    .map((block) => String(block.index || "").trim())
    .filter(Boolean);
}

function normalizeVideoDocMapNode(raw, index, source) {
  const blocks = Array.isArray(source.meta?.blocks) ? source.meta.blocks : [];
  const fallbackBlock = blocks[index] || blocks[blocks.length - 1] || null;
  const fn = normalizeVideoDocMapFunction(raw?.function || raw?.kind || "other");
  const notableLines = Array.isArray(raw?.notableLines) ? raw.notableLines.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 5) : [];
  const claims = Array.isArray(raw?.claims) ? raw.claims.map((claim) => String(claim || "").trim()).filter(Boolean).slice(0, 6) : [];
  const hkrr = Array.isArray(raw?.hkrr)
    ? raw.hkrr.map((item) => ({
      type: String(item?.type || item?.label || item || "").trim(),
      reason: String(item?.reason || (Array.isArray(item?.facts) ? item.facts[0] : "") || "").trim().slice(0, 180),
    })).filter((item) => videoHkrrLabelSet.has(item.type) && item.reason).slice(0, 4)
    : [];
  const blockIds = Array.isArray(raw?.blockIds) ? raw.blockIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const timeStart = normalizeVideoDocMapTime(raw?.timeStart || raw?.start || fallbackBlock?.start || "");
  const timeEnd = normalizeVideoDocMapTime(raw?.timeEnd || raw?.end || fallbackBlock?.end || "");
  return {
    id: normalizeDocMapId(raw?.id, `video-node-${index + 1}`),
    sourceId: String(raw?.sourceId || source.meta?.sourceId || "").trim(),
    timeStart,
    timeEnd,
    title: shortRebuildText(raw?.title || `Segment ${index + 1}`, 80),
    summary: String(raw?.summary || "").trim().slice(0, 1000),
    function: fn,
    kind: "video-segment",
    claims,
    notableLines,
    hkrr,
    blockIds: blockIds.length ? blockIds : videoDocMapBlockIds(blocks, timeStart, timeEnd),
    quote: notableLines[0] || "",
    cluster: fn,
    importance: Number.isFinite(Number(raw?.importance)) ? Math.max(1, Math.min(5, Number(raw.importance))) : 3,
    sourceLabel: source.label,
  };
}

function normalizeVideoDocMap(data, source) {
  const nodes = (Array.isArray(data?.nodes) ? data.nodes : [])
    .map((node, index) => normalizeVideoDocMapNode(node, index, source))
    .filter((node) => node.timeStart && node.timeEnd && node.title);
  if (!nodes.length) throw new Error("docmap_empty_model_output");
  const central = {
    id: "central",
    title: String(data?.title || data?.central?.title || source.label || "Video DocMap").trim().slice(0, 120),
    summary: String(data?.summary || data?.central?.summary || "").trim().slice(0, 1000),
    kind: "central",
    quote: "",
    cluster: "video",
    importance: 5,
    sourceLabel: source.label,
  };
  const hkrrOverlay = nodes
    .map((node) => ({
      nodeId: node.id,
      labels: (node.hkrr || []).map((item) => ({
        type: item.type,
        reason: item.reason,
      })).filter((item) => videoHkrrLabelSet.has(item.type) && item.reason),
    }))
    .filter((item) => item.labels.length);
  return {
    id: crypto.randomUUID(),
    kind: "videoDocMap",
    title: central.title,
    central,
    sourceLabel: source.label,
    sourceScope: source.scope,
    sourceText: source.text,
    sourceMeta: source.meta || null,
    status: "temporary",
    traceability: "full",
    createdAt: new Date().toISOString(),
    nodes,
    hkrrOverlay,
    edges: nodes.map((node, index) => ({ id: `edge-video-${index + 1}`, from: "central", to: node.id, label: node.function, type: "sequence" })),
    clusters: [...new Set(nodes.map((node) => node.function))],
  };
}

function fallbackVideoDocMapFunction(text, index, total) {
  const value = String(text || "").toLowerCase();
  if (index === 0) return "hook";
  if (index >= Math.max(0, total - 1)) return "ending";
  if (/but|however|then|next|so|因此|但是|可是|接下来|然后|不过|转折/.test(value)) return "transition";
  if (/because|why|how|means|called|first|second|所以|因为|为什么|怎么|如何|意思|第一|第二|知识|原理/.test(value)) return "knowledge";
  if (/i |we |my |our |feel|felt|experience|我|我们|体验|感觉|使用|上手|试/.test(value)) return "experience";
  if (/again|remember|back|callback|回到|呼应|刚才|前面/.test(value)) return "callback";
  return "background";
}

function fallbackVideoDocMapTitle(text, index) {
  return firstSentence(text, currentLanguage === "zh" ? 26 : 48) || (currentLanguage === "zh" ? `片段 ${index + 1}` : `Segment ${index + 1}`);
}

function fallbackVideoDocMapHkrr(text, fn) {
  const labels = [];
  const value = String(text || "").toLowerCase();
  if (fn === "knowledge" || /how|why|because|means|如何|为什么|因为|所以|知识|原理/.test(value)) {
    labels.push({ type: "Knowledge", reason: currentLanguage === "zh" ? "这一段提供解释、定义或可理解的信息。" : "This segment gives explanation, definition, or usable information." });
  }
  if (fn === "experience" || /feel|felt|experience|我|我们|体验|感觉|上手/.test(value)) {
    labels.push({ type: "Resonance", reason: currentLanguage === "zh" ? "这一段把信息落到具体体验或可共感场景。" : "This segment grounds the material in experience or a relatable situation." });
  }
  if (fn === "hook" || fn === "transition" || fn === "callback" || fn === "ending") {
    labels.push({ type: "Rhythm", reason: currentLanguage === "zh" ? "这一段承担开场、转场、呼应或收束的结构功能。" : "This segment works as an opening, turn, callback, or closing beat." });
  }
  return labels.slice(0, 3);
}

function buildFallbackVideoDocMap(source, reason = "") {
  const paragraphs = Array.isArray(source.meta?.paragraphs) ? source.meta.paragraphs : [];
  const usable = paragraphs.filter((paragraph) => paragraph.timeStart && paragraph.timeEnd && paragraph.text);
  if (!usable.length) throw new Error(reason || "docmap_empty_model_output");
  const targetCount = Math.min(12, Math.max(6, usable.length));
  const groupSize = Math.max(1, Math.ceil(usable.length / targetCount));
  const groups = [];
  for (let index = 0; index < usable.length; index += groupSize) {
    groups.push(usable.slice(index, index + groupSize));
  }
  const nodes = groups.slice(0, 12).map((group, index, all) => {
    const text = group.map((paragraph) => paragraph.text).join(" ");
    const fn = fallbackVideoDocMapFunction(text, index, all.length);
    const blockIds = group.flatMap((paragraph) => Array.isArray(paragraph.blockIds) ? paragraph.blockIds.map((id) => String(id)) : []);
    return normalizeVideoDocMapNode({
      id: `video-node-${index + 1}`,
      sourceId: source.meta?.sourceId || "",
      timeStart: group[0]?.timeStart || group[0]?.start || "",
      timeEnd: group[group.length - 1]?.timeEnd || group[group.length - 1]?.end || "",
      title: fallbackVideoDocMapTitle(text, index),
      summary: firstSentence(text, currentLanguage === "zh" ? 110 : 170),
      function: fn,
      notableLines: group.slice(0, 3).map((paragraph) => paragraph.text),
      claims: [],
      hkrr: fallbackVideoDocMapHkrr(text, fn),
      blockIds,
    }, index, source);
  });
  return normalizeVideoDocMap({
    title: source.label || "Video DocMap",
    summary: reason
      ? (currentLanguage === "zh" ? "本地图谱由字幕段落生成；模型结构分析未完成。" : "Local map generated from transcript paragraphs; model analysis did not complete.")
      : "",
    nodes,
  }, source);
}

function cleanVideoDocMapMarkdown(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function parseVideoDocMapListValue(value) {
  return String(value || "")
    .split(/\s*(?:[;,，；]|\s{2,})\s*/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseVideoDocMapHkrrLine(value) {
  const match = String(value || "").trim().match(/^[-*]?\s*(Happiness|Knowledge|Resonance|Rhythm|快乐|知识|共鸣|节奏)\s*[:：-]\s*(.+)$/i);
  if (!match) return null;
  const aliases = { 快乐: "Happiness", 知识: "Knowledge", 共鸣: "Resonance", 节奏: "Rhythm" };
  const type = aliases[match[1]] || [...videoHkrrLabelSet].find((label) => label.toLowerCase() === match[1].toLowerCase());
  const reason = String(match[2] || "").trim();
  return type && reason ? { type, reason } : null;
}

function parseVideoDocMapMarkdown(markdown, source) {
  const clean = cleanVideoDocMapMarkdown(markdown);
  const lines = clean.split(/\r?\n/);
  const nodes = [];
  let title = "";
  let summary = "";
  let current = null;
  let listMode = "";

  const flush = () => {
    if (!current) return;
    nodes.push(current);
    current = null;
    listMode = "";
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const titleMatch = /^#\s+(.+)$/.exec(line);
    if (titleMatch && !/^##\s+/.test(line)) {
      title = titleMatch[1].trim();
      return;
    }

    const summaryMatch = /^(?:Summary|摘要)\s*[:：]\s*(.+)$/i.exec(line);
    if (summaryMatch && !current) {
      summary = summaryMatch[1].trim();
      return;
    }

    const heading = /^##+\s*(.+)$/i.exec(line);
    if (heading) {
      flush();
      const headingText = heading[1].trim();
      const range = extractVideoDocMapTimeRange(headingText);
      const rest = stripVideoDocMapTimeRange(headingText);
      const parts = rest.split(/[|｜:：]/).map((part) => part.trim()).filter(Boolean);
      const fnPart = parts.find((part) => normalizeVideoDocMapFunction(part) !== "other")
        || (rest.match(/\b(hook|background|knowledge|experience|transition|callback|ending|other)\b/i)?.[1] || "")
        || (rest.match(/(钩子|开场|背景|知识|信息|体验|经验|转场|转折|过渡|呼应|回调|结尾|收束|其他)/)?.[1] || "");
      const fn = normalizeVideoDocMapFunction(fnPart || "other");
      const titlePart = parts.find((part) => part !== fnPart && !videoDocMapFunctions.has(part.toLowerCase()) && !videoDocMapFunctionAliases[part])
        || rest.replace(new RegExp(`(^|[|｜:：\\s-])${escapeVideoDocMapRegExp(fnPart)}($|[|｜:：\\s-])`, "i"), " ").replace(/^[:：-]\s*/, "").trim();
      current = {
        timeStart: range?.timeStart || "",
        timeEnd: range?.timeEnd || "",
        function: videoDocMapFunctions.has(fn) ? fn : "other",
        title: String(titlePart || "").trim(),
        summary: "",
        claims: [],
        notableLines: [],
        hkrr: [],
        blockIds: [],
      };
      return;
    }

    if (!current) return;

    const field = /^(Title|Function|Summary|Claims?|Lines?|Notable Lines?|HKRR|Block IDs?|Blocks?|标题|功能|摘要|论点|台词|字幕|结构标签|区块)\s*[:：]\s*(.*)$/i.exec(line);
    if (field) {
      const key = field[1].toLowerCase();
      const value = field[2].trim();
      listMode = "";
      if (/title|标题/.test(key)) current.title = value;
      else if (/function|功能/.test(key)) {
        current.function = normalizeVideoDocMapFunction(value) || current.function || "other";
      } else if (/summary|摘要/.test(key)) current.summary = value;
      else if (/claim|point|fact|论点|要点|事实/.test(key)) {
        current.claims.push(...parseVideoDocMapListValue(value));
        listMode = "claims";
      } else if (/line|quote|notable|台词|字幕|原文|摘录/.test(key)) {
        current.notableLines.push(...parseVideoDocMapListValue(value));
        listMode = "notableLines";
      } else if (/hkrr|结构标签/.test(key)) {
        const hkrr = parseVideoDocMapHkrrLine(value);
        if (hkrr) current.hkrr.push(hkrr);
        listMode = "hkrr";
      } else if (/block|区块|字幕块/.test(key)) {
        current.blockIds.push(...parseVideoDocMapListValue(value));
        listMode = "blockIds";
      }
      return;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet && listMode) {
      const value = bullet[1].trim();
      if (listMode === "hkrr") {
        const hkrr = parseVideoDocMapHkrrLine(value);
        if (hkrr) current.hkrr.push(hkrr);
      } else if (listMode === "blockIds") {
        current.blockIds.push(...parseVideoDocMapListValue(value));
      } else {
        current[listMode].push(value);
      }
    }
  });
  flush();

  const normalized = nodes.map((node, index) => ({
    id: `video-node-${index + 1}`,
    sourceId: source.meta?.sourceId || "",
    ...node,
    title: node.title || fallbackVideoDocMapTitle(node.summary || node.notableLines.join(" "), index),
  }));
  return normalizeVideoDocMap({ title: title || source.label || "Video DocMap", summary, nodes: normalized }, source);
}

async function buildVideoDocMapWithModel(source) {
  const sourceId = String(source.meta?.sourceId || "");
  const outputLanguage = currentLanguage === "zh"
    ? "用简体中文写标题和摘要；人名、产品名、固定术语和原文短句保持原样。"
    : "Use English for titles and summaries; keep names, product names, fixed terms, and quoted transcript phrases as written.";
  const prompt = `Task: create a Video DocMap from transcript paragraphs.

Output contract:
- Return Markdown only.
- Do not return JSON.
- Do not wrap the answer in a code fence.
- Do not add any explanation before or after the map.
- Use this exact, easy-to-parse shape:

# Short source title
Summary: one sentence source summary

## HH:MM:SS,mmm --> HH:MM:SS,mmm | hook | Short segment label
Summary: what this segment does in the source
Claims:
- short factual point grounded in the transcript
Lines:
- exact short transcript phrase or sentence
HKRR:
- Knowledge: specific structural reason
Block IDs: 1, 2, 3

Rules:
- Use ONLY the transcript paragraphs below.
- This is source understanding, not a writing outline, not a script rewrite, and not advice.
- Build 6 to 12 chronological nodes. Merge nearby paragraphs when needed.
- Every node must have timeStart, timeEnd, title, summary, function, notableLines, hkrr, and blockIds.
- timeStart/timeEnd must copy exact SRT timestamps from the transcript when available.
- sourceId must be "${sourceId}" for every node.
- function must be exactly one of: hook, background, knowledge, experience, transition, callback, ending, other.
- notableLines must be exact short transcript phrases or sentences, not paraphrases.
- claims must be short factual points grounded in the transcript; omit the list items if none.
- Do not score, rank, judge quality, predict virality, or imitate the creator.
- HKRR labels are structural tags, not evaluations.
- HKRR type must be exactly one of: Happiness, Knowledge, Resonance, Rhythm.
- Use 0 to 3 HKRR labels per node. Do not force every label.
- Rhythm is not speaking speed; use it for turns, callbacks, density shifts, pauses, setup/payoff, or transitions.
- Before finalizing, silently check that every segment starts with ## and includes Summary, Lines, HKRR, and Block IDs.

Language:
${outputLanguage}

HKRR definitions:
${Object.entries(videoHkrrLabels).map(([label, definition]) => `- ${label}: ${definition}`).join("\n")}

Transcript paragraphs:
${clipContextContent(source.text, 14000)}`;
  try {
    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: [
        { role: "system", content: "You convert transcripts into Markdown Video DocMaps. Return Markdown only, never JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 3600,
      ai_system6_task_kind: "docmap",
      stream: false,
    }, getLongTaskSignal());
    const data = await readChatJson(response);
    return parseVideoDocMapMarkdown(data?.choices?.[0]?.message?.content || "", source);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(`video_docmap_model_failed: ${error.message || String(error)}`);
  }
}

window.AISystem6VideoDocMapLoaded = true;
window.AISystem6VideoHKRR = { labels: videoHkrrLabels, dataContract: videoDocMapDataContract };
