// ClioWorks S11 M1, native host contract: how a workbook on the desk is opened into
// the ClioChart surface, saved, reverted, and kept from being lost at quit.
// The real native-binaries store, native-host and ledger-adapter run in a vm; the
// workbook surface, run receipts and desk globals are stubs, so the contract holds
// whatever the other lanes do with their own halves.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-s11-m1-host");
const FIXTURE = resolveProjectPath("tests/fixtures/clioworks-s11/budget-s11.xlsx");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function deskContext() {
  const ctx = makeContext();
  const log = { opened: [], status: [], receipts: [], finished: [], closed: 0, current: null };
  ctx.mountedTextDisk = {};
  ctx.btoa = btoa;
  ctx.atob = atob;
  ctx.openWindow = () => log.opened.push("window");
  ctx.setStatus = (text) => log.status.push(text);
  ctx.t = (key, ...args) => `${key}:${args.join(",")}`;
  ctx.ensureClioChartWorkbookModule = async () => true;
  ctx.AISystem6ClioChartWorkbook = {
    open: async (record, meta) => { log.opened.push({ record, meta }); log.current = { mountedName: meta.mountedName }; return { ok: true }; },
    current: () => log.current,
  };
  ctx.AISystem6RunReceipts = {
    createReceipt: async (input) => { log.receipts.push(input); return { ok: true, receiptId: `r${log.receipts.length}` }; },
    finishReceipt: async (id, outcome) => { log.finished.push({ id, outcome }); return { ok: true }; },
  };
  loadScripts(ctx, [
    "app/core/native-binaries.js",
    "app/vendor/clioworks-v3/ledger-adapter.js",
    "app/vendor/clioworks-v3/native-host.js",
  ]);
  ctx.__bytes = new Uint8Array(readFileSync(FIXTURE));
  vm.runInContext(
    "AISystem6NativeBinaries.register({ mountedName: 'budget.xlsx', fileName: 'budget.xlsx', format: 'xlsx', bytes: globalThis.__bytes, projectId: 'p1' })",
    ctx,
  );
  return { ctx, log, host: ctx.AISystem6ClioWorks, store: ctx.AISystem6NativeBinaries };
}

