// ClioWorks G1 contract (CLIOWORKS-GAP-AUDIT-2026-10-31, 3.2 G1 / fourth cut "formula batches"): the function
// coverage table. Each row is formula, expected value (number, or an error string), tolerance, and the source of
// the expectation: Microsoft's function pages (documented examples, compared at the digits the page prints), or
// GridCraft's own tests (https://github.com/storytold/gridcraft @ 75f7056e1b96f7ce30f402310221ca1a6d083a17,
// crates/functions/src/{financial/tests.rs,ets.rs}). A red row blocks a batch; each batch is also entered in
// docs/clioworks/ADOPTION.md ("gridcraft function batches").
//
// BATCH2 (ledger-fn-batch2.js: REGEX*, GROUPBY, PIVOTBY) keeps a few representative rows per function; its array
// results are checked as grids below. BATCH1 is what ledger-fn-batch1.js adds (the functions the vendored evaluator kept as saved-value stubs, plus
// PERCENTOF). BASELINE pins documented values of the statistics/finance functions the evaluator already had, so a
// later batch cannot move them. FORECAST.ETS rows are limited to exact data: Excel's optimiser is undocumented, so
// noisy-series values are not asserted (see the ADOPTION entry).
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-g1-function-coverage");

const MODULES = [
  "common/zip", "common/xml", "common/opc", "common/opc-order", "common/numfmt", "common/crypto", "common/dml", "common/charts",
  "ledger/xml", "ledger/formula", "ledger/model", "ledger/calc", "ledger/fn-core", "ledger/fn-lookup", "ledger/fn-stat",
  "ledger/fn-fin", "ledger/fn-eng",
].map((m) => `app/vendor/vibeoffice/${m}.js`).concat("app/vendor/clioworks-v3/ledger-fn-batch1.js", "app/vendor/clioworks-v3/ledger-fn-batch2.js");

