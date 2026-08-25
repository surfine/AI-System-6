// Bonsai City v2 kernel: dynamic maps, pure previews, atomic commands,
// deterministic queues/checkpoints, independent layers, and undo/redo.
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-kernel");
const source = read("app/features/bonsai-city-sim.js");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
vm.runInContext(source, context);
const sim = context.window.AISystem6BonsaiSim;

function landTile(state, n = 0) {
  let seen = 0;
  for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
    if (state.water[y * state.size + x]) continue;
    if (seen++ === n) return { x, y };
  }
  throw new Error("no land tile");
}

function command(state, type, payload, targetTick = state.tick) {
  return { schemaVersion: 2, type, payload, targetTick, clientCommandId: `${type}-${targetTick}` };
}

function flatSpot(state) {
  for (let y = 1; y < state.size - 2; y += 1) for (let x = 1; x < state.size - 2; x += 1) {
    const a = y * state.size + x;
    const cells = [a, a + 1, a + state.size, a + state.size + 1];
    if (cells.every((i) => !state.water[i] && state.alt[i] === state.alt[a])) return { x, y };
  }
  throw new Error("no flat facility spot");
}

function bareLandTile(state) {
  for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
    const i = y * state.size + x;
    if (!state.water[i] && !state.tree[i]) return { x, y };
  }
  throw new Error("no bare land tile");
}

test.assert(sim.TICKS_PER_DAY === 5 && sim.COMMAND_SCHEMA_VERSION === 2, "v2 pins five ticks per game day and command schema 2");
test.assert(sim.canonicalStringify({ b: 1, a: 2 }) === '{"a":2,"b":1}', "canonical serialization sorts object keys");
test.assert(sim.unitCost({ type: "build-path", payload: { network: "rail" } }) === 25, "the shell can read authoritative unit prices");

// Dynamic maps and terrain presets are deterministic and remain buildable.
for (const size of sim.SUPPORTED_SIZES) for (const terrainPreset of sim.TERRAIN_PRESETS) {
  const first = sim.createCity({ seed: 42, size, terrainPreset });
  const second = sim.createCity({ seed: 42, size, terrainPreset });
  const land = first.water.reduce((sum, wet) => sum + (wet ? 0 : 1), 0);
  test.assert(first.size === size && first.alt.length === size * size, `${size} ${terrainPreset} allocates dynamic layers`);
  test.assert(land / (size * size) >= 2 / 3, `${size} ${terrainPreset} keeps at least two thirds buildable`);
  test.assert(await sim.checkpoint(first) === await sim.checkpoint(second), `${size} ${terrainPreset} is deterministic`);
}

// Preview is pure and the immediate path commit is one atomic transaction.
{
  const state = sim.createCity({ seed: 7, size: 64 });
  const a = landTile(state, 10);
  const b = { x: Math.min(state.size - 1, a.x + 3), y: a.y };
  while (state.water[b.y * state.size + b.x]) b.x -= 1;
  const request = command(state, "build-path", { network: "road", start: a, end: b });
  const before = await sim.checkpoint(state);
  const fundsBefore = state.funds;
  const preview = sim.previewCommand(state, request);
  test.assert(preview.accepted && preview.cost === preview.footprint.tiles.length * 10, "path preview reports its total price");
  test.assert(await sim.checkpoint(state) === before, "previewCommand has no side effects");
  const receipt = sim.submitCommand(state, request);
  test.assert(receipt.accepted && receipt.sequence === 1 && receipt.transactionId === "tx-1", "an immediate path receives one sequence and transaction id");
  test.assert(receipt.footprint.tiles.every(({ x, y }) => state.road[y * state.size + x]), "the whole path commits together");
  test.assert(sim.undo(state).accepted && state.funds === fundsBefore
    && receipt.footprint.tiles.every(({ x, y }) => !state.road[y * state.size + x]), "undo restores the complete path transaction");
  test.assert(sim.redo(state).accepted && receipt.footprint.tiles.every(({ x, y }) => state.road[y * state.size + x]), "redo restores the complete path transaction");
}

