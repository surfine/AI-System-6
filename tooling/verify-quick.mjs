import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const features = [];
const cssFiles = [];
const gates = [];
const sourceFiles = [];
let build = true;
let css = false;
let docs = false;
let smoke = false;
let src = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--feature") {
    const name = args[index + 1];
    if (!name || name.startsWith("--")) {
      console.error("NO  --feature requires a tests/features name.");
      process.exit(1);
    }
    features.push(name);
    index += 1;
  } else if (arg === "--gate") {
    const name = args[index + 1];
    if (!name || name.startsWith("--")) {
      console.error("NO  --gate requires a ship-gate name (npm run verify:gate -- --list).");
      process.exit(1);
    }
    gates.push(name);
    index += 1;
  } else if (arg === "--css") {
    css = true;
  } else if (arg === "--css-file") {
    const path = args[index + 1];
    if (!path || path.startsWith("--")) {
      console.error("NO  --css-file requires a path under apps/desktop/styles/.");
      process.exit(1);
    }
    css = true;
    cssFiles.push(path);
    index += 1;
  } else if (arg === "--docs") {
    docs = true;
  } else if (arg === "--file") {
    const path = args[index + 1];
    if (!path || path.startsWith("--")) {
      console.error("NO  --file requires a repository-relative path.");
      process.exit(1);
    }
    sourceFiles.push(path);
    index += 1;
  } else if (arg === "--smoke") {
    smoke = true;
  } else if (arg === "--src") {
    src = true;
  } else if (arg === "--no-build") {
    build = false;
  } else if (arg === "--help") {
    console.log(`Usage:
  npm run verify:quick
  npm run verify:quick -- --feature <name> [--feature <name>] [--css] [--css-file <path>] [--docs] [--src] [--smoke] [--gate <name>] [--no-build]

The quick gate never runs verify:release, global feature verification, visual
snapshots, packaging, or deployment. Repeat --css-file to isolate CSS checks to
the styles owned by the current task; plain --css keeps the all-styles gate.

--file narrows the feature contracts to the ones that READ that file: the suite
is about 210 CPU-seconds across 334 contracts, and a change to one module has no
business paying for the rest. Repeat it for each file touched. A file no
contract reads runs no contract, and the run says so.

--gate runs one whole browser ship gate with development receipts. Release
reuse requires the separate verify:gate -- --release-stamp workflow and exact
receipt matching. List gates with: npm run verify:gate -- --list`);
    process.exit(0);
  } else {
    console.error(`NO  unknown quick-verification option: ${arg}`);
    process.exit(1);
  }
}

const checks = [
  {
    label: "diff whitespace",
    command: "git",
    commandArgs: ["diff", "--check"],
  },
];

// One selection set, one runner. `--feature` and `--file` used to start the
// suite twice, and the second selection always contained the named contracts
// again, so asking for both ran the same contract twice. The set is built here,
// before the build, and every reason a contract is in it is printed once.
const selectedContracts = [];
const selectionReasons = [];
if (features.length) {
  // An unknown name is a typo, and a typo must not cost a bundle rebuild. The
  // suite answers with its own list, so the naming rule lives in one place.
  const listed = spawnSync(process.execPath, ["tooling/verify-features.mjs", "--list"], {
    cwd: root,
    encoding: "utf8",
  });
  if (listed.status !== 0) {
    console.error(listed.stderr || "NO  could not list the feature contracts.");
    process.exit(listed.status === null ? 1 : listed.status);
  }
  const available = new Set(listed.stdout.split("\n").map((line) => line.trim()).filter(Boolean));
  const unknown = features.filter((name) => !available.has(name) && !available.has(name.replace(/\.test\.mjs$/, "")));
  if (unknown.length) {
    console.error(`NO  unknown feature selector(s): ${unknown.join(", ")}. No tests ran, and nothing was built.`);
    process.exit(2);
  }
  selectedContracts.push(...features);
  selectionReasons.push(`--feature ${features.join(", ")}`);
}

