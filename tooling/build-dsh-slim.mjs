#!/usr/bin/env node
// Build the slim DeepSeek Harness (dsh) install that ClioTalk's engine runs.
//
//   node tooling/build-dsh-slim.mjs            stage, slim, write manifest, verify
//   node tooling/build-dsh-slim.mjs --trace    also re-record tooling/dsh-slim/roots.json
//   node tooling/build-dsh-slim.mjs --verify   only re-hash an existing output
//   node tooling/build-dsh-slim.mjs --target linux-x64 --out /out/dsh
//                                              the Linux build the cloud sandbox
//                                              image runs (platform/web/agent-sandbox)
//
// Inputs (committed, pinned): tooling/dsh-slim/dsh-package.json names one
// exact dsh version; tooling/dsh-slim/dsh-lock.json (an npm lockfile, renamed
// so it is not mistaken for the app's own dependency lock) pins all 684
// packages with their registry integrity; tooling/dsh-slim/roots.json lists the packages the
// engine profile (dsh `acp` + apps/server/server/agent/patches/posture.yml)
// actually resolves at boot.
//
// Steps: `npm ci --ignore-scripts` into vendor-runtime/.dsh-stage (npm checks
// every tarball against the lockfile integrity; no install script runs — the
// spike found the five blocked scripts unneeded), then copy only the closure of
// the roots over their declared dependencies into
// vendor-runtime/dsh/<version>/, and write MANIFEST.json with the sha256 of
// every file. Profile meta packages (`@deepseek-ai/dsh`, `dsh-base`) are kept
// as directories but their dependency lists are not followed: they name every
// plugin dsh ships, including LibreOffice, speech models and the inspector.
//
// The roots come from a traced boot rather than a hand list, so a dsh upgrade
// is: bump the version in dsh-package.json, regenerate dsh-lock.json with
// `npm install --package-lock-only --ignore-scripts` in a scratch copy, run
// with --trace, then re-run the live check in
// docs/AGENT-HARNESS.md.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const inputDir = path.join(repoRoot, "tooling", "dsh-slim");
const argv = process.argv.slice(2);
/** `--name value` or `--name=value`. */
function option(name) {
  const index = argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (index < 0) return "";
  return argv[index].includes("=") ? argv[index].slice(name.length + 1) : String(argv[index + 1] || "");
}
// The Mac app's build is the default. `--target linux-x64|linux-arm64` builds
// the install the cloud sandbox image carries: npm installs that platform's
// optional packages, and only foreign platforms' prebuilds are trimmed.
const target = option("--target");
if (target && !/^linux-(x64|arm64)$/.test(target)) throw new Error(`--target must be linux-x64 or linux-arm64, got ${target}`);
const [targetOs, targetCpu] = target ? target.split("-") : ["", ""];
const stageDir = path.join(repoRoot, "vendor-runtime", target ? `.dsh-stage-${target}` : ".dsh-stage");
const patchDir = path.join(repoRoot, "apps", "server", "server", "agent", "patches");
// Never read at runtime on a Mac: type declarations, source maps, and native
// prebuilds for Windows and Linux (node-pty alone carries 24 MB of them).
const TRIM = target
  ? /(?:\.(?:map|d\.ts|d\.cts|d\.mts)$|\/prebuilds\/(?:win32|darwin)-[^/]+(?:\/|$))/
  : /(?:\.(?:map|d\.ts|d\.cts|d\.mts)$|\/prebuilds\/(?:win32|linux)-[^/]+(?:\/|$))/;
// A traced root that names another platform's binary package (the trace runs
// on a Mac) stands for its target twin, when the target install has one.
const PLATFORM_PACKAGE = /-(darwin|win32|linux)-(arm64|x64)$/;
const META_PACKAGES = new Set(["node_modules/@deepseek-ai/dsh", "node_modules/@deepseek-ai/dsh-base"]);

const args = new Set(argv);
const INPUT_PACKAGE = path.join(inputDir, "dsh-package.json");
const INPUT_LOCK = path.join(inputDir, "dsh-lock.json");
const inputPackage = JSON.parse(readFileSync(INPUT_PACKAGE, "utf8"));
const version = inputPackage.dependencies["@deepseek-ai/dsh"];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  throw new Error(`tooling/dsh-slim/dsh-package.json must pin an exact dsh version, got ${version}`);
}
const outDir = option("--out") ? path.resolve(option("--out")) : path.join(repoRoot, "vendor-runtime", "dsh", version);

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walkFiles(root, base = root, out = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(full, base, out);
    else if (entry.isFile() || entry.isSymbolicLink()) out.push(path.relative(base, full));
  }
  return out.sort();
}

