// The Basin's flip-the-pot contract: Rootline's plan becomes the mayor's bill,
// the bill becomes exactly the money the city pays, and what was laid is what
// the save records. The three invariants the Basin canon names are pinned here:
// the checkpoint does not move until the mayor confirms, the funds fall by
// exactly the quoted total, and only what the bill lists is touched.
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("basin-flip-pot");
const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/core/pot-world.js"), context);
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
vm.runInContext(read("app/core/basin-flip-pot.js"), context);
const sim = context.window.AISystem6BonsaiSim;
const World = context.AISystem6PotWorld || context.window.AISystem6PotWorld;
const Flip = context.window.AISystem6BasinFlipPot;

// ---------------------------------------------------------------- the store
const config = read("app/core/config.js");
const projectDisk = read("app/features/project-disk.js");
const appJs = read("app.js");
test.assertIncludes(config, "indexedDbVersion: 6", "the database carries the transit plan store");
test.assertIncludes(config, 'transitPlansStoreName: "transitPlans"', "the plan store has a name");
test.assertIncludes(appJs, "transitPlansStoreName,", "the store name reaches the shared scope");
test.assertIncludes(projectDisk, "db.createObjectStore(transitPlansStoreName", "the upgrade path creates the plan store");
test.assertIncludes(projectDisk, 'store.createIndex("cityId"', "plans are indexed by the city they belong to");
test.assertIncludes(projectDisk, "async function listStoredTransitPlans", "plans can be listed for one city");
test.assertIncludes(projectDisk, "async function putStoredTransitPlan", "a plan can be saved");
test.assertIncludes(projectDisk, "async function deleteStoredTransitPlan", "a plan can be dropped");

// ------------------------------------------------------------- the modules
const city = sim.replayExampleCity("hezhou-1952");
const SIZE = city.size;
const indexOf = (x, y) => y * SIZE + x;

function transitPlan({ tiles, stops, mode = "metro", color = 0, number = null, existing = false }) {
  return {
    format: "bonsai-transit-plan",
    formatVersion: 1,
    source: { cityId: "c1", seed: city.seed, size: SIZE, tick: city.tick, fingerprint: "fp-1" },
    stations: stops.map((stop, i) => ({
      id: `s${i + 1}`,
      x: stop.x,
      y: stop.y,
      kind: mode === "metro" ? "subway-station" : "bus-stop",
      name: { zh: `第${i + 1}站`, en: `Stop ${i + 1}` },
      existing,
    })),
    lines: [{
      id: "l1",
      name: { zh: "1号线", en: "Line 1" },
      color: mode === "bus" ? null : color,
      ...(mode === "bus" ? { number: number ?? 11 } : {}),
      stops: stops.map((_, i) => `s${i + 1}`),
      legs: [{ tiles: tiles.flatMap((tile) => [tile.x, tile.y]), water: [] }],
      mode,
    }],
  };
}

// A short metro line along a street: the stations stand beside the road, and
// the tunnel runs under it. Found by search so the fixture cannot drift into
// an unbuildable corner without saying so.
function findStreetLine() {
  const isLand = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !city.water[indexOf(x, y)];
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 5; x += 1) {
      const run = [];
      let clear = true;
      for (let step = 0; step <= 4; step += 1) {
        if (!city.road[indexOf(x + step, y)]) { clear = false; break; }
        run.push({ x: x + step, y });
      }
      if (!clear) continue;
      const stops = [{ x, y: y - 1 }, { x: x + 4, y: y - 1 }];
      if (!stops.every((tile) => isLand(tile.x, tile.y) && !city.road[indexOf(tile.x, tile.y)] && !city.rail[indexOf(tile.x, tile.y)])) continue;
      const plan = transitPlan({ tiles: run, stops });
      const bill = Flip.quote(sim, city, plan);
      if (bill.ok && bill.blocked.length === 0 && bill.affordable && bill.total > 0) return { plan, bill };
    }
  }
  return null;
}

const found = findStreetLine();
test.assert(Boolean(found), "the worked example still holds a street that a short metro line can run under");
const { plan, bill } = found;

// ------------------------------------------------------------------ the bill
test.assert(bill.ok && bill.total > 0, `the bill prices the line (total ${bill.total})`);
test.assert(bill.upkeep > 0, `the bill names the monthly upkeep the line adds (${bill.upkeep})`);
test.assert(bill.affordable && bill.deficit === 0, "the example city can afford the line it was asked to price");
test.assert(bill.lines[0].items.every((item) => item.cost >= 0), "every item on the bill carries a price");

