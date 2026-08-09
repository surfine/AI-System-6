// Six-era visual baseline for the shared Theme Lab specimen.
//
// The DOM is deliberately identical for every capture. Only the canonical
// Appearance id changes, so a diff reveals token or shared-recipe drift rather
// than a per-theme fixture quietly changing underneath the comparison.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const THEMES = Object.freeze(["classic", "platinum", "liquid-glass"]);
const VIEWPORT = Object.freeze({ width: 1280, height: 820 });
const BASELINE_DIR = join(root, "tests", "visual", "theme-lab");
const CURRENT_DIR = join(root, "drafts", "theme-lab-current");
const CHANNEL_TOLERANCE = 10;
const PIXEL_RATIO_TOLERANCE = 0.002;

const mode = process.argv[2] || "--verify";
if (!["--verify", "--update"].includes(mode)) {
  console.error("Usage: node scripts/theme-lab-snapshot.mjs --verify|--update");
  process.exit(1);
}

function resolvePlaywright() {
  for (const candidate of ["playwright", process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
    try {
      return require(candidate);
    } catch {
      // Try the next configured runtime.
    }
  }
  throw new Error("Playwright is required for Theme Lab snapshots.");
}

function chromeExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpReady(url) {
  return new Promise((resolve) => {
    const request = get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => port ? resolve(port) : reject(new Error("Could not allocate a local port")));
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
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (await httpReady(url)) return { child, url, output: () => output };
    if (child.exitCode !== null) break;
    await wait(150);
  }
  child.kill("SIGTERM");
  throw new Error(`Theme Lab server did not become ready.\n${output.trim()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function captureTheme(browser, url, themeId) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  try {
    await context.addInitScript((id) => {
      localStorage.setItem("ai-system-6-theme", id);
      localStorage.removeItem("ai-system-6-liquid-glass");
    }, themeId);
    const page = await context.newPage();
    const diagnostics = [];
    page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => ["ready", "error"].includes(document.body.dataset.appReady), null, { timeout: 15000 });
    const readiness = await page.evaluate(() => ({
      appReady: document.body.dataset.appReady,
      bootHidden: document.querySelector("#boot-screen")?.hidden === true,
      bootStatus: document.querySelector("#boot-status")?.textContent || "",
    }));
    if (readiness.appReady !== "ready" || !readiness.bootHidden) {
      throw new Error(`App boot failed for ${themeId}: ${JSON.stringify(readiness)}\n${diagnostics.join("\n")}`);
    }
    await page.evaluate((id) => {
      window.AISystem6Theme?.applyTheme(id, {
        persist: false,
        announce: false,
        modernFontPreference: false,
      });
      window.AISystem6LiquidGlassOverlay?.setEnabled(false);
      document.querySelector("#liquid-glass-overlay")?.setAttribute("hidden", "");
      document.body.classList.remove("is-writer-mode", "is-cloud-active", "quick-draft-focus");
      for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
      for (const win of document.querySelectorAll(".window")) {
        win.classList.add("is-hidden");
        win.classList.remove("is-active");
      }
      const lab = document.querySelector('[data-window="themeLab"]');
      lab?.classList.remove("is-hidden");
      lab?.classList.add("is-active");
      const style = document.createElement("style");
      style.id = "theme-lab-snapshot-stability";
      style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          caret-color: transparent !important;
          transition: none !important;
        }
      `;
      document.head.append(style);
      void document.body.offsetHeight;
    }, themeId);
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(180);
    const target = page.locator('[data-window="themeLab"]');
    await target.waitFor({ state: "visible" });
    const path = join(CURRENT_DIR, `${themeId}.png`);
    await target.screenshot({ path, animations: "disabled" });
    return path;
  } finally {
    await context.close();
  }
}

async function decode(path) {
  const { createCanvas, loadImage } = require("canvas");
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, pixels: context.getImageData(0, 0, image.width, image.height).data };
}

async function comparePng(baselinePath, currentPath) {
  const [baseline, current] = await Promise.all([decode(baselinePath), decode(currentPath)]);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      pass: false,
      ratio: 1,
      detail: `dimensions ${baseline.width}x${baseline.height} -> ${current.width}x${current.height}`,
    };
  }
  let changed = 0;
  const total = baseline.width * baseline.height;
  for (let index = 0; index < baseline.pixels.length; index += 4) {
    const delta = Math.max(
      Math.abs(baseline.pixels[index] - current.pixels[index]),
      Math.abs(baseline.pixels[index + 1] - current.pixels[index + 1]),
      Math.abs(baseline.pixels[index + 2] - current.pixels[index + 2]),
      Math.abs(baseline.pixels[index + 3] - current.pixels[index + 3]),
    );
    if (delta > CHANNEL_TOLERANCE) changed += 1;
  }
  const ratio = changed / total;
  return {
    pass: ratio <= PIXEL_RATIO_TOLERANCE,
    ratio,
    detail: `${changed}/${total} pixels (${(ratio * 100).toFixed(3)}%)`,
  };
}

mkdirSync(CURRENT_DIR, { recursive: true });
if (mode === "--update") mkdirSync(BASELINE_DIR, { recursive: true });

let server;
let browser;
try {
  server = await startAppServer();
  const { chromium } = resolvePlaywright();
  const launchOptions = { headless: true, args: ["--no-sandbox"] };
  const executablePath = chromeExecutablePath();
  if (executablePath) launchOptions.executablePath = executablePath;
  browser = await chromium.launch(launchOptions);

  const captured = await Promise.all(THEMES.map(async (themeId) => {
    const path = await captureTheme(browser, server.url, themeId);
    console.log(`OK  captured Theme Lab: ${themeId}`);
    return [themeId, path];
  }));
  const currentPaths = new Map(captured);

  if (mode === "--update") {
    for (const themeId of THEMES) {
      copyFileSync(currentPaths.get(themeId), join(BASELINE_DIR, `${themeId}.png`));
    }
    console.log(`OK  updated ${THEMES.length} Theme Lab baselines in tests/visual/theme-lab/`);
  } else {
    let failed = 0;
    for (const themeId of THEMES) {
      const baselinePath = join(BASELINE_DIR, `${themeId}.png`);
      if (!existsSync(baselinePath)) {
        console.error(`NO  missing Theme Lab baseline: ${baselinePath}`);
        failed += 1;
        continue;
      }
      const result = await comparePng(baselinePath, currentPaths.get(themeId));
      if (result.pass) console.log(`OK  ${themeId}: ${result.detail}`);
      else {
        console.error(`NO  ${themeId}: ${result.detail}`);
        failed += 1;
      }
    }
    if (failed) {
      console.error(`Theme Lab visual verification failed: ${failed} era(s). Current captures: drafts/theme-lab-current/`);
      process.exitCode = 1;
    } else {
      console.log(`OK  Theme Lab visual verification passed for ${THEMES.length} eras.`);
    }
  }
} catch (error) {
  console.error(`Theme Lab snapshot failed: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopProcess(server?.child);
}

process.exit(process.exitCode || 0);
