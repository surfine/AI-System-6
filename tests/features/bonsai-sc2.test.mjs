// Bonsai City .sc2 clean-room codec contracts: RLE, container, import
// mapping, sidecar preservation, and the worker path. Every fixture is
// synthetic — built by this test at run time; no city file binary is ever
// committed (foundation contract: sc2FixturesSyntheticOnly).
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-sc2");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
vm.runInContext(read("app/features/bonsai-sc2-codec.js"), context);
vm.runInContext(read("app/features/bonsai-save-worker-manager.js"), context);
const sim = context.window.AISystem6BonsaiSim;
const codec = context.window.AISystem6BonsaiSc2Codec;
const managerFactory = context.window.AISystem6BonsaiSaveWorkerManager;

// --- Static discipline -------------------------------------------------------
const source = read("app/features/bonsai-sc2-codec.js");
test.assertIncludes(source, "window.AISystem6BonsaiSc2Codec", "the codec installs its global");
test.assertIncludes(source, "AISystem6BonsaiSc2CodecLoaded", "the codec sets its loaded flag");
test.assertNotIncludes(source, "Math.random", "the codec is deterministic");
test.assertNotMatches(source, /Date\.now|performance\.now|fetch\(|https?:\/\//, "the codec is headless and offline");
test.assertIncludes(source, "SC2k-docs", "the format facts carry their attribution");
test.assertIncludes(read("app/features/bonsai-save-worker.js"), 'importScripts("bonsai-sc2-codec.js")', "the worker loads the codec beside the sim");
test.assertIncludes(read("app/features/bonsai-save-worker.js"), "sc2-import", "the worker exposes the sc2-import operation");

// --- RLE ---------------------------------------------------------------------
const eq = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
test.assert(eq(Array.from(codec.rleDecode(Uint8Array.from([3, 9, 8, 7]))), [9, 8, 7]), "a literal packet copies its bytes");
test.assert(eq(Array.from(codec.rleDecode(Uint8Array.from([130, 5]))), [5, 5, 5]), "a repeat packet expands control minus 127 copies");
test.assert(eq(Array.from(codec.rleDecode(Uint8Array.from([2, 1, 2, 131, 0, 1, 9]))), [1, 2, 0, 0, 0, 0, 9]), "packets chain in order");
for (const bad of [[0, 1], [128, 1], [4, 1, 2]]) {
  let rejected = false;
  try { codec.rleDecode(Uint8Array.from(bad)); } catch (error) { rejected = String(error.message).includes("bonsai-sc2-invalid"); }
  test.assert(rejected, `malformed RLE input [${bad}] is rejected with a structured error`);
}
{
  // Seeded fuzz: patterned and pseudo-random buffers round-trip and the
  // encoder is canonical (same input, same bytes).
  let lcg = 1234567;
  const nextByte = () => { lcg = (Math.imul(lcg, 1103515245) + 12345) & 0x7fffffff; return (lcg >> 16) & 0xff; };
  const cases = [
    new Uint8Array(0),
    Uint8Array.from({ length: 300 }, () => 7),
    Uint8Array.from({ length: 513 }, (_, i) => i % 2 ? 1 : 2),
    Uint8Array.from({ length: 4096 }, (_, i) => (i % 11 === 0 ? 0 : nextByte())),
    Uint8Array.from({ length: 130 }, (_, i) => i),
  ];
  for (const [index, bytes] of cases.entries()) {
    const encoded = codec.rleEncode(bytes);
    test.assert(eq(Array.from(codec.rleDecode(encoded, bytes.length || 0)), Array.from(bytes)), `fuzz case ${index} round-trips through the RLE codec`);
    test.assert(eq(Array.from(codec.rleEncode(bytes)), Array.from(encoded)), `fuzz case ${index} encodes deterministically`);
  }
}
test.assert(eq(Array.from(codec.base64ToBytes(codec.bytesToBase64(Uint8Array.from([0, 1, 250, 128, 64])))), [0, 1, 250, 128, 64]), "the sidecar base64 round-trips");

// --- Synthetic city fixture --------------------------------------------------
const S = 128;
const at = (x, y) => y * S + x;
function writeI32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff; bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff; bytes[offset + 3] = value & 0xff;
}
function buildFixture() {
  const misc = new Uint8Array(4800);
  writeI32(misc, 0x000c, 1963);            // year founded
  writeI32(misc, 0x0010, 400);             // city age in days
  writeI32(misc, 0x0014, 55555);           // money
  writeI32(misc, 0x077c + 4, 9);           // residential tax, current
  writeI32(misc, 0x07e8 + 4, 6);           // commercial tax, current
  writeI32(misc, 0x0854 + 4, 3);           // industrial tax, current
  writeI32(misc, 0x0998 + 4, 80);          // police funding, current
  writeI32(misc, 0x0a04 + 4, 70);          // fire funding, current
  writeI32(misc, 0x0a70 + 4, 60);          // health funding, current
  writeI32(misc, 0x0adc + 4, 50);          // school funding, current
  writeI32(misc, 0x0b48 + 4, 45);          // college funding, current
  writeI32(misc, 0x0bb4 + 4, 90);          // road funding, current
  writeI32(misc, 0x0d64 + 4, 65);          // subway funding, current
  writeI32(misc, 0x1018, 40); writeI32(misc, 0x101c, 41);
  writeI32(misc, 0x0048, 72);              // workforce life expectancy
  writeI32(misc, 0x004c, 95);              // workforce education quotient
  writeI32(misc, 0x0020, 3);               // reward tier reached

  const altm = new Uint8Array(32768);
  const xter = new Uint8Array(16384);
  const xbld = new Uint8Array(16384);
  const xzon = new Uint8Array(16384);
  const xund = new Uint8Array(16384);
  const xbit = new Uint8Array(16384);
  for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) {
    const i = at(x, y);
    const isWater = x < 8;
    const altitude = isWater ? 3 : 5;
    const waterLevel = isWater ? 4 : 0;
    const packed = (altitude << 11) | (waterLevel << 6);
    altm[i * 2] = (packed >> 8) & 0xff; altm[i * 2 + 1] = packed & 0xff;
    if (isWater) { xter[i] = 0x30; xbit[i] = 0x80 | 0x20; }
  }
  xter[at(8, 20)] = 0x3e;                                     // waterfall
  xbit[at(60, 60)] |= 0x40;                                   // rotate flag
  for (let x = 10; x <= 30; x += 1) xbld[at(x, 10)] = 0x1d;   // road L-R
  for (let x = 10; x <= 30; x += 1) xbld[at(x, 12)] = 0x2c;   // rail
  for (let x = 10; x <= 30; x += 1) xbld[at(x, 14)] = 0x0e;   // power line
  for (let x = 12; x <= 15; x += 1) xbld[at(x, 24)] = 0x07;   // trees
  for (let x = 10; x <= 30; x += 1) xund[at(x, 16)] = 0x10;   // pipes
  for (let x = 10; x <= 30; x += 1) xund[at(x, 18)] = 0x01;   // subway
  xund[at(25, 17)] = 0x1f;                                    // crossover
  xbld[at(20, 20)] = 0x74; xzon[at(20, 20)] = 0x01;           // 1x1 R, light
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {  // 2x2 R, dense
    xbld[at(24 + dx, 20 + dy)] = 0x8c; xzon[at(24 + dx, 20 + dy)] = 0x02;
  }
  xbld[at(30, 24)] = 0x88; xzon[at(30, 24)] = 0x01;           // construction
  xbld[at(32, 24)] = 0x8a; xzon[at(32, 24)] = 0x01;           // abandoned
  xzon[at(40, 24)] = 0x09;                                    // seaport zone
  for (let dy = 0; dy < 4; dy += 1) for (let dx = 0; dx < 4; dx += 1) xbld[at(40 + dx, 40 + dy)] = 0xcf; // coal plant 4x4
  xbld[at(50, 50)] = 0xd2;                                    // police
  xbld[at(10, 30)] = 0xdc;                                    // water pump
  const cnam = new Uint8Array(32);
  cnam[0] = 0x1f;
  const title = "Bonsai Harbor";
  for (let n = 0; n < title.length; n += 1) cnam[n + 1] = title.charCodeAt(n);

  return codec.buildSc2File([
    { id: "CNAM", bytes: cnam }, { id: "MISC", bytes: misc }, { id: "ALTM", bytes: altm },
    { id: "XTER", bytes: xter }, { id: "XBLD", bytes: xbld }, { id: "XZON", bytes: xzon },
    { id: "XUND", bytes: xund }, { id: "XTXT", bytes: new Uint8Array(16384) }, { id: "XLAB", bytes: new Uint8Array(6400) },
    { id: "XMIC", bytes: (() => {
      // Slot 3 carries a police microsim: type 0xD2, one-byte stat 9, then
      // three 16-bit figures.
      const xmic = new Uint8Array(1200);
      xmic.set([0xd2, 9, 0x01, 0x2c, 0x00, 0x40, 0x00, 0x07], 3 * 8);
      return xmic;
    })() }, { id: "XTHG", bytes: new Uint8Array(480) }, { id: "XBIT", bytes: xbit },
    { id: "XTRF", bytes: new Uint8Array(4096) }, { id: "XPLT", bytes: new Uint8Array(4096) },
    { id: "XVAL", bytes: new Uint8Array(4096) }, { id: "XCRM", bytes: new Uint8Array(4096) },
    { id: "XPLC", bytes: new Uint8Array(1024) }, { id: "XFIR", bytes: new Uint8Array(1024) },
    { id: "XPOP", bytes: new Uint8Array(1024) }, { id: "XROG", bytes: new Uint8Array(1024) },
    { id: "XGRP", bytes: (() => {
      // Residents series (index 1): first monthly sample 1234.
      const xgrp = new Uint8Array(3328);
      writeI32(xgrp, 52 * 4, 1234);
      return xgrp;
    })() },
  ]);
}

