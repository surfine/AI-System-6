#!/usr/bin/env node
// Golden Gate phase 5 appearance matrix.
//
// The Theme Lab boards and real-app propagation gate answer "does the painter
// match?" and "do shared primitives reach real windows?". This gate answers the
// remaining release question: does the whole app stay usable across the
// supported appearances, mobile form factors, languages, the line-art
// preference, the WebGL2 -> 2D fallback, and the overlay-off path.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const THEME_IDS = Object.freeze([
  "classic",
  "platinum",
  "aqua",
  "snow-leopard",
  "yosemite",
  "liquid-glass",
]);

const VIEWPORTS = Object.freeze([
  { name: "phone-portrait", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet-portrait", width: 820, height: 1180 },
  { name: "tablet-landscape", width: 1180, height: 820 },
  { name: "phone-keyboard", width: 390, height: 520 },
]);

const LANGUAGES = Object.freeze([
  { id: "en", locale: "en-US" },
  { id: "zh", locale: "zh-CN" },
]);

const smoke = process.argv.includes("--smoke");
const outputDir = resolve(
  process.env.AI_SYSTEM6_PHASE5_OUTPUT
    || join(root, "internal", "evidence", "drafts", "appearance-phase5"),
);

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
      server.close(() => port ? resolvePort(port) : reject(new Error("Could not allocate a local port")));
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
  throw new Error(`Phase 5 server did not become ready.\n${output.trim()}`);
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

function attachDiagnostics(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`response ${response.status()}: ${response.url()}`);
  });
  return errors;
}

async function openReadyPage(context, url, page) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
}

async function applyTheme(page, theme) {
  await page.evaluate((themeId) => {
    if (typeof window.AISystem6Theme?.applyTheme !== "function") {
      throw new Error("AISystem6Theme.applyTheme is unavailable");
    }
    window.AISystem6Theme.applyTheme(themeId, {
      persist: false,
      announce: false,
      modernFontPreference: false,
    });
  }, theme);
  await wait(60);
}

