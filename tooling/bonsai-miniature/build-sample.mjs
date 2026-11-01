#!/usr/bin/env node
// Builds the Bonsai City miniature art sample: the district in both tiers,
// the twelve-building specimen sheet, and a before/after board.
//   node tooling/bonsai-miniature/build-sample.mjs [--only sc2k|mini|specimens] [--swiftshader]
// Output: internal/evidence/bonsai-miniature/*.png (review evidence, not shipped).

import { build } from "esbuild";
import { chromium } from "playwright";
import { existsSync } from "node:fs";

// Playwright's own browser download can be missing (a cache clean-up or a
// version bump); fall back to the installed Chrome rather than fetching one.
const launchChannel = () => (existsSync("/Applications/Google Chrome.app") && process.env.BONSAI_USE_BUNDLED !== "1" ? { channel: "chrome" } : {});
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "internal/evidence/bonsai-miniature");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const swiftshader = args.includes("--swiftshader");

const JOBS = [
  { id: "district-sc2k", params: { tier: "sc2k", subject: "district", width: 900, height: 620 }, upscale: 2 },
  { id: "district-mini", params: { tier: "mini", subject: "district", width: 1800, height: 1180 } },
].filter((job) => !only || job.id.includes(only));

// The specimen sheet: every building rendered alone at one fixed scale, then
// tiled four across so the sizes compare honestly.
const SHEET = [
  { id: "specimens-sc2k", cell: { tier: "sc2k", width: 240, height: 400, centerY: 54 }, upscale: 2, bg: "#181c24", ink: "#f4f1ea", sub: "#a9a59c" },
  { id: "specimens-mini", cell: { tier: "mini", width: 480, height: 640, centerY: 46, tiltShift: false, vignette: false, elevation: 32, distance: 600, fov: 15 }, upscale: 1, bg: "#ece6da", ink: "#2a2620", sub: "#6d665b" },
].filter((sheet) => !only || sheet.id.includes(only));

async function bundle() {
  const result = await build({
    entryPoints: [path.join(here, "page.mjs")],
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

function labelSvg(width, height, labels, scale) {
  const items = labels.map((l) => {
    const [en, zh] = l.label.split(" / ");
    const x = l.sx * scale;
    const y = l.sy * scale + 18;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Helvetica, PingFang SC, sans-serif" font-size="15" fill="#f4f1ea" stroke="#1b1f27" stroke-width="3" paint-order="stroke">${zh}</text>`
      + `<text x="${x}" y="${y + 17}" text-anchor="middle" font-family="Helvetica, sans-serif" font-size="12" fill="#d8d4cc" stroke="#1b1f27" stroke-width="3" paint-order="stroke">${en}</text>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${items}</svg>`);
}

async function main() {
  await mkdir(out, { recursive: true });
  const code = await bundle();
  const launchArgs = swiftshader
    ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
  const browser = await chromium.launch({ ...launchChannel(), args: launchArgs });
  const render = async (params) => {
    const page = await browser.newPage({ viewport: { width: params.width, height: params.height } });
    page.on("console", (msg) => { if (msg.type() === "error") console.error(`[render] ${msg.text()}`); });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000"></body></html>`);
    await page.evaluate((p) => { window.__params = p; }, params);
    await page.addScriptTag({ content: code });
    await page.waitForFunction(() => window.__result, null, { timeout: 600000, polling: 250 });
    const result = await page.evaluate(() => window.__result);
    await page.close();
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  try {
    const { BUILDINGS } = await import("./buildings.mjs");
    for (const sheet of SHEET) {
      const started = Date.now();
      const scale = sheet.upscale;
      const cw = sheet.cell.width * scale;
      const ch = sheet.cell.height * scale;
      const labelH = 54;
      const cols = 4;
      const rows = Math.ceil(BUILDINGS.length / cols);
      const layers = [];
      for (let i = 0; i < BUILDINGS.length; i += 1) {
        const def = BUILDINGS[i];
        const result = await render({ ...sheet.cell, subject: "building", building: def.id });
        let img = sharp(Buffer.from(result.png.split(",")[1], "base64"));
        if (scale > 1) img = img.resize(cw, ch, { kernel: "nearest" });
        const left = (i % cols) * cw;
        const top = Math.floor(i / cols) * (ch + labelH);
        layers.push({ input: await img.png().toBuffer(), left, top });
        const [en, zh] = def.label.split(" / ");
        const size = `${def.size}×${def.size}`;
        layers.push({
          input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${labelH}"><rect width="100%" height="100%" fill="${sheet.bg}"/>`
            + `<text x="${cw / 2}" y="22" text-anchor="middle" font-family="PingFang SC, Helvetica, sans-serif" font-size="18" fill="${sheet.ink}">${zh}</text>`
            + `<text x="${cw / 2}" y="42" text-anchor="middle" font-family="Helvetica, sans-serif" font-size="13" fill="${sheet.sub}">${en} · ${def.zone} · ${size}</text></svg>`),
          left,
          top: top + ch,
        });
      }
      const sheetImage = await sharp({ create: { width: cols * cw, height: rows * (ch + labelH), channels: 3, background: sheet.bg } }).composite(layers).png().toBuffer();
      await writeFile(path.join(out, `${sheet.id}.png`), sheetImage);
      console.log(`${sheet.id}: ${BUILDINGS.length} buildings, ${((Date.now() - started) / 1000).toFixed(1)} s`);
    }
    for (const job of JOBS) {
      const started = Date.now();
      const page = await browser.newPage({ viewport: { width: job.params.width, height: job.params.height } });
      page.on("console", (msg) => { if (msg.type() === "error") console.error(`[${job.id}] ${msg.text()}`); });
      await page.setContent(`<!doctype html><html><body style="margin:0;background:#000"></body></html>`);
      await page.evaluate((p) => { window.__params = p; }, job.params);
      await page.addScriptTag({ content: code });
      await page.waitForFunction(() => window.__result, null, { timeout: 600000, polling: 500 });
      const result = await page.evaluate(() => window.__result);
      await page.close();
      if (!result.ok) throw new Error(`${job.id}: ${result.error}`);
      let image = sharp(Buffer.from(result.png.split(",")[1], "base64"));
      const scale = job.upscale || 1;
      if (scale > 1) image = image.resize(job.params.width * scale, job.params.height * scale, { kernel: "nearest" });
      let buffer = await image.png().toBuffer();
      if (job.labels) {
        buffer = await sharp(buffer).composite([{ input: labelSvg(job.params.width * scale, job.params.height * scale, result.labels, scale) }]).png().toBuffer();
      }
      await writeFile(path.join(out, `${job.id}.png`), buffer);
      console.log(`${job.id}: ${result.faces} faces, ${((Date.now() - started) / 1000).toFixed(1)} s`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