function stage() {
  mkdirSync(stageDir, { recursive: true });
  cpSync(INPUT_PACKAGE, path.join(stageDir, "package.json"));
  cpSync(INPUT_LOCK, path.join(stageDir, "package-lock.json"));
  const started = Date.now();
  // The image is Debian (glibc); without --libc npm skips -gnu packages when
  // it stages a Linux install from a Mac.
  const platformFlags = target ? [`--os=${targetOs}`, `--cpu=${targetCpu}`, "--libc=glibc"] : [];
  const result = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", ...platformFlags], {
    cwd: stageDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) throw new Error("npm ci of the pinned dsh lockfile failed");
  console.log(`staged ${version} in ${Math.round((Date.now() - started) / 1000)} s`);
}

/** Node resolution from a package directory (relative to stage), walking up. */
function resolveFrom(pkgRel, name) {
  let dir = pkgRel;
  for (;;) {
    const candidate = path.posix.join(dir, "node_modules", name);
    if (existsSync(path.join(stageDir, candidate, "package.json"))) return candidate;
    if (!dir || dir === ".") return null;
    const idx = dir.lastIndexOf("/node_modules/");
    if (idx >= 0) dir = dir.slice(0, idx);
    else if (dir.startsWith("node_modules/")) dir = "";
    else return null;
  }
}

