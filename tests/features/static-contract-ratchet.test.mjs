// Ratchet, not a feature contract about the app: this counts how many
// tests/features/*.test.mjs files are STATIC ONLY — they read source with
// assertIncludes/assertMatches (tests/helpers/feature-test-harness.mjs) and
// never execute real app code — and fails if that count rises above the
// budget in tooling/static-contract-budget.json. It mirrors the precedent in
// tooling/css-budget.json: a number that may only fall, with the file's own
// "_note" explaining how to lower or (rarely, with justification) raise it.
//
// Why this exists: 253 static contracts stayed green while 20 route commands
// were dead, a Finder list overflowed in all six eras, and Control Panel
// could not be typed into. A static contract reads the shape of the source —
// it cannot see whether the wiring it describes actually runs. Converting
// the whole suite in one pass was explicitly not the goal (see the lane's
// report); this ratchet is what keeps the conversion from stalling at
// today's three contracts once this task's session ends. Every new feature
// test should execute real app code — see the harnesses named in
// tooling/static-contract-budget.json — and every converted contract lowers
// this number by exactly one, verified in the same commit.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, forEachAstChild, parseJsSource, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("static-contract-ratchet");

const featureDir = join(root, "tests/features");
const budgetPath = join(root, "tooling/static-contract-budget.json");
const budget = JSON.parse(readFileSync(budgetPath, "utf8"));

// A file counts as "executing" if it reaches real app code through any of
// the shared VM harnesses, or builds its own VM directly with node:vm — the
// same union ~100 existing feature tests already use.
//
// Two files are infrastructure ABOUT the suite rather than contracts about
// the app, and are excluded from both sides of the count: this ratchet, and
// gate-self-proof, which builds each gate's own defect from a fixture or a
// temporary git repository and requires the gate to go red. Neither makes a
// claim about the product, so neither belongs in a budget that measures how
// much of the product is claimed without being executed. Every other file in
// tests/features/ is counted, whatever it does.
//
// The signal is read from the file's IMPORT SPECIFIERS, not from its text.
// A raw text search made the ratchet defeatable by a comment: writing
// `// this file does not use node:vm` in a purely static contract moved it
// into the executing column and bought a free slot under the budget. An
// import is the thing that actually reaches the app; a comment is not.
const executingSignal = /node:vm|boot-vm\.mjs|draft-desk-vm\.mjs|write-lease-vm\.mjs|backup-vm\.mjs|app-boot-vm\.mjs/;
const suiteInfrastructure = new Set([
  "static-contract-ratchet.test.mjs",
  "gate-self-proof.test.mjs",
]);

/** Every module specifier the file imports, static or dynamic. */
function importSpecifiers(source) {
  const specifiers = [];
  const visit = (node) => {
    if (
      (node.type === "ImportDeclaration"
        || node.type === "ExportNamedDeclaration"
        || node.type === "ExportAllDeclaration")
      && node.source?.type === "Literal"
    ) {
      specifiers.push(String(node.source.value));
    }
    if (node.type === "ImportExpression" && node.source?.type === "Literal") {
      specifiers.push(String(node.source.value));
    }
    if (
      node.type === "CallExpression"
      && node.callee?.type === "Identifier"
      && node.callee.name === "require"
      && node.arguments[0]?.type === "Literal"
    ) {
      specifiers.push(String(node.arguments[0].value));
    }
    forEachAstChild(node, visit);
  };
  visit(parseJsSource(source));
  return specifiers;
}

/**
 * Does the file SPAWN the real server and drive it over HTTP?
 *
 * That is the strongest form of what this ratchet asks for — a VM harness runs
 * the app's code, a spawned server runs the whole product including its
 * routing, its guards and its process boundary — and it has no import to read,
 * because the path is an argument. It is still taken from the syntax tree and
 * never from the text: a comment naming the same call must not buy a slot, the
 * way one did before the import rule landed.
 */
function spawnsRealServer(source) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (
      node.type === "CallExpression"
      && /^(spawn|spawnSync|fork|execFile|execFileSync)$/.test(node.callee?.name || "")
      && node.arguments.some((argument) => (
        (argument.type === "Literal" && /apps\/server\/server\.js$/.test(String(argument.value)))
        || (argument.type === "ArrayExpression" && argument.elements.some((element) => (
          element?.type === "Literal" && /apps\/server\/server\.js$/.test(String(element.value))
        )))
      ))
    ) {
      found = true;
      return;
    }
    forEachAstChild(node, visit);
  };
  visit(parseJsSource(source));
  return found;
}

function executesAppCode(source) {
  return importSpecifiers(source).some((specifier) => executingSignal.test(specifier))
    || spawnsRealServer(source);
}

function collectTestFiles(dir, base = "") {
  const out = [];
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const relative = join(base, entry.name);
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTestFiles(absolute, relative));
    else if (entry.name.endsWith(".test.mjs")) out.push(relative);
  });
  return out;
}

const allTestFiles = collectTestFiles(featureDir).filter((relative) => !suiteInfrastructure.has(relative));
test.assert(
  allTestFiles.length > 200,
  allTestFiles.length > 200
    ? `scanned ${allTestFiles.length} feature test files (sanity floor: 200, catches a broken scan rather than a small suite)`
    : `found only ${allTestFiles.length} feature test files — the scan looks broken, not the suite`
);

const staticOnlyFiles = allTestFiles.filter(
  (relative) => !executesAppCode(readFileSync(join(featureDir, relative), "utf8")),
);

test.assert(
  typeof budget.staticOnlyFeatureContracts === "number",
  "tooling/static-contract-budget.json declares staticOnlyFeatureContracts as a number"
);

test.assert(
  staticOnlyFiles.length <= budget.staticOnlyFeatureContracts,
  staticOnlyFiles.length > budget.staticOnlyFeatureContracts
    ? `static-only feature contracts rose from ${budget.staticOnlyFeatureContracts} to ${staticOnlyFiles.length} — convert the new one to execute real app code instead of adding another source-reading contract, or lower an existing one first`
    : `static-only feature contracts: ${staticOnlyFiles.length} (budget ${budget.staticOnlyFeatureContracts})`
);

// The budget must never go stale in the other direction either: if the real
// count already sits below the recorded budget, silently allowing that gap to
// keep widening hides how much conversion has actually happened. This does
// not fail the gate — only a rise does, matching css-budget.json's own
// rule — but it prints as a reminder rather than passing in silence.
if (staticOnlyFiles.length < budget.staticOnlyFeatureContracts) {
  test.ok(
    `budget could be lowered to ${staticOnlyFiles.length} (currently ${budget.staticOnlyFeatureContracts}) — edit tooling/static-contract-budget.json to record the conversion`
  );
}

test.finish();
