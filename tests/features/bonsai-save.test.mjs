// Bonsai City v4 save, migration, worker fallback, and repository contracts.
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

function rendererBuildingFrameKeys(snapshot) {
  const objects = [];
  const covered = new Set();
  for (const building of snapshot.buildings || []) {
    objects.push(building);
    for (let dy = 0; dy < (building.h || 1); dy += 1) for (let dx = 0; dx < (building.w || 1); dx += 1) covered.add(`${building.x + dx}:${building.y + dy}`);
  }
  for (let y = 0; y < snapshot.size; y += 1) for (let x = 0; x < snapshot.size; x += 1) {
    if (covered.has(`${x}:${y}`)) continue;
    const index = y * snapshot.size + x;
    if (snapshot.zone[index] && (snapshot.stage[index] || snapshot.buildingState[index])) {
      objects.push({ zone: snapshot.zone[index], stage: snapshot.stage[index], variant: snapshot.variant[index], state: snapshot.buildingState[index] });
    }
  }
  const prefix = ["", "r", "c", "i"];
  const stateName = ["normal", "foundation", "construction", "normal", "declined", "abandoned", "recovering"];
  return new Set(objects.map((building) => {
    const stage = Math.max(1, Math.min(3, Number(building.stage || 1)));
    const variant = 1 + ((Math.max(1, Number(building.variant) || 1) - 1) % 4);
    const status = stateName[building.state] || "normal";
    return status === "normal"
      ? `building.${prefix[building.zone]}.${stage}.${variant}.normal`
      : `building.${prefix[building.zone]}.2.1.${status}`;
  }));
}

// v4 envelope is stable, tamper-evident, and round-trips every supported size.
for (const size of sim.SUPPORTED_SIZES) {
  const state = sim.createCity({ seed: 42, size, terrainPreset: "river", name: "Lakeview" });
  test.assert(!Object.prototype.hasOwnProperty.call(sim.serialize(state), "speed"), `${size} city saves exclude shell pacing state`);
  const spot = landTile(state, 10);
  sim.submitCommand(state, { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [spot] }, targetTick: 0 });
  const envelope = await sim.encodeSave(state, metadata);
  test.assert(envelope.formatVersion === 4 && envelope.engine.rulesetVersion === 4, `${size} save separates format and ruleset v4`);
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
  try { sim.migrateSave({ ...envelope, formatVersion: 5 }); } catch (error) { future = String(error.message).includes("too-new"); }
  test.assert(future, "future saves reject without partial migration");
}

// A signed v1 envelope migrates purely through the chain to v4: 64 remains 64
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
  test.assert(migrated.formatVersion === 4 && migrated.payload.size === 64 && migrated.payload.tick === 365, "v1 migration lands on the current format and preserves size and calendar date");
  test.assert(migrated.payload.rngState === old.rngState && migrated.payload.nextCommandSequence === 2
    && migrated.payload.pendingCommands[0].targetTick === 400, "v1 migration preserves PRNG and command sequencing");
  const decoded = await sim.decodeSave(envelope);
  test.assert(decoded.migratedFromFormatVersion === 1 && decoded.state.tick === 365, "decode verifies v1 before migrating through the chain");
}

// A signed v2 envelope migrates purely to v4: the new SC2K-model layers arrive
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
  test.assert(migrated.formatVersion === 4 && migrated.migratedFromFormatVersion === 2, "v2 envelopes migrate to v4");
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
    "starter-town": "d528ce9e7e553ba7109a172850bf955b8fc4c78dd8126f0e6d381d7b8abe6b35",
    // The SC2K 4x4 coal pad (save rule 3.1): the troubled recipe's plant
    // moves west of the tower and its main wire runs five tiles longer, so
    // funds fall by $20; facility records carry their footprint from now on.
    "troubled-mid-size": "ce324b2e5112ebb167e57e1cdda05aa4bcf4c82ad6f15ae4a2d7c0df8c7cc608",
  };
  test.assert(Object.isFrozen(sim.EXAMPLES) && Object.values(sim.EXAMPLES).every((recipe) => Object.isFrozen(recipe)
    && Object.isFrozen(recipe.commandLog) && recipe.commandLog.every((item) => item.schemaVersion === 2)), "example metadata and v2 command logs are read-only");
  for (const [id, digest] of Object.entries(expected)) {
    const replayed = sim.replayExampleCity(id);
    test.assert(await sim.checkpoint(replayed) === digest, `${id} pins its deterministic final checkpoint`);
    const decoded = await sim.createExampleCity(id);
    test.assert(await sim.checkpoint(decoded) === digest, `${id} uses the real save round-trip without drift`);
    if (id === "troubled-mid-size") {
      const frames = rendererBuildingFrameKeys(sim.buildRenderSnapshot(replayed));
      const report = sim.cityReport(replayed);
      test.assert(frames.size === 26, "troubled-mid-size simultaneously exercises 26 renderer building/state frame keys");
      test.assert(report.population === 576 && report.jobs === 692 && report.funds === 16812
        && report.railService.connectedStations === 1 && report.railService.passengerCapacity === 132
        && report.railService.roadTrafficRelief === 666, "troubled-mid-size pins its real population, finance, and rail metrics");
    }
  }
}

test.finish();
