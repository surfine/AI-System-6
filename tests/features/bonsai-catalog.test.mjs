// Bonsai City building-catalog contract: all 256 XBLD-aligned ids carry a
// category, a sane footprint, and a bilingual original label; the Canvas
// backend renders imported tiles the layer model does not cover yet.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-catalog");
const context = vm.createContext({ window: {} });
vm.runInContext(read("app/features/bonsai-catalog.js"), context);
vm.runInContext(read("app/features/bonsai-translations.js"), context);
const catalog = context.window.AISystem6BonsaiCatalog;
const tables = context.window.AISystem6BonsaiTranslations || context.window.AISystem6Translations;

test.assert(!!catalog && typeof catalog.entryOf === "function", "the catalog installs its global");
let categorized = 0; const labelKeys = new Set();
for (let id = 0; id <= 255; id += 1) {
  const entry = catalog.entryOf(id);
  if (entry && entry.category && entry.size >= 1 && entry.size <= 4) categorized += 1;
  if (entry) labelKeys.add(entry.labelKey);
}
test.assert(categorized === 256, "every one of the 256 ids has a category and a 1..4 footprint");
test.assert(catalog.entryOf(-1) === null && catalog.entryOf(256) === null, "out-of-range ids resolve to null");
test.assert(catalog.entryOf(0xcf).category === "powerPlant" && catalog.entryOf(0xcf).size === 4, "the coal plant id is a 4x4 power plant");
test.assert(catalog.entryOf(0xd2).labelKey === "bonsai_catalog_police" && catalog.entryOf(0xd2).size === 3, "the police id carries its own label and size");
test.assert(catalog.entryOf(0x1d).category === "road" && catalog.entryOf(0xff).category === "dome", "range ends resolve to road and dome");

const translationSource = read("app/features/bonsai-translations.js");
for (const key of labelKeys) {
  const occurrences = translationSource.split(`${key}:`).length - 1;
  test.assert(occurrences >= 2, `${key} is defined in both language tables`);
}
// Naming the original product factually (import status copy) is fine;
// its distinctive in-game names must never appear in our labels.
test.assert(!/Llama|Cassidy|SimPark|SimBus|SimRail|Darco|Plymouth Arco/i.test(translationSource), "catalog labels are original wording, never the original game's text");

const canvasRenderer = read("app/features/bonsai-renderer-canvas.js");
test.assertIncludes(canvasRenderer, 'visualKind: "catalog"', "the Canvas backend draws imported catalog tiles");
test.assertIncludes(canvasRenderer, "CATALOG_COLORS", "catalog tiles are tinted by category");
test.assertMatches(canvasRenderer, /fnvUpdate\(hash, gridValue\(snapshot, \["catalogId"\]/, "the chunk signature invalidates when catalog tiles change");

test.finish();
