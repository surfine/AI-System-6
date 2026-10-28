// ClioWorks N5b contract: the workbook tools over the real Ledger adapter and
// the vendored VibeOffice codec. 制图 turns a selected range into a real chart
// object in the Ledger model (sheet.drawings + nameRef/catRef/valRef series —
// the same structure a chart read from a file has) as ONE named undo step; the
// saved package carries xl/charts/chartN.xml, a drawing part and their
// relationships, and it reopens with the chart and its references. 粘贴函数
// enumerates the vendored formula engine's own registry (never a hand list),
// and the forty described functions have both translations. Column conversion
// rewrites text→number/date and number→text as one named undo step, leaving
// the cells it cannot read counted and unchanged, Chinese dates included.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n5b-chart-tools");
const X07 = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/xlsx/X07.xlsx")));

// One context per group: the codec loads through the adapter, the evaluator
// and the tools ride loadScripts like the browser's own lazy loaders do.
const CODEC = [
  "app/vendor/vibeoffice/common/core.js",
  "app/data/translations-en.js",
  "app/data/translations-zh.js",
  "app/features/clio-chart-workbook-tools.js",
];
const EVALUATOR = [
  "app/vendor/vibeoffice/ledger/calc.js",
  "app/vendor/vibeoffice/ledger/fn-core.js",
  "app/vendor/vibeoffice/ledger/fn-lookup.js",
  "app/vendor/vibeoffice/ledger/fn-stat.js",
  "app/vendor/vibeoffice/ledger/fn-fin.js",
  "app/vendor/vibeoffice/ledger/fn-eng.js",
];

function session(language = "zh") {
  const ctx = makeContext();
  ctx.currentLanguage = language;
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/vendor/clioworks-v3/ledger-structure.js"]);
  ctx.t = (key, ...args) => {
    const table = language === "en" ? ctx.AISystem6TranslationsEn : ctx.AISystem6TranslationsZh;
    const value = table ? table[key] : key;
    return typeof value === "function" ? value(...args) : value == null ? key : value;
  };
  loadScripts(ctx, CODEC);
  const open = async (bytes, meta = { name: "n5b.xlsx" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, globalThis.__meta)", ctx);
  };
  return { ctx, open, tools: () => ctx.AISystem6ClioChartWorkbookTools };
}

/** Put a raw cell into the model (no adapter bookkeeping) — the lane's precedent for model setup. */
const put = (sh, r, c, cell) => { sh.rowObj(r).cells[c] = cell; if (r > sh.maxR) sh.maxR = r; if (c > sh.maxC) sh.maxC = c; };

