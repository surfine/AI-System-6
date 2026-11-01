#!/usr/bin/env node
// Theme Lab painter contract — v224 §A/§B + v233 §C twelve-era computed matrix
// + v236 twelve scoped region pixels (titlebar keywin or vibrancy strip per era).
// Controllable titlebar/glass strips only — not full desktop / not full-board
// Theme Lab snapshot matrix / not product polish complete. ≠ Goal complete.
//
// Usage:
//   node tooling/theme-lab-painter-contract.mjs            # verify
//   node tooling/theme-lab-painter-contract.mjs --update    # write region baselines
//   node tooling/theme-lab-painter-contract.mjs --computed-only

import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startAppServer, stopProcess } from "./lib/app-preview-server.mjs";
import { assertReferenceAssets } from "./lib/reference-assets.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");

const LAB_CSS = readFileSync(join(root, "apps/desktop/styles/66-theme-lab.css"), "utf8");
const THEME_REGISTRY = readFileSync(
  join(root, "apps/desktop/app/core/theme-registry.js"),
  "utf8",
);
const BASELINE_DIR = join(root, "tests", "visual", "theme-lab-painter");
const CURRENT_DIR = join(root, "internal", "evidence", "drafts", "theme-lab-painter-current");
const CHANNEL_TOLERANCE = 12;
const PIXEL_RATIO_TOLERANCE = 0.01;

const mode = process.argv.includes("--update") ? "update" : "verify";
const computedOnly = process.argv.includes("--computed-only");

/**
 * v224 §C twelve-era matrix (computed-style).
 * radiusFamily matches the design taxonomy; product `--window-radius` for
 * Platinum / Drawing Board stays 0 (square chrome) — design「小圓」is control
 * chrome, not window corners. productPolishPending is empty for all twelve
 * (Harvest B／D／E／v227); stale design-table docs todos must not reappear here.
 * shot: twelve scoped regions (v236) — still ≠ full-board Theme Lab snapshot
 * matrix and ≠ product polish complete.
 */
const ERA_CONTRACTS = Object.freeze([
  {
    id: "classic",
    blurPx: "0",
    radiusFamily: "square",
    radiusZero: true,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "classic-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "system-7",
    blurPx: "0",
    radiusFamily: "square",
    radiusZero: true,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "system-7-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "nextstep",
    blurPx: "0",
    radiusFamily: "square",
    radiusZero: true,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "nextstep-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "platinum",
    blurPx: "0",
    radiusFamily: "small-control",
    radiusZero: true,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "platinum-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "drawing-board",
    blurPx: "0",
    radiusFamily: "small-control",
    radiusZero: true,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "drawing-board-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "aqua",
    blurPx: "0",
    radiusFamily: "candy",
    radiusZero: false,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "aqua-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "tiger",
    blurPx: "0",
    radiusFamily: "aqua-delta",
    radiusZero: false,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "tiger-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "snow-leopard",
    blurPx: "0",
    radiusFamily: "metal",
    radiusZero: false,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "snow-leopard-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "lion",
    blurPx: "0",
    radiusFamily: "flat",
    radiusZero: false,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "lion-keywin", selector: '[data-theme-lab-keywin="key"]' },
  },
  {
    id: "yosemite",
    blurPx: "0",
    radiusFamily: "frosted-no-blur",
    radiusZero: false,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "yosemite-vibrancy", selector: "[data-theme-lab-vibrancy]" },
  },
  {
    id: "big-sur",
    blurPx: "12",
    radiusFamily: "vibrancy",
    radiusZero: false,
    windowBackdropNone: true,
    productPolishPending: "",
    shot: { id: "big-sur-vibrancy", selector: "[data-theme-lab-vibrancy]" },
  },
  {
    id: "liquid-glass",
    blurPx: "18",
    radiusFamily: "continuous-glass",
    radiusZero: false,
    windowBackdropNone: false,
    productPolishPending: "",
    shot: { id: "liquid-glass-vibrancy", selector: "[data-theme-lab-vibrancy]" },
  },
]);

assertReferenceAssets("Theme Lab painter contract", root);

function chromeExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path));
}

function parseRadius(value) {
  const text = String(value || "").trim();
  if (!text || text === "0" || text === "0px") return 0;
  const match = text.match(/^([\d.]+)px\b/);
  if (!match) return Number.NaN;
  return Number(match[1]);
}

function assertProductPolishPendingEmpty(failures) {
  const pendingTrue = (THEME_REGISTRY.match(/polishPending:\s*true/g) || []).length;
  if (pendingTrue > 0) {
    failures.push(
      `theme-registry: polishPending:true appears ${pendingTrue} time(s); product matrix expects empty polishPending`,
    );
  }
  for (const era of ERA_CONTRACTS) {
    if (era.productPolishPending) {
      failures.push(
        `${era.id}: productPolishPending must be empty (got ${era.productPolishPending})`,
      );
    }
  }
}

