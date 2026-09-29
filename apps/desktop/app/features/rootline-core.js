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
// Spec: internal/plans/TRANSIT-GAME-SPEC.zh-CN.md (§2, §8b).
(function installRootlineCore(root) {
  "use strict";

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
  });

  const KINDS = Object.freeze(["residential", "commercial", "industrial", "school", "hospital", "stadium", "airport", "port"]);
  const EVERYDAY = Object.freeze(["residential", "commercial", "industrial"]);

  // Landmarks arrive on a schedule, by station count, so every city meets
  // them in the same order and a player can learn the rhythm.
  const LANDMARKS = Object.freeze([
    [6, "school"], [10, "hospital"], [15, "stadium"], [19, "airport"], [24, "port"],
    [29, "school"], [34, "hospital"], [40, "stadium"],
  ]);

  const REWARDS = Object.freeze(["line", "carriage", "tunnel", "interchange"]);

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

  function bump(hour, center, width) {
    const d = (hour - center) / width;
    return Math.exp(-d * d);
  }

  // The two peaks. Morning pushes homes out to work and school; evening pulls
  // everybody home. A line that only serves one direction runs empty half the
  // day, which is the whole point of the time axis (spec §2.2, 二).
  function periodOf(hour) {
    if (hour >= 6.5 && hour < 9.5) return "morning";
    if (hour >= 16.5 && hour < 19.5) return "evening";
    if (hour >= 22 || hour < 5.5) return "night";
    return "day";
  }

  // How awake the city is. The peaks themselves live in originWeight, per
  // kind, so they can point in opposite directions.
  function activity(hour) {
    if (hour >= 23.5 || hour < 5) return 0.2;
    if (hour < 6.5) return 0.55;
    if (hour >= 21.5) return 0.5;
    return 1;
  }

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

  const NAME_HEADS = [["青", "Qing"], ["柳", "Liu"], ["石", "Shi"], ["松", "Song"], ["白", "Bai"], ["鹤", "He"], ["枫", "Feng"], ["渔", "Yu"], ["桐", "Tong"], ["兰", "Lan"], ["云", "Yun"], ["梅", "Mei"], ["苇", "Wei"], ["榕", "Rong"]];
  const NAME_TAILS = [["湾", "wan"], ["汀", "ting"], ["川", "chuan"], ["原", "yuan"], ["港", "gang"], ["桥", "qiao"], ["岭", "ling"], ["门", "men"], ["洲", "zhou"], ["浦", "pu"], ["溪", "xi"], ["陵", "ling"]];

  function cityName(seed) {
    const h = seedFrom(`name:${seed}`);
    const head = NAME_HEADS[h % NAME_HEADS.length];
    const tail = NAME_TAILS[Math.floor(h / NAME_HEADS.length) % NAME_TAILS.length];
    return { zh: `${head[0]}${tail[0]}`, en: `${head[1]}${tail[1]}` };
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

  function spawnStation(game) {
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
    const seconds = Math.max(10, 26 - weeks * 3) * (0.8 + nextRandom(game) * 0.45);
    return Math.round(seconds * RULES.ticksPerSecond);
  }

  // ----- game ---------------------------------------------------------------

  function createGame(options = {}) {
    const seed = seedFrom(options.seed ?? 1);
    const game = {
      version: 1,
      seed,
      mode: options.mode === "endless" ? "endless" : "classic",
      rng: seed,
      tick: 0,
      nextId: 1,
      networkVersion: 0,
      city: { name: cityName(seed), width: RULES.mapWidth, height: RULES.mapHeight, river: [], center: null, industryAngle: 0 },
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

  function lineLegs(game, stops, loop) {
    const legs = [];
    const count = loop ? stops.length : stops.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = station(game, stops[i]);
      const b = station(game, stops[(i + 1) % stops.length]);
      if (a && b) legs.push(legPoints(a, b));
    }
    return legs;
  }

  function stopsTunnels(game, stops, loop) {
    return lineLegs(game, stops, loop).reduce((sum, points) => sum + riverCrossings(game, points), 0);
  }

  function available(game) {
    const linesUsed = game.lines.length;
    const trainsUsed = game.trains.filter((t) => !t.retiring).length;
    const carriagesUsed = game.trains.reduce((sum, t) => sum + (t.retiring ? 0 : t.carriages), 0);
    const tunnelsUsed = game.lines.reduce((sum, l) => sum + l.tunnels, 0);
    return {
      lines: game.owned.lines - linesUsed,
      trains: game.owned.trains - trainsUsed,
      carriages: game.owned.carriages - carriagesUsed,
      tunnels: game.owned.tunnels - tunnelsUsed,
      interchanges: game.owned.interchanges - game.interchangesUsed,
    };
  }

  function freeSlot(game) {
    for (let slot = 0; slot < RULES.lineSlots; slot += 1) {
      if (!game.lines.some((l) => l.slot === slot)) return slot;
    }
    return -1;
  }

  // Whether a list of stops is a legal line. `lineId` is the line being
  // edited (its own tunnels are released for the comparison).
  function validateStops(game, stops, loop, lineId) {
    if (!Array.isArray(stops) || stops.length < 2) return "short";
    if (new Set(stops).size !== stops.length) return "repeat";
    if (loop && stops.length < 3) return "short";
    for (const id of stops) if (!station(game, id)) return "station";
    const own = lineId ? line(game, lineId)?.tunnels || 0 : 0;
    const need = stopsTunnels(game, stops, loop);
    if (need > available(game).tunnels + own) return "tunnel";
    return "";
  }

  function makeTrain(game, lineRecord, atIndex = 0, dir = 1) {
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
    game.trains.push(train);
    return train;
  }

  // ----- commands -----------------------------------------------------------
  //
  // Every change the player makes is one of these. They validate against the
  // state alone and either apply whole or not at all, so a replay of the same
  // log lands on the same state.

  const COMMANDS = {
    "line.create"(game, { stops, loop = false }) {
      if (available(game).lines <= 0) return "no-line";
      const slot = freeSlot(game);
      if (slot < 0) return "no-line";
      const problem = validateStops(game, stops, loop, 0);
      if (problem) return problem;
      const record = { id: game.nextId++, slot, stops: [...stops], loop: Boolean(loop), tunnels: stopsTunnels(game, stops, loop), carried: 0, created: game.tick };
      game.lines.push(record);
      if (available(game).trains > 0) makeTrain(game, record, 0, 1);
      game.networkVersion += 1;
      return "";
    },
    "line.set"(game, { lineId, stops, loop = false }) {
      const record = line(game, lineId);
      if (!record) return "line";
      if (!Array.isArray(stops) || stops.length < 2) return COMMANDS["line.remove"](game, { lineId });
      const problem = validateStops(game, stops, loop, lineId);
      if (problem) return problem;
      record.stops = [...stops];
      record.loop = Boolean(loop);
      record.tunnels = stopsTunnels(game, stops, loop);
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
      if (available(game).trains <= 0) return "no-train";
      // A second train starts at the far end, heading back, so the two do
      // not bunch; a third starts mid-line.
      const running = game.trains.filter((t) => t.lineId === lineId && !t.retiring).length;
      const index = running % 2 === 1 ? record.stops.length - 1 : Math.floor(record.stops.length / 2) * (running > 0 ? 1 : 0);
      const dir = record.loop ? (running % 2 === 1 ? -1 : 1) : index === record.stops.length - 1 ? -1 : 1;
      makeTrain(game, record, index, dir);
      game.networkVersion += 1;
      return "";
    },
    "train.remove"(game, { lineId }) {
      const trains = game.trains.filter((t) => t.lineId === lineId && !t.retiring);
      if (!trains.length) return "no-train";
      trains[trains.length - 1].retiring = true;
      game.networkVersion += 1;
      return "";
    },
    "carriage.add"(game, { lineId }) {
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

  // ----- routing ------------------------------------------------------------
  //
  // Cost-to-go per destination kind over two node types: waiting at a
  // station, and riding line L in direction d at stop index i about to leave.
  // Costs are seconds-ish. Value iteration over a graph this small converges
  // in a few dozen passes and only runs when the network changes.

  const routeCache = new WeakMap();

  function lineGeometry(game, record) {
    const legs = lineLegs(game, record.stops, record.loop).map((points) => ({ points, length: polylineLength(points) }));
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
    return { points: forward ? leg.points : [...leg.points].reverse(), length: leg.length };
  }

  function routes(game) {
    const cached = routeCache.get(game);
    if (cached && cached.version === game.networkVersion && cached.stationCount === game.stations.length) return cached;
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
      const aboard = (record, dir, i) => Math.min(RULES.alightCost + wait.get(record.stops[i]), ride.get(`${record.id}:${dir}`)[i]);
      for (let pass = 0; pass < 200; pass += 1) {
        let changed = false;
        for (const record of served) {
          const legs = legsByLine.get(record.id);
          for (const dir of [1, -1]) {
            const costs = ride.get(`${record.id}:${dir}`);
            for (let i = 0; i < record.stops.length; i += 1) {
              let best = Infinity;
              const j = nextIndex(record, i, dir);
              if (j >= 0) {
                const leg = legBetween(record, legs, i, j);
                const travel = (leg ? leg.length : 0) / RULES.trainSpeed + RULES.dwellCost;
                best = travel + aboard(record, dir, j);
              } else if (!record.loop) {
                best = RULES.turnCost + ride.get(`${record.id}:${-dir}`)[i];
              }
              if (best < costs[i] - 1e-9) { costs[i] = best; changed = true; }
            }
          }
        }
        for (const record of served) {
          for (const dir of [1, -1]) {
            const costs = ride.get(`${record.id}:${dir}`);
            record.stops.forEach((sid, i) => {
              const candidate = RULES.boardCost + costs[i];
              if (candidate < wait.get(sid) - 1e-9) { wait.set(sid, candidate); changed = true; }
            });
          }
        }
        if (!changed) break;
      }
      table.set(kind, { wait, ride });
    }
    const result = { version: game.networkVersion, stationCount: game.stations.length, table, legsByLine };
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

  function originWeight(kind, hour) {
    const m = bump(hour, 8, 1.5);
    const e = bump(hour, 18, 1.6);
    switch (kind) {
      case "residential": return 0.55 + 1.9 * m + 0.2 * e;
      case "commercial": return 0.45 + 0.25 * m + 1.6 * e;
      case "industrial": return 0.35 + 0.1 * m + 1.8 * e;
      case "school": return 0.2 + 2.2 * bump(hour, 15.5, 1);
      case "hospital": return 0.55;
      case "stadium": return 0.15 + 2.6 * bump(hour, 21, 0.9);
      case "airport": return 0.95;
      case "port": return 0.6;
      default: return 0.5;
    }
  }

  function destinationWeights(origin, hour, kinds) {
    const m = bump(hour, 8, 1.6);
    const e = bump(hour, 18, 1.7);
    const mid = bump(hour, 12.5, 2.2);
    const table = {
      residential: { commercial: 0.8 + 1.4 * m + 0.9 * mid, industrial: 0.6 + 2.0 * m, school: 2.2 * m + 0.2, hospital: 0.35, stadium: 0.1 + 1.6 * e, airport: 0.3, port: 0.2 },
      commercial: { residential: 0.7 + 2.8 * e, industrial: 0.35, school: 0.1, hospital: 0.25, stadium: 0.1 + 0.9 * e, airport: 0.35, port: 0.2 },
      industrial: { residential: 0.7 + 3.0 * e, commercial: 0.45 + 0.4 * mid, hospital: 0.2, port: 0.8, airport: 0.25, stadium: 0.5 * e },
      school: { residential: 1.6, commercial: 0.4, stadium: 0.3 },
      hospital: { residential: 1.3, commercial: 0.5 },
      stadium: { residential: 1.7, commercial: 0.6 },
      airport: { commercial: 1.2, residential: 1.0, industrial: 0.4, stadium: 0.3 },
      port: { industrial: 1.2, commercial: 0.6, residential: 0.5 },
    };
    const row = table[origin] || {};
    return kinds.filter((k) => k !== origin).map((k) => [k, row[k] ?? 0.15]);
  }

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

  function trainCapacity(train) {
    return RULES.carCapacity * (1 + train.carriages);
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
      const leave = RULES.alightCost + waitCost(game, s.id, p.dest);
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
    if (train.passengers.length >= trainCapacity(train)) return false;
    for (let k = 0; k < s.waiting.length; k += 1) {
      const p = s.waiting[k];
      const here = waitCost(game, s.id, p.dest);
      if (!Number.isFinite(here)) continue;
      const aboard = RULES.boardCost + rideCost(game, record.id, dir, index, p.dest);
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
    return true;
  }

  function stepTrain(game, train, dt) {
    const record = line(game, train.lineId);
    if (train.state === "moving") {
      const remaining = train.length - train.dist;
      const brake = Math.sqrt(2 * RULES.trainAccel * Math.max(0, remaining)) + 12;
      train.speed = Math.min(RULES.trainSpeed, train.speed + RULES.trainAccel * dt, brake);
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
        if (train.transferClock >= RULES.transferTicks) {
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
    const pace = s && s.interchange ? RULES.interchangeTransferTicks : RULES.transferTicks;
    train.transferClock = (train.transferClock || 0) + 1;
    if (train.transferClock >= pace) {
      train.transferClock = 0;
      if (s && transferOne(game, train, record, s)) {
        train.dwell = Math.min(train.dwell, RULES.minDwellTicks - pace);
        return;
      }
    }
    if (train.dwell >= RULES.minDwellTicks) {
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
    const first = pool[Math.floor(nextRandom(game) * pool.length)];
    const rest = pool.filter((r) => r !== first);
    const second = rest[Math.floor(nextRandom(game) * rest.length)];
    game.owned.trains += 1;
    game.reward = { week: clock(game.tick).week, options: [first, second] };
    game.events.push({ tick: game.tick, type: "week", week: clock(game.tick).week });
  }

  // ----- the tick -----------------------------------------------------------

  function step(game) {
    if (game.over || game.reward) return game;
    const dt = 1 / RULES.ticksPerSecond;
    game.tick += 1;
    if (game.tick >= game.nextStationTick) {
      if (game.stations.length < 64) spawnStation(game);
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
  function replay({ seed, mode, log = [], ticks }) {
    const game = createGame({ seed, mode });
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
        const pts = legPoints(s, t);
        angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        if (pts[1].x === pts[0].x && pts[1].y === pts[0].y) angle = Math.atan2(pts[2].y - pts[1].y, pts[2].x - pts[1].x);
      }
    }
    return { x: s ? s.x : 0, y: s ? s.y : 0, angle };
  }

  root.AISystem6RootlineCore = Object.freeze({
    RULES,
    KINDS,
    createGame,
    step,
    apply,
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
