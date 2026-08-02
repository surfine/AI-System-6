// Version + build-stamp resolution. Mirrors the logic in the root
// server.js so /api/version returns the same shape on this port. The
// repository root, package.json, and build-info.json all live one
// directory above src/.

"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");

const repoRoot = path.resolve(__dirname, "..", "..", "..");

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

const appVersion = packageInfo.version || "0.0.0";
const appBuild = `${baseBuildStamp}${readGitBuildSuffix()}`;
const appName = packageInfo.name || "ai-system-6";

module.exports = {
  appName,
  appVersion,
  appBuild,
  repoRoot,
};
