#!/usr/bin/env node

// Capture release evidence from the official site itself. The screenshots and
// recording are deliberately browser output, not a separately reconstructed
// promo composition, so every visible product pixel follows the site's real
// frame manifest. Output stays local under internal/evidence/drafts/.

import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(root, "site");
const outputRoot = path.resolve(
  root,
  process.env.SITE_EVIDENCE_DIR || "internal/evidence/drafts/official-site",
);

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function serveSite() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const decoded = decodeURIComponent(url.pathname);
      const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
      const candidate = path.resolve(siteRoot, relative);
      if (candidate !== siteRoot && !candidate.startsWith(siteRoot + path.sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(candidate);
      const file = info.isDirectory() ? path.join(candidate, "index.html") : candidate;
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": types.get(path.extname(file)) || "application/octet-stream",
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function preparePage(context, baseUrl) {
  await context.addInitScript(() => {
    sessionStorage.setItem("s6-booted", "1");
    localStorage.setItem("s6-site-theme", "classic");
    localStorage.removeItem("s6-site-theme-cycle");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  pageErrors.set(page, errors);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#hero-machine .machine-frame").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  assertPageClean(page);
  return page;
}

async function frameSection(page, selector) {
  await page.locator(selector).waitFor({ state: "visible" });
  await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return;
    const top = window.scrollY + element.getBoundingClientRect().top - 42;
    window.scrollTo(0, Math.max(0, top));
  }, selector);
  await page.waitForTimeout(150);
}

mkdirSync(outputRoot, { recursive: true });
const server = await serveSite();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
const browser = await chromium.launch();
const pageErrors = new WeakMap();

function assertPageClean(page) {
  const errors = pageErrors.get(page) || [];
  if (errors.length) throw new Error(`site emitted browser errors:\n${errors.join("\n")}`);
}

async function verifyEveryEra(page) {
  const eraIds = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];
  for (const eraId of eraIds) {
    await page.locator(`#era-strip [data-era="${eraId}"]`).click();
    await page.waitForFunction((id) => {
      const theme = document.documentElement.getAttribute("data-theme") || "classic";
      const frames = [...document.querySelectorAll(".machine-frame:not(.is-under)")];
      const icons = [...document.querySelectorAll("img[data-icon]")];
      return theme === id && !document.querySelector(".machine-has-error") &&
        frames.every((image) => image.dataset.era === id && image.complete && image.naturalWidth > 0) &&
        icons.every((image) => image.complete && image.naturalWidth > 0);
    }, eraId);
  }
  assertPageClean(page);
}

async function verifyCaptureFallback(baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => sessionStorage.setItem("s6-booted", "1"));
  const page = await context.newPage();
  const pageFailures = [];
  page.on("pageerror", (error) => pageFailures.push(error.message));
  await page.route("**/img/frames/manifest.json*", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: "{}",
  }));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#hero-machine .machine-error a").waitFor({ state: "visible" });
  const fallback = await page.evaluate(() => ({
    figures: document.querySelectorAll(".machine-figure").length,
    messages: document.querySelectorAll(".machine-figure > .machine-error").length,
    timelineTicks: document.querySelectorAll("#era-strip .era-tick").length,
    snapshotDisabled: document.querySelector("#snapshot-btn")?.disabled === true,
  }));
  await context.close();
  if (pageFailures.length || fallback.figures !== fallback.messages ||
      fallback.timelineTicks !== 6 || !fallback.snapshotDisabled) {
    throw new Error(`desktop-capture fallback is incomplete: ${JSON.stringify({ fallback, pageFailures })}`);
  }
}

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const desktop = await preparePage(desktopContext, baseUrl);
  await desktop.screenshot({
    path: path.join(outputRoot, "official-site-desktop.png"),
    animations: "disabled",
  });
  await desktop.setViewportSize({ width: 1440, height: 1080 });
  await frameSection(desktop, "#eras");
  await desktop.screenshot({
    path: path.join(outputRoot, "official-site-six-eras.png"),
    animations: "disabled",
  });
  await verifyEveryEra(desktop);
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const mobile = await preparePage(mobileContext, baseUrl);
  await mobile.screenshot({
    path: path.join(outputRoot, "official-site-mobile.png"),
    animations: "disabled",
  });
  await mobileContext.close();

  await verifyCaptureFallback(baseUrl);

  const videoDir = path.join(outputRoot, "video-source");
  mkdirSync(videoDir, { recursive: true });
  const videoContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const recording = await preparePage(videoContext, baseUrl);
  await frameSection(recording, "#eras");
  await recording.waitForTimeout(400);
  const video = recording.video();
  await recording.locator("#cycle-btn").click();
  await recording.waitForTimeout(12_300);
  await recording.locator("#cycle-btn").click();
  await recording.waitForTimeout(350);
  assertPageClean(recording);
  await recording.close();
  await videoContext.close();
  const webm = path.join(outputRoot, "official-site-six-eras.webm");
  await video.saveAs(webm);
  const mp4 = path.join(outputRoot, "official-site-six-eras.mp4");
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", "-i", webm, "-ss", "1.5", "-t", "13", "-an",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4,
  ]);

  writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify({
    source: "site/",
    url: baseUrl,
    screenshots: [
      "official-site-desktop.png",
      "official-site-six-eras.png",
      "official-site-mobile.png",
    ],
    recording: "official-site-six-eras.mp4",
    recordingSource: "official-site-six-eras.webm",
  }, null, 2));
  console.log(`official site evidence -> ${outputRoot}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
