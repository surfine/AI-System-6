// Peel import: read a file by taking it apart one container at a time.
//
// These are behavioural checks, not shape checks. Each one builds the bytes
// the importer will actually meet -- a zip of files, an EPUB whose spine
// contradicts its file names, an ODT content.xml -- and reads the text back
// through peelFile(). The route wires peelFile for real; here extractLeaf is a
// stub so a failure names the peel layer rather than a format importer.
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { buildZip } from "../helpers/zip-fixture.mjs";

const require = createRequire(import.meta.url);
const { peelFile, sniffImportType, PEEL_MAX_DEPTH } = require(`${root}/apps/server/server/importers/peel.js`);
const { extractOpenDocumentText } = require(`${root}/apps/server/server/importers/opendocument.js`);
const { extractNotebookText } = require(`${root}/apps/server/server/importers/notebook.js`);
const { chunkTextForRepair, extractImportedText } = require("../../apps/server/server/routes/import-text.js");

const test = createFeatureTest("import-peel");

const leaf = async (name, mimeType, buffer) => {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".docx")) return "DOCX BODY";
  return buffer.toString("utf8");
};

// --- sniffImportType: magic bytes decide before the name --------------------

test.assert(sniffImportType(Buffer.from("%PDF-1.4"), "x.pdf", "") === "pdf", "a PDF header sniffs as pdf");
test.assert(sniffImportType(gzipSync(Buffer.from("payload")), "x.gz", "") === "gzip", "a gzip header sniffs as gzip");
test.assert(sniffImportType(buildZip([{ name: "word/document.xml", data: "<w:document/>" }]), "x.zip", "") === "docx", "a zip holding word/document.xml sniffs as docx");
test.assert(sniffImportType(buildZip([{ name: "mimetype", data: "application/epub+zip", store: true }]), "x.zip", "") === "epub", "a zip whose mimetype says epub sniffs as epub");
test.assert(sniffImportType(Buffer.from("<html><body>hi</body></html>"), "x.bin", "") === "html", "an html opening tag sniffs as html");
test.assert(sniffImportType(Buffer.from('{"nbformat": 4, "cells": []}'), "x.json", "") === "ipynb", "a JSON nbformat header sniffs as ipynb");
test.assert(sniffImportType(Buffer.from("just some plain prose here, nothing else"), "x.dat", "") === "text", "readable bytes with no signature fall back to text");

// --- zip: sectioned by path, in reading order, without archive furniture ----

const bundle = buildZip([
  { name: "b-second.txt", data: "SECOND FILE BODY" },
  { name: "a-first.txt", data: "FIRST FILE BODY" },
  { name: "__MACOSX/._a-first.txt", data: "junk" },
  { name: ".metadata", data: "junk" },
]);
const bundleText = await peelFile({ name: "bundle.zip", mimeType: "application/zip", buffer: bundle, extractLeaf: leaf });
test.assert(bundleText.includes("## bundle.zip › a-first.txt"), "each zip member gets a path heading");
test.assert(bundleText.indexOf("FIRST FILE BODY") < bundleText.indexOf("SECOND FILE BODY"), "members are read in natural name order");
test.assert(bundleText.includes("__MACOSX") === false && bundleText.includes(".metadata") === false, "resource forks and dotfiles are skipped");

// --- gzip: unwrapped and read as its inner name -----------------------------

const compressed = gzipSync(Buffer.from("GZIP INNER PAYLOAD"));
const gzipText = await peelFile({ name: "notes.txt.gz", mimeType: "application/gzip", buffer: compressed, extractLeaf: leaf });
test.assert(gzipText.includes("GZIP INNER PAYLOAD"), "a gzip is inflated and its member read");

// --- epub: the OPF spine, not alphabetical file names -----------------------

const epub = buildZip([
  { name: "mimetype", data: "application/epub+zip", store: true },
  { name: "META-INF/container.xml", data: '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>' },
  { name: "OEBPS/content.opf", data: '<package><manifest><item id="c2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/><item id="c10" href="chapter-10.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c10"/><itemref idref="c2"/></spine></package>' },
  { name: "OEBPS/chapter-10.xhtml", data: "<html><body><p>TENTH BODY</p></body></html>" },
  { name: "OEBPS/chapter-2.xhtml", data: "<html><body><p>SECOND BODY</p></body></html>" },
]);
const epubText = await peelFile({ name: "book.epub", mimeType: "application/epub+zip", buffer: epub, extractLeaf: leaf });
test.assert(epubText.indexOf("TENTH BODY") < epubText.indexOf("SECOND BODY"), "epub chapters follow the spine, not the file name sort");

