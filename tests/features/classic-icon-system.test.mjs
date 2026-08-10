// Classic core icon acceptance contract.
//
// System 6 artwork is a bitmap-and-mask system, not a monochrome vector style.
// This test pins the first accepted core batch to native resources, independent
// 16 px hints, separate masks, one-artwork selection, and the dedicated lab.

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("classic-icon-system");
const continuity = JSON.parse(read("assets/themes/icon-system-continuity.json"));
const source = JSON.parse(read("assets/themes/classic/icons/src/classic-core-standins.json"));
const family = JSON.parse(read("assets/themes/classic/icons/classic-core-icon-family.json"));
const runtime = JSON.parse(read("assets/themes/classic/icons/classic-core-icon-manifest.json"));
const coreIds = continuity.coreBatches.classic;

test.assert(continuity.schemaVersion === 1, "the six-era continuity ledger has a versioned contract");
test.assert(Object.keys(continuity.coreBatches).length === 6, "the ledger defines one progressive core batch for all six appearances");
for (const ids of Object.values(continuity.coreBatches)) {
  for (const id of ids) {
    test.assert(!!continuity.semanticAnchors[id], `${id} has a stable semantic anchor`);
  }
}

test.assert(coreIds.length === 12, "Classic begins with the required 12-object core batch");
test.assert(
  JSON.stringify(Object.keys(source.icons)) === JSON.stringify(coreIds),
  "the authored Classic source follows the continuity order exactly",
);
test.assert(
  JSON.stringify(Object.keys(runtime)) === JSON.stringify(coreIds),
  "the Classic runtime manifest exposes exactly the accepted core batch",
);
test.assert(Object.keys(family.icons).length === 12, "the Classic family ledger records all 12 accepted objects");
test.assert(family.coreOnly === true, "the family declares that unreviewed legacy icons remain fallback-only");
test.assertIncludes(family.selectionRecipe, "separate mask", "selection is documented as artwork plus mask");

const referencedIcons = Object.values(family.icons).filter((icon) => icon.sourceKind === "reference-guided-stand-in");
const adaptedIcons = Object.values(family.icons).filter((icon) => icon.sourceKind === "period-metaphor-stand-in");
test.assert(referencedIcons.length === 8, "eight core objects record System 6 resources as evidence for original stand-ins");
test.assert(adaptedIcons.length === 4, "only four product-specific metaphors require period pixel construction");
test.assertNotIncludes(JSON.stringify(source.icons), '"kind":"native-resource"', "no runtime source embeds an extracted native bitmap");

for (const id of coreIds) {
  const entry = family.icons[id];
  test.assert(entry.sizes[32] !== entry.sizes[16], `${id} owns separate 32 px and 16 px artwork`);
  test.assert(entry.masks[32] !== entry.masks[16], `${id} owns separate 32 px and 16 px masks`);
  for (const size of [32, 16]) {
    const artworkPath = `assets/themes/classic/icons/${entry.sizes[size]}`;
    const maskPath = `assets/themes/classic/icons/${entry.masks[size]}`;
    test.assert(exists(artworkPath), `${id}/${size} artwork exists`);
    test.assert(exists(maskPath), `${id}/${size} mask exists`);
    const artwork = read(artworkPath);
    const mask = read(maskPath);
    test.assertIncludes(artwork, `width="${size}" height="${size}"`, `${id}/${size} keeps its native canvas`);
    test.assertIncludes(artwork, 'shape-rendering="crispEdges"', `${id}/${size} requests crisp bitmap edges`);
    test.assertIncludes(artwork, 'fill="#ffffff"', `${id}/${size} carries white paper inside the mask`);
    test.assertIncludes(artwork, 'fill="#000000"', `${id}/${size} carries black artwork pixels`);
    test.assertNotMatches(artwork, /gradient|filter|opacity|stroke=/, `${id}/${size} contains no soft vector effects`);
    test.assertIncludes(mask, 'fill="#000000"', `${id}/${size} mask is a separate one-bit asset`);
    test.assertNotIncludes(mask, '#ffffff', `${id}/${size} mask contains no baked selected state`);
    test.assert(entry.metrics[size].art.pixels > 0, `${id}/${size} artwork is non-empty`);
    test.assert(entry.metrics[size].mask.pixels >= entry.metrics[size].art.pixels, `${id}/${size} mask covers at least the artwork area`);
  }
}

