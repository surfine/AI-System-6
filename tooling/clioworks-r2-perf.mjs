// ClioWorks R2: the large-file performance smoke alarm. Measures, in Node, how long the
// desk's own Office adapters take on BIG files — the 10,000-row sheet, the ~200-page
// document, the 80-slide deck from tests/fixtures/large-office/ — so later work cannot
// make them slower unnoticed. The loading path is exactly the R1 corpus harness
// (tooling/clioworks-r1-corpus.mjs): one VM session per app via
// tests/fixtures/clioworks-s11/vm-context.mjs, then adapter.open(bytes, meta).
//
// For each fixture, after one warm-up pass, three timed passes of the R1 round trip:
//   open   adapter.open() on the original bytes
//   edit   R1's minimal edit: locate the first editable target (the same scan R1's plan
//          does) and flip its first character ◆/◇
//   save   adapter.save() of the edited document
// The reported number is the median of the three passes. This is a smoke alarm, not a
// benchmark: compare mode fails only when a metric exceeds 2× its recorded baseline
// (tests/fixtures/large-office/baseline.json), and the always-on absolute ceilings for
// the contract live in tests/features/clioworks-r2-perf.test.mjs.
//
//   node tooling/clioworks-r2-perf.mjs                    compare with baseline.json (default)
//   node tooling/clioworks-r2-perf.mjs --write-baseline   (re)write baseline.json
// Fixtures missing from dist/fixtures/large-office/ are generated first (git-ignored:
// the generator is committed, the big files are not).
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

import os from "node:os";
import vm from "node:vm";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeContext, loadScripts } from "../tests/fixtures/clioworks-s11/vm-context.mjs";
import { DECK_NAME, DOC_NAME, OUT_DIR, SHEET_NAME, generateDeck, generateDoc, generateSheet } from "./clioworks-r2-generate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const BASELINE = join(here, "..", "tests", "fixtures", "large-office", "baseline.json");
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);

