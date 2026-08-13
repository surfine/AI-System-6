#!/usr/bin/env node

// Capture the proof shots: the real app doing the things a 1988 desktop
// should not be able to do. Each shot is one window of the running product,
// with real content, and no model or network involved. The site shows these
// instead of asking the visitor to take the claim on faith.
//
//   npm start                       (app on :4173)
//   node tooling/capture-site-proofs.mjs
//
// Output: site/img/proofs/<id>.webp + proofs.json

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "site", "img", "proofs");
const appUrl = process.env.APP_URL || "http://localhost:4173/";

const CHART_MARKDOWN = `| year | GWh |
| --- | --- |
| 1967 | 240 |
| 1980 | 490 |
| 1995 | 512 |
| 2010 | 486 |
| 2024 | 503 |`;

const SLIDE_MARKDOWN = `---
marp: true
title: The Tide Comes In Twice
---

# The Tide Comes In Twice

---

## Billed by the moon

The engineers at La Rance never called it renewable energy.

---

## 240 GWh, twice a day`;

// Each proof names the window to shoot and the setup that fills it with real
// content. Everything here runs offline: no model, no network.
const PROOFS = [
  {
    id: "slides",
    window: "clioStage",
    label: "Build Slides",
    caption: "A Marp deck, opened and presented on the desktop.",
    async setup(page) {
      await page.evaluate(async (md) => {
        if (typeof ensureClioStageModule === "function") await ensureClioStageModule();
        await window.AISystem6ClioStage?.load?.({ title: "slides.md", markdown: md });
        openWindow("clioStage");
      }, SLIDE_MARKDOWN);
      await page.waitForTimeout(2200);
    },
  },
  {
    id: "charts",
    window: "clioChart",
    label: "Make Charts",
    caption: "A Markdown table in the manuscript, projected as a chart.",
    async setup(page) {
      // The product's own handoff: a table in TeachText, then ClioChart's
      // openFromTeachText, which reads the table under the caret.
      await page.evaluate(async (md) => {
        openWindow("teachText");
        if (typeof teachTextBodyInput !== "undefined" && teachTextBodyInput) {
          teachTextBodyInput.value = md;
          teachTextBodyInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (typeof ensureClioChartModule === "function") await ensureClioChartModule();
        await window.AISystem6ClioChart?.openFromTeachText?.();
      }, CHART_MARKDOWN);
      await page.waitForTimeout(2400);
      // Filling TeachText from a script leaves the document dirty, so the
      // handoff raises a save sheet. Decline it: the proof is the chart.
      await page.evaluate(() => {
        const decline = [...document.querySelectorAll("button")].find((b) =>
          /Don't Save|不存储|不保存/i.test(b.textContent || ""));
        decline?.click();
        document.querySelectorAll(".window").forEach((w) => {
          if (w.dataset.window !== "clioChart") w.classList.add("is-hidden");
        });
      });
      await page.waitForTimeout(700);
    },
  },
  {
    id: "cmf",
    window: "cmfStudio",
    label: "Design in 3D",
    caption: "A 3D colorway on a 1988 desktop, exportable as USDZ for AR.",
    async setup(page) {
      await page.evaluate(() => openWindow("cmfStudio"));
      await page.waitForTimeout(4500);
    },
  },
  {
    id: "glass",
    window: "liquidCover",
    label: "Render Glass",
    caption: "Refractive WebGL typography, rendered in the browser.",
    async setup(page) {
      await page.evaluate(async () => {
        if (typeof openLiquidCover === "function") await openLiquidCover();
        else openWindow("liquidCover");
      });
      await page.waitForTimeout(4500);
    },
  },
];


const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
await context.clock.setFixedTime(new Date("2026-08-13T10:07:00"));
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

await page.goto(appUrl, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => {
  const boot = document.getElementById("boot-screen");
  return !boot || boot.hidden || getComputedStyle(boot).display === "none";
}, null, { timeout: 30000 });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const guide = document.querySelector('.window[data-window="guide"]');
  if (guide && !guide.classList.contains("is-hidden")) guide.querySelector(".close-box")?.click();
});

mkdirSync(outDir, { recursive: true });
const captured = [];

for (const proof of PROOFS) {
  // One window at a time, centred and alone, so the shot is about the work.
  await page.evaluate((keep) => {
    document.querySelectorAll(".window").forEach((win) => {
      if (win.dataset.window !== keep) win.classList.add("is-hidden");
    });
  }, proof.window);

  try {
    await proof.setup(page);
  } catch (error) {
    console.warn(`skip ${proof.id}: setup failed:`, error.message);
    continue;
  }

  const box = await page.evaluate((name) => {
    const win = document.querySelector(`.window[data-window="${name}"]`);
    if (!win) return null;
    win.classList.remove("is-hidden");
    win.style.left = "120px";
    win.style.top = "80px";
    win.style.width = "900px";
    win.style.height = "620px";
    const r = win.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, proof.window);

  if (!box || box.width < 200) {
    console.warn(`skip ${proof.id}: window never appeared`);
    continue;
  }
  await page.waitForTimeout(1200);

  const png = path.join(outDir, `${proof.id}.png`);
  await page.screenshot({ path: png, clip: box });
  const webp = path.join(outDir, `${proof.id}.webp`);
  let file = `${proof.id}.png`;
  try {
    execFileSync("cwebp", ["-quiet", "-q", "86", png, "-o", webp]);
    rmSync(png);
    file = `${proof.id}.webp`;
  } catch (e) {
    console.warn("webp encode failed for", proof.id);
  }
  captured.push({ id: proof.id, label: proof.label, caption: proof.caption, file });
  console.log("captured", proof.id, Math.round(statSync(path.join(outDir, file)).size / 1024) + "KB");
}

const build = await page.evaluate(async () => {
  try { return (await (await fetch("/api/version")).json()).build || null; } catch (e) { return null; }
});

writeFileSync(path.join(outDir, "proofs.json"), JSON.stringify({
  capturedAt: new Date().toISOString(),
  build,
  proofs: captured,
}, null, 2));
console.log(`wrote ${captured.length} proof(s); build ${build}`);

await browser.close();
