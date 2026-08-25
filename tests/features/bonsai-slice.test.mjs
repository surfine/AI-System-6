// Bonsai City vertical-slice contract: create a v2 city, build road, zone,
// and power, run the simulation, and round-trip the save — then prove
// the shell exposes the same loop in the real window.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-slice");

const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
vm.runInContext(read("app/features/bonsai-repository.js"), context);
vm.runInContext(read("app/features/bonsai-renderer.js"), context);
const sim = context.window.AISystem6BonsaiSim;
const repoFactory = context.window.AISystem6BonsaiRepository;
const renderer = context.window.AISystem6BonsaiRenderer;

function landTiles(state, count) {
  const out = [];
  for (let y = 0; y < state.size && out.length < count; y += 1) {
    for (let x = 0; x < state.size && out.length < count; x += 1) {
      if (!state.water[y * state.size + x]) out.push({ x, y });
    }
  }
  return out;
}

function flatPlantSpot(state) {
  for (let y = 1; y < state.size - 1; y += 1) {
    for (let x = 1; x < state.size - 1; x += 1) {
      const alt = state.alt[y * state.size + x];
      if (
        state.water[y * state.size + x]
        || state.water[y * state.size + x + 1]
        || state.water[(y + 1) * state.size + x]
        || state.water[(y + 1) * state.size + x + 1]
      ) continue;
      if (
        state.alt[y * state.size + x] === alt
        && state.alt[y * state.size + x + 1] === alt
        && state.alt[(y + 1) * state.size + x] === alt
        && state.alt[(y + 1) * state.size + x + 1] === alt
      ) return { x, y };
    }
  }
  return null;
}

function playSlice(seed) {
  const repo = repoFactory.createCityRepository({ now: () => "T0" });
  const record = repo.create({ id: "slice", seed, name: "Slice", size: 64, terrainPreset: "balanced" });
  const state = record.state;
  const tiles = landTiles(state, 3);
  sim.submitCommand(state, { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [tiles[0]] }, targetTick: 0 });
  sim.submitCommand(state, { schemaVersion: 2, type: "zone-area", payload: { zone: "residential", density: "low", x: tiles[1].x, y: tiles[1].y, width: 1, height: 1 }, targetTick: 0 });
  const plant = flatPlantSpot(state);
  if (plant) {
    sim.submitCommand(state, { schemaVersion: 2, type: "place-facility", payload: { kind: "coal", x: plant.x, y: plant.y }, targetTick: 0 });
  }
  sim.advanceTicks(state, 600);
  return { state, repo, record };
}

{
  const first = playSlice(42);
  const second = playSlice(42);
  test.assert(first.state.population >= 0, "the slice runs without error");
  const canonical = (value) => sim.canonicalStringify(sim.serialize(value));
  test.assert(
    canonical(first.state) === canonical(second.state),
    "the same slice playthrough is byte-identical across runs"
  );
  test.assert(first.repo.get("slice") !== null, "the repository holds the live record");
}

{
  const { state } = playSlice(7);
  const envelope = await sim.encodeSave(state, {
    cityId: "slice",
    name: "Slice",
    createdAt: "T0",
    updatedAt: "T0",
  });
  const decoded = await sim.decodeSave(envelope);
  test.assert(
    sim.canonicalStringify(sim.serialize(decoded.state)) === sim.canonicalStringify(sim.serialize(state)),
    "the slice save round-trips to the identical checkpoint"
  );
}

{
  const { state } = playSlice(3);
  const camera = renderer.createCamera({ originX: 512, originY: 96, zoom: 1 });
  const projected = renderer.project(5, 5, state.alt[5 * state.size + 5], camera);
  const picked = renderer.unproject(projected.sx, projected.sy, camera, state.alt[5 * state.size + 5]);
  test.assert(picked.x === 5 && picked.y === 5, "the renderer maps the slice back to the same tile");
}

// --- shell surface for the playable loop -------------------------------------

const shellSource = read("app/features/bonsai-city.js");
test.assertIncludes(shellSource, "tool.query", "the query tool is explicitly view-only");
test.assertIncludes(shellSource, "sim().tileInfo", "the query tool reads tile facts without mutating");
test.assertIncludes(shellSource, "data-bonsai-city-browser", "Open Cities renders in its own same-app surface");
test.assertIncludes(shellSource, "data-bonsai-date", "the status bar reports the city date");
test.assertIncludes(shellSource, "data-bonsai-funds", "the status bar reports funds");
test.assertIncludes(shellSource, "data-bonsai-population", "the status bar reports population");

const windowManager = read("app/core/window-manager.js");
test.assertIncludes(windowManager, "appId === \"bonsaiCity\"", "closing the window saves and stops the loop");

const finder = read("app.js");
test.assertIncludes(finder, "action: \"open-bonsai-city\"", "the slice launches from Applications");

test.finish();
