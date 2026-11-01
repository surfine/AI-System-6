// Pure formatting engine for the writing surfaces.
//
// The DOM helpers in apps/desktop/app/core/markdown-editor.js read the textarea
// directly, which makes them impossible to test without a browser and impossible
// to reuse from a different host. This module keeps the same semantics but
// takes the document string and the selection as plain arguments and returns a
// description of ONE replacement:
//
//   { from, to, insert, anchor, head }
//
// The caller replaces text.slice(from, to) with `insert` and then sets the
// selection to anchor..head, both already expressed as offsets in the NEW text.
// Nothing here touches the DOM, so `formatMarkdown` is a pure function of its
// four arguments.

export const FORMAT_COMMANDS = Object.freeze([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "heading-0",
  "heading-1",
  "heading-2",
  "heading-3",
  "quote",
  "bullet",
  "numbered",
  "task",
  "indent",
  "outdent",
  "code-block",
  "rule",
  "table",
]);

const INDENT = "  ";
const FENCE = "```";
const TABLE_SKELETON = "| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n";

// A standalone run of the marker character, so "*" does not match inside "**".
// `dir` is -1 to look left of `pos`, +1 to look right.
function isLoneMarker(value, pos, marker, dir) {
  const ch = marker[0];
  if (dir < 0) {
    if (value.slice(pos - marker.length, pos) !== marker) return false;
    return value[pos - marker.length - 1] !== ch;
  }
  if (value.slice(pos, pos + marker.length) !== marker) return false;
  return value[pos + marker.length] !== ch;
}

function clampInt(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(n)));
}

function leadingWhitespace(line) {
  const match = line.match(/^[ \t]*/);
  return match ? match[0] : "";
}

function itemLines(lines) {
  return lines.filter((line) => line.trim() !== "");
}

function everyLine(lines, pattern) {
  const items = itemLines(lines);
  return items.length > 0 && items.every((line) => pattern.test(line));
}

// Bullet, ordered and task markers are mutually exclusive in this editor, so
// each toggle removes the other two before applying its own.
function stripListMarkers(line) {
  return line.replace(/^([ \t]*)(?:\d+\.[ \t]+|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+)/, "$1");
}

// Lines touched by the selection. A trailing newline belongs to the line it
// ends, so a caret sitting at column 0 of the next line does not drag that line
// into the edit, unless the selection is empty.
function touchedRange(text, from, to) {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  const toIndex = to > from ? to - 1 : to;
  let end = text.indexOf("\n", toIndex);
  if (end === -1) end = text.length;
  return { start, end };
}

function replaceRange(from, to, insert, anchor, head) {
  return { from, to, insert, anchor, head };
}

// Every block command rewrites only the START of a line (a marker added,
// removed or swapped); the rest of the line is carried over unchanged. So a
// caret in that unchanged tail keeps its place in the text, and a caret in the
// rewritten prefix lands right after the new prefix, where typing continues.
function mapLineCaret(column, oldLine, newLine) {
  let suffix = 0;
  const max = Math.min(oldLine.length, newLine.length);
  while (suffix < max && oldLine[oldLine.length - 1 - suffix] === newLine[newLine.length - 1 - suffix]) suffix += 1;
  const oldPrefix = oldLine.length - suffix;
  const newPrefix = newLine.length - suffix;
  return column <= oldPrefix ? newPrefix : column + (newPrefix - oldPrefix);
}

// A whole-line block edit: rewrite every touched line with `mapper`, then map
// each selection endpoint onto the line it sat on.
function blockEdit(text, from, to, anchor, head, mapper) {
  const { start, end } = touchedRange(text, from, to);
  const lines = text.slice(start, end).split("\n");
  const out = lines.map((line, i) => mapper(line, i, lines));
  const mapPos = (pos) => {
    let oldAt = start;
    let newAt = start;
    for (let i = 0; i < lines.length; i += 1) {
      const lineEnd = oldAt + lines[i].length;
      if (pos <= lineEnd || i === lines.length - 1) {
        const column = Math.max(0, Math.min(lines[i].length, pos - oldAt));
        return newAt + mapLineCaret(column, lines[i], out[i]);
      }
      oldAt = lineEnd + 1;
      newAt += out[i].length + 1;
    }
    return newAt;
  };
  return replaceRange(start, end, out.join("\n"), mapPos(anchor), mapPos(head));
}

