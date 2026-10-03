// Joyride / 兜风 — buses on the street (J7, J8). Headless and pure.
//
// The timetable stays in joyride-rail.js. This file decides which of those
// buses are near enough to draw, what a stop sign says, when a signal lets a
// BRT through, and what a camera does. It does not keep a city.
(function installJoyrideBus(global) {
  "use strict";

  const METRE = 1 / 16;
  const KMH = METRE / 3.6;
  const CITY_SECONDS = 15;
  const APPROACH = 3;
  const PRIORITY = 4;
  const PHRASES = Object.freeze({
    zh: Object.freeze({
      ontime: (name) => `${name}准点`,
      late: (name, minutes) => `${name}晚 ${minutes} 分`,
      jam: (street) => `${street}拥堵`,
      opened: (name) => `本月通车：${name}`,
    }),
    en: Object.freeze({
      ontime: (name) => `${name} on time`,
      late: (name, minutes) => `${name} ${minutes} min late`,
      jam: (street) => `${street} jammed`,
      opened: (name) => `Opened this month: ${name}`,
    }),
  });

  function materialise(network, t, at, opts = {}) {
    const rail = global.AISystem6JoyrideRail;
    if (!rail || !network || !at) return [];
    const radius = Number(opts.radius) > 0 ? opts.radius : 22;
    const cap = Number(opts.cap) > 0 ? opts.cap : 12;
    return rail.buses(network, t)
      .map((bus) => ({ bus, d: Math.max(Math.abs(bus.x - at.x), Math.abs(bus.z - at.z)) }))
      .filter((item) => item.d <= radius)
      .sort((a, b) => a.d - b.d || String(a.bus.line).localeCompare(String(b.bus.line)) || a.bus.vehicle - b.bus.vehicle)
      .slice(0, cap)
      .map((item) => item.bus);
  }

  function stopBoard(network, stationId, t) {
    const rail = global.AISystem6JoyrideRail;
    const station = network?.stations?.find((item) => item.id === stationId);
    if (!rail || !station) return [];
    const lines = (network.lines || []).filter((line) => (line.kind === "bus" || line.kind === "brt") && line.stops?.includes(stationId));
    return lines.map((line) => {
      const here = rail.buses(network, t).some((bus) => bus.line === line.id && bus.standing
        && Math.abs(Math.floor(bus.x) - station.x) + Math.abs(Math.floor(bus.z) - station.y) <= 1);
      let wait = Infinity;
      rail.destinations(network, stationId, t).forEach((entry) => {
        if (entry.station?.line === line.id && entry.times && entry.times.wait < wait) wait = entry.times.wait;
      });
      const minutes = Number.isFinite(wait) ? Math.min(99, Math.max(1, Math.ceil(wait * CITY_SECONDS / 60))) : null;
      return { line: line.id, kind: line.kind, name: line.name || null, minutes: here ? null : minutes, arriving: here };
    });
  }

  function lightTimes(signals, tile, dir, seconds, amber = 3) {
    const signal = signals?.get?.(tile);
    if (!signal) return { state: "none", untilChange: Infinity };
    const northSouth = dir === 1 || dir === 4;
    const nsEnd = signal.nsGreen;
    const nsAmberEnd = nsEnd + amber;
    const ewEnd = nsAmberEnd + signal.ewGreen;
    const stateOf = (time) => {
      const u = ((time % signal.cycle) + signal.cycle) % signal.cycle;
      if (u < nsEnd) return northSouth ? "green" : "red";
      if (u < nsAmberEnd) return northSouth ? "amber" : "red";
      if (u < ewEnd) return northSouth ? "red" : "green";
      return northSouth ? "red" : "amber";
    };
    const t = (seconds + signal.offset) % signal.cycle;
    const state = stateOf(t);
    const bounds = [nsEnd, nsAmberEnd, ewEnd, signal.cycle];
    let until = 0;
    let cursor = t;
    for (let guard = 0; guard < 8; guard += 1) {
      const u = ((cursor % signal.cycle) + signal.cycle) % signal.cycle;
      let next = signal.cycle;
      for (const bound of bounds) if (u < bound - 1e-9) { next = bound; break; }
      const step = next - u || signal.cycle;
      until += step;
      cursor += step;
      if (stateOf(cursor) !== state) break;
    }
    return { state, untilChange: until };
  }

  function forwardOf(line, index, heading, size) {
    const here = line.path[index];
    const hx = Math.cos(heading);
    const hz = Math.sin(heading);
    const score = (j) => {
      if (j < 0 || j >= line.path.length) return -Infinity;
      const cell = line.path[j];
      return ((cell % size) - (here % size)) * hx + (Math.floor(cell / size) - Math.floor(here / size)) * hz;
    };
    return score(index + 1) >= score(index - 1) ? 1 : -1;
  }

  function brtApproaching(rail, buses, size, tile, dir) {
    for (const bus of buses || []) {
      if (bus.kind !== "brt") continue;
      const line = rail?.lines?.find((item) => item.id === bus.line);
      if (!line?.path?.length) continue;
      let index = 0;
      let best = Infinity;
      line.path.forEach((cell, at) => {
        const d = Math.hypot((cell % size) + 0.5 - bus.x, Math.floor(cell / size) + 0.5 - bus.z);
        if (d < best) { best = d; index = at; }
      });
      if (best > 1.2) continue;
      const step = forwardOf(line, index, bus.heading, size);
      for (let k = 1; k <= APPROACH; k += 1) {
        const j = index + step * k;
        if (j < 0 || j >= line.path.length || line.path[j] !== tile) continue;
        const prev = line.path[j - step];
        const dx = (tile % size) - (prev % size);
        const dy = Math.floor(tile / size) - Math.floor(prev / size);
        const travel = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : dy === -1 ? 1 : 0;
        if (travel === dir) return true;
      }
    }
    return false;
  }

  // `query` is { signals, tile, dir, seconds, amber, rail, buses, size, lightFor }.
  // With no BRT in range the result is lightFor's, one state at a time.
  function signalAt(query) {
    const base = query.lightFor
      ? { state: query.lightFor(query.signals, query.tile, query.dir, query.seconds), untilChange: lightTimes(query.signals, query.tile, query.dir, query.seconds, query.amber).untilChange }
      : lightTimes(query.signals, query.tile, query.dir, query.seconds, query.amber);
    if (base.state === "none") return "none";
    const dirs = [1, 4, 2, 8];
    let favored = 0;
    for (const dir of dirs) {
      if (!brtApproaching(query.rail, query.buses, query.size, query.tile, dir)) continue;
      const arm = lightTimes(query.signals, query.tile, dir, query.seconds, query.amber);
      const since = secondsSinceGreen(query.signals.get(query.tile), dir, query.seconds, query.amber || 3);
      const due = (arm.state === "red" || arm.state === "green") && arm.untilChange <= PRIORITY;
      const holding = since > 0 && since <= PRIORITY;
      if (due || holding) { favored = dir === 1 || dir === 4 ? 1 : 2; break; }
    }
    if (!favored) return query.lightFor ? query.lightFor(query.signals, query.tile, query.dir, query.seconds) : base.state;
    const northSouth = query.dir === 1 || query.dir === 4;
    return (favored === 1) === northSouth ? "green" : "red";
  }

  function secondsSinceGreen(signal, dir, seconds, amber) {
    if (!signal) return Infinity;
    const t = (seconds + signal.offset) % signal.cycle;
    const greenEnd = dir === 1 || dir === 4 ? signal.nsGreen : signal.nsGreen + amber + signal.ewGreen;
    let since = t - greenEnd;
    if (since < 0) since += signal.cycle;
    return since;
  }

  function cameraRule({ speed, seconds, inBusLane, junction, exempt }) {
    if (exempt || junction || !inBusLane) return null;
    if (!(Number(speed) > 10) || !(Number(seconds) >= 1.5)) return null;
    return { fine: 50 };
  }

  // One pole at each end of a straight bus-lane run.
  function cameraPoles(snapshot) {
    const lane = snapshot?.busLane;
    const size = snapshot?.size | 0;
    if (!lane || !size) return [];
    const poles = [];
    for (let i = 0; i < size * size; i += 1) {
      if (!lane[i]) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      let neighbors = 0;
      if (x > 0 && lane[i - 1]) neighbors += 1;
      if (x + 1 < size && lane[i + 1]) neighbors += 1;
      if (y > 0 && lane[i - size]) neighbors += 1;
      if (y + 1 < size && lane[i + size]) neighbors += 1;
      if (neighbors <= 1) poles.push({ x, y, tile: i });
    }
    return poles;
  }

  function lineName(line, language) {
    const name = line?.name;
    if (name && typeof name === "object") return name[language] || name.zh || name.en || line.id;
    return name || line?.id || "";
  }

  function trafficLine(network, snapshot, tick, language) {
    const lang = language === "zh" ? "zh" : "en";
    const phrase = PHRASES[lang];
    const lines = (network?.lines || []).filter((line) => line.kind === "bus" || line.kind === "brt");
    if (!lines.length) return "";
    const ranked = lines.slice().sort((a, b) => (a.kind === "brt" ? 0 : 1) - (b.kind === "brt" ? 0 : 1) || (a.number || 0) - (b.number || 0) || String(a.id).localeCompare(String(b.id)));
    const parts = [];
    ranked.slice(0, 3).forEach((line) => {
      const freePeriod = line.periodFree == null ? (line.period || 0) : line.periodFree;
      const late = Math.round(((line.period || 0) - freePeriod) * CITY_SECONDS / 60);
      const name = lineName(line, lang);
      parts.push(line.kind === "brt" || late < 1 ? phrase.ontime(name) : phrase.late(name, late));
    });
    const size = snapshot?.size | 0;
    let jam = -1;
    let flow = -1;
    if (size && snapshot.congested) {
      for (let i = 0; i < size * size; i += 1) {
        if (!snapshot.congested[i]) continue;
        const cars = Number(snapshot.traffic?.[i]) || 0;
        if (cars > flow) { flow = cars; jam = i; }
      }
    }
    if (jam >= 0) {
      const named = global.AISystem6PotWorld?.gazetteer?.(snapshot)?.streetAt?.(jam % size, Math.floor(jam / size));
      const street = named?.[lang] || named?.zh;
      if (street) parts.push(phrase.jam(street));
    }
    const day = global.AISystem6BonsaiSim?.TICKS_PER_DAY || 5;
    ranked.forEach((line) => {
      if (Number.isInteger(line.laidTick) && Number.isInteger(tick) && tick - line.laidTick <= 30 * day) parts.push(phrase.opened(lineName(line, lang)));
    });
    return parts.join(" · ");
  }

  function scheduleFor(line, stops, t0) {
    const motion = global.AISystem6JoyrideRail?.busMotion?.(line?.kind || "bus") || { dwell: line?.kind === "brt" ? 6 : 10 };
    const indexOf = (id) => line?.waypoints?.find((point) => point.station === id)?.index ?? 0;
    const out = [];
    let t = t0;
    (stops || []).forEach((id, i) => {
      if (i > 0) {
        const from = line.freeAt?.[indexOf(stops[i - 1])] || 0;
        const to = line.freeAt?.[indexOf(id)] || 0;
        t += motion.dwell + Math.abs(to - from) * 1.12;
      }
      out.push(t);
    });
    return out;
  }

  function settleBusJob(schedule, arrivals) {
    const times = Array.isArray(schedule) ? schedule : [];
    const seen = Array.isArray(arrivals) ? arrivals : [];
    let onTime = 0;
    const count = Math.min(times.length, seen.length);
    for (let i = 0; i < count; i += 1) if (Math.abs(seen[i] - times[i]) <= 30) onTime += 1;
    return { pay: 60 + onTime * 25, onTime };
  }

  global.AISystem6JoyrideBus = Object.freeze({
    materialise, stopBoard, lightTimes, signalAt, cameraRule, cameraPoles, trafficLine, scheduleFor, settleBusJob, PHRASES,
  });
})(typeof window !== "undefined" ? window : globalThis);
