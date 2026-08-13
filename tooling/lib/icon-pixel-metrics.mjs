import { createCanvas } from "canvas";

export const ICON_PIXEL_BUDGETS = Object.freeze({
  keyHueFringe128: 40,
  derived16: Object.freeze({
    minCoverage: 0.22,
    minMeanLum: 80,
    maxMeanLum: 240,
    minEdgeEnergy: 8,
    brightMeanLum: 225,
    minBrightLumStd: 20,
  }),
});

// The Classic and Platinum Image Gen redraws were keyed out of a chroma-green
// background, and the Platinum quantization palette owns a real period green
// at the same coordinates (the drive LED, the terminal screen). Leftover edge
// samples therefore land on a legitimate palette colour and cannot be found by
// hue alone. What separates them is position: authored green sits inside the
// subject, extraction spill always borders the alpha edge.
export const KEY_SPILL_GREEN = Object.freeze([54, 168, 94]);

export function keyGreenSpillPixels(data, width, height) {
  const isKeyGreen = (offset) => data[offset + 3] > 40
    && Math.abs(data[offset] - KEY_SPILL_GREEN[0]) <= 6
    && Math.abs(data[offset + 1] - KEY_SPILL_GREEN[1]) <= 3
    && Math.abs(data[offset + 2] - KEY_SPILL_GREEN[2]) <= 3;
  const transparent = (x, y) => x < 0 || y < 0 || x >= width || y >= height
    || data[(y * width + x) * 4 + 3] <= 40;
  const green = new Set();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isKeyGreen((y * width + x) * 4)) green.add(`${x},${y}`);
    }
  }
  const seen = new Set();
  const spill = [];
  for (const key of green) {
    if (seen.has(key)) continue;
    const run = [];
    const queue = [key];
    seen.add(key);
    let bordersAlphaEdge = false;
    while (queue.length) {
      const [x, y] = queue.pop().split(",").map(Number);
      run.push([x, y]);
      if (transparent(x - 1, y) || transparent(x + 1, y) || transparent(x, y - 1) || transparent(x, y + 1)) {
        bordersAlphaEdge = true;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = `${x + dx},${y + dy}`;
        if (green.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    if (bordersAlphaEdge) spill.push(...run);
  }
  return spill;
}

export function keyHueFringePixels(ctx, size) {
  const data = ctx.getImageData(0, 0, size, size).data;
  let pixels = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];
    // The removal key is #ff00ff, so real spill keeps red and blue close even
    // after interpolation. Requiring that symmetry prevents deliberate Aqua
    // blue-violet material from being mislabeled as a keyed background fringe.
    if (alpha > 30
      && red > 90
      && blue > 90
      && Math.abs(red - blue) <= 24
      && green < Math.min(red, blue) - 60) pixels += 1;
  }
  return pixels;
}

export function visibleMagentaPixels(ctx, size) {
  const data = ctx.getImageData(0, 0, size, size).data;
  let pixels = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] >= 100
      && data[offset] - data[offset + 1] > 26
      && data[offset + 2] - data[offset + 1] > 26) pixels += 1;
  }
  return pixels;
}

export function derivedLegibility(ctx, sourceSize, displaySize = 16) {
  const canvas = createCanvas(displaySize, displaySize);
  const output = canvas.getContext("2d");
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = "high";
  output.drawImage(ctx.canvas, 0, 0, sourceSize, sourceSize, 0, 0, displaySize, displaySize);
  const data = output.getImageData(0, 0, displaySize, displaySize).data;
  const luminance = new Float64Array(displaySize * displaySize);
  const opaque = new Uint8Array(displaySize * displaySize);
  let pixels = 0;
  let sum = 0;
  let sumSquares = 0;
  let edgeEnergy = 0;
  for (let pixel = 0; pixel < opaque.length; pixel += 1) {
    const offset = pixel * 4;
    if (data[offset + 3] <= 30) continue;
    const value = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    opaque[pixel] = 1;
    luminance[pixel] = value;
    pixels += 1;
    sum += value;
    sumSquares += value * value;
  }
  for (let y = 0; y < displaySize; y += 1) {
    for (let x = 0; x < displaySize; x += 1) {
      const pixel = y * displaySize + x;
      if (!opaque[pixel]) continue;
      if (x + 1 < displaySize && opaque[pixel + 1] && Math.abs(luminance[pixel] - luminance[pixel + 1]) > 28) edgeEnergy += 1;
      if (y + 1 < displaySize && opaque[pixel + displaySize] && Math.abs(luminance[pixel] - luminance[pixel + displaySize]) > 28) edgeEnergy += 1;
    }
  }
  const meanLum = pixels ? sum / pixels : 0;
  return {
    displaySize,
    coverage: Number((pixels / (displaySize * displaySize)).toFixed(4)),
    meanLum: Number(meanLum.toFixed(2)),
    lumStd: pixels ? Number(Math.sqrt(sumSquares / pixels - meanLum * meanLum).toFixed(2)) : 0,
    edgeEnergy,
  };
}

export function runtimePixelMetrics(ctx, sourceSize) {
  return {
    sourceSize,
    keyHueFringe128: sourceSize === 128 ? keyHueFringePixels(ctx, sourceSize) : null,
    derived16: derivedLegibility(ctx, sourceSize, 16),
    derived32: derivedLegibility(ctx, sourceSize, 32),
    derived42: derivedLegibility(ctx, sourceSize, 42),
  };
}

export function pixelQualityFailures(metrics, budgets = ICON_PIXEL_BUDGETS) {
  const failures = [];
  if (metrics.keyHueFringe128 > budgets.keyHueFringe128) failures.push("key-hue-fringe");
  const derived = metrics.derived16;
  if (derived.coverage < budgets.derived16.minCoverage) failures.push("derived16-coverage");
  if (derived.meanLum < budgets.derived16.minMeanLum || derived.meanLum > budgets.derived16.maxMeanLum) failures.push("derived16-mean-luminance");
  if (derived.edgeEnergy < budgets.derived16.minEdgeEnergy) failures.push("derived16-edge-energy");
  if (derived.meanLum > budgets.derived16.brightMeanLum && derived.lumStd < budgets.derived16.minBrightLumStd) failures.push("derived16-bright-contrast");
  return failures;
}
