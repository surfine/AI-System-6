// Icon distinguishability contract.
//
// A desktop full of near-identical icons is a first-run obstacle: Quick Draft
// and TeachText used to render as the same "ruled page" glyph in every
// appearance, so the two core writing apps were indistinguishable at a
// glance. This contract pins the fix: no two distinct icons may share an
// identical glyph shape, and Quick Draft must keep its lightning bolt so it
// never regresses into TeachText's twin.

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("icon-distinguishability");
const icons = read("app/core/system-icons.js");

// Extract every icon definition: `  id: `body`` template literals.
const defs = [];
const re = /^  ([a-zA-Z][a-zA-Z0-9]*): `([\s\S]*?)`,\n/gm;
let match;
while ((match = re.exec(icons))) defs.push({ id: match[1], body: match[2] });
test.assert(defs.length >= 100, `the icon registry carries the full set (${defs.length} definitions)`);

// Shape signature: every vector element, normalized, so identical glyphs (not
// just identical path data) are caught regardless of where they are defined.
function shapeSignature(body) {
  return [...body.matchAll(/<(?:path|rect|circle|ellipse|line|polygon|polyline)[^>]*>/g)]
    .map((x) => x[0].replace(/\s+/g, ""))
    .join("|");
}

// No two distinct icon ids may share an identical glyph shape anywhere in the
// registry (the same id repeating across theme families is expected).
const byShape = new Map();
defs.forEach((def) => {
  const key = shapeSignature(def.body);
  if (!byShape.has(key)) byShape.set(key, []);
  byShape.get(key).push(def.id);
});
const collisions = [...byShape.entries()].filter(([, ids]) => new Set(ids).size > 1);
test.assert(
  collisions.length === 0,
  `no two distinct icons share a glyph shape${collisions.length ? ": " + collisions.map(([, ids]) => ids.join("/")).join(", ") : ""}`
);

// Quick Draft is the lightning-bolt page; TeachText is the ruled page.
const quickDraftDefs = defs.filter((d) => d.id === "quickDraft");
const teachTextDefs = defs.filter((d) => d.id === "teachText");
test.assert(quickDraftDefs.length >= 2 && teachTextDefs.length >= 2, "both icon families define Quick Draft and TeachText");

quickDraftDefs.forEach((def) => {
  test.assertIncludes(def.body, "M20 11", "Quick Draft keeps its lightning bolt");
  test.assertNotIncludes(def.body, 'cx="20" cy="21"', "Quick Draft no longer uses the small clock that mimicked TeachText");
  test.assertIncludes(def.body, "l2-7z", "the bolt is a closed filled polygon so it renders at small sizes");
});

quickDraftDefs.forEach((quickDraft, index) => {
  const teachText = teachTextDefs[index];
  if (teachText) {
    test.assert(
      shapeSignature(quickDraft.body) !== shapeSignature(teachText.body),
      "Quick Draft and TeachText glyphs stay distinct in every family"
    );
  }
});

// Complete family assets remain the runtime base. These checks pin coverage and
// prevent byte-for-byte aliases; authenticity is accepted by each era's own
// focused evidence contract instead of inferred from file differences.
test.assertMatches(icons, /M20 11L13 19h5L16 26l7-8h-5l2-7z/, "the lightning bolt is defined once in the shared icon registry");

const eraBuilder = read("tooling/build-era-icons.mjs");
test.assertNotIncludes(eraBuilder, "readFileSync(join(root, \"apps/desktop/app/core/system-icons.js\")", "historical icon families never extract artwork from the shared runtime registry");
test.assertNotIncludes(eraBuilder, "ALIASES", "the era builder has no semantic asset aliases");
test.assertNotIncludes(eraBuilder, "extractBlock", "the era builder does not recolor source SVG blocks");
test.assertIncludes(eraBuilder, "function aquaBody", "Jaguar owns its body geometry");
test.assertIncludes(eraBuilder, "function snowLeopardBody", "Snow Leopard owns its body geometry");
test.assertIncludes(eraBuilder, "function yosemiteBody", "Yosemite owns its body geometry");
test.assertIncludes(eraBuilder, "function platinumBody", "Platinum owns its pixel geometry");
test.assertIncludes(eraBuilder, "function liquidGlassBody", "Liquid Glass owns object-specific body geometry");
test.assertIncludes(eraBuilder, "function liquidGlassMark", "Liquid Glass owns its semantic mark geometry");

