#!/usr/bin/env node
// Keep a source Project Hard Disk honest about itself.
//
// The published copy is stamped by tooling/build-shared-project-disks.mjs, so a
// launch link always mounts a bundle whose hash matches. The SOURCE disk is the
// one a person opens by hand — dragged into the Import Utility, or read in an
// editor — and nothing restamped it: both disks in internal/ carried counts from
// an earlier life (dtk said 4 files while holding 11, 4 clips while holding 82)
// and a digest over those stale counts, so importing the source file was refused
// as "backup content has changed", and the ipad1 source had no integrity field
// at all.
//
//   node tooling/restamp-project-disks.mjs            # report only (default)
//   node tooling/restamp-project-disks.mjs --write    # rewrite counts + integrity
//
// --write also regenerates the published copy, because a source change that is
// not shipped is a link that mounts the old bytes.
//
// Contract: tests/features/shared-disk-sources.test.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHARED_DISKS, contentHashFor, countsFor, stableStringify } from "./lib/project-disk-integrity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const write = process.argv.includes("--write");

function sameShallow(left, right) {
  return stableStringify(left) === stableStringify(right);
}

// Both source disks are hand-readable JSON with two-space indentation and no
// trailing newline. Rewriting one in another style would bury the two fields
// this tool exists to change inside a whole-file diff, so the file's own shape
// is read first and kept.
function formattingOf(text) {
  const indent = /^\{\n( +)"/.exec(text)?.[1]?.length || 2;
  return { indent, trailingNewline: text.endsWith("\n") };
}

let drifted = 0;
for (const { route, source } of SHARED_DISKS) {
  const absolute = join(root, source);
  const text = readFileSync(absolute, "utf8");
  const bundle = JSON.parse(text);
  const counts = countsFor(bundle);
  const hash = contentHashFor(bundle);
  const countsMatch = sameShallow(bundle.counts || {}, counts);
  const hashMatches = String(bundle.integrity?.contentHash || "") === hash;
  if (countsMatch && hashMatches) {
    console.log(`OK  ${route}: ${source} is self-consistent (${hash.slice(0, 12)})`);
    continue;
  }
  drifted += 1;
  console.log(`NO  ${route}: ${source}`);
  if (!countsMatch) {
    const stale = Object.entries(bundle.counts || {})
      .filter(([key, value]) => counts[key] !== value)
      .map(([key, value]) => `${key} ${value}->${counts[key]}`);
    console.log(`      counts disagree with the arrays: ${stale.join(", ") || "missing counts"}`);
  }
  if (!hashMatches) {
    console.log(`      integrity.contentHash ${bundle.integrity?.contentHash ? "does not match the content" : "is missing"}`);
  }
  if (write) {
    const next = { ...bundle, counts, integrity: { algorithm: "SHA-256", contentHash: hash } };
    const shape = formattingOf(text);
    writeFileSync(absolute, JSON.stringify(next, null, shape.indent) + (shape.trailingNewline ? "\n" : ""), "utf8");
    console.log(`      restamped -> ${hash.slice(0, 12)}`);
  }
}

if (drifted && !write) {
  console.error(`\n${drifted} source disk(s) need restamping. Run: npm run disks:restamp`);
  process.exit(1);
}

if (write) {
  const rebuilt = spawnSync(process.execPath, [join(root, "tooling", "build-shared-project-disks.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  process.stdout.write(rebuilt.stdout || "");
  process.stderr.write(rebuilt.stderr || "");
  if (rebuilt.status !== 0) process.exit(rebuilt.status || 1);
}
