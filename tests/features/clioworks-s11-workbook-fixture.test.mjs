// ClioWorks S11 M0 contract: the "workbook" fixture adapter over the REAL vendored
// Ledger codec and the REAL ledger-adapter, reading the frozen fixtures in
// tests/fixtures/clioworks-s11/. Nothing here drives a browser; the interface view is
// covered by the on-demand browser walk, this contract holds the model rules:
//   mode switch never touches the document, Express refuses formula cells with a
//   reason, an edited formula is "尚未重算" (never the old cache, never 0), an unedited
//   save is the original bytes, an edited save is the preserving writer, the four-class
//   first-save list counts silent upstream drops, and the frozen files match MANIFEST.
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, codeOnly, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-s11-workbook-fixture");
const DIR = "tests/fixtures/clioworks-s11";
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const fileBytes = (name) => readFileSync(resolveProjectPath(`${DIR}/${name}`));

async function openWorkbook(file, sink) {
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/vendor/clioworks-v3/workbook-adapter.js"]);
  ctx.__bytes = new Uint8Array(fileBytes(file));
  ctx.__sink = sink || null;
  const session = await vm.runInContext(
    "ClioWorksWorkbook.open(globalThis.__bytes, { name: '搬家预算.xlsx', documentId: 'test:wb' }, { sink: globalThis.__sink || undefined })", ctx);
  return { ctx, session };
}

