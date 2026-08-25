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

// The overlay is the only visible ink, so it has to follow the value however
// the value arrives. Session restore, AI results, revision rollback, and
// clipping inserts all write the textarea straight, and none of them fires an
// "input" event: before this, the paper went blank while the text was still
// there to select. Wrapping the instance property covers every writer at once,
// which is why no call site is allowed to own this repaint.
test.assertIncludes(editor, 'watchControlWrites(textarea, HTMLTextAreaElement.prototype, "value", schedulePaint)', "a programmatic value write repaints the overlay");
test.assertIncludes(read("app/core/input-guard.js"), "function watchControlWrites", "one shared helper keeps every mirrored control honest");
// setRangeText fires no event of its own, so every site that uses it dispatches
// "input" — that is what carries the modified mark, the linked-surface syncs,
// and this repaint. Two TeachText inserts used to skip it.
const accessories = read("app/features/teachtext-accessories.js");
test.assertNotMatches(accessories, /setRangeText\([\s\S]{0,120}?\n\s*markTeachTextModified\(\);/, "a TeachText insert fires input rather than only marking the document modified");

// The characters an IME is still composing live in the transparent textarea,
// so the overlay must paint them too, or Chinese input types into nothing.
test.assertIncludes(editor, 'textarea.addEventListener("compositionupdate", schedulePaint)', "composing characters are painted while the IME is still open");
test.assertNotIncludes(editor, "if (composing || frame) return;", "no composition guard may stop the overlay from painting");

// --- Focus mode: three tiers of attention --------------------------------
//
// The cycle stays three states -- Off, Typewriter, Sentence -- because a
// writer toggling attention wants one key, not a panel of switches. What the
// third state means changed: the sentence being written carries full ink, the
// rest of its paragraph stays readable so the run-up to it can be heard, and
// the other paragraphs step well back.

const actionsSource = read("app/core/actions.js");
const menus = read("app/data/menus.js");

test.assertIncludes(editor, 'const next = current === "off" ? "typewriter" : current === "typewriter" ? "sentence" : "off";', "the cycle keeps three states");
test.assertIncludes(editor, 'const asked = mode === "paragraph" ? "sentence" : mode;', "a preference stored under the old name still resolves");

// Opacity cannot nest brighter: a child of a dimmed run can never reach full
// ink again. So the LINE carries the light, and the dim runs are wrapped.
test.assertIncludes(appsCss, ".mde-surface.is-focus-mode .md-focus-muted", "other paragraphs step back");
test.assertIncludes(appsCss, ".mde-surface.is-focus-mode .md-focus-near", "the rest of the current paragraph sits between");
test.assertIncludes(appsCss, ".mde-surface.is-focus-mode .md-focus-active", "and the caret's line carries full ink");
const focusTierRules = appsCss.match(/\.mde-surface\.is-focus-mode \.md-focus-(?:muted|near|active) \{[^}]*\}/g) || [];
test.assert(
  focusTierRules.length === 3 && focusTierRules.every((rule) => /opacity:/.test(rule)),
  "all three tiers differ by opacity alone, so nothing the overlay paints changes width",
);

// A hard line break inside a paragraph must not start the next sentence ON the
// break, or the line above tests as overlapping and lights up with it.
test.assertMatches(
  editor,
  /function mdeSentenceRange[\s\S]*?while \(from < end && \/\\s\/\.test\(text\[from\]\)\) from \+= 1;/,
  "advancing past a sentence boundary skips newlines, not only spaces",
);
test.assertIncludes(editor, "const mdeSentenceEnders = /[。！？!?…；;]/", "Chinese sentences break on full-width marks");
test.assertIncludes(editor, "const mdeSentenceClosers = /[”’」』》）)\\]\"']/", "and the mark's closing bracket belongs to the sentence it ends");

