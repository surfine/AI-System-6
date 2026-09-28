// Live preview: the page shows the finished text, and the Markdown comes back
// only where the caret is.
//
// Headings are set large, emphasis is set in its own face, list dashes become
// bullets, task brackets become checkboxes, and an image line becomes the
// picture. The marks themselves (`#`, `**`, `[]()`, the section id `{#8fe288}`,
// an image's `aisystem6-image:` handle) are hidden on every line the caret is
// NOT on. Put the caret on a line and that line turns back into plain source,
// so every character stays reachable and editable. Nothing is removed from the
// text: hiding is a decoration, so copy, search, undo and the saved file are
// untouched.
//
// When the editor does not have focus no line is "active", which is what a
// reader looking at the page wants.

import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

const hidden = Decoration.replace({});
const line = (cls) => Decoration.line({ class: cls });
const mark = (cls) => Decoration.mark({ class: cls });

const headingLine = [0, 1, 2, 3, 4, 5, 6].map((n) => line(`cm-md-heading cm-md-h${n}`));
const quoteLine = line("cm-md-quote");
const codeLine = line("cm-md-codeblock");
const fenceLine = line("cm-md-codeblock cm-md-fence");
const tableLine = line("cm-md-table");
const strongMark = mark("cm-md-strong");
const emMark = mark("cm-md-em");
const strikeMark = mark("cm-md-strike");
const codeMark = mark("cm-md-code");
const linkMark = mark("cm-md-link");
const machineMark = mark("cm-md-machine");
const markerMark = mark("cm-md-marker");
const orderedMark = mark("cm-md-ordinal");
const commentMark = mark("cm-md-comment");

const SECTION_ID = /[ \t]*\{#[0-9A-Za-z_-]+\}[ \t]*$/;
const IMAGE_LINE = /^!\[([^\]\n]*)\]\(([^)\n]*)\)\s*$/;

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }
}

class TaskWidget extends WidgetType {
  constructor(checked, from) {
    super();
    this.checked = checked;
    this.from = from;
  }
  eq(other) { return other.checked === this.checked && other.from === this.from; }
  toDOM(view) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task";
    box.checked = this.checked;
    box.tabIndex = -1;
    box.setAttribute("aria-label", this.checked ? "done" : "to do");
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      if (view.state.readOnly) return;
      view.dispatch({
        changes: { from: this.from + 1, to: this.from + 2, insert: this.checked ? " " : "x" },
        userEvent: "input.toggle",
      });
    });
    return box;
  }
  ignoreEvent() { return false; }
}

class RuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-md-rule";
    rule.setAttribute("aria-hidden", "true");
    return rule;
  }
}

class ImageWidget extends WidgetType {
  constructor(src, alt) {
    super();
    this.src = src;
    this.alt = alt;
  }
  eq(other) { return other.src === this.src && other.alt === this.alt; }
  toDOM() {
    const figure = document.createElement("span");
    figure.className = "cm-md-image";
    if (this.src) {
      const img = document.createElement("img");
      img.src = this.src;
      img.alt = this.alt;
      img.draggable = false;
      figure.append(img);
    } else {
      const missing = document.createElement("span");
      missing.className = "cm-md-image-missing";
      figure.append(missing);
    }
    if (this.alt) {
      const caption = document.createElement("span");
      caption.className = "cm-md-image-caption";
      caption.textContent = this.alt;
      figure.append(caption);
    }
    return figure;
  }
  ignoreEvent() { return false; }
}

function activeLines(view) {
  const lines = new Set();
  if (!view.hasFocus) return lines;
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) lines.add(n);
  }
  return lines;
}

