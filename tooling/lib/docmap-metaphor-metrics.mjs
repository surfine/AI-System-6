import { createCanvas, loadImage } from "canvas";

const ERA_RULES = Object.freeze({
  classic: { pageMode: "opaque", pageAdvantageMin: 0.24, nodeMode: "opaque" },
  platinum: { pageMode: "paper", pageAdvantageMin: 0.2, nodeMode: "blue" },
  aqua: { pageMode: "paper", pageAdvantageMin: 0.02, nodeMode: "opaque" },
  "snow-leopard": { pageMode: "opaque", pageAdvantageMin: 0.02, nodeMode: "opaque" },
  yosemite: { pageMode: "opaque", pageAdvantageMin: 0.2, nodeMode: "opaque" },
  "liquid-glass": { pageMode: "paper", pageAdvantageMin: 0.2, nodeMode: "blue" },
});

function density(points, x0, x1, y0, y1) {
  const width = Math.max(1, x1 - x0 + 1);
  const height = Math.max(1, y1 - y0 + 1);
  let pixels = 0;
  for (const [x, y] of points) {
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) pixels += 1;
  }
  return pixels / (width * height);
}

function rounded(value) {
  return Number(value.toFixed(4));
}

function classify(mode, red, green, blue, alpha) {
  if (alpha < 48) return false;
  if (mode === "opaque") return true;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  if (mode === "paper") return luminance > 175 && chroma < 95;
  if (mode === "blue") return blue - red > 20 && blue - green > 5 && blue > 90;
  return false;
}

export async function measureDocMapMetaphor(path, era) {
  const rule = ERA_RULES[era];
  if (!rule) throw new Error(`Unknown DocMap era: ${era}`);
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const opaque = [];
  const page = [];
  const nodes = [];
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      if (alpha < 48) continue;
      opaque.push([x, y]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (classify(rule.pageMode, red, green, blue, alpha)) page.push([x, y]);
      if (classify(rule.nodeMode, red, green, blue, alpha)) nodes.push([x, y]);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error(`${path}: DocMap artwork is empty`);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const xAt = (ratio) => Math.round(minX + width * ratio);
  const yAt = (ratio) => Math.round(minY + height * ratio);
  const pageLeftDensity = density(page, xAt(0.05), xAt(0.55), yAt(0.08), yAt(0.92));
  const pageRightDensity = density(page, xAt(0.65), xAt(0.98), yAt(0.08), yAt(0.92));
  const nodeBands = [[0.1, 0.32], [0.39, 0.61], [0.68, 0.9]].map(([top, bottom]) =>
    density(nodes, xAt(0.72), xAt(0.98), yAt(top), yAt(bottom)));
  const nodeGaps = [[0.33, 0.38], [0.62, 0.67]].map(([top, bottom]) =>
    density(nodes, xAt(0.82), xAt(0.98), yAt(top), yAt(bottom)));
  const radialNodeDensities = [
    [0.04, 0.36, 0.04, 0.36],
    [0.64, 0.96, 0.04, 0.36],
    [0.04, 0.36, 0.64, 0.96],
    [0.64, 0.96, 0.64, 0.96],
  ].map(([left, right, top, bottom]) =>
    density(opaque, xAt(left), xAt(right), yAt(top), yAt(bottom)));
  const radialBranchDensities = [
    [0.25, 0.5, 0.25, 0.5],
    [0.5, 0.75, 0.25, 0.5],
    [0.25, 0.5, 0.5, 0.75],
    [0.5, 0.75, 0.5, 0.75],
  ].map(([left, right, top, bottom]) =>
    density(opaque, xAt(left), xAt(right), yAt(top), yAt(bottom)));
  const centerHubDensity = density(opaque, xAt(0.36), xAt(0.64), yAt(0.36), yAt(0.64));
  const pageAdvantage = pageLeftDensity - pageRightDensity;
  const radialMindMap = centerHubDensity >= 0.12
    && radialNodeDensities.filter((value) => value >= 0.04).length >= 3
    && radialBranchDensities.filter((value) => value >= 0.03).length >= 3;
  return {
    version: 2,
    sourceSize: [canvas.width, canvas.height],
    bounds: [minX, minY, maxX, maxY],
    pageMode: rule.pageMode,
    pageLeftDensity: rounded(pageLeftDensity),
    pageRightDensity: rounded(pageRightDensity),
    pageAdvantage: rounded(pageAdvantage),
    pageAdvantageMin: rule.pageAdvantageMin,
    nodeMode: rule.nodeMode,
    nodeBandDensities: nodeBands.map(rounded),
    nodeGapDensities: nodeGaps.map(rounded),
    centerHubDensity: rounded(centerHubDensity),
    radialNodeDensities: radialNodeDensities.map(rounded),
    radialBranchDensities: radialBranchDensities.map(rounded),
    layoutMode: radialMindMap ? "radial-mind-map" : "document-tree",
  };
}

export function assertDocMapMetaphor(metrics, label = "DocMap") {
  const radialMindMap = metrics.layoutMode === "radial-mind-map"
    && metrics.centerHubDensity >= 0.12
    && metrics.radialNodeDensities.filter((value) => value >= 0.04).length >= 3
    && metrics.radialBranchDensities.filter((value) => value >= 0.03).length >= 3;
  if (!radialMindMap && metrics.pageAdvantage < metrics.pageAdvantageMin) {
    throw new Error(`${label}: page mass does not dominate the right side (${metrics.pageAdvantage} < ${metrics.pageAdvantageMin})`);
  }
  if (!radialMindMap && metrics.nodeBandDensities.some((densityValue) => densityValue < 0.04)) {
    throw new Error(`${label}: expected three visible right-side node bands (${metrics.nodeBandDensities.join(", ")})`);
  }
  return true;
}
