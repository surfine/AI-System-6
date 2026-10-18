// ClioWorks S11 M1 contract: the ClioChart workbook surface (interface convention B)
// over the frozen budget-s11.xlsx fixture, read through the REAL ledger-adapter and
// vendored codec. The surface's other-lane dependencies are stubbed here and
// feature-detected in the product code: the adapter's M1 additions (isDirty /
// markSaved, stale, recalc, undo, exportReport — lane L2), the native host's save
// and revert (lane L5). The controller verifies the real pairing after merging.
//
// What it holds (sign-off §12 defects included as rules):
//   Express refuses formulas with a receipt and never a change; mode never touches
//   the document; dirty has one source (the adapter); an edited formula says
//   「尚未重算」 until recalc — loaded on the FIRST formula edit — answers; re-entering
//   the same formula is not an edit; ⌘S claims the save before encoding, a second
//   ⌘S while saving or while the first-save question is open is refused; the
//   first-save list appears only when something is converted or lost (Q2), once
//   per session unless more would be lost (S11-13), and defaults to Cancel; edits
//   made during a save stay dirty; Edit › Undo is the adapter's own history with
//   human step names, reached through ClioChart's existing Edit-menu getter.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath, parseJsSource, forEachAstChild } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-s11-m1-workbook-surface");
const fixture = new Uint8Array(readFileSync(resolveProjectPath("tests/fixtures/clioworks-s11/budget-s11.xlsx")));
const SHEET = "预算";

// The lane-L2 API on top of the real adapter, kept deliberately small: a revision
// with a saved mark, a per-cell undo journal, stale = formula cells set and not yet
// recalculated, recalc that "computes" by writing 42 and loads calc on first use.
function withM1Api(led, { report } = {}) {
  let revision = 0;
  let saved = 0;
  let loaded = false;
  const past = [];
  const future = [];
  const stale = new Set();
  const calls = { recalc: [], setCell: [] };
  const raw = (sheet, ref) => { const c = led.getCell(sheet, ref); return c.exists ? { value: c.value ?? null, formula: c.formula } : { value: null, formula: null }; };
  const apply = (entry, side) => {
    led.setCell(entry.sheet, entry.ref, { value: entry[side].value, formula: entry[side].formula });
    if (entry[side].formula != null) stale.add(`${entry.sheet}!${entry.ref}`); else stale.delete(`${entry.sheet}!${entry.ref}`);
    revision += 1;
  };
  return Object.assign(Object.create(led), {
    calls,
    setCell(sheet, ref, patch) {
      calls.setCell.push({ sheet, ref, patch });
      const before = raw(sheet, ref);
      const out = led.setCell(sheet, ref, patch);
      // The real model stales the cells that read the edited one (calc not needed for that).
      for (const name of led.sheets().map((x) => x.name)) for (const dep of led.stale(name)) stale.add(`${name}!${dep}`);
      past.push({ sheet, ref, label: patch.label || "cell", before, after: raw(sheet, ref) });
      future.length = 0;
      if (patch.formula != null) stale.add(`${sheet}!${ref}`); else stale.delete(`${sheet}!${ref}`);
      revision += 1;
      return { ...out, revision };
    },
    isDirty: () => revision !== saved,
    // The encoded revision, not "now": edits typed while the save ran stay dirty.
    markSaved: (rev = revision) => { saved = rev; },
    getEditRevision: () => revision,
    stale: (sheet) => [...stale].filter((k) => k.startsWith(sheet + "!")).map((k) => k.slice(sheet.length + 1)),
    calcLoaded: () => loaded,
    async recalc(changes) {
      calls.recalc.push(changes);
      loaded = true;
      await Promise.resolve();
      for (const key of [...stale]) {
        const [sheet, ref] = key.split("!");
        const cell = led.workbook().sheets.find((s) => s.name === sheet);
        led.setCell(sheet, ref, { value: 42 });
        stale.delete(key);
        void cell;
      }
      return { updated: changes };
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undoLabel: () => past.at(-1)?.label || "",
    redoLabel: () => future.at(-1)?.label || "",
    undo() { const e = past.pop(); if (!e) return { changed: [] }; apply(e, "before"); future.push(e); return { changed: [{ sheet: e.sheet, ref: e.ref }] }; },
    redo() { const e = future.pop(); if (!e) return { changed: [] }; apply(e, "after"); past.push(e); return { changed: [{ sheet: e.sheet, ref: e.ref }] }; },
    exportReport: () => (typeof report === "function" ? report() : report || { converted: [], lost: [] }),
  });
}

async function openSurface({ report, host, adapterOnly = false } = {}) {
  const ctx = makeContext();
  ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/features/clio-chart-workbook.js"]);
  ctx.__bytes = fixture;
  const led = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: 'budget-s11.xlsx' })", ctx);
  // adapterOnly: an adapter from before the M1 API (the feature-detect path), so the
  // M1 methods the real ledger-adapter now has are taken away explicitly.
  const M1_API = ["stale", "recalc", "ensureCalc", "calcLoaded", "undo", "redo", "canUndo", "canRedo", "undoLabel", "redoLabel", "markSaved", "exportReport", "comments", "addComment", "replyComment", "displayText"];
  const adapter = adapterOnly ? Object.assign({}, led, Object.fromEntries(M1_API.map((k) => [k, undefined]))) : withM1Api(led, { report });
  const lists = [];
  const alerts = [];
  const hooks = { answer: null };
  const session = ctx.AISystem6ClioChartWorkbook.createSession(adapter, {
    fileName: "budget-s11.xlsx",
    mountedName: "budget-s11.xlsx",
    host: host === undefined ? { save: async () => { adapter.markSaved?.(); return { ok: true, mode: "preserving-edit", byteLength: 1 }; } } : host,
    confirmList: (r) => { lists.push(r); return hooks.answer ? hooks.answer(r) : "cancel"; },
    alertFailure: (r) => { alerts.push(r); },
  });
  return { ctx, led, adapter, session, lists, alerts, hooks };
}

