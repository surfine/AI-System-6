// Basin flip-the-pot / 翻盆 — the mayor's bill for a Rootline plan.
//
// Rootline draws a plan and saves it; this module turns that plan into what
// the mayor sees: an itemized quote (what every leg and every station costs,
// what the line adds to the monthly books) and, for the items the city can
// actually take, the list of what cannot be laid and why. On confirmation it
// returns the exact commands to submit and the sidecar to record, so the money
// the bill names is the money the commands take.
//
// Pure by construction: it reads a city state and a plan, and returns data.
// It never submits a command, never writes storage, never touches the DOM,
// and never reads a clock. The shell does the submitting and the recording.
// The plan's shape is the shared contract in `pot-world` (`plans.validate`);
// the sidecar's shape is the one `pot-world`'s `lines.check` reads back.
window.AISystem6BasinFlipPotLoaded = true;

(function installBasinFlipPot(root) {
  "use strict";

  const MODE_RULES = Object.freeze({
    // track: the network a leg lays, or null when the line lays nothing (a
    // bus runs on streets that are already there).
    metro: Object.freeze({ track: "subway", stopKind: "subway-station", upkeepDivisor: 60, upkeepKey: "subway" }),
    brt: Object.freeze({ track: "avenue", stopKind: "bus-stop", upkeepDivisor: 300, upkeepKey: "roads" }),
    bus: Object.freeze({ track: null, stopKind: "bus-stop", upkeepDivisor: 0, upkeepKey: "roads" }),
  });
  const DEFAULT_MODE = "metro";
  const STATION_SEARCH_RADIUS = 6;
  const DEPOT_KIND = "bus";
  const DEPOT_REACH = 8;

  const modeOf = (line) => (MODE_RULES[line?.mode] ? line.mode : DEFAULT_MODE);
  const isPair = (value) => value && typeof value === "object" && typeof value.zh === "string" && typeof value.en === "string";

  // A leg's tiles are an ordered path; the sim's build-path takes the corners
  // of an orthogonal polyline and restores the path from them (Basin §五).
  function pointsOf(tiles) {
    const points = [];
    for (let i = 0; i + 1 < (tiles || []).length; i += 2) points.push({ x: tiles[i], y: tiles[i + 1] });
    return points;
  }

  // One straight run: every tile shares a row or a column. A corner inside a
  // single leg is a bend — the avenue command only lays first-point to last.
  function legIsStraight(points) {
    if (points.length < 2) return false;
    return points.every((point) => point.x === points[0].x) || points.every((point) => point.y === points[0].y);
  }

  // The leg already sits on avenue halves whose axis matches each step.
  // East/west halves are 2 and 8; north/south are 1 and 4.
  function avenueCovers(state, points) {
    const avenue = state?.avenue;
    const size = state?.size | 0;
    if (!avenue || points.length < 2) return false;
    const onAxis = (x, y, horizontal) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return false;
      const dir = avenue[y * size + x] | 0;
      return horizontal ? dir === 2 || dir === 8 : dir === 1 || dir === 4;
    };
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      const horizontal = from.y === to.y;
      const vertical = from.x === to.x;
      if (!horizontal && !vertical) return false;
      const stepX = Math.sign(to.x - from.x);
      const stepY = Math.sign(to.y - from.y);
      let x = from.x;
      let y = from.y;
      for (;;) {
        if (!onAxis(x, y, horizontal)) return false;
        if (x === to.x && y === to.y) break;
        x += stepX;
        y += stepY;
      }
    }
    return true;
  }

  // Rubber-tyre sidecars store the legs in driving order. A joint tile that
  // ends one leg and starts the next is kept once. Metro keeps its footprint.
  function drivingTiles(line) {
    const tiles = [];
    const push = (x, y) => {
      if (tiles.length >= 2 && tiles[tiles.length - 2] === x && tiles[tiles.length - 1] === y) return;
      tiles.push(x, y);
    };
    for (const leg of line?.legs || []) {
      for (const point of pointsOf(leg?.tiles)) push(point.x, point.y);
    }
    return tiles;
  }

  function cornersOf(tiles) {
    const points = pointsOf(tiles);
    if (points.length < 2) return points;
    const out = [points[0]];
    for (let i = 1; i + 1 < points.length; i += 1) {
      const before = points[i - 1];
      const here = points[i];
      const after = points[i + 1];
      const straight = (before.x === here.x && here.x === after.x) || (before.y === here.y && here.y === after.y);
      if (!straight) out.push(here);
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function command(sim, state, type, payload) {
    const prepared = { schemaVersion: sim.COMMAND_SCHEMA_VERSION || 2, type, payload, targetTick: state.tick, clientCommandId: "" };
    return prepared;
  }

  // A station stands beside the track the same plan lays, so the bill has to be
  // worked out in the order the mayor's confirmation will run: every leg
  // first, then the stations that lean on it. The quote therefore runs on a
  // scratch copy of the city that takes each accepted command as it is priced,
  // which is also why the money the bill names is exactly the money the real
  // submission takes.
  function scratch(sim, state) {
    if (typeof sim.serialize !== "function" || typeof sim.deserialize !== "function") return state;
    try {
      return sim.deserialize(sim.serialize(state));
    } catch {
      return state;
    }
  }

  // Price one command against the working city; when the city takes it, it is
  // applied to the working city so the next item sees it.
  function price(sim, working, prepared) {
    const receipt = preview(sim, working, prepared);
    if (receipt && receipt.accepted && typeof sim.submitCommand === "function" && working !== null) {
      const applied = sim.submitCommand(working, prepared);
      if (!applied || !applied.accepted) return applied || receipt;
      return applied;
    }
    return receipt;
  }

  // The sim's own preview is the price: whatever the city would charge for the
  // command is what the bill shows and what submitting it will deduct.
  function preview(sim, state, prepared) {
    if (typeof sim.previewCommand !== "function") return null;
    const receipt = sim.previewCommand(state, prepared);
    return receipt && typeof receipt === "object" ? receipt : null;
  }

  function stationTiles(sim, working, kind, x, y) {
    const state = working;
    const tries = [{ x, y }];
    for (let radius = 1; radius <= STATION_SEARCH_RADIUS; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          tries.push({ x: x + dx, y: y + dy });
        }
      }
    }
    for (const tile of tries) {
      if (tile.x < 0 || tile.y < 0 || tile.x >= state.size || tile.y >= state.size) continue;
      const prepared = command(sim, state, "place-facility", { kind, x: tile.x, y: tile.y });
      const receipt = price(sim, working, prepared);
      if (receipt && receipt.accepted) return { tile, prepared, receipt };
    }
    const fallback = price(sim, working, command(sim, state, "place-facility", { kind, x, y }));
    return { tile: null, prepared: null, receipt: fallback };
  }

  function facilityUpkeep(sim, kind) {
    const spec = sim.FACILITY_KINDS?.[kind];
    return spec && Number.isFinite(spec.upkeep) ? spec.upkeep : 0;
  }

  function coveredByDepot(snapshot, tiles) {
    const facilities = Array.isArray(snapshot?.facilities) ? snapshot.facilities : [];
    const depots = facilities.filter((item) => item.kind === DEPOT_KIND);
    if (!depots.length) return false;
    for (let i = 0; i + 1 < tiles.length; i += 2) {
      const x = tiles[i];
      const y = tiles[i + 1];
      for (const depot of depots) {
        if (Math.max(Math.abs((depot.x ?? 0) - x), Math.abs((depot.y ?? 0) - y)) <= DEPOT_REACH) return true;
      }
    }
    return false;
  }

  // One line's bill. `existing` stops cost nothing: the city already stands
  // behind them. Anything the sim refuses is listed with the sim's own code so
  // the shell can word the reason without inventing one.
  function quoteLine(sim, working, state, snapshot, plan, line, options) {
    const mode = modeOf(line);
    const rules = MODE_RULES[mode];
    const items = [];
    const blocked = [];
    let cost = 0;
    let upkeep = 0;
    let blocking = false;

    if (rules.track) {
      line.legs.forEach((leg, index) => {
        const points = pointsOf(leg?.tiles || []);
        if (points.length < 2) {
          blocked.push({ lineId: line.id, x: null, y: null, code: "leg" });
          blocking = true;
          return;
        }
        const straight = legIsStraight(points);
        const covered = mode === "brt" && avenueCovers(working, points);
        // A bent BRT leg would be rebuilt as a straight run from its ends.
        // An avenue that is already there can keep the bend; anything else stops.
        if (mode === "brt" && !straight && !covered) {
          blocked.push({ lineId: line.id, x: points[0].x, y: points[0].y, code: "bend", leg: index });
          blocking = true;
          return;
        }
        if (covered) {
          items.push({ kind: "track", leg: index, tiles: 0, cost: 0, existing: true, command: null });
          return;
        }
        const prepared = command(sim, state, "build-path", { network: rules.track, points: cornersOf(leg?.tiles || []) });
        const receipt = price(sim, working, prepared);
        if (!receipt || !receipt.accepted) {
          if (mode === "brt" && receipt?.code === "empty" && avenueCovers(working, points)) {
            items.push({ kind: "track", leg: index, tiles: 0, cost: 0, existing: true, command: null });
            return;
          }
          blocked.push({ lineId: line.id, x: points[0].x, y: points[0].y, code: receipt?.code || "path", leg: index });
          blocking = true;
          return;
        }
        items.push({ kind: "track", leg: index, tiles: receipt.footprint.tiles.length, cost: receipt.cost, command: prepared, receipt });
        cost += receipt.cost;
      });
      if (rules.upkeepDivisor > 0) {
        const trackTiles = items.reduce((sum, item) => sum + item.tiles, 0);
        const funding = state.funding?.[rules.upkeepKey] ?? 100;
        upkeep += Math.floor(trackTiles * funding / rules.upkeepDivisor);
      }
    }

    // Stations. A metro station is a fact the city builds; a bus or BRT stop is
    // a sign on a street tile that is already there, so it costs nothing and
    // places nothing.
    const stops = Array.isArray(line.stops) ? line.stops : [];
    const planned = (plan.stations || []).filter((station) => stops.includes(station.id));
    planned.forEach((station) => {
      if (rules.stopKind === "bus-stop") {
        items.push({ kind: "stop", stationId: station.id, x: station.x, y: station.y, tiles: 1, cost: 0 });
        return;
      }
      if (station.existing) {
        items.push({ kind: "station", stationId: station.id, x: station.x, y: station.y, tiles: 1, cost: 0, existing: true });
        return;
      }
      const found = stationTiles(sim, working, rules.stopKind, station.x, station.y);
      if (!found.tile) {
        blocked.push({ lineId: line.id, x: station.x, y: station.y, code: found.receipt?.code || "station" });
        blocking = true;
        return;
      }
      items.push({ kind: "station", stationId: station.id, x: found.tile.x, y: found.tile.y, tiles: 1, cost: found.receipt.cost, command: found.prepared, receipt: found.receipt });
      cost += found.receipt.cost;
      upkeep += Math.floor(facilityUpkeep(sim, rules.stopKind) * (state.funding?.subway ?? 100) / 100);
    });

    // A bus or BRT line needs a depot within reach of one of its tiles.
    let depot = null;
    if (mode !== "metro") {
      const tiles = (line.legs || []).flatMap((leg) => (Array.isArray(leg?.tiles) ? leg.tiles : []));
      if (!coveredByDepot(snapshot, tiles)) {
        if (options.depot === true) {
          const terminus = planned[planned.length - 1] || planned[0] || null;
          const found = stationTiles(sim, working, DEPOT_KIND, terminus?.x ?? tiles[0] ?? 0, terminus?.y ?? tiles[1] ?? 0);
          if (!found.tile) {
            blocked.push({ lineId: line.id, x: terminus?.x ?? null, y: terminus?.y ?? null, code: found.receipt?.code || "depot" });
            blocking = true;
          } else {
            depot = { kind: "depot", x: found.tile.x, y: found.tile.y, tiles: 1, cost: found.receipt.cost, command: found.prepared, receipt: found.receipt };
            items.push(depot);
            cost += found.receipt.cost;
            upkeep += Math.floor(facilityUpkeep(sim, DEPOT_KIND) * (state.funding?.roads ?? 100) / 100);
          }
        } else {
          blocked.push({ lineId: line.id, x: tiles[0] ?? null, y: tiles[1] ?? null, code: "depot" });
          blocking = true;
        }
      }
    }

    if (mode !== "metro") {
      const sequence = drivingTiles(line);
      if (sequence.length > 4096 || sequence.some((value) => value > 511)) {
        blocked.push({ lineId: line.id, x: sequence[0] ?? null, y: sequence[1] ?? null, code: "length" });
        blocking = true;
      }
    }

    return { lineId: line.id, name: line.name, mode, color: line.color ?? null, number: line.number ?? null, vehicles: line.vehicles ?? null, items, cost, upkeep, blocked, blocking };
  }

  function planShapeOk(plan) {
    if (!plan || typeof plan !== "object") return "plan";
    if (plan.format !== "bonsai-transit-plan" || plan.formatVersion !== 1) return "format";
    if (!Array.isArray(plan.stations) || !Array.isArray(plan.lines) || plan.lines.length === 0) return "lines";
    for (const line of plan.lines) {
      if (!line || typeof line.id !== "string" || !isPair(line.name) || !Array.isArray(line.legs) || !Array.isArray(line.stops) || line.stops.length < 2) return `line:${line?.id ?? "?"}`;
    }
    return "";
  }

  // The whole bill. `options.depot` is the «build a bus depot beside the
  // terminus (250, from 1920)» checkbox the mayor can tick for a rubber-tyre
  // line that has no depot in reach.
  function quote(sim, state, plan, options = {}) {
    const bad = planShapeOk(plan);
    if (bad) return { ok: false, reason: bad, funds: state?.funds ?? 0, lines: [], total: 0, upkeep: 0, blocked: [{ lineId: null, x: null, y: null, code: bad }], affordable: false };
    const snapshot = sim.buildRenderSnapshot(state);
    // One working copy for the whole bill: line two sees the track line one
    // laid, exactly as the confirmation will run them.
    const working = options.working || scratch(sim, state);
    const lines = plan.lines.map((line) => quoteLine(sim, working, state, snapshot, plan, line, options));
    const total = lines.reduce((sum, line) => sum + line.cost, 0);
    const upkeep = lines.reduce((sum, line) => sum + line.upkeep, 0);
    const blocked = lines.flatMap((line) => line.blocked);
    const stale = typeof options.fingerprint === "string" && typeof plan.source?.fingerprint === "string"
      && options.fingerprint !== plan.source.fingerprint;
    return {
      ok: true,
      stale,
      funds: state.funds,
      total,
      upkeep,
      blocked,
      lines,
      affordable: state.funds >= total,
      deficit: Math.max(0, total - state.funds),
    };
  }

  // What the mayor confirms. Only a line whose every leg and station can go in
  // is laid and recorded, so the sidecar never claims more than the city holds.
  function lay(sim, state, plan, options = {}) {
    const bill = quote(sim, state, plan, options);
    if (!bill.ok) return { ...bill, commands: [], sidecar: null };
    const commands = [];
    const sidecarLines = [];
    let total = 0;
    for (const line of bill.lines) {
      if (line.blocking) continue;
      const planLine = plan.lines.find((item) => item.id === line.lineId);
      const stops = planLine?.stops || [];
      const stations = [];
      // Metro records the track it actually laid. A bus or BRT records the
      // legs in driving order, including a line that only stood signs.
      const tiles = line.mode === "metro" ? [] : drivingTiles(planLine);
      for (const item of line.items) {
        if (item.command) commands.push(item.command);
        total += item.cost;
        if (line.mode === "metro" && item.kind === "track") for (const tile of item.receipt.footprint.tiles) tiles.push(tile.x, tile.y);
        if (item.kind !== "station" && item.kind !== "stop") continue;
        if (item.kind === "stop" && !stops.includes(item.stationId)) continue;
        const station = plan.stations.find((entry) => entry.id === item.stationId);
        if (station) stations.push({ x: item.x, y: item.y, kind: item.kind === "stop" ? "bus-stop" : MODE_RULES[line.mode].stopKind, name: station.name });
      }
      const entry = {
        id: line.lineId,
        planId: plan.id ?? null,
        name: line.name,
        color: line.mode === "bus" ? null : (line.color ?? 0),
        tiles,
        stations,
        laidTick: state.tick,
      };
      if (line.mode !== DEFAULT_MODE) entry.mode = line.mode;
      if (line.mode === "bus" && Number.isInteger(line.number)) entry.number = line.number;
      if (Number.isInteger(line.vehicles)) entry.vehicles = line.vehicles;
      sidecarLines.push(entry);
    }
    return { ...bill, commands, total, sidecar: sidecarLines.length ? { version: 1, lines: sidecarLines } : null };
  }

  // The pieces a Rootline plan has to carry for the two functions above, so a
  // caller can refuse a plan early with a reason instead of an exception.
  const REQUIRED_PLAN_FIELDS = Object.freeze(["format", "formatVersion", "source", "stations", "lines"]);

  // ----- the planner's side: what Rootline hands the mayor --------------------
  //
  // Rootline draws on its own 1600x1000 table; the plan has to speak the city's
  // tiles, because that is the grid the mayor prices and builds on. The
  // conversion is the frame's own inverse — `rootline-pot` puts tile (tx, ty)
  // at `bounds + (t + 0.5) * cell`, so a point falls back into the tile that
  // contains it. A leg drawn at 45 degrees becomes a staircase, since the
  // city's networks are orthogonal.
  const clampTile = (value, size) => Math.min(Math.max(value, 0), size - 1);

  function tilesFromPlanePath(points, frame, size) {
    const tiles = [];
    const push = (x, y) => {
      if (tiles.length >= 2 && tiles[tiles.length - 2] === x && tiles[tiles.length - 1] === y) return;
      tiles.push(x, y);
    };
    const tileOf = (point) => ({
      x: clampTile(Math.floor((point.x - frame.bounds.x) / frame.cell), size),
      y: clampTile(Math.floor((point.y - frame.bounds.y) / frame.cell), size),
    });
    let previous = null;
    for (const point of points || []) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const tile = tileOf(point);
      if (!previous) {
        push(tile.x, tile.y);
        previous = tile;
        continue;
      }
      // Walk the whole way, one tile at a time: along x, then along y. A
      // straight segment therefore keeps every tile it crosses, and a 45-degree
      // one becomes the staircase the city's orthogonal networks can follow.
      let x = previous.x;
      let y = previous.y;
      while (x !== tile.x) {
        x += Math.sign(tile.x - x);
        push(x, y);
      }
      while (y !== tile.y) {
        y += Math.sign(tile.y - y);
        push(x, y);
      }
      previous = tile;
    }
    return tiles;
  }

  // A plan from what the planner actually drew. Only lines the city can be
  // told about are carried: a nursery (a city grown from a seed) has no pot to
  // give a plan back to.
  function planFrom({ pot, game, core, fingerprint, id }) {
    if (!pot || !game || !Array.isArray(game.lines) || !game.lines.length) return null;
    const size = Number.isFinite(pot.size) ? pot.size : 0;
    const frame = { size, cell: pot.cell, bounds: pot.bounds };
    if (!size || !frame.cell || !frame.bounds) return null;
    const sites = Array.isArray(game.city?.sites) ? game.city.sites : [];
    const stations = [];
    const byGameStation = new Map();
    const stationId = (station) => `s${station.id}`;
    const lines = [];
    for (const [index, record] of game.lines.entries()) {
      const mode = typeof core?.modeOfLine === "function" ? core.modeOfLine(record) : (record.mode || "metro");
      const kind = mode === "metro" ? "subway-station" : "bus-stop";
      const stops = record.loop ? [...record.stops, record.stops[0]] : [...record.stops];
      const stopIds = [];
      for (const stopId of stops) {
        const station = (game.stations || []).find((item) => item.id === stopId);
        const site = station && Number.isInteger(station.site) ? sites[station.site] : null;
        if (!site || !Number.isInteger(site.tx) || !Number.isInteger(site.ty)) return null;
        if (!byGameStation.has(stopId)) {
          const id2 = `s${stopId}`;
          byGameStation.set(stopId, id2);
          stations.push({
            id: id2,
            x: site.tx,
            y: site.ty,
            kind,
            name: { zh: site.name?.zh ?? "站", en: site.name?.en ?? "Station" },
            existing: Boolean(site.existing),
          });
        }
        stopIds.push(byGameStation.get(stopId));
      }
      const geometry = typeof core?.lineGeometry === "function" ? core.lineGeometry(game, record) : [];
      const legs = geometry.map((leg) => ({
        tiles: tilesFromPlanePath(leg.points, frame, size),
        water: [],
      }));
      if (legs.length !== stopIds.length - 1) return null;
      if (legs.some((leg) => leg.tiles.length < 4)) return null;
      const line = {
        id: `l${record.id}`,
        name: { zh: `${record.id + 1}号线`, en: `Line ${record.id + 1}` },
        color: mode === "bus" ? null : ((record.slot ?? index) % 7),
        stops: stopIds,
        legs,
      };
      if (mode !== DEFAULT_MODE) line.mode = mode;
      if (mode === "bus") line.number = Number.isInteger(record.number) ? record.number : 11;
      lines.push(line);
    }
    if (!lines.length) return null;
    return {
      id: id || null,
      format: "bonsai-transit-plan",
      formatVersion: 1,
      source: {
        cityId: pot.source?.cityId ?? null,
        seed: Number.isInteger(pot.source?.seed) ? pot.source.seed : 0,
        size,
        tick: Number.isInteger(game.tick) ? game.tick : 0,
        fingerprint: typeof fingerprint === "string" && fingerprint ? fingerprint : "unknown",
      },
      stations,
      lines,
    };
  }

  root.AISystem6BasinFlipPot = Object.freeze({
    VERSION: 1,
    MODE_RULES,
    REQUIRED_PLAN_FIELDS,
    cornersOf,
    tilesFromPlanePath,
    planFrom,
    quote,
    lay,
  });
})(typeof window !== "undefined" ? window : globalThis);
