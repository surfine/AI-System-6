// The textarea stays the editor's public face.
//
// More than thirty modules read and write the writing surfaces as textareas:
// `value`, `selectionStart`, `setSelectionRange`, `scrollTop`, `readOnly`,
// `focus()`, `input` / `select` / `scroll` listeners, `document.activeElement
// === teachTextBodyInput`. Rewriting all of them to talk to CodeMirror would be
// the riskiest part of the swap and would buy nothing the writer can see. So
// the original <textarea> stays in the DOM, hidden, and keeps answering every
// one of those questions truthfully; CodeMirror only owns the pixels and the
// keystrokes. Every write either side makes is mirrored to the other here.
//
// Two rules keep the mirror honest:
// - A change the WRITER makes in CodeMirror reaches the textarea through the
//   native setters and then fires `input`, exactly like typing into the old
//   textarea did.
// - A change CODE makes through the textarea reaches CodeMirror with the
//   `external` annotation and fires NO `input`, exactly like a programmatic
//   `value =` never did. Callers that want listeners to run dispatch their
//   own `input` afterwards, and they still do.

import { Annotation, EditorSelection, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undo, redo, selectAll } from "@codemirror/commands";

export const externalWrite = Annotation.define();

const textareaProto = HTMLTextAreaElement.prototype;
const nativeValue = Object.getOwnPropertyDescriptor(textareaProto, "value");
const nativeSelectionStart = Object.getOwnPropertyDescriptor(textareaProto, "selectionStart");
const nativeSelectionEnd = Object.getOwnPropertyDescriptor(textareaProto, "selectionEnd");
const nativeSetSelectionRange = textareaProto.setSelectionRange;
const nativeActiveElement = Object.getOwnPropertyDescriptor(Document.prototype, "activeElement");

// view <-> textarea, both ways.
const viewByTextarea = new WeakMap();
const textareaByContent = new WeakMap();

export function viewForTextarea(textarea) {
  return viewByTextarea.get(textarea) || null;
}

export function realActiveElement() {
  return nativeActiveElement.get.call(document);
}

function backingTextareaFor(element) {
  if (!element) return null;
  if (textareaByContent.has(element)) return textareaByContent.get(element);
  const content = element.closest?.(".cm-content");
  return content ? textareaByContent.get(content) || null : null;
}

// The view whose editor currently holds the real browser focus.
export function focusedWritingView() {
  const textarea = backingTextareaFor(realActiveElement());
  return textarea ? viewByTextarea.get(textarea) || null : null;
}

// CodeMirror asks its root "who has focus?" to know whether it has focus. The
// app asks `document.activeElement` to know which writing surface has focus,
// and expects the textarea. Both are answered from the same browser fact: the
// page sees the textarea, CodeMirror sees its own content element.
export const editorRoot = new Proxy(document, {
  get(target, property) {
    if (property === "activeElement") return realActiveElement();
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});

let documentPatched = false;
function patchDocumentOnce() {
  if (documentPatched) return;
  documentPatched = true;
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    get() {
      const active = realActiveElement();
      return backingTextareaFor(active) || active;
    },
  });

  // Edit > Undo, Clear, Paste-from-menu and every mdeApply-style helper reach
  // the focused field through execCommand. A contentEditable's native undo
  // stack is not CodeMirror's history, and insertText through the DOM would
  // work but lose the transaction's userEvent. Route the ones that matter.
  const nativeExec = Document.prototype.execCommand;
  document.execCommand = function execCommand(command, showUi, value) {
    const view = focusedWritingView();
    if (view) {
      switch (String(command).toLowerCase()) {
        case "inserttext":
          if (!view.state.facet(EditorView.editable) || view.state.readOnly) return false;
          view.dispatch(view.state.replaceSelection(String(value ?? "")), { userEvent: "input.type", scrollIntoView: true });
          return true;
        case "undo":
          return undo(view);
        case "redo":
          return redo(view);
        case "selectall":
          return selectAll(view);
        case "delete": {
          if (view.state.selection.main.empty || view.state.readOnly) return false;
          view.dispatch(view.state.replaceSelection(""), { userEvent: "delete.selection" });
          return true;
        }
        default:
          break;
      }
    }
    return nativeExec.call(document, command, showUi, value);
  };
}

