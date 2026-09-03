// Word export: the .docx the writing route hands to an editor.
//
// This contract is a loop, not a shape check. It builds a real .docx with the
// shipped generator and then reads it back with the reader this repo already
// owns -- extractDocxText() in apps/server/server/importers/office.js, the
// same code that imports a Word file a writer drops on the File Floppy.
//
// The two ends check each other. If the writer emits a heading the reader
// cannot see, the reader reports plain text and the assertion fails. If the
// reader is broken, the round trip fails as well. Nothing outside this repo
// is involved: no library writes the file, and no library reads it.
//
// The generator is a browser classic script, so it runs in a bare vm the way
// the darkroom-record contract runs its module. Running it there is also how
// the stored-entry fallback is exercised for real: a context with no
// CompressionStream is exactly the browser that has none.
import vm from "node:vm";
import { createRequire } from "node:module";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const require = createRequire(import.meta.url);
const { extractDocxText, extractWordXmlText } = require(`${root}/apps/server/server/importers/office.js`);
const { readZipEntries } = require(`${root}/apps/server/server/importers/zip.js`);

const test = createFeatureTest("word-export");

// --- The two ends ------------------------------------------------------------

const wordExportSource = read("app/features/word-export.js");

function loadWordExport({ compression = true } = {}) {
  const context = vm.createContext({
    window: {},
    TextEncoder,
    Uint8Array,
    DataView,
    Blob,
    Map,
    Set,
    Object,
    Math,
    Number,
    String,
    Array,
    Promise,
    ...(compression ? { CompressionStream } : {}),
  });
  vm.runInContext(wordExportSource, context);
  return context.window.AISystem6WordExport;
}

const markedSource = read("app/vendor/marked.umd.js");
const markedContext = vm.createContext({});
markedContext.globalThis = markedContext;
markedContext.self = markedContext;
markedContext.window = markedContext;
vm.runInContext(markedSource, markedContext);

// The product lexes with exactly these options in parseMarkdownDocument().
// The contract must not lex with different ones, or it would be testing a
// document the product never makes.
const lexerOptions = { gfm: true, breaks: false };
const lex = (markdown) => markedContext.marked.lexer(markdown, lexerOptions);

test.assert(
  read("app/core/markdown.js").includes("markedApi.lexer(source, { gfm: true, breaks: false })"),
  "the product still lexes with the options this contract lexes with"
);

// --- The manuscript that goes round ------------------------------------------

const manuscript = `# 交接说明

An opening paragraph with **bold text**, *italic text*, and a [link to the brief](https://example.invalid/brief).

## What the editor gets

- First bullet
- Second bullet

1. First step
2. Second step

> A quoted objection.

| Field | Value |
| --- | --- |
| Paper | A4 |
| Margin | 20mm |

---

\`\`\`js
const answer = 42;
\`\`\`

### A third level

A closing line with a note[^brief].

[^brief]: The footnote body travels in its own part.
`;

const tokens = lex(manuscript);
const pageSetup = {
  widthMm: 210,
  heightMm: 297,
  orientation: "portrait",
  marginMm: 20,
  fontPt: 11.5,
  lineHeight: 1.58,
  wordFontName: "Georgia",
  headingScale: { 1: 1.75, 2: 1.25, 3: 1.1 },
};

const wordExport = loadWordExport();

// --- Phase 1: the round trip -------------------------------------------------

const parts = wordExport.buildWordDocument(tokens, pageSetup, {
  title: "交接说明",
  language: "zh-Hans",
  savedAt: "2026-09-02T00:00:00Z",
});

for (const required of [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/styles.xml",
  "word/_rels/document.xml.rels",
  "docProps/core.xml",
]) {
  test.assert(typeof parts[required] === "string" && parts[required].length > 0, `the package carries ${required}`);
}

const bytes = await wordExport.packWordDocument(parts);
test.assert(bytes[0] === 0x50 && bytes[1] === 0x4b, "the file starts with the ZIP signature Word looks for");

const readBack = extractDocxText(Buffer.from(bytes));

// Headings come back at the level they went in. A heading that lost its style
// returns as a plain paragraph, so the hash marks are the assertion.
test.assert(readBack.includes("# 交接说明"), "the level-one heading survives the round trip at level one");
test.assert(readBack.includes("## What the editor gets"), "the level-two heading survives at level two");
test.assert(readBack.includes("### A third level"), "the level-three heading survives at level three");

