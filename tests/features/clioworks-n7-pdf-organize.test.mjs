// ClioWorks N7 contract: Reader organizes PDF pages and lifts a table out of
// one. Executes real code: the vendored @cantoo/pdf-lib UMD build and the
// organizing model run together in one vm realm against the real corpus PDFs
// (F01–F04), the way the browser runs them in one realm. The static pins
// guard the lazy wiring those runs depend on.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { coreFiles, lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("clioworks-n7-pdf-organize");
const packageJson = require("../../package.json");

const modelSource = read("app/core/pdf-organize.js");
const organize = read("app/features/reader-organize.js");
const pages = read("app/features/reader-pages.js");
const reader = read("app/features/reader.js");
const config = read("app/core/config.js");
const exportImport = read("app/features/export-import.js");
const index = read("index.html");

// --- lazy, never in the boot --------------------------------------------------
test.assert(lazyRuntimePaths.includes("app/core/pdf-organize.js"), "the organizing model is a lazy runtime path");
test.assert(lazyRuntimePaths.includes("app/features/reader-organize.js"), "the organize view is a lazy runtime path");
test.assert(!coreFiles.includes("app/core/pdf-organize.js") && !coreFiles.includes("app/features/reader-organize.js"), "neither organize file is a core (boot) file");
test.assert(!index.includes("reader-organize") && !index.includes("pdf-organize"), "index.html never names the organize modules");
test.assert(
  /createLazyModuleLoader\("AISystem6ReaderOrganize",\s*\["app\/core\/pdf-organize\.js",\s*"app\/features\/reader-organize\.js"\]\)/.test(config),
  "one loader brings the model and the view in together",
);
test.assert(config.includes("styles.reader-organize.css") === false, "no second sheet: the organize view rides the reader-pages sheet");

// --- the vendored pdf-lib -------------------------------------------------------
const PDF_LIB_VERSION = "2.11.1";
const PDF_LIB_SHA256 = "2294a0bb8742d8948ae2d49a60cb6a3600c0b5deae6de198e57fb368d1b79ba9";
const pdfLibBytes = readFileSync(resolveProjectPath("app/vendor/pdf-lib/pdf-lib.min.js"));
const pdfLibHash = createHash("sha256").update(pdfLibBytes).digest("hex");
test.assert(pdfLibBytes.length > 500000, "the vendored pdf-lib build is present");
test.assert(pdfLibHash === PDF_LIB_SHA256, `the vendored bytes are @cantoo/pdf-lib ${PDF_LIB_VERSION} exactly as recorded`);
test.assert(statSync(resolveProjectPath("app/vendor/pdf-lib/LICENSE")).size > 0, "the MIT licence text travels with the vendored build");
test.assert(
  !JSON.stringify(packageJson.dependencies ?? {}).includes("pdf-lib")
  && !JSON.stringify(packageJson.devDependencies ?? {}).includes("pdf-lib"),
  "pdf-lib stays vendored: package.json never gains the dependency",
);
test.assert(
  /const pdfLibBrowserPath = "\/app\/vendor\/pdf-lib\/pdf-lib\.min\.js";/.test(organize)
  && /function getBrowserPdfLib\(\)/.test(organize),
  "the lazy consumer owns the vendored pdf-lib loader, the way the feature owns its engine",
);
test.assert(!exportImport.includes("pdf-lib"), "the eager import half carries no pdf-lib cost");
test.assert(organize.includes("getBrowserPdfJs()") && !exportImport.includes("getBrowserPdfLib"), "thumbnails still ride the shared pdf.js loader; the eager half carries no pdf-lib cost");
test.assert(modelSource.includes("useObjectStreams: false") && modelSource.includes("updateMetadata: false"), "assembly saves a classic xref on a document loaded without touching its metadata");

