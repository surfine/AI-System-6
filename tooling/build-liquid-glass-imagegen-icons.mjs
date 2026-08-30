// Build the complete Liquid Glass icon family from individually generated,
// transparent Image Gen masters. The checked-in masters are artwork; this
// script only performs deterministic size hinting, appearance rendering, QA,
// manifest generation, and proof-board assembly.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ICON_IDS, ICON_SPECS } from "./lib/icon-family-inventory.mjs";
import { ICON_GRID, OPTICAL_ALLOWANCE, shapeClass } from "./lib/icon-grid.mjs";
import { assertDocMapMetaphor, measureDocMapMetaphor } from "./lib/docmap-metaphor-metrics.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const masterDir = join(root, "internal/evidence/drafts/liquid-glass-imagegen/alpha");
const proofDir = join(root, "internal/evidence/drafts/liquid-glass-imagegen");
const eraProofDir = join(root, "internal/evidence/drafts/era-icons");
const themeDir = join(root, "apps/desktop/assets/themes/liquid-glass");
const assetDir = join(themeDir, "icons");
const ledgerFile = join(assetDir, "src/liquid-glass-imagegen-prompts.json");
const continuity = JSON.parse(readFileSync(join(root, "apps/desktop/assets/themes/icon-system-continuity.json"), "utf8"));
const priorityCore16 = new Set(continuity.priorityCore16);
const sizes = [128, 64, 32, 16];
const appearances = ["default", "dark", "clear"];
const LIQUID_FINDER_ALLOWANCE = Object.freeze({ finderApp: 1.16, multiFinderApp: 1.16 });

mkdirSync(assetDir, { recursive: true });
mkdirSync(proofDir, { recursive: true });
mkdirSync(eraProofDir, { recursive: true });

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function contentBox(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let visible = 0;
  let translucent = 0;
  for (let offset = 3; offset < data.length; offset += 4) {
    const alpha = data[offset];
    if (alpha < 6) continue;
    const pixel = (offset - 3) / 4;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    visible += 1;
    if (alpha < 247) translucent += 1;
  }
  if (maxX < minX || maxY < minY) throw new Error("master has no visible pixels");
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, visible, translucent };
}

function applyAppearance(imageData, appearance, size) {
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    let red = data[index];
    let green = data[index + 1];
    let blue = data[index + 2];
    let alpha = data[index + 3];
    if (!alpha) continue;

    if (appearance === "dark") {
      red = (red - 128) * 1.08 + 111;
      green = (green - 128) * 1.08 + 114;
      blue = (blue - 128) * 1.1 + 122;
    } else if (appearance === "clear") {
      const luminance = red * 0.24 + green * 0.67 + blue * 0.09;
      red = luminance + (red - luminance) * 0.42 + 13;
      green = luminance + (green - luminance) * 0.42 + 15;
      blue = luminance + (blue - luminance) * 0.48 + 19;
      alpha *= 0.8;
    }

    // Small derivatives get a deterministic contrast pass after resampling.
    // They are not separately authored unless the object ledger says so, but
    // the contextual runtime does consume the 16/32 Default tiers directly.
    if (size <= 32) {
      const contrast = size === 16 ? 1.16 : 1.08;
      red = (red - 128) * contrast + 128;
      green = (green - 128) * contrast + 128;
      blue = (blue - 128) * contrast + 128;
      if (size === 16 && alpha < 9) alpha = 0;
    }

    data[index] = clamp(red);
    data[index + 1] = clamp(green);
    data[index + 2] = clamp(blue);
    data[index + 3] = clamp(alpha);
  }
  return imageData;
}

function renderSize(id, image, box, size, appearance) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const aspect = box.width / box.height;
  const gridShape = shapeClass(box);
  const baseTarget = ICON_GRID["liquid-glass"][gridShape]
    * (OPTICAL_ALLOWANCE[id] || 1)
    * (LIQUID_FINDER_ALLOWANCE[id] || 1);
  const smallHint = size === 16 ? 1.04 : size === 32 ? 1.02 : 1;
  const liveDimension = Math.min(size - 2, baseTarget / ICON_GRID["liquid-glass"].canvas * size * smallHint);
  let width;
  let height;
  if (aspect >= 1) {
    width = liveDimension;
    height = width / aspect;
  } else {
    height = liveDimension;
    width = height * aspect;
  }
  // Very wide strip-shaped objects need a minimum vertical hint at menu size.
  if (size <= 32 && aspect > 2.4 && height < size * 0.32) height = size * 0.32;
  const x = (size - width) / 2;
  const y = (size - height) / 2;
  ctx.drawImage(image, box.x, box.y, box.width, box.height, x, y, width, height);
  const adjusted = applyAppearance(ctx.getImageData(0, 0, size, size), appearance, size);
  ctx.clearRect(0, 0, size, size);
  ctx.putImageData(adjusted, 0, 0);
  return canvas;
}