// Body text, including the two inline marks the reader can see.
test.assert(readBack.includes("**bold text**"), "bold text survives as bold, not as plain text");
test.assert(readBack.includes("*italic text*"), "italic text survives as italic");
test.assert(readBack.includes("link to the brief"), "the words of a link survive the round trip");
test.assert(readBack.includes("A quoted objection."), "a block quote's words survive");
test.assert(readBack.includes("const answer = 42;"), "a code block's line survives unreflowed");
test.assert(readBack.includes("First bullet") && readBack.includes("Second bullet"), "unordered list items survive");
test.assert(readBack.includes("First step") && readBack.includes("Second step"), "ordered list items survive");
test.assert(/^- First bullet$/m.test(readBack), "a list item comes back as a list item, not as a paragraph");
test.assert(
  readBack.includes("The footnote body travels in its own part."),
  "the footnote body survives in word/footnotes.xml"
);

// Every table cell, not just the table. The reader rebuilds a Markdown pipe
// table, so the row shape is checked as well as the words.
test.assert(readBack.includes("| Field | Value |"), "the table header row comes back with both cells");
test.assert(readBack.includes("| Paper | A4 |"), "the first table row comes back with both cells");
test.assert(readBack.includes("| Margin | 20mm |"), "the second table row comes back with both cells");
for (const cell of ["Field", "Value", "Paper", "A4", "Margin", "20mm"]) {
  test.assert(readBack.includes(cell), `the table cell "${cell}" survives the round trip`);
}

// The header row must repeat when a table breaks across pages.
test.assert(parts["word/document.xml"].includes("<w:tblHeader/>"), "the table header row is marked to repeat on every page");

// Page Setup reaches the file as twips: 210mm is 11906, 20mm is 1134.
test.assert(
  parts["word/document.xml"].includes('<w:pgSz w:w="11906" w:h="16838"/>'),
  "A4 portrait reaches the Word page as 11906 by 16838 twips"
);
test.assert(
  parts["word/document.xml"].includes('w:top="1134"'),
  "the 20mm manuscript margin reaches the Word page as 1134 twips"
);
test.assert(parts["word/styles.xml"].includes('w:sz w:val="23"'), "11.5pt body type reaches Word as 23 half-points");
test.assert(parts["word/styles.xml"].includes('w:ascii="Georgia"'), "the English page keeps Georgia, the face the printed page uses");
test.assert(parts["word/styles.xml"].includes('w:line="379"'), "1.58 line height reaches Word as 379 twips of leading");

const landscapeLetter = wordExport.buildWordDocument(tokens, {
  ...pageSetup,
  widthMm: 215.9,
  heightMm: 279.4,
  orientation: "landscape",
  marginMm: 14,
  fontPt: 10.5,
  wordFontName: "Songti SC",
}, {});
test.assert(
  landscapeLetter["word/document.xml"].includes('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>'),
  "Letter landscape turns the sheet as well as naming it"
);
test.assert(landscapeLetter["word/styles.xml"].includes('w:ascii="Songti SC"'), "the Chinese page keeps Songti SC");

// The container is reproducible: the same manuscript twice is the same file.
const again = await wordExport.packWordDocument(
  wordExport.buildWordDocument(tokens, pageSetup, { title: "交接说明", language: "zh-Hans", savedAt: "2026-09-02T00:00:00Z" })
);
test.assert(Buffer.compare(Buffer.from(bytes), Buffer.from(again)) === 0, "building the same manuscript twice writes the same bytes");

// --- The stored-entry fallback -----------------------------------------------
//
// A browser with no CompressionStream must still write a file Word can open.
// The reader is the judge: it inflates method 8 and copies method 0, so a
// stored package that reads back the same text is proof, not an assumption.

const storedExport = loadWordExport({ compression: false });
const storedBytes = await storedExport.packWordDocument(
  storedExport.buildWordDocument(tokens, pageSetup, { title: "交接说明", language: "zh-Hans" })
);
const storedReadBack = extractDocxText(Buffer.from(storedBytes));
test.assert(storedBytes.length > bytes.length, "with no compressor the package is larger, which is the whole difference");
test.assert(storedReadBack === readBack, "a stored package reads back exactly what a deflated package reads back");

// --- Phase 2: the structural self-check --------------------------------------
//
// Each case names one fact the check reads from the tokens. The check reports
// what it found and refuses; it never scores the writing.

const refuses = (markdown, code, message) => {
  const result = wordExport.inspectWordDocumentStructure(lex(markdown));
  test.assert(!result.ok && result.problems.some((problem) => problem.code === code), message);
};

