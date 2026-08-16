// Lightweight markdown editing affordances for the textarea-based writing
// surfaces (TeachText + the writing-flow editors). Keyboard-only, no chrome.
//
// All edits go through document.execCommand("insertText", ...) so the native
// undo/redo stack (Cmd/Ctrl+Z) is preserved and a real `input` event fires —
// which keeps the existing modified-flag / linked-document sync / preview
// refresh working without any extra wiring. A value-write fallback covers the
// rare case where execCommand is unavailable.

// Matches the leading marker of a list or quote line:
//   "- ", "* ", "+ ", "- [ ] ", "- [x] ", "1. ", "> ", ">> "
const mdeMarkerPattern = /^(\s*)((?:[-*+][ \t]+\[[ xX]\][ \t]+)|(?:[-*+][ \t]+)|(?:\d+\.[ \t]+)|(?:>+[ \t]?))(.*)$/;
const mdeListLinePattern = /^\s*(?:[-*+][ \t]+|\d+\.[ \t]+|>+[ \t]?)/;

// Replace [from, to) with `insert`, preserving native undo. Optionally set the
// resulting selection to [selStart, selEnd).
function mdeApply(textarea, { from, to, insert, selStart, selEnd }) {
  textarea.focus();
  textarea.setSelectionRange(from, to);
  const before = textarea.value;
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, insert);
  } catch {
    ok = false;
  }
  // execCommand can report success and change nothing — an unrendered control
  // never takes focus, and the command then quietly no-ops. Trust the buffer,
  // not the return value, or a paste would vanish after preventDefault.
  if (!ok || textarea.value === before) {
    textarea.value = before.slice(0, from) + insert + before.slice(to);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (typeof selStart === "number") {
    textarea.setSelectionRange(selStart, typeof selEnd === "number" ? selEnd : selStart);
  }
}

// True when `marker` sits at `pos` in `value` as a standalone run, i.e. it is
// not actually part of a longer run of the same character (so "*" does not
// match inside "**"). `dir` is -1 to look left of pos, +1 to look right.
function mdeIsLoneMarker(value, pos, marker, dir) {
  const ch = marker[0];
  if (dir < 0) {
    if (value.slice(pos - marker.length, pos) !== marker) return false;
    return value[pos - marker.length - 1] !== ch;
  }
  if (value.slice(pos, pos + marker.length) !== marker) return false;
  return value[pos + marker.length] !== ch;
}

// Cmd/Ctrl+B / +I: wrap the selection in `marker`, or unwrap if already wrapped.
function mdeToggleWrap(textarea, marker) {
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const inner = value.slice(start, end);
  const mlen = marker.length;
  const ch = marker[0];

  // Markers inside the selection: |**bold**|
  if (
    inner.length >= 2 * mlen &&
    inner.startsWith(marker) &&
    inner.endsWith(marker) &&
    inner[mlen] !== ch &&
    inner[inner.length - mlen - 1] !== ch
  ) {
    const unwrapped = inner.slice(mlen, inner.length - mlen);
    mdeApply(textarea, { from: start, to: end, insert: unwrapped, selStart: start, selEnd: start + unwrapped.length });
    return;
  }

  // Markers just outside the selection: **|bold|**
  if (mdeIsLoneMarker(value, start, marker, -1) && mdeIsLoneMarker(value, end, marker, 1)) {
    mdeApply(textarea, { from: start - mlen, to: end + mlen, insert: inner, selStart: start - mlen, selEnd: start - mlen + inner.length });
    return;
  }

  // Otherwise wrap.
  const wrapped = marker + inner + marker;
  mdeApply(textarea, {
    from: start,
    to: end,
    insert: wrapped,
    selStart: start + mlen,
    selEnd: start + mlen + inner.length,
  });
}

