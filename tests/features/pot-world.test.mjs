// Pot World / 盆地 — the world core the three games share.
//
// app/core/pot-world.js is held to the six points of the Basin plan's L0
// lane (internal/plans/BASIN-WORLD.zh-CN.md), by running it:
//
//   1. It loads in a bare context with no window, and its member list is
//      pinned: API v1 is frozen once it lands.
//   2. Its calendar is Bonsai City's: dateOfTick agrees with the sim's dateOf
//      tick by tick, and the constants are the sim's.
//   3. Weeks run from one epoch (1900-01-01, a Monday) for every pot.
//   4. The gazetteer is a function of the pot: the same snapshot names the
//      same places, and fifty new road tiles far away rename nothing.
//   5. No district takes the name of a city or a neighbouring pot.
//   6. The hour curves are Rootline's, bit for bit, and Rootline's seeded
//      games hash as they did before the curves and names moved here.
//
// Plus: the letterbox (the only side-effecting part) stores and refuses
// letters as agreed with Joyride and never drops one; the pure part reads no
// clock, random source, page or locale; and the hand-over, letters, plans,
// lines and people behave as the plan's data shapes say.
import vm from "node:vm";
import { webcrypto } from "node:crypto";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("pot-world");
const source = read("app/core/pot-world.js");

// ----- 1. a bare context, a pinned member list -------------------------------------

const bare = vm.createContext({});
vm.runInContext(source, bare);
const W = bare.AISystem6PotWorld;
test.assert(Boolean(W) && !("window" in bare), "the core installs itself in a bare context with no window");
test.assert(Object.isFrozen(W), "the API object is frozen");
const members = (value) => Object.keys(value).join(",");
test.assert(
  members(W) === "CANON_VERSION,WORLD,hash32,cityRef,sealBits,names,gazetteer,calendar,hours,landUse,money,sound,handoff,people,plans,lines,transit,letters,postLetter,letterbox",
  `the member list is API v1 (${members(W)})`,
);
const nested = {
  names: "city,neighbor,NEIGHBORS",
  calendar: "TICKS_PER_DAY,DAYS_PER_MONTH,MONTHS_PER_YEAR,EPOCH_YEAR,dateOfTick,TERMS",
  hours: "bump,activity,periodOf,originWeight,destinationWeights,roadTraffic",
  landUse: "KINDS,kindOfZone,kindOfFacility,drawGlyph",
  money: "group",
  sound: "keyOf,pentatonic",
  handoff: "VERSION,fromCity,validate",
  people: "atTile,households,homeFor",
  plans: "FORMAT,VERSION,validate,canonical,digest",
  lines: "VERSION,validate,fromState,check",
  transit: "VERSION,MODES,modeOf,lineName,drawBadge,rubberPlaces",
  letters: "FORMAT,VERSION,FACT_KEYS,OWN_WORDS_MAX,compose,validate",
  letterbox: "post,list,markRead,drainJoyrideQueue",
};
for (const [name, list] of Object.entries(nested)) {
  test.assert(members(W[name]) === list && Object.isFrozen(W[name]), `${name} is { ${list} } and frozen (${members(W[name])})`);
}
test.assert(W.CANON_VERSION === 2 && W.WORLD.id === "basin" && W.handoff.VERSION === 2, "canon 2, world basin, hand-over v2");

