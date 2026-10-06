// The two surfaces the flip-the-pot lane needs: Rootline saves the plan, Bonsai
// City prices it and lays it. The logic behind them is behaviour-tested in
// basin-flip-pot.test.mjs; this file is the wiring — the rows a person clicks,
// the commands behind them, and the fact that neither surface can move the city
// without the mayor confirming.
//
// This contract boots the real eager+lazy module set and drives it: it reads
// the registered menu rows and commands out of the running registration, runs
// the shared bill (planFrom -> validate -> quote -> lay -> setTransitLines) on a
// real city, and reads the transit picture back out of the render snapshot.
//
// Two halves stay file reads, and only these two:
//   * the flip-pot inspector itself, which opens through IndexedDB
//     (listStoredTransitPlans -> indexedDB.open) and this harness deliberately
//     leaves IndexedDB undefined; and
//   * the canvas renderer's TRANSIT_COLORS / transitBox / transitAtTile
//     internals, which no headless run draws.
// Both are labelled where they appear. Nothing is dropped.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("basin-flip-pot-ui");

const vmw = createAppBootVm();
const ctx = vmw.context;
const run = (code) => vmw.run(code);
await vmw.settleBoot();

// Capture the menu sets the real modules register as they load.
const menuSets = {};
const originalRegister = ctx.window.AISystem6RegisterApplicationMenuSet;
ctx.window.AISystem6RegisterApplicationMenuSet = (appId, definitions) => {
  menuSets[appId] = definitions;
  return originalRegister?.(appId, definitions);
};
// The shared zh table must load before a feature module seeds the global, or
// the loader treats it as already present and the feature keys shadow it.
await run("ensureTranslationZh()");
await vmw.waitFor(() => !!ctx.window.AISystem6TranslationsZh);
await ctx.loadLazyWindowModule("bonsaiCity");
await ctx.loadLazyWindowModule("rootline");

const walkItems = (items, out = []) => {
  for (const item of items || []) {
    if (item.type === "submenu") walkItems(item.items, out);
    else if (item.type === "item") out.push(item);
  }
  return out;
};
const rootlineItems = walkItems((menuSets.rootline || []).flatMap((menu) => menu.items || []));
const bonsaiItems = walkItems((menuSets.bonsaiCity || []).flatMap((menu) => menu.items || []));
const en = ctx.window.AISystem6TranslationsEn;
const zh = ctx.window.AISystem6TranslationsZh;
const hasKey = (table, key) => table && (typeof table[key] === "string" || typeof table[key] === "function");

// ----- Rootline: File > Save as a line-network plan -------------------------
const savePlanRow = rootlineItems.find((item) => item.action === "rootline-save-plan");
test.assert(savePlanRow?.labelKey === "rootline_menu_save_plan", "the planner has a row for saving the plan");
test.assert(typeof ctx.window.AISystem6Runtime.getCommand("rootline-save-plan")?.handler === "function",
  "and the row runs the one save function");
test.assert(hasKey(en, "rootline_menu_save_plan"), "the row is named in English");
test.assert(hasKey(zh, "rootline_menu_save_plan"), "and in Chinese");

// ----- Bonsai City: File > Flip the pot ------------------------------------
const flipPotRow = bonsaiItems.find((item) => item.action === "bonsai-flip-pot");
test.assert(flipPotRow?.labelKey === "bonsai_flip_pot_menu", "the mayor has a row for laying a plan");
test.assert(typeof ctx.window.AISystem6Runtime.getCommand("bonsai-flip-pot")?.handler === "function",
  "and the row opens the bill");
test.assert(typeof ctx.window.AISystem6Runtime.getCommand("bonsai-overlay-transit")?.handler === "function",
  "the city offers the transit overlay beside the other coverage maps");
test.assert(hasKey(en, "bonsai_flip_pot_menu") && hasKey(zh, "bonsai_flip_pot_menu"), "the row is named in the game's own strings, both languages");
test.assert(hasKey(en, "bonsai_flip_cannot") && hasKey(zh, "bonsai_flip_cannot"), "and the refusal wording exists in both");
test.assert(hasKey(en, "bonsai_flip_depot_option") && hasKey(zh, "bonsai_flip_depot_option"), "and the depot option the rubber-tyre lines need");
test.assert(hasKey(en, "bonsai_transit_box") && hasKey(zh, "bonsai_transit_box"), "the transit box is named in both languages");

