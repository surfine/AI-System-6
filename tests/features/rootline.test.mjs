// Rootline / 根线 — the transit game's rules.
//
// The core (app/features/rootline-core.js) is headless and deterministic, so
// the rules are held here by running them, not by reading them:
//
//   1. HEADLESS. The core loads in a bare context with no window, document or
//      timers, and reaches for no clock or Math.random.
//   2. DETERMINISTIC. A seed and a tick-stamped command log replay to the
//      same state, byte for byte.
//   3. TRANSFERS. A passenger whose destination is only on another line rides
//      to the interchange, changes, and arrives.
//   4. THE PEAKS POINT OPPOSITE WAYS. Mornings send people out of homes;
//      evenings send them out of shops and works.
//   5. OVERCROWDING ENDS A CLASSIC ROUND, and never an endless one.
//   6. THE RIVER COSTS TUNNELS. A leg across the water needs one; without it
//      the line is refused whole.
//   7. EVERY WEEK a train arrives and the game waits for one choice of two.
//   8. THREE MODES, AND THE OLD GAME UNTOUCHED. Without `modes` the state is
//      the metro-only game key for key; with them, metro, BRT and bus replay
//      to a pinned hash, a bus or BRT leg runs at right angles and crosses
//      the river only at a bridge derived from the seed, and the evening peak
//      slows the bus in the centre and never the BRT. The game the shell
//      starts from a seed is that metro-only game until its first road
//      line, which opens the modes by a logged "modes.open".
//   9. A POT FROM BONSAI CITY (rootline-pot.js): the same hand-over converts
//      to the same JSON, plain data only; sites stand where a subway station
//      could, named as the world's gazetteer names stations; water is one
//      polygon per body and a metro leg pays one tunnel per body it passes;
//      a bus follows the real roads and cannot cross water without a road
//      bridge; a BRT runs only on avenue tiles and is refused elsewhere with
//      「需要主干道」; a pot game opens on the planning table and replays to
//      its own hash.
//
// Plus the wiring a lazy game can lose silently: the loader order, the
// read-only access to Bonsai City's saves, and every string the shell asks
// for, in both languages.
import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("rootline");
const coreSource = read("app/features/rootline-core.js");
// The core takes its city names and hour curves from the shared world core,
// which the loader brings first (tests/features/pot-world.test.mjs holds it).
const worldSource = read("app/core/pot-world.js");

function loadCore() {
  const context = vm.createContext({});
  vm.runInContext(worldSource, context);
  vm.runInContext(coreSource, context);
  return context.AISystem6RootlineCore;
}

// ----- 1. headless ----------------------------------------------------------

const C = loadCore();
test.assert(Boolean(C?.createGame && C.step && C.apply), "the core installs its API in a bare context with no window or document");
for (const forbidden of ["Math.random", "Date.now", "new Date", "performance.now", "setTimeout", "setInterval", "requestAnimationFrame", "document.", "localStorage", "indexedDB"]) {
  test.assertNotIncludes(coreSource, forbidden, `the core does not use ${forbidden}`);
}

// ----- 2. determinism --------------------------------------------------------

function scriptedGame(seed) {
  const game = C.createGame({ seed, mode: "classic" });
  const log = [];
  const act = (command) => {
    const result = C.apply(game, command);
    if (result.ok) log.push({ tick: game.tick, ...command });
    return result;
  };
  const [a, b, c] = game.stations;
  act({ type: "line.create", stops: [a.id, b.id, c.id] });
  for (let i = 0; i < C.ticksPerWeek() + 600 && !game.over; i += 1) {
    if (game.reward) act({ type: "reward.choose", index: 1 });
    if (i % 900 === 450) {
      const onLine = new Set(game.lines.flatMap((l) => l.stops));
      const loose = game.stations.find((s) => !onLine.has(s.id));
      const record = game.lines[0];
      if (loose && record) act({ type: "line.set", lineId: record.id, stops: [...record.stops, loose.id], loop: false });
    }
    if (i === 1200) act({ type: "train.add", lineId: game.lines[0].id });
    C.step(game);
  }
  return { game, log };
}

const played = scriptedGame("contract-7");
test.assert(played.game.delivered > 0, `a scripted week delivers passengers (${played.game.delivered})`);
const replayed = C.replay({ seed: "contract-7", mode: "classic", log: played.log, ticks: played.game.tick });
test.assert(
  C.hashGame(replayed) === C.hashGame(played.game),
  `replaying the log lands on the same state (${C.hashGame(played.game)} vs ${C.hashGame(replayed)})`,
);
const again = loadCore().createGame({ seed: "contract-7" });
test.assert(C.hashGame(again) === C.hashGame(C.createGame({ seed: "contract-7" })), "a fresh core builds the same city from the same seed");
test.assert(C.hashGame(C.createGame({ seed: "contract-8" })) !== C.hashGame(C.createGame({ seed: "contract-7" })), "another seed builds another city");
test.assert(played.game.stations.length === new Set(played.game.stations.map((s) => s.id)).size, "station ids are unique");

// ----- a laboratory city ----------------------------------------------------
//
// The state is plain data, so a contract can set the stage directly: three
// stations, a river far away, nothing spawning on its own.

function lab({ mode = "classic", river = [{ x: -100, y: 950 }, { x: 1700, y: 950 }], stations }) {
  const game = C.createGame({ seed: "lab", mode });
  game.city.river = river;
  game.stations = stations.map((s, i) => ({ id: 1000 + i, born: -9999, waiting: [], crowd: 0, interchange: false, served: 0, spawnAcc: -1e9, ...s }));
  game.nextStationTick = Number.MAX_SAFE_INTEGER;
  game.networkVersion += 1;
  return game;
}

// ----- 3. transfers ----------------------------------------------------------