const run = async () => {
  // 1. MANIFEST agrees with the files, and the served copies are the same bytes.
  const manifest = JSON.parse(read(`${DIR}/MANIFEST.json`));
  for (const entry of manifest.files) {
    test.assert(sha(fileBytes(entry.name)) === entry.sha256, `MANIFEST sha-256 matches ${entry.name}`);
    test.assert(Array.isArray(entry.covers) && entry.covers.length > 0 && entry.source, `${entry.name} names what it covers and where it came from`);
    if (entry.name.endsWith(".xlsx")) {
      const served = readFileSync(resolveProjectPath(`app/vendor/clioworks-v3/fixture-files/${entry.name}`));
      test.assert(sha(served) === entry.sha256, `the lab-served copy of ${entry.name} is byte-identical to the frozen file`);
    }
  }
  const budget = manifest.files.find((f) => f.name === "budget-s11.xlsx");
  for (const area of ["shared-formula", "number-format", "cached-values"]) {
    test.assert(budget.covers.includes(area), `budget-s11.xlsx covers the sentinel area ${area}`);
  }
  const deck = manifest.files.find((f) => f.name === "slides-notes-comment-s11.pptx").adapterReadout;
  test.assert(deck.pages === 2 && deck.notesPages === 2 && deck.commentRecordsInModel === 1, "pptx fixture carries speaker notes and one existing comment as the Lectern adapter reads them");

  // 2. The five cell states, from the real model, told apart by text not colour.
  {
    const { session } = await openWorkbook("budget-s11.xlsx");
    const v = (ref) => session.view("预算", ref);
    test.assert(v("C9").state === "empty" && v("C9").text === "", "C9 is empty");
    test.assert(v("B10").state === "zero" && v("B10").text === "0", "B10 is the number zero, shown as 0");
    test.assert(v("B9").state === "text" && v("B9").text === "未测", "B9 is the text 未测, not zero and not empty");
    test.assert(v("D9").state === "error" && v("D9").text === "#VALUE!", "D9 shows its cached formula error");
    test.assert(v("D2").state === "formula" && v("D2").text === "¥1,320" && v("D2").formula === "B2*C2", "D2 is a formula result shown through its number format");
    test.assert(v("D5").formula === "B5*C5", "a shared-formula child keeps its translated formula");
    test.assert(v("G2").text === "12.9%", `G2 percent format applies (${v("G2").text})`);
    test.assert(/^2026年\d+月\d+日$/.test(v("H2").text), `H2 custom date format applies (${v("H2").text})`);
    test.assert(v("F12").text === "另有 1 项未测", "a string formula result keeps its cached text");
    test.assert(session.staleCells().length === 0 && !session.isDirty(), "a freshly opened workbook has no stale cells and is not dirty");
  }

  // 3. Express: formula cell refused with a reason; value edit works; mode switch is inert.
  {
    const saves = [];
    const { session } = await openWorkbook("budget-s11.xlsx", async (bytes, info) => { saves.push(info); });
    test.assert(session.mode === "express", "Express is the default mode");
    const blocked = session.commitCell("D8", "999");
    test.assert(blocked.status === "blocked" && blocked.code === "FORMULA_CELL" && blocked.message.includes("D8 是公式格") && blocked.message.includes("⌘E"),
      "Express refuses a formula cell and says why");
    test.assert(session.receipt === blocked.message && session.receiptKind === "blocked", "the refusal is the status-bar receipt, not a dialog");
    test.assert(!session.isDirty() && session.editRevision() === 0 && session.view("预算", "D8").formula === "B8*C8", "a refused edit changes nothing");
    const noFormula = session.commitCell("B2", "=1+1");
    test.assert(noFormula.status === "blocked" && noFormula.code === "EXPRESS_VALUE_ONLY", "Express does not accept a formula typed into a value cell");

    const ok = session.commitCell("B2", "250");
    test.assert(ok.status === "ok" && session.isDirty() && session.editRevision() === 1 && session.hasUnsaved(), "an Express value edit marks the document dirty");
    test.assert(session.receipt === "有未保存的修改", "the receipt starts the save sequence");
    test.assert(session.view("预算", "B2").text === "250", "the edited value shows");
    test.assert(session.view("预算", "D2").state === "stale" && session.view("预算", "D2").text === "尚未重算",
      "a formula that reads the edited cell is 尚未重算, not its old cache");
    test.assert(session.view("预算", "D12").state === "stale" && session.view("预算", "G3").state === "stale", "staleness follows the dependency chain through the total and the shared formulas");
    test.assert(session.view("预算", "D3").state === "formula" && session.view("预算", "D3").text === "¥120", "an unrelated formula keeps its cache");

    session.select(4, 3);
    const rev = session.editRevision();
    session.toggleMode();
    test.assert(session.mode === "full" && session.isDirty() && session.editRevision() === rev && saves.length === 0, "switching to full does not save and does not clear dirty");
    test.assert(session.selection().r === 4 && session.selection().c === 3, "switching mode keeps the selection");
    session.toggleMode();
    test.assert(session.mode === "express" && session.isDirty() && session.editRevision() === rev && session.hasUnsaved(), "switching back changes nothing either");
    test.assert(session.selection().r === 4 && session.selection().c === 3, "the selection survives the round trip");

    // 4. Full: formula edit → 尚未重算, never zero, never the old value.
    session.setMode("full");
    const f = session.commitCell("D3", "=B3*C3*2");
    test.assert(f.status === "ok", "full mode accepts a formula");
    const d3 = session.view("预算", "D3");
    test.assert(d3.state === "stale" && d3.text === "尚未重算" && d3.text !== "0" && d3.text !== "¥120" && d3.formula === "B3*C3*2",
      "an edited formula cell shows 尚未重算 — not the old cache, not 0");
    test.assert(session.ledger.getCell("预算", "D3").value == null, "the old cached value is dropped from the model with the formula edit");
    const bad = session.commitCell("E2", "=SUM(");
    test.assert(bad.status === "blocked" && bad.code === "FORMULA_SYNTAX" && session.ledger.getCell("预算", "E2").value === "阿澄", "a formula that does not parse is refused and the cell is untouched");
    const overwrite = session.commitCell("D4", "8");
    test.assert(overwrite.status === "ok" && session.view("预算", "D4").state === "number" && session.view("预算", "D4").formula == null, "typing a plain value over a formula replaces it");

    // 5. command matrix: wired-but-unavailable carries a reason; unwired commands are absent.
    const express = (await openWorkbook("budget-s11.xlsx")).session;
    const cmd = (s, id) => s.commandState(id);
    test.assert(!cmd(express, "file.save").enabled && cmd(express, "file.save").reason === "没有未存的修改", "存储 is greyed with its reason on a clean document");
    test.assert(!cmd(express, "cell.formula").enabled && cmd(express, "cell.formula").reason.includes("Express"), "改公式 is greyed in Express with its reason");
    express.setMode("full");
    test.assert(cmd(express, "cell.formula").enabled && cmd(express, "view.mode").enabled, "改公式 is available in full mode");
    test.assert(JSON.stringify(vm.runInContext("ClioWorksWorkbook.COMMANDS.map(c => c.id)", (await openWorkbook("budget-s11.xlsx")).ctx)) === JSON.stringify(["file.save", "view.mode", "cell.value", "cell.formula"]),
      "only wired commands exist: no undo, comments, restore or export entries in M0");
    const s2 = (await openWorkbook("budget-s11.xlsx")).session;
    test.assert(!s2.commandState("edit.undo").enabled && !s2.commandState("comment.open").enabled, "an unwired command id resolves as unavailable");
  }

  // 6. Save: unedited = original bytes; edited = preserving writer; the file re-reads.
  {
    const saved = [];
    const { ctx, session } = await openWorkbook("budget-s11.xlsx", async (bytes, info) => { saved.push({ bytes, info }); });
    const clean = await session.save();
    test.assert(clean.status === "ok" && clean.mode === "original-bytes" && saved[0].info.sha256 === sha(fileBytes("budget-s11.xlsx")) && saved[0].bytes.length === fileBytes("budget-s11.xlsx").length,
      "an unedited save is the original bytes, byte for byte");
    test.assert(session.receipt === "已存到「搬家预算.xlsx」", "the receipt names the file");

    session.commitCell("B2", "250");
    session.setMode("full");
    session.commitCell("D3", "=B3*C3*2");
    const first = await session.save();
    test.assert(first.status === "needs-confirm" && first.plan.counts, "the first edited save asks for the keep list before writing");
    test.assert(saved.length === 1, "nothing was written before the user confirmed");
    const c = first.plan.counts;
    test.assert(c.editable > 50 && c.kept >= 1 && c.lost === 0 && c.approx === session.staleCells().length && c.approx > 0,
      `four classes are counted (editable ${c.editable}, kept ${c.kept}, approx ${c.approx}, lost ${c.lost})`);
    test.assert(first.plan.kept.includes("customXml/clw-preservation.xml"), "the opaque custom XML part is listed as kept as is");
    test.assert(first.plan.defaultButton === "save", "with nothing lost the default button is 存储");
    const done = await session.save({ confirm: true });
    test.assert(done.status === "ok" && done.mode === "preserving-edit" && saved.length === 2 && saved[1].info.mode === "preserving-edit", "an edited save goes through the preserving writer");
    test.assert(saved[1].info.sha256 !== saved[0].info.sha256, "the edited bytes differ from the original");
    test.assert(!session.hasUnsaved() && session.receipt === "已存到「搬家预算.xlsx」", "the receipt reads 已存到 once nothing is newer");
    const again = session.commitCell("B3", "31");
    const second = await session.save();
    test.assert(again.status === "ok" && second.status === "ok", "later saves in the same session do not repeat the confirmation when nothing new is lost");

    // re-read what the writer produced
    ctx.__out = saved[saved.length - 1].bytes;
    const reread = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__out, { name: 'out.xlsx' })", ctx);
    test.assert(reread.getCell("预算", "B2").value === 250 && reread.getCell("预算", "B3").value === 31, "the saved file carries the value edits");
    test.assert(reread.getCell("预算", "D3").formula === "B3*C3*2" && reread.getCell("预算", "D3").value == null, "the saved file carries the new formula and no stale cache");
    test.assert(reread.getCell("预算", "D4").formula === "B4*C4" && reread.getCell("预算", "D2").formula === "B2*C2", "untouched shared-formula cells keep their formulas through the save");
    test.assert(reread.getCell("预算", "D9").value && reread.getCell("预算", "D9").value.e === "#VALUE!", "an untouched formula error keeps its cached value");
    test.assert(reread.getCell("预算", "C10").style === session.ledger.getCell("预算", "C10").style && reread.getCell("预算", "H2").value === 46300, "number formats and dates survive");
  }

  // 6a. Re-entering a formula unchanged in full mode is not an edit (keeps the cache and the clean state).
  {
    const { session } = await openWorkbook("budget-s11.xlsx");
    session.setMode("full");
    const cachedBefore = session.ledger.getCell("预算", "D2").value;
    const out = session.commitCell("D2", "=B2*C2");
    test.assert(out.code === "UNCHANGED" && !session.hasUnsaved() && session.ledger.getCell("预算", "D2").value === cachedBefore && !session.staleCells().length,
      `pressing Enter on an untouched formula changes nothing (code ${out.code}, dirty ${session.hasUnsaved()})`);
  }

  // 6b. Two saves of one revision while it is still encoding: the second is refused (S11-20).
  {
    const writes = [];
    const { session } = await openWorkbook("budget-s11.xlsx", async (bytes, info) => { writes.push(info); });
    session.commitCell("B2", "252");
    const first = session.save({ confirm: true });
    const second = await session.save({ confirm: true });
    await first;
    test.assert(second.code === "SAVE_IN_FLIGHT" && writes.length === 1, `a save during encoding is refused, not written twice (writes ${writes.length}, second ${second.code})`);
  }

  // 7. Receipt sequence with a slow store and a new edit while it runs.
  {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { session } = await openWorkbook("budget-s11.xlsx", async () => { await gate; });
    session.commitCell("B2", "251");
    const pending = session.save({ confirm: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    test.assert(session.saving && session.receipt === "存储中，仍可输入", "while storing the receipt says it is still possible to type");
    test.assert(!session.commandState("file.save").enabled && (await session.save({ confirm: true })).code === "SAVE_IN_FLIGHT", "the same candidate is not submitted twice");
    const typed = session.commitCell("B4", "5");
    test.assert(typed.status === "ok", "editing is allowed while storing");
    release();
    const result = await pending;
    test.assert(result.status === "ok" && session.hasUnsaved() && session.receipt === "已存储较早的修改，还有新修改", "an older save does not clear the newer edit's dirty state");
    const later = await session.save({ confirm: true });
    test.assert(later.status === "ok" && !session.hasUnsaved() && session.receipt === "已存到「搬家预算.xlsx」", "the next save closes the sequence");
  }

  // 8. A failing store keeps the edit and says so.
  {
    const { session } = await openWorkbook("budget-s11.xlsx", async () => { throw new Error("空间不够，还差 2 MB"); });
    session.commitCell("B2", "252");
    const out = await session.save({ confirm: true });
    test.assert(out.status === "failed" && session.hasUnsaved() && session.receipt.includes("空间不够") && session.receiptKind === "error", "a failed store reports in plain words and keeps the unsaved edit");
    test.assert(!session.saving, "a failed store releases the save lock");
  }

  // 9. S11-C9 negative input: the upstream silent SmartArt drop counts as a loss and defaults to cancel.
  {
    const negative = manifest.files.find((f) => f.name === "lossless-negative-s11.xlsx");
    const { session } = await openWorkbook("lossless-negative-s11.xlsx");
    session.commitCell("B2", "7");
    const first = await session.save();
    test.assert(first.status === "needs-confirm", "an edit-save of the negative fixture asks first");
    const dropped = session.losses().filter((l) => l.action === "drop").map((l) => l.where).sort();
    test.assert(JSON.stringify(dropped) === JSON.stringify(negative.knownLoss.expectedDroppedParts), `the codec still silently drops the SmartArt parts (${dropped.join(", ")}); update MANIFEST if upstream fixed it`);
    test.assert(session.losses().filter((l) => l.action === "drop").every((l) => l.notify === false), "the codec reports those drops with notify=false: it is silent");
    test.assert(first.plan.counts.lost >= 5 && first.plan.defaultButton === "cancel", "the first-save list still counts them and makes 取消 the default");
    test.assert(first.plan.lost.some((t) => t.includes("xl/diagrams/data1.xml")), "the list names the lost part in words");
    const refused = await session.save();
    test.assert(refused.status === "needs-confirm" && (await session.save()).status === "needs-confirm", "without a yes nothing is written");
  }

  // 10. Interface-text and fixture-entry rules.
  {
    const source = codeOnly(read("app/vendor/clioworks-v3/workbook-adapter.js"));
    test.assert(!/ClioWorks(?![A-Z])/.test(source.replace(/ClioWorks[A-Z]\w*/g, "")), "interface text never says ClioWorks (only code identifiers do)");
    test.assertNotIncludes(source, "windowName", "the fixture adapter registers no window name");
    test.assertNotIncludes(source, "localStorage", "the fixture adapter stores nothing");
    test.assertIncludes(read("app/vendor/clioworks-v3/workbook-adapter.js"), "It is NOT the real editor; the real adapter replaces it", "the fixture header keeps the house disclaimer");

    const fixtureSource = read("app/vendor/clioworks-v3/fixture.js");
    test.assertIncludes(fixtureSource, "adapterKind === 'workbook'", "fixture.js has the workbook branch");
    test.assertIncludes(fixtureSource, "fixture-files/", "the workbook branch reads the lab-served copies");
    // Without ?fixture=clioworks-v3 the file returns before touching anything.
    let touched = 0;
    const probe = {
      get document() { touched += 1; return {}; },
      location: { search: "" }, URLSearchParams,
      addEventListener() { touched += 1; },
    };
    probe.window = probe;
    probe.globalThis = probe;
    vm.createContext(probe);
    vm.runInContext(read("app/vendor/clioworks-v3/fixture.js"), probe, { filename: "fixture.js" });
    test.assert(touched === 0 && probe.__CW3_FIXTURE__ === undefined, "with no fixture parameter the fixture file does nothing");
    const other = { ...probe, location: { search: "?fixture=other" } };
    other.window = other; other.globalThis = other;
    vm.createContext(other);
    vm.runInContext(read("app/vendor/clioworks-v3/fixture.js"), other, { filename: "fixture.js" });
    test.assert(other.__CW3_FIXTURE__ === undefined, "an unrelated fixture name does nothing either");
  }

  test.finish();
};

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
