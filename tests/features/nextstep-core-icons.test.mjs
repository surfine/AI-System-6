// The NeXTSTEP core-object batch: the files exist, the runtime really uses
// them, and the ledger tells the truth about what they are.
//
// The era's own artwork used to be three applications. Everything else — the
// folder, the page, the drive, the trash — painted Classic art inside a
// NeXTSTEP window, which is a fallback wearing the era's chrome. This batch
// gives six high-frequency objects their own shapes, and this contract holds
// the three claims that matter:
//
//   1. the art is real: four tiers per object, each a PNG at its own size;
//   2. the runtime asks for it (and only for the objects that own it), which a
//      directory listing cannot show;
//   3. the provenance is honest: an original period adaptation, not a replica
//      of a native icon, with the historical review still open — and the
//      coverage note's "the other N use Classic" is the number the files
//      actually support.

import { readFileSync } from "node:fs";
import vm from "node:vm";

import { createFeatureTest, exists, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";
import { ADDED_APP_ICON_IDS } from "../../tooling/lib/added-app-icon-inventory.mjs";
import { ICON_SPECS } from "../../tooling/lib/icon-family-inventory.mjs";
import { NEXTSTEP_AUTHORED_ICON_IDS } from "../../tooling/lib/nextstep-core-art.mjs";

const test = createFeatureTest("nextstep-core-icons");

const BATCH = [...NEXTSTEP_AUTHORED_ICON_IDS];
const TIERS = [16, 32, 64, 128];
const family = JSON.parse(read("assets/themes/nextstep/nextstep-icon-family.json"));
const manifest = JSON.parse(read("assets/themes/nextstep/nextstep-icon-manifest.json"));

// ---- 1. The art is real, at every tier the runtime can ask for -------------

function pngSize(path) {
  const buffer = readFileSync(resolveProjectPath(path));
  const signature = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return signature ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null;
}

test.assert(BATCH.length >= 4, "the batch covers the high-frequency objects, not a single token object");
for (const id of BATCH) {
  const entry = family.icons[id];
  test.assert(Boolean(entry), `${id} is recorded in the family ledger`);
  for (const size of TIERS) {
    const path = entry?.sizes?.[size];
    test.assert(Boolean(path), `${id} names its ${size} px file`);
    test.assert(exists(`assets/themes/nextstep/${path}`), `${id}'s ${size} px file exists`);
    const dimensions = pngSize(`assets/themes/nextstep/${path}`);
    test.assert(dimensions && dimensions.width === size && dimensions.height === size,
      `${id}'s ${size} px file is a real PNG at that size`);
  }
  test.assert(manifest[id] === entry.sizes[128], `${id}'s compatibility manifest points at its largest tier`);
  // The Classic icon it stands in front of is still there: this batch adds a
  // NeXTSTEP layer, it does not take Classic's own art away.
  test.assert(exists(`assets/themes/classic/icons/${id}-32.svg`),
    `${id} keeps its Classic artwork as the base layer`);
}

// ---- 2. The provenance is honest -------------------------------------------

// The denominator every report shares: the canonical objects plus the three
// project-original applications (COMPLETE_ICON_IDS in
// tooling/lib/generated-era-runtime-assets.mjs).
const denominator = ICON_SPECS.length + ADDED_APP_ICON_IDS.length;
const coreCount = BATCH.length;
const applicationCount = Object.keys(family.icons).length - coreCount;
const owned = Object.keys(family.icons).length;
for (const id of BATCH) {
  const entry = family.icons[id];
  test.assert(entry.provenanceClass === "C" && entry.sourceKind === "original-code-native-period-adaptation",
    `${id} is recorded as an original period adaptation`);
  test.assert(entry.nativeReplica === false && entry.referenceValidated === false,
    `${id} claims no native replica and no validated reference`);
  test.assert(entry.historicalReviewStatus === "pending",
    `${id} keeps its historical review open`);
  test.assert(/no native screenshot was measured|no replica is claimed/i.test(String(entry.sourceNote || "")),
    `${id}'s note says out loud that no native screenshot was measured`);
}
test.assert(family.coreIconIds.length + family.utilityIconIds.length + family.deskIconIds.length
  + family.fileIconIds.length + family.lastIconIds.length === coreCount,
  "the ledger lists every batch it owns");
const batches = [family.coreIconIds, family.utilityIconIds, family.deskIconIds, family.fileIconIds, family.lastIconIds];
let cursor = 0;
const ordered = batches.every((batch) => {
  const slice = BATCH.slice(cursor, cursor + batch.length);
  cursor += batch.length;
  return JSON.stringify(batch) === JSON.stringify(slice);
});
test.assert(ordered,
"and it lists them in the order the module declares, so no batch can be swapped or duplicated");
// Complete or partial, the note has to describe the state the files support:
// a partial family names what still falls back, and a complete one says every
// mapped object is authored instead of printing a fallback of zero.
test.assert(family.coverageNote.includes(`${applicationCount} applications and ${coreCount} objects`),
  "the coverage note counts the applications and the objects that really own artwork");
test.assert(owned < denominator
  ? family.completeFamily === false && family.coverageNote.includes(`the other ${denominator - owned} semantic objects use Classic`)
  : family.completeFamily === true && family.coverageNote.includes(`every one of the ${owned} runtime objects`),
"and the note matches whether the family is registered as complete");
// The ledger's own count has to be the same number the continuity ledger and
// the provenance matrix report; otherwise two documents describe one desktop.
const continuity = JSON.parse(read("assets/themes/icon-system-continuity.json"));
const coverage = continuity.runtimeCoverageByEra?.nextstep || {};
test.assert(coverage.independentArtworkCount === owned && coverage.fallbackObjectCount === denominator - owned,
  "the continuity ledger agrees with the family ledger about what is authored and what falls back");

// ---- 3. The runtime asks for the batch, and only for the batch -------------

const sandbox = { window: {}, document: { body: null, querySelectorAll: () => [] } };
vm.createContext(sandbox);
vm.runInContext(read("app/core/theme-registry.js"), sandbox);
vm.runInContext(read("app/core/system-icons.js"), sandbox);
const api = sandbox.window.AISystem6Theme;
const svg = (id, size = 32) => sandbox.systemIconSvg(id, { modernSourceSize: size, platinumSourceSize: size, sourceSize: size });
const select = (id) => api.applyTheme(id, { announce: false, persist: false, experimental: id === "nextstep" });

for (const id of BATCH) {
  select("classic");
  const classic = svg(id);
  test.assertIncludes(classic, `classic/icons/`, `${id} still paints Classic art under Classic`);
  test.assertNotIncludes(classic, `assets/themes/nextstep/`, `${id} creates no inactive NeXTSTEP request`);
  select("nextstep");
  for (const size of TIERS) {
    const markup = svg(id, size);
    test.assertIncludes(markup, `class="sys-icon-nextstep"`, `${id} has an independent NeXTSTEP layer`);
    test.assertIncludes(markup, `assets/themes/nextstep/icons/${id}-${size}.png`,
      `${id} asks for its own ${size} px object, not a Classic file`);
  }
}

// The batch is the whole canonical object list now, so the ids that must still
// keep the Classic painter are the six game and lab payloads the appearance
// contract deliberately leaves alone. A runtime that answered every id with a
// NeXTSTEP path would 404 where the art does not exist.
for (const id of ["imagePromptStudio", "micropolis", "openttd"]) {
  select("nextstep");
  test.assertNotIncludes(svg(id), `class="sys-icon-nextstep"`, `${id} is not claimed by the batch`);
  test.assertNotIncludes(svg(id), "assets/themes/nextstep/", `${id} never requests a file that does not exist`);
}

test.finish();
