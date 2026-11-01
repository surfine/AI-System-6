// ClioWorks v4 (V4-07) contract: pages, prompter and the making list.
// - The making-list XLSX is a real workbook through the REAL Ledger writer,
//   re-readable by the real reader, with blanks that stay blank (never 0).
// - captionSrt keeps its strict timing contract: recorded/aligned cues only;
//   estimated timing never becomes a formal subtitle; invalid ranges refuse.
// - Speaker notes never mix into audience-visible runs (real Lectern model).
import vm from "node:vm";
import { readFileSync, writeFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-v4-production");

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
  vm.runInContext(read("app/vendor/clioworks-v3/creator-integration.js"), context, { filename: "creator-integration.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/creator-cues.js"), context, { filename: "creator-cues.js" });
  vm.runInContext(read("app/core/edit-embeds.js"), context, { filename: "edit-embeds.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/data-references.js"), context, { filename: "data-references.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/ledger-adapter.js"), context, { filename: "ledger-adapter.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/lectern-adapter.js"), context, { filename: "lectern-adapter.js" });
  vm.runInContext(read("app/vendor/clioworks-v3/production-list.js"), context, { filename: "production-list.js" });

  const narration = vm.runInContext(`([
    { id: "p1", text: "开场：这次导出用了 42 秒。" },
    { id: "p2", text: "等待时间本身也是内容。" },
    { id: "p3", text: "结尾：下一期见。" },
  ])`, context);
  const cues = context.AISystem6CreatorCues.createCueStore({ projectId: "proj-1" });
  cues.attach("p1", "shot", "特写：进度条");
  cues.attach("p1", "duration", 42);
  cues.attach("p2", "material", "creator-data.xlsx:D5");

  // A real reference captured from the fixture workbook rides row p3.
  const bytes = readFileSync(resolveProjectPath("tests/fixtures/clioworks-v4/creator-data.xlsx"));
  context.__bytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const xlsx = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: 'creator-data.xlsx' })", context);
  const reference = context.AISystem6DataReferences.captureRangeReference({ documentId: xlsx.documentId, generation: 1 }, xlsx, xlsx.sheets()[0].name, "D5");
  const references = [{ paragraphId: "p3", ...JSON.parse(JSON.stringify(reference)) }];

  const captions = [
    { paragraphId: "p1", text: "这次导出用了 42 秒。", startMs: 0, endMs: 4200, timingBasis: "recorded" },
    { paragraphId: "p2", text: "等待时间本身也是内容。", startMs: 4200, endMs: 9000, timingBasis: "aligned" },
  ];

  // 1. The making list is a real workbook through the real writer.
  const wb = context.AISystem6ProductionList.buildWorkbook({ cues, narration, references, captions });
  const out = await context.AISystem6ProductionList.serialize(wb);
  test.assert(out.length > 2000 && out[0] === 0x50 && out[1] === 0x4b, `the making list serializes to a real XLSX package (${out.length} bytes, PK magic)`);
  context.__list = out;
  const reread = await vm.runInContext("(async () => { const wb = await L.xlsxRead.read(globalThis.__list, {}); const sh = wb.sheets[0]; return { name: sh.name, head: [sh.get(0,0)?.v, sh.get(0,1)?.v, sh.get(0,5)?.v], rows: [ [sh.get(1,0)?.v, sh.get(1,2)?.v, sh.get(1,3)?.v, sh.get(1,4)?.v], [sh.get(2,0)?.v, sh.get(2,2)?.v, sh.get(2,3)?.v], [sh.get(3,0)?.v, sh.get(3,2)?.v, sh.get(3,3)?.v, sh.get(3,4)?.v] ] }; })()", context);
  test.assert(reread.name === "制作清单" && reread.head[0] === "段落" && reread.head[2] === "字幕文本",
    "the real reader opens the making list with its columns");
  test.assert(reread.rows[0][0] === "p1" && reread.rows[0][1] === "特写：进度条" && reread.rows[0][2] === 42,
    "row p1 carries shot and duration from the cues");
  test.assert(reread.rows[1][0] === "p2" && reread.rows[1][1] == null && reread.rows[1][2] == null,
    "a paragraph without a duration cue stays blank (never 0)");
  test.assert(reread.rows[2][3] === `${reference.sheetId}!${reference.range}`,
    "row p3 carries the captured data reference as its material column");

  // 2. captionSrt strict timing.
  const I = context.ClioWorksIntegration;
  const srt = I.captionSrt([
    { text: "这次导出用了 42 秒。", startMs: 0, endMs: 4200, timingBasis: "recorded" },
    { text: "等待时间本身也是内容。", startMs: 4200, endMs: 9000, timingBasis: "aligned" },
  ]);
  test.assert(srt.startsWith("1\n00:00:00,000 --> 00:00:04,200\n这次导用".replace("这次导用", "这次导出用了 42 秒。")) && srt.includes("00:00:09,000"),
    "recorded/aligned cues render as strict SRT");
  let estimated = "";
  try { I.captionSrt([{ text: "估的。", startMs: 0, endMs: 500, timingBasis: "estimated" }]); } catch (e) { estimated = e.code; }
  test.assert(estimated === "ESTIMATED_TIMING", "estimated timing refuses to become a formal subtitle");
  let overlap = "";
  try { I.captionSrt([{ text: "a", startMs: 0, endMs: 1000, timingBasis: "recorded" }, { text: "b", startMs: 500, endMs: 900, timingBasis: "recorded" }]); } catch (e) { overlap = e.code; }
  test.assert(overlap === "CAPTION_RANGE", "overlapping caption ranges refuse");
  let empty = "";
  try { I.captionSrt([{ text: "  ", startMs: 0, endMs: 100, timingBasis: "recorded" }]); } catch (e) { empty = e.code; }
  test.assert(empty === "CAPTION_TEXT", "empty caption text refuses");

  // 3. Speaker notes never mix into the audience-visible runs (real model).
  const slidesBytes = readFileSync(resolveProjectPath("tests/fixtures/clioworks-v4/creator-slides.pptx"));
  context.__slides = new Uint8Array(slidesBytes.buffer.slice(slidesBytes.byteOffset, slidesBytes.byteOffset + slidesBytes.byteLength));
  const deck = await vm.runInContext("ClioWorksLecternAdapter.open(globalThis.__slides, { name: 'creator-slides.pptx' })", context);
  const notes0 = deck.notes(0);
  let audienceText = "";
  for (let i = 0; i < deck.slideCount(); i += 1) for (const r of deck.runs(i)) audienceText += r.text + "\n";
  test.assert(notes0.length > 0 && !audienceText.includes(notes0),
    "speaker notes read back separately and never appear in the audience-visible runs");
  const firstRun = deck.runs(0)[0];
  deck.setRunText(0, firstRun.index, firstRun.text + "（改）");
  test.assert(deck.notes(0) === notes0, "editing an audience run leaves the notes untouched");

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
