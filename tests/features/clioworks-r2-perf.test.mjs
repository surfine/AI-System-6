// ClioWorks R2 contract: the large-file timing ceiling. Runs the desk's own XLSX adapter
// (apps/desktop/app/vendor/clioworks-v3/ledger-adapter.js, loaded through the S11
// vm-context the way tooling/clioworks-r1-corpus.mjs loads it) on
// dist/fixtures/large-office/sheet-10k.xlsx — 10,000 rows × 12 columns, shared
// strings, one SUM formula per row — and holds open, first edit (R1's locate + minimal
// flip) and save under generous absolute ceilings. The floors for these ceilings are the
// medians measured when this landed (2026-10-24, Apple M-series, node v24: open ≈ 0.6 s,
// edit ≈ 0.45 s, save ≈ 1.1 s) times four; they are rounded up further because the same
// machine under heavy CPU contention (load average 242, other sessions compiling)
// measured open up to 2.9 s — about 4.6× the calm median. At these ceilings a real
// regression still has to cost 6–8×, and the machine-relative 2× smoke alarm in
// tooling/clioworks-r2-perf.mjs (against tests/fixtures/large-office/baseline.json)
// catches anything in between on a calm machine.
// The fixture is git-ignored and regenerated when missing; if it cannot be produced the
// contract skips (not fails).
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";
import { OUT_DIR, SHEET_NAME, generateSheet } from "../../tooling/clioworks-r2-generate.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-r2-perf");

const OPEN_CEILING_MS = 4000;
const EDIT_CEILING_MS = 3000;
const SAVE_CEILING_MS = 8000;

const flip = (text) => { const first = [...text][0]; return (first === "◆" ? "◇" : "◆") + text.slice(first.length); };
const colName = (c) => { let s = ""; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// The adapter itself, loaded fresh, is what this contract times: it must come up and
// expose open() before any fixture exists (same fresh-VM check the R1 contract makes).
{
  const ctx = makeContext();
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js"]);
  test.assert(vm.runInContext(`typeof ClioWorksLedgerAdapter?.open`, ctx) === "function", "ledger-adapter.js loads in a fresh VM and exposes ClioWorksLedgerAdapter.open");
}

// Produce the fixture, or skip with a clear message: the big files are machine-local.
const sheetPath = join(OUT_DIR, SHEET_NAME);
if (!existsSync(sheetPath)) {
  try { generateSheet(); } catch (e) { /* the skip below says why */ }
}

if (!existsSync(sheetPath)) {
  test.ok(`skipped: ${SHEET_NAME} could not be produced; run node tooling/clioworks-r2-generate.mjs and re-run this contract`);
  test.finish();
} else {
  const bytes = new Uint8Array(readFileSync(sheetPath));

  const ctx = makeContext();
  ctx.__bytes = bytes;
  ctx.__name = SHEET_NAME;
  loadScripts(ctx, ["app/vendor/clioworks-v3/ledger-adapter.js"]);

  const t0 = performance.now();
  const adapter = await vm.runInContext("ClioWorksLedgerAdapter.open(globalThis.__bytes, { name: globalThis.__name })", ctx);
  const openMs = performance.now() - t0;
  test.assert(adapter && typeof adapter.listCells === "function", `the adapter opened the 10,000-row sheet (${Math.round(openMs)} ms)`);

  // R1's minimal edit: the first non-formula string cell, wherever the scan finds it.
  const t1 = performance.now();
  let edited = null;
  outer: for (const sheet of adapter.sheets()) {
    for (const { row, col, cell } of adapter.listCells(sheet.id)) {
      if (typeof cell.v === "string" && cell.v && !cell.f) {
        edited = adapter.setCell(sheet.id, colName(col) + row, { value: flip(cell.v) });
        break outer;
      }
    }
  }
  const editMs = performance.now() - t1;
  test.assert(edited && !(edited.status === "blocked" || edited.blocked), `the first text cell accepted the minimal edit (${Math.round(editMs)} ms)`);

  const t2 = performance.now();
  const saved = await adapter.save();
  const saveMs = performance.now() - t2;
  test.assert(new Uint8Array(saved.bytes).byteLength > 0, `the edited 10,000-row sheet saved (${Math.round(saveMs)} ms, ${saved.mode})`);

  test.assert(openMs <= OPEN_CEILING_MS, `open ${Math.round(openMs)} ms is within the ${OPEN_CEILING_MS} ms ceiling (derived from the 2026-10 measured medians)`);
  test.assert(editMs <= EDIT_CEILING_MS, `first edit ${Math.round(editMs)} ms is within the ${EDIT_CEILING_MS} ms ceiling`);
  test.assert(saveMs <= SAVE_CEILING_MS, `save ${Math.round(saveMs)} ms is within the ${SAVE_CEILING_MS} ms ceiling`);

  test.finish();
}