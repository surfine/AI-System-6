#!/usr/bin/env node
// Release step-resume: bank each completed release-prepare step's outcome
// keyed by (step name + every input the step reads), so a refused release's
// RETRY pays only for what changed — not for the 20 minutes it already paid.
//
//   node tooling/release-step-resume.mjs          # show banked steps
//   node tooling/release-step-resume.mjs --clear  # drop the bank (fresh start)
//
// The release-prepare orchestrator consults the bank automatically when it
// exists (see releasePrepareOptions.resumeBank): a step whose identity
// matches a green banked outcome is marked REUSED-FROM-BANK and skipped;
// anything else runs for real. A refusal clears only the failed step's
// entry — the survivors keep their credit, exactly like checkpoint-restart.
//
// Identity = sha256 of: the step's command, the frozen-tree input set the
// step declares (via the same coverage rules the ship gates use), and the
// release identity (version/build/sourceCommit). Changing any of those is a
// different step and pays again — by design, never by accident.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bankPath = join(root, "dist", "release-step-bank.json");

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
  console.log("release-step-bank cleared.");
  process.exit(0);
}

const bank = load();
const names = Object.keys(bank.steps);
if (!names.length) {
  console.log("release-step-bank is empty — no steps banked yet.");
  process.exit(0);
}
console.log(`release-step-bank: ${names.length} step outcome(s) banked\n`);
for (const name of names) {
  const entry = bank.steps[name];
  console.log(`  ${entry.status === "ok" ? "✓" : "✗"} ${name}  (${entry.status}, ${entry.identity.slice(0, 12)}, ${entry.durationS?.toFixed?.(1) ?? "?"}s)`);
}
console.log("\nA retried release reuses green entries whose identity matches;");

// Exported helpers used by release-prepare (classic script context reads the
// file directly; this CLI keeps it human-inspectable and clearable).
export function stepIdentity({ command, inputsHash, release }) {
  return createHash("sha256").update(JSON.stringify({ command, inputsHash, release })).digest("hex");
}
