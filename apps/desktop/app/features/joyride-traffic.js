// Joyride / 兜风 — the town around the car (P1), headless.
//
// Everything that lives on the street besides the player's car: other cars
// keeping to the right and stopping at red lights, pedestrians on the
// pavement who always step out of the way, the traffic lights, the payphones
// and the jobs they ring with, the police and the wanted level, and the
// evening-rush shift that scores a night's work. Like joyride-core.js it is
// a pure function of its inputs: no DOM, clock, timers or unseeded
// randomness. A seed and the player's car each step give the same street,
// step for step.
//
// Only the neighbourhood of the car is simulated (spec §8): agents are made
// a few hundred metres out, live while they are near, and are dropped when
// the car leaves them behind. How many there are comes from the city's own
// traffic layer, scaled by the hour.
//
// P2 reads more of the city into the street (spec §5.2): congested tiles
// really jam, patrol cars cruise where crime is high and police cover it,
// ambulance and fire jobs start from the city's own hospital and fire
// station, pedestrians follow where people live and shop, and a driver's
// reputation carries over from shift to shift. District effects are judged
// against the city itself: its high-crime blocks are the top of its own
// range, and a city whose blocks barely differ is treated as even.
//
// The street is shared the Chinese way (Aaron's brief: Yichang's and
// Guangzhou's BRT, and the slow traffic beside it). Every street keeps a
// non-motor lane at each kerb, 3.5 to 5 m out, where bicycles and e-bikes
// ride (an e-bike tops out at 25 km/h by GB 17761-2018, or a little over
// when it has been tuned; some run red lights, a few ride against the
// flow). An avenue (the Basin avenue layer: two road tiles side by side,
// one carriageway each way) has a median the cars cannot cross except at a
// crossing or where it ends, two lanes a side, and a BRT busway against
// the median with island platforms in it.
//
// Contract: tests/features/joyride.test.mjs (P1 and P2 sections).
(function installJoyrideTraffic(global) {
  "use strict";

  const core = () => global.AISystem6JoyrideCore;
  const railway = () => global.AISystem6JoyrideRail;

  const DIRS = Object.freeze({ 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] });
  const OPPOSITE = Object.freeze({ 1: 4, 2: 8, 4: 1, 8: 2 });
  const ARMS = Object.freeze([1, 2, 4, 8]);
  const METRE = 1 / 16;
  const LEFT = Object.freeze({ 1: 8, 2: 1, 4: 2, 8: 4 });
  const LANE = 2 * METRE;            // right of the centre line
  const BIKE_LANE = 4.25 * METRE;     // the non-motor lane, 3.5-5 m out
  const PAVEMENT = 6.6 * METRE;       // pedestrians' line, either side
  // An avenue half's lanes, right of its direction from the tile's centre
  // line (the median is 8 m to the left): with a BRT in the median two
  // lanes, without one a third where the busway would be.
  const AVENUE_LANES = Object.freeze([-1 * METRE, 2 * METRE]);
  const AVENUE_LANES_OPEN = Object.freeze([-4.25 * METRE, -1 * METRE, 2 * METRE]);
  const BUSWAY = Object.freeze([2 / 16, 5.5 / 16]);   // tiles out from the median
  const CAR_HALF_LENGTH = 2.9 * METRE;
  const CAR_HALF_WIDTH = 1.3 * METRE;
  const KMH = METRE / 3.6;            // one km/h in world units per second

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- the road network ---------------------------------------------------------

  // Road tiles (onramps count; highways are not driven yet), their arms, and
  // which connected network each belongs to, so a job never sends the car
  // somewhere it cannot drive to.
  function buildRoadGraph(snapshot) {
    const size = Number(snapshot.size) || 0;
    const isRoad = (x, y) => x >= 0 && y >= 0 && x < size && y < size
      && Boolean(snapshot.road?.[y * size + x] || snapshot.onramp?.[y * size + x]);
    const arms = new Uint8Array(size * size);
    const roads = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isRoad(x, y)) continue;
        let mask = 0;
        ARMS.forEach((dir) => { if (isRoad(x + DIRS[dir][0], y + DIRS[dir][1])) mask |= dir; });
        arms[y * size + x] = mask | 16;
        roads.push(y * size + x);
      }
    }
    const component = new Int32Array(size * size).fill(-1);
    let label = 0;
    roads.forEach((start) => {
      if (component[start] >= 0) return;
      const queue = [start];
      component[start] = label;
      while (queue.length) {
        const tile = queue.pop();
        ARMS.forEach((dir) => {
          if (!(arms[tile] & dir)) return;
          const next = tile + DIRS[dir][0] + DIRS[dir][1] * size;
          if (component[next] < 0) { component[next] = label; queue.push(next); }
        });
      }
      label += 1;
    });
    const armCount = (tile) => ARMS.reduce((n, dir) => n + ((arms[tile] & dir) ? 1 : 0), 0);
    const graph = { size, arms, roads, component, armCount, isRoad: (tile) => Boolean(arms[tile]), avenue: null, medianOpen: null };
    // Avenue halves: each one way, the median between them open only where
    // a side street crosses or the avenue ends (to turn back).
    const avenue = core()?.avenueLayer ? core().avenueLayer(snapshot) : null;
    if (avenue) {
      graph.avenue = avenue;
      graph.medianOpen = new Uint8Array(size * size);
      const partnerOf = (tile) => tile + DIRS[LEFT[avenue[tile]]][0] + DIRS[LEFT[avenue[tile]]][1] * size;
      const outer = (tile) => {
        const out = OPPOSITE[LEFT[avenue[tile]]];
        return Boolean(arms[tile] & out);
      };
      const runs = (tile, k) => {
        const [dx, dz] = DIRS[avenue[tile]];
        const x = (tile % size) + dx * k, y = Math.floor(tile / size) + dz * k;
        return x >= 0 && y >= 0 && x < size && y < size && avenue[y * size + x] === avenue[tile];
      };
      roads.forEach((tile) => {
        if (!avenue[tile]) return;
        const partner = partnerOf(tile);
        const open = outer(tile) || outer(partner) || !runs(tile, 1) || !runs(tile, -1) || !runs(partner, 1) || !runs(partner, -1);
        if (open) graph.medianOpen[tile] = 1;
      });
      graph.partner = (tile) => (avenue[tile] ? partnerOf(tile) : -1);
    }
    return graph;
  }

  // Whether a car on `tile` may leave it by `dir`: along an arm, never
  // against an avenue half's traffic, over its median only where it opens.
  function canGo(graph, tile, dir) {
    if (!(graph.arms[tile] & dir)) return false;
    const avenue = graph.avenue;
    if (!avenue) return true;
    const here = avenue[tile];
    if (here && (dir === OPPOSITE[here] || (dir === LEFT[here] && !graph.medianOpen[tile]))) return false;
    const next = tile + DIRS[dir][0] + DIRS[dir][1] * graph.size;
    const there = avenue[next];
    return !(there && dir === OPPOSITE[there]);
  }

  // The two halves of one avenue crossing (one light, one junction).
  function samePair(graph, a, b) {
    return Boolean(graph.avenue && graph.avenue[a] && graph.partner(a) === b);
  }

  // Road distances (in tiles) from one tile over its network. `toward`:
  // the distance driving to `from` instead, keeping to the one-way halves
  // of an avenue (the police chase map).
  function roadDistances(graph, from, toward = false) {
    const distance = new Int32Array(graph.size * graph.size).fill(-1);
    if (!graph.isRoad(from)) return distance;
    const queue = [from];
    distance[from] = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const tile = queue[head];
      ARMS.forEach((dir) => {
        if (!(graph.arms[tile] & dir)) return;
        const next = tile + DIRS[dir][0] + DIRS[dir][1] * graph.size;
        if (toward && !canGo(graph, next, OPPOSITE[dir])) return;
        if (distance[next] < 0) { distance[next] = distance[tile] + 1; queue.push(next); }
      });
    }
    return distance;
  }

  // --- a car's way through one tile --------------------------------------------------
  //
  // In by one edge, out by another, in the right-hand lane: a straight line,
  // or a quarter turn drawn as a quadratic curve through the corner of the
  // two lane lines, or a U-turn round the middle at a dead end.
  function tilePath(size, tile, inDir, outDir, offset, exitOffset = offset) {
    const cx = (tile % size) + 0.5;
    const cz = Math.floor(tile / size) + 0.5;
    const [ix, iz] = DIRS[inDir];
    const [ox, oz] = DIRS[outDir];
    const entry = [cx - ix * 0.5 - iz * offset, cz - iz * 0.5 + ix * offset];
    const exit = [cx + ox * 0.5 - oz * exitOffset, cz + oz * 0.5 + ox * exitOffset];
    let control;
    if (inDir === outDir) control = [(entry[0] + exit[0]) / 2, (entry[1] + exit[1]) / 2];
    else if (outDir === OPPOSITE[inDir]) control = [cx + ix * 0.35, cz + iz * 0.35];
    else {
      const along = (exit[0] - entry[0]) * ix + (exit[1] - entry[1]) * iz;
      control = [entry[0] + ix * along, entry[1] + iz * along];
    }
    const point = (t) => {
      const u = 1 - t;
      return [u * u * entry[0] + 2 * u * t * control[0] + t * t * exit[0], u * u * entry[1] + 2 * u * t * control[1] + t * t * exit[1]];
    };
    const marks = [0];
    let last = point(0);
    for (let i = 1; i <= 8; i += 1) {
      const next = point(i / 8);
      marks.push(marks[i - 1] + Math.hypot(next[0] - last[0], next[1] - last[1]));
      last = next;
    }
    return {
      length: marks[8],
      at(distance) {
        const d = Math.max(0, Math.min(marks[8], distance));
        let i = 1;
        while (i < 8 && marks[i] < d) i += 1;
        const span = marks[i] - marks[i - 1] || 1;
        const t = (i - 1 + (d - marks[i - 1]) / span) / 8;
        const p = point(t);
        const q = point(Math.min(1, t + 0.02));
        const r = point(Math.max(0, t - 0.02));
        return { x: p[0], z: p[1], heading: Math.atan2(q[1] - r[1], q[0] - r[0]) };
      },
    };
  }

  // --- traffic lights -------------------------------------------------------------------

  // Every junction of three or more arms. North-south and east-west share a
  // cycle in proportion to the traffic the city counts on each axis, with an
  // amber of three seconds; each junction starts at its own point in the
  // cycle so a street is not one long green wave.
  const AMBER = 3;
  function buildSignals(graph, snapshot, random) {
    const signals = new Map();
    const traffic = (tile) => Number(snapshot.traffic?.[tile]) || 0;
    // An avenue half's other half is beside it the whole way: the pair is a
    // junction only where a side street meets one of its halves.
    const sideStreet = (tile) => Boolean(graph.arms[tile] & OPPOSITE[LEFT[graph.avenue[tile]]]);
    graph.roads.forEach((tile) => {
      if (graph.avenue?.[tile]) {
        if (!sideStreet(tile) && !sideStreet(graph.partner(tile))) return;
      } else if (graph.armCount(tile) < 3) return;
      const size = graph.size;
      let ns = 1, ew = 1;
      if (graph.arms[tile] & 1) ns += traffic(tile - size);
      if (graph.arms[tile] & 4) ns += traffic(tile + size);
      if (graph.arms[tile] & 2) ew += traffic(tile + 1);
      if (graph.arms[tile] & 8) ew += traffic(tile - 1);
      const share = ns / (ns + ew);
      const nsGreen = 6 + 16 * share;
      const ewGreen = 6 + 16 * (1 - share);
      const cycle = nsGreen + ewGreen + AMBER * 2;
      signals.set(tile, { tile, nsGreen, ewGreen, cycle, offset: random() * cycle });
    });
    // The two halves of an avenue crossing are one junction: one timing.
    if (graph.avenue) {
      signals.forEach((signal, tile) => {
        const partner = graph.partner(tile);
        const lead = partner >= 0 ? signals.get(partner) : null;
        if (lead && partner < tile) Object.assign(signal, { nsGreen: lead.nsGreen, ewGreen: lead.ewGreen, cycle: lead.cycle, offset: lead.offset });
      });
    }
    return signals;
  }

  // The light a car meets entering `tile` travelling in `dir`.
  function lightFor(signals, tile, dir, seconds) {
    const signal = signals.get(tile);
    if (!signal) return "none";
    const t = (seconds + signal.offset) % signal.cycle;
    const northSouth = dir === 1 || dir === 4;
    const nsEnd = signal.nsGreen;
    const nsAmberEnd = nsEnd + AMBER;
    const ewEnd = nsAmberEnd + signal.ewGreen;
    if (t < nsEnd) return northSouth ? "green" : "red";
    if (t < nsAmberEnd) return northSouth ? "amber" : "red";
    if (t < ewEnd) return northSouth ? "red" : "green";
    return northSouth ? "red" : "amber";
  }

  // One light for the cars, the player and the lamp. A BRT close to the
  // line can hold or take the green; with none nearby this is lightFor.
  function signalAt(traffic, tile, dir) {
    const mod = global.AISystem6JoyrideBus;
    if (!mod || !traffic?.rail) return lightFor(traffic.signals, tile, dir, traffic.seconds);
    return mod.signalAt({
      signals: traffic.signals, tile, dir, seconds: traffic.seconds, amber: AMBER,
      rail: traffic.rail, buses: railway() ? railway().buses(traffic.rail, traffic.seconds) : [],
      size: traffic.graph.size, lightFor,
    });
  }

  // --- the street around the car ------------------------------------------------------------

  const KEEP_RADIUS = 22;   // tiles: agents further than this are dropped
  const SPAWN_NEAR = 7;     // tiles: never made closer than this to the car
  const SPAWN_FAR = 17;
  const PEDESTRIAN_KEEP = 12;

  // How busy the streets near (x, y) are: the city's traffic layer, averaged
  // over a fifteen-tile radius, 0..1.
  function localTraffic(snapshot, x, y) {
    const size = snapshot.size;
    let sum = 0, n = 0;
    for (let dy = -15; dy <= 15; dy += 3) {
      for (let dx = -15; dx <= 15; dx += 3) {
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
        const i = ty * size + tx;
        if (!snapshot.road?.[i]) continue;
        sum += Number(snapshot.traffic?.[i]) || 0;
        n += 1;
      }
    }
    return n ? Math.min(1, sum / n / 160) : 0;
  }

  // The evening rush: busiest at six, quieter either side.
  function rushFactor(clock) {
    if (!clock) return 1;
    const hour = clock.seconds / 3600;
    // The Basin's one road-traffic curve (peaks at 8 and 18) when the shared
    // core is loaded, scaled to this curve's old evening peak; else the
    // street's own single evening hump.
    const shared = global.AISystem6PotWorld?.hours?.roadTraffic;
    if (typeof shared === "function") return shared(((hour % 24) + 24) % 24) * 1.04;
    return 0.55 + 0.75 * Math.exp(-((hour - 18) ** 2) / 0.5);
  }

  // Where a layer's values sit across the city's zoned blocks: the tenth and
  // ninetieth percentiles. A city with less than six points between them is
  // even, and everything in it reads as the middle.
  function cityRange(snapshot, layer) {
    const values = [];
    const size = Number(snapshot.size) || 0;
    for (let i = 0; i < size * size; i += 1) {
      const zone = Number(snapshot.zone?.[i]) || 0;
      if (zone >= 1 && zone <= 3 && snapshot[layer]) values.push(Number(snapshot[layer][i]) || 0);
    }
    if (!values.length) return { low: 0, high: 0, even: true };
    values.sort((a, b) => a - b);
    const low = values[Math.floor(values.length * 0.1)];
    const high = values[Math.floor((values.length - 1) * 0.9)];
    return { low, high, even: high - low < 6 };
  }

  function relative(range, value) {
    if (range.even) return 0.5;
    return Math.max(0, Math.min(1, (value - range.low) / (range.high - range.low)));
  }

  // A layer averaged over the zoned blocks within `radius` tiles of (x, y).
  function districtValue(snapshot, layer, x, y, radius = 4) {
    const size = snapshot.size;
    let sum = 0, n = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
        const i = ty * size + tx;
        const zone = Number(snapshot.zone?.[i]) || 0;
        if (zone < 1 || zone > 3) continue;
        sum += Number(snapshot[layer]?.[i]) || 0;
        n += 1;
      }
    }
    return n ? sum / n : null;
  }

  // The district around a tile as the city sees it: crime and land value
  // relative to the city, police cover, how many people live and shop here.
  function district(traffic, x, y) {
    const { snapshot } = traffic;
    const crime = districtValue(snapshot, "crime", x, y);
    const land = districtValue(snapshot, "landValue", x, y);
    const covered = districtValue(snapshot, "policeCovered", x, y);
    const size = snapshot.size;
    let people = 0;
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
        const i = ty * size + tx;
        const zone = Number(snapshot.zone?.[i]) || 0;
        if (zone === 1 || zone === 2) people += 1 + (Number(snapshot.density?.[i]) === 2 ? 1 : 0);
      }
    }
    return {
      // Where nobody lives or works (a bridge, open ground) there is no
      // district crime to patrol.
      crime: crime === null ? 0 : relative(traffic.ranges.crime, crime),
      land: land === null ? 0.5 : relative(traffic.ranges.landValue, land),
      police: covered === null ? 0 : Math.min(1, covered > 1 ? covered / 255 : covered),
      people: Math.min(1, people / 60),
    };
  }

  function createTraffic(options) {
    const { snapshot, world } = options;
    const seed = Number(options.seed) >>> 0 || 1;
    const random = mulberry32(seed ^ 0x9e3779b9);
    const graph = buildRoadGraph(snapshot);
    graph.busLane = snapshot.busLane || null;
    const traffic = {
      snapshot, world, graph, seed, random,
      signals: buildSignals(graph, snapshot, mulberry32(seed ^ 0x51ed270b)),
      cars: [],
      pedestrians: [],
      riders: [],
      nextId: 1,
      seconds: 0,
      phones: placePhones(graph, snapshot, mulberry32(seed ^ 0x2545f491)),
      job: null,
      jobCount: 0,
      money: Number(options.money) || 0,
      reputation: 0,
      jobsDone: 0,
      wanted: 0,
      wantedCalm: 0,
      wrongWay: 0,
      lastOffence: -100,
      graceUntil: 5,
      busted: 0,
      bustedCount: 0,
      playerTile: -1,
      chaseMap: null,
      chaseAt: -10,
      events: [],
      clock: options.clock || null,
      // What the driver lived through, for the letter to the mayor (D4):
      // seconds crawling on congested tiles (by tile), time in the town's
      // rough blocks, stops by the police, jobs missed.
      diary: { jam: new Map(), jamSeconds: 0, roughSeconds: 0, smogSeconds: 0, railWaitSeconds: 0, busWait: null, seconds: 0, offences: 0, failed: 0 },
      ranges: { crime: cityRange(snapshot, "crime"), landValue: cityRange(snapshot, "landValue") },
      stations: {
        hospital: facilityRoad(graph, snapshot, ["hospital"]),
        fire: facilityRoad(graph, snapshot, ["fire"]),
      },
      // P3: the city's own track and stations, when the railway module is
      // loaded (it always is in the app; a test may leave it out).
      rail: options.rail || (railway() ? railway().buildRailNetwork(snapshot, options.transit || null) : null),
    };
    // Reputation carries over between shifts (the shell keeps the career).
    traffic.reputation = Number(options.reputation) || 0;
    // A payphone at every train station's door: arrivals want a cab, so
    // taxi work starts at the stations too (spec §6).
    (traffic.rail?.stations || []).forEach((station) => {
      if ((station.kind === "bus" || station.kind === "brt") && !transitPhoneIds(traffic).has(station.id)) return;
      const tile = stationRoad(traffic, station);
      if (tile < 0 || traffic.phones.some((phone) => phone.tile === tile)) return;
      const x = tile % graph.size, y = Math.floor(tile / graph.size);
      let toward = Math.sign(station.x + station.w / 2 - (x + 0.5)) || 0;
      let towardZ = toward ? 0 : Math.sign(station.y + station.h / 2 - (y + 0.5)) || 1;
      // A bus stop stands on its own road tile: the phone goes on the
      // pavement at the kerb the bus stops by (an avenue's outer pavement).
      if (station.kind === "bus" || station.kind === "brt") {
        const half = graph.avenue?.[tile];
        if (half) [toward, towardZ] = DIRS[OPPOSITE[LEFT[half]]];
        else {
          const line = traffic.rail.lines.find((candidate) => candidate.id === station.line);
          const heading = line ? railway().pointAt(traffic.rail, line, station.index).heading : 0;
          [toward, towardZ] = [-Math.round(Math.sin(heading)), Math.round(Math.cos(heading))];
        }
      }
      traffic.phones.push({
        id: traffic.phones.length, tile, tileX: x, tileY: y,
        x: x + 0.5 + toward * PAVEMENT, z: y + 0.5 + towardZ * PAVEMENT,
        zone: 2, ringingUntil: 0, quietUntil: 10, station: station.id,
      });
    });
    return traffic;
  }

  function surface(world, x, z, y) {
    const h = core().supportAt(world, x, z, Number.isFinite(y) ? y + world.step * 2 : 1e9);
    return h === -Infinity ? (Number.isFinite(y) ? y : 0) : h;
  }

  // A way on from `tile`, never straight back while another is open. Cars
  // keep out of a kerbside bus lane while any other way is open (on an
  // avenue the busway is beside them, not the whole road). `rider`: a
  // bicycle keeps the traffic's rules, a wrong-way rider keeps off the
  // avenues, a walker goes where the pavement goes.
  function randomArm(graph, tile, avoid, random, rider = null) {
    const size = graph.size;
    const nextOf = (dir) => tile + DIRS[dir][0] + DIRS[dir][1] * size;
    const open = (dir) => {
      const next = nextOf(dir);
      if (rider) return !(rider.wrongWay && graph.avenue?.[next]);
      return !graph.busLane || !Number(graph.busLane[next]) || Boolean(graph.avenue?.[next]);
    };
    const free = rider && (rider.wrongWay || rider.walker);
    // A walker crosses an avenue at a crossing or its end, not over the hedge.
    const half = graph.avenue?.[tile];
    const overMedian = (dir) => half && dir === LEFT[half] && !graph.medianOpen[tile];
    const legal = ARMS.filter((dir) => (free ? (graph.arms[tile] & dir) && !(rider.walker && overMedian(dir)) : canGo(graph, tile, dir)));
    const all = legal.filter((dir) => dir !== avoid);
    const options = all.some(open) ? all.filter(open) : all;
    if (!options.length) {
      if (legal.length) return legal.includes(avoid) ? avoid : legal[0];
      return avoid || ARMS.find((dir) => graph.arms[tile] & dir) || 2;
    }
    return options[Math.floor(random() * options.length)];
  }

  function enterTile(agent, graph, tile, inDir, outDir, offset, exitOffset = offset) {
    agent.tile = tile;
    agent.inDir = inDir;
    agent.outDir = outDir;
    agent.s = 0;
    agent.path = tilePath(graph.size, tile, inDir, outDir, offset, exitOffset);
  }

  // Where across the road an agent crosses the edge from `a` into `b`: in
  // its own lane along an avenue, in the right-hand lane (or its non-motor
  // lane) everywhere else.
  function edgeOffset(graph, a, b, dir, agent) {
    if (agent.laneOffset !== undefined) return agent.laneOffset;
    const avenue = graph.avenue;
    if (avenue && avenue[a] === dir && b >= 0 && b < avenue.length && avenue[b] === dir) {
      const lanes = graph.busLane?.[a] ? AVENUE_LANES : AVENUE_LANES_OPEN;
      return lanes[(agent.lane || 0) % lanes.length];
    }
    return LANE;
  }

  // An agent entering `tile` by `inDir` and leaving it by `outDir`.
  function routeThrough(agent, graph, tile, inDir, outDir) {
    const size = graph.size;
    const from = tile - DIRS[inDir][0] - DIRS[inDir][1] * size;
    const to = tile + DIRS[outDir][0] + DIRS[outDir][1] * size;
    enterTile(agent, graph, tile, inDir, outDir, edgeOffset(graph, from, tile, inDir, agent), edgeOffset(graph, tile, to, outDir, agent));
  }

  function makeCar(traffic, tile, kind) {
    const { graph, random, world } = traffic;
    const inDir = randomArm(graph, tile, 0, random);
    const outDir = randomArm(graph, tile, OPPOSITE[inDir], random);
    const agent = {
      id: traffic.nextId++,
      kind,
      frame: kind === "police" ? "agent.service.police" : `agent.car.${1 + Math.floor(random() * 4)}`,
      cruise: (kind === "police" ? 70 : 34 + random() * 14) * KMH,
      speed: 0,
      wait: 0,
      lane: Math.floor(random() * 3),
      x: 0, z: 0, y: 0, heading: 0,
    };
    routeThrough(agent, graph, tile, inDir, outDir);
    const p = agent.path.at(0);
    agent.x = p.x; agent.z = p.z; agent.heading = p.heading;
    agent.y = surface(world, p.x, p.z, null);
    return agent;
  }

  // On an avenue half the only pavement is on its outer side.
  function pavementSide(graph, tile, dir, side) {
    const here = graph.avenue?.[tile];
    if (!here) return side;
    return dir === here ? 1 : dir === OPPOSITE[here] ? -1 : side;
  }

  const WALKER = Object.freeze({ walker: true });

  function makePedestrian(traffic, tile) {
    const { graph, random, world } = traffic;
    const dir = randomArm(graph, tile, 0, random, WALKER);
    const side = pavementSide(graph, tile, dir, random() < 0.5 ? -1 : 1);
    const agent = {
      id: traffic.nextId++,
      frame: `agent.pedestrian.${1 + Math.floor(random() * 2)}`,
      side, speed: (1.1 + random() * 0.5) * METRE,
      dodge: null, x: 0, z: 0, y: 0, heading: 0,
    };
    enterTile(agent, graph, tile, OPPOSITE[dir] || dir, dir, PAVEMENT * side);
    agent.inDir = dir;
    agent.path = tilePath(graph.size, tile, dir, dir, PAVEMENT * side);
    const p = agent.path.at(agent.path.length * random());
    agent.s = agent.path.length * random();
    Object.assign(agent, { x: p.x, z: p.z, heading: p.heading, y: surface(world, p.x, p.z, null) });
    return agent;
  }

  // Road tiles in a ring around the car, free of other agents.
  function spawnTile(traffic, car, near, far, others) {
    const { graph, random } = traffic;
    const size = graph.size;
    const px = Math.floor(car.x), pz = Math.floor(car.z);
    for (let tries = 0; tries < 24; tries += 1) {
      const angle = random() * Math.PI * 2;
      const radius = near + random() * (far - near);
      const x = Math.round(px + Math.cos(angle) * radius);
      const z = Math.round(pz + Math.sin(angle) * radius);
      if (x < 0 || z < 0 || x >= size || z >= size) continue;
      const tile = z * size + x;
      if (!graph.isRoad(tile)) continue;
      // Not in a kerbside bus lane (an avenue's busway is beside its lanes).
      if (Number(graph.busLane?.[tile]) > 0 && !graph.avenue?.[tile]) continue;
      if (graph.component[tile] !== graph.component[traffic.playerTile] && traffic.playerTile >= 0) continue;
      if (others.some((agent) => Math.abs(agent.x - (x + 0.5)) < 2 && Math.abs(agent.z - (z + 0.5)) < 2)) continue;
      return tile;
    }
    return -1;
  }

  // --- moving one car ---------------------------------------------------------------

  // Something ahead in this car's lane: another car or the player, within a
  // cone two metres either side of its line of travel.
  function gapAhead(agent, others, player) {
    const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
    let gap = Infinity;
    const check = (x, z) => {
      const dx = x - agent.x, dz = z - agent.z;
      const ahead = dx * c + dz * s;
      const side = -dx * s + dz * c;
      if (ahead > 0 && ahead < 1.6 && Math.abs(side) < 2.3 * METRE) gap = Math.min(gap, ahead - 6.2 * METRE);
    };
    others.forEach((other) => { if (other !== agent) check(other.x, other.z); });
    if (player) check(player.x, player.z);
    return gap;
  }

  function stepCarAgent(traffic, agent, player, dt) {
    const { graph, signals, world } = traffic;
    const size = graph.size;
    const next = agent.tile + DIRS[agent.outDir][0] + DIRS[agent.outDir][1] * size;
    // A tile the city counts as congested really is: everyone crawls.
    const jammed = Number(traffic.snapshot.congested?.[agent.tile]) > 0;
    let target = agent.cruise * (jammed ? 0.45 : 1);
    // The fastest a car may go and still stop within `distance`, braking a
    // little below its limit.
    const BRAKE = 7 * METRE;
    const stopping = (distance) => Math.sqrt(2 * BRAKE * Math.max(0, distance));
    // Police on a chase drive the network toward the car and ignore lights.
    const chasing = agent.kind === "police" && traffic.wanted > 0;
    // A level crossing with a train coming stops everyone, police included.
    if (crossingClosed(traffic, next)) target = Math.min(target, stopping(agent.path.length - agent.s - 0.3));
    // Across the median of an avenue crossing the car is already in the
    // junction: it does not stop there for the second half's light.
    if (!chasing && !samePair(graph, agent.tile, next)) {
      const light = signalAt(traffic, next, agent.outDir);
      const toLine = agent.path.length - agent.s;
      if (light === "red" || light === "amber") {
        // Stop at the line, unless amber caught the car too close to stop.
        const room = toLine - 0.04;
        const canStop = agent.speed * agent.speed / (2 * 9 * METRE) <= room + 0.02;
        if (light === "red" || canStop) target = Math.min(target, stopping(room));
      }
    }
    const gap = Math.min(gapAhead(agent, traffic.cars, player), gapAhead(agent, busesNear(traffic, agent, 2), null));
    if (gap < Infinity) target = Math.min(target, stopping(gap - 1.5 * METRE));
    if (agent.shaken > 0) { agent.shaken -= dt; target = 0; }
    agent.braking = target < agent.speed - 0.5 * KMH || agent.speed < 1 * KMH;
    const accel = target > agent.speed ? 3.2 * METRE : 9 * METRE;
    agent.speed += Math.max(-accel * dt, Math.min(accel * dt, target - agent.speed));
    agent.s += agent.speed * dt;
    while (agent.s >= agent.path.length) {
      const carry = agent.s - agent.path.length;
      if (!graph.isRoad(next)) { agent.s = agent.path.length; agent.speed = 0; break; }
      let outDir;
      if (chasing && traffic.chaseMap) {
        // One step down the road distance to the car.
        let best = Infinity;
        ARMS.forEach((dir) => {
          if (!canGo(graph, next, dir)) return;
          const after = next + DIRS[dir][0] + DIRS[dir][1] * size;
          const d = traffic.chaseMap[after];
          if (d >= 0 && (d < best || (d === best && dir !== OPPOSITE[agent.outDir]))) { best = d; outDir = dir; }
        });
      }
      if (!outDir) outDir = randomArm(graph, next, OPPOSITE[agent.outDir], traffic.random);
      routeThrough(agent, graph, next, agent.outDir, outDir);
      agent.s = carry;
    }
    const p = agent.path.at(agent.s);
    agent.x = p.x; agent.z = p.z; agent.heading = p.heading;
    agent.y = surface(world, p.x, p.z, agent.y);
  }

  // --- pedestrians -------------------------------------------------------------------
  //
  // They walk the pavement line along each road tile, turning at its end
  // like the cars. D3: a pedestrian always gets out of the way. When the car
  // is coming at one, the pedestrian steps sideways off its line, and keeps
  // going until clear of the car's whole width.

  function stepPedestrian(traffic, agent, player, dt) {
    const { graph, world } = traffic;
    const size = graph.size;
    if (player) {
      const c = Math.cos(player.heading), s = Math.sin(player.heading);
      const dx = agent.x - player.x, dz = agent.z - player.z;
      const ahead = dx * c + dz * s;
      const side = -dx * s + dz * c;
      const speed = Math.abs(player.speed);
      const reach = CAR_HALF_LENGTH + Math.max(1.5 * METRE, speed * 1.2);
      const clear = CAR_HALF_WIDTH + 1.2 * METRE;
      const forward = player.speed >= 0 ? ahead : -ahead;
      if (forward > -CAR_HALF_LENGTH && forward < reach && Math.abs(side) < clear) {
        // Step out of the car's way, on the side the pedestrian already is.
        const away = side >= 0 ? 1 : -1;
        const need = clear + 0.2 * METRE - Math.abs(side);
        // A quick sidestep, seven metres a second; only when the car is
        // already at them is it a jump.
        const imminent = forward < CAR_HALF_LENGTH + 2 * METRE;
        const move = imminent ? need : Math.min(need, 7 * METRE * dt);
        agent.x += -s * away * move;
        agent.z += c * away * move;
        agent.heading = Math.atan2(c * away, -s * away);
        agent.dodge = 1.2;
      }
    }
    if (agent.dodge > 0) {
      agent.dodge -= dt;
      agent.y = surface(world, agent.x, agent.z, agent.y);
      return;
    }
    agent.s += agent.speed * dt;
    if (agent.s >= agent.path.length) {
      const next = agent.tile + DIRS[agent.inDir][0] + DIRS[agent.inDir][1] * size;
      const tile = graph.isRoad(next) ? next : agent.tile;
      const dir = graph.isRoad(next) ? randomArm(graph, next, OPPOSITE[agent.inDir], traffic.random, WALKER) : OPPOSITE[agent.inDir];
      agent.tile = tile;
      agent.inDir = dir;
      agent.side = pavementSide(graph, tile, dir, agent.side);
      agent.s = 0;
      agent.path = tilePath(size, tile, dir, dir, PAVEMENT * agent.side);
    }
    const p = agent.path.at(agent.s);
    // Back onto the line after a dodge, gently.
    agent.x += (p.x - agent.x) * Math.min(1, dt * 2);
    agent.z += (p.z - agent.z) * Math.min(1, dt * 2);
    agent.heading = p.heading;
    agent.y = surface(world, agent.x, agent.z, agent.y);
  }

  // --- bicycles and e-bikes ------------------------------------------------------------
  //
  // They ride the non-motor lane at the kerb. In an evening rush most are
  // e-bikes; a third of those go through a red light when they can, and a
  // few ride against the flow. A jam does not hold them: they filter past.
  // Knocked down, a rider lies in the road a few seconds and gets up, and
  // the police count it.

  const RIDER_KEEP = 13;
  const RIDER_HALF_LENGTH = 0.9 * METRE;
  const RIDER_HALF_WIDTH = 0.35 * METRE;

  function makeRider(traffic, tile) {
    const { graph, random, world } = traffic;
    const ebike = random() < 0.72;
    const rider = {
      id: traffic.nextId++,
      kind: ebike ? "ebike" : "bicycle",
      cruise: (ebike ? 19 + random() * 13 : 12 + random() * 7) * KMH,
      wrongWay: ebike && random() < 0.08,
      runsReds: ebike && random() < 0.33,
      look: Math.floor(random() * 1e6),
      speed: 0, down: 0, x: 0, z: 0, y: 0, heading: 0,
    };
    rider.laneOffset = rider.wrongWay ? -BIKE_LANE : BIKE_LANE;
    const inDir = randomArm(graph, tile, 0, random, rider);
    const outDir = randomArm(graph, tile, OPPOSITE[inDir], random, rider);
    routeThrough(rider, graph, tile, inDir, outDir);
    rider.s = rider.path.length * random() * 0.6;
    const p = rider.path.at(rider.s);
    Object.assign(rider, { x: p.x, z: p.z, heading: p.heading, y: surface(world, p.x, p.z, null) });
    return rider;
  }

  // The nearest thing ahead on an agent's line within `reach`: other riders
  // on it, and the player's car when any of its width is in the way.
  function riderGap(agent, riders, player) {
    const c = Math.cos(agent.heading), s = Math.sin(agent.heading);
    let gap = Infinity;
    // `reach`: centre to centre where the two would touch.
    const check = (x, z, width, reach) => {
      const dx = x - agent.x, dz = z - agent.z;
      const ahead = dx * c + dz * s;
      const side = -dx * s + dz * c;
      if (ahead > 0 && ahead < 0.6 && Math.abs(side) < width) gap = Math.min(gap, ahead - reach);
    };
    riders.forEach((other) => { if (other !== agent && !(other.down > 0)) check(other.x, other.z, 0.8 * METRE, 2 * RIDER_HALF_LENGTH); });
    if (player) check(player.x, player.z, CAR_HALF_WIDTH + RIDER_HALF_WIDTH + 0.2 * METRE, CAR_HALF_LENGTH + RIDER_HALF_LENGTH);
    return gap;
  }

  function stepRider(traffic, agent, player, dt) {
    const { graph, signals, world } = traffic;
    const size = graph.size;
    if (agent.down > 0) {
      agent.down = Math.max(0, agent.down - dt);
      agent.speed = 0;
      return;
    }
    const next = agent.tile + DIRS[agent.outDir][0] + DIRS[agent.outDir][1] * size;
    const BRAKE = 4 * METRE;
    const stopping = (distance) => Math.sqrt(2 * BRAKE * Math.max(0, distance));
    let target = agent.cruise;
    const toLine = agent.path.length - agent.s;
    if (crossingClosed(traffic, next)) target = Math.min(target, stopping(toLine - 0.3));
    if (!samePair(graph, agent.tile, next)) {
      const light = agent.wrongWay ? "none" : signalAt(traffic, next, agent.outDir);
      if (light === "red" && agent.runsReds) target = Math.min(target, agent.cruise * 0.7);
      else if (light === "red" || (light === "amber" && agent.speed * agent.speed / (2 * BRAKE) <= toLine)) target = Math.min(target, stopping(toLine - 0.05));
    }
    const gap = riderGap(agent, traffic.riders, player);
    if (gap < Infinity) target = Math.min(target, stopping(gap - 0.6 * METRE));
    const accel = target > agent.speed ? 2.2 * METRE : 6 * METRE;
    agent.speed += Math.max(-accel * dt, Math.min(accel * dt, target - agent.speed));
    agent.s += agent.speed * dt;
    while (agent.s >= agent.path.length) {
      const carry = agent.s - agent.path.length;
      if (!graph.isRoad(next)) { agent.s = agent.path.length; agent.speed = 0; break; }
      const outDir = randomArm(graph, next, OPPOSITE[agent.outDir], traffic.random, agent);
      routeThrough(agent, graph, next, agent.outDir, outDir);
      agent.s = carry;
    }
    const p = agent.path.at(agent.s);
    agent.x = p.x; agent.z = p.z; agent.heading = p.heading;
    agent.y = surface(world, p.x, p.z, agent.y);
  }

  // --- payphones and jobs ------------------------------------------------------------
  //
  // GTA's way: a payphone at the kerb rings, the driver pulls up, the job is
  // theirs. The phones stand on the pavement of road tiles beside the town's
  // homes, shops and works, spread apart; two ring at a time. Every job reads
  // the city: a taxi fare in the evening rush goes from work to home, a
  // parcel from a shop or a works, a street race runs over real roads, and a
  // stunt asks for speed over the bridge or the longest straight.

  const JOB_KINDS = Object.freeze(["taxi", "delivery", "race", "stunt", "ambulance", "fire", "train", "bus"]);

  // BRT: a phone at every stop. A bus: only its two ends. Four phones in all,
  // nearest the city's centre first. A loop has no end, so it has none.
  function transitPhoneIds(traffic) {
    const home = traffic.snapshot?.spawnCenter || { x: (traffic.graph?.size || 0) / 2, y: (traffic.graph?.size || 0) / 2 };
    const stations = traffic.rail?.stations || [];
    const picked = [];
    (traffic.rail?.lines || []).forEach((line) => {
      const stops = (line.stops || []).map((id) => stations.find((station) => station.id === id)).filter(Boolean);
      if (line.kind === "brt") picked.push(...stops);
      else if (line.kind === "bus" && !line.loop && stops.length) {
        picked.push(stops[0]);
        if (stops[stops.length - 1].id !== stops[0].id) picked.push(stops[stops.length - 1]);
      }
    });
    const seen = new Set();
    return new Set(picked
      .filter((station) => (seen.has(station.id) ? false : seen.add(station.id)))
      .sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 4)
      .map((station) => station.id));
  }

  function zoneBeside(snapshot, size, tile) {
    const x = tile % size, y = Math.floor(tile / size);
    const zones = [];
    ARMS.forEach((dir) => {
      const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
      const zone = Number(snapshot.zone?.[ny * size + nx]) || 0;
      if (zone >= 1 && zone <= 3) zones.push({ zone, dir });
    });
    return zones;
  }

  function placePhones(graph, snapshot, random) {
    const size = graph.size;
    const candidates = graph.roads
      .map((tile) => ({ tile, zones: zoneBeside(snapshot, size, tile) }))
      .filter((entry) => entry.zones.length && graph.armCount(entry.tile) === 2);
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const phones = [];
    for (const entry of candidates) {
      const x = entry.tile % size, y = Math.floor(entry.tile / size);
      if (phones.some((phone) => Math.abs(phone.tileX - x) + Math.abs(phone.tileY - y) < 6)) continue;
      const side = entry.zones[0].dir;
      // On the pavement, on the side of the block.
      phones.push({
        id: phones.length,
        tile: entry.tile, tileX: x, tileY: y,
        x: x + 0.5 + DIRS[side][0] * PAVEMENT,
        z: y + 0.5 + DIRS[side][1] * PAVEMENT,
        zone: entry.zones[0].zone,
        ringingUntil: 0,
        quietUntil: random() * 30,
      });
      if (phones.length >= 8) break;
    }
    return phones;
  }

  function roadTilesBeside(graph, snapshot, zones) {
    const size = graph.size;
    return graph.roads.filter((tile) => zoneBeside(snapshot, size, tile).some((entry) => zones.includes(entry.zone)));
  }

  // A job from a phone, deterministic from the seed and the job number.
  function makeJob(traffic, phone) {
    const { graph, snapshot } = traffic;
    const random = mulberry32((traffic.seed ^ Math.imul(traffic.jobCount + 1, 0x9e3779b1)) >>> 0);
    const distance = roadDistances(graph, phone.tile);
    const reachable = (tile) => distance[tile] > 0;
    const pick = (tiles, min, max) => {
      const fit = tiles.filter((tile) => reachable(tile) && distance[tile] >= min && distance[tile] <= max);
      const pool = fit.length ? fit : tiles.filter(reachable);
      return pool.length ? pool[Math.floor(random() * pool.length)] : -1;
    };
    // Emergency work comes from the city's own stations; a driver with a bad
    // name is offered only the risky jobs.
    // Catching a train needs a station the car can reach and a train that
    // stops there.
    const railStations = (traffic.rail?.stations || [])
      .filter((station) => station.kind === "rail" || station.kind === "subway")
      .map((station) => ({ station, road: stationRoad(traffic, station) }))
      .filter((entry) => entry.road >= 0 && distance[entry.road] >= 4 && railway().nextDeparture(traffic.rail, entry.station.id, traffic.seconds) !== null);
    const kinds = traffic.reputation <= -3 ? ["race", "stunt"] : JOB_KINDS.filter((k) => k !== "bus" && (k === "train" ? railStations.length > 0
      : !["ambulance", "fire"].includes(k) || (k === "ambulance" ? traffic.stations?.hospital >= 0 : traffic.stations?.fire >= 0)));
    const drawn = kinds[(traffic.jobCount + Math.floor(random() * kinds.length)) % kinds.length];
    const atStation = phone.station ? (traffic.rail?.stations || []).find((station) => station.id === phone.station) : null;
    const busStop = atStation && (atStation.kind === "bus" || atStation.kind === "brt");
    const kind = busStop && traffic.reputation > -3 ? "bus" : phone.station && kinds.includes("taxi") ? "taxi" : drawn;
    const base = { id: traffic.jobCount + 1, kind, phone: phone.id, from: phone.tile, accepted: traffic.seconds };
    const district0 = district(traffic, phone.tileX, phone.tileY);
    // Pay follows reputation, and risky work pays more where crime is high.
    const payScale = Math.max(0.6, 1 + 0.05 * Math.max(-5, Math.min(10, traffic.reputation)));
    const risky = 1 + 0.5 * district0.crime;
    const scaled = (job) => (job ? { ...job, pay: Math.round(job.pay * payScale * (job.kind === "race" || job.kind === "stunt" ? risky : 1)) } : job);
    const job = makeKind(kind);
    return scaled(job) || scaled(makeKind("stunt"));
    function makeKind(kind) {
    const base1 = { ...base, kind };
    const size = graph.size;
    if (kind === "ambulance" || kind === "fire") {
      // To the station for the vehicle, then to the call, stopping there.
      const station = kind === "ambulance" ? traffic.stations.hospital : traffic.stations.fire;
      const risk = kind === "fire" ? "fireRisk" : null;
      const homes = roadTilesBeside(graph, snapshot, kind === "fire" ? [1, 2, 3] : [1]).filter((tile) => reachable(tile) && tile !== station);
      if (!homes.length || !reachable(station)) return null;
      const fromStation = roadDistances(graph, station);
      let call = homes[Math.floor(random() * homes.length)];
      // A real fire first: the road beside a block the city has burning.
      const burning = kind === "fire" ? burningTiles(snapshot) : [];
      if (burning.length) {
        let best = -1, bestD = Infinity;
        graph.roads.forEach((tile) => {
          if (!reachable(tile)) return;
          const x = tile % size, y = Math.floor(tile / size);
          burning.forEach((b) => { const d = Math.abs(b % size - x) + Math.abs(Math.floor(b / size) - y); if (d < bestD) { bestD = d; best = tile; } });
        });
        if (best >= 0 && bestD <= 3) {
          const fromStationReal = roadDistances(graph, station);
          const runReal = distance[station] + Math.max(0, fromStationReal[best]);
          return { ...base1, targets: [station, best], deadline: traffic.seconds + 25 + runReal * 2.2, pay: Math.round(120 + fromStationReal[best] * 10), stop: true, vehicle: "agent.service.fire", vehicleFrom: 1, realFire: true };
        }
      }
      if (risk) {
        // The tile beside the riskiest block on fire.
        let worst = -1;
        homes.forEach((tile) => {
          const value = Math.max(...zoneBeside(snapshot, size, tile).map((entry) => {
            const x = (tile % size) + DIRS[entry.dir][0], y = Math.floor(tile / size) + DIRS[entry.dir][1];
            return Number(snapshot.fireRisk?.[y * size + x]) || 0;
          }));
          if (value > worst) { worst = value; call = tile; }
        });
      }
      const covered = kind === "fire" ? snapshot.fireCovered : snapshot.healthCovered;
      const uncovered = covered && !covered[call] ? 1.5 : 1;
      const run = distance[station] + Math.max(0, fromStation[call]);
      return { ...base1, targets: [station, call], deadline: traffic.seconds + 25 + run * 2.2, pay: Math.round((80 + fromStation[call] * 8) * uncovered), stop: true, vehicle: kind === "fire" ? "agent.service.fire" : "agent.service.medical", vehicleFrom: 1 };
    }
    if (kind === "bus") {
      const stop = (traffic.rail?.stations || []).find((station) => station.id === phone.station);
      const line = traffic.rail?.lines?.find((candidate) => candidate.id === stop?.line);
      if (!stop || !line || (line.stops || []).length < 3) return null;
      const start = line.stops.indexOf(stop.id);
      if (start < 0) return null;
      const ids = [stop.id];
      for (let step = 1; ids.length < 5; step += 1) {
        const at = start + step;
        if (!line.loop && at >= line.stops.length) break;
        const id = line.stops[at % line.stops.length];
        if (ids.includes(id)) break;
        ids.push(id);
        if (ids.length === 5) break;
      }
      const targets = ids.slice(1).map((id) => {
        const next = traffic.rail.stations.find((station) => station.id === id);
        return next ? next.y * size + next.x : -1;
      }).filter((tile) => tile >= 0);
      if (!targets.length) return null;
      const schedule = global.AISystem6JoyrideBus?.scheduleFor?.(line, ids, traffic.seconds) || [];
      const deadline = (schedule[schedule.length - 1] || traffic.seconds) + 30;
      return { ...base1, targets, deadline, pay: 60, stop: true, vehicle: "agent.bus.1", vehicleFrom: 0, bus: true, schedule, arrivals: [] };
    }
    if (kind === "train") {
      // A passenger with a train to catch: the first departure the car can
      // still make, a little slack included. Late is late; the train goes.
      const { station, road } = railStations[Math.floor(random() * railStations.length)];
      const earliest = traffic.seconds + 15 + distance[road] * 1.8;
      const depart = railway().nextDeparture(traffic.rail, station.id, earliest);
      if (depart !== null) return { ...base1, targets: [road], deadline: depart, pay: 70 + distance[road] * 7, stop: true, train: { station: station.id, depart } };
    }
    if (kind === "taxi") {
      // The evening rush runs from work to home.
      const target = pick(roadTilesBeside(graph, snapshot, [1]), 6, 28);
      if (target >= 0) return { ...base1, targets: [target], deadline: traffic.seconds + 30 + distance[target] * 2.6, pay: 40 + distance[target] * 6, stop: true };
    }
    if (kind === "delivery") {
      const target = pick(roadTilesBeside(graph, snapshot, [2, 3]), 5, 26);
      if (target >= 0) return { ...base1, targets: [target], deadline: traffic.seconds + 18 + distance[target] * 2, pay: 60 + distance[target] * 7, stop: true };
    }
    if (kind === "race") {
      // Checkpoints a growing road distance out: a run through the network.
      const tiles = graph.roads.filter(reachable);
      const targets = [];
      let total = 0, from = phone.tile;
      for (let i = 0; i < 4 && tiles.length; i += 1) {
        const step = roadDistances(graph, from);
        const ring = tiles.filter((tile) => step[tile] >= 5 && step[tile] <= 9 && !targets.includes(tile));
        if (!ring.length) break;
        const next = ring[Math.floor(random() * ring.length)];
        total += step[next];
        targets.push(next);
        from = next;
      }
      if (targets.length >= 2) return { ...base1, targets, deadline: traffic.seconds + 12 + total * 1.7, pay: 90 + total * 6, stop: false };
    }
    // Stunt: through a gate on the bridge (a road over water) or on the
    // longest straight, at 90 km/h or more.
    const bridge = graph.roads.filter((tile) => reachable(tile) && snapshot.water?.[tile]);
    const straight = graph.roads.filter((tile) => {
      if (!reachable(tile) || graph.armCount(tile) !== 2) return false;
      return (graph.arms[tile] & 5) === 5 || (graph.arms[tile] & 10) === 10;
    });
    const gates = bridge.length ? bridge : straight;
    if (!gates.length) return null;
    const gate = gates[Math.floor(gates.length / 2 + (random() - 0.5) * Math.min(gates.length, 6)) % gates.length];
    return { ...base1, kind: "stunt", targets: [gate], deadline: traffic.seconds + 60 + distance[gate] * 1.5, pay: 120, stop: false, minKmh: 90 };
    }
  }

  function stepPhones(traffic, car) {
    const { phones } = traffic;
    const ringing = phones.filter((phone) => phone.ringingUntil > traffic.seconds);
    // A good name rings more phones at once; a bad one fewer.
    const lines = traffic.reputation >= 5 ? 3 : traffic.reputation <= -3 ? 1 : 2;
    if (!traffic.job && ringing.length < lines) {
      const quiet = phones.filter((phone) => phone.ringingUntil <= traffic.seconds && phone.quietUntil <= traffic.seconds);
      if (quiet.length) {
        const phone = quiet[Math.floor(traffic.random() * quiet.length)];
        phone.ringingUntil = traffic.seconds + 50;
        phone.quietUntil = traffic.seconds + 80;
      }
    }
    if (traffic.job) return;
    // Pull up beside a ringing phone and the job is yours.
    for (const phone of phones) {
      if (phone.ringingUntil <= traffic.seconds) continue;
      const near = Math.hypot(car.x - phone.x, car.z - phone.z) < 11 * METRE;
      if (!near || Math.abs(car.speed) > 9 * KMH) continue;
      const job = makeJob(traffic, phone);
      traffic.jobCount += 1;
      phone.ringingUntil = 0;
      if (!job) continue;
      traffic.job = { ...job, stage: 0 };
      traffic.events.push({ type: "job-start", kind: job.kind, id: job.id });
      return;
    }
  }

  function stepJob(traffic, car) {
    const job = traffic.job;
    if (!job) return;
    const size = traffic.graph.size;
    if (traffic.seconds > job.deadline) {
      traffic.reputation -= 1;
      traffic.diary.failed += 1;
      traffic.events.push({ type: "job-failed", kind: job.kind, id: job.id });
      traffic.job = null;
      return;
    }
    const target = job.targets[job.stage];
    const tx = (target % size) + 0.5, tz = Math.floor(target / size) + 0.5;
    const close = Math.hypot(car.x - tx, car.z - tz) < 0.85;
    const kmh = Math.abs(car.speed) / KMH;
    if (job.bus) {
      if (!(close && kmh <= 3)) { job.holdFrom = null; return; }
      if (job.holdFrom == null) job.holdFrom = traffic.seconds;
      if (traffic.seconds - job.holdFrom < 4) return;
      job.holdFrom = null;
      job.arrivals = [...(job.arrivals || []), traffic.seconds];
    } else {
      const arrived = close && (job.stop ? kmh < 16 : job.minKmh ? kmh >= job.minKmh : true);
      if (!arrived) return;
    }
    job.stage += 1;
    if (job.stage < job.targets.length) {
      traffic.events.push({ type: "checkpoint", id: job.id, stage: job.stage });
      return;
    }
    if (job.bus && global.AISystem6JoyrideBus) job.pay = global.AISystem6JoyrideBus.settleBusJob(job.schedule?.slice(1) || [], job.arrivals || []).pay;
    const left = Math.max(0, job.deadline - traffic.seconds);
    const tip = job.kind === "taxi" ? Math.round(Math.min(0.5, left / 60) * job.pay) : 0;
    traffic.money += job.pay + tip;
    traffic.reputation += 1;
    traffic.jobsDone += 1;
    traffic.events.push({ type: "job-done", kind: job.kind, id: job.id, pay: job.pay, tip });
    traffic.job = null;
  }

  // --- wanted -----------------------------------------------------------------------------
  //
  // Running a red, driving on the wrong side, and hitting another car at
  // speed raise the wanted level (0..5). Police come from the city's police
  // station when it has one, as many cars as the level, a little slower than
  // the player's top speed so a getaway is possible. Stop near one and you
  // are pulled over: a fine, the level cleared. Get far enough away, long
  // enough, and they give up: the level falls a step at a time.

  function offence(traffic, amount, why, car = null) {
    // A car that has just been put on the road is not fined yet (the first
    // pedal is free: no red light before it has had a chance to stop).
    if (traffic.seconds < (traffic.graceUntil || 0)) return;
    if (traffic.seconds - traffic.lastOffence < 2 && why !== "police-hit") return;
    traffic.lastOffence = traffic.seconds;
    // A patrol car that sees it makes it worse.
    const witnessed = car && traffic.cars.some((agent) => agent.kind === "police" && Math.hypot(agent.x - car.x, agent.z - car.z) < 8);
    traffic.wanted = Math.min(5, traffic.wanted + amount + (witnessed && why !== "police-hit" ? 1 : 0));
    traffic.wantedCalm = 0;
    traffic.diary.offences += 1;
    traffic.events.push({ type: "wanted", level: traffic.wanted, why });
  }

  // Tiles the city has on fire (blaze 1..4; 5 is rubble, 6 flooded).
  function burningTiles(snapshot) {
    const out = [];
    const blaze = snapshot.blaze;
    if (!blaze) return out;
    for (let i = 0; i < blaze.length; i += 1) if (blaze[i] >= 1 && blaze[i] <= 4) out.push(i);
    return out;
  }

  // The road tile nearest a facility of one of `kinds`, or -1 when the
  // city has none.
  function facilityRoad(graph, snapshot, kinds) {
    const size = graph.size;
    const station = (snapshot.facilities || []).find((facility) => kinds.includes(String(facility.kind || "").toLowerCase()));
    if (!station) return -1;
    let best = -1, bestD = Infinity;
    graph.roads.forEach((tile) => {
      const d = Math.abs((tile % size) - station.x) + Math.abs(Math.floor(tile / size) - station.y);
      if (d < bestD) { bestD = d; best = tile; }
    });
    return best;
  }

  function policeHome(traffic) {
    return facilityRoad(traffic.graph, traffic.snapshot, ["police"]);
  }

  function cameraFine(traffic, car, why) {
    if (traffic.seconds < (traffic.graceUntil || 0)) return;
    const job = traffic.job;
    if (job?.bus) return;
    if (job?.vehicle && /service\.(police|fire|medical)/.test(String(job.vehicle))) return;
    const rule = global.AISystem6JoyrideBus?.cameraRule?.({
      speed: Math.abs(car?.speed || 0) / KMH, seconds: 1.5, inBusLane: true, junction: false, exempt: false,
    }) || { fine: 50 };
    traffic.money = Math.max(0, traffic.money - rule.fine);
    traffic.events.push({ type: "camera", why, fine: rule.fine });
    const witnessed = car && traffic.cars.some((agent) => agent.kind === "police" && Math.hypot(agent.x - car.x, agent.z - car.z) < 8);
    if (witnessed) offence(traffic, 0, why, car);
  }

  function stepWanted(traffic, car, dt) {
    const { graph } = traffic;
    const size = graph.size;
    const tile = Math.floor(car.z) * size + Math.floor(car.x);
    let laneTime = traffic.laneTime || { busway: 0, bike: 0, against: 0, kerb: 0 };
    // Entering a junction against the light.
    if (tile !== traffic.playerTile && traffic.playerTile >= 0 && graph.isRoad(tile)) {
      const dx = (tile % size) - (traffic.playerTile % size);
      const dy = Math.floor(tile / size) - Math.floor(traffic.playerTile / size);
      const dir = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : dy === -1 ? 1 : 0;
      if (dir && Math.abs(car.speed) > 12 * KMH && !samePair(graph, traffic.playerTile, tile) && signalAt(traffic, tile, dir) === "red") offence(traffic, 1, "red-light", car);
      if (Math.abs(car.speed) > 5 * KMH && crossingClosed(traffic, tile)) offence(traffic, 1, "crossing", car);
    }
    // A kerbside bus lane is the whole of a narrow street's lane.
    // Crossing it, or turning in or out, at a junction is not using it.
    const inKerb = Math.abs(car.speed) > 10 * KMH && Number(traffic.snapshot.busLane?.[tile]) > 0 && !graph.avenue?.[tile] && graph.armCount(tile) < 3;
    laneTime.kerb = inKerb ? laneTime.kerb + dt : 0;
    if (laneTime.kerb >= 1.5) { cameraFine(traffic, car, "bus-lane"); laneTime.kerb = -10; }
    // Where the car is across its tile: metres out from an avenue's median,
    // or from an ordinary street's centre line, along the road's axis.
    const ax = Math.floor(car.x), az = Math.floor(car.z);
    const fx = car.x - ax - 0.5, fz = car.z - az - 0.5;
    const half = graph.avenue?.[tile] || 0;
    const moving = Math.abs(car.speed);
    if (half && !graph.medianOpen[tile]) {
      const [lx, lz] = DIRS[LEFT[half]];
      const fromMedian = 0.5 - (fx * lx + fz * lz);
      const [hx, hz] = DIRS[half];
      const along = Math.cos(car.heading) * hx + Math.sin(car.heading) * hz;
      // Against an avenue half's traffic: the wrong way down a one-way.
      laneTime.against = along < -0.7 && moving > 10 * KMH ? laneTime.against + dt : 0;
      if (laneTime.against > 2) { offence(traffic, 1, "wrong-way", car); laneTime.against = -10; }
      // In the BRT's busway, or in the non-motor lane, at speed for a while.
      const inBusway = Number(traffic.snapshot.busLane?.[tile]) > 0 && fromMedian > BUSWAY[0] && fromMedian < BUSWAY[1];
      laneTime.busway = inBusway && moving > 10 * KMH ? laneTime.busway + dt : 0;
      if (laneTime.busway >= 1.5) { cameraFine(traffic, car, "bus-lane"); laneTime.busway = -10; }
      // More than half the car over the non-motor lane's line.
      const inBikeLane = fromMedian > 11.5 * METRE;
      laneTime.bike = inBikeLane && moving > 20 * KMH ? laneTime.bike + dt : 0;
    } else {
      const arms = graph.arms[tile] & 15;
      const straight = arms === 5 || arms === 10;
      const out = arms === 10 ? Math.abs(fz) : arms === 5 ? Math.abs(fx) : 0;
      laneTime.bike = straight && out > 3.5 * METRE && moving > 20 * KMH ? laneTime.bike + dt : 0;
    }
    if (laneTime.bike > 1.5) { offence(traffic, 1, "bike-lane", car); laneTime.bike = -10; }
    traffic.laneTime = laneTime;
    // The wrong side of a straight two-way road, for more than four seconds.
    const arms = graph.arms[tile] & 15;
    if (arms === 5 || arms === 10) {
      const alongX = arms === 10;
      const forward = alongX ? Math.cos(car.heading) : Math.sin(car.heading);
      const offset = alongX ? car.z - (Math.floor(car.z) + 0.5) : -(car.x - (Math.floor(car.x) + 0.5));
      const leftOfCentre = forward * offset < -0.5 * METRE && Math.abs(forward) > 0.7;
      traffic.wrongWay = leftOfCentre && Math.abs(car.speed) > 15 * KMH ? traffic.wrongWay + dt : 0;
      if (traffic.wrongWay > 4) { offence(traffic, 1, "wrong-way", car); traffic.wrongWay = -10; }
    }
    // Hitting another car at speed; knocking a rider down at any speed
    // worth the name.
    if (car.contact) {
      const other = traffic.cars.find((agent) => agent.id === car.contact);
      if (other) {
        other.shaken = 2.5;
        if (Math.abs(traffic.lastContactSpeed || 0) > 25 * KMH) offence(traffic, other.kind === "police" ? 2 : 1, other.kind === "police" ? "police-hit" : "crash", car);
      }
      const rider = traffic.riders.find((agent) => agent.id === car.contact);
      if (rider && !(rider.down > 0)) {
        rider.down = 4;
        rider.speed = 0;
        traffic.events.push({ type: "rider-down", kind: rider.kind });
        if (Math.abs(traffic.lastContactSpeed || 0) > 8 * KMH) offence(traffic, 2, "hit-rider", car);
      }
    }
    traffic.lastContactSpeed = car.speed;
    if (graph.isRoad(tile)) traffic.playerTile = tile;

    const police = traffic.cars.filter((agent) => agent.kind === "police");
    if (traffic.wanted > 0) {
      // Pulled over: a police car beside a stopped car for two and a half seconds.
      const beside = police.some((agent) => Math.hypot(agent.x - car.x, agent.z - car.z) < 10 * METRE);
      traffic.busted = beside && Math.abs(car.speed) < 4 * KMH ? traffic.busted + dt : 0;
      if (traffic.busted > 2.5) {
        const fine = 100 * traffic.wanted;
        traffic.money = Math.max(0, traffic.money - fine);
        traffic.bustedCount += 1;
        traffic.events.push({ type: "busted", fine, level: traffic.wanted });
        traffic.wanted = 0;
        traffic.busted = 0;
        traffic.cars = traffic.cars.filter((agent) => agent.kind !== "police");
        return;
      }
      // Far from every police car: calm builds, and the level steps down.
      const near = police.some((agent) => Math.hypot(agent.x - car.x, agent.z - car.z) < 12);
      traffic.wantedCalm = near ? 0 : traffic.wantedCalm + dt;
      if (traffic.wantedCalm > 18) {
        traffic.wanted -= 1;
        traffic.wantedCalm = 0;
        traffic.events.push({ type: "wanted", level: traffic.wanted, why: "lost-them" });
      }
      // The chase map: road distance to the car, refreshed every second.
      if (traffic.seconds - traffic.chaseAt > 1 && graph.isRoad(tile)) {
        traffic.chaseMap = roadDistances(graph, tile, true);
        traffic.chaseAt = traffic.seconds;
      }
    }
  }

  // --- the railway (P3) -----------------------------------------------------------------------
  //
  // joyride-rail.js knows where the trains are; this is where the street
  // meets them: crossings that close, trains that are solid, stations the
  // car can stop at and ride from.

  const TRAIN_HALF_LENGTH = 0.23;    // tiles: a Bonsai locomotive or coach
  const TRAIN_HALF_WIDTH = 0.1;
  const BUS_HALF_LENGTH = 5.6 * METRE;
  const BRT_HALF_LENGTH = 9 * METRE;
  const BUS_HALF_WIDTH = 1.3 * METRE;

  // Buses near a point, on the ground (BRT and ordinary buses alike).
  function busesNear(traffic, at, reach) {
    if (!traffic.rail || !traffic.rail.lines.some((line) => line.kind === "bus" || line.kind === "brt")) return [];
    // Worked out once per step and shared by every car that asks.
    if (!traffic.busCache || traffic.busCache.at !== traffic.seconds) traffic.busCache = { at: traffic.seconds, list: railway().buses(traffic.rail, traffic.seconds) };
    return traffic.busCache.list
      .filter((bus) => Math.abs(bus.x - at.x) < reach && Math.abs(bus.z - at.z) < reach)
      .map((bus) => ({ ...bus, y: surface(traffic.world, bus.x, bus.z, null) }));
  }

  function crossingClosed(traffic, tile) {
    return Boolean(traffic.rail && traffic.rail.crossings.size) && railway().crossingClosed(traffic.rail, tile, traffic.seconds);
  }

  // Surface trains near the car, resting on the track (subway trains run
  // underground and are neither drawn nor solid).
  function trainsNear(traffic, car, reach) {
    if (!traffic.rail || !traffic.rail.lines.length) return [];
    return railway().trainCars(traffic.rail, traffic.seconds)
      .filter((train) => train.kind === "rail" && Math.abs(train.x - car.x) < reach && Math.abs(train.z - car.z) < reach)
      .map((train) => ({ ...train, y: surface(traffic.world, train.x, train.z, null) }));
  }

  // The road tile a station is reached from: nearest to its footprint.
  function stationRoad(traffic, station) {
    const { graph } = traffic;
    const size = graph.size;
    let best = -1, bestD = Infinity;
    graph.roads.forEach((tile) => {
      const x = tile % size, y = Math.floor(tile / size);
      const dx = Math.max(station.x - x, 0, x - (station.x + station.w - 1));
      const dy = Math.max(station.y - y, 0, y - (station.y + station.h - 1));
      const d = dx + dy;
      if (d < bestD) { best = tile; bestD = d; }
    });
    return bestD <= 2 ? best : -1;
  }

  // The station the stopped car is at, if it may ride from there.
  function stationHere(traffic, car) {
    if (!traffic.rail) return null;
    const station = railway().stationNear(traffic.rail, car.x, car.z);
    if (!station || !railway().destinations(traffic.rail, station.id, traffic.seconds).length) return null;
    return station;
  }

  // Ride a train from the station the car is at to `toId`. Time passes
  // while the driver waits and rides; the street around the old place is
  // left behind; police who were not right there lose the trail (spec §6:
  // the railway is one way to shake a chase). The shell then puts a car at
  // the destination.
  function rideTrain(traffic, car, toId) {
    const station = stationHere(traffic, car);
    if (!station) return { ok: false, reason: "no-station" };
    if (Math.abs(car.speed) > 3 * KMH) return { ok: false, reason: "moving" };
    const close = traffic.cars.some((agent) => agent.kind === "police" && traffic.wanted > 0 && Math.hypot(agent.x - car.x, agent.z - car.z) < 3);
    if (close) return { ok: false, reason: "police-close" };
    const times = railway().rideTimes(traffic.rail, station.id, toId, traffic.seconds);
    if (!times) return { ok: false, reason: "no-train" };
    const spent = times.arrive - traffic.seconds;
    if (station.kind === "bus" || station.kind === "brt") {
      const prev = traffic.diary.busWait;
      if (!prev || times.wait > prev.seconds) traffic.diary.busWait = { seconds: times.wait, x: station.x, y: station.y };
    } else traffic.diary.railWaitSeconds += times.wait;
    traffic.events = [];
    traffic.seconds = times.arrive;
    if (traffic.clock) traffic.clock.seconds += spent * traffic.clock.scale;
    traffic.cars = [];
    traffic.pedestrians = [];
    traffic.riders = [];
    traffic.playerTile = -1;
    traffic.chaseMap = null;
    traffic.busted = 0;
    traffic.wrongWay = 0;
    const lost = traffic.wanted;
    traffic.wanted = 0;
    traffic.wantedCalm = 0;
    if (lost > 0) traffic.events.push({ type: "wanted", level: 0, why: "rode-away" });
    const to = traffic.rail.stations.find((candidate) => candidate.id === toId);
    traffic.events.push({ type: "rode", from: station.id, to: toId, wait: times.wait, ride: times.ride, lost });
    return { ok: true, from: station, to, wait: times.wait, ride: times.ride, lost };
  }

  // --- one step of the street ---------------------------------------------------------------

  function stepTraffic(traffic, car, dt) {
    traffic.seconds += dt;
    traffic.events = [];
    if (traffic.clock) traffic.clock.seconds += dt * traffic.clock.scale;
    const { graph, snapshot } = traffic;
    const size = graph.size;
    const px = Math.floor(car.x), pz = Math.floor(car.z);
    if (traffic.playerTile < 0 && graph.isRoad(pz * size + px)) traffic.playerTile = pz * size + px;

    // Drop what the car has left behind (police give up beyond the radius).
    traffic.cars = traffic.cars.filter((agent) => Math.max(Math.abs(agent.x - car.x), Math.abs(agent.z - car.z)) < KEEP_RADIUS);
    traffic.pedestrians = traffic.pedestrians.filter((agent) => Math.max(Math.abs(agent.x - car.x), Math.abs(agent.z - car.z)) < PEDESTRIAN_KEEP);
    traffic.riders = traffic.riders.filter((agent) => Math.max(Math.abs(agent.x - car.x), Math.abs(agent.z - car.z)) < RIDER_KEEP);

    // Make what the hour and the city call for, a few at a time.
    const busy = localTraffic(snapshot, px, pz) * rushFactor(traffic.clock);
    const here = district(traffic, px, pz);
    traffic.here = here;
    let jams = 0;
    for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const tx = px + dx, ty = pz + dy;
      if (tx >= 0 && ty >= 0 && tx < size && ty < size && Number(snapshot.congested?.[ty * size + tx]) > 0) jams += 1;
    }
    const wantedCars = Math.max(5, Math.min(30, Math.round(5 + 24 * busy + jams * 1.5)));
    const civilians = traffic.cars.filter((agent) => agent.kind !== "police");
    if (civilians.length < wantedCars) {
      const tile = spawnTile(traffic, car, SPAWN_NEAR, SPAWN_FAR, traffic.cars);
      if (tile >= 0) traffic.cars.push(makeCar(traffic, tile, "car"));
    }
    const police = traffic.cars.filter((agent) => agent.kind === "police");
    // Patrols: more where crime is high for this city, more where the police
    // cover the streets; a chase adds a car for every level.
    const patrols = Math.round(here.crime * (0.6 + 1.6 * here.police) * 2);
    if (police.length < Math.max(traffic.wanted, patrols)) {
      const home = policeHome(traffic);
      const far = home >= 0 && Math.max(Math.abs((home % size) - car.x), Math.abs(Math.floor(home / size) - car.z)) < KEEP_RADIUS - 2;
      // A patrol that is not coming from the station turns up out of sight
      // (twelve tiles out), never in front of the car.
      const tile = far ? home : spawnTile(traffic, car, 12, SPAWN_FAR + 3, traffic.cars);
      if (tile >= 0) traffic.cars.push(makeCar(traffic, tile, "police"));
    }
    // Stations draw a crowd of their own.
    const nearStation = (traffic.rail?.stations || []).some((station) => Math.abs(station.x + station.w / 2 - car.x) < 5 && Math.abs(station.y + station.h / 2 - car.z) < 5);
    const wantedPeople = Math.max(3, Math.min(22, Math.round(3 + 10 * busy + 14 * here.people + (nearStation ? 8 : 0))));
    if (traffic.pedestrians.length < wantedPeople) {
      const tile = spawnTile(traffic, car, 3, PEDESTRIAN_KEEP - 2, traffic.pedestrians);
      if (tile >= 0) traffic.pedestrians.push(makePedestrian(traffic, tile));
    }

    // Bicycles and e-bikes: more in the rush and where people live and shop.
    const wantedRiders = Math.max(2, Math.min(16, Math.round(2 + 9 * busy + 6 * here.people)));
    if (traffic.riders.length < wantedRiders) {
      const tile = spawnTile(traffic, car, 4, RIDER_KEEP - 2, traffic.riders);
      if (tile >= 0) traffic.riders.push(makeRider(traffic, tile));
    }

    traffic.cars.forEach((agent) => stepCarAgent(traffic, agent, car, dt));
    traffic.pedestrians.forEach((agent) => stepPedestrian(traffic, agent, car, dt));
    traffic.riders.forEach((agent) => stepRider(traffic, agent, car, dt));
    stepWanted(traffic, car, dt);
    stepPhones(traffic, car);
    stepJob(traffic, car);
    // The diary: a crawl on a tile the city counts as congested, and time
    // spent in the roughest fifth of the town.
    const diary = traffic.diary;
    diary.seconds += dt;
    const atTile = pz * size + px;
    if (Math.abs(car.speed) < 10 * KMH && Number(snapshot.congested?.[atTile]) > 0) {
      diary.jamSeconds += dt;
      diary.jam.set(atTile, (diary.jam.get(atTile) || 0) + dt);
    }
    if (traffic.here.crime >= 0.8) diary.roughSeconds += dt;
    // Smog: the city's own pollution layer at the car's tile, past the
    // overlay's second step (as the street's haze reads it).
    if (Number(snapshot.pollution?.[atTile]) > 102) diary.smogSeconds += dt;
    return traffic.events;
  }

  // The other cars as boxes for the player's physics: only those near. A bus
  // or a train keeps to its timetable; one that has run onto the car is left
  // out, so the car can drive clear of it instead of being pinned.
  function obstaclesNear(traffic, car) {
    const clear = (box) => !core().boxesOverlap(
      { x: car.x, z: car.z, heading: car.heading, halfLength: CAR_HALF_LENGTH, halfWidth: CAR_HALF_WIDTH },
      box);
    return [
      ...traffic.cars
        .filter((agent) => Math.abs(agent.x - car.x) < 1 && Math.abs(agent.z - car.z) < 1)
        .map((agent) => ({ id: agent.id, x: agent.x, z: agent.z, y: agent.y, heading: agent.heading, halfLength: CAR_HALF_LENGTH, halfWidth: CAR_HALF_WIDTH })),
      ...trainsNear(traffic, car, 1.2).map((train) => ({ id: `train:${train.line}:${train.car}`, x: train.x, z: train.z, y: train.y, heading: train.heading, halfLength: TRAIN_HALF_LENGTH, halfWidth: TRAIN_HALF_WIDTH })).filter(clear),
      ...busesNear(traffic, car, 1.2).map((bus) => ({ id: `bus:${bus.line}:${bus.vehicle}`, x: bus.x, z: bus.z, y: bus.y, heading: bus.heading, halfLength: bus.kind === "brt" ? BRT_HALF_LENGTH : BUS_HALF_LENGTH, halfWidth: BUS_HALF_WIDTH })).filter(clear),
      ...traffic.riders
        .filter((agent) => Math.abs(agent.x - car.x) < 1 && Math.abs(agent.z - car.z) < 1)
        .map((agent) => ({ id: agent.id, x: agent.x, z: agent.z, y: agent.y, heading: agent.heading, halfLength: RIDER_HALF_LENGTH, halfWidth: agent.down > 0 ? RIDER_HALF_LENGTH : RIDER_HALF_WIDTH }))
        .filter(clear),
    ];
  }

  // --- the shift ------------------------------------------------------------------------------
  //
  // One evening rush: 17:00 to 20:00 in twelve minutes. The score is the
  // money a night's jobs made, plus a little for each job and for a clean
  // record, less for every time the police pulled the car over.

  const SHIFT = Object.freeze({ start: 17 * 3600, end: 20 * 3600, realSeconds: 720 });
  function createClock() {
    return { seconds: SHIFT.start, scale: (SHIFT.end - SHIFT.start) / SHIFT.realSeconds };
  }
  function shiftOver(clock) {
    return Boolean(clock) && clock.seconds >= SHIFT.end;
  }
  function shiftScore(traffic) {
    return Math.max(0, Math.round(traffic.money + traffic.jobsDone * 25 + Math.max(0, traffic.reputation) * 10 - traffic.bustedCount * 50));
  }
  // The hour as the renderer's time of day, 0..1 from midnight.
  function timeOfDay(clock) {
    return clock ? (clock.seconds / 86400) % 1 : 0.42;
  }

  // High scores: the best ten, newest first among equals.
  function addHighScore(list, entry) {
    const next = [...(Array.isArray(list) ? list : []), entry]
      .filter((item) => item && Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);
    return next.slice(0, 10);
  }

  // --- the letter to the mayor (D4) ---------------------------------------------------
  //
  // Only facts from the diary: where the worst jam was (its tile, the zone
  // it runs through and which way it lies from the middle of the town), how
  // long the driver sat in jams, whether the rough blocks took up much of
  // the night, how the work went. The shell words it; nothing here changes
  // the city (D4: letters only, no numbers move).
  function letterFacts(traffic) {
    const { diary, snapshot, graph } = traffic;
    const size = graph.size;
    let worst = -1, worstSeconds = 0;
    diary.jam.forEach((seconds, tile) => { if (seconds > worstSeconds || (seconds === worstSeconds && tile < worst)) { worst = tile; worstSeconds = seconds; } });
    let place = null;
    if (worst >= 0) {
      const x = worst % size, y = Math.floor(worst / size);
      const zones = zoneBeside(snapshot, size, worst).map((entry) => entry.zone);
      const zone = zones.length ? ["", "r", "c", "i"][zones.sort((a, b) => a - b)[0]] || "none" : "none";
      const dx = x + 0.5 - size / 2, dy = y + 0.5 - size / 2;
      const compass = Math.hypot(dx, dy) < size * 0.15 ? "central"
        : ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"][(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
      place = { tile: worst, x, y, zone, compass };
    }
    // The facts a letter may list, neutral and traceable: each is a key, a
    // tile when it has one, and a number (minutes, a share, a count).
    const minutes = (seconds) => Math.round(seconds / 60 * 10) / 10;
    const list = [];
    if (place && worstSeconds >= 20) list.push({ key: "jam", x: place.x, y: place.y, n: minutes(worstSeconds), zone: place.zone, compass: place.compass });
    if (diary.seconds > 0 && diary.roughSeconds / diary.seconds >= 0.25) list.push({ key: "crime", n: Math.round((diary.roughSeconds / diary.seconds) * 100) });
    if (diary.smogSeconds >= 30) list.push({ key: "smog", n: minutes(diary.smogSeconds) });
    if (diary.railWaitSeconds > 0) list.push({ key: "rail-wait", n: minutes(diary.railWaitSeconds) });
    if (diary.busWait && diary.busWait.seconds >= 24) list.push({ key: "bus-wait", x: diary.busWait.x, y: diary.busWait.y, n: Math.round(diary.busWait.seconds * 15 / 60) });
    if (traffic.bustedCount > 0) list.push({ key: "busted", n: traffic.bustedCount });
    return {
      list,
      seconds: Math.round(diary.seconds),
      jamMinutes: Math.round(diary.jamSeconds / 60 * 10) / 10,
      worstJam: place ? { ...place, minutes: Math.round(worstSeconds / 60 * 10) / 10 } : null,
      roughShare: diary.seconds > 0 ? Math.round((diary.roughSeconds / diary.seconds) * 100) / 100 : 0,
      offences: diary.offences,
      busted: traffic.bustedCount,
      jobs: traffic.jobsDone,
      failed: diary.failed,
    };
  }

  // --- what the renderer draws ---------------------------------------------------------------

  // People waiting on the BRT islands near the car: a few at each, fewer
  // while a bus stands there (they have just boarded).
  function platformPeople(traffic, car) {
    const out = [];
    const { graph } = traffic;
    const size = graph.size;
    if (!car || !graph.avenue || !traffic.rail) return out;
    const standing = new Set(busesNear(traffic, car, 14).filter((bus) => bus.standing).map((bus) => `${Math.floor(bus.x)},${Math.floor(bus.z)}`));
    traffic.rail.stations.forEach((stop) => {
      if (stop.kind !== "brt" || Math.abs(stop.x + 0.5 - car.x) > 12 || Math.abs(stop.y + 0.5 - car.z) > 12) return;
      const tile = stop.y * size + stop.x;
      const half = graph.avenue[tile];
      if (!half || graph.medianOpen[tile]) return;
      const [lx, lz] = DIRS[LEFT[half]];
      const [fx, fz] = DIRS[half];
      const seamX = stop.x + 0.5 + lx * 0.5, seamZ = stop.y + 0.5 + lz * 0.5;
      const seed = (stop.x * 73856093) ^ (stop.y * 19349663);
      const boarded = [...standing].some((key) => { const [bx, bz] = key.split(",").map(Number); return Math.abs(bx - stop.x) + Math.abs(bz - stop.y) <= 1; });
      const count = boarded ? 1 : 2 + (Math.abs(seed) % 4);
      // They stand on the platform, a layer over the road, not on its canopy.
      const road = surface(traffic.world, seamX - lx * 7 * METRE, seamZ - lz * 7 * METRE, null);
      for (let k = 0; k < count; k += 1) {
        const along = ((k + 0.5) / count - 0.5) * 0.7;
        const across = ((Math.abs(seed >> (k * 3)) % 3) - 1) * 0.6 * METRE;
        const x = seamX + fx * along + lx * across, z = seamZ + fz * along + lz * across;
        out.push({ frame: `agent.pedestrian.${1 + (Math.abs(seed >> k) % 2)}`, x, z, y: surface(traffic.world, x, z, road + traffic.world.layer), yaw: Math.atan2(lz, lx) + (k % 2 ? Math.PI : 0) });
      }
    });
    return out;
  }

  function streetObjects(traffic, car = null) {
    const drawn = [];
    const known = global.AISystem6BonsaiFrameIndex;
    const hasFrame = (id) => Boolean(known && (known.has ? known.has(id) : known[id]));
    if (car && traffic.rail && global.AISystem6JoyrideBus && hasFrame("agent.bus.1")) {
      global.AISystem6JoyrideBus.materialise(traffic.rail, traffic.seconds, { x: car.x, z: car.z }).forEach((bus) => {
        const y = surface(traffic.world, bus.x, bus.z, null);
        if (bus.kind === "brt" && hasFrame("agent.bus.brt.front")) {
          drawn.push({ frame: "agent.bus.brt.front", x: bus.x, y, z: bus.z, yaw: bus.heading, livery: bus.color });
          if (hasFrame("agent.bus.brt.rear")) {
            drawn.push({
              frame: "agent.bus.brt.rear", livery: bus.color, yaw: bus.heading, y,
              x: bus.x - Math.cos(bus.heading), z: bus.z - Math.sin(bus.heading),
            });
          }
        } else if (bus.kind === "bus") drawn.push({ frame: "agent.bus.1", x: bus.x, y, z: bus.z, yaw: bus.heading, livery: null });
      });
    }
    if (car && hasFrame("street.camera") && global.AISystem6JoyrideBus?.cameraPoles) {
      let shown = 0;
      global.AISystem6JoyrideBus.cameraPoles(traffic.snapshot).forEach((pole) => {
        if (shown >= 8 || Math.abs(pole.x + 0.5 - car.x) > 14 || Math.abs(pole.y + 0.5 - car.z) > 14) return;
        drawn.push({ frame: "street.camera", x: pole.x + 0.82, y: surface(traffic.world, pole.x + 0.82, pole.y + 0.82, null), z: pole.y + 0.82, yaw: 0 });
        shown += 1;
      });
    }
    return [
      ...platformPeople(traffic, car),
      ...drawn,
      ...(car ? trainsNear(traffic, car, 14) : []).map((train) => ({ frame: train.frame, x: train.x, y: train.y, z: train.z, yaw: train.heading })),
      ...traffic.cars.map((agent) => ({ frame: agent.frame, x: agent.x, y: agent.y, z: agent.z, yaw: agent.heading })),
      // A walking step: each pedestrian bobs and sways on its own phase,
      // still while standing (a pure function of the street clock).
      ...traffic.pedestrians.map((agent) => {
        const walking = (agent.speed || 0) > 0.2 * KMH;
        const phase = traffic.seconds * 7.5 + agent.id * 1.7;
        return { frame: agent.frame, x: agent.x, y: agent.y + (walking ? Math.abs(Math.sin(phase)) * 0.18 * METRE : 0), z: agent.z, yaw: agent.heading, roll: walking ? Math.sin(phase) * 0.06 : 0 };
      }),
    ];
  }

  // Signal lamps and payphones as small coloured blocks near the car.
  function streetBlocks(traffic, car, world) {
    const blocks = [];
    const { graph } = traffic;
    const size = graph.size;
    const colours = { green: [0.2, 0.95, 0.35], amber: [1, 0.7, 0.15], red: [1, 0.15, 0.1] };
    traffic.signals.forEach((signal) => {
      const x = (signal.tile % size) + 0.5, z = Math.floor(signal.tile / size) + 0.5;
      if (Math.abs(x - car.x) > 9 || Math.abs(z - car.z) > 9) return;
      const half = graph.avenue?.[signal.tile] || 0;
      ARMS.forEach((dir) => {
        if (!(graph.arms[signal.tile] & dir)) return;
        // The head facing traffic arriving from that arm, at its right kerb.
        // On an avenue half only its own traffic and the side street's
        // arrive (the other half's light stood at the first stop line).
        const arrive = OPPOSITE[dir];
        if (half && arrive !== half && arrive !== LEFT[half]) return;
        const [ax, az] = DIRS[arrive];
        const hx = x - ax * 0.42 - az * 0.38, hz = z - az * 0.42 + ax * 0.38;
        const base = surface(world, hx, hz, null);
        const light = signalAt(traffic, signal.tile, arrive);
        blocks.push({ x: hx, z: hz, y: base + 2.4 * METRE, sx: 0.2 * METRE, sz: 0.2 * METRE, sy: 4.8 * METRE, r: 0.18, g: 0.19, b: 0.2 });
        blocks.push({ x: hx, z: hz, y: base + 5.2 * METRE, sx: 0.8 * METRE, sz: 0.8 * METRE, sy: 0.8 * METRE, r: colours[light][0], g: colours[light][1], b: colours[light][2], glow: true });
      });
    });
    // Brake lights on the cars ahead: lit while they slow or stand.
    traffic.cars.forEach((agent) => {
      if (!agent.braking || Math.abs(agent.x - car.x) > 8 || Math.abs(agent.z - car.z) > 8) return;
      const c = Math.cos(agent.heading), sn = Math.sin(agent.heading);
      const back = -(CAR_HALF_LENGTH + 0.06 * METRE), side = CAR_HALF_WIDTH * 0.7;
      [-side, side].forEach((w) => blocks.push({
        x: agent.x + c * back - sn * w, z: agent.z + sn * back + c * w, y: (agent.y || 0) + 1.0 * METRE,
        sx: 0.4 * METRE, sy: 0.28 * METRE, sz: 0.4 * METRE, r: 1, g: 0.1, b: 0.06, glow: true,
      }));
    });
    // Buses and BRT: skirt, body in the line's colour, window band, white
    // roof, wheels and doors, built of oriented blocks (until the voxel
    // catalogue carries bus models). BRT is two bodies and a bellows, its
    // doors on both sides like Yichang's.
    busesNear(traffic, car, 10).forEach((bus) => blocks.push(...busBlocks(bus)));
    const poles = global.AISystem6JoyrideBus?.cameraPoles?.(traffic.snapshot) || [];
    let shown = 0;
    poles.forEach((pole) => {
      if (shown >= 8 || Math.abs(pole.x + 0.5 - car.x) > 14 || Math.abs(pole.y + 0.5 - car.z) > 14) return;
      const known = global.AISystem6BonsaiFrameIndex;
      if (known && (known.has ? known.has("street.camera") : known["street.camera"])) return;
      const x = pole.x + 0.82, z = pole.y + 0.82;
      const base = surface(world, x, z, null);
      blocks.push({ x, z, y: base + 2.2 * METRE, sx: 0.12 * METRE, sz: 0.12 * METRE, sy: 4.4 * METRE, r: 0.25, g: 0.27, b: 0.3 });
      shown += 1;
    });
    // Kerbside stops: a shelter on the pavement either side, with the
    // line's colour on its sign. A BRT stop on an avenue is the island
    // platform the street itself draws.
    (traffic.rail?.stations || []).forEach((stop) => {
      if ((stop.kind !== "bus" && stop.kind !== "brt") || Math.abs(stop.x + 0.5 - car.x) > 11 || Math.abs(stop.y + 0.5 - car.z) > 11) return;
      if (stop.kind === "brt" && graph.avenue?.[stop.y * size + stop.x]) return;
      const line = traffic.rail.lines.find((candidate) => candidate.id === stop.line);
      const along = line ? railway().pointAt(traffic.rail, line, stop.index).heading : 0;
      [-1, 1].forEach((side) => blocks.push(...shelterBlocks(stop.x + 0.5 - Math.sin(along) * PAVEMENT * side * 0.95, stop.y + 0.5 + Math.cos(along) * PAVEMENT * side * 0.95, along, line?.color, world)));
    });
    // A kerbside bus lane: red over both motor lanes of a narrow street.
    if (traffic.snapshot.busLane) {
      for (let dz = -9; dz <= 9; dz += 1) for (let dx = -9; dx <= 9; dx += 1) {
        const x = Math.floor(car.x) + dx, z = Math.floor(car.z) + dz;
        if (x < 0 || z < 0 || x >= size || z >= size || !Number(traffic.snapshot.busLane[z * size + x]) || graph.avenue?.[z * size + x]) continue;
        const base = surface(world, x + 0.5, z + 0.5, null);
        blocks.push({ x: x + 0.5, z: z + 0.5, y: base + 0.002, sx: 7 * METRE, sy: 0.004, sz: 7 * METRE, r: 0.6, g: 0.22, b: 0.17 });
      }
    }
    // Bicycles and e-bikes.
    traffic.riders.forEach((rider) => {
      if (Math.abs(rider.x - car.x) < 10 && Math.abs(rider.z - car.z) < 10) blocks.push(...riderBlocks(rider, traffic.seconds));
    });
    // Level crossings: a pair of red lamps either side, flashing in turn
    // while a train is near.
    if (traffic.rail) {
      traffic.rail.crossings.forEach((crossing, tile) => {
        const x = (tile % size) + 0.5, z = Math.floor(tile / size) + 0.5;
        if (Math.abs(x - car.x) > 10 || Math.abs(z - car.z) > 10) return;
        const closed = crossingClosed(traffic, tile);
        const flash = Math.floor(traffic.seconds * 2.5) % 2;
        [[-0.44, -0.44], [0.44, 0.44]].forEach(([ox, oz], side) => {
          const base = surface(world, x + ox, z + oz, null);
          blocks.push({ x: x + ox, z: z + oz, y: base + 1.8 * METRE, sx: 0.2 * METRE, sz: 0.2 * METRE, sy: 3.6 * METRE, r: 0.9, g: 0.9, b: 0.88 });
          const lit = closed && flash === side;
          blocks.push({ x: x + ox, z: z + oz, y: base + 3.8 * METRE, sx: 0.7 * METRE, sz: 0.7 * METRE, sy: 0.7 * METRE, r: lit ? 1 : 0.35, g: lit ? 0.12 : 0.08, b: lit ? 0.08 : 0.06, glow: lit });
        });
      });
    }
    traffic.phones.forEach((phone) => {
      if (Math.abs(phone.x - car.x) > 12 || Math.abs(phone.z - car.z) > 12) return;
      const base = surface(world, phone.x, phone.z, null);
      const ringing = phone.ringingUntil > traffic.seconds && Math.floor(traffic.seconds * 3) % 2 === 0;
      blocks.push({ x: phone.x, z: phone.z, y: base + 1.2 * METRE, sx: 1.1 * METRE, sz: 1.1 * METRE, sy: 2.4 * METRE, r: 0.85, g: 0.12, b: 0.1 });
      blocks.push({ x: phone.x, z: phone.z, y: base + 2.7 * METRE, sx: 0.6 * METRE, sz: 0.6 * METRE, sy: 0.6 * METRE, r: ringing ? 1 : 0.4, g: ringing ? 0.85 : 0.35, b: ringing ? 0.3 : 0.3, glow: ringing });
    });
    // The current target: a tall beacon over the road.
    const job = traffic.job;
    if (job) {
      const target = job.targets[job.stage];
      const tx = (target % size) + 0.5, tz = Math.floor(target / size) + 0.5;
      const base = surface(world, tx, tz, null);
      blocks.push({ x: tx, z: tz, y: base + 20 * METRE, sx: 0.9 * METRE, sz: 0.9 * METRE, sy: 40 * METRE, r: 1, g: 0.78, b: 0.25, glow: true });
    }
    return blocks;
  }

  const LINE_PAINT = Object.freeze([[0.82, 0.22, 0.18], [0.18, 0.43, 0.82], [0.88, 0.62, 0.12], [0.18, 0.6, 0.33], [0.54, 0.31, 0.8], [0.88, 0.44, 0.18], [0.18, 0.7, 0.75]]);
  const paint = (color) => LINE_PAINT[Number.isInteger(color) ? ((color % 7) + 7) % 7 : 0];

  // A block in a vehicle's own frame (x along its heading), placed in the
  // world: position turned by the heading, the block itself turned too.
  function oriented(at, heading, lx, ly, lz, sx, sy, sz, r, g, b, glow = false) {
    const c = Math.cos(heading), s = Math.sin(heading);
    return { x: at.x + c * lx - s * lz, z: at.z + s * lx + c * lz, y: at.y + ly, sx, sy, sz, yaw: heading, r, g, b, glow };
  }

  function busBlocks(bus) {
    const [r, g, b] = paint(bus.color);
    const M = METRE;
    const out = [];
    const o = (lx, ly, lz, sx, sy, sz, cr, cg, cb, glow = false) => out.push(oriented(bus, bus.heading, lx, ly, lz, sx, sy, sz, cr, cg, cb, glow));
    const brt = bus.kind === "brt";
    const body = (offset, length) => {
      o(offset, 0.5 * M, 0, length, 0.5 * M, 2.4 * M, 0.14, 0.14, 0.15);
      o(offset, 1.45 * M, 0, length, 1.4 * M, 2.5 * M, r, g, b);
      o(offset, 2.25 * M, 0, length * 0.97, 1.0 * M, 2.54 * M, 0.16, 0.2, 0.26);
      o(offset, 2.95 * M, 0, length * 0.99, 0.4 * M, 2.48 * M, 0.9, 0.9, 0.88);
      for (const axle of [offset + length * 0.3, offset - length * 0.3]) {
        for (const side of [-1, 1]) o(axle, 0.48 * M, side * 1.18 * M, 1 * M, 0.95 * M, 0.22 * M, 0.07, 0.07, 0.08);
      }
      // Doors: on the kerb side, and on both sides for a BRT.
      for (const at of [offset + length * 0.12, offset - length * 0.2]) {
        for (const side of brt ? [-1, 1] : [1]) o(at, 1.5 * M, side * 1.27 * M, 1.2 * M, 2.1 * M, 0.06 * M, 0.1, 0.13, 0.17);
      }
    };
    if (brt) {
      body(4.6 * M, 8.6 * M);
      body(-4.6 * M, 8.6 * M);
      o(0, 1.6 * M, 0, 0.8 * M, 2.4 * M, 2.2 * M, 0.1, 0.1, 0.1);
    } else {
      body(0, 11 * M);
    }
    const front = (brt ? 8.9 : 5.5) * M;
    o(front, 1.9 * M, 0, 0.1 * M, 1.6 * M, 2.3 * M, 0.2, 0.26, 0.32);
    o(front, 2.75 * M, 0, 0.12 * M, 0.32 * M, 1.6 * M, 1, 0.7, 0.2, true);
    for (const side of [-1, 1]) {
      o(front + 0.02 * M, 0.9 * M, side * 0.95 * M, 0.08 * M, 0.25 * M, 0.35 * M, 1, 0.95, 0.8, true);
      o(-front - 0.02 * M, 0.9 * M, side * 0.95 * M, 0.08 * M, 0.3 * M, 0.3 * M, 0.95, 0.12, 0.08, true);
    }
    return out;
  }

  // A rider: wheels, frame, the rider sitting up. An e-bike is a scooter
  // with a footboard and a front shield; many carry a delivery box on the
  // back, yellow or blue. Down, the machine lies in the road beside them.
  const RIDER_SHIRTS = Object.freeze([[0.82, 0.3, 0.2], [0.2, 0.34, 0.62], [0.88, 0.88, 0.84], [0.25, 0.25, 0.27], [0.92, 0.7, 0.18], [0.36, 0.52, 0.32]]);
  function riderBlocks(rider, seconds) {
    const M = METRE;
    const out = [];
    const at = { x: rider.x, z: rider.z, y: rider.y || 0 };
    const o = (lx, ly, lz, sx, sy, sz, cr, cg, cb, glow = false) => out.push(oriented(at, rider.heading, lx, ly, lz, sx, sy, sz, cr, cg, cb, glow));
    const look = rider.look || 0;
    const [sr, sg, sb] = RIDER_SHIRTS[look % RIDER_SHIRTS.length];
    const ebike = rider.kind === "ebike";
    if (rider.down > 0) {
      o(0, 0.12 * M, 0.5 * M, 1.6 * M, 0.25 * M, 0.5 * M, ebike ? 0.3 : 0.18, ebike ? 0.32 : 0.2, ebike ? 0.36 : 0.22);
      o(0.1 * M, 0.18 * M, -0.4 * M, 1.5 * M, 0.35 * M, 0.5 * M, sr, sg, sb);
      return out;
    }
    const pedal = ebike ? 0 : Math.sin(seconds * 9 + look) * 0.08 * M;
    const wheel = ebike ? 0.42 * M : 0.62 * M;
    for (const ax of [0.55 * M, -0.55 * M]) o(ax, wheel / 2, 0, wheel, wheel, 0.08 * M, 0.08, 0.08, 0.09);
    if (ebike) {
      o(0, 0.35 * M, 0, 0.9 * M, 0.18 * M, 0.42 * M, 0.3, 0.32, 0.36);
      o(0.45 * M, 0.75 * M, 0, 0.12 * M, 0.7 * M, 0.45 * M, 0.82, 0.82, 0.8);
      o(-0.25 * M, 0.72 * M, 0, 0.55 * M, 0.25 * M, 0.34 * M, 0.12, 0.12, 0.13);
      if (look % 3 === 0) o(-0.65 * M, 1.05 * M, 0, 0.5 * M, 0.5 * M, 0.5 * M, look % 2 ? 0.95 : 0.2, look % 2 ? 0.78 : 0.5, look % 2 ? 0.12 : 0.85);
      o(0.62 * M, 0.95 * M, 0, 0.06 * M, 0.12 * M, 0.16 * M, 1, 0.95, 0.75, true);
    } else {
      o(0, 0.62 * M, 0, 1 * M, 0.08 * M, 0.06 * M, 0.55, 0.12, 0.1);
      o(-0.15 * M + pedal, 0.4 * M, 0, 0.12 * M, 0.3 * M, 0.1 * M, 0.2, 0.2, 0.22);
    }
    // The rider: legs, body, head (a helmet on most, by the rule).
    o(-0.12 * M, 0.85 * M, 0, 0.3 * M, 0.5 * M, 0.34 * M, 0.2, 0.22, 0.28);
    o(-0.1 * M, 1.32 * M, 0, 0.32 * M, 0.6 * M, 0.42 * M, sr, sg, sb);
    const helmet = look % 5 !== 0;
    o(-0.06 * M, 1.78 * M, 0, 0.26 * M, 0.26 * M, 0.26 * M, helmet ? (look % 2 ? 0.95 : 0.9) : 0.78, helmet ? (look % 2 ? 0.82 : 0.2) : 0.62, helmet ? (look % 2 ? 0.18 : 0.16) : 0.5);
    return out;
  }

  function shelterBlocks(x, z, along, color, world) {
    const at = { x, z, y: surface(world, x, z, null) };
    const [r, g, b] = paint(color);
    return [
      oriented(at, along, 0, 2.5 * METRE, 0, 3.2 * METRE, 0.16 * METRE, 1.5 * METRE, 0.3, 0.32, 0.34),
      oriented(at, along, 0, 1.25 * METRE, -0.65 * METRE, 3.0 * METRE, 2.3 * METRE, 0.08 * METRE, 0.62, 0.78, 0.86),
      oriented(at, along, -1.5 * METRE, 1.25 * METRE, 0, 0.12 * METRE, 2.5 * METRE, 0.12 * METRE, 0.3, 0.32, 0.34),
      oriented(at, along, 1.5 * METRE, 1.25 * METRE, 0, 0.12 * METRE, 2.5 * METRE, 0.12 * METRE, 0.3, 0.32, 0.34),
      oriented(at, along, 2.2 * METRE, 1.6 * METRE, 0.3 * METRE, 0.1 * METRE, 3.2 * METRE, 0.1 * METRE, 0.85, 0.85, 0.82),
      oriented(at, along, 2.2 * METRE, 3.2 * METRE, 0.3 * METRE, 0.5 * METRE, 0.5 * METRE, 0.12 * METRE, r, g, b, true),
    ];
  }

  // Where the current target is from the car: distance in metres and the
  // bearing relative to the car's heading (radians, right positive).
  function jobBearing(traffic, car) {
    const job = traffic.job;
    if (!job) return null;
    const size = traffic.graph.size;
    const target = job.targets[job.stage];
    const tx = (target % size) + 0.5, tz = Math.floor(target / size) + 0.5;
    let angle = Math.atan2(tz - car.z, tx - car.x) - car.heading;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    return { metres: Math.hypot(tx - car.x, tz - car.z) / METRE, angle, left: Math.max(0, job.deadline - traffic.seconds) };
  }

  global.AISystem6JoyrideTraffic = Object.freeze({
    JOB_KINDS, SHIFT, AMBER,
    buildRoadGraph, roadDistances, tilePath, buildSignals, lightFor,
    createTraffic, stepTraffic, obstaclesNear, makeJob,
    createClock, shiftOver, shiftScore, timeOfDay, addHighScore,
    streetObjects, streetBlocks, jobBearing, rushFactor, localTraffic, district,
    stationHere, stationRoad, rideTrain, crossingClosed, trainsNear, letterFacts, burningTiles, busesNear,
    canGo, LANE, BIKE_LANE,
  });
})(window);