const fixture = buildFixture();
const imported = codec.importSc2(fixture);
const state = sim.deserialize(imported.payload);

test.assert(imported.name === "Bonsai Harbor" && state.name === "Bonsai Harbor", "CNAM becomes the city name");
test.assert(state.size === 128, "an imported city is 128 by 128");
test.assert(state.funds === 55555 && state.taxRates.r === 9 && state.taxRates.c === 6 && state.taxRates.i === 3 && state.taxRate === 6,
  "MISC money and the three property tax rates arrive");
test.assert(state.yearFounded === 1963 && state.tick === 2000, "founding year and city age arrive; days become ticks");
test.assert(sim.dateOf(state).year === 1964, "the SC2K 300-day calendar dates an imported 400-day city");
test.assert(state.funding.police === 80 && state.funding.fire === 70 && state.funding.health === 60
  && state.funding.schools === 50 && state.funding.colleges === 45 && state.funding.roads === 90
  && state.funding.subway === 65, "the eleven budget funding lines arrive from MISC");
test.assert(state.le === 72 && state.eq === 95, "workforce LE and EQ arrive from MISC");
test.assert(state.graphs.monthly.residents[0] === 1234, "XGRP graph series seed the tiered history");
test.assert(state.rewardTier === 3, "the reached reward tier arrives from MISC");
test.assert(state.microsims.some((item) => item.kind === "police" && Array.isArray(item.raw)
  && item.raw[0] === 9 && item.raw[1] === 300 && item.raw[2] === 64 && item.raw[3] === 7),
  "XMIC records arrive with their kind and raw figures preserved");
