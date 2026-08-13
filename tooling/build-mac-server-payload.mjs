// Assemble the macOS app's server payload as a plain directory tree.
//
// This replaces the retired vercel/pkg single binary. pkg was unmaintained,
// could only target the end-of-life Node 18 runtime, and could not compile
// ESM dependencies to bytecode. The payload is now an honest repo-shaped
// tree: the packaging machine's own current Node binary, the server and
// desktop runtime files named by package.json macPackagedAssets, and a
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

// The packaged runtime is the Node that runs this script. Refuse anything
// older than the floor the repo supports; shipping an EOL runtime was the
// exact failure mode of the pkg era.
const MIN_PACKAGED_NODE_MAJOR = 24;
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < MIN_PACKAGED_NODE_MAJOR) {
  console.error(
    `The payload embeds the running Node (${process.version}); Node ${MIN_PACKAGED_NODE_MAJOR}+ is required so the shipped app never carries an end-of-life runtime.`
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
copyFileSync(process.execPath, nodeBinary);
chmodSync(nodeBinary, 0o755);

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
      nodeVersion: process.version,
      packagedAt: new Date().toISOString(),
      assetPatterns: assetGlobs.length,
      repoFilesCopied: copied,
    },
    null,
    2
  )}\n`
);

console.log(`Payload ready: ${payloadDir} (Node ${process.version}, ${copied} repo files + production node_modules)`);
