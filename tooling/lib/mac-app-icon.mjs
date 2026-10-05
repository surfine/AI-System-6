// Versioned Mac AppIcon artwork for the beta shell.
//
// Each release paints the short version string onto the base icon in Apple
// International Orange so Finder / Dock / Applications stop looking identical
// across betas. Small tiers keep only the orange band; legible text starts at
// 64 px.

import { createCanvas, Image, registerFont } from "canvas";
import { existsSync, readFileSync } from "node:fs";

/** Federal Standard 595 "International Orange" — the Apple-adjacent safety orange. */
export const INTERNATIONAL_ORANGE = "#FF4F00";

const SF_PRO_CANDIDATES = [
  "/Library/Fonts/SF-Pro-Display-Bold.otf",
  "/Library/Fonts/SF-Pro-Display-Heavy.otf",
  "/Library/Fonts/SF-Pro-Text-Bold.otf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
];

let registeredFontFamily = "sans-serif";
let fontReady = false;

function ensureFont() {
  if (fontReady) return registeredFontFamily;
  for (const file of SF_PRO_CANDIDATES) {
    if (!existsSync(file)) continue;
    try {
      const family = file.includes("SF-Pro") ? "AISystem6SFPro" : "AISystem6Fallback";
      registerFont(file, { family });
      registeredFontFamily = family;
      fontReady = true;
      return registeredFontFamily;
    } catch {
      // try the next candidate
    }
  }
  fontReady = true;
  return registeredFontFamily;
}

export function versionLabelForSize(version, size) {
  const text = String(version || "").trim();
  if (!text) return "";
  if (size < 64) return "";
  if (size < 128) {
    const parts = text.split(".");
    return parts[parts.length - 1] || text;
  }
  return text;
}

function loadImageSync(filePath) {
  const image = new Image();
  image.src = readFileSync(filePath);
  return image;
}

/**
 * Paint a versioned icon PNG at `size`×`size`.
 * @returns {Buffer} PNG bytes
 */
export function renderVersionedMacAppIcon({
  sourcePath,
  version,
  size,
  orange = INTERNATIONAL_ORANGE,
} = {}) {
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error(`Mac app icon source is missing: ${sourcePath || "(empty)"}`);
  }
  if (!Number.isFinite(size) || size < 16) {
    throw new Error(`Mac app icon size is invalid: ${size}`);
  }

  const family = ensureFont();
  const source = loadImageSync(sourcePath);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, size, size);

  const bandHeight = Math.max(3, Math.round(size * (size >= 256 ? 0.22 : size >= 128 ? 0.24 : 0.2)));
  const bandTop = size - bandHeight;
  ctx.fillStyle = orange;
  ctx.fillRect(0, bandTop, size, bandHeight);

  const label = versionLabelForSize(version, size);
  if (label) {
    // Fit the string inside the band with a little horizontal padding.
    let fontSize = Math.floor(bandHeight * 0.62);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxWidth = size * 0.9;
    while (fontSize >= 7) {
      ctx.font = `600 ${fontSize}px "${family}"`;
      if (ctx.measureText(label).width <= maxWidth) break;
      fontSize -= 1;
    }
    if (fontSize >= 7) {
      ctx.font = `600 ${fontSize}px "${family}"`;
      ctx.fillText(label, size / 2, bandTop + bandHeight / 2 + Math.max(0.5, size * 0.01));
    }
  }

  return canvas.toBuffer("image/png");
}

export const MAC_APP_ICONSET_SIZES = Object.freeze([
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
]);