test.assert(state.water[at(4, 40)] === 1 && state.salt[at(4, 40)] === 1 && state.waterLevel[at(4, 40)] === 4
  && state.alt[at(4, 40)] === 3, "ALTM and XTER produce water, salinity, water level, and sea floor");
test.assert(state.waterKind[at(8, 20)] === 2, "a waterfall tile is classified");
test.assert(state.rotate[at(60, 60)] === 1, "the XBIT rotate flag lands in the rotate layer");
test.assert(state.road[at(20, 10)] === 1 && state.rail[at(20, 12)] === 1 && state.wire[at(20, 14)] === 1
  && state.tree[at(13, 24)] === 1, "XBLD network and tree ranges map to layers");
test.assert(state.pipe[at(20, 16)] === 1 && state.subway[at(20, 18)] === 1 && state.pipe[at(25, 17)] === 1
  && state.subway[at(25, 17)] === 0x1f, "XUND pipes, subways, and crossovers map to the underground layers");
test.assert(state.zone[at(20, 20)] === 1 && state.density[at(20, 20)] === 1 && state.stage[at(20, 20)] === 1
  && state.buildingState[at(20, 20)] === 3, "a light 1x1 residential building imports active at stage 1");
test.assert(state.zone[at(24, 20)] === 1 && state.density[at(24, 20)] === 2 && state.stage[at(25, 21)] === 2, "a dense 2x2 building imports at stage 2");
// Ruleset 5: growable buildings land as whole lots of their catalog size.
test.assert(state.lot[at(25, 21)] === at(24, 20) + 1 && state.lot[at(24, 20)] === at(24, 20) + 1, "a dense 2x2 building imports as one 2x2 lot anchored at its corner");
test.assert(state.buildingState[at(30, 24)] === 2 && state.stage[at(30, 24)] === 1 && state.lot[at(30, 24)] === at(30, 24) + 1, "a construction id imports as a one-tile lot under construction");
test.assert(state.buildingState[at(32, 24)] === 5, "an abandoned id imports as abandoned");
test.assert(state.zone[at(40, 24)] === 6, "a seaport zone nibble maps to the seaport zone value");
test.assert(state.catalogId[at(40, 40)] === 0xcf && state.catalogId[at(43, 43)] === 0xcf, "catalogId preserves the raw XBLD id on every tile");
test.assert(state.facilities.some((item) => item.kind === "coal" && item.x === 40 && item.y === 40)
  && state.facilities.some((item) => item.kind === "police" && item.x === 50 && item.y === 50)
  && state.facilities.some((item) => item.kind === "pump"), "mapped facilities are constructed");