// Cmd/Ctrl+K: turn the selection into a link, caret in the URL slot. With no
// selection, insert an empty link with the caret in the label slot.
function mdeLink(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const sel = textarea.value.slice(start, end);
  if (sel) {
    const insert = `[${sel}]()`;
    const urlPos = start + sel.length + 3; // inside ()
    mdeApply(textarea, { from: start, to: end, insert, selStart: urlPos });
  } else {
    mdeApply(textarea, { from: start, to: end, insert: "[]()", selStart: start + 1 });
  }
}

// Enter: continue a list/quote marker, or exit the list when the item is empty.
// Returns true when handled (caller should preventDefault).
function mdeContinueList(textarea) {
  if (textarea.selectionStart !== textarea.selectionEnd) return false;
  const value = textarea.value;
  const caret = textarea.selectionStart;
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  let lineEnd = value.indexOf("\n", caret);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd);
  const match = line.match(mdeMarkerPattern);
  if (!match) return false;

  const [, indent, marker, content] = match;

  // Empty item -> exit: clear the marker, leaving a blank line.
  if (content.trim() === "") {
    mdeApply(textarea, { from: lineStart, to: lineEnd, insert: "", selStart: lineStart });
    return true;
  }

  let nextMarker;
  const orderedMatch = marker.match(/^(\d+)\.([ \t]+)$/);
  if (orderedMatch) {
    nextMarker = `${Number(orderedMatch[1]) + 1}.${orderedMatch[2]}`;
  } else if (/\[[ xX]\]/.test(marker)) {
    nextMarker = marker.replace(/\[[ xX]\]/, "[ ]");
  } else {
    nextMarker = marker;
  }

  const insert = `\n${indent}${nextMarker}`;
  const pos = caret + insert.length;
  mdeApply(textarea, { from: caret, to: caret, insert, selStart: pos });
  return true;
}

// Tab / Shift+Tab: indent or outdent the selected lines. Only acts inside a
// list/quote line or across a multi-line selection; otherwise returns false so
// Tab keeps its normal focus-navigation behaviour (accessibility).
function mdeIndent(textarea, outdent) {
  const value = textarea.value;
  const selStart = textarea.selectionStart;
  const selEnd = textarea.selectionEnd;
  const firstLineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  let lastLineEnd = value.indexOf("\n", selEnd);
  if (lastLineEnd === -1) lastLineEnd = value.length;

  const block = value.slice(firstLineStart, lastLineEnd);
  const multiline = block.includes("\n");
  const firstLineEnd = value.indexOf("\n", firstLineStart);
  const firstLine = value.slice(firstLineStart, firstLineEnd === -1 ? value.length : firstLineEnd);
  if (selStart === selEnd && !multiline && !mdeListLinePattern.test(firstLine)) {
    return false; // plain text, no selection -> let Tab move focus
  }

  const INDENT = "  ";
  let removedFirst = 0;
  let removedTotal = 0;
  const newBlock = block
    .split("\n")
    .map((line, index) => {
      if (outdent) {
        const lead = line.match(/^( {1,2}|\t)/);
        const removed = lead ? lead[0].length : 0;
        if (index === 0) removedFirst = removed;
        removedTotal += removed;
        return line.slice(removed);
      }
      return INDENT + line;
    })
    .join("\n");

  mdeApply(textarea, { from: firstLineStart, to: lastLineEnd, insert: newBlock });

  if (outdent) {
    const nextStart = Math.max(firstLineStart, selStart - removedFirst);
    textarea.setSelectionRange(nextStart, Math.max(nextStart, selEnd - removedTotal));
  } else {
    const lineCount = block.split("\n").length;
    const addedBeforeStart = INDENT.length; // first line always shifts the caret
    textarea.setSelectionRange(selStart + addedBeforeStart, selEnd + INDENT.length * lineCount);
  }
  return true;
}

