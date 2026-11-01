#!/usr/bin/env node

// The original games, photographed in the running product. No replacement
// artwork or synthetic UI: only built-in examples and normal game controls.
// APP_URL=http://localhost:4173 node tooling/capture-site-games.mjs [--only id]
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { stubLocalModels } from "./lib/stub-local-models.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "site/img/proofs");
const evidence = path.join(root, "internal/evidence/drafts/site-games-20261010");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
await stubLocalModels(context);
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
const shots = [];

async function open(name, command, width = 1100, height = 720) {
  await page.locator(".window:not(.is-hidden) .close-box").evaluateAll(nodes => nodes.forEach(n => n.click()));
  await page.evaluate(async ({ command }) => { await handleAction(command); }, { command });
  await page.locator(`.window[data-window="${name}"]:not(.is-hidden)`).waitFor({ timeout: 120000 });
  await page.evaluate(({ name, width, height }) => {
    window.AISystem6Theme.applyTheme("platinum", { persist: false, announce: false });
    const win = document.querySelector(`.window[data-window="${name}"]`);
    Object.assign(win.style, { left: "100px", top: "80px", width: `${width}px`, height: `${height}px`, right: "auto" });
    window.dispatchEvent(new Event("resize"));
  }, { name, width, height });
  await page.waitForTimeout(900);
}

async function shoot(id, name, caption, width = 1400) {
  await page.mouse.move(20, 40);
  await page.waitForTimeout(700);
  const png = path.join(evidence, `${id}.png`);
  const box = await page.locator(`.window[data-window="${name}"]`).boundingBox();
  await page.screenshot({ path: png, clip: box, timeout: 30000 });
  execFileSync("cwebp", ["-quiet", "-q", id === "bonsai-city" ? "78" : "82", "-m", "6", "-resize", String(width), "0", png, "-o", path.join(out, `${id}.webp`)]);
  shots.push({ id, file: `${id}.webp`, caption, appearance: "platinum", source: "running application", width });
  console.log(`captured ${id}`);
}

try {
  console.log("browser ready");
  await page.goto(process.env.APP_URL || "http://localhost:4173/", { waitUntil: "domcontentloaded" });
  console.log("page loaded");
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 120000 });
  console.log("app ready");
  await page.evaluate(async () => { if (currentLanguage !== "zh") await switchLanguage(); });
  // City and Rootline use the same saved Hezhou example in this fresh profile.
  if (!only || ["bonsai-city", "rootline"].includes(only)) {
    await open("bonsaiCity", "open-bonsai-city");
    await page.evaluate(() => window.AISystem6BonsaiCity.openCities());
    await page.locator('[data-bonsai-example="hezhou-1952"]').click();
    await page.waitForFunction(() => window.AISystem6BonsaiCity?.debugState()?.renderer?.ready, null, { timeout: 60000 });
    await page.evaluate(async () => { window.AISystem6BonsaiCity.pause(); await window.AISystem6BonsaiCity.save(); });
    if (!only || only === "bonsai-city") await shoot("bonsai-city", "bonsaiCity", "Hezhou, 1952. The built-in town, paused after opening.", 1120);
  }
  if (!only || only === "rootline") {
    await open("rootline", "open-rootline");
    await page.getByRole("button", { name: "文件", exact: true }).click();
    await page.getByRole("button", { name: "打开盆景城市……", exact: true }).click();
    await page.locator(".rootline-pot").filter({ hasText: "鹤洲" }).click();
    await page.waitForFunction(() => window.AISystem6Rootline?.inspect()?.stations?.length > 1);
    const game = await page.evaluate(() => window.AISystem6Rootline.inspect());
    writeFileSync(path.join(evidence, "rootline-state.json"), JSON.stringify(game, null, 2));
    // Draw through actual pointer events; the game's rules accept or reject it.
    const stations = game.stations.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const bounds = await page.locator(".rootline-map").boundingBox();
    const points = await page.evaluate(ids => ids.map(id => window.AISystem6Rootline.stationScreen(id)), stations.map(s => s.id));
    if (bounds && points.length >= 2 && points.every(Boolean)) {
      await page.mouse.move(bounds.x + points[0].x, bounds.y + points[0].y);
      await page.mouse.down();
      for (const point of points.slice(1)) await page.mouse.move(bounds.x + point.x, bounds.y + point.y, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1800);
    }
    await shoot("rootline", "rootline", "The same Hezhou save, opened as a transport rehearsal.", 1100);
  }
  if (!only || only === "joyride") {
    await open("joyride", "open-joyride", 1100, 700);
    await page.getByRole("button", { name: "开始兜风", exact: true }).waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "开始兜风", exact: true }).click();
    await page.waitForTimeout(8000);
    writeFileSync(path.join(evidence, "joyride-state.json"), JSON.stringify(await page.evaluate(() => window.AISystem6Joyride.debugState()), null, 2));
    await shoot("joyride", "joyride", "Hezhou, 1952, at street level. The built-in demonstration town.", 1100);
  }
  if (!only || only === "mingwen") {
    await open("mingwen", "open-mingwen", 1120, 850);
    const frame = page.frameLocator('iframe[src*="assets/mingwen/index.html"]');
    await frame.getByRole("button", { name: "开始", exact: true }).waitFor({ timeout: 60000 });
    await shoot("mingwen", "mingwen", "Plaintext — the ghostwriter and the cartographer. The live title screen.", 1120);
  }
  const version = await page.evaluate(async () => (await (await fetch("/api/version")).json()));
  const manifest = path.join(out, "games.json");
  let previous = [];
  if (only) { try { previous = JSON.parse(readFileSync(manifest, "utf8")).shots; } catch {} }
  writeFileSync(manifest, JSON.stringify({ capturedAt: new Date().toISOString(), version, shots: [...previous.filter(s => !shots.some(n => n.id === s.id)), ...shots], errors }, null, 2) + "\n");
  if (errors.length) throw new Error(errors.join("\n"));
} catch (error) {
  console.error(await page.evaluate(() => ({ ready: document.body.dataset.appReady, text: document.body.innerText.slice(-2000) })));
  throw error;
} finally {
  await browser.close();
}
