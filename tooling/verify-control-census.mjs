// Ratchet: the dead-control count measured by tooling/control-census.mjs may
// only fall. Same shape as the other budget ratchets in this repo
// (tooling/css-budget.json + verify-css.mjs) — a small committed JSON file
// holds the ceiling, this script re-measures and fails if the ceiling rose.
//
// Not wired into verify:ship / verify:release here — see this tool's report
// for why (another lane may be touching that file) and what line to add.
//
// Usage:
//   node tooling/verify-control-census.mjs               # measure + compare
//   node tooling/verify-control-census.mjs --update       # measure + lower
//                                                          # the baseline to
//                                                          # match (only
//                                                          # allowed when the
//                                                          # new count is <=)

import { readFileSync, writeFileSync } from "node:fs";
import { main as runCensus, baselinePath } from "./control-census.mjs";

const update = process.argv.includes("--update");

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const report = await runCensus();
const deadNow = report.totals.dead;

console.log(`verify-control-census: dead=${deadNow} baseline=${baseline.deadCount}`);

if (deadNow > baseline.deadCount) {
  console.error(
    `NO  Dead control count rose: ${baseline.deadCount} -> ${deadNow}. `
    + `The dead count may only fall. See ${report ? "the evidence report this run just wrote" : ""} for the new dead list, `
    + `fix or re-scope the regression, then re-run.`
  );
  process.exit(1);
}

if (deadNow < baseline.deadCount) {
  if (update) {
    // Keep every other key. The baseline file carries the notes that say what
    // each earlier fall was made of, and rewriting the file from three fields
    // would throw that record away on the first successful --update.
    writeFileSync(
      baselinePath,
      JSON.stringify({ ...baseline, deadCount: deadNow, controlSites: report.totals.controlSites, updatedAt: new Date().toISOString() }, null, 2) + "\n",
      "utf8"
    );
    console.log(`OK  Dead count improved (${baseline.deadCount} -> ${deadNow}); baseline lowered.`);
  } else {
    console.log(
      `OK  Dead count improved (${baseline.deadCount} -> ${deadNow}). `
      + `Run with --update to lower the committed baseline and lock in the gain.`
    );
  }
  process.exit(0);
}

console.log("OK  Dead count unchanged.");
