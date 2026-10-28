// ClioWorks v4 (V4-01) contract: native DOCX open/edit/save through the REAL
// vendored VibeOffice Quire codec via the REAL quire-adapter (its loadCodec is
// driven by a script-tag emulation inside a bare vm), verified against the
// PRODUCTION preservation map — the kit's pre-made candidate is never reused
// as a product result.
//
// Layers 1-5 cover the V4-01 creator-script path. Layers 6-8 (S11 M3, §八 item 4) extend the contract
// to the S11-4 subset over the frozen quire-s11.docx; clioworks-s11-m3-quire-adapter.test.mjs owns the
// per-operation round trips (heading/list/style/split/merge/undo, one comment save+reopen, read-only
// refusals, picture-part bytes), so layers 6-8 only add what it does not assert:
//   6. the table's XML stays byte-identical (not just in text) through text AND format edits,
//      while its words move only through the upstream path (N10: one named step via syncExternal)
//   7. comment threads survive a second save/reopen generation, an edit inside the commented paragraph,
//      and land in commentsExtended as resolved
//   8. exportReport names what saving converts or drops, and says nothing before any edit
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
import AdmZip from "adm-zip";
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

  // 6-8. S11 M3 extension over the frozen quire-s11.docx, through the same adapter and context.
  const S11 = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/quire-s11.docx")));
  const openBytes = async (bytes, name = "quire-s11.docx") => {
    context.__s11 = bytes;
    return vm.runInContext(`ClioWorksQuireAdapter.open(globalThis.__s11, { name: ${JSON.stringify(name)} })`, context);
  };
  const byText = (d, prefix) => d.paragraphs().find((q) => q.text.startsWith(prefix));
  const zipOf = (bytes) => new AdmZip(Buffer.from(bytes));
  const tableXml = (xml) => xml.match(/<w:tbl>.*<\/w:tbl>/s)?.[0] || "";
  // The writer hoists namespace declarations to the root; the element itself must not change.
  const drawingXml = (xml) => (xml.match(/<w:drawing>.*?<\/w:drawing>/s)?.[0] || "").replace(/ xmlns:\w+="[^"]*"/g, "");

  // 6. The table's XML is kept as XML, not merely as text, through every kind of subset edit
  //    (N10: its words stay editable through the upstream path, its XML does not move).
  {
    const original = zipOf(S11).readAsText("word/document.xml");
    test.assert(tableXml(original) !== "" && drawingXml(original) !== "", "the S11 fixture carries one table and one drawing to compare");
    const d = await openBytes(S11);
    d.setRunText(byText(d, "最后一段").id, 0, "最后一段，改过。");
    d.toggleRunStyle(byText(d, "先把").id, "b", { from: 0, to: 2 });
    d.setHeading(byText(d, "这个周末").id, 2);
    d.setList(byText(d, "胶带").id, "number");
    d.splitParagraph(byText(d, "最后一段").id, 4);
    const out = await d.save();
    test.assert(out.mode === "preserving-edit", "a mixed subset edit goes through the preserving writer");
    const pkg = zipOf(out.bytes);
    const edited = pkg.readAsText("word/document.xml");
    test.assert(tableXml(edited) === tableXml(original), "the table's XML is byte-identical after text, style, heading, list and split edits");
    test.assert(drawingXml(edited) === drawingXml(original) && /r:embed="rId\d+"/.test(edited), "the picture's drawing element is unchanged apart from hoisted namespace declarations");
    const rawDrawing = (x) => x.match(/<w:drawing>.*?<\/w:drawing>/s)?.[0] || "";
    test.assert(rawDrawing(edited) === rawDrawing(original), `the untouched drawing keeps its original bytes, inner namespace declarations included (${rawDrawing(original).length} -> ${rawDrawing(edited).length})`);
    test.assert(pkg.getEntry("word/media/image1.png").getData().equals(zipOf(S11).getEntry("word/media/image1.png").getData()) && pkg.getEntry("word/settings.xml")?.getData().equals(zipOf(S11).getEntry("word/settings.xml").getData()),
      "the picture and settings parts keep their original bytes");
    const back = await openBytes(new Uint8Array(out.bytes));
    test.assert(back.tables()[0].rows[1][1].text === "20" && byText(back, "新书架").runs[0].kind === "image",
      "after the save the table keeps its cells and the picture is still an object, not text");
    // N10: the table's XML is frozen above; its WORDS still move. The upstream
    // editor's path (D.tx, what E.edit runs) edits a cell, syncExternal counts it
    // once, one named undo step takes it back — the narrow face keeps refusing.
    test.assert(back.setRunText(back.tables()[0].rows[1][0].paragraphIds[0], 0, "纸箱x").code === "READ_ONLY_TABLE",
      "the adapter's narrow face still refuses a table-cell run edit");
    const cellId = back.tables()[0].rows[1][0].paragraphIds[0];
    vm.runInContext(`(() => { const d = L.D; const p = d.byId(d.doc, ${cellId}); d.tx('Typing', () => { d.touch(p); p.runs[0].text = '二十' + p.runs[0].text; }); })()`, context);
    test.assert(back.syncExternal() === true && back.undoLabel() === "Typing" && back.tables()[0].rows[1][0].text === "二十纸箱",
      "an upstream-path edit inside a cell is one named step, counted once by syncExternal");
    back.undo();
    test.assert(back.tables()[0].rows[1][0].text === "纸箱", "undo restores the cell's words");
    back.markSaved(back.getEditRevision());
  }

  // 7. Comments: second generation, edit inside the commented paragraph, resolved flag in the package.
  {
    const d = await openBytes(S11);
    const root = d.comments().find((c) => c.text === "纸箱数量再确认一下");
    const commented = byText(d, "先把");
    test.assert(commented.id === root.anchor.paragraphId, "the fixture's comment lives in the paragraph this layer edits");
    const firstRun = d.runs(commented.id)[0];
    d.setRunText(commented.id, firstRun.runIndex, firstRun.text + "（已改）");
    test.assert(d.comments().find((c) => c.id === root.id).anchor.quote === "纸箱", "typing next to a comment's range leaves its landing range on the same words");
    d.replyComment(root.id, { author: "小禾", text: "第一代回复", date: "2026-10-16T09:00:00Z" });
    d.setCommentDone(root.id, true);
    const gen1 = new Uint8Array((await d.save()).bytes);
    const mid = await openBytes(gen1);
    const reopenedRoot = mid.comments().find((c) => c.text === "纸箱数量再确认一下");
    test.assert(reopenedRoot.anchor.quote === "纸箱" && reopenedRoot.done === true && byText(mid, "先把").text.includes("（已改）"),
      "generation 1: the edit, the resolved root and its range all come back");
    mid.replyComment(reopenedRoot.id, { author: "阿澄", text: "第二代回复", date: "2026-10-16T09:10:00Z" });
    mid.setCommentDone(reopenedRoot.id, false);
    const gen2 = new Uint8Array((await mid.save()).bytes);
    const last = await openBytes(gen2);
    const thread = last.comments();
    const top = thread.find((c) => c.text === "纸箱数量再确认一下");
    const replies = thread.filter((c) => c.parentId === top.id).map((c) => `${c.author}:${c.text}`).sort();
    test.assert(replies.join("|") === "小禾:第一代回复|阿澄:第二代回复" && top.done === false && thread.length === 3,
      `generation 2: both replies stay in one thread and re-opening the thread sticks (${replies.join("|")}, done=${top.done}, total=${thread.length})`);
    const ext = zipOf(gen1).readAsText("word/commentsExtended.xml");
    test.assert(/w15:done="1"/.test(ext) && /w15:paraIdParent=/.test(ext), "the package marks the resolved thread and the reply's parent in commentsExtended");
    test.assert(zipOf(gen2).readAsText("word/commentsExtended.xml").match(/w15:done="1"/g) === null, "re-opening the thread clears the resolved mark in the package");
  }

  // 8. exportReport names what saving converts or drops; silent before any edit.
  {
    const base = zipOf(S11);
    const xml = base.readAsText("word/document.xml");
    const variant = (change) => { const z = zipOf(S11); z.updateFile("word/document.xml", Buffer.from(change(xml))); return new Uint8Array(z.toBuffer()); };
    const noGrid = variant((x) => x.replace(/<w:tblGrid>.*?<\/w:tblGrid>/s, "<w:tblGrid/>"));
    const orphanBookmark = variant((x) => x.replace("<w:p>", '<w:p><w:bookmarkStart w:id="77" w:name="orphan"/>'));
    const edit = (d) => d.setRunText(byText(d, "最后一段").id, 0, "最后一段，改过。");

    const quiet = await openBytes(noGrid);
    const before = await quiet.exportReport();
    test.assert(before.converted.length === 0 && before.lost.length === 0, "a file that would convert on save reports nothing until something is edited");

    edit(quiet);
    const grid = await quiet.exportReport();
    test.assert(grid.lost.length === 0 && grid.converted.length === 1 && /table column widths/i.test(grid.converted[0].detail) && grid.converted[0].where === "word/document.xml" && grid.converted[0].id === "table-grid:word/document.xml",
      `a rebuilt table grid is listed as converted, naming the part and the reason (${JSON.stringify(grid.converted.map((i) => i.detail))})`);
    test.assert(JSON.stringify(await quiet.exportReport()) === JSON.stringify(grid), "asking twice gives the same list");
    test.assert((await quiet.save()).mode === "preserving-edit" && JSON.stringify(await quiet.exportReport()) === JSON.stringify(grid), "the list the writer showed is the one the save produced");

    const drop = await openBytes(orphanBookmark);
    edit(drop);
    const dropped = await drop.exportReport();
    test.assert(dropped.lost.length === 1 && dropped.lost[0].kind === "range" && /Bookmark/.test(dropped.lost[0].detail) && dropped.converted.some((i) => i.kind === "content" && /bookmarks/i.test(i.detail)),
      `an unmatched bookmark is listed as lost (kind range) and the bookmark cleanup as converted (${JSON.stringify(dropped.lost.map((i) => i.detail))})`);
    test.assert([...dropped.converted, ...dropped.lost].every((i) => i.kind && i.detail && i.where && i.id), "every item carries kind, detail, where and id for the first-save list");

    const clean = await openBytes(S11);
    edit(clean);
    const none = await clean.exportReport();
    test.assert(none.converted.length === 0 && none.lost.length === 0, "an edit that converts nothing reports nothing, so the first-save list stays out of the writer's way");
  }

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
