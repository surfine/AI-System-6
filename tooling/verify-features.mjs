import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { batchContractNames, publicContractFiles, publicProductContracts } from "../tests/feature-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const featureDir = join(root, "tests/features");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const requested = [];
let requestedJobs = process.env.AI_SYSTEM6_TEST_JOBS;
let verbose = false;
let includeBatch = false;
let onlyBatch = false;

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
  } else if (arg === "--verbose") {
    verbose = true;
  } else if (arg === "--all") {
    includeBatch = true;
  } else if (arg === "--lane") {
    const value = args[index + 1];
    if (value !== "batch" && value !== "fast") {
      console.error("NO  --lane takes batch or fast.");
      process.exit(2);
    }
    onlyBatch = value === "batch";
    includeBatch = value === "batch";
    index += 1;
  } else if (arg === "--help") {
    console.log(`Usage:
  npm run verify:features                  # the fast lane, seconds
  npm run verify:features -- --all         # every contract, simulators included
  npm run verify:features -- --lane batch  # only the whole-system contracts
  npm run verify:features -- <feature> [feature...]
  npm run verify:features -- --jobs <1-16> [feature...]

AI_SYSTEM6_TEST_JOBS sets the same bounded worker count. The default uses up
to eight logical CPUs. Successful assertion logs stay in dist/verification/;
--verbose replays all logs. Failures print a bounded tail and the full log path.

The whole-system contracts (batchContractNames in tests/feature-manifest.mjs)
are left out of the default run: measured 2026-09-15, six of them are 104 s of a
42 s suite, and the slowest sets the wall clock on its own.`);
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

// Who is here, without running anything. `verify:quick` asks this before it
// builds, so a mistyped selector is answered in milliseconds instead of after a
// full bundle rebuild.
if (process.argv.includes("--list")) {
  allTests.forEach((name) => console.log(featureName(name)));
  process.exit(0);
}

const unknown = requested.filter((name) => !allTests.some((file) => name === file || name === featureName(file)));
if (unknown.length) {
  console.error(`NO  unknown feature selector(s): ${unknown.join(", ")}. No tests ran.`);
  process.exit(2);
}

const batchTests = allTests.filter((name) => batchContractNames.includes(featureName(name)));
const fastTests = allTests.filter((name) => !batchContractNames.includes(featureName(name)));
const defaultTests = onlyBatch ? batchTests : (includeBatch ? allTests : fastTests);
const selectedTests = requested.length
  ? allTests.filter((name) => requested.includes(featureName(name)) || requested.includes(name))
  : defaultTests;

// A run that leaves the whole-system contracts out says so, once, with the
// number: a green "334 feature tests" that quietly skipped six of them would
// be exactly the kind of claim this suite exists to prevent.
if (!requested.length && !includeBatch && batchTests.length) {
  console.log(
    `${fastTests.length} contract(s) ran; ${batchTests.length} whole-system contract(s) deferred`
    + " (npm run verify:features -- --all, or --lane batch for those alone).",
  );
}

if (!selectedTests.length) {
  console.error(`NO  no feature tests matched: ${requested.join(", ")}`);
  console.error(`Available: ${allTests.map(featureName).join(", ")}`);
  process.exit(1);
}

// Keep complete diagnostics on disk; passing assertions do not need to occupy
// every subsequent model call. Each run owns its directory, including parallel runs.
const evidenceRoot = join(root, "dist", "verification");
mkdirSync(evidenceRoot, { recursive: true });
const logDir = mkdtempSync(join(evidenceRoot, "features-"));
const suiteStarted = performance.now();

function runFeature(fileName, index) {
  return new Promise((resolve) => {
    const started = performance.now();
    const logPath = join(logDir, `${index}-${featureName(fileName).replace(/[^a-zA-Z0-9_-]/g, "_")}.log`);
    writeFileSync(logPath, "");
    const child = spawn(process.execPath, [join(featureDir, fileName)], { cwd: root });
    let outputBytes = 0;
    const record = (chunk) => {
      appendFileSync(logPath, chunk);
      outputBytes += Buffer.byteLength(chunk);
    };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    child.on("error", (error) => record(String(error) + "\n"));
    child.on("close", (status, signal) => resolve({
      durationMs: performance.now() - started, logPath, outputBytes, status, signal,
    }));
  });
}

const results = new Array(selectedTests.length);
let nextIndex = 0;
let completed = 0;
async function worker() {
  while (nextIndex < selectedTests.length) {
    const index = nextIndex++;
    results[index] = await runFeature(selectedTests[index], index);
    completed += 1;
    if (selectedTests.length > 25 && completed % 25 === 0) {
      console.log(`Features completed: ${completed}/${selectedTests.length}`);
    }
  }
}
await Promise.all(
  Array.from({ length: Math.min(concurrency, selectedTests.length) }, () => worker())
);

function logTail(file, limit = 6000) {
  const size = statSync(file).size;
  const buffer = Buffer.alloc(Math.min(size, limit));
  const fd = openSync(file, "r");
  try { readSync(fd, buffer, 0, buffer.length, Math.max(0, size - limit)); }
  finally { closeSync(fd); }
  return (size > limit ? "[earlier output retained in log]\n" : "") + buffer.toString("utf8");
}

const failures = [];
let remainingFailurePreview = 24000;
selectedTests.forEach((fileName, index) => {
  const result = results[index];
  const label = featureName(fileName);
  if (verbose) {
    console.log(`\n# ${label}`);
    process.stdout.write(readFileSync(result.logPath, "utf8"));
  }
  if (result.status !== 0) {
    failures.push(label);
    console.error(`NO  ${label} (exit ${result.status}, signal ${result.signal || "none"}) — ${result.logPath}`);
    if (!verbose && remainingFailurePreview > 0) {
      const limit = Math.min(6000, remainingFailurePreview);
      process.stderr.write(logTail(result.logPath, limit));
      remainingFailurePreview -= limit;
    }
  }
});
writeFileSync(join(logDir, "summary.json"), JSON.stringify({
  durationMs: performance.now() - suiteStarted,
  tests: selectedTests.map((file, index) => ({ file, ...results[index] })),
}, null, 2) + "\n");
console.log(`Full feature logs: ${logDir}`);

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
if (verbose) console.log("\nPublic product contracts:");
let publicCoverageFailures = 0;
for (const entry of publicProductContracts) {
  const covered = entry.tests.every((file) => existsSync(join(featureDir, file)));
  if (verbose || !covered) console.log(`${covered ? "✓" : "✗"} ${entry.feature}`);
  if (!covered) publicCoverageFailures += 1;
}
if (missingContracts.length) {
  console.error(`NO  missing public-safe contract files: ${missingContracts.join(", ")}`);
}
if (publicCoverageFailures || missingContracts.length) {
  console.error("\nPublic product coverage verification failed.");
  process.exit(1);
}

console.log(`\nFeature verification passed: ${selectedTests.length} feature test(s) with ${Math.min(concurrency, selectedTests.length)} worker(s) in ${((performance.now() - suiteStarted) / 1000).toFixed(2)}s.`);
