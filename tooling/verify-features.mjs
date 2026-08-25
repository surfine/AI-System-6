import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { publicContractFiles, publicProductContracts } from "../tests/feature-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const featureDir = join(root, "tests/features");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const requested = [];
let requestedJobs = process.env.AI_SYSTEM6_TEST_JOBS;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--jobs") {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      console.error("NO  --jobs requires an integer from 1 to 16.");
      process.exit(2);
    }
    requestedJobs = value;
    index += 1;
  } else if (arg === "--help") {
    console.log(`Usage:
  npm run verify:features
  npm run verify:features -- <feature> [feature...]
  npm run verify:features -- --jobs <1-16> [feature...]

AI_SYSTEM6_TEST_JOBS sets the same bounded worker count. The default uses up
to eight logical CPUs.`);
    process.exit(0);
  } else {
    requested.push(arg);
  }
}

function resolveConcurrency(value) {
  if (!value) return Math.max(1, Math.min(8, availableParallelism()));
  if (!/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 16 ? parsed : 0;
}

const concurrency = resolveConcurrency(requestedJobs);
if (!concurrency) {
  console.error(`NO  --jobs must be an integer from 1 to 16; received ${requestedJobs || "(empty)"}.`);
  process.exit(2);
}

function featureName(fileName) {
  return fileName.replace(/\.test\.mjs$/, "");
}

if (!existsSync(featureDir)) {
  console.error("NO  tests/features is missing.");
  process.exit(1);
}

function collectFeatureTests(dir, base = "") {
  const out = [];
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const relative = join(base, entry.name);
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFeatureTests(absolute, relative));
    else if (entry.name.endsWith(".test.mjs")) out.push(relative);
  });
  return out;
}

const allTests = collectFeatureTests(featureDir).sort();

if (!allTests.length) {
  console.error("NO  no feature tests found in tests/features.");
  process.exit(1);
}

const selectedTests = requested.length
  ? allTests.filter((name) => requested.includes(featureName(name)) || requested.includes(name))
  : allTests;

if (!selectedTests.length) {
  console.error(`NO  no feature tests matched: ${requested.join(", ")}`);
  console.error(`Available: ${allTests.map(featureName).join(", ")}`);
  process.exit(1);
}

// The daily feature suite is the slowest feedback loop in the repo (well over
// a hundred isolated Node processes). The tests are independent — each spawns
// its own VM with its own state — so they run concurrently with a bounded
// worker pool and their output is replayed in the original order afterwards.
// The concurrency bound keeps port-0 servers and shared evidence files from
// colliding. Contract output order and pass/fail semantics stay the same as a
// serial run; only the timing summary and worker count vary. CI and constrained
// development machines can lower the pool explicitly with --jobs or
// AI_SYSTEM6_TEST_JOBS.

function runFeature(fileName) {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(process.execPath, [join(featureDir, fileName)], {
      cwd: root,
      encoding: "utf8",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({
      durationMs: performance.now() - started,
      stdout,
      stderr,
      status,
    }));
  });
}

const results = new Array(selectedTests.length);
let nextIndex = 0;
async function worker() {
  while (nextIndex < selectedTests.length) {
    const index = nextIndex;
    nextIndex += 1;
    results[index] = await runFeature(selectedTests[index]);
  }
}
await Promise.all(
  Array.from({ length: Math.min(concurrency, selectedTests.length) }, () => worker())
);

const failures = [];
selectedTests.forEach((fileName, index) => {
  const label = featureName(fileName);
  console.log(`\n# ${label}`);
  const result = results[index];
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failures.push(label);
});

const slowest = selectedTests
  .map((fileName, index) => ({
    durationMs: results[index].durationMs,
    label: featureName(fileName),
  }))
  .sort((a, b) => b.durationMs - a.durationMs)
  .slice(0, Math.min(5, selectedTests.length));
console.log("\nSlowest feature contracts:");
slowest.forEach(({ durationMs, label }) => {
  console.log(`  ${durationMs.toFixed(0).padStart(5)}ms  ${label}`);
});

if (failures.length) {
  console.error(`\nFeature verification failed: ${failures.length} feature(s): ${failures.join(", ")}`);
  process.exit(1);
}

// Public coverage summary: every public product feature must keep at least one
// public-safe contract test, or the summary prints ✗ and the gate fails.
const missingContracts = publicContractFiles().filter((file) => !existsSync(join(featureDir, file)));
console.log("\nPublic product contracts:");
let publicCoverageFailures = 0;
for (const entry of publicProductContracts) {
  const covered = entry.tests.every((file) => existsSync(join(featureDir, file)));
  console.log(`${covered ? "✓" : "✗"} ${entry.feature}`);
  if (!covered) publicCoverageFailures += 1;
}
if (missingContracts.length) {
  console.error(`NO  missing public-safe contract files: ${missingContracts.join(", ")}`);
}
if (publicCoverageFailures || missingContracts.length) {
  console.error("\nPublic product coverage verification failed.");
  process.exit(1);
}

console.log(`\nFeature verification passed: ${selectedTests.length} feature test(s) with ${Math.min(concurrency, selectedTests.length)} worker(s).`);