// --- the real model runs on the real corpus PDFs ---------------------------------
// pdf-lib and the model share ONE vm realm: pdf-lib's cross-realm Array check
// rejects arrays built outside, and the browser has a single realm too.
const sandbox = { setTimeout, clearTimeout, queueMicrotask, console };
vm.runInNewContext(read("app/vendor/pdf-lib/pdf-lib.min.js"), sandbox);
vm.runInNewContext(modelSource, sandbox);
const PDFLib = sandbox.PDFLib;
const M = sandbox.AISystem6PdfOrganize;
test.assert(typeof M.assemblePdf === "function" && typeof M.inferTable === "function", "the model installs in a bare vm realm");

const corpus = (id) => new Uint8Array(readFileSync(resolveProjectPath(`tests/fixtures/real-corpus/pdf/${id}.pdf`)));
const pageCountOf = async (bytes) => (await PDFLib.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })).getPageCount();
const rotationOfFirstPage = async (bytes) => {
  const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  return doc.getPage(0).getRotation().angle;
};

for (const id of ["F01", "F02", "F03", "F04"]) {
  const bytes = corpus(id);
  const total = await pageCountOf(bytes);
  test.assert(total > 1, `${id} opens with pdf-lib (${total} pages)`);

  // Rotate the first page a full circle back to 0 through the model.
  let plan = M.createPlan(total);
  M.rotatePages(plan, [0], 1);
  M.rotatePages(plan, [0], 1);
  M.rotatePages(plan, [0], 1);
  M.rotatePages(plan, [0], 1);
  let out = await M.assemblePdf(PDFLib, bytes, plan);
  test.assert((await pageCountOf(out.bytes)) === total, `${id}: four quarter-turns keep all ${total} pages`);
  test.assert((await rotationOfFirstPage(out.bytes)) === 0, `${id}: four quarter-turns rotate the first page back to 0`);

  // One deletion and one reorder: the surviving pages come out in plan order.
  plan = M.createPlan(total);
  M.deletePages(plan, [0]);
  M.movePage(plan, 0, total - 1);
  out = await M.assemblePdf(PDFLib, bytes, plan);
  const moved = await PDFLib.PDFDocument.load(out.bytes, { updateMetadata: false, ignoreEncryption: true });
  test.assert(moved.getPageCount() === total - 1, `${id}: deleting page 1 shortens the document to ${total - 1} pages`);
  test.assert(out.incremental && M.startsWithBytes(out.bytes, bytes), `${id}: a deletion and a reorder are appended as an incremental update; the original bytes stay a prefix`);
  const sourceRefs = (await PDFLib.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })).getPages().map((page) => page.ref.objectNumber);
  const wantedOrder = plan.entries.filter((entry) => !entry.deleted).map((entry) => sourceRefs[entry.source - 1]);
  test.assert(JSON.stringify(moved.getPages().map((page) => page.ref.objectNumber)) === JSON.stringify(wantedOrder), `${id}: the kept pages come out in plan order`);
  test.assert(M.planSummary(plan).delete === 1 && M.planSummary(plan).reorder === total - 1, `${id}: the summary counts the deletion and the displaced pages`);
}