sim.ensureDerived(state);
test.assert(state.powerCapacity > 0, "an imported power plant powers the grid");
test.assert(state.sc2Sidecar && typeof state.sc2Sidecar.chunks.MISC === "string" && state.sc2Sidecar.chunkOrder[0] === "CNAM",
  "the preservation sidecar carries every decompressed segment");

// The imported city simulates and survives the native save round-trip.
{
  const replayA = sim.deserialize(codec.importSc2(fixture).payload);
  const replayB = sim.deserialize(codec.importSc2(fixture).payload);
  sim.advanceTicks(replayA, 50); sim.advanceTicks(replayB, 50);
  const [hashA, hashB] = await Promise.all([sim.checkpoint(replayA), sim.checkpoint(replayB)]);
  test.assert(hashA === hashB, "an imported city simulates deterministically");
  const envelope = await sim.encodeSave(replayA, { cityId: "sc2-test", name: replayA.name, createdAt: "T0", updatedAt: "T0" });
  const decoded = await sim.decodeSave(envelope);
  test.assert(await sim.checkpoint(decoded.state) === hashA, "an imported city round-trips through the v3 envelope");
  test.assert(decoded.state.sc2Sidecar.chunks.MISC === replayA.sc2Sidecar.chunks.MISC, "the sidecar survives the save round-trip");
}

// --- SCEN import: win conditions become a structured scenario ---------------
{
  const scen = new Uint8Array(56);
  scen.set([0x80, 0, 0, 0]);
  scen[0x04] = 0; scen[0x05] = 7;          // tornado
  scen[0x06] = 40; scen[0x07] = 41;        // location
  scen[0x08] = 0; scen[0x09] = 36;         // 36-month limit
  writeI32(scen, 0x0a, 25000);             // population goal
  writeI32(scen, 0x1a, 50000);             // cash goal
  const entries = codec.parseIff(fixture).map((chunk) => ({ id: chunk.id,
    bytes: codec.UNCOMPRESSED.includes(chunk.id) ? chunk.bytes : codec.rleDecode(chunk.bytes, codec.SEGMENT_SIZES[chunk.id] || 0) }));
  entries.push({ id: "SCEN", bytes: scen });
  const scenarioFile = codec.buildSc2File(entries);
  const imported = sim.deserialize(codec.importSc2(scenarioFile).payload);
  test.assert(imported.scenario?.status === "active" && imported.scenario.months === 36, "SCEN's time limit arrives");
  test.assert(imported.scenario.goals.population === 25000 && imported.scenario.goals.funds === 50000, "SCEN's goals arrive as numbers");
  test.assert(imported.scenario.disaster?.kind === "tornado" && imported.scenario.disaster.x === 40, "SCEN's scripted disaster arrives");
}

