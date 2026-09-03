// One-way city save import: a Micropolis save opens in Bonsai City.
//
// The direction is the design. SimCity 2000 could open a SimCity 1 city and
// never wrote one back, and the two desk toys keep that shape: Micropolis is
// the earlier, thinner model, Bonsai City the later, richer one. This
// contract holds the mapping table — what carries, what carries by a defined
// rule, and what cannot come across at all — and holds the product rule that
// the facts which cannot come across are told to the player instead of being
// silently invented.
//
// The fixture is a REAL Micropolis save: this test drives the vendored
// engine and its own tools, then serializes with the same steps the
// Micropolis shell uses. Nothing is hand-written, and no fixture file is
// committed.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("city-save-import");

// --- the real Micropolis save ------------------------------------------------

const engineContext = { window: {}, console };
engineContext.window.window = engineContext.window;
vm.createContext(engineContext);
// The map generator draws from Math.random and the engine offers no seed
// hook. A seeded generator inside the sandbox makes the fixture the same
// city on every run, so a failure here is always reproducible. Only this
// test's sandbox is affected; the shipped engine is untouched.
vm.runInContext(`
  let seed = 99 >>> 0;
  Math.random = function seededRandom() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
`, engineContext);
vm.runInContext(
  `${read("app/vendor/micropolis/micropolis-engine.js")}\nwindow.MicropolisEngine = MicropolisEngine;`,
  engineContext,
);
const engine = engineContext.window.MicropolisEngine;

// The shell always makes a 120x100 map, so the fixture is the size the
// product actually writes. The engine scans the map in fixed-width bands
// that assume this size.
const MAP_W = 120;
const MAP_H = 100;
const gameMap = engine.MapGenerator(MAP_W, MAP_H);
const micropolisSim = new engine.Simulation(gameMap, engine.Simulation.LEVEL_EASY, engine.Simulation.SPEED_PAUSED);
const micropolisTools = engine.createTools(gameMap);
micropolisSim.budget.totalFunds = 500000;
micropolisSim.budget.cityTax = 9;

// The generator scatters river and forest, so the town is laid on a plain
// the test finds rather than on coordinates that assume a map shape.
const PLAIN_W = 26;
const PLAIN_H = 20;
const isClassicWater = (x, y) => {
  const value = gameMap.getTileValue(x, y) & 0x3ff;
  return value >= 2 && value <= 20;
};
let plain = null;
for (let y = 1; y + PLAIN_H < MAP_H - 1 && !plain; y += 1) {
  for (let x = 1; x + PLAIN_W < MAP_W - 1 && !plain; x += 1) {
    let clear = true;
    for (let dy = 0; dy < PLAIN_H && clear; dy += 1) {
      for (let dx = 0; dx < PLAIN_W && clear; dx += 1) if (isClassicWater(x + dx, y + dy)) clear = false;
    }
    if (clear) plain = [x, y];
  }
}
test.assert(!!plain, "the generated map offers a plain wide enough for the fixture town");
const [plainX, plainY] = plain || [1, 1];

// Lay the town with the engine's own tools, so every tile id in the fixture
// is one the real game writes. A building tool takes the centre of its
// footprint, so the rows below leave the space each footprint needs.
function useTool(id, x, y) {
  const tool = micropolisTools[id];
  tool.doTool(plainX + x, plainY + y, micropolisSim.blockMaps);
  tool.modifyIfEnoughFunding(micropolisSim.budget);
  return tool.result === tool.TOOLRESULT_OK;
}
for (let y = 0; y < PLAIN_H; y += 1) for (let x = 0; x < PLAIN_W; x += 1) useTool("bulldozer", x, y);
const built = { road: 0, residential: 0, commercial: 0, industrial: 0, coal: 0, police: 0, park: 0, rail: 0, wire: 0 };
// Two through roads, the residential band above the first and the working
// band between them, so every zone touches a road and can grow.
for (let x = 0; x < PLAIN_W; x += 1) {
  if (useTool("road", x, 4)) built.road += 1;
  if (useTool("road", x, 8)) built.road += 1;
}
for (const x of [1, 4, 7, 10, 13]) if (useTool("residential", x, 2)) built.residential += 1;
for (const x of [1, 4]) if (useTool("commercial", x, 6)) built.commercial += 1;
for (const x of [10, 13]) if (useTool("industrial", x, 6)) built.industrial += 1;
// One power line from the plant to both bands: an unpowered zone never grows,
// and a fixture with no growth would not exercise the stage rule.
for (let y = 3; y <= 13; y += 1) if (useTool("wire", 20, y)) built.wire += 1;
for (let x = 15; x <= 20; x += 1) if (useTool("wire", x, 2)) built.wire += 1;
for (let x = 15; x <= 20; x += 1) if (useTool("wire", x, 6)) built.wire += 1;
for (let x = 0; x < 12; x += 1) if (useTool("rail", x, 18)) built.rail += 1;
if (useTool("coal", 21, 15)) built.coal += 1;
if (useTool("police", 2, 15)) built.police += 1;
if (useTool("park", 24, 12)) built.park += 1;

