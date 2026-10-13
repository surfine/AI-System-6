#!/usr/bin/env node

/**
 * Set the release identity in ONE place and regenerate every surface derived
 * from it.
 *
 * The identity is two values, each with exactly one source:
 *
 *   version   package.json          (npm identity)
 *   build     build-info.json       (YYYYMMDD.N stamp)
 *
 * Everything else that reports or caches them is DERIVED and is written by
 * this command, never by hand:
 *
 *   apps/desktop/app/generated/build-info.{js,json}   (tooling/lib/build-info.mjs)
 *   apps/desktop/index.html ?v= cache-busters         (same)
 *   apps/desktop/styles*.css ?v= asset urls           (css-asset-stamp.mjs)
 *   site/zh-CN.html                                   (site/build-zh-page.mjs)
 *
 * A renumber used to be a hand sweep across ~20 files in two commits, and the
 * surfaces it missed refused the release afterwards ("the 1.0.58 renumber
 * reaches the ad-hoc gate, the Chinese page and the zh shell README"). This
 * command exists so the mechanical half is one action, and so the half a human
 * still owns is NAMED rather than remembered.
 *
 * Usage:
 *   npm run version:set -- 1.0.59
 *   npm run version:set -- 1.0.59 --build 20261013.1
 *   npm run version:set -- --build 20261013.2        # stamp only, version stays
 *   npm run version:set -- 1.0.59 --dry-run          # say what would change
 *
 * It does NOT touch changelogs, release notes, handoffs or front-door copy:
 * those are written by a person about a specific release. After it runs, the
 * remaining occurrences of the old identity are printed, grouped that way.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBuildInfo, generatedJsonPath } from "./lib/build-info.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktopRoot = join(root, "apps", "desktop");

const args = process.argv.slice(2);
let nextVersion = null;
let nextBuild = null;
let dryRun = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--dry-run") dryRun = true;
  else if (arg === "--help" || arg === "-h") {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8")
      .split("\n").filter((line) => line.startsWith(" *") || line.startsWith("/**")).join("\n"));
    process.exit(0);
  } else if (arg === "--build") {
    nextBuild = args[index + 1];
    index += 1;
  } else if (arg.startsWith("--")) {
    console.error(`NO  unknown option ${arg}. See --help.`);
    process.exit(2);
  } else if (nextVersion === null) {
    nextVersion = arg;
  } else {
    console.error(`NO  unexpected extra argument ${arg}.`);
    process.exit(2);
  }
}

if (nextVersion && !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error(`NO  version must be x.y.z; received ${nextVersion}.`);
  process.exit(2);
}
if (nextBuild && !/^\d{8}\.\d+$/.test(nextBuild)) {
  console.error(`NO  build must be YYYYMMDD.N; received ${nextBuild}.`);
  process.exit(2);
}
if (!nextVersion && !nextBuild) {
  console.error("NO  nothing to do: pass a version, a --build stamp, or both. See --help.");
  process.exit(2);
}

const packagePath = join(root, "package.json");
const buildInfoPath = join(root, "build-info.json");

const packageText = readFileSync(packagePath, "utf8");
const currentVersion = (packageText.match(/^\s{2}"version":\s*"([^"]+)"/m) || [])[1];
if (!currentVersion) {
  console.error("NO  package.json has no top-level version to read.");
  process.exit(1);
}
const currentBuild = existsSync(buildInfoPath)
  ? (JSON.parse(readFileSync(buildInfoPath, "utf8")).build || "")
  : "";

const targetVersion = nextVersion || currentVersion;
const targetBuild = nextBuild || currentBuild;

if (targetVersion === currentVersion && targetBuild === currentBuild) {
  console.log(`OK  already ${currentVersion} · build ${currentBuild}; nothing to change.`);
  process.exit(0);
}

console.log(`${dryRun ? "would set" : "setting"} version ${currentVersion} -> ${targetVersion}, build ${currentBuild} -> ${targetBuild}`);

// --- 1. the two sources -----------------------------------------------------
if (targetVersion !== currentVersion) {
  if (!dryRun) {
    const nextText = packageText.replace(
      /^(\s{2}"version":\s*)"[^"]+"/m,
      `$1"${targetVersion}"`,
    );
    if (nextText === packageText) {
      console.error("NO  could not rewrite the top-level version in package.json; refusing.");
      process.exit(1);
    }
    writeFileSync(packagePath, nextText, "utf8");
  }
  console.log(`  ${dryRun ? "would write" : "wrote"}  package.json`);
}

if (targetBuild !== currentBuild) {
  if (!dryRun) writeFileSync(buildInfoPath, `${JSON.stringify({ build: targetBuild }, null, 2)}\n`, "utf8");
  console.log(`  ${dryRun ? "would write" : "wrote"}  build-info.json`);
}

// --- 2. generated identity surfaces ----------------------------------------
// generateBuildInfo reads both sources itself, so it must run after they are
// written. In --dry-run it would read the OLD values, so skip it and just say.
if (!dryRun) {
  // generateBuildInfo takes sourceCommit from AI_SYSTEM6_SOURCE_COMMIT and
  // writes "" when the environment supplies none — which is right for an
  // ordinary dev build, and wrong here: a renumber must move the version and
  // the stamp and NOTHING else, so a tree carrying a release-stamped commit
  // keeps it. Carry the existing value through when the environment is silent.
  const priorPath = join(desktopRoot, generatedJsonPath);
  if (!process.env.AI_SYSTEM6_SOURCE_COMMIT && existsSync(priorPath)) {
    try {
      const prior = JSON.parse(readFileSync(priorPath, "utf8")).sourceCommit;
      if (prior) process.env.AI_SYSTEM6_SOURCE_COMMIT = prior;
    } catch { /* an unreadable artifact is regenerated from scratch, not preserved */ }
  }
  const info = generateBuildInfo({ root, outputRoot: desktopRoot });
  console.log(`  wrote  apps/desktop/app/generated/build-info.{js,json} (v${info.version} b${info.build})`);
  console.log("  wrote  apps/desktop/index.html ?v= cache-busters");
} else {
  console.log("  would write  apps/desktop/app/generated/build-info.{js,json}");
  console.log("  would write  apps/desktop/index.html ?v= cache-busters");
}

