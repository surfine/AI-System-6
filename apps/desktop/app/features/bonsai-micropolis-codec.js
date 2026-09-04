// Bonsai City Micropolis importer / 盆景城市 Micropolis 导入器.
// Bonsai summons Micropolis cities and can send a city back (see
// bonsai-micropolis-export.js); both directions are lossy and report the
// loss. This file is the inbound half: a Micropolis save becomes a v3 engine
// payload. Clean-room mapping from the classic SimCity tile id table (public
// format facts; the tile ids are data, not code — no GPL engine code is
// consulted or copied here). Headless and deterministic: no DOM, no timers,
// no wall clock, no randomness, zero PRNG draws. The importer emits a v3
// engine payload (the serialize() shape); the caller runs it through
// AISystem6BonsaiSim.deserialize.
window.AISystem6BonsaiMicropolisCodecLoaded = true;

(function initBonsaiMicropolisCodec() {
  "use strict";

  const BONSAI_SIZE = 128;
  const BONSAI_TILES = BONSAI_SIZE * BONSAI_SIZE;
  // Bonsai calendar: 5 ticks/day, 25 days/month, 300 days/year. The classic
  // clock runs 48 units per year, so one unit is 300/48 days = 125/4 ticks.
  const TICKS_PER_CITY_TIME = [125, 4];
  const START_YEAR = 1900;

  // Classic SimCity tile id facts (low 10 bits of a raw tile value; the high
  // bits are engine flags and carry no map content we need).
  const TILE_ID_MASK = 0x3ff;
  const T = Object.freeze({
    WATER_LOW: 2, WATER_HIGH: 20,             // river, edges, channel
    TREE_LOW: 21, TREE_HIGH: 43,              // trees and woods
    RUBBLE_LOW: 44, RUBBLE_HIGH: 47,
    FLOOD_LOW: 48, FLOOD_HIGH: 51,
    RADIOACTIVE: 52,
    FIRE_LOW: 56, FIRE_HIGH: 63,
    ROAD_LOW: 64, ROAD_HIGH: 206,             // bridges, roads, traffic
    ROAD_BRIDGE_H: 64, ROAD_BRIDGE_V: 65,     // road over water
    ROAD_PLAIN_LOW: 66, ROAD_PLAIN_HIGH: 76,  // land road shapes, traffic-free
    ROAD_WIRE_H: 77, ROAD_WIRE_V: 78,         // road with a power crossing
    ROAD_BRIDGE_OPEN_H: 79, ROAD_BRIDGE_OPEN_V: 95,
    WIRE_LOW: 208, WIRE_HIGH: 222,
    WIRE_BRIDGE_H: 208, WIRE_BRIDGE_V: 209,   // power line over water
    WIRE_RAIL_H: 221, WIRE_RAIL_V: 222,       // power with a rail crossing
    RAIL_LOW: 224, RAIL_HIGH: 238,
    RAIL_BRIDGE_H: 224, RAIL_BRIDGE_V: 225,   // rail over water
    RAIL_ROAD_H: 237, RAIL_ROAD_V: 238,       // rail with a road crossing
    ROAD_WIRE_X: 239,
    RES_LOW: 240, RES_EMPTY_CENTER: 244,      // empty residential block
    HOUSE_LOW: 249, HOUSE_HIGH: 260,          // twelve single houses
    // A grown block is nine tiles centred on its family id; the first
    // family's tiles start four below the centre, so the block of level k
    // spans GROWN_LOW + 9k .. GROWN_LOW + 9k + 8.
    RES_GROWN_LOW: 261, RES_GROWN_LEVELS: 16,
    HOSPITAL_LOW: 405, HOSPITAL_CENTER: 409, HOSPITAL_HIGH: 413,
    CHURCH_LOW: 414, CHURCH_HIGH: 422,
    COM_LOW: 423, COM_EMPTY_CENTER: 427, COM_GROWN_LOW: 432, COM_GROWN_LEVELS: 20, COM_HIGH: 611,
    IND_LOW: 612, IND_EMPTY_CENTER: 616, IND_GROWN_LOW: 621, IND_GROWN_LEVELS: 8, IND_HIGH: 692,
    PORT_LOW: 693, PORT_HIGH: 708,
    AIRPORT_LOW: 709, AIRPORT_HIGH: 744,
    COAL_LOW: 745, COAL_CENTER: 750, COAL_HIGH: 760,
    FIRE_ST_LOW: 761, FIRE_ST_CENTER: 765, FIRE_ST_HIGH: 769,
    POLICE_LOW: 770, POLICE_CENTER: 774, POLICE_HIGH: 778,
    STADIUM_LOW: 779, STADIUM_HIGH: 810,
    NUCLEAR_LOW: 811, NUCLEAR_CENTER: 816, NUCLEAR_HIGH: 826,
    DRAWBRIDGE_H_LOW: 828, DRAWBRIDGE_H_HIGH: 832,
    RADAR_ANIM_LOW: 832, RADAR_ANIM_HIGH: 839,
    FOUNTAIN: 840,
    SMOKE_LOW: 852, SMOKE_HIGH: 931,          // plant animation overlays
    STADIUM_GAME_LOW: 932, STADIUM_GAME_HIGH: 947,
    DRAWBRIDGE_V_LOW: 948, DRAWBRIDGE_V_HIGH: 951,
  });
  const inRange = (id, low, high) => id >= low && id <= high;

  // Bonsai catalog ids used for buildings without a live facility model.
  // The exporter reads the same three, so a stadium goes back as a stadium.
  const CATALOG_RADIOACTIVE = 0x05;
  const CATALOG_STADIUM = 0xd7;
  const CATALOG_CHURCH = 0xf7;
  const CATALOG_FACTS = Object.freeze({ RADIOACTIVE: CATALOG_RADIOACTIVE, STADIUM: CATALOG_STADIUM, CHURCH: CATALOG_CHURCH });

  // Zone-center tile id -> Bonsai facility kind (top-left is one tile up and
  // left of the center in every classic multi-tile building).
  const FACILITY_BY_CENTER = Object.freeze({
    [T.COAL_CENTER]: "coal",
    [T.NUCLEAR_CENTER]: "nuclear",
    [T.FIRE_ST_CENTER]: "fire",
    [T.POLICE_CENTER]: "police",
    [T.HOSPITAL_CENTER]: "clinic",
  });

  // Bridge tile id -> the Bonsai network layer that rides over the water.
  // The drawbridge animation frames are the same road bridge in motion.
  const BRIDGE_LAYER = Object.freeze({
    [T.ROAD_BRIDGE_H]: "road", [T.ROAD_BRIDGE_V]: "road",
    [T.ROAD_BRIDGE_OPEN_H]: "road", [T.ROAD_BRIDGE_OPEN_V]: "road",
    828: "road", 829: "road", 830: "road", 831: "road",
    948: "road", 949: "road", 950: "road", 951: "road",
    [T.WIRE_BRIDGE_H]: "wire", [T.WIRE_BRIDGE_V]: "wire",
    [T.RAIL_BRIDGE_H]: "rail", [T.RAIL_BRIDGE_V]: "rail",
  });

  function fail(code) { throw new Error(`bonsai-micropolis-invalid: ${code}`); }

  const isInt = Number.isInteger;
  function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

  // A Micropolis IndexedDB record's saveData (or a bare saveData object)
  // carries the whole engine state as JSON: map as plain tile numbers plus
  // scalar budget/clock fields. This is the shape the shell writes.
  function looksLikeMicropolisSave(data) {
    const save = data && data.saveData && Array.isArray(data.saveData.map) ? data.saveData : data;
    return !!save && Array.isArray(save.map) && isInt(save.width) && isInt(save.height)
      && isInt(save.totalFunds) && isInt(save._cityTime)
      && save.map.length === save.width * save.height;
  }

  // Residential growth: grown blocks step through nine-tile families; the
  // family index carries how built-up the block is. The mapping to Bonsai's
  // three stages and two densities is a recorded approximation (the classic
  // model has no direct twin of the SC2K density split).
  function grownLevel(id, base) { return Math.floor((id - base) / 9); }
  function stageOfLevel(level) { return 1 + Math.min(2, Math.floor(Math.max(0, level) / 3)); }
  function densityOfLevel(level) { return level >= 8 ? 2 : 1; }
  // Bonsai keeps stage and density; the exact classic family is finer than
  // that. The variant layer carries it as `1 + level` (a single house as
  // `1 + house index`), so a city sent back gets the same block it arrived
  // with. Bonsai draws any variant value, and a block the sim rebuilds gets
  // a fresh variant, which the exporter then treats as "no memory".
  const variantOfLevel = (level) => 1 + level;

  function importMicropolis(input, options = {}) {
    const record = input && input.saveData && Array.isArray(input.saveData.map) ? input : null;
    const save = record ? record.saveData : input;
    if (!looksLikeMicropolisSave(save)) fail("save-shape");
    const width = save.width;
    const height = save.height;
    if (width > BONSAI_SIZE || height > BONSAI_SIZE || width < 8 || height < 8) fail("map-size");

    const warnings = [];
    let droppedTiles = 0;
    let ruinTiles = 0;

    // Salt apron: the smaller classic map embeds centered in the 128-square
    // grid; every tile outside it is open sea, the same technique the .sc2
    // path uses for sub-128 cities.
    const offsetX = Math.floor((BONSAI_SIZE - width) / 2);
    const offsetY = Math.floor((BONSAI_SIZE - height) / 2);

    const zeros = () => new Array(BONSAI_TILES).fill(0);
    const layers = {
      terrain: zeros(), alt: zeros(), water: zeros(), shore: zeros(), slope: zeros(), tree: zeros(),
      road: zeros(), rail: zeros(), wire: zeros(), pipe: zeros(), park: zeros(),
      zone: zeros(), density: zeros(), stage: zeros(), buildingState: zeros(), constructionTimer: zeros(), variant: zeros(),
      catalogId: zeros(), subway: zeros(), waterLevel: zeros(), salt: zeros(), rotate: zeros(), tunnel: zeros(), waterKind: zeros(),
      highway: zeros(), onramp: zeros(),
    };
    const facilities = [];

    for (let by = 0; by < BONSAI_SIZE; by += 1) for (let bx = 0; bx < BONSAI_SIZE; bx += 1) {
      const bi = by * BONSAI_SIZE + bx;
      const sx = bx - offsetX;
      const sy = by - offsetY;
      const onMap = sx >= 0 && sy >= 0 && sx < width && sy < height;
      if (!onMap) {
        layers.water[bi] = 1;
        layers.waterKind[bi] = 1;
        layers.salt[bi] = 1;
        continue;
      }
      const raw = save.map[sy * width + sx];
      const id = (isInt(raw) ? raw : 0) & TILE_ID_MASK;

      // Terrain baseline is flat: land at altitude 1, water at 0. The
      // classic map has no altitude, so nothing pretends otherwise. A
      // bridge is water with the network on top: Bonsai roads, rails, and
      // power lines bridge water too, so the water stays water here.
      const bridge = BRIDGE_LAYER[id];
      const water = bridge !== undefined || inRange(id, T.WATER_LOW, T.WATER_HIGH);
      layers.water[bi] = water ? 1 : 0;
      layers.waterKind[bi] = water ? 1 : 0;
      layers.alt[bi] = water ? 0 : 1;
      layers.terrain[bi] = water ? 0 : 1 + (bx + by) % 3;
      if (bridge !== undefined) { layers[bridge][bi] = 1; continue; }
      if (water) continue;

      if (inRange(id, T.TREE_LOW, T.TREE_HIGH)) { layers.tree[bi] = 1; continue; }
      if (id === T.FOUNTAIN) { layers.park[bi] = 1; continue; }
      if (id === T.RADIOACTIVE) { layers.catalogId[bi] = CATALOG_RADIOACTIVE; continue; }
      // Rubble, flood and fire are a moment in the classic simulation, not
      // map content. Bonsai has no twin for that moment, so the rule is to
      // land the tile as bare ground and count it for the import report.
      if (inRange(id, T.RUBBLE_LOW, T.RUBBLE_HIGH) || inRange(id, T.FLOOD_LOW, T.FLOOD_HIGH)
        || inRange(id, T.FIRE_LOW, T.FIRE_HIGH)) { ruinTiles += 1; continue; }

      // Networks. Crossings carry both layers; drawbridge animation frames
      // are still road.
      if (inRange(id, T.ROAD_LOW, T.ROAD_HIGH)) {
        layers.road[bi] = 1;
        if (id === T.ROAD_WIRE_H || id === T.ROAD_WIRE_V) layers.wire[bi] = 1;
        continue;
      }
      if (inRange(id, T.WIRE_LOW, T.WIRE_HIGH) || id === T.ROAD_WIRE_X) {
        layers.wire[bi] = 1;
        if (id === T.WIRE_RAIL_H || id === T.WIRE_RAIL_V) layers.rail[bi] = 1;
        if (id === T.ROAD_WIRE_X) layers.road[bi] = 1;
        continue;
      }
      if (inRange(id, T.RAIL_LOW, T.RAIL_HIGH)) {
        layers.rail[bi] = 1;
        if (id === T.RAIL_ROAD_H || id === T.RAIL_ROAD_V) layers.road[bi] = 1;
        continue;
      }

      // Growable zones. Every tile of a nine-tile block carries its family
      // id, so density and stage read directly from the tile.
      if (inRange(id, T.RES_LOW, T.HOSPITAL_LOW - 1)) {
        layers.zone[bi] = 1;
        if (id >= T.RES_GROWN_LOW) {
          const level = grownLevel(id, T.RES_GROWN_LOW);
          layers.density[bi] = densityOfLevel(level);
          layers.stage[bi] = stageOfLevel(level % 8);
          layers.buildingState[bi] = 3;
          layers.variant[bi] = variantOfLevel(level);
        } else if (inRange(id, T.HOUSE_LOW, T.HOUSE_HIGH)) {
          layers.density[bi] = 1; layers.stage[bi] = 1; layers.buildingState[bi] = 3;
          layers.variant[bi] = variantOfLevel(id - T.HOUSE_LOW);
        } else {
          layers.density[bi] = 1;
        }
        continue;
      }
      if (inRange(id, T.HOSPITAL_LOW, T.HOSPITAL_HIGH)) {
        if (id === T.HOSPITAL_CENTER) facilities.push({ kind: "clinic", x: sx, y: sy });
        continue;
      }
      if (inRange(id, T.CHURCH_LOW, T.CHURCH_HIGH)) { layers.catalogId[bi] = CATALOG_CHURCH; continue; }
      if (inRange(id, T.COM_LOW, T.COM_HIGH)) {
        layers.zone[bi] = 2;
        if (id >= T.COM_GROWN_LOW) {
          const level = grownLevel(id, T.COM_GROWN_LOW);
          layers.density[bi] = densityOfLevel(Math.floor(level / 2));
          layers.stage[bi] = stageOfLevel(level % 10);
          layers.buildingState[bi] = 3;
          layers.variant[bi] = variantOfLevel(level);
        } else {
          layers.density[bi] = 1;
        }
        continue;
      }
      if (inRange(id, T.IND_LOW, T.IND_HIGH)) {
        layers.zone[bi] = 3;
        if (id >= T.IND_GROWN_LOW) {
          const level = grownLevel(id, T.IND_GROWN_LOW);
          layers.density[bi] = densityOfLevel(level);
          layers.stage[bi] = stageOfLevel(level % 8);
          layers.buildingState[bi] = 3;
          layers.variant[bi] = variantOfLevel(level);
        } else {
          layers.density[bi] = 1;
        }
        continue;
      }

      // Ports and services. Seaport and airport land as SC2K-style zoned
      // ground; the working buildings become live Bonsai facilities.
      if (inRange(id, T.PORT_LOW, T.PORT_HIGH)) { layers.zone[bi] = 6; continue; }
      if (inRange(id, T.AIRPORT_LOW, T.AIRPORT_HIGH) || inRange(id, T.RADAR_ANIM_LOW, T.RADAR_ANIM_HIGH)) {
        layers.zone[bi] = 5;
        continue;
      }
      if (inRange(id, T.STADIUM_LOW, T.STADIUM_HIGH) || inRange(id, T.STADIUM_GAME_LOW, T.STADIUM_GAME_HIGH)) {
        layers.catalogId[bi] = CATALOG_STADIUM;
        continue;
      }
      const centerKind = FACILITY_BY_CENTER[id];
      if (centerKind) {
        // Top-left is one tile up-left of the center in classic footprints;
        // clamp keeps a map-edge building on the map.
        facilities.push({ kind: centerKind, x: Math.max(0, sx - 1), y: Math.max(0, sy - 1) });
        continue;
      }
      if (inRange(id, T.COAL_LOW, T.COAL_HIGH) || inRange(id, T.NUCLEAR_LOW, T.NUCLEAR_HIGH)
        || inRange(id, T.FIRE_ST_LOW, T.FIRE_ST_HIGH) || inRange(id, T.POLICE_LOW, T.POLICE_HIGH)
        || inRange(id, T.SMOKE_LOW, T.SMOKE_HIGH)) {
        // Non-center tiles of a working building (including its animation
        // overlays): the facility record placed at the center carries them.
        continue;
      }
      if (id > 1) droppedTiles += 1;
    }

    // Facility coordinates move into the embedded frame.
    for (const facility of facilities) {
      facility.x += offsetX;
      facility.y += offsetY;
    }

    // The import report. The product must never claim a fact arrived when it
    // did not, so each thing the classic model holds and Bonsai cannot take
    // gets its own code here, and the caller shows every one of them to the
    // player. A code with a `:count` suffix carries how many tiles it counts.
    // These codes are the contract: `tests/features/city-save-import.test.mjs`
    // holds the mapping table against them.
    if (ruinTiles > 0) warnings.push(`ruins-cleared:${ruinTiles}`);
    if (droppedTiles > 0) warnings.push(`tiles-without-equivalent:${droppedTiles}`);
    // The classic map has no altitude, so imported land is flat. Bonsai
    // reads population and jobs off the map, so the classic census numbers
    // are recomputed and will not match. Ratings, the history graphs and the
    // RCI valves have no equivalent and start at the engine default.
    warnings.push("terrain-flat");
    warnings.push("population-recomputed");
    warnings.push("ratings-not-carried");
    warnings.push("demand-reset");
    warnings.push("sc2k-only-systems-absent");

    const cityTime = Math.max(0, save._cityTime | 0);
    const tick = Math.floor((cityTime * TICKS_PER_CITY_TIME[0]) / TICKS_PER_CITY_TIME[1]);
    const taxRate = isInt(save.cityTax) && save.cityTax >= 0 && save.cityTax <= 20 ? save.cityTax : 7;
    const percent = (value) => (typeof value === "number" && value >= 0 && value <= 1 ? Math.round(value * 100) : 100);
    const clampCoord = (value) => (isInt(value) ? Math.max(0, Math.min(BONSAI_SIZE - 1, value)) : 64);

    const name = String((record && record.name) || options.name || save.cityName || "").trim();

    const payload = {
      format: "bonsai-city", version: 3, rulesetVersion: 3,
      name, seed: 0, rngState: 0, size: BONSAI_SIZE, terrainPreset: "balanced",
      yearFounded: START_YEAR, tick,
      funds: save.totalFunds | 0, taxRate, taxRates: { r: taxRate, c: taxRate, i: taxRate },
      eq: 60, le: 60,
      rewardTier: 0, paperDelivery: true,
      milestone: 0, wasBroke: false, brownout: false, waterShortage: false,
      spawnCenter: { x: clampCoord((save.cityCentreX | 0) + offsetX), y: clampCoord((save.cityCentreY | 0) + offsetY) },
      facilities,
      // The classic model funds roads, fire, and police; everything SC2K
      // added starts at the honest default of full funding.
      funding: {
        roads: percent(save.roadPercent), highways: 100, bridges: 100,
        rail: 100, subway: 100, tunnels: 100,
        police: percent(save.policePercent), fire: percent(save.firePercent),
        health: 100, schools: 100, colleges: 100,
      },
      history: [], nextCommandSequence: 1, pendingCommands: [],
      ...layers,
      // The untouched original save rides along the same sidecar slot the
      // .sc2 path uses (no `chunks` key, so the .sc2 exporter treats the
      // city as native and synthesizes every segment — upgrade-only).
      sc2Sidecar: { version: 1, kind: "micropolis-save-v1", saveData: cloneJson(save) },
    };
    return { payload, name, warnings };
  }

  window.AISystem6BonsaiMicropolisCodec = Object.freeze({
    BONSAI_SIZE, TILE_ID_MASK, TILE_FACTS: T, CATALOG_FACTS, TICKS_PER_CITY_TIME,
    FACILITY_BY_CENTER, BRIDGE_LAYER,
    grownLevel, stageOfLevel, densityOfLevel, variantOfLevel,
    looksLikeMicropolisSave, importMicropolis,
  });
})();
