// Cross-era icon continuity contract.
//
// One product object must stay the same thing across the six appearances while
// every appearance owns independent artwork. Schema v2 locks semantic identity
// plus one or two recognition anchors; it deliberately does not lock one physical
// enclosure, composition, silhouette, or material across eras.
//
// The semantic contract is checked in the ledgers; DocMap's contract is also
// checked against rendered pixels, so honest prose cannot hide wrong artwork.

import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { assertDocMapMetaphor, measureDocMapMetaphor } from "../../tooling/lib/docmap-metaphor-metrics.mjs";

const test = createFeatureTest("icon-continuity");
const continuity = JSON.parse(read("assets/themes/icon-system-continuity.json"));

const eraReference = JSON.parse(read("assets/themes/era-icon-reference.json"));
const provenance = JSON.parse(read("assets/themes/icon-provenance-matrix.json"));
const ERAS = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];
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

test.assert(continuity.schemaVersion === 2, "the continuity ledger uses schema v2");
test.assert(eraReference.schemaVersion === 2, "the era reference ledger uses schema v2");
test.assertIncludes(eraReference.statusModel.familyCompleteness, "historical review remains pending",
  "complete runtime coverage is explicitly independent from historical approval");
test.assert(continuity.priorityCore16.length === 16, "the cross-era audit names exactly sixteen priority objects");
test.assertIncludes(continuity.metaphorKeyRule, "DEPRECATED MIGRATION ONLY",
  "legacy metaphor keys cannot lock one physical composition across eras");

for (const id of continuity.priorityCore16) {
  const anchor = continuity.semanticAnchors[id];
  test.assert(Boolean(anchor?.semanticIdentity), `${id} declares one stable semantic identity`);
  test.assert(anchor.identityAnchors.length >= 1 && anchor.identityAnchors.length <= 2,
    `${id} declares one or two identity anchors`);
  test.assert(Array.isArray(anchor.allowedChanges) && anchor.allowedChanges.length > 0,
    `${id} records what may change across eras`);
  for (const era of ERAS) {
    test.assert(Boolean(anchor.genreByEra[era]), `${id}/${era} assigns an era genre`);
    test.assert(Boolean(anchor.eraTranslationByEra[era]), `${id}/${era} explains the target-era translation`);
    test.assert(["A", "B", "C"].includes(anchor.provenanceClassByEra[era]), `${id}/${era} declares provenance A, B, or C`);
    test.assert(["pending", "historically-reviewed", "reference-validated"].includes(anchor.reviewStatusByEra[era]),
      `${id}/${era} declares an explicit historical-review state`);
  }
  test.assert(new Set(ERAS.map((era) => anchor.eraTranslationByEra[era])).size === ERAS.length,
    `${id} keeps six independently described era translations`);
}

const finder = continuity.semanticAnchors.finderApp;
const multiFinder = continuity.semanticAnchors.multiFinderApp;
test.assert(ERAS.every((era) => finder.provenanceClassByEra[era] === "A"),
  "Finder is grounded in a direct target-era prototype in every appearance");
test.assert(new Set(ERAS.map((era) => finder.historicalPrototypeByEra[era])).size === ERAS.length,
  "Finder names a different native prototype for every appearance");
test.assertIncludes(finder.eraTranslationByEra.aqua, "Jaguar split smiling Finder face",
  "Jaguar follows its split-face identity instead of a recoloured compact Macintosh");
test.assertIncludes(finder.eraTranslationByEra["liquid-glass"], "Golden Gate Beta 1",
  "Liquid Glass follows Golden Gate Beta 1 Finder anatomy instead of wrapping Classic hardware in glass");
test.assert(ERAS.every((era) => multiFinder.provenanceClassByEra[era] === "C"),
  "MultiFinder is honestly class C because no native icon resource is claimed");
test.assert(Object.keys(multiFinder.historicalPrototypeByEra).length === 0,
  "MultiFinder does not manufacture a direct native prototype claim");
test.assert(ERAS.every((era) => Boolean(multiFinder.nearestAnalogByEra[era])),
  "MultiFinder records its current-era Finder plus multiplicity analog in every appearance");
const assistant = continuity.semanticAnchors.assistant;
test.assert(assistant.semanticIdentity.includes("model reply remains provisional"),
  "ClioTalk keeps the user/model conversation and provisional-reply meaning");
