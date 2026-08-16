// Assemble the macOS app's server payload as a plain directory tree.
//
// This replaces the retired vercel/pkg single binary. pkg was unmaintained,
// could only target the end-of-life Node 18 runtime, and could not compile
// ESM dependencies to bytecode. The payload is now an honest repo-shaped
// tree: a current self-contained Node binary chosen from this machine, the
// server and desktop runtime files named by macPackagedAssets, and a
// lockfile-exact production node_modules. The Swift shell keeps launching
// Resources/ai-system-6-server; that entry is now a two-line exec wrapper.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const payloadDir = join(repoRoot, "dist", "mac-server-payload");

// The packaged runtime must satisfy two conditions, and the second one is
// easy to miss on a developer's own Mac.
//
// It must be current: shipping an end-of-life runtime was the exact failure
// mode of the pkg era.
//
// It must also be self-contained. A Homebrew Node is linked against
// @rpath/libnode.<abi>.dylib plus a chain of Homebrew libraries. Copying that
// binary alone produces an app that starts on the packaging machine and dies
// with a dyld error on every other Mac — packaging succeeds, the gates pass,
// and the artifact is broken for everyone but its author. So the runtime is
// chosen by inspection, not assumed to be the one running this script, and
// packaging refuses rather than shipping a machine-local app.
const MIN_PACKAGED_NODE_MAJOR = 24;

/**
 * Libraries a binary needs beyond the ones macOS itself guarantees.
 * `selfNames` carries the paths that are the binary itself: otool lists a
 * Mach-O's own install name among its load commands, and a copied binary still
 * reports the path it was built at, not where it now sits.
 */
function foreignLibraries(binaryPath, selfNames = []) {
  const listed = spawnSync("otool", ["-L", binaryPath], { encoding: "utf8" });
  if (listed.status !== 0) return null;
  const own = new Set([binaryPath, ...selfNames]);
  return listed.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean)
    .filter((library) => !own.has(library))
    .filter((library) => !library.startsWith("/usr/lib/") && !library.startsWith("/System/"));
}

function packagedNodeCandidate(binaryPath) {
  if (!binaryPath || !existsSync(binaryPath)) return null;
  const reported = spawnSync(binaryPath, ["--version"], { encoding: "utf8" });
  if (reported.status !== 0) return null;
  const version = reported.stdout.trim();
  return {
    path: binaryPath,
    version,
    major: Number(version.replace(/^v/, "").split(".")[0]),
    foreign: foreignLibraries(binaryPath),
  };
}

const nodeCandidates = [process.env.AI_SYSTEM6_NODE_BINARY, process.execPath, "/usr/local/bin/node"]
  .map(packagedNodeCandidate)
  .filter(Boolean);

const packagedNode = nodeCandidates.find(
  (candidate) => candidate.major >= MIN_PACKAGED_NODE_MAJOR && candidate.foreign?.length === 0
);

if (!packagedNode) {
  console.error("No Node runtime on this machine can be packaged.\n");
  for (const candidate of nodeCandidates) {
    const reasons = [];
    if (!(candidate.major >= MIN_PACKAGED_NODE_MAJOR)) reasons.push(`older than Node ${MIN_PACKAGED_NODE_MAJOR}`);
    if (candidate.foreign === null) reasons.push("otool could not read it");
    else if (candidate.foreign.length) reasons.push(`needs ${candidate.foreign.join(", ")}`);
    console.error(`  ${candidate.path} (${candidate.version}): ${reasons.join("; ") || "usable"}`);
  }
  console.error(
    "\nInstall the official macOS build from nodejs.org, which is self-contained,"
      + "\nor point AI_SYSTEM6_NODE_BINARY at a Node that needs no libraries outside"
      + "\n/usr/lib and /System. A Homebrew Node cannot be packaged: the app would"
      + "\nonly run on this machine."
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const assetGlobs = manifest.macPackagedAssets?.assets || [];
if (!assetGlobs.length) {
  console.error("package.json macPackagedAssets.assets is empty; nothing to package.");
  process.exit(1);
}

rmSync(payloadDir, { recursive: true, force: true });
mkdirSync(payloadDir, { recursive: true });

// 1. Repo files named by the asset manifest. node_modules globs in the
//    manifest stay behind as an existence contract for check:release-assets;
//    the payload's node_modules comes from the lockfile install below.
let copied = 0;
for (const pattern of assetGlobs) {
  if (pattern.startsWith("node_modules/")) continue;
  const matches = globSync(pattern, { cwd: repoRoot });
  if (!matches.length) {
    console.error(`macPackagedAssets pattern matched nothing: ${pattern}`);
    process.exit(1);
  }
  for (const relative of matches) {
    const source = join(repoRoot, relative);
    const destination = join(payloadDir, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
    copied += 1;
  }
}

// 2. The server itself plus its identity files. pkg used to discover server
//    sources through the require graph; a plain tree names them explicitly.
for (const relative of ["apps/server", "package.json", "package-lock.json", "build-info.json"]) {
  cpSync(join(repoRoot, relative), join(payloadDir, relative), { recursive: true });
}

// 3. Lockfile-exact production dependencies, installed inside the payload so
//    native modules (canvas) arrive built for this machine's architecture.
const install = spawnSync(
  "npm",
  ["ci", "--omit=dev", "--ignore-scripts=false", "--no-audit", "--no-fund"],
  { cwd: payloadDir, stdio: "inherit", env: process.env }
);
if (install.status !== 0) {
  console.error("npm ci for the payload failed.");
  process.exit(1);
}

// 4. Trim build-time fat the server never reads at runtime: sourcemaps and
//    the pdfjs viewer. The curated-glob pkg era shipped neither.
for (const pattern of ["node_modules/**/*.map", "node_modules/pdfjs-dist/web/**"]) {
  for (const relative of globSync(pattern, { cwd: payloadDir })) {
    rmSync(join(payloadDir, relative), { recursive: true, force: true });
  }
}

// 5. The runtime and the launcher the Swift shell already looks for.
const nodeBinary = join(payloadDir, "node");
copyFileSync(packagedNode.path, nodeBinary);
chmodSync(nodeBinary, 0o755);
const shippedForeign = foreignLibraries(nodeBinary, [packagedNode.path]);
if (shippedForeign === null || shippedForeign.length) {
  console.error(
    `The copied runtime still needs ${shippedForeign?.join(", ") || "libraries otool could not read"}.`
  );
  process.exit(1);
}

const launcher = join(payloadDir, "ai-system-6-server");
writeFileSync(
  launcher,
  `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/node" "$DIR/apps/server/server.js"
`
);
chmodSync(launcher, 0o755);

writeFileSync(
  join(payloadDir, "PAYLOAD-RECEIPT.json"),
  `${JSON.stringify(
    {
      nodeVersion: packagedNode.version,
      packagedAt: new Date().toISOString(),
      assetPatterns: assetGlobs.length,
      repoFilesCopied: copied,
    },
    null,
    2
  )}\n`
);

console.log(`Payload ready: ${payloadDir} (Node ${packagedNode.version} from ${packagedNode.path}, ${copied} repo files + production node_modules)`);
