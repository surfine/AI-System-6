#!/usr/bin/env node

/**
 * Which feature contracts read these files?
 *
 * A contract holds a source file to account by naming it — `read("app/features/
 * quick-draft.js")` — so the mention is the dependency. This walks the contract
 * suite once and prints the names of the contracts that reach any of the paths
 * it was given, one per line.
 *
 * "Reach" is a mention or an import, and it is transitive through the shared
 * helpers, because a path string is not the whole dependency:
 *
 *   - the contract names the file (`read("…")`), or
 *   - the contract imports a helper that names it, or that imports another
 *     helper which does (a contract using `boot-vm.mjs` is answerable for
 *     anything `boot-vm.mjs` reads), or
 *   - the changed path IS a contract or a helper: a contract answers for
 *     itself, and a helper answers for every contract that imports it, however
 *     deep the import chain runs.
 *
 * Both directions stay conservative: a path nothing reaches selects nothing, and
 * the caller is told that rather than being handed a silent pass.
 *
 * It is the selection half of `verify:quick --file`: the whole suite is about
 * 210 CPU-seconds across 334 contracts, and a module change has no business
 * paying for the rest. The selection over-approximates (a contract that merely
 * mentions a path still runs) and never guesses the other way: a path no
 * contract mentions prints nothing, and the caller says so.
 *
 *   node tooling/select-feature-contracts.mjs apps/desktop/app/features/quick-draft.js
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const featureDir = join(root, "tests", "features");
const helperDir = join(root, "tests", "helpers");
const wanted = process.argv.slice(2).filter((argument) => argument && !argument.startsWith("--"));

if (!wanted.length) {
  console.error("Usage: node tooling/select-feature-contracts.mjs <path> [path…]");
  process.exit(1);
}

function collect(dir, { suffix = ".test.mjs", out = [] } = {}) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) collect(absolute, { suffix, out });
    else if (entry.name.endsWith(suffix)) out.push(absolute);
  }
  return out;
}

/** Every module specifier a file imports, relative or not. */
function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:^|[^\w.])import\s*(?:[^"'()]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1] || match[2];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return "";
  const candidate = resolve(dirname(fromFile), specifier);
  return existsSync(candidate) ? candidate : "";
}

const needles = wanted.map((path) => {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  // A contract names a source by its path without a leading directory, and an
  // app file is usually named by the suffix below apps/desktop: both spellings
  // are the same dependency.
  return [normalized, normalized.replace(/^apps\/desktop\//, "")];
}).flat();

const wantedAbsolute = new Set(
  wanted.map((path) => resolve(root, path.replaceAll("\\", "/")))
);

// Every helper that reaches one of the wanted paths, following helper→helper
// imports to the end. A contract importing one of these is answerable for it.
const helpers = new Map();
for (const file of collect(helperDir, { suffix: ".mjs" })) {
  helpers.set(file, importSpecifiers(readFileSync(file, "utf8"))
    .map((specifier) => resolveSpecifier(file, specifier))
    .filter(Boolean));
}

function helperReachesWanted(file) {
  const seen = new Set();
  const queue = [file];
  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    if (wantedAbsolute.has(current)) return true;
    const source = readFileSync(current, "utf8");
    if (needles.some((needle) => needle && source.includes(needle))) return true;
    for (const imported of helpers.get(current) || []) if (!seen.has(imported)) queue.push(imported);
  }
  return false;
}

const reachingHelpers = new Set([...helpers.keys()].filter((file) => helperReachesWanted(file)));

const selected = [];
for (const file of collect(featureDir).sort()) {
  let source = "";
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const imports = importSpecifiers(source)
    .map((specifier) => resolveSpecifier(file, specifier))
    .filter(Boolean);
  const isWantedItself = wantedAbsolute.has(file);
  const importsAffectedHelper = imports.some((imported) => reachingHelpers.has(imported));
  if (isWantedItself
    || importsAffectedHelper
    || needles.some((needle) => needle && source.includes(needle))) {
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
