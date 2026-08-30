import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("theme-lab-icon-sharpness");
const css = read("styles/66-theme-lab.css");
const lab = read("app/features/theme-lab.js");
const renderer = read("app/core/system-icons.js");
const opticalBuilder = read("tooling/build-liquid-glass-optical-small-icons.mjs");
const liquidFamily = JSON.parse(read("assets/themes/liquid-glass/liquid-glass-icon-family.json"));

test.assertMatches(css, /\.theme-lab-icon-tile \.sys-icon \{[^}]*width: 32px;[^}]*height: 32px;/,
  "the complete overview does not blur the ordinary 32 px source through a 34 px box");
test.assertMatches(css, /\.theme-lab-object-item \.sys-icon-era-raster \{[^}]*image-rendering: pixelated;/,
  "the 32/16 PNG state specimens retain exact source pixels on Retina output");
// A state cell is a real Finder item, and an era may size Finder icons: Liquid
// Glass paints them 44px from three classes. A two-class tier rule lost, every
// tier collapsed to 44px, and the 16px source was repeated 2.75 times per axis
// -- exact pixels stop reading as pixels the moment the ratio leaves whole
// numbers. Each tier rule must therefore carry the lab section and .sys-icon.
for (const px of [16, 32, 42, 72]) {
  test.assertMatches(
    css,
    new RegExp(`\\.theme-lab-object-lab \\.theme-lab-object-item \\.sys-icon\\.theme-lab-object-px-${px} \\{[^}]*width: ${px}px;[^}]*height: ${px}px;`),
    `the ${px} px state cell outranks an era's own Finder icon size`,
  );
}
test.assertMatches(css, /\.theme-lab-object-zooms img\.is-raster \{[^}]*image-rendering: pixelated;/,
  "the explicit 200–400% zoom ladder uses nearest-neighbour inspection");
test.assertMatches(css, /\.theme-lab-object-zooms img \{[^}]*image-rendering: auto;/,
  "Classic keeps its authored SVG smooth at Retina inspection scales");
test.assertIncludes(lab, 'art.ext === "png" ? "is-raster" : "is-vector"', "the inspector derives raster treatment from authoring metadata");
test.assertIncludes(lab, 'data-native-size="${tier}"', "the zoom ladder labels the actual authored source tier");
test.assertIncludes(lab, 'hint.dataset.nativeSize = "16"', "the compact hint identifies its native 16 px source");
test.assertIncludes(lab, "function stampedAssetPath(path)", "direct inspector and compact-hint files share the build cache stamp");
test.assertIncludes(lab, "return stampedAssetPath(`assets/themes/${art.dir}", "the authored-tier inspector cannot retain stale pre-fix PNG bytes");
test.assertIncludes(opticalBuilder, '.resize(size, size, { kernel: "lanczos3" })',
  "the compact source files are rebuilt from the full accepted 128 px runtime canvas without a generic inward inset");
test.assertIncludes(opticalBuilder, ".sharpen({", "the compact source files receive a real optical sharpening pass");
test.assertIncludes(opticalBuilder, "alpha < 24 ? 0", "the 16 px glass fringe cannot regress into a pale translucent fog");
test.assert(liquidFamily.smallTierBuilder === "tooling/build-liquid-glass-optical-small-icons.mjs",
  "the Liquid Glass family records the compact-tier owner instead of relying on Theme Lab CSS");
test.assertIncludes(renderer, "const rasterClass = usesEraRaster ? ' class=\"sys-icon-era-raster\"'",
  "Liquid Glass runtime images receive the raster class that Theme Lab sharpens");

test.finish();
