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
import { compileBrowseFiltersForRelease } from "./lib/browse-filters-release.mjs";
import { auditMachOTree } from "./lib/macho-audit.mjs";
import { MAC_LEGACY_X64, fetchOfficialNode, nodeDistVersion, nodeVersionInRange } from "./lib/mac-legacy-profile.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

// --profile legacy-x64 builds the Intel/Monterey payload (see
// tooling/lib/mac-legacy-profile.mjs) into its own directory: the official
// Node 22 darwin-x64 runtime and x64 native modules, cross-installed from this
// Mac. The default profile is the mainline payload and is unchanged.
const profileArgIndex = process.argv.indexOf("--profile");
const profileName = profileArgIndex >= 0 ? process.argv[profileArgIndex + 1] : "";
if (profileName && profileName !== MAC_LEGACY_X64.name) {
  console.error(`Unknown --profile ${profileName}; the only profile is ${MAC_LEGACY_X64.name}.`);
  process.exit(2);
}
const legacy = profileName === MAC_LEGACY_X64.name ? MAC_LEGACY_X64 : null;
const payloadDir = legacy ? join(repoRoot, legacy.payloadDir) : join(repoRoot, "dist", "mac-server-payload");

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
    .map((line) => line.trim())
    // A universal binary makes otool restart its list with a header line,
    // "<path> (architecture arm64):". That is the file itself, not a library.
    .filter((line) => !line.endsWith(":"))
    // otool prints "\t<path> (compatibility version …)". Split on the version
    // parenthesis, not on whitespace: this repository lives under a path with
    // a space in it, and splitting on " " reported "~/AI System 6" as a
    // missing library.
    .map((line) => line.split(" (compatibility version")[0].trim())
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

// The legacy runtime is an x64 binary this Mac cannot run, so it is never
// probed with --version: it is the pinned official tarball, and its version is
// read from the tarball's header. AI_SYSTEM6_LEGACY_NODE_DIST names an
// already-unpacked official tarball instead of the download.
function legacyNodeCandidate() {
  const dist = process.env.AI_SYSTEM6_LEGACY_NODE_DIST
    ? { distDir: resolve(process.env.AI_SYSTEM6_LEGACY_NODE_DIST) }
    : fetchOfficialNode(repoRoot, legacy.nodePlatformArch, legacy);
  const binary = join(dist.distDir, "bin", "node");
  const version = nodeDistVersion(dist.distDir);
  if (!nodeVersionInRange(version, legacy)) {
    console.error(`${dist.distDir} is Node ${version || "of unknown version"}; the ${legacy.name} profile needs >=${legacy.nodeFloor.join(".")} <${legacy.nodeMajorCeiling}.`);
    process.exit(1);
  }
  return { path: binary, version, major: Number(version.slice(1).split(".")[0]), foreign: foreignLibraries(binary) };
}

const nodeCandidates = legacy
  ? [legacyNodeCandidate()]
  : [process.env.AI_SYSTEM6_NODE_BINARY, process.execPath, "/usr/local/bin/node"]
    .map(packagedNodeCandidate)
    .filter(Boolean);

