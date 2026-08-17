#!/usr/bin/env node

// Capture the official site's master frames from the real app.
//
// One deterministic desk — real files, real windows, arranged once — is
// captured in all six release appearances as pixel-aligned frames. The site
// shows product pixels only from these captures, so the site can never show
// an interface the product does not have. Rerun after visual releases:
//
//   npm start            (app on :4173)
//   node tooling/capture-site-frames.mjs
//
// Output: site/img/frames/<era>.png (+ .webp for the color eras) and
// site/img/frames/manifest.json with window geometry and provenance.

import { mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "site", "img", "frames");
const appUrl = process.env.APP_URL || "http://localhost:4173/";

const VIEW = { width: 1440, height: 900 };
const ERAS = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];

const MANUSCRIPT_TITLE = "The Tide Comes In Twice";
const MANUSCRIPT_BODY = `# The Tide Comes In Twice

## The bill arrives by moonlight
The engineers at La Rance never called it renewable energy. They called it
the tide, and they billed it by the moon.

## Both directions count
Twice a day the estuary fills, and twice a day it empties. The turbines do
not care which direction the water travels.

## What the 1966 report knew
The barrage generated power on both the ebb and the flood — a fact the
engineers considered unremarkable.`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
await context.clock.setFixedTime(new Date("2026-08-13T10:07:00"));
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

await page.goto(appUrl, { waitUntil: "domcontentloaded" });

// Let the real boot sequence finish.
await page.waitForFunction(() => {
  const boot = document.getElementById("boot-screen");
  return !boot || boot.hidden || boot.classList.contains("is-done") ||
    getComputedStyle(boot).display === "none" || getComputedStyle(boot).opacity === "0";
}, null, { timeout: 30000 });
await page.waitForTimeout(800);

// Compose the desk with the product's own primitives.
const seeded = await page.evaluate(async ({ title, body }) => {
  const out = [];
  // Start Here guide steps aside.
  const guide = document.querySelector('.window[data-window="guide"]');
  if (guide && !guide.classList.contains("is-hidden")) {
    guide.querySelector(".close-box")?.click();
    out.push("guide closed");
  }

  // Real scraps in the Scrapbook.
  createScrap("Ebb and flood", [
    "Selected passage:",
    "“the barrage generated power on both the ebb and the flood”",
    "",
    "---",
    "Source: La Rance — forty years of operation",
    "Site: Reader clip",
  ].join("\n"), { reveal: false });
  createScrap("Billed by the moon", [
    "Selected passage:",
    "“they billed it by the moon”",
    "",
    "---",
    "Source: 1966 feasibility report, p. 12",
  ].join("\n"), { reveal: false });
  out.push("scraps");

  // A real manuscript file on the Project Hard Disk.
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    projectId: typeof activeProjectId !== "undefined" ? activeProjectId : null,
    folderId: null,
    type: "text",
    name: title,
    body,
    createdAt: now,
    updatedAt: now,
  };
  chatFiles.unshift(file);
  if (typeof saveDeskState === "function") saveDeskState();
  if (typeof renderDocuments === "function") renderDocuments();
  out.push("manuscript file");

  // Windows, via the product's own openers.
  if (typeof openTeachTextManuscriptWindow === "function") openTeachTextManuscriptWindow();
  else openWindow("teachText");
  if (typeof teachTextBodyInput !== "undefined" && teachTextBodyInput) {
    teachTextBodyInput.value = body;
    teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
    const titleInput = document.querySelector('#teachtext-title-input, [data-teachtext-title]');
    if (titleInput && "value" in titleInput) {
      titleInput.value = title;
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    out.push("teachtext body");
  }
  openWindow("scrapbook");
  openWindow("findPath");
  openWindow("assistant");
  openWindow("reviewDesk");
  return out;
}, { title: MANUSCRIPT_TITLE, body: MANUSCRIPT_BODY });
console.log("seeded:", seeded.join(", "));
await page.waitForTimeout(600);

