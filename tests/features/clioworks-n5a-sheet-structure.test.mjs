// ClioWorks N5a contract: structural editing over the real Ledger adapter and the
// vendored VibeOffice codec. insert/delete rows and columns shift exactly what
// Excel shifts — formulas on the same and on other sheets (relative and absolute,
// ranges that grow, deleted references that become #REF!), merged cells, defined
// names, table objects, chart series ranges, conditional-formatting and
// data-validation ranges — each change is ONE named undo step; pivot tables and
// slicers are reported as kept-as-is and reach the first-save list. Fill
// down/right shifts relative references like a copy. Freeze panes round-trip
// through save and reopen. The grid has no 500×26 cap: a 10,000-row workbook
// opens inside a time box and the surface keeps only a window of rows in the DOM.
// Every real corpus xlsx is opened, one row inserted, saved, and the saved
// package reopens with the adapter and its formulas shifted.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-n5a-sheet-structure");
const BUDGET = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/budget-s11.xlsx")));
const S = "预算";

// One context per group; the codec loads once, every open() reads the fixture again.
function session() {
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/vendor/clioworks-v3/ledger-structure.js"]);
  const open = async (bytes, meta = { name: "n5a.xlsx" }) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, globalThis.__meta)", ctx);
  };
  return { ctx, open };
}

/** Put a raw cell into the model (no adapter bookkeeping) — the lane's precedent for model setup. */
const put = (sh, r, c, cell) => { sh.rowObj(r).cells[c] = cell; if (r > sh.maxR) sh.maxR = r; if (c > sh.maxC) sh.maxC = c; };

