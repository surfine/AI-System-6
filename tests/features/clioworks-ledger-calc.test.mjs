// ClioWorks S11 M1 contract: the vendored VibeOffice Ledger formula evaluator
// (calc.js + fn-*.js) loads in the same headless classic-script lane the codec
// uses, and its real public recalculation entry point computes a workbook
// built with L.model.
//
// It proves the evaluator is present and functional, and (S11 M1-1) that
// ledger-adapter.js loads it at the SECOND lazy point, ensureCalc(), not at open
// time: CALC_MODULES lists it in dependency order (fn-core defines C.opt for later
// files; fn-stat defines C.special for fn-eng), and MODULES no longer holds it.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-ledger-calc");

// The exact prefix of ledger-adapter.js's MODULES that the adapter loads before
// its preserved-write path; it ends at fn-eng.js.
const CODEC_MODULES = [
  "app/vendor/vibeoffice/common/zip.js",
  "app/vendor/vibeoffice/common/xml.js",
  "app/vendor/vibeoffice/common/opc.js",
  "app/vendor/vibeoffice/common/opc-order.js",
  "app/vendor/vibeoffice/common/numfmt.js",
  "app/vendor/vibeoffice/common/crypto.js",
  "app/vendor/vibeoffice/common/dml.js",
  "app/vendor/vibeoffice/common/charts.js",
  "app/vendor/vibeoffice/ledger/xml.js",
  "app/vendor/vibeoffice/ledger/formula.js",
  "app/vendor/vibeoffice/ledger/model.js",
  "app/vendor/vibeoffice/ledger/calc.js",
  "app/vendor/vibeoffice/ledger/fn-core.js",
  "app/vendor/vibeoffice/ledger/fn-lookup.js",
  "app/vendor/vibeoffice/ledger/fn-stat.js",
  "app/vendor/vibeoffice/ledger/fn-fin.js",
  "app/vendor/vibeoffice/ledger/fn-eng.js",
];

// The six adopted evaluator files, in the order they must load after model.js.
const EVALUATOR_MODULES = [
  "app/vendor/vibeoffice/ledger/calc.js",
  "app/vendor/vibeoffice/ledger/fn-core.js",
  "app/vendor/vibeoffice/ledger/fn-lookup.js",
  "app/vendor/vibeoffice/ledger/fn-stat.js",
  "app/vendor/vibeoffice/ledger/fn-fin.js",
  "app/vendor/vibeoffice/ledger/fn-eng.js",
];

function loadLedgerCodec() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error, globalThis: null,
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  for (const modulePath of CODEC_MODULES) {
    vm.runInContext(read(modulePath), context, { filename: modulePath });
  }
  return context;
}

/** The literal path strings of one of ledger-adapter.js's module arrays, in source order. */
function adapterModules(name = "MODULES") {
  const source = read("app/vendor/clioworks-v3/ledger-adapter.js");
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(source);
  if (!block) return null;
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

const run = () => {
  const context = loadLedgerCodec();
  const L = context.L;
  test.assert(!!(L && L.calc && typeof L.calc.recalcAll === "function"),
    "the vendored Ledger evaluator loads headless and exposes L.calc.recalcAll");

  // Each vendored fn-*.js registers its own functions: presence proves the file
  // ran, not just that the source was read.
  const registrySample = [
    ["fn-core.js", "IF"],
    ["fn-lookup.js", "VLOOKUP"],
    ["fn-stat.js", "AVERAGE"],
    ["fn-fin.js", "PMT"],
    ["fn-eng.js", "DEC2BIN"],
  ];
  const missing = registrySample.filter(([, name]) => !L.calc.FN[name]);
  test.assert(missing.length === 0,
    `every vendored fn-*.js registered its functions (${registrySample.map(([file]) => file).join(", ")})${missing.length ? `; missing ${missing.map(([, name]) => name).join(", ")}` : ""}`);

  // Behavioural: build a workbook through the real model, recalculate through
  // the real public entry point, read the value back out of the cell.
  const result = vm.runInContext(`(() => {
    const wb = new L.model.Workbook();
    const sh = wb.addSheet('Sheet1');
    sh.put(0, 0, { v: 2 });
    sh.put(1, 0, { v: 3 });
    sh.put(2, 0, { f: 'SUM(A1:A2)*2' });
    L.calc.recalcAll(wb);
    const cell = sh.get(2, 0);
    return { value: cell && cell.v, formula: cell && cell.f };
  })()`, context);
  test.assert(result.value === 10 && result.formula === "SUM(A1:A2)*2",
    `A3 =SUM(A1:A2)*2 with A1=2, A2=3 recalculates to 10 (got ${JSON.stringify(result.value)})`);

  // ledger-adapter.js: the six adopted files are the lazy list, in dependency order
  // (fn-core before fn-lookup/fn-stat/fn-fin/fn-eng, fn-stat before fn-eng), and are
  // NOT part of the open-time list. They load after model.js because ensureCalc() runs
  // after the codec is loaded.
  const modules = adapterModules("MODULES");
  const lazy = adapterModules("CALC_MODULES");
  test.assert(Array.isArray(modules) && modules.length > 0, "ledger-adapter.js declares a MODULES list");
  test.assert(modules.includes("app/vendor/vibeoffice/ledger/model.js"), "ledger-adapter.js loads ledger/model.js at open time");
  test.assert(Array.isArray(modules) && !modules.some((m) => EVALUATOR_MODULES.includes(m)),
    "the evaluator files are not in the open-time list");
  test.assert(JSON.stringify(lazy) === JSON.stringify(EVALUATOR_MODULES),
    `ledger-adapter.js lists calc + fn-*.js in dependency order as the lazy ensureCalc() list (got ${JSON.stringify(lazy)})`);

  test.finish();
};

run();
