// ClioWorks v4.2 contract: the stage audit (D42-02/D42-03 + G41-01).
// All in one vm realm: the pure audit-input builder (real thresholds, EMU
// suggestions), the vendored v4.1 audit adapter (export keywords stripped for
// the vm only — the browser loads the file as ESM), the v4.2 workflow
// contracts, and the REAL Lectern writer round trip for the PPTX bridge
// (text stays native and editable; other slides untouched by one edit).
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v42-stage-audit");

const CANVAS = { width: 1280, height: 720 };
const toPt = (px) => Math.round((px / (4 / 3)) * 100) / 100;
const toEmu = (px) => Math.round(px * 9525);

function makeContext() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView,
    navigator: { platform: "MacIntel" }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "http://localhost/" }, addEventListener() {}, removeEventListener() {},
  };
  context.globalThis = context;
  context.window = context;
  context.Node = function Node() {};
  context.document = {
    createElement: (t) => ({ tagName: t, style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {}, classList: { add() {}, remove() {} } }),
    createElementNS: (ns, t) => ({ tagName: t, namespaceURI: ns, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} }),
    createTextNode: (x) => ({ text: x }), addEventListener() {},
    body: { appendChild() {}, removeChild() {} }, documentElement: { style: { setProperty() {} } },
    head: { appendChild(el) { queueMicrotask(() => { try { vm.runInContext(read(el.src), context, { filename: el.src }); el.onload(); } catch (error) { el.onerror(new Error(String(error && error.message || error))); } }); } },
  };
  vm.createContext(context);
  return context;
}

async function sha256HexNode(text) {
  const result = spawnSync("shasum", ["-a", "256", "-"], { input: Buffer.from(text, "utf8") });
  return result.stdout.toString("utf8").trim().split(/\s+/)[0];
}

