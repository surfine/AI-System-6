#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function collect(target) {
  const absolute = path.resolve(target);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => collect(path.join(absolute, entry.name)))
    .filter((file) => file.endsWith(".test.mjs"))
    .sort();
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("Usage: node tooling/run-node-tests.mjs <file-or-directory> [...]");
  process.exit(2);
}

const files = [...new Set(targets.flatMap(collect))];
if (!files.length) {
  console.error("No .test.mjs files found.");
  process.exit(2);
}

for (const file of files) {
  const relative = path.relative(process.cwd(), file);
  console.log(`\n[test] ${relative}`);
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\n${files.length} test file(s) passed.`);