// --- the incremental-save property, checked not assumed ---------------------------
// Saves are incremental updates (owner ruling SUITE-2); the save path still
// measures the prefix and keeps the original bytes as a backup if it ever fails.
const f01 = corpus("F01");
const untouchedPlan = M.createPlan(await pageCountOf(f01));
const untouched = await M.assemblePdf(PDFLib, f01, untouchedPlan);
test.assert(M.startsWithBytes(untouched.bytes, f01) === untouched.incremental, "assemblePdf reports exactly what startsWithBytes measures");
const prefixes = [];
for (const id of ["F01", "F02", "F03", "F04"]) {
  const bytes = corpus(id);
  const plan = M.createPlan(await pageCountOf(bytes));
  M.rotatePages(plan, [0], 1);
  prefixes.push((await M.assemblePdf(PDFLib, bytes, plan)).incremental);
}
test.assert(
  prefixes.every((held) => typeof held === "boolean"),
  `every save reports its own prefix property on F01–F04 (held: ${prefixes.join(", ")})`,
);
test.assert(prefixes.every((held) => held === true), "a rotation is appended incrementally on every corpus PDF");
test.assert(M.startsWithBytes(f01, f01.slice(0, 5)) && f01[0] === 0x25, "the prefix probe itself reads real bytes (%PDF-)");
test.assert(/s\.backup = pdfFileFrom\(s\.originalBytes/.test(organize), "a save that is not incremental keeps the original bytes as a backup file");
test.assert(organize.includes("startsWithBytes(result.bytes, s.originalBytes)") && organize.includes("saved_rewritten"), "存储 tells the writer honestly when the file was rewritten whole");

// --- undo rides the shared edit history -------------------------------------------
vm.runInNewContext(read("app/core/edit-history.js"), sandbox);
const plan = M.createPlan(3);
let live = plan;
const history = sandbox.AISystem6EditHistory.createEditHistory({
  read: () => M.clonePlan(live),
  write: (snapshot) => { live = snapshot; },
  equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});
history.change("旋转页面", () => M.rotatePages(live, [1], 1));
test.assert(live.entries[1].rotation === 90, "a recorded rotate turns the page");
history.undo();
test.assert(live.entries[1].rotation === 0 && history.canRedo(), "the shared history's undo writes the plan back");
history.redo();
test.assert(live.entries[1].rotation === 90, "and redo turns it again");

// --- the table inference on recorded text items ------------------------------------
const fixture = JSON.parse(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/pdf/F03-text-items.json"), "utf8"));
// F03's cover (the literal page 1) carries five title lines and no table.
const cover = M.inferTable(fixture.page1, { x: 0, y: 0, width: 595.35, height: 842 });
test.assert(cover.columns === 1 && cover.rows.length === 5 && cover.rows.every((cells) => cells.length === 1 && cells[0]), "the cover reads as five single-cell rows");

// The 报表目录 band on the same document's page 5 is the table the writer drags.
const band = M.inferTable(fixture.page5, { x: 40, y: 133, width: 520, height: 175 });
test.assert(band.columns === 7, `the catalog band clusters into 7 columns (got ${band.columns})`);
test.assert(band.rows.length >= 6, `the catalog band reads ${band.rows.length} rows`);
const header = band.rows[0];
test.assert(header[0] === "表号" && header[1] === "报表名称" && header[4] === "报送单位" && header[6] === "页码", "the header row lands in its own columns");
const first = band.rows.find((cells) => String(cells[0] || "").startsWith("ISJY01"));
test.assert(!!first, "the ISJY01 row is found");
test.assert(first[1] === "普通高等教育基本情况" && first[2] === "年报", "the row's name and period land in their columns");
test.assert(first[3] === "中央、 地方属普 通高等学校", "a wrapped cell reads line by line");
const section = band.rows.find((cells) => cells[0] === "（一）教育");
test.assert(!!section && section.some((cell) => cell === null), "a cell nothing lands in stays null — the window shows 尚未识别");
test.assert(band.rows.every((cells) => cells.length === band.columns), "every row is exactly as wide as the grid");
const quoted = M.tableToCsv([["a,b", 'say "hi"'], [null, "d"]]);
test.assert(quoted === '"a,b","say ""hi"""\r\n,d', "the CSV quotes what it must and keeps 未识别 cells empty");

// Columns finish one before the next: an interleaved item joins by center, never splits a column.
const interleaved = M.inferTable(
  [
    { str: "a1", x: 0, y: 0, width: 10, height: 10 },
    { str: "b1", x: 50, y: 0, width: 10, height: 10 },
    { str: "a2", x: 0, y: 20, width: 10, height: 10 },
    { str: "b2", x: 50, y: 20, width: 10, height: 10 },
  ],
  { x: -5, y: -5, width: 70, height: 40 },
);
test.assert(interleaved.columns === 2 && interleaved.rows.length === 2 && interleaved.rows[1][0] === "a2" && interleaved.rows[1][1] === "b2", "two clean columns stay two under the pdfcraft rule");
const blank = M.inferTable([{ str: "  ", x: 0, y: 0, width: 10, height: 10 }], { x: 0, y: 0, width: 50, height: 50 });
test.assert(blank.columns === 0 && blank.rows.length === 0, "whitespace alone is no table");

// --- the window wiring ---------------------------------------------------------------
test.assert(pages.includes('["organize", "reader_pages_view_organize"]'), "the view switch carries 整理 beside 原页 and 文字");
test.assert(/choice\.view === "organize"/.test(pages) && pages.includes("await ensureReaderOrganizeModule()"), "choosing 整理 loads the organize module through its loader");
test.assert(pages.includes("window.AISystem6ReaderOrganize?.teardown()"), "leaving the view tears the organize session down");
test.assert(pages.includes('t("reader_pages_table_extract")') && pages.includes("beginTableExtraction"), "the 原页 bar arms the rectangle through the organize module");
test.assert(reader === read("app/features/reader.js") && !reader.includes("AISystem6ReaderPdfSource"), "Reader itself carries no organize cost; the lazy module reaches the session map in the shared scope");
test.assert(organize.includes("readerPdfSources.set(`\${activeProjectId}::\${s.fileName}`, file)"), "存储 swaps the Reader session's File in place, still never stored");
test.assert(read("app.js").includes("readerPdfSources.set(`${importProjectId}::${mountedName}`, file)"), "the N1 floppy-import line is untouched");
test.assert(organize.includes("AISystem6EditHistory.createEditHistory"), "the organize view builds its history on the shared edit kernel");
test.assert(organize.includes('registerEditHistory("reader"'), "the grid's history is the Reader window's editor while it is open");
test.assert(organize.includes('makeFromSource') && organize.includes('tableToCsv'), "在 ClioChart 打开 goes through the registry's makeFromSource path with the CSV");
test.assert(organize.includes("insertFilesIntoFileFloppy") && organize.includes("getMountedTextDiskChunks"), "a mounted File Floppy is offered the copy through the dropped-file import path");
test.assert(organize.includes("AISystem6WebPlatform?.saveArtifact"), "downloads go through the platform's saveArtifact");

// --- strings: the normal t() path, both translation files ----------------------------
const tables = {};
for (const [lang, file] of [["En", "app/data/translations-en.js"], ["Zh", "app/data/translations-zh.js"]]) {
  const box = { window: {} };
  vm.runInNewContext(read(file), box);
  tables[lang] = box.window[`AISystem6Translations${lang}`];
}
const used = [...`${modelSource === organize ? "" : ""}${organize}${pages}`.matchAll(/\bt\("(reader_[a-z_]+)"/g)].map((match) => match[1]);
test.assert(used.includes("reader_organize_summary") && used.includes("reader_organize_unrecognized"), "the summary and the 未识别 marker are real keys");
test.assert(
  used.every((key) => key in tables.En && key in tables.Zh),
  `every reader_* string both windows use is in both translation files (${new Set(used).size} keys)`,
);
test.assert(tables.Zh.reader_pages_view_organize === "整理", "the Chinese organize label is 整理");
test.assert(tables.Zh.reader_pages_table_extract === "提取表格", "the Chinese extract label is 提取表格");
test.assert(tables.Zh.reader_organize_unrecognized === "尚未识别", "an unreadable cell is 尚未识别, never a confidence score");
test.assert(tables.Zh.reader_organize_summary(1, 1, 1) === "旋转 1 · 删除 1 · 重排 1", "the bottom bar reads 旋转 1 · 删除 1 · 重排 1");
test.assert(tables.En.reader_organize_summary(1, 1, 1) === "Rotate 1 · Delete 1 · Reorder 1", "the English bar names all three counts");
test.assert(tables.Zh.reader_organize_copy_name("报告") === "报告（整理）.pdf", "a copy keeps the original name with a 整理 mark");

test.finish();
