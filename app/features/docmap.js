// Feature module: docmap.
//
// Lazy: DocMap is a summoned tool, so the render/markmap/print/model code below
// loads on first use instead of at every boot. The synchronous entry layer that
// has to answer before the tool exists lives in app/core/docmap-entry.js.
//
// Callers outside this file must go through withDocMap() (see config.js), or
// guard on window.AISystem6DocMapLoaded for paths that can only be reached with
// the DocMap window already open.

// Loaded as a classic script; shares the AI System 6 global scope.

window.AISystem6DocMapLoaded = true;

let docMapZoomMode = "fit";
let docMapMarkmapInstance = null;
let docMapFitFrame = 0;
let docMapFitTimer = 0;
// Balanced (two-sided) layout fits/centers itself only after the mirror + center
// pass runs. These let fit and print wait for that instead of framing the raw
// one-sided Markmap render.
let docMapBalancedPending = false;
let docMapBalancedReadyPromise = null;
let docMapMarkmapLoadPromise = null;
let docMapMarkmapLoadFailed = false;


function loadDocMapScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    if (!existing) document.body.append(script);
  });
}

function ensureDocMapMarkmap() {
  docMapMarkmapLoadFailed = false;
  if (window.markmap?.Markmap && window.markmap?.Transformer) return Promise.resolve(true);
  if (!docMapMarkmapLoadPromise) {
    docMapMarkmapLoadPromise = loadDocMapScript("app/vendor/markmap/d3.min.js")
      .then(() => loadDocMapScript("app/vendor/markmap/markmap-view.js"))
      .then(() => loadDocMapScript("app/vendor/markmap/markmap-lib.js"))
      .then(() => true)
      .catch((error) => {
        console.warn("DocMap visual engine failed to load", error);
        docMapMarkmapLoadPromise = null;
        docMapMarkmapLoadFailed = true;
        return false;
      });
  }
  return docMapMarkmapLoadPromise;
}


function savedVideoDocMapForSource(source) {
  if (!source) return null;
  return chatFiles.find((file) => {
    if (!isInActiveProject(file) || file.type !== "text" || file.docMap?.kind !== "videoDocMap") return false;
    const meta = file.docMap.sourceMeta || {};
    return (source.sourceId && meta.sourceId === source.sourceId) || (source.fileName && meta.fileName === source.fileName);
  }) || null;
}


function videoDocMapForSwitcherSource(source) {
  const saved = savedVideoDocMapForSource(source);
  if (saved?.docMap) {
    const map = structuredClone(saved.docMap);
    map.status = "saved";
    return map;
  }
  const temporary = temporaryVideoDocMaps.get(source.sourceId);
  return temporary ? structuredClone(temporary) : null;
}


function docMapLayoutFor(map = currentDocMap) {
  return map?.layout === "balanced" ? "balanced" : "right";
}

function syncDocMapLayoutControls(map = currentDocMap) {
  const layout = docMapLayoutFor(map);
  if (!docMapLayoutToggleButton) return;
  docMapLayoutToggleButton.dataset.docmapLayout = layout;
  docMapLayoutButtons?.forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.docmapLayoutOption === layout ? "true" : "false");
  });
}

function docMapUsesCompactViewport() {
  return (docMapTreeEl?.getBoundingClientRect().width || window.innerWidth) <= 520;
}

async function focusDocMapRootForCompactView() {
  const inst = docMapMarkmapInstance;
  const root = inst?.state?.data;
  const svg = inst?.svg?.node?.();
  if (!inst || !root || !svg) return;
  if (docMapLayoutFor() === "balanced" && docMapBalancedPending) return;

  syncDocMapSvgSizeAttributes(inst);
  await inst.fit();
  await inst.rescale(docMapLayoutFor() === "balanced" ? 1.5 : 1.75);

  const padding = { left: 18, right: 18, top: 36, bottom: 36 };
  await inst.centerNode(root, padding);
  docMapZoomMode = "focus";
}

// d3-zoom's default extent reads `svg.width.baseVal.value`; without explicit
// width/height attributes an SVG root defaults to a relative 100% length, and
// reading it throws "Could not resolve relative length" whenever the map is
// fitted while its window has no resolved layout (e.g. a staged demo window).
// Keep absolute pixel attributes in sync so fit/zoom never read a relative
// length, while CSS still owns the visual size.
function syncDocMapSvgSizeAttributes(inst) {
  const svgNode = inst?.svg?.node?.();
  if (!svgNode) return;
  const rect = svgNode.getBoundingClientRect();
  const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 800;
  const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 600;
  svgNode.setAttribute("width", String(Math.round(width)));
  svgNode.setAttribute("height", String(Math.round(height)));
}

function queueDocMapFitToView(attempts = 6, { focusCompact = false } = {}) {
  docMapZoomMode = "fit";
  if (docMapFitFrame) cancelAnimationFrame(docMapFitFrame);
  if (docMapFitTimer) clearTimeout(docMapFitTimer);

  const fitNextFrame = (remaining) => {
    docMapFitFrame = requestAnimationFrame(() => {
      docMapFitFrame = 0;
      fitDocMapCanvasToView();
      if (remaining > 1) fitNextFrame(remaining - 1);
    });
  };

  fitNextFrame(Math.max(1, attempts));
  docMapFitTimer = setTimeout(async () => {
    docMapFitTimer = 0;
    fitDocMapCanvasToView();
    if (focusCompact && docMapUsesCompactViewport()) {
      await focusDocMapRootForCompactView();
    }
  }, 180);
}

function setCurrentDocMapLayout(layout) {
  const nextLayout = layout === "balanced" ? "balanced" : "right";
  docMapZoomMode = "fit";
  if (currentDocMap && currentDocMap.kind !== "videoDocMap") {
    currentDocMap.layout = nextLayout;
    const tab = activeDocMapTab();
    if (tab) {
      tab.state = { ...(tab.state || {}), map: structuredClone(currentDocMap), selectedNodeId: selectedDocMapNodeId || "central", zoomMode: "fit" };
      tab.updatedAt = new Date().toISOString();
    }
    renderDocMap();
  }
  syncDocMapLayoutControls();
  saveDeskState();
  queueDocMapFitToView();
}

function makeDocMapNodeId(indexPath) {
  return `node-${indexPath.join("-")}`;
}

function normalizeDocMapId(value, fallback) {
  return String(value || fallback || crypto.randomUUID())
    .trim()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback || crypto.randomUUID();
}

function flattenNestedDocMapNodes(rawNodes = [], sourceLabel = "", parentId = "central", path = []) {
  return rawNodes.flatMap((raw, index) => {
    const indexPath = [...path, index + 1];
    const id = normalizeDocMapId(raw?.id, makeDocMapNodeId(indexPath));
    const node = {
      id,
      parentId,
      title: String(raw?.title || raw?.label || `Branch ${indexPath.join(".")}`).trim().slice(0, 120),
      summary: String(raw?.summary || raw?.description || "").trim().slice(0, 1000),
      kind: String(raw?.kind || "section").trim().slice(0, 40),
      quote: String(raw?.quote || raw?.sourceQuote || "").trim().slice(0, 700),
      cluster: String(raw?.cluster || "").trim().slice(0, 40),
      importance: Number.isFinite(Number(raw?.importance)) ? Math.max(1, Math.min(5, Number(raw.importance))) : 3,
      sourceLabel,
    };
    return [node, ...flattenNestedDocMapNodes(Array.isArray(raw?.children) ? raw.children : [], sourceLabel, id, indexPath)];
  });
}

function normalizeDocMapNode(raw, index = 0, sourceLabel = "") {
  return {
    id: normalizeDocMapId(raw?.id, `node-${index + 1}`),
    title: String(raw?.title || raw?.label || `Node ${index + 1}`).trim().slice(0, 120),
    summary: String(raw?.summary || raw?.description || "").trim().slice(0, 1000),
    kind: String(raw?.kind || raw?.type || "point").trim().slice(0, 40),
    quote: String(raw?.quote || raw?.sourceQuote || raw?.evidence || "").trim().slice(0, 700),
    cluster: String(raw?.cluster || raw?.group || "").trim().slice(0, 40),
    importance: Number.isFinite(Number(raw?.importance)) ? Math.max(1, Math.min(5, Number(raw.importance))) : 3,
    sourceLabel,
  };
}

function normalizeDocMapEdge(raw, index = 0, validIds = new Set()) {
  const from = normalizeDocMapId(raw?.from || raw?.source, "");
  const to = normalizeDocMapId(raw?.to || raw?.target, "");
  if (!from || !to || from === to || !validIds.has(from) || !validIds.has(to)) return null;
  return {
    id: normalizeDocMapId(raw?.id, `edge-${index + 1}`),
    from,
    to,
    label: String(raw?.label || raw?.relation || raw?.type || "").trim().slice(0, 48),
    type: String(raw?.type || raw?.relation || "relates").trim().slice(0, 40),
  };
}

function buildDocMapGraphFromNestedNodes(rawNodes, sourceLabel) {
  const nodes = flattenNestedDocMapNodes(rawNodes, sourceLabel);
  const edges = nodes.map((node, index) => ({
    id: `edge-${index + 1}`,
    from: node.parentId || "central",
    to: node.id,
    label: node.parentId === "central" ? "topic" : "detail",
    type: node.parentId === "central" ? "topic" : "detail",
  }));
  return { nodes: nodes.map(({ parentId, ...node }) => node), edges };
}

function docMapChildCounts(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const counts = new Map();
  edges.forEach((edge) => {
    if (edge.from !== "central" && ids.has(edge.from) && ids.has(edge.to)) {
      counts.set(edge.from, (counts.get(edge.from) || 0) + 1);
    }
  });
  return counts;
}

function docMapNeedsSubBranches(nodes, edges) {
  if (nodes.length < 4) return false;
  const rootIds = new Set(edges.filter((edge) => edge.from === "central").map((edge) => edge.to));
  if (rootIds.size < 3) return false;
  const counts = docMapChildCounts(nodes, edges);
  const rootsWithChildren = [...rootIds].filter((id) => (counts.get(id) || 0) > 0).length;
  return rootsWithChildren < Math.min(3, rootIds.size) || !docMapHasMinimumHierarchy(nodes, edges);
}

function docMapHasMinimumHierarchy(nodes, edges) {
  const rootIds = new Set(edges.filter((edge) => edge.from === "central").map((edge) => edge.to));
  const childEdges = edges.filter((edge) => edge.from !== "central" && rootIds.has(edge.from));
  const rootsWithChildren = new Set(childEdges.map((edge) => edge.from)).size;
  const minimumChildEdges = Math.min(10, rootIds.size * 2);
  return rootIds.size >= 3
    && rootsWithChildren >= Math.min(3, rootIds.size)
    && childEdges.length >= minimumChildEdges;
}