test.assert(wordExport.inspectWordDocumentStructure(tokens).ok, "the manuscript above passes the self-check");

refuses("", "empty_body", "an empty body is refused");
refuses("# Title\n\n### Skipped\n", "heading_skipped", "a skipped heading level is refused");
refuses("# Title\n\n##\n\nBody.\n", "empty_heading", "an empty heading is refused");
refuses("Body.\n\n![](picture.png)\n", "image_without_alt", "an image with no alternative text is refused");
refuses(
  "| A | B |\n| --- | --- |\n| 1 |\n",
  "ragged_table",
  "a row that does not match the header is refused"
);

const skipped = wordExport.inspectWordDocumentStructure(lex("# Title\n\n### Skipped\n"));
test.assert(
  skipped.problems.some((problem) => problem.detail === "H1 → H3"),
  "the refusal names the two levels it read, not a score"
);
test.assert(
  wordExport.inspectWordDocumentStructure(lex("Body.\n\n![alt words](picture.png)\n")).ok,
  "an image that carries alternative text is not refused"
);

// A refusal must stop the write, not decorate it.
const refused = await wordExport.exportDocumentAsWord({ tokens: lex(""), pageSetup, title: "Empty" });
test.assert(refused.saved === false && refused.problems.length > 0, "a refused document is not saved and says why");

// --- Phase 3: the review travels as real Word comments -----------------------
//
// A finding is a suggestion handed to a person. It becomes a Word comment the
// editor can accept, reply to, or dismiss -- anchored to the sentence it is
// about, and never to a sentence it is not about. The two ends check each
// other here as well: the package is written by the shipped generator and read
// back out of the ZIP by this repo's own reader.