const BATCH1 = [
  ["ODDFPRICE(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0785,0.0625,100,2,1)", 113.597717, 5e-07, "Microsoft ODDFPRICE page example"],
  ["ODDFYIELD(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0575,84.5,100,2,0)", 0.0772, 5e-05, "Microsoft ODDFYIELD page example (7.72%)"],
  ["ODDLPRICE(DATE(2008,2,7),DATE(2008,6,15),DATE(2007,10,15),0.0375,0.0405,100,2,0)", 99.878286, 5e-07, "Microsoft ODDLPRICE page example"],
  ["ODDLYIELD(DATE(2008,4,20),DATE(2008,6,15),DATE(2007,12,24),0.0375,99.875,100,2,0)", 0.045192, 5e-07, "Microsoft ODDLYIELD page example"],
  ["ODDFYIELD(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.06,ODDFPRICE(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.06,0.05,100,2,1),100,2,1)", 0.05, 1e-09, "upstream odd_periods: yield->price->yield"],
  ["ODDLYIELD(DATE(2009,2,1),DATE(2009,12,15),DATE(2008,3,15),0.04,ODDLPRICE(DATE(2009,2,1),DATE(2009,12,15),DATE(2008,3,15),0.04,0.07,100,4,1),100,4,1)", 0.07, 1e-09, "upstream odd_periods: long odd last period round trip"],
  ["ODDFPRICE(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0785,0.0625,100,3,1)", "#NUM!", 0, "upstream: frequency 3"],
  ["ODDFPRICE(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0785,0.0625,100,2,5)", "#NUM!", 0, "upstream: basis 5"],
  ["ODDFPRICE(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0785,-0.01,100,2,1)", "#NUM!", 0, "upstream: negative yield"],
  ["ODDFYIELD(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0575,0,100,2,0)", "#NUM!", 0, "upstream: non-positive price"],
  ["ODDFPRICE(DATE(2009,4,1),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.07,0.06,100,2)", "#NUM!", 0, "upstream: settlement after first coupon"],
  ["ODDFPRICE(DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0785,\"x\",100,2,1)", "#VALUE!", 0, "Excel: text argument"],
  ["EUROCONVERT(1.2,\"DEM\",\"EUR\")", 0.61, 1e-12, "Microsoft EUROCONVERT page"],
  ["EUROCONVERT(1,\"FRF\",\"EUR\",TRUE,3)", 0.152, 1e-12, "Microsoft EUROCONVERT page"],
  ["EUROCONVERT(1,\"FRF\",\"EUR\",FALSE,3)", 0.15, 1e-12, "Microsoft EUROCONVERT page"],
  ["EUROCONVERT(1,\"FRF\",\"DEM\",TRUE,3)", 0.29728616, 1e-08, "Microsoft EUROCONVERT page"],
  ["EUROCONVERT(10,\"eur\",\"ITL\")", 19363, 1e-09, "upstream euroconvert: lira precision 0"],
  ["EUROCONVERT(1.23456,\"DEM\",\"DEM\")", 1.23456, 1e-12, "same currency returns the number"],
  ["EUROCONVERT(1,\"USD\",\"EUR\")", "#VALUE!", 0, "unknown code"],
  ["EUROCONVERT(1,\"FRF\",\"DEM\",TRUE,2)", "#VALUE!", 0, "triangulation precision below 3"],
  ["PERCENTOF({1,2},{1,2,3,4})", 0.3, 1e-12, "PERCENTOF = SUM(subset)/SUM(all)"],
  ["PERCENTOF(5,10)", 0.5, 1e-12, "definition"],
  ["PERCENTOF({1},{0})", "#DIV/0!", 0, "zero total"],
  ["PERCENTOF({1},{#N/A})", "#N/A", 0, "error propagates"],
  ["FORECAST.ETS(9,{2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8})", 18, 1e-09, "upstream straight_line_forecasts_exactly"],
  ["FORECAST.ETS(12,{2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8},0)", 24, 1e-09, "upstream: no seasonality"],
  ["FORECAST.ETS(13,{10,20,30,10,20,30,10,20,30,10,20,30},{1,2,3,4,5,6,7,8,9,10,11,12})", 10, 1e-07, "exactly repeating season of 3"],
  ["FORECAST.ETS.SEASONALITY({10,20,30,10,20,30,10,20,30,10,20,30},{1,2,3,4,5,6,7,8,9,10,11,12})", 3, 0, "upstream seasonal_series_is_detected"],
  ["FORECAST.ETS.SEASONALITY({2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8})", 0, 0, "no season in a straight line"],
  ["FORECAST.ETS.STAT({2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8},8)", 1, 1e-12, "step size"],
  ["FORECAST.ETS.STAT({2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8},6)", 0, 1e-09, "MAE of an exact fit"],
  ["FORECAST.ETS.CONFINT(9,{2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8})", 0, 1e-09, "upstream: exact fit has zero interval"],
  ["FORECAST.ETS(9,{2,4,6},{1,2})", "#N/A", 0, "documented: sizes differ"],
  ["FORECAST.ETS(2,{2,4,6},{1,2,3})", "#NUM!", 0, "documented: target before end"],
  ["FORECAST.ETS(13,{2,4,6},{1,2,3},8761)", "#NUM!", 0, "documented: seasonality out of range"],
  ["FORECAST.ETS(9,{2,4,\"x\",8,10,12,14,16},{1,2,3,4,5,6,7,8})", "#VALUE!", 0, "documented: text value"],
  ["FORECAST.ETS.STAT({2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8},9)", "#NUM!", 0, "documented: statistic outside 1-8"],
  ["FORECAST.ETS.CONFINT(9,{2,4,6,8,10,12,14,16},{1,2,3,4,5,6,7,8},1)", "#NUM!", 0, "documented: level outside (0,1)"],
  ["FORECAST.ETS(44043,C1:C6,B1:B6,0)", 15, 1e-09, "upstream monthly_dates: month ends, 2020-07-31"],
];