// --- Structured failure paths ------------------------------------------------
for (const [label, bytes] of [
  ["short header", fixture.slice(0, 8)],
  ["wrong magic", (() => { const bad = fixture.slice(); bad[0] = 0x58; return bad; })()],
  ["truncated chunk", fixture.slice(0, fixture.length - 40)],
]) {
  let rejected = false;
  try { codec.importSc2(bytes); } catch (error) { rejected = String(error.message).includes("bonsai-sc2-invalid"); }
  test.assert(rejected, `${label} is rejected with a structured error`);
}

// --- M7 export: the bidirectional round trip ---------------------------------
{
  const layersEqual = (a, b, name) => JSON.stringify(Array.from(a[name])) === JSON.stringify(Array.from(b[name]));
  const first = sim.deserialize(codec.importSc2(fixture).payload);
  const exported = codec.exportSc2(sim.serialize(first));
  const second = sim.deserialize(codec.importSc2(exported).payload);
  test.assert(exported[0] === 0x46 && codec.parseIff(exported).length >= 20, "the export is a well-formed FORM container");
  for (const name of ["alt", "waterLevel", "tunnel", "water", "salt", "zone", "road", "rail", "wire", "pipe", "highway", "onramp"]) {
    test.assert(layersEqual(first, second, name), `${name} survives the export round-trip`);
  }
  test.assert(second.funds === first.funds && second.yearFounded === first.yearFounded && second.tick === first.tick,
    "money, founding year, and city age survive the round trip");
  test.assert(JSON.stringify(second.taxRates) === JSON.stringify(first.taxRates)
    && JSON.stringify(second.funding) === JSON.stringify(first.funding), "tax rates and all eleven funding lines survive");
  const kinds = (state) => state.facilities.map((item) => `${item.kind}:${item.x}:${item.y}`).sort();
  test.assert(JSON.stringify(kinds(second)) === JSON.stringify(kinds(first)), "every mapped facility survives at its place");
  const rawOf = (state) => state.microsims.filter((item) => Array.isArray(item.raw)).map((item) => item.raw.join(","));
  test.assert(JSON.stringify(rawOf(second)) === JSON.stringify(rawOf(first)), "imported microsim figures survive verbatim");
  const secondExport = codec.exportSc2(sim.serialize(second));
  test.assert(exported.length === secondExport.length && exported.every((byte, index) => byte === secondExport[index]),
    "our canonical encoder is byte-stable across round trips");
}
{
  // A native city exports into the 128-square sea apron and comes back.
  const town = sim.createCity({ seed: 601, size: 64, yearFounded: 1950 });
  let pad = null;
  for (let y = 2; y < 59 && !pad; y += 1) for (let x = 2; x < 54; x += 1) {
    let clear = true;
    for (let dy = 0; dy < 4 && clear; dy += 1) for (let dx = 0; dx < 9; dx += 1) {
      const i = (y + dy) * 64 + x + dx;
      if (town.water[i] || town.alt[i] !== town.alt[y * 64 + x]) { clear = false; break; }
    }
    if (clear) pad = { x, y };
  }
  test.assert(!!pad, "the native town finds flat ground");
  const submit = (type, payload) => sim.submitCommand(town, { schemaVersion: 2, type, payload, targetTick: town.tick, clientCommandId: `${type}-${town.nextCommandSequence}` });
  test.assert(submit("place-facility", { kind: "coal", x: pad.x, y: pad.y }).accepted, "the native town builds a plant");
  test.assert(submit("build-path", { network: "road", points: [{ x: pad.x + 4, y: pad.y }, { x: pad.x + 8, y: pad.y }] }).accepted, "the native town builds a road");
  test.assert(submit("build-path", { network: "highway", points: [{ x: pad.x + 4, y: pad.y + 1 }, { x: pad.x + 7, y: pad.y + 1 }] }).accepted, "the native town builds a highway");
  test.assert(submit("build-path", { network: "onramp", points: [{ x: pad.x + 5, y: pad.y }] }).accepted, "the native town joins them with an onramp");
  sim.advanceTicks(town, 125);
  town.things.push({ kind: "ship", x: 2, y: 3, z: 0, dir: 1 });
  const bytes = codec.exportSc2(sim.serialize(town));
  const back = sim.deserialize(codec.importSc2(bytes).payload);
  const shift = 32; // (128 - 64) / 2
  test.assert(back.size === 128 && back.funds === town.funds && back.yearFounded === 1950 && back.tick === town.tick,
    "a 64-square town exports into the apron with its ledger intact");
  test.assert(back.road[(pad.y + shift) * 128 + pad.x + 4 + shift] === 1, "the road lands at the embedded offset");
  test.assert(back.highway[(pad.y + 1 + shift) * 128 + pad.x + 5 + shift] === 1 && back.highway[(pad.y + 2 + shift) * 128 + pad.x + 5 + shift] === 1,
    "the two-wide highway ribbon lands at the embedded offset");
  test.assert(back.onramp[(pad.y + shift) * 128 + pad.x + 5 + shift] === 1, "the onramp piece survives the export round-trip");
  const ship = back.things.find((thing) => thing.kind === "ship");
  test.assert(!!ship && ship.x === 2 + shift && ship.y === 3 + shift && ship.dir === 1,
    "a moving thing exports into an XTHG record and returns at the embedded offset");
  test.assert(back.facilities.some((item) => item.kind === "coal" && item.x === pad.x + shift && item.y === pad.y + shift),
    "the plant lands at the embedded offset");
  test.assert(back.water[0] === 1 && back.salt[0] === 1, "the apron is open salt water");
}

