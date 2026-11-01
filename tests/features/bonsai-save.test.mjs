// Bonsai City v5 save, migration, worker fallback, and repository contracts.
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-save");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
vm.runInContext(read("app/features/bonsai-repository.js"), context);
vm.runInContext(read("app/features/bonsai-save-worker-manager.js"), context);
const sim = context.window.AISystem6BonsaiSim;
const repositoryFactory = context.window.AISystem6BonsaiRepository;
const managerFactory = context.window.AISystem6BonsaiSaveWorkerManager;

const metadata = { cityId: "c1", name: "Lakeview", createdAt: "T0", updatedAt: "T1" };

function landTile(state, n = 0) {
  let seen = 0;
  for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
    if (state.water[y * state.size + x]) continue;
    if (seen++ === n) return { x, y };
  }
  throw new Error("no land tile");
}

async function signEnvelope(base) {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(sim.canonicalStringify(base)));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ...base, integrity: { algorithm: "SHA-256", canonicalization: "sorted-json-v1", digest: hex } };
}

// The frame keys the Canvas renderer asks for (ruleset 5): a standing lot
// draws its own size and look; a 2x2 lot in another state uses the 2x2 state
// frame; a 1x1 or 3x3 lot in construction or abandoned draws one-tile
// sprites on every cell; a declining one keeps its look.
function rendererBuildingFrameKeys(snapshot) {
  const prefix = ["", "r", "c", "i"];
  const stateName = ["normal", "foundation", "construction", "normal", "declined", "abandoned", "recovering"];
  return new Set((snapshot.buildings || []).map((building) => {
    const size = Math.max(1, Math.min(3, Number(building.w || 1)));
    const variant = 1 + ((Math.max(1, Number(building.variant) || 1) - 1) % 24);
    const status = stateName[building.state] || "normal";
    if (status === "normal" || (status === "declined" && size !== 2)) return `building.${prefix[building.zone]}.${size}.${variant}.normal`;
    if (size === 2) return `building.${prefix[building.zone]}.2.1.${status}`;
    return status === "abandoned" ? "catalog.abandoned" : "catalog.construction";
  }));
}

// v5 envelope is stable, tamper-evident, and round-trips every supported size.
for (const size of sim.SUPPORTED_SIZES) {
  const state = sim.createCity({ seed: 42, size, terrainPreset: "river", name: "Lakeview" });
  test.assert(!Object.prototype.hasOwnProperty.call(sim.serialize(state), "speed"), `${size} city saves exclude shell pacing state`);
  const spot = landTile(state, 10);
  sim.submitCommand(state, { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [spot] }, targetTick: 0 });
  const envelope = await sim.encodeSave(state, metadata);
  test.assert(envelope.formatVersion === 5 && envelope.payload.version === 5 && envelope.engine.rulesetVersion === 6 && envelope.payload.rulesetVersion === 6,
    `${size} save separates format v5 from ruleset 6`);
  test.assert(/^[a-f0-9]{64}$/.test(envelope.integrity.digest) && sim.validateSaveEnvelope(envelope).valid, `${size} save carries valid SHA-256 integrity`);
  const decoded = await sim.decodeSave(envelope);
  test.assert(await sim.checkpoint(decoded.state) === await sim.checkpoint(state), `${size} save round-trips byte-identically`);
  const again = await sim.encodeSave(state, metadata);
  test.assert(again.integrity.digest === envelope.integrity.digest, `${size} identical input produces the same digest`);
}

{
  const envelope = await sim.encodeSave(sim.createCity({ seed: 9, size: 64 }), metadata);
  const tampered = JSON.parse(JSON.stringify(envelope));
  tampered.payload.funds += 1;
  let rejected = false;
  try { await sim.decodeSave(tampered); } catch (error) { rejected = String(error.message).includes("bonsai-save-integrity"); }
  test.assert(rejected, "tampering fails integrity verification");
  let future = false;
  try { sim.migrateSave({ ...envelope, formatVersion: 6 }); } catch (error) { future = String(error.message).includes("too-new"); }
  test.assert(future, "future saves reject without partial migration");
}

