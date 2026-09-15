#!/usr/bin/env node

/**
 * Ship-only browser gates.
 *
 * The inexpensive deterministic gate has already built the private bundle and
 * sealed it in verification-base-receipt.json. This command validates those
 * exact bytes before running the browser-heavy release conditions. The browser
 * commands intentionally call their Node entry points directly so the same
 * private app bundle is never rebuilt between gates.
 *
 * A gate that already passed on this machine, over exactly these inputs, is
 * REUSED instead of run again — see tooling/lib/gate-receipts.mjs for the
 * fail-closed policy. `--no-reuse` runs every gate whatever the receipts say.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  BASE_RECEIPT_PATH,
  loadAndValidateBaseVerificationReceipt,
} from "./lib/verification-receipt.mjs";
import {
  GATE_RECEIPT_DIR,
  collectCoverage,
  currentGateState,
  dropGateReceipt,
  evaluateReuse,
  policyDigest,
  writeGateReceipt,
} from "./lib/gate-receipts.mjs";
import { BATCH_LANE, SHIP_GATES, SHIP_REQUIRED_CHECKS, shipGateEntry } from "./lib/ship-gates.mjs";
import { collectHeldOutput, describeLanes, lanePlan, lanesInOrder, runLanes } from "./lib/gate-lanes.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The fast lane runs on every release; the batch lane runs on demand (--batch)
// or as the whole thing in a banking pass. A deferred gate is named in the
// report and in the release receipt, so a fast release cannot be mistaken for
// a full one.
const includeBatch = process.argv.includes("--batch");
const allChecks = SHIP_GATES.map((gate) => ({ ...gate, command: process.execPath }));
const checks = allChecks.filter((gate) => includeBatch || gate.lane !== BATCH_LANE);
const deferredChecks = allChecks.filter((gate) => !includeBatch && gate.lane === BATCH_LANE);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) {
    throw new Error(`${flag} requires a path`);
  }
  return process.argv[index + 1];
}

const baseReceiptPath = path.resolve(
  repositoryRoot,
  valueAfter("--base-receipt") || BASE_RECEIPT_PATH,
);
let base;
try {
  base = await loadAndValidateBaseVerificationReceipt(baseReceiptPath, {
    repositoryRoot,
    requireCommit: true,
  });
} catch (error) {
  console.error(`[verify:ship] base receipt rejected before browsers: ${error.message}`);
  process.exit(1);
}

console.log(
  `[verify:ship] base receipt OK: ${base.receipt.sourceCommit.slice(0, 12)} / bundle ${base.receipt.bundle.sha256.slice(0, 12)}…`,
);
const startedAt = new Date().toISOString();
const results = [];
let failed = 0;

const childEnv = { ...process.env, FORCE_COLOR: "1", AI_SYSTEM6_PREBUILT_BUNDLE: "1" };

// ---- receipt reuse ------------------------------------------------------
//
// The decision is made for every gate before any browser starts, so the queue
// below holds only the gates that must really run.
const allowReuse = !process.argv.includes("--no-reuse");
const coverage = collectCoverage(repositoryRoot);
if (!allowReuse) {
  console.log("[verify:ship] --no-reuse: every gate runs, and receipts are ignored.");
} else if (coverage.unmapped.length) {
  // One path that no rule claims stops reuse for ALL gates. The list is the
  // repair instruction: give each path a rule in tooling/lib/gate-receipts.mjs.
  console.log(
    `[verify:ship] reuse OFF: ${coverage.unmapped.length} path(s) belong to no gate input set, so every gate runs.`,
  );
  for (const unmapped of coverage.unmapped.slice(0, 10)) console.log(`  unmapped  ${unmapped}`);
  if (coverage.unmapped.length > 10) console.log(`  … and ${coverage.unmapped.length - 10} more`);
}

const hashCache = new Map();
const decisions = new Map();
for (const check of checks) {
  const current = currentGateState(repositoryRoot, check.name, hashCache, {
    entryRelativePath: shipGateEntry(check),
  });
  decisions.set(check.name, {
    current,
    decision: evaluateReuse(repositoryRoot, check.name, {
      current,
      coverage,
      entryRelativePath: shipGateEntry(check),
      allowReuse,
    }),
  });
}

const reusedChecks = checks.filter((check) => decisions.get(check.name).decision.reusable);
const runnableChecks = checks.filter((check) => !decisions.get(check.name).decision.reusable);
let reusedMs = 0;

for (const check of reusedChecks) {
  const { current, decision } = decisions.get(check.name);
  const { receipt } = decision;
  reusedMs += receipt.durationMs || 0;
  results.push({
    name: check.name,
    command: `${check.command} ${check.args.join(" ")}`,
    status: "reused",
    exitCode: 0,
    durationMs: 0,
    lane: "not-run",
    inputSha256: current.inputs.sha256,
    inputFileCount: current.inputs.count,
    baselineSha256: current.baseline?.sha256 || null,
    machineSha256: current.machine.sha256,
    reuse: {
      passedAt: receipt.passedAt,
      originalDurationMs: receipt.durationMs,
      sourceCommit: receipt.sourceCommit,
      receiptPath: `${GATE_RECEIPT_DIR}/${check.name}.json`,
    },
  });
  process.stdout.write(
    `[verify:ship] ${check.name} → REUSED, not run (green ${receipt.passedAt} on ${receipt.machine.hostname};`
    + ` input ${current.inputs.sha256.slice(0, 12)}…; ~${Math.round((receipt.durationMs || 0) / 1000)}s not spent)\n`,
  );
}
for (const check of runnableChecks) {
  process.stdout.write(
    `[verify:ship] ${check.name} → runs now (${decisions.get(check.name).decision.reason})\n`,
  );
}

// One gate, in whichever lane the plan put it in. The lane decides only where
// its output goes — see tooling/lib/gate-lanes.mjs.
function execute(check, { holdOutput }) {
  const started = Date.now();
  if (!holdOutput) {
    const result = spawnSync(check.command, check.args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: "inherit",
      env: childEnv,
    });
    return Promise.resolve({
      exitCode: result.status === null ? 1 : result.status,
      durationMs: Date.now() - started,
      output: "",
    });
  }
  return new Promise((resolvePromise) => {
    const child = spawn(check.command, check.args, {
      cwd: repositoryRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    collectHeldOutput(child).then((held) => {
      resolvePromise({ exitCode: held.exitCode, durationMs: Date.now() - started, output: held.output });
    });
  });
}

// A gate that passes banks its receipt here, so the next release finds the work
// already paid. A gate that fails removes any older receipt: the inputs are now
// known to be bad, and a stale green one would hide that.
//
// Banking happens through `onResult` the moment a gate ends, so a release that
// is interrupted after six of nine gates keeps those six. The report below is
// still written in plan order, from the finished outcomes.
function bank(check, outcome) {
  const { current } = decisions.get(check.name);
  if (outcome.exitCode === 0) {
    writeGateReceipt(repositoryRoot, check.name, {
      command: `${check.command} ${check.args.join(" ")}`,
      durationMs: outcome.durationMs,
      sourceCommit: base.receipt.sourceCommit,
      current,
    });
  } else {
    dropGateReceipt(repositoryRoot, check.name);
  }
}

function record(check, outcome) {
  if (outcome.exitCode !== 0) failed += 1;
  const { current, decision } = decisions.get(check.name);
  results.push({
    name: check.name,
    command: `${check.command} ${check.args.join(" ")}`,
    status: "ran",
    ranBecause: decision.reason,
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs,
    lane: check.quiet ? "alone" : "shared",
    inputSha256: current.inputs.sha256,
    inputFileCount: current.inputs.count,
    baselineSha256: current.baseline?.sha256 || null,
    machineSha256: current.machine.sha256,
    reuse: null,
  });
  process.stdout.write(`[verify:ship] ${check.name} → exit ${outcome.exitCode} (${outcome.durationMs}ms)\n`);
}

// The lanes are the gates' own declaration, and verify:gate reads the same
// one — see tooling/lib/gate-lanes.mjs.
const lanes = lanePlan(runnableChecks);
if (runnableChecks.length) {
  process.stdout.write(`[verify:ship] run order, cheapest refusal first: ${describeLanes(lanes)}\n`);
}
const outcomes = await runLanes(lanes, { label: "verify:ship", execute, onResult: bank });
for (const check of lanesInOrder(lanes)) record(check, outcomes.get(check.name));

const report = {
  schema: "ai-system-6/verification-ship/v2",
  version: base.receipt.version,
  build: base.receipt.build,
  sourceCommit: base.receipt.sourceCommit,
  sourceTree: base.receipt.sourceTree,
  baseReceiptPath: path.relative(repositoryRoot, baseReceiptPath),
  baseReceiptSha256: base.sha256,
  bundle: base.receipt.bundle,
  requiredChecks: SHIP_REQUIRED_CHECKS,
  // A reader of this report must never take a reused pass for a fresh one, so
  // the reuse state is recorded before the checks and again on every check.
  reuse: {
    enabled: allowReuse,
    policySha256: policyDigest(),
    receiptDir: GATE_RECEIPT_DIR,
    unmappedPaths: coverage.unmapped,
    reusedChecks: reusedChecks.map((check) => check.name).sort(),
    ranChecks: runnableChecks.map((check) => check.name).sort(),
    // A reader of this report must be able to tell a fast release from a full
    // one without reading the command line that produced it.
    deferredChecks: deferredChecks.map((check) => check.name).sort(),
    batchIncluded: includeBatch,
    reusedMs,
  },
  startedAt,
  finishedAt: new Date().toISOString(),
  checks: results,
};
const reportDir = path.join(repositoryRoot, "dist");
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, "verification-report.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`\n[verify:ship] verification report written to ${reportPath}`);
if (failed) {
  console.error(`[verify:ship] FAILED: ${failed} of ${results.length} ship-only checks did not pass.`);
  process.exit(1);
}
const freshCount = results.length - reusedChecks.length;
console.log(
  `[verify:ship] PASSED: all ${results.length} ship-only checks hold against the base-receipted bundle`
  + ` — ${freshCount} run now, ${reusedChecks.length} reused from receipts`
  + ` (~${Math.round(reusedMs / 1000)}s of browser time not spent).`,
);
if (reusedChecks.length) {
  console.log(
    `[verify:ship] A reused check did NOT run in this pass. Its receipt is in ${GATE_RECEIPT_DIR}/;`
    + " use --no-reuse to run all of them again.",
  );
}
if (deferredChecks.length) {
  console.log(
    `[verify:ship] DEFERRED (batch lane, not part of this pass): ${deferredChecks.map((check) => check.name).join(", ")}.`
    + "\n[verify:ship] run `npm run verify:gate -- --all --release-stamp` for the full set,"
    + " or `release:prepare --batch` to require it before publishing.",
  );
}
