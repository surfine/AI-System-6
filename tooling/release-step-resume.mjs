#!/usr/bin/env node
// Release step-resume: inspect or clear the checkpoint bank that
// release-prepare writes when AI_SYSTEM6_STEP_BANK=1.
//
//   node tooling/release-step-resume.mjs          # show banked steps
//   node tooling/release-step-resume.mjs --clear  # drop the bank (fresh start)
//
// The bank sits beside the release directories. This CLI used to look for it at
// dist/release-step-bank.json — a path nothing writes — so it reported "empty"
// and cleared nothing while a real bank sat on disk, and it printed "?" for
// every step because it read a `durationS` field the writer never sets. Both
// programs now derive the path from releaseStepBankPath() in
// tooling/lib/release-receipt.mjs, and tests/features/release-step-resume.test.mjs
// holds them to it.
//
// The bank is opt-in and must stay that way: a reused step is never re-run, but
// its outputs live in trees each run recreates, so reuse currently breaks the
// retry it is meant to accelerate. See createStepBank in release-prepare.mjs.

import { readFileSync, existsSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { releaseStepBankPath } from "./lib/release-receipt.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bankPath = releaseStepBankPath(root);

function load() {
  if (!existsSync(bankPath)) return { schemaVersion: 1, steps: {} };
  try {
    const data = JSON.parse(readFileSync(bankPath, "utf8"));
    if (data.schemaVersion === 1 && data.steps && typeof data.steps === "object") return data;
  } catch {}
  return { schemaVersion: 1, steps: {} };
}

if (process.argv.includes("--clear")) {
  rmSync(bankPath, { force: true });
  console.log(`release-step-bank cleared (${bankPath}).`);
  process.exit(0);
}

const bank = load();
const names = Object.keys(bank.steps);
console.log(`release-step-bank: ${bankPath}`);
if (!names.length) {
  console.log("empty — no steps banked yet.");
  process.exit(0);
}
console.log(`${names.length} step outcome(s) banked\n`);
for (const name of names) {
  const entry = bank.steps[name];
  const seconds = Number.isFinite(entry.durationMs) ? `${(entry.durationMs / 1000).toFixed(1)}s` : "?";
  console.log(`  ${entry.status === "ok" ? "✓" : "✗"} ${name}  (${entry.status}, ${String(entry.identity).slice(0, 12)}, ${seconds}, ${entry.at || "?"})`);
}
console.log("\nA retried release spends a green entry whose identity matches; a refusal clears its own.");