{
  // Ruleset 6: a subway tunnel under a river exports as an XUND subway piece
  // over XTER water and comes back as both, at the embedded offset.
  const town = sim.createCity({ seed: 507, size: 64, terrainPreset: "river", yearFounded: 1950 });
  let crossing = null;
  for (let y = 4; y < 60 && !crossing; y += 1) for (let x = 2; x < 52 && !crossing; x += 1) {
    const i = y * 64 + x;
    if (town.water[i] || !town.water[i + 1]) continue;
    let end = x + 1; while (end < 63 && town.water[y * 64 + end]) end += 1;
    if (end < 63) crossing = { y, from: x, to: end };
  }
  test.assert(!!crossing, "the river town offers a crossing");
  const line = sim.submitCommand(town, { schemaVersion: 2, type: "build-path", payload: { network: "subway", start: { x: crossing.from, y: crossing.y }, end: { x: crossing.to, y: crossing.y } }, targetTick: town.tick });
  test.assert(line.accepted && line.tunnelCost > 0, "the river town tunnels a subway under the water");
  const bytes = codec.exportSc2(sim.serialize(town));
  const back = sim.deserialize(codec.importSc2(bytes).payload);
  const shift = 32;
  let kept = 0; let wet = 0;
  for (let x = crossing.from; x <= crossing.to; x += 1) {
    const from = crossing.y * 64 + x; const to = (crossing.y + shift) * 128 + x + shift;
    if (back.subway[to] && back.water[to] === town.water[from]) kept += 1;
    if (town.water[from]) wet += 1;
  }
  test.assert(wet > 0 && kept === crossing.to - crossing.from + 1, `every tile of the line, ${wet} of them under water, comes back as subway over the same ground`);
  // Once in the 128 frame, the line is byte-stable across further round trips.
  const again = codec.exportSc2(sim.serialize(back));
  const third = codec.exportSc2(sim.serialize(sim.deserialize(codec.importSc2(again).payload)));
  test.assert(third.length === again.length && third.every((byte, index) => byte === again[index]), "the underwater line re-exports byte-stable");
}

