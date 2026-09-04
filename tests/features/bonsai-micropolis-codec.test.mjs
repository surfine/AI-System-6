// Bonsai City Micropolis importer contracts: save sniffing, the clean-room
// tile mapping, the v3 payload shape, and rejection of malformed input.
// Every fixture is synthetic — built by this test at run time, never
// committed (same discipline as bonsai-sc2.test.mjs).
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-micropolis-codec");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
vm.runInContext(read("app/features/bonsai-micropolis-codec.js"), context);
const sim = context.window.AISystem6BonsaiSim;
const codec = context.window.AISystem6BonsaiMicropolisCodec;

// --- Static discipline -----------------------------------------------------
const source = read("app/features/bonsai-micropolis-codec.js");
test.assertIncludes(source, "window.AISystem6BonsaiMicropolisCodec", "the codec installs its global");
test.assertIncludes(source, "AISystem6BonsaiMicropolisCodecLoaded", "the codec sets its loaded flag");
test.assertNotIncludes(source, "Math.random", "the codec is deterministic");
test.assertNotMatches(source, /Date\.now|performance\.now|fetch\(|https?:\/\//, "the codec is headless and offline");
test.assertIncludes(source, "Clean-room", "the importer records its provenance boundary");
test.assertIncludes(source, "TILE_ID_MASK", "the tile id table is masked data, not engine code");

// --- Save sniffing ---------------------------------------------------------
function buildSave(size = 32) {
  const map = new Array(size * size).fill(0);
  const at = (x, y) => y * size + x;
  map[at(2, 2)] = codec.TILE_FACTS.WATER_LOW;
  map[at(5, 5)] = codec.TILE_FACTS.ROAD_LOW;
  map[at(8, 8)] = codec.TILE_FACTS.RES_LOW;
  map[at(16, 16)] = codec.TILE_FACTS.COAL_CENTER;
  map[at(20, 20)] = codec.TILE_FACTS.TREE_LOW;
  map[at(24, 24)] = codec.TILE_FACTS.ROAD_BRIDGE_H;
  map[at(26, 26)] = codec.TILE_FACTS.RES_GROWN_LOW + 9 * 5 + 4;  // centre of grown family 5
  map[at(27, 27)] = codec.TILE_FACTS.HOUSE_LOW + 3;
  return {
    width: size, height: size, map,
    totalFunds: 25000, _cityTime: 4800,
    cityTax: 7, roadPercent: 0.9, policePercent: 0.8, firePercent: 0.7,
    cityCentreX: 16, cityCentreY: 16,
  };
}

const save = buildSave();
test.assert(codec.looksLikeMicropolisSave(save), "a bare saveData object is recognised");
test.assert(codec.looksLikeMicropolisSave({ saveData: save }), "a cities-store record wrapper is recognised");
test.assert(!codec.looksLikeMicropolisSave({ width: 32, height: 32, map: [], totalFunds: 1, _cityTime: 1 }), "a truncated map is not a Micropolis save");
test.assert(!codec.looksLikeMicropolisSave({ map: new Array(1024).fill(0) }), "a map without the scalar fields is not a Micropolis save");

// --- Mapping ---------------------------------------------------------------
const imported = codec.importMicropolis(save, { name: "Old Town" });
test.assert(imported.payload.format === "bonsai-city" && imported.payload.version === 3, "the importer emits a v3 engine payload");
test.assert(imported.payload.size === 128, "the classic map embeds centered in the 128-square grid");
test.assert(imported.name === "Old Town", "the caller's name wins over the save's");
test.assert(imported.payload.sc2Sidecar?.kind === "micropolis-save-v1", "the untouched original rides the sidecar slot");

const offset = Math.floor((128 - save.width) / 2); // 48
const atBonsai = (x, y) => (y + offset) * 128 + (x + offset);
test.assert(imported.payload.water[atBonsai(2, 2)] === 1, "water tiles map to the water layer");
test.assert(imported.payload.road[atBonsai(5, 5)] === 1, "road tiles map to the road layer");
test.assert(imported.payload.tree[atBonsai(20, 20)] === 1, "tree tiles map to the tree layer");
test.assert(imported.payload.zone[atBonsai(8, 8)] === 1, "residential tiles map to a zone");
test.assert(imported.payload.water[atBonsai(24, 24)] === 1 && imported.payload.road[atBonsai(24, 24)] === 1, "a bridge is water with the road on top");
test.assert(imported.payload.variant[atBonsai(26, 26)] === codec.variantOfLevel(5) && imported.payload.stage[atBonsai(26, 26)] >= 1, "a grown block remembers its classic family in the variant layer");
test.assert(imported.payload.variant[atBonsai(27, 27)] === codec.variantOfLevel(3) && imported.payload.stage[atBonsai(27, 27)] === 1, "a single house remembers which house it was");
test.assert(codec.TILE_FACTS.RES_GROWN_LOW + 9 * codec.TILE_FACTS.RES_GROWN_LEVELS === codec.TILE_FACTS.HOSPITAL_LOW, "the sixteen residential families end where the hospital family starts");
test.assert(codec.TILE_FACTS.IND_GROWN_LOW + 9 * codec.TILE_FACTS.IND_GROWN_LEVELS === codec.TILE_FACTS.IND_HIGH + 1, "the eight industrial families end at the last industrial tile");
test.assert(
  imported.payload.facilities.some((facility) => facility.kind === "coal" && facility.x === 63 && facility.y === 63),
  "a working power plant centre becomes a live Bonsai facility at the embedded frame position",
);
test.assert(imported.payload.funding.roads === 90 && imported.payload.funding.police === 80 && imported.payload.funding.fire === 70, "classic budget percentages carry through");
test.assert(imported.payload.tick > 0, "the classic clock converts to Bonsai ticks");

const decoded = sim.deserialize(imported.payload);
test.assert(decoded && decoded.size === 128, "the emitted payload deserializes through the engine");

// --- Determinism and rejection ---------------------------------------------
test.assert(
  JSON.stringify(codec.importMicropolis(save, { name: "Old Town" }).payload)
    === JSON.stringify(imported.payload),
  "the same save imports to identical bytes",
);
{
  let rejected = false;
  try { codec.importMicropolis(buildSave(200)); } catch (error) { rejected = String(error.message).includes("map-size"); }
  test.assert(rejected, "a map larger than the Bonsai grid is rejected");
}
{
  let rejected = false;
  try { codec.importMicropolis({ nope: true }); } catch (error) { rejected = String(error.message).includes("save-shape"); }
  test.assert(rejected, "a non-save input is rejected with a structured error");
}
test.assert(imported.warnings.includes("sc2k-only-systems-absent"), "the importer states what the classic model cannot carry");

test.finish();
