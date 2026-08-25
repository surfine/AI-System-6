// Core module: shared Markdown parsing for all writing surfaces.

// Loaded before feature modules as a classic script; shares the AI System 6 global scope.



function normalizeMarkdownText(markdown) {
  return String(markdown || "").replace(/\r\n?/g, "\n");
}

function stripMarkdownInlineSyntax(value) {
  return String(value || "")
    .replace(markdownSectionIdPattern, "")
    .replace(/\s+#+\s*$/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Section identity -----------------------------------------------------
//
// A section's record carries what the text cannot: its HKRR intent, the clips
// it used, the file it was inserted into. Pairing record to text by title and
// position is a guess, and it loses -- rename a section and move it in the
// same sitting and both halves of the guess miss, so the record is orphaned
// and the intent silently resets.
//
// The id therefore lives in the heading, in the anchor syntax Pandoc and
// kramdown already use. Other Markdown tools understand it, it becomes a real
// HTML anchor on export, and it survives a rename because it is not derived
// from the title.

const markdownSectionIdPattern = /\s*\{#([A-Za-z0-9][A-Za-z0-9_-]*)\}\s*$/;

function markdownSectionId(headingText) {
  return (String(headingText || "").match(markdownSectionIdPattern) || [])[1] || "";
}

function stripMarkdownSectionId(headingText) {
  return String(headingText || "").replace(markdownSectionIdPattern, "").trim();
}

function newMarkdownSectionId() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "")
    || Math.random().toString(16).slice(2).padEnd(6, "0");
  return random.slice(0, 6);
}

function withMarkdownSectionId(headingText, id) {
  const title = stripMarkdownSectionId(headingText);
  return id ? `${title} {#${id}}` : title;
}

// Give every section heading an id and leave the ones that have one alone.
// This is where a pasted document gets its ids: the writer keeps writing
// `## 标题` and the id arrives when the text becomes sections.
function ensureMarkdownSectionIds(markdown, levels = [2, 3]) {
  const source = normalizeMarkdownText(markdown);
  const seen = new Set();
  let changed = false;
  let inCode = false;

  const lines = source.split("\n").map((line) => {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inCode = !inCode;
      return line;
    }
    if (inCode) return line;

    const heading = line.match(/^(\s{0,3}#{1,6}\s+)(.+?)\s*$/);
    if (!heading || !levels.includes(heading[1].trim().length)) return line;

    const existing = markdownSectionId(heading[2]);
    if (existing && !seen.has(existing)) {
      seen.add(existing);
      return line;
    }

    // A duplicated id is worse than a missing one: two sections would answer
    // to one record. The copy gets a fresh id, the original keeps its own.
    let id = newMarkdownSectionId();
    while (seen.has(id)) id = newMarkdownSectionId();
    seen.add(id);
    changed = true;
    return `${heading[1]}${withMarkdownSectionId(heading[2], id)}`;
  });

  return { markdown: changed ? lines.join("\n") : source, changed };
}

function markdownMarkedApi() {
  return globalThis.marked || (typeof window !== "undefined" ? window.marked : null);
}

function isSafeMarkdownHref(href) {
  const value = String(href || "").trim();
  return /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(value);
}

function isSafeMarkdownImageSrc(src) {
  const value = String(src || "").trim();
  return /^(https?:|\/|\.\/|\.\.\/|data:image\/(?:png|jpe?g|gif|webp|bmp);base64,)/i.test(value);
}

function createSystemMarkdownRenderer() {
  const markedApi = markdownMarkedApi();
  const renderer = new markedApi.Renderer();

  renderer.html = function (input) {
    const text = typeof input === "object" ? input.text : input;
    return escapeHtml(text).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  };
  renderer.heading = function (input, legacyLevel) {
    const level = typeof input === "object" ? input.depth : legacyLevel;
    const rendered = typeof input === "object" ? this.parser.parseInline(input.tokens) : String(input || "");
    const id = markdownSectionId(rendered);
    if (!id) return `<h${level}>${rendered}</h${level}>\n`;
    return `<h${level} id="${escapeHtml(id)}">${stripMarkdownSectionId(rendered)}</h${level}>\n`;
  };
  renderer.link = function (input, legacyTitle, legacyText) {
    const href = typeof input === "object" ? input.href : input;
    const title = typeof input === "object" ? input.title : legacyTitle;
    const text = typeof input === "object" ? this.parser.parseInline(input.tokens) : legacyText;
    if (!isSafeMarkdownHref(href)) return text;

    const escapedHref = escapeHtml(href);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapedHref}"${titleAttribute} target="_blank" rel="noreferrer">${text}</a>`;
  };
  renderer.image = function (input, legacyTitle, legacyText) {
    const href = typeof input === "object" ? input.href : input;
    const title = typeof input === "object" ? input.title : legacyTitle;
    const text = typeof input === "object" ? input.text : legacyText;
    if (!isSafeMarkdownImageSrc(href)) return escapeHtml(text || "");

    const escapedSrc = escapeHtml(href);
    const escapedAlt = escapeHtml(text || "");
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapedSrc}" alt="${escapedAlt}"${titleAttribute} loading="lazy" decoding="async">`;
  };

  return renderer;
}

