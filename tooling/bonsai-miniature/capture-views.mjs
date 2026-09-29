#!/usr/bin/env node
// Captures one example city in the 2D view and the 3D view from the same
// camera and puts them side by side, so "is it the same building?" is a
// look, not an argument. Needs a running dev server.
//   node tooling/bonsai-miniature/capture-views.mjs [--url http://127.0.0.1:4191] [--example starter-town] [--zoom-in 1|-2] [--tank] [--swiftshader] [--study white,wood,chipboard]
// Output: internal/evidence/bonsai-miniature/views-2d-3d.png

import { chromium } from "playwright";
import { existsSync } from "node:fs";

// Playwright's own browser download can be missing (a cache clean-up or a
// version bump); fall back to the installed Chrome rather than fetching one.
const launchChannel = () => (existsSync("/Applications/Google Chrome.app") && process.env.BONSAI_USE_BUNDLED !== "1" ? { channel: "chrome" } : {});
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = arg("--url", "http://127.0.0.1:4191");
const example = arg("--example", "starter-town");
const zoomIn = Number(arg("--zoom-in", "1"));

const gpuArgs = args.includes("--swiftshader")
  ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ ...launchChannel(), args: gpuArgs });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "en-US" });
await page.goto(`${base}/?launch=bonsai-city`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.openWindow === "function" && document.readyState === "complete", null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { try { window.openWindow("bonsaiCity"); } catch { /* already open */ } });
await page.waitForSelector(".bonsai-map-layer", { timeout: 120000 });
const pressButton = (pattern) => page.evaluate((source) => {
  const re = new RegExp(source);
  const button = [...document.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()));
  button?.click();
  return Boolean(button);
}, pattern);
await pressButton("^(Open Cit|打开城市)");
await page.waitForSelector(`[data-bonsai-example="${example}"]`, { timeout: 60000 });
await page.evaluate((id) => document.querySelector(`[data-bonsai-example="${id}"]`)?.click(), example);
await page.waitForTimeout(5000);
for (let i = 0; i < Math.abs(zoomIn); i += 1) { await pressButton(zoomIn > 0 ? "^(Zoom in|放大)$" : "^(Zoom out|缩小)$"); await page.waitForTimeout(2000); }
if (args.includes("--tank")) await pressButton("^(Glass tank|玻璃缸)$");
await page.evaluate(() => document.querySelectorAll(".bonsai-minimap").forEach((c) => { const p = c.closest("section,aside,div"); if (p) p.style.visibility = "hidden"; }));
await page.waitForTimeout(2500);
const map = page.locator(".bonsai-map-layer-terrain").first();
const box = await map.boundingBox();
const clip = { x: box.x, y: box.y, width: Math.min(box.width, 900), height: Math.min(box.height, 640) };
// CDP capture: Playwright's screenshot waits for every web font, and a font
// that 404s in a fresh worktree makes that wait endless.
const cdp = await page.context().newCDPSession(page);
const capture = async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } })).data, "base64");
const shot2d = await capture();
await pressButton("^(2D view / 3D view|2D 视图 / 3D 视图)$");
await page.waitForTimeout(12000);
const backend = await page.evaluate(() => window.AISystem6BonsaiCity?.debugState?.().backend);
if (!/voxel|three/.test(String(backend))) console.warn(`warning: the 3D view did not start (backend ${backend}); try --swiftshader`);
const shot3d = await capture();
// --study white,wood,chipboard: the same camera in each study-model material.
const studies = (arg("--study", "") || "").split(",").filter(Boolean);
const studyShots = [];
for (const kind of studies) {
  await page.evaluate((k) => window.AISystem6Runtime?.dispatchCommand?.(`bonsai-study-${k}`), kind);
  await page.waitForTimeout(8000);
  studyShots.push({ kind, png: await capture() });
}
await browser.close();

const W = Math.round(clip.width), H = Math.round(clip.height);
const label = (text) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40"><rect width="100%" height="100%" fill="#181c24"/><text x="14" y="27" font-family="PingFang SC, Helvetica" font-size="20" fill="#f4f1ea">${text}</text></svg>`);
if (studyShots.length) {
  const names = { white: "白模", wood: "木模", chipboard: "灰板白模" };
  const studyOut = path.join(root, "internal/evidence/bonsai-miniature/views-study.png");
  const layers = [];
  for (const [i, shot] of studyShots.entries()) {
    layers.push({ input: label(`素模：${names[shot.kind] || shot.kind}`), left: i * (W + 8), top: 0 });
    layers.push({ input: await sharp(shot.png).resize(W, H).png().toBuffer(), left: i * (W + 8), top: 40 });
  }
  await sharp({ create: { width: studyShots.length * (W + 8) - 8, height: H + 40, channels: 3, background: "#181c24" } }).composite(layers).png().toFile(studyOut);
  console.log(path.relative(root, studyOut));
}
const out = path.join(root, "internal/evidence/bonsai-miniature/views-2d-3d.png");
await sharp({ create: { width: W * 2 + 8, height: H + 40, channels: 3, background: "#181c24" } }).composite([
  { input: label("2D 视图（SC2K 档图集）"), left: 0, top: 0 },
  { input: label("3D 视图（同一批体素模型实时绘制）"), left: W + 8, top: 0 },
  { input: await sharp(shot2d).resize(W, H).png().toBuffer(), left: 0, top: 40 },
  { input: await sharp(shot3d).resize(W, H).png().toBuffer(), left: W + 8, top: 40 },
]).png().toFile(out);
console.log(path.relative(root, out));
