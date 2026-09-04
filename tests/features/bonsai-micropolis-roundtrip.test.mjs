// Two-way save interop: the round-trip properties.
//
// Bonsai summons Micropolis cities and can send a city back; both directions
// are lossy and report the loss. This contract is the acceptance of that
// promise, measured on real cities:
//   (a) a played Micropolis city (built and run by the vendored engine)
//       -> Bonsai -> Micropolis keeps every mapped tile family, the flag
//       bits that mean something, and the ledger;
//   (b) a native Bonsai city -> Micropolis -> Bonsai keeps its networks,
//       water, trees, and zones inside the crop window, with a
//       deterministic loss report;
//   (c) the exported record loads in the real engine and runs;
//   plus the worker entry and the shape tables the exporter stands on,
//   confirmed against what the engine itself writes.
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-micropolis-roundtrip");

// --- the real engine, seeded ------------------------------------------------

function engineContext() {
  const context = { window: {}, console: { ...console, warn() {} } };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(`
    let seed = 99 >>> 0;
    Math.random = function seededRandom() {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  `, context);
  vm.runInContext(`${read("app/vendor/micropolis/micropolis-engine.js")}\nwindow.MicropolisEngine = MicropolisEngine;`, context);
  return context.window.MicropolisEngine;
}
const engine = engineContext();
const MAP_W = 120;
const MAP_H = 100;
const MASK = 0x3ff;
const FLAG_MASK = 0xfc00;

const bonsaiContext = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/features/bonsai-city-sim.js"), bonsaiContext);
vm.runInContext(read("app/features/bonsai-micropolis-codec.js"), bonsaiContext);
vm.runInContext(read("app/features/bonsai-micropolis-export.js"), bonsaiContext);
const sim = bonsaiContext.window.AISystem6BonsaiSim;
const codec = bonsaiContext.window.AISystem6BonsaiMicropolisCodec;
const exporter = bonsaiContext.window.AISystem6BonsaiMicropolisExport;
const T = codec.TILE_FACTS;
const F = exporter.FLAG_BITS;

// --- the shape tables are what the engine writes -----------------------------
// Every id the exporter chooses by neighbour mask is checked against a tile
// the real tools lay down, so the tables stay facts, not recollection.
{
  const map = new engine.GameMap(MAP_W, MAP_H);
  const probe = new engine.Simulation(map, engine.Simulation.LEVEL_EASY, engine.Simulation.SPEED_PAUSED);
  const tools = engine.createTools(map);
  probe.budget.totalFunds = 9000000;
  const use = (id, x, y) => { const tool = tools[id]; tool.doTool(x, y, probe.blockMaps); tool.modifyIfEnoughFunding(probe.budget); return tool.result === tool.TOOLRESULT_OK; };
  // Every mask 1..15 as a small cross around (cx, cy).
  let checked = 0;
  for (let mask = 1; mask < 16; mask += 1) for (const [layer, offset] of [["road", 0], ["rail", exporter.RAIL_OFFSET], ["wire", exporter.WIRE_OFFSET]]) {
    const cx = 4 + (mask % 8) * 6;
    const cy = 4 + Math.floor(mask / 8) * 6 + (layer === "road" ? 0 : layer === "rail" ? 20 : 40);
    use(layer, cx, cy);
    if (mask & 1) use(layer, cx, cy - 1);
    if (mask & 2) use(layer, cx + 1, cy);
    if (mask & 4) use(layer, cx, cy + 1);
    if (mask & 8) use(layer, cx - 1, cy);
    const expected = exporter.ROAD_BY_MASK[mask] + offset;
    if ((map.getTileValue(cx, cy) & MASK) !== expected) test.assert(false, `${layer} mask ${mask}: engine wrote ${map.getTileValue(cx, cy) & MASK}, the exporter table says ${expected}`);
    checked += 1;
  }
  test.assert(checked === 45, "the road, rail and wire shape tables match the engine for every neighbour mask");
  for (const [kind, x, y] of [["coal", 60, 60], ["nuclear", 70, 60], ["fire", 80, 60], ["police", 90, 60], ["stadium", 60, 70], ["port", 70, 70], ["airport", 82, 72]]) {
    use(kind, x, y);
    const family = exporter.FACILITY_FAMILY[kind] || exporter.CATALOG_FAMILY[kind] || (kind === "port" ? exporter.PORT_FAMILY : exporter.AIRPORT_FAMILY);
    let ok = true;
    for (let dy = 0; dy < family.side; dy += 1) for (let dx = 0; dx < family.side; dx += 1) {
      const raw = map.getTile(x - 1 + dx, y - 1 + dy).getRawValue();
      if ((raw & MASK) !== family.base + dy * family.side + dx) ok = false;
      if (dx === 1 && dy === 1 && !(raw & F.ZONEBIT)) ok = false;
    }
    test.assert(ok, `the ${kind} family base and footprint match what the engine builds`);
  }
  for (const [tool, base, center, x] of [["residential", T.RES_LOW, T.RES_EMPTY_CENTER, 100], ["commercial", T.COM_LOW, T.COM_EMPTY_CENTER, 104], ["industrial", T.IND_LOW, T.IND_EMPTY_CENTER, 108]]) {
    use(tool, x, 60);
    test.assert((map.getTileValue(x, 60) & MASK) === center && (map.getTileValue(x - 1, 59) & MASK) === base, `an empty ${tool} block matches the engine's family`);
  }
}

