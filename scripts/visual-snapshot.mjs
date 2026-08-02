// Visual snapshot driver — last-line check that CSS changes didn't silently
// shift computed values in either theme.
//
// Why a separate gate from verify:css:
//   verify:css enforces structural budgets (!important / z-index counts, twin
//   counts, single token source). None of those catch the case where a value
//   *changed* unintentionally — e.g. the cascade-order trap where deleting a
//   liquid-glass twin causes a generic theme rule to win.
//
// Why not in verify:release by default:
//   Capture requires a local browser (computed styles + getBoundingClientRect
//   need a real layout engine). That makes it environment-sensitive and slow.
//   CSS work should still run `npm run verify:visual` before reporting done.
//
// Automated path:
//   npm run verify:visual
//
// Manual path still exists for restricted environments:
//   node scripts/visual-snapshot.mjs --eval
//   node scripts/visual-snapshot.mjs --diff path/to/current.json

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { get } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { SNAPSHOT_EVAL, SNAPSHOT_VIEWPORT, SNAPSHOT_THEMES, SNAPSHOT_TARGETS } from "../tests/visual-snapshot-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE_PATH = join(root, "tests/visual-snapshot.json");
const DEFAULT_CURRENT_PATH = join(root, "drafts", "visual-snapshot-current.json");

const args = process.argv.slice(2);
const mode = args[0];
const pathArg = args[1];
const require = createRequire(import.meta.url);

function usage(exitCode = 1) {
  console.error(`Usage:
  node scripts/visual-snapshot.mjs --eval
      Print the browser expression to evaluate via preview_eval (or DevTools).

  node scripts/visual-snapshot.mjs --capture [url] [out.json]
      Open a running app URL in a real browser and write a current snapshot.

  node scripts/visual-snapshot.mjs --verify
      Build-time visual gate for CSS work: start a local server, capture, then
      diff against tests/visual-snapshot.json.

  node scripts/visual-snapshot.mjs --diff <path-to-current.json>
      Compare current snapshot against tests/visual-snapshot.json.
      Exit 0 if identical, 1 if any property drifted.

  node scripts/visual-snapshot.mjs --update <path-to-current.json>
      Overwrite tests/visual-snapshot.json with current snapshot.
      Use after confirming the drift is intentional.

  node scripts/visual-snapshot.mjs --info
      Print manifest summary (viewport, themes, target count).
`);
  process.exit(exitCode);
}

function resolveOptionalPlaywright() {
  const candidates = [
    "playwright",
    process.env.PLAYWRIGHT_MODULE,
    "/Users/aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next known location.
    }
  }
  console.error(
    "Playwright is required for --capture/--verify. Install it locally or set PLAYWRIGHT_MODULE to a resolvable package path."
  );
  process.exit(1);
}

function chromeExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || undefined;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpReady(url) {
  return new Promise((resolve) => {
    const req = get(url, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await httpReady(url)) return;
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error("Could not allocate port")));
    });
    server.on("error", reject);
  });
}

async function startAppServer() {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("exit", (code) => {
    if (code !== null && code !== 0 && code !== 130) {
      console.error(output.trim());
    }
  });
  try {
    await waitForServer(url);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  return { url, child };
}

async function captureSnapshot(url) {
  const { chromium } = resolveOptionalPlaywright();
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox"],
  };
  const executablePath = chromeExecutablePath();
  if (executablePath) launchOptions.executablePath = executablePath;
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({
      viewport: SNAPSHOT_VIEWPORT,
      deviceScaleFactor: 1,
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#boot-screen")?.hidden === true, null, { timeout: 12000 });
    return await page.evaluate(SNAPSHOT_EVAL);
  } finally {
    await browser.close();
  }
}

function writeSnapshot(path, snapshot) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
}

