// ClioWorks v4 (V4-01) contract: native DOCX open/edit/save through the REAL
// vendored VibeOffice Quire codec via the REAL quire-adapter (its loadCodec is
// driven by a script-tag emulation inside a bare vm), verified against the
// PRODUCTION preservation map — the kit's pre-made candidate is never reused
// as a product result.
//
// Layers:
//   1. the adapter loads its own module chain and opens the fixture
//   2. an untouched save short-circuits to the ORIGINAL BYTES (adapter contract)
//   3. one declared run-text edit; comments/latentStyles survive; output is a
//      fresh serialization, not a byte copy of the kit candidate
//   4. production semantic guard passes on the real output
//   5. negative controls: undeclared text tamper and opaque-part drop fail closed;
//      the kit's synthetic sentinel correctly rejects the real output
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-quire");

const FIXTURE_DIR = "tests/fixtures/clioworks-v4";
const ORIGINAL = `${FIXTURE_DIR}/creator-script.docx`;
const PRODUCTION_MAP = `${FIXTURE_DIR}/creator-script.production-map.json`;
const SYNTHETIC_CONTRACT = `${FIXTURE_DIR}/creator-script.contract.json`;
const KIT_CANDIDATE_SHA = "9ba1081afd91251deda91ed40dcd55633a53fef239f8ea0b394039f686ba15eb";
const BEFORE = "这次导出用了 42 秒。它没有快到让人忘记等待，但足够让我把这一期视频做完。";
const AFTER = "这次导出耗时 42 秒。它没有快到让人忘记等待，但足够让我把这一期视频做完。";

