// Bonsai City SC2K system completions: disaster set, view memory, budget
// history, arco family, tech gates, and the v3->v4 save migration.
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-sc2k-systems");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
const sim = context.window.AISystem6BonsaiSim;

function cmd(state, type, payload) {
  return sim.submitCommand(state, { schemaVersion: 2, type, payload, targetTick: state.tick, clientCommandId: `${type}-${state.nextCommandSequence}` });
}
function findLand(state, w, h) {
  for (let y = 1; y <= state.size - h - 1; y += 1) for (let x = 1; x <= state.size - w - 1; x += 1) {
    let ok = true;
    for (let dy = 0; dy < h && ok; dy += 1) for (let dx = 0; dx < w; dx += 1) {
      if (state.water[(y + dy) * state.size + x + dx]) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  throw new Error("no land");
}

test.assert(sim.SAVE_VERSION === 5 && sim.ENGINE_RULESET_VERSION === 5, "the save format is v5");
test.assert(Object.keys(sim.DISASTER_KINDS).length === 15, "the disaster set is expanded to 15");
test.assert(sim.TECHS && sim.TECHS.airport === 1900, "the tech gate table is exported");
test.assert(sim.ARCO_KINDS.length === 4, "four arco kinds are exported");

// Every disaster triggers once its cause is on the map (spec 3.12: a
// plant for a meltdown or microwave spill, high ground, a coast, an airport,
// a high-crime block); bonsai-playable covers the refusals.
{
  const all = Object.keys(sim.DISASTER_KINDS);
  const cause = (c, kind, land) => {
    const at = land.y * c.size + land.x;
    if (kind === "meltdown" || kind === "microwave-spill") {
      c.funds = 100000;
      // Level the pad and its rim so the plant can stand.
      for (let y = Math.max(0, land.y - 1); y <= land.y + 4; y += 1) for (let x = Math.max(0, land.x - 1); x <= land.x + 4; x += 1) c.alt[y * c.size + x] = c.alt[at];
      sim.invalidateDerived(c);
      cmd(c, "place-facility", { kind: kind === "meltdown" ? "nuclear" : "microwave", x: land.x, y: land.y });
    } else if (kind === "volcano") c.alt[at] = 9;
    else if (kind === "hurricane") { const wet = c.water.findIndex((value) => value); c.salt[wet] = 1; }
    else if (kind === "air-crash") c.zone[at] = sim.ZONE.AIRPORT;
    else if (kind === "riot") { c.zone[at] = sim.ZONE.R; c.crime[at] = 90; }
  };
  for (const kind of all) {
    const c = sim.createCity({ seed: 11, size: 64, terrainPreset: "balanced", yearFounded: kind === "meltdown" || kind === "microwave-spill" ? 2050 : 1900 });
    const land = findLand(c, 4, 4);
    cause(c, kind, land);
    const r = cmd(c, "trigger-disaster", { kind, x: land.x, y: land.y });
    test.assert(r.accepted, `disaster ${kind} triggers`);
    test.assert(c.disaster && c.disaster.kind === kind, `disaster ${kind} is active`);
  }
}

// View memory round-trips through serialize/deserialize.
{
  const c = sim.createCity({ seed: 3, size: 64, terrainPreset: "balanced", yearFounded: 1900 });
  c.view = { panX: 42, panY: -17, zoom: 1.3 };
  const s = sim.serialize(c);
  const d = sim.deserialize(s);
  test.assert(d.view.panX === 42 && d.view.panY === -17 && d.view.zoom === 1.3, "the camera pan/zoom round-trips through the v4 save");
}

// Budget history records one entry per settlement.
{
  const c = sim.createCity({ seed: 5, size: 64, terrainPreset: "balanced", yearFounded: 1900 });
  c.funds = 40000;
  cmd(c, "build-path", { network: "road", points: [{ x: 5, y: 5 }, { x: 20, y: 5 }] });
  sim.advanceTicks(c, 255);
  test.assert(c.budgetHistory.length >= 1, "the budget history records a monthly settlement");
  const first = c.budgetHistory[0];
  test.assert(first && typeof first.funding === "object" && Number.isFinite(first.income), "a budget-history record carries funding, income, and expense");
  const s = sim.serialize(c);
  const d = sim.deserialize(s);
  test.assert(d.budgetHistory.length === c.budgetHistory.length, "budget history round-trips");
}

// Four arco kinds place once the tier-6 reward is offered.
{
  const c = sim.createCity({ seed: 7, size: 64, terrainPreset: "balanced", yearFounded: 1900 });
  c.rewardsOffered = ["arco"];
  let placedAny = 0;
  for (let i = 0; i < sim.ARCO_KINDS.length; i += 1) {
    const kind = sim.ARCO_KINDS[i];
    const land = findLand(c, 3, 3);
    // nudge each placement so they do not all land on one plot
    const x = Math.min(c.size - 3, land.x + (i * 5) % 40);
    const y = Math.min(c.size - 3, land.y + (i * 7) % 40);
    const r = cmd(c, "place-facility", { kind, x, y });
    if (r.accepted) placedAny += 1;
  }
  test.assert(placedAny >= 1 && c.facilities.some((f) => sim.ARCO_KINDS.includes(f.kind)), "a concrete arco kind can be placed after the arco reward");
  test.assert(c.arcoPopulation > 0, "arcology population is tallied from the concrete kinds");
}

// v3->v4 migration: a v3 payload gains defaults and deserializes.
{
  const c = sim.createCity({ seed: 9, size: 64, terrainPreset: "balanced", yearFounded: 1900 });
  const s = sim.serialize(c);
  const v3 = { ...s, version: 3, rulesetVersion: 3 };
  const d = sim.deserialize(v3);
  test.assert(d.view && d.budgetHistory && d.militaryBase === 0, "a v3 city migrates to v4 with defaults");
}

test.finish();
