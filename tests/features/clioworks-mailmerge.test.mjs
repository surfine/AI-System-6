// ClioWorks 邮件合并 contract: the minimal merge loop — one template, one
// data source, one clean .docx per row — on the real code paths.
//   - the engine (features/clioworks-mailmerge.js) headless in a bare VM with
//     the REAL markdown lexer, the REAL word-export generator and the REAL
//     CSV parser beside it: placeholder scanning (成对/缺列/嵌套/未闭合),
//     row instantiation (exact column match, a missing column kept verbatim
//     and named), first-row-is-names grids (unnamed and duplicate columns),
//     the 「<模板名>-<行主键或序号>.docx」 naming, and the produced .docx
//     unzipped with DecompressionStream — the replacement values are in the
//     package, the missing placeholder still is not replaced;
//   - both data sources: a real ledger-adapter workbook session (the N11
//     fixture) read through its own copyRegion (选区) and through the CSV
//     module's sheet writer + parser (整表), and a CSV File read by the same
//     decode/delimiter/parse chain the workbook's import uses;
//   - the store path: every row lands through createProjectDocument in the
//     「邮件合并」 folder, one download per stored file, nothing half stored;
//   - 合并到打印: the confirm carries the copy count, every copy renders
//     into the hidden print stack, the N2b body class goes on and ONE print
//     call is made — the one-road trade-off the spec allowed;
//   - the manuscript is never touched: the same merge over the real editor
//     surface's live adapter leaves undo empty and every paragraph as it was
//     — generation is file creation, not a manuscript edit.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import { createQuireEditorVm } from "../helpers/quire-editor-vm.mjs";

const test = createFeatureTest("clioworks-mailmerge");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

const tStub = (ctx) => { ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key); };

