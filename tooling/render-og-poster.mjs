// Render the official site's share cards (1200×630):
//   site/og-poster.html            -> site/img/og-poster.png       (home)
//   site/og-history.html?lang=en   -> site/img/og-history.png      (Field Notes)
//   site/og-history.html?lang=zh   -> site/img/og-history-zh.png   (往事)
// Needs the site dev server: npx http-server or python3 -m http.server in
// site/ — or pass SITE_URL. Default: http://localhost:4181/.
// A word argument renders only the cards whose file name contains it:
//   node tooling/render-og-poster.mjs history

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.SITE_URL || "http://localhost:4181/";
// The history cards are flat paper, type and seven small icons, so a
// 256-colour palette (octree, which keeps the icons' small accents that a
// median cut drops) is visually identical at a third of the size. That is not
// vanity: the whole site answers to a 4 MiB payload budget in verify-site.
const CARDS = [
  ["og-poster.html", "og-poster.png", false],
  ["og-history.html?lang=en", "og-history.png", true],
  ["og-history.html?lang=zh", "og-history-zh.png", true],
];

function paletteize(file) {
  const script = [
    "import sys",
    "from PIL import Image",
    "im = Image.open(sys.argv[1]).convert('RGB')",
    "im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(sys.argv[1], optimize=True)",
  ].join("\n");
  const run = spawnSync("python3", ["-c", script, file], { encoding: "utf8" });
  if (run.status !== 0) console.warn("palette step skipped (python3 with Pillow not available):", file);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const only = process.argv[2];
for (const [source, file, palette] of CARDS.filter(([, name]) => !only || name.includes(only))) {
  await page.goto(base + source, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const out = path.join(repoRoot, "site", "img", file);
  await page.screenshot({ path: out });
  if (palette) paletteize(out);
  console.log("share card →", out, `${Math.round(statSync(out).size / 1024)} KB`);
}
await browser.close();
