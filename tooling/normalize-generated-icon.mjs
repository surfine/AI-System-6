#!/usr/bin/env node

// Normalize an Image Gen icon master into a centered transparent 1024px PNG.
// Some otherwise approved generations contain a baked light checkerboard;
// --remove-checker removes only the high-luminance neutral field connected to
// the canvas boundary, leaving enclosed white paper and highlights intact.

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const [input, output, option] = process.argv.slice(2);

if (!input || !output) {
  throw new Error("usage: node tooling/normalize-generated-icon.mjs INPUT OUTPUT [--remove-checker]");
}

let pipeline = sharp(input).ensureAlpha();

if (option === "--remove-checker") {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const qualifies = (index) => {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    return low >= 224 && high - low <= 16;
  };
  const enqueue = (index) => {
    if (visited[index] || !qualifies(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    data[index * 4 + 3] = 0;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  pipeline = sharp(data, { raw: info });
}

mkdirSync(dirname(output), { recursive: true });
const trimmed = await pipeline.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp(trimmed)
  .resize(922, 922, { fit: "inside", withoutEnlargement: false })
  .extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`normalized generated icon: ${output}`);