{
  const game = lab({ stations: [
    { x: 200, y: 200, kind: "residential" },
    { x: 500, y: 200, kind: "commercial" },
    { x: 500, y: 500, kind: "industrial" },
  ] });
  const [home, shop, works] = game.stations;
  test.assert(C.apply(game, { type: "line.create", stops: [home.id, shop.id] }).ok, "line one joins home and shop");
  test.assert(C.apply(game, { type: "line.create", stops: [shop.id, works.id] }).ok, "line two joins shop and works");
  home.waiting.push({ id: 99001, dest: "industrial", born: 0 });
  let rodeTwoLines = false;
  for (let i = 0; i < 60 * 40 && !works.served; i += 1) {
    C.step(game);
    if (shop.waiting.some((p) => p.id === 99001)) rodeTwoLines = true;
  }
  test.assert(works.served === 1, `the passenger reaches the works (${works.served})`);
  test.assert(rodeTwoLines, "on the way they stood on the shop platform: they changed lines there");
  test.assert(shop.served === 0, "nobody was set down at the shop as if it were their destination");
}

// ----- 4. peaks ----------------------------------------------------------------

{
  const game = lab({ stations: [
    { x: 200, y: 200, kind: "residential" },
    { x: 700, y: 200, kind: "commercial" },
    { x: 700, y: 600, kind: "industrial" },
  ] });
  game.stations.forEach((s) => { s.spawnAcc = 0; });
  const counts = { morning: {}, evening: {} };
  const seen = new Set();
  for (let i = 0; i < C.ticksPerDay() * 7; i += 1) {
    C.step(game);
    const period = C.periodOf(C.clock(game.tick).hour);
    for (const s of game.stations) {
      for (const p of s.waiting) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        if (counts[period]) counts[period][s.kind] = (counts[period][s.kind] || 0) + 1;
      }
      // Keep the platforms clear so nothing overflows the experiment.
      s.waiting.length = 0;
      s.crowd = 0;
    }
  }
  const out = (period, kind) => counts[period][kind] || 0;
  test.assert(out("morning", "residential") > 2 * out("morning", "commercial"), `mornings send people out of homes (${JSON.stringify(counts.morning)})`);
  test.assert(out("evening", "commercial") + out("evening", "industrial") > 2 * out("evening", "residential"), `evenings send them out of shops and works (${JSON.stringify(counts.evening)})`);
  test.assert(C.clock(C.ticksPerDay()).hour === 6 && C.clock(0).day === 0, "each day starts at 06:00");
}

// ----- 5. overcrowding ------------------------------------------------------------

for (const mode of ["classic", "endless"]) {
  const game = lab({ mode, stations: [
    { x: 200, y: 200, kind: "residential" },
    { x: 700, y: 200, kind: "commercial" },
  ] });
  const [crowded] = game.stations;
  for (let i = 0; i < 10; i += 1) crowded.waiting.push({ id: 5000 + i, dest: "commercial", born: 0 });
  let overAt = 0;
  for (let i = 0; i < 60 * 60 && !game.over; i += 1) {
    C.step(game);
    if (game.over) overAt = game.tick;
  }
  if (mode === "classic") {
    const seconds = overAt / C.RULES.ticksPerSecond;
    test.assert(Boolean(game.over) && game.over.stationId === crowded.id, "a classic round ends at the station that stayed overcrowded");
    test.assert(Math.abs(seconds - C.RULES.overcrowdSeconds) < 1, `the countdown runs ${C.RULES.overcrowdSeconds} seconds (${seconds.toFixed(2)})`);
    test.assert(!C.apply(game, { type: "line.create", stops: game.stations.map((s) => s.id) }).ok, "a finished round takes no more commands");
  } else {
    test.assert(!game.over && crowded.crowd === 0, "an endless round never overflows");
  }
}

// ----- 6. tunnels --------------------------------------------------------------------

{
  const river = [{ x: 400, y: -100 }, { x: 400, y: 1100 }];
  const game = lab({ river, stations: [
    { x: 200, y: 300, kind: "residential" },
    { x: 650, y: 300, kind: "commercial" },
    { x: 200, y: 600, kind: "industrial" },
  ] });
  const [west, east, south] = game.stations;
  game.owned.tunnels = 0;
  const refused = C.apply(game, { type: "line.create", stops: [south.id, west.id, east.id] });
  test.assert(!refused.ok && refused.reason === "tunnel", `a line across the river without a tunnel is refused whole (${refused.reason})`);
  test.assert(game.lines.length === 0, "nothing of the refused line was built");
  game.owned.tunnels = 1;
  test.assert(C.apply(game, { type: "line.create", stops: [south.id, west.id, east.id] }).ok, "with one tunnel the same line is built");
  test.assert(C.available(game).tunnels === 0 && game.lines[0].tunnels === 1, "the tunnel is spent on that leg");
  test.assert(C.apply(game, { type: "line.remove", lineId: game.lines[0].id }).ok && C.available(game).tunnels === 1, "removing the line returns the tunnel");
}

// ----- 7. the week -------------------------------------------------------------------

{
  const game = lab({ stations: [
    { x: 200, y: 200, kind: "residential" },
    { x: 700, y: 200, kind: "commercial" },
  ] });
  const trains = game.owned.trains;
  while (!game.reward && game.tick < C.ticksPerWeek() + 5) {
    C.step(game);
    for (const s of game.stations) s.waiting.length = 0;
  }
  test.assert(game.tick === C.ticksPerWeek(), `the reward arrives at the end of the week (tick ${game.tick})`);
  test.assert(game.owned.trains === trains + 1, "a new train comes with it");
  const [first, second] = game.reward.options;
  test.assert(first && second && first !== second, `two different things are offered (${first}, ${second})`);
  const tick = game.tick;
  C.step(game);
  test.assert(game.tick === tick, "the city waits while the choice is open");
  const before = { ...game.owned };
  test.assert(C.apply(game, { type: "reward.choose", index: 0 }).ok && !game.reward, "choosing closes the offer");
  const grew = Object.keys(before).some((key) => game.owned[key] > before[key]);
  test.assert(grew, "the choice adds to the stock");
}

