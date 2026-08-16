// Six-era visual baseline for the shared Theme Lab specimen.
//
// The DOM is deliberately identical for every capture. Only the canonical
// Appearance id changes, so a diff reveals token or shared-recipe drift rather
// than a per-theme fixture quietly changing underneath the comparison.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReferenceAssets,
  describeReferenceAssetLoadFailures,
  isReferenceAssetPath,
  watchReferenceAssetLoads,
} from "./lib/reference-assets.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const THEMES = Object.freeze(["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"]);
// Theme Lab styles are dev-only: they are absent from the production bundle
// and injected here by the verification tooling.
const LAB_CSS = readFileSync(join(root, "apps/desktop/styles/66-theme-lab.css"), "utf8");
// The stability fixture expands the lab to its full intrinsic height. Keep the
// capture canvas taller than the largest era so Playwright never scrolls the
// absolute-positioned window before taking its element screenshot.
const VIEWPORT = Object.freeze({ width: 1280, height: 1040 });
const BASELINE_DIR = join(root, "tests", "visual", "theme-lab");
const CURRENT_DIR = join(root, "internal", "evidence", "drafts", "theme-lab-current");
const CHANNEL_TOLERANCE = 10;
const PIXEL_RATIO_TOLERANCE = 0.002;
const MAX_CAPTURE_ATTEMPTS = 2;

const mode = process.argv[2] || "--verify";
if (!["--verify", "--update"].includes(mode)) {
  console.error("Usage: node tooling/theme-lab-snapshot.mjs --verify|--update");
  process.exit(1);
}

