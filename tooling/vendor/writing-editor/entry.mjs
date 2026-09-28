// The writing editor: CodeMirror 6 behind the writing surfaces' textareas.
//
// Built by tooling/build-writing-editor-vendor.mjs into
// apps/desktop/app/vendor/writing-editor.js (one IIFE, loaded lazily by
// app/core/markdown-editor.js). It exposes window.AISystem6WritingEditor and
// nothing else.
//
// What it owns: drawing the page (live preview), taking keystrokes, and the
// Markdown commands. What it does NOT own: the document. The textarea it is
// mounted over stays the one the rest of the app reads and writes (facade.mjs).

import { Compartment, EditorSelection, EditorState, StateEffect } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, placeholder } from "@codemirror/view";
import { history, historyKeymap, standardKeymap, undo } from "@codemirror/commands";
import { Language, defineLanguageFacet, syntaxTree } from "@codemirror/language";
import { parser as markdownParser, GFM } from "@lezer/markdown";
import { bindTextarea, editorRoot, externalWrite, focusedWritingView, unbindTextarea, viewForTextarea } from "./facade.mjs";
import { livePreview } from "./live-preview.mjs";
import { applyFormat, formatMarkdown, FORMAT_COMMANDS } from "./format.mjs";
import { EDITOR_CSS } from "./style.mjs";
import { formatBar, openHeadings } from "./ui.mjs";

// An image line names either a picture the project holds (aisystem6-image:id,
// resolved from the attachment store) or an ordinary URL.
function resolveImage(url) {
  const source = String(url || "").trim();
  const handle = source.match(/^aisystem6-image:(.+)$/);
  if (!handle) return /^(?:https?:|data:image\/|blob:)/i.test(source) ? source : "";
  const list = typeof window.getTeachTextImageAttachments === "function" ? window.getTeachTextImageAttachments() : [];
  const found = Array.isArray(list) ? list.find((item) => item.id === handle[1]) : null;
  return found ? found.previewDataUrl || found.dataUrl || found.originalDataUrl || "" : "";
}

const refresh = StateEffect.define();

// Markdown straight from Lezer, with GitHub's tables, strikethrough and task
// lists. @codemirror/lang-markdown would add HTML, CSS and JavaScript grammars
// (about 150 KB) for code-block highlighting the page does not do.
const markdownLanguage = new Language(
  defineLanguageFacet({ commentTokens: { block: { open: "<!--", close: "-->" } } }),
  markdownParser.configure(GFM),
  [],
  "markdown",
);

// Enter continues a list or quote marker and leaves the list on an empty item,
// exactly as the textarea editor did (mdeContinueList in markdown-editor.js).
const LIST_MARKER = /^(\s*)((?:[-*+][ \t]+\[[ xX]\][ \t]+)|(?:[-*+][ \t]+)|(?:\d+\.[ \t]+)|(?:>+[ \t]?))(.*)$/;
function continueMarkup(view) {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || state.readOnly) return false;
  const line = state.doc.lineAt(range.head);
  const match = line.text.match(LIST_MARKER);
  if (!match) return false;
  const [, indent, marker, content] = match;
  if (!content.trim()) {
    view.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from }, userEvent: "delete" });
    return true;
  }
  const ordered = marker.match(/^(\d+)\.([ \t]+)$/);
  const next = ordered ? `${Number(ordered[1]) + 1}.${ordered[2]}` : marker.replace(/\[[xX]\]/, "[ ]");
  const insert = `\n${indent}${next}`;
  view.dispatch({ changes: { from: range.head, insert }, selection: { anchor: range.head + insert.length }, userEvent: "input", scrollIntoView: true });
  return true;
}
const mounted = new Map(); // textarea -> record

function injectStyleOnce() {
  if (document.getElementById("ais6-writing-editor-style")) return;
  const style = document.createElement("style");
  style.id = "ais6-writing-editor-style";
  style.textContent = EDITOR_CSS;
  document.head.append(style);
}