function allowSafeMarkdownBreaks(html) {
  return String(html || "").replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function markdownTokenText(token) {
  if (!token) return "";
  if (typeof token.text === "string") return stripMarkdownInlineSyntax(token.text);
  if (Array.isArray(token.tokens)) {
    return token.tokens.map(markdownTokenText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function collectMarkdownDocumentTokens(tokens, model, depth = 0) {
  (tokens || []).forEach((token) => {
    if (token.type === "heading") {
      const text = markdownTokenText(token);
      if (text) {
        model.headings.push({ level: token.depth, text, raw: token.text, line: token.raw });
        model.plainLines.push(text);
      }
    } else if (token.type === "list") {
      (token.items || []).forEach((item) => {
        const text = markdownTokenText(item);
        if (text) {
          model.listItems.push({ ordered: Boolean(token.ordered), depth, text, line: item.raw });
          model.plainLines.push(text);
        }
        collectMarkdownDocumentTokens(item.tokens, model, depth + 1);
      });
    } else if (token.type === "paragraph" || token.type === "blockquote") {
      const text = markdownTokenText(token);
      if (text) model.plainLines.push(text);
      collectMarkdownDocumentTokens(token.tokens, model, depth);
    } else if (Array.isArray(token.tokens)) {
      collectMarkdownDocumentTokens(token.tokens, model, depth);
    }
  });
}

// Which source line each rendered top-level block came from. marked emits
// exactly one top-level element per top-level token, in order, so walking the
// tokens once and counting newlines in their raw text gives the whole map. A
// `space` token renders nothing and only advances the count.
function markdownTopLevelBlockLines(tokens) {
  const lines = [];
  let line = 0;

  (tokens || []).forEach((token) => {
    const raw = String(token.raw || "");
    if (token.type !== "space") lines.push(line);
    for (let index = 0; index < raw.length; index += 1) {
      if (raw.charCodeAt(index) === 10) line += 1;
    }
  });

  return lines;
}

function parseMarkdownDocument(markdown) {
  const endPerf = window.AISystem6Perf?.start("markdown_render", {
    chars: String(markdown || "").length,
  });
  const source = normalizeMarkdownText(markdown);
  const markedApi = markdownMarkedApi();
  if (!markedApi) {
    const fallback = {
      source,
      html: `<p>${escapeHtml(source)}</p>`,
      headings: [],
      listItems: [],
      outlineItems: [],
      blockLines: [],
      title: "",
      plainText: stripMarkdownInlineSyntax(source),
    };
    endPerf?.({ fallback: true });
    return fallback;
  }

  const renderer = createSystemMarkdownRenderer();
  const tokens = markedApi.lexer(source, { gfm: true, breaks: false });
  const model = { headings: [], listItems: [], plainLines: [] };
  collectMarkdownDocumentTokens(tokens, model);

  const firstH1 = model.headings.find((heading) => heading.level === 1);
  const levelOneHeadings = model.headings.filter((heading) => heading.level === 1);
  const levelTwoHeadings = model.headings.filter((heading) => heading.level === 2);
  const levelThreeHeadings = model.headings.filter((heading) => heading.level === 3);
  const outlineItems = levelTwoHeadings.length
    ? levelTwoHeadings.map((heading) => heading.text)
    : levelOneHeadings.length
      ? levelOneHeadings.map((heading) => heading.text)
      : levelThreeHeadings.map((heading) => heading.text);

  const parsed = {
    source,
    blockLines: markdownTopLevelBlockLines(tokens),
    html: allowSafeMarkdownBreaks(markedApi.parse(source, { gfm: true, breaks: false, renderer }).trim()),
    headings: model.headings,
    listItems: model.listItems,
    outlineItems,
    title: firstH1?.text || "",
    plainText: model.plainLines.filter(Boolean).join("\n"),
  };
  endPerf?.({ headings: parsed.headings.length, listItems: parsed.listItems.length });
  return parsed;
}

function markdownToSystemHtml(markdown) {
  return parseMarkdownDocument(markdown).html;
}

function markdownDocumentTitle(markdown) {
  return parseMarkdownDocument(markdown).title;
}

// --- Turning the paper over ----------------------------------------------
//
// A preview is the same sheet turned over, not a second document, so turning
// it must not cost the writer their place. Going in, the preview opens at the
// paragraph the caret was in. Coming back, the caret lands where the writer
// was reading -- but only if they read somewhere else. A glance that scrolls
// nothing returns the caret exactly where it was, because moving it then would
// be the preview rearranging the writer's desk for no reason.
//
// The pairing is positional: block N of the preview came from blockLines[N].
// A raw-HTML token can render to a bare text node and break that count, so the
// map is stamped only when the two lengths agree; otherwise the preview keeps
// its old behaviour rather than scrolling to a guess.

const previewAnchorState = new WeakMap();

function markdownLineAtOffset(value, offset) {
  const text = String(value || "");
  const limit = Math.min(Math.max(Math.floor(Number(offset) || 0), 0), text.length);
  let line = 0;

  for (let index = 0; index < limit; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }

  return line;
}

function markdownOffsetAtLine(value, line) {
  const text = String(value || "");
  const target = Math.max(Math.floor(Number(line) || 0), 0);
  let offset = 0;

  for (let index = 0; index < target; index += 1) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }

  return offset;
}

function stampPreviewBlockLines(preview, markdown) {
  if (!preview) return false;

  const lines = parseMarkdownDocument(markdown).blockLines || [];
  const blocks = Array.from(preview.children);
  if (!lines.length || lines.length !== blocks.length) return false;

  blocks.forEach((block, index) => {
    block.dataset.mdLine = String(lines[index]);
  });
  return true;
}

function previewBlockForLine(preview, line) {
  let match = null;

  preview?.querySelectorAll?.("[data-md-line]").forEach((block) => {
    if (Number(block.dataset.mdLine) <= line) match = block;
  });

  return match;
}

function previewBlockAtTop(preview) {
  const top = preview.getBoundingClientRect().top;
  let read = null;

  preview.querySelectorAll("[data-md-line]").forEach((block) => {
    if (read) return;
    if (block.getBoundingClientRect().bottom > top + 1) read = block;
  });

  return read;
}

// Call with the preview already visible: the scroll needs a measurable box.
function enterPreviewAtCaret(input, preview) {
  if (!input || !preview) return false;

  const value = input.value || "";
  const selectionStart = input.selectionStart ?? 0;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  const mapped = stampPreviewBlockLines(preview, value);

  if (mapped) {
    const block = previewBlockForLine(preview, markdownLineAtOffset(value, selectionStart));
    if (block) {
      const delta = block.getBoundingClientRect().top - preview.getBoundingClientRect().top;
      preview.scrollTop = Math.max(0, preview.scrollTop + delta);
    }
  }

  previewAnchorState.set(preview, { scrollTop: preview.scrollTop, selectionStart, selectionEnd, mapped });
  return mapped;
}

// Call before hiding the preview, for the same reason. Returns true when it
// moved the caret, so a caller that restores its own saved position knows to
// stand down.
function leavePreviewToCaret(input, preview) {
  if (!input || !preview) return false;

  const state = previewAnchorState.get(preview);
  previewAnchorState.delete(preview);
  if (!state?.mapped) return false;
  if (Math.abs(preview.scrollTop - state.scrollTop) <= 2) return false;

  const read = previewBlockAtTop(preview);
  if (!read) return false;

  const offset = markdownOffsetAtLine(input.value || "", Number(read.dataset.mdLine) || 0);
  input.selectionStart = offset;
  input.selectionEnd = offset;
  return true;
}

function trimMarkdownBlockLines(lines) {
  const block = Array.isArray(lines) ? lines : [];
  let start = 0;
  let end = block.length;

  while (start < end && !String(block[start] || "").trim()) start += 1;
  while (end > start && !String(block[end - 1] || "").trim()) end -= 1;

  return block.slice(start, end);
}

// --- The outline as a tree -----------------------------------------------
//
// Sections are about to stop being a reading of a string and start being the
// thing itself. That needs a shape the string can be generated FROM, and a
// parse that loses nothing on the way in -- including the lines before the
// first section, which are usually the document's title.
//
// `##` is a section and `###` is a subsection under it. Deeper headings and
// anything inside a code fence are body text: a document that discusses
// Markdown must not restructure itself.
//
// The tree is not a second format. It serialises back to the same Markdown
// every other part of the route already reads, and parsing that again gives
// the same tree -- which is the property the contract checks, because it is
// the one that makes the string safe to regenerate.

// `heading` is what the writer typed, minus the id; `title` is the display
// form. The heading is the one that round-trips: serialising from the stripped
// title would quietly delete the bold, the code span, and the link from every
// heading that had one -- once, and then stably, which is worse than loudly.
function markdownOutlineNode(level, headingText) {
  const heading = stripMarkdownSectionId(headingText);
  return {
    level,
    id: markdownSectionId(headingText),
    heading,
    title: stripMarkdownInlineSyntax(heading),
    lead: [],
    children: [],
  };
}

function markdownOutlineTree(markdown) {
  const preamble = [];
  const sections = [];
  let section = null;
  let child = null;
  let inCode = false;

  normalizeMarkdownText(markdown).split("\n").forEach((line) => {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inCode = !inCode;
      (child?.lead || section?.lead || preamble).push(line);
      return;
    }

    const heading = inCode ? null : line.match(/^\s{0,3}(#{2,3})\s+(.+?)\s*$/);
    if (heading && heading[1].length === 2) {
      section = markdownOutlineNode(2, heading[2]);
      child = null;
      sections.push(section);
      return;
    }
    if (heading && heading[1].length === 3 && section) {
      child = markdownOutlineNode(3, heading[2]);
      section.children.push(child);
      return;
    }

    (child?.lead || section?.lead || preamble).push(line);
  });

  const trim = (node) => {
    node.lead = trimMarkdownBlockLines(node.lead).join("\n");
    node.children.forEach(trim);
    return node;
  };

  return {
    preamble: trimMarkdownBlockLines(preamble).join("\n"),
    sections: sections.map(trim),
  };
}

function markdownOutlineHeading(node) {
  const text = node.heading || node.title || "";
  return `${"#".repeat(node.level)} ${withMarkdownSectionId(text, node.id)}`;
}

function serializeMarkdownOutlineTree(tree) {
  const parts = [];
  if (tree?.preamble) parts.push(tree.preamble);

  (tree?.sections || []).forEach((section) => {
    parts.push(markdownOutlineHeading(section));
    if (section.lead) parts.push(section.lead);
    (section.children || []).forEach((child) => {
      parts.push(markdownOutlineHeading(child));
      if (child.lead) parts.push(child.lead);
    });
  });

  return parts.join("\n\n");
}

// --- Editing the tree ----------------------------------------------------
//
// Structural edits are operations on records, not surgery on a string. The
// string is what comes out at the end, regenerated from the tree, which is why
// none of these functions know anything about Markdown.
//
// They are total: every one returns whether it did something, and none of them
// throws on an id it cannot find. A structural command that silently did half
// its job would be worse than one that reported doing nothing.

function outlineTreeFind(tree, id) {
  const wanted = String(id || "");
  if (!wanted) return null;

  for (const section of tree?.sections || []) {
    if (section.id === wanted) return { node: section, parent: null, siblings: tree.sections };
    const index = (section.children || []).findIndex((child) => child.id === wanted);
    if (index >= 0) return { node: section.children[index], parent: section, siblings: section.children };
  }
  return null;
}

function outlineTreeMove(tree, id, direction) {
  const found = outlineTreeFind(tree, id);
  if (!found) return false;

  const step = direction < 0 ? -1 : 1;
  const from = found.siblings.indexOf(found.node);
  const to = from + step;
  if (to < 0 || to >= found.siblings.length) return false;

  found.siblings.splice(from, 1);
  found.siblings.splice(to, 0, found.node);
  return true;
}

// A subsection becomes a section, landing directly after the one it was under.
// It takes nothing with it: a subsection has no children in a two-level
// outline, and the siblings that followed it stay where they were.
function outlineTreePromote(tree, id) {
  const found = outlineTreeFind(tree, id);
  if (!found || !found.parent) return false;

  found.siblings.splice(found.siblings.indexOf(found.node), 1);
  found.node.level = 2;
  found.node.children = [];
  tree.sections.splice(tree.sections.indexOf(found.parent) + 1, 0, found.node);
  return true;
}

// A section becomes a subsection of the one above it. Its own subsections
// follow it down rather than being dropped -- there is no third level to put
// them on, and losing them silently is not an option a structural command has.
function outlineTreeDemote(tree, id) {
  const found = outlineTreeFind(tree, id);
  if (!found || found.parent) return false;

  const index = tree.sections.indexOf(found.node);
  if (index <= 0) return false;

  const target = tree.sections[index - 1];
  const moving = [found.node, ...(found.node.children || [])];
  moving.forEach((node) => {
    node.level = 3;
    node.children = [];
  });
  tree.sections.splice(index, 1);
  target.children.push(...moving);
  return true;
}

function outlineTreeRename(tree, id, heading) {
  const found = outlineTreeFind(tree, id);
  if (!found) return false;

  const text = stripMarkdownSectionId(String(heading || "")).trim();
  if (!text) return false;

  found.node.heading = text;
  found.node.title = stripMarkdownInlineSyntax(text);
  return true;
}

function outlineTreeInsert(tree, { afterId = "", level = 2, heading = "" } = {}) {
  const node = markdownOutlineNode(level === 3 ? 3 : 2, heading);
  node.id = newMarkdownSectionId();

  const found = afterId ? outlineTreeFind(tree, afterId) : null;
  if (node.level === 3) {
    const parent = found?.parent || found?.node || tree.sections[tree.sections.length - 1];
    if (!parent || parent.level !== 2) return null;
    const at = found?.parent ? parent.children.indexOf(found.node) + 1 : parent.children.length;
    parent.children.splice(at, 0, node);
    return node;
  }

  const anchorSection = found?.parent || found?.node || null;
  const at = anchorSection ? tree.sections.indexOf(anchorSection) + 1 : tree.sections.length;
  tree.sections.splice(at, 0, node);
  return node;
}

// What a pasted block becomes. The tree has no text box, and a writer who
// cannot paste into it has lost something the free-text outline could do -- so
// paste is a parse, and the result is records.
//
// Anything before the first heading becomes a section of its own, titled by
// its first line. Losing it would be the quiet kind of data loss, and guessing
// which existing section it belongs to would be worse than asking the writer
// to drag it.
function markdownOutlineNodesFromPaste(text) {
  const tree = markdownOutlineTree(text);
  const nodes = [];

  if (tree.preamble) {
    const lines = tree.preamble.split("\n");
    const first = lines.find((line) => line.trim()) || "";
    const rest = lines.slice(lines.indexOf(first) + 1).join("\n").trim();
    const node = markdownOutlineNode(2, stripMarkdownInlineSyntax(first.replace(/^\s{0,3}#{1,6}\s+/, "")));
    node.lead = rest;
    if (node.title) nodes.push(node);
  }

  nodes.push(...tree.sections);
  return nodes;
}

// Move a node to an explicit place. Dragging is not a sequence of keystrokes,
// so it does not compose the other operations: it says where the node goes.
//
// A section can only land among sections, and it takes its subsections with
// it. A subsection can only land among subsections, of any section. Neither
// can be dropped into itself.
function outlineTreeMoveTo(tree, id, parentId, index) {
  const found = outlineTreeFind(tree, id);
  if (!found) return false;

  const node = found.node;
  const wantsChild = Boolean(parentId);
  if (wantsChild && node.level === 2 && node.children?.length) return false;
  if (wantsChild && parentId === node.id) return false;

  const parent = wantsChild ? outlineTreeFind(tree, parentId)?.node : null;
  if (wantsChild && (!parent || parent.level !== 2)) return false;

  const target = wantsChild ? parent.children : tree.sections;
  const from = found.siblings.indexOf(node);
  const sameList = found.siblings === target;
  let at = Math.max(0, Math.min(Number(index) || 0, target.length));
  if (sameList && at === from) return false;

  found.siblings.splice(from, 1);
  if (sameList && at > from) at -= 1;

  node.level = wantsChild ? 3 : 2;
  if (wantsChild) node.children = [];
  target.splice(at, 0, node);
  return true;
}

// Returns what it took, so the caller can put it back. A record operation that
// removes a section and its subsections must be able to say what left.
function outlineTreeRemove(tree, id) {
  const found = outlineTreeFind(tree, id);
  if (!found) return null;

  const index = found.siblings.indexOf(found.node);
  found.siblings.splice(index, 1);
  return { node: found.node, parentId: found.parent?.id || "", index };
}

function markdownDocumentSectionBlocks(markdown, level = 2) {
  const sectionLevel = Math.max(1, Math.min(6, Number(level) || 2));
  const lines = normalizeMarkdownText(markdown).split("\n");
  const blocks = [];
  let inCode = false;
  let current = null;

  function finishCurrentBlock() {
    if (!current) return;
    const bodyLines = trimMarkdownBlockLines(current.bodyLines);
    blocks.push({
      level: sectionLevel,
      title: current.title,
      id: current.id || "",
      heading: current.heading,
      body: bodyLines.join("\n"),
      source: [current.heading, ...bodyLines].join("\n").trim(),
      index: blocks.length,
    });
    current = null;
  }

  lines.forEach((line) => {
    const isFence = /^\s{0,3}(?:```|~~~)/.test(line);
    if (isFence) {
      if (current) current.bodyLines.push(line);
      inCode = !inCode;
      return;
    }

    if (!inCode) {
      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
      if (headingMatch && headingMatch[1].length === sectionLevel) {
        finishCurrentBlock();
        const title = stripMarkdownInlineSyntax(headingMatch[2]);
        current = title
          ? { title, id: markdownSectionId(headingMatch[2]), heading: line, bodyLines: [] }
          : null;
        return;
      }
    }

    if (current) current.bodyLines.push(line);
  });

  finishCurrentBlock();
  return blocks;
}

function replaceMarkdownDocumentSectionBody(markdown, level = 2, index = 0, nextBody = "") {
  const sectionLevel = Math.max(1, Math.min(6, Number(level) || 2));
  const targetIndex = Math.max(0, Number(index) || 0);
  const lines = normalizeMarkdownText(markdown).split("\n");
  const bodyLines = trimMarkdownBlockLines(normalizeMarkdownText(nextBody).split("\n"));
  let inCode = false;
  let currentIndex = -1;
  let bodyStart = -1;
  let bodyEnd = lines.length;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const isFence = /^\s{0,3}(?:```|~~~)/.test(line);
    if (isFence) {
      inCode = !inCode;
      continue;
    }

    if (inCode) continue;

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (!headingMatch) continue;

    if (headingMatch[1].length === sectionLevel) {
      currentIndex += 1;
      if (currentIndex === targetIndex) {
        bodyStart = lineIndex + 1;
        bodyEnd = lines.length;
        continue;
      }
      if (currentIndex > targetIndex && bodyStart >= 0) {
        bodyEnd = lineIndex;
        break;
      }
    }
  }

  if (bodyStart < 0) return normalizeMarkdownText(markdown);

  const nextLines = [
    ...lines.slice(0, bodyStart),
    "",
    ...bodyLines,
    "",
    ...lines.slice(bodyEnd),
  ];
  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