// Paste takeover. The clipboard's `text/html` flavour is converted to Markdown
// locally (app/core/paste-markdown.js) so headings, lists, emphasis, links,
// tables and code blocks survive the trip into a textarea instead of arriving
// as one flat run the writer has to rebuild by hand.
//
// Three shapes, in this order:
//   1. a bare URL dropped on a selection  -> [selection](url)
//   2. clipboard HTML                     -> Markdown, heading levels pushed
//                                            down to fit the landing surface
//   3. a multi-line paste inside a list   -> each line keeps the list marker
//
// The insertion goes through mdeApply, i.e. execCommand("insertText"), so
// Cmd/Ctrl+Z still undoes the whole paste in one step. When the result would
// be identical to what the browser does anyway, the event is left alone.
function mdePaste(event, textarea) {
  const runtime = window.AISystem6PasteMarkdown;
  const clipboard = event.clipboardData;
  if (!runtime || !clipboard || textarea.readOnly || textarea.disabled) return;

  const plain = clipboard.getData("text/plain") || "";
  const html = clipboard.getData("text/html") || "";
  if (!plain && !html) return;

  const value = textarea.value;
  const from = textarea.selectionStart;
  const to = textarea.selectionEnd;
  const selected = value.slice(from, to);

  let insert = "";
  if (selected && !selected.includes("\n") && runtime.pasteIsBareUrl(plain) && !runtime.pasteIsBareUrl(selected)) {
    insert = `[${selected}](${plain.trim()})`;
  } else {
    const converted = html ? runtime.pasteHtmlToMarkdown(html, { surface: textarea.id }) : "";
    insert = runtime.pasteContinueListMarkers(value, from, converted || plain);
    if (!insert || insert === plain) return; // nothing gained: keep the native paste
    // A block that starts mid-line would fuse with the line above it.
    if (from > 0 && value[from - 1] !== "\n" && /^(?:#{1,6} |[-*+] |\d+\. |> |\||```)/.test(insert)) {
      insert = `\n${insert}`;
    }
  }

  event.preventDefault();
  const shift = runtime.pasteLineShift(value, { from, to, insert });
  mdeApply(textarea, { from, to, insert, selStart: from + insert.length });
  // Anything holding line or character positions in this buffer has to move
  // with the text. A stale position is worse than none: it still looks valid.
  if (typeof notePasteLineShift === "function") notePasteLineShift(textarea, shift);
  if (typeof setStatus === "function" && typeof t === "function" && html) {
    setStatus(t("pasted_as_markdown"));
  }
}

// Attach the editor behaviours to a textarea. Idempotent.
function attachMarkdownEditor(textarea) {
  if (!textarea || textarea.dataset.mdeReady === "true") return;
  textarea.dataset.mdeReady = "true";

  textarea.addEventListener("paste", (event) => mdePaste(event, textarea));

  textarea.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;

    if (mod && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "b") { event.preventDefault(); mdeToggleWrap(textarea, "**"); return; }
      if (key === "i") { event.preventDefault(); mdeToggleWrap(textarea, "*"); return; }
      if (key === "k") { event.preventDefault(); mdeLink(textarea); return; }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !eventIsTextComposition(event)) {
      if (mdeContinueList(textarea)) event.preventDefault();
      return;
    }

    if (event.key === "Tab") {
      if (mdeIndent(textarea, event.shiftKey)) event.preventDefault();
    }
  });
}

// ---------------------------------------------------------------------------
// Live markdown highlight overlay ("Auto-Markdown").
//
// A mirror layer is painted behind a transparent-text textarea. To keep the
// caret aligned with the painted glyphs, the overlay only changes COLOR /
// opacity / decoration / background — never font weight, style, size or any
// metric that would alter glyph advance width. Markers recede; content stays.
// ---------------------------------------------------------------------------

function mdeEscapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline spans: code, bold, italic, strike, highlight, link. Recurses for the
// content of bold/italic so nesting paints correctly. All width-neutral.
function mdeInlineHtml(text) {
  const pattern = /(`[^`\n]+`)|(\*\*[^\n]+?\*\*|__[^\n]+?__)|(\*[^\s*][^\n]*?\*|_[^\s_][^\n]*?_)|(~~[^\n]+?~~)|(==[^\n]+?==)|(\[[^\]\n]*\]\([^)\n]*\))/g;
  let html = "";
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    html += mdeEscapeHtml(text.slice(last, match.index));
    const token = match[0];
    if (match[1]) {
      html += `<span class="md-marker">\`</span><span class="md-code">${mdeEscapeHtml(token.slice(1, -1))}</span><span class="md-marker">\`</span>`;
    } else if (match[2]) {
      const mark = token.slice(0, 2);
      html += `<span class="md-marker">${mark}</span><span class="md-strong">${mdeInlineHtml(token.slice(2, -2))}</span><span class="md-marker">${mark}</span>`;
    } else if (match[3]) {
      const mark = token[0];
      html += `<span class="md-marker">${mark}</span><span class="md-em">${mdeInlineHtml(token.slice(1, -1))}</span><span class="md-marker">${mark}</span>`;
    } else if (match[4]) {
      html += `<span class="md-marker">~~</span><span class="md-strike">${mdeEscapeHtml(token.slice(2, -2))}</span><span class="md-marker">~~</span>`;
    } else if (match[5]) {
      html += `<span class="md-marker">==</span><span class="md-mark">${mdeEscapeHtml(token.slice(2, -2))}</span><span class="md-marker">==</span>`;
    } else if (match[6]) {
      const link = token.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
      html += `<span class="md-marker">[</span><span class="md-link">${mdeEscapeHtml(link[1])}</span><span class="md-marker">](</span><span class="md-url">${mdeEscapeHtml(link[2])}</span><span class="md-marker">)</span>`;
    }
    last = pattern.lastIndex;
  }
  return html + mdeEscapeHtml(text.slice(last));
}