// Ruleset 5 -> 6 (underwater subway, owner decision 2026-10-02) adds a rule,
// not a field: a signed ruleset-5 envelope keeps format v5, restamps the
// ruleset, and loads into exactly the city a ruleset-6 save of it holds.
{
  const state = sim.createCity({ seed: 42, size: 64, terrainPreset: "river", name: "Lakeview" });
  sim.submitCommand(state, { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [landTile(state, 10)] }, targetTick: 0 });
  sim.advanceTicks(state, 150);
  const payload6 = sim.serialize(state);
  const payload5 = { ...payload6, rulesetVersion: 5 };
  const base = { format: "bonsai-city", formatVersion: 5, metadata, engine: { rulesetVersion: 5, fixedTickHz: 20, ticksPerDay: 5, daysPerMonth: 25 },
    simulation: { seed: state.seed, rng: { algorithm: "mulberry32-v1", state: [state.rngState | 0] } }, payload: payload5 };
  const envelope = await signEnvelope(base);
  const frozenInput = JSON.stringify(envelope);
  const migrated = sim.migrateSave(envelope);
  test.assert(JSON.stringify(envelope) === frozenInput && migrated !== envelope, "the ruleset 5 -> 6 lift never mutates its input");
  test.assert(migrated.formatVersion === 5 && migrated.payload.version === 5 && migrated.engine.rulesetVersion === 6 && migrated.payload.rulesetVersion === 6
    && migrated.migratedFromRulesetVersion === 5 && !migrated.migratedFromFormatVersion, "a ruleset-5 envelope keeps format v5 and lifts to ruleset 6");
  test.assert(sim.canonicalStringify({ ...migrated.payload, rulesetVersion: 5 }) === sim.canonicalStringify(payload5), "the lift changes nothing but the ruleset version");
  const decoded = await sim.decodeSave(envelope);
  const fresh = sim.deserialize(payload6);
  test.assert(decoded.migratedFromRulesetVersion === 5 && decoded.migratedFromFormatVersion === null, "decode reports the ruleset lift");
  test.assert(await sim.checkpoint(decoded.state) === await sim.checkpoint(fresh) && await sim.checkpoint(sim.deserialize(payload5)) === await sim.checkpoint(fresh),
    "a ruleset-5 city loads into the same checkpoint as a fresh ruleset-6 load of it");
  sim.advanceTicks(decoded.state, 250); sim.advanceTicks(fresh, 250);
  test.assert(await sim.checkpoint(decoded.state) === await sim.checkpoint(fresh), "the lifted city plays on exactly like the ruleset-6 one");
  let future = 0;
  try { sim.migrateSave({ ...envelope, engine: { ...envelope.engine, rulesetVersion: 7 } }); } catch (error) { if (String(error.message).includes("too-new")) future += 1; }
  try { await sim.decodeSave(await signEnvelope({ ...base, engine: { ...base.engine, rulesetVersion: 7 }, payload: { ...payload6, rulesetVersion: 7 } })); } catch (error) { if (String(error.message).includes("too-new")) future += 1; }
  try { sim.deserialize({ ...payload6, rulesetVersion: 7 }); } catch (error) { if (String(error.message).includes("too-new")) future += 1; }
  test.assert(future === 3, "a save from a newer ruleset is refused as too new by migrate, decode and deserialize");
}

