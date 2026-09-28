import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createMayor } from "../../tooling/play-bonsai-two-hours.mjs";
const test = createFeatureTest("bonsai-save-continuation");
const previousWindow = globalThis.window;
globalThis.window = {};
let sim;
try {
  vm.runInThisContext(read("app/features/bonsai-city-sim.js"));
  sim = globalThis.window.AISystem6BonsaiSim;
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}
for (const size of [64, 96, 128]) {
  const city = sim.createCity({ seed: 20260903, size, terrainPreset: "balanced", founded: true });
  const mayor = createMayor(sim, city, {});
  for (let month = 0; month < 60; month += 1) {
    mayor.act(month % 12);
    sim.advanceTicks(city, sim.TICKS_PER_DAY * sim.DAYS_PER_MONTH);
    sim.drainEvents(city); sim.drainNotices(city);
  }
  sim.advanceTicks(city, sim.TICKS_PER_DAY * 7 + 2);
  const saved = sim.serialize(city);
  const loaded = sim.deserialize(saved);
  const equal = () => sim.canonicalStringify(sim.serialize(city)) === sim.canonicalStringify(sim.serialize(loaded));
  test.assert(equal(), `${size}: save reload retains the checkpoint`);
  let previous = 0;
  for (const tick of [3, 88, sim.TICKS_PER_DAY * 60]) {
    sim.advanceTicks(city, tick - previous); sim.advanceTicks(loaded, tick - previous);
    test.assert(equal(), `${size}: identical continuation after ${tick} ticks, including monthly settlement`);
    previous = tick;
  }
  if (size === 64) {
    const legacy = structuredClone(saved); delete legacy.routing;
    test.assert(sim.deserialize(legacy).population > 0, "older v5 saves without routing remain readable");
    for (const change of [data => data.traffic.pop(), data => { data.congested[0] = 2; }, data => { data.distJobs[0] = -1; }, data => { data.sources.jobs = size * size + 1; }]) {
      const invalid = structuredClone(saved); change(invalid.routing);
      let rejected = false;
      try { sim.deserialize(invalid); } catch (error) { rejected = /bonsai-import-invalid/.test(error.message); }
      test.assert(rejected, "malformed routing state is rejected rather than truncated");
    }
  }
}
test.finish();
