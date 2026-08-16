// Core runtime module: paste-markdown.
//
// Paste takeover for the writing surfaces. A textarea only accepts
// `text/plain`, so pasting a web page or a Word passage drops every heading,
// list, emphasis, link and table, and the writer has to retype the structure
// by hand. That is mechanical work in the middle of thinking, which is the one
// thing this app must not cause.
//
// The conversion is local and synchronous on purpose. The server already has
// `htmlToReaderMarkdown`, but a round trip would put network latency inside a
// keystroke, and latency is itself an interruption.
//
// Heading levels are the load-bearing part. The writing route reads `#` as the
// title, `##` as a Section Draft boundary and `###` as a subhead inside a
// section, and Outline / Section Drafts / TeachText are three views of one
// Markdown document. So a converted heading must obey where it lands: only the
// Outline may receive `##`. Everywhere else the fragment is pushed down so its
// shallowest heading becomes `###` — otherwise one paste silently cuts the
// writer's article into new sections. Levels are only ever pushed down, never
// promoted, and relative depth inside the fragment is preserved.

// Only the Outline defines section boundaries, so only the Outline may receive
// `##` from a paste.
const PASTE_HEADING_FLOOR_BY_SURFACE = { "outline-content": 2 };
const PASTE_DEFAULT_HEADING_FLOOR = 3;

const PM_SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "TITLE",
  "SVG", "CANVAS", "IFRAME", "OBJECT", "VIDEO", "AUDIO", "SELECT", "OPTION", "INPUT",
]);

const PM_BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "ASIDE", "NAV",
  "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "DL", "DT", "DD",
  "BLOCKQUOTE", "PRE", "HR", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH",
  "FIGURE", "FIGCAPTION", "ADDRESS", "FORM", "CENTER", "FIELDSET", "DETAILS", "SUMMARY",
]);

const PM_LINE_MARKER = /^\s*(?:[-*+][ \t]|\d+[.)][ \t]|>|#{1,6}[ \t]|```|\|)/;
const PM_URL_PATTERN = /^(?:https?:\/\/|mailto:)\S+$/i;

function pasteHeadingFloor(surfaceId = "") {
  return PASTE_HEADING_FLOOR_BY_SURFACE[String(surfaceId || "")] || PASTE_DEFAULT_HEADING_FLOOR;
}

function pmTag(node) {
  return node && node.nodeType === 1 ? String(node.nodeName || "").toUpperCase() : "";
}

function pmChildren(node) {
  return node && node.childNodes ? Array.from(node.childNodes) : [];
}

function pmAttr(node, name) {
  if (!node || node.nodeType !== 1 || typeof node.getAttribute !== "function") return "";
  return String(node.getAttribute(name) || "");
}

// Read one declaration out of the inline style attribute. Google Docs ships
// `<b style="font-weight:normal">` around whole documents and Word ships
// `<span style="font-weight:700">` instead of `<strong>`, so the attribute
// decides emphasis whenever it says anything.
function pmStyleValue(node, property) {
  const style = pmAttr(node, "style");
  if (!style) return "";
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i"));
  return match ? match[1].trim().toLowerCase() : "";
}

function pmIsStrong(node) {
  const weight = pmStyleValue(node, "font-weight");
  if (weight) return weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  const tag = pmTag(node);
  return tag === "STRONG" || tag === "B";
}

function pmIsEmphasis(node) {
  const style = pmStyleValue(node, "font-style");
  if (style) return style === "italic" || style === "oblique";
  const tag = pmTag(node);
  return tag === "EM" || tag === "I";
}

