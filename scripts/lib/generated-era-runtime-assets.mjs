import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_RUNTIME_ERAS = Object.freeze(["aqua", "snow-leopard", "yosemite"]);
export const THEME_LAB_PACKAGED_ERAS = Object.freeze(["aqua", "snow-leopard", "yosemite", "liquid-glass"]);
export const THEME_RUNTIME_PNG_PATHS = Object.freeze([
  "assets/themes/platinum/azul-tile.png",
  "assets/themes/aqua/aqua-sprite.png",
  "assets/themes/snow-leopard/snow-leopard-sprite.png",
]);

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export function generatedEraRuntimeAssetReport(repositoryRoot = resolve(moduleDirectory, "../..")) {
  return GENERATED_RUNTIME_ERAS.map((eraId) => {
    const themeRoot = join(repositoryRoot, "assets/themes", eraId);
    const manifestPath = join(themeRoot, `${eraId}-icon-manifest.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const entries = Object.entries(manifest);
    const tiers = new Set();
    const files = [];

    for (const [iconId, relativePath] of entries) {
      const match = new RegExp(`^icons/${iconId}-(\\d+)\\.png$`).exec(relativePath);
      if (!match) throw new Error(`${eraId}/${iconId}: runtime manifest path is not a same-object PNG tier: ${relativePath}`);
      tiers.add(Number(match[1]));
      const absolutePath = join(themeRoot, relativePath);
      if (!existsSync(absolutePath)) throw new Error(`${eraId}/${iconId}: runtime asset is missing: ${relativePath}`);
      files.push({
        iconId,
        relativePath: `assets/themes/${eraId}/${relativePath}`,
        bytes: statSync(absolutePath).size,
      });
    }

    if (entries.length !== 56) throw new Error(`${eraId}: expected 56 runtime manifest entries, found ${entries.length}`);
    if (tiers.size !== 1) throw new Error(`${eraId}: runtime manifest mixes tiers: ${[...tiers].join(", ")}`);
    const [tier] = tiers;
    const pattern = `assets/themes/${eraId}/icons/*-${tier}.png`;
    const matchedNames = readdirSync(join(themeRoot, "icons"))
      .filter((name) => name.endsWith(`-${tier}.png`))
      .sort();
    const manifestNames = files.map((entry) => entry.relativePath.split("/").at(-1)).sort();
    if (JSON.stringify(matchedNames) !== JSON.stringify(manifestNames)) {
      throw new Error(`${eraId}: ${pattern} does not match exactly the 56 manifest assets`);
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
 * The desktop runtime uses one manifest-selected tier, but Theme Lab is a
 * shipped application and deliberately exposes each reviewed native size (and
 * each Liquid Glass appearance). Packaging only the runtime tier leaves valid
 * UI controls pointing at files that do not exist inside the macOS app.
 */
export function themeLabPackagedAssetReport(repositoryRoot = resolve(moduleDirectory, "../..")) {
  return THEME_LAB_PACKAGED_ERAS.map((eraId) => {
    const themeRoot = join(repositoryRoot, "assets/themes", eraId);
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
    const declaredNames = [...expectedNames].sort();
    if (JSON.stringify(packagedNames) !== JSON.stringify(declaredNames)) {
      throw new Error(`${eraId}: the broad package glob and complete-family ledger do not name the same PNG set`);
    }

    return {
      eraId,
      pattern: `assets/themes/${eraId}/icons/*.png`,
      files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    };
  });
}

export function themeRuntimePackagedAssets(repositoryRoot = resolve(moduleDirectory, "../..")) {
  return THEME_RUNTIME_PNG_PATHS.map((relativePath) => {
    const absolutePath = join(repositoryRoot, relativePath);
    if (!existsSync(absolutePath)) throw new Error(`Theme runtime PNG is missing: ${relativePath}`);
    const bytes = readFileSync(absolutePath);
    return {
      relativePath,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
}