// ----- 8. three modes, and the old game untouched ------------------------------------

{
  const plain = C.createGame({ seed: "527433" });
  test.assert(!("modes" in plain) && !("deliveredBy" in plain) && !("planning" in plain) && plain.version === 1 && Object.keys(plain.owned).join() === Object.keys(C.RULES.start).join(), "without modes the state is the metro-only game: no new keys, the old stock, version 1");
  test.assert(JSON.stringify(Object.keys(C.available(plain))) === '["lines","trains","carriages","tunnels","interchanges"]', "and its depot lists the old five things");
  test.assert(!C.apply(plain, { type: "line.create", stops: plain.stations.slice(0, 2).map((s) => s.id), mode: "bus" }).ok, "a metro-only game refuses a bus line (mode)");
  const metro = C.apply(plain, { type: "line.create", stops: plain.stations.slice(0, 2).map((s) => s.id) });
  test.assert(metro.ok && !("mode" in plain.lines[0]) && !("number" in plain.lines[0]) && !plain.trains.some((t) => "road" in t), "a metro line records no mode and its train no road flag");
  // The bridges a road leg may use are derived from the seed: computing them
  // draws nothing from the random stream and leaves the state as it was.
  const before = C.hashGame(plain);
  const bridges = C.bridgesOf(plain);
  test.assert(bridges.length >= 2 && C.hashGame(plain) === before, `${bridges.length} bridges are derived without touching the state`);
  test.assert(JSON.stringify(C.bridgesOf(C.createGame({ seed: "527433" }))) === JSON.stringify(bridges), "the same seed gives the same bridges");

  // A scripted three-mode week: a metro line, a bus route, and a BRT on the
  // avenue the first week's reward brings.
  const scriptedModes = (seed) => {
    const game = C.createGame({ seed, mode: "classic", modes: ["metro", "brt", "bus"] });
    const log = [];
    const act = (command) => {
      const result = C.apply(game, command);
      if (result.ok) log.push({ tick: game.tick, ...command });
      return result;
    };
    const [a, b, c] = game.stations;
    act({ type: "line.create", stops: [a.id, b.id] });
    act({ type: "line.create", stops: [b.id, c.id], mode: "bus" });
    let brt = null;
    for (let i = 0; i < C.ticksPerWeek() + 900 && !game.over; i += 1) {
      if (game.reward) {
        const index = game.reward.options.indexOf("avenue");
        act({ type: "reward.choose", index: Math.max(0, index) });
      }
      if (!brt && game.owned.avenues > 0) {
        brt = act({ type: "line.create", stops: [a.id, c.id], mode: "brt" });
      }
      C.step(game);
    }
    return { game, log, brt };
  };
  const run = scriptedModes("527433");
  const game = run.game;
  test.assert(Object.keys(game.owned).join() === "lines,trains,carriages,tunnels,interchanges,routes,buses,avenues" && game.modes.join() === "metro,brt,bus", "with modes the stock adds routes, buses and avenues");
  const bus = game.lines.find((l) => l.mode === "bus");
  const brtLine = game.lines.find((l) => l.mode === "brt");
  test.assert(bus && bus.number === 11 && bus.slot === C.RULES.lineSlots && bus.tunnels === 0, `the first bus route is number 11, past the seven line slots (${bus?.number}, slot ${bus?.slot})`);
  test.assert(Boolean(run.brt?.ok) && brtLine && brtLine.slot < C.RULES.lineSlots && C.avenuesUsed(game) === 1, `the first week's reward holds an avenue, and the BRT spends it (${JSON.stringify(run.brt)})`);
  test.assert(game.trains.filter((t) => t.road).length === 2 && C.available(game).trains === game.owned.trains - game.trains.filter((t) => !t.road && !t.retiring).length, "buses come from the bus depot, trains from the shed");
  test.assert(game.deliveredBy.metro + game.deliveredBy.brt + game.deliveredBy.bus === game.delivered && game.delivered > 0, `deliveries are counted per mode (${JSON.stringify(game.deliveredBy)})`);
  const replayedModes = C.replay({ seed: "527433", mode: "classic", modes: ["metro", "brt", "bus"], log: run.log, ticks: game.tick });
  test.assert(C.hashGame(replayedModes) === C.hashGame(game), `a three-mode game replays to the same state (${C.hashGame(game)} vs ${C.hashGame(replayedModes)})`);
  // Pinned when the road modes landed; a deliberate rules change updates it.
  test.assert(C.hashGame(game) === "01122b99", `the three-mode script hashes as pinned (${C.hashGame(game)})`);
  test.assert(!C.apply(game, { type: "carriage.add", lineId: bus.id }).ok && C.apply(game, { type: "carriage.add", lineId: bus.id }).reason === "mode", "a bus takes no carriage (mode)");
  const sharing = C.apply(game, { type: "line.create", stops: [game.stations[0].id, game.stations[2].id], mode: "bus" });
  test.assert(!sharing.ok || C.avenuesUsed(game) === 1, "a second line over the BRT's pair spends no further avenue");
}