// The pure part: everything outside the SIDE EFFECTS fence reads only its
// arguments.
const fenceStart = source.indexOf("// ===== SIDE EFFECTS =====");
const fenceEnd = source.indexOf("// ===== END SIDE EFFECTS =====");
test.assert(fenceStart > 0 && fenceEnd > fenceStart, "the side-effecting letterbox is fenced off in the source");
const pure = source.slice(0, fenceStart) + source.slice(fenceEnd);
const fenced = source.slice(fenceStart, fenceEnd);
for (const [label, pattern] of [
  ["Date", /\bDate\b/], ["Math.random", /Math\.random/], ["document", /\bdocument\b/], ["performance", /\bperformance\b/],
  ["localStorage", /localStorage/], ["Intl", /\bIntl\b/], ["toLocale*", /toLocale/], ["t()", /(^|[^\w.$])tf?\(/m], ["setTimeout", /setTimeout|setInterval/],
]) {
  test.assert(!pattern.test(pure), `the pure part does not use ${label}`);
}
test.assert(!/indexedDB|bonsaiCities/.test(source), "nothing in the file opens IndexedDB or names the city store");
test.assert(/function postLetter/.test(fenced) && /function drainJoyrideQueue/.test(fenced) && !/function postLetter|localStorage/.test(pure), "postLetter and the letterbox live inside the fence, and only they touch storage");

// ----- the Bonsai City sim, for the calendar and the hand-over ------------------------

const simContext = vm.createContext({ crypto: webcrypto, TextEncoder });
simContext.window = simContext;
vm.runInContext(source, simContext);
vm.runInContext(read("app/features/bonsai-city-sim.js"), simContext);
const sim = simContext.AISystem6BonsaiSim;
const SW = simContext.AISystem6PotWorld;

// ----- 2. the calendar is the sim's -----------------------------------------------------

{
  const C = W.calendar;
  test.assert(C.TICKS_PER_DAY === sim.TICKS_PER_DAY && C.DAYS_PER_MONTH === sim.DAYS_PER_MONTH && C.MONTHS_PER_YEAR === sim.MONTHS_PER_YEAR, "ticks a day, days a month and months a year are the sim's");
  test.assert(C.EPOCH_YEAR === sim.YEAR_FOUNDED_CHOICES[0], `the epoch is the sim's first founding year (${C.EPOCH_YEAR})`);
  let mismatches = 0;
  let checked = 0;
  for (const yearFounded of sim.YEAR_FOUNDED_CHOICES) {
    const state = { tick: 0, yearFounded };
    for (let k = 0; k < 1000; k += 1) {
      state.tick = k * 37; // about 25 years, across every month and year end
      const expected = sim.dateOf(state);
      const got = C.dateOfTick(state.tick, state.yearFounded);
      checked += 1;
      if (got.year !== expected.year || got.month !== expected.month || got.day !== expected.day) mismatches += 1;
    }
  }
  test.assert(checked === 4000 && mismatches === 0, `dateOfTick matches the sim's dateOf on 1000 ticks for each of the 4 founding years (${mismatches} off)`);
  test.assert(JSON.stringify(C.dateOfTick(123)) === JSON.stringify(C.dateOfTick(123, null)), "a missing founding year is 1900, as in the sim");

  // ----- 3. one week for every pot --------------------------------------------------------
  const tickOf = (year, month, day, founded = 1900) => (((year - founded) * 12 + month) * 25 + day - 1) * 5;
  const weekday = (year, month, day, founded) => C.dateOfTick(tickOf(year, month, day, founded), founded).weekday;
  test.assert(weekday(1900, 0, 1) === 0, "1900-01-01 is a Monday");
  test.assert(weekday(1902, 6, 1) === 1, "1902-07-01 is a Tuesday");
  test.assert(weekday(1903, 0, 1) === 4, "1903-01-01 is a Friday");
  test.assert(weekday(1952, 6, 1) === 0 && weekday(1952, 6, 1, 1950) === 0, "1952-07-01 is a Monday, whatever year the pot was founded");
  const summer = C.dateOfTick(tickOf(1952, 6, 1, 1950), 1950);
  test.assert(C.TERMS.length === 24 && C.TERMS[0][0] === "小寒" && C.TERMS[summer.term][0] === "小暑" && C.TERMS[summer.term][1] === "Minor Heat", "24 terms from 小寒; 1952-07-01 falls in 小暑");
  test.assert(C.dateOfTick(tickOf(1952, 6, 13, 1950), 1950).term === 12 && C.dateOfTick(tickOf(1952, 6, 14, 1950), 1950).term === 13, "days 1-13 carry the month's first term, 14-25 its second");
  test.assert(summer.season === 1 && C.dateOfTick(tickOf(1952, 0, 1, 1950), 1950).season === 3 && C.dateOfTick(tickOf(1952, 2, 1, 1950), 1950).season === 0, "seasons are numbered as the shell stamps them: spring from March 0, summer 1, winter 3");
}

// ----- 6. the hour curves are Rootline's, and its games hash as before ------------------
//
// The digest was taken from rootline-core.js as it stood before L0 moved the
// curves out (49ee2b4cd): every quarter hour from 0 to 24, the waking curve,
// the period, the two bumps, every kind's origin weight and every kind's
// destination weights, as JSON, through FNV-1a.

{
  const H = W.hours;
  const KINDS = W.landUse.KINDS;
  const samples = [];
  for (let q = 0; q <= 96; q += 1) {
    const h = q / 4;
    samples.push([h, H.activity(h), H.periodOf(h), H.bump(h, 8, 1.5), H.bump(h, 18, 1.6),
      [...KINDS, "elsewhere"].map((k) => H.originWeight(k, h)),
      KINDS.map((k) => H.destinationWeights(k, h, KINDS))]);
  }
  const text = JSON.stringify(samples);
  const digest = W.hash32(text).toString(16).padStart(8, "0");
  test.assert(text.length === 122070 && digest === "21d42799", `the curves sampled every quarter hour are Rootline's, bit for bit (${text.length} chars, ${digest})`);
  const traffic = samples.map(([h]) => H.roadTraffic(h));
  test.assert(Math.min(...traffic) >= 0.1 - 1e-9 && Math.max(...traffic) <= 1.25 + 1e-9, `road traffic stays within 0.1..1.25 (${Math.min(...traffic).toFixed(3)}..${Math.max(...traffic).toFixed(3)})`);
  test.assert(H.roadTraffic(8) > H.roadTraffic(6.5) && H.roadTraffic(8) > H.roadTraffic(11) && H.roadTraffic(18) > H.roadTraffic(14) && H.roadTraffic(18) > H.roadTraffic(20), "road traffic peaks at 08:00 and 18:00");
  test.assert(W.landUse.kindOfZone(1) === "residential" && W.landUse.kindOfZone(6) === "port" && W.landUse.kindOfZone(4) === null && W.landUse.kindOfFacility("clinic") === "hospital" && W.landUse.kindOfFacility("university") === "school" && W.landUse.kindOfFacility("coal") === null, "Bonsai zones and facilities map onto the eight kinds");

  // Rootline, loaded on top of the world core as its loader does.
  const rc = vm.createContext({});
  vm.runInContext(source, rc);
  vm.runInContext(read("app/features/rootline-core.js"), rc);
  const R = rc.AISystem6RootlineCore;
  const P = rc.AISystem6PotWorld;
  test.assert(R.KINDS === P.landUse.KINDS && R.periodOf === P.hours.periodOf, "Rootline's kinds and periods are the world's own objects");
  const scripted = (seed) => {
    const game = R.createGame({ seed, mode: "classic" });
    const fresh = R.hashGame(game);
    const [a, b, c] = game.stations;
    R.apply(game, { type: "line.create", stops: [a.id, b.id, c.id] });
    for (let i = 0; i < R.ticksPerWeek() * 2 + 600 && !game.over; i += 1) {
      if (game.reward) R.apply(game, { type: "reward.choose", index: 1 });
      if (i % 900 === 450) {
        const onLine = new Set(game.lines.flatMap((l) => l.stops));
        const loose = game.stations.find((s) => !onLine.has(s.id));
        if (loose && game.lines[0]) R.apply(game, { type: "line.set", lineId: game.lines[0].id, stops: [...game.lines[0].stops, loose.id], loop: false });
      }
      if (i === 1200) R.apply(game, { type: "train.add", lineId: game.lines[0].id });
      R.step(game);
    }
    return { name: game.city.name, fresh, played: R.hashGame(game) };
  };
  // Recorded before L0 changed anything; a deliberate rules change updates them.
  const pinned = { 1: { zh: "白岭", fresh: "d4e33efb", played: "5d704a1a" }, 527433: { zh: "鹤洲", fresh: "11be5e71", played: "3fb1de7d" } };
  for (const seed of ["1", "527433"]) {
    const run = scripted(seed);
    test.assert(run.fresh === pinned[seed].fresh && run.played === pinned[seed].played, `Rootline seed "${seed}" hashes as before L0 (${run.fresh}, ${run.played})`);
    test.assert(run.name.zh === pinned[seed].zh && JSON.stringify(run.name) === JSON.stringify(W.names.city(W.hash32(seed))), `seed "${seed}" is still called ${run.name.zh} / ${run.name.en}, from the world's table`);
  }
  test.assert(JSON.stringify(W.names.city(W.hash32("527433"))) === '{"zh":"鹤洲","en":"Hezhou"}' && W.names.city(W.hash32(6101)).zh === "鹤洲", "527433 and the Bonsai seed 6101 are both 鹤洲 / Hezhou");
}

// ----- names --------------------------------------------------------------------------

{
  const tr = vm.createContext({ window: {} });
  vm.runInContext(read("app/features/bonsai-translations.js"), tr);
  const zh = tr.window.AISystem6TranslationsZh;
  const N = W.names.NEIGHBORS;
  test.assert(N.length === sim.NEIGHBOR_NAME_COUNT && N.every((pair, i) => pair[0] === zh[`bonsai_neighbor_name_${i}`]), "the twelve neighbouring pots carry Bonsai City's Chinese neighbour names, in order");
  test.assert(N.every(([, en]) => /^[A-Z][a-zü]+$/.test(en)), `their English is pinyin (${N.map(([, en]) => en).join(", ")})`);
  const nb = W.names.neighbor(6101, "e", 4);
  test.assert(nb.zh === "橡树谷" && nb.en === "Xiangshugu" && nb.seed === "nb:6101:e" && W.names.neighbor(6101, "up", 4) === null, "a neighbour is named by index, seeded nb:<seed>:<dir>, on the four sides only");
}

// ----- 4 and 5. the gazetteer ---------------------------------------------------------------

const state = sim.createCity({ seed: 6101, size: 64, terrainPreset: "river", yearFounded: 1950 });
const terrain = sim.buildRenderSnapshot(state);
const size = terrain.size;

// A town laid straight onto a copy of the real snapshot's layers: an
// east-west road out to the west rim, a north-south street, a station by a
// school, a second station later in the same district, and a subway stop.
function town() {
  const snap = {};
  for (const [key, value] of Object.entries(terrain)) snap[key] = ArrayBuffer.isView(value) ? value.slice() : value;
  snap.facilities = [];
  const dry = (x, y) => !snap.water[y * size + x];
  const lay = (x, y) => { snap.road[y * size + x] = 1; };
  // pick a dry row in the north-west quarter for the rim road
  let row = 6;
  while (row < 14 && ![...Array(14).keys()].every((x) => dry(x, row))) row += 1;
  for (let x = 0; x < 14; x += 1) lay(x, row);
  for (let y = row + 1; y < row + 9; y += 1) lay(10, y);
  for (let x = 4; x < 10; x += 1) lay(x, row + 6);
  snap.facilities.push({ kind: "school", x: 5, y: row + 2, builtTick: 3, footprint: { w: 1, h: 1 } });
  snap.facilities.push({ kind: "station", x: 6, y: row + 2, builtTick: 10, footprint: { w: 2, h: 2 } });
  snap.facilities.push({ kind: "station", x: 11, y: row + 3, builtTick: 20, footprint: { w: 2, h: 2 } });
  snap.facilities.push({ kind: "subway-station", x: 8, y: row + 7 }); // no builtTick: counts as 0
  return { snap, row };
}

function dump(g, snap) {
  const streets = [];
  const addresses = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const s = g.streetAt(x, y);
      if (s) streets.push([x, y, s.key, s.zh, s.en]);
      const a = g.addressOf(x, y);
      if (a) addresses.push([x, y, a.streetKey, a.number]);
    }
  }
  const stations = snap.facilities.filter((f) => /station/.test(f.kind)).map((f) => [f.kind, f.x, f.y, g.stationName(f)]);
  return { districts: g.districts, streets, addresses, stations, angler: g.anglerSpot };
}

