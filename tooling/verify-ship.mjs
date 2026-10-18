#!/usr/bin/env node

/**
 * The release gate: three deterministic checks, one command, about five minutes.
 *
 * The gates are declared in tooling/lib/ship-gates.mjs: one real Chromium boot
 * of the desk (static-smoke) and the cascade ledger at the desktop and the
 * phone viewport. None compares pixels, so a machine's fonts, compositor or
 * load cannot change a verdict, and nothing here needs a new commit to pass.
 *
 * The build happens once before this command (verify:release inside a release,
 * `npm run build:app` by hand). The gates call their Node entry points directly
 * and never rebuild. They each start their own server on a free port, so they
 * run together; the verdict of any one does not depend on a neighbour.
 *
 * Inside a release, release-prepare passes `--base-receipt`: the exact bytes
 * verify:release built and sealed are validated before any browser starts.
 * Run by hand there is no receipt, and the gates test the working tree as built.
 *
 * Writes dist/verification-report.json, which release-prepare reads.
 * Slow audits that used to be gates are `npm run audit:*`; see
 * internal/operations/RELEASE.md.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadAndValidateBaseVerificationReceipt } from "./lib/verification-receipt.mjs";
import { SHIP_GATES, SHIP_REQUIRED_CHECKS } from "./lib/ship-gates.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node tooling/verify-ship.mjs [--base-receipt <path>] [--serial]

Runs the release gate: ${SHIP_GATES.map((gate) => gate.name).join(", ")}.
Build first (npm run build:app); the gates never rebuild.

  --base-receipt <path>  validate the sealed verify:release receipt first (release-prepare passes it)
  --serial               run the gates one after another instead of together
  --no-reuse             accepted and ignored: receipts no longer exist and every gate always runs.
                         Kept for one release so older notes and scripts do not break.

Writes dist/verification-report.json. Exit status is non-zero if any gate fails.`);
  process.exit(0);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return "";
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${flag} requires a path`);
  return args[index + 1];
}

function git(argv) {
  const result = spawnSync("git", argv, { cwd: repositoryRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

if (args.includes("--no-reuse")) {
  console.log("[verify:ship] --no-reuse is a no-op: there are no receipts and every gate always runs.");
}

let base = null;
const baseReceiptArg = valueAfter("--base-receipt");
if (baseReceiptArg) {
  try {
    base = await loadAndValidateBaseVerificationReceipt(path.resolve(repositoryRoot, baseReceiptArg), {
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
} else {
  console.log("[verify:ship] no base receipt: testing the working tree as built.");
}

const startedAt = new Date().toISOString();
const childEnv = { ...process.env, FORCE_COLOR: "0", AI_SYSTEM6_PREBUILT_BUNDLE: "1" };
const command = process.execPath;

// One gate. Output is held and shown only if the gate fails, so two failures
// never interleave; the one line per gate is printed as each one ends.
function runGate(gate) {
  const started = Date.now();
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(command, gate.args, {
      cwd: repositoryRoot,
      env: { ...childEnv, ...(gate.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    const settle = (exitCode, extra = "") => {
      const durationMs = Date.now() - started;
      const output = Buffer.concat(chunks).toString("utf8") + extra;
      console.log(`[verify:ship] ${gate.name.padEnd(24)} ${(durationMs / 1000).toFixed(1).padStart(6)}s  exit ${exitCode}`);
      if (exitCode !== 0) {
        console.log(`\n--- ${gate.name} output ---\n${output.trimEnd()}\n--- end ${gate.name} ---\n`);
      }
      resolve({ gate, exitCode, durationMs });
    };
    child.on("error", (error) => settle(1, `could not start: ${error.message}`));
    child.on("close", (code, signal) => settle(code === null ? 1 : code, signal ? `killed by ${signal}` : ""));
  });
}

console.log(`[verify:ship] ${SHIP_GATES.map((gate) => gate.name).join(", ")}${args.includes("--serial") ? " (one at a time)" : " (together)"}`);
const outcomes = [];
if (args.includes("--serial")) {
  for (const gate of SHIP_GATES) outcomes.push(await runGate(gate));
} else {
  outcomes.push(...await Promise.all(SHIP_GATES.map(runGate)));
}

const results = outcomes.map(({ gate, exitCode, durationMs }) => ({
  name: gate.name,
  command: `${Object.entries(gate.env || {}).map(([key, value]) => `${key}=${value} `).join("")}node ${gate.args.join(" ")}`,
  status: "ran",
  exitCode,
  durationMs,
}));
const failed = results.filter((result) => result.exitCode !== 0);

const readJson = (relative) => JSON.parse(readFileSync(path.join(repositoryRoot, relative), "utf8"));
const report = {
  schema: "ai-system-6/verification-ship/v3",
  version: base ? base.receipt.version : String(readJson("package.json").version || ""),
  build: base ? base.receipt.build : String(readJson("build-info.json").build || ""),
  sourceCommit: base ? base.receipt.sourceCommit : git(["rev-parse", "HEAD"]),
  sourceTree: base ? base.receipt.sourceTree : git(["rev-parse", "HEAD^{tree}"]),
  baseReceiptPath: base ? path.relative(repositoryRoot, path.resolve(repositoryRoot, baseReceiptArg)) : null,
  baseReceiptSha256: base ? base.sha256 : null,
  bundle: base ? base.receipt.bundle : null,
  requiredChecks: SHIP_REQUIRED_CHECKS,
  startedAt,
  finishedAt: new Date().toISOString(),
  checks: results,
};
const reportDir = path.join(repositoryRoot, "dist");
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, "verification-report.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const wallS = ((Date.now() - Date.parse(startedAt)) / 1000).toFixed(1);
console.log(`\n[verify:ship] verification report written to ${reportPath}`);
if (failed.length) {
  console.error(`[verify:ship] FAILED: ${failed.map((result) => result.name).join(", ")} (${failed.length} of ${results.length}) in ${wallS}s.`);
  process.exit(1);
}
console.log(`[verify:ship] PASSED: ${results.length} of ${results.length} gates in ${wallS}s.`);
