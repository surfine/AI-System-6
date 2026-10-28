// ClioWorks N15b contract: the small daily things.
//   - The old-format gate: a .doc/.xls/.ppt (and .wps/.et/.dps) is detected by
//     name and by its OLE2 magic bytes (D0 CF 11 E0 A1 B1 1A E1), and the
//     batch notice is the real Chinese copy — one full sentence for one file,
//     a header/lines/tail list for several — so a 97–2003 drop says what
//     happened and what to do instead of mounting garbage text.
//   - CSV in: RFC 4180 quoting (commas and newlines inside quotes, "" escape),
//     UTF-8 with or without BOM, GB18030 when UTF-8 sprouts replacement
//     characters; a plain decimal becomes a number while 00123, an 18-digit ID
//     number and a date stay text; the rows become a REAL .xlsx through the
//     Ledger model, opened again with the desk's ledger adapter.
//   - CSV out: the current sheet's displayed values — a formula exports its
//     cached result — through saveArtifact, and the file starts with the BOM.
//   - Word count: the mixed zh/en counts, and a Quire document whose deleted
//     revision text takes its columns but not its words.
// The real modules run in vm contexts (one per codec family — Ledger and
// Quire both own the global L); the desk surfaces are stubs.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, desktopRoot } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n15b-small-things");
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const utf8 = (text) => new TextEncoder().encode(text);
const zhTable = (() => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(join(desktopRoot, "app/data/translations-zh.js"), "utf8"), ctx, { timeout: 5000 });
  return ctx.window.AISystem6TranslationsZh;
})();
// The desk's own lookup: the value may be a function (t(key, ...args) calls it).
const t = (key, ...args) => {
  const value = zhTable[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
};

const run = async () => {
  /* ------------------------------------------------ 1. the old-format gate */

  {
    const ctx = makeContext();
    loadScripts(ctx, ["app/features/legacy-formats.js"]);
    const formats = vm.runInContext("AISystem6LegacyFormats", ctx);
    const detect = (name, bytes = null) => formats.detect(name, bytes);

    // By name: the six old families, and none of the readable ones.
    test.assert(detect("年度报告.doc")?.kind === "word", "「年度报告.doc」 reads as Word 97–2003");
    test.assert(detect("预算表.xls")?.kind === "sheet", "「预算表.xls」 reads as Excel 97–2003");
    test.assert(detect("汇报.ppt")?.kind === "slides", "「汇报.ppt」 reads as PowerPoint 97–2003");
    test.assert(detect("文档.wps")?.kind === "wps-text", "「文档.wps」 reads as WPS 文字");
    test.assert(detect("表格.et")?.kind === "wps-sheet", "「表格.et」 reads as WPS 表格");
    test.assert(detect("演示.dps")?.kind === "wps-slides", "「演示.dps」 reads as WPS 演示");
    test.assert(detect("年度报告.docx") === null && detect("预算表.xlsx") === null && detect("notes.txt") === null,
      "readable names (.docx/.xlsx/.txt) are never flagged");

    // By magic bytes: a Word 97–2003 file saved without its extension is still OLE2.
    test.assert(detect("archive.bin", new Uint8Array(OLE2))?.kind === "unknown", "OLE2 bytes under a nameless extension read as legacy Office");
    test.assert(detect("photo.jpg", new Uint8Array([0x00, 0x01, 0x02])) === null, "bytes without the OLE2 header are not flagged");
    test.assert(detect("报表.xlsx", new Uint8Array(OLE2)) === null, "a readable name is never flagged, whatever its bytes");
    test.assert(detect("旧文档", new Uint8Array([...OLE2, 1, 2]))?.kind === "unknown", "an extensionless OLE2 file is flagged (8-byte header is enough)");

    // The notice, in the desk's own Chinese copy.
    test.assert(formats.message([{ name: "年度报告.doc", kind: "word" }], t)
      === t("legacy_format_notice_word", "年度报告.doc"),
      "one flagged file gets the full sentence naming the format and the 另存为 advice");
    const notice = formats.message([{ name: "年度报告.doc", kind: "word" }], t);
    test.assert(notice.includes("「年度报告.doc」") && notice.includes("Word 97–2003") && notice.includes("另存为 .docx"),
      `the single-file notice is the work-order sentence (got: ${notice})`);
    const batch = formats.message([
      { name: "年度报告.doc", kind: "word" },
      { name: "预算表.xls", kind: "sheet" },
    ], t);
    test.assert(batch.startsWith(t("legacy_format_batch_header", 2))
      && batch.includes(t("legacy_format_batch_line", "年度报告.doc", t("legacy_format_kind_word")))
      && batch.includes(t("legacy_format_batch_line", "预算表.xls", t("legacy_format_kind_sheet")))
      && batch.endsWith(t("legacy_format_batch_tail")),
      "a batch of two is ONE notice: a header, one line per file, one tail");
    test.assert(formats.message([], t) === "", "an empty list says nothing");

    // The desk's whole gate in one call: screen, ONE alert, one status line,
    // failure entries into the caller's list, kept files returned.
    const gateFiles = [
      { name: "年度报告.doc", slice: () => ({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer }) },
      { name: "notes.txt", slice: () => ({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer }) },
      { name: "预算表.xls", slice: () => ({ arrayBuffer: async () => new Uint8Array(OLE2).buffer }) },
    ];
    ctx.__alerts = [];
    ctx.__status = [];
    ctx.showSystemModal = (message, kind) => { ctx.__alerts.push([message, kind]); return "ok"; };
    ctx.setStatus = (text) => { ctx.__status.push(text); };
    const gate = vm.runInContext("AISystem6LegacyFormats.gateImportBatch", ctx);
    const failures = [];
    const kept = await gate(gateFiles, t, failures);
    test.assert(kept.length === 1 && kept[0].name === "notes.txt", "the gate returns only the readable files");
    test.assert(gateFiles.length === 1 && gateFiles[0].name === "notes.txt",
      "the caller's batch is shrunk in place, so the import loop never sees the flagged files");
    test.assert(failures.length === 2 && failures[0].name === "年度报告.doc" && failures[1].name === "预算表.xls",
      "each flagged file lands in the caller's failures list, in order");
    test.assert(ctx.__alerts.length === 1 && ctx.__alerts[0][1] === "alert" && ctx.__alerts[0][0] === batch,
      "the whole batch shows ONE alert, and it is the header/lines/tail notice");
    test.assert(ctx.__status.length === 1 && ctx.__status[0] === batch.replace(/\n/g, " "),
      "the status line is the same notice on one line");
  }

  /* --------------------------------------- 2. CSV decode, parse, inference */

  // The Ledger owns the global L in this context; the CSV module rides beside it.
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/features/clio-chart-csv.js"]);
  const csvApi = vm.runInContext("AISystem6ClioChartCsv", ctx);

  {
    // BOM and GB18030.
    const bom = csvApi.decodeText(utf8("\uFEFF中文,b"));
    test.assert(bom.text === "中文,b" && bom.encoding === "utf-8", "a UTF-8 BOM is decoded away, not kept as a first-cell artifact");
    const gb = csvApi.decodeText(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x2c, 0xb2, 0xe2, 0xca, 0xd4]));
    test.assert(gb.text === "中文,测试" && gb.encoding === "gb18030", `GB18030 bytes for 「中文,测试」 decode as GB18030 (got ${JSON.stringify(gb)})`);
    test.assert(csvApi.decodeText(utf8("中文,测试")).text === "中文,测试", "plain UTF-8 decodes as UTF-8 without touching GB18030");

    // RFC 4180 quoting: comma inside quotes, embedded newline, "" escape, no phantom last row.
    const rows = csvApi.parseCsv('a,"b,c"\r\n"d\ne","f""g"\r\n');
    test.assert(JSON.stringify(rows) === JSON.stringify([["a", "b,c"], ["d\ne", 'f"g']]),
      `quotes keep commas, newlines and doubled quotes inside one field (got ${JSON.stringify(rows)})`);
    const unfinished = csvApi.parseCsv('a,b\nc');
    test.assert(unfinished.length === 2, "a last record without its terminator still lands");
    test.assert(csvApi.delimiterFor("x.tsv", "a\tb") === "\t" && csvApi.delimiterFor("x.csv", "a,b") === ",",
      "the delimiter follows the extension");
    test.assert(csvApi.delimiterFor("x", "a\tb") === "\t" && csvApi.delimiterFor("x", "a,b") === ",",
      "an extensionless table sniffs tabs vs commas from its first line");

    // Number vs text: codes, ID numbers and dates stay text; plain decimals become numbers.
    const n = (field) => csvApi.numericValue(field);
    test.assert(n("00123") === null, "00123 keeps its leading zero as text");
    test.assert(n("110101199001011234") === null, "an 18-digit ID number stays text");
    test.assert(n("3.14") === 3.14 && n("-2.5") === -2.5 && n("0") === 0, "plain decimals (and 0) become numbers");
    test.assert(n("2023-01-01") === null && n("50%") === null && n("中文") === null && n("") === null,
      "dates, percents and words are never converted");
    test.assert(n("1234567890123456") === null, "a 16-digit number stays text (the 15 safe digits rule)");
    test.assert(csvApi.sheetNameFor("年度数据.csv") === "年度数据", "the sheet is named after the file");
  }

  /* ------------------------------ 3. the xlsx round trip through the ledger */

  {
    const rows = [
      ["品名", "数值", "备注"],
      ["铅笔", "3.14", "单价"],
      ["编码", "00123", "前导零"],
      ["证件号", "110101199001011234", "长号"],
      ["日期", "2023-01-01", "不转换"],
    ];
    const bytes = await csvApi.buildWorkbookBytes(rows, csvApi.sheetNameFor("年度数据.csv"));
    test.assert(bytes instanceof Uint8Array && bytes.length > 0, "the parsed rows encode into real .xlsx bytes");
    ctx.__bytes = bytes;
    const adapter = await vm.runInContext(`ClioWorksLedgerAdapter.open(globalThis.__bytes.slice(0), { name: "年度数据.xlsx" })`, ctx);
    test.assert(adapter.sheets().length === 1 && adapter.sheets()[0].name === "年度数据", "the workbook opens with ONE sheet named after the file");
    test.assert(adapter.getCell("年度数据", "A1").value === "品名", "the header lands in A1");
    test.assert(adapter.getCell("年度数据", "B2").value === 3.14 && typeof adapter.getCell("年度数据", "B2").value === "number",
      "3.14 opens back as a number");
    test.assert(adapter.getCell("年度数据", "B3").value === "00123", "00123 opens back as text");
    test.assert(adapter.getCell("年度数据", "B4").value === "110101199001011234", "the ID number opens back as exact text");
    test.assert(adapter.getCell("年度数据", "B5").value === "2023-01-01", "the date opens back as text, never auto-converted");
    test.assert(adapter.displayText("年度数据", "A1") === "品名", "displayText reads the ledger cell");
  }

  /* ---------------------------------- 4. CSV export: formula → value + BOM */

  {
    // A workbook with a formula and its cached result, opened through the desk
    // adapter — the mounted-session shape the 导出 command hands over.
    await vm.runInContext(`(async () => {
      const L = await ClioWorksLedgerAdapter.loadCodec();
      const wb = new L.model.Workbook({});
      const sh = wb.addSheet("Sheet1");
      sh.put(0, 0, { v: 10 });
      sh.put(1, 0, { v: 20 });
      sh.put(2, 0, { f: "SUM(A1:A2)", v: 30 });
      globalThis.__formulaBytes = await L.xlsxWrite.bytes(wb, { type: "xlsx" });
    })()`, ctx);
    const adapter = await vm.runInContext(`ClioWorksLedgerAdapter.open(globalThis.__formulaBytes.slice(0), { name: "对比.xlsx" })`, ctx);
    test.assert(adapter.getCell("Sheet1", "A3").formula === "SUM(A1:A2)", "the sheet carries the formula");

    ctx.AISystem6WebPlatform = { saveArtifact: (artifact) => { ctx.__artifact = artifact; return true; } };
    const out = await csvApi.exportSheet({ adapter, sheetName: "Sheet1", fileName: "对比.xlsx" });
    test.assert(out.ok && out.fileName === "对比.csv", "导出 writes a .csv next to the workbook's name");
    // The blob's text() strips a leading BOM by spec — the BYTES are what Excel reads.
    const exported = new Uint8Array(await ctx.__artifact.blob.arrayBuffer());
    test.assert(exported[0] === 0xef && exported[1] === 0xbb && exported[2] === 0xbf,
      "the exported file starts with the UTF-8 BOM (Excel on Windows keeps the Chinese)");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(exported);
    test.assert(text.slice(1) === "10\r\n20\r\n30\r\n", `the exported values are the DISPLAYED ones — the formula exports its 30 (got ${JSON.stringify(text.slice(1))})`);
    test.assert(String(ctx.__artifact.mimeType).startsWith("text/csv"), "the artifact says text/csv");
  }

  /* --------------------------------------------- 5. the word count */

  {
    const ctx3 = makeContext();
    loadScripts(ctx3, ["app/vendor/clioworks-v3/quire-adapter.js", "app/features/clio-write-word-count.js"]);
    const wc = vm.runInContext("AISystem6ClioWriteWordCount", ctx3);

    // The pure counts: CJK characters one each, Latin words by whitespace.
    const counts = wc.summarize(["你好 world，哈哈 123。", "second line"]);
    test.assert(counts.cjk === 4 && counts.latin === 4 && counts.paragraphs === 2,
      `中文字 4（你好哈哈）、英文词 4（world/123/second/line）、段落 2 (got ${JSON.stringify(counts)})`);
    test.assert(wc.countText("abc abc").latin === 2, "Latin words count by whitespace runs");

    // A real Quire document with deleted revision text: the columns stay in
    // the model (the reader's w:del), but the words are not prose yet.
    ctx3.__doc = await vm.runInContext(`(async () => {
      const L = await ClioWorksQuireAdapter.loadCodec();
      const D = L.D;
      const doc = D.newDoc();
      doc.main.blocks.length = 0;
      doc.main.blocks.push(D.para([
        D.text("保留 ", {}),
        D.text("删掉的话", { del: { author: "Reviewer", date: "2026-02-01T09:00:00Z", id: 1 } }),
        D.text("words and more", {}),
      ], {}));
      D.reindex(doc);
      return (await L.docx.write(doc, { format: "docx" })).arrayBuffer();
    })()`, ctx3);
    const opened = await vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__doc, { name: "contract.docx" })`, ctx3);
    const para = opened.paragraphs()[0];
    test.assert(para.text.includes("删掉的话"), "the model keeps the deleted text (so accept/reject still can see it)");
    const whole = wc.counts(opened, null);
    test.assert(whole.selected === false, "no selection counts the whole document");
    test.assert(whole.counts.cjk === 2 && whole.counts.latin === 3 && whole.counts.paragraphs === 1,
      `the deleted 「删掉的话」 takes no words: 中文字 2（保留）、英文词 3（words/and/more）(got ${JSON.stringify(whole.counts)})`);
    test.assert(whole.counts.chars === wc.countText("保留 words and more").chars,
      "the character count is the non-whitespace count of the visible text");

    // A selection inside the paragraph: model offsets, deleted columns included
    // in the span but never in the words. Columns: 保留␣ = 0–3, 删掉的话 = 3–7,
    // words and more = 7–22.
    const caret = { collapsed: false, paragraphs: 1, paragraphId: para.id, paragraphIds: [para.id], from: 0, to: 7 };
    const selected = wc.counts(opened, caret);
    test.assert(selected.selected === true, "a caret with a range counts the selection");
    test.assert(selected.counts.cjk === 2 && selected.counts.latin === 0,
      `a selection covering the whole deleted run still counts only 保留 (got ${JSON.stringify(selected.counts)})`);
    const cut = wc.counts(opened, { ...caret, from: 0, to: 3 });
    test.assert(cut.counts.cjk === 2 && cut.counts.chars === 2, "a selection ending before the deleted run counts 保留 only");
  }

  /* ------------------------------------- 6. the desk wiring (the rows exist) */

  {
    const chart = read("app/features/clio-chart.js");
    test.assertIncludes(chart, 'menuItem("clio-chart-workbook-import-csv", "clio_chart_workbook_cmd_import_csv", "clio-chart-workbook-import-csv")',
      "the workbook File menu carries 导入 CSV…");
    test.assertIncludes(chart, 'menuItem("clio-chart-workbook-export-csv", "clio_chart_workbook_cmd_export_csv", "clio-chart-workbook-export-csv", { menuCondition: "cwk-on" })',
      "导出 CSV… shows with the workbook commands (cwk-on)");
    const write = read("app/features/clio-write.js");
    test.assertIncludes(write, "'clio-write-word-count': ['word-count.open', '', 'clio_write_word_count_menu']",
      "ClioWrite's 编辑 menu row dispatches the word-count command");
    test.assertIncludes(write, "menuRow('clio-write-word-count')", "the 编辑 menu lists 字数统计…");
    test.assertIncludes(write, "if (id === 'word-count.open') return openWordCount();", "the session dispatch runs the word count");
    // One lazy bundle for the import-conversion side paths: the gate and the
    // CSV module ride the existing ODF import loader and name no new loaders;
    // app.js spends ONE line on the gate.
    const config = read("app/core/config.js");
    test.assert(config.includes('"app/features/odf-import.js", "app/features/legacy-formats.js", "app/features/clio-chart-csv.js"'),
      "legacy-formats.js and clio-chart-csv.js ride the ODF import loader (one lazy bundle, no new eager loaders)");
    test.assert(config.includes("const ensureOdf =") && !config.includes("ensureLegacyFormatsModule") && !config.includes("ensureClioChartCsvModule"),
      "the two standalone N15b loaders are gone from config.js");
    test.assert(config.includes('"app/features/clio-write-word-count.js"'),
      "the word count rides the review side path's one lazy bundle");
    test.assertIncludes(write, "root.AISystem6EnsureClioWriteReviewModule", "ClioWrite opens the word count through the review loader");
    const appEntry = read("app.js");
    test.assert(appEntry.includes("await ensureOdf().then(m=>m.gate(files,failures));"),
      "the eager import path spends one line on the old-format gate");
    test.assertNotIncludes(appEntry, "gateLegacyImport", "the eager gate reaches the module through the loader's own resolution");
    const manifest = read("tooling/runtime-manifest.mjs");
    test.assert(manifest.includes('"app/features/legacy-formats.js"') && manifest.includes('"app/features/clio-chart-csv.js"') && manifest.includes('"app/features/clio-write-word-count.js"'),
      "the three N15b modules are lazy runtime paths");
    const workbook = read("app/features/clio-chart-workbook.js");
    test.assertIncludes(workbook, "registerCommand?.('clio-chart-workbook-import-csv'", "导入 CSV… registers as a runtime command");
    test.assertIncludes(workbook, "registerCommand?.('clio-chart-workbook-export-csv'", "导出 CSV… registers as a runtime command");
  }
};

run().then(() => test.finish(), (error) => {
  test.assert(false, `contract threw: ${error && error.stack || error}`);
  test.finish();
});