function closure(roots) {
  const keep = new Set();
  const queue = [...roots];
  while (queue.length) {
    const rel = queue.shift();
    if (keep.has(rel)) continue;
    const manifestPath = path.join(stageDir, rel, "package.json");
    if (!existsSync(manifestPath)) throw new Error(`root ${rel} is not in the staged install`);
    keep.add(rel);
    if (META_PACKAGES.has(rel)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const names = new Set([
      ...Object.keys(manifest.dependencies || {}),
      ...Object.keys(manifest.optionalDependencies || {}),
      ...Object.keys(manifest.peerDependencies || {}),
    ]);
    for (const name of names) {
      const found = resolveFrom(rel, name);
      // Optional and peer dependencies may be absent for this platform.
      if (found && !keep.has(found)) queue.push(found);
    }
  }
  return [...keep].sort();
}

async function trace() {
  const traceFile = path.join(stageDir, "trace.txt");
  const cwd = path.join(stageDir, "trace-cwd");
  const home = path.join(stageDir, "trace-home");
  rmSync(traceFile, { force: true });
  rmSync(home, { recursive: true, force: true });
  mkdirSync(path.join(cwd, ".tmp"), { recursive: true });
  writeFileSync(path.join(cwd, "notes.md"), "# trace\n");
  const sdk = await import(pathToFileURL(path.join(stageDir, "node_modules/@agentclientprotocol/sdk/dist/acp.js")).href);
  const bin = path.join(stageDir, "node_modules/@deepseek-ai/dsh/lib/bin.js");
  const hook = pathToFileURL(path.join(inputDir, "trace-hook.mjs")).href;
  const patches = ["posture.yml", "deepseek.yml"].flatMap((name) => ["--patch", path.join(patchDir, name)]);
  const child = spawn(process.execPath, ["--import", hook, bin, "--profile", "acp", ...patches], {
    cwd,
    env: {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      DSH_HOME: home,
      TMPDIR: `${path.join(cwd, ".tmp")}/`,
      AIS6_TRACE_FILE: traceFile,
      // A placeholder: model listing answers 401 and dsh falls back to its
      // bundled catalog, which is enough to boot every mounted plugin.
      DEEPSEEK_API_KEY: "trace-placeholder",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const conn = new sdk.ClientSideConnection(() => ({
    async requestPermission() { return { outcome: { outcome: "cancelled" } }; },
    async sessionUpdate() {},
  }), sdk.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
  await conn.initialize({ protocolVersion: sdk.PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
  await conn.newSession({ cwd, mcpServers: [] });
  child.stdin.end();
  child.kill("SIGTERM");
  const roots = new Set();
  for (const line of readFileSync(traceFile, "utf8").split("\n")) {
    if (!line) continue;
    const rel = path.relative(stageDir, fileURLToPath(line)).split(path.sep).join("/");
    const idx = rel.lastIndexOf("node_modules/");
    if (!rel.startsWith("node_modules/") || idx < 0) continue;
    const parts = rel.slice(idx + "node_modules/".length).split("/");
    const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
    roots.add(`${rel.slice(0, idx)}node_modules/${name}`);
  }
  const sorted = [...roots].sort();
  writeFileSync(path.join(inputDir, "roots.json"), `${JSON.stringify({ dsh: version, recordedWith: ["acp", "posture.yml", "deepseek.yml"], roots: sorted }, null, 2)}\n`);
  console.log(`traced ${sorted.length} root packages`);
}

function build() {
  const { roots, dsh } = JSON.parse(readFileSync(path.join(inputDir, "roots.json"), "utf8"));
  if (dsh !== version) throw new Error(`roots.json was traced for dsh ${dsh}; re-run with --trace for ${version}`);
  // The profile meta packages are read as files (their cordis.patch.yml is
  // the profile's base layer), never imported, so a trace cannot see them.
  // For a Linux target, a root npm did not install there (a Mac or Windows
  // binary package, skipped by its `os`/`cpu` fields) is replaced by its
  // target twin when one exists, and otherwise left out.
  const platformRoots = roots.map((rel) => {
    if (!target || existsSync(path.join(stageDir, rel, "package.json"))) return rel;
    const twins = PLATFORM_PACKAGE.test(rel)
      ? [`-${target}`, `-${target}-gnu`].map((suffix) => rel.replace(PLATFORM_PACKAGE, suffix))
      : [];
    const twin = twins.find((candidate) => existsSync(path.join(stageDir, candidate, "package.json")));
    if (twin) return twin;
    console.log(`not on ${target}: ${rel}`);
    return null;
  }).filter(Boolean);
  const keep = closure([...META_PACKAGES, ...platformRoots]);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const rel of keep) {
    cpSync(path.join(stageDir, rel), path.join(outDir, rel), {
      recursive: true,
      verbatimSymlinks: true,
      // A nested node_modules is copied only through its own closure entry.
      filter: (src) => !TRIM.test(src)
        && !path.relative(path.join(stageDir, rel), src).split(path.sep).includes("node_modules"),
    });
  }
  const lockSha = sha256File(INPUT_LOCK);
  const files = {};
  let bytes = 0;
  for (const rel of walkFiles(outDir)) {
    const full = path.join(outDir, rel);
    if (lstatSync(full).isSymbolicLink()) continue;
    files[rel.split(path.sep).join("/")] = sha256File(full);
    bytes += statSync(full).size;
  }
  const manifest = {
    name: "@deepseek-ai/dsh",
    version,
    lockfileSha256: lockSha,
    profile: "acp + apps/server/server/agent/patches/posture.yml",
    target: target || `${process.platform}-${process.arch}`,
    packages: keep,
    fileCount: Object.keys(files).length,
    bytes,
    files,
  };
  writeFileSync(path.join(outDir, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`slim dsh ${version}: ${keep.length} packages, ${manifest.fileCount} files, ${(bytes / 1048576).toFixed(1)} MiB -> ${path.relative(repoRoot, outDir)}`);
}

function verify() {
  const manifestPath = path.join(outDir, "MANIFEST.json");
  if (!existsSync(manifestPath)) throw new Error(`no slim install at ${outDir}; run node tooling/build-dsh-slim.mjs`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const problems = [];
  if (manifest.lockfileSha256 !== sha256File(INPUT_LOCK)) problems.push("lockfile changed since this install was built");
  const present = new Set(walkFiles(outDir).map((rel) => rel.split(path.sep).join("/")).filter((rel) => rel !== "MANIFEST.json"));
  for (const [rel, sum] of Object.entries(manifest.files)) {
    if (!present.has(rel)) problems.push(`missing ${rel}`);
    else if (sha256File(path.join(outDir, rel)) !== sum) problems.push(`changed ${rel}`);
    present.delete(rel);
  }
  for (const rel of present) {
    if (!lstatSync(path.join(outDir, rel)).isSymbolicLink()) problems.push(`unexpected ${rel}`);
  }
  if (problems.length) {
    console.error(problems.slice(0, 20).join("\n"));
    throw new Error(`slim dsh ${version} failed verification (${problems.length} problems)`);
  }
  console.log(`verified slim dsh ${version}: ${manifest.fileCount} files match MANIFEST.json`);
}

if (args.has("--verify")) {
  verify();
} else {
  stage();
  if (args.has("--trace")) await trace();
  build();
  verify();
}