function runFormat(view, command) {
  if (!FORMAT_COMMANDS.includes(command)) return false;
  if (view.state.readOnly || !view.state.facet(EditorView.editable)) return false;
  const { from, to } = view.state.selection.main;
  const result = formatMarkdown(view.state.doc.toString(), from, to, command);
  if (!result) return false;
  const length = result.from + result.insert.length + (view.state.doc.length - result.to);
  const clamp = (n) => Math.max(0, Math.min(length, n));
  view.dispatch({
    changes: { from: result.from, to: result.to, insert: result.insert },
    selection: EditorSelection.single(clamp(result.anchor), clamp(result.head)),
    userEvent: "input.format",
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

// Tab indents only where it means something (a list, a quote, a multi-line
// selection). On a plain line Tab keeps moving focus, as it always has here.
const LIST_LINE = /^\s*(?:[-*+](?:\s+\[[ xX]\])?|\d+\.|>+)\s/;
function tabIndent(outdent) {
  return (view) => {
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc;
    const multiline = doc.lineAt(from).number !== doc.lineAt(to).number;
    if (!multiline && !LIST_LINE.test(doc.lineAt(from).text)) return false;
    return runFormat(view, outdent ? "outdent" : "indent");
  };
}

const formatBindings = [
  ["Mod-b", "bold"], ["Mod-i", "italic"], ["Mod-e", "code"], ["Shift-Mod-x", "strike"], ["Mod-k", "link"],
  ["Mod-'", "quote"], ["Shift-Mod-7", "bullet"], ["Shift-Mod-9", "numbered"], ["Shift-Mod-l", "task"],
  ["Mod-]", "indent"], ["Mod-[", "outdent"],
  ["Alt-Mod-0", "heading-0"], ["Alt-Mod-1", "heading-1"], ["Alt-Mod-2", "heading-2"], ["Alt-Mod-3", "heading-3"],
  ["Alt-Mod-t", "table"], ["Alt-Mod-c", "code-block"],
].map(([key, command]) => ({ key, run: (view) => runFormat(view, command), preventDefault: true }));

// Focus mode: the sentence being written carries full ink, the rest of its
// paragraph stays readable, everything else steps back. The ranges come from
// the same functions the textarea overlay used (markdown-editor.js), so the
// two engines agree on what a sentence is.
function focusDimming(options) {
  const muted = Decoration.mark({ class: "cm-focus-muted" });
  const near = Decoration.mark({ class: "cm-focus-near" });
  const build = (view) => {
    const surface = view.dom.closest(".mde-surface");
    if (!surface?.classList.contains("is-focus-mode")) return Decoration.none;
    const text = view.state.doc.toString();
    const caret = view.state.selection.main.head;
    const paragraph = options.paragraphRange?.(text, caret);
    if (!paragraph) return Decoration.none;
    const sentence = options.sentenceRange?.(text, caret, paragraph) || paragraph;
    const ranges = [];
    if (paragraph.start > 0) ranges.push(muted.range(0, paragraph.start));
    if (sentence.start > paragraph.start) ranges.push(near.range(paragraph.start, sentence.start));
    if (paragraph.end > sentence.end) ranges.push(near.range(sentence.end, paragraph.end));
    if (text.length > paragraph.end) ranges.push(muted.range(paragraph.end, text.length));
    return Decoration.set(ranges, true);
  };
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = build(view); }
    update(update) {
      if (update.docChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))) {
        this.decorations = build(update.view);
      }
    }
  }, { decorations: (plugin) => plugin.decorations });
}

// Typewriter mode keeps the line being written at the middle of the paper.
function typewriter() {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const surface = update.view.dom.closest(".mde-surface");
    if (!surface?.classList.contains("is-typewriter-mode")) return;
    if (update.transactions.some((tr) => tr.annotation(externalWrite))) return;
    const head = update.state.selection.main.head;
    queueMicrotask(() => update.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) }));
  });
}

