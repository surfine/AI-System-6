#!/usr/bin/env node
// Imports a real place through Map Setup exactly as a player does (terrain
// "Real Place", coordinates, optional buildings, Preview, Start City) and
// captures the founded city in the 2D and the 3D view. Needs a running dev
// server with network access for the OSM relay.
//   node tooling/bonsai-miniature/capture-osm.mjs [--url http://127.0.0.1:4192] [--at 31.2400,121.4900] [--size 96] [--buildings] [--zoom-out 2] [--name shanghai]
// Output: internal/evidence/bonsai-osm/<name>-2d-3d.png

import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = arg("--url", "http://127.0.0.1:4192");
const at = arg("--at", "31.2400,121.4900");
const size = arg("--size", "96");
const name = arg("--name", "place");
const buildings = args.includes("--buildings");

const launchChannel = () => (existsSync("/Applications/Google Chrome.app") && process.env.BONSAI_USE_BUNDLED !== "1" ? { channel: "chrome" } : {});
const browser = await chromium.launch({ ...launchChannel(), args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "zh-CN" });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error.message || error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.goto(`${base}/?launch=bonsai-city`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.openWindow === "function" && document.readyState === "complete", null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { try { window.openWindow("bonsaiCity"); } catch { /* already open */ } });
await page.waitForSelector(".bonsai-map-layer", { timeout: 180000 });
await page.evaluate(() => window.AISystem6Runtime?.dispatchCommand?.("bonsai-new-city"));
await page.waitForSelector("[data-bonsai-map-terrain]", { timeout: 60000 });
await page.selectOption("[data-bonsai-map-size]", size);
await page.selectOption("[data-bonsai-map-terrain]", "osm");
await page.fill("[data-bonsai-osm-coords]", at.replace(",", ", "));
await page.dispatchEvent("[data-bonsai-osm-coords]", "change");
if (buildings) await page.check("[data-bonsai-osm-buildings]");
await page.fill("[data-bonsai-map-name]", name);
const note = () => page.textContent("[data-bonsai-setup-preview-note]");
console.log("idle note:", await note());
await page.click("[data-bonsai-setup-regenerate]");
const started = Date.now();
await page.waitForFunction(() => /现有地块|standing lots/.test(document.querySelector("[data-bonsai-setup-preview-note]")?.textContent || "")
  || /没有回应|did not answer|额度|busy|正在取另一张/.test(document.querySelector("[data-bonsai-status-message]")?.textContent || ""), null, { timeout: 240000 });
console.log(`preview after ${((Date.now() - started) / 1000).toFixed(1)}s:`, await note());
await page.click("[data-bonsai-map-create]");
await page.waitForFunction(() => document.querySelector("[data-bonsai-map-setup]")?.hidden === true, null, { timeout: 240000 });
await page.waitForTimeout(4000);
console.log("status:", await page.textContent("[data-bonsai-status-message]"));
console.log("credit:", await page.textContent("[data-bonsai-map-credit]"), "hidden:", await page.getAttribute("[data-bonsai-map-credit]", "hidden"));
const zoomOut = Number(arg("--zoom-out", "0"));
for (let i = 0; i < zoomOut; i += 1) {
  await page.evaluate(() => window.AISystem6Runtime?.dispatchCommand?.("bonsai-zoom-out"));
  await page.waitForTimeout(1500);
}
await page.evaluate(() => document.querySelectorAll(".bonsai-minimap").forEach((c) => { const p = c.closest("section,aside,div"); if (p) p.style.visibility = "hidden"; }));
await page.waitForTimeout(2000);
const map = page.locator(".bonsai-map-shell").first();
const box = await map.boundingBox();
const clip = { x: box.x, y: box.y, width: Math.min(box.width, 900), height: Math.min(box.height, 640) };
const cdp = await page.context().newCDPSession(page);
const capture = async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } })).data, "base64");
const shot2d = await capture();
// Run the clock for a while: the imported city must run.
const before = await page.evaluate(() => window.AISystem6BonsaiCity.debugState().hashInputSummary.tick);
await page.evaluate(() => window.AISystem6BonsaiCity.setSpeed(4));
await page.waitForTimeout(15000);
await page.evaluate(() => window.AISystem6BonsaiCity.pause());
const after = await page.evaluate(() => window.AISystem6BonsaiCity.debugState().hashInputSummary.tick);
console.log(`clock ran: tick ${before} -> ${after}`);
const pressButton = (pattern) => page.evaluate((source) => {
  const re = new RegExp(source);
  const button = [...document.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()));
  button?.click();
  return Boolean(button);
}, pattern);
await pressButton("^(2D view / 3D view|2D 视图 / 3D 视图)$");
await page.waitForTimeout(15000);
console.log("backend:", await page.evaluate(() => window.AISystem6BonsaiCity.debugState().backend));
const shot3d = await capture();
console.log("errors:", errors.length ? errors.slice(0, 8).join(" | ") : "none");
await browser.close();

const outDir = path.join(root, "internal/evidence/bonsai-osm");
mkdirSync(outDir, { recursive: true });
const W = Math.round(clip.width), H = Math.round(clip.height);
const label = (text) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40"><rect width="100%" height="100%" fill="#181c24"/><text x="14" y="27" font-family="PingFang SC, Helvetica" font-size="20" fill="#f4f1ea">${text}</text></svg>`);
const out = path.join(outDir, `${name}-2d-3d.png`);
await sharp({ create: { width: W * 2 + 8, height: H + 40, channels: 3, background: "#181c24" } }).composite([
  { input: label(`2D · ${name} · ${at}`), left: 0, top: 0 },
  { input: label("3D · 同一座城"), left: W + 8, top: 0 },
  { input: await sharp(shot2d).resize(W, H).png().toBuffer(), left: 0, top: 40 },
  { input: await sharp(shot3d).resize(W, H).png().toBuffer(), left: W + 8, top: 40 },
]).png().toFile(out);
console.log(path.relative(root, out));
