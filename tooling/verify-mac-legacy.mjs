// verify:mac-legacy — the gate for the Intel/Monterey legacy app.
//
// Walks the whole .app and lists every Mach-O (the shell, node, every .node
// and every dylib they load) with its architectures and minimum macOS. All of
// them must carry an x86_64 slice built for macOS 12.0 or earlier, and every
// library they load must be a system library or a file inside the app. The
// June 2026 Intel build shipped an arm64 canvas.node in an x86_64 server;
// this gate is the check that build never had.
//
//   npm run verify:mac-legacy                       # dist/mac-legacy-x64/AI System 6 Beta.app
//   npm run verify:mac-legacy -- --app <path.app>
//   npm run verify:mac-legacy -- --node22           # also run the contracts on Node 22
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { auditMachOTree } from "./lib/macho-audit.mjs";
import { MAC_LEGACY_X64 as profile, compareVersions, fetchOfficialNode, nodeVersionInRange } from "./lib/mac-legacy-profile.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const appArgIndex = args.indexOf("--app");
const appDir = appArgIndex >= 0
  ? resolve(args[appArgIndex + 1])
  : join(repoRoot, profile.outputDir, `${profile.appDisplayName}.app`);
const runNode22Contracts = args.includes("--node22");

const failures = [];
const lines = [];
const say = (line = "") => {
  lines.push(line);
  console.log(line);
};

if (!existsSync(join(appDir, "Contents", "Info.plist"))) {
  console.error(`NO  ${appDir} is not an app bundle. Build it with npm run bundle:mac-legacy-x64.`);
  process.exit(1);
}

