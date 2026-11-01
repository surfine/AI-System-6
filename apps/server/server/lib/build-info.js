// Version + build-stamp resolution. The generated identity written by
// tooling/lib/build-info.mjs (apps/desktop/app/generated/build-info.json) is the single
// source; package.json + build-info.json are only a development fallback for
// a server started without a prior build.
//
// Identity is split into stable and runtime halves. The generated file
// carries version / build / sourceCommit only — never a self-referential
// commit hash and never a generatedAt timestamp (ordinary builds would
// otherwise churn tracked files). snapshotCommit is resolved at runtime from
// the deployment environment (GITHUB_SHA / AI_SYSTEM6_SNAPSHOT_COMMIT) or a
// read-only git read, and generatedAt is a runtime timestamp, so nothing is
// baked into the published tree.

"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const desktopRoot = path.join(repoRoot, "apps", "desktop");

const packageInfo = (() => {
  try {
    return require(path.join(repoRoot, "package.json"));
  } catch {
    return /** @type {Record<string, any>} */ ({});
  }
})();

const buildInfo = (() => {
  try {
    return require(path.join(repoRoot, "build-info.json"));
  } catch {
    return /** @type {Record<string, any>} */ ({});
  }
})();

const generatedBuildInfo = (() => {
  try {
    return require(path.join(desktopRoot, "app/generated/build-info.json"));
  } catch {
    return null;
  }
})();

const releaseBuildOverride =
  process.env.AI_SYSTEM6_BUILD || process.env.BUILD_NUMBER || "";

const baseBuildStamp =
  releaseBuildOverride || buildInfo.build || "20260520.0";

/**
 * Determine the trailing development suffix to append to the build
 * stamp. Mirrors `readGitBuildSuffix` from the root server.js. An
 * explicit AI_SYSTEM6_BUILD / BUILD_NUMBER override suppresses the
 * suffix entirely. Packaged binaries also use the plain build stamp:
 * there is no repo metadata in pkg snapshots, and production test builds
 * should not report themselves as development builds by default.
 *
 * @returns {string}
 */
function readGitBuildSuffix() {
  if (releaseBuildOverride) return "";
  if (Reflect.get(process, "pkg")) return "";
  if (!existsSync(path.join(repoRoot, ".git"))) return "";
  try {
    const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!revision) return "";
    const dirty = execFileSync("git", ["status", "--short"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return `-dev+${revision}${dirty ? ".dirty" : ""}`;
  } catch {
    return "-dev";
  }
}

const appVersion =
  (generatedBuildInfo && generatedBuildInfo.version) ||
  packageInfo.version ||
  "0.0.0";
const appBuild =
  (generatedBuildInfo && generatedBuildInfo.build) ||
  `${baseBuildStamp}${readGitBuildSuffix()}`;
const appName = packageInfo.name || "ai-system-6";
const appSourceCommit = (generatedBuildInfo && generatedBuildInfo.sourceCommit) || "";
const appGeneratedAt = new Date().toISOString();

/**
 * The commit of the tree currently being served, resolved at runtime. Never
 * written into tracked generated files: the public snapshot's commit is
 * already known by git, CI exposes it as GITHUB_SHA, and deployments may
 * inject their own snapshot commit.
 *
 * @returns {string}
 */
function readRuntimeSnapshotCommit() {
  const explicitCommit =
    process.env.AI_SYSTEM6_SNAPSHOT_COMMIT
    || process.env.GITHUB_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || "";
  if (explicitCommit) return explicitCommit;
  if (!existsSync(path.join(repoRoot, ".git"))) return "";
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const appSnapshotCommit = readRuntimeSnapshotCommit();

module.exports = {
  appName,
  appVersion,
  appBuild,
  appSourceCommit,
  appSnapshotCommit,
  appGeneratedAt,
  repoRoot,
  desktopRoot,
};
