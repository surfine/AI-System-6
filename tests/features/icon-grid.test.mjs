// Icon grid contract.
//
// A row of icons must read as one family. Before this grid existed the same
// row mixed objects that differed by half again in size — the Liquid Glass
// enclosure apps filled their tile while the trash floated small inside it.
// The grid gives every object the same live dimension for its shape class and
// keeps the margin that stops icons colliding with each other.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { ICON_GRID, OPTICAL_ALLOWANCE, shapeClass } from "../../tooling/lib/icon-grid.mjs";

const test = createFeatureTest("icon-grid");
const APPROVED_IDENTITY_FOOTPRINTS = new Set([
  "aqua/finderApp",
  "aqua/assistant",
  "yosemite/finderApp",
  "yosemite/assistant",
  "liquid-glass/finderApp",
  "liquid-glass/multiFinderApp",
]);
const LIQUID_FULL_ENCLOSURES = new Set(["liquid-glass/finderApp", "liquid-glass/multiFinderApp"]);

const ERAS = [
  { theme: "aqua", family: "assets/themes/aqua/icons/aqua-core-icon-family.json", key: "128", builder: "tooling/build-aqua-core-icons.mjs" },
  { theme: "snow-leopard", family: "assets/themes/snow-leopard/icons/snow-leopard-core-icon-family.json", key: "128", builder: "tooling/build-snow-leopard-core-icons.mjs" },
  { theme: "yosemite", family: "assets/themes/yosemite/icons/yosemite-core-icon-family.json", key: "128", builder: "tooling/build-yosemite-core-icons.mjs" },
  { theme: "liquid-glass", family: "assets/themes/liquid-glass/liquid-glass-icon-family.json", key: "128-default", builder: "tooling/build-liquid-glass-imagegen-icons.mjs", imagegen: true },
];

// Platinum joins the grid for its generated family only: its reviewed core is
// authentic 1-bit artwork and is never resampled.
test.assert(Object.keys(ICON_GRID).length === ERAS.length + 1, "every appearance that generates vector art has a grid");
test.assert(Boolean(ICON_GRID.platinum), "the generated Platinum family has a grid");
for (const [id, allowance] of Object.entries(OPTICAL_ALLOWANCE)) {
  test.assert(allowance > 0.9 && allowance < 1.1, `${id}'s optical allowance stays a correction, not a second grid (${allowance})`);
}

for (const era of ERAS) {
  const grid = ICON_GRID[era.theme];
  const family = JSON.parse(read(era.family));
  const fitted = [];
  for (const [id, entry] of Object.entries(family.icons)) {
    const ink = entry.metrics?.[era.key]?.ink;
    test.assert(Boolean(ink), `${era.theme}/${id} records the ink box the grid measures`);
    if (!ink) continue;
    // The class is the one the painter used. Judging by the class of the
    // finished box would misread a near-square object that crossed the ratio
    // threshold while being scaled.
    const painted = entry.metrics[era.key].gridShape || shapeClass(ink);
    const grid2 = ICON_GRID[era.theme];
    const target = grid2[painted] * (OPTICAL_ALLOWANCE[id] || 1);
    const measured = painted === "landscape" ? ink.width
      : painted === "portrait" ? ink.height
        : Math.max(ink.width, ink.height);
    const identityKey = `${era.theme}/${id}`;
    if (!APPROVED_IDENTITY_FOOTPRINTS.has(identityKey)) fitted.push({ id, measured });
    const drift = Math.abs(measured - target) / target;
    test.assert(APPROVED_IDENTITY_FOOTPRINTS.has(identityKey) ? measured <= 126 : drift <= 0.08,
      `${era.theme}/${id} sits on the grid (${measured} against ${Math.round(target)}, ${Math.round(drift * 100)}% off)`);
    // The margin is the point of the grid: nothing may touch the canvas edge.
    test.assert(LIQUID_FULL_ENCLOSURES.has(identityKey)
      ? ink.minX >= 0 && ink.minY >= 0 && ink.maxX <= grid.canvas - 1 && ink.maxY <= grid.canvas - 1
      : ink.minX >= 1 && ink.minY >= 1 && ink.maxX <= grid.canvas - 2 && ink.maxY <= grid.canvas - 2,
      `${era.theme}/${id} keeps its margin inside the canvas`);
  }
  const sizes = fitted.map((entry) => entry.measured);
  const spread = Math.max(...sizes) / Math.min(...sizes);
  test.assert(spread <= 1.2, `${era.theme} keeps one family size (spread ${spread.toFixed(2)}x)`);

  const builder = read(era.builder);
  test.assertIncludes(builder, "icon-grid.mjs", `${era.theme} paints through the shared grid`);
  if (era.imagegen) {
    test.assertIncludes(builder, "shapeClass", `${era.theme} classifies each independent raster master on the shared grid`);
    test.assertIncludes(builder, "contentBox", `${era.theme} measures the transparent master rather than its raw canvas`);
  } else {
    test.assertIncludes(builder, "gridTransform", `${era.theme} applies the grid transform`);
    test.assertIncludes(builder, "inkBox", `${era.theme} measures the ink box rather than the raw alpha box`);
  }
}