function headingCommand(text, from, to, anchor, head, level) {
  const { start, end } = touchedRange(text, from, to);
  const lines = text.slice(start, end).split("\n");
  const multiple = lines.length > 1;
  return blockEdit(text, from, to, anchor, head, (line) => {
    // An empty line stays empty unless it is the only touched line.
    if (line === "" && multiple) return line;
    const bare = line.replace(/^#{1,6}[ \t]+/, "");
    return level > 0 ? "#".repeat(level) + " " + bare : bare;
  });
}

function quoteCommand(text, from, to, anchor, head) {
  const { start, end } = touchedRange(text, from, to);
  const lines = text.slice(start, end).split("\n");
  const remove = everyLine(lines, /^>[ \t]?/);
  return blockEdit(text, from, to, anchor, head, (line) => {
    if (line.trim() === "") return line;
    // A line may carry several ">"; removing the first one only is correct.
    return remove ? line.replace(/^>[ \t]?/, "") : "> " + line;
  });
}

function bulletCommand(text, from, to, anchor, head) {
  const { start, end } = touchedRange(text, from, to);
  const lines = text.slice(start, end).split("\n");
  const remove = everyLine(lines, /^[ \t]*[-*+][ \t]+(?!\[[ xX]\])/);
  return blockEdit(text, from, to, anchor, head, (line) => {
    if (line.trim() === "") return line;
    if (remove) return line.replace(/^([ \t]*)[-*+][ \t]+/, "$1");
    return leadingWhitespace(line) + "- " + stripListMarkers(line).slice(leadingWhitespace(line).length);
  });
}

function numberedCommand(text, from, to, anchor, head) {
  const { start, end } = touchedRange(text, from, to);
  const lines = text.slice(start, end).split("\n");
  const remove = everyLine(lines, /^[ \t]*\d+\.[ \t]+/);
  let counter = 0;
  return blockEdit(text, from, to, anchor, head, (line) => {
    if (line.trim() === "") return line;
    if (remove) return line.replace(/^([ \t]*)\d+\.[ \t]+/, "$1");
    counter += 1;
    const lead = leadingWhitespace(line);
    return lead + counter + ". " + stripListMarkers(line).slice(lead.length);
  });
}

function taskCommand(text, from, to, anchor, head) {
  const { start, end } = touchedRange(text, from, to);
  const lines = text.slice(start, end).split("\n");
  const remove = everyLine(lines, /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/);
  return blockEdit(text, from, to, anchor, head, (line) => {
    if (line.trim() === "") return line;
    if (remove) return line.replace(/^([ \t]*)[-*+][ \t]+\[[ xX]\][ \t]+/, "$1");
    const lead = leadingWhitespace(line);
    return lead + "- [ ] " + stripListMarkers(line).slice(lead.length);
  });
}

function indentCommand(text, from, to, anchor, head, outdent) {
  const { start, end } = touchedRange(text, from, to);
  const lines = text.slice(start, end).split("\n");
  // Unlike mdeIndent this always acts; the host decides when Tab keeps its
  // normal focus-navigation behaviour.
  return blockEdit(text, from, to, anchor, head, (line) => {
    if (outdent) return line.replace(/^( {1,2}|\t)/, "");
    return INDENT + line;
  });
}

// Fence lines pair up in document order: the first opens, the next closes.
function fencePairs(text) {
  const pairs = [];
  let open = null;
  let offset = 0;
  for (const line of text.split("\n")) {
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      if (open) {
        pairs.push({ open, close: { start: offset, end: offset + line.length } });
        open = null;
      } else {
        open = { start: offset, end: offset + line.length };
      }
    }
    offset += line.length + 1;
  }
  return pairs;
}

function codeBlockCommand(text, from, to, anchor, head) {
  const { start, end } = touchedRange(text, from, to);

  // Inside an existing fenced block (or on one of its fences): remove the pair.
  const pair = fencePairs(text).find((p) => p.open.start <= start && p.close.end >= end);
  if (pair) {
    const openLen = pair.open.end - pair.open.start + 1;
    const hasBody = pair.close.start > pair.open.end + 1;
    const body = hasBody ? text.slice(pair.open.end + 1, pair.close.start - 1) : "";
    const map = (pos) => {
      if (pos <= pair.open.end) return pair.open.start;
      if (pos >= pair.close.start) return pair.open.start + body.length;
      return pos - openLen;
    };
    return replaceRange(pair.open.start, pair.close.end, body, map(anchor), map(head));
  }

  const lines = text.slice(start, end).split("\n");
  if (lines.length === 1 && lines[0] === "") {
    // "```\n\n```" so the caret lands on the empty middle line.
    return replaceRange(start, end, FENCE + "\n\n" + FENCE, start + FENCE.length + 1, start + FENCE.length + 1);
  }

  const body = lines.join("\n");
  const insert = FENCE + "\n" + body + "\n" + FENCE;
  const shift = FENCE.length + 1;
  return replaceRange(start, end, insert, anchor + shift, head + shift);
}