function metricsFor(canvas, buffer) {
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let pixels = 0;
  let translucent = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 3; offset < data.length; offset += 4) {
    const alpha = data[offset];
    if (alpha < 6) continue;
    pixels += 1;
    if (alpha < 247) translucent += 1;
    const pixel = (offset - 3) / 4;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const ink = { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return {
    sha256: sha256(buffer),
    pixels,
    translucent,
    bounds: [minX, minY, maxX, maxY],
    ink,
    gridShape: shapeClass(ink),
  };
}

function checkerboard(ctx, x, y, width, height, tile = 8) {
  for (let row = 0; row < Math.ceil(height / tile); row += 1) {
    for (let column = 0; column < Math.ceil(width / tile); column += 1) {
      ctx.fillStyle = (row + column) % 2 ? "#dfe3e8" : "#f7f8fa";
      ctx.fillRect(x + column * tile, y + row * tile, Math.min(tile, width - column * tile), Math.min(tile, height - row * tile));
    }
  }
}

async function buildMasterBoard(images) {
  const columns = 7;
  const cellWidth = 174;
  const cellHeight = 164;
  const header = 72;
  const rows = Math.ceil(ICON_IDS.length / columns);
  const canvas = createCanvas(columns * cellWidth, header + rows * cellHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eef1f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#172033";
  ctx.font = "bold 23px sans-serif";
  ctx.fillText("Liquid Glass — 56 Image Gen masters", 20, 31);
  ctx.fillStyle = "#556070";
  ctx.font = "13px sans-serif";
  ctx.fillText("Transparent-edge review • each cell is an independent generation", 20, 53);
  for (let index = 0; index < ICON_IDS.length; index += 1) {
    const id = ICON_IDS[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = header + row * cellHeight;
    checkerboard(ctx, x + 17, y + 8, 140, 126, 10);
    const image = images.get(id);
    const box = contentBox(image);
    const aspect = box.width / box.height;
    let width = 112;
    let height = width / aspect;
    if (height > 112) {
      height = 112;
      width = height * aspect;
    }
    ctx.drawImage(image, box.x, box.y, box.width, box.height, x + 87 - width / 2, y + 71 - height / 2, width, height);
    ctx.fillStyle = "#253047";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(id, x + cellWidth / 2, y + 153);
  }
  ctx.textAlign = "left";
  writeFileSync(join(proofDir, "liquid-glass-imagegen-master-board.png"), canvas.toBuffer("image/png"));
}

async function buildAppearanceBoard() {
  const columns = 7;
  const cellWidth = 174;
  const cellHeight = 116;
  const header = 72;
  const rows = Math.ceil(ICON_IDS.length / columns);
  const canvas = createCanvas(columns * cellWidth, header + rows * cellHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e9edf2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#172033";
  ctx.font = "bold 23px sans-serif";
  ctx.fillText("Liquid Glass — Default / Dark / Clear", 20, 31);
  ctx.fillStyle = "#556070";
  ctx.font = "13px sans-serif";
  ctx.fillText("Independent appearance assets at runtime size", 20, 53);
  for (let index = 0; index < ICON_IDS.length; index += 1) {
    const id = ICON_IDS[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = header + row * cellHeight;
    const backgrounds = ["#f6f7f9", "#151a22", "#d8e5ed"];
    for (let appearanceIndex = 0; appearanceIndex < appearances.length; appearanceIndex += 1) {
      const image = await loadImage(join(assetDir, `${id}-32-${appearances[appearanceIndex]}.png`));
      const bx = x + 15 + appearanceIndex * 49;
      ctx.fillStyle = backgrounds[appearanceIndex];
      ctx.fillRect(bx, y + 8, 44, 62);
      ctx.drawImage(image, bx + 6, y + 19, 32, 32);
    }
    ctx.fillStyle = "#253047";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(id, x + cellWidth / 2, y + 94);
  }
  ctx.textAlign = "left";
  const buffer = canvas.toBuffer("image/png");
  writeFileSync(join(proofDir, "liquid-glass-imagegen-appearance-board.png"), buffer);
  writeFileSync(join(eraProofDir, "liquid-glass-family-appearance-board.png"), buffer);
}

async function buildSmallSizeBoard() {
  const columns = 7;
  const cellWidth = 174;
  const cellHeight = 102;
  const header = 72;
  const rows = Math.ceil(ICON_IDS.length / columns);
  const canvas = createCanvas(columns * cellWidth, header + rows * cellHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e9edf2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#172033";
  ctx.font = "bold 23px sans-serif";
  ctx.fillText("Liquid Glass — 32 / 16 px review derivatives", 20, 31);
  ctx.fillStyle = "#556070";
  ctx.font = "13px sans-serif";
  ctx.fillText("Mechanically reduced from 128 px; displayed at true size without enlargement", 20, 53);
  for (let index = 0; index < ICON_IDS.length; index += 1) {
    const id = ICON_IDS[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = header + row * cellHeight;
    ctx.fillStyle = "#f8f9fb";
    ctx.fillRect(x + 41, y + 8, 44, 52);
    ctx.fillStyle = "#161b24";
    ctx.fillRect(x + 92, y + 8, 32, 52);
    const large = await loadImage(join(assetDir, `${id}-32-default.png`));
    const small = await loadImage(join(assetDir, `${id}-16-default.png`));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(large, x + 47, y + 18, 32, 32);
    ctx.drawImage(small, x + 100, y + 26, 16, 16);
    ctx.fillStyle = "#253047";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(id, x + cellWidth / 2, y + 82);
  }
  ctx.textAlign = "left";
  writeFileSync(join(proofDir, "liquid-glass-imagegen-small-size-board.png"), canvas.toBuffer("image/png"));
}

if (!existsSync(ledgerFile)) throw new Error(`Missing Image Gen prompt ledger: ${ledgerFile}`);
const ledger = JSON.parse(readFileSync(ledgerFile, "utf8"));
if (JSON.stringify(ledger.icons.map(({ id }) => id)) !== JSON.stringify(ICON_IDS)) {
  throw new Error("Image Gen prompt ledger must follow the canonical 56-icon order");
}

const images = new Map();
for (const id of ICON_IDS) {
  const file = join(masterDir, `${id}.png`);
  if (!existsSync(file)) throw new Error(`Missing transparent Image Gen master: ${file}`);
  const image = await loadImage(file);
  const box = contentBox(image);
  if (box.visible < image.width * image.height * 0.025) throw new Error(`${id}: master coverage is too small`);
  if (box.visible >= image.width * image.height * 0.975) throw new Error(`${id}: master lost its transparent isolation`);
  images.set(id, image);
}

const family = {
  schemaVersion: 2,
  target: "macOS 27 Golden Gate Beta 1 Liquid Glass",
  generatedBy: "tooling/build-liquid-glass-imagegen-icons.mjs",
  generationMode: "built-in Image Gen — one independent call per icon",
  promptLedger: "icons/src/liquid-glass-imagegen-prompts.json",
  referenceBoard: "internal/evidence/drafts/liquid-glass-imagegen/liquid-glass-imagegen-master-board.png",
  sharedGeometryAcrossEras: false,
  completeFamily: true,
  runtimeAsset: true,
  completeFamilyMeaning: "All 56 runtime ids resolve to technically accepted artwork. Historical review is a separate per-icon state.",
  generatedAcceptanceMeaning: "Authoring acceptance confirms source and technical quality; it never implies historical validation.",
  runtimeSize: "contextual",
  runtimeSizesByContext: { compactMenuList: 16, ordinary: 32, desktopLargeRetina: 128 },
  compatibilityManifest: "liquid-glass-icon-manifest.json",
  compatibilityManifestMeaning: "Stable 128-default semantic mapping only; app/core/system-icons.js selects 16, 32, or 128 px Default art by rendering context.",
  runtimeDispatch: "apps/desktop/app/core/system-icons.js",
  sizePolicy: "The runtime selects 16, 32, or 128 px Default assets by context. The broad family's tiers and Dark/Clear appearances remain deterministic derivatives unless an object ledger explicitly records direct optical construction.",
  reviewedFamily: [...ICON_IDS],
  fallback: [],
  icons: {},
};
const runtimeManifest = {};

for (const spec of ICON_SPECS) {
  const id = spec.id;
  const image = images.get(id);
  const box = contentBox(image);
  const masterBuffer = readFileSync(join(masterDir, `${id}.png`));
  const entry = {
    genre: spec.genre,
    physicalMetaphor: spec.body,
    semanticMark: spec.symbol,
    tone: spec.tone,
    sourceKind: "imagegen-original-raster",
    reviewStatus: "accepted-imagegen",
    authoringMethod: "image-generation-plus-deterministic-processing",
    generationStatus: "technically-clean",
    provenanceClass: continuity.semanticAnchors?.[id]?.provenanceClassByEra?.["liquid-glass"] || "C",
    historicalReviewStatus: priorityCore16.has(id)
      ? continuity.semanticAnchors?.[id]?.reviewStatusByEra?.["liquid-glass"] || "pending"
      : "pending",
    runtimeAsset: true,
    master: `internal/evidence/drafts/liquid-glass-imagegen/alpha/${id}.png`,
    masterSha256: sha256(masterBuffer),
    grid: {
      canvas: ICON_GRID["liquid-glass"].canvas,
      shape: shapeClass(box),
      fitted: Math.min(
        ICON_GRID["liquid-glass"][shapeClass(box)]
          * (OPTICAL_ALLOWANCE[id] || 1)
          * (LIQUID_FINDER_ALLOWANCE[id] || 1)
          / ICON_GRID["liquid-glass"].canvas,
        (ICON_GRID["liquid-glass"].canvas - 2) / ICON_GRID["liquid-glass"].canvas,
      ),
    },
    sizes: {},
    appearanceSizes: {},
    metrics: {},
  };
  if (id === "finderApp") {
    entry.metaphorKey = "target-era-finder-identity";
    entry.physicalMetaphor = "Golden Gate Beta 1 Finder with a light outer enclosure and an inset blue right face/profile panel";
    entry.blindMixStatus = "not-run";
  } else if (id === "multiFinderApp") {
    entry.metaphorKey = "current-finder-identity-plus-multiplicity";
    entry.physicalMetaphor = "Golden Gate Beta 1 Finder paired with an inverse-field companion using identical inset-panel ratios";
    entry.blindMixStatus = "not-run";
  }
  for (const size of sizes) {
    for (const appearance of appearances) {
      const file = `${id}-${size}-${appearance}.png`;
      const canvas = renderSize(id, image, box, size, appearance);
      const buffer = canvas.toBuffer("image/png");
      writeFileSync(join(assetDir, file), buffer);
      entry.appearanceSizes[`${size}-${appearance}`] = `icons/${file}`;
      entry.metrics[`${size}-${appearance}`] = metricsFor(canvas, buffer);
      if (appearance === "default") entry.sizes[size] = `icons/${file}`;
    }
  }
  runtimeManifest[id] = `icons/${id}-128-default.png`;
  family.icons[id] = entry;
}
family.icons.docMap.metaphorKey = "branching-document-map";
family.icons.docMap.physicalMetaphor = "one translucent document page whose heading lines grow into a stem and three right-side branches";
family.icons.docMap.metaphorMetrics = await measureDocMapMetaphor(join(assetDir, "docMap-128-default.png"), "liquid-glass");
assertDocMapMetaphor(family.icons.docMap.metaphorMetrics, "liquid-glass/docMap");

writeFileSync(join(assetDir, "liquid-glass-imagegen-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "liquid-glass-imagegen-icon-manifest.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
writeFileSync(join(themeDir, "liquid-glass-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(themeDir, "liquid-glass-icon-manifest.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
await buildMasterBoard(images);
await buildAppearanceBoard();
await buildSmallSizeBoard();

console.log(`liquid-glass: ${ICON_IDS.length} Image Gen masters, ${sizes.length} sizes, ${appearances.length} appearances`);
