// Rootline / 根线 — the headless core.
//
// Rules, ticks and state only: no DOM, canvas, timers, wall clock or global
// random source. The shell owns the seed and the pace; this file owns what
// happens in one tick. Given a seed, a mode and a tick-stamped command log,
// the game replays byte for byte (see `replay` and `hashGame`), which is what
// the contract in tests/features/rootline.test.mjs holds it to.
//
// The state is plain data a renderer may read and never write. Routing tables
// are derived from it and cached outside it, keyed by `networkVersion`, so the
// state itself stays serialisable and hashable.
//
// Three ways to lay a line (Basin plan, 「公交、快速公交与慢行」): the metro,
// octilinear and under the water by tunnel; the BRT on the avenues' central
// lanes; the bus along the streets. Both road modes cross water only by
// bridge. A game created without `modes` is the metro-only game it always
// was, key for key, so its seeds replay to the hashes they always did.
//
// A city is generated from the seed, or handed over from a Bonsai City pot
// (rootline-pot.js) and kept whole in `game.city`, so the hash and the replay
// cover it.
//
// Spec: internal/plans/TRANSIT-GAME-SPEC.zh-CN.md (§2, §8b);
// internal/plans/BASIN-WORLD.zh-CN.md (lane L3, 「玩法与规则」).
(function installRootlineCore(root) {
  "use strict";

  // The shared world core (app/core/pot-world.js, first in the loader) owns
  // the city names, the hour curves and the land-use kinds, so a Rootline
  // city, a Bonsai City pot and a Joyride street agree on them.
  const World = root.AISystem6PotWorld;
  if (!World) throw new Error("rootline-core needs app/core/pot-world.js loaded first");
  const { activity, periodOf, originWeight, destinationWeights, roadTraffic } = World.hours;
  const MODES = World.transit.MODES;

  const RULES = Object.freeze({
    ticksPerSecond: 60,
    // A day is 20 seconds, and they are not even: the sixteen waking hours
    // (06:00-22:00) take 17 of them and the night passes in 3. The peaks
    // last long enough to watch the flow turn round; the night does not
    // make anyone wait for it. A week is 140 seconds, one reward each.
    daySeconds: 20,
    wakingSeconds: 17,
    daysPerWeek: 7,
    mapWidth: 1600,
    mapHeight: 1000,
    riverHalfWidth: 26,
    stationSpacing: 86,
    riverClearance: 58,
    edgeMargin: 60,
    lineSlots: 7,
    stationCapacity: 6,
    interchangeCapacity: 14,
    trainSpeed: 118,
    trainAccel: 150,
    carCapacity: 6,
    transferTicks: 6,
    interchangeTransferTicks: 2,
    minDwellTicks: 18,
    overcrowdSeconds: 42,
    recoverSeconds: 70,
    boardCost: 1.5,
    alightCost: 1.5,
    turnCost: 1.2,
    dwellCost: 0.8,
    start: Object.freeze({ lines: 3, trains: 3, carriages: 0, tunnels: 3, interchanges: 0 }),
    // Only in a game with the road modes: route numbers 11-16 (a separate
    // pool from the seven line slots), buses, and avenue corridor pairs.
    routeSlots: 6,
    startTransit: Object.freeze({ routes: 1, buses: 3, avenues: 0 }),
    stationCap: 64,
  });

  const KINDS = World.landUse.KINDS;
  const EVERYDAY = Object.freeze(["residential", "commercial", "industrial"]);

  // Landmarks arrive on a schedule, by station count, so every city meets
  // them in the same order and a player can learn the rhythm.
  const LANDMARKS = Object.freeze([
    [6, "school"], [10, "hospital"], [15, "stadium"], [19, "airport"], [24, "port"],
    [29, "school"], [34, "hospital"], [40, "stadium"],
  ]);

  const REWARDS = Object.freeze(["line", "carriage", "tunnel", "interchange"]);

  // ----- modes --------------------------------------------------------------
  //
  // A line without a `mode` is a metro line. Its running numbers are RULES'
  // own (equal to the world's MODES.metro), so a metro-only game runs on the
  // arithmetic it always did; the road modes take theirs from the world.

  const TRANSIT = Object.freeze(["metro", "brt", "bus"]);
  const isRoad = (mode) => mode === "brt" || mode === "bus";

  function modeOfLine(record) {
    return record && isRoad(record.mode) ? record.mode : "metro";
  }

  const METRO_PACE = Object.freeze({
    speed: RULES.trainSpeed,
    accel: RULES.trainAccel,
    capacity: RULES.carCapacity,
    boardTicks: RULES.transferTicks,
    minDwellTicks: RULES.minDwellTicks,
    board: RULES.boardCost,
    alight: RULES.alightCost,
    peakSlowdown: 0,
  });
  const PACES = Object.freeze({ metro: METRO_PACE, brt: MODES.brt.rootline, bus: MODES.bus.rootline });

  function paceOf(mode) {
    return PACES[mode] || METRO_PACE;
  }

  function normalizeModes(value) {
    if (!Array.isArray(value)) return null;
    const modes = TRANSIT.filter((mode) => value.includes(mode));
    return modes.some(isRoad) ? (modes.includes("metro") ? modes : ["metro", ...modes]) : null;
  }

  // How much the evening and morning traffic slows a bus: 0 at noon, about
  // 0.71 at 08:00, 1 at 18:00 (Basin plan 2.4). Routing plans by period, the
  // buses themselves by the hour.
  function peak(hour) {
    return Math.max(0, Math.min(1, (roadTraffic(hour) - 0.55) / 0.7));
  }
  const PERIOD_PEAK = Object.freeze({ morning: peak(8), evening: peak(18), day: 0, night: 0 });

  // ----- determinism primitives ---------------------------------------------

  function nextRandom(game) {
    // mulberry32 over a uint32 kept in the state.
    let t = (game.rng = (game.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function seedFrom(value) {
    const text = String(value);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  }

  function hashGame(game) {
    return seedFrom(JSON.stringify(game)).toString(16).padStart(8, "0");
  }

  function pick(game, weights) {
    let total = 0;
    for (const [, w] of weights) total += Math.max(0, w);
    if (total <= 0) return null;
    let r = nextRandom(game) * total;
    for (const [value, w] of weights) {
      if (w <= 0) continue;
      r -= w;
      if (r <= 0) return value;
    }
    return weights[weights.length - 1][0];
  }

  // ----- time ---------------------------------------------------------------

  function ticksPerDay() { return RULES.daySeconds * RULES.ticksPerSecond; }
  function ticksPerWeek() { return ticksPerDay() * RULES.daysPerWeek; }

  // Clock time of a tick: day (0 = Monday of week 1, starting 06:00) and
  // hour (0..24), on the uneven day described in RULES.
  function clock(tick) {
    const perDay = ticksPerDay();
    const waking = RULES.wakingSeconds * RULES.ticksPerSecond;
    const day = Math.floor(tick / perDay);
    const t = tick - day * perDay;
    const hour = t < waking ? 6 + (16 * t) / waking : (22 + (8 * (t - waking)) / (perDay - waking)) % 24;
    return { day, weekday: day % RULES.daysPerWeek, week: Math.floor(tick / ticksPerWeek()) + 1, hour };
  }

  // The peaks (periodOf), how awake the city is (activity) and which way
  // people travel at each hour (originWeight, destinationWeights) are the
  // world's one rhythm: World.hours.

  // ----- geometry -----------------------------------------------------------

  // A leg between two stations is drawn and travelled as one diagonal run and
  // one straight run, the 45-degree grammar of a transit map. The geometry is
  // canonical per station pair (lower id first), so two lines sharing a leg
  // share its shape and the renderer can offset them side by side.
  function legPoints(a, b) {
    const flip = a.id > b.id;
    const p = flip ? b : a;
    const q = flip ? a : b;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.min(Math.abs(dx), Math.abs(dy));
    const bend = { x: p.x + Math.sign(dx) * d, y: p.y + Math.sign(dy) * d };
    const points = [{ x: p.x, y: p.y }, bend, { x: q.x, y: q.y }];
    return flip ? points.reverse() : points;
  }

  function polylineLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return length;
  }

  function pointAlong(points, distance) {
    let left = distance;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= len || i === points.length - 1) {
        const t = len > 0 ? Math.max(0, Math.min(1, left / len)) : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
      }
      left -= len;
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y, angle: 0 };
  }

  function segmentsCross(a, b, c, d) {
    const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = o(c, d, a);
    const d2 = o(c, d, b);
    const d3 = o(a, b, c);
    const d4 = o(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  function riverCrossings(game, points) {
    const river = game.city.river;
    let count = 0;
    for (let i = 1; i < points.length; i += 1) {
      for (let j = 1; j < river.length; j += 1) {
        if (segmentsCross(points[i - 1], points[i], river[j - 1], river[j])) count += 1;
      }
    }
    return count;
  }

  // Tunnels a metro leg needs. On a generated city, one per crossing of the
  // river. On a pot, each body of water is a polygon (its rings: the shore
  // and any islands): a leg needs ceil(boundary crossings / 2) tunnels for
  // each body it passes, so one pass under a river is one tunnel.
  function crossesXY(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  function waterCrossings(game, points) {
    if (!isPot(game)) return riverCrossings(game, points);
    let tunnels = 0;
    for (const body of game.city.water) {
      let hits = 0;
      for (const ring of body.rings) {
        const n = ring.length / 2;
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1];
          const b = points[i];
          for (let j = 0; j < n; j += 1) {
            const k = (j + 1) % n;
            if (crossesXY(a.x, a.y, b.x, b.y, ring[2 * j], ring[2 * j + 1], ring[2 * k], ring[2 * k + 1])) hits += 1;
          }
        }
      }
      tunnels += Math.ceil(hits / 2);
    }
    return tunnels;
  }

  function distanceToPolyline(p, points) {
    let best = Infinity;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
      best = Math.min(best, Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)));
    }
    return best;
  }

  // ----- city ---------------------------------------------------------------

  // The name comes from the world's table, from the seed alone, and draws
  // nothing from the game's random stream. A neighbouring pot opened as a
  // nursery keeps the neighbour's own name instead.
  const cityName = World.names.city;

  function nameOf(value) {
    return value && typeof value.zh === "string" && typeof value.en === "string" && (value.zh || value.en) ? { zh: value.zh, en: value.en } : null;
  }

  // A pot handed over from Bonsai City (rootline-pot.js), rather than a city
  // grown from the seed.
  function isPot(game) {
    return game.city.kind === "pot";
  }

  function stationCap(game) {
    return isPot(game) ? Math.min(RULES.stationCap, game.city.sites.length) : RULES.stationCap;
  }

  function makeRiver(game) {
    const W = RULES.mapWidth;
    const H = RULES.mapHeight;
    // A river runs across the long axis or down the short one, bending twice.
    const across = nextRandom(game) < 0.62;
    const phase1 = nextRandom(game) * Math.PI * 2;
    const phase2 = nextRandom(game) * Math.PI * 2;
    const amp1 = 60 + nextRandom(game) * 70;
    const amp2 = 18 + nextRandom(game) * 30;
    const offset = (nextRandom(game) - 0.5) * (across ? 160 : 260);
    const points = [];
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (across) {
        const x = -40 + t * (W + 80);
        const y = H / 2 + offset + amp1 * Math.sin(t * Math.PI * 1.6 + phase1) + amp2 * Math.sin(t * Math.PI * 5 + phase2);
        points.push({ x, y });
      } else {
        const y = -40 + t * (H + 80);
        const x = W / 2 + offset + amp1 * Math.sin(t * Math.PI * 1.4 + phase1) + amp2 * Math.sin(t * Math.PI * 4.6 + phase2);
        points.push({ x, y });
      }
    }
    return points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  }

  function makeCity(game) {
    const river = makeRiver(game);
    game.city.river = river;
    // Downtown sits on one bank, a little off the middle; industry takes one
    // side of the compass, which is where the freight would have gone.
    let center = null;
    for (let tries = 0; tries < 50 && !center; tries += 1) {
      const c = {
        x: RULES.mapWidth / 2 + (nextRandom(game) - 0.5) * 240,
        y: RULES.mapHeight / 2 + (nextRandom(game) - 0.5) * 160,
      };
      const d = distanceToPolyline(c, river);
      if (d > 110 && d < 230) center = c;
    }
    if (!center) center = { x: RULES.mapWidth / 2, y: RULES.mapHeight / 2 - 200 };
    game.city.center = { x: Math.round(center.x), y: Math.round(center.y) };
    game.city.industryAngle = Math.round(nextRandom(game) * 360);
  }

  function cityRadius(game) {
    const weeks = game.tick / ticksPerWeek();
    return Math.min(760, 150 + 26 * game.stations.length + 40 * weeks);
  }

  function placeable(game, p) {
    if (p.x < RULES.edgeMargin || p.y < RULES.edgeMargin) return false;
    if (p.x > RULES.mapWidth - RULES.edgeMargin || p.y > RULES.mapHeight - RULES.edgeMargin) return false;
    if (distanceToPolyline(p, game.city.river) < RULES.riverClearance) return false;
    for (const s of game.stations) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < RULES.stationSpacing) return false;
    }
    return true;
  }

  function samplePosition(game, minFraction = 0) {
    const c = game.city.center;
    const R = cityRadius(game);
    for (let tries = 0; tries < 80; tries += 1) {
      const angle = nextRandom(game) * Math.PI * 2;
      const f = minFraction + (1 - minFraction) * Math.sqrt(nextRandom(game));
      const p = { x: Math.round(c.x + Math.cos(angle) * R * f), y: Math.round(c.y + Math.sin(angle) * R * f * 0.78) };
      if (placeable(game, p)) return p;
    }
    return null;
  }

  function districtKind(game, p) {
    const c = game.city.center;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    const angle = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
    let delta = Math.abs(((angle - game.city.industryAngle) % 360 + 540) % 360 - 180);
    const sector = Math.max(0, 1 - delta / 75);
    const weights = [
      ["commercial", 0.25 + 1.7 * Math.exp(-((d / 240) ** 2))],
      ["residential", 0.9 + 0.9 * Math.min(1, d / 380)],
      ["industrial", 0.18 + 1.5 * sector * Math.min(1, d / 220)],
    ];
    // Three of a kind in a row reads as a bug, not a city.
    const recent = game.stations.slice(-3).map((s) => s.kind);
    if (recent.length === 3 && recent.every((k) => k === recent[0])) {
      for (const w of weights) if (w[0] === recent[0]) w[1] *= 0.25;
    }
    return pick(game, weights);
  }

  function addStation(game, p, kind) {
    const station = {
      id: game.nextId++,
      x: p.x,
      y: p.y,
      kind,
      born: game.tick,
      waiting: [],
      crowd: 0,
      interchange: false,
      served: 0,
      spawnAcc: nextRandom(game) * 0.5,
    };
    game.stations.push(station);
    game.networkVersion += 1;
    game.events.push({ tick: game.tick, type: "station", stationId: station.id });
    return station;
  }

  function addSite(game, index) {
    const site = game.city.sites[index];
    const s = addStation(game, { x: site.x, y: site.y }, site.kind);
    s.name = { zh: site.name.zh, en: site.name.en };
    s.site = index;
    return s;
  }

  // On a pot the stations come from its sites: the next real landmark when
  // the schedule calls for one (none in the city, none on the map), otherwise
  // the next place people live and work, in the order the converter ranked.
  function spawnPotStation(game) {
    const sites = game.city.sites;
    const used = new Set(game.stations.map((s) => s.site));
    const free = (i) => !used.has(i);
    const landmark = LANDMARKS.find(([at]) => at === game.stations.length + 1);
    let index = landmark ? sites.findIndex((s, i) => free(i) && s.kind === landmark[1]) : -1;
    if (index < 0) index = sites.findIndex((s, i) => free(i) && EVERYDAY.includes(s.kind));
    if (index < 0) index = sites.findIndex((s, i) => free(i));
    return index < 0 ? null : addSite(game, index);
  }

  function spawnStation(game) {
    if (isPot(game)) return spawnPotStation(game);
    const count = game.stations.length;
    const landmark = LANDMARKS.find(([at]) => at === count + 1);
    if (landmark) {
      const far = landmark[1] === "airport" || landmark[1] === "port" ? 0.62 : landmark[1] === "stadium" ? 0.35 : 0;
      const p = samplePosition(game, far) || samplePosition(game, 0);
      if (p) return addStation(game, p, landmark[1]);
      return null;
    }
    const p = samplePosition(game, 0);
    if (!p) return null;
    return addStation(game, p, districtKind(game, p));
  }

  function nextStationDelay(game) {
    const weeks = game.tick / ticksPerWeek();
    // Calibrated by hand play (2026-10-01): at the earlier 26 - 3w the city
    // passed 30 stations by week 4, every line was forced past ten stops on
    // one or two trains, and careful play (loops, interchanges, rebalancing)
    // lasted no longer than a bot that never reorganises. Slower growth
    // leaves the difference to the player.
    const seconds = Math.max(12, 28 - weeks * 2.5) * (0.8 + nextRandom(game) * 0.45);
    return Math.round(seconds * RULES.ticksPerSecond);
  }

  // ----- the road modes' legs ------------------------------------------------
  //
  // A bus or BRT leg is a road route, canonical per station pair (lower id
  // first) and cached outside the state. On a generated city it is a right-
  // angled L, the lower id running across first, and it crosses the river
  // only at a bridge. On a pot it is the shortest way along the real roads
  // (the BRT along avenue tiles only): one per tile, half more for each turn,
  // ties to north, east, south, west.

  const round1 = (v) => Math.round(v * 10) / 10;

  function ortho(p, q, across) {
    const bend = across ? { x: q.x, y: p.y } : { x: p.x, y: q.y };
    return [{ x: p.x, y: p.y }, bend, { x: q.x, y: q.y }];
  }

  function joinRuns(runs) {
    const out = [];
    for (const run of runs) {
      for (const p of run) {
        const last = out[out.length - 1];
        if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push({ x: p.x, y: p.y });
      }
    }
    return out;
  }

  // Bridges are derived, never stored: two (three on a long river) at even
  // arc lengths, each nudged by a hash of the seed, so they draw nothing from
  // the random stream and a metro-only game never knows they are there.
  const bridgeCache = new WeakMap();
  function bridgesOf(game) {
    if (isPot(game)) return [];
    const river = game.city.river;
    const cached = bridgeCache.get(game);
    if (cached && cached.river === river) return cached.bridges;
    const total = polylineLength(river);
    const count = total > 1400 ? 3 : 2;
    // The river overhangs the map by 40 at each end.
    const usable = Math.max(0, total - 80);
    const bridges = [];
    for (let k = 0; k < count; k += 1) {
      const nudge = ((World.hash32(`bridge:${game.seed}:${k}`) % 1001) / 1000 - 0.5) * 0.16;
      const s = Math.max(0.06, Math.min(0.94, (k + 0.5) / count + nudge));
      const at = pointAlong(river, 40 + usable * s);
      // The deck runs square to the map: a river flowing across takes a
      // north-south bridge, one flowing down an east-west one.
      const across = Math.abs(Math.cos(at.angle)) < Math.abs(Math.sin(at.angle));
      const ux = across ? 1 : 0;
      const uy = across ? 0 : 1;
      let half = RULES.riverHalfWidth + 16;
      let a = null;
      let b = null;
      for (let tries = 0; tries < 12; tries += 1) {
        a = { x: round1(at.x - ux * half), y: round1(at.y - uy * half) };
        b = { x: round1(at.x + ux * half), y: round1(at.y + uy * half) };
        if (distanceToPolyline(a, river) >= RULES.riverHalfWidth + 6 && distanceToPolyline(b, river) >= RULES.riverHalfWidth + 6) break;
        half += 8;
      }
      bridges.push({ x: round1(at.x), y: round1(at.y), a, b });
    }
    bridgeCache.set(game, { river, bridges });
    return bridges;
  }

  // How crowded the streets under a generated-city leg are: denser near the
  // centre (Basin plan 2.4).
  function groundLoad(game, points) {
    const c = game.city.center;
    const total = polylineLength(points);
    const samples = Math.max(2, Math.ceil(total / 24) + 1);
    let sum = 0;
    for (let i = 0; i < samples; i += 1) {
      const p = pointAlong(points, (total * i) / (samples - 1));
      sum += Math.exp(-((Math.hypot(p.x - c.x, p.y - c.y) / 260) ** 2));
    }
    return 0.3 + (0.7 * sum) / samples;
  }

  function groundRoute(game, p, q) {
    const direct = ortho(p, q, true);
    const crossings = riverCrossings(game, direct);
    const done = (points) => ({ points: joinRuns([points]), problem: "", tiles: null, load: groundLoad(game, points) });
    if (crossings === 0) return done(direct);
    if (crossings % 2 === 0) {
      const other = ortho(p, q, false);
      if (riverCrossings(game, other) === 0) return done(other);
      return { points: joinRuns([direct]), problem: "bridge", tiles: null, load: 0 };
    }
    // Over a bridge: the approach and the way on stay each on their own
    // bank, so the one crossing is the deck's.
    let best = null;
    for (const bridge of bridgesOf(game)) {
      for (const [near, far] of [[bridge.a, bridge.b], [bridge.b, bridge.a]]) {
        const approach = ortho(p, near, true);
        const onward = ortho(far, q, true);
        if (riverCrossings(game, approach) || riverCrossings(game, onward) || riverCrossings(game, [near, far]) !== 1) continue;
        const points = joinRuns([approach, onward]);
        const length = polylineLength(points);
        if (!best || length < best.length - 1e-9) best = { points, length };
      }
    }
    return best ? done(best.points) : { points: joinRuns([direct]), problem: "bridge", tiles: null, load: 0 };
  }

  // The pot's roads, avenues and traffic as lookup layers, built once per city.
  const potGraphs = new WeakMap();
  function potGraph(game) {
    const city = game.city;
    let graph = potGraphs.get(city);
    if (graph) return graph;
    const count = city.size * city.size;
    const road = new Uint8Array(count);
    for (const i of city.roads) road[i] = 1;
    const avenue = new Uint8Array(count);
    for (let k = 0; k < city.avenue.length; k += 2) avenue[city.avenue[k]] = city.avenue[k + 1];
    const jam = new Uint8Array(count);
    for (let k = 0; k < city.jam.length; k += 2) jam[city.jam[k]] = city.jam[k + 1];
    graph = { size: city.size, road, avenue, jam };
    potGraphs.set(city, graph);
    return graph;
  }

  const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  // Tile path from one stop tile to another over `pass`, as [x0, y0, x1, y1,
  // ...], or null. Costs are doubled to stay integral (a tile 2, a turn 1),
  // so a bucket queue settles them in order; first come wins a tie, and
  // neighbours are tried north, east, south, west.
  function shortestPath(size, pass, from, to) {
    const start = from[1] * size + from[0];
    const goal = to[1] * size + to[0];
    if (!pass[start] || !pass[goal]) return null;
    if (start === goal) return [from[0], from[1]];
    const states = size * size * 5;
    const best = new Int32Array(states).fill(0x7fffffff);
    const prev = new Int32Array(states).fill(-1);
    const buckets = [];
    const origin = start * 5 + 4;
    best[origin] = 0;
    buckets[0] = [origin];
    let found = -1;
    for (let cost = 0; cost < buckets.length && found < 0; cost += 1) {
      const bucket = buckets[cost];
      if (!bucket) continue;
      for (let k = 0; k < bucket.length; k += 1) {
        const state = bucket[k];
        if (best[state] !== cost) continue;
        const tile = (state / 5) | 0;
        if (tile === goal) { found = state; break; }
        const heading = state % 5;
        const x = tile % size;
        const y = (tile - x) / size;
        for (let d = 0; d < 4; d += 1) {
          const nx = x + STEPS[d][0];
          const ny = y + STEPS[d][1];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const next = ny * size + nx;
          if (!pass[next]) continue;
          const nc = cost + 2 + (heading !== 4 && heading !== d ? 1 : 0);
          const ns = next * 5 + d;
          if (nc < best[ns]) {
            best[ns] = nc;
            prev[ns] = state;
            (buckets[nc] ||= []).push(ns);
          }
        }
      }
    }
    if (found < 0) return null;
    const tiles = [];
    for (let state = found; state >= 0; state = prev[state]) tiles.push((state / 5) | 0);
    tiles.reverse();
    return tiles.flatMap((tile) => [tile % size, (tile - (tile % size)) / size]);
  }

  function potRoute(game, p, q, mode) {
    const graph = potGraph(game);
    const city = game.city;
    const brt = mode === "brt";
    const problem = brt ? "avenue" : "road";
    const sp = city.sites[p.site];
    const sq = city.sites[q.site];
    const from = sp ? (brt ? sp.brt : sp.stop) : null;
    const to = sq ? (brt ? sq.brt : sq.stop) : null;
    const refused = { points: [{ x: p.x, y: p.y }, { x: q.x, y: q.y }], problem, tiles: null, load: 0 };
    if (!from || !to) return refused;
    const tiles = shortestPath(graph.size, brt ? graph.avenue : graph.road, from, to);
    if (!tiles) return refused;
    const centre = (k) => ({ x: city.bounds.x + (tiles[2 * k] + 0.5) * city.cell, y: city.bounds.y + (tiles[2 * k + 1] + 0.5) * city.cell });
    const n = tiles.length / 2;
    const turns = [];
    for (let k = 0; k < n; k += 1) {
      if (k === 0 || k === n - 1) { turns.push(centre(k)); continue; }
      const ax = tiles[2 * k] - tiles[2 * k - 2];
      const ay = tiles[2 * k + 1] - tiles[2 * k - 1];
      const bx = tiles[2 * k + 2] - tiles[2 * k];
      const by = tiles[2 * k + 3] - tiles[2 * k + 1];
      if (ax !== bx || ay !== by) turns.push(centre(k));
    }
    // From the station to its stop and from the last stop to the station,
    // square to the grid like the rest of the route.
    const points = joinRuns([ortho(p, turns[0], true), turns, ortho(turns[turns.length - 1], q, false)]);
    let load = 0;
    for (let k = 0; k < n; k += 1) {
      const i = tiles[2 * k + 1] * graph.size + tiles[2 * k];
      load += graph.avenue[i] ? 0 : graph.jam[i] / 3;
    }
    return { points, problem: "", tiles, load: load / n };
  }

  const legCache = new WeakMap();

  // The way between two stations for a mode, in travel order a -> b: its
  // points, and a reason it cannot be built ("road", "avenue", "bridge") or
  // "". A metro leg is legPoints, unchanged.
  function legRoute(game, a, b, mode = "metro") {
    if (!isRoad(mode)) return { points: legPoints(a, b), problem: "", tiles: null, load: 0 };
    const flip = a.id > b.id;
    const p = flip ? b : a;
    const q = flip ? a : b;
    let cache = legCache.get(game);
    if (!cache || cache.city !== game.city || cache.river !== game.city.river) {
      cache = { city: game.city, river: game.city.river, legs: new Map() };
      legCache.set(game, cache);
    }
    // On a generated city a bus and a BRT share a leg's shape.
    const key = `${isPot(game) ? mode : "road"}:${p.id}-${q.id}`;
    let entry = cache.legs.get(key);
    if (!entry) {
      entry = isPot(game) ? potRoute(game, p, q, mode) : groundRoute(game, p, q);
      cache.legs.set(key, entry);
    }
    return flip ? { ...entry, points: [...entry.points].reverse() } : entry;
  }

  function legPath(game, a, b, mode = "metro") {
    return legRoute(game, a, b, mode).points;
  }

  const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  function linePairs(stops, loop) {
    const out = [];
    const n = loop ? stops.length : stops.length - 1;
    for (let i = 0; i < n; i += 1) out.push(pairKey(stops[i], stops[(i + 1) % stops.length]));
    return out;
  }

  // Station pairs the BRT covers. On a generated city each costs one avenue
  // from the stock, however many BRT lines share it; on a pot the avenues are
  // the city's own and cost nothing.
  function avenuePairs(game, exceptLineId = 0) {
    const pairs = new Set();
    for (const record of game.lines) {
      if (record.id === exceptLineId || modeOfLine(record) !== "brt") continue;
      for (const key of linePairs(record.stops, record.loop)) pairs.add(key);
    }
    return pairs;
  }

  function avenuesUsed(game) {
    return isPot(game) ? 0 : avenuePairs(game).size;
  }

  // A bus on a pair the BRT runs rides the avenue too and crawls nowhere.
  function legLoad(game, aId, bId) {
    const a = station(game, aId);
    const b = station(game, bId);
    if (!a || !b) return 0;
    if (avenuePairs(game).has(pairKey(aId, bId))) return 0;
    return legRoute(game, a, b, "bus").load || 0;
  }

  // ----- game ---------------------------------------------------------------

  // The road modes arrive with their stock and their delivery count, at the
  // start of a game or (see the "modes.open" command) when a metro-only game
  // lays its first bus or BRT line.
  function addModes(game, modes) {
    game.modes = modes;
    game.deliveredBy = { metro: 0, brt: 0, bus: 0 };
    for (const [key, value] of Object.entries(RULES.startTransit)) game.owned[key] = (game.owned[key] || 0) + value;
  }

  // options: seed, mode ("classic" | "endless"), and optionally
  //   modes: ["metro", "brt", "bus"] -- the road modes, their stock, rewards
  //     and the per-mode delivery count; left out, none of it exists;
  //   city: a pot from rootline-pot.js fromHandoff (copied into the state);
  //   name: { zh, en } for a generated city that should not take the seed's.
  function createGame(options = {}) {
    const seed = seedFrom(options.seed ?? 1);
    const pot = options.city && options.city.kind === "pot" ? JSON.parse(JSON.stringify(options.city)) : null;
    const modes = normalizeModes(options.modes);
    const game = {
      version: pot ? 2 : 1,
      seed,
      mode: options.mode === "endless" ? "endless" : "classic",
      rng: seed,
      tick: 0,
      nextId: 1,
      networkVersion: 0,
      city: pot
        ? { ...pot, name: nameOf(pot.name) || cityName(seed), width: RULES.mapWidth, height: RULES.mapHeight, river: [], industryAngle: 0 }
        : { name: nameOf(options.name) || cityName(seed), width: RULES.mapWidth, height: RULES.mapHeight, river: [], center: null, industryAngle: 0 },
      stations: [],
      lines: [],
      trains: [],
      owned: { ...RULES.start },
      interchangesUsed: 0,
      reward: null,
      over: null,
      delivered: 0,
      nextStationTick: 0,
      events: [],
    };
    if (modes) addModes(game, modes);
    if (pot) {
      // A pot opens on the planning table: its clock waits for the first line.
      game.planning = true;
      for (const index of pot.start) if (pot.sites[index]) addSite(game, index);
      game.nextStationTick = Math.round(16 * RULES.ticksPerSecond);
      return game;
    }
    makeCity(game);
    // Three stations to begin with: a home, a shop and a works (spec §2.1).
    const c = game.city.center;
    for (const kind of EVERYDAY) {
      let p = null;
      for (let tries = 0; tries < 200 && !p; tries += 1) {
        const angle = nextRandom(game) * Math.PI * 2;
        const r = 90 + nextRandom(game) * 120;
        const q = { x: Math.round(c.x + Math.cos(angle) * r), y: Math.round(c.y + Math.sin(angle) * r * 0.8) };
        if (placeable(game, q) && (kind !== "commercial" || Math.hypot(q.x - c.x, q.y - c.y) < 160)) p = q;
      }
      if (!p) p = samplePosition(game, 0);
      if (p) addStation(game, p, kind);
    }
    game.nextStationTick = Math.round(16 * RULES.ticksPerSecond);
    return game;
  }

  // Stations are never removed, so an index keyed by count stays valid.
  const stationIndex = new WeakMap();
  function station(game, id) {
    let entry = stationIndex.get(game);
    if (!entry || entry.count !== game.stations.length) {
      entry = { count: game.stations.length, byId: new Map(game.stations.map((s) => [s.id, s])) };
      stationIndex.set(game, entry);
    }
    return entry.byId.get(id) || null;
  }

  function line(game, id) {
    return game.lines.find((l) => l.id === id) || null;
  }

  function lineLegs(game, stops, loop, mode = "metro") {
    const legs = [];
    const count = loop ? stops.length : stops.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = station(game, stops[i]);
      const b = station(game, stops[(i + 1) % stops.length]);
      if (a && b) legs.push(isRoad(mode) ? legRoute(game, a, b, mode).points : legPoints(a, b));
    }
    return legs;
  }

  // Only the metro spends tunnels; the road modes cross by bridge.
  function stopsTunnels(game, stops, loop, mode = "metro") {
    if (isRoad(mode)) return 0;
    return lineLegs(game, stops, loop).reduce((sum, points) => sum + waterCrossings(game, points), 0);
  }

  // The first leg of a road line that cannot be built, and why.
  function roadProblem(game, stops, loop, mode) {
    const count = loop ? stops.length : stops.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = station(game, stops[i]);
      const b = station(game, stops[(i + 1) % stops.length]);
      const problem = a && b ? legRoute(game, a, b, mode).problem : "station";
      if (problem) return problem;
    }
    return "";
  }

  // What is left in the depot. Bus routes sit in slots past the seven line
  // slots (RULES.lineSlots + k - 1 for route 10 + k), so `lines` counts only
  // the metro and BRT; buses are road vehicles, flagged as such.
  function available(game) {
    const linesUsed = game.lines.filter((l) => l.slot < RULES.lineSlots).length;
    const rail = game.trains.filter((t) => !t.retiring && !t.road);
    const trainsUsed = rail.length;
    const carriagesUsed = rail.reduce((sum, t) => sum + t.carriages, 0);
    const tunnelsUsed = game.lines.reduce((sum, l) => sum + l.tunnels, 0);
    const out = {
      lines: game.owned.lines - linesUsed,
      trains: game.owned.trains - trainsUsed,
      carriages: game.owned.carriages - carriagesUsed,
      tunnels: game.owned.tunnels - tunnelsUsed,
      interchanges: game.owned.interchanges - game.interchangesUsed,
    };
    if (game.modes) {
      out.routes = game.owned.routes - game.lines.filter((l) => l.slot >= RULES.lineSlots).length;
      out.buses = game.owned.buses - game.trains.filter((t) => !t.retiring && t.road).length;
      out.avenues = game.owned.avenues - avenuesUsed(game);
    }
    return out;
  }

  function freeSlot(game) {
    for (let slot = 0; slot < RULES.lineSlots; slot += 1) {
      if (!game.lines.some((l) => l.slot === slot)) return slot;
    }
    return -1;
  }

  function freeRoute(game) {
    for (let k = 1; k <= RULES.routeSlots; k += 1) {
      const slot = RULES.lineSlots - 1 + k;
      if (!game.lines.some((l) => l.slot === slot)) return slot;
    }
    return -1;
  }

  // A bus route's number: 11 for the first route slot, up to 16.
  function routeNumber(slot) {
    return slot - RULES.lineSlots + 11;
  }

  // Whether a list of stops is a legal line. `lineId` is the line being
  // edited (its own tunnels are released for the comparison); `mode` is the
  // way it is laid, the edited line's own when not given.
  function validateStops(game, stops, loop, lineId, mode) {
    const kind = mode || (lineId ? modeOfLine(line(game, lineId)) : "metro");
    if (!Array.isArray(stops) || stops.length < 2) return "short";
    if (new Set(stops).size !== stops.length) return "repeat";
    if (loop && stops.length < 3) return "short";
    for (const id of stops) if (!station(game, id)) return "station";
    if (isRoad(kind)) {
      const problem = roadProblem(game, stops, loop, kind);
      if (problem) return problem;
      if (kind === "brt" && !isPot(game)) {
        const pairs = avenuePairs(game, lineId || 0);
        for (const key of linePairs(stops, loop)) pairs.add(key);
        if (pairs.size > game.owned.avenues) return "no-avenue";
      }
      return "";
    }
    const own = lineId ? line(game, lineId)?.tunnels || 0 : 0;
    const need = stopsTunnels(game, stops, loop);
    if (need > available(game).tunnels + own) return "tunnel";
    return "";
  }

  function makeTrain(game, lineRecord, atIndex = 0, dir = 1, road = false) {
    const train = {
      id: game.nextId++,
      lineId: lineRecord.id,
      carriages: 0,
      passengers: [],
      at: lineRecord.stops[atIndex],
      from: lineRecord.stops[atIndex],
      to: lineRecord.stops[atIndex],
      dir,
      dist: 0,
      length: 0,
      speed: 0,
      state: "dwell",
      dwell: 0,
      retiring: false,
      carried: 0,
    };
    // A bus or an articulated BRT bus: it comes from the bus depot, not the
    // train shed, whichever of the two its line runs as.
    if (road) train.road = true;
    game.trains.push(train);
    return train;
  }

  // ----- commands -----------------------------------------------------------
  //
  // Every change the player makes is one of these. They validate against the
  // state alone and either apply whole or not at all, so a replay of the same
  // log lands on the same state.

  const COMMANDS = {
    // A seeded game begins metro-only, so its hash and its weekly choices are
    // what they always were; the road modes are switched on by this command,
    // logged like any other, just before the first bus or BRT line.
    "modes.open"(game, { modes }) {
      if (game.modes) return "mode";
      const chosen = normalizeModes(modes);
      if (!chosen) return "mode";
      addModes(game, chosen);
      return "";
    },
    // `mode` is "metro" when left out; the road modes exist only in a game
    // created with them. A line records its mode only when it is not metro,
    // and a bus its route number.
    "line.create"(game, { stops, loop = false, mode = "metro" }) {
      if (!TRANSIT.includes(mode) || (mode !== "metro" && !game.modes?.includes(mode))) return "mode";
      let slot;
      if (mode === "bus") {
        if (available(game).routes <= 0) return "no-route";
        slot = freeRoute(game);
        if (slot < 0) return "no-route";
      } else {
        if (available(game).lines <= 0) return "no-line";
        slot = freeSlot(game);
        if (slot < 0) return "no-line";
      }
      const problem = validateStops(game, stops, loop, 0, mode);
      if (problem) return problem;
      const record = { id: game.nextId++, slot, stops: [...stops], loop: Boolean(loop), tunnels: stopsTunnels(game, stops, loop, mode), carried: 0, created: game.tick };
      if (mode !== "metro") record.mode = mode;
      if (mode === "bus") record.number = routeNumber(slot);
      game.lines.push(record);
      if (isRoad(mode)) {
        if (available(game).buses > 0) makeTrain(game, record, 0, 1, true);
      } else if (available(game).trains > 0) {
        makeTrain(game, record, 0, 1);
      }
      // The first line ends the planning table's wait: the clock starts.
      if (game.planning) game.planning = false;
      game.networkVersion += 1;
      return "";
    },
    "line.set"(game, { lineId, stops, loop = false }) {
      const record = line(game, lineId);
      if (!record) return "line";
      if (!Array.isArray(stops) || stops.length < 2) return COMMANDS["line.remove"](game, { lineId });
      const mode = modeOfLine(record);
      const problem = validateStops(game, stops, loop, lineId, mode);
      if (problem) return problem;
      record.stops = [...stops];
      record.loop = Boolean(loop);
      record.tunnels = stopsTunnels(game, stops, loop, mode);
      game.networkVersion += 1;
      return "";
    },
    // A bus route becomes a BRT line (a line slot, the line's colour, and on
    // a generated city an avenue for each new pair), or back again (a route
    // number). Its buses stay its buses.
    "line.mode"(game, { lineId, mode }) {
      const record = line(game, lineId);
      if (!record) return "line";
      const from = modeOfLine(record);
      if (!isRoad(from) || !isRoad(mode) || from === mode || !game.modes?.includes(mode)) return "mode";
      if (mode === "brt") {
        if (available(game).lines <= 0) return "no-line";
        const slot = freeSlot(game);
        if (slot < 0) return "no-line";
        const problem = validateStops(game, record.stops, record.loop, lineId, "brt");
        if (problem) return problem;
        record.slot = slot;
        record.mode = "brt";
        delete record.number;
      } else {
        if (available(game).routes <= 0) return "no-route";
        const slot = freeRoute(game);
        if (slot < 0) return "no-route";
        const problem = validateStops(game, record.stops, record.loop, lineId, "bus");
        if (problem) return problem;
        record.slot = slot;
        record.mode = "bus";
        record.number = routeNumber(slot);
      }
      game.events.push({ tick: game.tick, type: "mode", lineId, mode });
      game.networkVersion += 1;
      return "";
    },
    "line.remove"(game, { lineId }) {
      const index = game.lines.findIndex((l) => l.id === lineId);
      if (index < 0) return "line";
      game.lines.splice(index, 1);
      // Trains finish the leg they are on, set everybody down and go back to
      // the depot (the inventory).
      for (const train of game.trains) if (train.lineId === lineId) train.retiring = true;
      game.networkVersion += 1;
      return "";
    },
    "train.add"(game, { lineId }) {
      const record = line(game, lineId);
      if (!record) return "line";
      const road = isRoad(modeOfLine(record));
      if (road ? available(game).buses <= 0 : available(game).trains <= 0) return road ? "no-bus" : "no-train";
      // A second train starts at the far end, heading back, so the two do
      // not bunch; a third starts mid-line.
      const running = game.trains.filter((t) => t.lineId === lineId && !t.retiring).length;
      const index = running % 2 === 1 ? record.stops.length - 1 : Math.floor(record.stops.length / 2) * (running > 0 ? 1 : 0);
      const dir = record.loop ? (running % 2 === 1 ? -1 : 1) : index === record.stops.length - 1 ? -1 : 1;
      makeTrain(game, record, index, dir, road);
      game.networkVersion += 1;
      return "";
    },
    "train.remove"(game, { lineId }) {
      const trains = game.trains.filter((t) => t.lineId === lineId && !t.retiring);
      if (!trains.length) return isRoad(modeOfLine(line(game, lineId))) ? "no-bus" : "no-train";
      trains[trains.length - 1].retiring = true;
      game.networkVersion += 1;
      return "";
    },
    "carriage.add"(game, { lineId }) {
      // A bus takes no carriages: the BRT's articulated bus is already long.
      if (isRoad(modeOfLine(line(game, lineId)))) return "mode";
      if (available(game).carriages <= 0) return "no-carriage";
      const trains = game.trains.filter((t) => t.lineId === lineId && !t.retiring);
      if (!trains.length) return "no-train";
      let target = trains[0];
      for (const t of trains) if (t.carriages < target.carriages) target = t;
      if (target.carriages >= 3) return "full";
      target.carriages += 1;
      return "";
    },
    "station.interchange"(game, { stationId }) {
      const s = station(game, stationId);
      if (!s) return "station";
      if (s.interchange) return "already";
      if (available(game).interchanges <= 0) return "no-interchange";
      s.interchange = true;
      game.interchangesUsed += 1;
      return "";
    },
    "reward.choose"(game, { index }) {
      if (!game.reward) return "no-reward";
      const choice = game.reward.options[index];
      if (!choice) return "choice";
      if (choice === "line") game.owned.lines = Math.min(RULES.lineSlots, game.owned.lines + 1);
      if (choice === "carriage") game.owned.carriages += 1;
      if (choice === "tunnel") game.owned.tunnels += 2;
      if (choice === "interchange") game.owned.interchanges += 1;
      if (choice === "bus") {
        game.owned.routes = Math.min(RULES.routeSlots, game.owned.routes + 1);
        game.owned.buses += 2;
      }
      if (choice === "avenue") game.owned.avenues += 2;
      game.events.push({ tick: game.tick, type: "reward", choice });
      game.reward = null;
      return "";
    },
  };

  function apply(game, command) {
    if (!command || typeof command.type !== "string") return { ok: false, reason: "command" };
    if (game.over && command.type !== "reward.choose") return { ok: false, reason: "over" };
    const run = COMMANDS[command.type];
    if (!run) return { ok: false, reason: "command" };
    const reason = run(game, command) || "";
    return { ok: !reason, reason };
  }

  // "modes.open" and then `command`, as one: if the command is refused, the
  // game goes back to metro-only. The shell lays a metro-only game's first
  // road line this way; a log replays the same two commands.
  function applyOpening(game, modes, command) {
    if (game.modes) return apply(game, command);
    const owned = { ...game.owned };
    const opened = apply(game, { type: "modes.open", modes });
    if (!opened.ok) return opened;
    const result = apply(game, command);
    if (!result.ok) {
      delete game.modes;
      delete game.deliveredBy;
      game.owned = owned;
    }
    return result;
  }

  // ----- routing ------------------------------------------------------------
  //
  // Cost-to-go per destination kind over two node types: waiting at a
  // station, and riding line L in direction d at stop index i about to leave.
  // Costs are seconds-ish. Value iteration over a graph this small converges
  // in a few dozen passes and only runs when the network changes.

  const routeCache = new WeakMap();

  function lineGeometry(game, record) {
    const mode = modeOfLine(record);
    const legs = lineLegs(game, record.stops, record.loop, mode).map((points) => ({ points, length: polylineLength(points) }));
    if (mode === "bus") {
      // How crowded the streets under each leg are, for the peak's slowdown.
      legs.forEach((leg, i) => { leg.load = legLoad(game, record.stops[i], record.stops[(i + 1) % record.stops.length]); });
    }
    return legs;
  }

  function nextIndex(record, i, dir) {
    const n = record.stops.length;
    if (record.loop) return (i + dir + n) % n;
    const j = i + dir;
    return j < 0 || j >= n ? -1 : j;
  }

  function legBetween(record, legs, i, j) {
    // The leg joining stop i and stop j (adjacent), in travel order i -> j.
    const n = record.stops.length;
    let index;
    let forward;
    if (record.loop) {
      if ((i + 1) % n === j) { index = i; forward = true; } else { index = j; forward = false; }
    } else if (j === i + 1) { index = i; forward = true; } else { index = j; forward = false; }
    const leg = legs[index];
    if (!leg) return null;
    return { points: forward ? leg.points : [...leg.points].reverse(), length: leg.length, load: leg.load || 0 };
  }

  function routes(game) {
    // With buses on the map the peaks change the best way somewhere, so the
    // table is planned per period; a metro-only game plans once per network.
    const period = game.modes ? periodOf(clock(game.tick).hour) : "";
    const cached = routeCache.get(game);
    if (cached && cached.version === game.networkVersion && cached.stationCount === game.stations.length && cached.period === period) return cached;
    const peakNow = game.modes ? PERIOD_PEAK[period] || 0 : 0;
    const legsByLine = new Map();
    for (const record of game.lines) legsByLine.set(record.id, lineGeometry(game, record));
    // Only a line with a train on it is a way to get anywhere.
    const served = game.lines.filter((record) => game.trains.some((t) => t.lineId === record.id && !t.retiring));
    const kinds = [...new Set(game.stations.map((s) => s.kind))];
    const table = new Map();
    for (const kind of kinds) {
      const wait = new Map();
      for (const s of game.stations) wait.set(s.id, s.kind === kind ? 0 : Infinity);
      const ride = new Map();
      for (const record of served) {
        for (const dir of [1, -1]) ride.set(`${record.id}:${dir}`, record.stops.map(() => Infinity));
      }
      // ride = "stay aboard" (continue from stop i in direction dir, not
      // getting off here); aboard = the better of staying and alighting.
      const aboard = (record, dir, i) => Math.min(paceOf(modeOfLine(record)).alight + wait.get(record.stops[i]), ride.get(`${record.id}:${dir}`)[i]);
      for (let pass = 0; pass < 200; pass += 1) {
        let changed = false;
        for (const record of served) {
          const legs = legsByLine.get(record.id);
          const mode = modeOfLine(record);
          const pace = paceOf(mode);
          for (const dir of [1, -1]) {
            const costs = ride.get(`${record.id}:${dir}`);
            for (let i = 0; i < record.stops.length; i += 1) {
              let best = Infinity;
              const j = nextIndex(record, i, dir);
              if (j >= 0) {
                const leg = legBetween(record, legs, i, j);
                const slow = mode === "bus" && leg ? 1 + pace.peakSlowdown * peakNow * leg.load : 1;
                const travel = ((leg ? leg.length : 0) / pace.speed) * slow + RULES.dwellCost;
                best = travel + aboard(record, dir, j);
              } else if (!record.loop) {
                best = RULES.turnCost + ride.get(`${record.id}:${-dir}`)[i];
              }
              if (best < costs[i] - 1e-9) { costs[i] = best; changed = true; }
            }
          }
        }
        for (const record of served) {
          const board = paceOf(modeOfLine(record)).board;
          for (const dir of [1, -1]) {
            const costs = ride.get(`${record.id}:${dir}`);
            record.stops.forEach((sid, i) => {
              const candidate = board + costs[i];
              if (candidate < wait.get(sid) - 1e-9) { wait.set(sid, candidate); changed = true; }
            });
          }
        }
        if (!changed) break;
      }
      table.set(kind, { wait, ride });
    }
    const result = { version: game.networkVersion, stationCount: game.stations.length, period, table, legsByLine };
    routeCache.set(game, result);
    return result;
  }

  function waitCost(game, stationId, kind) {
    const entry = routes(game).table.get(kind);
    return entry ? entry.wait.get(stationId) ?? Infinity : Infinity;
  }

  function rideCost(game, lineId, dir, index, kind) {
    const entry = routes(game).table.get(kind);
    const costs = entry?.ride.get(`${lineId}:${dir}`);
    return costs ? costs[index] ?? Infinity : Infinity;
  }

  // ----- passengers ---------------------------------------------------------

  // originWeight and destinationWeights: World.hours (see the top of the file).

  function spawnPassengers(game, dt) {
    const { hour } = clock(game.tick);
    const weeks = game.tick / ticksPerWeek();
    // One passenger every half minute or so per station on an ordinary
    // afternoon in week one, climbing each week; the peaks multiply that for
    // the kinds that are sending people out at that hour.
    const base = (0.062 + Math.min(0.085, weeks * 0.016)) * activity(hour);
    const kinds = [...new Set(game.stations.map((s) => s.kind))];
    for (const s of game.stations) {
      // A new station eases in for a few seconds instead of arriving crowded.
      const age = (game.tick - s.born) / RULES.ticksPerSecond;
      const warm = Math.min(1, age / 6);
      s.spawnAcc += base * originWeight(s.kind, hour) * warm * dt;
      while (s.spawnAcc >= 1) {
        s.spawnAcc -= 1;
        // Endless has no failure, so a neglected station simply stops
        // gathering people past a point instead of growing without bound.
        if (game.mode === "endless" && s.waiting.length >= capacityOf(s) * 3) continue;
        const dest = pick(game, destinationWeights(s.kind, hour, kinds));
        if (!dest) continue;
        s.waiting.push({ id: game.nextId++, dest, born: game.tick });
      }
    }
  }

  // ----- trains -------------------------------------------------------------

  // A train is six a car; a bus or an articulated BRT bus is its mode's own
  // number and takes no carriages.
  function trainCapacity(train, game) {
    if (train.road) return paceOf(game ? modeOfLine(line(game, train.lineId)) : "bus").capacity || paceOf("bus").capacity;
    return RULES.carCapacity * (1 + train.carriages);
  }

  function vehicleMode(game, train) {
    const record = line(game, train.lineId);
    if (record) return modeOfLine(record);
    return train.road ? "bus" : "metro";
  }

  function lineIndexOf(record, stationId) {
    return record ? record.stops.indexOf(stationId) : -1;
  }

  function departureDir(record, index, dir) {
    if (record.loop) return dir;
    if (nextIndex(record, index, dir) < 0) return -dir;
    return dir;
  }

  function deliver(game, s, train) {
    s.served += 1;
    game.delivered += 1;
    if (game.deliveredBy) game.deliveredBy[train ? vehicleMode(game, train) : "metro"] += 1;
    if (train) {
      train.carried += 1;
      const record = line(game, train.lineId);
      if (record) record.carried += 1;
    }
    game.events.push({ tick: game.tick, type: "deliver", stationId: s.id });
  }

  // One boarding or alighting action at a dwelling train. Returns true when
  // something moved.
  function transferOne(game, train, record, s) {
    const pace = paceOf(vehicleMode(game, train));
    const index = lineIndexOf(record, s.id);
    const dir = index >= 0 ? departureDir(record, index, train.dir) : train.dir;
    // Alight first: arrived, or better off changing here.
    for (let k = 0; k < train.passengers.length; k += 1) {
      const p = train.passengers[k];
      if (p.dest === s.kind) {
        train.passengers.splice(k, 1);
        deliver(game, s, train);
        return true;
      }
      if (train.retiring || index < 0) {
        train.passengers.splice(k, 1);
        s.waiting.push(p);
        return true;
      }
      const stay = rideCost(game, record.id, dir, index, p.dest);
      const leave = pace.alight + waitCost(game, s.id, p.dest);
      // Nobody rides a train that can no longer take them anywhere useful:
      // a passenger the network stranded waits on the platform instead of
      // holding a seat for ever.
      if (!Number.isFinite(stay) || leave < stay - 1e-6) {
        train.passengers.splice(k, 1);
        s.waiting.push(p);
        return true;
      }
    }
    if (train.retiring || index < 0) return false;
    if (train.passengers.length >= trainCapacity(train, game)) return false;
    for (let k = 0; k < s.waiting.length; k += 1) {
      const p = s.waiting[k];
      const here = waitCost(game, s.id, p.dest);
      if (!Number.isFinite(here)) continue;
      const aboard = pace.board + rideCost(game, record.id, dir, index, p.dest);
      if (aboard <= here + 1e-6) {
        s.waiting.splice(k, 1);
        train.passengers.push(p);
        return true;
      }
    }
    return false;
  }

  function startLeg(game, train, record, fromIndex) {
    const dir = departureDir(record, fromIndex, train.dir);
    const toIndex = nextIndex(record, fromIndex, dir);
    if (toIndex < 0) return false;
    const legs = routes(game).legsByLine.get(record.id) || lineGeometry(game, record);
    const leg = legBetween(record, legs, fromIndex, toIndex);
    if (!leg) return false;
    train.dir = dir;
    train.from = record.stops[fromIndex];
    train.to = record.stops[toIndex];
    train.points = leg.points;
    train.length = leg.length;
    train.dist = 0;
    train.state = "moving";
    train.at = 0;
    // A bus remembers how crowded the streets on this leg are.
    if (modeOfLine(record) === "bus") train.load = leg.load || 0;
    return true;
  }

  function stepTrain(game, train, dt) {
    const record = line(game, train.lineId);
    const mode = record ? modeOfLine(record) : train.road ? "bus" : "metro";
    const pace = paceOf(mode);
    if (train.state === "moving") {
      const remaining = train.length - train.dist;
      const brake = Math.sqrt(2 * pace.accel * Math.max(0, remaining)) + 12;
      // A bus in the peak crawls with the traffic: up to 1.8 times slower in
      // the busiest streets at 18:00; the BRT's own lanes never jam.
      const top = mode === "bus" ? pace.speed / (1 + pace.peakSlowdown * peak(clock(game.tick).hour) * (train.load || 0)) : pace.speed;
      train.speed = Math.min(top, train.speed + pace.accel * dt, brake);
      train.dist += train.speed * dt;
      if (train.dist >= train.length) {
        train.dist = train.length;
        train.speed = 0;
        train.state = "dwell";
        train.at = train.to;
        train.dwell = 0;
        train.transferClock = 0;
        const s = station(game, train.at);
        if (s) game.events.push({ tick: game.tick, type: "arrive", stationId: s.id, slot: record ? record.slot : -1 });
      }
      return;
    }
    // Dwelling.
    const s = station(game, train.at);
    train.dwell += 1;
    const index = lineIndexOf(record, train.at);
    if (!record || index < 0 || train.retiring) {
      // Off its line: set everyone down here, then either rejoin the line at
      // its nearest stop or, if the line is gone, return to the depot.
      if (s && train.passengers.length) {
        train.transferClock = (train.transferClock || 0) + 1;
        if (train.transferClock >= pace.boardTicks) {
          train.transferClock = 0;
          transferOne(game, train, record, s);
        }
        return;
      }
      if (train.retiring || !record) {
        game.trains.splice(game.trains.indexOf(train), 1);
        return;
      }
      train.at = nearestStop(game, record, s);
      train.dir = 1;
      train.dwell = 0;
      return;
    }
    const every = s && s.interchange ? RULES.interchangeTransferTicks : pace.boardTicks;
    train.transferClock = (train.transferClock || 0) + 1;
    if (train.transferClock >= every) {
      train.transferClock = 0;
      if (s && transferOne(game, train, record, s)) {
        train.dwell = Math.min(train.dwell, pace.minDwellTicks - every);
        return;
      }
    }
    if (train.dwell >= pace.minDwellTicks) {
      if (!startLeg(game, train, record, index)) train.dwell = 0;
    }
  }

  function nearestStop(game, record, s) {
    let best = record.stops[0];
    let bestD = Infinity;
    for (const id of record.stops) {
      const t = station(game, id);
      const d = s && t ? Math.hypot(t.x - s.x, t.y - s.y) : 0;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  // Trains whose current leg no longer exists on their line finish it anyway
  // (the geometry travels with the train) and sort themselves out on arrival.

  // ----- crowding, growth, weeks --------------------------------------------

  function capacityOf(s) {
    return s.interchange ? RULES.interchangeCapacity : RULES.stationCapacity;
  }

  function stepCrowding(game, dt) {
    if (game.mode === "endless") {
      for (const s of game.stations) s.crowd = 0;
      return;
    }
    for (const s of game.stations) {
      if (s.waiting.length > capacityOf(s)) {
        s.crowd = Math.min(1, s.crowd + dt / RULES.overcrowdSeconds);
        if (s.crowd >= 1 && !game.over) {
          game.over = { tick: game.tick, stationId: s.id, week: clock(game.tick).week };
          game.events.push({ tick: game.tick, type: "over", stationId: s.id });
        }
      } else {
        s.crowd = Math.max(0, s.crowd - dt / RULES.recoverSeconds);
      }
    }
  }

  function offerReward(game) {
    const pool = REWARDS.filter((r) => r !== "line" || game.owned.lines < RULES.lineSlots);
    if (game.modes) {
      if (game.modes.includes("bus") && game.owned.routes < RULES.routeSlots) pool.push("bus");
      // A pot's avenues are the city's own; only a generated city sells them.
      if (game.modes.includes("brt") && !isPot(game)) pool.push("avenue");
    }
    let first = pool[Math.floor(nextRandom(game) * pool.length)];
    // The first week's choice always holds an avenue: by then the player has
    // watched seven evening peaks catch the buses (Basin plan 2.2).
    if (game.modes && clock(game.tick).week === 2 && pool.includes("avenue")) first = "avenue";
    const rest = pool.filter((r) => r !== first);
    const second = rest[Math.floor(nextRandom(game) * rest.length)];
    game.owned.trains += 1;
    game.reward = { week: clock(game.tick).week, options: [first, second] };
    game.events.push({ tick: game.tick, type: "week", week: clock(game.tick).week });
  }

  // ----- the tick -----------------------------------------------------------

  function step(game) {
    if (game.over || game.reward || game.planning) return game;
    const dt = 1 / RULES.ticksPerSecond;
    game.tick += 1;
    if (game.tick >= game.nextStationTick) {
      if (game.stations.length < stationCap(game)) spawnStation(game);
      game.nextStationTick = game.tick + nextStationDelay(game);
    }
    spawnPassengers(game, dt);
    // Iterate over a copy: a retiring train removes itself.
    for (const train of [...game.trains]) stepTrain(game, train, dt);
    stepCrowding(game, dt);
    if (game.tick % ticksPerWeek() === 0) offerReward(game);
    if (game.events.length > 80) game.events.splice(0, game.events.length - 80);
    return game;
  }

  // Run a whole game from its seed and a command log ({ tick, ...command }),
  // choosing no rewards the log does not choose. For the contract and for
  // anyone checking a result.
  function replay({ seed, mode, log = [], ticks, city, name, modes }) {
    const game = createGame({ seed, mode, city, name, modes });
    const queue = [...log].sort((a, b) => a.tick - b.tick);
    let cursor = 0;
    let guard = 0;
    while (game.tick < ticks && !game.over && guard < ticks * 2 + 10) {
      guard += 1;
      while (cursor < queue.length && queue[cursor].tick <= game.tick) {
        apply(game, queue[cursor]);
        cursor += 1;
      }
      if (game.reward) {
        if (cursor < queue.length && queue[cursor].type === "reward.choose") continue;
        apply(game, { type: "reward.choose", index: 0 });
      }
      step(game);
    }
    return game;
  }

  function cleanTurns(points) {
    const out = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) out.push(p);
    }
    return out;
  }

  // What the renderer needs about where a train is right now.
  function trainPose(game, train) {
    if (train.state === "moving" && train.points) {
      const p = pointAlong(train.points, train.dist);
      return { x: p.x, y: p.y, angle: p.angle };
    }
    const s = station(game, train.at);
    const record = line(game, train.lineId);
    let angle = 0;
    if (s && record) {
      const index = record.stops.indexOf(s.id);
      const j = index >= 0 ? nextIndex(record, index, departureDir(record, index, train.dir)) : -1;
      const t = j >= 0 ? station(game, record.stops[j]) : null;
      if (t) {
        const pts = cleanTurns(legPath(game, s, t, modeOfLine(record)));
        if (pts.length >= 2) angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      }
    }
    return { x: s ? s.x : 0, y: s ? s.y : 0, angle };
  }

  root.AISystem6RootlineCore = Object.freeze({
    RULES,
    KINDS,
    TRANSIT,
    isRoad,
    modeOfLine,
    paceOf,
    peak,
    isPot,
    stationCap,
    legRoute,
    legPath,
    legLoad,
    bridgesOf,
    waterCrossings,
    avenuesUsed,
    routeNumber,
    createGame,
    step,
    apply,
    applyOpening,
    replay,
    hashGame,
    clock,
    periodOf,
    ticksPerWeek,
    ticksPerDay,
    available,
    validateStops,
    stopsTunnels,
    legPoints,
    lineLegs,
    riverCrossings,
    distanceToPolyline,
    pointAlong,
    trainPose,
    trainCapacity,
    capacityOf,
    waitCost,
    station,
    line,
  });
})(typeof window !== "undefined" ? window : globalThis);
