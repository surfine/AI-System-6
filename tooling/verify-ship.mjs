#!/usr/bin/env node
/**
 * Local ship gate (verify:ship).
 *
 * The release condition is this reproducible local gate: deterministic and
 * repeatable, plus six-appearance regression, representative real-app
 * propagation, and four-appearance canonical-fidelity browser gates. The E2E
 * matrix remains an optional diagnostic (`npm run test:e2e`) for humans, not
 * a release condition.
 *
 * The gate runs every required check, records each exit code + duration, and
 * writes dist/verification-report.json with the release identity so a release
 * can prove what it actually verified.
 *
 * `--fast` keeps the same check list (there is no browser matrix to skip);
 * it is accepted for compatibility with existing invocations.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimePaths, lazyRuntimePaths } from "./runtime-manifest.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  { name: "build", command: "npm", args: ["run", "build"] },
  { name: "feature-tests", command: "npm", args: ["test"] },
  { name: "version-consistency", command: "npm", args: ["run", "verify:version"] },
  { name: "checkjs", command: "npm", args: ["run", "verify:checkjs"] },
  { name: "src-typecheck", command: "npm", args: ["run", "verify:src"] },
  { name: "data-boundary", command: "npm", args: ["run", "verify:data"] },
  { name: "docs", command: "npm", args: ["run", "verify:docs"] },
  { name: "css", command: "npm", args: ["run", "verify:css"] },
  { name: "theme-icons", command: "npm", args: ["run", "verify:theme-icons"] },
  { name: "theme-lab-regression", command: "npm", args: ["run", "verify:theme-lab"] },
  { name: "appearance-real-apps", command: "npm", args: ["run", "verify:appearance-apps"] },
  { name: "theme-lab-fidelity", command: "npm", args: ["run", "verify:theme-lab:fidelity"] },
  { name: "design", command: "npm", args: ["run", "verify:design"] },
  { name: "public-tree", command: "npm", args: ["run", "verify:public"] },
  { name: "runtime-syntax", command: process.execPath, args: ["tooling/verify-ship-runtime-syntax.mjs"] },
  { name: "release-smoke", command: "npm", args: ["run", "smoke:release"] },
  { name: "release-assets", command: "npm", args: ["run", "check:release-assets"] },
  { name: "floppy-budget", command: "npm", args: ["run", "verify:floppy"] },
  { name: "native-action-audit", command: "npm", args: ["run", "verify:native-action-audit"] },
  { name: "native-parity", command: "npm", args: ["run", "verify:native-parity-ledger"] },
];

function readJson(relativePath, fallback = {}) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

function browserVersions() {
  // Kept for the report so a release can still see what browsers exist
  // locally; no check depends on it.
  const cacheRoot = join(
    process.env.HOME || "",
    "Library",
    "Caches",
    "ms-playwright"
  );
  const detect = (prefix) => {
    if (!existsSync(cacheRoot)) return "";
    try {
      return readdirSync(cacheRoot).find((entry) => entry.startsWith(prefix)) || "";
    } catch {
      return "";
    }
  };
  return {
    chromium: detect("chromium-"),
    webkit: detect("webkit-"),
  };
}

const pkg = readJson("package.json");
const buildInfo = readJson("build-info.json");
const generated = readJson("apps/desktop/app/generated/build-info.json");
const startedAt = new Date().toISOString();

const results = [];
let failed = 0;
for (const check of checks) {
  const started = Date.now();
  process.stdout.write(`\n[verify:ship] ${check.name} …\n`);
  const result = spawnSync(check.command, check.args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const durationMs = Date.now() - started;
  const exitCode = result.status === null ? 1 : result.status;
  if (exitCode !== 0) failed += 1;
  results.push({ name: check.name, command: `${check.command} ${check.args.join(" ")}`, exitCode, durationMs });
  process.stdout.write(`[verify:ship] ${check.name} → exit ${exitCode} (${durationMs}ms)\n`);
}

const report = {
  version: String(pkg.version || ""),
  build: String(buildInfo.build || generated.build || ""),
  sourceCommit: String(process.env.AI_SYSTEM6_SOURCE_COMMIT || generated.sourceCommit || ""),
  platform: process.platform,
  node: process.version,
  browsers: browserVersions(),
  startedAt,
  finishedAt: new Date().toISOString(),
  checks: results,
};

const reportDir = join(repoRoot, "dist");
mkdirSync(reportDir, { recursive: true });
writeFileSync(
  join(reportDir, "verification-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);

console.log(`\n[verify:ship] verification report written to dist/verification-report.json`);
if (failed) {
  console.error(`[verify:ship] FAILED: ${failed} of ${results.length} checks did not pass.`);
  process.exit(1);
}
console.log(`[verify:ship] PASSED: all ${results.length} checks (appearance regression, real-app propagation, and canonical fidelity are release conditions; the E2E matrix is not).`);