const builder = read("scripts/build-classic-core-icons.mjs");
test.assertIncludes(builder, "nativeImageHash", "the builder pins the System 6 disk image by SHA-256");
test.assertIncludes(builder, "outsideMask", "the builder raster-checks that every artwork pixel stays inside its mask");
test.assertIncludes(builder, "referenceDiffPixels === 0", "the builder rejects a stand-in that becomes an exact native copy");
test.assertNotIncludes(builder, "selectedFile", "the builder never emits alternate selected artwork");
test.assertNotIncludes(builder, "classicCoreSystemIconPaths", "the builder does not duplicate SVG pixels inside the startup bundle");

const iconRuntime = read("app/core/system-icons.js");
test.assertIncludes(iconRuntime, "classicCoreSystemIconArt", "the runtime loads accepted Classic assets without duplicating their pixels");
test.assertIncludes(iconRuntime, "-${sourceSize}.svg", "small and large contexts address independent source files");
test.assertIncludes(iconRuntime, "sourceSize: useSmallSource ? 16 : 32", "runtime hydration chooses the source size from the actual context");
test.assertIncludes(iconRuntime, '".cloud-icon"', "the compact cloud indicator hydrates from a 16 px source");
const cloudRuntime = read("app/core/chat-messages.js");
test.assert(
  (cloudRuntime.match(/systemIconSvg\(iconEl\.dataset\.systemIcon, \{ sourceSize: 16 \}\)/g) || []).length === 2,
  "both cloud-status redraw paths preserve the 16 px source",
);

const iconCss = `${read("styles/40-icons.css")}\n${read("styles/50-apps.css")}`;
test.assertIncludes(iconCss, ".has-classic-mask .sys-icon-classic", "Finder selection targets only accepted masked Classic artwork");
test.assertIncludes(iconCss, "filter: invert(1)", "Finder selection inverts the same masked SVG instead of swapping artwork");
test.assertIncludes(iconCss, ".sys-icon-classic .classic-paper", "Classic paper owns its fill recipe");
test.assertIncludes(iconCss, "stroke: none", "one-pixel mask runs are not expanded into silhouettes");

const themeLab = read("app/features/theme-lab.js");
const app = read("app.js");
const labCss = read("styles/66-theme-lab.css");
test.assertIncludes(themeLab, "Classic Core Icon Lab", "Theme Lab has a dedicated Classic acceptance surface");
test.assertIncludes(themeLab, "data-classic-icon-lab-grid", "the lab has an object-by-object core grid");
test.assertIncludes(themeLab, "const coreIcons", "the lab uses the explicit 12-object acceptance list");
test.assertIncludes(themeLab, "[32, 64, 128, 256]", "every icon is inspected at 1x, 2x, 4x, and 8x integer scales");
test.assertIncludes(themeLab, "32 Selected", "the lab exercises the 32 px selected state");
test.assertIncludes(themeLab, "16 Selected", "the lab exercises the 16 px selected state");
test.assertIncludes(themeLab, "Finder list view · true 16 px", "the lab includes a true small-icon Finder context");
test.assertIncludes(app, "window.AISystem6ThemeLab?.sync?.(theme)", "appearance changes resync an already-open lazy Theme Lab");
test.assertIncludes(read("app/core/window-manager.js"), "themeLab: {", "opening Theme Lab loads its inspection code on demand");
test.assertIncludes(read("scripts/runtime-manifest.mjs"), '"app/features/theme-lab.js"', "Theme Lab stays outside the two-floppy startup budget");
test.assertIncludes(labCss, "image-rendering: pixelated", "the inspection zoom never smooths one-bit pixels");
test.assertNotIncludes(labCss, "data-theme=", "the Classic lab does not add theme-specific selector leakage");

test.finish();