const planCheck = World.plans.validate(plan);
test.assert(planCheck.ok, `the plan the bill reads is the shape pot-world validates (${planCheck.errors.join(",")})`);
const digest = await World.plans.digest({ ...plan, integrity: undefined });
test.assert(/^[0-9a-f]{64}$/.test(digest), "the plan digest is a SHA-256 of its canonical text");

// The mayor has not confirmed: quoting is a read, and the city does not move.
const beforeQuote = await sim.checkpoint(city);
Flip.quote(sim, city, plan);
test.assert((await sim.checkpoint(city)) === beforeQuote, "quoting a plan changes nothing in the city");

// ------------------------------------------------------------- the laying
const laid = Flip.lay(sim, city, plan);
test.assert(laid.commands.length === laid.lines[0].items.length, "the confirmation is exactly the bill's items");
test.assert(laid.sidecar && laid.sidecar.lines.length === 1, "a fully laid line is recorded");
test.assert(laid.sidecar.lines[0].stations.length === 2, "the record names the stations the plan built");
test.assert(laid.sidecar.lines[0].tiles.length === 10, "the record names the tiles the plan laid");

const fundsBefore = city.funds;
let spent = 0;
for (const command of laid.commands) {
  const receipt = sim.submitCommand(city, command);
  test.assert(receipt.accepted, `the city takes the quoted command (${receipt.code})`);
  spent += receipt.cost;
}
test.assert(spent === laid.total, `the money the city paid is the money the bill named (${spent} vs ${laid.total})`);
test.assert(fundsBefore - city.funds === bill.total, "the funds fall by exactly the quoted total");

sim.setTransitLines(city, laid.sidecar);
const afterLay = await sim.checkpoint(city);
test.assert(afterLay !== beforeQuote, "confirming the plan is what moves the city");
const check = World.lines.check(sim.buildRenderSnapshot(city), city.transitLines);
test.assert(check.ok, `the laid record matches the city (${JSON.stringify(check.problems.slice(0, 2))})`);
test.assert(city.transitLines.lines[0].mode === undefined, "a metro line stays the default mode in the record");

// The 「线网」 overlay's picture comes from the same record: a laid track tile
// takes its line's colour, a station reads as a station, and a city that has
// laid nothing has an empty layer.
{
  const snapshot = sim.buildRenderSnapshot(city);
  const layer = snapshot.transitLayer;
  test.assert(layer && layer.length === SIZE * SIZE, "the snapshot carries the transit picture");
  const line = city.transitLines.lines[0];
  test.assert(layer[line.tiles[1] * SIZE + line.tiles[0]] === 1, "a laid track tile takes its line's colour");
  test.assert(layer[line.stations[0].y * SIZE + line.stations[0].x] === 11, "a station tile reads as a station");
  const bare = sim.buildRenderSnapshot(sim.createCity({ name: "Bare", seed: 11, size: 64, terrainPreset: "balanced", yearFounded: 2000 }));
  test.assert([...bare.transitLayer].every((value) => value === 0), "a city that laid nothing has an empty transit picture");
}

// ---------------------------------------------------------- what the save keeps
const payload = sim.serialize(city);
test.assert(Object.prototype.hasOwnProperty.call(payload, "transitLines"), "a city with lines writes the sidecar");
const round = sim.deserialize(payload);
test.assert(round.transitLines?.lines?.length === 1, "the sidecar survives a save and load");
test.assert(round.transitLines.lines[0].stations.length === 2, "the stations survive with it");
const plain = sim.createCity({ name: "Plain", seed: 7, size: 64, terrainPreset: "balanced", yearFounded: 2000 });
test.assert(!Object.prototype.hasOwnProperty.call(sim.serialize(plain), "transitLines"),
  "a city with no lines writes no sidecar, so its save is the bytes it always was");