const BASELINE = [
  ["NPV(0.1,-10000,3000,4200,6800)", 1188.44, 0.005, "Microsoft NPV page"],
  ["IRR({-70000,12000,15000,18000,21000,26000})", 0.0866, 5e-05, "Microsoft IRR page"],
  ["PMT(0.08/12,10,10000)", -1037.03, 0.005, "Microsoft PMT page"],
  ["MIRR({-120000,39000,30000,21000,37000,46000},0.1,0.12)", 0.126094, 5e-07, "Microsoft MIRR page"],
  ["PV(0.08/12,240,500,0,0)", -59777.15, 0.005, "Microsoft PV page"],
  ["FV(0.06/12,10,-200,-500,1)", 2581.4, 0.005, "Microsoft FV page"],
  ["NPER(0.12/12,-100,-1000,10000,1)", 59.6738657, 5e-07, "Microsoft NPER page"],
  ["RATE(48,-200,8000)", 0.0077, 5e-05, "Microsoft RATE page"],
  ["PPMT(0.1/12,1,24,2000)", -75.62, 0.005, "Microsoft PPMT page"],
  ["CUMIPMT(0.09/12,360,125000,13,24,0)", -11135.23, 0.005, "Microsoft CUMIPMT page"],
  ["CUMPRINC(0.09/12,360,125000,13,24,0)", -934.1071, 5e-05, "Microsoft CUMPRINC page"],
  ["DB(1000000,100000,6,1,7)", 186083.33, 0.005, "Microsoft DB page"],
  ["SYD(30000,7500,10,1)", 4090.91, 0.005, "Microsoft SYD page"],
  ["PRICE(DATE(2008,2,15),DATE(2017,11,15),0.0575,0.065,100,2,0)", 94.63436, 5e-06, "Microsoft PRICE page"],
  ["DURATION(DATE(2008,1,1),DATE(2016,1,1),0.08,0.09,2,1)", 5.993775, 5e-07, "Microsoft DURATION page"],
  ["MDURATION(DATE(2008,1,1),DATE(2016,1,1),0.08,0.09,2,1)", 5.73567, 5e-06, "Microsoft MDURATION page"],
  ["TBILLEQ(DATE(2008,3,31),DATE(2008,6,1),0.0914)", 0.094151, 5e-07, "Microsoft TBILLEQ page"],
  ["NORM.DIST(42,40,1.5,TRUE)", 0.9087888, 5e-08, "Microsoft NORM.DIST page"],
  ["NORM.S.DIST(1.333333,TRUE)", 0.908789, 5e-07, "Microsoft NORM.S.DIST page"],
  ["T.DIST(60,1,TRUE)", 0.99469533, 5e-09, "Microsoft T.DIST page"],
  ["T.INV(0.75,2)", 0.8164966, 5e-08, "Microsoft T.INV page"],
  ["CHISQ.DIST(0.5,1,TRUE)", 0.52049988, 5e-09, "Microsoft CHISQ.DIST page"],
  ["CHISQ.INV.RT(0.050001,10)", 18.30697, 5e-06, "Microsoft CHISQ.INV.RT page"],
  ["F.DIST(15.2069,6,4,TRUE)", 0.99, 5e-08, "Microsoft F.DIST page"],
  ["F.INV(0.01,6,4)", 0.10930991, 5e-09, "Microsoft F.INV page"],
  ["GAMMA.DIST(10.00001131,9,2,TRUE)", 0.068094, 5e-07, "Microsoft GAMMA.DIST page"],
  ["BETA.DIST(2,8,10,TRUE,1,3)", 0.6854706, 5e-08, "Microsoft BETA.DIST page"],
  ["BINOM.DIST.RANGE(60,0.75,45,50)", 0.524, 0.0005, "Microsoft BINOM.DIST.RANGE page"],
  ["POISSON.DIST(2,5,FALSE)", 0.084224, 1e-06, "Microsoft POISSON.DIST page"],
  ["WEIBULL.DIST(105,20,100,TRUE)", 0.929581, 5e-07, "Microsoft WEIBULL.DIST page"],
  ["HYPGEOM.DIST(1,4,8,20,FALSE)", 0.3633, 5e-05, "Microsoft HYPGEOM.DIST page"],
  ["LOGNORM.DIST(4,3.5,1.2,TRUE)", 0.0390836, 5e-08, "Microsoft LOGNORM.DIST page"],
  ["Z.TEST({3,6,7,8,6,5,4,2,1,9},4)", 0.090574, 5e-07, "Microsoft Z.TEST page"],
  ["CONFIDENCE.T(0.05,1,50)", 0.284196, 1e-06, "Microsoft CONFIDENCE.T page"],
  ["PERCENTILE.EXC({1,2,3,4},0.3)", 1.5, 1e-12, "Microsoft PERCENTILE.EXC page"],
  ["QUARTILE.INC({1,2,4,7,8,9,10,12},1)", 3.5, 1e-12, "Microsoft QUARTILE.INC page"],
  ["RANK.AVG(3.5,{7,3.5,3.5,1,2},1)", 3.5, 1e-12, "Microsoft RANK.AVG page"],
  ["SKEW({3,4,5,2,3,4,5,6,4,7})", 0.359543, 5e-07, "Microsoft SKEW page"],
  ["KURT({3,4,5,2,3,4,5,6,4,7})", -0.151799637, 5e-09, "Microsoft KURT page"],
  ["STDEV.S({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})", 27.46392, 5e-06, "Microsoft STDEV.S page"],
  ["STEYX({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})", 3.305719, 5e-07, "Microsoft STEYX page"],
  ["FORECAST.LINEAR(30,{6,7,9,15,21},{20,28,31,38,40})", 10.60726, 1e-05, "Microsoft FORECAST.LINEAR page"],
];