{
  // Ruleset 6: SC2K has no avenue. Both halves leave as the roads they are
  // and come back as roads; the avenue layer itself is not carried.
  const town = sim.createCity({ seed: 610, size: 64, yearFounded: 1920 });
  let spot = null;
  for (let y = 2; y < 58 && !spot; y += 1) for (let x = 2; x < 50 && !spot; x += 1) {
    let flat = true; const base = town.alt[y * 64 + x];
    for (let k = 0; k < 10 && flat; k += 1) for (const dy of [0, 1]) if (town.water[(y + dy) * 64 + x + k] || town.alt[(y + dy) * 64 + x + k] !== base) flat = false;
    if (flat) spot = { x, y };
  }
  const laid = sim.submitCommand(town, { schemaVersion: 2, type: "build-path", payload: { network: "avenue", points: [{ x: spot.x, y: spot.y }, { x: spot.x + 9, y: spot.y }] }, targetTick: town.tick });
  test.assert(laid.accepted, "the sc2 town lays an avenue");
  const payload = sim.serialize(town);
  const bytes = codec.exportSc2(payload);
  const back = sim.deserialize(codec.importSc2(bytes).payload);
  let roads = 0;
  for (let x = spot.x; x <= spot.x + 9; x += 1) for (const y of [spot.y, spot.y + 1]) if (back.road[(y + 32) * 128 + x + 32] === 1) roads += 1;
  test.assert(Array.isArray(payload.avenue) && roads === 20 && back.avenue.every((value) => value === 0),
    "an avenue exports to .sc2 as its twenty road tiles and comes back as road, without the avenue layer");
}

// --- Worker manager fallback -------------------------------------------------
{
  const manager = managerFactory.createSaveWorkerManager({ sim, WorkerCtor: null });
  const viaManager = await manager.importSc2(fixture);
  test.assert(sim.canonicalStringify(viaManager.payload) === sim.canonicalStringify(imported.payload),
    "the manager's sc2-import falls back to the direct codec byte-identically");
  manager.dispose();
}