function headingsOf(state) {
  const headings = [];
  syntaxTree(state).iterate({
    enter(node) {
      const match = /^ATXHeading([1-6])$/.exec(node.name);
      if (!match) return node.name === "Document" ? undefined : false;
      const raw = state.doc.sliceString(node.from, node.to);
      const title = raw.replace(/^#{1,6}[ \t]*/, "").replace(/[ \t]*\{#[0-9A-Za-z_-]+\}[ \t]*$/, "").trim();
      headings.push({ level: Number(match[1]), title, from: node.from });
      return false;
    },
  });
  return headings;
}

// 写 | 读 (| 并排): the writing surfaces' Preview button drawn as one switch.
// It used to name the mode you were NOT in, so the one word on it meant the
// opposite of where you were. The accessible name still says what a press
// does. 并排 needs two 484px pages side by side, so it is TeachText's only,
// and only where the screen holds both.
const splitFits = () => window.innerWidth >= 840;
function modeOf(button) {
  const box = button?.closest(".window")?.querySelector(".teachtext-editor-container")?.classList;
  return box?.contains("is-split") ? "split" : box?.contains("is-previewing") ? "read" : "write";
}
function drawToggle(button, mode = modeOf(button)) {
  if (!button) return;
  const say = (key) => (typeof window.t === "function" ? window.t(key) : key);
  const current = mode === true ? "read" : mode === false ? "write" : mode;
  const modes = button.id === "teachtext-toggle-preview" && splitFits() ? ["write", "read", "split"] : ["write", "read"];
  button.classList.add("writing-mode-toggle");
  button.removeAttribute("data-i18n");
  button.setAttribute("aria-pressed", String(current !== "write"));
  button.setAttribute("aria-label", say(current === "write" ? "preview" : "edit"));
  button.replaceChildren(...modes.map((name) => {
    const seg = document.createElement("span");
    seg.className = `writing-mode-seg${name === current ? " is-on" : ""}`;
    seg.dataset.mode = name;
    seg.textContent = say(`writing_mode_${name}`);
    return seg;
  }));
}
const drawAllToggles = () => document.querySelectorAll(".writing-mode-toggle").forEach((button) => drawToggle(button));
// A split that no longer fits folds back to one page; the switches re-measure.
window.addEventListener("resize", () => {
  const body = document.getElementById("teachtext-body");
  if (!splitFits() && body?.closest(".teachtext-editor-container")?.classList.contains("is-split")) {
    window.AISystem6WritingEditor.setSplit(body, false);
  }
  drawAllToggles();
});
queueMicrotask(drawAllToggles);

function mount(textarea, surface, options = {}) {
  if (!textarea || !surface || mounted.has(textarea)) return mounted.get(textarea)?.view || null;
  injectStyleOnce();

  const editable = new Compartment();
  const readOnly = new Compartment();
  const hint = new Compartment();
  const attributes = new Compartment();
  const isLocked = () => textarea.readOnly || textarea.disabled;
  const contentAttributes = () => {
    const attrs = {
      "aria-label": textarea.getAttribute("aria-label") || "",
      spellcheck: textarea.getAttribute("spellcheck") === "false" ? "false" : "true",
      autocapitalize: "sentences",
      "aria-multiline": "true",
    };
    const lang = textarea.getAttribute("lang");
    if (lang) attrs.lang = lang;
    return attrs;
  };

  let record = null;
  const extensions = () => [
    history(),
    EditorView.lineWrapping,
    markdownLanguage.extension || [],
    livePreview({ resolveImage: options.resolveImage || resolveImage }),
    focusDimming(options),
    typewriter(),
    editable.of(EditorView.editable.of(!isLocked())),
    readOnly.of(EditorState.readOnly.of(isLocked())),
    hint.of(placeholder(textarea.getAttribute("placeholder") || "")),
    attributes.of(EditorView.contentAttributes.of(contentAttributes())),
    keymap.of([
      ...formatBindings,
      { key: "Enter", run: continueMarkup },
      { key: "Tab", run: tabIndent(false) },
      { key: "Shift-Tab", run: tabIndent(true) },
      ...historyKeymap,
      ...standardKeymap,
    ]),
    EditorView.domEventHandlers({
      paste(event) {
        // The app's own paste takeover (HTML -> Markdown, a URL on a selection,
        // multi-line paste inside a list) works through the textarea API.
        if (typeof options.onPaste === "function") options.onPaste(event, textarea);
        return event.defaultPrevented;
      },
    }),
    EditorView.updateListener.of((update) => record?.bridge.syncFromView(update)),
    formatBar(runFormat, undo),
  ];

  const makeState = (doc, selection) => EditorState.create({ doc, selection, extensions: extensions() });
  const initial = textarea.value;
  const view = new EditorView({
    state: makeState(initial, EditorSelection.single(Math.min(textarea.selectionStart || 0, initial.length))),
    root: editorRoot,
  });

  const bridge = bindTextarea(view, textarea, {
    onReplaceDocument(next) {
      // A different document: fresh history, caret where the textarea puts it.
      const at = Math.min(textarea.selectionStart ?? next.length, next.length);
      view.setState(makeState(next, EditorSelection.single(at)));
    },
  });
  record = { view, bridge, surface };

  // Mirror the textarea's state classes (hidden, read-only projection) and
  // attributes onto the editor.
  const syncAttributes = () => {
    view.dispatch({
      effects: [
        editable.reconfigure(EditorView.editable.of(!isLocked())),
        readOnly.reconfigure(EditorState.readOnly.of(isLocked())),
        hint.reconfigure(placeholder(textarea.getAttribute("placeholder") || "")),
        attributes.reconfigure(EditorView.contentAttributes.of(contentAttributes())),
      ],
    });
  };
  const syncClasses = () => {
    for (const cls of ["is-hidden", "manuscript-readonly", "has-headers", "has-lists", "has-quotes", "has-code"]) {
      view.dom.classList.toggle(cls, textarea.classList.contains(cls));
    }
  };
  const textareaObserver = new MutationObserver((records) => {
    if (records.some((r) => r.attributeName === "class")) syncClasses();
    if (records.some((r) => r.attributeName !== "class")) syncAttributes();
  });
  textareaObserver.observe(textarea, {
    attributes: true,
    attributeFilter: ["class", "readonly", "disabled", "placeholder", "aria-label", "lang", "spellcheck"],
  });
  // readOnly / disabled set as properties reflect to attributes, so the
  // observer above sees them too.
  const surfaceObserver = new MutationObserver(() => view.dispatch({ effects: refresh.of(null) }));
  surfaceObserver.observe(surface, { attributes: true, attributeFilter: ["class"] });

  for (const name of ["data-drop-target", "data-editor-surface"]) {
    if (textarea.hasAttribute(name)) view.dom.setAttribute(name, textarea.getAttribute(name));
  }
  // 并排: the finished page beside the source follows it as it scrolls.
  view.scrollDOM.addEventListener("scroll", () => {
    const container = surface.parentElement;
    if (!container?.classList.contains("is-split")) return;
    const preview = container.querySelector(".teachtext-preview");
    if (!preview) return;
    const range = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
    const ratio = range > 0 ? view.scrollDOM.scrollTop / range : 0;
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
  }, { passive: true });
  textarea.classList.add("mde-cm-backing");
  textarea.setAttribute("aria-hidden", "true");
  textarea.tabIndex = -1;
  surface.classList.add("is-cm");
  surface.append(view.dom);
  syncClasses();

  record.dispose = () => {
    textareaObserver.disconnect();
    surfaceObserver.disconnect();
    unbindTextarea(view, textarea);
    view.destroy();
    textarea.classList.remove("mde-cm-backing");
    textarea.removeAttribute("aria-hidden");
    textarea.removeAttribute("tabindex");
    surface.classList.remove("is-cm");
    mounted.delete(textarea);
  };
  mounted.set(textarea, record);
  drawToggle(surface.closest(".window")?.querySelector(".writing-mode-toggle"));
  return view;
}

window.AISystem6WritingEditor = Object.freeze({
  mount,
  unmount(textarea) { mounted.get(textarea)?.dispose(); },
  isMounted(textarea) { return mounted.has(textarea); },
  viewFor: viewForTextarea,
  focusedTextarea() {
    const view = focusedWritingView();
    if (!view) return null;
    for (const [textarea, record] of mounted) if (record.view === view) return textarea;
    return null;
  },
  commands: FORMAT_COMMANDS,
  drawToggle,
  // Run a Markdown command on a surface. Works on a mounted editor and, for
  // the phone fallback, on a bare textarea through its own API.
  format(textarea, command) {
    const view = viewForTextarea(textarea);
    if (view) return runFormat(view, command);
    if (!textarea || textarea.readOnly || textarea.disabled) return false;
    const result = formatMarkdown(textarea.value, textarea.selectionStart, textarea.selectionEnd, command);
    if (!result) return false;
    const next = applyFormat(textarea.value, result);
    textarea.focus();
    textarea.value = next;
    textarea.setSelectionRange(Math.min(result.anchor, result.head), Math.max(result.anchor, result.head));
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  },
  openHeadings(textarea, anchor) {
    const view = viewForTextarea(textarea);
    if (!view || !anchor) return false;
    openHeadings(view, headingsOf(view.state), anchor);
    return true;
  },
  headings(textarea) {
    const view = viewForTextarea(textarea);
    if (view) return headingsOf(view.state);
    return [];
  },
  // Scroll a surface so position `pos` sits near the top, caret there.
  reveal(textarea, pos) {
    const view = viewForTextarea(textarea);
    if (!view) return false;
    const at = Math.max(0, Math.min(view.state.doc.length, pos));
    view.dispatch({ selection: EditorSelection.single(at), effects: EditorView.scrollIntoView(at, { y: "start", yMargin: 24 }) });
    view.focus();
    return true;
  },
  // 并排 (TeachText): the source and the finished page side by side. The
  // window grows by a class (min-width over its saved frame), so the desk never
  // remembers the wide window as TeachText's own size.
  setSplit(textarea, on) {
    const view = viewForTextarea(textarea);
    const container = view?.dom.closest(".teachtext-editor-container");
    const win = container?.closest(".window");
    const preview = container?.querySelector(".teachtext-preview");
    if (!container || !win || !preview) return false;
    const toggle = win.querySelector(".writing-mode-toggle");
    if (on) {
      if (!preview.classList.contains("is-hidden")) window.showTeachTextEditor?.({ focus: false });
      container.classList.add("is-split");
      preview.classList.remove("is-hidden");
      window.syncTeachTextPreview?.({ force: true });
      win.classList.add("is-split-view");
      if (!win.classList.contains("is-mobile-fullscreen") && win.style.left) {
        const box = win.getBoundingClientRect();
        const width = Math.min(1060, window.innerWidth - 24);
        win.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`;
      }
      // The finished page opens where the source is.
      requestAnimationFrame(() => view.scrollDOM.dispatchEvent(new Event("scroll")));
    } else {
      container.classList.remove("is-split");
      preview.classList.add("is-hidden");
      win.classList.remove("is-split-view");
    }
    drawToggle(toggle, on ? "split" : "write");
    window.updateTeachTextDeskState?.();
    return true;
  },
  // The three segments of TeachText's switch. A press that lands on no segment
  // (Space on the focused button) flips between write and read.
  chooseMode(textarea, wanted) {
    const container = textarea.closest(".teachtext-editor-container");
    const split = !!container?.classList.contains("is-split");
    const current = split ? "split" : container?.classList.contains("is-previewing") ? "read" : "write";
    const next = wanted || (current === "write" ? "read" : "write");
    if (next === current) return;
    if (split) this.setSplit(textarea, false);
    if (next === "split") this.setSplit(textarea, true);
    else if (next === "read") window.showTeachTextPreview?.();
    else if (!split) window.showTeachTextEditor?.();
    else textarea.focus();
  },
  centerCaret(textarea) {
    const view = viewForTextarea(textarea);
    if (!view) return false;
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }) });
    return true;
  },
  refresh(textarea) {
    const view = viewForTextarea(textarea);
    if (!view) return false;
    view.dispatch({ effects: refresh.of(null) });
    return true;
  },
});
