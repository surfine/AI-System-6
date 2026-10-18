// ClioWorks S11 M2 review fixes: each assertion was red against the code before its fix.
//   - the adapter encode memo is tagged with the revision taken BEFORE the await (Lectern and Quire),
//     through the real encode path (exportReport mid-edit, then save, then read back);
//   - one p188:replyLst per modern cm, however many replies it gains; legacy reply-to-reply flattens;
//   - the first-save question (confirming) refuses edits and Edit > Undo/Redo on all three surfaces,
//     while saving still allows editing;
//   - Quire loads fields.js after layout.js and editor.js.
import vm from "node:vm";
import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import { stubAdapter } from "../fixtures/clioworks-s11/lectern-stub.mjs";

const test = createFeatureTest("clioworks-s11-m2-review-fixes");
const bytesOf = (path) => new Uint8Array(readFileSync(resolveProjectPath(path)));
const MODERN = "tests/fixtures/clioworks-s11/slides-modern-comment-s11.pptx";
const LEGACY = "tests/fixtures/clioworks-s11/slides-notes-comment-s11.pptx";
const DOCX = "tests/fixtures/clioworks-s11/quire-s11.docx";
const partOf = (bytes, name) => { const e = new AdmZip(Buffer.from(bytes)).getEntry(name); return e ? e.getData().toString("utf8") : null; };

function opener(script, global) {
  const ctx = makeContext();
  loadScripts(ctx, [script]);
  return { ctx, open: (bytes, meta) => { ctx.__b = bytes; ctx.__m = meta; return vm.runInContext(`${global}.open(globalThis.__b, globalThis.__m)`, ctx); } };
}

