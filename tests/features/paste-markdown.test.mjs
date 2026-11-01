// Paste takeover for the writing surfaces. Pasting a web page or a Word
// passage into a textarea used to drop every heading, list, emphasis, link and
// table, and the writer had to retype the structure by hand — mechanical work
// in the middle of thinking.
//
// The load-bearing rule is the heading floor. Outline / Section Drafts /
// TeachText are three views of one Markdown document where `##` is a Section
// Draft boundary, so a converted `<h2>` may only stay `##` when it lands in
// the Outline. Anywhere else it must be pushed down, or one paste silently
// cuts the writer's article into new sections. That rule is asserted here
// against the real module, not against a copy of it.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("paste-markdown");

let DOMParser;
try {
  ({ DOMParser } = await import("linkedom"));
} catch {
  test.fail("linkedom is needed to run the converter against a real DOM");
  test.finish();
}

const source = read("app/core/paste-markdown.js");
const editor = read("app/core/markdown-editor.js");
const composition = read("app/features/quick-draft-composition.js");
const manifest = read("tooling/runtime-manifest.mjs");

// The conversion is local by contract: a paste that waits on the network is
// itself an interruption, which is the thing this feature exists to remove.
test.assertNotIncludes(source, "fetch(", "the converter never calls the network");
test.assertNotIncludes(source, "XMLHttpRequest", "the converter never calls the network");
test.assertNotIncludes(source, "/api/", "the converter never calls a server route");
test.assertIncludes(manifest, "app/core/paste-markdown.js", "the converter is registered in the runtime manifest");

// Undo is the other non-negotiable: the takeover must keep the native stack,
// so the insertion goes through mdeApply -> execCommand("insertText").
test.assertIncludes(editor, "function mdePaste(", "the editor owns the paste handler");
test.assertIncludes(editor, 'textarea.addEventListener("paste"', "every markdown surface gets the paste handler");
test.assertIncludes(editor, "mdeApply(textarea, { from, to, insert", "paste inserts through mdeApply, keeping native undo");
test.assertNotMatches(
  editor.slice(editor.indexOf("function mdePaste("), editor.indexOf("function attachMarkdownEditor(")),
  /textarea\.value\s*=/,
  "paste never writes textarea.value directly, which would drop the undo stack"
);

const context = vm.createContext({ window: {}, DOMParser });
vm.runInContext(source, context);
const api = context.window.AISystem6PasteMarkdown;
test.assert(!!api, "the module installs window.AISystem6PasteMarkdown");

// What a browser actually puts on the clipboard: a whole document with the
// copied fragment marked off. Feeding the converter the same shape keeps this
// test honest about the input it will really see.
function clipboardHtml(fragment) {
  return `<html><body>\n<!--StartFragment-->${fragment}<!--EndFragment-->\n</body></html>`;
}

// ---------------------------------------------------------------------------
// 1. Heading level follows the landing surface.
// ---------------------------------------------------------------------------

const article = [
  "<h1>Cover glass</h1>",
  "<p>Lead paragraph.</p>",
  "<h2>How it is made</h2>",
  "<p>Body.</p>",
  "<h3>A detail</h3>",
  "<p>More.</p>",
].join("");