// --- (a) a played Micropolis city goes out and comes back ----------------------

const gameMap = engine.MapGenerator(MAP_W, MAP_H);
const played = new engine.Simulation(gameMap, engine.Simulation.LEVEL_EASY, engine.Simulation.SPEED_PAUSED);
const playedTools = engine.createTools(gameMap);
played.budget.totalFunds = 500000;
const isClassicWater = (x, y) => { const v = gameMap.getTileValue(x, y) & MASK; return v >= 2 && v <= 20; };
const PLAIN_W = 26; const PLAIN_H = 20; let plain = null;
for (let y = 1; y + PLAIN_H < MAP_H - 1 && !plain; y += 1) for (let x = 1; x + PLAIN_W < MAP_W - 1 && !plain; x += 1) {
  let clear = true;
  for (let dy = 0; dy < PLAIN_H && clear; dy += 1) for (let dx = 0; dx < PLAIN_W && clear; dx += 1) if (isClassicWater(x + dx, y + dy)) clear = false;
  if (clear) plain = [x, y];
}
test.assert(!!plain, "the generated map offers a plain for the fixture town");
const [plainX, plainY] = plain || [1, 1];
const useTool = (id, x, y) => { const tool = playedTools[id]; tool.doTool(plainX + x, plainY + y, played.blockMaps); tool.modifyIfEnoughFunding(played.budget); return tool.result === tool.TOOLRESULT_OK; };
for (let y = 0; y < PLAIN_H; y += 1) for (let x = 0; x < PLAIN_W; x += 1) useTool("bulldozer", x, y);
for (let x = 0; x < PLAIN_W; x += 1) { useTool("road", x, 4); useTool("road", x, 8); }
for (const x of [1, 4, 7, 10, 13]) useTool("residential", x, 2);
for (const x of [1, 4]) useTool("commercial", x, 6);
for (const x of [10, 13]) useTool("industrial", x, 6);
for (let y = 3; y <= 13; y += 1) useTool("wire", 20, y);
for (let x = 15; x <= 20; x += 1) { useTool("wire", x, 2); useTool("wire", x, 6); }
for (let x = 0; x < 12; x += 1) useTool("rail", x, 18);
useTool("coal", 21, 15); useTool("police", 2, 15); useTool("park", 24, 12);
played.setSpeed(engine.Simulation.SPEED_FAST);
played.budget.autoBudget = true;
for (let i = 0; i < 8000; i += 1) { played._lastTickTime = new Date(0); played.simTick(); }
played.budget.autoBudget = false;
played.budget.cityTax = 9; played.budget.roadPercent = 0.9; played.budget.policePercent = 0.8; played.budget.firePercent = 0.7;
const original = {};
played.save(original);
original.map = original.map.map((tile) => tile.value);
test.assert(original.resPop > 0 && original._cityTime > 0, "the fixture is a played city with people and a moved clock");

