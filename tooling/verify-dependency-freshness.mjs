#!/usr/bin/env node

// Gate: the dependency tree you build with is the one the repository declares.
//
// Why this exists: package.json and package-lock.json both declared
// pdfjs-dist@6.2.108 while node_modules held 4.8.69. Every local gate passed —
// they read source, not node_modules — and only the web release build failed,
// on a wasm decoder that pdfjs 4 never shipped. Nothing compared installed
// against declared, so the drift survived for as long as nobody reinstalled.
//
// The check is deliberately narrow. It does not ask whether a package has a
// newer release; that is `npm outdated`, a judgment call for a person. It asks
// whether what is on disk satisfies what this repository committed.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function ok(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Does an installed version satisfy a caret/tilde/exact range?
 * Ranges in this repository are `^x.y.z`, `~x.y.z`, or an exact version, so a
 * full semver implementation would be more machinery than the gate needs.
 * Anything else is reported as unchecked rather than guessed at.
 * @returns {"satisfied" | "violated" | "unchecked"}
 */
function rangeVerdict(range, installed) {
  const parts = (version) => version.split(".").map((piece) => Number.parseInt(piece, 10));
  const exact = /^\d+\.\d+\.\d+/.test(range);
  if (exact) return range.split("-")[0] === installed ? "satisfied" : "violated";
  const marker = range[0];
  if (marker !== "^" && marker !== "~") return "unchecked";
  const [wantMajor, wantMinor, wantPatch] = parts(range.slice(1));
  const [haveMajor, haveMinor, havePatch] = parts(installed);
  if ([wantMajor, wantMinor, wantPatch, haveMajor, haveMinor, havePatch].some(Number.isNaN)) return "unchecked";
  if (haveMajor !== wantMajor) return "violated";
  if (marker === "~" && haveMinor !== wantMinor) return "violated";
  if (haveMinor < wantMinor) return "violated";
  if (haveMinor === wantMinor && havePatch < wantPatch) return "violated";
  return "satisfied";
}

const packageJson = readJson("package.json");
if (!packageJson) {
  console.error("NO  package.json could not be read");
  process.exit(1);
}

const lock = readJson("package-lock.json");
const declared = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
const names = Object.keys(declared).sort();

if (!existsSync(join(root, "node_modules"))) {
  console.error("NO  node_modules is absent. Run npm ci before this gate.");
  process.exit(1);
}

let unchecked = 0;
for (const name of names) {
  const manifest = readJson(join("node_modules", name, "package.json"));
  if (!manifest) {
    fail(`${name} is declared but not installed; run npm ci`);
    continue;
  }
  const range = declared[name];
  const verdict = rangeVerdict(range, manifest.version);
  if (verdict === "violated") {
    fail(`${name} installed ${manifest.version} does not satisfy the declared ${range}; run npm ci`);
  } else if (verdict === "unchecked") {
    unchecked += 1;
  }
}

// The lock file is the exact tree a release builds from, so it is checked
// against what is on disk as well as against package.json.
if (lock?.packages) {
  for (const name of names) {
    const locked = lock.packages[`node_modules/${name}`]?.version;
    if (!locked) continue;
    const manifest = readJson(join("node_modules", name, "package.json"));
    if (!manifest) continue;
    if (manifest.version !== locked) {
      fail(`${name} installed ${manifest.version} but the lock file pins ${locked}; run npm ci`);
    }
  }
} else {
  fail("package-lock.json could not be read; the installed tree cannot be proved");
}

if (!failures.length) {
  ok(`${names.length} declared dependencies match package.json and the lock file`);
  if (unchecked) ok(`${unchecked} range(s) use a form this gate does not parse and were skipped`);
  console.log("\nDependency freshness verification passed.");
  process.exit(0);
}

console.error(`\nDependency freshness verification failed: ${failures.length} issue(s).`);
process.exit(1);