// A signed v1 envelope migrates purely through the chain to v5: 64 remains 64
// and tick v2=tick v1*5.
{
  const old = sim.createCity({ seed: 4, size: 64 });
  const payload = {
    format: "bonsai-city", version: 1, name: "Legacy", seed: old.seed, rngState: old.rngState,
    tick: 73, funds: old.funds, taxRate: old.taxRate, speed: 2, size: 64,
    milestone: 0, wasBroke: false, brownout: false, services: [], funding: { roads: 100, police: 100, fire: 100 },
    nextCommandSequence: 2,
    pendingCommands: [{ schemaVersion: 1, type: "road", payload: { x: 20, y: 20 }, targetTick: 80, sequence: 1, clientCommandId: "legacy-road" }],
    alt: Array.from(old.alt), water: Array.from(old.water),
    tree: Array.from(old.tree), over: Array.from(old.over), zone: Array.from(old.zone), stage: Array.from(old.stage),
    variant: Array.from(old.variant), plants: [],
  };
  const base = { format: "bonsai-city", formatVersion: 1, metadata, engine: { rulesetVersion: 1, fixedTickHz: 20 },
    simulation: { seed: old.seed, rng: { algorithm: "mulberry32-v1", state: [old.rngState] } }, payload };
  const envelope = await signEnvelope(base);
  const frozenInput = JSON.stringify(envelope);
  const migrated = sim.migrateSave(envelope);
  test.assert(JSON.stringify(envelope) === frozenInput && migrated !== envelope, "v1 migration never mutates its input");
  test.assert(migrated.formatVersion === 5 && migrated.payload.size === 64 && migrated.payload.tick === 365, "v1 migration lands on the current format and preserves size and calendar date");
  test.assert(migrated.payload.rngState === old.rngState && migrated.payload.nextCommandSequence === 2
    && migrated.payload.pendingCommands[0].targetTick === 400, "v1 migration preserves PRNG and command sequencing");
  const decoded = await sim.decodeSave(envelope);
  test.assert(decoded.migratedFromFormatVersion === 1 && decoded.state.tick === 365, "decode verifies v1 before migrating through the chain");
}

// A signed v2 envelope migrates purely to v5: the new SC2K-model layers arrive
// zero-filled, waterKind mirrors the water layer, and the founding year
// defaults to 1900.
{
  const donor = sim.createCity({ seed: 21, size: 64, terrainPreset: "lake" });
  const payload = sim.serialize(donor);
  for (const key of ["catalogId", "subway", "waterLevel", "salt", "rotate", "tunnel", "waterKind", "yearFounded", "sc2Sidecar"]) delete payload[key];
  payload.version = 2; payload.rulesetVersion = 2;
  const base = { format: "bonsai-city", formatVersion: 2, metadata, engine: { rulesetVersion: 2, fixedTickHz: 20, ticksPerDay: 5 },
    simulation: { seed: donor.seed, rng: { algorithm: "mulberry32-v1", state: [donor.rngState | 0] } }, payload };
  const envelope = await signEnvelope(base);
  const frozenInput = JSON.stringify(envelope);
  const migrated = sim.migrateSave(envelope);
  test.assert(JSON.stringify(envelope) === frozenInput && migrated !== envelope, "v2 migration never mutates its input");
  test.assert(migrated.formatVersion === 5 && migrated.migratedFromFormatVersion === 2, "v2 envelopes migrate to v5");
  const decoded = await sim.decodeSave(envelope);
  test.assert(decoded.migratedFromFormatVersion === 2 && decoded.state.yearFounded === 1900, "v2 decode lands with the default founding year");
  const count = decoded.state.size * decoded.state.size;
  let mirrored = true; let zeroed = true;
  for (let i = 0; i < count; i += 1) {
    if (decoded.state.waterKind[i] !== (decoded.state.water[i] ? 1 : 0)) mirrored = false;
    if (decoded.state.catalogId[i] || decoded.state.subway[i] || decoded.state.tunnel[i]) zeroed = false;
  }
  test.assert(mirrored && zeroed, "v2 migration zero-fills the new layers and derives waterKind from water");
}

