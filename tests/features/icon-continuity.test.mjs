// Cross-era icon continuity contract.
//
// One product object must stay the same thing across the six appearances while
// every appearance owns independent artwork. Two rules carry that:
//
//   1. Objects with locked metaphors declare a metaphorKey and every migrated era
//      ledger that draws them must use the same key.
//   2. System objects deliberately have no key: each era reproduces its own
//      operating system's prototype, so their prototype text must differ.
//
// The semantic contract is checked in the ledgers; DocMap's contract is also
// checked against rendered pixels, so honest prose cannot hide wrong artwork.

import { createFeatureTest, exists, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { assertDocMapMetaphor, measureDocMapMetaphor } from "../../tooling/lib/docmap-metaphor-metrics.mjs";

const test = createFeatureTest("icon-continuity");
const continuity = JSON.parse(read("assets/themes/icon-system-continuity.json"));

const CUSTOM_OBJECTS = ["finderApp", "searcher", "teachText", "assistant", "scrapbook", "reviewDesk", "docMap", "projectDisk"];
const SYSTEM_OBJECTS = ["folder", "hardDisk", "trash", "document", "daHandler", "controlPanel"];
const LEDGERS = [
  { theme: "snow-leopard", path: "assets/themes/snow-leopard/icons/src/snow-leopard-core-icons.json" },
  { theme: "yosemite", path: "assets/themes/yosemite/icons/src/yosemite-core-icons.json" },
  { theme: "liquid-glass", path: "assets/themes/liquid-glass/icons/src/liquid-glass-core-icons.json" },
];
const MIGRATION_LEDGER_PATHS = {
  classic: "assets/themes/classic/icons/src/classic-core-standins.json",
  platinum: "assets/themes/platinum/icons/src/platinum-core-icons.json",
  aqua: "assets/themes/aqua/icons/src/aqua-core-icons.json",
  "snow-leopard": "assets/themes/snow-leopard/icons/src/snow-leopard-core-icons.json",
  yosemite: "assets/themes/yosemite/icons/src/yosemite-core-icons.json",
  "liquid-glass": "assets/themes/liquid-glass/icons/src/liquid-glass-core-icons.json",
};
const DOCMAP_ARTWORK = {
  classic: {
    family: "assets/themes/classic/icons/classic-icon-family.json",
    artwork: "assets/themes/classic/icons/docMap-32.svg",
  },
  platinum: {
    family: "assets/themes/platinum/platinum-icon-family.json",
    artwork: "assets/themes/platinum/icons/docMap-42.png",
  },
  aqua: {
    family: "assets/themes/aqua/aqua-icon-family.json",
    artwork: "assets/themes/aqua/icons/docMap-128.png",
  },
  "snow-leopard": {
    family: "assets/themes/snow-leopard/snow-leopard-icon-family.json",
    artwork: "assets/themes/snow-leopard/icons/docMap-128.png",
  },
  yosemite: {
    family: "assets/themes/yosemite/yosemite-icon-family.json",
    artwork: "assets/themes/yosemite/icons/docMap-128.png",
  },
  "liquid-glass": {
    family: "assets/themes/liquid-glass/liquid-glass-icon-family.json",
    artwork: "assets/themes/liquid-glass/icons/docMap-128-default.png",
  },
};

// Ledgers name the drawn object either as a historical prototype or, for
// Liquid Glass, as the symbol the layers build.
const described = (icon) => icon?.prototype || icon?.symbol;

test.assertIncludes(continuity.metaphorKeyRule, "keep that one physical metaphor", "the contract states the metaphor rule");
test.assertIncludes(continuity.metaphorKeyRule, "own prototype", "the contract states that system objects follow their era instead");

for (const id of CUSTOM_OBJECTS) {
  const anchor = continuity.semanticAnchors[id];
  test.assert(Boolean(anchor?.metaphorKey), `${id} declares a metaphorKey in the continuity contract`);
}
for (const id of SYSTEM_OBJECTS) {
  test.assert(!continuity.semanticAnchors[id]?.metaphorKey, `${id} carries no metaphorKey, because each era owns its prototype`);
}

const ledgers = LEDGERS.filter((entry) => exists(entry.path))
  .map((entry) => ({ ...entry, data: JSON.parse(read(entry.path)) }));
test.assert(ledgers.length >= 3, "at least three era ledgers exist to compare");

const allThemes = Object.keys(MIGRATION_LEDGER_PATHS).sort();
for (const id of ["finderApp", "assistant"]) {
  const migration = continuity.semanticMigration[id];
  test.assert(Boolean(migration), `${id} records the deliberate cross-era semantic migration`);
  test.assert(
    JSON.stringify([...migration.implemented, ...migration.pending].sort()) === JSON.stringify(allThemes),
    `${id} migration accounts for every appearance without claiming unfinished artwork`,
  );
  for (const theme of migration.implemented) {
    const data = JSON.parse(read(MIGRATION_LEDGER_PATHS[theme]));
    const icon = data.icons?.[id];
    test.assert(icon?.metaphorKey === continuity.semanticAnchors[id].metaphorKey,
      `${theme}/${id} implements the migrated ${continuity.semanticAnchors[id].metaphorKey} metaphor`);
  }
}

for (const id of CUSTOM_OBJECTS) {
  const expected = continuity.semanticAnchors[id].metaphorKey;
  for (const ledger of ledgers) {
    const icon = ledger.data.icons?.[id];
    if (!icon) continue;
    const migration = continuity.semanticMigration[id];
    if (migration?.pending.includes(ledger.theme)) continue;
    test.assert(icon.metaphorKey === expected,
      `${ledger.theme}/${id} keeps the ${expected} metaphor (found ${icon.metaphorKey || "none"})`);
  }
}

// Independent artwork: the prototype sentence itself must be era-specific, for
// custom and system objects alike. Identical text across two eras is the first
// symptom of one drawing being recoloured into another era.
for (const id of [...CUSTOM_OBJECTS, ...SYSTEM_OBJECTS]) {
  const prototypes = ledgers
    .map((ledger) => described(ledger.data.icons?.[id]))
    .filter(Boolean);
  if (prototypes.length < 2) continue;
  test.assert(new Set(prototypes).size === prototypes.length, `${id} describes a different prototype in each era`);
}

const snow = ledgers.find((entry) => entry.theme === "snow-leopard")?.data;
const yosemite = ledgers.find((entry) => entry.theme === "yosemite")?.data;
const glass = ledgers.find((entry) => entry.theme === "liquid-glass")?.data;
if (snow && yosemite) {
  test.assert(snow.icons.finderApp.prototype !== yosemite.icons.finderApp.prototype,
    "pending Finder artwork remains independently described per era");
  test.assert(snow.icons.assistant.metaphorKey === yosemite.icons.assistant.metaphorKey,
    "the independently redrawn ClioTalk eras keep one semantic contract");
}

// Liquid Glass is the era most likely to drift into generic AI branding, so the
// custom objects are checked by name as well as by key.
if (glass) {
  test.assert(glass.icons.finderApp.metaphorKey === "smiling-compact-macintosh",
    "Finder is the friendly compact Macintosh in Liquid Glass");
  test.assertIncludes(glass.icons.finderApp.symbol, "small smile",
    "the Finder face is stated by name");
  test.assert(glass.icons.assistant.metaphorKey === "solid-user-dashed-reply-balloons",
    "ClioTalk exposes the solid-user/dashed-reply contract in Liquid Glass");
  test.assertIncludes(glass.icons.assistant.symbol, "clearly dashed provisional model reply",
    "the ClioTalk entry states why the reply outline is dashed");
  test.assertIncludes(glass.icons.assistant.symbol, "never a sparkle",
    "the ClioTalk entry still rules out the generic AI mark");
  test.assertIncludes(glass.continuityRule, "rather than the Yosemite artwork placed inside a glass tile",
    "the ledger rules out wrapping the previous era in glass");
  for (const id of CUSTOM_OBJECTS) {
    test.assert(described(glass.icons[id]) !== described(yosemite?.icons?.[id] || {}),
      `${id} is drawn again for Liquid Glass rather than reused from 10.10`);
  }
}

for (const [theme, paths] of Object.entries(DOCMAP_ARTWORK)) {
  const family = JSON.parse(read(paths.family));
  const recorded = family.icons?.docMap?.metaphorMetrics;
  const measured = await measureDocMapMetaphor(resolveProjectPath(paths.artwork), theme);
  let passes = true;
  try {
    assertDocMapMetaphor(measured, `${theme}/docMap`);
  } catch {
    passes = false;
  }
  test.assert(passes, `${theme}/docMap pixels contain a page mass and three right-side node bands`);
  test.assert(family.icons?.docMap?.metaphorKey === "branching-document-map",
    `${theme}/docMap family ledger keeps the branching-document-map contract`);
  test.assert(JSON.stringify(recorded) === JSON.stringify(measured),
    `${theme}/docMap family ledger pins the current artwork measurements`);
}

let rejectedPageLessGraph = false;
try {
  assertDocMapMetaphor({
    pageAdvantage: 0.01,
    pageAdvantageMin: 0.2,
    nodeBandDensities: [0.8, 0.8, 0.8],
  }, "negative-control/page-less-node-graph");
} catch {
  rejectedPageLessGraph = true;
}
test.assert(rejectedPageLessGraph, "the pixel gate rejects a page-less node graph even when three node bands exist");

const board = read("tooling/build-icon-continuity-board.mjs");
test.assertIncludes(board, "icon-continuity-board.png", "the continuity board is generated by a checked-in script");
test.assertIncludes(board, "reviewedByTheme", "the board reports accepted coverage per appearance");
test.assertIncludes(board, "never from the declared batch", "coverage is counted from artwork that exists");
test.finish();
