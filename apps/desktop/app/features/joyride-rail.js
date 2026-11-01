// Joyride / 兜风 — the railway under and beside the street (P3), headless.
//
// Spec §6: a city without Rootline's line identities (Rootline P2's sidecar
// does not exist yet) still has Bonsai City's own track and stations, and its
// trains run at a default interval. This file reads those tiles into lines:
//
// - A line is one connected run of track (railway or subway). With
//   stations, its path goes from the station at one end of the run through
//   every other station to the far one, tile by tile. A railway without one
//   (OpenStreetMap imports lay track but no stations) still gets a train
//   along its longest run; there is just nowhere to board it.
// - One train shuttles up and down each line (Bonsai track is a single
//   track, so two trains would meet head on), dwelling at every station. Where
//   it is is a pure function of the line and the time: no state, no clock,
//   no randomness, so the street, a ride and the contract all agree.
// - A level crossing is a tile with both road and railway. It is closed
//   while the train is within a few tiles of it.
// - A ride is a timetable lookup: the next departure from one station and
//   the arrival at another on the same line.
//
// Contract: tests/features/joyride.test.mjs (P3 railway section).
(function installJoyrideRail(global) {
  "use strict";

  const METRE = 1 / 16;
  const KMH = METRE / 3.6;
  const SPEED = 55 * KMH;            // tiles a second at full speed
  const EASE = 1.5;                  // accelerating and braking: a run takes half again as long
  const DWELL = 8;                   // seconds at a station
  const TURN = 4;                    // seconds at the end of a line without a station
  const CROSSING_REACH = 3.2;        // tiles either side of a crossing while the train passes
  const CAR_SPACING = 0.48;          // tiles between a locomotive and its coach
  const MIN_BARE_RUN = 8;            // tiles of station-less track worth a train
  const STATION_KINDS = Object.freeze({ station: "rail", "subway-station": "subway" });
  const FOOTPRINT = Object.freeze({ station: 2, "subway-station": 1 });
  const COMPASS = Object.freeze(["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"]);

  function layerAt(snapshot, layer, i) {
    return Number(snapshot[layer]?.[i]) || 0;
  }

  // Track tiles of one kind split into connected runs (four neighbours).
  function components(snapshot, layer) {
    const size = Number(snapshot.size) || 0;
    const label = new Int32Array(size * size).fill(-1);
    const runs = [];
    for (let start = 0; start < size * size; start += 1) {
      if (label[start] >= 0 || !layerAt(snapshot, layer, start)) continue;
      const tiles = [start];
      label[start] = runs.length;
      for (let head = 0; head < tiles.length; head += 1) {
        const i = tiles[head], x = i % size, y = Math.floor(i / size);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
          const n = ny * size + nx;
          if (label[n] >= 0 || !layerAt(snapshot, layer, n)) return;
          label[n] = runs.length;
          tiles.push(n);
        });
      }
      runs.push(tiles);
    }
    return { label, runs };
  }

  // Breadth-first over one run of track: distance and parent of every tile.
  function search(snapshot, layer, sources) {
    const size = Number(snapshot.size) || 0;
    const distance = new Int32Array(size * size).fill(-1);
    const parent = new Int32Array(size * size).fill(-1);
    const queue = [];
    sources.forEach((tile) => { if (distance[tile] < 0) { distance[tile] = 0; queue.push(tile); } });
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head], x = i % size, y = Math.floor(i / size);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
        const n = ny * size + nx;
        if (distance[n] >= 0 || !layerAt(snapshot, layer, n)) return;
        distance[n] = distance[i] + 1;
        parent[n] = i;
        queue.push(n);
      });
    }
    return { distance, parent };
  }

  // The tiles from `from` to `to` along the track, both included.
  function walk(snapshot, layer, from, to) {
    const { parent, distance } = search(snapshot, layer, [from]);
    if (distance[to] < 0) return null;
    const tiles = [to];
    while (tiles[tiles.length - 1] !== from) tiles.push(parent[tiles[tiles.length - 1]]);
    return tiles.reverse();
  }

  // Which way a station lies from the middle of the city, for its name.
  function compassOf(size, x, y) {
    const dx = x - size / 2, dy = y - size / 2;
    if (Math.hypot(dx, dy) < size * 0.15) return "central";
    const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    return COMPASS[(octant + 8) % 8];
  }

  // --- the network -------------------------------------------------------------------

  // --- buses ------------------------------------------------------------------------
  //
  // A bus or BRT line from a Rootline plan runs on the roads: its tiles in
  // driving order (a loop closes on itself; otherwise it turns back at the
  // end), stopping at its stops. Buses keep to the right-hand lane; their
  // timetable is worked out from the road itself, so a bus crawls through
  // a tile the city counts as congested, unless it is a BRT on its own lane.
  // Several vehicles run the same timetable, a headway apart.
  const BUS_HEADWAY = Object.freeze({ bus: 10, brt: 6 });   // city minutes
  // Speed and dwell are the shared table's. A missing table uses the same
  // numbers the table publishes, so a test that has not loaded it still runs.
  function busMotion(mode) {
    const row = global.AISystem6PotWorld?.transit?.MODES?.[mode]?.joyride;
    const kmh = Number(row?.kmh) > 0 ? row.kmh : (mode === "brt" ? 50 : 40);
    const dwell = Number(row?.dwellSeconds) > 0 ? row.dwellSeconds : (mode === "brt" ? 6 : 10);
    return { speed: kmh * KMH, dwell };
  }
  function hashLine(id) {
    const fn = global.AISystem6PotWorld?.hash32;
    if (typeof fn === "function") return fn(String(id)) >>> 0;
    let hash = 2166136261;
    const text = String(id);
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
  }
  const CITY_SECONDS = 15;                                  // city seconds per street second (the shift's pace)
  const BUS_LANE = 2 * METRE;            // a bus on an ordinary street: its right-hand lane
  const BUSWAY = 3.75 * METRE;           // on an avenue: the busway, out from the median
  const AVENUE_LEFT = Object.freeze({ 1: [-1, 0], 2: [0, -1], 4: [1, 0], 8: [0, 1] });
  const AVENUE_BACK = Object.freeze({ 1: 4, 2: 8, 4: 1, 8: 2 });

  // The median of the avenue a tile is half of: a vector from the tile's
  // centre to it (tiles), or null when the tile is not an avenue half.
  function medianOf(snapshot, tile) {
    const size = Number(snapshot.size) || 0;
    const raw = snapshot.avenue;
    const dir = raw ? Number(raw[tile]) || 0 : 0;
    const left = AVENUE_LEFT[dir];
    if (!left) return null;
    const x = (tile % size) + left[0], y = Math.floor(tile / size) + left[1];
    if (x < 0 || y < 0 || x >= size || y >= size || Number(raw[y * size + x]) !== AVENUE_BACK[dir]) return null;
    return [left[0] * 0.5, left[1] * 0.5];
  }
  function busLines(snapshot, transit, lines, stations) {
    const size = Number(snapshot.size) || 0;
    (Array.isArray(transit?.lines) ? transit.lines : []).forEach((plan) => {
      const mode = plan?.mode === "brt" ? "brt" : plan?.mode === "bus" ? "bus" : null;
      if (!mode) return;
      const tiles = Array.isArray(plan.tiles) ? plan.tiles : [];
      const path = [];
      for (let i = 0; i + 1 < tiles.length; i += 2) {
        const x = tiles[i], y = tiles[i + 1];
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) continue;
        const tile = y * size + x;
        if (path[path.length - 1] !== tile) path.push(tile);
      }
      if (path.length < 3) return;
      const loop = plan.loop === true;
      if (loop && path[path.length - 1] !== path[0]) path.push(path[0]);
      // Seconds to cross each tile, from the road as the city has it.
      const motion = busMotion(mode);
      const crossing = path.map((tile) => {
        const jammed = Number(snapshot.congested?.[tile]) > 0 && !(mode === "brt" && Number(snapshot.busLane?.[tile]) > 0);
        return 1 / (motion.speed * (jammed ? 0.45 : 1));
      });
      const free = path.map(() => 1 / motion.speed);
      const accumulate = (samples) => {
        const at = [0];
        for (let i = 1; i < path.length; i += 1) at.push(at[i - 1] + (samples[i - 1] + samples[i]) / 2);
        return at;
      };
      const at = accumulate(crossing);
      const atFree = accumulate(free);
      const line = { id: `${mode}-${plan.id ?? lines.length + 1}`, kind: mode, path, loop, waypoints: [], stops: [], timeline: [], period: 0, name: plan.name || null, color: Number.isInteger(plan.color) ? plan.color : null, number: Number(plan.number) || 0, laidTick: Number.isInteger(plan.laidTick) ? plan.laidTick : null, freeAt: atFree };
      // A BRT on an avenue runs in the median's busway, both ways.
      line.median = path.map((tile) => (mode === "brt" ? medianOf(snapshot, tile) : null));
      const stopList = Array.isArray(plan.stops) ? plan.stops : Array.isArray(plan.stations) ? plan.stations : [];
      stopList.forEach((item) => {
        const tile = Number.isInteger(item?.x) && Number.isInteger(item?.y) ? item.y * size + item.x : -1;
        const index = path.indexOf(tile);
        if (index < 0 || (loop && index === path.length - 1)) return;
        if (line.waypoints.some((point) => point.index === index)) return;
        const station = { id: `${line.id}:${item.x},${item.y}`, kind: mode, x: item.x, y: item.y, w: 1, h: 1, line: line.id, index, compass: compassOf(size, item.x + 0.5, item.y + 0.5), ordinal: 0, name: item.name || null };
        stations.push(station);
        line.waypoints.push({ index, station: station.id });
      });
      line.waypoints.sort((a, b) => a.index - b.index);
      if (!line.waypoints.length || line.waypoints[0].index !== 0) line.waypoints.unshift({ index: 0, station: null });
      if (line.waypoints[line.waypoints.length - 1].index !== path.length - 1) line.waypoints.push({ index: path.length - 1, station: null });
      line.stops = line.waypoints.map((point) => point.station).filter(Boolean);
      buildTimeline(line, (a, b) => Math.abs(at[b] - at[a]) * 1.12, motion.dwell);
      const period = line.period;
      const timeline = line.timeline.slice();
      line.timeline = [];
      buildTimeline(line, (a, b) => Math.abs(atFree[b] - atFree[a]) * 1.12, motion.dwell);
      line.periodFree = line.period;
      line.period = period;
      line.timeline = timeline;
      const headway = (Number(plan.headway) > 0 ? Number(plan.headway) : BUS_HEADWAY[mode]) * 60 / CITY_SECONDS;
      line.vehicles = Number(plan.vehicles) > 0 ? Math.round(plan.vehicles) : Math.max(1, Math.round(line.period / headway));
      const spacing = line.period / (line.vehicles || 1);
      line.offset = (hashLine(line.id) % 1000) / 1000 * spacing;
      lines.push(line);
    });
  }

  // Every bus on the street at time t: where it is, which way it faces (on
  // the right-hand side of its road), whether it stands at a stop.
  // On an avenue the bus keeps to the busway on its side of the median; at
  // the end of a line it turns back round the median's end, a half circle
  // to the left, over the turn's seconds.
  function buses(network, t) {
    const out = [];
    network.lines.forEach((line) => {
      if (line.kind !== "bus" && line.kind !== "brt") return;
      const shiftAt = (index, heading) => {
        const median = line.median?.[Math.max(0, Math.min(line.path.length - 1, index))];
        const right = median ? BUSWAY : BUS_LANE;
        return [(median ? median[0] : 0) - Math.sin(heading) * right, (median ? median[1] : 0) + Math.cos(heading) * right];
      };
      for (let vehicle = 0; vehicle < (line.vehicles || 1); vehicle += 1) {
        const at = trainAt(line, t, vehicle);
        const point = roundedPointAt(network, line, at.pos);
        let heading = at.dir > 0 ? point.heading : point.heading + Math.PI;
        let shift;
        if (at.turn !== undefined) {
          // Arrived the other way; leaves this way: swing round, turning left.
          heading = heading + Math.PI - Math.PI * at.turn;
          shift = shiftAt(Math.round(at.pos), heading);
        } else {
          const i = Math.floor(at.pos), f = at.pos - i;
          const a = shiftAt(i, heading), b = shiftAt(i + 1, heading);
          shift = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        out.push({
          line: line.id, kind: line.kind, vehicle, color: line.color,
          x: point.x + shift[0], z: point.z + shift[1],
          heading, standing: Boolean(at.station),
        });
      }
    });
    return out;
  }

  // Lines laid from a Rootline plan (the Basin canon's transitLines
  // sidecar, handed over with the city): each keeps its name, colour and
  // station order, and its path is the plan's own tile run.
  function sidecarLines(snapshot, transit, lines, stations) {
    const size = Number(snapshot.size) || 0;
    const used = new Set();
    (Array.isArray(transit?.lines) ? transit.lines : []).forEach((plan) => {
      if (plan?.mode === "bus" || plan?.mode === "brt") return;
      const tiles = Array.isArray(plan?.tiles) ? plan.tiles : [];
      const path = [];
      for (let i = 0; i + 1 < tiles.length; i += 2) {
        const x = tiles[i], y = tiles[i + 1];
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) continue;
        const tile = y * size + x;
        if (path[path.length - 1] !== tile) path.push(tile);
      }
      if (path.length < 3) return;
      const kind = layerAt(snapshot, "subway", path[0]) && !layerAt(snapshot, "rail", path[0]) ? "subway" : "rail";
      const line = { id: `plan-${plan.id ?? lines.length + 1}`, kind, path, waypoints: [], stops: [], timeline: [], period: 0, name: plan.name || null, color: Number.isInteger(plan.color) ? plan.color : null };
      const indexOf = (station) => {
        const w = FOOTPRINT[station.kind === "subway-station" ? "subway-station" : "station"];
        let best = -1, bestD = Infinity;
        path.forEach((tile, index) => {
          const tx = tile % size, ty = Math.floor(tile / size);
          const dx = Math.max(station.x - tx, 0, tx - (station.x + w - 1));
          const dy = Math.max(station.y - ty, 0, ty - (station.y + w - 1));
          const d = dx + dy;
          if (d < bestD) { bestD = d; best = index; }
        });
        return bestD <= 1 ? best : -1;
      };
      (Array.isArray(plan.stations) ? plan.stations : []).forEach((item) => {
        const index = indexOf(item);
        if (index < 0) return;
        const w = FOOTPRINT[item.kind === "subway-station" ? "subway-station" : "station"];
        const station = {
          id: `${kind}:${item.x},${item.y}`, kind, x: item.x, y: item.y, w, h: w, line: line.id, index,
          compass: compassOf(size, item.x + w / 2, item.y + w / 2), ordinal: 0, name: item.name || null,
        };
        if (line.waypoints.some((point) => point.index === index)) return;
        stations.push(station);
        line.stops.push(station.id);
        line.waypoints.push({ index, station: station.id });
      });
      line.waypoints.sort((a, b) => a.index - b.index);
      line.stops = line.waypoints.map((point) => point.station).filter(Boolean);
      if (!line.waypoints.length || line.waypoints[0].index !== 0) line.waypoints.unshift({ index: 0, station: null });
      if (line.waypoints[line.waypoints.length - 1].index !== path.length - 1) line.waypoints.push({ index: path.length - 1, station: null });
      buildTimeline(line);
      lines.push(line);
      path.forEach((tile) => used.add(tile));
    });
    return used;
  }

  function buildRailNetwork(snapshot, transit = null) {
    const size = Number(snapshot.size) || 0;
    const lines = [];
    const stations = [];
    const crossings = new Map();
    // Planned lines first; track they do not cover is the city's own
    // "existing line", derived below as before.
    const planned = sidecarLines(snapshot, transit, lines, stations);
    busLines(snapshot, transit, lines, stations);
    lines.forEach((line) => {
      if (line.kind !== "rail") return;
      line.path.forEach((tile, index) => {
        if (layerAt(snapshot, "road", tile) && !crossings.has(tile)) crossings.set(tile, { line: line.id, index });
      });
    });
    ["rail", "subway"].forEach((kind) => {
      const layer = kind;
      const { label, runs } = components(snapshot, layer);
      const found = (snapshot.facilities || [])
        .filter((facility) => STATION_KINDS[facility.kind] === kind)
        .map((facility) => {
          const w = Number(facility.w) || FOOTPRINT[facility.kind];
          const h = Number(facility.h) || FOOTPRINT[facility.kind];
          // Track inside the footprint or along its edge.
          const touch = [];
          for (let y = facility.y - 1; y <= facility.y + h; y += 1) {
            for (let x = facility.x - 1; x <= facility.x + w; x += 1) {
              const corner = (x === facility.x - 1 || x === facility.x + w) && (y === facility.y - 1 || y === facility.y + h);
              if (corner || x < 0 || y < 0 || x >= size || y >= size) continue;
              if (layerAt(snapshot, layer, y * size + x)) touch.push(y * size + x);
            }
          }
          return { kind, x: facility.x, y: facility.y, w, h, touch };
        })
        .filter((station) => station.touch.length)
        .sort((a, b) => a.y - b.y || a.x - b.x);

      runs.forEach((run, runIndex) => {
        if (run.some((tile) => planned.has(tile))) return;
        const here = found.filter((station) => label[station.touch[0]] === runIndex);
        let path, waypoints;
        if (!here.length) {
          // Track without a station (an imported real railway, say) still
          // has a train: end to end along its longest run, and back.
          if (kind !== "rail" || run.length < MIN_BARE_RUN) return;
          const fromAny = search(snapshot, layer, [run[0]]).distance;
          const a = run.reduce((best, tile) => (fromAny[tile] > fromAny[best] ? tile : best), run[0]);
          const fromA = search(snapshot, layer, [a]).distance;
          const b = run.reduce((best, tile) => (fromA[tile] > fromA[best] ? tile : best), a);
          path = walk(snapshot, layer, a, b);
          if (!path || path.length < MIN_BARE_RUN) return;
          waypoints = [{ index: 0, station: null }, { index: path.length - 1, station: null }];
        } else if (here.length === 1) {
          // One station: the train runs to the far end of the track and back.
          const from = here[0].touch[0];
          const { distance } = search(snapshot, layer, [from]);
          let far = from;
          run.forEach((tile) => { if (distance[tile] > distance[far]) far = tile; });
          path = walk(snapshot, layer, from, far);
          if (!path || path.length < 3) return;
          waypoints = [{ index: 0, station: here[0] }, { index: path.length - 1, station: null }];
        } else {
          // Several: start from the station furthest along the track from
          // the first, then visit the others in order of distance.
          const nearest = (station, distance) => station.touch.reduce((best, tile) => (distance[tile] >= 0 && (best < 0 || distance[tile] < distance[best]) ? tile : best), -1);
          const first = search(snapshot, layer, here[0].touch).distance;
          const end = here.reduce((best, station) => (first[nearest(station, first)] > first[nearest(best, first)] ? station : best), here[0]);
          const fromEnd = search(snapshot, layer, end.touch).distance;
          const ordered = here
            .map((station) => ({ station, tile: nearest(station, fromEnd) }))
            .sort((a, b) => fromEnd[a.tile] - fromEnd[b.tile] || a.station.y - b.station.y || a.station.x - b.station.x);
          path = [ordered[0].tile];
          waypoints = [{ index: 0, station: ordered[0].station }];
          for (let i = 1; i < ordered.length; i += 1) {
            const leg = walk(snapshot, layer, path[path.length - 1], ordered[i].tile);
            if (!leg) continue;
            path.push(...leg.slice(1));
            // Two stations on one tile of track share the stop.
            if (path.length - 1 === waypoints[waypoints.length - 1].index) continue;
            waypoints.push({ index: path.length - 1, station: ordered[i].station });
          }
          if (path.length < 3) return;
          if (waypoints.length === 1) waypoints.push({ index: path.length - 1, station: null });
        }
        const line = { id: `${kind}-${lines.length + 1}`, kind, path, waypoints: [], stops: [], timeline: [], period: 0 };
        waypoints.forEach((point) => {
          let stationId = null;
          if (point.station) {
            const station = {
              id: `${kind}:${point.station.x},${point.station.y}`,
              kind,
              x: point.station.x, y: point.station.y, w: point.station.w, h: point.station.h,
              line: line.id,
              index: point.index,
              compass: compassOf(size, point.station.x + point.station.w / 2, point.station.y + point.station.h / 2),
              ordinal: 0,
            };
            stations.push(station);
            stationId = station.id;
            line.stops.push(station.id);
          }
          line.waypoints.push({ index: point.index, station: stationId });
        });
        buildTimeline(line);
        lines.push(line);
        if (kind === "rail") {
          path.forEach((tile, index) => {
            if (layerAt(snapshot, "road", tile) && !crossings.has(tile)) crossings.set(tile, { line: line.id, index });
          });
        }
      });
    });
    // Two stations with the same direction and kind are numbered.
    const counts = new Map();
    stations.forEach((station) => counts.set(`${station.kind}:${station.compass}`, (counts.get(`${station.kind}:${station.compass}`) || 0) + 1));
    const seen = new Map();
    stations.forEach((station) => {
      const key = `${station.kind}:${station.compass}`;
      if (counts.get(key) < 2) return;
      seen.set(key, (seen.get(key) || 0) + 1);
      station.ordinal = seen.get(key);
    });
    return { size, lines, stations, crossings };
  }

  // One round trip as a list of segments: dwell, run, dwell, run ... back to
  // the first station. Out along the waypoints and back again.
  // A round trip as segments. A shuttle runs out along its waypoints and
  // back; a loop runs round once (its path ends where it starts) and goes
  // on. `run(a, b)` is the time between two path indices.
  function buildTimeline(line, run = (a, b) => Math.abs(b - a) / SPEED * EASE, dwellAt = DWELL) {
    const points = line.waypoints;
    const order = line.loop ? [...points.keys()]
      : points.length > 1 ? [...points.keys(), ...[...points.keys()].slice(1, -1).reverse()]
        : [0];
    let t = 0;
    order.forEach((point, n) => {
      const here = points[point];
      const next = points[order[(n + 1) % order.length]];
      // A loop's closing point is the start again: no stop, no run back.
      const closing = line.loop && n === order.length - 1;
      // A loop goes straight on past a waypoint that is no stop.
      const dwell = closing ? 0 : here.station ? dwellAt : line.loop ? 0 : TURN;
      if (dwell > 0) line.timeline.push({ t0: t, t1: t + dwell, from: here.index, to: here.index, station: here.station, toward: next.index > here.index || line.loop ? 1 : -1 });
      t += dwell;
      if (closing) return;
      const runTime = run(here.index, next.index);
      if (runTime > 0) {
        line.timeline.push({ t0: t, t1: t + runTime, from: here.index, to: next.index, station: null, toward: next.index > here.index ? 1 : -1 });
        t += runTime;
      }
    });
    line.period = t;
  }

  function segmentAt(line, t) {
    const local = ((t % line.period) + line.period) % line.period;
    for (const segment of line.timeline) {
      if (local < segment.t1) return { segment, local };
    }
    return { segment: line.timeline[line.timeline.length - 1], local };
  }

  // Where the train on `line` is at time `t`: a position along the path
  // (fractional tile index), which way it is going, and the station it is
  // standing at, if any.
  function trainAt(line, t, vehicle = 0) {
    const { segment, local } = segmentAt(line, t + (line.offset || 0) + vehicle * line.period / (line.vehicles || 1));
    if (segment.from === segment.to) {
      const at = { line: line.id, pos: segment.from, dir: segment.toward, station: segment.station };
      // At either end of a shuttle it turns back: how far round. Without a
      // station the whole wait is the turn; at a terminal station it stands
      // facing the way it came, then swings round before it leaves.
      const end = segment.from === 0 || segment.from === line.path.length - 1;
      if (end && !line.loop && line.timeline.length > 1) {
        const u = Math.max(0, Math.min(1, (local - segment.t0) / (segment.t1 - segment.t0)));
        at.turn = segment.station ? Math.max(0, Math.min(1, (u - 0.55) / 0.45)) : u;
      }
      return at;
    }
    const u = (local - segment.t0) / (segment.t1 - segment.t0);
    const eased = u * u * (3 - 2 * u);
    return { line: line.id, pos: segment.from + (segment.to - segment.from) * eased, dir: segment.toward, station: null };
  }

  function trains(network, t) {
    return network.lines.map((line) => trainAt(line, t));
  }

  // A point along a line's path: tile centres joined by straight runs.
  function pointAt(network, line, pos) {
    const size = network.size;
    const last = line.path.length - 1;
    const p = Math.max(0, Math.min(last, pos));
    const i = Math.min(last - 1, Math.floor(p));
    const f = p - i;
    const a = line.path[i], b = line.path[i + 1];
    const ax = (a % size) + 0.5, az = Math.floor(a / size) + 0.5;
    const bx = (b % size) + 0.5, bz = Math.floor(b / size) + 0.5;
    return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, heading: Math.atan2(bz - az, bx - ax) };
  }

  // A point along a bus's path with its corners rounded: within half a tile
  // of a turn the bus follows a curve from the middle of one leg to the
  // middle of the next, so its heading (and the lane beside its path) turns
  // smoothly instead of snapping round at the corner tile's centre.
  function roundedPointAt(network, line, pos) {
    const size = network.size;
    const last = line.path.length - 1;
    const p = Math.max(0, Math.min(last, pos));
    const k = Math.round(p);
    const centre = (i) => [(line.path[i] % size) + 0.5, Math.floor(line.path[i] / size) + 0.5];
    const wraps = line.loop && (k === 0 || k === last);
    if (!wraps && (k <= 0 || k >= last)) return pointAt(network, line, pos);
    const a = centre(wraps ? last - 1 : k - 1), v = centre(k), b = centre(wraps ? 1 : k + 1);
    if (b[0] - v[0] === v[0] - a[0] && b[1] - v[1] === v[1] - a[1]) return pointAt(network, line, pos);
    const m1 = [(a[0] + v[0]) / 2, (a[1] + v[1]) / 2];
    const m2 = [(v[0] + b[0]) / 2, (v[1] + b[1]) / 2];
    const t = wraps && k === 0 ? p + 0.5 : p - k + 0.5;
    const u = 1 - t;
    return {
      x: u * u * m1[0] + 2 * u * t * v[0] + t * t * m2[0],
      z: u * u * m1[1] + 2 * u * t * v[1] + t * t * m2[1],
      heading: Math.atan2(2 * u * (v[1] - m1[1]) + 2 * t * (m2[1] - v[1]), 2 * u * (v[0] - m1[0]) + 2 * t * (m2[0] - v[0])),
    };
  }

  // The cars of every train: a locomotive at the front and a coach behind,
  // both facing the way the train is going.
  function trainCars(network, t) {
    const out = [];
    network.lines.forEach((line) => {
      if (line.kind === "bus" || line.kind === "brt") return;
      const train = trainAt(line, t);
      [0, 1].forEach((car) => {
        const point = pointAt(network, line, train.pos - train.dir * car * CAR_SPACING);
        out.push({
          line: line.id, kind: line.kind, car,
          frame: `agent.train.${car + 1}`,
          x: point.x, z: point.z,
          heading: train.dir > 0 ? point.heading : point.heading + Math.PI,
        });
      });
    });
    return out;
  }

  function crossingClosed(network, tile, t) {
    const crossing = network.crossings.get(tile);
    if (!crossing) return false;
    const line = network.lines.find((candidate) => candidate.id === crossing.line);
    return Boolean(line) && Math.abs(trainAt(line, t).pos - crossing.index) < CROSSING_REACH;
  }

  // The station whose footprint is within `reach` tiles of (x, z).
  function stationNear(network, x, z, reach = 1.6) {
    let best = null, bestD = Infinity;
    network.stations.forEach((station) => {
      const dx = Math.max(station.x - x, 0, x - (station.x + station.w));
      const dz = Math.max(station.y - z, 0, z - (station.y + station.h));
      const d = Math.hypot(dx, dz);
      if (d <= reach && d < bestD) { best = station; bestD = d; }
    });
    return best;
  }

  // --- the timetable -------------------------------------------------------------------------

  // Every station stop of a line's train from one round trip before `t` to a
  // few after, in time order.
  function stopsAround(line, t, vehicle = 0) {
    const out = [];
    // Vehicle k runs the same timetable k/vehicles of a round trip ahead.
    const shift = (line.offset || 0) + vehicle * line.period / (line.vehicles || 1);
    const first = Math.floor((t + shift) / line.period) - 1;
    for (let cycle = first; cycle <= first + 3; cycle += 1) {
      line.timeline.forEach((segment) => {
        if (segment.from === segment.to && segment.station) {
          out.push({ station: segment.station, arrive: cycle * line.period + segment.t0 - shift, depart: cycle * line.period + segment.t1 - shift });
        }
      });
    }
    return out;
  }

  // Board at `fromId` no earlier than `t`, ride to `toId`: when the train
  // leaves, when it gets there, the wait and the ride. Null when the two are
  // not stations on one line.
  function rideTimes(network, fromId, toId, t) {
    const from = network.stations.find((station) => station.id === fromId);
    const to = network.stations.find((station) => station.id === toId);
    if (!from || !to || from === to || from.line !== to.line) return null;
    const line = network.lines.find((candidate) => candidate.id === from.line);
    // Whichever vehicle gets there first.
    let best = null;
    for (let vehicle = 0; vehicle < (line.vehicles || 1); vehicle += 1) {
      const stops = stopsAround(line, t, vehicle);
      const board = stops.findIndex((stop) => stop.station === fromId && stop.depart >= t);
      if (board < 0) continue;
      const alight = stops.findIndex((stop, i) => i > board && stop.station === toId);
      if (alight < 0) continue;
      const depart = stops[board].depart, arrive = stops[alight].arrive;
      if (!best || arrive < best.arrive) best = { depart, arrive, wait: depart - t, ride: arrive - depart };
    }
    return best;
  }

  function nextDeparture(network, stationId, t) {
    const station = network.stations.find((candidate) => candidate.id === stationId);
    if (!station) return null;
    const line = network.lines.find((candidate) => candidate.id === station.line);
    let soonest = null;
    for (let vehicle = 0; vehicle < (line.vehicles || 1); vehicle += 1) {
      const stop = stopsAround(line, t, vehicle).find((candidate) => candidate.station === stationId && candidate.depart >= t);
      if (stop && (soonest === null || stop.depart < soonest)) soonest = stop.depart;
    }
    return soonest;
  }

  // The other stations on a station's line, in line order, with their times.
  function destinations(network, stationId, t) {
    const station = network.stations.find((candidate) => candidate.id === stationId);
    if (!station) return [];
    const line = network.lines.find((candidate) => candidate.id === station.line);
    return line.stops
      .filter((id) => id !== stationId)
      .map((id) => ({ station: network.stations.find((candidate) => candidate.id === id), times: rideTimes(network, stationId, id, t) }))
      .filter((entry) => entry.times);
  }

  global.AISystem6JoyrideRail = Object.freeze({
    SPEED, DWELL, CROSSING_REACH,
    buildRailNetwork, trainAt, trains, trainCars, pointAt, crossingClosed, stationNear,
    rideTimes, nextDeparture, destinations, buses, busMotion,
  });
})(window);
