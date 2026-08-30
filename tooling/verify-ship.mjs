#!/usr/bin/env node

/**
 * Ship-only browser gates.
 *
 * The inexpensive deterministic gate has already built the private bundle and
 * sealed it in verification-base-receipt.json. This command validates those
 * exact bytes before running the five browser-heavy release conditions. The
 * browser commands intentionally call their Node entry points directly so the
 * same private app bundle is never rebuilt between gates.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  BASE_RECEIPT_PATH,
  loadAndValidateBaseVerificationReceipt,
} from "./lib/verification-receipt.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHIP_REQUIRED_CHECKS = Object.freeze([
  "theme-lab-regression",
  "appearance-real-apps",
  "bonsai-acceptance",
  "appearance-phase5",
  "appearance-snapshot",
]);
const checks = [
  {
    name: "theme-lab-regression",
    command: process.execPath,
    args: ["tooling/theme-lab-snapshot.mjs", "--verify"],
  },
  {
    name: "appearance-real-apps",
    command: process.execPath,
    args: ["tooling/verify-appearance-app-coverage.mjs"],
  },
  {
    name: "bonsai-acceptance",
    command: process.execPath,
    args: ["tooling/verify-bonsai-acceptance.mjs"],
  },
  {
    name: "appearance-phase5",
    command: process.execPath,
    args: ["tooling/verify-appearance-phase5.mjs"],
  },
  {
    name: "appearance-snapshot",
    command: process.execPath,
    args: ["tooling/appearance-snapshot.mjs", "--verify"],
  },
];

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
for (const check of checks) {
  const started = Date.now();
  process.stdout.write(`\n[verify:ship] ${check.name} …\n`);
  const result = spawnSync(check.command, check.args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1", AI_SYSTEM6_PREBUILT_BUNDLE: "1" },
  });
  const exitCode = result.status === null ? 1 : result.status;
  const durationMs = Date.now() - started;
  if (exitCode !== 0) failed += 1;
  results.push({
    name: check.name,
    command: `${check.command} ${check.args.join(" ")}`,
    exitCode,
    durationMs,
  });
  process.stdout.write(`[verify:ship] ${check.name} → exit ${exitCode} (${durationMs}ms)\n`);
}

const report = {
  schema: "ai-system-6/verification-ship/v1",
  version: base.receipt.version,
  build: base.receipt.build,
  sourceCommit: base.receipt.sourceCommit,
  sourceTree: base.receipt.sourceTree,
  baseReceiptPath: path.relative(repositoryRoot, baseReceiptPath),
  baseReceiptSha256: base.sha256,
  bundle: base.receipt.bundle,
  requiredChecks: SHIP_REQUIRED_CHECKS,
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
console.log(
  `[verify:ship] PASSED: all ${results.length} ship-only checks reused the base-receipted bundle.`,
);