// Type a real query into Searcher's field (typed text, no fabricated results).
await page.evaluate(() => {
  const input = document.querySelector('.window[data-window="findPath"] input[type="text"], .window[data-window="findPath"] input:not([type])');
  if (input) {
    input.value = "tidal power";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

// Arrange the desk. Order also sets stacking: last placed = frontmost.
// The manuscript (TeachText) is the hero and stays clear on the right; the
// research apps fan out on the left, each with a readable title bar showing.
const LAYOUT = [
  ["assistant", 380, 448, 470, 400],
  ["findPath", 32, 44, 400, 316],
  ["scrapbook", 48, 396, 330, 452],
  ["reviewDesk", 872, 600, 400, 228],
  ["teachText", 700, 96, 560, 480],
];
await page.evaluate((layout) => {
  for (const [name, x, y, w, h] of layout) {
    const el = document.querySelector(`.window[data-window="${name}"]`);
    if (!el) continue;
    el.classList.remove("is-hidden");
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = w + "px";
    if (h) el.style.height = h + "px";
    // The product's own focus path decides z-order.
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  }
}, LAYOUT);
await page.waitForTimeout(500);

// Window geometry → manifest, as viewport fractions for the site's viewer.
const rects = await page.evaluate((names) => {
  const map = {};
  for (const name of names) {
    const el = document.querySelector(`.window[data-window="${name}"]`);
    if (!el || el.classList.contains("is-hidden")) continue;
    const r = el.getBoundingClientRect();
    map[name] = {
      x: r.x / innerWidth, y: r.y / innerHeight,
      w: r.width / innerWidth, h: r.height / innerHeight,
    };
  }
  map.icons = {};
  for (const icon of document.querySelectorAll(".desktop-icon")) {
    const r = icon.getBoundingClientRect();
    if (!r.width) continue;
    const label = (icon.textContent || "").trim();
    if (label) {
      map.icons[label] = {
        x: r.x / innerWidth, y: r.y / innerHeight,
        w: r.width / innerWidth, h: r.height / innerHeight,
      };
    }
  }
  const bar = document.querySelector(".menu-bar");
  if (bar) {
    const r = bar.getBoundingClientRect();
    map.menuBar = { x: r.x / innerWidth, y: r.y / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight };
  }
  return map;
}, LAYOUT.map((l) => l[0]));

// Provenance.
const build = await page.evaluate(async () => {
  try {
    const res = await fetch("/api/version");
    const data = await res.json();
    return data.build || data.version || null;
  } catch (e) { return null; }
});

mkdirSync(outDir, { recursive: true });
const files = {};
for (const era of ERAS) {
  await page.evaluate((id) => {
    const item = document.querySelector(`[data-action="set-theme-${id}"]`);
    if (!item) throw new Error("missing theme action: " + id);
    item.click();
  }, era);
  await page.waitForTimeout(era === "liquid-glass" ? 2000 : 1100);
  const png = path.join(outDir, `${era}.png`);
  await page.screenshot({ path: png });
  files[era] = `${era}.png`;
  // Color eras compress far better as WebP; the 1-bit eras stay PNG so the
  // dither pattern keeps its exact pixels.
  {
    const webp = path.join(outDir, `${era}.webp`);
    try {
      execFileSync("cwebp", ["-quiet", "-q", "88", "-sharp_yuv", png, "-o", webp]);
      files[era] = `${era}.webp`;
      rmSync(png);
    } catch (e) {
      console.warn("webp encode failed for", era, "- keeping png");
    }
  }
  console.log("captured", era, Math.round(statSync(path.join(outDir, files[era])).size / 1024) + "KB");
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({
  capturedAt: new Date().toISOString(),
  build,
  viewport: VIEW,
  deviceScaleFactor: 2,
  files,
  windows: rects,
}, null, 2));
console.log("manifest written; build:", build);

await browser.close();
