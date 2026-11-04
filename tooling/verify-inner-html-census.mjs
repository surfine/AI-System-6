// Ratchet: the raw innerHTML count measured by tooling/inner-html-census.mjs
// may only fall. Same shape as the other budget ratchets in this repo
// (tooling/css-budget.json + verify-css.mjs, tooling/control-census.mjs +
// verify-control-census.mjs) — a small committed JSON file holds the ceiling,
// this script re-measures and fails if the ceiling rose.
//
// Not wired into verify:ship / verify:release here — see this tool's report
// and the control-census precedent for why (another lane may be touching
// those files); run it by hand per T3 batch and lower the ceiling as sites
// convert to the html`` template.
//
// Usage:
//   node tooling/verify-inner-html-census.mjs            # measure + compare
//   node tooling/verify-inner-html-census.mjs --update   # measure + lower the
//                                                          baseline to match
//                                                          (only when <=)

import { readFileSync, writeFileSync } from "node:fs";
import { main as runCensus, baselinePath } from "./inner-html-census.mjs";

const update = process.argv.includes("--update");

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const report = await runCensus();
const rawNow = report.totals.raw;

console.log(`verify-inner-html-census: raw=${rawNow} baseline=${baseline.rawCount} (tagged ${report.totals.tagged}, opaque informational ${report.totals.opaque})`);

if (rawNow > baseline.rawCount) {
  console.error(
    `NO  Raw innerHTML count rose: ${baseline.rawCount} -> ${rawNow}. `
    + `New markup must go through the html\`\` template (app/core/strings.js) or carry a note in the baseline. `
    + `Per-file counts are in the census report.`
  );
  process.exit(1);
}

if (rawNow < baseline.rawCount) {
  if (update) {
    const next = { ...baseline, rawCount: rawNow, totalSites: report.totals.sites };
    writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n");
    console.log(`OK  baseline lowered to ${rawNow}`);
  } else {
    console.log(`OK  (baseline can fall: run with --update to lower it to ${rawNow})`);
  }
} else {
  console.log("OK  raw innerHTML count held at the ceiling");
}
