// Pot World / 盆地 — the one world Bonsai City, Rootline and Joyride share.
//
// A Bonsai City save is a pot; Rootline plans the roots under it and Joyride
// drives its streets. This file holds what the three agree on, so a station,
// a date or a street has one name wherever it is seen: the naming tables, the
// pot calendar, the hour curves, the land-use pictograms, the money format,
// the hand-over from the mayor's view to the street, and the letterbox.
//
// Everything above the SIDE EFFECTS fence near the end is pure: it reads only
// its arguments, never the wall clock, a global random source, the page, the
// locale or the translation tables, and every hash is FNV-1a 32 exactly as
// Rootline seeds its cities. Snapshots and states passed in are read, never
// written; results are plain data (functions aside). The letterbox below the
// fence is the only part with side effects: two browser-storage keys, each
// access wrapped. Nothing here opens the database or touches a city save.
//
// Canon and API v1: internal/plans/BASIN-WORLD.zh-CN.md (「世界核心 API v1」).
// Contract: tests/features/pot-world.test.mjs. Bump CANON_VERSION when a
// shared table changes what an existing pot is called.
(function installPotWorld(root) {
  "use strict";

  const CANON_VERSION = 2;
  const WORLD = Object.freeze({ id: "basin" });
  const TAU = Math.PI * 2;

  // ----- determinism primitives ---------------------------------------------

  // FNV-1a 32 over String(value); never 0 (Rootline's seedFrom, unchanged).
  function hash32(value) {
    const text = String(value);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  }

  function hex32(value) {
    return (value >>> 0).toString(16).padStart(8, "0");
  }

  // mulberry32, as a closure over its own seed.
  function stream(seed) {
    let state = seed >>> 0;
    return function next() {
      let t = (state = (state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bonsai City's lattice hash (bonsai-city-sim.js latticeInt), so the rim
  // roads name the same neighbours the city's Neighbours window lists.
  function latticeInt(x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 962287)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // sorted-json-v1: the canonical text the Bonsai save integrity hashes.
  function canonicalJson(value) {
    if (value === null) return "null";
    const kind = typeof value;
    if (kind === "number") {
      if (!Number.isFinite(value)) throw new Error("pot-world-canonical-non-finite");
      return String(value);
    }
    if (kind === "boolean") return value ? "true" : "false";
    if (kind === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (kind === "object") {
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    throw new Error("pot-world-canonical-unsupported");
  }

  // A deep copy that keeps typed arrays typed (a render snapshot is mostly
  // Uint8Array layers) and shares nothing with the source.
  function cloneData(value) {
    if (value === null || typeof value !== "object") return value;
    if (ArrayBuffer.isView(value)) return value.slice();
    if (Array.isArray(value)) return value.map(cloneData);
    const out = {};
    for (const key of Object.keys(value)) out[key] = cloneData(value[key]);
    return out;
  }

  const isText = (value) => typeof value === "string";
  const isPair = (value) => Boolean(value) && isText(value.zh) && isText(value.en);
  const isInt = Number.isInteger;

  // ----- names ----------------------------------------------------------------

  // City names: Rootline's head and tail tables, moved here unchanged, so a
  // Rootline city keeps its name. The argument is whatever Rootline passes
  // (its uint32 seed): a Bonsai City save whose integer seed is s carries the
  // name names.city(hash32(s)), the name Rootline gives a game seeded with s.
  const NAME_HEADS = [["青", "Qing"], ["柳", "Liu"], ["石", "Shi"], ["松", "Song"], ["白", "Bai"], ["鹤", "He"], ["枫", "Feng"], ["渔", "Yu"], ["桐", "Tong"], ["兰", "Lan"], ["云", "Yun"], ["梅", "Mei"], ["苇", "Wei"], ["榕", "Rong"]];
  const NAME_TAILS = [["湾", "wan"], ["汀", "ting"], ["川", "chuan"], ["原", "yuan"], ["港", "gang"], ["桥", "qiao"], ["岭", "ling"], ["门", "men"], ["洲", "zhou"], ["浦", "pu"], ["溪", "xi"], ["陵", "ling"]];

  function cityName(seed) {
    const h = hash32(`name:${seed}`);
    const head = NAME_HEADS[h % NAME_HEADS.length];
    const tail = NAME_TAILS[Math.floor(h / NAME_HEADS.length) % NAME_TAILS.length];
    return { zh: `${head[0]}${tail[0]}`, en: `${head[1]}${tail[1]}` };
  }

  // Bonsai City's twelve neighbours are the neighbouring pots. Chinese as
  // bonsai-translations.js has them; English is the pinyin (place names are
  // not translated).
  const NEIGHBORS = Object.freeze([
    ["枫溪", "Fengxi"], ["石桥", "Shiqiao"], ["晴港", "Qinggang"], ["风泽", "Fengze"],
    ["橡树谷", "Xiangshugu"], ["银盆", "Yinpen"], ["北原", "Beiyuan"], ["绿水", "Lüshui"],
    ["灰埠", "Huibu"], ["云栖", "Yunqi"], ["铁谷", "Tiegu"], ["夏栎", "Xiali"],
  ].map((pair) => Object.freeze(pair)));
  const RIM_DIRECTIONS = Object.freeze(["n", "e", "s", "w"]);

  function neighbor(citySeed, dir, nameIndex) {
    if (!RIM_DIRECTIONS.includes(dir) || !isInt(nameIndex)) return null;
    const pair = NEIGHBORS[((nameIndex % NEIGHBORS.length) + NEIGHBORS.length) % NEIGHBORS.length];
    return { zh: pair[0], en: pair[1], seed: `nb:${citySeed}:${dir}` };
  }

  // The neighbour on each side, chosen the way neighborsReport chooses it
  // (north, east, south, west; a taken name moves to the next).
  function rimNeighbors(seed) {
    const taken = new Set();
    const out = {};
    RIM_DIRECTIONS.forEach((dir, index) => {
      let nameIndex = latticeInt(index + 1, 23, seed) % NEIGHBORS.length;
      while (taken.has(nameIndex)) nameIndex = (nameIndex + 1) % NEIGHBORS.length;
      taken.add(nameIndex);
      out[dir] = NEIGHBORS[nameIndex];
    });
    return out;
  }

  // ----- the pot's seal ---------------------------------------------------------

  // A 16x16 one-bit seal per pot: a frame, then a left-right mirrored field
  // drawn from the pot's id and name. 1 = ink.
  function sealBits(cityId, name) {
    const bits = new Uint8Array(256);
    const next = stream(hash32(`seal:${cityId ?? ""}:${name ?? ""}`));
    for (let i = 0; i < 16; i += 1) {
      bits[i] = 1;
      bits[240 + i] = 1;
      bits[i * 16] = 1;
      bits[i * 16 + 15] = 1;
    }
    for (let y = 2; y <= 13; y += 1) {
      for (let x = 2; x <= 7; x += 1) {
        const ink = next() < 0.5 ? 1 : 0;
        bits[y * 16 + x] = ink;
        bits[y * 16 + (15 - x)] = ink;
      }
    }
    return bits;
  }

  // ----- city reference -----------------------------------------------------------

  // Who a city is: the save record's id is the pot's identity; the name is the
  // record's (the one the mayor sees), else the state's, else "" for the shell
  // to fill with its own wording.
  function cityRef(record, state) {
    const cityId = isText(record?.id) && record.id ? record.id : null;
    const name = isText(record?.name) && record.name ? record.name : isText(state?.name) ? state.name : "";
    const source = state?.provenance?.source === "openstreetmap" ? "osm"
      : state?.scenario ? "scenario"
        : cityId && cityId.startsWith("example-") ? "example"
          : "save";
    return {
      cityId,
      name,
      seed: isInt(state?.seed) ? state.seed : null,
      size: isInt(state?.size) ? state.size : null,
      tick: isInt(state?.tick) ? state.tick : 0,
      source,
    };
  }

  // ----- calendar -------------------------------------------------------------------

  // The pot calendar is Bonsai City's: 5 ticks a day, 25 days a month, 12
  // months a year. Weeks run on without a break from one epoch shared by
  // every pot, 1900-01-01, a Monday. Two solar terms a month: days 1-13 and
  // 14-25. Seasons are numbered as the Bonsai shell stamps its snapshots:
  // 0 spring (from March), 1 summer, 2 autumn, 3 winter.
  const TICKS_PER_DAY = 5;
  const DAYS_PER_MONTH = 25;
  const MONTHS_PER_YEAR = 12;
  const EPOCH_YEAR = 1900;
  const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
  const SEASON_OF_MONTH = Object.freeze([3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3]);
  const TERMS = Object.freeze([
    ["小寒", "Minor Cold"], ["大寒", "Major Cold"], ["立春", "Start of Spring"], ["雨水", "Rain Water"],
    ["惊蛰", "Awakening of Insects"], ["春分", "Spring Equinox"], ["清明", "Clear and Bright"], ["谷雨", "Grain Rain"],
    ["立夏", "Start of Summer"], ["小满", "Grain Buds"], ["芒种", "Grain in Ear"], ["夏至", "Summer Solstice"],
    ["小暑", "Minor Heat"], ["大暑", "Major Heat"], ["立秋", "Start of Autumn"], ["处暑", "End of Heat"],
    ["白露", "White Dew"], ["秋分", "Autumn Equinox"], ["寒露", "Cold Dew"], ["霜降", "Frost's Descent"],
    ["立冬", "Start of Winter"], ["小雪", "Minor Snow"], ["大雪", "Major Snow"], ["冬至", "Winter Solstice"],
  ].map((pair) => Object.freeze(pair)));

  // Same year, month and day as bonsai-city-sim dateOf for the same state.
  function dateOfTick(tick, yearFounded = EPOCH_YEAR) {
    const founded = isInt(yearFounded) ? yearFounded : EPOCH_YEAR;
    const days = Math.floor(tick / TICKS_PER_DAY);
    const months = Math.floor(days / DAYS_PER_MONTH);
    const day = (days % DAYS_PER_MONTH) + 1;
    const month = months % MONTHS_PER_YEAR;
    const year = founded + Math.floor(months / MONTHS_PER_YEAR);
    const dayIndex = (year - EPOCH_YEAR) * DAYS_PER_YEAR + month * DAYS_PER_MONTH + (day - 1);
    return {
      year,
      month,
      day,
      dayIndex,
      weekday: ((dayIndex % 7) + 7) % 7,
      term: month * 2 + (day >= 14 ? 1 : 0),
      season: SEASON_OF_MONTH[month],
    };
  }

  // ----- hours ------------------------------------------------------------------------
  //
  // One day's rhythm for the whole world, moved out of rootline-core.js
  // unchanged (Rootline's replay hashes depend on every bit of it).

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

  // Cars on the road, as a multiple of an ordinary afternoon: two peaks,
  // 08:00 and 18:00, on the same waking curve. Range about 0.1 (the dead of
  // night: 0.2 x 0.5) to 1.25 (18:00: 1 x (0.5 + 0.75)).
  function roadTraffic(hour) {
    return activity(hour) * (0.5 + 0.55 * bump(hour, 8, 1.5) + 0.75 * bump(hour, 18, 1.6));
  }

  // ----- land use ---------------------------------------------------------------------
  //
  // Shapes say land use; colours say lines. Rootline's eight kinds, which are
  // Bonsai City's zones and facilities, drawn as 1-bit pictograms.

  const KINDS = Object.freeze(["residential", "commercial", "industrial", "school", "hospital", "stadium", "airport", "port"]);
  // Bonsai City ZONE: 1 R, 2 C, 3 I, 5 airport, 6 seaport (4, military, has no kind).
  const ZONE_KINDS = Object.freeze({ 1: "residential", 2: "commercial", 3: "industrial", 5: "airport", 6: "port" });
  const FACILITY_KINDS = Object.freeze({ school: "school", university: "school", hospital: "hospital", clinic: "hospital", stadium: "stadium" });

  function kindOfZone(zone) {
    return ZONE_KINDS[zone] || null;
  }

  function kindOfFacility(kind) {
    return FACILITY_KINDS[kind] || null;
  }

  // The destination kinds are Bonsai City's land uses and facilities (spec
  // D2), drawn as 1-bit pictograms in a [-1, 1] box. Stations wear their own
  // kind; a waiting passenger wears the kind it is going to.
  function drawGlyph(ctx, kind, x, y, size, color, filled = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.22;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const fillOrStroke = () => (filled ? ctx.fill() : ctx.stroke());
    ctx.beginPath();
    switch (kind) {
      case "residential":
        ctx.moveTo(-0.85, -0.05); ctx.lineTo(0, -0.9); ctx.lineTo(0.85, -0.05); ctx.lineTo(0.62, -0.05);
        ctx.lineTo(0.62, 0.85); ctx.lineTo(-0.62, 0.85); ctx.lineTo(-0.62, -0.05); ctx.closePath();
        fillOrStroke();
        break;
      case "commercial":
        ctx.moveTo(-0.72, -0.35); ctx.lineTo(0.72, -0.35); ctx.lineTo(0.62, 0.85); ctx.lineTo(-0.62, 0.85); ctx.closePath();
        fillOrStroke();
        ctx.beginPath();
        ctx.arc(0, -0.35, 0.38, Math.PI, 0);
        ctx.lineWidth = 0.2;
        ctx.stroke();
        break;
      case "industrial":
        ctx.moveTo(-0.9, 0.85); ctx.lineTo(-0.9, -0.1); ctx.lineTo(-0.45, -0.45); ctx.lineTo(-0.45, -0.1); ctx.lineTo(0, -0.45);
        ctx.lineTo(0, -0.1); ctx.lineTo(0.35, -0.4); ctx.lineTo(0.35, -0.95); ctx.lineTo(0.75, -0.95); ctx.lineTo(0.75, 0.85); ctx.closePath();
        fillOrStroke();
        break;
      case "school":
        ctx.moveTo(-0.95, -0.2); ctx.lineTo(0, -0.7); ctx.lineTo(0.95, -0.2); ctx.lineTo(0, 0.3); ctx.closePath();
        fillOrStroke();
        ctx.beginPath();
        ctx.moveTo(-0.55, 0.05); ctx.lineTo(-0.55, 0.55); ctx.quadraticCurveTo(0, 0.95, 0.55, 0.55); ctx.lineTo(0.55, 0.05);
        ctx.lineWidth = 0.22;
        ctx.stroke();
        break;
      case "hospital":
        ctx.rect(-0.28, -0.85, 0.56, 1.7); ctx.rect(-0.85, -0.28, 1.7, 0.56);
        fillOrStroke();
        break;
      case "stadium":
        ctx.ellipse(0, 0, 0.92, 0.62, 0, 0, TAU);
        ctx.lineWidth = 0.34;
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(-0.38, -0.2, 0.76, 0.4);
        fillOrStroke();
        break;
      case "airport":
        ctx.moveTo(0, -0.95); ctx.lineTo(0.14, -0.3); ctx.lineTo(0.95, 0.1); ctx.lineTo(0.95, 0.28); ctx.lineTo(0.14, 0.12);
        ctx.lineTo(0.1, 0.62); ctx.lineTo(0.35, 0.85); ctx.lineTo(-0.35, 0.85); ctx.lineTo(-0.1, 0.62); ctx.lineTo(-0.14, 0.12);
        ctx.lineTo(-0.95, 0.28); ctx.lineTo(-0.95, 0.1); ctx.lineTo(-0.14, -0.3); ctx.closePath();
        fillOrStroke();
        break;
      case "port":
        ctx.lineWidth = 0.24;
        ctx.arc(0, -0.62, 0.22, 0, TAU);
        ctx.moveTo(0, -0.4); ctx.lineTo(0, 0.85);
        ctx.moveTo(-0.45, -0.18); ctx.lineTo(0.45, -0.18);
        ctx.moveTo(-0.8, 0.25); ctx.quadraticCurveTo(-0.6, 0.85, 0, 0.85); ctx.quadraticCurveTo(0.6, 0.85, 0.8, 0.25);
        ctx.stroke();
        break;
      default:
        ctx.arc(0, 0, 0.7, 0, TAU);
        fillOrStroke();
    }
    ctx.restore();
  }

  // ----- money and sound ----------------------------------------------------------------

  // Thousands with commas, whatever the locale; the unit (world_money) is the
  // shell's string.
  function group(n) {
    const value = Math.round(Number(n) || 0);
    const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return value < 0 ? `-${digits}` : digits;
  }

  // One key per pot: a tonic 0-11 from the seed, and Rootline's C pentatonic
  // (C5 D5 E5 G5 A5 C6 D6) moved to it, between six semitones down and five up.
  const PITCHES = Object.freeze([523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66]);

  function keyOf(seed) {
    return hash32(`key:${seed}`) % 12;
  }

  function pentatonic(tonic) {
    const key = ((Math.trunc(Number(tonic) || 0) % 12) + 12) % 12;
    const ratio = 2 ** ((key >= 6 ? key - 12 : key) / 12);
    return PITCHES.map((pitch) => Math.round(pitch * ratio * 100) / 100);
  }

  // ----- gazetteer --------------------------------------------------------------------
  //
  // Every pot is cut into 4x4 districts. A district's name is a head drawn
  // from 24 plant and stone characters (shuffled by seed, none repeated in a
  // pot) and a tail set by the ground: water, hill or flat. The tails share
  // no character with the city-name tails, and the heads share no syllable
  // with the city-name heads or the neighbours' first syllables, so a
  // district never takes the name of a city or a neighbour in either
  // language. Names depend on the seed and the water and height layers only:
  // building, zoning and roads never rename a district; levelling land may.

  const DISTRICT_HEADS = Object.freeze([
    ["竹", "Zhu"], ["菊", "Ju"], ["桂", "Gui"], ["桃", "Tao"], ["杏", "Xing"], ["槐", "Huai"],
    ["樟", "Zhang"], ["桑", "Sang"], ["茶", "Cha"], ["蒲", "Pu"], ["苔", "Tai"], ["杉", "Shan"],
    ["楠", "Nan"], ["芦", "Lu"], ["棠", "Tang"], ["椿", "Chun"], ["莲", "Lian"], ["葵", "Kui"],
    ["砚", "Yan"], ["磐", "Pan"], ["矶", "Ji"], ["砂", "Sha"], ["碧", "Bi"], ["琅", "Lang"],
  ].map((pair) => Object.freeze(pair)));
  const DISTRICT_TAILS = Object.freeze({
    water: Object.freeze([["塘", "tang"], ["埠", "bu"], ["渡", "du"], ["湄", "mei"]]),
    hill: Object.freeze([["坡", "po"], ["坪", "ping"], ["冈", "gang"]]),
    flat: Object.freeze([["坊", "fang"], ["里", "li"], ["园", "yuan"], ["巷", "xiang"], ["营", "ying"], ["庄", "zhuang"]]),
  });
  // A district reads as waterside from 15% water, as hill from a mean land
  // height of 5 (generated flat land sits at 2-3, mountains reach 10).
  const WATERSIDE_SHARE = 0.15;
  const HILL_HEIGHT = 5;
  // Streets are numbered in bands of four tiles, by position, so a new road
  // never renames an old one. The rim band is the last band before an edge.
  const STREET_BAND = 4;
  const RIM_BAND = STREET_BAND;
  const NUMERALS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const STREET_SUFFIX = Object.freeze({
    ew: ["路", "Road"],
    ns: ["街", "Street"],
    highway: ["快速路", "Expressway"],
    avenue: ["大道", "Avenue"],
  });
  const STATION_SUFFIX = Object.freeze({ station: ["站", "Station"], "subway-station": ["地铁站", "Metro"], "bus-stop": ["站", "Stop"] });
  const STATION_SIZE = Object.freeze({ station: 2, "subway-station": 1 });
  const LANDMARKS = Object.freeze({ hospital: ["医院", "Hospital"], clinic: ["医院", "Hospital"], school: ["学校", "School"], university: ["大学", "University"] });

  function ordinal(n) {
    const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
    return `${n}${tail}`;
  }

  function gazetteer(snapshot) {
    const size = isInt(snapshot?.size) && snapshot.size > 0 ? snapshot.size : 0;
    const seed = isInt(snapshot?.seed) ? snapshot.seed : 0;
    const layer = (name) => snapshot?.[name] || null;
    // Water and height are read once, below; the road layers are read on
    // every query, so they are copied: a gazetteer names the snapshot as it
    // stood when asked, even after the live city lays more road.
    const copy = (name) => {
      const value = layer(name);
      return value && typeof value.slice === "function" ? value.slice() : null;
    };
    const water = layer("water");
    const alt = layer("alt");
    const road = copy("road");
    const highway = copy("highway");
    const avenue = copy("avenue");
    const inside = (x, y) => isInt(x) && isInt(y) && x >= 0 && y >= 0 && x < size && y < size;
    const wet = (x, y) => inside(x, y) && Boolean(water?.[y * size + x]);
    const street = (x, y) => inside(x, y) && Boolean(road?.[y * size + x] || highway?.[y * size + x]);

    // Districts.
    const bounds = [0, 1, 2, 3, 4].map((g) => Math.floor((g * size) / 4));
    const order = DISTRICT_HEADS.map((_, i) => i);
    const shuffle = stream(hash32(`districts:${seed}`));
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(shuffle() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const districts = [];
    for (let gy = 0; gy < 4; gy += 1) {
      for (let gx = 0; gx < 4; gx += 1) {
        const x0 = bounds[gx];
        const y0 = bounds[gy];
        const x1 = bounds[gx + 1] - 1;
        const y1 = bounds[gy + 1] - 1;
        let wetTiles = 0;
        let landTiles = 0;
        let height = 0;
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            if (wet(x, y)) wetTiles += 1;
            else {
              landTiles += 1;
              height += Number(alt?.[y * size + x]) || 0;
            }
          }
        }
        const tiles = wetTiles + landTiles;
        const terrain = tiles && wetTiles / tiles >= WATERSIDE_SHARE ? "water"
          : landTiles && height / landTiles >= HILL_HEIGHT ? "hill"
            : "flat";
        const id = `d${gx}${gy}`;
        const head = DISTRICT_HEADS[order[gy * 4 + gx]];
        const tails = DISTRICT_TAILS[terrain];
        const tail = tails[hash32(`district:${seed}:${id}`) % tails.length];
        districts.push({ id, gx, gy, x0, y0, x1, y1, zh: `${head[0]}${tail[0]}`, en: `${head[1]}${tail[1]}`, terrain });
      }
    }

    function districtAt(x, y) {
      if (!inside(x, y)) return null;
      let gx = 0;
      let gy = 0;
      while (gx < 3 && x >= bounds[gx + 1]) gx += 1;
      while (gy < 3 && y >= bounds[gy + 1]) gy += 1;
      return districts[gy * 4 + gx];
    }

    // Streets. East-west is a road (路), north-south a street (街). A
    // street's name depends on its tile's position and axis only: inside the
    // rim band -- the last RIM_BAND tiles before an edge, counted along the
    // street's own axis -- it leads out of the pot and takes the name of the
    // neighbour beyond that edge; elsewhere it is the district's, numbered
    // by its band of four tiles inside the district. No other tile is read,
    // so extending, breaking or joining a road renames no tile already laid.
    //
    // The axis is the heading given. Without one it is read from the tile's
    // four neighbours, the way the road runs there, and a crossing reads as
    // the road (路). That reading is the one thing other tiles decide: when a
    // street's end becomes a crossing, a bare query at that tile reports the
    // crossing road, while the street, asked with its heading, keeps its name
    // on every tile.
    const rims = rimNeighbors(seed);

    function rimOf(x, y, axis) {
      const along = axis === "ew" ? x : y;
      if (along < RIM_BAND) return axis === "ew" ? "w" : "n";
      if (along >= size - RIM_BAND) return axis === "ew" ? "e" : "s";
      return null;
    }

    function streetAt(x, y, heading) {
      if (!street(x, y)) return null;
      const av = avenue?.[y * size + x];
      if (av) {
        // BRT's avenue: the two tiles of the corridor name as one. The axis is
        // the value's own (2/8 run east-west, 1/4 north-south) and the name
        // comes from the half whose coordinate is smaller across the avenue,
        // so both halves match whatever way they are asked.
        const axis = av === 1 || av === 4 ? "ns" : "ew";
        const name = (nx, ny) => {
          const district = districtAt(nx, ny) || districts[0];
          const rim = rimOf(nx, ny, axis);
          if (rim) {
            const [zh, en] = rims[rim];
            return { key: `rim:${rim}:${axis}:avenue:${axis === "ew" ? ny : nx}`, zh: `${zh}${STREET_SUFFIX.avenue[0]}`, en: `${en} ${STREET_SUFFIX.avenue[1]}`, axis, districtId: district.id };
          }
          const band = Math.floor((axis === "ew" ? ny - district.y0 : nx - district.x0) / STREET_BAND) + 1;
          return {
            key: `${district.id}:${axis}:${band}:avenue`,
            zh: `${district.zh}${NUMERALS[band] || band}${STREET_SUFFIX.avenue[0]}`,
            en: `${district.en} ${ordinal(band)} ${STREET_SUFFIX.avenue[1]}`,
            axis,
            districtId: district.id,
          };
        };
        // The partner half lies on the driver's left: a westbound (8) half is
        // the north one, its partner south; an eastbound (2) half's partner is
        // north (y - 1). A southbound (4) half is the west one; a northbound
        // (1) half's partner is west (x - 1). Name from the smaller one.
        if (axis === "ew") return name(x, av === 2 ? y - 1 : y);
        return name(av === 1 ? x - 1 : x, y);
      }
      let axis;
      if (heading === "ew" || heading === "e" || heading === "w") axis = "ew";
      else if (heading === "ns" || heading === "n" || heading === "s") axis = "ns";
      else {
        const across = Number(street(x - 1, y)) + Number(street(x + 1, y));
        const down = Number(street(x, y - 1)) + Number(street(x, y + 1));
        axis = down > across ? "ns" : "ew";
      }
      const fast = !road?.[y * size + x];
      const suffix = fast ? STREET_SUFFIX.highway : STREET_SUFFIX[axis];
      const district = districtAt(x, y);
      const rim = rimOf(x, y, axis);
      if (rim) {
        const [zh, en] = rims[rim];
        return { key: `rim:${rim}:${axis}:${axis === "ew" ? y : x}${fast ? ":hw" : ""}`, zh: `${zh}${suffix[0]}`, en: `${en} ${suffix[1]}`, axis, districtId: district.id };
      }
      const band = Math.floor((axis === "ew" ? y - district.y0 : x - district.x0) / STREET_BAND) + 1;
      return {
        key: `${district.id}:${axis}:${band}${fast ? ":hw" : ""}`,
        zh: `${district.zh}${NUMERALS[band] || band}${suffix[0]}`,
        en: `${district.en} ${ordinal(band)} ${suffix[1]}`,
        axis,
        districtId: district.id,
      };
    }

    // A lot's address: the street it fronts and a number along it; the north
    // side of a road and the west side of a street take the odd numbers. A
    // street tile is addressed on its own street.
    function addressOf(x, y) {
      if (!inside(x, y)) return null;
      if (street(x, y)) {
        const own = streetAt(x, y);
        return { streetKey: own.key, zh: own.zh, en: own.en, number: 2 * (own.axis === "ew" ? x : y) + 1 };
      }
      const fronts = [[0, 1, "ew", 1], [1, 0, "ns", 1], [0, -1, "ew", 2], [-1, 0, "ns", 2]];
      for (const [dx, dy, axis, parity] of fronts) {
        if (!street(x + dx, y + dy)) continue;
        const front = streetAt(x + dx, y + dy, axis);
        return { streetKey: front.key, zh: front.zh, en: front.en, number: 2 * (axis === "ew" ? x : y) + parity };
      }
      return null;
    }

    // Stations: "district + 站" (or 地铁站). A later station that would repeat
    // a name takes the hospital or school beside it, then a number. A name
    // reads only what was fixed when the station was built: the stations
    // before it -- ordered by builtTick (missing counts as 0), then y, then
    // x -- and the landmarks built in an earlier tick. Roads carry no build
    // time, so the street at a station's door is not a candidate: a road laid
    // later could otherwise rename it. Building never renames a standing
    // station; demolishing one it was named against may, and a name stored
    // with a line's identity wins over this one. Two stations built in the
    // same tick are ordered by position. A planned station passes the tick
    // it would be built (Infinity for "after everything standing").
    const facilities = Array.isArray(snapshot?.facilities) ? snapshot.facilities : [];
    const footprint = (item) => ({
      w: item.footprint?.w || item.w || STATION_SIZE[item.kind] || 1,
      h: item.footprint?.h || item.h || STATION_SIZE[item.kind] || 1,
    });
    const tickOf = (item) => (typeof item?.builtTick === "number" && !Number.isNaN(item.builtTick) ? item.builtTick : 0);
    const earlier = (a, b) => {
      const ta = tickOf(a);
      const tb = tickOf(b);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.y - b.y || a.x - b.x;
    };
    const standing = facilities.filter((item) => STATION_SUFFIX[item.kind] && isInt(item.x) && isInt(item.y)).slice().sort(earlier);
    const landmarks = facilities.filter((item) => LANDMARKS[item.kind] && isInt(item.x) && isInt(item.y)).slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const named = new Map();
    const stationKey = (item) => `${item.kind}:${item.x},${item.y}`;

    function nameStation(item, taken) {
      const kind = STATION_SUFFIX[item.kind] ? item.kind : "station";
      const [suffixZh, suffixEn] = STATION_SUFFIX[kind];
      const district = districtAt(item.x, item.y) || districts[0];
      const { w, h } = footprint({ ...item, kind });
      const candidates = [[`${district.zh}${suffixZh}`, `${district.en} ${suffixEn}`]];
      const beside = landmarks.find((other) => {
        if (tickOf(other) >= tickOf(item)) return false;
        const size2 = footprint(other);
        return other.x <= item.x + w && other.x + size2.w >= item.x && other.y <= item.y + h && other.y + size2.h >= item.y;
      });
      if (beside) {
        const [zh, en] = LANDMARKS[beside.kind];
        candidates.push([`${district.zh}${zh}${suffixZh}`, `${district.en} ${en} ${suffixEn}`]);
      }
      for (const [zh, en] of candidates) if (!taken.has(zh)) return { zh, en };
      for (let n = 2; ; n += 1) {
        const zh = `${district.zh}${n}号${suffixZh}`;
        if (!taken.has(zh)) return { zh, en: `${district.en} ${suffixEn} ${n}` };
      }
    }

    {
      const taken = new Set();
      for (const item of standing) {
        const key = stationKey(item);
        if (named.has(key)) continue;
        const name = nameStation(item, taken);
        named.set(key, name);
        taken.add(name.zh);
      }
    }

    function stationName(item) {
      if (!item || !inside(item.x, item.y)) return null;
      const kind = STATION_SUFFIX[item.kind] ? item.kind : "station";
      const known = named.get(stationKey({ ...item, kind }));
      if (known) return { ...known };
      const query = { ...item, kind, builtTick: tickOf(item) };
      const taken = new Set(standing.filter((other) => earlier(other, query) < 0).map((other) => named.get(stationKey(other)).zh));
      return nameStation(query, taken);
    }

    // The angler: the shore tile nearest the city centre (ties to the
    // north, then the west); null when the pot has no water and he sits on
    // the rim.
    let anglerSpot = null;
    if (size) {
      const cx = Number.isFinite(snapshot?.spawnCenter?.x) ? snapshot.spawnCenter.x : size / 2;
      const cy = Number.isFinite(snapshot?.spawnCenter?.y) ? snapshot.spawnCenter.y : size / 2;
      let best = Infinity;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (wet(x, y) || !(wet(x - 1, y) || wet(x + 1, y) || wet(x, y - 1) || wet(x, y + 1))) continue;
          const d = (x - cx) ** 2 + (y - cy) ** 2;
          if (d < best) {
            best = d;
            anglerSpot = { x, y };
          }
        }
      }
    }

    // A stop on a street (the bus-stop's address). Groups are resolved by the
    // caller, so only the street itself is read here: at a crossing the stop
    // takes the corner it stands on (本路横街口 / Road & Street); elsewhere its
    // number along the street. Deterministic: the same tile gives the same name.
    function stopName({ x, y, group } = {}) {
      void group;
      if (!inside(x, y) || !street(x, y)) return null;
      const own = streetAt(x, y);
      const crossing = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([dx, dy]) => {
        if (!street(x + dx, y + dy)) return false;
        const other = streetAt(x + dx, y + dy);
        return other.axis !== own.axis && other.zh !== own.zh;
      });
      if (crossing) {
        const other = streetAt(x + crossing[0], y + crossing[1]);
        return { zh: `${own.zh}${other.zh}口`, en: `${own.en} & ${other.en}` };
      }
      const address = addressOf(x, y);
      if (!address) return { zh: `${own.zh}站`, en: `${own.en} Stop` };
      return { zh: `${own.zh}${address.number}号`, en: `${address.number} ${own.en}` };
    }

    return { districts, districtAt, streetAt, addressOf, stationName, anglerSpot, stopName };
  }

  // ----- people -------------------------------------------------------------------------
  //
  // People come from buildings: an occupied building's residents and jobs
  // (the caller scales them by the hour curves); an abandoned one, or one
  // still going up, holds nobody. A household is "anchor tile:variant" of a
  // home, so a demolished home is a household that has moved.

  const OCCUPIED = new Set([3, 4, 6]); // BUILDING_STATE ACTIVE, DECLINING, RECOVERING
  const ZONE_R = 1;

  function occupiedBuildings(snapshot) {
    return (Array.isArray(snapshot?.buildings) ? snapshot.buildings : []).filter((b) => b && OCCUPIED.has(b.state) && isInt(b.x) && isInt(b.y));
  }

  function atTile(snapshot, x, y, r = 0) {
    let residents = 0;
    let jobs = 0;
    for (const b of occupiedBuildings(snapshot)) {
      const w = b.w || 1;
      const h = b.h || 1;
      const gap = Math.max(b.x - x, x - (b.x + w - 1), b.y - y, y - (b.y + h - 1), 0);
      if (gap > r) continue;
      if (b.zone === ZONE_R) residents += Number(b.population) || 0;
      jobs += Number(b.jobs) || 0;
    }
    return { residents, jobs };
  }

  function households(snapshot) {
    const size = snapshot?.size || 0;
    return occupiedBuildings(snapshot)
      .filter((b) => b.zone === ZONE_R && (Number(b.population) || 0) > 0)
      .map((b) => ({ id: `${b.y * size + b.x}:${b.variant ?? 0}`, x: b.x, y: b.y, residents: Number(b.population) || 0 }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function homeFor(snapshot, salt) {
    const homes = households(snapshot);
    if (!homes.length) return null;
    return homes[hash32(`home:${snapshot.seed ?? 0}:${salt}`) % homes.length];
  }

  // ----- transit plans and laid lines -----------------------------------------------------

  const PLAN_FORMAT = "bonsai-transit-plan";
  const LINE_COLORS = 7;
  const STATION_KINDS = Object.freeze(["subway-station", "station", "bus-stop"]);
  const isTiles = (tiles) => Array.isArray(tiles) && tiles.length % 2 === 0 && tiles.every(isInt);
  const TRANSIT_LINE_MODES = ["metro", "brt", "bus"];
  const BUS_NUMBERS_MIN = 11;
  const BUS_NUMBERS_MAX = 16;
  const modeOfLine = (line) => (TRANSIT_LINE_MODES.includes(line?.mode) ? line.mode : "metro");
  const isOptionalGroup = (value) => value === undefined || isText(value);

  // Structure only; the digest is checked by comparing digest(plan) with
  // plan.integrity.digest (it is asynchronous).
  function validatePlan(plan) {
    const errors = [];
    if (!plan || typeof plan !== "object") return { ok: false, errors: ["plan"] };
    if (plan.format !== PLAN_FORMAT) errors.push("format");
    if (plan.formatVersion !== 1) errors.push("formatVersion");
    const source = plan.source;
    if (!source || !(source.cityId === null || isText(source.cityId)) || !isInt(source.seed) || !isInt(source.size) || !isInt(source.tick) || !isText(source.fingerprint)) errors.push("source");
    const stations = Array.isArray(plan.stations) ? plan.stations : null;
    if (!stations) errors.push("stations");
    const ids = new Set();
    for (const s of stations || []) {
      if (!s || !isText(s.id) || ids.has(s.id) || !isInt(s.x) || !isInt(s.y) || !STATION_KINDS.includes(s.kind) || !isPair(s.name) || typeof s.existing !== "boolean" || !isOptionalGroup(s.group)) errors.push(`station:${s?.id ?? "?"}`);
      else ids.add(s.id);
    }
    if (!Array.isArray(plan.lines)) errors.push("lines");
    for (const line of Array.isArray(plan.lines) ? plan.lines : []) {
      const mode = modeOfLine(line);
      const stops = Array.isArray(line?.stops) ? line.stops : null;
      const legs = Array.isArray(line?.legs) ? line.legs : null;
      // metro and brt carry a palette colour; a bus is uncoloured and takes a
      // route number instead. Old lines without a mode are metro, exactly as before.
      const paintOk = mode === "bus"
        ? line?.color === null && isInt(line?.number) && line.number >= BUS_NUMBERS_MIN && line.number <= BUS_NUMBERS_MAX
        : isInt(line?.color) && line.color >= 0 && line.color < LINE_COLORS;
      const vehiclesOk = line?.vehicles === undefined || (isInt(line.vehicles) && line.vehicles >= 1 && line.vehicles <= 6);
      if (!line || !isText(line.id) || !isPair(line.name) || !(line.mode === undefined || (isText(line.mode) && TRANSIT_LINE_MODES.includes(line.mode)))
        || !paintOk || !vehiclesOk
        || !stops || stops.length < 2 || !stops.every((id) => ids.has(id))
        || !legs || legs.length !== stops.length - 1 || !legs.every((leg) => isTiles(leg?.tiles) && Array.isArray(leg.water) && leg.water.every(isInt))
        || (mode === "metro" && (stations || []).some((s) => s.kind === "bus-stop" && stops.includes(s.id)))) {
        errors.push(`line:${line?.id ?? "?"}`);
      }
    }
    const integrity = plan.integrity;
    if (integrity !== undefined && (!integrity || integrity.algorithm !== "SHA-256" || integrity.canonicalization !== "sorted-json-v1" || !/^[0-9a-f]{64}$/.test(String(integrity.digest)))) errors.push("integrity");
    return { ok: errors.length === 0, errors };
  }

  // The text the digest covers: the plan without its integrity block.
  function planCanonical(plan) {
    const rest = {};
    for (const key of Object.keys(plan || {})) if (key !== "integrity") rest[key] = plan[key];
    return canonicalJson(rest);
  }

  async function planDigest(plan) {
    const subtle = root.crypto?.subtle;
    if (!subtle || typeof TextEncoder === "undefined") throw new Error("pot-world-crypto-unavailable");
    const bytes = await subtle.digest("SHA-256", new TextEncoder().encode(planCanonical(plan)));
    return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function validateLines(sidecar) {
    const errors = [];
    if (!sidecar || typeof sidecar !== "object") return { ok: false, errors: ["sidecar"] };
    if (sidecar.version !== 1) errors.push("version");
    if (!Array.isArray(sidecar.lines)) errors.push("lines");
    const ids = new Set();
    for (const line of Array.isArray(sidecar.lines) ? sidecar.lines : []) {
      const mode = modeOfLine(line);
      const stations = Array.isArray(line?.stations) ? line.stations : null;
      const paintOk = mode === "bus"
        ? line?.color === null && isInt(line?.number) && line.number >= BUS_NUMBERS_MIN && line.number <= BUS_NUMBERS_MAX
        : isInt(line?.color) && line.color >= 0 && line.color < LINE_COLORS;
      const vehiclesOk = line?.vehicles === undefined || (isInt(line.vehicles) && line.vehicles >= 1 && line.vehicles <= 6);
      if (!line || !isText(line.id) || ids.has(line.id) || !(line.planId === null || isText(line.planId)) || !isPair(line.name)
        || !(line.mode === undefined || (isText(line.mode) && TRANSIT_LINE_MODES.includes(line.mode)))
        || !paintOk || !vehiclesOk || !isTiles(line.tiles) || !isInt(line.laidTick)
        || !stations || !stations.every((s) => s && isInt(s.x) && isInt(s.y) && STATION_KINDS.includes(s.kind) && isPair(s.name) && isOptionalGroup(s.group))
        || (mode === "metro" && stations.some((s) => s.kind === "bus-stop"))) {
        errors.push(`line:${line?.id ?? "?"}`);
      } else ids.add(line.id);
    }
    return { ok: errors.length === 0, errors };
  }

  // A laid line as the save keeps it (payload.transitLines), or null.
  function linesFromState(state) {
    const sidecar = state?.transitLines;
    return sidecar && validateLines(sidecar).ok ? cloneData(sidecar) : null;
  }

  // Does the city still hold what the sidecar says was laid? Every tile rail
  // or subway, every station a facility of its kind covering its tile.
  function checkLines(snapshot, sidecar) {
    const problems = [];
    if (!validateLines(sidecar).ok) return { ok: false, problems: [{ lineId: null, x: null, y: null, what: "sidecar" }] };
    const size = snapshot?.size || 0;
    const facilities = Array.isArray(snapshot?.facilities) ? snapshot.facilities : [];
    for (const line of sidecar.lines) {
      const mode = modeOfLine(line);
      let nearDepot = mode === "metro";
      for (let i = 0; i < line.tiles.length; i += 2) {
        const x = line.tiles[i];
        const y = line.tiles[i + 1];
        if (x < 0 || y < 0 || x >= size || y >= size) problems.push({ lineId: line.id, x, y, what: "bounds" });
        else if (mode === "metro") {
          if (!snapshot.rail?.[y * size + x] && !snapshot.subway?.[y * size + x]) problems.push({ lineId: line.id, x, y, what: "track" });
        } else {
          if (!snapshot.road?.[y * size + x]) problems.push({ lineId: line.id, x, y, what: "road" });
          if (mode === "brt" && !snapshot.avenue?.[y * size + x]) problems.push({ lineId: line.id, x, y, what: "avenue" });
        }
        if (!nearDepot && facilities.some((item) => item.kind === "bus"
          && Math.max(Math.abs((item.x ?? 0) - x), Math.abs((item.y ?? 0) - y)) <= 8)) nearDepot = true;
      }
      for (const s of line.stations) {
        if (s.kind === "bus-stop") {
          if (!snapshot.road?.[s.y * size + s.x]) problems.push({ lineId: line.id, x: s.x, y: s.y, what: "stop" });
          continue;
        }
        const found = facilities.some((item) => {
          if (item.kind !== s.kind) return false;
          const w = item.footprint?.w || item.w || STATION_SIZE[item.kind] || 1;
          const h = item.footprint?.h || item.h || STATION_SIZE[item.kind] || 1;
          return s.x >= item.x && s.x < item.x + w && s.y >= item.y && s.y < item.y + h;
        });
        if (!found) problems.push({ lineId: line.id, x: s.x, y: s.y, what: "station" });
      }
      if (!nearDepot) problems.push({ lineId: line.id, x: line.tiles[0], y: line.tiles[1], what: "depot" });
    }
    return { ok: problems.length === 0, problems };
  }

  // ----- transit modes ------------------------------------------------------------------
  //
  // The three ways Rootline lays a line: the metro under the pot, the BRT along
  // Yichang- and Guangzhou-style avenues (central lanes, central island
  // platforms, a two-tile-wide corridor), and the bus on the streets. The tables
  // are the numbers Joyride, Rootline and Bonsai City share, so a mode reads the
  // same wherever it is seen; the badge is a pictogram in a [-1, 1] box, drawn
  // the way landUse.drawGlyph draws its own.

  const MODE_METRO = Object.freeze({
    id: "metro",
    family: "rail",
    slots: true,
    rootline: Object.freeze({ speed: 118, accel: 150, capacity: 6, carriages: true, boardTicks: 6, minDwellTicks: 18, board: 1.5, alight: 1.5, peakSlowdown: 0 }),
    crossesWater: "tunnel",
    bonsai: Object.freeze({ track: "subway", stop: "subway-station", tech: 1910 }),
    joyride: Object.freeze({ kmh: 55, dwellSeconds: 8, congested: false }),
    map: "octilinear",
  });
  const MODE_BRT = Object.freeze({
    id: "brt",
    family: "road",
    slots: true,
    rootline: Object.freeze({ speed: 88, accel: 130, capacity: 6, carriages: false, boardTicks: 4, minDwellTicks: 14, board: 1.0, alight: 1.2, peakSlowdown: 0 }),
    crossesWater: "bridge",
    bonsai: Object.freeze({ track: "avenue", stop: "bus-stop", tech: 1920 }),
    joyride: Object.freeze({ kmh: 50, dwellSeconds: 6, congested: false }),
    map: "orthogonal-corridor",
  });
  const MODE_BUS = Object.freeze({
    id: "bus",
    family: "road",
    slots: false,
    rootline: Object.freeze({ speed: 66, accel: 120, capacity: 4, carriages: false, boardTicks: 8, minDwellTicks: 18, board: 1.8, alight: 1.5, peakSlowdown: 0.8 }),
    crossesWater: "bridge",
    bonsai: Object.freeze({ track: "road", stop: "bus-stop", tech: 1920 }),
    joyride: Object.freeze({ kmh: 40, dwellSeconds: 10, congested: true }),
    map: "orthogonal-thin",
  });
  const MODES = Object.freeze({ metro: MODE_METRO, brt: MODE_BRT, bus: MODE_BUS });

  // The mode a line carries, or metro when it carries none (or nonsense): an
  // old plan or sidecar with no mode is a metro line, as it always was.
  function modeOf(line) {
    return MODES[line?.mode] || MODE_METRO;
  }

  // A line's name in each mode: 3号线 / Line 3, 快3线 / BRT 3, 3路 / Route 3.
  function lineName(mode, n) {
    const id = (MODES[mode] || MODE_METRO).id;
    if (id === "brt") return { zh: `快${n}线`, en: `BRT ${n}` };
    if (id === "bus") return { zh: `${n}路`, en: `Route ${n}` };
    return { zh: `${n}号线`, en: `Line ${n}` };
  }

  // A mode's badge in a [-1, 1] box, following drawGlyph's ctx conventions.
  function drawBadge(ctx, mode, x, y, size, color) {
    const id = (MODES[mode] || MODE_METRO).id;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.22;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    if (id === "brt") {
      // An articulated bus from the side: two joined bodies and a bellows.
      ctx.rect(-0.95, -0.5, 0.75, 0.7);
      ctx.rect(0.2, -0.5, 0.75, 0.7);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.2, -0.45); ctx.lineTo(-0.2, 0.15);
      ctx.moveTo(0.1, -0.45); ctx.lineTo(0.1, 0.15);
      ctx.lineWidth = 0.09;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-0.6, 0.28, 0.14, 0, TAU);
      ctx.arc(-0.2, 0.28, 0.14, 0, TAU);
      ctx.arc(0.5, 0.28, 0.14, 0, TAU);
      ctx.fill();
    } else if (id === "bus") {
      // A bus head-on: one body, a wide windscreen and two wheels.
      ctx.rect(-0.68, -0.7, 1.36, 1.4);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(-0.5, -0.5, 1.0, 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-0.36, 0.78, 0.16, 0, TAU);
      ctx.arc(0.36, 0.78, 0.16, 0, TAU);
      ctx.fill();
    } else {
      // A train front: a rounded body with two windows.
      ctx.rect(-0.62, -0.9, 1.24, 1.8);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(-0.42, -0.68, 0.36, 0.5);
      ctx.rect(0.06, -0.68, 0.36, 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.3, 0.9); ctx.lineTo(-0.42, 0.62);
      ctx.moveTo(0.3, 0.9); ctx.lineTo(0.42, 0.62);
      ctx.lineWidth = 0.14;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Where a rubber-tyre line's vehicles are on `tick`. The same formula the
  // city views share: one place per vehicle, plus the tile behind it so a
  // BRT's rear section can stand one tile back along the path.
  function rubberPlaces(line, tick) {
    const mode = line?.mode === "bus" ? "bus" : line?.mode === "brt" ? "brt" : "";
    if (!mode) return [];
    const tiles = Array.isArray(line.tiles) ? line.tiles : [];
    const stops = tiles.length / 2;
    if (stops < 2) return [];
    const count = Math.max(1, Math.min(6, Number(line.vehicles) || 2));
    const t = Number(tick) || 0;
    const places = [];
    for (let index = 0; index < count; index += 1) {
      const phase = (t / (stops * 3) + index / count) % 1;
      const step = Math.floor(phase * stops);
      const x = tiles[step * 2];
      const y = tiles[step * 2 + 1];
      let bx, by;
      if (step > 0) { bx = tiles[(step - 1) * 2]; by = tiles[(step - 1) * 2 + 1]; }
      else {
        const lx = tiles[(stops - 1) * 2], ly = tiles[(stops - 1) * 2 + 1];
        if (Math.abs(lx - x) + Math.abs(ly - y) === 1) { bx = lx; by = ly; }
        else {
          bx = x - Math.sign(tiles[2] - x);
          by = y - Math.sign(tiles[3] - y);
        }
      }
      places.push({ x, y, index, step, behind: { x: bx, y: by } });
    }
    return places;
  }

  const transit = Object.freeze({ VERSION: 1, MODES, modeOf, lineName, drawBadge, rubberPlaces });

  // ----- hand-over: the mayor's view to the street (and to the roots) -------------------
  //
  // v2 carries the pot's identity and the moment the mayor is looking at:
  // the stamped light and season, the date, the weather, the latest paper
  // and the ordinances. No clock is read: the same state gives the same
  // payload, live or decoded from its save, except for the display choices.
  // Rootline ignores news and ordinances.

  const HANDOFF_VERSION = 2;

  function fromCity(sim, state, options = {}) {
    const display = {
      night: options.display?.night === true,
      seasons: options.display?.seasons === true,
      tank: options.display?.tank === true,
    };
    const ref = cityRef(options.record, state);
    const date = dateOfTick(state.tick, state.yearFounded);
    const snapshot = cloneData(sim.buildRenderSnapshot(state));
    // The renderer's change counter is the window's business; a handed-over
    // copy never changes, and a decoded save restarts the counter.
    snapshot.rev = 1;
    snapshot.timeOfDay = display.night ? 0 : 0.5;
    snapshot.season = display.seasons ? date.season : 1;
    const places = gazetteer(snapshot);
    const stories = (Array.isArray(state.newspaper?.stories) ? state.newspaper.stories : []).map((story) => {
      const out = cloneData(story);
      const district = isInt(story?.x) && isInt(story?.y) ? places.districtAt(story.x, story.y) : null;
      if (district) out.place = { districtId: district.id, zh: district.zh, en: district.en };
      return out;
    });
    const enacted = state.ordinances && typeof state.ordinances === "object" ? state.ordinances : {};
    const ids = Array.isArray(sim.ORDINANCE_IDS) ? sim.ORDINANCE_IDS : Object.keys(enacted).sort();
    const from = options.from && Number.isFinite(options.from.x) && Number.isFinite(options.from.y)
      ? { x: Math.round(options.from.x), y: Math.round(options.from.y) }
      : { x: snapshot.spawnCenter?.x ?? 0, y: snapshot.spawnCenter?.y ?? 0 };
    return {
      v: HANDOFF_VERSION,
      ref,
      cityId: ref.cityId, // the same id as ref.cityId, at the top for readers that want it there
      name: ref.name,
      from,
      descend: true,
      osm: ref.source === "osm",
      snapshot,
      hour: display.night ? 0 : 12,
      date,
      weather: cloneData(sim.weatherOf(state)),
      news: { stories },
      ordinances: ids.filter((id) => enacted[id] === true),
      display,
      lines: linesFromState(state),
    };
  }

  function validateHandoff(payload) {
    const errors = [];
    if (!payload || typeof payload !== "object") return { ok: false, errors: ["payload"] };
    if (payload.v !== HANDOFF_VERSION) errors.push("v");
    const ref = payload.ref;
    if (!ref || !(ref.cityId === null || isText(ref.cityId)) || !isText(ref.name) || !["save", "example", "scenario", "osm"].includes(ref.source)) errors.push("ref");
    if (!isText(payload.name)) errors.push("name");
    const size = payload.snapshot?.size;
    if (!isInt(size) || size <= 0 || !payload.snapshot.zone || !payload.snapshot.road) errors.push("snapshot");
    if (!payload.from || !isInt(payload.from.x) || !isInt(payload.from.y) || (isInt(size) && (payload.from.x < 0 || payload.from.y < 0 || payload.from.x >= size || payload.from.y >= size))) errors.push("from");
    if (typeof payload.descend !== "boolean" || typeof payload.osm !== "boolean") errors.push("flags");
    if (payload.hour !== 0 && payload.hour !== 12) errors.push("hour");
    if (payload.snapshot && payload.snapshot.timeOfDay !== (payload.hour === 0 ? 0 : 0.5)) errors.push("timeOfDay");
    const date = payload.date;
    if (!date || !isInt(date.year) || !isInt(date.month) || date.month < 0 || date.month >= MONTHS_PER_YEAR || !isInt(date.day) || date.day < 1 || date.day > DAYS_PER_MONTH || !isInt(date.weekday) || !isInt(date.term)) errors.push("date");
    if (!payload.weather || !isText(payload.weather.type)) errors.push("weather");
    if (!payload.news || !Array.isArray(payload.news.stories) || !payload.news.stories.every((story) => story && isText(story.key))) errors.push("news");
    if (!Array.isArray(payload.ordinances) || !payload.ordinances.every(isText)) errors.push("ordinances");
    const display = payload.display;
    if (!display || typeof display.night !== "boolean" || typeof display.seasons !== "boolean" || typeof display.tank !== "boolean") errors.push("display");
    if (payload.lines !== null && !validateLines(payload.lines).ok) errors.push("lines");
    return { ok: errors.length === 0, errors };
  }

  // ----- letters ------------------------------------------------------------------------
  //
  // The only thing that comes back up from the street: the driver's record as
  // neutral facts (each a key, a tile when it has one, a number) and one line
  // in the player's own words, kept exactly as typed. The system writes no
  // sentence in the driver's voice; shells word the facts from
  // world_letter_<key> strings. A letter changes no number in any city.

  const LETTER_FORMAT = "basin-letter";
  const FACT_KEYS = Object.freeze(["jam", "smog", "crime", "fire", "dark", "rail-wait", "bus-wait", "busted"]);
  const OWN_WORDS_MAX = 140;
  const FACTS_MAX = 16;

  function ownWordsOf(value) {
    if (!isText(value) || !value.trim()) return null;
    return value;
  }

  function coordinate(value) {
    return isInt(value) ? value : null;
  }

  function letterBody(letter) {
    const body = {};
    for (const key of Object.keys(letter)) if (key !== "id") body[key] = letter[key];
    return body;
  }

  // id: hash32 of the canonical letter without its id, as eight hex digits.
  function letterId(letter) {
    return hex32(hash32(canonicalJson(letterBody(letter))));
  }

  function compose(input = {}) {
    const date = input.date || {};
    const address = input.from?.address;
    const letter = {
      format: LETTER_FORMAT,
      v: 1,
      cityId: isText(input.cityId) && input.cityId ? input.cityId : null,
      cityName: isText(input.cityName) ? input.cityName : "",
      date: {
        year: coordinate(date.year),
        month: coordinate(date.month),
        day: coordinate(date.day),
        hour: Number.isFinite(date.hour) ? date.hour : null,
      },
      from: {
        kind: "driver",
        districtId: isText(input.from?.districtId) ? input.from.districtId : null,
        address: address && isText(address.streetKey) && isInt(address.number) ? { streetKey: address.streetKey, number: address.number } : null,
      },
      facts: (Array.isArray(input.facts) ? input.facts : []).map((fact) => ({
        key: fact?.key,
        x: coordinate(fact?.x),
        y: coordinate(fact?.y),
        n: Number.isFinite(fact?.n) ? fact.n : 0,
      })),
      ownWords: ownWordsOf(input.ownWords),
    };
    letter.id = letterId(letter);
    return letter;
  }

  function validateLetter(letter) {
    const errors = [];
    if (!letter || typeof letter !== "object") return { ok: false, errors: ["letter"] };
    if (letter.format !== LETTER_FORMAT) errors.push("format");
    if (letter.v !== 1) errors.push("v");
    if (!(letter.cityId === null || (isText(letter.cityId) && letter.cityId))) errors.push("cityId");
    if (!isText(letter.cityName)) errors.push("cityName");
    const date = letter.date;
    if (!date || !isInt(date.year) || !isInt(date.month) || !isInt(date.day) || !(date.hour === null || Number.isFinite(date.hour))) errors.push("date");
    const from = letter.from;
    if (!from || from.kind !== "driver" || !(from.districtId === null || isText(from.districtId))
      || !(from.address === null || (from.address && isText(from.address.streetKey) && isInt(from.address.number)))) errors.push("from");
    if (!Array.isArray(letter.facts) || letter.facts.length > FACTS_MAX
      || !letter.facts.every((fact) => fact && FACT_KEYS.includes(fact.key) && (fact.x === null || isInt(fact.x)) && (fact.y === null || isInt(fact.y)) && Number.isFinite(fact.n))) errors.push("facts");
    if (!(letter.ownWords === null || (isText(letter.ownWords) && letter.ownWords.length <= OWN_WORDS_MAX))) errors.push("ownWords");
    if (!errors.length) {
      try {
        if (letter.id !== letterId(letter)) errors.push("id");
      } catch {
        errors.push("id");
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // Joyride's own letter (from 5a376d0f6, and its record-and-own-line
  // successor): { from: "joyride", kind: "letter-to-the-mayor", town, writtenAt,
  // text?, facts (an object of totals, or a list of facts), ownWords?, cityId? }.
  function validateJoyrideLetter(letter) {
    const errors = [];
    if (!letter || typeof letter !== "object" || letter.from !== "joyride" || letter.kind !== "letter-to-the-mayor") return { ok: false, errors: ["letter"] };
    const town = letter.town;
    if (!town || typeof town !== "object" || !isText(town.name) || !(town.id == null || isText(town.id))) errors.push("town");
    if (!(letter.cityId == null || isText(letter.cityId))) errors.push("cityId");
    if (!(letter.writtenAt == null || isText(letter.writtenAt))) errors.push("writtenAt");
    if (!(letter.text == null || isText(letter.text))) errors.push("text");
    if (!letter.facts || typeof letter.facts !== "object") errors.push("facts");
    if (!(letter.ownWords == null || (isText(letter.ownWords) && letter.ownWords.length <= OWN_WORDS_MAX))) errors.push("ownWords");
    return { ok: errors.length === 0, errors };
  }

  // ===== SIDE EFFECTS =====================================================================
  //
  // The letterbox. Everything above this fence is pure; postLetter and
  // letterbox are the only members that read or write outside their
  // arguments. They use localStorage only -- "ai-system6-pot-letters" as
  // { [cityId]: [letter + { id, read }] } and Joyride's fallback queue
  // "ai-system6-joyride-letters" -- with every access wrapped. They never open
  // IndexedDB, never touch a city save, and never drop an old letter: a city
  // with 30 unread letters refuses the next one. A letter with no city id
  // waits under "unfiled".

  const LETTERBOX_KEY = "ai-system6-pot-letters";
  const JOYRIDE_QUEUE_KEY = "ai-system6-joyride-letters";
  const UNREAD_MAX = 30;
  const UNFILED = "unfiled";

  function letterStore() {
    try {
      return root.localStorage || null;
    } catch {
      return null;
    }
  }

  // null when the box cannot be read (a box that will not parse is kept as
  // it is rather than overwritten).
  function readBox(store) {
    try {
      const raw = store.getItem(LETTERBOX_KEY);
      if (!raw) return {};
      const box = JSON.parse(raw);
      return box && typeof box === "object" && !Array.isArray(box) ? box : null;
    } catch {
      return null;
    }
  }

  function writeBox(store, box) {
    try {
      store.setItem(LETTERBOX_KEY, JSON.stringify(box));
      return true;
    } catch {
      return false;
    }
  }

  const boxKey = (cityId) => (isText(cityId) && cityId ? cityId : UNFILED);

  // A plain copy of an acceptable letter, its box and its id; or a reason.
  function admit(letter) {
    let copy;
    try {
      copy = JSON.parse(JSON.stringify(letter));
    } catch {
      return { reason: "invalid" };
    }
    if (copy?.format === LETTER_FORMAT) {
      if (!validateLetter(copy).ok) return { reason: "invalid" };
      return { copy, id: copy.id, cityId: boxKey(copy.cityId) };
    }
    if (!validateJoyrideLetter(copy).ok) return { reason: "invalid" };
    delete copy.id;
    delete copy.read;
    return { copy, id: letterId(copy), cityId: boxKey(copy.cityId || copy.town.cityId || copy.town.id) };
  }

  // { ok: true, cityId, id } when stored (or already in the box), else
  // { ok: false, reason: "invalid" | "full" | "storage" }.
  function post(letter) {
    const admitted = admit(letter);
    if (admitted.reason) return { ok: false, reason: admitted.reason };
    const store = letterStore();
    const box = store ? readBox(store) : null;
    if (!box) return { ok: false, reason: "storage" };
    const { copy, id, cityId } = admitted;
    const list = Array.isArray(box[cityId]) ? box[cityId] : [];
    if (list.some((entry) => entry?.id === id)) return { ok: true, cityId, id };
    if (list.filter((entry) => entry && !entry.read).length >= UNREAD_MAX) return { ok: false, reason: "full" };
    box[cityId] = [...list, { ...copy, id, read: false }];
    return writeBox(store, box) ? { ok: true, cityId, id } : { ok: false, reason: "storage" };
  }

  function postLetter(letter) {
    return post(letter).ok === true;
  }

  function list(cityId) {
    const store = letterStore();
    const box = store ? readBox(store) : null;
    const entries = box && Array.isArray(box[boxKey(cityId)]) ? box[boxKey(cityId)] : [];
    return JSON.parse(JSON.stringify(entries));
  }

  // Marks the given letters read; returns how many changed.
  function markRead(cityId, ids) {
    const wanted = new Set(Array.isArray(ids) ? ids : [ids]);
    const store = letterStore();
    const box = store ? readBox(store) : null;
    const entries = box && Array.isArray(box[boxKey(cityId)]) ? box[boxKey(cityId)] : null;
    if (!entries) return 0;
    let changed = 0;
    for (const entry of entries) {
      if (entry && !entry.read && wanted.has(entry.id)) {
        entry.read = true;
        changed += 1;
      }
    }
    return changed && writeBox(store, box) ? changed : 0;
  }

  // Moves the letters Joyride queued while this file was not loaded into the
  // box; only the letters moved leave the queue. Returns how many moved.
  function drainJoyrideQueue() {
    const store = letterStore();
    if (!store) return 0;
    let queue;
    try {
      queue = JSON.parse(store.getItem(JOYRIDE_QUEUE_KEY) || "[]");
    } catch {
      return 0;
    }
    if (!Array.isArray(queue) || !queue.length) return 0;
    const kept = [];
    let moved = 0;
    for (const letter of queue) {
      if (post(letter).ok) moved += 1;
      else kept.push(letter);
    }
    if (!moved) return 0;
    try {
      if (kept.length) store.setItem(JOYRIDE_QUEUE_KEY, JSON.stringify(kept));
      else store.removeItem(JOYRIDE_QUEUE_KEY);
    } catch {
      // The moved letters are in the box; left in the queue too, they are
      // recognised by id and not stored twice on the next drain.
    }
    return moved;
  }

  // ===== END SIDE EFFECTS =================================================================

  root.AISystem6PotWorld = Object.freeze({
    CANON_VERSION,
    WORLD,
    hash32,
    cityRef,
    sealBits,
    names: Object.freeze({ city: cityName, neighbor, NEIGHBORS }),
    gazetteer,
    calendar: Object.freeze({ TICKS_PER_DAY, DAYS_PER_MONTH, MONTHS_PER_YEAR, EPOCH_YEAR, dateOfTick, TERMS }),
    hours: Object.freeze({ bump, activity, periodOf, originWeight, destinationWeights, roadTraffic }),
    landUse: Object.freeze({ KINDS, kindOfZone, kindOfFacility, drawGlyph }),
    money: Object.freeze({ group }),
    sound: Object.freeze({ keyOf, pentatonic }),
    handoff: Object.freeze({ VERSION: HANDOFF_VERSION, fromCity, validate: validateHandoff }),
    people: Object.freeze({ atTile, households, homeFor }),
    plans: Object.freeze({ FORMAT: PLAN_FORMAT, VERSION: 1, validate: validatePlan, canonical: planCanonical, digest: planDigest }),
    lines: Object.freeze({ VERSION: 1, validate: validateLines, fromState: linesFromState, check: checkLines }),
    transit,
    letters: Object.freeze({ FORMAT: LETTER_FORMAT, VERSION: 1, FACT_KEYS, OWN_WORDS_MAX, compose, validate: validateLetter }),
    postLetter,
    letterbox: Object.freeze({ post, list, markRead, drainJoyrideQueue }),
  });
})(globalThis);
