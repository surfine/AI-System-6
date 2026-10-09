// Marks other windows put on the writing editor (Review Desk's commented
// passages): the real StateField from the editor's source, run over a real
// CodeMirror state, so "the range follows the edit" is CodeMirror's mapping and
// not a copy of it.

import { EditorState } from "@codemirror/state";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import {
  buildDecorationSet,
  currentDecorationRanges,
  decorationField,
  normalizeDecorationRanges,
  setDecorationsEffect,
} from "../../tooling/vendor/writing-editor/decorations.mjs";

const test = createFeatureTest("review-decorations");
const eq = (actual, expected, message) => test.assert(
  JSON.stringify(actual) === JSON.stringify(expected),
  `${message} (got ${JSON.stringify(actual)})`,
);

const doc = "开头一句。这一句有批注。结尾。";
const from = doc.indexOf("这一句有批注");
const to = from + 6;
let state = EditorState.create({ doc, extensions: [decorationField] });
state = state.update({ effects: setDecorationsEffect.of([{ from, to, className: "cm-review-comment", title: "小周: 像嘴替", id: "c1" }]) }).state;
eq(currentDecorationRanges(state).map(({ from: a, to: b, id }) => [a, b, id]), [[from, to, "c1"]], "a range is drawn where it was asked");
eq(currentDecorationRanges(state)[0].className, "cm-review-comment", "with its class");

const typedBefore = state.update({ changes: { from: 0, insert: "新写的一段话。" } }).state;
eq(currentDecorationRanges(typedBefore).map(({ from: a, to: b }) => [a, b]), [[from + 7, to + 7]], "an insertion before the range moves it by the length typed");

const typedInside = state.update({ changes: { from: from + 3, insert: "补充" } }).state;
eq(currentDecorationRanges(typedInside).map(({ from: a, to: b }) => [a, b]), [[from, to + 2]], "typing inside the range stretches it");

const typedAtEdge = state.update({ changes: [{ from: to, insert: "后" }, { from, insert: "前" }] }).state;
eq(currentDecorationRanges(typedAtEdge).map(({ from: a, to: b }) => [a, b]), [[from + 1, to + 1]], "typing at either edge stays outside the range");

const deleted = state.update({ changes: { from: from - 1, to: to + 1 } }).state;
eq(currentDecorationRanges(deleted), [], "a range whose text is deleted disappears with it");

const replaced = typedBefore.update({ effects: setDecorationsEffect.of([]) }).state;
eq(currentDecorationRanges(replaced), [], "setting an empty list clears the marks");

// A later call replaces the whole set.
const again = state.update({ effects: setDecorationsEffect.of([{ from: 0, to: 4, className: "cm-review-comment is-done" }]) }).state;
eq(currentDecorationRanges(again).map(({ from: a, to: b, className }) => [a, b, className]), [[0, 4, "cm-review-comment is-done"]], "a later call replaces the set");

// What a caller may draw.
eq(
  normalizeDecorationRanges([
    { from: 3, to: 5, className: "ok" },
    { from: 5, to: 5, className: "empty" },
    { from: -1, to: 4, className: "negative" },
    { from: 2, to: 99, className: "past-the-end" },
    { from: "a", to: 2, className: "nan" },
    { from: 0, to: 2, className: "bad<script>" },
  ], 10).map((range) => [range.from, range.to, range.className]),
  [[0, 2, "cm-decoration"], [3, 5, "ok"]],
  "empty, negative, out-of-range and non-numeric ranges are dropped, and a class that is not plain class names falls back",
);
test.assert(buildDecorationSet([{ from: 0, to: 3 }], 2).size === 0, "a range past the document is not drawn, not clamped to somewhere else");

// The editor exposes it, and says when marks are gone.
const entry = read("tooling/vendor/writing-editor/entry.mjs");
test.assert(/setDecorations\(textarea, ranges\)/.test(entry) && entry.includes("writing-editor-reset") && entry.includes("writing-editor-mounted"),
  "the editor's public API carries setDecorations, and tells callers when a document is replaced or the editor mounts");
test.assert(/view\.composing && record/.test(entry), "marks asked for during an IME composition wait for it to end");

test.finish();