{
  const { snap, row } = town();
  const g = W.gazetteer(snap);
  const first = dump(g, snap);
  const again = dump(W.gazetteer(snap), snap);
  test.assert(JSON.stringify(first) === JSON.stringify(again), "the same snapshot names the same places, word for word");
  test.assert(g.districts.length === 16 && new Set(g.districts.map((d) => d.zh)).size === 16 && new Set(g.districts.map((d) => d.en)).size === 16, "sixteen districts, no name repeated in either language");
  test.assert(g.districts.every((d) => ["water", "hill", "flat"].includes(d.terrain)) && g.districts.some((d) => d.terrain === "water"), `each district reads its ground; the river pot has waterside districts (${g.districts.map((d) => d.zh).join(" ")})`);
  test.assert(g.districtAt(0, 0).id === "d00" && g.districtAt(size - 1, size - 1).id === "d33" && g.districtAt(size, 0) === null, "districtAt covers the pot and nothing beyond it");

  // Roads: the rim road takes the western neighbour's name, as the city's
  // Neighbours window lists it; the others are numbered by band.
  const west = W.names.NEIGHBORS[sim.neighborsReport(state).neighbors.find((n) => n.direction === "west").nameIndex];
  const rimRoad = g.streetAt(3, row);
  test.assert(rimRoad.zh === `${west[0]}路` && rimRoad.en === `${west[1]} Road` && rimRoad.axis === "ew", `a road out to the west rim is named for the western neighbour (${rimRoad.zh})`);
  const street = g.streetAt(10, row + 4);
  const district = g.districtAt(10, row + 4);
  test.assert(street.axis === "ns" && street.zh.startsWith(district.zh) && street.zh.endsWith("街") && street.districtId === district.id, `a north-south street is a 街 of its district (${street.zh})`);
  test.assert(g.streetAt(10, row + 4, "ew").axis === "ew" && g.streetAt(5, row + 1) === null, "a heading picks the axis at a tile; a lot is not a street");
  const north = g.addressOf(6, row + 5);
  const south = g.addressOf(6, row + 7);
  test.assert(north && south && north.streetKey === south.streetKey && north.number % 2 === 1 && south.number % 2 === 0, `the north side of a road takes odd numbers, the south side even (${north?.number}, ${south?.number})`);
  test.assert(g.addressOf(size - 20, size - 20) === null, "a lot with no street in front has no address");

  // Stations: the first in a district is the district's; the second, built
  // later, takes a landmark built before it or a number.
  const [first1, second, subway] = snap.facilities.filter((f) => /station/.test(f.kind)).map((f) => g.stationName(f));
  const stationDistrict = g.districtAt(6, row + 2);
  test.assert(subway.zh.endsWith("地铁站") && subway.en.endsWith("Metro"), `a subway stop is a 地铁站 (${subway.zh})`);
  test.assert(first1.zh !== second.zh && first1.zh.startsWith(stationDistrict.zh) && first1.zh.endsWith("站"), `two stations in one district get two names (${first1.zh}, ${second.zh})`);
  const later = { kind: "station", x: 3, y: row + 2, builtTick: 99, footprint: { w: 2, h: 2 } };
  snap.facilities.push(later);
  const withLater = W.gazetteer(snap);
  test.assert(JSON.stringify(dump(withLater, { facilities: snap.facilities.slice(0, -1) }).stations) === JSON.stringify(first.stations), "a station built later renames none built before it");
  test.assert(!first.stations.some(([, , , name]) => name.zh === withLater.stationName(later).zh), `the newcomer takes a name of its own (${withLater.stationName(later).zh})`);
  snap.facilities.pop();
  const planned = g.stationName({ kind: "station", x: 6, y: row + 2, builtTick: Infinity });
  test.assert(planned.zh === first1.zh, "asking after a standing station returns its name");
  // A planned station (builtTick Infinity) comes after every standing one,
  // wherever it is asked about -- not only at a standing station's anchor.
  const elsewhere = { kind: "station", x: 13, y: row + 1, footprint: { w: 2, h: 2 } };
  const plannedElsewhere = g.stationName({ ...elsewhere, builtTick: Infinity });
  test.assert(!first.stations.some(([, , , name]) => name.zh === plannedElsewhere.zh) && plannedElsewhere.zh === g.stationName({ ...elsewhere, builtTick: 1e9 }).zh, `a planned station elsewhere repeats no standing name (${plannedElsewhere.zh})`);

  // Later building renames no standing station: not a hospital put up beside
  // one, not road laid round every station's door, not both at once.
  const builtOn = (extra) => {
    const next = { ...snap, road: snap.road.slice(), facilities: [...snap.facilities, ...(extra.facilities || [])] };
    for (const [x, y] of extra.road || []) if (x >= 0 && y >= 0 && x < size && y < size) next.road[y * size + x] = 1;
    return JSON.stringify(dump(W.gazetteer(next), { facilities: snap.facilities }).stations);
  };
  const third = { kind: "station", x: 12, y: row + 7, builtTick: 30, footprint: { w: 2, h: 2 } };
  snap.facilities.push(third);
  const threeStations = JSON.stringify(dump(W.gazetteer(snap), snap).stations);
  const hospital = { kind: "hospital", x: 13, y: row + 3, builtTick: 500, footprint: { w: 1, h: 1 } };
  const doors = snap.facilities.filter((f) => /station/.test(f.kind)).flatMap((f) => {
    const w = f.footprint?.w || 1;
    const h = f.footprint?.h || 1;
    const ring = [];
    for (let x = f.x - 1; x <= f.x + w; x += 1) ring.push([x, f.y - 1], [x, f.y + h]);
    for (let y = f.y; y < f.y + h; y += 1) ring.push([f.x - 1, y], [f.x + w, y]);
    return ring;
  });
  test.assert(builtOn({ facilities: [hospital] }) === threeStations, "a hospital built beside an old station renames no station");
  test.assert(builtOn({ road: doors }) === threeStations, "road laid at every station's door renames no station");
  test.assert(builtOn({ facilities: [hospital], road: doors }) === threeStations, "nor do both together");
  const hospitalFirst = W.gazetteer({ ...snap, facilities: [...snap.facilities, { ...hospital, builtTick: 15 }] });
  test.assert(hospitalFirst.stationName(snap.facilities[2]).zh.includes("医院"), `a landmark standing before a station does lend it a name (${hospitalFirst.stationName(snap.facilities[2]).zh})`);
  snap.facilities.pop();

  // Fifty road tiles and a zoned block far away rename nothing.
  const grown = { ...snap, road: snap.road.slice(), zone: snap.zone.slice() };
  let laid = 0;
  for (let y = size - 12; y < size - 2 && laid < 50; y += 2) {
    for (let x = size - 12; x < size - 2 && laid < 50; x += 1) {
      if (grown.water[y * size + x]) continue;
      grown.road[y * size + x] = 1;
      laid += 1;
    }
  }
  for (let y = size - 11; y < size - 2; y += 2) for (let x = size - 12; x < size - 2; x += 1) grown.zone[y * size + x] = 1;
  const after = dump(W.gazetteer(grown), grown);
  const keep = (list) => JSON.stringify(list);
  test.assert(laid === 50, "fifty road tiles were laid far from the town");
  test.assert(keep(after.districts) === keep(first.districts) && keep(after.stations) === keep(first.stations) && keep(after.angler) === keep(first.angler), "districts, stations and the angler keep their names after the new roads");
  test.assert(first.streets.every((entry) => after.streets.some((other) => keep(other) === keep(entry))), "every street tile that had a name keeps it");
  test.assert(first.addresses.every((entry) => after.addresses.some((other) => keep(other) === keep(entry))), "every address keeps its street and number");

  // A gazetteer is a picture of the snapshot it was given.
  const live = { ...snap, road: snap.road.slice() };
  const pictured = W.gazetteer(live);
  for (let x = 20; x < 40; x += 1) live.road[(size - 30) * size + x] = 1;
  test.assert(pictured.streetAt(25, size - 30) === null, "road laid in the live city after the gazetteer was made is not in it");

  // The angler sits on the shore nearest the city centre; a dry pot puts him
  // on the rim.
  const spot = first.angler;
  const wet = (x, y) => x >= 0 && y >= 0 && x < size && y < size && Boolean(snap.water[y * size + x]);
  test.assert(spot && !wet(spot.x, spot.y) && (wet(spot.x - 1, spot.y) || wet(spot.x + 1, spot.y) || wet(spot.x, spot.y - 1) || wet(spot.x, spot.y + 1)), `the angler sits on a shore tile (${JSON.stringify(spot)})`);
  test.assert(W.gazetteer({ ...snap, water: new Uint8Array(size * size) }).anglerSpot === null, "a pot without water seats him on the rim (null)");
}