const inbound = codec.importMicropolis(original, { name: "Riverbend" });
const city = sim.deserialize(inbound.payload);
sim.ensureDerived(city);
const offsetX = Math.floor((128 - MAP_W) / 2);
const offsetY = Math.floor((128 - MAP_H) / 2);
const outbound = exporter.exportMicropolis(sim.serialize(city), { name: "Riverbend", powered: city.powered, window: { x: offsetX, y: offsetY }, cityId: "city-1", exportedAt: "2026-09-03T00:00:00.000Z" });
const back = outbound.saveData;
test.assert(back.width === MAP_W && back.height === MAP_H && back.map.length === MAP_W * MAP_H, "the city comes back at the classic size");

const family = (id) => (id >= 2 && id <= 20 ? "water" : id >= 21 && id <= 43 ? "tree" : id >= 64 && id <= 206 ? "road" : id >= 208 && id <= 222 ? "wire"
  : id >= 224 && id <= 238 ? "rail" : id >= 240 && id <= 404 ? "res" : id >= 405 && id <= 413 ? "hospital" : id >= 414 && id <= 422 ? "church"
  : id >= 423 && id <= 611 ? "com" : id >= 612 && id <= 692 ? "ind" : id >= 693 && id <= 708 ? "port" : id >= 709 && id <= 744 ? "airport"
  : id >= 745 && id <= 760 ? "coal" : id >= 761 && id <= 769 ? "fire" : id >= 770 && id <= 778 ? "police" : id >= 779 && id <= 810 ? "stadium"
  : id >= 811 && id <= 826 ? "nuclear" : id === 840 ? "fountain" : id === 0 ? "dirt" : `other:${id}`);
// Traffic frames repeat the sixteen road shapes; the shape is the fact.
const roadShape = (id) => (id >= 64 && id <= 206 ? 64 + ((id - 64) & 15) : id);
const MAPPED = ["road", "wire", "rail", "res", "com", "ind", "coal", "police"];
const tally = {};
const bump = (key) => { tally[key] = (tally[key] || 0) + 1; };
let familyMismatch = 0;
for (let i = 0; i < MAP_W * MAP_H; i += 1) {
  const a = original.map[i]; const b = back.map[i];
  const fa = family(a & MASK); const fb = family(b & MASK);
  if (fa !== fb) { familyMismatch += 1; continue; }
  bump(`${fa}:tiles`);
  if ((fa === "road" ? roadShape(a & MASK) === roadShape(b & MASK) : (a & MASK) === (b & MASK))) bump(`${fa}:id-equal`);
  const meaning = F.ZONEBIT | F.CONDBIT | F.BURNBIT;
  if ((a & meaning) === (b & meaning)) bump(`${fa}:zone-cond-burn-equal`);
  if ((a & F.BULLBIT) === (b & F.BULLBIT)) bump(`${fa}:bull-equal`);
}
test.assert(familyMismatch === 0, `every tile keeps its family on the way out and back (${familyMismatch} changed)`);
for (const name of MAPPED) {
  test.assert(tally[`${name}:tiles`] > 0, `the fixture exercises the ${name} family (${tally[`${name}:tiles`] || 0} tiles)`);
  test.assert(tally[`${name}:id-equal`] === tally[`${name}:tiles`], `${name}: every tile id is equal (${tally[`${name}:id-equal`] || 0}/${tally[`${name}:tiles`]})`);
  test.assert(tally[`${name}:zone-cond-burn-equal`] === tally[`${name}:tiles`], `${name}: ZONEBIT, CONDBIT and BURNBIT are equal on every tile`);
}
for (const name of ["road", "wire", "rail", "coal", "police"]) {
  test.assert(tally[`${name}:bull-equal`] === tally[`${name}:tiles`], `${name}: BULLBIT is equal on every tile`);
}
// Water, woods and dirt keep their family; the exact edge frame and the
// bulldoze bit on a shore or a bare lot are drawing state, reported as a
// number here, never claimed as preserved.
test.ok(`preserved by family, not by id: water ${tally["water:id-equal"] || 0}/${tally["water:tiles"]}, tree ${tally["tree:id-equal"] || 0}/${tally["tree:tiles"]}, dirt ${tally["dirt:id-equal"] || 0}/${tally["dirt:tiles"]}`);
test.ok(`BULLBIT on zone tiles follows the classic scan state: res ${tally["res:bull-equal"] || 0}/${tally["res:tiles"]}, com ${tally["com:bull-equal"] || 0}/${tally["com:tiles"]}, ind ${tally["ind:bull-equal"] || 0}/${tally["ind:tiles"]}`);
test.assert(back.totalFunds === original.totalFunds, "funds go out and come back unchanged");
test.assert(back.cityTax === original.cityTax, "the tax rate goes out and comes back unchanged");
test.assert(back._cityTime === original._cityTime, "the clock goes out and comes back unchanged");
test.assert(back.roadPercent === 0.9 && back.policePercent === 0.8 && back.firePercent === 0.7, "the three funding dials go out and come back unchanged");
test.assert(back.provenance.from === "bonsai-city" && back.provenance.cityId === "city-1" && back.provenance.exportedAt === "2026-09-03T00:00:00.000Z", "the record says where it came from, with the caller's clock");
test.assert(!outbound.warnings.some((code) => code.startsWith("zone-tiles-unblocked") || code.startsWith("map-cropped") || code.startsWith("tiles-without-equivalent")), `an imported city goes back whole (${outbound.warnings.join(", ")})`);
test.assert(outbound.warnings.includes("population-recomputed") && outbound.warnings.includes("progress-not-carried"), "the report says what the classic model recounts");
for (const code of outbound.warnings) test.assert(exporter.WARNING_CODES.includes(code.split(":")[0]), `"${code}" is a declared warning code`);
test.assert(
  JSON.stringify(exporter.exportMicropolis(sim.serialize(city), { name: "Riverbend", powered: city.powered, window: { x: offsetX, y: offsetY }, cityId: "city-1", exportedAt: "2026-09-03T00:00:00.000Z" })) === JSON.stringify(outbound),
  "the same city exports to the same bytes every time",
);

