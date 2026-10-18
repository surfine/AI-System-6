// ClioWorks v4 (V4-01) contract: native XLSX open/edit/save through the real
// vendored VibeOffice Ledger codec, verified against the PRODUCTION
// preservation contract (opaque byte-carry + declared XML semantics), on REAL
// output produced inside this test — the kit's pre-made candidate is never
// reused as a product result.
//
// Layers (INTEROPERABILITY.zh-CN §2):
//   1. codec loads headless; fixture opens; declared before-values read back
//   2. unedited save short-circuits to the ORIGINAL BYTES (adapter contract)
//   3. one declared edit; formulas/styles/custom XML survive; output is a
//      fresh serialization, not a byte copy of the kit candidate
//   4. production semantic guard passes on the real output
//   5. negative controls: tampered sheet name fails; kit synthetic sentinel
//      correctly rejects the real output (it demands single-part changes,
//      which real preserving writers never produce)
//   6. S11 M1 completion gate (spec section 6): the whole EDIT PATH through the real
//      ledger-adapter on the frozen budget-s11.xlsx -- value and formula edits, calc.js
//      results, save then re-parse cell by cell, shared formulas, number formats and
//      dates, cached values of untouched cells, comment add/reply round trips, and what
//      a save after undo contains. Assertions the adapter contract test already makes
//      (stale marking, undo labels, save modes, loss reports) are not repeated here.
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { buildBase, buildEdited, makeSession, sha256, ROOT_ID } from "../fixtures/clioworks-s11/roundtrip-1/make-roundtrip.mjs";

const test = createFeatureTest("clioworks-v4-ledger");

const FIXTURE_DIR = "tests/fixtures/clioworks-v4";
const ORIGINAL = `${FIXTURE_DIR}/creator-data.xlsx`;
const PRODUCTION_MAP = `${FIXTURE_DIR}/creator-data.production-map.json`;
const SYNTHETIC_CONTRACT = `${FIXTURE_DIR}/creator-data.contract.json`;
const KIT_CANDIDATE_SHA = "f057892717552d112a7b9dc08aaf4774f2920f2fe58060a8e62d5069c03643c9";

const CODEC_MODULES = [
  "app/vendor/vibeoffice/common/zip.js",
  "app/vendor/vibeoffice/common/xml.js",
  "app/vendor/vibeoffice/common/opc.js",
  "app/vendor/vibeoffice/common/opc-order.js",
  "app/vendor/vibeoffice/common/numfmt.js",
  "app/vendor/vibeoffice/common/crypto.js",
  "app/vendor/vibeoffice/common/dml.js",
  "app/vendor/vibeoffice/common/charts.js",
  "app/vendor/vibeoffice/ledger/xml.js",
  "app/vendor/vibeoffice/ledger/formula.js",
  "app/vendor/vibeoffice/ledger/model.js",
  "app/vendor/vibeoffice/ledger/preserve.js",
  "app/vendor/vibeoffice/ledger/extensions.js",
  "app/vendor/vibeoffice/ledger/pivots.js",
  "app/vendor/vibeoffice/ledger/threads.js",
  "app/vendor/vibeoffice/ledger/objects.js",
  "app/vendor/vibeoffice/ledger/slicers.js",
  "app/vendor/vibeoffice/ledger/tables.js",
  "app/vendor/vibeoffice/ledger/xchart.js",
  "app/vendor/vibeoffice/ledger/xlsx-read.js",
  "app/vendor/vibeoffice/ledger/xlsx-write.js",
];

function loadLedgerCodec() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error, globalThis: null,
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  for (const modulePath of CODEC_MODULES) {
    vm.runInContext(read(modulePath), context, { filename: modulePath });
  }
  return context;
}

function sha256Hex(buffer) {
  const result = spawnSync("shasum", ["-a", "256", "-"], { input: Buffer.from(buffer) });
  if (result.status !== 0) throw new Error(`shasum failed: ${result.stderr}`);
  return result.stdout.toString("utf8").trim().split(/\s+/)[0];
}

function runGuard(script, original, candidate, flag, value) {
  const result = spawnSync(
    "python3",
    [resolveProjectPath(script), resolveProjectPath(original), candidate, flag, resolveProjectPath(value)],
    { encoding: "utf8" }
  );
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { report = null; }
  return { status: result.status, report };
}

