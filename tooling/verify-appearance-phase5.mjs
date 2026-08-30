#!/usr/bin/env node
// Golden Gate phase 5 appearance matrix.
//
// The Theme Lab boards and real-app propagation gate answer "does the painter
// match?" and "do shared primitives reach real windows?". This gate answers the
// remaining release question: does the whole app stay usable across the
// supported appearances, mobile form factors, languages, the line-art
// preference, the WebGL2 -> 2D fallback, and the overlay-off path.

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

const SERIAL_THEME_IDS = new Set(["yosemite", "liquid-glass"]);

function resolveParallelJobs(value) {
  if (!value) return 4;
  if (!/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 0;
}

const parallelJobs = resolveParallelJobs(process.env.AI_SYSTEM6_PHASE5_JOBS);
if (!parallelJobs) {
  console.error(`NO  AI_SYSTEM6_PHASE5_JOBS must be an integer from 1 to 4; received ${process.env.AI_SYSTEM6_PHASE5_JOBS || "(empty)"}.`);
  process.exit(2);
}

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

// The desk probes LM Studio's default port while it boots. On a machine or a
// runner without LM Studio the browser refuses the connection and writes one
// generic console error, which says nothing about appearance and made this gate
// fail on a random case in roughly two runs of three. Drop that line, and only
// that line, and only once per refused probe.
const LOCAL_MODEL_PROBE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):1234\//;
const REFUSED_RESOURCE = "Failed to load resource: net::ERR_CONNECTION_REFUSED";

function attachDiagnostics(page) {
  const errors = [];
  let refusedLocalModelProbes = 0;
  page.on("requestfailed", (request) => {
    if (LOCAL_MODEL_PROBE.test(request.url())) refusedLocalModelProbes += 1;
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (refusedLocalModelProbes > 0 && message.text() === REFUSED_RESOURCE) {
      refusedLocalModelProbes -= 1;
      return;
    }
    errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`response ${response.status()}: ${response.url()}`);
  });
  return {
    take() {
      return errors.splice(0, errors.length);
    },
  };
}

async function openReadyPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 30000 });
}

async function settleViewportResize(page) {
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
  }));
  await wait(20);
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

async function verifyWebGlFallback(url, page) {
  await openReadyPage(page, `${url}?appearance=liquid-glass`);
  await applyTheme(page, "liquid-glass");
  const diagnostics = await page.evaluate(() => window.AISystem6LiquidGlassOverlay?.diagnostics?.() || {});
  if (diagnostics.renderer !== "2d") throw new Error(`WebGL2 failure did not fall back to 2D: ${JSON.stringify(diagnostics)}`);
  if (!diagnostics.contrastReachesOverlay || !diagnostics.reducedTransparencyReachesOverlay) {
    throw new Error("overlay diagnostics did not report accessibility signal wiring");
  }
}

async function verifyOverlayOff(url, page) {
  await openReadyPage(page, `${url}?appearance=liquid-glass`);
  await applyTheme(page, "liquid-glass");
  await page.evaluate(() => window.AISystem6LiquidGlassOverlay?.setEnabled(false));
  const hidden = await page.evaluate(() => document.querySelector("#liquid-glass-overlay")?.hidden);
  if (!hidden) throw new Error("liquid glass overlay did not hide when disabled");
}

function errorText(error) {
  return String(error?.stack || error);
}

function checkRecord(theme, language, viewport, error = null) {
  return {
    theme,
    language,
    viewport,
    status: error ? "failed" : "ok",
    ...(error ? { error } : {}),
  };
}

function failedAppearanceJob(job, viewports, error) {
  const message = errorText(error);
  const checks = viewports.map((viewport) => checkRecord(
    job.theme,
    job.language.id,
    viewport.name,
    message,
  ));
  checks.push(checkRecord(job.theme, job.language.id, "line-art-on-off", message));
  return { checks, failures: [`${job.theme}/${job.language.id}: ${message}`] };
}