const run = async () => {
  /* ------------------------------- 1. insert a chart from a real corpus range */
  {
    const { ctx, open, tools } = session();
    const T = tools();
    const a = await open(X07, { name: "X07.xlsx" });
    const sh = a.workbook().sheets[0];
    const drawing = T.buildChartDrawing(sh, { r1: 0, c1: 0, r2: 5, c2: 2 }, { kind: "col", stacked: false, byRows: false, title: "测试图表", legend: true });
    test.assert(drawing.kind === "chart" && drawing.anchor.type === "two", "the drawing is an anchored chart object");
    test.assert(drawing.chart.kind === "col" && drawing.chart.legend === "r" && drawing.chart.title === "测试图表", "the dialog's spec lands in the chart model");
    test.assert(drawing.chart.series.length === 2, `the two numeric columns became two series (${drawing.chart.series.length})`);
    test.assert(drawing.chart.series[1].valRef === "Sheet1!$C$2:$C$6", `the value reference names the range (${drawing.chart.series[1].valRef})`);
    test.assert(drawing.chart.series[1].nameRef === "Sheet1!$C$1" && drawing.chart.series[1].name === "数字标题", "the header cell names the series through its own reference");
    test.assert(drawing.chart.series[0].catRef === "Sheet1!$A$2:$A$6", "the text first column is the category reference");
    test.assert(JSON.stringify(drawing.chart.series[1].vals) === "[1,2,3,4,5]", `the cached values are the cells' own (${JSON.stringify(drawing.chart.series[1].vals)})`);
    test.assert(drawing.chart.cats.length === 5 && drawing.chart.cats[0] === "字符串0", `the category cache holds the texts (${drawing.chart.cats[0]})`);

    const out = T.insertChartDrawing(a, "Sheet1", drawing);
    test.assert(out.status === "ok", `insertChartDrawing answers ok (${out.status})`);
    test.assert(a.canUndo() && a.undoLabel() === "clio_chart_workbook_step_insert_chart", "the insert is ONE named undo step (插入图表)");
    test.assert(a.isDirty(), "the insert marks the workbook dirty");

    const saved = await a.save();
    test.assert(saved.mode === "preserving-edit", `the save runs the preserving writer (${saved.mode})`);
    const parts = await vm.runInContext(`(async () => {
      const pkg = await L.zip.read(globalThis.__saved.slice(0));
      globalThis.__pkg = pkg;
      return [...pkg.keys()];
    })()`, Object.assign(ctx, { __saved: saved.bytes }));
    test.assert(parts.some((n) => /^xl\/charts\/chart\d+\.xml$/.test(n)), `the package carries the chart part (${parts.filter((n) => n.includes("chart")).join(", ")})`);
    test.assert(parts.some((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n)) && parts.some((n) => /^xl\/drawings\/_rels\/drawing\d+\.xml\.rels$/.test(n)), "the drawing part and its relationships are there");
    const chartXml = await vm.runInContext(`(async () => {
      const name = [...globalThis.__pkg.keys()].find((n) => /^xl\\/charts\\/chart\\d+\\.xml$/.test(n));
      return L.zip.decode(await globalThis.__pkg.get(name).bytes());
    })()`, ctx);
    test.assert(chartXml.includes("<c:barChart>") && chartXml.includes("Sheet1!$C$2:$C$6") && chartXml.includes("测试图表"), "the chart XML is a real bar chart over the series references");

    const reopen = session("zh");
    const b = await reopen.open(new Uint8Array(saved.bytes), { name: "reopened.xlsx" });
    const bsh = b.workbook().sheets[0];
    test.assert(bsh.drawings.length === 1 && bsh.drawings[0].kind === "chart", "the saved package reopens with the chart");
    const reread = bsh.drawings[0].chart;
    test.assert(!!reread && reread.imported === true, "the reopened chart reads back as a chart model (the vendored reader needs L.color, which core.js provides)");
    test.assert(reread.series[1].valRef === "Sheet1!$C$2:$C$6" && reread.title === "测试图表", `the series references survive the round trip (${reread.series && reread.series[1] && reread.series[1].valRef})`);

    a.undo();
    test.assert(sh.drawings.length === 0, "undo removes the chart");
    a.redo();
    test.assert(sh.drawings.length === 1, "redo puts it back");
    a.undo();
    const clean = await a.save();
    test.assert(clean.mode === "preserving-edit" && sh.drawings.length === 0, "the undone model saves without the chart");
  }

  /* ------------------------------------------- 2. applyModelStep refuses cleanly */
  {
    const { open, tools } = session();
    const T = tools();
    const a = await open(X07, { name: "X07.xlsx" });
    const drawing = T.buildChartDrawing(a.workbook().sheets[0], { r1: 0, c1: 0, r2: 2, c2: 2 }, { kind: "bar", stacked: false, byRows: null, title: "", legend: false });
    const refused = T.insertChartDrawing(a, "没有这张表", drawing);
    test.assert(refused.status === "failed" && !a.canUndo(), "an unknown sheet is refused without leaving an undo step or a dirty flag");
    test.assert(!a.isDirty(), "the refused insert does not move the dirty axis");
  }

  /* ---------------------------------------------- 3. column type conversion */
  {
    const { ctx, open, tools } = session("zh");
    const T = tools();
    // A small synthetic sheet: text numbers, a stray word, Chinese and ISO
    // dates, the slash form, a real number, and a formula that reads one.
    const build = async () => {
      await vm.runInContext("ClioWorksLedgerAdapter.loadCodec()", ctx);
      const bytes = await vm.runInContext(`(async () => {
        const wb = new L.model.Workbook();
        const sh = wb.addSheet("表1");
        const put = (r, c, v) => { sh.put(r, c, typeof v === "object" ? v : { v }); };
        put(0, 0, "123"); put(1, 0, "abc"); put(2, 0, "2026年10月24日");
        put(3, 0, "10/24/2026"); put(4, 0, "2026-10-24"); put(5, 0, 42);
        put(0, 1, { f: "A6*2" });
        return new Uint8Array(await L.xlsxWrite.bytes(wb, { type: "xlsx" }));
      })()`, ctx);
      return open(bytes, { name: "convert.xlsx" });
    };

    // 文字→日期 (zh): the three date forms convert, the rest are counted and kept.
    const a = await build();
    const dateOut = T.convertRange(a, "表1", { r1: 0, c1: 0, r2: 5, c2: 0 }, "text-date", { locale: "zh" });
    test.assert(dateOut.status === "ok" && dateOut.converted === 3 && dateOut.unconverted === 2,
      `text→date converts 3 and counts 2 unrecognised (${JSON.stringify(dateOut)})`);
    const oct24 = T.dateSerial(2026, 10, 24);
    test.assert(a.getCell("表1", "A3").value === oct24, `2026年10月24日 became its day serial (${a.getCell("表1", "A3").value})`);
    test.assert(a.getCell("表1", "A4").value === oct24, "10/24/2026 reads as October 24th in the zh fallback order");
    test.assert(a.getCell("表1", "A5").value === oct24, "2026-10-24 reads as October 24th");
    const dateStyle = a.getCell("表1", "A3").style;
    test.assert(dateStyle != null && a.workbook().styles.get(dateStyle).nf.includes("年"), `the converted cells wear the locale's date format (${a.workbook().styles.get(dateStyle).nf})`);
    test.assert(a.getCell("表1", "A1").value === "123" && a.getCell("表1", "A2").value === "abc", "the cells that cannot convert stay exactly as they were");
    test.assert(a.canUndo() && a.undoLabel() === "clio_chart_workbook_step_convert_column", "the whole conversion is ONE named undo step (转换列类型)");
    a.undo();
    test.assert(a.getCell("表1", "A3").value === "2026年10月24日" && a.getCell("表1", "A3").style == null, "undo restores the text and the style");
    test.assert(ctx.t("clio_chart_workbook_receipt_converted", 3, 2) === "转换 3 格，2 格无法识别，已保持原样", "the status line says what converted and what stayed");

    // 文字→数字 on a fresh copy: one number, one unrecognised word, the dates too.
    const b = await build();
    const numOut = T.convertRange(b, "表1", { r1: 0, c1: 0, r2: 5, c2: 0 }, "text-number", { locale: "zh" });
    test.assert(numOut.status === "ok" && numOut.converted === 1 && numOut.unconverted === 4, `text→number converts only the number-like text (${JSON.stringify(numOut)})`);
    test.assert(b.getCell("表1", "A1").value === 123 && typeof b.getCell("表1", "A1").value === "number", '"123" became the number 123');

    // 数字→文字 on a fresh copy: what the cell shows becomes the text.
    const c = await build();
    const textOut = T.convertRange(c, "表1", { r1: 5, c1: 0, r2: 5, c2: 0 }, "number-text", {
      locale: "zh",
      display: (r, col, v) => String(v),
    });
    test.assert(textOut.status === "ok" && textOut.converted === 1, `number→text converted the one number (${JSON.stringify(textOut)})`);
    test.assert(c.getCell("表1", "A6").value === "42", "42 became the text \"42\"");

    // A single cell means its whole used column; a formula cell is not text to convert.
    const d = await build();
    const colOut = T.convertRange(d, "表1", { r1: 1, c1: 1, r2: 1, c2: 1 }, "text-number", { locale: "zh" });
    test.assert(colOut.status === "ok" && colOut.converted === 0 && colOut.unconverted === 0, `formula cells are left alone (${JSON.stringify(colOut)})`);
  }

  /* --------------------------------------------------- 4. Paste Function */
  {
    const { ctx, open, tools } = session("zh");
    await vm.runInContext("ClioWorksLedgerAdapter.loadCodec()", ctx);
    loadScripts(ctx, EVALUATOR);
    const T = tools();
    const fns = T.enumerateFunctions();
    test.assert(fns.length >= 300, `the engine's own registry enumerates ${fns.length} functions (at least 300)`);
    const names = new Set(fns.map((def) => def.name));
    const missing = T.describedFunctions().filter((name) => !names.has(name));
    test.assert(missing.length === 0, `every described function exists in the engine (${missing.join(", ")})`);

    const zh = ctx.AISystem6TranslationsZh;
    const en = ctx.AISystem6TranslationsEn;
    const noZh = T.describedFunctions().filter((name) => !zh[`clio_chart_workbook_fn_desc_${name}`]);
    const noEn = T.describedFunctions().filter((name) => !en[`clio_chart_workbook_fn_desc_${name}`]);
    test.assert(noZh.length === 0 && noEn.length === 0, `the forty descriptions exist in both languages (missing zh: ${noZh.join(",")}; missing en: ${noEn.join(",")})`);
    test.assert(typeof zh.clio_chart_workbook_fn_desc_SUM === "string" && zh.clio_chart_workbook_fn_desc_SUM.length > 0, "a description is one line of copy, not a key");

    const vlookup = fns.find((def) => def.name === "VLOOKUP");
    test.assert(T.functionSignature(vlookup, ctx.t) === "VLOOKUP(值, 区域, 数, [值])", `signatures come from the engine's kinds (${T.functionSignature(vlookup, ctx.t)})`);
    test.assert(T.functionCategory("VLOOKUP") === "lookup" && T.functionCategory("SUM") === "math" && T.functionCategory("TEXTJOIN") === "text", "categories answer for the described functions");
  }

  /* --------------------------------------- 5. live values and the renderer */
  {
    const { ctx, open, tools } = session("zh");
    const T = tools();
    const a = await open(X07, { name: "X07.xlsx" });
    loadScripts(ctx, EVALUATOR);
    const sh = a.workbook().sheets[0];
    const drawing = T.buildChartDrawing(sh, { r1: 0, c1: 0, r2: 5, c2: 2 }, { kind: "col", stacked: false, byRows: false, title: "", legend: true });
    const chart = drawing.chart;
    sh.put(1, 2, { v: 99 }); // C2: 1 → 99
    T.resolveChart(sh, chart);
    test.assert(chart.series[1].vals[0] === 99, `the cached values follow the cells (${chart.series[1].vals[0]})`);
    // The 1-bit renderer needs a real DOM; a bare vm answers null instead of throwing.
    test.assert(T.renderChart1Bit(a.workbook(), sh, chart, 300, 190, 1) === null, "the renderer is browser-only and degrades to null in a bare vm");
  }

  test.finish();
};

run();