function makeContext() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error, Object, Array, String, Number, Boolean, Symbol, Proxy, Reflect,
    navigator: { platform: "MacIntel", userAgent: "clioworks-v4-quire-test" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {},
  };
  context.globalThis = context;
  context.window = context;
  context.Node = function Node() {};
  // Script-tag emulation for the adapter's loadCodec(): every appended script
  // is executed from the vendored tree, then its load event fires.
  context.document = {
    createElement: (tag) => ({ tagName: tag, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} }),
    createElementNS: (ns, tag) => ({ tagName: tag, namespaceURI: ns, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} }),
    createTextNode: (text) => ({ text }),
    addEventListener() {},
    body: { appendChild() {}, removeChild() {} },
    documentElement: { style: { setProperty() {} } },
    head: {
      appendChild(el) {
        queueMicrotask(() => {
          try {
            vm.runInContext(read(el.src), context, { filename: el.src });
            el.onload();
          } catch (error) {
            el.onerror(new Error(String(error && error.message || error)));
          }
        });
      },
    },
  };
  vm.createContext(context);
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
  // 1. Load the real adapter in a bare vm through its own loadCodec.
  const context = makeContext();
  vm.runInContext(read("app/vendor/clioworks-v3/quire-adapter.js"), context, { filename: "quire-adapter.js" });
  const adapterFactory = context.ClioWorksQuireAdapter;
  test.assert(!!adapterFactory, "the vendored Quire adapter installs itself");

  const original = readFileSync(resolveProjectPath(ORIGINAL));
  const originalBytes = new Uint8Array(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength));
  context.__originalBytes = originalBytes;

  const opened = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__originalBytes, { name: 'creator-script.docx', documentId: 'test:docx' })", context);
  test.assert(!!opened && opened.kind === "docx", "the adapter opens the fixture as a docx document");

  const target = opened.paragraphs().find((p) => p.text.includes(BEFORE));
  test.assert(!!target, "the declared before-value is present in a paragraph");
  const run = opened.runs(target.id).find((r) => r.text === BEFORE);
  test.assert(!!run, "the paragraph exposes the exact target run");
  test.assert(opened.comments().length >= 1 && opened.comments().some((c) => c.text.length > 0),
    `the fixture's comment survives the read (${opened.comments().length} comments)`);

  // 2. Adapter contract strings (same modes as the Ledger adapter).
  const adapterSource = read("app/vendor/clioworks-v3/quire-adapter.js");
  test.assertIncludes(adapterSource, "mode: 'original-bytes'", "the adapter short-circuits an unedited save to the original bytes");
  test.assertIncludes(adapterSource, "mode: 'preserving-edit'", "the adapter only invokes the preserving writer after a real edit");

  // 2b. An untouched document saves as the ORIGINAL BYTES.
  const untouched = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__originalBytes, { name: 'creator-script.docx' })", context);
  const untouchedSave = await untouched.save();
  test.assert(untouchedSave.mode === "original-bytes" && untouchedSave.bytes.byteLength === originalBytes.byteLength
    && sha256Hex(untouchedSave.bytes) === sha256Hex(originalBytes),
    "an unedited docx save returns byte-identical original bytes");

  // 3. One declared edit: the target run's text, nothing else.
  opened.setRunText(target.id, run.runIndex, AFTER);
  test.assert(opened.isDirty() && opened.getEditRevision() === 1 && opened.touched().length === 1,
    "the edit marks the document dirty with one touched run");
  const saved = await opened.save();
  test.assert(saved.mode === "preserving-edit" && saved.bytes.byteLength > 0,
    `the edited document serializes to ${saved.bytes.byteLength} bytes`);
  const savedSha = sha256Hex(saved.bytes);
  test.assert(savedSha !== KIT_CANDIDATE_SHA, "the produced output is a fresh serialization, not a byte copy of the kit's pre-made candidate");

  // 3b. Re-read the edited output: edit landed, comment + latentStyles survive.
  context.__editedBytes = new Uint8Array(saved.bytes);
  const reread = await vm.runInContext("(async () => { const r = await ClioWorksQuireAdapter.open(globalThis.__editedBytes, { name: 'reread.docx' }); return { text: r.paragraphs().map(p => p.text).join('\\n'), comments: r.comments(), latent: r.document().latentStylesXML }; })()", context);
  test.assert(reread.text.includes(AFTER) && !reread.text.includes(BEFORE), "the re-read document carries exactly the edited run");
  test.assert(reread.comments.length >= 1 && reread.comments.some((c) => c.text.length > 0), "comments survive the preserving save");
  test.assert(typeof reread.latent === "string" && reread.latent.includes("latentStyles"), "the carried w:latentStyles survives the save (documented deviation)");

  // 4. Production preservation contract on the REAL output.
  const dir = mkdtempSync(join(tmpdir(), "cw4-quire-"));
  const editedPath = join(dir, "real-output.docx");
  writeFileSync(editedPath, Buffer.from(saved.bytes));
  const semantic = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, editedPath, "--map", PRODUCTION_MAP);
  test.assert(semantic.status === 0 && semantic.report?.status === "passed",
    `production semantic guard passes on the real edited output (issues=${JSON.stringify(semantic.report?.issues?.slice(0, 3) || semantic.report)})`);
  test.assert(semantic.report?.opaqueBytePreservedParts?.includes("customXml/clw-preservation.xml"),
    "the unknown custom XML part is byte-preserved (opaque carry)");

  // 5a. Negative control: an undeclared body text change must fail the guard.
  const tampered = join(dir, "tampered.docx");
  const zip = spawnSync("python3", ["-c", `
import zipfile, sys
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    if item.filename == 'word/document.xml':
        data = data.replace('一台旧电脑，够不够完成一期视频？'.encode(), '一台旧电脑，能不能完成一期视频？'.encode())
    zout.writestr(item, data)
zout.close()
`, editedPath, tampered]);
  test.assert(zip.status === 0, "tampered package written for the negative control");
  const negative = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, tampered, "--map", PRODUCTION_MAP);
  test.assert(negative.status === 1 && negative.report?.status === "failed"
    && negative.report.issues.some((issue) => issue.code === "LOCKED_TEXT_CHANGED"),
    "the semantic guard fails closed on an undeclared body text change");

  // 5b. Negative control: dropping the opaque custom XML part must fail the guard.
  const dropped = join(dir, "dropped.docx");
  const drop = spawnSync("python3", ["-c", `
import zipfile, sys
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    if item.filename == 'customXml/clw-preservation.xml': continue
    zout.writestr(item, zin.read(item.filename))
zout.close()
`, editedPath, dropped]);
  test.assert(drop.status === 0, "dropped-part package written for the negative control");
  const negativeDrop = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, dropped, "--map", PRODUCTION_MAP);
  test.assert(negativeDrop.status === 1 && negativeDrop.report?.issues?.some((issue) => issue.code === "PART_DROPPED"),
    "the semantic guard fails closed when an opaque part is dropped");

  // 5c. The kit's synthetic single-part sentinel must REJECT the real output —
  // the two layers are not conflated.
  const synthetic = runGuard("tooling/clioworks-v4/ooxml_guard.py", ORIGINAL, editedPath, "--contract", SYNTHETIC_CONTRACT);
  test.assert(synthetic.status === 1 && synthetic.report?.status === "failed",
    "the kit's synthetic sentinel still guards only its own pre-made candidate layer");
  const kitPair = runGuard("tooling/clioworks-v4/ooxml_guard.py", ORIGINAL,
    (() => { const p = join(dir, "kit-candidate.docx"); writeFileSync(p, readFileSync(resolveProjectPath(`${FIXTURE_DIR}/creator-script-edited.docx`))); return p; })(),
    "--contract", SYNTHETIC_CONTRACT);
  test.assert(kitPair.status === 0 && kitPair.report?.status === "passed",
    "the synthetic sentinel still passes on the kit's own pre-made candidate pair");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
