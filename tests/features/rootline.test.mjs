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
//
// Plus the wiring a lazy game can lose silently: the loader order and every
// string the shell asks for, in both languages.
import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("rootline");
const coreSource = read("app/features/rootline-core.js");

function loadCore() {
  const context = vm.createContext({});
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

// ----- wiring ---------------------------------------------------------------------------

const config = read("app/core/config.js");
test.assertMatches(
  config,
  /ensureRootlineModule = createLazyModuleLoader\("AISystem6RootlineLoaded", \[\s*"app\/core\/application-shell\.js",\s*"app\/features\/rootline-core\.js",\s*"app\/features\/rootline-view\.js",\s*"app\/features\/rootline\.js",/,
  "the loader brings the core, then the map, then the shell whose flag proves all three arrived",
);
test.assertIncludes(read("app/core/app-admissions.js"), 'repaint: "renderRootline"', "a language switch repaints the game's bars and panels");
test.assertIncludes(read("app/features/rootline.js"), "window.renderRootline =", "the repaint hook the admission row names exists");

const shell = read("app/features/rootline.js");
const keys = new Set([...shell.matchAll(/tf\("(rootline_[a-z_]+)"/g)].map((m) => m[1]));
for (const kind of C.KINDS) keys.add(`rootline_kind_${kind}`);
for (let day = 0; day < 7; day += 1) keys.add(`rootline_weekday_${day}`);
for (const period of ["morning", "evening", "night"]) keys.add(`rootline_period_${period}`);
for (const mode of ["classic", "endless"]) { keys.add(`rootline_mode_${mode}`); keys.add(`rootline_mode_${mode}_note`); }
for (const reward of ["line", "carriage", "tunnel", "interchange"]) { keys.add(`rootline_reward_${reward}`); keys.add(`rootline_reward_${reward}_note`); }
for (const stock of ["train", "carriage", "tunnel", "interchange"]) keys.add(`rootline_stock_${stock}`);
for (const hint of ["first", "second"]) keys.add(`rootline_hint_${hint}`);
for (const menu of [...shell.matchAll(/item\("[a-z-]+", "(rootline_menu_[a-z_]+)"\)/g)].map((m) => m[1])) keys.add(menu);
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const missing = [...keys].filter((key) => !en.includes(`    ${key}:`) || !zh.includes(`    ${key}:`));
test.assert(missing.length === 0, missing.length ? `strings missing in a language: ${missing.join(", ")}` : `all ${keys.size} strings exist in English and Chinese`);

test.finish();
