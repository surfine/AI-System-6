// Feature module: ClioChart concept diagrams — prose drawn as a flow, a
// timeline, a hierarchy, a two-sided comparison or a cycle.
//
// Loaded with ClioChart. The model proposes boxes and wires; every box keeps
// the source sentence it stands on, and a number in a label must be a number
// that sentence writes. The writer then owns the drawing: boxes move, wires
// and groups are added or removed, and the program only re-places things when
// asked to tidy or to change the way of drawing. The first half is pure (the
// contract runs it in a vm); the second half is the canvas.

window.AISystem6ClioDiagramLoaded = true;

const CLIO_DIAGRAM_KINDS = Object.freeze(["flow", "timeline", "tree", "compare", "cycle"]);
const CLIO_DIAGRAM_WIDTH = 1200;
const CLIO_DIAGRAM_MIN_HEIGHT = 560;
const CLIO_DIAGRAM_NODE_HEIGHT = 56;
const CLIO_DIAGRAM_LABEL_MAX = 28;
const CLIO_DIAGRAM_EDGE_LABEL_MAX = 12;
const CLIO_DIAGRAM_MAX_NODES = 14;

// --- grounding --------------------------------------------------------------

function clioDiagramGrams(text) {
  const plain = clioChartFold(text).replace(/[\s\p{P}\p{S}]+/gu, "");
  const grams = new Set();
  for (let index = 0; index < plain.length - 1; index += 1) grams.add(plain.slice(index, index + 2));
  return grams;
}

function clioDiagramOverlap(a, b) {
  const left = clioDiagramGrams(a);
  const right = clioDiagramGrams(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((gram) => { if (right.has(gram)) shared += 1; });
  return (2 * shared) / (left.size + right.size);
}

// The sentence a box stands on: the model's quote when it is the source's own
// words, else the source sentence that shares most of the quote (a model that
// trims a comma should not lose the box). Nothing close enough means the box
// has no ground and is not drawn.
// How much of a short label a sentence covers: a compressed label is a part
// of its sentence, so similarity of the whole would always fall short.
function clioDiagramCoverage(label, sentence) {
  const part = clioDiagramGrams(label);
  if (!part.size) return 0;
  const whole = clioDiagramGrams(sentence);
  let shared = 0;
  part.forEach((gram) => { if (whole.has(gram)) shared += 1; });
  return shared / part.size;
}

function clioDiagramAnchor(quote, label, source) {
  const foldedQuote = clioChartFold(quote);
  if (foldedQuote && source.folded.includes(foldedQuote)) return String(quote).trim();
  const fromQuote = !!String(quote || "").trim();
  let best = "";
  let score = 0;
  source.sentences.forEach((sentence) => {
    const value = fromQuote ? clioDiagramOverlap(quote, sentence) : clioDiagramCoverage(label, sentence);
    if (value > score) { score = value; best = sentence; }
  });
  return score >= (fromQuote ? 0.45 : 0.6) ? best : "";
}

function clioDiagramId(value, index, used) {
  let id = String(value || "").replace(/[^\w-]/g, "").slice(0, 16) || `n${index + 1}`;
  while (used.has(id)) id = `${id}_`;
  used.add(id);
  return id;
}

/**
 * Grounds one model candidate drawn as a concept diagram.
 *
 * @param {any} candidate
 * @param {string} sourceText
 * @returns {{diagram: object, kept: number, dropped: number}|null}
 */
function groundClioDiagramCandidate(candidate, sourceText) {
  if (!candidate || typeof candidate !== "object") return null;
  const source = clioChartGroundingSource(sourceText);
  const kind = CLIO_DIAGRAM_KINDS.includes(candidate.kind) ? candidate.kind : "flow";
  const used = new Set();
  const renamed = new Map();
  let dropped = 0;
  const nodes = [];
  (Array.isArray(candidate.nodes) ? candidate.nodes : []).slice(0, CLIO_DIAGRAM_MAX_NODES).forEach((raw, index) => {
    const label = clioChartCleanText(raw?.label, CLIO_DIAGRAM_LABEL_MAX);
    if (!label) return;
    const quote = clioDiagramAnchor(raw?.quote, label, source);
    // A compressed label may say less than its sentence, never a number the
    // sentence does not write.
    const quoted = clioChartNumbersIn(quote);
    if (!quote || clioChartNumbersIn(label).some((value) => !quoted.includes(value))) {
      dropped += 1;
      return;
    }
    const id = clioDiagramId(raw?.id, index, used);
    renamed.set(String(raw?.id ?? id), id);
    nodes.push({ id, label, quote, col: raw?.col === 1 ? 1 : 0, head: raw?.head === true });
  });
  const ids = new Set(nodes.map((node) => node.id));
  const resolve = (value) => renamed.get(String(value)) || (ids.has(String(value)) ? String(value) : "");
  const edges = [];
  (Array.isArray(candidate.edges) ? candidate.edges : []).forEach((raw, index) => {
    const from = resolve(Array.isArray(raw) ? raw[0] : raw?.from);
    const to = resolve(Array.isArray(raw) ? raw[1] : raw?.to);
    if (!from || !to || from === to || edges.some((edge) => edge.from === from && edge.to === to)) return;
    const label = clioChartCleanText(raw?.label, CLIO_DIAGRAM_EDGE_LABEL_MAX);
    edges.push({ id: `e${index + 1}`, from, to, label: clioChartNumbersStandInSource(label, source) ? label : "" });
  });
  const groups = (Array.isArray(candidate.groups) ? candidate.groups : []).map((raw, index) => ({
    id: `g${index + 1}`,
    label: clioChartCleanText(raw?.label, 16),
    nodes: (Array.isArray(raw?.nodes) ? raw.nodes : []).map(resolve).filter(Boolean),
  })).filter((group) => group.nodes.length >= 2);
  const title = clioChartCleanText(candidate.title, 60);
  return {
    diagram: {
      v: 1,
      kind,
      title: clioChartNumbersStandInSource(title, source) ? title : "",
      why: clioChartCleanText(candidate.why, 24),
      cols: kind === "compare" ? [0, 1].map((column) => clioChartCleanText(candidate.cols?.[column], 16)) : [],
      nodes,
      edges,
      groups,
    },
    kept: nodes.length,
    dropped,
  };
}

// A long text keeps its outline for a drawing of its main line: every heading,
// the first sentences of each paragraph, and every sentence with a number.
function clioDiagramPackSource(text, budget = 9000) {
  const source = String(text || "").trim();
  if (source.length <= budget) return source;
  const lines = [];
  let used = 0;
  const take = (line) => {
    if (!line || used + line.length > budget) return;
    lines.push(line);
    used += line.length + 1;
  };
  source.split(/\n{2,}/).forEach((paragraph) => {
    const block = paragraph.trim();
    if (/^#{1,4}\s/.test(block)) return take(block);
    const sentences = clioChartSourceSentences(block);
    take(sentences.slice(0, 2).join(""));
    sentences.slice(2).filter((sentence) => /\d/.test(sentence)).forEach(take);
  });
  return lines.join("\n\n");
}

// --- streaming --------------------------------------------------------------
// The model's answer arrives a few characters at a time. Each candidate is
// drawn the moment its object closes, so the gallery lights one card at a time
// instead of waiting for the whole answer.
function clioDiagramStreamCandidates(text) {
  const body = String(text || "");
  const key = body.indexOf('"candidates"');
  if (key < 0) return [];
  const open = body.indexOf("[", key);
  if (open < 0) return [];
  const found = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = open + 1; index < body.length; index += 1) {
    const char = body[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try { found.push(JSON.parse(body.slice(start, index + 1))); } catch (error) { /* a broken object is skipped */ }
        start = -1;
      }
    } else if (char === "]" && depth === 0) {
      break;
    }
  }
  return found;
}

// --- layout -----------------------------------------------------------------

function clioDiagramNodeWidth(label) {
  const text = String(label || "");
  const units = [...text].reduce((sum, char) => sum + (/[\u0000-ÿ]/.test(char) ? 0.56 : 1), 0);
  const perLine = Math.min(units, 12);
  return Math.round(Math.max(110, Math.min(220, 32 + perLine * 15)));
}

// Reading order follows the wires: after a box comes the box it points to,
// and only when a chain ends does the next unplaced box start a new one — so
// a side remark ("有人担心…") stays next to what it remarks on.
function clioDiagramOrder(diagram) {
  const pointedAt = new Set(diagram.edges.map((edge) => edge.to));
  const pending = diagram.nodes.slice();
  const order = [];
  const take = (node) => {
    order.push(node);
    pending.splice(pending.indexOf(node), 1);
  };
  while (pending.length) {
    const last = order[order.length - 1];
    const next = last
      && diagram.edges
        .filter((edge) => edge.from === last.id)
        .map((edge) => pending.find((node) => node.id === edge.to))
        .find(Boolean);
    take(next || pending.find((node) => !pointedAt.has(node.id)) || pending[0]);
  }
  return order;
}

/**
 * Places every box for one way of drawing. The diagram's content is never
 * changed here — only x, y, w and the canvas height.
 */