{
  // Street names belong to positions. An existing road extended to the rim,
  // then broken, keeps every name it had; only the new tiles inside the rim
  // band take the western neighbour's.
  const blank = { ...terrain, road: new Uint8Array(size * size), highway: new Uint8Array(size * size) };
  const row = 30;
  const names = (snap, xs, heading) => xs.map((x) => keepStreet(W.gazetteer(snap).streetAt(x, row, heading)));
  const keepStreet = (s) => (s ? `${s.key}|${s.zh}|${s.en}|${s.axis}` : "none");
  const old = [...Array(10).keys()].map((i) => 10 + i);
  for (const x of old) blank.road[row * size + x] = 1;
  const before = [names(blank, old), names(blank, old, "ew")];
  const reached = { ...blank, road: blank.road.slice() };
  for (let x = 0; x < 10; x += 1) reached.road[row * size + x] = 1;
  const broken = { ...reached, road: reached.road.slice() };
  broken.road[row * size + 5] = 0;
  test.assert(JSON.stringify([names(reached, old), names(reached, old, "ew")]) === JSON.stringify(before), "extending a road to the rim renames none of its tiles");
  test.assert(JSON.stringify([names(broken, old), names(broken, old, "ew")]) === JSON.stringify(before), "breaking it again renames none either");
  const west = W.names.NEIGHBORS[sim.neighborsReport(state).neighbors.find((n) => n.direction === "west").nameIndex];
  const reachedG = W.gazetteer(reached);
  test.assert([0, 1, 2, 3].every((x) => reachedG.streetAt(x, row).zh === `${west[0]}路`) && reachedG.streetAt(4, row).zh === reachedG.streetAt(10, row).zh, `the rim band takes ${west[0]}路; the rest of the road keeps its district name (${reachedG.streetAt(4, row).zh})`);

  // A crossing at a street's end: the street, asked with its heading, keeps
  // its name on every tile, and every other tile reads as before. The end
  // tile now lies on two streets; asked bare it reports the crossing road.
  const ns = { ...blank, road: new Uint8Array(size * size) };
  const tiles = [...Array(11).keys()].map((i) => 19 + i);
  for (const y of tiles) ns.road[y * size + 40] = 1;
  const read = (snap, heading) => tiles.map((y) => keepStreet(W.gazetteer(snap).streetAt(40, y, heading)));
  const crossed = { ...ns, road: ns.road.slice() };
  crossed.road[19 * size + 39] = 1;
  crossed.road[19 * size + 41] = 1;
  test.assert(JSON.stringify(read(crossed, "ns")) === JSON.stringify(read(ns, "ns")), "a crossing at a street's end leaves the street's name on every tile");
  test.assert(JSON.stringify(read(crossed).slice(1)) === JSON.stringify(read(ns).slice(1)) && W.gazetteer(crossed).streetAt(40, 19).axis === "ew", "every other tile reads as before; the crossing tile, asked bare, is the road");
}

