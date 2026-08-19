import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicContractFiles, publicProductContracts } from "../tests/feature-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const featureDir = join(root, "tests/features");
const requested = process.argv.slice(2).filter((arg) => arg !== "--");

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
// colliding, and the result is byte-identical to a serial run.
const CONCURRENCY = 4;

function runFeature(fileName) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(featureDir, fileName)], {
      cwd: root,
      encoding: "utf8",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ stdout, stderr, status }));
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
  Array.from({ length: Math.min(CONCURRENCY, selectedTests.length) }, () => worker())
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

console.log(`\nFeature verification passed: ${selectedTests.length} feature test(s).`);