// Batch 2 scalars: upstream text.rs `regex` test (JS regex engine, so only portable syntax is asserted).
const BATCH2 = [
  ["REGEXTEST(\"abc123\",\"[0-9]+\")", true, 0, "upstream regex test"],
  ["REGEXEXTRACT(\"tel 555-1234 or 555-9876\",\"[0-9]{3}-[0-9]{4}\")", "555-1234", 0, "upstream regex test"],
  ["REGEXEXTRACT(\"abc\",\"z\")", "#N/A", 0, "upstream regex test"],
  ["REGEXREPLACE(\"a1b22c\",\"[0-9]+\",\"#\")", "a#b#c", 0, "upstream regex test"],
  ["REGEXREPLACE(\"a1b22c\",\"[0-9]+\",\"#\",-2)", "a#b22c", 0, "upstream regex test"],
  ["REGEXREPLACE(\"John Smith\",\"(\\w+) (\\w+)\",\"$2, $1\")", "Smith, John", 0, "upstream regex test"],
  ["REGEXREPLACE(\"ab\",\"(a)\",\"$1x\")", "axb", 0, "upstream regex test"],
  ["REGEXTEST(\"a\",\"(\")", "#VALUE!", 0, "invalid pattern"],
];
// Batch 2 grids: formula entered as a legacy array formula over A1:F8 with the upstream `sales()` data in K1:M6
// (crates/functions/src/dynamic.rs tests groupby / pivotby). A blank in a spilled result reads 0 here: the
// evaluator's existing spill writes blanks as 0, which batch 2 does not change.
const GRIDS = [
  ["GROUPBY(K1:K6,M1:M6,SUM)", [["Region", "Amount"], ["East", 15], ["North", 1], ["West", 27], ["Total", 43]]],
  ["GROUPBY(K1:K6,M1:M6,\"MAX\",1,0,-2)", [["West", 20], ["East", 10], ["North", 1]]],
  ["GROUPBY(K1:K6,M1:M6,LAMBDA(x,SUM(x)*2))", [["Region", "Amount"], ["East", 30], ["North", 2], ["West", 54], ["Total", 86]]],
  ["PIVOTBY(K1:K6,L1:L6,M1:M6,SUM)", [[0, "A", "B", "Total"], ["Region", "Amount", "Amount", "Amount"], ["East", 10, 5, 15], ["North", 1, 0, 1], ["West", 20, 7, 27], ["Total", 31, 12, 43]]],
  ["REGEXEXTRACT(\"tel 555-1234 or 555-9876\",\"[0-9]{3}-[0-9]{4}\",1)", [["555-1234"], ["555-9876"]]],
];

// Functions that still keep the value saved in the file (no data to compute from, or a later batch). A batch that
// implements one must remove it here; the list never grows silently.
const STILL_STUBS = ["CALL", "COPILOT", "CUBEKPIMEMBER", "CUBEMEMBER", "CUBEMEMBERPROPERTY", "CUBERANKEDMEMBER", "CUBESET",
  "CUBESETCOUNT", "CUBEVALUE", "DETECTLANGUAGE", "FILTERXML", "GETPIVOTDATA", "IMAGE", "PY", "REGISTER.ID", "RTD",
  "SQL.REQUEST", "STOCKHISTORY", "TRANSLATE", "WEBSERVICE"];

function load() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream, setTimeout, clearTimeout,
    queueMicrotask, structuredClone, URL, URLSearchParams, Blob, ArrayBuffer, Uint8Array, DataView, Promise, Map, Set,
    WeakMap, JSON, Math, Date, Intl, RegExp, Error, globalThis: null,
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  for (const path of MODULES) vm.runInContext(read(path), context, { filename: path });
  return context;
}

