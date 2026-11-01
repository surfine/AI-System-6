#!/usr/bin/env node
// The iOS app icon (owner, 2026-10-18): the Mac AppIcon's source artwork
// (APP_ICON_SOURCE in build-tinyjs-shell-app.mjs, through tooling/lib/mac-app-icon.mjs)
// rendered as one 1024 px single-layer opaque PNG in an asset catalog Xcode
// compiles: platform/ios/AISystem6Shell/Generated/Assets.xcassets/AppIcon.appiconset.
// build-ios-web-payload.mjs runs it; `--beta-band` adds the Mac betas' version band.
//
//   node tooling/build-ios-app-icon.mjs [--beta-band]

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ICON_SOURCE } from "./build-tinyjs-shell-app.mjs";
import { pngColorType, renderIosAppIcon } from "./lib/mac-app-icon.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const IOS_ASSET_CATALOG = "platform/ios/AISystem6Shell/Generated/Assets.xcassets";
export const IOS_ICON_FILE = "AppIcon-1024.png";

export function buildIosAppIcon({ root = repoRoot, betaBand = false } = {}) {
  const sourcePath = join(root, APP_ICON_SOURCE);
  const version = betaBand ? JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version : "";
  const png = renderIosAppIcon({ sourcePath, version });
  if (pngColorType(png) !== 2) throw new Error("The iOS app icon must be an RGB PNG without alpha.");
  const catalog = join(root, IOS_ASSET_CATALOG);
  const iconset = join(catalog, "AppIcon.appiconset");
  rmSync(catalog, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  const info = { author: "xcode", version: 1 };
  writeFileSync(join(catalog, "Contents.json"), `${JSON.stringify({ info }, null, 2)}\n`);
  writeFileSync(join(iconset, IOS_ICON_FILE), png);
  writeFileSync(join(iconset, "Contents.json"), `${JSON.stringify({
    images: [{ filename: IOS_ICON_FILE, idiom: "universal", platform: "ios", size: "1024x1024" }],
    info,
  }, null, 2)}\n`);
  return { sourcePath, bytes: png.length, iconset };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = buildIosAppIcon({ betaBand: process.argv.includes("--beta-band") });
  console.log(`iOS app icon: ${result.bytes} bytes from ${result.sourcePath} → ${result.iconset}`);
}
