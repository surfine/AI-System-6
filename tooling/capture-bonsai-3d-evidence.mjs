// Bonsai City 3D evidence sheet / 盆景城市 3D 证据图.
//
// Opens the example city in a real headless Chromium, and writes the same
// view in both backends, by day and by night, to internal/evidence/. These
// are review evidence for the voxel rescue, never shipped assets.
//
//   node tooling/capture-bonsai-3d-evidence.mjs [--url http://localhost:4173]
//
// The sim clock must run for the night frames, so the page stays visible in
// the headless window (a hidden pane freezes the pacing loop).
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const serverUrl = urlIndex >= 0 ? args[urlIndex + 1] : (process.env.BONSAI_EVIDENCE_URL || "http://localhost:4173");
const outDir = path.join(root, "internal", "evidence", "bonsai-voxel");
const CITY = "Troubled mid-size city";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shoot(page, name) {
  const stack = page.locator("[data-bonsai-map-stack]");
  await stack.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`wrote ${path.relative(root, path.join(outDir, `${name}.png`))}`);
}

async function toggleBackend(page, backend) {
  const current = await page.evaluate(() => window.AISystem6BonsaiCity.debugState().backend);
  if (current === backend) return;
  await page.evaluate(() => handleAction("bonsai-toggle-renderer"));
  await page.waitForFunction((wanted) => window.AISystem6BonsaiCity.debugState().backend === wanted, backend, { timeout: 15000 });
  await wait(2500);
}

// Runs the clock until the renderer reports night (or day), then pauses.
async function runUntil(page, wantNight) {
  await page.evaluate(() => window.AISystem6BonsaiCity.setSpeed(4));
  await page.waitForFunction((night) => {
    const stats = window.AISystem6BonsaiVoxelRenderer?.debugStats?.();
    if (!stats || typeof stats.timeOfDay !== "number") return false;
    const time = stats.timeOfDay;
    // Deep night is the first tenth of the day; full day sits at the middle.
    return night ? (time >= 0.02 && time <= 0.12) : (time >= 0.45 && time <= 0.55);
  }, wantNight, { timeout: 60000, polling: 100 });
  await page.evaluate(() => window.AISystem6BonsaiCity.setSpeed(0));
  await wait(1500);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--force-color-profile=srgb", "--use-gl=angle", "--use-angle=swiftshader"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: "en-US" });
    await context.addInitScript(() => {
      localStorage.setItem("ai-system-6-theme", "classic");
      localStorage.setItem("ai-system-6-liquid-glass", "false");
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(`pageerror: ${error?.message || error}`));
    await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 20000 });
    await page.evaluate(() => {
      for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
      currentLanguage = "en";
      applyLanguage();
    });
    await page.evaluate(() => handleAction("open-bonsai-city"));
    await page.waitForSelector('[data-window="bonsaiCity"]:not(.is-hidden)', { timeout: 15000 });
    await page.waitForSelector("[data-bonsai-map-setup]", { timeout: 10000 });
    await page.evaluate(() => window.AISystem6BonsaiCity.openCities());
    await page.locator("button", { hasText: CITY }).first().click();
    await page.waitForSelector("[data-bonsai-map-stack]", { timeout: 10000 });
    await wait(2500);

    // The voxel backend owns the clock probe, so mount it first and bring
    // the city to full day before the first frame.
    await toggleBackend(page, "three-voxel");
    await runUntil(page, false);
    await shoot(page, "3d-day");
    if (args.includes("--probe")) {
      const probe = await page.evaluate(() => {
        const s = window.AISystem6BonsaiVoxelRenderer.debugStats();
        return { groups: s.tileGroups, colors: s.tileColors, glass: s.glass, timeOfDay: s.timeOfDay };
      });
      console.log(JSON.stringify(probe));
      return;
    }
    await toggleBackend(page, "canvas-2d");
    await shoot(page, "2d-day");

    await toggleBackend(page, "three-voxel");
    await runUntil(page, true);
    await shoot(page, "3d-night");
    await toggleBackend(page, "canvas-2d");
    await shoot(page, "2d-night");

    const stats = await page.evaluate(() => {
      const s = window.AISystem6BonsaiVoxelRenderer.debugStats();
      return { instanceCount: s.instanceCount, chunks: s.chunkCacheCount, shadowMapSize: s.shadowMapSize, timeOfDay: s.timeOfDay };
    });
    console.log(JSON.stringify(stats));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