const run = async () => {
  // 1. Opening an xlsx mounts it in the workbook surface; the same workbook opened
  //    again only focuses (the live model, with its edits, is not re-parsed).
  {
    const { log, host, store } = deskContext();
    const first = await host.openNativeDocument({ mountedName: "budget.xlsx" });
    const record = store.recordFor("budget.xlsx");
    test.assert(first.ok && first.format === "xlsx", "openNativeDocument(xlsx) succeeds");
    const call = log.opened.find((entry) => entry.meta);
    test.assert(call && call.record === record && call.meta.mountedName === "budget.xlsx" && call.meta.fileName === "budget.xlsx",
      "the workbook surface is opened with the record, mountedName and fileName");
    test.assert(typeof record.liveAdapter?.isDirty === "function", "the record carries the real ledger adapter");
    test.assert(!log.opened.includes("window"), "the host no longer opens a blank chart window itself");
    test.assert(!log.status.some((text) => String(text).startsWith("clioworks_native_opened")), "no status line for an opened workbook; the surface's receipt replaces it");
    const adapter = record.liveAdapter;
    record.liveAdapter.setCell("预算", "B2", { value: 9 });
    await host.openNativeDocument({ mountedName: "budget.xlsx" });
    test.assert(log.opened.filter((entry) => entry.meta).length === 2, "a second open still goes to the surface, which focuses it");
    test.assert(record.liveAdapter === adapter && adapter.isDirty(), "a second open keeps the live model and its unsaved edit");

    const bare = deskContext();
    bare.ctx.AISystem6ClioChartWorkbook = undefined;
    const missing = await bare.host.openNativeDocument({ mountedName: "budget.xlsx" });
    test.assert(missing.ok === false && missing.reason === "unavailable", "without the workbook surface the open reports unavailable instead of throwing");
  }

  // 2. Save: untouched leaves no receipt; an edit writes the preserving bytes, marks the
  //    adapter saved, stores the bytes and leaves one edit receipt.
  {
    const { log, host, store } = deskContext();
    await host.openNativeDocument({ mountedName: "budget.xlsx" });
    const record = store.recordFor("budget.xlsx");
    let marked = 0;
    record.liveAdapter.markSaved = () => { marked += 1; };
    record.liveAdapter.exportReport = () => ({ converted: [{ sheet: "预算", ref: "D2", what: "x" }], lost: [] });

    const clean = await host.saveNativeDocument("budget.xlsx");
    test.assert(clean.ok && clean.mode === "original-bytes", "saving an untouched workbook returns the original bytes");
    test.assert(log.receipts.length === 0, "a save that changes nothing leaves no receipt");

    record.liveAdapter.setCell("预算", "B2", { value: 77 });
    const before = store.workingBytes("budget.xlsx");
    const saved = await host.saveNativeDocument("budget.xlsx");
    const after = store.workingBytes("budget.xlsx");
    test.assert(saved.ok && saved.mode === "preserving-edit", "an edited workbook saves through the preserving writer");
    test.assert(marked === 2 && saved.byteLength === after.byteLength, "the adapter is marked saved and the result reports the stored size");
    test.assert(saved.sha256 === sha(after) && sha(after) !== sha(before), "the stored bytes changed and the result carries their sha-256");
    test.assert(record.dirty === false, "the store record is not left dirty");
    test.assert(saved.report && saved.report.converted.length === 1 && Array.isArray(saved.report.lost), "the result carries the converted/lost report from the adapter");
    test.assert(log.receipts.length === 1 && log.receipts[0].intent === "edit" && log.receipts[0].inputObjectIds[0] === record.id, "one edit receipt is created for the file");
    test.assert(log.finished.length === 1 && log.finished[0].outcome.status === "completed", "and finished as completed");
  }

  // 2b. exportReport is async on the real adapter: the save awaits it, and a rejecting
  //     report never undoes a finished save.
  {
    const { host, store } = deskContext();
    await host.openNativeDocument({ mountedName: "budget.xlsx" });
    const record = store.recordFor("budget.xlsx");
    record.liveAdapter.setCell("预算", "B2", { value: 41 });
    record.liveAdapter.exportReport = async () => ({ converted: [], lost: [{ sheet: "预算", ref: "", what: "diagram" }] });
    const withLoss = await host.saveNativeDocument("budget.xlsx");
    test.assert(withLoss.ok && withLoss.report.lost.length === 1, "an async exportReport is awaited, so its losses reach the save result");
    record.liveAdapter.setCell("预算", "B2", { value: 42 });
    record.liveAdapter.exportReport = async () => { throw new Error("report broke"); };
    const broken = await host.saveNativeDocument("budget.xlsx");
    test.assert(broken.ok && broken.report.converted.length === 0 && broken.report.lost.length === 0 && !record.liveAdapter.isDirty(), "a rejecting exportReport leaves an empty report and the save stands");
  }

  // 3. A failing encoder is a result, not an exception, and leaves everything as it was.
  {
    const { log, host, store } = deskContext();
    await host.openNativeDocument({ mountedName: "budget.xlsx" });
    const record = store.recordFor("budget.xlsx");
    let marked = 0;
    record.liveAdapter.markSaved = () => { marked += 1; };
    record.liveAdapter.setCell("预算", "B2", { value: 5 });
    record.liveAdapter.save = async () => { throw new Error("boom"); };
    const before = sha(store.workingBytes("budget.xlsx"));
    let result;
    let threw = false;
    try { result = await host.saveNativeDocument("budget.xlsx"); } catch { threw = true; }
    test.assert(!threw && result.ok === false && result.reason === "encode-failed" && result.message === "boom", "an encoder failure returns encode-failed with its message");
    test.assert(marked === 0 && sha(store.workingBytes("budget.xlsx")) === before && record.liveAdapter.isDirty(), "a failed save marks nothing saved and keeps the stored bytes and the edit");
    test.assert(log.finished.length === 1 && log.finished[0].outcome.status === "failed", "the failed save is recorded as a failed receipt");
  }

  // 4. Revert swaps in a fresh adapter parsed from the last stored bytes.
  {
    const { host, store } = deskContext();
    await host.openNativeDocument({ mountedName: "budget.xlsx" });
    const record = store.recordFor("budget.xlsx");
    const old = record.liveAdapter;
    const original = old.getCell("预算", "B2").value;
    old.setCell("预算", "B2", { value: 123456 });
    const reverted = await host.revertNativeDocument("budget.xlsx");
    test.assert(reverted.ok && reverted.adapter === record.liveAdapter && reverted.adapter !== old, "revert returns the new adapter and puts it on the record");
    test.assert(!reverted.adapter.isDirty() && reverted.adapter.getCell("预算", "B2").value === original, "the reverted model has the last stored content and is clean");
    test.assert((await host.revertNativeDocument("nope.xlsx")).ok === false, "reverting something that is not native is refused");
  }

  // 5. Quit asks once for a workbook with unsaved edits and honours Cancel.
  {
    const source = read("app/core/window-manager.js");
    const start = source.indexOf("async function quitApp(");
    const end = source.indexOf("\n}\n", start) + 2;
    test.assert(start > 0 && end > start, "quitApp is found in window-manager.js");
    const build = (workbook) => {
      const calls = { modal: 0, switched: 0 };
      const ctx = vm.createContext({
        nonQuittableAppIds: new Set(),
        showSystemModal: async () => { calls.modal += 1; return "cancel"; },
        windowsForApp: () => [],
        runningApps: new Map(), hiddenAppIds: new Set(),
        activeAppId: "clioChart",
        updateQuickDraftFocusChrome() {}, scheduleWorkingSessionSave() {},
        forgetWindowFromRunningApps() {},
        switchToApp: () => { calls.switched += 1; },
        setStatus() {}, t: (k) => k, multiFinderAppLabels: {},
        window: { AISystem6ClioChartWorkbook: workbook },
      });
      vm.runInContext(`${source.slice(start, end)}; globalThis.quit = quitApp;`, ctx);
      return { ctx, calls };
    };
    const mk = (hasUnsaved, answer) => {
      const w = { closed: 0, hasUnsaved: () => hasUnsaved, current: () => ({ mountedName: "a.xlsx" }), close: async () => { w.closed += 1; return answer; } };
      return w;
    };
    for (const [label, wb, expectClosed, expectQuit] of [
      ["unsaved + cancelled", mk(true, "cancelled"), 1, false],
      ["unsaved + discarded", mk(true, "discarded"), 1, true],
      ["unsaved + saved", mk(true, "saved"), 1, true],
      ["clean", mk(false, "clean"), 1, true],
    ]) {
      const { ctx, calls } = build(wb);
      await ctx.quit("clioChart");
      test.assert(wb.closed === expectClosed, `quit ${label}: the workbook is closed ${expectClosed} time(s) (a clean one unmounts too)`);
      test.assert((calls.switched > 0) === expectQuit, `quit ${label}: ${expectQuit ? "the app quits" : "the quit is aborted"}`);
      test.assert(calls.modal === 0, `quit ${label}: no second prompt is stacked on the workbook's own`);
    }
  }
};

run().then(() => test.finish()).catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