// ----- The shared bill, run on a real city ---------------------------------
// planFrom: the drawing becomes a plan that speaks the city's own tiles, and
// the shared contract accepts it — and refuses one it no longer matches.
const planFromRun = run(`(() => {
  const Flip = AISystem6BasinFlipPot, World = AISystem6PotWorld;
  const city = AISystem6BonsaiSim.replayExampleCity("hezhou-1952");
  const pot = { size: city.size, cell: 32, bounds: { x: 0, y: 0 }, source: { cityId: "c1", seed: city.seed } };
  const game = {
    tick: city.tick,
    lines: [{ id: 0, stops: ["a", "b"], slot: 0 }],
    stations: [{ id: "a", site: 0 }, { id: "b", site: 1 }],
    city: { sites: [{ tx: 10, ty: 10, name: { zh: "甲", en: "A" } }, { tx: 20, ty: 10, name: { zh: "乙", en: "B" } }] },
  };
  const core = { modeOfLine: () => "metro", lineGeometry: () => [{ points: [{ x: 16, y: 16 }, { x: 16 + 32 * 10, y: 16 }] }] };
  const plan = Flip.planFrom({ pot, game, core, fingerprint: "fp-1", id: "plan-1" });
  const check = plan ? World.plans.validate(plan) : null;
  const bad = World.plans.validate({ format: "bonsai-transit-plan", formatVersion: 1, source: {}, stations: [], lines: "nope" });
  return {
    plan: plan && { format: plan.format, stations: plan.stations.length, lines: plan.lines.length, tiles: plan.lines[0].legs[0].tiles.length, fingerprint: plan.source.fingerprint, id: plan.id },
    valid: check?.ok,
    badOk: bad.ok,
  };
})()`);
test.assert(planFromRun.plan?.format === "bonsai-transit-plan" && planFromRun.plan.stations === 2
  && planFromRun.plan.lines === 1 && planFromRun.plan.tiles >= 4 && planFromRun.plan.fingerprint === "fp-1",
  "the plan is built from the drawing and the city's own tiles");
test.assert(planFromRun.valid === true, "and checked against the shared contract before it is stored");
test.assert(planFromRun.badOk === false, "a plan that no longer matches the contract is refused before it is stored");

// quote -> lay -> setTransitLines on a real street line the city can afford.
// Found by search so the fixture cannot drift into an unbuildable corner.
const setup = run(`(() => {
  const sim = AISystem6BonsaiSim, Flip = AISystem6BasinFlipPot;
  const city = sim.replayExampleCity("hezhou-1952");
  const SIZE = city.size, indexOf = (x, y) => y * SIZE + x;
  const isLand = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !city.water[indexOf(x, y)];
  let found = null;
  for (let y = 1; y < SIZE - 1 && !found; y += 1) {
    for (let x = 1; x < SIZE - 5; x += 1) {
      const runTiles = [];
      let clear = true;
      for (let step = 0; step <= 4; step += 1) {
        if (!city.road[indexOf(x + step, y)]) { clear = false; break; }
        runTiles.push({ x: x + step, y });
      }
      if (!clear) continue;
      const stops = [{ x, y: y - 1 }, { x: x + 4, y: y - 1 }];
      if (!stops.every((tile) => isLand(tile.x, tile.y) && !city.road[indexOf(tile.x, tile.y)] && !city.rail[indexOf(tile.x, tile.y)])) continue;
      const plan = {
        format: "bonsai-transit-plan",
        formatVersion: 1,
        source: { cityId: "c1", seed: city.seed, size: SIZE, tick: city.tick, fingerprint: "fp-1" },
        stations: stops.map((stop, i) => ({ id: "s" + (i + 1), x: stop.x, y: stop.y, kind: "subway-station", name: { zh: "站", en: "Stop" }, existing: false })),
        lines: [{
          id: "l1", name: { zh: "1号线", en: "Line 1" }, color: 0, stops: ["s1", "s2"],
          legs: [{ tiles: runTiles.flatMap((tile) => [tile.x, tile.y]), water: [] }], mode: "metro",
        }],
      };
      const bill = Flip.quote(sim, city, plan);
      if (bill.ok && bill.blocked.length === 0 && bill.affordable && bill.total > 0) { found = { plan, bill }; break; }
    }
  }
  if (!found) return null;
  window.__basin = { city, plan: found.plan, bill: found.bill };
  return { total: found.bill.total, ok: found.bill.ok, blocked: found.bill.blocked.length, affordable: found.bill.affordable };
})()`);
test.assert(!!setup, "the worked example holds a street a short metro line can run under");
test.assert(setup.ok === true && setup.total > 0 && setup.blocked === 0, "the bill prices the plan through the shared bill");

// Quoting is a read: the city does not move until the mayor confirms.
const beforeQuote = await run("AISystem6BonsaiSim.checkpoint(window.__basin.city)");
run("AISystem6BasinFlipPot.quote(AISystem6BonsaiSim, window.__basin.city, window.__basin.plan)");
const afterQuote = await run("AISystem6BonsaiSim.checkpoint(window.__basin.city)");
test.assert(beforeQuote === afterQuote, "the pane prices by reading; quoting changes nothing in the city");

const laid = run(`(() => {
  const sim = AISystem6BonsaiSim, { city, plan } = window.__basin;
  const bill = AISystem6BasinFlipPot.lay(sim, city, plan);
  for (const command of bill.commands) sim.submitCommand(city, command);
  sim.setTransitLines(city, bill.sidecar);
  window.__basin.snapshot = sim.buildRenderSnapshot(city);
  return { commands: bill.commands.length, items: bill.lines[0].items.length, sidecarLines: bill.sidecar?.lines?.length, transitLines: city.transitLines?.lines?.length };
})()`);
test.assert(laid.commands === laid.items && laid.commands > 0, "confirming lays exactly the bill's commands");
test.assert(laid.sidecarLines === 1 && laid.transitLines === 1, "what was laid is recorded in the city");

