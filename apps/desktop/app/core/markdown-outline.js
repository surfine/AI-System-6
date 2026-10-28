// Core module: the outline tree that the writing route reads and edits.
//
// Only the writing route reaches this half: Writing Flow renders and edits the
// tree, Project Peek and the ClioProject window read it, and all three are
// lazy windows, so it rides their loaders in config.js
// (ensureWritingFlowModule, ensureProjectPeekModule, ensureClioProjectModule)
// instead of the boot. What stayed eager in app/core/markdown.js is the half
// the menu commands name directly -- core/actions.js reaches
// outlineTreeMove/Promote/Demote from the command table, so outlineTreeFind
// and the rest of that family never left the boot bundle. Moved verbatim
// 2026-10-27 for the System Floppy Budget: pure displacement, no behaviour
// change (tests/features/outline-tree.test.mjs runs both files together).

// Loaded by the shared lazy loader; shares the AI System 6 global scope.

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

// outlineTreeFind and the keyboard-command half of the family stayed in
// app/core/markdown.js (the boot bundle) for the reason the header names; the
// three functions below call them as globals, which exist by the time any of
// the three lazy consumers runs.
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