// ------------------------------------------------------------ nothing smuggled in
const good = { version: 1, lines: [{ id: "x", planId: null, name: { zh: "甲", en: "A" }, color: 0, tiles: [1, 1, 2, 1], stations: [], laidTick: 0 }] };
test.assert(sim.sanitizeTransitLines(good)?.lines?.length === 1, "a well-formed sidecar is kept");
test.assert(sim.sanitizeTransitLines({ ...good, version: 2 }) === null, "an unknown sidecar version is refused");
test.assert(sim.sanitizeTransitLines({ version: 1, lines: [{ ...good.lines[0], mode: "hyperloop" }] }) === null, "an unknown mode is refused");
test.assert(sim.sanitizeTransitLines({ version: 1, lines: [{ ...good.lines[0], mode: "bus", number: 12 }] }) === null, "a bus with a palette colour is refused");
test.assert(sim.sanitizeTransitLines({ version: 1, lines: [{ ...good.lines[0], tiles: [1, 1, 2] }] }) === null, "a half a tile pair is refused");
test.assert(sim.sanitizeTransitLines({ version: 1, lines: [{ ...good.lines[0], stations: [{ x: 1, y: 1, kind: "bus-stop", name: { zh: "甲", en: "A" } }] }] }) === null,
  "a metro line cannot claim a bus stop");

// --------------------------------------------------------- what cannot be laid
const unreachable = transitPlan({
  tiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
  stops: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
});
const unreachableBill = Flip.quote(sim, city, unreachable);
test.assert(unreachableBill.ok && unreachableBill.blocked.length > 0, "a plan the city cannot take is refused item by item");
const unreachableLay = Flip.lay(sim, city, unreachable);
test.assert(unreachableLay.commands.length === 0 && unreachableLay.sidecar === null,
  "a line with a blocked item is not laid and is not recorded");
test.assert(unreachableLay.blocked.every((item) => typeof item.code === "string" && item.code.length > 0),
  "every blocked item carries the city's own reason");

// A rubber-tyre line costs nothing to lay but needs a depot in reach.
const busLine = transitPlan({ tiles: [{ x: 15, y: 18 }, { x: 16, y: 18 }, { x: 17, y: 18 }], stops: [{ x: 15, y: 18 }, { x: 17, y: 18 }], mode: "bus" });
const busBill = Flip.quote(sim, city, busLine);
test.assert(busBill.ok, "a bus line can be quoted");
test.assert(busBill.lines[0].items.every((item) => item.cost === 0), "a bus line lays no track and costs nothing");
test.assert(busBill.blocked.some((item) => item.code === "depot"), "a bus line with no depot in reach says so");
const busWithDepot = Flip.quote(sim, city, busLine, { depot: true });
test.assert(busWithDepot.blocked.length === 0, "the mayor can tick the depot and clear the last objection");
test.assert(busWithDepot.total >= 250, `the ticked depot is on the bill (${busWithDepot.total})`);
test.assert(busWithDepot.upkeep >= 0, "the depot's monthly cost is on the bill too");