const run = async () => {
  // 1a. Lectern: an edit during the encode must not be marked as encoded.
  {
    const { open } = opener("app/vendor/clioworks-v3/lectern-adapter.js", "ClioWorksLecternAdapter");
    const a = await open(bytesOf(LEGACY), { name: "x.pptx" });
    const s0 = a.slides()[0].id;
    const runOf = () => a.shapes(s0).filter((s) => s.editable)[1].paragraphs[0].runs[0];
    a.setRunText(s0, runOf().id, "第一次改");
    const exporting = a.exportReport();
    a.setRunText(s0, runOf().id, "最后一次改");
    await exporting;
    const saved = await a.save();
    const back = await open(saved.bytes, { name: "x.pptx" });
    const text = back.shapes(back.slides()[0].id).filter((s) => s.editable)[1].paragraphs[0].runs[0].text;
    test.assert(text === "最后一次改" || a.isDirty(), "Lectern: an edit made while exportReport encodes is in the saved bytes (or the deck still reports dirty)");
    test.assert(text === "最后一次改", "Lectern: save() after a mid-encode edit re-encodes and reads back the last edit");
  }
  // 1b. Quire: same, over the real docx writer.
  {
    const { open } = opener("app/vendor/clioworks-v3/quire-adapter.js", "ClioWorksQuireAdapter");
    const d = await open(bytesOf(DOCX), { name: "x.docx" });
    const p = d.paragraphs().find((q) => q.text.length > 3 && !q.table && !q.image) || d.paragraphs()[0];
    d.setRunText(p.id, 0, "第一次改");
    const exporting = d.exportReport();
    d.setRunText(p.id, 0, "最后一次改");
    await exporting;
    const saved = await d.save();
    const back = await open(saved.bytes, { name: "x.docx" });
    test.assert(back.paragraphs().some((q) => q.text.startsWith("最后一次改")), "Quire: save() after a mid-encode edit reads back the last edit");
  }

  // 2. Two replies to a modern root without replyLst: one replyLst, both replies read back.
  {
    const { open } = opener("app/vendor/clioworks-v3/lectern-adapter.js", "ClioWorksLecternAdapter");
    const b = await open(bytesOf(MODERN), { name: "m.pptx" });
    const s0 = b.slides()[0].id;
    const resolved = b.comments(s0).find((c) => c.done && !c.parentId);
    b.replyComment(resolved.id, { author: "甲", text: "回复一", date: "2026-10-16T09:00:00Z" });
    b.replyComment(resolved.id, { author: "乙", text: "回复二", date: "2026-10-16T09:05:00Z" });
    const saved = await b.save();
    const xml = partOf(saved.bytes, "ppt/comments/modernComment_100_1A2B3C4D.xml");
    const cms = xml.match(/<p188:cm [\s\S]*?<\/p188:cm>/g);
    const mine = cms.find((cm) => cm.includes(resolved.id.split("#")[1]));
    test.assert((mine.match(/<p188:replyLst/g) || []).length === 1, "a cm that gains two replies holds exactly one p188:replyLst");
    const back = await open(saved.bytes, { name: "m.pptx" });
    const texts = back.comments(back.slides()[0].id).map((c) => c.text);
    test.assert(texts.includes("回复一") && texts.includes("回复二"), "both replies read back after save and reopen");
  }
  // 2b. Legacy: a reply to a reply is listed under its thread root.
  {
    const { open } = opener("app/vendor/clioworks-v3/lectern-adapter.js", "ClioWorksLecternAdapter");
    const b = await open(bytesOf(LEGACY), { name: "l.pptx" });
    const s0 = b.slides()[0].id;
    const root = b.comments(s0)[0];
    const r1 = b.replyComment(root.id, { author: "甲", text: "一层", date: "2026-10-16T09:00:00Z" });
    b.replyComment(r1.id, { author: "乙", text: "二层", date: "2026-10-16T09:05:00Z" });
    const saved = await b.save();
    const back = await open(saved.bytes, { name: "l.pptx" });
    const list = back.comments(back.slides()[0].id);
    test.assert(list.some((c) => c.text === "二层") && list.length === 3, "a legacy reply to a reply is still listed (flattened under its root)");
    test.assert(list.findIndex((c) => c.text === "二层") === list.findIndex((c) => c.text === "一层") + 1, "and it sits directly under its thread");
  }

  // 3. While the first-save question is open, edits and Undo/Redo are refused on all three surfaces.
  const LOSS = async () => ({ converted: [], lost: [{ slideId: "s1", kind: "transition", id: "x:1", action: "drop", what: "x" }] });
  {
    const ctx = makeContext();
    ctx.t = (key) => key;
    loadScripts(ctx, ["app/features/clio-stage-native.js"]);
    const adapter = stubAdapter({ report: () => ({ converted: [], lost: [{ slideId: "s1", kind: "transition" }] }) });
    let seen;
    const session = ctx.AISystem6ClioStageNative.createSession(adapter, {
      fileName: "x.pptx", mountedName: "x.pptx", host: { save: async () => ({ ok: true }) },
      confirmList: async () => { seen = { edit: session.editRun("s1", "r1", "改"), canUndo: session.editHistory.canUndo(), undo: session.editHistory.undo() }; return "cancel"; },
    });
    session.editRun("s1", "r1", "先改一次");
    const before = adapter.getEditRevision();
    await session.save();
    test.assert(seen && seen.edit.status === "blocked" && seen.canUndo === false && seen.undo === false && adapter.getEditRevision() === before, "stage: edits and Undo are refused while the first-save question is open");
    test.assert(session.editHistory.canUndo(), "stage: Undo is available again after the question closes");
  }
  {
    const ctx = makeContext();
    ctx.t = (key) => key;
    loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/features/clio-chart-workbook.js"]);
    ctx.__bytes = bytesOf("tests/fixtures/clioworks-s11/budget-s11.xlsx");
    const led = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: 'budget-s11.xlsx' })", ctx);
    const adapter = Object.assign({}, led, { exportReport: LOSS });
    let seen;
    const session = ctx.AISystem6ClioChartWorkbook.createSession(adapter, {
      fileName: "budget-s11.xlsx", mountedName: "budget-s11.xlsx", host: { save: async () => ({ ok: true }) },
      confirmList: async () => { seen = { edit: session.commitCell("B2", "99"), canUndo: session.editHistory.canUndo(), undo: session.editHistory.undo() }; return "cancel"; },
    });
    session.setMode?.("full");
    session.commitCell("B2", "7");
    const before = adapter.getEditRevision();
    await session.save();
    test.assert(seen && seen.edit.status === "blocked" && seen.canUndo === false && seen.undo === false && adapter.getEditRevision() === before, "workbook: edits and Undo are refused while the first-save question is open");
    test.assert(session.editHistory.canUndo(), "workbook: Undo is available again after the question closes");
  }
  {
    const ctx = makeContext();
    ctx.t = (key) => key;
    loadScripts(ctx, ["app/vendor/clioworks-v3/quire-adapter.js", "app/features/clio-write.js"]);
    ctx.__bytes = bytesOf(DOCX);
    const q = await vm.runInContext("ClioWorksQuireAdapter.open(globalThis.__bytes.slice().buffer, { name: 'x.docx' })", ctx);
    const adapter = Object.assign({}, q, { exportReport: LOSS });
    const p = q.paragraphs().find((x) => x.text.length > 3 && !x.table && !x.image);
    let seen;
    const session = ctx.AISystem6ClioWrite.createSession(adapter, {
      fileName: "x.docx", mountedName: "x.docx", host: { save: async () => ({ ok: true }) },
      confirmList: async () => { seen = { canUndo: session.editHistory.canUndo(), undo: session.editHistory.undo(), comment: session.addComment("c").status, bold: session.commandState("format.bold").enabled }; return "cancel"; },
    });
    session.setMode?.("full");
    adapter.setRunText(p.id, 0, "先改一次");
    session.noteExternalEdit?.();
    const before = adapter.getEditRevision();
    await session.save();
    test.assert(seen && seen.canUndo === false && seen.undo === false && seen.comment === "blocked" && seen.bold === false && adapter.getEditRevision() === before, "write: Undo, comments and formatting are refused while the first-save question is open");
    test.assert(session.editHistory.canUndo(), "write: Undo is available again after the question closes");
  }

  // 5. fields.js follows layout.js and editor.js.
  {
    const { ctx } = opener("app/vendor/clioworks-v3/quire-adapter.js", "ClioWorksQuireAdapter");
    const mods = vm.runInContext("ClioWorksQuireAdapter.MODULES", ctx).concat(vm.runInContext("ClioWorksQuireAdapter.EDITOR_MODULES", ctx)).map((m) => m.split("/").pop());
    const at = (n) => mods.indexOf(n);
    test.assert(at("fields.js") > at("layout.js") && at("fields.js") > at("editor.js") && at("layout.js") >= 0, "fields.js loads after layout.js and editor.js (it binds L.layout and L.ed at load)");
  }
  test.finish();
};
run();
