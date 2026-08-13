#!/usr/bin/env node

// Repair chroma-key spill left by the Image Gen extraction pass.
//
// The Classic and Platinum redraws were generated on a solid chroma-green
// background (see assets/themes/icon-imagegen-run.json). Anti-aliased subject
// edges keep a little of that background, and because the Platinum palette in
// process-imagegen-era-icons.mjs contains a real period green (54,168,94 — the
// drive LED, the terminal screen), the quantizer snaps those leftover edge
// samples to it. The result is scattered mint pixels along a silhouette, and
// they survive all the way to the 16 px runtime icon.
//
// Real green artwork and key spill separate cleanly: every legitimate green
// mass sits inside the subject, while every spill pixel touches transparency.
// So a key-green run that borders the alpha edge is spill and is repainted
// from its own neighbourhood; interior green is never touched.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { KEY_SPILL_GREEN, keyGreenSpillPixels } from "./lib/icon-pixel-metrics.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const TARGETS = [
  "apps/desktop/assets/themes/platinum/icons/imagegen-source",
  "apps/desktop/assets/themes/platinum/icons",
  "apps/desktop/assets/themes/classic/icons/imagegen-source",
];

function isKeyGreen(data, offset) {
  return data[offset + 3] > 40
    && Math.abs(data[offset] - KEY_SPILL_GREEN[0]) <= 6
    && Math.abs(data[offset + 1] - KEY_SPILL_GREEN[1]) <= 3
    && Math.abs(data[offset + 2] - KEY_SPILL_GREEN[2]) <= 3;
}

// Repaint from the most common opaque, non-key-green neighbour so the repair
// keeps the silhouette instead of biting a hole in the outline.
function neighbourColor(data, width, height, x, y) {
  const tally = new Map();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const offset = (ny * width + nx) * 4;
      if (data[offset + 3] <= 40 || isKeyGreen(data, offset)) continue;
      const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`;
      tally.set(key, (tally.get(key) || 0) + 1);
    }
  }
  if (!tally.size) return null;
  const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return best.split(",").map(Number);
}

async function repairFile(path) {
  const image = await loadImage(readFileSync(path));
  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  const spill = keyGreenSpillPixels(imageData.data, width, height);
  if (!spill.length) return 0;
  for (const [x, y] of spill) {
    const offset = (y * width + x) * 4;
    const replacement = neighbourColor(imageData.data, width, height, x, y);
    if (!replacement) {
      imageData.data[offset + 3] = 0;
      continue;
    }
    imageData.data[offset] = replacement[0];
    imageData.data[offset + 1] = replacement[1];
    imageData.data[offset + 2] = replacement[2];
    imageData.data[offset + 3] = replacement[3];
  }
  context.putImageData(imageData, 0, 0);
  if (!check) writeFileSync(path, canvas.toBuffer("image/png"));
  return spill.length;
}

let files = 0;
let pixels = 0;
const offenders = [];
for (const target of TARGETS) {
  const directory = join(root, target);
  if (!existsSync(directory)) continue;
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".png"))) {
    const repaired = await repairFile(join(directory, name));
    if (!repaired) continue;
    files += 1;
    pixels += repaired;
    offenders.push(`${target}/${name} (${repaired})`);
  }
}

if (check) {
  if (files) {
    console.error(`Chroma-key spill found in ${files} file(s):\n  ${offenders.join("\n  ")}`);
    process.exit(1);
  }
  console.log("OK  no chroma-key spill on any accepted Image Gen icon");
} else {
  console.log(files
    ? `repaired ${pixels} spill pixel(s) in ${files} file(s):\n  ${offenders.join("\n  ")}`
    : "no chroma-key spill to repair");
}
