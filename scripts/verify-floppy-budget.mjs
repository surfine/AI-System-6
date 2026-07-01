import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimePaths, coreFiles, floppyBudgetBytes, lazyStartupExclusions } from "./runtime-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let total = 0;
const rows = [];
const failures = [];

for (const path of coreFiles) {
  const absolutePath = join(root, path);
  if (!existsSync(absolutePath)) {
    failures.push(`${path} is missing`);
    continue;
  }
  const bytes = statSync(absolutePath).size;
  total += bytes;
  rows.push({ path, bytes });
}

const indexSource = readFileSync(join(root, "index.html"), "utf8");
lazyStartupExclusions.forEach((src) => {
  if (indexSource.includes(src)) failures.push(`${src} must be lazy-loaded, not loaded by index.html`);
});

rows.forEach(({ path, bytes }) => {
  console.log(`${path.padEnd(24)} ${String(bytes).padStart(9)} bytes`);
});
console.log("top app modules");
appRuntimePaths
  .map((path) => ({ path, bytes: statSync(join(root, path)).size }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 10)
  .forEach(({ path, bytes }) => {
    console.log(`${path.padEnd(36)} ${String(bytes).padStart(9)} bytes`);
  });
console.log(`${"core total".padEnd(24)} ${String(total).padStart(9)} bytes`);
console.log(`${"floppy budget".padEnd(24)} ${String(floppyBudgetBytes).padStart(9)} bytes`);

const remaining = floppyBudgetBytes - total;
const reserveBytes = 512;
if (remaining < 0) {
  failures.push(`System Floppy Budget exceeded by ${Math.abs(remaining)} bytes.`);
} else {
  console.log(`${"remaining".padEnd(24)} ${String(remaining).padStart(9)} bytes`);
  console.log(`${"reserve floor".padEnd(24)} ${String(reserveBytes).padStart(9)} bytes`);
  if (remaining < reserveBytes) failures.push(`System Floppy Budget reserve is below ${reserveBytes} bytes.`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`NO  ${failure}`));
  process.exit(1);
}

console.log("OK  System Floppy Budget");