// The game a player actually starts from a seed. The shell's own createGame
// options are read out of rootline.js and run here: a seeded game is the
// metro-only game the pot-world contract pins, and stays so (same weekly
// choices from the same stream) until its first bus or BRT line, when one
// logged "modes.open" switches the road modes on.
{
  const shellText = read("app/features/rootline.js");
  const call = shellText.match(/function seededGame\(\) \{\s*return core\.createGame\((\{[^}]*\})\);/);
  test.assert(Boolean(call) && !call[1].includes("modes"), `the shell starts a seeded game without modes (${call?.[1]})`);
  const shellOptions = (seed) => vm.runInNewContext(`(${call[1]})`, { state: { seed, mode: "classic", nurseryName: null } });
  const pinnedFresh = { 1: "d4e33efb", 527433: "11be5e71" };
  for (const seed of ["1", "527433"]) {
    const game = C.createGame(shellOptions(seed));
    test.assert(C.hashGame(game) === pinnedFresh[seed] && !("modes" in game) && !("deliveredBy" in game), `the shell's seed "${seed}" game hashes as pinned (${C.hashGame(game)})`);
  }
  // The same seed read through the shell's own options is key for key the
  // core's plain game: no modes, no deliveredBy, nothing the old records lack.
  for (const seed of ["1", "527433"]) {
    test.assert(C.hashGame(C.createGame(shellOptions(seed))) === C.hashGame(C.createGame({ seed, mode: "classic" })), `the shell's seed "${seed}" game equals the core's plain createGame`);
  }
  // Best-record keys: a metro-only seeded game keeps the old `${mode}:${seed}`;
  // only a game with extra modes pays the extended `:modes` suffix.
  const bestBody = shellText.match(/function bestKey\(game\)\s*\{([\s\S]*?)\n  \}/)?.[1];
  const bestKeyOf = (game, seed) => vm.runInNewContext(`(function bestKey(game){${bestBody}})`, { core: { isPot: () => false }, state: { seed } })(game);
  test.assert(Boolean(bestBody) && bestKeyOf({ mode: "classic" }, "527433") === "classic:527433", `a metro-only seeded game keeps the old best key (${bestKeyOf({ mode: "classic" }, "527433")})`);
  test.assert(bestKeyOf({ mode: "classic", modes: ["metro", "brt", "bus"] }, "527433") === "classic:527433:metro+brt+bus", "only a game with extra modes uses the extended best key");
  test.assert(shellText.includes('startModes: ["metro"]'), "the start panel starts metro-only until extra modes are switched on");
  test.assert(shellText.includes("function startPanelGame()") && shellText.includes("state.startModes.length > 1"), "the seeded start passes modes only when the panel switched them on");
  test.assert(/function openNursery[\s\S]{0,400}startModes = ALL_MODES/.test(shellText), "a nursery opens with all three transit modes");
  // Two metro-only weeks: the weekly choices never hold a bus or an avenue.
  const metroOnly = C.createGame(shellOptions("527433"));
  const [a, b, c] = metroOnly.stations;
  C.apply(metroOnly, { type: "line.create", stops: [a.id, b.id, c.id] });
  const offered = [];
  for (let i = 0; i < C.ticksPerWeek() * 2 + 10 && !metroOnly.over; i += 1) {
    if (metroOnly.reward) {
      offered.push(...metroOnly.reward.options);
      C.apply(metroOnly, { type: "reward.choose", index: 1 });
    }
    C.step(metroOnly);
  }
  test.assert(offered.length >= 2 && !offered.includes("bus") && !offered.includes("avenue"), `a metro-only game is offered only metro rewards (${offered.join()})`);
  // A refused first road line leaves the game metro-only, byte for byte.
  const opening = C.createGame(shellOptions("527433"));
  const before = C.hashGame(opening);
  const refused = C.applyOpening(opening, ["metro", "brt", "bus"], { type: "line.create", stops: [opening.stations[0].id, opening.stations[1].id], mode: "brt" });
  test.assert(!refused.ok && C.hashGame(opening) === before && !opening.modes, `a refused first BRT line (${refused.reason}) leaves the game as it was`);
  // An accepted one opens the modes; the two logged commands replay to it.
  const log = [];
  const command = { type: "line.create", stops: [opening.stations[1].id, opening.stations[2].id], mode: "bus" };
  for (let i = 0; i < 300; i += 1) C.step(opening);
  const accepted = C.applyOpening(opening, ["metro", "brt", "bus"], command);
  log.push({ tick: opening.tick, type: "modes.open", modes: ["metro", "brt", "bus"] }, { tick: opening.tick, ...command });
  test.assert(accepted.ok && opening.modes.join() === "metro,brt,bus" && opening.owned.routes === C.RULES.startTransit.routes && opening.lines[0].number === 11, "the first bus line opens the road modes with their starting stock");
  test.assert(!C.apply(opening, { type: "modes.open", modes: ["metro", "bus"] }).ok, "the modes open once");
  for (let i = 0; i < 600; i += 1) C.step(opening);
  const replayedOpening = C.replay({ seed: "527433", mode: "classic", log, ticks: opening.tick });
  test.assert(C.hashGame(replayedOpening) === C.hashGame(opening), `a game that opened its road modes replays to its hash (${C.hashGame(opening)} vs ${C.hashGame(replayedOpening)})`);
}

