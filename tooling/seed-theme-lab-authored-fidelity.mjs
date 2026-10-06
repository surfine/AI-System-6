#!/usr/bin/env node
// One-shot seeder: freeze Theme Lab specimen PNGs into the local fidelity cache
// and emit sha256/width/height metadata for authored boards. Not a release gate.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const playwrightVersion = require("playwright/package.json").version;

const CACHE_ROOT = join(root, "internal", "evidence", "drafts", "theme-lab-fidelity-cache");
const themesArg = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const THEMES = themesArg.length
  ? themesArg
  : ["tiger", "system-7", "classic", "drawing-board", "nextstep", "big-sur", "liquid-glass"];

const SPECIMENS = {
  tiger: [
    { file: "theme-lab-finder-metal-window.png", selector: ".theme-lab-finder-window", setup: metalFinderSetup },
    { file: "theme-lab-finder-metal-titleband.png", selector: ".theme-lab-finder-window > .title-bar", setup: metalTitleSetup, crop: { x: 80, y: 0, width: 200, height: 22 } },
    { file: "theme-lab-finder-close-lamp.png", selector: ".theme-lab-finder-window > .title-bar > .close-box" },
    { file: "theme-lab-finder-zoom-lamp.png", selector: ".theme-lab-finder-window > .title-bar > .resize-box" },
  ],
  "system-7": [
    { file: "theme-lab-finder-titlebar.png", selector: ".theme-lab-finder-window > .title-bar", setup: classicTitleSetup, crop: { x: 40, y: 0, width: 180, height: 18 } },
    { file: "theme-lab-close-box.png", selector: ".theme-lab-finder-window > .title-bar > .close-box" },
    { file: "theme-lab-default-ok.png", selector: ".theme-lab-button-row .btn.default" },
    { file: "theme-lab-checkbox-checked.png", selector: ".theme-lab-controls label.field-row:has(input[type=checkbox]:checked)", fallback: ".theme-lab-controls label:has(input[type=checkbox]:checked)" },
  ],
  classic: [
    { file: "theme-lab-finder-titlebar.png", selector: ".theme-lab-finder-window > .title-bar", setup: classicTitleSetup, crop: { x: 40, y: 0, width: 180, height: 20 } },
    { file: "theme-lab-close-box.png", selector: ".theme-lab-finder-window > .title-bar > .close-box" },
    { file: "theme-lab-default-ok.png", selector: ".theme-lab-button-row .btn.default" },
    { file: "theme-lab-popup.png", selector: ".theme-lab-form-grid > label:nth-child(4) .system-select-button" },
  ],
  "drawing-board": [
    { file: "theme-lab-finder-titlebar.png", selector: ".theme-lab-finder-window > .title-bar", setup: classicTitleSetup, crop: { x: 40, y: 0, width: 180, height: 20 } },
    { file: "theme-lab-close-box.png", selector: ".theme-lab-finder-window > .title-bar > .close-box" },
    { file: "theme-lab-default-ok.png", selector: ".theme-lab-button-row .btn.default" },
    { file: "theme-lab-selected-tab.png", selector: ".theme-lab-tab-specimen .system-tab.is-active" },
  ],
  nextstep: [
    { file: "theme-lab-finder-titlebar.png", selector: ".theme-lab-finder-window > .title-bar", setup: classicTitleSetup, crop: { x: 40, y: 0, width: 200, height: 22 } },
    { file: "theme-lab-default-ok.png", selector: ".theme-lab-button-row .btn.default" },
    { file: "theme-lab-popup.png", selector: ".theme-lab-form-grid > label:nth-child(4) .system-select-button" },
    { file: "theme-lab-scroll-thumb.png", selector: ".theme-lab-scroll-specimen .window-frame-bar.is-vertical .window-frame-thumb" },
  ],
  "big-sur": [
    { file: "theme-lab-finder-titlebar.png", selector: ".theme-lab-finder-window > .title-bar", setup: aquaTitleSetup, crop: { x: 80, y: 0, width: 200, height: 22 } },
    { file: "theme-lab-close-lamp.png", selector: ".theme-lab-finder-window > .title-bar > .close-box" },
    { file: "theme-lab-default-ok.png", selector: ".theme-lab-button-row .btn.default" },
    { file: "theme-lab-sidebar-active.png", selector: ".theme-lab-sidebar button.is-selected" },
  ],
  "liquid-glass": [
    { file: "theme-lab-finder-titlebar.png", selector: ".theme-lab-finder-window > .title-bar", setup: aquaTitleSetup, crop: { x: 80, y: 0, width: 200, height: 22 } },
    { file: "theme-lab-close-lamp.png", selector: ".theme-lab-finder-window > .title-bar > .close-box" },
    { file: "theme-lab-default-ok.png", selector: ".theme-lab-button-row .btn.default" },
    { file: "theme-lab-selected-tab.png", selector: ".theme-lab-tab-specimen .system-tab.is-active" },
  ],
};

