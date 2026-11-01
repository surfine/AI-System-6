#!/usr/bin/env node

// Rebuild Liquid Glass 32/16 px runtime tiers from the accepted 128 px
// runtime art. The older pipeline resampled the Image Gen master directly
// with canvas smoothing, so softness was permanently baked into the compact
// PNGs before Theme Lab or Finder displayed them.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shapeClass } from "./lib/icon-grid.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themeRoot = join(root, "apps", "desktop", "assets", "themes", "liquid-glass");
const iconRoot = join(themeRoot, "icons");
const familyPath = join(themeRoot, "liquid-glass-icon-family.json");
const extensionPaths = [
  join(root, "apps", "desktop", "assets", "themes", "lightroom-icon-extension.json"),
  join(root, "apps", "desktop", "assets", "themes", "image-prompt-studio-icon-extension.json"),
];
const smallSizes = [32, 16];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function opticalSmallTier(source, size) {
  const tuning = size === 16
    ? { sigma: 0.42, m1: 2.6, m2: 1.3, y2: 6, y3: 16, contrast: 1.22, offset: -28 }
    : { sigma: 0.55, m1: 2, m2: 1, y2: 8, y3: 20, contrast: 1.06, offset: -8 };
  const resized = await sharp(source)
    .resize(size, size, { kernel: "lanczos3" })
    .sharpen({ sigma: tuning.sigma, m1: tuning.m1, m2: tuning.m2, x1: 2, y2: tuning.y2, y3: tuning.y3 })
    .linear(tuning.contrast, tuning.offset)
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (size !== 16) return resized;

  // A 16 px translucent rim otherwise becomes a pale fog on a light Finder
  // surface. Harden only the compact alpha fringe; the opaque material and
  // the 32/64/128 glass recipes remain untouched.
  const { data, info } = await sharp(resized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 3; offset < data.length; offset += 4) {
    const alpha = data[offset];
    data[offset] = alpha < 24 ? 0 : Math.min(255, Math.round((alpha - 24) * 1.22));
  }
  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}

async function metrics(buffer, size) {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let pixels = 0;
  let translucent = 0;
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (alpha < 6) continue;
    const pixel = offset / 4;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    pixels += 1;
    if (alpha < 247) translucent += 1;
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

const family = JSON.parse(readFileSync(familyPath, "utf8"));
const extensionManifests = extensionPaths.map((path) => ({ path, manifest: JSON.parse(readFileSync(path, "utf8")) }));
const sources = readdirSync(iconRoot)
  .map((file) => ({ file, match: /^(.+)-128-(default|dark|clear)\.png$/.exec(file) }))
  .filter(({ match }) => match)
  .sort((left, right) => left.file.localeCompare(right.file));

for (const { file, match } of sources) {
  const [, id, appearance] = match;
  const source = readFileSync(join(iconRoot, file));
  for (const size of smallSizes) {
    const output = await opticalSmallTier(source, size);
    const outputFile = `${id}-${size}-${appearance}.png`;
    writeFileSync(join(iconRoot, outputFile), output);
    if (family.icons[id]) {
      family.icons[id].metrics[`${size}-${appearance}`] = await metrics(output, size);
    }
    for (const { manifest } of extensionManifests) {
      const asset = manifest.eras?.["liquid-glass"]?.assets?.[`${size}-${appearance}`];
      if (asset?.file === `icons/${outputFile}`) asset.sha256 = sha256(output);
    }
  }
}

family.smallTierBuilder = "tooling/build-liquid-glass-optical-small-icons.mjs";
family.smallTierPolicy = "32/16 px tiers are optically sharpened from each accepted 128 px runtime appearance without a generic inward inset; the 16 px alpha fringe is compacted for light-surface legibility.";
writeFileSync(familyPath, `${JSON.stringify(family, null, 2)}\n`);
for (const { path, manifest } of extensionManifests) writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Liquid Glass: optically rebuilt 32/16 px tiers for ${sources.length / 3} icons × 3 appearances`);
