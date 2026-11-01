// ClioWorks v4 (V4-01) contract: native PPTX open/edit/save through the REAL
// vendored VibeOffice Lectern codec via the REAL lectern-adapter (its loadCodec
// is driven by a script-tag emulation inside a bare vm), verified against the
// PRODUCTION preservation map — the kit's pre-made candidate is never reused
// as a product result.
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-lectern");

const FIXTURE_DIR = "tests/fixtures/clioworks-v4";
const ORIGINAL = `${FIXTURE_DIR}/creator-slides.pptx`;
const PRODUCTION_MAP = `${FIXTURE_DIR}/creator-slides.production-map.json`;
const SYNTHETIC_CONTRACT = `${FIXTURE_DIR}/creator-slides.contract.json`;
const KIT_CANDIDATE_SHA = "81498de4f543209ad53845b72dcc82a5e4896227fe02c4c88a401c3b9490c47e";
const BEFORE = "一次导出：42 秒";
const AFTER = "一次导出用了 42 秒";

function makeContext() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error, Object, Array, String, Number, Boolean, Symbol, Proxy, Reflect,
    navigator: { platform: "MacIntel", userAgent: "clioworks-v4-lectern-test" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {},
  };
  context.globalThis = context;
  context.window = context;
  context.Node = function Node() {};
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
  vm.runInContext(read("app/vendor/clioworks-v3/lectern-adapter.js"), context, { filename: "lectern-adapter.js" });
  test.assert(!!context.ClioWorksLecternAdapter, "the vendored Lectern adapter installs itself");

  const original = readFileSync(resolveProjectPath(ORIGINAL));
  const originalBytes = new Uint8Array(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength));
  context.__originalBytes = originalBytes;

  const opened = await vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__originalBytes, { name: 'creator-slides.pptx', documentId: 'test:pptx' })", context);
  test.assert(!!opened && opened.kind === "pptx" && opened.slideCount() === 2, "the adapter opens the fixture as a 2-slide presentation");

  const firstSlideRuns = opened.runs(0);
  const target = firstSlideRuns.find((r) => r.text === BEFORE);
  test.assert(!!target, "slide 1 exposes the declared before-value as an editable native run");
  test.assert(opened.notes(0).length > 0 && opened.notes(1).length > 0, "speaker notes read back for both slides");

  // 2. Adapter contract strings (same modes as the Ledger/Quire adapters).
  const adapterSource = read("app/vendor/clioworks-v3/lectern-adapter.js");
  test.assertIncludes(adapterSource, "mode: 'original-bytes'", "the adapter short-circuits an unedited save to the original bytes");
  test.assertIncludes(adapterSource, "mode: 'preserving-edit'", "the adapter only invokes the preserving writer after a real edit");

  // 2b. An untouched presentation saves as the ORIGINAL BYTES.
  const untouched = await vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__originalBytes, { name: 'creator-slides.pptx' })", context);
  const untouchedSave = await untouched.save();
  test.assert(untouchedSave.mode === "original-bytes" && sha256Hex(untouchedSave.bytes) === sha256Hex(originalBytes),
    "an unedited pptx save returns byte-identical original bytes");

  // 3. One declared edit: the title run's text, nothing else.
  opened.setRunText(0, target.index, AFTER);
  test.assert(opened.isDirty() && opened.getEditRevision() === 1 && opened.touched().length === 1,
    "the edit marks the presentation dirty with one touched run");
  const saved = await opened.save();
  test.assert(saved.mode === "preserving-edit" && saved.bytes.byteLength > 0,
    `the edited presentation serializes to ${saved.bytes.byteLength} bytes`);
  const savedSha = sha256Hex(saved.bytes);
  test.assert(savedSha !== KIT_CANDIDATE_SHA, "the produced output is a fresh serialization, not a byte copy of the kit's pre-made candidate");

  // 3b. Re-read the edited output: edit landed, notes survive, no stale text.
  context.__editedBytes = new Uint8Array(saved.bytes);
  const reread = await vm.runInContext("(async () => { const d = await ClioWorksLecternAdapter.open(globalThis.__editedBytes, { name: 'reread.pptx' }); const texts = []; for (let i = 0; i < d.slideCount(); i++) for (const r of d.runs(i)) texts.push(r.text); return { texts, notes: [d.notes(0), d.notes(1)] }; })()", context);
  test.assert(reread.texts.includes(AFTER) && !reread.texts.includes(BEFORE), "the re-read presentation carries exactly the edited run");
  test.assert(reread.notes.every((n) => typeof n === "string" && n.length > 0), "speaker notes survive the preserving save");

  // 4. Production preservation contract on the REAL output.
  const dir = mkdtempSync(join(tmpdir(), "cw4-lectern-"));
  const editedPath = join(dir, "real-output.pptx");
  writeFileSync(editedPath, Buffer.from(saved.bytes));
  const semantic = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, editedPath, "--map", PRODUCTION_MAP);
  test.assert(semantic.status === 0 && semantic.report?.status === "passed",
    `production semantic guard passes on the real edited output (issues=${JSON.stringify(semantic.report?.issues?.slice(0, 3) || semantic.report)})`);
  test.assert(semantic.report?.opaqueBytePreservedParts?.includes("ppt/notesSlides/notesSlide1.xml")
    && semantic.report?.opaqueBytePreservedParts?.includes("ppt/theme/theme1.xml"),
    "theme and notes slides are byte-preserved (opaque carry)");

  // 5a. Negative control: an undeclared text change on another slide must fail.
  const tampered = join(dir, "tampered.pptx");
  const zip = spawnSync("python3", ["-c", `
import zipfile, sys
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    if item.filename == 'ppt/slides/slide2.xml':
        data = data.replace('先给出证据，再说明边界'.encode(), '先给出证据，再隐藏边界'.encode())
    zout.writestr(item, data)
zout.close()
`, editedPath, tampered]);
  test.assert(zip.status === 0, "tampered package written for the negative control");
  const negative = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, tampered, "--map", PRODUCTION_MAP);
  test.assert(negative.status === 1 && negative.report?.status === "failed"
    && negative.report.issues.some((issue) => issue.code === "LOCKED_TEXT_CHANGED"),
    "the semantic guard fails closed on an undeclared slide-2 text change");

  // 5b. Negative control: an opaque byte change (speaker notes part) must fail.
  const notesTampered = join(dir, "notes-tampered.pptx");
  const notesZip = spawnSync("python3", ["-c", `
import zipfile, sys
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    if item.filename == 'ppt/notesSlides/notesSlide1.xml':
        data = data.replace(b'<', b'<!--x--><', 1)
    zout.writestr(item, data)
zout.close()
`, editedPath, notesTampered]);
  test.assert(notesZip.status === 0, "notes-tampered package written for the negative control");
  const negativeNotes = runGuard("tooling/clioworks-v4/ooxml_semantic_guard.py", ORIGINAL, notesTampered, "--map", PRODUCTION_MAP);
  test.assert(negativeNotes.status === 1 && negativeNotes.report?.issues?.some((issue) => issue.code === "OPAQUE_BYTE_CHANGE"),
    "the semantic guard fails closed when an opaque notes part changes bytes");

  // 5c. The kit's synthetic single-part sentinel must REJECT the real output.
  const synthetic = runGuard("tooling/clioworks-v4/ooxml_guard.py", ORIGINAL, editedPath, "--contract", SYNTHETIC_CONTRACT);
  test.assert(synthetic.status === 1 && synthetic.report?.status === "failed",
    "the kit's synthetic sentinel still guards only its own pre-made candidate layer");
  const kitPair = runGuard("tooling/clioworks-v4/ooxml_guard.py", ORIGINAL,
    (() => { const p = join(dir, "kit-candidate.pptx"); writeFileSync(p, readFileSync(resolveProjectPath(`${FIXTURE_DIR}/creator-slides-edited.pptx`))); return p; })(),
    "--contract", SYNTHETIC_CONTRACT);
  test.assert(kitPair.status === 0 && kitPair.report?.status === "passed",
    "the synthetic sentinel still passes on the kit's own pre-made candidate pair");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
