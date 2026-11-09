#!/usr/bin/env node
// Targeted cascade ledger: verify a stylesheet change in every appearance and
// viewport it can reach, opening only the windows it can reach.
//
// The full ledger (tooling/cascade-ledger.mjs) opens all 83 registered windows
// per appearance and viewport; at twelve appearances and two viewports that is
// about two hours, so it used to run for Classic at desktop size only and a
// regression that showed only in Liquid Glass, Platinum, Aqua or on the phone
// went through. This tool reads the diff instead (tooling/lib/cascade-impact.mjs):
// the rules that changed, the custom properties and keyframes they feed, the
// appearances whose sheets and theme conditions let them apply, and the
// windows whose DOM carries their subjects. Then it runs the ledger for each
// (appearance, viewport) cell with only those windows open and compares only
// their targets against the committed baseline. A cell the mapping cannot
// narrow (a rule whose subject is html, body or the desktop, an @font-face
// change, a sheet outside the manifest) is a full walk of that cell.
//
// A change to the app's scripts or markup can move any element's classes, so
// it adds a full walk of the two anchor appearances (Classic and Liquid Glass)
// at both viewports; the stylesheet mapping still decides the other cells.
//
// Usage:
//   node tooling/cascade-changed.mjs                 # working diff against HEAD
//   node tooling/cascade-changed.mjs --base <rev>    # everything since <rev>
//   node tooling/cascade-changed.mjs --plan          # print the cells, run nothing
//   options: --viewports 1440x960,390x844  --themes a,b (restrict)  --jobs N (parallel cells, default 3)
//            --no-build  --full (every reached cell walks every window)
//            --ledger <dir> (baselines, relative to the repository root; default tests/cascade-ledger)
//            --accept (an intended change: write the reported cells into the baselines it compared against)
//
// Exit: 1 on any flip or derived change, 2 on a failed run or a missing
// baseline, else 0. Per-cell reports: dist/verification/cascade-changed/<theme>@<viewport>.json.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planCascadeImpact } from "./lib/cascade-impact.mjs";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const argValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const BASE = argValue("--base") || "HEAD";
const VIEWPORTS = (argValue("--viewports") || "1440x960,390x844").split(",").filter(Boolean);
const ONLY_THEMES = argValue("--themes") ? new Set(argValue("--themes").split(",").filter(Boolean)) : null;
const JOBS = Math.max(1, Number(argValue("--jobs") || 3));
const PLAN_ONLY = args.includes("--plan");
const FULL = args.includes("--full");
const ACCEPT = args.includes("--accept");
const ANCHORS = ["classic", "liquid-glass"];
// A cell that needs most windows anyway walks all of them: the same cost, and
// the desk is then the baseline's desk too.
const FULL_WALK_SHARE = 0.6;
const LEDGER_ARG = argValue("--ledger") || "tests/cascade-ledger";
const LEDGER_DIR = join(repositoryRoot, LEDGER_ARG);
const REPORT_DIR = join(repositoryRoot, "dist/verification/cascade-changed");

