// ClioWorks v4 (V4-02) contract: native-document locations — capture, resolve,
// cite — against the REAL adapters (Quire DOCX, Ledger XLSX, Lectern PPTX) and
// the shared text-quote anchor. Exact / lost / ambiguous, never a guess.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-locate");

const FIXTURE_DIR = "tests/fixtures/clioworks-v4";

function makeContext() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error,
    navigator: { platform: "MacIntel", userAgent: "clioworks-v4-locate-test" },
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

async function openAdapter(context, adapterGlobal, file) {
  const bytes = readFileSync(resolveProjectPath(`${FIXTURE_DIR}/${file}`));
  context.__bytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return vm.runInContext(`${adapterGlobal}.open(globalThis.__bytes, { name: ${JSON.stringify(file)}, documentId: 'loc:${file}', generation: 1 })`, context);
}

const run = async () => {
  const context = makeContext();
  // The shared anchor (eager core) plus the locate module, bare.
  vm.runInContext(read("app/core/text-quote.js"), context, { filename: "text-quote.js" });
  for (const adapter of ["ledger-adapter.js", "quire-adapter.js", "lectern-adapter.js"]) {
    vm.runInContext(read(`app/vendor/clioworks-v3/${adapter}`), context, { filename: adapter });
  }
  vm.runInContext(read("app/vendor/clioworks-v3/native-locate.js"), context, { filename: "native-locate.js" });
  const locate = context.AISystem6NativeLocate;
  test.assert(!!locate, "native-locate installs beside the shared text-quote core");

  // ---- text locations: exact / lost / ambiguous ----
  const identity = { documentId: "doc:script", generation: 1 };
  const text = "第一段说这次导出用了 42 秒。第二段引用它。第三段再次引用这次导出用了 42 秒这个事实。";
  const passage = "这次导出用了 42 秒";
  const firstAt = text.indexOf(passage);
  const location = locate.captureTextLocation(identity, text, firstAt, firstAt + passage.length);
  test.assert(location.kind === "text" && location.quote.quote === "这次导出用了 42 秒", "capture quotes the exact passage with context");

  const exact = locate.resolveLocation(location, text);
  test.assert(exact.resolution === "exact" && exact.start === firstAt, "the unique-context quote resolves exact");

  const lost = locate.resolveLocation(location, text.replace(/这次导出用了 42 秒。第二段/, "时间已改写。第二段").replace(/再次引用这次导出用了 42 秒这个事实/, "再次引用同一件事"));
  test.assert(lost.resolution === "lost" && lost.reason === "quote-not-found", "a removed quote is lost, never approximated");

  // A periodically repeated passage: every copy matches the recorded context,
  // so disambiguation is impossible — ambiguous, not first-match.
  const period = "甲乙丙丁戊己庚重复 ";
  const twin = period.repeat(30);
  const at = twin.indexOf("甲乙丙丁戊己庚");
  const twinLocation = locate.captureTextLocation({ documentId: "doc:twin", generation: 1 }, twin, at, at + 7);
  const twinResolved = locate.resolveLocation(twinLocation, twin);
  test.assert(twinResolved.resolution === "ambiguous" && twinResolved.occurrences === 30,
    "duplicate passages resolve ambiguous instead of taking the first match");

  // ---- real DOCX adapter: text location survives an edit around it ----
  const docx = await openAdapter(context, "ClioWorksQuireAdapter", "creator-script.docx");
  const projection = locate.documentText(docx);
  const probe = "它没有快到让人忘记等待";
  const probeAt = projection.indexOf(probe);
  const docxLocation = locate.captureTextLocation({ documentId: docx.documentId, generation: docx.generation }, projection, probeAt, probeAt + probe.length);
  const docxResolved = locate.resolveLocation(docxLocation, docx);
  test.assert(docxResolved.resolution === "exact", "a captured location resolves exact against the live docx model");

  // Edit a DIFFERENT run, then resolve again: prefix/suffix still decide.
  const paras = docx.paragraphs();
  const other = paras.find((p) => p.text.includes("设备丙尚未测试") || (p.text.length > 0 && !p.text.includes(probe)));
  const otherRun = docx.runs(other.id)[0];
  docx.setRunText(other.id, otherRun.runIndex, otherRun.text + "（已核对）");
  const afterEdit = locate.resolveLocation(docxLocation, docx);
  test.assert(afterEdit.resolution === "exact" && afterEdit.moved, "an edit elsewhere moves the quote but context still resolves it exact");

  // ---- real XLSX adapter: cell-range location ----
  const xlsx = await openAdapter(context, "ClioWorksLedgerAdapter", "creator-data.xlsx");
  const cellLocation = locate.captureCellLocation({ documentId: xlsx.documentId, generation: xlsx.generation }, xlsx.sheets()[0].name, "D5");
  const cellResolved = locate.resolveLocation(cellLocation, xlsx);
  test.assert(cellResolved.resolution === "exact" && cellResolved.value === "synthetic-log-01", "D5 resolves exact with its value");
  const cellLost = locate.resolveLocation({ ...cellLocation, range: "ZZ99" }, xlsx);
  test.assert(cellLost.resolution === "lost" && cellLost.reason === "cell-not-found", "an absent cell range is lost, not guessed");
  const wrongDoc = locate.resolveLocation(cellLocation, docx);
  test.assert(wrongDoc.resolution === "lost" && wrongDoc.reason === "document-id-mismatch", "a location from another document is refused, not reused");

  // ---- real PPTX adapter: slide-shape location ----
  const pptx = await openAdapter(context, "ClioWorksLecternAdapter", "creator-slides.pptx");
  const shape = pptx.runs(0)[0];
  const shapeLocation = locate.captureSlideShapeLocation({ documentId: pptx.documentId, generation: pptx.generation }, 0, shape.shapeId);
  const shapeResolved = locate.resolveLocation(shapeLocation, pptx);
  test.assert(shapeResolved.resolution === "exact" && shapeResolved.texts.length >= 1, "the slide shape resolves exact with its texts");
  const shapeLost = locate.resolveLocation({ ...shapeLocation, objectId: "no-such-shape" }, pptx);
  test.assert(shapeLost.resolution === "lost" && shapeLost.reason === "shape-not-found", "a removed shape is lost");
  const futureKind = locate.resolveLocation({ kind: "pdf-region", documentId: pptx.documentId, generation: pptx.generation, pageId: 1 }, pptx);
  test.assert(futureKind.resolution === "lost" && futureKind.reason === "kind-not-yet-resolvable",
    "kinds whose engines arrive later (pdf-region, media-range) report unresolved, never guess");

  // ---- clip record: verbatim sentence and paraphrase stay separate ----
  const clip = locate.clipRecord({
    identity: { documentId: docx.documentId, generation: docx.generation },
    location: docxLocation,
    verbatim: probe,
    note: "口播里要提这次导出时间",
    projectId: "proj-1",
  });
  test.assert(clip.schema === 1 && clip.verbatim === probe && clip.note === "口播里要提这次导出时间" && clip.location.kind === "text",
    "a clip keeps the original sentence and the paraphrase as separate fields beside the location");
  let threw = false;
  try { locate.clipRecord({ identity, location: docxLocation, verbatim: "  " }); } catch { threw = true; }
  test.assert(threw, "an empty verbatim sentence is refused (nothing is summarised into a person's view)");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
