// Theme icon dispatch generator + consistency check.
//
// The semantic icon id -> per-theme asset mapping lives in one manifest per
// theme (assets/themes/<theme>/<theme>-icon-manifest.json). Every id is painted
// either by a per-icon CSS rule in styles/65-appearance-themes.css or by an
// <image> inside the inline SVG, and this asserts that each manifest id has
// exactly one of the two.
//
// Yosemite used to be described here as CSS-painted. It was not: all 56 of its
// ids ride completeEraRasterSystemIconArt with Aqua and Snow Leopard, and the
// 56 `--yosemite-icon` declarations that sat beside them were read by nothing
// -- no CSS rule, no JS, nowhere in the repository. Deleting them as dead
// tokens was correct and broke this check, which had encoded the old story.
//
// `--check` fails when the checked-in 65 mapping disagrees with the manifest
// (missing id, missing file, or a CSS rule pointing at a different asset),
// so the dispatch layer cannot drift silently. Without --check the script
// regenerates the painter CSS into internal/evidence/drafts/ for review.
import vm from "node:vm";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TRANSPORT = ["play", "pause", "previousTrack", "nextTrack", "shuffleTracks", "repeatTracks", "speaker"];
const FILE_THEMES = [
  { id: "platinum", dir: "platinum", manifest: "platinum-icon-manifest.json" },
  { id: "yosemite", dir: "yosemite", manifest: "yosemite-icon-manifest.json" },
  { id: "big-sur", dir: "big-sur", manifest: "big-sur-icon-manifest.json", svgLayer: "big-sur", styleFile: "68-big-sur-appearance.css" },
];

function readManifest(theme) {
  const path = join(root, "apps", "desktop", "assets", "themes", theme.dir, theme.manifest);
  if (!existsSync(path)) throw new Error(`Missing icon manifest: ${path}`);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  for (const [id, file] of Object.entries(manifest)) {
    if (!/^[A-Za-z0-9]+$/.test(id)) throw new Error(`${theme.id} manifest has a non-semantic icon id: ${id}`);
    if (!existsSync(join(root, "apps", "desktop", "assets", "themes", theme.dir, file))) {
      throw new Error(`${theme.id} manifest references a missing asset: ${file} (for ${id})`);
    }
  }
  if (theme.dir !== "yosemite") return manifest;
  const familyPath = join(root, "apps", "desktop", "assets", "themes", theme.dir, `${theme.dir}-icon-family.json`);
  const family = JSON.parse(readFileSync(familyPath, "utf8"));
  const retinaManifest = Object.fromEntries(Object.keys(manifest).map((id) => {
    const file = family.icons?.[id]?.sizes?.[128];
    if (!file || !existsSync(join(root, "apps", "desktop", "assets", "themes", theme.dir, file))) {
      throw new Error(`${theme.id}/${id}: missing reviewed 128 px runtime asset`);
    }
    return [id, file];
  }));
  return retinaManifest;
}

function svgEmbedCoreIds(theme) {
  // Execute the painter's sets instead of parsing their storage syntax. This
  // keeps derived vocabularies (Platinum and partial families) authoritative.
  const source = readFileSync(join(root, "apps", "desktop", "app", "core", "system-icons.js"), "utf8");
  const sets = vm.runInNewContext(`${source};({
    platinum: [...platinumCoreSystemIconIds],
    yosemite: [...completeEraSystemIconIds],
    "big-sur": [...completeEraSystemIconIds].filter((id) => !classicBigSurFallbackIds.has(id)),
  })`, { window: {} }, { timeout: 1000 });
  return new Set(sets[theme.id] || []);
}

function cssMapping(theme) {
  const css = readFileSync(join(root, "apps", "desktop", "styles", theme.styleFile || "65-appearance-themes.css"), "utf8");
  // Platinum writes the asset URL directly as background-image; Yosemite
  // carries it in a --yosemite-icon custom property. Both are the same
  // semantic dispatch (systemIcon(id) -> per-theme painter).
  const property = theme.id === "platinum"
    ? "background-image"
    : `--${theme.id}-icon`;
  const pattern = new RegExp(
    `body\\[data-theme="${theme.id}"\\] \\.sys-icon\\[data-system-icon="([A-Za-z0-9]+)"\\] \\{\\s*${property}:\\s*url\\("\\./assets/themes/${theme.dir}/([^"]+)"\\);`,
    "g",
  );
  const mapping = new Map();
  let match;
  while ((match = pattern.exec(css)) !== null) mapping.set(match[1], match[2]);
  return mapping;
}