// --- unzip with DecompressionStream, not trust (the N14 reader) -----------
async function inflateRaw(payload) {
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
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

// --- the desk: the real lexer, generator, CSV reader and merge engine ------
const deskCtx = makeContext();
tStub(deskCtx);
deskCtx.File = File;   // csvGrid reads a chosen File the way the picker hands one over
deskCtx.escapeHtml = (value) => String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
loadScripts(deskCtx, [
  "app/vendor/marked.umd.js",
  "app/core/markdown.js",
  "app/features/word-export.js",
  "app/features/clio-chart-csv.js",
  "app/features/clioworks-mailmerge.js",
]);
const MM = deskCtx.AISystem6ClioworksMailMerge;
test.assert(!!MM && Object.isFrozen(MM), "the merge engine installs a frozen API in a bare VM");
test.assert(deskCtx.AISystem6ClioworksMailMergeLoaded === true, "the module sets its own loader mark");

// --- 1. placeholder scanning -------------------------------------------------
test.assert(JSON.stringify(MM.parsePlaceholders("致「«姓名»」：您的 «金额» 发票已开，«姓名» 收。"))
  === JSON.stringify([{ name: "姓名", count: 2 }, { name: "金额", count: 1 }]),
  "paired guillemets parse by exact column name, repeats counted, order of first appearance kept");
test.assert(JSON.stringify(MM.parsePlaceholders("«未闭合")) === "[]"
  && JSON.stringify(MM.parsePlaceholders("«»")) === "[]",
  "an unterminated « and an empty «» are not placeholders");
test.assert(JSON.stringify(MM.parsePlaceholders("«a«b»c»")) === JSON.stringify([{ name: "b", count: 1 }]),
  "a nested «a«b»c» is not one big name: the scan resumes at the inner « and pairs «b»");

// --- 2. rows → table (first row is the names) --------------------------------
const csvText = "姓名,金额,备注,姓名\n张三,120,首行,\"同名列\"\n李四,,第二行,也是\n\n";
const csv = deskCtx.AISystem6ClioChartCsv;
const csvTable = MM.gridToTable(csv.parseCsv(csvText, csv.delimiterFor("名单.csv", csvText)));
test.assert(JSON.stringify(csvTable.columns) === JSON.stringify(["姓名", "金额", "备注"]),
  "the header row names the columns; an unnamed cell and a duplicate name cannot be addressed");
test.assert(csvTable.records.length === 2 && JSON.stringify(csvTable.records[0]) === JSON.stringify(["张三", "120", "首行", "同名列"]),
  "data rows keep every cell by position (a duplicate name's cells still ride their row)");
test.assert(MM.gridToTable([]).records.length === 0 && MM.gridToTable(null).records.length === 0,
  "an empty grid has no rows and no columns");

// --- 3. instantiation --------------------------------------------------------
const template = "致「«姓名»」：您 «金额» 元的发票已开，«缺列» 原样，«名» 不猜。";
const first = MM.instantiate(template, csvTable, csvTable.records[0]);
test.assert(first.text === "致「张三」：您 120 元的发票已开，«缺列» 原样，«名» 不猜。",
  "placeholders become their row's cell text — exact name match only, a partial name never guesses");
test.assert(JSON.stringify(first.missing) === JSON.stringify(["缺列", "名"]),
  "a placeholder with no column stays exactly as typed and is named, in order");
const second = MM.instantiate(template, csvTable, csvTable.records[1]);
test.assert(second.text.includes("致「李四」：您  元的发票已开"),
  "an empty cell becomes empty text, not a placeholder left behind");

// --- 4. naming ---------------------------------------------------------------
test.assert(MM.fileNameFor("采访函", ["张三", "120"], 0) === "采访函-张三.docx",
  "a row's file is 「<模板名>-<第一列>.docx」");
test.assert(MM.fileNameFor("采访函", ["", "1"], 1) === "采访函-2.docx",
  "a row whose first cell is empty falls back to its 1-based number");
test.assert(MM.fileNameFor("a/b:c*d?", ["x\\y|z\"<>"], 0) === "a-b-c-d-x-y-z.docx",
  "filename-illegal characters fold to dashes in both halves");
test.assert(MM.fileNameFor("", ["张三"], 0) === "文稿-张三.docx", "a template with no name still names its files");

// --- 5. the ClioWrite body as template Markdown ------------------------------
const blocks = [
  { kind: "paragraph", text: "致 «姓名»", headingLevel: 1 },
  { kind: "paragraph", text: "「«城市»」的读者：", headingLevel: 0 },
  { kind: "paragraph", text: "一期 «期数»", headingLevel: 0, list: { kind: "bullet", level: 0 } },
  { kind: "paragraph", text: "合订本", headingLevel: 0, list: { kind: "number", level: 1 } },
  { kind: "table", rows: [[{ text: "«姓名»" }, { text: "两行|竖线" }], [{ text: "甲" }]] },
  { kind: "other", text: "a read-only object stays out" },
];
const markdown = MM.templateMarkdownFromBlocks(blocks);
test.assert(markdown.includes("# 致 «姓名»"), "a heading keeps its level");
test.assert(markdown.includes("- 一期 «期数»") && markdown.includes("  1. 合订本"),
  "lists keep their bullet/number and their indent");
test.assert(markdown.includes("| «姓名» | 两行/竖线 |") && markdown.includes("| --- | --- |") && markdown.includes("| 甲 |  |"),
  "a table becomes a GFM grid: pipes folded, ragged rows padded");
test.assert(!markdown.includes("read-only object"), "blocks that are not paragraphs or tables stay out of the template");

// --- 6. both data sources: a real workbook session, and a CSV File ----------
const XLSX = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/budget-s11.xlsx")));
const SHEET = "预算";
{
  const ctx = makeContext();
  tStub(ctx);
  ctx.escapeHtml = deskCtx.escapeHtml;
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/features/clio-chart-workbook.js", "app/features/clio-chart-csv.js", "app/features/clioworks-mailmerge.js"]);
  ctx.__bytes = XLSX;
  const led = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: '预算.xlsx' })", ctx);
  const session = ctx.AISystem6ClioChartWorkbook.createSession(led, { fileName: "预算.xlsx", mountedName: "预算.xlsx", host: null, confirmList: () => "cancel", alertFailure: () => {} });
  led.setCell(SHEET, "A1", { value: "姓名" });
  led.setCell(SHEET, "B1", { value: "城市" });
  led.setCell(SHEET, "A2", { value: "张三" });
  led.setCell(SHEET, "B2", { value: "杭州" });
  led.setCell(SHEET, "A3", { value: "李四" });
  led.setCell(SHEET, "B3", { value: "苏州" });

  session.select(0, 0);
  session.select(1, 1, true);
  const picked = MM.workbookGrid(session, { whole: false });
  const pickedTable = MM.gridToTable(picked.grid);
  test.assert(picked.range === `${SHEET}!A1:B2` && JSON.stringify(pickedTable.columns) === JSON.stringify(["姓名", "城市"])
    && JSON.stringify(pickedTable.records) === JSON.stringify([["张三", "杭州"]]),
    "选区 reads the mounted session's own copyRegion: names and rows exactly as frozen");

  const whole = MM.workbookGrid(session, { whole: true });
  const wholeTable = MM.gridToTable(whole.grid);
  test.assert(wholeTable.records.length > pickedTable.records.length
    && wholeTable.columns.length > pickedTable.columns.length
    && wholeTable.records[1][0] === "李四" && wholeTable.records[1][1] === "苏州",
    "整表 reads every sheet row through the CSV module's own writer + parser, not a copy of the selection");
  test.assert(MM.workbookGrid(null, { whole: false }).reason === "no-session"
    && MM.workbookGrid({ copyRegion: () => null }).reason === "no-selection",
    "a missing session or an empty selection is a named reason, never a guessed table");
}
{
  const file = new File(["姓名,城市\r\n张三,\"有,逗号\"\r\n"], "名单.csv");
  const out = await MM.csvGrid(file);
  const table = MM.gridToTable(out.grid);
  test.assert(out.label === "名单.csv" && JSON.stringify(table.columns) === JSON.stringify(["姓名", "城市"])
    && table.records[0][1] === "有,逗号",
    "a CSV File rides the same decode/delimiter/parse chain as the workbook's own import (RFC 4180 quoting intact)");
}