function readSnapshot(path) {
  if (!existsSync(path)) {
    console.error(`Snapshot file not found: ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function diffSnapshots(baseline, current) {
  const drift = [];
  for (const theme of SNAPSHOT_THEMES) {
    const b = baseline[theme] || {};
    const c = current[theme] || {};
    const sels = new Set([...Object.keys(b), ...Object.keys(c)]);
    for (const sel of sels) {
      const before = b[sel];
      const after = c[sel];
      if (before == null && after == null) continue;
      if (before == null) { drift.push({ theme, sel, type: "appeared" }); continue; }
      if (after == null) { drift.push({ theme, sel, type: "disappeared" }); continue; }
      const props = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const p of props) {
        if (before[p] !== after[p]) {
          drift.push({ theme, sel, prop: p, was: before[p], now: after[p] });
        }
      }
    }
  }
  return drift;
}

if (!mode || mode === "--help" || mode === "-h") usage(0);

if (mode === "--info") {
  console.log(`Visual snapshot manifest`);
  console.log(`  viewport:  ${SNAPSHOT_VIEWPORT.width}x${SNAPSHOT_VIEWPORT.height}`);
  console.log(`  themes:    ${SNAPSHOT_THEMES.join(", ")}`);
  console.log(`  targets:   ${SNAPSHOT_TARGETS.length} selectors`);
  console.log(`  baseline:  tests/visual-snapshot.json ${existsSync(BASELINE_PATH) ? "(present)" : "(missing — run --update with a captured snapshot)"}`);
  console.log(`  current:   ${DEFAULT_CURRENT_PATH.replace(`${root}/`, "")}`);
  process.exit(0);
}

if (mode === "--eval") {
  console.log(`// Paste this whole expression into preview_eval (or DevTools console).`);
  console.log(`// It captures the snapshot for both themes and returns JSON.`);
  console.log(`// Save the returned JSON to a file, then run:`);
  console.log(`//   node scripts/visual-snapshot.mjs --diff <that-file.json>`);
  console.log(`//`);
  console.log(`// Viewport for this snapshot: ${SNAPSHOT_VIEWPORT.width}x${SNAPSHOT_VIEWPORT.height}`);
  console.log(`// Resize the browser to match before evaluating.`);
  console.log(``);
  console.log(SNAPSHOT_EVAL);
  process.exit(0);
}

if (mode === "--capture") {
  const url = pathArg || "http://127.0.0.1:4173";
  const outPath = resolve(args[2] || DEFAULT_CURRENT_PATH);
  const snapshot = await captureSnapshot(url);
  writeSnapshot(outPath, snapshot);
  console.log(`OK  Visual snapshot captured: ${outPath}`);
  process.exit(0);
}

if (mode === "--verify") {
  let server = null;
  try {
    server = await startAppServer();
    const snapshot = await captureSnapshot(server.url);
    writeSnapshot(DEFAULT_CURRENT_PATH, snapshot);
    const baseline = readSnapshot(BASELINE_PATH);
    const drift = diffSnapshots(baseline, snapshot);
    if (!drift.length) {
      const entryCount = Object.values(baseline).reduce((n, t) => n + Object.keys(t).length, 0);
      console.log(`OK  Visual snapshot stable. ${entryCount} entries compared, 0 drifted.`);
      console.log(`    current snapshot: ${DEFAULT_CURRENT_PATH}`);
      process.exit(0);
    }
    console.error(`NO  Visual snapshot drift: ${drift.length} change(s).`);
    drift.slice(0, 80).forEach((d) => {
      if (d.type) {
        console.error(`  [${d.theme}] ${d.sel} ${d.type}`);
      } else {
        console.error(`  [${d.theme}] ${d.sel} ${d.prop}: ${d.was} -> ${d.now}`);
      }
    });
    if (drift.length > 80) console.error(`  ... and ${drift.length - 80} more`);
    console.error(`If intentional, inspect ${DEFAULT_CURRENT_PATH} and run: node scripts/visual-snapshot.mjs --update ${DEFAULT_CURRENT_PATH}`);
    process.exit(1);
  } catch (error) {
    console.error(`Visual snapshot verification failed: ${error.message}`);
    process.exit(1);
  } finally {
    if (server?.child && !server.child.killed) server.child.kill("SIGTERM");
  }
}

if (mode === "--update") {
  if (!pathArg) usage();
  const current = readSnapshot(resolve(pathArg));
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`OK  Baseline updated: ${BASELINE_PATH}`);
  console.log(`    ${Object.values(current).reduce((n, t) => n + Object.keys(t).length, 0)} (selector × theme) entries written.`);
  process.exit(0);
}

if (mode === "--diff") {
  if (!pathArg) usage();
  if (!existsSync(BASELINE_PATH)) {
    console.error(`No baseline at ${BASELINE_PATH}. Run --update first to seed.`);
    process.exit(1);
  }
  const baseline = readSnapshot(BASELINE_PATH);
  const current = readSnapshot(resolve(pathArg));
  const drift = diffSnapshots(baseline, current);
  if (!drift.length) {
    const entryCount = Object.values(baseline).reduce((n, t) => n + Object.keys(t).length, 0);
    console.log(`OK  Visual snapshot stable. ${entryCount} entries compared, 0 drifted.`);
    process.exit(0);
  }
  console.error(`NO  Visual snapshot drift: ${drift.length} change(s).`);
  for (const d of drift) {
    if (d.type === "appeared") {
      console.error(`  [${d.theme}] ${d.sel}  appeared (was absent in baseline)`);
    } else if (d.type === "disappeared") {
      console.error(`  [${d.theme}] ${d.sel}  disappeared (was present in baseline)`);
    } else {
      console.error(`  [${d.theme}] ${d.sel}  ${d.prop}`);
      console.error(`      was: ${d.was}`);
      console.error(`      now: ${d.now}`);
    }
  }
  console.error(``);
  console.error(`If intentional, run: node scripts/visual-snapshot.mjs --update ${pathArg}`);
  process.exit(1);
}

usage();