// Road legs on a generated city: right angles, the river only at a bridge.
{
  const river = [{ x: 800, y: -100 }, { x: 800, y: 1100 }];
  const game = lab({ river, stations: [
    { x: 500, y: 300, kind: "residential" },
    { x: 1100, y: 640, kind: "commercial" },
    { x: 560, y: 700, kind: "industrial" },
  ] });
  game.modes = ["metro", "brt", "bus"];
  Object.assign(game.owned, C.RULES.startTransit, { routes: C.RULES.routeSlots });
  game.deliveredBy = { metro: 0, brt: 0, bus: 0 };
  const [west, east, south] = game.stations;
  const route = C.legRoute(game, west, east, "bus");
  const pts = route.points;
  const square = pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);
  test.assert(route.problem === "" && square, `a bus leg runs at right angles (${JSON.stringify(pts)})`);
  const bridges = C.bridgesOf(game);
  const deck = pts.findIndex((p, i) => i > 0 && bridges.some((b) => (b.a.x === pts[i - 1].x && b.a.y === pts[i - 1].y && b.b.x === p.x && b.b.y === p.y) || (b.b.x === pts[i - 1].x && b.b.y === pts[i - 1].y && b.a.x === p.x && b.a.y === p.y)));
  test.assert(deck > 0 && C.riverCrossings(game, pts) === 1, "it crosses the river once, on a bridge's deck");
  const tunnels = game.owned.tunnels;
  test.assert(C.apply(game, { type: "line.create", stops: [west.id, east.id], mode: "bus" }).ok && game.lines[0].tunnels === 0 && C.available(game).tunnels === tunnels, "a bus across the river spends no tunnel");
  test.assert(C.apply(game, { type: "line.create", stops: [west.id, south.id], mode: "bus" }).ok, "a bus on one bank needs no bridge");
  // With the bridges pushed off the map, the crossing is refused.
  const noBridge = lab({ river, stations: [{ x: 500, y: 300, kind: "residential" }, { x: 1100, y: 640, kind: "commercial" }] });
  noBridge.modes = ["metro", "brt", "bus"];
  Object.assign(noBridge.owned, C.RULES.startTransit);
  C.bridgesOf(noBridge).forEach((b) => { b.a.y += 5000; b.b.y += 5000; });
  const refused = C.apply(noBridge, { type: "line.create", stops: noBridge.stations.map((s) => s.id), mode: "bus" });
  test.assert(!refused.ok && refused.reason === "bridge", `without a bridge the bus is refused (${refused.reason})`);
  // The evening peak: a bus leg in the centre at 18:00 against noon.
  const centre = lab({ stations: [{ x: 760, y: 470, kind: "residential" }, { x: 840, y: 530, kind: "commercial" }] });
  centre.city.center = { x: 800, y: 500 };
  const [p, q] = centre.stations;
  const load = C.legLoad(centre, p.id, q.id);
  const slow = (hour, mode) => 1 + C.paceOf(mode).peakSlowdown * C.peak(hour) * load;
  test.assert(slow(18, "bus") / slow(12, "bus") >= 1.6, `in the centre a bus takes at least 1.6 times as long at 18:00 as at noon (${(slow(18, "bus") / slow(12, "bus")).toFixed(2)})`);
  test.assert(slow(18, "brt") === slow(12, "brt") && C.paceOf("brt").speed < C.paceOf("metro").speed && C.paceOf("bus").speed < C.paceOf("brt").speed, "the BRT keeps its pace in the peak; metro, BRT and bus run fast to slow");
}

// ----- 9. a pot from Bonsai City ---------------------------------------------------------

const potContext = vm.createContext({});
vm.runInContext(worldSource, potContext);
vm.runInContext(read("app/features/rootline-pot.js"), potContext);
vm.runInContext(coreSource, potContext);
const W = potContext.AISystem6PotWorld;
const P = potContext.AISystem6RootlinePot;
const PC = potContext.AISystem6RootlineCore;
test.assert(P.SPACING === PC.RULES.stationSpacing && P.PLANE.width === PC.RULES.mapWidth && P.PLANE.height === PC.RULES.mapHeight, "the converter's spacing and plane are the core's");
for (const forbidden of ["Math.random", "Date.now", "new Date", "performance.now", "document.", "localStorage", "indexedDB"]) {
  test.assertNotIncludes(read("app/features/rootline-pot.js"), forbidden, `the converter does not use ${forbidden}`);
}

// A small pot, laid tile by tile: a river four tiles wide down x = 30..33
// with one road bridge (y = 10), a pond, an avenue (y = 20/21, westbound
// north half, eastbound south half), a road on the far bank that reaches no
// bridge (y = 55), rail with a station, a school, and people living and
// working on both banks.
function testPayload() {
  const size = 64;
  const n = size * size;
  const layer = () => new Uint8Array(n);
  const snapshot = {
    size, seed: 6101, tick: 500, rev: 1, timeOfDay: 0.5, season: 1, spawnCenter: { x: 32, y: 32 },
    water: layer(), alt: layer(), road: layer(), highway: layer(), rail: layer(), subway: layer(), zone: layer(), park: layer(),
    avenue: layer(), traffic: new Uint16Array(n), congested: layer(),
    facilityAt: new Int16Array(n).fill(-1), plantAt: new Int16Array(n).fill(-1), serviceAt: new Int16Array(n).fill(-1),
    facilities: [], buildings: [],
  };
  const i = (x, y) => y * size + x;
  for (let y = 0; y < size; y += 1) for (let x = 30; x <= 33; x += 1) snapshot.water[i(x, y)] = 1;
  for (let y = 24; y <= 26; y += 1) for (let x = 44; x <= 46; x += 1) snapshot.water[i(x, y)] = 1;
  for (let x = 2; x <= 61; x += 1) snapshot.road[i(x, 10)] = 1;
  for (let x = 2; x <= 28; x += 1) snapshot.road[i(x, 40)] = 1;
  for (let x = 35; x <= 61; x += 1) { snapshot.road[i(x, 40)] = 1; snapshot.road[i(x, 55)] = 1; }
  for (let y = 2; y <= 61; y += 1) snapshot.road[i(10, y)] = 1;
  for (let y = 2; y <= 50; y += 1) snapshot.road[i(50, y)] = 1;
  for (let x = 2; x <= 28; x += 1) {
    snapshot.road[i(x, 20)] = 1; snapshot.road[i(x, 21)] = 1;
    snapshot.avenue[i(x, 20)] = 8; snapshot.avenue[i(x, 21)] = 2;
  }
  for (let x = 2; x <= 20; x += 1) snapshot.rail[i(x, 13)] = 1;
  for (let x = 40; x <= 48; x += 1) { snapshot.traffic[i(x, 40)] = 120; snapshot.congested[i(x, 40)] = 1; }
  const place = (kind, x, y, w, h, builtTick) => {
    const index = snapshot.facilities.length;
    snapshot.facilities.push({ kind, x, y, builtTick, footprint: { w, h } });
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) snapshot.facilityAt[i(x + dx, y + dy)] = index;
  };
  place("station", 5, 11, 2, 2, 10);
  place("school", 38, 42, 2, 2, 20);
  const build = (x, y, zone, people) => {
    snapshot.zone[i(x, y)] = zone;
    snapshot.buildings.push({ x, y, w: 1, h: 1, zone, state: 3, population: zone === 1 ? people : 0, jobs: zone === 1 ? 0 : people });
  };
  for (let y = 28; y <= 34; y += 2) for (let x = 12; x <= 18; x += 2) build(x, y, 1, 30);
  for (let y = 14; y <= 17; y += 1) for (let x = 18; x <= 24; x += 2) build(x, y, 2, 25);
  for (let y = 28; y <= 34; y += 2) for (let x = 52; x <= 58; x += 2) build(x, y, 3, 40);
  for (let y = 12; y <= 16; y += 2) for (let x = 40; x <= 46; x += 2) build(x, y, 1, 20);
  const date = W.calendar.dateOfTick(500, 1950);
  return {
    v: 2, ref: { cityId: "test-pot", name: "鹤洲", seed: 6101, size, tick: 500, source: "save" }, cityId: "test-pot", name: "鹤洲",
    from: { x: 32, y: 32 }, descend: true, osm: false, snapshot, hour: 12, date, weather: { type: "clear" },
    news: { stories: [] }, ordinances: [], display: { night: false, seasons: false, tank: false }, lines: null,
  };
}

