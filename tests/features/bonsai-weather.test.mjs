// Bonsai City deterministic weather (clean-room SC2K MISC weather).
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-weather");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
const sim = context.window.AISystem6BonsaiSim;

test.assert(Array.isArray(sim.WEATHER_TYPES) && sim.WEATHER_TYPES.length === 12, "the sim exposes the 12 SC2K weather types");

// A city at a fixed seed reproduces the same forecast across ticks.
const city = sim.createCity({ seed: 12345, size: 64, terrainPreset: "balanced", yearFounded: 1900 });
const w0 = sim.weatherOf(city);
const w0b = sim.weatherOf({ ...city });
test.assert(w0.type === w0b.type && w0.temperature === w0b.temperature && w0.wind === w0b.wind, "weather is a pure function of seed+date (deterministic)");

// Advancing hundreds of ticks changes the weather but stays in the type set.
const seen = new Set();
let t = city;
for (let i = 0; i < 3000; i += 1) {
  t = { ...t, tick: i };
  const w = sim.weatherOf(t);
  seen.add(w.type);
  test.assert(sim.WEATHER_TYPES.includes(w.type), `weather type is a known value (${w.type})`);
  test.assert(w.wind >= 2 && w.wind < 40, "wind is in a sane mph band");
  test.assert(w.humidity >= 20 && w.humidity < 90, "humidity is in a sane percent band");
  test.assert(w.temperature >= -20 && w.temperature <= 44, "temperature is in a sane F band");
}
test.assert(seen.size >= 4, `over a year the weather varies (${seen.size} distinct types)`);

// The weather type is season-weighted: January never reads "hot".
const jan = sim.weatherOf({ ...city, tick: 0 }); // founding day ~ Jan
test.assert(jan.type !== "hot", "mid-winter does not read hot");

// buildRenderSnapshot carries the weather so the gauge/newspaper can show it.
const snap = sim.buildRenderSnapshot(city);
test.assert(snap.weather && typeof snap.weather.type === "string", "the render snapshot carries the weather");

// Underground crossing (SC2K XUND 1F/20 principle): a pipe and a subway can
// occupy the same tile, and both reach the render snapshot so the underground
// view can draw the crossing as one composite rather than one hiding the
// other.
{
  const c = sim.createCity({ seed: 7, size: 64, terrainPreset: "balanced", yearFounded: 1900 });
  sim.submitCommand(c, { schemaVersion: 2, type: "build-path", payload: { network: "pipe", points: [{ x: 5, y: 5 }, { x: 7, y: 5 }] }, targetTick: c.tick, clientCommandId: "t-pipe" });
  sim.submitCommand(c, { schemaVersion: 2, type: "build-path", payload: { network: "subway", points: [{ x: 6, y: 4 }, { x: 6, y: 6 }] }, targetTick: c.tick, clientCommandId: "t-sub" });
  // 6,5 has both a pipe and a subway tile.
  const idx = 5 * c.size + 6;
  test.assert(c.pipe[idx] === 1 && c.subway[idx] === 1, "a pipe and a subway share one tile (underground crossing)");
  const snap2 = sim.buildRenderSnapshot(c);
  test.assert(snap2.subway[idx] === 1 && snap2.pipe[idx] === 1, "the render snapshot carries both crossing networks");
}

test.finish();