{
  // 5. Every district name the tables can make, against every city name and
  // every neighbour, in both languages.
  const cities = new Map();
  for (let s = 0; s < 6000 && cities.size < 168; s += 1) {
    const name = W.names.city(s);
    cities.set(name.zh, name.en);
  }
  const reserved = new Set([...cities.keys(), ...cities.values(), ...W.names.NEIGHBORS.flat()]);
  const banded = { size: 64, water: new Uint8Array(64 * 64), alt: new Uint8Array(64 * 64).fill(2), road: new Uint8Array(64 * 64), highway: new Uint8Array(64 * 64), facilities: [] };
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
    if (y < 16) banded.water[y * 64 + x] = 1;
    else if (y < 32) banded.alt[y * 64 + x] = 9;
  }
  const made = new Set();
  let clash = null;
  for (let seed = 0; seed < 400; seed += 1) {
    for (const d of W.gazetteer({ ...banded, seed }).districts) {
      made.add(`${d.zh}/${d.en}`);
      if (reserved.has(d.zh) || reserved.has(d.en)) clash = `${d.zh} / ${d.en}`;
    }
  }
  test.assert(cities.size === 168, "all 168 city names were enumerated");
  test.assert(made.size === 24 * 13, `every head and tail pairing was made (${made.size} of ${24 * 13})`);
  test.assert(clash === null, clash ? `a district is named like a city or neighbour: ${clash}` : "no district shares a name with a city or a neighbouring pot, in Chinese or English");
}

// ----- the hand-over --------------------------------------------------------------------

{
  const record = { id: "example-hezhou-1952", name: "鹤洲" };
  const before = sim.canonicalStringify(sim.serialize(state));
  const live = SW.handoff.fromCity(sim, state, { record, display: { night: true, seasons: true, tank: true }, from: { x: 20.4, y: 30.6 } });
  test.assert(sim.canonicalStringify(sim.serialize(state)) === before, "building the hand-over leaves the city untouched");
  const check = SW.handoff.validate(live);
  test.assert(check.ok, `the payload validates (${check.errors.join(", ")})`);
  test.assert(live.v === 2 && live.ref.cityId === record.id && live.ref.source === "example" && live.name === "鹤洲" && live.from.x === 20 && live.from.y === 31, "it carries the pot's identity, name and the tile to land on");
  test.assert(live.hour === 0 && live.snapshot.timeOfDay === 0 && live.snapshot.season === live.date.season && live.display.tank === true, "night is hour 0 and timeOfDay 0; the season follows the calendar when seasons are on");
  const day = SW.handoff.fromCity(sim, state, { record, display: {} });
  test.assert(day.hour === 12 && day.snapshot.timeOfDay === 0.5 && day.snapshot.season === 1 && day.from.x === terrain.spawnCenter.x, "by day it is hour 12 and summer, landing at the city's centre");
  test.assert(JSON.stringify(live.date) === JSON.stringify(SW.calendar.dateOfTick(state.tick, state.yearFounded)) && live.weather.type === sim.weatherOf(state).type && live.lines === null, "date, weather and (absent) lines come from the city");
  live.snapshot.road[0] = 7;
  test.assert(state.road[0] !== 7, "the snapshot is a copy: the street cannot write into the city");
  const envelope = await sim.encodeSave(state, { cityId: record.id, name: record.name });
  const decoded = (await sim.decodeSave(JSON.parse(JSON.stringify(envelope)))).state;
  const plain = (payload) => JSON.stringify(payload, (key, value) => (ArrayBuffer.isView(value) ? Array.from(value) : value));
  const fromLive = SW.handoff.fromCity(sim, state, { record, display: { seasons: true } });
  const fromSave = SW.handoff.fromCity(sim, decoded, { record, display: { seasons: true } });
  test.assert(plain(fromLive) === plain(fromSave), "the live city and its decoded save hand over the same payload");
  test.assert(!SW.handoff.validate({ ...live, hour: 6 }).ok && !SW.handoff.validate({ ...live, from: { x: -1, y: 0 } }).ok, "a payload with a stray hour or an off-map tile does not validate");
  test.assert(W.cityRef({ id: "abc", name: "" }, { seed: 1, size: 64, tick: 5, name: "Starter Town" }).name === "Starter Town" && W.cityRef(null, { provenance: { source: "openstreetmap" } }).source === "osm" && W.cityRef({ id: "x" }, { scenario: { id: "after-the-fire" } }).source === "scenario" && W.cityRef({ id: "x" }, {}).source === "save", "cityRef reads the record first and tells osm, scenario, example and save apart");
}

// ----- letters and the letterbox ------------------------------------------------------------

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