// Refuse to capture anything on a worktree whose reference submodule is empty:
// the fallback font shifts every metric and the resulting diff blames innocent code.
assertReferenceAssets("Theme Lab snapshot", root);

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
  const child = spawn(process.execPath, ["apps/server/server.js"], {
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
    const referenceAssetProblems = watchReferenceAssetLoads(page);
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
    await page.evaluate(() => window.AISystem6EnsureThemeLabModule?.());
    await page.evaluate(({ id, css }) => {
      // The lab keeps one tab panel in the document at a time so an era switch
      // repaints one board. A capture wants the whole atlas, so ask for it
      // before the sync below builds the panels.
      const labWindow = document.querySelector('[data-window="themeLab"]');
      if (labWindow) labWindow.dataset.themeLabCapture = "all";
      window.AISystem6Theme?.applyTheme(id, {
        experimental: true,
        persist: false,
        announce: false,
        modernFontPreference: false,
      });
      window.AISystem6ThemeLab?.sync?.(window.AISystem6Theme?.getTheme?.(id));
      window.AISystem6LiquidGlassOverlay?.setEnabled(false);
      document.querySelector("#liquid-glass-overlay")?.setAttribute("hidden", "");
      document.body.classList.remove("is-writer-mode", "is-cloud-active", "quick-draft-focus");
      for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
      for (const win of document.querySelectorAll(".window")) {
        win.classList.add("is-hidden");
        win.classList.remove("is-active");
      }
      // Not every floating surface is a .window. The Writing Flow spine is a
      // panel, and a restored desk can put it over the lab — it appeared in one
      // capture and not the next, which is most of the drift these baselines
      // were showing. Hide anything else that floats over the desk.
      for (const panel of document.querySelectorAll(
        ".writing-spine-panel, .control-strip, .balloon, .popover, [data-window-overlay]"
      )) {
        panel.style.setProperty("display", "none", "important");
      }
      // The guide (Start Here OOBE) opens on first boot and covers the Theme
      // Lab titlebar unless fully suppressed (guideSeen lives in IndexedDB,
      // so the class alone is not enough).
      const guide = document.querySelector('[data-window="guide"]');
      if (guide) {
        guide.classList.add("is-hidden");
        guide.style.setProperty("display", "none", "important");
      }
      const lab = document.querySelector('[data-window="themeLab"]');
      lab?.classList.remove("is-hidden");
      lab?.classList.add("is-active");
      // Pin the specimen window to its stylesheet frame. The window manager
      // may have left inline position from an earlier layout, and any leftover
      // transform/offset shifts the element screenshot by a few pixels on
      // some runs (observed as identical whole-window diffs across captures).
      lab?.style.removeProperty("left");
      lab?.style.removeProperty("top");
      lab?.style.removeProperty("right");
      lab?.style.removeProperty("transform");
      if (!document.querySelector("#theme-lab-dev-styles")) {
        const labStyle = document.createElement("style");
        labStyle.id = "theme-lab-dev-styles";
        labStyle.textContent = css;
        document.head.append(labStyle);
      }
      const style = document.createElement("style");
      style.id = "theme-lab-snapshot-stability";
      style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          caret-color: transparent !important;
          transition: none !important;
        }
        [data-window="themeLab"] {
          height: auto !important;
          max-height: none !important;
        }
        [data-window="themeLab"] .theme-lab-pane {
          overflow: visible !important;
        }
        html, body {
          scroll-behavior: auto !important;
        }
      `;
      document.head.append(style);
      void document.body.offsetHeight;
    }, { id: themeId, css: LAB_CSS });
    await page.evaluate(() => document.fonts?.ready);
    // Wait for the pixels, not for a guess at how long they take. The lab
    // builds its icon grid in JS and paints lamps and tiles from dozens of
    // PNGs; a fixed pause races their decode, and whichever sprites had not
    // arrived that run came out blank. Two consecutive captures of an
    // unchanged tree could then differ by a third of a percent, which is more
    // than the drift budget, so the era that failed changed run to run.
    await page.evaluate(async () => {
      const images = [...document.images].filter((image) => !image.complete);
      await Promise.all(images.map((image) => image.decode().catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForTimeout(180);
    const target = page.locator('[data-window="themeLab"]');
    await target.waitFor({ state: "visible" });
    // Element screenshots depend on the live scroll position: when the
    // specimen window is taller than the viewport, Playwright scrolls and
    // stitches, and a scroll settling mid-capture shifts the whole image by
    // the window's top offset (the observed flake). Capture the full page
    // from a pinned scroll position and crop the window box instead.
    await page.evaluate(() => window.scrollTo(0, 0));
    // Pin the window's own left and top too, not just the scroll. The desk
    // places a restored window from saved state and nudges it clear of its
    // neighbours, so its x could differ by a few pixels between two runs of an
    // unchanged tree. The crop follows the live box, so that nudge slid the
    // whole image sideways: one capture kept the leading label and the era
    // bar's first year, the next cut them off, and the two disagreed by more
    // than the drift budget.
    await target.evaluate((el) => {
      el.style.left = "0px";
      el.style.top = "0px";
      el.style.right = "auto";
      el.style.transform = "none";
    });
    await page.waitForTimeout(120);
    const box = await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error(`Theme Lab has no box for ${themeId}`);
    }
    // The Theme Lab window is absolutely positioned, so a tall evidence
    // section can extend beyond the document's scroll height. Expand only the
    // disposable capture page before full-page capture; otherwise the crop
    // below would contain transparent rows after the viewport boundary.
    await page.evaluate(({ y, height }) => {
      const captureHeight = `${Math.ceil(y + height)}px`;
      document.documentElement.style.minHeight = captureHeight;
      document.body.style.minHeight = captureHeight;
    }, box);
    const path = join(CURRENT_DIR, `${themeId}.png`);
    const fullPath = join(CURRENT_DIR, `${themeId}-full.png`);
    await page.screenshot({ path: fullPath, fullPage: true, animations: "disabled" });
    // The full-page paint has now requested every webfont and control SVG. A
    // reference asset that failed here means this PNG was rendered with
    // fallback art, so refuse it rather than compare it against a baseline.
    const assetProblems = referenceAssetProblems();
    if (assetProblems.length) {
      throw new Error(describeReferenceAssetLoadFailures(assetProblems, `Theme Lab ${themeId}`));
    }
    const { createCanvas, loadImage } = require("canvas");
    const fullImage = await loadImage(fullPath);
    const canvas = createCanvas(Math.round(box.width), Math.round(box.height));
    const canvasContext = canvas.getContext("2d");
    canvasContext.drawImage(fullImage, -Math.round(box.x), -Math.round(box.y));
    writeFileSync(path, canvas.toBuffer("image/png"));
    return path;
  } finally {
    await context.close();
  }
}

async function captureThemeWithRetry(browser, url, themeId) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt += 1) {
    try {
      return await captureTheme(browser, url, themeId);
    } catch (error) {
      lastError = error;
      // A missing reference asset fails identically on every attempt.
      if (isReferenceAssetPath(error?.message)) break;
      if (attempt < MAX_CAPTURE_ATTEMPTS) {
        console.warn(`RETRY  Theme Lab ${themeId}: ${error.message}`);
        await wait(250);
      }
    }
  }
  throw lastError;
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
  // Match the fidelity pipeline's font rendering: without these flags the
  // text rasterization depends on the host LCD/hinting state and the same
  // theme can diff against its own baseline on every run (observed as 0.1-1.4%
  // pixel noise across text-heavy eras).
  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--force-color-profile=srgb",
      "--disable-lcd-text",
      "--font-render-hinting=none",
    ],
  };
  const executablePath = chromeExecutablePath();
  if (executablePath) launchOptions.executablePath = executablePath;
  browser = await chromium.launch(launchOptions);

  // One era at a time. Capturing all six at once let them compete for font
  // loading and rasterization inside one browser, so the scheduling decided
  // the pixels: the eras finished in a different order each run, and the two
  // runs of an unchanged tree disagreed by more than the drift budget. A
  // release gate is worth the extra minute.
  const captured = [];
  for (const themeId of THEMES) {
    const path = await captureThemeWithRetry(browser, server.url, themeId);
    console.log(`OK  captured Theme Lab: ${themeId}`);
    captured.push([themeId, path]);
  }
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
      console.error(`Theme Lab visual verification failed: ${failed} era(s). Current captures: internal/evidence/drafts/theme-lab-current/`);
      process.exitCode = 1;
    } else {
      console.log(`OK  Theme Lab visual verification passed for ${THEMES.length} eras.`);
    }
  }
} catch (error) {
  // A reference-asset failure is self-explanatory; a stack trace only buries it.
  const detail = isReferenceAssetPath(error?.message) ? error.message : (error.stack || error.message);
  console.error(`Theme Lab snapshot failed: ${detail}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopProcess(server?.child);
}

process.exit(process.exitCode || 0);