// --- Loss report: the file bytes stay; the player is told what stayed behind --
{
  const empty = sim.serialize(sim.createCity({ seed: 1, size: 64 }));
  const quiet = codec.sc2LossReport(empty);
  test.assert(Array.isArray(quiet.warnings) && quiet.warnings.length === 0, "a small city with nothing extra exports without a loss report");
  const again = codec.sc2LossReport(empty);
  test.assert(JSON.stringify(again) === JSON.stringify(quiet), "the loss report is pure");

  const hezhou = sim.serialize(sim.replayExampleCity("hezhou-1952"));
  const avenueTiles = hezhou.avenue.filter((value) => value).length;
  const hezhouReport = codec.sc2LossReport(hezhou);
  test.assert(hezhouReport.warnings.includes(`layer-dropped-avenue:${avenueTiles}`), `hezhou names every avenue tile (${avenueTiles})`);
  const hezhouBytes = codec.exportSc2(hezhou);
  const hezhouBytesAgain = codec.exportSc2(hezhou);
  test.assert(hezhouBytes.length === hezhouBytesAgain.length && hezhouBytes.every((byte, index) => byte === hezhouBytesAgain[index]), "naming the loss does not change the hezhou file");

  const brt = {
    version: 1,
    lines: [{
      id: "brt-1", planId: null, laidTick: 0, mode: "brt", color: 1,
      name: { zh: "鹤洲快线", en: "Hezhou BRT" },
      tiles: [15, 18, 16, 18, 17, 18],
      stations: [
        { x: 15, y: 18, kind: "bus-stop", name: { zh: "甲", en: "A" } },
        { x: 16, y: 18, kind: "bus-stop", name: { zh: "乙", en: "B" } },
        { x: 17, y: 18, kind: "bus-stop", name: { zh: "丙", en: "C" } },
      ],
    }],
  };
  const linedCity = sim.deserialize(hezhou);
  test.assert(sim.setTransitLines(linedCity, brt), "hezhou accepts a straight BRT sidecar");
  const lined = sim.serialize(linedCity);
  const linedReport = codec.sc2LossReport(lined);
  test.assert(linedReport.warnings.includes("lines-dropped:1") && linedReport.warnings.includes("stops-dropped:3"),
    "a flipped BRT is named as one line and three stops");

  const rich = sim.serialize(sim.createCity({ seed: 3, size: 64 }));
  rich.avenue = Array.from({ length: 64 * 64 }, () => 0);
  rich.avenue[64 * 4 + 4] = 8;
  rich.avenue[64 * 5 + 4] = 2;
  rich.transitLines = brt;
  rich.bonds = [{ principal: 10000, rate: 5 }];
  rich.ordinances = { ...(rich.ordinances || {}), salesTax: true };
  rich.things = [{ kind: "train", x: 3, y: 3 }, { kind: "airplane", x: 6, y: 6, dir: 0, z: 0 }];
  rich.facilities = [...(rich.facilities || []), { kind: "library", x: 8, y: 8 }];
  const richBytes = codec.exportSc2(rich);
  test.assert(codec.exportSc2(rich).every((byte, index) => byte === richBytes[index]), "the rich file is byte-stable");
  const richReport = codec.sc2LossReport(rich);
  const back = codec.importSc2(richBytes).payload;
  const backThings = back.things || [];
  test.assert(backThings.some((thing) => thing.kind === "airplane"), "a plane still comes back from the file");
  test.assert(!backThings.some((thing) => thing.kind === "train"), "a train does not come back");
  test.assert(!back.transitLines, "the transit sidecar does not come back");
  test.assert(!(back.avenue || []).some((value) => value), "the avenue layer does not come back");
  test.assert(!(back.bonds || []).length, "bond terms do not come back");
  test.assert(!Object.values(back.ordinances || {}).some((value) => value === true), "enacted ordinances do not come back");
  test.assert(!(back.facilities || []).some((facility) => facility.kind === "library"), "an unknown facility does not come back");
  for (const [code, count] of [
    ["layer-dropped-avenue", 2], ["lines-dropped", 1], ["stops-dropped", 3],
    ["facilities-dropped", 1], ["records-dropped-bonds", 1],
    ["records-dropped-ordinances", 1], ["records-dropped-things", 1],
  ]) test.assert(richReport.warnings.includes(`${code}:${count}`), `the rich city names ${code}:${count}`);

  const wide = { size: 160, road: new Uint8Array(160 * 160), facilities: [] };
  wide.road[0] = 1;
  test.assert(codec.sc2LossReport(wide).warnings.includes("map-cropped:1"), "a tile outside the 128 window is counted");
  test.assert(!codec.sc2LossReport({ size: 64, road: Uint8Array.from([1]) }).warnings.some((code) => code.startsWith("map-cropped")),
    "a map that fits the window is not cropped");

  const lossManager = managerFactory.createSaveWorkerManager({ sim, WorkerCtor: null, sc2Codec: codec });
  test.assert(JSON.stringify(lossManager.sc2LossReport(empty)) === JSON.stringify(quiet),
    "the manager counts the loss on the main thread");
  lossManager.dispose();

  const shell = read("app/features/bonsai-city.js");
  test.assertIncludes(shell, "function reportConversion", "the conversion report is one function");
  test.assertIncludes(shell, "text === key ? raw : text", "an unknown loss code is shown as itself");
  test.assert((shell.match(/reportSc2Export\(/g) || []).length >= 3, "both .sc2 saves report after the file is written");
  const strings = read("app/features/bonsai-translations.js");
  for (const key of ["bonsai_sc2_report_intro", "bonsai_sc2_note_layer_dropped_avenue", "bonsai_sc2_note_lines_dropped",
    "bonsai_sc2_note_stops_dropped", "bonsai_sc2_note_map_cropped", "bonsai_sc2_note_facilities_dropped",
    "bonsai_sc2_note_records_dropped_bonds", "bonsai_sc2_note_records_dropped_ordinances", "bonsai_sc2_note_records_dropped_things"]) {
    test.assert((strings.match(new RegExp(`${key}:`, "g")) || []).length === 2, `${key} has copy in both languages`);
  }
}

test.finish();