function layoutClioDiagram(input, kind = input.kind) {
  const diagram = structuredClone(input);
  diagram.kind = CLIO_DIAGRAM_KINDS.includes(kind) ? kind : "flow";
  const W = CLIO_DIAGRAM_WIDTH;
  const H = CLIO_DIAGRAM_NODE_HEIGHT;
  diagram.nodes.forEach((node) => { node.w = clioDiagramNodeWidth(node.label); });
  const ordered = clioDiagramOrder(diagram);
  let height = CLIO_DIAGRAM_MIN_HEIGHT;

  if (diagram.kind === "timeline") {
    const axis = 300;
    // A few events sit close together in the middle instead of at the edges.
    const step = Math.min(280, (W - 160) / Math.max(1, ordered.length - 1));
    const start = W / 2 - (step * (ordered.length - 1)) / 2;
    ordered.forEach((node, index) => {
      const cx = start + index * step;
      node.x = Math.round(Math.max(10, Math.min(W - node.w - 10, cx - node.w / 2)));
      node.y = index % 2 ? axis + 60 : axis - 60 - H;
    });
    diagram.axisY = axis;
  } else if (diagram.kind === "tree") {
    const level = new Map();
    ordered.forEach((node) => {
      const parents = diagram.edges.filter((edge) => edge.to === node.id).map((edge) => level.get(edge.from) ?? 0);
      level.set(node.id, parents.length ? Math.max(...parents) + 1 : 0);
    });
    const rows = [];
    ordered.forEach((node) => {
      const depth = Math.min(level.get(node.id) || 0, 4);
      (rows[depth] ||= []).push(node);
    });
    rows.forEach((row, depth) => {
      const step = Math.min(300, W / (row.length + 1));
      const start = W / 2 - (step * (row.length - 1)) / 2;
      row.forEach((node, index) => {
        node.x = Math.round(start + step * index - node.w / 2);
        node.y = 50 + depth * 150;
      });
    });
    height = Math.max(height, 50 + rows.length * 150 + 40);
  } else if (diagram.kind === "compare") {
    [0, 1].forEach((column) => {
      const list = ordered.filter((node) => (node.col || 0) === column);
      const step = Math.min(110, (CLIO_DIAGRAM_MIN_HEIGHT - 150) / Math.max(1, list.length));
      list.forEach((node, index) => {
        node.w = Math.max(node.w, 240);
        node.x = Math.round((column === 0 ? W * 0.27 : W * 0.73) - node.w / 2);
        node.y = Math.round(110 + index * Math.max(step, 76));
      });
      height = Math.max(height, 110 + list.length * Math.max(step, 76) + 40);
    });
  } else if (diagram.kind === "cycle") {
    const radius = 210;
    const cx = W / 2;
    const cy = 280;
    ordered.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, ordered.length)) * Math.PI * 2;
      node.x = Math.round(cx + Math.cos(angle) * radius * 1.45 - node.w / 2);
      node.y = Math.round(cy + Math.sin(angle) * radius - H / 2);
    });
  } else {
    // Long labels get three to a row, so a wire between them has room for its words.
    const wide = ordered.reduce((sum, node) => sum + node.w, 0) / Math.max(1, ordered.length) > 170;
    const perRow = wide ? 3 : 4;
    const step = (W - 80) / perRow;
    ordered.forEach((node, index) => {
      const row = Math.floor(index / perRow);
      const column = row % 2 ? perRow - 1 - (index % perRow) : index % perRow;
      node.x = Math.round(40 + column * step + (step - node.w) / 2);
      node.y = 70 + row * 170;
    });
    height = Math.max(height, 70 + Math.ceil(ordered.length / perRow) * 170 + 20);
  }
  diagram.height = Math.round(height);
  return diagram;
}

// --- drawing ----------------------------------------------------------------

function clioDiagramWrap(label, width, maxLines = 2) {
  const room = Math.max(4, Math.floor((width - 20) / 15));
  // A run of digits or Latin letters breaks as one piece: "11 次" never
  // becomes "1" on one line and "1 次" on the next.
  const pieces = String(label || "").match(/[0-9A-Za-z.,:%/+-]+|\s+|./gu) || [];
  const lines = [];
  let line = "";
  let units = 0;
  pieces.forEach((piece) => {
    const size = [...piece].reduce((sum, char) => sum + (char.charCodeAt(0) < 256 ? 0.56 : 1), 0);
    if (units + size > room && line.trim()) { lines.push(line.trim()); line = ""; units = 0; }
    if (!line && !piece.trim()) return;
    line += piece;
    units += size;
  });
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
  }
  return lines;
}

