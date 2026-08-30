import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_COMPATIBILITY_MANIFEST_ERAS = Object.freeze(["aqua", "snow-leopard", "yosemite"]);
export const THEME_LAB_PACKAGED_ERAS = Object.freeze(["aqua", "snow-leopard", "yosemite", "liquid-glass"]);
const EXTENDED_ICON_IDS = Object.freeze([
  "micropolis", "openttd", "doom", "bonsaiCity", "lightroom", "imagePromptStudio",
]);
// Standalone PNGs referenced outside the complete per-era icon-family globs.
// Aqua/Snow sprites remain compatibility artifacts; contextual icon dispatch
// reads the 16/32/128 family PNGs packaged by themeLabPackagedAssetReport().
export const THEME_STANDALONE_PNG_PATHS = Object.freeze([
  "apps/desktop/assets/themes/platinum/azul-tile.png",
  "apps/desktop/assets/themes/aqua/lamp-close.png",
  "apps/desktop/assets/themes/aqua/lamp-zoom.png",
  "apps/desktop/assets/themes/aqua/aqua-sprite.png",
  "apps/desktop/assets/themes/snow-leopard/lamp-close.png",
  "apps/desktop/assets/themes/snow-leopard/lamp-zoom.png",
  "apps/desktop/assets/themes/snow-leopard/snow-leopard-sprite.png",
  "apps/desktop/assets/themes/yosemite/lamp-close.png",
  "apps/desktop/assets/themes/yosemite/lamp-zoom.png",
]);

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export function generatedEraCompatibilityManifestReport(repositoryRoot = resolve(moduleDirectory, "../..")) {
  return GENERATED_COMPATIBILITY_MANIFEST_ERAS.map((eraId) => {
    const themeRoot = join(repositoryRoot, "apps/desktop/assets/themes", eraId);
    const manifestPath = join(themeRoot, `${eraId}-icon-manifest.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const entries = Object.entries(manifest);
    const tiers = new Set();
    const files = [];

    for (const [iconId, relativePath] of entries) {
      const match = new RegExp(`^icons/${iconId}-(\\d+)\\.png$`).exec(relativePath);
      if (!match) throw new Error(`${eraId}/${iconId}: compatibility manifest path is not a same-object PNG tier: ${relativePath}`);
      tiers.add(Number(match[1]));
      const absolutePath = join(themeRoot, relativePath);
      if (!existsSync(absolutePath)) throw new Error(`${eraId}/${iconId}: compatibility asset is missing: ${relativePath}`);
      files.push({
        iconId,
        relativePath: `assets/themes/${eraId}/${relativePath}`,
        bytes: statSync(absolutePath).size,
      });
    }

    if (entries.length !== 56) throw new Error(`${eraId}: expected 56 compatibility manifest entries, found ${entries.length}`);
    if (tiers.size !== 1) throw new Error(`${eraId}: compatibility manifest mixes tiers: ${[...tiers].join(", ")}`);
    const [tier] = tiers;
    const pattern = `assets/themes/${eraId}/icons/*-${tier}.png`;
    const matchedNames = readdirSync(join(themeRoot, "icons"))
      .filter((name) => name.endsWith(`-${tier}.png`))
      .sort();
    const manifestNames = files.map((entry) => entry.relativePath.split("/").at(-1)).sort();
    const extensionNames = EXTENDED_ICON_IDS.map((id) => `${id}-${tier}.png`).sort();
    const unexpectedNames = matchedNames.filter((name) => !manifestNames.includes(name) && !extensionNames.includes(name));
    const missingNames = manifestNames.filter((name) => !matchedNames.includes(name));
    if (unexpectedNames.length || missingNames.length) {
      throw new Error(`${eraId}: ${pattern} does not match the 56 manifest assets plus the six reviewed extensions`);
    }

    return {
      eraId,
      tier,
      pattern,
      files,
      bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    };
  });
}

/**
 * Every PNG that the packaged Theme Lab can request.
 *
 * The contextual desktop renderer and Theme Lab both request files from these
 * complete families. The separate 32 px manifests are compatibility mappings,
 * not the authoritative runtime-size selector.
 */
export function themeLabPackagedAssetReport(repositoryRoot = resolve(moduleDirectory, "../..")) {
  return THEME_LAB_PACKAGED_ERAS.map((eraId) => {
    const themeRoot = join(repositoryRoot, "apps/desktop/assets/themes", eraId);
    const familyPath = join(themeRoot, `${eraId}-icon-family.json`);
    const family = JSON.parse(readFileSync(familyPath, "utf8"));
    const files = [];
    const expectedNames = new Set();

    for (const [iconId, entry] of Object.entries(family.icons || {})) {
      const declared = eraId === "liquid-glass" ? entry.appearanceSizes : entry.sizes;
      for (const relativePath of Object.values(declared || {})) {
        const match = new RegExp(`^icons/${iconId}-(?:\\d+)(?:-(?:default|dark|clear))?\\.png$`).exec(relativePath);
        if (!match) throw new Error(`${eraId}/${iconId}: Theme Lab asset is not a same-object PNG: ${relativePath}`);
        const name = relativePath.split("/").at(-1);
        if (expectedNames.has(name)) continue;
        expectedNames.add(name);
        const absolutePath = join(themeRoot, relativePath);
        if (!existsSync(absolutePath)) throw new Error(`${eraId}/${iconId}: Theme Lab asset is missing: ${relativePath}`);
        const bytes = readFileSync(absolutePath);
        files.push({
          iconId,
          relativePath: `assets/themes/${eraId}/${relativePath}`,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }

    const packagedNames = readdirSync(join(themeRoot, "icons"))
      .filter((name) => name.endsWith(".png"))
      .sort();
    for (const name of packagedNames) {
      const extensionId = EXTENDED_ICON_IDS.find((id) => name.startsWith(`${id}-`));
      if (!extensionId || expectedNames.has(name)) continue;
      expectedNames.add(name);
      const absolutePath = join(themeRoot, "icons", name);
      const bytes = readFileSync(absolutePath);
      files.push({
        iconId: extensionId,
        relativePath: `assets/themes/${eraId}/icons/${name}`,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    const declaredNames = [...expectedNames].sort();
    if (JSON.stringify(packagedNames) !== JSON.stringify(declaredNames)) {
      throw new Error(`${eraId}: the broad package glob and complete-family ledger do not name the same PNG set`);
    }

    return {
      eraId,
      pattern: `apps/desktop/assets/themes/${eraId}/icons/*.png`,
      files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    };
  });
}

export function themeStandalonePackagedAssets(repositoryRoot = resolve(moduleDirectory, "../..")) {
  return THEME_STANDALONE_PNG_PATHS.map((packagePath) => {
    const absolutePath = join(repositoryRoot, packagePath);
    if (!existsSync(absolutePath)) throw new Error(`Standalone theme PNG is missing: ${packagePath}`);
    const bytes = readFileSync(absolutePath);
    return {
      packagePath,
      packagePattern: `${packagePath.slice(0, packagePath.lastIndexOf("/"))}/*.png`,
      relativePath: packagePath.replace(/^apps\/desktop\//, ""),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
}