function clamp(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(n)));
}

// Smallest single replacement that turns `before` into `after`.
function diff(before, after) {
  let start = 0;
  const min = Math.min(before.length, after.length);
  while (start < min && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter), kept: start + (before.length - endBefore) };
}

export function bindTextarea(view, textarea, { onReplaceDocument } = {}) {
  patchDocumentOnce();
  viewByTextarea.set(textarea, view);
  textareaByContent.set(view.contentDOM, textarea);

  let mirroring = false;
  const nativeSet = (value) => nativeValue.set.call(textarea, value);
  const nativeGet = () => nativeValue.get.call(textarea);
  const nativeSelect = (anchor, head) => {
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    nativeSetSelectionRange.call(textarea, from, to, head < anchor ? "backward" : "forward");
  };

  // Code wrote the textarea: carry it into the editor.
  const pushValue = (next) => {
    const current = view.state.doc.toString();
    if (next === current) return;
    const change = diff(current, next);
    // A whole new document (a tab switch, a restore, a template) must not be
    // one undo step away from the previous document. Only an edit that keeps
    // most of the text around it stays in history.
    const replacesDocument = !current || change.kept < Math.max(current.length, next.length) * 0.3;
    if (replacesDocument && typeof onReplaceDocument === "function") {
      onReplaceDocument(next);
    } else {
      view.dispatch({
        changes: { from: change.from, to: change.to, insert: change.insert },
        annotations: [externalWrite.of(true), Transaction.addToHistory.of(!replacesDocument)],
      });
    }
  };
  const pushSelection = (anchor, head, { scroll = false } = {}) => {
    const length = view.state.doc.length;
    const selection = EditorSelection.single(clamp(anchor, length), clamp(head, length));
    view.dispatch({
      selection,
      annotations: externalWrite.of(true),
      scrollIntoView: scroll && view.dom.isConnected,
    });
  };

  const define = (name, descriptor) => Object.defineProperty(textarea, name, { configurable: true, ...descriptor });

  define("value", {
    get: nativeGet,
    set(next) {
      const text = String(next ?? "");
      nativeSet(text);
      if (!mirroring) pushValue(text);
    },
  });
  define("selectionStart", {
    get() { return nativeSelectionStart.get.call(textarea); },
    set(next) {
      nativeSelectionStart.set.call(textarea, next);
      if (!mirroring) pushSelection(textarea.selectionStart, textarea.selectionEnd);
    },
  });
  define("selectionEnd", {
    get() { return nativeSelectionEnd.get.call(textarea); },
    set(next) {
      nativeSelectionEnd.set.call(textarea, next);
      if (!mirroring) pushSelection(textarea.selectionStart, textarea.selectionEnd);
    },
  });
  define("setSelectionRange", {
    value(start, end, direction) {
      nativeSetSelectionRange.call(textarea, start, end, direction);
      if (mirroring) return;
      const from = textarea.selectionStart;
      const to = textarea.selectionEnd;
      // Find/Change, the preview's "turn back to the caret" and ClioChart all
      // place the caret this way and expect to see it.
      pushSelection(direction === "backward" ? to : from, direction === "backward" ? from : to, { scroll: true });
    },
  });
  define("select", {
    value() {
      nativeSetSelectionRange.call(textarea, 0, nativeGet().length);
      pushSelection(0, view.state.doc.length);
    },
  });
  define("setRangeText", {
    value(replacement, start, end, mode = "preserve") {
      const text = String(replacement ?? "");
      const selFrom = textarea.selectionStart;
      const selTo = textarea.selectionEnd;
      const from = start === undefined ? selFrom : clamp(start, view.state.doc.length);
      const to = end === undefined ? selTo : clamp(end, view.state.doc.length);
      let anchor;
      let head;
      if (mode === "select") { anchor = from; head = from + text.length; }
      else if (mode === "start") { anchor = head = from; }
      else if (mode === "end") { anchor = head = from + text.length; }
      else {
        const delta = text.length - (to - from);
        const map = (pos) => (pos <= from ? pos : pos >= to ? pos + delta : from);
        anchor = map(selFrom);
        head = map(selTo);
      }
      view.dispatch({
        changes: { from, to, insert: text },
        selection: EditorSelection.single(anchor, head),
        annotations: externalWrite.of(true),
      });
    },
  });
  define("focus", {
    value(options) {
      view.focus();
      if (options?.preventScroll) return;
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest" }) });
    },
  });
  define("blur", { value() { view.contentDOM.blur(); } });
  define("scrollTop", {
    get() { return view.scrollDOM.scrollTop; },
    set(next) { view.scrollDOM.scrollTop = Number(next) || 0; },
  });
  define("scrollLeft", {
    get() { return view.scrollDOM.scrollLeft; },
    set(next) { view.scrollDOM.scrollLeft = Number(next) || 0; },
  });
  define("scrollHeight", { get() { return view.scrollDOM.scrollHeight; } });
  define("clientHeight", { get() { return view.scrollDOM.clientHeight; } });
  define("clientWidth", { get() { return view.scrollDOM.clientWidth; } });
  define("getBoundingClientRect", { value() { return view.dom.getBoundingClientRect(); } });
  define("getClientRects", { value() { return view.dom.getClientRects(); } });
  define("scrollIntoView", { value(arg) { view.dom.scrollIntoView(arg); } });

  // If anything does manage to put the real focus on the hidden textarea (a
  // <label for> click, a stray programmatic focus through the prototype), hand
  // it to the editor.
  textarea.addEventListener("focus", () => {
    if (realActiveElement() === textarea) view.focus();
  });

  // Editor -> textarea.
  const forward = (type, init = {}) => textarea.dispatchEvent(new Event(type, init));
  const syncFromView = (update) => {
    const external = update.transactions.some((tr) => tr.annotation(externalWrite));
    mirroring = true;
    try {
      if (update.docChanged) nativeSet(update.state.doc.toString());
      const { anchor, head } = update.state.selection.main;
      nativeSelect(anchor, head);
    } finally {
      mirroring = false;
    }
    if (update.docChanged && !external) {
      const userEvent = update.transactions.map((tr) => tr.annotation(Transaction.userEvent)).find(Boolean) || "";
      const inputType = userEvent.startsWith("delete") ? "deleteContentBackward"
        : userEvent.startsWith("input.paste") ? "insertFromPaste"
          : userEvent.startsWith("undo") ? "historyUndo"
            : userEvent.startsWith("redo") ? "historyRedo" : "insertText";
      // Handlers that wait out an IME composition read isComposing, as they
      // did on the textarea; a pinyin buffer must not look like typed text.
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, isComposing: update.view.composing }));
    }
    if (update.selectionSet || update.docChanged) forward("select");
  };

  view.scrollDOM.addEventListener("scroll", () => forward("scroll"), { passive: true });
  view.contentDOM.addEventListener("focus", () => {
    forward("focus");
    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  view.contentDOM.addEventListener("blur", () => {
    forward("blur");
    textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  view.contentDOM.addEventListener("keyup", (event) => {
    textarea.dispatchEvent(new KeyboardEvent("keyup", { key: event.key, code: event.code, bubbles: false }));
  });
  view.contentDOM.addEventListener("click", () => forward("click"));

  return { syncFromView, nativeSet, nativeSelect };
}

export function unbindTextarea(view, textarea) {
  for (const name of [
    "value", "selectionStart", "selectionEnd", "setSelectionRange", "select", "setRangeText", "focus", "blur",
    "scrollTop", "scrollLeft", "scrollHeight", "clientHeight", "clientWidth", "getBoundingClientRect",
    "getClientRects", "scrollIntoView",
  ]) {
    delete textarea[name];
  }
  viewByTextarea.delete(textarea);
  textareaByContent.delete(view.contentDOM);
}