// The line's HTML carries nested syntax spans, so a character range is wrapped
// by walking text nodes -- slicing the string by offset would cut them in half.
test.assertIncludes(editor, "document.createTreeWalker(container, NodeFilter.SHOW_TEXT)", "a sub-line range is wrapped through the text nodes it covers");
test.assertIncludes(editor, "runs.reverse().forEach", "later runs are wrapped first, so wrapping the head cannot shift the tail");

// Focus is how the writer works, not a property of one document.
test.assertIncludes(editor, 'const MDE_FOCUS_STORAGE_KEY = "ai-system6-writing-focus"', "the preference is stored");
test.assertMatches(editor, /paint\(\);\s*\n\s*\n\s*\/\/[\s\S]*?const restored = mdeStoredFocusMode\(\);/, "and a surface that opens later opens in it");
test.assertIncludes(wireup, "if (restored !== \"off\") syncMdeFocusButton(button, restored);", "so the button opens saying so too");

// The command follows the caret, not the frontmost window.
test.assertIncludes(actionsSource, 'id: "writing-focus"', "focus mode has a key");
test.assertIncludes(actionsSource, 'display: "⌥⌘F"', "and it is ⌥⌘F");
test.assertIncludes(actionsSource, 'id: "writing-preview"', "so does turning the paper over");
test.assertNotMatches(
  actionsSource,
  /\{ id: "writing-(?:focus|preview)"[^}]*suppressInEditable/,
  "neither is suppressed in an editable: the caret is where a writer always is",
);
test.assertIncludes(menus, 'menuItem("cycle-writing-focus", "focus_mode_cycle", "writing-focus")', "and both are in the Writing menu, because a key with no menu item is invisible");
test.assertIncludes(menus, 'menuItem("toggle-writing-preview", "preview", "writing-preview")', "the preview command shows its key");
test.assertMatches(
  actionsSource,
  /function cycleWritingFocusMode[\s\S]*?classList\?\.contains\("mde-input"\)/,
  "the command cycles the surface the caret is in",
);

// --- The measure holds on both sides of the paper ------------------------
//
// A preview is the same sheet turned over. It used to render two points
// smaller in the system sans, because styles/60-responsive.css listed it
// among the CHROME selectors -- beside .hint, .tag and .control-status -- and
// forced --text-font at --system-text-size on it. The result was 38 CJK
// columns on a line the writer had composed at 28. A measure that holds on
// only one side of the paper is not locked.

const responsiveCss = read("styles/60-responsive.css");

test.assertMatches(
  appsCss,
  /\.teachtext-preview \{[\s\S]*?font-family: var\(--editor-font\);/,
  "the preview is set in the writing face",
);
test.assertMatches(
  appsCss,
  /\.teachtext-preview \{[\s\S]*?font-size: var\(--mde-font-size\);/,
  "and at the writing size",
);
test.assertMatches(
  appsCss,
  /\.teachtext-preview > \* \{[^}]*max-width: var\(--editor-measure\);/,
  "and its reading column is the writing measure",
);

// Comments are stripped first: the one above that rule names the preview in
// order to say it is NOT listed, and would otherwise match here.
const responsiveSelectors = responsiveCss.replace(/\/\*[\s\S]*?\*\//g, "");
const chromeTextRule = responsiveSelectors.match(/[^};]*\{\s*font-family: var\(--text-font\);\s*font-size: var\(--system-text-size\);/)?.[0] || "";
test.assert(chromeTextRule.length > 0, "the chrome text rule is still there for the surfaces that are chrome");
test.assertNotIncludes(chromeTextRule, ".teachtext-preview", "the writer's paper is not one of them");

// A help document is a manual, not the writer's paper, so it keeps its own
// wider column through a more specific rule.
test.assertMatches(
  appsCss,
  /\.teachtext-window\.is-help-document \.teachtext-preview > \* \{[^}]*max-width: 760px;/,
  "a help document keeps its own reading column",
);

test.finish();
