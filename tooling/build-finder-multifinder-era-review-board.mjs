#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "internal/evidence/drafts/finder-multifinder-era-redraw");
const output = join(outputDir, "finder-multifinder-six-era-review-board.png");

const eras = [
  { id: "classic", label: "Classic", theme: "#ffffff", ink: "#111111", large: 32, pixelated: false, extension: "svg" },
  { id: "platinum", label: "Platinum", theme: "#d9d9d9", ink: "#24242b", large: 32, pixelated: true, extension: "png" },
  { id: "aqua", label: "Aqua", theme: "#e8f0f5", ink: "#233746", large: 128, extension: "png" },
  { id: "snow-leopard", label: "Snow Leopard", theme: "#eceef0", ink: "#2d3034", large: 128, extension: "png" },
  { id: "yosemite", label: "Yosemite", theme: "#f2f4f6", ink: "#2c3339", large: 128, extension: "png" },
  { id: "liquid-glass", label: "Liquid Glass", theme: "#163e6e", ink: "#f4f9ff", large: 128, extension: "png", appearances: true },
];
const objects = [
  { id: "finderApp", label: "Finder · one friendly system identity" },
  { id: "multiFinderApp", label: "MultiFinder · exactly two overlapping identities" },
];

const cellWidth = 196;
const rowHeight = 238;
const headerHeight = 74;
const footerHeight = 44;
const canvas = createCanvas(cellWidth * eras.length, headerHeight + rowHeight * objects.length + footerHeight);
const context = canvas.getContext("2d");
context.fillStyle = "#c9cdd1";
context.fillRect(0, 0, canvas.width, canvas.height);

context.fillStyle = "#16191d";
context.font = "700 26px sans-serif";
context.fillText("Finder + MultiFinder · six independent era redraws", 18, 32);
context.font = "13px sans-serif";
context.fillStyle = "#41474d";
context.fillText("Liquid Glass semantics held constant; material, perspective, pixels, and optical hints rebuilt per era", 18, 55);

function iconPath(era, objectId, size, appearance = "default") {
  const base = join(root, "apps/desktop/assets/themes", era.id);
  if (era.id === "classic") return join(base, "icons", `${objectId}-${size}.svg`);
  if (era.id === "liquid-glass") return join(base, "icons", `${objectId}-${size}-${appearance}.png`);
  return join(base, "icons", `${objectId}-${size}.${era.extension}`);
}

async function drawIcon(path, x, y, size, pixelated = false) {
  if (!existsSync(path)) throw new Error(`Missing review-board icon: ${path}`);
  const image = path.endsWith(".svg")
    ? await loadImage(Buffer.from(readFileSync(path, "utf8")
      .replace(/width="[^"]+"/, `width="${size}"`)
      .replace(/height="[^"]+"/, `height="${size}"`)))
    : await loadImage(path);
  context.imageSmoothingEnabled = !pixelated;
  context.imageSmoothingQuality = pixelated ? "low" : "high";
  context.drawImage(image, x, y, size, size);
}

for (const [column, era] of eras.entries()) {
  const x = column * cellWidth;
  context.fillStyle = era.theme;
  context.fillRect(x, headerHeight, cellWidth, rowHeight * objects.length);
  context.fillStyle = era.ink;
  context.font = "700 16px sans-serif";
  context.textAlign = "center";
  context.fillText(era.label, x + cellWidth / 2, headerHeight + 24);
  context.textAlign = "left";

  for (const [row, object] of objects.entries()) {
    const y = headerHeight + row * rowHeight;
    context.strokeStyle = era.id === "liquid-glass" ? "rgba(255,255,255,.18)" : "rgba(35,40,45,.16)";
    context.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, rowHeight - 1);
    context.fillStyle = era.ink;
    context.font = "600 12px sans-serif";
    context.fillText(object.id === "finderApp" ? "Finder" : "MultiFinder", x + 12, y + 48);

    const largeDisplay = era.large === 32 ? 112 : 124;
    await drawIcon(
      iconPath(era, object.id, era.large),
      x + Math.floor((cellWidth - largeDisplay) / 2),
      y + 58,
      largeDisplay,
      era.pixelated,
    );

    if (era.appearances) {
      for (const [index, appearance] of ["default", "dark", "clear"].entries()) {
        await drawIcon(iconPath(era, object.id, 32, appearance), x + 35 + index * 48, y + 188, 34);
      }
      context.fillStyle = "rgba(244,249,255,.72)";
      context.font = "9px sans-serif";
      context.fillText("default   dark      clear", x + 34, y + 232);
    } else {
      await drawIcon(iconPath(era, object.id, 32), x + 58, y + 184, 48, era.pixelated);
      await drawIcon(iconPath(era, object.id, 16), x + 122, y + 192, 32, era.pixelated);
      context.fillStyle = era.id === "classic" ? "#555" : "rgba(40,46,52,.64)";
      context.font = "9px sans-serif";
      context.fillText("32 px", x + 66, y + 232);
      context.fillText("16 px", x + 124, y + 232);
    }
  }
}

context.fillStyle = "#16191d";
context.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
context.fillStyle = "#e8edf2";
context.font = "12px sans-serif";
context.fillText("Classic Finder remains ICN# 3 evidence-guided; Classic MultiFinder is a documented later-period approximation.", 18, canvas.height - 17);

mkdirSync(outputDir, { recursive: true });
writeFileSync(output, canvas.toBuffer("image/png"));
console.log(output);