const run = async () => {
  // 1. Express is the landing mode; the five cell states come from the real model.
  {
    const { session } = await openSurface();
    const v = (ref) => session.view(SHEET, ref);
    test.assert(session.mode === "express" && session.sheet === SHEET && !session.isDirty(), "a workbook opens in Express on its first visible sheet, not dirty");
    test.assert(v("C9").state === "empty" && v("B10").state === "zero" && v("B10").text === "0", "an empty cell and the number zero are told apart");
    test.assert(v("B9").state === "text" && v("B9").text === "未测", "a text cell keeps its words (未测 is not zero)");
    test.assert(v("D9").state === "error" && v("D9").text === "#VALUE!", "a cached formula error shows its code");
    test.assert(v("D2").state === "formula" && v("D2").text === "¥1,320" && v("D2").raw === "=B2*C2", "a formula result shows through its number format, its formula stays the raw content");
    test.assert(v("D2").label.startsWith("clio_chart_workbook_cell_aria:D2|clio_chart_workbook_state_formula"), "every cell carries a spoken label naming its state");
  }

  // 2. Express: refusals are receipts, never changes; values edit; dirty is the adapter's.
  {
    const { session, adapter } = await openSurface();
    const formulaCell = session.commitCell("D8", "999");
    test.assert(formulaCell.status === "blocked" && session.receipt.key === "clio_chart_workbook_receipt_formula_cell" && session.receipt.kind === "blocked",
      "Express answers a formula cell with a receipt that says why");
    const typedFormula = session.commitCell("B2", "=1+1");
    test.assert(typedFormula.status === "blocked" && session.receipt.key === "clio_chart_workbook_receipt_express_value_only", "Express refuses a typed formula in a value cell");
    test.assert(adapter.calls.setCell.length === 0 && !session.isDirty(), "a refusal changes nothing");
    session.select(1, 1);
    test.assert(session.receipt.kind === "idle", "moving on drops the refusal back to the resting receipt");

    const ok = session.commitCell("B2", "250");
    test.assert(ok.status === "ok" && session.isDirty() && session.receipt.key === "clio_chart_workbook_receipt_dirty", "a value edit marks the document dirty through the adapter");
    test.assert(adapter.calls.setCell[0].patch.label === "clio_chart_workbook_step_cell", "the edit is one named codec transaction");
    // Q-M1-1: B2 feeds D2 / D12 / G2; the edit makes them 「尚未重算」, so it asks for the recalculation (which loads calc).
    test.assert(adapter.calls.recalc.length === 1 && !!ok.recalc, "Express: a value that feeds formulas asks for the recalculation, so calc loads on the first value edit");
    test.assert(session.view(SHEET, "D2").state === "stale", "while calc is still loading the dependent says 「尚未重算」, not the old number");
    await session.lastRecalc();
    test.assert(session.view(SHEET, "D2").state !== "stale" && session.staleRefs(SHEET).size === 0, "and the dependents are computed once the recalculation answers");
    const calcBefore = adapter.calls.recalc.length;
    test.assert(session.commitCell("B2", "250").code === "UNCHANGED" && adapter.calls.setCell.length === 1 && adapter.calls.recalc.length === calcBefore, "typing the same value again is not an edit");

    const before = { rev: session.revision(), dirty: session.isDirty(), sel: JSON.stringify(session.selection()) };
    session.toggleMode();
    test.assert(session.mode === "full" && session.revision() === before.rev && session.isDirty() === before.dirty && JSON.stringify(session.selection()) === before.sel,
      "switching mode never saves, never clears dirty, never moves the selection");
  }

  // 2b. An edit nothing depends on stales nothing and loads nothing.
  {
    const { session, adapter } = await openSurface();
    const lone = session.commitCell("K30", "note");
    test.assert(lone.status === "ok" && lone.recalc === null && adapter.calls.recalc.length === 0, "a value no formula reads does not load the calculator");
  }

  // 3. Full mode: formulas, 「尚未重算」 until recalc, calc loaded on the first formula edit.
  {
    const { session, adapter } = await openSurface();
    session.setMode("full");
    const same = session.commitCell("D3", "=B3*C3");
    test.assert(same.code === "UNCHANGED" && !session.isDirty() && session.view(SHEET, "D3").state === "formula", "re-entering the same formula keeps the cached result and the clean state");
    const bad = session.commitCell("D4", "=SUM(");
    test.assert(bad.status === "blocked" && session.receipt.key === "clio_chart_workbook_receipt_formula_syntax" && !session.isDirty(), "a formula that does not parse is refused with a reason");
    const edit = session.commitCell("D3", "=B3*C3*2");
    test.assert(edit.status === "ok" && adapter.calls.setCell.at(-1).patch.label === "clio_chart_workbook_step_formula", "a formula edit is its own named step");
    test.assert(session.view(SHEET, "D3").state === "stale" && session.view(SHEET, "D3").text === "clio_chart_workbook_state_stale", "an edited formula says 「尚未重算」 — never the old number, never 0");
    test.assert(adapter.calls.recalc.length === 1 && edit.recalc, "the first formula edit asks the adapter to recalculate (calc loads lazily there)");
    await session.lastRecalc();
    test.assert(session.view(SHEET, "D3").state === "formula" && session.view(SHEET, "D3").text !== "clio_chart_workbook_state_stale", "after recalculation the cell shows a computed value");
    session.commitCell("B4", "7");
    test.assert(adapter.calls.recalc.length === 2, "once the calculator is loaded, a value edit recalculates too");
    await session.lastRecalc();
  }

  // 4. Without the adapter's stale(), an edited formula is still not shown with a stale cache.
  {
    const { session } = await openSurface({ adapterOnly: true, host: null });
    session.setMode("full");
    session.commitCell("D3", "=B3*C3*3");
    test.assert(session.view(SHEET, "D3").state === "stale", "an adapter without stale(): the formula the writer set still reads 「尚未重算」");
    test.assert(session.editHistory.undo() === false && session.editHistory.undoLabel() === "", "an adapter without undo: Edit › Undo answers nothing instead of throwing");
    const saved = await session.save();
    test.assert(saved.status === "failed" && saved.reason === "unavailable" && session.receipt.key === "clio_chart_workbook_receipt_unavailable", "no native host save: the receipt says so; nothing pretends to save");
    test.assert(session.commands().every((c) => c.id !== "file.revert" && c.id !== "comments.open"), "commands that are not wired (revert, comments) are not listed");
  }

  // 4b. Integrated: the real ledger-adapter carries the M1 undo bridge, so Edit › Undo
  // really undoes the edit and names the step in words.
  {
    const ctx = makeContext();
    ctx.t = (key, ...args) => (args.length ? `${key}:${args.join("|")}` : key);
    loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js", "app/features/clio-chart-workbook.js"]);
    ctx.__bytes = fixture;
    const real = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: 'budget-s11.xlsx' })", ctx);
    test.assert(typeof real.undo === "function", "the real ledger-adapter exposes the M1 undo bridge");
    if (typeof real.undo === "function") {
      const session = ctx.AISystem6ClioChartWorkbook.createSession(real, { fileName: "budget-s11.xlsx", mountedName: "budget-s11.xlsx", host: null, confirmList: () => "cancel", alertFailure: () => {} });
      session.setMode("full");
      const before = session.view(SHEET, "B2").raw;
      session.commitCell("B2", "999");
      test.assert(session.editHistory.canUndo() && /^clio_chart_workbook_step_/.test(session.editHistory.undoLabel()), `with the real adapter Edit › Undo is available and names the step (${session.editHistory.undoLabel()})`);
      session.editHistory.undo();
      test.assert(session.view(SHEET, "B2").raw === before, "with the real adapter Edit › Undo restores the cell");
    }
  }

  // 5. ⌘S: nothing to save; one candidate at a time; edits during the save stay dirty.
  {
    let release;
    const saves = [];
    const host = {};
    const { session, adapter } = await openSurface({ host });
    host.save = (name) => { saves.push(name); const encoded = adapter.getEditRevision(); return new Promise((resolve) => { release = () => { adapter.markSaved(encoded); resolve({ ok: true, mode: "preserving-edit", byteLength: 10 }); }; }); };
    const clean = await session.save();
    test.assert(clean.status === "clean" && saves.length === 0 && session.receipt.key === "clio_chart_workbook_receipt_nothing", "a clean workbook is not saved; the receipt says there is nothing to save");
    session.commitCell("B2", "300");
    const first = session.save();
    test.assert(session.saving && session.receipt.key === "clio_chart_workbook_receipt_saving", "the save is claimed and announced before encoding");
    const second = await session.save();
    test.assert(second.status === "blocked" && second.code === "SAVE_IN_FLIGHT", "a second ⌘S while saving is refused (one candidate, S11-20)");
    await Promise.resolve();
    test.assert(saves.length === 1 && saves[0] === "budget-s11.xlsx", "the native host is asked once, by mounted name");
    session.commitCell("B3", "11");
    test.assert(session.saving && session.receipt.kind === "saving" && session.receipt.key === "clio_chart_workbook_receipt_saving", "typing while saving keeps 「存储中，仍可输入」 on screen until the save answers");
    release();
    const done = await first;
    test.assert(done.status === "ok", "the save completes");
    test.assert(session.receipt.key === "clio_chart_workbook_receipt_saved_older" && session.isDirty(), "typing during the save keeps the newer edit dirty and says so");
  }

  // 6. Saved receipt; Q2: no list when nothing is converted or lost.
  {
    const { session, lists } = await openSurface();
    session.commitCell("B2", "260");
    const out = await session.save();
    test.assert(out.status === "ok" && lists.length === 0, "nothing converted or lost: no first-save list (Q2)");
    test.assert(session.receipt.key === "clio_chart_workbook_receipt_saved" && session.receipt.args[0] === "budget-s11.xlsx" && !session.isDirty(), "the receipt names the file and dirty clears");
  }

  // 7. The first-save list: shown when something is lost, default Cancel, never stacked, once per session.
  {
    let lost = [{ sheet: SHEET, ref: "A1", what: "SmartArt 图形" }];
    const saves = [];
    const host = {};
    const { session, lists, hooks, adapter } = await openSurface({ report: () => ({ converted: [], lost }), host });
    host.save = async () => { saves.push(1); adapter.markSaved(); return { ok: true }; };
    session.commitCell("B2", "270");
    const cancelled = await session.save();
    test.assert(lists.length === 1 && lists[0].lost[0].what === "SmartArt 图形", "something lost: the list is shown with plain object names");
    test.assert(cancelled.status === "cancelled" && saves.length === 0 && session.isDirty() && session.receipt.key === "clio_chart_workbook_receipt_not_saved",
      "Cancel (the default) writes nothing and keeps the edits");

    let answer;
    hooks.answer = () => new Promise((resolve) => { answer = resolve; });
    const pending = session.save();
    await new Promise((resolve) => setTimeout(resolve, 0)); // the report is awaited now
    test.assert(session.confirming, "the question is open");
    const stacked = await session.save();
    test.assert(stacked.status === "blocked" && stacked.code === "CONFIRM_OPEN" && lists.length === 2, "⌘S while the question is open does not stack a second one");
    answer("save");
    const stored = await pending;
    test.assert(stored.status === "ok" && saves.length === 1, "answering Save stores");

    hooks.answer = () => "save";
    session.commitCell("B2", "271");
    await session.save();
    test.assert(lists.length === 2 && saves.length === 2, "the same losses are not asked about again in this session (S11-13)");
    lost = [...lost, { sheet: SHEET, ref: "B1", what: "图表" }];
    session.commitCell("B2", "272");
    await session.save();
    test.assert(lists.length === 3, "a save that would now lose more asks again");
  }

  // 8. A failed save: the edits stay, the alert is raised, the save can be tried again.
  {
    const { session, alerts } = await openSurface({ host: { save: async () => { throw new Error("disk full"); } } });
    session.commitCell("B2", "280");
    const out = await session.save();
    test.assert(out.status === "failed" && alerts.length === 1 && session.isDirty() && !session.saving && session.receipt.key === "clio_chart_workbook_receipt_failed",
      "a thrown encode is a failure with an alert; the document stays dirty and open");
  }

  // 9. Edit › Undo is the adapter's history, named for people.
  {
    const { session } = await openSurface();
    session.commitCell("B2", "290");
    const history = session.editHistory;
    test.assert(history.canUndo() && history.undoLabel() === "clio_chart_workbook_step_cell", "Undo names the step (「撤销单元格编辑」)");
    test.assert(history.undo() === true && session.view(SHEET, "B2").raw !== "290" && history.canRedo() && history.redoLabel() === "clio_chart_workbook_step_cell", "Undo takes the edit back through the codec");
    test.assert(history.redo() === true && session.view(SHEET, "B2").raw === "290", "Redo puts it back");
  }

  // 10. Revert: the host swaps the adapter; the session reads the new one.
  {
    const ctxRecord = {};
    const host = {};
    const opened = await openSurface({ host });
    const { session, ctx } = opened;
    ctx.__bytes2 = fixture;
    const fresh = withM1Api(await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes2, { name: 'budget-s11.xlsx' })", ctx));
    host.save = async () => ({ ok: true });
    host.revert = async () => { ctxRecord.liveAdapter = fresh; return { ok: true, adapter: fresh }; };
    test.assert(session.commands().some((c) => c.id === "file.revert" && !c.state.enabled), "with the host's revert wired, 「复原到上次存储…」 is listed and greyed while clean");
    session.commitCell("B2", "295");
    const out = await session.revert();
    test.assert(out.status === "ok" && session.adapter === fresh && session.view(SHEET, "B2").raw !== "295" && !session.isDirty(), "revert reads the last saved workbook and leaves nothing dirty");
    test.assert(session.receipt.key === "clio_chart_workbook_receipt_reverted", "the receipt says it reverted");
  }

  // 11. ClioChart's existing Edit-menu getter hands Edit › Undo to a mounted workbook.
  {
    const source = read("app/features/clio-chart.js");
    let getterSource = null;
    const visit = (node) => {
      if (node.type === "CallExpression" && node.callee.name === "registerEditHistory" && node.arguments[0]?.value === "clioChart") {
        getterSource = source.slice(node.arguments[1].start, node.arguments[1].end);
      }
      forEachAstChild(node, visit);
    };
    visit(parseJsSource(source));
    test.assert(!!getterSource, "clio-chart.js registers one Edit-menu getter for the clioChart window");
    const bridge = { name: "workbook" };
    const table = {};
    const make = (workbook) => vm.runInNewContext(`(${getterSource})`, {
      window: { AISystem6ClioChartWorkbook: workbook, AISystem6ClioDiagram: { name: "diagram" } },
      clioChartState: { mode: "data", table, history: {} },
      undoClioChart() {}, redoClioChart() {},
    });
    test.assert(make({ current: () => ({ mountedName: "a.xlsx" }), editHistory: () => bridge })() === bridge, "while a workbook is mounted, Edit › Undo is the workbook's");
    const chartAnswer = make({ current: () => null, editHistory: () => bridge })();
    test.assert(chartAnswer && chartAnswer !== bridge && typeof chartAnswer.undo === "function", "with no workbook mounted, the chart's own history answers as before");
    test.assert(make(undefined)() !== bridge, "before the workbook module ever loads, the chart's own history answers");
  }

  // 10b. Leaving a cell without changing it is not an edit: "007" stays text, a text cell
  // keeps its words, an error cell is not re-typed (Enter, blur and the check mark all end here).
  {
    const { session, adapter } = await openSurface();
    adapter.setCell(SHEET, "E2", { value: "007" });
    const baseline = adapter.calls.setCell.length;
    const same = session.commitCell("E2", session.view(SHEET, "E2").raw);
    test.assert(same.code === "UNCHANGED" && adapter.calls.setCell.length === baseline && adapter.getCell(SHEET, "E2").value === "007",
      "committing the unchanged text \"007\" leaves it text (not the number 7) and writes nothing");
    const words = session.commitCell("B9", session.view(SHEET, "B9").raw);
    test.assert(words.code === "UNCHANGED" && adapter.calls.setCell.length === baseline, "a text cell committed as shown is not an edit");
    const typed = session.commitCell("E2", "7");
    test.assert(typed.status === "ok" && adapter.getCell(SHEET, "E2").value === 7, "typing a different value still edits");
  }

  // 10c. While a revert is in flight nothing else writes or saves behind it.
  {
    const host = {};
    const opened = await openSurface({ host });
    const { session, ctx } = opened;
    let release;
    ctx.__bytes2 = fixture;
    const fresh = withM1Api(await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes2, { name: 'budget-s11.xlsx' })", ctx));
    host.save = async () => ({ ok: true });
    host.revert = () => new Promise((resolve) => { release = () => resolve({ ok: true, adapter: fresh }); });
    session.commitCell("B2", "301");
    const pending = session.revert();
    test.assert(session.commandState("file.save").enabled === false && session.commandState("file.revert").enabled === false, "while reverting, save and revert are greyed");
    test.assert((await session.save()).code === "REVERTING", "a ⌘S during the revert is refused, not written over the old bytes");
    test.assert(session.commitCell("B3", "5").code === "REVERTING", "an edit during the revert is refused");
    release();
    const out = await pending;
    test.assert(out.status === "ok" && session.commandState("file.save").reason !== "" && session.commitCell("B3", "5").status === "ok", "after the revert the session works again on the new adapter");
  }

  // 10d. The conversion/loss report is awaited: the real adapter's exportReport is async.
  {
    const lost = [{ sheet: SHEET, ref: "B2", what: "chart" }];
    const { session, lists } = await openSurface({ report: async () => ({ converted: [], lost }) });
    session.commitCell("B2", "301");
    await session.save();
    test.assert(lists.length === 1 && lists[0].lost.length === 1, "an async exportReport still produces the first-save list");
  }

  // 10e. Source-level rules of the mounted surface and the document-level key handler.
  {
    const source = read("app/features/clio-chart-workbook.js");
    test.assert(/has-system-modal/.test(source.slice(source.indexOf("addEventListener('keydown', (event) => {\n      if (!active"))), "the document-level ⌘S/⌘E/⌘M handler stands down while a system dialog is open");
    test.assert(!/event\.ctrlKey\)\s*\|\|\s*event\.altKey/.test(source) && /function commandKey/.test(source), "keys go through commandKey: macOS takes ⌘ only, not Ctrl");
    const closeBody = source.slice(source.indexOf("async function closeWorkbook"), source.indexOf("/* ------------------------------------------------- the desk's menu bar"));
    test.assert(closeBody.indexOf("commitPending()") > -1 && closeBody.indexOf("commitPending()") < closeBody.indexOf("isDirty()"), "closing commits typed input before judging clean or dirty");
    const toggle = source.slice(source.indexOf("function toggleMode()"), source.indexOf("async function runRevert"));
    test.assert(/if \(!commitPending\(\)\) return;/.test(toggle), "a refused pending entry stops the mode switch and keeps its reason");
    const comments = source.slice(source.indexOf("function openComments()"), source.indexOf("function refreshComments"));
    test.assert(!/comments\.close\(\)/.test(comments), "⌘M with the panel open does not close it (the unsent draft survives)");
  }

  // 12. Every string the surface speaks exists in both languages.
  {
    const used = [...new Set(read("app/features/clio-chart-workbook.js").match(/clio_chart_workbook_[a-z_]+[a-z]/g))].filter((k) => k !== "clio_chart_workbook_step");
    for (const lang of ["en", "zh"]) {
      const ctx = { window: {} };
      vm.runInNewContext(read(`app/data/translations-${lang}.js`), ctx);
      const table = Object.values(ctx.window)[0];
      const missing = used.filter((k) => table[k] == null);
      test.assert(missing.length === 0, `${lang}: every workbook string is translated (${used.length} keys)${missing.length ? ` — missing ${missing.join(", ")}` : ""}`);
      const shown = used.map((k) => (typeof table[k] === "function" ? table[k]("x", "y", "z") : table[k])).join("\n");
      test.assert(!/ClioWorks/.test(shown), `${lang}: no 「ClioWorks」 on screen`);
    }
  }

  test.finish();
};

run().catch((error) => { console.error(error); process.exitCode = 1; });
