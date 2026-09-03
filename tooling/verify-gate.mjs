#!/usr/bin/env node

/**
 * Run one ship gate now and bank the receipt.
 *
 * This is the daily-loop half of gate-receipt reuse. A developer who has just
 * changed a stylesheet runs the appearance gate anyway; this command makes that
 * work count at release time instead of throwing it away.
 *
 *   npm run verify:gate -- appearance-snapshot
 *   npm run verify:gate -- --list
 *   npm run verify:gate -- theme-lab-regression --no-reuse
 *
 * The command builds the app bundle first, because a gate photographs the built
 * bytes and the receipt is a claim about those exact bytes. It refuses to bank
 * anything when the gate fails, and it drops an older receipt in that case.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  GATE_RECEIPT_DIR,
  collectCoverage,
  currentGateState,
  dropGateReceipt,
  evaluateReuse,
  writeGateReceipt,
} from "./lib/gate-receipts.mjs";
import { SHIP_GATES, shipGate, shipGateEntry } from "./lib/ship-gates.mjs";
import { applyReleaseStamp, describeStampRefusal } from "./lib/release-stamp.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((argument) => argument !== "--");
const allowReuse = !args.includes("--no-reuse");
const skipBuild = args.includes("--no-build");
const releaseStamp = args.includes("--release-stamp");
const wantsAll = args.includes("--all");
const names = wantsAll
  // Cheapest first, so a banking session that is going to fail says so early.
  ? [...SHIP_GATES].sort((left, right) => (left.costHintMs || 0) - (right.costHintMs || 0)).map((gate) => gate.name)
  : args.filter((argument) => !argument.startsWith("--"));

function usage() {
  console.log("Usage: npm run verify:gate -- <gate> [<gate> …] [--no-reuse] [--no-build] [--release-stamp]");
  console.log("       npm run verify:gate -- --all --release-stamp   # bank all seven for the next release");
  console.log("       npm run verify:gate -- --list\n");
  console.log("Ship gates:");
  for (const gate of SHIP_GATES) {
    console.log(`  ${gate.name.padEnd(24)} ~${Math.round(gate.costHintMs / 1000)}s  ${gate.args.join(" ")}`);
  }
  console.log("\n--release-stamp builds the tree as the release of HEAD will build it, so the");
  console.log("receipts describe the bytes the release tests. Without it a release refuses");
  console.log("every receipt: the release source commit is compiled into two generated files.");
}

if (args.includes("--help") || args.includes("--list") || !names.length) {
  usage();
  process.exit(names.length || args.includes("--help") || args.includes("--list") ? 0 : 1);
}

const unknown = names.filter((name) => !shipGate(name));
if (unknown.length) {
  console.error(`NO  unknown ship gate: ${unknown.join(", ")}`);
  usage();
  process.exit(1);
}

// The bundle is an input to every gate, so it is built before the inputs are
// hashed. Without this a receipt could describe a stale bundle.
//
// `--release-stamp` builds it the way the release will: the frozen release tree
// compiles the source commit into apps/desktop/app/generated/build-info.{js,json},
// and those two tracked files are the whole difference between a development
// bundle and a release bundle. A receipt banked without the stamp is a true
// claim about bytes the release never tests, so the release refuses it.
let stamped = null;
if (releaseStamp) {
  stamped = applyReleaseStamp(repositoryRoot);
  if (!stamped.ok) {
    console.error(`NO  --release-stamp refused: ${describeStampRefusal(stamped.reason)}`);
    process.exit(1);
  }
  console.log(
    `[verify:gate] --release-stamp: built as the release of ${stamped.sourceCommit.slice(0, 12)} will build it.`,
  );
  // Whatever happens next, the stamp comes back out. A tree left stamped is a
  // dirty tree, and the release preflight refuses to release from one.
  //
  // Ctrl-C is the likely way a nine-minute banking run ends, so the interrupt
  // signals unstamp the tree too. A kill that the process cannot catch still
  // leaves it stamped; `npm run build:app` is the whole repair, and the message
  // below says so.
  const removeStamp = () => {
    if (!stamped) return;
    const restored = stamped.restore();
    stamped = null;
    if (restored.ok) console.log("[verify:gate] the working tree is back to the committed bundle.");
    else {
      console.error(`[verify:gate] the release stamp could NOT be removed (${restored.reason}).`);
      console.error("[verify:gate] run `npm run build:app` before releasing; the tree is dirty until you do.");
    }
  };
  process.on("exit", removeStamp);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      removeStamp();
      process.exit(130);
    });
  }
} else if (!skipBuild) {
  const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:app"], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    console.error("NO  build:app failed, so no gate ran and no receipt was banked.");
    process.exit(1);
  }
}

const coverage = collectCoverage(repositoryRoot);
if (coverage.unmapped.length) {
  // The receipt would be written but never spent, so say it once, up front.
  console.log(
    `[verify:gate] note: ${coverage.unmapped.length} repository path(s) belong to no gate input set.`,
  );
  console.log("[verify:gate] a release will run every gate until each path has a rule in tooling/lib/gate-receipts.mjs.");
  for (const unmapped of coverage.unmapped.slice(0, 10)) console.log(`  unmapped  ${unmapped}`);
}

const cache = new Map();
let failed = 0;
for (const name of names) {
  const gate = shipGate(name);
  const current = currentGateState(repositoryRoot, name, cache);
  const decision = evaluateReuse(repositoryRoot, name, {
    current,
    coverage,
    entryRelativePath: shipGateEntry(gate),
    allowReuse,
  });
  if (decision.reusable) {
    console.log(
      `[verify:gate] ${name} → REUSED, not run (green ${decision.receipt.passedAt};`
      + ` input ${current.inputs.sha256.slice(0, 12)}…). Use --no-reuse to run it again.`,
    );
    continue;
  }
  console.log(`\n[verify:gate] ${name} → runs now (${decision.reason})`);
  const started = Date.now();
  const result = spawnSync(process.execPath, gate.args, {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1", AI_SYSTEM6_PREBUILT_BUNDLE: "1" },
  });
  const durationMs = Date.now() - started;
  const exitCode = result.status === null ? 1 : result.status;
  if (exitCode !== 0) {
    failed += 1;
    dropGateReceipt(repositoryRoot, name);
    console.error(`[verify:gate] ${name} → exit ${exitCode} (${durationMs}ms); no receipt banked.`);
    continue;
  }
  const { destination } = writeGateReceipt(repositoryRoot, name, {
    command: `${process.execPath} ${gate.args.join(" ")}`,
    durationMs,
    sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout?.trim() || "",
    current,
  });
  console.log(
    `[verify:gate] ${name} → exit 0 (${durationMs}ms); receipt banked in`
    + ` ${path.relative(repositoryRoot, destination)}`,
  );
}

if (failed) process.exit(1);
console.log(`\n[verify:gate] done. Receipts live in ${GATE_RECEIPT_DIR}/ and never leave this machine.`);
