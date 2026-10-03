// Rootline / 根线 — a Bonsai City pot, read as a transit map.
//
// One pure converter: a v2 hand-over from Bonsai City (app/core/pot-world.js
// handoff.fromCity) in, a city description out, which Rootline keeps in
// `game.city`. The description is plain JSON (never a typed array), so the
// game's hash and its replay cover it, and it changes nothing in the city:
// this file only reads the snapshot it is handed.
//
// What it reads, and what each thing becomes (Basin plan, lane L3):
//   - the square pot, placed in Rootline's 1600x1000 plane as an 880x880
//     square at the centre (the cell is rounded to eighths, so every corner
//     and centre is an exact binary fraction and the water test below never
//     meets a rounding tie it did not expect);
//   - water tiles, traced into one polygon per body of water (outer ring plus
//     islands), which the core counts tunnels against;
//   - the rail and subway already laid, straightened into grey octilinear
//     "existing lines";
//   - station sites: the city's own stations first, then the clusters of
//     residents and jobs, then its schools, hospitals, stadiums, airport and
//     port, each on a tile where a subway station could stand (dry, empty,
//     beside a road) and named the way the world's gazetteer names stations;
//   - the road graph and the avenues (two-tile, centre-running BRT corridors)
//     the bus and the BRT follow, the traffic a bus crawls through, and the
//     bus depots.
//
// introOf(payload, desc) gives the opening transition the same facts, in a
// shape for drawing (typed arrays are fine there: it is never stored).
(function installRootlinePot(root) {
  "use strict";

  const World = root.AISystem6PotWorld;
  if (!World) throw new Error("rootline-pot needs app/core/pot-world.js loaded first");

  const VERSION = 1;
  const PLANE = Object.freeze({ width: 1600, height: 1000, side: 880 });
  // Rootline's station spacing (rootline-core.js RULES.stationSpacing; the
  // contract holds the two equal). Sites keep it between themselves, so a site
  // is always placeable when its turn comes.
  const SPACING = 86;
  const MAX_SITES = 64;
  const EVERYDAY = Object.freeze(["residential", "commercial", "industrial"]);
  // Bonsai City: BUILDING_STATE ACTIVE, DECLINING, RECOVERING hold people;
  // ZONE 1 R, 2 C, 3 I, 5 airport, 6 seaport. A road counts as jammed at
  // CONGESTION_THRESHOLD (80) trips; these are its 0-3 bands.
  const OCCUPIED = new Set([3, 4, 6]);
  const JAM_BANDS = Object.freeze([28, 56]);
  const STEPS = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0]]);
  const LEFT_OF = Object.freeze({ 1: 8, 2: 1, 4: 2, 8: 4 });
  const BACK = Object.freeze({ 1: 4, 2: 8, 4: 1, 8: 2 });
  const DIR_STEP = Object.freeze({ 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] });

  const isInt = Number.isInteger;
  const at = (layer, i) => (layer ? Number(layer[i]) || 0 : 0);

  // ----- the frame: tiles to plane ------------------------------------------------

  function frameOf(size) {
    const cell = Math.floor((PLANE.side / size) * 8) / 8;
    const side = cell * size;
    return { size, cell, bounds: { x: (PLANE.width - side) / 2, y: (PLANE.height - side) / 2, w: side, h: side } };
  }

  const planeX = (frame, tx) => frame.bounds.x + (tx + 0.5) * frame.cell;
  const planeY = (frame, ty) => frame.bounds.y + (ty + 0.5) * frame.cell;
  const cornerX = (frame, cx) => frame.bounds.x + cx * frame.cell;
  const cornerY = (frame, cy) => frame.bounds.y + cy * frame.cell;

  // ----- water: one polygon per body --------------------------------------------------
  //
  // Bodies are 4-connected. Each boundary edge runs clockwise round its tile
  // (water on the right, y down); rings are traced edge by edge, turning
  // right first where two bodies of water meet at a corner, so every ring is
  // simple. Collinear corners are dropped. The pot's edge closes a body that
  // reaches it.

  function waterBodies(snapshot, frame) {
    const size = frame.size;
    const count = size * size;
    const label = new Int32Array(count).fill(-1);
    const bodies = [];
    for (let i = 0; i < count; i += 1) {
      if (label[i] >= 0 || !at(snapshot.water, i)) continue;
      const id = bodies.length;
      const tiles = [i];
      label[i] = id;
      for (let k = 0; k < tiles.length; k += 1) {
        const x = tiles[k] % size;
        const y = (tiles[k] - x) / size;
        for (const [dx, dy] of STEPS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const j = ny * size + nx;
          if (label[j] < 0 && at(snapshot.water, j)) {
            label[j] = id;
            tiles.push(j);
          }
        }
      }
      bodies.push(tiles);
    }
    return bodies.map((tiles, id) => ({ tiles: tiles.length, rings: traceRings(tiles, id, label, frame) }));
  }

  function traceRings(tiles, id, label, frame) {
    const size = frame.size;
    const side = size + 1;
    const inBody = (x, y) => x >= 0 && y >= 0 && x < size && y < size && label[y * size + x] === id;
    // Edge directions: 0 east, 1 south, 2 west, 3 north.
    const edges = [];
    const outgoing = new Map();
    const add = (cx, cy, dir) => {
      const [dx, dy] = STEPS[(dir + 1) % 4];
      const edge = { from: cy * side + cx, to: (cy + dy) * side + (cx + dx), dir, used: false };
      edges.push(edge);
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from).push(edge);
    };
    const sorted = [...tiles].sort((a, b) => a - b);
    for (const i of sorted) {
      const x = i % size;
      const y = (i - x) / size;
      if (!inBody(x, y - 1)) add(x, y, 0);
      if (!inBody(x + 1, y)) add(x + 1, y, 1);
      if (!inBody(x, y + 1)) add(x + 1, y + 1, 2);
      if (!inBody(x - 1, y)) add(x, y + 1, 3);
    }
    const rings = [];
    for (const first of edges) {
      if (first.used) continue;
      const corners = [];
      let edge = first;
      while (edge && !edge.used) {
        edge.used = true;
        corners.push(edge.from);
        const choices = (outgoing.get(edge.to) || []).filter((next) => !next.used);
        let next = null;
        for (const turn of [1, 0, 3]) {
          next = choices.find((candidate) => candidate.dir === (edge.dir + turn) % 4) || null;
          if (next) break;
        }
        edge = next;
      }
      // Keep only the corners where the boundary turns.
      const n = corners.length;
      const ring = [];
      for (let k = 0; k < n; k += 1) {
        const prev = corners[(k - 1 + n) % n];
        const here = corners[k];
        const next = corners[(k + 1) % n];
        const ax = (here % side) - (prev % side);
        const ay = Math.floor(here / side) - Math.floor(prev / side);
        const bx = (next % side) - (here % side);
        const by = Math.floor(next / side) - Math.floor(here / side);
        if (ax * by - ay * bx === 0 && ax * bx + ay * by > 0) continue;
        ring.push(cornerX(frame, here % side), cornerY(frame, Math.floor(here / side)));
      }
      if (ring.length >= 6) rings.push(ring);
    }
    return rings;
  }

  // ----- existing lines: rail and subway, straightened --------------------------------

  function chainsOf(mask, size) {
    const on = (x, y) => x >= 0 && y >= 0 && x < size && y < size && mask[y * size + x] === 1;
    const degree = (i) => {
      const x = i % size;
      const y = (i - x) / size;
      let d = 0;
      for (const [dx, dy] of STEPS) if (on(x + dx, y + dy)) d += 1;
      return d;
    };
    const neighbours = (i) => {
      const x = i % size;
      const y = (i - x) / size;
      const out = [];
      for (const [dx, dy] of STEPS) if (on(x + dx, y + dy)) out.push((y + dy) * size + x + dx);
      return out;
    };
    const seen = new Set();
    const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const chains = [];
    const walk = (start, next) => {
      const chain = [start, next];
      seen.add(key(start, next));
      let prev = start;
      let here = next;
      while (degree(here) === 2 && here !== start) {
        const onward = neighbours(here).find((n) => n !== prev && !seen.has(key(here, n)));
        if (onward === undefined) break;
        seen.add(key(here, onward));
        chain.push(onward);
        prev = here;
        here = onward;
      }
      return chain;
    };
    const count = size * size;
    for (let i = 0; i < count; i += 1) {
      if (mask[i] !== 1 || degree(i) === 2) continue;
      for (const n of neighbours(i)) if (!seen.has(key(i, n))) chains.push(walk(i, n));
    }
    // Loops with no end or junction.
    for (let i = 0; i < count; i += 1) {
      if (mask[i] !== 1) continue;
      for (const n of neighbours(i)) if (!seen.has(key(i, n))) chains.push(walk(i, n));
    }
    return chains;
  }

  // Douglas-Peucker on tile centres, then every run drawn the transit-map way:
  // one 45-degree run and one straight run.
  function simplify(points, epsilon) {
    if (points.length <= 2) return points.slice();
    const [a, b] = [points[0], points[points.length - 1]];
    let worst = -1;
    let index = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      const p = points[i];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len = Math.hypot(vx, vy);
      const d = len ? Math.abs(vx * (a.y - p.y) - vy * (a.x - p.x)) / len : Math.hypot(p.x - a.x, p.y - a.y);
      if (d > worst) { worst = d; index = i; }
    }
    if (worst <= epsilon) return [a, b];
    return [...simplify(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplify(points.slice(index), epsilon)];
  }

  function octilinear(points) {
    const out = [points[0]];
    for (let i = 1; i < points.length; i += 1) {
      const p = out[out.length - 1];
      const q = points[i];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.min(Math.abs(dx), Math.abs(dy));
      const bend = { x: p.x + Math.sign(dx) * d, y: p.y + Math.sign(dy) * d };
      if (Math.hypot(bend.x - p.x, bend.y - p.y) > 1e-9 && Math.hypot(q.x - bend.x, q.y - bend.y) > 1e-9) out.push(bend);
      out.push(q);
    }
    return out;
  }

  function existingLines(snapshot, frame) {
    const size = frame.size;
    const out = [];
    for (const kind of ["rail", "subway"]) {
      const layer = snapshot[kind];
      if (!layer) continue;
      const mask = new Uint8Array(size * size);
      let any = false;
      for (let i = 0; i < size * size; i += 1) if (at(layer, i)) { mask[i] = 1; any = true; }
      if (!any) continue;
      for (const chain of chainsOf(mask, size)) {
        if (chain.length < 2) continue;
        const raw = chain.map((i) => ({ x: planeX(frame, i % size), y: planeY(frame, Math.floor(i / size)) }));
        const straight = octilinear(simplify(raw, frame.cell * 1.2));
        out.push({ kind, raw, points: straight });
      }
    }
    return out;
  }

  // ----- sites ------------------------------------------------------------------------

  // Where a subway station could stand (bonsai-city-sim.js place-facility):
  // dry, no facility, zone, road, rail or park on it, a road beside it.
  function standable(snapshot, size) {
    const out = new Uint8Array(size * size);
    const road = (x, y) => x >= 0 && y >= 0 && x < size && y < size && at(snapshot.road, y * size + x) > 0;
    // facilityAt, plantAt and serviceAt hold an index, -1 where empty.
    const taken = (layer, i) => Boolean(layer) && Number(layer[i]) >= 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = y * size + x;
        if (at(snapshot.water, i) || at(snapshot.zone, i) || at(snapshot.road, i) || at(snapshot.rail, i) || at(snapshot.park, i) || at(snapshot.highway, i)) continue;
        if (taken(snapshot.facilityAt, i) || taken(snapshot.plantAt, i) || taken(snapshot.serviceAt, i)) continue;
        if (road(x, y - 1) || road(x + 1, y) || road(x, y + 1) || road(x - 1, y)) out[i] = 1;
      }
    }
    return out;
  }

  function weightsOf(snapshot) {
    const buildings = Array.isArray(snapshot.buildings) ? snapshot.buildings : [];
    const out = [];
    for (const b of buildings) {
      if (!b || !OCCUPIED.has(b.state) || !isInt(b.x) || !isInt(b.y)) continue;
      const kind = World.landUse.kindOfZone(b.zone);
      if (!EVERYDAY.includes(kind)) continue;
      const weight = kind === "residential" ? Number(b.population) || 0 : Number(b.jobs) || 0;
      if (weight <= 0) continue;
      const w = b.w || 1;
      const h = b.h || 1;
      out.push({ x: b.x + (w - 1) / 2, y: b.y + (h - 1) / 2, kind, weight });
    }
    return out;
  }

  // What a place mostly is: the kind of which it holds the largest share of
  // the city's total (residents for homes, jobs for shops and works), so a
  // block with a third of the city's shops is a shop stop even when more
  // people sleep there than work there.
  function totalsOf(weights) {
    const totals = { residential: 0, commercial: 0, industrial: 0 };
    for (const p of weights) totals[p.kind] += p.weight;
    return totals;
  }

  function kindByShare(sum, totals) {
    let best = null;
    let bestShare = 0;
    for (const kind of EVERYDAY) {
      const share = totals[kind] > 0 ? sum[kind] / totals[kind] : 0;
      if (share > bestShare) { best = kind; bestShare = share; }
    }
    return best;
  }

  function dominant(weights, totals, x, y, radius) {
    const sum = { residential: 0, commercial: 0, industrial: 0 };
    for (const p of weights) if (Math.hypot(p.x - x, p.y - y) <= radius) sum[p.kind] += p.weight;
    return kindByShare(sum, totals);
  }

  function stopTiles(snapshot, size, avenue, tiles) {
    let stop = null;
    let brt = null;
    for (const [x, y] of tiles) {
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const i = ny * size + nx;
        if (!stop && at(snapshot.road, i)) stop = [nx, ny];
        if (!brt && avenue[i]) brt = [nx, ny];
      }
    }
    return { stop, brt };
  }

  function footprintTiles(item) {
    const w = item.footprint?.w || item.w || (item.kind === "station" ? 2 : 1);
    const h = item.footprint?.h || item.h || (item.kind === "station" ? 2 : 1);
    const out = [];
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) out.push([item.x + dx, item.y + dy]);
    return out;
  }

  // The avenue layer as the street reads it (joyride-core avenueLayer): a half
  // counts only when its partner, on the driver's left, answers it.
  function avenueOf(snapshot, size) {
    const out = new Uint8Array(size * size);
    const source = snapshot.avenue;
    if (!source) return out;
    for (let i = 0; i < size * size; i += 1) {
      const dir = at(source, i);
      if (!LEFT_OF[dir] || !at(snapshot.road, i)) continue;
      const [dx, dy] = DIR_STEP[LEFT_OF[dir]];
      const x = (i % size) + dx;
      const y = Math.floor(i / size) + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const j = y * size + x;
      if (!at(snapshot.road, j) || at(source, j) !== BACK[dir]) continue;
      out[i] = dir;
    }
    return out;
  }

  function sitesOf(snapshot, frame, avenue) {
    const size = frame.size;
    const can = standable(snapshot, size);
    const weights = weightsOf(snapshot);
    const totals = totalsOf(weights);
    const facilities = Array.isArray(snapshot.facilities) ? snapshot.facilities : [];
    const reach = Math.max(3, Math.ceil(SPACING / frame.cell));
    const chosen = [];
    const spaced = (tx, ty) => chosen.every((s) => Math.hypot(planeX(frame, tx) - s.x, planeY(frame, ty) - s.y) >= SPACING);
    const nearestStandable = (cx, cy, radius, inside = null) => {
      let best = null;
      const x0 = Math.max(0, Math.floor(cx - radius));
      const x1 = Math.min(size - 1, Math.ceil(cx + radius));
      const y0 = Math.max(0, Math.floor(cy - radius));
      const y1 = Math.min(size - 1, Math.ceil(cy + radius));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (!can[y * size + x] || (inside && !inside(x, y))) continue;
          const d = (x - cx) ** 2 + (y - cy) ** 2;
          if (d > radius * radius) continue;
          if (best && d >= best.d) continue;
          if (!spaced(x, y)) continue;
          best = { x, y, d };
        }
      }
      return best;
    };
    const push = (tx, ty, kind, extra) => {
      const site = { x: planeX(frame, tx), y: planeY(frame, ty), tx, ty, kind, ...extra };
      chosen.push(site);
      return site;
    };

    // 1. The city's own stations, oldest first.
    const builtTick = (item) => (typeof item.builtTick === "number" && !Number.isNaN(item.builtTick) ? item.builtTick : 0);
    const stations = facilities
      .filter((item) => (item.kind === "station" || item.kind === "subway-station") && isInt(item.x) && isInt(item.y))
      .slice()
      .sort((a, b) => builtTick(a) - builtTick(b) || a.y - b.y || a.x - b.x);
    for (const item of stations) {
      if (chosen.length >= MAX_SITES || !spaced(item.x, item.y)) continue;
      const tiles = footprintTiles(item);
      const kind = dominant(weights, totals, item.x, item.y, reach) || "residential";
      push(item.x, item.y, kind, { existing: item.kind, facility: { kind: item.kind, x: item.x, y: item.y, builtTick: builtTick(item) }, ...stopTiles(snapshot, size, avenue, tiles) });
    }

    // 2. Where people live and work: a grid of cells a station apart, biggest
    // first, each settling on the standable tile nearest its centre of weight.
    const cells = new Map();
    for (const p of weights) {
      const key = `${Math.floor(p.y / reach)}:${Math.floor(p.x / reach)}`;
      if (!cells.has(key)) cells.set(key, { gx: Math.floor(p.x / reach), gy: Math.floor(p.y / reach), weight: 0, sx: 0, sy: 0, by: { residential: 0, commercial: 0, industrial: 0 } });
      const cell = cells.get(key);
      cell.weight += p.weight;
      cell.sx += p.x * p.weight;
      cell.sy += p.y * p.weight;
      cell.by[p.kind] += p.weight;
    }
    // Ranked by the share of the city each cell holds, homes and jobs alike.
    for (const cell of cells.values()) {
      cell.score = EVERYDAY.reduce((sum, kind) => sum + (totals[kind] > 0 ? cell.by[kind] / totals[kind] : 0), 0);
    }
    const ranked = [...cells.values()].sort((a, b) => b.score - a.score || a.gy - b.gy || a.gx - b.gx);
    const floor = ranked.length ? ranked[0].score * 0.03 : 0;
    const clusters = [];
    for (const cell of ranked) {
      if (chosen.length >= MAX_SITES || cell.score < floor) break;
      const spot = nearestStandable(cell.sx / cell.weight, cell.sy / cell.weight, reach);
      if (!spot) continue;
      const kind = kindByShare(cell.by, totals) || "residential";
      clusters.push(push(spot.x, spot.y, kind, stopTiles(snapshot, size, avenue, [[spot.x, spot.y]])));
    }

    // 3. Landmarks: the real schools, hospitals and stadiums, and the airport
    // and port zones, each on a standable tile within a few tiles of it.
    const landmarks = [];
    const landmarkFacilities = facilities
      .filter((item) => World.landUse.kindOfFacility(item.kind) && isInt(item.x) && isInt(item.y))
      .slice()
      .sort((a, b) => builtTick(a) - builtTick(b) || a.y - b.y || a.x - b.x);
    for (const item of landmarkFacilities) {
      if (chosen.length >= MAX_SITES) break;
      const tiles = footprintTiles(item);
      const x0 = item.x;
      const y0 = item.y;
      const x1 = tiles[tiles.length - 1][0];
      const y1 = tiles[tiles.length - 1][1];
      const near = (x, y) => Math.max(x0 - x, x - x1, y0 - y, y - y1, 0) <= 3;
      const spot = nearestStandable((x0 + x1) / 2, (y0 + y1) / 2, 3 + Math.max(x1 - x0, y1 - y0), near);
      if (spot) landmarks.push(push(spot.x, spot.y, World.landUse.kindOfFacility(item.kind), stopTiles(snapshot, size, avenue, [[spot.x, spot.y]])));
    }
    for (const zone of [5, 6]) {
      const kind = World.landUse.kindOfZone(zone);
      const seen = new Uint8Array(size * size);
      for (let i = 0; i < size * size && chosen.length < MAX_SITES; i += 1) {
        if (seen[i] || at(snapshot.zone, i) !== zone) continue;
        const tiles = [i];
        seen[i] = 1;
        let x0 = size;
        let y0 = size;
        let x1 = -1;
        let y1 = -1;
        for (let k = 0; k < tiles.length; k += 1) {
          const x = tiles[k] % size;
          const y = (tiles[k] - x) / size;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          for (const [dx, dy] of STEPS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const j = ny * size + nx;
            if (!seen[j] && at(snapshot.zone, j) === zone) { seen[j] = 1; tiles.push(j); }
          }
        }
        const near = (x, y) => Math.max(x0 - x, x - x1, y0 - y, y - y1, 0) <= 3;
        const spot = nearestStandable((x0 + x1) / 2, (y0 + y1) / 2, 3 + Math.max(x1 - x0, y1 - y0), near);
        if (spot) landmarks.push(push(spot.x, spot.y, kind, stopTiles(snapshot, size, avenue, [[spot.x, spot.y]])));
      }
    }

    const existing = chosen.filter((site) => site.existing);
    return [...existing, ...clusters, ...landmarks];
  }

  // ----- names --------------------------------------------------------------------------
  //
  // A city station keeps the gazetteer's name for it. A planned site is named
  // as the gazetteer names a subway station built there after everything
  // standing, the sites built in their listed order (so no two share a name).

  function plannedFacilities(snapshot, sites) {
    const tick = isInt(snapshot.tick) ? snapshot.tick : 0;
    return sites.filter((site) => !site.existing).map((site, k) => ({ kind: "subway-station", x: site.tx, y: site.ty, builtTick: tick + 1 + k }));
  }

  function nameSites(snapshot, sites) {
    const planned = plannedFacilities(snapshot, sites);
    const gazetteer = World.gazetteer({ ...snapshot, facilities: [...(Array.isArray(snapshot.facilities) ? snapshot.facilities : []), ...planned] });
    let k = 0;
    for (const site of sites) {
      const query = site.existing ? site.facility : planned[k++];
      site.name = gazetteer.stationName(query) || { zh: "", en: "" };
    }
  }

  function potName(payload) {
    const seed = payload.ref?.seed;
    const named = isInt(seed) ? World.names.city(World.hash32(String(seed))) : null;
    const text = typeof payload.name === "string" ? payload.name.trim() : "";
    if (named && (!text || text === named.zh || text === named.en)) return named;
    if (text) return { zh: text, en: text };
    return named || { zh: "", en: "" };
  }

  // ----- the converter ---------------------------------------------------------------------

  function fromHandoff(payload) {
    if (!payload || payload.v !== 2 || !payload.snapshot) throw new Error("rootline-pot-payload");
    const snapshot = payload.snapshot;
    const size = snapshot.size;
    if (!isInt(size) || size <= 0) throw new Error("rootline-pot-size");
    const frame = frameOf(size);
    const avenue = avenueOf(snapshot, size);
    const sites = sitesOf(snapshot, frame, avenue);
    nameSites(snapshot, sites);
    // The first station of each everyday kind opens the game; the rest come
    // in turn, as Rootline's clock brings them.
    const start = [];
    for (const kind of EVERYDAY) {
      const index = sites.findIndex((site, i) => site.kind === kind && !start.includes(i));
      if (index >= 0) start.push(index);
    }
    for (let i = 0; start.length < 3 && i < sites.length; i += 1) if (!start.includes(i)) start.push(i);
    start.sort((a, b) => a - b);

    const roads = [];
    const jam = [];
    const avenues = [];
    for (let i = 0; i < size * size; i += 1) {
      if (!at(snapshot.road, i)) continue;
      roads.push(i);
      const level = at(snapshot.congested, i) ? 3 : at(snapshot.traffic, i) > JAM_BANDS[1] ? 2 : at(snapshot.traffic, i) > JAM_BANDS[0] ? 1 : 0;
      if (level) jam.push(i, level);
      if (avenue[i]) avenues.push(i, avenue[i]);
    }
    const depots = (Array.isArray(snapshot.facilities) ? snapshot.facilities : [])
      .filter((item) => item.kind === "bus" && isInt(item.x) && isInt(item.y))
      .map((item) => ({ tx: item.x, ty: item.y, x: planeX(frame, item.x), y: planeY(frame, item.y) }));
    const center = Number.isFinite(snapshot.spawnCenter?.x) && Number.isFinite(snapshot.spawnCenter?.y)
      ? { x: planeX(frame, Math.round(snapshot.spawnCenter.x)), y: planeY(frame, Math.round(snapshot.spawnCenter.y)) }
      : { x: PLANE.width / 2, y: PLANE.height / 2 };
    const ref = payload.ref || {};
    const cityId = typeof ref.cityId === "string" && ref.cityId ? ref.cityId : null;
    const seed = isInt(ref.seed) ? ref.seed : isInt(snapshot.seed) ? snapshot.seed : null;
    return {
      kind: "pot",
      potVersion: VERSION,
      key: cityId ? `pot:${cityId}` : `pot-seed:${seed ?? 0}`,
      source: { cityId, seed, size, tick: isInt(snapshot.tick) ? snapshot.tick : 0, from: ref.source || "save" },
      name: potName(payload),
      year: isInt(payload.date?.year) ? payload.date.year : null,
      width: PLANE.width,
      height: PLANE.height,
      center,
      size,
      cell: frame.cell,
      bounds: frame.bounds,
      water: waterBodies(snapshot, frame),
      existing: existingLines(snapshot, frame).map(({ kind, points }) => ({ kind, points: points.flatMap((p) => [p.x, p.y]) })),
      sites: sites.map((site) => ({
        x: site.x, y: site.y, tx: site.tx, ty: site.ty, kind: site.kind, name: site.name,
        existing: site.existing || null, stop: site.stop || null, brt: site.brt || null,
      })),
      start,
      roads,
      avenue: avenues,
      jam,
      depots,
    };
  }

  // ----- the opening transition's facts -------------------------------------------------
  //
  // Every zone tile at its place in the plane and the site it settles into;
  // each existing line as its tile path and its straightened path, resampled
  // to the same number of points so one can become the other; every water
  // tile. Drawn by rootline-view.js; nothing here is kept.

  function resample(points, count) {
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    const total = lengths[lengths.length - 1] || 1;
    const out = new Float32Array(count * 2);
    let j = 1;
    for (let k = 0; k < count; k += 1) {
      const target = (total * k) / (count - 1);
      while (j < points.length - 1 && lengths[j] < target) j += 1;
      const span = lengths[j] - lengths[j - 1] || 1;
      const t = Math.max(0, Math.min(1, (target - lengths[j - 1]) / span));
      out[k * 2] = points[j - 1].x + (points[j].x - points[j - 1].x) * t;
      out[k * 2 + 1] = points[j - 1].y + (points[j].y - points[j - 1].y) * t;
    }
    return out;
  }

  const ZONE_KIND_INDEX = Object.freeze({ 1: 0, 2: 1, 3: 2, 5: 3, 6: 4 });

  function introOf(payload, desc) {
    const snapshot = payload.snapshot;
    const size = desc.size;
    const frame = { size, cell: desc.cell, bounds: desc.bounds };
    const sites = desc.sites;
    const zone = [];
    for (let i = 0; i < size * size; i += 1) {
      const k = ZONE_KIND_INDEX[at(snapshot.zone, i)];
      if (k !== undefined) zone.push(i, k);
    }
    const n = zone.length / 2;
    const visible = desc.start.filter((s) => sites[s]);
    const tiles = { count: n, kind: new Uint8Array(n), x: new Float32Array(n), y: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), target: new Int16Array(n), delay: new Float32Array(n) };
    let far = 1;
    for (let k = 0; k < n; k += 1) {
      const i = zone[k * 2];
      const x = planeX(frame, i % size);
      const y = planeY(frame, Math.floor(i / size));
      // Only the stations open at the start are on the map when the motion
      // ends, so a tile settles into the nearest of those; the centre is the
      // fallback if somehow none is.
      let best = -1;
      let bestD = Infinity;
      for (const s of visible) {
        const d = (sites[s].x - x) ** 2 + (sites[s].y - y) ** 2;
        if (d < bestD) { bestD = d; best = s; }
      }
      tiles.kind[k] = zone[k * 2 + 1];
      tiles.x[k] = x;
      tiles.y[k] = y;
      tiles.target[k] = best;
      tiles.tx[k] = best >= 0 ? sites[best].x : desc.center.x;
      tiles.ty[k] = best >= 0 ? sites[best].y : desc.center.y;
      const d = Math.hypot(x - desc.center.x, y - desc.center.y);
      tiles.delay[k] = d;
      far = Math.max(far, d);
    }
    // The centre moves first and the edge follows: a ripple, not a cut.
    for (let k = 0; k < n; k += 1) tiles.delay[k] /= far;
    const lines = existingLines(snapshot, frame).map(({ kind, raw, points }) => {
      const count = Math.max(8, Math.min(160, raw.length * 2));
      return { kind, from: resample(raw, count), to: resample(points, count) };
    });
    const water = [];
    for (let i = 0; i < size * size; i += 1) if (at(snapshot.water, i)) water.push(planeX(frame, i % size), planeY(frame, Math.floor(i / size)));
    return { cell: desc.cell, bounds: desc.bounds, center: desc.center, tiles, lines, water: Float32Array.from(water), start: desc.start.slice() };
  }

  root.AISystem6RootlinePot = Object.freeze({ VERSION, PLANE, SPACING, frameOf, fromHandoff, introOf, plannedFacilities });
})(typeof window !== "undefined" ? window : globalThis);