async function bootLab(browser, url, themeId) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript((id) => {
    localStorage.setItem("ai-system-6-theme", id);
    localStorage.removeItem("ai-system-6-liquid-glass");
  }, themeId);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => ["ready", "error"].includes(document.body?.dataset?.appReady),
    null,
    { timeout: 60000 },
  );
  const readiness = await page.evaluate(() => document.body?.dataset?.appReady);
  if (readiness !== "ready") {
    throw new Error(`App boot failed for ${themeId}: appReady=${readiness}`);
  }
  await page.evaluate(() => window.AISystem6EnsureThemeLabModule?.());
  await page.evaluate(({ id, css }) => {
    if (!document.querySelector("#theme-lab-dev-styles")) {
      const labStyle = document.createElement("style");
      labStyle.id = "theme-lab-dev-styles";
      labStyle.textContent = css;
      document.head.append(labStyle);
    }
    window.AISystem6Theme?.applyTheme(id, {
      experimental: true,
      persist: false,
      announce: false,
      modernFontPreference: false,
    });
    window.AISystem6ThemeLab?.sync?.(window.AISystem6Theme?.getTheme?.(id));
    window.AISystem6LiquidGlassOverlay?.setEnabled?.(false);
    document.querySelector("#liquid-glass-overlay")?.setAttribute("hidden", "");
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
    lab?.style.setProperty("left", "24px");
    lab?.style.setProperty("top", "40px");
    window.AISystem6ThemeLab?.showPanel?.("surfaces");
    window.AISystem6ThemeLab?.renderPolishBoards?.(window.AISystem6Theme?.getTheme?.(id));
    window.AISystem6ThemeLab?.measurePolishBoards?.();
  }, { id: themeId, css: LAB_CSS });
  await page.waitForTimeout(160);
  return { context, page };
}

async function readMeasures(page) {
  return page.evaluate(() => {
    const boards = document.querySelector("[data-theme-lab-polish-boards]");
    const desk = document.getElementById("desktop") || document.body;
    const deskStyle = getComputedStyle(desk);
    const vibrancy = document.querySelector("[data-theme-lab-vibrancy]");
    const vibrancyStyle = vibrancy ? getComputedStyle(vibrancy) : null;
    return {
      blurPx: (boards?.dataset.themeLabMeasureBlurPx
        || deskStyle.getPropertyValue("--painter-blur-px") || "").trim() || "0",
      painterBlur: (boards?.dataset.themeLabMeasurePainterBlur
        || deskStyle.getPropertyValue("--painter-blur") || "").trim() || "none",
      windowRadius: (boards?.dataset.themeLabMeasureWindowRadius
        || deskStyle.getPropertyValue("--window-radius") || "").trim(),
      windowBackdrop: (boards?.dataset.themeLabMeasureWindowBackdrop
        || deskStyle.getPropertyValue("--window-backdrop-filter") || "").trim() || "none",
      primaryCount: Number(boards?.dataset.themeLabMeasurePrimaryCount || "0"),
      defaultCount: Number(boards?.dataset.themeLabMeasureDefaultCount || "0"),
      keywinDistinct: boards?.dataset.themeLabMeasureKeywinDistinct || "0",
      vibrancyFilter: vibrancyStyle?.backdropFilter || vibrancyStyle?.webkitBackdropFilter || "none",
      themeId: document.body?.dataset?.theme || "",
      polishPendingFlag: document.querySelector("[data-theme-lab-polish-pending]")?.dataset?.polishPending || "0",
    };
  });
}

async function captureRegion(page, selector, outPath) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 15000 });
  await locator.screenshot({ path: outPath, animations: "disabled" });
}

async function comparePng(baselinePath, currentPath) {
  const [baseline, current] = await Promise.all([
    loadImage(baselinePath),
    loadImage(currentPath),
  ]);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      pass: false,
      detail: `dimensions ${baseline.width}x${baseline.height} -> ${current.width}x${current.height}`,
    };
  }
  const canvas = createCanvas(baseline.width, baseline.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(baseline, 0, 0);
  const base = ctx.getImageData(0, 0, baseline.width, baseline.height).data;
  ctx.clearRect(0, 0, baseline.width, baseline.height);
  ctx.drawImage(current, 0, 0);
  const cur = ctx.getImageData(0, 0, baseline.width, baseline.height).data;
  let changed = 0;
  const total = baseline.width * baseline.height;
  for (let i = 0; i < base.length; i += 4) {
    const delta = Math.max(
      Math.abs(base[i] - cur[i]),
      Math.abs(base[i + 1] - cur[i + 1]),
      Math.abs(base[i + 2] - cur[i + 2]),
      Math.abs(base[i + 3] - cur[i + 3]),
    );
    if (delta > CHANNEL_TOLERANCE) changed += 1;
  }
  const ratio = changed / total;
  return {
    pass: ratio <= PIXEL_RATIO_TOLERANCE,
    detail: `${changed}/${total} pixels (${(ratio * 100).toFixed(3)}%)`,
  };
}

function assertRadiusFamily(era, radius, windowRadius, failures) {
  const family = era.radiusFamily;
  if (era.radiusZero || family === "square" || family === "small-control") {
    if (radius !== 0) {
      failures.push(
        `${era.id}: radiusFamily=${family} expects --window-radius 0 (got ${windowRadius})`,
      );
    }
    return;
  }
  if (!(radius > 0)) {
    failures.push(
      `${era.id}: radiusFamily=${family} expects --window-radius > 0 (got ${windowRadius})`,
    );
  }
}

