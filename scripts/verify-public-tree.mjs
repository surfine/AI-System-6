#!/usr/bin/env node

/**
 * Gate: the public GitHub repository is independently verifiable.
 *
 * Run from the public snapshot (npm run verify:public) or against a locally
 * built snapshot (node scripts/verify-public-tree.mjs --root dist/public-snapshot).
 * It asserts:
 *
 *   - package.json exposes only commands whose target files exist in this
 *     tree (no dangling references to excluded internal files);
 *   - internal-only scripts (deploy, signing, packaging, native tooling,
 *     visual capture, publishing) are absent;
 *   - internal files the snapshot intentionally omits are really absent;
 *   - the supported command surface (npm ci / npm run build / npm test /
 *     npm run verify:public) is documented in README.md;
 *   - the CI workflow that runs these commands ships with the tree.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicPrebuildApp, publicScriptNames } from "./lib/public-package.mjs";

const args = process.argv.slice(2);
const rootFlagIndex = args.indexOf("--root");
const explicitRoot = rootFlagIndex >= 0 && args[rootFlagIndex + 1]
  ? resolve(args[rootFlagIndex + 1])
  : null;
const scriptDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// In the private tree `--root dist/public-snapshot` verifies the built
// payload. In the public repository itself that path does not exist; the
// snapshot root is the tree under verification, so fall back to it.
const root = explicitRoot && existsSync(explicitRoot) ? explicitRoot : scriptDir;

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
  } catch (error) {
    fail(`could not read ${relativePath}: ${error.message}`);
    return {};
  }
}

function fileExists(relativePath) {
  return existsSync(join(root, relativePath));
}

function assertFile(relativePath, message = `${relativePath} present`) {
  if (fileExists(relativePath)) ok(message);
  else fail(`${relativePath} missing`);
}

/**
 * Files the curated snapshot intentionally omits. This list repeats the
 * manifest exclusions on purpose: the gate must not trust the thing it gates.
 */
const forbiddenSnapshotPaths = [
  "AGENTS.md",
  "CLAUDE.md",
  "CLAUDE.zh-CN.md",
  ".claude/",
  "internal/",
  "deploy/",
  "native/",
  "drafts/",
  "ai-desktop-6-promo/",
  "liquid-glass-studio/",
  "liquid-glass-text/",
  "endfield-archive/",
  "external/",
  "app/content/ai-prompts/",
  "app/generated/ai-prompt-files.json",
  "scripts/build-ai-prompt-files.mjs",
  "scripts/cmf-prepare-model.mjs",
  "scripts/deploy-web.mjs",
  "scripts/deploy-status.mjs",
  "scripts/build-web-release.mjs",
  "scripts/web-release-manifest.mjs",
  "scripts/verify-web-release-safety.mjs",
  "scripts/release.mjs",
  "scripts/publish-github-release.mjs",
  "scripts/public-snapshot-manifest.mjs",
  "scripts/build-public-snapshot.mjs",
  "scripts/sync-public-snapshot.mjs",
  "scripts/verify-public-snapshot-safety.mjs",
  "scripts/lib/release-safety.mjs",
  "scripts/export-native-resources.mjs",
  "scripts/verify-native-action-audit.mjs",
  "scripts/verify-native-parity-ledger.mjs",
  "scripts/css-surface-snapshot.mjs",
  "scripts/visual-snapshot.mjs",
  "scripts/run-ui-writing-flow.mjs",
  "scripts/run-ui-writing-flow-clean.mjs",
  "tests/features/public-web-deployment.test.mjs",
  "tests/features/public-snapshot.test.mjs",
  "assets/themes/classic/icons/imagegen-source/",
  "assets/themes/platinum/icons/imagegen-source/",
  "assets/themes/aqua/icons/imagegen-source/",
  "assets/themes/snow-leopard/icons/imagegen-source/",
  "assets/themes/yosemite/icons/imagegen-source/",
];

const pkg = readJson("package.json");
const scripts = pkg.scripts || {};

const presentUnsupportedScripts = Object.keys(scripts).filter((name) =>
  !publicScriptNames.has(name)
);
if (presentUnsupportedScripts.length) {
  fail(`unsupported scripts exposed: ${presentUnsupportedScripts.join(", ")}`);
} else {
  ok("only supported public scripts are exposed");
}

