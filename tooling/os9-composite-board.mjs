#!/usr/bin/env node
// C1 (2026-10-16): a composite-level Platinum fidelity board.
//
// Theme Lab pins single controls; regressions slipped in where controls meet
// (a whole window, the whole desk). This board photographs the running desk
// in Platinum at the real machine's 800×600, DPR 1, beside the Mac OS 9.0.4
// frames captured from Infinite Mac, and writes 2× nearest-neighbour strips
// plus a small pixel ledger (mean absolute difference per region).
//
// The baseline frames are internal evidence only (decision G7): they live in
// internal/evidence/exe-study-2026-10-16/shots/ and must never be copied into
// apps/, site/ or a public snapshot. The board's output stays under internal/.
// It is an instrument, not a gate: run it before and after a chrome change and
// read the strips.
//
//   node tooling/os9-composite-board.mjs [--url http://127.0.0.1:4173] [--out <dir>]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const url = arg("--url", "http://127.0.0.1:4173/");
const baseline = path.join(root, "internal/evidence/exe-study-2026-10-16/shots");
const out = path.resolve(arg("--out", path.join(root, "internal/evidence/os9-board", new Date().toISOString().slice(0, 10))));
mkdirSync(out, { recursive: true });

// Regions in 800×600 coordinates: [label, os9 file, our capture, x, y, w, h].
const regions = [
  ["menubar", "os9-desktop.png", "ours-desktop.png", 0, 0, 400, 22],
  ["desktop-icons", "os9-desktop.png", "ours-desktop.png", 700, 30, 100, 260],
  ["apple-menu", "os9-apple-menu.png", "ours-apple-menu.png", 0, 0, 300, 250],
];

async function capture() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 90000 });
  await page.evaluate(() => window.AISystem6Theme.applyTheme("platinum"));
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    for (const win of document.querySelectorAll(".window[data-window]:not(.is-hidden)")) {
      try { await closeWindow(win.dataset.window, true); } catch {}
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, "ours-desktop.png") });
  await page.evaluate(() => openWindow("about"));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, "ours-window.png") });
  await page.evaluate(() => closeWindow("about"));
  await page.mouse.click(14, 10);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, "ours-apple-menu.png") });
  await browser.close();
}

async function compose() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const ledger = [];
  for (const [label, os9File, oursFile, x, y, w, h] of regions) {
    const cells = [["Mac OS 9.0.4", path.join(baseline, os9File)], ["AI System 6", path.join(out, oursFile)]];
    const html = `<body style="margin:0;background:#fff;font:13px -apple-system;display:flex;gap:16px;padding:12px">${cells.map(([name, file]) => `<div><div>${name}</div><canvas data-src="data:image/png;base64,${readFileSync(file).toString("base64")}" width="${w * 2}" height="${h * 2}" style="border:1px solid #888;image-rendering:pixelated"></canvas></div>`).join("")}</body>`;
    await page.setContent(html, { waitUntil: "load" });
    const mad = await page.evaluate(async ([sx, sy, sw, sh]) => {
      const data = [];
      for (const canvas of document.querySelectorAll("canvas")) {
        const image = new Image();
        image.src = canvas.dataset.src;
        await image.decode();
        const g = canvas.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.drawImage(image, sx, sy, sw, sh, 0, 0, sw * 2, sh * 2);
        const scratch = document.createElement("canvas");
        scratch.width = sw; scratch.height = sh;
        scratch.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        data.push(scratch.getContext("2d").getImageData(0, 0, sw, sh).data);
      }
      let sum = 0;
      for (let i = 0; i < data[0].length; i += 4) {
        for (let c = 0; c < 3; c += 1) sum += Math.abs(data[0][i + c] - data[1][i + c]);
      }
      return sum / (data[0].length / 4) / 3;
    }, [x, y, w, h]);
    const size = await page.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight]);
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.screenshot({ path: path.join(out, `cmp-${label}.png`) });
    ledger.push({ region: label, meanAbsoluteDifference: Number(mad.toFixed(2)) });
  }
  await browser.close();
  writeFileSync(path.join(out, "ledger.json"), `${JSON.stringify({ url, measuredAt: new Date().toISOString(), regions: ledger }, null, 2)}\n`);
  return ledger;
}

await capture();
const ledger = await compose();
for (const row of ledger) console.log(`${row.region.padEnd(14)} mean |Δ| ${row.meanAbsoluteDifference}`);
console.log(`board: ${path.relative(root, out)}`);