function docMapCleanRebuildLine(line) {
  return (line || "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*]|\d+[.)]|[一二三四五六七八九十]+[、.])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function docMapShortRebuildText(text, max = 80) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function docMapInferRebuildTitle(text) {
  const lines = (text || "").split(/\n+/).map(docMapCleanRebuildLine).filter(Boolean);
  const title = lines.find((line) => line.length >= 4 && line.length <= 90) || lines[0] || t("untitled_project");
  return docMapShortRebuildText(title, 72);
}

function isGenericDocMapTitle(title) {
  const value = String(title || "")
    .replace(/[#*_[\]()（）【】「」『』"'“”‘’.,;:：。！？!?-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
  if (!value) return true;
  return [
    "central theme",
    "source specific central theme title",
    "short source title",
    "source title",
    "document title",
    "docmap",
    "reader",
    "untitled",
    "untitled project",
    "中心主题",
    "核心主题",
    "文档标题",
    "来源标题",
    "未命名",
    "未命名项目",
    "主题",
  ].includes(value);
}

function inferDocMapTitle(source, summary = "") {
  const sourceLabel = String(source?.label || "").trim();
  if (sourceLabel && !isGenericDocMapTitle(sourceLabel)) {
    return docMapShortRebuildText(sourceLabel, currentLanguage === "zh" ? 36 : 72);
  }
  const inferred = docMapInferRebuildTitle(source?.text || "");
  if (inferred && !isGenericDocMapTitle(inferred)) {
    return docMapShortRebuildText(inferred, currentLanguage === "zh" ? 36 : 72);
  }
  const summaryTitle = firstSentence(summary || source?.text || "", currentLanguage === "zh" ? 36 : 72);
  if (summaryTitle && !isGenericDocMapTitle(summaryTitle)) return summaryTitle;
  return currentLanguage === "zh" ? "来源主题" : "Source Theme";
}

function docMapInferRebuildSections(text, title) {
  const rawLines = String(text || "").split(/\n+/);
  const headingPattern = /^\s{0,3}(?:#{1,3}\s+|第.{1,12}[章节]|[一二三四五六七八九十]+[、.]\s+|\d+[.)]\s+)/;
  const headings = rawLines
    .filter((line) => headingPattern.test(line))
    .map(docMapCleanRebuildLine)
    .filter((line) => line && line !== title && line.length <= 90);

  if (headings.length >= 3) return headings.slice(0, 7);

  const paragraphs = getRebuildParagraphs(text);
  const maxLabel = currentLanguage === "zh" ? 30 : 54;
  const sections = paragraphs.slice(0, 6).map((paragraph, index) => {
    const sentence = paragraph.split(/[。！？.!?]/)[0] || paragraph;
    const label = docMapShortRebuildText(sentence, maxLabel);
    return label || (currentLanguage === "zh" ? `段落 ${index + 1}` : `Section ${index + 1}`);
  });

  return sections.length ? sections : [title];
}

function cleanDocMapQuoteLine(line) {
  return String(line || "")
    .replace(/^>\s*/, "")
    .replace(/^(?:来源摘录|source quote|quote|evidence)\s*[:：]\s*/i, "")
    .trim();
}

function splitDocMapMarkdownLabel(raw, labelLimit = currentLanguage === "zh" ? 24 : 44) {
  const clean = docMapCleanRebuildLine(raw)
    .replace(/^#+\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return { title: "", summary: "" };
  const colon = /^(.{2,48}?)[：:]\s*(.+)$/.exec(clean);
  if (colon) {
    return {
      title: docMapShortRebuildText(colon[1], labelLimit),
      summary: docMapShortRebuildText(colon[2], currentLanguage === "zh" ? 120 : 180),
    };
  }
  const dash = /^(.{2,48}?)\s+[—-]\s+(.+)$/.exec(clean);
  if (dash) {
    return {
      title: docMapShortRebuildText(dash[1], labelLimit),
      summary: docMapShortRebuildText(dash[2], currentLanguage === "zh" ? 120 : 180),
    };
  }
  const sentence = firstSentence(clean, labelLimit);
  return {
    title: sentence,
    summary: sentence === clean ? "" : docMapShortRebuildText(clean, currentLanguage === "zh" ? 120 : 180),
  };
}

function docMapNodeFromMarkdownItem(item, indexPath, sourceLabel) {
  return {
    id: makeDocMapNodeId(indexPath),
    title: docMapShortRebuildText(item.title, indexPath.length === 1 ? 70 : 58),
    summary: docMapShortRebuildText(item.summary || item.title, currentLanguage === "zh" ? 90 : 130),
    kind: indexPath.length === 1 ? "branch" : "detail",
    quote: docMapShortRebuildText(item.quote || "", 700),
    cluster: docMapShortRebuildText(item.cluster || item.title, 40),
    importance: Math.max(1, 6 - indexPath.length),
    sourceLabel,
  };
}

function parseDocMapMarkdown(markdown, source) {
  const clean = stripDocMapMarkdownFence(markdown);
  const lines = clean.split(/\r?\n/);
  const root = {
    title: "",
    summary: "",
    quote: "",
    children: [],
  };
  const stack = [{ level: 0, item: root }];
  let lastItem = root;
  let activeHeadingLevel = 0;

  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, "  ").trimEnd();
    const trimmed = line.trim();
    if (!trimmed) return;

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const labelLimit = level === 1 ? (currentLanguage === "zh" ? 34 : 90) : level === 2 ? 34 : 24;
      const { title, summary } = splitDocMapMarkdownLabel(heading[2], labelLimit);
      if (level === 1 && !root.title) {
        root.title = title;
        root.summary = root.summary || summary;
        lastItem = root;
        activeHeadingLevel = 0;
        return;
      }
      const item = { title, summary, quote: "", children: [] };
      const itemLevel = Math.max(1, level - 1);
      while (stack.length && stack[stack.length - 1].level >= itemLevel) stack.pop();
      const parent = stack[stack.length - 1]?.item || root;
      parent.children.push(item);
      stack.push({ level: itemLevel, item });
      lastItem = item;
      activeHeadingLevel = itemLevel;
      return;
    }

    const bullet = /^(\s*)[-*+]\s+(.+)$/.exec(rawLine.replace(/\t/g, "  "));
    if (bullet) {
      const indent = bullet[1].length;
      const itemLevel = Math.max(1, activeHeadingLevel + Math.floor(indent / 2) + 1);
      const { title, summary } = splitDocMapMarkdownLabel(bullet[2], itemLevel === 1 ? 34 : 24);
      const item = { title, summary, quote: "", children: [] };
      while (stack.length && stack[stack.length - 1].level >= itemLevel) stack.pop();
      const parent = stack[stack.length - 1]?.item || root;
      parent.children.push(item);
      stack.push({ level: itemLevel, item });
      lastItem = item;
      return;
    }

    if (/^>\s*/.test(trimmed)) {
      const quote = cleanDocMapQuoteLine(trimmed);
      if (quote && lastItem) {
        lastItem.quote = lastItem.quote ? `${lastItem.quote} ${quote}` : quote;
      }
      return;
    }

    if (/^(?:摘要|summary)\s*[:：]\s*/i.test(trimmed) && lastItem) {
      lastItem.summary = trimmed.replace(/^(?:摘要|summary)\s*[:：]\s*/i, "").trim();
      return;
    }

    if (!root.summary && root.children.length === 0) {
      root.summary = trimmed;
    } else if (lastItem && lastItem !== root && !lastItem.summary) {
      lastItem.summary = trimmed;
    }
  });

  const nodes = [];
  const edges = [];
  const visit = (item, parentId, path, cluster = "") => {
    const node = docMapNodeFromMarkdownItem({ ...item, cluster: cluster || item.title }, path, source.label);
    nodes.push(node);
    edges.push({
      id: `edge-${path.join("-")}`,
      from: parentId,
      to: node.id,
      label: parentId === "central" ? "topic" : "detail",
      type: parentId === "central" ? "topic" : "detail",
    });
    item.children.forEach((child, index) => visit(child, node.id, [...path, index + 1], cluster || item.title));
  };

  root.children.forEach((child, index) => visit(child, "central", [index + 1]));
  const title = isGenericDocMapTitle(root.title)
    ? inferDocMapTitle(source, root.summary)
    : docMapShortRebuildText(root.title, currentLanguage === "zh" ? 36 : 72);
  return {
    id: crypto.randomUUID(),
    title,
    central: {
      id: "central",
      title,
      summary: docMapShortRebuildText(root.summary || firstSentence(source.text, currentLanguage === "zh" ? 120 : 180), 1000),
      kind: "central",
      quote: "",
      cluster: "",
      importance: 5,
      sourceLabel: source.label,
    },
    sourceLabel: source.label,
    sourceScope: source.scope,
    sourceText: source.text,
    sourceMeta: source.meta || null,
    layout: "right",
    status: "temporary",
    traceability: source.scope === "clipboard" ? "partial" : "full",
    createdAt: new Date().toISOString(),
    markdown: clean,
    nodes,
    edges,
    clusters: [...new Set(nodes.filter((node) => node.kind === "branch").map((node) => node.cluster).filter(Boolean))].slice(0, 8),
  };
}


function parseExportedDocMapNodeLine(line) {
  const match = /^-\s+(.+)$/.exec(String(line || "").trim());
  if (!match) return null;
  const { title, summary } = splitDocMapMarkdownLabel(match[1], currentLanguage === "zh" ? 34 : 72);
  if (!title) return null;
  return {
    title,
    summary: summary || title,
    kind: "point",
    quote: "",
    cluster: "",
    importance: 3,
  };
}

function parseExportedDocMapMarkdown(markdown, source) {
  const clean = stripDocMapMarkdownFence(markdown);
  const lines = clean.split(/\r?\n/);
  const relationStart = lines.findIndex((line) => /^##\s+Relations\s*$/i.test(line.trim()));
  if (relationStart < 0) return null;

  const head = lines.slice(0, relationStart);
  const relationLines = lines.slice(relationStart + 1);
  const titleLine = head.find((line) => /^#\s+DocMap\s*[:：]/i.test(line.trim())) || "";
  const title = docMapShortRebuildText(
    titleLine.replace(/^#\s+DocMap\s*[:：]\s*/i, "").trim() || source.label || t("docmap"),
    currentLanguage === "zh" ? 36 : 72
  );
  const sourceLine = head.find((line) => /^Source\s*[:：]/i.test(line.trim())) || "";
  const traceLine = head.find((line) => /^Trace\s*[:：]/i.test(line.trim())) || "";
  const layoutLine = head.find((line) => /^Layout\s*[:：]/i.test(line.trim())) || "";
  const centralLine = head.find((line) => /^Central\s*[:：]/i.test(line.trim())) || "";

  const relations = relationLines
    .map((line, index) => {
      const match = /^-\s+([^\s]+)\s*->\s*([^\s:：]+)(?:\s*[:：]\s*(.+))?$/.exec(line.trim());
      if (!match) return null;
      return {
        id: `edge-import-${index + 1}`,
        from: normalizeDocMapId(match[1], ""),
        to: normalizeDocMapId(match[2], ""),
        label: String(match[3] || "").trim().slice(0, 48),
        type: String(match[3] || "relates").trim().slice(0, 40),
      };
    })
    .filter((edge) => edge?.from && edge?.to && edge.from !== edge.to);
  if (!relations.length) return null;

  const nodeIdsInOrder = [];
  relations.forEach((edge) => {
    [edge.from, edge.to].forEach((id) => {
      if (id !== "central" && !nodeIdsInOrder.includes(id)) nodeIdsInOrder.push(id);
    });
  });

  const parsedNodes = [];
  head.forEach((line) => {
    if (!/^\s{0,2}-\s+/.test(line)) return;
    const trimmed = line.trim();
    if (/^-\s+(?:Type|Cluster|Related|来源摘录|Source Quote)\s*[:：]/i.test(trimmed)) return;
    const node = parseExportedDocMapNodeLine(trimmed);
    if (node) parsedNodes.push(node);
  });
  if (!parsedNodes.length) return null;

  let activeNode = null;
  let parsedNodeCursor = 0;
  head.forEach((line) => {
    if (!/^\s{0,2}-\s+/.test(line)) return;
    const trimmed = line.trim();
    if (!/^-\s+(?:Type|Cluster|来源摘录|Source Quote)\s*[:：]/i.test(trimmed)) {
      activeNode = parsedNodes[parsedNodeCursor] || activeNode;
      parsedNodeCursor += activeNode ? 1 : 0;
      return;
    }
    if (!activeNode) return;
    const meta = /^-\s+([^:：]+)\s*[:：]\s*(.+)$/.exec(trimmed);
    if (!meta) return;
    const key = meta[1].trim().toLowerCase();
    const value = meta[2].trim();
    if (key === "type") activeNode.kind = value.slice(0, 40);
    if (key === "cluster") activeNode.cluster = value.slice(0, 40);
    if (key === "source quote" || key === "来源摘录") activeNode.quote = value.slice(0, 700);
  });

  const nodes = parsedNodes.slice(0, nodeIdsInOrder.length).map((node, index) => {
    return {
      id: nodeIdsInOrder[index] || `node-import-${index + 1}`,
      ...node,
      kind: node.kind || (relations.some((edge) => edge.from === "central" && edge.to === nodeIdsInOrder[index]) ? "branch" : "detail"),
      cluster: node.cluster || node.title,
      sourceLabel: source.label,
    };
  });
  const validIds = new Set(["central", ...nodes.map((node) => node.id)]);
  const edges = relations
    .filter((edge) => validIds.has(edge.from) && validIds.has(edge.to))
    .map((edge, index) => ({
      ...edge,
      id: `edge-${index + 1}`,
      type: edge.from === "central" ? "topic" : "detail",
      label: edge.label || (edge.from === "central" ? "topic" : "detail"),
    }));
  if (!nodes.length || !edges.length) return null;

  const traceText = traceLine.replace(/^Trace\s*[:：]\s*/i, "").trim();
  const sourceLabel = sourceLine.replace(/^Source\s*[:：]\s*/i, "").trim() || source.label;
  return {
    id: crypto.randomUUID(),
    title,
    central: {
      id: "central",
      title,
      summary: docMapShortRebuildText(centralLine.replace(/^Central\s*[:：]\s*/i, "").trim() || title, 1000),
      kind: "central",
      quote: "",
      cluster: "",
      importance: 5,
      sourceLabel,
    },
    sourceLabel,
    sourceScope: source.scope,
    sourceText: source.text,
    sourceMeta: source.meta || null,
    layout: /balanced|左右/i.test(layoutLine) ? "balanced" : "right",
    status: "saved",
    traceability: /完整|full/i.test(traceText) ? "full" : /无|none/i.test(traceText) ? "none" : "partial",
    createdAt: new Date().toISOString(),
    nodes,
    edges,
    clusters: [...new Set(nodes.filter((node) => node.kind === "branch").map((node) => node.cluster).filter(Boolean))].slice(0, 8),
  };
}

function restoreDocMapFromMarkdown(markdown, options = {}) {
  const clean = stripDocMapMarkdownFence(markdown);
  if (!clean) return null;
  const source = {
    label: options.label || t("docmap"),
    scope: options.scope || "documents",
    text: clean,
    meta: options.meta || null,
  };
  const exportedMap = isExportedDocMapMarkdown(clean) ? parseExportedDocMapMarkdown(clean, source) : null;
  if (exportedMap) return exportedMap;
  if (!options.allowGeneric) return null;
  if (!/^#\s+/.test(clean) || !/^##\s+/m.test(clean)) return null;
  const map = parseDocMapMarkdown(clean, source);
  if (!map?.nodes?.length || !map?.edges?.length) return null;
  return {
    ...map,
    status: "saved",
    traceability: "partial",
  };
}

function makeDocMapSupplementNode(parent, index, quote, sourceLabel, depth = 2) {
  const titleLimit = depth <= 2 ? (currentLanguage === "zh" ? 24 : 42) : (currentLanguage === "zh" ? 18 : 34);
  const title = firstSentence(quote, titleLimit) || `${parent.title} detail ${index + 1}`;
  return {
    id: normalizeDocMapId(`${parent.id}-detail-${index + 1}`, `${parent.id}-detail-${index + 1}`),
    title,
    summary: firstSentence(quote, depth <= 2 ? (currentLanguage === "zh" ? 72 : 110) : (currentLanguage === "zh" ? 48 : 84)),
    kind: "detail",
    quote: docMapShortRebuildText(quote, currentLanguage === "zh" ? 150 : 220),
    cluster: parent.cluster || parent.title,
    importance: Math.max(1, Math.min(4, Number(parent.importance || 3) - 1)),
    sourceLabel,
  };
}

function sourceLooksLikeAppleAccessibilityNews(source) {
  const text = `${source.label || ""}\n${source.text || ""}`.toLowerCase();
  return /apple intelligence/.test(text) && /voiceover|magnifier|accessibility reader|generated subtitles|hikawa|wheelchair/.test(text);
}

function findDocMapQuote(text, patterns, fallback = "") {
  const paragraphs = getRebuildParagraphs(text);
  const found = paragraphs.find((paragraph) =>
    patterns.some((pattern) => pattern.test(paragraph))
  );
  return found || fallback || paragraphs[0] || text.slice(0, 500);
}

function docMapTemplateNode(id, title, summary, kind, cluster, quote, importance, sourceLabel) {
  return {
    id: normalizeDocMapId(id, id),
    title,
    summary,
    kind,
    quote: docMapShortRebuildText(quote, currentLanguage === "zh" ? 170 : 240),
    cluster,
    importance,
    sourceLabel,
  };
}

function buildProductNewsDocMap(source) {
  if (!sourceLooksLikeAppleAccessibilityNews(source)) {
    return buildReaderStructuredDocMap(source, "product");
  }
  const zh = currentLanguage === "zh";
  const title = docMapInferRebuildTitle(source.text);
  const text = source.text || "";
  const lead = findDocMapQuote(text, [/apple intelligence/i, /accessibility/i]);
  const label = source.label;
  const rootTitle = zh ? "Apple Intelligence 驱动的无障碍功能更新" : "Apple Intelligence accessibility updates";
  const central = {
    id: "central",
    title: rootTitle,
    summary: zh
      ? "把发布背景、核心理念、功能族、平台覆盖和硬件生态组织成可追溯的来源地图。"
      : "A source map of announcement context, core promise, feature families, platform coverage, and hardware ecosystem.",
    kind: "central",
    quote: "",
    cluster: "",
    importance: 5,
    sourceLabel: label,
  };

  const branchSpecs = [
    {
      id: "release-context",
      title: zh ? "发布背景" : "Announcement Context",
      summary: zh ? "说明新闻稿来源、发布时间、主题和上线节奏。" : "Identifies the source, timing, topic, and rollout frame.",
      cluster: zh ? "发布背景" : "Context",
      quote: findDocMapQuote(text, [/newsroom/i, /may\s+\d+/i, /later this year/i], lead),
      children: [
        [zh ? "Apple Newsroom 新闻稿" : "Apple Newsroom release", /newsroom|apple/i],
        [zh ? "上线时间与范围" : "Rollout timing and scope", /later this year|available|availability|今年晚些时候/i],
      ],
    },
    {
      id: "core-promise",
      title: zh ? "核心理念" : "Core Promise",
      summary: zh ? "Apple Intelligence 被定位为增强输入、探索和个性化的底层能力。" : "Apple Intelligence is positioned as an underlying accessibility amplifier.",
      cluster: zh ? "核心理念" : "Core",
      quote: lead,
      children: [
        [zh ? "增强日常无障碍功能" : "Enhance everyday accessibility", /apple intelligence|accessibility/i],
        [zh ? "隐私与端侧处理" : "Privacy and on-device processing", /privacy|on-device|private/i],
      ],
    },
    {
      id: "visual-access",
      title: zh ? "视觉辅助" : "Visual Access",
      summary: zh ? "VoiceOver 与 Magnifier 让用户理解屏幕内容和摄像头画面。" : "VoiceOver and Magnifier help users understand images, documents, and surroundings.",
      cluster: zh ? "视觉辅助" : "Visual",
      quote: findDocMapQuote(text, [/voiceover|magnifier|image explorer|live recognition/i], lead),
      children: [
        [zh ? "VoiceOver Image Explorer" : "VoiceOver Image Explorer", /voiceover|image explorer/i],
        [zh ? "Live Recognition 摄像头提问" : "Live Recognition camera questions", /live recognition|camera|viewfinder/i],
        [zh ? "Magnifier 高对比探索" : "Magnifier visual exploration", /magnifier|flashlight|zoom/i],
      ],
    },
    {
      id: "voice-control",
      title: zh ? "语音与操作控制" : "Voice and Control",
      summary: zh ? "Voice Control 从记命令转向自然语言描述界面目标。" : "Voice Control shifts from memorized commands to natural-language UI control.",
      cluster: zh ? "输入控制" : "Input",
      quote: findDocMapQuote(text, [/voice control|natural language|buttons|controls/i], lead),
      children: [
        [zh ? "自然语言导航" : "Natural-language navigation", /natural language|voice control/i],
        [zh ? "描述可见控件" : "Describe visible controls", /button|folder|label|number|see/i],
      ],
    },
    {
      id: "reading-understanding",
      title: zh ? "阅读与理解" : "Reading and Understanding",
      summary: zh ? "Accessibility Reader 面向复杂文档、摘要、翻译和格式偏好。" : "Accessibility Reader handles complex documents, summaries, translation, and formatting preferences.",
      cluster: zh ? "阅读理解" : "Reading",
      quote: findDocMapQuote(text, [/accessibility reader|summary|translation|tables|columns/i], lead),
      children: [
        [zh ? "复杂文档阅读" : "Complex document reading", /scientific|columns|tables|images|complex/i],
        [zh ? "摘要与翻译" : "Summaries and translation", /summary|translation|translate/i],
        [zh ? "保留阅读偏好" : "Preserve reading preferences", /font|color|format/i],
      ],
    },
    {
      id: "captions-media",
      title: zh ? "听觉辅助与字幕" : "Hearing and Captions",
      summary: zh ? "Generated Subtitles 为无字幕视频生成转写并覆盖多个 Apple 平台。" : "Generated Subtitles transcribe uncaptionsed videos across Apple platforms.",
      cluster: zh ? "字幕" : "Captions",
      quote: findDocMapQuote(text, [/generated subtitles|captions|transcriptions|spoken audio/i], lead),
      children: [
        [zh ? "无字幕视频转写" : "Transcribe videos without captions", /generated subtitles|captions|transcriptions/i],
        [zh ? "跨设备覆盖" : "Cross-device coverage", /iphone|ipad|mac|apple tv|vision pro/i],
      ],
    },
    {
      id: "hardware-ecosystem",
      title: zh ? "硬件与生态扩展" : "Hardware and Ecosystem",
      summary: zh ? "Vision Pro 轮椅控制、Hikawa 配件和其他系统更新扩展生态边界。" : "Vision Pro wheelchair control, Hikawa accessories, and system updates extend the ecosystem.",
      cluster: zh ? "硬件生态" : "Hardware",
      quote: findDocMapQuote(text, [/wheelchair|hikawa|grip|stand|vision pro|access controller/i], lead),
      children: [
        [zh ? "Vision Pro 轮椅控制" : "Vision Pro wheelchair control", /wheelchair|vision pro|eye tracking/i],
        [zh ? "Hikawa Grip & Stand" : "Hikawa Grip & Stand", /hikawa|grip|stand|magsafe/i],
        [zh ? "其他系统更新" : "Additional system updates", /vehicle motion cues|face gestures|touch accommodations|hearing|facetime|sony/i],
      ],
    },
  ];

  const nodes = [];
  const edges = [];
  branchSpecs.forEach((branch, branchIndex) => {
    const branchNode = docMapTemplateNode(
      branch.id,
      branch.title,
      branch.summary,
      "branch",
      branch.cluster,
      branch.quote,
      5 - Math.min(2, branchIndex % 3),
      label
    );
    nodes.push(branchNode);
    edges.push({
      id: `edge-central-${branch.id}`,
      from: "central",
      to: branchNode.id,
      label: branch.cluster,
      type: "topic",
    });
    branch.children.forEach(([childTitle, pattern], childIndex) => {
      const quote = findDocMapQuote(text, [pattern], branch.quote);
      const child = docMapTemplateNode(
        `${branch.id}-${childIndex + 1}`,
        childTitle,
        firstSentence(quote, zh ? 70 : 105),
        "detail",
        branch.cluster,
        quote,
        3,
        label
      );
      nodes.push(child);
      edges.push({
        id: `edge-${branch.id}-${childIndex + 1}`,
        from: branchNode.id,
        to: child.id,
        label: zh ? "子项" : "detail",
        type: "detail",
      });
    });
  });

  return {
    id: crypto.randomUUID(),
    title,
    central,
    sourceLabel: label,
    sourceScope: source.scope,
    sourceText: source.text,
    sourceMeta: source.meta || null,
    layout: "right",
    status: "temporary",
    traceability: source.scope === "clipboard" ? "partial" : "full",
    createdAt: new Date().toISOString(),
    nodes,
    edges,
    clusters: branchSpecs.map((branch) => branch.cluster),
  };
}

function classifyReaderDocMapSource(source) {
  const text = `${source.label || ""}\n${source.text || ""}`.toLowerCase();
  if (/how to|guide|tutorial|步骤|指南|教程|操作|setup|install|configure/.test(text)) return "guide";
  if (/study|research|paper|report|survey|methodology|findings|研究|报告|调查|方法|数据/.test(text)) return "report";
  if (/interview|q&a|conversation|问答|采访|访谈/.test(text)) return "interview";
  if (/top\s+\d+|\d+\s+(?:ways|tips|things)|清单|列表|推荐|要点/.test(text)) return "list";
  if (/opinion|analysis|essay|commentary|观点|评论|分析|随笔/.test(text)) return "essay";
  if (/press release|unveils|announces|launches|previewed|new features|发布|宣布|推出|上线|更新/.test(text)) return "product";
  if (/breaking|reported|according to|said|news|报道|消息|新闻|表示/.test(text)) return "news";
  return "article";
}

function readerDocMapBranchLabels(kind) {
  const zh = currentLanguage === "zh";
  const maps = {
    product: zh
      ? ["发布背景", "核心承诺", "功能/产品族", "用户场景", "平台与范围", "限制与可用性", "生态与后续"]
      : ["Announcement Context", "Core Promise", "Feature Families", "User Scenarios", "Platforms and Scope", "Limits and Availability", "Ecosystem and Next Steps"],
    guide: zh
      ? ["目标与适用人群", "前置条件", "核心步骤", "关键操作", "常见错误", "验证结果", "下一步"]
      : ["Goal and Audience", "Prerequisites", "Core Steps", "Key Operations", "Common Pitfalls", "Verify Result", "Next Steps"],
    report: zh
      ? ["研究问题", "背景与方法", "关键发现", "数据/证据", "解释与影响", "限制", "结论"]
      : ["Research Question", "Background and Method", "Key Findings", "Data and Evidence", "Interpretation and Impact", "Limitations", "Conclusion"],
    interview: zh
      ? ["人物与场景", "核心问题", "主要观点", "关键故事", "冲突/转折", "可引用句", "结尾意义"]
      : ["Person and Setting", "Core Questions", "Main Views", "Key Stories", "Tensions and Turns", "Quotable Lines", "Closing Meaning"],
    list: zh
      ? ["总主题", "筛选标准", "重点条目", "比较维度", "适用场景", "注意事项", "行动建议"]
      : ["Main Theme", "Selection Criteria", "Key Items", "Comparison Dimensions", "Use Cases", "Cautions", "Action Advice"],
    essay: zh
      ? ["中心论点", "问题背景", "论证路径", "例子/证据", "反方与张力", "风格动作", "结论含义"]
      : ["Central Claim", "Problem Context", "Argument Path", "Examples and Evidence", "Counterpoint and Tension", "Style Moves", "Implications"],
    news: zh
      ? ["新闻事实", "时间线", "相关人物/机构", "原因背景", "影响范围", "不确定点", "后续观察"]
      : ["News Facts", "Timeline", "People and Organizations", "Causes and Context", "Impact", "Uncertainties", "What to Watch"],
    article: zh
      ? ["主线", "背景", "关键论点", "证据与例子", "限制/反面", "意义", "可迁移结构"]
      : ["Through-line", "Background", "Key Points", "Evidence and Examples", "Limits and Counterpoints", "Meaning", "Reusable Structure"],
  };
  return maps[kind] || maps.article;
}

function buildReaderStructuredDocMap(source, forcedKind = "") {
  const zh = currentLanguage === "zh";
  const kind = forcedKind || classifyReaderDocMapSource(source);
  const title = docMapInferRebuildTitle(source.text);
  const paragraphs = getRebuildParagraphs(source.text);
  const sections = docMapInferRebuildSections(source.text, title);
  const claims = inferRebuildClaims(paragraphs);
  const labels = readerDocMapBranchLabels(kind);
  const sourceLabel = source.label;
  const lead = paragraphs[0] || source.text.slice(0, 500);
  const central = {
    id: "central",
    title,
    summary: firstSentence(lead, zh ? 120 : 180),
    kind: "central",
    quote: "",
    cluster: "",
    importance: 5,
    sourceLabel,
  };
  const nodes = [];
  const edges = [];

  labels.forEach((label, branchIndex) => {
    const paragraph = paragraphs[branchIndex] || paragraphs[branchIndex % Math.max(1, paragraphs.length)] || lead;
    const section = sections[branchIndex] || label;
    const branch = docMapTemplateNode(
      `reader-${kind}-${branchIndex + 1}`,
      label,
      section === label ? firstSentence(paragraph, zh ? 70 : 105) : section,
      "branch",
      label,
      paragraph,
      branchIndex < 3 ? 5 : 4,
      sourceLabel
    );
    nodes.push(branch);
    edges.push({
      id: `edge-central-${branch.id}`,
      from: "central",
      to: branch.id,
      label,
      type: "topic",
    });

    const childSources = [
      claims[branchIndex],
      paragraphs[branchIndex * 2],
      paragraphs[branchIndex * 2 + 1],
    ].filter(Boolean);
    const safeChildSources = childSources.length ? childSources : [paragraph];
    safeChildSources.slice(0, branchIndex < 4 ? 2 : 1).forEach((childText, childIndex) => {
      const child = docMapTemplateNode(
        `${branch.id}-detail-${childIndex + 1}`,
        firstSentence(childText, zh ? 26 : 46) || (zh ? `子项 ${childIndex + 1}` : `Detail ${childIndex + 1}`),
        firstSentence(childText, zh ? 76 : 115),
        childIndex === 0 && claims[branchIndex] ? "claim" : "detail",
        label,
        childText,
        3,
        sourceLabel
      );
      nodes.push(child);
      edges.push({
        id: `edge-${branch.id}-${childIndex + 1}`,
        from: branch.id,
        to: child.id,
        label: zh ? "子项" : "detail",
        type: "detail",
      });
    });
  });

  return {
    id: crypto.randomUUID(),
    title,
    central,
    sourceLabel,
    sourceScope: source.scope,
    sourceText: source.text,
    sourceMeta: source.meta || null,
    layout: "right",
    status: "temporary",
    traceability: source.scope === "clipboard" ? "partial" : "full",
    createdAt: new Date().toISOString(),
    nodes,
    edges,
    clusters: labels,
  };
}

function ensureDocMapSubBranches(nodes, edges, source) {
  if (!docMapNeedsSubBranches(nodes, edges)) return { nodes, edges };
  const paragraphs = getRebuildParagraphs(source.text);
  if (!paragraphs.length) return { nodes, edges };
  const rootIds = edges.filter((edge) => edge.from === "central").map((edge) => edge.to);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nextNodes = [...nodes];
  const nextEdges = [...edges];
  let paragraphIndex = 0;
  let added = 0;
  const childrenByParent = new Map();
  const refreshChildren = () => {
    childrenByParent.clear();
    nextEdges.forEach((edge) => {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
      const siblings = childrenByParent.get(edge.from) || [];
      const child = nodeById.get(edge.to);
      if (child) siblings.push(child);
      childrenByParent.set(edge.from, siblings);
    });
  };
  const addSupplementChild = (parent, depth = 2) => {
    if (!parent) return null;
    const quote = paragraphs[paragraphIndex % paragraphs.length];
    paragraphIndex += 1;
    if (!quote) return null;
    let index = (childrenByParent.get(parent.id) || []).length;
    let child = makeDocMapSupplementNode(parent, index, quote, source.label, depth);
    while (nodeById.has(child.id)) {
      index += 1;
      child = makeDocMapSupplementNode(parent, index, quote, source.label, depth);
    }
    nodeById.set(child.id, child);
    nextNodes.push(child);
    nextEdges.push({
      id: `edge-${parent.id}-detail-${index + 1}`,
      from: parent.id,
      to: child.id,
      label: currentLanguage === "zh" ? "细节" : "detail",
      type: "detail",
    });
    const siblings = childrenByParent.get(parent.id) || [];
    siblings.push(child);
    childrenByParent.set(parent.id, siblings);
    added += 1;
    return child;
  };
  refreshChildren();

  rootIds.forEach((rootId) => {
    const parent = nodeById.get(rootId);
    if (!parent) return;
    while ((childrenByParent.get(rootId) || []).length < 2 && nextNodes.length < 36) {
      addSupplementChild(parent, 2);
    }
  });

  if (!docMapHasMinimumHierarchy(nextNodes, nextEdges)) {
    refreshChildren();
    rootIds.forEach((rootId) => {
      const parent = nodeById.get(rootId);
      while ((childrenByParent.get(rootId) || []).length < 3 && nextNodes.length < 42) {
        addSupplementChild(parent, 2);
      }
    });
  }

  if (!docMapHasMinimumHierarchy(nextNodes, nextEdges)) {
    const fallbackParents = nextNodes
      .filter((node) => node.id !== "central" && (childrenByParent.get(node.id) || []).length === 0)
      .slice(0, 8);
    fallbackParents.forEach((node) => {
      if (nextNodes.length < 48) {
        addSupplementChild(node, 2);
      }
    });
  }

  return added ? { nodes: nextNodes, edges: nextEdges } : { nodes, edges };
}

function normalizeDocMap(data, source) {
  const rawTitle = String(data?.central?.title || data?.title || "").trim();
  const title = isGenericDocMapTitle(rawTitle)
    ? inferDocMapTitle(source, data?.central?.summary || data?.summary || "")
    : docMapShortRebuildText(rawTitle, currentLanguage === "zh" ? 36 : 72);
  const central = {
    id: "central",
    title,
    summary: String(data?.central?.summary || data?.summary || "").trim().slice(0, 1000),
    kind: "central",
    quote: "",
    cluster: "",
    importance: 5,
    sourceLabel: source.label,
  };
  let nodes = [];
  let edges = [];
  const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  if (rawNodes.some((node) => Array.isArray(node?.children))) {
    ({ nodes, edges } = buildDocMapGraphFromNestedNodes(rawNodes, source.label));
  } else {
    nodes = rawNodes.map((node, index) => normalizeDocMapNode(node, index, source.label));
    const validIds = new Set(["central", ...nodes.map((node) => node.id)]);
    edges = Array.isArray(data?.edges)
      ? data.edges.map((edge, index) => normalizeDocMapEdge(edge, index, validIds)).filter(Boolean)
      : [];
    const incoming = new Set(edges.map((edge) => edge.to));
    nodes.forEach((node, index) => {
      if (!incoming.has(node.id)) {
        edges.push({
          id: `edge-central-${index + 1}`,
          from: "central",
          to: node.id,
          label: node.cluster || "topic",
          type: "topic",
        });
      }
    });
  }
  if (!nodes.length) throw new Error("docmap_empty_model_output");
  const clusters = Array.isArray(data?.clusters)
    ? data.clusters.map((cluster) => String(cluster?.name || cluster).trim()).filter(Boolean).slice(0, 8)
    : [...new Set(nodes.map((node) => node.cluster).filter(Boolean))].slice(0, 8);
  return {
    id: crypto.randomUUID(),
    title,
    central,
    sourceLabel: source.label,
    sourceScope: source.scope,
    sourceText: source.text,
    sourceMeta: source.meta || null,
    layout: "right",
    status: "temporary",
    traceability: source.scope === "clipboard" ? "partial" : "full",
    createdAt: new Date().toISOString(),
    nodes,
    edges,
    clusters,
  };
}

function firstSentence(text, limit = 160) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const sentence = value.split(/(?<=[。！？.!?])\s+/)[0] || value;
  return docMapShortRebuildText(sentence, limit);
}

function docMapOutputLanguageInstruction() {
  return currentLanguage === "zh"
    ? "Write labels and summaries in Simplified Chinese. Translate source ideas into natural Chinese when useful; keep names, products, quoted terms, and URLs as written."
    : "Write labels and summaries in English. Keep names, products, quoted terms, and URLs as written.";
}

function docMapChildGuidance() {
  return [
    "- Each top-level branch must have 2 to 3 second-level child nodes.",
    "- Add at most 1 nested detail under a child only when it clarifies a key source fact.",
    "- Do not create fourth-level bullets or standalone evidence/source nodes.",
    "- Keep every node short: first-level labels 6-12 Chinese characters, second-level 8-18, optional detail 8-16.",
    "- Maximum depth: # title, ## branch, - child, nested - detail.",
  ].join("\n");
}

function docMapMindMapPrompt(source, options = {}) {
  const previousMap = options.previousMap
    ? `待修复的弱 DocMap（只作为问题参考，不要照抄错误结构）：\n${clipContextContent(formatDocMapMarkdown(options.previousMap), 3500)}\n\n`
    : "";
  const sourceLimit = options.previousMap ? 9000 : 7200;
  return `把来源材料压缩成 DocMap。DocMap 用来理解来源，不是写作大纲、计划、评价或建议。

只输出 Markdown，无代码围栏、无 JSON、无前言后记。格式必须适合一眼扫读：
# 具体中心标题
一句来源摘要。

## 具体分支名
- 子项标签：具体事实 + 含义
  - 可选细节：只放最关键的证据 / 例子 / 限制

硬性规则：
- 4 到 5 个 ## 分支；${docMapChildGuidance().replace(/^\s*-\s*/, "")}
- 所有分支和子项必须可从来源直接追溯。
- 标题短、具体、自然；不要写“中心主题”。
- 子项写信息和作用，不写空泛关键词；优先少节点、短节点、清楚分组，不要铺开所有证据。
- 如果来源混乱，保守提取最清楚的结构。
- 静默自检格式，不输出检查过程。
- ${docMapOutputLanguageInstruction()}

${previousMap}来源材料：
${clipContextContent(source.text, sourceLimit)}`;
}

async function repairDocMapHierarchyWithModel(source, map) {
  const prompt = docMapMindMapPrompt(source, { previousMap: map });

  const response = await fetchModelPayload({
    model: getLocalModelRequestName(),
    messages: withMarkdownModelMessages([
      { role: "system", content: resolveWritingRoutePrompt("source-apps.docmap-markdown") },
      { role: "user", content: prompt },
    ]),
    temperature: 0.15,
    max_tokens: 2600,
    ai_system6_task_kind: "docmap",
    stream: false,
  }, getLongTaskSignal());
  const data = await readChatJson(response);
  return data?.choices?.[0]?.message?.content || "";
}

async function buildDocMapWithModel(source) {
  const prompt = docMapMindMapPrompt(source);

  const response = await fetchModelPayload({
    model: getLocalModelRequestName(),
    messages: withMarkdownModelMessages([
      { role: "system", content: resolveWritingRoutePrompt("source-apps.docmap-markdown") },
      { role: "user", content: prompt },
    ]),
    temperature: 0.2,
    max_tokens: 2600,
    ai_system6_task_kind: "docmap",
    stream: false,
  }, getLongTaskSignal());
  const data = await readChatJson(response);
  const markdown = data?.choices?.[0]?.message?.content || "";
  let map = parseDocMapMarkdown(markdown, source);
  if (!docMapHasMinimumHierarchy(map.nodes, map.edges)) {
    const repairedMarkdown = await repairDocMapHierarchyWithModel(source, map);
    const repairedMap = parseDocMapMarkdown(repairedMarkdown, source);
    if (repairedMap.nodes.length >= map.nodes.length) {
      map = repairedMap;
    }
    if (!map.nodes.length) {
      throw new Error("docmap_empty_model_output");
    }
    const supplemented = ensureDocMapSubBranches(map.nodes, map.edges, source);
    map = { ...map, nodes: supplemented.nodes, edges: supplemented.edges };
    if (!docMapHasMinimumHierarchy(map.nodes, map.edges) && map.nodes.length < 4) {
      throw new Error("docmap_hierarchy_quality_gate");
    }
  }
  return map;
}

function docMapModelFailureStatus(error) {
  const message = error?.message || "";
  if (message === "docmap_hierarchy_quality_gate" || message === "docmap_empty_model_output") {
    return t("docmap_model_quality_failed");
  }
  return t("docmap_model_failed", message);
}

function flattenDocMapNodes(nodes = currentDocMap?.nodes || []) {
  return Array.isArray(nodes) ? nodes : [];
}

function selectedDocMapNode() {
  if (selectedDocMapNodeId === "central" && currentDocMap?.central) return currentDocMap.central;
  const nodes = flattenDocMapNodes();
  return nodes.find((node) => node.id === selectedDocMapNodeId) || nodes[0] || null;
}

// The whole map always goes; a focused branch rides along when one is picked
// (see askDocMapQuestion), so the scope row names it.
function describeDocMapAskScope() {
  if (!currentDocMap) return { ready: false };
  const node = selectedDocMapNode();
  return {
    ready: true,
    object: currentDocMap.central?.title || currentDocMap.sourceLabel || t("docmap"),
    range: node?.title
      ? `${t("ask_scope_whole_map")} · ${t("ask_scope_focus", node.title)}`
      : t("ask_scope_whole_map"),
  };
}

function docMapEdgesForNode(nodeId, map = currentDocMap) {
  if (!nodeId || !map?.edges) return [];
  return map.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

function docMapRelatedNodeTitles(nodeId, map = currentDocMap) {
  const lookup = new Map((map?.nodes || []).map((node) => [node.id, node]));
  return docMapEdgesForNode(nodeId, map)
    .filter((edge) => edge.from !== "central" && edge.to !== "central")
    .map((edge) => {
      const otherId = edge.from === nodeId ? edge.to : edge.from;
      const other = lookup.get(otherId);
      return other ? `${edge.label ? `${edge.label}: ` : ""}${other.title}` : "";
    })
    .filter(Boolean);
}

function docMapNodeSubtreeMarkdown(node, map = currentDocMap, depth = 0, seen = new Set()) {
  if (!node || seen.has(node.id)) return "";
  seen.add(node.id);
  const indent = "  ".repeat(depth);
  const lines = [
    `${indent}- ${node.title}${node.summary && node.summary !== node.title ? `: ${node.summary}` : ""}`,
  ];
  (map?.edges || [])
    .filter((edge) => edge.from === node.id)
    .map((edge) => (map.nodes || []).find((item) => item.id === edge.to))
    .filter(Boolean)
    .forEach((child) => {
      const childMarkdown = docMapNodeSubtreeMarkdown(child, map, depth + 1, seen);
      if (childMarkdown) lines.push(childMarkdown);
    });
  return lines.join("\n");
}

function docMapChildNodes(parentId, map = currentDocMap) {
  if (!parentId || !map) return [];
  const nodes = new Map((map.nodes || []).map((node) => [node.id, node]));
  return (map.edges || [])
    .filter((edge) => edge.from === parentId && edge.to !== "central")
    .map((edge) => nodes.get(edge.to))
    .filter(Boolean);
}

function docMapOutlineBullets(node, map = currentDocMap, depth = 0, seen = new Set()) {
  if (!node || seen.has(node.id)) return [];
  seen.add(node.id);
  const title = String(node.title || "").trim();
  const summary = String(node.summary || "").trim();
  const line = summary && summary !== title ? `${title}: ${summary}` : title;
  const lines = line ? [`${"  ".repeat(depth)}- ${line}`] : [];
  docMapChildNodes(node.id, map).forEach((child) => {
    lines.push(...docMapOutlineBullets(child, map, depth + 1, seen));
  });
  return lines;
}

function docMapSectionOutlineMarkdown(node, map = currentDocMap) {
  if (!node) return "";
  const title = String(node.title || "").trim() || t("new_outline_section");
  const summary = String(node.summary || "").trim();
  const lines = [`## ${title}`];
  if (summary && summary !== title) lines.push(`- ${summary}`);
  docMapChildNodes(node.id, map).forEach((child) => {
    lines.push(...docMapOutlineBullets(child, map, 0, new Set([node.id])));
  });
  return lines.join("\n").trim();
}

function docMapOutlineMarkdownFromNode(node, map = currentDocMap) {
  if (!node || !map) return "";
  const roots = node.id === "central" ? docMapChildNodes("central", map) : [node];
  const sections = roots.length ? roots : [node];
  return sections
    .map((section) => docMapSectionOutlineMarkdown(section, map))
    .filter(Boolean)
    .join("\n\n");
}

function videoHkrrLabelsForNode(node, map = currentDocMap) {
  if (!node || map?.kind !== "videoDocMap") return [];
  const overlayItem = (map.hkrrOverlay || []).find((item) => item.nodeId === node.id);
  const rawLabels = overlayItem?.labels?.length ? overlayItem.labels : (node.hkrr || []);
  return rawLabels
    .map((item) => ({
      type: String(item?.type || item?.label || "").trim(),
      reason: String(item?.reason || (Array.isArray(item?.facts) ? item.facts[0] : "") || "").trim(),
    }))
    .filter((item) => item.type && item.reason);
}

function docMapNodeMarkdown(node) {
  if (currentDocMap?.kind === "videoDocMap") {
    const hkrr = videoHkrrLabelsForNode(node, currentDocMap);
    return [
      `- [${node.timeStart} -> ${node.timeEnd}] ${node.title}`,
      node.sourceId ? `  - Source ID: ${node.sourceId}` : "",
      node.summary ? `  - Summary: ${node.summary}` : "",
      node.function ? `  - Function: ${node.function}` : "",
      hkrr.length ? `  - HKRR: ${hkrr.map((item) => `${item.type} (${item.reason})`).join(" / ")}` : "",
      node.claims?.length ? `  - Claims: ${node.claims.join("; ")}` : "",
      node.notableLines?.length ? `  - Notable lines: ${node.notableLines.join(" / ")}` : "",
    ].filter(Boolean).join("\n");
  }
  const lines = [
    `- ${node.title}${node.summary ? `: ${node.summary}` : ""}`,
    node.kind ? `  - Type: ${node.kind}` : "",
    node.cluster ? `  - Cluster: ${node.cluster}` : "",
    node.quote ? `  - ${t("source_quote")}: ${node.quote}` : "",
    ...docMapRelatedNodeTitles(node.id).slice(0, 5).map((title) => `  - Related: ${title}`),
  ].filter(Boolean);
  return lines.join("\n");
}

async function rewriteDocMapNodeAsQuestionSheet(node) {
  const existing = questionSheetBodyInput.value.trim();
  const branchMarkdown = docMapNodeSubtreeMarkdown(node, currentDocMap);
  const prompt = buildQuestionSheetRewritePrompt({
    sourceName: `DocMap: ${currentDocMap?.title || ""}`.trim(),
    sourceMarkdown: branchMarkdown,
    existing,
  });

  const response = await fetchModelPayload({
    model: getLocalModelRequestName(),
    messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
    temperature: 0.35,
  }, getLongTaskSignal());
  const data = await readChatJson(response);
  return stripDocMapMarkdownFence(data?.choices?.[0]?.message?.content || "").trim();
}

function formatDocMapMarkdown(map = currentDocMap) {
  if (!map) return "";
  return [
    `# DocMap: ${map.title}`,
    "",
    `Source: ${map.sourceLabel}`,
    `Trace: ${t(map.traceability === "full" ? "docmap_trace_full" : map.traceability === "none" ? "docmap_trace_none" : "docmap_trace_partial")}`,
    `Layout: ${docMapLayoutFor(map)}`,
    "",
    map.central?.summary ? `Central: ${map.central.summary}` : "",
    "",
    ...map.nodes.map((node) => docMapNodeMarkdown(node)),
    "",
    "## Relations",
    ...(map.edges || []).map((edge) => `- ${edge.from} -> ${edge.to}${edge.label ? `: ${edge.label}` : ""}`),
  ].join("\n");
}

function cleanVideoDocMapMindMapText(value, fallback = "") {
  return docMapShortRebuildText(String(value || fallback || "")
    .replace(/\[?\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.．]\d{1,3})?\s*(?:-->|->|→|—|–|-|至|到)\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.．]\d{1,3})?\s*\]?/g, "")
    .replace(/^\s*(?:hook|background|knowledge|experience|transition|callback|ending|other|钩子|开场|背景|知识|信息|体验|经验|转场|转折|过渡|呼应|回调|结尾|收束|其他)\s*[|｜·:：/-]\s*/i, "")
    .replace(/\s*[|｜·:：/-]\s*(?:hook|background|knowledge|experience|transition|callback|ending|other)\s*$/i, "")
    .replace(/\s*[|｜·:：/-]\s*(?:Happiness|Knowledge|Resonance|Rhythm)(?:\s*[|｜·,/]\s*(?:Happiness|Knowledge|Resonance|Rhythm))*\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim(), currentLanguage === "zh" ? 34 : 64);
}

function videoDocMapMindMapTitle(node, index) {
  const claim = Array.isArray(node?.claims) ? node.claims.find(Boolean) : "";
  const summary = firstSentence(String(node?.summary || ""), currentLanguage === "zh" ? 42 : 84);
  return cleanVideoDocMapMindMapText(node?.title, "")
    || cleanVideoDocMapMindMapText(claim, "")
    || cleanVideoDocMapMindMapText(summary, "")
    || (currentLanguage === "zh" ? `主题 ${index + 1}` : `Topic ${index + 1}`);
}

function videoDocMapMindMapChildren(node, title) {
  const candidates = [
    ...(Array.isArray(node?.claims) ? node.claims : []),
    firstSentence(String(node?.summary || ""), currentLanguage === "zh" ? 44 : 88),
    ...(Array.isArray(node?.notableLines) ? node.notableLines.slice(0, 2) : []),
  ];
  const seen = new Set([String(title || "").trim().toLocaleLowerCase()]);
  return candidates
    .map((item) => cleanVideoDocMapMindMapText(item, ""))
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function docMapSubtreeWeight(node, childrenByParent, visited = new Set()) {
  if (!node || visited.has(node.id)) return 0;
  visited.add(node.id);
  const children = childrenByParent.get(node.id) || [];
  const weight = 1 + children.reduce((sum, child) => sum + docMapSubtreeWeight(child, childrenByParent, visited), 0);
  visited.delete(node.id);
  return weight;
}

function balanceDocMapRootOrder(roots, childrenByParent) {
  const sides = [
    { weight: 0, roots: [] },
    { weight: 0, roots: [] },
  ];
  roots
    .map((root, index) => ({ root, index, weight: docMapSubtreeWeight(root, childrenByParent) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .forEach((item) => {
      const side = sides[0].weight <= sides[1].weight ? sides[0] : sides[1];
      side.roots.push(item);
      side.weight += item.weight;
    });
  const ordered = [];
  const max = Math.max(sides[0].roots.length, sides[1].roots.length);
  for (let index = 0; index < max; index += 1) {
    if (sides[0].roots[index]) ordered.push(sides[0].roots[index]);
    if (sides[1].roots[index]) ordered.push(sides[1].roots[index]);
  }
  return ordered.map((item) => item.root);
}

function docMapMarkdownForMarkmap(map = currentDocMap) {
  if (!map) return "";
  if (map.markdown) return stripDocMapMarkdownFence(map.markdown);
  if (map.kind === "videoDocMap") {
    const topics = [];
    const topicIndexes = new Map();
    (map.nodes || []).forEach((node, index) => {
      const title = videoDocMapMindMapTitle(node, index);
      const key = title.toLocaleLowerCase();
      if (!title) return;
      const children = videoDocMapMindMapChildren(node, title);
      if (topicIndexes.has(key)) {
        const existing = topics[topicIndexes.get(key)];
        const childKeys = new Set(existing.children.map((child) => child.toLocaleLowerCase()));
        children.forEach((child) => {
          const childKey = child.toLocaleLowerCase();
          if (!childKeys.has(childKey) && existing.children.length < 4) {
            existing.children.push(child);
            childKeys.add(childKey);
          }
        });
        return;
      }
      topicIndexes.set(key, topics.length);
      topics.push({ title, children });
    });
    const topicLines = topics.map((topic) => {
      const children = topic.children.map((child) => `- ${child}`);
      return [`## ${topic.title}`, ...children].join("\n");
    });
    const rootTitle = cleanVideoDocMapMindMapText(map.central?.title || map.title, currentLanguage === "zh" ? "视频主题" : "Video Themes");
    return [
      `# ${rootTitle}`,
      "",
      ...topicLines,
    ].join("\n\n").trim();
  }
  const childrenByParent = new Map();
  (map.edges || []).forEach((edge) => {
    if (edge.from === "central") return;
    const siblings = childrenByParent.get(edge.from) || [];
    const child = (map.nodes || []).find((node) => node.id === edge.to);
    if (child) siblings.push(child);
    childrenByParent.set(edge.from, siblings);
  });
  const roots = (map.edges || [])
    .filter((edge) => edge.from === "central")
    .map((edge) => (map.nodes || []).find((node) => node.id === edge.to))
    .filter(Boolean);
  const orderedRoots = docMapLayoutFor(map) === "balanced"
    ? balanceDocMapRootOrder(roots, childrenByParent)
    : roots;
  const lines = [
    `# ${map.central?.title || map.title || t("docmap")}`,
    map.central?.summary || "",
    "",
  ];
  const appendNodeBullets = (node, depth = 0, visited = new Set()) => {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);
    const indent = "  ".repeat(Math.max(0, depth));
    lines.push(`${indent}- ${node.title}${node.summary && node.summary !== node.title ? `: ${node.summary}` : ""}`);
    (childrenByParent.get(node.id) || []).forEach((child) => {
      appendNodeBullets(child, depth + 1, visited);
    });
    visited.delete(node.id);
  };
  orderedRoots.forEach((root) => {
    lines.push(`## ${root.title}`);
    if (root.summary && root.summary !== root.title) lines.push(root.summary);
    (childrenByParent.get(root.id) || []).forEach((child) => appendNodeBullets(child, 0));
    lines.push("");
  });
  return lines.join("\n").trim();
}

function renderDocMapTree(map) {
  if (!map?.nodes?.length) return "";
  if (map.kind === "videoDocMap") {
    const selectedId = selectedDocMapNodeId === "central" ? map.nodes[0]?.id : selectedDocMapNodeId;
    const selectedNode = (map.nodes || []).find((node) => node.id === selectedId) || map.nodes[0];
    return `
      <div class="video-docmap-workbench">
        <div class="video-docmap-map">
          ${window.markmap?.Markmap && window.markmap?.Transformer ? `
            <div class="docmap-markmap-frame video-docmap-markmap-frame">
              <svg class="docmap-markmap-svg video-docmap-markmap-svg" aria-label="${escapeHtml(t("docmap"))}"></svg>
            </div>
          ` : `<div class="empty-folder-note">${escapeHtml(t(docMapMarkmapLoadFailed ? "docmap_visual_failed" : "docmap_mapping"))}</div>`}
        </div>
        <aside class="video-docmap-inspector">
          <div class="video-docmap-timeline">
            ${(map.nodes || []).map((node) => `
              <button type="button" class="${node.id === selectedNode?.id ? "is-selected" : ""}" data-docmap-node="${escapeHtml(node.id)}">
                <span>${escapeHtml(node.timeStart)} → ${escapeHtml(node.timeEnd)}</span>
                <b>${escapeHtml(node.title)}</b>
              </button>
            `).join("")}
          </div>
          ${selectedNode ? `
            <article class="video-docmap-node is-selected">
              <header>
                <span class="video-docmap-time">${escapeHtml(selectedNode.timeStart)} → ${escapeHtml(selectedNode.timeEnd)}</span>
                <b>${escapeHtml(selectedNode.title)}</b>
                <small>${escapeHtml(selectedNode.function || "other")}</small>
              </header>
              <p>${escapeHtml(selectedNode.summary || "")}</p>
              ${(selectedNode.claims || []).length ? `<div class="video-docmap-chip-row">${selectedNode.claims.map((claim) => `<span>${escapeHtml(claim)}</span>`).join("")}</div>` : ""}
              ${(selectedNode.notableLines || []).length ? `<blockquote>${escapeHtml(selectedNode.notableLines.join(" / "))}</blockquote>` : ""}
              <button type="button" class="btn mini-btn" data-video-docmap-jump="${escapeHtml(selectedNode.id)}">Open in Reader</button>
            </article>
          ` : ""}
        </aside>
      </div>
    `;
  }
  if (!window.markmap?.Markmap || !window.markmap?.Transformer) {
    return `
      <div class="empty-folder-note">${escapeHtml(t(docMapMarkmapLoadFailed ? "docmap_visual_failed" : "docmap_mapping"))}</div>
    `;
  }
  return `
    <div class="docmap-markmap-frame">
      <svg class="docmap-markmap-svg" aria-label="${escapeHtml(t("docmap"))}"></svg>
    </div>
  `;
}

function docMapPalette() {
  return document.body?.classList.contains("use-liquid-glass")
    ? "#2f9db3 #78ad62 #6f95cf #c98f34 #e07c67 #6cae9c".split` `
    : "#167a8a #b45f16 #6b55b8 #bf2f35 #248a45 #c17b00".split` `;
}

function mirrorMarkmapBalanced(inst) {
  // Markmap has no native two-sided layout: it lays the whole tree out to the
  // right. To read as a standard centered mind map we let Markmap render and
  // measure everything (so labels, colors and curves stay 100% Markmap), then
  // reflect half of the first-level branches to the left of the root.
  const svg = inst?.svg?.node?.();
  const root = inst?.state?.data;
  if (!svg || !root) return;
  const firstLevel = root.children || [];
  if (firstLevel.length < 2) {
    syncDocMapSvgSizeAttributes(inst);
    inst.fit();
    return;
  }
  const groups = Array.from(svg.querySelectorAll("g.markmap-node"));
  const spacingVertical = inst.options?.spacingVertical || 8;
  const branchGap = spacingVertical * 2 + 6;
  const lineHalf = 0.75;

  const subtreeWeight = (node) => (!node.children || !node.children.length)
    ? 1
    : node.children.reduce((sum, child) => sum + subtreeWeight(child), 0);

  // Split first-level branches into two balanced groups, keep document order.
  const ranked = firstLevel
    .map((node, index) => ({ node, index, weight: subtreeWeight(node) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const right = [];
  const left = [];
  let rightWeight = 0;
  let leftWeight = 0;
  ranked.forEach((item, position) => {
    if (position === 0 || rightWeight <= leftWeight) {
      right.push(item);
      rightWeight += item.weight;
    } else {
      left.push(item);
      leftWeight += item.weight;
    }
  });
  left.sort((a, b) => a.index - b.index);
  right.sort((a, b) => a.index - b.index);

  const sideOf = new Map();
  const markSide = (node, side) => {
    sideOf.set(node, side);
    (node.children || []).forEach((child) => markSide(child, side));
  };
  left.forEach((item) => markSide(item.node, "left"));
  right.forEach((item) => markSide(item.node, "right"));

  const rootRect = root.state.rect;
  const mirrorAxis = rootRect.x + rootRect.width / 2;
  const rootMidY = rootRect.y + rootRect.height / 2;

  const subtreeYBounds = (node) => {
    let min = Infinity;
    let max = -Infinity;
    const walk = (n) => {
      const rect = n.state.rect;
      min = Math.min(min, rect.y);
      max = Math.max(max, rect.y + rect.height);
      (n.children || []).forEach(walk);
    };
    walk(node);
    return [min, max];
  };
  const shiftSubtreeY = (node, dy) => {
    const walk = (n) => {
      n.state.rect.y += dy;
      (n.children || []).forEach(walk);
    };
    walk(node);
  };
  const mirrorSubtreeX = (node) => {
    const walk = (n) => {
      const rect = n.state.rect;
      rect.x = 2 * mirrorAxis - rect.x - rect.width;
      (n.children || []).forEach(walk);
    };
    walk(node);
  };

  // Re-stack each side's branches so they pack tightly and stay centered on the
  // root instead of inheriting the gaps left by the branches sent to the
  // opposite side.
  const restackSide = (branches) => {
    if (!branches.length) return;
    const bounds = branches.map((item) => subtreeYBounds(item.node));
    const total = bounds.reduce((sum, b) => sum + (b[1] - b[0]), 0)
      + branchGap * (branches.length - 1);
    let cursor = rootMidY - total / 2;
    branches.forEach((item, index) => {
      shiftSubtreeY(item.node, cursor - bounds[index][0]);
      cursor += (bounds[index][1] - bounds[index][0]) + branchGap;
    });
  };
  restackSide(right);
  restackSide(left);
  left.forEach((item) => mirrorSubtreeX(item.node));

  // Apply the new positions to the rendered groups and flip left-side ornaments.
  groups.forEach((group) => {
    const datum = group.__data__;
    const rect = datum?.state?.rect;
    if (!rect) return;
    group.setAttribute("transform", `translate(${rect.x},${rect.y})`);
    if (sideOf.get(datum) === "left") {
      group.classList.add("docmap-mm-left");
      const circle = group.querySelector("circle");
      if (circle) circle.setAttribute("cx", "0");
    }
  });

  // --- Promote the Markmap root into a real centered anchor ---------------
  // In a right-side tree the root only ever grows rightward, so Markmap draws it
  // as an ordinary node: left-aligned label, an underline, and a connector dot on
  // its right edge. A two-sided map needs the center to read as a stable anchor.
  // We keep Markmap's foreignObject (so the title still wraps correctly), hide the
  // dot + underline, draw a framing box behind the title, and connect the
  // first-level branches to the middle of the box's left/right edges.
  const rootGroup = groups.find((group) => group.__data__ === root);
  if (rootGroup) rootGroup.classList.add("docmap-mm-balanced-root");
  const boxPadX = 7;
  const boxPadY = 5;
  const box = {
    x: rootRect.x - boxPadX,
    y: rootRect.y - boxPadY,
    width: rootRect.width + boxPadX * 2,
    height: rootRect.height + boxPadY * 2,
  };
  const centerY = rootMidY;
  const center = {
    x: mirrorAxis,
    y: centerY,
    leftPort: { x: box.x, y: centerY },
    rightPort: { x: box.x + box.width, y: centerY },
  };
  // Draw / refresh the center box, kept behind the title (first child of the
  // zoomed group) so the label stays readable on top of it.
  const svgNS = "http://www.w3.org/2000/svg";
  const innerG = inst.g?.node?.() || rootGroup?.parentNode;
  if (innerG) {
    let centerGroup = svg.querySelector("g.docmap-balanced-center");
    if (!centerGroup) {
      centerGroup = document.createElementNS(svgNS, "g");
      centerGroup.setAttribute("class", "docmap-balanced-center");
    }
    if (centerGroup.parentNode !== innerG || innerG.firstChild !== centerGroup) {
      innerG.insertBefore(centerGroup, innerG.firstChild);
    }
    let boxEl = centerGroup.querySelector("rect.docmap-balanced-center-box");
    if (!boxEl) {
      boxEl = document.createElementNS(svgNS, "rect");
      boxEl.setAttribute("class", "docmap-balanced-center-box");
      boxEl.setAttribute("rx", "5");
      centerGroup.appendChild(boxEl);
    }
    boxEl.setAttribute("x", box.x);
    boxEl.setAttribute("y", box.y);
    boxEl.setAttribute("width", box.width);
    boxEl.setAttribute("height", box.height);
  }

  // Redraw links as side-aware horizontal beziers (Markmap's own link shape).
  // First-level branches leave from the center ports, not the raw root rect edge.
  svg.querySelectorAll("path.markmap-link").forEach((path) => {
    const datum = path.__data__;
    const source = datum?.source?.state?.rect;
    const target = datum?.target?.state?.rect;
    if (!source || !target) return;
    const isLeft = sideOf.get(datum.target) === "left";
    const isRootLink = datum.source === root;
    const ty = target.y + target.height + lineHalf;
    const tx = isLeft ? target.x + target.width : target.x;
    let sx;
    let sy;
    if (isRootLink) {
      const port = isLeft ? center.leftPort : center.rightPort;
      sx = port.x;
      sy = port.y;
    } else {
      sy = source.y + source.height + lineHalf;
      sx = isLeft ? source.x : source.x + source.width;
    }
    const mx = (sx + tx) / 2;
    path.setAttribute("d", `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`);
  });

  // Recompute the bounding box so fit() and the PDF crop frame the mirrored map,
  // including the center box.
  let x1 = box.x;
  let y1 = box.y;
  let x2 = box.x + box.width;
  let y2 = box.y + box.height;
  groups.forEach((group) => {
    const rect = group.__data__?.state?.rect;
    if (!rect) return;
    x1 = Math.min(x1, rect.x);
    y1 = Math.min(y1, rect.y);
    x2 = Math.max(x2, rect.x + rect.width);
    y2 = Math.max(y2, rect.y + rect.height);
  });
  if (Number.isFinite(x1)) inst.state.rect = { x1, y1, x2, y2 };
  syncDocMapSvgSizeAttributes(inst);
  inst.fit();
}

function renderDocMapMarkmap(map = currentDocMap) {
  if (!docMapTreeEl || !map) return false;
  const svg = docMapTreeEl.querySelector(".docmap-markmap-svg");
  if (!svg) return false;
  if (docMapMarkmapInstance) {
    docMapMarkmapInstance.destroy();
    docMapMarkmapInstance = null;
  }
  if (!window.markmap?.Markmap || !window.markmap?.Transformer) return false;
  const balanced = map.kind !== "videoDocMap" && docMapLayoutFor(map) === "balanced";
  const transformer = new window.markmap.Transformer();
  const { root } = transformer.transform(docMapMarkdownForMarkmap(map));
  const palette = docMapPalette();
  const options = {
    // Balanced layout fits itself after mirroring; let Markmap fit the others.
    autoFit: !balanced,
    duration: 0,
    fitRatio: 0.94,
    maxWidth: map.kind === "videoDocMap" ? 360 : 280,
    spacingHorizontal: map.kind === "videoDocMap" ? 70 : 84,
    spacingVertical: map.kind === "videoDocMap" ? 10 : 8,
    initialExpandLevel: -1,
    ...window.markmap.deriveOptions({ color: palette, colorFreezeLevel: 2 }),
  };
  if (!balanced) {
    syncDocMapSvgSizeAttributes({ svg: { node: () => svg } });
    docMapMarkmapInstance = window.markmap.Markmap.create(svg, options, root);
    return true;
  }
  // Render the full tree, then reflect half of it into a two-sided mind map.
  // Markmap re-runs renderData on its own (a debounced ResizeObserver, highlight,
  // refresh hook), each time resetting to a one-sided layout — so we re-apply the
  // mirror after every render, not just the first one.
  syncDocMapSvgSizeAttributes({ svg: { node: () => svg } });
  const inst = window.markmap.Markmap.create(svg, options);
  docMapMarkmapInstance = inst;
  const baseRenderData = inst.renderData.bind(inst);
  let renderToken = 0;
  inst.renderData = async (origin) => {
    const token = ++renderToken;
    await baseRenderData(origin);
    // renderData resolves before Markmap's zero-duration transitions flush; wait
    // two frames so the mirror's positions are not overwritten afterwards.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Only the latest render mirrors, so an overlapping re-render can't double it.
    if (docMapMarkmapInstance === inst && token === renderToken) {
      mirrorMarkmapBalanced(inst);
      docMapBalancedPending = false;
    }
  };
  // Mark the balanced layout as not-yet-centered so fit()/print wait for the
  // mirror + center pass. setData resolves only after the first mirror, because
  // the wrapped renderData above awaits it.
  docMapBalancedPending = true;
  docMapBalancedReadyPromise = inst.setData(root).catch(() => {});
  return true;
}

function fitDocMapCanvasToView() {
  // Don't fit a half-built balanced map: the mirror + center pass updates the
  // bbox and runs its own fit() when it finishes.
  if (docMapLayoutFor() === "balanced" && docMapBalancedPending) return;
  const r = docMapMarkmapInstance?.state?.rect;
  if (!r || r.x2 <= r.x1 || r.y2 <= r.y1) return;
  docMapZoomMode = "fit";
  syncDocMapSvgSizeAttributes(docMapMarkmapInstance);
  docMapMarkmapInstance.fit();
}

function restoreDocMapCanvasView() {
  if (renderDocMapMarkmap()) {
    queueDocMapFitToView(8, { focusCompact: true });
  }
}

function zoomDocMapIn() {
  docMapMarkmapInstance?.rescale(1.15);
  docMapZoomMode = "manual";
}

function zoomDocMapOut() {
  docMapMarkmapInstance?.rescale(1 / 1.15);
  docMapZoomMode = "manual";
}

function renderDocMap() {
  if (!docMapTreeEl) return;
  const map = currentDocMap;
  if (!map) {
    if (docMapMarkmapInstance) {
      docMapMarkmapInstance.destroy();
      docMapMarkmapInstance = null;
    }
    docMapCountEl.textContent = t("docmap_nodes_count", 0);
    docMapTreeEl.innerHTML = `<div class="empty-folder-note">${escapeHtml(t("docmap_empty"))}</div>`;
    if (docMapCommandMenu) {
      docMapCommandMenu.classList.add("is-disabled");
      docMapCommandMenu.removeAttribute("open");
    }
    if (docMapCommandSummary) docMapCommandSummary.setAttribute("aria-disabled", "true");
    syncDocMapLayoutControls(null);
    docMapLayoutButtons?.forEach((button) => { button.disabled = true; });
    [docMapSendQuestionButton, docMapAskHkrrButton, docMapInsertOutlineButton, docMapSaveButton, docMapPrintPdfButton].forEach((button) => {
      if (button) button.disabled = true;
    });
    renderVideoDocMapSwitchers();
    return;
  }

  const nodes = flattenDocMapNodes(map.nodes);
  if (map.kind !== "videoDocMap") map.layout = docMapLayoutFor(map);
  if (!selectedDocMapNodeId) selectedDocMapNodeId = "central";
  const node = selectedDocMapNode();
  docMapCountEl.textContent = t("docmap_nodes_count", nodes.length);
  docMapTreeEl.innerHTML = renderDocMapTree(map);
  if (!window.markmap?.Markmap || !window.markmap?.Transformer) {
    ensureDocMapMarkmap().then((loaded) => {
      if (currentDocMap !== map) return;
      renderDocMap();
    });
  }
  requestAnimationFrame(restoreDocMapCanvasView);
  if (docMapCommandMenu) docMapCommandMenu.classList.remove("is-disabled");
  if (docMapCommandSummary) docMapCommandSummary.setAttribute("aria-disabled", "false");
  syncDocMapLayoutControls(map);
  docMapLayoutButtons?.forEach((button) => { button.disabled = map.kind === "videoDocMap"; });
  [docMapSendQuestionButton, docMapAskHkrrButton, docMapInsertOutlineButton, docMapSaveButton, docMapPrintPdfButton].forEach((button) => {
    if (button) button.disabled = !node && button !== docMapSaveButton && button !== docMapAskHkrrButton;
  });
  if (docMapInsertOutlineButton && map.kind === "videoDocMap") {
    docMapInsertOutlineButton.disabled = true;
  }
  renderVideoDocMapSwitchers();
}

function activeDocMapTab() {
  return typeof getActiveDocumentTab === "function" ? getActiveDocumentTab("docMap") : null;
}

function captureActiveDocMapTabState() {
  const tab = activeDocMapTab();
  if (!tab || !currentDocMap) return;
  if (currentDocMap.kind === "videoDocMap" && currentDocMap.status !== "saved") return;
  tab.title = currentDocMap.title || tab.title || t("docmap");
  tab.state = {
    ...(tab.state || {}),
    map: structuredClone(currentDocMap),
    selectedNodeId: selectedDocMapNodeId || "central",
    zoomMode: docMapZoomMode || "fit",
  };
  tab.updatedAt = new Date().toISOString();
}

function renderDocMapTabs() {
  if (!docMapTabsEl || typeof getDocumentTabs !== "function") return;
  const tabs = getDocumentTabs("docMap");
  const activeId = activeDocMapTab()?.id;
  renderTdiTabStrip(docMapTabsEl, tabs, {
    activeId,
    labelFor: (tab) => tab.title || t("docmap"),
    sublabelFor: () => t("docmap"),
    onOpen: (tab) => openDocMapTab(tab.id, { ensureWindow: false }),
    onClose: (tab) => closeDocMapTab(tab.id),
    onMove: (tabId, targetTabId) => {
      captureActiveDocMapTabState();
      if (!moveDocumentTab("docMap", tabId, targetTabId)) return;
      renderDocMapTabs();
      saveDeskState();
    },
  });
  setupTdiRailResize(docMapTabsEl.closest(".tdi-shell"), { storageKey: "aiSystem6.tdiRail.docMap" });
}

function openDocMapTab(tabId, { ensureWindow = true } = {}) {
  captureActiveDocMapTabState();
  const tab = typeof setActiveDocumentTab === "function" ? setActiveDocumentTab("docMap", tabId) : null;
  if (!tab) return false;
  currentDocMap = structuredClone(tab.state?.map || tab.map || null);
  if (currentDocMap && currentDocMap.kind !== "videoDocMap") currentDocMap.layout = docMapLayoutFor(currentDocMap);
  selectedDocMapNodeId = tab.state?.selectedNodeId || "central";
  docMapZoomMode = tab.state?.zoomMode || "fit";
  renderDocMapTabs();
  renderDocMap();
  const win = getWindow("docMap");
  if (ensureWindow || win?.classList.contains("is-hidden")) openWindow("docMap");
  saveDeskState();
  return true;
}

function openDocMapWindowWithTabs() {
  renderDocMapTabs();
  const active = activeDocMapTab();
  if (active && !currentDocMap) {
    openDocMapTab(active.id);
    return;
  }
  openWindow("docMap");
}

function closeDocMapTab(tabId) {
  const project = getActiveProject();
  if (!project) return false;
  captureActiveDocMapTabState();
  const result = removeDocumentTab("docMap", tabId, project);
  if (!result) return false;
  if (result.wasActive) {
    if (result.next) {
      openDocMapTab(result.next.id);
    } else {
      currentDocMap = null;
      selectedDocMapNodeId = null;
      renderDocMapTabs();
      renderDocMap();
    }
  } else {
    renderDocMapTabs();
  }
  saveDeskState();
  return true;
}

function ensureDocMapDocumentTab(map) {
  if (!map || typeof upsertDocumentTab !== "function") return null;
  if (map.kind !== "videoDocMap") map.layout = docMapLayoutFor(map);
  const sourceMeta = map.sourceMeta || {};
  return upsertDocumentTab("docMap", "docmap", {
    title: map.title || t("docmap"),
    backing: {
      type: map.kind === "videoDocMap" ? "videoDocMap" : "docmap",
      id: map.id || sourceMeta.sourceId || sourceMeta.fileName || crypto.randomUUID(),
    },
    state: {
      map: structuredClone(map),
      selectedNodeId: selectedDocMapNodeId || "central",
      origin: {
        app: map.sourceScope === "teachtext" ? "teachText" : map.sourceScope === "reader" || map.sourceScope === "fileDisk" || map.sourceScope === "videoTranscript" ? "reader" : map.sourceScope || "",
        scope: map.sourceScope || "",
        documentId: sourceMeta.fileId || "",
        fileName: sourceMeta.fileName || "",
        url: sourceMeta.url || "",
        scrapIds: Array.isArray(sourceMeta.scrapIds) ? sourceMeta.scrapIds : [],
        title: map.sourceLabel || map.title || "",
      },
    },
    forceNew: true,
  });
}

function showDocMap(map, options = {}) {
  captureActiveDocMapTabState();
  if (map && map.kind !== "videoDocMap") map.layout = docMapLayoutFor(map);
  const tab = ensureDocMapDocumentTab(map);
  if (tab && typeof setActiveDocumentTab === "function") setActiveDocumentTab("docMap", tab.id);
  currentDocMap = map;
  selectedDocMapNodeId = "central";
  docMapZoomMode = "fit";
  renderDocMapTabs();
  renderDocMap();
  openWindow("docMap");
  if (options.focus) focusWindow(getWindow("docMap"));
  queueDocMapFitToView(10);
  if (options.statusMessage) setStatus(options.statusMessage);
}

async function makeDocMapFromCurrentSource(preferredContext = null) {
  const source = resolveDocMapSource(preferredContext);
  if (!source?.text) {
    setStatus(t("docmap_no_text"));
    openWindow("docMap");
    renderDocMap();
    return;
  }
  if (source.text.length < source.threshold) {
    setStatus(t("docmap_too_short"));
    return;
  }

  if (!beginLongTask("docmap", t("docmap_mapping"))) return;
  let map = null;
  let statusMessage = t("docmap_ready");
  try {
    if (source.kind === "videoTranscript" || source.scope === "videoTranscript") {
      await ensureVideoDocMapModule();
      map = await buildVideoDocMapWithModel(source);
      if (map.sourceMeta?.sourceId) temporaryVideoDocMaps.set(map.sourceMeta.sourceId, structuredClone(map));
    } else {
      map = await buildDocMapWithModel(source);
    }
  } catch (error) {
    if (isAbortError(error)) {
      endLongTask("docmap");
      return;
    }
    console.warn("DocMap model pass failed", error);
    const message = docMapModelFailureStatus(error);
    markActiveLongTaskFailed(message);
    setStatus(message);
    endLongTask("docmap");
    currentDocMap = null;
    selectedDocMapNodeId = null;
    renderDocMap();
    openWindow("docMap");
    return;
  }
  const project = getActiveProject();
  if (project && map.kind !== "videoDocMap") {
    project.updatedAt = new Date().toISOString();
    saveDeskState();
  }
  endLongTask("docmap");
  if (map.kind !== "videoDocMap") await ensureDocMapMarkmap();
  showDocMap(map, { statusMessage });
}


async function sendDocMapNodeToQuestionSheet() {
  const node = selectedDocMapNode();
  if (!node) {
    setStatus(t("docmap_no_node_selected"));
    return;
  }
  const activeProject = typeof ensureTeachTextSurfaceProject === "function" ? ensureTeachTextSurfaceProject() : getActiveProject();
  if (!activeProject) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  const targetProjectId = activeProject.id || null;

  if (!beginLongTask("docmap-question-sheet", t("docmap_rewriting_question_sheet"))) return;
  let sent = false;
  try {
    const rewritten = await rewriteDocMapNodeAsQuestionSheet(node);
    if (!rewritten) {
      setStatus(t("docmap_model_failed", currentLanguage === "zh" ? "未返回可用内容。请重试。" : "Model response had no usable content. Please retry."));
      return;
    }
    const nextQuestionSheet = rewritten.trim();
    if (!nextQuestionSheet) {
      setStatus(t("docmap_model_failed", currentLanguage === "zh" ? "未返回可用内容。请重试。" : "Model response had no usable content. Please retry."));
      return;
    }

    questionSheetBodyInput.value = nextQuestionSheet;
    activeProject.questionSheet = nextQuestionSheet;
    activeProject.updatedAt = new Date().toISOString();
    savePipelineData();
    renderPipeline();
    refreshTeachTextSurfacePreview("questionSheet");

    await openWindow("questionSheet");

    requestAnimationFrame(() => {
      const currentProject = getActiveProject();
      const shouldRestore = !targetProjectId || (currentProject && currentProject.id === targetProjectId);
      const finalValue = shouldRestore
        ? currentProject?.questionSheet?.trim() || nextQuestionSheet
        : nextQuestionSheet;

      if (questionSheetBodyInput.value !== finalValue) {
        questionSheetBodyInput.value = finalValue;
      }
      refreshTeachTextSurfacePreview("questionSheet");
      requestAnimationFrame(() => {
        questionSheetBodyInput.focus();
      });
    });
    sent = true;
    setStatus(t("docmap_sent_questions"));
  } catch (error) {
    if (!isAbortError(error)) {
      console.error("DocMap question sheet rewrite failed", error);
      setStatus(t("docmap_model_failed", String(error?.message || error || "unknown error")));
    }
  } finally {
    if (!endLongTask("docmap-question-sheet") && !sent) setStatus(t("docmap_model_failed", currentLanguage === "zh" ? "整理未完成，请重试。" : "Rewrite did not complete. Please retry."));
  }
}

async function insertDocMapNodeAsOutline() {
  if (currentDocMap?.kind === "videoDocMap") {
    setStatus(currentLanguage === "zh" ? "Video DocMap 是来源理解分析。请先送到问题单后再生成大纲。" : "Video DocMap is source analysis. Send notes to the Question Sheet before making an outline.");
    return;
  }
  const node = selectedDocMapNode();
  if (!node) {
    setStatus(t("docmap_no_node_selected"));
    return;
  }
  const result = await showSystemModal(t("replace_outline_confirm"), "confirm");
  if (result !== "yes") return;

  const outlineMarkdown = docMapOutlineMarkdownFromNode(node);
  const sections = extractOutlineSections(outlineMarkdown || node.title);
  const project = getActiveProject();
  if (project) {
    setProjectOutlineMarkdown(project, outlineMarkdown || serializeOutlineSections(sections));
    syncDraftsFromProjectOutline(project);
    syncDraftDomFromProject(project);
    syncLinkedTeachTextFromProject(project);
    project.updatedAt = new Date().toISOString();
  } else {
    outlineContentEl.value = outlineMarkdown || serializeOutlineSections(sections);
  }
  renderPipeline();
  saveDeskState();
  openWindow("outline");
  setStatus(t("docmap_inserted_outline"));
}

function saveCurrentDocMap() {
  if (!currentDocMap) return;
  captureActiveDocMapTabState();
  if (!getActiveProject()) {
    setStatus(t("no_project_mounted"));
    openWindow("projects");
    return;
  }
  const folder = ensureFolder("DocMaps", null);
  const name = nextAvailableProjectFileName(`DocMap - ${currentDocMap.title}.md`, activeProjectId);
  const now = new Date().toISOString();
  const markdown = currentDocMap.kind === "videoDocMap"
    ? formatDocMapMarkdown(currentDocMap)
    : docMapMarkdownForMarkmap(currentDocMap);
  const savedMap = currentDocMap.kind === "videoDocMap" ? structuredClone(currentDocMap) : restoreDocMapFromMarkdown(markdown, {
    label: name,
    scope: "documents",
    meta: {
      savedFromDocMapId: currentDocMap.id || "",
      savedAt: now,
    },
    allowGeneric: true,
  }) || structuredClone(currentDocMap);
  if (savedMap.kind !== "videoDocMap") savedMap.layout = docMapLayoutFor(currentDocMap);
  Object.assign(savedMap, {
    status: "saved",
    savedAt: now,
    sourceLabel: name,
  });
  chatFiles.unshift({
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    name,
    folderId: folder.id,
    body: markdown,
    docMap: savedMap,
    source: "DocMap",
    durable: true,
    createdAt: now,
    updatedAt: now,
  });
  currentDocMap.status = "saved";
  if (currentDocMap.kind === "videoDocMap" && currentDocMap.sourceMeta?.sourceId) {
    temporaryVideoDocMaps.set(currentDocMap.sourceMeta.sourceId, structuredClone(currentDocMap));
  }
  const tab = activeDocMapTab();
  if (tab) {
    tab.title = currentDocMap.title || tab.title;
    tab.state = { ...(tab.state || {}), map: structuredClone(currentDocMap), selectedNodeId: selectedDocMapNodeId || "central" };
  }
  selectedFolderId = folder.id;
  renderDocuments();
  renderDocMap();
  renderVideoDocMapSwitchers();
  saveDeskState();
  setStatus(t("docmap_saved_file", name));
}

function docMapPrintTitle(map = currentDocMap) {
  return `DocMap - ${map?.title || t("untitled")}`.trim();
}

function docMapPrintRootVariables() {
  const styles = getComputedStyle(document.documentElement);
  const variables = ["--paper", "--ink", "--text-font", "--system-readable-min"]
    .map((name) => `${name}: ${styles.getPropertyValue(name).trim()};`)
    .join(" ");
  return `:root { ${variables} }`;
}

function docMapPrintMarkmapCss() {
  const selectors = [
    ".docmap-tree",
    ".docmap-markmap-frame",
    ".docmap-markmap-svg",
    ".markmap-node",
    ".markmap-link",
    ".docmap-balanced-center",
    ".docmap-balanced-center-box",
    ".docmap-mm-balanced-root",
    "foreignObject",
  ];
  const styleRuleType = window.CSSRule?.STYLE_RULE || 1;
  const rules = [];
  Array.from(document.styleSheets || []).forEach((sheet) => {
    let cssRules = [];
    try {
      cssRules = Array.from(sheet.cssRules || []);
    } catch {
      return;
    }
    cssRules.forEach((rule) => {
      if (rule.type !== styleRuleType) return;
      const cssText = rule.cssText || "";
      if (selectors.some((selector) => cssText.includes(selector))) rules.push(cssText);
    });
  });
  return [docMapPrintRootVariables(), ...rules].join("\n");
}

function docMapSvgFallbackViewportBox(svg) {
  const viewBox = svg?.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) return viewBox;
  const rect = svg?.getBoundingClientRect?.();
  if (rect && rect.width > 0 && rect.height > 0) {
    return { x: 0, y: 0, width: rect.width, height: rect.height };
  }
  return { x: 0, y: 0, width: 1024, height: 768 };
}

function docMapSvgPointFromScreen(svg, x, y, inverseMatrix) {
  if (!svg || !inverseMatrix) return null;
  if (typeof DOMPoint === "function") {
    return new DOMPoint(x, y).matrixTransform(inverseMatrix);
  }
  const point = svg.createSVGPoint?.();
  if (!point) return null;
  point.x = x;
  point.y = y;
  return point.matrixTransform(inverseMatrix);
}

function docMapSvgScreenRectToUserBox(svg, rect, inverseMatrix) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const points = [
    docMapSvgPointFromScreen(svg, rect.left, rect.top, inverseMatrix),
    docMapSvgPointFromScreen(svg, rect.right, rect.top, inverseMatrix),
    docMapSvgPointFromScreen(svg, rect.right, rect.bottom, inverseMatrix),
    docMapSvgPointFromScreen(svg, rect.left, rect.bottom, inverseMatrix),
  ].filter(Boolean);
  if (points.length < 4) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function docMapPrintPageMetrics(layout = docMapLayoutFor()) {
  const balanced = layout === "balanced";
  return balanced
    ? {
      page: "A4 landscape",
      widthMm: 297,
      heightMm: 210,
      sheetHeightMm: 209,
      aspect: 297 / 210,
      previewWidth: 1123,
      previewHeight: 794,
      popupWidth: 1120,
      popupHeight: 860,
    }
    : {
      page: "A4 portrait",
      widthMm: 210,
      heightMm: 297,
      sheetHeightMm: 296,
      aspect: 210 / 296,
      previewWidth: 794,
      previewHeight: 1123,
      popupWidth: 860,
      popupHeight: 1120,
    };
}

function docMapSvgVisibleElementBox(svg, layout = docMapLayoutFor()) {
  let inverseMatrix = null;
  try {
    inverseMatrix = svg?.getScreenCTM?.()?.inverse?.() || null;
  } catch {
    inverseMatrix = null;
  }
  if (!inverseMatrix) return null;
  const contentBoxes = Array.from(svg.querySelectorAll(".markmap-node, .docmap-balanced-center-box, text, foreignObject, circle"))
    .map((el) => docMapSvgScreenRectToUserBox(svg, el.getBoundingClientRect?.(), inverseMatrix))
    .filter((box) => box && box.width > 0 && box.height > 0);
  if (!contentBoxes.length) return null;
  const left = Math.min(...contentBoxes.map((box) => box.x));
  const top = Math.min(...contentBoxes.map((box) => box.y));
  const right = Math.max(...contentBoxes.map((box) => box.x + box.width));
  const bottom = Math.max(...contentBoxes.map((box) => box.y + box.height));
  const base = Math.max(1, Math.min(right - left, bottom - top));
  const balancedLayout = layout === "balanced";
  const leftPad = balancedLayout ? Math.max(48, base * 0.05) : Math.max(8, base * 0.01);
  const rightPad = balancedLayout ? Math.max(48, base * 0.05) : Math.max(72, base * 0.075);
  const verticalPad = Math.max(24, base * 0.025);
  const paddedLeft = left - leftPad;
  const paddedRight = right + rightPad;
  const paddedTop = top - verticalPad;
  const paddedBottom = bottom + verticalPad;
  const contentWidth = paddedRight - paddedLeft;
  const contentHeight = paddedBottom - paddedTop;
  const pageAspect = docMapPrintPageMetrics(layout).aspect;
  const width = Math.max(contentWidth, contentHeight * pageAspect);
  const height = Math.max(contentHeight, width / pageAspect);
  const contentCenterY = (paddedTop + paddedBottom) / 2;
  const centerBox = balancedLayout
    ? docMapSvgScreenRectToUserBox(svg, svg.querySelector(".docmap-balanced-center-box")?.getBoundingClientRect?.(), inverseMatrix)
    : null;
  const balancedCenterX = centerBox && centerBox.width > 0
    ? centerBox.x + centerBox.width / 2
    : (left + right) / 2;
  const x = balancedLayout
    ? balancedCenterX - width / 2
    : paddedLeft;
  const y = contentCenterY - height / 2;
  return {
    x,
    y,
    width,
    height,
  };
}

function prepareDocMapSvgForPrint() {
  if (!docMapMarkmapInstance) return Promise.resolve();
  // For balanced maps, wait until the mirror + center pass has run so the clone
  // captures the two-sided layout and a centered anchor, not the raw render.
  const ready = docMapLayoutFor() === "balanced" && docMapBalancedReadyPromise
    ? docMapBalancedReadyPromise
    : Promise.resolve();
  return ready.then(() => {
    docMapMarkmapInstance.fit();
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function cloneDocMapSvgForPrint(map = currentDocMap) {
  const svg = docMapTreeEl?.querySelector(".docmap-markmap-svg");
  if (!svg) return "";
  const layout = docMapLayoutFor(map);
  const viewport = docMapSvgVisibleElementBox(svg, layout) || docMapSvgFallbackViewportBox(svg);
  const clone = svg.cloneNode(true);
  clone.removeAttribute("style");
  clone.setAttribute("role", "img");
  clone.setAttribute("aria-label", docMapPrintTitle());
  clone.setAttribute("width", "100%");
  clone.setAttribute("height", "100%");
  clone.setAttribute("preserveAspectRatio", layout === "balanced" ? "xMidYMid meet" : "xMinYMid meet");
  clone.setAttribute("viewBox", `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
  return clone.outerHTML;
}

function buildDocMapPrintHtml(map = currentDocMap) {
  const title = docMapPrintTitle(map);
  const svgHtml = cloneDocMapSvgForPrint(map);
  const markmapCss = docMapPrintMarkmapCss();
  const bodyClass = document.body?.classList.contains("use-liquid-glass") ? "use-liquid-glass" : "";
  const markdownFallback = escapeHtml(formatDocMapMarkdown(map || {}));
  const lang = currentLanguage === "zh" ? "zh-Hans" : "en";
  const layout = docMapLayoutFor(map);
  const printMetrics = docMapPrintPageMetrics(layout);
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${printMetrics.page}; margin: 0; }
    :root {
      color: #111;
      background: #fff;
      font-family: ${currentLanguage === "zh" ? '"Songti SC", "SimSun", "STSong", serif' : 'Georgia, "Times New Roman", serif'};
      font-size: 10pt;
      line-height: 1.35;
    }
    ${markmapCss}
    html, body { width: ${printMetrics.widthMm}mm; height: ${printMetrics.heightMm}mm; }
    body { display: grid; place-items: center; margin: 0; background: #fff; color: #111; overflow: hidden; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    main { box-sizing: border-box; width: ${printMetrics.widthMm}mm; height: ${printMetrics.sheetHeightMm}mm; padding: 0; overflow: hidden; break-inside: avoid; page-break-inside: avoid; background: #fff; }
    .docmap-print-tree { box-sizing: border-box; width: 100%; height: 100%; overflow: hidden; border: 0; scrollbar-gutter: auto; background: #fff; }
    .docmap-print-tree .docmap-markmap-frame { width: 100%; height: 100%; min-height: 0; background: #fff; }
    .docmap-print-tree .docmap-markmap-svg { width: 100%; height: 100%; min-height: 0; background: #fff; }
    .docmap-print-tree .docmap-balanced-center-box { fill: #fff; stroke: #111; stroke-width: 2px; }
    .docmap-print-tree .docmap-mm-balanced-root > circle,
    .docmap-print-tree .docmap-mm-balanced-root > line { opacity: 0; pointer-events: none; }
    .docmap-print-tree .docmap-markmap-svg .markmap-foreign,
    .docmap-print-tree .docmap-markmap-svg foreignObject { overflow: visible; }
    pre { white-space: pre-wrap; font-family: Menlo, Monaco, Consolas, monospace; font-size: 8.5pt; }
    @media screen {
      html, body { width: auto; height: auto; }
      body { display: block; padding: 24px; background: #d8d8d8; }
      main { width: ${printMetrics.previewWidth}px; max-width: calc(100vw - 48px); height: ${printMetrics.previewHeight}px; max-height: none; margin: 0 auto; background: #fff; box-shadow: 0 2px 18px rgba(0,0,0,0.24); box-sizing: border-box; }
    }
  </style>
</head>
<body class="${bodyClass}" data-docmap-layout="${layout}">
  <main aria-label="${escapeHtml(title)}">
    <section class="docmap-tree docmap-print-tree">
      <div class="docmap-markmap-frame">${svgHtml || `<pre>${markdownFallback}</pre>`}</div>
    </section>
  </main>
</body>
</html>`;
}

async function printCurrentDocMapPdf() {
  if (!currentDocMap) return;
  await prepareDocMapSvgForPrint();
  const printMetrics = docMapPrintPageMetrics(docMapLayoutFor(currentDocMap));
  const printWindow = window.open("", "_blank", `width=${printMetrics.popupWidth},height=${printMetrics.popupHeight}`);
  if (!printWindow) {
    setStatus(t("docmap_pdf_blocked"));
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildDocMapPrintHtml(currentDocMap));
  printWindow.document.close();
  setStatus(t("docmap_pdf_printing", currentDocMap.title || t("docmap")));
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      setStatus(t("docmap_pdf_blocked"));
    }
  }, 120);
}

function openSavedDocMapFile(file) {
  if (!file) return false;
  captureActiveDocMapTabState();
  const restoredMap = file.docMap || restoreDocMapFromMarkdown(file.body || "", {
    label: file.name || t("docmap"),
    scope: "documents",
    meta: { fileId: file.id },
    allowGeneric: /^DocMap\b/i.test(file.name || ""),
  });
  if (!restoredMap) return false;
  if (!file.docMap) {
    file.docMap = structuredClone(restoredMap);
    file.updatedAt = new Date().toISOString();
    saveDeskState();
  }
  const map = structuredClone(restoredMap);
  if (map.kind !== "videoDocMap") map.layout = docMapLayoutFor(map);
  map.status = "saved";
  map.sourceLabel = map.sourceLabel || file.name || t("docmap");
  const origin = map.kind === "videoDocMap" && map.sourceMeta?.fileName
    ? {
      app: "reader",
      scope: "videoTranscript",
      fileName: map.sourceMeta.fileName,
      title: map.sourceLabel || file.name || map.title || t("docmap"),
    }
    : { app: "teachText", scope: "documents", documentId: file.id, title: file.name || map.title || t("docmap") };
  const tab = typeof upsertDocumentTab === "function" ? upsertDocumentTab("docMap", "docmap", {
    title: file.name || map.title || t("docmap"),
    backing: { type: "projectText", id: file.id },
    state: {
      map: structuredClone(map),
      selectedNodeId: "central",
      origin,
    },
  }) : null;
  if (tab && typeof setActiveDocumentTab === "function") setActiveDocumentTab("docMap", tab.id);
  currentDocMap = map;
  selectedChatFileId = file.id;
  selectedDocMapNodeId = "central";
  renderDocMapTabs();
  renderDocMap();
  openWindow("docMap");
  setStatus(t("docmap_reopened", file.name || t("docmap")));
  return true;
}

async function askDocMapQuestion(event) {
  event?.preventDefault();
  const question = (docMapQuestionInput?.value || "").trim();
  if (!question) return;
  if (!currentDocMap) {
    setStatus(t("docmap_no_text"));
    return;
  }

  const node = selectedDocMapNode();
  const zh=currentLanguage==="zh";
  const prompt = [
    resolveWritingRoutePrompt("other-apps.docmap-source-question", zh ? "zh" : "en"),
    typeof sideAskAnswerStyleInstruction === "function" ? sideAskAnswerStyleInstruction() : (zh ? "回答要短、自然，不要写审稿报告。" : "Be brief and natural; do not write a review report."),
    typeof ragGroundingInstruction === "function" ? ragGroundingInstruction(zh ? "DocMap" : "The DocMap") : (zh ? "DocMap 是主要依据，不是回答边界；请区分原文、推断和需要核对的部分。" : "The DocMap is primary grounding, not the answer boundary; distinguish source text, inference, and points to check."),
    "",
    `${zh?"用户问题":"Question"}:\n${question}`,
    "",
    node ? [
      zh?"当前聚焦节点:":"Focused node:",
      `${zh?"标题":"Title"}: ${node.title}`,
      node.summary ? `${zh?"摘要":"Summary"}: ${node.summary}` : "",
      node.quote ? `${zh?"原文摘录":"Source quote"}: ${node.quote}` : "",
    ].filter(Boolean).join("\n") : "",
    "",
    `${zh?"来源文件":"Source"}:\n${currentDocMap.sourceLabel || t("docmap_no_source")}`,
    zh?"整张 DocMap（按预算裁剪）:":"Full Map (budget-clipped):",
    clipContextContent(formatDocMapMarkdown(currentDocMap), 9000),
  ].filter(Boolean).join("\n");

  const paired = await arrangeDocMapAssistantSplit();
  if (!paired) return;
  docMapQuestionInput.value = "";
  markAskBarSent("docMap");
  setStatus(t("docmap_question_sent"));
  await submitUserText(prompt, { displayText: `${t("docmap")}: ${question}`, skipContext: true, taskKind: "docmap-question" });
}

function docMapHkrrTheoryReviewPrompt(map = currentDocMap) {
  const zh = currentLanguage === "zh";
  const focusedNode = selectedDocMapNode();
  const focusedBranch = focusedNode ? docMapNodeSubtreeMarkdown(focusedNode, map) : "";
  const mapMarkdown = formatDocMapMarkdown(map);
  if (zh) {
    return [
      "用 HKRR 理论审视这张 DocMap。HKRR 指 Happiness（快乐/发现感）、Knowledge（知识/信息增量）、Resonance（共鸣/人的感受）、Rhythm（节奏/爆点与呼吸）。",
      "请判断这张图作为写作结构是否好看、有料、有共鸣、读得下去。不要事实核查，不要来源引用，不要重写整张图，不要打分，不要排名，不要追求爆款。",
      "返回 Markdown。请用简短报告，不要输出长表格。",
      "固定输出这些小节：",
      "1. 总判断：用 2-3 句话说明这张图目前最成立和最不成立的地方。",
      "2. HKRR 观察：分别写 Happiness / Knowledge / Resonance / Rhythm，每项最多 2 条，必须指向具体节点或分支。",
      "3. 结构风险：指出重复、断裂、概念空转、缺少例子/证据/场景、缺少回扣的地方；没有就写“暂未发现明显问题”。",
      "4. 先改这 3 个节点：列 3 条，每条包含节点名、为什么先改、一个可执行改法。",
      "方向要写创作动作，例如补一个反直觉切入、增加具体画面、把知识点消化成一句人话、补一个情绪落点、增加停顿或短句断行。",
      "不要把 HKRR 解释成事实准确性检查；不要把它变成营销建议。",
      "",
      `DocMap 标题：${map?.title || t("docmap")}`,
      `来源文件：${map?.sourceLabel || t("docmap_no_source")}`,
      focusedBranch ? `当前聚焦分支：\n${clipContextContent(focusedBranch, 2200)}` : "",
      "",
      `DocMap：\n${clipContextContent(mapMarkdown, 7000)}`,
    ].filter(Boolean).join("\n");
  }
  return [
    "Review this DocMap with HKRR theory. HKRR means Happiness (delight/discovery), Knowledge (information gain), Resonance (human feeling), and Rhythm (beats, turns, and breathing room).",
    "Judge whether this map can support writing that is interesting, substantive, resonant, and readable. Do not fact-check, cite sources, rewrite the whole map, score, rank, or chase virality.",
    "Return Markdown as a short report, not a long table.",
    "Use these fixed sections:",
    "1. Overall judgment: 2-3 sentences on what works and what does not.",
    "2. HKRR observations: Happiness / Knowledge / Resonance / Rhythm, at most 2 notes each, each tied to concrete nodes or branches.",
    "3. Structural risks: repetition, breaks, abstract nodes without examples/evidence/scenes, or missing callbacks. If none, say so.",
    "4. Fix these 3 nodes first: node name, why, and one actionable revision move.",
    "Directions must be creative moves: add a counterintuitive hook, add a concrete image, digest a knowledge point into plain language, add an emotional landing, or create breathing room with short sentences.",
    "Do not treat HKRR as fact-checking or marketing advice.",
    "",
    `DocMap title: ${map?.title || t("docmap")}`,
    `Source file: ${map?.sourceLabel || t("docmap_no_source")}`,
    focusedBranch ? `Focused branch:\n${clipContextContent(focusedBranch, 2200)}` : "",
    "",
    `DocMap:\n${clipContextContent(mapMarkdown, 7000)}`,
  ].filter(Boolean).join("\n");
}

async function askDocMapHkrrTheoryReview() {
  if (!currentDocMap) {
    setStatus(t("docmap_no_text"));
    return;
  }
  const prompt = docMapHkrrTheoryReviewPrompt(currentDocMap);
  const paired = await arrangeDocMapAssistantSplit();
  if (!paired) return;
  setStatus(currentLanguage === "zh" ? "正在让 ClioTalk 用 HKRR 理论审视这张图..." : "Asking ClioTalk to review this map with HKRR theory...");
  await submitUserText(prompt, {
    displayText: currentLanguage === "zh" ? "用 HKRR 理论审视这张图" : "Review this map with HKRR theory",
    skipContext: true,
    taskKind: "docmap-hkrr",
  });
}
