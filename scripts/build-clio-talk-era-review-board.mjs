#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "drafts/clio-talk-era-redraw");

const eras = [
  {
    id: "classic",
    label: "Classic · System 6",
    note: "1-bit artwork + mask · period approximation",
    large: "assets/themes/classic/icons/assistant-32.svg",
    small: "assets/themes/classic/icons/assistant-16.svg",
    pixelated: true,
  },
  {
    id: "platinum",
    label: "Platinum · Mac OS 9",
    note: "compact gray/lavender pixel material",
    large: "assets/themes/platinum/icons/assistant-32.png",
    small: "assets/themes/platinum/icons/assistant-16.png",
    pixelated: true,
  },
  {
    id: "aqua",
    label: "Aqua · Mac OS X 10.2",
    note: "candy blue gloss + broad highlight",
    large: "assets/themes/aqua/icons/assistant-128.png",
    regular: "assets/themes/aqua/icons/assistant-32.png",
    small: "assets/themes/aqua/icons/assistant-16.png",
  },
  {
    id: "snow-leopard",
    label: "Snow Leopard · Mac OS X 10.6",
    note: "restrained resin + frosted reply",
    large: "assets/themes/snow-leopard/icons/assistant-128.png",
    regular: "assets/themes/snow-leopard/icons/assistant-32.png",
    small: "assets/themes/snow-leopard/icons/assistant-16.png",
  },
  {
    id: "yosemite",
    label: "Yosemite · OS X 10.10",
    note: "flat cyan object + minimal overlap",
    large: "assets/themes/yosemite/icons/assistant-128.png",
    regular: "assets/themes/yosemite/icons/assistant-32.png",
    small: "assets/themes/yosemite/icons/assistant-16.png",
  },
  {
    id: "liquid-glass",
    label: "Liquid Glass · macOS 26",
    note: "blue glass tile · Default / Dark / Clear",
    large: "assets/themes/liquid-glass/icons/assistant-128-default.png",
    regular: "assets/themes/liquid-glass/icons/assistant-32-default.png",
    small: "assets/themes/liquid-glass/icons/assistant-16-default.png",
    appearances: ["default", "dark", "clear"],
  },
];

const width = 1320;
const rowHeight = 220;
const header = 104;
const canvas = createCanvas(width, header + eras.length * rowHeight + 34);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#dfe4ea";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#182238";
ctx.font = "bold 28px sans-serif";
ctx.fillText("ClioTalk · six independent era redraws", 30, 42);
ctx.fillStyle = "#536176";
ctx.font = "15px sans-serif";
ctx.fillText("One semantic object: solid user balloon + clearly dashed provisional reply balloon", 30, 70);

function checker(x, y, width, height, cell = 12) {
  for (let ty = 0; ty < height; ty += cell) {
    for (let tx = 0; tx < width; tx += cell) {
      ctx.fillStyle = ((tx / cell + ty / cell) % 2) ? "#f8f9fb" : "#cbd2da";
      ctx.fillRect(x + tx, y + ty, Math.min(cell, width - tx), Math.min(cell, height - ty));
    }
  }
}

for (let index = 0; index < eras.length; index += 1) {
  const era = eras[index];
  const y = header + index * rowHeight;
  ctx.fillStyle = index % 2 ? "#f4f6f8" : "#ffffff";
  ctx.fillRect(18, y, width - 36, rowHeight - 10);
  ctx.fillStyle = "#1f2a3f";
  ctx.font = "bold 19px sans-serif";
  ctx.fillText(era.label, 42, y + 42);
  ctx.fillStyle = "#667286";
  ctx.font = "13px sans-serif";
  ctx.fillText(era.note, 42, y + 67);
  ctx.fillStyle = "#35557d";
  ctx.font = "12px sans-serif";
  ctx.fillText("solid user", 42, y + 116);
  ctx.fillText("dashed provisional reply", 42, y + 140);

  checker(360, y + 18, 176, 176);
  const large = await loadImage(join(root, era.large));
  ctx.imageSmoothingEnabled = !era.pixelated;
  ctx.drawImage(large, 384, y + 42, 128, 128);

  ctx.fillStyle = "#edf1f5";
  ctx.fillRect(590, y + 46, 96, 96);
  const regular = await loadImage(join(root, era.regular || era.large));
  ctx.imageSmoothingEnabled = !era.pixelated;
  ctx.drawImage(regular, 606, y + 62, 64, 64);
  ctx.fillStyle = "#172033";
  ctx.fillRect(722, y + 62, 64, 64);
  const small = await loadImage(join(root, era.small));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 738, y + 78, 32, 32);
  ctx.fillStyle = "#59677a";
  ctx.font = "12px sans-serif";
  ctx.fillText("32 px", 612, y + 166);
  ctx.fillText("16 px", 732, y + 166);

  if (era.appearances) {
    const backgrounds = ["#f1f4f8", "#131923", "#d5e5ee"];
    for (let appearanceIndex = 0; appearanceIndex < era.appearances.length; appearanceIndex += 1) {
      const appearance = era.appearances[appearanceIndex];
      const x = 850 + appearanceIndex * 128;
      ctx.fillStyle = backgrounds[appearanceIndex];
      ctx.fillRect(x, y + 48, 96, 96);
      const image = await loadImage(join(root, `assets/themes/liquid-glass/icons/assistant-64-${appearance}.png`));
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, x + 16, y + 64, 64, 64);
      ctx.fillStyle = "#59677a";
      ctx.font = "11px sans-serif";
      ctx.fillText(appearance, x + 22, y + 164);
    }
  }
}

mkdirSync(outDir, { recursive: true });
const out = join(outDir, "clio-talk-six-era-review-board.png");
writeFileSync(out, canvas.toBuffer("image/png", { compressionLevel: 9 }));
console.log(out);
