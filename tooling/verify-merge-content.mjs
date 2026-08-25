#!/usr/bin/env node
// Merge-content gate: a merge can silently drop one side's work and stay
// invisible afterwards, because a merge whose result equals one parent is
// simplified away by git log (real incident: 337dac6d's Theme Lab was an
// ancestor of main while main carried the pre-337dac6d bytes; see 504a2b20).
//
// Two modes, because the incident taught us one check is not enough:
//
//   --merge <sha>       Check ONE merge commit at the moment it exists: for
//                       each parent, list the paths whose change (vs the
//                       merge base) is absent from the result while the
//                       other parent's version won. Run this right after
//                       creating a merge, before pushing.
//
//   --survived <ref>    Check that <ref>'s work is still present in --into
//                       (default HEAD), no matter how many merges happened
//                       in between. A path REGRESSED when the target's blob
//                       equals the pre-branch base blob while <ref> changed
//                       it. This catches the hidden-culprit case where no
//                       surviving merge shows the discard.
//
//   --scan --since <d>  Run the --merge predicate over every merge commit
//                       since <d> (archaeology / periodic sweep).
//
// Intentional resolutions are acknowledged per path with --accept <path>
// (repeatable). Exit is non-zero only for unacknowledged findings.
//
// Limitation: identity is by path; a rename across the merge is reported as
// delete+add. Verify renames by hand.

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
function takeFlag(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  args.splice(index, 2);
  return value ?? null;
}
function takeAll(name) {
  const values = [];
  let value;
  while ((value = takeFlag(name)) !== null) values.push(value);
  return values;
}
function hasFlag(name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

const mergeTarget = takeFlag("--merge");
const survivedRef = takeFlag("--survived");
const intoRef = takeFlag("--into") || "HEAD";
const baseOverride = takeFlag("--base");
const scanMode = hasFlag("--scan");
const since = takeFlag("--since") || "30 days ago";
const accepted = new Set(takeAll("--accept"));
const pathFilter = (takeFlag("--paths") || "").split(",").map((p) => p.trim()).filter(Boolean);
const quiet = hasFlag("--quiet");

function git(...cmd) {
  return execFileSync("git", cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function blobOf(commit, path) {
  try {
    const line = git("ls-tree", commit, "--", path);
    if (!line) return null; // path absent at this commit
    return line.split(/\s+/)[2] || null;
  } catch {
    return null;
  }
}

function changedPaths(from, to) {
  const out = git("diff", "--name-only", `${from}..${to}`);
  const paths = out ? out.split("\n") : [];
  return pathFilter.length
    ? paths.filter((p) => pathFilter.some((f) => p === f || p.startsWith(f)))
    : paths;
}

function shortLog(commit) {
  return git("log", "-1", "--format=%h %ad %s", "--date=short", commit);
}

let findings = 0;
function report(kind, path, detail) {
  if (accepted.has(path)) {
    if (!quiet) console.log(`OK  ${path} — ${kind} acknowledged via --accept`);
    return;
  }
  findings += 1;
  console.log(`NO  ${kind}  ${path}${detail ? `  (${detail})` : ""}`);
}

// --- mode: one merge commit --------------------------------------------------

function checkMerge(merge) {
  let parents;
  try {
    parents = git("log", "-1", "--format=%P", merge).split(/\s+/).filter(Boolean);
  } catch {
    console.error(`NO  cannot resolve ${merge}`);
    process.exitCode = 1;
    return;
  }
  if (parents.length < 2) {
    if (!quiet) console.log(`OK  ${merge} is not a merge commit; nothing to check.`);
    return;
  }
  if (parents.length > 2) {
    console.log(`NO  ${merge} is an octopus merge (${parents.length} parents); check it by hand.`);
    findings += 1;
    return;
  }
  const [p1, p2] = parents;
  const base = git("merge-base", p1, p2);
  if (!quiet) {
    console.log(`Checking merge ${shortLog(merge)}`);
    console.log(`  side 1: ${shortLog(p1)}`);
    console.log(`  side 2: ${shortLog(p2)}`);
  }
  const sides = [
    { own: p1, other: p2, label: "side-1 change lost to side 2" },
    { own: p2, other: p1, label: "side-2 change lost to side 1" },
  ];
  for (const side of sides) {
    for (const path of changedPaths(base, side.own)) {
      const atMerge = blobOf(merge, path);
      const atOwn = blobOf(side.own, path);
      const atOther = blobOf(side.other, path);
      if (atMerge === atOwn) continue; // this side's version survived
      if (atMerge !== atOther) continue; // a real content merge happened
      // The result is byte-identical to the OTHER parent while this side
      // changed the path: this side's change is not in the merge at all.
      report(side.label, path, `result kept ${side.other.slice(0, 8)}'s bytes`);
    }
  }
}

// --- mode: did a ref's work survive into a descendant? ------------------------

function checkSurvived(ref, into) {
  // "The ref's work" is everything since it diverged from the target. When
  // the ref is already an ancestor of the target (the incident's exact
  // shape: the commit is in the history), the divergence point collapses to
  // the ref itself — fall back to the ref's own parent so we check the
  // commit's own changes. --base overrides both.
  let base = baseOverride ? git("rev-parse", baseOverride) : git("merge-base", ref, into);
  if (!baseOverride && base === git("rev-parse", ref)) base = git("rev-parse", `${ref}^`);
  if (!quiet) {
    console.log(`Checking that ${shortLog(ref)}`);
    console.log(`  survives into ${shortLog(into)}  (base ${base.slice(0, 8)})`);
  }
  let survived = 0;
  let evolved = 0;
  for (const path of changedPaths(base, ref)) {
    const atBase = blobOf(base, path);
    const atRef = blobOf(ref, path);
    const atInto = blobOf(into, path);
    if (atInto === atRef) { survived += 1; continue; }
    if (atInto !== atBase) { evolved += 1; continue; } // moved past the ref's version
    // Target carries the PRE-branch bytes while the branch changed the path:
    // the work is in the history but not in the tree.
    report("REGRESSED to pre-branch content", path, `tree matches base ${base.slice(0, 8)}, not ${ref.slice(0, 8)}`);
  }
  if (!quiet) console.log(`  ${survived} path(s) survived exactly, ${evolved} evolved further.`);
}

// --- mode: sweep all merges ----------------------------------------------------

function scanMerges() {
  const merges = git("rev-list", "--merges", `--since=${since}`, "HEAD").split("\n").filter(Boolean);
  if (!quiet) console.log(`Scanning ${merges.length} merge(s) since ${since}…`);
  for (const merge of merges) checkMerge(merge);
}

if (scanMode) scanMerges();
else if (survivedRef) checkSurvived(survivedRef, intoRef);
else if (mergeTarget) checkMerge(mergeTarget);
else {
  console.log("Usage: verify-merge-content.mjs --merge <sha> | --survived <ref> [--into <ref>] | --scan [--since <date>]");
  console.log("       [--paths a,b] [--accept <path>]... [--quiet]");
  process.exitCode = 2;
}

if (findings > 0) {
  console.log(`NO  ${findings} discarded-content finding(s). A merge kept one side's bytes while the other side changed the path.`);
  process.exitCode = 1;
} else if (!process.exitCode && !quiet) {
  console.log("OK  merge content verified.");
}
