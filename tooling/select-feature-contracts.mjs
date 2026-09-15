#!/usr/bin/env node

/**
 * Which feature contracts read these files?
 *
 * A contract holds a source file to account by naming it — `read("app/features/
 * quick-draft.js")` — so the mention is the dependency. This walks the contract
 * suite once and prints the names of the contracts that mention any of the
 * paths it was given, one per line.
 *
 * It is the selection half of `verify:quick --file`: the whole suite is about
 * 210 CPU-seconds across 334 contracts, and a module change has no business
 * paying for the rest. The selection over-approximates (a contract that merely
 * mentions a path still runs) and never guesses the other way: a path no
 * contract mentions prints nothing, and the caller says so.
 *
 *   node tooling/select-feature-contracts.mjs apps/desktop/app/features/quick-draft.js
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const featureDir = join(root, "tests", "features");
const wanted = process.argv.slice(2).filter((argument) => argument && !argument.startsWith("--"));

if (!wanted.length) {
  console.error("Usage: node tooling/select-feature-contracts.mjs <path> [path…]");
  process.exit(1);
}

function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) collect(absolute, out);
    else if (entry.name.endsWith(".test.mjs")) out.push(absolute);
  }
  return out;
}

const needles = wanted.map((path) => {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  // A contract names a source by its path without a leading directory, and an
  // app file is usually named by the suffix below apps/desktop: both spellings
  // are the same dependency.
  return [normalized, normalized.replace(/^apps\/desktop\//, "")];
}).flat();

const selected = [];
for (const file of collect(featureDir).sort()) {
  let source = "";
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (needles.some((needle) => needle && source.includes(needle))) {
    selected.push(relative(featureDir, file).replace(/\.test\.mjs$/, ""));
  }
}

// A directory that is not a file is still a legitimate selection input: the
// caller may pass a folder it touched, and every contract under it counts.
for (const path of wanted) {
  const absolute = join(root, path.replaceAll("\\", "/"));
  if (!statIsDirectory(absolute)) continue;
  const prefix = path.replaceAll("\\", "/").replace(/\/$/, "");
  for (const file of collect(featureDir)) {
    const name = relative(featureDir, file).replace(/\.test\.mjs$/, "");
    if (selected.includes(name)) continue;
    const source = readFileSync(file, "utf8");
    if (source.includes(prefix)) selected.push(name);
  }
}

function statIsDirectory(absolutePath) {
  try {
    return statSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}

process.stdout.write(`${[...new Set(selected)].sort().join("\n")}${selected.length ? "\n" : ""}`);
