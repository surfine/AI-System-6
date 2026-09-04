// The classic city file (.cty) codec — one clean-room implementation shared
// by both desk toys. A synthetic city must survive a round trip byte for
// byte, the decoded file must load in the real engine and run, the loss
// codes must be honest and bilingual, and both windows must reach the same
// module through their lazy loaders. No city file of any origin is
// committed; every fixture is built here at run time.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("micropolis-cty");

const source = read("app/features/micropolis-cty-codec.js");
const shellSource = read("app/features/micropolis.js");
const config = read("app/core/config.js");
const manifest = read("tooling/runtime-manifest.mjs");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

test.assertIncludes(source, "window.AISystem6MicropolisCtyCodec", "the codec installs its global");
test.assertIncludes(source, "clean-room", "the codec states its provenance boundary");
test.assertNotMatches(source, /Math\.random|Date\.now|performance\.now|fetch\(|https?:\/\//, "the codec is headless, deterministic and offline");
test.assertNotMatches(source, /MicropolisEngine|micropolis-engine/, "the codec never reaches into the GPL engine");

const context = vm.createContext({ window: {}, TextEncoder });
vm.runInContext(source, context);
const cty = context.window.AISystem6MicropolisCtyCodec;
test.assert(cty.FILE_SIZE === 27120, "a classic city file is 27,120 bytes");
test.assert(cty.MAP_OFFSET === 3120, "the tile map starts after six history tables and the misc table");
test.assert(cty.ENCODE_LOSSES.length === 0 && cty.DECODE_LOSSES.length === 2, "encoding keeps every engine key the layout carries; decoding names the two recomputes");

// --- a real engine save, encoded and decoded ---------------------------------
const engineContext = { window: {}, console: { ...console, warn() {} } };
engineContext.window.window = engineContext.window;
vm.createContext(engineContext);
vm.runInContext("let seed = 7 >>> 0; Math.random = function () { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };", engineContext);
vm.runInContext(`${read("app/vendor/micropolis/micropolis-engine.js")}\nwindow.MicropolisEngine = MicropolisEngine;`, engineContext);
const engine = engineContext.window.MicropolisEngine;
const map = engine.MapGenerator(120, 100);
const sim = new engine.Simulation(map, engine.Simulation.LEVEL_MED, engine.Simulation.SPEED_PAUSED);
const tools = engine.createTools(map);
sim.budget.totalFunds = 123456;
sim.budget.cityTax = 11;
sim.budget.roadPercent = 0.75;
for (let x = 10; x < 30; x += 1) { const tool = tools.road; tool.doTool(x, 50, sim.blockMaps); tool.modifyIfEnoughFunding(sim.budget); }
sim.setSpeed(engine.Simulation.SPEED_FAST);
for (let i = 0; i < 400; i += 1) { sim._lastTickTime = new Date(0); sim.simTick(); }
const save = {};
sim.save(save);
save.map = save.map.map((tile) => tile.value);

const bytes = cty.encodeCty(save);
test.assert(ArrayBuffer.isView(bytes) && bytes.length === cty.FILE_SIZE, "encoding a 120x100 save gives a file of the classic size");
test.assert(cty.looksLikeCty(bytes), "the file is recognised by size");
// Big-endian, column by column: tile (x, y) sits at MAP_OFFSET + (x*100 + y)*2.
const at = (x, y) => (bytes[cty.MAP_OFFSET + (x * 100 + y) * 2] << 8) | bytes[cty.MAP_OFFSET + (x * 100 + y) * 2 + 1];
test.assert(at(15, 50) === (save.map[50 * 120 + 15] & 0xffff), "a tile is stored big-endian in column order");
const misc = 6 * 240;
const readLong = (index) => ((bytes[(misc + index) * 2] << 24) | (bytes[(misc + index) * 2 + 1] << 16) | (bytes[(misc + index) * 2 + 2] << 8) | bytes[(misc + index) * 2 + 3]) | 0;
test.assert(readLong(cty.MISC_INDEX.totalFunds) === save.totalFunds, "funds are stored as a long in the misc table");
test.assert(readLong(cty.MISC_INDEX.cityTime) === save._cityTime, "the clock is stored as a long in the misc table");
test.assert(cty.MISC_INDEX.gameLevel === 15 && ((bytes[(misc + 15) * 2] << 8) | bytes[(misc + 15) * 2 + 1]) === save._gameLevel, "the difficulty survives at its misc slot");

const decoded = cty.decodeCty(bytes);
const round = decoded.saveData;
test.assert(round.map.length === 12000 && round.map.every((value, i) => value === (save.map[i] & 0xffff)), "every tile survives the round trip with its flag bits");
test.assert(round.totalFunds === save.totalFunds && round.cityTax === save.cityTax && round._cityTime === save._cityTime, "funds, tax and clock survive");
test.assert(round._gameLevel === save._gameLevel && round._speed === save._speed, "level and speed survive");
test.assert(Math.abs(round.roadPercent - save.roadPercent) < 1 / 65536, "a funding dial survives as 16.16 fixed point");
test.assert(round.cityClass === save.cityClass && round.cityScore === save.cityScore, "class and score survive");
test.assert(round.resHist10.length === 120 && round.resHist120.length === 120 && round.resHist10.every((v, i) => v === (save.resHist10[i] | 0)), "the ten-year history survives");
test.assert(round.moneyHist120.every((v, i) => v === Math.max(-32768, Math.min(32767, Math.round(save.moneyHist120[i])))), "the long history survives, clamped to sixteen bits");
test.assert(decoded.warnings.join() === cty.DECODE_LOSSES.join(), "decoding names exactly the two recomputed facts");
test.assert(Buffer.compare(Buffer.from(cty.encodeCty(round)), Buffer.from(bytes)) === 0, "encode(decode(bytes)) is byte-identical");

// The decoded save loads in the real engine and runs.
{
  const loaded = { ...round, map: round.map.map((value) => ({ value })) };
  const map2 = new engine.GameMap(loaded.width, loaded.height);
  let threw = null; let sim2 = null;
  try { sim2 = new engine.Simulation(map2, loaded._gameLevel, engine.Simulation.SPEED_FAST, loaded); } catch (error) { threw = error; }
  test.assert(!threw, `a decoded file loads in the real engine${threw ? ` (${threw.message})` : ""}`);
  if (sim2) {
    for (let i = 0; i < 60; i += 1) { sim2._lastTickTime = new Date(0); sim2.simTick(); }
    const after = {}; sim2.save(after);
    test.assert(after._cityTime > round._cityTime, "the engine runs on the decoded city");
  }
}

// --- rejection --------------------------------------------------------------
{
  let rejected = false;
  try { cty.decodeCty(new Uint8Array(100)); } catch (error) { rejected = String(error.message).includes("file-size"); }
  test.assert(rejected, "a file of the wrong size is rejected with a structured error");
  let rejectedMap = false;
  try { cty.encodeCty({ width: 64, height: 64, map: new Array(4096).fill(0) }); } catch (error) { rejectedMap = String(error.message).includes("map-size"); }
  test.assert(rejectedMap, "only the classic 120x100 map encodes");
}

// --- wiring: one lazy module, named by both windows' loaders -----------------
test.assertIncludes(manifest, '"app/features/micropolis-cty-codec.js"', "the codec is a lazy runtime file");
test.assertMatches(config, /ensureMicropolisModule[\s\S]{0,600}"app\/features\/micropolis-cty-codec\.js"/, "the Micropolis loader names the codec");
test.assertMatches(config, /ensureBonsaiCityModule[\s\S]{0,600}"app\/features\/micropolis-cty-codec\.js"/, "the Bonsai City loader names the same codec");
test.assertIncludes(shellSource, 'accept=".cty"', "import uses one file input behind the menu command");
test.assertIncludes(shellSource, 'item("import-cty", "micropolis_import_cty")', "Import .cty lives in the File menu");
test.assertIncludes(shellSource, 'item("export-cty", "micropolis_export_cty")', "Export .cty lives in the File menu");
test.assertIncludes(shellSource, "openRecordInBonsai", "the Bonsai hand-off hook exists for lane D");
test.assertIncludes(shellSource, '"open-bonsai-city"', "the hook dispatches open-bonsai-city");
test.assertIncludes(shellSource, "decodeCty(bytes)", "the Micropolis import calls the shared codec");
test.assertIncludes(shellSource, "encodeCty(saveData)", "the Micropolis export calls the shared codec");

// --- copy: every loss code and every shell key exists in both languages ------
for (const code of cty.DECODE_LOSSES) {
  test.assertIncludes(en, `micropolis_cty_loss_${code.replace(/-/g, "_")}:`, `English loss copy for ${code}`);
  test.assertIncludes(zh, `micropolis_cty_loss_${code.replace(/-/g, "_")}:`, `Chinese loss copy for ${code}`);
}
for (const key of ["micropolis_import_cty", "micropolis_export_cty", "micropolis_cty_report_head", "micropolis_cty_imported", "micropolis_cty_exported", "micropolis_status_cty_failed"]) {
  test.assertIncludes(en, `${key}:`, `English copy exists for ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese copy exists for ${key}`);
}
test.assertNotMatches(source, /fileio|external\/micropolisjs|\.cpp|\.c\b/i, "the codec reads no upstream source file");

test.finish();