// --- (c) the exported record loads in the engine and runs --------------------
{
  const engine2 = engineContext();
  // The engine mutates the history arrays it is handed, so it gets a copy.
  const loaded = { ...JSON.parse(JSON.stringify(back)), map: back.map.map((value) => ({ value })) };
  const map2 = new engine2.GameMap(loaded.width, loaded.height);
  let sim2 = null; let threw = null;
  try { sim2 = new engine2.Simulation(map2, loaded._gameLevel, engine2.Simulation.SPEED_FAST, loaded); } catch (error) { threw = error; }
  test.assert(!threw && sim2, `the exported record loads in the real engine without throwing${threw ? ` (${threw.message})` : ""}`);
  if (sim2) {
    for (let i = 0; i < 120; i += 1) { sim2._lastTickTime = new Date(0); sim2.simTick(); }
    const after = {}; sim2.save(after);
    test.assert(after._cityTime > back._cityTime, "the engine runs 120 ticks on the exported city");
    test.assert(after.resPop > 0, "the engine counts people on the exported city");
    test.assert(after.totalFunds !== undefined && Number.isFinite(after.totalFunds), "the ledger stays a number after the run");
  }
}

// --- (b) a native Bonsai city goes to Micropolis and comes back ---------------
{
  const town = sim.createCity({ seed: 601, size: 128, terrainPreset: "balanced", name: "Cedar Flats" });
  let pad = null;
  for (let y = 8; y < 116 && !pad; y += 1) for (let x = 8; x < 112 && !pad; x += 1) {
    let clear = true;
    for (let dy = 0; dy < 12 && clear; dy += 1) for (let dx = 0; dx < 16; dx += 1) {
      const i = (y + dy) * 128 + x + dx;
      if (town.water[i] || town.alt[i] !== town.alt[y * 128 + x]) { clear = false; break; }
    }
    if (clear) pad = { x, y };
  }
  test.assert(!!pad, "the native town finds flat ground");
  if (!pad) pad = { x: 40, y: 40 };
  const submit = (type, payload) => sim.submitCommand(town, { schemaVersion: 2, type, payload, targetTick: town.tick, clientCommandId: `${type}-${town.nextCommandSequence}` }).accepted;
  submit("demolish-area", { x: pad.x, y: pad.y, width: 16, height: 12 });
  test.assert(submit("build-path", { network: "road", points: [{ x: pad.x, y: pad.y + 3 }, { x: pad.x + 15, y: pad.y + 3 }] }), "the native town lays a road");
  test.assert(submit("build-path", { network: "rail", points: [{ x: pad.x, y: pad.y + 11 }, { x: pad.x + 15, y: pad.y + 11 }] }), "the native town lays a rail");
  test.assert(submit("build-path", { network: "wire", points: [{ x: pad.x + 14, y: pad.y + 4 }, { x: pad.x + 14, y: pad.y + 10 }] }), "the native town strings a power line");
  test.assert(submit("zone-area", { zone: "residential", density: "low", x: pad.x, y: pad.y, width: 6, height: 3 }), "the native town zones two residential blocks");
  test.assert(submit("zone-area", { zone: "commercial", density: "high", x: pad.x + 7, y: pad.y, width: 3, height: 3 }), "the native town zones a commercial block");
  test.assert(submit("zone-area", { zone: "industrial", density: "low", x: pad.x, y: pad.y + 4, width: 3, height: 3 }), "the native town zones an industrial block");
  test.assert(submit("zone-area", { zone: "residential", density: "low", x: pad.x + 4, y: pad.y + 4, width: 2, height: 2 }), "the native town zones a plot too small for the classic block");
  test.assert(submit("place-facility", { kind: "coal", x: pad.x + 8, y: pad.y + 5 }), "the native town builds a coal plant");
  test.assert(submit("place-facility", { kind: "wind", x: pad.x + 13, y: pad.y + 8 }), "the native town builds a wind turbine the classic model lacks");
  test.assert(submit("build-path", { network: "pipe", points: [{ x: pad.x, y: pad.y + 9 }, { x: pad.x + 5, y: pad.y + 9 }] }), "the native town lays a pipe the classic model lacks");
  sim.advanceTicks(town, 125);
  const before = sim.serialize(town);
  const sent = exporter.exportMicropolis(before, { name: "Cedar Flats", powered: town.powered });
  const win = sent.details.window;
  test.assert(win.width === 120 && win.height === 100 && pad.x >= win.x && pad.x + 16 <= win.x + 120 && pad.y >= win.y && pad.y + 12 <= win.y + 100, "the crop window centres on the town");
  const returned = codec.importMicropolis(sent.saveData, { name: "Cedar Flats" }).payload;
  // Returned tiles sit in the 128-square at the same place they left from:
  // the crop origin moves them, and the importer's centring moves them back.
  const shiftX = -win.x + Math.floor((128 - 120) / 2);
  const shiftY = -win.y + Math.floor((128 - 100) / 2);
  let compared = 0; let lost = { road: 0, rail: 0, wire: 0, water: 0, tree: 0, zone: 0 };
  for (let y = win.y; y < win.y + 100; y += 1) for (let x = win.x; x < win.x + 120; x += 1) {
    const from = y * 128 + x; const to = (y + shiftY) * 128 + (x + shiftX);
    compared += 1;
    for (const layer of ["road", "rail", "wire", "water", "tree"]) if (before[layer][from] !== returned[layer][to]) lost[layer] += 1;
    const inSmallPlot = x >= pad.x + 4 && x < pad.x + 6 && y >= pad.y + 4 && y < pad.y + 6;
    if (!inSmallPlot && before.zone[from] !== returned.zone[to]) lost.zone += 1;
  }
  test.assert(compared === 12000, "every tile of the crop window is compared");
  for (const layer of ["road", "rail", "wire", "water", "tree"]) test.assert(lost[layer] === 0, `the ${layer} layer is equal inside the crop window (${lost[layer]} differ)`);
  test.assert(lost.zone === 0, `zones that fit a classic block are equal per tile (${lost.zone} differ)`);
  test.assert(returned.facilities.some((item) => item.kind === "coal" && item.x === pad.x + 8 + shiftX && item.y === pad.y + 5 + shiftY), "the coal plant comes back where it stood");
  test.assert(!returned.facilities.some((item) => item.kind === "wind"), "the wind turbine has no classic twin and does not come back");
  test.assert(sent.warnings.includes("zone-tiles-unblocked:4"), `the four tiles of the small plot are reported (${sent.warnings.join(", ")})`);
  test.assert(sent.warnings.includes("facilities-without-equivalent:1") && sent.details.facilityKinds.wind === 1, "the turbine is reported by kind");
  test.assert(sent.warnings.some((code) => code.startsWith("layer-dropped-pipe:")), "the pipe layer is reported as dropped");
  test.assert(sent.warnings.includes("altitude-flattened"), "the hills are reported as flattened");
  test.assert(JSON.stringify(exporter.exportMicropolis(before, { name: "Cedar Flats", powered: town.powered }).warnings) === JSON.stringify(sent.warnings), "the loss report is deterministic");
  const cropped = exporter.exportMicropolis(before, { name: "Cedar Flats", window: { x: 0, y: 0 } });
  test.assert(cropped.details.window.x === 0 && cropped.details.window.y === 0, "the caller may move the crop window");
  test.assert(cropped.warnings.some((code) => code.startsWith("map-cropped:")), "content outside the window is reported as cropped");
  const small = sim.createCity({ seed: 7, size: 64, terrainPreset: "balanced", name: "Small" });
  const embedded = exporter.exportMicropolis(sim.serialize(small), { name: "Small" });
  test.assert(embedded.details.window.embedX === 28 && embedded.details.window.embedY === 18 && (embedded.saveData.map[0] & MASK) === 2, "a 64-square city embeds centred in an apron of open water");
}

