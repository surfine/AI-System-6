// Bonsai City Micropolis exporter / 盆景城市 Micropolis 导出器.
// The outbound half of the two-way path: a v3 Bonsai payload becomes a
// Micropolis save in the shape the Micropolis shell stores (plain JSON
// numbers, the same field names the engine reads back). Bonsai summons
// Micropolis cities and can send a city back; both directions are lossy and
// report the loss, so every fact Bonsai holds that the classic model cannot
// take gets a warning code here, and the caller shows all of them.
//
// Clean-room: the classic tile ids, the shape-by-neighbour tables, and the
// flag bits are public format facts (data, not code). Each table below was
// confirmed by observing the vendored engine's own output in
// tests/features/bonsai-micropolis-roundtrip.test.mjs; no engine code,
// lookup table, or algorithm is consulted or copied. Headless and
// deterministic: no DOM, no timers, no wall clock (the caller passes
// `exportedAt`), no randomness.
window.AISystem6BonsaiMicropolisExportLoaded = true;

(function initBonsaiMicropolisExport() {
  "use strict";

  const CLASSIC_WIDTH = 120;
  const CLASSIC_HEIGHT = 100;
  const HISTORY_LENGTH = 120;

  // Tile flag bits: the high six bits of a raw tile value.
  const ZONEBIT = 0x0400;
  const ANIMBIT = 0x0800;
  const BULLBIT = 0x1000;
  const BURNBIT = 0x2000;
  const CONDBIT = 0x4000;
  const POWERBIT = 0x8000;

  // Neighbour mask bits: north 1, east 2, south 4, west 8.
  const N = 1; const E = 2; const S = 4; const W = 8;
  const HORIZONTAL = E | W;
  const VERTICAL = N | S;

  // Land road shape by neighbour mask. Rails and power lines use the same
  // shape order at a fixed offset from the road ids.
  const ROAD_BY_MASK = Object.freeze([66, 67, 66, 68, 67, 67, 69, 73, 66, 71, 66, 72, 70, 75, 74, 76]);
  const RAIL_OFFSET = 160;
  const WIRE_OFFSET = 144;
  // Shore and woods edge shapes by neighbour mask (mask of neighbours that
  // are the same material). A full neighbourhood is open water / deep woods.
  const WATER_EDGE_BY_MASK = Object.freeze({ 3: 15, 6: 19, 7: 17, 9: 11, 11: 13, 12: 7, 13: 9, 14: 5 });
  const TREE_EDGE_BY_MASK = Object.freeze({ 3: 26, 6: 28, 7: 27, 9: 24, 11: 25, 12: 22, 13: 23, 14: 21 });
  const RIVER = 2;
  const WOODS = 37;
  const RADIOACTIVE = 52;
  const FOUNTAIN = 840;
  const DIRT = 0;

  // Classic multi-tile buildings: family base id (top-left tile) and side.
  // The centre tile carries ZONEBIT; the rest of the family follows row by
  // row. Bonsai facility kinds that have a classic twin map here; the
  // classic footprint is at least as large as the Bonsai one, anchored at
  // the same top-left, which is also where the importer put it.
  const FACILITY_FAMILY = Object.freeze({
    coal: { base: 745, side: 4 },
    nuclear: { base: 811, side: 4 },
    fire: { base: 761, side: 3 },
    police: { base: 770, side: 3 },
    clinic: { base: 405, side: 3 },
  });
  const CATALOG_FAMILY = Object.freeze({
    stadium: { base: 779, side: 4 },
    church: { base: 414, side: 3 },
  });
  const ZONE_R = 1; const ZONE_C = 2; const ZONE_I = 3;
  const ZONE_MILITARY = 4; const ZONE_AIRPORT = 5; const ZONE_SEAPORT = 6;
  const PORT_FAMILY = { base: 693, side: 4 };
  const AIRPORT_FAMILY = { base: 709, side: 6 };

  // Every code this module can emit. The caller matches each one to copy in
  // both languages; the round-trip contract holds the emitted set inside
  // this list so a new code cannot reach the player as a raw key.
  const WARNING_CODES = Object.freeze([
    "map-cropped", "altitude-flattened", "zone-tiles-unblocked", "tiles-without-equivalent",
    "facilities-without-equivalent", "wires-dropped-at-crossings",
    "layer-dropped-pipe", "layer-dropped-subway", "layer-dropped-highway", "layer-dropped-onramp",
    "layer-dropped-tunnel", "layer-dropped-water-level",
    "records-dropped-bonds", "records-dropped-ordinances", "records-dropped-microsims", "records-dropped-things",
    "history-dropped", "progress-not-carried", "population-recomputed",
  ]);

  const isInt = Number.isInteger;
  function fail(code) { throw new Error(`bonsai-micropolis-export-invalid: ${code}`); }
  function facts() {
    const codec = window.AISystem6BonsaiMicropolisCodec;
    if (!codec) fail("codec-missing");
    return codec;
  }
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function looksLikeBonsaiPayload(payload) {
    return !!payload && payload.format === "bonsai-city" && (payload.version === 3 || payload.version === 4)
      && isInt(payload.size) && Array.isArray(payload.zone) && payload.zone.length === payload.size * payload.size;
  }

  // One axis of the crop: a map at least as wide as the classic one is
  // cropped around the spawn centre (or the caller's origin); a smaller one
  // embeds centred, and the apron becomes open water.
  function cropAxis(size, target, center, origin) {
    if (size >= target) {
      const wanted = isInt(origin) ? origin : center - Math.floor(target / 2);
      return { origin: clamp(wanted, 0, size - target), embed: 0, span: target };
    }
    return { origin: 0, embed: Math.floor((target - size) / 2), span: size };
  }

  function cropWindowFor(payload, options = {}) {
    if (!looksLikeBonsaiPayload(payload)) fail("payload-shape");
    const size = payload.size;
    const spawn = payload.spawnCenter && isInt(payload.spawnCenter.x) && isInt(payload.spawnCenter.y)
      ? payload.spawnCenter : { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    const wanted = options.window || {};
    const x = cropAxis(size, CLASSIC_WIDTH, spawn.x, wanted.x);
    const y = cropAxis(size, CLASSIC_HEIGHT, spawn.y, wanted.y);
    // `x,y,width,height` is the Bonsai rectangle that lands on the classic
    // map; `embedX,embedY` is where that rectangle sits inside the classic
    // 120x100 grid.
    return { x: x.origin, y: y.origin, width: x.span, height: y.span, embedX: x.embed, embedY: y.embed };
  }

  // The level (family index) a zone tile wants. The variant layer remembers
  // the exact family an imported block arrived with; when it does not agree
  // with the tile's stage and density, the block was rebuilt by the sim and
  // the smallest family that matches those two wins.
  function levelMatches(codec, zone, level, stage, density) {
    if (zone === ZONE_C) return codec.stageOfLevel(level % 10) === stage && codec.densityOfLevel(Math.floor(level / 2)) === density;
    return codec.stageOfLevel(level % 8) === stage && codec.densityOfLevel(level) === density;
  }
  function zoneLevel(codec, zone, stage, density, variant) {
    const T = codec.TILE_FACTS;
    const levels = zone === ZONE_R ? T.RES_GROWN_LEVELS : zone === ZONE_C ? T.COM_GROWN_LEVELS : T.IND_GROWN_LEVELS;
    const remembered = variant - 1;
    if (remembered >= 0 && remembered < levels && levelMatches(codec, zone, remembered, stage, density)) return remembered;
    for (let level = 0; level < levels; level += 1) if (levelMatches(codec, zone, level, stage, density)) return level;
    return 0;
  }

  function exportMicropolis(payload, options = {}) {
    const codec = facts();
    const T = codec.TILE_FACTS;
    const CATALOG = codec.CATALOG_FACTS;
    if (!looksLikeBonsaiPayload(payload)) fail("payload-shape");
    const size = payload.size;
    const count = size * size;
    const layerNames = ["water", "tree", "park", "road", "rail", "wire", "zone", "density", "stage", "variant", "catalogId",
      "pipe", "subway", "highway", "onramp", "tunnel", "waterLevel", "alt"];
    const L = {};
    for (const name of layerNames) {
      const raw = payload[name];
      if (!Array.isArray(raw) || raw.length !== count) fail(`layer ${name}`);
      L[name] = raw;
    }
    const powered = Array.isArray(options.powered) || ArrayBuffer.isView(options.powered) ? options.powered : null;
    const facilities = Array.isArray(payload.facilities) ? payload.facilities : [];

    const win = cropWindowFor(payload, options);
    const inWindow = (bx, by) => bx >= win.x && by >= win.y && bx < win.x + win.width && by < win.y + win.height;
    const bonsaiIndex = (bx, by) => by * size + bx;
    const classicX = (bx) => bx - win.x + win.embedX;
    const classicY = (by) => by - win.y + win.embedY;
    const classicIndex = (cx, cy) => cy * CLASSIC_WIDTH + cx;

    const map = new Array(CLASSIC_WIDTH * CLASSIC_HEIGHT).fill(DIRT);
    const claimed = new Uint8Array(CLASSIC_WIDTH * CLASSIC_HEIGHT);
    const counts = {
      cropped: 0, unblocked: 0, withoutEquivalent: 0, facilitiesWithout: 0, wiresDropped: 0,
      pipe: 0, subway: 0, highway: 0, onramp: 0, tunnel: 0, waterLevel: 0,
    };
    const facilityKinds = {};

    // --- what lies outside the window is lost, and counted -----------------
    const hasContent = (i) => !!(L.zone[i] || L.road[i] || L.rail[i] || L.wire[i] || L.tree[i] || L.park[i] || L.catalogId[i]);
    for (let by = 0; by < size; by += 1) for (let bx = 0; bx < size; bx += 1) {
      if (!inWindow(bx, by) && hasContent(bonsaiIndex(bx, by))) counts.cropped += 1;
    }

    // --- buildings first: a footprint owns its tiles -----------------------
    function writeFamily(family, bx, by) {
      const { base, side } = family;
      const tiles = [];
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
        const x = bx + dx; const y = by + dy;
        if (x >= size || y >= size || !inWindow(x, y)) return false;
        const ci = classicIndex(classicX(x), classicY(y));
        if (claimed[ci]) return false;
        tiles.push({ ci, id: base + dy * side + dx, center: dx === 1 && dy === 1 });
      }
      for (const tile of tiles) {
        map[tile.ci] = tile.id | BURNBIT | CONDBIT | (tile.center ? ZONEBIT : 0);
        claimed[tile.ci] = 1;
      }
      return true;
    }
    for (const facility of facilities) {
      if (!facility || !isInt(facility.x) || !isInt(facility.y)) continue;
      const family = FACILITY_FAMILY[facility.kind];
      if (!family) {
        counts.facilitiesWithout += 1;
        facilityKinds[facility.kind] = (facilityKinds[facility.kind] || 0) + 1;
        continue;
      }
      if (!inWindow(facility.x, facility.y)) { counts.cropped += 1; continue; }
      if (!writeFamily(family, facility.x, facility.y)) counts.withoutEquivalent += family.side * family.side;
    }

    // Catalog buildings and the SC2K-style port and airport zones are
    // blocks of tiles; a block is claimed from its top-left, so a scan in
    // row order rebuilds the same blocks the importer laid down.
    function blockIsUniform(bx, by, side, test) {
      if (bx + side > size || by + side > size) return false;
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
        const x = bx + dx; const y = by + dy;
        if (!inWindow(x, y) || !test(bonsaiIndex(x, y))) return false;
        if (claimed[classicIndex(classicX(x), classicY(y))]) return false;
      }
      return true;
    }
    const zoneDone = new Uint8Array(count);
    function claimBlocks(test, family) {
      for (let by = win.y; by < win.y + win.height; by += 1) for (let bx = win.x; bx < win.x + win.width; bx += 1) {
        const i = bonsaiIndex(bx, by);
        if (zoneDone[i] || !test(i)) continue;
        if (!blockIsUniform(bx, by, family.side, test)) continue;
        writeFamily(family, bx, by);
        for (let dy = 0; dy < family.side; dy += 1) for (let dx = 0; dx < family.side; dx += 1) zoneDone[bonsaiIndex(bx + dx, by + dy)] = 1;
      }
    }
    claimBlocks((i) => L.catalogId[i] === CATALOG.STADIUM, CATALOG_FAMILY.stadium);
    claimBlocks((i) => L.catalogId[i] === CATALOG.CHURCH, CATALOG_FAMILY.church);
    claimBlocks((i) => L.zone[i] === ZONE_SEAPORT, PORT_FAMILY);
    claimBlocks((i) => L.zone[i] === ZONE_AIRPORT, AIRPORT_FAMILY);

    // --- growable zones: nine-tile blocks ---------------------------------
    function writeZoneBlock(zone, bx, by) {
      const centerIndex = bonsaiIndex(bx + 1, by + 1);
      const stage = L.stage[centerIndex];
      const density = L.density[centerIndex];
      const emptyBase = zone === ZONE_R ? T.RES_LOW : zone === ZONE_C ? T.COM_LOW : T.IND_LOW;
      const grownBase = zone === ZONE_R ? T.RES_GROWN_LOW : zone === ZONE_C ? T.COM_GROWN_LOW : T.IND_GROWN_LOW;
      const grown = stage >= 1;
      const level = grown ? zoneLevel(codec, zone, stage, density, L.variant[centerIndex]) : 0;
      const base = grown ? grownBase + level * 9 : emptyBase;
      for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) {
        const i = bonsaiIndex(bx + dx, by + dy);
        const ci = classicIndex(classicX(bx + dx), classicY(by + dy));
        let id = base + dy * 3 + dx;
        // A low residential block keeps its single houses on the outer
        // tiles; the house index rides the variant layer when it was
        // imported, else the variant picks one of the twelve.
        if (zone === ZONE_R && !grown && !(dx === 1 && dy === 1) && L.stage[i] >= 1) {
          const houses = T.HOUSE_HIGH - T.HOUSE_LOW + 1;
          const remembered = L.variant[i] - 1;
          id = T.HOUSE_LOW + (remembered >= 0 && remembered < houses ? remembered : (L.variant[i] | 0) % houses);
        }
        // A zone the classic scan has touched carries the bulldoze bit as
        // well as burn and conduct; a played city is the reference here.
        map[ci] = id | BULLBIT | BURNBIT | CONDBIT | (dx === 1 && dy === 1 ? ZONEBIT : 0);
        claimed[ci] = 1;
        zoneDone[i] = 1;
      }
    }
    for (let by = win.y; by < win.y + win.height; by += 1) for (let bx = win.x; bx < win.x + win.width; bx += 1) {
      const i = bonsaiIndex(bx, by);
      const zone = L.zone[i];
      if (zoneDone[i] || (zone !== ZONE_R && zone !== ZONE_C && zone !== ZONE_I)) continue;
      if (blockIsUniform(bx, by, 3, (j) => L.zone[j] === zone && !zoneDone[j])) writeZoneBlock(zone, bx, by);
    }

    // --- networks, then ground -------------------------------------------
    // Off the window a network stops; open water continues past the edge,
    // so a shoreline never forms along the map border.
    const layerAt = (layer, bx, by, beyond) => (bx >= 0 && by >= 0 && bx < size && by < size && inWindow(bx, by) ? !!layer[bonsaiIndex(bx, by)] : beyond);
    const maskOf = (layer, bx, by, beyond = false) => (layerAt(layer, bx, by - 1, beyond) ? N : 0) | (layerAt(layer, bx + 1, by, beyond) ? E : 0)
      | (layerAt(layer, bx, by + 1, beyond) ? S : 0) | (layerAt(layer, bx - 1, by, beyond) ? W : 0);
    const isHorizontal = (mask) => (mask & HORIZONTAL) !== 0 && (mask & VERTICAL) === 0;
    const isVertical = (mask) => (mask & VERTICAL) !== 0 && (mask & HORIZONTAL) === 0;

    for (let by = win.y; by < win.y + win.height; by += 1) for (let bx = win.x; bx < win.x + win.width; bx += 1) {
      const i = bonsaiIndex(bx, by);
      const ci = classicIndex(classicX(bx), classicY(by));
      if (L.pipe[i]) counts.pipe += 1;
      if (L.subway[i]) counts.subway += 1;
      if (L.highway[i]) counts.highway += 1;
      if (L.onramp[i]) counts.onramp += 1;
      if (L.tunnel[i]) counts.tunnel += 1;
      if (L.waterLevel[i]) counts.waterLevel += 1;
      const road = !!L.road[i]; const rail = !!L.rail[i]; const wire = !!L.wire[i];
      const water = !!L.water[i];
      if (claimed[ci]) {
        if (road || rail || wire) counts.withoutEquivalent += 1;
        continue;
      }
      let value = null;
      if (road || rail || wire) {
        const roadMask = road ? maskOf(L.road, bx, by) : 0;
        const railMask = rail ? maskOf(L.rail, bx, by) : 0;
        const wireMask = wire ? maskOf(L.wire, bx, by) : 0;
        if (road && rail) {
          // Rail over road: id 237 is a horizontal rail across a vertical
          // road, 238 the other way round. The road decides when both agree.
          value = (isVertical(roadMask) || (!isHorizontal(roadMask) && isHorizontal(railMask)) ? 237 : 238) | BULLBIT | BURNBIT;
          if (wire) counts.wiresDropped += 1;
        } else if (road && wire) {
          if (water) { value = (isHorizontal(roadMask) ? T.ROAD_BRIDGE_H : T.ROAD_BRIDGE_V) | BULLBIT; counts.wiresDropped += 1; }
          else value = (isVertical(roadMask) ? T.ROAD_WIRE_V : T.ROAD_WIRE_H) | BULLBIT | BURNBIT | CONDBIT;
        } else if (rail && wire) {
          if (water) { value = (isHorizontal(railMask) ? T.RAIL_BRIDGE_H : T.RAIL_BRIDGE_V) | BULLBIT; counts.wiresDropped += 1; }
          else value = (isVertical(railMask) ? T.WIRE_RAIL_V : T.WIRE_RAIL_H) | BULLBIT | BURNBIT | CONDBIT;
        } else if (road) {
          value = water ? ((isVertical(roadMask) ? T.ROAD_BRIDGE_V : T.ROAD_BRIDGE_H) | BULLBIT) : (ROAD_BY_MASK[roadMask] | BULLBIT | BURNBIT);
        } else if (rail) {
          value = water ? ((isVertical(railMask) ? T.RAIL_BRIDGE_V : T.RAIL_BRIDGE_H) | BULLBIT) : (ROAD_BY_MASK[railMask] + RAIL_OFFSET | BULLBIT | BURNBIT);
        } else {
          value = water ? ((isVertical(wireMask) ? T.WIRE_BRIDGE_V : T.WIRE_BRIDGE_H) | BULLBIT | CONDBIT) : (ROAD_BY_MASK[wireMask] + WIRE_OFFSET | BULLBIT | BURNBIT | CONDBIT);
        }
      } else if (water) {
        const mask = maskOf(L.water, bx, by, true);
        value = mask === 15 ? RIVER : (WATER_EDGE_BY_MASK[mask] !== undefined ? WATER_EDGE_BY_MASK[mask] | BULLBIT : RIVER);
      } else if (L.tree[i]) {
        const mask = maskOf(L.tree, bx, by);
        value = (mask === 15 ? WOODS : (TREE_EDGE_BY_MASK[mask] !== undefined ? TREE_EDGE_BY_MASK[mask] : WOODS)) | BULLBIT | BURNBIT;
      } else if (L.park[i]) {
        value = FOUNTAIN | ANIMBIT | BULLBIT | BURNBIT;
      } else if (L.catalogId[i] === CATALOG.RADIOACTIVE) {
        value = RADIOACTIVE;
      } else if (L.zone[i] === ZONE_R || L.zone[i] === ZONE_C || L.zone[i] === ZONE_I) {
        counts.unblocked += 1;
      } else if (L.zone[i] || L.catalogId[i]) {
        counts.withoutEquivalent += 1;
      }
      if (value === null) continue;
      if (powered && powered[i] && (value & CONDBIT)) value |= POWERBIT;
      map[ci] = value;
    }
    // The apron around a smaller map is open water.
    for (let cy = 0; cy < CLASSIC_HEIGHT; cy += 1) for (let cx = 0; cx < CLASSIC_WIDTH; cx += 1) {
      const inside = cx >= win.embedX && cy >= win.embedY && cx < win.embedX + win.width && cy < win.embedY + win.height;
      if (!inside) map[classicIndex(cx, cy)] = RIVER;
    }

    // --- the loss report ---------------------------------------------------
    const warnings = [];
    if (counts.cropped > 0) warnings.push(`map-cropped:${counts.cropped}`);
    let altitudes = 0; const seen = new Set();
    for (let i = 0; i < count && altitudes < 2; i += 1) if (!L.water[i] && !seen.has(L.alt[i])) { seen.add(L.alt[i]); altitudes += 1; }
    if (altitudes > 1) warnings.push("altitude-flattened");
    if (counts.unblocked > 0) warnings.push(`zone-tiles-unblocked:${counts.unblocked}`);
    if (counts.withoutEquivalent > 0) warnings.push(`tiles-without-equivalent:${counts.withoutEquivalent}`);
    if (counts.facilitiesWithout > 0) warnings.push(`facilities-without-equivalent:${counts.facilitiesWithout}`);
    if (counts.wiresDropped > 0) warnings.push(`wires-dropped-at-crossings:${counts.wiresDropped}`);
    for (const [layer, code] of [["pipe", "pipe"], ["subway", "subway"], ["highway", "highway"], ["onramp", "onramp"], ["tunnel", "tunnel"], ["waterLevel", "water-level"]]) {
      if (counts[layer] > 0) warnings.push(`layer-dropped-${code}:${counts[layer]}`);
    }
    const bonds = Array.isArray(payload.bonds) ? payload.bonds.length : 0;
    const ordinances = payload.ordinances && typeof payload.ordinances === "object" ? Object.values(payload.ordinances).filter(Boolean).length : 0;
    const microsims = Array.isArray(payload.microsims) ? payload.microsims.length : 0;
    const things = Array.isArray(payload.things) ? payload.things.length : 0;
    if (bonds > 0) warnings.push(`records-dropped-bonds:${bonds}`);
    if (ordinances > 0) warnings.push(`records-dropped-ordinances:${ordinances}`);
    if (microsims > 0) warnings.push(`records-dropped-microsims:${microsims}`);
    if (things > 0) warnings.push(`records-dropped-things:${things}`);
    if ((Array.isArray(payload.history) && payload.history.length > 0) || (payload.graphs && typeof payload.graphs === "object")) warnings.push("history-dropped");
    warnings.push("progress-not-carried");
    warnings.push("population-recomputed");

    // --- scalars: the fields the engine reads back ---------------------------
    const [ticksNumerator, ticksDenominator] = codec.TICKS_PER_CITY_TIME;
    const tick = isInt(payload.tick) && payload.tick > 0 ? payload.tick : 0;
    const cityTime = Math.round((tick * ticksDenominator) / ticksNumerator);
    const funding = payload.funding && typeof payload.funding === "object" ? payload.funding : {};
    const percent = (value) => (isInt(value) ? clamp(value, 0, 100) / 100 : 1);
    const zeros = () => new Array(HISTORY_LENGTH).fill(0);
    const centreX = clamp(classicX(clamp(payload.spawnCenter?.x | 0, win.x, win.x + win.width - 1)), 0, CLASSIC_WIDTH - 1);
    const centreY = clamp(classicY(clamp(payload.spawnCenter?.y | 0, win.y, win.y + win.height - 1)), 0, CLASSIC_HEIGHT - 1);
    const name = String(options.name || payload.name || "").trim();

    // Census, evaluation, and demand valves start at the engine's own
    // fresh-city values (observed from a new game's save, not copied from
    // code): the classic model recounts them on its first scan.
    const saveData = {
      _cityTime: cityTime, _speed: 1, _gameLevel: 0,
      cityCentreX: centreX, cityCentreY: centreY, pollutionMaxX: centreX, pollutionMaxY: centreY,
      width: CLASSIC_WIDTH, height: CLASSIC_HEIGHT, map,
      cityClass: "VILLAGE", cityScore: 500,
      resValve: 0, comValve: 0, indValve: 0,
      autoBudget: false, totalFunds: isInt(payload.funds) ? payload.funds : 0,
      policePercent: percent(funding.police), roadPercent: percent(funding.roads), firePercent: percent(funding.fire),
      roadSpend: 0, policeSpend: 0, fireSpend: 0,
      roadMaintenanceBudget: 0, policeMaintenanceBudget: 0, fireMaintenanceBudget: 0,
      cityTax: isInt(payload.taxRate) ? clamp(payload.taxRate, 0, 20) : 7,
      roadEffect: 32, policeEffect: 1000, fireEffect: 1000,
      resPop: 0, comPop: 0, indPop: 0, crimeRamp: 0, pollutionRamp: 0,
      landValueAverage: 0, pollutionAverage: 0, crimeAverage: 0, totalPop: 1,
      resHist10: zeros(), resHist120: zeros(), comHist10: zeros(), comHist120: zeros(),
      indHist10: zeros(), indHist120: zeros(), crimeHist10: zeros(), crimeHist120: zeros(),
      moneyHist10: zeros(), moneyHist120: zeros(), pollutionHist10: zeros(), pollutionHist120: zeros(),
      cityName: name,
      provenance: {
        from: "bonsai-city",
        cityId: typeof options.cityId === "string" ? options.cityId : null,
        exportedAt: typeof options.exportedAt === "string" ? options.exportedAt : null,
      },
    };

    return {
      saveData,
      name,
      warnings,
      population: isInt(options.population) ? options.population : 0,
      details: { window: win, counts: { ...counts }, facilityKinds },
    };
  }

  window.AISystem6BonsaiMicropolisExport = Object.freeze({
    CLASSIC_WIDTH, CLASSIC_HEIGHT, WARNING_CODES,
    FLAG_BITS: Object.freeze({ ZONEBIT, ANIMBIT, BULLBIT, BURNBIT, CONDBIT, POWERBIT }),
    ROAD_BY_MASK, RAIL_OFFSET, WIRE_OFFSET, WATER_EDGE_BY_MASK, TREE_EDGE_BY_MASK,
    FACILITY_FAMILY, CATALOG_FAMILY, PORT_FAMILY: Object.freeze(PORT_FAMILY), AIRPORT_FAMILY: Object.freeze(AIRPORT_FAMILY),
    looksLikeBonsaiPayload, cropWindowFor, zoneLevel, exportMicropolis,
  });
})();
