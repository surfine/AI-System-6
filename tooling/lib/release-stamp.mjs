// The one byte-level difference between a development tree and a release tree.
//
// A release builds the app inside a frozen worktree with
// AI_SYSTEM6_SOURCE_COMMIT set to the commit it is releasing. That value is
// compiled into two TRACKED generated files:
//
//   apps/desktop/app/generated/build-info.js
//   apps/desktop/app/generated/build-info.json
//
// Both live under apps/, which the gate-input rule table gives to every ship
// gate. So a receipt banked during development — where the stamp is empty —
// carries a different input hash from the same gate in the frozen tree, and
// every one of the seven gates refuses itself with `input-mismatch`. Measured
// on this repository, those two files are the ONLY difference: with the stamp
// applied, 7398 gate-input files hash identically in both trees.
//
// The binding is right and must stay. The bytes really are different, and a
// hash that looked past them would be a hash that stops meaning anything.
//
// So the fix is on the other side: let a developer bank the bytes the release
// will actually test. `applyReleaseStamp` rebuilds the tree exactly as the
// release will build it, the gates run against those bytes, and the restore
// puts the working tree back to the committed bundle. Nothing is excused; the
// receipt simply describes the right thing.
//
// Stamping is refused on a dirty worktree. The stamp names a commit, and a
// tree with uncommitted work does not hold that commit's bytes — a receipt
// that said otherwise would be the kind of claim this whole mechanism exists
// to prevent.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const STAMPED_PATHS = Object.freeze([
  "apps/desktop/app/generated/build-info.js",
  "apps/desktop/app/generated/build-info.json",
]);

const BUILD_INFO_JSON = "apps/desktop/app/generated/build-info.json";

function git(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

/** The release identity currently compiled into the tree, or null when unreadable. */
export function releaseStampOf(root) {
  try {
    const info = JSON.parse(readFileSync(path.join(root, BUILD_INFO_JSON), "utf8"));
    return {
      version: String(info.version || ""),
      build: String(info.build || ""),
      sourceCommit: String(info.sourceCommit || ""),
    };
  } catch {
    return null;
  }
}

function buildApp(root, sourceCommit) {
  const env = { ...process.env };
  if (sourceCommit) env.AI_SYSTEM6_SOURCE_COMMIT = sourceCommit;
  else delete env.AI_SYSTEM6_SOURCE_COMMIT;
  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:app"], {
    cwd: root,
    stdio: "inherit",
    env,
  });
}

/**
 * Build the tree the way the release of HEAD will build it.
 *
 * Returns `{ ok, reason, sourceCommit, restore() }`. `restore()` rebuilds
 * without the stamp and reports whether the working tree came back clean; call
 * it in a `finally`, because a tree left stamped is a dirty tree and the
 * release preflight refuses to release from one.
 */
export function applyReleaseStamp(root) {
  const noop = { restore: () => ({ ok: true, reason: "nothing-to-restore" }) };
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  if (status.status !== 0) return { ...noop, ok: false, reason: "git-status-failed", sourceCommit: "" };
  if (status.stdout.trim() !== "") {
    return { ...noop, ok: false, reason: "worktree-not-clean", sourceCommit: "" };
  }
  const head = git(root, ["rev-parse", "HEAD"]);
  const sourceCommit = head.status === 0 ? head.stdout.trim() : "";
  if (!/^[0-9a-f]{40,64}$/.test(sourceCommit)) {
    return { ...noop, ok: false, reason: "no-head-commit", sourceCommit: "" };
  }
  const build = buildApp(root, sourceCommit);
  if (build.status !== 0) {
    return { ...noop, ok: false, reason: "stamped-build-failed", sourceCommit };
  }
  return {
    ok: true,
    reason: "stamped",
    sourceCommit,
    restore() {
      const rebuild = buildApp(root, "");
      if (rebuild.status !== 0) return { ok: false, reason: "unstamped-build-failed" };
      const after = git(root, ["status", "--porcelain=v1", "--untracked-files=normal"]);
      if (after.status !== 0) return { ok: false, reason: "git-status-failed" };
      if (after.stdout.trim() !== "") {
        return { ok: false, reason: `worktree-still-dirty:${after.stdout.trim().split("\n")[0]}` };
      }
      return { ok: true, reason: "restored" };
    },
  };
}

/** Why a stamp could not be applied, in words a person can act on. */
export function describeStampRefusal(reason) {
  if (reason === "worktree-not-clean") {
    return "the worktree has uncommitted changes, so it does not hold the bytes of any commit;"
      + " commit first, then bank.";
  }
  if (reason === "no-head-commit") return "HEAD does not name a commit.";
  if (reason === "stamped-build-failed") return "build:app failed with the release stamp set.";
  if (reason === "git-status-failed") return "git status could not be read.";
  return reason;
}