test.assert(
  built.road > 20 && built.residential === 5 && built.commercial === 2 && built.industrial === 2
    && built.coal === 1 && built.police === 1 && built.rail > 5 && built.wire > 10,
  "the fixture is a real engine-built city, not a hand-written object",
);

// Run the real simulation so the zones grow and the clock advances: the save
// under test is a played city, not a freshly stamped map. `_simFrame` paces
// itself against the wall clock, which is a display concern; resetting the
// pacing stamp lets the real simulation run at test speed without changing
// one simulation rule.
micropolisSim.setSpeed(engine.Simulation.SPEED_FAST);
micropolisSim.budget.autoBudget = true;
for (let i = 0; i < 8000; i += 1) {
  micropolisSim._lastTickTime = new Date(0);
  micropolisSim.simTick();
}

// The player's last budget setting, made after the run so the automatic
// budget cannot overwrite it before the save is taken.
micropolisSim.budget.autoBudget = false;
micropolisSim.budget.cityTax = 9;
micropolisSim.budget.roadPercent = 0.9;
micropolisSim.budget.policePercent = 0.8;
micropolisSim.budget.firePercent = 0.7;

// Serialize exactly the way `serializeMicropolisCity` in the shell does.
const micropolisSave = {};
micropolisSim.save(micropolisSave);
micropolisSave.map = micropolisSave.map.map((tile) => tile.value);

test.assert(
  micropolisSave.map.length === MAP_W * MAP_H && Number.isInteger(micropolisSave._cityTime),
  "the fixture serializes through the shell's own save shape",
);
test.assert(micropolisSave._cityTime > 0, "the fixture city has been played, so its clock has moved");

// --- the real translation ----------------------------------------------------

const codecContext = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/features/bonsai-city-sim.js"), codecContext);
vm.runInContext(read("app/features/bonsai-micropolis-codec.js"), codecContext);
const sim = codecContext.window.AISystem6BonsaiSim;
const codec = codecContext.window.AISystem6BonsaiMicropolisCodec;

test.assert(codec.looksLikeMicropolisSave(micropolisSave), "the real save is recognised by the sniff the import path uses");

const imported = codec.importMicropolis(micropolisSave, { name: "Riverbend" });
const payload = imported.payload;
const SIZE = 128;
const offsetX = Math.floor((SIZE - MAP_W) / 2);
const offsetY = Math.floor((SIZE - MAP_H) / 2);
const at = (x, y) => (y + offsetY) * SIZE + (x + offsetX);
const classicId = (x, y) => micropolisSave.map[y * MAP_W + x] & codec.TILE_ID_MASK;
const T = codec.TILE_FACTS;
const inRange = (id, low, high) => id >= low && id <= high;

// --- mapping table: what carries ---------------------------------------------

test.assert(payload.format === "bonsai-city" && payload.version === 3, "the translation emits a current Bonsai payload");
test.assert(payload.size === SIZE, "the smaller classic map embeds centered in the Bonsai grid");
test.assert(payload.funds === micropolisSave.totalFunds, "funds carry across unchanged");
test.assert(payload.taxRate === micropolisSave.cityTax, "the tax rate carries across unchanged");
test.assert(
  payload.funding.roads === 90 && payload.funding.police === 80 && payload.funding.fire === 70,
  "the three classic funding dials carry across as percentages",
);
test.assert(payload.tick > 0, "the classic clock carries across as a Bonsai tick");
test.assert(imported.name === "Riverbend", "the record name carries across");