for (const relativePath of forbiddenSnapshotPaths) {
  if (fileExists(relativePath)) {
    fail(`internal path must not be public: ${relativePath}`);
  }
}
if (!forbiddenSnapshotPaths.some((relativePath) => fileExists(relativePath))) {
  ok("internal paths are absent from the public tree");
}

function referencedPaths(scriptValue) {
  const found = new Set();
  for (const match of String(scriptValue).matchAll(/node\s+(?:--prefix\s+(\S+)\s+run\s+\S+\s+)?(scripts\/[A-Za-z0-9_./-]+\.mjs|src\/[A-Za-z0-9_./-]+\.js)/g)) {
    if (match[1]) found.add(`${match[1]}/package.json`);
    else found.add(match[2] || match[1]);
  }
  const configMatch = String(scriptValue).match(/playwright\s+test\s+--config\s+([A-Za-z0-9_./-]+\.mjs)/);
  if (configMatch) found.add(configMatch[1]);
  return found;
}

function collectFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(absolute, files);
    else files.push(absolute);
  }
  return files;
}

let dangling = 0;
for (const [name, value] of Object.entries(scripts)) {
  for (const referenced of referencedPaths(value)) {
    if (!fileExists(referenced)) {
      dangling += 1;
      fail(`script "${name}" references missing file: ${referenced}`);
    }
  }
  for (const nested of String(value).matchAll(/npm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
    if (nested[1] === name) continue;
    if (!scripts[nested[1]]) {
      dangling += 1;
      fail(`script "${name}" references missing script "${nested[1]}"`);
    }
  }
}
if (!dangling) ok("every public command references files and scripts that exist");

if (scripts["prebuild:app"] === publicPrebuildApp) {
  ok("prebuild:app is public-safe (no private prompt build)");
} else {
  fail(`prebuild:app must be "${publicPrebuildApp}"`);
}

if (scripts["verify:public"] === "node scripts/verify-public-tree.mjs") {
  ok("verify:public verifies the tree it runs from");
} else {
  fail("verify:public must run scripts/verify-public-tree.mjs");
}

if (typeof scripts.build === "string" && scripts.build.trim()) {
  ok(`package.json exposes the build script: ${scripts.build}`);
} else {
  fail('package.json must expose a real "build" script (README and CI both run npm run build)');
}

for (const required of [
  ".editorconfig",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/ARCHITECTURE.md",
  "docs/DEVELOPMENT.md",
  "docs/design/DESIGN.md",
  "scripts/public-tree-budget.json",
  "scripts/verify-public-tree.mjs",
  "scripts/verify-version-consistency.mjs",
  "scripts/runtime-manifest.mjs",
  "app/generated/build-info.js",
  "src/package.json",
  "src/tsconfig.json",
  "tests/e2e/playwright.config.mjs",
  ".github/workflows/ci.yml",
]) {
  assertFile(required);
}

const budget = readJson("scripts/public-tree-budget.json");
const allFiles = collectFiles(root);
const assetFiles = collectFiles(join(root, "assets"));
const allBytes = allFiles.reduce((sum, file) => sum + statSync(file).size, 0);
const assetBytes = assetFiles.reduce((sum, file) => sum + statSync(file).size, 0);
for (const [name, actual, limit] of [
  ["public files", allFiles.length, budget.maxFiles],
  ["public bytes", allBytes, budget.maxBytes],
  ["public asset files", assetFiles.length, budget.maxAssetFiles],
  ["public asset bytes", assetBytes, budget.maxAssetBytes],
]) {
  if (Number.isFinite(limit) && actual <= limit) ok(`${name} ${actual} <= ${limit}`);
  else fail(`${name} ${actual} exceeds budget ${limit}`);
}

for (const command of ["npm ci", "npm run build", "npm test", "npm run verify:public", "npm start"]) {
  if (fileExists("README.md") && readFileSync(join(root, "README.md"), "utf8").includes(command)) {
    ok(`README documents ${command}`);
  } else {
    fail(`README does not document ${command}`);
  }
}

if (failures.length) {
  console.error(`\nPublic tree verification failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nPublic tree verification passed.");