// The generated fallback family sits on the same grid. A desktop shows both,
// so leaving the generated icons off the grid would put the jumble straight
// back on screen next to the reviewed ones.
for (const theme of ["platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"]) {
  const family = JSON.parse(read(`assets/themes/${theme}/${theme}-icon-family.json`));
  const entries = Object.entries(family.icons);
  test.assert(entries.length >= 56, `${theme} still carries the full 56-object family`);
  const fitted = [];
  for (const [id, entry] of entries) {
    test.assert(Boolean(entry.grid), `${theme}/${id} records where the grid placed it`);
    if (!entry.grid) continue;
    const identityKey = `${theme}/${id}`;
    if (!LIQUID_FULL_ENCLOSURES.has(identityKey)) fitted.push(entry.grid.fitted);
    test.assert(LIQUID_FULL_ENCLOSURES.has(identityKey) ? entry.grid.fitted <= 1.01 : entry.grid.fitted <= 0.97,
      `${theme}/${id} keeps its approved outer-enclosure footprint inside its cell`);
    test.assert(["square", "portrait", "landscape"].includes(entry.grid.shape), `${theme}/${id} records a shape class`);
  }
  const spread = Math.max(...fitted) / Math.min(...fitted);
  test.assert(spread <= 1.2, `${theme}'s full family keeps one size (spread ${spread.toFixed(2)}x)`);
}
test.assertIncludes(read("tooling/build-era-icons.mjs"), "placeOnGrid", "the generated family is placed on the grid");
test.assertIncludes(read("tooling/build-era-icons.mjs"), "icon-grid.mjs", "the generator uses the shared grid module");

// Classic preserves object-specific System 6 proportions but now ships smooth
// vectors across the complete family. Its optical median is pinned by the
// complete-family gate; here we prevent clipping and extreme within-family
// drift without forcing unlike objects onto one normalized silhouette.
const classic = JSON.parse(read("assets/themes/classic/icons/classic-icon-family.json"));
const classicSizes = Object.values(classic.icons).map((entry) => {
  const box = entry.metrics[32].art.bbox;
  test.assert(box.minX >= 0 && box.minY >= 0 && box.maxX <= 31 && box.maxY <= 31,
    `classic/${entry.label} remains inside its 32 px vector canvas`);
  return Math.max(box.maxX - box.minX + 1, box.maxY - box.minY + 1);
});
test.assert(Math.max(...classicSizes) / Math.min(...classicSizes) <= 1.35,
  "classic smooth vectors keep coherent scale while preserving System 6 object proportions");

// Platinum's reviewed core remains authentic pixel artwork and is never
// resampled, so it keeps the stricter one-pixel interior margin.
for (const [theme, path, key, pick] of [
  ["platinum", "assets/themes/platinum/icons/platinum-core-icon-family.json", "32", (m) => m.bbox],
]) {
  const family = JSON.parse(read(path));
  const sizes = Object.values(family.icons).map((entry) => {
    const box = pick(entry.metrics[key]);
    return Math.max(box.maxX - box.minX + 1, box.maxY - box.minY + 1);
  });
  const spread = Math.max(...sizes) / Math.min(...sizes);
  test.assert(spread <= 1.25, `${theme} stays even without resampling (spread ${spread.toFixed(2)}x)`);
  test.assert(Math.max(...sizes) <= 30, `${theme} keeps a margin inside the 32 px cell`);
}

test.finish();