// Every tile of the real map is checked against the table, not a sample.
let checked = { water: 0, tree: 0, road: 0, rail: 0, wire: 0, zoneR: 0, zoneC: 0, zoneI: 0, grown: 0 };
for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
  const id = classicId(x, y);
  const i = at(x, y);
  if (inRange(id, T.WATER_LOW, T.WATER_HIGH)) {
    test.assertOnce?.("water-layer", payload.water[i] === 1);
    if (payload.water[i] !== 1) test.assert(false, "every classic water tile lands in the Bonsai water layer");
    checked.water += 1;
  } else if (inRange(id, T.TREE_LOW, T.TREE_HIGH)) {
    if (payload.tree[i] !== 1) test.assert(false, "every classic tree tile lands in the Bonsai tree layer");
    checked.tree += 1;
  } else if (inRange(id, T.ROAD_LOW, T.ROAD_HIGH)) {
    if (payload.road[i] !== 1) test.assert(false, "every classic road tile lands in the Bonsai road layer");
    checked.road += 1;
  } else if (inRange(id, T.RAIL_LOW, T.RAIL_HIGH)) {
    if (payload.rail[i] !== 1) test.assert(false, "every classic rail tile lands in the Bonsai rail layer");
    checked.rail += 1;
  } else if (inRange(id, T.WIRE_LOW, T.WIRE_HIGH)) {
    if (payload.wire[i] !== 1) test.assert(false, "every classic power line lands in the Bonsai wire layer");
    checked.wire += 1;
  } else if (inRange(id, T.RES_LOW, T.HOSPITAL_LOW - 1)) {
    if (payload.zone[i] !== 1) test.assert(false, "every classic residential tile lands as a Bonsai residential zone");
    checked.zoneR += 1;
    // A classic block that has actually built — a house or a grown family —
    // must arrive with a Bonsai stage, or the city imports as empty lots.
    if (id >= T.HOUSE_LOW) {
      if (payload.stage[i] < 1) test.assert(false, "a built classic block imports with a Bonsai stage");
      checked.grown += 1;
    }
  } else if (inRange(id, T.COM_LOW, T.COM_HIGH)) {
    if (payload.zone[i] !== 2) test.assert(false, "every classic commercial tile lands as a Bonsai commercial zone");
    checked.zoneC += 1;
  } else if (inRange(id, T.IND_LOW, T.IND_HIGH)) {
    if (payload.zone[i] !== 3) test.assert(false, "every classic industrial tile lands as a Bonsai industrial zone");
    checked.zoneI += 1;
  }
}
test.assert(checked.water > 0, "the fixture exercises the water rule");
test.assert(checked.tree > 0, "the fixture exercises the tree rule");
test.assert(checked.road > 20 && checked.rail > 5 && checked.wire > 5, "the fixture exercises every network rule");
test.assert(checked.zoneR > 0 && checked.zoneC > 0 && checked.zoneI > 0, "the fixture exercises all three zone rules");
test.assert(checked.grown > 0, "a grown classic block carries its build-up as a Bonsai stage");
test.assert(
  payload.facilities.some((facility) => facility.kind === "coal"),
  "a working power plant becomes a live Bonsai facility, not scenery",
);
test.assert(
  payload.facilities.some((facility) => facility.kind === "police"),
  "a working police station becomes a live Bonsai facility, not scenery",
);
// Everything outside the embedded frame is open sea, and it is marked salt so
// the Bonsai water model does not treat it as fresh water.
test.assert(
  payload.water[0] === 1 && payload.salt[0] === 1 && payload.water[SIZE * SIZE - 1] === 1,
  "the apron around the smaller classic map is open sea",
);

// --- mapping table: what has no equivalent, and is reported -------------------

const warnings = imported.warnings;
const codeNames = warnings.map((code) => String(code).split(":")[0]);
for (const required of ["terrain-flat", "population-recomputed", "ratings-not-carried", "demand-reset", "sc2k-only-systems-absent"]) {
  test.assert(codeNames.includes(required), `the import reports that "${required}" could not come across`);
}

// The classic census is not copied into the payload under any name. Bonsai
// reads population off the map, so a copied number would be a claim the
// engine never makes.
const payloadText = JSON.stringify(payload);
for (const field of ["resPop", "comPop", "indPop", "totalPop", "cityScore", "cityClass", "crimeAverage", "pollutionAverage", "landValueAverage", "resValve", "comValve", "indValve"]) {
  test.assert(
    !Object.prototype.hasOwnProperty.call(payload, field),
    `the classic "${field}" is not smuggled into the Bonsai payload as a top-level fact`,
  );
}
test.assert(micropolisSave.resPop > 0, "the fixture really does hold a classic population to lose");
test.assert(payloadText.length > 0, "the payload serializes");

// The classic model has no altitude, so no tile may claim a hill.
const flat = payload.alt.every((value, i) => value === (payload.water[i] ? 0 : 1));
test.assert(flat, "no imported tile invents an altitude the classic map never held");
test.assert(payload.slope.every((value) => value === 0), "no imported tile invents a slope");
// SC2K-only networks stay empty rather than being guessed from the road grid.
test.assert(payload.pipe.every((value) => value === 0), "no water pipe is invented; the classic model has none");
test.assert(payload.subway.every((value) => value === 0), "no subway is invented");
test.assert(payload.highway.every((value) => value === 0), "no highway is invented");
test.assert(payload.tunnel.every((value) => value === 0), "no tunnel is invented");

// Ratings sit at the engine's own starting values, not at a number derived
// from the classic ones.
const fresh = sim.createCity({ seed: 0, size: SIZE, terrainPreset: "balanced", name: "" });
test.assert(payload.eq === fresh.eq && payload.le === fresh.le, "education and life expectancy start at the engine default, not a guess");
test.assert(payload.history.length === 0, "the classic history graphs do not carry, and none are fabricated");
test.assert(payload.milestone === 0 && payload.rewardTier === 0, "classic progress does not become Bonsai progress");