const run = async () => {
  const context = loadLedgerCodec();
  const L = context.L;
  test.assert(!!(L && L.xlsxRead && L.xlsxWrite && L.model), "the vendored Ledger codec loads in a bare vm context");

  const original = readFileSync(resolveProjectPath(ORIGINAL));
  const originalBytes = new Uint8Array(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength));

  // 1. Open the fixture through the real codec.
  context.__inputBytes = originalBytes;
  const wb = await vm.runInContext("L.xlsxRead.read(globalThis.__inputBytes, {})", context);
  test.assert(!!(wb && Array.isArray(wb.sheets) && wb.sheets.length >= 2), `fixture opens as a workbook with ${wb?.sheets?.length || 0} sheets`);
  const firstSheet = wb.sheets[0];
  const d5 = firstSheet.get(4, 3);
  const b9 = firstSheet.get(8, 1);
  const b10 = firstSheet.get(9, 1);
  test.assert(d5 && d5.v === "synthetic-log-01", `D5 reads back its declared before-value (${JSON.stringify(d5 && d5.v)})`);
  test.assert(b9 && typeof b9.f === "string" && b9.f.length > 0, `B9 keeps its formula (${JSON.stringify(b9 && b9.f)})`);
  test.assert(b10 && typeof b10.f === "string" && b10.f.length > 0, `B10 keeps its formula (${JSON.stringify(b10 && b10.f)})`);

  // 2. Adapter contract: an untouched document saves as the ORIGINAL BYTES.
  const adapterSource = read("app/vendor/clioworks-v3/ledger-adapter.js");
  test.assertIncludes(adapterSource, "mode: 'original-bytes'", "the adapter short-circuits an unedited save to the original bytes");
  test.assertIncludes(adapterSource, "mode: 'preserving-edit'", "the adapter only invokes the preserving writer after a real edit");

  // 3. One declared edit: D5 log identifier, everything else untouched.
  const beforeCell = firstSheet.rowObj(4).cells[3];
  test.assert(beforeCell && beforeCell.f == null, "D5 is a plain value cell (the declared non-formula edit)");
  firstSheet.rowObj(4).cells[3] = { ...beforeCell, v: "synthetic-log-01-reviewed" };
  context.__wb = wb;
  const edited = await vm.runInContext("L.xlsxWrite.bytes(globalThis.__wb, { type: 'xlsx' })", context);
  test.assert(edited instanceof Uint8Array && edited.length > 0, `edited workbook serializes to ${edited?.length || 0} bytes`);
  const editedSha = sha256Hex(edited);
  test.assert(editedSha !== KIT_CANDIDATE_SHA, "the produced output is a fresh serialization, not a byte copy of the kit's pre-made candidate");

  // 3b. Re-read the edited output: formulas survive, the edit landed.
  context.__editedBytes = edited;
  const reread = await vm.runInContext("L.xlsxRead.read(globalThis.__editedBytes, {})", context);
  const rereadSheet = reread.sheets[0];
  test.assert(rereadSheet.get(4, 3)?.v === "synthetic-log-01-reviewed", "D5 re-reads with the edited value");
  test.assert(typeof rereadSheet.get(8, 1)?.f === "string" && rereadSheet.get(8, 1).f.length > 0, `B9 formula survives the save (${JSON.stringify(rereadSheet.get(8, 1)?.f)})`);
  test.assert(typeof rereadSheet.get(9, 1)?.f === "string" && rereadSheet.get(9, 1).f.length > 0, `B10 formula survives the save (${JSON.stringify(rereadSheet.get(9, 1)?.f)})`);
  test.assert(Array.isArray(wb.losses) && wb.losses.filter((entry) => entry.action === "drop" && entry.notify).length === 0, "no user-facing drop losses were recorded during the save");

  // 4. Production preservation contract on the REAL output.
  const dir = mkdtempSync(join(tmpdir(), "cw4-ledger-"));
  const editedPath = join(dir, "real-output.xlsx");
  writeFileSync(editedPath, Buffer.from(edited));
  const semantic = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, editedPath, "--map", PRODUCTION_MAP);
  test.assert(semantic.status === 0 && semantic.report?.status === "passed",
    `production semantic guard passes on the real edited output (issues=${JSON.stringify(semantic.report?.issues?.slice(0, 3) || semantic.report)})`);
  test.assert(semantic.report?.opaqueBytePreservedParts?.includes("customXml/clw-preservation.xml"),
    "the unknown custom XML part is byte-preserved (opaque carry)");

  // 5a. Negative control: an undeclared content change must fail the guard.
  const tamperedPath = join(dir, "tampered.xlsx");
  const zip = spawnSync("python3", ["-c", `
import zipfile, sys
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    if item.filename == 'xl/workbook.xml':
        data = data.replace('name="测试记录"'.encode(), 'name="被改过的表"'.encode())
    zout.writestr(item, data)
zout.close()
`, editedPath, tamperedPath]);
  test.assert(zip.status === 0, "tampered package written for the negative control");
  const negative = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, tamperedPath, "--map", PRODUCTION_MAP);
  test.assert(negative.status === 1 && negative.report?.status === "failed"
    && negative.report.issues.some((issue) => issue.code === "LOCKED_ATTR_CHANGED"),
    "the semantic guard fails closed on an undeclared sheet-name change");

  // 5b. The kit's synthetic single-part sentinel must REJECT the real output —
  // proving the two layers are not conflated (real preserving writers
  // legitimately regenerate container metadata).
  const synthetic = runGuard("tooling/clioworks-v4/ooxml_guard.py", ORIGINAL, editedPath, "--contract", SYNTHETIC_CONTRACT);
  test.assert(synthetic.status === 1 && synthetic.report?.status === "failed",
    "the kit's synthetic sentinel still guards only its own pre-made candidate layer");
  const kitPair = runGuard("tooling/clioworks-v4/ooxml_guard.py", ORIGINAL,
    (() => { const p = join(dir, "kit-candidate.xlsx"); writeFileSync(p, readFileSync(resolveProjectPath(`${FIXTURE_DIR}/creator-data-edited.xlsx`))); return p; })(),
    "--contract", SYNTHETIC_CONTRACT);
  test.assert(kitPair.status === 0 && kitPair.report?.status === "passed",
    "the synthetic sentinel still passes on the kit's own pre-made candidate pair");


  // 6. S11 M1 completion gate: the edit path, end to end, on real output.
  await editPathGate(test);

  test.finish();
};

