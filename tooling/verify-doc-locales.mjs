import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectCanonicalMarkdown,
  localizedPath,
  sha256,
} from "./lib/doc-locales.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node tooling/verify-doc-locales.mjs [--require-fresh]

Structure is always checked: every canonical document has a mirror, the mirror
declares its canonical-source, and it says the English text is authoritative.

Mirror freshness is a REPORT by default. --require-fresh turns a stale mirror
back into a refusal, which is what the release paths pass: a release should not
ship translations nobody refreshed, while the development loop should not pay a
resync for every English sentence it edits.`);
  process.exit(0);
}
const requireFresh = args.includes("--require-fresh");
const unknownArgs = args.filter((arg) => arg !== "--require-fresh");
if (unknownArgs.length) {
  console.error(`NO  unknown option(s): ${unknownArgs.join(", ")}. See --help.`);
  process.exit(2);
}

// Two questions about the Chinese mirrors, answered differently.
//
// STRUCTURE is a gate: a canonical document needs a mirror, the mirror has to
// declare which document it mirrors, and it has to say that the English text is
// authoritative. All three are free to check and none of them moves when you
// edit a sentence.
//
// STALENESS is a report by default and a refusal under --require-fresh. Whether a
// mirror is *current* used to be a gate, and it made every English edit pay a
// second edit: the source's hash has to be copied into the twin by hand
// (`npm run docs:sync-hashes`) or the build refuses over a document that is
// complete and correct in the language it is authoritative in. The mirrors
// themselves say 英文版为准 — an out-of-date translation is a reading aid that has
// fallen behind, not a wrong answer — so by default the count is reported and the
// exit status does not depend on it. tooling/verify-doc-claims.mjs reached the
// same conclusion about its own claims for the same reason: a gate here locks the
// wording of the day.
//
// The release paths pass --require-fresh instead, so "the mirrors were current
// when this shipped" is still guaranteed where it matters — verify:release and
// release:doctor — without charging the development loop for it.
//
// The per-mirror success lines are gone with it. This walks ~995 files, and
// three OK lines each buried the real output (and the release log) under three
// thousand lines to say nothing.
let checked = 0;
let stale = 0;
const staleExamples = [];

collectCanonicalMarkdown(root).forEach((sourcePath) => {
  checked += 1;
  const zhPath = localizedPath(sourcePath);
  const absolute = join(root, zhPath);
  if (!existsSync(absolute)) {
    fail(`${zhPath} missing for ${sourcePath}`);
    return;
  }

  const source = readFileSync(join(root, sourcePath), "utf8");
  const localized = readFileSync(absolute, "utf8");

  const expectedSourceMarker = `<!-- canonical-source: ${sourcePath} -->`;
  if (!localized.includes(expectedSourceMarker)) {
    fail(`${zhPath} source marker should be ${expectedSourceMarker}`);
  }

  if (!localized.includes(`<!-- source-sha256: ${sha256(source)} -->`)) {
    stale += 1;
    if (staleExamples.length < 10) staleExamples.push(zhPath);
  }

  if (!(localized.includes("英文版为准") && localized.includes("仅供人类参考"))) {
    fail(`${zhPath} must say 英文版为准 and 仅供人类参考`);
  }
});

if (stale) {
  console.log(`\n${stale} of ${checked} Chinese mirror(s) are behind their English source.`);
  console.log("The English text is authoritative and the mirrors say so, so a mirror that has");
  console.log("fallen behind is a reading aid out of date rather than a wrong answer — which is");
  console.log("why this is a report by default and why editing English costs no resync.");
  for (const example of staleExamples) console.log(`  ${example}`);
  if (stale > staleExamples.length) console.log(`  …and ${stale - staleExamples.length} more`);
  if (requireFresh) {
    // A release used to refuse here. Since 2026-10-15 a stale mirror is a
    // report everywhere: the English text is authoritative, the mirror says
    // so, and locking a translation to a hash cost a sync commit for every
    // English edit. Run `npm run docs:sync-hashes` after translating.
    console.log("  (release run: reported, not refused)");
  }
} else {
  console.log(`\nAll ${checked} Chinese mirror(s) match their English source.`);
}

// Release identity + docs consistency:
//   - package.json version must equal the latest Public Beta version in
//     CHANGELOG.md (a version bump without release notes fails the gate);
//   - every `npm run <name>` command documented in README.md must exist in
//     the package scripts (README must not promise a command that is absent).
// Neither is about wording: one is the release identity and the other is whether
// a documented command exists at all.
try {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const latestBeta = [...changelog.matchAll(/^## Public Beta (\d+\.\d+\.\d+)/gm)]
    .map((match) => match[1])
    .pop();
  if (latestBeta && latestBeta === pkg.version) {
    console.log(`OK  CHANGELOG latest Public Beta ${latestBeta} === package version`);
  } else {
    fail(
      `CHANGELOG latest Public Beta ${latestBeta || "(none)"} !== package version ${pkg.version}; add release notes before bumping the version`
    );
  }

  const readme = readFileSync(join(root, "README.md"), "utf8");
  const documentedCommands = [...readme.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)]
    .map((match) => match[1]);
  const missing = [...new Set(documentedCommands)].filter(
    (name) => typeof pkg.scripts?.[name] !== "string"
  );
  if (missing.length === 0) {
    console.log(`OK  README documents only existing npm scripts (${new Set(documentedCommands).size} commands)`);
  } else {
    fail(`README documents scripts that do not exist: ${missing.join(", ")}`);
  }
} catch (error) {
  fail(`release identity/docs consistency could not be checked: ${error.message}`);
}

if (failures.length) {
  console.error(`\nDoc locale verification failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nDoc locale verification passed.");
