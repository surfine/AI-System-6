// ClioWorks N14 contract: the manuscript round trip — 送审 export and 回稿
// import (design proposal RoundTrip.dc.html). Runs the REAL engine, the REAL
// word-export generator and the REAL vendored Quire codec in VMs (the S11
// path), then checks both directions:
//
//   送审  the dirty manuscript cleans (AI insertion comments out, [S3] marks
//        become [^S3] with one definition per resolvable source, unknown
//        marks stay verbatim and are named), the round number comes from the
//        来回 folder's own file names, and the .docx the pipeline builds
//        really carries word/footnotes.xml with one note per source — the
//        package is unzipped with DecompressionStream, not trusted.
//   回稿  a send round and the reviewer's answer, both written by the vendored
//        codec itself, align paragraph by paragraph; one rewrite, one new
//        paragraph and one comment come out as the summary the windoid shows.
//
// What the contract does NOT cover — because N14 does not do it: per-paragraph
// candidates, the message column, the three-way compare. Those are N8's, and
// importing never touches the manuscript.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n14-roundtrip");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

// --- the desk: engine + generator in one VM ----------------------------------
// The send path loads the engine and word-export.js before it builds anything;
// the contract loads exactly that pair.
const deskCtx = makeContext();
loadScripts(deskCtx, ["app/vendor/clioworks-v3/manuscript-roundtrip.js", "app/features/word-export.js"]);
const RT = deskCtx.AISystem6ManuscriptRoundTrip;
const word = deskCtx.AISystem6WordExport;
test.assert(!!RT && typeof RT.planSendReview === "function", "the round-trip engine installs its API in a bare VM");
test.assert(!!word && typeof word.buildWordDocumentPackage === "function", "word-export installs beside it, as the send path loads it");
test.assert(Object.isFrozen(RT), "the engine API is frozen — N8 takes it as it stands");

// The product lexer, with parseMarkdownDocument()'s own options pinned.
const markedContext = vm.createContext({});
markedContext.globalThis = markedContext;
markedContext.self = markedContext;
markedContext.window = markedContext;
vm.runInContext(read("app/vendor/marked.umd.js"), markedContext);
test.assert(
  read("app/core/markdown.js").includes("markedApi.lexer(source, { gfm: true, breaks: false })"),
  "the product still lexes with the options this contract lexes with"
);
const lex = (markdown) => markedContext.marked.lexer(markdown, { gfm: true, breaks: false });

// --- unzip with DecompressionStream, not trust -------------------------------
async function inflateRaw(payload) {
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One .docx the generator built, read back as Map<name, xml text>. */
async function readDocxParts(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts = new Map();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const compressedSize = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + extraLength;
    const payload = bytes.subarray(start, start + compressedSize);
    const raw = method === 0 ? payload : await inflateRaw(payload);
    parts.set(name, new TextDecoder().decode(raw));
    at = start + compressedSize;
  }
  return parts;
}

// --- 1. 送审净化: AI 痕迹出去，引用变脚注，配不上的原样留下 ------------------
const dirtyManuscript = [
  "# 采访安排",
  "",
  "本次访谈分三轮进行[S3]，对象以一线编辑为主[S3:12]。",
  "",
  "每位受访者事先收到提纲。",
  "",
  "交通费按实报销[S9]。",
  "",
  "<!-- AI System 6 insertion",
  "chat · 2026-10-26 · 引自聊天",
  "-->",
  "",
  "<!-- the writer's own note stays -->",
].join("\n");
const registry = [
  { sourceId: "S3", title: "采访提纲", url: "https://example.invalid/tigi", kind: "doc", missing: false },
];

const cleaned = RT.cleanManuscriptForReview(dirtyManuscript, registry);
test.assert(!cleaned.markdown.includes("AI System 6 insertion"), "the desk's provenance comment is gone from the clean manuscript");
test.assert(cleaned.markdown.includes("<!-- the writer's own note stays -->"), "a comment that is not the desk's own stays");
test.assert(cleaned.markdown.includes("[^S3]") && !cleaned.markdown.includes("[S3"), "every resolvable mark became a footnote reference ([^S3] contains no raw [S3)");
test.assert((cleaned.markdown.match(/\[\^S3\](?!:)/g) || []).length === 2, "both [S3] and [S3:12] point at the one note (the definition line's [^S3]: excluded)");
test.assert(cleaned.markdown.includes("[S9]") && !cleaned.markdown.includes("[^S9]"), "the mark with no source stays in the text exactly as typed");
test.assert(JSON.stringify(cleaned.unresolvedMarks) === JSON.stringify(["S9"]), "the unresolved mark is named, never silently dropped");
test.assert(cleaned.markdown.trimEnd().endsWith("[^S3]: 采访提纲 — https://example.invalid/tigi"), "one definition per used source lands at the end");
test.assert(cleaned.footnotes.length === 1 && cleaned.footnotes[0].sourceId === "S3", "the footnote list says what the definitions say");