async function runReportedCheck({ theme, language, viewport, diagnostics, action }) {
  try {
    await action();
    const errors = diagnostics.take();
    if (errors.length) throw new Error(errors.join(" | "));
    return checkRecord(theme, language, viewport);
  } catch (error) {
    const errors = diagnostics.take();
    const combined = [errorText(error), ...errors].filter(Boolean).join(" | ");
    return checkRecord(theme, language, viewport, combined);
  }
}

async function runAppearanceJob(browser, url, job, viewports) {
  const initialViewportIndex = job.index % viewports.length;
  const initialViewport = viewports[initialViewportIndex];
  const executionOrder = [
    initialViewport,
    ...viewports.filter((_, index) => index !== initialViewportIndex),
  ];
  const checksByViewport = new Map();
  const failures = [];
  let context;
  let diagnostics;
  let page;
  let bootError = "";
  let fatalError = null;

  try {
    context = await browser.newContext({
      viewport: { width: initialViewport.width, height: initialViewport.height },
      screen: { width: initialViewport.width, height: initialViewport.height },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
      locale: job.language.locale,
      timezoneId: "UTC",
    });
    page = await context.newPage();
    diagnostics = attachDiagnostics(page);

    try {
      await openReadyPage(page, `${url}?appearance=${job.theme}`);
      await applyTheme(page, job.theme);
    } catch (error) {
      bootError = [errorText(error), ...diagnostics.take()].filter(Boolean).join(" | ");
    }

    for (const viewport of executionOrder) {
      let check;
      if (bootError) {
        check = checkRecord(job.theme, job.language.id, viewport.name, `cold boot failed: ${bootError}`);
      } else {
        check = await runReportedCheck({
          theme: job.theme,
          language: job.language.id,
          viewport: viewport.name,
          diagnostics,
          action: async () => {
            if (viewport !== initialViewport) {
              await page.setViewportSize({ width: viewport.width, height: viewport.height });
              await settleViewportResize(page);
            }
            await checkBoot(page, job.theme, viewport, job.language);
            if (viewport.name === "phone-keyboard") await checkKeyboardReachability(page);
          },
        });
      }
      checksByViewport.set(viewport.name, check);
    }

    let lineArtCheck;
    if (bootError) {
      lineArtCheck = checkRecord(job.theme, job.language.id, "line-art-on-off", `cold boot failed: ${bootError}`);
    } else {
      lineArtCheck = await runReportedCheck({
        theme: job.theme,
        language: job.language.id,
        viewport: "line-art-on-off",
        diagnostics,
        action: async () => {
          const keyboardViewport = viewports.find(({ name }) => name === "phone-keyboard");
          if (keyboardViewport) {
            await page.setViewportSize({ width: keyboardViewport.width, height: keyboardViewport.height });
            await settleViewportResize(page);
          }
          await toggleLineArt(page);
        },
      });
    }
    checksByViewport.set("line-art-on-off", lineArtCheck);
  } catch (error) {
    fatalError = error;
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error) {
        failures.push(`${job.theme}/${job.language.id}/cleanup: ${errorText(error)}`);
      }
    }
  }

  if (fatalError) {
    const result = failedAppearanceJob(job, viewports, fatalError);
    result.failures.push(...failures);
    return result;
  }

  const checks = [
    ...viewports.map((viewport) => checksByViewport.get(viewport.name)),
    checksByViewport.get("line-art-on-off"),
  ];
  for (const check of checks) {
    if (check.status === "failed") failures.push(`${check.theme}/${check.language}/${check.viewport}: ${check.error}`);
  }
  return { checks, failures };
}

async function runBoundedAppearanceJobs(browser, url, jobs, viewports, concurrency) {
  const results = new Array(jobs.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      const resultIndex = nextIndex;
      nextIndex += 1;
      const job = jobs[resultIndex];
      results[resultIndex] = await runAppearanceJob(browser, url, job, viewports);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, jobs.length) },
    () => worker(),
  ));
  return results;
}