test.assert(assistant.identityAnchors.includes("user/model duality")
  && assistant.identityAnchors.includes("provisional reply cue"),
  "ClioTalk keeps both recognition anchors without locking one physical bubble composition");
for (const era of ERAS) {
  test.assert(finder.reviewStatusByEra[era] === "reference-validated", `${era}/Finder passes its target-era native-evidence review`);
  test.assert(multiFinder.reviewStatusByEra[era] === "historically-reviewed", `${era}/MultiFinder passes its honest class-C historical review`);
}

for (const id of ["finderApp", "multiFinderApp"]) {
  const migration = continuity.semanticMigration[id];
  test.assert(JSON.stringify(migration.implemented) === JSON.stringify(ERAS),
    `${id} records the completed six-appearance evidence/runtime migration`);
  test.assert(Array.isArray(migration.pending) && migration.pending.length === 0,
    `${id} has no unresolved era after the approved runtime overlay`);
}

test.assertIncludes(provenance.definitions.policy, "never upgrades historicalReviewStatus",
  "generated acceptance and historical validation remain separate states");
const priorityIds = new Set(continuity.priorityCore16);
test.assert(provenance.coverage.priorityCore16Count === 16 && provenance.coverage.iconCountPerEra === 56,
  "the provenance matrix preserves the 16-priority / 40-pending review boundary");
for (const era of ERAS) {
  const cells = provenance.eras[era].icons;
  test.assert(Object.keys(cells).length === 56, `${era} provenance covers all 56 runtime objects`);
  for (const [id, cell] of Object.entries(cells)) {
    test.assert(cell.priorityCore16 === priorityIds.has(id), `${era}/${id} agrees with the priority-16 boundary`);
    test.assert(cell.runtimeAssetStatus === "mapped", `${era}/${id} identifies the runtime-mapped asset`);
    test.assert(cell.runtimeAsset === cell.runtimeAssetsByContext.ordinary
      && Boolean(cell.runtimeAssetsByContext.compactMenuList)
      && Boolean(cell.runtimeAssetsByContext.desktopLargeRetina)
      && Boolean(cell.compatibilityManifestAsset),
    `${era}/${id} separates real context dispatch from the compatibility manifest`);
    if (["finderApp", "multiFinderApp"].includes(id)) {
      test.assert(cell.historicalReviewStatus === (id === "finderApp" ? "reference-validated" : "historically-reviewed"),
        `${era}/${id} carries the final evidence status from the continuity authority`);
      test.assert(cell.blindMixStatus === "not-run",
        `${era}/${id} records that the independent blind-mix review has not run`);
    }
    if (!cell.priorityCore16) {
      test.assert(cell.historicalReviewStatus === "pending",
        `${era}/${id} stays pending outside the priority audit instead of inheriting authoring acceptance`);
    }
  }
}

for (const [theme, paths] of Object.entries(DOCMAP_ARTWORK)) {
  const family = JSON.parse(read(paths.family));
  const entry = family.icons?.docMap;
  if (entry?.reviewStatus === "accepted-priority-lineage") {
    const metric = entry.metrics?.["16"] || entry.metrics?.["16-default"];
    test.assert(entry.semanticIdentity === "visualize document heading structure"
      && JSON.stringify(entry.identityAnchors) === JSON.stringify(["document", "branching heading hierarchy"]),
    `${theme}/docMap family owns the document plus branching-heading semantic contract`);
    test.assert(metric?.ink?.width >= 11 && metric?.ink?.height >= 13 && metric?.inkPixels >= 140,
      `${theme}/docMap compact artwork preserves a legible native-size document hierarchy`);
    continue;
  }
  const recorded = family.icons?.docMap?.metaphorMetrics;
  const measured = await measureDocMapMetaphor(resolveProjectPath(paths.artwork), theme);
  let passes = true;
  try {
    assertDocMapMetaphor(measured, `${theme}/docMap`);
  } catch {
    passes = false;
  }
  test.assert(passes, `${theme}/docMap pixels contain either a document tree or a connected radial mind map`);
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
    centerHubDensity: 0,
    radialNodeDensities: [0, 0, 0, 0],
    radialBranchDensities: [0, 0, 0, 0],
    layoutMode: "document-tree",
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