// --- OpenDocument and notebook leaves ---------------------------------------

const odt = buildZip([
  { name: "mimetype", data: "application/vnd.oasis.opendocument.text", store: true },
  { name: "content.xml", data: '<office:document-content><office:body><office:text><text:h text:outline-level="1">ODT HEADING</text:h><text:p>ODT PARAGRAPH</text:p></text:office:text></office:body></office:document-content>' },
]);
const odtText = extractOpenDocumentText(odt);
test.assert(odtText.includes("# ODT HEADING") && odtText.includes("ODT PARAGRAPH"), "an ODT heading becomes Markdown and its paragraph survives");

const notebook = Buffer.from(JSON.stringify({
  nbformat: 4,
  metadata: { kernelspec: { language: "python" } },
  cells: [
    { cell_type: "markdown", source: ["# NOTEBOOK PROSE"] },
    { cell_type: "code", source: ["print(1)"], outputs: [{ output_type: "stream", text: "NB OUTPUT" }] },
  ],
}));
const notebookText = extractNotebookText(notebook);
test.assert(notebookText.includes("# NOTEBOOK PROSE"), "notebook markdown is kept verbatim");
test.assert(notebookText.includes("```python") && notebookText.includes("print(1)") && notebookText.includes("NB OUTPUT"), "code is fenced with the kernel language and its text output kept");

// --- html, embedded figures, images -----------------------------------------

const page = Buffer.from("<html><head><title>Saved Page Title</title></head><body><article><h1>Saved Heading</h1><p>" + "word ".repeat(120) + "</p></article></body></html>");
const pageText = await peelFile({ name: "page.html", mimeType: "text/html", buffer: page, extractLeaf: leaf });
test.assert(pageText.includes("Saved Page Title"), "an html import is titled from the document title");

const figureDoc = buildZip([
  { name: "word/document.xml", data: "<w:document><w:body><w:p><w:r><w:t>REPORT BODY</w:t></w:r></w:p></w:body></w:document>" },
  { name: "word/media/image1.png", data: Buffer.alloc(9000, 7), store: true },
]);
const figureText = await peelFile({
  name: "report.docx",
  mimeType: "",
  buffer: figureDoc,
  extractLeaf: leaf,
  options: { ocrImage: async () => "FIGURE OCR TEXT" },
});
test.assert(figureText.includes("DOCX BODY") && figureText.includes("### 图 1（OCR）") && figureText.includes("FIGURE OCR TEXT"), "a docx figure is OCR'd after the document text");

const gifText = await peelFile({ name: "anim.gif", mimeType: "image/gif", buffer: Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(24)]), extractLeaf: async () => "GIF LEAF TEXT" });
test.assert(gifText === "GIF LEAF TEXT", "a gif is handed to the injected leaf so the route can OCR it");

// --- safety and boundaries --------------------------------------------------

// A message is read with its headers quoted, and its attachment is peeled
// like a zip member: here a text file inside the mail.
const mail = [
  "From: Ana <ana@example.com>",
  "To: Bo <bo@example.com>",
  "Subject: notes",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b"',
  "",
  "--b",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "See the attached notes.",
  "--b",
  'Content-Type: text/plain; name="notes.txt"',
  'Content-Disposition: attachment; filename="notes.txt"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("ATTACHED NOTE TEXT").toString("base64"),
  "--b--",
  "",
].join("\r\n");
const mailText = await peelFile({ name: "mail.eml", mimeType: "message/rfc822", buffer: Buffer.from(mail), extractLeaf: leaf });
test.assert(mailText.includes("**From:** Ana <ana@example.com>"), "a mail's sender is quoted as provenance");
test.assert(mailText.includes("See the attached notes."), "a mail's own text is kept");
test.assert(mailText.includes("notes.txt") && mailText.includes("ATTACHED NOTE TEXT"), "a mail's attachment is peeled in place");
const mhtml = [
  "Snapshot-Content-Location: https://example.com/a",
  "MIME-Version: 1.0",
  'Content-Type: multipart/related; type="text/html"; boundary="m"',
  "",
  "--m",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<html><head><title>Saved page</title></head><body><nav>Menu Menu</nav><article><p>" + "A saved article paragraph that is long enough to be read. ".repeat(6) + "</p></article></body></html>",
  "--m--",
  "",
].join("\r\n");
const mhtmlText = await peelFile({ name: "page.mhtml", buffer: Buffer.from(mhtml), extractLeaf: leaf });
test.assert(mhtmlText.includes("A saved article paragraph"), "a saved web page is read through the HTML reader");