function build(view, options) {
  const { state } = view;
  const doc = state.doc;
  const active = activeLines(view);
  const isActive = (pos) => active.has(doc.lineAt(pos).number);
  const decos = [];
  const add = (from, to, deco) => { if (to >= from) decos.push(deco.range(from, to)); };
  const addLine = (pos, deco) => decos.push(deco.range(doc.lineAt(pos).from));
  const hideMarkWithSpace = (from, to) => {
    const next = doc.sliceString(to, to + 1);
    add(from, next === " " || next === "\t" ? to + 1 : to, hidden);
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const name = node.name;
        if (/^ATXHeading[1-6]$/.test(name)) {
          const level = Number(name.slice(-1));
          addLine(node.from, headingLine[level]);
          const text = doc.sliceString(node.from, node.to);
          const id = text.match(SECTION_ID);
          if (id) {
            const idFrom = node.to - id[0].length;
            add(idFrom, node.to, isActive(node.from) ? machineMark : hidden);
          }
          return;
        }
        if (name === "HeaderMark") {
          if (!isActive(node.from)) hideMarkWithSpace(node.from, node.to);
          else add(node.from, node.to, markerMark);
          return;
        }
        if (name === "StrongEmphasis") { add(node.from, node.to, strongMark); return; }
        if (name === "Emphasis") { add(node.from, node.to, emMark); return; }
        if (name === "Strikethrough") { add(node.from, node.to, strikeMark); return; }
        if (name === "InlineCode") { add(node.from, node.to, codeMark); return; }
        if (name === "EmphasisMark" || name === "StrikethroughMark" || (name === "CodeMark" && node.node.parent?.name === "InlineCode")) {
          add(node.from, node.to, isActive(node.from) ? markerMark : hidden);
          return;
        }
        if (name === "Image") {
          const lineObj = doc.lineAt(node.from);
          const whole = doc.sliceString(lineObj.from, lineObj.to);
          const match = whole.match(IMAGE_LINE);
          if (match && !isActive(node.from) && lineObj.from === node.from) {
            const src = typeof options.resolveImage === "function" ? options.resolveImage(match[2]) : "";
            decos.push(Decoration.replace({ widget: new ImageWidget(src, match[1]) }).range(lineObj.from, lineObj.to));
            return false;
          }
          // The caret is on it: plain source, with the machine handle quiet.
          const urlStart = whole.indexOf("](", node.from - lineObj.from);
          if (urlStart >= 0) add(lineObj.from + urlStart + 2, node.to - 1, machineMark);
          return false;
        }
        if (name === "Link") {
          if (isActive(node.from)) {
            add(node.from, node.to, linkMark);
            return;
          }
          const cursor = node.node.cursor();
          const marks = [];
          let url = null;
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "LinkMark") marks.push([cursor.from, cursor.to]);
              if (cursor.name === "URL" || cursor.name === "LinkTitle") url = url ? [url[0], cursor.to] : [cursor.from, cursor.to];
            } while (cursor.nextSibling());
          }
          // [label](url): keep the label, hide "[", "](url)".
          if (marks.length >= 2) {
            add(marks[0][0], marks[0][1], hidden);
            add(marks[1][0], node.to, hidden);
            add(marks[0][1], marks[1][0], linkMark);
          } else {
            add(node.from, node.to, linkMark);
          }
          return false;
        }
        if (name === "Blockquote") {
          for (let pos = node.from; pos <= node.to;) {
            const l = doc.lineAt(pos);
            addLine(l.from, quoteLine);
            pos = l.to + 1;
          }
          return;
        }
        if (name === "QuoteMark") {
          if (!isActive(node.from)) hideMarkWithSpace(node.from, node.to);
          else add(node.from, node.to, markerMark);
          return;
        }
        if (name === "ListMark") {
          const item = node.node.parent;
          const isTask = item?.firstChild?.nextSibling?.name === "Task" || /\[[ xX]\]/.test(doc.sliceString(node.to, node.to + 4));
          const ordered = item?.parent?.name === "OrderedList";
          if (isActive(node.from)) { add(node.from, node.to, markerMark); return; }
          if (isTask) { hideMarkWithSpace(node.from, node.to); return; }
          if (ordered) { add(node.from, node.to, orderedMark); return; }
          decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
          return;
        }
        if (name === "TaskMarker") {
          if (isActive(node.from)) { add(node.from, node.to, markerMark); return; }
          const checked = /x/i.test(doc.sliceString(node.from, node.to));
          decos.push(Decoration.replace({ widget: new TaskWidget(checked, node.from) }).range(node.from, node.to));
          return;
        }
        if (name === "HorizontalRule") {
          if (!isActive(node.from)) decos.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
          return;
        }
        if (name === "FencedCode") {
          for (let pos = node.from; pos <= node.to;) {
            const l = doc.lineAt(pos);
            const text = l.text.trimStart();
            addLine(l.from, text.startsWith("```") || text.startsWith("~~~") ? fenceLine : codeLine);
            pos = l.to + 1;
          }
          return;
        }
        if (name === "CodeInfo") { add(node.from, node.to, markerMark); return; }
        if (name === "Table") {
          for (let pos = node.from; pos <= node.to;) {
            const l = doc.lineAt(pos);
            addLine(l.from, tableLine);
            pos = l.to + 1;
          }
          return;
        }
        if (name === "TableDelimiter") { add(node.from, node.to, markerMark); return; }
        if (name === "Comment" || name === "CommentBlock" || name === "HTMLBlock") { add(node.from, node.to, commentMark); return; }
        if (name === "URL" && node.node.parent?.name !== "Link" && node.node.parent?.name !== "Image") { add(node.from, node.to, linkMark); }
      },
    });
  }
  // Only what is replaced is atomic; a mark (bold, a link label) must stay
  // enterable or the caret could never land inside a bold word.
  const atomic = decos.filter((range) => range.value.spec.widget !== undefined || range.value === hidden);
  return { all: Decoration.set(decos, true), atomic: Decoration.set(atomic, true) };
}

export function livePreview(options = {}) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.sets = build(view, options);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged
        || update.transactions.some((tr) => tr.reconfigured)) {
        this.sets = build(update.view, options);
      }
    }
    get decorations() { return this.sets.all; }
  }, {
    decorations: (plugin) => plugin.sets.all,
    // Hidden marks are atomic: arrow keys step over a hidden `**` instead of
    // stopping invisibly inside it.
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.sets.atomic || Decoration.none),
  });
}
