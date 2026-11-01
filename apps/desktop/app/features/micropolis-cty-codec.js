// Classic city file (.cty) codec / 经典城市文件 .cty 编解码器.
// The common external format for both desk toys: Micropolis reads and
// writes it directly, and Bonsai City reaches it through the Micropolis
// save shape (bonsai-micropolis-codec.js / bonsai-micropolis-export.js).
//
// Source of the layout: the public classic city-file layout as recorded in
// community format notes — a 27,120-byte file of big-endian 16-bit values:
// six history tables of 240 values (residential, commercial, industrial,
// crime, pollution, money), a 120-value miscellaneous table, then the
// 120x100 tile map stored column by column. This module is written
// clean-room from those facts; no game or engine source is consulted or
// copied, and no city file of any origin is committed or bundled. Headless
// and deterministic: no DOM, no timers, no wall clock, no randomness.
window.AISystem6MicropolisCtyCodecLoaded = true;

(function initMicropolisCtyCodec() {
  "use strict";

  const WIDTH = 120;
  const HEIGHT = 100;
  const HISTORY = 240;
  const HALF_HISTORY = 120;
  const MISC = 120;
  const TABLES = ["res", "com", "ind", "crime", "pollution", "money"];
  const MAP_OFFSET = (TABLES.length * HISTORY + MISC) * 2;
  const FILE_SIZE = MAP_OFFSET + WIDTH * HEIGHT * 2;

  // Positions inside the miscellaneous table. A "long" occupies two
  // consecutive values, high half first.
  const MISC_INDEX = Object.freeze({
    externalMarket: 1, resPop: 2, comPop: 3, indPop: 4,
    resValve: 5, comValve: 6, indValve: 7,
    cityTime: 8,            // long
    crimeRamp: 10, pollutionRamp: 11,
    landValueAverage: 12, crimeAverage: 13, pollutionAverage: 14,
    gameLevel: 15, cityClass: 16, cityScore: 17,
    totalFunds: 50,         // long
    autoBulldoze: 52, autoBudget: 53, autoGoto: 54, sound: 55,
    cityTax: 56, speed: 57,
    policePercent: 58,      // long, fixed point 16.16
    firePercent: 60,        // long, fixed point 16.16
    roadPercent: 62,        // long, fixed point 16.16
  });
  const CITY_CLASSES = Object.freeze(["VILLAGE", "TOWN", "CITY", "CAPITAL", "METROPOLIS", "MEGALOPOLIS"]);
  const FIXED_POINT = 65536;
  // What the engine recomputes after a load because the file has no slot:
  // the budget effect and spend figures restart at the next budget, and the
  // city centre is found again on the next scan. Encoding keeps every
  // engine-save key the layout carries, so there is no encode-side loss.
  const DECODE_LOSSES = Object.freeze(["budget-effects-recomputed", "city-centre-recomputed"]);
  const ENCODE_LOSSES = Object.freeze([]);

  function fail(code) { throw new Error(`micropolis-cty-invalid: ${code}`); }
  const isInt = Number.isInteger;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const toInt16 = (value) => clamp(Math.round(Number(value) || 0), -32768, 32767);
  const toInt32 = (value) => clamp(Math.round(Number(value) || 0), -2147483648, 2147483647);

  function looksLikeCty(bytes) {
    return !!bytes && typeof bytes.length === "number" && bytes.length === FILE_SIZE;
  }

  function encodeCty(saveData) {
    if (!saveData || !Array.isArray(saveData.map)) fail("save-shape");
    if (saveData.width !== WIDTH || saveData.height !== HEIGHT || saveData.map.length !== WIDTH * HEIGHT) fail("map-size");
    const buffer = new ArrayBuffer(FILE_SIZE);
    const view = new DataView(buffer);
    const setShort = (index, value) => view.setInt16(index * 2, toInt16(value), false);
    const setLong = (index, value) => view.setInt32(index * 2, toInt32(value), false);

    TABLES.forEach((table, tableIndex) => {
      const base = tableIndex * HISTORY;
      const ten = Array.isArray(saveData[`${table}Hist10`]) ? saveData[`${table}Hist10`] : [];
      const long = Array.isArray(saveData[`${table}Hist120`]) ? saveData[`${table}Hist120`] : [];
      for (let i = 0; i < HALF_HISTORY; i += 1) {
        setShort(base + i, ten[i] || 0);
        setShort(base + HALF_HISTORY + i, long[i] || 0);
      }
    });

    const misc = TABLES.length * HISTORY;
    const setMisc = (name, value) => setShort(misc + MISC_INDEX[name], value);
    const setMiscLong = (name, value) => setLong(misc + MISC_INDEX[name], value);
    setMisc("externalMarket", 4);
    setMisc("resPop", saveData.resPop);
    setMisc("comPop", saveData.comPop);
    setMisc("indPop", saveData.indPop);
    setMisc("resValve", saveData.resValve);
    setMisc("comValve", saveData.comValve);
    setMisc("indValve", saveData.indValve);
    setMiscLong("cityTime", saveData._cityTime);
    setMisc("crimeRamp", saveData.crimeRamp);
    setMisc("pollutionRamp", saveData.pollutionRamp);
    setMisc("landValueAverage", saveData.landValueAverage);
    setMisc("crimeAverage", saveData.crimeAverage);
    setMisc("pollutionAverage", saveData.pollutionAverage);
    setMisc("gameLevel", saveData._gameLevel);
    setMisc("cityClass", Math.max(0, CITY_CLASSES.indexOf(String(saveData.cityClass))));
    setMisc("cityScore", saveData.cityScore);
    setMiscLong("totalFunds", saveData.totalFunds);
    setMisc("autoBulldoze", saveData.autoBulldoze ? 1 : 0);
    setMisc("autoBudget", saveData.autoBudget ? 1 : 0);
    setMisc("autoGoto", 0);
    setMisc("sound", 0);
    setMisc("cityTax", saveData.cityTax);
    setMisc("speed", saveData._speed);
    setMiscLong("policePercent", (Number(saveData.policePercent) || 0) * FIXED_POINT);
    setMiscLong("firePercent", (Number(saveData.firePercent) || 0) * FIXED_POINT);
    setMiscLong("roadPercent", (Number(saveData.roadPercent) || 0) * FIXED_POINT);

    // Tiles are stored column by column; the raw value keeps its flag bits.
    for (let x = 0; x < WIDTH; x += 1) for (let y = 0; y < HEIGHT; y += 1) {
      const raw = saveData.map[y * WIDTH + x];
      const value = isInt(raw) ? raw : (raw && isInt(raw.value) ? raw.value : 0);
      view.setUint16(MAP_OFFSET + (x * HEIGHT + y) * 2, value & 0xffff, false);
    }
    return new Uint8Array(buffer);
  }

  function decodeCty(input) {
    const bytes = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
    if (!looksLikeCty(bytes)) fail("file-size");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const getShort = (index) => view.getInt16(index * 2, false);
    const getLong = (index) => view.getInt32(index * 2, false);
    const misc = TABLES.length * HISTORY;
    const getMisc = (name) => getShort(misc + MISC_INDEX[name]);
    const getMiscLong = (name) => getLong(misc + MISC_INDEX[name]);

    const saveData = { width: WIDTH, height: HEIGHT, map: new Array(WIDTH * HEIGHT).fill(0) };
    TABLES.forEach((table, tableIndex) => {
      const base = tableIndex * HISTORY;
      saveData[`${table}Hist10`] = Array.from({ length: HALF_HISTORY }, (_, i) => getShort(base + i));
      saveData[`${table}Hist120`] = Array.from({ length: HALF_HISTORY }, (_, i) => getShort(base + HALF_HISTORY + i));
    });
    for (let x = 0; x < WIDTH; x += 1) for (let y = 0; y < HEIGHT; y += 1) {
      saveData.map[y * WIDTH + x] = view.getUint16(MAP_OFFSET + (x * HEIGHT + y) * 2, false);
    }
    const level = getMisc("gameLevel");
    const speed = getMisc("speed");
    const percent = (name) => clamp(getMiscLong(name) / FIXED_POINT, 0, 1);
    Object.assign(saveData, {
      _cityTime: Math.max(0, getMiscLong("cityTime")),
      _speed: speed >= 0 && speed <= 3 ? speed : 1,
      _gameLevel: level >= 0 && level <= 2 ? level : 0,
      cityCentreX: Math.floor(WIDTH / 2), cityCentreY: Math.floor(HEIGHT / 2),
      pollutionMaxX: Math.floor(WIDTH / 2), pollutionMaxY: Math.floor(HEIGHT / 2),
      cityClass: CITY_CLASSES[clamp(getMisc("cityClass"), 0, CITY_CLASSES.length - 1)],
      cityScore: getMisc("cityScore"),
      resValve: getMisc("resValve"), comValve: getMisc("comValve"), indValve: getMisc("indValve"),
      autoBudget: getMisc("autoBudget") !== 0, autoBulldoze: getMisc("autoBulldoze") !== 0,
      totalFunds: getMiscLong("totalFunds"),
      policePercent: percent("policePercent"), firePercent: percent("firePercent"), roadPercent: percent("roadPercent"),
      roadSpend: 0, policeSpend: 0, fireSpend: 0,
      roadMaintenanceBudget: 0, policeMaintenanceBudget: 0, fireMaintenanceBudget: 0,
      cityTax: clamp(getMisc("cityTax"), 0, 20),
      roadEffect: 32, policeEffect: 1000, fireEffect: 1000,
      resPop: getMisc("resPop"), comPop: getMisc("comPop"), indPop: getMisc("indPop"),
      crimeRamp: getMisc("crimeRamp"), pollutionRamp: getMisc("pollutionRamp"),
      landValueAverage: getMisc("landValueAverage"), pollutionAverage: getMisc("pollutionAverage"), crimeAverage: getMisc("crimeAverage"),
      totalPop: Math.max(1, getMisc("resPop") + getMisc("comPop") + getMisc("indPop")),
    });
    // What the JSON shape holds and the file cannot: the road, police, and
    // fire budget effects and the last spend are recomputed at the next
    // budget; the city centre is recomputed at the next map scan.
    return { saveData, warnings: DECODE_LOSSES.slice() };
  }

  window.AISystem6MicropolisCtyCodec = Object.freeze({
    WIDTH, HEIGHT, FILE_SIZE, MAP_OFFSET, HISTORY, MISC, MISC_INDEX, CITY_CLASSES,
    DECODE_LOSSES, ENCODE_LOSSES,
    looksLikeCty, encodeCty, decodeCty,
  });
})();
