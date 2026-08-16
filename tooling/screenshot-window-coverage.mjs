#!/usr/bin/env node
// Registry-driven window screenshot sweep for Appearance coverage.
//
// The surface harness (css-surface-snapshot.mjs) covers shared components;
// this sweep answers the per-window half of the coverage audit: open every
// registered data-window in the real app under one theme and screenshot its
// chrome + default/empty state. Evidence lands in internal/evidence/drafts/theme-coverage/
// (gitignored); the JSON index records each window's rect so a human can
// review the set.
//
// Usage:
//   node tooling/screenshot-window-coverage.mjs --theme platinum
//   node tooling/screenshot-window-coverage.mjs --theme platinum --out internal/evidence/drafts/theme-coverage/windows

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assertReferenceAssets } from "./lib/reference-assets.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function parseArgs(argv) {
  const options = { theme: "platinum", out: "internal/evidence/drafts/theme-coverage/windows" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--theme") options.theme = argv[++index];
    else if (argv[index] === "--out") options.out = argv[++index];
    else if (argv[index] === "--help") {
      console.log("Usage: node tooling/screenshot-window-coverage.mjs [--theme platinum] [--out internal/evidence/drafts/theme-coverage/windows]");
      process.exit(0);
    }
  }
  return options;
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

async function startAppServer() {
  const port = await new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(resolvedPort));
    });
  });
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
    await new Promise((wait) => setTimeout(wait, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`App server did not become ready.\n${output.trim()}`);
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

const options = parseArgs(process.argv.slice(2));
// Screenshots taken with fallback fonts are not evidence of anything.
assertReferenceAssets("Window screenshot coverage", root);
const outputDir = join(root, options.out);
const outRelative = options.out.replace(`${root}/`, "");
mkdirSync(outputDir, { recursive: true });

const html = readFileSync(join(root, "apps/desktop/index.html"), "utf8");
const windows = [];
for (const match of html.matchAll(/class="([^"]+)"[^>]*data-window="([^"]+)"[^>]*aria-labelledby="([^"]+)"/g)) {
  windows.push({ id: match[2], label: match[3], classes: match[1].split(/\s+/) });
}

let server;
let browser;
try {
  server = await startAppServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.addInitScript((themeId) => {
    localStorage.setItem("ai-system-6-theme", themeId);
    localStorage.removeItem("ai-system-6-liquid-glass");
  }, options.theme);
  const page = await context.newPage();
  const diagnostics = [];
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 15000 });
  await page.evaluate((themeId) => {
    window.AISystem6Theme?.applyTheme(themeId, {
      experimental: true,
      persist: false,
      announce: false,
      modernFontPreference: false,
    });
    document.body.classList.remove("use-modern-fonts", "is-writer-mode", "is-cloud-active", "quick-draft-focus");
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    const noMotion = document.createElement("style");
    noMotion.id = "window-coverage-no-motion";
    noMotion.textContent = "*, *::before, *::after { animation-delay: 0s !important; animation-duration: 0s !important; transition-delay: 0s !important; transition-duration: 0s !important; }";
    document.head.append(noMotion);
  }, options.theme);
  await page.evaluate(() => document.fonts?.ready);

  const captures = [];
  for (const windowInfo of windows) {
    const rect = await page.evaluate(({ id, classes }) => {
      for (const win of document.querySelectorAll(".window")) {
        win.classList.add("is-hidden");
        win.classList.remove("is-active");
      }
      const target = document.querySelector(`.window[data-window="${id}"]`);
      if (!target) return null;
      target.classList.remove("is-hidden");
      target.classList.add("is-active");
      const box = target.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    }, { id: windowInfo.id, classes: windowInfo.classes });
    if (!rect) continue;
    await page.waitForTimeout(60);
    const element = page.locator(`.window[data-window="${windowInfo.id}"]`);
    const fileName = `window-${windowInfo.id}-${options.theme}.png`;
    await element.screenshot({ path: join(outputDir, fileName), animations: "disabled" });
    const buffer = readFileSync(join(outputDir, fileName));
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const computed = await page.evaluate(({ id }) => {
      const windowElement = document.querySelector(`.window[data-window="${id}"]`);
      if (!windowElement) return {};
      const sample = (selector) => {
        const element = windowElement.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          display: style.display,
          visibility: style.visibility,
          background: style.backgroundColor,
          color: style.color,
          borderTopColor: style.borderTopColor,
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow.slice(0, 90),
          text: (element.textContent || "").trim().slice(0, 40),
        };
      };
      return {
        window: sample(":scope"),
        titleBar: sample(".title-bar"),
        closeBox: sample(".close-box"),
        resizeBox: sample(".resize-box"),
        firstButton: sample("button:not(.close-box):not(.resize-box)"),
        firstInput: sample('input[type="text"], input[type="search"], input[type="url"], textarea'),
        firstSelect: sample("select"),
        pane: sample(".window-pane"),
      };
    }, { id: windowInfo.id });
    captures.push({
      window: windowInfo.id,
      label: windowInfo.label,
      classes: windowInfo.classes,
      theme: options.theme,
      rect,
      computed,
      screenshot: `${outRelative}/${fileName}`,
      sha256,
      bytes: buffer.length,
    });
    console.log(`OK  ${windowInfo.id} ${rect.width}x${rect.height}`);
  }

  const index = {
    schemaVersion: 1,
    theme: options.theme,
    generatedAt: new Date().toISOString(),
    registrySource: "index.html data-window entries",
    windowCount: windows.length,
    captured: captures.length,
    zeroSize: captures.filter((capture) => capture.rect.width <= 0 || capture.rect.height <= 0).map((capture) => capture.window),
    diagnostics,
    windows: captures,
  };
  writeFileSync(join(outputDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`OK  window sweep: ${captures.length}/${windows.length} windows captured -> ${outRelative}`);
} catch (error) {
  console.error(`Window coverage sweep failed: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}
