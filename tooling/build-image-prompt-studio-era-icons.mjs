#!/usr/bin/env node

// Build the six-era Image Prompt Studio extension. The semantic identity is
// intentionally stable across eras: image composition + editable prompt strip.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "tooling", "icon-generation", "image-prompt-studio-six-era");
const themesRoot = join(root, "apps", "desktop", "assets", "themes");
const sizesByEra = Object.freeze({
  classic: [32, 16],
  platinum: [42, 32, 16],
  aqua: [128, 32, 16],
  "snow-leopard": [128, 32, 16],
  yosemite: [128, 32, 16],
  "liquid-glass": [128, 64, 32, 16],
});
const appearances = Object.freeze(["default", "dark", "clear"]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function appearanceBuffer(defaultBuffer, appearance, size) {
  const { data, info } = await sharp(defaultBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    let red = data[offset]; let green = data[offset + 1]; let blue = data[offset + 2]; let alpha = data[offset + 3];
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
    if (size <= 32) {
      const contrast = size === 16 ? 1.16 : 1.08;
      red = (red - 128) * contrast + 128;
      green = (green - 128) * contrast + 128;
      blue = (blue - 128) * contrast + 128;
      if (size === 16 && alpha < 9) alpha = 0;
    }
    data[offset] = clamp(red);
    data[offset + 1] = clamp(green);
    data[offset + 2] = clamp(blue);
    data[offset + 3] = clamp(alpha);
  }
  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}

const manifest = {
  schema: "ai-system-6-image-prompt-studio-icon-extension-v1",
  semanticIdentity: "an image composition paired with an editable prompt strip",
  sourceRoot: "tooling/icon-generation/image-prompt-studio-six-era",
  eras: {},
};

for (const [era, sizes] of Object.entries(sizesByEra)) {
  const extension = era === "classic" ? ".svg" : ".png";
  const sourceRelative = `tooling/icon-generation/image-prompt-studio-six-era/${era}${extension}`;
  const source = readFileSync(join(root, sourceRelative));
  const iconDir = join(themesRoot, era, "icons");
  mkdirSync(iconDir, { recursive: true });
  const assets = {};
  if (extname(sourceRelative) === ".svg") {
    const text = source.toString("utf8");
    for (const size of sizes) {
      const output = Buffer.from(text.replace('width="128" height="128"', `width="${size}" height="${size}"`));
      const relative = `icons/imagePromptStudio-${size}.svg`;
      writeFileSync(join(themesRoot, era, relative), output);
      assets[size] = { file: relative, sha256: sha256(output) };
    }
  } else {
    for (const size of sizes) {
      const base = await sharp(source)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      if (era === "liquid-glass") {
        for (const appearance of appearances) {
          const output = await appearanceBuffer(base, appearance, size);
          const relative = `icons/imagePromptStudio-${size}-${appearance}.png`;
          writeFileSync(join(themesRoot, era, relative), output);
          assets[`${size}-${appearance}`] = { file: relative, sha256: sha256(output) };
        }
      } else {
        const output = await appearanceBuffer(base, "default", size);
        const relative = `icons/imagePromptStudio-${size}.png`;
        writeFileSync(join(themesRoot, era, relative), output);
        assets[size] = { file: relative, sha256: sha256(output) };
      }
    }
  }
  manifest.eras[era] = { source: sourceRelative, sourceSha256: sha256(source), sizes, assets };
}

writeFileSync(join(themesRoot, "image-prompt-studio-icon-extension.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("Image Prompt Studio: built six-era icon extension");
