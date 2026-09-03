#!/usr/bin/env node
// Zoom probe — one selector, six appearances, at three device pixels.
//
// The sweep answers "which cell", not "what exactly". A menu title whose
// highlight leaves a light patch behind its icon is four pixels wide at
// device scale 1; the sweep photographs it faithfully and the eye reads past
// it. This shoots one named region large enough to judge, in every era, with
// an optional interaction run first.
//
// Usage:
//   node tooling/visual-hunt-zoom.mjs --selector ".menu-bar" --name menubar
//   node tooling/visual-hunt-zoom.mjs --selector "#x" --name y --click "#z"
//   node tooling/visual-hunt-zoom.mjs --window control --selector ".btn"

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT_DIR = join(root, "internal/evidence/drafts/visual-hunt/zoom");
const THEMES = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];

const options = { selector: ".menu-bar", name: "zoom", click: null, window: null, hover: null, scale: 4, width: 1440, height: 900, pad: 0 };
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const flag = argv[index];
  if (flag === "--selector") options.selector = argv[++index];
  else if (flag === "--name") options.name = argv[++index];
  else if (flag === "--click") options.click = argv[++index];
  else if (flag === "--hover") options.hover = argv[++index];
  else if (flag === "--window") options.window = argv[++index];
  else if (flag === "--scale") options.scale = Number(argv[++index]);
  else if (flag === "--width") options.width = Number(argv[++index]);
  else if (flag === "--height") options.height = Number(argv[++index]);
  else if (flag === "--pad") options.pad = Number(argv[++index]);
}

mkdirSync(OUT_DIR, { recursive: true });
const server = await startAppServer(root);
const browser = await chromium.launch();
try {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: options.scale,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) });
    });
    await context.addInitScript((id) => {
      localStorage.setItem("ai-system-6-theme", id);
      localStorage.removeItem("ai-system-6-liquid-glass");
      localStorage.setItem("clioOnboardingCompleted", "1");
    }, theme);
    const page = await context.newPage();
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
    await page.evaluate(async () => {
      if (typeof activateWorkspaceProfile === "function") {
        await activateWorkspaceProfile("writing", { persist: false, announce: false });
      }
    });
    await page.evaluate((id) => {
      window.AISystem6Theme?.applyTheme(id, { experimental: true, persist: false, announce: false, modernFontPreference: false });
      for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
      const style = document.createElement("style");
      style.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
      document.head.append(style);
    }, theme);
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(900);

    if (options.window) {
      await page.evaluate(async (id) => {
        if (!document.querySelector(`.window[data-window="${id}"]`) && typeof loadLazyWindowModule === "function") {
          await loadLazyWindowModule(id);
        }
        for (const win of document.querySelectorAll(".window")) {
          if (win.dataset.window === id) continue;
          win.classList.add("is-hidden");
        }
        if (typeof openWindow === "function") openWindow(id);
      }, options.window);
      await page.waitForTimeout(700);
    }
    if (options.click) { await page.click(options.click).catch(() => {}); await page.waitForTimeout(350); }
    if (options.hover) { await page.hover(options.hover).catch(() => {}); await page.waitForTimeout(300); }

    const box = await page.evaluate(({ selector, pad }) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad),
        width: Math.min(window.innerWidth, rect.width + pad * 2),
        height: Math.min(window.innerHeight, rect.height + pad * 2),
      };
    }, { selector: options.selector, pad: options.pad });
    if (!box || box.width < 2) { console.log(`${theme}: no ${options.selector}`); await context.close(); continue; }
    await page.screenshot({
      path: join(OUT_DIR, `${options.name}-${theme}.png`),
      clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
      animations: "disabled",
    });
    console.log(`${theme} ok`);
    await context.close();
  }
} finally {
  await browser.close();
  await stopProcess(server.child);
}