// --- 3. stylesheet asset stamps --------------------------------------------
// build:app stamps these too, but a stamp commit must not depend on a full
// bundle build to keep them from going stale.
//
// Only TRACKED sheets are touched: build:app writes gitignored lazy style
// bundles beside them (styles.aqua.css and friends), and restamping a generated
// file is work the next build throws away. A stamp commit carries the tracked
// ones, which today is a single sheet (styles.endfield-terminal.css, whose
// @font-face url carries the stamp).
function stampedStylesheets() {
  const listed = spawnSync("git", ["-C", root, "ls-files", "--", "apps/desktop/styles*.css"], { encoding: "utf8" });
  if (listed.status !== 0) return [];
  return listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith(".bundle.css"))
    .map((rel) => join(root, rel))
    .filter((abs) => readFileSync(abs, "utf8").includes("?v="));
}

if (targetBuild !== currentBuild) {
  const sheets = stampedStylesheets();
  let changed = 0;
  for (const abs of sheets) {
    const source = readFileSync(abs, "utf8");
    const next = source.replace(/\?v=[^"')\s]*/g, `?v=${targetBuild}`);
    if (next !== source) {
      changed += 1;
      if (!dryRun) writeFileSync(abs, next, "utf8");
    }
  }
  console.log(`  ${dryRun ? "would restamp" : "restamped"}  ${changed} of ${sheets.length} stylesheet(s) to ?v=${targetBuild}`);
}

// --- 4. the English front page, then the page generated from it ------------
// site/index.html names the release in one FAQ sentence. The Chinese copy map
// carries that version as a token, so this page is the last place the literal
// lives; moving it is what keeps site:check from refusing after a renumber.
const siteIndexPath = join(root, "site", "index.html");
if (targetVersion !== currentVersion && existsSync(siteIndexPath)) {
  const source = readFileSync(siteIndexPath, "utf8");
  const mentions = source.split(currentVersion).length - 1;
  if (mentions > 0) {
    if (!dryRun) writeFileSync(siteIndexPath, source.split(currentVersion).join(targetVersion), "utf8");
    console.log(`  ${dryRun ? "would update" : "updated"}  site/index.html (${mentions} mention(s))`);
  }
}

// site/build-zh-page.mjs reads the version out of package.json, so it must run
// after step 1. It normalizes the version out of its copy map, so a renumber no
// longer strands a translation key. --dry-run asks it to CHECK rather than
// write, so a dry run leaves the tree alone.
const zhCheck = spawnSync(
  process.execPath,
  [join(root, "site", "build-zh-page.mjs"), ...(dryRun ? ["--check"] : [])],
  { cwd: root, encoding: "utf8" },
);
if (dryRun) {
  console.log("  would rebuild  site/zh-CN.html");
} else if (zhCheck.status === 0) {
  console.log("  rebuilt  site/zh-CN.html");
} else {
  console.error(`NO  site/build-zh-page.mjs failed:\n${zhCheck.stderr || zhCheck.stdout}`);
  process.exit(1);
}

// --- 5. what a person still owns -------------------------------------------
function trackedFilesContaining(needle) {
  if (!needle) return [];
  const result = spawnSync("git", ["-C", root, "grep", "-l", "-F", "--", needle], { encoding: "utf8" });
  if (result.status !== 0 && result.status !== 1) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

// Files this command just wrote. Anything else still naming the old identity is
// either a person's record of the release or a surface nobody has told us about.
const derived = /^(apps\/desktop\/app\/generated\/build-info\.|apps\/desktop\/index\.html$|apps\/desktop\/styles[^/]*\.css$|site\/(index|zh-CN)\.html$|build-info\.json$|package\.json$)/;
const generated = new Set([
  ...trackedFilesContaining(currentVersion).filter((file) => derived.test(file)),
  ...trackedFilesContaining(currentBuild).filter((file) => derived.test(file)),
]);

const stale = new Set([
  ...(targetVersion !== currentVersion
    ? trackedFilesContaining(currentVersion)
    : trackedFilesContaining(targetBuild ? currentBuild : currentVersion)),
]);
const byHand = [...stale]
  .filter((file) => !derived.test(file))
  // A file this command wrote still holds the NEW value, so it cannot appear in
  // `stale`; the filter above is a belt-and-braces for the generated page.
  .filter((file) => !generated.has(file))
  .sort();

// A release's own records are the ones a person must write about THIS release.
// Everything else that still names the old identity is history — a spec, a
// handoff, a ledger row, a comment — and is normally left exactly as written.
const releaseRecord = /^(README(\.zh-CN)?\.md$|CHANGELOG(\.zh-CN)?\.md$|internal\/operations\/(RELEASE-NOTES|MAC-NOTARIZATION)(\.zh-CN)?\.md$|platform\/macos\/tinyjs\/README(\.zh-CN)?\.md$)/;
const records = byHand.filter((file) => releaseRecord.test(file));
const incidental = byHand.filter((file) => !releaseRecord.test(file));

console.log("");
if (!byHand.length) {
  console.log("OK  every derived surface moved, and no other tracked file names the previous identity.");
} else {
  if (records.length) {
    console.log(`This release's records — ${records.length} file(s) a person must still write:\n`);
    for (const file of records) console.log(`  ${file}`);
    console.log("");
  }
  if (incidental.length) {
    console.log(`Incidental mentions — ${incidental.length} file(s); normally left as written:`);
    console.log("a spec, a handoff, a ledger row or a code comment that names the release it");
    console.log("described. Change one only if this release is genuinely about it.\n");
    for (const file of incidental) console.log(`  ${file}`);
    console.log("");
  }
}

if (dryRun) {
  console.log("\n(dry run: nothing was written)");
} else {
  console.log("\nNext: npm run build:app to rebuild the bundles, then npm run verify:version.");
}
