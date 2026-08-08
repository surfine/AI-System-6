#!/usr/bin/env node
/**
 * Runtime syntax check for the ship gate.
 *
 * Parses every eager and lazy app runtime module plus the server entry with
 * `node --check` so a syntax error can never ship. This is a parse check, not
 * a behavior check: the feature tests own behavior.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimePaths, lazyRuntimePaths } from "./runtime-manifest.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paths = [
  ...appRuntimePaths,
  ...lazyRuntimePaths,
  "app.bundle.js",
  "src/server.js",
];

const failures = [];
for (const relative of paths) {
  const absolute = join(repoRoot, relative);
  if (!existsSync(absolute)) {
    failures.push(`${relative}: missing`);
    continue;
  }
  const result = spawnSync(process.execPath, ["--check", absolute], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push(`${relative}: ${(result.stderr || result.stdout || "syntax error").trim()}`);
  }
}

if (failures.length) {
  console.error(`Runtime syntax check failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Runtime syntax OK (${paths.length} runtime file(s)).`);
