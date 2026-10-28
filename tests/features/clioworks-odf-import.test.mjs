// ClioWorks ODF import contract (owner decision 2026-10-24 「ODF 导入成副本」):
// an OpenDocument file dropped on the File Floppy becomes an editable Office
// copy. The converter runs in a real VM context through its own lazy loader
// (the codec modules load exactly the way they load in the desk), and every
// converted package is OPENED AGAIN with the desk's own adapters
// (ClioWorksQuireAdapter / ClioWorksLedgerAdapter / ClioWorksLecternAdapter),
// so the assertions read what a writer would open, not what the writer wrote.
//   - odt: heading, plain text, bold/italic/underline runs, bullet and numbered
//     lists, the 2×2 table text and the inline image all come through;
//   - ods: both sheets, numbers/text/boolean values, the 1:1 SUM formula with
//     its cached result, and the ODF-only CURRENT() formula kept as its value;
//   - odp: both slides with their titles, body text and the second slide's image;
//   - whatever the converter could not carry is listed in notCarried — an array
//     of translation keys the desk maps through t() — never silently dropped.
// Ledger and Lectern both own the global L.model, so each kind gets its own
// context (same rule as the S11 contracts that share vm-context.mjs).
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-odf-import");
const DIR = "tests/fixtures/odf";
const fixture = (name) => new Uint8Array(readFileSync(resolveProjectPath(`${DIR}/${name}`)));

/** One fresh context per kind: the module, then the desk adapter that will reopen the copy. */
function session(adapterScript) {
  const ctx = makeContext();
  loadScripts(ctx, ["app/features/odf-import.js", adapterScript]);
  return ctx;
}

async function convert(ctx, name) {
  ctx.__bytes = fixture(name);
  ctx.__name = name;
  return vm.runInContext("AISystem6OdfImport.convert(globalThis.__bytes, globalThis.__name)", ctx);
}

async function openAdapter(ctx, adapter, bytes, name) {
  ctx.__bytes = bytes;
  ctx.__meta = { name };
  return vm.runInContext(`${adapter}.open(globalThis.__bytes, globalThis.__meta)`, ctx);
}