// Rubber-tyre lines: signs are not commands, the sidecar is the legs in
// driving order, an avenue that is already there is free, and a bend is refused.
{
  const fresh = sim.replayExampleCity("hezhou-1952");
  const busPlan = transitPlan({
    tiles: [{ x: 15, y: 18 }, { x: 16, y: 18 }, { x: 17, y: 18 }],
    stops: [{ x: 15, y: 18 }, { x: 17, y: 18 }],
    mode: "bus",
  });
  const busLaid = Flip.lay(sim, fresh, busPlan, { depot: true });
  test.assert(busLaid.commands.every(Boolean), "a bus confirmation never submits an empty command");
  test.assert(busLaid.commands.length === 1, "a bus line's only command is the depot");
  test.assert(busLaid.sidecar.lines[0].tiles.join(",") === "15,18,16,18,17,18", "a bus line records its legs in driving order");
  const busCopy = sim.deserialize(sim.serialize(fresh));
  let busSpent = 0;
  for (const command of busLaid.commands) {
    const receipt = sim.submitCommand(busCopy, command);
    test.assert(receipt.accepted, `the city takes the bus command (${receipt.code})`);
    busSpent += receipt.cost;
  }
  test.assert(busSpent === busLaid.total, "the bus line's money matches the bill");
  sim.setTransitLines(busCopy, busLaid.sidecar);
  const busCheck = World.lines.check(sim.buildRenderSnapshot(busCopy), busCopy.transitLines);
  test.assert(busCheck.ok, `a bus stop is a sign, not a missing station (${JSON.stringify(busCheck.problems.slice(0, 2))})`);

  let avenueRun = null;
  for (let y = 0; y < fresh.size && !avenueRun; y += 1) {
    let start = -1;
    for (let x = 0; x <= fresh.size; x += 1) {
      const dir = x < fresh.size ? fresh.avenue[y * fresh.size + x] : 0;
      const horizontal = dir === 2 || dir === 8;
      if (horizontal) {
        if (start < 0) start = x;
      } else if (start >= 0 && x - start >= 5) {
        avenueRun = { y, x0: start, x1: x - 1 };
        break;
      } else start = -1;
    }
  }
  test.assert(Boolean(avenueRun), "鹤洲 still has a straight avenue a BRT can sit on");
  const brtTiles = [];
  for (let x = avenueRun.x0; x <= avenueRun.x0 + 4; x += 1) brtTiles.push({ x, y: avenueRun.y });
  const brtPlan = transitPlan({
    tiles: brtTiles,
    stops: [brtTiles[0], brtTiles[brtTiles.length - 1]],
    mode: "brt",
    color: 1,
  });
  const avenueBefore = fresh.avenue.slice();
  const brtBill = Flip.quote(sim, fresh, brtPlan, { depot: true });
  test.assert(brtBill.blocked.length === 0, `an existing avenue is not reported empty (${brtBill.blocked.map((item) => item.code).join(",")})`);
  const track = brtBill.lines[0].items.find((item) => item.kind === "track");
  test.assert(track && track.existing === true && track.cost === 0 && track.command === null, "the avenue leg is free and sends no command");
  const brtLaid = Flip.lay(sim, fresh, brtPlan, { depot: true });
  test.assert(brtLaid.commands.length === 1 && brtLaid.commands.every(Boolean), "confirming the BRT submits only the depot");
  test.assert(brtLaid.total === brtLaid.lines[0].items.find((item) => item.kind === "depot").cost, "the bill is the depot's price");
  const brtCopy = sim.deserialize(sim.serialize(fresh));
  for (const command of brtLaid.commands) test.assert(sim.submitCommand(brtCopy, command).accepted, "the depot command is accepted");
  test.assert(brtCopy.avenue.every((value, index) => value === avenueBefore[index]), "laying a BRT on an avenue that is already there does not touch the avenue");
  sim.setTransitLines(brtCopy, brtLaid.sidecar);
  test.assert(brtCopy.transitLines.lines[0].tiles.length === brtTiles.length * 2, "the BRT sidecar is the leg, one number pair a tile");
  const brtCheck = World.lines.check(sim.buildRenderSnapshot(brtCopy), brtCopy.transitLines);
  test.assert(brtCheck.ok, `the BRT record matches the city (${JSON.stringify(brtCheck.problems.slice(0, 3))})`);

  vm.runInContext(read("app/features/joyride-rail.js"), context);
  const rail = context.window.AISystem6JoyrideRail;
  const network = rail.buildRailNetwork(sim.buildRenderSnapshot(brtCopy), brtCopy.transitLines);
  const brtLine = network.lines.find((line) => line.kind === "brt");
  test.assert(brtLine && brtLine.path.length === brtTiles.length, `the street network follows the leg (${brtLine && brtLine.path.length})`);

  const bend = transitPlan({
    tiles: [{ x: 15, y: 42 }, { x: 21, y: 42 }, { x: 21, y: 56 }],
    stops: [{ x: 15, y: 42 }, { x: 21, y: 56 }],
    mode: "brt",
    color: 2,
  });
  const bendBill = Flip.quote(sim, fresh, bend, { depot: true });
  test.assert(bendBill.blocked.some((item) => item.code === "bend"), "a bent BRT leg is refused instead of being rebuilt somewhere else");
  const straightOnRoad = transitPlan({
    tiles: [{ x: 4, y: 8 }, { x: 8, y: 8 }],
    stops: [{ x: 4, y: 8 }, { x: 8, y: 8 }],
    mode: "brt",
    color: 3,
  });
  const straightBill = Flip.quote(sim, fresh, straightOnRoad, { depot: true });
  test.assert(!straightBill.blocked.some((item) => item.code === "bend"), "a straight BRT leg is not called a bend");
}

test.assertIncludes(read("app/features/bonsai-city.js"), "restoreFallbackSnapshot(before)", "a refused command puts the city back");
test.assertIncludes(read("app/features/bonsai-translations.js"), "bonsai_flip_reason_bend:", "the bend is named in the game's strings");
test.assertIncludes(read("app/features/bonsai-translations.js"), "bonsai_flip_track_existing:", "an avenue that is already there is named on the bill");

