#!/usr/bin/env node

// Apply the accepted complete Platinum Image Gen family after the broad era
// fallback and historical core evidence builders. This preserves the existing
// manifest/CSS compatibility paths while the runtime reads true 42/32/16 PNGs.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ICON_IDS, ICON_SPECS } from "./lib/icon-family-inventory.mjs";
import { assertDocMapMetaphor, measureDocMapMetaphor } from "./lib/docmap-metaphor-metrics.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themeDir = join(root, "apps/desktop/assets/themes/platinum");
const assetDir = join(themeDir, "icons");
const sourceDir = join(assetDir, "imagegen-source");
const familyPath = join(themeDir, "platinum-icon-family.json");
const manifestPath = join(themeDir, "platinum-icon-manifest.json");
const specs = Object.fromEntries(ICON_SPECS.map((spec) => [spec.id, spec]));

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function inspectPng(path, size) {
  const buffer = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error(`${path}: expected PNG bytes`);
  if (buffer.readUInt32BE(16) !== size || buffer.readUInt32BE(20) !== size) {
    throw new Error(`${path}: expected ${size}x${size}`);
  }
  const image = await loadImage(buffer);
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, size, size).data;
  let minX = size; let minY = size; let maxX = -1; let maxY = -1; let pixels = 0;
  const colors = new Set();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (data[offset + 3] < 48) continue;
      pixels += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`);
    }
  }
  if (!pixels) throw new Error(`${path}: empty accepted artwork`);
  return { bbox: { minX, minY, maxX, maxY }, pixels, colors: colors.size, sha256: sha256(buffer), bytes: buffer.length };
}

function compatibilitySvg(iconId, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="icons/${iconId}-${size}.png" width="${size}" height="${size}" style="image-rendering:pixelated"/></svg>\n`;
}

