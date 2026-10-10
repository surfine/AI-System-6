// ClioWorks v4 (V4-04) contract: data references and the editable-object
// handover — range capture through the REAL Ledger adapter, blank ≠ zero,
// hidden sheets out by default, declared-span application, embed source state.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-datarefs");

function makeContext() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error, Object, Array, String, Number, Boolean, Symbol, Proxy, Reflect,
    navigator: { platform: "MacIntel" }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "http://localhost/" }, addEventListener() {}, removeEventListener() {},
  };
  context.globalThis = context;
  context.window = context;
  context.Node = function Node() {};
  context.document = {
    createElement: (t) => ({ tagName: t, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} }),
    createElementNS: (ns, t) => ({ tagName: t, namespaceURI: ns, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} }),
    createTextNode: (x) => ({ text: x }), addEventListener() {},
    body: { appendChild() {}, removeChild() {} }, documentElement: { style: { setProperty() {} } },
    head: { appendChild(el) { queueMicrotask(() => { try { vm.runInContext(read(el.src), context, { filename: el.src }); el.onload(); } catch (error) { el.onerror(new Error(String(error && error.message || error))); } }); } },
  };
  vm.createContext(context);
  return context;
}

const run = async () => {
  const context = makeContext();
  vm.runInContext(read("app/core/edit-embeds.js"), context, { filename: "edit-embeds.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/data-references.js"), context, { filename: "data-references.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/ledger-adapter.js"), context, { filename: "ledger-adapter.js" });
  const refs = context.AISystem6DataReferences;
  test.assert(!!refs, "data-references installs beside core/edit-embeds");

  const bytes = readFileSync(resolveProjectPath("tests/fixtures/clioworks-v4/creator-data.xlsx"));
  context.__bytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const xlsx = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: 'creator-data.xlsx', documentId: 'data:1', generation: 1 })", context);
  const sheets = xlsx.sheets();
  test.assert(sheets.length >= 2, `the fixture workbook has ${sheets.length} sheets`);

  // Hidden sheets stay out unless explicitly included. The gate is exercised
  // through a minimal workbook stub (the fixture has no hidden sheet); the
  // real adapter covers every other assertion in this contract.
  const hiddenStub = {
    sheets: () => [{ name: "visible", id: "1", state: "visible" }, { name: "秘密", id: "2", state: "hidden" }],
    getCell: () => ({ exists: false }),
  };
  let refused = false;
  let code = "";
  try { refs.captureRangeReference({ documentId: "stub:1", generation: 1 }, hiddenStub, "秘密", "A1:B2"); } catch (e) { refused = true; code = e.code; }
  test.assert(refused && code === "HIDDEN_SHEET", "capturing a hidden sheet refuses with HIDDEN_SHEET by default");
  const included = refs.captureRangeReference({ documentId: "stub:1", generation: 1 }, hiddenStub, "秘密", "A1:B2", { includeHidden: true });
  test.assert(included.includedHidden === true && included.sheetState === "hidden", "an explicit include records the hidden state it chose to carry");

  // Range capture on the visible sheet: values, formulas, blanks.
  const reference = refs.captureRangeReference({ documentId: xlsx.documentId, generation: 1 }, xlsx, sheets[0].name, "D5");
  test.assert(reference.cells.length === 1 && reference.cells[0].value === "synthetic-log-01" && reference.cells[0].literal,
    "D5 captures with its literal value and revision");
  const wide = refs.captureRangeReference({ documentId: xlsx.documentId, generation: 1 }, xlsx, sheets[0].name, "D5:F5");
  const blanks = wide.cells.filter((c) => c.blank);
  test.assert(blanks.length >= 1 && blanks.every((c) => !("value" in c)),
    "empty cells record { blank: true } — blank never becomes zero");

  // Declared-span application: needle = the before-capture's value,
  // replacement = the after-capture's value; exact occurrence, no reflow.
  xlsx.setCell(sheets[0].name, "D5", { value: "synthetic-log-01-reviewed" });
  const editedReference = refs.captureRangeReference({ documentId: xlsx.documentId, generation: 1 }, xlsx, sheets[0].name, "D5");
  const paragraph = "导出日志是 synthetic-log-01，等待时间记在正文里。";
  const spans = refs.spansBetween(reference, editedReference);
  test.assert(spans.length === 1 && spans[0].needle === "synthetic-log-01" && spans[0].value === "synthetic-log-01-reviewed",
    "spansBetween pairs the before-value needle with the after-value replacement");
  const updated = refs.applySpans(paragraph, spans);
  test.assert(updated.includes("synthetic-log-01-reviewed") && updated.startsWith("导出日志是 "),
    "the declared span applies at its one occurrence");
  let ambiguous = "";
  const twice = "日志 synthetic-log-01 与重复 synthetic-log-01。";
  try { refs.applySpans(twice, spans); } catch (e) { ambiguous = e.code; }
  test.assert(ambiguous === "SPAN_AMBIGUOUS", "a needle occurring twice refuses (no wholesale replace)");
  const pinned = refs.applySpans(twice, spans, { positions: [twice.indexOf("synthetic-log-01", 10)] });
  test.assert(pinned.startsWith("日志 synthetic-log-01 与重复 synthetic-log-01-reviewed"),
    "a pinned position applies at the chosen occurrence only");
  let moved = "";
  try { refs.applySpans("文字已改。", spans, { positions: [0] }); } catch (e) { moved = e.code; }
  test.assert(moved === "SPAN_MOVED", "a pinned span whose needle moved refuses");

  // Reference state semantics against the copy revision.
  const beforeRev = reference.rev;
  const afterEditRev = editedReference.rev;
  test.assert(afterEditRev !== beforeRev, "the copy's revision changes when the captured cells change");
  const source = refs.embedSource(reference);
  test.assert(source.ref === `${reference.sheetId}!${reference.range}` && source.rev === beforeRev,
    "the embed handover carries the copy's source ref and revision");
  test.assert(refs.referenceState(reference, afterEditRev) === "changed" && refs.referenceState(reference, beforeRev) === "current",
    "sourceState reports changed/current against the copy revision — a changed original is offered, never applied");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
