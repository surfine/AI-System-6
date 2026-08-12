// Classic icon evidence and smooth-vector runtime acceptance contract.
//
// Original System 6 bitmap-and-mask resources own the historical prototype.
// The shipped family preserves those object silhouettes as smooth Retina-safe
// SVG, with separate optical policies for 32 px and 16 px contexts.

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("classic-icon-system");
const continuity = JSON.parse(read("assets/themes/icon-system-continuity.json"));
const source = JSON.parse(read("assets/themes/classic/icons/src/classic-core-standins.json"));
const family = JSON.parse(read("assets/themes/classic/icons/classic-core-icon-family.json"));
const completeFamily = JSON.parse(read("assets/themes/classic/icons/classic-icon-family.json"));
const runtime = JSON.parse(read("assets/themes/classic/icons/classic-core-icon-manifest.json"));
const coreIds = continuity.coreBatches.classic;

test.assert(continuity.schemaVersion === 1, "the six-era continuity ledger has a versioned contract");
test.assert(Object.keys(continuity.coreBatches).length === 6, "the ledger defines one progressive core batch for all six appearances");
for (const ids of Object.values(continuity.coreBatches)) {
  for (const id of ids) {
    test.assert(!!continuity.semanticAnchors[id], `${id} has a stable semantic anchor`);
  }
}

test.assert(coreIds.length === 15, "Classic carries the fourteen locked objects plus File Floppy");
test.assert(
  JSON.stringify(Object.keys(source.icons)) === JSON.stringify(coreIds),
  "the authored Classic source follows the continuity order exactly",
);
test.assert(
  JSON.stringify(Object.keys(runtime)) === JSON.stringify(coreIds),
  "the Classic runtime manifest exposes exactly the accepted core batch",
);
test.assert(Object.keys(family.icons).length === 15, "the Classic family ledger records all 15 accepted objects");
test.assert(family.coreOnly === true, "the family declares that unreviewed legacy icons remain fallback-only");
test.assertIncludes(family.selectionRecipe, "separate mask", "selection is documented as artwork plus mask");

const nativeReplicas = Object.values(family.icons).filter((icon) => icon.sourceKind === "native-resource-replica");
const semanticAdaptations = Object.values(family.icons).filter((icon) => icon.sourceKind === "reference-guided-semantic-adaptation");
const adaptedIcons = Object.values(family.icons).filter((icon) => icon.sourceKind === "period-metaphor-stand-in");
test.assert(nativeReplicas.length === 7, "seven direct counterparts reproduce the original System 6 resource exactly in the evidence build");
test.assert(semanticAdaptations.length === 1, "Finder records the one semantic adaptation required by the smiling-system contract");
test.assert(adaptedIcons.length === 7, "seven product-specific metaphors require period pixel construction");
test.assert(family.icons.finderApp.sourceKind === "reference-guided-semantic-adaptation", "Finder restores the friendly compact Macintosh from System identity evidence");
test.assert(source.icons.finderApp.source32.nativeReference.id === 3, "Finder records the System suitcase ICN# 3 evidence");
test.assertIncludes(source.icons.assistant.source32.note, "provisional model reply is dashed", "ClioTalk documents the solid-user/dashed-reply contract");
test.assert(source.icons.assistant.source32.art.some((operation) => operation[0] === "rect" && operation[1] === 12 && operation[2] === 17),
  "ClioTalk authors the reply dash runs on the one-bit grid");
test.assert(nativeReplicas.every((icon) => icon.referenceDiffPixels === 0), "every direct historical evidence replica is pixel-identical to its native resource");

test.assert(Object.keys(completeFamily.icons).length === 56, "the smooth Classic runtime covers all 56 canonical objects");
for (const [id, entry] of Object.entries(completeFamily.icons)) {
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
    test.assertIncludes(artwork, 'shape-rendering="geometricPrecision"', `${id}/${size} requests smooth vector rendering`);
    test.assertIncludes(artwork, 'stroke-linecap="round"', `${id}/${size} uses smooth optical line endings`);
    test.assertIncludes(artwork, 'stroke="#000000"', `${id}/${size} carries restrained monochrome line art`);
    test.assertNotMatches(artwork, /gradient|filter|image-rendering/, `${id}/${size} contains no raster or material effects`);
    test.assertIncludes(mask, 'fill="#000000"', `${id}/${size} mask is a separate one-bit asset`);
    test.assertIncludes(mask, 'shape-rendering="geometricPrecision"', `${id}/${size} selection mask stays smooth at Retina scale`);
    test.assertNotIncludes(mask, '#ffffff', `${id}/${size} mask contains no baked selected state`);
    test.assert(entry.metrics[size].art.pixels > 0, `${id}/${size} artwork is non-empty`);
    test.assert(entry.metrics[size].mask.pixels >= entry.metrics[size].art.pixels, `${id}/${size} mask covers at least the artwork area`);
    test.assert(entry.metrics[size].inkCoverage > 0.08 && entry.metrics[size].inkCoverage < 0.56,
      `${id}/${size} keeps a legible but non-blocky monochrome ink budget`);
  }
}