// ------------------------------------------------- the planner's side (§8.1)
// Rootline draws on a 1600x1000 table; the plan has to speak the city's tiles.
{
  const frame = { size: 64, cell: 13.75, bounds: { x: 360, y: 60 } };
  const planeX = (tx) => frame.bounds.x + (tx + 0.5) * frame.cell;
  const planeY = (ty) => frame.bounds.y + (ty + 0.5) * frame.cell;

  // A straight run, a diagonal, and a path that doubles back: the tile path
  // must stay orthogonal and must not repeat a tile it is already on.
  const straight = Flip.tilesFromPlanePath([{ x: planeX(10), y: planeY(20) }, { x: planeX(14), y: planeY(20) }], frame, 64);
  test.assert(straight.length === 10, `a straight run keeps every tile it crosses (${straight.length / 2})`);
  const diagonal = Flip.tilesFromPlanePath([{ x: planeX(10), y: planeY(20) }, { x: planeX(13), y: planeY(23) }], frame, 64);
  const orthogonal = (tiles) => {
    for (let i = 2; i < tiles.length; i += 2) {
      const dx = Math.abs(tiles[i] - tiles[i - 2]);
      const dy = Math.abs(tiles[i + 1] - tiles[i - 1]);
      if (dx + dy !== 1) return false;
    }
    return true;
  };
  test.assert(diagonal.length === 14, `a 45-degree leg becomes a staircase (${diagonal.length / 2} tiles)`);
  test.assert(orthogonal(diagonal), "and every step in it is one tile, never a diagonal jump");
  test.assert(orthogonal(straight), "the straight run is orthogonal too");

  // A plan from a drawn game: stations carry the city tiles the pot gave them.
  const pot = {
    size: 64,
    cell: frame.cell,
    bounds: frame.bounds,
    source: { cityId: "city-1", seed: 7, size: 64, tick: 3750, from: "save" },
    key: "pot:city-1",
  };
  const game = {
    tick: 3750,
    city: {
      sites: [
        { tx: 10, ty: 20, kind: "subway-station", name: { zh: "甲站", en: "A" }, existing: "city" },
        { tx: 14, ty: 20, kind: "subway-station", name: { zh: "乙站", en: "B" }, existing: null },
      ],
    },
    stations: [{ id: 1, site: 0 }, { id: 2, site: 1 }],
    lines: [{ id: 0, slot: 0, stops: [1, 2], loop: false }],
  };
  const core = {
    modeOfLine: () => "metro",
    lineGeometry: () => [{ points: [{ x: planeX(10), y: planeY(20) }, { x: planeX(14), y: planeY(20) }] }],
  };
  const plan = Flip.planFrom({ pot, game, core, fingerprint: "0123456789abcdef", id: "plan-1" });
  test.assert(Boolean(plan), "a drawn line becomes a plan");
  const shape = World.plans.validate(plan);
  test.assert(shape.ok, `and it is the shape pot-world accepts (${shape.errors.join(",")})`);
  test.assert(plan.source.cityId === "city-1" && plan.source.fingerprint === "0123456789abcdef",
    "the plan names the city it was drawn on");
  test.assert(plan.stations[0].x === 10 && plan.stations[0].y === 20, "a station keeps the city tile it stands on");
  test.assert(plan.stations[0].existing === true && plan.stations[1].existing === false,
    "a station the city already had is marked, so it costs nothing");
  test.assert(plan.lines[0].legs[0].tiles.length === 10, "the leg carries its tile path");
  test.assert(plan.lines[0].color === 0 && plan.lines[0].mode === undefined, "a metro line keeps the palette slot it drew");

  // A loop comes back as a line that returns to where it started.
  const loopPlan = Flip.planFrom({
    pot,
    game: { ...game, lines: [{ id: 0, slot: 0, stops: [1, 2], loop: true }] },
    core: {
      modeOfLine: () => "metro",
      lineGeometry: () => [
        { points: [{ x: planeX(10), y: planeY(20) }, { x: planeX(14), y: planeY(20) }] },
        { points: [{ x: planeX(14), y: planeY(20) }, { x: planeX(10), y: planeY(20) }] },
      ],
    },
    fingerprint: "fp",
  });
  test.assert(loopPlan?.lines[0].stops.length === 3, "a loop repeats its first stop so the legs count matches");

  // A nursery has no pot to give a plan back to.
  test.assert(Flip.planFrom({ pot: null, game, core, fingerprint: "fp" }) === null, "a city grown from a seed has no plan to save");
  test.assert(Flip.planFrom({ pot, game: { ...game, lines: [] }, core, fingerprint: "fp" }) === null,
    "a pot with nothing drawn on it has no plan to save");
}

test.finish();