async function editPathGate(test) {
  const S = "预算";
  const DIR = "tests/fixtures/clioworks-s11";
  const budget = new Uint8Array(readFileSync(resolveProjectPath(`${DIR}/budget-s11.xlsx`)));
  const asBytes = (out) => new Uint8Array(out.bytes);
  const partText = (bytes, name) => { const entry = new AdmZip(Buffer.from(bytes)).getEntry(name); return entry ? entry.getData().toString("utf8") : null; };
  const rawCell = (bytes, ref) => (partText(bytes, "xl/worksheets/sheet1.xml").match(new RegExp(`<c r="${ref}"(?:[^>]*/>|[^>]*>.*?</c>)`)) || [null])[0];
  const rawV = (bytes, ref) => (rawCell(bytes, ref)?.match(/<v>(.*?)<\/v>/) || [])[1] ?? null;
  const rawS = (bytes, ref) => (rawCell(bytes, ref)?.match(/ s="(\d+)"/) || [])[1] ?? "0";
  const refsOf = () => { const out = []; for (let r = 1; r <= 12; r += 1) for (const c of "ABCDEFGHI") out.push(`${c}${r}`); return out; };
  /** Every cell of both sheets as the adapter reads it: value, formula, style, shown text. */
  const grid = (a) => {
    const g = {};
    for (const sheet of a.sheets().map((x) => x.name)) {
      for (const ref of refsOf()) {
        const c = a.getCell(sheet, ref);
        g[`${sheet}!${ref}`] = JSON.stringify({ v: c.value ?? null, f: c.formula ?? null, s: c.style ?? null, shown: a.displayText(sheet, ref) });
      }
    }
    return g;
  };
  const diff = (x, y) => Object.keys(x).filter((k) => x[k] !== y[k]);
  const open = async (bytes) => makeSession().open(bytes);

  // 6a. The committed round trip (1) files are the product of the current codec, byte for byte.
  {
    const base = buildBase();
    const first = await buildEdited(base);
    const second = await buildEdited(buildBase());
    test.assert(sha256(first.bytes) === sha256(second.bytes), "rebuilding the round trip (1) file twice gives the same bytes (frozen clock, counting GUIDs)");
    const committed = readFileSync(resolveProjectPath(`${DIR}/roundtrip-1/edited.xlsx`));
    test.assert(sha256(committed) === sha256(first.bytes),
      "roundtrip-1/edited.xlsx is what the current codec writes (rerun make-roundtrip.mjs and update the Excel/LibreOffice record when this fails)");
  }

  // 6b. Value edit -> calc.js -> save -> re-parse, cell by cell, against hand arithmetic.
  {
    const a = await open(budget);
    const original = grid(a);
    a.setCell(S, "B2", { value: 250 });
    await a.ensureCalc();
    await a.recalc([{ sheet: S, ref: "B2" }]);
    const hand = { D2: 250 * 6, D12: 10220 - 1320 + 1500 };
    test.assert(a.getCell(S, "D2").value === hand.D2 && a.getCell(S, "D12").value === hand.D12, `recalc gives D2=${hand.D2} and D12=${hand.D12} (got ${a.getCell(S, "D2").value}, ${a.getCell(S, "D12").value})`);
    const live = grid(a);
    const out = await a.save();
    test.assert(out.mode === "preserving-edit", "the edited, recalculated workbook saves through the preserving writer");
    const back = grid(await open(asBytes(out)));
    const changed = diff(live, back);
    test.assert(changed.length === 0, `re-parsing the saved bytes matches the live model on all ${Object.keys(live).length} cells of both sheets (differs: ${changed.slice(0, 6).join(",")})`);
    const moved = diff(original, back).map((k) => k.split("!")[1]).sort();
    test.assert(moved.join() === "B2,D12,D2,G2,G3,G4,G5,G6,G7,G8".split(",").sort().join(),
      `exactly the edited cell and its dependents differ from the original (${moved.join(",")})`);
    test.assert(rawV(asBytes(out), "D2") === "1500" && rawV(asBytes(out), "B2") === "250", "the new numbers are in the saved XML as cached values");
    test.assert(Math.abs(Number(rawV(asBytes(out), "G2")) - 1500 / 10400) < 1e-12, "the share column carries the recomputed cache (G2 = 1500 / 10400)");
  }

  // 6c. Formula edits: a shared-formula child, the shared master, and the children around them.
  {
    const a = await open(budget);
    const originalFormulas = Object.fromEntries(["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "G2", "G3", "G8"].map((r) => [r, a.getCell(S, r).formula]));
    test.assert(originalFormulas.D4 === "B4*C4" && originalFormulas.D10 === "B10*C10" && originalFormulas.G8 === "D8/$D$12",
      `the shared-formula children read as their own translated formulas (${JSON.stringify(originalFormulas)})`);
    a.setCell(S, "D3", { formula: "B3*C3*2" });
    await a.ensureCalc();
    await a.recalc([{ sheet: S, ref: "D3" }]);
    test.assert(a.getCell(S, "D3").value === 240 && a.getCell(S, "D12").value === 10340, `D3 = 30 x 4 x 2 = 240 and the total follows (D12 ${a.getCell(S, "D12").value})`);
    const bytes = asBytes(await a.save());
    const b = await open(bytes);
    test.assert(b.getCell(S, "D3").formula === "B3*C3*2" && b.getCell(S, "D3").value === 240, "the edited child keeps its own formula and result after save");
    for (const ref of ["D2", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "G2", "G3", "G8"]) {
      test.assert(b.getCell(S, ref).formula === originalFormulas[ref], `${ref} keeps ${originalFormulas[ref]} after a sibling in its shared group was edited (got ${b.getCell(S, ref).formula})`);
    }
    test.assert(b.getCell(S, "D9").value?.e === "#VALUE!" && rawCell(bytes, "D9").includes('t="e"'), "D9 is still the cached #VALUE! error, typed as an error cell");

    // Editing the master must not rewrite its children.
    const m = await open(budget);
    m.setCell(S, "D2", { formula: "B2*C2+1" });
    const mb = await open(asBytes(await m.save()));
    test.assert(mb.getCell(S, "D2").formula === "B2*C2+1", "the master cell takes its new formula");
    test.assert(["D3", "D4", "D5", "D8", "D10"].every((ref) => mb.getCell(S, ref).formula === originalFormulas[ref] || mb.getCell(S, ref).formula === `B${ref.slice(1)}*C${ref.slice(1)}`),
      "editing the shared master leaves every child with its own row's formula");
    test.assert(mb.getCell(S, "D3").value === 120 && mb.getCell(S, "D4").value === 2600, "and the children's cached results are untouched");
  }

  // 6d. Number formats and dates survive an edit of the cell itself and of its neighbours.
  {
    const a = await open(budget);
    const before = grid(a);
    test.assert(before[`${S}!C2`].includes("¥6") && before[`${S}!G2`].includes("12.9%") && before[`${S}!H2`].includes("2026年10月5日") && before[`${S}!H3`].includes("10/6/2026"),
      "setup: currency, percent, custom date and built-in date formats display as designed");
    a.setCell(S, "C2", { value: 7 });          // an edited cell keeps its own format
    a.setCell(S, "H2", { value: 46301 });      // a date edited as a serial keeps the custom format
    a.setCell(S, "H3", { value: 46302 });      // and the built-in one
    await a.ensureCalc();
    await a.recalc([{ sheet: S, ref: "C2" }]);
    const bytes = asBytes(await a.save());
    const b = await open(bytes);
    test.assert(b.displayText(S, "C2") === "¥7" && b.displayText(S, "H2") === "2026年10月6日" && b.displayText(S, "H3") === "10/7/2026",
      `edited cells keep their number format (${b.displayText(S, "C2")}, ${b.displayText(S, "H2")}, ${b.displayText(S, "H3")})`);
    test.assert(b.displayText(S, "G3").endsWith("%") && b.displayText(S, "D4") === "¥2,600", "recalculated and untouched formula cells keep theirs");
    const styles = partText(bytes, "xl/styles.xml");
    for (const code of ["&quot;¥&quot;#,##0", "0.0%", "yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;"]) test.assert(styles.includes(`formatCode="${code}"`), `styles.xml still declares ${code}`);
    test.assert(["C2", "H2", "H3", "G2", "D2"].every((ref) => rawS(bytes, ref) === String({ C2: 2, H2: 4, H3: 5, G2: 3, D2: 2 }[ref])), "cell style indexes in the saved sheet are unchanged");
    test.assert(rawV(bytes, "H2") === "46301" && !/t="s"/.test(rawCell(bytes, "H2")), "a date stays a serial number, not text");
  }

  // 6e. Cached values: a cell the edit does not reach keeps its original cached <v> text verbatim.
  {
    const a = await open(budget);
    a.setCell(S, "B2", { value: 250 });
    a.setCell(S, "D3", { formula: "B3*C3*2" });
    await a.ensureCalc();
    await a.recalc([{ sheet: S, ref: "B2" }, { sheet: S, ref: "D3" }]);
    const bytes = asBytes(await a.save());
    const untouched = ["D4", "D5", "D6", "D7", "D8", "D9", "D10", "H2", "H3", "B3", "B4", "C2"];
    const differing = untouched.filter((ref) => rawV(bytes, ref) !== rawV(budget, ref));
    test.assert(differing.length === 0, `the cached values of untouched cells are byte-identical to the original's (differ: ${differing.join(",")})`);
    test.assert(rawV(bytes, "D12") === "10520" && /t="str"/.test(rawCell(bytes, "F12")) && rawV(bytes, "F12") === "另有 1 项未测", "reached cells carry fresh results of the right type (D12 number, F12 string)");

    // Saved without recalculating: no stale number is passed off as a result, and Excel is told to recalculate.
    const s = await open(budget);
    s.setCell(S, "B2", { value: 250 });
    const stale = asBytes(await s.save());
    test.assert(rawV(stale, "D2") === null && rawV(stale, "D12") === null, "a stale formula is saved with no cached value, never the old number");
    test.assert(/<calcPr[^>]*fullCalcOnLoad="1"/.test(partText(stale, "xl/workbook.xml")), "and the workbook asks the next reader to recalculate on load");
  }

  // 6f. Undo, then save: the content equals the original; the bytes are a fresh serialization.
  {
    const a = await open(budget);
    const original = grid(a);
    await a.ensureCalc();
    a.setCell(S, "B2", { value: 250 });
    a.setCell(S, "D3", { formula: "B3*C3*2" });
    await a.recalc([{ sheet: S, ref: "B2" }, { sheet: S, ref: "D3" }]);
    a.undo(); a.undo();
    test.assert(a.isDirty() === true && a.stale(S).length === 0, "after undoing every edit the workbook is still dirty (by design) and nothing is stale");
    const out = await a.save();
    test.assert(out.mode === "preserving-edit", "a dirty workbook saves through the writer even when its content is back to the original");
    const bytes = asBytes(out);
    const changed = diff(original, grid(await open(bytes)));
    test.assert(changed.length === 0, `the saved content after undo equals the original on every cell (differs: ${changed.join(",")})`);
    test.assert(["D2", "D3", "D12", "G2", "B2"].every((ref) => rawV(bytes, ref) === rawV(budget, ref)), "the original cached results are back in the XML (D2, D3, D12, G2, B2)");
    test.assert(bytes.length !== budget.length || bytes.some((x, i) => x !== budget[i]), "the bytes are a fresh serialization, not the original file");

    // Without the evaluator, undo cannot restore the old results: they are stale and saved without a cache.
    const b = await open(budget);
    b.setCell(S, "B2", { value: 250 });
    b.undo();
    const sb = asBytes(await b.save());
    test.assert(b.stale(S).includes("D2") && rawV(sb, "D2") === null && rawV(sb, "B2") === "220", "undo without the evaluator restores the input and leaves its dependents stale (no cache), not wrong");
  }

  // 6g. Comments: add on a plain cell, reply on a thread, save, re-open, edit again, save again.
  {
    const base = buildBase();
    const a = await open(base);
    const rootBefore = a.comments(S).filter((c) => !c.parentId);
    const note = a.addComment(S, "A2", { author: "阿澄", text: "核对数量", date: "2026-10-16" });
    const reply = a.replyComment(S, ROOT_ID, { author: "小禾", text: "收到", date: "2026-10-16T08:30:00.00" });
    test.assert(note.id && reply.id && a.comments(S).length === 4, "a note and a reply are added to the thread-bearing workbook");
    const gen1 = asBytes(await a.save());
    const b = await open(gen1);
    const list = b.comments(S);
    const byRef = (ref) => list.filter((c) => c.ref === ref);
    test.assert(byRef("A2").length === 1 && byRef("A2")[0].text === "核对数量" && byRef("A2")[0].author === "阿澄" && !byRef("A2")[0].threaded, "the note on A2 survives with its text and author");
    test.assert(byRef("B2").length === 3 && byRef("B2").filter((c) => c.parentId === ROOT_ID).map((c) => c.text).join("|") === "已确认，按 6 元算|收到",
      `the B2 thread keeps root, old reply and the new reply in order (${byRef("B2").map((c) => c.text).join("|")})`);
    test.assert(rootBefore.length === 1 && byRef("B2")[0].id === ROOT_ID, "the thread root keeps its id");
    // second generation: edit a cell, add a second reply, save again
    b.setCell(S, "B3", { value: 31 });
    const reply2 = b.replyComment(S, ROOT_ID, { author: "阿澄", text: "好", date: "2026-10-16T09:00:00.00" });
    const gen2 = asBytes(await b.save());
    const c = await open(gen2);
    const thread = c.comments(S).filter((x) => x.ref === "B2");
    test.assert(reply2.id && thread.length === 4 && thread.at(-1).text === "好" && c.comments(S).some((x) => x.ref === "A2"),
      "a second save cycle keeps the first generation's comments and adds the new reply");
    const frag = partText(gen2, "xl/threadedComments/threadedComment1.xml");
    test.assert(frag.includes(`id="${reply.id}"`) && frag.includes("<text>收到</text>"), "the first-generation reply is written back verbatim in the second generation");
    test.assert(c.getCell(S, "B3").value === 31 && c.getCell(S, "D2").formula === "B2*C2", "cell edits and formulas ride along with the comment edits");
    const rep = await c.exportReport();
    test.assert(rep.lost.length === 0 && rep.converted.length === 0, "the comment round trips lose and convert nothing");
  }
}

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