const controller = new AbortController();
controller.abort();
let abortName = "";
try {
  await peelFile({ name: "bundle.zip", mimeType: "application/zip", buffer: bundle, extractLeaf: leaf, options: { signal: controller.signal } });
} catch (error) {
  abortName = String(error.name || "");
}
test.assert(abortName === "AbortError", "an aborted signal stops the walk before it reads anything");

test.assert(PEEL_MAX_DEPTH === 3, "peel stops expanding archives past depth three");

// --- the route wires it in, and chunks cloud repair like the browser --------

const routeSource = read("apps/server/server/routes/import-text.js");
test.assertIncludes(routeSource, "peelFile({", "the non-markitdown branch reads through peel");
test.assertIncludes(routeSource, "PEEL_PREFERRED_TYPES", "container formats skip the MarkItDown shortcut");
test.assertIncludes(routeSource, "chunkTextForRepair", "cloud repair is chunked");
test.assert(chunkTextForRepair("abcdefghij", 4).join("|") === "abcd|efgh|ij", "chunkTextForRepair splits on the requested size");
test.assert(chunkTextForRepair("x".repeat(12001)).length === 2, "the default repair chunk is 12,000 characters");


// --- Apple document recognition, the OCR ladder's first rung on a Mac -------
// The helper (a macOS 26 binary) is exercised by hand; this pins the part that
// turns its structure into the Markdown a writer reads, and the ladder order.
const { visionBlocksToMarkdown } = require(`${root}/apps/server/server/importers/vision-helper.js`);
const markdown = visionBlocksToMarkdown([
  { kind: "title", text: "季度 报告" },
  { kind: "paragraph", text: "第一段\n正文。" },
  { kind: "list", items: ["• 一", "2. 二"] },
  { kind: "table", rows: [["城市", "人口"], ["上海", "2487|万"], ["深圳"]] },
]);
test.assert(markdown.startsWith("## 季度 报告"), "the recognised title becomes a heading");
test.assert(markdown.includes("第一段\n正文。"), "a paragraph keeps its own line breaks");
test.assert(markdown.includes("- 一\n- 二"), "list markers the page printed are replaced by Markdown ones");
test.assert(markdown.includes("| 城市 | 人口 |\n| --- | --- |"), "a table keeps its header row");
test.assert(markdown.includes("| 上海 | 2487\\|万 |"), "a cell's own pipe is escaped");
test.assert(markdown.includes("| 深圳 |  |"), "a short row is padded to the table's width");
test.assert(visionBlocksToMarkdown([]) === "", "nothing recognised is nothing");

const ladder = read("apps/server/server/importers/image-ocr.js");
const visionAt = ladder.indexOf("extractImageTextWithVisionHelper(image.buffer");
const paddleAt = ladder.indexOf("report(options, \"paddle\", await extractImageTextWithPaddle(image.buffer));\n        } catch {");
test.assert(visionAt > 0 && paddleAt > visionAt, "Apple's recognition is tried before the other engines in Auto");
test.assertMatches(ladder, /extractImageTextWithVisionHelper[\s\S]{0,200}\} catch \{\s*\/\/ The ladder continues/, "a failure falls through to the next engine");
const helper = read("apps/server/server/importers/vision-helper.js");
test.assertIncludes(helper, "process.platform !== \"darwin\"", "the rung is absent off the Mac");
test.assertIncludes(helper, "timeout: VISION_TIMEOUT_MS", "a stuck recognition cannot hold the import");
test.assertIncludes(read("platform/macos/shell/macos-webview/Sources/AISystem6Vision/main.swift"), "RecognizeDocumentsRequest", "the helper uses document recognition, not line OCR");


test.finish();