function generateCss(theme, manifest) {
  if (theme.svgLayer) {
    // All semantic ids ride this independent SVG group. Background mappings
    // would double-paint them.
    return [
      `/* Independent ${theme.id} SVG raster layer. */`,
      `body[data-theme="${theme.id}"] .sys-icon-svg > g { display: none; }`,
      `body[data-theme="${theme.id}"] .sys-icon-svg > .sys-icon-${theme.svgLayer} { display: inline; }`,
      "",
    ].join("\n");
  }
  const notTransport = `:not(:where(${TRANSPORT.map((id) => `[data-system-icon="${id}"]`).join(", ")}))`;
  const lines = [
    `/* Generated by tooling/build-theme-icon-css.mjs from ${theme.manifest}. */`,
    `body[data-theme="${theme.id}"] .sys-icon[data-system-icon]${notTransport} {`,
    "  background-color: transparent;",
    "  background-repeat: no-repeat;",
    "  background-position: center;",
    "  background-size: contain;",
    "}",
    ...Object.entries(manifest).map(([id, file]) => [
      `body[data-theme="${theme.id}"] .sys-icon[data-system-icon="${id}"] {`,
      `  ${theme.id === "platinum" ? "background-image" : `--${theme.id}-icon`}: url("./assets/themes/${theme.dir}/${file}");`,
      "}",
    ]).flat(),
    `body[data-theme="${theme.id}"] .sys-icon[data-system-icon]${notTransport} .sys-icon-svg {`,
    "  display: none;",
    "}",
    "",
  ];
  return lines.join("\n");
}

const args = process.argv.slice(2);
const check = args.includes("--check");
let failed = 0;
for (const theme of FILE_THEMES) {
  const manifest = readManifest(theme);
  const css = cssMapping(theme);
  const coreIds = svgEmbedCoreIds(theme);
  if (theme.svgLayer) {
    const missing = Object.keys(manifest).filter((id) => !coreIds.has(id));
    if (missing.length) throw new Error(`${theme.id}: family lacks SVG painters for ${missing.join(", ")}`);
    for (const id of Object.keys(manifest)) {
      for (const size of [16, 32, 64, 128]) {
        if (!existsSync(join(root, "apps", "desktop", "assets", "themes", theme.dir, "icons", `${id}-${size}.png`))) {
          throw new Error(`${theme.id}/${id}: missing ${size} px family asset`);
        }
      }
    }
    const layerCss = readFileSync(join(root, "apps", "desktop", "styles", theme.styleFile), "utf8");
    if (!layerCss.includes(`.sys-icon-svg > .sys-icon-${theme.svgLayer} { display: inline; }`)) {
      throw new Error(`${theme.id}: independent SVG layer is not selected by its stylesheet`);
    }
  }
  const manifestIds = Object.keys(manifest).filter((id) => !coreIds.has(id)).sort();
  const cssIds = [...css.keys()].sort();
  const missingInCss = manifestIds.filter((id) => !css.has(id));
  const extraInCss = cssIds.filter((id) => !(id in manifest));
  const mismatched = manifestIds.filter((id) => css.has(id) && css.get(id) !== manifest[id]);
  if (missingInCss.length || extraInCss.length || mismatched.length) {
    failed += 1;
    console.error(`NO  ${theme.id} icon dispatch disagrees with ${theme.manifest}:`);
    if (missingInCss.length) console.error(`    missing CSS rules: ${missingInCss.join(", ")}`);
    if (extraInCss.length) console.error(`    CSS-only ids (not in manifest): ${extraInCss.join(", ")}`);
    for (const id of mismatched) console.error(`    ${id}: manifest ${manifest[id]} vs CSS ${css.get(id)}`);
  } else {
    console.log(`OK  ${theme.id}: ${manifestIds.length} CSS-painted icons match the checked-in painter CSS (${coreIds.size} core ids ride in the inline SVG raster)`);
  }
  if (!check) {
    const outDir = join(root, "internal", "evidence", "drafts", "theme-icon-css");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${theme.id}.css`), generateCss(theme, manifest));
  }
}
if (failed) {
  console.error(`\nTheme icon dispatch verification failed for ${failed} theme(s).`);
  process.exit(1);
}
console.log("\nTheme icon dispatch verification passed.");