// The original save rides along untouched, so nothing is lost even though
// nothing is written back.
test.assert(payload.sc2Sidecar?.kind === "micropolis-save-v1", "the untouched original rides along in the sidecar");
test.assert(
  payload.sc2Sidecar.saveData._cityTime === micropolisSave._cityTime
    && payload.sc2Sidecar.saveData.map.length === micropolisSave.map.length,
  "the sidecar copy is the whole original save, not a summary",
);

// --- the direction is one way ------------------------------------------------

const codecSource = read("app/features/bonsai-micropolis-codec.js");
test.assertNotMatches(codecSource, /exportMicropolis|toMicropolis|writeMicropolis/, "there is no reverse path: SC2K never wrote an SC1 city back");

// --- the player is told: every code has copy in both languages ----------------

const cityWindowSource = read("app/features/bonsai-city.js");
const translations = read("app/features/bonsai-translations.js");
test.assertIncludes(cityWindowSource, "reportMicropolisImport", "the import path has a report step");
// Both call sites must consume the warnings. A codec that computes an honest
// report and a caller that drops it is the failure this line exists to stop.
const consumers = cityWindowSource.match(/reportMicropolisImport\(/g) || [];
test.assert(consumers.length >= 3, "both import paths — the summoned save and the dropped file — report, not just one");
test.assertIncludes(translations, "bonsai_micropolis_report_intro", "the report has an opening line");

// Every code the codec can emit is matched to copy, in English and Chinese.
// This is what keeps a newly added warning from reaching the player as a raw
// key, and keeps a removed one from leaving dead copy behind.
const emitted = [...codecSource.matchAll(/warnings\.push\(`?"?([a-z0-9-]+)/g)].map((match) => match[1]);
test.assert(emitted.length >= 6, "the codec's warning codes are readable from its source");
for (const code of new Set(emitted)) {
  const key = `bonsai_micropolis_note_${code.replace(/-/g, "_")}`;
  const occurrences = (translations.match(new RegExp(`${key}:`, "g")) || []).length;
  test.assert(occurrences === 2, `the warning "${code}" has copy in both English and Chinese`);
}

// --- the imported city is playable, and saves as a Bonsai city ---------------

const city = sim.deserialize(payload);
test.assert(city && city.size === SIZE, "the imported payload loads into the live engine");
sim.ensureDerived(city);
test.assert(city.population > 0, "the imported city has people, counted from its own map");

// Build on it. An import that only renders is a picture, not a city. The
// spot is found on the imported map, so the proof does not depend on where
// the classic generator happened to put its river.
let spot = null;
for (let y = 0; y < SIZE - 4 && !spot; y += 1) {
  for (let x = 0; x < SIZE - 4 && !spot; x += 1) {
    let free = true;
    for (let dy = 0; dy < 4 && free; dy += 1) {
      for (let dx = 0; dx < 4 && free; dx += 1) {
        const i = (y + dy) * SIZE + (x + dx);
        if (city.water[i] || city.zone[i] || city.road[i] || city.rail[i] || city.wire[i] || city.tree[i] || city.facilityAt[i] >= 0) free = false;
      }
    }
    if (free) spot = [x, y];
  }
}
test.assert(!!spot, "the imported city has open ground to build on");
const [spotX, spotY] = spot || [0, 0];
const road = sim.applyTool(city, "road", spotX, spotY);
test.assert(road.ok, `the player can lay road on the imported city (${road.code})`);
const pipe = sim.applyTool(city, "pipe", spotX + 1, spotY);
test.assert(pipe.ok, `the player can lay the water pipe the classic city never had (${pipe.code})`);
const zone = sim.applyTool(city, "commercial", spotX + 1, spotY + 2);
test.assert(zone.ok, `the player can zone on the imported city (${zone.code})`);
sim.advanceTicks(city, 50);
test.assert(city.road[spotY * SIZE + spotX] === 1, "what the player built is on the map after the clock runs");
test.assert(city.funds < payload.funds, "building on the imported city spends its imported treasury");

// Saving again writes a Bonsai city, not a Micropolis one.
const resaved = sim.serialize(city);
test.assert(resaved.format === "bonsai-city" && resaved.version === 3, "saving the imported city writes a Bonsai save");
test.assert(resaved.road[spotY * SIZE + spotX] === 1, "the new road survives the round trip");
const reloaded = sim.deserialize(resaved);
test.assert(reloaded.road[spotY * SIZE + spotX] === 1, "the resaved city loads again with the player's work intact");

// --- determinism --------------------------------------------------------------

test.assert(
  JSON.stringify(codec.importMicropolis(micropolisSave, { name: "Riverbend" }).payload) === payloadText,
  "the same save imports to the same bytes every time",
);

test.finish();