// --- 7. the plan, and the .docx through the real word-export pipeline -------
const plan = MM.planMerge({ markdown: template, templateName: "采访函", table: csvTable });
test.assert(plan.rows.length === 2
  && plan.rows[0].fileName === "采访函-张三.docx" && plan.rows[0].markdown.includes("致「张三」"),
  "the plan names every row's file and carries its instantiated Markdown");
test.assert(JSON.stringify(plan.missingColumns) === JSON.stringify(["缺列", "名"]),
  "the plan says once which placeholders no column answers — the report line's own fact");

const bytes = await MM.buildRowBytes({ markdown: plan.rows[0].markdown, pageSetup: MM.pageSetupFromGeometry({ widthCm: 21, heightCm: 29.7, margins: { top: 2.5, bottom: 2.5, left: 3, right: 3 } }), title: "采访函", language: "zh" });
const parts = await readDocxParts(bytes);
test.assert(parts.has("word/document.xml") && parts.has("[Content_Types].xml"), "the row's file is a real OPC package");
const documentXml = parts.get("word/document.xml");
test.assert(documentXml.includes("致「张三」") && documentXml.includes("120"),
  "the body carries the row's replacement values");
test.assert(documentXml.includes("«缺列»") && !documentXml.includes("«姓名»"),
  "a missing column's placeholder reaches the document exactly as typed — and a replaced one leaves no guillemet behind");

// --- 8. the store path: every row one file in 邮件合并, one download each ---
const stored = [];
const downloads = [];
deskCtx.AISystem6NativeBinaries = {
  createProjectDocument: async ({ name, folderName, format, bytes: fileBytes }) => {
    stored.push({ name, folderName, format, bytes: fileBytes });
    return { id: `file-${stored.length}`, name, type: "office" };
  },
};
deskCtx.AISystem6WebPlatform = { saveArtifact: (call) => downloads.push(call) };
const storeOut = await MM.storeDocuments({ plan, projectId: "p-1", templateName: "采访函", language: "zh" });
test.assert(storeOut.status === "ok" && storeOut.stored.length === 2, "every row stores, one document each");
test.assert(stored.map((entry) => entry.name).join(",") === "采访函-张三.docx,采访函-李四.docx"
  && stored.every((entry) => entry.folderName === MM.FOLDER_NAME && entry.format === "docx" && entry.bytes instanceof Uint8Array && entry.bytes.length > 0),
  `each file is stored in the 「${MM.FOLDER_NAME}」 folder as a non-empty docx`);
