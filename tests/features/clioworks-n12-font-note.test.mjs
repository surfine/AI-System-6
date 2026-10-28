// ClioWorks N12 contract: the substituted-fonts display. When a document names
// fonts this machine cannot draw itself, quire/render.js's R.fontSubstitutions
// reports what draws each one and the line factor the layout pins to the
// REQUESTED font (SUITE-6). This contract drives the lazy display helper
// (app/features/clio-write-fonts.js) over a real corpus file — D01, a WPS-made
// 公文 whose runs name 宋体, 黑体 and 方正小标宋简体 — and asserts:
//   - the helper module loads alone and installs its API;
//   - the rows and the one-line summary speak both languages' exact copy;
//   - the empty case shows nothing rather than a zero line;
//   - the row's line factor is the requested font's (宋体 1.1406), not the
//     stand-in's (Songti SC's own 1.4) — the number N2b's print preview reads;
//   - officeNote's Get Info policy: the parsed model this session holds is
//     read, the record's own small in-memory bytes are parsed once while the
//     codec is loaded, and anything else (no record, a big file, no codec)
//     answers null — Get Info never parses a big document just for a row;
//   - fillInfo, the display path Get Info itself calls, draws the row with the
//     exact translated copy and leaves the row out when the note is absent.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { loadScripts, makeContext } from "../fixtures/clioworks-s11/vm-context.mjs";
import { CORPUS } from "../../tooling/clioworks-r1-corpus.mjs";

const test = createFeatureTest("clioworks-n12-font-note");

// The codec (for the real document and the real line-factor table) and the
// real translation tables, so the helper's strings are the shipped ones.
const ctx = makeContext();
loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js"]);
loadScripts(ctx, vm.runInContext("ClioWorksQuireAdapter.MODULES", ctx));
loadScripts(ctx, ["app/data/system-data.js", "app/data/translations-en.js", "app/data/translations-zh.js"]);
// t() reads the same tables the boot bundle's own t does; the test flips the language.
vm.runInContext(`
  globalThis.__lang = "zh";
  globalThis.t = (key, ...args) => {
    const tables = window.AISystem6Data.translations;
    const table = tables[globalThis.__lang] || tables.en || {};
    const value = table[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  };
`, ctx);
loadScripts(ctx, ["app/features/clio-write-fonts.js"]);

const run = (expr) => vm.runInContext(expr, ctx);
const fonts = () => run("AISystem6ClioWriteFonts");

// D01 names 宋体 / 黑体 / 方正小标宋简体 (WPS 公文); the injected availability
// stands in for a machine without them but with the suite's stand-ins.
const docxBytes = readFileSync(join(CORPUS, "docx", "D01.docx"));
ctx.__d01 = docxBytes;
const availableSet = 'new Set(["Songti SC", "Times New Roman", "Arial", "PingFang SC", "Carlito"])';

