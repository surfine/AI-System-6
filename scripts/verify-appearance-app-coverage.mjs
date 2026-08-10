#!/usr/bin/env node
// Browser-computed propagation gate for the real application, deliberately
// separate from Theme Lab regression and canonical historical fidelity.
//
// Theme Lab owns painter specimens. This gate answers the other maintenance
// question: do the same system primitives actually reach ordinary and
// visually-special application windows under all six appearances?

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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

const REPRESENTATIVE_WINDOWS = Object.freeze([
  { id: "finder", sample: ".finder-item .sys-icon" },
  { id: "pageSetup", sample: ".btn.default" },
  { id: "teachText", sample: "#teachtext-body" },
  { id: "scrapbook", sample: "#scrap-body-input" },
  { id: "liquidCover", sample: ".liquid-cover-window .title-bar, .title-bar" },
  { id: "endfieldTerminal", sample: ".endfield-terminal-window .title-bar, .title-bar" },
]);

const outputArgument = process.argv.indexOf("--output");
if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/verify-appearance-app-coverage.mjs [--output DIR]");
  process.exit(0);
}
if (process.argv.slice(2).some((argument, index, args) => argument !== "--output" && args[index - 1] !== "--output")) {
  throw new Error(`Unknown option: ${process.argv.slice(2).join(" ")}`);
}
if (outputArgument >= 0 && (!process.argv[outputArgument + 1] || process.argv[outputArgument + 1].startsWith("--"))) {
  throw new Error("--output requires a directory");
}
const outputDir = outputArgument >= 0
  ? resolve(process.argv[outputArgument + 1])
  : join(root, "drafts", "appearance-app-coverage", "current");

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  throw new Error(`Appearance coverage server did not become ready.\n${output.trim()}`);
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

function titleSignature(titleBar) {
  return JSON.stringify({
    height: titleBar.rect.height,
    backgroundColor: titleBar.style.backgroundColor,
    color: titleBar.style.color,
    borderTopColor: titleBar.style.borderTopColor,
    borderTopWidth: titleBar.style.borderTopWidth,
    borderRadius: titleBar.style.borderRadius,
    boxShadow: titleBar.style.boxShadow,
    backdropFilter: titleBar.style.backdropFilter,
    fontFamily: titleBar.style.fontFamily,
    fontSize: titleBar.style.fontSize,
  });
}