const eraSizes = {
  platinum: [32, 16],
  aqua: [128, 32, 16],
  "snow-leopard": [512, 128, 32, 16],
  yosemite: [128, 64, 32, 16],
  "liquid-glass": [128, 64, 32, 16],
};
const runtimeManifestNames = {
  platinum: "platinum-icon-manifest.json",
  aqua: "aqua-icon-manifest.json",
  "snow-leopard": "snow-leopard-icon-manifest.json",
  yosemite: "yosemite-icon-manifest.json",
  "liquid-glass": "liquid-glass-icon-manifest.json",
};
const era32Bodies = new Map();
const expectedRuntimeIconCount = 56;
for (const [theme, sizes] of Object.entries(eraSizes)) {
  const runtime = JSON.parse(read(`assets/themes/${theme}/${runtimeManifestNames[theme]}`));
  const family = JSON.parse(read(`assets/themes/${theme}/${theme}-icon-family.json`));
  const ids = Object.keys(runtime);
  const incompleteEntries = [];
  const missingFiles = [];
  test.assert(ids.length === expectedRuntimeIconCount, `${theme} maps all ${expectedRuntimeIconCount} semantic icon ids`);
  test.assert(new Set(Object.values(runtime)).size === expectedRuntimeIconCount, `${theme} maps every runtime id to a distinct file`);
  test.assert(family.sharedGeometryAcrossEras === false, `${theme} keeps its complete runtime family structurally separate`);
  test.assert(Object.keys(family.icons).length === expectedRuntimeIconCount, `${theme} records the full family ledger`);
  for (const id of ids) {
    const entry = family.icons[id];
    if (!entry || !sizes.every((size) => entry.sizes[size])) {
      incompleteEntries.push(id);
      continue;
    }
    for (const size of sizes) {
      if (!exists(`assets/themes/${theme}/${entry.sizes[size]}`)) missingFiles.push(`${id}/${size}`);
    }
    const body32 = read(`assets/themes/${theme}/${runtime[id]}`).replace(/width="32" height="32"/, "");
    if (!era32Bodies.has(id)) era32Bodies.set(id, []);
    era32Bodies.get(id).push({ theme, body32 });
  }
  test.assert(
    incompleteEntries.length === 0,
    `${theme} records every required size${incompleteEntries.length ? `; incomplete: ${incompleteEntries.join(", ")}` : ""}`
  );
  test.assert(
    missingFiles.length === 0,
    `${theme} ships every recorded file${missingFiles.length ? `; missing: ${missingFiles.join(", ")}` : ""}`
  );
}
const crossEraDuplicates = [];
for (const [id, family] of era32Bodies) {
  if (new Set(family.map(({ body32 }) => body32)).size !== 5) crossEraDuplicates.push(id);
}
test.assert(
  crossEraDuplicates.length === 0,
  `runtime family files are not byte-identical across appearances${crossEraDuplicates.length ? `; duplicates: ${crossEraDuplicates.join(", ")}` : ""}`
);

const themeLab = read("index.html");
test.assert((themeLab.match(/class="theme-lab-icon-tile"/g) || []).length === 54, "Theme Lab displays all 54 appearance semantic icons");
test.assertIncludes(themeLab, 'data-system-icon="hardDisk"', "Theme Lab no longer aliases hard disk to startup disk");
test.assertIncludes(themeLab, 'data-system-icon="control"', "Theme Lab includes the distinct control utility icon");
test.assertIncludes(read("app/features/theme-lab.js"), 'assets/themes/${theme.id}', "Theme Lab includes every asset-backed appearance");
test.assertIncludes(read("app/features/theme-lab.js"), "theme-lab-icon-hint", "Theme Lab displays the native 16px hint beside every asset-backed 32px runtime icon");
test.assertIncludes(icons, "hardDisk: nativeSystem6HardDiskPath", "hard disk is a real runtime id instead of a document fallback");
test.assertIncludes(icons, "control: `", "control is a real runtime id instead of a document fallback");
test.assertIncludes(icons, "assets/themes/liquid-glass/", "Liquid Glass loads its independent SVG family");
test.assertIncludes(icons, "const liquidPaths = liquidGlassSystemIconArt(id, modernSourceSize)", "Liquid Glass consumes the context-selected raster tier instead of a legacy inline outline pack");

const liquidCss = read("styles/70-liquid-glass.css");
test.assertMatches(
  liquidCss,
  /body\.use-liquid-glass \.sys-icon \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;[\s\S]*?padding: 0;/,
  "Liquid Glass does not wrap every semantic object in a shared glass tile"
);

test.finish();