// Where a wire from a box's centre leaves its border, so arrows touch boxes
// instead of disappearing under them.
function clioDiagramPort(node, toward) {
  const cx = node.x + node.w / 2;
  const cy = node.y + CLIO_DIAGRAM_NODE_HEIGHT / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const scale = Math.min(
    dx ? (node.w / 2 + 4) / Math.abs(dx) : Infinity,
    dy ? (CLIO_DIAGRAM_NODE_HEIGHT / 2 + 4) / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function clioDiagramCentre(node) {
  return { x: node.x + node.w / 2, y: node.y + CLIO_DIAGRAM_NODE_HEIGHT / 2 };
}

function clioDiagramWire(diagram, edge) {
  const from = diagram.nodes.find((node) => node.id === edge.from);
  const to = diagram.nodes.find((node) => node.id === edge.to);
  if (!from || !to) return null;
  const a = clioDiagramPort(from, clioDiagramCentre(to));
  const b = clioDiagramPort(to, clioDiagramCentre(from));
  return { a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

// Hidden boxes (the layers panel's eye) are left out of every drawing — the
// canvas, the SVG a slide carries and the Markdown outline — and so are the
// wires to them. They stay in the document and come back when shown.
// The drawing an SVG of ours carries, or null for any other SVG.
function clioDiagramFromSvg(text) {
  const match = String(text || "").match(/<metadata id="clio-embed" data-kind="diagram">([A-Za-z0-9+/=]+)<\/metadata>/);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const diagram = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    return Array.isArray(diagram?.nodes) && Array.isArray(diagram?.edges) ? diagram : null;
  } catch {
    return null;
  }
}

function clioDiagramShown(diagram) {
  if (!diagram?.nodes?.some((node) => node.hidden)) return diagram;
  const hidden = new Set(diagram.nodes.filter((node) => node.hidden).map((node) => node.id));
  return {
    ...diagram,
    nodes: diagram.nodes.filter((node) => !hidden.has(node.id)),
    edges: diagram.edges.filter((edge) => !hidden.has(edge.from) && !hidden.has(edge.to)),
    groups: diagram.groups.map((group) => ({ ...group, nodes: group.nodes.filter((id) => !hidden.has(id)) })),
  };
}

function clioDiagramGroupBox(diagram, group) {
  const members = diagram.nodes.filter((node) => group.nodes.includes(node.id));
  if (members.length < 2) return null;
  const left = Math.min(...members.map((node) => node.x)) - 18;
  const top = Math.min(...members.map((node) => node.y)) - 34;
  const right = Math.max(...members.map((node) => node.x + node.w)) + 18;
  const bottom = Math.max(...members.map((node) => node.y + CLIO_DIAGRAM_NODE_HEIGHT)) + 18;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * The diagram as a self-contained SVG: the same drawing a deck page carries,
 * a gallery thumbnail shows and a saved document can be re-drawn from.
 */
function clioDiagramSvg(input, paletteInput = {}, options = {}) {
  const diagram = clioDiagramShown(input.nodes.every((node) => Number.isFinite(node.x)) ? input : layoutClioDiagram(input));
  const palette = { ink: "#111111", tint: "#e8e8e8", paper: "#ffffff", muted: "#555555", radius: 0, ...paletteInput };
  const esc = clioChartSvgEscape;
  const top = options.heading ? 70 : 0;
  const height = (diagram.height || CLIO_DIAGRAM_MIN_HEIGHT) + top;
  const parts = [];
  parts.push(`<defs><marker id="cd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${palette.ink}"/></marker>
    <style>text{font-family:${palette.body || "-apple-system, 'PingFang SC', Helvetica, sans-serif"};fill:${palette.ink}}</style></defs>`);
  if (palette.paper && palette.paper !== "transparent") parts.push(`<rect x="0" y="0" width="${CLIO_DIAGRAM_WIDTH}" height="${height}" fill="${palette.paper}"/>`);
  if (options.heading) parts.push(`<text x="40" y="48" font-size="30" font-weight="600">${esc(options.heading)}</text>`);
  parts.push(`<g transform="translate(0 ${top})">`);
  diagram.groups.forEach((group) => {
    const box = clioDiagramGroupBox(diagram, group);
    if (!box) return;
    parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${palette.radius ? 14 : 0}" fill="${palette.tint}" fill-opacity=".45" stroke="${palette.ink}" stroke-dasharray="6 5"/>`);
    if (group.label) parts.push(`<text x="${box.x + 12}" y="${box.y + 22}" font-size="17" font-weight="600">${esc(group.label)}</text>`);
  });
  if (diagram.kind === "timeline") {
    const ends = diagram.nodes.length ? [Math.min(...diagram.nodes.map((node) => node.x)) - 20, Math.max(...diagram.nodes.map((node) => node.x + node.w)) + 20] : [40, CLIO_DIAGRAM_WIDTH - 40];
    parts.push(`<line x1="${ends[0]}" y1="${diagram.axisY || 300}" x2="${ends[1]}" y2="${diagram.axisY || 300}" stroke="${palette.ink}" stroke-width="3"/>`);
  }
  if (diagram.kind === "compare") {
    diagram.cols.forEach((title, column) => {
      if (title) parts.push(`<text x="${column === 0 ? CLIO_DIAGRAM_WIDTH * 0.27 : CLIO_DIAGRAM_WIDTH * 0.73}" y="70" font-size="24" font-weight="700" text-anchor="middle">${esc(title)}</text>`);
    });
    parts.push(`<line x1="${CLIO_DIAGRAM_WIDTH / 2}" y1="40" x2="${CLIO_DIAGRAM_WIDTH / 2}" y2="${height - top - 20}" stroke="${palette.ink}" stroke-opacity=".35"/>`);
  }
  diagram.edges.forEach((edge) => {
    const wire = clioDiagramWire(diagram, edge);
    if (!wire) return;
    const arrow = diagram.kind === "compare" ? "" : ' marker-end="url(#cd-arrow)"';
    const dash = diagram.kind === "compare" ? ' stroke-dasharray="4 5"' : "";
    parts.push(`<line x1="${wire.a.x.toFixed(1)}" y1="${wire.a.y.toFixed(1)}" x2="${wire.b.x.toFixed(1)}" y2="${wire.b.y.toFixed(1)}" stroke="${palette.ink}" stroke-width="2"${arrow}${dash}/>`);
    if (edge.label) {
      const width = [...edge.label].length * 15 + 14;
      parts.push(`<rect x="${(wire.mid.x - width / 2).toFixed(1)}" y="${(wire.mid.y - 13).toFixed(1)}" width="${width}" height="24" fill="${palette.paper === "transparent" ? palette.tint : palette.paper}"/><text x="${wire.mid.x.toFixed(1)}" y="${(wire.mid.y + 5).toFixed(1)}" font-size="15" text-anchor="middle">${esc(edge.label)}</text>`);
    }
  });
  diagram.nodes.forEach((node) => {
    const lines = clioDiagramWrap(node.label, node.w);
    const fill = node.head ? palette.ink : (palette.paper === "transparent" ? palette.tint : palette.paper);
    const ink = node.head ? (palette.paper === "transparent" ? "#ffffff" : palette.paper) : palette.ink;
    parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${CLIO_DIAGRAM_NODE_HEIGHT}" rx="${palette.radius ? 12 : 0}" fill="${fill}" stroke="${palette.ink}" stroke-width="1.5"/>`);
    const first = node.y + CLIO_DIAGRAM_NODE_HEIGHT / 2 + 6 - (lines.length - 1) * 10;
    lines.forEach((line, index) => {
      parts.push(`<text x="${node.x + node.w / 2}" y="${first + index * 20}" font-size="17" text-anchor="middle"${node.head ? ' font-weight="700"' : ""} style="fill:${ink}">${esc(line)}</text>`);
    });
  });
  parts.push("</g>");
  const label = options.heading || diagram.title || "";
  // `fit` crops to what is drawn, so a small drawing fills a slide or a
  // thumbnail instead of sitting small in an empty 1200-wide sheet.
  let box = { x: 0, y: 0, w: CLIO_DIAGRAM_WIDTH, h: height };
  if (options.fit && diagram.nodes.length) {
    const groupBoxes = diagram.groups.map((group) => clioDiagramGroupBox(diagram, group)).filter(Boolean);
    const lefts = [...diagram.nodes.map((node) => node.x), ...groupBoxes.map((item) => item.x)];
    const rights = [...diagram.nodes.map((node) => node.x + node.w), ...groupBoxes.map((item) => item.x + item.w)];
    const tops = [...diagram.nodes.map((node) => node.y), ...groupBoxes.map((item) => item.y), ...(diagram.kind === "compare" ? [40] : [])];
    const bottoms = [...diagram.nodes.map((node) => node.y + CLIO_DIAGRAM_NODE_HEIGHT), ...groupBoxes.map((item) => item.y + item.h)];
    const pad = 30;
    const x = Math.max(0, Math.min(...lefts) - pad - (diagram.kind === "compare" ? 60 : 0));
    const right = Math.min(CLIO_DIAGRAM_WIDTH, Math.max(...rights) + pad + (diagram.kind === "compare" ? 60 : 0));
    const y = Math.max(0, Math.min(...tops) - pad) + top;
    const bottom = Math.max(...bottoms) + pad + top;
    box = { x: Math.round(x), y: options.heading ? 0 : Math.round(y), w: Math.round(right - x), h: Math.round(bottom - (options.heading ? 0 : y)) };
  }
  // The drawing's own data rides inside the picture (vectorcraft's "preserve
  // editing"): an SVG saved out of a slide and dropped back on ClioChart opens
  // as the editable drawing, hidden boxes included.
  const keep = options.preserve === false ? "" : `<metadata id="clio-embed" data-kind="diagram">${clioChartBase64(JSON.stringify(input))}</metadata>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${box.w}" height="${box.h}" role="img" aria-label="${esc(label)}">${keep}${parts.join("")}</svg>`;
}

// What a saved diagram reads like in TeachText: the boxes as a list with their
// sources, then the wires. The drawing itself rides along on the document.
function clioDiagramMarkdown(whole, sourceLabel = "") {
  const diagram = clioDiagramShown(whole);
  const name = (id) => diagram.nodes.find((node) => node.id === id)?.label || id;
  const zh = typeof currentLanguage === "undefined" || currentLanguage === "zh";
  const lines = [`# ${diagram.title || t("clio_chart_label")}`, "", `<!-- cliodiagram: ${diagram.kind} -->`, ""];
  diagram.nodes.forEach((node) => {
    lines.push(`- ${node.label}${node.quote ? (zh ? `（出处：「${node.quote}」）` : ` (source: "${node.quote}")`) : ""}`);
  });
  if (diagram.edges.length) {
    lines.push("");
    diagram.edges.forEach((edge) => lines.push(`- ${name(edge.from)} → ${name(edge.to)}${edge.label ? `（${edge.label}）` : ""}`));
  }
  if (sourceLabel) lines.push("", `${t("clio_chart_saved_source")}: ${sourceLabel}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

// --- the canvas -------------------------------------------------------------

const clioDiagramState = {
  diagram: null,
  selection: [],
  edge: "",
  connect: false,
  connectFrom: "",
  history: null,
  // The box clicked last: Align lines the others up to it.
  keyId: "",
  layersPanel: null,
  scale: 1,
  temporary: true,
  source: null,
  fileId: "",
  onChange: null,
  saveTimer: 0,
  host: null,
};

function clioDiagramEls() {
  const host = clioDiagramState.host;
  return host ? {
    host,
    kind: host.querySelector(".clio-diagram-kind"),
    viewport: host.querySelector(".clio-diagram-viewport"),
    canvas: host.querySelector(".clio-diagram-canvas"),
    wires: host.querySelector(".clio-diagram-wires"),
    anchor: host.querySelector(".clio-diagram-anchor"),
    tools: host.querySelector(".clio-diagram-tools"),
  } : {};
}

function clioDiagramKindLabel(kind) {
  return t(`clio_diagram_kind_${kind}`);
}

function mountClioDiagram(container) {
  if (clioDiagramState.host?.isConnected) return clioDiagramState.host;
  const host = document.createElement("div");
  host.className = "clio-diagram";
  host.hidden = true;
  const button = (cmd, key, extra = "") => `<button class="btn" type="button" data-diagram-cmd="${cmd}" ${extra}>${escapeHtml(t(key))}</button>`;
  host.innerHTML = `
    <div class="clio-diagram-tools" role="toolbar" aria-label="${escapeHtml(t("clio_diagram_tools"))}">
      <label class="visually-hidden" for="clio-diagram-kind">${escapeHtml(t("clio_diagram_kind"))}</label>
      <div class="select-wrap"><select class="clio-diagram-kind" id="clio-diagram-kind">${CLIO_DIAGRAM_KINDS.map((kind) => `<option value="${kind}">${escapeHtml(clioDiagramKindLabel(kind))}</option>`).join("")}</select></div>
      ${button("tidy", "clio_diagram_tidy")}
      <span class="clio-diagram-sep" aria-hidden="true"></span>
      ${button("add", "clio_diagram_add")}
      ${button("connect", "clio_diagram_connect", 'aria-pressed="false"')}
      ${button("group", "clio_diagram_group")}
      ${button("ungroup", "clio_diagram_ungroup")}
      ${button("delete", "delete")}
      <span class="clio-diagram-sep" aria-hidden="true"></span>
      ${button("save", "clio_chart_save_document")}
      ${button("stage", "clio_chart_send_stage")}
      ${button("sideask", "sideask")}
    </div>
    <div class="clio-diagram-viewport window-frame-scroller" tabindex="0" aria-label="${escapeHtml(t("clio_diagram_canvas"))}">
      <div class="clio-diagram-canvas"><svg class="clio-diagram-wires" aria-hidden="true"></svg></div>
    </div>
    <div class="clio-diagram-anchor" aria-live="polite"></div>`;
  container.append(host);
  clioDiagramState.host = host;
  bindClioDiagram(host);
  return host;
}

function clioDiagramSnapshot() {
  return JSON.stringify(clioDiagramState.diagram);
}

// One history for the canvas (app/core/edit-history.js). Writing a step back
// redraws, saves, and tells whoever holds a copy (a ClioStage page) — the copy
// follows an undo the same way it follows an edit.
clioDiagramState.history = window.AISystem6EditHistory.createEditHistory({
  read: clioDiagramSnapshot,
  write: (text, { kind }) => {
    clioDiagramState.diagram = JSON.parse(text);
    if (kind === "preview") return renderClioDiagram();
    clioDiagramState.selection = [];
    clioDiagramState.edge = "";
    renderClioDiagram();
    clioDiagramPersistSoon();
    clioDiagramState.onChange?.(clioDiagramState.diagram);
  },
  limit: 100,
});

// Every change goes through here: one undo step, one redraw, and — for a saved
// diagram — the document follows a moment later.
function clioDiagramChange(mutate, options = {}) {
  const diagram = clioDiagramState.diagram;
  if (!diagram) return;
  clioDiagramState.history.change(options.label || "edit_step_change", () => mutate(diagram), { group: options.group });
  if (options.render !== false) renderClioDiagram();
  clioDiagramPersistSoon();
  clioDiagramState.onChange?.(diagram);
}

function undoClioDiagram() { return !!clioDiagramState.diagram && clioDiagramState.history.undo(); }
function redoClioDiagram() { return !!clioDiagramState.diagram && clioDiagramState.history.redo(); }

function loadClioDiagram(diagram, meta = {}) {
  clioDiagramState.diagram = Number.isFinite(diagram?.nodes?.[0]?.x) ? structuredClone(diagram) : layoutClioDiagram(diagram);
  clioDiagramState.selection = [];
  clioDiagramState.edge = "";
  clioDiagramState.connect = false;
  clioDiagramState.connectFrom = "";
  clioDiagramState.history.clear();
  clioDiagramState.temporary = meta.temporary !== false;
  clioDiagramState.source = meta.source || null;
  clioDiagramState.fileId = meta.fileId || "";
  clioDiagramState.onChange = meta.onChange || null;
  renderClioDiagram();
}

function clioDiagramScale() {
  const { viewport } = clioDiagramEls();
  const width = viewport?.clientWidth || CLIO_DIAGRAM_WIDTH;
  return Math.max(0.4, Math.min(1, (width - 16) / CLIO_DIAGRAM_WIDTH));
}

function renderClioDiagram() {
  const els = clioDiagramEls();
  const diagram = clioDiagramState.diagram && clioDiagramShown(clioDiagramState.diagram);
  if (!els.canvas || !diagram) return;
  const scale = clioDiagramScale();
  clioDiagramState.scale = scale;
  const height = Math.max(diagram.height || CLIO_DIAGRAM_MIN_HEIGHT, ...diagram.nodes.map((node) => node.y + CLIO_DIAGRAM_NODE_HEIGHT + 30));
  els.canvas.style.setProperty("--clio-diagram-width", `${CLIO_DIAGRAM_WIDTH}px`);
  els.canvas.style.setProperty("--clio-diagram-height", `${height}px`);
  els.canvas.style.setProperty("--clio-diagram-scale", String(scale));
  // A transform does not change the space a box takes, so the unscaled
  // remainder is taken back with negative margins and the scroller fits.
  els.canvas.style.setProperty("--clio-diagram-trim-x", `${Math.floor(CLIO_DIAGRAM_WIDTH * scale - CLIO_DIAGRAM_WIDTH)}px`);
  els.canvas.style.setProperty("--clio-diagram-trim-y", `${Math.floor(height * scale - height)}px`);
  els.canvas.dataset.kind = diagram.kind;
  els.kind.value = diagram.kind;
  els.canvas.querySelectorAll(".clio-diagram-node, .clio-diagram-group-label, .clio-diagram-column, .clio-diagram-axis").forEach((node) => node.remove());

  if (diagram.kind === "timeline") {
    const axis = document.createElement("div");
    axis.className = "clio-diagram-axis";
    axis.style.setProperty("--y", `${diagram.axisY || 300}px`);
    els.canvas.append(axis);
  }
  if (diagram.kind === "compare") {
    diagram.cols.forEach((title, column) => {
      const head = document.createElement("div");
      head.className = "clio-diagram-column";
      head.style.setProperty("--x", `${(column === 0 ? CLIO_DIAGRAM_WIDTH * 0.27 : CLIO_DIAGRAM_WIDTH * 0.73) - 150}px`);
      head.textContent = title;
      head.dataset.column = String(column);
      els.canvas.append(head);
    });
  }
  diagram.groups.forEach((group) => {
    const box = clioDiagramGroupBox(diagram, group);
    if (!box) return;
    const label = document.createElement("button");
    label.type = "button";
    label.className = "clio-diagram-group-label";
    label.dataset.group = group.id;
    label.style.setProperty("--x", `${box.x + 10}px`);
    label.style.setProperty("--y", `${box.y + 6}px`);
    label.textContent = group.label || t("clio_diagram_group_untitled");
    els.canvas.append(label);
  });
  diagram.nodes.forEach((node) => {
    const box = document.createElement("div");
    box.className = ["clio-diagram-node", node.head ? "is-head" : "", node.locked ? "is-locked" : "", node.quote ? "" : "is-unsourced", clioDiagramState.selection.includes(node.id) ? "is-selected" : "", clioDiagramState.connectFrom === node.id ? "is-connect-from" : ""].filter(Boolean).join(" ");
    box.dataset.node = node.id;
    box.style.setProperty("--x", `${node.x}px`);
    box.style.setProperty("--y", `${node.y}px`);
    box.style.setProperty("--w", `${node.w}px`);
    box.setAttribute("role", "button");
    box.setAttribute("tabindex", "-1");
    box.setAttribute("aria-label", node.label);
    const label = document.createElement("span");
    label.className = "clio-diagram-label";
    label.textContent = node.label;
    box.append(label);
    els.canvas.append(box);
  });
  renderClioDiagramWires();
  renderClioDiagramAnchor();
  syncClioDiagramTools();
  clioDiagramState.layersPanel?.render();
}

function renderClioDiagramWires() {
  const els = clioDiagramEls();
  const diagram = clioDiagramState.diagram && clioDiagramShown(clioDiagramState.diagram);
  if (!els.wires || !diagram) return;
  const ns = "http://www.w3.org/2000/svg";
  els.wires.replaceChildren();
  els.wires.setAttribute("viewBox", `0 0 ${CLIO_DIAGRAM_WIDTH} ${parseFloat(els.canvas.style.height) || CLIO_DIAGRAM_MIN_HEIGHT}`);
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = '<marker id="clio-diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="clio-diagram-arrowhead"/></marker>';
  els.wires.append(defs);
  diagram.groups.forEach((group) => {
    const box = clioDiagramGroupBox(diagram, group);
    if (!box) return;
    const rect = document.createElementNS(ns, "rect");
    Object.entries({ x: box.x, y: box.y, width: box.w, height: box.h, class: "clio-diagram-group" }).forEach(([key, value]) => rect.setAttribute(key, value));
    els.wires.append(rect);
  });
  diagram.edges.forEach((edge) => {
    const wire = clioDiagramWire(diagram, edge);
    if (!wire) return;
    const line = document.createElementNS(ns, "line");
    Object.entries({ x1: wire.a.x, y1: wire.a.y, x2: wire.b.x, y2: wire.b.y }).forEach(([key, value]) => line.setAttribute(key, value.toFixed(1)));
    line.setAttribute("class", `clio-diagram-wire${clioDiagramState.edge === edge.id ? " is-selected" : ""}`);
    if (diagram.kind !== "compare") line.setAttribute("marker-end", "url(#clio-diagram-arrow)");
    const hit = line.cloneNode();
    hit.removeAttribute("marker-end");
    hit.setAttribute("class", "clio-diagram-wire-hit");
    hit.dataset.edge = edge.id;
    els.wires.append(line, hit);
    if (edge.label) {
      const text = document.createElementNS(ns, "text");
      Object.entries({ x: wire.mid.x.toFixed(1), y: (wire.mid.y - 6).toFixed(1), class: "clio-diagram-wire-label", "text-anchor": "middle" }).forEach(([key, value]) => text.setAttribute(key, value));
      text.dataset.edge = edge.id;
      text.textContent = edge.label;
      els.wires.append(text);
    }
  });
}

function renderClioDiagramAnchor() {
  const els = clioDiagramEls();
  const diagram = clioDiagramState.diagram;
  if (!els.anchor || !diagram) return;
  els.anchor.replaceChildren();
  const head = document.createElement("p");
  const title = document.createElement("b");
  title.textContent = diagram.title || clioDiagramKindLabel(diagram.kind);
  head.append(title);
  if (diagram.why) head.append(document.createTextNode(`　${diagram.why}`));
  const detail = document.createElement("p");
  detail.className = "clio-diagram-anchor-source";
  const node = clioDiagramState.selection.length === 1 ? diagram.nodes.find((item) => item.id === clioDiagramState.selection[0]) : null;
  const edge = diagram.edges.find((item) => item.id === clioDiagramState.edge);
  if (node) detail.textContent = node.quote ? t("clio_chart_cell_source", node.quote) : t("clio_diagram_unsourced");
  else if (edge) detail.textContent = t("clio_diagram_edge_hint");
  else if (clioDiagramState.connect) detail.textContent = t(clioDiagramState.connectFrom ? "clio_diagram_connect_to" : "clio_diagram_connect_from");
  else if (clioDiagramState.selection.length > 1) detail.textContent = t("clio_diagram_selected_count", clioDiagramState.selection.length);
  else detail.textContent = clioDiagramState.temporary ? t("clio_diagram_hint_temporary") : t("clio_diagram_hint");
  els.anchor.append(head, detail);
}

function syncClioDiagramTools() {
  const els = clioDiagramEls();
  if (!els.tools) return;
  const count = clioDiagramState.selection.length;
  const set = (cmd, enabled) => {
    const control = els.tools.querySelector(`[data-diagram-cmd="${cmd}"]`);
    if (control) control.disabled = !enabled;
  };
  set("group", count >= 2);
  set("ungroup", clioDiagramState.diagram?.groups.some((group) => group.nodes.some((id) => clioDiagramState.selection.includes(id))));
  set("delete", count > 0 || !!clioDiagramState.edge);
  set("save", !!clioDiagramState.diagram && clioDiagramState.temporary);
  els.tools.querySelector('[data-diagram-cmd="connect"]')?.setAttribute("aria-pressed", String(clioDiagramState.connect));
}

// ---- snapping, arranging and the layers panel (the edit kernel) ----------

const clioDiagramRect = (node) => ({ id: node.id, x: node.x, y: node.y, w: node.w, h: CLIO_DIAGRAM_NODE_HEIGHT });

function clioDiagramSnapStart(origin) {
  const snapKit = window.AISystem6EditSnap;
  const diagram = clioDiagramState.diagram;
  const moving = diagram.nodes.filter((node) => origin.has(node.id));
  if (!snapKit || !moving.length) return null;
  const height = Math.max(diagram.height || CLIO_DIAGRAM_MIN_HEIGHT, ...diagram.nodes.map((node) => node.y + CLIO_DIAGRAM_NODE_HEIGHT + 30));
  return {
    // Six screen pixels, whatever the canvas is scaled to.
    snapper: snapKit.createSnapper({
      rects: diagram.nodes.filter((node) => !origin.has(node.id) && !node.hidden).map(clioDiagramRect),
      frame: { w: CLIO_DIAGRAM_WIDTH, h: height },
      threshold: 6 / (clioDiagramState.scale || 1),
    }),
    bounds: snapKit.boundsOf(moving.map(clioDiagramRect)),
  };
}

function clearClioDiagramGuides() {
  clioDiagramEls().canvas?.querySelector(".clio-diagram-guides")?.remove();
}

// Guides are lines across the paper where an edge or centre lined up; a gap
// mark shows the spacing that was matched.
function drawClioDiagramGuides(result, rect) {
  const canvas = clioDiagramEls().canvas;
  if (!canvas) return;
  let layer = canvas.querySelector(".clio-diagram-guides");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "clio-diagram-guides";
    layer.setAttribute("aria-hidden", "true");
    canvas.append(layer);
  }
  const marks = result.guides.map((guide) => {
    const line = document.createElement("div");
    line.className = `clio-diagram-guide is-${guide.axis}`;
    line.style.setProperty(guide.axis === "x" ? "--x" : "--y", `${guide.at}px`);
    return line;
  });
  const nodes = clioDiagramState.diagram.nodes;
  result.spacing.forEach((mark) => {
    const neighbour = nodes.find((node) => node.id === mark.neighbour);
    if (!neighbour) return;
    const other = clioDiagramRect(neighbour);
    const gap = document.createElement("div");
    gap.className = `clio-diagram-gap is-${mark.axis}`;
    if (mark.axis === "x") {
      const from = mark.side === "after" ? rect.x + rect.w : other.x + other.w;
      const to = mark.side === "after" ? other.x : rect.x;
      gap.style.setProperty("--x", `${Math.min(from, to)}px`);
      gap.style.setProperty("--y", `${rect.y + rect.h / 2}px`);
      gap.style.setProperty("--w", `${Math.abs(to - from)}px`);
    } else {
      const from = mark.side === "after" ? rect.y + rect.h : other.y + other.h;
      const to = mark.side === "after" ? other.y : rect.y;
      gap.style.setProperty("--x", `${rect.x + rect.w / 2}px`);
      gap.style.setProperty("--y", `${Math.min(from, to)}px`);
      gap.style.setProperty("--h", `${Math.abs(to - from)}px`);
    }
    marks.push(gap);
  });
  layer.replaceChildren(...marks);
}

const CLIO_DIAGRAM_ARRANGE = ["align-left", "align-hcenter", "align-right", "align-top", "align-vcenter", "align-bottom", "distribute-h", "distribute-v", "bring-front", "send-back", "layers"];

function clioDiagramMovable() {
  const diagram = clioDiagramState.diagram;
  return diagram ? diagram.nodes.filter((node) => clioDiagramState.selection.includes(node.id) && !node.locked && !node.hidden) : [];
}

function canArrangeClioDiagram(command) {
  if (!clioDiagramState.diagram) return false;
  if (command === "layers") return true;
  if (command.startsWith("align-")) return clioDiagramMovable().length >= 2;
  if (command.startsWith("distribute-")) return clioDiagramMovable().length >= 3;
  return clioDiagramState.selection.length > 0;
}

function arrangeClioDiagram(command) {
  if (command === "layers") return toggleClioDiagramLayers();
  if (!CLIO_DIAGRAM_ARRANGE.includes(command) || !canArrangeClioDiagram(command)) return false;
  const snapKit = window.AISystem6EditSnap;
  const ids = clioDiagramState.selection.slice();
  if (command === "bring-front" || command === "send-back") {
    clioDiagramChange((draft) => {
      const picked = draft.nodes.filter((node) => ids.includes(node.id));
      const rest = draft.nodes.filter((node) => !ids.includes(node.id));
      draft.nodes = command === "bring-front" ? [...rest, ...picked] : [...picked, ...rest];
    }, { label: "edit_step_arrange" });
    return true;
  }
  const rects = clioDiagramMovable().map(clioDiagramRect);
  const placed = command.startsWith("align-")
    ? snapKit.alignRects(rects, command.slice("align-".length), rects.some((rect) => rect.id === clioDiagramState.keyId) ? clioDiagramState.keyId : "")
    : snapKit.distributeRects(rects, command === "distribute-h" ? "x" : "y");
  clioDiagramChange((draft) => placed.forEach((spot) => {
    const node = draft.nodes.find((item) => item.id === spot.id);
    if (!node) return;
    node.x = Math.round(Math.max(0, Math.min(CLIO_DIAGRAM_WIDTH - node.w, spot.x)));
    node.y = Math.round(Math.max(0, spot.y));
  }), { label: command.startsWith("align-") ? "edit_step_align" : "edit_step_distribute" });
  return true;
}

// The layers panel: every box, top of the stack first, with an eye, a lock
// and its name. Groups are shown by indenting their members.
function toggleClioDiagramLayers(force) {
  const host = clioDiagramState.host;
  const layersKit = window.AISystem6EditLayers;
  if (!host || !layersKit) return false;
  const show = typeof force === "boolean" ? force : !clioDiagramState.layersPanel;
  if (!show) {
    host.querySelector(".clio-diagram-layers")?.remove();
    host.classList.remove("has-layers");
    clioDiagramState.layersPanel = null;
    return true;
  }
  if (clioDiagramState.layersPanel) return true;
  const panel = document.createElement("aside");
  panel.className = "clio-diagram-layers";
  host.querySelector(".clio-diagram-viewport").after(panel);
  host.classList.add("has-layers");
  const grouped = () => new Set((clioDiagramState.diagram?.groups || []).flatMap((group) => group.nodes));
  clioDiagramState.layersPanel = layersKit.createLayersPanel({
    host: panel,
    label: t("edit_kernel_layers"),
    items: () => {
      const inGroup = grouped();
      return (clioDiagramState.diagram?.nodes || []).slice().reverse().map((node) => ({
        id: node.id,
        name: node.label,
        hidden: !!node.hidden,
        locked: !!node.locked,
        depth: inGroup.has(node.id) ? 1 : 0,
      }));
    },
    selection: () => clioDiagramState.selection,
    onSelect: (ids) => {
      if (ids.length) clioDiagramState.keyId = ids[ids.length - 1];
      selectClioDiagram(ids);
      clioDiagramState.layersPanel?.render();
    },
    onToggle: (id, flag) => clioDiagramChange((draft) => {
      const node = draft.nodes.find((item) => item.id === id);
      if (node) node[flag] = !node[flag];
    }, { label: flag === "hidden" ? "edit_step_visibility" : "edit_step_lock" }),
    onRename: (id, name) => clioDiagramChange((draft) => {
      const node = draft.nodes.find((item) => item.id === id);
      if (node) node.label = name.slice(0, 80);
    }, { label: "edit_step_rename" }),
    // The panel lists top first; the document draws in array order.
    onReorder: (id, toIndex) => clioDiagramChange((draft) => {
      const from = draft.nodes.findIndex((node) => node.id === id);
      if (from < 0) return;
      const [node] = draft.nodes.splice(from, 1);
      draft.nodes.splice(draft.nodes.length - toIndex, 0, node);
    }, { label: "edit_step_arrange" }),
  });
  return true;
}

function selectClioDiagram(ids = [], edge = "") {
  clioDiagramState.selection = ids;
  clioDiagramState.edge = edge;
  clioDiagramEls().canvas?.querySelectorAll(".clio-diagram-node").forEach((box) => {
    box.classList.toggle("is-selected", ids.includes(box.dataset.node));
  });
  renderClioDiagramWires();
  renderClioDiagramAnchor();
  syncClioDiagramTools();
  window.AISystem6ClioDiagram?.onSelect?.();
}

function clioDiagramNextId(prefix) {
  const used = new Set([...clioDiagramState.diagram.nodes, ...clioDiagramState.diagram.edges, ...clioDiagramState.diagram.groups].map((item) => item.id));
  let index = used.size + 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function addClioDiagramNode(near = null) {
  const diagram = clioDiagramState.diagram;
  if (!diagram) return;
  const anchor = near ? diagram.nodes.find((node) => node.id === near) : null;
  const id = clioDiagramNextId("n");
  clioDiagramChange((draft) => {
    const label = t("clio_diagram_new_node");
    const w = clioDiagramNodeWidth(label);
    const x = anchor ? Math.min(CLIO_DIAGRAM_WIDTH - w - 10, anchor.x + anchor.w + 60) : CLIO_DIAGRAM_WIDTH / 2 - w / 2;
    const y = anchor ? anchor.y : (draft.height || CLIO_DIAGRAM_MIN_HEIGHT) - 120;
    draft.nodes.push({ id, label, quote: "", col: anchor?.col || 0, head: false, x: Math.round(x), y: Math.round(y), w });
    if (anchor) draft.edges.push({ id: clioDiagramNextId("e"), from: anchor.id, to: id, label: "" });
  }, { label: "edit_step_add_box" });
  selectClioDiagram([id]);
  editClioDiagramLabel(id);
}

function deleteClioDiagramSelection() {
  const { edge } = clioDiagramState;
  const locked = new Set(clioDiagramState.diagram?.nodes.filter((node) => node.locked).map((node) => node.id) || []);
  const selection = clioDiagramState.selection.filter((id) => !locked.has(id));
  if (!selection.length && !edge) return;
  clioDiagramChange((draft) => {
    draft.nodes = draft.nodes.filter((node) => !selection.includes(node.id));
    draft.edges = draft.edges.filter((item) => item.id !== edge && !selection.includes(item.from) && !selection.includes(item.to));
    draft.groups = draft.groups
      .map((group) => ({ ...group, nodes: group.nodes.filter((id) => !selection.includes(id)) }))
      .filter((group) => group.nodes.length >= 2);
  }, { label: "edit_step_delete" });
  selectClioDiagram([]);
}

function groupClioDiagramSelection() {
  const ids = clioDiagramState.selection.slice();
  if (ids.length < 2) return;
  clioDiagramChange((draft) => {
    draft.groups = draft.groups.map((group) => ({ ...group, nodes: group.nodes.filter((id) => !ids.includes(id)) })).filter((group) => group.nodes.length >= 2);
    draft.groups.push({ id: clioDiagramNextId("g"), label: t("clio_diagram_group_untitled"), nodes: ids });
  }, { label: "edit_step_group" });
  const group = clioDiagramState.diagram.groups.at(-1);
  editClioDiagramGroupLabel(group.id);
}

function ungroupClioDiagramSelection() {
  const ids = clioDiagramState.selection;
  clioDiagramChange((draft) => {
    draft.groups = draft.groups.filter((group) => !group.nodes.some((id) => ids.includes(id)));
  }, { label: "edit_step_ungroup" });
}

function tidyClioDiagram(kind) {
  clioDiagramChange((draft) => {
    const placed = layoutClioDiagram(draft, kind || draft.kind);
    Object.assign(draft, placed);
  }, { label: "edit_step_tidy" });
}

// Inline editors. Text the writer types is theirs: no gate runs on it, and a
// box they write keeps no source until they say where it came from.
function editClioDiagramLabel(id) {
  const box = clioDiagramEls().canvas?.querySelector(`.clio-diagram-node[data-node="${CSS.escape(id)}"]`);
  const node = clioDiagramState.diagram?.nodes.find((item) => item.id === id);
  if (!box || !node) return;
  const label = box.querySelector(".clio-diagram-label");
  label.contentEditable = "true";
  label.focus();
  document.getSelection()?.selectAllChildren(label);
  const finish = (keep) => {
    label.removeEventListener("keydown", onKey);
    label.contentEditable = "false";
    const text = label.textContent.replace(/\s+/g, " ").trim().slice(0, 80);
    if (keep && text && text !== node.label) {
      clioDiagramChange((draft) => {
        const target = draft.nodes.find((item) => item.id === id);
        target.label = text;
        target.w = Math.max(target.w, clioDiagramNodeWidth(text));
      }, { label: "edit_step_rename" });
    } else {
      label.textContent = node.label;
    }
    clioDiagramEls().viewport?.focus({ preventScroll: true });
  };
  const onKey = (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  };
  label.addEventListener("keydown", onKey);
  label.addEventListener("blur", () => { if (label.contentEditable === "true") finish(true); }, { once: true });
}

function clioDiagramFloatingInput(x, y, value, onCommit) {
  const { canvas } = clioDiagramEls();
  if (!canvas) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "clio-diagram-inline-input";
  input.value = value || "";
  input.maxLength = 24;
  input.style.setProperty("--x", `${x}px`);
  input.style.setProperty("--y", `${y}px`);
  canvas.append(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    input.remove();
    if (keep) onCommit(text);
    clioDiagramEls().viewport?.focus({ preventScroll: true });
  };
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
}

function editClioDiagramEdgeLabel(edgeId) {
  const diagram = clioDiagramState.diagram;
  const edge = diagram?.edges.find((item) => item.id === edgeId);
  const wire = edge ? clioDiagramWire(diagram, edge) : null;
  if (!wire) return;
  clioDiagramFloatingInput(wire.mid.x - 60, wire.mid.y - 16, edge.label, (text) => {
    if (text === edge.label) return;
    clioDiagramChange((draft) => { draft.edges.find((item) => item.id === edgeId).label = text.slice(0, 16); }, { label: "edit_step_rename" });
  });
}

function editClioDiagramGroupLabel(groupId) {
  const diagram = clioDiagramState.diagram;
  const group = diagram?.groups.find((item) => item.id === groupId);
  const box = group ? clioDiagramGroupBox(diagram, group) : null;
  if (!box) return;
  clioDiagramFloatingInput(box.x + 8, box.y + 4, group.label, (text) => {
    if (text === group.label) return;
    clioDiagramChange((draft) => { draft.groups.find((item) => item.id === groupId).label = text.slice(0, 16); }, { label: "edit_step_rename" });
  });
}

function editClioDiagramColumn(column) {
  const diagram = clioDiagramState.diagram;
  if (!diagram || diagram.kind !== "compare") return;
  const x = (column === 0 ? CLIO_DIAGRAM_WIDTH * 0.27 : CLIO_DIAGRAM_WIDTH * 0.73) - 90;
  clioDiagramFloatingInput(x, 46, diagram.cols[column], (text) => {
    clioDiagramChange((draft) => { draft.cols[column] = text.slice(0, 16); }, { label: "edit_step_rename" });
  });
}

function connectClioDiagram(id) {
  if (!clioDiagramState.connectFrom) {
    clioDiagramState.connectFrom = id;
    renderClioDiagram();
    return;
  }
  const from = clioDiagramState.connectFrom;
  clioDiagramState.connectFrom = "";
  clioDiagramState.connect = false;
  if (from !== id && !clioDiagramState.diagram.edges.some((edge) => edge.from === from && edge.to === id)) {
    const edgeId = clioDiagramNextId("e");
    clioDiagramChange((draft) => draft.edges.push({ id: edgeId, from, to: id, label: "" }), { label: "edit_step_connect" });
    selectClioDiagram([], edgeId);
    return;
  }
  renderClioDiagram();
}

function bindClioDiagram(host) {
  const viewport = host.querySelector(".clio-diagram-viewport");
  const canvas = host.querySelector(".clio-diagram-canvas");

  host.querySelector(".clio-diagram-tools").addEventListener("click", (event) => {
    const control = event.target.closest("[data-diagram-cmd]");
    if (!control || control.disabled) return;
    runClioDiagramCommand(control.dataset.diagramCmd);
  });
  host.querySelector(".clio-diagram-kind").addEventListener("change", (event) => {
    tidyClioDiagram(event.target.value);
    window.AISystem6ClioDiagram?.onStatus?.(t("clio_diagram_kind_changed", clioDiagramKindLabel(event.target.value)));
  });

  // One pointer path for select, multi-select (Shift), drag and connect. A drag
  // moves every selected box; the click that ends without movement selects.
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target.closest('[contenteditable="true"], .clio-diagram-inline-input')) return;
    const box = event.target.closest(".clio-diagram-node");
    const hit = event.target.closest(".clio-diagram-wire-hit, .clio-diagram-wire-label");
    const groupLabel = event.target.closest(".clio-diagram-group-label");
    viewport.focus({ preventScroll: true });
    if (groupLabel) {
      const group = clioDiagramState.diagram.groups.find((item) => item.id === groupLabel.dataset.group);
      selectClioDiagram(group ? group.nodes.slice() : []);
      return;
    }
    if (hit) { selectClioDiagram([], hit.dataset.edge); return; }
    if (!box) { if (!event.shiftKey) selectClioDiagram([]); return; }
    const id = box.dataset.node;
    if (clioDiagramState.connect) { connectClioDiagram(id); return; }
    let ids = clioDiagramState.selection;
    if (event.shiftKey) ids = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    else if (!ids.includes(id)) ids = [id];
    if (ids.includes(id)) clioDiagramState.keyId = id;
    selectClioDiagram(ids);
    if (!ids.includes(id)) return;
    const scale = clioDiagramState.scale || 1;
    const start = { x: event.clientX, y: event.clientY };
    // A locked box stays where it is while the rest of the selection moves.
    const origin = new Map(clioDiagramState.diagram.nodes.filter((node) => ids.includes(node.id) && !node.locked).map((node) => [node.id, { x: node.x, y: node.y }]));
    if (!origin.size) return;
    let moved = false;
    let snap = null;
    box.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      let dx = (moveEvent.clientX - start.x) / scale;
      let dy = (moveEvent.clientY - start.y) / scale;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!moved) {
        moved = true;
        clioDiagramState.history.begin("edit_step_move");
        snap = clioDiagramSnapStart(origin);
      }
      // The moving selection lines up with the other boxes and the paper
      // (app/core/edit-snap.js); Option held moves freely.
      if (snap) {
        const result = snap.snapper.snap({ ...snap.bounds, x: snap.bounds.x + dx, y: snap.bounds.y + dy }, { disabled: moveEvent.altKey });
        dx = result.x - snap.bounds.x;
        dy = result.y - snap.bounds.y;
        drawClioDiagramGuides(result, { ...snap.bounds, x: result.x, y: result.y });
      }
      clioDiagramState.diagram.nodes.forEach((node) => {
        const from = origin.get(node.id);
        if (!from) return;
        node.x = Math.round(Math.max(0, Math.min(CLIO_DIAGRAM_WIDTH - node.w, from.x + dx)));
        node.y = Math.round(Math.max(0, from.y + dy));
        const element = canvas.querySelector(`.clio-diagram-node[data-node="${CSS.escape(node.id)}"]`);
        element?.style.setProperty("--x", `${node.x}px`);
        element?.style.setProperty("--y", `${node.y}px`);
      });
      renderClioDiagramWires();
    };
    const up = () => {
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
      clearClioDiagramGuides();
      if (!moved) return;
      clioDiagramState.history.commit();
      renderClioDiagram();
      clioDiagramPersistSoon();
      clioDiagramState.onChange?.(clioDiagramState.diagram);
    };
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
  });
  canvas.addEventListener("dblclick", (event) => {
    const box = event.target.closest(".clio-diagram-node");
    if (box) return editClioDiagramLabel(box.dataset.node);
    const wire = event.target.closest(".clio-diagram-wire-hit, .clio-diagram-wire-label");
    if (wire) return editClioDiagramEdgeLabel(wire.dataset.edge);
    const group = event.target.closest(".clio-diagram-group-label");
    if (group) return editClioDiagramGroupLabel(group.dataset.group);
    const column = event.target.closest(".clio-diagram-column");
    if (column) return editClioDiagramColumn(Number(column.dataset.column));
    // A double-click on empty paper puts a box there.
    const rect = canvas.getBoundingClientRect();
    const scale = clioDiagramState.scale || 1;
    const id = clioDiagramNextId("n");
    clioDiagramChange((draft) => {
      const label = t("clio_diagram_new_node");
      const w = clioDiagramNodeWidth(label);
      draft.nodes.push({ id, label, quote: "", col: (event.clientX - rect.left) / scale > CLIO_DIAGRAM_WIDTH / 2 ? 1 : 0, head: false, w, x: Math.round((event.clientX - rect.left) / scale - w / 2), y: Math.round((event.clientY - rect.top) / scale - CLIO_DIAGRAM_NODE_HEIGHT / 2) });
    }, { label: "edit_step_add_box" });
    selectClioDiagram([id]);
    editClioDiagramLabel(id);
  });

  viewport.addEventListener("keydown", (event) => {
    if (event.isComposing || event.target.closest('[contenteditable="true"], input')) return;
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteClioDiagramSelection(); return; }
    if (event.key === "Enter" && clioDiagramState.selection.length === 1) { event.preventDefault(); editClioDiagramLabel(clioDiagramState.selection[0]); return; }
    if (event.key === "Tab" && clioDiagramState.selection.length === 1) { event.preventDefault(); addClioDiagramNode(clioDiagramState.selection[0]); return; }
    if (event.key === "Escape") { clioDiagramState.connect = false; clioDiagramState.connectFrom = ""; selectClioDiagram([]); return; }
    const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
    if (step && clioDiagramState.selection.length) {
      event.preventDefault();
      const ids = clioDiagramState.selection;
      clioDiagramChange((draft) => draft.nodes.forEach((node) => {
        if (!ids.includes(node.id) || node.locked) return;
        node.x = Math.max(0, node.x + step[0]);
        node.y = Math.max(0, node.y + step[1]);
      }), { label: "edit_step_move", group: "nudge" });
    }
  });

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => { if (clioDiagramState.diagram && !host.hidden) renderClioDiagram(); }).observe(viewport);
  }
}

function runClioDiagramCommand(cmd) {
  if (!clioDiagramState.diagram) return;
  if (cmd === "tidy") { tidyClioDiagram(); window.AISystem6ClioDiagram?.onStatus?.(t("clio_diagram_tidied")); return; }
  if (cmd === "add") return addClioDiagramNode(clioDiagramState.selection.length === 1 ? clioDiagramState.selection[0] : null);
  if (cmd === "connect") {
    clioDiagramState.connect = !clioDiagramState.connect;
    clioDiagramState.connectFrom = "";
    renderClioDiagram();
    return;
  }
  if (cmd === "group") return groupClioDiagramSelection();
  if (cmd === "ungroup") return ungroupClioDiagramSelection();
  if (cmd === "delete") return deleteClioDiagramSelection();
  if (cmd === "save") return saveClioDiagramDocument();
  if (cmd === "stage") return sendClioDiagramToStage();
  if (cmd === "sideask" && typeof arrangeWindowAssistantSplit === "function") return arrangeWindowAssistantSplit("clioChart");
}

// --- documents --------------------------------------------------------------

function clioDiagramPersistSoon() {
  if (clioDiagramState.temporary || !clioDiagramState.fileId) return;
  window.clearTimeout(clioDiagramState.saveTimer);
  clioDiagramState.saveTimer = window.setTimeout(writeClioDiagramDocument, 600);
}

function writeClioDiagramDocument() {
  const file = chatFiles.find((item) => item.id === clioDiagramState.fileId);
  if (!file || !clioDiagramState.diagram) return false;
  file.clioDiagram = structuredClone(clioDiagramState.diagram);
  file.body = clioDiagramMarkdown(clioDiagramState.diagram, clioDiagramState.source?.label || "");
  file.updatedAt = new Date().toISOString();
  if (typeof markDeskDirty === "function") markDeskDirty("chatFiles", file.id);
  saveDeskState();
  return true;
}

function saveClioDiagramDocument() {
  const diagram = clioDiagramState.diagram;
  if (!diagram || !clioDiagramState.temporary) return null;
  if (!getActiveProject()) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return null;
  }
  const title = diagram.title || clioDiagramKindLabel(diagram.kind);
  const folder = ensureFolder(t("clio_chart_folder"));
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    artifactKind: "clio-diagram",
    name: nextAvailableFileName(`${title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 48) || t("clio_chart_label")}.md`, folder.id),
    folderId: folder.id,
    body: clioDiagramMarkdown(diagram, clioDiagramState.source?.label || ""),
    clioDiagram: structuredClone(diagram),
    // The text the drawing was read from, so a box added later can still be
    // grounded after the document is reopened.
    clioDiagramSourceText: String(clioDiagramState.source?.text || "").slice(0, 24000),
    source: "ClioChart",
    durable: true,
    label: "ai",
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  clioDiagramState.temporary = false;
  clioDiagramState.fileId = file.id;
  renderClioDiagramAnchor();
  syncClioDiagramTools();
  window.AISystem6ClioDiagram?.onStatus?.(t("clio_chart_saved_as", file.name));
  window.AISystem6ClioDiagram?.onSaved?.(file);
  return file;
}

function clioDiagramStageMarkdown(diagram, palette) {
  const svg = clioDiagramSvg(diagram, { ...palette, paper: "transparent" }, { fit: true });
  const heading = diagram.title || clioDiagramKindLabel(diagram.kind);
  const embeds = window.AISystem6EditEmbeds;
  // A saved drawing is the copy's original: the page can later offer what
  // changed there (app/core/edit-embeds.js sourceState).
  // A drawing that came from a DocMap branch keeps that branch as its source.
  const saved = clioDiagramState.fileId && typeof chatFiles !== "undefined" ? chatFiles.find((file) => file.id === clioDiagramState.fileId) : null;
  const source = diagram.origin || (saved?.clioDiagram ? { app: "clioChart", fileId: saved.id, rev: embeds.contentRev(saved.clioDiagram) } : null);
  return [
    "---", "marp: true", "theme: default", "paginate: true", "size: 16:9", "---", "",
    "<!-- _class: evidence light -->",
    "",
    `## ${heading}`,
    "",
    embeds.embedMarkdown({ kind: "diagram", alt: heading, svg, data: structuredClone(diagram), source }),
  ].join("\n");
}

async function sendClioDiagramToStage() {
  const diagram = clioDiagramState.diagram;
  if (!diagram) return false;
  if (typeof ensureClioStageModule === "function") await ensureClioStageModule();
  // An unsaved deck already in ClioStage is the writer's work: ask first.
  if (window.AISystem6ClioStage?.confirmDiscard && !(await window.AISystem6ClioStage.confirmDiscard())) return false;
  window.AISystem6ClioStage?.open({
    title: `${t("clio_chart_label")} — ${diagram.title || clioDiagramKindLabel(diagram.kind)}`,
    sourceKind: "generated",
    temporary: true,
    markdown: clioDiagramStageMarkdown(diagram, clioChartSvgPalette()),
  });
  return true;
}

// What SideAsk reads: the selected boxes (or the whole drawing) with sources.
function clioDiagramSelectionContext() {
  const diagram = clioDiagramState.diagram;
  if (!diagram) return null;
  const chosen = clioDiagramState.selection.length
    ? diagram.nodes.filter((node) => clioDiagramState.selection.includes(node.id))
    : diagram.nodes;
  return {
    kind: diagram.kind,
    title: diagram.title,
    scope: clioDiagramState.selection.length ? "selection" : "diagram",
    nodes: chosen.map((node) => ({ id: node.id, label: node.label, quote: node.quote })),
    edges: diagram.edges.filter((edge) => chosen.some((node) => node.id === edge.from || node.id === edge.to)),
  };
}

// --- one-line edits from SideAsk --------------------------------------------
// The writer says what to change; the model returns a whole drawing; nothing
// lands until the writer accepts the side-by-side. A box the drawing already
// had keeps its source (or its lack of one); a box the model adds must stand on
// a source sentence; no label may gain a number its source does not write.

/**
 * Merges a proposed drawing into the current one under the grounding rules.
 * @returns {{diagram: object, added: number, removed: number, relabelled: number, refused: string[]}}
 */
function mergeClioDiagramProposal(current, proposed, sourceText = "") {
  const source = clioChartGroundingSource(sourceText);
  const known = new Map(current.nodes.map((node) => [node.id, node]));
  const used = new Set();
  const refused = [];
  let added = 0;
  let relabelled = 0;
  const nodes = [];
  (Array.isArray(proposed?.nodes) ? proposed.nodes : []).slice(0, CLIO_DIAGRAM_MAX_NODES + 4).forEach((raw, index) => {
    const label = clioChartCleanText(raw?.label, CLIO_DIAGRAM_LABEL_MAX);
    if (!label) return;
    const prior = known.get(String(raw?.id || ""));
    if (prior) {
      const allowed = clioChartNumbersIn(`${prior.quote} ${prior.label}`);
      if (clioChartNumbersIn(label).some((value) => !allowed.includes(value))) {
        refused.push(label);
        nodes.push({ ...prior });
      } else {
        if (label !== prior.label) relabelled += 1;
        nodes.push({ ...prior, label, col: raw?.col === 1 ? 1 : (raw?.col === 0 ? 0 : prior.col), head: typeof raw?.head === "boolean" ? raw.head : prior.head });
      }
      used.add(prior.id);
      return;
    }
    const quote = sourceText ? clioDiagramAnchor(raw?.quote, label, source) : "";
    const quoted = clioChartNumbersIn(quote);
    if (!quote || clioChartNumbersIn(label).some((value) => !quoted.includes(value))) {
      refused.push(label);
      return;
    }
    const id = clioDiagramId(raw?.id, current.nodes.length + index, new Set([...known.keys(), ...used]));
    used.add(id);
    added += 1;
    nodes.push({ id, label, quote, col: raw?.col === 1 ? 1 : 0, head: raw?.head === true });
  });
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(proposed?.edges) ? proposed.edges : []).map((raw, index) => ({
    id: `e${index + 1}`,
    from: String(Array.isArray(raw) ? raw[0] : raw?.from),
    to: String(Array.isArray(raw) ? raw[1] : raw?.to),
    label: clioChartCleanText(raw?.label, CLIO_DIAGRAM_EDGE_LABEL_MAX),
  })).filter((edge, index, all) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to
    && all.findIndex((other) => other.from === edge.from && other.to === edge.to) === index);
  const groups = (Array.isArray(proposed?.groups) ? proposed.groups : []).map((raw, index) => ({
    id: `g${index + 1}`,
    label: clioChartCleanText(raw?.label, 16),
    nodes: (Array.isArray(raw?.nodes) ? raw.nodes : []).map(String).filter((id) => ids.has(id)),
  })).filter((group) => group.nodes.length >= 2);
  const kind = CLIO_DIAGRAM_KINDS.includes(proposed?.kind) ? proposed.kind : current.kind;
  const title = clioChartCleanText(proposed?.title, 60);
  const next = {
    ...structuredClone(current),
    kind,
    title: title && clioChartNumbersStandInSource(title, clioChartGroundingSource(`${sourceText}\n${current.title}`)) ? title : current.title,
    cols: kind === "compare" ? [0, 1].map((column) => clioChartCleanText(proposed?.cols?.[column], 16) || current.cols?.[column] || "") : [],
    nodes,
    edges,
    groups,
  };
  const removed = current.nodes.filter((node) => !ids.has(node.id)).length;
  const placed = kind !== current.kind || added ? layoutClioDiagram(next, kind) : next;
  return { diagram: placed, added, removed, relabelled, refused };
}

function clioDiagramProposalPrompt(diagram, instruction, sourceText) {
  const zh = currentLanguage === "zh";
  const context = clioDiagramSelectionContext();
  const plain = {
    kind: diagram.kind,
    title: diagram.title,
    cols: diagram.cols,
    nodes: diagram.nodes.map((node) => ({ id: node.id, label: node.label, quote: node.quote, col: node.col, head: node.head })),
    edges: diagram.edges.map((edge) => ({ from: edge.from, to: edge.to, label: edge.label })),
    groups: diagram.groups.map((group) => ({ label: group.label, nodes: group.nodes })),
  };
  return [
    `${zh ? "指令" : "Instruction"}: ${instruction}`,
    context?.scope === "selection" ? `${zh ? "选中的方框" : "Selected boxes"}: ${context.nodes.map((node) => node.id).join(", ")}` : "",
    `${zh ? "返回一行 JSON" : "Return one line of JSON"}: {"reply":"","diagram":{"kind":"flow|timeline|tree|compare|cycle","title":"","cols":["",""],"nodes":[{"id":"","label":"","quote":"","col":0,"head":false}],"edges":[{"from":"","to":"","label":""}],"groups":[{"label":"","nodes":[""]}]}}`,
    `${zh ? "现在的图" : "Current drawing"}: ${JSON.stringify(plain)}`,
    sourceText ? `${zh ? "来源文字" : "Source text"}:\n${clioDiagramPackSource(sourceText, 6000)}` : "",
  ].filter(Boolean).join("\n");
}

async function proposeClioDiagramEdit(instruction) {
  const diagram = clioDiagramState.diagram;
  const text = String(instruction || "").trim();
  if (!diagram || !text) return false;
  const sourceText = clioDiagramState.source?.text || "";
  if (!beginLongTask("clio-diagram-edit", t("clio_edit_working"))) return false;
  renderClioDiagramProposal({ pending: true, instruction: text });
  try {
    const answer = await window.AISystem6ClioChart.requestEditJson(clioDiagramProposalPrompt(diagram, text, sourceText));
    if (!answer?.diagram) throw new Error(answer?.reply || t("clio_chart_prose_unreadable"));
    const merged = mergeClioDiagramProposal(diagram, answer.diagram, sourceText);
    renderClioDiagramProposal({ instruction: text, reply: clioChartCleanText(answer.reply, 160), ...merged });
    endLongTask("clio-diagram-edit");
    return true;
  } catch (error) {
    if (!isAbortError(error)) markActiveLongTaskFailed(error?.message || "");
    renderClioDiagramProposal({ instruction: text, failed: isAbortError(error) ? t("stopped") : (error?.message || t("clio_chart_prose_unreadable")) });
    endLongTask("clio-diagram-edit");
    return false;
  }
}

// The side-by-side: the drawing now, the drawing proposed, what changed, what
// was refused, and Accept / Discard. Accepting is one undoable step.
function renderClioDiagramProposal(state) {
  const host = clioDiagramState.host;
  if (!host) return;
  host.querySelector(".clio-diagram-proposal")?.remove();
  if (!state) return;
  const panel = document.createElement("section");
  panel.className = "clio-diagram-proposal";
  panel.setAttribute("aria-live", "polite");
  const head = document.createElement("p");
  const title = document.createElement("b");
  title.textContent = t("clio_edit_proposal_for", state.instruction);
  head.append(title);
  panel.append(head);
  const actions = document.createElement("div");
  actions.className = "clio-diagram-proposal-actions";
  const discard = document.createElement("button");
  discard.type = "button";
  discard.className = "btn";
  discard.textContent = t(state.diagram ? "clio_edit_discard" : "close");
  discard.addEventListener("click", () => panel.remove());
  if (state.pending || state.failed) {
    const line = document.createElement("p");
    line.textContent = state.failed || t("clio_edit_working");
    panel.append(line);
    if (state.failed) { actions.append(discard); panel.append(actions); }
    host.append(panel);
    return;
  }
  const palette = { ...clioChartSvgPalette(), paper: "transparent" };
  const pair = document.createElement("div");
  pair.className = "clio-diagram-proposal-pair";
  [["clio_edit_now", clioDiagramState.diagram], ["clio_edit_proposed", state.diagram]].forEach(([key, drawing]) => {
    const figure = document.createElement("figure");
    figure.innerHTML = clioDiagramSvg(drawing, palette, { fit: true });
    const caption = document.createElement("figcaption");
    caption.textContent = t(key);
    figure.append(caption);
    pair.append(figure);
  });
  panel.append(pair);
  const summary = document.createElement("p");
  summary.className = "clio-diagram-proposal-summary";
  summary.textContent = [
    state.reply,
    t("clio_edit_counts", state.added, state.removed, state.relabelled),
    state.diagram.kind !== clioDiagramState.diagram.kind ? t("clio_diagram_kind_changed", clioDiagramKindLabel(state.diagram.kind)) : "",
  ].filter(Boolean).join("　");
  panel.append(summary);
  if (state.refused.length) {
    const refused = document.createElement("p");
    refused.className = "clio-diagram-proposal-refused";
    refused.textContent = t("clio_edit_refused", state.refused.join("、"));
    panel.append(refused);
  }
  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "btn default";
  accept.textContent = t("clio_edit_accept");
  accept.addEventListener("click", () => {
    panel.remove();
    clioDiagramChange((draft) => {
      Object.keys(draft).forEach((key) => delete draft[key]);
      Object.assign(draft, structuredClone(state.diagram));
    }, { label: "edit_step_accept" });
    selectClioDiagram([]);
    window.AISystem6ClioDiagram?.onStatus?.(t("clio_edit_accepted"));
  });
  actions.append(discard, accept);
  panel.append(actions);
  host.append(panel);
}

// --- a slide page drawn as a concept drawing ---------------------------------
// A deck's timeline page and its two-sided pages already say what a drawing
// would say; drawing them is a reading of the page, not new content. Each box
// looks for the source sentence it came from, and stays unsourced (dashed)
// when the deck said it in its own words.
function clioDiagramFromSlidePage(page, layout, sourceText = "") {
  const lines = String(page || "").split("\n");
  const plain = (text) => String(text || "").replace(/<!--[\s\S]*?-->/g, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  const title = plain((lines.find((line) => /^#{1,3}\s/.test(line)) || "").replace(/^#{1,3}\s+/, ""));
  const source = clioChartGroundingSource(sourceText);
  const box = (label, index, extra = {}) => {
    const text = clioChartCleanText(label, CLIO_DIAGRAM_LABEL_MAX);
    return { id: `n${index + 1}`, label: text, quote: sourceText ? clioDiagramAnchor("", text, source) : "", col: 0, head: false, ...extra };
  };
  if (layout === "timeline") {
    const items = lines.filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)).map((line) => plain(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""))).filter(Boolean);
    if (items.length < 2) return null;
    const nodes = items.map((item, index) => box(item, index));
    return layoutClioDiagram({ v: 1, kind: "timeline", title, why: "", cols: [], nodes, edges: nodes.slice(1).map((node, index) => ({ id: `e${index + 1}`, from: nodes[index].id, to: node.id, label: "" })), groups: [] });
  }
  if (["columns", "duo-compare", "contrast"].includes(layout)) {
    const sides = [];
    lines.forEach((line) => {
      const heading = line.match(/^###\s+(.+)$/);
      if (heading) { sides.push({ title: plain(heading[1]), items: [] }); return; }
      const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
      if (item && sides.length) sides[sides.length - 1].items.push(plain(item[1]));
      else if (sides.length && plain(line) && !/^#{1,2}\s/.test(line)) sides[sides.length - 1].items.push(plain(line));
    });
    if (sides.length !== 2 || sides.some((side) => !side.items.length)) return null;
    const nodes = [];
    sides.forEach((side, column) => side.items.slice(0, 6).forEach((item) => nodes.push(box(item, nodes.length, { col: column }))));
    return layoutClioDiagram({ v: 1, kind: "compare", title, why: "", cols: sides.map((side) => side.title.slice(0, 16)), nodes, edges: [], groups: [] });
  }
  return null;
}

window.AISystem6ClioDiagram = {
  kinds: CLIO_DIAGRAM_KINDS,
  mount: mountClioDiagram,
  load: loadClioDiagram,
  render: renderClioDiagram,
  current: () => clioDiagramState.diagram,
  isTemporary: () => clioDiagramState.temporary,
  selectionContext: clioDiagramSelectionContext,
  replace: (diagram) => clioDiagramChange((draft) => {
    Object.keys(draft).forEach((key) => delete draft[key]);
    Object.assign(draft, structuredClone(diagram));
  }, { label: "edit_step_change" }),
  ground: groundClioDiagramCandidate,
  layout: layoutClioDiagram,
  svg: clioDiagramSvg,
  markdown: clioDiagramMarkdown,
  stageMarkdown: clioDiagramStageMarkdown,
  streamCandidates: clioDiagramStreamCandidates,
  packSource: clioDiagramPackSource,
  overlap: clioDiagramOverlap,
  fromSvg: clioDiagramFromSvg,
  undo: undoClioDiagram,
  redo: redoClioDiagram,
  arrange: arrangeClioDiagram,
  canArrange: canArrangeClioDiagram,
  shown: clioDiagramShown,
  canUndo: () => clioDiagramState.history.canUndo() && !!clioDiagramState.diagram,
  canRedo: () => clioDiagramState.history.canRedo() && !!clioDiagramState.diagram,
  undoLabel: () => clioDiagramState.history.undoLabel(),
  redoLabel: () => clioDiagramState.history.redoLabel(),
  save: saveClioDiagramDocument,
  sendToStage: sendClioDiagramToStage,
  proposeEdit: proposeClioDiagramEdit,
  mergeProposal: mergeClioDiagramProposal,
  fromSlidePage: clioDiagramFromSlidePage,
  onStatus: null,
  onSelect: null,
  onSaved: null,
};