async function runSpecialCheck(browser, options) {
  const { theme, language, viewport, contextOptions, beforePage, action } = options;
  let context;
  let check;
  const failures = [];
  try {
    context = await browser.newContext(contextOptions);
    if (beforePage) await beforePage(context);
    const page = await context.newPage();
    const diagnostics = attachDiagnostics(page);
    check = await runReportedCheck({
      theme,
      language,
      viewport,
      diagnostics,
      action: () => action(page),
    });
  } catch (error) {
    check = checkRecord(theme, language, viewport, errorText(error));
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error) {
        failures.push(`${theme}/${language}/${viewport}/cleanup: ${errorText(error)}`);
      }
    }
  }
  if (check.status === "failed") failures.push(`${theme}/${language}/${viewport}: ${check.error}`);
  return { check, failures };
}

mkdirSync(outputDir, { recursive: true });
const themes = smoke ? ["liquid-glass"] : [...THEME_IDS];
const viewports = smoke ? [VIEWPORTS[0]] : [...VIEWPORTS];
const languages = smoke ? [LANGUAGES[0]] : [...LANGUAGES];

let server;
let browser;
let failed = false;
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), smoke, checks: [] };
const failures = [];
try {
  server = await startAppServer();
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"],
  });

  const appearanceJobs = themes
    .flatMap((theme) => languages.map((language) => ({ theme, language })))
    .map((job, index) => ({ ...job, index }));

  const nonBlurJobs = appearanceJobs.filter(({ theme }) => !SERIAL_THEME_IDS.has(theme));
  const blurJobs = appearanceJobs.filter(({ theme }) => SERIAL_THEME_IDS.has(theme));
  const jobResults = new Array(appearanceJobs.length);

  const parallelResults = await runBoundedAppearanceJobs(
    browser,
    server.url,
    nonBlurJobs,
    viewports,
    Math.min(parallelJobs, nonBlurJobs.length),
  );
  nonBlurJobs.forEach((job, index) => { jobResults[job.index] = parallelResults[index]; });

  // Backdrop-filter appearances stay out of the pool: concurrent blur painting
  // has produced false pixel and geometry drift in headless Chromium.
  for (const job of blurJobs) {
    jobResults[job.index] = await runAppearanceJob(browser, server.url, job, viewports);
  }

  // Execution completion order is deliberately ignored. Replaying the result
  // slots in matrix order keeps the receipt byte-order stable across worker counts.
  for (const job of appearanceJobs) {
    const result = jobResults[job.index];
    report.checks.push(...result.checks);
    failures.push(...result.failures);
  }

  const commonSpecialContext = {
    viewport: { width: 1280, height: 820 },
    screen: { width: 1280, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
  };
  const fallbackResult = await runSpecialCheck(browser, {
    theme: "liquid-glass",
    language: "en",
    viewport: "webgl2-fallback",
    contextOptions: commonSpecialContext,
    beforePage: (context) => context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
        if (String(type).toLowerCase() === "webgl2") return null;
        return original.call(this, type, ...args);
      };
    }),
    action: (page) => verifyWebGlFallback(server.url, page),
  });
  report.checks.push(fallbackResult.check);
  failures.push(...fallbackResult.failures);

  const overlayResult = await runSpecialCheck(browser, {
    theme: "liquid-glass",
    language: "en",
    viewport: "overlay-off",
    contextOptions: commonSpecialContext,
    action: (page) => verifyOverlayOff(server.url, page),
  });
  report.checks.push(overlayResult.check);
  failures.push(...overlayResult.failures);
} catch (error) {
  failures.push(`infrastructure: ${errorText(error)}`);
} finally {
  try {
    await browser?.close();
  } catch (error) {
    failures.push(`browser cleanup: ${errorText(error)}`);
  }
  try {
    await stopProcess(server);
  } catch (error) {
    failures.push(`server cleanup: ${errorText(error)}`);
  }
}

report.finishedAt = new Date().toISOString();
if (failures.length) {
  failed = true;
  report.error = failures.join("\n");
}
writeFileSync(join(outputDir, "phase5-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (failed) {
  console.error(`\n[phase5] FAILED: ${failures.length} failure(s); ${report.checks.length} checks written to ${join(outputDir, "phase5-report.json")}`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
} else {
  console.log(`\n[phase5] PASSED: ${report.checks.length} checks written to ${join(outputDir, "phase5-report.json")}`);
}
process.exit(failed ? 1 : 0);