const builder = read("tooling/build-classic-core-icons.mjs");
test.assertIncludes(builder, "nativeImageHash", "the builder pins the System 6 disk image by SHA-256");
test.assertIncludes(builder, "outsideMask", "the builder raster-checks that every artwork pixel stays inside its mask");
test.assertIncludes(builder, "replica32 && referenceDiffPixels !== 0", "the evidence builder rejects drift from a direct native counterpart");
test.assertNotIncludes(builder, "selectedFile", "the builder never emits alternate selected artwork");
test.assertNotIncludes(builder, "classicCoreSystemIconPaths", "the builder does not duplicate SVG pixels inside the startup bundle");

const iconRuntime = read("app/core/system-icons.js");
test.assertIncludes(iconRuntime, "classicSystemIconArt", "the runtime loads the complete smooth Classic family without duplicating its paths");
test.assertIncludes(iconRuntime, "-mask-${sourceSize}.svg", "the runtime loads the matching System 6 selection silhouette for each optical size");
test.assertIncludes(iconRuntime, "-${sourceSize}.svg", "small and large contexts address independent source files");
test.assertIncludes(iconRuntime, "sourceSize: useSmallSource ? 16 : 32", "runtime hydration chooses the source size from the actual context");
test.assertIncludes(iconRuntime, '".cloud-icon"', "the compact cloud indicator hydrates from a 16 px source");
const cloudRuntime = read("app/core/chat-messages.js");
test.assert(
  (cloudRuntime.match(/systemIconSvg\(iconEl\.dataset\.systemIcon, \{ sourceSize: 16 \}\)/g) || []).length === 2,
  "both cloud-status redraw paths preserve the 16 px source",
);

const iconCss = `${read("styles/40-icons.css")}\n${read("styles/50-apps.css")}`;
test.assertIncludes(iconCss, ".has-classic-mask .sys-icon-classic-mask", "Finder selection reveals only the matching Classic mask");
test.assertIncludes(iconCss, ".has-classic-mask .sys-icon-classic-art", "Finder selection targets only the smooth Classic artwork layer");
test.assertIncludes(iconCss, "filter: invert(1)", "Finder selection reverses the same artwork above its mask instead of swapping icons");
test.assertIncludes(iconCss, ".sys-icon-classic .classic-paper", "Classic paper owns its fill recipe");
test.assertIncludes(iconCss, "stroke: none", "one-pixel mask runs are not expanded into silhouettes");

const themeLab = read("app/features/theme-lab.js");
const app = read("app.js");
const labCss = read("styles/66-theme-lab.css");
test.assertIncludes(themeLab, "Classic System 6 Vector Lab", "Theme Lab has a dedicated Classic vector acceptance surface");
test.assertIncludes(themeLab, "Fifteen representative Finder objects", "Theme Lab reports its representative evidence batch honestly");
test.assertIncludes(themeLab, "15 representative objects", "the Classic inspector key matches the evidence batch count");
test.assertIncludes(themeLab, "data-classic-icon-lab-grid", "the lab has an object-by-object core grid");
test.assertIncludes(themeLab, "const coreIcons", "the lab uses the explicit 15-object acceptance list");
test.assertIncludes(themeLab, "[32, 64, 128, 256]", "every icon is inspected at 1x, 2x, 4x, and 8x integer scales");
test.assertIncludes(themeLab, "32 Selected", "the lab exercises the 32 px selected state");
test.assertIncludes(themeLab, "16 Selected", "the lab exercises the 16 px selected state");
test.assertIncludes(themeLab, "Finder list view · true 16 px", "the lab includes a true small-icon Finder context");
test.assertIncludes(app, "window.AISystem6ThemeLab?.sync?.(theme)", "appearance changes resync an already-open lazy Theme Lab");
test.assertIncludes(read("app/core/window-manager.js"), "themeLab: {", "opening Theme Lab loads its inspection code on demand");
test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/features/theme-lab.js"', "Theme Lab stays outside the two-floppy startup budget");
test.assertIncludes(labCss, "image-rendering: auto", "the inspection zoom preserves smooth SVG rendering on Retina screens");
test.assertNotIncludes(labCss, "data-theme=", "the Classic lab does not add theme-specific selector leakage");

test.finish();