// --- 2. 轮次命名与文件名 ------------------------------------------------------
const folderNames = [
  "别的稿-送审-第7轮.docx",
  "采访安排-送审-第1轮.docx",
  "采访安排-回稿-第1轮.docx",
  "采访安排-送审-第3轮.docx",
];
test.assert(JSON.stringify(RT.parseRoundName("采访安排-送审-第2轮.docx")) === JSON.stringify({ title: "采访安排", kind: "send", round: 2 }), "a send file name parses into title, kind and round");
test.assert(RT.parseRoundName("采访安排-回稿-第2轮.docx").kind === "return", "a return file name parses as a return");
test.assert(RT.parseRoundName("notes.docx") === null && RT.parseRoundName("采访安排-送审-第0轮.docx") === null, "a name that is not a round, and a round below 1, read as nothing");
test.assert(RT.nextSendRound(folderNames, "采访安排") === 4, "the next round is the highest same-title send plus one");
test.assert(RT.nextSendRound([], "采访安排") === 1 && RT.nextSendRound(folderNames, "别的稿") === 8, "a fresh title starts at 1; another title's rounds never leak in");
test.assert(JSON.stringify(RT.latestSendRound(folderNames, "采访安排")) === JSON.stringify({ round: 3, name: "采访安排-送审-第3轮.docx" }), "pairing picks the latest same-title send round");
test.assert(RT.latestSendRound(folderNames, "无稿") === null, "no send round to answer is null, said aloud to the writer");
test.assert(RT.sendFileName("采访安排", 2) === "采访安排-送审-第2轮.docx" && RT.returnFileName("采访安排", 3) === "采访安排-回稿-第3轮.docx", "both halves of the folder speak the same name pattern");
test.assert(RT.sanitizeFileTitle('a/b:c*d?"<>|e') === "a-b-c-d-e", "filename-illegal characters fold to dashes, a run of them to one");
test.assert(RT.sanitizeFileTitle("  ") === "manuscript", "a title with nothing left falls back to a neutral name");

const plan = RT.planSendReview({
  markdown: dirtyManuscript,
  documentName: "采访安排",
  folderFileNames: folderNames,
  sources: registry,
});
test.assert(plan.round === 4 && plan.fileName === "采访安排-送审-第4轮.docx" && plan.folderName === "来回",
  "the plan names the round from the folder and the file after the round");
test.assert(plan.previousRound === 3 && plan.markdown.includes("[^S3]: "), "the plan carries the previous round and the cleaned manuscript");
const planPlain = RT.planSendReview({ markdown: dirtyManuscript, documentName: "采访安排", folderFileNames: folderNames, convertCitations: false });
test.assert(planPlain.markdown.includes("[S3]") && !planPlain.markdown.includes("[^S3]: "), "with citations unchecked the marks stay as the manuscript typed them");

// --- 3. 送审 end-to-end: clean markdown → tokens → real docx → unzipped ----------
const tokens = lex(plan.markdown);
test.assert(word.inspectWordDocumentStructure(tokens).ok, "the cleaned manuscript passes the generator's own inspection");
const built = word.buildWordDocumentPackage(tokens, {}, { title: plan.title, language: "zh", savedAt: "2026-10-26T00:00:00Z" });
const bytes = await word.packWordDocument(built.parts);
const parts = await readDocxParts(bytes);
test.assert(parts.has("word/footnotes.xml") && parts.has("word/document.xml"), "the package carries word/footnotes.xml beside word/document.xml");
const footnotesXml = parts.get("word/footnotes.xml");
const notes = [...footnotesXml.matchAll(/<w:footnote w:id="(\d+)">/g)].map((m) => Number(m[1]));
test.assert(JSON.stringify(notes) === JSON.stringify([2]), "one used source is one note, and it is id 2 — 0 and 1 stay Word's separators");
test.assert(footnotesXml.includes('w:type="separator" w:id="0"') && footnotesXml.includes('w:type="continuationSeparator" w:id="1"'), "the separator footnotes Word requires ride along");
test.assert(footnotesXml.includes("采访提纲 — https://example.invalid/tigi"), "the note body is the source's own citation text");
const documentXml = parts.get("word/document.xml");
test.assert((documentXml.match(/<w:footnoteReference w:id="2"\/>/g) || []).length === 2, "both marks in the body reference the same real footnote");
test.assert(documentXml.includes("[S9]"), "the unresolvable mark reaches the editor verbatim");
for (const carried of ["本次访谈分三轮进行", "每位受访者事先收到提纲", "交通费按实报销"]) {
  test.assert(documentXml.includes(carried), `the manuscript's own words travel (${carried.slice(0, 8)}…)`);
}
test.assert(!documentXml.includes("AI System 6 insertion") && !documentXml.includes("writer's own note"), "neither the desk's trace nor the writer's private note is in the file");