mkdirSync(outputDir, { recursive: true });
let server;
let browser;
try {
  server = await startAppServer();
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    screen: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript(() => {
    localStorage.setItem("ai-system-6-theme", "classic");
    localStorage.removeItem("ai-system-6-liquid-glass");
  });
  const page = await context.newPage();
  const diagnostics = [];
  page.on("pageerror", (error) => {
    const message = String(error?.message || error);
    // Sandboxed preview documents intentionally cannot access the top-level
    // localStorage. It is a contained preview diagnostic, not an app failure.
    if (!message.includes("document is sandboxed and lacks the 'allow-same-origin' flag")) {
      diagnostics.push(`pageerror: ${message}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 15000 });
  await page.evaluate(() => {
    document.body.classList.remove("use-modern-fonts", "is-writer-mode", "is-cloud-active", "quick-draft-focus");
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    const style = document.createElement("style");
    style.id = "appearance-app-coverage-no-motion";
    style.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
    document.head.append(style);
  });
  await page.evaluate(() => document.fonts?.ready);

  const registry = await page.evaluate(() => window.AISystem6Theme.themes.map((theme) => ({
    id: theme.id,
    family: theme.family,
    recipeBase: theme.recipeBase,
    releaseReady: theme.releaseReady,
    systemFont: theme.systemFont,
    fontStrategy: theme.fontStrategy,
  })));
  assert(JSON.stringify(registry.map(({ id }) => id)) === JSON.stringify(THEME_IDS), "Theme registry is not the canonical six-appearance timeline");
  assert(registry.every(({ releaseReady }) => releaseReady !== false), "Every canonical appearance must be release-ready");

  const results = [];
  for (const theme of registry) {
    const projection = await page.evaluate((themeId) => {
      const applied = window.AISystem6Theme.applyTheme(themeId, {
        experimental: true,
        persist: false,
        announce: false,
        modernFontPreference: false,
      });
      document.body.classList.remove("is-writer-mode", "is-cloud-active", "quick-draft-focus");
      return {
        applied: { id: applied.id, family: applied.family, recipeBase: applied.recipeBase },
        html: {
          theme: document.documentElement.dataset.theme,
          family: document.documentElement.dataset.themeFamily,
          base: document.documentElement.dataset.themeBase || null,
        },
        body: {
          theme: document.body.dataset.theme,
          family: document.body.dataset.themeFamily,
          base: document.body.dataset.themeBase || null,
          liquidClass: document.body.classList.contains("use-liquid-glass"),
          modernFontClass: document.body.classList.contains("use-modern-fonts"),
        },
      };
    }, theme.id);
    assert(projection.applied.id === theme.id, `${theme.id}: applyTheme returned ${projection.applied.id}`);
    for (const [rootName, rootProjection] of [["html", projection.html], ["body", projection.body]]) {
      assert(rootProjection.theme === theme.id, `${theme.id}: ${rootName} data-theme is ${rootProjection.theme}`);
      assert(rootProjection.family === theme.family, `${theme.id}: ${rootName} family is ${rootProjection.family}`);
      assert(rootProjection.base === (theme.recipeBase || null), `${theme.id}: ${rootName} base is ${rootProjection.base}`);
    }
    assert(projection.body.liquidClass === (theme.id === "liquid-glass"), `${theme.id}: Liquid Glass skin class projection is wrong`);
    assert(
      projection.body.modernFontClass === (theme.fontStrategy === "modern"),
      `${theme.id}: font strategy ${theme.fontStrategy} projected the wrong modern-font state`,
    );

    const windows = [];
    for (const contract of REPRESENTATIVE_WINDOWS) {
      const snapshot = await page.evaluate(({ id, sample }) => {
        for (const windowElement of document.querySelectorAll(".window")) {
          windowElement.classList.add("is-hidden");
          windowElement.classList.remove("is-active");
        }
        const target = document.querySelector(`.window[data-window="${id}"]`);
        if (!target) return { missing: true };
        target.classList.remove("is-hidden");
        target.classList.add("is-active");
        const capture = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            style: {
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              backgroundColor: style.backgroundColor,
              color: style.color,
              borderTopColor: style.borderTopColor,
              borderTopWidth: style.borderTopWidth,
              borderRadius: style.borderRadius,
              boxShadow: style.boxShadow,
              backdropFilter: style.backdropFilter,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
            },
          };
        };
        return {
          missing: false,
          window: capture(target),
          titleBar: capture(target.querySelector(":scope > .title-bar")),
          sample: capture(target.querySelector(sample)),
        };
      }, contract);
      await page.evaluate(() => new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint))));
      assert(!snapshot.missing, `${theme.id}: missing real window ${contract.id}`);
      for (const [surface, value] of [["window", snapshot.window], ["title bar", snapshot.titleBar], ["sample", snapshot.sample]]) {
        assert(value, `${theme.id}/${contract.id}: missing ${surface}`);
        assert(value.rect.width > 0 && value.rect.height > 0, `${theme.id}/${contract.id}: ${surface} has no rendered geometry`);
        assert(value.style.display !== "none" && value.style.visibility !== "hidden", `${theme.id}/${contract.id}: ${surface} is not visible`);
      }
      const screenshot = `${theme.id}-${contract.id}.png`;
      await page.locator(`.window[data-window="${contract.id}"]`).screenshot({
        path: join(outputDir, screenshot),
        animations: "disabled",
      });
      windows.push({ id: contract.id, screenshot, ...snapshot });
    }

    const systemTitle = titleSignature(windows.find(({ id }) => id === "finder").titleBar);
    for (const windowResult of windows) {
      assert(
        titleSignature(windowResult.titleBar) === systemTitle,
        `${theme.id}/${windowResult.id}: app stylesheet overrode the shared system title-bar painter`,
      );
    }
    results.push({ theme, projection, windows });
    console.log(`OK  ${theme.id}: ${windows.length} representative real windows share system chrome`);
  }

  const titleSignatures = new Map(results.map((result) => [
    result.theme.id,
    titleSignature(result.windows.find(({ id }) => id === "finder").titleBar),
  ]));
  assert(titleSignatures.get("yosemite") !== titleSignatures.get("liquid-glass"), "Yosemite and Liquid Glass collapsed to the same real-window painter");
  assert(diagnostics.length === 0, `Real-app coverage emitted runtime errors:\n${diagnostics.join("\n")}`);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    themes: results,
    diagnostics,
    representativeWindows: REPRESENTATIVE_WINDOWS,
  };
  writeFileSync(join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`OK  Appearance real-app propagation passed: ${results.length} themes × ${REPRESENTATIVE_WINDOWS.length} windows`);
  console.log(`    artifacts: ${outputDir}`);
} catch (error) {
  console.error(`Appearance real-app propagation failed: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await stopProcess(server.child);
}