// Repository forwards creation choices and retains deterministic live state.
{
  let clock = 1000;
  const repo = repositoryFactory.createCityRepository({ now: () => `T${clock++}` });
  const record = repo.create({ id: "r1", seed: 7, name: "Harbor", size: 64, terrainPreset: "coast" });
  test.assert(record.state.size === 64 && record.state.terrainPreset === "coast" && record.state.tick === 0, "repository forwards v2 map settings");
  const funds = record.state.funds;
  const spot = landTile(record.state, 3);
  sim.submitCommand(record.state, { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [spot] }, targetTick: 0 });
  repo.put(record);
  test.assert(repo.get("r1").state.funds === funds - 10 && repo.summary("r1").updatedAt === "T1001", "put retains live state and injected timestamps");
  repo.remove("r1");
  test.assert(repo.list().length === 0, "repository removes records");
}

// Manager returns byte-identical worker output and falls back after timeout.
{
  class CodecWorker {
    postMessage(message) {
      Promise.resolve().then(async () => {
        const value = message.operation === "encode"
          ? await sim.encodeSave(message.state, message.metadata)
          : message.operation === "encode-text"
            ? JSON.stringify(await sim.encodeSave(message.state, message.metadata))
          : message.operation === "parse-decode"
            ? await sim.decodeSave(JSON.parse(message.text))
            : await sim.decodeSave(message.envelope);
        this.onmessage({ data: { id: message.id, ok: true, value } });
      });
    }
    terminate() {}
  }
  const state = sim.createCity({ seed: 88, size: 64 });
  const manager = managerFactory.createSaveWorkerManager({ sim, WorkerCtor: CodecWorker, timeoutMs: 50 });
  const direct = await sim.encodeSave(state, metadata);
  const worked = await manager.encode(state, metadata);
  test.assert(sim.canonicalStringify(worked) === sim.canonicalStringify(direct), "worker encode is byte-identical to the direct codec");
  const decoded = await manager.decode(worked);
  test.assert(await sim.checkpoint(decoded.state) === await sim.checkpoint(state), "worker decode returns the same checkpoint");
  const parsed = await manager.parseAndDecode(JSON.stringify(worked));
  test.assert(await sim.checkpoint(parsed.state) === await sim.checkpoint(state), "worker parses and decodes imported JSON off the main thread");
  const stored = await manager.encodeForStorage(state, metadata);
  test.assert(typeof stored === "string" && JSON.parse(stored).integrity.digest === direct.integrity.digest, "storage serialization preserves the envelope and checksum");
  const storedDecoded = await manager.decode(stored);
  test.assert(await sim.checkpoint(storedDecoded.state) === await sim.checkpoint(state), "string storage reopens through the worker with identical state");
  const noWorker = managerFactory.createSaveWorkerManager({ sim, WorkerCtor: null });
  const fallbackText = await noWorker.encodeForStorage(state, metadata);
  test.assert(fallbackText === stored, "storage serialization without a worker matches the worker bytes");
  noWorker.dispose();
  manager.dispose();

  class HungWorker { postMessage() {} terminate() {} }
  const fallback = managerFactory.createSaveWorkerManager({ sim, WorkerCtor: HungWorker, timeoutMs: 1 });
  const recovered = await fallback.encode(state, metadata);
  test.assert(recovered.integrity.digest === direct.integrity.digest, "worker timeout falls back to the direct codec");
  fallback.dispose();

  const concurrentFallback = managerFactory.createSaveWorkerManager({ sim, WorkerCtor: HungWorker, timeoutMs: 1 });
  const [encodedAfterTimeout, decodedAfterTimeout] = await Promise.all([
    concurrentFallback.encode(state, metadata),
    concurrentFallback.decode(direct),
  ]);
  test.assert(
    encodedAfterTimeout.integrity.digest === direct.integrity.digest
      && await sim.checkpoint(decodedAfterTimeout.state) === await sim.checkpoint(state),
    "one worker timeout falls back every concurrent request without leaving a pending promise"
  );
  concurrentFallback.dispose();
}