// --- 4. 回稿 alignment: send and answer both written by the vendored codec -----
const quireCtx = makeContext();
loadScripts(quireCtx, ["app/vendor/clioworks-v3/manuscript-roundtrip.js", "app/vendor/clioworks-v3/quire-adapter.js"]);
const RTq = quireCtx.AISystem6ManuscriptRoundTrip;
const openDocx = async (arrayBuffer, name) => {
  quireCtx.__bytes = new Uint8Array(arrayBuffer);
  return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__bytes, { name: ${JSON.stringify(name)} })`, quireCtx);
};

// The 送审版: three plain paragraphs, the clean shape a send carries.
// The 回稿: paragraph 2 rewritten and commented, a new paragraph after it —
// exactly the shape a reviewer's Word round comes back in.
const buildRound = (changed) => vm.runInContext(`(async () => {
  const CHANGED = ${JSON.stringify(!!changed)};
  const L = await ClioWorksQuireAdapter.loadCodec();
  const D = L.D;
  const doc = D.newDoc();
  const blocks = [
    D.para([D.text("第一段原文，一字未动", {})], {}),
    D.para(CHANGED
      ? [D.item("cs", { id: "7" }), D.text("第二段被整段改写", {}), D.item("ce", { id: "7" })]
      : [D.text("第二段原稿，等待修改", {})], {}),
    ...(CHANGED ? [D.para([D.text("审稿人新增的一段", {})], {})] : []),
    D.para([D.text("第三段原文，同样未动", {})], {}),
  ];
  D.touchList(doc.main);
  doc.main.blocks.push(...blocks);
  if (CHANGED) {
    doc.comments["7"] = { kind: "cmt", id: "7", author: "落落", initials: "LL", date: "2026-11-04T09:00:00Z", done: false,
      blocks: [D.para([D.text("这段改成两轮行吗？", {})], {})] };
  }
  D.reindex(doc);
  return await (await L.docx.write(doc, { format: "docx" })).arrayBuffer();
})()`, quireCtx);

const sent = await openDocx(await buildRound(false), "采访安排-送审-第2轮.docx");
const returned = await openDocx(await buildRound(true), "回稿.docx");
const returnedComments = returned.comments();
test.assert(returnedComments.length === 1 && returnedComments[0].author === "落落" && returnedComments[0].text === "这段改成两轮行吗？",
  "the reviewer's comment survives the codec's own write and read");

const rows = RTq.alignParagraphs(sent.paragraphs(), returned.paragraphs());
const shape = rows.map((row) => row.kind).join(",");
// D.newDoc() starts every document with one empty paragraph, so both rounds
// carry it and it pairs as the leading same row.
test.assert(shape === "same,same,changed,added,same",
  `the shared empty opener, one rewrite, one new paragraph, two untouched (got ${shape})`);
test.assert(rows[1].sentText === "第一段原文，一字未动" && rows[1].returnedText === "第一段原文，一字未动",
  "an untouched paragraph carries its words on both sides");
test.assert(rows[2].sentText === "第二段原稿，等待修改" && rows[2].returnedText === "第二段被整段改写",
  "the changed row carries both sides' words");
test.assert(rows[3].returnedText === "审稿人新增的一段" && rows[3].sentText === "",
  "the new paragraph is an addition with no send counterpart");
const unplaced = RTq.attachComments(rows, returnedComments);
test.assert(unplaced.length === 0 && rows[2].comments.length === 1 && rows[2].comments[0].text === "这段改成两轮行吗？",
  "the comment hangs on the paragraph its range sits in");
const summary = RTq.summarizeReturn(rows, returnedComments.length);
test.assert(summary.changedParagraphs === 2 && summary.edited === 1 && summary.added === 1 && summary.removed === 0,
  "the summary counts the other side's touch as the windoid's one line says it");
test.assert(summary.comments === 1, "the summary counts the notes");
test.assert(RTq.summarizeReturn(RTq.alignParagraphs(
  [{ id: "a", text: "只有一段" }, { id: "b", text: "被删的一段" }],
  [{ id: "c", text: "只有一段" }]
)).removed === 1, "a paragraph the reviewer dropped counts as removed");

// --- 5. the loader's own order: engine first, UI installs its mark -------------
const uiCtx = makeContext();
loadScripts(uiCtx, ["app/vendor/clioworks-v3/manuscript-roundtrip.js", "app/features/manuscript-roundtrip.js"]);
test.assert(
  vm.runInContext(
    "typeof AISystem6ManuscriptRoundTripUI.openSendReview === 'function'"
    + " && typeof AISystem6ManuscriptRoundTripUI.openReturnImport === 'function'"
    + " && AISystem6ManuscriptRoundTripUILoaded === true",
    uiCtx
  ),
  "the UI module installs openSendReview/openReturnImport and its own Loaded mark"
);
test.assert(
  read("app/core/config.js").includes('"AISystem6ManuscriptRoundTripUILoaded", ["app/vendor/clioworks-v3/manuscript-roundtrip.js", "app/features/manuscript-roundtrip.js"]'),
  "config.js's loader waits for the UI file's mark, the two-file loader rule"
);
const manifest = read("tooling/runtime-manifest.mjs");
test.assert(manifest.includes('"app/vendor/clioworks-v3/manuscript-roundtrip.js"') && manifest.includes('"app/features/manuscript-roundtrip.js"'),
  "both round-trip files are declared lazy in the runtime manifest");
test.assert(read("app/data/menus.js").includes('menuItem("send-manuscript-review"'), "the File menu carries the 送审 row");

test.finish();
