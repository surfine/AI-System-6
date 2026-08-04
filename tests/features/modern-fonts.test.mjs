// Modern Fonts is a complete Classic typography mode, not a blanket font
// override: semantic roles still distinguish UI, document, and monospace text.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("modern-fonts");
const html = read("index.html");
const foundation = read("styles/00-foundation.css");
const windows = read("styles/10-windows.css");
const surfaces = read("styles/30-surfaces.css");
const apps = read("styles/50-apps.css");
const responsive = read("styles/60-responsive.css");

test.assertIncludes(foundation, "--modern-sans-font:", "Modern Sans has one shared Chinese-aware font stack");
test.assertMatches(
  foundation,
  /body\.use-modern-fonts \{[\s\S]*--clio-title-font: var\(--title-font\)[\s\S]*--drop-target-font-family: var\(--ui-font\)/,
  "Modern mode rebinds semantic aliases at the mode owner"
);
test.assertIncludes(responsive, "--system-titlebar-font-size: 13px", "Modern window titles are not left at the bitmap-size default");
test.assertIncludes(responsive, "--system-caption-size: 12px", "Modern secondary chrome has a readable caption size");
test.assertIncludes(responsive, "--system-title-weight: 500", "Modern compact chrome stays optically balanced with one-bit menu art");
test.assertMatches(foundation, /body\.use-modern-fonts \{[\s\S]*--system-icon-stroke-width: 1\.5;[\s\S]*--system-icon-pixel-run-expansion: 0\.5;/, "Modern typography balances outlined and filled Classic icon runs at one-and-a-half grid units");
test.assertMatches(foundation, /body\.use-modern-fonts \{[\s\S]*--menu-system-icon-stroke-width: 2\.25;[\s\S]*--menu-system-icon-pixel-run-expansion: 1\.25;/, "Modern menu icons compensate for their smaller 17-pixel rendering box");
test.assertIncludes(apps, "stroke-width: var(--system-icon-stroke-width)", "System icons consume the theme-owned stroke weight");
test.assertMatches(apps, /\.menu-bar \.sys-icon-svg \{[\s\S]*stroke-width: var\(--menu-system-icon-stroke-width\)/, "Menu-bar system icons consume their size-aware stroke token");
test.assertMatches(apps, /\.menu-bar \.sys-icon-classic \.classic-ink \{[\s\S]*stroke-width: var\(--menu-system-icon-pixel-run-expansion\)/, "Menu-bar native pixel runs receive the matching size-aware expansion");
test.assertMatches(apps, /\.sys-icon-classic \.classic-ink \{[\s\S]*stroke-width: var\(--system-icon-pixel-run-expansion\)/, "Modern typography can expand native one-bit runs without redrawing their geometry");
test.assertMatches(apps, /\.sys-icon-liquid \.classic-ink \{[\s\S]*stroke: none;/, "Liquid transport glyphs remain independent from the Classic pixel-run expansion");
test.assertNotIncludes(responsive, "body.use-modern-fonts *", "Modern mode does not flatten document and monospace font roles with a universal override");
test.assertMatches(
  windows,
  /\.clio-welcome \.message-content strong \{[\s\S]*font-size: var\(--clio-title-size\)[\s\S]*line-height: var\(--clio-title-leading\)/,
  "ClioTalk's welcome title consumes the mode-owned display metrics"
);
test.assertMatches(surfaces, /\.review-result-column th \{[^}]*font-family: var\(--title-font\)/, "Review table headings follow the selected title face");

test.finish();