// Text keeps the writer's characters; only the markers that would change how
// Markdown reads are escaped.
function pmEscapeText(text) {
  return String(text).replace(/([\\`*[\]])/g, "\\$1");
}

function pmCollapse(text) {
  return String(text).replace(/[ \t\r\f\v ]+/g, " ").replace(/\n[ \t]*/g, "\n");
}

function pmTrimInline(text) {
  return String(text).replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim();
}

function pmWrap(inner, marker) {
  const text = String(inner);
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match || !match[2]) return text;
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function pmInline(node, ctx) {
  if (!node) return "";
  if (node.nodeType === 3) return pmEscapeText(pmCollapse(node.nodeValue || ""));
  if (node.nodeType !== 1) return "";
  const tag = pmTag(node);
  if (PM_SKIP_TAGS.has(tag)) return "";
  if (tag === "BR") return "\n";

  if (tag === "IMG") {
    const src = pmAttr(node, "src");
    const alt = pmEscapeText(pmCollapse(pmAttr(node, "alt")));
    // A data: URI would paste tens of kilobytes of base64 into the writer's
    // paragraph. Keep the caption, drop the payload.
    if (!src || /^data:/i.test(src)) return alt;
    return `![${alt}](${src})`;
  }

  if (tag === "CODE" && !ctx.pre) {
    const text = pmCollapse(node.textContent || "").trim();
    return text ? `\`${text}\`` : "";
  }

  const inner = pmInlineChildren(node, ctx);
  if (tag === "A") {
    const href = pmAttr(node, "href").trim();
    const label = pmTrimInline(inner);
    if (!label) return "";
    if (!href || /^javascript:/i.test(href) || href.startsWith("#")) return label;
    return href === label ? label : `[${label}](${href})`;
  }
  if (tag === "DEL" || tag === "S" || tag === "STRIKE") return pmWrap(inner, "~~");
  if (pmIsStrong(node)) return pmWrap(inner, "**");
  if (pmIsEmphasis(node)) return pmWrap(inner, "*");
  return inner;
}

function pmInlineChildren(node, ctx) {
  return pmChildren(node).map((child) => pmInline(child, ctx)).join("");
}

// Prefix a rendered block: `first` on its opening line, `rest` on the others.
// Blank lines stay blank so the paste does not leave trailing whitespace.
function pmPrefix(text, first, rest) {
  return String(text)
    .split("\n")
    .map((line, index) => (line ? (index === 0 ? first : rest) + line : line))
    .join("\n");
}

function pmJoinBlocks(blocks) {
  let out = "";
  blocks.forEach((block, index) => {
    if (!index) { out = block; return; }
    // A nested list belongs to the item above it, not to a new paragraph.
    out += /^\s*(?:[-*+][ \t]|\d+\.[ \t])/.test(block) ? "\n" : "\n\n";
    out += block;
  });
  return out;
}

function pmList(node, ctx, indent) {
  const ordered = pmTag(node) === "OL";
  let counter = Math.max(1, Math.floor(Number(pmAttr(node, "start")) || 1));
  const items = [];
  pmChildren(node).forEach((child) => {
    if (pmTag(child) !== "LI") return;
    const blocks = pmRenderBlocks(child, ctx, "");
    const text = pmJoinBlocks(blocks);
    const marker = ordered ? `${counter}. ` : "- ";
    counter += 1;
    if (!text) return;
    items.push(pmPrefix(text, indent + marker, indent + " ".repeat(marker.length)));
  });
  return items.length ? [items.join("\n")] : [];
}

function pmCollectRows(node, rows) {
  pmChildren(node).forEach((child) => {
    const tag = pmTag(child);
    if (!tag || tag === "TABLE") return;
    if (tag === "TR") rows.push(child);
    else pmCollectRows(child, rows);
  });
}

function pmCell(cell, ctx) {
  return pmTrimInline(pmInlineChildren(cell, ctx)).replace(/\n+/g, " ").replace(/\|/g, "\\|");
}

function pmTable(node, ctx, indent) {
  const rows = [];
  pmCollectRows(node, rows);
  const grid = rows
    .map((row) => pmChildren(row).filter((cell) => ["TD", "TH"].includes(pmTag(cell))).map((cell) => pmCell(cell, ctx)))
    .filter((cells) => cells.length);
  if (!grid.length) return [];
  const width = grid.reduce((max, cells) => Math.max(max, cells.length), 0);
  const pad = (cells) => Array.from({ length: width }, (_, index) => cells[index] || "");
  // GFM needs a header row. When the source has no <th> the first row is the
  // header, which is what a pasted table looks like on screen anyway.
  const header = pad(grid[0]);
  const body = grid.slice(1).map(pad);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((cells) => `| ${cells.join(" | ")} |`),
  ];
  return [lines.map((line) => indent + line).join("\n")];
}

function pmPre(node, ctx, indent) {
  const code = String(node.textContent || "").replace(/\n+$/, "");
  if (!code.trim()) return [];
  const classes = `${pmAttr(node, "class")} ${pmChildren(node).map((child) => pmAttr(child, "class")).join(" ")}`;
  const language = classes.match(/(?:language|lang)-([\w+#-]+)/i)?.[1] || "";
  const lines = [`\`\`\`${language}`, ...code.split("\n"), "```"];
  return [lines.map((line) => (line ? indent + line : line)).join("\n")];
}

function pmBlock(node, ctx, indent) {
  const tag = pmTag(node);
  const heading = tag.match(/^H([1-6])$/);
  if (heading) {
    const text = pmTrimInline(pmInlineChildren(node, ctx)).replace(/\n+/g, " ");
    return text ? [`${indent}${"#".repeat(Number(heading[1]))} ${text}`] : [];
  }
  if (tag === "HR") return [`${indent}---`];
  if (tag === "PRE") return pmPre(node, { ...ctx, pre: true }, indent);
  if (tag === "UL" || tag === "OL") return pmList(node, ctx, indent);
  if (tag === "TABLE") return pmTable(node, ctx, indent);
  if (tag === "BLOCKQUOTE") {
    const text = pmJoinBlocks(pmRenderBlocks(node, ctx, ""));
    if (!text) return [];
    return [text.split("\n").map((line) => (line ? `${indent}> ${line}` : `${indent}>`)).join("\n")];
  }
  return pmRenderBlocks(node, ctx, indent);
}

// Walk one container. Consecutive inline nodes gather into one paragraph; a
// block-level child flushes that paragraph and renders on its own.
function pmRenderBlocks(node, ctx, indent) {
  const blocks = [];
  let inline = "";
  const flush = () => {
    const text = pmTrimInline(inline);
    inline = "";
    if (text) blocks.push(pmPrefix(text, indent, indent));
  };
  pmChildren(node).forEach((child) => {
    const tag = pmTag(child);
    if (PM_SKIP_TAGS.has(tag)) return;
    if (!tag || !PM_BLOCK_TAGS.has(tag)) {
      inline += pmInline(child, ctx);
      return;
    }
    flush();
    pmBlock(child, ctx, indent).forEach((block) => blocks.push(block));
  });
  flush();
  return blocks;
}

/**
 * Push every heading down so the shallowest one lands on `floor`, preserving
 * relative depth and never promoting. Lines inside a fenced code block are
 * text, not headings.
 * @param {string} markdown
 * @param {number} floor
 * @returns {string}
 */
function pasteShiftHeadings(markdown, floor) {
  const lines = String(markdown || "").split("\n");
  const target = Math.max(1, Math.min(6, Math.floor(Number(floor) || PASTE_DEFAULT_HEADING_FLOOR)));
  let fenced = false;
  let shallowest = 7;
  lines.forEach((line) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const match = line.match(/^(#{1,6})[ \t]+\S/);
    if (match) shallowest = Math.min(shallowest, match[1].length);
  });
  const delta = shallowest > 6 ? 0 : Math.max(0, target - shallowest);
  if (!delta) return String(markdown || "");
  fenced = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return line; }
      if (fenced) return line;
      return line.replace(/^(#{1,6})([ \t]+\S)/, (whole, hashes, rest) => (
        "#".repeat(Math.min(6, hashes.length + delta)) + rest
      ));
    })
    .join("\n");
}

/**
 * Convert clipboard HTML to Markdown for one landing surface.
 * @param {string} html
 * @param {{ surface?: string, headingFloor?: number }} [options]
 * @returns {string}
 */
function pasteHtmlToMarkdown(html, options = {}) {
  const source = String(html || "");
  if (!source.trim()) return "";
  const Parser = typeof DOMParser === "function" ? DOMParser : null;
  if (!Parser) return "";
  let doc = null;
  try {
    doc = new Parser().parseFromString(source, "text/html");
  } catch {
    return "";
  }
  const root = doc?.body || doc?.documentElement;
  if (!root) return "";
  const markdown = pmJoinBlocks(pmRenderBlocks(root, { pre: false }, ""))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!markdown) return "";
  const floor = Number.isFinite(Number(options.headingFloor))
    ? Number(options.headingFloor)
    : pasteHeadingFloor(options.surface);
  return pasteShiftHeadings(markdown, floor);
}

function pasteIsBareUrl(text) {
  return PM_URL_PATTERN.test(String(text || "").trim());
}

/**
 * Continue the list marker of the caret's line across a multi-line paste, so
 * pasting three lines into a bullet gives three bullets instead of one bullet
 * and two orphan lines. Text that already carries its own markers, headings or
 * fences is left exactly as it is.
 * @param {string} value textarea value before the paste
 * @param {number} caret insertion offset
 * @param {string} text text about to be inserted
 * @returns {string}
 */
function pasteContinueListMarkers(value, caret, text) {
  const insert = String(text || "");
  if (!insert.includes("\n")) return insert;
  const source = String(value || "");
  const lineStart = source.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const line = source.slice(lineStart, caret);
  const match = line.match(/^(\s*)((?:[-*+][ \t]+)|(?:\d+\.[ \t]+))/);
  if (!match) return insert;
  const lines = insert.split("\n");
  if (lines.some((entry) => PM_LINE_MARKER.test(entry))) return insert;
  const [, indent, marker] = match;
  const ordered = marker.match(/^(\d+)\.([ \t]+)$/);
  let counter = ordered ? Number(ordered[1]) : 0;
  return lines
    .map((entry, index) => {
      if (!index) return entry;
      if (!entry.trim()) return "";
      counter += 1;
      return `${indent}${ordered ? `${counter}.${ordered[2]}` : marker}${entry.trimStart()}`;
    })
    .join("\n");
}

/**
 * Describe a splice in line terms, so whoever holds line-based positions can
 * move them instead of pointing at whatever slid into that line number.
 * @param {string} value textarea value before the splice
 * @param {{ from: number, to: number, insert: string }} splice
 * @returns {{ atLine: number, removedLines: number, addedLines: number, delta: number }}
 */
function pasteLineShift(value, splice = {}) {
  const source = String(value || "");
  const from = Math.max(0, Math.min(Number(splice.from) || 0, source.length));
  const to = Math.max(from, Math.min(Number(splice.to) || 0, source.length));
  const removedLines = source.slice(from, to).split("\n").length - 1;
  const addedLines = String(splice.insert || "").split("\n").length - 1;
  return {
    atLine: source.slice(0, from).split("\n").length,
    removedLines,
    addedLines,
    delta: addedLines - removedLines,
  };
}

/**
 * Move 1-based inclusive line ranges (protected ranges, adjustment-layer
 * masks) onto their new line numbers after a splice.
 * @param {Array<{start: number, end: number}>} ranges
 * @param {{ atLine: number, delta: number }} shift
 * @returns {Array<{start: number, end: number}>}
 */
function pasteShiftLineRanges(ranges = [], shift = {}) {
  const atLine = Math.max(1, Math.floor(Number(shift.atLine) || 1));
  const delta = Math.floor(Number(shift.delta) || 0);
  const moved = (Array.isArray(ranges) ? ranges : [])
    .map((range) => {
      const start = Math.max(1, Math.floor(Number(range?.start) || 0));
      const end = Math.max(start, Math.floor(Number(range?.end) || start));
      if (!delta) return { start, end };
      // The splice happens inside `atLine`, so only lines after it move. A
      // range that contains the splice line grows instead of sliding.
      return {
        start: start > atLine ? Math.max(1, start + delta) : start,
        end: end >= atLine ? Math.max(start > atLine ? start + delta : start, end + delta) : end,
      };
    })
    .filter((range) => range.start <= range.end);
  return moved;
}

/**
 * Move a character offset (a caret bookmark, a held place) onto its new
 * position after a splice. An offset inside the replaced text collapses to the
 * start of what replaced it — never to a stale position that still looks valid.
 * @param {number} offset
 * @param {{ from: number, to: number, insertedLength: number }} splice
 * @returns {number}
 */
function pasteShiftOffset(offset, splice = {}) {
  const position = Math.max(0, Math.floor(Number(offset) || 0));
  const from = Math.max(0, Math.floor(Number(splice.from) || 0));
  const to = Math.max(from, Math.floor(Number(splice.to) || 0));
  const insertedLength = Math.max(0, Math.floor(Number(splice.insertedLength) || 0));
  if (position <= from) return position;
  if (position >= to) return position + insertedLength - (to - from);
  return from;
}

window.AISystem6PasteMarkdown = Object.freeze({
  PASTE_DEFAULT_HEADING_FLOOR,
  pasteContinueListMarkers,
  pasteHeadingFloor,
  pasteHtmlToMarkdown,
  pasteIsBareUrl,
  pasteLineShift,
  pasteShiftHeadings,
  pasteShiftLineRanges,
  pasteShiftOffset,
});
