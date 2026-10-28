// ClioWorks N3 (core) contract: the shared find/replace engine over the three Office
// document models, through the REAL vendored codecs + adapters in the S11 vm context.
// The roadmap's N3 rules, checked the way a user experiences them:
//   - documents search paragraph by paragraph (stories: body, headers/footers,
//     footnotes, comments), workbooks cell by cell, presentations text box by text
//     box and speaker notes;
//   - matches carry stable locators (docx story + paragraph index path + character
//     offsets, xlsx sheet + cell address + formula flags, pptx slide + shape +
//     paragraph/run offsets, or notes);
//   - every replacement goes through the edit operations the editors already use, so
//     undo works: docx = one named D.tx on the Quire model reported with
//     syncExternal(); xlsx = adapter.setCell (cell / formula steps) nested in ONE
//     outer wb.undo transaction; pptx = adapter.setRunText / setNotes;
//   - 「全部替换」 is ONE named step in the undo history (「全部替换 N 处」) wherever the
//     adapter exposes a batch-capable history (docx, xlsx); today's lectern-adapter
//     owns its history behind a closure-private transact, so a pptx replaceAll is N
//     individually undoable steps — undoing all of them restores the exact original;
//   - case / whole-word (Latin only) / full-half-width options; a match spanning two
//     runs keeps the first run's formatting and leaves the other runs' untouched text
//     intact; fields, hyperlink targets and formulas (unless options.inFormulas) are
//     never touched; read-only content (ClioWrite tables) reports matches with
//     readOnly: true and replaceAll skips it, counted separately;
//   - save after replaceAll and reopen with the adapter shows the new text, and R1's
//     part-level preservation still holds: only the edited parts change (zip entries
//     compared against the original package).
import vm from "node:vm";
import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";
import { createFeatureTest, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import { changedParts } from "../../tooling/clioworks-r1-corpus.mjs";

const test = createFeatureTest("clioworks-n3-find-replace");
const ENGINE = "app/vendor/clioworks-v3/find-replace.js";
const fixture = (p) => new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/" + p)));

function session(adapterFile, globalName) {
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/" + adapterFile, ENGINE]);
  const open = async (bytes, meta = { name: "test" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext(`${globalName}.open(globalThis.__bytes, globalThis.__meta)`, ctx);
  };
  const fr = vm.runInContext("ClioWorksFindReplace", ctx);
  const run = (code) => vm.runInContext(code, ctx);
  return { ctx, open, fr, run };
}
const part = (bytes, name) => {
  const e = new AdmZip(Buffer.from(bytes)).getEntry(name);
  return e ? e.getData() : null;
};
const zipNames = (bytes) => new Set(new AdmZip(Buffer.from(bytes)).getEntries().filter((e) => !e.isDirectory).map((e) => e.entryName));

const run = async () => {
  {
    const { fr } = session("quire-adapter.js", "ClioWorksQuireAdapter");
    test.assert(fr && typeof fr.find === "function" && typeof fr.replace === "function" && typeof fr.replaceAll === "function", "the engine exposes find, replace and replaceAll");
    let threw = "";
    try { fr.find({}, "eml", "x"); } catch (e) { threw = e.message; }
    test.assert(/unknown kind/.test(threw), "an unknown kind is refused");
  }

  /* ------------------------------------------------------------ docx */
  {
    const { open, fr, run } = session("quire-adapter.js", "ClioWorksQuireAdapter");
    const a = await open(fixture("clioworks-s11/quire-s11.docx"), { name: "搬家清单.docx" });

    // 1. find counts and locators: body paragraph + read-only table cell.
    const hits = fr.find(a, "docx", "纸箱");
    test.assert(hits.length === 2, `find("纸箱") reports the body paragraph and the table cell (got ${hits.length})`);
    const body = hits[0], cell = hits[1];
    test.assert(body.text === "纸箱" && body.kind === "docx" && body.readOnly === false, "the body match is editable and carries the matched text");
    test.assert(body.locator.story === "main" && JSON.stringify(body.locator.path) === "[5]" && body.locator.from === 2 && body.locator.to === 4, "the body locator is story main + paragraph index path + character offsets");
    test.assert(cell.readOnly === true && cell.locator.path.length === 4 && typeof cell.locator.paragraphId === "string", "the table-cell match is readOnly with a path into the table");
    test.assert(fr.find(a, "docx", "").length === 0, "an empty query finds nothing");

    // 2. Comments are searched only with includeComments.
    test.assert(fr.find(a, "docx", "再确认").length === 0, "comment text is not searched by default");
    const withComments = fr.find(a, "docx", "纸箱", { includeComments: true });
    test.assert(withComments.length === 3 && withComments[2].locator.story === "comment:0" && withComments[2].readOnly === false, "includeComments finds the comment text as an editable match");

    // 3. replaceAll: one named undo step; the read-only table is skipped and counted.
    const tableBefore = a.tables()[0].rows[1][0].text;
    const parasBefore = a.paragraphs().map((p) => p.runs.map((r) => r.text));
    const all = fr.replaceAll(a, "docx", "纸箱", "卡板", { includeComments: true });
    test.assert(all.count === 2 && all.skipped === 1, `replaceAll replaces 2 and skips the read-only table match (got ${JSON.stringify({ count: all.count, skipped: all.skipped })})`);
    test.assert(all.step && all.step.label === "全部替换 2 处", "replaceAll is one NAMED step: 「全部替换 2 处」");
    test.assert(a.undoLabel() === "全部替换 2 处" && a.canUndo(), "the adapter's undo history holds the named step");
    test.assert(a.tables()[0].rows[1][0].text === tableBefore, "the read-only table text is untouched");
    test.assert(a.paragraphs().some((p) => p.text === "先把卡板数量点清楚。"), "the body paragraph shows the replacement");
    test.assert(a.comments()[0].text === "卡板数量再确认一下" && a.comments()[0].anchor.quote === "卡板", "the comment text shows the replacement and its anchor follows the new word");

    // 4. One undo restores the exact original text everywhere.
    a.undo();
    test.assert(JSON.stringify(a.paragraphs().map((p) => p.runs.map((r) => r.text))) === JSON.stringify(parasBefore), "undo restores the exact original run text of every paragraph");
    test.assert(a.comments()[0].text === "纸箱数量再确认一下" && a.tables()[0].rows[1][0].text === tableBefore, "undo restores the comment text and leaves the table as it was");

    // 5. A match spanning two runs keeps the FIRST run's formatting; other runs' untouched text stays.
    const para = a.paragraphs().find((p) => p.text.startsWith("普通的一句"));
    const cross = fr.find(a, "docx", "一句，加粗");
    test.assert(cross.length === 1 && cross[0].locator.firstRun === 0 && cross[0].locator.lastRun === 1, "a match across a plain and a bold run is found with both run indices");
    const rep = fr.replace(a, "docx", cross[0], "一段加粗");
    test.assert(rep.count === 1 && rep.step.label === "替换", "replace() is one named step");
    const after = a.runs(para.id).map((r) => r.text + (r.b ? "[b]" : ""));
    test.assert(JSON.stringify(after) === JSON.stringify(["普通的一段加粗", "的一句，[b]", "斜体的一句，", "下划线的一句。"]), `the replaced text takes the first run's (plain) formatting and the bold tail keeps its own (got ${JSON.stringify(after)})`);
    a.undo();
    test.assert(JSON.stringify(a.runs(para.id).map((r) => r.text)) === JSON.stringify(["普通的一句，", "加粗的一句，", "斜体的一句，", "下划线的一句。"]), "undo restores the exact original run structure");

    // 6. Several matches in one paragraph apply right-to-left in one step.
    const four = fr.replaceAll(a, "docx", "的一句", "一段");
    test.assert(four.count === 4, "four matches in one formatting ladder are all replaced");
    test.assert(a.paragraphs().find((p) => p.id === para.id).text === "普通一段，加粗一段，斜体一段，下划线一段。", "the ladder paragraph reads with every replacement in place");
    a.undo();

    // 7. Fields are never matched; hyperlink targets pass through.
    run("const q = L.D.doc.main.blocks[2]; L.O.insertField(L.D.pos(q, 2), 'DATE', '2026-10')");
    test.assert(fr.find(a, "docx", "2026-10").length === 0 && fr.find(a, "docx", "DATE").length === 0, "neither a field's instruction nor its result is searched");
    run("const r = L.D.doc.main.blocks[11].runs[0]; r.rPr = Object.assign({}, r.rPr, { link: 'https://example.com/moving' })");
    const link = fr.find(a, "docx", "什么格式都没有");
    test.assert(link.length === 1, "hyperlink text is searchable");
    fr.replace(a, "docx", link[0], "全部收拾好了");
    test.assert(run("L.D.doc.main.blocks[11].runs[0].rPr.link") === "https://example.com/moving", "the hyperlink target is untouched by the replacement");

    // 8. Save after replaceAll, reopen, part-level preservation.
    const all2 = fr.replaceAll(a, "docx", "纸箱", "卡板", { includeComments: true });
    test.assert(all2.count === 2 && all2.skipped === 1, "the same replaceAll after the undos replaces 2 and skips 1 again");
    const saved = await a.save();
    test.assert(saved.mode === "preserving-edit", "an edited document saves through the preserving writer");
    const changed = changedParts(fixture("clioworks-s11/quire-s11.docx"), saved.bytes);
    test.assert(changed.every((n) => n === "word/document.xml" || n === "word/comments.xml"), `only the edited story parts change (got ${JSON.stringify(changed)})`);
    test.assert(part(saved.bytes, "word/document.xml") && zipNames(saved.bytes).size === zipNames(fixture("clioworks-s11/quire-s11.docx")).size, "the package keeps all its entries");
    const b = await open(saved.bytes, { name: "reopen.docx" });
    test.assert(b.paragraphs().some((p) => p.text === "先把卡板数量点清楚。") && b.comments()[0].text === "卡板数量再确认一下", "reopening the saved file shows the new text");
    test.assert(fr.find(b, "docx", "纸箱").length === 1 && fr.find(b, "docx", "纸箱")[0].readOnly === true, "after replaceAll only the read-only table still holds the old word");

    // 9. Refusals: read-only and stale matches.
    const cellHit = fr.find(b, "docx", "纸箱")[0];
    test.assert(fr.replace(b, "docx", cellHit, "x").status === "blocked" && fr.replace(b, "docx", cellHit, "x").code === "READ_ONLY", "replace() refuses a read-only table match");
    const once = fr.find(b, "docx", "卡板数量")[0];
    fr.replace(b, "docx", once, "点清楚");
    test.assert(fr.replace(b, "docx", once, "点清楚").code === "STALE_MATCH", "replace() refuses a match whose text no longer sits at the locator");
  }

  // 10. Real corpus D15: case sensitivity, whole word, comments, preservation.
  {
    const { open, fr } = session("quire-adapter.js", "ClioWorksQuireAdapter");
    const a = await open(fixture("real-corpus/docx/D15.docx"), { name: "D15.docx" });
    test.assert(fr.find(a, "docx", "text").length === 4, `case-insensitive find("text") counts the four body occurrences (got ${fr.find(a, "docx", "text").length})`);
    test.assert(fr.find(a, "docx", "Text", { caseSensitive: true }).length === 0, "case-sensitive find distinguishes Text from text");
    test.assert(fr.find(a, "docx", "note", { wholeWord: true }).length === 2, "whole-word find matches note as a word");
    test.assert(fr.find(a, "docx", "te", { wholeWord: true }).length === 0, "whole-word find refuses a fragment of a word");
    const inComment = fr.find(a, "docx", "hyperlink", { includeComments: true });
    test.assert(inComment.length === 1 && inComment[0].locator.story === "comment:0", "the real corpus comment is found in its story");
    const all = fr.replaceAll(a, "docx", "note", "memo", { wholeWord: true });
    test.assert(all.count === 2 && all.step.label === "全部替换 2 处", "the corpus replaceAll is one named step of 2");
    const saved = await a.save();
    // D15 is a Word-14 file the writer normalises broadly; R1's own baseline records
    // exactly the part set below for a one-edit change (untouched_parts_identical false).
    const allowed = new Set(["[Content_Types].xml", "_rels/.rels", "word/_rels/comments.xml.rels", "word/_rels/document.xml.rels", "word/comments.xml", "word/commentsExtended.xml", "word/document.xml", "word/fontTable.xml", "word/styles.xml"]);
    const changed = changedParts(fixture("real-corpus/docx/D15.docx"), saved.bytes);
    test.assert(changed.every((n) => allowed.has(n)), `the corpus edit changes only the parts R1's own baseline records (got ${JSON.stringify(changed)})`);
    const b = await open(saved.bytes, { name: "D15-reopen.docx" });
    test.assert(b.paragraphs().some((p) => p.text.includes("worthy of memo")), "the reopened corpus file shows the replacement");
  }

  /* ------------------------------------------------------------ xlsx */
  {
    const { open, fr } = session("ledger-adapter.js", "ClioWorksLedgerAdapter");
    const a = await open(fixture("clioworks-s11/budget-s11.xlsx"), { name: "预算.xlsx" });

    // 1. find: value cells, formula cells in their displayed value, sheet scope.
    const hits = fr.find(a, "xlsx", "未测");
    test.assert(hits.length === 3, `find("未测") counts the value cell, the formula's displayed value and the second sheet (got ${hits.length})`);
    const valueHit = hits.find((m) => m.locator.ref === "B9");
    const displayHit = hits.find((m) => m.locator.ref === "F12");
    const sheet2Hit = hits.find((m) => m.locator.sheet === "口径");
    test.assert(valueHit && valueHit.readOnly === false && valueHit.locator.formula == null && valueHit.text === "未测", "the value cell is an editable match with sheet + address");
    test.assert(displayHit && displayHit.formula === true && displayHit.readOnly === true && displayHit.locator.displayed === true, "the formula cell is searched in its displayed value and marked read-only");
    test.assert(sheet2Hit && sheet2Hit.readOnly === false, "the second sheet is searched");
    test.assert(fr.find(a, "xlsx", "COUNTIF").length === 0, "formula TEXT is not searched by default");
    test.assert(fr.find(a, "xlsx", "COUNTIF", { inFormulas: true }).length === 1, "inFormulas searches the formula text");
    const inF = fr.find(a, "xlsx", "未测", { inFormulas: true });
    test.assert(inF.length === 4 && inF.filter((m) => m.locator.inFormula).length === 2, "with inFormulas the formula text is searched too (two occurrences in F12)");
    test.assert(fr.find(a, "xlsx", "纸箱", { scope: "口径" }).length === 0 && fr.find(a, "xlsx", "口径", { scope: "口径" }).length === 1, "scope restricts the search to the named sheet");

    // 2. replaceAll leaves formulas untouched by default and is ONE undoable step.
    const f12Before = a.getCell("预算", "F12").formula;
    const all = fr.replaceAll(a, "xlsx", "未测", "已测");
    test.assert(all.count === 2 && all.skipped === 1, `replaceAll replaces the 2 value matches and skips the formula (got ${JSON.stringify({ count: all.count, skipped: all.skipped })})`);
    test.assert(all.step.label === "全部替换 2 处" && a.undoLabel() === "全部替换 2 处", "replaceAll is one NAMED step in the workbook's undo history");
    test.assert(a.getCell("预算", "F12").formula === f12Before, "the formula itself is untouched by default");
    test.assert(a.getCell("预算", "F12").value == null && a.stale("预算").includes("F12"), "its cached result is honestly invalidated (its precedent B9 changed), not rewritten");
    test.assert(a.getCell("预算", "B9").value === "已测" && a.getCell("口径", "A2").value.includes("已测"), "both value cells show the replacement");
    const snapshot = [a.getCell("预算", "B9").value, a.getCell("口径", "A2").value, a.getCell("预算", "F12").formula];
    a.undo();
    test.assert(a.getCell("预算", "B9").value === "未测" && a.getCell("预算", "F12").formula === f12Before, "ONE undo restores the exact original values and formula");

    // 3. With inFormulas the formula text is replaced through the formula edit step.
    const allF = fr.replaceAll(a, "xlsx", "未测", "已测", { inFormulas: true });
    test.assert(allF.count === 4 && allF.skipped === 0, "with inFormulas all four occurrences are replaced");
    test.assert(a.getCell("预算", "F12").formula === '"另有 "&COUNTIF(B2:B10,"已测")&" 项已测"', "the formula text shows both replacements");
    test.assert(a.getCell("预算", "F12").value == null && a.stale("预算").includes("F12"), "the edited formula's cached result is cleared and marked stale");
    a.undo();
    test.assert(a.getCell("预算", "F12").formula === f12Before, "undo restores the exact original formula");
    void snapshot;
  }

  // 4. Real corpus X07: bulk replaceAll across sheets, one step, preservation.
  {
    const { open, fr } = session("ledger-adapter.js", "ClioWorksLedgerAdapter");
    const a = await open(fixture("real-corpus/xlsx/X07.xlsx"), { name: "X07.xlsx" });
    test.assert(fr.find(a, "xlsx", "字符串", { scope: "Sheet2" }).length === 11, "scope Sheet2 finds the 11 cells of that sheet only");
    const all = fr.replaceAll(a, "xlsx", "字符串", "文本");
    test.assert(all.count === 22 && all.skipped === 0, `the two-sheet replaceAll replaces 22 cells (got ${all.count})`);
    test.assert(all.step.label === "全部替换 22 处" && a.undoLabel() === "全部替换 22 处", "22 cell edits are ONE named undo step");
    a.undo();
    test.assert(a.getCell("Sheet1", "A4").value === "字符串2" && a.getCell("Sheet2", "A4").value === "表2字符串2", "one undo restores both sheets exactly");
    fr.replaceAll(a, "xlsx", "字符串", "文本");
    const saved = await a.save();
    const changed = changedParts(fixture("real-corpus/xlsx/X07.xlsx"), saved.bytes);
    test.assert(changed.every((n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n)), `only the edited worksheet parts (and the shared strings) change (got ${JSON.stringify(changed)})`);
    const b = await open(saved.bytes, { name: "X07-reopen.xlsx" });
    test.assert(b.getCell("Sheet2", "A4").value === "表2文本2", "the reopened workbook shows the new text");
  }

  /* ------------------------------------------------------------ pptx */
  {
    const { open, fr, run } = session("lectern-adapter.js", "ClioWorksLecternAdapter");
    const a = await open(fixture("clioworks-s11/slides-notes-comment-s11.pptx"), { name: "夹具.pptx" });

    // 1. Notes are searched only with includeNotes; scope picks slides or notes.
    test.assert(fr.find(a, "pptx", "测试范围").length === 0, "speaker notes are not searched by default");
    const notes = fr.find(a, "pptx", "测试范围", { includeNotes: true });
    test.assert(notes.length === 2 && notes.every((m) => m.locator.notes === true && m.readOnly === false), "includeNotes finds both slides' notes");
    test.assert(fr.find(a, "pptx", "设备丙").length === 1, "slide text is found by default");
    test.assert(fr.find(a, "pptx", "测试范围", { includeNotes: true, scope: "slides" }).length === 0 && fr.find(a, "pptx", "测试范围", { includeNotes: true, scope: "notes" }).length === 2, "scope picks slides or notes");

    // 2. replace() on a notes match restores exactly with one undo.
    const notesBefore = a.slides().map((sl) => a.notes(sl.id));
    const rep = fr.replace(a, "pptx", notes[0], "验收范围");
    test.assert(rep.count === 1, "replace() on a notes match works");
    test.assert(a.notes(notes[0].locator.slide) === "演讲备注：停一下，再解释验收范围。此处不属于观众画面。", "the notes show the replacement");
    a.undo();
    test.assert(a.notes(notes[0].locator.slide) === notesBefore[a.slides().findIndex((sl) => sl.id === notes[0].locator.slide)], "undo restores the exact notes string");

    // 3. A match spanning two runs: found with run offsets, replaced keeping the first run's formatting.
    run("const sh = L.pres.slides[0].shapes.find((s) => s.tx && s.tx.ps && s.tx.ps.some((p) => p.rs.some((r) => typeof r.t === 'string' && r.t.includes('设备丙'))));"
      + "const para = sh.tx.ps.find((p) => p.rs.some((r) => typeof r.t === 'string' && r.t.includes('设备丙')));"
      + "const r0 = para.rs[0]; para.rs.splice(1, 0, { t: r0.t.slice(3) }); r0.t = r0.t.slice(0, 3);");
    const cross = fr.find(a, "pptx", "丙尚未");
    test.assert(cross.length === 1 && cross[0].locator.spans.length === 2, "a match across the split runs is found with two span entries");
    const shapeInfo = a.slides().flatMap((sl) => a.shapes(sl.id)).find((s) => s.id === cross[0].locator.shape);
    test.assert(shapeInfo && shapeInfo.editable, "the locator's shape id resolves through the adapter");
    fr.replace(a, "pptx", cross[0], "丁全都");
    const texts = run("L.pres.slides[0].shapes.flatMap((s) => s.tx ? s.tx.ps.flatMap((p) => p.rs.map((r) => r.t)) : [])");
    test.assert(texts.includes("设备丁全都") && texts.includes("测试。"), `the first run takes prefix + replacement, the last keeps its suffix (got ${JSON.stringify(texts)})`);
    a.undo(); a.undo();
    const restored = run("L.pres.slides[0].shapes.flatMap((s) => s.tx ? s.tx.ps.flatMap((p) => p.rs.map((r) => r.t)) : [])");
    test.assert(restored.includes("设备丙尚未测试。"), "two undos restore the exact original run texts");

    // 4. replaceAll over notes on both slides: one named step through the adapter's transact.
    const all = fr.replaceAll(a, "pptx", "测试范围", "验收范围", { includeNotes: true });
    test.assert(all.count === 2 && all.skipped === 0, "replaceAll covers both slides' notes");
    test.assert(all.step.label === "全部替换 2 处", "the step is named 「全部替换 2 处」");
    const updated = fr.find(a, "pptx", "验收范围", { includeNotes: true });
    test.assert(updated.length === 2, "both notes show the replacement");
    const saved = await a.save();
    test.assert(a.canUndo() && a.undoLabel() === "全部替换 2 处", "replaceAll is ONE named step in the lectern adapter's undo history");
    a.undo();
    test.assert(a.slides().map((sl) => a.notes(sl.id)).join("|") === notesBefore.join("|"), "one undo restores the exact original notes on both slides");
    const b = await open(saved.bytes, { name: "夹具-reopen.pptx" });
    test.assert(fr.find(b, "pptx", "验收范围", { includeNotes: true }).length === 2, "the reopened presentation shows the new notes");
  }

  // 5. Real corpus P01: mixed body + notes replaceAll, preservation, reopen.
  {
    const { open, fr, run } = session("lectern-adapter.js", "ClioWorksLecternAdapter");
    const a = await open(fixture("real-corpus/pptx/P01.pptx"), { name: "P01.pptx" });
    test.assert(fr.find(a, "pptx", "slide").length === 3 && fr.find(a, "pptx", "slide", { includeNotes: true }).length === 5, "the corpus deck counts slide-body and notes matches separately");
    run("const sh = L.pres.slides[0].shapes.find((s) => s.tx && s.tx.ps && s.tx.ps.some((p) => p.rs.some((r) => typeof r.t === 'string' && r.t.includes('italic green'))));"
      + "const para = sh.tx.ps.find((p) => p.rs.some((r) => typeof r.t === 'string' && r.t.includes('italic green')));"
      + "const r0 = para.rs[0]; const half = Math.ceil(r0.t.length / 2); para.rs.splice(1, 0, { t: r0.t.slice(half) }); r0.t = r0.t.slice(0, half);");
    const cross = fr.find(a, "pptx", "in italic gre");
    test.assert(cross.length === 1 && cross[0].locator.spans.length === 2, "the corpus cross-run match spans the split runs");
    fr.replace(a, "pptx", cross[0], "IN ITALIC GRE");
    const texts = run("L.pres.slides[0].shapes.flatMap((s) => s.tx ? s.tx.ps.flatMap((p) => p.rs.map((r) => r.t)) : [])");
    test.assert(texts.includes("This bit is IN ITALIC GRE") && texts.includes("en"), "the corpus replacement keeps the first run's formatting and the suffix");
    const all = fr.replaceAll(a, "pptx", "slide", "page", { includeNotes: true });
    test.assert(all.count === 5, "the mixed replaceAll covers 3 body runs and 2 notes");
    const saved = await a.save();
    const changed = changedParts(fixture("real-corpus/pptx/P01.pptx"), saved.bytes);
    test.assert(changed.every((n) => /^ppt\/slides\/[^/]+\.xml$/.test(n) || /^ppt\/notesSlides\//.test(n) || /^docProps\//.test(n)), `only slide, notes and docProps parts change (got ${JSON.stringify(changed)})`);
    const b = await open(saved.bytes, { name: "P01-reopen.pptx" });
    const titles = b.shapes(b.slides()[0].id).filter((s) => s.editable).flatMap((s) => s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")));
    test.assert(titles.includes("Title of the first page") && titles.includes("This bit is IN ITALIC GREen"), "the reopened deck shows the replaced body text");
    test.assert((b.notes(b.slides()[0].id) || "").includes("first page"), "the reopened deck shows the replaced notes");
  }

  /* ------------------------------------------------------------ guards */
  {
    const { open, fr } = session("ledger-adapter.js", "ClioWorksLedgerAdapter");
    const a = await open(fixture("clioworks-s11/budget-s11.xlsx"), { name: "预算.xlsx" });
    const raw = a.workbook();
    test.assert(fr.find(raw, "xlsx", "未测").length === 3, "find accepts a raw workbook model too");
    let threw = "";
    try { fr.replace(raw, "xlsx", fr.find(raw, "xlsx", "未测")[0], "x"); } catch (e) { threw = e.message; }
    test.assert(/adapter session/.test(threw), "xlsx replacement refuses a raw model: undo and save live in the adapter");
  }

  test.finish();
};

run();