// A rejected multi-tile area neither charges funds nor consumes a sequence.
{
  const state = sim.createCity({ seed: 1, size: 64 });
  const before = await sim.checkpoint(state);
  const rejected = sim.submitCommand(state, command(state, "zone-area", {
    zone: "residential", density: "high", x: state.size - 1, y: state.size - 1, width: 2, height: 2,
  }));
  test.assert(!rejected.accepted && rejected.code === "bounds" && rejected.sequence === 0, "out-of-bounds areas reject without a sequence");
  test.assert(await sim.checkpoint(state) === before, "a rejected area leaves the full checkpoint unchanged");
  test.assert(!sim.submitCommand(state, { schemaVersion: 99, type: "build-path", payload: {}, targetTick: 0 }).accepted, "future command schemas are rejected");
}

// Independent infrastructure can share a tile and survives a round trip.
{
  const state = sim.createCity({ seed: 3, size: 64 });
  const spot = landTile(state, 20);
  for (const network of ["road", "wire", "pipe"]) {
    const result = sim.submitCommand(state, command(state, "build-path", { network, points: [spot] }));
    test.assert(result.accepted, `${network} can occupy its independent layer`);
  }
  const i = spot.y * state.size + spot.x;
  test.assert(state.road[i] && state.wire[i] && state.pipe[i], "road, wire, and pipe coexist without an overlay collision");
  const loaded = sim.deserialize(sim.serialize(state));
  test.assert(loaded.road[i] && loaded.wire[i] && loaded.pipe[i], "independent infrastructure survives serialization");
}

// Multi-cell facilities, terrain, and demolition use the same atomic planner.
{
  const state = sim.createCity({ seed: 12, size: 64 });
  const spot = flatSpot(state);
  const plant = sim.submitCommand(state, command(state, "place-facility", { kind: "coal", ...spot }));
  test.assert(plant.accepted && plant.footprint.tiles.length === 4 && state.facilities.length === 1, "a 2x2 facility commits as one footprint");
  const demolished = sim.submitCommand(state, command(state, "demolish-area", { x: spot.x, y: spot.y, width: 1, height: 1 }));
  test.assert(demolished.accepted && demolished.footprint.tiles.length === 4 && state.facilities.length === 0, "demolishing one occupied cell removes the whole facility atomically");
  const treeSpot = bareLandTile(state);
  const planted = sim.submitCommand(state, command(state, "terraform-area", { mode: "tree", x: treeSpot.x, y: treeSpot.y, width: 1, height: 1 }));
  test.assert(planted.accepted && state.tree[treeSpot.y * state.size + treeSpot.x], "terraform commands use their dedicated terrain layer");
}

// Queued commands apply exactly at targetTick and replay byte-identically.
{
  const state = sim.createCity({ seed: 4, size: 64 });
  const spot = landTile(state, 30);
  const queued = sim.submitCommand(state, command(state, "build-path", { network: "park", points: [spot] }, 30));
  test.assert(queued.accepted && queued.queued && queued.sequence === 1, "a future command is queued with a sequence");
  sim.advanceTicks(state, 29);
  test.assert(!state.park[spot.y * state.size + spot.x], "a queued command does not apply early");
  sim.advanceTicks(state, 1);
  test.assert(state.park[spot.y * state.size + spot.x], "a queued command applies on its target tick");
  const replay = sim.createCity({ seed: 4, size: 64 });
  sim.submitCommand(replay, command(replay, "build-path", { network: "park", points: [spot] }, 30));
  sim.advanceTicks(replay, 30);
  test.assert(await sim.checkpoint(state) === await sim.checkpoint(replay), "queued replay is byte-identical");
}

// Month boundaries follow game days, and advancing clears edit history.
{
  const state = sim.createCity({ seed: 11, size: 64 });
  const spot = landTile(state, 40);
  sim.submitCommand(state, command(state, "build-path", { network: "road", points: [spot] }));
  test.assert(state.undoStack.length === 1, "a build creates undo history");
  sim.advanceTicks(state, sim.TICKS_PER_DAY * sim.DAYS_PER_MONTH);
  const events = sim.drainEvents(state);
  test.assert(state.undoStack.length === 0 && events.some((event) => event.type === "history-cleared"), "simulation advance clears edit history with a reason");
  test.assert(events.some((event) => event.type === "budget-settled"), "a budget settles after one 25-day game month");
  test.assert(sim.dateOf(state).month === 1 && sim.dateOf(state).day === 1, "dateOf follows the 300-day SC2K calendar");
}

test.finish();
