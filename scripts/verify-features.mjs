import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const allTests = readdirSync(featureDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();

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

const failures = [];

selectedTests.forEach((fileName) => {
  const label = featureName(fileName);
  console.log(`\n# ${label}`);
  const result = spawnSync(process.execPath, [join(featureDir, fileName)], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failures.push(label);
});

if (failures.length) {
  console.error(`\nFeature verification failed: ${failures.length} feature(s): ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`\nFeature verification passed: ${selectedTests.length} feature test(s).`);