function plistValue(key) {
  const result = spawnSync("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", join(appDir, "Contents", "Info.plist")], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

// Identity: the same bundle id as the mainline shell and the June build, so
// the WKWebView data store with the writer's projects carries over.
const bundleId = plistValue("CFBundleIdentifier");
if (bundleId !== profile.bundleId) failures.push(`CFBundleIdentifier is ${bundleId || "missing"}, not ${profile.bundleId}`);
const minimumSystem = plistValue("LSMinimumSystemVersion");
if (!minimumSystem || compareVersions(minimumSystem, profile.maxMinos) > 0) {
  failures.push(`LSMinimumSystemVersion is ${minimumSystem || "missing"}, above ${profile.maxMinos}`);
}

const macOsDir = join(appDir, "Contents", "MacOS");
const payloadDir = join(appDir, "Contents", "Resources", "server-payload");
const shellBinary = join(macOsDir, "AISystem6Shell");
for (const required of [shellBinary, join(payloadDir, "node"), join(appDir, "Contents", "Resources", "ai-system-6-server")]) {
  if (!existsSync(required)) failures.push(`missing ${relative(appDir, required)}`);
}
for (const helper of ["AISystem6Vision", "AISystem6Intelligence"]) {
  if (existsSync(join(macOsDir, helper))) failures.push(`carries ${helper}, a macOS 26 helper`);
}
if (existsSync(shellBinary) && !readFileSync(shellBinary).includes(Buffer.from(profile.serverOrigin))) {
  failures.push(`the shell does not open ${profile.serverOrigin}`);
}

// The runtime: an x64 binary this Mac cannot run, so its version comes from
// the payload's receipt, which the payload builder wrote from the tarball.
let receipt = {};
try {
  receipt = JSON.parse(readFileSync(join(payloadDir, "PAYLOAD-RECEIPT.json"), "utf8"));
} catch {
  failures.push("server-payload/PAYLOAD-RECEIPT.json is missing");
}
if (receipt.profile !== profile.name) failures.push(`payload profile is ${receipt.profile || "mainline"}, not ${profile.name}`);
if (!nodeVersionInRange(receipt.nodeVersion, profile)) {
  failures.push(`payload Node ${receipt.nodeVersion || "?"} is outside >=${profile.nodeFloor.join(".")} <${profile.nodeMajorCeiling}`);
}

const audit = auditMachOTree(appDir, {
  arch: profile.machoArch,
  maxMinos: profile.maxMinos,
  executableDirFor: (file) => (file.startsWith(payloadDir + "/") ? payloadDir : macOsDir),
});
failures.push(...audit.failures);
const nativeModules = audit.rows.filter((row) => row.path.endsWith(".node"));
if (!nativeModules.length) failures.push("no native .node module found; the payload install lost canvas");

say(`App: ${appDir}`);
say(`Bundle: ${bundleId}  LSMinimumSystemVersion ${minimumSystem}  Node ${receipt.nodeVersion || "?"} (${receipt.profile || "?"})`);
say("");
say(`Mach-O files (${audit.rows.length}):`);
const width = Math.max(...audit.rows.map((row) => row.archs.join(",").length), 6);
for (const row of audit.rows) {
  say(`  ${row.archs.join(",").padEnd(width)}  minos ${String(row.minos || "-").padEnd(6)}  ${row.path}${row.problems.length ? "   <-- " + row.problems.join("; ") : ""}`);
  for (const dependency of row.dependencies.filter((name) => !name.startsWith("/"))) {
    say(`  ${"".padEnd(width)}  ${"".padEnd(12)}    loads ${dependency}`);
  }
}

const signature = spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", appDir], { encoding: "utf8" });
if (signature.status !== 0) failures.push(`codesign --verify --deep --strict: ${signature.stderr.trim()}`);
else {
  const details = spawnSync("/usr/bin/codesign", ["-dv", appDir], { encoding: "utf8" }).stderr;
  const team = details.match(/^TeamIdentifier=(.+)$/m)?.[1] || "not set";
  const stapled = spawnSync("/usr/bin/xcrun", ["stapler", "validate", appDir], { encoding: "utf8" }).status === 0;
  say(`\ncodesign --verify --deep --strict: OK (${team === "not set" ? "ad-hoc" : `Team ${team}`}${stapled ? ", notarization ticket stapled" : ""})`);
}

// Contracts that fail on Node 22 by design. Release tooling runs on the build
// Mac under the mainline Node 24 and never inside the legacy payload.
const NODE22_ACCEPTED = {
  "release-receipt": "release preflight requires Node >= 24 (node-runtime check); release tooling never runs on the legacy server",
};

if (runNode22Contracts) {
  // The contracts on the host-architecture build of the pinned Node 22. A
  // contract that fails here and passes on this Mac's Node is a Node 22
  // regression, i.e. a server change that needs Node 23+, caught before the
  // MacBook finds it. One that fails on both is reported, not blamed on 22.
  const hostArch = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  const { binary, version } = fetchOfficialNode(repoRoot, hostArch, profile);
  say(`\nContracts on Node ${version} (${hostArch}):`);
  const contracts = spawnSync(binary, ["tooling/verify-features.mjs"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  process.stdout.write(contracts.stdout.split("\n").filter((line) => !line.startsWith("Features completed")).slice(-25).join("\n"));
  const failedLine = `${contracts.stdout}\n${contracts.stderr}`.match(/Feature verification failed: \d+ feature\(s\): (.+)/);
  const failed = contracts.status === 0 ? [] : failedLine ? failedLine[1].split(",").map((name) => name.trim()).filter(Boolean) : null;
  if (failed === null) {
    failures.push(`contracts on Node ${version} exited ${contracts.status} without naming the failures`);
  } else {
    for (const name of failed) {
      if (NODE22_ACCEPTED[name]) {
        say(`  accepted on Node 22: ${name} — ${NODE22_ACCEPTED[name]}`);
        continue;
      }
      const file = [join("tests", "features", `${name}.test.mjs`), join("tests", "features", "public", `${name}.test.mjs`)]
        .find((candidate) => existsSync(join(repoRoot, candidate)));
      const onHost = file ? spawnSync(process.execPath, [file], { cwd: repoRoot, encoding: "utf8" }).status : 1;
      // A timing budget can miss on a busy machine (the parallel run shares
      // it with every other contract); a contract that passes when rerun
      // alone on Node 22 is load, not the runtime.
      const aloneOn22 = file && onHost === 0 ? spawnSync(binary, [file], { cwd: repoRoot, encoding: "utf8" }).status : 1;
      if (file && onHost === 0 && aloneOn22 === 0) {
        say(`  passes alone on Node ${version}, red only in the parallel run (load): ${name}`);
      } else if (file && onHost !== 0) {
        say(`  fails on Node ${process.version} too, not a Node 22 regression: ${name}`);
      } else {
        failures.push(`contract ${name} fails on Node ${version} and passes on Node ${process.version}`);
      }
    }
    say(`Contracts on Node ${version}: ${failed.length ? `${failed.length} red, regressions listed above if any` : "all passed"}`);
  }
}

const reportPath = join(repoRoot, profile.outputDir, "verify-mac-legacy.txt");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join("\n")}\n${failures.length ? `\nFAILED\n${failures.join("\n")}\n` : "\nOK\n"}`);

if (failures.length) {
  console.error(`\nNO  verify:mac-legacy found ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`\nOK  verify:mac-legacy — ${audit.rows.length} Mach-O file(s), all ${profile.machoArch}, minos <= ${profile.maxMinos}. Report: ${relative(repoRoot, reportPath)}`);