{
  const L = W.letters;
  test.assert(L.FACT_KEYS.includes("rail-wait") && L.OWN_WORDS_MAX === 140 && L.FORMAT === "basin-letter", "letters list rail-wait among their facts and keep 140 characters of the player's own words");
  const words = "  桥上堵了二十分钟，但河很好看 🙂 ";
  const input = { cityId: "city-1", cityName: "鹤洲", date: { year: 1952, month: 6, day: 1, hour: 18 }, from: { kind: "driver", districtId: "d12" }, facts: [{ key: "jam", x: 20, y: 31, n: 4.5, zone: "c" }, { key: "rail-wait", n: 2 }], ownWords: words };
  const letter = L.compose(input);
  test.assert(L.validate(letter).ok && letter.format === "basin-letter" && letter.v === 1 && /^[0-9a-f]{8}$/.test(letter.id), `a composed letter validates, with an id from its content (${letter.id})`);
  test.assert(letter.ownWords === words && JSON.stringify(letter.facts) === '[{"key":"jam","x":20,"y":31,"n":4.5},{"key":"rail-wait","x":null,"y":null,"n":2}]', "the player's words are kept exactly; facts are key, tile and number");
  test.assert(L.compose(input).id === letter.id && L.compose({ ...input, ownWords: "" }).ownWords === null, "the same letter has the same id; an empty line is no line");
  test.assert(!L.validate({ ...letter, ownWords: "x" }).ok && !L.validate(L.compose({ ...input, ownWords: "字".repeat(141) })).ok && !L.validate(L.compose({ ...input, facts: [{ key: "praise", n: 1 }] })).ok, "a changed, overlong or unknown-fact letter does not validate");

  const ctx = vm.createContext({ localStorage: memoryStorage() });
  vm.runInContext(source, ctx);
  const P = ctx.AISystem6PotWorld;
  const store = ctx.localStorage;
  const box = () => JSON.parse(store.getItem("ai-system6-pot-letters") || "{}");
  test.assert(P.postLetter(letter) === true && P.letterbox.list("city-1").length === 1, "postLetter stores a basin letter under its city");
  test.assert(P.letterbox.list("city-1")[0].ownWords === words && P.letterbox.list("city-1")[0].read === false, "the stored letter keeps its words and starts unread");
  test.assert(P.postLetter(letter) === true && P.letterbox.list("city-1").length === 1, "posting the same letter twice stores it once");
  test.assert(P.postLetter({ ...letter, ownWords: "edited" }) === false && P.letterbox.post({ format: "basin-letter" }).reason === "invalid", "a letter that fails validation is refused, with the reason");

  // Joyride's shape as committed (5a376d0f6), and its record-and-own-line successor.
  const joyrideOld = { from: "joyride", kind: "letter-to-the-mayor", town: { name: "鹤洲", id: "city-2", kind: "save" }, writtenAt: "2026-10-02T06:00:00.000Z", text: "…", facts: { seconds: 720, jamMinutes: 3.5, worstJam: { tile: 2000, x: 16, y: 31, zone: "c", compass: "west", minutes: 2 }, roughShare: 0.1, offences: 1, busted: 0, jobs: 2, failed: 0 }, ownWords: "慢一点" };
  const joyrideNew = { from: "joyride", kind: "letter-to-the-mayor", cityId: "city-3", town: { name: "渔汀", id: null, cityId: "city-3", fingerprint: null, kind: "snapshot" }, writtenAt: "2026-10-02T07:00:00.000Z", facts: [{ key: "jam", x: 3, y: 4, n: 1.5, zone: "r", compass: "north" }], ownWords: null };
  const joyrideDemo = { ...joyrideNew, cityId: null, town: { name: "", id: null, kind: "demo" } };
  test.assert(P.postLetter(joyrideOld) && P.letterbox.list("city-2").length === 1, "Joyride's committed letter is filed under its town id");
  test.assert(P.postLetter(joyrideNew) && P.letterbox.list("city-3").length === 1 && P.letterbox.list("city-3")[0].ownWords === null, "Joyride's newer letter is filed under its cityId");
  test.assert(P.postLetter(joyrideDemo) && P.letterbox.list(null).length === 1 && Object.keys(box()).includes("unfiled"), "a letter with no city id waits under \"unfiled\"");
  test.assert(!P.postLetter({ ...joyrideOld, ownWords: "x".repeat(141) }) && !P.postLetter({ ...joyrideOld, town: null }), "a Joyride letter with an overlong line or no town is refused");

  // Thirty unread letters fill a city's box; the next is refused and none is dropped.
  for (let i = 0; i < 29; i += 1) P.postLetter(L.compose({ ...input, ownWords: `letter ${i}` }));
  const full = P.letterbox.list("city-1");
  test.assert(full.length === 30 && full.every((entry) => !entry.read), "thirty unread letters fill the box");
  const refused = P.letterbox.post(L.compose({ ...input, ownWords: "one too many" }));
  test.assert(refused.ok === false && refused.reason === "full" && P.letterbox.list("city-1").length === 30 && P.letterbox.list("city-1")[0].ownWords === words, "the thirty-first is refused and the oldest letter is still there");
  test.assert(P.letterbox.markRead("city-1", [full[0].id, full[1].id]) === 2 && P.letterbox.markRead("city-1", [full[0].id]) === 0, "marking letters read counts only the ones that changed");
  test.assert(P.postLetter(L.compose({ ...input, ownWords: "one too many" })) && P.letterbox.list("city-1").length === 31, "a read letter frees a place; the read ones stay in the box");

  // Storage that throws, or a box that will not parse, refuses without harm.
  store.setItem("ai-system6-pot-letters", "{not json");
  test.assert(P.postLetter(L.compose({ ...input, cityId: "city-9" })) === false && store.getItem("ai-system6-pot-letters") === "{not json" && P.letterbox.list("city-1").length === 0, "a box that will not parse is left as it is and refuses the letter");
  const broken = vm.createContext({ localStorage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() {} } });
  vm.runInContext(source, broken);
  test.assert(broken.AISystem6PotWorld.postLetter(letter) === false && broken.AISystem6PotWorld.letterbox.drainJoyrideQueue() === 0 && broken.AISystem6PotWorld.letterbox.list("city-1").length === 0, "storage that throws refuses letters without throwing");
  const none = vm.createContext({});
  vm.runInContext(source, none);
  test.assert(none.AISystem6PotWorld.postLetter(letter) === false, "with no storage at all, nothing is stored");
}

{
  // Joyride's fallback queue: exactly the letters queued move, and only they
  // leave the queue.
  const ctx = vm.createContext({ localStorage: memoryStorage() });
  vm.runInContext(source, ctx);
  const P = ctx.AISystem6PotWorld;
  const store = ctx.localStorage;
  const queued = [1, 2, 3].map((n) => ({ from: "joyride", kind: "letter-to-the-mayor", town: { name: "鹤洲", id: "city-q", kind: "save" }, writtenAt: `2026-10-02T0${n}:00:00.000Z`, text: `shift ${n}`, facts: { seconds: n } }));
  const bad = { from: "joyride", kind: "letter-to-the-mayor", town: null, facts: {} };
  store.setItem("ai-system6-joyride-letters", JSON.stringify([queued[0], bad, queued[1], queued[2]]));
  test.assert(P.letterbox.drainJoyrideQueue() === 3, "the three good queued letters move into the box");
  test.assert(JSON.stringify(P.letterbox.list("city-q").map((entry) => entry.text)) === '["shift 1","shift 2","shift 3"]', "they arrive in order, as written");
  test.assert(store.getItem("ai-system6-joyride-letters") === JSON.stringify([bad]), "only the letter that could not move stays in Joyride's queue");
  test.assert(P.letterbox.drainJoyrideQueue() === 0 && P.letterbox.list("city-q").length === 3, "draining again moves nothing and stores nothing twice");
  store.setItem("ai-system6-joyride-letters", JSON.stringify([queued[0]]));
  test.assert(P.letterbox.drainJoyrideQueue() === 1 && store.getItem("ai-system6-joyride-letters") === null && P.letterbox.list("city-q").length === 3, "a letter already in the box leaves the queue without a second copy");
}

// ----- plans, lines, people, seals, money, sound -------------------------------------------