// ------------------------------------------------------------------ adapter sessions
// Same session pattern as tooling/clioworks-r1-corpus.mjs: fixed clock, fixed UUIDs, the
// adapter loaded the way the browser loads it (document.head.appendChild emulation).
function session(adapterFile, globalName) {
  const ctx = makeContext();
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(NOW); }
    static now() { return NOW; }
  }
  ctx.Date = FixedDate;
  let n = 0;
  ctx.crypto = new Proxy(ctx.crypto, {
    get(target, key) {
      if (key === "randomUUID") return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  loadScripts(ctx, [`app/vendor/clioworks-v3/${adapterFile}`]);
  return (bytes, meta) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext(`${globalName}.open(globalThis.__bytes, globalThis.__meta)`, ctx);
  };
}

const flip = (text) => { const first = [...text][0]; return (first === "◆" ? "◇" : "◆") + text.slice(first.length); };
const colName = (c) => { let s = ""; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** R1's minimal-edit plans: the first editable target, wherever it sits in the file. */
const APPS = {
  docx: {
    open: () => session("quire-adapter.js", "ClioWorksQuireAdapter"),
    plan(a) {
      for (const p of a.paragraphs()) {
        const i = p.runs.findIndex((r) => r.kind === "text" && r.text);
        if (i >= 0) return () => { const r = a.setRunText(p.id, i, flip(p.runs[i].text)); if (r && (r.status === "blocked" || r.blocked)) throw new Error(`desk refused the edit: ${JSON.stringify(r).slice(0, 120)}`); };
      }
      throw new Error("no editable text run in the body");
    },
  },
  xlsx: {
    open: () => session("ledger-adapter.js", "ClioWorksLedgerAdapter"),
    plan(a) {
      for (const sheet of a.sheets()) {
        for (const { row, col, cell } of a.listCells(sheet.id)) {
          if (typeof cell.v === "string" && cell.v && !cell.f) return () => a.setCell(sheet.id, colName(col) + row, { value: flip(cell.v) });
        }
      }
      throw new Error("no non-formula text cell found");
    },
  },
  pptx: {
    open: () => session("lectern-adapter.js", "ClioWorksLecternAdapter"),
    plan(a) {
      for (const slide of a.slides()) {
        for (const shape of a.shapes(slide.id)) {
          if (!shape.editable) continue;
          for (const para of shape.paragraphs) {
            for (const run of para.runs) {
              if (run.text && !run.field) return () => { const r = a.setRunText(slide.id, run.id, flip(run.text)); if (r && (r.status === "blocked" || r.blocked)) throw new Error(`desk refused the edit: ${JSON.stringify(r).slice(0, 120)}`); };
            }
          }
        }
      }
      throw new Error("no editable text run found in any text box");
    },
  },
};

const FIXTURES = [
  { file: SHEET_NAME, ext: "xlsx", generate: generateSheet },
  { file: DOC_NAME, ext: "docx", generate: generateDoc },
  { file: DECK_NAME, ext: "pptx", generate: generateDeck },
];
const METRICS = ["open", "edit", "save"];
const median3 = (a, b, c) => [a, b, c].sort((x, y) => x - y)[1];
const ms = (n) => Math.round(n * 10) / 10;

async function measureFile({ file, ext }) {
  const bytes = new Uint8Array(readFileSync(join(OUT_DIR, file)));
  const openFn = APPS[ext].open();
  const passes = [];
  let error = null;
  for (let pass = 0; pass < 4 && !error; pass += 1) { // one warm-up + three timed
    const t = [0, 0, 0, 0];
    try {
      t[0] = performance.now();
      const adapter = await openFn(bytes, { name: file });
      t[1] = performance.now();
      await APPS[ext].plan(adapter)();
      t[2] = performance.now();
      await adapter.save();
      t[3] = performance.now();
      if (pass > 0) passes.push({ open: t[1] - t[0], edit: t[2] - t[1], save: t[3] - t[2] });
    } catch (e) {
      error = `${e.message || e}`;
    }
  }
  if (error) return { file, bytes: bytes.byteLength, error };
  return {
    file,
    bytes: bytes.byteLength,
    open: median3(passes[0].open, passes[1].open, passes[2].open),
    edit: median3(passes[0].edit, passes[1].edit, passes[2].edit),
    save: median3(passes[0].save, passes[1].save, passes[2].save),
    passes,
  };
}

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`);

function printTable(rows) {
  console.log("fixture            size      open ms   edit ms   save ms   (median of 3 after 1 warm-up; edit = locate + minimal flip)");
  for (const r of rows) {
    if (r.error) {
      console.log(`${r.file.padEnd(18)} ${kb(r.bytes).padEnd(9)} REFUSED: ${r.error}`);
      continue;
    }
    const detail = (key) => r.passes.map((p) => Math.round(p[key])).join("/");
    console.log(`${r.file.padEnd(18)} ${kb(r.bytes).padEnd(9)} ${ms(r.open).toLocaleString("en-US").padStart(7)}   ${ms(r.edit).toLocaleString("en-US").padStart(7)}   ${ms(r.save).toLocaleString("en-US").padStart(7)}   [${detail("open")} | ${detail("edit")} | ${detail("save")}]`);
  }
}

async function main() {
  const write = process.argv.includes("--write-baseline");
  for (const { file, generate } of FIXTURES) {
    if (!existsSync(join(OUT_DIR, file))) {
      console.log(`generating missing fixture ${file} …`);
      generate();
    }
  }
  const rows = [];
  for (const fixture of FIXTURES) rows.push(await measureFile(fixture));
  printTable(rows);

  if (write) {
    const baseline = {
      note: "R2 large-office perf baseline; regenerate with node tooling/clioworks-r2-perf.mjs --write-baseline. Compare mode fails only above 2× these medians.",
      machine: { cpu: os.cpus()[0]?.model || "unknown", node: process.version },
      files: {},
    };
    for (const r of rows) {
      baseline.files[r.file] = r.error
        ? { bytes: r.bytes, open: null, edit: null, save: null, error: r.error }
        : { bytes: r.bytes, open: ms(r.open), edit: ms(r.edit), save: ms(r.save) };
    }
    writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 1)}\n`);
    console.log(`baseline written: ${BASELINE}`);
    return;
  }
  if (!existsSync(BASELINE)) {
    console.error("no baseline.json: run node tooling/clioworks-r2-perf.mjs --write-baseline first");
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).files || {};
  const bad = [];
  for (const r of rows) {
    const was = baseline[r.file];
    if (!was) continue;
    if (was.error && r.error) continue;
    if (!was.error && r.error) { bad.push(`${r.file}: the adapter used to open and edit this file, now it fails: ${r.error}`); continue; }
    for (const key of METRICS) {
      if (typeof was[key] !== "number") continue;
      if (r[key] > was[key] * 2) bad.push(`${r.file}: ${key} ${ms(r[key])}ms is more than 2× the baseline ${was[key]}ms`);
    }
  }
  if (bad.length) {
    console.error(`REGRESSION\n${bad.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("no metric above 2× baseline.json");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