function git(gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${gitArgs.join(" ")}: ${result.stderr.trim()}`);
  return result.stdout;
}

function changedPaths() {
  const fields = git(["diff", "--name-status", "--no-renames", "-z", BASE, "--"]).split("\0").filter(Boolean);
  const paths = [];
  for (let i = 0; i + 1 < fields.length; i += 2) paths.push(fields[i + 1]);
  paths.push(...git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean));
  return [...new Set(paths)];
}

const changed = changedPaths();
const cssPaths = changed.filter((path) => /^apps\/desktop\/styles\/[^/]+\.css$/.test(path));
// Scripts and markup the page runs: they decide which classes an element
// carries, which no stylesheet diff can see.
const scriptPaths = changed.filter((path) => /^apps\/desktop\/(?:app\.js$|index\.html$|app\/.+\.(?:js|css)$)/.test(path)
  && !/^apps\/desktop\/app\/generated\//.test(path));

const show = (path) => {
  const result = spawnSync("git", ["show", `${BASE}:${path}`], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
};
const current = (path) => (existsSync(join(repositoryRoot, path)) ? readFileSync(join(repositoryRoot, path), "utf8") : "");
const sheets = cssPaths.map((path) => ({ file: path.slice("apps/desktop/".length), before: show(path), after: current(path) }));
const allSheets = readdirSync(join(desktopRoot, "styles")).filter((name) => name.endsWith(".css"))
  .map((name) => ({ file: `styles/${name}`, text: readFileSync(join(desktopRoot, "styles", name), "utf8") }));

const baselines = new Map();
const baselineFile = (theme, viewport) => join(LEDGER_DIR, `${theme}@${viewport}.json`);
function baselineIndex(theme, viewport) {
  const key = `${theme}@${viewport}`;
  if (!baselines.has(key)) {
    const file = baselineFile(theme, viewport);
    baselines.set(key, existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).windows || null : null);
  }
  return baselines.get(key);
}

const plan = planCascadeImpact(sheets, { indexFor: baselineIndex, viewports: VIEWPORTS, allSheets });
const cells = new Map(plan.cells.map((cell) => [`${cell.theme}@${cell.viewport}`, cell]));
if (scriptPaths.length) {
  for (const theme of ANCHORS) {
    for (const viewport of VIEWPORTS) {
      cells.set(`${theme}@${viewport}`, { theme, viewport, windows: null, why: [`scripts changed: ${scriptPaths.slice(0, 3).join(", ")}${scriptPaths.length > 3 ? ", ..." : ""}`] });
    }
  }
}
const registeredCount = (theme, viewport) => Object.keys(baselineIndex(theme, viewport)?.inventory || {}).filter((name) => name !== "(desk)").length;
const work = [...cells.values()]
  .filter((cell) => !ONLY_THEMES || ONLY_THEMES.has(cell.theme))
  .map((cell) => {
    if (FULL || (cell.windows && cell.windows.length > FULL_WALK_SHARE * registeredCount(cell.theme, cell.viewport))) return { ...cell, windows: null };
    return cell;
  });

console.log(`Cascade change map: ${cssPaths.length} stylesheet(s)${scriptPaths.length ? `, ${scriptPaths.length} script/markup file(s)` : ""} changed since ${BASE}.`);
if (!work.length) {
  console.log(cssPaths.length || scriptPaths.length
    ? "No changed rule matches an element any baseline window carries; nothing to capture."
    : "No stylesheet or app script changed; nothing to capture.");
  process.exit(0);
}
for (const cell of work) {
  console.log(`  ${cell.theme}@${cell.viewport}: ${cell.windows ? `${cell.windows.length} window(s): ${cell.windows.join(", ")}` : "every window"}`);
  for (const reason of cell.why.slice(0, 3)) console.log(`      ${reason}`);
}
if (PLAN_ONLY) process.exit(0);

const missing = work.filter((cell) => !existsSync(baselineFile(cell.theme, cell.viewport)));
if (missing.length) {
  console.error(`\nNo baseline for ${missing.map((cell) => `${cell.theme}@${cell.viewport}`).join(", ")}.`);
  console.error("Capture them on a clean tree: node tooling/cascade-ledger.mjs --update --themes <ids> --viewport <WxH>");
  process.exit(2);
}

if (!args.includes("--no-build")) {
  try {
    execFileSync(process.execPath, ["tooling/build-app-bundle.mjs"], { cwd: repositoryRoot, stdio: "ignore" });
  } catch {
    console.error("The app bundle did not build (node tooling/build-app-bundle.mjs); nothing was captured.");
    process.exit(2);
  }
}
mkdirSync(REPORT_DIR, { recursive: true });

function runCell(cell) {
  return new Promise((resolve) => {
    const report = `dist/verification/cascade-changed/${cell.theme}@${cell.viewport}.json`;
    const cellArgs = ["tooling/cascade-ledger.mjs", "--verify", "--no-build", "--themes", cell.theme, "--viewport", cell.viewport, "--report", report, "--out", LEDGER_ARG];
    if (ACCEPT) cellArgs.push("--accept");
    if (cell.windows) {
      cellArgs.push("--windows", cell.windows.join(","));
      const rulesFile = `dist/verification/cascade-changed/${cell.theme}@${cell.viewport}.rules.json`;
      writeFileSync(join(repositoryRoot, rulesFile), JSON.stringify(cell.rules || []));
      cellArgs.push("--changed-rules", rulesFile);
    }
    const started = Date.now();
    const child = spawn(process.execPath, cellArgs, { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => resolve({ cell, code, output, seconds: Math.round((Date.now() - started) / 1000), report: join(repositoryRoot, report) }));
  });
}

const started = Date.now();
const queue = [...work].sort((a, b) => (a.windows ? 1 : 0) - (b.windows ? 1 : 0));
const results = [];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) {
    const result = await runCell(queue.shift());
    results.push(result);
    const { cell, code, seconds } = result;
    const summary = code === 0 ? "OK" : code === 1 ? "CHANGED" : "FAILED RUN";
    console.log(`  ${summary.padEnd(10)} ${cell.theme}@${cell.viewport} (${cell.windows ? `${cell.windows.length} window(s)` : "every window"}) in ${seconds}s`);
  }
}));

const failed = results.filter((result) => result.code !== 0);
for (const result of failed) {
  console.log(`\n--- ${result.cell.theme}@${result.cell.viewport} ---`);
  // The per-cell report minus phase timings and the lines every cell repeats.
  console.log(result.output.split("\n")
    .filter((line) => !/^\s+\S+: \w+ done in \d+s$|^\s+window \S+: |^\s+winner check:|^Report: |^FAILED: |^OK: /.test(line))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim());
}
writeFileSync(join(REPORT_DIR, "summary.json"), `${JSON.stringify({
  generatedBy: "tooling/cascade-changed.mjs",
  generatedAt: new Date().toISOString(),
  base: BASE,
  stylesheets: cssPaths,
  scripts: scriptPaths,
  cells: results.map(({ cell, code, seconds, report }) => ({ ...cell, exit: code, seconds, report: report.replace(`${repositoryRoot}/`, "") })),
}, null, 1)}\n`);
const seconds = Math.round((Date.now() - started) / 1000);
const flips = results.filter((result) => result.code === 1).length;
const broken = results.filter((result) => result.code !== 0 && result.code !== 1).length;
console.log(`\n${results.length} cell(s) in ${seconds}s: ${results.length - flips - broken} clean, ${flips} with flips or derived changes, ${broken} failed to run.`);
if (flips) {
  console.log(`A change you did not mean: fix the rule it names. One you meant: write it into the baselines and commit them with the change:
  npm run verify:cascade-changed -- --base ${BASE} --accept`);
}
process.exitCode = broken ? 2 : flips ? 1 : 0;