if (sourceFiles.length) {
  // Every contract that READS one of the changed files. A contract opens the
  // source it holds to account by name, so the mention is the dependency: the
  // selection over-approximates on purpose and never guesses the other way.
  const selection = spawnSync(process.execPath, ["tooling/select-feature-contracts.mjs", ...sourceFiles], {
    cwd: root,
    encoding: "utf8",
  });
  if (selection.status !== 0) {
    console.error(selection.stderr || "NO  could not select the contracts for the changed files.");
    process.exit(selection.status === null ? 1 : selection.status);
  }
  const selected = selection.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  console.log(
    selected.length
      ? `--file ${sourceFiles.join(", ")} → ${selected.length} contract(s): ${selected.join(", ")}`
      : `--file ${sourceFiles.join(", ")} → no contract reads these files`,
  );
  selectedContracts.push(...selected);
  if (selected.length) selectionReasons.push(`--file ${sourceFiles.join(", ")}`);
}

const contractsToRun = [...new Set(selectedContracts)];

if (build) {
  checks.push({
    label: "app build",
    command: npm,
    commandArgs: ["run", "build:app"],
  });
}

if (contractsToRun.length) {
  checks.push({
    label: `feature contract${contractsToRun.length === 1 ? "" : "s"} (${selectionReasons.join("; ")})`,
    command: process.execPath,
    commandArgs: ["tooling/verify-features.mjs", ...contractsToRun],
  });
}

if (css) {
  checks.push({
    label: cssFiles.length ? "scoped CSS budget" : "CSS budget",
    command: process.execPath,
    commandArgs: [
      "tooling/verify-css.mjs",
      ...cssFiles.flatMap((path) => ["--file", path]),
    ],
  });
  if (!cssFiles.length) {
    checks.push({
      label: "design governance",
      command: process.execPath,
      commandArgs: ["tooling/verify-design.mjs"],
    });
  }
}

if (docs) {
  checks.push({
    label: "doc locales",
    command: process.execPath,
    commandArgs: ["tooling/verify-doc-locales.mjs"],
  });
}

if (src) {
  checks.push({
    label: "server typecheck",
    command: npm,
    commandArgs: ["--prefix", "apps/server", "run", "typecheck"],
  });
}

if (smoke) {
  checks.push({
    label: "release smoke",
    command: process.execPath,
    commandArgs: ["tooling/smoke-release.mjs"],
  });
}

// The quick runner owns the build decision. Gate children use those built
// bytes; --no-build explicitly opts out at both levels.
if (gates.length) {
  checks.push({
    label: `ship gate${gates.length === 1 ? "" : "s"} (receipt banked)`,
    command: process.execPath,
    commandArgs: ["tooling/verify-gate.mjs", ...gates, "--no-build"],
    live: true,
  });
}

const logRoot = join(root, "dist", "verification");
mkdirSync(logRoot, { recursive: true });
const logDir = mkdtempSync(join(logRoot, "quick-"));
const started = performance.now();
for (const check of checks) {
  const checkStarted = performance.now();
  // A browser gate takes minutes; held output would look like a hung terminal,
  // so it prints as it goes while the fast checks stay quiet until they fail.
  const logPath = join(logDir, `${checks.indexOf(check)}.log`);
  const fd = check.live ? null : openSync(logPath, "w");
  const result = spawnSync(check.command, check.commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: check.live ? "inherit" : ["ignore", fd, fd],
  });
  if (fd !== null) closeSync(fd);
  if (result.status !== 0) {
    if (!check.live) {
      const size = statSync(logPath).size;
      const tail = Buffer.alloc(Math.min(size, 8000));
      const log = openSync(logPath, "r");
      try { readSync(log, tail, 0, tail.length, Math.max(0, size - tail.length)); }
      finally { closeSync(log); }
      process.stderr.write(tail);
      console.error(`Full check log: ${logPath}`);
    }
    if (result.error) console.error(result.error.message);
    console.error(`NO  quick verification stopped at ${check.label}.`);
    process.exit(result.status || 1);
  }
  console.log(`OK  ${check.label} (${((performance.now() - checkStarted) / 1000).toFixed(2)}s)`);
}

console.log(`Quick logs: ${logDir}`);
console.log(`OK  quick verification passed in ${((performance.now() - started) / 1000).toFixed(2)}s.`);
