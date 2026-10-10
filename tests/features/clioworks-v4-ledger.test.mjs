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
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

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

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