const context = load();
const L = context.L;

// B1:B6 month ends of 2020 (serials), C1:C6 values 3..13 step 2, for the dated-timeline row.
context.__rows = [...BATCH1, ...BASELINE, ...BATCH2].map((r) => r[0]);
const values = vm.runInContext(`(() => {
  const wb = new L.model.Workbook();
  const sh = wb.addSheet('S');
  [43861, 43890, 43921, 43951, 43982, 44012].forEach((v, i) => sh.put(i, 1, { v }));
  [3, 5, 7, 9, 11, 13].forEach((v, i) => sh.put(i, 2, { v }));
  __rows.forEach((f, i) => sh.put(i, 0, { f }));
  L.calc.recalcAll(wb);
  return __rows.map((f, i) => { const c = sh.get(i, 0); return c ? c.v : undefined; });
})()`, context);

function check(table, offset, label) {
  table.forEach(([formula, expected, tol, source], i) => {
    const got = values[offset + i];
    const name = `${label}: ${formula.length > 90 ? formula.slice(0, 87) + "..." : formula} [${source}]`;
    if (typeof expected === "boolean" || (typeof expected === "string" && !expected.startsWith("#"))) {
      test.assert(got === expected, `${name} expected ${expected}, got ${JSON.stringify(got)}`);
    } else if (typeof expected === "string") {
      test.assert(got && got.e === expected, `${name} expected ${expected}, got ${JSON.stringify(got)}`);
    } else {
      test.assert(typeof got === "number" && Math.abs(got - expected) <= tol, `${name} expected ${expected} +-${tol}, got ${JSON.stringify(got)}`);
    }
  });
}
check(BATCH1, 0, "batch 1");
check(BASELINE, BATCH1.length, "baseline");
check(BATCH2, BATCH1.length + BASELINE.length, "batch 2");

context.__grids = GRIDS.map((g) => g[0]);
const grids = vm.runInContext(`__grids.map((f) => {
  const wb = new L.model.Workbook(), sh = wb.addSheet('S');
  [['Region', 'Item', 'Amount'], ['East', 'A', 10], ['West', 'A', 20], ['East', 'B', 5], ['West', 'B', 7], ['North', 'A', 1]].forEach((r, i) => r.forEach((v, j) => sh.put(i, 10 + j, { v })));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) sh.put(r, c, { v: 0 });
  sh.put(0, 0, { f, af: { r1: 0, c1: 0, r2: 7, c2: 5 } });
  L.calc.recalcAll(wb);
  return Array.from({ length: 8 }, (_, r) => Array.from({ length: 6 }, (_, c) => L.calc.cellValue(sh, r, c)));
})`, context);
GRIDS.forEach(([formula, expected], i) => {
  const rows = expected.length, cols = expected[0].length;
  const ok = expected.every((row, r) => row.every((v, c) => grids[i][r][c] === v)) && (grids[i][rows] || [])[0]?.e === "#N/A" && (cols === 1 || (grids[i][0][cols] || {}).e === "#N/A");
  test.assert(ok, `batch 2 grid: ${formula} [upstream dynamic.rs tests] got ${JSON.stringify(grids[i].slice(0, rows + 1))}`);
});

// Registry: nothing in the tables is a keep-the-saved-value stub, and the stub list is exactly what is left.
const FN = L.calc.FN;
const stubs = Object.keys(FN).filter((n) => {
  return FN[n].list && FN[n].kinds === "r" && /flags\.keep/.test(String(FN[n].impl));
}).sort();
test.assert(JSON.stringify(stubs) === JSON.stringify(STILL_STUBS.slice().sort()),
  `the keep-the-saved-value stubs are exactly the expected list (got ${stubs.join(",")})`);
for (const name of ["ODDFPRICE", "ODDFYIELD", "ODDLPRICE", "ODDLYIELD", "EUROCONVERT", "PERCENTOF", "FORECAST.ETS",
  "FORECAST.ETS.CONFINT", "FORECAST.ETS.SEASONALITY", "FORECAST.ETS.STAT", "REGEXTEST", "REGEXEXTRACT", "REGEXREPLACE", "GROUPBY",
  "PIVOTBY"]) {
  test.assert(!!FN[name] && !stubs.includes(name), `${name} is registered and computes`);
}

test.finish();