// --- the worker entry carries both operations ---------------------------------
{
  const workerSource = read("app/features/bonsai-save-worker.js");
  test.assertIncludes(workerSource, "importScripts(\"bonsai-micropolis-export.js\")", "the worker loads the exporter");
  test.assertIncludes(workerSource, "\"micropolis-export\"", "the worker knows the export operation");
  const replies = [];
  const self = {
    AISystem6BonsaiSim: sim, AISystem6BonsaiSc2Codec: {}, AISystem6BonsaiMicropolisCodec: codec, AISystem6BonsaiMicropolisExport: exporter,
    postMessage(message) { replies.push(message); },
  };
  vm.runInContext(workerSource, vm.createContext({ self, importScripts() {} }));
  await self.onmessage({ data: { id: 1, operation: "micropolis-export", payload: sim.serialize(city), options: { name: "Riverbend", powered: Array.from(city.powered), window: { x: offsetX, y: offsetY }, cityId: "city-1", exportedAt: "2026-09-03T00:00:00.000Z" } } });
  await self.onmessage({ data: { id: 2, operation: "micropolis-import", record: original, options: { name: "Riverbend" } } });
  test.assert(replies[0]?.ok && JSON.stringify(replies[0].value) === JSON.stringify(outbound), "the worker's export equals the direct exporter's bytes");
  test.assert(replies[1]?.ok && JSON.stringify(replies[1].value.payload) === JSON.stringify(inbound.payload), "the worker's import equals the direct importer's bytes");
  const managerSource = read("app/features/bonsai-save-worker-manager.js");
  test.assertIncludes(managerSource, "exportMicropolis(payload, options)", "the manager exposes the export operation");
  test.assertIncludes(managerSource, "importMicropolis(record, options)", "the manager exposes the import operation");
}

// --- lazy wiring: named by the Bonsai loader, listed in the manifest ----------
{
  const manifest = read("tooling/runtime-manifest.mjs");
  const config = read("app/core/config.js");
  for (const path of ["app/features/bonsai-micropolis-export.js", "app/features/micropolis-cty-codec.js"]) {
    test.assertIncludes(manifest, `"${path}"`, `${path} is a lazy module`);
    test.assertIncludes(config, `"${path}"`, `${path} is named by the Bonsai City loader`);
  }
}

test.finish();