const sectionDrafts = api.pasteHtmlToMarkdown(clipboardHtml(article), { surface: "draft-body" });
test.assertNotMatches(sectionDrafts, /^##(?!#)/m, "Section Drafts never receives ## from a paste");
test.assertIncludes(sectionDrafts, "### Cover glass", "the fragment's top heading lands as a subhead in Section Drafts");
test.assertIncludes(sectionDrafts, "#### How it is made", "relative heading depth survives the shift");
test.assertIncludes(sectionDrafts, "##### A detail", "the deepest heading keeps its distance from the others");

const outline = api.pasteHtmlToMarkdown(clipboardHtml(article), { surface: "outline-content" });
test.assertIncludes(outline, "## Cover glass", "only the Outline may receive ## — that is where sections are defined");
test.assertIncludes(outline, "### How it is made", "the Outline keeps relative depth too");

// A copied mid-article section usually starts at <h2>. In the Outline that is
// a section; anywhere else it must not become one.
const midArticle = "<h2>Chapter</h2><p>text</p><h3>Point</h3>";
["teachtext-body", "draft-body", "review-desk-body", "question-sheet-body", "quick-draft-draft", ""].forEach((surface) => {
  const landed = api.pasteHtmlToMarkdown(clipboardHtml(midArticle), { surface });
  test.assertNotMatches(landed, /^##(?!#)/m, `a pasted <h2> never becomes a section boundary in "${surface || "an unknown surface"}"`);
});
test.assertIncludes(
  api.pasteHtmlToMarkdown(clipboardHtml(midArticle), { surface: "outline-content" }),
  "## Chapter",
  "the same fragment does become a section in the Outline"
);

// Levels are pushed down, never promoted: a fragment that is already deep
// keeps its own depth instead of being pulled up into section territory.
const deep = api.pasteHtmlToMarkdown(clipboardHtml("<h4>Deep</h4><p>x</p>"), { surface: "outline-content" });
test.assertIncludes(deep, "#### Deep", "a deep fragment is never promoted into a section boundary");
test.assert(api.pasteHeadingFloor("outline-content") === 2, "the Outline floor is ##");
test.assert(api.pasteHeadingFloor("draft-body") === 3, "every other surface floors at ###");
test.assert(api.pasteHeadingFloor("unknown-surface") === api.PASTE_DEFAULT_HEADING_FLOOR, "an unknown surface uses the safe default");

// A `#` inside a fenced code block is text, not a heading.
const fenced = api.pasteShiftHeadings("# Title\n\n```sh\n# not a heading\n```\n", 3);
test.assertIncludes(fenced, "### Title", "the real heading moves");
test.assertIncludes(fenced, "\n# not a heading", "a comment inside a fence is left alone");

// ---------------------------------------------------------------------------
// 2. Structure survives the trip.
// ---------------------------------------------------------------------------

const rich = api.pasteHtmlToMarkdown(clipboardHtml([
  "<p>Plain <strong>bold</strong> and <em>italic</em> and <a href=\"https://example.com/a\">a link</a>.</p>",
  "<ul><li>first</li><li>second<ul><li>nested</li></ul></li></ul>",
  "<ol start=\"3\"><li>third</li><li>fourth</li></ol>",
  "<blockquote><p>quoted</p></blockquote>",
  "<pre><code class=\"language-js\">const a = 1;\n</code></pre>",
  "<table><tr><th>Model</th><th>Year</th></tr><tr><td>SE/30</td><td>1989</td></tr></table>",
  "<hr>",
].join("")), { surface: "draft-body" });

test.assertIncludes(rich, "**bold**", "bold survives");
test.assertIncludes(rich, "*italic*", "italic survives");
test.assertIncludes(rich, "[a link](https://example.com/a)", "links survive with their target");
test.assertIncludes(rich, "- first", "bullets survive");
test.assertIncludes(rich, "  - nested", "a nested list keeps its level");
test.assertIncludes(rich, "3. third", "an ordered list keeps its start value");
test.assertIncludes(rich, "4. fourth", "ordered numbering continues");
test.assertIncludes(rich, "> quoted", "block quotes survive");
test.assertIncludes(rich, "```js", "code blocks keep their language");
test.assertIncludes(rich, "const a = 1;", "code block contents survive");
test.assertIncludes(rich, "| Model | Year |", "tables survive as GFM — the server's Reader converter cannot do this");
test.assertIncludes(rich, "| --- | --- |", "the table gets its header rule");
test.assertIncludes(rich, "| SE/30 | 1989 |", "table body rows survive");
test.assertIncludes(rich, "---", "a horizontal rule survives");

// Google Docs wraps whole documents in <b style="font-weight:normal">; Word
// ships emphasis as inline style. Trusting the tag alone bolds everything.
const docsShaped = api.pasteHtmlToMarkdown(clipboardHtml('<b style="font-weight:normal"><p>ordinary <span style="font-weight:700">weighted</span></p></b>'), { surface: "draft-body" });
test.assertNotIncludes(docsShaped, "**ordinary", "a Google Docs wrapper does not bold the whole document");
test.assertIncludes(docsShaped, "**weighted**", "Word-style inline weight is read as bold");

// A base64 image would paste tens of kilobytes into the paragraph.
const withImage = api.pasteHtmlToMarkdown(clipboardHtml('<p><img src="data:image/png;base64,AAAA" alt="chart"></p>'), { surface: "draft-body" });
test.assertNotIncludes(withImage, "base64", "a data: image never pastes its payload into the writer's text");
test.assertIncludes(withImage, "chart", "the caption is kept");

test.assert(api.pasteHtmlToMarkdown(clipboardHtml("<script>bad()</script><style>a{}</style>"), { surface: "draft-body" }) === "", "script and style contribute nothing");

// ---------------------------------------------------------------------------
// 3. A URL dropped on a selection, and a multi-line paste inside a list.
// ---------------------------------------------------------------------------

test.assert(api.pasteIsBareUrl("https://example.com/a?b=1"), "a bare URL is recognized");
test.assert(!api.pasteIsBareUrl("look at https://example.com"), "a sentence containing a URL is not a bare URL");
test.assert(!api.pasteIsBareUrl("just text"), "plain text is not a URL");
test.assertIncludes(editor, "insert = `[${selected}](${plain.trim()})`", "a URL pasted over a selection becomes a link");

const inList = api.pasteContinueListMarkers("- shopping", 10, "milk\nbread\neggs");
test.assert(inList === "milk\n- bread\n- eggs", "a multi-line paste inside a bullet keeps the bullet");
const inOrdered = api.pasteContinueListMarkers("3. first", 8, "second\nthird");
test.assert(inOrdered === "second\n4. third", "an ordered list keeps counting");
const indented = api.pasteContinueListMarkers("  - deep", 8, "one\ntwo");
test.assert(indented === "one\n  - two", "the continued marker keeps the item's indent");
test.assert(
  api.pasteContinueListMarkers("- a", 3, "- already\n- marked") === "- already\n- marked",
  "text that already carries markers is left exactly as it is"
);
test.assert(
  api.pasteContinueListMarkers("plain paragraph", 15, "one\ntwo") === "one\ntwo",
  "outside a list nothing is added"
);

// ---------------------------------------------------------------------------
// 4. Positions held in the buffer move with the text.
// ---------------------------------------------------------------------------

const before = "one\ntwo\nthree\nfour";
const shift = api.pasteLineShift(before, { from: 4, to: 4, insert: "A\nB\nC" });
test.assert(shift.atLine === 2, "the splice reports the line it happened on");
test.assert(shift.delta === 2, "the splice reports how many lines it added");

const moved = api.pasteShiftLineRanges([{ start: 1, end: 1 }, { start: 3, end: 4 }], shift);
test.assert(moved[0].start === 1 && moved[0].end === 1, "a protected range above the paste does not move");
test.assert(moved[1].start === 5 && moved[1].end === 6, "a protected range below the paste moves with its text");

const around = api.pasteShiftLineRanges([{ start: 1, end: 3 }], shift);
test.assert(around[0].start === 1 && around[0].end === 5, "a range containing the paste grows instead of sliding");

const shrink = api.pasteLineShift("a\nb\nc\nd\ne", { from: 2, to: 8, insert: "X" });
test.assert(shrink.delta === -3, "a paste over a multi-line selection reports a negative shift");
test.assert(api.pasteShiftLineRanges([{ start: 5, end: 5 }], shrink)[0].start === 2, "ranges below a shrinking paste move up");

test.assert(api.pasteShiftOffset(3, { from: 10, to: 12, insertedLength: 40 }) === 3, "an offset before the paste stays put");
test.assert(api.pasteShiftOffset(20, { from: 10, to: 12, insertedLength: 40 }) === 58, "an offset after the paste moves by the size change");
test.assert(api.pasteShiftOffset(11, { from: 10, to: 12, insertedLength: 40 }) === 10, "an offset inside replaced text collapses onto the replacement");

// The Quick Draft body is the one surface with durable line-based positions
// (protected ranges and adjustment-layer masks), so it has to be told.
test.assertIncludes(editor, "notePasteLineShift", "the paste reports its line shift to whoever holds line positions");
test.assertIncludes(composition, "async function notePasteLineShift(", "Quick Draft moves its protected ranges after a paste");
test.assertIncludes(composition, "runtime.pasteShiftLineRanges(ranges, shift)", "protected ranges are remapped, not left pointing at new text");
test.assertIncludes(composition, "runtime.pasteShiftLineRanges(layer.mask, shift)", "adjustment-layer masks are remapped too");

test.finish();