// ----- The city shows what it laid ------------------------------------------
const render = run(`(() => {
  const { city, snapshot } = window.__basin;
  const layer = snapshot.transitLayer;
  const indexOf = (x, y) => y * city.size + x;
  const line = city.transitLines.lines[0];
  return {
    hasLayer: !!layer,
    len: layer?.length,
    area: city.size * city.size,
    lineTile: line.tiles.length ? layer[indexOf(line.tiles[0], line.tiles[1])] : null,
    stationTile: layer[indexOf(line.stations[0].x, line.stations[0].y)],
    stationKind: line.stations[0].kind,
  };
})()`);
test.assert(render.hasLayer === true && render.len === render.area, "the render snapshot carries the transit picture");
test.assert(render.lineTile === 1, "a laid line's tiles take its colour (colour 0 -> band 1)");
test.assert(render.stationTile === 11 && render.stationKind === "subway-station", "a station reads as a station");

// The store the draft is saved through is the app's own.
test.assert(["putStoredTransitPlan", "listStoredTransitPlans", "deleteStoredTransitPlan"]
  .every((name) => run(`typeof ${name}`) === "function"), "the transit-plan store's save, list and drop all exist");

// ----- Wiring the headless harness cannot run -------------------------------
// The flip-pot inspector opens through IndexedDB, which this harness leaves
// undefined, and no headless run draws the canvas overlay: their internals stay
// file reads. Every one of them was a static assertion before, and none is
// dropped.
const rootline = read("app/features/rootline.js");
const bonsai = read("app/features/bonsai-city.js");
const bonsaiStrings = read("app/features/bonsai-translations.js");
const renderer = read("app/features/bonsai-renderer-canvas.js");
const simSource = read("app/features/bonsai-city-sim.js");

test.assertIncludes(rootline, 'if (command === "save-plan") return Boolean(state.pot?.cityId) && Boolean(state.game?.lines?.length);',
  "it is offered only on a pot with something drawn");
test.assertIncludes(rootline, "async function saveTransitPlan()", "the save is one function");
test.assertIncludes(rootline, "await putStoredTransitPlan(record)", "then saved as a draft record");
test.assertIncludes(rootline, 'status: "draft"', "a saved plan is a draft until the mayor lays it");
test.assertIncludes(rootline, "async function potFingerprint(cityId)", "the plan carries the fingerprint of the city it was drawn on");
test.assertIncludes(bonsai, "async function openFlipPot()", "the bill opens as one function");
test.assertIncludes(bonsai, 'await listStoredTransitPlans(state.record?.id || null)', "it lists this city's plans");
test.assertIncludes(bonsai, 'state.inspectorMode === "flipPot"', "the bill has its own inspector pane");
test.assertIncludes(bonsai, 'data-bonsai-flip-confirm', "the pane carries the confirm control");
test.assertIncludes(bonsai, "async function confirmFlipPot()", "confirming is one function");
test.assertIncludes(bonsai, "await saveCurrentCity()", "the city is saved through its own path");
test.assert(!/openFlipPot\(\)[\s\S]{0,400}submitCommand/.test(bonsai), "opening the bill submits nothing");
test.assert(/confirmFlipPot\(\)[\s\S]{0,900}submitCommand/.test(bonsai), "only the confirm path submits commands");
test.assert(/confirmFlipPot\(\)[\s\S]{0,1200}restoreFallbackSnapshot\(before\)/.test(bonsai),
  "a command the city refuses restores the snapshot taken before the first one");

test.assertIncludes(simSource, "transitLayer", "the render snapshot carries the transit picture");
test.assertIncludes(simSource, 'layer[index] = mode === "bus" ? 8 : ((line.color ?? 0) % 7) + 1;',
  "a laid line's tiles take its colour, or the bus category");
test.assertIncludes(simSource, "layer[index] = depots.some(", "an avenue half is in service only when a depot is in reach");
test.assertIncludes(simSource, "layer[index] = 11;", "a station or stop reads as a station");
test.assertIncludes(renderer, '"transit"]', "the renderer knows the transit overlay");
test.assertIncludes(renderer, "const TRANSIT_COLORS = Object.freeze([", "and has its own colours");
test.assert(/TRANSIT_COLORS = Object\.freeze\(\[[\s\S]*?\]\);/.test(renderer), "the colour table is frozen");
test.assert((renderer.match(/rgba\(/g) || []).length >= 12, "with a colour for every category");
test.assertIncludes(bonsai, "function transitBoxMarkup()", "the newspaper has a transit box");
test.assertIncludes(bonsai, "${transitBoxMarkup()}", "and the news pane renders it");
test.assertIncludes(bonsai, "function transitAtTile(tile)", "the tile balloon can name the line over a tile");
test.assertIncludes(bonsai, 'bonsai_tile_transit: transitAtTile(tile) || "—"', "and shows it as a row");
test.assertIncludes(bonsaiStrings, "bonsai_transit_box:", "the box is named in the game's own strings");

test.finish();