function metalFinderSetup() {
  return [
    {
      selector: ".theme-lab-finder-window",
      style: { width: "420px", minWidth: "420px", maxWidth: "420px", height: "280px", minHeight: "280px", maxHeight: "280px" },
    },
  ];
}

function metalTitleSetup() {
  return [
    {
      selector: ".theme-lab-finder-window",
      style: { width: "400px", minWidth: "400px", maxWidth: "400px" },
    },
    {
      selector: ".theme-lab-finder-window > .title-bar",
      style: { width: "400px", minWidth: "400px", maxWidth: "400px" },
    },
    {
      selector: ".theme-lab-finder-window > .title-bar > h2",
      text: " ",
    },
  ];
}

function classicTitleSetup() {
  return metalTitleSetup();
}

function aquaTitleSetup() {
  return metalTitleSetup();
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function httpReady(url) {
  return new Promise((resolveReady) => {
    const request = get(url, (response) => {
      response.resume();
      resolveReady(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolveReady(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

async function getFreePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port ? resolvePort(port) : reject(new Error("no port"))));
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
  throw new Error(`server not ready\n${output}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

async function openThemeLab(page, themeId) {
  const labCss = readFileSync(join(root, "apps/desktop/styles/66-theme-lab.css"), "utf8");
  await page.evaluate(({ themeId: id, css }) => {
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
    document.documentElement.lang = "en";
    document.documentElement.style.zoom = "1";
    document.body.classList.remove("is-writer-mode", "is-cloud-active", "quick-draft-focus");
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    for (const win of document.querySelectorAll(".window[data-window]")) {
      win.classList.add("is-hidden");
      win.classList.remove("is-active");
    }
    const guide = document.querySelector('[data-window="guide"]');
    if (guide) {
      guide.classList.add("is-hidden");
      guide.style.setProperty("display", "none", "important");
    }
    const lab = document.querySelector('[data-window="themeLab"]');
    lab?.classList.remove("is-hidden");
    lab?.classList.add("is-active");
    if (!document.querySelector("#theme-lab-dev-styles")) {
      const labStyle = document.createElement("style");
      labStyle.id = "theme-lab-dev-styles";
      labStyle.textContent = css;
      document.head.append(labStyle);
    }
    const style = document.createElement("style");
    style.id = "theme-lab-fidelity-stability";
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        transition: none !important;
      }
    `;
    document.head.append(style);
    window.scrollTo(0, 0);
    void document.body.offsetHeight;
  }, { themeId, css: labCss });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(180);
  const lab = page.locator('[data-window="themeLab"]');
  await lab.waitFor({ state: "visible" });
  const box = await lab.boundingBox();
  return box;
}

async function applySetup(page, steps = []) {
  if (!steps.length) return [];
  return page.evaluate((setupSteps) => setupSteps.map((step) => {
    const element = document.querySelectorAll(step.selector)[step.index || 0];
    if (!element) throw new Error(`Missing setup selector: ${step.selector}`);
    const saved = {
      selector: step.selector,
      index: step.index || 0,
      style: element.getAttribute("style"),
      text: element.textContent,
      textTouched: Object.hasOwn(step, "text"),
      styleTouched: Boolean(step.style),
    };
    if (step.style) Object.assign(element.style, step.style);
    if (Object.hasOwn(step, "text")) element.textContent = step.text;
    return saved;
  }), steps);
}

async function restoreSetup(page, saved) {
  if (!saved.length) return;
  await page.evaluate((entries) => {
    for (const entry of entries) {
      const element = document.querySelectorAll(entry.selector)[entry.index || 0];
      if (!element) continue;
      if (entry.styleTouched) {
        if (entry.style == null) element.removeAttribute("style");
        else element.setAttribute("style", entry.style);
      }
      if (entry.textTouched) element.textContent = entry.text;
    }
  }, saved);
}

async function resolveSelector(page, specimen) {
  const candidates = [specimen.selector, specimen.fallback].filter(Boolean);
  for (const selector of candidates) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false);
      if (visible) return selector;
    }
  }
  // Probe useful alternatives for checkboxes / sidebars
  const probes = await page.evaluate(() => {
    const picks = [];
    for (const sel of [
      ".theme-lab-controls input[type=checkbox]",
      ".theme-lab-form-grid input[type=checkbox]",
      "label.theme-lab-check",
      ".theme-lab-checkbox",
      ".theme-lab-source-list .is-selected",
      ".theme-lab-finder-rows .is-selected",
      ".theme-lab-list-frame .is-selected",
      ".theme-lab-sidebar .is-selected",
    ]) {
      const n = document.querySelectorAll(sel).length;
      if (n) picks.push({ sel, n });
    }
    return picks;
  });
  throw new Error(`No visible selector for ${specimen.file}. Probes: ${JSON.stringify(probes)}`);
}

async function captureSpecimen(page, theme, specimen, cacheDir) {
  const { createCanvas, loadImage } = require("canvas");
  const selector = await resolveSelector(page, specimen);
  const setup = typeof specimen.setup === "function" ? specimen.setup() : (specimen.setup || []);
  const saved = await applySetup(page, setup);
  try {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 5000 });
    const path = join(cacheDir, specimen.file);
    const fullPath = `${path}.full.png`;
    await locator.screenshot({ path: fullPath, animations: "disabled" });
    const image = await loadImage(fullPath);
    let outWidth = image.width;
    let outHeight = image.height;
    if (specimen.crop) {
      const x = Math.max(0, Math.min(image.width - 1, Math.round(specimen.crop.x)));
      const y = Math.max(0, Math.min(image.height - 1, Math.round(specimen.crop.y)));
      outWidth = Math.max(1, Math.min(image.width - x, Math.round(specimen.crop.width)));
      outHeight = Math.max(1, Math.min(image.height - y, Math.round(specimen.crop.height)));
      const canvas = createCanvas(outWidth, outHeight);
      canvas.getContext("2d").drawImage(image, x, y, outWidth, outHeight, 0, 0, outWidth, outHeight);
      writeFileSync(path, canvas.toBuffer("image/png"));
    } else {
      writeFileSync(path, readFileSync(fullPath));
    }
    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(fullPath);
    } catch {
      // keep full capture if unlink fails
    }
    const buffer = readFileSync(path);
    return {
      file: specimen.file,
      selector,
      sha256: sha256Buffer(buffer),
      width: outWidth,
      height: outHeight,
      sourceElement: { width: image.width, height: image.height },
      crop: specimen.crop || null,
    };
  } finally {
    await restoreSetup(page, saved);
  }
}