async function buildContactSheet() {
  const columns = 7;
  const cellWidth = 176;
  const cellHeight = 106;
  const headerHeight = 54;
  const rows = Math.ceil(ICON_IDS.length / columns);
  const canvas = createCanvas(columns * cellWidth, headerHeight + rows * cellHeight);
  const context = canvas.getContext("2d");
  context.fillStyle = "#c8c8c8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#151515";
  context.font = "bold 20px sans-serif";
  context.fillText("Platinum Image Gen family · 56 objects", 14, 25);
  context.font = "11px sans-serif";
  context.fillText("Desktop 42 px, regular 32 px, and compact 16 px PNGs · nearest-neighbour review zoom", 14, 43);

  for (let index = 0; index < ICON_IDS.length; index += 1) {
    const id = ICON_IDS[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = headerHeight + row * cellHeight;
    context.fillStyle = index % 2 ? "#eeeeee" : "#f8f8f8";
    context.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
    context.imageSmoothingEnabled = false;
    const desktop = await loadImage(join(assetDir, `${id}-42.png`));
    const regular = await loadImage(join(assetDir, `${id}-32.png`));
    const small = await loadImage(join(assetDir, `${id}-16.png`));
    context.drawImage(desktop, x + 8, y + 5, 84, 84);
    context.drawImage(regular, x + 98, y + 16, 48, 48);
    context.drawImage(small, x + 148, y + 28, 24, 24);
    context.fillStyle = "#171717";
    context.font = "10px sans-serif";
    context.fillText(id, x + 6, y + 101, cellWidth - 12);
    context.fillStyle = "#666";
    context.font = "8px sans-serif";
    context.fillText("42", x + 41, y + 94);
    context.fillText("32", x + 114, y + 70);
    context.fillText("16", x + 153, y + 58);
  }

  writeFileSync(join(root, "internal/evidence/drafts/era-icons/platinum-contact-sheet.png"), canvas.toBuffer("image/png"));
}

if (!existsSync(familyPath) || !existsSync(manifestPath)) {
  throw new Error("Build the broad Platinum family before applying the accepted Image Gen overlay");
}
const family = JSON.parse(readFileSync(familyPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const continuity = JSON.parse(readFileSync(join(root, "apps/desktop/assets/themes/icon-system-continuity.json"), "utf8"));
const priorityCore16 = new Set(continuity.priorityCore16);
const generated = {};

for (const id of ICON_IDS) {
  const sizes = {};
  const metrics = {};
  for (const size of [42, 32, 16]) {
    const source = join(sourceDir, `${id}-${size}.png`);
    if (!existsSync(source)) throw new Error(`Platinum ${id}/${size}: missing accepted Image Gen redraw ${source}`);
    const target = join(assetDir, `${id}-${size}.png`);
    copyFileSync(source, target);
    sizes[size] = `icons/${id}-${size}.png`;
    metrics[size] = await inspectPng(target, size);
    if (size !== 42) {
      const runtime32 = manifest[id];
      if (!runtime32) throw new Error(`Platinum ${id}: missing broad runtime manifest entry`);
      if (!/-32\.svg$/.test(runtime32)) {
        throw new Error(`Platinum ${id}: compatibility manifest must retain a -32.svg path, got ${runtime32}`);
      }
      const runtimeFile = size === 32 ? runtime32 : runtime32.replace(/-32\.svg$/, "-16.svg");
      writeFileSync(join(themeDir, runtimeFile), compatibilitySvg(id, size));
    }
  }
  const spec = specs[id];
  generated[id] = {
    ...(family.icons[id] || {}),
    genre: spec.genre,
    physicalMetaphor: spec.body,
    semanticMark: spec.symbol,
    sourceKind: "accepted-imagegen-period-pixel-redraw",
    reviewStatus: "accepted-imagegen",
    authoringMethod: "image-generation-plus-deterministic-processing",
    generationStatus: "technically-clean",
    provenanceClass: continuity.semanticAnchors?.[id]?.provenanceClassByEra?.platinum || "C",
    historicalReviewStatus: priorityCore16.has(id)
      ? continuity.semanticAnchors?.[id]?.reviewStatusByEra?.platinum || "pending"
      : "pending",
    runtimeAsset: true,
    sourceNote: "Built-in Image Gen redraw grounded in real Mac OS 8/9 references and Aqua/Snow Leopard/Yosemite continuity, reviewed at desktop 42 px plus native 32/16 px.",
    sizes,
    metrics,
  };
}
generated.docMap.metaphorKey = "branching-document-map";
generated.docMap.physicalMetaphor = "one Platinum document page whose heading lines grow into a stem and three right-side nodes";
generated.docMap.metaphorMetrics = await measureDocMapMetaphor(join(sourceDir, "docMap-42.png"), "platinum");
assertDocMapMetaphor(generated.docMap.metaphorMetrics, "platinum/docMap");

family.schemaVersion = 2;
family.generatedBy = "tooling/build-platinum-imagegen-icons.mjs";
family.completeFamily = true;
family.runtimeAsset = true;
family.completeFamilyMeaning = "All 56 runtime ids resolve to technically accepted artwork. Historical review is a separate per-icon state.";
family.generatedAcceptanceMeaning = "Authoring acceptance confirms source and technical quality; it never implies historical validation.";
family.runtimeSize = "contextual";
family.runtimeSizesByContext = { compactMenuList: 16, ordinary: 32, desktopLarge: 42 };
family.compatibilityManifest = "platinum-icon-manifest.json";
family.compatibilityManifestMeaning = "Stable 32 px SVG-wrapper mapping only; app/core/system-icons.js selects 16, 32, or 42 px by rendering context.";
family.runtimeDispatch = "apps/desktop/app/core/system-icons.js";
family.nativeSizes = [42, 32, 16];
family.objects = ICON_IDS.length;
family.reviewedFamily = ICON_IDS;
family.reviewedGenerated = ICON_IDS;
family.fallback = [];
family.imageGenerationMode = "built-in-imagegen-one-call-per-asset";
family.imageGenerationSource = "assets/themes/platinum/icons/imagegen-source";
family.sizePolicy = "42 px desktop, 32 px regular, and 16 px compact assets are separately reduced from the accepted high-resolution redraw; the inline Platinum runtime selects the context-owned source size.";
family.icons = generated;
writeFileSync(familyPath, `${JSON.stringify(family, null, 2)}\n`);
writeFileSync(join(assetDir, "platinum-imagegen-icon-family.json"), `${JSON.stringify(family, null, 2)}\n`);
await buildContactSheet();
console.log(`platinum: applied ${ICON_IDS.length} accepted Image Gen redraws at 42/32/16 px`);
