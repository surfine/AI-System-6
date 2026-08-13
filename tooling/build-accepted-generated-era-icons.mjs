#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { GENERATION_OBJECTS } from "./icon-generation/generated-era-core-prompts.mjs";
import { ICON_IDS, ICON_SPECS } from "./lib/icon-family-inventory.mjs";
import { runtimePixelMetrics } from "./lib/icon-pixel-metrics.mjs";
import { assertDocMapMetaphor, measureDocMapMetaphor } from "./lib/docmap-metaphor-metrics.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = join(root, "tooling/icon-generation/accepted-generated-icons.json");
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const specs = Object.fromEntries(ICON_SPECS.map((entry) => [entry.id, entry]));
const continuity = JSON.parse(readFileSync(join(root, "apps/desktop/assets/themes/icon-system-continuity.json"), "utf8"));
const priorityCore16 = new Set(continuity.priorityCore16);

function historicalMetadata(iconId, eraId) {
  const anchor = continuity.semanticAnchors?.[iconId];
  return {
    provenanceClass: anchor?.provenanceClassByEra?.[eraId] || "C",
    historicalReviewStatus: priorityCore16.has(iconId)
      ? anchor?.reviewStatusByEra?.[eraId] || "pending"
      : "pending",
  };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertPng(buffer, expectedSize, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error(`${label}: expected PNG bytes`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(`${label}: expected ${expectedSize}x${expectedSize}, found ${width}x${height}`);
  }
}

function compatibilitySvg(iconId, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="icons/${iconId}-${size}.png" width="${size}" height="${size}"/></svg>\n`;
}

async function rebuildSprite(eraId, manifest, family) {
  const entries = Object.entries(manifest);
  const cellSize = 128;
  const canvas = createCanvas(8 * cellSize, Math.ceil(entries.length / 8) * cellSize);
  const ctx = canvas.getContext("2d");
  for (let index = 0; index < entries.length; index += 1) {
    const [iconId] = entries[index];
    const file = family.icons[iconId]?.sizes?.[cellSize];
    if (!file) throw new Error(`${eraId}/${iconId}: missing ${cellSize} px sprite source`);
    const image = await loadImage(join(root, "apps/desktop/assets/themes", eraId, file));
    ctx.drawImage(image, (index % 8) * cellSize, Math.floor(index / 8) * cellSize, cellSize, cellSize);
  }
  writeFileSync(join(root, "apps/desktop/assets/themes", eraId, `${eraId}-sprite.png`), canvas.toBuffer("image/png", { compressionLevel: 9 }));
}

export async function buildAcceptedGeneratedIcons(requestedEras = Object.keys(ledger.eras)) {
  const selected = new Set(requestedEras);
  for (const eraId of selected) {
    const era = ledger.eras[eraId];
    if (!era) continue;
    const themeDir = join(root, "apps/desktop/assets/themes", eraId);
    const familyPath = join(themeDir, `${eraId}-icon-family.json`);
    const manifestPath = join(themeDir, `${eraId}-icon-manifest.json`);
    const acceptedSourceDir = join(themeDir, "icons", "imagegen-source");
    if (!existsSync(familyPath) || !existsSync(manifestPath)) throw new Error(`${eraId}: build the broad icon family before applying accepted generated art`);
    const family = JSON.parse(readFileSync(familyPath, "utf8"));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const acceptedIds = Object.keys(era.icons);
    const recoveredCore = ledger.recoveredCoreBatch?.[eraId] || [];
    const expectedIds = eraId === "aqua"
      ? [...ledger.batch, ...ledger.priorAquaCompletion, ...ledger.secondBatch, ...ledger.thirdBatch, ...ledger.fourthBatch, ...ledger.clioTalkBatch, ...ledger.fifthBatch, ...ledger.finderIdentityBatch, ...ledger.sixthBatch, ...ledger.seventhBatch, ...ledger.eighthBatch, ...ledger.ninthBatch, ...ledger.tenthBatch, ...recoveredCore]
      : [...ledger.batch, ...ledger.secondBatch, ...ledger.thirdBatch, ...ledger.fourthBatch, ...ledger.clioTalkBatch, ...ledger.fifthBatch, ...ledger.finderIdentityBatch, ...ledger.sixthBatch, ...ledger.seventhBatch, ...ledger.eighthBatch, ...ledger.ninthBatch, ...ledger.tenthBatch, ...recoveredCore];
    if (JSON.stringify(acceptedIds) !== JSON.stringify(expectedIds)) throw new Error(`${eraId}: accepted batch order drifted`);

    for (const iconId of acceptedIds) {
      if (!GENERATION_OBJECTS[iconId] || !specs[iconId]) throw new Error(`${eraId}/${iconId}: unknown semantic object`);
      const sizeFiles = {};
      let pixelMetrics = null;
      for (const size of era.sizes) {
        const relative = `icons/${iconId}-${size}.png`;
        const absolute = join(themeDir, relative);
        const source = join(acceptedSourceDir, `${iconId}-${size}.png`);
        if (!existsSync(source)) throw new Error(`${eraId}/${iconId}/${size}: checked-in accepted Image Gen source is missing`);
        const buffer = readFileSync(source);
        assertPng(buffer, size, `${eraId}/${iconId}/${size}`);
        const expectedHash = era.icons[iconId][size];
        const actualHash = sha256(buffer);
        if (actualHash !== expectedHash) throw new Error(`${eraId}/${iconId}/${size}: accepted pixel hash drifted`);
        writeFileSync(absolute, buffer);
        sizeFiles[size] = relative;
        if (size === 128) {
          const image = await loadImage(buffer);
          const canvas = createCanvas(size, size);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0, size, size);
          pixelMetrics = runtimePixelMetrics(ctx, size);
        }
        if (size === 32) manifest[iconId] = relative;
        if (eraId === "yosemite") {
          const stem = iconId === "startupDisk" ? "startup-disk" : iconId;
          writeFileSync(join(themeDir, `${stem}-${size}.svg`), compatibilitySvg(iconId, size));
        }
      }
      family.icons[iconId] = {
        ...family.icons[iconId],
        genre: specs[iconId].genre,
        physicalMetaphor: GENERATION_OBJECTS[iconId].subject,
        semanticMark: specs[iconId].symbol,
        sourceKind: "original-generated-era-illustration",
        reviewStatus: "accepted-generated",
        authoringMethod: "image-generation-plus-deterministic-processing",
        generationStatus: "technically-clean",
        ...historicalMetadata(iconId, eraId),
        runtimeAsset: true,
        sizes: sizeFiles,
        runtimePixelMetrics: pixelMetrics,
      };
      if (iconId === "docMap") {
        family.icons[iconId].metaphorMetrics = await measureDocMapMetaphor(join(themeDir, sizeFiles[128]), eraId);
        assertDocMapMetaphor(family.icons[iconId].metaphorMetrics, `${eraId}/docMap`);
      }
    }

    family.schemaVersion = 2;
    family.generatedOverlayBuilder = "tooling/build-accepted-generated-era-icons.mjs";
    family.runtimeAsset = true;
    family.completeFamilyMeaning = "All 56 runtime ids resolve to technically accepted artwork. Historical review is a separate per-icon state.";
    family.generatedAcceptanceMeaning = "Authoring acceptance confirms source and technical quality; it never implies historical validation.";
    family.runtimeSize = "contextual";
    family.runtimeSizesByContext = { compactMenuList: 16, ordinary: 32, desktopLargeRetina: 128 };
    family.compatibilityManifest = `${eraId}-icon-manifest.json`;
    family.compatibilityManifestMeaning = "Stable 32 px semantic mapping only; app/core/system-icons.js selects 16, 32, or 128 px by rendering context.";
    family.runtimeDispatch = "apps/desktop/app/core/system-icons.js";
    family.generatedAcceptanceLedger = "tooling/icon-generation/accepted-generated-icons.json";
    family.imageGenerationSource = `assets/themes/${eraId}/icons/imagegen-source`;
    family.reviewedGenerated = acceptedIds;
    family.reviewedFamily = ICON_IDS.filter((id) => String(family.icons[id]?.reviewStatus || "").startsWith("accepted"));
    family.fallback = ICON_IDS.filter((id) => !String(family.icons[id]?.reviewStatus || "").startsWith("accepted"));
    family.completeFamily = family.fallback.length === 0;
    writeFileSync(familyPath, `${JSON.stringify(family, null, 2)}\n`);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (eraId === "aqua" || eraId === "snow-leopard") await rebuildSprite(eraId, manifest, family);
    console.log(`${eraId}: applied ${acceptedIds.length} accepted generated icons; ${family.fallback.length} fallback objects remain`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const requested = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index] === "--theme" ? process.argv[++index] : process.argv[index].replace(/^--theme=/, "");
    requested.push(value);
  }
  await buildAcceptedGeneratedIcons(requested.length ? requested : Object.keys(ledger.eras));
}
