// Duplicate top-level declaration gate.
//
// The browser app is a classic concatenated script: every module shares one
// top-level scope, so a file that declares the same function name twice lets
// the later declaration silently override the earlier one — exactly what
// happened to Desktop Maintenance's two runDesktopMaintenance() bodies. This
// gate parses each app source file with the TypeScript AST (available through
// the repo's devDependencies in both the private and public trees) and fails
// any file that declares the same function twice in the same scope. The
// named high-risk entry points are additionally pinned to exactly one
// declaration across the whole app.

import ts from "typescript";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("duplicate-declarations");

function walkFiles(dir, extension) {
  const out = [];
  for (const entry of readdirSync(resolveProjectPath(dir))) {
    const full = join(dir, entry);
    if (statSync(resolveProjectPath(full)).isDirectory()) {
      out.push(...walkFiles(full, extension));
    } else if (entry.endsWith(extension)) {
      out.push(full);
    }
  }
  return out;
}

function isFunctionNode(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

/**
 * Names of function declarations repeated in the same scope (nested function
 * scopes with the same name are legitimate shadowing and are ignored).
 * @param {string} source
 * @returns {string[]}
 */
function duplicateNamesInSameScope(source) {
  const sourceFile = ts.createSourceFile("inline.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const counts = new Map();
  const duplicates = [];
  function walk(node, inFunction) {
    if (ts.isFunctionDeclaration(node) && node.name && !inFunction) {
      const name = node.name.text;
      const next = (counts.get(name) || 0) + 1;
      counts.set(name, next);
      if (next === 2) duplicates.push(name);
    }
    const nextInFunction = inFunction || isFunctionNode(node);
    ts.forEachChild(node, (child) => walk(child, nextInFunction));
  }
  walk(sourceFile, false);
  return duplicates;
}

/** @param {string} source */
function topLevelFunctionNames(source) {
  const sourceFile = ts.createSourceFile("inline.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = [];
  function walk(node, inFunction) {
    if (ts.isFunctionDeclaration(node) && node.name && !inFunction) names.push(node.name.text);
    ts.forEachChild(node, (child) => walk(child, inFunction || isFunctionNode(node)));
  }
  walk(sourceFile, false);
  return names;
}

const appFiles = [...walkFiles("app", ".js"), "app.js"];
let anyDuplicate = false;
for (const relativePath of appFiles) {
  const duplicates = duplicateNamesInSameScope(read(relativePath));
  if (duplicates.length) anyDuplicate = true;
  test.assert(
    duplicates.length === 0,
    `${relativePath} declares each function name once in its scope${duplicates.length ? ` (duplicated: ${duplicates.join(", ")})` : ""}`
  );
}
test.assert(anyDuplicate === false, "no app source file declares a duplicate top-level function");

const maintenanceSource = read("app/core/desktop-maintenance.js");
const maintenanceNames = topLevelFunctionNames(maintenanceSource);
test.assert(
  maintenanceNames.filter((name) => name === "runDesktopMaintenance").length === 1,
  "app/core/desktop-maintenance.js declares runDesktopMaintenance exactly once"
);

// High-risk global entry points: each must be declared exactly once across
// the entire app bundle so no later file silently overrides an earlier one.
const guardedNames = ["runDesktopMaintenance", "saveDeskState", "openWritingStudio", "retrieveContext"];
const declarationCounts = new Map(guardedNames.map((name) => [name, 0]));
for (const relativePath of appFiles) {
  for (const name of topLevelFunctionNames(read(relativePath))) {
    if (declarationCounts.has(name)) declarationCounts.set(name, declarationCounts.get(name) + 1);
  }
}
for (const name of guardedNames) {
  test.assert(
    declarationCounts.get(name) === 1,
    `${name} is declared exactly once across the app bundle (found ${declarationCounts.get(name)})`
  );
}

// Core store commit facade: exactly five stores, each with a single commit
// entry, so no store silently ends up with two conflicting commit paths.
const storeSource = read("app/core/state-stores.js");
const commitDefinitions = storeSource.match(/commit\(updater\)/g) || [];
test.assert(
  commitDefinitions.length === 5,
  `state-stores.js defines exactly five store commits (found ${commitDefinitions.length})`
);
for (const storeName of ["projects", "writing", "context", "runs", "desktop"]) {
  test.assert(
    storeSource.includes(`${storeName}: {`),
    `state-stores.js exposes the ${storeName} store`
  );
}

test.finish();