const packagedNode = nodeCandidates.find(
  (candidate) => (legacy || candidate.major >= MIN_PACKAGED_NODE_MAJOR) && candidate.foreign?.length === 0
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
//    Time Machine's ad-blocking lists are generated and git-ignored, so they
//    are compiled here from the pinned download before apps/browse is copied.
compileBrowseFiltersForRelease(repoRoot);
for (const relative of ["apps/server", "apps/browse", "package.json", "package-lock.json", "build-info.json"]) {
  cpSync(join(repoRoot, relative), join(payloadDir, relative), { recursive: true });
}

// 2b. ClioTalk's engine: the slim dsh install tooling/build-dsh-slim.mjs
//     wrote (git-ignored, ~165 MiB, sha256 manifest). It is verified against
//     its MANIFEST.json and copied to the same relative path, where
//     apps/server/server/agent/paths.js looks for it; its Mach-O files
//     (ripgrep, the .node addons, libvips) are signed with everything else.
//     Without it the app still builds and the engine reports engine_missing.
const dshSlimRoot = join(repoRoot, "vendor-runtime", "dsh");
if (existsSync(dshSlimRoot)) {
  const verified = spawnSync(process.execPath, [join(repoRoot, "tooling", "build-dsh-slim.mjs"), "--verify"], { stdio: "inherit" });
  if (verified.status !== 0) {
    console.error("vendor-runtime/dsh failed its manifest check; rebuild it with node tooling/build-dsh-slim.mjs.");
    process.exit(1);
  }
  cpSync(dshSlimRoot, join(payloadDir, "vendor-runtime", "dsh"), { recursive: true, verbatimSymlinks: true });
} else {
  console.warn("vendor-runtime/dsh is absent: this payload ships without the ClioTalk engine (node tooling/build-dsh-slim.mjs).");
}

// 3. Lockfile-exact production dependencies, installed inside the payload so
//    native modules (canvas) arrive built for this machine's architecture.
//    The legacy profile cross-installs: --cpu picks the x64 optional packages
//    (@napi-rs/canvas-darwin-x64), npm_config_arch makes canvas's
//    prebuild-install fetch the x64 binary. Should that download fail, its
//    node-gyp fallback is aimed at x64 too, and the Mach-O audit below
//    refuses anything that is not.
const install = spawnSync(
  "npm",
  [
    "ci", "--omit=dev", "--ignore-scripts=false", "--no-audit", "--no-fund",
    ...(legacy ? ["--os=darwin", `--cpu=${legacy.npmCpu}`] : []),
  ],
  {
    cwd: payloadDir,
    stdio: "inherit",
    env: legacy
      ? { ...process.env, npm_config_arch: legacy.npmCpu, npm_config_platform: "darwin" }
      : process.env,
  }
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

// node-canvas 3.x's darwin-x64 prebuild links 28 Homebrew dylibs built for
// macOS 14-15 (libcairo, libpango, libpcre2 ...); dyld on Monterey refuses
// them. @napi-rs/canvas is self-contained (x86_64, minos 10.13), is what
// pdfjs-dist itself renders with in Node, and covers what the server asks of
// canvas (createCanvas, loadImage, 2D drawing, toBuffer("image/png") in
// importers/image-ocr.js and importers/pdf.js). So the legacy payload answers
// require("canvas") with it; the mainline payload keeps node-canvas.
if (legacy) {
  const canvasDir = join(payloadDir, "node_modules", "canvas");
  const napiCanvas = join(payloadDir, "node_modules", "@napi-rs", `canvas-darwin-${legacy.npmCpu}`);
  if (!existsSync(napiCanvas)) {
    console.error(`${napiCanvas} is missing; the legacy payload has no canvas it can load.`);
    process.exit(1);
  }
  const { version } = JSON.parse(readFileSync(join(canvasDir, "package.json"), "utf8"));
  rmSync(canvasDir, { recursive: true, force: true });
  mkdirSync(canvasDir, { recursive: true });
  writeFileSync(
    join(canvasDir, "package.json"),
    `${JSON.stringify({ name: "canvas", version, private: true, main: "index.js", description: "AI System 6 legacy-x64: node-canvas answered by @napi-rs/canvas" }, null, 2)}\n`
  );
  writeFileSync(join(canvasDir, "index.js"), 'module.exports = require("@napi-rs/canvas");\n');
}

// The ClioTalk agent engine (vendor-runtime/dsh, copied into the mainline
// payload whenever a slim install is present on the build Mac) is built for
// the build Mac's architecture. On the legacy profile it would carry arm64
// Mach-O into an x86_64 payload — exactly the June 2026 defect the audit
// below exists to refuse — so the Intel app ships without it and the server
// reports engine_missing there, the same as a Mac without the dsh install.
if (legacy && existsSync(join(payloadDir, "vendor-runtime"))) {
  rmSync(join(payloadDir, "vendor-runtime"), { recursive: true, force: true });
  console.log("vendor-runtime removed from the legacy payload: the ClioTalk agent engine is not part of the Intel build (the engine reports engine_missing).");
}

if (legacy) {
  const audit = auditMachOTree(payloadDir, {
    arch: legacy.machoArch,
    maxMinos: legacy.maxMinos,
    executableDirFor: () => payloadDir,
  });
  if (audit.failures.length) {
    console.error(`The ${legacy.name} payload carries Mach-O files that will not load on the target:`);
    for (const failure of audit.failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`Mach-O audit: ${audit.rows.length} file(s), all ${legacy.machoArch}, minos <= ${legacy.maxMinos}.`);
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
      ...(legacy ? { profile: legacy.name, arch: legacy.machoArch, maxMinos: legacy.maxMinos } : {}),
      packagedAt: new Date().toISOString(),
      assetPatterns: assetGlobs.length,
      repoFilesCopied: copied,
    },
    null,
    2
  )}\n`
);

console.log(`Payload ready: ${payloadDir} (Node ${packagedNode.version} from ${packagedNode.path}, ${copied} repo files + production node_modules)`);