function mdeLineHtml(line, state) {
  if (/^\s*```/.test(line)) {
    state.fence = !state.fence;
    return `<span class="md-marker">${mdeEscapeHtml(line)}</span>`;
  }
  if (state.fence) return `<span class="md-code">${mdeEscapeHtml(line)}</span>`;

  let m = line.match(/^(\s*#{1,6}\s+)(.*)$/);
  if (m) return `<span class="md-marker">${mdeEscapeHtml(m[1])}</span><span class="md-heading">${mdeInlineHtml(m[2])}</span>`;

  m = line.match(/^(\s*>+\s?)(.*)$/);
  if (m) return `<span class="md-marker">${mdeEscapeHtml(m[1])}</span><span class="md-quote">${mdeInlineHtml(m[2])}</span>`;

  m = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)(\[[ xX]\]\s+)?(.*)$/);
  if (m) {
    let html = `<span class="md-marker">${mdeEscapeHtml(m[1])}</span>`;
    if (m[2]) html += `<span class="md-marker">${mdeEscapeHtml(m[2])}</span>`;
    return html + mdeInlineHtml(m[3]);
  }

  if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
    return `<span class="md-marker">${mdeEscapeHtml(line)}</span>`;
  }

  // A table row: let the pipes retreat so the columns read as columns. The
  // delimiter row is nothing but machinery, so all of it goes grey.
  if (/^\s*\|.*\|/.test(line)) {
    if (/^[\s|:-]+$/.test(line)) return `<span class="md-marker">${mdeEscapeHtml(line)}</span>`;
    return line
      .split(/(\|)/)
      .map((part) => (part === "|" ? '<span class="md-marker">|</span>' : mdeInlineHtml(part)))
      .join("");
  }

  return mdeInlineHtml(line);
}

function mdeParagraphRange(text, caret) {
  const pos = Math.max(0, Math.min(caret ?? 0, text.length));
  const lines = text.split("\n");
  const starts = [];
  let offset = 0;
  lines.forEach((line) => {
    starts.push(offset);
    offset += line.length + 1;
  });

  let lineIndex = 0;
  for (let i = 0; i < starts.length; i += 1) {
    const lineStart = starts[i];
    const lineEnd = lineStart + lines[i].length;
    if (pos >= lineStart && pos <= lineEnd + (i < starts.length - 1 ? 1 : 0)) {
      lineIndex = i;
      break;
    }
  }

  const markerPattern = /^(\s*)((?:[-*+]\s+)|(?:\d+\.\s+)|(?:>+\s?))/;
  const isBoundary = (line) => !line.trim() || /^\s*#{1,6}\s+/.test(line) || /^\s*```/.test(line);
  const currentLine = lines[lineIndex] || "";

  let startLine = lineIndex;
  let endLine = lineIndex;
  const currentMarker = currentLine.match(markerPattern);
  if (currentMarker) {
    const indent = currentMarker[1].length;
    while (endLine + 1 < lines.length) {
      const nextLine = lines[endLine + 1] || "";
      if (isBoundary(nextLine)) break;
      const nextMarker = nextLine.match(markerPattern);
      if (nextMarker && nextMarker[1].length <= indent) break;
      endLine += 1;
    }
  } else if (isBoundary(currentLine)) {
    startLine = lineIndex;
    endLine = lineIndex;
  } else {
    while (startLine > 0) {
      const prevLine = lines[startLine - 1] || "";
      if (isBoundary(prevLine) || markerPattern.test(prevLine)) break;
      startLine -= 1;
    }
    while (endLine + 1 < lines.length) {
      const nextLine = lines[endLine + 1] || "";
      if (isBoundary(nextLine) || markerPattern.test(nextLine)) break;
      endLine += 1;
    }
  }

  const start = starts[startLine] ?? 0;
  const end = (starts[endLine] ?? start) + (lines[endLine] || "").length;
  return { start, end: Math.max(start, end) };
}

function mdeLineFocusClass(lineStart, lineEnd, focusRange) {
  if (!focusRange) return "";
  if (lineEnd < focusRange.start || lineStart > focusRange.end) return " md-focus-muted";
  return " md-focus-active";
}

function mdeHighlightHtml(text, focusRange) {
  const state = { fence: false };
  let offset = 0;
  return text.split("\n").map((line) => {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    const cls = mdeLineFocusClass(lineStart, lineEnd, focusRange);
    const html = mdeLineHtml(line, state);
    return cls ? `<span class="${cls.trim()}">${html || " "}</span>` : html;
  }).join("\n");
}

function mdeVisualUnits(text) {
  let units = 0;
  for (const ch of text) {
    if (ch === "\t") units += 2;
    else if (/[\u1100-\u11ff\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60\uffe0-\uffef]/.test(ch)) units += 1;
    else units += 0.55;
  }
  return units;
}

function mdeCaretVisualRow(textarea) {
  const value = textarea.value;
  const caret = textarea.selectionStart ?? 0;
  const before = value.slice(0, caret).split("\n");
  const cs = getComputedStyle(textarea);
  const fontSize = parseFloat(cs.fontSize) || 15;
  const paddingX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const columns = Math.max(1, Math.floor((textarea.clientWidth - paddingX) / fontSize));
  let row = 0;
  for (let i = 0; i < before.length; i += 1) {
    const units = mdeVisualUnits(before[i]);
    if (i === before.length - 1) {
      row += Math.floor(units / columns);
    } else {
      row += Math.max(1, Math.ceil(units / columns));
    }
  }
  return row;
}

function mdeUpdateTypewriterPadding(textarea) {
  const surface = textarea?.closest(".mde-surface");
  if (!surface?.classList.contains("is-typewriter-mode")) return;
  const cs = getComputedStyle(textarea);
  const lineHeight = parseFloat(cs.lineHeight) || 25.5;
  const pad = Math.max(18, Math.round((textarea.clientHeight - lineHeight) / 2));
  surface.style.setProperty("--mde-typewriter-pad", `${pad}px`);
}

function mdeCenterCaret(textarea) {
  const surface = textarea?.closest(".mde-surface");
  if (!surface?.classList.contains("is-typewriter-mode")) return;
  mdeUpdateTypewriterPadding(textarea);
  const cs = getComputedStyle(textarea);
  const lineHeight = parseFloat(cs.lineHeight) || 25.5;
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const row = mdeCaretVisualRow(textarea);
  const target = paddingTop + row * lineHeight - (textarea.clientHeight / 2) + (lineHeight / 2);
  textarea.scrollTop = Math.max(0, target);
  const overlay = surface.querySelector(".mde-highlight");
  if (overlay) {
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  }
}

// Wrap a textarea with a synced highlight overlay. Idempotent.
function attachMarkdownHighlight(textarea) {
  if (!textarea || textarea.dataset.mdeHighlight === "true" || !textarea.parentNode) return;
  textarea.dataset.mdeHighlight = "true";

  const surface = document.createElement("div");
  surface.className = "mde-surface";
  const overlay = document.createElement("div");
  overlay.className = "mde-highlight";
  overlay.setAttribute("aria-hidden", "true");

  textarea.parentNode.insertBefore(surface, textarea);
  surface.append(overlay, textarea);
  textarea.classList.add("mde-input");

  let composing = false;
  let frame = 0;

  const paint = () => {
    frame = 0;
    const focusRange = surface.classList.contains("is-focus-mode")
      ? mdeParagraphRange(textarea.value, textarea.selectionStart)
      : null;
    overlay.innerHTML = mdeHighlightHtml(textarea.value, focusRange);
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  };
  const schedulePaint = () => {
    if (composing || frame) return;
    frame = requestAnimationFrame(paint);
  };
  const syncScroll = () => {
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  };
  const scheduleSelectionPaint = () => {
    if (surface.classList.contains("is-focus-mode")) schedulePaint();
    if (surface.classList.contains("is-typewriter-mode")) requestAnimationFrame(() => mdeCenterCaret(textarea));
  };

  textarea.addEventListener("input", schedulePaint);
  textarea.addEventListener("input", () => requestAnimationFrame(() => mdeCenterCaret(textarea)));
  textarea.addEventListener("click", scheduleSelectionPaint);
  textarea.addEventListener("keyup", scheduleSelectionPaint);
  textarea.addEventListener("select", scheduleSelectionPaint);
  textarea.addEventListener("focus", scheduleSelectionPaint);
  textarea.addEventListener("scroll", syncScroll, { passive: true });
  textarea.addEventListener("compositionstart", () => { composing = true; });
  textarea.addEventListener("compositionend", () => { composing = false; paint(); });
  paint();
}

function mdeSetFocusMode(textarea, mode) {
  const surface = textarea?.closest(".mde-surface");
  if (!surface) return "off";
  const next = mode === "paragraph" || mode === "typewriter" ? mode : "off";
  surface.dataset.mdeFocusMode = next;
  surface.classList.toggle("is-typewriter-mode", next === "typewriter" || next === "paragraph");
  surface.classList.toggle("is-focus-mode", next === "paragraph");
  if (next === "off") {
    surface.style.removeProperty("--mde-typewriter-pad");
  } else {
    mdeUpdateTypewriterPadding(textarea);
    requestAnimationFrame(() => mdeCenterCaret(textarea));
  }
  textarea.dispatchEvent(new Event("select"));
  return next;
}

function mdeCycleFocusMode(textarea) {
  const surface = textarea?.closest(".mde-surface");
  const current = surface?.dataset.mdeFocusMode || "off";
  const next = current === "off" ? "typewriter" : current === "typewriter" ? "paragraph" : "off";
  return mdeSetFocusMode(textarea, next);
}
