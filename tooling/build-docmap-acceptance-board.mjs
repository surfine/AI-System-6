#!/usr/bin/env node

// Focused evidence board for the branching-document-map acceptance contract.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createCanvas, loadImage } from "canvas";

const root = resolve(import.meta.dirname, "..");
const desktopRoot = join(root, "apps", "desktop");
const outputDir = join(root, "internal/evidence/drafts/era-icons");
const labelIndex = process.argv.indexOf("--label");
const label = labelIndex >= 0 ? String(process.argv[labelIndex + 1] || "after") : "after";
const eras = [
  ["System 6", "assets/themes/classic/icons/docMap-32.svg", 32],
  ["Platinum", "assets/themes/platinum/icons/docMap-32.png", 32],
  ["Aqua", "assets/themes/aqua/icons/docMap-128.png", 128],
  ["Snow Leopard", "assets/themes/snow-leopard/icons/docMap-128.png", 128],
  ["Yosemite", "assets/themes/yosemite/icons/docMap-128.png", 128],
  ["Liquid Glass", "assets/themes/liquid-glass/icons/docMap-128-default.png", 128],
];

mkdirSync(outputDir, { recursive: true });
const canvas = createCanvas(6 * 170, 260);
const context = canvas.getContext("2d");
context.fillStyle = "#eef1f5";
context.fillRect(0, 0, canvas.width, canvas.height);
context.fillStyle = "#1d2632";
context.font = "bold 21px sans-serif";
context.fillText(`DocMap acceptance · ${label}`, 18, 30);
context.fillStyle = "#5b6572";
context.font = "12px sans-serif";
context.fillText("One page whose headings grow into a stem and three separated right-side branches", 18, 50);

for (let index = 0; index < eras.length; index += 1) {
  const [name, relativePath, nativeSize] = eras[index];
  const x = index * 170;
  context.fillStyle = index % 2 ? "#f8fafc" : "#ffffff";
  context.fillRect(x + 2, 62, 166, 196);
  const image = await loadImage(join(desktopRoot, relativePath));
  context.imageSmoothingEnabled = nativeSize > 32;
  context.drawImage(image, x + 27, 76, 116, 116);
  context.fillStyle = "#26313e";
  context.font = "bold 12px sans-serif";
  context.textAlign = "center";
  context.fillText(name, x + 85, 212);
  context.fillStyle = "#6a7480";
  context.font = "10px sans-serif";
  context.fillText(`${nativeSize}px source`, x + 85, 228);
}

const liquid16 = await loadImage(join(desktopRoot, "assets/themes/liquid-glass/icons/docMap-16-default.png"));
context.imageSmoothingEnabled = false;
context.drawImage(liquid16, canvas.width - 43, 232, 16, 16);
context.fillStyle = "#6a7480";
context.font = "9px sans-serif";
context.textAlign = "right";
context.fillText("Liquid true 16px", canvas.width - 48, 244);
context.textAlign = "left";

const output = join(outputDir, `docmap-acceptance-${label}.png`);
writeFileSync(output, canvas.toBuffer("image/png"));
console.log(output.slice(root.length + 1));