{
  const payload = testPayload();
  test.assert(W.handoff.validate(payload).ok, `the test pot is a valid hand-over (${W.handoff.validate(payload).errors.join(",")})`);
  const desc = P.fromHandoff(payload);
  const text = JSON.stringify(desc);
  test.assert(text === JSON.stringify(P.fromHandoff(testPayload())), "the same hand-over converts to the same JSON, byte for byte");
  test.assert(text === JSON.stringify(JSON.parse(text)) && !/"0":/.test(text), "the description is plain JSON: no typed array, no indexed object");
  test.assert(desc.kind === "pot" && desc.key === "pot:test-pot" && desc.name.zh === "鹤洲" && desc.name.en === "Hezhou", `the pot keeps its id and its name in both languages (${desc.name.zh} / ${desc.name.en})`);
  test.assert(desc.bounds.w === 880 && desc.bounds.x === 360 && desc.bounds.y === 60 && desc.cell === 13.75, "the square pot is 880 wide in the middle of the plane");
  test.assert(desc.water.length === 2 && desc.water.every((body) => body.rings.length === 1), `water is one polygon per body (${desc.water.length} bodies)`);
  test.assert(desc.existing.length === 1 && desc.existing[0].kind === "rail", "the rail already laid is one grey existing line");
  test.assert(desc.sites.length >= 4 && desc.start.length === 3, `the city gives ${desc.sites.length} sites and three to start with`);
  // The transition settles every zone tile into a station that is open at
  // the start, not into the sites that only arrive later.
  const intro = P.introOf(payload, desc);
  const openAtStart = new Set(desc.start);
  test.assert([...intro.tiles.target].every((t) => openAtStart.has(t)), "every zone tile settles into a station open at the start");
  const snap = payload.snapshot;
  const standable = (x, y) => {
    const k = y * 64 + x;
    if (snap.water[k] || snap.zone[k] || snap.road[k] || snap.rail[k] || snap.facilityAt[k] >= 0) return false;
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => snap.road[(y + dy) * 64 + x + dx]);
  };
  const planned = desc.sites.filter((site) => !site.existing);
  test.assert(planned.every((site) => standable(site.tx, site.ty)), "every planned site is dry, empty and beside a road: where a subway station could stand");
  const kinds = new Set(desc.start.map((index) => desc.sites[index].kind));
  test.assert(kinds.has("residential") && kinds.has("commercial") && kinds.has("industrial"), `the first three are a home, a shop and a works (${[...kinds].join(", ")})`);
  test.assert(desc.sites.some((site) => site.kind === "school"), "the real school is a site");
  const spaced = desc.sites.every((a, j) => desc.sites.every((b, k) => j === k || Math.hypot(a.x - b.x, a.y - b.y) >= PC.RULES.stationSpacing));
  test.assert(spaced, "sites keep the station spacing between themselves");
  // Names: the city's station keeps the gazetteer's name; a planned site
  // takes the name the gazetteer gives a subway station built there after
  // everything standing, in site order.
  const existing = desc.sites.find((site) => site.existing === "station");
  test.assert(existing && JSON.stringify(existing.name) === JSON.stringify(W.gazetteer(snap).stationName(snap.facilities[0])), `the city's own station keeps its gazetteer name (${existing?.name.zh})`);
  const plannedFacilities = P.plannedFacilities(snap, desc.sites);
  const later = W.gazetteer({ ...snap, facilities: [...snap.facilities, ...plannedFacilities] });
  test.assert(planned.every((site, k) => JSON.stringify(site.name) === JSON.stringify(later.stationName(plannedFacilities[k]))), "every planned site is named by the gazetteer");
  test.assert(new Set(desc.sites.map((site) => site.name.zh)).size === desc.sites.length, "no two sites share a name");

  // A pot game: on the planning table until the first line.
  const game = PC.createGame({ seed: desc.key, city: desc, modes: ["metro", "brt", "bus"] });
  test.assert(game.version === 2 && game.planning === true && game.stations.length === 3 && game.stations.every((s) => s.name && Number.isInteger(s.site)), "a pot game starts with three named stations, version 2, on the planning table");
  PC.step(game);
  test.assert(game.tick === 0, "its clock does not run before the first line");
  test.assert(!game.lines.length && !PC.apply(game, { type: "reward.choose", index: 0 }).ok, "nothing else moves it either");
  const log = [];
  const act = (command) => {
    const result = PC.apply(game, command);
    if (result.ok) log.push({ tick: game.tick, ...command });
    return result;
  };
  const [a, b, c] = game.stations;
  test.assert(act({ type: "line.create", stops: [a.id, b.id, c.id] }).ok && game.planning === false, "the first line starts the clock");
  act({ type: "line.create", stops: [a.id, c.id], mode: "bus" });
  for (let k = 0; k < 2400 && !game.over; k += 1) {
    if (game.reward) act({ type: "reward.choose", index: 0 });
    PC.step(game);
  }
  test.assert(game.tick > 0 && game.stations.every((s) => desc.sites[s.site]), `the pot grows from its own sites (${game.stations.length} stations)`);
  const again = PC.replay({ seed: desc.key, mode: "classic", modes: ["metro", "brt", "bus"], city: desc, log, ticks: game.tick });
  test.assert(PC.hashGame(again) === PC.hashGame(game), `a pot game replays to its hash (${PC.hashGame(game)} vs ${PC.hashGame(again)})`);
}