const workerSource = read("app/features/bonsai-save-worker.js");
test.assertIncludes(workerSource, "importScripts(\"bonsai-city-sim.js\")", "the worker loads the same authoritative codec");
{
  let reply = null;
  const self = { AISystem6BonsaiSim: sim, postMessage(message) { reply = message; } };
  vm.runInContext(workerSource, vm.createContext({ self, importScripts() {} }));
  const state = sim.createCity({ seed: 89, size: 64 });
  const direct = await sim.encodeSave(state, metadata);
  await self.onmessage({ data: { id: 1, operation: "encode", state, metadata } });
  test.assert(reply?.ok && sim.canonicalStringify(reply.value) === sim.canonicalStringify(direct), "the actual worker entry produces the direct codec's exact envelope");
  await self.onmessage({ data: { id: 2, operation: "encode-text", state, metadata } });
  test.assert(reply?.ok && typeof reply.value === "string" && sim.canonicalStringify(JSON.parse(reply.value)) === sim.canonicalStringify(direct), "the actual worker serializes the unchanged envelope for storage");
  const storedText = reply.value;
  await self.onmessage({ data: { id: 3, operation: "parse-decode", text: storedText } });
  test.assert(reply?.ok && await sim.checkpoint(reply.value.state) === await sim.checkpoint(state), "the actual worker verifies and reopens its storage string");
}

