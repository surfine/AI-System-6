import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const features = [];
const cssFiles = [];
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
  } else if (arg === "--css") {
    css = true;
  } else if (arg === "--css-file") {
    const path = args[index + 1];
    if (!path || path.startsWith("--")) {
      console.error("NO  --css-file requires a path under styles/.");
      process.exit(1);
    }
    css = true;
    cssFiles.push(path);
    index += 1;
  } else if (arg === "--docs") {
    docs = true;
  } else if (arg === "--smoke") {
    smoke = true;
  } else if (arg === "--src") {
    src = true;
  } else if (arg === "--no-build") {
    build = false;
  } else if (arg === "--help") {
    console.log(`Usage:
  npm run verify:quick
  npm run verify:quick -- --feature <name> [--feature <name>] [--css] [--css-file <path>] [--docs] [--src] [--smoke] [--no-build]

The quick gate never runs verify:release, global feature verification, visual
snapshots, packaging, or deployment. Repeat --css-file to isolate CSS checks to
the styles owned by the current task; plain --css keeps the all-styles gate.`);
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

if (build) {
  checks.push({
    label: "app build",
    command: npm,
    commandArgs: ["run", "build:app"],
  });
}

if (features.length) {
  checks.push({
    label: `feature contract${features.length === 1 ? "" : "s"}`,
    command: process.execPath,
    commandArgs: ["scripts/verify-features.mjs", ...features],
  });
}

if (css) {
  checks.push({
    label: cssFiles.length ? "scoped CSS budget" : "CSS budget",
    command: process.execPath,
    commandArgs: [
      "scripts/verify-css.mjs",
      ...cssFiles.flatMap((path) => ["--file", path]),
    ],
  });
  if (!cssFiles.length) {
    checks.push({
      label: "design governance",
      command: process.execPath,
      commandArgs: ["scripts/verify-design.mjs"],
    });
  }
}

if (docs) {
  checks.push({
    label: "doc locales",
    command: process.execPath,
    commandArgs: ["scripts/verify-doc-locales.mjs"],
  });
}

if (src) {
  checks.push({
    label: "server typecheck",
    command: npm,
    commandArgs: ["--prefix", "src", "run", "typecheck"],
  });
}

if (smoke) {
  checks.push({
    label: "release smoke",
    command: process.execPath,
    commandArgs: ["scripts/smoke-release.mjs"],
  });
}

for (const check of checks) {
  const result = spawnSync(check.command, check.commandArgs, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.error(`NO  quick verification stopped at ${check.label}.`);
    process.exit(result.status || 1);
  }
  console.log(`OK  ${check.label}`);
}

console.log("OK  quick verification passed.");