function ruleCommand(text, from, to) {
  const lineStart = text.lastIndexOf("\n", to - 1) + 1;
  let lineEnd = text.indexOf("\n", to);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  if (line.trim() === "") {
    // The empty line itself became the rule, so only add the blank line that
    // separates it from whatever comes next. A newline already at lineEnd has to
    // be kept: it is the one ending the rule, not a separator.
    const separator = text.charAt(lineEnd) === "\n" ? "" : "\n";
    const insert = "---" + separator;
    return replaceRange(lineStart, lineEnd, insert, lineStart + insert.length, lineStart + insert.length);
  }
  const insert = "\n\n---\n";
  const caret = lineEnd + insert.length;
  return replaceRange(lineEnd, lineEnd, insert, caret, caret);
}

function tableCommand(text, from, to, anchor) {
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  let lineEnd = text.indexOf("\n", from);
  if (lineEnd === -1) lineEnd = text.length;
  const emptyLine = text.slice(lineStart, lineEnd).trim() === "";
  // Only a caret alone on an empty line needs no separator; anything else is
  // glued to the text around it and must be pushed onto its own block. A single
  // newline is enough when the caret already sits just after one.
  const needsSeparator = from > 0 && !(emptyLine && from === lineStart);
  const prefix = !needsSeparator ? "" : (text[from - 1] === "\n" ? "\n" : "\n\n");
  const insert = prefix + TABLE_SKELETON;
  // Select the "列 1" placeholder: it sits after the "| " that opens row one.
  const anchorNew = from + prefix.length + 2;
  return replaceRange(from, to, insert, anchorNew, anchorNew + 3);
}

function headingLevel(command) {
  return Number(command.slice("heading-".length));
}

export function formatMarkdown(text, from, to, command) {
  const doc = typeof text === "string" ? text : "";
  // The inputs clamp to the document, but the returned offsets describe the NEW
  // text, so longer than the input; the caller clamps those.
  const first = clampInt(from, doc.length);
  const last = clampInt(to, doc.length);
  const start = Math.min(first, last);
  const end = Math.max(first, last);

  if (!FORMAT_COMMANDS.includes(command)) return null;

  switch (command) {
    case "bold":
      return wrapCommand(doc, start, end, "**");
    case "italic":
      return wrapCommand(doc, start, end, "*");
    case "strike":
      return wrapCommand(doc, start, end, "~~");
    case "code":
      return wrapCommand(doc, start, end, "`");
    case "link":
      return linkCommand(doc, start, end);
    case "quote":
      return quoteCommand(doc, start, end, start, end);
    case "bullet":
      return bulletCommand(doc, start, end, start, end);
    case "numbered":
      return numberedCommand(doc, start, end, start, end);
    case "task":
      return taskCommand(doc, start, end, start, end);
    case "indent":
      return indentCommand(doc, start, end, start, end, false);
    case "outdent":
      return indentCommand(doc, start, end, start, end, true);
    case "code-block":
      return codeBlockCommand(doc, start, end, start, end);
    case "rule":
      return ruleCommand(doc, start, end);
    case "table":
      return tableCommand(doc, start, end, start);
    default:
      break;
  }

  const level = headingLevel(command);
  if (Number.isInteger(level) && level >= 0 && level <= 3) {
    return headingCommand(doc, start, end, start, end, level);
  }
  return null;
}

// Inline wrap, mirroring mdeToggleWrap: unwrap when the markers are inside the
// selection, unwrap when they sit just outside it, otherwise wrap.
function wrapCommand(doc, start, end, marker) {
  const inner = doc.slice(start, end);
  const mlen = marker.length;
  const ch = marker[0];

  if (
    inner.length >= 2 * mlen
    && inner.startsWith(marker)
    && inner.endsWith(marker)
    && inner[mlen] !== ch
    && inner[inner.length - mlen - 1] !== ch
  ) {
    const unwrapped = inner.slice(mlen, inner.length - mlen);
    return replaceRange(start, end, unwrapped, start, start + unwrapped.length);
  }

  if (isLoneMarker(doc, start, marker, -1) && isLoneMarker(doc, end, marker, 1)) {
    return replaceRange(start - mlen, end + mlen, inner, start - mlen, start - mlen + inner.length);
  }

  const wrapped = marker + inner + marker;
  return replaceRange(start, end, wrapped, start + mlen, start + mlen + inner.length);
}

function linkCommand(doc, start, end) {
  const sel = doc.slice(start, end);
  if (sel) {
    return replaceRange(start, end, "[" + sel + "]()", start + sel.length + 3, start + sel.length + 3);
  }
  return replaceRange(start, end, "[]()", start + 1, start + 1);
}

export function applyFormat(text, result) {
  const doc = typeof text === "string" ? text : "";
  if (!result) return doc;
  return doc.slice(0, result.from) + result.insert + doc.slice(result.to);
}