const run = async () => {
  /* ------------------------------------------- 1. rows: every reference kind */
  {
    const { ctx, open } = session();
    const a = await open(BUDGET);
    const wb = a.workbook();
    const sh = wb.sheets[0];
    wb.addSheet("其他", 1);
    const other = wb.sheetByName("其他");
    put(sh, 0, 10, { f: "B5+C5", v: 1 });            // K1, same sheet, relative
    put(sh, 1, 11, { f: "$B$5+$C5+B$5", v: 1 });      // L2: absolute flags — a structural change moves absolute refs too
    put(sh, 2, 12, { f: "SUM(B4:B8)", v: 1 });        // M3: at or after the line, the whole range moves down
    put(sh, 3, 13, { f: "SUM(B2:B8)", v: 1 });        // N4: the line lands inside, the range grows
    put(other, 0, 0, { f: "预算!B5", v: 1 });          // other sheet, qualified ref
    sh.merges.push({ r1: 2, c1: 1, r2: 4, c2: 2 });
    wb.names.push({ name: "BandName", ref: "预算!$A$3:$A$6", scope: null });
    sh.cf.push({ ranges: [{ r1: 2, c1: 0, r2: 5, c2: 1 }], rules: [{ priority: 1 }] });
    sh.dv.push({ ranges: [{ r1: 2, c1: 3, r2: 3, c2: 3 }], type: "whole", f1: "预算!$B$3" });
    wb.tables.push({ name: "StructTable", sheet: sh, ref: { r1: 3, c1: 4, r2: 6, c2: 5 }, columns: [] });
    sh.drawings.push({ kind: "chart", name: "C1", id: 1, anchor: { type: "abs", x: 0, y: 0, w: 10, h: 10 },
      chart: { refs: ["预算!$B$2:$B$6"], series: [{ nameRef: "预算!$A$2", catRef: null, valRef: "预算!$B$2:$B$6" }] } });

    const survey = a.surveyLines(S, "r", 2, 1);
    test.assert(survey.shifts.formulas >= 5 && survey.shifts.merges === 1 && survey.shifts.names === 1 && survey.shifts.cf === 1 && survey.shifts.dv === 1 && survey.shifts.tables === 1 && survey.shifts.charts === 1,
      `survey counts every kind the insert will move, the fixture's own formulas included (${JSON.stringify(survey.shifts)})`);

    const out = a.insertRows(S, 2, 1); // one row before row 3
    test.assert(out.status === "ok" && out.formulas >= 5, `insertRows answers ok with the formula count (${out.status}, ${out.formulas})`);
    test.assert(a.getCell(S, "K1").formula === "B6+C6", `a formula above the line stays put while its references move (K1: ${a.getCell(S, "K1").formula})`);
    test.assert(a.getCell(S, "L2").formula === "$B$6+$C6+B$6", "insert moves absolute references too ($B$5 → $B$6)");
    test.assert(a.getCell(S, "M4").formula === "SUM(B5:B9)", "a range at or after the line moves down with it");
    test.assert(a.getCell(S, "N5").formula === "SUM(B2:B9)", "a range the insert lands inside grows by one row");
    test.assert(a.getCell("其他", "A1").formula === "预算!B6", "a formula on ANOTHER sheet that names the changed sheet shifts (预算!B5 → 预算!B6)");
    const merge = sh.merges.find((m) => m.c1 === 1 && m.c2 === 2);
    test.assert(merge && merge.r1 === 3 && merge.r2 === 5, "a merge at or after the line moves down one row");
    test.assert(wb.names.some((n) => n.name === "BandName" && n.ref.includes("$A$4:$A$7")), `a defined name's range shifts (${wb.names.find((n) => n.name === "BandName")?.ref})`);
    test.assert(sh.cf[0] && sh.cf[0].ranges[0].r1 === 3 && sh.cf[0].ranges[0].r2 === 6, "a conditional-formatting range shifts with the rows");
    test.assert(sh.dv[0] && sh.dv[0].ranges[0].r1 === 3 && sh.dv[0].f1 === "预算!$B$4", "a data-validation range and its formula both shift");
    const table = wb.tables.find((t) => t.name === "StructTable");
    test.assert(table && table.ref.r1 === 4 && table.ref.r2 === 7, "a table object's range shifts (through the codec's own table shifter)");
    const chart = sh.drawings.find((d) => d.kind === "chart");
    test.assert(chart.chart.refs[0] === "预算!$B$2:$B$7" && chart.chart.series[0].valRef === "预算!$B$2:$B$7" && chart.chart.series[0].nameRef === "预算!$A$2",
      `chart series references shift (${chart.chart.refs[0]})`);

    // One named undo step puts every shifted thing back; redo reapplies it.
    test.assert(a.canUndo() && a.undoLabel() === "insert-rows", "the whole structural change is one named undo step (insert-rows)");
    a.undo();
    test.assert(a.getCell(S, "K1").formula === "B5+C5" && a.getCell(S, "M3").formula === "SUM(B4:B8)", "undo moves every reference back");
    test.assert(wb.names.find((n) => n.name === "BandName").ref.includes("$A$3:$A$6") && sh.cf[0].ranges[0].r1 === 2, "undo restores the defined name and the conditional-formatting range");
    a.redo();
    test.assert(a.getCell(S, "K1").formula === "B6+C6", "redo reapplies the shift");
    a.undo();
    test.assert(a.getCell(S, "K1").formula === "B5+C5", "undo and redo replay the model snapshot pair");
    void ctx;
  }

  /* --------------------------------- 2. delete: #REF!, shrunk ranges, cleanup */
  {
    const { open } = session();
    const a = await open(BUDGET);
    const wb = a.workbook();
    const sh = wb.sheets[0];
    put(sh, 0, 10, { f: "B5+1", v: 1 });               // K1 points at row 5
    put(sh, 1, 11, { f: "SUM(B3:B8)", v: 1 });         // L2 spans the deleted rows
    sh.merges.push({ r1: 2, c1: 1, r2: 4, c2: 2 });    // rows 3\u20135: fully deleted
    sh.merges.push({ r1: 2, c1: 6, r2: 6, c2: 7 });    // rows 3\u20137: clipped
    a.deleteRows(S, 2, 3);                              // delete rows 3\u20135
    test.assert(a.getCell(S, "K1").formula === "#REF!+1" && a.getCell(S, "K1").value == null, `a reference to a deleted row becomes #REF! and loses its cache (${a.getCell(S, "K1").formula})`);
    test.assert(a.getCell(S, "L2").formula === "SUM(B3:B5)", "a range over the deleted rows shrinks by three");
    test.assert(!sh.merges.some((m) => m.c1 === 1 && m.c2 === 2), "a merge fully inside the deleted rows is removed");
    const clipped = sh.merges.find((m) => m.c1 === 6);
    test.assert(clipped && clipped.r1 === 2 && clipped.r2 === 3, "a merge overlapping the deleted rows shrinks");
    a.undo();
    test.assert(a.getCell(S, "K1").formula === "B5+1" && sh.merges.length === 2, "undoing a delete restores the formula and both merges");
    a.redo();
    a.insertRows(S, 2, 3);
    test.assert(a.getCell(S, "L2").formula === "SUM(B6:B8)", "re-inserting at the range's start moves it down, exactly as Excel does");
  }

  /* ------------------------------------------------- 3. columns shift the same */
  {
    const { open } = session();
    const a = await open(BUDGET);
    const wb = a.workbook();
    const sh = wb.sheets[0];
    put(sh, 5, 9, { f: "F6+G6", v: 1 });               // J6
    wb.names.push({ name: "ColName", ref: "预算!$F$2:$H$2", scope: null });
    sh.cf.push({ ranges: [{ r1: 0, c1: 5, r2: 3, c2: 7 }], rules: [{ priority: 1 }] });
    a.insertCols(S, 5, 1);                              // a column left of F
    test.assert(a.getCell(S, "K6").formula === "G6+H6", "insertCols shifts same-sheet formulas (J6\u2192K6: F6+G6 \u2192 G6+H6)");
    test.assert(wb.names.find((n) => n.name === "ColName").ref.includes("$G$2:$I$2"), `a defined name over columns shifts (${wb.names.find((n) => n.name === "ColName")?.ref})`);
    test.assert(sh.cf[0].ranges[0].c1 === 6 && sh.cf[0].ranges[0].c2 === 8, "a conditional-formatting range shifts over columns");
    a.deleteCols(S, 5, 1);
    test.assert(a.getCell(S, "J6").formula === "F6+G6", "deleteCols moves the formula back");
    put(sh, 6, 6, { f: "H7+1", v: 1 });                 // G7 points at column H
    a.deleteCols(S, 7, 1);
    test.assert(a.getCell(S, "G7").formula === "#REF!+1", "deleting a referenced column produces #REF!");
    const guard = a.deleteCols(S, 16384, 1);
    test.assert(guard.status === "blocked", "a line past the sheet is refused, never faked");
  }

  /* ------------------------------------- 4. fill down/right: copy-like shifts */
  {
    const { open } = session();
    const a = await open(BUDGET);
    const sh = a.workbook().sheets[0];
    put(sh, 0, 10, { f: "B1+$C$1+C$1", v: 1 });        // K1: relative + both absolute shapes
    put(sh, 0, 11, { v: 7 });                           // L1: a literal
    a.fillRange(S, { r1: 0, c1: 10, r2: 2, c2: 11 }, "down");
    test.assert(a.getCell(S, "K2").formula === "B2+$C$1+C$1" && a.getCell(S, "K3").formula === "B3+$C$1+C$1",
      "fill down shifts relative references and keeps absolute ones");
    test.assert(a.getCell(S, "L2").value === 7 && a.getCell(S, "L3").value === 7, "fill down copies literal values");
    test.assert(a.canUndo() && a.undoLabel() === "fill-down", "fill is one named undo step (fill-down)");
    a.undo();
    test.assert(a.getCell(S, "K2").formula == null && a.getCell(S, "L2").value == null, "undo clears the filled cells");
    a.redo();
    put(sh, 4, 12, { f: "E5+$E$5", v: 1 });             // M5
    a.fillRange(S, { r1: 4, c1: 12, r2: 5, c2: 14 }, "right");
    test.assert(a.getCell(S, "N5").formula === "F5+$E$5" && a.getCell(S, "O5").formula === "G5+$E$5",
      "fill right shifts the column part of relative references");
    const oneLine = a.fillRange(S, { r1: 0, c1: 10, r2: 0, c2: 11 }, "down");
    test.assert(oneLine.status === "ok" && oneLine.cells.length === 0, "filling a one-row range down writes nothing (nothing to fill)");
  }

  /* ------------------------------------ 5. freeze panes: display state in file */
  {
    const { open } = session();
    const a = await open(BUDGET);
    test.assert(a.freeze(S) === null, "the fixture has no frozen panes");
    const set = a.setFreeze(S, 2, 1);
    test.assert(set.status === "ok" && a.freeze(S).r === 2 && a.freeze(S).c === 1, "setFreeze stores rows and columns");
    const saved = await a.save();
    const { open: reopen } = session();
    const b = await reopen(new Uint8Array(saved.bytes));
    test.assert(b.freeze(S) && b.freeze(S).r === 2 && b.freeze(S).c === 1, "frozen panes round-trip through save and reopen");
    b.setFreeze(S, 0, 0);
    test.assert(b.freeze(S) === null, "freezing zero rows and columns unfreezes");
    // A freeze is one undo step, like every structure change.
    test.assert(b.canUndo() && b.undoLabel() === "freeze", "unfreezing is the undoable step it caused");
  }

  /* ----------------------------------------- 6. sheets: insert, rename, delete */
  {
    const { open } = session();
    const a = await open(BUDGET);
    const wb = a.workbook();
    const before = a.sheets().length;
    a.insertSheet();
    test.assert(a.sheets().length === before + 1, "insertSheet adds one sheet (one undo step)");
    // The formula that watches the sheet lives on the sheet that STAYS.
    wb.sheetByName(S).rowObj(0).cells[5] = { f: "Sheet1!A1", v: 1 };
    const rename = a.renameSheet(S, "搬家预算");
    test.assert(rename.status === "ok" && a.getCell("搬家预算", "F1").formula === "Sheet1!A1", "renaming keeps formulas that name the other sheet");
    test.assert(a.renameSheet("Sheet1", "搬家预算").status === "blocked" && a.renameSheet("Sheet1", "a[b").status === "blocked" && a.renameSheet("Sheet1", "x".repeat(32)).status === "blocked",
      "renames are refused for a used name, bad characters and over-long names");
    a.renameSheet("Sheet1", "底稿");
    test.assert(a.getCell("搬家预算", "F1").formula === "底稿!A1", "renaming rewrites formulas that name the renamed sheet");
    const del = a.deleteSheet("底稿");
    test.assert(del.status === "ok" && !a.sheets().some((s) => s.name === "底稿"), "deleteSheet removes the sheet");
    test.assert(String(a.getCell("搬家预算", "F1").formula).indexOf("#REF!") >= 0, `formulas pointing at a deleted sheet become #REF! (${a.getCell("搬家预算", "F1").formula})`);
    a.undo();
    test.assert(a.sheets().some((s) => s.name === "底稿") && a.getCell("搬家预算", "F1").formula === "底稿!A1", "undoing a sheet delete restores sheet and formulas");
    const lastOne = a.deleteSheet("底稿");
    test.assert(lastOne.status === "ok", "deleting a sheet answers ok");
    while (a.sheets().length > 1) a.deleteSheet(a.sheets()[a.sheets().length - 1].name);
    test.assert(a.sheets().length === 1 && a.deleteSheet(a.sheets()[0].name).status === "blocked", "the workbook keeps at least one sheet");
  }

  /* ------------------------------- 7. staleness: honest 尚未重算, then recalc */
  {
    const { open } = session();
    const a = await open(BUDGET);
    a.insertRows(S, 1, 1);
    const stale = a.stale(S);
    test.assert(stale.includes("D3") && stale.includes("D13"), `moved formulas read as 尚未重算 until recalculation (${stale.slice(0, 4).join(",")})`);
    await a.ensureCalc();
    await a.recalc();
    test.assert(a.getCell(S, "D3").value === 1320 && a.stale(S).length === 0, "recalculation computes the shifted D3 (B3*C3 = 1320) and clears staleness");
    a.undo();
    await a.recalc();
    test.assert(a.getCell(S, "D2").value === 1320, "undo restores the original row and its recalculation");
  }

  /* ----------------------- 8. kept-as-is kinds reach the first-save loss list */
  {
    const { open } = session();
    const bytes = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/real-corpus/xlsx/X10.xlsx")));
    const a = await open(bytes, { name: "X10.xlsx" });
    test.assert(a.workbook().extra.pivots && a.workbook().extra.pivots.tables.length === 2, "the corpus pivot workbook reads its two pivot tables");
    const pivotSheet = a.workbook().sheets.find((sheet) => sheet.id === a.workbook().extra.pivots.tables[0].sheet).name;
    const survey = a.surveyLines(pivotSheet, "r", 1, 1);
    test.assert(survey.kept.some((k) => k.kind === "pivot-table" && k.count >= 1), `the pre-change survey names the pivot tables on ${pivotSheet} as kept-as-is (${JSON.stringify(survey.kept)})`);
    a.insertRows(a.sheets()[0].name, 1, 1);
    const report = await a.exportReport();
    test.assert(report.lost.some((item) => item.kind === "pivot-table" && item.count === 2), `the first-save list says the pivot tables did not follow (${report.lost.map((x) => x.kind).join(",")})`);
    const saved = await a.save();
    test.assert(saved.mode === "preserving-edit", "the workbook with pivots and a query table still saves");
  }

  /* ------------------- 9. no 500×26 cap: 10,000 rows open in a time-box, windowed */
  {
    const { open } = session();
    const a = await open(BUDGET);
    a.setCell(S, "A1", { value: 1 }); // one real edit: the save writes the model, not the original bytes
    const sh = a.workbook().sheets[0];
    for (let r = 0; r < 10000; r += 1) {
      sh.rowObj(r).cells[0] = { v: r + 1 };
      if (r % 25 === 0) sh.rowObj(r).cells[1] = { f: "A" + (r + 1) + "*2", dirty: true };
    }
    const big = await a.save();
    const { ctx, open: reopen } = session();
    loadScripts(ctx, ["app/features/clio-chart-workbook.js"]);
    const started = Date.now();
    const b = await reopen(new Uint8Array(big.bytes), { name: "big.xlsx" });
    const sessionApi = ctx.AISystem6ClioChartWorkbook.createSession(b, {});
    const ext = sessionApi.extent(S);
    const openMs = Date.now() - started;
    test.assert(ext.rows >= 10000, `a 10,000-row sheet reports its real extent, not a 500-row cap (${ext.rows} rows)`);
    test.assert(openMs < 4000, `opening the 10,000-row workbook is time-boxed (${openMs}ms)`);
    const rowWindow = ctx.AISystem6ClioChartWorkbook.rowWindow;
    const positions = [0, 120000, 240000];
    const counts = positions.map((scrollTop) => rowWindow(ext.rows, scrollTop, 400, 8, 24, 0).count);
    test.assert(counts.every((count) => count <= Math.ceil(400 / 24) + 16), `the DOM window stays bounded at top, middle and bottom (${counts.join(", ")} rows)`);
    const bottom = rowWindow(ext.rows, positions[2], 400, 8, 24, 0);
    test.assert(bottom.last === ext.rows - 1, "the window reaches the last row when scrolled to the bottom");
    const frozenWin = rowWindow(ext.rows, 0, 400, 8, 24, 3);
    test.assert(frozenWin.first === 3, "the window starts just below the frozen rows");
    const source = read("app/features/clio-chart-workbook.js");
    test.assert(source.includes("spacerRow(first - fr") && source.includes("rowWindow(ext.rows"), "the surface builds the grid through the window with spacer rows for the rest");
  }

  /* ------------------------------------- 10. the real corpus: edit and reopen */
  {
    const files = ["X01.xlsx", "X02.xlsx", "X03.xlsx", "X07.xlsx", "X09.xlsx", "X10.xlsx", "X11.xlsx", "X13.xlsx", "X14.xlsx", "X15.xlsx"];
    for (const file of files) {
      const bytes = new Uint8Array(readFileSync(resolveProjectPath(`tests/fixtures/real-corpus/xlsx/${file}`)));
      const { open } = session();
      let a;
      try { a = await open(bytes, { name: file }); } catch (error) {
        test.assert(false, `${file}: opens through the adapter (${error.message})`);
        continue;
      }
      // Find a cell at or below row 2 with content; the insert moves it down one row.
      let target = null;
      for (const sheet of a.sheets()) {
        for (const { row, col, cell } of a.listCells(sheet.name)) {
          if (row >= 2 && (cell.v != null || cell.f != null)) { target = { sheet: sheet.name, row, col, hasFormula: cell.f != null, value: cell.v }; break; }
        }
        if (target) break;
      }
      const sheetOfChange = target ? target.sheet : a.sheets()[0].name;
      const out = a.insertRows(sheetOfChange, 1, 1);
      if (out.status !== "ok") {
        test.assert(false, `${file}: insertRows answers ok (${out.status})`);
        continue;
      }
      const saved = await a.save();
      const { open: reopen } = session();
      let b;
      try { b = await reopen(new Uint8Array(saved.bytes), { name: file }); } catch (error) {
        test.assert(false, `${file}: the saved package reopens (${error.message})`);
        continue;
      }
      if (!target) {
        test.assert(b.sheets().length === a.sheets().length, `${file}: no movable content, the reopened workbook still has its sheets`);
        continue;
      }
      const colName = (c) => { let s = ""; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
      const movedRef = colName(target.col) + (target.row + 1);
      const moved = b.getCell(target.sheet, movedRef);
      if (target.hasFormula) {
        test.assert(typeof moved.formula === "string" && moved.formula.length > 0, `${file}: the formula below the inserted row moved down with it (now at ${movedRef})`);
      } else {
        test.assert(moved.value === target.value, `${file}: the value ${JSON.stringify(target.value)} moved one row down to ${movedRef}`);
      }
      const vacated = b.getCell(target.sheet, colName(target.col) + String(target.row));
      test.assert(!vacated.exists || vacated.value !== target.value || target.hasFormula, `${file}: the vacated row no longer holds the moved content`);
    }
  }

  test.finish();
};

run();