const run_ = async () => {
  test.assert(typeof fonts().note === "function" && typeof fonts().rows === "function"
    && typeof fonts().summary === "function" && typeof fonts().substitutions === "function"
    && typeof fonts().officeNote === "function" && typeof fonts().fillInfo === "function"
    && run("AISystem6ClioWriteFontsLoaded === true"),
    "the fonts display module loads alone and installs its API");

  const adapter = await run('ClioWorksQuireAdapter.open(globalThis.__d01, { name: "D01.docx" })');
  ctx.__adapter = adapter;
  run("globalThis.__subs = AISystem6ClioWriteFonts.substitutions(__adapter.document(), "
    + `${availableSet}) || []`);
  const requested = () => run("globalThis.__subs.map((s) => s.requested)");
  test.assert(requested().includes("宋体") && requested().includes("黑体") && requested().includes("方正小标宋简体"),
    `D01's own fonts are the ones reported substituted (${requested().join(", ")})`);
  test.assert(!requested().includes("Times New Roman"),
    "a font the injected availability says is installed reports no substitution");

  // The line factor follows the REQUESTED font: 宋体 pins 1.1406 while Songti
  // SC (what draws it) would give 1.4 — the number pagination is pinned to.
  const songti = JSON.parse(run("JSON.stringify(globalThis.__subs.find((s) => s.requested === '宋体'))"));
  test.assert(songti.used === "Songti SC" && songti.pinnedLineHeight === 1.1406,
    `宋体 is drawn by Songti SC with the line pinned to 宋体's own 1.1406 (${JSON.stringify(songti)})`);
  test.assert(run("L.R.lineFactor('Songti SC')") === 1.4 && songti.pinnedLineHeight !== run("L.R.lineFactor('Songti SC')"),
    "the pinned factor is the requested font's, not the stand-in's");

  // The rows and the summary, in both languages' exact copy.
  run('globalThis.__note = AISystem6ClioWriteFonts.note(globalThis.__subs)');
  run("globalThis.__lang = 'zh'");
  const zhNote = JSON.parse(run("JSON.stringify(globalThis.__note)"));
  test.assert(zhNote.summary === `${zhNote.count} 种字体由本机字体代替`,
    `the zh summary counts the rows（${zhNote.summary}）`);
  const zhRows = zhNote.rows.map((row) => row.text);
  test.assert(zhRows.includes("宋体 → 由 Songti SC 代为显示（行高按宋体度量）"),
    `the zh row says what draws 宋体 and whose metrics pin the line (${zhRows.find((t) => t.startsWith("宋体"))})`);
  test.assert(zhRows.some((text) => text.startsWith("方正小标宋简体 → 由 Arial 代为显示")),
    "a Latin stand-in reads the same way in zh");

  run("globalThis.__lang = 'en'");
  const enNote = JSON.parse(run("JSON.stringify(AISystem6ClioWriteFonts.note(globalThis.__subs))"));
  const enRows = enNote.rows.map((row) => row.text);
  test.assert(enRows.includes("宋体 → drawn by Songti SC (line height per 宋体)"),
    `the en row mirrors the zh one (${enRows.find((t) => t.startsWith("宋体"))})`);
  test.assert(enNote.summary === `${enNote.count} fonts drawn by stand-ins on this machine` && enNote.count === zhNote.count,
    `the en summary counts the same rows (${enNote.summary})`);
  test.assert(enNote.rows.length === zhNote.rows.length && enNote.rows.every((row, i) => row.requested === zhNote.rows[i].requested && row.used === zhNote.rows[i].used),
    "both languages pair the same requested/used fonts");

  // The empty case: everything installed, or no availability information —
  // the display shows nothing, never a zero line.
  test.assert(fonts().summary([]) === "" && fonts().note([]) === null && fonts().rows([]).length === 0,
    "no substitutions: no summary, no rows, no note");
  test.assert(fonts().note(null) === null && fonts().rows(null).length === 0,
    "a null substitutions array (no codec, no availability) reads as the empty case");
  run("globalThis.__allInstalled = AISystem6ClioWriteFonts.substitutions(__adapter.document(), () => true)");
  test.assert(run("globalThis.__allInstalled") !== null && run("globalThis.__allInstalled.length") === 0
    && fonts().note(run("globalThis.__allInstalled")) === null,
    "with every font installed the document reports no substitution at all");
  test.assert(fonts().substitutions(null, availableSet) === null,
    "no document: no substitution report rather than an empty guess");

  // officeNote's Get Info policy, against the real record shapes. `available`
  // is injected the same way as above; in the browser the policy passes null
  // through and the codec's own availability probe answers.
  run(`
    globalThis.__storeRecord = null;
    globalThis.AISystem6NativeBinaries = {
      projectHandle: (id) => "project-file:" + String(id || ""),
      recordFor: () => globalThis.__storeRecord,
    };
    globalThis.__item = { id: "file-1", type: "office", format: "docx", nativeDocumentId: "row-1" };
    globalThis.__available = ${availableSet};
  `);
  // 1. The parsed model this session holds — open in ClioWrite or still cached.
  run("globalThis.__storeRecord = { liveAdapter: __adapter, byteLength: __d01.byteLength }");
  const liveNote = await run("AISystem6ClioWriteFonts.officeNote(globalThis.__item, globalThis.__available).then((n) => JSON.stringify(n))");
  test.assert(JSON.parse(liveNote).rows.some((row) => row.requested === "宋体"),
    "officeNote reads the session's live adapter (the document open in ClioWrite) without parsing anything");

  // 2. No model, but the record's own bytes in memory while the codec is loaded.
  run("globalThis.__storeRecord = { working: __d01, byteLength: __d01.byteLength }");
  const bytesNote = await run("AISystem6ClioWriteFonts.officeNote(globalThis.__item, globalThis.__available).then((n) => JSON.stringify(n))");
  test.assert(JSON.parse(bytesNote).rows.some((row) => row.requested === "宋体"),
    "officeNote parses the record's own small in-memory bytes while the codec is loaded");

  // 3. Everything Get Info must NOT do: read a missing record, parse a big
  //    file, or load the codec that is not loaded.
  run("globalThis.__storeRecord = null");
  test.assert(await run("AISystem6ClioWriteFonts.officeNote(globalThis.__item).then((n) => n === null)"),
    "no session record: no fonts row");
  run("globalThis.__storeRecord = { working: __d01, byteLength: 2 * 1024 * 1024 }");
  test.assert(await run("AISystem6ClioWriteFonts.officeNote(globalThis.__item).then((n) => n === null)"),
    "a big document is never parsed just for Get Info");
  run("globalThis.__storeRecord = { working: __d01, byteLength: __d01.byteLength }; globalThis.__savedR = L.R; delete globalThis.L.R");
  test.assert(await run("AISystem6ClioWriteFonts.officeNote(globalThis.__item).then((n) => n === null)"),
    "without the codec already loaded Get Info loads nothing and shows no row");
  run("globalThis.L.R = globalThis.__savedR");
  run("delete globalThis.AISystem6NativeBinaries");
  test.assert(await run("AISystem6ClioWriteFonts.officeNote(globalThis.__item).then((n) => n === null)"),
    "without the native store (a bare context) officeNote answers null");

  // The display path Get Info itself calls: the row drawn into the real list,
  // with the exact translated copy, and no row when the note is absent. The
  // fixture's document stub cannot hold elements, so the test supplies plain
  // node records (setAttribute/append/textContent) under document.createElement.
  run("globalThis.__storeRecord = { liveAdapter: __adapter, byteLength: __d01.byteLength }; globalThis.__lang = 'zh'");
  run("globalThis.AISystem6NativeBinaries = { projectHandle: (id) => 'project-file:' + String(id || ''), recordFor: () => globalThis.__storeRecord }");
  run(`
    globalThis.__textOf = (node) => node == null ? "" : (node.text != null ? node.text
      : String(node.textContent || "") + (node.children || []).map(globalThis.__textOf).join(""));
    globalThis.__el = (tag) => ({ tagName: tag, attrs: {}, children: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      append(...nodes) { this.children.push(...nodes); } });
    globalThis.__filled = null;
    globalThis.__dl = { children: [], insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); return node; } };
    globalThis.__descLabel = { closest: () => globalThis.__dl };
    globalThis.document = Object.assign({}, globalThis.document, {
      createElement: (tag) => globalThis.__el(tag),
      querySelector: (sel) => (sel === "#info-file-description-label" ? globalThis.__descLabel : null),
    });
  `);
  await run("AISystem6ClioWriteFonts.fillInfo(globalThis.__item, () => true, globalThis.__available)");
  const filled = run("JSON.stringify(globalThis.__dl.children.map((n) => ({ tag: n.tagName, i18n: n.getAttribute('data-i18n'), text: globalThis.__textOf(n) })))");
  test.assert(filled.includes('"dt"') && filled.includes("字体：") && filled.includes('"info_fonts"') && filled.includes('"dd"'),
    `fillInfo draws the 字体 row with the translated label (${filled})`);
  const ddText = run("globalThis.__textOf(globalThis.__dl.children.find((n) => n.tagName === 'dd'))");
  test.assert(ddText.includes("种字体由本机字体代替") && ddText.includes("宋体 → 由 Songti SC 代为显示（行高按宋体度量）"),
    "the drawn row carries the zh summary and the exact zh row text");
  run("globalThis.__dl.children = []; globalThis.__lang = 'en'");
  await run("AISystem6ClioWriteFonts.fillInfo(globalThis.__item, () => true, globalThis.__available)");
  test.assert(run("globalThis.__textOf(globalThis.__dl.children.find((n) => n.tagName === 'dd'))").includes("drawn by Songti SC"),
    "the en table draws the en row through the same path");
  run("globalThis.__dl.children = []");
  await run("AISystem6ClioWriteFonts.fillInfo(globalThis.__item, () => false)");
  test.assert(run("globalThis.__dl.children.length") === 0,
    "a stale answer (Get Info moved to another item) draws nothing");

  // The ClioWrite window itself still loads alone with the note wired in
  // (the same bare-vm load the N13a contract runs after its edits).
  const cwCtx = makeContext();
  loadScripts(cwCtx, ["app/features/clio-write.js"]);
  test.assert(vm.runInContext("AISystem6ClioWriteLoaded === true && typeof AISystem6ClioWrite.open === 'function'", cwCtx),
    "ClioWrite loads with the font note in its chrome and installs its API");

  test.finish();
};

run_();