/** The text of every run between one comment's range marks. */
function commentRangeText(documentXml, id) {
  const start = documentXml.indexOf(`<w:commentRangeStart w:id="${id}"/>`);
  const end = documentXml.indexOf(`<w:commentRangeEnd w:id="${id}"/>`);
  if (start < 0 || end < 0 || end < start) return null;
  const inside = documentXml.slice(start, end);
  return [...inside.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join("")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const reviewAuthor = "Review Desk";
const findings = [
  // A plain sentence in the middle of a paragraph that also carries bold,
  // italic and a link.
  { anchor: "An opening paragraph with", note: "Name the recipient before the first comma." },
  // The same words with the whitespace a reviewer's quote often has. The
  // manuscript writes them with one space; the anchor must still find them.
  { anchor: "italic  text,\n and a", note: "This clause reads as filler." },
  // A range that starts inside a bold run: it takes the whole run rather than
  // cutting it, because cutting would change the text a reader gets back.
  { anchor: "bold text", note: "Bold is doing the work a verb should do.", author: "Aaron" },
  { anchor: "A quoted objection.", note: "Keep this.\nIt is the reader's own wording." },
  { anchor: "Second bullet", note: "The second bullet repeats the first." },
  // Refused: the same word opens a bullet and a step.
  { anchor: "First", note: "Which first?" },
  // Refused: nothing in the manuscript says this.
  { anchor: "a sentence nobody in this document wrote", note: "Cannot travel." },
  // Refused: a note with no words to carry, and an anchor with nothing to find.
  { anchor: "A closing line with a note", note: "   " },
  { anchor: "", note: "No anchor at all." },
];

const reviewed = wordExport.buildWordDocumentPackage(tokens, pageSetup, {
  title: "交接说明",
  language: "zh-Hans",
  savedAt: "2026-09-02T00:00:00Z",
  commentAuthor: reviewAuthor,
}, { findings });

// The counts are read off real state: what the package carries, and what it
// refused. There is no score and no estimate anywhere in the report.
test.assert(reviewed.comments.requested === 9, "the report counts every finding it was handed");
test.assert(reviewed.comments.placed === 5, "five findings could be anchored and became comments");
test.assert(reviewed.comments.skipped.length === 4, "four findings could not be anchored and are reported, not placed");

const skipReasons = new Map(reviewed.comments.skipped.map((entry) => [entry.anchor, entry]));
test.assert(
  skipReasons.get("First")?.reason === "anchor_ambiguous" && skipReasons.get("First")?.detail === "2",
  "words that appear twice are refused as ambiguous, and the report says how many places were found"
);
test.assert(
  skipReasons.get("a sentence nobody in this document wrote")?.reason === "anchor_not_found",
  "an anchor the manuscript does not contain is refused as not found"
);
test.assert(
  skipReasons.get("A closing line with a note")?.reason === "note_empty",
  "a finding with no note to carry is refused, not placed as an empty comment"
);
test.assert(skipReasons.get("")?.reason === "anchor_empty", "a finding that quotes nothing is refused");

// Every part a real comment needs. Word calls the package damaged when any one
// of the three is missing.
const reviewedDocument = reviewed.parts["word/document.xml"];
test.assert(typeof reviewed.parts["word/comments.xml"] === "string", "the package carries word/comments.xml");
test.assertIncludes(
  reviewed.parts["[Content_Types].xml"],
  '<Override PartName="/word/comments.xml"'
    + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>',
  "the comments part has its content-type override"
);
test.assertIncludes(
  reviewed.parts["word/_rels/document.xml.rels"],
  `<Relationship Id="rIdComments" Type="${
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  }/comments" Target="comments.xml"/>`,
  "the document relates to the comments part"
);
test.assert(
  (reviewedDocument.match(/<w:commentRangeStart w:id="\d+"\/>/g) || []).length === 5
    && (reviewedDocument.match(/<w:commentRangeEnd w:id="\d+"\/>/g) || []).length === 5
    && (reviewedDocument.match(/<w:commentReference w:id="\d+"\/>/g) || []).length === 5,
  "each placed comment has a range start, a range end, and a reference run"
);

// The anchor range surrounds the sentence the finding is about, and nothing
// more than the run boundaries force.
for (const [id, expected] of [
  [1, "An opening paragraph with"],
  [2, "italic text, and a"],
  [3, "bold text"],
  [4, "A quoted objection."],
  [5, "Second bullet"],
]) {
  test.assert(
    commentRangeText(reviewedDocument, id) === expected,
    `comment ${id} is anchored to exactly "${expected}"`
  );
}

// The comment itself: its words, and the person the editor sees beside them.
const commentsXml = reviewed.parts["word/comments.xml"];
test.assertIncludes(commentsXml, "Name the recipient before the first comma.", "the first note's words are in the package");
test.assertIncludes(commentsXml, "It is the reader&#39;s own wording.", "a note's second line becomes a second paragraph");
test.assert(
  (commentsXml.match(new RegExp(`w:author="${reviewAuthor}"`, "g")) || []).length === 4,
  "the notes the Review Desk made carry the Review Desk as their author"
);
test.assertIncludes(commentsXml, 'w:author="Aaron" w:initials="A"', "a finding may name its own author, and Word gets the initials too");
test.assertIncludes(commentsXml, 'w:initials="RD"', "the initials Word shows are the first letter of each word of the author's name");
test.assertIncludes(commentsXml, 'w:date="2026-09-02T00:00:00Z"', "the comment is dated from the export, not from a clock this module reads");
test.assertNotIncludes(commentsXml, "Which first?", "the note that could not be anchored is not in the package at all");
test.assertNotIncludes(commentsXml, "Cannot travel.", "neither is the note whose words are not in the manuscript");

// --- The body does not change ------------------------------------------------
//
// This is the product rule, not a nicety: a review note is a suggestion handed
// to a person, so the manuscript that reaches the editor is the manuscript the
// writer wrote. The same document is built twice -- once with the findings and
// once without -- and the repo's own reader is asked whether the body reads
// the same.

const unreviewed = wordExport.buildWordDocumentPackage(tokens, pageSetup, {
  title: "交接说明",
  language: "zh-Hans",
  savedAt: "2026-09-02T00:00:00Z",
  commentAuthor: reviewAuthor,
}, {});

test.assert(
  extractWordXmlText(reviewedDocument) === extractWordXmlText(unreviewed.parts["word/document.xml"]),
  "the body reads back identically with the comments and without them"
);
test.assert(
  Buffer.compare(
    Buffer.from(extractWordXmlText(reviewedDocument), "utf8"),
    Buffer.from(extractWordXmlText(parts["word/document.xml"]), "utf8")
  ) === 0,
  "the reviewed body is byte-for-byte the body of the plain export above"
);
test.assert(
  reviewed.parts["word/styles.xml"] === unreviewed.parts["word/styles.xml"],
  "the comment styles are in the package whether or not any comment is"
);
test.assert(
  (reviewedDocument.match(/<w:p>/g) || []).length === (unreviewed.parts["word/document.xml"].match(/<w:p>/g) || []).length,
  "no paragraph was added, split, or removed to make room for a comment"
);
test.assertNotIncludes(reviewedDocument, "<w:ins ", "a comment never becomes a tracked insertion");
test.assertNotIncludes(reviewedDocument, "<w:del ", "and never a tracked deletion");

// A document with no findings is the document the previous lane wrote: no
// comments part, no override, no relationship.
test.assert(unreviewed.parts["word/comments.xml"] === undefined, "an export with no findings carries no comments part");
test.assertNotIncludes(unreviewed.parts["[Content_Types].xml"], "/word/comments.xml", "and no override for a part that is not there");
test.assertNotIncludes(unreviewed.parts["word/_rels/document.xml.rels"], "rIdComments", "and no relationship to it");
test.assert(unreviewed.comments.requested === 0 && unreviewed.comments.placed === 0, "and its report says nothing travelled");

// --- The reviewed package, read back out of the ZIP --------------------------

const reviewedBytes = await wordExport.packWordDocument(reviewed.parts);
const reviewedEntries = readZipEntries(Buffer.from(reviewedBytes));
test.assert(reviewedEntries.has("word/comments.xml"), "the comments part survives the ZIP writer");
const reviewedReadBack = extractDocxText(Buffer.from(reviewedBytes));
test.assert(reviewedReadBack.includes("# 交接说明"), "the manuscript still reads back as the manuscript");
test.assert(
  reviewedReadBack.includes("Bold is doing the work a verb should do."),
  "the reader that imports a Word file finds the review note in it"
);
const reviewedAgain = await wordExport.packWordDocument(
  wordExport.buildWordDocumentPackage(tokens, pageSetup, {
    title: "交接说明",
    language: "zh-Hans",
    savedAt: "2026-09-02T00:00:00Z",
    commentAuthor: reviewAuthor,
  }, { findings }).parts
);
test.assert(
  Buffer.compare(Buffer.from(reviewedBytes), Buffer.from(reviewedAgain)) === 0,
  "a reviewed document built twice writes the same bytes"
);

// --- The plan the writer reads before saving ---------------------------------

const plan = wordExport.planWordComments(tokens, findings, { commentAuthor: reviewAuthor });
test.assert(
  plan.requested === reviewed.comments.requested
    && plan.placed === reviewed.comments.placed
    && plan.skipped.length === reviewed.comments.skipped.length,
  "the plan the preview shows and the report the export returns cannot disagree"
);
test.assert(
  wordExport.planWordComments(tokens, []).requested === 0,
  "a document with no review notes plans no comments"
);

// The Review Desk's own report rows read as findings; a row with no quoted
// sentence is dropped rather than anchored to a guess.
const fromRows = wordExport.reviewFindingsFromRows([
  ["Paragraph/sentence", "Checkable claim", "Verdict"],
  ["A quoted objection.", "The objection is the reader's", "Evidence Insufficient"],
  ["", "A row with no sentence to anchor to", "Supported"],
  ["Second bullet"],
], { author: reviewAuthor });
test.assert(fromRows.length === 1 && fromRows[0].anchor === "A quoted objection.", "only a row that quotes the manuscript becomes a finding");
test.assert(fromRows[0].note.includes("Evidence Insufficient"), "the rest of the row becomes the note the editor reads");
test.assert(fromRows[0].author === reviewAuthor, "the report's rows carry the Review Desk as their author");

// A clipped quote still anchors. shortClaimText() ends one with three dots,
// which are the product's own mark and not the writer's words.
const clipped = wordExport.planWordComments(tokens, [{ anchor: "A quoted objection...", note: "Clipped by the product." }]);
test.assert(clipped.placed === 1, "a quote the product clipped with three dots still finds its sentence");

// --- The export reports what the file carries --------------------------------

const exported = await wordExport.exportDocumentAsWord({ tokens, pageSetup, title: "交接说明", findings });
test.assert(
  exported.comments.placed === 5 && exported.comments.skipped.length === 4,
  "the export returns the same counts the package carries"
);
const refusedComments = await wordExport.exportDocumentAsWord({ tokens: lex(""), pageSetup, findings });
test.assert(
  refusedComments.saved === false && refusedComments.comments.placed === 0,
  "a document refused by the structural check writes no comments either"
);

// --- The wiring that carries the findings ------------------------------------

const printSource = read("app/features/project-cd-print.js");
test.assertIncludes(printSource, "function wordExportReviewFindings()", "the preview reads the Review Desk's findings before it opens");
test.assertIncludes(printSource, "findings: wordExportReviewFindings()", "and hands them to the export it wires");
test.assertIncludes(printSource, "planWordComments(documentModel.tokens, findings", "the writer sees the plan before choosing Save");
test.assertIncludes(printSource, "wordExportCommentLines(result.comments)", "and sees what the written file actually carried after it");

// --- The wiring that makes the feature reachable -----------------------------

test.assert(lazyRuntimePaths.includes("app/features/word-export.js"), "the module is lazy, so it costs no boot bytes");
test.assertNotIncludes(read("index.html"), "app/features/word-export.js", "the module is never a boot script tag");

const config = read("app/core/config.js");
test.assertIncludes(config, '"app/features/word-export.js"', "a loader in config.js names the lazy module");
test.assertIncludes(config, '"openWordExportPreview"', "the preview opener is a lazy stub, so a menu click loads the module first");

const actions = read("app/core/actions.js");
test.assertIncludes(
  actions,
  '"export-document-word": () => exportActiveDocumentAsWord()',
  "the command is arrow-wrapped, so it resolves the lazy stub when it runs and not when the table is built"
);
test.assertIncludes(
  actions,
  '"export-project-cd-word": () => exportSelectedProjectCdItemAsWord()',
  "the Project CD command is arrow-wrapped for the same reason"
);

const menus = read("app/data/menus.js");
test.assert(
  (menus.match(/menuItem\("export-document-word", "export_word_document"\)/g) || []).length === 2,
  "Word Document… is in the Export submenu of both TeachText and ClioTalk"
);
test.assertIncludes(
  read("index.html"),
  'data-action="export-project-cd-word"',
  "Word is one of the Project CD burn formats, beside Print to PDF"
);

for (const key of [
  "export_word_document",
  "save_as_word",
  "word_export_preview_opened",
  "word_export_saved",
  "word_export_failed",
  "word_export_refused",
  "word_export_problem_empty_body",
  "word_export_problem_empty_heading",
  "word_export_problem_heading_skipped",
  "word_export_problem_ragged_table",
  "word_export_problem_image_without_alt",
  "word_export_comments_planned",
  "word_export_comments_unanchored",
  "word_export_comment_skip_anchor_not_found",
  "word_export_comment_skip_anchor_ambiguous",
  "word_export_comment_skip_anchor_empty",
  "word_export_comment_skip_note_empty",
  "word_export_comment_skip_anchor_unplaceable",
]) {
  test.assert(read("app/data/translations-en.js").includes(`${key}:`), `${key} exists in English`);
  test.assert(read("app/data/translations-zh.js").includes(`${key}:`), `${key} exists in Chinese`);
}

// --- One token stream, one Page Setup ----------------------------------------

const print = read("app/features/project-cd-print.js");
test.assertIncludes(
  read("app/core/markdown.js"),
  "    tokens,",
  "parseMarkdownDocument returns the lexer result itself, so one parse can feed two kinds of paper"
);
test.assertIncludes(
  print,
  "buildProjectCdPrintHtml({ title, body }, { wordExport: true, documentModel })",
  "the preview is built from the document model the export already parsed"
);
test.assertIncludes(
  print,
  "tokens: documentModel.tokens",
  "the .docx is built from that same document model, not from a second parse"
);
test.assert(
  (print.match(/parseMarkdownDocument\(/g) || []).length === 2
    && print.includes("documentModel = documentModel || parseMarkdownDocument(item.body"),
  "buildProjectCdPrintHtml re-parses only when nobody handed it a parse"
);

// Page Setup lives in exactly one table. A number that appears twice is a
// second table waiting to disagree with the first.
test.assertIncludes(print, "function projectCdPaperMetrics()", "one function answers what the page measures");
test.assertIncludes(print, "pageSetup: metrics", "the Word export is measured by that same answer");
for (const [value, label] of [
  ["marginMm: 20", "the roomy margin"],
  ["marginMm: 14", "the compact margin"],
  ["fontPt: 11.5", "the roomy body size"],
  ["lineHeight: 1.58", "the roomy line height"],
]) {
  test.assert((print.match(new RegExp(value.replace(".", "\\."), "g")) || []).length === 1, `${label} is written down once`);
}
test.assertNotIncludes(print, '"14mm"', "the print stylesheet no longer keeps its own copy of the margin");
test.assertNotIncludes(print, '"10.5pt"', "the print stylesheet no longer keeps its own copy of the body size");
test.assertNotIncludes(
  read("app/features/word-export.js"),
  "marked",
  "the Word writer contains no Markdown parser of its own"
);

test.finish();