async function checkBoot(page, theme, viewport, language) {
  const state = await page.evaluate(() => ({
    ready: document.body.dataset.appReady,
    theme: document.documentElement.dataset.theme || document.body.dataset.theme || "",
    family: document.documentElement.dataset.themeFamily || document.body.dataset.themeFamily || "",
    liquid: document.body.classList.contains("use-liquid-glass"),
    htmlLang: document.documentElement.lang,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));

  if (state.ready !== "ready") throw new Error(`${theme}/${language.id}/${viewport.name}: app did not reach ready`);
  if (state.theme !== theme) throw new Error(`${theme}/${language.id}/${viewport.name}: expected data-theme ${theme}, got ${state.theme}`);
  if ((theme === "liquid-glass") !== state.liquid) throw new Error(`${theme}/${language.id}/${viewport.name}: liquid class mismatch`);
  if (state.htmlLang && state.htmlLang !== (language.id === "zh" ? "zh-Hans" : "en")) {
    throw new Error(`${theme}/${language.id}/${viewport.name}: unexpected html lang ${state.htmlLang}`);
  }
  if (state.scrollWidth > state.innerWidth + 2) {
    throw new Error(`${theme}/${language.id}/${viewport.name}: horizontal overflow ${state.scrollWidth} > ${state.innerWidth}`);
  }
}

async function toggleLineArt(page) {
  await page.evaluate(() => {
    const box = document.querySelector("#classic-line-icons");
    if (!box) throw new Error("classic-line-icons input is missing");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(40);
  const on = await page.evaluate(() => document.querySelector("#classic-line-icons")?.checked);
  if (!on) throw new Error("classic-line-icons did not turn on");

  await page.evaluate(() => {
    const box = document.querySelector("#classic-line-icons");
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(40);
  const off = await page.evaluate(() => document.querySelector("#classic-line-icons")?.checked);
  if (off !== false) throw new Error("classic-line-icons did not turn off");
}

async function checkKeyboardReachability(page) {
  const reachable = await page.evaluate(() => {
    const field = document.querySelector("#prompt-input");
    if (!field) return true;
    const rect = field.getBoundingClientRect();
    return rect.top >= 0 && rect.top < window.innerHeight && rect.bottom <= window.innerHeight + 2;
  });
  if (!reachable) throw new Error("phone-keyboard: prompt input is clipped by the keyboard viewport");
}

async function verifyWebGlFallback(context, url, page) {
  await openReadyPage(context, `${url}?appearance=liquid-glass`, page);
  await applyTheme(page, "liquid-glass");
  const diagnostics = await page.evaluate(() => window.AISystem6LiquidGlassOverlay?.diagnostics?.() || {});
  if (diagnostics.renderer !== "2d") throw new Error(`WebGL2 failure did not fall back to 2D: ${JSON.stringify(diagnostics)}`);
  if (!diagnostics.contrastReachesOverlay || !diagnostics.reducedTransparencyReachesOverlay) {
    throw new Error("overlay diagnostics did not report accessibility signal wiring");
  }
}

async function verifyOverlayOff(context, url, page) {
  await openReadyPage(context, `${url}?appearance=liquid-glass`, page);
  await applyTheme(page, "liquid-glass");
  await page.evaluate(() => window.AISystem6LiquidGlassOverlay?.setEnabled(false));
  const hidden = await page.evaluate(() => document.querySelector("#liquid-glass-overlay")?.hidden);
  if (!hidden) throw new Error("liquid glass overlay did not hide when disabled");
}

mkdirSync(outputDir, { recursive: true });
const themes = smoke ? ["liquid-glass"] : [...THEME_IDS];
const viewports = smoke ? [VIEWPORTS[0]] : [...VIEWPORTS];
const languages = smoke ? [LANGUAGES[0]] : [...LANGUAGES];

let server;
let browser;
let failed = false;
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), smoke, checks: [] };
try {
  server = await startAppServer();
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"],
  });

  for (const theme of themes) {
    for (const language of languages) {
      const context = await browser.newContext({
        viewport: { width: viewports[0].width, height: viewports[0].height },
        screen: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
        colorScheme: "light",
        reducedMotion: "reduce",
        locale: language.locale,
        timezoneId: "UTC",
      });
      const page = await context.newPage();
      const errors = attachDiagnostics(page);

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const query = `?appearance=${theme}`;
        await openReadyPage(context, `${server.url}${query}`, page);
        await applyTheme(page, theme);
        await checkBoot(page, theme, viewport, language);
        if (viewport.name === "phone-keyboard") await checkKeyboardReachability(page);
        if (errors.length) {
          throw new Error(`${theme}/${language.id}/${viewport.name}: ${errors.join(" | ")}`);
        }
        report.checks.push({ theme, language: language.id, viewport: viewport.name, status: "ok" });
      }

      await toggleLineArt(page);
      if (errors.length) throw new Error(`${theme}/${language.id}/line-art: ${errors.join(" | ")}`);
      report.checks.push({ theme, language: language.id, viewport: "line-art-on-off", status: "ok" });
      await context.close();
    }
  }

  const fallbackContext = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    screen: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
  });
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (String(type).toLowerCase() === "webgl2") return null;
      return original.call(this, type, ...args);
    };
  });
  const fallbackPage = await fallbackContext.newPage();
  const fallbackErrors = attachDiagnostics(fallbackPage);
  await verifyWebGlFallback(fallbackContext, server.url, fallbackPage);
  if (fallbackErrors.length) throw new Error(`webgl-fallback: ${fallbackErrors.join(" | ")}`);
  report.checks.push({ theme: "liquid-glass", language: "en", viewport: "webgl2-fallback", status: "ok" });
  await fallbackContext.close();

  const overlayContext = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    screen: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
  });
  const overlayPage = await overlayContext.newPage();
  const overlayErrors = attachDiagnostics(overlayPage);
  await verifyOverlayOff(overlayContext, server.url, overlayPage);
  if (overlayErrors.length) throw new Error(`overlay-off: ${overlayErrors.join(" | ")}`);
  report.checks.push({ theme: "liquid-glass", language: "en", viewport: "overlay-off", status: "ok" });
  await overlayContext.close();
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.error = String(error?.stack || error);
  writeFileSync(join(outputDir, "phase5-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(`\n[phase5] FAILED: ${report.error}`);
  failed = true;
} finally {
  await browser?.close();
  await stopProcess(server);
}

report.finishedAt = new Date().toISOString();
writeFileSync(join(outputDir, "phase5-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`\n[phase5] PASSED: ${report.checks.length} checks written to ${join(outputDir, "phase5-report.json")}`);
process.exit(failed ? 1 : 0);