{
  const plan = {
    format: "bonsai-transit-plan", formatVersion: 1,
    source: { cityId: "city-1", seed: 6101, size: 64, tick: 3750, fingerprint: "f".repeat(64) },
    stations: [
      { id: "s1", x: 10, y: 10, kind: "station", name: { zh: "竹坊站", en: "Zhufang Station" }, existing: true },
      { id: "s2", x: 20, y: 10, kind: "subway-station", name: { zh: "桃里地铁站", en: "Taoli Metro" }, existing: false },
    ],
    lines: [{ id: "l1", name: { zh: "1号线", en: "Line 1" }, color: 0, stops: ["s1", "s2"], legs: [{ tiles: [11, 10, 12, 10], water: [] }] }],
  };
  test.assert(W.plans.validate(plan).ok, `a plan validates (${W.plans.validate(plan).errors.join(", ")})`);
  const shuffled = { lines: plan.lines, stations: plan.stations, source: plan.source, formatVersion: 1, format: plan.format };
  test.assert(W.plans.canonical(plan) === W.plans.canonical(shuffled) && W.plans.canonical({ ...plan, integrity: { algorithm: "SHA-256" } }) === W.plans.canonical(plan), "the canonical text ignores key order and the integrity block");
  const digest = await SW.plans.digest(plan);
  const signed = { ...plan, integrity: { algorithm: "SHA-256", canonicalization: "sorted-json-v1", digest } };
  test.assert(/^[0-9a-f]{64}$/.test(digest) && W.plans.validate(signed).ok && digest === await SW.plans.digest(signed), "the SHA-256 digest is stable and the signed plan validates");
  test.assert(digest !== await SW.plans.digest({ ...plan, stations: [{ ...plan.stations[0], x: 11 }, plan.stations[1]] }), "moving a station changes the digest");
  let threw = false;
  try { await W.plans.digest(plan); } catch { threw = true; }
  test.assert(threw, "without crypto.subtle the digest refuses rather than inventing one");
  test.assert(!W.plans.validate({ ...plan, lines: [{ ...plan.lines[0], color: 9 }] }).ok && !W.plans.validate({ ...plan, lines: [{ ...plan.lines[0], stops: ["s1", "s9"] }] }).ok, "a plan with a stray colour or an unknown stop does not validate");

  const sidecar = { version: 1, lines: [{ id: "l1", planId: "p1", name: { zh: "1号线", en: "Line 1" }, color: 0, stations: [{ x: 10, y: 10, kind: "station", name: { zh: "竹坊站", en: "Zhufang Station" } }], tiles: [12, 10, 13, 10], laidTick: 4000 }] };
  const snap = { size: 64, rail: new Uint8Array(64 * 64), subway: new Uint8Array(64 * 64), facilities: [{ kind: "station", x: 10, y: 10, footprint: { w: 2, h: 2 } }] };
  snap.rail[10 * 64 + 12] = 1;
  snap.rail[10 * 64 + 13] = 1;
  test.assert(W.lines.validate(sidecar).ok && W.lines.check(snap, sidecar).ok, "a laid line validates and matches the city's track and station");
  snap.rail[10 * 64 + 13] = 0;
  const problems = W.lines.check(snap, sidecar).problems;
  test.assert(problems.length === 1 && problems[0].what === "track" && problems[0].x === 13, "a missing rail tile is reported where it is");
  test.assert(W.lines.fromState({ transitLines: sidecar }).lines[0].id === "l1" && W.lines.fromState({}) === null && W.lines.fromState({ transitLines: { version: 2 } }) === null, "fromState returns a valid sidecar or null");

  // Transit: metro, BRT and bus, and the avenue the BRT runs on.
  const T = W.transit;
  test.assert(T.VERSION === 1 && Object.isFrozen(T.MODES), "transit is v1 and its MODES table is frozen");
  test.assert(Object.keys(T.MODES).join(",") === "metro,brt,bus" && Object.values(T.MODES).every(Object.isFrozen), "MODES holds metro, brt and bus, each frozen");
  test.assert(T.MODES.metro.rootline.speed > T.MODES.brt.rootline.speed && T.MODES.brt.rootline.speed > T.MODES.bus.rootline.speed, "the metro is faster than the BRT, which is faster than the bus");
  test.assert(T.MODES.metro.family === "rail" && T.MODES.brt.family === "road" && T.MODES.metro.slots && !T.MODES.bus.slots && T.MODES.brt.crossesWater === "bridge" && T.MODES.metro.crossesWater === "tunnel", "rail crosses water by tunnel, road by bridge; a bus keeps no slots");
  test.assert(T.modeOf({ mode: "brt" }).id === "brt" && T.modeOf({ mode: "bus" }).id === "bus" && T.modeOf({}).id === "metro" && T.modeOf({ mode: "funicular" }).id === "metro" && T.modeOf(null).id === "metro", "modeOf reads the mode, defaulting to metro");
  test.assert(T.lineName("metro", 3).zh === "3号线" && T.lineName("metro", 3).en === "Line 3" && T.lineName("brt", 3).zh === "快3线" && T.lineName("brt", 3).en === "BRT 3" && T.lineName("bus", 3).zh === "3路" && T.lineName("bus", 3).en === "Route 3", "lineName words each mode's name");
  const calls = () => { const log = []; const ctx = {}; for (const m of ["save","translate","scale","beginPath","moveTo","lineTo","closePath","rect","arc","ellipse","quadraticCurveTo","fill","stroke","restore"]) ctx[m] = (...a) => log.push({ m, a }); ctx.fillStyle = ""; ctx.strokeStyle = ""; ctx.lineWidth = 0; ctx.lineJoin = ""; ctx.lineCap = ""; return { ctx, log }; };
  for (const mode of ["metro", "brt", "bus"]) {
    const { ctx, log } = calls();
    T.drawBadge(ctx, mode, 4, 5, 2, "#fff");
    test.assert(log.some((c) => c.m === "translate") && log.some((c) => c.m === "scale") && log.some((c) => c.m === "restore") && log.some((c) => c.m === "fill"), `drawBadge draws a ${mode} badge through ctx`);
  }

  // Plans and sidecars: old lines are metro, buses take a number and no colour.
  const busStation = { id: "b1", x: 30, y: 10, kind: "bus-stop", name: { zh: "松坊站", en: "Songfang Stop" }, existing: true };
  const busLine = { id: "b12", mode: "bus", name: { zh: "12路", en: "Route 12" }, color: null, number: 12, stops: ["s1", "b1"], legs: [{ tiles: [11, 10, 12, 10], water: [] }] };
  const busPlan = { ...plan, stations: [...plan.stations, busStation], lines: [...plan.lines, busLine] };
  test.assert(W.plans.validate(plan).ok, "an old metro-only plan still validates unchanged");
  test.assert(W.plans.validate(busPlan).ok && W.plans.validate({ ...busPlan, lines: [plan.lines[0]] }).ok, `a bus line with no colour and number 12 validates (${W.plans.validate(busPlan).errors.join(",")})`);
  test.assert(!W.plans.validate({ ...busPlan, lines: [plan.lines[0], { ...busLine, color: 3 }] }).ok, "a bus line that wears a colour does not validate");
  const metroWithStop = { ...plan, stations: [...plan.stations, { ...busStation, id: "b2" }], lines: [{ ...plan.lines[0], stops: ["s1", "b2"] }] };
  test.assert(!W.plans.validate(metroWithStop).ok, "a bus-stop on a metro line does not validate");
  const busSidecar = { version: 1, lines: [{ ...busLine, planId: "p1", stations: [{ x: 30, y: 10, kind: "bus-stop", name: { zh: "松坊站", en: "Songfang Stop" }, group: "g1" }], tiles: [30, 10, 31, 10], laidTick: 4000 }] };
  test.assert(W.lines.validate(busSidecar).ok && !W.lines.validate({ ...busSidecar, lines: [{ ...busSidecar.lines[0], color: 2 }] }).ok, "a bus sidecar validates with a colourless numbered line and a grouped stop");

  // checkLines: road, avenue and a depot within 8 tiles.
  const brtSidecar = { version: 1, lines: [{ id: "k1", mode: "brt", planId: null, name: { zh: "快1线", en: "BRT 1" }, color: 1, stations: [], tiles: [10, 20, 11, 20], laidTick: 4000 }] };
  const flat = { size: 64, road: new Uint8Array(64 * 64), avenue: new Uint8Array(64 * 64), facilities: [] };
  flat.road[20 * 64 + 10] = 1;
  flat.road[20 * 64 + 11] = 1;
  const avenueProblems = W.lines.check(flat, brtSidecar).problems.map((p) => p.what);
  test.assert(avenueProblems.includes("avenue") && avenueProblems.includes("depot") && !avenueProblems.includes("road"), "a BRT line on a plain road wants an avenue and a depot");
  flat.avenue[20 * 64 + 10] = 2;
  flat.avenue[20 * 64 + 11] = 2;
  flat.facilities = [{ kind: "bus", x: 12, y: 20 }];
  test.assert(W.lines.check(flat, brtSidecar).ok, "with road, avenue and a bus depot in reach the BRT line is clean");
  flat.facilities = [{ kind: "bus", x: 40, y: 40 }];
  test.assert(W.lines.check(flat, brtSidecar).problems.some((p) => p.what === "depot"), "a bus depot further than 8 tiles is no depot");

  // The gazetteer names an avenue on both of its tiles, and a stop at a corner.
  const avenueSnap = { size: 64, seed: 6101, road: new Uint8Array(64 * 64), highway: new Uint8Array(64 * 64), avenue: new Uint8Array(64 * 64) };
  // A real two-tile avenue: the north half carries westbound traffic (8), the
  // south half eastbound (2); the median is on each driver's left.
  for (const x of [8, 9, 10, 11]) {
    avenueSnap.road[19 * 64 + x] = 1; avenueSnap.avenue[19 * 64 + x] = 8;
    avenueSnap.road[20 * 64 + x] = 1; avenueSnap.avenue[20 * 64 + x] = 2;
  }
  for (const y of [18, 19, 21, 22]) { avenueSnap.road[y * 64 + 12] = 1; }
  avenueSnap.road[20 * 64 + 12] = 1;
  const places = W.gazetteer(avenueSnap);
  const north = places.streetAt(10, 19);
  const south = places.streetAt(10, 20);
  test.assert(north && south && north.key === south.key && north.zh.endsWith("大道") && north.zh === south.zh && north.en === south.en, `both halves of an avenue share one name (${north?.zh})`);
  // A north-south avenue: the west half runs south (4), the east half north (1).
  const nsSnap = { size: 64, seed: 6101, road: new Uint8Array(64 * 64), highway: new Uint8Array(64 * 64), avenue: new Uint8Array(64 * 64) };
  for (const y of [30, 31, 32, 33]) {
    nsSnap.road[y * 64 + 40] = 1; nsSnap.avenue[y * 64 + 40] = 4;
    nsSnap.road[y * 64 + 41] = 1; nsSnap.avenue[y * 64 + 41] = 1;
  }
  const nsPlaces = W.gazetteer(nsSnap);
  const west = nsPlaces.streetAt(40, 31); const east = nsPlaces.streetAt(41, 31);
  test.assert(west && east && west.key === east.key && west.axis === "ns" && west.zh.endsWith("大道"), `both halves of a north-south avenue share one name (${west?.zh} / ${east?.zh})`);
  const corner = places.stopName({ x: 12, y: 20 });
  test.assert(JSON.stringify(corner) === JSON.stringify(places.stopName({ x: 12, y: 20 })) && corner.zh.endsWith("口") && corner.zh.includes("大道"), `a stop beside a crossing street takes the corner (${corner.zh})`);
  const mid = places.stopName({ x: 10, y: 20 });
  test.assert(mid.zh.includes("大道") && mid.zh.endsWith("号") && JSON.stringify(mid) === JSON.stringify(places.stopName({ x: 10, y: 20 })), `a stop mid-avenue takes its number (${mid.zh})`);


  const people = { size: 64, seed: 6101, buildings: [
    { x: 4, y: 4, w: 2, h: 2, zone: 1, state: 3, variant: 2, population: 120, jobs: 0 },
    { x: 8, y: 4, w: 1, h: 1, zone: 1, state: 5, variant: 0, population: 40, jobs: 0 },
    { x: 6, y: 8, w: 1, h: 1, zone: 2, state: 3, variant: 1, population: 0, jobs: 30 },
    { x: 30, y: 30, w: 1, h: 1, zone: 1, state: 4, variant: 3, population: 9, jobs: 0 },
  ] };
  const near = W.people.atTile(people, 6, 6, 2);
  test.assert(near.residents === 120 && near.jobs === 30, `people come from occupied buildings; an abandoned one holds nobody (${JSON.stringify(near)})`);
  const homes = W.people.households(people);
  test.assert(homes.length === 2 && homes[0].id === `${4 * 64 + 4}:2`, "a household is anchor tile and variant of an occupied home");
  const home = W.people.homeFor(people, "driver");
  test.assert(JSON.stringify(home) === JSON.stringify(W.people.homeFor(people, "driver")) && homes.some((h) => h.id === home.id), "homeFor picks the same home every time");
  const moved = W.people.homeFor({ ...people, buildings: people.buildings.filter((b) => !(b.x === home.x && b.y === home.y)) }, "driver");
  test.assert(moved && moved.id !== home.id, "when that home is demolished, the household has moved");

  const seal = W.sealBits("city-1", "鹤洲");
  const frame = [...Array(16).keys()].every((i) => seal[i] && seal[240 + i] && seal[i * 16] && seal[i * 16 + 15]);
  const mirrored = [...Array(16).keys()].every((y) => [...Array(8).keys()].every((x) => seal[y * 16 + x] === seal[y * 16 + 15 - x]));
  test.assert(seal.length === 256 && seal.every((b) => b === 0 || b === 1) && frame && mirrored, "a seal is 16x16 one-bit, framed and mirrored");
  test.assert(W.sealBits("city-1", "鹤洲").join("") === seal.join("") && W.sealBits("city-2", "鹤洲").join("") !== seal.join(""), "a pot's seal is its own and always the same");

  test.assert(W.money.group(20000) === "20,000" && W.money.group(-1234567) === "-1,234,567" && W.money.group(999) === "999", "money groups thousands with commas, whatever the locale");
  const key = W.sound.keyOf(6101);
  test.assert(key >= 0 && key < 12 && key === W.sound.keyOf(6101), "a pot's key is a fixed tonic 0-11");
  test.assert(W.sound.pentatonic(0).join() === "523.25,587.33,659.25,783.99,880,1046.5,1174.66" && W.sound.pentatonic(12).join() === W.sound.pentatonic(0).join() && W.sound.pentatonic(6)[0] < 523.25 && W.sound.pentatonic(5)[0] > 523.25, "tonic 0 is Rootline's C pentatonic; others move it six down to five up");
}

test.finish();