// A laboratory pot: the test city's map with hand-placed stations, to put
// legs exactly where the rules are.
{
  const desc = P.fromHandoff(testPayload());
  const frame = P.frameOf(64);
  const site = (tx, ty, kind) => {
    const stop = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [tx + dx, ty + dy]).find(([x, y]) => desc.roads.includes(y * 64 + x)) || null;
    const avenue = new Set(desc.avenue.filter((_, k) => k % 2 === 0));
    const brt = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [tx + dx, ty + dy]).find(([x, y]) => avenue.has(y * 64 + x)) || null;
    return { x: frame.bounds.x + (tx + 0.5) * frame.cell, y: frame.bounds.y + (ty + 0.5) * frame.cell, tx, ty, kind, name: { zh: `${tx},${ty}`, en: `${tx},${ty}` }, existing: null, stop, brt };
  };
  const sites = [
    site(8, 9, "residential"), site(40, 9, "commercial"), // 0, 1: both banks of the bridged road
    site(20, 41, "residential"), site(45, 56, "industrial"), // 2, 3: west bank, and an east road no bridge reaches
    site(6, 19, "commercial"), site(26, 22, "industrial"), // 4, 5: north and south of the avenue
    site(20, 25, "residential"), site(52, 25, "commercial"), // 6, 7: across the river and the pond
    site(40, 20, "residential"), site(48, 28, "commercial"), // 8, 9: a diagonal through the pond's corners
  ];
  const labPot = (start) => {
    const game = PC.createGame({ seed: "lab-pot", city: { ...desc, sites, start }, modes: ["metro", "brt", "bus"] });
    game.owned.lines = 7;
    game.owned.routes = 6;
    game.owned.tunnels = 9;
    return game;
  };
  {
    const game = labPot([0, 1]);
    const [w, e] = game.stations;
    const route = PC.legRoute(game, w, e, "bus");
    const roads = new Set(desc.roads);
    const tiles = [];
    for (let k = 0; k < route.tiles.length; k += 2) tiles.push(route.tiles[k + 1] * 64 + route.tiles[k]);
    test.assert(route.problem === "" && tiles.length > 0 && tiles.every((t) => roads.has(t)), `a bus leg follows the roads, tile by tile (${tiles.length} tiles)`);
    test.assert(tiles.some((t) => testPayload().snapshot.water[t]), "and crosses the river on the road bridge");
    test.assert(PC.apply(game, { type: "line.create", stops: [w.id, e.id], mode: "bus" }).ok && game.lines[0].tunnels === 0, "a bus over the bridge spends no tunnel");
    const pts = route.points;
    test.assert(pts.every((p, k) => k === 0 || p.x === pts[k - 1].x || p.y === pts[k - 1].y), "and is drawn at right angles");
  }
  {
    const game = labPot([2, 3]);
    const [w, e] = game.stations;
    const refused = PC.apply(game, { type: "line.create", stops: [w.id, e.id], mode: "bus" });
    test.assert(!refused.ok && refused.reason === "road", `a bus to a bank no road bridge reaches is refused (${refused.reason})`);
    const metro = PC.apply(game, { type: "line.create", stops: [w.id, e.id] });
    test.assert(metro.ok && game.lines[0].tunnels === 1, `the metro goes under it, one tunnel for the river (${game.lines[0]?.tunnels})`);
  }
  {
    const game = labPot([4, 5]);
    const [n, s] = game.stations;
    const route = PC.legRoute(game, n, s, "brt");
    const avenue = new Set(desc.avenue.filter((_, k) => k % 2 === 0));
    const tiles = [];
    for (let k = 0; k < route.tiles.length; k += 2) tiles.push(route.tiles[k + 1] * 64 + route.tiles[k]);
    test.assert(route.problem === "" && tiles.every((t) => avenue.has(t)), "a BRT leg runs on avenue tiles only");
    test.assert(PC.apply(game, { type: "line.create", stops: [n.id, s.id], mode: "brt" }).ok && PC.avenuesUsed(game) === 0, "on a pot the avenue is the city's own and costs nothing");
  }
  {
    const game = labPot([0, 1]);
    const [w, e] = game.stations;
    const refused = PC.apply(game, { type: "line.create", stops: [w.id, e.id], mode: "brt" });
    test.assert(!refused.ok && refused.reason === "avenue", `a BRT off the avenue is refused (${refused.reason})`);
    test.assert(/需要主干道/.test(read("app/data/translations-zh.js").match(/rootline_reject_avenue: "([^"]+)"/)?.[1] || "") && /公交/.test(read("app/data/translations-zh.js").match(/rootline_reject_avenue: "([^"]+)"/)?.[1] || ""), "and the player reads 「需要主干道」, with the bus suggested instead");
    test.assert(PC.apply(game, { type: "line.create", stops: [w.id, e.id], mode: "bus" }).ok, "the same two stations take a bus");
  }
  {
    // One tunnel per body of water a leg passes: the river and the pond.
    const game = labPot([6, 7, 8, 9]);
    const [h, g, d1, d2] = game.stations;
    test.assert(PC.waterCrossings(game, PC.legPoints(h, g)) === 2, `a leg under the river and the pond needs two tunnels (${PC.waterCrossings(game, PC.legPoints(h, g))})`);
    test.assert(PC.waterCrossings(game, PC.legPoints(d1, d2)) === 1, `a diagonal entering and leaving the pond through two corners needs one (${PC.waterCrossings(game, PC.legPoints(d1, d2))})`);
    test.assert(PC.waterCrossings(game, PC.legPoints(h, d1)) === 1, "one pass under the river is one tunnel");
  }
}

