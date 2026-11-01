// Decorations other windows put on the page.
//
// Review Desk marks the passages that carry a comment; nothing in the editor
// knows what a comment is. A caller hands setDecorations() ranges
// ({ from, to, className, title }) and the editor draws them as marks. The
// ranges live in a StateField, so they map through every edit on their own:
// a word typed before a range moves it, a word typed inside stretches it, and
// the caller does not have to chase the caret. A deleted range collapses and
// disappears. Replacing the whole document (a tab switch, a restore) starts a
// new state with no marks; the caller is told and sets them again.
//
// Marks are never inclusive, so typing at either edge of a range stays outside
// it, and a mark adds no widget or line wrapping, so an IME composition inside
// a range is drawn exactly as it is outside one.

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

export const setDecorationsEffect = StateEffect.define();

const CLASS_PATTERN = /^[A-Za-z_][\w-]*(?:\s+[A-Za-z_][\w-]*)*$/;

/**
 * The ranges a caller may draw: finite, inside the document, non-empty, with a
 * class made of plain class names. Anything else is dropped rather than
 * clamped into a different place than the caller asked for.
 * @param {{ from: number, to: number, className?: string, title?: string, id?: string }[]} ranges
 * @param {number} length
 */
export function normalizeDecorationRanges(ranges, length) {
  const kept = [];
  for (const range of Array.isArray(ranges) ? ranges : []) {
    const from = Number(range?.from);
    const to = Number(range?.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    if (from < 0 || to > length || to <= from) continue;
    const className = typeof range.className === "string" && CLASS_PATTERN.test(range.className.trim())
      ? range.className.trim() : "cm-decoration";
    kept.push({
      from,
      to,
      className,
      title: typeof range.title === "string" ? range.title.slice(0, 300) : "",
      id: typeof range.id === "string" ? range.id.slice(0, 80) : "",
    });
  }
  return kept.sort((a, b) => a.from - b.from || a.to - b.to);
}

export function buildDecorationSet(ranges, length) {
  const marks = normalizeDecorationRanges(ranges, length).map((range) => {
    const attributes = {};
    if (range.title) attributes.title = range.title;
    if (range.id) attributes["data-decoration-id"] = range.id;
    return Decoration.mark({ class: range.className, attributes }).range(range.from, range.to);
  });
  return Decoration.set(marks, true);
}

export const decorationField = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = transaction.docChanged ? value.map(transaction.changes) : value;
    for (const effect of transaction.effects) {
      if (effect.is(setDecorationsEffect)) next = buildDecorationSet(effect.value, transaction.state.doc.length);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** The ranges the field holds now, as { from, to, className, id }. */
export function currentDecorationRanges(state) {
  const found = [];
  const cursor = state.field(decorationField).iter();
  while (cursor.value) {
    found.push({
      from: cursor.from,
      to: cursor.to,
      className: cursor.value.spec.class || "",
      id: cursor.value.spec.attributes?.["data-decoration-id"] || "",
    });
    cursor.next();
  }
  return found;
}