test.assert(downloads.length === 2 && downloads.every((call) => call.fileName.startsWith("采访函-") && call.fileName.endsWith(".docx")),
  "each stored file is offered as its own download — one per row, not a bundle");

// --- 9. 合并到打印: the count is confirmed, one road, one stack -------------
{
  const v = await createQuireEditorVm({ docx: new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx"))) });
  const w = v.window;
  loadVmIntoEditor(v);
  const merge = w.AISystem6ClioworksMailMerge;
  const asked = [];
  let printed = 0;
  w.print = () => { printed += 1; };
  w.markdownToSystemHtml = (md) => `<p>${md}</p>`;
  const out = await merge.printMerged({
    plan,
    doConfirm: (message) => { asked.push(message); return "yes"; },
    doPrint: () => { printed += 1; },
  });
  test.assert(out.status === "ok" && out.copies === 2, "the print flow answers ok with the copy count");
  test.assert(asked.length === 1 && asked[0] === "clioworks_mail_merge_print_confirm:2",
    "the confirm says the number of copies before anything prints");
  test.assert(printed === 1, "ONE print call prints the whole stack — the one-road trade-off, not a dialog per copy");
  const stack = v.document.querySelector("#cw-mailmerge-print");
  test.assert(!!stack && stack.querySelectorAll(".cw-mailmerge-copy").length === 2
    && stack.querySelectorAll(".cw-mailmerge-copy")[0].innerHTML.includes("致「张三」"),
    "every copy is rendered into the hidden print stack in row order");
  test.assert(v.document.body.classList.contains("is-cw-mailmerge-printing"),
    "the N2b-style body class routes the paper: only the stack reaches the printer");
  const cancelled = await merge.printMerged({ plan, doConfirm: () => "cancel", doPrint: () => { printed += 1; } });
  test.assert(cancelled.status === "cancelled" && printed === 1,
    "a refused confirm prints nothing and adds no second call");
  const fallback = await merge.printMerged({ plan, doConfirm: () => true });
  test.assert(fallback.status === "ok" && printed === 2,
    "without an injected printer the browser's own window.print() is the one road it takes");
}

// --- 10. the manuscript is never touched -------------------------------------
{
  const v = await createQuireEditorVm({ docx: new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx"))) });
  const w = v.window;
  loadVmIntoEditor(v);
  const api = w.AISystem6ClioWrite;
  const merge = w.AISystem6ClioworksMailMerge;
  const mounted = await api.open(v.record, {});
  test.assert(mounted.ok, "(setup) the document is mounted in the editor VM");
  const adapter = v.record.liveAdapter;
  const before = adapter.paragraphs().map((p) => p.text);
  const storedHere = [];
  w.AISystem6NativeBinaries.createProjectDocument = async ({ name, bytes }) => { storedHere.push({ name, bytes }); return { id: name, name, type: "office" }; };
  w.AISystem6WebPlatform = { saveArtifact: () => true };
  const bodyTable = merge.gridToTable(w.AISystem6ClioChartCsv.parseCsv("姓名\n张三\n李四\n", ","));
  const bodyPlan = merge.planMerge({
    markdown: merge.templateMarkdownFromBlocks(adapter.blocks()),
    templateName: "正文模板",
    table: bodyTable,
  });
  test.assert(bodyPlan.rows.length === 2 && bodyPlan.rows.some((row) => row.fileName === "正文模板-张三.docx"),
    "the live editor's own blocks become the template (every row of the source, files named by key)");
  const undoBefore = api.editHistory().canUndo();
  const out = await merge.storeDocuments({ plan: bodyPlan, projectId: "p-1", templateName: "正文模板", language: "zh" });
  test.assert(out.status === "ok" && storedHere.length === 2, "(setup) the merge stored its files against the live surface");
  test.assert(api.editHistory().canUndo() === undoBefore && undoBefore === false,
    "generation adds no undo step — file creation is not a manuscript edit");
  test.assert(JSON.stringify(adapter.paragraphs().map((p) => p.text)) === JSON.stringify(before),
    "every paragraph is exactly as it was: the merge read the body and wrote files, never the model");
}

/** Load the merge package into an editor VM the way its own loader orders it. */
function loadVmIntoEditor(v) {
  v.context.escapeHtml = (value) => String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  v.load(["app/vendor/marked.umd.js", "app/core/markdown.js", "app/features/word-export.js", "app/features/clio-chart-csv.js", "app/features/clioworks-mailmerge.js"]);
}

// --- 11. the wiring: the loader's own order, the menu row, both languages ---
test.assert(
  read("app/core/config.js").includes('"AISystem6ClioworksMailMergeLoaded", ["app/vendor/marked.umd.js", "app/features/word-export.js", "app/features/clio-chart-csv.js", "app/features/clioworks-mailmerge.js"]'),
  "config.js's loader brings the lexer, the generator, the CSV reader and the module in that order, waiting for the module's own mark"
);
const manifest = read("tooling/runtime-manifest.mjs");
test.assert(manifest.includes('"app/features/clioworks-mailmerge.js"'), "the module is declared lazy in the runtime manifest");
const write = read("app/features/clio-write.js");
test.assert(write.includes("'clio-write-mail-merge': ['file.mail-merge', '', 'clioworks_mail_merge_menu']")
  && write.includes("menuRow('clio-write-mail-merge')"),
  "ClioWrite's 文件 menu carries the 邮件合并 row");
test.assert(write.includes("if (id === 'file.mail-merge') return openMailMerge();")
  && write.includes("case 'file.mail-merge':"),
  "the row dispatches through the surface and greys on its own precondition (a body)");
test.assert(write.includes("'插入邮件合并占位符': 'clio_write_step_mail_merge_field'"),
  "a clicked column name inserts as ONE named undo step");
const sheet = read("apps/desktop/styles/84-clio-write.css");
test.assert(sheet.includes("body.is-cw-mailmerge-printing > *:not(#cw-mailmerge-print)")
  && sheet.includes("#cw-mailmerge-print .cw-mailmerge-copy {\n    break-after: page;\n  }"),
  "the print sheet routes only the stack to the paper, one page break per copy");
for (const lang of ["en", "zh"]) {
  const ctx = { window: {} };
  vm.runInNewContext(read(`app/data/translations-${lang}.js`), ctx);
  const table = Object.values(ctx.window)[0];
  const keys = [
    "clioworks_mail_merge_menu", "clioworks_mail_merge_title", "clioworks_mail_merge_workbook_label",
    "clioworks_mail_merge_workbook_plain", "clioworks_mail_merge_workbook_selection", "clioworks_mail_merge_workbook_sheet",
    "clioworks_mail_merge_source_csv", "clioworks_mail_merge_choose", "clioworks_mail_merge_rows",
    "clioworks_mail_merge_columns", "clioworks_mail_merge_no_placeholders", "clioworks_mail_merge_missing_columns",
    "clioworks_mail_merge_columns_ok", "clioworks_mail_merge_preview", "clioworks_mail_merge_store_to",
    "clioworks_mail_merge_generate", "clioworks_mail_merge_print", "clioworks_mail_merge_print_confirm",
    "clioworks_mail_merge_print_failed", "clioworks_mail_merge_generated", "clioworks_mail_merge_generate_failed",
    "clioworks_mail_merge_no_source", "clioworks_mail_merge_source_failed", "clioworks_mail_merge_no_document",
    "clioworks_mail_merge_need_caret", "clioworks_mail_merge_reason_no_session", "clioworks_mail_merge_reason_no_selection",
    "clioworks_mail_merge_reason_no_adapter", "clioworks_mail_merge_reason_read_failed",
    "clio_write_step_mail_merge_field",
  ];
  const missing = keys.filter((key) => table[key] == null);
  test.assert(missing.length === 0, `${lang}: every mail-merge string is translated${missing.length ? ` — missing ${missing.join(", ")}` : ""}`);
}

test.finish();
