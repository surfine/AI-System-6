// Turning the paper over keeps the writer's place.
//
// A preview is the same sheet turned over, not a second document. Two
// guarantees, in opposite directions: it opens at the paragraph the caret was
// in, and turning back puts the caret where the writer was reading -- but only
// if they read somewhere else. A glance that scrolls nothing must return the
// caret exactly where it was, because moving it then is the preview
// rearranging a desk nobody asked it to touch.
//
// The map is pure, so it is executed here rather than described.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("preview-anchor");

const markdown = read("app/core/markdown.js");
const writingFlow = read("app/features/writing-flow.js");
const documentsChat = read("app/features/documents-chat.js");
const actions = read("app/core/actions.js");
const quickDraft = read("app/features/quick-draft-editor.js");

const context = vm.createContext({ window: {}, globalThis: {} });
vm.runInContext(markdown, context);

// --- The map -------------------------------------------------------------

// marked emits one top-level element per top-level token, in order; a `space`
// token renders nothing and only advances the line count.
const tokens = [
  { type: "heading", raw: "# Title\n" },
  { type: "space", raw: "\n" },
  { type: "paragraph", raw: "First paragraph.\n" },
  { type: "space", raw: "\n" },
  { type: "list", raw: "- one\n- two\n" },
  { type: "space", raw: "\n" },
  { type: "code", raw: "```js\ncode();\n```\n" },
  { type: "space", raw: "\n" },
  { type: "paragraph", raw: "Last paragraph." },
];
const blockLines = context.markdownTopLevelBlockLines(tokens);
test.assert(
  blockLines.join(",") === "0,2,4,7,11",
  "each rendered block reports the source line it came from",
);
test.assert(
  blockLines.length === tokens.filter((token) => token.type !== "space").length,
  "a space token advances the count without claiming a block",
);
test.assert(
  context.markdownTopLevelBlockLines([]).length === 0,
  "an empty document maps to no blocks",
);

// --- Offsets and lines round-trip ----------------------------------------

const sample = "# Title\n\nBody line.\n\n## Section\n\nMore body.";
test.assert(
  context.markdownLineAtOffset(sample, sample.indexOf("## Section")) === 4,
  "an offset resolves to its source line",
);
test.assert(
  context.markdownOffsetAtLine(sample, 4) === sample.indexOf("## Section"),
  "and a source line resolves back to its offset",
);
test.assert(
  context.markdownOffsetAtLine(sample, 999) === sample.length,
  "a line past the end clamps instead of throwing",
);
test.assert(
  context.markdownLineAtOffset(sample, -5) === 0,
  "and so does an offset before the start",
);

// --- The pairing is only used when it holds ------------------------------

// A raw-HTML token can render to a bare text node and break the count. The map
// is stamped only when the two lengths agree; otherwise the preview keeps the
// behaviour it had before rather than scrolling to a guess.
test.assertMatches(
  markdown,
  /function stampPreviewBlockLines[\s\S]*?lines\.length !== blocks\.length\) return false;/,
  "a preview whose blocks do not pair with the map is left unstamped",
);
test.assertMatches(
  markdown,
  /function enterPreviewAtCaret[\s\S]*?const mapped = stampPreviewBlockLines/,
  "and the anchor records whether it had a map at all",
);
test.assertMatches(
  markdown,
  /function leavePreviewToCaret[\s\S]*?if \(!state\?\.mapped\) return false;/,
  "so the return trip declines to move a caret it cannot place",
);

// --- The glance that scrolls nothing -------------------------------------

test.assertMatches(
  markdown,
  /function leavePreviewToCaret[\s\S]*?Math\.abs\(preview\.scrollTop - state\.scrollTop\) <= 2\) return false;/,
  "a preview the writer did not scroll returns the caret untouched",
);
test.assertIncludes(
  documentsChat,
  "if (!followedReading) {",
  "and the Manuscript restores its saved position only when the anchor stood down",
);

// --- Every surface that turns the paper over -----------------------------

test.assertIncludes(writingFlow, "enterPreviewAtCaret(config.input, config.preview)", "Question Sheet / Outline / Section Drafts anchor going in");
test.assertIncludes(writingFlow, "leavePreviewToCaret(config.input, config.preview)", "and coming back");
test.assertIncludes(documentsChat, "enterPreviewAtCaret(teachTextBodyInput, teachTextPreviewEl)", "the Manuscript anchors going in");
test.assertIncludes(documentsChat, "leavePreviewToCaret(teachTextBodyInput, teachTextPreviewEl)", "and coming back");
test.assertIncludes(actions, "enterPreviewAtCaret(reviewDeskBodyInput, reviewDeskPreviewEl)", "the Review Desk anchors going in");
test.assertIncludes(actions, "leavePreviewToCaret(reviewDeskBodyInput, reviewDeskPreviewEl)", "and coming back");
test.assertIncludes(quickDraft, 'if (quickDraftDisplayMode === "read") enterPreviewAtCaret(refs.draft, refs.preview)', "Quick Draft anchors its reading view");
test.assertIncludes(quickDraft, "if (wasReading) leavePreviewToCaret(refs.draft, refs.preview)", "and only its reading view: Grain and Listen are other views, not the paper turned over");

// The anchor measures boxes, and a hidden element has none. Every caller shows
// the preview before anchoring, and anchors before hiding the editor.
test.assertMatches(
  writingFlow,
  /config\.preview\.classList\.remove\("is-hidden"\);[\s\S]{0,120}?enterPreviewAtCaret\(config\.input, config\.preview\);\s*\n\s*config\.input\.classList\.add\("is-hidden"\);/,
  "the preview is visible, and the editor still is, when the anchor measures",
);
test.assertMatches(
  documentsChat,
  /const followedReading = leavePreviewToCaret\(teachTextBodyInput, teachTextPreviewEl\);[\s\S]{0,200}?teachTextPreviewEl\.classList\.add\("is-hidden"\);/,
  "and the return trip reads the preview before it is hidden",
);

test.finish();
