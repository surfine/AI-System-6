// The live Markdown editor. Every writing surface paints its source through a
// highlight overlay laid exactly under a transparent textarea, so the caret
// always stands on the glyph the writer can see. Two rules keep that true:
// the overlay may only change width-neutral properties, and the syntax markers
// retreat rather than vanish, because the caret has to be able to land on the
// `**` you want to delete.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("markdown-editor");
const appsCss = read("styles/50-apps.css");
const foundationCss = read("styles/00-foundation.css");
const appearanceCss = read("styles/65-appearance-themes.css");
const aquaCss = read("styles/67-aqua-appearance.css");
const wireup = read("app/core/wireup.js");
const editor = read("app/core/markdown-editor.js");

// Both layers are also named together in a shared-metrics rule, so anchor on a
// closed brace to reach the standalone block rather than that grouped selector.
const inputRule = appsCss.match(/\}\s*\n\.mde-surface > \.mde-input \{[\s\S]*?\}/)?.[0] || "";
const overlayRule = appsCss.match(/\}\s*\n\.mde-surface > \.mde-highlight \{[\s\S]*?\}/)?.[0] || "";

// The flip: the overlay owns the ink so the markers can carry their own colour.
test.assertIncludes(inputRule, "color: transparent;", "the textarea goes transparent so the overlay can ink the source");
test.assertIncludes(overlayRule, "color: var(--ink);", "the highlight overlay carries the ink for every writing surface");
test.assertIncludes(inputRule, "caret-color: var(--ink);", "the caret keeps an explicit colour, or the transparent textarea would hide it");

// Markers retreat; they never disappear. A source editor has to let the caret
// land on its own syntax.
test.assertIncludes(appsCss, "--md-marker-ink", "markers take a themed colour instead of going transparent");
test.assertNotMatches(appsCss, /\.md-marker,\s*\n\.md-heading[\s\S]{0,200}color: transparent;/, "markers must not be painted transparent again");

// Width-neutral only. font-weight and font-size both move the glyphs out from
// under the caret (measured: +9.1% and +13.3%); a stroke moves nothing.
const weightRule = appsCss.match(/\.md-heading,\s*\n\.md-strong \{[\s\S]*?\}/)?.[0] || "";
test.assertIncludes(weightRule, "-webkit-text-stroke: var(--md-weight-stroke)", "heading and bold gain weight through a stroke, not a heavier face");
test.assertNotIncludes(weightRule, "font-weight", "a heavier face would widen the run and strand the caret");
test.assertNotIncludes(weightRule, "font-size", "a larger size would widen the run and strand the caret");

// One token source, then one value per distinct editor ground.
test.assertIncludes(foundationCss, "--md-marker-ink:", "the marker colour is declared once, in the foundation token block");
test.assertIncludes(appearanceCss, "--md-marker-ink:", "Platinum and Yosemite set the marker against their own grounds");
test.assertIncludes(aquaCss, "--md-marker-ink:", "Snow Leopard sets the marker against its own ground");

// Note Pad writes too, but it is a Desk Accessory: shortcuts yes, paper measure no.
// Each wiring list is one bracket pair with no nested brackets, so match that
// shape rather than a lazy span that would run in from an earlier array.
const shortcutBlock = wireup.match(/\[[^[\]]*\]\.forEach\(\(el\) => attachMarkdownEditor\(el\)\)/)?.[0] || "";
const overlayBlock = wireup.match(/\[[^[\]]*\]\.forEach\(\(el\) => attachMarkdownHighlight\(el\)\)/)?.[0] || "";
test.assert(shortcutBlock.length > 0 && overlayBlock.length > 0, "both shared wiring lists are still single arrays");
test.assertIncludes(shortcutBlock, "notePadTextInput", "Note Pad gets the shared Markdown shortcuts");
test.assertNotIncludes(overlayBlock, "notePadTextInput", "Note Pad does not take the writing-window paper measure");

// Tables. The editor lets the pipes retreat so columns read as columns; both
// rendered surfaces draw a real grid, sharing one pair of tokens.
test.assertIncludes(editor, 'part === "|" ? \'<span class="md-marker">|</span>\'', "table pipes retreat like every other marker");
test.assertIncludes(foundationCss, "--md-table-border:", "the rendered table grid is declared once");
// One block covers both surfaces; a second copy would be two things to drift.
test.assertMatches(appsCss, /\.teachtext-preview table,\s*\n\.message-content table \{/, "the writing preview and ClioTalk share one table grid");
test.assertNotIncludes(read("styles/10-windows.css"), ".message-content table {", "ClioTalk does not keep a second copy of the table rules");

// The preview used to stop at h1/h2/p/img/lists/blockquote.
for (const selector of [
  ".teachtext-preview h3",
  ".teachtext-preview a",
  ".teachtext-preview hr",
  ".teachtext-preview pre",
  ".teachtext-preview code",
]) {
  test.assertIncludes(appsCss, selector, `the writing preview styles ${selector.split(" ")[1]}`);
}

// Wide content scrolls in its own box; the page never scrolls sideways.
const previewTable = appsCss.match(/\.teachtext-preview table,[\s\S]*?\{[\s\S]*?\}/)?.[0] || "";
test.assertIncludes(previewTable, "overflow-x: auto;", "a wide table scrolls inside itself rather than widening the page");
test.assertIncludes(previewTable, "max-width: 100%;", "a wide table is bounded by the paper");

// The shortcuts stay on execCommand so the native undo stack survives; losing
// undo is itself an interruption.
test.assertIncludes(editor, "execCommand", "edits go through execCommand so the browser keeps the native undo history");
test.assertIncludes(editor, 'textarea.dataset.mdeReady === "true"', "attaching twice is a no-op, so any surface can ask for the editor");

test.finish();