const run = async () => {
  const context = makeContext();
  // JSON clone keeps every object in the vm realm (workflows' plain() checks prototypes).
  vm.runInContext("globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));", context);
  for (const m of ["app/vendor/clioworks-v42/workflows.js", "app/features/clio-stage-audit.js"]) {
    vm.runInContext(read(m), context, { filename: m });
  }
  // The ESM adapter, stripped of export keywords inside the vm only (the
  // browser loads the untouched file via dynamic import).
  const adapterSource = read("app/vendor/clioworks-v42/audit-adapter.mjs").replace(/^export\s+/gm, "");
  vm.runInContext(`${adapterSource}\nglobalThis.AuditAdapter = { normalizeAudit, prepareRepair, AuditAdapterError };`,
    context, { filename: "audit-adapter.vm.js" });

  test.assert(!!context.AuditAdapter && typeof context.AuditAdapter.normalizeAudit === "function",
    "the vendored v4.1 audit adapter loads (exports stripped for the vm only)");

  const buildInput = context.AISystem6ClioStageAudit.buildAuditInput;
  test.assert(typeof buildInput === "function", "the stage audit module installs with its pure builder");

  // 1. Byte identity of the vendored candidates.
  const adapterSha = await sha256HexNode(read("app/vendor/clioworks-v42/audit-adapter.mjs"));
  const workflowsSha = await sha256HexNode(read("app/vendor/clioworks-v42/workflows.js"));
  test.assert(adapterSha === "79288fbe232922251335426a28c57b436765d77e4301cdd2e64efb390e40a7e6"
    && workflowsSha === "a60249765f4a10c2541b880d6bc70fd1c74897fc3fcc3cf6e67a5bc3ca4ebebf",
    "the vendored adapter and workflows match the kit bytes");

  // 2. buildAuditInput on synthetic REAL-shaped measurements. The stamp and
  // the boxes live in the vm realm (the adapter's plain-record prototype
  // checks reject foreign objects, as they should).
  const stamp = vm.runInContext(`({
    documentId: "doc:deck", generation: 1, editRevision: 0, pageId: "p1",
    layoutResultId: ${JSON.stringify("a".repeat(64))}, fontSetHash: ${JSON.stringify("b".repeat(64))},
  })`, context);
  const boxes = vm.runInContext(`new Map(JSON.parse(${JSON.stringify(JSON.stringify([
    [0, { box: { x: 100, y: 640, w: 400, h: 200 }, placed: true, fontFamily: "serif", fontSize: "24px", fontWeight: "400", textOverflowY: 0, textOverflowX: 0, images: [] }],
    [1, { box: { x: 700, y: 100, w: 300, h: 80 }, placed: true, fontFamily: "serif", fontSize: "24px", fontWeight: "400", textOverflowY: 26, textOverflowX: 0, images: [] }],
    [2, { box: { x: 1400, y: 800, w: 300, h: 150 }, placed: true, fontFamily: "serif", fontSize: "24px", fontWeight: "400", textOverflowY: 0, textOverflowX: 0, images: [] }],
    [3, { box: { x: 60, y: 60, w: 400, h: 300 }, placed: true, fontFamily: "serif", fontSize: "24px", fontWeight: "400", textOverflowY: 0, textOverflowX: 0, images: [{ naturalAR: 2, renderedAR: 1 }] }],
  ]))}))`, context);
  const input = buildInput({ canvas: CANVAS, boxes, stamp, fontsReady: true, editable: true, pageIndex: 0 });
  const codes = input.findings.map((f) => f.code).sort();
  test.assert(JSON.stringify(codes) === JSON.stringify(["off_slide", "out_of_bounds", "picture_distorted", "text_overflow"]),
    `the builder reports exactly the measured problems (${codes.join(",")})`);
  const oob = input.findings.find((f) => f.code === "out_of_bounds");
  test.assert(oob && oob.suggest.box.cx === toEmu(400) && oob.suggest.box.y === toEmu(720 - 200)
    && oob.suggest.box.x === toEmu(100),
    "the out-of-bounds suggestion clamps the block onto the page in EMU (9525/px)");
  const distorted = input.findings.find((f) => f.code === "picture_distorted");
  test.assert(distorted && distorted.suggest.box.cy === toEmu(400 / 2),
    "the distortion suggestion restores the picture's natural aspect");
  const off = input.findings.find((f) => f.code === "off_slide");
  test.assert(off && !off.suggest, "a block entirely off the page gets no geometry suggestion");

  // 3. The adapter accepts the builder's output and refuses stale repairs.
  const report = context.AuditAdapter.normalizeAudit(input);
  test.assert(report.schema === 1 && report.status === "needs_review" && report.findings.length === 4,
    "normalizeAudit accepts the measured input and reports needs_review");
  const proposal = context.AuditAdapter.prepareRepair(report, report.findings.find((f) => f.code === "out_of_bounds").id, stamp);
  test.assert(proposal.effect === "proposal" && proposal.change.operation === "setGeometry"
    && proposal.requiresHostAuthorization === true,
    "prepareRepair returns an unauthorized one-object geometry proposal");
  context.__stamp = stamp;
  context.__findingId = report.findings.find((f) => f.code === "out_of_bounds").id;
  let stale = "";
  try { context.AuditAdapter.prepareRepair(report, context.__findingId, vm.runInContext("({ ...globalThis.__stamp, editRevision: 1 })", context)); }
  catch (error) { stale = error.code; }
  test.assert(stale === "STALE_AUDIT", "a repair against an older edit revision is refused (旧版本不能修)");

  // 4. Workflow contracts: geometry identity checks.
  const C42 = context.ClioWorks42;
  const geometry = vm.runInContext(`ClioWorks42.geometryProposal(
    { documentId: "doc:deck", sessionId: "s1", generation: 1, editRevision: 0, styleRevision: 0 },
    "p1b0",
    { x: 75, y: 480, w: 300, h: 150 },
    { x: 75, y: 390, w: 300, h: 150 })`, context);
  const accepted = vm.runInContext(`ClioWorks42.validateGeometryAccept(globalThis.__geometry,
    { documentId: "doc:deck", sessionId: "s1", generation: 1, editRevision: 0, styleRevision: 0 },
    { x: 75, y: 480, w: 300, h: 150 })`, (context.__geometry = geometry, context));
  test.assert(accepted.y === 390, "validateGeometryAccept returns the candidate geometry when identity matches");
  const expectCode = (expression, wanted, message) => {
    context.__geometry = geometry;
    let code = "";
    try { vm.runInContext(expression, context); } catch (error) { code = error.code; }
    test.assert(code === wanted, message);
  };
  expectCode(`ClioWorks42.validateGeometryAccept(globalThis.__geometry,
    { documentId: "doc:deck", sessionId: "s1", generation: 1, editRevision: 0, styleRevision: 0 },
    { x: 75, y: 500, w: 300, h: 150 })`, "OBJECT_CHANGED", "a candidate whose object moved is refused");
  expectCode(`ClioWorks42.validateGeometryAccept(globalThis.__geometry,
    { documentId: "doc:deck", sessionId: "s1", generation: 1, editRevision: 3, styleRevision: 0 },
    { x: 75, y: 480, w: 300, h: 150 })`, "STALE_PREVIEW", "a preview from an older document version is refused");

  // 5. Overlap suggestion: the second block moves below the first.
  const overlapBoxes = vm.runInContext(`new Map(JSON.parse(${JSON.stringify(JSON.stringify([
    [0, { box: { x: 100, y: 100, w: 400, h: 200 }, placed: true, fontFamily: "s", fontSize: "24px", fontWeight: "400", textOverflowY: 0, textOverflowX: 0, images: [] }],
    [1, { box: { x: 200, y: 150, w: 400, h: 200 }, placed: true, fontFamily: "s", fontSize: "24px", fontWeight: "400", textOverflowY: 0, textOverflowX: 0, images: [] }],
  ]))}))`, context);
  const overlapInput = buildInput({ canvas: CANVAS, boxes: overlapBoxes, stamp, fontsReady: true, editable: true, pageIndex: 0 });
  const overlap = overlapInput.findings.find((f) => f.code === "overlap");
  test.assert(!!overlap && overlap.els.length === 2 && overlap.suggest.box.y === toEmu(100 + 200 + 12),
    "an overlap of placed blocks proposes moving the second below the first");

  // 6. The PPTX bridge through the REAL Lectern writer.
  const codecModules = [
    "app/vendor/vibeoffice/common/zip.js", "app/vendor/vibeoffice/common/sha.js", "app/vendor/vibeoffice/common/core.js",
    "app/vendor/vibeoffice/common/xml.js", "app/vendor/vibeoffice/common/opc.js", "app/vendor/vibeoffice/common/opc-order.js",
    "app/vendor/vibeoffice/common/crypto.js", "app/vendor/vibeoffice/common/geometry.js", "app/vendor/vibeoffice/common/metafile.js",
    "app/vendor/vibeoffice/common/numfmt.js", "app/vendor/vibeoffice/common/charts.js", "app/vendor/vibeoffice/common/dml.js",
    "app/vendor/vibeoffice/ledger/xml.js",
    "app/vendor/vibeoffice/lectern/model.js", "app/vendor/vibeoffice/lectern/comments.js", "app/vendor/vibeoffice/lectern/designs.js",
    "app/vendor/vibeoffice/lectern/frames.js", "app/vendor/vibeoffice/lectern/properties.js", "app/vendor/vibeoffice/lectern/slideshow.js",
    "app/vendor/vibeoffice/lectern/preserve.js", "app/vendor/vibeoffice/lectern/pptx-read.js", "app/vendor/vibeoffice/lectern/pptx-write.js",
    "app/vendor/clioworks-v3/lectern-adapter.js",
  ];
  for (const m of codecModules) vm.runInContext(read(m), context, { filename: m });
  const pages = vm.runInContext(`([
    { index: 0, notes: '第一页备注', blocks: [
      { at: 0, text: '六页夹具的第一页', box: { x: 64, y: 48, w: 900, h: 90 }, placed: true, fontSizePx: 66, fontWeight: '700', isHeading: true },
      { at: 1, text: '正文块：导出用了 42 秒。', box: { x: 64, y: 200, w: 700, h: 60 }, placed: false, fontSizePx: 24, fontWeight: '400', isHeading: false },
    ]},
    { index: 1, notes: '', blocks: [
      { at: 0, text: '第二页标题', box: { x: 64, y: 48, w: 600, h: 80 }, placed: true, fontSizePx: 44, fontWeight: '700', isHeading: true },
    ]},
  ])`, context);
  context.__pres = context.AISystem6ClioStageAudit.buildPresentation(pages, CANVAS, "audit-fixture");
  test.assert(context.__pres.slides.length === 2 && context.__pres.slides[0].shapes.length === 2,
    "the bridge builds a presentation with every measured block as a native shape");
  const out = await vm.runInContext("(async () => { const blob = await L.pptx.write(globalThis.__pres, { format: 'pptx' }); return new Uint8Array(await blob.arrayBuffer()); })()", context);
  test.assert(out.length > 4000 && out[0] === 0x50 && out[1] === 0x4b, `the bridge writes a real PPTX package (${out.length} bytes)`);
  context.__out = out;
  const reread = await vm.runInContext("(async () => { const d = await L.pptx.read(globalThis.__out); return { slides: d.slides.length, notes: d.slides[0].notes, shapes: d.slides[0].shapes.filter(s => s.type === 'text').length, firstShape: d.slides[0].shapes.find(s => s.type === 'text') }; })()", context);
  test.assert(reread.slides === 2 && reread.notes === "第一页备注" && reread.shapes >= 2,
    "the real reader opens the export with slides, notes and native text shapes");
  const shape = reread.firstShape;
  test.assert(Math.round(shape.x) === 48 && Math.round(shape.y) === 36 && Math.round(shape.w) === 675,
    `the shape keeps the measured geometry in pt (${shape.x},${shape.y},${shape.w})`);

  // 6b. Editability: reopen with the ClioWorks adapter, edit one run, save, re-read.
  const deck = await vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__out, { name: 'audit-fixture.pptx' })", context);
  const deckRuns = deck.runs(0);
  const targetRun = deckRuns.find((r) => r.text.includes("42 秒"));
  test.assert(!!targetRun, "the exported text is editable native runs (PPTX 文字对象仍可编辑)");
  deck.setRunText(0, targetRun.index, targetRun.text.replace("42 秒", "43 秒"));
  const saved = await deck.save();
  test.assert(saved.mode === "preserving-edit", "the edited export saves through the preserving writer");
  context.__saved = new Uint8Array(saved.bytes);
  const reread2 = await vm.runInContext("(async () => { const d = await L.pptx.read(globalThis.__saved); const texts = []; d.slides.forEach((s) => s.shapes.forEach((sh) => { if (sh.tx && sh.tx.ps) sh.tx.ps.forEach((p) => (p.rs || []).forEach((r) => texts.push(r.t))); })); return { texts: texts.join('|'), notes2: d.slides[0].notes, title2: texts.some((x) => x.includes('第二页标题')) }; })()", context);
  test.assert(reread2.texts.includes("43 秒") && !reread2.texts.includes("42 秒"),
    "the single-run edit lands in the native text");
  test.assert(reread2.notes2 === "第一页备注" && reread2.title2,
    "the edit leaves notes and other slides untouched (保留其他对象和页面)");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
