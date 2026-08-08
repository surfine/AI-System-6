#!/usr/bin/env node
/**
 * Local ship gate (verify:ship).
 *
 * GitHub-hosted Actions availability is an account condition, not a code
 * defect, so the release condition is this reproducible local gate. It runs
 * every required check, records each exit code + duration, and writes
 * dist/verification-report.json with the release identity so a release can
 * prove what it actually verified.
 *
 * `--fast` and `--skip-e2e` run only the nine non-browser checks (build,
 * feature tests, version, checkjs, data, docs, css, design, public tree)
 * and skip the three Playwright E2E projects. `--fast` is for quick local
 * iteration; `--skip-e2e` is the explicit release override used when the
 * browser matrix is covered by GitHub Actions CI instead of the local run.
 * The full gate (including E2E) remains the default release condition.
 *
 * The report is generated fresh on every run; release.mjs invokes this gate
 * rather than trusting a stale file.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  { name: "build", command: "npm", args: ["run", "build"] },
  { name: "feature-tests", command: "npm", args: ["test"] },
  { name: "version-consistency", command: "npm", args: ["run", "verify:version"] },
  { name: "checkjs", command: "npm", args: ["run", "verify:checkjs"] },
  { name: "data-boundary", command: "npm", args: ["run", "verify:data"] },
  { name: "docs", command: "npm", args: ["run", "verify:docs"] },
  { name: "css", command: "npm", args: ["run", "verify:css"] },
  { name: "design", command: "npm", args: ["run", "verify:design"] },
  { name: "public-tree", command: "npm", args: ["run", "verify:public"] },
  { name: "e2e-chromium", command: "npx", args: ["playwright", "test", "--config", "tests/e2e/playwright.config.mjs", "--project=chromium-desktop"] },
  { name: "e2e-webkit", command: "npx", args: ["playwright", "test", "--config", "tests/e2e/playwright.config.mjs", "--project=webkit-desktop"] },
  { name: "e2e-iphone", command: "npx", args: ["playwright", "test", "--config", "tests/e2e/playwright.config.mjs", "--project=iphone-webkit"] },
];

const skipE2e = process.argv.includes("--fast") || process.argv.includes("--skip-e2e");
const activeChecks = skipE2e
  ? checks.filter((check) => !check.name.startsWith("e2e-"))
  : checks;

function readJson(relativePath, fallback = {}) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

function browserVersions() {
  const cacheRoot = join(
    process.env.HOME || "",
    "Library",
    "Caches",
    "ms-playwright"
  );
  const detect = (prefix) => {
    if (!existsSync(cacheRoot)) return "";
    return readdirOnce(cacheRoot).find((entry) => entry.startsWith(prefix)) || "";
  };
  return {
    chromium: detect("chromium-"),
    webkit: detect("webkit-"),
  };
}

function readdirOnce(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const pkg = readJson("package.json");
const buildInfo = readJson("build-info.json");
const generated = readJson("app/generated/build-info.json");
const startedAt = new Date().toISOString();

const results = [];
let failed = 0;
for (const check of activeChecks) {
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
  console.error(`[verify:ship] FAILED: ${failed} of ${activeChecks.length} checks did not pass.`);
  process.exit(1);
}
console.log(`[verify:ship] PASSED: all ${activeChecks.length} checks${skipE2e ? " (E2E skipped)" : ""}.`);