async function probeFonts(page) {
  const selectors = [
    ".theme-lab-controls h3",
    ".theme-lab-button-row .btn:first-child",
    ".theme-lab-form-grid > label:nth-child(4) .system-select-button",
    ".theme-lab-tab-specimen .system-tab.is-active",
  ];
  const session = await page.context().newCDPSession(page);
  try {
    await Promise.all([session.send("DOM.enable"), session.send("CSS.enable")]);
    const { root: documentNode } = await session.send("DOM.getDocument", { depth: 1 });
    const results = [];
    for (const selector of selectors) {
      const { nodeId } = await session.send("DOM.querySelector", { nodeId: documentNode.nodeId, selector });
      if (!nodeId) {
        results.push({ selector, fonts: [] });
        continue;
      }
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
      results.push({ selector, fonts });
    }
    return results;
  } finally {
    await session.detach();
  }
}

async function main() {
  const server = await startAppServer();
  const browser = await chromium.launch({ headless: true });
  const summary = {
    playwrightVersion,
    browserVersion: browser.version(),
    themes: {},
  };
  try {
    for (const theme of THEMES) {
      const list = SPECIMENS[theme];
      if (!list) throw new Error(`No specimen plan for ${theme}`);
      const cacheDir = join(CACHE_ROOT, theme);
      mkdirSync(cacheDir, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 1040 },
        screen: { width: 1280, height: 1040 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        reducedMotion: "reduce",
        locale: "en-US",
        timezoneId: "UTC",
      });
      await context.addInitScript((themeId) => {
        localStorage.setItem("ai-system-6-theme", themeId);
        localStorage.removeItem("ai-system-6-liquid-glass");
      }, theme);
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce", forcedColors: "none" });
      await page.goto(server.url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => ["ready", "error"].includes(document.body.dataset.appReady), null, { timeout: 15000 });
      await page.evaluate(() => window.AISystem6EnsureThemeLabModule?.());
      const labBox = await openThemeLab(page, theme);
      const fonts = await probeFonts(page);
      const captured = [];
      for (const specimen of list) {
        const meta = await captureSpecimen(page, theme, specimen, cacheDir);
        captured.push(meta);
        console.log(`[${theme}] ${meta.file} ${meta.width}x${meta.height} ${meta.sha256.slice(0, 12)}… sel=${meta.selector}`);
      }
      // Also capture content fingerprint + lab size for manifest scaffolding
      const contentSha256 = await page.locator('[data-window="themeLab"]').evaluate((el) => {
        const html = el.outerHTML.replace(/\?v=\d{8}\.\d+/g, "");
        // sha256 via SubtleCrypto not available for sync; return length marker only
        return html.length;
      });
      const fixtureHtml = await page.locator('[data-window="themeLab"]').evaluate((el) => el.outerHTML.replace(/\?v=\d{8}\.\d+/g, ""));
      const fingerprint = sha256Buffer(Buffer.from(fixtureHtml));
      summary.themes[theme] = {
        labSize: labBox ? { width: Math.round(labBox.width), height: Math.round(labBox.height) } : null,
        contentSha256: fingerprint,
        htmlLength: contentSha256,
        fonts,
        specimens: captured,
      };
      await context.close();
    }
  } finally {
    await browser.close();
    await stopProcess(server.child);
  }
  const outPath = join(CACHE_ROOT, "authored-seed-summary.json");
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`OK wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
