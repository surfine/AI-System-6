// A section's name for itself.
//
// A section's record carries what the text cannot: its HKRR intent, the clips
// it used, the file it was inserted into. Pairing record to text by title and
// position is a guess, and it loses. Rename a section and move it in the same
// sitting and both halves of the guess miss at once -- the records do not
// merely orphan, they SWAP, so one section's clips and inserted file end up
// attached to another's.
//
// The id therefore lives in the heading, in the anchor syntax Pandoc and
// kramdown already use: `## 标题 {#a7f3c1}`. Other Markdown tools understand
// it, it becomes a real HTML anchor on export, and it survives a rename
// because it is not derived from the title.
//
// The id functions are pure, so they are executed here rather than described.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("section-identity");

const markdown = read("app/core/markdown.js");
const projectDisk = read("app/features/project-disk.js");
const writingFlow = read("app/features/writing-flow.js");

const context = vm.createContext({ window: {}, Math, globalThis: {} });
vm.runInContext(markdown, context);

// --- Reading an id -------------------------------------------------------

test.assert(context.markdownSectionId("第一节 {#a7f3c1}") === "a7f3c1", "an id is read off its heading");
test.assert(context.markdownSectionId("第一节") === "", "a heading without one reports none");
test.assert(context.stripMarkdownSectionId("第一节 {#a7f3c1}") === "第一节", "and the title is what is left");
test.assert(
  context.stripMarkdownInlineSyntax("第一节 {#a7f3c1}") === "第一节",
  "the id is machinery, so it never reaches a title through the shared stripper",
);

// --- Stamping a document -------------------------------------------------

const source = [
  "# 稿子",
  "",
  "## 第一节",
  "",
  "正文一。",
  "",
  "### 小节",
  "",
  "## 第二节 {#keepme}",
  "",
  "```",
  "## 围栏里的假标题",
  "```",
].join("\n");

const first = context.ensureMarkdownSectionIds(source);
const second = context.ensureMarkdownSectionIds(first.markdown);
const headings = first.markdown.split("\n").filter((line) => /^#/.test(line));

test.assert(first.changed, "a document without ids gets them");
test.assert(!second.changed, "and stamping it again changes nothing");
// The fenced line is deliberately excluded here: it looks like a heading and
// is asserted below to stay unstamped.
test.assert(
  headings.filter((line) => /^##\s/.test(line) && !/假标题/.test(line))
    .every((line) => /\{#[A-Za-z0-9_-]+\}$/.test(line)),
  "every section heading carries an id",
);
test.assert(/^### 小节 \{#[A-Za-z0-9_-]+\}$/.test(headings[2]), "subsections are sections too");
test.assert(headings[0] === "# 稿子", "the document title is not a section");
test.assert(headings.includes("## 第二节 {#keepme}"), "an id the writer already wrote is left alone");
test.assert(headings.includes("## 围栏里的假标题"), "a heading inside a code fence is text, not a section");

// A duplicated id is worse than a missing one: two sections would answer to
// one record. The copy gets a fresh id and the original keeps its own.
const duplicated = context.ensureMarkdownSectionIds("## A {#same}\n\n## B {#same}");
const duplicatedIds = duplicated.markdown.split("\n")
  .filter((line) => /^##\s/.test(line))
  .map((line) => context.markdownSectionId(line));
test.assert(duplicated.changed && duplicatedIds[0] === "same", "the first claim on an id keeps it");
test.assert(duplicatedIds[1] && duplicatedIds[1] !== "same", "and the duplicate is re-issued");

// --- The id is an anchor, not four characters of the writer's prose ------

test.assertMatches(
  markdown,
  /renderer\.heading = function[\s\S]*?<h\$\{level\} id="\$\{escapeHtml\(id\)\}">/,
  "a stamped heading renders as a real HTML anchor",
);
test.assertMatches(
  markdown,
  /renderer\.heading = function[\s\S]*?stripMarkdownSectionId\(rendered\)/,
  "and the reader never sees the id itself",
);
test.assertIncludes(markdown, "id: markdownSectionId(headingMatch[2])", "a parsed section block carries its id");

// --- The record follows the id ------------------------------------------

test.assertIncludes(
  writingFlow,
  'const reusable = (blockId && reusableDrafts.find((draft) => free(draft) && String(draft.sectionId || "") === blockId))',
  "the id is tried first, because it is the only one of these that is an answer",
);
test.assertMatches(
  writingFlow,
  /\|\| reusableDrafts\.find\(\(draft\) => free\(draft\)\s*\n\s*&& Number\(draft\.sourceOutlineIndex\) === sourceIndex/,
  "title and position stay as the fallback for sections written before ids existed",
);
test.assertIncludes(writingFlow, "const claimed = new Set();", "one section, one record");
test.assertIncludes(writingFlow, "if (reusable) claimed.add(reusable);", "so a record already claimed cannot be claimed again by a later block's title");
test.assertIncludes(writingFlow, 'draft.sectionId = blockId || draft.sectionId || "";', "and the record keeps its section's id");

// Ids arrive when the text becomes sections -- not on every keystroke, which
// would fight the caret, and not never, which was the bug.
test.assertIncludes(writingFlow, "stampOutlineSectionIds(project);", "the outline is stamped as it becomes sections");
test.assertMatches(
  writingFlow,
  /function stampOutlineSectionIds[\s\S]*?document\.activeElement === outlineContentEl\) return false;/,
  "a focused Outline is left alone, so stamping never moves the caret",
);

// --- Normalizing a block must be idempotent ------------------------------
//
// extractOutlineDraftBlocks normalizes, and the draft sync normalizes what it
// returns. The second pass sees a body whose metadata line has already been
// stripped, and used to answer "no intent" -- which wiped a section's HKRR
// intent on every sync.
test.assertIncludes(
  projectDisk,
  'hkrrIntent: metadata.intent || normalizeHkrrIntent(block?.hkrrIntent) || "",',
  "an already-normalized block keeps the intent it arrived with",
);
test.assertIncludes(
  projectDisk,
  'hkrrNote: metadata.note || String(block?.hkrrNote || "").trim(),',
  "and its note",
);
test.assertIncludes(projectDisk, 'id: String(block?.id || ""),', "the id survives normalizing too");

test.finish();
