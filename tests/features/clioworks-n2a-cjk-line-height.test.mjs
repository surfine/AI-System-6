// ClioWorks N2a + N12 contract (owner ruling SUITE-6, 2026-10-24): when a document's East Asian
// font is missing on this machine and a substitute draws it, the line height stays pinned to the
// ORIGINAL font's metrics, so pagination stays close to Word.
//   - the Quire line-height table carries the measured Chinese fonts (render.js, the ClioWorks
//     deviation row in docs/clioworks/ADOPTION.md); lookup follows the font the DOCUMENT names
//     (w:rFonts eastAsia / the resolved theme font), alias- and case-insensitively (L.fontKey);
//   - a font that cannot be measured here stays on the default (never invent a number);
//   - document grid lines still pitch as before (layout.js's linePitch is untouched);
//   - R.fontSubstitutions(doc) reports which requested fonts a machine cannot draw itself, what
//     draws them and the pinned line factor — the data N12's Get Info / print preview note reads;
//   - a real layout run over four corpus files still produces the recorded page counts.
// The page counts are 按本机排版 expectations — what this machine's fonts and Chromium produce,
// not Word's numbers; they are recorded as the current expectation, like the R1 baseline.
import vm from "node:vm";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createFeatureTest, resolveProjectPath, root } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n2a-cjk-line-height");

// ---- the codec, loaded the way the adapter loads it, in the fixture vm ----
const ctx = makeContext();
loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
loadScripts(ctx, vm.runInContext("ClioWorksQuireAdapter.MODULES", ctx));
const run = (expr) => vm.runInContext(expr, ctx);

// ---- 1. the line-height table: measured Chinese fonts, reached through the document's own names ----
test.assert(run("L.R.lineFactor('宋体')") === 1.1406, "宋体 (SimSun) pins the line at 1.1406 em, the owner-ruled metric");
test.assert(run("L.R.lineFactor('SimSun')") === 1.1406 && run("L.R.lineFactor('SIMSUN')") === 1.1406,
  "the lookup follows w:rFonts eastAsia's English name too, case-insensitively");
test.assert(run("L.R.lineFactor('Songti SC')") === 1.4 && run("L.R.lineFactor('宋体-简')") === 1.4,
  "宋体-简 / Songti SC is 1.4 (measured: Songti.ttc hhea 1060−340+0 over 1000)");
test.assert(run("L.R.lineFactor('PingFang SC')") === 1.4 && run("L.R.lineFactor('苹方-简')") === 1.4,
  "苹方-简 / PingFang SC is 1.4 (measured: PingFangSC-*.otf hhea 859−(−141)+400 over 1000)");
test.assert(run("L.R.lineFactor('思源宋体')") === 1.437 && run("L.R.lineFactor('Source Han Serif SC')") === 1.437
  && run("L.R.lineFactor('Noto Serif CJK SC')") === 1.437 && run("L.R.lineFactor('Noto Serif SC')") === 1.437,
  "思源宋体 / Source Han Serif / Noto Serif CJK pin 1.437, the owner-ruled metric for the design");
test.assert(["黑体", "仿宋", "仿宋_GB2312", "楷体", "楷体_GB2312", "Microsoft YaHei", "微软雅黑", "等线", "DengXian", "方正小标宋简体"]
  .every((f) => run(`L.R.lineFactor(${JSON.stringify(f)})`) === 1.17),
  "fonts with no file on this machine to measure stay on the 1.17 default (never invent a number)");
test.assert(run("L.R.lineFactor('Times New Roman')") === 1.149 && run("L.R.lineFactor('Calibri')") === 1.2207
  && run("L.R.lineFactor('Some Font No One Shipped')") === 1.17,
  "the Latin table and the default are untouched");

// ---- 2. the paragraph line, through the real style builder (R.runCSS) ----
test.assert(run("L.R.runCSS({ font: '宋体', fontEA: '宋体', eaText: true, sz: 12 }, 1)").includes("line-height:1.1406"),
  "a run drawn in 宋体 gets line-height 1.1406 × font size — whatever substitute actually draws it");
test.assert(run("L.R.runCSS({ font: 'Times New Roman', fontEA: '宋体', eaText: true, sz: 12 }, 1)").includes("line-height:1.149"),
  "the upstream rule stands: a run's line takes the taller of its two fonts (宋体 1.1406 < Times 1.149)");

// ---- 3. document grid lines still pitch as before ----
const grid = (expr) => run(`L.R.gridLine(L.R.px(15.6), 1, ${expr})`);
test.assert(grid("10.5, '宋体'") === grid("10.5, 'Times New Roman'") && grid("10.5, '宋体'") === 20.8,
  "on the 15.6 pt grid (linePitch 312) a 10.5 pt 宋体 line still pitches one line, like every font that fits");
test.assert(grid("22, '宋体'") === 41.6 && grid("22, 'Times New Roman'") === 41.6,
  "a 22 pt title still takes two pitches on the grid, before and after the table grew");

