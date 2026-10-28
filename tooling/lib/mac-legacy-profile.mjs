// The Intel/Monterey legacy build line: one description shared by the payload
// builder, the app bundler, the Mach-O gate and the contract that locks it.
//
// The target is a 2017 12-inch MacBook (Core m3, macOS Monterey 12.7.6). The
// mainline app ships TinyJS (arm64, macOS 15+) and Node 24 (minos 13.5); none
// of that runs there. This line ships the old Swift WKWebView shell built for
// x86_64-apple-macosx12.0 and the official Node 22 LTS build for darwin-x64.
// Node 22 is the floor because pdfjs-dist 6 declares >=22.13 and
// apps/browse/relay-node.js needs require(esm). Node 22 reaches end of life on
// 2027-04-30; after that the line is frozen or runs on an unpatched runtime.
//
// The bundle id and the server origin stay those of the mainline shell, which
// are also those of the June 2026 Intel build, so the WKWebView data store that
// holds the writer's old projects is picked up as it is.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const MAC_LEGACY_X64 = Object.freeze({
  name: "legacy-x64",
  swiftTriple: "x86_64-apple-macosx12.0",
  deploymentTarget: "12.0",
  machoArch: "x86_64",
  npmCpu: "x64",
  nodePlatformArch: "darwin-x64",
  // Pinned so a rebuild ships the runtime that was tested. Move it within
  // [nodeFloor, nodeMajorCeiling) only.
  nodeVersion: "22.23.3",
  nodeFloor: [22, 13],
  nodeMajorCeiling: 23,
  maxMinos: "12.0",
  bundleId: "local.aisystem6.beta.shell",
  serverOrigin: "http://127.0.0.1:4173",
  payloadDir: "dist/mac-server-payload-legacy-x64",
  outputDir: "dist/mac-legacy-x64",
  appDisplayName: "AI System 6 Beta",
});

/** "12.0" -> [12, 0, 0]; compares dotted versions numerically. */
export function compareVersions(left, right) {
  const a = String(left).replace(/^v/, "").split(".").map(Number);
  const b = String(right).replace(/^v/, "").split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function nodeVersionInRange(version, profile = MAC_LEGACY_X64) {
  const [major, minor] = String(version).replace(/^v/, "").split(".").map(Number);
  if (!(major < profile.nodeMajorCeiling)) return false;
  return compareVersions(`${major}.${minor}`, profile.nodeFloor.join(".")) >= 0;
}

/** The version an extracted official Node tarball declares, read without running it. */
export function nodeDistVersion(distDir) {
  const header = join(distDir, "include", "node", "node_version.h");
  if (!existsSync(header)) return "";
  const text = readFileSync(header, "utf8");
  const part = (name) => text.match(new RegExp(`#define ${name} (\\d+)`))?.[1];
  const parts = [part("NODE_MAJOR_VERSION"), part("NODE_MINOR_VERSION"), part("NODE_PATCH_VERSION")];
  return parts.every(Boolean) ? `v${parts.join(".")}` : "";
}

/**
 * Fetch (once) and unpack the official Node build for one platform-arch into
 * .cache/node-legacy/, checking it against nodejs.org's SHASUMS256.txt. An x64
 * runtime cannot be executed on an Apple Silicon Mac without Rosetta, so the
 * version comes from the tarball's own header rather than `node --version`.
 */
export function fetchOfficialNode(repoRoot, platformArch, profile = MAC_LEGACY_X64) {
  const version = `v${profile.nodeVersion}`;
  const base = `node-${version}-${platformArch}`;
  const cacheDir = join(repoRoot, ".cache", "node-legacy");
  const distDir = join(cacheDir, base);
  const binary = join(distDir, "bin", "node");
  if (existsSync(binary) && nodeDistVersion(distDir) === version) return { distDir, binary, version };

  mkdirSync(cacheDir, { recursive: true });
  const tarball = join(cacheDir, `${base}.tar.gz`);
  const sums = join(cacheDir, `SHASUMS256-${version}.txt`);
  const fetch = (url, out) => {
    const result = spawnSync("curl", ["-sSfL", "--retry", "2", "-o", out, url], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Download failed: ${url}`);
  };
  if (!existsSync(sums)) fetch(`https://nodejs.org/dist/${version}/SHASUMS256.txt`, sums);
  if (!existsSync(tarball)) fetch(`https://nodejs.org/dist/${version}/${base}.tar.gz`, tarball);
  const expected = readFileSync(sums, "utf8")
    .split("\n")
    .find((line) => line.endsWith(`  ${base}.tar.gz`))
    ?.split(/\s+/)[0];
  const actual = createHash("sha256").update(readFileSync(tarball)).digest("hex");
  if (!expected || expected !== actual) {
    rmSync(tarball, { force: true });
    throw new Error(`${base}.tar.gz does not match nodejs.org SHASUMS256 (expected ${expected || "no entry"}, got ${actual}).`);
  }
  rmSync(distDir, { recursive: true, force: true });
  const untar = spawnSync("tar", ["-xzf", tarball, "-C", cacheDir], { stdio: "inherit" });
  if (untar.status !== 0 || nodeDistVersion(distDir) !== version) {
    throw new Error(`Could not unpack ${tarball}.`);
  }
  return { distDir, binary, version };
}