// Bonsai City's saves are only read: a read-only transaction and getAll.
{
  const shell = read("app/features/rootline.js");
  const touches = [...shell.matchAll(/objectStore\(([^)]*)\)\.(\w+)\(/g)].map((m) => m[2]);
  test.assert(touches.length > 0 && touches.every((method) => method === "getAll"), `the shell only calls getAll on a store (${touches.join(", ")})`);
  test.assert(/db\.transaction\(store, "readonly"\)/.test(shell) && !/readwrite/.test(shell) && !/\.(put|add|delete|clear)\(/.test(shell.slice(shell.indexOf("async function listBonsaiCities"), shell.indexOf("async function handoffFor"))), "in a read-only transaction, never readwrite");
  test.assert(/bonsaiCitiesStoreName \|\| "bonsaiCities"/.test(shell) && !/bonsaiCities[^"\n]*readwrite/.test(shell), "the store it reads is bonsaiCities");
}

// ----- wiring ---------------------------------------------------------------------------

const config = read("app/core/config.js");
test.assertMatches(
  config,
  /ensureRootlineModule = createLazyModuleLoader\("AISystem6RootlineLoaded", \[\s*"app\/core\/pot-world\.js",\s*"app\/features\/bonsai-city-sim\.js",\s*"app\/features\/rootline-pot\.js",\s*"app\/core\/application-shell\.js",\s*"app\/features\/rootline-core\.js",\s*"app\/features\/rootline-view\.js",\s*"app\/features\/rootline\.js",/,
  "the loader brings the world core, the Bonsai simulation and the pot converter, the core, then the map, then the shell whose flag proves they all arrived",
);
test.assertMatches(
  config,
  /ensureJoyrideModule = createLazyModuleLoader\("AISystem6JoyrideLoaded", \[\s*"app\/core\/pot-world\.js",\s*"app\/core\/application-shell\.js",\s*"app\/features\/bonsai-translations\.js",/,
  "Joyride's loader brings Bonsai City's translations right after the application shell",
);
test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/features/rootline-pot.js",', "the pot converter is a lazy runtime path");
test.assertIncludes(read("app/core/app-admissions.js"), 'repaint: "renderRootline"', "a language switch repaints the game's bars and panels");
test.assertIncludes(read("app/features/rootline.js"), "window.renderRootline =", "the repaint hook the admission row names exists");

const shell = read("app/features/rootline.js");
// Space is the pause key. A panel that hands focus to its first button turns
// "pause" at the end of a week into "take the first reward", and at the end of
// a round into "restart the city", wiping the result before anyone reads it.
const rewardBlock = shell.slice(shell.indexOf("function showReward"), shell.indexOf("function recordBest"));
const finishBlock = shell.slice(shell.indexOf("function finish"), shell.indexOf("// ----- bars"));
test.assert(rewardBlock.includes("focusPanel()") && !/button"\)\?\.focus|\.focus\(\{ preventScroll/.test(rewardBlock), "the weekly reward panel takes focus itself, not its first choice");
test.assert(finishBlock.includes("focusPanel()") && !/again\.focus/.test(finishBlock), "the end-of-round panel takes focus itself, not the restart button");
const keys = new Set([...shell.matchAll(/tf\("(rootline_[a-z_]+)"/g)].map((m) => m[1]));
for (const kind of C.KINDS) keys.add(`rootline_kind_${kind}`);
for (let day = 0; day < 7; day += 1) keys.add(`rootline_weekday_${day}`);
for (const period of ["morning", "evening", "night"]) keys.add(`rootline_period_${period}`);
for (const mode of ["classic", "endless"]) { keys.add(`rootline_mode_${mode}`); keys.add(`rootline_mode_${mode}_note`); }
for (const reward of ["line", "carriage", "tunnel", "interchange", "bus", "avenue"]) { keys.add(`rootline_reward_${reward}`); keys.add(`rootline_reward_${reward}_note`); }
for (const stock of ["train", "carriage", "tunnel", "interchange", "bus", "avenue"]) keys.add(`rootline_stock_${stock}`);
for (const hint of ["first", "second", "planning", "planning_early"]) keys.add(`rootline_hint_${hint}`);
for (const mode of C.TRANSIT) keys.add(`rootline_transit_${mode}`);
for (const key of ["rootline_vehicles_metro", "rootline_vehicles_road", "rootline_toast_no_bus", "rootline_toast_no_train"]) keys.add(key);
for (const key of shell.matchAll(/"(rootline_reject_[a-z_]+)"/g)) keys.add(key[1]);
for (const menu of [...shell.matchAll(/item\("[a-z-]+", "(rootline_menu_[a-z_]+)"\)/g)].map((m) => m[1])) keys.add(menu);
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const missing = [...keys].filter((key) => !en.includes(`    ${key}:`) || !zh.includes(`    ${key}:`));
test.assert(missing.length === 0, missing.length ? `strings missing in a language: ${missing.join(", ")}` : `all ${keys.size} strings exist in English and Chinese`);

test.finish();