// Original example recipes replay through the real command, tick, and codec paths.
{
  const expected = {
    // Re-pinned when a browned-out block stopped clearing its own shortage by
    // being abandoned; starter-town is deliberately power-short, so its replay
    // ends with the grid still under and the town waiting on a plant instead of
    // cycling. Re-pinned again when congestion stopped freezing vertical growth:
    // a congested tile counted as neither serviced nor supplied, so it could
    // never upgrade and declined after ten ticks. It now slows the upgrade clock
    // instead, which changes what the replay ends on. troubled-mid-size is
    // unaffected by both, and its digest has not moved.
    // Re-pinned for the v3 SC2K-model migration (M1) and again for the M3a
    // SC2K plant roster: the serialized state gains the catalogId/subway/
    // water layers, the calendar moves to 25-day months, and plant costs/
    // outputs take SC2K's player-visible figures (wind 100/4, coal 4000/200),
    // which shifts the replay's funds and every budget settlement.
    // And re-pinned once more for M4a: the R/C/I tax split, the eleven-line
    // budget with bonds and ordinances, and SC2K's free-running utilities
    // change the serialized shape and every settlement in the replay.
    // M4b-1 added demographics and graph tiers; M5-3 the reward ladder and
    // microsims; M6-1 the disaster machine (blaze layer, active-disaster
    // record, off switch). The replay's funds and metrics never move —
    // proof no emergent disaster fires inside the pinned recipes.
    // M6-2 added the newspaper; M8-1 adds the scenario record slot to the
    // serialized state. Funds and metrics remain unchanged throughout.
    // The city data windows persist the demand gauge and economy index as
    // additive fields, so a loaded city no longer resets them until the next
    // month boundary. Serialized bytes change; no tick consumes a new random
    // draw, and funds and metrics remain unchanged.
    // Ruleset 5 (lots, commutes, SC2K-scale demand and money, save v5, level
    // plains) replaced both recipes: starter-town is a healthy town two and a
    // half years in; troubled-mid-size grows, then is neglected (an island
    // neighbourhood with no commute, a dense block past the pipes, police
    // funding cut and 20% taxes in year three, late zoning under
    // construction). Re-pinned with the tuned growth, crime and money
    // constants of spec 3.7/3.8.
    // starter-town's thirtieth month draws an emergent disaster on its last
    // tick. Once disasters needed their cause (spec 3.12) the draw picks from
    // the kinds possible on that map, and it became a firestorm at (46,50),
    // out of reach of the town; population and funds do not move.
    // Re-pinned when the lot tiers moved onto the land values the formula
    // makes and the high tier became a downtown of towers on dear streets
    // (variants change; capacity does not). Then again when every building
    // had to stand on a street (ROAD_REACH 1): both recipes were laid out
    // for it, each block with a mid-block street and zoned only along its
    // streets, and the replays end smaller (starter-town 1,376 residents,
    // troubled-mid-size 1,245) with the same stories: a healthy town with no
    // problem flags, and a neglected one with a stranded neighbourhood.
    // Adding saved routing changes the digest, not the example simulation.
    // Ruleset 6 (underwater subway) re-pinned both through the ruleset
    // field alone: neither recipe lays a subway, and the ruleset-5 digests
    // below still match the same replay stamped with ruleset 5.
    "starter-town": "6d0a75d437a2a0f9bc0fca55fee770cf6d6dd16d5c8db50e04b7305f5b6bfd0c",
    "troubled-mid-size": "97b5735b2d25fa0ff8693f8adc0555629f2ea863faf70b1765ccf944a82b06d0",
    // Hezhou, 1952: Starter Town plus the bridge, the railway with two
    // stations and a paired avenue, and the one bond that funds them.
    "hezhou-1952": "947f588aa5c943dcc6258e8dc381954698b09c42209faa5a1bfe31b2b4dd9dab",
  };
  const ruleset5Digests = {
    "starter-town": "9faa037d80e5a2f6a67e1f2afc17543f586de54e21df92bf1cc51a9e5a076e7e",
    "troubled-mid-size": "185bbadc8b30049094453a2bbae8a668a7c9d2ef607500c3ca204adb162a6106",
    "hezhou-1952": "944b5ab6a44fb56a1fcfac32c04e699c4e0664173cbd421f8d49c50c318ca341",
  };
  const sha256 = async (text) => [...new Uint8Array(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  test.assert(Object.isFrozen(sim.EXAMPLES) && Object.values(sim.EXAMPLES).every((recipe) => Object.isFrozen(recipe)
    && Object.isFrozen(recipe.commandLog) && recipe.commandLog.every((item) => item.schemaVersion === 2)), "example metadata and v2 command logs are read-only");
  for (const [id, digest] of Object.entries(expected)) {
    const replayed = sim.replayExampleCity(id);
    test.assert(await sim.checkpoint(replayed) === digest, `${id} pins its deterministic final checkpoint`);
    test.assert(await sha256(sim.canonicalStringify({ ...sim.serialize(replayed), rulesetVersion: 5 })) === ruleset5Digests[id],
      `${id} replays the same city it did under ruleset 5; only the ruleset field moved`);
    const decoded = await sim.createExampleCity(id);
    test.assert(await sim.checkpoint(decoded) === digest, `${id} uses the real save round-trip without drift`);
    if (id === "troubled-mid-size") {
      const frames = rendererBuildingFrameKeys(sim.buildRenderSnapshot(replayed));
      const report = sim.cityReport(replayed);
      test.assert(frames.size === 27, "troubled-mid-size simultaneously exercises 27 renderer building/state frame keys");
      test.assert(report.population === 1245 && report.jobs === 207 && report.funds === 4201
        && report.railService.connectedStations === 1 && report.railService.passengerCapacity === 192,
        "troubled-mid-size pins its real population, finance, and rail metrics");
      const codes = new Set(report.problems.map((problem) => problem.code));
      test.assert(codes.has("no-commute") && replayed.buildings.some((building) => building.state === sim.BUILDING_STATE.ABANDONED || building.state === sim.BUILDING_STATE.DECLINING),
        "troubled-mid-size shows a stranded neighbourhood and buildings in decline");
    }
  }
}

// Real OpenStreetMap names ride in provenance (Aaron, 2026-10-02): kept
// through a save, capped, trimmed, and nothing else in the record survives.
{
  const state = sim.createCity({ seed: 77, size: 64 });
  const payload = sim.serialize(state);
  const long = "很长很长的名字".repeat(10);
  payload.provenance = {
    source: "openstreetmap", attribution: "© OpenStreetMap contributors", license: "ODbL-1.0",
    names: {
      stations: [{ x: 3, y: 4, name: "台北车站", en: "Taipei Main Station", secret: "x" }, { x: -1, y: 2, name: "bad" }, { x: 5, y: 5, name: "" }],
      streets: Array.from({ length: 300 }, (_, i) => ({ x: i % 64, y: Math.floor(i / 64), name: `路${i}` })),
      places: [{ x: 9, y: 9, kind: "suburb", name: long }, { x: 1, y: 1, kind: "city", name: "Not a district kind" }],
      extra: [{ x: 1, y: 1, name: "smuggled" }],
    },
  };
  const loaded = sim.deserialize(payload);
  const names = loaded.provenance?.names;
  test.assert(names && names.stations.length === 1 && names.stations[0].name === "台北车站" && names.stations[0].en === "Taipei Main Station" && !("secret" in names.stations[0]),
    "a station's real name and English name survive a load; unknown fields and bad tiles are dropped");
  test.assert(names.streets.length === 256, `street names are capped at 256 (got ${names?.streets.length})`);
  test.assert(names.places.length === 1 && names.places[0].kind === "suburb" && names.places[0].name.length === 40, "places keep only known kinds, names trimmed to 40 characters");
  test.assert(!("extra" in names), "lists outside stations, streets and places do not survive");
  const again = sim.deserialize(sim.serialize(loaded));
  test.assert(JSON.stringify(again.provenance.names) === JSON.stringify(names), "names round-trip through save and load unchanged");
  const bare = { ...payload, provenance: { source: "openstreetmap", names: { stations: [], streets: [], places: [] } } };
  test.assert(!("names" in sim.deserialize(bare).provenance), "empty name lists leave no names key");
}

// Ruleset 6's avenue layer is optional in the save: a city with an avenue
// writes it and gets it back, a city without one never writes the key (so
// its bytes and checkpoint are what they were: the example digests above
// were pinned before the avenue and still hold, and below a fresh city's
// canonical save is pinned too), and a hand-edited layer is
// cleaned on load: unknown values, halves off the road and unanswered halves
// are cleared; a layer of the wrong size is refused.
{
  const state = sim.createCity({ seed: 611, size: 64, yearFounded: 1920, name: "Avenue Town" });
  const plain = sim.serialize(state);
  test.assert(!("avenue" in plain), "a city without an avenue writes no avenue key");
  const plainDigest = [...new Uint8Array(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(sim.canonicalStringify(plain))))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  // The digest this city's save had before the avenue layer existed.
  test.assert(plainDigest === "88e86f5ac7d6c00b8560e4b29188101ba3a6706ca8ddbb7836645060fd546c1a", `a city without an avenue saves the bytes it did before the avenue (${plainDigest.slice(0, 12)})`);
  let row = -1; let x0 = -1;
  for (let y = 2; y < state.size - 3 && row < 0; y += 1) for (let x = 2; x < state.size - 10 && row < 0; x += 1) {
    let ok = true; const base = state.alt[y * state.size + x];
    for (let k = 0; k < 8 && ok; k += 1) for (const dy of [0, 1]) { const i = (y + dy) * state.size + x + k; if (state.water[i] || state.alt[i] !== base) ok = false; }
    if (ok) { row = y; x0 = x; }
  }
  const receipt = sim.submitCommand(state, { schemaVersion: 2, type: "build-path", payload: { network: "avenue", points: [{ x: x0, y: row }, { x: x0 + 7, y: row }] }, targetTick: state.tick });
  test.assert(receipt.accepted, "the save city lays an avenue");
  sim.advanceTicks(state, 30);
  const payload = sim.serialize(state);
  test.assert(Array.isArray(payload.avenue) && payload.avenue.length === 64 * 64 && payload.avenue.filter(Boolean).length === 16, "a city with an avenue writes all sixteen halves");
  const envelope = await sim.encodeSave(state, metadata);
  const decoded = await sim.decodeSave(envelope);
  test.assert(await sim.checkpoint(decoded.state) === await sim.checkpoint(state) && decoded.state.avenue[row * 64 + x0] === 8 && decoded.state.avenue[(row + 1) * 64 + x0] === 2,
    "the avenue survives the signed save round trip byte for byte");
  test.assert(envelope.formatVersion === 5 && envelope.engine.rulesetVersion === 6 && payload.version === 5, "the avenue rides in format 5 under ruleset 6");
  const snapshot = sim.buildRenderSnapshot(decoded.state);
  test.assert(snapshot.avenue && snapshot.avenue[row * 64 + x0 + 3] === 8, "the render snapshot passes the avenue layer through");
  // A layer that only ever held nothing writes nothing: bulldoze the whole
  // avenue and the key goes with it.
  sim.submitCommand(state, { schemaVersion: 2, type: "demolish-area", payload: { x: x0, y: row, width: 8, height: 1 }, targetTick: state.tick });
  test.assert(!("avenue" in sim.serialize(state)) && state.road[(row + 1) * 64 + x0] === 0, "bulldozing every half takes both rows and the key");
  // Hand-edited layers.
  const edited = payload.avenue.slice();
  const tile = (x, y) => y * 64 + x;
  edited[tile(x0, row)] = 3;                      // not a direction: its partner is left unanswered too
  edited[tile(x0 + 1, row + 1)] = "2";            // a string, not a number
  edited[tile(x0 + 2, row)] = 0;                  // one half removed: the other is cleared
  const offRoad = (() => { for (let i = 0; i < 64 * 64; i += 1) if (!payload.road[i] && !payload.water[i]) return i; return -1; })();
  edited[offRoad] = 4;                            // a half on bare ground
  const cleaned = sim.deserialize({ ...payload, avenue: edited });
  test.assert(cleaned.avenue[tile(x0, row)] === 0 && cleaned.avenue[tile(x0, row + 1)] === 0, "a value outside the four directions is cleared, and its partner with it");
  test.assert(cleaned.avenue[tile(x0 + 1, row)] === 0 && cleaned.avenue[tile(x0 + 1, row + 1)] === 0, "a direction written as text is cleared with its partner");
  test.assert(cleaned.avenue[tile(x0 + 2, row + 1)] === 0 && cleaned.avenue[offRoad] === 0, "an unanswered half and a half off the road are cleared");
  test.assert(cleaned.avenue[tile(x0 + 3, row)] === 8 && cleaned.avenue[tile(x0 + 3, row + 1)] === 2 && cleaned.road[tile(x0, row)] === 1,
    "the honest pairs and every road tile stay");
  let refused = "";
  try { sim.deserialize({ ...payload, avenue: payload.avenue.slice(0, 100) }); } catch (error) { refused = String(error.message); }
  test.assert(refused === "bonsai-import-invalid: layer avenue", "an avenue layer of the wrong size is refused");
  const allBad = sim.serialize(sim.deserialize({ ...plain, avenue: new Array(64 * 64).fill(16) }));
  test.assert(!("avenue" in allBad) && sim.canonicalStringify(allBad) === sim.canonicalStringify(plain), "a layer cleaned to nothing saves as a city without an avenue");
}

// A city without an avenue saves exactly as it did before avenues existed:
// the example cities' checkpoints are pinned (measured on the branch before
// the avenue layer landed, ruleset 6). Writing an all-zero layer, or any
// other change to avenue-free saves, moves these values.
{
  const pinned = { "starter-town": "6d0a75d437a2a0f9", "troubled-mid-size": "97b5735b2d25fa0f" };
  for (const [id, prefix] of Object.entries(pinned)) {
    const got = (await sim.checkpoint(sim.replayExampleCity(id))).slice(0, 16);
    test.assert(got === prefix, `an avenue-free ${id} keeps its save bytes (${got})`);
  }
}

test.finish();