// ---- 4. fontSubstitutions: pure on the document model, availability injectable ----
// A small real-shape model: runs name fonts the way docx-read leaves them (resolved theme included).
run(`globalThis.__n2a = {
  main: { kind: 'main', blocks: [
    { t: 'p', id: 'p1', pPr: {}, rPr: {}, runs: [{ t: 'text', rPr: { font: 'Times New Roman', fontEA: '宋体' }, text: '正文 test' }] },
    { t: 'p', id: 'p2', pPr: {}, rPr: { font: '方正小标宋简体', fontEA: '方正小标宋简体' }, runs: [{ t: 'text', rPr: {}, text: '标题' }] },
  ] },
  styles: { Normal: { id: 'Normal', type: 'paragraph', rPr: { fontEA: '宋体' }, pPr: {} } },
  defaults: { rPr: { font: 'Calibri', sz: 11 }, pPr: {} },
  hf: {}, fn: {}, en: {}, comments: {},
}`);
const subsOf = (expr) => run(`JSON.stringify(L.R.fontSubstitutions(globalThis.__n2a, ${expr}))`);
const installed = "new Set(['Songti SC', 'Times New Roman', 'Carlito'])";
const subs = JSON.parse(subsOf(installed));
test.assert(subs.some((s) => s.requested === "宋体" && s.used === "Songti SC" && s.pinnedLineHeight === 1.1406),
  `fontSubstitutions reports 宋体 drawn by Songti SC with the line pinned at 1.1406 (${subsOf(installed)})`);
test.assert(subs.some((s) => s.requested === "Calibri" && s.used === "Carlito" && s.pinnedLineHeight === 1.2207),
  "a substituted Latin font is reported the same way (Calibri → Carlito)");
test.assert(subs.some((s) => s.requested === "方正小标宋简体" && s.pinnedLineHeight === 1.17),
  "an unmeasured font still reports, with the default pinned line height");
test.assert(!subs.some((s) => s.requested === "Times New Roman"),
  "a font the machine draws itself reports no substitution");
test.assert(JSON.parse(subsOf("(f) => f === 'Songti SC'")).some((s) => s.requested === "宋体" && s.used === "Songti SC"),
  "the availability check also takes a predicate, so tests can inject it");
test.assert(subsOf(installed) === subsOf(installed) && run("JSON.stringify(globalThis.__n2a)") === run("JSON.stringify(globalThis.__n2a)")
  && (() => { const before = run("JSON.stringify(globalThis.__n2a)"); subsOf(installed); return before === run("JSON.stringify(globalThis.__n2a)"); })(),
  "fontSubstitutions is pure: same result twice, document untouched");
test.assert(run("JSON.stringify(L.R.fontSubstitutions(globalThis.__n2a))") === "[]",
  "with no availability information (the fixture vm's bare document) it reports no substitution rather than guessing");

// ---- 5. a real layout run over the corpus: page counts, 按本机排版 ----
// The counts are what this machine (its fonts + Playwright's Chromium) produces through the real
// vendored codec + layout, NOT Word's numbers; recorded here as the current expectation, like the
// R1 baseline. Before/after the Chinese line-height table these are equal (see ZCODE-REPORT.md).
const EXPECTED_PAGES = { "D01.docx": 2, "D03.docx": 37, "D08.docx": 5, "D09.docx": 7 };

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script src="app/vendor/clioworks-v3/quire-adapter.js"></script>
<script>
window.__layout = async function (file) {
  const adapter = window.ClioWorksQuireAdapter;
  const L = await adapter.loadEditor();
  const bytes = new Uint8Array(await (await fetch('/corpus/' + file)).arrayBuffer());
  await adapter.open(bytes, { name: file });
  await document.fonts.ready;
  const scroller = document.createElement('div');
  scroller.style.cssText = 'position:absolute;left:0;top:0;width:1400px;height:1000px;overflow:hidden';
  document.body.appendChild(scroller);
  L.layout.mount(scroller);
  L.layout.view = 'print';
  L.layout.render();
  await new Promise((r) => setTimeout(r, 150));
  L.layout.render();   // settled: straggler image loads re-flowed once
  return { pages: L.layout.pages.length, subs: L.R.fontSubstitutions(L.D.doc) };
};
</script></body></html>`;

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  try {
    if (path === "/run") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HTML); }
    let file = null;
    if (path.startsWith("/app/")) file = resolveProjectPath(path.slice(1));
    else if (path.startsWith("/corpus/")) file = join(root, "tests", "fixtures", "real-corpus", "docx", path.slice("/corpus/".length));
    if (!file) { res.writeHead(404); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
    res.end(data);
  } catch (error) { res.writeHead(404); res.end(String(error.message)); }
});

const layoutRun = async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const [file, expected] of Object.entries(EXPECTED_PAGES)) {
      // A fresh page per document: the codec module state is per-navigation, and one document's
      // layout must never lean on the previous one's caches.
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error.message)));
      await page.goto(`http://127.0.0.1:${port}/run`);
      await page.waitForFunction(() => !!window.ClioWorksQuireAdapter);
      const out = await page.evaluate((f) => window.__layout(f), file);
      test.assert(errors.length === 0, `${file}: the layout ran without page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
      test.assert(out.pages === expected, `${file} lays out to ${expected} pages (按本机排版), got ${out.pages}`);
      if (file === "D01.docx") {
        const songti = (out.subs || []).find((s) => s.requested === "宋体");
        test.assert(!!songti && songti.pinnedLineHeight === 1.1406 && songti.used !== "宋体" && songti.used !== "SimSun",
          `in the browser (real availability) 宋体 is reported drawn by ${songti ? songti.used : "nothing"} with the line pinned at 1.1406`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
};

await layoutRun();
test.finish();