function assertComputed(era, measures, failures) {
  if (measures.themeId !== era.id) {
    failures.push(`${era.id}: body data-theme=${measures.themeId || "(empty)"}`);
  }
  if (measures.blurPx !== era.blurPx) {
    failures.push(`${era.id}: --painter-blur-px=${measures.blurPx}, expected ${era.blurPx}`);
  }
  if (era.windowBackdropNone) {
    const backdrop = measures.windowBackdrop.toLowerCase();
    if (backdrop.includes("blur(") && backdrop !== "none") {
      failures.push(`${era.id}: --window-backdrop-filter must stay none (got ${measures.windowBackdrop})`);
    }
  } else if (
    !/blur\(\s*18px/i.test(measures.windowBackdrop)
    && !/blur\(\s*18px/i.test(measures.painterBlur)
  ) {
    failures.push(
      `${era.id}: Liquid painter blur 18 missing (window=${measures.windowBackdrop}, painter=${measures.painterBlur})`,
    );
  }
  const radius = parseRadius(measures.windowRadius);
  assertRadiusFamily(era, radius, measures.windowRadius, failures);
  if (measures.primaryCount > 1) {
    failures.push(`${era.id}: Theme Lab button row has ${measures.primaryCount} .btn.primary (max 1)`);
  }
  if (measures.defaultCount > 1) {
    failures.push(`${era.id}: Theme Lab button row has ${measures.defaultCount} .btn.default (max 1)`);
  }
  if (measures.polishPendingFlag === "1") {
    failures.push(
      `${era.id}: product polishPending must stay cleared (Theme Lab data-polish-pending=1)`,
    );
  }
  if (era.id === "big-sur"
    && !/blur\(\s*12px/i.test(measures.vibrancyFilter)
    && !/blur\(\s*12px/i.test(measures.painterBlur)) {
    failures.push(
      `${era.id}: vibrancy/painter should expose blur(12px) (got vibrancy=${measures.vibrancyFilter})`,
    );
  }
  if (era.radiusFamily === "frosted-no-blur" && measures.blurPx !== "0") {
    failures.push(`${era.id}: frosted-no-blur family forbids painter blur-px (got ${measures.blurPx})`);
  }
}

mkdirSync(CURRENT_DIR, { recursive: true });
if (mode === "update") mkdirSync(BASELINE_DIR, { recursive: true });

let server;
let browser;
const failures = [];
const report = {
  eras: {},
  shots: {},
  matrix: "twelve-era-computed-v233",
  scopedPixels: "twelve-era-scoped-v236",
};

try {
  assertProductPolishPendingEmpty(failures);

  server = await startAppServer(root);
  const { chromium } = require("playwright");
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

  for (const era of ERA_CONTRACTS) {
    const { context, page } = await bootLab(browser, server.url, era.id);
    try {
      const measures = await readMeasures(page);
      report.eras[era.id] = { ...measures, radiusFamily: era.radiusFamily };
      assertComputed(era, measures, failures);
      console.log(
        `OK  computed ${era.id}: blur-px=${measures.blurPx} radius=${measures.windowRadius} `
        + `family=${era.radiusFamily} primary=${measures.primaryCount} default=${measures.defaultCount}`,
      );

      if (!computedOnly && era.shot) {
        const currentPath = join(CURRENT_DIR, `${era.shot.id}.png`);
        await captureRegion(page, era.shot.selector, currentPath);
        report.shots[era.shot.id] = currentPath;
        const baselinePath = join(BASELINE_DIR, `${era.shot.id}.png`);
        if (mode === "update") {
          copyFileSync(currentPath, baselinePath);
          console.log(`OK  wrote region baseline ${era.shot.id}`);
        } else if (!existsSync(baselinePath)) {
          failures.push(`${era.shot.id}: missing baseline ${baselinePath} (run with --update)`);
        } else {
          const diff = await comparePng(baselinePath, currentPath);
          if (diff.pass) console.log(`OK  region ${era.shot.id}: ${diff.detail}`);
          else {
            failures.push(`${era.shot.id}: ${diff.detail}`);
            console.error(`NO  region ${era.shot.id}: ${diff.detail}`);
          }
        }
      }
    } finally {
      await context.close();
    }
  }

  writeFileSync(
    join(CURRENT_DIR, "painter-contract-report.json"),
    `${JSON.stringify({ mode, computedOnly, report, failures }, null, 2)}\n`,
  );

  if (failures.length) {
    console.error(`Theme Lab painter contract failed: ${failures.length} issue(s).`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    const shotCount = ERA_CONTRACTS.filter((era) => era.shot).length;
    console.log(
      `OK  Theme Lab painter contract (${ERA_CONTRACTS.length} eras computed`
      + `${computedOnly ? ", computed-only" : `, + ${shotCount} scoped regions`}).`,
    );
  }
} catch (error) {
  console.error(`Theme Lab painter contract failed: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopProcess(server?.child);
}

process.exit(process.exitCode || 0);