const run = async () => {
  {
    const ctx = session("app/vendor/clioworks-v3/quire-adapter.js");
    const out = await convert(ctx, "sample.odt");
    test.assert(out.format === "docx" && out.fileName === "sample.docx", `sample.odt converts to a sample.docx copy (got ${out.format}/${out.fileName})`);
    test.assert(Array.isArray(out.notCarried), "notCarried is an array of translation keys");
    const doc = await openAdapter(ctx, "ClioWorksQuireAdapter", out.bytes, "sample.docx");
    const blocks = doc.blocks();
    const heading = doc.paragraphs().find((p) => p.text === "搬家周报");
    test.assert(heading && heading.headingLevel === 1, "the text:h heading opens as heading level 1");
    test.assert(doc.paragraphs().some((p) => p.text === "这个周末要把东西搬到新家，先做准备。"), "a plain paragraph's text comes through");
    const styled = doc.paragraphs().find((p) => p.text.startsWith("纸箱要加粗提醒"));
    const b = styled && styled.runs.find((r) => r.text === "纸箱要加粗提醒，");
    const i = styled && styled.runs.find((r) => r.text === "标签斜体写清，");
    const u = styled && styled.runs.find((r) => r.text === "胶带下划线标记。");
    test.assert(b && b.b === true && i && i.i === true && u && u.u === true, "bold, italic and underline runs survive the round trip");
    test.assert(doc.paragraphs().some((p) => p.list && p.list.kind === "bullet" && p.text === "胶带和标签纸"), "the ODF bullet list becomes a bullet list paragraph");
    test.assert(doc.paragraphs().some((p) => p.list && p.list.kind === "number" && p.text === "周六上午装箱"), "the ODF numbered list becomes a numbered list paragraph");
    const table = blocks.find((b2) => b2.kind === "table");
    test.assert(table && table.rows.length === 2 && table.rows[0][0].text === "物品" && table.rows[0][1].text === "数量"
      && table.rows[1][0].text === "纸箱" && table.rows[1][1].text === "20", "the 2×2 table's cell text comes through");
    test.assert(doc.paragraphs().some((p) => p.runs.some((r) => r.kind === "image")), "the inline PNG becomes an image run");
    test.assert(out.notCarried.includes("odf_skip_links") && out.notCarried.includes("odf_skip_cell_styles"),
      `the hyperlink and cell formatting are listed as not carried (got ${JSON.stringify(out.notCarried)})`);
  }

  {
    const ctx = session("app/vendor/clioworks-v3/ledger-adapter.js");
    const out = await convert(ctx, "sample.ods");
    test.assert(out.format === "xlsx" && out.fileName === "sample.xlsx", `sample.ods converts to a sample.xlsx copy (got ${out.format}/${out.fileName})`);
    test.assert(Array.isArray(out.notCarried), "notCarried is an array of translation keys");
    const wb = await openAdapter(ctx, "ClioWorksLedgerAdapter", out.bytes, "sample.xlsx");
    const names = wb.sheets().map((s) => s.name);
    test.assert(names.join("|") === "预算|说明", `both sheets come through in order (got ${names.join("|")})`);
    test.assert(wb.getCell("预算", "B2").value === 20 && wb.getCell("预算", "B3").value === 5, "the numeric cell values come through");
    test.assert(wb.getCell("预算", "A1").value === "物品" && wb.getCell("说明", "A1").value === "这个表记录搬家预算", "the string cells come through, on both sheets");
    test.assert(wb.getCell("说明", "A2").value === 123.45 && wb.getCell("说明", "A3").value === true, "a decimal and a boolean value come through");
    const sum = wb.getCell("预算", "B4");
    test.assert(sum.formula === "SUM(B2:B3)" && sum.value === 25, `of:=SUM([.B2:.B3]) translates 1:1 with its cached result (got ${sum.formula}/${sum.value})`);
    const current = wb.getCell("预算", "B5");
    test.assert(current.formula === null && current.value === 7, "the ODF-only CURRENT() formula is kept as its cached value, not as a formula");
    test.assert(out.notCarried.includes("odf_skip_formulas") && out.notCarried.includes("odf_skip_cell_styles"),
      `the untranslated formula and the cell formatting are listed as not carried (got ${JSON.stringify(out.notCarried)})`);
  }

  {
    const ctx = session("app/vendor/clioworks-v3/lectern-adapter.js");
    const out = await convert(ctx, "sample.odp");
    test.assert(out.format === "pptx" && out.fileName === "sample.pptx", `sample.odp converts to a sample.pptx copy (got ${out.format}/${out.fileName})`);
    test.assert(Array.isArray(out.notCarried), "notCarried is an array of translation keys");
    const deck = await openAdapter(ctx, "ClioWorksLecternAdapter", out.bytes, "sample.pptx");
    test.assert(deck.slideCount() === 2, `both slides come through (got ${deck.slideCount()})`);
    const texts = (index) => deck.runs(index).map((r) => r.text);
    test.assert(texts(0)[0] === "搬家简报" && texts(1)[0] === "第二天", `each slide's title frame opens as the title (got ${texts(0)[0]} / ${texts(1)[0]})`);
    test.assert(texts(0).includes("周六上午装箱。") && texts(0).includes("周日下午搬运。"), "the first slide's body paragraphs come through");
    test.assert(texts(1).includes("整理新家，先擦地板。"), "the second slide's body paragraph comes through");
    const secondSlideShapes = deck.shapes(deck.slides()[1].id).map((sh) => sh.kind);
    test.assert(secondSlideShapes.includes("image"), `the second slide's PNG opens as an image shape (got ${JSON.stringify(secondSlideShapes)})`);
    test.assert(out.notCarried.includes("odf_skip_slide_style") && out.notCarried.includes("odf_skip_objects"),
      `the dropped master styling and the embedded object are listed as not carried (got ${JSON.stringify(out.notCarried)})`);
  }

  {
    // A copy that cannot be made never costs the writer the original: copy()
    // reports the failure and appends nothing, so the .odt still imports.
    const ctx = session("app/vendor/clioworks-v3/quire-adapter.js");
    const result = await vm.runInContext(`(async () => {
      const files = [];
      const failures = [];
      const broken = { name: "broken.odt", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      const out = await AISystem6OdfImport.copy(broken, files, failures);
      return { out, files: files.length, failures: failures.map((f) => f.name) };
    })()`, ctx);
    test.assert(result.out === null && result.files === 0, `a broken ODF yields no copy and appends nothing (got ${JSON.stringify(result)})`);
    test.assert(result.failures.length === 1 && result.failures[0] === "broken.odt", "the conversion failure is reported for the original file");
  }

  test.finish();
};

run();
