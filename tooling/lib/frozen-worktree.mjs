// Building the frozen release tree from bytes this machine already has.
//
// A release freezes the source at one commit in a detached `git worktree`, then
// fills it with the two things a worktree does not carry: the submodule
// checkouts and node_modules. Both were paid for long ago in the working
// directory beside it, and both were being paid for again:
//
//   git submodule update --init --recursive   ~28 s  (a network clone, because
//                                                     a linked worktree gets its
//                                                     own modules/ directory)
//   npm ci                                    ~18 s  (an isolated npm cache, so
//                                                     nothing is cached at all)
//
// Neither shortcut below decides that the work is unnecessary. The submodule
// seed gives git the objects locally and then lets `git submodule update` do
// its normal checkout, so git still proves the recorded commit is what lands.
// The dependency store hands back node_modules that a real `npm ci` produced on
// this machine, from this lock file — never the working directory's own
// node_modules, which drifts.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  cloneTree,
  fileDigest,
  lookupReleaseStep,
  releaseStepKey,
  saveReleaseStep,
} from "./release-cache.mjs";

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/** The submodule paths a tree declares, in .gitmodules order. */
export function submodulePaths(root) {
  const result = git(root, ["config", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"]);
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/).slice(1).join(" "))
    .filter(Boolean);
}

/** True when every submodule of the source tree is initialized and unmodified. */
export function submodulesAreClean(sourceRoot) {
  const status = git(sourceRoot, ["submodule", "status", "--recursive"]);
  if (status.status !== 0) return false;
  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  return lines.length > 0 && !lines.some((line) => /^[-+U]/.test(line));
}

/**
 * Put the source worktree's submodule object databases where the frozen
 * worktree will look for them.
 *
 * A linked worktree keeps its submodule git directories under its own
 * `.git/worktrees/<name>/modules/`, which is empty, so `git submodule update`
 * clones both submodules from GitHub every release. The objects are already on
 * this disk. Cloning the git directory across (copy-on-write, so it is free)
 * makes the later `git submodule update --init --recursive` a local checkout.
 *
 * This changes where the objects come from, never what is checked out: git
 * still resolves the commit the frozen index records, and still fetches from
 * the real remote if that commit is not among the seeded objects.
 *
 * Any failure removes the partial seed and returns the path to the slow route.
 */
export function seedSubmoduleGitdirs(sourceRoot, frozenRoot) {
  const seeded = [];
  const skipped = [];
  if (!submodulesAreClean(sourceRoot)) {
    return { seeded, skipped: submodulePaths(frozenRoot), reason: "source-submodules-not-clean" };
  }
  const frozenGitDir = git(frozenRoot, ["rev-parse", "--absolute-git-dir"]).stdout.trim();
  if (!frozenGitDir) return { seeded, skipped: submodulePaths(frozenRoot), reason: "no-frozen-gitdir" };
  for (const relative of submodulePaths(frozenRoot)) {
    const sourceModule = path.join(sourceRoot, relative);
    const destination = path.join(frozenGitDir, "modules", relative);
    if (existsSync(destination)) {
      skipped.push(relative);
      continue;
    }
    const sourceGitDir = git(sourceModule, ["rev-parse", "--absolute-git-dir"]).stdout.trim();
    if (!sourceGitDir || !existsSync(sourceGitDir)) {
      skipped.push(relative);
      continue;
    }
    try {
      mkdirSync(path.dirname(destination), { recursive: true });
      cloneTree(sourceGitDir, destination);
      // The copied config still points core.worktree at the source checkout.
      // Removing it lets `git submodule update` bind the git directory to the
      // frozen checkout instead.
      git(frozenRoot, ["config", "--file", path.join(destination, "config"), "--unset", "core.worktree"]);
      rmSync(path.join(destination, "index.lock"), { force: true });
      seeded.push(relative);
    } catch {
      rmSync(destination, { recursive: true, force: true });
      skipped.push(relative);
    }
  }
  return { seeded, skipped, reason: seeded.length ? "seeded-from-source" : "nothing-to-seed" };
}

/**
 * The key of one dependency install.
 *
 * npm reads the lock file and package.json; the result is bound to the npm and
 * Node builds that made it and to this platform, because some packages ship
 * compiled binaries. Nothing else decides what lands in node_modules.
 */
export function dependencyKey(root, treeRoot, npmVersion) {
  return releaseStepKey(root, "node-modules", {
    lock: fileDigest(path.join(treeRoot, "package-lock.json")),
    manifest: fileDigest(path.join(treeRoot, "package.json")),
    npm: String(npmVersion || ""),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  });
}

function npmVersionOf(cwd) {
  const result = spawnSync("npm", ["--version"], { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

/**
 * Install node_modules into a tree, from the store when the store holds an
 * install of exactly this lock file, and by a real `npm ci` when it does not.
 *
 * `step` separates the private repository's install from the public snapshot's:
 * they are different packages and must never answer for each other.
 */
export function installDependencies({
  cacheRoot,
  treeRoot,
  npmCacheDir = "",
  step = "node-modules",
  allowReuse = true,
  sourceCommit = "",
}) {
  const started = Date.now();
  const npmVersion = npmVersionOf(treeRoot);
  const key = dependencyKey(cacheRoot, treeRoot, npmVersion);
  if (allowReuse) {
    const found = lookupReleaseStep(cacheRoot, step, key);
    if (found.hit) {
      restoreDependencies(found.entry, found.payloadRoot, treeRoot);
      return {
        status: "reused",
        reason: found.reason,
        key,
        durationMs: Date.now() - started,
        originalDurationMs: found.entry.durationMs || 0,
        fileCount: found.entry.payload.fileCount,
      };
    }
  }
  const reason = allowReuse ? lookupReleaseStep(cacheRoot, step, key).reason : "no-reuse-requested";
  rmSync(path.join(treeRoot, "node_modules"), { recursive: true, force: true });
  const install = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: treeRoot,
    encoding: "utf8",
    env: npmCacheDir ? { ...process.env, NPM_CONFIG_CACHE: npmCacheDir } : process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (install.status !== 0) {
    return {
      status: "failed",
      reason,
      key,
      durationMs: Date.now() - started,
      output: install.stderr || install.stdout || "",
    };
  }
  const durationMs = Date.now() - started;
  const saved = saveReleaseStep(cacheRoot, step, key, {
    sourceRoot: treeRoot,
    roots: ["node_modules"],
    durationMs,
    sourceCommit,
    note: `npm ${npmVersion} ci`,
  });
  return {
    status: "ran",
    reason,
    key,
    durationMs,
    fileCount: saved.entry.payload.fileCount,
  };
}

function restoreDependencies(entry, payloadRoot, treeRoot) {
  mkdirSync(treeRoot, { recursive: true });
  cloneTree(path.join(payloadRoot, "node_modules"), path.join(treeRoot, "node_modules"));
}
